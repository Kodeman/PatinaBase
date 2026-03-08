import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';

describe('Assets API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let testAssetId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaClient>(PrismaClient);

    // Create test asset
    const asset = await prisma.mediaAsset.create({
      data: {
        kind: 'IMAGE',
        rawKey: 'raw/images/test/image.jpg',
        status: 'READY',
        width: 1920,
        height: 1080,
        format: 'jpeg',
        processed: true,
      },
    });
    testAssetId = asset.id;
  });

  afterAll(async () => {
    await prisma.mediaAsset.deleteMany({});
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /v1/media/assets/:id', () => {
    it('should retrieve asset metadata', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/media/assets/${testAssetId}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', testAssetId);
      expect(response.body).toHaveProperty('kind', 'IMAGE');
      expect(response.body).toHaveProperty('status', 'READY');
      expect(response.body).toHaveProperty('width', 1920);
      expect(response.body).toHaveProperty('height', 1080);
    });

    it('should return 404 for non-existent asset', async () => {
      await request(app.getHttpServer())
        .get('/v1/media/assets/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('GET /v1/media/search', () => {
    it('should search assets by kind', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/media/search')
        .query({ kind: 'IMAGE' })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/media/search')
        .query({ limit: 10 })
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(10);
      expect(response.body.meta).toHaveProperty('nextCursor');
    });
  });

  describe('PATCH /v1/media/assets/:id', () => {
    it('should update asset metadata', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/media/assets/${testAssetId}`)
        .send({
          role: 'HERO',
          productId: 'prod-123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('role', 'HERO');
      expect(response.body).toHaveProperty('productId', 'prod-123');
    });
  });

  describe('POST /v1/media/assets/:id/reprocess', () => {
    it('should enqueue asset for reprocessing', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/media/assets/${testAssetId}/reprocess`)
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('assetId', testAssetId);
    });
  });
});
