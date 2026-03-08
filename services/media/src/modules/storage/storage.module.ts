/**
 * Storage Module
 * Integrates multi-provider storage and CDN services
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OCIStorageService } from './oci-storage.service';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { MultiStorageService } from './multi-storage.service';
import { CloudFrontCDNProvider } from './cdn/cloudfront-cdn.provider';
import { CDNManagerService } from './cdn/cdn-manager.service';

@Module({
  imports: [ConfigModule],
  providers: [
    OCIStorageService,
    S3StorageProvider,
    MultiStorageService,
    CloudFrontCDNProvider,
    CDNManagerService,
  ],
  exports: [
    OCIStorageService,
    S3StorageProvider,
    MultiStorageService,
    CDNManagerService,
  ],
})
export class StorageModule {}
