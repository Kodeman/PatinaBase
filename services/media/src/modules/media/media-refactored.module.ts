/**
 * Media Module (Refactored)
 * Configures dependency injection for clean architecture
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaClient } from '../../generated/prisma-client';

// Modules
import { ThreeDModule } from '../3d/3d.module';

// Domain Layer
import { MediaValidator } from '../../domain/validators/media.validator';
import { MediaMetadataExtractorService } from '../../domain/services/media-metadata-extractor.service';
import { MEDIA_REPOSITORY } from '../../domain/repositories/media.repository.interface';

// Infrastructure Layer
import { PrismaMediaRepository } from '../../infrastructure/repositories/prisma-media.repository';

// Application Layer
import { MediaUploadService } from '../../application/services/media-upload.service';
import { MediaTransformationService } from '../../application/services/media-transformation.service';
import { MediaStorageService } from '../../application/services/media-storage.service';

// Presentation Layer
import { MediaRefactoredService } from './media-refactored.service';

// Legacy Services (still needed for some operations)
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
    // Import 3D module
    ThreeDModule,
  ],
  controllers: [MediaController],
  providers: [
    // Prisma Client
    {
      provide: PrismaClient,
      useFactory: () => {
        const prisma = new PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        });
        return prisma;
      },
    },

    // Domain Layer - Validators and Domain Services
    MediaValidator,
    MediaMetadataExtractorService,

    // Infrastructure Layer - Repository Implementation
    {
      provide: MEDIA_REPOSITORY,
      useClass: PrismaMediaRepository,
    },

    // Application Layer - Use Case Services
    MediaUploadService,
    MediaTransformationService,
    MediaStorageService,

    // Presentation Layer - Facade Service
    MediaRefactoredService,

    // Legacy Services (to be migrated incrementally)
    OCIStorageService,
    UploadService,
    MetadataExtractionService,
    ImageTransformService,
    VirusScannerService,

    // Guards & Interceptors
    MediaAccessGuard,
    MediaSecurityInterceptor,
  ],
  exports: [
    MediaRefactoredService,
    MediaValidator,
    MEDIA_REPOSITORY,
    MediaUploadService,
    MediaTransformationService,
    MediaStorageService,
  ],
})
export class MediaRefactoredModule {}
