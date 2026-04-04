/**
 * Storage Module
 * Integrates multi-provider storage and CDN services
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OCIStorageService } from './oci-storage.service';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { R2StorageProvider } from './providers/r2-storage.provider';
import { MultiStorageService } from './multi-storage.service';
import { CloudFrontCDNProvider } from './cdn/cloudfront-cdn.provider';
import { CloudflareCDNProvider } from './cdn/cloudflare-cdn.provider';
import { CDNManagerService } from './cdn/cdn-manager.service';

@Module({
  imports: [ConfigModule],
  providers: [
    OCIStorageService,
    S3StorageProvider,
    R2StorageProvider,
    MultiStorageService,
    CloudFrontCDNProvider,
    CloudflareCDNProvider,
    CDNManagerService,
  ],
  exports: [
    OCIStorageService,
    S3StorageProvider,
    R2StorageProvider,
    MultiStorageService,
    CDNManagerService,
  ],
})
export class StorageModule {}
