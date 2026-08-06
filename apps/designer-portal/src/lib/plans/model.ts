/**
 * The Plan Room's pure model — parsing, proposing, and reading the log.
 *
 * PURE: no I/O, no React, no pdf libraries, no Supabase client. Everything the
 * Light Table decides before a byte is uploaded lives here, and everything the
 * drawing log says is READ OFF the bundle — no holder line, no "last sent", no
 * revision letter is ever typed by a designer or carried on a filename.
 *
 * Coordinate convention: TextItemLite x/y are normalized 0..1 with the ORIGIN
 * AT THE TOP-LEFT — y 0 is the top edge, y 1 the bottom. pdf.ts converts pdfjs'
 * bottom-left origin on the way in, so "the title block is bottom-right" reads
 * as y >= 0.75 && x >= 0.70 here.
 */

import type {
  FilePlanPrintEntry,
  PlanRoomBundle,
  PrintUploadInput,
} from '@patina/supabase';

// ── Types ───────────────────────────────────────────────────────────────────

/** One text run off a page, normalized. */
export interface TextItemLite {
  str: string;
  x: number;
  y: number;
}

/** A sheet already in the room, as much of it as the model needs. */
export interface KnownSheet {
  id: string;
  sheet_number: string;
  title: string;
  discipline?: string | null;
}

/** A staged page, after pdf.ts has read its text layer. */
export interface StagedPage {
  pageIndex: number;
  items: TextItemLite[];
  /** The page's raw text layer, joined. */
  text: string;
  /** sha256 of `normalizeTextLayer(text)` — null when the page carries no text. */
  textSha256: string | null;
}

export type ProposalKind =
  | 'confirm_current'
  | 'revision'
  | 'new_sheet'
  | 'unmatched';

export type ProposalFork = 'revision' | 'new_sheet' | 'confirm_current';

/** One card on the Light Table. */
export interface LightTableProposal {
  pageIndex: number;
  /** What the page's own ink said, normalized — null when nothing parsed. */
  parsedNumber: string | null;
  textSha256: string | null;
  kind: ProposalKind;
  /** The sheet this page lands on, when there is one. */
  sheetId: string | null;
  /** The number this page will carry once filed. */
  sheetNumber: string | null;
  sheetTitle: string | null;
  discipline: string | null;
  /** Set when the parse is one confusable character off a sheet we hold. */
  nearMiss: { parsed: string; canonical: string } | null;
  /** The answered fork. Pre-answered except on a near miss. */
  fork: ProposalFork | null;
  /** A card with an open fork is unresolved until the designer answers it. */
  requiresFork: boolean;
}

export interface ConfirmSummary {
  sentence: string;
  fileCount: number;
  newCount: number;
  revisionCount: number;
  confirmCount: number;
  looseCount: number;
  /** Every card that needs a fork has one. */
  ready: boolean;
}

export interface CurrentSetRow {
  sheetId: string;
  sheetNumber: string;
  title: string;
  discipline: string | null;
  state: string;
  revLetter: string | null;
  currentPrintId: string | null;
  filedAt: string | null;
}

export interface HeldSheet {
  sheetId: string;
  sheetNumber: string;
  heldRev: string;
  currentRev: string;
  behind: boolean;
}

export interface HolderLine {
  /** party_id when the recipient came off the roster, else the folded name. */
  partyKey: string;
  partyDisplayName: string;
  partyCompany: string | null;
  purpose: string;
  sentAt: string;
  issueId: string;
  issueName: string;
  holds: HeldSheet[];
  behindCount: number;
  /** The sheets they are behind on, lowest number first. */
  behindNumbers: string[];
  /** The revision they hold on the sheets they are behind on. */
  behindRev: string | null;
  /** The revision those sheets are actually at now. */
  currentRev: string | null;
}

export type DrawingLogEvent = 'filed' | 'flipped' | 'issued' | 'transmitted';

export interface DrawingLogRow {
  key: string;
  at: string;
  event: DrawingLogEvent;
  what: string;
  who: string | null;
}

// ── Sheet numbers ───────────────────────────────────────────────────────────

