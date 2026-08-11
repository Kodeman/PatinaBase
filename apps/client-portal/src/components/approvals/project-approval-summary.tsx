"use client";

import Link from "next/link";

import type { ProjectApprovalReview } from "@patina/supabase";
import {
  isClientActionableProjectApproval,
  isProjectApprovalAwaitingStudioIssue,
  projectApprovalAttentionLabel,
} from "@/lib/client-attention";

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
  return projectApprovalAttentionLabel(approval);
}

export function ProjectApprovalSummary({
  approval,
  compact = false,
}: {
  approval: ProjectApprovalReview;
  compact?: boolean;
}) {
  const status = projectApprovalStatusLabel(approval);
  const awaitingStudioIssue = isProjectApprovalAwaitingStudioIssue(approval);
  return (
    <article
      className="min-w-0 border-b border-[var(--border-default)] py-4"
      data-testid="project-approval-summary"
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="type-meta-small text-[var(--text-muted)]">
            {status}
            {approval.isOverdue &&
            isClientActionableProjectApproval(approval) &&
            status !== "Overdue"
              ? " · Overdue"
              : ""}
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
        {!awaitingStudioIssue && (
          <p className="type-meta flex-none">
            Due{" "}
            <time dateTime={approval.dueAt}>{formatDate(approval.dueAt)}</time>
          </p>
        )}
      </div>
    </article>
  );
}
