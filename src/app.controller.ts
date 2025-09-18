import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  HttpException,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import { AppService, Job } from './app.service';
import { log } from 'console';

interface RangeRequest {
  start: number;
  end: number;
  total: number;
}

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private logger: Logger,
  ) { this.logger = new Logger('ApiRequest'); }

  @Get('statistics')
  async getStatistics() {
    return this.appService.getStatistics();
  }

  @Post('optimize-version')
  async downloadAndCombine(
    @Body('url') url: string,
    @Body('fileExtension') fileExtension: string,
    @Body('deviceId') deviceId: string,
    @Body('itemId') itemId: string,
    @Body('item') item: any,
  ): Promise<{ id: string }> {
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

    const id = await this.appService.downloadAndCombine(
      finalUrl,
      fileExtension,
      deviceId,
      itemId,
      item,
    );
    return { id };
  }

  @Get('job-status/:id')
  async getActiveJob(@Param('id') id: string): Promise<Job | null> {
    return this.appService.getJobStatus(id);
  }

  @Post('start-job/:id')
  async startJob(@Param('id') id: string): Promise<{ message: string }> {
    this.logger.log(`Manual start request for job: ${id}`);

    try {
      const result = await this.appService.manuallyStartJob(id);
      if (result) {
        return { message: 'Job started successfully' };
      } else {
        throw new HttpException(
          'Job not found or already started',
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('cancel-job/:id')
  async cancelJob(@Param('id') id: string) {
    this.logger.log(`Cancellation request for job: ${id}`);
    // this.appService.completeJob(id);
    const result = this.appService.cancelJob(id);
    if (result) {
      return { message: 'Job cancelled successfully' };
    } else {
      return { message: 'Job not found or already completed' };
    }
  }

  @Get('all-jobs')
  async getAllJobs(@Query('deviceId') deviceId?: string) {
    return this.appService.getAllJobs(deviceId);
  }

  @Get('download/:id')
  async downloadTranscodedFile(
    @Param('id') id: string,
    @Headers('range') rangeHeader: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filePath = this.appService.getTranscodedFilePath(id);

    if (!filePath) {
      throw new NotFoundException('File not found or job not completed');
    }

    const stat = fs.statSync(filePath);
    const range = this.appService.parseRangeHeader(rangeHeader, stat.size);

    // Validate file integrity before sending
    const { isValid, checksum } = await this.appService.validateFileIntegrity(filePath, stat.size);
    if (!isValid) {
      throw new HttpException('File integrity check failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Add checksum to response headers
    res.setHeader('X-File-Checksum', checksum);
    res.setHeader('X-File-Size', stat.size);

    if (range) {
      // Handle partial content request
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${range.total}`);
      res.setHeader('Content-Length', range.end - range.start + 1);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'video/mp4');
      
      const fileStream = fs.createReadStream(filePath, {
        start: range.start,
        end: range.end
      });
      
      this.logger.log(`Partial download started for ${filePath}`);

      return new Promise((resolve, reject) => {
        fileStream.pipe(res);
        fileStream.on('end', () => {
          this.logger.log(`Partial download completed for ${filePath}`);
          if (range.end === stat.size - 1) {
            this.logger.log(`Download completed for ${filePath}`);
            this.appService.completeJob(id);
          }
          resolve(null);
        });
        fileStream.on('error', (err) => {
          this.logger.error(`Error streaming partial file ${filePath}: ${err.message}`);
          reject(err);
        });
      });
    } else {
      // Handle full file request
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      
      this.logger.log(`Full download started for ${filePath}`);

      const fileStream = fs.createReadStream(filePath);
      return new Promise((resolve, reject) => {
        fileStream.pipe(res);
        fileStream.on('end', () => {
          this.logger.log(`Full download completed for ${filePath}`);
          this.appService.cancelJob(id);
          resolve(null);
        });
        fileStream.on('error', (err) => {
          this.logger.error(`Error streaming file ${filePath}: ${err.message}`);
          reject(err);
        });
      });
    }
  }

  @Delete('delete-cache')
  async deleteCache() {
    this.logger.log('Cache deletion request');
    return this.appService.deleteCache();
  }
}