/**
 * A sheet number as drawings actually write it: a 1–3 letter discipline
 * prefix, an optional separator, then a numeric run with an optional decimal
 * leg — ID-401, A-101, "ID 401", EL-1.02, ID401.
 *
 * The numeric run deliberately admits O, I and l as well as digits. A plotter's
 * font renders them nearly identically, and a text layer that says `ID-4O2` has
 * to PARSE before nearMissMatch can offer to read it as ID-402 — a stricter
 * regex would silently drop the very page the near-miss fork exists for. A run
 * with no real digit in it is rejected below, so an English word never becomes
 * a sheet number.
 */
export const SHEET_NUMBER_RE =
  /\b([A-Za-z]{1,3})[ .\-‐‑‒–—]?([0-9OIl]{1,3}(?:\.[0-9OIl]{1,2})?)\b/;

const ANCHORED_SHEET_NUMBER =
  /^([A-Za-z]{1,3})[ .\-‐‑‒–—]?([0-9OIl]{1,3}(?:\.[0-9OIl]{1,2})?)$/;

const hasDigit = (value: string) => /[0-9]/.test(value);

/** `ID 401` / `id401` / `ID–401` all fold to the one canonical `ID-401`. */
export function normalizeSheetNumber(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const match = ANCHORED_SHEET_NUMBER.exec(raw.trim());
  if (!match || !hasDigit(match[2])) return null;
  return `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
}

/**
 * The page's own opinion of its sheet number. Every regex hit is a candidate;
 * position decides between them, because a drawing writes its number small in
 * the title block and large nowhere else.
 *
 * A candidate scores 1, +2 in the bottom quarter, +2 in the right third, and +1
 * inside the densest text cluster on the page — the title block is the one
 * place on a sheet where text crowds together.
 */
export function scoreSheetNumberCandidates(
  items: TextItemLite[],
): string | null {
  if (items.length === 0) return null;

  // Densest cell of a 4×4 grid — the "larger text cluster".
  const cellOf = (item: TextItemLite) =>
    `${Math.min(3, Math.max(0, Math.floor(item.x * 4)))}:${Math.min(3, Math.max(0, Math.floor(item.y * 4)))}`;
  const density = new Map<string, number>();
  for (const item of items) {
    const cell = cellOf(item);
    density.set(cell, (density.get(cell) ?? 0) + 1);
  }
  let densest: string | null = null;
  let densestCount = 0;
  for (const [cell, count] of density) {
    if (count > densestCount) {
      densest = cell;
      densestCount = count;
    }
  }

  const scored = new Map<string, number>();
  const scan = new RegExp(SHEET_NUMBER_RE.source, 'g');
  for (const item of items) {
    scan.lastIndex = 0;
    let hit: RegExpExecArray | null;
    while ((hit = scan.exec(item.str)) !== null) {
      // A drawing sets its discipline code in caps. Requiring that here is what
      // keeps "Sheet 1 of 7" from proposing a sheet called OF-7.
      if (hit[1] !== hit[1].toUpperCase()) continue;
      const canonical = normalizeSheetNumber(`${hit[1]}-${hit[2]}`);
      if (!canonical) continue;
      let score = 1;
      if (item.y >= 0.75) score += 2;
      if (item.x >= 0.7) score += 2;
      if (densest !== null && cellOf(item) === densest) score += 1;
      scored.set(canonical, Math.max(scored.get(canonical) ?? 0, score));
    }
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const [canonical, score] of scored) {
    if (score > bestScore) {
      best = canonical;
      bestScore = score;
    }
  }
  return best;
}

/** Characters a plotter's font and a human eye trade for one another. */
const CONFUSABLE_CLASS: Record<string, string> = {
  O: 'o0',
  '0': 'o0',
  I: 'i1',
  L: 'i1',
  '1': 'i1',
};

/**
 * A parse that is ONE confusable substitution away from a number we already
 * hold — `ID-4O2` against `ID-402`. Returns the sheet number it probably meant,
 * or null. Never guesses across two characters; a set that far off is a
 * different sheet.
 */
export function nearMissMatch(
  parsed: string | null | undefined,
  existingNumbers: string[],
): { canonical: string } | null {
  const candidate = normalizeSheetNumber(parsed) ?? parsed?.trim().toUpperCase();
  if (!candidate) return null;

  for (const raw of existingNumbers) {
    const existing = normalizeSheetNumber(raw) ?? raw.trim().toUpperCase();
    if (!existing || existing === candidate) continue;
    if (existing.length !== candidate.length) continue;

    let differences = 0;
    let confusable = true;
    for (let index = 0; index < existing.length; index += 1) {
      const a = candidate[index].toUpperCase();
      const b = existing[index].toUpperCase();
      if (a === b) continue;
      differences += 1;
      if (differences > 1) {
        confusable = false;
        break;
      }
      const classA = CONFUSABLE_CLASS[a];
      const classB = CONFUSABLE_CLASS[b];
      if (!classA || classA !== classB) {
        confusable = false;
        break;
      }
    }
    if (confusable && differences === 1) return { canonical: existing };
  }
  return null;
}

/**
 * The title beside the number. A plotted title block usually sets both in one
 * run ("ID-401 Millwork Elevations — Study"), so the anchor run is stripped
 * first; failing that, the nearest wordy run to it wins.
 */
export function guessSheetTitle(
  items: TextItemLite[],
  number: string | null,
): string | null {
  if (!number) return null;
  const bareNumber = number.replace(/[^A-Za-z0-9.]/g, '');
  const carries = (value: string) =>
    value.replace(/[^A-Za-z0-9.]/g, '').toUpperCase().includes(bareNumber.toUpperCase());

  const anchor = items.find((item) => carries(item.str));
  if (!anchor) return null;

  const stripped = anchor.str
    .replace(new RegExp(SHEET_NUMBER_RE.source), ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-–—:·|]+\s*/, '')
    .trim();
  if (countLetters(stripped) >= 3) return stripped;

  const others = items
    .filter((item) => item !== anchor && countLetters(item.str) >= 3)
    .filter((item) => !carries(item.str))
    .map((item) => ({
      item,
      distance: Math.hypot(item.x - anchor.x, item.y - anchor.y),
    }))
    .sort((a, b) => a.distance - b.distance);
  const nearest = others[0]?.item.str.replace(/\s+/g, ' ').trim();
  return nearest && nearest.length > 0 ? nearest : null;
}

function countLetters(value: string): number {
  let letters = 0;
  for (const character of value) {
    if (/[A-Za-z]/.test(character)) letters += 1;
  }
  return letters;
}

/** The text layer, folded so two plots of the same drawing hash alike. */
export function normalizeTextLayer(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toUpperCase();
}

// ── Proposals ───────────────────────────────────────────────────────────────

/**
 * What the Light Table proposes for each staged page. It ERRS TOWARD REVISION:
 * when a page looks like a sheet we already hold, the proposal is a new
 * revision of it, never a second sheet wearing the same number.
 *
 *   text_sha256 equal to the sheet's current print → confirm_current
 *   number matches, text differs                   → revision
 *   one confusable character off a held number      → revision, fork open
 *   number parsed but unknown                       → new sheet
 *   no number at all                                → unmatched (a loose page)
 */
export function proposeMatches(
  pages: StagedPage[],
  sheets: KnownSheet[],
  currentPrintTextShaBySheet: Record<string, string | null>,
): LightTableProposal[] {
  const bySheetNumber = new Map<string, KnownSheet>();
  for (const sheet of sheets) {
    const canonical =
      normalizeSheetNumber(sheet.sheet_number) ??
      sheet.sheet_number.trim().toUpperCase();
    bySheetNumber.set(canonical, sheet);
  }
  const existingNumbers = [...bySheetNumber.keys()];

  return pages.map((page): LightTableProposal => {
    const parsedNumber = scoreSheetNumberCandidates(page.items);
    const base = {
      pageIndex: page.pageIndex,
      parsedNumber,
      textSha256: page.textSha256,
    };

    if (!parsedNumber) {
      return {
        ...base,
        kind: 'unmatched',
        sheetId: null,
        sheetNumber: null,
        sheetTitle: guessSheetTitle(page.items, null),
        discipline: null,
        nearMiss: null,
        fork: null,
        requiresFork: false,
      };
    }

    const exact = bySheetNumber.get(parsedNumber);
    if (exact) {
      const filedTextSha = currentPrintTextShaBySheet[exact.id] ?? null;
      const identical =
        page.textSha256 != null &&
        filedTextSha != null &&
        page.textSha256 === filedTextSha;
      return {
        ...base,
        kind: identical ? 'confirm_current' : 'revision',
        sheetId: exact.id,
        sheetNumber: exact.sheet_number,
        sheetTitle: exact.title,
        discipline: exact.discipline ?? null,
        nearMiss: null,
        fork: identical ? 'confirm_current' : 'revision',
        requiresFork: false,
      };
    }

    const near = nearMissMatch(parsedNumber, existingNumbers);
    if (near) {
      const sheet = bySheetNumber.get(near.canonical)!;
      return {
        ...base,
        // Pre-forked toward revision — the safe reading of an ambiguous parse.
        kind: 'revision',
        sheetId: sheet.id,
        sheetNumber: sheet.sheet_number,
        sheetTitle: sheet.title,
        discipline: sheet.discipline ?? null,
        nearMiss: { parsed: parsedNumber, canonical: near.canonical },
        fork: null,
        requiresFork: true,
      };
    }

    return {
      ...base,
      kind: 'new_sheet',
      sheetId: null,
      sheetNumber: parsedNumber,
      sheetTitle: guessSheetTitle(page.items, parsedNumber),
      discipline: parsedNumber.split('-')[0] ?? null,
      nearMiss: null,
      fork: 'new_sheet',
      requiresFork: false,
    };
  });
}

/**
 * The next revision letter for display only. Letters come from the ledger's
 * count of prints, NEVER from a filename — `_FINAL2` is not a revision.
 */
export function previewRevLetter(currentRev: string | null | undefined): string {
  const current = (currentRev ?? '').trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(current)) return 'A';
  if (current === 'ZZ') return 'ZZ';
  if (current.length === 1) {
    return current === 'Z' ? 'AA' : String.fromCharCode(current.charCodeAt(0) + 1);
  }
  const [first, second] = current;
  if (second !== 'Z') return `${first}${String.fromCharCode(second.charCodeAt(0) + 1)}`;
  return `${String.fromCharCode(first.charCodeAt(0) + 1)}A`;
}

/** The one honest sentence the confirm strip states before it writes. */
export function confirmSummary(
  proposals: LightTableProposal[],
): ConfirmSummary {
  const filed = proposals.filter((proposal) => proposal.kind !== 'unmatched');
  const newCount = filed.filter((proposal) => proposal.kind === 'new_sheet').length;
  const revisionCount = filed.filter((proposal) => proposal.kind === 'revision').length;
  const confirmCount = filed.filter(
    (proposal) => proposal.kind === 'confirm_current',
  ).length;
  const looseCount = proposals.filter(
    (proposal) => proposal.kind === 'unmatched',
  ).length;
  const fileCount = filed.length;

  const clauses = [`File ${fileCount} ${fileCount === 1 ? 'sheet' : 'sheets'}`];
  if (newCount > 0) {
    clauses.push(`${newCount} new ${newCount === 1 ? 'sheet' : 'sheets'}`);
  }
  if (revisionCount > 0) {
    clauses.push(
      `${revisionCount} ${revisionCount === 1 ? 'pointer moves' : 'pointers move'}`,
    );
  }
  if (confirmCount > 0) clauses.push(`${confirmCount} confirmed current`);
  if (looseCount > 0) {
    clauses.push(`${looseCount} loose ${looseCount === 1 ? 'page' : 'pages'}`);
  }
  clauses.push('one transaction');

  // A card is resolved when its fork is answered AND it carries what the RPC
  // needs: a new sheet needs a number, everything else needs the sheet it lands
  // on. An unresolved card shuts the primary — no partial filing.
  const resolved = (proposal: LightTableProposal) => {
    if (proposal.requiresFork && proposal.fork == null) return false;
    const kind = proposal.fork ?? proposal.kind;
    if (kind === 'new_sheet') return Boolean(proposal.sheetNumber?.trim());
    return Boolean(proposal.sheetId);
  };

  return {
    sentence: clauses.join(' · '),
    fileCount,
    newCount,
    revisionCount,
    confirmCount,
    looseCount,
    ready: fileCount > 0 && filed.every(resolved),
  };
}

/**
 * The RPC payload. Only resolved, uploaded cards make it in — a loose page goes
 * to the Folio on its own leg and never appears here.
 */
export function planFileEntries(
  proposals: LightTableProposal[],
  uploads: Record<number, PrintUploadInput>,
): FilePlanPrintEntry[] {
  const entries: FilePlanPrintEntry[] = [];
  for (const proposal of proposals) {
    if (proposal.kind === 'unmatched') continue;
    if (proposal.requiresFork && proposal.fork == null) continue;
    const resolved = proposal.fork ?? proposal.kind;

    if (resolved === 'confirm_current') {
      if (!proposal.sheetId) continue;
      entries.push({ kind: 'confirm_current', sheet_id: proposal.sheetId });
      continue;
    }

    const print = uploads[proposal.pageIndex];
    if (!print) continue;

    if (resolved === 'revision') {
      if (!proposal.sheetId) continue;
      entries.push({ kind: 'revision', sheet_id: proposal.sheetId, print });
      continue;
    }

    if (!proposal.sheetNumber) continue;
    entries.push({
      kind: 'new_sheet',
      sheet: {
        number: proposal.sheetNumber,
        title: proposal.sheetTitle?.trim() || proposal.sheetNumber,
        discipline: proposal.discipline ?? null,
      },
      print,
    });
  }
  return entries;
}

// ── Reading the room ────────────────────────────────────────────────────────

function printsById(bundle: PlanRoomBundle) {
  return new Map(bundle.prints.map((print) => [print.id, print]));
}

/** Every sheet with the revision it currently IS, lowest number first. */
export function deriveCurrentSet(bundle: PlanRoomBundle): CurrentSetRow[] {
  const prints = printsById(bundle);
  return bundle.sheets
    .map((sheet): CurrentSetRow => {
      const print = sheet.current_print_id
        ? prints.get(sheet.current_print_id)
        : undefined;
      return {
        sheetId: sheet.id,
        sheetNumber: sheet.sheet_number,
        title: sheet.title,
        discipline: sheet.discipline ?? null,
        state: sheet.state,
        revLetter: print?.rev_letter ?? null,
        currentPrintId: print?.id ?? null,
        filedAt: print?.created_at ?? null,
      };
    })
    .sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber));
}

function currentRevBySheet(bundle: PlanRoomBundle): Map<string, string> {
  const prints = printsById(bundle);
  const map = new Map<string, string>();
  for (const sheet of bundle.sheets) {
    const print = sheet.current_print_id ? prints.get(sheet.current_print_id) : undefined;
    if (print) map.set(sheet.id, print.rev_letter);
  }
  return map;
}

/**
 * Who holds what. Read entirely off transmittals: a party holds the revisions
 * recorded in the LAST issue they were sent, and nothing they were never sent.
 * No holder line is ever typed.
 */
export function deriveHolders(bundle: PlanRoomBundle): HolderLine[] {
  const current = currentRevBySheet(bundle);
  const issuesById = new Map(bundle.issues.map((issue) => [issue.id, issue]));

  const latest = new Map<string, PlanRoomBundle['transmittals'][number]>();
  for (const transmittal of bundle.transmittals) {
    const key =
      transmittal.party_id ?? transmittal.party_display_name.trim().toLowerCase();
    const held = latest.get(key);
    if (
      !held ||
      transmittal.sent_at > held.sent_at ||
      (transmittal.sent_at === held.sent_at && transmittal.id > held.id)
    ) {
      latest.set(key, transmittal);
    }
  }

  const lines: HolderLine[] = [];
  for (const [partyKey, transmittal] of latest) {
    const snapshot = bundle.issuePrints.filter(
      (issuePrint) => issuePrint.issue_id === transmittal.issue_id,
    );
    const holds: HeldSheet[] = snapshot
      .filter((issuePrint) => current.has(issuePrint.sheet_id))
      .map((issuePrint) => {
        const currentRev = current.get(issuePrint.sheet_id)!;
        return {
          sheetId: issuePrint.sheet_id,
          sheetNumber: issuePrint.sheet_number,
          heldRev: issuePrint.rev_letter,
          currentRev,
          behind: issuePrint.rev_letter !== currentRev,
        };
      })
      .sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber));

    const behind = holds.filter((sheet) => sheet.behind);
    lines.push({
      partyKey,
      partyDisplayName: transmittal.party_display_name,
      partyCompany: transmittal.party_company,
      purpose: transmittal.purpose,
      sentAt: transmittal.sent_at,
      issueId: transmittal.issue_id,
      issueName: issuesById.get(transmittal.issue_id)?.name ?? '',
      holds,
      behindCount: behind.length,
      behindNumbers: behind.map((sheet) => sheet.sheetNumber),
      behindRev: behind[0]?.heldRev ?? null,
      currentRev: behind[0]?.currentRev ?? null,
    });
  }

  return lines.sort((a, b) => a.partyDisplayName.localeCompare(b.partyDisplayName));
}

/** The drawing log — every event this room has had, oldest first. */
export function deriveDrawingLog(bundle: PlanRoomBundle): DrawingLogRow[] {
  const sheetNumbers = new Map(
    bundle.sheets.map((sheet) => [sheet.id, sheet.sheet_number]),
  );
  const issuesById = new Map(bundle.issues.map((issue) => [issue.id, issue]));
  const openedByTransmittal = new Map<string, string | null>();
  for (const token of bundle.tokens) {
    const known = openedByTransmittal.get(token.transmittal_id);
    if (known == null) {
      openedByTransmittal.set(token.transmittal_id, token.first_opened_at);
    }
  }

  const rows: DrawingLogRow[] = [];

  for (const batch of bundle.batches) {
    const confirmed = batch.confirmed_sheet_ids.length;
    const newPrints = Math.max(0, batch.item_count - confirmed);
    const parts = [
      `${batch.item_count} ${batch.item_count === 1 ? 'sheet' : 'sheets'} filed`,
      `${newPrints} new ${newPrints === 1 ? 'print' : 'prints'}, ${confirmed} confirmed current`,
    ];
    if (batch.created_sheet_ids.length > 0) {
      parts.push(
        `${batch.created_sheet_ids.length} new ${batch.created_sheet_ids.length === 1 ? 'sheet' : 'sheets'}`,
      );
    }
    if (batch.source_filename) parts.push(batch.source_filename);
    rows.push({
      key: `filed:${batch.id}`,
      at: batch.created_at,
      event: 'filed',
      what: parts.join(' · '),
      who: null,
    });

    if (batch.flipped_sheet_ids.length > 0) {
      const flippedPrints = bundle.prints.filter(
        (print) =>
          print.batch_id === batch.id &&
          batch.flipped_sheet_ids.includes(print.sheet_id),
      );
      const numbers = batch.flipped_sheet_ids
        .map((sheetId) => sheetNumbers.get(sheetId) ?? sheetId)
        .sort((a, b) => a.localeCompare(b));
      const rev = flippedPrints[0]?.rev_letter;
      rows.push({
        key: `flipped:${batch.id}`,
        at: batch.created_at,
        event: 'flipped',
        what: rev
          ? `${numbers.join(', ')} flipped to Rev ${rev}`
          : `${numbers.join(', ')} flipped`,
        who: null,
      });
    }
  }

  for (const issue of bundle.issues) {
    rows.push({
      key: `issued:${issue.id}`,
      at: issue.issued_at,
      event: 'issued',
      what: `${issue.name} · ${issue.sheet_count} ${issue.sheet_count === 1 ? 'sheet' : 'sheets'}`,
      who: null,
    });
  }

  for (const transmittal of bundle.transmittals) {
    const issueName = issuesById.get(transmittal.issue_id)?.name ?? 'the set';
    const opened = openedByTransmittal.get(transmittal.id) ?? null;
    rows.push({
      key: `transmitted:${transmittal.id}`,
      at: transmittal.sent_at,
      event: 'transmitted',
      what: `${issueName} · for ${transmittal.purpose}${opened ? ' · opened' : ' · not opened yet'}`,
      who: [transmittal.party_display_name, transmittal.party_company]
        .filter(Boolean)
        .join(' · '),
    });
  }

  return rows.sort((a, b) => (a.at === b.at ? a.key.localeCompare(b.key) : a.at.localeCompare(b.at)));
}

/**
 * Sheets whose current print is not the one the last issue carried — the rows
 * the issue ceremony marks in golden hour.
 */
export function changedSinceLastIssue(bundle: PlanRoomBundle): Set<string> {
  const changed = new Set<string>();
  const prints = printsById(bundle);

  const lastIssue = [...bundle.issues].sort((a, b) =>
    a.issued_at === b.issued_at
      ? b.issue_number - a.issue_number
      : b.issued_at.localeCompare(a.issued_at),
  )[0];
  if (!lastIssue) return changed;

  const snapshot = new Map(
    bundle.issuePrints
      .filter((issuePrint) => issuePrint.issue_id === lastIssue.id)
      .map((issuePrint) => [issuePrint.sheet_id, issuePrint.sha256]),
  );

  for (const sheet of bundle.sheets) {
    const print = sheet.current_print_id ? prints.get(sheet.current_print_id) : undefined;
    if (!print) continue;
    const issued = snapshot.get(sheet.id);
    if (issued == null || issued !== print.sha256) changed.add(sheet.id);
  }
  return changed;
}
