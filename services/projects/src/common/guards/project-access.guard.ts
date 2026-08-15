import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@patina/auth';
import { ProjectsAuthorizationResolver } from '../authorization/projects-authorization.resolver';
import {
  PROJECT_ACCESS_MODE_KEY,
  PROJECT_ENTITY_KEY,
  type ProjectEntityScope,
} from '../decorators/project-authorization.decorator';

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private authorization: ProjectsAuthorizationResolver,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || typeof user.sub !== 'string' || user.id !== user.sub || user.userId !== user.sub) {
      throw new UnauthorizedException('Authentication required');
    }

    const mode = this.reflector.getAllAndOverride<'read' | 'manage'>(PROJECT_ACCESS_MODE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!mode) {
      throw new ForbiddenException('Project authorization contract is missing');
    }

    const entity = this.reflector.getAllAndOverride<ProjectEntityScope>(PROJECT_ENTITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const params = request.params ?? {};
    let projectId: string;
    if (entity?.type === 'changeOrder') {
      if (typeof params[entity.param] !== 'string') {
        throw new NotFoundException('Project not found');
      }
      projectId = await this.authorization.assertChangeOrderAccess(
        user.sub,
        params[entity.param],
        mode,
      );
    } else {
      const requestedProjectId = params.projectId ?? params.id;
      if (typeof requestedProjectId !== 'string') {
        throw new NotFoundException('Project not found');
      }
      projectId = await this.authorization.assertProjectAccess(user.sub, requestedProjectId, mode);
    }

    request.authorizedProjectId = projectId;
    return true;
  }
}
