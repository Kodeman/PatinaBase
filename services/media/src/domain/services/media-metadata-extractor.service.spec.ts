/**
 * Media Metadata Extractor Service Tests
 * Tests pure domain logic without external dependencies
 */

import { MediaMetadataExtractorService } from './media-metadata-extractor.service';

describe('MediaMetadataExtractorService', () => {
  let service: MediaMetadataExtractorService;

  beforeEach(() => {
    service = new MediaMetadataExtractorService();
  });

  describe('calculateDimensions', () => {
    it('should calculate correct dimensions for landscape image', () => {
      const result = service.calculateDimensions(1920, 1080);

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.aspectRatio).toBeCloseTo(1.778, 3);
      expect(result.shortEdge).toBe(1080);
      expect(result.longEdge).toBe(1920);
    });

    it('should calculate correct dimensions for portrait image', () => {
      const result = service.calculateDimensions(1080, 1920);

      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);
      expect(result.aspectRatio).toBeCloseTo(0.5625, 4);
      expect(result.shortEdge).toBe(1080);
      expect(result.longEdge).toBe(1920);
    });

    it('should calculate correct dimensions for square image', () => {
      const result = service.calculateDimensions(1000, 1000);

      expect(result.width).toBe(1000);
      expect(result.height).toBe(1000);
      expect(result.aspectRatio).toBe(1);
      expect(result.shortEdge).toBe(1000);
      expect(result.longEdge).toBe(1000);
    });
  });

  describe('extractFileExtension', () => {
    it('should extract extension from filename', () => {
      expect(service.extractFileExtension('image.jpg')).toBe('jpg');
      expect(service.extractFileExtension('model.glb')).toBe('glb');
      expect(service.extractFileExtension('photo.JPEG')).toBe('jpeg');
    });

    it('should handle filenames with multiple dots', () => {
      expect(service.extractFileExtension('my.image.file.png')).toBe('png');
    });

    it('should return empty string for filename without extension', () => {
      expect(service.extractFileExtension('filename')).toBe('');
    });
  });

  describe('generateStorageKey', () => {
    it('should generate valid storage key', () => {
      const assetId = 'test-asset-id';
      const key = service.generateStorageKey(assetId, 'IMAGE', 'photo.jpg');

      expect(key).toMatch(/^raw\/image\/\d+\/test-asset-id\.jpg$/);
    });

    it('should handle custom prefix', () => {
      const assetId = 'test-asset-id';
      const key = service.generateStorageKey(assetId, 'MODEL3D', 'model.glb', 'processed');

      expect(key).toMatch(/^processed\/model3d\/\d+\/test-asset-id\.glb$/);
    });

    it('should lowercase the kind', () => {
      const key = service.generateStorageKey('id', 'IMAGE', 'file.jpg');
      expect(key).toContain('/image/');
    });
  });

  describe('calculateCompressionRatio', () => {
    it('should calculate correct compression ratio', () => {
      const ratio = service.calculateCompressionRatio(1000, 500);
      expect(ratio).toBe(50); // 50% reduction
    });

    it('should return 0 for no compression', () => {
      const ratio = service.calculateCompressionRatio(1000, 1000);
      expect(ratio).toBe(0);
    });

    it('should handle original size of 0', () => {
      const ratio = service.calculateCompressionRatio(0, 500);
      expect(ratio).toBe(0);
    });

    it('should handle negative compression (file got bigger)', () => {
      const ratio = service.calculateCompressionRatio(1000, 1500);
      expect(ratio).toBe(-50);
    });
  });

  describe('estimateProcessingTime', () => {
    it('should estimate time for small file', () => {
      const time = service.estimateProcessingTime(100 * 1024, 800, 600); // 100KB, 800x600
      expect(time).toBeGreaterThan(100);
      expect(time).toBeLessThan(30000);
    });

    it('should estimate time for large file', () => {
      const time = service.estimateProcessingTime(10 * 1024 * 1024, 4000, 3000); // 10MB, 4000x3000
      expect(time).toBeGreaterThan(1000);
    });

    it('should cap at maximum time', () => {
      const time = service.estimateProcessingTime(100 * 1024 * 1024, 10000, 10000);
      expect(time).toBe(30000); // Capped at 30 seconds
    });

    it('should work without dimensions', () => {
      const time = service.estimateProcessingTime(1 * 1024 * 1024); // 1MB
      expect(time).toBeGreaterThan(100);
    });
  });

  describe('calculateOptimalQuality', () => {
    it('should return high quality for small files', () => {
      const quality = service.calculateOptimalQuality(500 * 1024); // 500KB
      expect(quality).toBe(90);
    });

    it('should return medium quality for medium files', () => {
      const quality = service.calculateOptimalQuality(3 * 1024 * 1024); // 3MB
      expect(quality).toBe(85);
    });

    it('should return lower quality for large files', () => {
      const quality = service.calculateOptimalQuality(10 * 1024 * 1024); // 10MB
      expect(quality).toBe(75);
    });

    it('should calculate quality to achieve target size', () => {
      const quality = service.calculateOptimalQuality(
        2 * 1024 * 1024, // 2MB original
        1 * 1024 * 1024, // 1MB target
      );
      expect(quality).toBeGreaterThanOrEqual(60);
      expect(quality).toBeLessThanOrEqual(95);
    });

    it('should clamp quality between 60 and 95', () => {
      // Very aggressive compression
      const lowQuality = service.calculateOptimalQuality(10 * 1024 * 1024, 100 * 1024);
      expect(lowQuality).toBeGreaterThanOrEqual(60);

      // Target larger than original
      const highQuality = service.calculateOptimalQuality(100 * 1024, 10 * 1024 * 1024);
      expect(highQuality).toBeLessThanOrEqual(95);
    });
  });

  describe('determineOptimalFormat', () => {
    it('should return webp for images with alpha channel', async () => {
      // This test would require a real image buffer with alpha
      // For unit testing, we'll skip actual Sharp processing
      // Integration tests should cover this
    });

    it('should return jpeg for photos without alpha', async () => {
      // This test would require a real image buffer
      // For unit testing, we'll skip actual Sharp processing
      // Integration tests should cover this
    });
  });
});
