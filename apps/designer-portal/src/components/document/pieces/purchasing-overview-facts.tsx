'use client';

import { useOrganizationMembers, useProjectV2 } from '@patina/supabase';
import type { Database } from '@patina/supabase';
import { pieceLineStage } from '@/lib/document/pieces/line-stage';
import { deriveNextAct } from '../line-unfold/next-act';
import type { OverviewLine } from '@/lib/document/pieces/overview-derivation';
import { useJobPlaces } from '../destinations/use-job-places';

type Profile = Database['public']['Tables']['profiles']['Row'];
type PurchaseOrder = Database['public']['Tables']['purchase_orders']['Row'];
type FfeItem = Database['public']['Tables']['project_ffe_items']['Row'];

export type PurchasingOverviewLine = OverviewLine & { studio_purchases?: { status: string }[] | null } & Partial<Pick<FfeItem, 'name' | 'unit' | 'planned_destination_location_id'>> & {
  purchase_order?: (Pick<PurchaseOrder, 'status' | 'created_by' | 'ship_to'> & {
    creator?: Pick<Profile, 'display_name' | 'full_name'> | null;
    sent_at?: string | null;
    acknowledged_at?: string | null;
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

function NextReading({ projectId, line }: { projectId: string; line: PurchasingOverviewLine }) {
  const po = line.purchase_order;
  if (po?.status === 'held_for_release') return <>Next: <ReleaseOwner projectId={projectId} /></>;
  const owner = profileName(po?.creator);
  if (owner) return <>Next: {owner}</>;
  const stage = pieceLineStage(line);
  const next = deriveNextAct({
    itemStatus: line.status ?? '',
    po: po ?? null,
    purchase: line.studio_purchases?.find((purchase) => purchase.status === 'recorded' || purchase.status === 'billed'),
    ready: stage.lock === null && (stage.stage === 'ready' || stage.stage === 'released'),
    inspected: line.received_quantity != null,
    hasOpenClaim: (line.item_claims ?? []).some((claim) => claim.state === 'drafted' || claim.state === 'vendor_notified'),
  });
  if (!next) return null;
  const label = next.kind === 'advance' ? next.label : {
    order: 'Prepare a PO',
    send: 'Send to vendor',
    'log-ack': 'Log the ack',
    inspect: 'Log inspection',
    'complete-inspection': 'Complete inspection',
    install: 'Mark installed',
    'purchase-arrival': 'Record arrival',
  }[next.kind];
  return <>Next: {label}</>;
}

function Quantity({ line }: { line: PurchasingOverviewLine }) {
  return <>
    Quantity {line.quantity ?? 'not recorded'}
    {line.unit && line.unit !== 'each' ? ` ${line.unit}` : ''}
  </>;
}

function purchasingDestination(line: PurchasingOverviewLine, jobPlaces: ReturnType<typeof useJobPlaces>['jobPlaces']) {
  const committed = line.purchase_order?.ship_to?.trim();
  if (committed) return committed;
  const planned = jobPlaces.find((place) => place.id === line.planned_destination_location_id);
  return planned
    ? `Planned: ${planned.label} · ${planned.kind}${planned.is_private_home ? ' · Private home' : ''}`
    : null;
}

function PurchasingFactLine({ projectId, line, jobPlaces }: {
  projectId: string;
  line: PurchasingOverviewLine;
  jobPlaces: ReturnType<typeof useJobPlaces>['jobPlaces'];
}) {
  return (
    <li data-purchasing-line={line.id} className="grid min-w-0 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <span className="min-w-0 break-words">
        {line.name || 'Unnamed piece'} · <Quantity line={line} />
      </span>
      <span className="min-w-0 whitespace-pre-line break-words">
        {purchasingDestination(line, jobPlaces)}
      </span>
      <span className="min-w-0 break-words">
        <NextReading projectId={projectId} line={line} />
      </span>
    </li>
  );
}

export function PurchasingOverviewFacts({ projectId, lines }: {
  projectId: string;
  lines: readonly PurchasingOverviewLine[];
}) {
  const { jobPlaces } = useJobPlaces(projectId);
  return (
    <ul aria-label="Purchasing at a glance" className="mb-3 space-y-2 text-[14px] text-[var(--ink)]">
      {lines.map((line) => <PurchasingFactLine key={line.id} projectId={projectId} line={line} jobPlaces={jobPlaces} />)}
    </ul>
  );
}
