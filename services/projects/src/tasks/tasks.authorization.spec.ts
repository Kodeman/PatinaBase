import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TaskStatus } from './dto/create-task.dto';

describe('TasksService project predicates', () => {
  const task = {
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  const auditLog = { create: jest.fn() };
  const prisma = { task, auditLog };
  const events = { emit: jest.fn() };
  const authorization = {
    withProjectAccess: jest.fn(
      async (_userId: string, _projectId: string, _mode: string, operation: (tx: any) => any) =>
        operation(prisma),
    ),
  };
  const service = new TasksService(prisma as any, events as any, authorization as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a non-enumerating 404 when a task is outside the authorized project', async () => {
    task.findFirst.mockResolvedValue(null);

    await expect(service.findOne('project-own', 'task-other', 'actor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'task-other', projectId: 'project-own' } }),
    );
  });

  it('keeps the parent project predicate on task updates', async () => {
    task.findFirst.mockResolvedValue({ id: 'task-1', status: 'todo', projectId: 'project-1' });
    task.updateMany.mockResolvedValue({ count: 1 });
    task.findFirstOrThrow.mockResolvedValue({ id: 'task-1', status: 'in_progress' });

    await service.update('project-1', 'task-1', { status: TaskStatus.IN_PROGRESS }, 'actor-1');

    expect(task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'task-1', projectId: 'project-1' } }),
    );
    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actor: 'actor-1' }) }),
    );
  });

  it('keeps the parent project predicate on task deletes', async () => {
    task.findFirst.mockResolvedValue({ id: 'task-1', projectId: 'project-1' });
    task.deleteMany.mockResolvedValue({ count: 1 });

    await service.remove('project-1', 'task-1', 'actor-1');

    expect(task.deleteMany).toHaveBeenCalledWith({
      where: { id: 'task-1', projectId: 'project-1' },
    });
  });

  it('does not reveal or update cross-project IDs in a batch', async () => {
    task.findMany.mockResolvedValue([{ id: 'task-own' }]);

    await expect(
      service.bulkUpdateStatus(
        'project-own',
        ['task-own', 'task-other'],
        TaskStatus.DONE,
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(task.updateMany).not.toHaveBeenCalled();
  });

  it('requires relational project-manage scope before deleting a metadata-backed comment', async () => {
    task.findFirst.mockResolvedValue({
      id: 'task-1',
      projectId: 'project-1',
      metadata: {
        comments: [{ id: 'comment-1', userId: 'spoofed-author', content: 'comment' }],
      },
    });
    task.updateMany.mockResolvedValue({ count: 1 });

    await service.deleteComment('project-1', 'task-1', 'comment-1', 'actor-1');

    expect(authorization.withProjectAccess).toHaveBeenCalledWith(
      'actor-1',
      'project-1',
      'manage',
      expect.any(Function),
    );
    expect(task.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', projectId: 'project-1' },
      data: { metadata: { comments: [] } },
    });
    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actor: 'actor-1' }) }),
    );
  });
});
