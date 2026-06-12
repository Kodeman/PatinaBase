/**
 * Unit tests for the W4-T4 po-send pure helpers:
 *   - clientVendorEmailHint: the client-side recipient heuristic that drives
 *     the "Email to {vendor}" disabled state + label (mirrors the edge
 *     function's orders_email → contact_info->>'email' chain, sans override)
 *   - poSendErrorMessage: po-send error-code → designer-readable copy,
 *     including the 422 po_out_of_sync send-time consistency guard
 *
 * The hooks/JSX in the module are not rendered — the runtime deps are mocked
 * so the import stays cheap and jsdom-free.
 */

jest.mock('@patina/supabase', () => ({
  useSendPurchaseOrder: jest.fn(),
}));
jest.mock('@/components/portal/toast-provider', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: { poSent: jest.fn() },
}));

import {
  clientVendorEmailHint,
  poSendErrorMessage,
  PO_OUT_OF_SYNC_MESSAGE,
  type PoSendActionsProps,
  type PoSendPopoverProps,
} from '../po-send-actions';

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

describe('PoSendActions / PoSendPopover callback shape', () => {
  it('PoSendActionsProps.onSent receives an ISO sentAtIso string', () => {
    // Type-level contract: the callback is (sentAtIso: string) => void.
    // This test exercises the type by constructing a valid prop bag; runtime
    // behaviour is covered by the integration / e2e suite (no jsdom here).
    const received: string[] = [];
    const props: PoSendActionsProps = {
      purchaseOrderId: 'po-1',
      vendorEmailHint: 'vendor@example.test',
      onSent: (sentAtIso) => {
        // TypeScript enforces sentAtIso is a string, not void.
        received.push(sentAtIso);
      },
    };
    // Call onSent directly to confirm it accepts a string arg.
    props.onSent?.('2026-06-12T10:00:00.000Z');
    expect(received).toEqual(['2026-06-12T10:00:00.000Z']);
  });

  it('PoSendPopoverProps.onSent receives an ISO sentAtIso string', () => {
    const received: string[] = [];
    const props: PoSendPopoverProps = {
      purchaseOrderId: 'po-2',
      vendorEmailHint: null,
      onSent: (sentAtIso) => {
        received.push(sentAtIso);
      },
    };
    props.onSent?.('2026-06-12T11:00:00.000Z');
    expect(received).toEqual(['2026-06-12T11:00:00.000Z']);
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

  it('passes unknown codes through for debuggability', () => {
    expect(poSendErrorMessage('render_failed')).toContain('render_failed');
  });
});
