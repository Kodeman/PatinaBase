import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaClient } from '../../generated/prisma-client';
import { BackgroundRemovalConfig } from './background-removal.config';
import { BackgroundRemovalController } from './background-removal.controller';
import { BackgroundRemovalLedgerService } from './background-removal-ledger.service';
import { BackgroundRemovalService } from './background-removal.service';
import {
  BACKGROUND_REMOVAL_CLOCK,
  BACKGROUND_REMOVAL_DNS,
  BACKGROUND_REMOVAL_HTTPS_TRANSPORT,
  BACKGROUND_REMOVAL_VENDOR,
} from './background-removal.types';
import { ImagePayloadValidatorService } from './image-payload-validator.service';
import { RemoveBgAdapter } from './remove-bg.adapter';
import {
  NodeBackgroundRemovalDns,
  NodePinnedHttpsTransport,
  SafeExternalImageFetcherService,
} from './safe-external-image-fetcher.service';
import { SupabaseBoardAccessService } from './supabase-board-access.service';
import { SupabaseBoardStorageService } from './supabase-board-storage.service';

@Module({
  imports: [ConfigModule],
  controllers: [BackgroundRemovalController],
  providers: [
    {
      provide: PrismaClient,
      useFactory: () =>
        new PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        }),
    },
    { provide: BACKGROUND_REMOVAL_CLOCK, useValue: () => new Date() },
    { provide: BACKGROUND_REMOVAL_DNS, useClass: NodeBackgroundRemovalDns },
    {
      provide: BACKGROUND_REMOVAL_HTTPS_TRANSPORT,
      useClass: NodePinnedHttpsTransport,
    },
    RemoveBgAdapter,
    { provide: BACKGROUND_REMOVAL_VENDOR, useExisting: RemoveBgAdapter },
    BackgroundRemovalConfig,
    BackgroundRemovalLedgerService,
    BackgroundRemovalService,
    ImagePayloadValidatorService,
    SafeExternalImageFetcherService,
    SupabaseBoardAccessService,
    SupabaseBoardStorageService,
  ],
})
export class BackgroundRemovalModule {}
