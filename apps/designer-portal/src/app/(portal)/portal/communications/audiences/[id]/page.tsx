'use client';

import { use } from 'react';
import Link from 'next/link';
import { useAudienceSegment, useDeleteAudienceSegment } from '@patina/supabase';
import { useRouter } from 'next/navigation';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function AudienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: audience, isLoading } = useAudienceSegment(id) as { data: Any; isLoading: boolean };
  const deleteAudience = useDeleteAudienceSegment();

  if (isLoading) return <LoadingStrata />;
  if (!audience) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Audience not found.</p>;

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/communications/audiences" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Audiences</Link>
        <span className="mx-2">&rarr;</span><span>{audience.name}</span>
      </div>
      <h1 className="type-page-title mb-4">{audience.name}</h1>
      {audience.description && <p className="type-body mb-6">{audience.description}</p>}
      <FieldGroup label="Audience Info">
        <DetailRow label="Members" value={String(audience.estimated_size || audience.member_count || 0)} />
        <DetailRow label="Created" value={audience.created_at ? new Date(audience.created_at).toLocaleDateString() : '—'} />
      </FieldGroup>
      <div className="mt-6">
        <PortalButton variant="ghost" onClick={() => { deleteAudience.mutate(id); router.push('/portal/communications/audiences'); }}>Delete Audience</PortalButton>
      </div>
    </div>
  );
}
