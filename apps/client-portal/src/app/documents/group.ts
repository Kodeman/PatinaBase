/**
 * Pure grouping/labeling logic for the client Documents hub — split out from
 * page.tsx so it's independently testable, mirroring ../budget/rollup.ts.
 */

import type { ClientPlanSheet } from '@patina/supabase';

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

/** Sentinel group for visible rows no known project can claim. */
export const EARLIER_PAPERS_GROUP_ID = 'earlier-papers';

/**
 * Groups visible documents by project, in the same project order supplied
 * (useProjects() sorts newest-first). Projects with no visible documents are
 * omitted entirely — there is no per-project copy for "nothing shared yet"
 * (the brief specifies a single page-level empty state for that case), so an
 * empty group would just be a heading over nothing.
 *
 * Proposal-anchored rows (project_id null — e.g. a design agreement signed
 * before activation) fold into their project's group via proposalProjectIds
 * (proposal id → activated project id). A visible row nothing can claim —
 * unactivated proposal, or a project not in the client's list — lands in a
 * trailing "Earlier papers" group rather than vanishing.
 */
export function groupDocumentsByProject(
  documents: ClientDocument[],
  projects: Array<{ id: string; name: string }>,
  proposalProjectIds: Record<string, string | null> = {},
): ProjectDocumentGroup[] {
  const visible = visibleDocuments(documents);
  const groups: ProjectDocumentGroup[] = [];

  const resolvedProjectId = (doc: ClientDocument): string | null =>
    doc.project_id ??
    (doc.proposal_id ? (proposalProjectIds[doc.proposal_id] ?? null) : null);

  for (const project of projects) {
    const projectDocuments = visible
      .filter((doc) => resolvedProjectId(doc) === project.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (projectDocuments.length === 0) continue;
    groups.push({
      projectId: project.id,
      projectName: project.name,
      documents: projectDocuments,
    });
  }

  const knownProjectIds = new Set(projects.map((project) => project.id));
  const unclaimed = visible
    .filter((doc) => {
      const projectId = resolvedProjectId(doc);
      return projectId === null || !knownProjectIds.has(projectId);
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (unclaimed.length > 0) {
    groups.push({
      projectId: EARLIER_PAPERS_GROUP_ID,
      projectName: 'Earlier papers',
      documents: unclaimed,
    });
  }

  return groups;
}

/**
 * The loose "Other papers" list: everything EXCEPT plan-room rows. A filed
 * drawing's project_documents row (section_key 'plan-room', 00429) is
 * presented through the plan-set surface — rev letter on the face, current
 * print only — so it must not also appear as an ordinary file row.
 */
export function looseDocuments(documents: ClientDocument[]): ClientDocument[] {
  return documents.filter((doc) => doc.section_key !== 'plan-room');
}

export interface ClientPlanSetGroup {
  /** Title-cased heading — the discipline, or the sheet-number prefix. */
  discipline: string;
  sheets: ClientPlanSheet[];
}

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Groups a project's shared plan set by discipline for display, preserving
 * the hook's sheet-number ordering within each group. Sheets without a
 * discipline fall back to the letters before the dash in their number
 * ("A-101" → "A"), the convention those numbers already encode.
 */
export function groupClientPlanSet(
  sheets: ClientPlanSheet[],
): ClientPlanSetGroup[] {
  const groups = new Map<string, ClientPlanSheet[]>();

  for (const sheet of sheets) {
    const discipline =
      sheet.discipline?.trim() ||
      sheet.number.match(/^([A-Za-z]+)\s*-/)?.[1] ||
      'Drawings';
    const heading = titleCase(discipline);
    const group = groups.get(heading);
    if (group) {
      group.push(sheet);
    } else {
      groups.set(heading, [sheet]);
    }
  }

  return Array.from(groups.entries()).map(([discipline, groupSheets]) => ({
    discipline,
    sheets: groupSheets,
  }));
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
