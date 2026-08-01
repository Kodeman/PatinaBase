'use client';

import { useState } from 'react';

import {
  useMyPendingReviewRequests,
  useMySubmittedReviews,
} from '@patina/supabase';
import type { ClientPendingReview } from '@patina/supabase';
// F3 — Reviews list zero-state + pending section intro migrated to help-system.
// Consumer voice: hospitality framing, never "rate" / "submit feedback."
import { EmptyState, SectionIntro, SurfaceKeys, useHelpContent } from '@patina/help-system';
import { Star } from 'lucide-react';

import { PastReviewCard } from './PastReviewCard';
import { SubmitReviewDialog } from './SubmitReviewDialog';
import { QueryFailure } from '@/components/query-failure';

interface ReviewsIndexProps {
  userId: string;
}

export function ReviewsIndex({ userId }: ReviewsIndexProps) {
  const pendingQuery = useMyPendingReviewRequests(userId);
  const pastQuery = useMySubmittedReviews(userId);
  const { data: pending = [], isLoading: pendingLoading } = pendingQuery;
  const { data: past = [], isLoading: pastLoading } = pastQuery;
  const [active, setActive] = useState<ClientPendingReview | null>(null);

  const isLoading = pendingLoading || pastLoading;

  if (isLoading) {
    return (
      <p className="mt-8 type-body-small text-[var(--text-muted)]">Loading your reviews…</p>
    );
  }

  if (pendingQuery.isError || pastQuery.isError) {
    return (
      <QueryFailure
        className="mt-8"
        title="Unable to load reviews"
        message="Your review requests and past reviews could not be opened just now."
        onRetry={() => Promise.all([pendingQuery.refetch(), pastQuery.refetch()])}
      />
    );
  }

  if (pending.length === 0 && past.length === 0) {
    return <ReviewsEmptyState />;
  }

  return (
    <div className="mt-8 space-y-10">
      {pending.length > 0 ? (
        <section>
          <h2 className="font-heading text-base text-[var(--text-primary)]">
            Pending requests
          </h2>
          <SectionIntro
            surfaceKey={SurfaceKeys.ClientPortal.Reviews.PendingIntro}
            fallback="Your designer asked for a few words about working together. Take a minute when you’re ready."
            className="mt-1 type-body-small max-w-prose"
          />
          <ul className="mt-4 space-y-3">
            {pending.map((req) => {
              const designerName =
                req.designer?.full_name?.trim() ||
                req.designer?.business_name?.trim() ||
                'Designer';
              const projectName = req.project?.name ?? 'Your project';
              return (
                <li
                  key={req.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-default)] bg-white p-5"
                >
                  <div className="min-w-0">
                    <p className="font-heading text-base text-[var(--text-primary)]">
                      {projectName}
                    </p>
                    <p className="type-meta-small text-[var(--text-muted)]">
                      Review request from {designerName}
                    </p>
                    {req.custom_message ? (
                      <p className="type-body-small mt-2 text-[var(--text-primary)]">
                        &ldquo;{req.custom_message}&rdquo;
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActive(req)}
                    className="shrink-0 rounded-[3px] bg-patina-charcoal px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
                    data-testid={`leave-review-${req.id}`}
                  >
                    Leave a review
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section>
          <h2 className="font-heading text-base text-[var(--text-primary)]">
            Your reviews
          </h2>
          <div className="mt-4 space-y-3">
            {past.map((r) => (
              <PastReviewCard key={r.id} review={r} />
            ))}
          </div>
        </section>
      ) : null}

      {active ? (
        <SubmitReviewDialog
          open
          onOpenChange={(open) => {
            if (!open) setActive(null);
          }}
          reviewId={active.id}
          projectName={active.project?.name ?? null}
          designerName={
            active.designer?.full_name?.trim() ||
            active.designer?.business_name?.trim() ||
            'your designer'
          }
        />
      ) : null}
    </div>
  );
}

/**
 * ReviewsEmptyState — consumer-voice zero-state for the homeowner who has no
 * pending or past reviews. Same probe-then-fallback pattern used across F1.x
 * designer migrations and now F3 client migrations. Voice: hospitality —
 * "share your experience" instead of "rate" or "submit feedback."
 */
function ReviewsEmptyState() {
  const { data, isLoading } = useHelpContent(
    SurfaceKeys.ClientPortal.Reviews.Empty.NoReviews,
    'emptyState',
    'consumer',
  );

  if (isLoading) {
    return (
      <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-8 text-center">
        <p className="type-body-small italic text-[var(--text-muted)]">…</p>
      </section>
    );
  }

  if (data) {
    return (
      <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-8">
        <EmptyState
          surfaceKey={SurfaceKeys.ClientPortal.Reviews.Empty.NoReviews}
          persona="consumer"
          icon={<Star className="h-10 w-10" />}
        />
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-8 text-center">
      <Star className="mx-auto h-10 w-10 text-[var(--text-muted)]" aria-hidden />
      <h2 className="mt-4 font-heading text-lg text-[var(--text-primary)]">
        No reviews yet
      </h2>
      <p className="type-body-small mt-2 mx-auto max-w-md text-[var(--text-muted)]">
        Once your designer wraps a project, you’ll see a request to share your
        experience here.
      </p>
    </section>
  );
}
