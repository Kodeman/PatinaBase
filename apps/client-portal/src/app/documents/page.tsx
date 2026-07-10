'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useProjects } from '@patina/supabase';
import {
  useClientDocuments,
  documentSignedUrl,
  type ClientDocument,
} from '@/hooks/use-documents-client';
import { formatDate } from '@/lib/utils/format';
import { StrataMark } from '@/components/strata-mark';
import { clientEvents } from '@/lib/analytics/events';
import { groupDocumentsByProject, documentKindLabel } from './group';

// Documents hub (P2b) — one place for contracts, floor plans, and spec sheets
// the designer has shared, grouped by project. Reads the Folio's
// client-visible leg of project_documents (supabase/migrations/00169, 00203,
// 00252) via @/hooks/use-documents-client, which mirrors the designer
// portal's own retrieval mechanics (same table/bucket, signed URLs — never a
// public URL, never a widened bucket policy). Per-fetch failures render
// inline, matching ../budget/page.tsx.

export default function ClientDocumentsPage() {
  const { data: projects, isLoading: projectsLoading, isError: projectsError } = useProjects();
  const projectIds = (projects ?? []).map((project) => project.id);
  const {
    data: documentsData,
    isLoading: documentsLoading,
    isError: documentsError,
  } = useClientDocuments(projectIds);

  // useClientDocuments is disabled (and never resolves out of "loading") when
  // there are no projects yet, so only fold its status in once it's actually
  // enabled — otherwise a client with zero projects would spin forever.
  const documentsFetchActive = projectIds.length > 0;
  const isLoading = projectsLoading || (documentsFetchActive && documentsLoading);
  const isError = projectsError || (documentsFetchActive && documentsError);

  const groups = groupDocumentsByProject(documentsData ?? [], projects ?? []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-page-title">Documents</h1>
      <p className="type-body mt-2">
        Contracts, drawings, and other files your designer has shared — grouped by project.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-16" data-testid="documents-loading">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {!isLoading && isError && (
        <div className="py-16 text-center" data-testid="documents-error">
          <p className="type-body-small" style={{ color: 'var(--color-terracotta, #C77B6E)' }}>
            We couldn&rsquo;t load your documents right now. Try refreshing the page.
          </p>
        </div>
      )}

      {!isLoading && !isError && groups.length === 0 && (
        <div className="py-16 text-center" data-testid="documents-empty">
          <p className="type-body-small">Your designer hasn&rsquo;t shared any documents yet.</p>
        </div>
      )}

      {!isLoading &&
        !isError &&
        groups.map((group, index) => (
          <div key={group.projectId}>
            {index > 0 && <StrataMark variant="mini" />}
            <section className="mt-8">
              <h2 className="type-section-head">{group.projectName}</h2>
              <ul className="mt-4 space-y-0">
                {group.documents.map((document) => (
                  <DocumentRow key={document.id} document={document} />
                ))}
              </ul>
            </section>
          </div>
        ))}
    </div>
  );
}

function DocumentRow({ document }: { document: ClientDocument }) {
  const [state, setState] = useState<'idle' | 'opening' | 'error'>('idle');

  const handleOpen = async () => {
    clientEvents.documentView({ documentId: document.id, kind: document.doc_type });
    if (!document.storage_path) {
      setState('error');
      return;
    }
    setState('opening');
    const url = await documentSignedUrl(document.storage_path);
    if (!url) {
      setState('error');
      return;
    }
    setState('idle');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <li className="border-b border-[var(--border-default)] py-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="type-meta text-[var(--text-muted)]">
            {[documentKindLabel(document), formatDate(document.created_at)].filter(Boolean).join(' · ')}
          </p>
          <h3 className="font-heading text-base text-[var(--text-primary)]">{document.title}</h3>
        </div>
        <div className="flex-shrink-0 text-right">
          <button
            type="button"
            onClick={() => void handleOpen()}
            disabled={state === 'opening'}
            aria-label={`Open ${document.title}`}
            className="type-meta-small text-[var(--accent-primary)] transition-opacity hover:opacity-70 disabled:opacity-50"
          >
            {state === 'opening' ? 'Opening…' : 'Open'}
          </button>
          {state === 'error' && (
            <p
              className="type-meta-small mt-0.5"
              style={{ color: 'var(--color-terracotta, #C77B6E)' }}
            >
              Couldn&rsquo;t open this file.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
