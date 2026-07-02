'use client';

/**
 * The five-question style quiz (Wave 3A — design §7.1/§7.2).
 *
 * Built entirely on @patina/aesthete-quiz: the package owns the state machine,
 * session-key persistence, per-question dwell timings, and the wire client;
 * this file is presentation only. On a successful submit the profile is
 * stashed locally (the results page can't re-read it anonymously — §7.1) and
 * we navigate to /quiz/results.
 *
 * COPY LAW (§10.6): never "AI" — the engine is "Designer-Taught Intelligence";
 * no scores or percents anywhere in copy.
 */
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import posthog from 'posthog-js';
import type { StyleQuizAttribution, StyleQuizProfile } from '@patina/types';
import {
  QuizProvider,
  QuizQuestionView,
  useStyleQuiz,
} from '@patina/aesthete-quiz/react';
import { clearSessionKey, type AestheteQuizError } from '@patina/aesthete-quiz';
import { StrataMark } from '@/components/strata-mark';
import { clearQuizProfile, storeQuizProfile } from '@/lib/aesthete/profile-store';
import { useAuth } from '@/hooks/use-auth';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

function useQuizAttribution(): StyleQuizAttribution {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const attribution: StyleQuizAttribution = {};
    for (const key of UTM_KEYS) {
      const value = searchParams?.get(key);
      if (value) attribution[key] = value;
    }
    try {
      const distinctId = posthog.get_distinct_id?.();
      if (distinctId) attribution.posthog_distinct_id = distinctId;
    } catch {
      /* analytics disabled — attribution is best-effort */
    }
    return attribution;
  }, [searchParams]);
}

function errorCopy(error: AestheteQuizError): { message: string; canRetry: boolean } {
  switch (error.kind) {
    case 'rate_limited':
      return {
        message:
          'You have taken the quiz a few times in the last hour. Give it a little while and come back — your answers will keep.',
        canRetry: false,
      };
    case 'network':
      return {
        message: 'We could not reach the studio. Check your connection and try again.',
        canRetry: true,
      };
    case 'forbidden':
      return {
        message:
          'This device carries a profile that belongs to another account. Start fresh to take the quiz as yourself.',
        canRetry: false,
      };
    default:
      return {
        message: 'Something went wrong on our side. Try again in a moment.',
        canRetry: true,
      };
  }
}

