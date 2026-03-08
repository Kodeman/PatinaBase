import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImageTransformService } from './image-transform.service';
import { ImageOptimizationService } from './image-optimization.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { SmartCropService } from './smart-crop.service';
import { ImageAnalysisService } from './image-analysis.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import { PrismaClient } from '../../generated/prisma-client';

@Module({
  imports: [ConfigModule],
  providers: [
    ImageTransformService,
    ImageOptimizationService,
    DuplicateDetectionService,
    SmartCropService,
    ImageAnalysisService,
    OCIStorageService,
    PrismaClient,
  ],
  exports: [
    ImageTransformService,
    ImageOptimizationService,
    DuplicateDetectionService,
    SmartCropService,
    ImageAnalysisService,
  ],
})
export class TransformModule {}
