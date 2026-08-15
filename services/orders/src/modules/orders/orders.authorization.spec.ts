import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';

describe('OrdersService authorization boundary', () => {
  const subject = 'verified-subject';
  const ownScope = { OR: [{ userId: subject }] };
  let database: any;
  let authorization: any;
  let events: any;
  let service: OrdersService;

  beforeEach(() => {
    database = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    authorization = {
      authorize: jest.fn(async (actor, action, operation) =>
        operation(database, { subject: actor }, ownScope),
      ),
      requireOrder: jest.fn(),
    };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new OrdersService(
      database,
      { get: jest.fn((_key, fallback) => fallback) } as unknown as ConfigService,
      events,
      authorization,
    );
  });

  it('uses one identical scoped predicate for list and count and ignores caller userId', async () => {
    await service.findAll({ userId: 'spoofed-user', status: 'paid', skip: -4, take: 1000 }, subject);

    const expectedWhere = { AND: [ownScope, { status: 'paid' }] };
    expect(database.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere, skip: 0, take: 100 }),
    );
    expect(database.order.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(JSON.stringify(database.order.findMany.mock.calls[0][0])).not.toContain('spoofed-user');
  });

  it('batch-selects only rows satisfying the same database scope', async () => {
    await service.findByIds(['own', 'other'], subject);

    expect(database.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ id: { in: ['own', 'other'] } }, ownScope] },
      }),
    );
  });

  it('uses verified subject as audit actor and ignores identity fields on PATCH', async () => {
    authorization.requireOrder.mockResolvedValue({ id: 'order-1', status: 'created' });
    database.order.update.mockResolvedValue({ id: 'order-1', status: 'paid' });

    await service.update(
      'order-1',
      {
        status: 'paid',
        userId: 'spoofed',
        organizationId: 'spoofed-org',
        actor: 'spoofed-actor',
      } as any,
      subject,
    );

    expect(database.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          userId: expect.anything(),
          organizationId: expect.anything(),
          actor: expect.anything(),
        }),
      }),
    );
    expect(database.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actor: subject }) }),
    );
  });

  it('returns the same 404 for an absent order and another user order', async () => {
    authorization.requireOrder.mockRejectedValue(new NotFoundException('Order not found'));

    await expect(service.findOne('absent', subject)).rejects.toMatchObject({
      message: 'Order not found',
    });
    await expect(service.findOne('belongs-to-other', subject)).rejects.toMatchObject({
      message: 'Order not found',
    });
  });

  it('does not broaden an unsupported status mutation', async () => {
    authorization.requireOrder.mockResolvedValue({ id: 'order-1', status: 'created' });
    await expect(service.updateStatus('order-1', 'closed', subject)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(database.order.update).not.toHaveBeenCalled();
  });
});
