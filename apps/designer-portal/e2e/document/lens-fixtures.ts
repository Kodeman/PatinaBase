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
