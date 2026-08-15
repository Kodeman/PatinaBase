import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AuthorizationResolver,
  type RequestAuthorization,
} from '@patina/auth';
import {
  Prisma,
  PrismaClient,
} from '../../generated/prisma-client';

export const ORDER_PERMISSIONS = {
  READ_OWN: 'order.read.own',
  READ_ORG: 'order.read.org',
  MANAGE_OWN: 'order.manage.own',
  MANAGE_ORG: 'order.manage.org',
  ADMIN_ALL: 'order.admin.all',
} as const;

export type OrderAuthorizationAction = 'read' | 'manage' | 'admin';
export type OrdersDatabaseClient = PrismaClient | Prisma.TransactionClient;

type RolePermissionRow = {
  role: string;
  permission: string | null;
};

type OrganizationMembershipRow = {
  organizationId: string;
};

@Injectable()
export class OrdersAuthorizationResolver implements AuthorizationResolver {
  constructor(private readonly prisma: PrismaClient) {}

  resolve(subject: string): Promise<RequestAuthorization> {
    return this.resolveWithClient(this.prisma, subject);
  }

  async resolveWithClient(
    database: OrdersDatabaseClient,
    subject: string,
  ): Promise<RequestAuthorization> {
    const [rolePermissions, memberships] = await Promise.all([
      database.$queryRaw<RolePermissionRow[]>`
        SELECT r.name AS role, p.name AS permission
        FROM public.user_roles AS ur
        INNER JOIN public.roles AS r ON r.id = ur.role_id
        LEFT JOIN public.role_permissions AS rp ON rp.role_id = r.id
        LEFT JOIN public.permissions AS p ON p.id = rp.permission_id
        WHERE ur.user_id = CAST(${subject} AS uuid)
      `,
      database.$queryRaw<OrganizationMembershipRow[]>`
        SELECT om.organization_id AS "organizationId"
        FROM public.organization_members AS om
        INNER JOIN public.organizations AS o ON o.id = om.organization_id
        WHERE om.user_id = CAST(${subject} AS uuid)
          AND om.status = 'active'
          AND o.status = 'active'
      `,
    ]);

    return Object.freeze({
      subject,
      roles: Object.freeze([...new Set(rolePermissions.map((row) => row.role))]),
      permissions: Object.freeze([
        ...new Set(
          rolePermissions
            .map((row) => row.permission)
            .filter((permission): permission is string => permission !== null),
        ),
      ]),
      organizationIds: Object.freeze([
        ...new Set(memberships.map((row) => row.organizationId)),
      ]),
    });
  }

  async authorize<T>(
    subject: string,
    action: OrderAuthorizationAction,
    operation: (
      database: Prisma.TransactionClient,
      authorization: RequestAuthorization,
      scope: Prisma.OrderWhereInput,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (database) => {
        const authorization = await this.resolveWithClient(database, subject);
        const scope = this.orderScope(authorization, action);
        return operation(database, authorization, scope);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async authorizeCart<T>(
    subject: string,
    action: Exclude<OrderAuthorizationAction, 'admin'>,
    cartId: string,
    operation: (
      database: Prisma.TransactionClient,
      authorization: RequestAuthorization,
      cart: Prisma.CartGetPayload<{ include: { items: true } }>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (database) => {
        const authorization = await this.resolveWithClient(database, subject);
        const cartScope = this.cartScope(authorization, action);
        const cart = await database.cart.findFirst({
          where: { AND: [{ id: cartId }, cartScope] },
          include: { items: true },
        });
        if (!cart) throw new NotFoundException('Cart not found');
        return operation(database, authorization, cart);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async authorizeShipment<T>(
    subject: string,
    action: Exclude<OrderAuthorizationAction, 'admin'>,
    shipmentId: string,
    operation: (
      database: Prisma.TransactionClient,
      authorization: RequestAuthorization,
      shipment: Prisma.ShipmentGetPayload<{ include: { order: true } }>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (database) => {
        const authorization = await this.resolveWithClient(database, subject);
        const orderScope = this.orderScope(authorization, action);
        const shipment = await database.shipment.findFirst({
          where: { AND: [{ id: shipmentId }, { order: { is: orderScope } }] },
          include: { order: true },
        });
        if (!shipment) throw new NotFoundException('Shipment not found');
        return operation(database, authorization, shipment);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  orderScope(
    authorization: RequestAuthorization,
    action: OrderAuthorizationAction,
  ): Prisma.OrderWhereInput {
    const permissions = new Set(authorization.permissions);
    if (permissions.has(ORDER_PERMISSIONS.ADMIN_ALL)) return {};
    if (action === 'admin') throw new ForbiddenException('Authorization denied');

    const ownPermission =
      action === 'read' ? ORDER_PERMISSIONS.READ_OWN : ORDER_PERMISSIONS.MANAGE_OWN;
    const orgPermission =
      action === 'read' ? ORDER_PERMISSIONS.READ_ORG : ORDER_PERMISSIONS.MANAGE_ORG;
    const scopes: Prisma.OrderWhereInput[] = [];

    if (permissions.has(ownPermission)) {
      scopes.push({ userId: authorization.subject });
    }
    if (
      permissions.has(orgPermission) &&
      authorization.organizationIds.length > 0
    ) {
      scopes.push({ organizationId: { in: [...authorization.organizationIds] } });
    }

    if (!permissions.has(ownPermission) && !permissions.has(orgPermission)) {
      throw new ForbiddenException('Authorization denied');
    }
    return scopes.length > 0 ? { OR: scopes } : { id: { in: [] } };
  }

  cartScope(
    authorization: RequestAuthorization,
    action: Exclude<OrderAuthorizationAction, 'admin'>,
  ): Prisma.CartWhereInput {
    const permissions = new Set(authorization.permissions);
    if (permissions.has(ORDER_PERMISSIONS.ADMIN_ALL)) return {};
    const required =
      action === 'read' ? ORDER_PERMISSIONS.READ_OWN : ORDER_PERMISSIONS.MANAGE_OWN;
    if (!permissions.has(required)) {
      throw new ForbiddenException('Authorization denied');
    }
    return { userId: authorization.subject };
  }

  async requireOrder<Include extends Prisma.OrderInclude | undefined = undefined>(
    database: Prisma.TransactionClient,
    scope: Prisma.OrderWhereInput,
    where: Prisma.OrderWhereInput,
    include?: Include,
  ): Promise<Prisma.OrderGetPayload<{ include: Include }>> {
    const order = await database.order.findFirst({
      where: { AND: [where, scope] },
      include,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order as Prisma.OrderGetPayload<{ include: Include }>;
  }
}
