import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUserIdentity,
  CurrentUser,
  JwtAuthGuard,
  RequireAnyPermission,
  RequirePermissions,
} from '@patina/auth';
import {
  MEDIA_ADMIN_PERMISSION,
  MEDIA_MANAGE_PERMISSIONS,
  MEDIA_READ_PERMISSIONS,
} from '../authorization/media-authorization.constants';
import { AssetsService } from './assets.service';
import {
  BulkDeleteAssetsDto,
  BulkUpdateAssetsDto,
  CopyAssetsDto,
  MoveAssetsDto,
  PurgeCdnDto,
  ReorderAssetsDto,
  UpdateAssetDto,
} from './dto';

@ApiTags('Media Assets')
@Controller('v1/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get('assets/:id')
  @RequireAnyPermission(...MEDIA_READ_PERMISSIONS)
  @ApiOperation({ summary: 'Get asset metadata' })
  getAsset(@CurrentUser() identity: AuthenticatedUserIdentity, @Param('id') id: string) {
    return this.assetsService.getAsset(identity.sub, id);
  }

  @Get('assets/:id/renditions')
  @RequireAnyPermission(...MEDIA_READ_PERMISSIONS)
  @ApiOperation({ summary: 'List asset renditions' })
  getRenditions(@CurrentUser() identity: AuthenticatedUserIdentity, @Param('id') id: string) {
    return this.assetsService.getRenditions(identity.sub, id);
  }

  @Get('search')
  @RequireAnyPermission(...MEDIA_READ_PERMISSIONS)
  @ApiOperation({ summary: 'Search media assets' })
  searchAssets(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Query('productId') productId?: string,
    @Query('variantId') variantId?: string,
    @Query('kind') kind?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('limit') limit = 20,
    @Query('cursor') cursor?: string,
  ) {
    return this.assetsService.searchAssets(identity.sub, {
      productId,
      variantId,
      kind,
      role,
      status,
      limit,
      cursor,
    });
  }

  @Patch('assets/:id')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @ApiOperation({ summary: 'Update asset metadata' })
  updateAsset(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('id') id: string,
    @Body() updates: UpdateAssetDto,
  ) {
    return this.assetsService.updateAsset(identity.sub, id, updates);
  }

  @Delete('assets/:id')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @ApiOperation({ summary: 'Delete asset' })
  deleteAsset(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('id') id: string,
    @Query('softDelete') softDelete = true,
    @Query('purgeCdn') purgeCdn = true,
  ) {
    return this.assetsService.deleteAsset(identity.sub, id, softDelete, purgeCdn);
  }

  @Post('assets/bulk-update')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  bulkUpdateAssets(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Body() dto: BulkUpdateAssetsDto,
  ) {
    return this.assetsService.bulkUpdateAssets(identity.sub, dto);
  }

  @Post('assets/bulk-delete')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  bulkDeleteAssets(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Body() dto: BulkDeleteAssetsDto,
  ) {
    return this.assetsService.bulkDeleteAssets(identity.sub, dto);
  }

  @Post('assets/move')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  moveAssets(@CurrentUser() identity: AuthenticatedUserIdentity, @Body() dto: MoveAssetsDto) {
    return this.assetsService.moveAssets(identity.sub, dto);
  }

  @Post('assets/copy')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  copyAssets(@CurrentUser() identity: AuthenticatedUserIdentity, @Body() dto: CopyAssetsDto) {
    return this.assetsService.copyAssets(identity.sub, dto);
  }

  @Post('assets/:productId/reorder')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  reorderAssets(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('productId') productId: string,
    @Body() dto: ReorderAssetsDto,
  ) {
    return this.assetsService.reorderAssets(identity.sub, productId, dto);
  }

  @Post('cdn/purge')
  @RequirePermissions(MEDIA_ADMIN_PERMISSION)
  @HttpCode(HttpStatus.OK)
  purgeCdn(@CurrentUser() identity: AuthenticatedUserIdentity, @Body() dto: PurgeCdnDto) {
    return this.assetsService.purgeCdn(identity.sub, dto);
  }

  @Post('cdn/purge/:productId')
  @RequirePermissions(MEDIA_ADMIN_PERMISSION)
  @HttpCode(HttpStatus.OK)
  purgeCdnForProduct(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('productId') productId: string,
    @Query('includeRenditions') includeRenditions = true,
  ) {
    return this.assetsService.purgeCdn(identity.sub, { productId, includeRenditions });
  }

  @Post('assets/:id/reprocess')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.ACCEPTED)
  reprocessAsset(@CurrentUser() identity: AuthenticatedUserIdentity, @Param('id') id: string) {
    return this.assetsService.reprocessAsset(identity.sub, id);
  }

  @Get('3d/:assetId/preview')
  @RequireAnyPermission(...MEDIA_READ_PERMISSIONS)
  get3DPreview(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('assetId') assetId: string,
  ) {
    return this.assetsService.get3DPreview(identity.sub, assetId);
  }
}
