import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Check Jellyfin server connection
  const jellyfinUrl = process.env.JELLYFIN_URL;
  try {
    await axios.get(`${jellyfinUrl}/System/Info/Public`);
    logger.log('Successfully connected to Jellyfin server: ' + jellyfinUrl);
  } catch (error) {
    logger.error(
      `Failed to connect to Jellyfin server at ${jellyfinUrl}: ${error.message}`,
    );
    // Optionally, you can choose to exit the process if the Jellyfin server is unreachable
    // process.exit(1);
  }

  await app.listen(3000);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
