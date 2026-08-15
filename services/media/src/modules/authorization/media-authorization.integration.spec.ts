import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AssetKind,
  AssetRole,
  AssetStatus,
  Prisma,
  PrismaClient,
} from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from './media-authorization.resolver';
import {
  createTransactionBoundPrisma,
  MediaAdminTransactionContext,
} from './media-admin-transaction.context';

const enabled = process.env.RUN_MEDIA_DB_AUTHZ_INTEGRATION === '1';
const describeDatabase = enabled ? describe : describe.skip;

const SUBJECT_A = 'cfa10000-0000-4000-8000-000000000001';
const SUBJECT_B = 'cfa10000-0000-4000-8000-000000000002';
const SUBJECT_ORG = 'cfa10000-0000-4000-8000-000000000003';
const SUBJECT_ADMIN = 'cfa10000-0000-4000-8000-000000000004';
const ORGANIZATION_ID = 'cfa20000-0000-4000-8000-000000000001';
const PRODUCT_A = 'cfa30000-0000-4000-8000-000000000001';
const PRODUCT_B = 'cfa30000-0000-4000-8000-000000000002';
const PRODUCT_ORG = 'cfa30000-0000-4000-8000-000000000003';
const ASSET_A = 'cfa40000-0000-4000-8000-000000000001';
const ASSET_B = 'cfa40000-0000-4000-8000-000000000002';
const ASSET_ORG = 'cfa40000-0000-4000-8000-000000000003';

describeDatabase('MediaAuthorizationResolver local Postgres boundary', () => {
  const prisma = new PrismaClient();
  const resolver = new MediaAuthorizationResolver(prisma);

  beforeAll(async () => {
    await cleanup();
    for (const [id, email] of [
      [SUBJECT_A, 'media-authz-a@invalid.test'],
      [SUBJECT_B, 'media-authz-b@invalid.test'],
      [SUBJECT_ORG, 'media-authz-org@invalid.test'],
      [SUBJECT_ADMIN, 'media-authz-admin@invalid.test'],
    ]) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO auth.users (
          id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, is_sso_user, is_anonymous
        ) VALUES (
          ${id}::uuid, 'authenticated', 'authenticated', ${email},
          '{}'::jsonb, '{}'::jsonb, now(), now(), false, false
        )
      `);
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO public.profiles (id, email, display_name, role)
        VALUES (${id}::uuid, ${email}, 'Media authz fixture', 'designer')
        ON CONFLICT (id) DO NOTHING
      `);
    }

    await assignRole(SUBJECT_A, 'independent_designer');
    await assignRole(SUBJECT_B, 'independent_designer');
    await assignRole(SUBJECT_ORG, 'brand_admin');
    await assignRole(SUBJECT_ADMIN, 'super_admin');

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.organizations (id, type, name, slug, status)
      VALUES (
        ${ORGANIZATION_ID}::uuid,
        'design_studio',
        'Media authz fixture',
        'media-authz-cfa2-fixture',
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
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('allows own and returns the same non-enumerating 404 for another user', async () => {
    await expect(readAsset(SUBJECT_A, ASSET_A)).resolves.toMatchObject({ id: ASSET_A });
    await expect(readAsset(SUBJECT_A, ASSET_B)).rejects.toBeInstanceOf(NotFoundException);
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
  });

  it('denies a removed organization member on the next request', async () => {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE public.organization_members
      SET status = 'removed'
      WHERE user_id = ${SUBJECT_ORG}::uuid
        AND organization_id = ${ORGANIZATION_ID}::uuid
    `);
    await expect(readAsset(SUBJECT_ORG, ASSET_ORG)).rejects.toBeInstanceOf(NotFoundException);
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

  it('does not retain authorization between sequential subjects', async () => {
    await expect(readAsset(SUBJECT_A, ASSET_A)).resolves.toBeDefined();
    await expect(readAsset(SUBJECT_B, ASSET_B)).resolves.toBeDefined();
    await expect(readAsset(SUBJECT_B, ASSET_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rolls back a failed protected write without leaking state to the next caller', async () => {
    await expect(
      resolver.withAssetScope(SUBJECT_A, 'manage', async (transaction, scope) => {
        const asset = await resolver.requireAsset(transaction, scope, ASSET_A);
        await transaction.mediaAsset.update({
          where: { id: asset.id },
          data: { tags: ['must-roll-back'] },
        });
        throw new Error('fixture rollback');
      }),
    ).rejects.toThrow('fixture rollback');

    await expect(prisma.mediaAsset.findUnique({ where: { id: ASSET_A } })).resolves.toMatchObject({
      tags: [],
    });
    await expect(readAsset(SUBJECT_B, ASSET_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  async function readAsset(subject: string, assetId: string) {
    return resolver.withAssetScope(subject, 'read', (transaction, scope) =>
      resolver.requireAsset(transaction, scope, assetId),
    );
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
        where: { id: { in: [ASSET_A, ASSET_B, ASSET_ORG] } },
      });
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM public.products
        WHERE id IN (${PRODUCT_A}::uuid, ${PRODUCT_B}::uuid, ${PRODUCT_ORG}::uuid)
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
                 ${SUBJECT_ADMIN}::uuid
               )
           )
      `);
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM auth.users
        WHERE id IN (
          ${SUBJECT_A}::uuid,
          ${SUBJECT_B}::uuid,
          ${SUBJECT_ORG}::uuid,
          ${SUBJECT_ADMIN}::uuid
        )
      `);
    });
  }
});
