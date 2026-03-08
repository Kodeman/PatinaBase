/**
 * Media Validator Tests
 * Tests all validation business rules without external dependencies
 */

import { BadRequestException } from '@nestjs/common';
import { MediaValidator } from './media.validator';

describe('MediaValidator', () => {
  let validator: MediaValidator;

  beforeEach(() => {
    validator = new MediaValidator();
  });

  describe('validateFileUpload', () => {
    it('should pass validation for valid image upload', () => {
      expect(() => {
        validator.validateFileUpload({
          kind: 'IMAGE',
          mimeType: 'image/jpeg',
          fileSize: 5 * 1024 * 1024, // 5MB
          filename: 'test-image.jpg',
        });
      }).not.toThrow();
    });

    it('should reject image exceeding max size', () => {
      expect(() => {
        validator.validateFileUpload({
          kind: 'IMAGE',
          mimeType: 'image/jpeg',
          fileSize: 60 * 1024 * 1024, // 60MB (exceeds 50MB limit)
        });
      }).toThrow(BadRequestException);
    });

    it('should reject invalid MIME type for image', () => {
      expect(() => {
        validator.validateFileUpload({
          kind: 'IMAGE',
          mimeType: 'video/mp4',
          fileSize: 5 * 1024 * 1024,
        });
      }).toThrow(BadRequestException);
    });

    it('should pass validation for valid 3D model upload', () => {
      expect(() => {
        validator.validateFileUpload({
          kind: 'MODEL3D',
          mimeType: 'model/gltf-binary',
          fileSize: 100 * 1024 * 1024, // 100MB
          filename: 'model.glb',
        });
      }).not.toThrow();
    });

    it('should reject 3D model exceeding max size', () => {
      expect(() => {
        validator.validateFileUpload({
          kind: 'MODEL3D',
          mimeType: 'model/gltf-binary',
          fileSize: 600 * 1024 * 1024, // 600MB (exceeds 500MB limit)
        });
      }).toThrow(BadRequestException);
    });

    it('should reject filename with dangerous characters', () => {
      expect(() => {
        validator.validateFileUpload({
          kind: 'IMAGE',
          filename: 'test<script>.jpg',
        });
      }).toThrow(BadRequestException);
    });

    it('should reject empty filename', () => {
      expect(() => {
        validator.validateFileUpload({
          kind: 'IMAGE',
          filename: '',
        });
      }).toThrow(BadRequestException);
    });

    it('should reject filename exceeding 255 characters', () => {
      expect(() => {
        validator.validateFileUpload({
          kind: 'IMAGE',
          filename: 'a'.repeat(256) + '.jpg',
        });
      }).toThrow(BadRequestException);
    });
  });

  describe('validateImageDimensions', () => {
    it('should pass validation for hero image with sufficient dimensions', () => {
      const result = validator.validateImageDimensions(2000, 1600, 'HERO');
      expect(result.valid).toBe(true);
      expect(result.hasErrors).toBe(false);
    });

    it('should fail validation for hero image below minimum size', () => {
      const result = validator.validateImageDimensions(1200, 800, 'HERO');
      expect(result.valid).toBe(false);
      expect(result.hasErrors).toBe(true);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('HERO_MIN_SIZE');
    });

    it('should fail validation for angle image below minimum size', () => {
      const result = validator.validateImageDimensions(1000, 800, 'ANGLE');
      expect(result.valid).toBe(false);
      expect(result.hasErrors).toBe(true);
      expect(result.issues[0].code).toBe('ANGLE_MIN_SIZE');
    });

    it('should warn about aspect ratio outside recommended range', () => {
      const result = validator.validateImageDimensions(3000, 1000, 'HERO'); // 3:1 ratio
      expect(result.valid).toBe(true); // Valid but has warnings
      expect(result.hasWarnings).toBe(true);
      const aspectRatioIssue = result.issues.find((i) => i.code === 'INVALID_ASPECT_RATIO');
      expect(aspectRatioIssue).toBeDefined();
      expect(aspectRatioIssue?.severity).toBe('warning');
    });

    it('should warn about very large dimensions', () => {
      const result = validator.validateImageDimensions(10000, 8000);
      expect(result.hasWarnings).toBe(true);
      const largeImageIssue = result.issues.find((i) => i.code === 'VERY_LARGE_DIMENSIONS');
      expect(largeImageIssue).toBeDefined();
    });

    it('should fail for invalid dimensions', () => {
      const result = validator.validateImageDimensions(0, 1000);
      expect(result.valid).toBe(false);
      expect(result.issues[0].code).toBe('INVALID_DIMENSIONS');
    });
  });

  describe('validateRole', () => {
    it('should accept valid image roles', () => {
      expect(() => {
        validator.validateRole('IMAGE', 'HERO');
      }).not.toThrow();

      expect(() => {
        validator.validateRole('IMAGE', 'ANGLE');
      }).not.toThrow();
    });

    it('should reject HERO role for 3D models', () => {
      expect(() => {
        validator.validateRole('MODEL3D', 'HERO');
      }).toThrow(BadRequestException);
    });

    it('should accept valid 3D model roles', () => {
      expect(() => {
        validator.validateRole('MODEL3D', 'AR_PREVIEW');
      }).not.toThrow();
    });

    it('should reject invalid role for image', () => {
      expect(() => {
        validator.validateRole('IMAGE', 'INVALID_ROLE');
      }).toThrow(BadRequestException);
    });
  });

  describe('validateTags', () => {
    it('should pass validation for valid tags', () => {
      const result = validator.validateTags(['furniture', 'modern', 'sofa']);
      expect(result.valid).toBe(true);
      expect(result.hasErrors).toBe(false);
    });

    it('should fail for too many tags', () => {
      const tags = Array.from({ length: 51 }, (_, i) => `tag${i}`);
      const result = validator.validateTags(tags);
      expect(result.valid).toBe(false);
      expect(result.issues[0].code).toBe('TOO_MANY_TAGS');
    });

    it('should fail for tag exceeding max length', () => {
      const result = validator.validateTags(['a'.repeat(101)]);
      expect(result.valid).toBe(false);
      expect(result.issues[0].code).toBe('TAG_TOO_LONG');
    });

    it('should fail for empty tags', () => {
      const result = validator.validateTags(['valid', '', 'tags']);
      expect(result.valid).toBe(false);
      const emptyTagIssue = result.issues.find((i) => i.code === 'EMPTY_TAG');
      expect(emptyTagIssue).toBeDefined();
    });

    it('should warn about duplicate tags', () => {
      const result = validator.validateTags(['furniture', 'Furniture', 'modern']);
      expect(result.hasWarnings).toBe(true);
      const duplicateIssue = result.issues.find((i) => i.code === 'DUPLICATE_TAGS');
      expect(duplicateIssue).toBeDefined();
      expect(duplicateIssue?.severity).toBe('warning');
    });
  });

  describe('getMaxFileSize', () => {
    it('should return correct max size for IMAGE', () => {
      const maxSize = validator.getMaxFileSize('IMAGE');
      expect(maxSize).toBe(50 * 1024 * 1024); // 50MB
    });

    it('should return correct max size for VIDEO', () => {
      const maxSize = validator.getMaxFileSize('VIDEO');
      expect(maxSize).toBe(500 * 1024 * 1024); // 500MB
    });

    it('should return correct max size for MODEL3D', () => {
      const maxSize = validator.getMaxFileSize('MODEL3D');
      expect(maxSize).toBe(500 * 1024 * 1024); // 500MB
    });

    it('should throw for invalid kind', () => {
      expect(() => {
        validator.getMaxFileSize('INVALID');
      }).toThrow(BadRequestException);
    });
  });

  describe('getAllowedMimeTypes', () => {
    it('should return allowed MIME types for IMAGE', () => {
      const mimeTypes = validator.getAllowedMimeTypes('IMAGE');
      expect(mimeTypes).toContain('image/jpeg');
      expect(mimeTypes).toContain('image/png');
      expect(mimeTypes).toContain('image/webp');
    });

    it('should return allowed MIME types for MODEL3D', () => {
      const mimeTypes = validator.getAllowedMimeTypes('MODEL3D');
      expect(mimeTypes).toContain('model/gltf-binary');
      expect(mimeTypes).toContain('model/gltf+json');
    });

    it('should throw for invalid kind', () => {
      expect(() => {
        validator.getAllowedMimeTypes('INVALID');
      }).toThrow(BadRequestException);
    });
  });
});
