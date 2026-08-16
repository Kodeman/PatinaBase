'use client';

/**
 * The Intake spread header (Start to Signature W4c, flag `worktable`).
 *
 * Table I's "household chip promoted into the spread": who this document is
 * for and how they arrived, printed at reading size above the DISCOVERY
 * spread. The letterhead's chip stays where it is — this is the promotion,
 * not a move. Q6 in force: printed identity only, never a control surface —
 * no capture drop, no board tile, no links, no acts.
 *
 * **Not on the brief spread.** As first built the header stood over both of
 * Table I's spreads, and on a brief document all three of its facts — name,
 * arrival, project description — are printed again by `BriefSection`
 * immediately below, off the same `useLead` row: the captured contact line,
 * its source, and the description as a pull quote. The Brief IS the intake
 * spread's header there. Suppressing the three duplicated fields would leave
 * the component printing nothing at all, so the honest form of that fix is
 * the gate: the header stands where it is additive, which is discovery, where
 * `DiscoverySection` states none of them. The header's purpose is intact —
 * the identity is promoted on exactly the spread that was missing it.
 *
 * Identity comes from the lead row (`useLead`) with the row's `client_name`
 * as the fallback the letterhead itself prints. On a discovery doc the lead
 * (reached via Shape D's `dc.lead_id`, 00327) is not otherwise read by this
 * page — that one extra read is this component's only query, and it is
 * enabled ONLY while the discovery spread of the Intake table is composed, so
 * the flag off changes nothing on the wire either.
 */

import { useLead } from '@patina/supabase';
import type { SectionKey } from '@/lib/document/desk-derivation';
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
  section,
  leadId,
  clientName,
}: {
  /** The composed table — null when the flag is off. Anything but intake prints nothing. */
  table: TableKey | null;
  /** The spread being printed. Only 'discovery' takes the header: on 'brief'
   *  the BriefSection below prints all three of these facts already. */
  section: SectionKey | null;
  leadId: string | null;
  clientName: string | null;
}) {
  const onIntakeDiscovery = table === 'intake' && section === 'discovery';
  // `useLead` disables itself on '' — the read exists only where the header does.
  const { data: lead, isLoading } = useLead(
    onIntakeDiscovery ? (leadId ?? '') : '',
  ) as {
    data: LeadIdentity | undefined;
    isLoading: boolean;
  };

  if (!onIntakeDiscovery) return null;
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
