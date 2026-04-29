'use client';

import { useState } from 'react';
import {
  useClientReviews,
  useReviewStats,
  useCreateReviewRequest,
  useTogglePortfolioPublish,
  useCompletedProjectsWithoutReview,
} from '@patina/supabase';
import type { ClientReview, CompletedProject } from '@patina/supabase';
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
  const { data: unrequestedProjects, isLoading: unrequestedLoading } =
    useCompletedProjectsWithoutReview();
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

      {/* Completed projects with no review request — shown in the Pending tab */}
      {tab === 'pending' && !unrequestedLoading && (unrequestedProjects ?? []).length > 0 && (
        <div className="mb-6">
          <p
            className="mb-3 type-label-secondary"
            style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
          >
            Completed projects — no request sent yet
          </p>
          {(unrequestedProjects ?? []).map((project: CompletedProject) => {
            const dc = Array.isArray(project.designer_clients)
              ? project.designer_clients[0]
              : project.designer_clients;
            if (!dc) return null;

            const clientName =
              dc.client?.full_name || dc.client_name || dc.client_email || 'Client';
            const completedTs = project.completed_at ?? project.updated_at;
            const completedDate = new Date(completedTs);
            const daysSince = Math.floor(
              (Date.now() - completedDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            return (
              <ReviewRequestCard
                key={project.id}
                clientName={clientName}
                projectName={project.name}
                completedDate={completedDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
                daysSinceCompletion={daysSince}
                onSend={() => handleSendRequest(dc.id, project.id)}
              />
            );
          })}
          {(reviews ?? []).length > 0 && (
            <div
              className="mb-4"
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '8px',
                marginBottom: '20px',
              }}
            />
          )}
        </div>
      )}

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
                  projectDescription={`${projectName} · $${(revenue / 100).toLocaleString()} · Completed ${
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
                  {projectName} · Scheduled for{' '}
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
        tab !== 'pending' && (
          <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
            {tab === 'collected'
              ? "No reviews collected yet. They'll appear here after clients submit feedback."
              : 'No scheduled review requests.'}
          </p>
        )
      )}

      {/* Empty state for pending tab when no reviews AND no unrequested projects */}
      {tab === 'pending' &&
        !isLoading &&
        !unrequestedLoading &&
        (reviews ?? []).length === 0 &&
        (unrequestedProjects ?? []).length === 0 && (
          <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
            No pending review requests. Complete a project to send one.
          </p>
        )}
    </div>
  );
}
