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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Controllable mock fns (module-level so factories close over them) ───────
const createMutateAsync = jest.fn();
const startCheckoutMutateAsync = jest.fn();
const fetchPOPaymentsMock = jest.fn();

jest.mock('@patina/supabase', () => ({
  useCreatePurchaseOrder: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useStartPoCheckout: () => ({ mutateAsync: startCheckoutMutateAsync, isPending: false }),
  fetchPOPayments: (...args: unknown[]) => fetchPOPaymentsMock(...args),
  // Coverage query in isError → uncovered=[] → the soft gate never blocks.
  useFfeInvoiceCoverage: () => ({ data: undefined, isLoading: false, isError: true }),
  useOrganizations: () => ({ data: [{ name: 'Studio' }] }),
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

jest.mock('@/components/portal/procurement/po-send-actions', () => ({
  PoSendActions: () => null,
  clientVendorEmailHint: () => undefined,
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
});

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

  it('non-catalog path is unchanged: no checkout is started', async () => {
    createMutateAsync.mockResolvedValue({ id: 'po-2', total_cents: 5000 });

    renderAssistant({ vendor: { ...baseVendor, is_patina_catalog: false } });

    // external flow has an extra details step: review → coverage → details → submit
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // review → coverage
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // coverage → details
    fireEvent.click(screen.getByRole('button', { name: /confirm 1 ordered/i }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({ isPatinaCatalog: false });
    // The external path never touches Stripe checkout.
    expect(startCheckoutMutateAsync).not.toHaveBeenCalled();
    expect(fetchPOPaymentsMock).not.toHaveBeenCalled();
    expect(hrefSet).toBeNull();
  });
});
