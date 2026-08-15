import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@patina/auth';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
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
    const projectId = request.params.projectId || request.params.id;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const id = typeof user.id === 'string' && user.id.length > 0 ? user.id : undefined;
    const sub = typeof user.sub === 'string' && user.sub.length > 0 ? user.sub : undefined;
    if ((!id && !sub) || (id && sub && id !== sub)) {
      throw new ForbiddenException('Authenticated user identity is invalid');
    }
    const userId = id ?? sub;

    const roles = Array.isArray(user.roles)
      ? user.roles.filter((role: unknown): role is string => typeof role === 'string')
      : [];
    const knownRoles = new Set(['admin', 'designer', 'client', 'contractor']);
    if (roles.length === 0 || roles.some((role: string) => !knownRoles.has(role))) {
      throw new ForbiddenException('Authenticated user has no recognized application role');
    }

    if (!projectId) {
      throw new ForbiddenException('Project scope is required');
    }

    if (roles.includes('admin')) {
      return true;
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, designerId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (
      (roles.includes('designer') && project.designerId === userId) ||
      (roles.includes('client') && project.clientId === userId)
    ) {
      return true;
    }

    throw new ForbiddenException('You do not have access to this project');
  }
}
