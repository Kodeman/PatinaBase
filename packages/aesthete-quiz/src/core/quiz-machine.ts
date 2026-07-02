/**
 * The quiz state machine — a pure reducer, framework-free.
 *
 * `useStyleQuiz()` (./react) wraps it with useReducer; non-React consumers
 * (the external marketing site, tests) can drive it directly. Timestamps
 * arrive on actions (`at`) so the reducer stays pure and per-question dwell
 * timings (`q1_ms`…`q5_ms`, §7.1) accumulate deterministically.
 */
import type { AestheteQuizError } from './errors';
import type {
  CatalystOption,
  InvestmentOption,
  LifestyleOption,
  MaterialOption,
  StyleQuizAnswers,
  StyleQuizProfile,
  StyleQuizTimings,
  VisualResonanceOption,
} from '@patina/types';
import { QUIZ_QUESTIONS, type AnyQuizQuestion } from './questions';

export type QuizStatus = 'in_progress' | 'submitting' | 'complete' | 'error';

/** Answers under construction — single-selects may still be unset. */
export interface QuizAnswersDraft {
  visual_resonance?: StyleQuizAnswers['visual_resonance'];
  lifestyle: LifestyleOption[];
  material?: StyleQuizAnswers['material'];
  investment?: StyleQuizAnswers['investment'];
  catalyst?: StyleQuizAnswers['catalyst'];
}

export interface QuizState {
  /** 0-based index into QUIZ_QUESTIONS. */
  step: number;
  answers: QuizAnswersDraft;
  /** Accumulated per-question dwell, `q{n}_ms`. */
  timings: StyleQuizTimings;
  /** When the current question was entered (ms epoch); null before start. */
  enteredAt: number | null;
  status: QuizStatus;
  result: StyleQuizProfile | null;
  error: AestheteQuizError | null;
}

/** Single-select answers, typed per question so a wrong key/option pair is a compile error. */
export type QuizSelection =
  | { question: 'visual_resonance'; option: VisualResonanceOption }
  | { question: 'material'; option: MaterialOption }
  | { question: 'investment'; option: InvestmentOption }
  | { question: 'catalyst'; option: CatalystOption };

export type QuizSelectAction = { type: 'SELECT_OPTION' } & QuizSelection;

export type QuizAction =
  | QuizSelectAction
  | { type: 'TOGGLE_OPTION'; question: 'lifestyle'; option: LifestyleOption }
  | { type: 'NEXT'; at: number }
  | { type: 'BACK'; at: number }
  | { type: 'SUBMIT_START'; at: number }
  | { type: 'SUBMIT_SUCCESS'; result: StyleQuizProfile }
  | { type: 'SUBMIT_ERROR'; error: AestheteQuizError }
  | { type: 'RESET'; at: number };

export function createInitialQuizState(at: number | null = null): QuizState {
  return {
    step: 0,
    answers: { lifestyle: [] },
    timings: {},
    enteredAt: at,
    status: 'in_progress',
    result: null,
    error: null,
  };
}

// ─── selectors ───────────────────────────────────────────────────────────────

export function currentQuestion(state: QuizState): AnyQuizQuestion {
  return QUIZ_QUESTIONS[Math.min(state.step, QUIZ_QUESTIONS.length - 1)];
}

export function isLastQuestion(state: QuizState): boolean {
  return state.step >= QUIZ_QUESTIONS.length - 1;
}

export function isQuestionAnswered(state: QuizState, question: AnyQuizQuestion): boolean {
  if (question.kind === 'multi') {
    const selected = state.answers.lifestyle;
    return selected.length >= (question.minSelections ?? 1);
  }
  return state.answers[question.key] != null;
}

/** Can the user advance past (or submit from) the current question? */
export function canAdvance(state: QuizState): boolean {
  return isQuestionAnswered(state, currentQuestion(state));
}

/** All five questions answered — the payload would pass server validation. */
export function isComplete(state: QuizState): boolean {
  return QUIZ_QUESTIONS.every((q) => isQuestionAnswered(state, q));
}

/**
 * The §7.1 `p_answers` payload. Throws when incomplete — call `isComplete`
 * first (the server would reject a partial payload anyway).
 */
export function buildAnswers(state: QuizState): StyleQuizAnswers {
  const { visual_resonance, lifestyle, material, investment, catalyst } = state.answers;
  if (!visual_resonance || !material || !investment || catalyst === undefined || lifestyle.length === 0) {
    throw new Error('buildAnswers: quiz is incomplete — all five §7.1 answer keys are required');
  }
  return { visual_resonance, lifestyle, material, investment, catalyst };
}

// ─── reducer ─────────────────────────────────────────────────────────────────

/** Fold the dwell on the current question into `q{n}_ms`. */
function accumulateTiming(state: QuizState, at: number): StyleQuizTimings {
  if (state.enteredAt == null || at < state.enteredAt) return state.timings;
  const key = `q${currentQuestion(state).number}_ms`;
  return { ...state.timings, [key]: (state.timings[key] ?? 0) + (at - state.enteredAt) };
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'SELECT_OPTION': {
      if (state.status === 'submitting') return state;
      const answers: QuizAnswersDraft = { ...state.answers };
      switch (action.question) {
        case 'visual_resonance':
          answers.visual_resonance = action.option;
          break;
        case 'material':
          answers.material = action.option;
          break;
        case 'investment':
          answers.investment = action.option;
          break;
        case 'catalyst':
          answers.catalyst = action.option;
          break;
      }
      return { ...state, status: 'in_progress', error: null, answers };
    }

    case 'TOGGLE_OPTION': {
      if (state.status === 'submitting') return state;
      const selected = state.answers.lifestyle;
      const lifestyle = selected.includes(action.option)
        ? selected.filter((k) => k !== action.option)
        : [...selected, action.option];
      return { ...state, status: 'in_progress', error: null, answers: { ...state.answers, lifestyle } };
    }

    case 'NEXT': {
      if (state.status === 'submitting' || isLastQuestion(state) || !canAdvance(state)) return state;
      return {
        ...state,
        timings: accumulateTiming(state, action.at),
        step: state.step + 1,
        enteredAt: action.at,
      };
    }

    case 'BACK': {
      if (state.status === 'submitting' || state.step === 0) return state;
      return {
        ...state,
        timings: accumulateTiming(state, action.at),
        step: state.step - 1,
        enteredAt: action.at,
      };
    }

    case 'SUBMIT_START': {
      if (!isComplete(state)) return state;
      return { ...state, timings: accumulateTiming(state, action.at), status: 'submitting', error: null };
    }

    case 'SUBMIT_SUCCESS':
      return { ...state, status: 'complete', result: action.result, error: null };

    case 'SUBMIT_ERROR':
      return { ...state, status: 'error', error: action.error };

    case 'RESET':
      return createInitialQuizState(action.at);

    default:
      return state;
  }
}
