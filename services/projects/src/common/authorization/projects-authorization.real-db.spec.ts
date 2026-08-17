import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '@patina/cache';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProjectsService } from '../../projects/projects.service';
import { ProjectsAuthorizationResolver } from './projects-authorization.resolver';

const databaseUrl = process.env.DATABASE_URL;
const isLocalDatabase = Boolean(databaseUrl && /127\.0\.0\.1:54322/.test(databaseUrl));
const describeLocal = isLocalDatabase ? describe : describe.skip;

// This module has a tracked stale .js sibling, so Jest must load the current TypeScript implementation.
const { ProjectsService: CurrentProjectsService } =
  require('../../projects/projects.service.ts') as {
    ProjectsService: (typeof import('../../projects/projects.service'))['ProjectsService'];
  };

const CLIENT_ID = 'cfb10000-0000-4000-8000-000000000001';
const OTHER_ID = 'cfb10000-0000-4000-8000-000000000002';
const DESIGNER_ID = 'cfb10000-0000-4000-8000-000000000003';
const ORG_MEMBER_ID = 'cfb10000-0000-4000-8000-000000000004';
const ADMIN_ID = 'cfb10000-0000-4000-8000-000000000005';
const PERMISSION_USER_ID = 'cfb10000-0000-4000-8000-000000000006';
const NO_ROLE_ID = 'cfb10000-0000-4000-8000-000000000007';
const NO_PROJECT_PERMISSION_ID = 'cfb10000-0000-4000-8000-000000000008';
const UNKNOWN_ROLE_USER_ID = 'cfb10000-0000-4000-8000-000000000009';
const STALE_METADATA_ID = 'cfb10000-0000-4000-8000-000000000010';
const USER_IDS = [
  CLIENT_ID,
  OTHER_ID,
  DESIGNER_ID,
  ORG_MEMBER_ID,
  ADMIN_ID,
  PERMISSION_USER_ID,
  NO_ROLE_ID,
  NO_PROJECT_PERMISSION_ID,
  UNKNOWN_ROLE_USER_ID,
  STALE_METADATA_ID,
];
const ORGANIZATION_ID = 'cfb20000-0000-4000-8000-000000000001';
const PUBLIC_PROJECT_ID = 'cfb30000-0000-4000-8000-000000000001';
const OTHER_PUBLIC_PROJECT_ID = 'cfb30000-0000-4000-8000-000000000002';
const SERVICE_PROJECT_ID = 'cfb40000-0000-4000-8000-000000000001';
const OTHER_SERVICE_PROJECT_ID = 'cfb40000-0000-4000-8000-000000000002';
const ABSENT_PROJECT_ID = 'cfb40000-0000-4000-8000-000000000099';
const UNKNOWN_ROLE_ID = 'cfb50000-0000-4000-8000-000000000001';
const UNKNOWN_ROLE_NAME = 'cfb_invented_project_admin';

