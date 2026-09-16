/**
 * THE FIRM'S PAPER, IN WORDS (build/upload-door-spec.md §3).
 *
 * `resolve_paperwork_link` (00637) hands the page one row per compliance
 * document TYPE the studio holds paper for (R-BU). The page owes the firm
 * something wider: a row for every type it owes, whether or not a paper for it
 * is on file, each carrying the paper word from direction.md §3.8 — Current,
 * Lapses in 30 days, Lapsed, Not on file — and, on a lapsed row, what the
 * lapse holds up.
 *
 * Every sentence this file builds is the spec's own §3 copy table, verbatim:
 *
 *   current        "{Doc type}, current."
 *   lapsing        "{Doc type}, lapses {date}."
 *   lapsed         "{Doc type}, lapsed {date}."  + "Blocks {gates}."
 *   not on file    "{Doc type} is not on file."
 *   awaiting check "{Doc type}, not yet checked."  + the receipt sentence
 *   refused        "{Doc type} was not accepted."  + the studio's own reason
 *
 * The last two are spec §3 amendments (R-BU, W4 r7 M-4): "current" is reserved
 * for paper a studio member has confirmed, and a refusal reaches the firm on
 * the firm's own page, because nothing else carries it there.
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

/**
 * One element of `resolve_paperwork_link`'s `documents` array (00637). ONE PER
 * DOCUMENT TYPE since R-BU, with the state the studio's own book would say:
 * `current` only for paper a member has confirmed, `awaiting_check` when the
 * only paper of that type is an upload nobody has opened, and `refused` — with
 * the studio's reason — when a refusal is the last word on the type.
 */
export interface PaperworkDocument {
  doc_type: string;
  doc_label: string | null;
  expires_on: string | null;
  blocks: string[] | null;
  state: 'current' | 'lapses_soon' | 'lapsed' | 'awaiting_check' | 'refused';
  awaiting_check: boolean;
  /** The studio's own words, printed to the firm. Null unless state is refused. */
  refusal_reason?: string | null;
}

/** `resolve_paperwork_link`'s whole answer. No ids, no file paths, no names. */
export interface PaperworkContext {
  studio_name: string | null;
  company_name: string | null;
  expires_at: string | null;
  documents: PaperworkDocument[];
}

export type PaperState =
  | 'current'
  | 'lapses_soon'
  | 'lapsed'
  | 'not_on_file'
  | 'awaiting_check'
  | 'refused';

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

/**
 * Spec §3's copy table, one sentence per state.
 *
 * `awaiting_check` and `refused` are the two states added with R-BU and W4 r7
 * M-4. Both exist because the firm was reading one thing while the studio's
 * book said another: an unchecked upload read "current" (or, one line above
 * its own receipt, "is not on file"), and a refused paper simply vanished back
 * into "is not on file" with the reason reaching nobody.
 */
