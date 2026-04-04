'use client';

import { useState } from 'react';
import {
  useClientReviews,
  useReviewStats,
  useCreateReviewRequest,
  useTogglePortfolioPublish,
} from '@patina/supabase';
import type { ClientReview } from '@patina/supabase';
import { FilterRow } from '@/components/portal/filter-row';
import { ReviewCard } from '@/components/portal/review-card';
import { ReviewRequestCard } from '@/components/portal/review-request-card';
import { LoadingStrata } from '@/components/portal/loading-strata';

type Tab = 'collected' | 'pending' | 'queued';

export default function ReviewsPage() {
  const [tab, setTab] = useState<Tab>('collected');

  const { data: stats } = useReviewStats();
  const { data: reviews, isLoading } = useClientReviews(
    tab === 'collected'
      ? { requestStatus: 'collected' }
      : tab === 'pending'
        ? { requestStatus: 'sent' }
        : { requestStatus: 'queued' }
  );
  const createReviewRequest = useCreateReviewRequest();
  const togglePublish = useTogglePortfolioPublish();

  const filterOptions = [
    { key: 'collected', label: 'Collected', count: stats?.totalCollected },
    { key: 'pending', label: 'Pending', count: stats?.pendingCount },
    { key: 'queued', label: 'Request Queued', count: stats?.queuedCount },
  ];

  const handleSendRequest = (designerClientId: string, projectId?: string) => {
    createReviewRequest.mutate({ designerClientId, projectId });
  };

  return (
    <div className="pt-8">
      <div className="mb-6">
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            fontWeight: 400,
            color: 'var(--text-primary)',
          }}
        >
          Reviews &amp; Feedback
        </h1>
      </div>

      <FilterRow
        options={filterOptions}
        active={tab}
        onChange={(key) => setTab(key as Tab)}
      />

      {isLoading ? (
        <LoadingStrata />
      ) : (reviews ?? []).length > 0 ? (
        <div>
          {(reviews ?? []).map((review: ClientReview) => {
            const clientName =
              review.designer_client?.client?.full_name ||
              review.designer_client?.client_name ||
              review.designer_client?.client_email ||
              'Client';
            const projectName = review.project?.name || 'Project';
            const revenue = review.designer_client?.total_revenue || 0;

            if (tab === 'collected' && review.rating != null) {
              return (
                <ReviewCard
                  key={review.id}
                  clientName={clientName}
                  rating={review.rating}
                  projectDescription={`${projectName} \u00B7 $${(revenue / 100).toLocaleString()} \u00B7 Completed ${
                    review.updated_at
                      ? new Date(review.updated_at).toLocaleDateString('en-US', {
                          month: 'short',
                          year: 'numeric',
                        })
                      : ''
                  }`}
                  reviewText={review.review_text || 'No review text provided.'}
                  tags={
                    review.published_to_portfolio
                      ? ['Published to Portfolio']
                      : []
                  }
                  referralCount={review.referral_count}
                />
              );
            }

            if (tab === 'pending') {
              const sentDate = review.request_sent_at
                ? new Date(review.request_sent_at)
                : new Date(review.created_at);
              const daysSince = Math.floor(
                (Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24)
              );

              return (
                <ReviewRequestCard
                  key={review.id}
                  clientName={clientName}
                  projectName={projectName}
                  completedDate={sentDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                  daysSinceCompletion={daysSince}
                  onSend={() =>
                    handleSendRequest(review.designer_client_id, review.project_id || undefined)
                  }
                />
              );
            }

            // Queued
            return (
              <div
                key={review.id}
                className="mb-4 rounded-md border border-[var(--border-subtle)] p-4"
              >
                <div className="type-label" style={{ fontSize: '0.88rem' }}>
                  {clientName}
                </div>
                <div className="type-label-secondary mt-1">
                  {projectName} \u00B7 Scheduled for{' '}
                  {review.scheduled_for
                    ? new Date(review.scheduled_for).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'TBD'}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          {tab === 'collected'
            ? "No reviews collected yet. They'll appear here after clients submit feedback."
            : tab === 'pending'
              ? 'No pending review requests.'
              : 'No scheduled review requests.'}
        </p>
      )}
    </div>
  );
}
