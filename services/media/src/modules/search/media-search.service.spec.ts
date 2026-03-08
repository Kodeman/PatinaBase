import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MediaSearchService } from './media-search.service';
import { PrismaClient } from '../../generated/prisma-client';
import { ColorSearchMode } from './search.types';

describe('MediaSearchService', () => {
  let service: MediaSearchService;
  let prisma: PrismaClient;

  const mockPrisma = {
    mediaAsset: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaSearchService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<MediaSearchService>(MediaSearchService);
    prisma = module.get<PrismaClient>(PrismaClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchBySimilarity', () => {
    it('should search by existing asset ID', async () => {
      const mockAsset = {
        id: 'asset-1',
        embedding: new Array(512).fill(0.5),
      };

      mockPrisma.mediaAsset.findUnique.mockResolvedValue(mockAsset);
      mockPrisma.mediaAsset.findMany.mockResolvedValue([
        {
          id: 'asset-2',
          embedding: new Array(512).fill(0.48),
          kind: 'IMAGE',
          rawKey: 'key-2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.searchBySimilarity({
        sourceAssetId: 'asset-1',
        threshold: 0.9,
        limit: 10,
      });

      expect(result.results).toBeDefined();
      expect(mockPrisma.mediaAsset.findUnique).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
      });
    });

    it('should throw error if source asset has no embedding', async () => {
      mockPrisma.mediaAsset.findUnique.mockResolvedValue({
        id: 'asset-1',
        embedding: null,
      });

      await expect(
        service.searchBySimilarity({
          sourceAssetId: 'asset-1',
          threshold: 0.9,
        }),
      ).rejects.toThrow('Source asset has no embedding');
    });

    it('should throw error if neither sourceAssetId nor sourceImage provided', async () => {
      await expect(
        service.searchBySimilarity({
          threshold: 0.9,
        }),
      ).rejects.toThrow('Either sourceAssetId or sourceImage must be provided');
    });
  });

  describe('searchByColor', () => {
    it('should search by dominant color', async () => {
      mockPrisma.mediaAsset.findMany.mockResolvedValue([
        {
          id: 'asset-1',
          dominantColor: '#FF5733',
          kind: 'IMAGE',
          rawKey: 'key-1',
          tags: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.searchByColor({
        hexColor: '#FF5733',
        mode: ColorSearchMode.DOMINANT,
        tolerance: 20,
      });

      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThanOrEqual(0);
    });

    it('should search by color in palette', async () => {
      mockPrisma.mediaAsset.findMany.mockResolvedValue([
        {
          id: 'asset-1',
          colorPalette: ['#FF5733', '#33FF57', '#3357FF'],
          kind: 'IMAGE',
          rawKey: 'key-1',
          tags: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.searchByColor({
        hexColor: '#FF5733',
        mode: ColorSearchMode.PALETTE,
        tolerance: 30,
      });

      expect(result.results).toBeDefined();
    });

    it('should search by exact color match', async () => {
      mockPrisma.mediaAsset.findMany.mockResolvedValue([
        {
          id: 'asset-1',
          dominantColor: '#FF5733',
          kind: 'IMAGE',
          rawKey: 'key-1',
          tags: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.searchByColor({
        hexColor: '#FF5733',
        mode: ColorSearchMode.EXACT,
      });

      expect(result.results).toBeDefined();
    });
  });

  describe('searchByText', () => {
    it('should search with fuzzy matching', async () => {
      mockPrisma.mediaAsset.findMany.mockResolvedValue([
        {
          id: 'asset-1',
          tags: ['furniture', 'sofa'],
          kind: 'IMAGE',
          rawKey: 'key-1',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.searchByText({
        query: 'sofa',
        fuzzy: true,
        limit: 50,
      });

      expect(result.results).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('should search with exact matching', async () => {
      mockPrisma.mediaAsset.findMany.mockResolvedValue([]);

      const result = await service.searchByText({
        query: 'sofa',
        fuzzy: false,
      });

      expect(result.results).toHaveLength(0);
    });
  });

  describe('searchByMetadata', () => {
    it('should search with metadata filters', async () => {
      mockPrisma.mediaAsset.findMany.mockResolvedValue([
        {
          id: 'asset-1',
          productId: 'product-1',
          kind: 'IMAGE',
          rawKey: 'key-1',
          tags: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.searchByMetadata({
        filters: { productId: 'product-1' },
        limit: 50,
      });

      expect(result.results).toBeDefined();
      expect(mockPrisma.mediaAsset.findMany).toHaveBeenCalled();
    });
  });

  describe('generateAggregations', () => {
    it('should generate search aggregations', async () => {
      const results = [
        {
          assetId: 'asset-1',
          score: 0.9,
          asset: {
            id: 'asset-1',
            kind: 'IMAGE',
            role: 'HERO',
            productId: 'product-1',
            tags: ['furniture', 'sofa'],
            rawKey: 'key-1',
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];

      const aggregations = await service.generateAggregations(results);

      expect(aggregations.byKind).toBeDefined();
      expect(aggregations.byRole).toBeDefined();
      expect(aggregations.byTag).toBeDefined();
      expect(aggregations.byProduct).toBeDefined();
    });
  });
});
