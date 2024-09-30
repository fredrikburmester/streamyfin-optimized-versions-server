import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppService } from '../app.service';
import * as fs from 'fs';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly appService: AppService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    this.logger.log('Running cleanup job...');
    const jobs = this.appService.getAllJobs();
    const now = new Date();

    for (const job of jobs) {
      if (
        job.status === 'completed' &&
        this.isOlderThanOneHour(job.timestamp, now)
      ) {
        this.removeTranscodedFile(job.outputPath);
        this.appService.cleanupJob(job.id);
      }
    }
  }

  private isOlderThanOneHour(timestamp: Date, now: Date): boolean {
    const oneHourInMs = 60 * 60 * 1000;
    return now.getTime() - timestamp.getTime() > oneHourInMs;
  }

  private removeTranscodedFile(filePath: string) {
    try {
      fs.unlinkSync(filePath);
      this.logger.log(`Removed file: ${filePath}`);
    } catch (error) {
      this.logger.error(`Error removing file ${filePath}: ${error.message}`);
    }
  }
}
