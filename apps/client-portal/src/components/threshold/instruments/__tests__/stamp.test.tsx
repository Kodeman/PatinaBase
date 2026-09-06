import { render, screen } from '@testing-library/react';

import {
  STAMP_DIALS,
  Stamp,
  stampHasAged,
  stampStateForApproval,
  type StampState,
} from '../stamp';

/* ── Boundaries ──────────────────────────────────────────────────────────────
   The stamp has no hooks and no data of its own: state in, one mark out. So
   the assertions are about the four dials — the word, the pigments, the
   weight, the rotation — plus the one aging step and the refusals the whole
   house is held to (no sage, no fill, no shadow, no checkmark).
   ────────────────────────────────────────────────────────────────────────── */

const ALL_STATES = Object.keys(STAMP_DIALS) as StampState[];

const NOW = new Date('2026-09-05T12:00:00Z');

function mark(state: StampState, props: Record<string, unknown> = {}) {
  render(<Stamp state={state} now={NOW} data-testid="stamp" {...props} />);
  return screen.getByTestId('stamp');
}

describe('the twelve states', () => {
  it('covers exactly the twelve ruled states', () => {
    expect(ALL_STATES).toEqual([
      'awaiting',
      'approved',
      'chosen',
      'returned',
      'held',
      'signed',
      'signed_on_paper',
      'reviewed',
      'withdrawn',
      'superseded',
      'expired',
      'declined',
    ]);
  });

  it.each([
    ['approved', 'APPROVED', 'var(--color-mocha)', 'var(--color-mocha)'],
    ['chosen', 'CHOSEN', 'var(--color-mocha)', 'var(--color-mocha)'],
    ['returned', 'RETURNED', 'var(--color-clay-ink)', 'var(--color-charcoal)'],
    ['held', 'HELD', 'var(--color-golden-hour-ink)', 'var(--color-charcoal)'],
    ['signed', 'SIGNED', 'var(--color-mocha)', 'var(--color-mocha)'],
    ['signed_on_paper', 'SIGNED', 'var(--color-mocha)', 'var(--color-mocha)'],
    ['reviewed', 'REVIEWED', 'var(--text-muted)', 'var(--text-muted)'],
    ['withdrawn', 'WITHDRAWN', 'var(--text-muted)', 'var(--text-muted)'],
    ['superseded', 'SUPERSEDED', 'var(--text-muted)', 'var(--text-muted)'],
    ['expired', 'EXPIRED', 'var(--text-muted)', 'var(--text-muted)'],
    ['declined', 'DECLINED', 'var(--color-terracotta-ink)', 'var(--color-charcoal)'],
  ] as Array<[StampState, string, string, string]>)(
    '%s presses its word in its own pigment',
    (state, word, border, ink) => {
      const stamp = mark(state);
      expect(stamp).toHaveTextContent(word);
      expect(stamp.style.getPropertyValue('--stamp-border')).toBe(border);
      expect(stamp.style.getPropertyValue('--stamp-ink')).toBe(ink);
    },
  );

  it('leaves the awaiting state un-stamped, upright, and still legible aloud', () => {
    const stamp = mark('awaiting');
    expect(stamp).toHaveTextContent('');
    expect(stamp).toHaveAttribute('role', 'img');
    expect(stamp).toHaveAttribute('aria-label', 'Awaiting you');
    expect(stamp.style.getPropertyValue('--stamp-rotation')).toBe('0deg');
    expect(stamp.style.transform).toBe('');
  });

  it('prints ON PAPER inside the rule, upright, for a mark made elsewhere', () => {
    const stamp = mark('signed_on_paper');
    expect(stamp).toHaveTextContent('SIGNED');
    expect(stamp).toHaveTextContent('ON PAPER');
    expect(stamp.style.getPropertyValue('--stamp-rotation')).toBe('0deg');
  });

  it('tilts the marks pressed on this surface to −1.1 degrees', () => {
    for (const state of ['approved', 'returned', 'held', 'signed', 'reviewed', 'declined'] as StampState[]) {
      render(<Stamp state={state} now={NOW} data-testid={`stamp-${state}`} />);
      expect(screen.getByTestId(`stamp-${state}`).style.getPropertyValue('--stamp-rotation')).toBe(
        '-1.1deg',
      );
    }
  });

  it('doubles the rule only where the grammar doubles it', () => {
    expect(mark('approved')).toHaveAttribute('data-stamp-weight', 'doubled');
    expect(screen.getByTestId('stamp-inner-rule')).toBeInTheDocument();
  });

  it('draws a single rule with no inner rule on a state that is not terminal', () => {
    expect(mark('returned')).toHaveAttribute('data-stamp-weight', 'single');
    expect(screen.queryByTestId('stamp-inner-rule')).not.toBeInTheDocument();
  });

  it('carries the date beside the word and the paper beneath it', () => {
    const stamp = mark('approved', { dateLabel: '14 August', children: 'Library elevations · Edition 3' });
    expect(stamp).toHaveTextContent('APPROVED 14 August');
    expect(stamp).toHaveTextContent('Library elevations · Edition 3');
  });
});

