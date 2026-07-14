// Supabase Edge Function: proposal-send
//
// Invoked by useSendProposal after the proposal row flips to status='sent'
// (the send_proposal RPC already committed that transition — this function's
// email dispatch is best-effort and does NOT roll back the send on failure).
// Loads the proposal, designer, and client, then emails the client a link
// to client.patina.cloud/proposals/{id} via Resend. CC the designer's
// optional cc_email if set.
//
// Also writes an in-app notification_log row (channel: in_app) for the
// client so the client portal inbox/bell surfaces the waiting proposal —
// metadata.deep_link (`/proposals/{id}`) is what the bell's dedupe logic
// (apps/client-portal .../notification-bell.tsx) matches against the derived
// "awaiting proposal" item. Written regardless of the email outcome (it
// reflects the SEND, which already happened, not the email) and guarded by
// an unread-duplicate check so a retried/duplicate invocation doesn't stack
// duplicate bell entries.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  renderBrandedShell,
  heading,
  paragraph,
  muted,
  callout,
  ctaButton,
  spacer,
  escapeHtml,
} from '../_shared/branded-email.ts';
import {
  resolveStudioIdentity,
  studioCobrand,
  studioDisplayName,
} from '../_shared/studio-identity.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = Deno.env.get('RESEND_FROM') ?? 'hello@patina.cloud';
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProposalRow {
  id: string;
  title: string;
  personal_message: string | null;
  cc_email: string | null;
  valid_until: string | null;
  total_amount: number | null;
  client_id: string | null;
  designer_id: string | null;
  project_id: string | null;
  designer: { full_name: string | null; email: string | null } | null;
  client: { full_name: string | null; email: string | null } | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount / 100); // amount is in cents (proposals.total_amount)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
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
      id, title, personal_message, cc_email, valid_until, total_amount, client_id,
      designer_id, project_id,
      designer:profiles!designer_id(full_name, email),
      client:profiles!client_id(full_name, email)
    `
    )
    .eq('id', proposalId)
    .single();

  if (error || !data) {
    console.error('proposal-send: lookup failed', error);
    return json({ error: 'proposal_not_found' }, 404);
  }

  const proposal = data as unknown as ProposalRow;
  const recipient = proposal.client?.email;
  if (!recipient) {
    console.warn('proposal-send: no client email for proposal', proposalId);
    return json({ error: 'no_recipient' }, 422);
  }

  // Studio co-brand (Designer Studios). Proposals are typically sent before
  // activation into a project (project_id NULL), so resolve by the designer;
  // pass project_id too so a linked proposal still prefers its studio.
  const identity = await resolveStudioIdentity(supabase, {
    projectId: proposal.project_id,
    designerId: proposal.designer_id,
  });
  // Personal designer name stays in the greeting prose; fall back to the
  // resolver's studio/business name before the generic 'Your designer'.
  const designerName = proposal.designer?.full_name ?? identity?.name ?? 'Your designer';
  const senderName = studioDisplayName(identity, designerName);
  const cobrand = studioCobrand(identity);
  const clientName = proposal.client?.full_name ?? 'there';
  const link = `${CLIENT_PORTAL_URL}/proposals/${proposal.id}`;
  const totalLine = proposal.total_amount
    ? paragraph(`<strong>Investment:</strong> ${formatCurrency(proposal.total_amount)}`)
    : '';
  const expiryLine = proposal.valid_until
    ? muted(`<em>Please review by ${formatDate(proposal.valid_until)}.</em>`)
    : '';
  const personalBlock = proposal.personal_message
    ? callout(escapeHtml(proposal.personal_message))
    : '';

  const subject = `${senderName} sent you a proposal: "${proposal.title}"`;
  const html = renderBrandedShell({
    title: subject,
    preview: `${designerName} has prepared a design proposal for you.`,
    eyebrow: 'Proposal',
    studioName: cobrand.studioName,
    studioLogoUrl: cobrand.studioLogoUrl,
    body: [
      heading('Your proposal is ready'),
      paragraph(`Hi ${escapeHtml(clientName)},`),
      paragraph(
        `${escapeHtml(designerName)} has prepared a design proposal for you: <strong>${escapeHtml(
          proposal.title
        )}</strong>.`
      ),
      personalBlock,
      totalLine,
      expiryLine,
      spacer(10),
      ctaButton(link, 'Review proposal', 'ink'),
      spacer(),
      muted(`If the button doesn&rsquo;t work, copy this link:<br>${link}`),
      muted('— Patina'),
    ].join(''),
  });

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

  let emailOk = true;
  let emailErrorDetail: string | undefined;
  if (!res.ok) {
    emailErrorDetail = await res.text();
    console.error('proposal-send: Resend failed', res.status, emailErrorDetail);
    emailOk = false;
  }

  // In-app notification: reflects the SEND (already committed by send_proposal
  // before this function runs), not the email outcome — so this must run on
  // both the success and failure paths above. Never fails the request; a
  // notification hiccup must not surface as a send failure to the designer.
  if (proposal.client_id) {
    try {
      const deepLink = `/proposals/${proposal.id}`;
      const { data: existing, error: existingErr } = await supabase
        .from('notification_log')
        .select('id, metadata')
        .eq('user_id', proposal.client_id)
        .eq('type', 'proposal_sent')
        .eq('channel', 'in_app')
        .contains('metadata', { deep_link: deepLink })
        .limit(5);

      if (existingErr) {
        // Best-effort dedupe check — if it fails, fall through to insert
        // rather than silently dropping the notification.
        console.error('proposal-send: notification dedupe check failed', existingErr);
      }

      // Idempotency: skip if an unread row for this exact proposal already
      // exists, so a retried/duplicate invocation doesn't stack duplicate
      // unread bell entries. An already-read row means the client already saw
      // it, so a fresh send (e.g. after a revision) is still allowed through.
      const hasUnreadDuplicate = ((existing ?? []) as Array<{ metadata: any }>).some(
        (row) => !row.metadata?.read_at
      );

      if (!hasUnreadDuplicate) {
        const { error: notifyErr } = await supabase.from('notification_log').insert({
          user_id: proposal.client_id,
          type: 'proposal_sent',
          channel: 'in_app',
          status: 'delivered',
          template_id: 'proposal-sent',
          metadata: {
            proposal_id: proposal.id,
            subject: 'Proposal ready for your review',
            message: proposal.title,
            deep_link: deepLink,
          },
        });
        if (notifyErr) {
          console.error('proposal-send: notification insert failed', notifyErr);
        }
      }
    } catch (notifyErr) {
      console.error('proposal-send: notification insert threw', notifyErr);
    }
  } else {
    console.warn(
      'proposal-send: proposal has no client_id, skipping in-app notification',
      proposalId
    );
  }

  if (!emailOk) {
    return json({ error: 'send_failed', detail: emailErrorDetail }, 502);
  }

  return json({ ok: true });
});
