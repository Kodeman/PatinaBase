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
