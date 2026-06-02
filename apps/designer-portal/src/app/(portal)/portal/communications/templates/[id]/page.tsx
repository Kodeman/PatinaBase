'use client';

import { use } from 'react';
import Link from 'next/link';
import DOMPurify from 'dompurify';
import { useTemplate, useDeleteTemplate } from '@patina/supabase';
import { useRouter } from 'next/navigation';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  const { data: template, isLoading } = useTemplate(id) as { data: Any; isLoading: boolean };
  const deleteTemplate = useDeleteTemplate();

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!template) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Template not found.</p>;

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/communications/templates" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Templates</Link>
        <span className="mx-2">&rarr;</span><span>{template.name}</span>
      </div>
      <h1 className="type-page-title mb-4">{template.name}</h1>
      <FieldGroup label="Template Details">
        <DetailRow label="Subject" value={template.subject || '—'} />
        <DetailRow label="Created" value={template.created_at ? new Date(template.created_at).toLocaleDateString() : '—'} />
      </FieldGroup>
      {template.body_html && (
        <FieldGroup label="Content Preview">
          <div className="type-body max-w-[640px] rounded border border-[var(--border-subtle)] p-4" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(template.body_html) }} />
        </FieldGroup>
      )}
      <div className="mt-6">
        <PortalButton variant="ghost" disabled={deleteTemplate.isPending} onClick={() => deleteTemplate.mutate(id, { onSuccess: () => router.push('/portal/communications/templates') })}>
          {deleteTemplate.isPending ? 'Deleting...' : 'Delete Template'}
        </PortalButton>
      </div>
    </div>
  );
}
