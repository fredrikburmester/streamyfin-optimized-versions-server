import { AppService, HLSJobStatus } from './app.service';
import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  NotFoundException,
  Res,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import { Response } from 'express';
import { unlink } from 'fs/promises';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private configService: ConfigService,
    private logger: Logger, // Inject Logger
  ) {}

  @Post('optimize-version')
  async downloadAndCombine(@Body('url') url: string): Promise<{ id: string }> {
    this.logger.log(`Optimize request for URL: ${url.slice(0, 50)}...`);

    let jellyfinUrl = process.env.JELLYFIN_URL;

    let finalUrl: string;

    if (jellyfinUrl) {
      jellyfinUrl = jellyfinUrl.replace(/\/$/, '');
      // If JELLYFIN_URL is set, use it to replace the base of the incoming URL
      const parsedUrl = new URL(url);
      finalUrl = new URL(
        parsedUrl.pathname + parsedUrl.search,
        jellyfinUrl,
      ).toString();
    } else {
      // If JELLYFIN_URL is not set, use the incoming URL as is
      finalUrl = url;
    }

    const id = await this.appService.downloadAndCombine(finalUrl);
    return { id };
  }

  @Get('job-status/:id')
  async getActiveHLSJob(@Param('id') id: string): Promise<HLSJobStatus | null> {
    return this.appService.getJobStatus(id);
  }

  @Delete('cancel-job/:id')
  async cancelHLSJob(@Param('id') id: string) {
    this.logger.log(`Cancellation request for job: ${id}`);

    const result = this.appService.cancelJob(id);
    if (result) {
      return { message: 'Job cancelled successfully' };
    } else {
      return { message: 'Job not found or already completed' };
    }
  }

  @Get('all-jobs')
  async getAllHLSJobs() {
    return this.appService.getAllJobs();
  }

  @Get('download/:id')
  async downloadTranscodedFile(@Param('id') id: string, @Res() res: Response) {
    const filePath = this.appService.getTranscodedFilePath(id);

    if (!filePath) {
      throw new NotFoundException('File not found or job not completed');
    }

    const stat = fs.statSync(filePath);

    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=transcoded_${id}.mp4`,
    );

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Wait for the file to finish sending
    await new Promise((resolve) => {
      res.on('finish', resolve);
    });

    // Delete the file after it has been sent
    try {
      await unlink(filePath);
      this.logger.log(`Successfully deleted ${filePath}`);
    } catch (error) {
      this.logger.error(`Error deleting file ${filePath}:`, error);
    }

    // Update the job status or remove it from the active jobs
    this.appService.cleanupJob(id);
  }
}
