import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RedLetterRow } from '../red-letter-zone';
import {
  deriveLensBand,
  type LensBandInput,
  type LensBandModel,
  type LensSpreadKind,
} from '@/lib/document/lens-band-derivation';
import { LensBand, OPEN_STANDING_SHEET_EVENT } from '../lens-band';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

// Slice 2 — `one-voice` is off unless a test turns it on, so every test above
// the slice-2 block is the flag-off band, unchanged.
let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'one-voice' ? mockOneVoice : false,
    isLoading: false,
  }),
}));
afterEach(() => {
  mockOneVoice = false;
});

const need = (
  key: string,
  kind: RedLetterRow['kind'],
  text: string,
  actionLabel: string,
): RedLetterRow => ({
  key,
  kind,
  text,
  actionLabel,
  onAct: jest.fn(),
  urgent: true,
});

const NEEDS: RedLetterRow[] = [
  need('a', 'overdue_decision', 'Primary bedroom approval overdue 6 days', 'Send a reminder'),
  need('b', 'overdue_decision', 'Living room fabric overdue 3 days', 'Choose the fabric'),
  need('c', 'damage_claim', 'Carrier window, brass-and-oak console', 'Review the claim'),
  need('d', 'po_unacknowledged', 'PO-2026-0418 unanswered, 14 days', 'Follow up with the maker'),
];

const input = (over: Partial<LensBandInput> = {}): LensBandInput => ({
  spreadKind: 'project',
  ticket: [],
  needs: [],
  guide: null,
  tier: 'full',
  household: 'Vandersteen residence',
  stageWord: 'Procurement & Orders',
  stageIndex: { position: 4, of: 6 },
  installDate: 'SEP 15',
  moneyFigure: '$17,500 OUT',
  proposalInvestment: null,
  sentDate: null,
  readingStop: null,
  ...over,
});

const model = (over: Partial<LensBandInput> = {}): LensBandModel =>
  deriveLensBand(input(over));

const band = () => document.querySelector('[data-lens-band]') as HTMLElement;
const line = (n: '1' | '2') =>
  document.querySelector(`[data-lens-line="${n}"]`) as HTMLElement;
const sentence = () =>
  document.querySelector('[data-lens-sentence]') as HTMLElement;

// C-04 — the band owns the sentinel's observer, so the pin is only reachable
// through it: the global jsdom mock never fires, and a capturing one is what
// makes "the sentinel left the frame" a state this suite can actually drive.
let sentinelCallback: IntersectionObserverCallback | null = null;
const originalIO = window.IntersectionObserver;

beforeEach(() => {
  sentinelCallback = null;
  window.IntersectionObserver = jest.fn(
    (callback: IntersectionObserverCallback) => {
      sentinelCallback = callback;
      return {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
        takeRecords: () => [],
        root: null,
        rootMargin: '',
        thresholds: [],
      };
    },
  ) as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  window.IntersectionObserver = originalIO;
});

