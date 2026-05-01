'use client';

import { useState } from 'react';

import {
  useMyPendingReviewRequests,
  useMySubmittedReviews,
} from '@patina/supabase';
import type { ClientPendingReview } from '@patina/supabase';

import { PastReviewCard } from './PastReviewCard';
import { SubmitReviewDialog } from './SubmitReviewDialog';

interface ReviewsIndexProps {
  userId: string;
}

export function ReviewsIndex({ userId }: ReviewsIndexProps) {
  const { data: pending = [], isLoading: pendingLoading } = useMyPendingReviewRequests(userId);
  const { data: past = [], isLoading: pastLoading } = useMySubmittedReviews(userId);
  const [active, setActive] = useState<ClientPendingReview | null>(null);

  const isLoading = pendingLoading || pastLoading;

  if (isLoading) {
    return (
      <p className="mt-8 type-body-small text-[var(--text-muted)]">Loading your reviews…</p>
    );
  }

  if (pending.length === 0 && past.length === 0) {
    return (
      <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-8 text-center">
        <h2 className="font-heading text-lg text-[var(--text-primary)]">No reviews yet</h2>
        <p className="type-body-small mt-2 text-[var(--text-muted)]">
          Once your designer wraps a project, you&rsquo;ll see a request to share your experience here.
        </p>
      </section>
    );
  }

  return (
    <div className="mt-8 space-y-10">
      {pending.length > 0 ? (
        <section>
          <h2 className="font-heading text-base text-[var(--text-primary)]">
            Pending requests
          </h2>
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
