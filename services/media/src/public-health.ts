import { INestApplication } from '@nestjs/common';

export function registerPublicHealth(app: INestApplication): void {
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'media',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });
}
