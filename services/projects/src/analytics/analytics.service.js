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
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
let AnalyticsService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AnalyticsService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AnalyticsService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        logger = new common_1.Logger(AnalyticsService.name);
        constructor(prisma) {
            this.prisma = prisma;
        }
        /**
         * Get comprehensive engagement metrics for a project
         */
        async getProjectEngagement(projectId) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true, clientId: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Get or create engagement metrics
            let metrics = await this.prisma.engagementMetrics.findUnique({
                where: { projectId },
            });
            if (!metrics) {
                metrics = await this.prisma.engagementMetrics.create({
                    data: {
                        projectId,
                        clientId: project.clientId,
                    },
                });
            }
            // Get recent activity breakdown
            const activityBreakdown = await this.getActivityBreakdown(projectId);
            // Get time-based analytics
            const timeAnalytics = await this.getTimeBasedAnalytics(projectId);
            return {
                ...metrics,
                activityBreakdown,
                timeAnalytics,
            };
        }
        /**
         * Get activity breakdown by type
         */
        async getActivityBreakdown(projectId, days = 30) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const activities = await this.prisma.clientActivity.findMany({
                where: {
                    projectId,
                    createdAt: { gte: cutoffDate },
                },
                select: {
                    activityType: true,
                    duration: true,
                    createdAt: true,
                },
            });
            // Group by activity type
            const breakdown = activities.reduce((acc, activity) => {
                if (!acc[activity.activityType]) {
                    acc[activity.activityType] = {
                        count: 0,
                        totalDuration: 0,
                    };
                }
                acc[activity.activityType].count += 1;
                acc[activity.activityType].totalDuration += activity.duration || 0;
                return acc;
            }, {});
            return {
                periodDays: days,
                totalActivities: activities.length,
                breakdown,
            };
        }
        /**
         * Get time-based analytics (daily/weekly patterns)
         */
        async getTimeBasedAnalytics(projectId, days = 30) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const activities = await this.prisma.clientActivity.findMany({
                where: {
                    projectId,
                    createdAt: { gte: cutoffDate },
                },
                select: {
                    createdAt: true,
                    activityType: true,
                    duration: true,
                },
                orderBy: { createdAt: 'asc' },
            });
            // Group by date
            const byDate = activities.reduce((acc, activity) => {
                const date = activity.createdAt.toISOString().split('T')[0];
                if (!acc[date]) {
                    acc[date] = {
                        count: 0,
                        duration: 0,
                        activities: {},
                    };
                }
                acc[date].count += 1;
                acc[date].duration += activity.duration || 0;
                acc[date].activities[activity.activityType] = (acc[date].activities[activity.activityType] || 0) + 1;
                return acc;
            }, {});
            // Calculate peak engagement times
            const hourlyDistribution = activities.reduce((acc, activity) => {
                const hour = activity.createdAt.getHours();
                acc[hour] = (acc[hour] || 0) + 1;
                return acc;
            }, {});
            const peakHour = Object.entries(hourlyDistribution).reduce((max, [hour, count]) => {
                return count > (max.count || 0) ? { hour: parseInt(hour), count } : max;
            }, { hour: 0, count: 0 });
            return {
                periodDays: days,
                dailyActivity: byDate,
                hourlyDistribution,
                peakEngagementHour: peakHour.hour,
                totalEngagementMinutes: Math.round(activities.reduce((sum, a) => sum + (a.duration || 0), 0) / 60),
            };
        }
        /**
         * Get user-specific analytics
         */
        async getUserAnalytics(userId, projectId) {
            const where = { userId };
            if (projectId)
                where.projectId = projectId;
            const activities = await this.prisma.clientActivity.findMany({
                where,
                select: {
                    projectId: true,
                    activityType: true,
                    duration: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 1000, // Limit for performance
            });
            // Calculate metrics
            const totalActivities = activities.length;
            const totalTimeSpent = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
            const lastActivity = activities.length > 0 ? activities[0].createdAt : null;
            // Group by project
            const byProject = activities.reduce((acc, activity) => {
                const pid = activity.projectId;
                if (!acc[pid]) {
                    acc[pid] = {
                        count: 0,
                        duration: 0,
                        lastActivity: activity.createdAt,
                    };
                }
                acc[pid].count += 1;
                acc[pid].duration += activity.duration || 0;
                return acc;
            }, {});
            // Activity type distribution
            const byType = activities.reduce((acc, activity) => {
                acc[activity.activityType] = (acc[activity.activityType] || 0) + 1;
                return acc;
            }, {});
            return {
                userId,
                totalActivities,
                totalTimeSpentSeconds: totalTimeSpent,
                lastActivity,
                projectCount: Object.keys(byProject).length,
                byProject,
                byType,
            };
        }
        /**
         * Get interaction tracking for specific entities
         */
        async getEntityInteractions(projectId, entityType, entityId) {
            const interactions = await this.prisma.clientActivity.findMany({
                where: {
                    projectId,
                    entityType,
                    entityId,
                },
                orderBy: { createdAt: 'desc' },
            });
            const uniqueUsers = new Set(interactions.map(i => i.userId)).size;
            const totalViews = interactions.filter(i => i.activityType === 'view').length;
            const totalTimeSpent = interactions.reduce((sum, i) => sum + (i.duration || 0), 0);
            // Group by user
            const byUser = interactions.reduce((acc, interaction) => {
                if (!acc[interaction.userId]) {
                    acc[interaction.userId] = {
                        count: 0,
                        duration: 0,
                        lastInteraction: interaction.createdAt,
                    };
                }
                acc[interaction.userId].count += 1;
                acc[interaction.userId].duration += interaction.duration || 0;
                return acc;
            }, {});
            return {
                entityType,
                entityId,
                totalInteractions: interactions.length,
                uniqueUsers,
                totalViews,
                totalTimeSpentSeconds: totalTimeSpent,
                byUser,
            };
        }
        /**
         * Calculate approval velocity metrics
         */
        async getApprovalVelocity(projectId) {
            const approvals = await this.prisma.approvalRecord.findMany({
                where: { projectId },
                select: {
                    createdAt: true,
                    approvedAt: true,
                    rejectedAt: true,
                    status: true,
                    priority: true,
                },
            });
            if (approvals.length === 0) {
                return {
                    avgApprovalTimeDays: 0,
                    totalApprovals: 0,
                    approvedCount: 0,
                    rejectedCount: 0,
                    pendingCount: 0,
                    approvalRate: 0,
                };
            }
            // Calculate average approval time
            const processedApprovals = approvals.filter(a => a.approvedAt || a.rejectedAt);
            const totalDays = processedApprovals.reduce((sum, approval) => {
                const endDate = approval.approvedAt || approval.rejectedAt;
                if (!endDate)
                    return sum;
                const diff = endDate.getTime() - approval.createdAt.getTime();
                return sum + (diff / (1000 * 60 * 60 * 24));
            }, 0);
            const avgApprovalTimeDays = processedApprovals.length > 0
                ? totalDays / processedApprovals.length
                : 0;
            // Count by status
            const approvedCount = approvals.filter(a => a.status === 'approved').length;
            const rejectedCount = approvals.filter(a => a.status === 'rejected').length;
            const pendingCount = approvals.filter(a => a.status === 'pending' || a.status === 'needs_discussion').length;
            // Approval rate
            const approvalRate = processedApprovals.length > 0
                ? (approvedCount / processedApprovals.length) * 100
                : 0;
            // Average by priority
            const byPriority = approvals.reduce((acc, approval) => {
                if (!acc[approval.priority]) {
                    acc[approval.priority] = {
                        count: 0,
                        totalDays: 0,
                    };
                }
                acc[approval.priority].count += 1;
                const endDate = approval.approvedAt || approval.rejectedAt;
                if (endDate) {
                    const diff = endDate.getTime() - approval.createdAt.getTime();
                    acc[approval.priority].totalDays += diff / (1000 * 60 * 60 * 24);
                }
                return acc;
            }, {});
            const avgByPriority = Object.entries(byPriority).reduce((acc, [priority, data]) => {
                acc[priority] = data.count > 0 ? data.totalDays / data.count : 0;
                return acc;
            }, {});
            return {
                avgApprovalTimeDays: Math.round(avgApprovalTimeDays * 10) / 10,
                totalApprovals: approvals.length,
                approvedCount,
                rejectedCount,
                pendingCount,
                approvalRate: Math.round(approvalRate * 10) / 10,
                avgByPriority,
            };
        }
        /**
         * Calculate response rate and satisfaction metrics
         */
        async getClientSatisfactionMetrics(projectId) {
            const metrics = await this.prisma.engagementMetrics.findUnique({
                where: { projectId },
            });
            if (!metrics) {
                return {
                    responseRate: 0,
                    satisfactionScore: null,
                    totalApprovals: 0,
                    totalRejections: 0,
                };
            }
            // Calculate response rate
            const totalRequests = metrics.approvalsCount + metrics.rejectionsCount;
            const responseRate = totalRequests > 0
                ? ((metrics.approvalsCount + metrics.rejectionsCount) / totalRequests) * 100
                : 0;
            return {
                responseRate: Math.round(responseRate * 10) / 10,
                satisfactionScore: metrics.satisfactionScore,
                totalApprovals: metrics.approvalsCount,
                totalRejections: metrics.rejectionsCount,
                totalComments: metrics.commentsCount,
                totalViews: metrics.totalViews,
                totalTimeSpentHours: Math.round((metrics.totalTimeSpent / 3600) * 10) / 10,
                lastActivity: metrics.lastActivity,
            };
        }
        /**
         * Get comprehensive dashboard analytics
         */
        async getDashboardAnalytics(projectId) {
            const [engagement, approvalVelocity, satisfaction, activityBreakdown,] = await Promise.all([
                this.getProjectEngagement(projectId),
                this.getApprovalVelocity(projectId),
                this.getClientSatisfactionMetrics(projectId),
                this.getActivityBreakdown(projectId, 7), // Last 7 days
            ]);
            return {
                projectId,
                engagement,
                approvalVelocity,
                satisfaction,
                recentActivity: activityBreakdown,
                generatedAt: new Date(),
            };
        }
        /**
         * Update satisfaction score for a project
         */
        async updateSatisfactionScore(projectId, score) {
            if (score < 1 || score > 5) {
                throw new Error('Satisfaction score must be between 1 and 5');
            }
            const metrics = await this.prisma.engagementMetrics.findUnique({
                where: { projectId },
            });
            if (!metrics) {
                throw new common_1.NotFoundException('Engagement metrics not found');
            }
            return this.prisma.engagementMetrics.update({
                where: { projectId },
                data: { satisfactionScore: score },
            });
        }
    };
    return AnalyticsService = _classThis;
})();
exports.AnalyticsService = AnalyticsService;
//# sourceMappingURL=analytics.service.js.map