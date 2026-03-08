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
describe('Upload API (e2e)', () => {
    let app;
    let prisma;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        prisma = app.get(client_1.PrismaClient);
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
//# sourceMappingURL=upload.e2e-spec.js.map