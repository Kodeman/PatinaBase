import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PERMISSIONS_KEY, PermissionsGuard, RequestAuthorization } from '@patina/auth';
import {
  AssetKind,
  AssetRole,
  AssetStatus,
  Prisma,
  PrismaClient,
} from '../../generated/prisma-client';
import { JobQueueService } from '../jobs/job-queue.service';
import { MediaService } from '../media/media.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import { UploadService } from '../upload/upload.service';
import { MediaAuthorizationResolver } from './media-authorization.resolver';
import {
  createTransactionBoundPrisma,
  MediaAdminTransactionContext,
} from './media-admin-transaction.context';

const enabled = process.env.RUN_MEDIA_DB_AUTHZ_INTEGRATION === '1';
const describeDatabase = enabled ? describe : describe.skip;

const SUBJECT_A = 'cfb50000-0000-4000-8000-000000000001';
const SUBJECT_B = 'cfb50000-0000-4000-8000-000000000002';
const SUBJECT_ORG = 'cfb50000-0000-4000-8000-000000000003';
const SUBJECT_ADMIN = 'cfb50000-0000-4000-8000-000000000004';
const SUBJECT_NO_ROLE = 'cfb50000-0000-4000-8000-000000000005';
const SUBJECT_NO_MEDIA_PERMISSION = 'cfb50000-0000-4000-8000-000000000006';
const SUBJECT_UNKNOWN_ROLE = 'cfb50000-0000-4000-8000-000000000007';
const SUBJECT_STALE_METADATA = 'cfb50000-0000-4000-8000-000000000008';
const ORGANIZATION_ID = 'cfb60000-0000-4000-8000-000000000001';
const PRODUCT_A = 'cfb70000-0000-4000-8000-000000000001';
const PRODUCT_B = 'cfb70000-0000-4000-8000-000000000002';
const PRODUCT_ORG = 'cfb70000-0000-4000-8000-000000000003';
const ASSET_A = 'cfb80000-0000-4000-8000-000000000001';
const ASSET_B = 'cfb80000-0000-4000-8000-000000000002';
const ASSET_ORG = 'cfb80000-0000-4000-8000-000000000003';
const ABSENT_ASSET = 'cfb80000-0000-4000-8000-000000000099';
const PROJECT_A = 'cfb90000-0000-4000-8000-000000000001';
const PROJECT_ORG = 'cfb90000-0000-4000-8000-000000000002';
const PROJECT_ASSET_A = 'cfba0000-0000-4000-8000-000000000001';
const PROJECT_ASSET_ORG = 'cfba0000-0000-4000-8000-000000000002';
const UNKNOWN_ROLE_ID = 'cfbb0000-0000-4000-8000-000000000001';
const UNKNOWN_ROLE_PERMISSION_ID = 'cfbc0000-0000-4000-8000-000000000001';
const UNKNOWN_ROLE_NAME = 'cfb_media_invented_admin';
const STALE_APP_METADATA = {
  roles: ['super_admin'],
  permissions: ['media.admin.all'],
  organization_id: ORGANIZATION_ID,
  organization_ids: [ORGANIZATION_ID],
};
const CANONICAL_MEDIA_PERMISSIONS = new Set([
  'media.read.own',
  'media.manage.own',
  'media.read.org',
  'media.manage.org',
  'media.admin.all',
]);

