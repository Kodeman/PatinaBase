import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, RequirePermissions } from '@patina/auth';
import { PrismaClient } from '../../generated/prisma-client';
import { AssetsService } from './assets.service';
import {
  BulkUpdateAssetsDto,
  BulkDeleteAssetsDto,
  MoveAssetsDto,
  CopyAssetsDto,
  ReorderAssetsDto,
  UpdateAssetDto,
  PurgeCdnDto,
} from './dto';

@ApiTags('Media Assets')
@Controller('v1/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AssetsController {
  constructor(
    private assetsService: AssetsService,
    private prisma: PrismaClient,
  ) {}

  @Get('assets/:id')
  @RequirePermissions('media.asset.read')
  @ApiOperation({
    summary: 'Get asset metadata',
    description: 'Retrieve complete metadata for a media asset including renditions and 3D data',
  })
  @ApiResponse({
    status: 200,
    description: 'Asset metadata retrieved successfully',
  })
  async getAsset(@Param('id') id: string) {
    return this.assetsService.getAsset(id);
  }

  @Get('assets/:id/renditions')
  @RequirePermissions('media.asset.read')
  @ApiOperation({
    summary: 'List asset renditions',
    description: 'Get all available renditions for an image asset',
  })
  async getRenditions(@Param('id') id: string) {
    const renditions = await this.prisma.assetRendition.findMany({
      where: { assetId: id },
      orderBy: { width: 'asc' },
    });

    return { data: renditions, count: renditions.length };
  }

  @Get('search')
  @RequirePermissions('media.asset.read')
  @ApiOperation({
    summary: 'Search media assets',
    description: 'Search and filter media assets by various criteria',
  })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'variantId', required: false })
  @ApiQuery({ name: 'kind', required: false, enum: ['IMAGE', 'MODEL3D'] })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false })
  async searchAssets(
    @Query('productId') productId?: string,
    @Query('variantId') variantId?: string,
    @Query('kind') kind?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('limit') limit = 20,
    @Query('cursor') cursor?: string,
  ) {
    const where: any = {};

    if (productId) where.productId = productId;
    if (variantId) where.variantId = variantId;
    if (kind) where.kind = kind;
    if (role) where.role = role;
    if (status) where.status = status;

    const assets = await this.prisma.mediaAsset.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        renditions: { take: 3 },
        threeD: true,
      },
    });

    const hasMore = assets.length > limit;
    const data = hasMore ? assets.slice(0, -1) : assets;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      meta: {
        count: data.length,
        nextCursor,
        hasMore,
      },
    };
  }

  @Patch('assets/:id')
  @RequirePermissions('media.asset.update')
  @ApiOperation({
    summary: 'Update asset metadata',
    description: 'Update asset fields such as role, product links, and license information',
  })
  async updateAsset(@Param('id') id: string, @Body() updates: UpdateAssetDto) {
    return this.assetsService.updateAsset(id, updates);
  }

  @Delete('assets/:id')
  @RequirePermissions('media.asset.delete')
  @ApiOperation({
    summary: 'Delete asset',
    description: 'Delete a single asset (soft delete by default)',
  })
  @ApiResponse({
    status: 200,
    description: 'Asset deleted successfully',
  })
  async deleteAsset(
    @Param('id') id: string,
    @Query('softDelete') softDelete = true,
    @Query('purgeCdn') purgeCdn = true,
  ) {
    return this.assetsService.deleteAsset(id, softDelete, purgeCdn);
  }

  @Post('assets/bulk-update')
  @RequirePermissions('media.asset.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk update assets',
    description: 'Update multiple assets with the same changes',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk update completed',
    schema: {
      example: {
        success: 10,
        failed: 2,
        errors: [
          { assetId: 'uuid1', error: 'Asset not found' },
          { assetId: 'uuid2', error: 'Invalid role' },
        ],
      },
    },
  })
  async bulkUpdateAssets(@Body() dto: BulkUpdateAssetsDto) {
    return this.assetsService.bulkUpdateAssets(dto);
  }

  @Post('assets/bulk-delete')
  @RequirePermissions('media.asset.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk delete assets',
    description: 'Delete multiple assets (soft or hard delete)',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk delete completed or job queued',
  })
  async bulkDeleteAssets(@Body() dto: BulkDeleteAssetsDto) {
    return this.assetsService.bulkDeleteAssets(dto);
  }

  @Post('assets/move')
  @RequirePermissions('media.asset.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move assets between products',
    description: 'Move assets from one product to another',
  })
  @ApiResponse({
    status: 200,
    description: 'Assets moved successfully',
  })
  async moveAssets(@Body() dto: MoveAssetsDto) {
    return this.assetsService.moveAssets(dto);
  }

  @Post('assets/copy')
  @RequirePermissions('media.asset.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Copy assets to another product',
    description: 'Copy assets to a different product/variant',
  })
  @ApiResponse({
    status: 200,
    description: 'Assets copied successfully or job queued',
  })
  async copyAssets(@Body() dto: CopyAssetsDto) {
    return this.assetsService.copyAssets(dto);
  }

  @Post('assets/:productId/reorder')
  @RequirePermissions('media.asset.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reorder product images',
    description: 'Reorder assets for a specific product',
  })
  @ApiResponse({
    status: 200,
    description: 'Assets reordered successfully',
  })
  async reorderAssets(@Param('productId') productId: string, @Body() dto: ReorderAssetsDto) {
    return this.assetsService.reorderAssets(productId, dto);
  }

  @Post('cdn/purge')
  @RequirePermissions('media.cdn.purge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Purge CDN cache',
    description: 'Purge CDN cache by various criteria (use with caution)',
  })
  @ApiResponse({
    status: 200,
    description: 'CDN purge initiated',
    schema: {
      example: {
        invalidationId: 'I1234567890ABC',
        purgedPaths: ['/processed/images/*', '/thumbnails/*'],
      },
    },
  })
  async purgeCdn(@Body() dto: PurgeCdnDto) {
    return this.assetsService.purgeCdn(dto);
  }

  @Post('cdn/purge/:productId')
  @RequirePermissions('media.cdn.purge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Purge CDN cache for product',
    description: 'Purge all images for a specific product from CDN',
  })
  @ApiResponse({
    status: 200,
    description: 'CDN purge initiated for product',
  })
  async purgeCdnForProduct(
    @Param('productId') productId: string,
    @Query('includeRenditions') includeRenditions = true,
  ) {
    return this.assetsService.purgeCdn({
      productId,
      includeRenditions,
    });
  }

  @Post('assets/:id/reprocess')
  @RequirePermissions('media.asset.reprocess')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Reprocess asset',
    description: 'Enqueue asset for reprocessing (e.g., regenerate renditions)',
  })
  async reprocessAsset(@Param('id') id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
    });

    if (!asset) {
      throw new Error('Asset not found');
    }

    // Create reprocess job
    const job = await this.prisma.processJob.create({
      data: {
        assetId: id,
        type: asset.kind === 'IMAGE' ? 'IMAGE_PROCESS' : 'MODEL3D_CONVERT',
        state: 'QUEUED',
      },
    });

    return {
      message: 'Asset queued for reprocessing',
      jobId: job.id,
      assetId: id,
    };
  }

  @Get('3d/:assetId/preview')
  @RequirePermissions('media.asset.read')
  @ApiOperation({
    summary: 'Get 3D asset preview',
    description: 'Retrieve preview snapshots and metadata for a 3D asset',
  })
  async get3DPreview(@Param('assetId') assetId: string) {
    const threeD = await this.prisma.threeDAsset.findUnique({
      where: { assetId },
      include: {
        asset: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!threeD) {
      throw new Error('3D asset not found');
    }

    return {
      assetId,
      dimensions: {
        width: threeD.widthM,
        height: threeD.heightM,
        depth: threeD.depthM,
        volume: threeD.volumeM3,
      },
      geometry: {
        triangles: threeD.triCount,
        nodes: threeD.nodeCount,
        materials: threeD.materialCount,
        textures: threeD.textureCount,
      },
      snapshots: threeD.snapshots,
      arReady: threeD.arReady,
      lods: threeD.lods,
      files: {
        glb: threeD.glbKey,
        usdz: threeD.usdzKey,
      },
    };
  }
}
