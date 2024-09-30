import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Logger } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';

jest.mock('fs');

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;
  let logger: Logger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
    logger = module.get<Logger>(Logger);
  });

  describe('cancelJob', () => {
    it('should cancel job successfully', async () => {
      const id = 'abc123';
      jest.spyOn(appService, 'cancelJob').mockReturnValue(true);

      const result = await appController.cancelJob(id);

      expect(result).toEqual({ message: 'Job cancelled successfully' });
      expect(logger.log).toHaveBeenCalledWith(
        `Cancellation request for job: ${id}`,
      );
    });

    it('should return not found message if job does not exist', async () => {
      const id = 'abc123';
      jest.spyOn(appService, 'cancelJob').mockReturnValue(false);

      const result = await appController.cancelJob(id);

      expect(result).toEqual({ message: 'Job not found or already completed' });
    });
  });

  describe('downloadTranscodedFile', () => {
    it('should download file successfully', async () => {
      const id = 'abc123';
      const filePath = '/path/to/file.mp4';
      const mockResponse = {
        setHeader: jest.fn(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'finish') callback();
        }),
      } as unknown as Response;

      jest.spyOn(appService, 'getTranscodedFilePath').mockReturnValue(filePath);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1000 } as fs.Stats);
      jest.spyOn(fs, 'createReadStream').mockReturnValue({
        pipe: jest.fn(),
      } as unknown as fs.ReadStream);
      jest.spyOn(appService, 'cleanupJob').mockImplementation(() => {});

      await appController.downloadTranscodedFile(id, mockResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledTimes(3);
      expect(appService.cleanupJob).toHaveBeenCalledWith(id);
    });

    it('should throw NotFoundException if file not found', async () => {
      const id = 'abc123';
      jest.spyOn(appService, 'getTranscodedFilePath').mockReturnValue(null);

      await expect(
        appController.downloadTranscodedFile(id, {} as Response),
      ).rejects.toThrow('File not found or job not completed');
    });
  });
});
