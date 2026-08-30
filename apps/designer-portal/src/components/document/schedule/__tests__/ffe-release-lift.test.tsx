/**
 * The release lift, from the schedule's side (W4b).
 *
 * The leader moves to the Delivery table's head; the ceremony does not move at
 * all. So this spec proves the two halves the section owes: it demotes rather
 * than inking a second release, and it still opens the same ceremony when the
 * lifted leader asks — through the window door the ceremony already listens on.
 *
 * The mock surface is deliberately ffe-region-head.test.tsx's, so a difference
 * here is the new props' doing and nothing else's.
 */
import { fireEvent, render, screen } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockRooms: Record<string, unknown>[] = [];
let mockInstruments: Record<string, unknown>[] = [];
let mockTradeScopes: Record<string, unknown>[] = [];
let mockAuthority: { data: unknown } = { data: null };

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useProjectFFEItems: () => ({
    data: mockItems,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({
      selectionId: item.id,
      ready: true,
      missingFields: [],
    })),
    isLoading: false,
    isError: false,
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
}));

jest.mock('../add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: mockRooms }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: mockInstruments }),
  useTradeScopes: () => ({ data: mockTradeScopes, isPending: false }),
  useProjectBillingAuthority: () => mockAuthority,
  useWorkingBudget: () => ({ isLoading: false, data: null }),
  useReleaseForAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  usePublishBudgetCheckpoint: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useOverrideBudgetCheckpoint: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/components/portal/ffe/stages', () => ({
  STAGE_CONFIG: new Proxy(
    {},
    {
      get: (_target, key: string) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        color: 'var(--text-muted)',
      }),
    },
  ),
}));

jest.mock('../../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('../../mobile/mobile-margin-chips', () => ({
  MobileMarginChips: () => null,
}));
jest.mock('../../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../../line-unfold', () => ({ LineUnfold: () => null }));

// R127/W4 — this suite mounts a region on its own, with no page to attach the
// lens (OD-15 attaches `useLensDensity` in `page.tsx`), so nothing ever
// promotes and every stop would render its quiet form: a head, a count line
// and one leader, with the body these cases are about absent. The mock is the
// lens saying `full`, which is what a reader who has reached this region sees.
jest.mock('@/hooks/use-lens-density', () => ({
  useLensDensityStore: () => 'full',
  useLensDensity: () => ({
    forceFullThrough: () => {},
    settled: () => Promise.resolve(true),
    subscribe: () => () => {},
    getDensity: () => 'full',
    freeze: () => {},
  }),
}));

import { FFESection } from '../../ffe-section';
import { ReleaseLift } from '../../worktable/release-lift';

const line = (over: Record<string, unknown> = {}) => ({
  id: 'line-1',
  name: 'Walnut bed, king',
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 1_230_000,
  line_total_cents: 1_230_000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Primary bedroom' },
  received_quantity: null,
  ...over,
});

describe('the release lift — the schedule’s half', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [line()];
    mockInstruments = [];
    mockTradeScopes = [];
    mockAuthority = { data: { state: 'active', agreementId: 'agreement-1' } };
  });

  it('demotes to its next verb when the table head carries the release', () => {
    render(
      <FFESection
        projectId="project-1"
        projectName="Ellsworth"
        mode="project"
        releaseLeaderElsewhere
      />,
    );

    // F34: with the release lifted away, the head elects the sharpest
    // exception standing on the spread — here, the one unspecified line.
    const inked = document.querySelectorAll('[data-action-variant="inked"]');
    expect(inked).toHaveLength(1);
    expect(inked[0]).toHaveTextContent('Spec the 1 unspecified');
    expect(
      screen.queryByRole('button', { name: 'Release for authorization' }),
    ).toBeNull();
    expect(
      document.querySelector('[data-action-key="open-add-to-project"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('reports the offer only while there is one to make', () => {
    const offered = jest.fn();
    const { rerender } = render(
      <FFESection
        projectId="project-1"
        projectName="Ellsworth"
        mode="project"
        releaseLeaderElsewhere
        onReleaseOffered={offered}
      />,
    );
    expect(offered).toHaveBeenLastCalledWith(true);

    // No authority behind the project: nothing to release against.
    mockAuthority = { data: null };
    rerender(
      <FFESection
        projectId="project-1"
        projectName="Ellsworth"
        mode="project"
        releaseLeaderElsewhere
        onReleaseOffered={offered}
      />,
    );
    expect(offered).toHaveBeenLastCalledWith(false);
  });

  it('withdraws the offer once the ceremony it would open is under way', () => {
    const offered = jest.fn();
    render(
      <>
        <ReleaseLift />
        <FFESection
          projectId="project-1"
          projectName="Ellsworth"
          mode="project"
          releaseLeaderElsewhere
          onReleaseOffered={offered}
        />
      </>,
    );
    expect(offered).toHaveBeenLastCalledWith(true);

    fireEvent.click(
      screen.getByRole('button', { name: 'Release for authorization' }),
    );

    // The lifted leader opens the section's own ceremony, unforked.
    expect(screen.getByText('Choose what to release')).toBeInTheDocument();
    expect(offered).toHaveBeenLastCalledWith(false);
  });

  it('keeps the entry, disabled, in the window where the lift does not render', () => {
    // An authority stands behind the project, but the one line is blocked: the
    // lift is gated on `releaseOffered` and so prints nothing. If the head
    // deleted its entry too, the verb — and the only account of why it cannot
    // be pressed — would exist on no surface at all.
    mockItems = [line({ blocked: true })];
    const offered = jest.fn();
    render(
      <FFESection
        projectId="project-1"
        projectName="Ellsworth"
        mode="project"
        releaseLeaderElsewhere
        onReleaseOffered={offered}
      />,
    );

    expect(offered).toHaveBeenLastCalledWith(false);
    const entry = screen.getByRole('button', {
      name: 'Release for authorization',
    });
    expect(entry).toBeDisabled();
    expect(
      screen.getByText('No lines are currently eligible for release.'),
    ).toBeInTheDocument();
  });

  it('leaves the head alone when no other head has taken the leader', () => {
    render(
      <FFESection projectId="project-1" projectName="Ellsworth" mode="project" />,
    );

    const inked = document.querySelectorAll('[data-action-variant="inked"]');
    expect(inked).toHaveLength(1);
    expect(inked[0]).toHaveTextContent('Release for authorization');
  });
});
