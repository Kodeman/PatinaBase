/**
 * Metrics Controller
 *
 * Exposes Prometheus metrics endpoint
 */

import { Controller, Get, Header } from '@nestjs/common';
import { register } from 'prom-client';
import { ProjectAdmin } from './decorators/project-authorization.decorator';

@Controller('metrics')
@ProjectAdmin()
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  @Get('json')
  async getMetricsJSON(): Promise<any> {
    return register.getMetricsAsJSON();
  }
}
