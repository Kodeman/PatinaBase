"use client";

import Link from "next/link";

import {
  useProjectApproval,
  type ProjectApprovalReview,
} from "@patina/supabase";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function projectApprovalStatusLabel(
  approval: ProjectApprovalReview,
): string {
  if (approval.disposition === "withdrawn") return "Withdrawn";
  if (approval.disposition === "superseded") return "Superseded";
  if (approval.outcome === "approved") return "Approved";
  if (approval.outcome === "changes_requested") return "Changes requested";
  if (approval.outcome === "needs_discussion") return "Needs discussion";
  if (approval.lifecycleStatus === "draft") return "Review required";
  if (approval.isOverdue) return "Overdue";
  return "Response required";
}

export function ProjectApprovalSummary({
  approval,
  compact = false,
}: {
  approval: ProjectApprovalReview;
  compact?: boolean;
}) {
  const status = projectApprovalStatusLabel(approval);
  return (
    <article
      className="min-w-0 border-b border-[var(--border-default)] py-4"
      data-testid="project-approval-summary"
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="type-meta-small text-[var(--text-muted)]">
            {status}
            {approval.isOverdue && status !== "Overdue" ? " · Overdue" : ""}
          </p>
          <h3 className="type-item-name mt-1 break-words">
            <Link
              href={`/decisions/${approval.decisionId}`}
              className="inline-flex min-h-11 items-center no-underline hover:underline focus-visible:focus-ring"
            >
              {approval.question}
            </Link>
          </h3>
          {!compact && (
            <p className="type-body-small mt-1 break-words text-[var(--text-muted)]">
              {approval.artifactTitle} · Edition {approval.artifactVersion}
            </p>
          )}
        </div>
        <p className="type-meta flex-none">
          Due{" "}
          <time dateTime={approval.dueAt}>{formatDate(approval.dueAt)}</time>
        </p>
      </div>
    </article>
  );
}

/** List-route adapter that reuses the canonical project query key. */
export function ProjectApprovalSummaryForDecision({
  projectId,
  decisionId,
  fallbackTitle,
  compact = false,
}: {
  projectId: string;
  decisionId: string;
  fallbackTitle: string;
  compact?: boolean;
}) {
  const approval = useProjectApproval(projectId, decisionId);
  if (approval.isLoading) {
    return (
      <div
        className="border-b border-[var(--border-default)] py-4"
        role="status"
      >
        <span className="type-body-small">Loading approval details…</span>
      </div>
    );
  }
  if (!approval.data) {
    return (
      <article className="border-b border-[var(--border-default)] py-4">
        <p className="type-meta-small">Approval details unavailable</p>
        <Link
          href={`/decisions/${decisionId}`}
          className="type-item-name mt-1 inline-flex min-h-11 items-center no-underline hover:underline"
        >
          {fallbackTitle}
        </Link>
      </article>
    );
  }
  return <ProjectApprovalSummary approval={approval.data} compact={compact} />;
}
