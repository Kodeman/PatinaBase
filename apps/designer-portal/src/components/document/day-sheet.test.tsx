/**
 * Today (US-25 slice 4; US-28 S3 change 1): five lines at most, on one card
 * per job, each with its act and a quiet "Not today". A line settles in
 * place, muted, with Undo on her own deferral; someone else's move prints
 * no act. Nothing counts — no badge, overflow count, "cleared" or streak.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NeedLine } from '@/lib/document/desk-derivation';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import type { DeskHolder } from '@/lib/document/desk-scope';
import { deriveDaySheet, groupSheetByJob, nextWorkingDay, type SheetNeedState } from '@/lib/document/day-sheet';
import { DaySheet, NOTHING_NEEDS_YOU, NOTHING_NEEDS_YOU_TONIGHT } from './day-sheet';

const mockMutate = jest.fn();
const mockMutateAsync = jest.fn();
const mockSetNeedStateOptions: unknown[] = [];
jest.mock('@patina/supabase', () => ({
  useSetNeedState: (options?: unknown) => {
    mockSetNeedStateOptions.push(options);
    return { mutate: mockMutate, mutateAsync: mockMutateAsync, isPending: false };
  },
}));
// The act sheet's provider: none by default, so every act keeps its landing.
const mockOpenAct = jest.fn((..._args: unknown[]) => false);
jest.mock('./acts/need-act-sheet', () => ({
  useNeedActSheet: () => ({ open: (...args: unknown[]) => mockOpenAct(...args) }),
}));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('./date-text-input', () => ({
  DateTextInput: ({ value, onChange, ariaLabel }: { value: string | null; onChange: (v: string | null) => void; ariaLabel?: string }) => (
    <input aria-label={ariaLabel} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
  ),
}));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/components/document/command-bar', () => ({ openLedger: jest.fn() }));

// Friday 9 October 2026, 10am local.
const NOW = new Date(2026, 9, 9, 10, 0, 0);
const at = (hours: number, minutes = 0) => new Date(2026, 9, 9, hours, minutes).toISOString();

function entry(i: number, over: Partial<NeedLine> = {}): DeskNeed {
  const key = `task_due:t${i}`;
  return {
    key,
    projectId: `p${i}`,
    projectName: `Job ${i}`,
    need: {
      key,
      kind: 'task_due',
      text: `Task ${i} is due`,
      actionLabel: 'Open the task',
      stamp: { label: 'DUE', color: 'var(--color-clay)' },
      urgent: false,
      owner: 'designer',
      deepLink: `/doc/p${i}#task-${i}`,
      ...over,
    } as NeedLine,
  };
}

function state(key: string, over: Partial<SheetNeedState> = {}): [string, SheetNeedState] {
  return [
    key,
    {
      needKey: key,
      projectId: null,
      deferredUntil: null,
      actedAt: null,
      waitingOn: null,
      setAsideUntil: null,
      setAsideReason: null,
      updatedAt: null,
      ...over,
    },
  ];
}

const LEAH: DeskHolder = { userId: 'me', name: 'Leah', mine: true };
const JORDAN: DeskHolder = { userId: 'u-jordan', name: 'Jordan', mine: false };

interface SheetOptions {
  jobs?: ReadonlyMap<string, { name: string; stage: 'proposal' | 'project' }>;
  holderOf?: (jobId: string) => DeskHolder;
  scope?: 'mine' | 'studio';
  teammateActed?: ReadonlyMap<string, { userId: string; actedAt: string }[]>;
  names?: ReadonlyMap<string, string>;
}

function sheetElement(
  needs: DeskNeed[],
  over: Partial<Parameters<typeof deriveDaySheet>[0]> = {},
  options: SheetOptions = {},
  onScope = jest.fn(),
) {
  const sheet = deriveDaySheet({
    needs,
    states: new Map(),
    leads: new Map(),
    meUserId: 'me',
    scope: options.scope ?? 'studio',
    unreadFeeds: [],
    now: NOW,
    ...over,
  });
  const cards = groupSheetByJob(sheet.lines, options.jobs ?? new Map(), options.holderOf);
  return (
    <DaySheet
      sheet={sheet}
      cards={cards}
      scope={options.scope ?? 'studio'}
      onScope={onScope}
      now={NOW}
      dateLabel="Friday 9 October"
      teammateActed={options.teammateActed}
      names={options.names}
    />
  );
}

function renderSheet(
  needs: DeskNeed[],
  over: Partial<Parameters<typeof deriveDaySheet>[0]> = {},
  options: SheetOptions = {},
) {
  const onScope = jest.fn();
  const utils = render(sheetElement(needs, over, options, onScope));
  return { ...utils, onScope };
}

const lines = (container: HTMLElement) =>
  container.querySelectorAll<HTMLElement>('[data-day-sheet-line]');
const lineOf = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLElement>(`[data-day-sheet-line="${key}"]`)!;

/** US-43 R7 — "Not today" and "Until…" live behind the line's "Later ▾". */
const openLater = async (job: string) => {
  await act(async () => {
    await userEvent.setup().click(screen.getByRole('button', { name: `Later — ${job}` }));
  });
};

