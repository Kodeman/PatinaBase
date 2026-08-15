import { AuthenticatedUserIdentity } from '@patina/auth';
import { MediaKind, MediaRole, MediaStatus } from './dto';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

describe('MediaController', () => {
  const subject = '11111111-1111-4111-8111-111111111111';
  const identity: AuthenticatedUserIdentity = {
    id: subject,
    sub: subject,
    userId: subject,
    role: 'authenticated',
  };
  const mockMediaResponse = {
    id: 'asset-123',
    kind: 'IMAGE',
    productId: 'product-123',
    role: 'HERO',
    rawKey: 'raw/images/asset-123/hero.jpg',
    width: 1920,
    height: 1080,
    format: 'webp',
    status: 'READY',
    tags: ['furniture', 'modern'],
    viewCount: 10,
    downloadCount: 5,
    sizeBytes: '2048576',
    mimeType: 'image/jpeg',
    isPublic: true,
    uploadedBy: subject,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  let controller: MediaController;
  let service: jest.Mocked<MediaService>;

  beforeEach(() => {
    service = {
      uploadBatch: jest.fn(),
      getById: jest.fn(),
      search: jest.fn(),
      updateMetadata: jest.fn(),
      delete: jest.fn(),
      processMedia: jest.fn(),
      processBatch: jest.fn(),
      getDownloadUrl: jest.fn(),
      getStats: jest.fn(),
    } as unknown as jest.Mocked<MediaService>;
    controller = new MediaController(service);
  });

  it('binds batch upload to the verified subject', async () => {
    const dto = {
      uploads: [
        {
          kind: MediaKind.IMAGE,
          filename: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        },
      ],
    };
    service.uploadBatch.mockResolvedValue({ total: 1, successful: 1, failed: 0, results: [] });

    await controller.uploadBatch(identity, dto);

    expect(service.uploadBatch).toHaveBeenCalledWith(subject, dto);
  });

  it('gets an asset with verified subject scope', async () => {
    service.getById.mockResolvedValue(mockMediaResponse);
    await expect(controller.getById(identity, 'asset-123', false)).resolves.toEqual(
      mockMediaResponse,
    );
    expect(service.getById).toHaveBeenCalledWith(subject, 'asset-123', false);
  });

  it('passes the view-count flag only after verified subject extraction', async () => {
    service.getById.mockResolvedValue(mockMediaResponse);
    await controller.getById(identity, 'asset-123', true);
    expect(service.getById).toHaveBeenCalledWith(subject, 'asset-123', true);
  });

  it('searches with verified subject scope', async () => {
    const query = {
      kind: MediaKind.IMAGE,
      status: MediaStatus.COMPLETED,
      page: 1,
      limit: 20,
    };
    const result = {
      data: [mockMediaResponse],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    service.search.mockResolvedValue(result);

    await expect(controller.search(identity, query)).resolves.toEqual(result);
    expect(service.search).toHaveBeenCalledWith(subject, query);
  });

  it('updates metadata with verified subject scope', async () => {
    const dto = { tags: ['updated'], role: MediaRole.HERO };
    service.updateMetadata.mockResolvedValue({ ...mockMediaResponse, tags: dto.tags });

    await controller.updateMetadata(identity, 'asset-123', dto);

    expect(service.updateMetadata).toHaveBeenCalledWith(subject, 'asset-123', dto);
  });

  it('soft deletes by default with verified subject scope', async () => {
    service.delete.mockResolvedValue({ success: true, assetId: 'asset-123', deleted: false });

    await controller.delete(identity, 'asset-123');

    expect(service.delete).toHaveBeenCalledWith(subject, 'asset-123', true);
  });

  it('hard deletes only after verified subject extraction', async () => {
    service.delete.mockResolvedValue({ success: true, assetId: 'asset-123', deleted: true });

    await controller.delete(identity, 'asset-123', true);

    expect(service.delete).toHaveBeenCalledWith(subject, 'asset-123', false);
  });

  it('queues route-scoped processing under the verified subject', async () => {
    service.processMedia.mockResolvedValue({
      assetId: 'asset-123',
      jobId: 'job-123',
      status: 'processing',
    });

    await controller.processAsset(identity, 'asset-123', {
      priority: 'high' as any,
    });

    expect(service.processMedia).toHaveBeenCalledWith(subject, {
      assetId: 'asset-123',
      priority: 'high',
    });
  });

  it('delegates download accounting through the scoped service method', async () => {
    const result = {
      assetId: 'asset-123',
      downloadUrl: mockMediaResponse.rawKey,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    };
    service.getDownloadUrl.mockResolvedValue(result);

    await expect(controller.getDownloadUrl(identity, 'asset-123')).resolves.toEqual(result);
    expect(service.getDownloadUrl).toHaveBeenCalledWith(subject, 'asset-123');
  });

  it('delegates statistics to the subject-scoped service query', async () => {
    const stats = {
      total: 10,
      byKind: { images: 8, videos: 0, models: 2 },
      byStatus: { pending: 1, processing: 1, completed: 7, failed: 1 },
    };
    service.getStats.mockResolvedValue(stats);

    await expect(controller.getStats(identity, 'product-123')).resolves.toEqual(stats);
    expect(service.getStats).toHaveBeenCalledWith(subject, 'product-123');
  });
});
