import { BadRequestException } from '@nestjs/common';

const { ProjectsService } = require('./projects.service.ts') as typeof import('./projects.service');

describe('ProjectsService authorization scoping', () => {
  const project = {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const auditLog = { create: jest.fn() };
  const prisma = {
    project,
    auditLog,
    $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback({ project, auditLog }),
    ),
  };
  const eventEmitter = { emit: jest.fn() };
  const cache = { invalidateProject: jest.fn() };
  const accessibleProjectIds = jest.fn();
  const authorizePublicProjectLink = jest.fn();
  const authorization = {
    accessibleProjectIds,
    authorizePublicProjectLink,
    withAccessibleProjectIds: jest.fn(
      async (_subject: string, _mode: string, operation: (ids: string[], tx: any) => unknown) =>
        operation(await accessibleProjectIds(), { project, auditLog }),
    ),
    withPublicProjectLink: jest.fn(
      async (_subject: string, _publicProjectId: string, operation: Function) =>
        operation(await authorizePublicProjectLink(), { project, auditLog }),
    ),
    withProjectAccess: jest.fn(
      async (_subject: string, _projectId: string, _mode: string, operation: Function) =>
        operation({ project, auditLog }),
    ),
  };
  const service = new ProjectsService(
    prisma as any,
    eventEmitter as any,
    cache as any,
    authorization as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies the same authorized-ID predicate to paginated rows and count', async () => {
    authorization.accessibleProjectIds.mockResolvedValue(['project-own']);
    project.findMany.mockResolvedValue([{ id: 'project-own' }]);
    project.count.mockResolvedValue(1);

    const result = await service.findAll(
      { clientId: 'caller-filter', page: 1, limit: 20 } as any,
      'actor-1',
    );

    expect(authorization.withAccessibleProjectIds).toHaveBeenCalledWith(
      'actor-1',
      'read',
      expect.any(Function),
    );
    expect(project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['project-own'] }, clientId: 'caller-filter' },
      }),
    );
    expect(project.count).toHaveBeenCalledWith({
      where: { id: { in: ['project-own'] }, clientId: 'caller-filter' },
    });
    expect(result.pagination.total).toBe(1);
  });

  it('silently omits inaccessible batch IDs', async () => {
    authorization.accessibleProjectIds.mockResolvedValue(['project-own']);
    project.findMany.mockResolvedValue([{ id: 'project-own' }]);

    await expect(service.findByIds(['project-own', 'project-other'], 'actor-1')).resolves.toEqual([
      { id: 'project-own' },
    ]);
    expect(project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['project-own'] } } }),
    );
  });

  it('derives a linked service project assignment from the public project', async () => {
    authorization.authorizePublicProjectLink.mockResolvedValue({
      publicProjectId: 'public-project-1',
      clientId: 'canonical-client',
      designerId: 'canonical-designer',
    });
    project.create.mockImplementation(async ({ data }: any) => ({
      id: 'service-project-1',
      ...data,
    }));

    const created = await service.create(
      {
        publicProjectId: 'public-project-1',
        title: 'Project',
        clientId: 'caller-client',
        designerId: 'caller-designer',
      } as any,
      'canonical-designer',
    );

    expect(created).toEqual(
      expect.objectContaining({
        clientId: 'canonical-client',
        designerId: 'canonical-designer',
      }),
    );
    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actor: 'canonical-designer' }) }),
    );
  });

  it('rejects caller-controlled designer identity for an unlinked project', async () => {
    await expect(
      service.create(
        {
          title: 'Project',
          clientId: 'client-1',
          designerId: 'different-designer',
        } as any,
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(project.create).not.toHaveBeenCalled();
  });

  it('rejects canonical public project re-parenting before any authorized write', async () => {
    await expect(
      service.update(
        'service-project-1',
        { publicProjectId: 'different-public-project' } as any,
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(authorization.withProjectAccess).not.toHaveBeenCalled();
    expect(project.update).not.toHaveBeenCalled();
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it('resolves a fresh authorized-ID set for successive pooled callers', async () => {
    authorization.accessibleProjectIds
      .mockResolvedValueOnce(['actor-one-project'])
      .mockResolvedValueOnce(['actor-two-project']);
    project.findMany
      .mockResolvedValueOnce([{ id: 'actor-one-project' }])
      .mockResolvedValueOnce([{ id: 'actor-two-project' }]);

    await service.findByIds(['actor-one-project', 'actor-two-project'], 'actor-1');
    await service.findByIds(['actor-one-project', 'actor-two-project'], 'actor-2');

    expect(project.findMany.mock.calls[0][0].where.id.in).toEqual(['actor-one-project']);
    expect(project.findMany.mock.calls[1][0].where.id.in).toEqual(['actor-two-project']);
  });
});
