import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService, buildProjectCacheKey } from '@patina/cache';
import { InMemoryCacheService } from '../../../tests/helpers/in-memory-cache.service';
import { InMemoryProjectsPrismaService } from '../../../tests/helpers/in-memory-projects-prisma.service';

describe('Project Tracking Service (e2e)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let prisma: InMemoryProjectsPrismaService;
  let cacheService: InMemoryCacheService;

  const testDesignerId = '22222222-2222-4222-8222-222222222222';
  const testClientId = '11111111-1111-4111-8111-111111111111';

  const mockAuthToken = createMockToken({
    sub: testDesignerId,
    email: 'designer@patina.com',
    role: 'designer',
  });

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CacheService)
      .useClass(InMemoryCacheService)
      .overrideProvider(PrismaService)
      .useClass(InMemoryProjectsPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    const prismaInstance = app.get<PrismaService>(PrismaService);
    if (!(prismaInstance instanceof InMemoryProjectsPrismaService)) {
      throw new Error('Expected InMemoryProjectsPrismaService to be provided for PrismaService');
    }
    prisma = prismaInstance;
    const cache = app.get<CacheService>(CacheService);
    if (!(cache instanceof InMemoryCacheService)) {
      throw new Error('Expected InMemoryCacheService to be provided for CacheService');
    }
    cacheService = cache;
  });

  afterAll(async () => {
    await app.close();
    await moduleFixture.close();
  });

  describe('Project Lifecycle', () => {
    let projectId: string;

    it('POST /v1/projects - should create a project', async () => {
      const createDto = {
        title: 'E2E Test Project',
        clientId: testClientId,
        designerId: testDesignerId,
        budget: 50000,
      };

      const response = await request(app.getHttpServer())
        .post('/v1/projects')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(createDto.title);
      expect(response.body.status).toBe('draft');

      projectId = response.body.id;
    });

    it('GET /v1/projects/:id - should retrieve project', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(200);

      expect(response.body.id).toBe(projectId);
    });

    it('should warm and invalidate the project detail cache', async () => {
      const cacheKey = buildProjectCacheKey('detail', { projectId });
      await cacheService.del(cacheKey);
      cacheService.resetMetrics();

      expect(await cacheService.exists(cacheKey)).toBe(false);

      await request(app.getHttpServer())
        .get(`/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(200);

      expect(await cacheService.exists(cacheKey)).toBe(true);
      const missMetrics = cacheService.getMetrics();
      expect(missMetrics.missCount).toBeGreaterThanOrEqual(1);

      await request(app.getHttpServer())
        .get(`/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(200);

      const hitMetrics = cacheService.getMetrics();
      expect(hitMetrics.hitCount).toBeGreaterThanOrEqual(1);

      await request(app.getHttpServer())
        .patch(`/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send({ title: 'Updated title from cache test' })
        .expect(200);

      expect(await cacheService.exists(cacheKey)).toBe(false);

      const refreshed = await request(app.getHttpServer())
        .get(`/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(200);

      expect(refreshed.body.title).toBe('Updated title from cache test');
    });

    it('PATCH /v1/projects/:id - should update project status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send({ status: 'active' })
        .expect(200);

      expect(response.body.status).toBe('active');
    });

    it('POST /v1/projects/:id/tasks - should create task', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send({
          title: 'Test Task',
          description: 'E2E test task',
          priority: 'high',
        })
        .expect(201);

      expect(response.body.title).toBe('Test Task');
      expect(response.body.status).toBe('todo');
    });

    it('GET /v1/projects/:id/stats - should return statistics', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/projects/${projectId}/stats`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('tasks');
      expect(response.body.tasks).toHaveProperty('todo');
    });
  });

  describe('Change Order Workflow', () => {
    let projectId: string;
    let changeOrderId: string;

    beforeAll(async () => {
      // Create project for change order tests
      const project = await prisma.project.create({
        data: {
          title: 'CO Test Project',
          clientId: testClientId,
          designerId: testDesignerId,
          status: 'active',
        },
      });
      projectId = project.id;
    });

    it('should complete full change order approval flow', async () => {
      // 1. Create change order
      const createResponse = await request(app.getHttpServer())
        .post(`/v1/projects/${projectId}/change-orders`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send({
          title: 'Kitchen Upgrade',
          description: 'Upgrade to premium finishes',
          costImpact: 5000,
          scheduleImpact: 7,
        })
        .expect(201);

      changeOrderId = createResponse.body.id;
      expect(createResponse.body.status).toBe('draft');

      // 2. Submit for approval
      const submitResponse = await request(app.getHttpServer())
        .patch(`/v1/change-orders/${changeOrderId}/submit`)
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(200);

      expect(submitResponse.body.status).toBe('submitted');

      // 3. Client approves (mock client token)
      const clientToken = createMockToken({
        sub: testClientId,
        email: 'client@example.com',
        role: 'client',
      });

      const approveResponse = await request(app.getHttpServer())
        .patch(`/v1/change-orders/${changeOrderId}/approve`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          action: 'approve',
          reason: 'Approved for implementation',
        })
        .expect(200);

      expect(approveResponse.body.status).toBe('approved');
      expect(approveResponse.body.approvedBy).toBe(testClientId);
    });
  });
});

// Helper function to create mock JWT token
function createMockToken(payload: any): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'mock-signature';
  return `${header}.${body}.${signature}`;
}
