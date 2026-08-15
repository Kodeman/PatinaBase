import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient, JobType, JobState } from '../../generated/prisma-client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

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

/**
 * Job types the Cloudflare pipeline (infra/media-worker, a Queues consumer +
 * Sharp container) actually executes today. Mirrors CONTAINER_JOB_TYPES in
 * infra/media-worker/src/index.ts — keep in sync.
 */
const WORKER_SUPPORTED_TYPES = new Set<JobType>([
  'IMAGE_PROCESS',
  'IMAGE_TRANSFORM',
  'METADATA_EXTRACT',
]);

/**
 * Job Queue Service (cloud migration phase 3b)
 * =============================================
 * Producer-only shim over the Cloudflare Queues pipeline. This used to own
 * BullMQ Queue/Worker pairs backed by Redis; execution now happens entirely
 * out of process in `infra/media-worker` (a Cloudflare Worker consuming the
 * `media-jobs` queue, running Sharp in a Container, and POSTing completion
 * back to `POST /v1/media/jobs/complete` — see jobs.controller.ts).
 *
 * This service still owns the `ProcessJob` ledger (create/read/update), but
 * no longer runs any in-process execution:
 *  - addJob() creates the ledger row, then POSTs the job to the worker's
 *    `/enqueue` route (shared-secret guarded). Non-2xx responses (or an
 *    unreachable worker) mark the row FAILED and re-throw.
 *  - getJobStatus / cancelJob / retryJob operate on the DB ledger only.
 *    cancelJob cannot recall a message already handed to Cloudflare Queues —
 *    it only marks the ledger CANCELED so callers/UI stop waiting on it.
 *  - getQueueStats derives counts from ProcessJob rows (there is no BullMQ
 *    queue to introspect any more).
 *  - registerWorker() is now a deprecated no-op (logs and returns) — kept so
 *    existing callers (bulk-operations.processor.ts) don't need restructuring
 *    beyond removing their registration calls.
 *
 * Job types outside WORKER_SUPPORTED_TYPES (the ASSET_DELETE / BULK_DELETE /
 * BULK_COPY / CLEANUP_ORPHANED / MODEL3D_* / SNAPSHOT_GENERATE / VIRUS_SCAN
 * families) have no executor on the Cloudflare pipeline yet — addJob() fails
 * them fast with a clear NotImplementedException rather than leaving a
 * ProcessJob row QUEUED forever with nothing to pick it up.
 */
