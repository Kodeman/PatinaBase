import { fireEvent, render, screen } from '@testing-library/react';
import type { FFEStageKey } from '@patina/types';

import { SpineGate } from '../spine-gate';
import { TrackingRow } from '../tracking-row';

// ScoredAction renders `next/link` whenever it is given an href. Without an
// app-router context that Link cannot be clicked, and every act on this
// surface IS a link — so stand in a plain anchor that swallows the navigation
// and still runs the handler underneath. The specifier matches the module
// ScoredAction actually imports; a near-miss here silently no-ops.
jest.mock('next/link', () => ({
  __esModule: true,
  default: function MockLink({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  } & Record<string, unknown>) {
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
        {...rest}
      >
        {children}
      </a>
    );
  },
}));

// ── Fixtures ────────────────────────────────────────────────────────────────
// The Vale residence, 5 August 2026 — the deck's own fixture, in cents.

const FURNISHINGS_GATE = {
  variant: 'signature' as const,
  title: 'Furnishings authorization No. 7',
  kindLabel: 'Furnishings authorization',
  totalCents: 689000,
  depositCents: 344500,
  caption: 'Three pieces order the moment you sign.',
  href: '/proposals/prop-7/sign',
};

const PAINTWORK_GATE = {
  variant: 'acceptance' as const,
  title: 'Accept the paintwork',
  kindLabel: 'Trade scope',
  totalCents: 720000,
  depositCents: 144000,
  caption: 'Draws one through three are paid.',
  href: '/projects/vale/trade-scopes/ts-2',
};

const CREDENZA = {
  name: 'Walnut credenza',
  imageUrl: 'https://cdn.patina.test/credenza.jpg',
  priceCents: 840000,
  status: 'production' as FFEStageKey,
};

// ── The gate — the signature device ─────────────────────────────────────────

