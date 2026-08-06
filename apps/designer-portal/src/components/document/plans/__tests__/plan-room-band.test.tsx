/**
 * The plan room's threshold band. `@patina/supabase` is not tsconfig-paths
 * aliased in this app, so mocking the package specifier fires cleanly.
 */
import { render, screen } from '@testing-library/react';
import type { PlanRoomBundle } from '@patina/supabase';

const usePlanRoom = jest.fn();

// The band reads ONE query and derives holders from the bundle — the holdings
// RPC is deliberately not wired here, so there is nothing else to mock.
jest.mock('@patina/supabase', () => ({
  usePlanRoom: (...args: unknown[]) => usePlanRoom(...args),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/lib/analytics/plan-room-events', () => ({
  planRoomEvents: { bandOpened: jest.fn() },
}));

import { PlanRoomBand } from '../plan-room-band';

const EMPTY: PlanRoomBundle = {
  sheets: [],
  prints: [],
  batches: [],
  issues: [],
  issuePrints: [],
  transmittals: [],
  tokens: [],
};

function bundleWithSheets(): PlanRoomBundle {
  return {
    ...EMPTY,
    sheets: [
      {
        id: 's401',
        project_id: 'proj',
        sheet_number: 'ID-401',
        title: 'Millwork Elevations — Study',
        discipline: 'ID',
        state: 'draft',
        current_print_id: 'p-c',
        current_print_number: 3,
        sort_order: 0,
        created_at: '2026-07-08T09:00:00Z',
        updated_at: '2026-08-01T09:00:00Z',
        created_by: null,
      },
    ],
    prints: [
      {
        id: 'p-c',
        batch_id: 'b3',
        sheet_id: 's401',
        project_document_id: 'd-c',
        print_number: 3,
        rev_letter: 'C',
        sha256: 'c',
        text_sha256: null,
        source: 'upload',
        source_filename: 'Whitlock.pdf',
        page_index: 0,
        created_at: '2026-08-01T09:00:00Z',
        created_by: null,
      },
    ],
  };
}

beforeEach(() => {
  usePlanRoom.mockReturnValue({ data: bundleWithSheets() });
});

describe('PlanRoomBand', () => {
  it('renders nothing until the bundle resolves', () => {
    usePlanRoom.mockReturnValue({ data: undefined });
    const { container } = render(<PlanRoomBand routeId="doc-1" projectId="proj" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('states the vitals and opens one door', () => {
    render(<PlanRoomBand routeId="doc-1" projectId="proj" />);
    expect(screen.getByText(/The plan room — 1 sheet/)).toBeInTheDocument();
    const open = screen.getByRole('link', { name: /Open the plan room/i });
    expect(open).toHaveAttribute('href', '/doc/doc-1/plans');
    const region = document.querySelector('[data-action-region="plan-room-band"]');
    expect(region!.querySelectorAll('[data-action-variant="primary"]')).toHaveLength(1);
  });

  it('says so when a set has never been filed', () => {
    usePlanRoom.mockReturnValue({ data: EMPTY });
    render(<PlanRoomBand routeId="doc-1" projectId="proj" />);
    expect(
      screen.getByText('The plan room — no drawings filed yet.'),
    ).toBeInTheDocument();
  });

  it('goes golden hour with an amber subline when a holder is behind', () => {
    // Boone was sent Rev B of ID-401; the sheet's pointer has since moved to
    // the Rev C print, so the identity test says behind.
    usePlanRoom.mockReturnValue({
      data: {
        ...bundleWithSheets(),
        issues: [
          {
            id: 'i2',
            project_id: 'proj',
            issue_number: 2,
            name: 'Production Set — 22 Jul 2026',
            idempotency_key: 'ik2',
            request_hash: 'ih2',
            issued_at: '2026-07-22T10:00:00Z',
            set_checksum: 'c2',
            sheet_count: 1,
            prior_issue_id: null,
            created_at: '2026-07-22T10:00:00Z',
            created_by: null,
          },
        ],
        issuePrints: [
          {
            id: 'ip1',
            issue_id: 'i2',
            print_id: 'p-b',
            sheet_id: 's401',
            sheet_number: 'ID-401',
            sheet_title: 'Millwork Elevations — Study',
            rev_letter: 'B',
            sha256: 'b',
            created_at: '2026-07-22T10:00:00Z',
          },
        ],
        transmittals: [
          {
            id: 't4',
            project_id: 'proj',
            issue_id: 'i2',
            party_id: null,
            party_display_name: 'Boone Millwork',
            party_company: 'Boone Millwork',
            party_email: null,
            purpose: 'production',
            message: null,
            sent_at: '2026-07-22T11:00:00Z',
            created_at: '2026-07-22T11:00:00Z',
            created_by: null,
          },
        ],
      },
    });
    render(<PlanRoomBand routeId="doc-1" projectId="proj" />);
    expect(
      screen.getByText('Boone Millwork holds Rev B · current is Rev C'),
    ).toBeInTheDocument();
    const band = document.querySelector('[data-plan-room-band]')!;
    expect(band.className).toContain('border-[var(--color-golden-hour)]');
    expect(band.className).not.toMatch(/shadow/);
  });

  it('stays aged oak when everyone is current', () => {
    render(<PlanRoomBand routeId="doc-1" projectId="proj" />);
    const band = document.querySelector('[data-plan-room-band]')!;
    expect(band.className).toContain('border-[var(--color-aged-oak)]');
    expect(screen.queryByText(/holds Rev/)).not.toBeInTheDocument();
  });
});
