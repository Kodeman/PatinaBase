import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TaskStatus } from './dto/create-task.dto';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  const mockPrismaService = {
    project: { findUnique: jest.fn() },
    task: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };
  const authorizationMock = {
    withProjectAccess: jest.fn(
      async (_userId: string, _projectId: string, _mode: string, operation: (tx: any) => any) =>
        operation(mockPrismaService),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ProjectsAuthorizationResolver, useValue: authorizationMock },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new task', async () => {
      const createDto = {
        title: 'Test Task',
        description: 'Test description',
      };

      mockPrismaService.project.findUnique.mockResolvedValue({
        id: 'project-123',
        status: 'active',
      });
      mockPrismaService.task.create.mockResolvedValue({
        id: 'task-123',
        ...createDto,
        projectId: 'project-123',
      });

      const result = await service.create('project-123', createDto, 'user-123');

      expect(result.title).toBe(createDto.title);
      expect(eventEmitter.emit).toHaveBeenCalledWith('task.created', expect.any(Object));
    });

    it('should throw error if project is closed', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue({
        id: 'project-123',
        status: 'closed',
      });

      await expect(service.create('project-123', { title: 'Test' }, 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('should validate status transitions', async () => {
      const existing = { id: 'task-123', status: 'done', projectId: 'project-123' };
      mockPrismaService.task.findFirst.mockResolvedValue(existing);

      // Invalid transition from done to blocked
      await expect(
        service.update('project-123', 'task-123', { status: TaskStatus.BLOCKED }, 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow valid status transitions', async () => {
      const existing = { id: 'task-123', status: 'todo', projectId: 'project-123' };
      const updated = { ...existing, status: 'in_progress' };

      mockPrismaService.task.findFirst.mockResolvedValue(existing);
      mockPrismaService.task.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.task.findFirstOrThrow.mockResolvedValue(updated);

      const result = await service.update(
        'project-123',
        'task-123',
        { status: TaskStatus.IN_PROGRESS },
        'user-123',
      );

      expect(result.status).toBe('in_progress');
      expect(eventEmitter.emit).toHaveBeenCalledWith('task.status_changed', expect.any(Object));
    });

    it('should set completedAt when task is marked done', async () => {
      const existing = { id: 'task-123', status: 'in_progress', projectId: 'project-123' };
      mockPrismaService.task.findFirst.mockResolvedValue(existing);
      mockPrismaService.task.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.task.findFirstOrThrow.mockResolvedValue({ ...existing, status: 'done' });

      await service.update('project-123', 'task-123', { status: TaskStatus.DONE }, 'user-123');

      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { id: 'task-123', projectId: 'project-123' },
        data: expect.objectContaining({
          status: TaskStatus.DONE,
          completedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should update multiple tasks', async () => {
      const taskIds = ['task-1', 'task-2', 'task-3'];
      mockPrismaService.task.findMany.mockResolvedValue([
        { id: 'task-1' },
        { id: 'task-2' },
        { id: 'task-3' },
      ]);
      mockPrismaService.task.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.bulkUpdateStatus(
        'project-123',
        taskIds,
        TaskStatus.DONE,
        'user-123',
      );

      expect(result.updated).toBe(3);
      expect(eventEmitter.emit).toHaveBeenCalledWith('task.bulk_updated', expect.any(Object));
    });
  });
});
