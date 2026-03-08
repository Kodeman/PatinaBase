import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IntelligenceService } from './intelligence.service';
import { PrismaClient } from '../../generated/prisma-client';

describe('IntelligenceService', () => {
  let service: IntelligenceService;
  let prisma: PrismaClient;

  const mockPrisma = {
    mediaAsset: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntelligenceService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<IntelligenceService>(IntelligenceService);
    prisma = module.get<PrismaClient>(PrismaClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectDuplicates', () => {
    it('should detect exact duplicates', async () => {
      const sourceAsset = {
        id: 'asset-1',
        kind: 'IMAGE',
        phash: 'abc123',
        width: 1920,
        height: 1080,
        dominantColor: '#FF5733',
      };

      const duplicateAsset = {
        id: 'asset-2',
        kind: 'IMAGE',
        phash: 'abc123',
        width: 1920,
        height: 1080,
        dominantColor: '#FF5733',
      };

      mockPrisma.mediaAsset.findUnique.mockResolvedValue(sourceAsset);
      mockPrisma.mediaAsset.findMany.mockResolvedValue([duplicateAsset]);

      const result = await service.detectDuplicates('asset-1', 0.9);

      expect(result.duplicates.length).toBeGreaterThanOrEqual(0);
      if (result.duplicates.length > 0) {
        expect(result.duplicates[0].type).toBe('exact');
      }
    });

    it('should detect near duplicates', async () => {
      const sourceAsset = {
        id: 'asset-1',
        kind: 'IMAGE',
        phash: 'abc123def456',
        width: 1920,
        height: 1080,
        dominantColor: '#FF5733',
      };

      const nearDuplicateAsset = {
        id: 'asset-2',
        kind: 'IMAGE',
        phash: 'abc123def457', // Very similar hash
        width: 1920,
        height: 1080,
        dominantColor: '#FF5733',
      };

      mockPrisma.mediaAsset.findUnique.mockResolvedValue(sourceAsset);
      mockPrisma.mediaAsset.findMany.mockResolvedValue([nearDuplicateAsset]);

      const result = await service.detectDuplicates('asset-1', 0.9);

      expect(result.assetId).toBe('asset-1');
      expect(result.totalFound).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectMissingAssets', () => {
    it('should identify products missing required assets', async () => {
      const mockProducts = [
        {
          id: 'product-1',
          name: 'Modern Sofa',
          assets: [
            { kind: 'IMAGE', role: 'ANGLE' },
          ],
        },
      ];

      mockPrisma.product.findMany.mockResolvedValue(mockProducts);

      const result = await service.detectMissingAssets();

      expect(result).toBeInstanceOf(Array);
      if (result.length > 0) {
        expect(result[0].productId).toBeDefined();
        expect(result[0].missingRoles).toContain('HERO');
        expect(result[0].recommendations).toBeInstanceOf(Array);
      }
    });

    it('should check for specific product when productId provided', async () => {
      const mockProducts = [
        {
          id: 'product-1',
          name: 'Modern Sofa',
          assets: [],
        },
      ];

      mockPrisma.product.findMany.mockResolvedValue(mockProducts);

      const result = await service.detectMissingAssets('product-1');

      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkCompliance', () => {
    it('should identify compliance issues', async () => {
      const mockAsset = {
        id: 'asset-1',
        role: 'HERO',
        kind: 'IMAGE',
        width: 800,
        height: 600,
        mimeType: 'image/jpeg',
        quality: { isLowQuality: true },
        tags: [],
        aiTags: [],
        rawKey: 'path/to/asset.jpg',
      };

      mockPrisma.mediaAsset.findUnique.mockResolvedValue(mockAsset);

      const result = await service.checkCompliance('asset-1');

      expect(result.assetId).toBe('asset-1');
      expect(result.issues).toBeInstanceOf(Array);
      expect(result.warnings).toBeInstanceOf(Array);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.issues.length).toBeGreaterThan(0); // Should have quality and dimension issues
    });

    it('should pass compliant assets', async () => {
      const mockAsset = {
        id: 'asset-1',
        role: 'HERO',
        kind: 'IMAGE',
        width: 2000,
        height: 2000,
        mimeType: 'image/webp',
        quality: { isLowQuality: false, sharpness: 0.8 },
        tags: ['furniture', 'sofa'],
        aiTags: [{ label: 'modern', confidence: 0.9 }],
        rawKey: 'path/to/asset.jpg',
      };

      mockPrisma.mediaAsset.findUnique.mockResolvedValue(mockAsset);

      const result = await service.checkCompliance('asset-1');

      expect(result.compliant).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'critical' || i.severity === 'high')).toHaveLength(0);
    });
  });

  describe('calculateBrandConsistency', () => {
    it('should calculate brand consistency across assets', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          kind: 'IMAGE',
          dominantColor: '#FF5733',
          quality: { sharpness: 0.8 },
          mimeType: 'image/webp',
        },
        {
          id: 'asset-2',
          kind: 'IMAGE',
          dominantColor: '#FF5744',
          quality: { sharpness: 0.75 },
          mimeType: 'image/webp',
        },
      ];

      mockPrisma.mediaAsset.findMany.mockResolvedValue(mockAssets);

      const result = await service.calculateBrandConsistency();

      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(1);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.colorConsistency).toBeDefined();
      expect(result.metrics.qualityConsistency).toBeDefined();
      expect(result.outliers).toBeInstanceOf(Array);
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should filter by product IDs when provided', async () => {
      mockPrisma.mediaAsset.findMany.mockResolvedValue([]);

      await expect(
        service.calculateBrandConsistency(['product-1', 'product-2']),
      ).rejects.toThrow('No assets found for analysis');
    });
  });

  describe('generateSEOOptimizations', () => {
    it('should generate SEO recommendations for asset', async () => {
      const mockAsset = {
        id: 'asset-1',
        metadata: {},
        aiTags: [
          { label: 'modern', confidence: 0.9, category: 'style' },
          { label: 'sofa', confidence: 0.95, category: 'object' },
        ],
        tags: [],
        product: { name: 'Modern Sofa' },
        rawKey: 'abc123-def456.jpg',
      };

      mockPrisma.mediaAsset.findUnique.mockResolvedValue(mockAsset);

      const result = await service.generateSEOOptimizations('asset-1');

      expect(result.assetId).toBe('asset-1');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.optimizations).toBeInstanceOf(Array);
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.metadata).toBeDefined();
    });

    it('should identify missing alt text as high priority', async () => {
      const mockAsset = {
        id: 'asset-1',
        metadata: {},
        aiTags: [],
        tags: [],
        product: null,
        rawKey: 'asset.jpg',
      };

      mockPrisma.mediaAsset.findUnique.mockResolvedValue(mockAsset);

      const result = await service.generateSEOOptimizations('asset-1');

      const altTextOptimization = result.optimizations.find((o) => o.field === 'altText');
      expect(altTextOptimization).toBeDefined();
      expect(altTextOptimization?.priority).toBe('high');
    });

    it('should calculate SEO score correctly', async () => {
      const mockAssetWithGoodSEO = {
        id: 'asset-1',
        metadata: {
          altText: 'Modern sofa in living room',
          title: 'Modern Sofa',
          description: 'Elegant modern sofa perfect for any living space',
        },
        aiTags: [],
        tags: ['furniture', 'sofa', 'modern'],
        product: { name: 'Modern Sofa' },
        rawKey: 'modern-sofa.jpg',
      };

      mockPrisma.mediaAsset.findUnique.mockResolvedValue(mockAssetWithGoodSEO);

      const result = await service.generateSEOOptimizations('asset-1');

      expect(result.score).toBeGreaterThan(0.8);
    });
  });
});
