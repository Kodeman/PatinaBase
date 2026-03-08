import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma-client';

describe('Carts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prisma = app.get<PrismaClient>(PrismaClient);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('/v1/carts (POST)', () => {
    it('should create a new cart', () => {
      return request(app.getHttpServer())
        .post('/v1/carts')
        .send({ currency: 'USD' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.currency).toBe('USD');
          expect(res.body.status).toBe('active');
        });
    });

    it('should create cart with user ID', () => {
      return request(app.getHttpServer())
        .post('/v1/carts')
        .send({ userId: 'user-123', currency: 'USD' })
        .expect(201)
        .expect((res) => {
          expect(res.body.userId).toBe('user-123');
        });
    });
  });

  describe('/v1/carts/:id (GET)', () => {
    let cartId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/carts')
        .send({ currency: 'USD' });
      cartId = res.body.id;
    });

    it('should get cart by ID', () => {
      return request(app.getHttpServer())
        .get(`/v1/carts/${cartId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(cartId);
        });
    });

    it('should return 404 for non-existent cart', () => {
      return request(app.getHttpServer())
        .get('/v1/carts/non-existent-id')
        .expect(404);
    });
  });

  describe('/v1/carts/:id/items (POST)', () => {
    let cartId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/carts')
        .send({ currency: 'USD' });
      cartId = res.body.id;
    });

    it('should add item to cart', () => {
      return request(app.getHttpServer())
        .post(`/v1/carts/${cartId}/items`)
        .send({
          productId: 'prod-123',
          qty: 2,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.items).toHaveLength(1);
          expect(res.body.items[0].qty).toBe(2);
        });
    });
  });
});
