import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { testUsers, generateJWT } from './helpers/auth.helper';

describe('Tasks Authorization (e2e)', () => {
  let app: INestApplication;
  let designerToken: string;
  let clientToken: string;
  let adminToken: string;
  let noPermissionsToken: string;

  const testProjectId = 'test-project-uuid-' + Date.now();
  const testTaskId = 'test-task-uuid-' + Date.now();

  const createTaskDto = {
    title: 'Test Task',
    description: 'Test task for authorization',
    assignedTo: 'designer-test-uuid-1',
    status: 'todo',
    priority: 'medium',
    dueDate: new Date('2024-06-15').toISOString(),
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

  describe('POST /projects/:projectId/tasks - Create Task', () => {
    it('should allow designer with projects.task.create permission', () => {
      return request(app.getHttpServer())
        .post(`/projects/${testProjectId}/tasks`)
        .set('Authorization', `Bearer ${designerToken}`)
        .send(createTaskDto)
        .expect((res) => {
          expect([201, 400, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 201, 400, or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should allow admin with projects.task.create permission', () => {
      return request(app.getHttpServer())
        .post(`/projects/${testProjectId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createTaskDto)
        .expect((res) => {
          expect([201, 400, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 201, 400, or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should deny client without projects.task.create permission', () => {
      return request(app.getHttpServer())
        .post(`/projects/${testProjectId}/tasks`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send(createTaskDto)
        .expect(403);
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .post(`/projects/${testProjectId}/tasks`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .send(createTaskDto)
        .expect(403);
    });
  });

  describe('GET /projects/:projectId/tasks - List Tasks', () => {
    it('should allow designer with projects.task.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}/tasks`)
        .set('Authorization', `Bearer ${designerToken}`)
        .expect((res) => {
          expect([200, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 200 or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should allow client with projects.task.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}/tasks`)
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
        .get(`/projects/${testProjectId}/tasks`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .expect(403);
    });
  });

  describe('GET /projects/:projectId/tasks/:id - Get Task by ID', () => {
    it('should allow designer with projects.task.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .expect((res) => {
          expect([200, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 200 or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should allow client with projects.task.read permission', () => {
      return request(app.getHttpServer())
        .get(`/projects/${testProjectId}/tasks/${testTaskId}`)
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
        .get(`/projects/${testProjectId}/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .expect(403);
    });
  });

  describe('PATCH /projects/:projectId/tasks/:id - Update Task', () => {
    const updateDto = {
      status: 'in_progress',
      description: 'Updated task description',
    };

    it('should allow designer with projects.task.update permission', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .send(updateDto)
        .expect((res) => {
          expect([200, 404, 400]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 200, 404, or 400, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should deny client without projects.task.update permission', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send(updateDto)
        .expect(403);
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${testProjectId}/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .send(updateDto)
        .expect(403);
    });
  });

  describe('DELETE /projects/:projectId/tasks/:id - Delete Task', () => {
    it('should allow designer with projects.task.delete permission', () => {
      return request(app.getHttpServer())
        .delete(`/projects/${testProjectId}/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .expect((res) => {
          expect([204, 404]).toContain(res.status);
          if (res.status === 403) {
            throw new Error(`Expected 204 or 404, got 403: ${JSON.stringify(res.body)}`);
          }
        });
    });

    it('should deny client without projects.task.delete permission', () => {
      return request(app.getHttpServer())
        .delete(`/projects/${testProjectId}/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });

    it('should deny user with no permissions', () => {
      return request(app.getHttpServer())
        .delete(`/projects/${testProjectId}/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${noPermissionsToken}`)
        .expect(403);
    });
  });

  describe('Task Comments Authorization', () => {
    const testCommentId = 'test-comment-uuid-' + Date.now();
    const createCommentDto = {
      content: 'Test comment for authorization',
    };

    describe('POST /projects/:projectId/tasks/:taskId/comments - Add Comment', () => {
      it('should allow designer with projects.task.update permission', () => {
        return request(app.getHttpServer())
          .post(`/projects/${testProjectId}/tasks/${testTaskId}/comments`)
          .set('Authorization', `Bearer ${designerToken}`)
          .send(createCommentDto)
          .expect((res) => {
            expect([201, 404, 400]).toContain(res.status);
            if (res.status === 403) {
              throw new Error(`Expected 201, 404, or 400, got 403: ${JSON.stringify(res.body)}`);
            }
          });
      });

      it('should deny client without projects.task.update permission', () => {
        return request(app.getHttpServer())
          .post(`/projects/${testProjectId}/tasks/${testTaskId}/comments`)
          .set('Authorization', `Bearer ${clientToken}`)
          .send(createCommentDto)
          .expect(403);
      });
    });

    describe('GET /projects/:projectId/tasks/:taskId/comments - Get Comments', () => {
      it('should allow designer with projects.task.read permission', () => {
        return request(app.getHttpServer())
          .get(`/projects/${testProjectId}/tasks/${testTaskId}/comments`)
          .set('Authorization', `Bearer ${designerToken}`)
          .expect((res) => {
            expect([200, 404]).toContain(res.status);
            if (res.status === 403) {
              throw new Error(`Expected 200 or 404, got 403: ${JSON.stringify(res.body)}`);
            }
          });
      });

      it('should allow client with projects.task.read permission', () => {
        return request(app.getHttpServer())
          .get(`/projects/${testProjectId}/tasks/${testTaskId}/comments`)
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
          .get(`/projects/${testProjectId}/tasks/${testTaskId}/comments`)
          .set('Authorization', `Bearer ${noPermissionsToken}`)
          .expect(403);
      });
    });

    describe('DELETE /projects/:projectId/tasks/:taskId/comments/:commentId - Delete Comment', () => {
      it('should allow designer with projects.task.delete permission', () => {
        return request(app.getHttpServer())
          .delete(`/projects/${testProjectId}/tasks/${testTaskId}/comments/${testCommentId}`)
          .set('Authorization', `Bearer ${designerToken}`)
          .expect((res) => {
            expect([204, 404]).toContain(res.status);
            if (res.status === 403) {
              throw new Error(`Expected 204 or 404, got 403: ${JSON.stringify(res.body)}`);
            }
          });
      });

      it('should deny client without projects.task.delete permission', () => {
        return request(app.getHttpServer())
          .delete(`/projects/${testProjectId}/tasks/${testTaskId}/comments/${testCommentId}`)
          .set('Authorization', `Bearer ${clientToken}`)
          .expect(403);
      });
    });
  });
});
