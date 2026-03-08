import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';

describe('Upload API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaClient>(PrismaClient);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /v1/media/upload', () => {
    it('should create upload intent for image', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/media/upload')
        .send({
          kind: 'IMAGE',
          filename: 'test-image.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
          role: 'HERO',
        })
        .expect(200);

      expect(response.body).toHaveProperty('assetId');
      expect(response.body).toHaveProperty('uploadSessionId');
      expect(response.body).toHaveProperty('parUrl');
      expect(response.body).toHaveProperty('targetKey');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body.headers).toHaveProperty('x-content-type', 'image/jpeg');
    });

    it('should reject invalid MIME type', async () => {
      await request(app.getHttpServer())
        .post('/v1/media/upload')
        .send({
          kind: 'IMAGE',
          filename: 'test.pdf',
          mimeType: 'application/pdf',
        })
        .expect(400);
    });

    it('should reject oversized file', async () => {
      await request(app.getHttpServer())
        .post('/v1/media/upload')
        .send({
          kind: 'IMAGE',
          filename: 'huge-image.jpg',
          fileSize: 100 * 1024 * 1024, // 100MB
          mimeType: 'image/jpeg',
        })
        .expect(400);
    });

    it('should support idempotency', async () => {
      const idempotencyKey = 'test-key-123';

      const response1 = await request(app.getHttpServer())
        .post('/v1/media/upload')
        .set('idempotency-key', idempotencyKey)
        .send({
          kind: 'IMAGE',
          filename: 'test.jpg',
          mimeType: 'image/jpeg',
        })
        .expect(200);

      const response2 = await request(app.getHttpServer())
        .post('/v1/media/upload')
        .set('idempotency-key', idempotencyKey)
        .send({
          kind: 'IMAGE',
          filename: 'test.jpg',
          mimeType: 'image/jpeg',
        })
        .expect(200);

      expect(response1.body.assetId).toBe(response2.body.assetId);
    });
  });

  describe('POST /v1/media/upload/:sessionId/confirm', () => {
    it('should confirm upload completion', async () => {
      // Create upload intent
      const uploadResponse = await request(app.getHttpServer())
        .post('/v1/media/upload')
        .send({
          kind: 'IMAGE',
          filename: 'confirm-test.jpg',
          mimeType: 'image/jpeg',
        })
        .expect(200);

      // Confirm upload
      const confirmResponse = await request(app.getHttpServer())
        .post('/v1/media/upload/:sessionId/confirm')
        .send({
          sessionId: uploadResponse.body.uploadSessionId,
        })
        .expect(200);

      expect(confirmResponse.body).toHaveProperty('assetId');
      expect(confirmResponse.body).toHaveProperty('targetKey');
    });
  });
});
