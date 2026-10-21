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
  });

  /* R2 (SQ-1530): a sentence-and-amount label must reflow at 360px and at 200%
     zoom. jsdom has no layout, so this pins the classes; the pixels at
     360/390 and 200% are SQ-1531's visual measurement. */
  it.each(['terminal', 'choice'] as const)(
    'never forces a %s label onto one line, and keeps it inside its container',
    (variant) => {
      render(
        <ScoredAction actionKey="toll_settle" variant={variant}>
          Continue to secure payment · $9,125.00
        </ScoredAction>,
      );
      const act = screen.getByRole('button', { name: /continue to secure payment/i });
      expect(act).not.toHaveClass('whitespace-nowrap');
      expect(act).not.toHaveClass('shrink-0');
      expect(act).toHaveClass('max-w-full', 'min-h-[44px]');
    },
  );

  it.each(['terminal', 'choice'] as const)('a held %s act reflows the same way', (variant) => {
    render(
      <HoldAction actionKey="sign" verb="sign" variant={variant} onHold={() => undefined}>
        Approve this edition · $7,480.00
      </HoldAction>,
    );
    const act = screen.getByRole('button', { name: /approve this edition/i });
    expect(act).not.toHaveClass('whitespace-nowrap');
    expect(act).not.toHaveClass('shrink-0');
    expect(act).toHaveClass('max-w-full');
  });

  it('keeps the one-word scored tiers on one line', () => {
    render(
      <ScoredAction actionKey="ask" variant="tertiary">
        Ask
      </ScoredAction>,
    );
    expect(screen.getByRole('button', { name: 'Ask' })).toHaveClass('whitespace-nowrap', 'shrink-0');
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
    // forest, not oak: green replaces clay on what a client acts on (US-45 A2)
    expect(tertiary).toContain('var(--color-forest)');
    expect(tertiary).not.toContain('aged-oak');
    expect(tertiary).not.toContain('scaleX(0)');
    expect(GLOBALS).not.toContain('@media (hover: none)');
  });

  it('gives the terminal tier the forest fill, box and label type (US-45 A1)', () => {
    const terminal = GLOBALS.slice(
      GLOBALS.indexOf('.da-terminal {'),
      GLOBALS.indexOf('.da-terminal:hover'),
    );
    expect(terminal).toContain('background-color: var(--color-forest)');
    expect(terminal).toContain('color: var(--color-card)');
    expect(terminal).toContain('padding: 13px 22px');
    expect(terminal).toContain('min-height: 48px');
    expect(terminal).toContain('border-radius: 5px');
    expect(terminal).toContain('font-size: 16px');
    expect(terminal).toContain('text-transform: none');
    expect(terminal).toContain('font-variant-numeric: tabular-nums');
    expect(terminal).not.toContain('var(--color-charcoal)');
    // the press darkens to forest-press, never to the old charcoal literal
    expect(GLOBALS).not.toContain('#1F1D1A');
  });

  it('focuses with the forest ring standing beside the proofreader’s caret', () => {
    expect(GLOBALS).toMatch(/\.da-act:focus-visible \{\n  outline: 2px solid var\(--focus-ring\);/);
    expect(GLOBALS).toMatch(/--focus-ring:\s*var\(--color-forest\)\s*;/);
    expect(GLOBALS).not.toContain('outline: 2px solid var(--color-clay');
    expect(GLOBALS).toContain('outline-offset: 2px');
    // the caret is not replaced by the ring
    expect(GLOBALS).toContain(".da-act:focus-visible::before {\n  opacity: 1;\n}");
    // ...except on the terminal, where the glyph read as a stray mark on the
    // forest face during a hold (SQ-1531 finding 4); its ring is the mark
    expect(GLOBALS).toContain(".da-terminal::before {\n  content: none;\n}");
  });

  it('rings every text field in forest, not the browser blue (SQ-1531 finding 2)', () => {
    // in the base layer, so a field's own outline utility still wins
    const base = GLOBALS.slice(GLOBALS.indexOf('@layer base {'));
    expect(base).toMatch(
      /:where\(input:not\(\[type='radio'\], \[type='checkbox'\], \[type='file'\]\), textarea, select\):focus-visible \{\n    outline: 2px solid var\(--focus-ring\);/,
    );
  });

  it('has no --color-error token and nothing reading one', () => {
    expect(GLOBALS).not.toContain('--color-error');
  });

  it('keeps a working terminal act filled, not wearing the unavailable face', () => {
    // `.da-terminal:disabled` and `[aria-disabled]` are the UNAVAILABLE rule
    // (rail ground, faint ink, hairline border). A payment in flight must not
    // borrow it — sheet §A5 "Loading — ink, not a spinner".
    const loading = GLOBALS.slice(
      GLOBALS.indexOf('.da-terminal.is-loading,'),
      GLOBALS.indexOf('/* \u2500\u2500 focus'),
    );
    expect(loading).toContain('.da-terminal.is-loading:hover');
    expect(loading).toContain('background-color: var(--color-forest)');
    expect(loading).toContain('color: var(--color-card)');
    expect(loading).toContain('border: 0');
    // and it wins: the loading rules are declared after the unavailable ones
    expect(GLOBALS.indexOf('.da-terminal.is-loading,')).toBeGreaterThan(
      GLOBALS.indexOf(".da-terminal[aria-disabled='true']:hover"),
    );
    // no ring, no dots, no spin anywhere in the block
    expect(GLOBALS).not.toContain('@keyframes spin');
  });

  it('never dims an unavailable act', () => {
    // a declaration, not the prose that forbids one
    expect(GLOBALS).not.toMatch(/opacity:\s*(0?\.5|50%)\s*;/);
  });
});

