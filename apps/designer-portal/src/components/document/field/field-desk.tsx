"use client";

/**
 * In the field (Field Coordination Wave 5) — the Desk's cross-project field
 * rollup. Three populations, all actionable, never KPI tiles (Desk philosophy):
 *
 *   · triage cards — every needs_review inbound text, each with its proposed
 *     effect and Apply / Dismiss (the act lives on the card).
 *   · need-lines — the softer field nudges over field_activity_summary: parties
 *     who haven't opted in, field tasks gone overdue. Each links into the
 *     project document where the act lives.
 *   · reported hours (Phase 3, behind `field-line-time-reports`) — hours a
 *     trade party answered by text, each one a proposal to accept, reject, or
 *     book to a teammate. Its own population, its own eyebrow; absent entirely
 *     while the flag is off or nothing has been reported.
 *
 * Its own populations over the SMS/field read models — the engagement folders
 * are never touched. Renders nothing when there's no field work, so a Desk with
 * no field crew stays clean. Zero shadows (D4).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useFieldActivity,
  useUser,
  useSmsReviewQueue,
  useFieldTimeReportQueue,
  type FieldActivityRow,
  type SmsReviewMessage,
} from "@patina/supabase";
import { SectionEyebrow } from "@/components/document/section-eyebrow";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { SmsReviewCard } from "./sms-review-card";
import { TimeReportCard } from "./time-report-card";

export interface FieldNeedLine {
  key: string;
  projectId: string;
  projectName: string;
  text: string;
}

export function deriveFieldNeedLines(
  activity: readonly FieldActivityRow[] | undefined,
): FieldNeedLine[] {
  // Need-lines from the per-project rollup. The unreviewed-SMS count is already
  // carried by the triage cards, so the lines cover the softer nudges only.
  const lines: FieldNeedLine[] = [];
  for (const a of activity ?? []) {
    const name = a.project_name ?? "a project";
    if (a.awaiting_reply_count > 0) {
      lines.push({
        key: `optin:${a.project_id}`,
        projectId: a.project_id,
        projectName: name,
        text:
          a.awaiting_reply_count === 1
            ? "1 party hasn’t opted in"
            : `${a.awaiting_reply_count} parties haven’t opted in`,
      });
    }
    if (a.overdue_field_task_count > 0) {
      lines.push({
        key: `overdue:${a.project_id}`,
        projectId: a.project_id,
        projectName: name,
        text:
          a.overdue_field_task_count === 1
            ? "1 field task overdue"
            : `${a.overdue_field_task_count} field tasks overdue`,
      });
    }
  }
  return lines;
}

export interface FieldDeskPopulation {
  cards: SmsReviewMessage[];
  lines: FieldNeedLine[];
  isLoading: boolean;
  isError: boolean;
}

export function useFieldDeskPopulation(): FieldDeskPopulation {
  const reviewsQuery = useSmsReviewQueue();
  const activityQuery = useFieldActivity();
  const lines = useMemo(
    () => deriveFieldNeedLines(activityQuery.data),
    [activityQuery.data],
  );

  return {
    cards: reviewsQuery.data ?? [],
    lines,
    isLoading: reviewsQuery.isLoading || activityQuery.isLoading,
    isError: reviewsQuery.isError || activityQuery.isError,
  };
}

/**
 * Reported hours (Phase 3) — its own population beside the triage cards. The
 * flag is asked FIRST and on its own, so with `field-line-time-reports` off the
 * queue is never even read: the Desk is exactly the Desk it was. The queue hook
 * lives in the inner component for that reason, not for tidiness.
 */
function FieldTimeReports({ withinPulse }: { withinPulse: boolean }) {
  const { value: timeReportsOn } = useFeatureFlag("field-line-time-reports");
  if (!timeReportsOn) return null;
  return <ReportedHoursSection withinPulse={withinPulse} />;
}

function ReportedHoursSection({ withinPulse }: { withinPulse: boolean }) {
  const reportsQuery = useFieldTimeReportQueue();
  const reports = reportsQuery.data ?? [];
  // Nothing reported is not a state worth a heading: stay out of the way.
  if (reports.length === 0) return null;

  return (
    <section
      aria-labelledby="hours-reported-by-text"
      className={withinPulse ? "mt-10" : "mt-14"}
    >
      <SectionEyebrow count={reports.length}>
        <span id="hours-reported-by-text">Hours reported by text</span>
      </SectionEyebrow>
      <div className="grid grid-cols-1 gap-x-10 gap-y-[46px] xl:grid-cols-2">
        {reports.map((report) => (
          <TimeReportCard key={report.id} report={report} />
        ))}
      </div>
    </section>
  );
}

