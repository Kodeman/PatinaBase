import { PrismaService } from '../prisma/prisma.service';
export declare class AnalyticsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    /**
     * Get comprehensive engagement metrics for a project
     */
    getProjectEngagement(projectId: string): Promise<{
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
    /**
     * Get activity breakdown by type
     */
    getActivityBreakdown(projectId: string, days?: number): Promise<{
        periodDays: number;
        totalActivities: number;
        breakdown: Record<string, {
            count: number;
            totalDuration: number;
        }>;
    }>;
    /**
     * Get time-based analytics (daily/weekly patterns)
     */
    getTimeBasedAnalytics(projectId: string, days?: number): Promise<{
        periodDays: number;
        dailyActivity: Record<string, any>;
        hourlyDistribution: Record<number, number>;
        peakEngagementHour: number;
        totalEngagementMinutes: number;
    }>;
    /**
     * Get user-specific analytics
     */
    getUserAnalytics(userId: string, projectId?: string): Promise<{
        userId: string;
        totalActivities: number;
        totalTimeSpentSeconds: number;
        lastActivity: Date | null;
        projectCount: number;
        byProject: Record<string, any>;
        byType: Record<string, number>;
    }>;
    /**
     * Get interaction tracking for specific entities
     */
    getEntityInteractions(projectId: string, entityType: string, entityId: string): Promise<{
        entityType: string;
        entityId: string;
        totalInteractions: number;
        uniqueUsers: number;
        totalViews: number;
        totalTimeSpentSeconds: number;
        byUser: Record<string, any>;
    }>;
    /**
     * Calculate approval velocity metrics
     */
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
    /**
     * Calculate response rate and satisfaction metrics
     */
    getClientSatisfactionMetrics(projectId: string): Promise<{
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
    /**
     * Get comprehensive dashboard analytics
     */
    getDashboardAnalytics(projectId: string): Promise<{
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
    /**
     * Update satisfaction score for a project
     */
    updateSatisfactionScore(projectId: string, score: number): Promise<{
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
//# sourceMappingURL=analytics.service.d.ts.map