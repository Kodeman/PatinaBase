import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { ProjectAccessGuard } from './project-access.guard';

describe('ProjectAccessGuard', () => {
  const findUnique = jest.fn();
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  } as unknown as Reflector;
  const guard = new ProjectAccessGuard({ project: { findUnique } } as any, reflector);

  const context = (
    user: Record<string, unknown> | undefined,
    params: Record<string, string> = { projectId: 'project-1' },
  ) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    findUnique.mockResolvedValue({
      id: 'project-1',
      clientId: 'client-1',
      designerId: 'designer-1',
    });
  });

  it('allows public routes without an authenticated user', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    await expect(guard.canActivate(context(undefined))).resolves.toBe(true);
  });

  it.each([
    ['missing user', undefined],
    ['missing application roles', { id: 'user-1', sub: 'user-1' }],
    ['unknown application role', { id: 'user-1', sub: 'user-1', roles: ['owner'] }],
    ['mixed known and unknown roles', { id: 'user-1', sub: 'user-1', roles: ['admin', 'owner'] }],
    ['missing id and sub', { roles: ['admin'] }],
    ['mismatched id and sub', { id: 'user-1', sub: 'user-2', roles: ['admin'] }],
  ])('default-denies %s', async (_case, user) => {
    await expect(guard.canActivate(context(user))).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('default-denies routes without an object scope', async () => {
    const user = { id: 'admin-1', sub: 'admin-1', roles: ['admin'] };
    await expect(guard.canActivate(context(user, {}))).rejects.toThrow('Project scope is required');
  });

  it.each([
    ['id', { id: 'admin-1', roles: ['admin'] }],
    ['sub', { sub: 'admin-1', roles: ['admin'] }],
  ])('allows an app_metadata admin using %s identity', async (_case, user) => {
    await expect(guard.canActivate(context(user))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['designer by id', { id: 'designer-1', roles: ['designer'] }],
    ['designer by sub', { sub: 'designer-1', roles: ['designer'] }],
    ['client by id', { id: 'client-1', roles: ['client'] }],
    ['client by sub', { sub: 'client-1', roles: ['client'] }],
  ])('allows the assigned %s', async (_case, user) => {
    await expect(guard.canActivate(context(user))).resolves.toBe(true);
  });

  it.each([
    ['other designer', { id: 'designer-2', sub: 'designer-2', roles: ['designer'] }],
    ['other client', { id: 'client-2', sub: 'client-2', roles: ['client'] }],
    [
      'contractor without a project ownership relation',
      { id: 'contractor-1', roles: ['contractor'] },
    ],
  ])('denies %s', async (_case, user) => {
    await expect(guard.canActivate(context(user))).rejects.toThrow(
      'You do not have access to this project',
    );
  });

  it('returns not found for a missing project without broadening access', async () => {
    findUnique.mockResolvedValue(null);
    const user = { id: 'designer-1', sub: 'designer-1', roles: ['designer'] };
    await expect(guard.canActivate(context(user))).rejects.toBeInstanceOf(NotFoundException);
  });
});
