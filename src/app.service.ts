import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class AppService {
  private activeJobs: Map<string, { process: any; status: string }> = new Map();

  private isAppleSilicon(): boolean {
    return os.platform() === 'darwin' && os.arch() === 'arm64';
  }

  getHello(): string {
    return 'Hello World!';
  }

  async startTranscodingJob(filePath: string, id: string): Promise<string> {
    const jobId = uuidv4();
    const useQuickSync = process.env.USE_QUICK_SYNC === 'true';
    const isAppleSilicon = this.isAppleSilicon();

    const dir = path.dirname(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    const outputPath = path.join(dir, `${name}_optimized_${id}.mp4`);

    const commonArgs = [
      '-i',
      filePath,
      '-vf',
      "scale='min(1280,iw)':'-2'",
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      '-metadata',
      'title=',
      '-metadata',
      'comment=',
      '-max_muxing_queue_size',
      '9999',
    ];

    let ffmpegArgs: string[];

    if (isAppleSilicon) {
      ffmpegArgs = [
        ...commonArgs,
        '-c:v',
        'h264_videotoolbox',
        '-b:v',
        '2M',
        '-maxrate',
        '2.5M',
        '-bufsize',
        '5M',
        '-tag:v',
        'avc1',
        '-profile:v',
        'main',
        '-level',
        '3.1',
        outputPath,
      ];
    } else if (useQuickSync) {
      ffmpegArgs = [
        '-hwaccel',
        'qsv',
        ...commonArgs,
        '-c:v',
        'h264_qsv',
        '-preset',
        'veryfast',
        '-b:v',
        '2M',
        '-maxrate',
        '2.5M',
        '-bufsize',
        '5M',
        '-profile:v',
        'main',
        '-level',
        '3.1',
        outputPath,
      ];
    } else {
      ffmpegArgs = [
        ...commonArgs,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-profile:v',
        'main',
        '-level',
        '3.1',
        '-tune',
        'fastdecode,zerolatency',
        outputPath,
      ];
    }

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    this.activeJobs.set(jobId, { process: ffmpegProcess, status: 'running' });

    ffmpegProcess.stdout.on('data', (data) => {
      console.log(`[${jobId}] stdout: ${data}`);
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(`[${jobId}] stderr: ${data}`);
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`[${jobId}] child process exited with code ${code}`);
      this.activeJobs.delete(jobId);
    });

    return `Transcoding job started. Job ID: ${jobId}. Output will be: ${outputPath}`;
  }

  cancelTranscodingJob(jobId: string): string {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.process.kill('SIGTERM');
      this.activeJobs.delete(jobId);
      return `Transcoding job ${jobId} has been cancelled.`;
    }
    return `No active job found with ID ${jobId}.`;
  }

  getActiveJobs(): string[] {
    return Array.from(this.activeJobs.keys());
  }
}
