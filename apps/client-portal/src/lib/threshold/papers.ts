import type {
  ClientPlanSheet,
  ProjectDocument,
  ProjectDocumentKind,
} from '@patina/supabase';

/* ── THE PAPERS, SORTED ──────────────────────────────────────────────────────
   The pure half of the papers sheet. `groupClientPlanSet` and its `titleCase`
   are copied from `src/app/documents/group.ts` — the register the Documents
   hub read the shared plan set through — so the drawing set reads the same way
   inside the house as it did on its own page. The kind labels are this file's
   own: `useProjectDocuments` carries a different shape from the hub's
   `ClientDocument`, so there was nothing there to copy. ─────────────────── */

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

/**
 * An executed instrument: a proposal the client has already signed. Only these
 * can be read in full from Previously — everything else is named and dated.
 */
export function isExecutedInstrument(document: ProjectDocument): boolean {
  return document.kind === 'proposal' && !!document.signed_at;
}
