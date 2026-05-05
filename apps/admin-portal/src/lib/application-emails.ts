import { sendCompliantEmail } from '@patina/email/send';
import { createAdminClient } from '@patina/supabase/client';
import type { ApplicationType } from './applications';

interface ApplicantLike {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  contact_name?: string;
  brand_name?: string;
  company?: string | null;
}

function substitute(content: string, vars: Record<string, string>) {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => vars[key] ?? '');
}

function buildVars(application: ApplicantLike): Record<string, string> {
  return {
    email: application.email,
    first_name: application.first_name ?? '',
    last_name: application.last_name ?? '',
    contact_name: application.contact_name ?? '',
    brand_name: application.brand_name ?? '',
    company: application.company ?? '',
  };
}

export interface SendApplicationEmailInput {
  type: ApplicationType;
  application: ApplicantLike;
  subject: string;
  html: string;
  text?: string;
  presetSlug?: string | null;
  /** 'admin_applications' for manual sends; 'status_change' for auto-triggered. */
  source: 'admin_applications' | 'status_change';
  sentBy: string | null;
}

/**
 * Sends a templated HTML email to an applicant and logs it into
 * application_communications. Shared between the manual POST /email endpoint
 * and the auto-trigger from PATCH.
 */
export async function sendApplicationEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  input: SendApplicationEmailInput,
): Promise<{
  success: boolean;
  error?: string;
  providerId?: string;
  communication: any;
}> {
  const vars = buildVars(input.application);
  const subject = substitute(input.subject, vars);
  const html = substitute(input.html, vars);
  const text = input.text ? substitute(input.text, vars) : undefined;

  // Application emails go to people who haven't signed up yet — they don't
  // have a profile id, so suppression check + signed unsubscribe token can't
  // be applied here. Treat as transactional (no List-Unsubscribe). Once
  // approved and onboarded, subsequent comms run through notify() and pick
  // up the user's preferences automatically.
  const result = await sendCompliantEmail({
    to: input.application.email,
    subject,
    html,
    text,
    category: 'transactional',
    tags: [
      { name: 'source', value: input.source },
      { name: 'application_type', value: input.type },
      ...(input.presetSlug ? [{ name: 'preset', value: input.presetSlug }] : []),
    ],
  });

  const { data: logRow } = await (adminClient as any)
    .from('application_communications')
    .insert({
      application_type: input.type,
      application_id: input.application.id,
      sent_by: input.sentBy,
      channel: 'email',
      template_id: null,
      subject,
      body_html: html,
      body_text: text ?? null,
      to_email: input.application.email,
      provider_id: result.id ?? null,
      status: result.success ? 'sent' : 'failed',
      error: result.success ? null : result.error ?? null,
    })
    .select()
    .single();

  return {
    success: result.success,
    error: result.error,
    providerId: result.id,
    communication: logRow,
  };
}
