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

describe('LensBand · the box and the sentinel (C-5)', () => {
  it('renders the sentinel as the band’s IMMEDIATE previous sibling', () => {
    render(<LensBand model={model()} docId="doc-1" />);
    const sentinel = document.getElementById('doc-ticket-sentinel');
    expect(sentinel).not.toBeNull();
    expect(sentinel!.nextElementSibling).toBe(band());
    expect(band().previousElementSibling).toBe(sentinel);
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

  it('holds both lines to one line by construction — nowrap, clipped, elided', () => {
    render(<LensBand model={model({ needs: NEEDS })} docId="doc-1" />);
    for (const which of ['1', '2'] as const) {
      expect(line(which).className).toContain('whitespace-nowrap');
      expect(line(which).className).toContain('overflow-hidden');
      expect(line(which).className).toContain('text-ellipsis');
    }
  });

  it('publishes no height and installs no ResizeObserver', () => {
    const observe = jest.spyOn(window.ResizeObserver.prototype, 'observe');
    render(<LensBand model={model()} docId="doc-1" />);
    expect(observe).not.toHaveBeenCalled();
    expect(
      document.documentElement.style.getPropertyValue('--doc-seam-height'),
    ).toBe('');
    observe.mockRestore();
  });
});

describe('LensBand · line 1 yields to the letterhead (OD-1, L-6)', () => {
  it('prints only the money figure at s0, with the household and stage yielded', () => {
    render(<LensBand model={model()} open docId="doc-1" />);
    expect(band()).toHaveAttribute('data-lens-open', 'true');
    expect(line('1')).toHaveTextContent('$17,500 OUT');
    expect(line('1')).not.toHaveTextContent('VANDERSTEEN');
    expect(line('1')).not.toHaveTextContent('PROCUREMENT');
  });

  it('prints the household, the stage and both facts once the sentinel is passed', () => {
    render(<LensBand model={model()} open={false} docId="doc-1" />);
    expect(band()).toHaveAttribute('data-lens-open', 'false');
    expect(band()).toHaveAttribute('data-lens-state', 'reading');
    expect(line('1')).toHaveTextContent(
      'VANDERSTEEN RESIDENCE · PROCUREMENT & ORDERS 4 OF 6',
    );
    expect(line('1')).toHaveTextContent('INSTALL SEP 15 · $17,500 OUT');
  });

  it('presses the household to the top when the page hands it that act (H4)', () => {
    const onToTop = jest.fn();
    render(
      <LensBand model={model()} open={false} docId="doc-1" onToTop={onToTop} />,
    );
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
    render(
      <LensBand
        model={model({ spreadKind, ...over })}
        open={false}
        docId="doc-1"
      />,
    );
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
        open={false}
        docId="doc-1"
      />,
    );
    expect(line('1')).toHaveTextContent('REINHARDT LAKE HOUSE · BRIEF');
    expect(line('1')).not.toHaveTextContent('$');
    expect(line('1')).not.toHaveTextContent('INSTALL');
  });
});

describe('LensBand · line 2, the sentence that changes (L-1, L-11)', () => {
  it('names the worst standing exception, in terracotta, with its act', () => {
    render(<LensBand model={model({ needs: NEEDS })} docId="doc-1" />);
    expect(line('2')).toHaveTextContent('Primary bedroom approval overdue 6 days');
    expect(line('2').className).toContain('text-[var(--color-terracotta-ink)]');
    expect(
      screen.getByRole('button', { name: 'Send a reminder' }),
    ).toBeInTheDocument();
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
    const sentence = document.querySelector(
      '[data-lens-sentence]',
    ) as HTMLElement;
    expect(sentence.className).toContain('transition-opacity');
    expect(sentence.className).toContain('ease-[var(--ease-editorial)]');
    expect(sentence.className).toContain('duration-[150ms]');
    expect(sentence.className).toContain('motion-reduce:transition-none');
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
      const sentence = () =>
        document.querySelector('[data-lens-sentence]') as HTMLElement;
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

  it('prints no door while only one thing stands', () => {
    render(<LensBand model={model({ needs: NEEDS.slice(0, 1) })} docId="doc-1" />);
    expect(screen.queryByText(/MORE$/)).toBeNull();
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