export function FieldDesk({
  population,
  withinPulse = false,
}: {
  population: FieldDeskPopulation;
  withinPulse?: boolean;
}) {
  const { cards, lines } = population;
  const { user } = useUser();
  const [filter, setFilter] = useState<"Mine" | "Unowned" | "All">("All");
  const visibleCards = cards.filter(
    (message) =>
      filter === "All" ||
      (filter === "Mine"
        ? !!user && message.owner_user_id === user.id
        : !message.owner_user_id),
  );
  const needsLead = cards.some(
    (message) =>
      !message.owner_user_id &&
      message.project_lead_id === user?.id &&
      Date.now() - Date.parse(message.created_at) > 30 * 60_000,
  );

  // R94 — quiet state teaches instead of vanishing. When there is no field work
  // the section stays, in the pencil idiom, naming what will land here so the
  // "In the field" surface reads as a place with a purpose rather than an empty
  // gap. Desk-only by construction (FieldDesk is composed nowhere else), so this
  // never becomes chrome on another route. No "set up" doorway: field parties are
  // invited per-project inside a document's coordination (there is no global
  // field-parties surface, and no palette-visible act, to point at).
  if (cards.length === 0 && lines.length === 0) {
    if (population.isError)
      return (
        <>
          <p role="alert">Couldn’t load the field texts. Try again.</p>
          <FieldTimeReports withinPulse={withinPulse} />
        </>
      );
    if (population.isLoading)
      return (
        <>
          <p role="status">Loading field texts…</p>
          <FieldTimeReports withinPulse={withinPulse} />
        </>
      );
    return (
      <>
        <section
          aria-labelledby="in-the-field"
          className={withinPulse ? "" : "mt-14"}
        >
          <SectionEyebrow>
            <span id="in-the-field">In the field</span>
          </SectionEyebrow>
          <p className="max-w-[52ch]">
            <span className="font-heading text-[15px] italic leading-[1.55] text-[var(--text-body)]">
              <span
                aria-hidden
                className="mr-1 not-italic text-[var(--text-muted)]"
              >
                –
              </span>
              Nothing needs coordinating. When your builders and makers text
              photos or questions, they land here as cards you can act on.
            </span>
          </p>
        </section>
        <FieldTimeReports withinPulse={withinPulse} />
      </>
    );
  }

  return (
    <>
      <section
        aria-labelledby="in-the-field"
        className={withinPulse ? "" : "mt-14"}
      >
        <SectionEyebrow count={cards.length + lines.length}>
          <span id="in-the-field">In the field</span>
        </SectionEyebrow>

        {population.isError && (
          <p role="alert">
            Couldn’t refresh the field texts. These may have changed.
          </p>
        )}
        <div
          role="group"
          aria-label="Field text filter"
          className="mb-4 flex gap-4"
        >
          {(["Mine", "Unowned", "All"] as const).map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={filter === label}
              onClick={() => setFilter(label)}
            >
              {label}
            </button>
          ))}
        </div>
        {needsLead && (
          <p className="mb-4 text-[12px] text-[var(--text-muted)]">
            A field text has been waiting for someone for over 30 minutes. Could
            you take a look?
          </p>
        )}
        {visibleCards.length === 0 && <p>No field texts in this view.</p>}
        {visibleCards.length > 0 && (
          <div className="grid grid-cols-1 gap-x-10 gap-y-[46px] xl:grid-cols-2">
            {visibleCards.map((m) => (
              <SmsReviewCard key={m.id} message={m} />
            ))}
          </div>
        )}

        {lines.length > 0 && (
          <ul className={`space-y-2 ${cards.length > 0 ? "mt-10" : ""}`}>
            {lines.map((l) => (
              <li key={l.key}>
                <Link
                  href={`/doc/${l.projectId}`}
                  className="doc-type-body group flex min-h-11 items-center gap-2 transition-colors hover:text-[var(--text-primary)] motion-reduce:transition-none"
                >
                  <span>{l.text}</span>
                  <span aria-hidden className="text-[var(--text-subtle)]">
                    —
                  </span>
                  <span className="font-heading italic text-[var(--text-primary)]">
                    {l.projectName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <FieldTimeReports withinPulse={withinPulse} />
    </>
  );
}