/* ── The green outline (US-45 A1) ────────────────────────────────────────────
   A choice names one of several answers. It is a toggle, not the act: it
   reports `aria-pressed`, fills forest once picked, and the answer is taken
   by the terminal act beneath it. */
describe('ScoredAction — the choice variant', () => {
  it('renders aria-pressed="false" until it is picked, and "true" once it is', () => {
    const { rerender } = render(
      <ScoredAction actionKey="choose_approve" variant="choice">
        Approve
      </ScoredAction>,
    );
    const choice = screen.getByRole('button', { name: 'Approve' });
    expect(choice).toHaveClass('da-act');
    expect(choice).toHaveClass('da-choice');
    expect(choice).toHaveAttribute('data-action-variant', 'choice');
    expect(choice).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <ScoredAction actionKey="choose_approve" variant="choice" pressed>
        Approve
      </ScoredAction>,
    );
    expect(screen.getByRole('button', { name: 'Approve', pressed: true })).toBe(choice);
  });

  it('runs its own onClick — picking is the caller’s state, not an act taken', () => {
    const onClick = jest.fn();
    render(
      <ScoredAction actionKey="choose_pause" variant="choice" onClick={onClick}>
        Pause to discuss
      </ScoredAction>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause to discuss' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('leaves aria-pressed off every other variant', () => {
    render(
      <ScoredAction actionKey="contact" variant="secondary" pressed>
        Contact Maren Holt
      </ScoredAction>,
    );
    expect(screen.getByRole('button', { name: 'Contact Maren Holt' })).not.toHaveAttribute(
      'aria-pressed',
    );
  });

  it('draws secondary and choice as a 1.5px forest outline; picked fills forest', () => {
    const outline = GLOBALS.slice(
      GLOBALS.indexOf('.da-secondary,\n.da-choice {'),
      GLOBALS.indexOf('.da-secondary .da-label,'),
    );
    expect(outline).toContain('border: 1.5px solid var(--color-forest)');
    expect(outline).toContain('color: var(--color-forest)');
    expect(outline).toContain('border-radius: 5px');
    // the deck's 2.2:1 edge is never used
    expect(GLOBALS.toUpperCase()).not.toContain('#A7B0A6');

    const picked = GLOBALS.slice(
      GLOBALS.indexOf(".da-choice[aria-pressed='true'] {"),
      GLOBALS.indexOf(".da-choice[aria-pressed='true'] .da-pool"),
    );
    expect(picked).toContain('background-color: var(--color-forest)');
    expect(picked).toContain('color: var(--color-card)');
  });

  it('takes no clay anywhere in the action grammar', () => {
    const grammar = GLOBALS.slice(
      GLOBALS.indexOf('/* The Scored Ink (I107)'),
      GLOBALS.indexOf('/* Typography: now provided by'),
    );
    expect(grammar).not.toMatch(/var\(--color-clay(-ink)?\)/);
    expect(grammar).not.toContain('var(--color-mocha)');
  });
});

