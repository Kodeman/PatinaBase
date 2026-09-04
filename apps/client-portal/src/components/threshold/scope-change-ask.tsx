"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  useApproveScopeChange,
  useCreateClientScopeChangeRequest,
  useDeclineScopeChange,
  useScopeChangeRequests,
} from "@patina/supabase";

import { ScoredAction } from "@/components/making/scored-action";
import {
  countInWords,
  joinClauses,
  moneyInWords,
} from "@/components/making/standing-sentence";

/* ── SCOPE CHANGE ─────────────────────────────────────────────────────────────
   Absorbs `/projects/[id]/scope-change/new` (raise a request) and
   `/projects/[id]/scope-change/[changeId]` (decide one the studio sent). Both
   read and write `scope_change_requests` through hooks that already exist —
   `useScopeChangeRequests` is project-scoped and client-readable, so unlike
   the two review routes this needs no query-param workaround to find its own
   pending row.

   `RequestChangeAct` is the trigger: it mounts wherever "Ask for a change"
   belongs — the mat (house-wide) and each room band (room-scoped, carried
   through via the mark's own `roomId` so a studio triaging the request knows
   which room it was raised from, the one thing the old bare `/scope-change/new`
   route never captured). `PendingScopeChangeAsk` is the doorstep ask for a
   change the STUDIO sent — `request_origin !== 'client_request'` — which is
   the only direction that asks the client to decide anything; a client's own
   request is theirs to withdraw, not a gate anyone owes a response through. */

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
});
const MIN_DESCRIPTION = 10;

interface ScopeChangeRow {
  id: string;
  title: string;
  description: string;
  status: string;
  request_origin: string | null;
  additional_ffe_budget_cents: number | null;
  additional_design_fee_cents: number | null;
  timeline_impact_weeks: number | null;
  new_total_budget_cents: number | null;
}

function isPendingStudioChange(row: ScopeChangeRow): boolean {
  return (
    row.request_origin !== "client_request" &&
    (row.status === "sent" || row.status === "viewed")
  );
}

function impactLine(row: ScopeChangeRow): string | null {
  const clauses: string[] = [];
  if ((row.additional_ffe_budget_cents ?? 0) > 0) {
    clauses.push(
      `${moneyInWords(row.additional_ffe_budget_cents!)} additional FF&E budget`,
    );
  }
  if ((row.additional_design_fee_cents ?? 0) > 0) {
    clauses.push(
      `${moneyInWords(row.additional_design_fee_cents!)} additional design fee`,
    );
  }
  if ((row.timeline_impact_weeks ?? 0) > 0) {
    const weeks = row.timeline_impact_weeks!;
    clauses.push(
      `${countInWords(weeks)} ${weeks === 1 ? "week" : "weeks"} added to the timeline`,
    );
  }
  if (clauses.length === 0) return null;
  const total =
    (row.new_total_budget_cents ?? 0) > 0
      ? ` New project value: ${moneyInWords(row.new_total_budget_cents!)}.`
      : "";
  return `${joinClauses(clauses)}.${total}`;
}

export interface RequestChangeActProps {
  projectId: string;
  /** Present when raised from a room band; absent from the mat's house-wide ask. */
  roomId?: string;
  roomName?: string;
}

/**
 * "Ask for a change" — closed by default (the mat and every room band would
 * otherwise carry a form nobody asked to see), unfolding in place into the
 * old `/scope-change/new` form's two fields. Advanced-mode fields (category,
 * priority, attachments, response window) never persisted past the old
 * form's own `basic` mode either — `useCreateClientScopeChangeRequest` only
 * ever takes a title and a description.
 */
