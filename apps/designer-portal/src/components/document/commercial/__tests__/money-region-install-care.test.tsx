/**
 * US-40 — the Working budget editor stands in the money region on the Install
 * and Care spreads, so the release lens's and the saved preview's budget
 * recovery links (both `requestRegionUnfold('money')`) land on Sync from the
 * schedule and Publish checkpoint there too. The real ProjectCommerceSection
 * and DerivedBudgetGrid render; only their data hooks are stubbed.
 */
import { act, render, screen } from '@testing-library/react';
import { requestRegionUnfold } from '@/lib/document/document-index';

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  usePurchaseOrders: () => ({ data: [], isLoading: false, error: null }),
  useProjectInvoices: () => ({ data: [], isLoading: false, error: null }),
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

jest.mock('../../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
  openInvoiceFolio: jest.fn(),
}));
jest.mock('../../command-bar', () => ({ openLedger: jest.fn() }));
jest.mock('../project-authority-band', () => ({
  ProjectAuthorityBandForProject: () => null,
}));
jest.mock('../authorizations-ledger', () => ({ AuthorizationsLedger: () => null }));
jest.mock('../../account-band', () => ({
  AccountBand: ({ headless }: { headless?: boolean }) => (
    <div data-account-band data-headless={headless ? 'true' : 'false'} />
  ),
}));

jest.mock('../../overlays/amendment-sheet', () => ({
  AmendmentSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Change composer">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

import { MoneyRegion } from '../money-region';
import { __setDensityForTest } from '@/hooks/use-lens-density';

beforeEach(() => {
  window.localStorage.clear();
  __setDensityForTest('full');
});
afterEach(() => {
  __setDensityForTest(undefined);
});

describe('the Working budget editor on the Install and Care spreads (US-40)', () => {
  it.each(['install', 'care'] as const)(
    'prints Sync from the schedule and Publish checkpoint on the %s spread, with the accounts headless inside',
    (activeSection) => {
      const { container } = render(
        <MoneyRegion projectId="project-1" activeSection={activeSection} />,
      );

      expect(screen.getByText(/Working budget/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sync from the schedule' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Publish checkpoint' })).toBeInTheDocument();
      const bands = container.querySelectorAll('[data-account-band]');
      expect(bands).toHaveLength(1);
      expect(bands[0]).toHaveAttribute('data-headless', 'true');
    },
  );

  it.each(['install', 'care'] as const)(
    'on the %s spread a region she folded opens on the recovery request and lands on the editor',
    (activeSection) => {
      window.localStorage.setItem('patina:doc-fold:project-1:money', '1');
      render(<MoneyRegion projectId="project-1" activeSection={activeSection} />);

      expect(screen.queryByRole('button', { name: 'Sync from the schedule' })).toBeNull();

      act(() => requestRegionUnfold('money'));

      expect(screen.getByRole('button', { name: 'Sync from the schedule' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Publish checkpoint' })).toBeInTheDocument();
      expect(document.getElementById('money-region-heading')).not.toBeNull();
    },
  );
});

// The accounts band (stubbed above) owns the change sheet only in the full
// body; quiet or folded, ⌘K's `Add a change` must still open it.
describe('the change composer while Money is quiet or folded (US-40 F1)', () => {
  const quietOrFolded = {
    quiet: () => __setDensityForTest('quiet'),
    folded: () => window.localStorage.setItem('patina:doc-fold:project-1:money', '1'),
  };
  const composer = () => screen.queryByRole('dialog', { name: 'Change composer' });

  it.each([
    ['install', 'quiet'],
    ['install', 'folded'],
    ['care', 'quiet'],
    ['care', 'folded'],
  ] as const)('on the %s spread with Money %s, ⌘K Add a change opens it', (activeSection, posture) => {
    quietOrFolded[posture]();
    const { container } = render(
      <MoneyRegion projectId="project-1" activeSection={activeSection} />,
    );
    expect(container.querySelector('[data-account-band]')).toBeNull();
    expect(composer()).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent('document:open-project-change'));
    });
    expect(composer()).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Close' }).click());
    expect(composer()).toBeNull();
  });

  it.each(['install', 'care'] as const)(
    'on the %s spread with Money folded, a line’s change order opens it',
    (activeSection) => {
      quietOrFolded.folded();
      render(<MoneyRegion projectId="project-1" activeSection={activeSection} />);

      act(() => {
        window.dispatchEvent(new CustomEvent('document:compose-amendment'));
      });
      expect(composer()).toBeInTheDocument();
    },
  );

  it.each(['install', 'care'] as const)(
    'on the %s spread with Money full, leaves the event to the accounts band — no second sheet',
    (activeSection) => {
      const { container } = render(
        <MoneyRegion projectId="project-1" activeSection={activeSection} />,
      );
      expect(container.querySelector('[data-account-band]')).not.toBeNull();

      act(() => {
        window.dispatchEvent(new CustomEvent('document:open-project-change'));
        window.dispatchEvent(new CustomEvent('document:compose-amendment'));
      });
      expect(composer()).toBeNull();
    },
  );
});
