// Supabase Edge Function: commercial-document-notify
// Authenticated, replay-safe commercial transition notifications for design
// services, working-budget checkpoints, and later FF&E authorization waves.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { renderCommercialEmail, type CommercialTransition } from './core.ts';
import {
  assessCommercialTransition,
  commercialNotificationEventKey,
  type CommercialActorRole,
  type CommercialTransitionEvidence,
} from './policy.ts';

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
  'trade_scope_sent',
  'trade_scope_executed',
  'trade_scope_accepted',
  'trade_draw_ready',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProposalRow {
  id: string;
  title: string;
  client_id: string;
  project_id: string | null;
  designer_id: string;
  document_kind: string;
  commercial_state: string | null;
  signed_by_name: string | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
  designer: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401);

  let documentId: string;
  let transition: CommercialTransition;
  let eventId: string | null = null;
  try {
    const body = await req.json();
    documentId = typeof body?.documentId === 'string' ? body.documentId : '';
    transition = body?.transition;
    eventId = typeof body?.eventId === 'string' ? body.eventId : null;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const notificationEventKey = TRANSITIONS.has(transition)
    ? commercialNotificationEventKey(transition, documentId, eventId)
    : null;
  if (!documentId || !TRANSITIONS.has(transition) || !notificationEventKey) {
    return json({ error: 'invalid_transition' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin
    .from('proposals')
    .select(
      `
      id, title, client_id, project_id, designer_id, document_kind, commercial_state, signed_by_name,
      client:profiles!client_id(id, full_name, email),
      designer:profiles!designer_id(id, full_name, email)
    `
    )
    .eq('id', documentId)
    .maybeSingle();
  if (error) {
    console.error('commercial-document-notify: document lookup failed', error);
    return json({ error: 'lookup_failed' }, 500);
  }
  const proposal = data as unknown as ProposalRow | null;
  if (!proposal) return json({ error: 'document_not_found' }, 404);

  const role = jwtRole(authorization);
  let actorRole: CommercialActorRole = role === 'service_role' ? 'service' : 'unknown';
  if (actorRole !== 'service') {
    const callerClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData } = await callerClient.auth.getUser();
    const callerId = authData.user?.id;
    if (callerId === proposal.client_id) actorRole = 'client';
    if (callerId === proposal.designer_id) actorRole = 'studio';
    if (callerId && actorRole === 'unknown') {
      const { data: actorMemberships } = await admin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', callerId)
        .eq('status', 'active')
        .neq('role', 'guest');
      const organizationIds = (actorMemberships ?? []).map((row: any) => row.organization_id);
      if (organizationIds.length > 0) {
        const { data: ownerMemberships } = await admin
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', proposal.designer_id)
          .eq('status', 'active')
          .neq('role', 'guest')
          .in('organization_id', organizationIds);
        const sharedIds = (ownerMemberships ?? []).map((row: any) => row.organization_id);
        if (sharedIds.length > 0) {
          const { count } = await admin
            .from('organizations')
            .select('id', { count: 'exact', head: true })
            .in('id', sharedIds)
            .eq('type', 'design_studio')
            .eq('status', 'active');
          if ((count ?? 0) > 0) actorRole = 'studio';
        }
      }
    }
    if (!callerId || actorRole === 'unknown') {
      return json({ error: 'document_not_found' }, 404);
    }
  }

  const { data: signatureRows, error: signatureError } = await admin
    .from('commercial_document_signatures')
    .select('party_role')
    .eq('proposal_id', documentId);
  const { data: documentRow, error: documentError } = await admin
    .from('project_commercial_documents')
    .select('project_id, document_kind, executed_at, budget_checkpoint_id, deposit_invoice_id')
    .eq('proposal_id', documentId)
    .maybeSingle();
  if (signatureError || documentError) {
    console.error('commercial-document-notify: evidence lookup failed', signatureError ?? documentError);
    return json({ error: 'lookup_failed' }, 500);
  }

  const checkpointId =
    transition === 'budget_published' ? eventId : ((documentRow as any)?.budget_checkpoint_id ?? null);
  let checkpointRow: any = null;
  let currentBudgetVersionId: string | null = null;
  if (checkpointId) {
    const { data: checkpoint, error: checkpointError } = await admin
      .from('project_budget_checkpoints')
      .select('id, project_id, budget_version_id, status, published_at')
      .eq('id', checkpointId)
      .maybeSingle();
    if (checkpointError) {
      console.error('commercial-document-notify: checkpoint lookup failed', checkpointError);
      return json({ error: 'lookup_failed' }, 500);
    }
    checkpointRow = checkpoint;
    const evidenceProjectId = (documentRow as any)?.project_id ?? null;
    if (evidenceProjectId) {
      const { data: currentBudgetVersion, error: currentBudgetVersionError } = await admin
        .from('project_budget_versions')
        .select('id')
        .eq('project_id', evidenceProjectId)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (currentBudgetVersionError) {
        console.error('commercial-document-notify: current budget version lookup failed', currentBudgetVersionError);
        return json({ error: 'lookup_failed' }, 500);
      }
      currentBudgetVersionId = currentBudgetVersion?.id ?? null;
    }
  }

  let invoiceRow: any = null;
  const depositInvoiceId = (documentRow as any)?.deposit_invoice_id ?? null;
  if (transition === 'deposit_ready' && depositInvoiceId) {
    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select('id, project_id, status')
      .eq('id', depositInvoiceId)
      .maybeSingle();
    if (invoiceError) {
      console.error('commercial-document-notify: deposit invoice lookup failed', invoiceError);
      return json({ error: 'lookup_failed' }, 500);
    }
    invoiceRow = invoice;
  }

  let tradeScopeTermsRow: any = null;
  if (transition === 'trade_scope_accepted') {
    const { data: termsRow, error: termsError } = await admin
      .from('trade_scope_terms')
      .select('accepted_at, accepted_signed_name')
      .eq('proposal_id', documentId)
      .maybeSingle();
    if (termsError) {
      console.error('commercial-document-notify: trade scope terms lookup failed', termsError);
      return json({ error: 'lookup_failed' }, 500);
    }
    tradeScopeTermsRow = termsRow;
  }

  let tradeScopeDrawRow: any = null;
  let tradeScopeDrawInvoiceRow: any = null;
  if (transition === 'trade_draw_ready' && eventId) {
    const { data: drawRow, error: drawError } = await admin
      .from('trade_scope_draws')
      .select('id, invoice_id')
      .eq('id', eventId)
      .eq('proposal_id', documentId)
      .maybeSingle();
    if (drawError) {
      console.error('commercial-document-notify: trade scope draw lookup failed', drawError);
      return json({ error: 'lookup_failed' }, 500);
    }
    tradeScopeDrawRow = drawRow;
    if ((drawRow as any)?.invoice_id) {
      const { data: drawInvoice, error: drawInvoiceError } = await admin
        .from('invoices')
        .select('id, status')
        .eq('id', (drawRow as any).invoice_id)
        .maybeSingle();
      if (drawInvoiceError) {
        console.error('commercial-document-notify: trade scope draw invoice lookup failed', drawInvoiceError);
        return json({ error: 'lookup_failed' }, 500);
      }
      tradeScopeDrawInvoiceRow = drawInvoice;
    }
  }

  const signatures = new Set((signatureRows ?? []).map((row: any) => row.party_role));
  const evidence: CommercialTransitionEvidence = {
    clientSignature: signatures.has('client'),
    studioSignature: signatures.has('studio'),
    projectDocument: documentRow
      ? {
          projectId: String((documentRow as any).project_id),
          documentKind: String((documentRow as any).document_kind),
          executedAt: (documentRow as any).executed_at ?? null,
          budgetCheckpointId: (documentRow as any).budget_checkpoint_id ?? null,
          depositInvoiceId: (documentRow as any).deposit_invoice_id ?? null,
        }
      : null,
    budgetCheckpoint: checkpointRow
      ? {
          id: String(checkpointRow.id),
          projectId: String(checkpointRow.project_id),
          status: String(checkpointRow.status),
          publishedAt: checkpointRow.published_at ?? null,
          isCurrent: checkpointRow.budget_version_id === currentBudgetVersionId,
        }
      : null,
    depositInvoice: invoiceRow
      ? {
          id: String(invoiceRow.id),
          projectId: String(invoiceRow.project_id),
          status: String(invoiceRow.status),
        }
      : null,
    tradeScopeTerms: tradeScopeTermsRow
      ? { acceptedAt: (tradeScopeTermsRow as any).accepted_at ?? null }
      : null,
    tradeScopeDraw: tradeScopeDrawRow
      ? {
          id: String((tradeScopeDrawRow as any).id),
          invoiceStatus: tradeScopeDrawInvoiceRow?.status ?? null,
        }
      : null,
  };
  const policy = assessCommercialTransition({
    actorRole,
    transition,
    documentKind: proposal.document_kind,
    commercialState: proposal.commercial_state,
    eventId,
    evidence,
  });
  if (!policy.allowed) {
    const status = policy.reason === 'actor_not_allowed' ? 403 : 409;
    return json({ error: policy.reason }, status);
  }

  const { data: serviceTerms } = await admin
    .from('proposal_service_terms')
    .select('billing_ceiling_cents, retainer_amount_cents')
    .eq('proposal_id', documentId)
    .maybeSingle();

  const audiences: Array<'client' | 'studio'> =
    transition === 'client_signed' ||
      transition === 'furnishings_executed' ||
      transition === 'trade_scope_executed'
      ? ['client', 'studio']
      : transition === 'executed' ||
          transition === 'budget_published' ||
          transition === 'furnishings_sent' ||
          transition === 'deposit_ready' ||
          transition === 'trade_scope_sent' ||
          transition === 'trade_draw_ready'
        ? ['client']
        : ['studio'];
  const results: Record<string, unknown> = {};

  for (const audience of audiences) {
    const recipient = audience === 'client' ? proposal.client : proposal.designer;
    if (!recipient?.email) {
      results[audience] = { skipped: 'recipient_missing' };
      continue;
    }
    const portalUrl =
      audience === 'studio'
        ? `${DESIGNER_PORTAL_URL}/doc/${documentId}`
        : transition === 'budget_published'
          ? `${CLIENT_PORTAL_URL}/budget`
          : transition === 'deposit_ready' || transition === 'trade_draw_ready'
            ? `${CLIENT_PORTAL_URL}/invoices`
            : `${CLIENT_PORTAL_URL}/proposals/${documentId}`;
    const signerName = transition === 'trade_scope_accepted'
      ? ((tradeScopeTermsRow as any)?.accepted_signed_name ?? proposal.signed_by_name)
      : proposal.signed_by_name;
    const rendered = renderCommercialEmail({
      transition,
      audience,
      documentTitle: proposal.title,
      documentKind: proposal.document_kind,
      signerName,
      recipientName: recipient.full_name,
      counterpartyName: audience === 'client' ? proposal.designer?.full_name : proposal.client?.full_name,
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
      idempotencyKey: `commercial-document/${notificationEventKey}/${transition}/${recipient.id}`,
      failClosedPolicyReads: true,
      metadata: {
        proposal_id: documentId,
        budget_checkpoint_id: transition === 'budget_published' ? eventId : null,
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
