"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const request = __importStar(require("supertest"));
const app_module_1 = require("../src/app.module");
const prisma_service_1 = require("../src/prisma/prisma.service");
const cache_1 = require("@patina/cache");
const in_memory_cache_service_1 = require("../../../tests/helpers/in-memory-cache.service");
const in_memory_projects_prisma_service_1 = require("../../../tests/helpers/in-memory-projects-prisma.service");
describe('Project Tracking Service (e2e)', () => {
    let app;
    let moduleFixture;
    let prisma;
    let cacheService;
    const testDesignerId = '22222222-2222-4222-8222-222222222222';
    const testClientId = '11111111-1111-4111-8111-111111111111';
    const mockAuthToken = createMockToken({
        sub: testDesignerId,
        email: 'designer@patina.com',
        role: 'designer',
    });
    beforeAll(async () => {
        moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        })
            .overrideProvider(cache_1.CacheService)
            .useClass(in_memory_cache_service_1.InMemoryCacheService)
            .overrideProvider(prisma_service_1.PrismaService)
            .useClass(in_memory_projects_prisma_service_1.InMemoryProjectsPrismaService)
            .compile();
        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('v1');
        app.useGlobalPipes(new common_1.ValidationPipe({ transform: true, whitelist: true }));
        await app.init();
        const prismaInstance = app.get(prisma_service_1.PrismaService);
        if (!(prismaInstance instanceof in_memory_projects_prisma_service_1.InMemoryProjectsPrismaService)) {
            throw new Error('Expected InMemoryProjectsPrismaService to be provided for PrismaService');
        }
        prisma = prismaInstance;
        const cache = app.get(cache_1.CacheService);
        if (!(cache instanceof in_memory_cache_service_1.InMemoryCacheService)) {
            throw new Error('Expected InMemoryCacheService to be provided for CacheService');
        }
        cacheService = cache;
    });
    afterAll(async () => {
        await app.close();
        await moduleFixture.close();
    });
    describe('Project Lifecycle', () => {
        let projectId;
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
            const cacheKey = (0, cache_1.buildProjectCacheKey)('detail', { projectId });
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
        let projectId;
        let changeOrderId;
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
function createMockToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = 'mock-signature';
    return `${header}.${body}.${signature}`;
}
//# sourceMappingURL=app.e2e-spec.js.map