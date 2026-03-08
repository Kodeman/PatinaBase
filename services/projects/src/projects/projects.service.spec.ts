import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { ProjectStatus } from './dto/create-project.dto';
import { CacheService } from '@patina/cache';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  const mockPrismaService = {
    project: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    task: { groupBy: jest.fn() },
    rFI: { groupBy: jest.fn() },
    issue: { groupBy: jest.fn() },
    changeOrder: { groupBy: jest.fn() },
    auditLog: { create: jest.fn() },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const cacheServiceMock = {
    wrap: jest.fn().mockImplementation((_key: string, fn: () => any) => fn()),
    invalidateProject: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
    cacheServiceMock.wrap.mockClear();
    cacheServiceMock.invalidateProject.mockClear();
  });

  describe('create', () => {
    it('should create a new project', async () => {
      const createDto = {
        title: 'Test Project',
        clientId: 'client-123',
        designerId: 'designer-123',
      };

      const mockProject = {
        id: 'project-123',
        ...createDto,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.project.create.mockResolvedValue(mockProject);

      const result = await service.create(createDto, 'user-123');

      expect(result).toEqual(mockProject);
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: createDto.title,
          clientId: createDto.clientId,
          designerId: createDto.designerId,
          status: 'draft',
        }),
        include: expect.any(Object),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('project.created', expect.any(Object));
      expect(cacheServiceMock.invalidateProject).toHaveBeenCalledWith(mockProject.id);
    });
  });

  describe('findOne', () => {
    it('should return a project by id', async () => {
      const mockProject = {
        id: 'project-123',
        title: 'Test Project',
      };

      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);

      const result = await service.findOne('project-123');

      expect(result).toEqual(mockProject);
      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-123' },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a project', async () => {
      const updateDto = { title: 'Updated Title' };
      const mockExisting = { id: 'project-123', status: 'draft' };
      const mockUpdated = { ...mockExisting, ...updateDto };

      mockPrismaService.project.findUnique.mockResolvedValue(mockExisting);
      mockPrismaService.project.update.mockResolvedValue(mockUpdated);

      const result = await service.update('project-123', updateDto, 'user-123');

      expect(result).toEqual(mockUpdated);
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('project.status_changed', expect.any(Object));
    });

    it('should emit status_changed event when status changes', async () => {
      const updateDto = { status: ProjectStatus.ACTIVE };
      const mockExisting = { id: 'project-123', status: ProjectStatus.DRAFT };
      const mockUpdated = { ...mockExisting, ...updateDto };

      mockPrismaService.project.findUnique.mockResolvedValue(mockExisting);
      mockPrismaService.project.update.mockResolvedValue(mockUpdated);

      await service.update('project-123', updateDto, 'user-123');

      expect(eventEmitter.emit).toHaveBeenCalledWith('project.status_changed', expect.any(Object));
      expect(cacheServiceMock.invalidateProject).toHaveBeenCalledWith('project-123');
    });
  });

  describe('getStats', () => {
    it('should return project statistics', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue({ id: 'project-123' });
      mockPrismaService.task.groupBy.mockResolvedValue([
        { status: 'todo', _count: 5 },
        { status: 'done', _count: 3 },
      ]);
      mockPrismaService.rFI.groupBy.mockResolvedValue([]);
      mockPrismaService.issue.groupBy.mockResolvedValue([]);
      mockPrismaService.changeOrder.groupBy.mockResolvedValue([]);

      const result = await service.getStats('project-123');

      expect(result).toHaveProperty('tasks');
      expect(result.tasks).toEqual({ todo: 5, done: 3 });
    });
  });
});
