"use client";

/**
 * Reported-hours card (Field Line Phase 3) — one proposed field_time_reports
 * row as a Desk stack card. A trade party answered the evening text with a
 * number; that number is a CLAIM, never an hour on anybody's ledger. The card
 * states it in plain words ("Sal reported 6.5 hours at Rough-in plumbing on
 * Thu 18 September") and offers the three honest answers:
 *
 *   · Accept — the report stands as reported. It stays in this ledger; no hour
 *     is written against anyone's name, because a contractor without a profile
 *     can never be a time-entry user (00177 user_id NOT NULL → profiles).
 *   · Not right — rejected, with the claim kept for the record.
 *   · Book to a teammate — the designer names a profile-backed person on this
 *     job, and only then does the hour land on that person's time. Explicit by
 *     construction: nothing derives a teammate from the party. Offered to a
 *     principal of this report's studio, because writing somebody else's hour
 *     is an owner/admin act (00601); everyone else is offered "Book to me",
 *     which is the hour she may always write.
 *
 * Every decision carries the version the designer was looking at, so two
 * people acting on the same card is a refusal she can see, not a silent
 * overwrite. Paper face + status tab, matching the Desk FolderCard idiom; zero
 * shadows (D4).
 */

import { useState } from "react";
import {
  useDecideFieldTimeReport,
  useOrganizations,
  useProjectTeamMembers,
  useUser,
  type FieldTimeReportRow,
} from "@patina/supabase";
import { fmtFieldDate } from "@/lib/document/field-sms";
import { DocumentAction, DocumentActionGroup } from "../document-action";

/** "6.5 hours" / "1 hour" — numeric(4,2) may arrive as a string. */
function hoursWords(hours: number | string): string {
  const value = Number(hours);
  if (!Number.isFinite(value)) return `${hours} hours`;
  const trimmed = Number(value.toFixed(2));
  return `${trimmed} ${trimmed === 1 ? "hour" : "hours"}`;
}

/** The people on this job who can hold an hour: profile-backed members, minus
 *  the client (a homeowner's own hours are never the studio's to book — the
 *  same reason 'client' is not a rate-card role, 00084:164-165). */
function TeammatePicker({
  projectId,
  pending,
  onPick,
}: {
  projectId: string;
  pending: boolean;
  onPick: (userId: string) => void;
}) {
  const members = useProjectTeamMembers(projectId);
  const teammates = (members.data ?? [])
    .filter((member) => member.role !== "client")
    .map((member) => ({
      key: member.id,
      id: member.user?.id ?? null,
      name: member.user?.full_name?.trim() || "A teammate",
    }))
    .filter((member): member is { key: string; id: string; name: string } =>
      Boolean(member.id),
    );

  if (members.isLoading) {
    return (
      <p role="status" className="mt-3 text-[12px] text-[var(--text-muted)]">
        Finding the people on this job…
      </p>
    );
  }
  if (members.isError) {
    return (
      <p role="alert" className="mt-3 text-[12px] text-[var(--text-muted)]">
        Couldn’t load the people on this job. Try again.
      </p>
    );
  }
  if (teammates.length === 0) {
    return (
      <p className="mt-3 text-[12px] text-[var(--text-muted)]">
        Nobody on this job can hold these hours yet.
      </p>
    );
  }

  return (
    <DocumentActionGroup
      surfaceKey="desk"
      regionKey="field-time-report-teammate"
      aria-label="Whose hours are these?"
      className="mt-3"
    >
      {teammates.map((teammate) => (
        <DocumentAction
          key={teammate.key}
          actionKey="book-reported-hours"
          variant="secondary"
          onClick={() => onPick(teammate.id)}
          disabled={pending}
        >
          {teammate.name}
        </DocumentAction>
      ))}
    </DocumentActionGroup>
  );
}