/** The sentinel has scrolled out of the frame — the band pins. */
const passSentinel = () => {
  act(() => {
    sentinelCallback?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
};

describe('LensBand · the box and the sentinel (C-5)', () => {
  it('renders the sentinel as the band’s IMMEDIATE previous sibling', () => {
    render(<LensBand model={model()} docId="doc-1" />);
    const sentinel = document.getElementById('doc-ticket-sentinel');
    expect(sentinel).not.toBeNull();
    expect(sentinel!.nextElementSibling).toBe(band());
    expect(band().previousElementSibling).toBe(sentinel);
  });

  it('observes that sentinel, and pins on it leaving the frame (C-04, §4)', () => {
    render(<LensBand model={model()} docId="doc-1" />);
    expect(band()).toHaveAttribute('data-lens-open', 'true');
    passSentinel();
    expect(band()).toHaveAttribute('data-lens-open', 'false');
  });

  it('never writes data-lens-state — that attribute is the shell’s (C-01)', () => {
    render(<LensBand model={model()} docId="doc-1" />);
    expect(band()).not.toHaveAttribute('data-lens-state');
    passSentinel();
    expect(band()).not.toHaveAttribute('data-lens-state');
  });

  it('is the sticky, opaque, declared-height box with its own lower rule', () => {
    render(<LensBand model={model()} docId="doc-1" />);
    expect(band().tagName).toBe('SECTION');
    expect(band()).toHaveAccessibleName('The job');
    // jsdom does no layout: the height is asserted as the declared class, and
    // the fallback keeps it true before W3-L3 mints the token.
    expect(band().className).toContain('h-[var(--doc-band-height,56px)]');
    expect(band().className).toContain('box-border');
    expect(band().className).toContain('sticky');
    expect(band().className).toContain('top-0');
    expect(band().className).toContain('z-[4]');
    expect(band().className).toContain('bg-[var(--doc-paper)]');
    expect(band().className).toContain('doc-rule-mid');
  });

  it('holds both lines to one line — and clips the SENTENCE, not the act (C-02)', () => {
    render(<LensBand model={model({ needs: NEEDS })} docId="doc-1" />);
    for (const which of ['1', '2'] as const) {
      expect(line(which).className).toContain('whitespace-nowrap');
    }
    // Line 1 has no inset control on it, so it may clip itself.
    expect(line('1').className).toContain('overflow-hidden');
    expect(line('1').className).toContain('text-ellipsis');
    // Line 2 must not: the act is inset by -12px into the 19.5px line, so an
    // `overflow: hidden` here would cut 12px off its 44px box for painting AND
    // for hit-testing — and at 390 this is that act's only printing.
    expect(line('2').className).not.toContain('overflow-hidden');
    expect(line('2').className).not.toContain('text-ellipsis');
    expect(sentence().className).toContain('overflow-hidden');
    expect(sentence().className).toContain('text-ellipsis');
    const act44 = screen.getByRole('button', { name: 'Send a reminder' });
    expect(act44.className).not.toContain('overflow-hidden');
    expect(
      act44.closest('[data-lens-line="2"]')?.className.includes('overflow'),
    ).toBe(false);
  });

  it('publishes no height and installs no ResizeObserver', () => {
    const observe = jest.spyOn(window.ResizeObserver.prototype, 'observe');
    render(<LensBand model={model()} docId="doc-1" />);
    expect(observe).not.toHaveBeenCalled();
    observe.mockRestore();
  });
});

describe('LensBand · line 1 yields to the letterhead (OD-1, L-6)', () => {
  it('prints only the money figure at s0, with the household and stage yielded', () => {
    render(<LensBand model={model()} docId="doc-1" />);
    expect(band()).toHaveAttribute('data-lens-open', 'true');
    expect(line('1')).toHaveTextContent('$17,500 OUT');
    expect(line('1')).not.toHaveTextContent('VANDERSTEEN');
    expect(line('1')).not.toHaveTextContent('PROCUREMENT');
  });

  it('prints the household, the stage and both facts once the sentinel is passed', () => {
    render(<LensBand model={model()} docId="doc-1" />);
    passSentinel();
    expect(band()).toHaveAttribute('data-lens-open', 'false');
    expect(line('1')).toHaveTextContent(
      'VANDERSTEEN RESIDENCE · PROCUREMENT & ORDERS 4 OF 6',
    );
    expect(line('1')).toHaveTextContent('INSTALL SEP 15 · $17,500 OUT');
  });

  it('D-B38 — line 1 keeps its box at every state, so line 2 never rises under it', () => {
    // The brief spread is the emptiest line 1 the band can print at s0: no
    // money, no install, and both left-hand halves yielded to the letterhead.
    render(
      <LensBand
        model={model({
          spreadKind: 'brief',
          household: 'Reinhardt lake house',
          stageWord: 'Brief',
          stageIndex: null,
        })}
        docId="doc-1"
      />,
    );
    expect(line('1')).toHaveTextContent('');
    // 11px mono at leading-[1.4] = 15.4px, one line, declared. Without it the
    // `<p>` collapses to 0 and the band's `justify-center` lifts line 2 by
    // 7.7px — a layout shift of the band's own text with no cause behind it.
    expect(line('1')).toHaveClass('min-h-[15.4px]');

    // And it is the SAME class once the sentinel is passed and line 1 fills.
    passSentinel();
    expect(line('1')).toHaveTextContent('REINHARDT LAKE HOUSE · BRIEF');
    expect(line('1')).toHaveClass('min-h-[15.4px]');
  });

  it('reports the pin upward so the shell can write its own state (D-B19)', () => {
    const onPinChange = jest.fn();
    render(
      <LensBand model={model()} docId="doc-1" onPinChange={onPinChange} />,
    );
    expect(onPinChange).toHaveBeenLastCalledWith(false);
    passSentinel();
    expect(onPinChange).toHaveBeenLastCalledWith(true);
  });

  it('presses the household to the top when the page hands it that act (H4)', () => {
    const onToTop = jest.fn();
    render(<LensBand model={model()} docId="doc-1" onToTop={onToTop} />);
    passSentinel();
    fireEvent.click(
      screen.getByRole('button', { name: 'VANDERSTEEN RESIDENCE' }),
    );
    expect(onToTop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['install' as LensSpreadKind, {}, 'INSTALL SEP 15 · $17,500 OUT'],
    ['care' as LensSpreadKind, {}, '$17,500 OUT'],
    [
      'proposal' as LensSpreadKind,
      {
        household: 'The Byrnes',
        stageWord: 'Proposal',
        stageIndex: null,
        installDate: null,
        proposalInvestment: '$9,400',
        sentDate: 'AUG 19',
      },
      'SENT AUG 19 · $9,400',
    ],
  ])('prints the %s spread’s own right slot', (spreadKind, over, expected) => {
    render(<LensBand model={model({ spreadKind, ...over })} docId="doc-1" />);
    passSentinel();
    expect(line('1')).toHaveTextContent(expected);
  });

  it('leaves the brief spread with no right slot at all — no fallback figure', () => {
    render(
      <LensBand
        model={model({
          spreadKind: 'brief',
          household: 'Reinhardt lake house',
          stageWord: 'Brief',
          stageIndex: null,
        })}
        docId="doc-1"
      />,
    );
    passSentinel();
    expect(line('1')).toHaveTextContent('REINHARDT LAKE HOUSE · BRIEF');
    expect(line('1')).not.toHaveTextContent('$');
    expect(line('1')).not.toHaveTextContent('INSTALL');
  });
});

describe('LensBand · line 2, the sentence that changes (L-1, L-11)', () => {
  it('names the worst standing exception, in terracotta, with its act', () => {
    render(<LensBand model={model({ needs: NEEDS })} docId="doc-1" />);
    expect(line('2')).toHaveTextContent('Primary bedroom approval overdue 6 days');
    expect(line('2')).toHaveAttribute('data-lens-line2-form', 'long');
    expect(line('2').className).toContain('text-[var(--color-terracotta-ink)]');
    expect(
      screen.getByRole('button', { name: 'Send a reminder' }),
    ).toBeInTheDocument();
  });

  it('prints the short form, and marks it, where the long one will not fit (D-B24)', () => {
    render(
      <LensBand model={model({ needs: NEEDS, tier: 'mobile' })} docId="doc-1" />,
    );
    expect(line('2')).toHaveAttribute('data-lens-line2-form', 'short');
    expect(sentence()).toHaveTextContent('OVERDUE 6D · BEDROOM');
    // The act shortens to its verb; the door prints whole in both forms.
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+3 MORE' })).toBeInTheDocument();
  });

  it('prints the guide sentence in charcoal when nothing stands', () => {
    render(
      <LensBand
        model={model({
          guide: {
            text: 'Name the phases for this project',
            act: { label: 'Open the schedule', onAct: jest.fn() },
          },
        })}
        docId="doc-1"
      />,
    );
    expect(line('2')).toHaveTextContent('Name the phases for this project');
    expect(line('2').className).toContain('text-[var(--text-primary)]');
    expect(line('2').className).not.toContain('terracotta');
  });

  it('carries the crossfade and its reduced-motion form on the sentence', () => {
    render(<LensBand model={model({ needs: NEEDS })} docId="doc-1" />);
    expect(sentence().className).toContain('transition-opacity');
    expect(sentence().className).toContain('ease-[var(--ease-editorial)]');
    expect(sentence().className).toContain('duration-[150ms]');
    expect(sentence().className).toContain('motion-reduce:transition-none');
  });

  it('turns the sentence out at 90ms and prints the new one in its place', async () => {
    jest.useFakeTimers();
    try {
      const { rerender } = render(
        <LensBand model={model({ needs: NEEDS })} docId="doc-1" />,
      );
      rerender(
        <LensBand model={model({ needs: NEEDS.slice(2) })} docId="doc-1" />,
      );
      expect(sentence().className).toContain('duration-[90ms]');
      expect(sentence().className).toContain('opacity-0');
      act(() => {
        jest.advanceTimersByTime(90);
      });
      expect(sentence().textContent).toBe(
        'Carrier window, brass-and-oak console',
      );
      expect(sentence().className).toContain('opacity-100');
    } finally {
      jest.useRealTimers();
    }
  });

  it('swaps instantly under reduced motion — no blank window at all (FID-05)', () => {
    const matchMedia = jest.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      onchange: null,
      dispatchEvent: jest.fn(),
    }));
    const original = window.matchMedia;
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
    jest.useFakeTimers();
    try {
      const { rerender } = render(
        <LensBand model={model({ needs: NEEDS })} docId="doc-1" />,
      );
      rerender(
        <LensBand model={model({ needs: NEEDS.slice(2) })} docId="doc-1" />,
      );
      // No timer has run, and the new words are already on the page.
      expect(sentence().textContent).toBe(
        'Carrier window, brass-and-oak console',
      );
      expect(sentence().className).toContain('opacity-100');
      expect(sentence().className).not.toContain('opacity-0');
    } finally {
      jest.useRealTimers();
      window.matchMedia = original;
    }
  });

  it('opens the standing sheet on +3 MORE, and the sheet lists all four', () => {
    render(<LensBand model={model({ needs: NEEDS })} docId="doc-1" />);
    const more = screen.getByRole('button', { name: '+3 MORE' });
    fireEvent.click(more);

    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('data-doc-sheet-kind', 'standing');
    expect(panel).toHaveAccessibleName('Standing · 4');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    for (const label of [
      'Send a reminder',
      'Choose the fabric',
      'Review the claim',
      'Follow up with the maker',
    ]) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0);
    }
  });

  it('counts the open inputs in the door and files them in their own section (W3-R2)', () => {
    const onAct = jest.fn();
    render(
      <LensBand
        model={model({
          needs: NEEDS,
          inputs: [
            {
              key: 'signature',
              eyebrow: 'SIGNATURE',
              sentence: 'Client signature · Client · blocks Project activation',
              act: { label: 'Follow up', onAct },
            },
          ],
        })}
        docId="doc-1"
      />,
    );
    // Four exceptions + one input, minus the one line 2 is naming.
    fireEvent.click(screen.getByRole('button', { name: '+4 MORE' }));
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAccessibleName('Standing · 5');
    expect(panel).toHaveTextContent('INPUT NEEDED · 1');
    expect(
      panel.querySelectorAll('[data-standing-input-row]'),
    ).toHaveLength(1);
    expect(panel).toHaveTextContent(
      'Client signature · Client · blocks Project activation',
    );
    // The exception rows come first, the inputs under their own heading.
    const heading = panel.querySelector(
      '[data-standing-input-heading]',
    ) as HTMLElement;
    const firstException = panel.querySelector(
      '[data-standing-row]',
    ) as HTMLElement;
    expect(
      heading.compareDocumentPosition(firstException) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  // D1 — a row with no facet to land on asks for nothing rather than
  // borrowing the band's act; a row with one carries its OWN.
  it('gives each input row its own act, and prints only the sentence without one', () => {
    const onBudget = jest.fn();
    render(
      <LensBand
        model={model({
          guide: { text: 'Yours to add: phases & fees.', act: null },
          inputs: [
            {
              key: '0:Working budget',
              eyebrow: 'BUDGET',
              sentence: 'Working budget · Client · blocks Direction',
              act: { key: 'input:Working budget', label: 'Add Working budget', onAct: onBudget },
            },
            {
              key: '1:phases & fees',
              eyebrow: 'FEES',
              sentence: 'phases & fees · Designer · blocks Client proposal',
              act: null,
            },
          ],
        })}
        docId="doc-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+2 MORE' }));
    const panel = screen.getByRole('dialog');
    const rows = panel.querySelectorAll('[data-standing-input-row]');
    expect(rows).toHaveLength(2);
    expect(rows[1].querySelectorAll('button')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Add Working budget' }));
    expect(onBudget).toHaveBeenCalledTimes(1);
  });

  // R5 — the seed is in flight: the leader is held rather than pressable twice.
  it('holds the act while its own work is in flight', () => {
    const onAct = jest.fn();
    render(
      <LensBand
        model={model({
          guide: {
            text: 'Discovery is complete. Shape the direction.',
            act: { key: 'rest-discovery', label: 'Begin the direction', onAct, disabled: true },
          },
        })}
        docId="doc-1"
      />,
    );

    const leader = screen.getByRole('button', { name: 'Begin the direction' });
    expect(leader).toBeDisabled();
    fireEvent.click(leader);
    expect(onAct).not.toHaveBeenCalled();
  });

  it('tells the page when the sheet opens and when the act is taken (D-B22)', () => {
    const onStandingOpened = jest.fn();
    const onActed = jest.fn();
    render(
      <LensBand
        model={model({ needs: NEEDS })}
        docId="doc-1"
        onActed={onActed}
        onStandingOpened={onStandingOpened}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send a reminder' }));
    expect(onActed).toHaveBeenCalledTimes(1);
    expect(NEEDS[0].onAct).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '+3 MORE' }));
    expect(onStandingOpened).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the +N MORE word when the sheet is put back (L-11 reverse)', async () => {
    render(<LensBand model={model({ needs: NEEDS })} docId="doc-1" />);
    const more = screen.getByRole('button', { name: '+3 MORE' });
    more.focus();
    fireEvent.click(more);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '+3 MORE' })).toHaveFocus(),
    );
  });

  it('never announces a stop the sentence has since turned past (C-11)', async () => {
    const readingStop = {
      key: 'ffe' as const,
      label: 'Pieces',
      countLine: '36 lines · 4 rooms · 1 damaged',
    };
    const announce = () => line('2').querySelector('[data-lens-announce]');
    const { rerender } = render(
      <LensBand
        model={model({ needs: NEEDS, readingStop })}
        readingStop={readingStop}
        docId="doc-1"
      />,
    );
    expect(announce()).toHaveTextContent(
      'Now at Pieces · 36 lines · 4 rooms · 1 damaged',
    );

    // Line 2 turns while the stop is unchanged. Line 2 is `aria-atomic`, so
    // leaving the stop line in place would re-read it with the new sentence —
    // a stop the reader arrived at minutes ago, announced again.
    rerender(
      <LensBand
        model={model({ needs: NEEDS.slice(2), readingStop })}
        readingStop={readingStop}
        docId="doc-1"
      />,
    );
    // The line turns over 90ms; the stop line goes when the new words land.
    await waitFor(() => expect(announce()).toHaveTextContent(''));
  });

  it('prints no door while only one thing stands', () => {
    render(<LensBand model={model({ needs: NEEDS.slice(0, 1) })} docId="doc-1" />);
    expect(screen.queryByText(/MORE$/)).toBeNull();
  });

  // C-12 — OD-6 names the `+N MORE` button as BOTH the sheet's trigger and its
  // fallback, so the one case the fallback exists for is the one it cannot
  // answer: the door unmounting while the sheet stands open.
  it('falls back to line 2’s act when the door unmounts under the open sheet', async () => {
    const { rerender } = render(
      <LensBand model={model({ needs: NEEDS })} docId="doc-1" />,
    );
    const more = screen.getByRole('button', { name: '+3 MORE' });
    more.focus();
    fireEvent.click(more);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // An act inside the sheet resolves three of the four needs; the door goes.
    rerender(
      <LensBand model={model({ needs: NEEDS.slice(0, 1) })} docId="doc-1" />,
    );
    await waitFor(() => expect(screen.queryByText(/MORE$/)).toBeNull());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send a reminder' })).toHaveFocus(),
    );
    expect(document.body).not.toHaveFocus();
  });

  // ── W3-F7 — the door is painted in the register of what it withholds ────
  it('paints the door clay when every withheld row is an open input', () => {
    render(
      <LensBand
        model={model({
          needs: [],
          inputs: [
            {
              key: '0:Working budget',
              eyebrow: 'BUDGET',
              sentence: 'Working budget \u00b7 Client \u00b7 blocks Direction',
              act: null,
            },
          ],
          guide: { text: 'Waiting on Avery: working budget.', act: null },
        })}
        docId="doc-1"
      />,
    );
    const door = screen.getByRole('button', { name: '+1 MORE' });
    expect(door).toHaveClass('text-[var(--color-clay-ink)]');
    expect(door.className).not.toMatch(/terracotta/);
  });

  it('paints it terracotta the moment an exception is behind it', () => {
    render(<LensBand model={model({ needs: NEEDS })} docId="doc-1" />);
    const door = screen.getByRole('button', { name: '+3 MORE' });
    expect(door).toHaveClass('text-[var(--color-terracotta-ink)]');
  });

  // ── D10 — setup is clay, in the sheet's SETUP group, never line 2 ────────
  describe('setup (D10)', () => {
    const NAME_THE_PHASES = need(
      'schedule-0',
      'schedule_unconfigured',
      'Name the phases so the schedule can be built',
      'Name the phases',
    );
    const GUIDE = { text: 'Place the orders for the approved pieces.', act: null };

    it('never wins line 2 while an exception stands, and is never terracotta in the sheet', () => {
      render(
        <LensBand
          model={model({
            needs: [NAME_THE_PHASES, ...NEEDS],
            setup: [{ kind: 'no_client_linked', onAct: jest.fn() }],
          })}
          docId="doc-1"
        />,
      );
      expect(sentence()).not.toHaveTextContent(NAME_THE_PHASES.text);
      fireEvent.click(screen.getByRole('button', { name: '+5 MORE' }));

      const heading = document.querySelector('[data-standing-setup-heading]');
      expect(heading).toHaveTextContent('SETUP');
      expect(heading).toHaveClass('text-[var(--color-clay-ink)]');
      const rows = Array.from(
        document.querySelectorAll('[data-standing-setup-row]'),
      );
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Name the phases'),
        expect.stringContaining('No client linked'),
      ]);
      for (const row of rows) {
        expect(row.innerHTML).not.toMatch(/terracotta/);
      }
      // The setup rows are not standing-exception rows.
      expect(document.querySelectorAll('[data-standing-row]')).toHaveLength(4);
    });

    it('on a quiet job (Cedar Lane) prints the guide line in charcoal and a clay door', () => {
      render(
        <LensBand
          model={model({ needs: [NAME_THE_PHASES], guide: GUIDE })}
          docId="doc-1"
        />,
      );
      expect(line('2')).toHaveAttribute('data-lens-line2-kind', 'guide');
      expect(sentence()).toHaveTextContent(GUIDE.text);
      expect(line('2').className).not.toMatch(/terracotta/);
      const door = screen.getByRole('button', { name: '+1 MORE' });
      expect(door).toHaveClass('text-[var(--color-clay-ink)]');
      expect(door.className).not.toMatch(/terracotta/);

      fireEvent.click(door);
      expect(
        document.querySelector('[data-standing-setup-row]'),
      ).toHaveTextContent('Name the phases');
    });

    it('presses `Link a client` from the SETUP row', () => {
      const onAct = jest.fn();
      render(
        <LensBand
          model={model({
            guide: GUIDE,
            setup: [{ kind: 'no_client_linked', onAct }],
          })}
          docId="doc-1"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: '+1 MORE' }));
      expect(screen.getAllByText('No client linked')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Link a client' }));
      expect(onAct).toHaveBeenCalledTimes(1);
    });

    it.each(['completed', 'on_hold'])(
      'prints no `No client linked` row on a %s job',
      (projectStatus) => {
        render(
          <LensBand
            model={model({
              guide: GUIDE,
              setup: [{ kind: 'no_client_linked', onAct: jest.fn() }],
              projectStatus,
            })}
            docId="doc-1"
          />,
        );
        expect(screen.queryByRole('button', { name: /MORE$/ })).toBeNull();
        expect(screen.queryByText('No client linked')).toBeNull();
      },
    );
  });

  it('falls back to the band itself when neither door nor act is left', async () => {
    const actless: RedLetterRow[] = [
      { ...NEEDS[0], actionLabel: null },
      { ...NEEDS[1], actionLabel: null },
    ];
    const { rerender } = render(
      <LensBand model={model({ needs: actless })} docId="doc-1" />,
    );
    const more = screen.getByRole('button', { name: '+1 MORE' });
    more.focus();
    fireEvent.click(more);

    rerender(
      <LensBand model={model({ needs: actless.slice(0, 1) })} docId="doc-1" />,
    );
    await waitFor(() => expect(screen.queryByText(/MORE$/)).toBeNull());
    expect(line('2').querySelector('[data-action-key]')).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(band()).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });
});

