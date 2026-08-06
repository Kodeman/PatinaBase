'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useProjects, useClientPlanSet, type ClientPlanSheet } from '@patina/supabase';
import {
  useClientDocuments,
  documentSignedUrl,
  type ClientDocument,
} from '@/hooks/use-documents-client';
import { formatDate } from '@/lib/utils/format';
import { StrataMark } from '@/components/strata-mark';
import { clientEvents } from '@/lib/analytics/events';
import {
  groupDocumentsByProject,
  groupClientPlanSet,
  looseDocuments,
  documentKindLabel,
} from './group';

// Documents hub (P2b, reborn for the Plan Room 00429) — one place for the
// files the designer has shared. Two registers now:
//   - "Your drawings": the current print of every shared plan sheet, straight
//     from useClientPlanSet (@patina/supabase) — rev letter on the face, no
//     version archaeology, RLS structurally limits the read to current prints
//     of shared sheets.
//   - "Other papers": the Folio's client-visible leg of project_documents
//     (00169, 00203, 00252) via @/hooks/use-documents-client, now widened to
//     proposal-anchored rows and with plan-room rows excluded (they ARE the
//     drawings above). Signed URLs only — never a public URL, never a widened
//     bucket policy. Per-fetch failures render inline, matching
//     ../budget/page.tsx.

export default function ClientDocumentsPage() {
  const { data: projects, isLoading: projectsLoading, isError: projectsError } = useProjects();
  const projectIds = (projects ?? []).map((project) => project.id);
  const {
    data: documentsData,
    isLoading: documentsLoading,
    isError: documentsError,
  } = useClientDocuments(projectIds);
  const {
    data: planSheets,
    isLoading: planSetLoading,
    isError: planSetError,
  } = useClientPlanSet(projectIds);

  // useClientDocuments/useClientPlanSet are disabled (and never resolve out of
  // "loading") when there are no projects yet, so only fold their status in
  // once they're actually enabled — otherwise a client with zero projects
  // would spin forever.
  const fetchesActive = projectIds.length > 0;
  const isLoading =
    projectsLoading || (fetchesActive && (documentsLoading || planSetLoading));
  const isError =
    projectsError || (fetchesActive && (documentsError || planSetError));

  const documents = documentsData?.documents ?? [];
  const sheets = planSheets ?? [];
  const groups = groupDocumentsByProject(
    looseDocuments(documents),
    projects ?? [],
    documentsData?.proposalProjectIds ?? {},
  );
  const drawingSections = (projects ?? [])
    .map((project) => ({
      project,
      sheets: sheets.filter((sheet) => sheet.projectId === project.id),
    }))
    .filter((section) => section.sheets.length > 0);
  const isEmpty = groups.length === 0 && drawingSections.length === 0;

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

      {!isLoading && !isError && isEmpty && (
        <div className="py-16 text-center" data-testid="documents-empty">
          <p className="type-body-small">Your designer hasn&rsquo;t shared any documents yet.</p>
        </div>
      )}

      {!isLoading &&
        !isError &&
        drawingSections.map(({ project, sheets: projectSheets }) => (
          <section className="mt-8" key={`drawings-${project.id}`} data-testid="plan-set-section">
            <h2 className="type-section-head">{project.name}</h2>
            <p className="type-meta mt-1 text-[var(--text-muted)]">Your drawings</p>
            {groupClientPlanSet(projectSheets).map((group) => (
              <div key={group.discipline} className="mt-4">
                <h3 className="type-meta text-[var(--text-muted)]">{group.discipline}</h3>
                <ul className="mt-2 space-y-0">
                  {group.sheets.map((sheet) => (
                    <PlanSheetRow key={sheet.sheetId} sheet={sheet} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}

      {!isLoading && !isError && drawingSections.length > 0 && groups.length > 0 && (
        <div className="mt-10">
          <StrataMark variant="mini" />
          <h2 className="type-section-head mt-8">Other papers</h2>
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

function PlanSheetRow({ sheet }: { sheet: ClientPlanSheet }) {
  const [state, setState] = useState<'idle' | 'opening' | 'error'>('idle');

  const handleOpen = async () => {
    if (!sheet.storagePath) {
      setState('error');
      return;
    }
    setState('opening');
    const url = await documentSignedUrl(sheet.storagePath);
    if (!url) {
      setState('error');
      return;
    }
    setState('idle');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <li className="border-b border-[var(--border-default)] py-4" data-testid="plan-sheet-row">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <span
            aria-label={`Revision ${sheet.revLetter}`}
            className="type-meta-small inline-flex min-w-7 flex-shrink-0 items-center justify-center border border-[var(--border-default)] px-1.5 py-0.5 font-mono"
          >
            {sheet.revLetter}
          </span>
          <div className="min-w-0 flex-1">
            <p className="type-meta text-[var(--text-muted)]">
              {[sheet.number, `Rev ${sheet.revLetter}`, formatDate(sheet.revDate)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <h3 className="font-heading text-base text-[var(--text-primary)]">{sheet.title}</h3>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <button
            type="button"
            onClick={() => void handleOpen()}
            disabled={state === 'opening'}
            aria-label={`Open ${sheet.title}`}
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
