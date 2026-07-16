/**
 * ScheduleEntryField + GhostAddLine — unsigned-duration guard (S3-6 review
 * fix). The entry grammar (`parseScheduleEntry`) accepts signed durations
 * ('-3d', '+2w') BY DESIGN — milestone offsets need them — so every
 * phase-duration surface must reject the signed form itself and any
 * non-positive result before it reaches a write: a negative duration_days
 * would run activate_proposal_as_project's legacy date cascade backwards
 * (the 00324 CHECK constraints are the DB backstop; these tests pin the
 * UI-level guard).
 *
 * Covers the THREE `durationSign` modes:
 *   - 'unsigned' (default) — PhaseBuilder's grammar cell + GhostAddLine's
 *     own inline guard. A signed form is always rejected, whatever it
 *     resolves to.
 *   - 'relative' (Slice 04-5 fix, R100) — the spine's own "Edit dates"
 *     duration field only. An UNSIGNED parse still means an absolute
 *     duration (same guard as 'unsigned'); a SIGNED parse ('+5d', '-3d')
 *     resolves as a delta off `baselineDays`, floored at 1.
 *   - 'signed' — the milestone-offset shape; exercised at the parser level
 *     via milestone-composer's own inline field, not through this
 *     component (see that file), so deliberately not re-tested here beyond
 *     the explicit-opt-in cases below.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleEntryField } from '../schedule-entry-field';
import { GhostAddLine } from '../ghost-add-line';

const TODAY = '2026-07-15';
const UNSIGNED_REASON = 'Durations must be positive — e.g. 3w or 10d';

// ═══════════════════════════════════════════════════════════════════════════
// ScheduleEntryField
// ═══════════════════════════════════════════════════════════════════════════

describe('ScheduleEntryField — durationSign', () => {
  function renderField(props: Partial<React.ComponentProps<typeof ScheduleEntryField>> = {}) {
    const onCommit = jest.fn();
    render(
      <ScheduleEntryField
        aria-label="Test entry"
        today={TODAY}
        bareNumberUnit="weeks"
        accept={['duration']}
        onCommit={onCommit}
        {...props}
      />,
    );
    return { onCommit, input: screen.getByRole('textbox', { name: 'Test entry' }) };
  }

  const type = (input: HTMLElement, value: string) => {
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };

  it('unsigned (the default): a plain positive duration commits', () => {
    const { onCommit, input } = renderField();
    type(input, '3w');
    expect(onCommit).toHaveBeenCalledWith({ kind: 'duration', days: 21 });
    expect(screen.queryByText(UNSIGNED_REASON)).toBeNull();
  });

  it('unsigned: a negative duration is rejected inline with no commit', () => {
    const { onCommit, input } = renderField();
    type(input, '-3d');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(UNSIGNED_REASON)).toBeInTheDocument();
  });

  it('unsigned: a POSITIVE value in signed form (+5d) is still rejected — a leading sign is offset grammar', () => {
    const { onCommit, input } = renderField();
    type(input, '+5d');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(UNSIGNED_REASON)).toBeInTheDocument();
  });

  it('unsigned: signed zero (+0d) is rejected', () => {
    const { onCommit, input } = renderField();
    type(input, '+0d');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(UNSIGNED_REASON)).toBeInTheDocument();
  });

  it('unsigned: a signed BARE number (-3, bareNumberUnit weeks) is rejected', () => {
    const { onCommit, input } = renderField();
    type(input, '-3');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(UNSIGNED_REASON)).toBeInTheDocument();
  });

  it('unsigned: the guard also fires on blur, not just Enter', () => {
    const { onCommit, input } = renderField();
    fireEvent.change(input, { target: { value: '-2w' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(UNSIGNED_REASON)).toBeInTheDocument();
  });

  it("signed (explicit opt-in): '-3d' commits with the negative day count", () => {
    const { onCommit, input } = renderField({ durationSign: 'signed' });
    type(input, '-3d');
    expect(onCommit).toHaveBeenCalledWith({ kind: 'duration', days: -3 });
    expect(screen.queryByText(UNSIGNED_REASON)).toBeNull();
  });

  it("signed: '+0d' commits as zero", () => {
    const { onCommit, input } = renderField({ durationSign: 'signed' });
    type(input, '+0d');
    expect(onCommit).toHaveBeenCalledWith({ kind: 'duration', days: 0 });
  });

  it('anchor-only surfaces are unaffected — a signed duration hits the wrong-kind reason, never the unsigned one', () => {
    const { onCommit, input } = renderField({
      accept: ['anchor'],
      wrongKindReason: 'proposals carry anchored dates only',
    });
    type(input, '-3d');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText('proposals carry anchored dates only')).toBeInTheDocument();
    expect(screen.queryByText(UNSIGNED_REASON)).toBeNull();
  });

  it('unsigned: an anchor parse on a duration+anchor surface still commits (guard is duration-branch-only)', () => {
    const { onCommit, input } = renderField({ accept: ['duration', 'anchor'] });
    type(input, 'Sep 21');
    expect(onCommit).toHaveBeenCalledWith({ kind: 'anchor', date: '2026-09-21' });
  });

  it('the default mode (no durationSign passed — PhaseBuilder\'s call shape) is unchanged: +5d still rejected', () => {
    // PhaseBuilder's ScheduleEntryField call passes no `durationSign` prop
    // at all, so it stays on the 'unsigned' default — this slice touched
    // nothing in phase-builder.tsx. Pinned here since 'unsigned' is the
    // only mode PhaseBuilder ever exercises.
    const { onCommit, input } = renderField();
    type(input, '+5d');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(UNSIGNED_REASON)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ScheduleEntryField — durationSign 'relative' (the spine's Edit-dates
// duration field only, Slice 04-5 fix: R100 pins '+5d'/'-3d' as a relative
// shift off the phase's last committed duration)
// ═══════════════════════════════════════════════════════════════════════════

describe("ScheduleEntryField — durationSign 'relative'", () => {
  function renderRelative(baselineDays: number | null | undefined) {
    const onCommit = jest.fn();
    render(
      <ScheduleEntryField
        aria-label="Set phase duration"
        today={TODAY}
        bareNumberUnit="weeks"
        accept={['duration']}
        durationSign="relative"
        baselineDays={baselineDays}
        onCommit={onCommit}
      />,
    );
    return { onCommit, input: screen.getByRole('textbox', { name: 'Set phase duration' }) };
  }

  const type = (input: HTMLElement, value: string) => {
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };

  it('a signed +5d shift with a committed baseline of 21 commits the resolved absolute (26)', () => {
    const { onCommit, input } = renderRelative(21);
    type(input, '+5d');
    expect(onCommit).toHaveBeenCalledWith({ kind: 'duration', days: 26 });
  });

  it('a signed -25d shift with a committed baseline of 21 floors at 1, never zero/negative', () => {
    const { onCommit, input } = renderRelative(21);
    type(input, '-25d');
    expect(onCommit).toHaveBeenCalledWith({ kind: 'duration', days: 1 });
  });

  it('a signed shift with no committed baseline (null) is rejected inline — nothing to be relative to', () => {
    const { onCommit, input } = renderRelative(null);
    type(input, '+5d');
    expect(onCommit).not.toHaveBeenCalled();
    expect(
      screen.getByText('No committed duration to shift — enter an absolute duration'),
    ).toBeInTheDocument();
  });

  it('a signed shift with an undefined baseline is rejected the same way (undefined ≡ no baseline)', () => {
    const { onCommit, input } = renderRelative(undefined);
    type(input, '-3d');
    expect(onCommit).not.toHaveBeenCalled();
    expect(
      screen.getByText('No committed duration to shift — enter an absolute duration'),
    ).toBeInTheDocument();
  });

  it('an UNSIGNED (absolute) duration still commits as-is, ignoring any baseline', () => {
    const { onCommit, input } = renderRelative(21);
    type(input, '31d');
    expect(onCommit).toHaveBeenCalledWith({ kind: 'duration', days: 31 });
  });

  it('an unsigned zero-weeks input is still rejected (parse-level: unsigned durations must be positive)', () => {
    const { onCommit, input } = renderRelative(21);
    type(input, '0w');
    expect(onCommit).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GhostAddLine — its own inline duration field carries the same guard
// ═══════════════════════════════════════════════════════════════════════════

describe('GhostAddLine — unsigned duration guard', () => {
  function renderGhost() {
    const onAdd = jest.fn();
    render(
      <GhostAddLine
        committedPhases={[]}
        committedMilestones={[]}
        followsPhaseId={null}
        today={TODAY}
        onAdd={onAdd}
      />,
    );
    const nameInput = screen.getByRole('textbox', { name: 'Name a phase' });
    fireEvent.change(nameInput, { target: { value: 'Framing' } });
    const durationInput = screen.getByRole('textbox', {
      name: 'Phase duration or anchor date',
    });
    return { onAdd, durationInput };
  }

  it('a negative duration shows the reason on the compute line and Enter never calls onAdd', () => {
    const { onAdd, durationInput } = renderGhost();
    fireEvent.change(durationInput, { target: { value: '-3d' } });
    expect(screen.getByText(UNSIGNED_REASON)).toBeInTheDocument();
    fireEvent.keyDown(durationInput, { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('a signed-form positive duration (+2w) is rejected the same way', () => {
    const { onAdd, durationInput } = renderGhost();
    fireEvent.change(durationInput, { target: { value: '+2w' } });
    expect(screen.getByText(UNSIGNED_REASON)).toBeInTheDocument();
    fireEvent.keyDown(durationInput, { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('a plain positive duration still commits through onAdd', () => {
    const { onAdd, durationInput } = renderGhost();
    fireEvent.change(durationInput, { target: { value: '3w' } });
    expect(screen.queryByText(UNSIGNED_REASON)).toBeNull();
    fireEvent.keyDown(durationInput, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith({ name: 'Framing', durationDays: 21 });
  });
});