beforeEach(() => {
  mockMutate.mockReset();
  mockMutateAsync.mockReset();
  mockOpenAct.mockClear();
  mockPush.mockReset();
});

describe('DaySheet — the cards', () => {
  it('renders five lines of eight, one card per job, and never a count', () => {
    const { container } = renderSheet(Array.from({ length: 8 }, (_, i) => entry(i + 1)));
    expect(lines(container)).toHaveLength(5);
    expect(container.querySelectorAll('article[data-desk-card]')).toHaveLength(5);
    // The rest live in the ledger now: Today prints no caption for them.
    expect(container.textContent).not.toMatch(/\d+ more|\(\d+\)|cleared|streak|on their jobs/i);
  });

  it('heads each card with its job, which opens the job; the line is one sentence with its act', () => {
    const { container } = renderSheet([entry(1)]);
    const card = container.querySelector<HTMLElement>('[data-desk-card="p1"]')!;
    expect(within(card).getByRole('link', { name: 'Job 1' })).toHaveAttribute('href', '/doc/p1');
    const line = lineOf(container, 'task_due:t1');
    expect(line.querySelector('p')).toHaveTextContent(/^Task 1 is due$/);
    expect(within(line).getByRole('link', { name: 'Open the task — Job 1' })).toHaveAttribute(
      'href',
      '/doc/p1#task-1',
    );
  });

  it('names the unscoped fallback Open project file without changing its project link', () => {
    const { container } = renderSheet([entry(1, { actionLabel: undefined })]);
    expect(within(lines(container)[0]).getByRole('link', { name: 'Open project file — Job 1' })).toHaveAttribute(
      'href',
      '/doc/p1#task-1',
    );
  });

  it('prints the time word in the card’s eyebrow only inside a day (Q5), with no dot', () => {
    const { container } = renderSheet([entry(1, { at: at(8) }), entry(2, { at: new Date(2026, 9, 1, 8).toISOString() })]);
    expect(container.querySelector('[data-desk-card="p1"] .eb')).toHaveTextContent('2 hours ago');
    expect(container.querySelector('[data-desk-card="p2"]')!.textContent).not.toMatch(/ago|yesterday/);
    expect(container.textContent).not.toContain('•');
  });

  it('joins a fact’s own dashes as commas (walk W-D8)', () => {
    const { container } = renderSheet([entry(1, { text: '2 POs sent — no acknowledgment' })]);
    expect(lines(container)[0].querySelector('p')).toHaveTextContent(/^2 POs sent, no acknowledgment$/);
  });

  it('inks only the overdue clause terracotta (U-Q10)', () => {
    const { container } = renderSheet([
      entry(1, {
        kind: 'overdue_invoice',
        text: 'Invoice INV-2026-0721 is $3,800 overdue, due Monday 28 September.',
      }),
      entry(2, { text: 'The overdue fabric sample is in' }),
    ]);
    const overdue = container.querySelectorAll('.od');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toHaveTextContent(/^\$3,800 overdue$/);
    expect(lineOf(container, 'task_due:t1').querySelector('p')).toHaveTextContent(
      'Invoice INV-2026-0721 is $3,800 overdue, due Monday 28 September.',
    );
  });

  it('carries no filled act, badge or mark, and no colour of its own (Q1)', () => {
    const { container } = renderSheet(Array.from({ length: 6 }, (_, i) => entry(i + 1, { urgent: true })));
    expect(container.querySelector('[data-action-variant="primary"], [data-action-variant="plate"]')).toBeNull();
    expect(container.querySelector('[data-roster-mark], [data-mark-tone], [data-badge]')).toBeNull();
    // The one status region is the polite voice an act speaks in, hidden.
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelector('[role="status"]')).toHaveClass('sr-only');
    for (const el of container.querySelectorAll('*')) {
      if (el.closest('[aria-hidden]')) continue;
      const cls = el.className.toString();
      expect(cls).not.toMatch(/\brounded-full\b|\bbg-(?!transparent)|terracotta|clay|sage|dusty|shadow/);
      expect(el.getAttribute('style') ?? '').not.toMatch(/color/);
    }
  });

  it('lands an act that opens its job on the job’s stage (R-DM21 A)', () => {
    const jobs = new Map([1, 2, 3, 4, 5].map((i) => [`p${i}`, { name: `Job ${i}`, stage: 'proposal' as const }]));
    const { container } = renderSheet(
      [
        entry(1, { deepLink: undefined }),
        entry(2, { deepLink: undefined }),
        entry(3),
        entry(4, { deepLink: undefined, ledger: { name: 'accounts', context: {} } } as Partial<NeedLine>),
      ],
      {},
      { jobs },
    );
    const landingOf = (key: string, root: HTMLElement = container) =>
      root.querySelector(`[data-day-sheet-line="${key}"] [data-register="act"] a`)!.getAttribute('data-landing');
    const section = JSON.stringify({ kind: 'section', sectionKey: 'proposal' });
    expect(container.querySelector('[data-part~="act"]')!.getAttribute('data-landing')).toBe(section);
    expect(landingOf('task_due:t1')).toBe(section);
    expect(landingOf('task_due:t2')).toBe(section);
    // A deep link into the paper, a ledger and an act sheet carry none.
    expect(landingOf('task_due:t3')).toBeNull();
    expect(landingOf('task_due:t4')).toBeNull();
    const sheetAct = renderSheet(
      [entry(5, { deepLink: undefined, kind: 'overdue_invoice', recordId: 'inv-5' } as Partial<NeedLine>)],
      {},
      { jobs },
    );
    expect(landingOf('task_due:t5', sheetAct.container)).toBeNull();
  });
});

