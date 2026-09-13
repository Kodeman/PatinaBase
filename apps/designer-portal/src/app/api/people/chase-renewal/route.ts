import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import {
  getAuthenticatedDesignerAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';

/**
 * POST /api/people/chase-renewal
 *
 * "Chase the renewal" files ONE draft on the agent queue and stops there: the
 * task lands `awaiting_review` and a person presses send. No automated
 * external sends is a standing rule.
 *
 * WHY THIS IS A ROUTE AND NOT AN `rpc()` FROM THE CARD (CR-3 / QA-1).
 * `enqueue_agent_task` is granted to `postgres`, `service_role` and
 * `agent_writer` ONLY (00484:1315-1317) — never to `authenticated`. The company
 * card called it straight from `createBrowserClient()`, which authenticates as
 * `authenticated`, so every press raised `permission denied for function
 * enqueue_agent_task` and wrote nothing. That grant is deliberate policy, not
 * an environment quirk: `agent_writer` is a NOLOGIN privilege role
 * (docs/agent-os/agent-roles-runbook.md) and a browser session is not an agent.
 *
 * The membership check is the caller's OWN RLS, not a second copy of the rule:
 * the firm's card is read back through the caller's session client, so a
 * caller who is not an active member of the studio that owns the card reads
 * nothing and the route refuses. Only then does the service-role client
 * enqueue.
 */

export const COMPLIANCE_CHASE_TASK_TYPE = 'compliance_chase';

interface ChaseRequestBody {
  companyId?: string;
  documentId?: string | null;
  documentLabel?: string | null;
  paperworkContactPersonId?: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedDesignerAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  let body: ChaseRequestBody;
  try {
    body = ((await request.json()) ?? {}) as ChaseRequestBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  const companyId = body.companyId?.trim();
  if (!companyId) return badRequest('companyId is required');

  // The caller's own session, under RLS. Reading the card back IS the
  // membership proof.
  const session = await createServerClient();
  const { data: card, error: cardError } = await session
    .from('studio_contacts')
    .select('id, organization_id, company_name, full_name')
    .eq('id', companyId)
    .maybeSingle();

  if (cardError) {
    console.error('[chase-renewal] card read failed', cardError);
    return serverError('Could not read that firm just now.');
  }
  if (!card) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const companyName = card.company_name ?? card.full_name ?? 'this firm';
  const documentId = body.documentId ?? null;
  const documentLabel = body.documentLabel ?? null;

  const { data, error } = await adminClient.rpc('enqueue_agent_task', {
    p_task_type: COMPLIANCE_CHASE_TASK_TYPE,
    p_entity_type: 'studio_contact',
    p_entity_id: companyId,
    // A draft, and only a draft. The queue's review gate is the send gate.
    p_status: 'awaiting_review',
    p_source: 'people_room',
    p_summary: `Chase ${companyName} for ${documentLabel ?? 'a current certificate'}`,
    p_payload: {
      organization_id: card.organization_id,
      company_id: companyId,
      company_name: companyName,
      document_id: documentId,
      document_label: documentLabel,
      paperwork_contact_person_id: body.paperworkContactPersonId ?? null,
    },
    // One standing chase per firm per paper: pressing twice files one note.
    p_idempotency_key: `compliance_chase:${companyId}:${documentId ?? 'any'}`,
    p_on_conflict: 'ignore',
  });

  if (error) {
    console.error('[chase-renewal] enqueue failed', error);
    return serverError('Could not draft that note just now.');
  }

  return NextResponse.json({ taskId: data ?? null });
}
