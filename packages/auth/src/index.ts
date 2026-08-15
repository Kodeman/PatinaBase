/**
 * @patina/auth — Supabase JWT auth for NestJS services
 *
 * Verifies Supabase-issued JWTs using the `jose` library, supporting both
 * signing schemes Supabase can issue:
 *
 *  - HS256 (shared secret) — self-hosted / local Supabase. Verified against
 *    SUPABASE_JWT_SECRET.
 *  - ES256 / RS256 (asymmetric) — Supabase Cloud projects using signing
 *    keys. Verified against a remote JWKS, resolved from SUPABASE_JWKS_URL
 *    if set, otherwise derived from SUPABASE_URL as
 *    `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 *
 * The algorithm in the token's protected header decides which path runs, so
 * each deployment only needs to configure the env vars for the scheme its
 * Supabase project actually uses. Exports guards, decorators, and a
 * standalone `verifyJwtToken` helper that `@patina/api-routes` reuses for
 * defense-in-depth verification at the portal proxy layer.
 *
 * Hard requirement: SUPABASE_JWT_SECRET must be set to verify HS256 tokens,
 * and SUPABASE_URL (or SUPABASE_JWKS_URL) must be set to verify ES256/RS256
 * tokens. Each path fails closed if its own config is missing — there is no
 * dev fallback.
 */
import {
  SetMetadata,
  Injectable,
  CanActivate,
  ExecutionContext,
  createParamDecorator,
} from '@nestjs/common';
import { jwtVerify, decodeProtectedHeader, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

// Metadata key for public routes
export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';

// Decorator to mark routes as public (no auth required)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Decorator to require specific permissions
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// Parameter decorator to extract current user from request
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

/**
 * Supabase JWT payload structure.
 * GoTrue issues JWTs with these standard claims.
 */
export interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  role?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
}

let cachedSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      '[@patina/auth] SUPABASE_JWT_SECRET is not set. ' +
        'Local dev: run `supabase status` and copy "JWT secret" into your .env. ' +
        'Production: configure the env var on your deployment platform. ' +
        'Refusing to operate without it.',
    );
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

let cachedJwks: JWTVerifyGetKey | null = null;

function getExpectedIssuer(): string {
  const explicit = process.env.SUPABASE_JWT_ISSUER;
  if (explicit) return explicit.replace(/\/$/, '');

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      '[@patina/auth] SUPABASE_URL (or SUPABASE_JWT_ISSUER) is required to ' +
        'verify the token issuer. Refusing to accept an unscoped JWT.',
    );
  }
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
}

function getExpectedAudience(): string {
  return process.env.SUPABASE_JWT_AUDIENCE || 'authenticated';
}

function getJwksUrl(): string {
  const explicit = process.env.SUPABASE_JWKS_URL;
  if (explicit) return explicit;

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      '[@patina/auth] Received an asymmetrically-signed (ES256/RS256) JWT but ' +
        'neither SUPABASE_JWKS_URL nor SUPABASE_URL is set. ' +
        'Supabase Cloud projects sign JWTs with an asymmetric key — configure ' +
        'SUPABASE_URL (e.g. https://<project-ref>.supabase.co) so the JWKS can be ' +
        'derived as `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, or set ' +
        'SUPABASE_JWKS_URL directly. Refusing to operate without it.',
    );
  }
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
}

function getJwks(): JWTVerifyGetKey {
  if (cachedJwks) return cachedJwks;
  cachedJwks = createRemoteJWKSet(new URL(getJwksUrl()));
  return cachedJwks;
}

/**
 * Verify a Supabase JWT and return its payload.
 *
 * Branches on the token's protected-header `alg`:
 *  - HS256 → shared-secret verification against SUPABASE_JWT_SECRET
 *    (self-hosted / local Supabase).
 *  - ES256 / RS256 → remote JWKS verification, resolved from
 *    SUPABASE_JWKS_URL or derived from SUPABASE_URL (Supabase Cloud).
 *
 * Throws on invalid signature, expired token, malformed token, unsupported
 * algorithm, or missing configuration for the branch the token requires.
 * Used by JwtAuthGuard below and by @patina/api-routes' proxy layer.
 */
export async function verifyJwtToken(token: string): Promise<SupabaseJwtPayload> {
  let alg: string | undefined;
  try {
    ({ alg } = decodeProtectedHeader(token));
  } catch {
    throw new Error('[@patina/auth] Malformed token: unable to decode JWT protected header.');
  }

  if (!alg || !['HS256', 'ES256', 'RS256'].includes(alg)) {
    throw new Error(`[@patina/auth] Unsupported JWT algorithm: ${alg ?? 'missing'}.`);
  }

  const verificationOptions = {
    algorithms: [alg],
    issuer: getExpectedIssuer(),
    audience: getExpectedAudience(),
  };

  const { payload } = alg === 'HS256'
    ? await jwtVerify(token, getJwtSecret(), {
        ...verificationOptions,
      algorithms: ['HS256'],
      })
    : await jwtVerify(token, getJwks(), {
        ...verificationOptions,
        algorithms: ['ES256', 'RS256'],
      });

  if (
    typeof payload.sub !== 'string' ||
    payload.sub.trim().length === 0 ||
    payload.role !== 'authenticated' ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp)
  ) {
    throw new Error('[@patina/auth] JWT is missing required authenticated-user claims.');
  }

  return payload as unknown as SupabaseJwtPayload;
}

/**
 * JWT Auth Guard — verifies Supabase JWT tokens with full signature checking.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const handler = context.getHandler();
    const classRef = context.getClass();
    const isPublic =
      Reflect.getMetadata(IS_PUBLIC_KEY, handler) ||
      Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
    if (isPublic) return true;

    const authHeader = request.headers?.authorization;
    const bearerMatch =
      typeof authHeader === 'string' ? /^Bearer\s+(\S+)$/i.exec(authHeader.trim()) : null;
    if (!bearerMatch) return false;
    const token = bearerMatch[1];

    try {
      const payload = await verifyJwtToken(token);

      request.user = {
        sub: payload.sub,
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        roles: Array.isArray(payload.app_metadata?.roles)
          ? payload.app_metadata.roles.filter((role): role is string => typeof role === 'string')
          : [],
        permissions: Array.isArray(payload.app_metadata?.permissions)
          ? payload.app_metadata.permissions.filter(
              (permission): permission is string =>
                typeof permission === 'string' && permission.length > 0,
            )
          : [],
        metadata: payload.user_metadata,
      };
      return true;
    } catch {
      return false;
    }
  }
}

// Hybrid auth guard — same as JwtAuthGuard in Supabase-first architecture
@Injectable()
export class HybridAuthGuard extends JwtAuthGuard {}

@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required =
      Reflect.getMetadata(PERMISSIONS_KEY, context.getHandler()) ??
      Reflect.getMetadata(PERMISSIONS_KEY, context.getClass());
    if (required === undefined) return true;
    if (!Array.isArray(required) || required.length === 0) return false;

    const granted = context.switchToHttp().getRequest()?.user?.permissions;
    if (!Array.isArray(granted)) return false;
    return required.every(
      (permission) =>
        typeof permission === 'string' &&
        permission.length > 0 &&
        granted.includes(permission),
    );
  }
}

// CORS options helper
export function createCorsOptions() {
  return {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,
  };
}
