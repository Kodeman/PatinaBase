import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChangeOrdersService } from './change-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChangeOrderStatus } from './dto/create-change-order.dto';
import { ApprovalAction } from './dto/approve-change-order.dto';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

describe('ChangeOrdersService', () => {
  let service: ChangeOrdersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    project: { findUnique: jest.fn() },
    changeOrder: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      updateMany: jest.fn(),
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
    assertProjectAccess: jest.fn().mockResolvedValue('project-123'),
    assertProjectApprovalAccess: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangeOrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ProjectsAuthorizationResolver, useValue: authorizationMock },
      ],
    }).compile();

    service = module.get<ChangeOrdersService>(ChangeOrdersService);
    prisma = module.get<PrismaService>(PrismaService);
    (mockPrismaService as any).$transaction = jest.fn(async (operation: (tx: any) => any) =>
      operation(mockPrismaService),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('submit', () => {
    it('should submit a draft change order', async () => {
      const co = { id: 'co-123', status: ChangeOrderStatus.DRAFT, projectId: 'project-123' };
      mockPrismaService.changeOrder.findFirst.mockResolvedValue(co);
      mockPrismaService.changeOrder.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.changeOrder.findFirstOrThrow.mockResolvedValue({
        ...co,
        status: ChangeOrderStatus.SUBMITTED,
      });
      mockPrismaService.project.findUnique.mockResolvedValue({ clientId: 'client-123' });

      const result = await service.submit('project-123', 'co-123', 'user-123');

      expect(result.status).toBe(ChangeOrderStatus.SUBMITTED);
    });

    it('should not allow submitting non-draft change orders', async () => {
      mockPrismaService.changeOrder.findFirst.mockResolvedValue({
        id: 'co-123',
        status: ChangeOrderStatus.APPROVED,
      });

      await expect(service.submit('project-123', 'co-123', 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approve', () => {
    it('should allow client to approve their own change order', async () => {
      const co = {
        id: 'co-123',
        status: ChangeOrderStatus.SUBMITTED,
        project: { id: 'project-123', clientId: 'client-123', status: 'active' },
      };

      mockPrismaService.changeOrder.findFirst.mockResolvedValue(co);
      mockPrismaService.changeOrder.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.changeOrder.findFirstOrThrow.mockResolvedValue({
        ...co,
        status: ChangeOrderStatus.APPROVED,
      });

      const approvalDto = { action: ApprovalAction.APPROVE, reason: 'Looks good' };
      const result = await service.approve('project-123', 'co-123', approvalDto, 'client-123');

      expect(result.status).toBe(ChangeOrderStatus.APPROVED);
    });

    it('should not allow client to approve another clients change order', async () => {
      const co = {
        id: 'co-123',
        status: ChangeOrderStatus.SUBMITTED,
        project: { id: 'project-123', clientId: 'other-client', status: 'active' },
      };

      mockPrismaService.changeOrder.findFirst.mockResolvedValue(co);
      authorizationMock.assertProjectApprovalAccess.mockRejectedValueOnce(new ForbiddenException());

      const approvalDto = { action: ApprovalAction.APPROVE };
      await expect(
        service.approve('project-123', 'co-123', approvalDto, 'client-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow rejection with reason', async () => {
      const co = {
        id: 'co-123',
        status: ChangeOrderStatus.SUBMITTED,
        project: { id: 'project-123', clientId: 'client-123', status: 'active' },
      };

      mockPrismaService.changeOrder.findFirst.mockResolvedValue(co);
      mockPrismaService.changeOrder.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.changeOrder.findFirstOrThrow.mockResolvedValue({
        ...co,
        status: ChangeOrderStatus.REJECTED,
      });

      const approvalDto = { action: ApprovalAction.REJECT, reason: 'Too expensive' };
      const result = await service.approve('project-123', 'co-123', approvalDto, 'client-123');

      expect(result.status).toBe(ChangeOrderStatus.REJECTED);
    });
  });
});
