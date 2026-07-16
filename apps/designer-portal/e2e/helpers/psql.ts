/**
 * Raw-`psql` e2e helper (Arrival Arc regression suite).
 *
 * A handful of the arc's RPCs (`client_pick`, `accept_design_request`,
 * `ceremony_complete`, `refresh_offered_slots`) read `auth.uid()` internally
 * (SECURITY DEFINER functions that still gate on the caller's identity) —
 * there is no `adminDb.rpc(...)` equivalent that can impersonate a specific
 * homeowner/designer the way the Postgres `request.jwt.claims` GUC can. This
 * module shells out to `psql` against the LOCAL stack only, mirroring the
 * `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', …)`
 * idiom already used by `supabase/tests/rls/*_test.sql`.
 *
 * ── DATABASE SAFETY ────────────────────────────────────────────────────────
 * Refuses anything but 127.0.0.1/localhost, mirroring help-state.ts's guard —
 * a fresh, loud stop rather than a silent write against Strata prod.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

if (!/(127\.0\.0\.1|localhost)/.test(DB_URL)) {
  throw new Error(
    `REFUSING to run psql e2e helpers against a non-local Postgres URL: "${DB_URL}". ` +
      `This module only ever talks to the local Supabase stack.`,
  );
}

// The Supabase CLI's `psql` isn't always on PATH (homebrew's `libpq` is
// keg-only) — try the common local locations before falling back to bare
// `psql` and letting the OS PATH resolve it (or fail loudly if it can't).
const PSQL_CANDIDATES = [
  '/opt/homebrew/opt/libpq/bin/psql',
  '/opt/homebrew/opt/libpq@18/bin/psql',
  '/usr/local/opt/libpq/bin/psql',
  'psql',
];
const PSQL_BIN = PSQL_CANDIDATES.find((c) => c === 'psql' || existsSync(c)) ?? 'psql';

function run(sql: string, extraArgs: string[] = []): string {
  return execFileSync(
    PSQL_BIN,
    ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...extraArgs, DB_URL, '-c', sql],
    { encoding: 'utf8' },
  );
}

/** Run one or more `;`-separated statements as the `postgres` superuser
 *  (bypasses RLS — fine for fixture setup/teardown and plain assertions). */
export function psqlRun(sql: string): string {
  return run(sql);
}

/** A single scalar value (tuples-only, unaligned). '' for a NULL/empty result. */
export function psqlScalar(sql: string): string {
  return run(sql, ['-t', '-A']).trim();
}

/** The first row as `|`-split fields (tuples-only, unaligned, `|` separator). */
export function psqlRow(sql: string): string[] {
  const out = run(sql, ['-t', '-A', '-F', '|']).trim();
  return out.length ? out.split('\n')[0]!.split('|') : [];
}

/** Every row, each as `|`-split fields. */
export function psqlRows(sql: string): string[][] {
  const out = run(sql, ['-t', '-A', '-F', '|']).trim();
  return out.length ? out.split('\n').map((l) => l.split('|')) : [];
}

/**
 * Runs `sql` impersonating `userId` as an `authenticated` caller — sets both
 * the `request.jwt.claims` GUC (what `auth.uid()` reads) and the Postgres
 * `authenticated` role (what the RPCs' `GRANT EXECUTE ... TO authenticated`
 * requires), all inside ONE simple-query message so `SET LOCAL` survives
 * across the later statements (Postgres treats a `;`-joined multi-statement
 * string sent in one message as a single implicit transaction).
 */
export function psqlAsUser(userId: string, sql: string): string {
  const wrapped = `
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${userId}', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
${sql}
COMMIT;
`;
  return run(wrapped);
}

/** Same as {@link psqlAsUser}, returning the first row as `|`-split fields —
 *  for RPC calls whose return value the caller needs (e.g. offered slots). */
export function psqlAsUserRow(userId: string, sql: string): string[] {
  const wrapped = `
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${userId}', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
${sql}
COMMIT;
`;
  const out = run(wrapped, ['-t', '-A', '-F', '|']).trim();
  return out.length ? out.split('\n')[0]!.split('|') : [];
}
