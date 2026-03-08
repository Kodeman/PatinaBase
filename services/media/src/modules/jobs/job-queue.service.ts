import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, JobType, JobState } from '../../generated/prisma-client';
import IORedis from 'ioredis';

export interface JobPayload {
  assetId: string;
  type: JobType;
  priority?: number;
  meta?: Record<string, any>;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

@Injectable()
export class JobQueueService implements OnModuleInit {
  private readonly logger = new Logger(JobQueueService.name);
  private connection: IORedis;
  private queues: Map<JobType, Queue> = new Map();
  private workers: Map<JobType, Worker> = new Map();

  constructor(
    private config: ConfigService,
    private prisma: PrismaClient,
  ) {
    this.connection = new IORedis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD'),
      maxRetriesPerRequest: null,
    });
  }

  async onModuleInit() {
    // Initialize queues for different job types
    const jobTypes: JobType[] = [
      'IMAGE_PROCESS',
      'IMAGE_TRANSFORM',
      'MODEL3D_CONVERT',
      'MODEL3D_OPTIMIZE',
      'SNAPSHOT_GENERATE',
      'VIRUS_SCAN',
      'METADATA_EXTRACT',
    ];

    for (const type of jobTypes) {
      this.initQueue(type);
    }

    this.logger.log('Job queue service initialized');
  }

  /**
   * Initialize queue for a job type
   */
  private initQueue(type: JobType) {
    const queueName = `media-${type.toLowerCase()}`;

    const queue = new Queue(queueName, {
      connection: this.connection as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000,
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    });

    this.queues.set(type, queue);
    this.logger.log(`Initialized queue: ${queueName}`);
  }

  /**
   * Add job to queue
   */
  async addJob(payload: JobPayload): Promise<string> {
    const queue = this.queues.get(payload.type);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${payload.type}`);
    }

    // Create job record in database
    const jobRecord = await this.prisma.processJob.create({
      data: {
        assetId: payload.assetId,
        type: payload.type,
        state: 'QUEUED',
        priority: payload.priority || 0,
        meta: payload.meta,
      },
    });

    // Add to BullMQ queue
    const job = await queue.add(
      payload.type,
      {
        jobId: jobRecord.id,
        assetId: payload.assetId,
        ...payload.meta,
      },
      {
        jobId: jobRecord.id,
        priority: payload.priority,
      },
    );

    this.logger.log(
      `Added job ${jobRecord.id} to queue ${payload.type} for asset ${payload.assetId}`,
    );

    return jobRecord.id;
  }

  /**
   * Register worker for job type
   */
  registerWorker(
    type: JobType,
    processor: (job: Job) => Promise<JobResult>,
    concurrency = 5,
  ) {
    const queueName = `media-${type.toLowerCase()}`;
    const workerId = `worker-${type}-${Date.now()}`;

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const jobId = job.data.jobId;

        try {
          // Update job state to RUNNING
          await this.prisma.processJob.update({
            where: { id: jobId },
            data: {
              state: 'RUNNING',
              startedAt: new Date(),
              workerId,
            },
          });

          // Process the job
          const result = await processor(job);

          // Update job state based on result
          if (result.success) {
            await this.prisma.processJob.update({
              where: { id: jobId },
              data: {
                state: 'SUCCEEDED',
                finishedAt: new Date(),
                result: result.data,
              },
            });
          } else {
            await this.handleJobFailure(jobId, result.error || 'Unknown error');
          }

          return result;
        } catch (error) {
          await this.handleJobFailure(jobId, error.message);
          throw error;
        }
      },
      {
        connection: this.connection as any,
        concurrency,
        autorun: true,
      },
    );

    // Worker event handlers
    worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`, err.stack);
    });

    worker.on('error', (err) => {
      this.logger.error(`Worker error: ${err.message}`, err.stack);
    });

    this.workers.set(type, worker);
    this.logger.log(`Registered worker for ${type} with concurrency ${concurrency}`);
  }

  /**
   * Handle job failure with retry logic
   */
  private async handleJobFailure(jobId: string, error: string) {
    const job = await this.prisma.processJob.findUnique({
      where: { id: jobId },
    });

    if (!job) return;

    const attempts = job.attempts + 1;
    const shouldRetry = attempts < job.maxRetries;

    await this.prisma.processJob.update({
      where: { id: jobId },
      data: {
        state: shouldRetry ? 'RETRY' : 'FAILED',
        attempts,
        error,
        errorCode: this.extractErrorCode(error),
        finishedAt: shouldRetry ? undefined : new Date(),
      },
    });

    if (shouldRetry) {
      this.logger.log(`Job ${jobId} will retry (attempt ${attempts}/${job.maxRetries})`);
    } else {
      this.logger.error(`Job ${jobId} failed after ${attempts} attempts`);
    }
  }

  /**
   * Extract error code from error message
   */
  private extractErrorCode(error: string): string {
    // Simple error code extraction
    if (error.includes('validation')) return 'VALIDATION_ERROR';
    if (error.includes('storage')) return 'STORAGE_ERROR';
    if (error.includes('timeout')) return 'TIMEOUT_ERROR';
    if (error.includes('memory')) return 'MEMORY_ERROR';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string) {
    const job = await this.prisma.processJob.findUnique({
      where: { id: jobId },
      include: {
        asset: {
          select: {
            id: true,
            kind: true,
            status: true,
          },
        },
      },
    });

    return job;
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId: string) {
    const job = await this.prisma.processJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error('Job not found');
    }

    const queue = this.queues.get(job.type);
    if (queue) {
      const bullJob = await queue.getJob(jobId);
      if (bullJob && (await bullJob.isWaiting())) {
        await bullJob.remove();
      }
    }

    await this.prisma.processJob.update({
      where: { id: jobId },
      data: {
        state: 'CANCELED',
        finishedAt: new Date(),
      },
    });

    this.logger.log(`Canceled job ${jobId}`);
  }

  /**
   * Retry failed job
   */
  async retryJob(jobId: string) {
    const job = await this.prisma.processJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error('Job not found');
    }

    if (job.state !== 'FAILED') {
      throw new Error('Only failed jobs can be retried');
    }

    // Reset job state and re-queue
    await this.prisma.processJob.update({
      where: { id: jobId },
      data: {
        state: 'QUEUED',
        attempts: 0,
        error: null,
        errorCode: null,
        startedAt: null,
        finishedAt: null,
      },
    });

    const queue = this.queues.get(job.type);
    if (queue) {
      const jobData: any = {
        jobId: job.id,
        assetId: job.assetId,
      };
      if (job.meta) {
        Object.assign(jobData, job.meta);
      }
      await queue.add(
        job.type,
        jobData,
        {
          jobId: job.id,
        },
      );
    }

    this.logger.log(`Retrying job ${jobId}`);
  }

  /**
   * Get queue stats
   */
  async getQueueStats(type: JobType) {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not found for type: ${type}`);
    }

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return {
      type,
      waiting,
      active,
      completed,
      failed,
      total: waiting + active,
    };
  }

  /**
   * Clean up completed/failed jobs
   */
  async cleanupJobs(olderThanHours = 24) {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const deleted = await this.prisma.processJob.deleteMany({
      where: {
        finishedAt: { lt: cutoffDate },
        state: { in: ['SUCCEEDED', 'FAILED', 'CANCELED'] },
      },
    });

    this.logger.log(`Cleaned up ${deleted.count} old jobs`);
    return deleted.count;
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    this.logger.log('Shutting down job queue service...');

    // Close all workers
    for (const [type, worker] of this.workers.entries()) {
      await worker.close();
      this.logger.log(`Closed worker for ${type}`);
    }

    // Close all queues
    for (const [type, queue] of this.queues.entries()) {
      await queue.close();
      this.logger.log(`Closed queue for ${type}`);
    }

    // Disconnect Redis
    await this.connection.quit();
    this.logger.log('Job queue service shutdown complete');
  }
}
