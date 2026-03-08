import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChangeOrdersService } from './change-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChangeOrderStatus } from './dto/create-change-order.dto';
import { ApprovalAction } from './dto/approve-change-order.dto';

describe('ChangeOrdersService', () => {
  let service: ChangeOrdersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    project: { findUnique: jest.fn() },
    changeOrder: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangeOrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ChangeOrdersService>(ChangeOrdersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('submit', () => {
    it('should submit a draft change order', async () => {
      const co = { id: 'co-123', status: ChangeOrderStatus.DRAFT, projectId: 'project-123' };
      mockPrismaService.changeOrder.findUnique.mockResolvedValue(co);
      mockPrismaService.changeOrder.update.mockResolvedValue({
        ...co,
        status: ChangeOrderStatus.SUBMITTED,
      });
      mockPrismaService.project.findUnique.mockResolvedValue({ clientId: 'client-123' });

      const result = await service.submit('co-123', 'user-123');

      expect(result.status).toBe(ChangeOrderStatus.SUBMITTED);
    });

    it('should not allow submitting non-draft change orders', async () => {
      mockPrismaService.changeOrder.findUnique.mockResolvedValue({
        id: 'co-123',
        status: ChangeOrderStatus.APPROVED,
      });

      await expect(service.submit('co-123', 'user-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('should allow client to approve their own change order', async () => {
      const co = {
        id: 'co-123',
        status: ChangeOrderStatus.SUBMITTED,
        project: { id: 'project-123', clientId: 'client-123', status: 'active' },
      };

      mockPrismaService.changeOrder.findUnique.mockResolvedValue(co);
      mockPrismaService.changeOrder.update.mockResolvedValue({
        ...co,
        status: ChangeOrderStatus.APPROVED,
      });

      const approvalDto = { action: ApprovalAction.APPROVE, reason: 'Looks good' };
      const result = await service.approve('co-123', approvalDto, 'client-123', 'client');

      expect(result.status).toBe(ChangeOrderStatus.APPROVED);
    });

    it('should not allow client to approve another clients change order', async () => {
      const co = {
        id: 'co-123',
        status: ChangeOrderStatus.SUBMITTED,
        project: { id: 'project-123', clientId: 'other-client', status: 'active' },
      };

      mockPrismaService.changeOrder.findUnique.mockResolvedValue(co);

      const approvalDto = { action: ApprovalAction.APPROVE };
      await expect(service.approve('co-123', approvalDto, 'client-123', 'client')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow rejection with reason', async () => {
      const co = {
        id: 'co-123',
        status: ChangeOrderStatus.SUBMITTED,
        project: { id: 'project-123', clientId: 'client-123', status: 'active' },
      };

      mockPrismaService.changeOrder.findUnique.mockResolvedValue(co);
      mockPrismaService.changeOrder.update.mockResolvedValue({
        ...co,
        status: ChangeOrderStatus.REJECTED,
      });

      const approvalDto = { action: ApprovalAction.REJECT, reason: 'Too expensive' };
      const result = await service.approve('co-123', approvalDto, 'client-123', 'client');

      expect(result.status).toBe(ChangeOrderStatus.REJECTED);
    });
  });
});
