import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import {
  getAuthenticatedDesignerAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';

/**
 * /api/document/ask-maker-date — "Ask the maker for a date" (US-19, ruling D6).
 *
 * POST holds ONE draft on the agent queue and stops there: the task lands
 * `awaiting_review` and a person sends it later. Nothing is emailed and
 * nothing reaches the maker from here. No automated external sends is a
 * standing rule (AGENTS.md: drafts land `awaiting_review`).
 *
 * GET reads this project's held drafts back, so "draft held for review"
 * survives a reload.
 *
 * Same shape as `/api/people/chase-renewal`. `enqueue_agent_task` is granted
 * to `postgres`, `service_role` and `agent_writer` only, never to
 * `authenticated`, and `agent_tasks` is readable by admins only, so both
 * halves run here. Each first proves access through the caller's OWN RLS: the
 * line (POST) or the project (GET) is read back through the caller's session
 * client, and a caller who cannot read it is refused. Only then does the
 * service-role client touch the queue. service_role never reaches the browser.
 *
 * The task type has no worker: `claim_agent_tasks` is always called with an
 * explicit list of types, so nothing picks this task up and sends it.
 */

const TASK_TYPE = 'maker_eta_request';
const SUBJECT_MAX = 200;
const BODY_MAX = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HoldRequestBody {
  projectId?: unknown;
  ffeItemId?: unknown;
  subject?: unknown;
  body?: unknown;
}

interface LineRow {
  id: string;
  project_id: string;
  name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  purchase_order_id: string | null;
  purchase_order: {
    id: string;
    vendor_id: string | null;
    vendor_po_number: string | null;
    confirmed_eta: string | null;
  } | null;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedDesignerAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  let input: HoldRequestBody;
  try {
    input = ((await request.json()) ?? {}) as HoldRequestBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  const projectId = text(input.projectId);
  const ffeItemId = text(input.ffeItemId);
  if (!UUID.test(projectId) || !UUID.test(ffeItemId)) {
    return badRequest('projectId and ffeItemId are required');
  }
  const subject = text(input.subject);
  const body = text(input.body);
  if (!subject || !body) return badRequest('The note needs a subject and a body');
  if (subject.length > SUBJECT_MAX || body.length > BODY_MAX) {
    return badRequest('The note is too long');
  }

  // The caller's own session, under RLS. Reading the line back IS the proof
  // that the caller works on this project. The maker comes from the record,
  // never from the request.
  const session = await createServerClient();
  const { data, error: lineError } = await session
    .from('project_ffe_items')
    .select(
      'id, project_id, name, vendor_id, vendor_name, purchase_order_id, purchase_order:purchase_orders!purchase_order_id(id, vendor_id, vendor_po_number, confirmed_eta)',
    )
    .eq('id', ffeItemId)
    .eq('project_id', projectId)
    .is('removed_at', null)
    .maybeSingle();

  if (lineError) {
    console.error('[ask-maker-date] line read failed', lineError);
    return serverError('Could not read that piece just now.');
  }
  const line = data as LineRow | null;
  if (!line) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const po = line.purchase_order;
  const makerName = line.vendor_name ?? null;

  const { data: task, error } = await adminClient.rpc('enqueue_agent_task', {
    p_task_type: TASK_TYPE,
    p_entity_type: 'project_ffe_item',
    p_entity_id: line.id,
    // A draft, and only a draft. The queue's review gate is the send gate.
    p_status: 'awaiting_review',
    p_source: 'document_install',
    p_summary: `Ask ${makerName ?? 'the maker'} for an arrival date: ${line.name}`,
    p_payload: {
      project_id: line.project_id,
      ffe_item_id: line.id,
      ffe_item_name: line.name,
      purchase_order_id: po?.id ?? line.purchase_order_id ?? null,
      vendor_po_number: po?.vendor_po_number ?? null,
      confirmed_eta: po?.confirmed_eta ?? null,
      vendor_id: po?.vendor_id ?? line.vendor_id ?? null,
      maker_name: makerName,
      subject,
      body,
    },
    // One held note per piece per day: pressing twice files one.
    p_idempotency_key: `${TASK_TYPE}:${line.id}:${new Date().toISOString().slice(0, 10)}`,
    p_on_conflict: 'ignore',
  });

  if (error) {
    console.error('[ask-maker-date] enqueue failed', error);
    return serverError('Could not hold that note just now.');
  }

  const row = task as { id?: string; created_at?: string } | null;
  return NextResponse.json({
    taskId: row?.id ?? null,
    askedAt: row?.created_at ?? null,
  });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedDesignerAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const projectId = request.nextUrl.searchParams.get('projectId')?.trim() ?? '';
  if (!UUID.test(projectId)) return badRequest('projectId is required');

  const session = await createServerClient();
  const { data: project, error: projectError } = await session
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) {
    console.error('[ask-maker-date] project read failed', projectError);
    return serverError('Could not read that project just now.');
  }
  if (!project) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: tasks, error } = await adminClient
    .from('agent_tasks')
    .select('id, entity_id, created_at, payload')
    .eq('task_type', TASK_TYPE)
    .eq('status', 'awaiting_review')
    .eq('payload->>project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ask-maker-date] held drafts read failed', error);
    return serverError('Could not read the held notes just now.');
  }

  return NextResponse.json({
    drafts: (tasks ?? []).map((task) => {
      const payload = (task.payload ?? {}) as Record<string, unknown>;
      return {
        taskId: task.id,
        ffeItemId: task.entity_id,
        askedAt: task.created_at,
        makerName: typeof payload.maker_name === 'string' ? payload.maker_name : null,
        subject: typeof payload.subject === 'string' ? payload.subject : '',
        body: typeof payload.body === 'string' ? payload.body : '',
      };
    }),
  });
}
