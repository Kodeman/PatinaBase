import { Test, TestingModule } from '@nestjs/testing';
import { MetadataExtractionService } from './metadata-extraction.service';
import * as sharp from 'sharp';

jest.mock('sharp');
jest.mock('image-hash');
jest.mock('blurhash');
jest.mock('node-vibrant');

describe('MetadataExtractionService', () => {
  let service: MetadataExtractionService;
  let mockSharp: any;

  beforeEach(async () => {
    mockSharp = {
      metadata: jest.fn(),
      stats: jest.fn(),
      resize: jest.fn().mockReturnThis(),
      ensureAlpha: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn(),
      rotate: jest.fn().mockReturnThis(),
      toColorspace: jest.fn().mockReturnThis(),
      withMetadata: jest.fn().mockReturnThis(),
    };

    (sharp as any as jest.Mock).mockReturnValue(mockSharp);

    const module: TestingModule = await Test.createTestingModule({
      providers: [MetadataExtractionService],
    }).compile();

    service = module.get<MetadataExtractionService>(MetadataExtractionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractImageMetadata', () => {
    it('should extract basic image metadata', async () => {
      const buffer = Buffer.from('test image');

      mockSharp.metadata.mockResolvedValue({
        width: 2048,
        height: 1536,
        format: 'jpeg',
        space: 'srgb',
        hasAlpha: false,
        orientation: 1,
      });

      mockSharp.stats.mockResolvedValue({
        sharpness: 0.8,
        channels: [
          { mean: 128, stdev: 50 },
          { mean: 130, stdev: 52 },
          { mean: 125, stdev: 48 },
        ],
      });

      const imageHash = require('image-hash');
      imageHash.imageHash = jest.fn((buf, bits, precise, callback) => {
        callback(null, 'abc123def456');
      });

      const blurhash = require('blurhash');
      blurhash.encode = jest.fn().mockReturnValue('LEHV6nWB2yk8pyo0adR*.7kCMdnj');

      const Vibrant = require('node-vibrant');
      Vibrant.from = jest.fn().mockReturnValue({
        getPalette: jest.fn().mockResolvedValue({
          Vibrant: { hex: '#FF5733' },
          Muted: { hex: '#C0C0C0' },
          DarkVibrant: { hex: '#8B0000' },
        }),
      });

      mockSharp.toBuffer.mockResolvedValue({
        data: Buffer.from(new Array(32 * 32 * 4).fill(128)),
        info: { width: 32, height: 32 },
      });

      const metadata = await service.extractImageMetadata(buffer);

      expect(metadata.width).toBe(2048);
      expect(metadata.height).toBe(1536);
      expect(metadata.format).toBe('jpeg');
      expect(metadata.colorSpace).toBe('srgb');
      expect(metadata.hasAlpha).toBe(false);
      expect(metadata.phash).toBe('abc123def456');
      expect(metadata.blurhash).toBeDefined();
      expect(metadata.palette).toBeDefined();
      expect(metadata.quality).toBeDefined();
    });

    it('should extract EXIF data when available', async () => {
      const buffer = Buffer.from('jpeg with exif');

      mockSharp.metadata.mockResolvedValue({
        width: 3000,
        height: 2000,
        format: 'jpeg',
        space: 'srgb',
      });

      // Mock EXIF parser
      const exifParser = require('exif-parser');
      exifParser.create = jest.fn().mockReturnValue({
        parse: jest.fn().mockReturnValue({
          tags: {
            Make: 'Canon',
            Model: 'EOS 5D',
            Software: 'Lightroom',
            DateTime: 1633046400,
            GPSLatitude: 37.7749,
            GPSLongitude: -122.4194,
          },
        }),
      });

      mockSharp.stats.mockResolvedValue({
        sharpness: 0.9,
        channels: [{ mean: 128, stdev: 60 }],
      });

      const imageHash = require('image-hash');
      imageHash.imageHash = jest.fn((buf, bits, precise, callback) => {
        callback(null, 'hash123');
      });

      const blurhash = require('blurhash');
      blurhash.encode = jest.fn().mockReturnValue('LGF5]+Yk^6#M@-5c,1J5@[or[Q6.');

      const Vibrant = require('node-vibrant');
      Vibrant.from = jest.fn().mockReturnValue({
        getPalette: jest.fn().mockResolvedValue({
          Vibrant: { hex: '#FF0000' },
        }),
      });

      mockSharp.toBuffer.mockResolvedValue({
        data: Buffer.from(new Array(32 * 32 * 4)),
        info: { width: 32, height: 32 },
      });

      const metadata = await service.extractImageMetadata(buffer);

      expect(metadata.exif).toBeDefined();
      expect(metadata.exif?.make).toBe('Canon');
      expect(metadata.exif?.model).toBe('EOS 5D');
      expect(metadata.exif?.gps).toBeDefined();
      expect(metadata.exif?.gps?.latitude).toBe(37.7749);
      expect(metadata.exif?.gps?.longitude).toBe(-122.4194);
    });

    it('should handle EXIF extraction errors gracefully', async () => {
      const buffer = Buffer.from('no exif');

      mockSharp.metadata.mockResolvedValue({
        width: 1024,
        height: 768,
        format: 'png',
        space: 'srgb',
      });

      const exifParser = require('exif-parser');
      exifParser.create = jest.fn().mockReturnValue({
        parse: jest.fn().mockImplementation(() => {
          throw new Error('No EXIF data');
        }),
      });

      mockSharp.stats.mockResolvedValue({
        sharpness: 0.7,
        channels: [{ mean: 100, stdev: 40 }],
      });

      const imageHash = require('image-hash');
      imageHash.imageHash = jest.fn((buf, bits, precise, callback) => {
        callback(null, 'hash456');
      });

      const blurhash = require('blurhash');
      blurhash.encode = jest.fn().mockReturnValue('L00000fQfQfQfQfQfQfQfQfQfQfQ');

      const Vibrant = require('node-vibrant');
      Vibrant.from = jest.fn().mockReturnValue({
        getPalette: jest.fn().mockResolvedValue({
          Vibrant: { hex: '#0000FF' },
        }),
      });

      mockSharp.toBuffer.mockResolvedValue({
        data: Buffer.from(new Array(32 * 32 * 4)),
        info: { width: 32, height: 32 },
      });

      const metadata = await service.extractImageMetadata(buffer);

      expect(metadata.exif).toBeUndefined();
      expect(metadata.width).toBe(1024);
    });

    it('should calculate quality metrics correctly', async () => {
      const buffer = Buffer.from('quality test');

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 1500,
        format: 'jpeg',
        space: 'srgb',
      });

      mockSharp.stats.mockResolvedValue({
        sharpness: 0.9,
        channels: [
          { mean: 150, stdev: 70 },
          { mean: 148, stdev: 68 },
          { mean: 152, stdev: 72 },
        ],
      });

      const imageHash = require('image-hash');
      imageHash.imageHash = jest.fn((buf, bits, precise, callback) => {
        callback(null, 'qualityhash');
      });

      const blurhash = require('blurhash');
      blurhash.encode = jest.fn().mockReturnValue('LBLUR');

      const Vibrant = require('node-vibrant');
      Vibrant.from = jest.fn().mockReturnValue({
        getPalette: jest.fn().mockResolvedValue({ Vibrant: { hex: '#00FF00' } }),
      });

      mockSharp.toBuffer.mockResolvedValue({
        data: Buffer.from(new Array(32 * 32 * 4)),
        info: { width: 32, height: 32 },
      });

      const metadata = await service.extractImageMetadata(buffer);

      expect(metadata.quality).toBeDefined();
      expect(metadata.quality?.sharpness).toBeGreaterThan(0);
      expect(metadata.quality?.brightness).toBeGreaterThan(0);
      expect(metadata.quality?.contrast).toBeGreaterThan(0);
      expect(metadata.quality?.isLowQuality).toBe(false);
    });
  });

  describe('validateImageDimensions', () => {
    it('should validate HERO image dimensions', () => {
      const result = service.validateImageDimensions(2000, 1600, 'HERO');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should reject HERO image with insufficient dimensions', () => {
      const result = service.validateImageDimensions(1200, 800, 'HERO');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain(expect.stringContaining('1600px'));
    });

    it('should validate ANGLE image dimensions', () => {
      const result = service.validateImageDimensions(1600, 1200, 'ANGLE');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should reject ANGLE image with insufficient dimensions', () => {
      const result = service.validateImageDimensions(1000, 800, 'ANGLE');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain(expect.stringContaining('1200px'));
    });

    it('should validate aspect ratio within range', () => {
      // 16:9 aspect ratio
      const result = service.validateImageDimensions(1920, 1080, 'HERO');

      expect(result.valid).toBe(true);
    });

    it('should reject aspect ratio outside range', () => {
      // 21:9 aspect ratio (too wide)
      const result = service.validateImageDimensions(2560, 1080, 'HERO');

      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.includes('aspect ratio'))).toBe(true);
    });

    it('should reject very narrow aspect ratio', () => {
      // 1:2 aspect ratio (too narrow)
      const result = service.validateImageDimensions(1000, 2000, 'HERO');

      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.includes('aspect ratio'))).toBe(true);
    });
  });

  describe('applyExifOrientation', () => {
    it('should rotate image based on EXIF orientation', async () => {
      const buffer = Buffer.from('rotated image');

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('oriented image'));

      const result = await service.applyExifOrientation(buffer);

      expect(mockSharp.rotate).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle rotation errors gracefully', async () => {
      const buffer = Buffer.from('error image');

      mockSharp.toBuffer.mockRejectedValue(new Error('Rotation failed'));

      const result = await service.applyExifOrientation(buffer);

      expect(result).toBe(buffer);
    });
  });

  describe('convertToSRGB', () => {
    it('should convert color space to sRGB', async () => {
      const buffer = Buffer.from('cmyk image');

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('srgb image'));

      const result = await service.convertToSRGB(buffer);

      expect(mockSharp.toColorspace).toHaveBeenCalledWith('srgb');
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle conversion errors gracefully', async () => {
      const buffer = Buffer.from('error image');

      mockSharp.toBuffer.mockRejectedValue(new Error('Conversion failed'));

      const result = await service.convertToSRGB(buffer);

      expect(result).toBe(buffer);
    });
  });

  describe('stripExifData', () => {
    it('should strip EXIF data from image', async () => {
      const buffer = Buffer.from('exif image');

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('stripped image'));

      const result = await service.stripExifData(buffer);

      expect(mockSharp.withMetadata).toHaveBeenCalledWith({ orientation: undefined });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle stripping errors gracefully', async () => {
      const buffer = Buffer.from('error image');

      mockSharp.toBuffer.mockRejectedValue(new Error('Strip failed'));

      const result = await service.stripExifData(buffer);

      expect(result).toBe(buffer);
    });
  });
});