describe('DaySheet — the cards’ layout and foot (US-43 R7)', () => {
  it('stands the card holding the top line first, on the lead grid that spans it across the row', () => {
    const { container } = renderSheet([entry(1), entry(2), entry(3)]);
    const grid = container.querySelector<HTMLElement>('.cards')!;
    expect(grid).toHaveClass('cards-lead');
    const cards = grid.querySelectorAll<HTMLElement>(':scope > article[data-desk-card]');
    expect(Array.from(cards, (card) => card.dataset.deskCard)).toEqual(['p1', 'p2', 'p3']);
    expect(cards[0].querySelector('[data-part~="headline"]')).toHaveTextContent('Task 1 is due');
  });

  it('prints one state sentence in body type under each job’s display name', () => {
    const invoice = entry(1, { kind: 'overdue_invoice', text: 'Invoice INV-1 is $3,800 overdue' });
    const { container } = renderSheet(
      [invoice, entry(2), entry(3)],
      { states: new Map([state('task_due:t3', { actedAt: at(8), updatedAt: at(8), waitingOn: 'the Chens' })]) },
      { holderOf: (jobId) => (jobId === 'p2' ? JORDAN : LEAH) },
    );
    const stateOf = (jobId: string) => {
      const card = container.querySelector(`[data-desk-card="${jobId}"]`)!;
      const sentences = card.querySelectorAll('[data-card-state]');
      expect(sentences).toHaveLength(1);
      expect(sentences[0]).toHaveClass('t-body');
      expect(sentences[0].previousElementSibling).toHaveClass('t-d3');
      return sentences[0].textContent;
    };
    expect(stateOf('p1')).toBe('Overdue, and yours today.');
    expect(stateOf('p2')).toBe('With Jordan today.');
    expect(stateOf('p3')).toBe('Handled for today.');
    // The overdue clause on the line stays the one terracotta.
    expect(container.querySelectorAll('.od')).toHaveLength(1);
  });

  it('reads the act, then “Record payment”, then “Later ▾” — never “Not today” or “Until…” in the foot', () => {
    const { container } = renderSheet([
      entry(1, { kind: 'overdue_invoice', recordId: 'inv-1', text: 'Invoice INV-1 is $3,800 overdue' }),
    ]);
    const foot = container.querySelector('[data-register="act"]')!;
    const labels = Array.from(foot.querySelectorAll('a, button'), (el) => el.getAttribute('aria-label'));
    expect(labels).toHaveLength(3);
    expect(labels[0]).toMatch(/ — Job 1$/);
    expect(labels.slice(1)).toEqual(['Record payment — Job 1', 'Later — Job 1']);
    expect(within(foot as HTMLElement).getByRole('button', { name: 'Later — Job 1' })).toHaveTextContent('Later▾');
    expect(screen.queryByRole('button', { name: /^Not today|^Set aside/ })).not.toBeInTheDocument();
  });

  it('opens “Later” by keyboard with aria-expanded; Escape closes it and hands focus back', async () => {
    renderSheet([entry(1)]);
    const user = userEvent.setup();
    const later = screen.getByRole('button', { name: 'Later — Job 1' });
    expect(later).toHaveAttribute('aria-expanded', 'false');
    const menu = document.getElementById(later.getAttribute('aria-controls')!)!;
    expect(menu).not.toBeVisible();
    later.focus();
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    expect(later).toHaveAttribute('aria-expanded', 'true');
    expect(menu).toBeVisible();
    expect(within(menu).getAllByRole('button').map((item) => item.textContent)).toEqual(['Not today', 'Until…']);
    await act(async () => {
      await user.tab();
    });
    expect(within(menu).getByRole('button', { name: 'Not today — Job 1' })).toHaveFocus();
    await act(async () => {
      await user.keyboard('{Escape}');
    });
    expect(later).toHaveAttribute('aria-expanded', 'false');
    expect(later).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Not today — Job 1' })).not.toBeInTheDocument();
  });

  it('closes “Later” when focus leaves it', async () => {
    renderSheet([entry(1), entry(2)]);
    await openLater('Job 1');
    expect(screen.getByRole('button', { name: 'Later — Job 1' })).toHaveAttribute('aria-expanded', 'true');
    await act(async () => {
      screen.getByRole('button', { name: 'Later — Job 2' }).focus();
    });
    expect(screen.getByRole('button', { name: 'Later — Job 1' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers a hand-off no “Later”: it has nothing to put off', () => {
    renderSheet([
      {
        ...entry(9, { kind: 'handoff', text: 'Leah handed you Ridge House', actionLabel: 'Open project file' }),
        key: 'handoff:p9',
      },
    ]);
    expect(screen.queryByRole('button', { name: /^Later/ })).not.toBeInTheDocument();
  });

  it('holds a settling line at the height it stood, so its card keeps its height', () => {
    const height = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(132);
    try {
      const needs = [entry(1)];
      const { container, rerender } = render(sheetElement(needs));
      expect(lineOf(container, 'task_due:t1').style.minHeight).toBe('');
      rerender(
        sheetElement(needs, {
          states: new Map([state('task_due:t1', { deferredUntil: '2026-10-12', updatedAt: at(10) })]),
        }),
      );
      const settledLine = lineOf(container, 'task_due:t1');
      expect(settledLine).toHaveClass('settled');
      expect(settledLine.style.minHeight).toBe('132px');
      // Undone, the open line gives the floor back.
      rerender(sheetElement(needs));
      expect(lineOf(container, 'task_due:t1')).not.toHaveClass('settled');
      expect(lineOf(container, 'task_due:t1').style.minHeight).toBe('');
    } finally {
      height.mockRestore();
    }
  });
});

describe('DaySheet — the eyebrow', () => {
  it('heads Today with the day, the arrival head and settle (U-Q3)', () => {
    const { container } = renderSheet([entry(1)]);
    const heads = container.querySelectorAll<HTMLElement>('[data-part~="head"]');
    expect(heads).toHaveLength(1);
    expect(heads[0]).toHaveTextContent(/^Friday 9 October · Today$/);
    expect(heads[0].getAttribute('data-part')).toBe('head settle');
    expect(heads[0].tabIndex).toBe(-1);
    expect(screen.getByRole('region', { name: 'Friday 9 October · Today' })).toBe(screen.getByTestId('day-sheet'));
    // Card one carries the arrival's job mark; the top line its headline and act.
    expect(container.querySelector('[data-desk-card="p1"] [data-part="job"]')).toHaveTextContent('Job 1');
    expect(lineOf(container, 'task_due:t1').querySelector('[data-part="headline"]')).not.toBeNull();
  });

  it('offers the scope as Mine · The studio’s on the eyebrow’s line', async () => {
    const { onScope } = renderSheet([entry(1)]);
    const scope = screen.getByRole('group', { name: 'Whose lines' });
    expect(scope.closest('.sec-head')).toContainElement(screen.getByText(/· Today$/));
    expect(within(scope).getByRole('button', { name: 'The studio’s' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      await userEvent.setup().click(within(scope).getByRole('button', { name: 'Mine' }));
    });
    expect(onScope).toHaveBeenCalledWith('mine');
  });
});

describe('DaySheet — the acts', () => {
  it('“Not today” puts the need off until the next working day, through useSetNeedState', async () => {
    renderSheet([entry(1)]);
    await openLater('Job 1');
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Not today — Job 1' }));
    });
    expect(mockMutate).toHaveBeenCalledWith(
      { needKey: 'task_due:t1', engagementId: 'p1', action: 'not_today', until: nextWorkingDay(NOW) },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(nextWorkingDay(NOW)).toBe('2026-10-12');
  });

  it('offers “Not today” on a pre-project line too, keyed by its engagement (SQ-778 N5)', async () => {
    const chen = entry(1, { kind: 'overdue_invoice', text: '$3,400 due 12 May' });
    const aspen = {
      ...entry(2, { kind: 'proposal_unviewed', text: 'Issued 2 October · not yet viewed' }),
      projectId: 'proposal-aspen',
    };
    const { container } = renderSheet([chen, aspen]);
    for (const line of Array.from(lines(container))) {
      expect(within(line).getByRole('button', { name: /^Later — / })).toHaveAttribute('aria-expanded', 'false');
    }
    await openLater('Job 2');
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Not today — Job 2' }));
    });
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ needKey: 'task_due:t2', engagementId: 'proposal-aspen', action: 'not_today' }),
      expect.anything(),
    );
  });

  it('“Until…” opens Set aside, which writes the day and reason through useSetNeedState (U-Q5)', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    renderSheet([entry(1)]);
    await openLater('Job 1');
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Set aside until a day — Job 1' }));
    });
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('Job 1 · Task 1 is due');
    fireEvent.change(within(sheet).getByLabelText('Back on'), { target: { value: '2026-10-16' } });
    fireEvent.change(within(sheet).getByLabelText('Waiting on'), { target: { value: 'the Chens’ bench decision' } });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Set aside until Friday 16 October' }));
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({
      needKey: 'task_due:t1',
      engagementId: 'p1',
      action: 'set_aside',
      until: '2026-10-16',
      reason: 'the Chens’ bench decision',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('settles a set-aside in place with Undo, and its words name the day and the reason', () => {
    const { container } = renderSheet([entry(1)], {
      states: new Map([
        state('task_due:t1', { setAsideUntil: '2026-10-16', setAsideReason: 'the Chens’ bench decision', updatedAt: at(9, 30) }),
      ]),
    });
    const line = lineOf(container, 'task_due:t1');
    expect(line).toHaveTextContent('Set aside until Friday 16 October · waiting on the Chens’ bench decision');
    expect(within(line).getByRole('button', { name: 'Undo — Job 1' })).toBeInTheDocument();
  });

  it('offers an overdue invoice a quiet “Record payment” door into the one act sheet (U-Q6)', async () => {
    renderSheet([entry(1, { kind: 'overdue_invoice', recordId: 'inv-1', text: 'Invoice INV-1 is $3,800 overdue' })]);
    const door = screen.getByRole('button', { name: 'Record payment — Job 1' });
    expect(door).toHaveAttribute('data-action-variant', 'tertiary');
    await act(async () => {
      await userEvent.setup().click(door);
    });
    expect(mockOpenAct).toHaveBeenCalledWith(expect.objectContaining({ key: 'task_due:t1' }), 'record-payment');
    // A task has no payment to record, so it has no such door.
    renderSheet([entry(2)]);
    expect(screen.queryByRole('button', { name: 'Record payment — Job 2' })).not.toBeInTheDocument();
  });

  it('opens a maker payment’s own act in the record-payment sheet, not the Orders ledger (U-Q6)', async () => {
    mockOpenAct.mockReturnValueOnce(true);
    jest.requireMock('@/components/document/command-bar').openLedger.mockClear();
    renderSheet([
      entry(1, {
        kind: 'payment_due',
        recordId: 'pay-1',
        text: 'Balance to Calloway & Brandt · $3,400 due Friday 16 October — PO-CR-0412',
        actionLabel: 'Record payment',
        ledger: { name: 'orders', context: { page: 'ledger', projectId: 'p1', purchaseOrderId: 'po-1' } },
      }),
    ]);
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('link', { name: 'Record payment — Job 1' }));
    });
    expect(mockOpenAct).toHaveBeenCalledWith(expect.objectContaining({ key: 'task_due:t1' }));
    expect(jest.requireMock('@/components/document/command-bar').openLedger).not.toHaveBeenCalled();
    // Its own act is the door: no second "Record payment" beside it.
    expect(screen.getAllByRole('link', { name: /Record payment/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Record payment/ })).not.toBeInTheDocument();
  });

  it('says so on its line when “Not today” did not save (SQ-751 F6)', async () => {
    mockMutate.mockImplementation((_vars, options) => options?.onError?.(new Error('refused')));
    const { container } = renderSheet([entry(1)]);
    await openLater('Job 1');
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Not today — Job 1' }));
    });
    expect(within(lineOf(container, 'task_due:t1')).getByRole('alert')).toHaveTextContent(
      'Not today did not save. Try again.',
    );
  });

  it('opts every line’s mark into the inline error surface, never a toast (SQ-777 F2)', () => {
    mockSetNeedStateOptions.length = 0;
    renderSheet([entry(1), entry(2)]);
    expect(mockSetNeedStateOptions.length).toBeGreaterThan(0);
    expect(mockSetNeedStateOptions.every((o) => (o as { errorSurface?: string })?.errorSurface === 'inline')).toBe(true);
  });

  const handoff: DeskNeed = {
    key: 'handoff:p9',
    projectId: 'p9',
    projectName: 'Ridge House',
    need: {
      key: 'handoff:p9',
      kind: 'handoff',
      text: 'Leah handed you Ridge House on Thursday, October 8',
      actionLabel: 'Open project file',
      stamp: { label: 'HAND-OFF', color: 'var(--color-dusty-blue)' },
      urgent: false,
      owner: 'designer',
      deepLink: '/doc/p9',
    } as NeedLine,
  };
  const openHandoff = async () => {
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('link', { name: 'Open project file — Ridge House' }));
    });
  };

  it('marks a hand-off read when she opens it, then opens the job (walk W-D6)', async () => {
    mockMutate.mockImplementation((_vars, options) => options?.onSuccess?.());
    renderSheet([handoff]);
    expect(screen.queryByRole('button', { name: /Not today/ })).not.toBeInTheDocument();
    await openHandoff();
    expect(mockMutate).toHaveBeenCalledWith(
      { needKey: 'handoff:p9', projectId: 'p9', action: 'acted' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockPush).toHaveBeenCalledWith('/doc/p9');
  });

  it('a hand-off read that did not save stays on the sheet and says so (SQ-774 R7)', async () => {
    mockMutate.mockImplementation((_vars, options) => options?.onError?.(new Error('refused')));
    renderSheet([handoff]);
    await openHandoff();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('The hand-off was not marked read. Try again.');
  });
});

