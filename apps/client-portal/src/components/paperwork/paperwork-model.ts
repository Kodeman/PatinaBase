/**
 * THE FIRM'S PAPER, IN WORDS (build/upload-door-spec.md §3).
 *
 * `resolve_paperwork_link` (00637) hands the page one row per compliance
 * document the studio HOLDS for this firm. The page owes the firm something
 * wider: one row per document type it owes, whether or not a paper for it is
 * on file, each carrying the paper word from direction.md §3.8 — Current,
 * Lapses in 30 days, Lapsed, Not on file — and, on a lapsed row, what the
 * lapse holds up.
 *
 * Every sentence this file builds is the spec's own §3 copy table, verbatim:
 *
 *   current      "{Doc type}, current."
 *   lapsing      "{Doc type}, lapses {date}."
 *   lapsed       "{Doc type}, lapsed {date}."  + "Blocks {gates}."
 *   not on file  "{Doc type} is not on file."
 *
 * No sentence tells the firm what happens if it does not upload. The block
 * printed in the row IS the notice.
 *
 * Pure — no React, no fetch, no Supabase client. The sheet renders what this
 * returns and nothing else, so the words are testable without a DOM.
 */

import {
  COMPLIANCE_BLOCK_LABELS,
  COMPLIANCE_DOC_TYPE_LABELS,
  DATED_COMPLIANCE_DOC_TYPES,
  type ComplianceBlock,
  type ComplianceDocType,
} from '@patina/supabase';

/** One element of `resolve_paperwork_link`'s `documents` array (00637). */
export interface PaperworkDocument {
  doc_type: string;
  doc_label: string | null;
  expires_on: string | null;
  blocks: string[] | null;
  state: 'current' | 'lapses_soon' | 'lapsed';
  awaiting_check: boolean;
}

/** `resolve_paperwork_link`'s whole answer. No ids, no file paths, no names. */
export interface PaperworkContext {
  studio_name: string | null;
  company_name: string | null;
  expires_at: string | null;
  documents: PaperworkDocument[];
}

export type PaperState = 'current' | 'lapses_soon' | 'lapsed' | 'not_on_file';

/**
 * The paper a studio expects of every firm — spec §3's own three, "COI, W-9,
 * licence". `studio_compliance_documents` records what the studio HOLDS; there
 * is no table of what it EXPECTS, so this list is the page's, and a type the
 * studio has never asked for is not invented into a row here.
 */
export const EXPECTED_DOC_TYPES: readonly ComplianceDocType[] = [
  'coi_gl',
  'w9',
  'license',
];

/**
 * Spec §3, the signed-waiver case: upload only. A waiver already carries wet
 * or e-signatures from whatever process produced it; this door records the
 * resulting document and never asks for a number, an issuer or a term.
 */
export const UPLOAD_ONLY_DOC_TYPES: readonly ComplianceDocType[] = [
  'lien_waiver_conditional',
  'lien_waiver_unconditional',
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A date in the studio's words: "3 April 2027". */
export function formatPaperDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return null;
  return `${Number(day)} ${monthName} ${year}`;
}

/** "site access, payment and the draw" — one gate, or three. */
export function joinWords(words: readonly string[]): string {
  const list = words.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0] as string;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** The paper's own name. An `other_named` row is called what the studio called it. */
export function documentTitle(docType: string, docLabel: string | null): string {
  if (docType === 'other_named') return docLabel?.trim() || 'Other';
  return (
    COMPLIANCE_DOC_TYPE_LABELS[docType as ComplianceDocType] ?? docType
  );
}

/** The gates a document holds, in the studio's words (00623's closed vocabulary). */
export function blockWords(blocks: readonly string[] | null | undefined): string[] {
  return (blocks ?? []).map(
    (block) => COMPLIANCE_BLOCK_LABELS[block as ComplianceBlock] ?? block,
  );
}

/** 00623 refuses a certificate, a licence or a bond with no expiry. */
export function expiryRequired(docType: string): boolean {
  return (DATED_COMPLIANCE_DOC_TYPES as readonly string[]).includes(docType);
}

export function isUploadOnly(docType: string): boolean {
  return (UPLOAD_ONLY_DOC_TYPES as readonly string[]).includes(docType);
}

/** Spec §3's copy table, one sentence per state. */
export function rowSentence(
  state: PaperState,
  title: string,
  expiresOn: string | null,
): string {
  const date = formatPaperDate(expiresOn);
  if (state === 'not_on_file') return `${title} is not on file.`;
  if (state === 'lapsed') {
    return date ? `${title}, lapsed ${date}.` : `${title}, lapsed.`;
  }
  if (state === 'lapses_soon') {
    return date ? `${title}, lapses ${date}.` : `${title}, lapses soon.`;
  }
  return `${title}, current.`;
}

/**
 * "Blocks site access, payment and the draw." Printed only where a lapse is
 * actually holding something up: a current paper blocks nothing, and a row
 * with no document has no gates to name.
 */
