/**
 * Phase 4 — "Order via Patina" designer-pays-at-order-time, wired into the LIVE
 * catalog order flow (OrderAssistant.handleCatalogSubmit).
 *
 * Renders the real OrderAssistant and drives the step machine to submit, with
 * the runtime deps mocked (@patina/supabase hooks, toast, analytics, the heavy
 * step/animation modules). The mock-replaces-export assumption is safe here:
 * @patina/supabase is NOT paths-mapped in this app's jest config, so
 * jest.mock('@patina/supabase') actually swaps the module (verified — the memory
 * gotcha only bites paths+SWC-mapped packages like @patina/utils).
 *
 * Covers:
 *   - catalog submit creates the PO with paymentPattern 'full_upfront'
 *     (+ is_patina_catalog), resolves its po_payment, starts checkout, redirects;
 *   - checkout-start failure keeps the PO (created panel) with a recoverable,
 *     honest "Pay now" message and does NOT redirect;
 *   - the non-catalog path is unchanged: no checkout is started.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Controllable mock fns (module-level so factories close over them) ───────
const createMutateAsync = jest.fn();
const startCheckoutMutateAsync = jest.fn();
const fetchPOPaymentsMock = jest.fn();
const setShipToMutateAsync = jest.fn();
// Ship-to option sources (C-02): the studio's organizations.address and the
// project's site_address. Null hides the matching radio.
const mockShipToSources: { orgAddress: unknown; siteAddress: string | null } = {
  orgAddress: null,
  siteAddress: null,
};
const mockStudioAccount: { row: Record<string, unknown> | null } = { row: null };

jest.mock('@patina/supabase', () => ({
  useCreatePurchaseOrder: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useStartPoCheckout: () => ({ mutateAsync: startCheckoutMutateAsync, isPending: false }),
  useSetPurchaseOrderShipTo: () => ({ mutateAsync: setShipToMutateAsync, isPending: false }),
  fetchPOPayments: (...args: unknown[]) => fetchPOPaymentsMock(...args),
  // Coverage query in isError → uncovered=[] → the soft gate never blocks.
  useFfeInvoiceCoverage: () => ({ data: undefined, isLoading: false, isError: true }),
  useOrganizations: () => ({
    data: [{ id: 'org-studio', name: 'Studio', address: mockShipToSources.orgAddress }],
  }),
  // "The studio" is the project's studio (projects.studio_id, F11).
  useProject: () => ({
    data: { studio_id: 'org-studio', site_address: mockShipToSources.siteAddress },
  }),
  useStudioIdentity: () => ({ data: undefined }),
  // C-12: the project studio's own account with the vendor.
  useStudioVendorAccount: (studioId: string | null, vendorId: string) => ({
    data: studioId === 'org-studio' && vendorId === 'vendor-1' ? mockStudioAccount.row : null,
  }),
}));

jest.mock('@/components/portal/toast-provider', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: {
    orderAssistantStep: jest.fn(),
    orderBlocked: jest.fn(),
    poCreated: jest.fn(),
    coverageGateShown: jest.fn(),
    coverageOverridden: jest.fn(),
  },
}));

jest.mock('@/components/portal/procurement/blocked-by-decision-notice', () => ({
  BlockedByDecisionInline: () => null,
  getBlockedItems: () => [],
}));

// po-send-actions is pure helpers now (C-09) — used unmocked. PoPreview is
// stubbed to a marker that records its props.
const poPreviewProps = jest.fn();
jest.mock('@/components/document/po-preview', () => ({
  PoPreview: (props: { open: boolean; purchaseOrderId: string; mode?: string }) => {
    poPreviewProps(props);
    return props.open ? (
      <div data-testid="po-preview">
        Preview {props.purchaseOrderId} {props.mode}
      </div>
    ) : null;
  },
}));

jest.mock('../step-review', () => ({
  StepReview: () => null,
  formatItemDetailsForClipboard: () => '',
}));
jest.mock('../step-coverage', () => ({
  StepCoverage: () => null,
  uncoveredItems: () => [],
}));
jest.mock('../step-details', () => ({
  StepDetails: () => null,
  depositDefaultForPattern: () => '',
  prefillPaymentPattern: jest.requireActual('../step-details').prefillPaymentPattern,
  freshMilestone: () => ({ key: Math.random().toString(36), label: '', amountInput: '', dueDate: '' }),
  validateDetails: () => null,
}));
jest.mock('../sidemark', () => ({ generateSidemark: () => 'SM' }));

// framer-motion → plain elements; strip framer-only props so React doesn't warn
// about unknown DOM attributes.
jest.mock('framer-motion', () => {
  const R = require('react');
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      R.createElement(R.Fragment, null, children),
    motion: new Proxy(
      {},
      {
        get: () =>
          R.forwardRef(
            (
              {
                children,
                initial: _i,
                animate: _a,
                exit: _e,
                transition: _t,
                whileHover: _wh,
                whileTap: _wt,
                ...rest
              }: Record<string, unknown> & { children?: React.ReactNode },
              ref: React.Ref<HTMLDivElement>,
            ) => R.createElement('div', { ref, ...rest }, children),
          ),
      },
    ),
  };
});

import { OrderAssistant } from '../index';
import type { OrderAssistantProps } from '../types';

// ─── window.location stub (capture the redirect target) ──────────────────────
let hrefSet: string | null = null;
const realLocation = window.location;
beforeAll(() => {
  // jsdom's location is not redefinable via defineProperty, but IS deletable.
  delete (window as unknown as { location?: Location }).location;
  (window as unknown as { location: { href: string } }).location = {
    get href() {
      return hrefSet ?? '';
    },
    set href(v: string) {
      hrefSet = v;
    },
  };
});
afterAll(() => {
  delete (window as unknown as { location?: Location }).location;
  (window as unknown as { location: Location }).location = realLocation;
});

beforeEach(() => {
  hrefSet = null;
  createMutateAsync.mockReset();
  startCheckoutMutateAsync.mockReset();
  fetchPOPaymentsMock.mockReset();
  setShipToMutateAsync.mockReset();
  // set_purchase_order_ship_to returns the updated header row.
  setShipToMutateAsync.mockImplementation(
    async ({ shipTo }: { purchaseOrderId: string; shipTo: string }) => ({
      ...(await createMutateAsync.mock.results.at(-1)?.value),
      ship_to: shipTo,
    }),
  );
  mockShipToSources.orgAddress = null;
  mockShipToSources.siteAddress = null;
});

/** On the Details step: choose "Somewhere else" and type the address. */
function chooseSomewhereElse(text = 'Acme Receiving, 9 Dock Rd, Racine, WI 53403') {
  fireEvent.click(screen.getByRole('radio', { name: 'Somewhere else' }));
  fireEvent.change(screen.getByLabelText('Ship-to address'), { target: { value: text } });
}

