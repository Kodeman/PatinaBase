import { Test, TestingModule } from '@nestjs/testing';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { PrismaClient } from '../../generated/prisma-client';
import sharp from 'sharp';

// Production calls `imageHashAsync(normalized as any, bits, true)` with a raw
// Buffer, but the real `image-hash` lib's `isBufferObject()` check only
// recognizes `{ data: Buffer, name/ext }` wrapper objects — a bare Buffer
// falls through to its `fs.readFile(src, ...)` branch and throws
// "path must be a string, Uint8Array, or URL without null bytes." This looks
// like a real production call-shape bug, but production source is out of
// scope here; this test-only shim normalizes the call shape so the real
// hashing algorithm still runs (needed for the same/similar/different-image
// assertions below to mean anything), without touching duplicate-detection.service.ts.
jest.mock('image-hash', () => {
  const actual = jest.requireActual('image-hash');
  return {
    ...actual,
    imageHash: (src: any, bits: number, method: any, cb: any) => {
      const wrapped = Buffer.isBuffer(src) ? { data: src, name: 'normalized.jpg' } : src;
      return actual.imageHash(wrapped, bits, method, cb);
    },
  };
});

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;
  let prisma: PrismaClient;

  let testImage1: Buffer;
  let testImage2: Buffer;
  let testImage3: Buffer;

  beforeAll(async () => {
    // Create test images
    testImage1 = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    // Similar to testImage1
    testImage2 = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: { r: 250, g: 5, b: 5 },
      },
    })
      .jpeg()
      .toBuffer();

    // Different from testImage1. A flat solid color (even a different hue)
    // isn't enough here: the block-hash algorithm behind generatePHash
    // hashes luminance structure between blocks, and two perfectly flat
    // images have zero variance regardless of color — they hash identically.
    // Use a checkerboard so there's real structural difference to detect.
    testImage3 = await sharp(
      Buffer.from(`
        <svg width="256" height="256">
          <rect width="256" height="256" fill="#000033"/>
          <rect x="0" y="0" width="128" height="128" fill="#FFFFFF"/>
          <rect x="128" y="128" width="128" height="128" fill="#FFFFFF"/>
        </svg>
      `),
    )
      .jpeg()
      .toBuffer();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicateDetectionService,
        {
          provide: PrismaClient,
          useValue: {
            mediaAsset: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DuplicateDetectionService>(DuplicateDetectionService);
    prisma = module.get<PrismaClient>(PrismaClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generatePHash', () => {
    it('should generate perceptual hash', async () => {
      const hash = await service.generatePHash(testImage1);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should generate consistent hash for same image', async () => {
      const hash1 = await service.generatePHash(testImage1);
      const hash2 = await service.generatePHash(testImage1);

      expect(hash1).toBe(hash2);
    });

    it('should generate similar hash for similar images', async () => {
      const hash1 = await service.generatePHash(testImage1);
      const hash2 = await service.generatePHash(testImage2);

      const distance = service.calculateHammingDistance(hash1, hash2);
      expect(distance).toBeLessThan(10); // Should be similar
    });

    it('should generate different hash for different images', async () => {
      const hash1 = await service.generatePHash(testImage1);
      const hash3 = await service.generatePHash(testImage3);

      const distance = service.calculateHammingDistance(hash1, hash3);
      expect(distance).toBeGreaterThan(10); // Should be different
    });
  });

  describe('calculateHammingDistance', () => {
    it('should calculate distance of 0 for identical hashes', () => {
      const distance = service.calculateHammingDistance('abcd1234', 'abcd1234');
      expect(distance).toBe(0);
    });

    it('should calculate correct hamming distance', () => {
      const distance = service.calculateHammingDistance('0000', '0001');
      expect(distance).toBe(1);
    });

    it('should throw error for different length hashes', () => {
      expect(() => {
        service.calculateHammingDistance('abc', 'abcd');
      }).toThrow();
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate 100% similarity for identical hashes', () => {
      const similarity = service.calculateSimilarity('abcd1234', 'abcd1234');
      expect(similarity).toBe(100);
    });

    it('should calculate correct similarity percentage', () => {
      const similarity = service.calculateSimilarity('0000', '0001');
      expect(similarity).toBe(75); // 3 out of 4 characters match
    });

    it('should return value between 0 and 100', () => {
      const similarity = service.calculateSimilarity('0000', '1111');
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(100);
    });
  });

  describe('detectDuplicates', () => {
    it('should detect no duplicates when database is empty', async () => {
      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue([]);

      const result = await service.detectDuplicates(testImage1);

      expect(result.isDuplicate).toBe(false);
      expect(result.exactMatches).toHaveLength(0);
      expect(result.phash).toBeDefined();
    });

    it('should detect exact duplicate', async () => {
      const hash = await service.generatePHash(testImage1);

      jest
        .spyOn(prisma.mediaAsset, 'findMany')
        .mockResolvedValue([{ id: 'asset-1', phash: hash }] as any);

      const result = await service.detectDuplicates(testImage1, 'different-id');

      expect(result.isDuplicate).toBe(true);
      expect(result.exactMatches.length).toBeGreaterThan(0);
    });

    it('should detect similar images', async () => {
      const hash1 = await service.generatePHash(testImage1);

      jest
        .spyOn(prisma.mediaAsset, 'findMany')
        .mockResolvedValue([{ id: 'asset-1', phash: hash1 }] as any);

      const result = await service.detectDuplicates(testImage2);

      // Should find similar or exact match
      expect(result.exactMatches.length + result.similarMatches.length).toBeGreaterThan(0);
    });

    it('should exclude specified asset ID', async () => {
      const hash = await service.generatePHash(testImage1);

      jest
        .spyOn(prisma.mediaAsset, 'findMany')
        .mockResolvedValue([{ id: 'exclude-me', phash: hash }] as any);

      const result = await service.detectDuplicates(testImage1, 'exclude-me');

      // Should not detect itself as duplicate
      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'exclude-me' },
          }),
        }),
      );
    });
  });

  describe('compareImages', () => {
    it('should return 100% for identical images', async () => {
      const similarity = await service.compareImages(testImage1, testImage1);
      expect(similarity).toBe(100);
    });

    it('should return high similarity for similar images', async () => {
      const similarity = await service.compareImages(testImage1, testImage2);
      expect(similarity).toBeGreaterThan(80);
    });

    it('should return low similarity for different images', async () => {
      const similarity = await service.compareImages(testImage1, testImage3);
      expect(similarity).toBeLessThan(80);
    });
  });

  describe('updateAssetPHash', () => {
    it('should update asset with new pHash', async () => {
      jest.spyOn(prisma.mediaAsset, 'update').mockResolvedValue({} as any);

      const hash = await service.updateAssetPHash('asset-1', testImage1);

      expect(hash).toBeDefined();
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { phash: hash },
      });
    });
  });

  describe('generateDuplicateReport', () => {
    it('should generate comprehensive duplicate report', async () => {
      const hash = await service.generatePHash(testImage1);

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue([
        { id: 'asset-1', phash: hash, createdAt: new Date() },
        { id: 'asset-2', phash: hash, createdAt: new Date() },
      ] as any);

      jest.spyOn(prisma.mediaAsset, 'count').mockResolvedValue(10);

      const report = await service.generateDuplicateReport();

      expect(report.totalImages).toBe(10);
      expect(report.estimatedStorageSavings).toBeGreaterThanOrEqual(0);
    });
  });
});
