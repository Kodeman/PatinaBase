import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '../../../generated/prisma-client';

/**
 * Guard to check media asset access permissions
 */
@Injectable()
export class MediaAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const assetId = request.params.id;

    if (!assetId) {
      return true; // No asset ID, proceed to controller
    }

    // Get asset
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      return true; // Asset not found, let controller handle 404
    }

    // If public, allow access
    if (asset.isPublic) {
      return true;
    }

    // If no user, deny access to private assets
    if (!user) {
      throw new ForbiddenException('Authentication required to access this asset');
    }

    // Check if user is the uploader
    if (asset.uploadedBy === user.id) {
      return true;
    }

    // Check permissions if defined
    if (asset.permissions) {
      const permissions = asset.permissions as any;

      // Check if user is in allowed users list
      if (permissions.users && permissions.users.includes(user.id)) {
        return true;
      }

      // Check if user has any of the allowed roles
      if (permissions.roles && user.roles) {
        const hasRole = user.roles.some((role: string) => permissions.roles.includes(role));
        if (hasRole) {
          return true;
        }
      }
    }

    // Admin users always have access
    if (user.roles && user.roles.includes('admin')) {
      return true;
    }

    throw new ForbiddenException('You do not have permission to access this asset');
  }
}