export function blocksSentence(
  state: PaperState,
  blocks: readonly string[] | null | undefined,
): string | null {
  if (state !== 'lapsed') return null;
  const words = blockWords(blocks);
  if (words.length === 0) return null;
  return `Blocks ${joinWords(words)}.`;
}

export interface PaperworkRow {
  /** Stable per document type; an `other_named` paper is keyed by its name. */
  key: string;
  docType: string;
  docLabel: string | null;
  title: string;
  state: PaperState;
  expiresOn: string | null;
  blocks: string[];
  /** A paper the firm has sent that the studio has not opened yet. */
  awaitingCheck: boolean;
  sentence: string;
  blocksSentence: string | null;
  uploadOnly: boolean;
  expiryRequired: boolean;
  /** Spec §3: a row with nothing on file opens its form without being asked. */
  openByDefault: boolean;
}

const STATE_RANK: Record<PaperState, number> = {
  lapsed: 0,
  not_on_file: 1,
  lapses_soon: 2,
  current: 3,
};

function groupKey(doc: { doc_type: string; doc_label: string | null }): string {
  return doc.doc_type === 'other_named'
    ? `other_named:${(doc.doc_label ?? '').trim().toLowerCase()}`
    : doc.doc_type;
}

/**
 * One row per document type, worst paper first.
 *
 * A firm can hold two live papers of one type — a verified certificate and a
 * renewal the studio has not checked yet (spec §5.4: an upload never overwrites
 * a verified document). They are one row here: the row speaks with the worse
 * paper's word, and says the renewal has been received beside it.
 *
 * AND PAPER NOBODY HAS OPENED SPEAKS NO WORD (W4 r1 QA-B1). An upload landed
 * unverified and the row read "Licence, current." straight back at the firm,
 * on the same page as "Received. <Studio> will confirm it." — the studio held
 * nothing yet. A pending paper contributes the receipt sentence and never the
 * word: the group's word comes from the paper the studio HOLDS, and a type
 * where the only paper is pending reads "not on file", which is what the
 * studio's own compliance_state() says of it (00623).
 */
export function buildPaperworkRows(context: PaperworkContext): PaperworkRow[] {
  const groups = new Map<string, PaperworkRow>();
  const pending = new Map<string, PaperworkDocument>();

  for (const doc of context.documents ?? []) {
    if (!doc?.doc_type) continue;
    const key = groupKey(doc);
    if (doc.awaiting_check === true) {
      pending.set(key, doc);
      continue;
    }
    const title = documentTitle(doc.doc_type, doc.doc_label);
    const state: PaperState = doc.state ?? 'current';
    const existing = groups.get(key);

    if (!existing || STATE_RANK[state] < STATE_RANK[existing.state]) {
      groups.set(key, {
        key,
        docType: doc.doc_type,
        docLabel: doc.doc_label,
        title,
        state,
        expiresOn: doc.expires_on ?? null,
        blocks: [...(doc.blocks ?? [])],
        awaitingCheck: existing?.awaitingCheck === true,
        sentence: rowSentence(state, title, doc.expires_on ?? null),
        blocksSentence: blocksSentence(state, doc.blocks),
        uploadOnly: isUploadOnly(doc.doc_type),
        expiryRequired: expiryRequired(doc.doc_type),
        openByDefault: false,
      });
    }
  }

  // The receipt rides on whatever row the type already has, and makes its own
  // when the pending paper is the only one of its kind.
  for (const [key, doc] of pending) {
    const existing = groups.get(key);
    if (existing) {
      existing.awaitingCheck = true;
      continue;
    }
    const title = documentTitle(doc.doc_type, doc.doc_label);
    groups.set(key, {
      key,
      docType: doc.doc_type,
      docLabel: doc.doc_label,
      title,
      state: 'not_on_file',
      expiresOn: null,
      blocks: [],
      awaitingCheck: true,
      sentence: rowSentence('not_on_file', title, null),
      blocksSentence: null,
      uploadOnly: isUploadOnly(doc.doc_type),
      expiryRequired: expiryRequired(doc.doc_type),
      // Something HAS been sent, so the form does not open itself at her.
      openByDefault: false,
    });
  }

  for (const docType of EXPECTED_DOC_TYPES) {
    if (groups.has(docType)) continue;
    const title = documentTitle(docType, null);
    groups.set(docType, {
      key: docType,
      docType,
      docLabel: null,
      title,
      state: 'not_on_file',
      expiresOn: null,
      blocks: [],
      awaitingCheck: false,
      sentence: rowSentence('not_on_file', title, null),
      blocksSentence: null,
      uploadOnly: isUploadOnly(docType),
      expiryRequired: expiryRequired(docType),
      openByDefault: true,
    });
  }

  return [...groups.values()].sort((a, b) => {
    const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
    return rank !== 0 ? rank : a.title.localeCompare(b.title);
  });
}
