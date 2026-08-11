'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  PROJECT_APPROVAL_CONTRACT,
  useCreateDecisionComment,
  useDecisionComments,
  useProjectApproval,
  useProjectApprovalRealtime,
} from '@patina/supabase';
import type { DecisionComment } from '@patina/supabase';
import { useClientDecision } from '@/hooks/use-decisions-client';
import { useAuth } from '@/hooks/use-auth';
import { DecisionCardClient } from '@/components/decision-card-client';
import { ProjectApprovalReview } from '@/components/approvals/project-approval-review';

function Stage2ApprovalDetail({
  projectId,
  decisionId,
}: {
  projectId: string;
  decisionId: string;
}) {
  useProjectApprovalRealtime(projectId);
  const approval = useProjectApproval(projectId, decisionId);

  if (approval.isLoading) {
    return <p role="status" className="type-body-small py-8">Loading frozen approval evidence…</p>;
  }
  if (approval.isError || !approval.data) {
    return (
      <p role="alert" className="type-body-small py-8 text-[var(--color-error)]">
        The authoritative approval evidence is unavailable. Refresh before taking action.
      </p>
    );
  }
  return <ProjectApprovalReview approval={approval.data} />;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ClientDecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: decision, isLoading } = useClientDecision(id);
  const { user } = useAuth();
  const { data: comments, isLoading: commentsLoading } = useDecisionComments(id);
  const createComment = useCreateDecisionComment();
  const [draft, setDraft] = useState('');

  const handlePost = () => {
    const body = draft.trim();
    if (!body) return;
    createComment.mutate(
      { decisionId: id, body },
      { onSuccess: () => setDraft('') }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="type-body-small">Decision not found.</p>
        <Link
          href="/decisions"
          className="mt-4 inline-flex items-center gap-1 type-meta text-[var(--accent-primary)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to decisions
        </Link>
      </div>
    );
  }

  const ordered = (comments ?? []) as DecisionComment[];

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/decisions"
        className="mb-6 inline-flex items-center gap-1.5 type-meta no-underline transition hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Decisions
      </Link>

      {decision.approval_contract === PROJECT_APPROVAL_CONTRACT && decision.project_id ? (
        <Stage2ApprovalDetail projectId={decision.project_id} decisionId={decision.id} />
      ) : (
        <DecisionCardClient decision={decision} />
      )}

      <section className="mt-8" aria-labelledby="decision-discussion-heading">
        <h2 id="decision-discussion-heading" className="type-meta mb-1">Discussion</h2>
        <p className="type-body-small mb-4 text-[var(--text-muted)]">
          Comments help you and your designer discuss the work. They never submit or change an approval outcome.
        </p>

        {commentsLoading ? (
          <div className="flex items-center gap-2 type-body-small text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading comments...
          </div>
        ) : ordered.length === 0 ? (
          <p className="type-body-small text-[var(--text-muted)]">
            No comments yet. Add a note for your designer below.
          </p>
        ) : (
          <ul className="space-y-3">
            {ordered.map((comment) => {
              const isMine = !!user && comment.author_id === user.id;
              return (
                <li
                  key={comment.id}
                  className="rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="type-meta-small text-[var(--text-muted)]">
                      {isMine ? 'You' : 'Designer'}
                    </span>
                    <span className="type-meta-small text-[var(--text-muted)]">
                      {formatTimestamp(comment.created_at)}
                    </span>
                  </div>
                  <p className="type-body-small whitespace-pre-wrap text-[var(--text-primary)]">
                    {comment.body}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {user && (
          <div className="mt-4">
            <label htmlFor="decision-discussion-comment" className="type-meta-small mb-2 block">
              Add to discussion
            </label>
            <textarea
              id="decision-discussion-comment"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share a question or note"
              rows={3}
              className="w-full resize-none rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:focus-ring"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handlePost}
                disabled={createComment.isPending || draft.trim().length === 0}
                className="inline-flex min-h-11 items-center gap-2 rounded-[3px] bg-patina-charcoal px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {createComment.isPending ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
