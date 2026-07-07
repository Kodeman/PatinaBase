/**
 * @patina/auth — Supabase JWT auth for NestJS services
 *
 * Verifies Supabase-issued JWTs (HS256) using SUPABASE_JWT_SECRET via the
 * `jose` library. Exports guards, decorators, and a standalone
 * `verifyJwtToken` helper that `@patina/api-routes` reuses for defense-in-depth
 * verification at the portal proxy layer.
 *
 * Hard requirement: SUPABASE_JWT_SECRET must be set in the environment.
 * The guard fails closed if the secret is missing — there is no dev fallback.
 */
import {
  SetMetadata,
  Injectable,
  CanActivate,
  ExecutionContext,
  createParamDecorator,
} from '@nestjs/common';
import { jwtVerify } from 'jose';

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

/**
 * Verify a Supabase JWT and return its payload.
 * Throws on invalid signature, expired token, malformed token, or wrong algorithm.
 * Used by JwtAuthGuard below and by @patina/api-routes' proxy layer.
 */
export async function verifyJwtToken(token: string): Promise<SupabaseJwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: ['HS256'],
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
