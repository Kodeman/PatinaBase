'use client';

/**
 * Quiet active-section bodies for stages that carry little data yet.
 * Deliberately minimal and honest (DECISIONS.md I10 — flagged for design
 * review).
 *
 * Discovery graduated out of "quiet" in Track 6 Slice 5 (R66) — it is now the
 * self-composing structured-capture body in components/document/discovery/.
 *
 * Care grew its settled read in Track 7 (R80): once the book is closed
 * (close_project, 00238) the section states the close date and the portfolio
 * snapshot the designer wrote at closing — a memory, not a form. When the
 * page passes projectId, the real completed_at and snapshot render; the
 * completedLabel prop stays as the dateless fallback.
 */

import { useProjectV2 } from '@patina/supabase';
import { fmtDay } from '@/lib/document/format';


type AnyRecord = any;

export function CareSection({
  completedLabel,
  projectId = null,
}: {
  completedLabel: string | null;
  /** R80: set when the page knows the project — unlocks the settled read
   *  (completed_at + the portfolio snapshot written at close). */
  projectId?: string | null;
}) {
  const { data: project } = useProjectV2(projectId ?? '') as { data: AnyRecord };

  const snapshot = (project?.portfolio_snapshot ?? null) as {
    headline?: string;
    description?: string;
    value_cents?: number | null;
    duration?: string;
    rooms?: string;
  } | null;

  const closedLine = project?.completed_at
    ? `The book closed ${fmtDay(project.completed_at)}.`
    : completedLabel
      ? `Project completed · ${completedLabel}.`
      : 'Project completed.';

  const snapshotFacts = snapshot
    ? [
        snapshot.value_cents != null
          ? `$${Math.round(snapshot.value_cents / 100).toLocaleString('en-US')}`
          : null,
        snapshot.duration || null,
        snapshot.rooms || null,
      ].filter(Boolean)
    : [];

  return (
    <section>
      <div className="mb-1.5 mt-5 flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">Care</h2>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          Ongoing
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--text-body)]">{closedLine}</p>

      {/* The snapshot the designer wrote at close — the project as it will be
          remembered (R80). Quiet: type only, no card furniture. */}
      {snapshot && (snapshot.headline || snapshotFacts.length > 0 || snapshot.description) && (
        <div className="mt-3 border-t border-dashed border-[var(--color-pearl)] pt-3">
          {snapshot.headline && (
            <p className="font-heading text-[14px] italic text-[var(--color-charcoal)]">
              {snapshot.headline}
            </p>
          )}
          {snapshot.description && (
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-body)]">
              {snapshot.description}
            </p>
          )}
          {snapshotFacts.length > 0 && (
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {snapshotFacts.join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