// ─── Fixtures / render helper ────────────────────────────────────────────────
const baseVendor = {
  id: 'vendor-1',
  name: 'Acme',
  default_payment_terms: null as string | null,
};
const project = { id: 'project-1', name: 'Loft' };
const ffeItems = [{ id: 'item-1', name: 'Sofa', line_total_cents: 5000 }];

function renderAssistant(overrides: Partial<OrderAssistantProps> = {}) {
  const props: OrderAssistantProps = {
    open: true,
    onOpenChange: jest.fn(),
    vendor: { ...baseVendor, is_patina_catalog: true },
    project,
    ffeItems,
    ...overrides,
  } as OrderAssistantProps;
  return render(<OrderAssistant {...props} />);
}

/**
 * Manually-resolvable promise — lets a test hold an await open while it
 * interacts with the UI mid-flight (busy-gate + stale-continuation tests).
 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush pending microtasks inside act() so awaited continuations settle. */
const flushMicrotasks = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

describe('OrderAssistant — catalog order (Phase 4 pay-at-order)', () => {
  it('creates a full_upfront PO, resolves its payment, starts checkout, and redirects', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-1', total_cents: 5000 });
    fetchPOPaymentsMock.mockResolvedValue([{ id: 'pp-1', amount_cents: 5000, state: 'pending' }]);
    startCheckoutMutateAsync.mockResolvedValue({ url: 'https://stripe.test/session/abc' });

    renderAssistant();

    // review → coverage
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // coverage → submit (catalog one-click)
    fireEvent.click(screen.getByRole('button', { name: /one-click order via patina/i }));

    await waitFor(() => expect(hrefSet).toBe('https://stripe.test/session/abc'));

    // PO created with the pay-at-order pattern, not net_30.
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({
      paymentPattern: 'full_upfront',
      isPatinaCatalog: true,
      projectId: 'project-1',
      vendorId: 'vendor-1',
    });
    // Its single po_payment was resolved and handed to checkout.
    expect(fetchPOPaymentsMock).toHaveBeenCalledWith('po-1');
    expect(startCheckoutMutateAsync).toHaveBeenCalledWith({ poPaymentId: 'pp-1' });
  });

  it('keeps the PO and shows a recoverable Pay-now message when checkout-start fails', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-1', total_cents: 5000 });
    fetchPOPaymentsMock.mockResolvedValue([{ id: 'pp-1', amount_cents: 5000, state: 'pending' }]);
    startCheckoutMutateAsync.mockRejectedValue(new Error('checkout unavailable'));

    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /one-click order via patina/i }));

    // Lands on the created panel with the honest, recoverable copy — one
    // paragraph naming the failure and directing the designer to "Pay now".
    await waitFor(() =>
      expect(
        screen.getByText(/checkout unavailable[\s\S]*Pay now/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Purchase order created/i)).toBeInTheDocument();

    // PO was created once and never rolled back; no redirect happened.
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(startCheckoutMutateAsync).toHaveBeenCalledTimes(1);
    expect(hrefSet).toBeNull();
  });

  // ─── Item 11 — multi-order queue must not be abandoned by the redirect ──
  it('multi-queue (queueLength > 1): creates the PO, resolves its payment, but does NOT redirect — renders a manual Pay-now button instead', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-1', total_cents: 5000 });
    fetchPOPaymentsMock.mockResolvedValue([{ id: 'pp-1', amount_cents: 5000, state: 'pending' }]);
    // startCheckout must NOT be reached on this path — leave it unmocked so
    // any call would surface as a hard failure.

    renderAssistant({ queueLength: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // review → coverage
    fireEvent.click(screen.getByRole('button', { name: /one-click order via patina/i }));

    // The PO is still created and its po_payment still resolved (the "pay
    // buttons" need it) — only the redirect itself is skipped.
    await waitFor(() => expect(fetchPOPaymentsMock).toHaveBeenCalledWith('po-1'));
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({
      paymentPattern: 'full_upfront',
      isPatinaCatalog: true,
    });

    // No redirect happened, and the manual "Pay now" button is on screen —
    // the created panel, not a blown-away tab.
    expect(hrefSet).toBeNull();
    expect(startCheckoutMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/Purchase order created/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /pay now/i }),
    ).toBeInTheDocument();
    // Honest copy — no lying about how payment gets finished.
    expect(screen.getByText(/pay them one at a time/i)).toBeInTheDocument();
  });

  it('multi-queue: clicking the manual Pay-now button starts checkout and redirects (deferred, not automatic)', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-1', total_cents: 5000 });
    fetchPOPaymentsMock.mockResolvedValue([{ id: 'pp-1', amount_cents: 5000, state: 'pending' }]);
    startCheckoutMutateAsync.mockResolvedValue({ url: 'https://stripe.test/session/deferred' });

    renderAssistant({ queueLength: 3 });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /one-click order via patina/i }));

    const payNowButton = await screen.findByRole('button', { name: /pay now/i });
    expect(hrefSet).toBeNull(); // confirms no auto-redirect happened before the click

    fireEvent.click(payNowButton);

    await waitFor(() => expect(hrefSet).toBe('https://stripe.test/session/deferred'));
    expect(startCheckoutMutateAsync).toHaveBeenCalledWith({ poPaymentId: 'pp-1' });
  });

  it('queueLength: 1 is equivalent to omitting it — still redirects immediately (single-entry queue keeps today\'s behavior)', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-1', total_cents: 5000 });
    fetchPOPaymentsMock.mockResolvedValue([{ id: 'pp-1', amount_cents: 5000, state: 'pending' }]);
    startCheckoutMutateAsync.mockResolvedValue({ url: 'https://stripe.test/session/single' });

    renderAssistant({ queueLength: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /one-click order via patina/i }));

    await waitFor(() => expect(hrefSet).toBe('https://stripe.test/session/single'));
  });

  // ─── Review fix 1 — the queued resolution window is busy-gated ──────────
  it('multi-queue: double-clicking during po_payment resolution creates exactly one PO, and close is blocked', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-1', total_cents: 5000 });
    // Hold the resolution open so we can interact mid-await.
    const resolution = deferred<Array<{ id: string; amount_cents: number; state: string }>>();
    fetchPOPaymentsMock.mockReturnValue(resolution.promise);

    renderAssistant({ queueLength: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /one-click order via patina/i }));

    // createPO resolves on a microtask, then the po_payment resolution hangs
    // on our deferred. createPO.isPending is false again by now (mocked
    // permanently false, mirroring the real post-settle state) — the
    // isResolving busy gate is the ONLY thing keeping the panel inert.
    const busyButton = await screen.findByRole('button', { name: /placing order/i });
    expect(busyButton).toBeDisabled();

    // A second click on the primary must be a no-op (duplicate-PO window).
    fireEvent.click(busyButton);
    // And every dismissal/navigation affordance is blocked mid-resolution —
    // closing would advance the queue under the in-flight continuation.
    // (The submit fires from the coverage step, so the left footer button
    // is "Back"; the header ✕ is "Close".)
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

    await act(async () => {
      resolution.resolve([{ id: 'pp-1', amount_cents: 5000, state: 'pending' }]);
    });
    await screen.findByText(/Purchase order created/i);

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(fetchPOPaymentsMock).toHaveBeenCalledTimes(1);
    expect(hrefSet).toBeNull();
  });

  // ─── Review fix 2 — Done mid Pay-now must not navigate later ────────────
  it('multi-queue: Done clicked while Pay-now is in flight → the late checkout URL does NOT navigate (stale continuation bails)', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-1', total_cents: 5000 });
    fetchPOPaymentsMock.mockResolvedValue([{ id: 'pp-1', amount_cents: 5000, state: 'pending' }]);
    const checkout = deferred<{ url: string }>();
    startCheckoutMutateAsync.mockReturnValue(checkout.promise);

    const onOpenChange = jest.fn();
    const props = {
      open: true,
      onOpenChange,
      vendor: { ...baseVendor, is_patina_catalog: true },
      project,
      ffeItems,
      queueLength: 2,
    } as OrderAssistantProps;
    const { rerender } = render(<OrderAssistant {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /one-click order via patina/i }));

    const payNowButton = await screen.findByRole('button', { name: /pay now/i });
    fireEvent.click(payNowButton);
    expect(startCheckoutMutateAsync).toHaveBeenCalledWith({ poPaymentId: 'pp-1' });

    // Done must stay clickable while Pay-now is in flight — the queue has
    // to remain advanceable (payment is always recoverable from By Vendor).
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Parent honors the close (queue advances / panel unmounts).
    rerender(<OrderAssistant {...props} open={false} />);

    // The checkout URL arrives AFTER the panel moved on — navigating now
    // would yank the tab to Stripe and abandon the remaining queue, i.e.
    // the exact bug the deferred path exists to fix. The stale
    // continuation must bail silently.
    await act(async () => {
      checkout.resolve({ url: 'https://stripe.test/session/late' });
    });
    await flushMicrotasks();
    expect(hrefSet).toBeNull();
  });

  it('non-catalog path is unchanged: no checkout is started', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-2', total_cents: 5000 });

    renderAssistant({ vendor: { ...baseVendor, is_patina_catalog: false } });

    // external flow has an extra details step: review → coverage → details → submit
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // review → coverage
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // coverage → details
    chooseSomewhereElse();
    fireEvent.click(screen.getByRole('button', { name: /confirm 1 ordered/i }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({ isPatinaCatalog: false });
    // The external path never touches Stripe checkout.
    expect(startCheckoutMutateAsync).not.toHaveBeenCalled();
    expect(fetchPOPaymentsMock).not.toHaveBeenCalled();
    expect(hrefSet).toBeNull();
  });
});

