/**
 * SQ-752 — Direction C residue (SQ-764 F10/F13/F25/F30/F35, SQ-759 door and
 * shelf rows). Pure producers only; the rendered copy is pinned beside each
 * component's own test.
 */
import { originLabel } from '../room-origin';
import { ACT_TIER, NEED_ACT_LABELS, STANDING_ROW_ACTS, needActLabel } from '../act-names';
import { standingDoorLabel, standingDoorName } from '../lens-band-derivation';
import { shelfDefinition } from '../shelves';
import { HELP_TOPICS } from '@/lib/help-system/help-topics';

describe('Direction C residue (SQ-752)', () => {
  it('names the room back link for the place it returns to, and keeps the unknown fallback', () => {
    expect(originLabel('/desk')).toBe('Studio overview');
    expect(originLabel('')).toBe('Studio overview');
    expect(originLabel('/library/judgments')).toBe('Resource library');
    expect(originLabel('/rooms/abc')).toBe('Measured rooms');
    expect(originLabel('/doc/p1')).toBe('Project file');
    expect(originLabel('/people')).toBe('back');
  });

  it('classifies each renamed act by its new name and its old one (ruling 1)', () => {
    for (const label of ['Project directory', 'Call sheet']) expect(ACT_TIER[label]).toBe('plain');
    for (const label of ['Contact {first name}', 'Nudge {first name}']) expect(ACT_TIER[label]).toBe('scored');
    for (const label of ['Open the progress update', 'Send the pulse']) expect(ACT_TIER[label]).toBe('plain');
    expect(ACT_TIER[NEED_ACT_LABELS.pulse_due]).toBe('plain');
  });

  it('says Contact, never Nudge, and Open the progress update for the pulse (C-0041, C-0043, C-10040)', () => {
    expect(needActLabel('overdue_decision', 'Mei')).toBe('Contact Mei');
    expect(needActLabel('hesitating_proposal')).toBe('Contact the client');
    expect(needActLabel('pulse_due')).toBe('Open the progress update');
    expect(STANDING_ROW_ACTS.awaiting_decision.label).toBe('Contact {first name}');
    expect(STANDING_ROW_ACTS.owed.label).toBe('Contact {first name}');
    expect(Object.values(NEED_ACT_LABELS).filter((label) => /^Nudge\b/.test(label))).toEqual([]);
  });

  it('starts the standing door’s accessible name with its visible label (WCAG 2.5.3)', () => {
    expect(standingDoorName(3)).toBe('All open · 3 — everything open on this job');
    expect(standingDoorName(3).startsWith(standingDoorLabel(3))).toBe(true);
  });

  it('titles the shelves in the Direction C nouns, keys unchanged', () => {
    expect(shelfDefinition('specbook').title).toBe('Specification book');
    expect(shelfDefinition('moodboards').title).toBe('Design boards');
    expect(shelfDefinition('callsheet').title).toBe('Project directory');
  });

  it('describes Terminology without the retired metaphors (F35)', () => {
    const topic = HELP_TOPICS.find((t) => t.label === 'Terminology');
    expect(topic?.description).toBe('The terms Patina uses on purpose, and what each one means.');
  });
});
