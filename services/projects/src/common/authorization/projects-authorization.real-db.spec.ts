import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '@patina/cache';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProjectsService } from '../../projects/projects.service';
import { ProjectsAuthorizationResolver } from './projects-authorization.resolver';

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
const USER_IDS = [CLIENT_ID, OTHER_ID, DESIGNER_ID, ORG_MEMBER_ID, ADMIN_ID, PERMISSION_USER_ID];
const ORGANIZATION_ID = 'cfb20000-0000-4000-8000-000000000001';
const PUBLIC_PROJECT_ID = 'cfb30000-0000-4000-8000-000000000001';
const OTHER_PUBLIC_PROJECT_ID = 'cfb30000-0000-4000-8000-000000000002';
const SERVICE_PROJECT_ID = 'cfb40000-0000-4000-8000-000000000001';
const OTHER_SERVICE_PROJECT_ID = 'cfb40000-0000-4000-8000-000000000002';
const ABSENT_PROJECT_ID = 'cfb40000-0000-4000-8000-000000000099';

describe('ProjectsAuthorizationResolver (real local Postgres)', () => {
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
    if (!process.env.DATABASE_URL?.includes('127.0.0.1:54322')) {
      throw new Error('This suite requires the local Supabase Postgres DATABASE_URL');
    }

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
      VALUES (${PUBLIC_PROJECT_ID}::uuid, ${PERMISSION_USER_ID}::uuid, 'client')
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

  it('does not retain authorization across successive callers on one pooled backend', async () => {
    const clientPid = await projectAccessBackendPid(CLIENT_ID);
    const designerPid = await projectAccessBackendPid(DESIGNER_ID);
    expect(designerPid).toBe(clientPid);
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
