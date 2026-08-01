'use client';

/**
 * Reviews (R52 / Track C) — feedback collection over `use-reviews`. The
 * prototype's three-tab `.subnav` (underline, not nav chrome): Pending (the
 * asks waiting to go out + the requests sent and awaiting words), Collected (the
 * words that arrived — stars + quote, with a Show-on-portfolio toggle), and
 * Queued (auto-requests scheduled to fire). "Request" composes via
 * `useCreateReviewRequest`. The stat strip reads `useReviewStats`.
 */

import { useMemo, useState } from 'react';
import {
  useClientReviews,
  useReviewStats,
  useCompletedProjectsWithoutReview,
  useTogglePortfolioPublish,
  type ClientReview,
  type CompletedProject,
} from '@patina/supabase';
import { ViewHeader, EmptyTeach } from '../view-shell';
import { Avatar } from '../person-bits';
import { ReviewRequestSheet } from '../ops/review-request-sheet';
import type { PeopleViewProps } from '../types';
import { DocumentAction } from '../../document-action';

type ReviewTab = 'pending' | 'collected' | 'queued';

const TABS: Array<[ReviewTab, string]> = [
  ['pending', 'Pending'],
  ['collected', 'Collected'],
  ['queued', 'Queued'],
];

function stars(rating: number | null | undefined): string {
  if (!rating || rating <= 0) return '';
  return '★'.repeat(Math.min(5, Math.round(rating)));
}

/** A request waiting to be sent — a completed project with no review yet. */
function clientOf(p: CompletedProject) {
  const dc = p.designer_clients?.[0] ?? null;
  return {
    designerClientId: dc?.id ?? null,
    name: dc?.client_name || dc?.client?.full_name || 'Client',
  };
}

