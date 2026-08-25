/**
 * The Discovery scan picker's provenance labels (Wave 1P, Ruling 7-A).
 *
 * The existing discovery-section suite mocks useClientRoomScans to `{ data: [] }`
 * and never opens a block, so the scanOptions mapper never runs. This suite
 * exercises the real mapper — it renders DiscoverySection, opens "The site &
 * scan" facet, and reads the picker's own <option>s — and pins the FC-R10
 * property the whole unflagged posture rests on: a picker showing only the
 * CLIENT's scans must look exactly as it did before this wave.
 */
import { fireEvent, render, screen } from '@testing-library/react';
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

jest.mock('@patina/supabase', () => ({
  useDiscovery: () => ({ data: { row: null, prefill: null } }),
  useUpsertDiscovery: () => ({ mutateAsync: jest.fn().mockResolvedValue(undefined) }),
  useBeginDirection: () => ({ mutate: jest.fn(), isPending: false }),
  useStyles: () => ({ data: [] }),
  useClientRoomScans: () => ({ data: mockScans }),
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
      clientProfileId="client-1"
      clientName="The Ellsworths"
    />,
  );
  fireEvent.click(screen.getByText('The site & scan'));
}

beforeEach(() => {
  mockScans = [];
});

describe('the Discovery scan picker (Ruling 7-A)', () => {
  it('leaves a client-only picker byte-identical to before the wave (FC-R10)', () => {
    renderPicker([
      {
        id: 's1',
        name: 'Living Room',
        created_at: '2026-08-01T00:00:00Z',
        owner_kind: 'client',
      },
    ]);

    expect(screen.getByRole('option', { name: 'Living Room' })).toBeInTheDocument();
    expect(screen.queryByText(/from your client/)).toBeNull();
    expect(screen.queryByText(/· yours/)).toBeNull();
  });

  it('labels both sides once the designer has a scan of her own', () => {
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
