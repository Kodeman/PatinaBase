/**
 * US-19 FR1 — the Money head with `ask-the-paper` on.
 *   F16 — `Amendment` leaves the head; the amendment is reached through
 *         `Record a change` → `On the agreement` only.
 *   R33 — `Record a change` is the head's second act on every spread,
 *         Install and Care included.
 */
import { render } from '@testing-library/react';

let mockAskThePaper = true;

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'ask-the-paper' ? mockAskThePaper : false,
    isLoading: false,
  }),
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  usePurchaseOrders: () => ({ data: [], isLoading: false, error: null }),
  useProjectInvoices: () => ({ data: [], isLoading: false, error: null }),
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
  mockAskThePaper = true;
  __setDensityForTest('full');
});
afterEach(() => {
  __setDensityForTest(undefined);
});

/** The head's acts, in the order they print. */
const headActs = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[data-region-head="money-head"] button, [data-region-head="money-head"] a'),
  ).map((act) => act.textContent?.trim() ?? '');

describe('The Money head with ask-the-paper on (F16, R33)', () => {
  it('prints Draw an invoice · Record a change · Hours · this project ↗ · Fold, and no Amendment', () => {
    render(<MoneyRegion projectId="project-1" />);
    const acts = headActs();

    expect(acts.slice(0, 3)).toEqual([
      'Draw an invoice',
      'Record a change',
      'Hours · this project ↗',
    ]);
    expect(acts.some((act) => /Fold/.test(act))).toBe(true);
    expect(acts).not.toContain('Amendment');
    expect(
      document.querySelectorAll('[data-action-key="compose-project-amendment"]'),
    ).toHaveLength(0);
  });

  it.each(['install', 'care'] as const)(
    'Record a change is the second act on the %s spread, and Add a change does not print',
    (activeSection) => {
      render(<MoneyRegion projectId="project-1" activeSection={activeSection} />);
      const acts = headActs();

      expect(acts[1]).toBe('Record a change');
      expect(acts).not.toContain('Add a change');
      expect(acts).not.toContain('Amendment');
    },
  );

  it('keeps today\'s Amendment act with the flag off', () => {
    mockAskThePaper = false;
    render(<MoneyRegion projectId="project-1" />);
    const acts = headActs();

    expect(acts).toContain('Amendment');
    expect(acts).not.toContain('Record a change');
  });
});
