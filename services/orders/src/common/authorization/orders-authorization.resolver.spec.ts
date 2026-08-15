import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ORDER_PERMISSIONS,
  OrdersAuthorizationResolver,
} from './orders-authorization.resolver';

describe('OrdersAuthorizationResolver', () => {
  const subject = '11111111-1111-4111-8111-111111111111';
  let database: any;
  let prisma: any;
  let resolver: OrdersAuthorizationResolver;

  beforeEach(() => {
    database = {
      $queryRaw: jest.fn(),
      order: { findFirst: jest.fn() },
      cart: { findFirst: jest.fn() },
      shipment: { findFirst: jest.fn() },
    };
    prisma = {
      $queryRaw: database.$queryRaw,
      $transaction: jest.fn((operation) => operation(database)),
    };
    resolver = new OrdersAuthorizationResolver(prisma);
  });

  it('resolves current roles, permissions, and active organizations without caching', async () => {
    database.$queryRaw
      .mockResolvedValueOnce([{ role: 'client', permission: ORDER_PERMISSIONS.READ_OWN }])
      .mockResolvedValueOnce([{ organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ role: 'client', permission: ORDER_PERMISSIONS.MANAGE_OWN }])
      .mockResolvedValueOnce([]);

    await expect(resolver.resolve(subject)).resolves.toEqual({
      subject,
      roles: ['client'],
      permissions: [ORDER_PERMISSIONS.READ_OWN],
      organizationIds: ['org-1'],
    });
    await expect(resolver.resolve(subject)).resolves.toEqual({
      subject,
      roles: ['client'],
      permissions: [ORDER_PERMISSIONS.MANAGE_OWN],
      organizationIds: [],
    });
    expect(database.$queryRaw).toHaveBeenCalledTimes(4);
  });

  it('passes hostile subjects as tagged-query parameters rather than SQL text', async () => {
    const hostile = "11111111-1111-4111-8111-111111111111' OR TRUE --";
    database.$queryRaw.mockResolvedValue([]);

    await resolver.resolve(hostile);

    for (const call of database.$queryRaw.mock.calls) {
      expect(call[1]).toBe(hostile);
      expect(Array.from(call[0]).join('')).not.toContain(hostile);
    }
  });

  it('fails closed when an unknown role is mapped to a canonical permission', async () => {
    database.$queryRaw
      .mockResolvedValueOnce([{ role: 'invented_admin', permission: ORDER_PERMISSIONS.ADMIN_ALL }])
      .mockResolvedValueOnce([{ organizationId: 'org-1' }]);

    await expect(resolver.resolve(subject)).resolves.toEqual({
      subject,
      roles: ['invented_admin'],
      permissions: [],
      organizationIds: [],
    });
  });

  it('builds non-overridable own, organization, and admin scopes', () => {
    expect(resolver.orderScope(state([ORDER_PERMISSIONS.READ_OWN]), 'read')).toEqual({
      OR: [{ userId: subject }],
    });
    expect(
      resolver.orderScope(
        state([ORDER_PERMISSIONS.READ_ORG], ['org-current']),
        'read',
      ),
    ).toEqual({ OR: [{ organizationId: { in: ['org-current'] } }] });
    expect(resolver.orderScope(state([ORDER_PERMISSIONS.READ_ORG]), 'read')).toEqual({
      id: { in: [] },
    });
    expect(resolver.orderScope(state([ORDER_PERMISSIONS.ADMIN_ALL]), 'admin')).toEqual({});
  });

  it('denies missing, stale-JWT-only, and unsupported authorization state', () => {
    expect(() => resolver.orderScope(state([]), 'read')).toThrow(ForbiddenException);
    expect(() => resolver.orderScope(state(['order.read']), 'read')).toThrow(ForbiddenException);
    expect(() => resolver.orderScope(state(['jwt.app_metadata.admin']), 'admin')).toThrow(
      ForbiddenException,
    );
    expect(() => resolver.cartScope(state([ORDER_PERMISSIONS.READ_ORG]), 'read')).toThrow(
      ForbiddenException,
    );
  });

  it('resolves and applies scope in the same transaction client', async () => {
    database.$queryRaw
      .mockResolvedValueOnce([{ role: 'client', permission: ORDER_PERMISSIONS.READ_OWN }])
      .mockResolvedValueOnce([]);
    const operation = jest.fn(async (client, authorization, scope) => ({
      client,
      authorization,
      scope,
    }));

    const result = await resolver.authorize(subject, 'read', operation);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.client).toBe(database);
    expect(result.scope).toEqual({ OR: [{ userId: subject }] });
  });

  it('uses a non-enumerating 404 when a scoped order or shipment is absent', async () => {
    database.order.findFirst.mockResolvedValue(null);
    await expect(resolver.requireOrder(database, { userId: subject }, { id: 'other' })).rejects
      .toEqual(expect.objectContaining({ message: 'Order not found' }));

    database.$queryRaw
      .mockResolvedValueOnce([{ role: 'client', permission: ORDER_PERMISSIONS.READ_OWN }])
      .mockResolvedValueOnce([]);
    database.shipment.findFirst.mockResolvedValue(null);
    await expect(
      resolver.authorizeShipment(subject, 'read', 'other-shipment', async () => undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(database.shipment.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: 'other-shipment' },
          { order: { is: { OR: [{ userId: subject }] } } },
        ],
      },
      include: { order: true },
    });
  });

  function state(permissions: string[], organizationIds: string[] = []) {
    return {
      subject,
      roles: [],
      permissions,
      organizationIds,
    };
  }
});
