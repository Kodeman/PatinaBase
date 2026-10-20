/**
 * SQ-1518 (QA SQ-1505) — on a phone the opened "Later" menu is scrolled clear
 * of the fixed bottom bar, and a line that settles holds its card's height by
 * clamping her settled words to the room the open line stood in.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NeedLine } from '@/lib/document/desk-derivation';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { deriveDaySheet, groupSheetByJob, type SheetNeedState } from '@/lib/document/day-sheet';
import { DaySheet } from '../day-sheet';

jest.mock('@patina/supabase', () => ({
  useSetNeedState: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('../acts/need-act-sheet', () => ({ useNeedActSheet: () => ({ open: () => false }) }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('../date-text-input', () => ({ DateTextInput: () => null }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/components/document/command-bar', () => ({ openLedger: jest.fn() }));

// Friday 9 October 2026, 10am local.
const NOW = new Date(2026, 9, 9, 10, 0, 0);

const NEED: DeskNeed = {
  key: 'task_due:t1',
  projectId: 'p1',
  projectName: 'Job 1',
  need: {
    key: 'task_due:t1',
    kind: 'task_due',
    text: 'Task 1 is due',
    actionLabel: 'Open the task',
    stamp: { label: 'DUE', color: 'var(--color-clay)' },
    urgent: false,
    owner: 'designer',
    deepLink: '/doc/p1#task-1',
  } as NeedLine,
};

const DEFERRED: SheetNeedState = {
  needKey: NEED.key,
  projectId: null,
  deferredUntil: '2026-10-12',
  actedAt: null,
  waitingOn: null,
  setAsideUntil: null,
  setAsideReason: null,
  updatedAt: new Date(2026, 9, 9, 9, 15).toISOString(),
};

function sheetElement(states: ReadonlyMap<string, SheetNeedState> = new Map()) {
  const sheet = deriveDaySheet({
    needs: [NEED],
    states,
    leads: new Map(),
    meUserId: 'me',
    scope: 'studio',
    unreadFeeds: [],
    now: NOW,
  });
  return (
    <DaySheet
      sheet={sheet}
      cards={groupSheetByJob(sheet.lines, new Map())}
      scope="studio"
      onScope={jest.fn()}
      now={NOW}
      dateLabel="Friday 9 October"
    />
  );
}

const lineItem = (container: HTMLElement) =>
  container.querySelector<HTMLLIElement>(`[data-day-sheet-line="${NEED.key}"]`)!;

describe('DaySheet — the opened “Later” menu clears the bottom bar (SQ-1518)', () => {
  const scrollIntoView = jest.fn();
  const original = Element.prototype.scrollIntoView;
  beforeEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it('scrolls the opened menu into view by the nearest edge, leaving focus on “Later”', async () => {
    render(sheetElement());
    const later = screen.getByRole('button', { name: 'Later — Job 1' });
    expect(scrollIntoView).not.toHaveBeenCalled();

    await act(async () => {
      await userEvent.setup().click(later);
    });

    expect(later).toHaveAttribute('aria-expanded', 'true');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    // The element scrolled is the menu "Later" controls.
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById(later.getAttribute('aria-controls')!));
    expect(later).toHaveFocus();
  });

  it('keeps Escape closing the menu and handing focus back to “Later”', async () => {
    render(sheetElement());
    const later = screen.getByRole('button', { name: 'Later — Job 1' });
    const user = userEvent.setup();
    await act(async () => {
      await user.click(later);
    });
    await act(async () => {
      await user.keyboard('{Escape}');
    });
    expect(later).toHaveAttribute('aria-expanded', 'false');
    expect(later).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

describe('DaySheet — a settled line holds its card’s height (SQ-1518)', () => {
  // A phone-width layout: the open line stands 100px tall with a one-line
  // sentence; her settled words wrap to two 27px lines and would need 127px.
  const LINE_HEIGHT = 27;
  let settledNatural = 127;
  const realGetComputedStyle = window.getComputedStyle;
  const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;

  beforeEach(() => {
    settledNatural = 127;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.matches('li.ln-item')) {
          if (!this.classList.contains('settled')) return 100;
          const floor = parseFloat(this.style.minHeight) || 0;
          return this.style.flex === '0 0 auto' ? Math.max(settledNatural, floor) : floor;
        }
        if (this.matches('p.line')) {
          return this.closest('.settled') ? 2 * LINE_HEIGHT : LINE_HEIGHT;
        }
        return 0;
      },
    });
    jest.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = realGetComputedStyle(el, pseudo);
      if (el instanceof HTMLElement && el.matches('p.line')) {
        Object.defineProperty(style, 'lineHeight', { value: `${LINE_HEIGHT}px` });
      }
      return style;
    });
  });
  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
    jest.restoreAllMocks();
  });

  it('holds the open height as a floor and clamps the words that would outgrow it', () => {
    const { container, rerender } = render(sheetElement());
    rerender(sheetElement(new Map([[NEED.key, DEFERRED]])));

    const item = lineItem(container);
    expect(item).toHaveClass('settled');
    expect(item.style.minHeight).toBe('100px');
    expect(item.style.flex).toBe('');
    const line = item.querySelector<HTMLElement>('p.line')!;
    expect(line.style.getPropertyValue('--settle-lines')).toBe('1');
    // The whole sentence stays in the DOM.
    expect(line).toHaveTextContent(/^Not today · 9:15 · back Monday 12 October$/);
  });

  it('leaves words that fit the floor unclamped', () => {
    settledNatural = 100;
    const { container, rerender } = render(sheetElement());
    rerender(sheetElement(new Map([[NEED.key, DEFERRED]])));
    const line = lineItem(container).querySelector<HTMLElement>('p.line')!;
    expect(line.style.getPropertyValue('--settle-lines')).toBe('');
  });

  it('drops the clamp when the line opens again', () => {
    const { container, rerender } = render(sheetElement());
    rerender(sheetElement(new Map([[NEED.key, DEFERRED]])));
    rerender(sheetElement());
    const item = lineItem(container);
    expect(item).not.toHaveClass('settled');
    expect(item.style.minHeight).toBe('');
    expect(item.querySelector<HTMLElement>('p.line')!.style.getPropertyValue('--settle-lines')).toBe('');
  });
});
