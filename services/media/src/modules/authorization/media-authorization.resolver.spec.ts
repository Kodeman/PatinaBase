import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from './media-authorization.resolver';

const SUBJECT_A = '11111111-1111-4111-8111-111111111111';
const SUBJECT_B = '22222222-2222-4222-8222-222222222222';

describe('MediaAuthorizationResolver', () => {
  function harness(queryResults: unknown[]) {
    const queryRaw = jest.fn();
    for (const result of queryResults) queryRaw.mockResolvedValueOnce(result);
    const transaction = {
      $queryRaw: queryRaw,
      mediaAsset: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn(async (operation: any) => operation(transaction)),
    } as unknown as PrismaClient;
    return { resolver: new MediaAuthorizationResolver(prisma), queryRaw, transaction };
  }

  it('resolves only current Strata roles, permissions, and active organizations', async () => {
    const { resolver } = harness([
      [
        { role_name: 'independent_designer', permission_name: 'media.read.own' },
        { role_name: 'independent_designer', permission_name: 'media.manage.own' },
      ],
      [{ organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
    ]);

    await expect(resolver.resolve(SUBJECT_A)).resolves.toEqual({
      subject: SUBJECT_A,
      roles: ['independent_designer'],
      permissions: ['media.read.own', 'media.manage.own'],
      organizationIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    });
  });

  it('does not retain authorization across successive pooled subjects', async () => {
    const { resolver } = harness([
      [{ role_name: 'independent_designer', permission_name: 'media.read.own' }],
      [],
      [{ role_name: 'super_admin', permission_name: 'media.admin.all' }],
      [],
    ]);

    const first = await resolver.resolve(SUBJECT_A);
    const second = await resolver.resolve(SUBJECT_B);
    expect(first.permissions).toEqual(['media.read.own']);
    expect(second.permissions).toEqual(['media.admin.all']);
    expect(second.subject).toBe(SUBJECT_B);
  });

  it('denies a missing permission instead of broadening scope', async () => {
    const { resolver } = harness([[{ role_name: 'unknown', permission_name: null }], []]);
    await expect(
      resolver.withAssetScope(SUBJECT_A, 'read', async () => true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not authorize an unsupported role even if it is mapped to a canonical permission', async () => {
    const { resolver } = harness([
      [{ role_name: 'caller_invented_role', permission_name: 'media.admin.all' }],
      [],
    ]);
    await expect(resolver.resolve(SUBJECT_A)).resolves.toMatchObject({
      roles: [],
      permissions: [],
    });
  });

  it('builds own scope from unbound uploader and owned product rows only', async () => {
    const { resolver } = harness([
      [{ role_name: 'independent_designer', permission_name: 'media.read.own' }],
      [],
      [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
    ]);

    const where = await resolver.withAssetScope(
      SUBJECT_A,
      'read',
      async (_transaction, scope) => scope.where,
    );
    expect(where).toEqual({
      OR: [
        { productId: null, uploadedBy: SUBJECT_A },
        { productId: { in: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] } },
      ],
    });
  });

  it('requires all requested batch ids and emits a generic non-enumerating 404', async () => {
    const { resolver, transaction } = harness([]);
    transaction.mediaAsset.findMany.mockResolvedValue([{ id: 'allowed' }]);
    const scope = {
      subject: SUBJECT_A,
      authorization: {
        subject: SUBJECT_A,
        roles: [],
        permissions: ['media.read.own'],
        organizationIds: [],
      },
      where: { uploadedBy: SUBJECT_A },
      admin: false,
    };

    await expect(
      resolver.requireAssets(transaction as any, scope, ['allowed', 'inaccessible']),
    ).rejects.toEqual(new NotFoundException('Media object not found'));
  });

  it('parameterizes the verified subject instead of interpolating SQL text', async () => {
    const { resolver, queryRaw } = harness([[], []]);
    await resolver.resolve(SUBJECT_A);
    const query = queryRaw.mock.calls[0][0];
    expect(query.strings.join('')).not.toContain(SUBJECT_A);
    expect(query.values).toContain(SUBJECT_A);
  });

  it('holds a parameterized share lock on the exact current admin proof rows', async () => {
    const { resolver, queryRaw } = harness([[{ user_id: SUBJECT_A }]]);
    const operation = jest.fn().mockResolvedValue('complete');

    await expect(resolver.withAdminLease(SUBJECT_A, operation)).resolves.toBe('complete');

    const query = queryRaw.mock.calls[0][0];
    expect(query.strings.join('')).toContain(
      'FOR SHARE OF user_role, role, role_permission, permission',
    );
    expect(query.strings.join('')).not.toContain(SUBJECT_A);
    expect(query.values).toEqual(expect.arrayContaining([SUBJECT_A, 'media.admin.all']));
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
