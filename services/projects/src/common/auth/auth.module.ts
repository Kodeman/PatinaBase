import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../strategies/jwt.strategy';

/**
 * Authentication Module
 *
 * Configures JWT authentication with proper signature verification.
 * This module provides the JwtStrategy used by HybridAuthGuard in development mode.
 *
 * Configuration:
 * - JWT_SECRET: Secret key for signing/verifying tokens (REQUIRED)
 * - JWT_ACCESS_TOKEN_TTL: Token expiration time (default: 1h)
 * - JWT_ISSUER: Token issuer claim (default: patina)
 * - JWT_AUDIENCE: Token audience claim (default: patina-api)
 *
 * Security:
 * - Uses RS256 or HS256 algorithm for signature verification
 * - Validates expiration, issuer, and audience claims
 * - Prevents token forgery and replay attacks
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        if (!secret) {
          throw new Error(
            'CRITICAL SECURITY ERROR: JWT_SECRET is not configured. ' +
            'Set JWT_SECRET environment variable to enable secure authentication.',
          );
        }

        if (secret.length < 32) {
          throw new Error(
            'CRITICAL SECURITY ERROR: JWT_SECRET must be at least 32 characters long. ' +
            'Current length: ' + secret.length,
          );
        }

        return {
          secret,
          signOptions: {
            expiresIn: configService.get<string>('JWT_ACCESS_TOKEN_TTL', '1h'),
            issuer: configService.get<string>('JWT_ISSUER', 'patina'),
            audience: configService.get<string>('JWT_AUDIENCE', 'patina-api'),
          },
          verifyOptions: {
            issuer: configService.get<string>('JWT_ISSUER', 'patina'),
            audience: configService.get<string>('JWT_AUDIENCE', 'patina-api'),
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [JwtStrategy],
  exports: [JwtStrategy, PassportModule, JwtModule],
})
export class AuthModule {}