describe('OrderAssistant — terms prefill from the studio account (C-12)', () => {
  afterEach(() => {
    mockStudioAccount.row = null;
  });

  async function orderOffCatalog(defaultTerms: string | null) {
    createMutateAsync.mockReset().mockResolvedValue({ id: 'po-3', total_cents: 5000 });
    renderAssistant({
      vendor: { ...baseVendor, default_payment_terms: defaultTerms, is_patina_catalog: false },
    } as Partial<OrderAssistantProps>);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    chooseSomewhereElse();
    fireEvent.click(screen.getByRole('button', { name: /confirm 1 ordered/i }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    return createMutateAsync.mock.calls[0][0];
  }

  it("orders on the studio account's terms over the vendor default", async () => {
    mockStudioAccount.row = { payment_pattern: 'thirty_seventy', deposit_pct: 40, archived_at: null };
    expect(await orderOffCatalog('net_30')).toMatchObject({ paymentPattern: 'thirty_seventy' });
  });

  it('falls back to the vendor default when the studio has no account', async () => {
    expect(await orderOffCatalog('net_30')).toMatchObject({ paymentPattern: 'net_30' });
  });

  it('ignores an archived account', async () => {
    mockStudioAccount.row = {
      payment_pattern: 'full_upfront',
      deposit_pct: null,
      archived_at: '2026-10-01T00:00:00Z',
    };
    expect(await orderOffCatalog(null)).toMatchObject({ paymentPattern: 'fifty_fifty' });
  });
});

describe('OrderAssistant — Created step sends through PoPreview (C-09)', () => {
  beforeEach(() => poPreviewProps.mockReset());

  async function createExternalPo() {
    createMutateAsync.mockResolvedValue({
      id: 'po-3',
      total_cents: 5000,
      sent_at: null,
      acknowledged_at: null,
      vendor_po_number: null,
      confirmed_eta: null,
    });
    renderAssistant({
      vendor: {
        ...baseVendor,
        is_patina_catalog: false,
        orders_email: 'orders@acme.test',
      },
    } as Partial<OrderAssistantProps>);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    chooseSomewhereElse();
    fireEvent.click(screen.getByRole('button', { name: /confirm 1 ordered/i }));
    await screen.findByText(/Purchase order created/i);
  }

  it('mounts PoPreview for the new PO and opens it in send mode', async () => {
    await createExternalPo();

    expect(poPreviewProps).toHaveBeenCalledWith(
      expect.objectContaining({
        open: false,
        purchaseOrderId: 'po-3',
        vendorName: 'Acme',
        vendorEmailHint: 'orders@acme.test',
        mode: 'send',
      }),
    );
    expect(screen.queryByTestId('po-preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));
    const preview = screen.getByTestId('po-preview');
    expect(preview).toHaveTextContent('Preview po-3 send');
    // Portaled to document.body, clear of the sliding panel's transform.
    expect(
      screen.getByRole('dialog', { name: /order assistant for acme/i }),
    ).not.toContainElement(preview);
  });

  it('no longer renders the retired PoSendActions buttons', async () => {
    await createExternalPo();

    expect(
      screen.queryByRole('button', { name: /preview pdf/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /email to/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /mark as sent manually/i }),
    ).not.toBeInTheDocument();
    expect(
      jest.requireActual('@/components/portal/procurement/po-send-actions')
        .PoSendActions,
    ).toBeUndefined();
  });

  it('skips the send step on a Patina Catalog order', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-4', total_cents: 5000 });
    fetchPOPaymentsMock.mockResolvedValue([]);
    renderAssistant();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /one-click order via patina/i }));
    await screen.findByText(/Purchase order created/i);
    expect(poPreviewProps).not.toHaveBeenCalled();
  });
});