export function RequestChangeAct({
  projectId,
  roomId,
  roomName,
}: RequestChangeActProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const create = useCreateClientScopeChangeRequest();
  const queryClient = useQueryClient();

  const region = roomId ? "room-band" : "mat";
  const scope = roomId ? `room-${roomId}` : "mat";
  const fieldId = (name: string) => `scope-change-${scope}-${name}`;

  if (sentAt) {
    return (
      <p
        data-testid="scope-change-request-sent"
        className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]"
      >
        {`Sent ${DAY_MONTH.format(sentAt)}. Your studio will follow up.`}
      </p>
    );
  }

  if (!open) {
    return (
      <div className="mt-3">
        <ScoredAction
          actionKey="scope_change_open"
          regionKey={region}
          surfaceKey="the_threshold"
          variant="tertiary"
          onClick={() => setOpen(true)}
          data-testid={
            roomId ? `request-change-${roomId}` : "request-change-mat"
          }
        >
          {roomName ? `Ask for a change in ${roomName}` : "Ask for a change"}
        </ScoredAction>
      </div>
    );
  }

  function handleSubmit() {
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle) {
      setError("Give the change a short title.");
      return;
    }
    if (trimmedDescription.length < MIN_DESCRIPTION) {
      setError(`Say a little more — at least ${MIN_DESCRIPTION} characters.`);
      return;
    }
    create.mutate(
      {
        projectId,
        idempotencyKey: globalThis.crypto.randomUUID(),
        title: trimmedTitle,
        description: trimmedDescription,
      },
      {
        onSuccess: () => {
          setSentAt(new Date());
          void queryClient.invalidateQueries({
            queryKey: ["scope-changes", projectId],
          });
        },
        onError: (err) => {
          setError(
            err instanceof Error
              ? err.message
              : "Could not send just now. Try again.",
          );
        },
      },
    );
  }

  return (
    <div className="mt-3 max-w-[52ch]" data-testid="scope-change-form">
      <label
        htmlFor={fieldId("title")}
        className="block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
      >
        What would you like to change?
      </label>
      <input
        id={fieldId("title")}
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="A short title"
        data-testid="scope-change-title"
        className="mt-1.5 w-full border-0 border-b border-current bg-transparent px-0.5 py-1 font-heading text-[1.05rem] text-[var(--text-primary)]"
      />

      <label
        htmlFor={fieldId("description")}
        className="mt-4 block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
      >
        Tell us more
      </label>
      <textarea
        id={fieldId("description")}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={4}
        placeholder="Describe the change you have in mind."
        data-testid="scope-change-description"
        className="mt-1.5 w-full resize-y border border-[var(--border-default)] bg-transparent px-3 py-2 text-[15px] leading-relaxed text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--threshold-accent,#8A5F19)]"
      />

      {error && (
        <p
          role="alert"
          className="mt-2 text-[15px] leading-normal text-[var(--color-error)]"
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ScoredAction
          actionKey="scope_change_send"
          regionKey={region}
          surfaceKey="the_threshold"
          variant="primary"
          loading={create.isPending}
          loadingLabel="Sending"
          onClick={handleSubmit}
          data-testid="scope-change-send"
        >
          Send the request
        </ScoredAction>
        <ScoredAction
          actionKey="scope_change_cancel"
          regionKey={region}
          surfaceKey="the_threshold"
          variant="tertiary"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </ScoredAction>
      </div>
    </div>
  );
}

/**
 * A change the studio proposed, standing on the doorstep the way
 * `DoorstepApproval` does: it carries no single room (the old page never
 * scoped a studio-sent change to one either — `new_rooms` can add several at
 * once) so it stands beside the ledger, not inside a band.
 */
export function PendingScopeChangeAsk({ projectId }: { projectId: string }) {
  const scopeQuery = useScopeChangeRequests(projectId);
  const approve = useApproveScopeChange();
  const decline = useDeclineScopeChange();
  const [signName, setSignName] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{
    kind: "approved" | "declined";
    at: Date;
  } | null>(null);

  const rows = (scopeQuery.data ?? []) as ScopeChangeRow[];
  const request = rows.find(isPendingStudioChange) ?? null;

  if (resolved) {
    return (
      <section
        data-threshold-unit="scope-change-ask"
        data-testid="scope-change-resolved"
        className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
      >
        <p className="pt-2.5 text-[15px] leading-relaxed text-[var(--text-body)]">
          {resolved.kind === "approved"
            ? `Approved ${DAY_MONTH.format(resolved.at)}.`
            : `Declined ${DAY_MONTH.format(resolved.at)}.`}
        </p>
      </section>
    );
  }
  if (!request) return null;

  const impact = impactLine(request);

  function handleApprove() {
    setError(null);
    if (!signName.trim()) {
      setError("Type your full name to approve.");
      return;
    }
    approve.mutate(
      { requestId: request!.id, projectId, approvedByName: signName.trim() },
      {
        onSuccess: () => setResolved({ kind: "approved", at: new Date() }),
        onError: (err) => {
          setError(
            err instanceof Error
              ? err.message
              : "Could not send just now. Try again.",
          );
        },
      },
    );
  }

  function handleDecline() {
    setError(null);
    decline.mutate(
      {
        requestId: request!.id,
        projectId,
        declineReason: declineReason.trim() || undefined,
      },
      {
        onSuccess: () => setResolved({ kind: "declined", at: new Date() }),
        onError: (err) => {
          setError(
            err instanceof Error
              ? err.message
              : "Could not send just now. Try again.",
          );
        },
      },
    );
  }

  return (
    <section
      id={`scope-change-${request.id}`}
      data-threshold-unit="scope-change-ask"
      data-never-dim=""
      data-testid="scope-change-ask"
      aria-labelledby={`scope-change-title-${request.id}`}
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <p className="pt-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        A gate · your studio proposed a change
      </p>
      <h2
        id={`scope-change-title-${request.id}`}
        className="font-heading mt-1.5 text-[1.35rem] font-medium tracking-[-0.012em]"
      >
        {request.title}
      </h2>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]">
        {request.description}
      </p>
      {impact && (
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]">
          {impact}
        </p>
      )}

      {!showDecline ? (
        <div className="mt-4">
          <label
            htmlFor={`scope-change-sign-${request.id}`}
            className="block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
          >
            Type your full name
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <input
              id={`scope-change-sign-${request.id}`}
              type="text"
              value={signName}
              autoComplete="name"
              onChange={(event) => setSignName(event.target.value)}
              data-testid="scope-change-sign-name"
              className="min-w-[12rem] border-0 border-b border-current bg-transparent px-0.5 py-1 font-heading text-[1.1rem] text-[var(--text-primary)]"
            />
            <ScoredAction
              actionKey="scope_change_approve"
              regionKey="doorstep"
              surfaceKey="the_threshold"
              variant="primary"
              disabled={!signName.trim()}
              loading={approve.isPending}
              loadingLabel="Approving"
              onClick={handleApprove}
              data-testid="scope-change-approve"
            >
              Approve the change
            </ScoredAction>
            <ScoredAction
              actionKey="scope_change_decline_open"
              regionKey="doorstep"
              surfaceKey="the_threshold"
              variant="tertiary"
              onClick={() => setShowDecline(true)}
              data-testid="scope-change-decline-open"
            >
              Decline
            </ScoredAction>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <label
            htmlFor={`scope-change-reason-${request.id}`}
            className="block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
          >
            Reason (optional)
          </label>
          <textarea
            id={`scope-change-reason-${request.id}`}
            value={declineReason}
            onChange={(event) => setDeclineReason(event.target.value)}
            rows={3}
            placeholder="Why are you declining this change?"
            data-testid="scope-change-decline-reason"
            className="mt-1.5 w-full max-w-[52ch] resize-y border border-[var(--border-default)] bg-transparent px-3 py-2 text-[15px] leading-relaxed text-[var(--text-primary)]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ScoredAction
              actionKey="scope_change_decline"
              regionKey="doorstep"
              surfaceKey="the_threshold"
              variant="danger"
              loading={decline.isPending}
              loadingLabel="Declining"
              onClick={handleDecline}
              data-testid="scope-change-decline-confirm"
            >
              Confirm decline
            </ScoredAction>
            <ScoredAction
              actionKey="scope_change_decline_cancel"
              regionKey="doorstep"
              surfaceKey="the_threshold"
              variant="tertiary"
              onClick={() => setShowDecline(false)}
            >
              Back
            </ScoredAction>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 text-[15px] leading-normal text-[var(--color-error)]"
        >
          {error}
        </p>
      )}
    </section>
  );
}
