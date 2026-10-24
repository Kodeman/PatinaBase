import type { CheckoutReturn } from './checkout-return';

export type GalleryRoute =
  | { kind: 'asks'; anchor: string; receipt: boolean }
  | { kind: 'scroll'; anchor: string }
  | { kind: 'menu' }
  | { kind: 'plan' }
  | { kind: 'documents' }
  | { kind: 'pieces'; roomId: string }
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
  return ['doorstep', 'ledger', 'letterbox', 'approvals', 'door', 'wall', 'budget-checkpoint'].includes(anchor)
    || /^(door-|wall-|review-|scope-change-|invoice-)/.test(anchor);
}

function isReceiptAnchor(anchor: string, returned: CheckoutReturn | null): boolean {
  return returned !== null && ['road', 'letterbox'].includes(anchor);
}

/** Permanent mail and till addresses, resolved without changing any URL producer. */
export function galleryRoute(hash: string, returned: CheckoutReturn | null = null, openApprovalIds: readonly string[] | null = null): GalleryRoute {
  const anchor = readAnchor(hash);
  if (!anchor) return { kind: 'page' };
  if (anchor.startsWith('pieces-')) return { kind: 'pieces', roomId: anchor.slice(7) };
  if (isReceiptAnchor(anchor, returned)) return { kind: 'asks', anchor: 'letterbox', receipt: true };
  return addressRoute(anchor, openApprovalIds);
}

function approvalRoute(anchor: string, openApprovalIds: readonly string[] | null): GalleryRoute {
  if (openApprovalIds === null) return { kind: 'page' };
  return openApprovalIds.includes(anchor.slice(9))
    ? { kind: 'asks', anchor, receipt: false } : { kind: 'scroll', anchor };
}

function addressRoute(anchor: string, openApprovalIds: readonly string[] | null): GalleryRoute {
  if (anchor.startsWith('approval-')) return approvalRoute(anchor, openApprovalIds);
  if (isAskAnchor(anchor)) return { kind: 'asks', anchor, receipt: false };
  return INDEX_ROUTES.get(anchor) ?? { kind: 'scroll', anchor };
}
