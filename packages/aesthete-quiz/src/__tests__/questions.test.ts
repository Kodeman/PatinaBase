/**
 * Pins the question/option keys to the 00243 quiz_option_loadings seed —
 * verbatim from supabase/migrations/00243_aesthete_client_quiz.sql (verified
 * against the live table 2026-07-01). A drift here is a wire-contract break.
 */
import { describe, expect, it } from 'vitest';
import { getQuestion, QUIZ_QUESTIONS } from '../core/questions';

const SEEDED_OPTIONS: Record<string, string[]> = {
  visual_resonance: ['warm_minimal', 'cool_modern', 'classic_comfort', 'eclectic_curated'],
  lifestyle: ['family', 'entertaining', 'sanctuary', 'work_from_home'],
  material: ['weathered_oak', 'brushed_metal', 'soft_linen', 'aged_leather', 'woven_rattan'],
  investment: ['starter', 'curated_comfort', 'heirloom', 'discuss'],
  catalyst: ['new_home', 'moving', 'milestone', 'refresh', 'just_looking'],
};

describe('QUIZ_QUESTIONS', () => {
  it('asks the five §7.1 questions in Q1–Q5 order', () => {
    expect(QUIZ_QUESTIONS.map((q) => q.key)).toEqual([
      'visual_resonance',
      'lifestyle',
      'material',
      'investment',
      'catalyst',
    ]);
    expect(QUIZ_QUESTIONS.map((q) => q.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it.each(Object.entries(SEEDED_OPTIONS))(
    '%s option keys exactly match the 00243 seed',
    (questionKey, expected) => {
      const question = QUIZ_QUESTIONS.find((q) => q.key === questionKey);
      expect(question).toBeDefined();
      expect(question!.options.map((o) => o.key).sort()).toEqual([...expected].sort());
    },
  );

  it('lifestyle is the only multi-select', () => {
    for (const q of QUIZ_QUESTIONS) {
      expect(q.kind).toBe(q.key === 'lifestyle' ? 'multi' : 'single');
    }
  });

  it('every option carries a label and no user-facing string says "AI" (copy law)', () => {
    for (const q of QUIZ_QUESTIONS) {
      const copy = [q.prompt, q.helper ?? '', ...q.options.flatMap((o) => [o.label, o.description ?? ''])];
      for (const text of copy) {
        expect(text).not.toMatch(/\bAI\b/);
      }
      for (const o of q.options) {
        expect(o.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('getQuestion resolves each key and throws on unknown keys', () => {
    expect(getQuestion('material').number).toBe(3);
    // @ts-expect-error — deliberately invalid key
    expect(() => getQuestion('nope')).toThrow(/Unknown quiz question/);
  });
});
