export const BACKGROUND_REMOVAL_VENDOR = Symbol('BACKGROUND_REMOVAL_VENDOR');
export const BACKGROUND_REMOVAL_CLOCK = Symbol('BACKGROUND_REMOVAL_CLOCK');
export const BACKGROUND_REMOVAL_DNS = Symbol('BACKGROUND_REMOVAL_DNS');
export const BACKGROUND_REMOVAL_HTTPS_TRANSPORT = Symbol('BACKGROUND_REMOVAL_HTTPS_TRANSPORT');

export type BoardOwnerKind = 'proposal' | 'project';

export interface AuthorizedBoardContext {
  boardId: string;
  owner: { kind: BoardOwnerKind; id: string };
  designerId: string;
  studioId: string | null;
  /** Studio UUID, or the designer UUID for legacy solo accounts without one. */
  quotaOwnerId: string;
}

export interface AuthorizedBoardItemContext extends AuthorizedBoardContext {
  item: {
    id: string;
    boardId: string;
    type: 'image' | 'product' | 'capture';
    sourceUrl: string;
  };
}

export interface QuotaWindow {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

export interface BackgroundRemovalQuota {
  studioMonthly: QuotaWindow;
  globalDaily: QuotaWindow;
}

export interface BackgroundRemovalVendorInput {
  bytes: Buffer;
  mimeType: string;
}

export interface BackgroundRemovalVendorResult {
  bytes: Buffer;
  mimeType: 'image/png';
  creditsUsed: number;
}

export interface BackgroundRemovalVendor {
  isConfigured(): boolean;
  removeBackground(input: BackgroundRemovalVendorInput): Promise<BackgroundRemovalVendorResult>;
}

export interface ValidatedImage {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  extension: 'jpg' | 'png' | 'webp' | 'avif';
}

export interface DnsAddress {
  address: string;
  family: 4 | 6;
}

export interface BackgroundRemovalDns {
  lookup(hostname: string): Promise<DnsAddress[]>;
}

export interface HttpsTransportResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
}

export interface BackgroundRemovalHttpsTransport {
  get(
    url: URL,
    addresses: DnsAddress[],
    options: { timeoutMs: number; maxBytes: number },
  ): Promise<HttpsTransportResponse>;
}

export interface ReservationTarget {
  quotaOwnerId: string;
  studioId: string | null;
  requestedBy: string;
  boardId: string;
  itemId: string;
  idempotencyKey: string;
}

export type ReservationResult =
  | {
      kind: 'reserved';
      requestId: string;
      quota: BackgroundRemovalQuota;
    }
  | {
      kind: 'succeeded';
      requestId: string;
      originalUrl: string;
      cutoutUrl: string;
      quota: BackgroundRemovalQuota;
    }
  | { kind: 'in_progress'; reason: 'same_request' | 'active_target' }
  | { kind: 'failed' };

export type BackgroundRemovalFailureOutcome =
  | 'SOURCE_REJECTED'
  | 'VENDOR_FAILED'
  | 'STORAGE_FAILED'
  | 'INTERNAL_FAILED';
