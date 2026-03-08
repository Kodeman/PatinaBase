import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@patina/auth';
import { PrismaClient } from '../../generated/prisma-client';

@ApiTags('health')
@Controller('health')
@Public() // Health endpoints don't require authentication
export class HealthController {
  constructor(private prisma: PrismaClient) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'orders',
        database: 'connected',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'orders',
        database: 'disconnected',
      };
    }
  }
}
