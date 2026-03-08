import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JobQueueService, JobPayload } from './job-queue.service';
import { PrismaClient, JobType } from '../../generated/prisma-client';
import { Queue, Worker, Job } from 'bullmq';

jest.mock('bullmq');
jest.mock('ioredis');

describe('JobQueueService', () => {
  let service: JobQueueService;
  let config: jest.Mocked<ConfigService>;
  let prisma: jest.Mocked<PrismaClient>;
  let mockQueue: jest.Mocked<Queue>;
  let mockWorker: jest.Mocked<Worker>;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn(),
      getJob: jest.fn(),
      getWaitingCount: jest.fn(),
      getActiveCount: jest.fn(),
      getCompletedCount: jest.fn(),
      getFailedCount: jest.fn(),
      close: jest.fn(),
    } as any;

    mockWorker = {
      on: jest.fn(),
      close: jest.fn(),
    } as any;

    (Queue as any) = jest.fn().mockImplementation(() => mockQueue);
    (Worker as any) = jest.fn().mockImplementation(() => mockWorker);

    const mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const values: Record<string, any> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
        };
        return values[key] || defaultValue;
      }),
    };

    const mockPrisma = {
      processJob: {
        create: jest.fn() as any,
        update: jest.fn() as any,
        findUnique: jest.fn() as any,
        deleteMany: jest.fn() as any,
      },
      $transaction: jest.fn() as any,
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobQueueService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<JobQueueService>(JobQueueService);
    config = module.get(ConfigService) as jest.Mocked<ConfigService>;
    prisma = module.get(PrismaClient) as jest.Mocked<PrismaClient>;

    // Initialize the service
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize queues for all job types', async () => {
      const expectedJobTypes = [
        'IMAGE_PROCESS',
        'IMAGE_TRANSFORM',
        'MODEL3D_CONVERT',
        'MODEL3D_OPTIMIZE',
        'SNAPSHOT_GENERATE',
        'VIRUS_SCAN',
        'METADATA_EXTRACT',
      ];

      // Queue is called once for each job type
      expect(Queue).toHaveBeenCalledTimes(expectedJobTypes.length);
    });
  });

  describe('addJob', () => {
    it('should create job record and add to queue', async () => {
      const payload: JobPayload = {
        assetId: 'asset-123',
        type: 'IMAGE_PROCESS',
        priority: 1,
        meta: { width: 2048, height: 1536 },
      };

      const mockJobRecord = {
        id: 'job-123',
        assetId: payload.assetId,
        type: payload.type,
        state: 'QUEUED',
      };

      (prisma.processJob.create as jest.Mock).mockResolvedValue(mockJobRecord as any);
      mockQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      const jobId = await service.addJob(payload);

      expect(jobId).toBe('job-123');
      expect(prisma.processJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetId: payload.assetId,
          type: payload.type,
          state: 'QUEUED',
          priority: 1,
        }),
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        payload.type,
        expect.objectContaining({
          jobId: 'job-123',
          assetId: payload.assetId,
        }),
        expect.objectContaining({
          jobId: 'job-123',
          priority: 1,
        }),
      );
    });

    it('should use default priority if not provided', async () => {
      const payload: JobPayload = {
        assetId: 'asset-456',
        type: 'VIRUS_SCAN',
      };

      (prisma.processJob.create as jest.Mock).mockResolvedValue({ id: 'job-456' } as any);
      mockQueue.add.mockResolvedValue({ id: 'job-456' } as any);

      await service.addJob(payload);

      expect(prisma.processJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 0,
        }),
      });
    });

    it('should throw error for invalid queue type', async () => {
      const payload: JobPayload = {
        assetId: 'asset-789',
        type: 'INVALID_TYPE' as JobType,
      };

      // Clear the queues map to simulate missing queue
      (service as any).queues.clear();

      await expect(service.addJob(payload)).rejects.toThrow('Queue not found');
    });
  });

  describe('registerWorker', () => {
    it('should register worker with processor', () => {
      const processor = jest.fn().mockResolvedValue({ success: true });
      const jobType: JobType = 'IMAGE_PROCESS';
      const concurrency = 5;

      service.registerWorker(jobType, processor, concurrency);

      expect(Worker).toHaveBeenCalledWith(
        expect.stringContaining('image_process'),
        expect.any(Function),
        expect.objectContaining({
          concurrency: 5,
          autorun: true,
        }),
      );
    });

    it('should use default concurrency', () => {
      const processor = jest.fn().mockResolvedValue({ success: true });
      const jobType: JobType = 'METADATA_EXTRACT';

      service.registerWorker(jobType, processor);

      expect(Worker).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          concurrency: 5,
        }),
      );
    });

    it('should set up worker event handlers', () => {
      const processor = jest.fn();
      const jobType: JobType = 'IMAGE_TRANSFORM';

      service.registerWorker(jobType, processor);

      expect(mockWorker.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('getJobStatus', () => {
    it('should retrieve job status', async () => {
      const jobId = 'job-123';
      const mockJob = {
        id: jobId,
        assetId: 'asset-123',
        type: 'IMAGE_PROCESS',
        state: 'RUNNING',
        asset: {
          id: 'asset-123',
          kind: 'IMAGE',
          status: 'PROCESSING',
        },
      };

      (prisma.processJob.findUnique as jest.Mock).mockResolvedValue(mockJob as any);

      const status = await service.getJobStatus(jobId);

      expect(status).toEqual(mockJob);
      expect(prisma.processJob.findUnique).toHaveBeenCalledWith({
        where: { id: jobId },
        include: expect.objectContaining({
          asset: expect.any(Object),
        }),
      });
    });
  });

  describe('cancelJob', () => {
    it('should cancel waiting job', async () => {
      const jobId = 'job-cancel';
      const mockJob = {
        id: jobId,
        type: 'IMAGE_PROCESS',
      };

      const mockBullJob = {
        isWaiting: jest.fn().mockResolvedValue(true),
        remove: jest.fn(),
      };

      (prisma.processJob.findUnique as jest.Mock).mockResolvedValue(mockJob as any);
      mockQueue.getJob.mockResolvedValue(mockBullJob as any);
      (prisma.processJob.update as jest.Mock).mockResolvedValue({} as any);

      await service.cancelJob(jobId);

      expect(mockBullJob.remove).toHaveBeenCalled();
      expect(prisma.processJob.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: expect.objectContaining({
          state: 'CANCELED',
        }),
      });
    });

    it('should throw error if job not found', async () => {
      (prisma.processJob.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.cancelJob('missing-job')).rejects.toThrow('Job not found');
    });
  });

  describe('retryJob', () => {
    it('should retry failed job', async () => {
      const jobId = 'job-retry';
      const mockJob = {
        id: jobId,
        assetId: 'asset-123',
        type: 'IMAGE_PROCESS',
        state: 'FAILED',
        meta: { width: 2048 },
      };

      (prisma.processJob.findUnique as jest.Mock).mockResolvedValue(mockJob as any);
      (prisma.processJob.update as jest.Mock).mockResolvedValue({} as any);
      mockQueue.add.mockResolvedValue({} as any);

      await service.retryJob(jobId);

      expect(prisma.processJob.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: expect.objectContaining({
          state: 'QUEUED',
          attempts: 0,
          error: null,
        }),
      });

      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should throw error if job not found', async () => {
      (prisma.processJob.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.retryJob('missing-job')).rejects.toThrow('Job not found');
    });

    it('should throw error if job not in FAILED state', async () => {
      const mockJob = {
        id: 'job-123',
        state: 'RUNNING',
      };

      (prisma.processJob.findUnique as jest.Mock).mockResolvedValue(mockJob as any);

      await expect(service.retryJob('job-123')).rejects.toThrow('Only failed jobs can be retried');
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const jobType: JobType = 'IMAGE_PROCESS';

      mockQueue.getWaitingCount.mockResolvedValue(10);
      mockQueue.getActiveCount.mockResolvedValue(5);
      mockQueue.getCompletedCount.mockResolvedValue(100);
      mockQueue.getFailedCount.mockResolvedValue(2);

      const stats = await service.getQueueStats(jobType);

      expect(stats).toEqual({
        type: jobType,
        waiting: 10,
        active: 5,
        completed: 100,
        failed: 2,
        total: 15,
      });
    });

    it('should throw error for invalid queue type', async () => {
      (service as any).queues.clear();

      await expect(service.getQueueStats('INVALID' as JobType)).rejects.toThrow(
        'Queue not found',
      );
    });
  });

  describe('cleanupJobs', () => {
    it('should delete old completed and failed jobs', async () => {
      (prisma.processJob.deleteMany as jest.Mock).mockResolvedValue({ count: 50 } as any);

      const deletedCount = await service.cleanupJobs(24);

      expect(deletedCount).toBe(50);
      expect(prisma.processJob.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          finishedAt: expect.any(Object),
          state: { in: ['SUCCEEDED', 'FAILED', 'CANCELED'] },
        }),
      });
    });

    it('should use custom retention period', async () => {
      (prisma.processJob.deleteMany as jest.Mock).mockResolvedValue({ count: 20 } as any);

      await service.cleanupJobs(48);

      expect(prisma.processJob.deleteMany).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should close all workers and queues', async () => {
      const processor = jest.fn();
      service.registerWorker('IMAGE_PROCESS', processor);

      await service.shutdown();

      expect(mockWorker.close).toHaveBeenCalled();
      expect(mockQueue.close).toHaveBeenCalled();
    });
  });
});
