/**
 * Help-state e2e helpers (Wave-2 verification).
 *
 * Drives `profiles.created_at` + `profiles.help_state` for the seeded designer
 * so the Desk Walkthrough gate (desk-walkthrough-gate.ts) can be exercised end
 * to end. All I/O rides the service-role admin client (supabase-admin.ts),
 * which reads NEXT_PUBLIC_SUPABASE_URL from apps/designer-portal/.env.local.
 *
 * ── DATABASE SAFETY ────────────────────────────────────────────────────────
 * These helpers MUST target the LOCAL Supabase stack. The guard below aborts
 * the whole run if the URL is anything but 127.0.0.1:54321 / localhost:54321 —
 * a fresh, loud stop rather than a silent write against Strata prod (whose
 * ref is bkvcixdmuyejfzcijpdg.supabase.co).
 */
import { adminDb, getUserIdByEmail } from './supabase-admin';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/^https?:\/\/(127\.0\.0\.1|localhost):54321(\/|$)/.test(SUPA_URL)) {
  throw new Error(
    `REFUSING to run help-state e2e against a non-local Supabase URL: "${SUPA_URL}". ` +
      `Point apps/designer-portal/.env.local at http://127.0.0.1:54321 (the local stack).`,
  );
}

export const DESIGNER_EMAIL = 'designer@patina.dev';
export const DESK_WALKTHROUGH_TOUR_ID = 'desk-walkthrough';

/** The seeded designer's auth uid (= profiles.id). */
export function getDesignerId(): Promise<string> {
  return getUserIdByEmail(DESIGNER_EMAIL);
}

export interface ProfileRow {
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  help_state: any;
}

export async function readProfile(id: string): Promise<ProfileRow> {
  const { data, error } = await adminDb
    .from('profiles')
    .select('created_at, help_state')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

/** Overwrite profiles.created_at (drives the ship-date gate). */
export async function setCreatedAt(id: string, iso: string): Promise<void> {
  const { error } = await adminDb.from('profiles').update({ created_at: iso }).eq('id', id);
  if (error) throw error;
}

/** Clear the whole help_state blob — a fresh, un-toured user. */
export async function clearHelpState(id: string): Promise<void> {
  const { error } = await adminDb.from('profiles').update({ help_state: {} }).eq('id', id);
  if (error) throw error;
}

/** Persist a completed desk-walkthrough record (suppresses modal + offer). */
export async function setTourCompleted(id: string): Promise<void> {
  const { error } = await adminDb
    .from('profiles')
    .update({ help_state: { tours: { [DESK_WALKTHROUGH_TOUR_ID]: { completed: true } } } })
    .eq('id', id);
  if (error) throw error;
}

/** The persisted tours['desk-walkthrough'] record, or null when absent. */
export async function readTourRecord(id: string): Promise<Record<string, unknown> | null> {
  const { help_state } = await readProfile(id);
  const rec = help_state?.tours?.[DESK_WALKTHROUGH_TOUR_ID];
  return rec ?? null;
}

/**
 * Poll the persisted tour record until `pred` holds — the Supabase help-state
 * backend writes through asynchronously (fire-and-forget), so a reload right
 * after a modal/tour action can race the write. Returns the last-seen record.
 */
export async function waitForTourRecord(
  id: string,
  pred: (rec: Record<string, unknown> | null) => boolean,
  timeoutMs = 10_000,
): Promise<Record<string, unknown> | null> {
  const start = Date.now();
  let last: Record<string, unknown> | null = null;
  while (Date.now() - start < timeoutMs) {
    last = await readTourRecord(id);
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}
