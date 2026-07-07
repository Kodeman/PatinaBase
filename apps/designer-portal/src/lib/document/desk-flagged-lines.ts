/**
 * Desk flagged-lines input (Schedule & Boards Wave 2 · C4).
 *
 * The client-verdict analogue of desk-conflicts.ts: folds the designer's
 * UNRESOLVED per-line rejections (item_feedback verdict='rejected', resolved_at
 * IS NULL) into a per-proposal count so the Desk can raise "N lines flagged on
 * {doc}" as a needs-your-hand folder. A flag is the client asking for a change —
 * the act (respond / resolve / revise) is the designer's, so it earns a folder.
 *
 * Pure presentation logic; the query + flatten lives in use-desk-engagements
 * (the Wave 2.1 precedent — conflicts and receivables do the same). Keyed by
 * proposal_id: that is how a proposal engagement addresses itself on the Desk
 * (a proposal-stage DocumentStateRow carries proposal_id, project_id null).
 */

/** One unresolved-rejection row, flattened from the item_feedback join. */
export interface FlaggedLineRow {
  /** The proposal the flagged line belongs to (proposal_items.proposal_id). */
  proposalId: string;
  /** The proposal's title (proposals.title) — the doc name in the need line. */
  proposalTitle: string | null;
}

/** Per-proposal Desk input: how many lines the client has flagged and not-yet
 *  resolved, plus the doc title for the need line. Structurally the same shape
 *  desk-derivation reads as `DeskFlaggedSignal` (kept separate so that module
 *  stays dependency-free — the desk-conflicts precedent). */
export interface DeskFlaggedLines {
  count: number;
  docTitle: string;
  proposalId: string;
}

/** The fallback doc name when a proposal carries no title. */
const UNTITLED = 'the proposal';

/** Fold flagged-line rows into a per-proposal map. */
export function buildDeskFlaggedLines(
  rows: FlaggedLineRow[],
): Map<string, DeskFlaggedLines> {
  const map = new Map<string, DeskFlaggedLines>();
  for (const row of rows) {
    if (!row.proposalId) continue;
    const existing = map.get(row.proposalId);
    if (existing) {
      existing.count += 1;
      // Backfill a real title if the first row we saw had none.
      if (existing.docTitle === UNTITLED && row.proposalTitle?.trim()) {
        existing.docTitle = row.proposalTitle.trim();
      }
    } else {
      map.set(row.proposalId, {
        count: 1,
        docTitle: row.proposalTitle?.trim() || UNTITLED,
        proposalId: row.proposalId,
      });
    }
  }
  return map;
}