export function ReviewsView({ notify }: PeopleViewProps) {
  const [tab, setTab] = useState<ReviewTab>('pending');
  const [request, setRequest] = useState<{
    designerClientId: string | null;
    projectId: string | null;
    clientName: string;
    projectName?: string;
  } | null>(null);

  const { data: stats } = useReviewStats();
  const { data: collected, isLoading: loadingCollected } = useClientReviews({
    requestStatus: 'collected',
  });
  const { data: sent, isLoading: loadingSent } = useClientReviews({
    requestStatus: 'sent',
  });
  const { data: queued, isLoading: loadingQueued } = useClientReviews({
    requestStatus: 'queued',
  });
  const { data: toRequest, isLoading: loadingToRequest } =
    useCompletedProjectsWithoutReview();
  const togglePublish = useTogglePortfolioPublish();

  const pendingCount = (toRequest?.length ?? 0) + (sent?.length ?? 0);
  const counts: Record<ReviewTab, number> = {
    pending: pendingCount,
    collected: collected?.length ?? 0,
    queued: queued?.length ?? 0,
  };

  const loading =
    (tab === 'pending' && (loadingToRequest || loadingSent)) ||
    (tab === 'collected' && loadingCollected) ||
    (tab === 'queued' && loadingQueued);

  const reviewClientName = (r: ClientReview) =>
    r.designer_client?.client_name ||
    r.designer_client?.client?.full_name ||
    'Client';

  const body = useMemo(() => {
    if (loading) {
      return (
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          Reading the feedback…
        </p>
      );
    }

    if (tab === 'pending') {
      const empty = (toRequest?.length ?? 0) === 0 && (sent?.length ?? 0) === 0;
      if (empty) {
        return (
          <EmptyBlock text="No reviews to ask for yet. Completed projects surface here, ready for a request." />
        );
      }
      return (
        <ul className="space-y-1.5">
          {(toRequest ?? []).map((p, index) => {
            const { designerClientId, name } = clientOf(p);
            return (
              <QueueRow
                key={p.id}
                name={name}
                why="Project complete — request the review now"
                action={
                  <RequestButton
                    regionKey={`pending-review-${index + 1}`}
                    onClick={() =>
                      setRequest({
                        designerClientId,
                        projectId: p.id,
                        clientName: name,
                        projectName: p.name,
                      })
                    }
                  />
                }
              />
            );
          })}
          {(sent ?? []).map((r) => (
            <QueueRow
              key={r.id}
              name={reviewClientName(r)}
              why="Request sent — awaiting their words"
            />
          ))}
        </ul>
      );
    }

    if (tab === 'collected') {
      if ((collected?.length ?? 0) === 0) {
        return (
          <EmptyBlock text="No reviews collected yet — they'll gather here as clients reply." />
        );
      }
      return (
        <ul className="space-y-1.5">
          {(collected ?? []).map((r, index) => (
            <QueueRow
              key={r.id}
              name={reviewClientName(r)}
              why={
                <>
                  {stars(r.rating) && (
                    <span className="text-[var(--color-golden-hour)]">
                      {stars(r.rating)}{' '}
                    </span>
                  )}
                  {r.review_text ? `“${r.review_text}”` : 'Review collected.'}
                </>
              }
              action={
                <DocumentAction
                  actionKey={
                    r.published_to_portfolio
                      ? 'remove-review-from-portfolio'
                      : 'publish-review-to-portfolio'
                  }
                  surfaceKey="people"
                  regionKey={`collected-review-${index + 1}`}
                  variant={r.published_to_portfolio ? 'tertiary' : 'primary'}
                  loading={
                    togglePublish.isPending &&
                    togglePublish.variables?.reviewId === r.id
                  }
                  loadingLabel="Saving…"
                  onClick={() =>
                    togglePublish.mutate(
                      { reviewId: r.id, published: !r.published_to_portfolio },
                      {
                        onSuccess: () =>
                          notify(
                            r.published_to_portfolio
                              ? 'Removed from the portfolio.'
                              : 'Now showing in the portfolio.',
                          ),
                      },
                    )
                  }
                >
                  {r.published_to_portfolio
                    ? 'On portfolio'
                    : 'Show on portfolio'}
                </DocumentAction>
              }
            />
          ))}
        </ul>
      );
    }

    // queued
    if ((queued?.length ?? 0) === 0) {
      return (
        <EmptyBlock text="Nothing queued. Review requests you schedule for later appear here." />
      );
    }
    return (
      <ul className="space-y-1.5">
        {(queued ?? []).map((r) => (
          <QueueRow
            key={r.id}
            name={reviewClientName(r)}
            why={
              r.scheduled_for
                ? `Request scheduled for ${new Date(r.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : 'Queued for delivery'
            }
          />
        ))}
      </ul>
    );
  }, [tab, loading, toRequest, sent, collected, queued, togglePublish, notify]);

  return (
    <>
      <ViewHeader
        title="Reviews"
        sub="Feedback collection — request, track, and celebrate the words that bring the next client."
      />

      {/* Stat strip — quiet paper, no cards-within-cards beyond the band. */}
      {stats && (
        <div className="mb-5 grid grid-cols-3 gap-2.5">
          <Stat n={stats.totalCollected} l="collected" />
          <Stat
            n={stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—'}
            l="avg. rating"
          />
          <Stat n={stats.publishedCount} l="on portfolio" />
        </div>
      )}

      {/* The 3-tab subnav — underline, not nav chrome (D1). */}
      <div className="mb-4 flex gap-5 border-b border-[var(--doc-ink-border)]/40 pb-2">
        {TABS.map(([key, label]) => {
          const on = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={on}
              className={`relative min-h-11 min-w-11 pb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                on
                  ? 'text-[var(--color-charcoal)]'
                  : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
              }`}
            >
              {label} · {counts[key]}
              {on && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 -bottom-[0.55rem] h-[2px] bg-[var(--color-clay)]"
                />
              )}
            </button>
          );
        })}
      </div>

      {body}

      <ReviewRequestSheet
        open={!!request}
        designerClientId={request?.designerClientId ?? null}
        projectId={request?.projectId ?? null}
        clientName={request?.clientName ?? ''}
        projectName={request?.projectName}
        onClose={() => setRequest(null)}
        onRequested={(message) => notify(message)}
      />
    </>
  );
}

function Stat({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="rounded-[9px] border border-[var(--color-pearl)] bg-white px-3.5 py-3">
      <div className="font-heading text-[1.4rem] font-medium leading-none text-[var(--color-charcoal)]">
        {n}
      </div>
      <div className="mt-1 font-mono text-[0.46rem] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
        {l}
      </div>
    </div>
  );
}

function QueueRow({
  name,
  why,
  action,
}: {
  name: string;
  why: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3.5 rounded-[10px] border border-[var(--color-pearl)] bg-white px-3.5 py-3">
      <Avatar name={name} role="client" size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.84rem] font-semibold text-[var(--color-charcoal)]">
          {name}
        </div>
        <div className="mt-[0.1rem] text-[0.68rem] leading-snug text-[var(--color-aged-oak)]">
          {why}
        </div>
      </div>
      {action}
    </li>
  );
}

function RequestButton({
  onClick,
  regionKey,
}: {
  onClick: () => void;
  regionKey: string;
}) {
  return (
    <DocumentAction
      actionKey="request-client-review"
      surfaceKey="people"
      regionKey={regionKey}
      variant="primary"
      onClick={onClick}
    >
      Request
    </DocumentAction>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <EmptyTeach>{text}</EmptyTeach>;
}
