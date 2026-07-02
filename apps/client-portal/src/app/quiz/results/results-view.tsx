'use client';

/**
 * Quiz results: the profile (archetype · six quiet spectrum bars · budget
 * posture) followed by the top-10 matches with their whys (Wave 3A).
 *
 * RENDERING RULES (design §10.6 — the copy law):
 *  - ≤ 3 reasons per card, phrases verbatim from the server's `why_phrases`
 *    bands — we never compose judgment copy client-side;
 *  - no numbers, scores, or percents in copy (prices are product facts and
 *    allowed on cards); confidence renders as early read / good / strong;
 *  - exploration rows wear their honest stretch copy as a quiet marker;
 *  - cautions render quietly, never as alarms;
 *  - never "AI" — it is Designer-Taught Intelligence.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { StyleQuizProfile } from '@patina/types';
import {
  AestheteQuizError,
  DEFAULT_SESSION_STORAGE_KEY,
  isSessionKey,
} from '@patina/aesthete-quiz';
import { StrataMark } from '@/components/strata-mark';
import { useAestheteMatches, useClaimQuizSession } from '@/hooks/use-aesthete-matches';
import type { AestheteMatchRow, MatchProduct } from '@/lib/aesthete/matches';
import { loadQuizProfile } from '@/lib/aesthete/profile-store';
import {
  archetypeLine,
  budgetPosture,
  confidenceBand,
  formatPriceCents,
  SPECTRUM_META,
} from '@/lib/aesthete/presentation';
import { useAuth } from '@/hooks/use-auth';

/** Read the persisted session key WITHOUT minting one (a fresh key here would
 * only manufacture an unknown-session error). */
function readSessionKey(): string | null {
  try {
    const existing = window.localStorage.getItem(DEFAULT_SESSION_STORAGE_KEY);
    return isSessionKey(existing) ? existing : null;
  } catch {
    return null;
  }
}

// ─── profile panel ───────────────────────────────────────────────────────────