describe('ScoredAction — unavailableReason', () => {
  const reason = 'Choose an answer above first.';

  it('draws the reason as visible text and describes the act with it', () => {
    render(
      <ScoredAction actionKey="approve" variant="terminal" unavailableReason={reason}>
        Approve this edition · $7,480.00
      </ScoredAction>,
    );
    const act = screen.getByRole('button', { name: 'Approve this edition · $7,480.00' });
    const line = screen.getByTestId('approve-unavailable-reason');
    expect(line).toHaveTextContent(reason);
    expect(line).not.toHaveClass('sr-only');
    expect(line).toHaveClass('da-unavailable-reason');
    expect(act.getAttribute('aria-describedby')?.split(' ')).toContain(line.id);
    expect(act).toHaveAccessibleDescription(reason);
  });

  it('is aria-disabled, stays in the tab order, and wears the unavailable face', () => {
    const onClick = jest.fn();
    render(
      <ScoredAction
        actionKey="approve"
        variant="terminal"
        unavailableReason={reason}
        onClick={onClick}
      >
        Approve this edition · $7,480.00
      </ScoredAction>,
    );
    const act = screen.getByRole('button', { name: /approve this edition/i });
    expect(act).toHaveAttribute('aria-disabled', 'true');
    expect(act).not.toBeDisabled();
    expect(act).toHaveClass('da-unavailable');
    act.focus();
    expect(act).toHaveFocus();
    fireEvent.click(act);
    expect(onClick).not.toHaveBeenCalled();
  });

  /* R11 (SQ-1530): the card fee loads while the client sits on Continue. When
     the reason clears, the act she is on must become available under her
     focus — not be replaced by a fresh node that drops it. */
  it('keeps the same focused control when the reason clears, and enables it', () => {
    const onClick = jest.fn();
    const continueAct = (why?: string) => (
      <ScoredAction
        actionKey="toll_settle"
        variant="terminal"
        unavailableReason={why}
        onClick={onClick}
      >
        Continue to secure payment · $9,125.00
      </ScoredAction>
    );
    const { rerender } = render(continueAct(reason));
    const act = screen.getByRole('button', { name: /continue to secure payment/i });
    act.focus();
    expect(act).toHaveFocus();
    expect(act).toHaveAttribute('aria-disabled', 'true');

    rerender(continueAct(undefined));
    const after = screen.getByRole('button', { name: /continue to secure payment/i });
    expect(after).toBe(act);
    expect(after).toHaveFocus();
    expect(after).not.toHaveAttribute('aria-disabled');
    expect(after).not.toBeDisabled();
    expect(screen.queryByTestId('toll_settle-unavailable-reason')).toBeNull();
    fireEvent.click(after);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(continueAct(reason));
    expect(screen.getByRole('button', { name: /continue to secure payment/i })).toBe(act);
    expect(act).toHaveFocus();
  });

  it('keeps a caller’s own aria-describedby alongside the reason', () => {
    render(
      <div>
        <p id="consequence">Approving signs edition 2.</p>
        <ScoredAction
          actionKey="approve"
          variant="choice"
          aria-describedby="consequence"
          unavailableReason={reason}
        >
          Approve
        </ScoredAction>
      </div>,
    );
    const act = screen.getByRole('button', { name: 'Approve' });
    expect(act.getAttribute('aria-describedby')?.split(' ')).toEqual([
      'consequence',
      screen.getByTestId('approve-unavailable-reason').id,
    ]);
  });

  it('keeps a reasoned link reachable instead of removing it from the tab order', () => {
    render(
      <ScoredAction actionKey="pay" variant="terminal" href="/pay/x" unavailableReason={reason}>
        Pay $300.00
      </ScoredAction>,
    );
    const link = screen.getByRole('link', { name: 'Pay $300.00' });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('tabindex', '-1');
    expect(link).toHaveAccessibleDescription(reason);
  });

  it('renders nothing extra, and changes nothing, when no reason is given', () => {
    render(
      <ScoredAction actionKey="settle" variant="terminal" disabled>
        Pay $300.00
      </ScoredAction>,
    );
    const act = screen.getByRole('button', { name: 'Pay $300.00' });
    expect(act).toBeDisabled();
    expect(act).not.toHaveClass('da-unavailable');
    expect(act).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('settle-unavailable-reason')).toBeNull();
  });

  it('draws the A3 unavailable face: record fill, dashed edge, unavailable ink', () => {
    const face = GLOBALS.slice(
      GLOBALS.indexOf('.da-terminal:disabled,\n.da-terminal[aria-disabled'),
      GLOBALS.indexOf('.da-act.da-unavailable:not(.da-terminal)'),
    );
    expect(face).toContain('.da-act.da-unavailable,');
    expect(face).toContain('background-color: var(--color-green-record)');
    expect(face).toContain('border: 1.5px dashed var(--color-unavailable-edge)');
    expect(face).toContain('color: var(--color-unavailable-ink)');
    expect(GLOBALS).toMatch(/\.da-unavailable-reason \{[^}]*font-size: 15px;/);
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
