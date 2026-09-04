import type {
  ClientPlanSheet,
  ProjectDocument,
  ProjectDocumentKind,
} from '@patina/supabase';

import type { ClientDocument } from '@/hooks/use-documents-client';

/* ── THE PAPERS, SORTED ──────────────────────────────────────────────────────
   The pure half of the papers sheet, copied from the register the Documents
   hub read — so the drawing set and the studio's files read the same way
   inside the house as they did on their own page.

   SOURCES OF RECORD (the retirement plan deletes these; `papers-copy.test.ts`
   holds the copy to them for as long as they stand):
     · `src/app/documents/group.ts`        — groupClientPlanSet, titleCase,
                                             visibleDocuments, looseDocuments,
                                             documentKindLabel, FORMAT_LABELS
     · `src/hooks/use-documents-client.ts` — ClientDocument, useClientDocuments,
                                             documentSignedUrl
     · `src/app/documents/page.tsx`        — "Couldn't open this file."

   `paperKindLabel` and `isExecutedInstrument` are this file's own: they read
   `useProjectDocuments`, which the hub never used. ─────────────────────── */

/** The words on the tab that lays the papers sheet down, and takes it away. */
export const PAPERS_TAB_LABEL = 'The papers, in full';

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

// ── the studio's other papers ────────────────────────────────────────────────

/**
 * Documents actually safe to show a client. The server query already scopes
 * to client_visible = true rows (RLS enforces it regardless — 00203/00252);
 * this filters defensively client-side too, as the hub did.
 */
export function visibleDocuments(documents: ClientDocument[]): ClientDocument[] {
  return documents.filter((doc) => doc.client_visible);
}

/**
 * Everything EXCEPT plan-room rows. A filed drawing's project_documents row
 * (section_key 'plan-room', 00429) is presented through the plan set above —
 * rev letter on the face, current print only — so it must not also appear as
 * an ordinary file row.
 */
export function looseDocuments(documents: ClientDocument[]): ClientDocument[] {
  return documents.filter((doc) => doc.section_key !== 'plan-room');
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
 * The word in front of a file's name. Prefers the semantic `category`
 * (contract / drawing / photo / spec — 00169) when a designer has set one;
 * falls back to the file format (`doc_type`, always populated).
 */
export function documentKindLabel(
  doc: Pick<ClientDocument, 'category' | 'doc_type'>,
): string {
  const category = doc.category?.trim();
  if (category) return humanize(category);
  return FORMAT_LABELS[doc.doc_type] ?? doc.doc_type.toUpperCase();
}

/**
 * A document's house: its own project, or — for a row anchored to a proposal
 * that was filed before activation — the project that proposal became. The
 * same resolution `groupDocumentsByProject` used.
 */
function houseOf(
  doc: ClientDocument,
  proposalProjectIds: Record<string, string | null>,
): string | null {
  return (
    doc.project_id ??
    (doc.proposal_id ? (proposalProjectIds[doc.proposal_id] ?? null) : null)
  );
}

export interface PapersRegisters {
  /** This house's files, newest first. */
  papers: ClientDocument[];
  /** Visible files no house can claim — an unactivated proposal's agreement. */
  earlier: ClientDocument[];
}

/**
 * Splits the client's visible, non-plan-room files into this house's papers
 * and the earlier ones nothing can claim. The hub kept the unclaimed rows in
 * a trailing "Earlier papers" group rather than dropping them; so does this.
 */
export function papersForProject(
  documents: ClientDocument[],
  projectId: string,
  proposalProjectIds: Record<string, string | null> = {},
): PapersRegisters {
  const newestFirst = (a: ClientDocument, b: ClientDocument) =>
    b.created_at.localeCompare(a.created_at);
  const loose = looseDocuments(visibleDocuments(documents));
  return {
    papers: loose
      .filter((doc) => houseOf(doc, proposalProjectIds) === projectId)
      .sort(newestFirst),
    earlier: loose
      .filter((doc) => houseOf(doc, proposalProjectIds) === null)
      .sort(newestFirst),
  };
}

// ── the instruments ──────────────────────────────────────────────────────────

/**
 * An executed instrument: a proposal the client has already signed. Only these
 * can be read in full — everything else is named and dated.
 */
export function isExecutedInstrument(document: ProjectDocument): boolean {
  return document.kind === 'proposal' && !!document.signed_at;
}

const KIND_WORD: Record<ProjectDocumentKind, string> = {
  proposal: 'Instrument',
  scope_change: 'Change request',
  contract: 'Contract',
  other: 'Paper',
};

/** The word in front of a paper's name. */
export function paperKindLabel(kind: ProjectDocumentKind): string {
  return KIND_WORD[kind] ?? KIND_WORD.other;
}
