import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_GUARD } from '@nestjs/core';
import { HybridAuthGuard, PermissionsGuard } from '@patina/auth';
import { join } from 'path';
import { PrismaClient } from './generated/prisma-client';

// Modules
import { MediaModule } from './modules/media/media.module';
import { SearchModule } from './modules/search/search.module';
import { ThreeDModule } from './modules/3d/3d.module';

// Controllers
import { UploadController } from './modules/upload/upload.controller';
import { AssetsController } from './modules/assets/assets.controller';
import { JobsController } from './modules/jobs/jobs.controller';

// Services
import { OCIStorageService } from './modules/storage/oci-storage.service';
import { UploadService } from './modules/upload/upload.service';
import { MetadataExtractionService } from './modules/assets/metadata-extraction.service';
import { AssetsService } from './modules/assets/assets.service';
import { ImageTransformService } from './modules/transform/image-transform.service';
import { JobQueueService } from './modules/jobs/job-queue.service';
import { BulkOperationsProcessor } from './modules/jobs/bulk-operations.processor';
import { VirusScannerService } from './modules/security/virus-scanner.service';
import { CDNManagerService } from './modules/storage/cdn/cdn-manager.service';
import { CloudFrontCDNProvider } from './modules/storage/cdn/cloudfront-cdn.provider';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '../.env.local'), join(__dirname, '../.env')],
    }),

    // Prometheus metrics
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),

    // Event emitter for internal events
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 10,
    }),

    // BullMQ for job queues
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
    }),

    // Feature modules
    MediaModule,
    SearchModule,
    ThreeDModule,
  ],
  controllers: [UploadController, AssetsController, JobsController],
  providers: [
    // Prisma
    {
      provide: PrismaClient,
      useFactory: () => {
        const prisma = new PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        });
        return prisma;
      },
    },

    // Services
    OCIStorageService,
    UploadService,
    MetadataExtractionService,
    AssetsService,
    ImageTransformService,
    JobQueueService,
    BulkOperationsProcessor,
    VirusScannerService,
    CDNManagerService,
    CloudFrontCDNProvider,

    // Global Authentication Guard — Supabase JWT validation
    {
      provide: APP_GUARD,
      useClass: HybridAuthGuard,
    },
    // Global Permissions Guard (RBAC enforcement)
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
