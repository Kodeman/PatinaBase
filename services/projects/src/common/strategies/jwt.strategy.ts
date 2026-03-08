import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Supabase JWT Authentication Strategy
 *
 * Validates Supabase-issued JWTs using the SUPABASE_JWT_SECRET.
 * Supabase GoTrue issues JWTs with standard claims plus user/app metadata.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly configService: ConfigService) {
    const secret = configService.get<string>('SUPABASE_JWT_SECRET') ||
                   configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error(
        'SUPABASE_JWT_SECRET is not configured. Please set SUPABASE_JWT_SECRET environment variable.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      // Supabase uses 'authenticated' as the audience
      // Don't validate issuer/audience strictly to be compatible with both Supabase and legacy JWTs
    });

    this.logger.log('JwtStrategy initialized with Supabase JWT verification');
  }

  /**
   * Validate JWT payload after signature verification.
   * Handles both Supabase JWT format and legacy Patina JWT format.
   */
  async validate(payload: any) {
    if (!payload.sub) {
      this.logger.warn('JWT token missing subject (sub) claim');
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    // Extract roles from either Supabase app_metadata or legacy roles claim
    const roles = payload.app_metadata?.roles ||
                  (Array.isArray(payload.roles) ? payload.roles : []);

    const permissions = payload.app_metadata?.permissions ||
                        (Array.isArray(payload.permissions) ? payload.permissions : []);

    const userContext = {
      userId: payload.sub,
      sub: payload.sub,
      email: payload.email,
      role: payload.role, // Supabase role claim (e.g., 'authenticated')
      roles,
      permissions,
      metadata: payload.user_metadata,
      iat: payload.iat,
      exp: payload.exp,
    };

    this.logger.debug('JWT validated', {
      userId: userContext.userId,
      roles: userContext.roles,
    });

    return userContext;
  }
}
