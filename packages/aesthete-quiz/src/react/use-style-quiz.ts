'use client';
/**
 * useStyleQuiz() — the headless quiz hook.
 *
 * Wraps the pure reducer from ../core/quiz-machine with:
 *  - session-key resolution (localStorage, SSR-safe, resolved after mount so
 *    server and client renders agree),
 *  - per-question dwell timing (timestamps injected into reducer actions),
 *  - submit via the zero-dependency wire client.
 *
 * Portals style their own UI on top; ./components ships minimal unstyled
 * building blocks for both the client portal and the marketing site.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { LifestyleOption, StyleQuizProfile } from '@patina/types';
import { AestheteQuizError } from '../core/errors';
import {
  buildAnswers,
  canAdvance as selectCanAdvance,
  createInitialQuizState,
  currentQuestion as selectCurrentQuestion,
  isComplete as selectIsComplete,
  isLastQuestion as selectIsLastQuestion,
  quizReducer,
  type QuizSelection,
  type QuizState,
} from '../core/quiz-machine';
import { QUIZ_QUESTIONS, type AnyQuizQuestion } from '../core/questions';
import { getOrCreateSessionKey } from '../core/session-key';
import { submitStyleQuiz } from '../core/wire-client';
import { useQuizConfig } from './provider';

/**
 * The §12.4 client-side quiz funnel vocabulary. The hook emits the first
 * three; `matches_viewed` / `match_saved` belong to the results surface the
 * portal renders AFTER the quiz — fire them through the same capture fn when
 * the match grid mounts / a card is saved (names must match exactly so
 * PostHog dashboards aggregate across surfaces).
 */
export type AestheteQuizEventName =
  | 'quiz_started'
  | 'question_answered'
  | 'quiz_completed'
  | 'matches_viewed'
  | 'match_saved';

export interface AestheteQuizEvent {
  name: AestheteQuizEventName;
  properties: Record<string, unknown>;
}

export interface UseStyleQuizOptions {
  /** Called once on a successful submit with the full profile. */
  onComplete?: (profile: StyleQuizProfile) => void;
  /**
   * Optional analytics tap (§12.4 quiz funnel). The package deliberately has
   * NO posthog dependency — portals pass their own capture fn, e.g.
   * `onEvent: (e) => posthog.capture(e.name, e.properties)`. Errors thrown by
   * the callback are swallowed: analytics must never break the quiz.
   */
  onEvent?: (event: AestheteQuizEvent) => void;
}

export interface UseStyleQuizResult {
  /** Raw machine state (answers, timings, step) for custom UIs. */
  state: QuizState;
  status: QuizState['status'];
  question: AnyQuizQuestion;
  step: number;
  totalSteps: number;
  isFirst: boolean;
  isLast: boolean;
  canAdvance: boolean;
  isComplete: boolean;
  result: StyleQuizProfile | null;
  error: AestheteQuizError | null;
  /** Resolved after mount (null during SSR/first paint). */
  sessionKey: string | null;
  select: (selection: QuizSelection) => void;
  toggleLifestyle: (option: LifestyleOption) => void;
  next: () => void;
  back: () => void;
  /** Submit the completed quiz. No-op unless all five questions are answered. */
  submit: () => Promise<void>;
  reset: () => void;
}

export function useStyleQuiz(options: UseStyleQuizOptions = {}): UseStyleQuizResult {
  const config = useQuizConfig();
  const [state, dispatch] = useReducer(quizReducer, null, () => createInitialQuizState(null));
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const onCompleteRef = useRef(options.onComplete);
  onCompleteRef.current = options.onComplete;
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;

  // Analytics tap (§12.4) — best-effort by contract; a throwing capture fn
  // must never break the quiz.
  const emit = useCallback((name: AestheteQuizEventName, properties: Record<string, unknown>) => {
    try {
      onEventRef.current?.({ name, properties: { source: config.source ?? 'web', ...properties } });
    } catch {
      /* analytics must never break the quiz */
    }
  }, [config.source]);

  // Submit/next read live state via a ref so their identities stay stable.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Resolve the persisted session key client-side only (SSR-safe), and start
  // the first question's dwell clock once mounted.
  useEffect(() => {
    setSessionKey(getOrCreateSessionKey(config.storageKey));
  }, [config.storageKey]);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      dispatch({ type: 'RESET', at: Date.now() });
      emit('quiz_started', { total_steps: QUIZ_QUESTIONS.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useCallback((selection: QuizSelection) => {
    dispatch({ type: 'SELECT_OPTION' as const, ...selection });
  }, []);

  const toggleLifestyle = useCallback((option: LifestyleOption) => {
    dispatch({ type: 'TOGGLE_OPTION', question: 'lifestyle', option });
  }, []);

  const next = useCallback(() => {
    const current = stateRef.current;
    // Mirror the reducer's NEXT guard: emit only when the step will advance.
    if (current.status !== 'submitting' && !selectIsLastQuestion(current) && selectCanAdvance(current)) {
      emit('question_answered', {
        question: selectCurrentQuestion(current).key,
        step: current.step + 1,
      });
    }
    dispatch({ type: 'NEXT', at: Date.now() });
  }, [emit]);
  const back = useCallback(() => dispatch({ type: 'BACK', at: Date.now() }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET', at: Date.now() }), []);

  const submit = useCallback(async () => {
    const current = stateRef.current;
    if (current.status === 'submitting' || !selectIsComplete(current)) return;
    // The final question is committed by submit, not next() (§12.4 funnel).
    emit('question_answered', {
      question: selectCurrentQuestion(current).key,
      step: current.step + 1,
    });
    dispatch({ type: 'SUBMIT_START', at: Date.now() });
    try {
      const profile = await submitStyleQuiz({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: config.accessToken,
        fetch: config.fetch,
        sessionKey: sessionKey ?? getOrCreateSessionKey(config.storageKey),
        answers: buildAnswers(current),
        timings: current.timings,
        source: config.source ?? 'web',
        attribution: config.attribution,
      });
      dispatch({ type: 'SUBMIT_SUCCESS', result: profile });
      emit('quiz_completed', {
        session_key: profile.session_key,
        profile_version: profile.version,
        archetype_primary: profile.archetype?.primary ?? null,
        budget_label: profile.budget?.label ?? null,
        catalyst: profile.catalyst,
      });
      onCompleteRef.current?.(profile);
    } catch (cause) {
      const error =
        cause instanceof AestheteQuizError
          ? cause
          : new AestheteQuizError('network', cause instanceof Error ? cause.message : String(cause));
      dispatch({ type: 'SUBMIT_ERROR', error });
    }
  }, [config, sessionKey, emit]);

  return useMemo(
    () => ({
      state,
      status: state.status,
      question: selectCurrentQuestion(state),
      step: state.step,
      totalSteps: QUIZ_QUESTIONS.length,
      isFirst: state.step === 0,
      isLast: selectIsLastQuestion(state),
      canAdvance: selectCanAdvance(state),
      isComplete: selectIsComplete(state),
      result: state.result,
      error: state.error,
      sessionKey,
      select,
      toggleLifestyle,
      next,
      back,
      submit,
      reset,
    }),
    [state, sessionKey, select, toggleLifestyle, next, back, submit, reset],
  );
}
