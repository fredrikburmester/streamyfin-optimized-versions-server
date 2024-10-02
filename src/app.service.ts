import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';

export interface Job {
  id: string;
  status: 'queued' | 'optimizing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputPath: string;
  inputUrl: string;
  deviceId: string;
  itemId: string;
  timestamp: Date;
  size: number;
  item: any;
  speed?: number;
}

@Injectable()
export class AppService {
  private activeJobs: Job[] = [];
  private ffmpegProcesses: Map<string, ChildProcess> = new Map();
  private videoDurations: Map<string, number> = new Map();
  private jobQueue: string[] = [];
  private maxConcurrentJobs: number;
  private cacheDir: string;

  constructor(
    private logger: Logger,
    private configService: ConfigService,
  ) {
    this.cacheDir = path.join(process.cwd(), 'cache');
    this.maxConcurrentJobs = this.configService.get<number>(
      'MAX_CONCURRENT_JOBS',
      1,
    );

    // Ensure the cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async downloadAndCombine(
    url: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fileExtension: string,
    deviceId: string,
    itemId: string,
    item: any,
  ): Promise<string> {
    const jobId = uuidv4();
    const outputPath = path.join(this.cacheDir, `combined_${jobId}.mp4`);

    this.logger.log(
      `Queueing job ${jobId.padEnd(36)} | URL: ${(url.slice(0, 50) + '...').padEnd(53)} | Path: ${outputPath}`,
    );

    this.activeJobs.push({
      id: jobId,
      status: 'queued',
      progress: 0,
      outputPath,
      inputUrl: url,
      itemId,
      item,
      deviceId,
      timestamp: new Date(),
      size: 0,
    });

    this.jobQueue.push(jobId);
    this.checkQueue(); // Check if we can start the job immediately

    return jobId;
  }

  getJobStatus(jobId: string): Job | null {
    const job = this.activeJobs.find((job) => job.id === jobId);
    return job || null;
  }

  getAllJobs(deviceId?: string | null): Job[] {
    if (!deviceId) {
      return this.activeJobs;
    }
    return this.activeJobs.filter((job) => job.deviceId === deviceId);
  }

  async deleteCache(): Promise<{ message: string }> {
    try {
      const files = await fsPromises.readdir(this.cacheDir);
      await Promise.all(
        files.map((file) => fsPromises.unlink(path.join(this.cacheDir, file))),
      );
      return {
        message: 'Cache deleted successfully',
      };
    } catch (error) {
      this.logger.error('Error deleting cache:', error);
      throw new InternalServerErrorException('Failed to delete cache');
    }
  }

  cancelJob(jobId: string): boolean {
    const job = this.activeJobs.find((job) => job.id === jobId);
    const process = this.ffmpegProcesses.get(jobId);
    if (process) {
      process.kill('SIGKILL');
      this.ffmpegProcesses.delete(jobId);
    }

    if (job) {
      this.jobQueue = this.jobQueue.filter((id) => id !== jobId);
      this.activeJobs = this.activeJobs.filter((job) => job.id !== jobId);
    }

    this.checkQueue();

    this.logger.log(`Job ${jobId} canceled`);
    return true;
  }

  getTranscodedFilePath(jobId: string): string | null {
    const job = this.activeJobs.find((job) => job.id === jobId);
    if (job && job.status === 'completed') {
      return job.outputPath;
    }
    return null;
  }

  cleanupJob(jobId: string): void {
    this.activeJobs = this.activeJobs.filter((job) => job.id !== jobId);
    this.ffmpegProcesses.delete(jobId);
    this.videoDurations.delete(jobId);
  }

  async getStatistics() {
    const cacheSize = await this.getCacheSize();
    const totalTranscodes = this.getTotalTranscodes();
    const activeJobs = this.getActiveJobs();
    const completedJobs = this.getCompletedJobs();
    const uniqueDevices = this.getUniqueDevices();

    return {
      cacheSize,
      totalTranscodes,
      activeJobs,
      completedJobs,
      uniqueDevices,
    };
  }

