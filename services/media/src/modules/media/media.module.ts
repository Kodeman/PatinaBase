import { Module } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';

// Modules
import { ThreeDModule } from '../3d/3d.module';

// Services
import { MediaService } from './media.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import { UploadService } from '../upload/upload.service';
import { MetadataExtractionService } from '../assets/metadata-extraction.service';
import { ImageTransformService } from '../transform/image-transform.service';
import { VirusScannerService } from '../security/virus-scanner.service';
import { JobQueueService } from '../jobs/job-queue.service';

// Controllers
import { MediaController } from './media.controller';

// Guards & Interceptors
import { MediaAccessGuard } from './guards/media-access.guard';
import { MediaSecurityInterceptor } from './interceptors/security.interceptor';

@Module({
  imports: [
    // Import 3D module for Model3DService and ThreeDProcessingService
    ThreeDModule,
  ],
  controllers: [MediaController],
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

    // Core services
    MediaService,
    OCIStorageService,
    UploadService,
    MetadataExtractionService,
    ImageTransformService,
    VirusScannerService,
    // JobQueueService.addJob() is how processMedia() reaches the Cloudflare
    // Queues pipeline (infra/media-worker) — see job-queue.service.ts. This
    // module gets its own instance (mirrors the module's own PrismaClient
    // factory above); it's a thin, stateless wrapper so that's harmless.
    JobQueueService,

    // Guards & Interceptors
    MediaAccessGuard,
    MediaSecurityInterceptor,
  ],
  exports: [MediaService],
})
export class MediaModule {}
