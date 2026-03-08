import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ImageTransformService, TransformOptions, RenditionSpec } from './image-transform.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import * as sharp from 'sharp';

jest.mock('sharp');

describe('ImageTransformService', () => {
  let service: ImageTransformService;
  let config: jest.Mocked<ConfigService>;
  let ociStorage: jest.Mocked<OCIStorageService>;
  let mockSharp: any;

  beforeEach(async () => {
    mockSharp = {
      metadata: jest.fn(),
      resize: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      webp: jest.fn().mockReturnThis(),
      avif: jest.fn().mockReturnThis(),
      toBuffer: jest.fn(),
      composite: jest.fn().mockReturnThis(),
    };

    (sharp as any as jest.Mock).mockReturnValue(mockSharp);

    const mockConfig = {
      get: jest.fn((key: string) => {
        const values: Record<string, any> = {
          OCI_BUCKET_PROCESSED: 'processed-bucket',
          IMGPROXY_URL: 'https://imgproxy.patina.app',
          IMGPROXY_KEY: 'test-key',
          IMGPROXY_SALT: 'test-salt',
        };
        return values[key];
      }),
    };

    const mockOCIStorage = {
      generateRenditionKey: jest.fn((assetId, width, height, format) =>
        `processed/images/${assetId}/${width}x${height}.${format}`
      ),
      generatePreviewKey: jest.fn((assetId, kind) => `previews/images/${assetId}/lqip.jpg`),
      putObject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageTransformService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: OCIStorageService, useValue: mockOCIStorage },
      ],
    }).compile();

    service = module.get<ImageTransformService>(ImageTransformService);
    config = module.get(ConfigService) as jest.Mocked<ConfigService>;
    ociStorage = module.get(OCIStorageService) as jest.Mocked<OCIStorageService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRenditions', () => {
    it('should generate renditions for all standard sizes', async () => {
      const assetId = '550e8400-e29b-41d4-a716-446655440000';
      const sourceBuffer = Buffer.from('test image');

      mockSharp.metadata.mockResolvedValue({
        width: 3000,
        height: 2000,
        format: 'jpeg',
      });
      mockSharp.toBuffer.mockResolvedValue(Buffer.from('rendition'));

      const renditions = await service.generateRenditions(assetId, sourceBuffer, 'jpeg');

      // Should generate renditions for sizes: 256, 512, 768, 1024, 1600, 2048
      // For each size: webp, avif, and jpeg (fallback) = 18 renditions
      expect(renditions.length).toBeGreaterThan(0);
      expect(ociStorage.putObject).toHaveBeenCalled();
    });

    it('should skip renditions larger than source image', async () => {
      const assetId = '123';
      const sourceBuffer = Buffer.from('small image');

      mockSharp.metadata.mockResolvedValue({
        width: 800,
        height: 600,
        format: 'png',
      });
      mockSharp.toBuffer.mockResolvedValue(Buffer.from('rendition'));

      const renditions = await service.generateRenditions(assetId, sourceBuffer, 'png');

      // Should only generate for sizes <= 800 (256, 512, 768)
      const sizes = [...new Set(renditions.map(r => r.width))];
      expect(Math.max(...sizes)).toBeLessThanOrEqual(800);
    });

    it('should generate WebP renditions', async () => {
      const assetId = '123';
      const sourceBuffer = Buffer.from('test image');

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 2000,
        format: 'jpeg',
      });
      mockSharp.toBuffer.mockResolvedValue(Buffer.from('webp rendition'));

      const renditions = await service.generateRenditions(assetId, sourceBuffer, 'jpeg');

      const webpRenditions = renditions.filter(r => r.format === 'webp');
      expect(webpRenditions.length).toBeGreaterThan(0);
    });

    it('should generate AVIF renditions', async () => {
      const assetId = '123';
      const sourceBuffer = Buffer.from('test image');

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 2000,
        format: 'jpeg',
      });
      mockSharp.toBuffer.mockResolvedValue(Buffer.from('avif rendition'));

      const renditions = await service.generateRenditions(assetId, sourceBuffer, 'jpeg');

      const avifRenditions = renditions.filter(r => r.format === 'avif');
      expect(avifRenditions.length).toBeGreaterThan(0);
    });

    it('should keep original format as fallback', async () => {
      const assetId = '123';
      const sourceBuffer = Buffer.from('test image');

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 2000,
        format: 'jpeg',
      });
      mockSharp.toBuffer.mockResolvedValue(Buffer.from('jpeg rendition'));

      const renditions = await service.generateRenditions(assetId, sourceBuffer, 'jpeg');

      const jpegRenditions = renditions.filter(r => r.format === 'jpeg');
      expect(jpegRenditions.length).toBeGreaterThan(0);
    });

    it('should assign correct purpose based on size', async () => {
      const assetId = '123';
      const sourceBuffer = Buffer.from('test image');

      mockSharp.metadata.mockResolvedValue({
        width: 3000,
        height: 3000,
        format: 'jpeg',
      });
      mockSharp.toBuffer.mockResolvedValue(Buffer.from('rendition'));

      const renditions = await service.generateRenditions(assetId, sourceBuffer, 'jpeg');

      const thumbs = renditions.filter(r => r.width <= 512 && r.purpose === 'THUMB');
      const web = renditions.filter(r => r.width > 512 && r.width <= 1024 && r.purpose === 'WEB');
      const retina = renditions.filter(r => r.width > 1024 && r.purpose === 'RETINA');

      expect(thumbs.length).toBeGreaterThan(0);
      expect(web.length).toBeGreaterThan(0);
      expect(retina.length).toBeGreaterThan(0);
    });
  });

  describe('createRendition', () => {
    it('should resize image with specified dimensions', async () => {
      const sourceBuffer = Buffer.from('test image');
      const options: TransformOptions = {
        width: 1024,
        height: 768,
        format: 'webp',
        quality: 80,
        fit: 'cover',
      };

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('resized'));

      const result = await service.createRendition(sourceBuffer, options);

      expect(mockSharp.resize).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 1024,
          height: 768,
          fit: 'cover',
        }),
      );
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should convert to JPEG format', async () => {
      const sourceBuffer = Buffer.from('test image');
      const options: TransformOptions = {
        width: 1024,
        format: 'jpeg',
        quality: 85,
      };

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('jpeg'));

      await service.createRendition(sourceBuffer, options);

      expect(mockSharp.jpeg).toHaveBeenCalledWith({
        quality: 85,
        progressive: true,
        mozjpeg: true,
      });
    });

    it('should convert to PNG format', async () => {
      const sourceBuffer = Buffer.from('test image');
      const options: TransformOptions = {
        width: 512,
        format: 'png',
        quality: 90,
      };

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('png'));

      await service.createRendition(sourceBuffer, options);

      expect(mockSharp.png).toHaveBeenCalledWith({
        quality: 90,
        compressionLevel: 9,
        progressive: true,
      });
    });

    it('should convert to WebP format', async () => {
      const sourceBuffer = Buffer.from('test image');
      const options: TransformOptions = {
        width: 1024,
        format: 'webp',
        quality: 80,
      };

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('webp'));

      await service.createRendition(sourceBuffer, options);

      expect(mockSharp.webp).toHaveBeenCalledWith({
        quality: 80,
        effort: 6,
      });
    });

    it('should convert to AVIF format', async () => {
      const sourceBuffer = Buffer.from('test image');
      const options: TransformOptions = {
        width: 1024,
        format: 'avif',
        quality: 70,
      };

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('avif'));

      await service.createRendition(sourceBuffer, options);

      expect(mockSharp.avif).toHaveBeenCalledWith({
        quality: 70,
        effort: 6,
      });
    });

    it('should use default fit value', async () => {
      const sourceBuffer = Buffer.from('test image');
      const options: TransformOptions = {
        width: 512,
        format: 'jpeg',
      };

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('resized'));

      await service.createRendition(sourceBuffer, options);

      expect(mockSharp.resize).toHaveBeenCalledWith(
        expect.objectContaining({
          fit: 'inside',
        }),
      );
    });

    it('should use custom background color', async () => {
      const sourceBuffer = Buffer.from('test image');
      const options: TransformOptions = {
        width: 512,
        format: 'jpeg',
        background: '#FF0000',
      };

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('resized'));

      await service.createRendition(sourceBuffer, options);

      expect(mockSharp.resize).toHaveBeenCalledWith(
        expect.objectContaining({
          background: '#FF0000',
        }),
      );
    });
  });

  describe('generateLQIP', () => {
    it('should generate low quality image placeholder', async () => {
      const assetId = '123';
      const sourceBuffer = Buffer.from('test image');

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('lqip'));

      const key = await service.generateLQIP(assetId, sourceBuffer);

      expect(mockSharp.resize).toHaveBeenCalledWith(64, 64, { fit: 'inside' });
      expect(mockSharp.jpeg).toHaveBeenCalledWith({ quality: 40 });
      expect(ociStorage.putObject).toHaveBeenCalledWith(
        'processed-bucket',
        expect.stringContaining('lqip.jpg'),
        expect.any(Buffer),
      );
      expect(key).toContain('lqip.jpg');
    });
  });

  describe('getImgproxyUrl', () => {
    it('should generate imgproxy URL with transform options', async () => {
      const assetKey = 'processed/images/123/original.jpg';
      const options: TransformOptions = {
        width: 800,
        height: 600,
        format: 'webp',
        quality: 85,
      };

      const url = await service.getImgproxyUrl(assetKey, options);

      expect(url).toContain('https://imgproxy.patina.app');
      expect(url).toContain('/resize:fit:800:600');
      expect(url).toContain('/format:webp');
      expect(url).toContain('/quality:85');
    });

    it('should use default values for missing options', async () => {
      const assetKey = 'test.jpg';
      const options: TransformOptions = {};

      const url = await service.getImgproxyUrl(assetKey, options);

      expect(url).toContain('/resize:fit:0:0');
      expect(url).toContain('/format:webp');
      expect(url).toContain('/quality:80');
    });
  });

  describe('applyWatermark', () => {
    it('should apply watermark to image', async () => {
      const sourceBuffer = Buffer.from('source image');
      const watermarkBuffer = Buffer.from('watermark');

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 1500,
      });
      mockSharp.toBuffer.mockResolvedValue(Buffer.from('resized watermark'));

      const compositeSharp = {
        ...mockSharp,
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('watermarked')),
      };
      (sharp as any).mockReturnValueOnce(mockSharp).mockReturnValueOnce(mockSharp).mockReturnValueOnce(compositeSharp);

      const result = await service.applyWatermark(sourceBuffer, watermarkBuffer);

      expect(result).toBeInstanceOf(Buffer);
      expect(mockSharp.composite).toHaveBeenCalledWith([
        expect.objectContaining({
          gravity: 'southeast',
          blend: 'over',
        }),
      ]);
    });

    it('should resize watermark to 20% of image width', async () => {
      const sourceBuffer = Buffer.from('source');
      const watermarkBuffer = Buffer.from('watermark');

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 1500,
      });
      mockSharp.toBuffer.mockResolvedValue(Buffer.from('result'));

      await service.applyWatermark(sourceBuffer, watermarkBuffer);

      // Watermark should be 20% of 2000 = 400px
      expect(mockSharp.resize).toHaveBeenCalledWith(400, 400, { fit: 'inside' });
    });
  });

  describe('removeBackground', () => {
    it('should return source buffer when not implemented', async () => {
      const sourceBuffer = Buffer.from('test image');

      const result = await service.removeBackground(sourceBuffer);

      expect(result).toBe(sourceBuffer);
    });
  });
});