describeLocal('ProjectsAuthorizationResolver (real local Postgres)', () => {
  let prisma: PrismaService;
  let resolver: ProjectsAuthorizationResolver;
  let service: ProjectsService;
  let eventEmitter: { emit: jest.Mock };
  let cacheService: { invalidateProject: jest.Mock };

  const deleteFixtures = async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)
      `);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM svc_projects.audit_logs
        WHERE entity_type = 'project'
          AND entity_id IN (${Prisma.join([SERVICE_PROJECT_ID, OTHER_SERVICE_PROJECT_ID])})
      `);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM svc_projects.projects
        WHERE id::text IN (${Prisma.join([SERVICE_PROJECT_ID, OTHER_SERVICE_PROJECT_ID])})
      `);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM public.projects
        WHERE id::text IN (${Prisma.join([PUBLIC_PROJECT_ID, OTHER_PUBLIC_PROJECT_ID])})
      `);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM public.organizations WHERE id::text = ${ORGANIZATION_ID}
      `);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM auth.users WHERE id::text IN (${Prisma.join(USER_IDS)})
      `);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM public.roles
        WHERE id::text = ${UNKNOWN_ROLE_ID}
           OR name = ${UNKNOWN_ROLE_NAME}
      `);
    });
  };

  const assignRole = async (userId: string, roleName: string) => {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.user_roles (user_id, role_id)
      SELECT ${userId}::uuid, role.id
      FROM public.roles AS role
      WHERE role.name = ${roleName}
      ON CONFLICT (user_id, role_id) DO NOTHING
    `);
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    resolver = new ProjectsAuthorizationResolver(prisma);
    await prisma.$connect();
    await deleteFixtures();

    for (const [index, userId] of USER_IDS.entries()) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at
        ) VALUES (
          '00000000-0000-0000-0000-000000000000'::uuid,
          ${userId}::uuid,
          'authenticated',
          'authenticated',
          ${`projects-authz-gaps-${index}@test.invalid`},
          '',
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          ${JSON.stringify({ full_name: `Projects Authz ${index}` })}::jsonb,
          now(),
          now()
        )
      `);
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO public.profiles (id, email, display_name, role)
        VALUES (
          ${userId}::uuid,
          ${`projects-authz-gaps-${index}@test.invalid`},
          ${`Projects Authz Gaps ${index}`},
          'designer'
        )
        ON CONFLICT (id) DO NOTHING
      `);
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM public.user_roles WHERE user_id::text = ${userId}
      `);
    }

    await assignRole(CLIENT_ID, 'client');
    await assignRole(OTHER_ID, 'client');
    await assignRole(DESIGNER_ID, 'independent_designer');
    await assignRole(ORG_MEMBER_ID, 'studio_owner');
    await assignRole(ADMIN_ID, 'super_admin');
    await assignRole(PERMISSION_USER_ID, 'quality_control');
    await assignRole(NO_PROJECT_PERMISSION_ID, 'quality_control');

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.roles (
        id,
        name,
        display_name,
        description,
        domain,
        is_system,
        is_assignable
      ) VALUES (
        ${UNKNOWN_ROLE_ID}::uuid,
        ${UNKNOWN_ROLE_NAME},
        'CFB Invented Project Admin',
        'Negative retained-project authorization fixture',
        'admin',
        false,
        true
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.role_permissions (role_id, permission_id)
      SELECT ${UNKNOWN_ROLE_ID}::uuid, permission.id
      FROM public.permissions AS permission
      WHERE permission.name = 'project.admin.all'
    `);
    await assignRole(UNKNOWN_ROLE_USER_ID, UNKNOWN_ROLE_NAME);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE auth.users
      SET raw_app_meta_data = ${JSON.stringify({
        provider: 'email',
        providers: ['email'],
        role: 'super_admin',
        roles: ['super_admin'],
        permissions: ['project.admin.all'],
        organization_id: ORGANIZATION_ID,
        organizationIds: [ORGANIZATION_ID],
      })}::jsonb
      WHERE id = ${STALE_METADATA_ID}::uuid
    `);

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.organizations (id, type, name, slug, status)
      VALUES (
        ${ORGANIZATION_ID}::uuid,
        'design_studio',
        'Projects Authorization Fixture',
        'projects-authorization-gaps-fixture',
        'active'
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.organization_members (user_id, organization_id, role, status)
      VALUES (${ORG_MEMBER_ID}::uuid, ${ORGANIZATION_ID}::uuid, 'member', 'active')
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.projects (
        id,
        name,
        status,
        created_by,
        designer_id,
        client_id,
        studio_id
      ) VALUES (
        ${PUBLIC_PROJECT_ID}::uuid,
        'Projects Authorization Fixture',
        'active',
        ${DESIGNER_ID}::uuid,
        ${DESIGNER_ID}::uuid,
        ${CLIENT_ID}::uuid,
        ${ORGANIZATION_ID}::uuid
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.projects (
        id,
        name,
        status,
        created_by,
        designer_id,
        client_id
      ) VALUES (
        ${OTHER_PUBLIC_PROJECT_ID}::uuid,
        'Projects Authorization Foreign Fixture',
        'active',
        ${OTHER_ID}::uuid,
        ${OTHER_ID}::uuid,
        ${OTHER_ID}::uuid
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.project_team_members (project_id, user_id, role)
      VALUES
        (${PUBLIC_PROJECT_ID}::uuid, ${PERMISSION_USER_ID}::uuid, 'client'),
        (${PUBLIC_PROJECT_ID}::uuid, ${NO_ROLE_ID}::uuid, 'client'),
        (${PUBLIC_PROJECT_ID}::uuid, ${NO_PROJECT_PERMISSION_ID}::uuid, 'client')
    `);
    await prisma.project.create({
      data: {
        id: SERVICE_PROJECT_ID,
        publicProjectId: PUBLIC_PROJECT_ID,
        title: 'Projects Authorization Fixture',
        clientId: CLIENT_ID,
        designerId: DESIGNER_ID,
        status: 'active',
      },
    });
    await prisma.project.create({
      data: {
        id: OTHER_SERVICE_PROJECT_ID,
        publicProjectId: OTHER_PUBLIC_PROJECT_ID,
        title: 'Projects Authorization Foreign Fixture',
        clientId: OTHER_ID,
        designerId: OTHER_ID,
        status: 'active',
      },
    });

    eventEmitter = { emit: jest.fn() };
    cacheService = { invalidateProject: jest.fn().mockResolvedValue(undefined) };
    service = new CurrentProjectsService(
      prisma,
      eventEmitter as unknown as EventEmitter2,
      cacheService as unknown as CacheService,
      resolver,
    );
  });

  afterAll(async () => {
    if (prisma) {
      await deleteFixtures();
      await prisma.$disconnect();
    }
  });

  it('allows own assignment and denies another user without object leakage', async () => {
    await expect(resolver.assertProjectAccess(CLIENT_ID, SERVICE_PROJECT_ID, 'read')).resolves.toBe(
      SERVICE_PROJECT_ID,
    );
    await expect(
      resolver.assertProjectAccess(OTHER_ID, SERVICE_PROJECT_ID, 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const project = await resolver.withProjectAccess(CLIENT_ID, SERVICE_PROJECT_ID, 'read', (tx) =>
      tx.project.findUniqueOrThrow({ where: { id: SERVICE_PROJECT_ID } }),
    );
    expect(project.publicProjectId).toBe(PUBLIC_PROJECT_ID);
    expect(project.clientId).toBe(CLIENT_ID);
  });

  it('denies a subject with no current user role', async () => {
    await expect(resolver.resolve(NO_ROLE_ID)).resolves.toEqual({
      subject: NO_ROLE_ID,
      roles: [],
      permissions: [],
      organizationIds: [],
    });
    await expect(
      resolver.assertProjectAccess(NO_ROLE_ID, SERVICE_PROJECT_ID, 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies a supported current role with no canonical project permission', async () => {
    const authorization = await resolver.resolve(NO_PROJECT_PERMISSION_ID);

    expect(authorization.roles).toEqual(['quality_control']);
    expect(
      authorization.permissions.filter((permission) => permission.startsWith('project.')),
    ).toEqual([]);
    await expect(
      resolver.assertProjectAccess(NO_PROJECT_PERMISSION_ID, SERVICE_PROJECT_ID, 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies an invented current role even when Strata maps it to project.admin.all', async () => {
    const mappedPermissions = await prisma.$queryRaw<Array<{ permissionName: string }>>(Prisma.sql`
      SELECT permission.name AS "permissionName"
      FROM public.roles AS role
      JOIN public.role_permissions AS role_permission ON role_permission.role_id = role.id
      JOIN public.permissions AS permission ON permission.id = role_permission.permission_id
      WHERE role.id = ${UNKNOWN_ROLE_ID}::uuid
        AND role.name = ${UNKNOWN_ROLE_NAME}
    `);
    expect(mappedPermissions).toEqual([{ permissionName: 'project.admin.all' }]);

    const authorization = await resolver.resolve(UNKNOWN_ROLE_USER_ID);
    expect(authorization.roles).toEqual([UNKNOWN_ROLE_NAME]);
    expect(authorization.permissions).toEqual([]);
    await expect(
      resolver.assertProjectAccess(UNKNOWN_ROLE_USER_ID, SERVICE_PROJECT_ID, 'manage'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ignores stale JWT app_metadata role, permission, and organization claims', async () => {
    const metadataRows = await prisma.$queryRaw<Array<{ appMetadata: Record<string, unknown> }>>(
      Prisma.sql`
        SELECT raw_app_meta_data AS "appMetadata"
        FROM auth.users
        WHERE id = ${STALE_METADATA_ID}::uuid
      `,
    );
    expect(metadataRows).toEqual([
      {
        appMetadata: expect.objectContaining({
          role: 'super_admin',
          roles: ['super_admin'],
          permissions: ['project.admin.all'],
          organization_id: ORGANIZATION_ID,
          organizationIds: [ORGANIZATION_ID],
        }),
      },
    ]);

    await expect(resolver.resolve(STALE_METADATA_ID)).resolves.toEqual({
      subject: STALE_METADATA_ID,
      roles: [],
      permissions: [],
      organizationIds: [],
    });
    await expect(
      resolver.assertProjectAccess(STALE_METADATA_ID, SERVICE_PROJECT_ID, 'manage'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns an identical 404 for an inaccessible and an absent project', async () => {
    const inaccessible = await captureNotFound(() => service.findOne(SERVICE_PROJECT_ID, OTHER_ID));
    const absent = await captureNotFound(() => service.findOne(ABSENT_PROJECT_ID, OTHER_ID));

    expect(inaccessible).toEqual(absent);
    expect(JSON.stringify(inaccessible)).not.toContain(SERVICE_PROJECT_ID);
    expect(JSON.stringify(inaccessible)).not.toContain(OTHER_ID);
  });

  it('scopes real list rows, pagination counts, and mixed-ID batch results', async () => {
    const page = await service.findAll({ page: 1, limit: 1 }, CLIENT_ID);
    expect(page.pagination).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1 });
    expect(page.data.map((project) => project.id)).toEqual([SERVICE_PROJECT_ID]);

    const batch = await service.findByIds(
      [SERVICE_PROJECT_ID, OTHER_SERVICE_PROJECT_ID, ABSENT_PROJECT_ID],
      CLIENT_ID,
    );
    expect(batch.map((project) => project.id)).toEqual([SERVICE_PROJECT_ID]);
    expect(JSON.stringify(batch)).not.toContain(OTHER_SERVICE_PROJECT_ID);
    expect(JSON.stringify(batch)).not.toContain(ABSENT_PROJECT_ID);
  });

  it('allows an actual own manage write and leaves a foreign project unchanged', async () => {
    await expect(
      service.update(SERVICE_PROJECT_ID, { title: 'Authorized project update' }, DESIGNER_ID),
    ).resolves.toMatchObject({ id: SERVICE_PROJECT_ID, title: 'Authorized project update' });

    await expect(
      service.update(SERVICE_PROJECT_ID, { title: 'Foreign project update' }, OTHER_ID),
    ).rejects.toMatchObject({ status: 404, message: 'Project not found' });
    await expect(
      prisma.project.findUniqueOrThrow({ where: { id: SERVICE_PROJECT_ID } }),
    ).resolves.toMatchObject({ title: 'Authorized project update' });
  });

  it('honors active organization membership and denies removal on the next request', async () => {
    await expect(
      resolver.assertProjectAccess(ORG_MEMBER_ID, SERVICE_PROJECT_ID, 'read'),
    ).resolves.toBe(SERVICE_PROJECT_ID);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE public.organization_members
      SET status = 'removed'
      WHERE user_id::text = ${ORG_MEMBER_ID}
        AND organization_id::text = ${ORGANIZATION_ID}
    `);
    await expect(
      resolver.assertProjectAccess(ORG_MEMBER_ID, SERVICE_PROJECT_ID, 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE public.organization_members
      SET status = 'active'
      WHERE user_id::text = ${ORG_MEMBER_ID}
        AND organization_id::text = ${ORGANIZATION_ID}
    `);
  });

  it('allows the canonical admin-all permission', async () => {
    await expect(
      resolver.assertProjectAccess(ADMIN_ID, SERVICE_PROJECT_ID, 'manage'),
    ).resolves.toBe(SERVICE_PROJECT_ID);
  });

  it('applies role and permission changes on the next resolver call', async () => {
    await expect(resolver.assertProjectAccess(CLIENT_ID, SERVICE_PROJECT_ID, 'read')).resolves.toBe(
      SERVICE_PROJECT_ID,
    );
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM public.user_roles WHERE user_id::text = ${CLIENT_ID}
    `);
    await expect(
      resolver.assertProjectAccess(CLIENT_ID, SERVICE_PROJECT_ID, 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await assignRole(CLIENT_ID, 'client');

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.role_permissions (role_id, permission_id)
      SELECT role.id, permission.id
      FROM public.roles AS role
      JOIN public.permissions AS permission ON permission.name = 'project.read.assigned'
      WHERE role.name = 'quality_control'
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);
    await expect(
      resolver.assertProjectAccess(PERMISSION_USER_ID, SERVICE_PROJECT_ID, 'read'),
    ).resolves.toBe(SERVICE_PROJECT_ID);
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM public.role_permissions
      WHERE role_id = (SELECT id FROM public.roles WHERE name = 'quality_control')
        AND permission_id = (
          SELECT id FROM public.permissions WHERE name = 'project.read.assigned'
        )
    `);
    await expect(
      resolver.assertProjectAccess(PERMISSION_USER_ID, SERVICE_PROJECT_ID, 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('holds current authorization rows for the protected operation and revokes next request', async () => {
    let releaseLease!: () => void;
    const leaseReleased = new Promise<void>((resolve) => {
      releaseLease = resolve;
    });
    let signalLeaseStarted!: () => void;
    const leaseStarted = new Promise<void>((resolve) => {
      signalLeaseStarted = resolve;
    });

    const lease = resolver.withProjectAccess(
      CLIENT_ID,
      SERVICE_PROJECT_ID,
      'read',
      async (transaction) => {
        await transaction.project.findUniqueOrThrow({ where: { id: SERVICE_PROJECT_ID } });
        signalLeaseStarted();
        await leaseReleased;
        return true;
      },
    );
    await Promise.race([leaseStarted, lease]);

    const revoke = prisma.$executeRaw(Prisma.sql`
      DELETE FROM public.user_roles AS user_role
      USING public.roles AS role
      WHERE user_role.role_id = role.id
        AND user_role.user_id = ${CLIENT_ID}::uuid
        AND role.name = 'client'
    `);

    try {
      await expect(
        Promise.race([
          revoke.then(() => 'revoked'),
          new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
        ]),
      ).resolves.toBe('blocked');
    } finally {
      releaseLease();
      await lease;
      await revoke;
    }

    await expect(
      resolver.assertProjectAccess(CLIENT_ID, SERVICE_PROJECT_ID, 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await assignRole(CLIENT_ID, 'client');
  });

  it('does not retain authorization across successive callers on one pooled backend', async () => {
    const clientPid = await projectAccessBackendPid(CLIENT_ID);
    const designerPid = await projectAccessBackendPid(DESIGNER_ID);
    expect(designerPid).toBe(clientPid);

    const own = await resolver.resolve(CLIENT_ID);
    const other = await resolver.resolve(OTHER_ID);
    expect(own.subject).toBe(CLIENT_ID);
    expect(other.subject).toBe(OTHER_ID);
    await expect(resolver.assertProjectAccess(CLIENT_ID, SERVICE_PROJECT_ID, 'read')).resolves.toBe(
      SERVICE_PROJECT_ID,
    );
    await expect(
      resolver.assertProjectAccess(OTHER_ID, SERVICE_PROJECT_ID, 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rolls back failed operations without leaking the previous caller state', async () => {
    let rollbackPid: number | undefined;
    await expect(
      resolver.withProjectAccess(CLIENT_ID, SERVICE_PROJECT_ID, 'read', async (tx) => {
        const rows = await tx.$queryRaw<Array<{ pid: number }>>(Prisma.sql`
          SELECT pg_backend_pid()::integer AS pid
        `);
        rollbackPid = rows[0].pid;
        await tx.task.create({
          data: {
            projectId: SERVICE_PROJECT_ID,
            title: 'Must roll back',
          },
        });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    await expect(
      prisma.task.count({
        where: { projectId: SERVICE_PROJECT_ID, title: 'Must roll back' },
      }),
    ).resolves.toBe(0);
    await expect(
      resolver.assertProjectAccess(OTHER_ID, SERVICE_PROJECT_ID, 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(projectAccessBackendPid(DESIGNER_ID)).resolves.toBe(rollbackPid);
  });

  async function projectAccessBackendPid(subject: string): Promise<number> {
    return resolver.withProjectAccess(subject, SERVICE_PROJECT_ID, 'read', async (tx) => {
      const rows = await tx.$queryRaw<Array<{ pid: number }>>(Prisma.sql`
        SELECT pg_backend_pid()::integer AS pid
      `);
      return rows[0].pid;
    });
  }

  async function captureNotFound(operation: () => Promise<unknown>) {
    try {
      await operation();
      throw new Error('Expected operation to return 404');
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      return { status: error.getStatus(), response: error.getResponse() };
    }
  }
});
