import { Module } from '@nestjs/common';

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
import { MediaSecurityInterceptor } from './interceptors/security.interceptor';

@Module({
  imports: [
    // Import 3D module for Model3DService and ThreeDProcessingService
    ThreeDModule,
  ],
  controllers: [MediaController],
  providers: [
    // Core services
    MediaService,
    OCIStorageService,
    UploadService,
    MetadataExtractionService,
    ImageTransformService,
    VirusScannerService,
    JobQueueService,

    // Guards & Interceptors
    MediaSecurityInterceptor,
  ],
  exports: [MediaService],
})
export class MediaModule {}
