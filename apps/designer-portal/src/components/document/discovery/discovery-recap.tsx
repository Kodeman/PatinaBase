'use client';

/**
 * Discovery recap (R66 review) — a READ-ONLY recap of the captured Discovery
 * facts, shown when a settled Discovery bar unfolds. The active Discovery is a
 * self-persisting editor (discovery-section.tsx); once settled, the designer
 * needs to re-read what was captured — budget, rooms, timeline, style — without
 * the risk of editing locked history.
 *
 * Once the engagement advances, document_state's engagement_id is the
 * proposal/project id (not the relationship id), so a LOGIN client resolves
 * the designer_clients id from the client profile, then reads
 * client_discovery. A NO-LOGIN household (Arrival Arc R106 §5) has no
 * profile to resolve through — client_profile_id is null — so this also
 * tries the relationship id directly, mirroring how use-person-documents.ts
 * handles the two-leg problem: see use-discovery-relationship-id.ts for the
 * full contract (Shape D direct, Shape B via proposals.designer_client_id,
 * Shape A unresolved and out of scope).
 */

import { useDiscovery, useDesignerClientForClientUser, useStyles } from '@patina/supabase';
import { useDesignerClientIdForProposal } from '@/hooks/use-discovery-relationship-id';
import { formatBudgetRange } from '@/lib/document/discovery-seed';
import { fmtDay } from '@/lib/document/format';
import { SectionLoadingLine } from '../section-loading-line';

const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function RecapRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-dashed border-[var(--color-pearl)] py-2 last:border-b-0">
      <span className="w-[96px] shrink-0 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--color-charcoal)]">{children}</span>
    </div>
  );
}

export function DiscoveryRecap({
  clientProfileId,
  engagementKind,
  engagementId,
  proposalId,
}: {
  clientProfileId: string | null;
  /** document_state's engagement_kind/engagement_id/proposal_id for THIS
   *  row — needed only for the no-login fallback (R106 §5); a login client
   *  resolves entirely off clientProfileId, unchanged from before. */
  engagementKind?: string;
  engagementId?: string | null;
  proposalId?: string | null;
}) {
  const { data: dc, isLoading: dcLoading } = useDesignerClientForClientUser(clientProfileId ?? undefined);

  const noLogin = !clientProfileId;
  // Shape D: engagement_id already IS designer_clients.id — no query needed.
  const relationshipLegId = noLogin && engagementKind === 'relationship' ? (engagementId ?? null) : null;
  // Shape B: resolve via the proposal's carried household link (only tried
  // when the relationship leg didn't already answer it).
  const tryProposalLeg = noLogin && !relationshipLegId && Boolean(proposalId);
  const { data: proposalLegId, isLoading: proposalLegLoading } = useDesignerClientIdForProposal(
    tryProposalLeg ? (proposalId as string) : null,
  );

  const designerClientId = dc?.id ?? relationshipLegId ?? proposalLegId ?? null;
  const { data: read, isLoading: discoveryLoading } = useDiscovery(designerClientId);
  const { data: styles } = useStyles() as { data: { id: string; name: string }[] | undefined };

  const row = read?.row;

  // Actively resolving — a login client's designer_clients lookup, a
  // no-login household's proposal-leg lookup, or the discovery row itself —
  // show the quiet loading line rather than flash the apology mid-resolution.
  const resolving =
    (Boolean(clientProfileId) && dcLoading) ||
    (tryProposalLeg && proposalLegLoading) ||
    (Boolean(designerClientId) && discoveryLoading);
  if (resolving) {
    return <SectionLoadingLine label="Opening discovery" className="py-2" />;
  }
  if (!row) {
    return (
      <p className="py-2 text-[11.5px] text-[var(--text-muted)]">
        No structured discovery was captured for this engagement.
      </p>
    );
  }

  const styleNames = (row.style_tag_ids ?? [])
    .map((id) => (styles ?? []).find((s) => s.id === id)?.name)
    .filter(Boolean) as string[];
  const styleBits = [...styleNames, ...(row.style_keywords ?? [])];

  const timeline = [
    row.target_date ? `Target ${fmtDay(row.target_date)}` : null,
    row.hard_date ? `Hard date ${fmtDay(row.hard_date)}` : null,
    row.start_urgency ? pretty(row.start_urgency) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const keepAvoid = [
    (row.keep_items ?? []).map((k) => k.label).filter(Boolean).join(', ') || null,
    (row.avoid_items ?? []).length
      ? `avoid: ${(row.avoid_items ?? []).map((a) => a.label).filter(Boolean).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      {row.project_type && <RecapRow label="Project">{pretty(row.project_type)}</RecapRow>}
      {(row.rooms ?? []).length > 0 && (
        <RecapRow label="Rooms">{(row.rooms ?? []).map((r) => r.name).filter(Boolean).join(', ')}</RecapRow>
      )}
      {row.budget_max_cents != null && (
        <RecapRow label="Budget">
          {formatBudgetRange(row.budget_min_cents, row.budget_max_cents)}
          {row.budget_basis ? ` · ${pretty(row.budget_basis)}` : ''}
        </RecapRow>
      )}
      {timeline && <RecapRow label="Timeline">{timeline}</RecapRow>}
      {styleBits.length > 0 && <RecapRow label="Style">{styleBits.join(' · ')}</RecapRow>}
      {(row.lifestyle ?? []).length > 0 && (
        <RecapRow label="Lifestyle">
          {(row.lifestyle ?? [])
            .map((l) => [l.room, l.who, l.how].filter(Boolean).join(' — '))
            .filter(Boolean)
            .join('; ')}
        </RecapRow>
      )}
      {keepAvoid && <RecapRow label="Keep · avoid">{keepAvoid}</RecapRow>}
      {(row.decision_makers ?? []).length > 0 && (
        <RecapRow label="Deciders">
          {(row.decision_makers ?? [])
            .map((d) => (d.role ? `${d.name} (${d.role})` : d.name))
            .join(', ')}
        </RecapRow>
      )}
      {row.site_notes && <RecapRow label="Site notes">{row.site_notes}</RecapRow>}
      <p className="mt-3 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        Captured in Discovery{row.ready_at ? ` · ready ${fmtDay(row.ready_at)}` : ''} · read-only
      </p>
    </div>
  );
}
