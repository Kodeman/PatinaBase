"use client";

import { useRef, useState } from "react";

import {
  useApproveScopeChange,
  useCancelClientScopeChangeRequest,
  useCreateClientScopeChangeRequest,
  useDeclineScopeChange,
  useScopeChangeRequests,
  type Database,
} from "@patina/supabase";

import { ScoredAction } from "@/components/making/scored-action";
import {
  countInWords,
  joinClauses,
  moneyInWords,
} from "@/components/making/standing-sentence";
import { useAuth } from "@/hooks/use-auth";

import { SIGNATURE_NOTICE } from "./consent-copy";

/* ── SCOPE CHANGE ─────────────────────────────────────────────────────────────
   Absorbs `/projects/[id]/scope-change/new` (raise a request) and
   `/projects/[id]/scope-change/[changeId]` (decide one the studio sent, or
   withdraw one the client sent). All four read and write
   `scope_change_requests` through hooks that already exist —
   `useScopeChangeRequests` is project-scoped and client-readable, so unlike
   the two review routes this needs no query-param workaround to find its own
   rows.

   `RequestChangeAct` is the trigger: it mounts wherever "Ask for a change"
   belongs — the mat (house-wide) and each room band (room-scoped, carried
   through via the mark's own `roomId` so a studio triaging the request knows
   which room it was raised from, the one thing the old bare `/scope-change/new`
   route never captured).

   Three doorstep asks, corresponding to the old page's three directions:
   `PendingScopeChangeAsk` (decide one the studio sent), `MyScopeChangeRequestsAsk`
   (withdraw one the client sent), `ResolvedScopeChangesPrevious` (what closed,
   read from the row's own timestamps so it survives a reload rather than
   living only in a component's local state). */

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
});
const MIN_DESCRIPTION = 10;
const PENDING_STATUSES = new Set(["draft", "sent", "viewed"]);

type ScopeChangeRow =
  Database["public"]["Tables"]["scope_change_requests"]["Row"];

function isPendingStudioChange(row: ScopeChangeRow): boolean {
  return (
    row.request_origin !== "client_request" &&
    (row.status === "sent" || row.status === "viewed")
  );
}

function isMyPendingRequest(row: ScopeChangeRow, userId: string | undefined): boolean {
  return (
    row.request_origin === "client_request" &&
    !!userId &&
    row.requested_by === userId &&
    PENDING_STATUSES.has(row.status)
  );
}

function isResolved(row: ScopeChangeRow): boolean {
  const closed =
    !!row.approved_at ||
    !!row.declined_at ||
    !!row.applied_at ||
    row.status === "cancelled";
  // A designer amendment drafted and cancelled before it was ever sent is
  // studio-internal churn — the client was never shown it, so it does not
  // enter her record. Her OWN requests are hers whether or not they were sent.
  return (
    closed && (row.request_origin === "client_request" || !!row.sent_at)
  );
}

/** `new_rooms`/`new_ffe_items` are `Json`, written by the designer-portal
 * amendment sheet (`ScopeChangeNewRoom`/`ScopeChangeNewFFEItem` in
 * `@patina/types`) — parsed defensively rather than trusted, since Json
 * carries no compile-time shape. */
function parseNewRooms(value: ScopeChangeRow["new_rooms"]): Array<{ name: string; budgetCents: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string") return [];
    const budgetCents =
      typeof record.budgetCents === "number"
        ? record.budgetCents
        : typeof record.budget_cents === "number"
          ? record.budget_cents
          : 0;
    return [{ name: record.name, budgetCents }];
  });
}

function signedClause(cents: number, label: string): string {
  const amount = moneyInWords(Math.abs(cents));
  return cents > 0 ? `${amount} additional ${label}` : `${amount} less ${label}`;
}

function weeksClause(weeks: number): string {
  const magnitude = Math.abs(weeks);
  const word = countInWords(magnitude);
  const unit = magnitude === 1 ? "week" : "weeks";
  return weeks > 0
    ? `${word} ${unit} added to the timeline`
    : `${word} ${unit} taken off the timeline`;
}

/**
 * The impact, in words. Every clause reads its own sign — a reduction to the
 * FF&E budget or the design fee is not silence, it is a clause of its own —
 * and the new-total sentence stands independently of whether any other
 * clause fired, because a change that only restates the project's value is
 * still a financial effect the signature covers.
 */
