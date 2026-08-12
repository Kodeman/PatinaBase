"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  useConfirmProjectApprovalReview,
  useRespondProjectApproval,
  type ProjectApprovalOutcome,
  type ProjectApprovalReview,
} from "@patina/supabase";

import { ScoredAction } from "@/components/making/scored-action";
import { GateStamp } from "./gate-stamp";

/* ── The client's side of the gate (Ruling VIII, folio 13, mockup M8) ───────
   Codex's three outcomes and their copy are load-bearing and stay verbatim —
   this file only adds the ceremony around them. A gate has six parts and no
   more (Ruling II, folio 08): Artifact, Question, Scope, Impact, Authority,
   Confirmation. Five already existed here field-for-field; Scope is the free
   -text `context` line doing the job by convention, same as the designer's
   side. The client's surface owes three things the designer's does not — an
   immutability sentence naming the frozen edition, the same signed impact
   figures the designer saw, and a way to hold the gate that reads as a
   legitimate move rather than a stalled form. No overdue device renders here:
   elapsed time is the studio's condition to carry and nudge from, never the
   client's to be shown (Ruling VIII). ─────────────────────────────────────── */

const OUTCOMES: Array<{
  value: ProjectApprovalOutcome;
  label: string;
  description: string;
}> = [
  {
    value: "approved",
    label: "Approved",
    description: "Accept this exact artifact and its stated impacts.",
  },
  {
    value: "changes_requested",
    label: "Changes requested",
    description: "Return this edition for revision and a new approval request.",
  },
  {
    value: "needs_discussion",
    label: "Needs discussion",
    description: "Hold the gate while you and your designer talk it through.",
  },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatMoneyDelta(cents: number): string {
  if (cents === 0) return "$0 — no cost change";
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(cents) / 100);
  return `${cents > 0 ? "+" : "−"}${amount}`;
}

