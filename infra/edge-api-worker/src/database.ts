import { Client, type QueryResult } from 'pg';
import type { JWTPayload } from 'jose';
import type { EdgeApiEnv } from './env';

export interface DatabaseClient {
  connect(): Promise<unknown>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
  end(): Promise<void>;
}

export type DatabaseClientFactory = (
  connectionString: string,
) => DatabaseClient;

export const createDatabaseClient: DatabaseClientFactory = (connectionString) =>
  new Client({
    connectionString,
    connectionTimeoutMillis: 3_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
  });

export async function withClient<T>(
  binding: Hyperdrive,
  work: (client: DatabaseClient) => Promise<T>,
  createClient: DatabaseClientFactory = createDatabaseClient,
): Promise<T> {
  const client = createClient(binding.connectionString);
  try {
    await client.connect();
    return await work(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export interface VerifiedSupabaseClaims extends JWTPayload {
  sub: string;
}

export async function withAuthenticatedTransaction<T>(
  env: EdgeApiEnv,
  claims: VerifiedSupabaseClaims,
  work: (client: DatabaseClient) => Promise<T>,
  createClient: DatabaseClientFactory = createDatabaseClient,
): Promise<T> {
  if (!env.DB_FRESH) throw new Error('database unavailable');
  return withClient(
    env.DB_FRESH,
    async (client) => {
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(
          "SELECT set_config('request.jwt.claims', $1, true)",
          [JSON.stringify(claims)],
        );
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    },
    createClient,
  );
}

export async function probeBinding(
  binding: Hyperdrive | undefined,
  createClient: DatabaseClientFactory = createDatabaseClient,
): Promise<boolean> {
  if (!binding) return false;
  try {
    await withClient(
      binding,
      async (client) => {
        await client.query('SELECT 1');
      },
      createClient,
    );
    return true;
  } catch {
    return false;
  }
}
