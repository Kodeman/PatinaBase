"use strict";
/**
 * Project Progress Service (Application Layer)
 *
 * Orchestrates project progress calculations by coordinating:
 * - ProgressCalculatorService (pure domain logic)
 * - Repository (data access for metrics)
 * - Prisma (for querying progress data)
 *
 * Single Responsibility: Calculating and providing project progress metrics
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
exports.ProjectProgressService = void 0;
const common_1 = require("@nestjs/common");
let ProjectProgressService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectProgressService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectProgressService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repository;
        progressCalculator;
        prisma;
        constructor(repository, progressCalculator, prisma) {
            this.repository = repository;
            this.progressCalculator = progressCalculator;
            this.prisma = prisma;
        }
        /**
         * Calculate comprehensive project progress
         */
        async calculateProgress(projectId) {
            // Verify project exists
            const project = await this.repository.findById(projectId);
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Get timeline segments
            const segments = await this.prisma.timelineSegment.findMany({
                where: { projectId },
                select: { progress: true, phase: true, status: true },
            });
            // Get task metrics
            const [totalTasks, completedTasks] = await Promise.all([
                this.prisma.task.count({ where: { projectId } }),
                this.prisma.task.count({ where: { projectId, status: 'done' } }),
            ]);
            // Get milestone metrics
            const [totalMilestones, completedMilestones] = await Promise.all([
                this.prisma.milestone.count({ where: { projectId } }),
                this.prisma.milestone.count({ where: { projectId, status: 'completed' } }),
            ]);
            // Use domain service to calculate progress
            return this.progressCalculator.calculateProgress(segments, {
                startDate: project.startDate,
                endDate: project.endDate,
            }, {
                total: totalTasks,
                completed: completedTasks,
            }, {
                total: totalMilestones,
                completed: completedMilestones,
            });
        }
        /**
         * Get simple progress summary
         */
        async getProgressSummary(projectId) {
            const progress = await this.calculateProgress(projectId);
            let health = 'good';
            if (progress.health.isBehindSchedule)
                health = 'at_risk';
            if (progress.health.isAheadOfSchedule)
                health = 'excellent';
            return {
                overallProgress: progress.overallProgress,
                taskCompletionRate: progress.taskCompletionRate,
                milestoneCompletionRate: progress.milestoneCompletionRate,
                health,
            };
        }
        /**
         * Get estimated completion date
         */
        async getEstimatedCompletion(projectId) {
            const project = await this.repository.findById(projectId);
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            const progress = await this.calculateProgress(projectId);
            return this.progressCalculator.calculateEstimatedCompletion(progress.overallProgress, {
                startDate: project.startDate,
                endDate: project.endDate,
            });
        }
        /**
         * Get schedule variance (SV)
         */
        async getScheduleVariance(projectId) {
            const progress = await this.calculateProgress(projectId);
            return this.progressCalculator.calculateScheduleVariance(progress.overallProgress, progress.timeProgress);
        }
        /**
         * Get project phase
         */
        async getProjectPhase(projectId) {
            const progress = await this.calculateProgress(projectId);
            return this.progressCalculator.determineProjectPhase(progress.overallProgress);
        }
        /**
         * Get weighted progress (custom weights)
         */
        async getWeightedProgress(projectId, weights = {}) {
            const progress = await this.calculateProgress(projectId);
            // Default weights
            const defaultWeights = {
                tasks: 0.4,
                milestones: 0.3,
                timeline: 0.3,
            };
            const finalWeights = { ...defaultWeights, ...weights };
            return this.progressCalculator.calculateWeightedProgress({
                tasks: {
                    progress: progress.taskCompletionRate,
                    weight: finalWeights.tasks,
                },
                milestones: {
                    progress: progress.milestoneCompletionRate,
                    weight: finalWeights.milestones,
                },
                timeline: {
                    progress: progress.timeProgress,
                    weight: finalWeights.timeline,
                },
            });
        }
        /**
         * Get project statistics
         */
        async getStats(projectId) {
            return this.repository.getStats(projectId);
        }
        /**
         * Get client-safe project data with progress
         */
        async getClientSafeData(projectId, clientId) {
            return this.repository.getClientSafeData(projectId, clientId);
        }
    };
    return ProjectProgressService = _classThis;
})();
exports.ProjectProgressService = ProjectProgressService;
//# sourceMappingURL=project-progress.service.js.map