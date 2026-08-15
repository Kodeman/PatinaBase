import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireAnyPermission } from '@patina/auth';
import { ORDER_PERMISSIONS } from '../../common/authorization/orders-authorization.resolver';

/**
 * Build version info supplied by the active Container deployment environment.
 * Served at /v1/version (global prefix applies).
 */
@ApiTags('version')
@Controller('version')
export class VersionController {
  @Get()
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Build version info' })
  version() {
    return {
      service: process.env.SERVICE_NAME ?? 'orders',
      version: process.env.APP_VERSION ?? '0.0.0',
      gitSha: process.env.BUILD_SHA ?? 'unknown',
      buildTime: process.env.BUILD_TIME ?? null,
    };
  }
}
