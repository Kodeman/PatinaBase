import { BadRequestException, NotFoundException } from '@nestjs/common';

const { TimelineService } = require('./timeline.service.ts') as typeof import('./timeline.service');
const { ActivityType, EntityType } =
  require('./dto/log-activity.dto.ts') as typeof import('./dto/log-activity.dto');

describe('TimelineService activity target authorization', () => {
  const tx = {
    project: { findUnique: jest.fn() },
    timelineSegment: { findFirst: jest.fn() },
    approvalRecord: { findFirst: jest.fn() },
    document: { findFirst: jest.fn() },
    task: { findFirst: jest.fn() },
    milestone: { findFirst: jest.fn() },
    clientActivity: { create: jest.fn() },
    engagementMetrics: { upsert: jest.fn() },
  };
  const eventEmitter = { emit: jest.fn() };
  const authorization = {
    withProjectAccess: jest.fn(
      async (_subject: string, _projectId: string, _mode: string, operation: Function) =>
        operation(tx),
    ),
  };
  const service = new TimelineService(eventEmitter as any, authorization as any);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.project.findUnique.mockResolvedValue({ id: 'project-a', clientId: 'client-a' });
    tx.clientActivity.create.mockResolvedValue({ id: 'activity-a' });
    tx.engagementMetrics.upsert.mockResolvedValue({});
  });

  it('returns the same non-enumerating 404 when a segment belongs to another project', async () => {
    tx.timelineSegment.findFirst.mockResolvedValue(null);

    await expect(
      service.logActivity(
        'project-a',
        { activityType: ActivityType.VIEW, segmentId: 'segment-from-project-b' },
        'actor-a',
      ),
    ).rejects.toEqual(new NotFoundException('Activity target not found'));

    expect(tx.timelineSegment.findFirst).toHaveBeenCalledWith({
      where: { id: 'segment-from-project-b', projectId: 'project-a' },
      select: { id: true },
    });
    expect(tx.clientActivity.create).not.toHaveBeenCalled();
    expect(tx.engagementMetrics.upsert).not.toHaveBeenCalled();
  });

  it('denies an approval whose related segment is not the route-project segment', async () => {
    tx.timelineSegment.findFirst.mockResolvedValue({ id: 'segment-a' });
    tx.approvalRecord.findFirst.mockResolvedValue({
      id: 'approval-a',
      segmentId: 'different-segment',
    });

    await expect(
      service.logActivity(
        'project-a',
        {
          activityType: ActivityType.APPROVE,
          segmentId: 'segment-a',
          entityType: EntityType.APPROVAL,
          entityId: 'approval-a',
        },
        'actor-a',
      ),
    ).rejects.toEqual(new NotFoundException('Activity target not found'));

    expect(tx.approvalRecord.findFirst).toHaveBeenCalledWith({
      where: { id: 'approval-a', projectId: 'project-a' },
      select: { id: true, segmentId: true },
    });
    expect(tx.clientActivity.create).not.toHaveBeenCalled();
  });

  it('checks a valid related document and writes the activity through the same lease client', async () => {
    tx.document.findFirst.mockResolvedValue({ id: 'document-a' });

    await expect(
      service.logActivity(
        'project-a',
        {
          activityType: ActivityType.DOWNLOAD,
          entityType: EntityType.DOCUMENT,
          entityId: 'document-a',
          duration: 4,
        },
        'actor-a',
      ),
    ).resolves.toEqual({ id: 'activity-a' });

    expect(tx.document.findFirst).toHaveBeenCalledWith({
      where: { id: 'document-a', projectId: 'project-a' },
      select: { id: true },
    });
    expect(tx.clientActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'project-a',
          userId: 'actor-a',
          entityId: 'document-a',
        }),
      }),
    );
  });

  it('rejects a partial related-entity pair before writing activity', async () => {
    await expect(
      service.logActivity(
        'project-a',
        { activityType: ActivityType.VIEW, entityType: EntityType.TASK },
        'actor-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.clientActivity.create).not.toHaveBeenCalled();
  });
});
