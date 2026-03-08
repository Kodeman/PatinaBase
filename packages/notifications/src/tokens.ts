import { SignJWT, jwtVerify, errors } from 'jose';
import type { NotificationType } from '@patina/shared/types';

export interface UnsubscribeTokenPayload {
  /** User ID */
  sub: string;
  /** Notification type to unsubscribe from, or 'all_marketing' */
  type: NotificationType | 'all_marketing';
  /** Token purpose */
  purpose: 'unsubscribe';
}

export interface UnsubscribeTokenResult {
  valid: boolean;
  payload?: UnsubscribeTokenPayload;
  error?: 'expired' | 'invalid' | 'malformed';
}

/**
 * Get the secret key as a Uint8Array for jose v5.
 * Uses UNSUBSCRIBE_TOKEN_SECRET env var, falling back to SUPABASE_SERVICE_ROLE_KEY.
 */
function getSecretKey(): Uint8Array {
  const secret =
    process.env.UNSUBSCRIBE_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      'Missing UNSUBSCRIBE_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY environment variable'
    );
  }

  return new TextEncoder().encode(secret);
}

/**
 * Generate a signed unsubscribe token.
 * Token expires in 72 hours per CAN-SPAM requirements.
 */
export async function generateUnsubscribeToken(
  userId: string,
  notificationType: NotificationType | 'all_marketing',
  expiresInHours = 72
): Promise<string> {
  const secretKey = getSecretKey();

  const token = await new SignJWT({
    type: notificationType,
    purpose: 'unsubscribe',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${expiresInHours}h`)
    .setIssuer('patina:notifications')
    .sign(secretKey);

  return token;
}

/**
 * Verify and decode an unsubscribe token.
 * Returns the payload if valid, or an error indication.
 */
export async function verifyUnsubscribeToken(
  token: string
): Promise<UnsubscribeTokenResult> {
  try {
    const secretKey = getSecretKey();

    const { payload } = await jwtVerify(token, secretKey, {
      issuer: 'patina:notifications',
    });

    if (payload.purpose !== 'unsubscribe') {
      return { valid: false, error: 'invalid' };
    }

    if (!payload.sub || !payload.type) {
      return { valid: false, error: 'malformed' };
    }

    return {
      valid: true,
      payload: {
        sub: payload.sub as string,
        type: payload.type as NotificationType | 'all_marketing',
        purpose: 'unsubscribe',
      },
    };
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      return { valid: false, error: 'expired' };
    }
    return { valid: false, error: 'invalid' };
  }
}

/**
 * Generate a full unsubscribe URL with embedded token.
 */
export async function generateUnsubscribeUrl(
  userId: string,
  notificationType: NotificationType | 'all_marketing',
  baseUrl = 'https://admin.patina.cloud'
): Promise<string> {
  const token = await generateUnsubscribeToken(userId, notificationType);
  return `${baseUrl}/preferences?token=${encodeURIComponent(token)}`;
}
