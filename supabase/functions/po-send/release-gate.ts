// C-32 (SQ-430): po-send refuses a PO that waits for an owner or admin.
//
// po_is_sendable (00710) is read AS THE CALLER before any side effect: false
// when the PO is held_for_release, or when the studio's release gate applies
// and no release covers the paper's total. A PO already sent stays sendable
// (a resend). Preview stays open so a held paper can still be read.
// guard_purchase_order_release refuses the sent_at stamp regardless; this
// answer is the clean 409 the portal reads, before the email goes out.

import type { PoSendMode } from './lib.ts';

export interface ReleaseRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export const HELD_FOR_RELEASE_DETAIL =
  'This order waits for an owner or admin to release it before it goes to the vendor.';

export type PoReleaseGate =
  | { ok: true }
  | {
    ok: false;
    status: 409 | 500;
    error: 'held_for_release' | 'release_check_failed';
    detail: string;
  };

export async function checkPoReleaseGate(
  client: ReleaseRpcClient,
  purchaseOrderId: string,
  mode: PoSendMode,
): Promise<PoReleaseGate> {
  if (mode !== 'send' && mode !== 'mark_sent') return { ok: true };
  const { data, error } = await client.rpc('po_is_sendable', { p_po_id: purchaseOrderId });
  if (error) {
    return {
      ok: false,
      status: 500,
      error: 'release_check_failed',
      detail: 'Could not check whether this order waits for a release.',
    };
  }
  if (data !== true) {
    return { ok: false, status: 409, error: 'held_for_release', detail: HELD_FOR_RELEASE_DETAIL };
  }
  return { ok: true };
}
