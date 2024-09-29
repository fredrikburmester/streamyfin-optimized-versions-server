import { Injectable, Logger } from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as os from 'os';
import { ConfigService } from '@nestjs/config';

export interface HLSJobStatus {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputPath: string;
  inputUrl: string;
}

@Injectable()
export class AppService {
  constructor(
    private logger: Logger,
    private configService: ConfigService,
  ) {
    this.maxConcurrentJobs = this.configService.get<number>(
      'MAX_CONCURRENT_JOBS',
      1,
    );
  }

  private activeJobs: Map<string, HLSJobStatus> = new Map();
  private ffmpegProcesses: Map<string, ChildProcess> = new Map();
  private videoDurations: Map<string, number> = new Map();
  private jobQueue: string[] = [];
  private maxConcurrentJobs: number;

  getJobStatus(jobId: string): HLSJobStatus | null {
    return this.activeJobs.get(jobId) || null;
  }

  getAllJobs(): Map<string, HLSJobStatus> {
    return this.activeJobs;
  }

  cancelJob(jobId: string): boolean {
    this.logger.log(`Attempting to cancel job: ${jobId}`);

    const job = this.activeJobs.get(jobId);
    const process = this.ffmpegProcesses.get(jobId);
    if (
      job &&
      (job.status === 'running' || job.status === 'queued') &&
      process
    ) {
      process.kill();
      this.ffmpegProcesses.delete(jobId);

      job.status = 'cancelled';

      // Remove from queue if it was queued
      this.jobQueue = this.jobQueue.filter((id) => id !== jobId);

      // Clean up the job after cancellation
      this.cleanupJob(jobId);

      this.logger.log(`Job ${jobId} cancelled successfully`);

      // Check queue after cancellation
      this.checkQueue();

      return true;
    }

    this.logger.log(`Job ${jobId} not found or not running/queued`);
    return false;
  }

  getTranscodedFilePath(jobId: string): string | null {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === 'completed') {
      return job.outputPath;
    }
    return null;
  }

  cleanupJob(jobId: string): void {
    this.activeJobs.delete(jobId);
    this.ffmpegProcesses.delete(jobId);
    this.videoDurations.delete(jobId);
  }

  async downloadAndCombine(url: string): Promise<string> {
    const jobId = uuidv4();
    const outputPath = path.join(os.tmpdir(), `combined_${jobId}.mp4`);

    this.logger.log(`Queueing job ${jobId} for URL: ${url.slice(0, 50)}...`);

    this.activeJobs.set(jobId, {
      status: 'queued',
      progress: 0,
      outputPath,
      inputUrl: url,
    });

    this.jobQueue.push(jobId);
    this.checkQueue(); // Check if we can start the job immediately

    return jobId;
  }

  private checkQueue() {
    const runningJobs = Array.from(this.activeJobs.values()).filter(
      (job) => job.status === 'running',
    ).length;

    while (runningJobs < this.maxConcurrentJobs && this.jobQueue.length > 0) {
      const nextJobId = this.jobQueue.shift();
      if (nextJobId) {
        this.startJob(nextJobId);
      }
    }
  }

  private startJob(jobId: string) {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.status = 'running';
      const ffmpegArgs = this.getFfmpegArgs(job.inputUrl, job.outputPath);
      this.startFFmpegProcess(jobId, ffmpegArgs);
    }
  }

  private getFfmpegArgs(inputUrl: string, outputPath: string): string[] {
    return [
      '-i',
      inputUrl,
      '-c',
      'copy',
      '-bsf:a',
      'aac_adtstoasc',
      '-movflags',
      'faststart',
      outputPath,
    ];
  }

  private async startFFmpegProcess(
    jobId: string,
    ffmpegArgs: string[],
  ): Promise<void> {
    try {
      await this.getVideoDuration(ffmpegArgs[1], jobId);

      return new Promise((resolve, reject) => {
        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
        this.ffmpegProcesses.set(jobId, ffmpegProcess);

        ffmpegProcess.stderr.on('data', (data) => {
          this.updateProgress(jobId, data.toString());
        });

        ffmpegProcess.on('close', (code) => {
          const job = this.activeJobs.get(jobId);
          if (job) {
            job.status = code === 0 ? 'completed' : 'failed';
            job.progress = 100;
            this.logger.log(
              `Job ${jobId} ${job.status}. Output: ${job.outputPath}`,
            );
          }

          this.ffmpegProcesses.delete(jobId);
          this.videoDurations.delete(jobId);

          // Check queue after job completion
          this.checkQueue();

          resolve();
        });

        ffmpegProcess.on('error', (error) => {
          this.logger.error(
            `FFmpeg process error for job ${jobId}: ${error.message}`,
          );
          reject(error);
        });
      });
    } catch (error) {
      this.logger.error(`Error processing job ${jobId}: ${error.message}`);
      const job = this.activeJobs.get(jobId);
      if (job) {
        job.status = 'failed';
      }

      // Check queue after job failure
      this.checkQueue();
    }
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
        const job = this.activeJobs.get(jobId);
        if (job) {
          job.progress = progress;
        }
      }
    }
  }
}
