import { Injectable, Logger } from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as os from 'os';

export interface HLSJobStatus {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputPath: string;
}

@Injectable()
export class AppService {
  constructor(private logger: Logger) {} // Inject Logger

  private activeHLSJobs: Map<string, HLSJobStatus> = new Map();
  private ffmpegProcesses: Map<string, ChildProcess> = new Map();
  private videoDurations: Map<string, number> = new Map();

  getHLSJobStatus(jobId: string): HLSJobStatus | null {
    return this.activeHLSJobs.get(jobId) || null;
  }

  getAllHLSJobs(): Map<string, HLSJobStatus> {
    return this.activeHLSJobs;
  }

  cancelJob(jobId: string): boolean {
    this.logger.log(`Attempting to cancel job: ${jobId}`);

    const job = this.activeHLSJobs.get(jobId);
    const process = this.ffmpegProcesses.get(jobId);
    if (job && job.status === 'running' && process) {
      process.kill();
      job.status = 'cancelled';
      this.ffmpegProcesses.delete(jobId);

      // Clean up the job after cancellation
      this.cleanupJob(jobId);

      this.logger.log(`Job ${jobId} cancelled successfully`);

      return true;
    }

    this.logger.log(`Job ${jobId} not found or not running`);
    return false;
  }

  getTranscodedFilePath(jobId: string): string | null {
    const job = this.activeHLSJobs.get(jobId);
    if (job && job.status === 'completed') {
      return job.outputPath;
    }
    return null;
  }

  cleanupJob(jobId: string): void {
    this.activeHLSJobs.delete(jobId);
    this.ffmpegProcesses.delete(jobId);
    this.videoDurations.delete(jobId);
  }

  async downloadAndCombine(hlsUrl: string): Promise<string> {
    const jobId = uuidv4();
    const outputPath = path.join(os.tmpdir(), `combined_${jobId}.mp4`);

    this.logger.log(`Starting job ${jobId} for URL: ${hlsUrl}`);

    // Simplified FFmpeg command for combining HLS segments
    const ffmpegArgs = [
      '-i',
      hlsUrl,
      '-c',
      'copy', // Copy both video and audio without re-encoding
      '-bsf:a',
      'aac_adtstoasc', // Fix audio stream for MP4 container if needed
      '-movflags',
      'faststart', // Optimize for web playback
      outputPath,
    ];

    this.activeHLSJobs.set(jobId, {
      status: 'running',
      progress: 0,
      outputPath,
    });

    // Start the FFmpeg process in the background
    this.startFFmpegProcess(jobId, ffmpegArgs);

    // Immediately return the job ID
    return jobId;
  }

  private startFFmpegProcess(jobId: string, ffmpegArgs: string[]): void {
    // First, get the duration of the input video
    this.getVideoDuration(ffmpegArgs[1], jobId)
      .then(() => {
        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
        this.ffmpegProcesses.set(jobId, ffmpegProcess);

        ffmpegProcess.stderr.on('data', (data) => {
          this.updateProgress(jobId, data.toString());
        });

        ffmpegProcess.on('close', (code) => {
          const job = this.activeHLSJobs.get(jobId);
          if (job) {
            job.status = code === 0 ? 'completed' : 'failed';
            job.progress = 100;
            this.logger.log(
              `Job ${jobId} ${job.status}. Output: ${job.outputPath}`,
            );
          } else {
            this.logger.warn(`Job ${jobId} not found on completion`);
          }

          this.ffmpegProcesses.delete(jobId);
          this.videoDurations.delete(jobId);
        });
      })
      .catch((error) => {
        this.logger.error(
          `Error getting video duration for job ${jobId}: ${error.message}`,
        );
        const job = this.activeHLSJobs.get(jobId);
        if (job) {
          job.status = 'failed';
        }
      });
  }

  private async getVideoDuration(
    inputUrl: string,
    jobId: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputUrl,
      ]);

      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(output.trim());
          this.videoDurations.set(jobId, duration);
          resolve();
        } else {
          reject(new Error(`ffprobe process exited with code ${code}`));
        }
      });
    });
  }

  private updateProgress(jobId: string, ffmpegOutput: string): void {
    const progressMatch = ffmpegOutput.match(
      /time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/,
    );
    if (progressMatch) {
      const [, hours, minutes, seconds] = progressMatch;
      const currentTime =
        parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);

      const totalDuration = this.videoDurations.get(jobId);
      if (totalDuration) {
        const progress = Math.min((currentTime / totalDuration) * 100, 99.9);
        const job = this.activeHLSJobs.get(jobId);
        if (job) {
          job.progress = progress;
        }
      }
    }
  }
}
