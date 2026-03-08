import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AnalyticsService } from './analytics.service';
import { PrismaClient } from '../../generated/prisma-client';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: PrismaClient;
  let eventEmitter: EventEmitter2;

  const mockPrisma = {
    assetAnalytics: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    mediaAsset: {
      findMany: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        BANDWIDTH_COST_PER_GB: 0.085,
        STORAGE_COST_PER_GB: 0.025,
      };
      return config[key];
    }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaClient>(PrismaClient);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackView', () => {
    it('should track asset view event', async () => {
      const event = {
        assetId: 'asset-1',
        userId: 'user-1',
        duration: 30,
        source: 'catalog' as const,
      };

      mockPrisma.assetAnalytics.upsert.mockResolvedValue({});

      await service.trackView(event);

      expect(mockPrisma.assetAnalytics.upsert).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('asset.viewed', event);
    });

    it('should increment view count for existing analytics', async () => {
      const event = {
        assetId: 'asset-1',
        source: 'search' as const,
      };

      await service.trackView(event);

      expect(mockPrisma.assetAnalytics.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            viewCount: { increment: 1 },
          }),
        }),
      );
    });
  });

  describe('trackDownload', () => {
    it('should track asset download event', async () => {
      const event = {
        assetId: 'asset-1',
        userId: 'user-1',
        sizeBytes: 1024000,
      };

      mockPrisma.assetAnalytics.upsert.mockResolvedValue({});

      await service.trackDownload(event);

      expect(mockPrisma.assetAnalytics.upsert).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('asset.downloaded', event);
    });
  });

  describe('getAssetMetrics', () => {
    it('should calculate asset metrics from analytics', async () => {
      const assetId = 'asset-1';
      const mockAnalytics = [
        {
          assetId,
          period: new Date(),
          viewCount: 100,
          downloadCount: 20,
          totalViewDuration: 3000,
          uniqueViewers: ['user-1', 'user-2'],
          sources: { catalog: 60, search: 40 },
          lastViewed: new Date(),
          lastDownloaded: new Date(),
        },
      ];

      mockPrisma.assetAnalytics.findMany.mockResolvedValue(mockAnalytics);

      const result = await service.getAssetMetrics(assetId, 30);

      expect(result.assetId).toBe(assetId);
      expect(result.viewCount).toBe(100);
      expect(result.downloadCount).toBe(20);
      expect(result.avgViewDuration).toBe(30);
      expect(result.topSources).toBeDefined();
      expect(result.engagementScore).toBeGreaterThan(0);
    });

    it('should handle assets with no analytics', async () => {
      mockPrisma.assetAnalytics.findMany.mockResolvedValue([]);

      const result = await service.getAssetMetrics('asset-1', 30);

      expect(result.viewCount).toBe(0);
      expect(result.downloadCount).toBe(0);
    });
  });

  describe('getBandwidthMetrics', () => {
    it('should calculate bandwidth metrics for period', async () => {
      const mockAnalytics = [
        {
          assetId: 'asset-1',
          bandwidthBytes: 5000000,
          downloadCount: 50,
          asset: { mimeType: 'image/jpeg' },
        },
      ];

      mockPrisma.assetAnalytics.findMany.mockResolvedValue(mockAnalytics);

      const result = await service.getBandwidthMetrics('month');

      expect(result.totalBytes).toBe(5000000);
      expect(result.requestCount).toBe(50);
      expect(result.costEstimate).toBeGreaterThan(0);
      expect(result.breakdown).toBeDefined();
    });
  });

  describe('getStorageMetrics', () => {
    it('should calculate storage metrics', async () => {
      const mockAssets = [
        {
          kind: 'IMAGE',
          mimeType: 'image/jpeg',
          status: 'READY',
          sizeBytes: 2000000,
          createdAt: new Date(),
        },
        {
          kind: 'MODEL_3D',
          mimeType: 'model/gltf-binary',
          status: 'READY',
          sizeBytes: 5000000,
          createdAt: new Date(),
        },
      ];

      mockPrisma.mediaAsset.findMany.mockResolvedValue(mockAssets);
      mockPrisma.assetAnalytics.findMany.mockResolvedValue([]);

      const result = await service.getStorageMetrics();

      expect(result.totalAssets).toBe(2);
      expect(result.totalSizeBytes).toBe(7000000);
      expect(result.breakdown.byKind).toBeDefined();
      expect(result.breakdown.byFormat).toBeDefined();
      expect(result.breakdown.byStatus).toBeDefined();
      expect(result.growth).toBeDefined();
      expect(result.costEstimate).toBeDefined();
    });
  });

  describe('calculateEngagementScore', () => {
    it('should calculate engagement score with all factors', () => {
      const data = {
        viewCount: 100,
        downloadCount: 25,
        avgViewDuration: 30,
        uniqueViewers: 50,
        lastViewed: new Date(),
      };

      const result = service.calculateEngagementScore(data);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.factors).toBeDefined();
      expect(result.trend).toMatch(/^(increasing|stable|decreasing)$/);
    });

    it('should handle zero values gracefully', () => {
      const data = {
        viewCount: 0,
        downloadCount: 0,
        avgViewDuration: 0,
        uniqueViewers: 0,
      };

      const result = service.calculateEngagementScore(data);

      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTopPerformingAssets', () => {
    it('should return top performing assets by engagement', async () => {
      const mockAnalytics = [
        {
          assetId: 'asset-1',
          period: new Date(),
          viewCount: 100,
          downloadCount: 20,
          totalViewDuration: 3000,
          uniqueViewers: ['user-1', 'user-2'],
          lastViewed: new Date(),
        },
      ];

      mockPrisma.assetAnalytics.findMany.mockResolvedValue(mockAnalytics);

      const result = await service.getTopPerformingAssets(10, 'engagement');

      expect(result).toBeInstanceOf(Array);
      result.forEach((item) => {
        expect(item.assetId).toBeDefined();
        expect(item.score).toBeGreaterThanOrEqual(0);
        expect(item.metrics).toBeDefined();
      });
    });

    it('should sort by views when specified', async () => {
      const mockAnalytics = [
        {
          assetId: 'asset-1',
          period: new Date(),
          viewCount: 100,
          downloadCount: 5,
        },
        {
          assetId: 'asset-2',
          period: new Date(),
          viewCount: 200,
          downloadCount: 10,
        },
      ];

      mockPrisma.assetAnalytics.findMany.mockResolvedValue(mockAnalytics);

      const result = await service.getTopPerformingAssets(2, 'views');

      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    });
  });
});
