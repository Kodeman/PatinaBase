/**
 * US-40 — the Working budget editor stands in the money region on the Install
 * and Care spreads, so the release lens's and the saved preview's budget
 * recovery links (both `requestRegionUnfold('money')`) land on Sync from the
 * schedule and Publish checkpoint there too. The real ProjectCommerceSection
 * and DerivedBudgetGrid render; only their data hooks are stubbed.
 *
 * There the region leaves the accounts to the page's standalone AccountBand,
 * which stays the sole owner of the change sheet. The REAL band and the REAL
 * AmendmentSheet render here, composed as page.tsx composes those spreads.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { requestRegionUnfold } from '@/lib/document/document-index';

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  usePurchaseOrders: () => ({ data: [], isLoading: false, error: null }),
  useProjectInvoices: () => ({ data: [], isLoading: false, error: null }),
  // The accounts band's milestone draft hold.
  useProject: () => ({ data: undefined, refetch: async () => ({ data: undefined }) }),
  useSessionUserId: () => null,
  useDocumentClientLinkHold: () => ({ data: null }),
  // The change sheet's own reads.
  useProjectV2: () => ({
    data: { id: 'project-1', name: 'Halloran House', client_id: 'client-1', proposal: null },
  }),
  useScopeChangeRequests: () => ({ data: [] }),
  useAcceptClientScopeChangeRequest: () => ({ mutate: jest.fn(), isPending: false }),
}));

const draftBudget = () => ({
  version: {
    id: 'version-1',
    version: 1,
    state: 'draft',
    lines: [
      {
        id: 'line-1',
        roomId: 'room-1',
        roomName: 'Living room',
        category: 'Seating',
        lowCents: 0,
        targetCents: 150_000,
        highCents: 0,
        scheduledCents: 180_000,
        authorizedCents: 0,
        sortOrder: 0,
      },
    ],
  },
  checkpoint: null,
  note: null,
});

const idleMutation = () => ({ mutateAsync: jest.fn(), isPending: false });

jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => ({
    data: { agreementId: 'agreement-1', authorizedCents: 10_000_000, remainingCents: 1_800_000 },
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
  }),
  useWorkingBudget: () => ({ data: draftBudget(), isLoading: false, error: null }),
  useProjectInstruments: () => ({
    data: [{ state: 'executed', totalAmountCents: 1_000_000 }],
    isLoading: false,
    error: null,
  }),
  useTradeScopes: () => ({ data: [], isLoading: false, error: null }),
  useDeriveWorkingBudget: () => idleMutation(),
  usePublishBudgetCheckpoint: () => idleMutation(),
  useOverrideBudgetCheckpoint: () => idleMutation(),
  useSetBudgetTargets: () => idleMutation(),
  useReplayCommercialNotification: () => idleMutation(),
}));

jest.mock('@/hooks/use-project-purchasing-agreement', () => ({
  useProjectPurchasingAgreement: () => ({
    data: { state: 'patina_signed' },
    isPending: false,
    isError: false,
  }),
}));

const mockAccountData = {
  budgetCents: 50_000,
  totalAmountCents: 50_000,
  designFeeCents: 5_000,
  committedCents: 0,
  committed: { currency: 'USD', cents: 0 },
  margin: { currency: 'USD', cents: 0 },
  clientValueCents: 0,
  tradeCostCents: 0,
  tradeCoverage: { withTrade: 0, total: 0 },
  marginPct: null,
  estCommissionCents: 0,
  rooms: [],
  milestones: [],
};

jest.mock('@/hooks/use-account-page', () => ({
  useAccountPage: () => ({
    data: mockAccountData,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useUpdateMilestoneTrigger: () => ({ mutate: jest.fn() }),
  useGenerateMilestoneInvoice: () => ({ mutate: jest.fn(), isPending: false }),
  exportAccountsQbo: jest.fn(),
}));

jest.mock('@/hooks/use-can-see-margin', () => ({ useCanSeeMargin: () => true }));

jest.mock('@/hooks/use-amendments', () => ({
  useComposeAmendment: () => ({ mutate: jest.fn(), isPending: false }),
  useSendAmendment: () => ({ mutate: jest.fn(), isPending: false }),
  useApplyAmendment: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('../../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
  openInvoiceFolio: jest.fn(),
}));
jest.mock('../../command-bar', () => ({ openLedger: jest.fn() }));
jest.mock('../../overlays/household-sheet', () => ({ HouseholdSheet: () => null }));
jest.mock('../project-authority-band', () => ({
  ProjectAuthorityBandForProject: () => null,
}));
jest.mock('../authorizations-ledger', () => ({ AuthorizationsLedger: () => null }));

import { AccountBand } from '../../account-band';
import { MoneyRegion } from '../money-region';
import { __setDensityForTest } from '@/hooks/use-lens-density';

const FOLD_KEY = 'patina:doc-fold:project-1:money';

beforeEach(() => {
  window.localStorage.clear();
  __setDensityForTest('full');
});
afterEach(() => {
  __setDensityForTest(undefined);
});

/** The Install and Care spreads as page.tsx composes them: the money region
 *  without its accounts, and the always-mounted standalone band below. */
