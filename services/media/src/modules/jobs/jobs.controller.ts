import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JobQueueService } from './job-queue.service';
import { PrismaClient, JobState } from '../../generated/prisma-client';

// Mock auth guard - replace with actual implementation
class JwtAuthGuard {}
class AdminGuard {}

@ApiTags('Jobs & Processing')
@Controller('v1/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class JobsController {
  constructor(
    private jobQueue: JobQueueService,
    private prisma: PrismaClient,
  ) {}

  @Get('jobs')
  @UseGuards(AdminGuard)
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
  @UseGuards(AdminGuard)
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
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Cancel job',
    description: 'Cancel a queued or running job',
  })
  async cancelJob(@Param('id') id: string) {
    await this.jobQueue.cancelJob(id);
    return { message: 'Job canceled', jobId: id };
  }

  @Get('qc/issues')
  @UseGuards(AdminGuard)
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
  @UseGuards(AdminGuard)
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
