/**
 * Progress Calculator Domain Service
 *
 * Pure domain service for calculating project progress metrics.
 * Contains ZERO dependencies on infrastructure or external services.
 *
 * This service can be tested with simple objects without database access.
 *
 * Benefits:
 * - Pure business logic: No side effects
 * - Highly testable: No mocking required
 * - Reusable: Can be used across different contexts
 */
export interface TimelineSegment {
    progress: number;
    phase: string;
    status: string;
}
export interface ProjectTimeline {
    startDate: Date | null;
    endDate: Date | null;
}
export interface TaskMetrics {
    total: number;
    completed: number;
}
export interface MilestoneMetrics {
    total: number;
    completed: number;
}
export interface ProjectProgressResult {
    overallProgress: number;
    phaseProgress: Record<string, number>;
    timeProgress: number;
    taskCompletionRate: number;
    milestoneCompletionRate: number;
    timeline: {
        totalDuration: number;
        daysElapsed: number;
        daysRemaining: number;
        startDate: Date | null;
        endDate: Date | null;
    };
    health: {
        isOnSchedule: boolean;
        isBehindSchedule: boolean;
        isAheadOfSchedule: boolean;
    };
}
export declare class ProgressCalculatorService {
    /**
     * Calculate overall progress from timeline segments
     */
    calculateOverallProgress(segments: TimelineSegment[]): number;
    /**
     * Calculate progress by phase
     */
    calculatePhaseProgress(segments: TimelineSegment[]): Record<string, number>;
    /**
     * Calculate time-based progress
     */
    calculateTimeProgress(timeline: ProjectTimeline, now?: Date): {
        timeProgress: number;
        daysElapsed: number;
        daysRemaining: number;
        totalDuration: number;
    };
    /**
     * Calculate task completion rate
     */
    calculateTaskCompletionRate(tasks: TaskMetrics): number;
    /**
     * Calculate milestone completion rate
     */
    calculateMilestoneCompletionRate(milestones: MilestoneMetrics): number;
    /**
     * Calculate project health indicators
     */
    calculateProjectHealth(overallProgress: number, timeProgress: number, tolerance?: number): {
        isOnSchedule: boolean;
        isBehindSchedule: boolean;
        isAheadOfSchedule: boolean;
    };
    /**
     * Calculate comprehensive project progress
     * This is the main method that orchestrates all calculations
     */
    calculateProgress(segments: TimelineSegment[], timeline: ProjectTimeline, tasks: TaskMetrics, milestones: MilestoneMetrics, now?: Date): ProjectProgressResult;
    /**
     * Calculate estimated completion date based on current velocity
     */
    calculateEstimatedCompletion(currentProgress: number, timeline: ProjectTimeline, now?: Date): Date | null;
    /**
     * Calculate schedule variance (SV)
     * Negative = behind schedule, Positive = ahead of schedule
     */
    calculateScheduleVariance(overallProgress: number, timeProgress: number): number;
    /**
     * Calculate completion percentage for a given entity count
     */
    calculateCompletionPercentage(total: number, completed: number): number;
    /**
     * Determine project phase based on progress
     */
    determineProjectPhase(overallProgress: number): 'planning' | 'execution' | 'closing';
    /**
     * Calculate weighted progress across multiple categories
     */
    calculateWeightedProgress(weights: Record<string, {
        progress: number;
        weight: number;
    }>): number;
}
//# sourceMappingURL=progress-calculator.service.d.ts.map