  private async getCacheSize(): Promise<string> {
    const cacheSize = await this.getDirectorySize(this.cacheDir);
    return this.formatSize(cacheSize);
  }

  private async getDirectorySize(directory: string): Promise<number> {
    const files = await fs.promises.readdir(directory);
    const stats = await Promise.all(
      files.map((file) => fs.promises.stat(path.join(directory, file))),
    );

    return stats.reduce((accumulator, { size }) => accumulator + size, 0);
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  private getTotalTranscodes(): number {
    return this.activeJobs.length;
  }

  private getActiveJobs(): number {
    return this.activeJobs.filter((job) => job.status === 'optimizing').length;
  }

  private getCompletedJobs(): number {
    return this.activeJobs.filter((job) => job.status === 'completed').length;
  }

  private getUniqueDevices(): number {
    const devices = new Set(this.activeJobs.map((job) => job.deviceId));
    return devices.size;
  }

  private checkQueue() {
    const runningJobs = Array.from(this.activeJobs.values()).filter(
      (job) => job.status === 'optimizing',
    ).length;

    while (runningJobs < this.maxConcurrentJobs && this.jobQueue.length > 0) {
      const nextJobId = this.jobQueue.shift();
      if (nextJobId) {
        this.startJob(nextJobId);
      }
    }
  }

  private startJob(jobId: string) {
    const job = this.activeJobs.find((job) => job.id === jobId);
    if (job) {
      job.status = 'optimizing';
      const ffmpegArgs = this.getFfmpegArgs(job.inputUrl, job.outputPath);
      this.startFFmpegProcess(jobId, ffmpegArgs);
      this.logger.log(`Started job ${jobId}`);
    }
  }

  private getFfmpegArgs(inputUrl: string, outputPath: string): string[] {
    return [
      '-i',
      inputUrl,
      '-c',
      'copy', // Copy both video and audio without re-encoding
      '-movflags',
      '+faststart', // Optimize for web streaming
      '-f',
      'mp4', // Force MP4 container
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

        ffmpegProcess.on('close', async (code) => {
          this.ffmpegProcesses.delete(jobId);
          this.videoDurations.delete(jobId);

          const job = this.activeJobs.find((job) => job.id === jobId);
          if (!job) {
            // Job was cancelled and removed, just resolve
            resolve();
            return;
          }

          if (code === 0) {
            job.status = 'completed';
            job.progress = 100;
            // Update the file size
            try {
              const stats = await fsPromises.stat(job.outputPath);
              job.size = stats.size;
            } catch (error) {
              this.logger.error(
                `Error getting file size for job ${jobId}: ${error.message}`,
              );
            }
            this.logger.log(
              `Job ${jobId} completed successfully. Output: ${job.outputPath}, Size: ${this.formatSize(job.size || 0)}`,
            );
            resolve();
          } else {
            job.status = 'failed';
            job.progress = 0;
            this.logger.error(
              `Job ${jobId} failed with exit code ${code}. Input URL: ${job.inputUrl}`,
            );
            reject(new Error(`FFmpeg process failed with exit code ${code}`));
          }
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
      const job = this.activeJobs.find((job) => job.id === jobId);
      if (job) {
        job.status = 'failed';
      }
    } finally {
      // Check queue after job completion or failure
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
    const speedMatch = ffmpegOutput.match(/speed=(\d+\.?\d*)x/);

    if (progressMatch) {
      const [, hours, minutes, seconds] = progressMatch;
      const currentTime =
        parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);

      const totalDuration = this.videoDurations.get(jobId);
      if (totalDuration) {
        const progress = Math.min((currentTime / totalDuration) * 100, 99.9);
        const job = this.activeJobs.find((job) => job.id === jobId);
        if (job) {
          job.progress = Math.max(progress, 0);

          // Update speed if available
          if (speedMatch) {
            const speed = parseFloat(speedMatch[1]);
            job.speed = Math.max(speed, 0);
          }
        }
      }
    }
  }
}
