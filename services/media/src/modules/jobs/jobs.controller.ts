import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Headers,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUserIdentity,
  CurrentUser,
  JwtAuthGuard,
  Public,
  RequirePermissions,
} from '@patina/auth';
import { Request } from 'express';
import { JobState, JobType } from '../../generated/prisma-client';
import { MEDIA_ADMIN_PERMISSION } from '../authorization/media-authorization.constants';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { JobQueueService } from './job-queue.service';
import { WorkerCallbackAuthService } from './worker-callback-auth.service';

@ApiTags('Jobs & Processing')
@Controller('v1/media')
@UseGuards(JwtAuthGuard)
@RequirePermissions(MEDIA_ADMIN_PERMISSION)
@ApiBearerAuth()
export class JobsController {
  constructor(
    private readonly jobQueue: JobQueueService,
    private readonly authorization: MediaAuthorizationResolver,
    private readonly callbackAuth: WorkerCallbackAuthService,
  ) {}

  @Get('jobs')
  @ApiOperation({ summary: 'List processing jobs' })
  async listJobs(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Query('state') state?: JobState,
    @Query('assetId') assetId?: string,
    @Query('limit') limit = 50,
  ) {
    return this.authorization.withAdmin(identity.sub, async (transaction) => {
      const jobs = await transaction.processJob.findMany({
        where: {
          ...(state ? { state } : {}),
          ...(assetId ? { assetId } : {}),
        },
        take: Math.min(Math.max(Number(limit) || 50, 1), 100),
        orderBy: { queuedAt: 'desc' },
        include: {
          asset: { select: { id: true, kind: true, status: true } },
        },
      });
      return { data: jobs, count: jobs.length };
    });
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get job status' })
  async getJob(@CurrentUser() identity: AuthenticatedUserIdentity, @Param('id') id: string) {
    return this.authorization.withAdmin(identity.sub, async (transaction) => {
      const job = await this.jobQueue.getJobStatus(id, transaction);
      if (!job) throw this.authorization.notFound();
      return job;
    });
  }

  @Post('jobs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry failed job' })
  async retryJob(@CurrentUser() identity: AuthenticatedUserIdentity, @Param('id') id: string) {
    return this.authorization.withAdmin(identity.sub, async (transaction) => {
      await this.jobQueue.retryJob(id, transaction);
      return { message: 'Job queued for retry', jobId: id };
    });
  }

  @Post('jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel job' })
  async cancelJob(@CurrentUser() identity: AuthenticatedUserIdentity, @Param('id') id: string) {
    return this.authorization.withAdmin(identity.sub, async (transaction) => {
      await this.jobQueue.cancelJob(id, transaction);
      return { message: 'Job canceled', jobId: id };
    });
  }

  @Post('jobs/complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a media processing job' })
  async completeJob(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-patina-timestamp') timestamp: string | undefined,
    @Headers('x-patina-signature') signature: string | undefined,
    @Body()
    body: {
      jobId: string;
      assetId: string;
      state: 'SUCCEEDED' | 'FAILED';
      result?: unknown;
    },
  ) {
    this.callbackAuth.verify(request.rawBody, timestamp, signature);
    return this.jobQueue.completeJobCallback(body);
  }

  @Get('qc/issues')
  @ApiOperation({ summary: 'List QC issues' })
  async getQCIssues(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Query('limit') limit = 50,
  ) {
    return this.authorization.withAdmin(identity.sub, async (transaction) => {
      const assets = await transaction.mediaAsset.findMany({
        where: { qcIssues: { not: null as any } },
        take: Math.min(Math.max(Number(limit) || 50, 1), 100),
        orderBy: { createdAt: 'desc' },
        include: { threeD: true },
      });
      return { data: assets, count: assets.length };
    });
  }

  @Get('queue/stats')
  @ApiOperation({ summary: 'Get queue statistics' })
  async getQueueStats(@CurrentUser() identity: AuthenticatedUserIdentity) {
    return this.authorization.withAdmin(identity.sub, async (transaction) => {
      const jobTypes: JobType[] = [
        JobType.IMAGE_PROCESS,
        JobType.IMAGE_TRANSFORM,
        JobType.MODEL3D_CONVERT,
        JobType.MODEL3D_OPTIMIZE,
        JobType.SNAPSHOT_GENERATE,
        JobType.VIRUS_SCAN,
        JobType.METADATA_EXTRACT,
      ];
      const stats = [];
      for (const type of jobTypes) {
        stats.push(await this.jobQueue.getQueueStats(type, transaction));
      }
      return { stats };
    });
  }
}
