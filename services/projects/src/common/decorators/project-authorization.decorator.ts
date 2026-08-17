import { applyDecorators, createParamDecorator, SetMetadata } from '@nestjs/common';
import { RequireAnyPermission } from '@patina/auth';
import type { ProjectAccessMode } from '../authorization/projects-authorization.resolver';

export const PROJECT_ACCESS_MODE_KEY = 'projects:access-mode';
export const PROJECT_ENTITY_KEY = 'projects:entity';

export interface ProjectEntityScope {
  type: 'changeOrder';
  param: string;
}

export const ProjectRead = () =>
  applyDecorators(
    RequireAnyPermission(
      'project.read.assigned',
      'project.manage.own',
      'project.read.org',
      'project.manage.org',
      'project.admin.all',
    ),
    SetMetadata(PROJECT_ACCESS_MODE_KEY, 'read' satisfies ProjectAccessMode),
  );

export const ProjectManage = () =>
  applyDecorators(
    RequireAnyPermission('project.manage.own', 'project.manage.org', 'project.admin.all'),
    SetMetadata(PROJECT_ACCESS_MODE_KEY, 'manage' satisfies ProjectAccessMode),
  );

export const ProjectAdmin = () =>
  applyDecorators(
    RequireAnyPermission('project.admin.all'),
    SetMetadata(PROJECT_ACCESS_MODE_KEY, 'manage' satisfies ProjectAccessMode),
  );

export const ProjectEntity = (type: ProjectEntityScope['type'], param = 'id') =>
  SetMetadata(PROJECT_ENTITY_KEY, { type, param } satisfies ProjectEntityScope);

export const AuthorizedProjectId = createParamDecorator((_data, context) => {
  return context.switchToHttp().getRequest().authorizedProjectId;
});
