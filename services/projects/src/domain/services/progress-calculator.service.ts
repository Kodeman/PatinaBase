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

import { Injectable } from '@nestjs/common';

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

@Injectable()
export class ProgressCalculatorService {
  /**
   * Calculate overall progress from timeline segments
   */
  calculateOverallProgress(segments: TimelineSegment[]): number {
    if (segments.length === 0) return 0;

    const totalProgress = segments.reduce((sum, seg) => sum + seg.progress, 0);
    return Math.round(totalProgress / segments.length);
  }

  /**
   * Calculate progress by phase
   */
  calculatePhaseProgress(segments: TimelineSegment[]): Record<string, number> {
    const progressByPhase = segments.reduce((acc, seg) => {
      if (!acc[seg.phase]) {
        acc[seg.phase] = { total: 0, count: 0 };
      }
      acc[seg.phase].total += seg.progress;
      acc[seg.phase].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    return Object.entries(progressByPhase).reduce((acc, [phase, data]) => {
      acc[phase] = Math.round(data.total / data.count);
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Calculate time-based progress
   */
  calculateTimeProgress(timeline: ProjectTimeline, now: Date = new Date()): {
    timeProgress: number;
    daysElapsed: number;
    daysRemaining: number;
    totalDuration: number;
  } {
    if (!timeline.startDate || !timeline.endDate) {
      return {
        timeProgress: 0,
        daysElapsed: 0,
        daysRemaining: 0,
        totalDuration: 0,
      };
    }

    const nowTime = now.getTime();
    const startTime = timeline.startDate.getTime();
    const endTime = timeline.endDate.getTime();

    const totalDuration = Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));
    const daysElapsed = Math.ceil((nowTime - startTime) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.ceil((endTime - nowTime) / (1000 * 60 * 60 * 24));

    // Calculate percentage (0-100)
    const timeProgress = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDuration) * 100)));

    return {
      timeProgress,
      daysElapsed,
      daysRemaining,
      totalDuration,
    };
  }

  /**
   * Calculate task completion rate
   */
  calculateTaskCompletionRate(tasks: TaskMetrics): number {
    if (tasks.total === 0) return 0;
    return Math.round((tasks.completed / tasks.total) * 100);
  }

  /**
   * Calculate milestone completion rate
   */
  calculateMilestoneCompletionRate(milestones: MilestoneMetrics): number {
    if (milestones.total === 0) return 0;
    return Math.round((milestones.completed / milestones.total) * 100);
  }

  /**
   * Calculate project health indicators
   */
  calculateProjectHealth(
    overallProgress: number,
    timeProgress: number,
    tolerance: number = 10
  ): {
    isOnSchedule: boolean;
    isBehindSchedule: boolean;
    isAheadOfSchedule: boolean;
  } {
    const isOnSchedule = Math.abs(timeProgress - overallProgress) <= tolerance;
    const isBehindSchedule = overallProgress < timeProgress - tolerance;
    const isAheadOfSchedule = overallProgress > timeProgress + tolerance;

    return {
      isOnSchedule,
      isBehindSchedule,
      isAheadOfSchedule,
    };
  }

  /**
   * Calculate comprehensive project progress
   * This is the main method that orchestrates all calculations
   */
  calculateProgress(
    segments: TimelineSegment[],
    timeline: ProjectTimeline,
    tasks: TaskMetrics,
    milestones: MilestoneMetrics,
    now: Date = new Date()
  ): ProjectProgressResult {
    const overallProgress = this.calculateOverallProgress(segments);
    const phaseProgress = this.calculatePhaseProgress(segments);
    const { timeProgress, daysElapsed, daysRemaining, totalDuration } = this.calculateTimeProgress(timeline, now);
    const taskCompletionRate = this.calculateTaskCompletionRate(tasks);
    const milestoneCompletionRate = this.calculateMilestoneCompletionRate(milestones);
    const health = this.calculateProjectHealth(overallProgress, timeProgress);

    return {
      overallProgress,
      phaseProgress,
      timeProgress,
      taskCompletionRate,
      milestoneCompletionRate,
      timeline: {
        totalDuration,
        daysElapsed,
        daysRemaining,
        startDate: timeline.startDate,
        endDate: timeline.endDate,
      },
      health,
    };
  }

  /**
   * Calculate estimated completion date based on current velocity
   */
  calculateEstimatedCompletion(
    currentProgress: number,
    timeline: ProjectTimeline,
    now: Date = new Date()
  ): Date | null {
    if (!timeline.startDate || currentProgress === 0) {
      return null;
    }

    const startTime = timeline.startDate.getTime();
    const nowTime = now.getTime();
    const daysElapsed = (nowTime - startTime) / (1000 * 60 * 60 * 24);

    // Calculate velocity (progress per day)
    const velocity = currentProgress / daysElapsed;

    if (velocity === 0) return null;

    // Calculate remaining days
    const remainingProgress = 100 - currentProgress;
    const estimatedDaysRemaining = remainingProgress / velocity;

    // Calculate estimated completion date
    const estimatedCompletionTime = nowTime + (estimatedDaysRemaining * 24 * 60 * 60 * 1000);
    return new Date(estimatedCompletionTime);
  }

  /**
   * Calculate schedule variance (SV)
   * Negative = behind schedule, Positive = ahead of schedule
   */
  calculateScheduleVariance(
    overallProgress: number,
    timeProgress: number
  ): number {
    return overallProgress - timeProgress;
  }

  /**
   * Calculate completion percentage for a given entity count
   */
  calculateCompletionPercentage(total: number, completed: number): number {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  }

  /**
   * Determine project phase based on progress
   */
  determineProjectPhase(overallProgress: number): 'planning' | 'execution' | 'closing' {
    if (overallProgress < 10) return 'planning';
    if (overallProgress < 90) return 'execution';
    return 'closing';
  }

  /**
   * Calculate weighted progress across multiple categories
   */
  calculateWeightedProgress(weights: Record<string, { progress: number; weight: number }>): number {
    let totalWeight = 0;
    let weightedSum = 0;

    Object.values(weights).forEach(({ progress, weight }) => {
      weightedSum += progress * weight;
      totalWeight += weight;
    });

    if (totalWeight === 0) return 0;
    return Math.round(weightedSum / totalWeight);
  }
}
