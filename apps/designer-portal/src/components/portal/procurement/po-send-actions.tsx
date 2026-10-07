/**
 * PO send helpers shared by the one send surface, PoPreview
 * (components/document/po-preview.tsx), and the callers that mount it: the
 * Order Assistant's Created step, the line unfold and the Orders ledger. The
 * old PoSendActions / PoSendPopover buttons were retired in favor of
 * PoPreview (C-09).
 */

/**
 * Client-side best guess of the vendor recipient — mirrors the po-send edge
 * function's fallback chain (orders_email → contact_info->>'email') minus the
 * explicit override. Drives ONLY the disabled-state heuristic + label hint;
 * the server resolves the real recipient.
 */
export function clientVendorEmailHint(
  vendor:
    | {
        orders_email?: string | null;
        contact_info?: Record<string, unknown> | null;
      }
    | null
    | undefined,
): string | null {
  const orders = vendor?.orders_email?.trim();
  if (orders) return orders;
  const contact = vendor?.contact_info?.email;
  if (typeof contact === 'string' && contact.trim()) return contact.trim();
  return null;
}

/**
 * The 422 po_out_of_sync detail, VERBATIM from the po-send edge function
 * (PO_OUT_OF_SYNC_DETAIL in supabase/functions/po-send/lib.ts — the hook
 * rejects with the error CODE, so the human copy is duplicated here; a deno
 * test pins the server string, keep them in lockstep).
 */
export const PO_OUT_OF_SYNC_MESSAGE =
  "This PO's payment schedule no longer matches its item pricing — item prices " +
  'may have changed since creation, or the PO predates trade-cost totals. ' +
  'Recreate the PO or mark it sent manually.';

/** po-send's sent_not_recorded (SQ-448): the email went, the sent stamp did not. */
export const SENT_NOT_RECORDED_MESSAGE =
  'The email reached the vendor, but this order could not be marked sent — it may now be ' +
  'held for release. Check the order before sending it again.';

/**
 * Map a po-send failure (the hook rejects with the response's `error` code)
 * to designer-readable copy. Unknown codes fall through with the raw text so
 * infra failures stay debuggable.
 */
export function poSendErrorMessage(raw: string): string {
  if (raw.includes('sent_not_recorded')) {
    return SENT_NOT_RECORDED_MESSAGE;
  }
  if (raw.includes('changed_since_release')) {
    return 'This order changed after it was sent. Open a change order to send the maker a revision.';
  }
  if (raw.includes('po_out_of_sync')) {
    return PO_OUT_OF_SYNC_MESSAGE;
  }
  if (raw.includes('no_recipient')) {
    return 'No vendor email on file — add an orders email to this vendor and try again.';
  }
  if (raw.includes('po_cancelled')) {
    return 'A cancelled purchase order cannot be sent.';
  }
  if (raw.includes('no_items')) {
    return 'This purchase order has no linked FF&E items to print.';
  }
  return `Couldn't prepare the PO document — ${raw}`;
}
