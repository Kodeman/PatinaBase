import { NotFoundException } from '@nestjs/common';
import { ProjectsAuthorizationResolver } from './projects-authorization.resolver';

describe('ProjectsAuthorizationResolver', () => {
  const queryRaw = jest.fn();
  const prisma: { $queryRaw: jest.Mock; $transaction: jest.Mock } = {
    $queryRaw: queryRaw,
    $transaction: jest.fn(async (input: Promise<unknown>[]) => Promise.all(input)),
  };
  const resolver = new ProjectsAuthorizationResolver(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves current roles, permissions, and active organizations on every call', async () => {
    queryRaw
      .mockResolvedValueOnce([{ roleName: 'client', permissionName: 'project.read.assigned' }])
      .mockResolvedValueOnce([{ organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ roleName: 'client', permissionName: null }])
      .mockResolvedValueOnce([]);

    const first = await resolver.resolve('actor-1');
    const second = await resolver.resolve('actor-1');

    expect(first).toEqual({
      subject: 'actor-1',
      roles: ['client'],
      permissions: ['project.read.assigned'],
      organizationIds: ['org-1'],
    });
    expect(second).toEqual({
      subject: 'actor-1',
      roles: ['client'],
      permissions: [],
      organizationIds: [],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([
    ['missing role', [], []],
    [
      'unknown role',
      [{ roleName: 'invented_role', permissionName: 'project.admin.all' }],
      [{ organizationId: 'org-1' }],
    ],
    [
      'mixed supported and unknown roles',
      [
        { roleName: 'client', permissionName: 'project.read.assigned' },
        { roleName: 'invented_role', permissionName: 'project.admin.all' },
      ],
      [{ organizationId: 'org-1' }],
    ],
  ])('fails closed for %s', async (_case, roles, organizations) => {
    queryRaw.mockResolvedValueOnce(roles).mockResolvedValueOnce(organizations);

    const authorization = await resolver.resolve('actor-1');

    expect(authorization.permissions).toEqual([]);
    expect(authorization.organizationIds).toEqual([]);
  });

  it('uses parameterized SQL and returns non-enumerating 404 for inaccessible projects', async () => {
    queryRaw.mockResolvedValueOnce([]);

    await expect(
      resolver.assertProjectAccess('actor-1', 'project-1', 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const sql = queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(sql.strings.join('')).not.toContain('actor-1');
    expect(sql.strings.join('')).not.toContain('project-1');
    expect(sql.values).toEqual(expect.arrayContaining(['actor-1', 'project-1', 'read']));
  });

  it('returns only project IDs selected by the database scope query', async () => {
    queryRaw.mockResolvedValueOnce([{ projectId: 'project-1' }, { projectId: 'project-3' }]);

    await expect(resolver.accessibleProjectIds('actor-1', 'read')).resolves.toEqual([
      'project-1',
      'project-3',
    ]);
  });

  it('derives linked assignments from the canonical public project row', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        publicProjectId: 'public-project-1',
        clientId: 'client-1',
        designerId: 'designer-1',
      },
    ]);

    await expect(
      resolver.authorizePublicProjectLink('designer-1', 'public-project-1'),
    ).resolves.toEqual({
      publicProjectId: 'public-project-1',
      clientId: 'client-1',
      designerId: 'designer-1',
    });
  });
});
