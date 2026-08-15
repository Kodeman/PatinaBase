import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@patina/auth';

/**
 * Health Check Controller
 *
 * Provides health check endpoints for monitoring and load balancers.
 * These endpoints are public (no authentication required).
 */
@ApiTags('health')
@Controller()
export class HealthController {
  /**
   * Basic health check
   * Used by load balancers and monitoring systems
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  healthCheck() {
    return {
      status: 'ok',
      service: 'projects',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Kubernetes liveness probe
   */
  @Public()
  @Get('healthz')
  @ApiOperation({ summary: 'Kubernetes liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Kubernetes readiness probe
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Kubernetes readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  readiness() {
    // In production, you might want to check database connectivity here
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Build version info supplied by the active Container deployment environment.
   * Served at /v1/version (global prefix applies).
   */
  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Build version info' })
  @ApiResponse({ status: 200, description: 'Build version info' })
  version() {
    return {
      service: process.env.SERVICE_NAME ?? 'projects',
      version: process.env.APP_VERSION ?? '0.0.0',
      gitSha: process.env.BUILD_SHA ?? 'unknown',
      buildTime: process.env.BUILD_TIME ?? null,
    };
  }
}