function InstallOrCarePaper({ section }: { section: 'install' | 'care' }) {
  return (
    <>
      <MoneyRegion
        projectId="project-1"
        clientName="Halloran"
        activeSection={section}
        accountsElsewhere
      />
      <AccountBand projectId="project-1" clientName="Halloran" activeSection={section} />
    </>
  );
}

const moneyRegion = () => document.querySelector('[data-index-region="money"]')!;
/** The region's posture as printed: a folded region is its `Money` seam. */
const moneyPosture = () =>
  moneyRegion().getAttribute('aria-label') === 'Money'
    ? 'folded'
    : moneyRegion().getAttribute('data-density');
const sheets = () => document.querySelectorAll('[role="dialog"]');
const titleFields = () => document.querySelectorAll('#amendment-title');

/** Both change events: ⌘K's `Add a change` and a line's change order. */
function dispatchBothChangeEvents() {
  act(() => {
    window.dispatchEvent(new CustomEvent('document:open-project-change'));
    window.dispatchEvent(new CustomEvent('document:compose-amendment'));
  });
}

/** One accounts band on the paper, and it is not inside the money region. */
function expectAccountsOnceOutsideTheRegion() {
  const accounts = screen.getAllByText('Project accounts');
  expect(accounts).toHaveLength(1);
  expect(moneyRegion().contains(accounts[0])).toBe(false);
}

describe('the Working budget editor on the Install and Care spreads (US-40)', () => {
  it.each(['install', 'care'] as const)(
    'prints Sync from the schedule and Publish checkpoint on the %s spread, with no accounts band inside',
    (activeSection) => {
      render(<MoneyRegion projectId="project-1" activeSection={activeSection} accountsElsewhere />);

      expect(screen.getByText(/Working budget/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sync from the schedule' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Publish checkpoint' })).toBeInTheDocument();
      expect(screen.queryByText('Project accounts')).toBeNull();
    },
  );

  it.each(['install', 'care'] as const)(
    'on the %s spread a region she folded opens on the recovery request and lands on the editor',
    (activeSection) => {
      window.localStorage.setItem(FOLD_KEY, '1');
      render(<MoneyRegion projectId="project-1" activeSection={activeSection} accountsElsewhere />);

      expect(screen.queryByRole('button', { name: 'Sync from the schedule' })).toBeNull();

      act(() => requestRegionUnfold('money'));

      expect(screen.getByRole('button', { name: 'Sync from the schedule' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Publish checkpoint' })).toBeInTheDocument();
      const heading = document.getElementById('money-region-heading');
      expect(heading).not.toBeNull();
      expect(document.activeElement).toBe(heading);
    },
  );
});

describe('the change sheet on the Install and Care spreads — the standalone band owns it (US-40)', () => {
  const postures = {
    quiet: () => __setDensityForTest('quiet'),
    folded: () => window.localStorage.setItem(FOLD_KEY, '1'),
    full: () => __setDensityForTest('full'),
  };

  it.each([
    ['install', 'quiet'],
    ['install', 'folded'],
    ['install', 'full'],
    ['care', 'quiet'],
    ['care', 'folded'],
    ['care', 'full'],
  ] as const)('on the %s spread with Money %s, both change events open exactly one sheet', (section, posture) => {
    postures[posture]();
    render(<InstallOrCarePaper section={section} />);
    expect(moneyPosture()).toBe(posture);
    expectAccountsOnceOutsideTheRegion();
    expect(sheets()).toHaveLength(0);

    dispatchBothChangeEvents();

    expect(sheets()).toHaveLength(1);
    expect(titleFields()).toHaveLength(1);
  });

  it.each(['install', 'care'] as const)(
    'on the %s spread an open sheet survives Money going quiet → full → folded',
    (section) => {
      postures.quiet();
      render(<InstallOrCarePaper section={section} />);
      expect(moneyPosture()).toBe('quiet');

      dispatchBothChangeEvents();
      expect(sheets()).toHaveLength(1);
      fireEvent.change(titleFields()[0], { target: { value: 'Add the reading lamp' } });

      // quiet → full: the editor prints, the sheet stays as she left it.
      act(() => __setDensityForTest('full'));
      expect(moneyPosture()).toBe('full');
      expect(
        screen.getByRole('button', { name: 'Sync from the schedule', hidden: true }),
      ).toBeInTheDocument();
      expectAccountsOnceOutsideTheRegion();
      expect(sheets()).toHaveLength(1);
      expect(titleFields()).toHaveLength(1);
      expect(titleFields()[0]).toHaveValue('Add the reading lamp');

      // full → folded, from the region head's own fold.
      fireEvent.click(moneyRegion().querySelector('[data-action-key="money-head-fold"]')!);
      expect(moneyPosture()).toBe('folded');
      expect(
        screen.queryByRole('button', { name: 'Sync from the schedule', hidden: true }),
      ).toBeNull();
      expectAccountsOnceOutsideTheRegion();
      expect(sheets()).toHaveLength(1);
      expect(titleFields()).toHaveLength(1);
      expect(titleFields()[0]).toHaveValue('Add the reading lamp');

      // Both events again, folded: still the one sheet, still her words.
      dispatchBothChangeEvents();
      expect(sheets()).toHaveLength(1);
      expect(titleFields()).toHaveLength(1);
      expect(titleFields()[0]).toHaveValue('Add the reading lamp');
    },
  );
});
