'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';

import { useProjectDocuments, type ProjectDocument } from '@patina/supabase';

const KIND_LABEL: Record<ProjectDocument['kind'], string> = {
  proposal: 'Proposal',
  scope_change: 'Scope change',
  contract: 'Contract',
  other: 'Document',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Signed',
  declined: 'Declined',
  expired: 'Expired',
  approved: 'Approved',
  cancelled: 'Cancelled',
  applied: 'Applied',
};

function formatCurrencyCents(cents: number | null): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ProjectDocumentsPanel({ projectId }: { projectId: string }) {
  const { data: documents = [], isLoading } = useProjectDocuments(projectId);

  return (
    <section
      className="rounded-lg border border-[var(--border-default)] bg-white p-5"
      data-testid="project-documents-panel"
    >
      <h3 className="font-heading text-base text-[var(--text-primary)] mb-3">Documents</h3>
      {isLoading ? (
        <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="type-body-small text-[var(--text-muted)]">
          Proposals and scope-change requests will appear here as they&rsquo;re sent.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {documents.map((doc) => {
            const total = formatCurrencyCents(doc.total_amount_cents);
            const signedDate = formatDate(doc.signed_at);
            const status = doc.status ? STATUS_LABEL[doc.status] ?? doc.status : null;
            return (
              <li key={`${doc.kind}-${doc.id}`}>
                <Link
                  href={doc.url}
                  className="flex items-center gap-3 py-3 no-underline transition hover:opacity-80"
                >
                  <FileText className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {doc.title}
                    </p>
                    <p className="type-meta-small text-[var(--text-muted)]">
                      {KIND_LABEL[doc.kind]}
                      {status ? ` · ${status}` : ''}
                      {signedDate ? ` · ${signedDate}` : ''}
                    </p>
                  </div>
                  {total && (
                    <span className="type-meta-small shrink-0 text-[var(--text-muted)]">
                      {total}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
