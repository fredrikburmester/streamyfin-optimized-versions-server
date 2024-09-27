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
} from '@nestjs/common';
import * as fs from 'fs';
import { Response } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('optimize-version')
  async downloadHLS(@Body('url') url: string): Promise<{ id: string }> {
    const id = await this.appService.downloadAndCombineHLS(url);
    return { id };
  }

  @Get('job-status/:id')
  async getActiveHLSJob(@Param('id') id: string): Promise<HLSJobStatus | null> {
    return this.appService.getHLSJobStatus(id);
  }

  @Delete('cancel-job/:id')
  async cancelHLSJob(@Param('id') id: string) {
    const result = this.appService.cancelHLSJob(id);
    if (result) {
      return { message: 'Job cancelled successfully' };
    } else {
      return { message: 'Job not found or already completed' };
    }
  }

  @Get('all-jobs')
  async getAllHLSJobs() {
    return this.appService.getAllHLSJobs();
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
  }
}