function impactLine(row: ScopeChangeRow): string | null {
  const clauses: string[] = [];
  const ffe = row.additional_ffe_budget_cents ?? 0;
  if (ffe !== 0) clauses.push(signedClause(ffe, "FF&E budget"));
  const fee = row.additional_design_fee_cents ?? 0;
  if (fee !== 0) clauses.push(signedClause(fee, "design fee"));
  const weeks = row.timeline_impact_weeks ?? 0;
  if (weeks !== 0) clauses.push(weeksClause(weeks));

  const total = row.new_total_budget_cents ?? 0;
  const totalSentence = total !== 0 ? ` New project value: ${moneyInWords(total)}.` : "";
  const clauseSentence = clauses.length > 0 ? `${joinClauses(clauses)}.` : "";

  if (!clauseSentence && !totalSentence) return null;
  return `${clauseSentence}${totalSentence}`;
}

// ── reload-safe idempotency (ported from scope-change/new/page.tsx) ─────────

type SubmissionIntent = {
  version: 1;
  scope: string;
  fingerprint: string;
  idempotencyKey: string;
};

const intentStorageKey = (projectId: string, scope: string) =>
  `patina:scope-change-intent:${projectId}:${scope}`;

function readSubmissionIntent(
  projectId: string,
  scope: string,
  fingerprint: string,
): SubmissionIntent | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(intentStorageKey(projectId, scope));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SubmissionIntent>;
    if (
      value.version !== 1 ||
      value.scope !== scope ||
      value.fingerprint !== fingerprint ||
      typeof value.idempotencyKey !== "string" ||
      value.idempotencyKey.length === 0
    ) {
      return null;
    }
    return value as SubmissionIntent;
  } catch {
    return null;
  }
}

function persistSubmissionIntent(projectId: string, intent: SubmissionIntent): void {
  try {
    globalThis.sessionStorage?.setItem(
      intentStorageKey(projectId, intent.scope),
      JSON.stringify(intent),
    );
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The
    // in-memory ref still protects retries for the lifetime of this mount.
  }
}

function clearSubmissionIntent(projectId: string, intent: SubmissionIntent): void {
  try {
    const persisted = readSubmissionIntent(projectId, intent.scope, intent.fingerprint);
    if (persisted?.idempotencyKey === intent.idempotencyKey) {
      globalThis.sessionStorage?.removeItem(intentStorageKey(projectId, intent.scope));
    }
  } catch {
    // The server receipt already proved the commit; stale session data is
    // safe and will be replaced when the client authors a different fingerprint.
  }
}

