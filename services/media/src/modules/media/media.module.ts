import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
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

// Controllers
import { MediaController } from './media.controller';

// Guards & Interceptors
import { MediaAccessGuard } from './guards/media-access.guard';
import { MediaSecurityInterceptor } from './interceptors/security.interceptor';

@Module({
  imports: [
    // Register media processing queue
    BullModule.registerQueue({
      name: 'media-processing',
    }),
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

    // Guards & Interceptors
    MediaAccessGuard,
    MediaSecurityInterceptor,
  ],
  exports: [MediaService],
})
export class MediaModule {}
