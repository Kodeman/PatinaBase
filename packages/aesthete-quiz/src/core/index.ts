/**
 * @patina/aesthete-quiz — core (framework-free, zero runtime dependencies).
 *
 * Wire contract: WIRE-CONTRACT.md at the package root (canonical for the
 * external marketing repo). Domain types live in @patina/types and are
 * re-exported here for convenience.
 */

// Domain wire types (canonical home: @patina/types — never redefine).
export type {
  CatalystOption,
  ClaimQuizSessionResult,
  InvestmentOption,
  LifestyleOption,
  MaterialOption,
  StyleQuizAnswers,
  StyleQuizArchetypeResult,
  StyleQuizAttribution,
  StyleQuizBudgetResult,
  StyleQuizProfile,
  StyleQuizQuestionKey,
  StyleQuizSource,
  StyleQuizSpectrums,
  StyleQuizTimings,
  VisualResonanceOption,
} from '@patina/types';

export {
  CATALYST_QUESTION,
  getQuestion,
  INVESTMENT_QUESTION,
  LIFESTYLE_QUESTION,
  MATERIAL_QUESTION,
  QUIZ_QUESTIONS,
  VISUAL_RESONANCE_QUESTION,
  type AnyQuizQuestion,
  type QuizOptionDef,
  type QuizQuestionDef,
} from './questions';

export {
  clearSessionKey,
  DEFAULT_SESSION_STORAGE_KEY,
  generateSessionKey,
  getOrCreateSessionKey,
  isSessionKey,
} from './session-key';

export {
  AestheteQuizError,
  classifyRpcError,
  QuizForbiddenError,
  QuizInvalidAnswersError,
  QuizNetworkError,
  QuizRateLimitError,
  QuizUnknownSessionError,
  type PostgrestErrorBody,
  type QuizErrorKind,
} from './errors';

export {
  claimQuizSession,
  submitStyleQuiz,
  type ClaimQuizSessionParams,
  type QuizClientConfig,
  type SubmitStyleQuizParams,
} from './wire-client';

export {
  buildAnswers,
  canAdvance,
  createInitialQuizState,
  currentQuestion,
  isComplete,
  isLastQuestion,
  isQuestionAnswered,
  quizReducer,
  type QuizAction,
  type QuizAnswersDraft,
  type QuizSelectAction,
  type QuizSelection,
  type QuizState,
  type QuizStatus,
} from './quiz-machine';
