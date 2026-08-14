/**
 * RulePhaseBar — the Drafting Line's keyboard model and its session-ownership
 * guard (B1/B2, review fixes 1–3).
 *
 * Pointer mechanics are deliberately NOT exercised here (jsdom has no pointer
 * capture and no layout, so `getBoundingClientRect` reads 0-wide and a drag
 * would test the mock, not the component) — the drag's math lives in
 * `schedule-rule-derivation` and is covered there. What IS component-level
 * behavior, and is covered here, is the keyboard path this surface exists to
 * provide (typed phase-date entry is going away) plus the two invariants that
 * cannot be seen from the pure layer:
 *
 *   · a bar may only `update()` a ripple session it can prove is its own — a
 *     spine-originated edit on the SAME phase must be replaced by a fresh
 *     Begin, never silently written into;
 *   · a phase whose end carries a LOCKED boundary handle keeps a working
 *     duration affordance (the handle refuses every drag, so without this the
 *     duration would be uneditable by anything).
 *
 * Mirrors schedule-entry-field.test.tsx's approach: real render, `fireEvent`
 * keyDown, assertions on the emitted callbacks and the ARIA the slider states.
 */

import { createRef, useCallback, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { epochDayFromISO, isoFromEpochDay } from '@patina/utils';
import { RulePhaseBar, type BarEditState } from '../rule-phase-bar';
import type { RippleSession } from '../schedule-ripple-context';
import type { RuleBar } from '@/lib/document/schedule-rule-derivation';

const START = epochDayFromISO('2026-02-01')!;
const DOMAIN_MIN = epochDayFromISO('2026-01-01')!;
const DOMAIN_MAX = epochDayFromISO('2026-06-01')!;

function makeBar(over: Partial<RuleBar> = {}): RuleBar {
  return {
    id: over.id ?? 'p1',
    name: over.name ?? 'Design Development',
    leftPct: over.leftPct ?? 20,
    widthPct: over.widthPct ?? 30,
    startEpoch: over.startEpoch ?? START,
    durationDays: over.durationDays ?? 28,
    anchored: over.anchored ?? false,
    hasInternalEndBoundary: over.hasInternalEndBoundary ?? false,
    endBoundaryLocked: over.endBoundaryLocked ?? false,
  };
}

type Handlers = {
  onMoveBegin: jest.Mock;
  onMoveFrame: jest.Mock;
  onResizeBegin: jest.Mock;
  onResizeFrame: jest.Mock;
};

/**
 * Stands in for ScheduleRule: it holds the LIFTED ownership + staged store and
 * renders one bar under it. `instance` is the bar's React key — bumping it
 * unmounts and remounts the bar while the store above survives, which is exactly
 * what the pin flip does to a bar mid-edit.
 */
function Harness({
  bar,
  session,
  handlers,
  instance,
}: {
  bar: RuleBar;
  session: RippleSession | null;
  handlers: Handlers;
  instance: number;
}) {
  const [edits, setEdits] = useState<Map<string, BarEditState>>(() => new Map());
  const getBarEdit = useCallback(
    (phaseId: string) => edits.get(phaseId) ?? null,
    [edits],
  );
  const setBarEdit = useCallback((phaseId: string, next: BarEditState | null) => {
    setEdits((prev) => {
      const map = new Map(prev);
      if (next == null) map.delete(phaseId);
      else map.set(phaseId, next);
      return map;
    });
  }, []);

  return (
    <RulePhaseBar
      key={instance}
      bar={bar}
      pinned={false}
      trackRef={createRef<HTMLElement>()}
      xToDay={(x) => Math.round(DOMAIN_MIN + (x / 100) * (DOMAIN_MAX - DOMAIN_MIN))}
      domainMinEpoch={DOMAIN_MIN}
      domainMaxEpoch={DOMAIN_MAX}
      session={session}
      getBarEdit={getBarEdit}
      setBarEdit={setBarEdit}
      {...handlers}
    />
  );
}

function renderBar(bar: RuleBar, session: RippleSession | null = null) {
  const handlers: Handlers = {
    onMoveBegin: jest.fn(),
    onMoveFrame: jest.fn(),
    onResizeBegin: jest.fn(),
    onResizeFrame: jest.fn(),
  };
  const view = render(
    <Harness bar={bar} session={session} handlers={handlers} instance={0} />,
  );
  /** Re-render with a new session (and optionally a fresh bar INSTANCE, i.e. a
   *  pin remount) while the harness's store persists. */
  const rerenderWith = (
    nextSession: RippleSession | null,
    opts: { remount?: boolean; bar?: RuleBar } = {},
  ) => {
    instanceCounter += opts.remount ? 1 : 0;
    view.rerender(
      <Harness
        bar={opts.bar ?? bar}
        session={nextSession}
        handlers={handlers}
        instance={instanceCounter}
      />,
    );
    // A remount swaps the DOM node — always hand back the live one.
    return screen.getByRole('slider');
  };
  return { ...handlers, rerenderWith, slider: screen.getByRole('slider') };
}

let instanceCounter = 0;
beforeEach(() => {
  instanceCounter = 0;
});

/** The rule-origin session the provider would hold after this bar's own move. */
const ruleAnchorSession = (phaseId: string, startEpoch: number): RippleSession => ({
  edit: { kind: 'phase-anchor', phaseId, anchorDate: isoFromEpochDay(startEpoch)! },
  origin: 'rule',
});

// ═══════════════════════════════════════════════════════════════════════════
// Session ownership — a bar never writes into a session it did not begin
// ═══════════════════════════════════════════════════════════════════════════

describe('RulePhaseBar — session ownership', () => {
  it('a SPINE-originated session on the SAME phase is never updated — the nudge begins a fresh one', () => {
    const bar = makeBar();
    const spineSession: RippleSession = {
      // the spine typed a hard date on this very phase
      edit: { kind: 'phase-anchor', phaseId: 'p1', anchorDate: '2026-03-15' },
      origin: 'spine',
    };
    const { slider, onMoveBegin, onMoveFrame } = renderBar(bar, spineSession);

    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(onMoveFrame).not.toHaveBeenCalled();
    expect(onMoveBegin).toHaveBeenCalledTimes(1);
    // and it counted off the COMMITTED start, never the foreign staged date.
    expect(onMoveBegin).toHaveBeenCalledWith(START + 1);
  });

  it('its OWN rule session is updated, and the nudges accumulate', () => {
    const bar = makeBar();
    const { slider, rerenderWith, onMoveBegin, onMoveFrame } = renderBar(bar);

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onMoveBegin).toHaveBeenCalledWith(START + 1);

    // the provider now holds exactly what this bar emitted.
    rerenderWith(ruleAnchorSession('p1', START + 1));
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(onMoveFrame).toHaveBeenCalledTimes(1);
    expect(onMoveFrame).toHaveBeenCalledWith(START + 2); // accumulated, not recomputed
  });

  it('a rule session on ANOTHER phase is not ours — the nudge begins again', () => {
    const bar = makeBar();
    const { slider, rerenderWith, onMoveBegin, onMoveFrame } = renderBar(bar);

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    rerenderWith(ruleAnchorSession('someone-else', START + 1));
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(onMoveFrame).not.toHaveBeenCalled();
    expect(onMoveBegin).toHaveBeenCalledTimes(2);
    expect(onMoveBegin).toHaveBeenLastCalledWith(START + 1); // back to committed
  });

  it('SURVIVES the pin remount: a fresh instance keeps framing from the staged value', () => {
    const bar = makeBar();
    const { slider, rerenderWith, onMoveBegin, onMoveFrame } = renderBar(bar);

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onMoveBegin).toHaveBeenCalledWith(START + 1);

    // scroll past the pin threshold: ScheduleRule swaps its ternary and every
    // bar unmounts/remounts, while the session it authored lives on.
    const remounted = rerenderWith(ruleAnchorSession('p1', START + 1), { remount: true });
    expect(remounted).not.toBe(slider); // genuinely a new element

    fireEvent.keyDown(remounted, { key: 'ArrowRight' });
    expect(onMoveFrame).toHaveBeenCalledTimes(1);
    expect(onMoveFrame).toHaveBeenCalledWith(START + 2); // continued, not restarted
    expect(onMoveBegin).toHaveBeenCalledTimes(1); // never began a second time
  });

  it('a fresh instance after a COMMIT (session null) claims nothing', () => {
    const bar = makeBar();
    const { slider, rerenderWith, onMoveBegin, onMoveFrame } = renderBar(bar);

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    // the strip commits: the session clears and the committed bar now carries
    // the new start — a remounted bar must own nothing.
    const committedBar = makeBar({ startEpoch: START + 1 });
    const remounted = rerenderWith(null, { remount: true, bar: committedBar });

    fireEvent.keyDown(remounted, { key: 'ArrowRight' });
    expect(onMoveFrame).not.toHaveBeenCalled();
    expect(onMoveBegin).toHaveBeenCalledTimes(2);
    expect(onMoveBegin).toHaveBeenLastCalledWith(START + 2); // off the NEW committed start
  });

  it('a cleared session (Esc revert) drops ownership — the next nudge begins off committed', () => {
    const bar = makeBar();
    const { slider, rerenderWith, onMoveBegin, onMoveFrame } = renderBar(bar);

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    rerenderWith(ruleAnchorSession('p1', START + 1));
    fireEvent.keyDown(slider, { key: 'ArrowRight' }); // owned → frame
    rerenderWith(null); // Esc · Revert
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(onMoveFrame).toHaveBeenCalledTimes(1);
    expect(onMoveBegin).toHaveBeenCalledTimes(2);
    expect(onMoveBegin).toHaveBeenLastCalledWith(START + 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Keyboard model — nudges, Shift, mode toggle
// ═══════════════════════════════════════════════════════════════════════════

describe('RulePhaseBar — keyboard model', () => {
  it('←/→ nudge ±1 day and Shift+←/→ ±7', () => {
    const { slider, onMoveBegin } = renderBar(makeBar());

    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onMoveBegin).toHaveBeenLastCalledWith(START - 1);

    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    expect(onMoveBegin).toHaveBeenLastCalledWith(START + 7);

    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true });
    expect(onMoveBegin).toHaveBeenLastCalledWith(START - 7);
  });

  it('Enter toggles MOVE ⇄ RESIZE and the announcement follows the mode', () => {
    const { slider } = renderBar(makeBar());
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      'Design Development: starts Feb 1, 28 days — MOVE mode',
    );

    fireEvent.keyDown(slider, { key: 'Enter' });
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      'Design Development: starts Feb 1, 28 days — RESIZE mode',
    );

    fireEvent.keyDown(slider, { key: 'Enter' });
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      'Design Development: starts Feb 1, 28 days — MOVE mode',
    );
  });

  it('in RESIZE mode the arrows edit the duration, clamped to ≥ 1', () => {
    const { slider, onResizeBegin, onMoveBegin } = renderBar(makeBar({ durationDays: 3 }));
    fireEvent.keyDown(slider, { key: 'Enter' });

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onResizeBegin).toHaveBeenLastCalledWith(4);

    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true }); // 3 − 7
    expect(onResizeBegin).toHaveBeenLastCalledWith(1);
    expect(onMoveBegin).not.toHaveBeenCalled();
  });

  it('Esc is left alone — the confirm strip’s global revert owns it', () => {
    const { slider, onMoveBegin, onResizeBegin } = renderBar(makeBar());
    const escape = fireEvent.keyDown(slider, { key: 'Escape' });
    // fireEvent returns false only when the handler called preventDefault.
    expect(escape).toBe(true);
    expect(onMoveBegin).not.toHaveBeenCalled();
    expect(onResizeBegin).not.toHaveBeenCalled();
  });

  it('a staged nudge shows the same inline date readout a pointer drag gets', () => {
    const bar = makeBar();
    const { slider, rerenderWith } = renderBar(bar);
    expect(screen.queryByText(/Feb 2 — Mar 2/)).not.toBeInTheDocument();

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    rerenderWith(ruleAnchorSession('p1', START + 1));

    expect(screen.getByText(/Feb 2 — Mar 2 · 28d/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A locked internal end boundary must not strand the duration
// ═══════════════════════════════════════════════════════════════════════════

describe('RulePhaseBar — resizability', () => {
  it('a bar whose end carries a LOCKED boundary still resizes (the handle refuses every drag)', () => {
    const { slider, onResizeBegin } = renderBar(
      makeBar({ hasInternalEndBoundary: true, endBoundaryLocked: true, durationDays: 10 }),
    );

    fireEvent.keyDown(slider, { key: 'Enter' });
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringContaining('RESIZE mode'));

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onResizeBegin).toHaveBeenCalledWith(11);
  });

  it('a bar whose end carries an UNLOCKED boundary does not resize — that handle owns the end', () => {
    const { slider, onResizeBegin, onMoveBegin } = renderBar(
      makeBar({ hasInternalEndBoundary: true, endBoundaryLocked: false }),
    );

    fireEvent.keyDown(slider, { key: 'Enter' }); // refused — no RESIZE mode here
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringContaining('MOVE mode'));

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onResizeBegin).not.toHaveBeenCalled();
    expect(onMoveBegin).toHaveBeenCalledWith(START + 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Slider semantics
// ═══════════════════════════════════════════════════════════════════════════

describe('RulePhaseBar — slider ARIA', () => {
  it('MOVE announces the scale’s epoch domain as its range', () => {
    const { slider } = renderBar(makeBar());
    expect(slider).toHaveAttribute('aria-orientation', 'horizontal');
    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuemin', String(DOMAIN_MIN));
    expect(slider).toHaveAttribute('aria-valuemax', String(DOMAIN_MAX));
    expect(slider).toHaveAttribute('aria-valuenow', String(START));
  });

  it('RESIZE announces 1…domain-span days instead', () => {
    const { slider } = renderBar(makeBar({ durationDays: 28 }));
    fireEvent.keyDown(slider, { key: 'Enter' });
    expect(slider).toHaveAttribute('aria-valuemin', '1');
    expect(slider).toHaveAttribute('aria-valuemax', String(DOMAIN_MAX - DOMAIN_MIN));
    expect(slider).toHaveAttribute('aria-valuenow', '28');
  });

  it('a nudge never stages a day outside the domain', () => {
    const { slider, onMoveBegin } = renderBar(makeBar({ startEpoch: DOMAIN_MIN }));
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true });
    expect(onMoveBegin).toHaveBeenCalledWith(DOMAIN_MIN); // clamped, not min − 7
  });
});
