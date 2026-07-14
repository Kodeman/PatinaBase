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
import {
  renderBrandedShell,
  heading,
  paragraph,
  muted,
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
  status: string;
  cc_email: string | null;
  valid_until: string | null;
  client_id: string | null;
  designer_id: string | null;
  project_id: string | null;
  designer: { full_name: string | null; email: string | null } | null;
  client: { full_name: string | null; email: string | null } | null;
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
      id, title, status, cc_email, valid_until, client_id,
      designer_id, project_id,
      designer:profiles!designer_id(full_name, email),
      client:profiles!client_id(full_name, email)
    `
    )
    .eq('id', proposalId)
    .single();

  if (error || !data) {
    console.error('proposal-nudge: lookup failed', error);
    return json({ error: 'proposal_not_found' }, 404);
  }

  const proposal = data as unknown as ProposalRow;

  // A nudge only makes sense while the proposal is in the client's hands.
  if (proposal.status !== 'sent' && proposal.status !== 'viewed') {
    console.warn('proposal-nudge: not nudgeable', proposalId, proposal.status);
    return json({ error: 'not_nudgeable', status: proposal.status }, 422);
  }

  const recipient = proposal.client?.email;
  if (!recipient) {
    console.warn('proposal-nudge: no client email for proposal', proposalId);
    return json({ error: 'no_recipient' }, 422);
  }

  // Cadence gate — clients on the daily digest don't get a direct nudge email.
  // Instead we write an in-app row (type 'proposal_nudge') that the
  // notification-digest cron batches into one daily summary. `immediate`
  // (the default) falls through to the email path below, unchanged.
  if (proposal.client_id) {
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('reminder_cadence')
      .eq('user_id', proposal.client_id)
      .maybeSingle();

    if (pref?.reminder_cadence === 'daily_digest') {
      const deepLink = `/proposals/${proposal.id}`;
      try {
        const { data: existing } = await supabase
          .from('notification_log')
          .select('id, metadata')
          .eq('user_id', proposal.client_id)
          .eq('type', 'proposal_nudge')
          .eq('channel', 'in_app')
          .contains('metadata', { deep_link: deepLink })
          .limit(5);

        // Skip if an unread nudge for this proposal is already queued so a
        // repeated nudge doesn't stack duplicate rows in one digest window.
        const hasUnreadDuplicate = ((existing ?? []) as Array<{ metadata: any }>).some(
          (row) => !row.metadata?.read_at
        );

        if (!hasUnreadDuplicate) {
          const { error: notifyErr } = await supabase.from('notification_log').insert({
            user_id: proposal.client_id,
            type: 'proposal_nudge',
            channel: 'in_app',
            status: 'delivered',
            template_id: 'proposal-nudge',
            metadata: {
              proposal_id: proposal.id,
              subject: 'A reminder about your proposal',
              message: proposal.title,
              deep_link: deepLink,
            },
          });
          if (notifyErr) {
            console.error('proposal-nudge: in-app insert failed', notifyErr);
          }
        }
      } catch (notifyErr) {
        console.error('proposal-nudge: in-app insert threw', notifyErr);
      }

      return json({ ok: true, deferred: 'digest' });
    }
  }

  // Studio co-brand (Designer Studios). Prefer a linked project's studio,
  // otherwise the designer's primary studio.
  const identity = await resolveStudioIdentity(supabase, {
    projectId: proposal.project_id,
    designerId: proposal.designer_id,
  });
  const designerName = proposal.designer?.full_name ?? identity?.name ?? 'Your designer';
  const senderName = studioDisplayName(identity, designerName);
  const cobrand = studioCobrand(identity);
  const clientName = proposal.client?.full_name ?? 'there';
  const link = `${CLIENT_PORTAL_URL}/proposals/${proposal.id}`;
  const expiryLine = proposal.valid_until
    ? muted(
        `<em>It&rsquo;s open for your review through ${formatDate(proposal.valid_until)}.</em>`
      )
    : '';

  // Lead the subject with the studio/sender when one resolves; otherwise keep
  // the original generic reminder subject verbatim.
  const subject = identity?.name
    ? `A reminder from ${senderName} about your proposal: "${proposal.title}"`
    : `A gentle reminder about your proposal: "${proposal.title}"`;
  const html = renderBrandedShell({
    title: subject,
    preview: `${designerName}'s proposal is still waiting for your review.`,
    eyebrow: 'Reminder',
    studioName: cobrand.studioName,
    studioLogoUrl: cobrand.studioLogoUrl,
    body: [
      heading('A gentle reminder'),
      paragraph(`Hi ${escapeHtml(clientName)},`),
      paragraph(
        `Just a gentle nudge — ${escapeHtml(designerName)}&rsquo;s proposal <strong>${escapeHtml(
          proposal.title
        )}</strong> is still waiting for you whenever you have a moment to review it.`
      ),
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

  if (!res.ok) {
    const text = await res.text();
    console.error('proposal-nudge: Resend failed', res.status, text);
    return json({ error: 'send_failed', detail: text }, 502);
  }

  return json({ ok: true });
});
