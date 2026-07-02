/**
 * R87 decision-edge contract — the two lifecycle rules for editing a decision
 * from the margin:
 *   1. Extend on a STORED-expired decision revives it (expired→pending recovery)
 *      so the client can respond again; a still-live decision only moves the date.
 *   2. Delete stays draft-only — a published decision is reopened or resolved,
 *      never deleted, so the R56 audit trail survives.
 *
 * The predicates are unit-tested here, and a source-level contract (the R33/R26
 * precedent) pins the wiring so the surfaces can't silently drift off the
 * predicates — an expired Extend must run the expired→pending transition, and
 * the composer delete must gate on canDeleteDecision.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { extendRevivesDecision, canDeleteDecision } from '../decision-edges';

describe('R87 · Extend revives an expired decision', () => {
  it('revives only when the STORED status is expired', () => {
    expect(extendRevivesDecision('expired')).toBe(true);
  });

  it('does not revive a still-live decision — Extend just moves the date', () => {
    expect(extendRevivesDecision('pending')).toBe(false);
    // 'overdue' is a derived margin state, never a stored status; a past-due
    // decision is stored 'pending', so Extend must NOT flip its status.
    expect(extendRevivesDecision('overdue')).toBe(false);
  });

  it('does not revive a draft or a resolved decision', () => {
    expect(extendRevivesDecision('draft')).toBe(false);
    expect(extendRevivesDecision('responded')).toBe(false);
    expect(extendRevivesDecision(null)).toBe(false);
    expect(extendRevivesDecision(undefined)).toBe(false);
  });
});

describe('R87 · delete stays draft-only', () => {
  it('offers delete only for an unsent draft', () => {
    expect(canDeleteDecision('draft')).toBe(true);
  });

  it('never offers delete for a published decision (pending/expired/responded)', () => {
    expect(canDeleteDecision('pending')).toBe(false);
    expect(canDeleteDecision('expired')).toBe(false);
    expect(canDeleteDecision('responded')).toBe(false);
    expect(canDeleteDecision(null)).toBe(false);
    expect(canDeleteDecision(undefined)).toBe(false);
  });
});

describe('R87 · the surfaces stay wired to the predicates (source contract)', () => {
  const SRC = join(__dirname, '..', '..', '..', 'components', 'document');
  const marginBodies = readFileSync(join(SRC, 'margin-bodies.tsx'), 'utf8');
  const itemComposer = readFileSync(join(SRC, 'coordination', 'item-composer.tsx'), 'utf8');

  it('the DecisionBody Extend act runs the expired→pending recovery via the predicate', () => {
    // Keyed on the stored status through the shared predicate…
    expect(marginBodies).toMatch(/extendRevivesDecision\(decision\.status\)/);
    // …and the revive branch runs the 00171 expired→pending transition.
    expect(marginBodies).toMatch(/updateStatus\.mutateAsync\(/);
    expect(marginBodies).toMatch(/status:\s*'pending'/);
    expect(marginBodies).toMatch(/currentStatus:\s*decision\.status/);
  });

  it('the Extend act opts out of the global toast (R83 inline grammar)', () => {
    expect(marginBodies).toMatch(/useUpdateDecision\(\{\s*errorSurface:\s*'inline'\s*\}\)/);
    expect(marginBodies).toMatch(/useUpdateDecisionStatus\(\{\s*errorSurface:\s*'inline'\s*\}\)/);
  });

  it('the composer delete is gated draft-only via the predicate', () => {
    expect(itemComposer).toMatch(/canDelete\s*=\s*isEdit\s*&&\s*canDeleteDecision\(editItem\?\.status\)/);
    // The delete UI renders on canDelete, not on bare edit-mode.
    expect(itemComposer).toMatch(/\{canDelete &&/);
  });
});
