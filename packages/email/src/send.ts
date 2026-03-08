import { Resend } from 'resend';
import type { ReactElement } from 'react';

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

/** Default sender addresses by subdomain. */
const SENDERS = {
  transactional: 'Patina <hello@notify.patina.com>',
  marketing: 'Patina <hello@mail.patina.com>',
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
