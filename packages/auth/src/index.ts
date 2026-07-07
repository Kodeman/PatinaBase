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

// Decorator to mark routes as public (no auth required)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Decorator to require specific permissions
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);

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
  aud?: string;
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

  if (alg === 'HS256') {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    });
    return payload as SupabaseJwtPayload;
  }

  const { payload } = await jwtVerify(token, getJwks(), {
    algorithms: ['ES256', 'RS256'],
  });
  return payload as SupabaseJwtPayload;
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
    if (!authHeader?.startsWith('Bearer ')) return false;
    const token = authHeader.substring(7);

    try {
      const payload = await verifyJwtToken(token);

      request.user = {
        sub: payload.sub,
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        roles: payload.app_metadata?.roles || [],
        permissions: payload.app_metadata?.permissions || [],
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

// PermissionsGuard stub — A4 in the architecture review tracks implementing
// real permission enforcement (read @RequirePermissions metadata, compare
// against request.user.permissions, default deny). Until then this is a
// no-op gate.
@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
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
