// Supabase Edge Function: proposal-nudge
//
// Invoked by useNudgeProposal after nudge_proposal() stamps last_nudged_at.
// Sends the client a gentle reminder about a proposal that's still in their
// hands (sent/viewed), with a link to client.patina.cloud/proposals/{id}.
// Mirrors proposal-send (same Resend path, sender, and client-portal link);
// the copy is a reminder rather than a first delivery. Does NOT mutate proposal
// state — the RPC already stamped the nudge.

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
  status: string;
  cc_email: string | null;
  valid_until: string | null;
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
      id, title, status, cc_email, valid_until,
      designer:profiles!designer_id(full_name, email),
      client:profiles!client_id(full_name, email)
    `
    )
    .eq('id', proposalId)
    .single();

  if (error || !data) {
    console.error('proposal-nudge: lookup failed', error);
    return new Response(JSON.stringify({ error: 'proposal_not_found' }), { status: 404 });
  }

  const proposal = data as unknown as ProposalRow;

  // A nudge only makes sense while the proposal is in the client's hands.
  if (proposal.status !== 'sent' && proposal.status !== 'viewed') {
    console.warn('proposal-nudge: not nudgeable', proposalId, proposal.status);
    return new Response(JSON.stringify({ error: 'not_nudgeable', status: proposal.status }), {
      status: 422,
    });
  }

  const recipient = proposal.client?.email;
  if (!recipient) {
    console.warn('proposal-nudge: no client email for proposal', proposalId);
    return new Response(JSON.stringify({ error: 'no_recipient' }), { status: 422 });
  }

  const designerName = proposal.designer?.full_name ?? 'Your designer';
  const clientName = proposal.client?.full_name ?? 'there';
  const link = `${CLIENT_PORTAL_URL}/proposals/${proposal.id}`;
  const expiryLine = proposal.valid_until
    ? `<p style="margin:0 0 12px;color:#766a5c"><em>It&rsquo;s open for your review through ${formatDate(
        proposal.valid_until
      )}.</em></p>`
    : '';

  const subject = `A gentle reminder about your proposal: "${proposal.title}"`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#2c2926;line-height:1.55">
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>Just a gentle nudge — ${escapeHtml(designerName)}&rsquo;s proposal <strong>${escapeHtml(
        proposal.title
      )}</strong> is still waiting for you whenever you have a moment to review it.</p>
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
    console.error('proposal-nudge: Resend failed', res.status, text);
    return new Response(JSON.stringify({ error: 'send_failed', detail: text }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
