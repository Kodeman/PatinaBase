"use strict";
/**
 * Projects Refactored Service (Facade Pattern)
 *
 * Maintains 100% backward compatibility with the original ProjectsService.
 * Delegates to specialized services in clean architecture layers.
 *
 * This facade allows gradual migration with zero breaking changes.
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
exports.ProjectsRefactoredService = void 0;
const common_1 = require("@nestjs/common");
let ProjectsRefactoredService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectsRefactoredService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectsRefactoredService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        managementService;
        progressService;
        activityService;
        constructor(managementService, progressService, activityService) {
            this.managementService = managementService;
            this.progressService = progressService;
            this.activityService = activityService;
        }
        /**
         * Create a new project
         * Delegates to: ProjectManagementService
         */
        async create(createDto, userId) {
            return this.managementService.create(createDto, userId);
        }
        /**
         * Find all projects with optional filtering and pagination
         * Delegates to: ProjectManagementService
         */
        async findAll(query, userId, userRole) {
            return this.managementService.findAll(query, userId, userRole);
        }
        /**
         * Find a single project by ID
         * Delegates to: ProjectManagementService
         */
        async findOne(id) {
            return this.managementService.findOne(id);
        }
        /**
         * Update a project
         * Delegates to: ProjectManagementService
         */
        async update(id, updateDto, userId) {
            return this.managementService.update(id, updateDto, userId);
        }
        /**
         * Get aggregated statistics for a project
         * Delegates to: ProjectProgressService
         */
        async getStats(id) {
            return this.progressService.getStats(id);
        }
        /**
         * Get projects by multiple IDs (bulk fetch)
         * Delegates to: ProjectManagementService
         */
        async findByIds(ids) {
            return this.managementService.findByIds(ids);
        }
        /**
         * Get client-safe project data (filtered for client portal)
         * Delegates to: ProjectProgressService
         */
        async getClientSafeData(projectId, clientId) {
            return this.progressService.getClientSafeData(projectId, clientId);
        }
        /**
         * Calculate comprehensive project progress
         * Delegates to: ProjectProgressService
         */
        async calculateProgress(projectId) {
            return this.progressService.calculateProgress(projectId);
        }
        /**
         * Generate activity feed for a project
         * Delegates to: ProjectActivityService
         */
        async getActivityFeed(projectId, limit = 50, offset = 0) {
            return this.activityService.getActivityFeed(projectId, limit, offset);
        }
        /**
         * Get upcoming events and deadlines for a project
         * Delegates to: ProjectActivityService
         */
        async getUpcomingEvents(projectId, daysAhead = 30) {
            return this.activityService.getUpcomingEvents(projectId, daysAhead);
        }
        /**
         * Additional methods for extended functionality
         */
        /**
         * Get project progress summary
         */
        async getProgressSummary(id) {
            return this.progressService.getProgressSummary(id);
        }
        /**
         * Get estimated completion date
         */
        async getEstimatedCompletion(id) {
            return this.progressService.getEstimatedCompletion(id);
        }
        /**
         * Get schedule variance
         */
        async getScheduleVariance(id) {
            return this.progressService.getScheduleVariance(id);
        }
        /**
         * Get project phase
         */
        async getProjectPhase(id) {
            return this.progressService.getProjectPhase(id);
        }
        /**
         * Get recent activity summary
         */
        async getRecentActivitySummary(id, days = 7) {
            return this.activityService.getRecentActivitySummary(id, days);
        }
        /**
         * Get activity heatmap
         */
        async getActivityHeatmap(id, days = 30) {
            return this.activityService.getActivityHeatmap(id, days);
        }
        /**
         * Check if project exists
         */
        async exists(id) {
            return this.managementService.exists(id);
        }
        /**
         * Check if user has access to project
         */
        async hasAccess(projectId, userId, role) {
            return this.managementService.hasAccess(projectId, userId, role);
        }
        /**
         * Get projects by client
         */
        async findByClient(clientId) {
            return this.managementService.findByClient(clientId);
        }
        /**
         * Get projects by designer
         */
        async findByDesigner(designerId) {
            return this.managementService.findByDesigner(designerId);
        }
        /**
         * Delete/close project
         */
        async delete(id, userId) {
            return this.managementService.delete(id, userId);
        }
    };
    return ProjectsRefactoredService = _classThis;
})();
exports.ProjectsRefactoredService = ProjectsRefactoredService;
//# sourceMappingURL=projects-refactored.service.js.map