describe('the refusals', () => {
  it('never renders sage, a fill, a shadow, or a checkmark', () => {
    for (const state of ALL_STATES) {
      const { container, unmount } = render(<Stamp state={state} now={NOW} dateLabel="14 August" />);
      const html = container.innerHTML;
      expect(html).not.toMatch(/sage/i);
      expect(html).not.toMatch(/shadow/);
      expect(html).not.toMatch(/bg-/);
      expect(html).not.toMatch(/background/);
      expect(html).not.toMatch(/✓|✔|check/i);
      unmount();
    }
  });

  it('spends terracotta on exactly one state and pairs it with no sage counterpart', () => {
    const terracotta = ALL_STATES.filter(
      (state) => STAMP_DIALS[state].border === 'var(--color-terracotta-ink)',
    );
    expect(terracotta).toEqual(['declined']);
    expect(
      ALL_STATES.some((state) => /sage/i.test(`${STAMP_DIALS[state].border}${STAMP_DIALS[state].ink}`)),
    ).toBe(false);
  });
});

describe('the one aging step', () => {
  const stamped = new Date('2026-08-01T12:00:00Z');
  const twentyNineDays = new Date('2026-08-30T11:00:00Z');
  const thirtyDays = new Date('2026-08-31T12:00:00Z');

  it('holds full ink for twenty-nine days', () => {
    expect(stampHasAged('approved', stamped, twentyNineDays)).toBe(false);
    const stamp = mark('approved', { since: stamped, now: twentyNineDays });
    expect(stamp).toHaveAttribute('data-stamp-aged', 'false');
    expect(stamp.style.getPropertyValue('--stamp-border-opacity')).toBe('0.88');
    expect(stamp.style.getPropertyValue('--stamp-inner-opacity')).toBe('0.42');
  });

  it('takes its one step at thirty days', () => {
    expect(stampHasAged('approved', stamped, thirtyDays)).toBe(true);
    const stamp = mark('approved', { since: stamped, now: thirtyDays });
    expect(stamp).toHaveAttribute('data-stamp-aged', 'true');
    expect(stamp.style.getPropertyValue('--stamp-border-opacity')).toBe('0.74');
    expect(stamp.style.getPropertyValue('--stamp-inner-opacity')).toBe('0.26');
  });

  it('never degrades the word, however old the mark is', () => {
    const old = new Date('2020-01-01T00:00:00Z');
    const stamp = mark('approved', { since: old, now: NOW });
    expect(stamp).toHaveAttribute('data-stamp-aged', 'true');
    expect(stamp.style.getPropertyValue('--stamp-ink')).toBe('var(--color-mocha)');
    expect(stamp).toHaveTextContent('APPROVED');
  });

  it('leaves a state that is still asking something at full ink forever', () => {
    const old = new Date('2020-01-01T00:00:00Z');
    for (const state of ['awaiting', 'returned', 'held', 'reviewed'] as StampState[]) {
      expect(stampHasAged(state, old, NOW)).toBe(false);
    }
  });

  it('draws a mark of unknown age fresh rather than guessing at it', () => {
    expect(stampHasAged('approved', null, NOW)).toBe(false);
    expect(stampHasAged('approved', new Date('nonsense'), NOW)).toBe(false);
  });
});

describe('which state an approval stands at', () => {
  it.each([
    [{ disposition: 'withdrawn', outcome: 'approved' }, 'withdrawn'],
    [{ disposition: 'superseded', outcome: 'changes_requested' }, 'superseded'],
    [{ disposition: 'active', outcome: 'approved' }, 'approved'],
    [{ disposition: 'active', outcome: 'changes_requested' }, 'returned'],
    [{ disposition: 'active', outcome: 'needs_discussion' }, 'held'],
    [{ disposition: 'active', outcome: null }, 'awaiting'],
  ] as Array<[{ disposition: string; outcome: string | null }, StampState]>)(
    'reads %o as %s',
    (approval, expected) => {
      expect(stampStateForApproval(approval)).toBe(expected);
    },
  );

  it('never reads changes_requested as declined', () => {
    expect(stampStateForApproval({ disposition: 'active', outcome: 'changes_requested' })).not.toBe(
      'declined',
    );
  });
});

/* `W3R1-n2`. A settled choice between named alternatives is CHOSEN. It takes
   APPROVED's dials exactly — one act, one weight, one pigment — so the two
   read as siblings and not as a hierarchy of consent. The iOS half is
   `PatinaStamp.State.chosen`, asserted the same way in `PatinaStampTests`. */
describe('CHOSEN', () => {
  it('is APPROVED in every dial but the word', () => {
    const withoutTheWord = (dial: (typeof STAMP_DIALS)['chosen']) => ({
      ...dial,
      word: null,
      label: '',
    });
    expect(withoutTheWord(STAMP_DIALS.chosen)).toEqual(withoutTheWord(STAMP_DIALS.approved));
    expect(STAMP_DIALS.chosen.word).toBe('CHOSEN');
    expect(STAMP_DIALS.chosen.label).toBe('Chosen');
  });
});
