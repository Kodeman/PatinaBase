import { createHmac } from 'crypto';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BackgroundRemovalController } from '../src/modules/background-removal/background-removal.controller';
import { BackgroundRemovalService } from '../src/modules/background-removal/background-removal.service';

// This service already depends on supertest, but its legacy e2e setup never
// declared @types/supertest. Keep this route test scoped to the service rather
// than changing the monorepo lockfile solely for a test-only type package.
const request = require('supertest');

const JWT_SECRET = 'background-removal-route-test-secret-with-32-bytes';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

function encodedJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function validJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodedJson({ alg: 'HS256', typ: 'JWT' })}.${encodedJson({
    sub: USER_ID,
    role: 'authenticated',
    iat: now - 1,
    exp: now + 3600,
  })}`;
  const signature = createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

describe('Background removal routes (e2e)', () => {
  let app: INestApplication;
  let backgroundRemoval: {
    capability: jest.Mock;
    removeBackground: jest.Mock;
  };
  let token: string;

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
    backgroundRemoval = {
      capability: jest.fn(),
      removeBackground: jest.fn(),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BackgroundRemovalController],
      providers: [{ provide: BackgroundRemovalService, useValue: backgroundRemoval }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    token = validJwt();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    backgroundRemoval.capability.mockResolvedValue({ available: true });
    backgroundRemoval.removeBackground.mockResolvedValue({
      originalUrl: 'https://project.supabase.co/original.png',
      cutoutUrl: 'https://project.supabase.co/cutout.png',
      idempotentReplay: false,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies missing and invalid bearer tokens before the handler', async () => {
    await request(app.getHttpServer())
      .get(`/boards/${BOARD_ID}/background-removal-capability`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/boards/${BOARD_ID}/background-removal-capability`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(403);

    expect(backgroundRemoval.capability).not.toHaveBeenCalled();
  });

  it('forwards the verified caller JWT for board authorization', async () => {
    await request(app.getHttpServer())
      .get(`/boards/${BOARD_ID}/background-removal-capability`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { available: true });

    expect(backgroundRemoval.capability).toHaveBeenCalledWith(token, BOARD_ID);
  });

  it('preserves a foreign-board 404 without exposing authorization state', async () => {
    backgroundRemoval.capability.mockRejectedValue(
      new NotFoundException({ code: 'board_item_not_found', message: 'Board item not found.' }),
    );

    const response = await request(app.getHttpServer())
      .get(`/boards/${BOARD_ID}/background-removal-capability`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(response.body).toMatchObject({ code: 'board_item_not_found' });
  });

  it('rejects any client-supplied source URL and never enters the service', async () => {
    const response = await request(app.getHttpServer())
      .post(`/boards/${BOARD_ID}/items/${ITEM_ID}/remove-background`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'request-key-1')
      .send({ sourceUrl: 'https://attacker.example/source.png' })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'background_removal_invalid_request' });
    expect(backgroundRemoval.removeBackground).not.toHaveBeenCalled();
  });

  it('requires a bounded idempotency key', async () => {
    const response = await request(app.getHttpServer())
      .post(`/boards/${BOARD_ID}/items/${ITEM_ID}/remove-background`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'background_removal_idempotency_key_required',
    });
    expect(backgroundRemoval.removeBackground).not.toHaveBeenCalled();
  });

  it('passes only verified identity, route IDs, and idempotency key to the service', async () => {
    const response = await request(app.getHttpServer())
      .post(`/boards/${BOARD_ID}/items/${ITEM_ID}/remove-background`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'request-key-2')
      .send({})
      .expect(200);

    expect(backgroundRemoval.removeBackground).toHaveBeenCalledWith(
      token,
      USER_ID,
      BOARD_ID,
      ITEM_ID,
      'request-key-2',
    );
    expect(response.body).toEqual({
      originalUrl: 'https://project.supabase.co/original.png',
      cutoutUrl: 'https://project.supabase.co/cutout.png',
      idempotentReplay: false,
    });
    expect(JSON.stringify(response.headers)).not.toMatch(/remove\.bg|vendor/i);
  });
});
