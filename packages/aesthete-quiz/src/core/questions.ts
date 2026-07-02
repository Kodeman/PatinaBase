/**
 * The five quiz questions (design §7.1/§7.2).
 *
 * Option keys mirror the 00243 `quiz_option_loadings` seed EXACTLY — the
 * server rejects unknown Q1/Q3/Q4 keys, skips unknown Q2 entries, and passes
 * unknown Q5 keys through with zero loading. Keys are typed against
 * `@patina/types` so a drift here is a compile error, and the questions test
 * pins the exact key sets.
 *
 * Prompts/labels are presentation copy — portals may override them; keys are
 * the wire contract. Copy law: never "AI" in user-facing strings.
 */
import type {
  CatalystOption,
  InvestmentOption,
  LifestyleOption,
  MaterialOption,
  StyleQuizQuestionKey,
  VisualResonanceOption,
} from '@patina/types';

export interface QuizOptionDef<K extends string = string> {
  key: K;
  label: string;
  description?: string;
}

export interface QuizQuestionDef<
  Q extends StyleQuizQuestionKey = StyleQuizQuestionKey,
  K extends string = string,
> {
  key: Q;
  /** 1-based question number — also the `q{n}_ms` timing key (§7.1). */
  number: 1 | 2 | 3 | 4 | 5;
  kind: 'single' | 'multi';
  prompt: string;
  helper?: string;
  options: readonly QuizOptionDef<K>[];
  /** multi only: selections required before the question counts as answered. */
  minSelections?: number;
}

export const VISUAL_RESONANCE_QUESTION: QuizQuestionDef<'visual_resonance', VisualResonanceOption> = {
  key: 'visual_resonance',
  number: 1,
  kind: 'single',
  prompt: 'Which room feels most like home?',
  helper: 'Go with your gut — the one you would walk into and stay.',
  options: [
    { key: 'warm_minimal', label: 'Warm minimal', description: 'Clean lines, natural light, soft textures' },
    { key: 'cool_modern', label: 'Cool modern', description: 'Sleek surfaces, a restrained palette' },
    { key: 'classic_comfort', label: 'Classic comfort', description: 'Timeless pieces, layered and lived-in' },
    { key: 'eclectic_curated', label: 'Eclectic curated', description: 'Collected, bold, unmistakably yours' },
  ],
};

export const LIFESTYLE_QUESTION: QuizQuestionDef<'lifestyle', LifestyleOption> = {
  key: 'lifestyle',
  number: 2,
  kind: 'multi',
  prompt: 'How does your home get used?',
  helper: 'Choose everything that applies.',
  minSelections: 1,
  options: [
    { key: 'family', label: 'Full house', description: 'Kids, pets, everyday life' },
    { key: 'entertaining', label: 'Entertaining', description: 'Dinners, gatherings, hosting' },
    { key: 'sanctuary', label: 'Sanctuary', description: 'Quiet, restorative, calm' },
    { key: 'work_from_home', label: 'Working from home', description: 'Focus and function' },
  ],
};

export const MATERIAL_QUESTION: QuizQuestionDef<'material', MaterialOption> = {
  key: 'material',
  number: 3,
  kind: 'single',
  prompt: 'Which material would you reach out and touch?',
  options: [
    { key: 'weathered_oak', label: 'Weathered oak' },
    { key: 'brushed_metal', label: 'Brushed metal' },
    { key: 'soft_linen', label: 'Soft linen' },
    { key: 'aged_leather', label: 'Aged leather' },
    { key: 'woven_rattan', label: 'Woven rattan' },
  ],
};

export const INVESTMENT_QUESTION: QuizQuestionDef<'investment', InvestmentOption> = {
  key: 'investment',
  number: 4,
  kind: 'single',
  prompt: 'How do you think about investing in your home?',
  options: [
    { key: 'starter', label: 'Getting started', description: 'Building the essentials well' },
    { key: 'curated_comfort', label: 'Curated comfort', description: 'A few meaningful upgrades' },
    { key: 'heirloom', label: 'Heirloom', description: 'Pieces that last generations' },
    { key: 'discuss', label: 'Let us talk it through', description: 'It depends on the piece' },
  ],
};

/**
 * Q5 catalyst — the lead tell, never aesthetics (question weight 0). Keys are
 * PROVISIONAL until quiz content lands (00243 header); the server tolerates
 * unknown keys, so renaming later is copy work, not a contract change.
 */
export const CATALYST_QUESTION: QuizQuestionDef<'catalyst', CatalystOption> = {
  key: 'catalyst',
  number: 5,
  kind: 'single',
  prompt: 'What brings you here right now?',
  options: [
    { key: 'new_home', label: 'A new home' },
    { key: 'moving', label: 'An upcoming move' },
    { key: 'milestone', label: 'A life milestone' },
    { key: 'refresh', label: 'A refresh' },
    { key: 'just_looking', label: 'Just looking' },
  ],
};

/** The quiz, in on-screen order Q1–Q5. */
export const QUIZ_QUESTIONS = [
  VISUAL_RESONANCE_QUESTION,
  LIFESTYLE_QUESTION,
  MATERIAL_QUESTION,
  INVESTMENT_QUESTION,
  CATALYST_QUESTION,
] as const;

export type AnyQuizQuestion = (typeof QUIZ_QUESTIONS)[number];

export function getQuestion(key: StyleQuizQuestionKey): AnyQuizQuestion {
  const q = QUIZ_QUESTIONS.find((question) => question.key === key);
  if (!q) throw new Error(`Unknown quiz question: ${key}`);
  return q;
}
