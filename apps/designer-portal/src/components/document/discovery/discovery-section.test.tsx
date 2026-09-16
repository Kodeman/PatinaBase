/**
 * R5/A5 — the readiness band is gone from this body: no glyph, no count line,
 * no Begin-the-Direction act. The seed (`begin_direction_from_discovery`) and
 * its J1 landing are the standing band's now, and are pinned in
 * `app/(document)/doc/[id]/page.test.tsx`.
 * See apps/designer-portal/src/components/document/discovery/discovery-section.tsx.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { DiscoverySection } from './discovery-section';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockUpsertMutateAsync = jest.fn().mockResolvedValue({});

// A fully-ready discovery row — all five essentials captured, so the
// Begin-the-Direction button is enabled without needing to open (and
// mount) any of the block editors.
const READY_ROW = {
  id: 'disc-1',
  designer_client_id: 'engagement-1',
  designer_id: 'designer-1',
  project_type: 'full_room',
  rooms: [{ name: 'Living Room' }],
  budget_min_cents: 3_000_000,
  budget_max_cents: 5_000_000,
  budget_basis: null,
  target_date: '2026-12-01',
  hard_date: null,
  start_urgency: null,
  style_tag_ids: ['tag-1'],
  style_keywords: [],
  lifestyle: [{ room: 'Household', who: 'A family of four', how: 'Daily living' }],
  keep_items: [],
  avoid_items: [],
  decision_makers: [],
  site_notes: null,
  room_scan_id: null,
  ready_at: null,
  seeded_proposal_id: null,
  seeded_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

jest.mock('@patina/supabase', () => ({
  useDiscovery: () => ({ data: { row: READY_ROW, prefill: null } }),
  useUpsertDiscovery: () => ({ mutateAsync: mockUpsertMutateAsync }),
  useStyles: () => ({ data: [] }),
  // F2 — DiscoverySection now reads the return-to-lead door. A non-lead
  // relationship has no lead_id, which is how the action stays unrendered here.
  useReturnToLeadCheck: () => ({ data: null }),
  useReturnToLead: () => ({ mutate: jest.fn(), isPending: false }),
  useClientRoomScans: () => ({ data: [] }),
}));

// Not the subject of this test — stub out the two always-mounted siblings so
// their own hook surfaces (margin notes, ceremony scheduling) don't need
// mocking here. Both render null when their own `open`/data gates are
// closed/absent in real use, same effective behavior.
jest.mock('./call-plan', () => ({
  CallPlan: () => null,
}));
jest.mock('./discovery-schedule-line', () => ({
  DiscoveryScheduleLine: () => null,
}));

const PROPS = {
  engagementId: 'engagement-1',
  designerId: 'designer-1',
  clientProfileId: 'client-profile-1',
  clientName: 'Harper Vale',
};

describe('DiscoverySection — no second leader (R5/A5)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockUpsertMutateAsync.mockClear();
  });

  it('prints no readiness band — no act, no glyph, no count line', () => {
    const { container } = render(<DiscoverySection {...PROPS} />);

    expect(
      screen.queryByRole('button', { name: 'Begin the Direction' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open the Direction' }),
    ).not.toBeInTheDocument();
    // READY_ROW carries all five essentials, so the retired band would have
    // printed its Ready sentence and its eyebrow here.
    expect(screen.queryByText(/Working with/)).not.toBeInTheDocument();
    expect(screen.queryByText(/essentials captured/)).not.toBeInTheDocument();
    expect(screen.queryByText('Ready for Direction')).not.toBeInTheDocument();
    // A5 — one glyph on the paper, and it is the letterhead's.
    expect(container.querySelector('.strata-mark')).toBeNull();
  });
});

// W5-R2 item 4 — the section's own inline `<h2>Discovery</h2>` and its
// `ready`/`in progress` mono tag are retired: `PreworkRegion`'s `RegionHead`
// is the paper's one head for this stop now, and the readiness stamp reports
// up into that head's eyebrow instead of standing beside a second heading.
describe('DiscoverySection — one head, not two (W5-R2 item 4)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockUpsertMutateAsync.mockClear();
  });

  it('prints no inline "Discovery" heading of its own', () => {
    render(<DiscoverySection {...PROPS} />);
    expect(screen.queryByRole('heading', { name: 'Discovery' })).toBeNull();
    expect(screen.queryByText('Discovery')).toBeNull();
  });

  it('reports its readiness stamp to the caller instead of printing a second head', () => {
    const onEyebrow = jest.fn();
    render(<DiscoverySection {...PROPS} onEyebrow={onEyebrow} />);
    // READY_ROW carries all five essentials — the region is ready.
    expect(onEyebrow).toHaveBeenLastCalledWith('Ready');
    // The stamp no longer prints inline as `ready` / `in progress` text.
    expect(screen.queryByText('ready')).toBeNull();
    expect(screen.queryByText('in progress')).toBeNull();
  });

  it('renders with no `onEyebrow` at all — the prop is optional', () => {
    expect(() => render(<DiscoverySection {...PROPS} />)).not.toThrow();
  });
});

describe('DiscoverySection — custom project type', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockUpsertMutateAsync.mockClear();
  });

  it('shows the "Describe the scope" input only when project type is Custom', () => {
    render(<DiscoverySection {...PROPS} />);

    // Open the Scope & rooms facet.
    fireEvent.click(screen.getByRole('button', { name: /Scope & rooms/ }));

    expect(screen.queryByLabelText('Describe the scope')).toBeNull();

    fireEvent.change(screen.getByLabelText('Project type'), {
      target: { value: 'custom' },
    });

    expect(screen.getByLabelText('Describe the scope')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Project type'), {
      target: { value: 'full_room' },
    });

    expect(screen.queryByLabelText('Describe the scope')).toBeNull();
  });
});
