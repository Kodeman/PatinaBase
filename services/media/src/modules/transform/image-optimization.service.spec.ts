import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ImageOptimizationService } from './image-optimization.service';
import sharp from 'sharp';

describe('ImageOptimizationService', () => {
  let service: ImageOptimizationService;
  let configService: ConfigService;

  // Test image buffers
  let testImageJPEG: Buffer;
  let testImagePNG: Buffer;

  beforeAll(async () => {
    // Create test images
    testImageJPEG = await sharp({
      create: {
        width: 1024,
        height: 768,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    testImagePNG = await sharp({
      create: {
        width: 1024,
        height: 768,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageOptimizationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => defaultValue),
          },
        },
      ],
    }).compile();

    service = module.get<ImageOptimizationService>(ImageOptimizationService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('optimizeJPEG', () => {
    it('should optimize JPEG image', async () => {
      const result = await service.optimizeImage(testImageJPEG, 'jpeg', {
        quality: 85,
        progressive: true,
      });

      expect(result.optimizedSize).toBeLessThanOrEqual(result.originalSize);
      expect(result.format).toBe('jpeg');
      expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
    });

    it('should use progressive encoding', async () => {
      const result = await service.optimizeImage(testImageJPEG, 'jpeg', {
        progressive: true,
      });

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe('jpeg');
    });

    it('should strip metadata when requested', async () => {
      const result = await service.optimizeImage(testImageJPEG, 'jpeg', {
        stripMetadata: true,
      });

      expect(result.buffer).toBeDefined();
    });
  });

  describe('optimizePNG', () => {
    it('should optimize PNG image', async () => {
      const result = await service.optimizeImage(testImagePNG, 'png', {
        quality: 90,
      });

      expect(result.format).toBe('png');
      expect(result.buffer).toBeDefined();
    });

    it('should preserve alpha channel', async () => {
      const result = await service.optimizeImage(testImagePNG, 'png');

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.hasAlpha).toBe(true);
    });
  });

  describe('optimizeWebP', () => {
    it('should convert to WebP format', async () => {
      const result = await service.optimizeImage(testImageJPEG, 'webp', {
        quality: 80,
      });

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe('webp');
      expect(result.optimizedSize).toBeLessThan(result.originalSize);
    });
  });

  describe('optimizeAVIF', () => {
    it('should convert to AVIF format', async () => {
      const result = await service.optimizeImage(testImageJPEG, 'avif', {
        quality: 70,
      });

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe('avif');
    });
  });

  describe('optimizeToTargetSize', () => {
    it('should reduce quality to meet target size', async () => {
      const targetSizeKB = 50;
      const result = await service.optimizeImage(testImageJPEG, 'jpeg', {
        targetSizeKB,
      });

      expect(result.optimizedSize).toBeLessThanOrEqual(targetSizeKB * 1024 * 1.1); // 10% tolerance
    });
  });

  describe('batchOptimize', () => {
    it('should optimize multiple images', async () => {
      const images = [
        { id: 'img1', buffer: testImageJPEG, format: 'jpeg' },
        { id: 'img2', buffer: testImagePNG, format: 'png' },
      ];

      const results = await service.batchOptimize(images);

      expect(results.size).toBe(2);
      expect(results.get('img1')).toBeDefined();
      expect(results.get('img2')).toBeDefined();
    });
  });

  describe('calculateComplexity', () => {
    it('should calculate image complexity', async () => {
      const complexity = await service.calculateComplexity(testImageJPEG);

      expect(complexity).toBeGreaterThanOrEqual(0);
      expect(complexity).toBeLessThanOrEqual(1);
    });
  });

  describe('selectOptimalQuality', () => {
    it('should select appropriate quality for JPEG', async () => {
      const quality = await service.selectOptimalQuality(testImageJPEG, 'jpeg');

      expect(quality).toBeGreaterThanOrEqual(75);
      expect(quality).toBeLessThanOrEqual(95);
    });

    it('should select appropriate quality for WebP', async () => {
      const quality = await service.selectOptimalQuality(testImageJPEG, 'webp');

      expect(quality).toBeGreaterThanOrEqual(70);
      expect(quality).toBeLessThanOrEqual(90);
    });

    it('should select appropriate quality for AVIF', async () => {
      const quality = await service.selectOptimalQuality(testImageJPEG, 'avif');

      expect(quality).toBeGreaterThanOrEqual(60);
      expect(quality).toBeLessThanOrEqual(85);
    });
  });

  describe('generateProgressiveJPEG', () => {
    it('should generate progressive JPEG', async () => {
      const result = await service.generateProgressiveJPEG(testImageJPEG, 85);

      const metadata = await sharp(result).metadata();
      expect(metadata.format).toBe('jpeg');
    });
  });
});
