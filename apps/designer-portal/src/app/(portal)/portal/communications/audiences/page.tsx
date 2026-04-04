'use client';

import { useRouter } from 'next/navigation';
import { useAudienceSegments } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function AudiencesPage() {
  const router = useRouter();
  const { data: rawAudiences, isLoading } = useAudienceSegments() as { data: Any; isLoading: boolean };
  const audiences = Array.isArray(rawAudiences) ? rawAudiences : [];

  return (
    <div className="pt-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="type-section-head">Audiences</h1>
        <PortalButton variant="primary" onClick={() => router.push('/portal/communications/audiences/new')}>New Audience</PortalButton>
      </div>
      {isLoading ? <LoadingStrata /> : audiences.length > 0 ? (
        <div>
          {audiences.map((a: Any) => (
            <div key={a.id} className="cursor-pointer border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]" onClick={() => router.push(`/portal/communications/audiences/${a.id}`)}>
              <div className="flex items-baseline justify-between">
                <span className="type-label">{a.name}</span>
                <span className="type-meta">{a.estimated_size || a.member_count || 0} members</span>
              </div>
              {a.description && <div className="type-label-secondary mt-1">{a.description}</div>}
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">No audiences defined yet.</p>
      )}
    </div>
  );
}
