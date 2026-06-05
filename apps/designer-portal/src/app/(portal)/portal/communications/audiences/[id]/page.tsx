'use client';

import { use } from 'react';
import Link from 'next/link';
import { useAudienceSegment, useDeleteAudienceSegment } from '@patina/supabase';
import { useRouter } from 'next/navigation';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { Button } from '@/components/ui/controls';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function AudienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  const { data: audience, isLoading } = useAudienceSegment(id) as { data: Any; isLoading: boolean };
  const deleteAudience = useDeleteAudienceSegment();

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!audience) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Audience not found.</p>;

  return (
    <div className="pt-8">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/communications/audiences">← Audiences</Link>
        </Button>
      </div>
      <h1 className="type-page-title mb-4">{audience.name}</h1>
      {audience.description && <p className="type-body mb-6">{audience.description}</p>}
      <FieldGroup label="Audience Info">
        <DetailRow label="Members" value={String(audience.estimated_size || audience.member_count || 0)} />
        <DetailRow label="Created" value={audience.created_at ? new Date(audience.created_at).toLocaleDateString() : '—'} />
      </FieldGroup>
      <div className="mt-6">
        <Button variant="ghost" disabled={deleteAudience.isPending} onClick={() => deleteAudience.mutate(id, { onSuccess: () => router.push('/portal/communications/audiences') })}>
          {deleteAudience.isPending ? 'Deleting...' : 'Delete Audience'}
        </Button>
      </div>
    </div>
  );
}
