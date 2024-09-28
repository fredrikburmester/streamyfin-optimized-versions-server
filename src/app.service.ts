import { Injectable } from '@nestjs/common';
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
    const job = this.activeHLSJobs.get(jobId);
    const process = this.ffmpegProcesses.get(jobId);
    if (job && job.status === 'running' && process) {
      process.kill();
      job.status = 'cancelled';
      this.ffmpegProcesses.delete(jobId);
      return true;
    }
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

    let ffmpegArgs: string[];

    if (this.isAppleSilicon()) {
      // Apple Silicon (M1/M2) configuration
      ffmpegArgs = [
        '-i',
        hlsUrl,
        '-c:v',
        'h264_videotoolbox', // Use VideoToolbox for hardware acceleration
        '-preset',
        'fast',
        '-c:a',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        outputPath,
      ];
    } else if (this.isIntelQuickSyncAvailable()) {
      // Intel QuickSync configuration
      ffmpegArgs = [
        '-i',
        hlsUrl,
        '-c:v',
        'h264_qsv', // Use QuickSync for hardware acceleration
        '-preset',
        'fast',
        '-c:a',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        outputPath,
      ];
    } else {
      // Default configuration (software encoding)
      ffmpegArgs = [
        '-i',
        hlsUrl,
        '-c',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        outputPath,
      ];
    }

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

  private isAppleSilicon(): boolean {
    return os.platform() === 'darwin' && os.arch() === 'arm64';
  }

  private isIntelQuickSyncAvailable(): boolean {
    // This is a simplified check. In a real-world scenario, you might want to use
    // a more robust method to detect QuickSync availability.
    return os.platform() === 'linux' && process.env.USE_QUICK_SYNC === 'true';
  }

  private startFFmpegProcess(jobId: string, ffmpegArgs: string[]): void {
    // First, get the duration of the input video
    this.getVideoDuration(ffmpegArgs[1], jobId).then(() => {
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      this.ffmpegProcesses.set(jobId, ffmpegProcess);

      ffmpegProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });

      ffmpegProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        this.updateProgress(jobId, data.toString());
      });

      ffmpegProcess.on('close', (code) => {
        const job = this.activeHLSJobs.get(jobId);
        if (job) {
          job.status = code === 0 ? 'completed' : 'failed';
          job.progress = 100;
        }
        console.log(`Job ${jobId} ${job.status}. Output: ${job.outputPath}`);

        this.ffmpegProcesses.delete(jobId);
        this.videoDurations.delete(jobId);
      });
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
