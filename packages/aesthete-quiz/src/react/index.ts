'use client';
/**
 * @patina/aesthete-quiz/react — headless hooks + minimal unstyled components.
 * Peer dependency: react ^19 (no design-system dependency by design).
 */
export { QuizProvider, useQuizConfig, type QuizProviderConfig, type QuizProviderProps } from './provider';
export { useStyleQuiz, type UseStyleQuizOptions, type UseStyleQuizResult } from './use-style-quiz';
export {
  QuizOptionButton,
  QuizProgress,
  QuizQuestionView,
  type QuizOptionButtonProps,
  type QuizProgressProps,
  type QuizQuestionViewProps,
} from './components';
