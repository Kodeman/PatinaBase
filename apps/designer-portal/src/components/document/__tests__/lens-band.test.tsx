import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RedLetterRow } from '../red-letter-zone';
import {
  deriveLensBand,
  type LensBandInput,
  type LensBandModel,
  type LensSpreadKind,
} from '@/lib/document/lens-band-derivation';
import { LensBand } from '../lens-band';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

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
