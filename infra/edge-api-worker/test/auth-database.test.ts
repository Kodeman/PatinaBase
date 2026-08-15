import { generateKeyPair, SignJWT } from 'jose';
import {
  isHealthAuthorized,
  verifyJwt,
  verifySupabaseRequest,
  withVerifiedSupabaseTransaction,
} from '../src/auth';
import {
  withAuthenticatedTransaction,
  type DatabaseClient,
  type DatabaseClientFactory,
  type VerifiedSupabaseClaims,
} from '../src/database';
import type { EdgeApiEnv } from '../src/env';

const ISSUER = 'https://project.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';

async function token(
  privateKey: CryptoKey,
  overrides: {
    issuer?: string;
    audience?: string;
    expiration?: number;
    subject?: string;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(overrides.subject ?? '00000000-0000-4000-8000-000000000001')
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(overrides.expiration ?? now + 60)
    .sign(privateKey);
}

describe('Supabase JWT verification', () => {
  it('accepts a valid token with the expected issuer and audience', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    await expect(
      verifyJwt(await token(privateKey), publicKey, ISSUER, AUDIENCE),
    ).resolves.toMatchObject({
      sub: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('rejects an invalid signature', async () => {
    const signer = await generateKeyPair('RS256');
    const verifier = await generateKeyPair('RS256');
    await expect(
      verifyJwt(
        await token(signer.privateKey),
        verifier.publicKey,
        ISSUER,
        AUDIENCE,
      ),
    ).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    await expect(
      verifyJwt(
        await token(privateKey, {
          expiration: Math.floor(Date.now() / 1000) - 1,
        }),
        publicKey,
        ISSUER,
        AUDIENCE,
      ),
    ).rejects.toThrow();
  });

  it('rejects the wrong issuer', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    await expect(
      verifyJwt(
        await token(privateKey, { issuer: 'https://wrong.example/auth/v1' }),
        publicKey,
        ISSUER,
        AUDIENCE,
      ),
    ).rejects.toThrow();
  });

  it('verifies a bearer request and rejects missing authorization', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const env = {
      SUPABASE_JWT_ISSUER: ISSUER,
      SUPABASE_JWT_AUDIENCE: AUDIENCE,
      SUPABASE_JWKS_URL: 'https://unused.example/jwks',
    } as EdgeApiEnv;
    await expect(
      verifySupabaseRequest(
        new Request('https://api.example/v1/private', {
          headers: { authorization: `Bearer ${await token(privateKey)}` },
        }),
        env,
        publicKey,
      ),
    ).resolves.toMatchObject({ sub: '00000000-0000-4000-8000-000000000001' });
    await expect(
      verifySupabaseRequest(
        new Request('https://api.example/v1/private'),
        env,
        publicKey,
      ),
    ).rejects.toThrow('unauthorized');
  });
});

describe('health authorization', () => {
  it('requires both configured service-token headers', async () => {
    const env = {
      HEALTH_SERVICE_TOKEN_ID: 'service-id',
      HEALTH_SERVICE_TOKEN_SECRET: 'service-secret',
    } as EdgeApiEnv;
    await expect(
      isHealthAuthorized(
        new Request('https://api.example/_internal/health', {
          headers: {
            'cf-access-client-id': 'service-id',
            'cf-access-client-secret': 'service-secret',
          },
        }),
        env,
      ),
    ).resolves.toBe(true);
    await expect(
      isHealthAuthorized(
        new Request('https://api.example/_internal/health', {
          headers: { 'cf-access-client-id': 'service-id' },
        }),
        env,
      ),
    ).resolves.toBe(false);
  });

  it('validates a Cloudflare Access assertion issuer and audience', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const teamDomain = 'https://patina.cloudflareaccess.com';
    const audience = 'health-audience';
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ type: 'app' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(teamDomain)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(privateKey);
    const request = new Request('https://api.example/_internal/health', {
      headers: { 'cf-access-jwt-assertion': assertion },
    });
    const accessEnv = {
      ACCESS_TEAM_DOMAIN: teamDomain,
      ACCESS_AUDIENCE: audience,
    } as EdgeApiEnv;
    await expect(
      isHealthAuthorized(request, accessEnv, publicKey),
    ).resolves.toBe(true);
    await expect(
      isHealthAuthorized(
        request,
        { ...accessEnv, ACCESS_AUDIENCE: 'wrong' },
        publicKey,
      ),
    ).resolves.toBe(false);
  });
});

interface RecordedClient extends DatabaseClient {
  commands: Array<{ text: string; values?: unknown[] }>;
  ended: boolean;
}

function clientFactory(clients: RecordedClient[]): DatabaseClientFactory {
  return () => {
    const client: RecordedClient = {
      commands: [],
      ended: false,
      async connect() {},
      async query(text, values) {
        this.commands.push({ text, values });
        return { rows: [], command: '', rowCount: 0, oid: 0, fields: [] };
      },
      async end() {
        this.ended = true;
      },
    };
    clients.push(client);
    return client;
  };
}

describe('authenticated fresh-connection transactions', () => {
  const env = {
    DB_FRESH: { connectionString: 'postgres://fresh' },
  } as EdgeApiEnv;

  it('uses a new client and transaction-local role and claims for successive users', async () => {
    const clients: RecordedClient[] = [];
    const createClient = clientFactory(clients);
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const transactionEnv = {
      ...env,
      SUPABASE_JWT_ISSUER: ISSUER,
      SUPABASE_JWT_AUDIENCE: AUDIENCE,
      SUPABASE_JWKS_URL: 'https://unused.example/jwks',
    } as EdgeApiEnv;
    const firstToken = await token(privateKey, { subject: 'user-a' });
    const secondToken = await token(privateKey, { subject: 'user-b' });

    for (const accessToken of [firstToken, secondToken]) {
      await withVerifiedSupabaseTransaction(
        new Request('https://api.example/v1/private', {
          headers: { authorization: `Bearer ${accessToken}` },
        }),
        transactionEnv,
        async (client) => {
          await client.query('SELECT current_setting($1, true)', [
            'request.jwt.claims',
          ]);
        },
        { key: publicKey, createClient },
      );
    }

    expect(clients).toHaveLength(2);
    expect(clients[0]).not.toBe(clients[1]);
    for (const client of clients) {
      expect(client.commands[0].text).toBe('BEGIN');
      expect(client.commands[1].text).toBe('SET LOCAL ROLE authenticated');
      expect(client.commands.at(-1)?.text).toBe('COMMIT');
      expect(client.ended).toBe(true);
    }
    expect(
      JSON.parse(String(clients[0].commands[2].values?.[0])),
    ).toMatchObject({ sub: 'user-a' });
    expect(
      JSON.parse(String(clients[1].commands[2].values?.[0])),
    ).toMatchObject({ sub: 'user-b' });
  });

  it('rolls back and closes the client after a route query failure', async () => {
    const clients: RecordedClient[] = [];
    await expect(
      withAuthenticatedTransaction(
        env,
        { sub: 'user-a' } as VerifiedSupabaseClaims,
        async () => {
          throw new Error('database timeout');
        },
        clientFactory(clients),
      ),
    ).rejects.toThrow('database timeout');
    expect(clients[0].commands.at(-1)?.text).toBe('ROLLBACK');
    expect(clients[0].ended).toBe(true);
  });
});