function QuizInner() {
  const router = useRouter();
  const quiz = useStyleQuiz({
    onComplete: (profile: StyleQuizProfile) => {
      storeQuizProfile(profile);
      router.push('/quiz/results');
    },
  });

  const [startedFresh, setStartedFresh] = useState(false);
  const startFresh = useCallback(() => {
    // Foreign session key on this device (claimed by another account):
    // drop the key + stashed profile and let the machine mint a new one.
    clearSessionKey();
    clearQuizProfile();
    setStartedFresh(true);
    quiz.reset();
    // The hook resolves its session key once on mount; a full reload re-mints.
    if (typeof window !== 'undefined') window.location.reload();
  }, [quiz]);

  const submitting = quiz.status === 'submitting';
  const error = quiz.status === 'error' && quiz.error ? errorCopy(quiz.error) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="type-label text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          Patina
        </Link>
        <span className="type-meta text-[var(--text-muted)]" data-quiz-step-indicator>
          {quiz.step + 1} of {quiz.totalSteps}
        </span>
      </header>

      {/* Quiet progress: five strata segments, filled as you go. */}
      <div className="mt-6 flex gap-1.5" role="progressbar" aria-label={`Question ${quiz.step + 1} of ${quiz.totalSteps}`} aria-valuemin={1} aria-valuemax={quiz.totalSteps} aria-valuenow={quiz.step + 1}>
        {Array.from({ length: quiz.totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-[2px] flex-1 rounded-full transition-colors duration-300 ${
              i <= quiz.step ? 'bg-patina-clay' : 'bg-patina-pearl'
            }`}
          />
        ))}
      </div>

      <div className="mt-10 flex-1">
        <QuizQuestionView
          key={quiz.question.key}
          question={quiz.question}
          answers={quiz.state.answers}
          onSelect={quiz.select}
          onToggleLifestyle={quiz.toggleLifestyle}
          disabled={submitting}
          className="border-0 p-0 [&>legend]:font-heading [&>legend]:text-2xl [&>legend]:leading-snug [&>legend]:text-[var(--text-primary)] [&>[data-quiz-helper]]:type-body-small [&>[data-quiz-helper]]:mt-2 [&>[data-quiz-helper]]:text-[var(--text-muted)] [&>[data-quiz-options]]:mt-6 [&>[data-quiz-options]]:grid [&>[data-quiz-options]]:gap-3 sm:[&>[data-quiz-options]]:grid-cols-2"
          optionClassName="group rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-4 text-left transition-all duration-150 hover:border-patina-clay/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-patina-clay data-[selected]:border-patina-clay data-[selected]:bg-patina-clay/10 data-[selected]:shadow-sm disabled:opacity-60 [&>[data-quiz-option-label]]:block [&>[data-quiz-option-label]]:font-medium [&>[data-quiz-option-label]]:text-[var(--text-primary)] [&>[data-quiz-option-description]]:mt-1 [&>[data-quiz-option-description]]:block [&>[data-quiz-option-description]]:text-sm [&>[data-quiz-option-description]]:text-[var(--text-muted)]"
        />

        {error && (
          <div role="alert" className="mt-6 rounded-lg border border-patina-terracotta/50 bg-patina-terracotta/10 px-5 py-4">
            <p className="type-body-small text-[var(--text-body)]">{error.message}</p>
            <div className="mt-3 flex gap-4">
              {error.canRetry && (
                <button
                  type="button"
                  onClick={() => void quiz.submit()}
                  className="type-label text-patina-mocha underline underline-offset-4 hover:text-[var(--text-primary)]"
                >
                  Try again
                </button>
              )}
              {quiz.error?.kind === 'forbidden' && !startedFresh && (
                <button
                  type="button"
                  onClick={startFresh}
                  className="type-label text-patina-mocha underline underline-offset-4 hover:text-[var(--text-primary)]"
                >
                  Start fresh
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="mt-10 flex items-center justify-between border-t border-[var(--border-subtle)] pt-6">
        <button
          type="button"
          onClick={quiz.back}
          disabled={quiz.isFirst || submitting}
          className={`inline-flex items-center gap-1.5 type-label text-[var(--text-muted)] transition-opacity hover:text-[var(--text-primary)] ${
            quiz.isFirst ? 'invisible' : ''
          } disabled:opacity-50`}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>

        {quiz.isLast ? (
          <button
            type="button"
            onClick={() => void quiz.submit()}
            disabled={!quiz.isComplete || submitting}
            data-quiz-submit
            className="inline-flex items-center gap-2 rounded-lg bg-patina-clay px-6 py-3 font-medium text-white transition-colors hover:bg-patina-aged-oak disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? 'Reading your answers…' : 'See your profile'}
          </button>
        ) : (
          <button
            type="button"
            onClick={quiz.next}
            disabled={!quiz.canAdvance}
            data-quiz-next
            className="rounded-lg bg-patina-clay px-6 py-3 font-medium text-white transition-colors hover:bg-patina-aged-oak disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        )}
      </footer>
    </main>
  );
}

export function QuizFlow() {
  const attribution = useQuizAttribution();
  const { session } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <QuizProvider
        baseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}
        anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''}
        source="client_portal"
        accessToken={session?.accessToken}
        attribution={attribution}
      >
        <div className="mx-auto max-w-2xl px-6">
          <StrataMark variant="micro" />
        </div>
        <QuizInner />
      </QuizProvider>
    </div>
  );
}
