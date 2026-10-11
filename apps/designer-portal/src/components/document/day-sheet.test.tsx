/**
 * The Day Sheet component (US-25 slice 4): five sentences at most, a quiet
 * "Not today" beside each act, the honest empty sentence, and nothing that
 * counts — no badge, dot, overflow count, "cleared today" or streak (Q1).
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NeedLine } from '@/lib/document/desk-derivation';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { deriveDaySheet, nextWorkingDay } from '@/lib/document/day-sheet';
import { DaySheet, NOTHING_NEEDS_YOU_TONIGHT, THE_REST } from './day-sheet';

const mockMutate = jest.fn();
let mockSaveFailed = false;
jest.mock('@patina/supabase', () => ({
  useSetNeedState: () => ({ mutate: mockMutate, isPending: false, isError: mockSaveFailed }),
}));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/components/document/command-bar', () => ({ openLedger: jest.fn() }));

// Friday 9 October 2026, 10am local.
const NOW = new Date(2026, 9, 9, 10, 0, 0);

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

function renderSheet(
  needs: DeskNeed[],
  over: Partial<Parameters<typeof deriveDaySheet>[0]> = {},
  // Every job here can hold a need state unless a test says otherwise.
  stateProjects: ReadonlySet<string> | null = new Set(needs.map((n) => n.projectId)),
) {
  const sheet = deriveDaySheet({
    needs,
    states: new Map(),
    leads: new Map(),
    meUserId: 'me',
    scope: 'studio',
    unreadFeeds: [],
    now: NOW,
    ...over,
  });
  const onScope = jest.fn();
  const utils = render(
    <DaySheet sheet={sheet} scope="studio" onScope={onScope} now={NOW} stateProjects={stateProjects} />,
  );
  return { ...utils, onScope };
}

const lines = (container: HTMLElement) =>
  container.querySelectorAll<HTMLElement>('[data-day-sheet-line]');

beforeEach(() => {
  mockMutate.mockReset();
  mockPush.mockReset();
  mockSaveFailed = false;
});

describe('DaySheet', () => {
  it('renders five lines of eight, and says the rest are on their jobs — never a count', () => {
    const { container } = renderSheet(Array.from({ length: 8 }, (_, i) => entry(i + 1)));
    expect(lines(container)).toHaveLength(5);
    expect(screen.getByText(THE_REST)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+ more|\(\d+\)|cleared|streak/i);
  });

  it('writes each line as one sentence led by the job, the act beside it', () => {
    const { container } = renderSheet([entry(1)]);
    const [line] = lines(container);
    expect(line.querySelector('p')).toHaveTextContent(/^Job 1 — Task 1 is due$/);
    expect(within(line).getByRole('link', { name: 'Open the task — Job 1' })).toHaveAttribute(
      'href',
      '/doc/p1#task-1',
    );
  });

  it('names the unscoped fallback Open project file without changing its project link', () => {
    const { container } = renderSheet([entry(1, { actionLabel: undefined })]);
    expect(within(lines(container)[0]).getByRole('link', { name: 'Open project file — Job 1' }))
      .toHaveAttribute('href', '/doc/p1#task-1');
  });

  it('prints the time word only inside a day (Q5), with no dot', () => {
    const { container } = renderSheet([
      entry(1, { at: new Date(2026, 9, 9, 8, 0).toISOString() }),
      entry(2, { at: new Date(2026, 9, 1, 8, 0).toISOString() }),
    ]);
    // Found by key: the sheet ranks its lines (SQ-774 R5), oldest first.
    const fresh = container.querySelector('[data-day-sheet-line="task_due:t1"]')!;
    const old = container.querySelector('[data-day-sheet-line="task_due:t2"]')!;
    expect(fresh).toHaveTextContent('2 hours ago');
    expect(old.textContent).not.toMatch(/ago|yesterday/);
    expect(container.textContent).not.toContain('•');
  });

  it('“Not today” puts the need off until the next working day, through useSetNeedState', async () => {
    renderSheet([entry(1)]);
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Not today — Job 1' }));
    });
    expect(mockMutate).toHaveBeenCalledWith({
      needKey: 'task_due:t1',
      projectId: 'p1',
      action: 'not_today',
      until: nextWorkingDay(NOW),
    });
    expect(nextWorkingDay(NOW)).toBe('2026-10-12');
  });

  it('offers no “Not today” where the job cannot hold a need state (SQ-751 F6, walk W-D3)', () => {
    const { container } = renderSheet([entry(1), entry(2)], {}, new Set(['p1']));
    const [held, unheld] = lines(container);
    expect(within(held).getByRole('button', { name: 'Not today — Job 1' })).toBeInTheDocument();
    expect(within(unheld).queryByRole('button', { name: /Not today/ })).not.toBeInTheDocument();
    // Until the projects are read, no line offers it.
    const unread = renderSheet([entry(3)], {}, null);
    expect(within(unread.container).queryByRole('button', { name: /Not today/ })).not.toBeInTheDocument();
  });

  it('says so when “Not today” did not save (SQ-751 F6)', () => {
    mockSaveFailed = true;
    renderSheet([entry(1)]);
    expect(screen.getByRole('alert')).toHaveTextContent('Not today did not save. Try again.');
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
      await userEvent
        .setup()
        .click(screen.getByRole('link', { name: 'Open project file — Ridge House' }));
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
    // The mark is refused: no onSuccess, and the mutation reports its error.
    const refused = renderSheet([handoff]);
    await openHandoff();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    refused.unmount();
    mockSaveFailed = true;
    renderSheet([handoff]);
    expect(screen.getByRole('alert')).toHaveTextContent('The hand-off was not marked read. Try again.');
  });

  it('joins the job and its fact with one dash; the fact’s own dashes read as commas (walk W-D8)', () => {
    const { container } = renderSheet([
      entry(1, { text: '2 POs sent — no acknowledgment' }),
    ]);
    expect(lines(container)[0].querySelector('p')).toHaveTextContent(
      /^Job 1 — 2 POs sent, no acknowledgment$/,
    );
  });

  it('says nothing needs her once when empty, then what waits on others with dates', () => {
    const waiting = entry(1, { owner: 'maker' });
    const { container } = renderSheet([waiting], {
      states: new Map([
        [
          waiting.key,
          {
            needKey: waiting.key,
            projectId: 'p1',
            deferredUntil: null,
            actedAt: new Date(2026, 9, 3, 12).toISOString(),
            waitingOn: 'Fenmoor Joinery',
            setAsideUntil: null,
            setAsideReason: null,
          },
        ],
      ]),
    });
    expect(screen.getAllByText(NOTHING_NEEDS_YOU_TONIGHT)).toHaveLength(1);
    expect(lines(container)).toHaveLength(0);
    expect(screen.getByText('Awaiting Fenmoor Joinery since 3 October')).toBeInTheDocument();
  });

  it('heads the waiting block "Awaiting" (SQ-752)', () => {
    const waiting = entry(1, { owner: 'maker' });
    renderSheet([waiting], {
      states: new Map([
        [
          waiting.key,
          {
            needKey: waiting.key,
            projectId: 'p1',
            deferredUntil: null,
            actedAt: new Date(2026, 9, 3, 12).toISOString(),
            waitingOn: 'Fenmoor Joinery',
            setAsideUntil: null,
            setAsideReason: null,
          },
        ],
      ]),
    });
    expect(screen.getByRole('heading', { level: 3, name: 'Awaiting' })).toBeInTheDocument();
  });

  it('never says nothing needs her while a feed went unread', () => {
    renderSheet([], { unreadFeeds: ['purchase orders'] });
    expect(screen.queryByText(NOTHING_NEEDS_YOU_TONIGHT)).toBeNull();
    expect(screen.getByText('Not checked: purchase orders.')).toBeInTheDocument();
  });

  it('carries no badge, dot or mark, and no colour of its own (Q1, monochrome)', () => {
    const { container } = renderSheet(Array.from({ length: 6 }, (_, i) => entry(i + 1, { urgent: true })));
    expect(
      container.querySelector('[data-roster-mark], [data-mark-tone], [data-badge], [role="status"]'),
    ).toBeNull();
    for (const el of container.querySelectorAll('*')) {
      const cls = el.className.toString();
      expect(cls).not.toMatch(/\brounded-full\b|\bbg-(?!transparent)|terracotta|clay|sage|dusty/);
      expect(el.getAttribute('style') ?? '').not.toMatch(/color/);
    }
  });

  it('offers the scope as Mine · The studio’s', async () => {
    const { onScope } = renderSheet([entry(1)]);
    expect(screen.getByRole('group', { name: 'Whose projects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'The studio’s' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Mine' }));
    });
    expect(onScope).toHaveBeenCalledWith('mine');
  });
});
