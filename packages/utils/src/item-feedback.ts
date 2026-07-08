/**
 * Per-line verdict rollups (Schedule & Boards Wave 2 · C3 + C5).
 *
 * Pure, dependency-free derivations shared by the client proposal header
 * ("4 of 12 approved · 1 flagged"), the designer letterhead, and the Desk
 * "N lines flagged" need. A verdict is append-only history — the LATEST row per
 * line is the line's current verdict — so every count here folds to latest.
 */

export type Verdict = 'approved' | 'rejected' | 'comment';

/** The minimal shape of a verdict row these helpers need (anchor + when + state). */
export interface LineVerdict {
  /** The line this verdict anchors to (proposal_item_id). */
  lineId: string;
  verdict: Verdict;
  createdAt: string;
  /** Set when a designer has marked a rejection handled. */
  resolvedAt?: string | null;
}

export interface VerdictRollup {
  /** Total lines eligible for a verdict. */
  total: number;
  /** Lines whose latest verdict is approve / reject / comment. */
  approved: number;
  flagged: number;
  commented: number;
  /** Lines with no verdict yet (awaiting the client). */
  pending: number;
  /** Lines whose latest verdict is a still-unresolved rejection. */
  unresolvedFlags: number;
}

/** The latest verdict per line (append-only history folds to latest). */
export function latestVerdictByLine(verdicts: LineVerdict[]): Map<string, LineVerdict> {
  const latest = new Map<string, LineVerdict>();
  for (const v of verdicts) {
    const prev = latest.get(v.lineId);
    if (!prev || v.createdAt > prev.createdAt) latest.set(v.lineId, v);
  }
  return latest;
}

/**
 * Fold a set of verdicts against the full line count into a rollup. `totalLines`
 * is the number of client-visible lines on the document (the denominator).
 */
export function rollupVerdicts(totalLines: number, verdicts: LineVerdict[]): VerdictRollup {
  const latest = latestVerdictByLine(verdicts);
  let approved = 0;
  let flagged = 0;
  let commented = 0;
  let unresolvedFlags = 0;
  for (const v of latest.values()) {
    if (v.verdict === 'approved') approved += 1;
    else if (v.verdict === 'rejected') {
      flagged += 1;
      if (!v.resolvedAt) unresolvedFlags += 1;
    } else commented += 1;
  }
  const decided = latest.size;
  const total = Math.max(totalLines, decided);
  return {
    total,
    approved,
    flagged,
    commented,
    pending: Math.max(0, total - decided),
    unresolvedFlags,
  };
}

/**
 * The client-facing one-liner: "4 of 12 approved · 1 flagged · 2 noted".
 * Empty string when nothing has happened yet (no chip to show).
 */
export function formatVerdictRollup(r: VerdictRollup): string {
  if (r.approved === 0 && r.flagged === 0 && r.commented === 0) return '';
  const parts: string[] = [`${r.approved} of ${r.total} approved`];
  if (r.flagged > 0) parts.push(`${r.flagged} flagged`);
  if (r.commented > 0) parts.push(`${r.commented} noted`);
  return parts.join(' · ');
}
