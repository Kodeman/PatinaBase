'use client';

/**
 * Brief recap (R66 review) — makes the original Brief reviewable once the
 * engagement has advanced. document_state only carries `lead_id` on the lead
 * shape; for a settled Brief in a proposal/project the source lead is reached
 * through the relationship (designer_clients.lead_id). We render the existing
 * BriefSection, which reads as a terminal record once the lead is accepted (its
 * triage auto-hides), so embedding it here is read-only by construction.
 */

import { useDesignerClientForClientUser } from '@patina/supabase';
import { BriefSection } from './brief-section';

export function BriefRecap({
  clientProfileId,
  leadId,
}: {
  clientProfileId: string | null;
  leadId: string | null;
}) {
  // If the row already carries a lead_id (lead shape), use it; otherwise resolve
  // the source lead from the relationship.
  const { data: dc, isLoading } = useDesignerClientForClientUser(
    leadId ? undefined : (clientProfileId ?? undefined),
  );
  const resolvedLeadId = leadId ?? dc?.lead_id ?? null;

  if (!resolvedLeadId) {
    if (clientProfileId && isLoading) {
      return <p className="py-2 text-[11.5px] italic text-[var(--text-muted)]">Opening the brief…</p>;
    }
    return (
      <p className="py-2 text-[11.5px] text-[var(--text-muted)]">
        No original brief is linked to this document.
      </p>
    );
  }

  return <BriefSection leadId={resolvedLeadId} />;
}