export interface RequestChangeActProps {
  projectId: string;
  /** Present when raised from a room band; absent from the mat's house-wide ask. */
  roomId?: string;
  roomName?: string;
  /** A completed/archived project refuses the RPC; hide the invitation to
   * write a request that can only be rejected — the old route showed
   * "This project's scope is closed" instead of the form. */
  projectStatus?: string;
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
  projectStatus,
}: RequestChangeActProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const create = useCreateClientScopeChangeRequest();
  // React Query's isPending reaches the next render; the ref closes the
  // same-tick double-click window before that render occurs (door-gate.tsx's
  // own `inFlight` pattern).
  const inFlight = useRef(false);
  const submissionIntentRef = useRef<SubmissionIntent | null>(null);

  const region = roomId ? "room-band" : "mat";
  const scope = roomId ? `room-${roomId}` : "mat";
  const fieldId = (name: string) => `scope-change-${scope}-${name}`;

  if (projectStatus === "completed" || projectStatus === "archived") return null;

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
    if (inFlight.current) return;
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
    inFlight.current = true;

    // A change raised from a room band names the room in the body the studio
    // reads — the mutation payload itself carries only a title and a
    // description, so the room has nowhere else to travel.
    const fullDescription = roomName
      ? `${trimmedDescription}\n\nRaised from: ${roomName}.`
      : trimmedDescription;
    const fingerprint = JSON.stringify([trimmedTitle, fullDescription]);
    let submissionIntent = submissionIntentRef.current;
    if (submissionIntent?.fingerprint !== fingerprint) {
      submissionIntent =
        readSubmissionIntent(projectId, scope, fingerprint) ?? {
          version: 1,
          scope,
          fingerprint,
          idempotencyKey: globalThis.crypto.randomUUID(),
        };
      persistSubmissionIntent(projectId, submissionIntent);
      submissionIntentRef.current = submissionIntent;
    }

    create.mutate(
      {
        projectId,
        idempotencyKey: submissionIntent.idempotencyKey,
        title: trimmedTitle,
        description: fullDescription,
      },
      {
        onSuccess: () => {
          clearSubmissionIntent(projectId, submissionIntent!);
          submissionIntentRef.current = null;
          inFlight.current = false;
          setSentAt(new Date());
          // useCreateClientScopeChangeRequest's own onSuccess already
          // invalidates ['scope-changes', projectId].
        },
        onError: (err) => {
          inFlight.current = false;
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

function NewRooms({ rooms }: { rooms: Array<{ name: string; budgetCents: number }> }) {
  if (rooms.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        New rooms
      </p>
      <ul className="mt-1.5 list-none">
        {rooms.map((room, index) => (
          <li
            key={`${room.name}-${index}`}
            data-testid="scope-change-new-room"
            className="text-[15px] leading-relaxed text-[var(--text-body)]"
          >
            {`${room.name} · ${moneyInWords(room.budgetCents)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One studio-sent change, standing on the doorstep the way `DoorstepApproval`
 * does: it carries no single room (the old page never scoped a studio-sent
 * change to one either — `new_rooms` can add several at once) so it stands
 * beside the ledger, not inside a band. A separate card per row, not a single
 * `find` — a studio that sends a second amendment before the first is
 * decided must not make the second invisible.
 */
function ScopeChangeDecideCard({
  request,
  projectId,
}: {
  request: ScopeChangeRow;
  projectId: string;
}) {
  const approve = useApproveScopeChange();
  const decline = useDeclineScopeChange();
  // Approve binds a signature and a budget change; `ScoredAction`'s own
  // `unavailable` only lands on the next render, so a ref closes the
  // same-tick double-click window on both acts.
  const actInFlight = useRef(false);
  const [signName, setSignName] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{
    kind: "approved" | "declined";
    at: Date;
  } | null>(null);

  const impact = impactLine(request);
  const newRooms = parseNewRooms(request.new_rooms);

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

  function handleApprove() {
    if (actInFlight.current) return;
    setError(null);
    if (!signName.trim()) {
      setError("Type your full name to approve.");
      return;
    }
    actInFlight.current = true;
    approve.mutate(
      { requestId: request.id, projectId, approvedByName: signName.trim() },
      {
        onSuccess: () => setResolved({ kind: "approved", at: new Date() }),
        onError: (err) => {
          setError(
            err instanceof Error
              ? err.message
              : "Could not send just now. Try again.",
          );
        },
        onSettled: () => {
          actInFlight.current = false;
        },
      },
    );
  }

  function handleDecline() {
    if (actInFlight.current) return;
    setError(null);
    actInFlight.current = true;
    decline.mutate(
      {
        requestId: request.id,
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
        onSettled: () => {
          actInFlight.current = false;
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
      <NewRooms rooms={newRooms} />

      {!showDecline ? (
        <div className="mt-4">
          <label
            htmlFor={`scope-change-sign-${request.id}`}
            className="block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
          >
            Type your full name
          </label>
          <p className="mt-1 max-w-[52ch] text-[12px] leading-snug text-[var(--text-muted)]">
            {SIGNATURE_NOTICE}
          </p>
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
              variant="tertiary"
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

/** Every studio-sent change still awaiting a decision — not just the first. */
export function PendingScopeChangeAsk({ projectId }: { projectId: string }) {
  const scopeQuery = useScopeChangeRequests(projectId);
  const rows = (scopeQuery.data ?? []) as ScopeChangeRow[];
  const pending = rows.filter(isPendingStudioChange);

  return (
    <>
      {pending.map((request) => (
        <ScopeChangeDecideCard
          key={request.id}
          request={request}
          projectId={projectId}
        />
      ))}
    </>
  );
}

/**
 * The client's own pending requests — theirs to withdraw, not something
 * anyone owes a response through. Migration 00395 exists solely to let a
 * client cancel their own scope-change request; without this ask no surface
 * reaches that RPC.
 */
export function MyScopeChangeRequestsAsk({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const scopeQuery = useScopeChangeRequests(projectId);
  const cancel = useCancelClientScopeChangeRequest();
  // `ScoredAction`'s own `unavailable` only takes effect on the NEXT render,
  // so two clicks in one tick both read it false. A ref closes that window.
  const withdrawInFlight = useRef(false);
  const [withdrawnId, setWithdrawnId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = (scopeQuery.data ?? []) as ScopeChangeRow[];
  const mine = rows.filter((row) => isMyPendingRequest(row, user?.id));

  if (mine.length === 0) return null;

  function handleWithdraw(requestId: string) {
    if (withdrawInFlight.current) return;
    setError(null);
    withdrawInFlight.current = true;
    cancel.mutate(
      { requestId, projectId },
      {
        onSuccess: () => setWithdrawnId(requestId),
        onError: (err) => {
          setError(
            err instanceof Error
              ? err.message
              : "Could not withdraw just now. Try again.",
          );
        },
        onSettled: () => {
          withdrawInFlight.current = false;
        },
      },
    );
  }

  return (
    <>
      {mine.map((request) =>
        withdrawnId === request.id ? (
          <section
            key={request.id}
            data-threshold-unit="scope-change-ask"
            data-testid="my-scope-change-withdrawn"
            className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
          >
            <p className="pt-2.5 text-[15px] leading-relaxed text-[var(--text-body)]">
              Withdrawn.
            </p>
          </section>
        ) : (
          <section
            key={request.id}
            id={`scope-change-${request.id}`}
            data-threshold-unit="scope-change-ask"
            data-never-dim=""
            data-testid="my-scope-change-request"
            aria-labelledby={`my-scope-change-title-${request.id}`}
            className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
          >
            <p className="pt-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Awaiting your studio&apos;s review
            </p>
            <h2
              id={`my-scope-change-title-${request.id}`}
              className="font-heading mt-1.5 text-[1.35rem] font-medium tracking-[-0.012em]"
            >
              {request.title}
            </h2>
            <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]">
              {request.description}
            </p>
            <div className="mt-4">
              <ScoredAction
                actionKey="scope_change_withdraw"
                regionKey="doorstep"
                surfaceKey="the_threshold"
                variant="tertiary"
                loading={cancel.isPending && cancel.variables?.requestId === request.id}
                loadingLabel="Withdrawing"
                onClick={() => handleWithdraw(request.id)}
                data-testid={`scope-change-withdraw-${request.id}`}
              >
                Withdraw this request
              </ScoredAction>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-2 text-[15px] leading-normal text-[var(--color-error)]"
              >
                {error}
              </p>
            )}
          </section>
        ),
      )}
    </>
  );
}

function resolvedStampOf(row: ScopeChangeRow): { label: string; date: Date | null } {
  if (row.status === "cancelled") return { label: "Withdrawn", date: null };
  if (row.applied_at) return { label: "Applied", date: new Date(row.applied_at) };
  if (row.declined_at) return { label: "Declined", date: new Date(row.declined_at) };
  if (row.approved_at) return { label: "Approved", date: new Date(row.approved_at) };
  return { label: "Closed", date: null };
}

/**
 * What closed, read the way `SubmittedReviewsPrevious` reads a closed thing:
 * one dated line per row, from the row's own `approved_at`/`declined_at`/
 * `applied_at`/`cancelled` rather than a component's local state — so an
 * approval or decline the client gave a moment ago is still here after a
 * reload, not silently gone the instant the row drops out of "pending".
 */
export function ResolvedScopeChangesPrevious({ projectId }: { projectId: string }) {
  const scopeQuery = useScopeChangeRequests(projectId);
  const rows = ((scopeQuery.data ?? []) as ScopeChangeRow[]).filter(isResolved);

  if (rows.length === 0) return null;

  return (
    <ul data-testid="resolved-scope-changes-previously" className="list-none">
      {rows.map((row) => {
        const { label, date } = resolvedStampOf(row);
        return (
          <li
            key={row.id}
            data-testid="resolved-scope-change-line"
            className="border-t border-[var(--border-default)]"
          >
            <p className="flex min-h-[44px] w-full items-baseline gap-3 py-3">
              <span className="min-w-[6.6em] shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {date ? DAY_MONTH.format(date) : "—"}
              </span>
              <span className="font-heading text-[1.05rem]">{row.title}</span>
              <span
                aria-hidden="true"
                className="relative top-[-0.28em] mx-2 min-w-[10px] flex-auto border-b border-dotted border-[var(--border-default)]"
              />
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mocha)]">
                {label}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
