/**
 * US-28 S1 — the ink state word (V20 U-Q13; house sheet §G-11, §G-13).
 *
 * The word is the state: every state prints in ink, and terracotta-ink marks
 * only an overdue, blocked or do-not-contact word. The map lives once, in
 * @patina/types, and names the `.word` classes the S1 block in globals.css
 * declares, so the two cannot drift.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as patinaTypes from '@patina/types';
import {
  ALL_CONSENT_WORDS,
  ALL_PAPER_STATES,
  ALL_SEAT_STAGE_WORDS,
  CONSENT_WORD_PIGMENTS,
  PAPER_STATE_PIGMENTS,
  REACH_STATE_PIGMENTS,
  SEAT_STAGE_WORD_PIGMENTS,
  STATE_WORD_INKS,
  STATE_WORD_INK_TOKENS,
  resolveStateWord,
  type StateWordInk,
} from '@patina/types';

const GLOBALS_CSS = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');

describe('US-28 S1 · the ink state word', () => {
  it('prints every class of state in ink, and only blocked in terracotta-ink', () => {
    expect(STATE_WORD_INKS).toEqual({
      current: 'ink',
      pending: 'ink',
      blocked: 'od',
      dormant: 'ink',
    });
  });

  it('spends three inks, each a text-grade token and a shared class', () => {
    expect(STATE_WORD_INK_TOKENS).toEqual({
      ink: { className: 'word', color: 'var(--text-primary)' },
      quiet: { className: 'word word--quiet', color: 'var(--text-subtle)' },
      od: { className: 'word word--od', color: 'var(--terracotta-ink)' },
    });
    // No ink is a border, a fill or a grading pigment.
    for (const tokens of Object.values(STATE_WORD_INK_TOKENS)) {
      expect(Object.keys(tokens).sort()).toEqual(['className', 'color']);
      expect(tokens.color).not.toMatch(/sage|golden|dusty|--terracotta\)/);
    }
  });

  it('names only classes the S1 block in globals.css declares, in the ink it says', () => {
    const block = GLOBALS_CSS.slice(
      GLOBALS_CSS.indexOf('US-28 S1 system'),
      GLOBALS_CSS.indexOf('end US-28 S1 system'),
    );
    expect(block).toMatch(/\.word \{[^}]*color: var\(--text-primary\);/);
    expect(block).toMatch(/\.word--quiet \{ color: var\(--text-subtle\); \}/);
    expect(block).toMatch(/\.word--od \{ color: var\(--terracotta-ink\); \}/);
    // A word is never a chip: no border, no fill, no radius on the word rules.
    const wordRules = block.match(/\.word(--[a-z]+)? \{[^}]*\}/g) ?? [];
    expect(wordRules).toHaveLength(3);
    for (const rule of wordRules) expect(rule).not.toMatch(/border|background|radius/);
  });

  it('keeps terracotta-ink to overdue, blocked and do-not-contact across the four families', () => {
    const od = (pigment: keyof typeof STATE_WORD_INKS) => STATE_WORD_INKS[pigment] === 'od';
    // Do-not-contact: an opted-out number. Every other consent word is ink.
    expect(ALL_CONSENT_WORDS.filter((w) => od(CONSENT_WORD_PIGMENTS[w]))).toEqual(['opted_out']);
    // Blocked: a lapsed paper. Lapses-soon, current and not-on-file are ink.
    expect(ALL_PAPER_STATES.filter((s) => od(PAPER_STATE_PIGMENTS[s]))).toEqual(['lapsed']);
    // A stage is where the work stands, never a thing that holds it up.
    expect(ALL_SEAT_STAGE_WORDS.filter((w) => od(SEAT_STAGE_WORD_PIGMENTS[w]))).toEqual([]);
    // Reach is never an alarm.
    expect(Object.values(REACH_STATE_PIGMENTS).filter(od)).toEqual([]);
  });

  it('resolves a value to its word and its ink in one reduction', () => {
    expect(resolveStateWord('consent', 'opted_out')).toMatchObject({
      label: 'Opted out',
      ink: 'od',
    });
    expect(resolveStateWord('paper', 'lapsed')).toMatchObject({ label: 'Lapsed', ink: 'od' });
    expect(resolveStateWord('paper', 'lapses_soon')).toMatchObject({
      label: 'Lapses in 30 days',
      ink: 'ink',
    });
    expect(resolveStateWord('reach', 'on_paper')).toMatchObject({ label: 'On paper', ink: 'ink' });
    expect(resolveStateWord('stage', 'active')).toMatchObject({ label: 'On the job', ink: 'ink' });
    // An absent fact still prints nothing rather than a guessed state.
    expect(resolveStateWord('consent', null)).toBeNull();
    const ink: StateWordInk = resolveStateWord('consent', 'granted')!.ink;
    expect(STATE_WORD_INK_TOKENS[ink].className).toBe('word');
  });

  it('no longer exports the grading pigment map, and a resolution carries no pigment pair', () => {
    // V20 U-Q13: state is an ink word. The PR-v alias had no caller left.
    expect(patinaTypes).not.toHaveProperty('STATE_WORD_PIGMENTS');
    expect(resolveStateWord('paper', 'lapsed')).not.toHaveProperty('tokens');
  });
});
