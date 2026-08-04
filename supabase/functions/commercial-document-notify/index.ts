// Supabase Edge Function: commercial-document-notify
// Authenticated, replay-safe commercial transition notifications for design
// services, working-budget checkpoints, and later FF&E authorization waves.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { renderCommercialEmail, type CommercialTransition } from './core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';
const DESIGNER_PORTAL_URL = Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';

const TRANSITIONS = new Set<CommercialTransition>([
  'client_signed',
  'executed',
  'budget_published',
  'furnishings_sent',
  'furnishings_executed',
  'deposit_ready',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProposalRow {
  id: string;
  title: string;
  client_id: string;
  designer_id: string;
  document_kind: string;
  commercial_state: string | null;
  signed_by_name: string | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
  designer: { id: string; full_name: string | null; email: string | null } | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jwtRole(authorization: string): string | null {
  try {
    const token = authorization.replace(/^Bearer\s+/i, '');
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
    return typeof decoded?.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
}

function expectedState(transition: CommercialTransition, state: string | null): boolean {
  if (transition === 'client_signed') return state === 'client_signed' || state === 'executed';
  if (transition === 'furnishings_sent') {
    return state === 'sent' || state === 'client_signed' || state === 'executed';
  }
  if (transition === 'budget_published') return state === 'executed';
  return state === 'executed';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401);

  let documentId: string;
  let transition: CommercialTransition;
  try {
    const body = await req.json();
    documentId = typeof body?.documentId === 'string' ? body.documentId : '';
    transition = body?.transition;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!documentId || !TRANSITIONS.has(transition)) {
    return json({ error: 'invalid_transition' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin
    .from('proposals')
    .select(`
      id, title, client_id, designer_id, document_kind, commercial_state, signed_by_name,
      client:profiles!client_id(id, full_name, email),
      designer:profiles!designer_id(id, full_name, email)
    `)
    .eq('id', documentId)
    .maybeSingle();
  if (error) {
    console.error('commercial-document-notify: document lookup failed', error);
    return json({ error: 'lookup_failed' }, 500);
  }
  const proposal = data as unknown as ProposalRow | null;
  if (!proposal) return json({ error: 'document_not_found' }, 404);

  const role = jwtRole(authorization);
  if (role !== 'service_role') {
    const callerClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData } = await callerClient.auth.getUser();
    const callerId = authData.user?.id;
    if (!callerId || (callerId !== proposal.client_id && callerId !== proposal.designer_id)) {
      return json({ error: 'document_not_found' }, 404);
    }
  }

  if (!expectedState(transition, proposal.commercial_state)) {
    return json({ error: 'transition_not_committed' }, 409);
  }

  const { data: serviceTerms } = await admin
    .from('proposal_service_terms')
    .select('billing_ceiling_cents, retainer_amount_cents')
    .eq('proposal_id', documentId)
    .maybeSingle();

  const audiences: Array<'client' | 'studio'> =
    transition === 'client_signed' || transition === 'furnishings_executed'
      ? ['client', 'studio']
      : transition === 'executed' || transition === 'budget_published' ||
          transition === 'furnishings_sent' || transition === 'deposit_ready'
        ? ['client']
        : ['studio'];
  const results: Record<string, unknown> = {};

  for (const audience of audiences) {
    const recipient = audience === 'client' ? proposal.client : proposal.designer;
    if (!recipient?.email) {
      results[audience] = { skipped: 'recipient_missing' };
      continue;
    }
    const portalUrl = audience === 'studio'
      ? `${DESIGNER_PORTAL_URL}/doc/${documentId}`
      : transition === 'budget_published'
        ? `${CLIENT_PORTAL_URL}/budget`
        : transition === 'deposit_ready'
          ? `${CLIENT_PORTAL_URL}/invoices`
          : `${CLIENT_PORTAL_URL}/proposals/${documentId}`;
    const rendered = renderCommercialEmail({
      transition,
      audience,
      documentTitle: proposal.title,
      documentKind: proposal.document_kind,
      signerName: proposal.signed_by_name,
      recipientName: recipient.full_name,
      counterpartyName: audience === 'client'
        ? proposal.designer?.full_name
        : proposal.client?.full_name,
      portalUrl,
      ceilingCents: (serviceTerms as any)?.billing_ceiling_cents ?? null,
      retainerCents: (serviceTerms as any)?.retainer_amount_cents ?? null,
    });
    const sendResult = await sendCompliantEmail(admin, {
      to: recipient.email,
      subject: rendered.subject,
      html: rendered.html,
      userId: recipient.id,
      notificationType: `commercial_${transition}`,
      category: 'operational',
      templateId: `commercial-${transition}-${audience}`,
      idempotencyKey: `commercial-document/${documentId}/${transition}/${recipient.id}`,
      failClosedPolicyReads: true,
      metadata: {
        proposal_id: documentId,
        document_kind: proposal.document_kind,
        transition,
        subject: rendered.subject,
        message: rendered.message,
        deep_link: portalUrl.replace(CLIENT_PORTAL_URL, '').replace(DESIGNER_PORTAL_URL, ''),
      },
    });
    if (!sendResult.success && !sendResult.suppressed) {
      return json({ error: 'send_failed', audience, detail: sendResult.error }, 502);
    }
    results[audience] = {
      suppressed: sendResult.suppressed ?? false,
      logId: sendResult.logId,
    };
  }

  return json({ ok: true, results });
});
