/**
 * US-19 FR2 — the Money head under `one-voice`.
 *   508-1 — the door is `Record a change` at every state of ask-the-paper;
 *           `Amendment` never prints at a door.
 *   F2-18 — it prints on the project spread at quiet too, beside the leader,
 *           as it does on install and care.
 * one-voice off keeps today's head.
 */
import { act, render } from '@testing-library/react';

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

describe('The Money head’s door under one-voice (508-1)', () => {
  it.each([false, true])(
    'is Record a change with ask-the-paper %s, and Amendment never prints',
    (askThePaper) => {
      mockAskThePaper = askThePaper;
      render(<MoneyRegion projectId="project-1" />);
      expect(headKeys().slice(0, 2)).toEqual([
        'record-a-change-money-head',
        'draw-project-invoice',
      ]);
      expect(headText()).toContain('Record a change');
      expect(headText()).not.toContain('Amendment');
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
      expect(headKeys()[0]).toBe('record-a-change-money-head');
    },
  );

  it('keeps today’s Amendment with one-voice and ask-the-paper off', () => {
    mockOneVoice = false;
    render(<MoneyRegion projectId="project-1" />);
    expect(headText()).toContain('Amendment');
    expect(headText()).not.toContain('Record a change');
  });
});

describe('One scored leader per Money head at full density (F3-7)', () => {
  it('nothing due: Record a change leads, scored; Draw an invoice is plain', () => {
    render(<MoneyRegion projectId="project-1" />);
    const head = document.querySelector('[data-region-head="money-head"]')!;
    expect(head.querySelectorAll('[data-action-variant="inked"]')).toHaveLength(1);
    expect(
      document.querySelector('[data-action-key="record-a-change-money-head"]'),
    ).toHaveAttribute('data-action-variant', 'inked');
    expect(
      document.querySelector('[data-action-key="draw-project-invoice"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('a receivable due: Record the payment leads; Record a change is plain', () => {
    mockInvoices = [{ id: 'invoice-1', status: 'sent', due_date: '2026-08-03' }];
    render(<MoneyRegion projectId="project-1" />);
    const head = document.querySelector('[data-region-head="money-head"]')!;
    expect(headKeys()[0]).toBe('record-client-payment');
    expect(head.querySelectorAll('[data-action-variant="inked"]')).toHaveLength(1);
    expect(
      document.querySelector('[data-action-key="record-a-change-money-head"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });
});

describe('Record a change at quiet on the project spread (F2-18)', () => {
  beforeEach(() => {
    act(() => {
      __setDensityForTest('quiet');
    });
  });

  it('leads, scored, with Draw an invoice plain beside it when nothing is due (F3-7)', () => {
    render(<MoneyRegion projectId="project-1" />);
    expect(headKeys()).toEqual(['record-a-change-money-head', 'draw-project-invoice']);
    expect(
      document.querySelector('[data-action-key="record-a-change-money-head"]'),
    ).toHaveAttribute('data-action-variant', 'inked');
    expect(
      document.querySelector('[data-action-key="draw-project-invoice"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('prints plain beside Record the payment when a receivable is due (F3-7)', () => {
    mockInvoices = [{ id: 'invoice-1', status: 'sent', due_date: '2026-08-03' }];
    render(<MoneyRegion projectId="project-1" />);
    expect(headKeys()).toEqual(['record-client-payment', 'record-a-change-money-head']);
    expect(
      document.querySelector('[data-action-key="record-client-payment"]'),
    ).toHaveAttribute('data-action-variant', 'inked');
    expect(
      document.querySelector('[data-action-key="record-a-change-money-head"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('prints the leader alone with one-voice off', () => {
    mockOneVoice = false;
    mockAskThePaper = true;
    render(<MoneyRegion projectId="project-1" />);
    expect(headKeys()).toEqual(['draw-project-invoice']);
  });
});