describeDatabase('MediaAuthorizationResolver local Postgres boundary', () => {
  const prisma = new PrismaClient();
  const resolver = new MediaAuthorizationResolver(prisma);
  const eventEmitter = { emit: jest.fn() };
  const jobQueue = { addJob: jest.fn().mockResolvedValue('fixture-job') };
  const service = new MediaService(
    prisma,
    new ConfigService(),
    eventEmitter as unknown as EventEmitter2,
    { deleteObject: jest.fn() } as unknown as OCIStorageService,
    {} as unknown as UploadService,
    jobQueue as unknown as JobQueueService,
    resolver,
  );

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('127.0.0.1:54322')) {
      throw new Error('This suite requires the local Supabase Postgres DATABASE_URL');
    }
    await cleanup();
    const users: Array<[string, string, Record<string, unknown>]> = [
      [SUBJECT_A, 'media-authz-gaps-a@invalid.test', {}],
      [SUBJECT_B, 'media-authz-gaps-b@invalid.test', {}],
      [SUBJECT_ORG, 'media-authz-gaps-org@invalid.test', {}],
      [SUBJECT_ADMIN, 'media-authz-gaps-admin@invalid.test', {}],
      [SUBJECT_NO_ROLE, 'media-authz-cfb-no-role@invalid.test', {}],
      [SUBJECT_NO_MEDIA_PERMISSION, 'media-authz-cfb-no-media-permission@invalid.test', {}],
      [SUBJECT_UNKNOWN_ROLE, 'media-authz-cfb-unknown-role@invalid.test', {}],
      [SUBJECT_STALE_METADATA, 'media-authz-cfb-stale-metadata@invalid.test', STALE_APP_METADATA],
    ];
    for (const [id, email, appMetadata] of users) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO auth.users (
          id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, is_sso_user, is_anonymous
        ) VALUES (
          ${id}::uuid, 'authenticated', 'authenticated', ${email},
          ${JSON.stringify(appMetadata)}::jsonb, '{}'::jsonb,
          now(), now(), false, false
        )
      `);
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO public.profiles (id, email, display_name, role)
        VALUES (${id}::uuid, ${email}, 'Media authz fixture', 'designer')
        ON CONFLICT (id) DO NOTHING
      `);
    }
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM public.user_roles
      WHERE user_id IN (
        ${SUBJECT_NO_ROLE}::uuid,
        ${SUBJECT_NO_MEDIA_PERMISSION}::uuid,
        ${SUBJECT_UNKNOWN_ROLE}::uuid,
        ${SUBJECT_STALE_METADATA}::uuid
      )
    `);

    await assignRole(SUBJECT_A, 'independent_designer');
    await assignRole(SUBJECT_B, 'independent_designer');
    await assignRole(SUBJECT_ORG, 'brand_admin');
    await assignRole(SUBJECT_ADMIN, 'super_admin');
    await assignRole(SUBJECT_NO_MEDIA_PERMISSION, 'ml_operator');

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.roles (
        id, name, display_name, description, domain, is_system, is_assignable
      ) VALUES (
        ${UNKNOWN_ROLE_ID}::uuid,
        ${UNKNOWN_ROLE_NAME},
        'CFB invented media admin',
        'Integration-only unsupported role',
        'admin',
        false,
        false
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.role_permissions (id, role_id, permission_id)
      SELECT
        ${UNKNOWN_ROLE_PERMISSION_ID}::uuid,
        role.id,
        permission.id
      FROM public.roles AS role
      JOIN public.permissions AS permission
        ON permission.name = 'media.admin.all'
      WHERE role.id = ${UNKNOWN_ROLE_ID}::uuid
    `);
    await assignRole(SUBJECT_UNKNOWN_ROLE, UNKNOWN_ROLE_NAME);

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.organizations (id, type, name, slug, status)
      VALUES (
        ${ORGANIZATION_ID}::uuid,
        'design_studio',
        'Media authz fixture',
        'media-authz-cfb6-fixture',
        'active'
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.organization_members (
        user_id, organization_id, role, status, joined_at
      ) VALUES (
        ${SUBJECT_ORG}::uuid, ${ORGANIZATION_ID}::uuid, 'admin', 'active', now()
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.projects (id, name, status, created_by, designer_id, client_id)
      VALUES (
        ${PROJECT_A}::uuid,
        'Media project authz fixture',
        'active',
        ${SUBJECT_A}::uuid,
        ${SUBJECT_A}::uuid,
        ${SUBJECT_B}::uuid
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.projects (
        id, name, status, created_by, designer_id, client_id, studio_id
      ) VALUES (
        ${PROJECT_ORG}::uuid,
        'Media organization project authz fixture',
        'active',
        ${SUBJECT_A}::uuid,
        ${SUBJECT_A}::uuid,
        ${SUBJECT_B}::uuid,
        ${ORGANIZATION_ID}::uuid
      )
    `);

    await createPersonalProduct(PRODUCT_A, SUBJECT_A, 'Media authz A');
    await createPersonalProduct(PRODUCT_B, SUBJECT_B, 'Media authz B');
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.products (
        id, name, captured_by, captured_at, layer, studio_id,
        vendor_contact, lead_time_weeks, payment_terms, category,
        usage_notes, patina_managed, status
      ) VALUES (
        ${PRODUCT_ORG}::uuid, 'Media authz org', ${SUBJECT_ORG}::uuid, now(),
        'studio', ${ORGANIZATION_ID}::uuid, '{}'::jsonb, 1, 'net_30',
        'decor', 'fixture', false, 'draft'
      )
    `);

    await prisma.mediaAsset.createMany({
      data: [
        {
          id: ASSET_A,
          kind: AssetKind.IMAGE,
          productId: PRODUCT_A,
          rawKey: `authz-fixture/${ASSET_A}.jpg`,
          uploadedBy: SUBJECT_A,
        },
        {
          id: ASSET_B,
          kind: AssetKind.IMAGE,
          productId: PRODUCT_B,
          rawKey: `authz-fixture/${ASSET_B}.jpg`,
          uploadedBy: SUBJECT_B,
        },
        {
          id: ASSET_ORG,
          kind: AssetKind.IMAGE,
          productId: PRODUCT_ORG,
          rawKey: `authz-fixture/${ASSET_ORG}.jpg`,
          uploadedBy: SUBJECT_ORG,
        },
        {
          id: PROJECT_ASSET_A,
          kind: AssetKind.DOCUMENT,
          projectId: PROJECT_A,
          rawKey: `authz-fixture/${PROJECT_ASSET_A}.pdf`,
          uploadedBy: SUBJECT_ADMIN,
        },
        {
          id: PROJECT_ASSET_ORG,
          kind: AssetKind.DOCUMENT,
          projectId: PROJECT_ORG,
          rawKey: `authz-fixture/${PROJECT_ASSET_ORG}.pdf`,
          uploadedBy: SUBJECT_ADMIN,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows own and returns the same non-enumerating 404 for another user', async () => {
    await expect(readAsset(SUBJECT_A, ASSET_A)).resolves.toMatchObject({ id: ASSET_A });
    await expect(readAsset(SUBJECT_A, ASSET_B)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns an identical service 404 for an inaccessible and an absent asset', async () => {
    const inaccessible = await captureNotFound(() => service.getById(SUBJECT_A, ASSET_B));
    const absent = await captureNotFound(() => service.getById(SUBJECT_A, ABSENT_ASSET));

    expect(inaccessible).toEqual(absent);
    expect(JSON.stringify(inaccessible)).not.toContain(ASSET_B);
    expect(JSON.stringify(inaccessible)).not.toContain(ABSENT_ASSET);
  });

  it('scopes real search rows and pagination counts to the current subject', async () => {
    const page = await service.search(SUBJECT_A, { page: 1, limit: 10 });

    expect(page.pagination).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
    expect(new Set(page.data.map((asset) => asset.id))).toEqual(
      new Set([ASSET_A, PROJECT_ASSET_A, PROJECT_ASSET_ORG]),
    );
    expect(JSON.stringify(page)).not.toContain(ASSET_B);
    expect(JSON.stringify(page)).not.toContain(ASSET_ORG);
  });

  it('does not mutate or disclose ids from a mixed-access processing batch', async () => {
    const before = await prisma.mediaAsset.findMany({
      where: { id: { in: [ASSET_A, ASSET_B] } },
      select: { id: true, status: true, tags: true },
      orderBy: { id: 'asc' },
    });
    const mixed = await captureNotFound(() =>
      service.processBatch(SUBJECT_A, { assetIds: [ASSET_A, ASSET_B] }),
    );
    const absent = await captureNotFound(() =>
      service.processBatch(SUBJECT_A, { assetIds: [ASSET_A, ABSENT_ASSET] }),
    );

    expect(mixed).toEqual(absent);
    expect(JSON.stringify(mixed)).not.toContain(ASSET_A);
    expect(JSON.stringify(mixed)).not.toContain(ASSET_B);
    expect(jobQueue.addJob).not.toHaveBeenCalled();
    await expect(
      prisma.mediaAsset.findMany({
        where: { id: { in: [ASSET_A, ASSET_B] } },
        select: { id: true, status: true, tags: true },
        orderBy: { id: 'asc' },
      }),
    ).resolves.toEqual(before);
  });

  it('allows an actual own metadata write and leaves a foreign asset unchanged', async () => {
    await expect(
      service.updateMetadata(SUBJECT_A, ASSET_A, { tags: ['authorized-write'] }),
    ).resolves.toMatchObject({ id: ASSET_A, tags: ['authorized-write'] });
    await expect(
      service.updateMetadata(SUBJECT_A, ASSET_B, { tags: ['foreign-write'] }),
    ).rejects.toMatchObject({ status: 404, message: 'Media object not found' });
    await expect(
      prisma.mediaAsset.findUniqueOrThrow({ where: { id: ASSET_B } }),
    ).resolves.toMatchObject({ tags: [] });
  });

  it('writes mapped media enums through the generated Prisma client', async () => {
    await expect(
      prisma.mediaAsset.update({
        where: { id: ASSET_A },
        data: { role: AssetRole.DETAIL, status: AssetStatus.PROCESSING },
      }),
    ).resolves.toMatchObject({
      role: AssetRole.DETAIL,
      status: AssetStatus.PROCESSING,
    });
  });

  it('allows an active organization member only inside that organization', async () => {
    await expect(readAsset(SUBJECT_ORG, ASSET_ORG)).resolves.toMatchObject({
      id: ASSET_ORG,
    });
    await expect(readAsset(SUBJECT_ORG, ASSET_A)).rejects.toBeInstanceOf(NotFoundException);
    await expect(readAsset(SUBJECT_ORG, PROJECT_ASSET_ORG)).resolves.toMatchObject({
      id: PROJECT_ASSET_ORG,
      projectId: PROJECT_ORG,
    });
    await expect(readAsset(SUBJECT_ORG, PROJECT_ASSET_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('authorizes a project asset from canonical client/designer assignment, not uploader metadata', async () => {
    await expect(readAsset(SUBJECT_A, PROJECT_ASSET_A)).resolves.toMatchObject({
      id: PROJECT_ASSET_A,
      projectId: PROJECT_A,
      uploadedBy: SUBJECT_ADMIN,
    });
    await expect(readAsset(SUBJECT_B, PROJECT_ASSET_A)).resolves.toMatchObject({
      id: PROJECT_ASSET_A,
    });
  });

  it('denies a removed organization member on the next request', async () => {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE public.organization_members
      SET status = 'removed'
      WHERE user_id = ${SUBJECT_ORG}::uuid
        AND organization_id = ${ORGANIZATION_ID}::uuid
    `);
    await expect(readAsset(SUBJECT_ORG, ASSET_ORG)).rejects.toBeInstanceOf(NotFoundException);
    await expect(readAsset(SUBJECT_ORG, PROJECT_ASSET_ORG)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE public.organization_members
      SET status = 'active'
      WHERE user_id = ${SUBJECT_ORG}::uuid
        AND organization_id = ${ORGANIZATION_ID}::uuid
    `);
  });

  it('allows the reviewed all-scope operation only with current admin permission', async () => {
    await expect(readAsset(SUBJECT_ADMIN, ASSET_A)).resolves.toMatchObject({ id: ASSET_A });
    await expect(readAsset(SUBJECT_ADMIN, ASSET_ORG)).resolves.toMatchObject({
      id: ASSET_ORG,
    });
  });

  it('denies a current subject with no user role', async () => {
    await expect(resolver.resolve(SUBJECT_NO_ROLE)).resolves.toEqual({
      subject: SUBJECT_NO_ROLE,
      roles: [],
      permissions: [],
      organizationIds: [],
    });
    await expect(
      resolver.withAssetScope(SUBJECT_NO_ROLE, 'read', async () => true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a supported current role without a canonical media permission', async () => {
    const current = await resolver.resolve(SUBJECT_NO_MEDIA_PERMISSION);

    expect(current.roles).toEqual(['ml_operator']);
    expect(current.permissions.length).toBeGreaterThan(0);
    expect(
      current.permissions.filter((permission) => CANONICAL_MEDIA_PERMISSIONS.has(permission)),
    ).toEqual([]);
    await expect(
      resolver.withAssetScope(SUBJECT_NO_MEDIA_PERMISSION, 'read', async () => true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies an invented current role even when Strata maps it to media.admin.all', async () => {
    const mappedPermissions = await prisma.$queryRaw<Array<{ permission_name: string }>>(
      Prisma.sql`
        SELECT permission.name AS permission_name
        FROM public.role_permissions AS role_permission
        JOIN public.permissions AS permission
          ON permission.id = role_permission.permission_id
        WHERE role_permission.role_id = ${UNKNOWN_ROLE_ID}::uuid
      `,
    );
    expect(mappedPermissions).toEqual([{ permission_name: 'media.admin.all' }]);

    await expect(resolver.resolve(SUBJECT_UNKNOWN_ROLE)).resolves.toEqual({
      subject: SUBJECT_UNKNOWN_ROLE,
      roles: [UNKNOWN_ROLE_NAME],
      permissions: [],
      organizationIds: [],
    });
    await expect(resolver.withAdmin(SUBJECT_UNKNOWN_ROLE, async () => true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('ignores stale caller and JWT app_metadata claims when current Strata state denies', async () => {
    const storedMetadata = await prisma.$queryRaw<Array<{ app_metadata: unknown }>>(Prisma.sql`
      SELECT auth_user.raw_app_meta_data AS app_metadata
      FROM auth.users AS auth_user
      WHERE auth_user.id = ${SUBJECT_STALE_METADATA}::uuid
    `);
    expect(storedMetadata[0]?.app_metadata).toEqual(STALE_APP_METADATA);

    const handler = () => undefined;
    Reflect.defineMetadata(PERMISSIONS_KEY, ['media.admin.all'], handler);
    const request: {
      user: Record<string, unknown>;
      authorization?: RequestAuthorization;
    } = {
      user: {
        id: SUBJECT_STALE_METADATA,
        sub: SUBJECT_STALE_METADATA,
        userId: SUBJECT_STALE_METADATA,
        role: 'authenticated',
        roles: ['super_admin'],
        permissions: ['media.admin.all'],
        organizationId: ORGANIZATION_ID,
        organizationIds: [ORGANIZATION_ID],
        app_metadata: STALE_APP_METADATA,
      },
    };
    const context = {
      getHandler: () => handler,
      getClass: () => class ProtectedMediaRoute {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(new PermissionsGuard(resolver).canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request.authorization).toEqual({
      subject: SUBJECT_STALE_METADATA,
      roles: [],
      permissions: [],
      organizationIds: [],
    });
  });

  it('holds the admin proof rows until a leased operation completes', async () => {
    let releaseLease!: () => void;
    const leaseReleased = new Promise<void>((resolve) => {
      releaseLease = resolve;
    });
    let signalLeaseStarted!: () => void;
    const leaseStarted = new Promise<void>((resolve) => {
      signalLeaseStarted = resolve;
    });

    const context = new MediaAdminTransactionContext();
    const transactionBoundPrisma = createTransactionBoundPrisma(context);
    const lease = resolver.withAdminLease(SUBJECT_ADMIN, async (transaction) => {
      await context.run(transaction, async () => {
        const authorizationConnection = await transaction.$queryRaw<Array<{ pid: number }>>(
          Prisma.sql`SELECT pg_backend_pid() AS pid`,
        );
        const handlerConnection = await transactionBoundPrisma.$queryRaw<Array<{ pid: number }>>(
          Prisma.sql`SELECT pg_backend_pid() AS pid`,
        );
        expect(handlerConnection[0].pid).toBe(authorizationConnection[0].pid);
      });
      signalLeaseStarted();
      await leaseReleased;
      return true;
    });
    await Promise.race([leaseStarted, lease]);

    const revoke = prisma.$executeRaw(Prisma.sql`
      DELETE FROM public.user_roles AS user_role
      USING public.roles AS role
      WHERE user_role.role_id = role.id
        AND user_role.user_id = ${SUBJECT_ADMIN}::uuid
        AND role.name = 'super_admin'
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
      await assignRole(SUBJECT_ADMIN, 'super_admin');
    }
  });

  it('applies a role change on the next request', async () => {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM public.user_roles WHERE user_id = ${SUBJECT_A}::uuid
    `);
    await expect(
      resolver.withAssetScope(SUBJECT_A, 'read', async () => true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await assignRole(SUBJECT_A, 'independent_designer');
    await expect(readAsset(SUBJECT_A, ASSET_A)).resolves.toBeDefined();
  });

  it('does not retain authorization between sequential subjects on one pooled backend', async () => {
    const first = await readAssetWithBackendPid(SUBJECT_A, ASSET_A);
    const second = await readAssetWithBackendPid(SUBJECT_B, ASSET_B);
    expect(second.pid).toBe(first.pid);
    await expect(readAsset(SUBJECT_B, ASSET_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rolls back a failed protected write without leaking state to the next caller', async () => {
    const before = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: ASSET_A } });
    let rollbackPid: number | undefined;
    await expect(
      resolver.withAssetScope(SUBJECT_A, 'manage', async (transaction, scope) => {
        const rows = await transaction.$queryRaw<Array<{ pid: number }>>(Prisma.sql`
          SELECT pg_backend_pid()::integer AS pid
        `);
        rollbackPid = rows[0].pid;
        const asset = await resolver.requireAsset(transaction, scope, ASSET_A);
        await transaction.mediaAsset.update({
          where: { id: asset.id },
          data: { tags: ['must-roll-back'] },
        });
        throw new Error('fixture rollback');
      }),
    ).rejects.toThrow('fixture rollback');

    await expect(prisma.mediaAsset.findUnique({ where: { id: ASSET_A } })).resolves.toMatchObject({
      tags: before.tags,
    });
    await expect(readAsset(SUBJECT_B, ASSET_A)).rejects.toBeInstanceOf(NotFoundException);
    await expect(readAssetWithBackendPid(SUBJECT_B, ASSET_B)).resolves.toMatchObject({
      pid: rollbackPid,
    });
  });

  async function readAsset(subject: string, assetId: string) {
    return resolver.withAssetScope(subject, 'read', (transaction, scope) =>
      resolver.requireAsset(transaction, scope, assetId),
    );
  }

  async function readAssetWithBackendPid(subject: string, assetId: string) {
    return resolver.withAssetScope(subject, 'read', async (transaction, scope) => {
      const asset = await resolver.requireAsset(transaction, scope, assetId);
      const rows = await transaction.$queryRaw<Array<{ pid: number }>>(Prisma.sql`
        SELECT pg_backend_pid()::integer AS pid
      `);
      return { asset, pid: rows[0].pid };
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

  async function assignRole(subject: string, roleName: string) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.user_roles (user_id, role_id)
      SELECT ${subject}::uuid, role.id
      FROM public.roles AS role
      WHERE role.name = ${roleName}
      ON CONFLICT (user_id, role_id) DO NOTHING
    `);
  }

  async function createPersonalProduct(id: string, owner: string, name: string) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.products (
        id, name, captured_by, captured_at, layer, owner_user_id,
        patina_managed, status
      ) VALUES (
        ${id}::uuid, ${name}, ${owner}::uuid, now(), 'personal',
        ${owner}::uuid, false, 'draft'
      )
    `);
  }

  async function cleanup() {
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT set_config(
          'request.jwt.claims',
          ${JSON.stringify({ role: 'service_role' })},
          true
        )
      `);
      await transaction.mediaAsset.deleteMany({
        where: {
          id: { in: [ASSET_A, ASSET_B, ASSET_ORG, PROJECT_ASSET_A, PROJECT_ASSET_ORG] },
        },
      });
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM public.projects WHERE id IN (${PROJECT_A}::uuid, ${PROJECT_ORG}::uuid)
      `);
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM public.products
        WHERE id IN (${PRODUCT_A}::uuid, ${PRODUCT_B}::uuid, ${PRODUCT_ORG}::uuid)
      `);
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM public.user_roles
        WHERE user_id IN (
          ${SUBJECT_A}::uuid,
          ${SUBJECT_B}::uuid,
          ${SUBJECT_ORG}::uuid,
          ${SUBJECT_ADMIN}::uuid,
          ${SUBJECT_NO_ROLE}::uuid,
          ${SUBJECT_NO_MEDIA_PERMISSION}::uuid,
          ${SUBJECT_UNKNOWN_ROLE}::uuid,
          ${SUBJECT_STALE_METADATA}::uuid
        )
           OR role_id = ${UNKNOWN_ROLE_ID}::uuid
      `);
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM public.role_permissions
        WHERE id = ${UNKNOWN_ROLE_PERMISSION_ID}::uuid
           OR role_id = ${UNKNOWN_ROLE_ID}::uuid
      `);
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM public.roles
        WHERE id = ${UNKNOWN_ROLE_ID}::uuid
           OR name = ${UNKNOWN_ROLE_NAME}
      `);
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM public.organizations AS organization
        WHERE organization.id = ${ORGANIZATION_ID}::uuid
           OR EXISTS (
             SELECT 1
             FROM public.organization_members AS membership
             WHERE membership.organization_id = organization.id
               AND membership.user_id IN (
                 ${SUBJECT_A}::uuid,
                 ${SUBJECT_B}::uuid,
                 ${SUBJECT_ORG}::uuid,
                 ${SUBJECT_ADMIN}::uuid,
                 ${SUBJECT_NO_ROLE}::uuid,
                 ${SUBJECT_NO_MEDIA_PERMISSION}::uuid,
                 ${SUBJECT_UNKNOWN_ROLE}::uuid,
                 ${SUBJECT_STALE_METADATA}::uuid
               )
           )
      `);
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM auth.users
        WHERE id IN (
          ${SUBJECT_A}::uuid,
          ${SUBJECT_B}::uuid,
          ${SUBJECT_ORG}::uuid,
          ${SUBJECT_ADMIN}::uuid,
          ${SUBJECT_NO_ROLE}::uuid,
          ${SUBJECT_NO_MEDIA_PERMISSION}::uuid,
          ${SUBJECT_UNKNOWN_ROLE}::uuid,
          ${SUBJECT_STALE_METADATA}::uuid
        )
      `);
    });
  }
});
