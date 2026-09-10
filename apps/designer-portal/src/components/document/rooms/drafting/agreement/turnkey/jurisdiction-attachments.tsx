"use client";

/**
 * Jurisdiction attachments — R11, and mostly a room with the lights off.
 *
 * Six notices are seeded (WI · MN · IL · CA · NY · MA) and **all of them ship
 * disabled**. A disabled notice is counsel's draft, not a studio's paper: it
 * cannot be attached, it cannot reach a client's copy, and there is no
 * control anywhere in this product that enables one. Only a super-admin can,
 * in SQL, and no admin surface ships this wave.
 *
 * So this component draws two things: whatever counsel HAS cleared, as
 * attachable leaves — and everything else as a greyed line reading "Held for
 * counsel review", so a studio in Wisconsin can see that the notice exists and
 * that Patina is not pretending otherwise.
 *
 * The greyed list is code-resident rather than read from the table on purpose:
 * the SELECT policy admits enabled rows ONLY, so a disabled row is invisible
 * to every studio read. Naming the six here is what lets the room say "held"
 * instead of saying nothing at all.
 */

import { useAgreementJurisdictionNotices } from "@patina/supabase";
import { DESIGN_BUILD_COPY } from "@patina/types";
import { Button } from "@/components/ui/controls";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]";

/** The six seeded jurisdictions and what each notice is called. Kept in step
 *  with the seed in migration 1, PART 4. */
export const SEEDED_JURISDICTIONS: { state: string; title: string }[] = [
  { state: "WI", title: "Notice of cancellation (Wisconsin)" },
  { state: "MN", title: "Notice of cancellation (Minnesota)" },
  { state: "IL", title: "Notice of cancellation (Illinois)" },
  { state: "CA", title: "Notice of cancellation (California)" },
  { state: "NY", title: "Notice of cancellation (New York)" },
  { state: "MA", title: "Notice of cancellation (Massachusetts)" },
];

export function JurisdictionAttachments({
  onAttach,
  readOnly,
}: {
  /** Lays the notice into the composition as an attachment part. Absent on a
   *  sent agreement, where the composition is frozen (R6). */
  onAttach?: (notice: { state: string; title: string; body: string }) => void;
  readOnly: boolean;
}) {
  const notices = useAgreementJurisdictionNotices();
  const enabled = notices.data ?? [];
  const enabledStates = new Set(enabled.map((notice) => notice.state));
  const held = SEEDED_JURISDICTIONS.filter(
    (seeded) => !enabledStates.has(seeded.state),
  );

  return (
    <section aria-label="Jurisdiction attachments" className="space-y-3">
      <p className={LABEL}>Jurisdiction notices</p>

      {enabled.length > 0 && (
        <ul className="divide-y divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)]">
          {enabled.map((notice) => (
            <li
              key={notice.state}
              data-notice-state={notice.state}
              className="flex items-center justify-between gap-4 py-2"
            >
              <span className="text-[12px] text-[var(--text-body)]">
                {notice.title}
                <span className="ml-2 text-[11px] text-[var(--ink-subtle)]">
                  {notice.citation}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={readOnly || !onAttach}
                onClick={() =>
                  onAttach?.({
                    state: notice.state,
                    title: notice.title,
                    body: notice.body,
                  })
                }
              >
                Attach
              </Button>
            </li>
          ))}
        </ul>
      )}

      {held.length > 0 && (
        <ul className="space-y-1">
          {held.map((notice) => (
            <li
              key={notice.state}
              data-notice-state={notice.state}
              data-notice-held="true"
              className="flex items-center justify-between gap-4 text-[12px] text-[var(--text-faint)]"
            >
              <span>{notice.title}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
                {DESIGN_BUILD_COPY.noticeHeldForCounsel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
