import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationResolver, RequestAuthorization } from '@patina/auth';
import { MediaAsset, Prisma, PrismaClient } from '../../generated/prisma-client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;
type ScopeAction = 'read' | 'manage' | 'admin';

interface RolePermissionRow {
  role_name: string;
  permission_name: string | null;
}

interface OrganizationRow {
  organization_id: string;
}

interface ProductRow {
  id: string;
}

interface ProjectRow {
  id: string;
}

interface AdminProofRow {
  user_id: string;
}

export interface MediaAssetScope {
  readonly subject: string;
  readonly authorization: RequestAuthorization;
  readonly where: Prisma.MediaAssetWhereInput;
  readonly projectIds: readonly string[];
  readonly admin: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPPORTED_APPLICATION_ROLE_NAMES = [
  'app_user',
  'client',
  'independent_designer',
  'studio_owner',
  'studio_admin',
  'studio_designer',
  'brand_admin',
  'catalog_manager',
  'operations_lead',
  'partner_manager',
  'super_admin',
  'ml_operator',
  'quality_control',
  'support_agent',
] as const;
const SUPPORTED_APPLICATION_ROLES = new Set<string>(SUPPORTED_APPLICATION_ROLE_NAMES);

/**
 * Resolves authorization exclusively from current Strata rows. Nothing in a
 * JWT beyond its verified subject participates in these decisions.
 */
@Injectable()
export class MediaAuthorizationResolver implements AuthorizationResolver {
  constructor(private readonly prisma: PrismaClient) {}

  async resolve(subject: string): Promise<RequestAuthorization> {
    this.assertSubject(subject);
    return this.resolveWithClient(this.prisma, subject);
  }

