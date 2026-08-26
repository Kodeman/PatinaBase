import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import type { NeedKind } from '@/lib/document/desk-derivation';
import { MobileBar } from '../mobile/mobile-bar';
import { MobileShellProvider } from '../mobile/mobile-shell';
import { RedLetterZone, type RedLetterRow } from '../red-letter-zone';

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/proj-1',
}));

jest.mock('@patina/supabase', () => ({
  useUnreadInboxCount: () => ({ data: 0 }),
  useProcurementUnreadCount: () => ({ data: 0 }),
  useUnseenShipped: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false }),
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    inHandToday: 0,
    running: false,
    paused: false,
    elapsedSeconds: 0,
    offer: null,
  }),
}));

jest.mock('../overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('../feedback/feedback-sheet', () => ({
  openFeedbackSheet: jest.fn(),
}));

/** The zone publishes the phone's primary act, so it only ever stands inside
 *  the mobile shell — as it does on the document. */
const render = (ui: ReactElement) =>
  rtlRender(<MobileShellProvider>{ui}</MobileShellProvider>);

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const onAct = jest.fn();

const rows: RedLetterRow[] = [
  {
    key: 'r1',
    kind: 'overdue_decision',
    text: '2 decisions overdue',
    actionLabel: 'Resolve decisions',
    onAct,
    urgent: true,
  },
  {
    key: 'r2',
    kind: 'overdue_invoice',
    text: 'Invoice 004 overdue',
    actionLabel: 'Send a reminder',
    onAct: jest.fn(),
    urgent: false,
  },
  {
    key: 'r3',
    kind: 'task_due',
    text: 'Task due — confirm the fabric',
    actionLabel: null,
    onAct: jest.fn(),
    urgent: false,
  },
];