function SpectrumBars({ profile }: { profile: StyleQuizProfile }) {
  return (
    <dl className="mt-8 grid gap-5 sm:grid-cols-2 sm:gap-x-10">
      {SPECTRUM_META.map(({ key, label, low, high }) => {
        const value = profile.spectrums[key] ?? 0;
        const confidence = profile.spectrum_confidence?.[key] ?? 0.5;
        const position = ((value + 1) / 2) * 100;
        return (
          <div key={key} data-spectrum={key}>
            <dt className="type-label text-[var(--text-muted)]">{label}</dt>
            <dd className="mt-2">
              <div className="relative h-[3px] rounded-full bg-patina-pearl">
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-patina-clay"
                  style={{ left: `${position}%`, opacity: Math.max(0.4, confidence) }}
                  aria-hidden
                />
              </div>
              <div className="mt-1.5 flex justify-between">
                <span className="type-meta-small text-[var(--text-muted)]">{low}</span>
                <span className="type-meta-small text-[var(--text-muted)]">{high}</span>
              </div>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ProfilePanel({ profile }: { profile: StyleQuizProfile }) {
  const headline = archetypeLine(profile.archetype.primary, profile.archetype.secondary);
  const budget = budgetPosture(profile.budget);
  return (
    <section aria-label="Your style profile" data-quiz-profile>
      <p className="type-label text-[var(--text-muted)]">An early read of your taste</p>
      <h1 className="mt-2 font-heading text-3xl leading-tight text-[var(--text-primary)] sm:text-4xl">
        {headline ?? 'Your style, taking shape'}
      </h1>
      <SpectrumBars profile={profile} />
      {budget && (
        <p className="mt-8 border-t border-[var(--border-subtle)] pt-5 type-body-small text-[var(--text-body)]">
          <span className="type-label text-[var(--text-muted)]">Investment posture&ensp;</span>
          {budget}
        </p>
      )}
    </section>
  );
}

// ─── match cards ─────────────────────────────────────────────────────────────

function MatchCard({ match, product }: { match: AestheteMatchRow; product?: MatchProduct }) {
  // Exploration rows: pull the server's honest stretch phrase out of the
  // reason list and wear it as the card's marker instead (no duplication).
  const stretchReason = match.why.top_reasons.find((r) => r.term === 'exploration');
  const reasons = match.why.top_reasons.filter((r) => r.term !== 'exploration').slice(0, 3);
  const price = formatPriceCents(product?.price_retail);
  const band = confidenceBand(match.why.confidence);
  const image = product?.images?.[0];

  return (
    <article
      className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]"
      data-match-card
      data-exploration={match.is_exploration ? 'true' : undefined}
    >
      <div className="relative aspect-[4/3] bg-patina-pearl/50">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={product?.name ?? ''} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="type-meta text-[var(--text-muted)]">Image on its way</span>
          </div>
        )}
        {match.is_exploration && (
          <span className="absolute left-3 top-3 rounded-full bg-patina-charcoal/80 px-3 py-1 text-xs font-medium tracking-wide text-patina-off-white">
            {stretchReason?.phrase ?? 'A step outside your usual — worth a look'}
          </span>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="type-item-name text-[var(--text-primary)]">
            {product?.name ?? 'A piece from the catalog'}
          </h3>
          {price && <span className="shrink-0 font-mono text-sm text-[var(--text-body)]">{price}</span>}
        </div>
        {product?.brand && <p className="mt-0.5 type-meta text-[var(--text-muted)]">{product.brand}</p>}

        {reasons.length > 0 && (
          <ul className="mt-4 space-y-1.5" data-match-reasons>
            {reasons.map((reason) => (
              <li key={reason.term} className="flex gap-2 type-body-small text-[var(--text-body)]">
                <span className="mt-[0.55em] h-[3px] w-3 shrink-0 rounded-full bg-patina-clay/70" aria-hidden />
                {reason.phrase}
              </li>
            ))}
          </ul>
        )}

        {match.why.cautions.length > 0 && (
          <p className="mt-3 type-meta text-[var(--text-muted)]" data-match-cautions>
            {match.why.cautions.map((c) => c.phrase).join(' · ')}
          </p>
        )}

        <p className="mt-4 border-t border-[var(--border-subtle)] pt-3 type-meta-small text-[var(--text-muted)]">
          {band === 'early read' ? 'An early read' : `A ${band} fit`}
        </p>
      </div>
    </article>
  );
}

// ─── page states ─────────────────────────────────────────────────────────────

function CenteredNote({ children }: { children: React.ReactNode }) {
  return <div className="py-20 text-center">{children}</div>;
}

function MatchesError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const kind = error instanceof AestheteQuizError ? error.kind : 'server';

  if (kind === 'unknown_session') {
    return (
      <CenteredNote>
        <p className="type-body text-[var(--text-body)]">
          We could not find a profile for this device — it may have expired, or it lives somewhere else.
        </p>
        <Link
          href="/quiz"
          className="mt-6 inline-block rounded-lg bg-patina-clay px-6 py-3 font-medium text-white transition-colors hover:bg-patina-aged-oak"
        >
          Take the quiz
        </Link>
      </CenteredNote>
    );
  }
  if (kind === 'forbidden') {
    return (
      <CenteredNote>
        <p className="type-body text-[var(--text-body)]">This style profile is linked to a different account.</p>
        <Link
          href="/quiz"
          className="mt-6 inline-block rounded-lg bg-patina-clay px-6 py-3 font-medium text-white transition-colors hover:bg-patina-aged-oak"
        >
          Take the quiz as yourself
        </Link>
      </CenteredNote>
    );
  }
  if (kind === 'rate_limited') {
    return (
      <CenteredNote>
        <p className="type-body text-[var(--text-body)]">
          The Engine has heard from you a lot in the last hour. Give it a little while and try again.
        </p>
      </CenteredNote>
    );
  }
  return (
    <CenteredNote>
      <p className="type-body text-[var(--text-body)]">
        We could not gather your matches just now. It is us, not you.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-lg bg-patina-clay px-6 py-3 font-medium text-white transition-colors hover:bg-patina-aged-oak"
      >
        Try again
      </button>
    </CenteredNote>
  );
}

export function ResultsView() {
  const { isAuthenticated } = useAuth();
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [foreignSession, setForeignSession] = useState(false);

  useEffect(() => {
    setSessionKey(readSessionKey());
    setResolved(true);
  }, []);

  const profile = useMemo(() => loadQuizProfile(sessionKey), [sessionKey]);
  const matchesQuery = useAestheteMatches(sessionKey);

  // Signed-in visit → bind the anonymous session to this account (§7.1).
  useClaimQuizSession(sessionKey, () => setForeignSession(true));

  if (!resolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (!sessionKey) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl bg-[var(--bg-primary)] px-6">
        <StrataMark variant="mini" />
        <CenteredNote>
          <p className="type-body text-[var(--text-body)]">
            No style profile on this device yet. Five questions and you will have one.
          </p>
          <Link
            href="/quiz"
            className="mt-6 inline-block rounded-lg bg-patina-clay px-6 py-3 font-medium text-white transition-colors hover:bg-patina-aged-oak"
          >
            Take the quiz
          </Link>
        </CenteredNote>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <div className="mx-auto max-w-2xl">
          <StrataMark variant="mini" />
          {profile ? (
            <ProfilePanel profile={profile} />
          ) : (
            <section data-quiz-profile-missing>
              <p className="type-label text-[var(--text-muted)]">Your matches</p>
              <h1 className="mt-2 font-heading text-3xl leading-tight text-[var(--text-primary)]">
                Pieces that fit the way you answered
              </h1>
            </section>
          )}

          {foreignSession && (
            <p className="mt-6 rounded-lg border border-patina-terracotta/50 bg-patina-terracotta/10 px-5 py-4 type-body-small text-[var(--text-body)]">
              This quiz session belongs to a different account, so it was not added to yours.{' '}
              <Link href="/quiz" className="underline underline-offset-4">
                Retake the quiz
              </Link>{' '}
              to build your own.
            </p>
          )}

          {!isAuthenticated && (
            <div className="mt-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
              <p className="type-body-small text-[var(--text-body)]">
                Keep this profile. Sign in and it follows you — every visit, every device.
              </p>
              <Link
                href={`/auth/signin?callbackUrl=${encodeURIComponent('/quiz/results')}`}
                className="mt-3 inline-block shrink-0 rounded-lg bg-patina-clay px-5 py-2.5 font-medium text-white transition-colors hover:bg-patina-aged-oak sm:mt-0"
                data-quiz-signup-cta
              >
                Save my profile
              </Link>
            </div>
          )}
        </div>

        <section aria-label="Your matches" className="mt-14">
          <div className="flex items-baseline justify-between">
            <h2 className="type-section-head text-[var(--text-primary)]">The pieces that fit</h2>
            <Link href="/quiz" className="type-label text-[var(--text-muted)] underline-offset-4 hover:underline">
              Retake the quiz
            </Link>
          </div>

          {matchesQuery.isLoading && (
            <div className="flex items-center justify-center gap-3 py-20">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
              <span className="type-body-small text-[var(--text-muted)]">Gathering your matches…</span>
            </div>
          )}

          {matchesQuery.isError && (
            <MatchesError error={matchesQuery.error} onRetry={() => void matchesQuery.refetch()} />
          )}

          {matchesQuery.data && matchesQuery.data.matches.length === 0 && (
            <CenteredNote>
              <p className="type-body text-[var(--text-body)]">
                The catalog does not have your matches ready yet — check back soon.
              </p>
            </CenteredNote>
          )}

          {matchesQuery.data && matchesQuery.data.matches.length > 0 && (
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-match-grid>
              {matchesQuery.data.matches.map((match) => (
                <MatchCard
                  key={match.product_id}
                  match={match}
                  product={matchesQuery.data.products.get(match.product_id)}
                />
              ))}
            </div>
          )}

          <p className="mt-12 border-t border-[var(--border-subtle)] pt-5 type-meta text-[var(--text-muted)]">
            Matches come from Designer-Taught Intelligence — working designers teach the catalog what
            things are; your answers do the rest.
          </p>
        </section>
      </main>
    </div>
  );
}