  async withAssetScope<T>(
    subject: string,
    action: ScopeAction,
    operation: (transaction: Prisma.TransactionClient, scope: MediaAssetScope) => Promise<T>,
  ): Promise<T> {
    this.assertSubject(subject);
    return this.prisma.$transaction(
      async (transaction) => {
        const authorization = await this.resolveWithClient(transaction, subject);
        const scope = await this.buildAssetScope(transaction, authorization, action);
        return operation(transaction, scope);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async withAdmin<T>(
    subject: string,
    operation: (
      transaction: Prisma.TransactionClient,
      authorization: RequestAuthorization,
    ) => Promise<T>,
  ): Promise<T> {
    return this.withAssetScope(subject, 'admin', (transaction, scope) =>
      operation(transaction, scope.authorization),
    );
  }

  async withAdminLease<T>(
    subject: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    this.assertSubject(subject);
    return this.prisma.$transaction(
      async (transaction) => {
        const proof = await transaction.$queryRaw<AdminProofRow[]>(Prisma.sql`
          /* media_admin_authorization_lease */
          SELECT user_role.user_id::text AS user_id
          FROM public.user_roles AS user_role
          JOIN public.roles AS role ON role.id = user_role.role_id
          JOIN public.role_permissions AS role_permission
            ON role_permission.role_id = role.id
          JOIN public.permissions AS permission
            ON permission.id = role_permission.permission_id
          WHERE user_role.user_id = ${subject}::uuid
            AND permission.name = ${'media.admin.all'}
            AND role.name IN (${Prisma.join(SUPPORTED_APPLICATION_ROLE_NAMES)})
            AND NOT EXISTS (
              SELECT 1
              FROM public.user_roles AS assigned_user_role
              JOIN public.roles AS assigned_role
                ON assigned_role.id = assigned_user_role.role_id
              WHERE assigned_user_role.user_id = user_role.user_id
                AND assigned_role.name NOT IN (${Prisma.join(SUPPORTED_APPLICATION_ROLE_NAMES)})
            )
          LIMIT 1
          FOR SHARE OF user_role, role, role_permission, permission
        `);
        if (proof.length === 0) {
          throw new ForbiddenException('Authorization denied');
        }
        return operation(transaction);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async withCurrentAuthorization<T>(
    subject: string,
    operation: (
      transaction: Prisma.TransactionClient,
      authorization: RequestAuthorization,
    ) => Promise<T>,
  ): Promise<T> {
    this.assertSubject(subject);
    return this.prisma.$transaction(
      async (transaction) => {
        const authorization = await this.resolveWithClient(transaction, subject);
        return operation(transaction, authorization);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  scopedWhere(
    scope: MediaAssetScope,
    additional?: Prisma.MediaAssetWhereInput,
  ): Prisma.MediaAssetWhereInput {
    if (!additional || Object.keys(additional).length === 0) return scope.where;
    return { AND: [scope.where, additional] };
  }

  async requireAsset(
    transaction: Prisma.TransactionClient,
    scope: MediaAssetScope,
    assetId: string,
    include?: Prisma.MediaAssetInclude,
  ): Promise<MediaAsset & Record<string, unknown>> {
    const asset = await transaction.mediaAsset.findFirst({
      where: this.scopedWhere(scope, { id: assetId }),
      include,
    });
    if (!asset) throw this.notFound();
    return asset as MediaAsset & Record<string, unknown>;
  }

  async requireAssets(
    transaction: Prisma.TransactionClient,
    scope: MediaAssetScope,
    assetIds: readonly string[],
  ): Promise<string[]> {
    const ids = [...new Set(assetIds)];
    if (ids.length === 0) throw this.notFound();
    const rows = await transaction.mediaAsset.findMany({
      where: this.scopedWhere(scope, { id: { in: ids } }),
      select: { id: true },
    });
    if (rows.length !== ids.length) throw this.notFound();
    return ids;
  }

  async requireProduct(
    transaction: Prisma.TransactionClient,
    scope: MediaAssetScope,
    productId: string | null | undefined,
    variantId?: string | null,
  ): Promise<void> {
    if (!productId) {
      if (variantId) throw this.notFound();
      if (!scope.admin && !scope.authorization.permissions.includes('media.manage.own')) {
        throw new ForbiddenException('Authorization denied');
      }
      return;
    }

    const rows = await transaction.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM public.products AS product
        WHERE product.id = ${productId}::uuid
          AND (
            ${scope.admin}
            OR (
              ${scope.authorization.permissions.includes('media.manage.own')}
              AND product.owner_user_id = ${scope.subject}::uuid
            )
            OR (
              ${scope.authorization.permissions.includes('media.manage.org')}
              AND product.studio_id IN (
                SELECT membership.organization_id
                FROM public.organization_members AS membership
                JOIN public.organizations AS organization
                  ON organization.id = membership.organization_id
                 AND organization.status = 'active'
                WHERE membership.user_id = ${scope.subject}::uuid
                  AND membership.status = 'active'
              )
            )
          )
          AND (
            ${variantId ?? null}::uuid IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.product_variants AS variant
              WHERE variant.id = ${variantId ?? null}::uuid
                AND variant.product_id = product.id
            )
          )
      ) AS allowed
    `);
    if (rows[0]?.allowed !== true) throw this.notFound();
  }

  async requireProject(
    transaction: Prisma.TransactionClient,
    scope: MediaAssetScope,
    projectId: string | null | undefined,
  ): Promise<void> {
    if (!projectId) return;
    if (!scope.admin && !scope.projectIds.includes(projectId)) throw this.notFound();
    const rows = await transaction.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM public.projects AS project
        WHERE project.id = ${projectId}::uuid
      ) AS allowed
    `);
    if (rows[0]?.allowed !== true) throw this.notFound();
  }

  notFound(): NotFoundException {
    return new NotFoundException('Media object not found');
  }

  private async resolveWithClient(
    client: DatabaseClient,
    subject: string,
  ): Promise<RequestAuthorization> {
    const rolePermissions = await client.$queryRaw<RolePermissionRow[]>(Prisma.sql`
      SELECT role.name AS role_name, permission.name AS permission_name
      FROM public.user_roles AS user_role
      JOIN public.roles AS role ON role.id = user_role.role_id
      LEFT JOIN public.role_permissions AS role_permission
        ON role_permission.role_id = role.id
      LEFT JOIN public.permissions AS permission
        ON permission.id = role_permission.permission_id
      WHERE user_role.user_id = ${subject}::uuid
    `);
    const organizations = await client.$queryRaw<OrganizationRow[]>(Prisma.sql`
      SELECT membership.organization_id::text AS organization_id
      FROM public.organization_members AS membership
      JOIN public.organizations AS organization
        ON organization.id = membership.organization_id
       AND organization.status = 'active'
      WHERE membership.user_id = ${subject}::uuid
        AND membership.status = 'active'
    `);

    const roles = [...new Set(rolePermissions.map((row) => row.role_name))];
    const supported =
      roles.length > 0 && roles.every((role) => SUPPORTED_APPLICATION_ROLES.has(role));
    return Object.freeze({
      subject,
      roles: Object.freeze(roles),
      permissions: Object.freeze([
        ...new Set(
          supported
            ? rolePermissions
                .map((row) => row.permission_name)
                .filter((permission): permission is string => Boolean(permission))
            : [],
        ),
      ]),
      organizationIds: Object.freeze([
        ...new Set(supported ? organizations.map((row) => row.organization_id) : []),
      ]),
    });
  }

  private async buildAssetScope(
    transaction: Prisma.TransactionClient,
    authorization: RequestAuthorization,
    action: ScopeAction,
  ): Promise<MediaAssetScope> {
    const granted = new Set(authorization.permissions);
    const admin = granted.has('media.admin.all');
    if (action === 'admin' && !admin) {
      throw new ForbiddenException('Authorization denied');
    }
    if (admin) {
      return {
        subject: authorization.subject,
        authorization,
        where: {},
        projectIds: [],
        admin: true,
      };
    }

    const own =
      action === 'read'
        ? granted.has('media.read.own') || granted.has('media.manage.own')
        : granted.has('media.manage.own');
    const organization =
      action === 'read'
        ? granted.has('media.read.org') || granted.has('media.manage.org')
        : granted.has('media.manage.org');
    if (!own && !organization) {
      throw new ForbiddenException('Authorization denied');
    }

    const productRows = await transaction.$queryRaw<ProductRow[]>(Prisma.sql`
      SELECT product.id::text AS id
      FROM public.products AS product
      WHERE (
        ${own}
        AND product.owner_user_id = ${authorization.subject}::uuid
      ) OR (
        ${organization}
        AND product.studio_id IN (
          SELECT membership.organization_id
          FROM public.organization_members AS membership
          JOIN public.organizations AS current_organization
            ON current_organization.id = membership.organization_id
           AND current_organization.status = 'active'
          WHERE membership.user_id = ${authorization.subject}::uuid
            AND membership.status = 'active'
        )
      )
    `);
    const projectRows = await transaction.$queryRaw<ProjectRow[]>(Prisma.sql`
      SELECT project.id::text AS id
      FROM public.projects AS project
      WHERE (
        ${own}
        AND (
          (
            ${action} = 'read'
            AND (
              project.client_id = ${authorization.subject}::uuid
              OR project.designer_id = ${authorization.subject}::uuid
              OR EXISTS (
                SELECT 1
                FROM public.project_team_members AS team_member
                WHERE team_member.project_id = project.id
                  AND team_member.user_id = ${authorization.subject}::uuid
                  AND team_member.removed_at IS NULL
              )
            )
          )
          OR (
            ${action} = 'manage'
            AND (
              project.designer_id = ${authorization.subject}::uuid
              OR EXISTS (
                SELECT 1
                FROM public.project_team_members AS team_member
                WHERE team_member.project_id = project.id
                  AND team_member.user_id = ${authorization.subject}::uuid
                  AND team_member.removed_at IS NULL
                  AND team_member.role IN ('lead_designer', 'support_designer')
              )
            )
          )
        )
      ) OR (
        ${organization}
        AND EXISTS (
          SELECT 1
          FROM public.organization_members AS membership
          JOIN public.organizations AS current_organization
            ON current_organization.id = membership.organization_id
           AND current_organization.status = 'active'
          WHERE membership.user_id = ${authorization.subject}::uuid
            AND membership.organization_id = project.studio_id
            AND membership.status = 'active'
        )
      )
    `);
    const productIds = productRows.map((row) => row.id);
    const projectIds = projectRows.map((row) => row.id);
    const alternatives: Prisma.MediaAssetWhereInput[] = [];
    if (own) {
      alternatives.push({ productId: null, projectId: null, uploadedBy: authorization.subject });
    }
    if (productIds.length > 0) alternatives.push({ productId: { in: productIds } });
    if (projectIds.length > 0) alternatives.push({ projectId: { in: projectIds } });

    return {
      subject: authorization.subject,
      authorization,
      where:
        alternatives.length === 0
          ? { id: { in: [] } }
          : alternatives.length === 1
            ? alternatives[0]
            : { OR: alternatives },
      projectIds,
      admin: false,
    };
  }

  private assertSubject(subject: string): void {
    if (!UUID_PATTERN.test(subject)) {
      throw new ForbiddenException('Authorization denied');
    }
  }
}
