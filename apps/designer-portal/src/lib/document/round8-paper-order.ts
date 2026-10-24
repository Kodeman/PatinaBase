/**
 * Round 8 (R8-02) — the project job's ten chapters, in the order the
 * continuous paper prints them. Read ONLY by the doc page's round-8 path and
 * the round-8 frame; the legacy paper keeps `PROJECT_PAPER_ORDER`
 * (document-index.ts). A module of its own so the routes that never print the
 * round-8 paper (the Desk shares document-index's chunk) carry none of it (G5).
 *
 * A chapter key is its section's DOM id and `data-index-region` root
 * (`PaperChapter`), and the key the unfold instrument folds home to
 * (`UNFOLD_HOME_CHAPTER.pieces === 'ffe'`). `region` names the legacy region a
 * chapter carries, so a jump can ask that region to unfold and the consumers
 * that speak legacy stops (margin rail, mobile bar, ladder) can be answered.
 */
import type { DocumentIndexKey } from './document-index';

export type Round8ChapterKey =
  | 'brief'
  | 'design'
  | 'cabinetry'
  | 'approvals'
  | 'schedule'
  | 'ffe'
  | 'site'
  | 'financials'
  | 'closeout'
  | 'record';

export interface Round8PaperChapter {
  key: Round8ChapterKey;
  number: string;
  label: string;
  region: DocumentIndexKey | null;
}

export const ROUND8_PAPER_ORDER: readonly Round8PaperChapter[] = [
  { key: 'brief', number: '01', label: 'Brief & agreement', region: null },
  { key: 'design', number: '02', label: 'Design', region: null },
  { key: 'cabinetry', number: '03', label: 'Cabinetry', region: null },
  { key: 'approvals', number: '04', label: 'Approvals', region: 'approvals' },
  { key: 'schedule', number: '05', label: 'Schedule', region: 'schedule' },
  { key: 'ffe', number: '06', label: 'FF&E', region: 'ffe' },
  { key: 'site', number: '07', label: 'Site & team', region: null },
  { key: 'financials', number: '08', label: 'Financials', region: 'money' },
  { key: 'closeout', number: '09', label: 'Closeout', region: 'care' },
  { key: 'record', number: '10', label: 'Record', region: 'record' },
];

export const ROUND8_INDEX_KEYS: readonly Round8ChapterKey[] =
  ROUND8_PAPER_ORDER.map((chapter) => chapter.key);

/** `PaperChapter`'s default heading id — where a contents jump lands focus. */
export function round8ChapterHeadingId(key: Round8ChapterKey): string {
  return `${key}-chapter-heading`;
}

/** The legacy region a chapter carries, or null for a round-8-only chapter. */
export function round8ChapterRegion(
  key: Round8ChapterKey | null,
): DocumentIndexKey | null {
  return ROUND8_PAPER_ORDER.find((chapter) => chapter.key === key)?.region ?? null;
}
