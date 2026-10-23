'use client';

import { useOrganizationMembers, useProjectV2 } from '@patina/supabase';
import type { Database } from '@patina/supabase';
import type { OverviewLine } from '@/lib/document/pieces/overview-derivation';

type Profile = Database['public']['Tables']['profiles']['Row'];
type PurchaseOrder = Database['public']['Tables']['purchase_orders']['Row'];
type FfeItem = Database['public']['Tables']['project_ffe_items']['Row'];

export type PurchasingOverviewLine = OverviewLine & Partial<Pick<FfeItem, 'name' | 'unit'>> & {
  purchase_order?: (Pick<PurchaseOrder, 'status' | 'created_by' | 'ship_to'> & {
    creator?: Pick<Profile, 'display_name' | 'full_name'> | null;
  }) | null;
};

function profileName(profile: Pick<Profile, 'display_name' | 'full_name'> | null | undefined) {
  return profile?.display_name?.trim() || profile?.full_name?.trim() || null;
}

function ReleaseOwnerNames({ studioId }: { studioId: string }) {
  const members = useOrganizationMembers(studioId);
  if (members.isError) return <>Studio owner unavailable</>;
  if (members.isPending) return <>Reading studio owner…</>;
  const owners = (members.data ?? [])
    .filter((member) => member.role === 'owner' && member.status === 'active')
    .map((member) => profileName(member.profiles))
    .filter(Boolean);
  return <>{owners.join(', ') || 'Studio owner not named'}</>;
}

/** Release responsibility belongs to the job's studio, not the signed-in user's studio. */
function ReleaseOwner({ projectId }: { projectId: string }) {
  const project = useProjectV2(projectId);
  if (project.isError) return <>Studio owner unavailable</>;
  if (project.isPending) return <>Reading studio owner…</>;
  if (!project.data?.studio_id) return <>Studio owner not named</>;
  return <ReleaseOwnerNames studioId={project.data.studio_id} />;
}

function NextOwner({ projectId, po }: {
  projectId: string;
  po: PurchasingOverviewLine['purchase_order'];
}) {
  if (po?.status === 'held_for_release') return <ReleaseOwner projectId={projectId} />;
  return <>{profileName(po?.creator) || 'Owner not named'}</>;
}

function Quantity({ line }: { line: PurchasingOverviewLine }) {
  return <>
    Quantity {line.quantity ?? 'not recorded'}
    {line.unit && line.unit !== 'each' ? ` ${line.unit}` : ''}
  </>;
}

function purchasingDestination(po: PurchasingOverviewLine['purchase_order']) {
  if (!po) return null;
  return po.ship_to?.trim() || 'No destination yet';
}

function PurchasingFactLine({ projectId, line }: { projectId: string; line: PurchasingOverviewLine }) {
  return (
    <li data-purchasing-line={line.id} className="grid min-w-0 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <span className="min-w-0 break-words">
        {line.name || 'Unnamed piece'} · <Quantity line={line} />
      </span>
      <span className="min-w-0 whitespace-pre-line break-words">
        {purchasingDestination(line.purchase_order)}
      </span>
      <span className="min-w-0 break-words">
        Next: <NextOwner projectId={projectId} po={line.purchase_order} />
      </span>
    </li>
  );
}

export function PurchasingOverviewFacts({ projectId, lines }: {
  projectId: string;
  lines: readonly PurchasingOverviewLine[];
}) {
  return (
    <ul aria-label="Purchasing at a glance" className="mb-3 space-y-2 text-[14px] text-[var(--ink)]">
      {lines.map((line) => <PurchasingFactLine key={line.id} projectId={projectId} line={line} />)}
    </ul>
  );
}
