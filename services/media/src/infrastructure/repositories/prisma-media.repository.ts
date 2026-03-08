/**
 * Prisma Media Repository Implementation
 * Implements IMediaRepository using Prisma ORM
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient, MediaAsset, AssetRendition, ThreeDAsset } from '../../generated/prisma-client';
import {
  IMediaRepository,
  MediaQuery,
  PaginatedResult,
  CreateMediaAssetCommand,
  UpdateMediaAssetCommand,
} from '../../domain/repositories/media.repository.interface';

@Injectable()
export class PrismaMediaRepository implements IMediaRepository {
  private readonly logger = new Logger(PrismaMediaRepository.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create a new media asset
   */
  async create(command: CreateMediaAssetCommand): Promise<MediaAsset> {
    this.logger.log(`Creating media asset: ${command.kind}`);

    return this.prisma.mediaAsset.create({
      data: {
        id: command.id,
        kind: command.kind as any,
        productId: command.productId,
        variantId: command.variantId,
        role: command.role as any,
        rawKey: command.rawKey,
        status: (command.status as any) || 'PENDING',
        width: command.width,
        height: command.height,
        format: command.format,
        sizeBytes: command.sizeBytes,
        mimeType: command.mimeType,
        phash: command.phash,
        palette: command.palette,
        blurhash: command.blurhash,
        license: command.license,
        isPublic: command.isPublic ?? false,
        permissions: command.permissions,
        tags: command.tags ?? [],
        uploadedBy: command.uploadedBy,
      },
    });
  }

  /**
   * Find media asset by ID
   */
  async findById(id: string): Promise<MediaAsset | null> {
    return this.prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        renditions: true,
        threeD: true,
      },
    });
  }

  /**
   * Find all media assets matching query (paginated)
   */
  async findAll(query: MediaQuery): Promise<PaginatedResult<MediaAsset>> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (query.kind) where.kind = query.kind;
    if (query.productId) where.productId = query.productId;
    if (query.variantId) where.variantId = query.variantId;
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.uploadedBy) where.uploadedBy = query.uploadedBy;
    if (query.isPublic !== undefined) where.isPublic = query.isPublic;
    if (query.mimeType) where.mimeType = query.mimeType;
    if (query.processedOnly) where.processed = true;

    // Tags filter
    if (query.tags && query.tags.length > 0) {
      where.tags = { hasSome: query.tags };
    }

    // Size filters
    if (query.minSize !== undefined || query.maxSize !== undefined) {
      where.sizeBytes = {};
      if (query.minSize !== undefined) where.sizeBytes.gte = query.minSize;
      if (query.maxSize !== undefined) where.sizeBytes.lte = query.maxSize;
    }

    // Search filter
    if (query.search) {
      where.OR = [
        { rawKey: { contains: query.search, mode: 'insensitive' } },
        { tags: { has: query.search } },
      ];
    }

    // Build orderBy
    const orderBy: any = {};
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    // Execute query with pagination
    const [assets, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          renditions: true,
          threeD: true,
        },
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    this.logger.log(`Found ${assets.length} of ${total} total assets`);

    return {
      data: assets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update media asset by ID
   */
  async update(id: string, command: UpdateMediaAssetCommand): Promise<MediaAsset> {
    this.logger.log(`Updating media asset: ${id}`);

    const updateData: any = {};

    if (command.role !== undefined) updateData.role = command.role;
    if (command.tags !== undefined) updateData.tags = command.tags;
    if (command.isPublic !== undefined) updateData.isPublic = command.isPublic;
    if (command.width !== undefined) updateData.width = command.width;
    if (command.height !== undefined) updateData.height = command.height;
    if (command.format !== undefined) updateData.format = command.format;
    if (command.permissions !== undefined) updateData.permissions = command.permissions;
    if (command.license !== undefined) updateData.license = command.license;
    if (command.palette !== undefined) updateData.palette = command.palette;
    if (command.qcIssues !== undefined) updateData.qcIssues = command.qcIssues;
    if (command.scanResult !== undefined) updateData.scanResult = command.scanResult;
    if (command.status !== undefined) updateData.status = command.status;
    if (command.processed !== undefined) updateData.processed = command.processed;

    return this.prisma.mediaAsset.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Delete media asset by ID (soft delete by default)
   */
  async delete(id: string, softDelete = true): Promise<void> {
    this.logger.log(`Deleting media asset: ${id} (soft: ${softDelete})`);

    if (softDelete) {
      // Soft delete by setting status to BLOCKED
      await this.prisma.mediaAsset.update({
        where: { id },
        data: { status: 'BLOCKED' },
      });
    } else {
      // Hard delete
      await this.prisma.mediaAsset.delete({
        where: { id },
      });
    }
  }

  /**
   * Find asset by perceptual hash
   */
  async findByPhash(phash: string): Promise<MediaAsset | null> {
    return this.prisma.mediaAsset.findFirst({
      where: {
        phash,
        status: { not: 'BLOCKED' as any },
      },
    });
  }

  /**
   * Find assets by product ID
   */
  async findByProductId(productId: string): Promise<MediaAsset[]> {
    return this.prisma.mediaAsset.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Find assets by variant ID
   */
  async findByVariantId(variantId: string): Promise<MediaAsset[]> {
    return this.prisma.mediaAsset.findMany({
      where: { variantId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Increment view count
   */
  async incrementViewCount(id: string): Promise<void> {
    await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        viewCount: { increment: 1 },
      },
    });
  }

  /**
   * Increment download count
   */
  async incrementDownloadCount(id: string): Promise<void> {
    await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        downloadCount: { increment: 1 },
      },
    });
  }

  /**
   * Update asset status
   */
  async updateStatus(id: string, status: string): Promise<MediaAsset> {
    return this.prisma.mediaAsset.update({
      where: { id },
      data: { status: status as any },
    });
  }

  /**
   * Find renditions for an asset
   */
  async findRenditions(assetId: string): Promise<AssetRendition[]> {
    return this.prisma.assetRendition.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find 3D metadata for an asset
   */
  async find3DMetadata(assetId: string): Promise<ThreeDAsset | null> {
    return this.prisma.threeDAsset.findUnique({
      where: { assetId },
    });
  }

  /**
   * Check if asset exists
   */
  async exists(id: string): Promise<boolean> {
    const count = await this.prisma.mediaAsset.count({
      where: { id },
    });
    return count > 0;
  }
}