export function TimeReportCard({ report }: { report: FieldTimeReportRow }) {
  const decide = useDecideFieldTimeReport();
  const [picking, setPicking] = useState(false);

  /**
   * Whose hour may she write? Somebody else's is the act of an owner or admin
   * of the studio that owns the work — 00601's classifier refuses anyone else
   * with a bare SQLSTATE, and the whole decision rolls back. So the card offers
   * the door the database will open: the teammate picker to a principal of THIS
   * report's studio, and "Book to me" to everyone else, who may always book her
   * own hour. Same org-scoped membership fold the Room and the roster use
   * (household-band.tsx isPrincipal, :327), on the studio the report names; no
   * second read, because useOrganizations is one query the Desk already holds.
   */
  const { data: myOrgs, isError: myOrgsFailed } = useOrganizations();
  const myRole = (myOrgs ?? []).find((org) => org.id === report.organization_id)
    ?.membership?.role;
  const isPrincipal = myRole === "owner" || myRole === "admin";
  /**
   * The membership read has ANSWERED — well or badly. `data` alone never
   * arrives on a failed read, so a card that waited on it would wait forever;
   * and offering either door before the answer would offer the wrong one, which
   * on a mis-click is somebody's real hour. Accept and Not right never wait.
   */
  const standingSettled = myOrgs !== undefined || myOrgsFailed;
  const myUserId = useUser().user?.id ?? null;

  const who = report.party_name?.trim() || "Someone on the crew";
  const where =
    report.task_title?.trim() || report.project_name?.trim() || "the job";
  const when = fmtFieldDate(report.reported_at);
  const note = report.note?.trim() || null;

  const send = (
    decision: "accepted" | "rejected",
    attributeToUserId: string | null = null,
  ) =>
    decide.mutate({
      reportId: report.id,
      decision,
      expectedVersion: report.version,
      attributeToUserId,
    });

  return (
    <div className="relative mt-[26px]">
      {/* Status tab — the field accent (golden-hour), same as field triage. */}
      <div
        className="absolute -top-[26px] left-0 flex h-[26px] items-center rounded-t-[7px] px-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white"
        style={{ background: "var(--color-golden-hour)" }}
      >
        Hours reported by text
      </div>

      <div className="rounded-[0_8px_8px_8px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 outline outline-[1.5px] outline-offset-[-1.5px] outline-[rgba(232,197,71,0.5)]">
        <p className="font-heading text-[1.15rem] leading-snug text-[var(--text-primary)]">
          {who} reported {hoursWords(report.reported_hours)} at {where}
          {when ? ` on ${when}` : ""}
        </p>
        {note && (
          <p className="mt-1.5 text-[12px] italic text-[var(--text-muted)]">
            “{note}”
          </p>
        )}
        {report.task_title?.trim() && report.project_name?.trim() && (
          <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
            {report.project_name}
          </p>
        )}
        <p className="mt-3 text-[12px] text-[var(--text-muted)]">
          Nothing is on anyone’s hours until you book it.
        </p>

        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="field-time-report"
          aria-label="Reported hours"
          className="mt-3"
        >
          <DocumentAction
            actionKey="accept-reported-hours"
            variant="primary"
            onClick={() => send("accepted")}
            disabled={decide.isPending}
            loading={decide.isPending && !decide.variables?.attributeToUserId}
            loadingLabel="Saving…"
          >
            Accept
          </DocumentAction>
          <DocumentAction
            actionKey="reject-reported-hours"
            variant="tertiary"
            onClick={() => send("rejected")}
            disabled={decide.isPending}
          >
            Not right
          </DocumentAction>
          {isPrincipal && (
            <DocumentAction
              actionKey="attribute-reported-hours"
              variant="secondary"
              onClick={() => setPicking((open) => !open)}
              disabled={decide.isPending}
              aria-expanded={picking}
            >
              Book to a teammate
            </DocumentAction>
          )}
          {standingSettled && !isPrincipal && myUserId && (
            <DocumentAction
              actionKey="attribute-reported-hours-to-me"
              variant="secondary"
              onClick={() => send("accepted", myUserId)}
              disabled={decide.isPending}
            >
              Book to me
            </DocumentAction>
          )}
        </DocumentActionGroup>

        {picking && isPrincipal && (
          <TeammatePicker
            projectId={report.project_id}
            pending={decide.isPending}
            onPick={(userId) => send("accepted", userId)}
          />
        )}

        {/* One refusal, in the hook's plain words (stale, a nothing-hours
            report, somebody else's hour she may not write, or anything else).
            The report stays on screen either way: a refused decision rolled
            back, so there is still something here to decide. */}
        {decide.errorWords && (
          <p
            role="alert"
            className="mt-3 text-[11px] text-[var(--color-terracotta-ink)]"
          >
            {decide.errorWords}
          </p>
        )}
      </div>
    </div>
  );
}
