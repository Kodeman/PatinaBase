/**
 * US-19 FR2 — the Money head under `one-voice`.
 *   508-1 — the door is `Record a change` at every state of ask-the-paper;
 *           `Amendment` never prints at a door.
 *   R4 (V25) — the head has one state-elected lead (`Record the payment`
 *           while a receivable is due, otherwise `Draft an invoice`); the
 *           door sits behind Details, which prints only at full density.
 * one-voice off keeps today's Amendment wording.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

let mockAskThePaper = false;
let mockOneVoice = true;
let mockInvoices: { id: string; status: string; due_date?: string | null }[] = [];

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value:
      flag === 'ask-the-paper'
        ? mockAskThePaper
        : flag === 'one-voice'
          ? mockOneVoice
          : false,
    isLoading: false,
  }),
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  usePurchaseOrders: () => ({ data: [], isLoading: false, error: null }),
  useProjectInvoices: () => ({ data: mockInvoices, isLoading: false, error: null }),
}));

// Live money, so the region stands open rather than at its seam.
jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => ({
    data: { authorizedCents: 10_000_000, remainingCents: 1_800_000 },
    isLoading: false,
    error: null,
  }),
  useWorkingBudget: () => ({
    data: { version: null, checkpoint: null, note: null },
    isLoading: false,
    error: null,
  }),
  useProjectInstruments: () => ({
    data: [{ state: 'executed', totalAmountCents: 1_000_000 }],
    isLoading: false,
    error: null,
  }),
  useTradeScopes: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock('@/hooks/use-account-page', () => ({
  useAccountPage: () => ({ data: null, isLoading: false, isError: false }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('../../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../../command-bar', () => ({ openLedger: jest.fn() }));
jest.mock('../project-authority-band', () => ({
  ProjectAuthorityBandForProject: () => <div>Authority band</div>,
}));
jest.mock('../project-commerce-section', () => ({
  ProjectCommerceSection: () => <div>Commerce section</div>,
}));
jest.mock('../../account-band', () => ({ AccountBand: () => <div>Account band</div> }));

import { MoneyRegion } from '../money-region';
import { __setDensityForTest } from '@/hooks/use-lens-density';

beforeEach(() => {
  window.localStorage.clear();
  mockAskThePaper = false;
  mockOneVoice = true;
  mockInvoices = [];
  act(() => {
    __setDensityForTest('full');
  });
});
afterEach(() => {
  __setDensityForTest(undefined);
});

/** The head's ledger keys, in the order they print (its Fold aside). */
const headKeys = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[data-region-head="money-head"] [data-action-key]'),
  )
    .map((el) => el.getAttribute('data-action-key') ?? '')
    .filter((key) => !/fold/.test(key));

const headText = () =>
  document.querySelector('[data-region-head="money-head"]')!.textContent ?? '';

/** R4 (V25) — the door now sits behind the head's Details. */
const detailsText = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  return document.querySelector('[data-action-region="money-details"]')!.textContent ?? '';
};

describe('The Money head’s door under one-voice (508-1)', () => {
  it.each([false, true])(
    'is Record a change in Details with ask-the-paper %s, and Amendment never prints',
    (askThePaper) => {
      mockAskThePaper = askThePaper;
      render(<MoneyRegion projectId="project-1" />);
      expect(headKeys()).toEqual(['draw-project-invoice', 'money-details']);
      expect(headText()).not.toContain('Record a change');
      const details = detailsText();
      expect(details).toContain('Record a change');
      expect(details).not.toContain('Amendment');
      expect(
        document.querySelectorAll('[data-action-key="compose-project-amendment"]'),
      ).toHaveLength(0);
    },
  );

  it.each(['install', 'care'] as const)(
    'never prints Add a change on the %s spread',
    (activeSection) => {
      render(<MoneyRegion projectId="project-1" activeSection={activeSection} />);
      expect(headText()).not.toContain('Add a change');
      const details = detailsText();
      expect(details).not.toContain('Add a change');
      expect(details).toContain('Record a change');
    },
  );

  it('keeps today’s Amendment with one-voice and ask-the-paper off', () => {
    mockOneVoice = false;
    render(<MoneyRegion projectId="project-1" />);
    const details = detailsText();
    expect(details).toContain('Amendment');
    expect(details).not.toContain('Record a change');
  });
});

describe('One scored leader per Money head at full density (R4)', () => {
  it('nothing due: Draft an invoice leads, scored; Record a change is plain in Details', () => {
    render(<MoneyRegion projectId="project-1" />);
    const head = document.querySelector('[data-region-head="money-head"]')!;
    expect(head.querySelectorAll('[data-action-variant="primary"]')).toHaveLength(1);
    expect(
      document.querySelector('[data-action-key="draw-project-invoice"]'),
    ).toHaveAttribute('data-action-variant', 'primary');
    detailsText();
    expect(
      document.querySelector('[data-action-key="record-a-change-money-head"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('a receivable due: Record the payment leads; Draft an invoice is plain', () => {
    mockInvoices = [{ id: 'invoice-1', status: 'sent', due_date: '2026-08-03' }];
    render(<MoneyRegion projectId="project-1" />);
    const head = document.querySelector('[data-region-head="money-head"]')!;
    expect(headKeys()).toEqual(['record-client-payment', 'draw-project-invoice', 'money-details']);
    expect(head.querySelectorAll('[data-action-variant="primary"]')).toHaveLength(1);
    expect(
      document.querySelector('[data-action-key="draw-project-invoice"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });
});

describe('The Money head at quiet on the project spread (R4)', () => {
  beforeEach(() => {
    act(() => {
      __setDensityForTest('quiet');
    });
  });

  it('prints its lead alone when nothing is due, and no Details', () => {
    render(<MoneyRegion projectId="project-1" />);
    expect(headKeys()).toEqual(['draw-project-invoice']);
    expect(
      document.querySelector('[data-action-key="draw-project-invoice"]'),
    ).toHaveAttribute('data-action-variant', 'primary');
  });

  it('never offers Record the payment for a fully paid invoice', () => {
    mockInvoices = [{
      id: 'invoice-1',
      status: 'paid',
      total_cents: 920000,
      amount_paid_cents: 920000,
      due_date: '2026-10-17',
    }];
    render(<MoneyRegion projectId="project-1" />);
    expect(document.querySelector('[data-action-key="record-client-payment"]')).toBeNull();
  });

  it('prints Draft an invoice plain beside Record the payment when a receivable is due', () => {
    mockInvoices = [{ id: 'invoice-1', status: 'sent', due_date: '2026-08-03' }];
    render(<MoneyRegion projectId="project-1" />);
    expect(headKeys()).toEqual(['record-client-payment', 'draw-project-invoice']);
    expect(
      document.querySelector('[data-action-key="record-client-payment"]'),
    ).toHaveAttribute('data-action-variant', 'primary');
    expect(
      document.querySelector('[data-action-key="draw-project-invoice"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('prints the leader alone with one-voice off', () => {
    mockOneVoice = false;
    mockAskThePaper = true;
    render(<MoneyRegion projectId="project-1" />);
    expect(headKeys()).toEqual(['draw-project-invoice']);
  });
});