describe('DaySheet — a line settles in place (U-Q2, U-Q11)', () => {
  it('prints what was done and who the studio waits on, muted, with no foot', () => {
    const invoice = entry(1, { kind: 'overdue_invoice', text: 'Invoice 1042 is $3,800 overdue' });
    const { container } = renderSheet([invoice, entry(2)], {
      states: new Map([state(invoice.key, { actedAt: at(8, 42), updatedAt: at(8, 42), waitingOn: 'Nora and Sam Holloway' })]),
    });
    const line = lineOf(container, invoice.key);
    expect(line).toHaveClass('settled');
    expect(line).toHaveTextContent(/^Reminder sent · waiting on Nora and Sam Holloway since 8:42$/);
    expect(line.querySelector('.foot')).toBeNull();
    expect(within(line).queryAllByRole('link')).toHaveLength(0);
    expect(within(line).queryAllByRole('button')).toHaveLength(0);
    // No slot refills: both lines keep their places.
    expect(lines(container)).toHaveLength(2);
    expect(container.textContent).not.toMatch(/✓|cleared|\d+ done/i);
  });

  it('offers Undo on her own “Not today”, which clears the state row', async () => {
    const { container } = renderSheet([entry(1)], {
      states: new Map([state('task_due:t1', { deferredUntil: '2026-10-12', updatedAt: at(9, 15) })]),
    });
    const line = lineOf(container, 'task_due:t1');
    expect(line).toHaveTextContent(/^Not today · 9:15 · back Monday 12 October/);
    await act(async () => {
      await userEvent.setup().click(within(line).getByRole('button', { name: 'Undo — Job 1' }));
    });
    expect(mockMutate).toHaveBeenCalledWith(
      { needKey: 'task_due:t1', engagementId: 'p1', action: 'clear' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('moves focus to the settled line’s Undo after her act, and says so once, politely', async () => {
    const needs = [entry(1)];
    const { container, rerender } = render(sheetElement(needs));
    await openLater('Job 1');
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Not today — Job 1' }));
    });
    // The state write lands: the read returns the row, and the line settles.
    rerender(
      sheetElement(needs, {
        states: new Map([state('task_due:t1', { deferredUntil: '2026-10-12', updatedAt: at(10) })]),
      }),
    );
    expect(within(lineOf(container, 'task_due:t1')).getByRole('button', { name: 'Undo — Job 1' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Job 1: Not today · 10:00 · back Monday 12 October');
  });

  it('after Undo lands, focus moves to the restored line’s act and the status says “Undone.” (R6)', async () => {
    const needs = [entry(1), entry(2)];
    const deferred = new Map([state('task_due:t1', { deferredUntil: '2026-10-12', updatedAt: at(9, 15) })]);
    const { container, rerender } = render(sheetElement(needs, { states: deferred }));
    await act(async () => {
      await userEvent.setup().click(within(lineOf(container, 'task_due:t1')).getByRole('button', { name: 'Undo — Job 1' }));
    });
    // The clear lands: the read returns no row, and the line is open again.
    rerender(sheetElement(needs, { states: new Map() }));
    const line = lineOf(container, 'task_due:t1');
    expect(line).not.toHaveClass('settled');
    expect(within(line).getByRole('link', { name: 'Open the task — Job 1' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(/^Job 1: Undone\.$/);
    // Same place, nothing refilled.
    expect(Array.from(lines(container), (el) => el.getAttribute('data-day-sheet-line'))).toEqual([
      'task_due:t1',
      'task_due:t2',
    ]);
  });

  it('after Undo lands on a line she does not carry, focus moves to the line itself (R6)', async () => {
    const needs = [entry(1)];
    const options = { holderOf: () => JORDAN };
    const deferred = new Map([state('task_due:t1', { deferredUntil: '2026-10-12', updatedAt: at(9, 15) })]);
    const { container, rerender } = render(sheetElement(needs, { states: deferred }, options));
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Undo — Job 1' }));
    });
    rerender(sheetElement(needs, { states: new Map() }, options));
    expect(lineOf(container, 'task_due:t1').querySelector('p.line')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(/^Job 1: Undone\.$/);
  });

  it('after Undo lands on her “Not today” that masked the holder’s act today, focus moves to the line that act settles (R6b)', async () => {
    const needs = [entry(1)];
    const jordanActed = new Map([['task_due:t1', [{ userId: 'u-jordan', actedAt: at(9, 30) }]]]);
    const over = {
      leads: new Map([['p1', { leadUserId: 'u-jordan', leadName: 'Jordan Reyes' }]]) as never,
      teammateActs: jordanActed,
    };
    const options = {
      scope: 'studio' as const,
      holderOf: () => JORDAN,
      teammateActed: jordanActed,
      names: new Map([['u-jordan', 'Jordan Reyes']]),
    };
    const deferred = new Map([state('task_due:t1', { deferredUntil: '2026-10-12', updatedAt: at(9, 45) })]);
    const { container, rerender } = render(sheetElement(needs, { ...over, states: deferred }, options));
    expect(lineOf(container, 'task_due:t1')).toHaveTextContent(/^Not today · 9:45 · back Monday 12 October/);
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Undo — Job 1' }));
    });
    // The clear lands: her row is gone, and Jordan's act today settles the line.
    rerender(sheetElement(needs, { ...over, states: new Map() }, options));
    const line = lineOf(container, 'task_due:t1');
    expect(line).toHaveClass('settled');
    expect(line).toHaveTextContent(/^Done by Jordan · waiting on Job 1 since 9:30$/);
    expect(within(line).queryByRole('button', { name: /Undo/ })).toBeNull();
    expect(line.querySelector('p.line')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(/^Job 1: Undone\.$/);
    // The Undo is spent: a later deferral that lifts without one moves nothing.
    rerender(sheetElement(needs, { ...over, states: deferred }, options));
    (document.activeElement as HTMLElement).blur();
    rerender(sheetElement(needs, { ...over, states: new Map() }, options));
    expect(document.body).toHaveFocus();
  });

  it('an Undo that did not save keeps the line settled and focus where it was, and says so (R6)', async () => {
    mockMutate.mockImplementation((_vars, options) => options?.onError?.(new Error('refused')));
    const needs = [entry(1)];
    const deferred = new Map([state('task_due:t1', { deferredUntil: '2026-10-12', updatedAt: at(9, 15) })]);
    const { container, rerender } = render(sheetElement(needs, { states: deferred }));
    const undo = screen.getByRole('button', { name: 'Undo — Job 1' });
    await act(async () => {
      await userEvent.setup().click(undo);
    });
    rerender(sheetElement(needs, { states: deferred }));
    expect(lineOf(container, 'task_due:t1')).toHaveClass('settled');
    expect(undo).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('Undo did not save. Try again.');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('a settled line read before today is not on Today: it is past, not settled', () => {
    const waiting = entry(1, { owner: 'maker' });
    const { container } = renderSheet([waiting], {
      states: new Map([state(waiting.key, { actedAt: new Date(2026, 9, 3, 12).toISOString(), waitingOn: 'Fenmoor Joinery' })]),
    });
    expect(lines(container)).toHaveLength(0);
    // "With others" lives in the ledger now.
    expect(container.textContent).not.toMatch(/Awaiting|Fenmoor/);
  });
});

describe('DaySheet — whose move it is (U-Q4)', () => {
  it('prints “The move is Jordan’s.” on a line she does not carry, with no act', () => {
    const { container } = renderSheet([entry(1)], {}, { holderOf: () => JORDAN });
    const line = lineOf(container, 'task_due:t1');
    expect(line.querySelector('p')).toHaveTextContent(/^Task 1 is due The move is Jordan’s\.$/);
    expect(within(line).queryAllByRole('link')).toHaveLength(0);
    expect(within(line).queryAllByRole('button')).toHaveLength(0);
    expect(line.querySelector('[data-register="act"]')).toBeNull();
  });

  it('Mine: a teammate’s act on her job is a fact on her line, and the line stays hers to act on', () => {
    const { container } = renderSheet(
      [entry(1)],
      {
        scope: 'mine',
        leads: new Map([['p1', { leadUserId: 'me', leadName: 'Leah Warner' }]]) as never,
        teammateActs: new Map([['task_due:t1', [{ userId: 'u-jordan', actedAt: at(9, 30) }]]]),
      },
      {
        scope: 'mine',
        holderOf: () => LEAH,
        teammateActed: new Map([['task_due:t1', [{ userId: 'u-jordan', actedAt: at(9, 30) }]]]),
        names: new Map([['u-jordan', 'Jordan Reyes']]),
      },
    );
    const line = lineOf(container, 'task_due:t1');
    expect(line).not.toHaveClass('settled');
    expect(line.querySelector('[data-day-sheet-fact]')).toHaveTextContent(/^Jordan drafted this for you · 9:30$/);
    expect(within(line).getByRole('link', { name: 'Open the task — Job 1' })).toBeInTheDocument();
  });

  it('The studio’s: the holder’s own act settles her teammate’s line, named, with no Undo and no fact', () => {
    const { container } = renderSheet(
      [entry(1)],
      {
        leads: new Map([['p1', { leadUserId: 'u-jordan', leadName: 'Jordan Reyes' }]]) as never,
        teammateActs: new Map([['task_due:t1', [{ userId: 'u-jordan', actedAt: at(9, 30) }]]]),
      },
      {
        scope: 'studio',
        holderOf: () => JORDAN,
        teammateActed: new Map([['task_due:t1', [{ userId: 'u-jordan', actedAt: at(9, 30) }]]]),
        names: new Map([['u-jordan', 'Jordan Reyes']]),
      },
    );
    const line = lineOf(container, 'task_due:t1');
    expect(line).toHaveClass('settled');
    expect(line).toHaveTextContent(/^Done by Jordan · waiting on Job 1 since 9:30$/);
    expect(within(line).queryByRole('button', { name: /Undo/ })).toBeNull();
    expect(line.querySelector('[data-day-sheet-fact]')).toBeNull();
  });
});

describe('DaySheet — quiet', () => {
  it('says nothing needs her once on an empty morning: the sentence is the headline and settle', () => {
    const { container } = renderSheet([]);
    expect(screen.getAllByText(NOTHING_NEEDS_YOU)).toHaveLength(1);
    expect(screen.getByText(NOTHING_NEEDS_YOU)).toHaveAttribute('data-part', 'headline settle');
    expect(container.querySelector('[data-part~="head"]')!.getAttribute('data-part')).toBe('head');
  });

  it('says nothing more needs her once every line in scope settled', () => {
    renderSheet([entry(1)], {
      states: new Map([state('task_due:t1', { actedAt: at(8, 42), updatedAt: at(8, 42) })]),
    });
    expect(screen.getAllByText(NOTHING_NEEDS_YOU_TONIGHT)).toHaveLength(1);
  });

  it('never says nothing needs her while a feed went unread', () => {
    renderSheet([], { unreadFeeds: ['purchase orders'] });
    expect(screen.queryByText(NOTHING_NEEDS_YOU)).toBeNull();
    expect(screen.queryByText(NOTHING_NEEDS_YOU_TONIGHT)).toBeNull();
    expect(screen.getByText('Not checked: purchase orders.')).toBeInTheDocument();
  });
});
