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

  private isAppleSilicon(): boolean {
    return os.platform() === 'darwin' && os.arch() === 'arm64';
  }

  private isIntelQuickSyncAvailable(): boolean {
    // This is a simplified check. In a real-world scenario, you might want to use
    // a more robust method to detect QuickSync availability.
    return os.platform() === 'linux' && process.env.USE_QUICK_SYNC === 'true';
  }

  async downloadAndCombineHLS(hlsUrl: string): Promise<string> {
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

  private startFFmpegProcess(jobId: string, ffmpegArgs: string[]): void {
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    this.ffmpegProcesses.set(jobId, ffmpegProcess);

    ffmpegProcess.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
      const progressMatch = data
        .toString()
        .match(/time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/);
      if (progressMatch) {
        const [, hours, minutes, seconds] = progressMatch;
        const currentTime =
          parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
        // Assume 1 hour duration for simplicity. Adjust as needed.
        const progress = Math.min((currentTime / 3600) * 100, 100);
        const job = this.activeHLSJobs.get(jobId);
        if (job) {
          job.progress = progress;
        }
      }
    });

    ffmpegProcess.on('close', (code) => {
      const job = this.activeHLSJobs.get(jobId);
      if (job) {
        job.status = code === 0 ? 'completed' : 'failed';
        job.progress = 100;
      }
      console.log(`Job ${jobId} ${job.status}. Output: ${job.outputPath}`);

      this.ffmpegProcesses.delete(jobId);
    });
  }

  getHLSJobStatus(jobId: string): HLSJobStatus | null {
    return this.activeHLSJobs.get(jobId) || null;
  }

  cancelHLSJob(jobId: string): boolean {
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
}
