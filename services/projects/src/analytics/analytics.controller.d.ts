import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    getDashboard(projectId: string): Promise<{
        projectId: string;
        engagement: {
            activityBreakdown: {
                periodDays: number;
                totalActivities: number;
                breakdown: Record<string, {
                    count: number;
                    totalDuration: number;
                }>;
            };
            timeAnalytics: {
                periodDays: number;
                dailyActivity: Record<string, any>;
                hourlyDistribution: Record<number, number>;
                peakEngagementHour: number;
                totalEngagementMinutes: number;
            };
            id: string;
            metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
            clientId: string;
            createdAt: Date;
            updatedAt: Date;
            projectId: string;
            totalViews: number;
            totalTimeSpent: number;
            lastActivity: Date | null;
            approvalVelocity: number | null;
            responseRate: number | null;
            satisfactionScore: number | null;
            commentsCount: number;
            approvalsCount: number;
            rejectionsCount: number;
            documentsViewed: number;
            documentsDownloaded: number;
        };
        approvalVelocity: {
            avgApprovalTimeDays: number;
            totalApprovals: number;
            approvedCount: number;
            rejectedCount: number;
            pendingCount: number;
            approvalRate: number;
            avgByPriority?: undefined;
        } | {
            avgApprovalTimeDays: number;
            totalApprovals: number;
            approvedCount: number;
            rejectedCount: number;
            pendingCount: number;
            approvalRate: number;
            avgByPriority: Record<string, number>;
        };
        satisfaction: {
            responseRate: number;
            satisfactionScore: null;
            totalApprovals: number;
            totalRejections: number;
            totalComments?: undefined;
            totalViews?: undefined;
            totalTimeSpentHours?: undefined;
            lastActivity?: undefined;
        } | {
            responseRate: number;
            satisfactionScore: number | null;
            totalApprovals: number;
            totalRejections: number;
            totalComments: number;
            totalViews: number;
            totalTimeSpentHours: number;
            lastActivity: Date | null;
        };
        recentActivity: {
            periodDays: number;
            totalActivities: number;
            breakdown: Record<string, {
                count: number;
                totalDuration: number;
            }>;
        };
        generatedAt: Date;
    }>;
    getEngagement(projectId: string): Promise<{
        activityBreakdown: {
            periodDays: number;
            totalActivities: number;
            breakdown: Record<string, {
                count: number;
                totalDuration: number;
            }>;
        };
        timeAnalytics: {
            periodDays: number;
            dailyActivity: Record<string, any>;
            hourlyDistribution: Record<number, number>;
            peakEngagementHour: number;
            totalEngagementMinutes: number;
        };
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        clientId: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        totalViews: number;
        totalTimeSpent: number;
        lastActivity: Date | null;
        approvalVelocity: number | null;
        responseRate: number | null;
        satisfactionScore: number | null;
        commentsCount: number;
        approvalsCount: number;
        rejectionsCount: number;
        documentsViewed: number;
        documentsDownloaded: number;
    }>;
    getActivityBreakdown(projectId: string, days?: string): Promise<{
        periodDays: number;
        totalActivities: number;
        breakdown: Record<string, {
            count: number;
            totalDuration: number;
        }>;
    }>;
    getTimeBasedAnalytics(projectId: string, days?: string): Promise<{
        periodDays: number;
        dailyActivity: Record<string, any>;
        hourlyDistribution: Record<number, number>;
        peakEngagementHour: number;
        totalEngagementMinutes: number;
    }>;
    getApprovalVelocity(projectId: string): Promise<{
        avgApprovalTimeDays: number;
        totalApprovals: number;
        approvedCount: number;
        rejectedCount: number;
        pendingCount: number;
        approvalRate: number;
        avgByPriority?: undefined;
    } | {
        avgApprovalTimeDays: number;
        totalApprovals: number;
        approvedCount: number;
        rejectedCount: number;
        pendingCount: number;
        approvalRate: number;
        avgByPriority: Record<string, number>;
    }>;
    getSatisfactionMetrics(projectId: string): Promise<{
        responseRate: number;
        satisfactionScore: null;
        totalApprovals: number;
        totalRejections: number;
        totalComments?: undefined;
        totalViews?: undefined;
        totalTimeSpentHours?: undefined;
        lastActivity?: undefined;
    } | {
        responseRate: number;
        satisfactionScore: number | null;
        totalApprovals: number;
        totalRejections: number;
        totalComments: number;
        totalViews: number;
        totalTimeSpentHours: number;
        lastActivity: Date | null;
    }>;
    getUserAnalytics(userId: string, projectId?: string): Promise<{
        userId: string;
        totalActivities: number;
        totalTimeSpentSeconds: number;
        lastActivity: Date | null;
        projectCount: number;
        byProject: Record<string, any>;
        byType: Record<string, number>;
    }>;
    getEntityInteractions(projectId: string, entityType: string, entityId: string): Promise<{
        entityType: string;
        entityId: string;
        totalInteractions: number;
        uniqueUsers: number;
        totalViews: number;
        totalTimeSpentSeconds: number;
        byUser: Record<string, any>;
    }>;
    updateSatisfactionScore(projectId: string, body: {
        score: number;
    }): Promise<{
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        clientId: string;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        totalViews: number;
        totalTimeSpent: number;
        lastActivity: Date | null;
        approvalVelocity: number | null;
        responseRate: number | null;
        satisfactionScore: number | null;
        commentsCount: number;
        approvalsCount: number;
        rejectionsCount: number;
        documentsViewed: number;
        documentsDownloaded: number;
    }>;
}
//# sourceMappingURL=analytics.controller.d.ts.map