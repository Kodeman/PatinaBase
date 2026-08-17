import { randomUUID } from 'crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../generated/prisma-client';
import { OrdersService } from '../../modules/orders/orders.service';
import {
  ORDER_PERMISSIONS,
  OrdersAuthorizationResolver,
} from './orders-authorization.resolver';

const databaseUrl = process.env.ORDERS_AUTHZ_TEST_DATABASE_URL;
const isLocalDatabase = Boolean(databaseUrl && /(?:127\.0\.0\.1|localhost)/.test(databaseUrl));
const describeLocal = isLocalDatabase ? describe : describe.skip;

describeLocal('Orders authorization with local Postgres', () => {
  jest.setTimeout(30_000);

  const ids = {
    owner: randomUUID(),
    other: randomUUID(),
    organizationMember: randomUUID(),
    admin: randomUUID(),
    mutable: randomUUID(),
    noRole: randomUUID(),
    missingRole: randomUUID(),
    organization: randomUUID(),
  };
  const orderIds = {
    owner: randomUUID(),
    other: randomUUID(),
    organization: randomUUID(),
    mutable: randomUUID(),
  };
  const suffix = randomUUID().slice(0, 8);
  let prisma: PrismaClient;
  let resolver: OrdersAuthorizationResolver;
  let service: OrdersService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
    resolver = new OrdersAuthorizationResolver(prisma);
    service = new OrdersService(
      prisma,
      { get: jest.fn((_key, fallback) => fallback) } as unknown as ConfigService,
      { publish: jest.fn().mockResolvedValue(undefined) },
      resolver,
    );

    for (const [name, id] of Object.entries(ids).filter(([name]) => name !== 'organization')) {
      await prisma.$executeRaw`
        INSERT INTO auth.users (
          id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
          CAST(${id} AS uuid), 'authenticated', 'authenticated',
          ${`orders-authz-${name}-${suffix}@example.invalid`}, '', now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
        )
      `;
      await prisma.$executeRaw`
        INSERT INTO public.profiles (id, email)
        VALUES (CAST(${id} AS uuid), ${`orders-authz-${name}-${suffix}@example.invalid`})
        ON CONFLICT (id) DO NOTHING
      `;
    }

    await prisma.$executeRaw`
      INSERT INTO public.organizations (id, type, name, slug, status)
      VALUES (
        CAST(${ids.organization} AS uuid), 'design_studio',
        ${`Orders authz ${suffix}`}, ${`orders-authz-${suffix}`}, 'active'
      )
    `;
    await grantRole(ids.owner, 'app_user');
    await grantRole(ids.other, 'app_user');
    await grantRole(ids.organizationMember, 'brand_admin');
    await grantRole(ids.admin, 'super_admin');
    await grantRole(ids.mutable, 'app_user');
    await prisma.$executeRaw`
      DELETE FROM public.user_roles
      WHERE user_id IN (CAST(${ids.noRole} AS uuid), CAST(${ids.missingRole} AS uuid))
    `;
    await prisma.$executeRaw`
      INSERT INTO public.roles (name, display_name, description, domain, is_system, is_assignable)
      VALUES (
        ${`orders_authz_unknown_${suffix}`}, 'Orders authz unknown',
        'Test-only role with a canonical permission', 'consumer', false, false
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO public.role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM public.roles AS role
      CROSS JOIN public.permissions AS permission
      WHERE role.name = ${`orders_authz_unknown_${suffix}`}
        AND permission.name = ${ORDER_PERMISSIONS.ADMIN_ALL}
    `;
    await grantRole(ids.noRole, `orders_authz_unknown_${suffix}`);
    await setMembership('active');

    await createOrder(orderIds.owner, ids.owner, null, 'OWNER');
    await createOrder(orderIds.other, ids.other, null, 'OTHER');
    await createOrder(orderIds.organization, ids.other, ids.organization, 'ORG');
    await createOrder(orderIds.mutable, ids.mutable, null, 'MUTABLE');
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const id of Object.values(orderIds)) {
      await prisma.order.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.$executeRaw`
      DELETE FROM public.organizations WHERE id = CAST(${ids.organization} AS uuid)
    `.catch(() => undefined);
    for (const [name, id] of Object.entries(ids).filter(([name]) => name !== 'organization')) {
      await prisma.$executeRaw`
        DELETE FROM auth.users WHERE id = CAST(${id} AS uuid)
      `.catch(() => undefined);
    }
    await prisma.$executeRaw`
      DELETE FROM public.roles WHERE name = ${`orders_authz_unknown_${suffix}`}
    `.catch(() => undefined);
    await prisma.$disconnect();
  });

  it('allows own rows and only the reviewed customer cancellation write', async () => {
    const own = await service.findOne(orderIds.owner, ids.owner);
    expect(own.id).toBe(orderIds.owner);

    const list = await service.findAll({ userId: ids.other, take: 100 }, ids.owner);
    expect(list.data.map((order) => order.id)).toEqual([orderIds.owner]);
    expect(list.pagination.total).toBe(1);

    const batch = await service.findByIds(
      [orderIds.owner, orderIds.other, orderIds.organization],
      ids.owner,
    );
    expect(batch.map((order) => order.id)).toEqual([orderIds.owner]);

    const canceled = await service.cancel(orderIds.owner, 'customer request', ids.owner);
    expect(canceled.status).toBe('canceled');
    await expect(service.cancel(orderIds.other, 'customer request', ids.owner)).rejects.toMatchObject({
      status: 404,
      message: 'Order not found',
    });
    await expect(service.updateStatus(orderIds.mutable, 'paid', ids.owner)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('uses the same non-enumerating 404 for another user and an absent object', async () => {
    await expect(service.findOne(orderIds.other, ids.owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findOne(randomUUID(), ids.owner)).rejects.toMatchObject({
      status: 404,
      message: 'Order not found',
    });
  });

  it('allows only active organization membership and observes removal next request', async () => {
    await setMembership('active');
    await expect(
      service.findOne(orderIds.organization, ids.organizationMember),
    ).resolves.toMatchObject({ id: orderIds.organization });

    await setMembership('removed');
    await expect(
      service.findOne(orderIds.organization, ids.organizationMember),
    ).rejects.toMatchObject({ status: 404, message: 'Order not found' });
  });

  it('allows reviewed all-scope operations only with current admin permission', async () => {
    const batch = await service.findByIds(Object.values(orderIds), ids.admin);
    expect(new Set(batch.map((order) => order.id))).toEqual(new Set(Object.values(orderIds)));
  });

  it('denies unknown roles and missing roles/permissions regardless of JWT metadata', async () => {
    await expect(resolver.resolve(ids.noRole)).resolves.toMatchObject({
      roles: [`orders_authz_unknown_${suffix}`],
      permissions: [],
    });
    await expect(service.findOne(orderIds.owner, ids.noRole)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(resolver.resolve(ids.missingRole)).resolves.toMatchObject({
      roles: [],
      permissions: [],
    });
    await expect(service.findOne(orderIds.owner, ids.missingRole)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('observes role revocation on the next request', async () => {
    await expect(service.findOne(orderIds.mutable, ids.mutable)).resolves.toMatchObject({
      id: orderIds.mutable,
    });
    await prisma.$executeRaw`
      DELETE FROM public.user_roles WHERE user_id = CAST(${ids.mutable} AS uuid)
    `;
    await expect(service.findOne(orderIds.mutable, ids.mutable)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not retain subject state across one-connection requests or rollback paths', async () => {
    expect(new URL(databaseUrl!).searchParams.get('connection_limit')).toBe('1');
    const [{ pid: initialPid }] = await prisma.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid()::integer AS pid
    `;

    await expect(service.findOne(orderIds.owner, ids.owner)).resolves.toMatchObject({
      id: orderIds.owner,
    });
    await expect(service.findOne(orderIds.owner, ids.other)).rejects.toMatchObject({ status: 404 });

    const marker = `rollback_${suffix}`;
    await expect(
      resolver.authorize(ids.owner, 'manage', async (database) => {
        await database.auditLog.create({
          data: {
            entityType: 'order',
            entityId: orderIds.owner,
            action: marker,
            actor: ids.owner,
            actorType: 'user',
          },
        });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    await expect(service.findOne(orderIds.owner, ids.other)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.auditLog.count({ where: { action: marker } })).toBe(0);

    const [{ pid: finalPid }] = await prisma.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid()::integer AS pid
    `;
    expect(finalPid).toBe(initialPid);
  });

  async function grantRole(userId: string, role: string) {
    await prisma.$executeRaw`
      INSERT INTO public.user_roles (user_id, role_id)
      SELECT CAST(${userId} AS uuid), id FROM public.roles WHERE name = ${role}
      ON CONFLICT (user_id, role_id) DO NOTHING
    `;
  }

  async function setMembership(status: 'active' | 'removed') {
    await prisma.$executeRaw`
      INSERT INTO public.organization_members (
        user_id, organization_id, role, status, joined_at
      ) VALUES (
        CAST(${ids.organizationMember} AS uuid), CAST(${ids.organization} AS uuid),
        'member', ${status}::public.member_status, now()
      )
      ON CONFLICT (user_id, organization_id)
      DO UPDATE SET status = EXCLUDED.status
    `;
  }

  async function createOrder(
    id: string,
    userId: string,
    organizationId: string | null,
    label: string,
  ) {
    await prisma.order.create({
      data: {
        id,
        orderNumber: `AUTHZ-${label}-${suffix}`,
        userId,
        organizationId,
        status: 'created',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        currency: 'USD',
        subtotal: 10,
        discountTotal: 0,
        taxTotal: 0,
        shippingTotal: 0,
        total: 10,
        snapshot: {},
      },
    });
  }
});
