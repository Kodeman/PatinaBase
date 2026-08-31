/**
 * F12 (Field Companion Wave 4 adversarial review): `MarginRail`'s `renderItem`
 * gives a `note` row `targetId={`margin-item-${row.item_id}`}` (margin-rail.tsx
 * ~563-569) so `VisitsBlock`'s "Read it in the margin" anchor
 * (`#margin-item-<id>`) has something to land on. `margin-rail-stage2.test.tsx`
 * mocks `MarginItem` wholesale, so that ternary can be broken — deleting the
 * `note` branch entirely — and all of that suite's tests still pass. This
 * suite renders the REAL `MarginItem`, unmocked, so the id actually lands in
 * the DOM.
 *
 * Test coverage only — margin-rail.tsx's behaviour is unchanged.
 */
import { render } from '@testing-library/react';
import { MarginRail } from '../margin-rail';
import type { MarginItemRow } from '@/lib/document/margin-derivation';

let mockMarginRows: MarginItemRow[];

const noteRow: MarginItemRow = {
  kind: 'note',
  item_id: 'note-42',
  project_id: 'project-1',
  proposal_id: null,
  anchor_kind: 'letterhead',
  anchor_id: null,
  state: 'open',
  title: 'The base cabinet scribe is short',
  detail: '',
  ts: '2026-08-25T17:30:00.000Z',
  payload: {},
};

jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({ data: mockMarginRows, isLoading: false }),
}));

jest.mock('@patina/supabase', () => ({
  useCoordinationItems: () => ({ data: [] }),
  useProjectContextualHandoffs: () => ({ data: [], isError: false }),
  useProjectFFEItems: () => ({ data: [] }),
  useProjectParties: () => ({ data: [] }),
  useProjectPhases: () => ({ data: [] }),
  useDesignerClientForClientUser: () => ({ data: null }),
  isProjectArtifactApproval: () => false,
}));

jest.mock('@/hooks/use-section-work', () => ({
  useSectionTasks: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-margin-notes', () => ({
  useCreateMarginNote: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-project-file-change-notifications', () => ({
  useProjectFileChangeNotifications: () => ({ data: [] }),
  useMarkProjectFileChangeRead: () => jest.fn(),
}));

// `../margin-item` is deliberately left unmocked — this suite exists to prove
// the real component actually receives and renders the id.
jest.mock('../margin-bodies', () => ({
  MarginItemBody: () => null,
}));

beforeEach(() => {
  mockMarginRows = [noteRow];
});

describe('MarginRail — a note row is the deep-link target VisitsBlock points at', () => {
  it('gives a note row id="margin-item-<item_id>", so #margin-item-<id> resolves', () => {
    render(
      <MarginRail
        projectId="project-1"
        proposalId={null}
        clientName="Client"
        onHoverLine={jest.fn()}
        now={new Date('2026-08-25T18:00:00Z')}
      />,
    );

    expect(document.getElementById('margin-item-note-42')).not.toBeNull();
  });
});
