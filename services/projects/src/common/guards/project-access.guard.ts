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
    // Check if endpoint is marked as @Public()
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

    if (!projectId) {
      // No project ID in route, allow (handled by roles guard)
      return true;
    }

    // Admins have access to all projects
    if (user.role === 'admin') {
      return true;
    }

    // Check if user has access to this project
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, designerId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Designer must be assigned to project
    if (user.role === 'designer' && project.designerId !== user.id) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Client must be the project client
    if (user.role === 'client' && project.clientId !== user.id) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Contractor access can be checked here (future)
    // if (user.role === 'contractor') { ... }

    return true;
  }
}
