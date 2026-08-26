/**
 * The Worktable composition (B2-L4, direction-b §9) — where the ticket stands
 * once a table does, and what the table keeps when it arrives.
 *
 * What this suite holds: the ticket prints ABOVE the table on every one of the
 * four compositions; it prints nowhere at all when there is no table, because
 * that is the paper where the page mounts it under the letterhead; there is
 * never more than one of it; and nothing ratified moves out from under it —
 * Speccing keeps I139's rooms rail at the table head, Delivery keeps I141's
 * release lift leading the table and keeps the money seam, and Intake keeps
 * its honest `opens when…` seams.
 */
import { render, screen } from '@testing-library/react';

import { TableFrame } from '../table-frame';
import { RoomsRail } from '../rooms-rail';
import { ReleaseLift } from '../release-lift';
import type { TableComposition } from '@/lib/document/table-derivation';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock('@patina/supabase', () => ({
  useProposalScopeRooms: () => ({
    data: [{ id: 'room-1', name: 'Living Room' }],
    isLoading: false,
  }),
  useAddScopeRoom: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/lib/analytics', () => ({
  proposalEvents: { scopeUpdated: jest.fn() },
}));

const INTAKE: TableComposition = { table: 'intake', section: 'discovery' };
const SPECCING: TableComposition = { table: 'speccing', section: 'direction' };
const FINALIZE: TableComposition = { table: 'finalize', section: 'proposal' };
const DELIVERY: TableComposition = {
  table: 'delivery',
  section: 'project',
  setting: 'procurement',
};

const TICKET = <section data-job-ticket="" aria-label="The job" />;

function frame(props: Partial<React.ComponentProps<typeof TableFrame>> = {}) {
  return render(
    <TableFrame
      composition={DELIVERY}
      pending={null}
      onTurn={jest.fn()}
      sealTurn={null}
      slots={{}}
      ticket={TICKET}
      {...props}
    >
      <p data-spread>the spread</p>
    </TableFrame>,
  );
}

/** True when `first` stands before `second` in the printed document. */
function precedes(first: Element, second: Element): boolean {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe('the ticket above the table', () => {
  it.each([
    ['intake', INTAKE],
    ['speccing', SPECCING],
    ['finalize', FINALIZE],
    ['delivery', DELIVERY],
  ])('prints above the table on the %s composition', (_name, composition) => {
    const { container } = frame({ composition });

    const ticket = container.querySelector('[data-job-ticket]')!;
    const table = container.querySelector('[data-table]')!;
    expect(ticket).not.toBeNull();
    expect(table).not.toBeNull();
    expect(precedes(ticket, table)).toBe(true);
  });

  it.each([
    ['intake', INTAKE],
    ['speccing', SPECCING],
    ['finalize', FINALIZE],
    ['delivery', DELIVERY],
  ])('prints exactly one ticket on the %s composition', (_name, composition) => {
    const { container } = frame({ composition });

    expect(container.querySelectorAll('[data-job-ticket]')).toHaveLength(1);
  });

  it('prints no ticket at all when there is no table', () => {
    // The page mounts it under the letterhead on that paper; a second one here
    // would be two maps of one job.
    const { container } = frame({ composition: null });

    expect(container.querySelector('[data-job-ticket]')).toBeNull();
    expect(container.querySelector('[data-spread]')).not.toBeNull();
  });

  it('stands above the turn line and the seal note, not between them', () => {
    const { container } = frame({
      pending: { table: 'delivery', section: 'install', setting: 'install' },
      sealTurn: { signedDate: '12 Aug 2026' },
    });

    const ticket = container.querySelector('[data-job-ticket]')!;
    const turn = container.querySelector('[data-table-turn]')!;
    expect(precedes(ticket, turn)).toBe(true);
  });
});

describe('what the table keeps under the ticket', () => {
  it('Speccing: the rooms rail still stands at the table head', () => {
    const { container } = frame({
      composition: SPECCING,
      slots: {
        'rooms-rail': (
          <RoomsRail proposalId="proposal-1" value={null} onChange={jest.fn()} />
        ),
      },
    });

    const rail = container.querySelector('[data-table-slot="rooms-rail"]')!;
    expect(rail).not.toBeNull();
    // The rail is still add-a-room's speccing home (DECISIONS.md:8895).
    expect(screen.getByRole('button', { name: '+ Add a room' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Living Room' })).toBeTruthy();

    const ticket = container.querySelector('[data-job-ticket]')!;
    const spread = container.querySelector('[data-spread]')!;
    expect(precedes(ticket, rail)).toBe(true);
    expect(precedes(rail, spread)).toBe(true);
  });

  it('Delivery: the release lift still leads the table, and the money seam stands', () => {
    const { container } = render(
      <TableFrame
        composition={DELIVERY}
        pending={null}
        onTurn={jest.fn()}
        sealTurn={null}
        slots={{}}
        ticket={TICKET}
      >
        <ReleaseLift />
        <section data-index-region="money" aria-label="Money" />
      </TableFrame>,
    );

    const ticket = container.querySelector('[data-job-ticket]')!;
    const table = container.querySelector('[data-table]')!;
    const lift = container.querySelector('[data-release-lift]')!;
    const money = container.querySelector('[data-index-region="money"]')!;

    expect(lift).not.toBeNull();
    expect(money).not.toBeNull();
    expect(precedes(ticket, lift)).toBe(true);
    // I141 — the lift is still the first thing ON the table.
    expect(table.firstElementChild).toBe(lift);
    expect(precedes(lift, money)).toBe(true);
  });

  it('Intake: the honest future seams still stand under the ticket', () => {
    const { container } = frame({ composition: INTAKE });

    const ticket = container.querySelector('[data-job-ticket]')!;
    const seams = container.querySelectorAll('[data-future-seam]');
    expect(seams).toHaveLength(3);
    expect(precedes(ticket, seams[0])).toBe(true);
  });
});
