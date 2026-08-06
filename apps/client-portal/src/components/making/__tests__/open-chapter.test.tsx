import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FFEStageKey } from '@patina/types';

import { SpineGate } from '../spine-gate';
import { SpineToll } from '../spine-toll';
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

const INVOICE_4 = {
  invoiceId: 'inv-4',
  invoiceNumber: 'Invoice No. 4',
  totalCents: 1825000,
  paidCents: 912500,
  dueDate: '2026-08-15',
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

  it('names the kind of break in the mono eyebrow — the line stops until you sign', () => {
    render(<SpineGate {...FURNISHINGS_GATE} />);
    expect(screen.getByText('A gate · the line stops until you sign')).toBeInTheDocument();
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
    expect(screen.getByText('A gate · the line stops until you accept')).toBeInTheDocument();
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

// ── The toll — an open balance on the line ──────────────────────────────────

describe('SpineToll', () => {
  it('spells the year only once the due date leaves this one', () => {
    const today = new Date(2026, 7, 5);

    const { unmount } = render(<SpineToll {...INVOICE_4} today={today} />);
    expect(screen.getByTestId('spine-toll-due')).toHaveTextContent(
      'A toll on the line · due August 15',
    );
    unmount();

    render(<SpineToll {...INVOICE_4} dueDate="2027-02-10" today={today} />);
    expect(screen.getByTestId('spine-toll-due')).toHaveTextContent(
      'due February 10, 2027',
    );
  });

  it('runs the ledger in the accountant’s order and derives the balance', () => {
    render(<SpineToll {...INVOICE_4} />);
    const ledger = within(screen.getByTestId('spine-toll-ledger'));
    expect(ledger.getByText('Total')).toBeInTheDocument();
    expect(ledger.getByText('$18,250')).toBeInTheDocument();
    expect(ledger.getByText('Paid')).toBeInTheDocument();
    // paid and balance are the same figure on a half-settled invoice; both
    // must be present, which getAllByText proves without over-asserting order
    expect(ledger.getAllByText('$9,125')).toHaveLength(2);
    expect(ledger.getByText('Balance')).toBeInTheDocument();
  });

  it('names the invoice and the day it comes due', () => {
    render(<SpineToll {...INVOICE_4} />);
    expect(screen.getByText('Invoice No. 4')).toBeInTheDocument();
    expect(screen.getByTestId('spine-toll-due')).toHaveTextContent(
      'A toll on the line · due August 15',
    );
  });

  it('drops the due clause when the invoice carries no due date', () => {
    render(<SpineToll {...INVOICE_4} dueDate={null} />);
    expect(screen.getByTestId('spine-toll-due')).toHaveTextContent('A toll on the line');
    expect(screen.getByTestId('spine-toll-due')).not.toHaveTextContent('due');
  });

  it('falls back to a plain word when the invoice was issued without a number', () => {
    render(<SpineToll {...INVOICE_4} invoiceNumber={null} />);
    expect(screen.getByText('Invoice')).toBeInTheDocument();
  });

  it('floors an overpaid invoice at zero rather than showing a negative toll', () => {
    render(<SpineToll {...INVOICE_4} paidCents={2000000} />);
    expect(within(screen.getByTestId('spine-toll-ledger')).getByText('$0')).toBeInTheDocument();
  });

  it('scores SETTLE THE BALANCE at the invoice, and reports the follow', () => {
    const onFollow = jest.fn();
    render(<SpineToll {...INVOICE_4} onFollow={onFollow} />);
    const act = screen.getByRole('link', { name: /settle the balance/i });
    expect(act).toHaveAttribute('href', '/invoices/inv-4');
    expect(act).toHaveAttribute('data-action-region', 'toll');
    fireEvent.click(act);
    expect(onFollow).toHaveBeenCalledTimes(1);
  });

  it('never inks money red — past due reads in the same ink as anything else', () => {
    const { container } = render(<SpineToll {...INVOICE_4} dueDate="2020-01-01" />);
    expect(container.innerHTML).not.toContain('--color-terracotta');
    expect(container.innerHTML).not.toContain('--color-error');
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
