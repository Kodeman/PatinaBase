'use client';

/**
 * Brief section (active for lead-shaped engagements, R1). The lead's stats,
 * ask, and match reasons, plus — Track 6 / R61 / R65 — the captured contact, the
 * source, and the inline Accept / Nurture / Pass triage. The triage shows while
 * a lead is actionable: new / viewed AND nurtured ('contacted'), so a
 * reconnect-due lead can convert / re-date / pass instead of dead-ending. Only
 * accepted or declined leads read as a terminal record.
 */

import { useLead } from '@patina/supabase';
import { fmtDay } from '@/lib/document/format';
import { formatBudgetRange, formatTimeline } from '@/lib/document/brief-chips';
import { TriageBar } from './triage-bar';
import { BriefScanStrip } from './brief-scan-strip';
import { SectionLoadingLine } from './section-loading-line';

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
  const { data: lead, isLoading } = useLead(leadId) as {
    data: Record<string, any> | undefined;
    isLoading: boolean;
  };

  if (isLoading) {
    return <SectionLoadingLine label="Opening the brief" className="py-3" />;
  }
  if (!lead) {
    return <p className="py-3 text-[11.5px] text-[var(--text-muted)]">Brief unavailable.</p>;
  }

  // The captured contact — a joined Patina homeowner if the prospect has a
  // profile, otherwise the designer-entered contact name/email.
  const contactName: string | null =
    lead.homeowner?.full_name ?? lead.contact_name ?? null;
  const contactEmail: string | null =
    lead.homeowner?.email ?? lead.contact_email ?? null;

  // The source — the captured "Where from" (R65, `leads.source`) when present;
  // otherwise derived honestly from what the row carries (a joined homeowner
  // means an inbound Patina prospect; else the designer captured it).
  const source =
    lead.source ?? (lead.homeowner_id ? 'Inbound via Patina' : 'Captured by you');

  // R61/R65 — act while the lead is live: new/viewed, and again once nurtured
  // ('contacted') so a reconnect-due lead can convert / re-date / pass rather
  // than dead-end. The header already carries the reconnect date for context.
  // Only accepted/declined are terminal records.
  const triageable =
    lead.status === 'new' || lead.status === 'viewed' || lead.status === 'contacted';

  return (
    <section>
      <div className="mb-1.5 mt-5 flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">Brief</h2>
        {lead.response_deadline && (
          <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            {/* R65 — response_deadline doubles as the reconnect date once
                nurtured; the label follows the status. */}
            {lead.status === 'contacted'
              ? `Reconnect ${fmtDay(lead.response_deadline)}`
              : `Respond by ${fmtDay(lead.response_deadline)}`}
          </span>
        )}
      </div>

      {/* The captured contact — who reached out, and how they came in. */}
      {(contactName || contactEmail) && (
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--color-pearl)] pb-3">
          <p className="text-[13px] text-[var(--color-charcoal)]">
            {contactName && <span className="font-medium">{contactName}</span>}
            {contactName && contactEmail && (
              <span className="text-[var(--text-muted)]"> · </span>
            )}
            {contactEmail && <span className="text-[var(--text-muted)]">{contactEmail}</span>}
          </p>
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {source}
          </span>
        </div>
      )}

      <div className="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {lead.match_score != null && <Stat label="Match" value={String(lead.match_score)} />}
        {lead.budget_range && <Stat label="Budget" value={formatBudgetRange(lead.budget_range)} />}
        {lead.timeline && <Stat label="Timeline" value={formatTimeline(lead.timeline)} />}
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

      {/* Designer Handoff (Wave 1B) — the request's scan set, between the
          facts and the triage act. Renders nothing for scan-less leads. */}
      <BriefScanStrip leadId={leadId} />

      {/* R61: the triage act, in the document. Accept → Discovery, Nurture →
          People, Pass → declined. Re-derives the Desk in one act (no reload). */}
      {triageable ? (
        <TriageBar
          leadId={leadId}
          variant="brief"
          arrivalEligible={Boolean(lead.homeowner_id)}
        />
      ) : (
        <p className="mt-4 border-t border-[var(--color-pearl)] pt-3.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {lead.status === 'accepted'
            ? 'Accepted — now in Discovery'
            : lead.status === 'declined'
              ? 'Passed — kept in People'
              : pretty(String(lead.status))}
        </p>
      )}
    </section>
  );
}