describe('LensBand · the one live region (OD-7)', () => {
  const stop = (key: 'ffe' | 'money') =>
    key === 'ffe'
      ? {
          key,
          label: 'Pieces',
          countLine: '36 lines · 4 rooms · 1 damaged',
        }
      : { key, label: 'Money', countLine: '$17,500 out · $12,300 not drawn' };

  it('is line 2, polite and atomic, and the only one on the band', () => {
    render(<LensBand model={model({ needs: NEEDS })} docId="doc-1" />);
    expect(line('2')).toHaveAttribute('aria-live', 'polite');
    expect(line('2')).toHaveAttribute('aria-atomic', 'true');
    expect(band().querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('announces the stop and its own count line, inside that region', () => {
    const readingStop = stop('ffe');
    render(
      <LensBand
        model={model({ readingStop })}
        readingStop={readingStop}
        docId="doc-1"
      />,
    );
    const announce = line('2').querySelector('[data-lens-announce]');
    expect(announce).toHaveTextContent(
      'Now at Pieces · 36 lines · 4 rooms · 1 damaged',
    );
    expect(announce).toHaveClass('sr-only');
  });

  it('announces once per distinct stop, and not again inside the dedupe window', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-29T10:00:00Z'));
    try {
      const ffe = stop('ffe');
      const money = stop('money');
      const announce = () => line('2').querySelector('[data-lens-announce]');
      const { rerender } = render(
        <LensBand model={model({ readingStop: ffe })} readingStop={ffe} docId="doc-1" />,
      );
      expect(announce()).toHaveTextContent(
        'Now at Pieces · 36 lines · 4 rooms · 1 damaged',
      );

      // A distinct stop is a distinct announcement.
      rerender(
        <LensBand model={model({ readingStop: money })} readingStop={money} docId="doc-1" />,
      );
      expect(announce()).toHaveTextContent(
        'Now at Money · $17,500 out · $12,300 not drawn',
      );

      // The same stop again inside the window writes nothing, even when its
      // own count line has moved on underneath it.
      const drawn = { ...money, countLine: '$17,500 out · $0 not drawn' };
      rerender(
        <LensBand
          model={model({ readingStop: drawn })}
          readingStop={drawn}
          docId="doc-1"
        />,
      );
      expect(announce()).toHaveTextContent(
        'Now at Money · $17,500 out · $12,300 not drawn',
      );

      // Past the window, the same stop may speak again.
      act(() => {
        jest.advanceTimersByTime(2001);
      });
      const settled = { ...money, countLine: '$17,500 out · $6,000 not drawn' };
      rerender(
        <LensBand
          model={model({ readingStop: settled })}
          readingStop={settled}
          docId="doc-1"
        />,
      );
      expect(announce()).toHaveTextContent(
        'Now at Money · $17,500 out · $6,000 not drawn',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('says nothing at all while no stop is held', () => {
    render(<LensBand model={model()} docId="doc-1" />);
    expect(line('2').querySelector('[data-lens-announce]')).toHaveTextContent('');
  });
});

// ── Slice 2 (`one-voice`) — D1's eyebrow, D2's Next ─ act and the door ───────

const NOW = new Date('2026-08-29T12:00:00');
const dueNeed = (
  key: string,
  kind: RedLetterRow['kind'],
  text: string,
  actionLabel: string,
  dueOn: string | null,
): RedLetterRow => ({ ...need(key, kind, text, actionLabel), dueOn });
const CHEN_PAYMENT = 'Balance to Woodward & Sons · $12,400 due Aug 20 — PO WS-188';
const CHEN_NEEDS: RedLetterRow[] = [
  dueNeed('approval', 'overdue_decision', 'Primary bedroom approval overdue', 'Send a reminder', '2026-08-23'),
  dueNeed('pay', 'payment_due', CHEN_PAYMENT, 'Record payment', '2026-08-20'),
  dueNeed('po', 'po_unacknowledged', 'PO-2026-0418 unanswered, 14 days', 'Follow up with the maker', null),
];
const chen = (over: Partial<LensBandInput> = {}) =>
  model({ household: 'Chen Residence', needs: CHEN_NEEDS, now: NOW, ...over });
const door = () => document.querySelector('[data-lens-door]') as HTMLElement | null;

describe('LensBand · one voice (slice 2, flag `one-voice`)', () => {
  beforeEach(() => {
    mockOneVoice = true;
  });

  it('prints `STAGE · Name` on line 1 at every stop, with no count anywhere', () => {
    render(<LensBand model={chen()} docId="doc-1" onToTop={jest.fn()} />);
    expect(line('1').querySelector('[data-lens-identity]')).toHaveTextContent(
      'Project · Chen Residence',
    );
    expect(line('1')).toHaveClass('uppercase');
    passSentinel();
    expect(screen.getByRole('button', { name: 'Project · Chen Residence' })).toHaveAttribute(
      'data-lens-to-top',
    );
    expect(band().textContent).not.toMatch(/\d+\s+OF\s+\d+/i);
    expect(band().textContent).not.toMatch(/MORE/);
  });

  it('prints `Project · On hold` on the held fixture and `Care · Closed` with no Next once closed', () => {
    const { unmount } = render(
      <LensBand model={chen({ projectStatus: 'on_hold' })} docId="doc-1" />,
    );
    expect(line('1').querySelector('[data-lens-identity]')).toHaveTextContent('Project · On hold');
    unmount();

    render(<LensBand model={chen({ projectStatus: 'completed' })} docId="doc-1" />);
    expect(line('1').querySelector('[data-lens-identity]')).toHaveTextContent('Care · Closed');
    expect(line('2').querySelector('[data-lens-next-lead]')).toBeNull();
  });

  it('on Chen, reads `Next ─ … RECORD THE PAYMENT` left and `Standing · 2` right, in the 56px box', () => {
    render(<LensBand model={chen()} docId="doc-1" />);
    expect(line('2').querySelector('[data-lens-next-lead]')).toHaveTextContent('Next ─');
    expect(sentence()).toHaveTextContent(CHEN_PAYMENT);
    expect(line('2')).toHaveClass('text-[15px]');
    const act = screen.getByRole('button', { name: 'Record the payment' });
    expect(act).toHaveAttribute('data-action-variant', 'primary');
    expect(door()).toHaveTextContent('Standing · 2');
    expect(door()).toHaveClass('ml-auto');
    // The door follows the act on the same line.
    expect(act.compareDocumentPosition(door() as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: /MORE/ })).toBeNull();
    expect(band().className).toContain('h-[var(--doc-band-height,56px)]');
  });

  it('is silent on the right when nothing stands beside Next', () => {
    render(<LensBand model={chen({ needs: [CHEN_NEEDS[1]] })} docId="doc-1" />);
    expect(screen.getByRole('button', { name: 'Record the payment' })).toBeInTheDocument();
    expect(door()).toBeNull();
  });

  it('opens the sheet in three groups, each row with its own act, and Esc returns focus to the door', async () => {
    const onStandingOpened = jest.fn();
    render(
      <LensBand
        model={chen({ setup: [{ kind: 'no_client_linked', onAct: jest.fn() }] })}
        docId="doc-1"
        onStandingOpened={onStandingOpened}
      />,
    );
    const word = screen.getByRole('button', { name: 'Standing · 3' });
    word.focus();
    fireEvent.click(word);
    expect(onStandingOpened).toHaveBeenCalledTimes(1);

    const panel = screen.getByRole('dialog');
    const headings = Array.from(panel.querySelectorAll('[data-standing-group-heading]')).map(
      (node) => node.textContent,
    );
    expect(headings).toEqual(['BLOCKS MONEY OR A SIGNATURE', 'NEEDS YOU', 'SETUP']);
    const group = (key: string) =>
      panel.querySelector(`[data-standing-group="${key}"]`) as HTMLElement;
    expect(group('money')).toHaveTextContent(CHEN_PAYMENT);
    expect(group('money').querySelector('button')).toHaveTextContent('Record the payment');
    // Deadline order inside the group: the dated decision before the silence.
    const needsYou = Array.from(group('needs-you').querySelectorAll('[data-standing-row]'));
    expect(needsYou.map((row) => row.querySelector('button')?.textContent)).toEqual([
      'Nudge the client',
      'Follow up with the maker',
    ]);
    // SETUP stays clay and plain.
    expect(group('setup').querySelector('[data-standing-group-heading]')).toHaveClass(
      'text-[var(--color-clay-ink)]',
    );
    expect(group('setup').querySelector('button')).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Standing · 3' })).toHaveFocus(),
    );
  });

  it('files the open inputs under NEEDS YOU', () => {
    render(
      <LensBand
        model={chen({
          inputs: [{ key: 'sig', eyebrow: 'SIGNATURE', sentence: 'Client signature', act: null }],
        })}
        docId="doc-1"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Standing · 3' }));
    const needsYou = screen
      .getByRole('dialog')
      .querySelector('[data-standing-group="needs-you"]') as HTMLElement;
    expect(needsYou.querySelector('[data-standing-input-row]')).toHaveTextContent(
      'Client signature',
    );
    expect(screen.getByRole('dialog')).not.toHaveTextContent('INPUT NEEDED');
  });

  it('shows a gated act’s reason beneath it, with the repair act beside it (D3)', () => {
    const repair = jest.fn();
    const base = chen();
    const gated: LensBandModel = {
      ...base,
      voice: {
        ...base.voice,
        standing: base.voice.standing.map((item) =>
          item.needKind === 'po_unacknowledged' && item.act
            ? {
                ...item,
                act: {
                  ...item.act,
                  held: {
                    reason: 'Link a client first.',
                    repair: { key: 'link', label: 'Link a client', onAct: repair },
                  },
                },
              }
            : item,
        ),
      },
    };
    render(<LensBand model={gated} docId="doc-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Standing · 2' }));

    const held = screen.getByRole('button', { name: 'Follow up with the maker' });
    expect(held).toHaveAttribute('aria-disabled', 'true');
    expect(held).not.toBeDisabled();
    expect(held).toHaveAccessibleDescription('Link a client first.');
    fireEvent.click(screen.getByRole('button', { name: 'Link a client' }));
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it('at 390, moves the door to the dock when the measure cannot fit it, and opens the sheet from there', () => {
    const phone = chen({ tier: 'mobile' });
    expect(phone.voice.doorInDock).toBe(true);
    render(<LensBand model={phone} docId="doc-1" />);
    expect(line('2').querySelector('[data-lens-next-lead]')).toHaveTextContent('Next');
    expect(screen.getByRole('button', { name: 'Record the payment' })).toBeInTheDocument();
    expect(door()).toBeNull();

    act(() => {
      window.dispatchEvent(new Event(OPEN_STANDING_SHEET_EVENT));
    });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-doc-sheet-kind', 'standing');
  });

  it('leaves the band exactly as 0b printed it while the flag is off', () => {
    mockOneVoice = false;
    render(<LensBand model={chen()} docId="doc-1" />);
    expect(door()).toBeNull();
    expect(line('2').querySelector('[data-lens-next-lead]')).toBeNull();
    expect(screen.getByRole('button', { name: '+2 MORE' })).toBeInTheDocument();
    expect(line('1').querySelector('[data-lens-identity]')).toHaveTextContent('');
    // The 0b act keeps its source label.
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeInTheDocument();
  });
});
