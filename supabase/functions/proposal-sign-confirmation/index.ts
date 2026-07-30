// Supabase Edge Function: proposal-sign-confirmation
//
// Invoked after a client signs a proposal (from the client-portal sign API
// route) AND from the designer's "Send Confirmation" button on the signed
// page. Sends two emails:
//   1. Receipt to the client (their copy of the signed scope).
//   2. Notification to the designer (proposal X has been signed).

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  renderBrandedShell,
  heading,
  paragraph,
  muted,
  ctaButton,
  spacer,
  escapeHtml,
} from '../_shared/branded-email.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = Deno.env.get('RESEND_FROM') ?? 'hello@patina.cloud';
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';
const DESIGNER_PORTAL_URL = Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProposalRow {
  id: string;
  title: string;
  total_amount: number | null;
  signed_at: string | null;
  signed_by_name: string | null;
  designer: { full_name: string | null; email: string | null } | null;
  client: { full_name: string | null; email: string | null } | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; detail?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: opts.to, subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, detail };
  }
  return { ok: true };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let proposalId: string | undefined;
  try {
    const body = await req.json();
    proposalId = body?.proposalId;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!proposalId) {
    return json({ error: 'proposalId_required' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('proposals')
    .select(
      `
      id, title, total_amount, signed_at, signed_by_name,
      designer:profiles!designer_id(full_name, email),
      client:profiles!client_id(full_name, email)
    `
    )
    .eq('id', proposalId)
    .single();

  if (error || !data) {
    console.error('proposal-sign-confirmation: lookup failed', error);
    return json({ error: 'proposal_not_found' }, 404);
  }

  const proposal = data as unknown as ProposalRow;
  const signedAt = proposal.signed_at ?? new Date().toISOString();
  const signerName = proposal.signed_by_name ?? proposal.client?.full_name ?? 'Client';
  const designerName = proposal.designer?.full_name ?? 'your designer';
  const totalLine = proposal.total_amount
    ? paragraph(`<strong>Investment:</strong> ${formatCurrency(proposal.total_amount)}`)
    : '';

  const results: Record<string, unknown> = { client: false, designer: false };

  if (proposal.client?.email) {
    const link = `${CLIENT_PORTAL_URL}/proposals/${proposal.id}`;
    const html = renderBrandedShell({
      title: `Signed: "${proposal.title}"`,
      preview: `Your signed copy of ${proposal.title}, for your records.`,
      eyebrow: 'Signed',
      body: [
        heading('Thanks for signing'),
        paragraph(`Hi ${escapeHtml(proposal.client.full_name ?? 'there')},`),
        paragraph(
          `Thanks for signing &ldquo;<strong>${escapeHtml(
            proposal.title
          )}</strong>&rdquo;. Your designer is now activating your project.`
        ),
        totalLine,
        paragraph(`<strong>Signed:</strong> ${formatDate(signedAt)} by ${escapeHtml(signerName)}`),
        spacer(10),
        ctaButton(link, 'View proposal', 'ink'),
        spacer(),
        muted('— Patina'),
      ].join(''),
    });
    const { ok, detail } = await sendEmail({
      to: proposal.client.email,
      subject: `Signed: "${proposal.title}"`,
      html,
    });
    results.client = ok ? true : detail;
  }

  if (proposal.designer?.email) {
    const link = `${DESIGNER_PORTAL_URL}/doc/${proposal.id}`;
    const html = renderBrandedShell({
      title: `Signed: "${proposal.title}"`,
      preview: `${signerName} just signed ${proposal.title}.`,
      eyebrow: 'Proposal signed',
      body: [
        heading('Your proposal was signed'),
        paragraph(`Hi ${escapeHtml(designerName)},`),
        paragraph(
          `<strong>${escapeHtml(signerName)}</strong> just signed &ldquo;<strong>${escapeHtml(
            proposal.title
          )}</strong>&rdquo;.`
        ),
        totalLine,
        spacer(10),
        ctaButton(link, 'Activate project', 'ink'),
        spacer(),
        muted('— Patina'),
      ].join(''),
    });
    const { ok, detail } = await sendEmail({
      to: proposal.designer.email,
      subject: `Signed: "${proposal.title}"`,
      html,
    });
    results.designer = ok ? true : detail;
  }

  return json({ ok: true, results });
});
