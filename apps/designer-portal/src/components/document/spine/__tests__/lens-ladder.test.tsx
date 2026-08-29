/**
 * The ladder as it prints (C-3/C-4, RF-02, OD-8/OD-14).
 *
 * jsdom proves what it can prove: the rows, their names, the one `aria-current`,
 * the attributes the imperative layers key off, and the keyboard. Every height
 * — the bracket's travel, the distributed track, the 34px doors head — is
 * Playwright's, and is asserted there.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { LensLadder } from '../lens-ladder';
import { DocSpine } from '../../doc-spine';
import {
  deriveLadderDoors,
  deriveLadderSegments,
  type LadderInput,
} from '@/lib/document/lens-ladder-derivation';
import type { MoneyLadder } from '@/lib/document/money-ladder';
import type { SectionKey } from '@/lib/document/desk-derivation';
import type { SpineSection } from '@/lib/document/section-derivation';
import type { TicketInput, TicketLine } from '@/lib/document/ticket-derivation';

jest.mock('../../strata-mark', () => ({
  StrataMark: () => <span aria-hidden>mark</span>,
}));

const NOW = new Date(2026, 7, 25);

const rung = (cents: number | null) => ({ cents, note: '', word: '' });
const LADDER: MoneyLadder = {
  budget: rung(18_450_000),
  plan: rung(17_124_000),
  authorized: rung(14_160_000),
  moved: rung(null),
  owed: rung(1_750_000),
  notDrawn: rung(1_230_000),
};

const ROOMS = [
  { id: 'r1', name: 'Living room' },
  { id: 'r2', name: 'Dining room' },
  { id: 'r3', name: 'Primary bedroom' },
  { id: 'r4', name: 'Mudroom' },
];

const LINES: TicketLine[] = Array.from({ length: 36 }, (_, i) => ({
  stamp: i === 0 ? ('damaged' as const) : ('ordered' as const),
  roomId: ROOMS[i % ROOMS.length].id,
  specified: true,
}));

function ticket(overrides: Partial<TicketInput> = {}): TicketInput {
  return {
    section: 'project',
    phase: { name: 'Procurement & Orders', position: 4, of: 6 },
    project: true,
    rooms: { settled: true, list: ROOMS },
    pieces: { settled: true, lines: LINES },
    drawings: { settled: true, sheetCount: 12 },
    boards: { settled: true, count: 3 },
    money: {
      settled: true,
      failed: false,
      ladder: LADDER,
      owedDays: 22,
      undrawnKind: 'deposit',
      owedSince: '2026-08-03',
    },
    dates: {
      settled: true,
      schedule: {
        selection: 'installation' as never,
        fidelity: 'committed' as never,
        positionText: 'Week 3',
        install: { date: '2026-09-15', fidelity: 'committed' as never },
      },
    },
    people: { settled: true, callSheetEnabled: true, rosterCount: 5 },
    now: NOW,
    ...overrides,
  };
}

function model(overrides: Partial<LadderInput> = {}): LadderInput {
  return {
    ticket: ticket(),
    approvals: {
      settled: true,
      awaiting: 2,
      overdue: 1,
      overdueDays: 6,
      records: 4,
    },
    care: { settled: true, closed: 0, total: 6 },
    record: { settled: true, complete: 12 },
    damagedOn: '2026-08-26',
    ...overrides,
  };
}

function ladderFor(
  section: SectionKey = 'project',
  overrides: Partial<LadderInput> = {},
) {
  const input = model({ ticket: ticket({ section }), ...overrides });
  return {
    segments: deriveLadderSegments(input),
    doors: deriveLadderDoors({
      ticket: input.ticket,
      held: Boolean(input.heldRoomId),
    }),
  };
}

function mount(
  props: Partial<React.ComponentProps<typeof LensLadder>> = {},
  section: SectionKey = 'project',
) {
  const { segments, doors } = ladderFor(section);
  return render(
    <LensLadder
      segments={segments}
      doors={doors}
      activeKey={null}
      onJump={jest.fn()}
      {...props}
    />,
  );
}

const ladderNav = () => screen.getByRole('navigation', { name: 'This paper' });
const segmentRows = () =>
  Array.from(
    ladderNav().querySelectorAll<HTMLElement>('button[data-index-region]'),
  );
const doorRows = () =>
  Array.from(ladderNav().querySelectorAll<HTMLElement>('[data-ladder-door]'));

describe('the ladder’s stops', () => {
  it('prints one segment per stop the spread mounts — six on project', () => {
    mount();
    expect(
      segmentRows().map((row) => row.getAttribute('data-index-region')),
    ).toEqual(['approvals', 'schedule', 'ffe', 'money', 'care', 'record']);
  });

  it('prints four on install and on care — no money row, no schedule row', () => {
    for (const section of ['install', 'care'] as const) {
      const { unmount } = mount({}, section);
      expect(
        segmentRows().map((row) => row.getAttribute('data-index-region')),
      ).toEqual(['approvals', 'ffe', 'care', 'record']);
      unmount();
    }
  });

  it('says so in words on a spread with nothing on the paper yet (OD-2)', () => {
    mount({}, 'proposal');
    expect(segmentRows()).toHaveLength(0);
    expect(screen.getByText('Nothing on this paper yet')).toBeInTheDocument();
  });

  it('marks exactly one stop current, and jumps from any of them', () => {
    const onJump = jest.fn();
    mount({ activeKey: 'ffe', onJump });
    const current = segmentRows().filter(
      (row) => row.getAttribute('aria-current') === 'true',
    );
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('data-index-region', 'ffe');

    fireEvent.click(
      segmentRows().find(
        (row) => row.getAttribute('data-index-region') === 'money',
      ) as HTMLElement,
    );
    expect(onJump).toHaveBeenCalledWith('money');
  });

  it('yields the value and keeps the NAME while the stop’s own head is in frame (RF-02)', () => {
    mount({ activeKey: 'ffe', headInFrame: 'ffe' });
    const pieces = segmentRows().find(
      (row) => row.getAttribute('data-index-region') === 'ffe',
    ) as HTMLElement;
    expect(pieces).toHaveAttribute('data-region-head-in-frame', 'true');
    expect(within(pieces).getByText('Pieces')).toBeInTheDocument();
    expect(pieces).not.toHaveTextContent('36 LINES');

    // Every other stop still prints its figure.
    const money = segmentRows().find(
      (row) => row.getAttribute('data-index-region') === 'money',
    ) as HTMLElement;
    expect(money).not.toHaveAttribute('data-region-head-in-frame');
    expect(money).toHaveTextContent('$17,500 OUT · $12,300 UNDRAWN');
  });

  it('publishes the reading stop on the rail (C-4)', () => {
    mount({ activeKey: 'care' });
    expect(ladderNav()).toHaveAttribute('data-reading-index', 'care');
  });
});

describe('the room rungs', () => {
  it('prints them under Pieces while the window is there, each a press target', () => {
    const onToggleRoom = jest.fn();
    mount({ activeKey: 'ffe', onToggleRoom });
    const rungs = Array.from(
      ladderNav().querySelectorAll<HTMLElement>('[data-room-chip]'),
    );
    expect(rungs.map((rung) => rung.textContent)).toEqual([
      'Living room',
      'Dining room',
      'Primary bedroom',
      'Mudroom',
    ]);
    for (const rung of rungs) {
      expect(rung).toHaveAttribute('aria-pressed', 'false');
      expect(rung).toHaveClass('min-h-11');
    }
    fireEvent.click(rungs[2]);
    expect(onToggleRoom).toHaveBeenCalledWith('r3');
  });

  it('keeps them off the narrow measure by class, never by a width read (OD-14)', () => {
    mount({ activeKey: 'ffe' });
    const chip = ladderNav().querySelector('[data-room-chip]') as HTMLElement;
    expect(chip.parentElement).toHaveClass('hidden', 'min-[1440px]:block');
  });

  it('prints nothing about rooms while the window is elsewhere and none is held', () => {
    mount({ activeKey: 'money' });
    expect(ladderNav().querySelector('[data-room-chip]')).toBeNull();
  });

  it('keeps them printed while a room is in hand, wherever the window stands', () => {
    const { segments, doors } = ladderFor('project', { heldRoomId: 'r3' });
    render(
      <LensLadder
        segments={segments}
        doors={doors}
        activeKey="money"
        onJump={jest.fn()}
      />,
    );
    const held = ladderNav().querySelector(
      '[data-room-chip="r3"]',
    ) as HTMLElement;
    expect(held).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the doors', () => {
  it('files the project’s four under this job, at every offset', () => {
    mount();
    expect(screen.getByText('Filed with this job')).toBeInTheDocument();
    expect(doorRows().map((door) => door.textContent)).toEqual([
      'Plan room',
      'Spec book',
      'Mood boards',
      'Call sheet',
    ]);
  });

  it('prints the client’s copy as a fifth on a proposal document (OD-8/DL-04)', () => {
    const input = model({
      ticket: ticket({ clientCopy: { settled: true, sent: true } }),
    });
    render(
      <LensLadder
        segments={deriveLadderSegments(input)}
        doors={deriveLadderDoors({ ticket: input.ticket, held: false })}
        activeKey={null}
        onJump={jest.fn()}
      />,
    );
    const doors = doorRows();
    expect(doors).toHaveLength(5);
    expect(doors[4]).toHaveTextContent('The client’s copy');
  });

  it('gives every door a 44px target', () => {
    mount();
    for (const door of doorRows()) expect(door).toHaveClass('min-h-11');
  });

  it('opens a door that has a page of its own as a link, the rest in place', () => {
    const onOpen = jest.fn();
    render(
      <LensLadder
        segments={[]}
        doors={[
          {
            key: 'planroom',
            label: 'Plan room',
            href: '/doc/p1/plans',
            onOpen: jest.fn(),
          },
          { key: 'callsheet', label: 'Call sheet', href: null, onOpen },
        ]}
        activeKey={null}
        onJump={jest.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: 'Plan room' })).toHaveAttribute(
      'href',
      '/doc/p1/plans',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Call sheet' }));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe('the ladder’s keyboard', () => {
  it('is one tabstop the arrows walk (proposal §4)', () => {
    mount({ activeKey: 'ffe' });
    const rows = Array.from(
      ladderNav().querySelectorAll<HTMLElement>('[data-ladder-row]'),
    );
    // One row in the tab order; the rest are reached with the arrows.
    expect(rows.filter((row) => row.tabIndex === 0)).toHaveLength(1);

    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(rows[1], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[rows.length - 1]);

    expect(
      Array.from(
        ladderNav().querySelectorAll<HTMLElement>('[data-ladder-row]'),
      ).filter((row) => row.tabIndex === 0),
    ).toHaveLength(1);
  });
});

describe('the rail around the ladder', () => {
  const sections: SpineSection[] = [
    { key: 'brief', label: 'Brief', state: 'settled', sub: 'Settled' },
    { key: 'project', label: 'Project', state: 'active', sub: 'Active' },
  ];

  it('keeps `Put down` outside the ladder — it belongs to the whole job, not this paper', () => {
    const { segments, doors } = ladderFor('project');
    render(
      <DocSpine
        sections={sections}
        onJump={jest.fn()}
        household="Vandersteen"
        projectId="p1"
        segments={segments}
        doors={doors}
      />,
    );
    const putDown = screen.getByRole('link', { name: 'Put down document' });
    expect(ladderNav().contains(putDown)).toBe(false);
  });
});
