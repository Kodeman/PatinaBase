"use client";

/**
 * CLOSE THIS SEAT — the one act, wherever a seat can be ended (direction §1
 * line 8, §3.2 R4, SPEC §5.4 #14).
 *
 * "Closing a seat becomes a dated act with a reason, Remove stops being a hard
 *  delete."
 *
 * The Call Sheet row grew this act in W2; the person card's Seats region is the
 * other place direction names it, and it had none. This component is that act
 * for the PERSON CARD — `person-profile.tsx` is its only importer.
 *
 * IT IS NOT YET SHARED (r15 MAJOR-2). The Call Sheet keeps its own copy in
 * `roster-row.tsx`'s `closing` block: the same confirm sentence, its own reason
 * field, its own `closeSeat.mutateAsync` and its own `peopleEvents.seatClosed`.
 * That surface carries the surviving hard delete ("Added by mistake", held
 * behind `seatDeleteRefusal`) inside the same act row and routes its refusal
 * into the sheet's `role="status"` announcer, so the two copies are hand-kept
 * in step rather than one component. An earlier draft of the room report
 * claimed the invariant; the code never had it. Repointing the Call Sheet here
 * is the tidier end and is owed (w3-room-report §10 item 9) — until then, any
 * change to the wording, the dated write or the analytics belongs in BOTH
 * files.
 *
 * THE WORD "REMOVE" APPEARS NOWHERE. The surviving hard delete — a seat added
 * by mistake that carries nothing — stays on the Call Sheet row alone, behind
 * `seatDeleteRefusal`, because that is the surface where a mistaken add happens
 * minutes after it is made.
 */

import { useMemo, useState } from "react";
import {
  SEAT_CLOSE_MONEY_HELD_REASON,
  seatCloseIsHeldForMoney,
  useCloseProjectPartySeat,
  useOrganizations,
  usePartyAuthority,
} from "@patina/supabase";
import { peopleEvents } from "@/lib/analytics/people-events";
import { writeErrorMessage } from "@/lib/document/write-error";
import { DocumentAction, DocumentActionRow } from "../document-action";

const LABEL =
  "font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-subtle)]";

/** The two-step confirm's own sentence — what closing costs, and what it does not. */
export function closeSeatConfirmSentence(name: string): string {
  return (
    `– Close ${name}’s seat? The seat stays on the job with the day it closed, ` +
    "and everything it carries stays with it."
  );
}

export function CloseSeatAct({
  seatId,
  projectId,
  organizationId,
  name,
  stage,
  onClosed,
  className,
}: {
  seatId: string;
  projectId: string | null;
  /**
   * The studio whose book this seat's card sits in — PR-n's standing is read
   * against it (r21 MAJOR-1 / major-2, R-BS). Absent, the act is never held
   * for money: a card with no resolved studio can state no standing, and
   * stating one it cannot read would be a guess on a face.
   */
  organizationId?: string | null;
  name: string;
  /** The stage the seat was in, for the act's own record. */
  stage?: string | null;
  onClosed?: (message: string) => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const closeSeat = useCloseProjectPartySeat();
  /**
   * r21 MAJOR-1 / major-2 — THE PR-n STANDING, READ BEFORE THE PRESS.
   *
   * 00634 refuses the close of a seat carrying an open money or draw-certify
   * grant to anyone who is not an owner or an admin of the recorded studio,
   * and this act offered it live and unqualified, then printed the bare token
   * `seat_close_money_authority_forbidden` in its alert. The grants are keyed
   * on the seat, so `SeatFacts` one element up has already read them and this
   * costs no second query.
   */
  const { data: authority } = usePartyAuthority(seatId);
  const { data: orgs } = useOrganizations();
  const isPrincipal = useMemo(() => {
    if (!organizationId) return false;
    const role = (orgs ?? []).find((o) => o.id === organizationId)?.membership
      ?.role;
    return role === "owner" || role === "admin";
  }, [orgs, organizationId]);
  const heldForMoney = seatCloseIsHeldForMoney(authority, isPrincipal);
  const fieldId = `close-seat-${seatId}`;
  const heldId = `close-seat-held-${seatId}`;

  if (!confirming) {
    return (
      <div className={className}>
        <DocumentActionRow
          surfaceKey="people-room"
          regionKey="person-card-seat"
          aria-label={`Close ${name}'s seat`}
        >
          <DocumentAction
            actionKey="close-seat"
            variant="tertiary"
            disabled={heldForMoney}
            held={heldForMoney}
            aria-describedby={heldForMoney ? heldId : undefined}
            onClick={() => setConfirming(true)}
          >
            Close this seat
          </DocumentAction>
        </DocumentActionRow>
        {/* A held act carries a VISIBLE reason (direction §5.5, SPEC §7 #4) —
            the shape household-band.tsx already ships for the same PR-n rule. */}
        {heldForMoney && (
          <p
            id={heldId}
            className="mt-1 text-[0.7rem] text-[var(--ink-subtle)]"
          >
            {SEAT_CLOSE_MONEY_HELD_REASON}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-close-seat-confirm={seatId}
      className={`border-l-2 border-[var(--terracotta-ink)] bg-[var(--rail)] px-3 py-2.5 ${className ?? ""}`}
    >
      <p className="t-body-sm text-[var(--ink)]">
        {closeSeatConfirmSentence(name)}
      </p>
      <label className={`mt-2 block ${LABEL}`} htmlFor={fieldId}>
        Why it closed
      </label>
      <input
        id={fieldId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-11 w-full border-0 border-b border-[var(--hairline-strong)] bg-transparent py-2 text-[0.8rem] text-[var(--ink)] outline-none focus:border-[var(--color-clay)]"
      />
      <DocumentActionRow
        surfaceKey="people-room"
        regionKey="person-card-seat-confirm"
        className="mt-2"
        aria-label={`Close ${name}'s seat`}
      >
        <DocumentAction
          actionKey="confirm-close-seat"
          variant="danger"
          onClick={() =>
            void closeSeat
              .mutateAsync({ id: seatId, projectId: projectId ?? "", reason })
              .then(() => {
                peopleEvents.seatClosed({
                  from_stage: stage ?? null,
                  with_reason: !!reason.trim(),
                });
                setConfirming(false);
                onClosed?.(`${name}’s seat is closed.`);
              })
              .catch((e: unknown) =>
                // r21 major-2 — never the bare token. A PostgREST rejection
                // extends Error, so `e.message` printed
                // `seat_close_money_authority_forbidden` on this alert.
                setError(writeErrorMessage(e, "Could not close the seat.")),
              )
          }
          loading={closeSeat.isPending}
          loadingLabel="Closing…"
        >
          Close the seat
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-close-seat"
          variant="tertiary"
          onClick={() => setConfirming(false)}
        >
          Keep it open
        </DocumentAction>
      </DocumentActionRow>
      {error && (
        <p
          role="alert"
          className="mt-1.5 text-[0.72rem] text-[var(--terracotta-ink)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
