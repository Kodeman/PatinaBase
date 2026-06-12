'use client';

/**
 * Brief section (active for lead-shaped engagements, R1). Read-only in
 * Slice 2: the lead's stats, ask, and match reasons — no accept/pass.
 */

import { useLead } from '@patina/supabase';
import { fmtDay } from '@/lib/document/format';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[4px] border border-[var(--color-pearl)] bg-[rgba(229,226,221,0.3)] px-3 py-2.5">
      <p className="mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="text-[12px] font-medium text-[var(--color-charcoal)]">{value}</p>
    </div>
  );
}

const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function BriefSection({ leadId }: { leadId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, isLoading } = useLead(leadId) as { data: any; isLoading: boolean };

  if (isLoading) {
    return <p className="py-3 text-[11.5px] italic text-[var(--text-muted)]">Opening the brief…</p>;
  }
  if (!lead) {
    return <p className="py-3 text-[11.5px] text-[var(--text-muted)]">Brief unavailable.</p>;
  }

  return (
    <section>
      <div className="mb-1.5 mt-5 flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">Brief</h2>
        {lead.response_deadline && (
          <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            Respond by {fmtDay(lead.response_deadline)}
          </span>
        )}
      </div>

      <div className="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {lead.match_score != null && <Stat label="Match" value={String(lead.match_score)} />}
        {lead.budget_range && <Stat label="Budget" value={lead.budget_range} />}
        {lead.timeline && <Stat label="Timeline" value={pretty(lead.timeline)} />}
      </div>

      {lead.project_description && (
        <blockquote className="mb-3.5 rounded-r-[5px] border-l-[3px] border-[var(--color-clay)] bg-[rgba(196,165,123,0.05)] px-4 py-3 font-heading text-[14px] italic leading-relaxed text-[var(--color-charcoal)]">
          “{lead.project_description}”
        </blockquote>
      )}

      {(lead.match_reasons ?? []).length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {(lead.match_reasons as string[]).map((reason) => (
            <li
              key={reason}
              className="rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-1 text-[11px] text-[var(--color-charcoal)]"
            >
              {reason}
            </li>
          ))}
        </ul>
      )}

      {(lead.location_city || lead.location_state || lead.project_type) && (
        <p className="mt-3.5 border-t border-[var(--color-pearl)] pt-3 text-[11px] text-[var(--text-muted)]">
          {[
            lead.project_type ? pretty(lead.project_type) : null,
            [lead.location_city, lead.location_state].filter(Boolean).join(', ') || null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </section>
  );
}
