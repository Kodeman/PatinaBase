import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { testUsers, generateJWT, generateExpiredJWT, generateInvalidSignatureJWT } from './helpers/auth.helper';

describe('Projects Authorization (e2e)', () => {
  let app: INestApplication;
  let designerToken: string;
  let clientToken: string;
  let adminToken: string;
  let noPermissionsToken: string;

  // Test project data
  const testProjectId = 'test-project-uuid-' + Date.now();
  const createProjectDto = {
    name: 'Test Project Authorization',
    description: 'Test project for authorization testing',
    clientId: 'test-client-uuid-1',
    designerId: 'designer-test-uuid-1',
    status: 'planning',
    startDate: new Date('2024-01-01').toISOString(),
    estimatedEndDate: new Date('2024-12-31').toISOString(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Enable validation pipe for DTO validation
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // Generate JWT tokens for test users
    designerToken = generateJWT(testUsers.designer);
    clientToken = generateJWT(testUsers.client);
    adminToken = generateJWT(testUsers.admin);
    noPermissionsToken = generateJWT(testUsers.noPermissions);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /projects - Create Project', () => {
    it('should allow designer with projects.project.create permission to create project', () => {
      return request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${designerToken}`)
        .send(createProjectDto)
        .expect((res) => {
          expect([201, 400]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 201 or 400, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should allow admin with projects.project.create permission to create project', () => {
      return request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createProjectDto)
        .expect((res) => {
          expect([201, 400]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 201 or 400, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should deny client without projects.project.create permission', () => {
      return request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(createProjectDto)
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toContain('Insufficient permissions');
          expect(res.body.required).toContain('projects.project.create');
        });
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .send(createProjectDto)
        .expect(403);
    });
  });

  describe('GET /projects - List Projects', () => {
    it('should allow designer with projects.project.read permission', () => {
      return request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${designerToken}`)
        .expect(200);
    });

    it('should allow client with projects.project.read permission', () => {
      return request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
    });

    it('should allow admin with projects.project.read permission', () => {
      return request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .expect(403);
    });
  });

  describe('GET /projects/:id - Get Project by ID', () => {
    it('should allow designer with projects.project.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .expect((res) => {
          expect([200, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 200 or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should allow client with projects.project.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect((res) => {
          expect([200, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 200 or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .expect(403);
    });
  });

  describe('PATCH /projects/:id - Update Project', () => {
    const updateDto = {
      status: 'in_progress',
      description: 'Updated description',
    };

    it('should allow designer with projects.project.update permission', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .send(updateDto)
        .expect((res) => {
          expect([200, 404, 400]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 200, 404, or 400, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should deny client without projects.project.update permission', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send(updateDto)
        .expect(403);
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .send(updateDto)
        .expect(403);
    });
  });

  describe('Security Tests', () => {
    it('should deny unauthenticated user from creating project', () => {
      return request(app.getHttpServer())
        .post('/projects')
        .send(createProjectDto)
        .expect(401);
    });

    it('should deny request with expired JWT token', () => {
      const expiredToken = generateExpiredJWT(testUsers.designer);
      return request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send(createProjectDto)
        .expect(401);
    });

    it('should deny request with invalid JWT signature', () => {
      const invalidToken = generateInvalidSignatureJWT(testUsers.designer);
      return request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send(createProjectDto)
        .expect(401);
    });
  });
});