describe('SpineGate', () => {
  it('renders the break: a square stop above, a lighter resumption below', () => {
    render(<SpineGate {...FURNISHINGS_GATE} />);
    expect(screen.getByTestId('spine-gate-stop')).toBeInTheDocument();
    expect(screen.getByTestId('spine-gate-resume')).toBeInTheDocument();
  });

  it('names what the break waits on, in the mono eyebrow, without the word gate', () => {
    render(<SpineGate {...FURNISHINGS_GATE} />);
    expect(
      screen.getByText('Your name is needed before the line continues.'),
    ).toBeInTheDocument();
  });

  /**
   * `W3-03`. The kind line used to be painted with the phase's own ink mixed
   * into charcoal — `color-mix(procurement 52%, charcoal)` composites to
   * #8E7A37, 3.40:1 on this block's `--bg-warm` ground, below AA at an 11px
   * register. It takes a text token now, and no gate may reintroduce a mix.
   */
  it('writes the kind line in a text token, never a phase mix', () => {
    render(<SpineGate {...FURNISHINGS_GATE} />);
    const kind = screen.getByTestId('spine-gate-kind');
    expect(kind).toHaveClass('text-[var(--text-body)]');
    expect(kind.getAttribute('style')).toBeNull();
  });

  it('states the paper, its kind, its total, and what the deposit does on signing', () => {
    render(<SpineGate {...FURNISHINGS_GATE} />);
    expect(screen.getByText('Furnishings authorization No. 7')).toBeInTheDocument();
    expect(screen.getByTestId('spine-gate-vitals')).toHaveTextContent(
      'Furnishings authorization · $6,890',
    );
    expect(screen.getByTestId('spine-gate-deposit')).toHaveTextContent('$3,445 on signing');
  });

  it('carries the caption in the standing-sentence voice', () => {
    render(<SpineGate {...FURNISHINGS_GATE} />);
    expect(screen.getByTestId('spine-gate-caption')).toHaveTextContent(
      'Three pieces order the moment you sign.',
    );
  });

  it('scores SIGN and points it at the sign flow', () => {
    render(<SpineGate {...FURNISHINGS_GATE} />);
    const act = screen.getByRole('link', { name: /sign/i });
    expect(act).toHaveAttribute('href', '/proposals/prop-7/sign');
    expect(act).toHaveAttribute('data-action-region', 'gate');
    expect(act).toHaveClass('da-act');
  });

  it('reports the follow so the caller can log gateFollowed', () => {
    const onFollow = jest.fn();
    render(<SpineGate {...FURNISHINGS_GATE} onFollow={onFollow} />);
    fireEvent.click(screen.getByRole('link', { name: /sign/i }));
    expect(onFollow).toHaveBeenCalledTimes(1);
  });

  it('an acceptance gate stops the line until you ACCEPT, and names the released draw', () => {
    render(<SpineGate {...PAINTWORK_GATE} />);
    expect(screen.getByTestId('spine-gate')).toHaveAttribute('data-gate-variant', 'acceptance');
    expect(
      screen.getByText('Your acceptance is needed before the line continues.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('spine-gate-deposit')).toHaveTextContent(
      '$1,440 releases on your acceptance',
    );
    expect(
      screen.getByRole('link', { name: /accept the finished work/i }),
    ).toHaveAttribute('href', '/projects/vale/trade-scopes/ts-2');
  });

  it('degrades to a bare gate when the data carries no figures and no caption', () => {
    render(
      <SpineGate variant="signature" title="Design services agreement" href="/proposals/ds-1/sign" />,
    );
    expect(screen.getByText('Design services agreement')).toBeInTheDocument();
    expect(screen.queryByTestId('spine-gate-vitals')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spine-gate-deposit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spine-gate-caption')).not.toBeInTheDocument();
    // still an act — a gate with no figures is still a gate
    expect(screen.getByRole('link', { name: /sign/i })).toBeInTheDocument();
  });

  it('omits the deposit line rather than printing a zero', () => {
    render(<SpineGate {...FURNISHINGS_GATE} depositCents={0} />);
    expect(screen.queryByTestId('spine-gate-deposit')).not.toBeInTheDocument();
  });
});

// ── The tracking row — parcel-grade, with C's stamp ─────────────────────────

describe('TrackingRow', () => {
  it('shows the piece, its agreed price in whole dollars, and its thumbnail', () => {
    render(<TrackingRow {...CREDENZA} />);
    expect(screen.getByText('Walnut credenza')).toBeInTheDocument();
    expect(screen.getByTestId('tracking-row-price')).toHaveTextContent('$8,400');
    expect(screen.getByTestId('tracking-row-thumb')).toHaveAttribute(
      'src',
      'https://cdn.patina.test/credenza.jpg',
    );
  });

  it('draws a quiet placeholder block instead of a gap when there is no image', () => {
    render(<TrackingRow {...CREDENZA} imageUrl={null} />);
    expect(screen.queryByTestId('tracking-row-thumb')).not.toBeInTheDocument();
    expect(screen.getByTestId('tracking-row-thumb-placeholder')).toBeInTheDocument();
  });

  it('takes a dead image off the row rather than showing a broken glyph', () => {
    const { rerender } = render(<TrackingRow {...CREDENZA} />);

    fireEvent.error(screen.getByTestId('tracking-row-thumb'));

    expect(screen.queryByTestId('tracking-row-thumb')).not.toBeInTheDocument();
    expect(screen.getByTestId('tracking-row-thumb-placeholder')).toBeInTheDocument();
    expect(screen.getByText('Walnut credenza')).toBeInTheDocument();

    // A row re-pointed at a live image draws again; the failure is per URL.
    rerender(<TrackingRow {...CREDENZA} imageUrl="https://cdn.patina.test/other.jpg" />);
    expect(screen.getByTestId('tracking-row-thumb')).toBeInTheDocument();
  });

  it('omits the price rather than printing a placeholder figure', () => {
    render(<TrackingRow {...CREDENZA} priceCents={null} />);
    expect(screen.queryByTestId('tracking-row-price')).not.toBeInTheDocument();
  });

  it('runs six stops and fills them to where the piece actually stands', () => {
    render(<TrackingRow {...CREDENZA} />);
    const spine = screen.getByTestId('tracking-row-spine');
    const stops = spine.querySelectorAll('[data-stop]');
    expect(stops).toHaveLength(6);

    const states = Array.from(stops).map((stop) => stop.getAttribute('data-stop-state'));
    // 'production' is the third stop: two passed, one current, three ahead
    expect(states).toEqual(['passed', 'passed', 'current', 'ahead', 'ahead', 'ahead']);
  });

  it('labels the current stop and announces the position to a screen reader', () => {
    render(<TrackingRow {...CREDENZA} />);
    expect(screen.getByTestId('tracking-row-stop-label')).toHaveTextContent('In production');
    expect(screen.getByText('In production — stop 3 of 6')).toBeInTheDocument();
  });

  it('presses a status stamp reading only the stage — no invented place or date', () => {
    render(<TrackingRow {...CREDENZA} />);
    const stamp = screen.getByTestId('tracking-row-stamp');
    expect(stamp).toHaveTextContent('In production');
    // the deck's fixture stamp carried "Dayton, Ohio · est Aug 28"; no column
    // on ClientSelection backs either fact, so the stamp must not carry them
    expect(stamp.textContent?.trim()).toBe('In production');
  });

  it('inks the stamp in the stage’s colour DARKENED, never the raw pastel', () => {
    render(<TrackingRow {...CREDENZA} />);

    // Raw --phase-procurement (#E8C547) as type on the page reads ~1.6:1
    // before the stamp's own 0.72 opacity. The deck ships a separate darkened
    // stamp palette (#96702A) for exactly this mark.
    const darkened = 'color-mix(in srgb, var(--phase-procurement) 45%, var(--color-charcoal))';
    const stamp = screen.getByTestId('tracking-row-stamp');
    expect(stamp).toHaveStyle({ color: darkened });
    expect(stamp.getAttribute('style')).not.toBe('color: var(--phase-procurement);');

    const current = screen
      .getByTestId('tracking-row-spine')
      .querySelector('[data-stop-state="current"]');
    expect(current).toHaveStyle({ backgroundColor: darkened });
  });

  it('collapses the three pre-agreement stages onto the first stop', () => {
    for (const status of ['specified', 'quoted', 'approved'] as FFEStageKey[]) {
      const { unmount } = render(<TrackingRow {...CREDENZA} status={status} />);
      expect(screen.getByTestId('tracking-row')).toHaveAttribute('data-journey-stop', 'Agreed');
      expect(screen.getByTestId('tracking-row-stamp')).toHaveTextContent('Agreed');
      unmount();
    }
  });

  it('reads a placed piece as Installed, with every stop behind it filled', () => {
    render(<TrackingRow {...CREDENZA} status="installed" />);
    const states = Array.from(
      screen.getByTestId('tracking-row-spine').querySelectorAll('[data-stop]'),
    ).map((stop) => stop.getAttribute('data-stop-state'));
    expect(states).toEqual(['passed', 'passed', 'passed', 'passed', 'passed', 'current']);
    expect(screen.getByTestId('tracking-row-stamp')).toHaveTextContent('Installed');
  });
});
