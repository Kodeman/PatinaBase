import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, Public, RequirePermissions } from '@patina/auth';
import { JobQueueService } from './job-queue.service';
import { PrismaClient, JobState } from '../../generated/prisma-client';

/**
 * Constant-time string compare (Node's `timingSafeEqual` throws on mismatched
 * lengths, so pad first — the padded prefix comparison result is discarded
 * whenever the real lengths differ).
 */
function secureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Still run a same-length comparison so the response time doesn't leak
    // the length mismatch any more than necessary.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

@ApiTags('Jobs & Processing')
@Controller('v1/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class JobsController {
  constructor(
    private jobQueue: JobQueueService,
    private prisma: PrismaClient,
    private config: ConfigService,
  ) {}

  @Get('jobs')
  @RequirePermissions('media.jobs.admin')
  @ApiOperation({
    summary: 'List processing jobs',
    description: 'Get list of processing jobs with optional filtering by state',
  })
  async listJobs(
    @Query('state') state?: JobState,
    @Query('assetId') assetId?: string,
    @Query('limit') limit = 50,
  ) {
    const where: any = {};
    if (state) where.state = state;
    if (assetId) where.assetId = assetId;

    const jobs = await this.prisma.processJob.findMany({
      where,
      take: limit,
      orderBy: { queuedAt: 'desc' },
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

    return { data: jobs, count: jobs.length };
  }

  @Get('jobs/:id')
  @ApiOperation({
    summary: 'Get job status',
    description: 'Retrieve detailed status and progress of a processing job',
  })
  async getJob(@Param('id') id: string) {
    return this.jobQueue.getJobStatus(id);
  }

  @Post('jobs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('media.jobs.admin')
  @ApiOperation({
    summary: 'Retry failed job',
    description: 'Retry a failed processing job',
  })
  async retryJob(@Param('id') id: string) {
    await this.jobQueue.retryJob(id);
    return { message: 'Job queued for retry', jobId: id };
  }

  @Post('jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('media.jobs.admin')
  @ApiOperation({
    summary: 'Cancel job',
    description: 'Cancel a queued or running job',
  })
  async cancelJob(@Param('id') id: string) {
    await this.jobQueue.cancelJob(id);
    return { message: 'Job canceled', jobId: id };
  }

  /**
   * Job-completion callback for the Cloudflare media-worker (a Worker, not a
   * user) — see infra/media-worker/src/index.ts `reportCompletion()`. Marked
   * `@Public()` to skip the global Supabase JWT guard entirely; auth here is
   * a shared secret in `x-worker-secret`, compared in constant time against
   * `COMPLETE_CALLBACK_SECRET`.
   *
   * Route intentionally has no `:id` — the worker's callback body already
   * carries a flat `{jobId, assetId, state, result}` (matching its own
   * `reportCompletion` payload exactly), so there's nothing a path param
   * would add.
   */
  @Post('jobs/complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Media-worker job-completion callback',
    description:
      'Called by the Cloudflare Queues media-worker when a job finishes. Guarded by a shared secret header (x-worker-secret), not user auth.',
  })
  async completeJob(
    @Headers('x-worker-secret') providedSecret: string | undefined,
    @Body()
    body: {
      jobId: string;
      assetId: string;
      state: 'SUCCEEDED' | 'FAILED';
      result?: unknown;
    },
  ) {
    const expectedSecret = this.config.get<string>('COMPLETE_CALLBACK_SECRET');
    if (!expectedSecret || !secureCompare(providedSecret ?? '', expectedSecret)) {
      throw new UnauthorizedException('invalid worker secret');
    }

    return this.jobQueue.completeJob(body);
  }

  @Get('qc/issues')
  @RequirePermissions('media.jobs.admin')
  @ApiOperation({
    summary: 'List QC issues',
    description: 'Get assets with quality control issues',
  })
  async getQCIssues(@Query('limit') limit = 50) {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        qcIssues: { not: null as any },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        threeD: true,
      },
    });

    return { data: assets, count: assets.length };
  }

  @Get('queue/stats')
  @RequirePermissions('media.jobs.admin')
  @ApiOperation({
    summary: 'Get queue statistics',
    description: 'Retrieve statistics for all job queues',
  })
  async getQueueStats() {
    const jobTypes = [
      'IMAGE_PROCESS',
      'IMAGE_TRANSFORM',
      'MODEL3D_CONVERT',
      'MODEL3D_OPTIMIZE',
      'SNAPSHOT_GENERATE',
      'VIRUS_SCAN',
      'METADATA_EXTRACT',
    ];

    const stats = await Promise.all(
      jobTypes.map((type) => this.jobQueue.getQueueStats(type as any)),
    );

    return { stats };
  }
}
