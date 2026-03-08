"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
let DocumentsService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var DocumentsService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DocumentsService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        logger = new common_1.Logger(DocumentsService.name);
        constructor(prisma, eventEmitter) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
        }
        async create(projectId, createDto, uploadedBy) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Check if document with same title exists
            const existing = await this.prisma.document.findFirst({
                where: {
                    projectId,
                    title: createDto.title,
                },
                orderBy: { version: 'desc' },
            });
            // If exists, increment version
            const version = existing ? existing.version + 1 : 1;
            const document = await this.prisma.document.create({
                data: {
                    ...createDto,
                    projectId,
                    uploadedBy,
                    version,
                },
            });
            this.eventEmitter.emit('document.uploaded', {
                documentId: document.id,
                projectId,
                category: document.category,
                version,
                uploadedBy,
                timestamp: new Date(),
            });
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'document',
                    entityId: document.id,
                    action: 'uploaded',
                    actor: uploadedBy,
                    metadata: { projectId, category: document.category, version },
                },
            });
            return document;
        }
        async findAll(projectId, category) {
            const where = { projectId };
            if (category) {
                where.category = category;
            }
            return this.prisma.document.findMany({
                where,
                orderBy: [
                    { category: 'asc' },
                    { title: 'asc' },
                    { version: 'desc' },
                ],
            });
        }
        async findOne(id) {
            const document = await this.prisma.document.findUnique({
                where: { id },
                include: {
                    project: {
                        select: { id: true, title: true },
                    },
                },
            });
            if (!document) {
                throw new common_1.NotFoundException('Document not found');
            }
            return document;
        }
        async getVersions(projectId, title) {
            return this.prisma.document.findMany({
                where: {
                    projectId,
                    title,
                },
                orderBy: { version: 'desc' },
            });
        }
        async remove(id, userId) {
            const existing = await this.prisma.document.findUnique({
                where: { id },
                select: { id: true, projectId: true, key: true },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Document not found');
            }
            await this.prisma.document.delete({
                where: { id },
            });
            // Note: Should also delete from object storage
            this.logger.log(`Document ${id} deleted. Object storage key: ${existing.key}`);
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'document',
                    entityId: id,
                    action: 'deleted',
                    actor: userId,
                    metadata: { projectId: existing.projectId, key: existing.key },
                },
            });
            return { message: 'Document deleted successfully' };
        }
    };
    return DocumentsService = _classThis;
})();
exports.DocumentsService = DocumentsService;
//# sourceMappingURL=documents.service.js.map