@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaClient,
  ) {}

  /**
   * Add job to the ledger + hand it to the media-worker's Cloudflare Queues
   * producer. Returns the ProcessJob id (also used as the worker's `jobId`,
   * so the completion callback can address the same row).
   */
  async addJob(payload: JobPayload, client: DatabaseClient = this.prisma): Promise<string> {
    const jobRecord = await client.processJob.create({
      data: {
        assetId: payload.assetId,
        type: payload.type,
        state: 'QUEUED',
        priority: payload.priority || 0,
        meta: payload.meta,
      },
    });

    if (!WORKER_SUPPORTED_TYPES.has(payload.type)) {
      const error = `Job type ${payload.type} has no executor on the Cloudflare Queues pipeline yet (bulk/3D/scan ops are pending a later migration wave)`;
      await this.markFailed(jobRecord.id, error, client);
      throw new NotImplementedException(error);
    }

    await this.enqueueToWorker(
      jobRecord.id,
      payload.assetId,
      payload.type,
      payload.priority,
      payload.meta,
      client,
    );

    this.logger.log('Added media processing job');

    return jobRecord.id;
  }

  /**
   * POST a job to the media-worker's `/enqueue` route. Ensures `meta.rawKey`
   * is present (the consumer's MediaJob shape requires it) — looks it up from
   * the asset if the caller didn't already supply it.
   */
  private async enqueueToWorker(
    jobId: string,
    assetId: string,
    type: JobType,
    priority: number | undefined,
    meta: Record<string, any> | undefined,
    client: DatabaseClient,
  ): Promise<void> {
    const workerUrl = this.config.get<string>('MEDIA_WORKER_URL');
    const enqueueSecret = this.config.get<string>('MEDIA_WORKER_ENQUEUE_SECRET');

    if (!workerUrl || !enqueueSecret) {
      const error =
        'MEDIA_WORKER_URL / MEDIA_WORKER_ENQUEUE_SECRET are not configured — cannot enqueue processing jobs';
      await this.markFailed(jobId, error, client);
      throw new Error(error);
    }

    let rawKey: string | undefined = meta?.rawKey;
    if (!rawKey) {
      const asset = await client.mediaAsset.findUnique({
        where: { id: assetId },
        select: { rawKey: true },
      });
      rawKey = asset?.rawKey;
    }

    const body = {
      jobId,
      assetId,
      type,
      priority,
      meta: { ...meta, rawKey },
    };

    let response: Response;
    try {
      response = await fetch(`${workerUrl}/enqueue`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enqueue-secret': enqueueSecret,
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      const error = `Failed to reach media-worker /enqueue: ${err.message}`;
      await this.markFailed(jobId, error, client);
      throw new Error(error);
    }

    if (!response.ok) {
      const error = `media-worker /enqueue returned ${response.status}`;
      await this.markFailed(jobId, error, client);
      throw new Error(error);
    }
  }

  private async markFailed(
    jobId: string,
    error: string,
    client: DatabaseClient = this.prisma,
  ): Promise<void> {
    await client.processJob
      .update({
        where: { id: jobId },
        data: { state: 'FAILED', error, finishedAt: new Date() },
      })
      .catch((err) => {
        this.logger.error('Failed to mark media job as failed');
      });
  }

  /**
   * Deprecated — job execution now runs entirely in infra/media-worker's
   * Cloudflare Queues consumer + container. This is a no-op kept so existing
   * callers (e.g. bulk-operations.processor.ts) compile unchanged.
   */
  registerWorker(
    type: JobType,
    _processor: (job: any) => Promise<JobResult>,
    _concurrency = 5,
  ): void {
    this.logger.warn(
      `registerWorker(${type}) is deprecated and is now a no-op — job execution moved to the Cloudflare Queues media-worker pipeline (infra/media-worker).`,
    );
  }

  /**
   * Get job status (ledger read).
   */
  async getJobStatus(jobId: string, client: DatabaseClient = this.prisma) {
    const job = await client.processJob.findUnique({
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
   * Cancel job. Ledger-only: a message already handed to Cloudflare Queues
   * cannot be recalled, so this just stops the ledger (and any UI polling
   * it) from treating the job as pending.
   */
  async cancelJob(jobId: string, client: DatabaseClient = this.prisma) {
    const job = await client.processJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Media object not found');
    }

    await client.processJob.update({
      where: { id: jobId },
      data: {
        state: 'CANCELED',
        finishedAt: new Date(),
      },
    });

    this.logger.log('Canceled media job');
  }

  /**
   * Retry failed job — resets the ledger row and re-POSTs to the worker.
   */
  async retryJob(jobId: string, client: DatabaseClient = this.prisma) {
    const job = await client.processJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Media object not found');
    }

    if (job.state !== 'FAILED') {
      throw new ConflictException('Only failed jobs can be retried');
    }

    if (!WORKER_SUPPORTED_TYPES.has(job.type)) {
      const error = `Job type ${job.type} has no executor on the Cloudflare Queues pipeline yet`;
      throw new NotImplementedException(error);
    }

    await client.processJob.update({
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

    await this.enqueueToWorker(
      job.id,
      job.assetId,
      job.type,
      job.priority,
      (job.meta as Record<string, any> | null) ?? undefined,
      client,
    );

    this.logger.log('Retrying media job');
  }

  /**
   * Get queue stats — derived from ProcessJob counts by state (there is no
   * BullMQ queue to introspect any more).
   */
  async getQueueStats(type: JobType, client: DatabaseClient = this.prisma) {
    const waiting = await client.processJob.count({
      where: { type, state: 'QUEUED' as JobState },
    });
    const active = await client.processJob.count({
      where: { type, state: 'RUNNING' as JobState },
    });
    const completed = await client.processJob.count({
      where: { type, state: 'SUCCEEDED' as JobState },
    });
    const failed = await client.processJob.count({
      where: { type, state: 'FAILED' as JobState },
    });

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
   * Clean up completed/failed jobs.
   */
  async cleanupJobs(olderThanHours = 24) {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const deleted = await this.prisma.processJob.deleteMany({
      where: {
        finishedAt: { lt: cutoffDate },
        state: { in: ['SUCCEEDED', 'FAILED', 'CANCELED'] },
      },
    });

    this.logger.log('Cleaned up old media jobs');
    return deleted.count;
  }

  /**
   * Shutdown — no BullMQ/Redis connections to close any more.
   */
  async shutdown() {
    this.logger.log('Shutdown: nothing to close (Cloudflare Queues pipeline is stateless here)');
  }

  /**
   * Handle the media-worker's completion callback
   * (`POST /v1/media/jobs/complete`, see jobs.controller.ts). Updates the
   * ProcessJob ledger and, on success with metadata extraction results,
   * writes the resulting fields back onto MediaAsset.
   */
  async completeJob(
    payload: {
      jobId: string;
      assetId: string;
      state: 'SUCCEEDED' | 'FAILED';
      result?: unknown;
    },
    client: DatabaseClient = this.prisma,
  ): Promise<{ ok: boolean; reason?: string }> {
    const { jobId, assetId, state, result } = payload;

    const job = await client.processJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Media object not found');
    }

    if (assetId !== job.assetId) {
      throw new BadRequestException('Completion asset does not match job');
    }
    if (job.state === state) return { ok: true };
    if (['SUCCEEDED', 'FAILED', 'CANCELED'].includes(job.state)) {
      throw new ConflictException('Media job is already terminal');
    }
    if (!['QUEUED', 'RUNNING', 'RETRY'].includes(job.state)) {
      throw new ConflictException('Media job cannot be completed from its current state');
    }

    if (state === 'SUCCEEDED') {
      await client.processJob.update({
        where: { id: jobId },
        data: {
          state: 'SUCCEEDED',
          finishedAt: new Date(),
          result: (result as any) ?? undefined,
        },
      });

      const metadata = (result as any)?.results?.extract_metadata;
      if (metadata && typeof metadata === 'object') {
        const data: Record<string, any> = { processed: true, status: 'READY' };
        if (typeof metadata.width === 'number') data.width = metadata.width;
        if (typeof metadata.height === 'number') data.height = metadata.height;
        if (typeof metadata.format === 'string') data.format = metadata.format;
        if (typeof metadata.blurhash === 'string') data.blurhash = metadata.blurhash;
        if (metadata.dominantColor || metadata.space || metadata.hasAlpha !== undefined) {
          data.palette = {
            dominantColor: metadata.dominantColor,
            colorSpace: metadata.space,
            hasAlpha: metadata.hasAlpha,
          };
        }

        await client.mediaAsset.update({ where: { id: job.assetId }, data });
      }
    } else {
      const resultAny = result as any;
      const errorMessage =
        typeof resultAny?.error === 'string'
          ? resultAny.error
          : JSON.stringify(resultAny ?? {}).slice(0, 1000);

      await client.processJob.update({
        where: { id: jobId },
        data: {
          state: 'FAILED',
          finishedAt: new Date(),
          error: errorMessage,
        },
      });
    }

    return { ok: true };
  }
}
