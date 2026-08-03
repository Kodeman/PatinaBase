import {
  BadGatewayException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BackgroundRemovalConfig } from './background-removal.config';
import {
  BackgroundRemovalIdempotencyConflictError,
  BackgroundRemovalQuotaExceededError,
  BackgroundRemovalSourceError,
  BackgroundRemovalStorageError,
  BackgroundRemovalVendorError,
} from './background-removal.errors';
import { BackgroundRemovalLedgerService } from './background-removal-ledger.service';
import {
  BACKGROUND_REMOVAL_VENDOR,
  BackgroundRemovalFailureOutcome,
  BackgroundRemovalVendor,
  ValidatedImage,
} from './background-removal.types';
import { ImagePayloadValidatorService } from './image-payload-validator.service';
import { SafeExternalImageFetcherService } from './safe-external-image-fetcher.service';
import { SupabaseBoardAccessService } from './supabase-board-access.service';
import { SupabaseBoardStorageService } from './supabase-board-storage.service';

@Injectable()
export class BackgroundRemovalService {
  constructor(
    private readonly access: SupabaseBoardAccessService,
    private readonly ledger: BackgroundRemovalLedgerService,
    private readonly storage: SupabaseBoardStorageService,
    private readonly externalImages: SafeExternalImageFetcherService,
    private readonly validator: ImagePayloadValidatorService,
    private readonly policy: BackgroundRemovalConfig,
    @Inject(BACKGROUND_REMOVAL_VENDOR)
    private readonly vendor: BackgroundRemovalVendor,
  ) {}

  async capability(userJwt: string, boardId: string) {
    const board = await this.access.authorizeBoard(userJwt, boardId);
    const quota = await this.ledger.getQuota(board.quotaOwnerId);
    if (!this.vendor.isConfigured()) {
      return {
        available: false,
        code: 'background_removal_not_configured',
        quota,
      };
    }
    return { available: true, quota };
  }

  async removeBackground(
    userJwt: string,
    requestedBy: string,
    boardId: string,
    itemId: string,
    idempotencyKey: string,
  ) {
    const context = await this.access.authorizeBoardItem(userJwt, boardId, itemId);
    if (!this.vendor.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'background_removal_not_configured',
        message: 'Background removal is not configured.',
      });
    }

    let reservation;
    try {
      reservation = await this.ledger.reserve({
        quotaOwnerId: context.quotaOwnerId,
        studioId: context.studioId,
        requestedBy,
        boardId,
        itemId,
        idempotencyKey,
      });
    } catch (error) {
      if (error instanceof BackgroundRemovalQuotaExceededError) {
        throw new HttpException(
          {
            code: 'background_removal_limit_reached',
            message: 'Background removal limit reached.',
            scope: error.scope,
            limit: error.limit,
            resetAt: error.resetAt,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof BackgroundRemovalIdempotencyConflictError) {
        throw new ConflictException({
          code: 'background_removal_idempotency_conflict',
          message: 'That idempotency key was already used.',
        });
      }
      throw error;
    }

    if (reservation.kind === 'succeeded') {
      return {
        originalUrl: reservation.originalUrl,
        cutoutUrl: reservation.cutoutUrl,
        quota: reservation.quota,
        idempotentReplay: true,
      };
    }
    if (reservation.kind === 'in_progress') {
      throw new ConflictException({
        code: 'background_removal_in_progress',
        message: 'This background-removal request is already in progress.',
      });
    }
    if (reservation.kind === 'failed') {
      throw this.genericFailure();
    }

    const requestId = reservation.requestId;
    let chargedCredits = 0;
    let vendorCompleted = false;
    try {
      const source = await this.acquireSource(
        context.item.sourceUrl,
        context.owner.id,
        boardId,
        requestId,
      );
      const result = await this.vendor.removeBackground({
        bytes: source.image.bytes,
        mimeType: source.image.mimeType,
      });
      chargedCredits = result.creditsUsed;
      vendorCompleted = true;
      const cutout = await this.validator.validateVendorOutput(
        result.bytes,
        this.policy.maxSourceBytes,
      );
      const cutoutPath = `${context.owner.id}/boards/${boardId}/${requestId}-cutout.png`;
      const cutoutUrl = await this.storage.upload(cutoutPath, cutout, 'image/png');
      await this.ledger.markSucceeded(requestId, source.originalUrl, cutoutUrl, chargedCredits);
      return {
        originalUrl: source.originalUrl,
        cutoutUrl,
        quota: await this.ledger.getQuota(context.quotaOwnerId),
        idempotentReplay: false,
      };
    } catch (error) {
      const outcome = this.failureOutcome(error, vendorCompleted);
      await this.ledger.markFailed(requestId, outcome, vendorCompleted ? chargedCredits : 0);
      if (error instanceof BackgroundRemovalSourceError) {
        throw new UnprocessableEntityException({
          code: 'background_removal_source_unavailable',
          message: 'This image cannot be processed.',
        });
      }
      throw this.genericFailure();
    }
  }

  private async acquireSource(
    sourceUrl: string,
    ownerId: string,
    boardId: string,
    requestId: string,
  ): Promise<{ image: ValidatedImage; originalUrl: string }> {
    const canonicalPath = this.storage.parseCanonicalPublicUrl(sourceUrl);
    if (canonicalPath) {
      const source = await this.storage.readCanonicalPublicUrl(sourceUrl);
      const image = await this.validator.validateSource(
        source.bytes,
        this.policy.maxSourceBytes,
        source.declaredMime,
        false,
      );
      return { image, originalUrl: source.publicUrl };
    }

    const image = await this.externalImages.fetch(sourceUrl);
    const originalPath = `${ownerId}/boards/${boardId}/${requestId}-original.${image.extension}`;
    const originalUrl = await this.storage.upload(originalPath, image.bytes, image.mimeType);
    return { image, originalUrl };
  }

  private failureOutcome(
    error: unknown,
    vendorCompleted: boolean,
  ): BackgroundRemovalFailureOutcome {
    if (error instanceof BackgroundRemovalSourceError) return 'SOURCE_REJECTED';
    if (error instanceof BackgroundRemovalVendorError) return 'VENDOR_FAILED';
    if (error instanceof BackgroundRemovalStorageError) return 'STORAGE_FAILED';
    return vendorCompleted ? 'STORAGE_FAILED' : 'INTERNAL_FAILED';
  }

  private genericFailure(): BadGatewayException {
    return new BadGatewayException({
      code: 'background_removal_failed',
      message: 'Background removal failed. Try again later.',
    });
  }
}
