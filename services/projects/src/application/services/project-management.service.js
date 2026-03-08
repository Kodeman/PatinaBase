"use strict";
/**
 * Project Management Service (Application Layer)
 *
 * Orchestrates project CRUD operations by coordinating:
 * - Domain validators (business rules)
 * - Repository (data access)
 * - Event emitter (notifications)
 * - Audit logger (tracking)
 *
 * Single Responsibility: Managing project lifecycle (create, read, update, delete)
 */
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
exports.ProjectManagementService = void 0;
const common_1 = require("@nestjs/common");
let ProjectManagementService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectManagementService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectManagementService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repository;
        validator;
        eventEmitter;
        prisma;
        constructor(repository, validator, eventEmitter, prisma) {
            this.repository = repository;
            this.validator = validator;
            this.eventEmitter = eventEmitter;
            this.prisma = prisma;
        }
        /**
         * Create a new project
         */
        async create(command, userId) {
            // Validate business rules
            this.validator.validateCreateData(command);
            // Create project
            const project = await this.repository.create(command);
            // Emit domain event
            this.eventEmitter.emit('project.created', {
                projectId: project.id,
                clientId: project.clientId,
                designerId: project.designerId,
                userId,
                timestamp: new Date(),
            });
            // Log audit (in transaction)
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'project',
                    entityId: project.id,
                    action: 'created',
                    actor: userId,
                    metadata: { proposalId: command.proposalId },
                },
            });
            return project;
        }
        /**
         * Find all projects with filtering and pagination
         */
        async findAll(query, userId, userRole) {
            // Apply role-based filtering
            const filteredQuery = { ...query };
            if (userRole === 'client') {
                filteredQuery.clientId = userId;
            }
            else if (userRole === 'designer') {
                filteredQuery.designerId = userId;
            }
            return this.repository.findAll(filteredQuery);
        }
        /**
         * Find a single project by ID
         */
        async findOne(id) {
            const project = await this.repository.findById(id);
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            return project;
        }
        /**
         * Find multiple projects by IDs (for DataLoader)
         */
        async findByIds(ids) {
            return this.repository.findByIds(ids);
        }
        /**
         * Update a project
         */
        async update(id, command, userId) {
            // Check if project exists
            const existing = await this.repository.findById(id);
            if (!existing) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Validate business rules
            this.validator.validateUpdateData(command, existing.status);
            // Validate project can be modified
            if (command.status === undefined) {
                // Only check if not changing status
                this.validator.validateCanModify(existing.status);
            }
            // Update project
            const updated = await this.repository.update(id, command);
            // Emit event if status changed
            if (command.status && command.status !== existing.status) {
                this.eventEmitter.emit('project.status_changed', {
                    projectId: id,
                    oldStatus: existing.status,
                    newStatus: command.status,
                    userId,
                    timestamp: new Date(),
                });
            }
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'project',
                    entityId: id,
                    action: 'updated',
                    actor: userId,
                    changes: command,
                },
            });
            return updated;
        }
        /**
         * Soft delete a project (close it)
         */
        async delete(id, userId) {
            const project = await this.repository.findById(id);
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Get open tasks and issues count
            const stats = await this.repository.getStats(id);
            const openTasks = Object.values(stats.tasks).reduce((sum, count) => sum + count, 0);
            const openIssues = Object.values(stats.issues)
                .filter((_, index, arr) => {
                const keys = Object.keys(stats.issues);
                return keys[index] === 'open' || keys[index] === 'investigating';
            })
                .reduce((sum, count) => sum + count, 0);
            // Validate can close
            this.validator.validateCanClose(project.status, openTasks, openIssues);
            // Soft delete
            await this.repository.delete(id);
            // Emit event
            this.eventEmitter.emit('project.closed', {
                projectId: id,
                userId,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'project',
                    entityId: id,
                    action: 'closed',
                    actor: userId,
                },
            });
        }
        /**
         * Get projects by client
         */
        async findByClient(clientId) {
            return this.repository.findByClient(clientId);
        }
        /**
         * Get projects by designer
         */
        async findByDesigner(designerId) {
            return this.repository.findByDesigner(designerId);
        }
        /**
         * Check if project exists
         */
        async exists(id) {
            return this.repository.exists(id);
        }
        /**
         * Check if user has access to project
         */
        async hasAccess(projectId, userId, role) {
            return this.repository.hasAccess(projectId, userId, role);
        }
    };
    return ProjectManagementService = _classThis;
})();
exports.ProjectManagementService = ProjectManagementService;
//# sourceMappingURL=project-management.service.js.map