import { Test, TestingModule } from '@nestjs/testing';
import { SmartCropService } from './smart-crop.service';
import sharp from 'sharp';

describe('SmartCropService', () => {
  let service: SmartCropService;
  let testImage: Buffer;
  let complexImage: Buffer;

  beforeAll(async () => {
    // Create simple test image
    testImage = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .jpeg()
      .toBuffer();

    // Create complex image with high-contrast region
    const redSquare = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    complexImage = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .composite([
        {
          input: redSquare,
          left: 640,
          top: 440,
        },
      ])
      .jpeg()
      .toBuffer();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmartCropService],
    }).compile();

    service = module.get<SmartCropService>(SmartCropService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectFocalPoint', () => {
    it('should detect focal point', async () => {
      const metadata = await sharp(testImage).metadata();
      const focalPoint = await service.detectFocalPoint(testImage, metadata);

      expect(focalPoint).toBeDefined();
      expect(focalPoint.x).toBeGreaterThanOrEqual(0);
      expect(focalPoint.x).toBeLessThanOrEqual(1);
      expect(focalPoint.y).toBeGreaterThanOrEqual(0);
      expect(focalPoint.y).toBeLessThanOrEqual(1);
      expect(focalPoint.confidence).toBeGreaterThanOrEqual(0);
      expect(focalPoint.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect focal point near high-contrast area', async () => {
      const metadata = await sharp(complexImage).metadata();
      const focalPoint = await service.detectFocalPoint(complexImage, metadata);

      // Focal point should be roughly in the center where red square is
      // Allow some tolerance due to saliency algorithm
      expect(focalPoint.x).toBeGreaterThan(0.2);
      expect(focalPoint.x).toBeLessThan(0.8);
      expect(focalPoint.y).toBeGreaterThan(0.2);
      expect(focalPoint.y).toBeLessThan(0.8);
    });
  });

  describe('smartCrop', () => {
    it('should perform smart crop', async () => {
      const result = await service.smartCrop(testImage, {
        width: 800,
        height: 600,
      });

      expect(result.buffer).toBeDefined();
      expect(result.focalPoint).toBeDefined();
      expect(result.region).toBeDefined();

      // Verify output dimensions
      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.width).toBe(800);
      expect(metadata.height).toBe(600);
    });

    it('should respect provided focal point', async () => {
      const customFocalPoint = { x: 0.3, y: 0.4, confidence: 1.0 };

      const result = await service.smartCrop(testImage, {
        width: 800,
        height: 600,
        focalPoint: customFocalPoint,
      });

      expect(result.focalPoint).toEqual(customFocalPoint);
    });

    it('should handle square crop', async () => {
      const result = await service.smartCrop(testImage, {
        width: 1024,
        height: 1024,
      });

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.width).toBe(1024);
      expect(metadata.height).toBe(1024);
    });

    it('should handle portrait crop', async () => {
      const result = await service.smartCrop(testImage, {
        width: 600,
        height: 800,
      });

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.width).toBe(600);
      expect(metadata.height).toBe(800);
    });
  });

  describe('generateMultipleCrops', () => {
    it('should generate multiple crops', async () => {
      const crops = [
        { name: 'square', width: 512, height: 512 },
        { name: 'landscape', width: 800, height: 600 },
        { name: 'portrait', width: 600, height: 800 },
      ];

      const results = await service.generateMultipleCrops(testImage, crops);

      expect(results.size).toBe(3);
      expect(results.get('square')).toBeDefined();
      expect(results.get('landscape')).toBeDefined();
      expect(results.get('portrait')).toBeDefined();

      // Verify dimensions
      const squareMeta = await sharp(results.get('square')!.buffer).metadata();
      expect(squareMeta.width).toBe(512);
      expect(squareMeta.height).toBe(512);
    });

    it('should use same focal point for all crops', async () => {
      const crops = [
        { name: 'crop1', width: 512, height: 512 },
        { name: 'crop2', width: 800, height: 600 },
      ];

      const results = await service.generateMultipleCrops(testImage, crops);

      const fp1 = results.get('crop1')!.focalPoint;
      const fp2 = results.get('crop2')!.focalPoint;

      expect(fp1.x).toBe(fp2.x);
      expect(fp1.y).toBe(fp2.y);
    });
  });

  describe('entropyCrop', () => {
    it('should perform entropy-based crop', async () => {
      const result = await service.entropyCrop(testImage, {
        width: 800,
        height: 600,
      });

      expect(result.buffer).toBeDefined();
      expect(result.focalPoint).toBeDefined();

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.width).toBe(800);
      expect(metadata.height).toBe(600);
    });
  });

  describe('artDirectedCrop', () => {
    it('should generate art-directed crops', async () => {
      const crops = [
        {
          name: 'hero',
          width: 1920,
          height: 1080,
          focalPoint: { x: 0.5, y: 0.5, confidence: 1.0 },
        },
        {
          name: 'thumbnail',
          width: 256,
          height: 256,
          focalPoint: { x: 0.3, y: 0.7, confidence: 1.0 },
        },
      ];

      const results = await service.artDirectedCrop(testImage, crops);

      expect(results.size).toBe(2);
      expect(results.get('hero')).toBeDefined();
      expect(results.get('thumbnail')).toBeDefined();

      // Verify focal points were respected
      expect(results.get('hero')!.focalPoint.x).toBe(0.5);
      expect(results.get('thumbnail')!.focalPoint.x).toBe(0.3);
    });
  });

  describe('edge cases', () => {
    it('should handle very small target dimensions', async () => {
      const result = await service.smartCrop(testImage, {
        width: 64,
        height: 64,
      });

      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.width).toBe(64);
      expect(metadata.height).toBe(64);
    });

    it('should handle target dimensions larger than source', async () => {
      const smallImage = await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await service.smartCrop(smallImage, {
        width: 800,
        height: 600,
      });

      // Should not enlarge beyond source
      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.width).toBeLessThanOrEqual(800);
      expect(metadata.height).toBeLessThanOrEqual(600);
    });
  });
});
