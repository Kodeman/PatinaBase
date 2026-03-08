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
const request = __importStar(require("supertest"));
const app_module_1 = require("../src/app.module");
const client_1 = require("@prisma/client");
describe('Assets API (e2e)', () => {
    let app;
    let prisma;
    let testAssetId;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        prisma = app.get(client_1.PrismaClient);
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
//# sourceMappingURL=assets.e2e-spec.js.map