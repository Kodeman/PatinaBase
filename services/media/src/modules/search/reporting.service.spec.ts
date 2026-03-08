import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReportingService } from './reporting.service';
import { AnalyticsService } from './analytics.service';
import { IntelligenceService } from './intelligence.service';
import { PrismaClient } from '../../generated/prisma-client';

describe('ReportingService', () => {
  let service: ReportingService;
  let analytics: AnalyticsService;
  let intelligence: IntelligenceService;

  const mockPrisma = {
    mediaAsset: {
      findMany: jest.fn(),
    },
    assetAnalytics: {
      findMany: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn(),
  };

  const mockAnalytics = {
    getStorageMetrics: jest.fn(),
    getBandwidthMetrics: jest.fn(),
    getTopPerformingAssets: jest.fn(),
    getAssetMetrics: jest.fn(),
  };

  const mockIntelligence = {
    detectMissingAssets: jest.fn(),
    detectDuplicates: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportingService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: IntelligenceService, useValue: mockIntelligence },
      ],
    }).compile();

    service = module.get<ReportingService>(ReportingService);
    analytics = module.get<AnalyticsService>(AnalyticsService);
    intelligence = module.get<IntelligenceService>(IntelligenceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateUsageReport', () => {
    it('should generate comprehensive usage report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const mockAssets = [
        {
          id: 'asset-1',
          kind: 'IMAGE',
          role: 'HERO',
          productId: 'product-1',
          sizeBytes: 2000000,
          product: { name: 'Modern Sofa' },
          createdAt: new Date('2024-01-15'),
        },
      ];

      const mockAnalyticsData = [
        {
          assetId: 'asset-1',
          period: new Date('2024-01-15'),
          viewCount: 100,
          downloadCount: 20,
          bandwidthBytes: 5000000,
        },
      ];

      mockPrisma.mediaAsset.findMany.mockResolvedValue(mockAssets);
      mockPrisma.assetAnalytics.findMany.mockResolvedValue(mockAnalyticsData);
      mockAnalytics.getTopPerformingAssets.mockResolvedValue([
        {
          assetId: 'asset-1',
          score: 0.9,
          metrics: {
            viewCount: 100,
            downloadCount: 20,
            engagementScore: 0.9,
          },
        },
      ]);

      const result = await service.generateUsageReport(startDate, endDate);

      expect(result.period.start).toEqual(startDate);
      expect(result.period.end).toEqual(endDate);
      expect(result.summary).toBeDefined();
      expect(result.summary.totalAssets).toBe(1);
      expect(result.summary.totalViews).toBe(100);
      expect(result.summary.totalDownloads).toBe(20);
      expect(result.breakdown).toBeDefined();
      expect(result.trends).toBeDefined();
      expect(result.topAssets).toBeInstanceOf(Array);
    });
  });

  describe('generatePerformanceDashboard', () => {
    it('should generate performance dashboard', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          status: 'READY',
          quality: { sharpness: 0.8, isLowQuality: false },
          product: { name: 'Modern Sofa' },
        },
        {
          id: 'asset-2',
          status: 'READY',
          quality: { sharpness: 0.3, isLowQuality: true },
          product: { name: 'Classic Chair' },
        },
      ];

      mockPrisma.mediaAsset.findMany.mockResolvedValue(mockAssets);
      mockAnalytics.getTopPerformingAssets.mockResolvedValue([
        { assetId: 'asset-1', score: 0.9, metrics: {} },
      ]);
      mockIntelligence.detectMissingAssets.mockResolvedValue([]);

      const result = await service.generatePerformanceDashboard();

      expect(result.overview).toBeDefined();
      expect(result.overview.totalAssets).toBe(2);
      expect(result.performance).toBeDefined();
      expect(result.quality).toBeDefined();
      expect(result.health).toBeDefined();
    });
  });

  describe('generateCostAnalysis', () => {
    it('should generate cost analysis report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockAnalytics.getStorageMetrics.mockResolvedValue({
        totalAssets: 100,
        totalSizeBytes: 10000000000,
        costEstimate: {
          storage: 250,
          bandwidth: 850,
          total: 1100,
        },
      });

      mockAnalytics.getBandwidthMetrics.mockResolvedValue({
        totalBytes: 50000000000,
        costEstimate: 850,
      });

      mockPrisma.mediaAsset.findMany.mockResolvedValue([
        {
          kind: 'IMAGE',
          sizeBytes: 5000000,
          createdAt: new Date('2024-01-15'),
        },
      ]);

      const result = await service.generateCostAnalysis(startDate, endDate);

      expect(result.period.start).toEqual(startDate);
      expect(result.period.end).toEqual(endDate);
      expect(result.costs).toBeDefined();
      expect(result.costs.total).toBeGreaterThan(0);
      expect(result.projections).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should provide cost-saving recommendations', async () => {
      mockAnalytics.getStorageMetrics.mockResolvedValue({
        totalAssets: 100,
        totalSizeBytes: 10000000000,
        costEstimate: { storage: 250, bandwidth: 850, total: 1100 },
      });

      mockAnalytics.getBandwidthMetrics.mockResolvedValue({
        totalBytes: 50000000000,
        costEstimate: 850,
      });

      // Mock large images
      mockPrisma.mediaAsset.findMany.mockResolvedValue([
        {
          kind: 'IMAGE',
          sizeBytes: 10 * 1024 * 1024, // 10MB
          mimeType: 'image/jpeg',
          createdAt: new Date(),
        },
      ]);

      const result = await service.generateCostAnalysis(
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(result.recommendations.length).toBeGreaterThan(0);
      const storageRec = result.recommendations.find((r) => r.type === 'storage');
      expect(storageRec).toBeDefined();
    });
  });

  describe('generateOptimizationReport', () => {
    it('should identify optimization opportunities', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          mimeType: 'image/jpeg',
          sizeBytes: 3000000,
        },
        {
          id: 'asset-2',
          mimeType: 'image/jpeg',
          sizeBytes: 2500000,
        },
      ];

      mockPrisma.mediaAsset.findMany.mockResolvedValue(mockAssets);
      mockIntelligence.detectDuplicates.mockResolvedValue({
        duplicates: [],
        totalFound: 0,
      });

      const result = await service.generateOptimizationReport();

      expect(result.summary).toBeDefined();
      expect(result.opportunities).toBeInstanceOf(Array);
      expect(result.actions).toBeInstanceOf(Array);
      expect(result.impact).toBeDefined();
    });

    it('should recommend format conversion for JPEG images', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          mimeType: 'image/jpeg',
          sizeBytes: 5000000,
        },
      ];

      mockPrisma.mediaAsset.findMany.mockResolvedValue(mockAssets);
      mockIntelligence.detectDuplicates.mockResolvedValue({
        duplicates: [],
        totalFound: 0,
      });

      const result = await service.generateOptimizationReport();

      const formatOpportunity = result.opportunities.find((o) => o.type === 'format');
      expect(formatOpportunity).toBeDefined();
      expect(formatOpportunity?.description).toContain('WebP');
    });
  });

  describe('exportReportAsCSV', () => {
    it('should export report as CSV format', async () => {
      const report = {
        period: { start: new Date(), end: new Date() },
        summary: {
          totalAssets: 100,
          totalViews: 5000,
          totalDownloads: 1000,
          totalBandwidth: 50000000,
          totalStorage: 10000000,
        },
        breakdown: {
          byProduct: [
            { productId: 'p1', productName: 'Sofa', assetCount: 10, views: 500 },
          ],
          byKind: {
            IMAGE: { count: 80, views: 4000, downloads: 800 },
          },
          byRole: {
            HERO: { count: 20, views: 2000 },
          },
        },
        trends: {
          viewsTrend: [100, 150, 200],
          downloadsTrend: [20, 30, 40],
          uploadsTrend: [5, 10, 8],
        },
        topAssets: [],
      };

      const csv = await service.exportReportAsCSV(report);

      expect(csv).toContain('Type,Metric,Value');
      expect(csv).toContain('Summary,Total Assets,100');
      expect(csv).toContain('Summary,Total Views,5000');
    });
  });

  describe('exportReportAsJSON', () => {
    it('should export report as JSON format', async () => {
      const report = {
        summary: { totalAssets: 100 },
      };

      const json = await service.exportReportAsJSON(report);
      const parsed = JSON.parse(json);

      expect(parsed.summary.totalAssets).toBe(100);
    });
  });
});
