import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { JobQueueService, JobPayload } from './job-queue.service';
import { PrismaClient, JobType } from '../../generated/prisma-client';

// NOTE: JobQueueService used to own BullMQ Queue/Worker pairs backed by
// Redis (hence the historical `jest.mock('bullmq')` / `jest.mock('ioredis')`
// here). Per the service's own doc comment, execution moved entirely
// out-of-process to infra/media-worker (a Cloudflare Queues consumer); the
// service is now a producer-only shim over the ProcessJob ledger that POSTs
// to the worker's `/enqueue` route via `fetch`. This spec was rewritten
// against that current shape — bullmq/ioredis are no longer imported by
// production code at all.
describe('JobQueueService', () => {
  let service: JobQueueService;
  let prisma: {
    processJob: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
    };
    mediaAsset: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;

    const mockConfig = {
      get: jest.fn((key: string) => {
        const values: Record<string, any> = {
          MEDIA_WORKER_URL: 'https://media-worker.example.com',
          MEDIA_WORKER_ENQUEUE_SECRET: 'test-enqueue-secret',
        };
        return values[key];
      }),
    };

    prisma = {
      processJob: {
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      mediaAsset: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobQueueService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaClient, useValue: prisma },
      ],
    }).compile();

    service = module.get<JobQueueService>(JobQueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = originalFetch;
  });

  describe('addJob', () => {
    it('should create a ledger row and POST the job to the media-worker for a supported type', async () => {
      const payload: JobPayload = {
        assetId: 'asset-123',
        type: 'IMAGE_PROCESS',
        priority: 1,
        meta: { rawKey: 'raw/asset-123.jpg', width: 2048, height: 1536 },
      };

      prisma.processJob.create.mockResolvedValue({
        id: 'job-123',
        assetId: payload.assetId,
        type: payload.type,
        state: 'QUEUED',
      });

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

      expect(fetchMock).toHaveBeenCalledWith(
        'https://media-worker.example.com/enqueue',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-enqueue-secret': 'test-enqueue-secret' }),
        }),
      );
      const [, requestInit] = fetchMock.mock.calls[0];
      expect(JSON.parse(requestInit.body)).toMatchObject({
        jobId: 'job-123',
        assetId: payload.assetId,
        type: payload.type,
        priority: 1,
      });
    });

    it('should use default priority 0 if not provided', async () => {
      prisma.processJob.create.mockResolvedValue({ id: 'job-456' });

      await service.addJob({
        assetId: 'asset-456',
        type: 'IMAGE_TRANSFORM',
        meta: { rawKey: 'raw/asset-456.jpg' },
      });

      expect(prisma.processJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ priority: 0 }),
      });
    });

    it('should mark the job failed and throw for a type with no worker executor', async () => {
      const payload: JobPayload = {
        assetId: 'asset-789',
        // Not in WORKER_SUPPORTED_TYPES (IMAGE_PROCESS/IMAGE_TRANSFORM/METADATA_EXTRACT only).
        type: 'VIRUS_SCAN' as JobType,
      };

      prisma.processJob.create.mockResolvedValue({ id: 'job-789' });

      await expect(service.addJob(payload)).rejects.toThrow(NotImplementedException);

      expect(prisma.processJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-789' },
          data: expect.objectContaining({ state: 'FAILED' }),
        }),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('registerWorker', () => {
    it('should be a deprecated no-op (execution now runs in infra/media-worker)', () => {
      const processor = jest.fn().mockResolvedValue({ success: true });

      expect(() => service.registerWorker('IMAGE_PROCESS', processor, 5)).not.toThrow();
      expect(processor).not.toHaveBeenCalled();
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

      prisma.processJob.findUnique.mockResolvedValue(mockJob);

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
    it('should mark a job canceled in the ledger', async () => {
      const jobId = 'job-cancel';
      prisma.processJob.findUnique.mockResolvedValue({ id: jobId, type: 'IMAGE_PROCESS' });
      prisma.processJob.update.mockResolvedValue({});

      await service.cancelJob(jobId);

      expect(prisma.processJob.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: expect.objectContaining({
          state: 'CANCELED',
        }),
      });
    });

    it('should throw if job not found', async () => {
      prisma.processJob.findUnique.mockResolvedValue(null);

      await expect(service.cancelJob('missing-job')).rejects.toThrow(NotFoundException);
    });
  });

  describe('retryJob', () => {
    it('should reset the ledger row and re-enqueue a retried job', async () => {
      const jobId = 'job-retry';
      const mockJob = {
        id: jobId,
        assetId: 'asset-123',
        type: 'IMAGE_PROCESS',
        state: 'FAILED',
        priority: 1,
        meta: { rawKey: 'raw/asset-123.jpg', width: 2048 },
      };

      prisma.processJob.findUnique.mockResolvedValue(mockJob);
      prisma.processJob.update.mockResolvedValue({});

      await service.retryJob(jobId);

      expect(prisma.processJob.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: expect.objectContaining({
          state: 'QUEUED',
          attempts: 0,
          error: null,
        }),
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://media-worker.example.com/enqueue',
        expect.any(Object),
      );
    });

    it('should throw if job not found', async () => {
      prisma.processJob.findUnique.mockResolvedValue(null);

      await expect(service.retryJob('missing-job')).rejects.toThrow(NotFoundException);
    });

    it('should throw if job not in FAILED state', async () => {
      prisma.processJob.findUnique.mockResolvedValue({ id: 'job-123', state: 'RUNNING' });

      await expect(service.retryJob('job-123')).rejects.toThrow(ConflictException);
    });

    it('should throw for a job type with no worker executor', async () => {
      prisma.processJob.findUnique.mockResolvedValue({
        id: 'job-123',
        type: 'VIRUS_SCAN',
        state: 'FAILED',
      });

      await expect(service.retryJob('job-123')).rejects.toThrow(NotImplementedException);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('getQueueStats', () => {
    it('should derive queue statistics from ProcessJob ledger counts', async () => {
      const jobType: JobType = 'IMAGE_PROCESS';

      prisma.processJob.count
        .mockResolvedValueOnce(10) // QUEUED (waiting)
        .mockResolvedValueOnce(5) // RUNNING (active)
        .mockResolvedValueOnce(100) // SUCCEEDED (completed)
        .mockResolvedValueOnce(2); // FAILED (failed)

      const stats = await service.getQueueStats(jobType);

      expect(stats).toEqual({
        type: jobType,
        waiting: 10,
        active: 5,
        completed: 100,
        failed: 2,
        total: 15, // waiting + active — there is no BullMQ queue to introspect any more
      });
    });

    it('should return zero counts for a type with no ledger rows', async () => {
      prisma.processJob.count.mockResolvedValue(0);

      const stats = await service.getQueueStats('METADATA_EXTRACT');

      expect(stats).toEqual({
        type: 'METADATA_EXTRACT',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        total: 0,
      });
    });
  });

  describe('cleanupJobs', () => {
    it('should delete old completed and failed jobs', async () => {
      prisma.processJob.deleteMany.mockResolvedValue({ count: 50 });

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
      prisma.processJob.deleteMany.mockResolvedValue({ count: 20 });

      await service.cleanupJobs(48);

      expect(prisma.processJob.deleteMany).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should resolve without error (stateless Cloudflare Queues pipeline, nothing to close)', async () => {
      await expect(service.shutdown()).resolves.toBeUndefined();
    });
  });
});
