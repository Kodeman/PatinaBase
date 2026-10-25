'use client';

import { useClient } from '@patina/supabase';
import { BriefSection } from './brief-section';
import { SectionLoadingLine } from './section-loading-line';

export function BriefRecap({
  designerClientId,
  leadId,
}: {
  /** Retained for existing callers; a profile never identifies an engagement. */
  clientProfileId?: string | null;
  designerClientId?: string | null;
  leadId: string | null;
}) {
  const { data: relationship, isLoading, isError } = useClient(
    leadId ? '' : (designerClientId ?? ''),
  );

  if (!leadId && designerClientId) {
    if (isLoading) return <SectionLoadingLine label="Opening the brief" className="py-2" />;
    if (isError) return <p role="alert" className="t-body-sm py-2">The original brief could not be read.</p>;
  }

  const resolvedLeadId = leadId ?? relationship?.lead_id ?? null;
  if (!resolvedLeadId) {
    return (
      <p className="py-2 text-[11.5px] text-[var(--text-muted)]">
        No original brief is linked to this document.
      </p>
    );
  }

  return <BriefSection leadId={resolvedLeadId} />;
}
