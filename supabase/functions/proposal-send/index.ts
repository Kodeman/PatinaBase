// Supabase Edge Function: proposal-send
//
// Invoked by useSendProposal after the proposal row flips to status='sent'.
// Loads the proposal, designer, and client, then emails the client a link
// to client.patina.cloud/proposals/{id} via Resend. CC the designer's
// optional cc_email if set.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = Deno.env.get('RESEND_FROM') ?? 'hello@patina.cloud';
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';

interface ProposalRow {
  id: string;
  title: string;
  personal_message: string | null;
  cc_email: string | null;
  valid_until: string | null;
  total_amount: number | null;
  designer: { full_name: string | null; email: string | null } | null;
  client: { full_name: string | null; email: string | null } | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let proposalId: string | undefined;
  try {
    const body = await req.json();
    proposalId = body?.proposalId;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 });
  }
  if (!proposalId) {
    return new Response(JSON.stringify({ error: 'proposalId_required' }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('proposals')
    .select(
      `
      id, title, personal_message, cc_email, valid_until, total_amount,
      designer:profiles!designer_id(full_name, email),
      client:profiles!client_id(full_name, email)
    `
    )
    .eq('id', proposalId)
    .single();

  if (error || !data) {
    console.error('proposal-send: lookup failed', error);
    return new Response(JSON.stringify({ error: 'proposal_not_found' }), { status: 404 });
  }

  const proposal = data as unknown as ProposalRow;
  const recipient = proposal.client?.email;
  if (!recipient) {
    console.warn('proposal-send: no client email for proposal', proposalId);
    return new Response(JSON.stringify({ error: 'no_recipient' }), { status: 422 });
  }

  const designerName = proposal.designer?.full_name ?? 'Your designer';
  const clientName = proposal.client?.full_name ?? 'there';
  const link = `${CLIENT_PORTAL_URL}/proposals/${proposal.id}`;
  const totalLine = proposal.total_amount
    ? `<p style="margin:0 0 12px"><strong>Investment:</strong> ${formatCurrency(proposal.total_amount)}</p>`
    : '';
  const expiryLine = proposal.valid_until
    ? `<p style="margin:0 0 12px;color:#766a5c"><em>Please review by ${formatDate(proposal.valid_until)}.</em></p>`
    : '';
  const personalBlock = proposal.personal_message
    ? `<blockquote style="border-left:3px solid #d4c8b0;padding:8px 16px;margin:16px 0;color:#3d3a36">${escapeHtml(
        proposal.personal_message
      )}</blockquote>`
    : '';

  const subject = `${designerName} sent you a proposal: "${proposal.title}"`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#2c2926;line-height:1.55">
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>${escapeHtml(designerName)} has prepared a design proposal for you: <strong>${escapeHtml(
        proposal.title
      )}</strong>.</p>
      ${personalBlock}
      ${totalLine}
      ${expiryLine}
      <p style="margin:24px 0">
        <a href="${link}" style="display:inline-block;background:#2c2926;color:#fff;padding:12px 24px;text-decoration:none;border-radius:3px">
          Review proposal
        </a>
      </p>
      <p style="font-size:12px;color:#766a5c">If the button doesn&rsquo;t work, copy this link: <br>${link}</p>
      <p style="margin-top:32px;color:#766a5c">— Patina</p>
    </div>
  `;

  const payload: Record<string, unknown> = {
    from: FROM_ADDRESS,
    to: recipient,
    subject,
    html,
  };
  if (proposal.cc_email) payload.cc = proposal.cc_email;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('proposal-send: Resend failed', res.status, text);
    return new Response(JSON.stringify({ error: 'send_failed', detail: text }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