describe('RedLetterZone', () => {
  beforeEach(() => onAct.mockClear());

  it('renders nothing when there is nothing to attend to', () => {
    const { container } = render(<RedLetterZone rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prints one row per need, in the given order', () => {
    render(<RedLetterZone rows={rows} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent)).toEqual([
      '2 decisions overdueResolve decisions',
      'Invoice 004 overdueSend a reminder',
      'Task due — confirm the fabric',
    ]);
  });

  it('is a named region, never an alert', () => {
    render(<RedLetterZone rows={rows} />);
    const region = screen.getByRole('region', { name: 'Needs attention' });
    expect(region).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('fires the row action', () => {
    render(<RedLetterZone rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve decisions' }));
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('omits the act where a need names none', () => {
    render(<RedLetterZone rows={rows} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('gathers every act into ONE named group, not one group per row', () => {
    render(<RedLetterZone rows={rows} />);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAccessibleName('Needs attention actions');
  });

  it('keys each act to its own row, so two needs of a kind stay distinct', () => {
    const twoOfAKind: RedLetterRow[] = [
      { ...rows[0], key: 'a' },
      { ...rows[0], key: 'b', onAct: jest.fn() },
    ];
    render(<RedLetterZone rows={twoOfAKind} />);
    const keys = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('data-action-key'));
    expect(keys).toEqual([
      'red-letter-overdue_decision-0',
      'red-letter-overdue_decision-1',
    ]);
  });

  it('SP-20/F41 — a setup chore and a dated overdue need wear different stamps', () => {
    // The exact pair the plank names: `schedule_unconfigured` is the canonical
    // setup chore, `task_due` the canonical dated overdue need.
    const pair: RedLetterRow[] = [
      {
        key: 'chore',
        kind: 'schedule_unconfigured',
        text: 'The schedule has no bands yet',
        actionLabel: null,
        onAct: jest.fn(),
        urgent: false,
      },
      {
        key: 'overdue',
        kind: 'task_due',
        text: 'Task due — confirm the fabric',
        actionLabel: null,
        onAct: jest.fn(),
        urgent: false,
      },
    ];
    const { container } = render(<RedLetterZone rows={pair} />);

    const colors = Array.from(
      container.querySelectorAll('[data-need-stamp]'),
    ).map((stamp) => stamp.getAttribute('data-stamp-color'));
    expect(colors).toHaveLength(2);
    expect(new Set(colors).size).toBe(2);
  });

  it('SP-20 — every row carries a stamp, and the stamp says nothing (C4/D8)', () => {
    const { container } = render(<RedLetterZone rows={rows} />);

    const stamps = Array.from(container.querySelectorAll('[data-need-stamp]'));
    expect(stamps).toHaveLength(rows.length);
    for (const stamp of stamps) {
      expect(stamp).toHaveAttribute('aria-hidden', 'true');
      expect(stamp.textContent).toBe('');
    }
  });

  it('F07 — registers the FIRST row as the phone\u2019s one primary act', () => {
    rtlRender(
      <MobileShellProvider>
        <RedLetterZone rows={rows} />
        <MobileBar />
      </MobileShellProvider>,
    );

    const bar = within(screen.getByTestId('mobile-bar'));
    const primary = bar.getByRole('button', { name: 'Resolve decisions' });
    expect(primary).toHaveAttribute(
      'data-action-key',
      'red-letter-overdue_decision-0',
    );
    expect(
      bar.queryByRole('button', { name: 'Send a reminder' }),
    ).not.toBeInTheDocument();

    fireEvent.click(primary);
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('F07 — publishes nothing when the first need names no act', () => {
    rtlRender(
      <MobileShellProvider>
        <RedLetterZone rows={[rows[2]]} />
        <MobileBar />
      </MobileShellProvider>,
    );

    const bar = within(screen.getByTestId('mobile-bar'));
    expect(bar.getByText('Hands free')).toBeInTheDocument();
  });

  it('weights an urgent need heavier, and only by weight', () => {
    render(<RedLetterZone rows={rows} />);
    const [urgent, ordinary] = screen.getAllByRole('listitem');
    expect(urgent.querySelector('p')).toHaveClass('font-medium');
    expect(ordinary.querySelector('p')).toHaveClass('font-normal');
  });
});

/**
 * A2-18 — the zone's kind→colour map is a hand-copy of desk-derivation.ts's
 * STAMP palette, which B3-L1 owns and is about to re-token. desk-derivation.ts
 * exports no kind-keyed lookup to consume, and adding one is B3's refactor, so
 * this pins what a test can reach without it: every kind renders, and every
 * colour it renders is still a member of that palette. Rename or drop a STAMP
 * token upstream and this fails, naming the file that has to follow.
 */
describe('SP-20 — the stamp map stays inside desk-derivation.ts STAMP palette', () => {
  // A Record, not an array: a NeedKind added upstream fails to type-check here
  // rather than slipping through untested.
  const EVERY_KIND: Record<NeedKind, true> = {
    overdue_decision: true,
    overdue_invoice: true,
    proposal_signed: true,
    damage_claim: true,
    proposal_declined: true,
    proposal_expired: true,
    lines_flagged: true,
    new_lead: true,
    ceremony_pending: true,
    reconnect_due: true,
    hesitating_proposal: true,
    awaiting_inspection: true,
    schedule_conflict: true,
    schedule_proposal: true,
    task_due: true,
    schedule_unconfigured: true,
    po_unsent: true,
    po_unacknowledged: true,
    pulse_due: true,
  };

  function stampPalette() {
    const source = readFileSync(
      join(__dirname, '../../../lib/document/desk-derivation.ts'),
      'utf8',
    );
    const block = source.slice(
      source.indexOf('const STAMP = {'),
      source.indexOf('} as const;', source.indexOf('const STAMP = {')),
    );
    const colors = Array.from(block.matchAll(/color:\s*'([^']+)'/g)).map(
      (match) => match[1],
    );
    expect(colors.length).toBeGreaterThan(0);
    return new Set(colors);
  }

  it('renders every need kind, wearing only palette tokens', () => {
    const palette = stampPalette();
    const kinds = Object.keys(EVERY_KIND) as NeedKind[];
    const { container } = render(
      <RedLetterZone
        rows={kinds.map((kind) => ({
          key: kind,
          kind,
          text: kind,
          actionLabel: null,
          onAct: jest.fn(),
          urgent: false,
        }))}
      />,
    );

    const stamps = Array.from(container.querySelectorAll('[data-need-stamp]'));
    expect(stamps).toHaveLength(kinds.length);
    for (const stamp of stamps) {
      expect(palette).toContain(stamp.getAttribute('data-stamp-color'));
    }
  });
});