function formatDayDelta(days: number, noun: string): string {
  if (days === 0) return `0 days — no ${noun} change`;
  return `${days > 0 ? "+" : "−"}${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;
}

function outcomeLabel(outcome: ProjectApprovalOutcome): string {
  return OUTCOMES.find((item) => item.value === outcome)?.label ?? outcome;
}

export function ProjectApprovalReview({
  approval,
}: {
  approval: ProjectApprovalReview;
}) {
  const router = useRouter();
  const confirmReview = useConfirmProjectApprovalReview();
  const respond = useRespondProjectApproval();
  const [selectedOutcome, setSelectedOutcome] =
    useState<ProjectApprovalOutcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reviewComplete =
    approval.completedReviewCount >= approval.requiredReviewCount;
  const canConfirm =
    approval.lifecycleStatus === "draft" &&
    !reviewComplete &&
    approval.authorityRevision !== null;
  const canRespond =
    approval.lifecycleStatus === "pending" &&
    approval.disposition === "active" &&
    reviewComplete &&
    approval.outcome === null;

  async function handleConfirmReview() {
    if (!canConfirm || approval.authorityRevision === null) return;
    setError(null);
    setNotice(null);
    try {
      await confirmReview.mutateAsync({
        projectId: approval.projectId,
        decisionId: approval.decisionId,
        authorityRevision: approval.authorityRevision,
        artifactChecksum: approval.artifactChecksum,
        idempotencyKey: crypto.randomUUID(),
      });
      setNotice(
        "Review confirmed for this exact artifact. Your designer can now issue it.",
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The artifact changed or the review could not be confirmed. Refresh and review it again.",
      );
    }
  }

  async function handleRespond() {
    if (!canRespond || !selectedOutcome) return;
    setError(null);
    setNotice(null);
    try {
      await respond.mutateAsync({
        projectId: approval.projectId,
        decisionId: approval.decisionId,
        outcome: selectedOutcome,
        expectedUpdatedAt: approval.updatedAt,
        idempotencyKey: crypto.randomUUID(),
      });
      setNotice(`${outcomeLabel(selectedOutcome)} recorded.`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This approval changed while it was open. Refresh before responding.",
      );
    }
  }

  return (
    <section
      aria-labelledby="project-approval-question"
      className="min-w-0"
      data-testid="project-approval-review"
    >
      <p className="type-meta text-[var(--text-muted)]">Project approval</p>

      <div data-testid="gate-anatomy">
        {/* ── Artifact — the exact thing, at a stated edition ──────────────── */}
        <section
          aria-labelledby="anatomy-artifact-heading"
          className="mt-6"
          data-testid="anatomy-artifact"
        >
          <h2 id="anatomy-artifact-heading" className="type-meta">
            Artifact
          </h2>
          <p className="type-item-name mt-2 break-words">
            {approval.artifactTitle}
          </p>
          <p className="type-body mt-2" data-testid="immutability-sentence">
            You are approving edition {approval.artifactVersion}, exactly as
            shown.
          </p>
          <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="type-meta">Due</dt>
              <dd className="type-body-small mt-1">
                <time dateTime={approval.dueAt}>
                  {formatDate(approval.dueAt)}
                </time>
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="type-meta">SHA-256 artifact checksum</dt>
              <dd
                className="mt-1 min-w-0 break-all font-mono text-xs"
                data-testid="artifact-checksum"
              >
                {approval.artifactChecksum}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── Question — one sentence, answerable ──────────────────────────── */}
        <section
          aria-labelledby="anatomy-question-heading"
          className="border-t border-[var(--border-default)] py-5"
          data-testid="anatomy-question"
        >
          <h2 id="anatomy-question-heading" className="type-meta">
            Question
          </h2>
          <h1
            id="project-approval-question"
            className="type-page-title mt-2 break-words"
          >
            {approval.question}
          </h1>
        </section>

        {/* ── Scope — what this releases and what it does not ─────────────── */}
        {approval.context && (
          <section
            aria-labelledby="anatomy-scope-heading"
            className="border-t border-[var(--border-default)] py-5"
            data-testid="anatomy-scope"
          >
            <h2 id="anatomy-scope-heading" className="type-meta">
              Scope
            </h2>
            <p className="type-body mt-2 whitespace-pre-wrap break-words">
              {approval.context}
            </p>
          </section>
        )}

        {/* ── Impact — the deltas, signed ──────────────────────────────────── */}
        <section
          aria-labelledby="anatomy-impact-heading"
          className="border-t border-[var(--border-default)] py-5"
          data-testid="anatomy-impact"
        >
          <h2 id="anatomy-impact-heading" className="type-meta">
            Impact
          </h2>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="border-t border-[var(--border-default)] pt-3">
              <dt className="type-meta">Cost</dt>
              <dd className="type-body-small mt-1" data-testid="cost-delta">
                {formatMoneyDelta(approval.costCentsDelta)}
              </dd>
            </div>
            <div className="border-t border-[var(--border-default)] pt-3">
              <dt className="type-meta">Schedule</dt>
              <dd
                className="type-body-small mt-1"
                data-testid="schedule-delta"
              >
                {formatDayDelta(approval.scheduleDaysDelta, "schedule")}
              </dd>
            </div>
            <div className="border-t border-[var(--border-default)] pt-3">
              <dt className="type-meta">Lead time</dt>
              <dd className="type-body-small mt-1" data-testid="lead-delta">
                {formatDayDelta(approval.leadTimeDaysDelta, "lead-time")}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── Authority — the named lead, frozen at publish ────────────────── */}
        <section
          aria-labelledby="anatomy-authority-heading"
          className="border-t border-[var(--border-default)] py-5"
          data-testid="anatomy-authority"
        >
          <h2 id="anatomy-authority-heading" className="type-meta">
            Authority
          </h2>
          <p className="type-body-small mt-2">
            {approval.completedReviewCount} of {approval.requiredReviewCount}{" "}
            required reviews confirmed.
          </p>
          {canConfirm && (
            <ScoredAction
              actionKey="confirm_project_approval_review"
              surfaceKey="project_approval"
              regionKey="authority"
              variant="primary"
              onClick={handleConfirmReview}
              disabled={confirmReview.isPending}
              className="mt-4"
            >
              {confirmReview.isPending
                ? "Confirming review…"
                : "I reviewed this exact edition"}
            </ScoredAction>
          )}
          {approval.lifecycleStatus === "draft" &&
            !reviewComplete &&
            approval.authorityRevision === null && (
              <p
                role="alert"
                className="type-body-small mt-3 text-[var(--color-error)]"
              >
                Review confirmation is temporarily unavailable. The frozen
                authority revision was not supplied.
              </p>
            )}
          {approval.lifecycleStatus === "draft" && reviewComplete && (
            <p className="type-body-small mt-3">
              Review complete. Your designer can now issue this request.
            </p>
          )}
        </section>

        {/* ── Confirmation — one scored act ────────────────────────────────── */}
        {canRespond && (
          <fieldset
            aria-labelledby="anatomy-confirmation-heading"
            className="border-t border-[var(--border-default)] py-5"
            data-testid="anatomy-confirmation"
          >
            <legend id="anatomy-confirmation-heading" className="type-meta">
              Confirmation
            </legend>
            <p className="type-body-small mt-2 text-[var(--text-muted)]">
              Choose one outcome. Add questions or notes in Discussion below;
              comments do not submit an outcome.
            </p>
            <div className="mt-4 divide-y divide-[var(--border-default)] border-y border-[var(--border-default)]">
              {OUTCOMES.map((item) => (
                <label
                  key={item.value}
                  className="flex min-h-11 cursor-pointer items-start gap-3 py-4"
                >
                  <input
                    type="radio"
                    name="project-approval-outcome"
                    value={item.value}
                    checked={selectedOutcome === item.value}
                    onChange={() => setSelectedOutcome(item.value)}
                    className="mt-1 h-5 w-5 flex-none"
                  />
                  <span className="min-w-0">
                    <span className="type-item-name block">{item.label}</span>
                    <span className="type-body-small mt-1 block text-[var(--text-muted)]">
                      {item.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <ScoredAction
              actionKey="submit_project_approval_response"
              surfaceKey="project_approval"
              regionKey="confirmation"
              variant="primary"
              onClick={handleRespond}
              disabled={!selectedOutcome || respond.isPending}
              className="mt-4"
            >
              {respond.isPending ? "Recording response…" : "Submit response"}
            </ScoredAction>
          </fieldset>
        )}
      </div>

      {approval.outcome === "approved" && (
        <div
          className="border-t border-[var(--border-default)] py-5"
          data-testid="approval-seal"
        >
          <GateStamp label="Approved" variant="seal" settle />
          <p className="type-body-small mt-3">
            Recorded outcome: <strong>{outcomeLabel(approval.outcome)}</strong>
          </p>
        </div>
      )}
      {approval.outcome === "needs_discussion" && (
        <div
          className="border-t border-[var(--border-default)] py-5"
          data-testid="held-for-discussion"
        >
          <GateStamp label="Held for discussion" variant="hold" />
          {/* The stamp reads "Held for discussion" (the gate's own state);
              the outcome picker's copy reads "Needs discussion" (the verbatim
              outcome label, unchanged). The recorded line here matches the
              stamp — both describe the same held gate, and a visible reader
              and a screen-reader announcement should not disagree on the
              word for it. */}
          <p className="type-body-small mt-3">
            Recorded outcome: <strong>Held for discussion</strong>
          </p>
        </div>
      )}
      {approval.outcome === "changes_requested" && (
        <p className="border-t border-[var(--border-default)] py-5 type-body">
          Recorded outcome: <strong>{outcomeLabel(approval.outcome)}</strong>
        </p>
      )}

      {(approval.predecessorDecisionId || approval.successorDecisionId) && (
        <nav
          aria-label="Approval revision history"
          className="border-t border-[var(--border-default)] py-5"
        >
          <h2 className="type-meta">Revision history</h2>
          <ol className="mt-2 space-y-1">
            {approval.predecessorDecisionId && (
              <li>
                <Link
                  className="inline-flex min-h-11 items-center underline"
                  href={`/decisions/${approval.predecessorDecisionId}`}
                >
                  Review previous edition
                </Link>
              </li>
            )}
            {approval.successorDecisionId && (
              <li>
                <Link
                  className="inline-flex min-h-11 items-center underline"
                  href={`/decisions/${approval.successorDecisionId}`}
                >
                  Review revised edition
                </Link>
              </li>
            )}
          </ol>
        </nav>
      )}

      {notice && (
        <p role="status" className="type-body-small mt-4">
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="type-body-small mt-4 text-[var(--color-error)]"
        >
          {error}
        </p>
      )}
    </section>
  );
}
