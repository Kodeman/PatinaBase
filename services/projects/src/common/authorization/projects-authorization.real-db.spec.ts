import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsAuthorizationResolver } from './projects-authorization.resolver';

const CLIENT_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';
const DESIGNER_ID = '10000000-0000-4000-8000-000000000003';
const ORG_MEMBER_ID = '10000000-0000-4000-8000-000000000004';
const ADMIN_ID = '10000000-0000-4000-8000-000000000005';
const PERMISSION_USER_ID = '10000000-0000-4000-8000-000000000006';
const USER_IDS = [CLIENT_ID, OTHER_ID, DESIGNER_ID, ORG_MEMBER_ID, ADMIN_ID, PERMISSION_USER_ID];
const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const PUBLIC_PROJECT_ID = '30000000-0000-4000-8000-000000000001';
const SERVICE_PROJECT_ID = '40000000-0000-4000-8000-000000000001';

describe('ProjectsAuthorizationResolver (real local Postgres)', () => {
  let prisma: PrismaService;
  let resolver: ProjectsAuthorizationResolver;

  const deleteFixtures = async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)
      `);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM svc_projects.projects WHERE id::text = ${SERVICE_PROJECT_ID}
      `);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM public.projects WHERE id::text = ${PUBLIC_PROJECT_ID}
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
          ${`projects-authz-${index}@test.invalid`},
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
          ${`projects-authz-${index}@test.invalid`},
          ${`Projects Authz ${index}`},
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
        'projects-authorization-fixture',
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

  it('does not retain authorization across successive pooled callers', async () => {
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
    await expect(
      resolver.withProjectAccess(CLIENT_ID, SERVICE_PROJECT_ID, 'read', async (tx) => {
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
  });
});
