/**
 * The Discovery scan picker's provenance labels (Wave 1P, Ruling 7-A).
 *
 * The existing discovery-section suite mocks useClientRoomScans to `{ data: [] }`
 * and never opens a block, so the scanOptions mapper never runs. This suite
 * exercises the real mapper — it renders DiscoverySection, opens "The site &
 * scan" facet, and reads the picker's own <option>s.
 *
 * The cases are written against what production actually produces now that
 * `useClientRoomScans` resolves the client by profile uid: a client's scans DO
 * reach this picker, and the designer's own only when they are linked to this
 * project. The suite's earlier flagship pinned a client-only picker that the
 * old `designer_clients.id` lookup could never reach.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DiscoverySection } from '../discovery-section';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/doc/engagement-1',
}));

interface ScanOptionRow {
  id: string;
  name: string | null;
  created_at: string;
  owner_kind: 'designer' | 'client';
}

let mockScans: ScanOptionRow[] = [];
/** What the section asked the hook for — the picker is only as scoped as this. */
let hookArgs: unknown[] = [];

jest.mock('@patina/supabase', () => ({
  useDiscovery: () => ({ data: { row: null, prefill: null } }),
  useUpsertDiscovery: () => ({ mutateAsync: jest.fn().mockResolvedValue(undefined) }),
  useBeginDirection: () => ({ mutate: jest.fn(), isPending: false }),
  useStyles: () => ({ data: [] }),
  useClientRoomScans: (...args: unknown[]) => {
    hookArgs = args;
    return { data: mockScans };
  },
}));

jest.mock('../discovery-schedule-line', () => ({
  DiscoveryScheduleLine: () => null,
}));

jest.mock('../call-plan', () => ({
  CallPlan: () => null,
}));

/** Render the section and open the facet that hosts the scan picker. */
function renderPicker(scans: ScanOptionRow[]) {
  mockScans = scans;
  render(
    <DiscoverySection
      engagementId="engagement-1"
      designerId="designer-1"
      clientProfileId="client-uid"
      clientName="The Ellsworths"
      projectId="proj-1"
    />,
  );
  fireEvent.click(screen.getByText('The site & scan'));
}

beforeEach(() => {
  mockScans = [];
  hookArgs = [];
});

describe('the Discovery scan picker (Ruling 7-A)', () => {
  it("lists the client's own scans plainly — no provenance suffix on any of them", () => {
    // Production reality: the client's scans resolve by profile uid, so this is
    // the ordinary case, not an unreachable one. Nothing in the union
    // contributed, so nothing wears a suffix.
    renderPicker([
      {
        id: 's1',
        name: 'Living Room',
        created_at: '2026-08-01T00:00:00Z',
        owner_kind: 'client',
      },
      {
        id: 's2',
        name: 'Kitchen',
        created_at: '2026-07-01T00:00:00Z',
        owner_kind: 'client',
      },
    ]);

    // The section asks for THIS client's scans, scoped to THIS project.
    expect(hookArgs).toEqual(['client-uid', 'proj-1']);

    expect(screen.getByRole('option', { name: 'Living Room' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Kitchen' })).toBeInTheDocument();
    expect(screen.queryByText(/· yours/)).toBeNull();
    expect(screen.queryByText(/from your client/)).toBeNull();
  });

  it('renders the same empty picker as before the wave when neither side has a scan', () => {
    renderPicker([]);

    // One placeholder option and nothing else — the picker a field-less project
    // showed before this wave existed (FC-R10).
    const placeholder = screen.getByRole('option', { name: 'No scans on file' });
    const picker = placeholder.closest('select');
    expect(picker).not.toBeNull();
    expect(within(picker as HTMLSelectElement).getAllByRole('option')).toHaveLength(1);
  });

  it("suffixes both sides only once a designer scan on THIS project joins the list", () => {
    renderPicker([
      {
        id: 's1',
        name: 'Living Room',
        created_at: '2026-08-01T00:00:00Z',
        owner_kind: 'client',
      },
      {
        id: 's2',
        name: 'Kitchen',
        created_at: '2026-08-02T00:00:00Z',
        owner_kind: 'designer',
      },
    ]);

    expect(
      screen.getByRole('option', { name: 'Living Room · from your client' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Kitchen · yours' })).toBeInTheDocument();
  });

  it('falls back to a dated name when a scan has none', () => {
    renderPicker([
      {
        id: 's1',
        name: null,
        created_at: '2026-08-01T00:00:00Z',
        owner_kind: 'client',
      },
    ]);

    expect(screen.getByRole('option', { name: 'Scan 2026-08-01' })).toBeInTheDocument();
  });
});
