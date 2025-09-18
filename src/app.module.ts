import { Module, NestModule, MiddlewareConsumer, Logger } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthMiddleware } from './auth.middleware';
import { ConfigModule } from '@nestjs/config';
import { JellyfinAuthService } from './jellyfin-auth.service';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupService } from './cleanup/cleanup.service';
import { FileRemoval } from './cleanup/removalUtils';


@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [AppService, Logger, JellyfinAuthService, CleanupService, FileRemoval],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .forRoutes(
        'optimize-version',
        'download/:id',
        'cancel-job/:id',
        'statistics',
        'job-status/:id',
        'start-job/:id',
        'all-jobs',
        'delete-cache',
      );
  }
}
  