import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIFeaturesService } from './ai-features.service';
import { PrismaClient } from '../../generated/prisma-client';

describe('AIFeaturesService', () => {
  let service: AIFeaturesService;
  let prisma: PrismaClient;

  const mockPrisma = {
    mediaAsset: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIFeaturesService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AIFeaturesService>(AIFeaturesService);
    prisma = module.get<PrismaClient>(PrismaClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('autoTagImage', () => {
    it('should auto-tag image and save to database', async () => {
      const mockBuffer = Buffer.from('fake-image-data');
      const assetId = 'asset-123';

      mockPrisma.mediaAsset.update.mockResolvedValue({
        id: assetId,
        aiTags: [],
        tags: [],
      });

      const result = await service.autoTagImage(mockBuffer, assetId);

      expect(result.tags).toBeDefined();
      expect(result.categories).toBeDefined();
      expect(result.objects).toBeDefined();
      expect(result.scene).toBeDefined();
      expect(mockPrisma.mediaAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: assetId },
          data: expect.objectContaining({
            aiTags: expect.any(Array),
            tags: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('generateSmartCrops', () => {
    it('should generate crop suggestions for multiple aspect ratios', async () => {
      const mockBuffer = Buffer.from('fake-image-data');
      const aspectRatios = ['1:1', '4:3', '16:9'];

      const result = await service.generateSmartCrops(mockBuffer, aspectRatios);

      expect(result).toHaveLength(aspectRatios.length);
      result.forEach((crop, index) => {
        expect(crop.aspectRatio).toBe(aspectRatios[index]);
        expect(crop.x).toBeGreaterThanOrEqual(0);
        expect(crop.y).toBeGreaterThanOrEqual(0);
        expect(crop.width).toBeGreaterThan(0);
        expect(crop.height).toBeGreaterThan(0);
        expect(crop.confidence).toBeGreaterThan(0);
      });
    });

    it('should use default aspect ratios if none provided', async () => {
      const mockBuffer = Buffer.from('fake-image-data');

      const result = await service.generateSmartCrops(mockBuffer);

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('removeBackground', () => {
    it('should attempt to remove background with API', async () => {
      const mockBuffer = Buffer.from('fake-image-data');
      mockConfig.get.mockReturnValue(null); // No API key

      const result = await service.removeBackground(mockBuffer);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.confidence).toBeDefined();
    });
  });

  describe('detectProducts', () => {
    it('should detect products in lifestyle image', async () => {
      const mockBuffer = Buffer.from('fake-image-data');

      const result = await service.detectProducts(mockBuffer);

      expect(result.products).toBeDefined();
      expect(result.totalCount).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should identify primary product when multiple detected', async () => {
      const mockBuffer = Buffer.from('fake-image-data');

      const result = await service.detectProducts(mockBuffer);

      if (result.products.length > 0) {
        expect(result.primaryProduct).toBeDefined();
      }
    });
  });

  describe('calculateQualityScore', () => {
    it('should calculate comprehensive quality score', async () => {
      const mockBuffer = Buffer.from('fake-image-data');

      const result = await service.calculateQualityScore(mockBuffer);

      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(1);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.sharpness).toBeDefined();
      expect(result.breakdown.exposure).toBeDefined();
      expect(result.breakdown.composition).toBeDefined();
      expect(result.breakdown.colorBalance).toBeDefined();
      expect(result.breakdown.noiseLevel).toBeDefined();
      expect(result.issues).toBeInstanceOf(Array);
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should identify quality issues', async () => {
      const mockBuffer = Buffer.from('fake-image-data');

      const result = await service.calculateQualityScore(mockBuffer);

      result.issues.forEach((issue) => {
        expect(issue.type).toBeDefined();
        expect(issue.severity).toMatch(/^(critical|high|medium|low)$/);
        expect(issue.description).toBeDefined();
        expect(issue.suggestion).toBeDefined();
      });
    });
  });
});
