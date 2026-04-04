'use client';

import { useRouter } from 'next/navigation';
import { useTemplates } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function TemplatesPage() {
  const router = useRouter();
  const { data: rawTemplates, isLoading } = useTemplates() as { data: Any; isLoading: boolean };
  const templates = Array.isArray(rawTemplates) ? rawTemplates : [];

  return (
    <div className="pt-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="type-section-head">Templates</h1>
        <PortalButton variant="primary" onClick={() => router.push('/portal/communications/templates/new')}>New Template</PortalButton>
      </div>
      {isLoading ? <LoadingStrata /> : templates.length > 0 ? (
        <div>
          {templates.map((t: Any) => (
            <div key={t.id} className="cursor-pointer border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]" onClick={() => router.push(`/portal/communications/templates/${t.id}`)}>
              <span className="type-label">{t.name}</span>
              <div className="type-label-secondary mt-1">{t.subject || ''}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">No templates yet.</p>
      )}
    </div>
  );
}
