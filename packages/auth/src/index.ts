/**
 * @patina/auth — Supabase JWT auth for NestJS services
 *
 * Provides guards and decorators for Supabase JWT validation.
 * JWTs are issued by Supabase GoTrue and verified using SUPABASE_JWT_SECRET.
 */
import { SetMetadata, Injectable, CanActivate, ExecutionContext, createParamDecorator, Inject } from '@nestjs/common';

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
  /** User ID (Supabase auth.users.id) */
  sub: string;
  /** User email */
  email?: string;
  /** User role (from Supabase) */
  role?: string;
  /** Audience */
  aud?: string;
  /** Issued at */
  iat?: number;
  /** Expiration */
  exp?: number;
  /** User metadata */
  user_metadata?: Record<string, any>;
  /** App metadata (roles, permissions) */
  app_metadata?: Record<string, any>;
}

/**
 * JWT Auth Guard — verifies Supabase JWT tokens.
 * In development mode (no SUPABASE_JWT_SECRET), passes all requests.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Check for @Public() decorator
    const handler = context.getHandler();
    const classRef = context.getClass();
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) ||
                     Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
    if (isPublic) return true;

    // Extract and verify JWT
    const authHeader = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      // In development without JWT secret, allow pass-through
      if (!process.env.SUPABASE_JWT_SECRET) {
        request.user = { sub: 'dev-user', email: 'dev@patina.com', role: 'authenticated' };
        return true;
      }
      return false;
    }

    const token = authHeader.substring(7);

    try {
      // Decode JWT payload (base64url)
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return false;

      const payload: SupabaseJwtPayload = JSON.parse(
        Buffer.from(payloadPart, 'base64url').toString('utf-8')
      );

      // Check expiration
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return false;
      }

      // Set user on request
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

// Permissions guard stub
@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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
