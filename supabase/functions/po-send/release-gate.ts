// C-32 (SQ-430): po-send refuses a PO that waits for an owner or admin.
//
// po_is_sendable (00710) is read AS THE CALLER before any side effect: false
// when the PO is held_for_release, or when the studio's release gate applies
// and no release covers the paper's total. A PO already sent stays sendable
// (a resend). Preview stays open so a held paper can still be read: it asks,
// never refuses, and carries the answer as `sendable` so a held preview
// renders as a draft (R6). A failed check previews as not sendable.
// guard_purchase_order_release refuses the sent_at stamp regardless; this
// answer is the clean 409 the portal reads, before the email goes out.
//
// R1 F2 (00723): a resend has no stamp for the guard to refuse, so on a PO
// already sent the gate also asks assert_po_resend_cleared. A gated order
// whose paper changed after its release is refused 409 changed_since_release.

import type { PoSendMode } from './lib.ts';

export interface ReleaseRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export const HELD_FOR_RELEASE_DETAIL =
  'This order waits for an owner or admin to release it before it goes to the vendor.';

export const CHANGED_SINCE_RELEASE_DETAIL =
  'This order changed after it was sent. Open a change order to send the maker a revision.';

const RELEASE_CHECK_FAILED_DETAIL = 'Could not check whether this order waits for a release.';

export type PoReleaseGate =
  | { ok: true; sendable: boolean }
  | {
    ok: false;
    status: 409 | 500;
    error: 'held_for_release' | 'changed_since_release' | 'release_check_failed';
    detail: string;
  };

export async function checkPoReleaseGate(
  client: ReleaseRpcClient,
  purchaseOrderId: string,
  mode: PoSendMode,
  resend = false,
): Promise<PoReleaseGate> {
  const { data, error } = await client.rpc('po_is_sendable', { p_po_id: purchaseOrderId });
  if (mode === 'preview') return { ok: true, sendable: !error && data === true };
  if (error) {
    return { ok: false, status: 500, error: 'release_check_failed', detail: RELEASE_CHECK_FAILED_DETAIL };
  }
  if (data !== true) {
    return { ok: false, status: 409, error: 'held_for_release', detail: HELD_FOR_RELEASE_DETAIL };
  }
  if (resend) {
    const { error: resendError } = await client.rpc('assert_po_resend_cleared', {
      p_po_id: purchaseOrderId,
    });
    if (resendError) {
      const message = (resendError as { message?: unknown }).message;
      return typeof message === 'string' && message.includes('changed_since_release')
        ? { ok: false, status: 409, error: 'changed_since_release', detail: CHANGED_SINCE_RELEASE_DETAIL }
        : { ok: false, status: 500, error: 'release_check_failed', detail: RELEASE_CHECK_FAILED_DETAIL };
    }
  }
  return { ok: true, sendable: true };
}

// SQ-448 (R2): the gate is read again right before the email, but a hold can
// still land between that read and the sent_at stamp, and the guard then
// refuses the stamp. The vendor has the order; the paper must not read sent.
// The code avoids 'held_for_release' so the portal never says it did not go.
export const SENT_NOT_RECORDED_EMAILED_DETAIL =
  'The email reached the vendor, but this order could not be marked sent ' +
  '(for example, it is now held for release). Check the order before sending it again.';
export const SENT_NOT_RECORDED_DETAIL =
  'This order could not be marked sent (for example, it is now held for release).';

export function sentStampFailure(
  stampError: unknown,
  emailSent: boolean,
): {
  status: 409 | 500;
  body: { error: 'sent_not_recorded'; detail: string; emailSent: boolean };
} {
  const message = (stampError as { message?: unknown } | null)?.message;
  const held = typeof message === 'string' && message.includes('held_for_release');
  return {
    status: held ? 409 : 500,
    body: {
      error: 'sent_not_recorded',
      detail: emailSent ? SENT_NOT_RECORDED_EMAILED_DETAIL : SENT_NOT_RECORDED_DETAIL,
      emailSent,
    },
  };
}
