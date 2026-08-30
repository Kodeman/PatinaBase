/**
 * The two papers the lens specs read (R127 Wave 3, W3-L5).
 *
 * FIXED seed uuids, minted by `scripts/the-document-lens-seed.sql` — never a
 * DB-generated id, because those change on every `supabase:reset` and a spec
 * pinned to one rots silently.
 *
 * `assertLongPaper` is a GATE, not an assertion about the product: the band's
 * eighteen cells are only worth measuring on a paper long enough to scroll to
 * 1200px and deep enough to have more than one stop. A spec that ran against
 * an unseeded database would measure a 56px band on an empty document and call
 * it a pass, which is the failure mode this refuses.
 */
import { psqlScalar } from '../helpers/psql';

/** "Aspen Loft — the long paper": ≥5 rooms, ≥60 FF&E lines, 2 unspecified,
 *  1 damaged, 2 overdue approvals, an unacknowledged PO. */
export const LONG_PAPER_ID = 'b0000000-0000-0000-0000-0000000000d5';

/** The pre-work paper — the second, proposal-kind document for the same
 *  designer: sent, unopened, no project behind it. */
export const PRE_WORK_ID = 'b0000000-0000-0000-0000-0000000000d6';

/** D-B48 — the ONE-LINE-name paper. `…d5`'s `Aspen Loft — the long paper`
 *  wraps to two lines at 390 (32px Playfair spends ~11 characters of a 327px
 *  measure), and the 390 gates are chosen by measured line count, so the specs
 *  need the other arm. Seeded by `scripts/the-document-lens-seed.sql` with the
 *  same project shape everything the letterhead reads depends on. */
export const ONE_LINE_PAPER_ID = 'b0000000-0000-0000-0000-0000000000d4';

/**
 * The FOURTH stop's heading id (W4-L4) — `document-index.ts`'s
 * `PROJECT_PAPER_ORDER[3]` is `money`, whose `headingId` is the fixed string
 * `'money-region-heading'` (no `projectId` interpolation, so it is stable
 * across seeds). `lens-density.spec.ts`'s deep-landed-load case navigates to
 * `` `/doc/${LONG_PAPER_ID}#${FOURTH_STOP_HEADING_ID}` `` and lets the
 * BROWSER'S OWN fragment-scroll land the page there before any lens code
 * runs — exactly D-B16's scenario ("a root that is discovered already above
 * or inside the frame"), reached with no app-level deep-link mechanism at
 * all, because none exists yet (`page.tsx` has no `location.hash` handling).
 */
export const FOURTH_STOP_HEADING_ID = 'money-region-heading';

const count = (sql: string): number => Number(psqlScalar(sql) || '0');

/** Throws unless the long paper is seeded to the shape the walk needs
 *  (reconciliation, "Seed requirements"): ≥60 lines across ≥4 rooms. */
export function assertLongPaper(id: string = LONG_PAPER_ID): void {
  const rooms = count(
    `select count(*) from public.project_rooms where project_id = '${id}'`,
  );
  const lines = count(
    `select count(*) from public.project_ffe_items where project_id = '${id}'`,
  );
  if (lines < 60 || rooms < 4) {
    throw new Error(
      `the long paper (${id}) is not seeded: ${lines} lines across ${rooms} rooms, ` +
        `need >=60 lines and >=4 rooms. Run scripts/the-document-lens-seed.sql.`,
    );
  }
}
