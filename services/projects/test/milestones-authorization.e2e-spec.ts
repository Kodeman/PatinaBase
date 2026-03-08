import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { testUsers, generateJWT } from './helpers/auth.helper';

describe('Milestones Authorization (e2e)', () => {
  let app: INestApplication;
  let designerToken: string;
  let clientToken: string;
  let adminToken: string;
  let noPermissionsToken: string;

  const testProjectId = 'test-project-uuid-' + Date.now();
  const testMilestoneId = 'test-milestone-uuid-' + Date.now();

  const createMilestoneDto = {
    name: 'Test Milestone',
    description: 'Test milestone for authorization',
    dueDate: new Date('2024-06-01').toISOString(),
    status: 'pending',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    designerToken = generateJWT(testUsers.designer);
    clientToken = generateJWT(testUsers.client);
    adminToken = generateJWT(testUsers.admin);
    noPermissionsToken = generateJWT(testUsers.noPermissions);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /projects/:projectId/milestones - Create Milestone', () => {
    it('should allow designer with projects.milestone.create permission', () => {
      return request(app.getHttpServer())
        .post(`/projects/${testProjectId}/milestones`)
        .set('Authorization', `Bearer ${designerToken}`)
        .send(createMilestoneDto)
        .expect((res) => {
          expect([201, 400, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 201, 400, or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should allow admin with projects.milestone.create permission', () => {
      return request(app.getHttpServer())
        .post(`/projects/${testProjectId}/milestones`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createMilestoneDto)
        .expect((res) => {
          expect([201, 400, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 201, 400, or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should deny client without projects.milestone.create permission', () => {
      return request(app.getHttpServer())
        .post(`/projects/${testProjectId}/milestones`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send(createMilestoneDto)
        .expect(403);
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .post(`/projects/${testProjectId}/milestones`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .send(createMilestoneDto)
        .expect(403);
    });
  });

  describe('GET /projects/:projectId/milestones - List Milestones', () => {
    it('should allow designer with projects.milestone.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}/milestones`)
        .set('Authorization', `Bearer ${designerToken}`)
        .expect((res) => {
          expect([200, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 200 or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should allow client with projects.milestone.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}/milestones`)
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
        .get(`/projects/${testProjectId}/milestones`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .expect(403);
    });
  });

  describe('GET /projects/:projectId/milestones/:id - Get Milestone by ID', () => {
    it('should allow designer with projects.milestone.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}/milestones/${testMilestoneId}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .expect((res) => {
          expect([200, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 200 or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should allow client with projects.milestone.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}/milestones/${testMilestoneId}`)
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
        .get(`/projects/${testProjectId}/milestones/${testMilestoneId}`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .expect(403);
    });
  });

  describe('PATCH /projects/:projectId/milestones/:id - Update Milestone', () => {
    const updateDto = {
      status: 'completed',
      description: 'Updated milestone description',
    };

    it('should allow designer with projects.milestone.update permission', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}/milestones/${testMilestoneId}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .send(updateDto)
        .expect((res) => {
          expect([200, 404, 400]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 200, 404, or 400, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should deny client without projects.milestone.update permission', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}/milestones/${testMilestoneId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send(updateDto)
        .expect(403);
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}/milestones/${testMilestoneId}`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .send(updateDto)
        .expect(403);
    });
  });

  describe('DELETE /projects/:projectId/milestones/:id - Delete Milestone', () => {
    it('should allow designer with projects.milestone.delete permission', () => {
      return request(app.getHttpServer())
        .delete(`/projects/${testProjectId}/milestones/${testMilestoneId}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .expect((res) => {
          expect([204, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 204 or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should deny client without projects.milestone.delete permission', () => {
      return request(app.getHttpServer())
        .delete(`/projects/${testProjectId}/milestones/${testMilestoneId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .delete(`/projects/${testProjectId}/milestones/${testMilestoneId}`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .expect(403);
    });
  });
});
