import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose';
import type { EdgeApiEnv } from './env';
import {
  withAuthenticatedTransaction,
  type DatabaseClient,
  type DatabaseClientFactory,
  type VerifiedSupabaseClaims,
} from './database';

type VerificationKey = CryptoKey | Uint8Array | JWTVerifyGetKey;

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function remoteKeySet(url: string): JWTVerifyGetKey {
  const cached = remoteKeySets.get(url);
  if (cached) return cached;
  const created = createRemoteJWKSet(new URL(url));
  remoteKeySets.set(url, created);
  return created;
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

export async function verifyJwt(
  token: string,
  key: VerificationKey,
  issuer: string,
  audience: string | string[],
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, key, { issuer, audience });
  return payload;
}

export async function verifySupabaseRequest(
  request: Request,
  env: EdgeApiEnv,
  key: VerificationKey = remoteKeySet(env.SUPABASE_JWKS_URL),
): Promise<VerifiedSupabaseClaims> {
  const token = bearerToken(request);
  if (!token) throw new Error('unauthorized');
  const audience = env.SUPABASE_JWT_AUDIENCE.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const payload = await verifyJwt(
    token,
    key,
    env.SUPABASE_JWT_ISSUER,
    audience,
  );
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('unauthorized');
  }
  return payload as VerifiedSupabaseClaims;
}

export async function withVerifiedSupabaseTransaction<T>(
  request: Request,
  env: EdgeApiEnv,
  work: (client: DatabaseClient) => Promise<T>,
  options: { key?: VerificationKey; createClient?: DatabaseClientFactory } = {},
): Promise<T> {
  const claims = await verifySupabaseRequest(request, env, options.key);
  return withAuthenticatedTransaction(env, claims, work, options.createClient);
}

async function constantTimeEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export async function isHealthAuthorized(
  request: Request,
  env: EdgeApiEnv,
  accessKey?: VerificationKey,
): Promise<boolean> {
  const configuredId = env.HEALTH_SERVICE_TOKEN_ID;
  const configuredSecret = env.HEALTH_SERVICE_TOKEN_SECRET;
  const providedId = request.headers.get('cf-access-client-id');
  const providedSecret = request.headers.get('cf-access-client-secret');

  if (configuredId && configuredSecret && providedId && providedSecret) {
    const [idMatches, secretMatches] = await Promise.all([
      constantTimeEqual(providedId, configuredId),
      constantTimeEqual(providedSecret, configuredSecret),
    ]);
    if (idMatches && secretMatches) return true;
  }

  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (!assertion || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUDIENCE)
    return false;

  const teamDomain = env.ACCESS_TEAM_DOMAIN.replace(/\/+$/, '');
  try {
    await verifyJwt(
      assertion,
      accessKey ?? remoteKeySet(`${teamDomain}/cdn-cgi/access/certs`),
      teamDomain,
      env.ACCESS_AUDIENCE,
    );
    return true;
  } catch {
    return false;
  }
}
