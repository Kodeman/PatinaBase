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
  UploadedFile,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
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
  UploadMediaDto,
  BatchUploadMediaDto,
  ProcessMediaDto,
  BatchProcessMediaDto,
  UpdateMediaMetadataDto,
  MediaQueryDto,
  MediaResponseDto,
  MediaListResponseDto,
} from './dto';
import { JwtAuthGuard } from '@patina/auth';
import { CurrentUser } from '@patina/auth';

@ApiTags('Media')
@Controller('v1/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Upload single media asset
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload single media asset',
    description: 'Upload a single media file (image, video, or 3D model)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'Media asset uploaded successfully',
    schema: {
      example: {
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        uploadSessionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        uploadUrl: 'https://objectstorage.us-ashburn-1.oraclecloud.com/p/...',
        expiresAt: '2025-10-06T12:30:00Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or file validation failed',
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(
    @CurrentUser('userId') userId: string,
    @Body() dto: UploadMediaDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.mediaService.uploadSingle(userId || 'anonymous', dto, file?.buffer);
  }

  /**
   * Upload multiple media assets (batch)
   */
  @Post('upload/batch')
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
    @CurrentUser('userId') userId: string,
    @Body() dto: BatchUploadMediaDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.mediaService.uploadBatch(userId || 'anonymous', dto);
  }

  /**
   * Get media asset by ID
   */
  @Get(':id')
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
    @Param('id') id: string,
    @Query('incrementViewCount') incrementViewCount?: boolean,
  ): Promise<MediaResponseDto> {
    return this.mediaService.getById(id, incrementViewCount || false);
  }

  /**
   * Search/query media assets
   */
  @Get()
  @ApiOperation({
    summary: 'Search media assets',
    description: 'Search and filter media assets with pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Media assets retrieved successfully',
    type: MediaListResponseDto,
  })
  async search(@Query() query: MediaQueryDto): Promise<MediaListResponseDto> {
    return this.mediaService.search(query);
  }

  /**
   * Update media asset metadata
   */
  @Put(':id/metadata')
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
    @Param('id') id: string,
    @Body() dto: UpdateMediaMetadataDto,
  ): Promise<MediaResponseDto> {
    return this.mediaService.updateMetadata(id, dto);
  }

  /**
   * Delete media asset
   */
  @Delete(':id')
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
    @Param('id') id: string,
    @Query('hardDelete') hardDelete?: boolean,
  ) {
    return this.mediaService.delete(id, !hardDelete);
  }

  /**
   * Process media asset
   */
  @Post(':id/process')
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
  async processAsset(@Param('id') id: string, @Body() dto: Partial<ProcessMediaDto>) {
    return this.mediaService.processMedia({
      assetId: id,
      ...dto,
    });
  }

  /**
   * Process multiple media assets (batch)
   */
  @Post('process/batch')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Process multiple media assets',
    description: 'Queue multiple media assets for processing',
  })
  @ApiResponse({
    status: 202,
    description: 'Batch processing jobs queued successfully',
  })
  async processBatch(@Body() dto: BatchProcessMediaDto) {
    return this.mediaService.processBatch(dto);
  }

  /**
   * Get media asset download URL
   */
  @Get(':id/download')
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
  async getDownloadUrl(@Param('id') id: string) {
    const asset = await this.mediaService.getById(id);

    // Increment download count
    await this.mediaService['prisma'].mediaAsset.update({
      where: { id },
      data: {
        downloadCount: { increment: 1 },
      },
    });

    // In production, generate a time-limited presigned URL from OCI
    return {
      assetId: id,
      downloadUrl: asset.uri || asset.rawKey,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    };
  }

  /**
   * Get media statistics
   */
  @Get('stats/overview')
  @ApiOperation({
    summary: 'Get media statistics',
    description: 'Get overview statistics for media assets',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getStats(@Query('productId') productId?: string) {
    const where: any = {};
    if (productId) where.productId = productId;

    const [total, images, videos, models, pending, processing, completed, failed] =
      await Promise.all([
        this.mediaService['prisma'].mediaAsset.count({ where }),
        this.mediaService['prisma'].mediaAsset.count({
          where: { ...where, kind: 'image' },
        }),
        this.mediaService['prisma'].mediaAsset.count({
          where: { ...where, kind: 'video' },
        }),
        this.mediaService['prisma'].mediaAsset.count({
          where: { ...where, kind: 'model3d' },
        }),
        this.mediaService['prisma'].mediaAsset.count({
          where: { ...where, status: 'pending' },
        }),
        this.mediaService['prisma'].mediaAsset.count({
          where: { ...where, status: 'processing' },
        }),
        this.mediaService['prisma'].mediaAsset.count({
          where: { ...where, status: 'completed' },
        }),
        this.mediaService['prisma'].mediaAsset.count({
          where: { ...where, status: 'failed' },
        }),
      ]);

    return {
      total,
      byKind: {
        images,
        videos,
        models,
      },
      byStatus: {
        pending,
        processing,
        completed,
        failed,
      },
    };
  }
}
