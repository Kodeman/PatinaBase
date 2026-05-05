import { Resend } from 'resend';
import type { ReactElement } from 'react';
import { SignJWT } from 'jose';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Default sender addresses. Reads from env so transactional and marketing
 * can use separate verified subdomains (better deliverability) once DNS is
 * set up. Falls back to the single verified domain on patina.cloud.
 *
 * Recommended production config:
 *   RESEND_FROM_TRANSACTIONAL = "Patina <hello@patina.cloud>"
 *   RESEND_FROM_MARKETING     = "Patina <mail@mail.patina.cloud>"
 *
 * See infra/runbooks/email-domains.md for the DNS verification steps.
 */
const SENDERS = {
  transactional:
    process.env.RESEND_FROM_TRANSACTIONAL ??
    process.env.RESEND_FROM ??
    'Patina <hello@patina.cloud>',
  marketing:
    process.env.RESEND_FROM_MARKETING ??
    process.env.RESEND_FROM ??
    'Patina <hello@patina.cloud>',
};

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY environment variable is required');
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Send a single email via Resend.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const resend = getResendClient();

  try {
    const { data, error } = await resend.emails.send({
      from: options.from ?? SENDERS.transactional,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      react: options.react,
      replyTo: options.replyTo,
      headers: options.headers,
      tags: options.tags,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown send error',
    };
  }
}

export interface SendHtmlEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

/**
 * Send a raw-HTML email via Resend. Used for admin-composed messages that
 * don't have a React Email template.
 */
export async function sendHtmlEmail(options: SendHtmlEmailOptions): Promise<SendEmailResult> {
  const resend = getResendClient();

  try {
    const { data, error } = await resend.emails.send({
      from: options.from ?? SENDERS.transactional,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      headers: options.headers,
      tags: options.tags,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown send error',
    };
  }
}

/**
 * Send a batch of emails via Resend Batch API.
 */
export async function sendBatchEmails(
  emails: SendEmailOptions[]
): Promise<SendEmailResult[]> {
  const resend = getResendClient();

  try {
    const { data, error } = await resend.batch.send(
      emails.map((email) => ({
        from: email.from ?? SENDERS.marketing,
        to: Array.isArray(email.to) ? email.to : [email.to],
        subject: email.subject,
        react: email.react,
        replyTo: email.replyTo,
        headers: email.headers,
        tags: email.tags,
      }))
    );

    if (error) {
      return emails.map(() => ({ success: false, error: error.message }));
    }

    return (data?.data ?? []).map((item) => ({
      success: true,
      id: item.id,
    }));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown batch error';
    return emails.map(() => ({ success: false, error: errorMsg }));
  }
}

/**
 * Generate a List-Unsubscribe header value for CAN-SPAM compliance.
 */
export function generateUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export { SENDERS };

// ─── Compliance wrapper ────────────────────────────────────────────────────

export type SendCategory =
  | 'transactional'
  | 'operational'
  | 'engagement'
  | 'marketing';

export interface CompliantSendOptions {
  to: string | string[];
  subject: string;
  /** React Email element (preferred) — mutually exclusive with html. */
  react?: ReactElement;
  html?: string;
  text?: string;
  cc?: string | string[];
  replyTo?: string;
  from?: string;

  /** Recipient user id — enables unsubscribe token. */
  userId?: string;
  /** e.g. 'price_drop', 'product_launch'. Defaults to 'all_marketing'. */
  notificationType?: string;
  /** Category controls whether unsubscribe headers are injected. */
  category: SendCategory;

  /** Base URL for the unsubscribe link target. */
  unsubscribeBaseUrl?: string;
  /** Resend tags. */
  tags?: Array<{ name: string; value: string }>;
  /** Extra header overrides (merged with auto-generated headers). */
  headers?: Record<string, string>;
}

function getUnsubscribeSecretKey(): Uint8Array {
  const secret =
    process.env.UNSUBSCRIBE_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      'UNSUBSCRIBE_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY required for compliant send',
    );
  }
  return new TextEncoder().encode(secret);
}

async function generateUnsubscribeUrl(
  userId: string,
  notificationType: string,
  baseUrl: string,
): Promise<string> {
  const secretKey = getUnsubscribeSecretKey();
  const token = await new SignJWT({
    type: notificationType,
    purpose: 'unsubscribe',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('72h')
    .setIssuer('patina:notifications')
    .sign(secretKey);
  return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Send an email through Resend with auto-injected List-Unsubscribe headers
 * (for non-transactional categories). Suppression check is the caller's
 * responsibility — for full suppression-aware sends from edge functions, use
 * supabase/functions/_shared/send-email.ts instead.
 */
export async function sendCompliantEmail(
  options: CompliantSendOptions,
): Promise<SendEmailResult> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };

  if (options.category !== 'transactional' && options.userId) {
    try {
      const baseUrl = options.unsubscribeBaseUrl || 'https://admin.patina.cloud';
      const url = await generateUnsubscribeUrl(
        options.userId,
        options.notificationType ?? 'all_marketing',
        baseUrl,
      );
      Object.assign(headers, generateUnsubscribeHeaders(url));
    } catch (err) {
      console.warn('sendCompliantEmail: failed to inject unsubscribe headers', err);
    }
  }

  const from =
    options.from ??
    (options.category === 'marketing' ? SENDERS.marketing : SENDERS.transactional);

  if (options.react) {
    return sendEmail({
      to: options.to,
      subject: options.subject,
      react: options.react,
      from,
      replyTo: options.replyTo,
      headers,
      tags: options.tags,
    });
  }

  if (!options.html) {
    return { success: false, error: 'sendCompliantEmail: react or html is required' };
  }

  return sendHtmlEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    from,
    replyTo: options.replyTo,
    headers,
    tags: options.tags,
  });
}
