import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import {
  BatchUploadMediaDto,
  ProcessMediaDto,
  BatchProcessMediaDto,
  UpdateMediaMetadataDto,
  MediaQueryDto,
  MediaResponseDto,
  MediaListResponseDto,
} from './dto';
import {
  AuthenticatedUserIdentity,
  CurrentUser,
  JwtAuthGuard,
  RequireAnyPermission,
} from '@patina/auth';
import {
  MEDIA_MANAGE_PERMISSIONS,
  MEDIA_READ_PERMISSIONS,
} from '../authorization/media-authorization.constants';

@ApiTags('Media')
@Controller('v1/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Upload multiple media assets (batch)
   */
  @Post('upload/batch')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload multiple media assets',
    description: 'Upload multiple media files in a single request',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'Batch upload completed',
  })
  @UseInterceptors(FilesInterceptor('files', 20)) // Max 20 files
  async uploadBatch(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Body() dto: BatchUploadMediaDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.mediaService.uploadBatch(identity.sub, dto);
  }

  /**
   * Get media asset by ID
   */
  @Get(':id')
  @RequireAnyPermission(...MEDIA_READ_PERMISSIONS)
  @ApiOperation({
    summary: 'Get media asset by ID',
    description: 'Retrieve a single media asset by its ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Media asset ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({
    name: 'incrementViewCount',
    required: false,
    type: Boolean,
    description: 'Whether to increment view count',
  })
  @ApiResponse({
    status: 200,
    description: 'Media asset retrieved successfully',
    type: MediaResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Media asset not found',
  })
  async getById(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('id') id: string,
    @Query('incrementViewCount') incrementViewCount?: boolean,
  ): Promise<MediaResponseDto> {
    return this.mediaService.getById(identity.sub, id, incrementViewCount || false);
  }

  /**
   * Search/query media assets
   */
  @Get()
  @RequireAnyPermission(...MEDIA_READ_PERMISSIONS)
  @ApiOperation({
    summary: 'Search media assets',
    description: 'Search and filter media assets with pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Media assets retrieved successfully',
    type: MediaListResponseDto,
  })
  async search(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Query() query: MediaQueryDto,
  ): Promise<MediaListResponseDto> {
    return this.mediaService.search(identity.sub, query);
  }

  /**
   * Update media asset metadata
   */
  @Put(':id/metadata')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @ApiOperation({
    summary: 'Update media asset metadata',
    description: 'Update metadata for a media asset (tags, role, permissions, etc.)',
  })
  @ApiParam({
    name: 'id',
    description: 'Media asset ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Metadata updated successfully',
    type: MediaResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Media asset not found',
  })
  async updateMetadata(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateMediaMetadataDto,
  ): Promise<MediaResponseDto> {
    return this.mediaService.updateMetadata(identity.sub, id, dto);
  }

  /**
   * Delete media asset
   */
  @Delete(':id')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete media asset',
    description: 'Delete a media asset (soft delete by default)',
  })
  @ApiParam({
    name: 'id',
    description: 'Media asset ID',
  })
  @ApiQuery({
    name: 'hardDelete',
    required: false,
    type: Boolean,
    description: 'Whether to permanently delete (true) or archive (false, default)',
  })
  @ApiResponse({
    status: 200,
    description: 'Media asset deleted successfully',
    schema: {
      example: {
        success: true,
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        deleted: true,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Media asset not found',
  })
  async delete(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('id') id: string,
    @Query('hardDelete') hardDelete?: boolean,
  ) {
    return this.mediaService.delete(identity.sub, id, !hardDelete);
  }

  /**
   * Process media asset
   */
  @Post(':id/process')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Process media asset',
    description: 'Queue a media asset for processing (thumbnails, optimization, etc.)',
  })
  @ApiParam({
    name: 'id',
    description: 'Media asset ID',
  })
  @ApiResponse({
    status: 202,
    description: 'Processing job queued successfully',
    schema: {
      example: {
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        jobId: 'job-123456',
        status: 'processing',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Media asset not found',
  })
  async processAsset(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('id') id: string,
    @Body() dto: Partial<ProcessMediaDto>,
  ) {
    return this.mediaService.processMedia(identity.sub, {
      ...dto,
      assetId: id,
    });
  }

  /**
   * Process multiple media assets (batch)
   */
  @Post('process/batch')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Process multiple media assets',
    description: 'Queue multiple media assets for processing',
  })
  @ApiResponse({
    status: 202,
    description: 'Batch processing jobs queued successfully',
  })
  async processBatch(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Body() dto: BatchProcessMediaDto,
  ) {
    return this.mediaService.processBatch(identity.sub, dto);
  }

  /**
   * Get media asset download URL
   */
  @Get(':id/download')
  @RequireAnyPermission(...MEDIA_READ_PERMISSIONS)
  @ApiOperation({
    summary: 'Get download URL for media asset',
    description: 'Generate a time-limited download URL for a media asset',
  })
  @ApiParam({
    name: 'id',
    description: 'Media asset ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Download URL generated successfully',
    schema: {
      example: {
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        downloadUrl: 'https://objectstorage.us-ashburn-1.oraclecloud.com/p/...',
        expiresAt: '2025-10-06T13:00:00Z',
      },
    },
  })
  async getDownloadUrl(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('id') id: string,
  ) {
    return this.mediaService.getDownloadUrl(identity.sub, id);
  }

  /**
   * Get media statistics
   */
  @Get('stats/overview')
  @RequireAnyPermission(...MEDIA_READ_PERMISSIONS)
  @ApiOperation({
    summary: 'Get media statistics',
    description: 'Get overview statistics for media assets',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getStats(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Query('productId') productId?: string,
  ) {
    return this.mediaService.getStats(identity.sub, productId);
  }
}
