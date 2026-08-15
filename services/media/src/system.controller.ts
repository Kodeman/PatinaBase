import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '@patina/auth';
import { MEDIA_ADMIN_PERMISSION } from './modules/authorization/media-authorization.constants';

@Controller()
export class SystemController {
  @Get('version')
  @RequirePermissions(MEDIA_ADMIN_PERMISSION)
  version() {
    return {
      service: process.env.SERVICE_NAME ?? 'media',
      version: process.env.APP_VERSION ?? '0.0.0',
      gitSha: process.env.BUILD_SHA ?? 'unknown',
      buildTime: process.env.BUILD_TIME ?? null,
    };
  }
}
