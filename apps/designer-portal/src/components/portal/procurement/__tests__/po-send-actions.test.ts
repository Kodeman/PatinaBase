/**
 * Unit tests for the W4-T4 po-send pure helpers:
 *   - clientVendorEmailHint: the client-side recipient heuristic that drives
 *     PoPreview's "to {vendor}" line + Send disabled state (mirrors the edge
 *     function's orders_email → contact_info->>'email' chain, sans override)
 *   - poSendErrorMessage: po-send error-code → designer-readable copy,
 *     including the 422 po_out_of_sync send-time consistency guard
 */

import * as poSendModule from '../po-send-actions';
import {
  clientVendorEmailHint,
  poSendErrorMessage,
  SENT_NOT_RECORDED_MESSAGE,
  PO_OUT_OF_SYNC_MESSAGE,
} from '../po-send-actions';

describe('one send UI (C-09)', () => {
  it('no longer exports the retired PoSendActions / PoSendPopover components', () => {
    expect(Object.keys(poSendModule).sort()).toEqual([
      'PO_OUT_OF_SYNC_MESSAGE',
      'SENT_NOT_RECORDED_MESSAGE',
      'clientVendorEmailHint',
      'poSendErrorMessage',
    ]);
  });
});

describe('clientVendorEmailHint', () => {
  it('prefers orders_email over contact_info', () => {
    expect(
      clientVendorEmailHint({
        orders_email: 'orders@vendor.test',
        contact_info: { email: 'info@vendor.test' },
      }),
    ).toBe('orders@vendor.test');
  });

  it('falls back to contact_info email when orders_email is null or blank', () => {
    expect(
      clientVendorEmailHint({
        orders_email: null,
        contact_info: { email: 'info@vendor.test' },
      }),
    ).toBe('info@vendor.test');
    expect(
      clientVendorEmailHint({
        orders_email: '   ',
        contact_info: { email: ' info@vendor.test ' },
      }),
    ).toBe('info@vendor.test');
  });

  it('returns null when nothing usable is known client-side', () => {
    expect(clientVendorEmailHint(null)).toBeNull();
    expect(clientVendorEmailHint(undefined)).toBeNull();
    expect(clientVendorEmailHint({})).toBeNull();
    expect(
      clientVendorEmailHint({ orders_email: null, contact_info: null }),
    ).toBeNull();
    // Non-string contact emails never leak into the hint.
    expect(
      clientVendorEmailHint({ contact_info: { email: 42 } }),
    ).toBeNull();
    expect(
      clientVendorEmailHint({ contact_info: { email: '  ' } }),
    ).toBeNull();
  });
});

describe('poSendErrorMessage', () => {
  it('maps the 422 po_out_of_sync guard to the verbatim edge-function detail', () => {
    expect(poSendErrorMessage('po_out_of_sync')).toBe(PO_OUT_OF_SYNC_MESSAGE);
    // Pin the copy against the server's PO_OUT_OF_SYNC_DETAIL (a deno test
    // in supabase/functions/po-send/index.test.ts pins the other side).
    expect(PO_OUT_OF_SYNC_MESSAGE).toBe(
      "This PO's payment schedule no longer matches its item pricing — item prices " +
        'may have changed since creation, or the PO predates trade-cost totals. ' +
        'Recreate the PO or mark it sent manually.',
    );
  });

  it('maps no_recipient to the vendor-email copy', () => {
    expect(poSendErrorMessage('no_recipient')).toMatch(/No vendor email on file/);
  });

  it('maps po_cancelled and no_items', () => {
    expect(poSendErrorMessage('po_cancelled')).toMatch(/cancelled purchase order/);
    expect(poSendErrorMessage('no_items')).toMatch(/no linked FF&E items/);
  });

  it('maps sent_not_recorded (SQ-448) to the email-went-but-not-marked-sent copy', () => {
    expect(poSendErrorMessage('sent_not_recorded')).toBe(SENT_NOT_RECORDED_MESSAGE);
  });

  it('maps changed_since_release (R1 F2) to the change-order copy', () => {
    expect(poSendErrorMessage('changed_since_release')).toBe(
      'This order changed after it was sent. Open a change order to send the maker a revision.',
    );
  });

  it('passes unknown codes through for debuggability', () => {
    expect(poSendErrorMessage('render_failed')).toContain('render_failed');
  });
});
