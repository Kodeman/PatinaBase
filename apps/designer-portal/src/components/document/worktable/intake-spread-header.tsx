'use client';

/**
 * The Intake spread header (Start to Signature W4c, flag `worktable`).
 *
 * Table I's "household chip promoted into the spread": who this document is
 * for and how they arrived, printed at reading size above the brief/discovery
 * spread. The letterhead's chip stays where it is — this is the promotion,
 * not a move. Q6 in force: printed identity only, never a control surface —
 * no capture drop, no board tile, no links, no acts.
 *
 * Identity comes from what the intake spread already owns: the lead row the
 * Brief reads (`useLead`, React-Query-deduped against BriefSection's own
 * read) with the row's `client_name` as the fallback the letterhead itself
 * prints. On a discovery doc the lead (reached via Shape D's `dc.lead_id`,
 * 00327) is not otherwise read by this page — that one extra read is this
 * component's only query, and it is enabled ONLY while the Intake table is
 * composed, so the flag off changes nothing on the wire either.
 */

import { useLead } from '@patina/supabase';
import type { TableKey } from '@/lib/document/table-derivation';

interface LeadIdentity {
  contact_name?: string | null;
  homeowner_id?: string | null;
  homeowner?: { full_name?: string | null } | null;
  source?: string | null;
  project_description?: string | null;
}

export function IntakeSpreadHeader({
  table,
  leadId,
  clientName,
}: {
  /** The composed table — null when the flag is off. Anything but intake prints nothing. */
  table: TableKey | null;
  leadId: string | null;
  clientName: string | null;
}) {
  const onIntake = table === 'intake';
  // `useLead` disables itself on '' — the read exists only on the Intake table.
  const { data: lead, isLoading } = useLead(onIntake ? (leadId ?? '') : '') as {
    data: LeadIdentity | undefined;
    isLoading: boolean;
  };

  if (!onIntake) return null;
  // Print once, whole: a header that grows its arrival line and description
  // after first paint is the same lie as a figure that softens.
  if (leadId && isLoading) return null;

  const name = lead?.homeowner?.full_name ?? lead?.contact_name ?? clientName;
  if (!name) return null;

  // The captured "Where from" (R65) when present; otherwise derived honestly
  // from what the lead row carries — the Brief's own derivation, verbatim.
  // No lead row, no arrival claim.
  const arrival = lead
    ? (lead.source ?? (lead.homeowner_id ? 'Inbound via Patina' : 'Captured by you'))
    : null;
  const description = lead?.project_description ?? null;

  return (
    <div data-intake-spread-header className="mt-5">
      {arrival && (
        <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {arrival}
        </p>
      )}
      <p className="font-heading text-[18px] font-medium leading-snug text-[var(--color-charcoal)]">
        {name}
      </p>
      {description && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      )}
    </div>
  );
}
