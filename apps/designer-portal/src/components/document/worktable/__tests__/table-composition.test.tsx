/**
 * The Worktable composition (B2-L4, direction-b §9; R127 Wave 3) — where the
 * band stands once a table does, and what the table keeps when it arrives.
 *
 * W3-L5 rewrite. The job ticket is deleted and the lens band takes its place,
 * and the band is the DOCUMENT's, not the table's: it is composed once at the
 * top of the paper and the frame no longer re-mounts it anywhere. So the
 * claims this suite held divide in two.
 *
 * KEPT — the ordering claims, which are what B2-L4 was actually protecting:
 * the band prints above the table on every one of the four compositions, above
 * the turn line and the seal note rather than between them, and nothing
 * ratified moves out from under it — Speccing keeps I139's rooms rail at the
 * table head, Delivery keeps I141's release lift leading the table and keeps
 * the money seam, and Intake keeps its honest `opens when…` seams.
 *
 * REWRITTEN — the two claims that said the FRAME owns the mount. "Prints
 * exactly one ticket on this composition" was the frame's single-mount rule;
 * its replacement truth is that the frame mounts NO band of its own, so the
 * document's one band is still the only one on the paper. "Prints no ticket at
 * all when there is no table" was the frame's conditional mount; that claim no
 * longer exists — the band prints on every spread, table or no table — and its
 * replacement truth is asserted here instead.
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

/** The document's one band, stood where the page stands it: above everything
 *  the frame prints (C-5). A stub, because this suite is about composition. */
const BAND = <section data-lens-band="" aria-label="The job" />;

function frame(props: Partial<React.ComponentProps<typeof TableFrame>> = {}) {
  return render(
    <>
      {BAND}
      <TableFrame
        composition={DELIVERY}
        pending={null}
        onTurn={jest.fn()}
        sealTurn={null}
        slots={{}}
        {...props}
      >
        <p data-spread>the spread</p>
      </TableFrame>
    </>,
  );
}

/** True when `first` stands before `second` in the printed document. */
function precedes(first: Element, second: Element): boolean {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe('the band above the table', () => {
  it.each([
    ['intake', INTAKE],
    ['speccing', SPECCING],
    ['finalize', FINALIZE],
    ['delivery', DELIVERY],
  ])('prints above the table on the %s composition', (_name, composition) => {
    const { container } = frame({ composition });

    const band = container.querySelector('[data-lens-band]')!;
    const table = container.querySelector('[data-table]')!;
    expect(band).not.toBeNull();
    expect(table).not.toBeNull();
    expect(precedes(band, table)).toBe(true);
  });

  it.each([
    ['intake', INTAKE],
    ['speccing', SPECCING],
    ['finalize', FINALIZE],
    ['delivery', DELIVERY],
  ])('the frame mounts no band of its own on the %s composition', (_name, composition) => {
    // Was "prints exactly one ticket on this composition", when the frame
    // owned one of the ticket's two positions. The band has one position and
    // the document owns it, so the claim that survives is that the frame adds
    // nothing: the paper still carries exactly the one band above it.
    const { container } = frame({ composition });

    expect(container.querySelectorAll('[data-lens-band]')).toHaveLength(1);
  });

  it('stands on the paper that has no table too', () => {
    // Replaces "prints no ticket at all when there is no table". That claim is
    // gone with the ticket's second position: the band is the document's map
    // and every spread prints it, whether or not a table stands under it.
    const { container } = frame({ composition: null });

    expect(container.querySelector('[data-lens-band]')).not.toBeNull();
    expect(container.querySelector('[data-table]')).toBeNull();
    expect(container.querySelector('[data-spread]')).not.toBeNull();
  });

  it('stands above the turn line and the seal note, not between them', () => {
    const { container } = frame({
      pending: { table: 'delivery', section: 'install', setting: 'install' },
      sealTurn: { signedDate: '12 Aug 2026' },
    });

    const band = container.querySelector('[data-lens-band]')!;
    const turn = container.querySelector('[data-table-turn]')!;
    expect(precedes(band, turn)).toBe(true);
  });
});

describe('what the table keeps under the band', () => {
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

    const band = container.querySelector('[data-lens-band]')!;
    const spread = container.querySelector('[data-spread]')!;
    expect(precedes(band, rail)).toBe(true);
    expect(precedes(rail, spread)).toBe(true);
  });

  it('Delivery: the release lift still leads the table, and the money seam stands', () => {
    const { container } = render(
      <>
        {BAND}
        <TableFrame
          composition={DELIVERY}
          pending={null}
          onTurn={jest.fn()}
          sealTurn={null}
          slots={{}}
        >
          <ReleaseLift />
          <section data-index-region="money" aria-label="Money" />
        </TableFrame>
      </>,
    );

    const band = container.querySelector('[data-lens-band]')!;
    const table = container.querySelector('[data-table]')!;
    const lift = container.querySelector('[data-release-lift]')!;
    const money = container.querySelector('[data-index-region="money"]')!;

    expect(lift).not.toBeNull();
    expect(money).not.toBeNull();
    expect(precedes(band, lift)).toBe(true);
    // I141 — the lift is still the first thing ON the table.
    expect(table.firstElementChild).toBe(lift);
    expect(precedes(lift, money)).toBe(true);
  });

  it('Intake: the honest future seams still stand under the band', () => {
    const { container } = frame({ composition: INTAKE });

    const band = container.querySelector('[data-lens-band]')!;
    const seams = container.querySelectorAll('[data-future-seam]');
    expect(seams).toHaveLength(3);
    expect(precedes(band, seams[0])).toBe(true);
  });
});