describe('OrderAssistant — ship-to choice in Details (C-02)', () => {
  const external = { vendor: { ...baseVendor, is_patina_catalog: false } };

  function toDetails() {
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // review → coverage
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // coverage → details
  }

  it('offers the studio, the job site and somewhere else, with nothing preselected', () => {
    mockShipToSources.orgAddress = { street: '1 Main St', city: 'Madison', state: 'WI', zip: '53703' };
    mockShipToSources.siteAddress = '42 Lake Rd, Middleton, WI 53562';
    renderAssistant(external);
    toDetails();

    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual(['studio', 'site', 'other']);
    radios.forEach((r) => expect(r).not.toBeChecked());
    expect(screen.getByText('1 Main St, Madison, WI 53703')).toBeInTheDocument();
    expect(screen.getByText('42 Lake Rd, Middleton, WI 53562')).toBeInTheDocument();
  });

  it('hides the studio and job-site options when neither address is on file', () => {
    renderAssistant(external);
    toDetails();

    expect(screen.queryByRole('radio', { name: /the studio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /the job site/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Somewhere else' })).not.toBeChecked();
  });

  it('blocks the submit with "Choose where this ships." until a choice is made', async () => {
    mockShipToSources.orgAddress = { street: '1 Main St', city: 'Madison', state: 'WI', zip: '53703' };
    createMutateAsync.mockResolvedValue({ id: 'po-5', total_cents: 5000 });
    renderAssistant(external);
    toDetails();

    fireEvent.click(screen.getByRole('button', { name: /confirm 1 ordered/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose where this ships.');
    expect(createMutateAsync).not.toHaveBeenCalled();

    // "Somewhere else" with nothing typed is still no choice.
    fireEvent.click(screen.getByRole('radio', { name: 'Somewhere else' }));
    fireEvent.click(screen.getByRole('button', { name: /confirm 1 ordered/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose where this ships.');
    expect(createMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: /the studio/i }));
    expect(screen.queryByText('Choose where this ships.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm 1 ordered/i }));

    await screen.findByText(/Purchase order created/i);
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(setShipToMutateAsync).toHaveBeenCalledWith({
      purchaseOrderId: 'po-5',
      shipTo: '1 Main St, Madison, WI 53703',
    });
  });

  it('persists the job site or typed text exactly as shown', async () => {
    mockShipToSources.siteAddress = '  42 Lake Rd, Middleton, WI 53562 ';
    createMutateAsync.mockResolvedValue({ id: 'po-6', total_cents: 5000 });
    renderAssistant(external);
    toDetails();

    fireEvent.click(screen.getByRole('radio', { name: /the job site/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm 1 ordered/i }));

    await screen.findByText(/Purchase order created/i);
    expect(setShipToMutateAsync).toHaveBeenCalledWith({
      purchaseOrderId: 'po-6',
      shipTo: '42 Lake Rd, Middleton, WI 53562',
    });
  });
});

describe('OrderAssistant — layering (SQ-389)', () => {
  // On /doc an ancestor stacking context capped the inline panel beneath the
  // fixed z-40 Studio drawer. Portaled to document.body, the dialog escapes it.
  it('renders the open dialog in document.body, outside the render container', () => {
    const { container } = renderAssistant();

    const dialog = screen.getByRole('dialog', { name: /order assistant for acme/i });
    expect(document.body.contains(dialog)).toBe(true);
    expect(container.contains(dialog)).toBe(false);
    // The backdrop travels with it, so it stacks against the same root.
    expect(container.querySelector('.fixed')).toBeNull();
    // Focus still lands inside the portaled dialog (autoFocus on Close).
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
