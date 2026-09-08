import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

import { HoldAction, ScoredAction } from '../scored-action';

/* ── The action tiers (PP-3 / R139) ──────────────────────────────────────────
   Three tiers by consequence and one rest rule you can see on a phone. What
   this file pins is the grammar, not the gates: the terminal variant's classes,
   the absence of `opacity-50` anywhere in the base, the unconditional tertiary
   rule, and an unavailable act that keeps its role, its focus and its voice.
   ────────────────────────────────────────────────────────────────────────── */

const GLOBALS = readFileSync(
  resolve(__dirname, '../../../../app/globals.css'),
  'utf8',
);
const SOURCE = readFileSync(resolve(__dirname, '../scored-action.tsx'), 'utf8');

describe('ScoredAction — the terminal tier', () => {
  it('draws the filled tier only when it is asked for', () => {
    render(
      <ScoredAction actionKey="pay" variant="terminal">
        Pay $4,060.00
      </ScoredAction>,
    );
    const act = screen.getByRole('button', { name: 'Pay $4,060.00' });
    expect(act).toHaveClass('da-act');
    expect(act).toHaveClass('da-terminal');
    expect(act).toHaveAttribute('data-action-variant', 'terminal');
  });

  it('keeps the other three tiers bare words', () => {
    render(
      <ScoredAction actionKey="ask" variant="tertiary">
        Ask for a change
      </ScoredAction>,
    );
    const act = screen.getByRole('button', { name: 'Ask for a change' });
    expect(act).toHaveClass('da-tertiary');
    expect(act).not.toHaveClass('da-terminal');
  });

  it('carries no opacity state on either kind of unavailability', () => {
    render(
      <ScoredAction actionKey="settle" variant="primary" disabled>
        Settle the balance
      </ScoredAction>,
    );
    const act = screen.getByRole('button', { name: 'Settle the balance' });
    expect(act.className).not.toContain('opacity-50');
    // and not in the shared base either, for any variant
    expect(SOURCE).not.toContain('disabled:opacity-50');
    expect(SOURCE).not.toContain('aria-disabled:opacity-50');
  });
});

describe('The Scored Ink block — the rest rules', () => {
  it('rests the tertiary rule drawn, with no hover gate on it', () => {
    // `scaleX(0)` is what made a phone show zero interactive marks (B01).
    const tertiary = GLOBALS.slice(
      GLOBALS.indexOf('.da-tertiary .da-label::before'),
      GLOBALS.indexOf('.da-tertiary .da-label::after'),
    );
    expect(tertiary).toContain('var(--color-aged-oak)');
    expect(tertiary).not.toContain('scaleX(0)');
    expect(GLOBALS).not.toContain('@media (hover: none)');
  });

  it('gives the terminal tier the sheet’s own fill, box and label type', () => {
    const terminal = GLOBALS.slice(
      GLOBALS.indexOf('.da-terminal {'),
      GLOBALS.indexOf('.da-terminal:hover'),
    );
    expect(terminal).toContain('background-color: var(--color-charcoal)');
    expect(terminal).toContain('color: var(--ink-paper)');
    expect(terminal).toContain('padding: 13px 22px');
    expect(terminal).toContain('min-height: 48px');
    expect(terminal).toContain('border-radius: 3px');
    expect(terminal).toContain('font-size: 16px');
    expect(terminal).toContain('text-transform: none');
    expect(terminal).toContain('font-variant-numeric: tabular-nums');
  });

  it('focuses with an outline standing beside the proofreader’s caret', () => {
    expect(GLOBALS).toContain('outline: 2px solid var(--color-clay-ink)');
    expect(GLOBALS).toContain('outline-offset: 2px');
    // the caret is not replaced by the ring
    expect(GLOBALS).toContain(".da-act:focus-visible::before {\n  opacity: 1;\n}");
  });

  it('has no --color-error token and nothing reading one', () => {
    expect(GLOBALS).not.toContain('--color-error');
  });

  it('never dims an unavailable act', () => {
    // a declaration, not the prose that forbids one
    expect(GLOBALS).not.toMatch(/opacity:\s*(0?\.5|50%)\s*;/);
  });
});

describe('HoldAction — an act that cannot be taken yet', () => {
  const onHold = jest.fn();

  function gate(props: Partial<React.ComponentProps<typeof HoldAction>> = {}) {
    return render(
      <div>
        <input id="gate-name" aria-label="Type your full name" />
        <HoldAction
          actionKey="gate_accept"
          verb="accept"
          onHold={onHold}
          disabled
          unmetReason="Type your full name to accept."
          unmetFocusId="gate-name"
          {...props}
        >
          Accept the finished work · $2,980.00
        </HoldAction>
      </div>,
    );
  }

  const actWord = () => screen.getByRole('button', { name: /accept/i });

  beforeEach(() => onHold.mockReset());

  it('is aria-disabled and not disabled, and stays in the tab order', () => {
    gate();
    const act = actWord();
    expect(act).toHaveAttribute('aria-disabled', 'true');
    expect(act).not.toBeDisabled();
    expect(act).not.toHaveAttribute('tabindex', '-1');
  });

  it('moves focus to the unmet control and says why, rather than nothing', () => {
    gate();
    fireEvent.click(actWord());

    expect(onHold).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Type your full name')).toHaveFocus();
    expect(screen.getByTestId('gate_accept-status')).toHaveTextContent(
      'Type your full name to accept.',
    );
    expect(screen.getByTestId('gate_accept-status')).toHaveAttribute('role', 'status');
  });

  it('answers a keyboard activation the same way', () => {
    gate();
    fireEvent.keyDown(actWord(), { key: 'Enter' });

    expect(onHold).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Type your full name')).toHaveFocus();
    expect(screen.getByTestId('gate_accept-status')).toHaveTextContent(
      'Type your full name to accept.',
    );
  });

  it('clears what it said once the act is armed', () => {
    const { rerender } = gate();
    fireEvent.click(actWord());
    expect(screen.getByTestId('gate_accept-status')).toHaveTextContent(
      'Type your full name to accept.',
    );

    rerender(
      <div>
        <input id="gate-name" aria-label="Type your full name" />
        <HoldAction
          actionKey="gate_accept"
          verb="accept"
          onHold={onHold}
          unmetReason="Type your full name to accept."
          unmetFocusId="gate-name"
        >
          Accept the finished work · $2,980.00
        </HoldAction>
      </div>,
    );
    expect(screen.getByTestId('gate_accept-status')).toBeEmptyDOMElement();
  });

  it('draws the hold sentence for a pointer user, not only for a reader', () => {
    gate();
    const caption = screen.getByTestId('gate_accept-hold-caption');
    expect(caption).toHaveTextContent('Press and hold to accept.');
    expect(caption).not.toHaveClass('sr-only');
    expect(caption).toHaveClass('t-meta');
    // and it is still what describes the act
    expect(actWord().getAttribute('aria-describedby')).toContain(caption.id);
  });
});