export function rowSentence(
  state: PaperState,
  title: string,
  expiresOn: string | null,
): string {
  const date = formatPaperDate(expiresOn);
  if (state === 'not_on_file') return `${title} is not on file.`;
  if (state === 'awaiting_check') return `${title}, not yet checked.`;
  if (state === 'refused') return `${title} was not accepted.`;
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

/**
 * The refusal, in the studio's own words. The reject act tells the studio
 * member plainly that "the firm reads this", and 00637 refuses a refusal with
 * no words in it, so the reason always exists and always travels (W4 r7 M-4).
 * Printed as its own sentence; a reason typed without a full stop gets one.
 */
export function reasonSentence(
  state: PaperState,
  reason: string | null | undefined,
): string | null {
  if (state !== 'refused') return null;
  const words = reason?.trim();
  if (!words) return null;
  return /[.!?]$/.test(words) ? words : `${words}.`;
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
  /** The studio's own words for a refusal, printed to the firm (W4 r7 M-4). */
  reasonSentence: string | null;
  uploadOnly: boolean;
  expiryRequired: boolean;
  /** Spec §3: a row with nothing on file opens its form without being asked. */
  openByDefault: boolean;
}

const STATE_RANK: Record<PaperState, number> = {
  lapsed: 0,
  refused: 1,
  not_on_file: 2,
  awaiting_check: 3,
  lapses_soon: 4,
  current: 5,
};

function groupKey(doc: { doc_type: string; doc_label: string | null }): string {
  return doc.doc_type === 'other_named'
    ? `other_named:${(doc.doc_label ?? '').trim().toLowerCase()}`
    : doc.doc_type;
}

/**
 * One row per document type, worst paper first.
 *
 * `resolve_paperwork_link` now groups by type itself (R-BU), so this reduces
 * what it is handed rather than deriving the word: the state on the row IS the
 * word the studio's own book would say. The reduction is kept because the page
 * must never print two rows for one type whatever the read returns, and
 * because the expected-type list below is the page's, not the database's.
 *
 * PAPER NOBODY HAS OPENED SPEAKS NO WORD (W4 r1 QA-B1, R-BU). An upload landed
 * unverified and the row read "Licence, current." straight back at the firm,
 * on the same page as "Received. <Studio> will confirm it." Then it read
 * "Licence is not on file." beside the same receipt — a second disagreement
 * about the same paper (W4 r7 MAJOR-2). It now reads "Licence, not yet
 * checked.", which is what compliance_state() says of it on the studio side.
 *
 * A REFUSED PAPER KEEPS ITS PLACE AND ITS REASON (W4 r7 M-4): the firm is told
 * the document came back and why, in the studio's words, instead of watching
 * its receipt silently revert to "is not on file".
 */
/**
 * THE ROW THE FIRM JUST SENT PAPER FOR, READ AS THE STUDIO WILL READ IT (R-BU,
 * W4 r8 MAJOR-1 / QA F1).
 *
 * `buildPaperworkRows` reads the server's answer, and nothing on this page
 * re-reads it: the visit in which the firm actually acts is the visit the page
 * never refreshes. So a successful send printed its receipt under the row's
 * pre-send sentence — "W-9 is not on file." over "Received. {Studio} will
 * confirm it." — two sentences about one document, one line apart, disagreeing.
 *
 * This is R-BU applied to that visit, so the page says now exactly what the
 * next load will say:
 *   nothing on file  -> the row becomes `awaiting_check`, "W-9, not yet
 *                       checked.", and the block it used to name goes with the
 *                       sentence that named it;
 *   paper on file    -> the confirmed paper is still the row (R-BU: the
 *                       verified row is the row, `awaiting_check` is its flag),
 *                       so "Licence, lapsed 1 May." and what it blocks both
 *                       stand — they are still true until a member opens the
 *                       new paper;
 *   refused          -> untouched. The refusal is the whole word on that row
 *                       (W4 r7 M-4) and the form stays open.
 */
export function receivedReading(row: PaperworkRow): PaperworkRow {
  if (row.state === 'refused') return row;
  if (row.state !== 'not_on_file') return { ...row, awaitingCheck: true };
  return {
    ...row,
    state: 'awaiting_check',
    awaitingCheck: true,
    sentence: rowSentence('awaiting_check', row.title, null),
    blocksSentence: null,
    openByDefault: false,
  };
}

export function buildPaperworkRows(context: PaperworkContext): PaperworkRow[] {
  const groups = new Map<string, PaperworkRow>();

  for (const doc of context.documents ?? []) {
    if (!doc?.doc_type) continue;
    const key = groupKey(doc);
    const title = documentTitle(doc.doc_type, doc.doc_label);
    const state: PaperState = doc.state ?? 'current';
    const awaitingCheck = doc.awaiting_check === true || state === 'awaiting_check';
    const existing = groups.get(key);

    if (existing && STATE_RANK[existing.state] <= STATE_RANK[state]) {
      // A worse word already speaks for this type; the receipt still rides.
      existing.awaitingCheck = existing.awaitingCheck || awaitingCheck;
      continue;
    }

    groups.set(key, {
      key,
      docType: doc.doc_type,
      docLabel: doc.doc_label,
      title,
      state,
      expiresOn: doc.expires_on ?? null,
      blocks: [...(doc.blocks ?? [])],
      awaitingCheck: awaitingCheck || existing?.awaitingCheck === true,
      sentence: rowSentence(state, title, doc.expires_on ?? null),
      blocksSentence: blocksSentence(state, doc.blocks),
      reasonSentence: reasonSentence(state, doc.refusal_reason ?? null),
      uploadOnly: isUploadOnly(doc.doc_type),
      expiryRequired: expiryRequired(doc.doc_type),
      // Something has been sent and is waiting, so the form does not open
      // itself at her; a refusal is the one state that asks for paper again.
      openByDefault: state === 'refused',
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
      reasonSentence: null,
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
