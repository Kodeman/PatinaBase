// Round-8 runs load and delete F01 fixtures, so they must name their database
// and keep off the shared local stack (54321/54322) unless a developer opts in.
const SHARED_PORTS = new Set(['54321', '54322']);

export function round8Stack(purpose: string): { api: URL; db: URL } {
  const rawDb = process.env.SUPABASE_DB_URL;
  if (!rawDb) {
    throw new Error(
      `${purpose}: SUPABASE_DB_URL is unset. Round-8 e2e never falls back to the shared stack; ` +
        'export your owned stack DB URL (postgresql://postgres:postgres@127.0.0.1:<B22>/postgres).',
    );
  }
  // Parse the hostname, never substring-match a URL that could name a remote
  // host or put localhost in its password/query.
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const db = new URL(rawDb);
  if (api.hostname !== '127.0.0.1' || db.hostname !== '127.0.0.1') {
    throw new Error(`${purpose}: Supabase and Postgres must be on 127.0.0.1; refusing.`);
  }
  if (
    process.env.ROUND8_ALLOW_SHARED_DB !== '1' &&
    (SHARED_PORTS.has(api.port) || SHARED_PORTS.has(db.port || '5432'))
  ) {
    throw new Error(
      `${purpose}: refusing the shared local stack (API :${api.port}, DB :${db.port}). ` +
        'Use an owned stack, or set ROUND8_ALLOW_SHARED_DB=1 for a deliberate shared-stack run.',
    );
  }
  return { api, db };
}

// RC-7 lane specs that write fixtures or revoke grants also require the stack
// owner's marker: a supabase_admin-owned rc7_owned.stack table holding a
// project_id row equal to RC7_OWNED_STACK. The shared stack never carries it.
// Prefix the returned SQL to the same psqlRun call as the write: it sets the
// session's rc7.stack and raises before anything after it runs.
export function rc7OwnedStackSql(purpose: string): string {
  round8Stack(purpose);
  const stack = process.env.RC7_OWNED_STACK ?? '';
  if (!/^[a-z0-9-]+$/.test(stack)) {
    throw new Error(`${purpose}: RC7_OWNED_STACK must name the owned stack's rc7_owned.stack row.`);
  }
  const label = purpose.replace(/'/g, "''");
  return `SELECT set_config('rc7.stack', '${stack}', false);
DO $rc7$ DECLARE owned boolean; BEGIN
  IF to_regclass('rc7_owned.stack') IS NULL
     OR (SELECT relowner FROM pg_class WHERE oid = to_regclass('rc7_owned.stack')) <> 'supabase_admin'::regrole THEN
    RAISE EXCEPTION '${label}: no supabase_admin-owned rc7_owned.stack marker; refusing';
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM rc7_owned.stack WHERE project_id = $1)'
    INTO owned USING current_setting('rc7.stack', true);
  IF owned IS NOT TRUE THEN
    RAISE EXCEPTION '${label}: rc7_owned.stack does not name %; refusing', current_setting('rc7.stack', true);
  END IF;
END $rc7$;
`;
}
