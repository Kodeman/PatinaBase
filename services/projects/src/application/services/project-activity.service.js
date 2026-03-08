"use strict";
/**
 * Project Activity Service (Application Layer)
 *
 * Orchestrates project activity tracking and event retrieval.
 *
 * Single Responsibility: Managing project activity feeds and upcoming events
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
exports.ProjectActivityService = void 0;
const common_1 = require("@nestjs/common");
let ProjectActivityService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectActivityService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectActivityService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repository;
        prisma;
        constructor(repository, prisma) {
            this.repository = repository;
            this.prisma = prisma;
        }
        /**
         * Generate activity feed for a project
         */
        async getActivityFeed(projectId, limit = 50, offset = 0) {
            // Verify project exists
            const projectExists = await this.repository.exists(projectId);
            if (!projectExists) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Get audit log activities
            const activities = await this.prisma.auditLog.findMany({
                where: {
                    OR: [
                        { entityType: 'project', entityId: projectId },
                        {
                            entityType: 'timeline_segment',
                            metadata: { path: ['projectId'], equals: projectId },
                        },
                        {
                            entityType: 'approval_record',
                            metadata: { path: ['projectId'], equals: projectId },
                        },
                        { entityType: 'task' },
                        { entityType: 'milestone' },
                        { entityType: 'change_order' },
                        { entityType: 'rfi' },
                        { entityType: 'issue' },
                        { entityType: 'daily_log' },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            });
            // Get client activities
            const clientActivities = await this.prisma.clientActivity.findMany({
                where: { projectId },
                orderBy: { createdAt: 'desc' },
                take: Math.floor(limit / 2),
            });
            // Combine and sort
            const allActivities = [
                ...activities.map((a) => ({
                    id: a.id,
                    type: 'audit',
                    entityType: a.entityType,
                    action: a.action,
                    actor: a.actor,
                    timestamp: a.createdAt,
                    metadata: a.metadata,
                })),
                ...clientActivities.map((a) => ({
                    id: a.id,
                    type: 'client_activity',
                    activityType: a.activityType,
                    userId: a.userId,
                    entityType: a.entityType,
                    entityId: a.entityId,
                    timestamp: a.createdAt,
                    duration: a.duration,
                })),
            ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            return {
                activities: allActivities.slice(0, limit),
                total: allActivities.length,
                hasMore: allActivities.length > limit,
            };
        }
        /**
         * Get upcoming events and deadlines for a project
         */
        async getUpcomingEvents(projectId, daysAhead = 30) {
            // Verify project exists
            const projectExists = await this.repository.exists(projectId);
            if (!projectExists) {
                throw new common_1.NotFoundException('Project not found');
            }
            const now = new Date();
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + daysAhead);
            const [upcomingMilestones, upcomingTasks, upcomingApprovals, upcomingSegments] = await Promise.all([
                this.prisma.milestone.findMany({
                    where: {
                        projectId,
                        targetDate: { gte: now, lte: futureDate },
                        status: { in: ['pending', 'delayed'] },
                    },
                    orderBy: { targetDate: 'asc' },
                }),
                this.prisma.task.findMany({
                    where: {
                        projectId,
                        dueDate: { gte: now, lte: futureDate },
                        status: { notIn: ['done', 'cancelled'] },
                    },
                    orderBy: { dueDate: 'asc' },
                }),
                this.prisma.approvalRecord.findMany({
                    where: {
                        projectId,
                        dueDate: { gte: now, lte: futureDate },
                        status: { in: ['pending', 'needs_discussion'] },
                    },
                    orderBy: { dueDate: 'asc' },
                }),
                this.prisma.timelineSegment.findMany({
                    where: {
                        projectId,
                        OR: [
                            { startDate: { gte: now, lte: futureDate } },
                            { endDate: { gte: now, lte: futureDate } },
                        ],
                    },
                    orderBy: { startDate: 'asc' },
                }),
            ]);
            return {
                milestones: upcomingMilestones,
                tasks: upcomingTasks,
                approvals: upcomingApprovals,
                segments: upcomingSegments,
                totalEvents: upcomingMilestones.length + upcomingTasks.length + upcomingApprovals.length,
            };
        }
        /**
         * Get recent activity summary (last N days)
         */
        async getRecentActivitySummary(projectId, days = 7) {
            const projectExists = await this.repository.exists(projectId);
            if (!projectExists) {
                throw new common_1.NotFoundException('Project not found');
            }
            const since = new Date();
            since.setDate(since.getDate() - days);
            const [tasksCompleted, approvalsGranted, milestonesReached, issuesResolved] = await Promise.all([
                this.prisma.task.count({
                    where: {
                        projectId,
                        status: 'done',
                        completedAt: { gte: since },
                    },
                }),
                this.prisma.approvalRecord.count({
                    where: {
                        projectId,
                        status: 'approved',
                        approvedAt: { gte: since },
                    },
                }),
                this.prisma.milestone.count({
                    where: {
                        projectId,
                        status: 'completed',
                        completedAt: { gte: since },
                    },
                }),
                this.prisma.issue.count({
                    where: {
                        projectId,
                        status: 'resolved',
                        resolvedAt: { gte: since },
                    },
                }),
            ]);
            return {
                tasksCompleted,
                approvalsGranted,
                milestonesReached,
                issuesResolved,
            };
        }
        /**
         * Get activity heatmap (activity by day)
         */
        async getActivityHeatmap(projectId, days = 30) {
            const projectExists = await this.repository.exists(projectId);
            if (!projectExists) {
                throw new common_1.NotFoundException('Project not found');
            }
            const since = new Date();
            since.setDate(since.getDate() - days);
            const activities = await this.prisma.auditLog.findMany({
                where: {
                    OR: [
                        { entityType: 'project', entityId: projectId },
                        {
                            entityType: 'timeline_segment',
                            metadata: { path: ['projectId'], equals: projectId },
                        },
                    ],
                    createdAt: { gte: since },
                },
                select: { createdAt: true },
            });
            // Group by date
            const heatmap = {};
            activities.forEach((activity) => {
                const date = activity.createdAt.toISOString().split('T')[0];
                heatmap[date] = (heatmap[date] || 0) + 1;
            });
            // Convert to array
            return Object.entries(heatmap)
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }
    };
    return ProjectActivityService = _classThis;
})();
exports.ProjectActivityService = ProjectActivityService;
//# sourceMappingURL=project-activity.service.js.map