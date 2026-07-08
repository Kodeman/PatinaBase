/**
 * Pure grouping/labeling logic for the client Documents hub — split out from
 * page.tsx so it's independently testable, mirroring ../budget/rollup.ts.
 */

import type { ClientDocument } from '@/hooks/use-documents-client';

/**
 * Documents actually safe to show a client. The server query already scopes
 * to client_visible = true (RLS enforces it regardless of the query — see
 * supabase/migrations/00203_folio_file_anchors.sql), but this filters
 * defensively client-side too, mirroring the established pattern in
 * ../budget/rollup.ts (visibleInvoices).
 */
export function visibleDocuments(documents: ClientDocument[]): ClientDocument[] {
  return documents.filter((doc) => doc.client_visible);
}

export interface ProjectDocumentGroup {
  projectId: string;
  projectName: string;
  documents: ClientDocument[];
}

/**
 * Groups visible documents by project, in the same project order supplied
 * (useProjects() sorts newest-first). Projects with no visible documents are
 * omitted entirely — there is no per-project copy for "nothing shared yet"
 * (the brief specifies a single page-level empty state for that case), so an
 * empty group would just be a heading over nothing.
 */
export function groupDocumentsByProject(
  documents: ClientDocument[],
  projects: Array<{ id: string; name: string }>,
): ProjectDocumentGroup[] {
  const visible = visibleDocuments(documents);
  const groups: ProjectDocumentGroup[] = [];

  for (const project of projects) {
    const projectDocuments = visible
      .filter((doc) => doc.project_id === project.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (projectDocuments.length === 0) continue;
    groups.push({
      projectId: project.id,
      projectName: project.name,
      documents: projectDocuments,
    });
  }

  return groups;
}

const FORMAT_LABELS: Record<string, string> = {
  pdf: 'PDF',
  img: 'IMG',
  doc: 'DOC',
  xls: 'XLS',
  xlsx: 'XLSX',
  dwg: 'DWG',
  png: 'PNG',
};

function humanize(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The row's kind/type badge. Prefers the semantic `category` (contract /
 * drawing / photo / spec — supabase/migrations/00169_project_documents_and_tasks.sql)
 * when a designer has set one; falls back to the file format (`doc_type`,
 * always populated — see apps/designer-portal/src/hooks/use-folio.ts
 * `docTypeFor`) since no current upload path writes `category`.
 */
export function documentKindLabel(doc: Pick<ClientDocument, 'category' | 'doc_type'>): string {
  const category = doc.category?.trim();
  if (category) return humanize(category);
  return FORMAT_LABELS[doc.doc_type] ?? doc.doc_type.toUpperCase();
}
