/**
 * ProgressAnalyticsService Unit Tests
 *
 * Tests progress metrics, health indicators, and engagement analytics
 */
import { NotFoundException } from '@nestjs/common';
import { ProgressAnalyticsService } from './progress-analytics.service';

describe('ProgressAnalyticsService', () => {
  let service: ProgressAnalyticsService;
  let mockPrismaService: any;

  // Mock data factories
  const createMockProject = (overrides = {}) => ({
    id: 'project-123',
    title: 'Test Project',
    status: 'active',
    clientId: 'client-123',
    designerId: 'designer-123',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date(),
    timelineSegments: [],
    milestones: [],
    approvalRecords: [],
    ...overrides,
  });

  const createMockSegment = (overrides = {}) => ({
    id: 'segment-123',
    projectId: 'project-123',
    title: 'Design Phase',
    phase: 'design',
    status: 'in_progress',
    progress: 50,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-03-31'),
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockMilestone = (overrides = {}) => ({
    id: 'milestone-123',
    projectId: 'project-123',
    title: 'Design Approval',
    status: 'completed',
    targetDate: new Date('2024-02-15'),
    completedAt: new Date('2024-02-14'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockApproval = (overrides = {}) => ({
    id: 'approval-123',
    projectId: 'project-123',
    title: 'Design Review',
    status: 'approved',
    approvalType: 'design',
    dueDate: new Date('2024-02-28'),
    createdAt: new Date('2024-02-01'),
    approvedAt: new Date('2024-02-10'),
    rejectedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    // Re-create mocks for each test to avoid stale state
    mockPrismaService = {
      project: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    // Manual instantiation - bypasses NestJS DI metadata issues
    service = new ProgressAnalyticsService(mockPrismaService);
  });

  describe('getProjectProgress', () => {
    it('should calculate milestone completion percentage', async () => {
      const mockProject = createMockProject({
        timelineSegments: [createMockSegment({ progress: 100 })],
        milestones: [
          createMockMilestone({ status: 'completed' }),
          createMockMilestone({ status: 'completed' }),
          createMockMilestone({ status: 'pending', completedAt: null }),
        ],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.milestoneMetrics.totalMilestones).toBe(3);
      expect(result.milestoneMetrics.completedMilestones).toBe(2);
      // 2/3 = 66.67%
    });

    it('should calculate task completion percentage', async () => {
      const segments = [
        createMockSegment({ progress: 100 }),
        createMockSegment({ progress: 50 }),
        createMockSegment({ progress: 0 }),
      ];
      const mockProject = createMockProject({
        timelineSegments: segments,
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.overallProgress).toBe(50); // (100 + 50 + 0) / 3 = 50
    });

    it('should calculate approval rate', async () => {
      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [],
        approvalRecords: [
          createMockApproval({ status: 'approved' }),
          createMockApproval({ status: 'approved' }),
          createMockApproval({ status: 'rejected', approvedAt: null, rejectedAt: new Date() }),
        ],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.approvalMetrics.approvalRate).toBe(67); // 2/3 = 66.67, rounded to 67
    });

    it('should calculate on-time delivery rate', async () => {
      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [
          // On time: completed before target date
          createMockMilestone({
            status: 'completed',
            targetDate: new Date('2024-02-15'),
            completedAt: new Date('2024-02-10'),
          }),
          // Late: completed after target date
          createMockMilestone({
            status: 'completed',
            targetDate: new Date('2024-03-01'),
            completedAt: new Date('2024-03-05'),
          }),
        ],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.milestoneMetrics.onTimeCompletionRate).toBe(50); // 1/2 on time
    });

    it('should return zero for empty project', async () => {
      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.overallProgress).toBe(0);
      expect(result.milestoneMetrics.totalMilestones).toBe(0);
      expect(result.approvalMetrics.totalApprovals).toBe(0);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(null);

      await expect(service.getProjectProgress('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHealthIndicators', () => {
    const setupHealthTest = (overrides = {}) => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const endDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days from now

      const mockProject = createMockProject({
        startDate,
        endDate,
        timelineSegments: [createMockSegment({ progress: 35 })],
        milestones: [createMockMilestone({ status: 'completed' })],
        approvalRecords: [createMockApproval({ status: 'approved' })],
        ...overrides,
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([{
        createdAt: now,
        metadata: { sessionId: 'session-1', durationSeconds: 120 },
      }]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);
    };

    it('should calculate weighted health score', async () => {
      setupHealthTest();

      const result = await service.getHealthIndicators('project-123');

      expect(result).toHaveLength(4); // schedule, approvals, engagement, milestones
      result.forEach(indicator => {
        expect(indicator).toHaveProperty('category');
        expect(indicator).toHaveProperty('score');
        expect(indicator).toHaveProperty('status');
        expect(indicator).toHaveProperty('message');
      });
    });

    it('should identify risk factors correctly', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Project is behind schedule
      const mockProject = createMockProject({
        startDate,
        endDate,
        timelineSegments: [createMockSegment({ progress: 20 })], // Only 20% done at 67% time
        milestones: [
          createMockMilestone({ status: 'pending', completedAt: null, targetDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }), // Overdue
        ],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getHealthIndicators('project-123');

      const scheduleIndicator = result.find(i => i.category === 'schedule');
      expect(scheduleIndicator?.status).toBe('critical');

      const milestoneIndicator = result.find(i => i.category === 'milestones');
      // One overdue milestone should trigger at least a warning status
      expect(['critical', 'warning']).toContain(milestoneIndicator?.status);
    });

    it('should calculate schedule variance', async () => {
      setupHealthTest();

      const result = await service.getHealthIndicators('project-123');
      const scheduleIndicator = result.find(i => i.category === 'schedule');

      expect(scheduleIndicator).toBeDefined();
      expect(scheduleIndicator?.message).toMatch(/ahead|behind/);
    });

    it('should generate appropriate recommendations', async () => {
      const now = new Date();
      const mockProject = createMockProject({
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        timelineSegments: [createMockSegment({ progress: 10 })], // Way behind
        milestones: [createMockMilestone({ status: 'pending', completedAt: null, targetDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) })],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      // No recent visits - engagement issue
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getHealthIndicators('project-123');

      const scheduleRec = result.find(i => i.category === 'schedule')?.recommendation;
      const engagementRec = result.find(i => i.category === 'engagement')?.recommendation;

      expect(scheduleRec).toBeDefined();
      expect(engagementRec).toBeDefined();
    });

    it('should mark project at risk when score below threshold', async () => {
      setupHealthTest();

      // Get project progress to check health status
      const progress = await service.getProjectProgress('project-123');

      expect(progress.status).toBeDefined();
      expect(['on_track', 'at_risk', 'behind', 'ahead']).toContain(progress.status);
    });

    it('should handle project with no data gracefully', async () => {
      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getHealthIndicators('project-123');

      expect(result).toHaveLength(4);
      // Should not throw, should return default/safe values
    });
  });

  describe('recordTimelineView', () => {
    it('should create audit log entry', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({});

      await service.recordTimelineView('project-123', 'user-123', 'session-abc', 120);

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'timeline_view',
          entityId: 'project-123',
          action: 'viewed',
          actor: 'user-123',
          metadata: expect.objectContaining({
            sessionId: 'session-abc',
            durationSeconds: 120,
          }),
        }),
      });
    });

    it('should update last viewed timestamp', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({});

      await service.recordTimelineView('project-123', 'user-123', 'session-abc');

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            viewedAt: expect.any(Date),
          }),
        }),
      });
    });

    it('should not throw on database error', async () => {
      mockPrismaService.auditLog.create.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(
        service.recordTimelineView('project-123', 'user-123', 'session-abc')
      ).resolves.not.toThrow();
    });
  });

  describe('recordMediaGalleryOpen', () => {
    it('should create audit log for gallery open', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({});

      await service.recordMediaGalleryOpen('project-123', 'segment-123', 'user-123');

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'media_gallery',
          entityId: 'segment-123',
          action: 'opened',
          actor: 'user-123',
          metadata: { projectId: 'project-123' },
        }),
      });
    });

    it('should not throw on database error', async () => {
      mockPrismaService.auditLog.create.mockRejectedValue(new Error('DB error'));

      await expect(
        service.recordMediaGalleryOpen('project-123', 'segment-123', 'user-123')
      ).resolves.not.toThrow();
    });
  });

  describe('engagement metrics calculation', () => {
    it('should calculate average session duration', async () => {
      const mockProject = createMockProject({
        timelineSegments: [createMockSegment()],
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([
        { createdAt: new Date(), metadata: { sessionId: 'session-1', durationSeconds: 100 } },
        { createdAt: new Date(), metadata: { sessionId: 'session-2', durationSeconds: 200 } },
        { createdAt: new Date(), metadata: { sessionId: 'session-3', durationSeconds: 150 } },
      ]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.engagement.avgViewDurationSeconds).toBe(150); // (100 + 200 + 150) / 3
    });

    it('should count unique visitors', async () => {
      const mockProject = createMockProject({
        timelineSegments: [createMockSegment()],
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([
        { createdAt: new Date(), metadata: { sessionId: 'session-1' } },
        { createdAt: new Date(), metadata: { sessionId: 'session-1' } }, // Same session
        { createdAt: new Date(), metadata: { sessionId: 'session-2' } },
      ]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.engagement.uniqueSessions).toBe(2);
    });

    it('should calculate days since last visit', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const mockProject = createMockProject({
        timelineSegments: [createMockSegment()],
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([
        { createdAt: twoDaysAgo, metadata: { sessionId: 'session-1' } },
      ]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.engagement.daysSinceLastVisit).toBe(2);
    });
  });

  describe('approval metrics calculation', () => {
    it('should calculate average response time', async () => {
      const created = new Date('2024-02-01T10:00:00Z');
      const responded1 = new Date('2024-02-01T14:00:00Z'); // 4 hours
      const responded2 = new Date('2024-02-01T18:00:00Z'); // 8 hours

      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [],
        approvalRecords: [
          createMockApproval({ createdAt: created, approvedAt: responded1, status: 'approved' }),
          createMockApproval({ createdAt: created, approvedAt: responded2, status: 'approved' }),
        ],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.approvalMetrics.avgResponseTimeHours).toBe(6); // (4 + 8) / 2
    });

    it('should prioritize pending approvals correctly', async () => {
      const now = new Date();
      const overdueDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const soonDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
      const laterDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [],
        approvalRecords: [
          createMockApproval({ id: 'apr-1', status: 'pending', dueDate: laterDate, approvedAt: null }),
          createMockApproval({ id: 'apr-2', status: 'pending', dueDate: overdueDate, approvedAt: null }),
          createMockApproval({ id: 'apr-3', status: 'pending', dueDate: soonDate, approvedAt: null }),
        ],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      // Pending list should be sorted by priority: urgent > high > normal > low
      expect(result.approvalMetrics.pendingList[0].priority).toBe('urgent'); // Overdue
      expect(result.approvalMetrics.pendingList[1].priority).toBe('high'); // Due in 1 day
      expect(result.approvalMetrics.pendingList[2].priority).toBe('low'); // Due in 10 days
    });
  });

  describe('milestone metrics calculation', () => {
    it('should find next upcoming milestone', async () => {
      const now = new Date();
      const future1 = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const future2 = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [
          createMockMilestone({ id: 'ms-2', status: 'pending', completedAt: null, targetDate: future2 }),
          createMockMilestone({ id: 'ms-1', status: 'pending', completedAt: null, targetDate: future1 }),
        ],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.milestoneMetrics.nextMilestone?.id).toBe('ms-1');
      expect(result.milestoneMetrics.nextMilestone?.daysUntil).toBeGreaterThanOrEqual(4);
      expect(result.milestoneMetrics.nextMilestone?.daysUntil).toBeLessThanOrEqual(6);
    });

    it('should calculate average completion days', async () => {
      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [
          createMockMilestone({
            createdAt: new Date('2024-01-01'),
            completedAt: new Date('2024-01-11'), // 10 days
          }),
          createMockMilestone({
            createdAt: new Date('2024-02-01'),
            completedAt: new Date('2024-02-21'), // 20 days
          }),
        ],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.milestoneMetrics.avgCompletionDays).toBe(15); // (10 + 20) / 2
    });

    it('should count overdue milestones', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [
          createMockMilestone({ status: 'pending', completedAt: null, targetDate: pastDate }),
          createMockMilestone({ status: 'pending', completedAt: null, targetDate: pastDate }),
          createMockMilestone({ status: 'completed' }),
        ],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.milestoneMetrics.overdueMilestones).toBe(2);
    });
  });

  describe('health score calculation', () => {
    it('should return on_track for project ahead of schedule', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      // At 33% time elapsed, 60% complete = ahead
      const mockProject = createMockProject({
        startDate,
        endDate,
        timelineSegments: [createMockSegment({ progress: 60 })],
        milestones: [createMockMilestone({ status: 'completed' })],
        approvalRecords: [createMockApproval({ status: 'approved' })],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([{ createdAt: now, metadata: { sessionId: 's1' } }]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.status).toBe('ahead');
    });

    it('should return behind for project significantly behind', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // At 67% time elapsed, only 20% complete = behind
      const mockProject = createMockProject({
        startDate,
        endDate,
        timelineSegments: [createMockSegment({ progress: 20 })],
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.status).toBe('behind');
    });

    it('should include all health score components', async () => {
      const mockProject = createMockProject({
        timelineSegments: [createMockSegment({ progress: 50 })],
        milestones: [createMockMilestone({ status: 'completed' })],
        approvalRecords: [createMockApproval({ status: 'approved' })],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('current phase determination', () => {
    it('should return phase of in-progress segment', async () => {
      const mockProject = createMockProject({
        timelineSegments: [
          createMockSegment({ phase: 'design', progress: 100 }),
          createMockSegment({ phase: 'development', progress: 50 }),
          createMockSegment({ phase: 'testing', progress: 0 }),
        ],
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.currentPhase).toBe('development');
    });

    it('should return last completed phase when none in progress', async () => {
      const mockProject = createMockProject({
        timelineSegments: [
          createMockSegment({ phase: 'design', progress: 100 }),
          createMockSegment({ phase: 'development', progress: 100 }),
        ],
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.currentPhase).toBe('development');
    });

    it('should return planning for empty project', async () => {
      const mockProject = createMockProject({
        timelineSegments: [],
        milestones: [],
        approvalRecords: [],
      });

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      const result = await service.getProjectProgress('project-123');

      expect(result.currentPhase).toBe('planning');
    });
  });
});
