'use client';

import { Star } from 'lucide-react';

import type { ClientPendingReview } from '@patina/supabase';

interface PastReviewCardProps {
  review: ClientPendingReview;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PastReviewCard({ review }: PastReviewCardProps) {
  const designerName =
    review.designer?.full_name?.trim() || review.designer?.business_name?.trim() || 'Designer';
  const projectName = review.project?.name ?? '';
  const rating = review.rating ?? 0;

  return (
    <article className="rounded-lg border border-[var(--border-default)] bg-white p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-base text-[var(--text-primary)]">
            {projectName || 'Project'}
          </p>
          <p className="type-meta-small text-[var(--text-muted)]">
            with {designerName} · {formatDate(review.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              width={14}
              height={14}
              className={
                n <= rating
                  ? 'fill-[var(--accent-primary)] text-[var(--accent-primary)]'
                  : 'text-[var(--border-default)]'
              }
            />
          ))}
        </div>
      </header>
      {review.review_text ? (
        <p className="mt-3 type-body-small whitespace-pre-line text-[var(--text-primary)]">
          {review.review_text}
        </p>
      ) : null}
    </article>
  );
}
