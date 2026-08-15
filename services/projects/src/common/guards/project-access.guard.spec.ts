import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@patina/auth';
import {
  PROJECT_ACCESS_MODE_KEY,
  PROJECT_ENTITY_KEY,
} from '../decorators/project-authorization.decorator';
import { ProjectAccessGuard } from './project-access.guard';

describe('ProjectAccessGuard', () => {
  const authorization = {
    assertProjectAccess: jest.fn(),
    assertChangeOrderAccess: jest.fn(),
  };
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new ProjectAccessGuard(authorization as any, reflector);

  const request = (user?: Record<string, unknown>, params = { projectId: 'project-1' }) => ({
    user,
    params,
  });
  const context = (httpRequest: ReturnType<typeof request>) =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => httpRequest }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    authorization.assertProjectAccess.mockResolvedValue('project-1');
    authorization.assertChangeOrderAccess.mockResolvedValue('project-1');
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PROJECT_ACCESS_MODE_KEY) return 'read';
      if (key === PROJECT_ENTITY_KEY) return undefined;
      return undefined;
    });
  });

  it('retains the explicit public exception without resolving authorization', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );

    await expect(guard.canActivate(context(request()))).resolves.toBe(true);
    expect(authorization.assertProjectAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['missing identity', undefined],
    ['missing sub', { id: 'actor', userId: 'actor' }],
    ['mismatched id', { sub: 'actor', id: 'other', userId: 'actor' }],
    ['mismatched userId', { sub: 'actor', id: 'actor', userId: 'other' }],
  ])('returns 401 for %s', async (_case, user) => {
    await expect(guard.canActivate(context(request(user)))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authorization.assertProjectAccess).not.toHaveBeenCalled();
  });

  it('uses only the verified subject and ignores stale JWT authorization metadata', async () => {
    const httpRequest = request({
      sub: 'actor',
      id: 'actor',
      userId: 'actor',
      role: 'super_admin',
      roles: ['super_admin'],
      permissions: ['project.admin.all'],
    });

    await expect(guard.canActivate(context(httpRequest))).resolves.toBe(true);
    expect(authorization.assertProjectAccess).toHaveBeenCalledWith('actor', 'project-1', 'read');
    expect(httpRequest).toHaveProperty('authorizedProjectId', 'project-1');
  });

  it('uses manage scope from route metadata', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PROJECT_ACCESS_MODE_KEY) return 'manage';
      return undefined;
    });

    await guard.canActivate(context(request({ sub: 'actor', id: 'actor', userId: 'actor' })));
    expect(authorization.assertProjectAccess).toHaveBeenCalledWith('actor', 'project-1', 'manage');
  });

  it('resolves a standalone change order to its authoritative project', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PROJECT_ACCESS_MODE_KEY) return 'read';
      if (key === PROJECT_ENTITY_KEY) return { type: 'changeOrder', param: 'id' };
      return undefined;
    });
    const httpRequest = request({ sub: 'actor', id: 'actor', userId: 'actor' }, {
      id: 'change-order-1',
    } as any);

    await guard.canActivate(context(httpRequest));
    expect(authorization.assertChangeOrderAccess).toHaveBeenCalledWith(
      'actor',
      'change-order-1',
      'read',
    );
    expect(httpRequest).toHaveProperty('authorizedProjectId', 'project-1');
  });

  it('fails closed with 403 when a protected route has no authorization contract', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? false : undefined,
    );

    await expect(
      guard.canActivate(context(request({ sub: 'actor', id: 'actor', userId: 'actor' }))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('preserves non-enumerating 404 failures from the resolver', async () => {
    authorization.assertProjectAccess.mockRejectedValue(new NotFoundException('Project not found'));

    await expect(
      guard.canActivate(context(request({ sub: 'actor', id: 'actor', userId: 'actor' }))),
    ).rejects.toMatchObject({ status: 404, message: 'Project not found' });
  });
});
