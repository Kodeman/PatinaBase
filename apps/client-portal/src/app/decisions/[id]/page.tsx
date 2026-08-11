'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  PROJECT_APPROVAL_CONTRACT,
  useCreateDecisionComment,
  useDecisionComments,
  useDecisionRealtime,
  useProjectApprovalByDecision,
  useProjectApprovalRealtime,
} from '@patina/supabase';
import type {
  DecisionComment,
  ProjectApprovalReview as ProjectApprovalReviewData,
} from '@patina/supabase';
import { useClientDecision } from '@/hooks/use-decisions-client';
import { useAuth } from '@/hooks/use-auth';
import { DecisionCardClient } from '@/components/decision-card-client';
import { ProjectApprovalReview } from '@/components/approvals/project-approval-review';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function BackToDecisions({ all = false }: { all?: boolean }) {
  return (
    <Link
      href="/decisions"
      className="inline-flex min-h-11 items-center gap-1.5 type-meta no-underline transition hover:text-[var(--text-primary)] focus-visible:focus-ring"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {all ? 'All Decisions' : 'Back to decisions'}
    </Link>
  );
}

function DecisionDiscussion({ decisionId }: { decisionId: string }) {
  const { user } = useAuth();
  const {
    data: comments,
    isLoading: commentsLoading,
    isError: commentsError,
  } = useDecisionComments(decisionId);
  const createComment = useCreateDecisionComment();
  const [draft, setDraft] = useState('');
  const [postFailed, setPostFailed] = useState(false);
  useDecisionRealtime(decisionId);

  const handlePost = () => {
    const body = draft.trim();
    if (!body) return;
    setPostFailed(false);
    createComment.mutate(
      { decisionId, body },
      {
        onSuccess: () => {
          setDraft('');
          setPostFailed(false);
        },
        onError: () => setPostFailed(true),
      },
    );
  };

  const ordered = (comments ?? []) as DecisionComment[];

  return (
    <section className="mt-8 min-w-0" aria-labelledby="decision-discussion-heading">
      <h2 id="decision-discussion-heading" className="type-meta mb-1">
        Discussion
      </h2>
      <p className="type-body-small mb-4 text-[var(--text-muted)]">
        Comments help you and your designer discuss the work. They never submit or change an approval outcome.
      </p>

      {commentsLoading ? (
        <div
          role="status"
          className="flex items-center gap-2 type-body-small text-[var(--text-muted)]"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading comments...
        </div>
      ) : commentsError ? (
        <p role="alert" className="type-body-small text-[var(--color-error)]">
          Comments could not be read just now. Refresh to try again.
        </p>
      ) : ordered.length === 0 ? (
        <p className="type-body-small text-[var(--text-muted)]">
          No comments yet. Add a note for your designer below.
        </p>
      ) : (
        <ul className="min-w-0 space-y-3">
          {ordered.map((comment) => {
            const isMine = !!user && comment.author_id === user.id;
            return (
              <li
                key={comment.id}
                className="min-w-0 rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2"
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="type-meta-small text-[var(--text-muted)]">
                    {isMine ? 'You' : 'Designer'}
                  </span>
                  <span className="type-meta-small text-[var(--text-muted)]">
                    {formatTimestamp(comment.created_at)}
                  </span>
                </div>
                <p className="type-body-small whitespace-pre-wrap break-words text-[var(--text-primary)]">
                  {comment.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {user && (
        <div className="mt-4 min-w-0">
          <label htmlFor="decision-discussion-comment" className="type-meta-small mb-2 block">
            Add to discussion
          </label>
          <textarea
            id="decision-discussion-comment"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Share a question or note"
            rows={3}
            className="w-full min-w-0 resize-none rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:focus-ring"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handlePost}
              disabled={createComment.isPending || draft.trim().length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-[3px] bg-patina-charcoal px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60 focus-visible:focus-ring"
            >
              {createComment.isPending ? 'Posting...' : 'Post'}
            </button>
          </div>
          {postFailed && (
            <p role="alert" className="type-body-small mt-2 text-[var(--color-error)]">
              Comment could not be posted. Your draft is still here; try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function AuthorizedStage2Detail({
  approval,
}: {
  approval: ProjectApprovalReviewData;
}) {
  useProjectApprovalRealtime(approval.projectId);

  return (
    <DecisionDetailShell>
      <ProjectApprovalReview approval={approval} />
      <DecisionDiscussion decisionId={approval.decisionId} />
    </DecisionDetailShell>
  );
}

function DecisionDetailShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-w-0 max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <BackToDecisions all />
      </div>
      {children}
    </main>
  );
}

function LegacyDecisionDetail({ decisionId }: { decisionId: string }) {
  const { data: decision, isLoading } = useClientDecision(decisionId);

  if (isLoading) {
    return (
      <main className="mx-auto min-w-0 max-w-2xl px-4 py-16 sm:px-6">
        <p role="status" className="type-body-small text-center">
          Loading decision…
        </p>
      </main>
    );
  }

  if (!decision) {
    return (
      <main className="mx-auto min-w-0 max-w-2xl px-4 py-16 text-center sm:px-6">
        <p className="type-body-small">Decision not found.</p>
        <div className="mt-4">
          <BackToDecisions />
        </div>
      </main>
    );
  }

  if (decision.approval_contract === PROJECT_APPROVAL_CONTRACT) {
    return (
      <main className="mx-auto min-w-0 max-w-2xl px-4 py-16 sm:px-6">
        <p role="alert" className="type-body-small text-[var(--color-error)]">
          The authoritative approval evidence is unavailable. Refresh before taking action.
        </p>
      </main>
    );
  }

  return (
    <DecisionDetailShell>
      <DecisionCardClient decision={decision} />
      <DecisionDiscussion decisionId={decision.id} />
    </DecisionDetailShell>
  );
}

export default function ClientDecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const approval = useProjectApprovalByDecision(id);

  if (approval.isLoading) {
    return (
      <main className="mx-auto min-w-0 max-w-2xl px-4 py-16 sm:px-6">
        <p role="status" className="type-body-small text-center">
          Loading approval evidence…
        </p>
      </main>
    );
  }

  if (approval.isError) {
    return (
      <main className="mx-auto min-w-0 max-w-2xl px-4 py-16 sm:px-6">
        <p role="alert" className="type-body-small text-[var(--color-error)]">
          The authoritative approval evidence is unavailable. Refresh before taking action.
        </p>
      </main>
    );
  }

  if (approval.data) {
    return <AuthorizedStage2Detail approval={approval.data} />;
  }

  return <LegacyDecisionDetail decisionId={id} />;
}
