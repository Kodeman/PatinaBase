import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@patina/auth';

/**
 * Build version info — stamped into the image at build time
 * (GIT_SHA / BUILD_TIME / APP_VERSION via infra/build-and-push.sh).
 * Public so the admin portal can fan out to it without auth.
 * Served at /v1/version (global prefix applies).
 */
@ApiTags('version')
@Controller('version')
@Public()
export class VersionController {
  @Get()
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
