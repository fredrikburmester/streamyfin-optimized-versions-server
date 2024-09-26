import { AppService } from './app.service';
import { Controller, Get, Post, Body, Delete, Param } from '@nestjs/common';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('optimize-version')
  async optimizeVersion(@Body('path') path: string, @Body('id') id: string) {
    return this.appService.startTranscodingJob(path, id);
  }

  @Delete('cancel-transcode/:jobId')
  cancelTranscode(@Param('jobId') jobId: string) {
    return this.appService.cancelTranscodingJob(jobId);
  }

  @Get('active-jobs')
  getActiveJobs() {
    return this.appService.getActiveJobs();
  }
}
