import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthorizationResolver, RequestAuthorization } from '@patina/auth';
import { Prisma, type PrismaClient } from '../../generated/prisma-client';
import { PrismaService } from '../../prisma/prisma.service';

export type ProjectAccessMode = 'read' | 'manage';

export type ProjectQueryClient = PrismaClient | Prisma.TransactionClient;

interface RolePermissionRow {
  roleName: string;
  permissionName: string | null;
}

interface OrganizationRow {
  organizationId: string;
}

interface ProjectAccessRow {
  projectId: string;
}

interface PublicProjectAssignmentRow {
  publicProjectId: string;
  clientId: string;
  designerId: string;
}

interface ServiceProjectRelationshipRow {
  publicProjectId: string | null;
}

const SUPPORTED_ROLES = [
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

const SUPPORTED_ROLE_SQL = Prisma.join([...SUPPORTED_ROLES]);

@Injectable()
export class ProjectsAuthorizationResolver implements AuthorizationResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(subject: string): Promise<RequestAuthorization> {
    return this.runSerializable((client) => this.resolveWithClient(subject, client));
  }

  private async resolveWithClient(
    subject: string,
    client: ProjectQueryClient,
  ): Promise<RequestAuthorization> {
    const rolePermissions = await client.$queryRaw<RolePermissionRow[]>(Prisma.sql`
        SELECT
          role.name AS "roleName",
          permission.name AS "permissionName"
        FROM public.user_roles AS user_role
        JOIN public.roles AS role
          ON role.id = user_role.role_id
        LEFT JOIN public.role_permissions AS role_permission
          ON role_permission.role_id = role.id
        LEFT JOIN public.permissions AS permission
          ON permission.id = role_permission.permission_id
        WHERE user_role.user_id::text = ${subject}
      `);
    const organizations = await client.$queryRaw<OrganizationRow[]>(Prisma.sql`
        SELECT organization.id::text AS "organizationId"
        FROM public.organization_members AS membership
        JOIN public.organizations AS organization
          ON organization.id = membership.organization_id
        WHERE membership.user_id::text = ${subject}
          AND membership.status::text = 'active'
          AND organization.status::text = 'active'
      `);

    const roles = [...new Set(rolePermissions.map((row) => row.roleName))];
    const supported =
      roles.length > 0 &&
      roles.every((role) => (SUPPORTED_ROLES as readonly string[]).includes(role));

    return Object.freeze({
      subject,
      roles: Object.freeze(roles),
      permissions: Object.freeze(
        supported ? [...new Set(rolePermissions.flatMap((row) => row.permissionName ?? []))] : [],
      ),
      organizationIds: Object.freeze(
        supported ? [...new Set(organizations.map((row) => row.organizationId))] : [],
      ),
    });
  }

  async assertProjectAccess(
    subject: string,
    projectId: string,
    mode: ProjectAccessMode,
    client: ProjectQueryClient = this.prisma,
  ): Promise<string> {
    const rows = await client.$queryRaw<ProjectAccessRow[]>(Prisma.sql`
      WITH actor_roles AS (
        SELECT role.id, role.name
        FROM public.user_roles AS user_role
        JOIN public.roles AS role
          ON role.id = user_role.role_id
        WHERE user_role.user_id::text = ${subject}
      ),
      actor_permissions AS (
        SELECT DISTINCT permission.name
        FROM actor_roles AS role
        JOIN public.role_permissions AS role_permission
          ON role_permission.role_id = role.id
        JOIN public.permissions AS permission
          ON permission.id = role_permission.permission_id
      ),
      actor_is_supported AS (
        SELECT
          EXISTS (SELECT 1 FROM actor_roles)
          AND NOT EXISTS (
            SELECT 1
            FROM actor_roles
            WHERE name NOT IN (${SUPPORTED_ROLE_SQL})
          ) AS allowed
      )
      SELECT service_project.id::text AS "projectId"
      FROM svc_projects.projects AS service_project
      LEFT JOIN public.projects AS public_project
        ON public_project.id = service_project.public_project_id
      CROSS JOIN actor_is_supported
      WHERE service_project.id::text = ${projectId}
        AND actor_is_supported.allowed
        AND (
          EXISTS (
            SELECT 1 FROM actor_permissions
            WHERE name = 'project.admin.all'
          )
          OR (
            ${mode} = 'read'
            AND EXISTS (
              SELECT 1 FROM actor_permissions
              WHERE name IN ('project.read.assigned', 'project.manage.own')
            )
            AND (
              service_project.client_id = ${subject}
              OR service_project.designer_id = ${subject}
              OR public_project.client_id::text = ${subject}
              OR public_project.designer_id::text = ${subject}
              OR EXISTS (
                SELECT 1
                FROM public.project_team_members AS team_member
                WHERE team_member.project_id = public_project.id
                  AND team_member.user_id::text = ${subject}
                  AND team_member.removed_at IS NULL
              )
            )
          )
          OR (
            ${mode} = 'manage'
            AND EXISTS (
              SELECT 1 FROM actor_permissions
              WHERE name = 'project.manage.own'
            )
            AND (
              service_project.designer_id = ${subject}
              OR public_project.designer_id::text = ${subject}
              OR EXISTS (
                SELECT 1
                FROM public.project_team_members AS team_member
                WHERE team_member.project_id = public_project.id
                  AND team_member.user_id::text = ${subject}
                  AND team_member.removed_at IS NULL
                  AND team_member.role IN ('lead_designer', 'support_designer')
              )
            )
          )
          OR (
            EXISTS (
              SELECT 1 FROM actor_permissions
              WHERE name = CASE
                WHEN ${mode} = 'manage' THEN 'project.manage.org'
                ELSE 'project.read.org'
              END
            )
            AND EXISTS (
              SELECT 1
              FROM public.organization_members AS membership
              JOIN public.organizations AS organization
                ON organization.id = membership.organization_id
              WHERE membership.user_id::text = ${subject}
                AND membership.organization_id = public_project.studio_id
                AND membership.status::text = 'active'
                AND organization.status::text = 'active'
            )
          )
        )
      LIMIT 1
    `);

    if (rows.length !== 1) {
      throw new NotFoundException('Project not found');
    }
    return rows[0].projectId;
  }

  async assertChangeOrderAccess(
    subject: string,
    changeOrderId: string,
    mode: ProjectAccessMode,
    client: ProjectQueryClient = this.prisma,
  ): Promise<string> {
    const candidates = await client.$queryRaw<ProjectAccessRow[]>(Prisma.sql`
      SELECT project_id::text AS "projectId"
      FROM svc_projects.change_orders
      WHERE id::text = ${changeOrderId}
      LIMIT 1
    `);
    if (candidates.length !== 1) {
      throw new NotFoundException('Change order not found');
    }
    return this.assertProjectAccess(subject, candidates[0].projectId, mode, client);
  }

  async withProjectAccess<T>(
    subject: string,
    projectId: string,
    mode: ProjectAccessMode,
    operation: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.runSerializable(async (client) => {
      await this.lockActorAuthorizationState(subject, client);
      await this.lockProjectRelationships(subject, [projectId], client);
      await this.assertProjectAccess(subject, projectId, mode, client);
      return operation(client);
    });
  }

  async withChangeOrderAccess<T>(
    subject: string,
    changeOrderId: string,
    mode: ProjectAccessMode,
    operation: (projectId: string, client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.runSerializable(async (client) => {
      await this.lockActorAuthorizationState(subject, client);
      const projectId = await this.lockChangeOrderRelationship(changeOrderId, client);
      await this.lockProjectRelationships(subject, [projectId], client);
      await this.assertProjectAccess(subject, projectId, mode, client);
      return operation(projectId, client);
    });
  }

  async withAccessibleProjectIds<T>(
    subject: string,
    mode: ProjectAccessMode,
    operation: (projectIds: string[], client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.runSerializable(async (client) => {
      await this.lockActorAuthorizationState(subject, client);
      const candidateIds = await this.accessibleProjectIds(subject, mode, client);
      await this.lockProjectRelationships(subject, candidateIds, client);
      const projectIds = await this.accessibleProjectIds(subject, mode, client);
      return operation(projectIds, client);
    });
  }

  async withProjectApprovalAccess<T>(
    subject: string,
    projectId: string,
    operation: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.runSerializable(async (client) => {
      await this.lockActorAuthorizationState(subject, client);
      await this.lockProjectRelationships(subject, [projectId], client);
      await this.assertProjectAccess(subject, projectId, 'read', client);
      await this.assertProjectApprovalAccess(subject, projectId, client);
      return operation(client);
    });
  }

  async withPublicProjectLink<T>(
    subject: string,
    publicProjectId: string,
    operation: (
      assignment: PublicProjectAssignmentRow,
      client: Prisma.TransactionClient,
    ) => Promise<T>,
  ): Promise<T> {
    return this.runSerializable(async (client) => {
      await this.lockActorAuthorizationState(subject, client);
      await this.lockPublicProjectRelationships(subject, [publicProjectId], client);
      const assignment = await this.authorizePublicProjectLink(subject, publicProjectId, client);
      return operation(assignment, client);
    });
  }

  async hasPermission(
    subject: string,
    permissionName: string,
    client: ProjectQueryClient,
  ): Promise<boolean> {
    const rows = await client.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`
      WITH actor_roles AS (
        SELECT role.id, role.name
        FROM public.user_roles AS user_role
        JOIN public.roles AS role ON role.id = user_role.role_id
        WHERE user_role.user_id::text = ${subject}
      )
      SELECT (
        EXISTS (SELECT 1 FROM actor_roles)
        AND NOT EXISTS (
          SELECT 1 FROM actor_roles WHERE name NOT IN (${SUPPORTED_ROLE_SQL})
        )
        AND EXISTS (
          SELECT 1
          FROM actor_roles AS role
          JOIN public.role_permissions AS role_permission ON role_permission.role_id = role.id
          JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
          WHERE permission.name = ${permissionName}
        )
      ) AS allowed
    `);
    return rows[0]?.allowed === true;
  }

  async withAnyPermission<T>(
    subject: string,
    permissionNames: readonly string[],
    operation: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.runSerializable(async (client) => {
      await this.lockActorAuthorizationState(subject, client);
      const decisions = await Promise.all(
        permissionNames.map((permissionName) =>
          this.hasPermission(subject, permissionName, client),
        ),
      );
      if (!decisions.some(Boolean)) {
        throw new ForbiddenException('Forbidden');
      }
      return operation(client);
    });
  }

  private async runSerializable<T>(
    operation: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  private async lockActorAuthorizationState(
    subject: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await client.$queryRaw(Prisma.sql`
      SELECT user_role.user_id
      FROM public.user_roles AS user_role
      JOIN public.roles AS role ON role.id = user_role.role_id
      WHERE user_role.user_id::text = ${subject}
      FOR SHARE OF user_role, role
    `);
    await client.$queryRaw(Prisma.sql`
      SELECT role_permission.role_id
      FROM public.user_roles AS user_role
      JOIN public.role_permissions AS role_permission
        ON role_permission.role_id = user_role.role_id
      JOIN public.permissions AS permission
        ON permission.id = role_permission.permission_id
      WHERE user_role.user_id::text = ${subject}
      FOR SHARE OF role_permission, permission
    `);
    await client.$queryRaw(Prisma.sql`
      SELECT membership.organization_id
      FROM public.organization_members AS membership
      JOIN public.organizations AS organization
        ON organization.id = membership.organization_id
      WHERE membership.user_id::text = ${subject}
      FOR SHARE OF membership, organization
    `);
  }

  private async lockProjectRelationships(
    subject: string,
    projectIds: readonly string[],
    client: Prisma.TransactionClient,
  ): Promise<void> {
    if (projectIds.length === 0) return;
    const relationships = await client.$queryRaw<ServiceProjectRelationshipRow[]>(Prisma.sql`
      SELECT service_project.public_project_id::text AS "publicProjectId"
      FROM svc_projects.projects AS service_project
      WHERE service_project.id::text IN (${Prisma.join([...projectIds])})
      FOR SHARE OF service_project
    `);
    const publicProjectIds = [
      ...new Set(
        relationships.flatMap((relationship) =>
          relationship.publicProjectId ? [relationship.publicProjectId] : [],
        ),
      ),
    ];
    await this.lockPublicProjectRelationships(subject, publicProjectIds, client);
  }

  private async lockPublicProjectRelationships(
    subject: string,
    publicProjectIds: readonly string[],
    client: Prisma.TransactionClient,
  ): Promise<void> {
    if (publicProjectIds.length === 0) return;
    await client.$queryRaw(Prisma.sql`
      SELECT public_project.id
      FROM public.projects AS public_project
      WHERE public_project.id::text IN (${Prisma.join([...publicProjectIds])})
      FOR SHARE OF public_project
    `);
    await client.$queryRaw(Prisma.sql`
      SELECT team_member.project_id
      FROM public.project_team_members AS team_member
      WHERE team_member.project_id::text IN (${Prisma.join([...publicProjectIds])})
        AND team_member.user_id::text = ${subject}
      FOR SHARE OF team_member
    `);
  }

  private async lockChangeOrderRelationship(
    changeOrderId: string,
    client: Prisma.TransactionClient,
  ): Promise<string> {
    const rows = await client.$queryRaw<ProjectAccessRow[]>(Prisma.sql`
      SELECT change_order.project_id::text AS "projectId"
      FROM svc_projects.change_orders AS change_order
      WHERE change_order.id::text = ${changeOrderId}
      LIMIT 1
      FOR SHARE OF change_order
    `);
    if (rows.length !== 1) {
      throw new NotFoundException('Change order not found');
    }
    return rows[0].projectId;
  }

  async assertProjectApprovalAccess(
    subject: string,
    projectId: string,
    client: ProjectQueryClient = this.prisma,
  ): Promise<void> {
    const rows = await client.$queryRaw<ProjectAccessRow[]>(Prisma.sql`
      WITH actor_roles AS (
        SELECT role.id, role.name
        FROM public.user_roles AS user_role
        JOIN public.roles AS role ON role.id = user_role.role_id
        WHERE user_role.user_id::text = ${subject}
      ),
      actor_permissions AS (
        SELECT DISTINCT permission.name
        FROM actor_roles AS role
        JOIN public.role_permissions AS role_permission ON role_permission.role_id = role.id
        JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
      )
      SELECT service_project.id::text AS "projectId"
      FROM svc_projects.projects AS service_project
      LEFT JOIN public.projects AS public_project
        ON public_project.id = service_project.public_project_id
      WHERE service_project.id::text = ${projectId}
        AND EXISTS (SELECT 1 FROM actor_roles)
        AND NOT EXISTS (
          SELECT 1 FROM actor_roles WHERE name NOT IN (${SUPPORTED_ROLE_SQL})
        )
        AND (
          EXISTS (SELECT 1 FROM actor_permissions WHERE name = 'project.admin.all')
          OR (
            EXISTS (
              SELECT 1 FROM actor_permissions
              WHERE name IN ('project.read.assigned', 'project.manage.own')
            )
            AND (
              service_project.client_id = ${subject}
              OR public_project.client_id::text = ${subject}
            )
          )
        )
      LIMIT 1
    `);

    if (rows.length !== 1) {
      throw new NotFoundException('Project not found');
    }
  }

  async authorizePublicProjectLink(
    subject: string,
    publicProjectId: string,
    client: ProjectQueryClient = this.prisma,
  ): Promise<PublicProjectAssignmentRow> {
    const rows = await client.$queryRaw<PublicProjectAssignmentRow[]>(Prisma.sql`
      WITH actor_roles AS (
        SELECT role.id, role.name
        FROM public.user_roles AS user_role
        JOIN public.roles AS role ON role.id = user_role.role_id
        WHERE user_role.user_id::text = ${subject}
      ),
      actor_permissions AS (
        SELECT DISTINCT permission.name
        FROM actor_roles AS role
        JOIN public.role_permissions AS role_permission ON role_permission.role_id = role.id
        JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
      )
      SELECT
        project.id::text AS "publicProjectId",
        project.client_id::text AS "clientId",
        project.designer_id::text AS "designerId"
      FROM public.projects AS project
      WHERE project.id::text = ${publicProjectId}
        AND EXISTS (SELECT 1 FROM actor_roles)
        AND NOT EXISTS (
          SELECT 1 FROM actor_roles WHERE name NOT IN (${SUPPORTED_ROLE_SQL})
        )
        AND (
          EXISTS (SELECT 1 FROM actor_permissions WHERE name = 'project.admin.all')
          OR (
            project.designer_id::text = ${subject}
            AND EXISTS (
              SELECT 1 FROM actor_permissions WHERE name = 'project.manage.own'
            )
          )
          OR (
            EXISTS (
              SELECT 1 FROM actor_permissions WHERE name = 'project.manage.org'
            )
            AND EXISTS (
              SELECT 1
              FROM public.organization_members AS membership
              JOIN public.organizations AS organization
                ON organization.id = membership.organization_id
              WHERE membership.user_id::text = ${subject}
                AND membership.organization_id = project.studio_id
                AND membership.status::text = 'active'
                AND organization.status::text = 'active'
            )
          )
        )
      LIMIT 1
    `);

    if (rows.length !== 1) {
      throw new NotFoundException('Project not found');
    }
    return rows[0];
  }

  async accessibleProjectIds(
    subject: string,
    mode: ProjectAccessMode,
    client: ProjectQueryClient = this.prisma,
  ): Promise<string[]> {
    const rows = await client.$queryRaw<ProjectAccessRow[]>(Prisma.sql`
      WITH actor_roles AS (
        SELECT role.id, role.name
        FROM public.user_roles AS user_role
        JOIN public.roles AS role ON role.id = user_role.role_id
        WHERE user_role.user_id::text = ${subject}
      ),
      actor_permissions AS (
        SELECT DISTINCT permission.name
        FROM actor_roles AS role
        JOIN public.role_permissions AS role_permission ON role_permission.role_id = role.id
        JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
      ),
      actor_is_supported AS (
        SELECT
          EXISTS (SELECT 1 FROM actor_roles)
          AND NOT EXISTS (
            SELECT 1 FROM actor_roles WHERE name NOT IN (${SUPPORTED_ROLE_SQL})
          ) AS allowed
      )
      SELECT service_project.id::text AS "projectId"
      FROM svc_projects.projects AS service_project
      LEFT JOIN public.projects AS public_project
        ON public_project.id = service_project.public_project_id
      CROSS JOIN actor_is_supported
      WHERE actor_is_supported.allowed
        AND (
          EXISTS (SELECT 1 FROM actor_permissions WHERE name = 'project.admin.all')
          OR (
            ${mode} = 'read'
            AND EXISTS (
              SELECT 1 FROM actor_permissions
              WHERE name IN ('project.read.assigned', 'project.manage.own')
            )
            AND (
              service_project.client_id = ${subject}
              OR service_project.designer_id = ${subject}
              OR public_project.client_id::text = ${subject}
              OR public_project.designer_id::text = ${subject}
              OR EXISTS (
                SELECT 1 FROM public.project_team_members AS team_member
                WHERE team_member.project_id = public_project.id
                  AND team_member.user_id::text = ${subject}
                  AND team_member.removed_at IS NULL
              )
            )
          )
          OR (
            ${mode} = 'manage'
            AND EXISTS (SELECT 1 FROM actor_permissions WHERE name = 'project.manage.own')
            AND (
              service_project.designer_id = ${subject}
              OR public_project.designer_id::text = ${subject}
              OR EXISTS (
                SELECT 1 FROM public.project_team_members AS team_member
                WHERE team_member.project_id = public_project.id
                  AND team_member.user_id::text = ${subject}
                  AND team_member.removed_at IS NULL
                  AND team_member.role IN ('lead_designer', 'support_designer')
              )
            )
          )
          OR (
            EXISTS (
              SELECT 1 FROM actor_permissions
              WHERE name = CASE
                WHEN ${mode} = 'manage' THEN 'project.manage.org'
                ELSE 'project.read.org'
              END
            )
            AND EXISTS (
              SELECT 1
              FROM public.organization_members AS membership
              JOIN public.organizations AS organization
                ON organization.id = membership.organization_id
              WHERE membership.user_id::text = ${subject}
                AND membership.organization_id = public_project.studio_id
                AND membership.status::text = 'active'
                AND organization.status::text = 'active'
            )
          )
        )
    `);
    return rows.map((row) => row.projectId);
  }
}
