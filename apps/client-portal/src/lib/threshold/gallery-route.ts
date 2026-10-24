import type { CheckoutReturn } from './checkout-return';

export type GalleryRoute =
  | { kind: 'asks'; anchor: string; receipt: boolean }
  | { kind: 'scroll'; anchor: string }
  | { kind: 'menu' }
  | { kind: 'plan' }
  | { kind: 'documents' }
  | { kind: 'page' };

const INDEX_ROUTES = new Map<string, GalleryRoute>([
  ['menu', { kind: 'menu' }],
  ['key', { kind: 'plan' }],
  ['mat-papers', { kind: 'documents' }],
]);

function readAnchor(hash: string): string | null {
  try {
    return decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return null;
  }
}

function isAskAnchor(anchor: string): boolean {
  return ['doorstep', 'ledger', 'letterbox', 'approvals', 'door', 'wall'].includes(anchor)
    || /^(approval-|door-|wall-|review-|scope-change-|invoice-)/.test(anchor);
}

function isReceiptAnchor(anchor: string, returned: CheckoutReturn | null): boolean {
  return returned !== null && ['road', 'letterbox'].includes(anchor);
}

/** Permanent mail and till addresses, resolved without changing any URL producer. */
export function galleryRoute(hash: string, returned: CheckoutReturn | null = null): GalleryRoute {
  const anchor = readAnchor(hash);
  if (!anchor) return { kind: 'page' };
  if (isReceiptAnchor(anchor, returned)) return { kind: 'asks', anchor: 'letterbox', receipt: true };
  if (isAskAnchor(anchor)) return { kind: 'asks', anchor, receipt: false };
  return INDEX_ROUTES.get(anchor) ?? { kind: 'scroll', anchor };
}
