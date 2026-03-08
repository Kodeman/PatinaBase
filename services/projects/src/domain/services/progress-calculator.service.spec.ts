/**
 * Progress Calculator Service Tests
 *
 * Tests pure domain logic for progress calculations.
 * No database dependencies - tests run in <50ms.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ProgressCalculatorService, TimelineSegment } from './progress-calculator.service';

describe('ProgressCalculatorService', () => {
  let service: ProgressCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProgressCalculatorService],
    }).compile();

    service = module.get<ProgressCalculatorService>(ProgressCalculatorService);
  });

  describe('calculateOverallProgress', () => {
    it('should return 0 for empty segments', () => {
      const result = service.calculateOverallProgress([]);
      expect(result).toBe(0);
    });

    it('should calculate average progress correctly', () => {
      const segments: TimelineSegment[] = [
        { progress: 50, phase: 'design', status: 'active' },
        { progress: 75, phase: 'execution', status: 'active' },
        { progress: 100, phase: 'closing', status: 'completed' },
      ];

      const result = service.calculateOverallProgress(segments);
      expect(result).toBe(75); // (50 + 75 + 100) / 3 = 75
    });
  });

  describe('calculatePhaseProgress', () => {
    it('should group progress by phase', () => {
      const segments: TimelineSegment[] = [
        { progress: 50, phase: 'design', status: 'active' },
        { progress: 60, phase: 'design', status: 'active' },
        { progress: 75, phase: 'execution', status: 'active' },
      ];

      const result = service.calculatePhaseProgress(segments);

      expect(result).toEqual({
        design: 55, // (50 + 60) / 2
        execution: 75,
      });
    });
  });

  describe('calculateTimeProgress', () => {
    it('should calculate time progress correctly', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');
      const now = new Date('2025-07-01'); // Halfway through the year

      const result = service.calculateTimeProgress(
        { startDate, endDate },
        now
      );

      expect(result.totalDuration).toBeGreaterThan(360); // ~365 days
      expect(result.timeProgress).toBeCloseTo(50, 0); // ~50% through
    });

    it('should handle missing dates', () => {
      const result = service.calculateTimeProgress({ startDate: null, endDate: null });

      expect(result.timeProgress).toBe(0);
      expect(result.totalDuration).toBe(0);
    });
  });

  describe('calculateTaskCompletionRate', () => {
    it('should return 0 when no tasks', () => {
      const result = service.calculateTaskCompletionRate({ total: 0, completed: 0 });
      expect(result).toBe(0);
    });

    it('should calculate percentage correctly', () => {
      const result = service.calculateTaskCompletionRate({ total: 10, completed: 7 });
      expect(result).toBe(70);
    });
  });

  describe('calculateProjectHealth', () => {
    it('should mark as on schedule when within tolerance', () => {
      const result = service.calculateProjectHealth(50, 52, 10);

      expect(result.isOnSchedule).toBe(true);
      expect(result.isBehindSchedule).toBe(false);
      expect(result.isAheadOfSchedule).toBe(false);
    });

    it('should mark as behind schedule', () => {
      const result = service.calculateProjectHealth(30, 60, 10);

      expect(result.isBehindSchedule).toBe(true);
      expect(result.isOnSchedule).toBe(false);
    });

    it('should mark as ahead of schedule', () => {
      const result = service.calculateProjectHealth(80, 50, 10);

      expect(result.isAheadOfSchedule).toBe(true);
      expect(result.isOnSchedule).toBe(false);
    });
  });

  describe('calculateEstimatedCompletion', () => {
    it('should estimate completion date based on velocity', () => {
      const startDate = new Date('2025-01-01');
      const now = new Date('2025-02-01'); // 31 days elapsed
      const currentProgress = 31; // 31% complete

      // Velocity = 1% per day, so 69 days remaining
      const estimated = service.calculateEstimatedCompletion(
        currentProgress,
        { startDate, endDate: null },
        now
      );

      expect(estimated).toBeTruthy();
      if (estimated) {
        const daysFromNow = (estimated.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        expect(daysFromNow).toBeCloseTo(69, 0);
      }
    });

    it('should return null when no progress', () => {
      const result = service.calculateEstimatedCompletion(
        0,
        { startDate: new Date(), endDate: null }
      );

      expect(result).toBeNull();
    });
  });

  describe('calculateWeightedProgress', () => {
    it('should calculate weighted average', () => {
      const result = service.calculateWeightedProgress({
        tasks: { progress: 80, weight: 0.5 },
        milestones: { progress: 60, weight: 0.3 },
        timeline: { progress: 50, weight: 0.2 },
      });

      // (80 * 0.5) + (60 * 0.3) + (50 * 0.2) = 40 + 18 + 10 = 68
      expect(result).toBe(68);
    });

    it('should handle zero total weight', () => {
      const result = service.calculateWeightedProgress({});
      expect(result).toBe(0);
    });
  });
});
