export class BackgroundRemovalSourceError extends Error {
  constructor() {
    super('Background removal source is unavailable');
    this.name = 'BackgroundRemovalSourceError';
  }
}

export class BackgroundRemovalVendorError extends Error {
  constructor() {
    super('Background removal vendor request failed');
    this.name = 'BackgroundRemovalVendorError';
  }
}

export class BackgroundRemovalStorageError extends Error {
  constructor() {
    super('Background removal storage request failed');
    this.name = 'BackgroundRemovalStorageError';
  }
}

export class BackgroundRemovalQuotaExceededError extends Error {
  constructor(
    readonly scope: 'studio_monthly' | 'global_daily',
    readonly limit: number,
    readonly resetAt: string,
  ) {
    super('Background removal quota exceeded');
    this.name = 'BackgroundRemovalQuotaExceededError';
  }
}

export class BackgroundRemovalIdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key target mismatch');
    this.name = 'BackgroundRemovalIdempotencyConflictError';
  }
}
