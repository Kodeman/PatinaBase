import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, createAuditLog, serverError } from '@/lib/supabase-admin';

// GET/POST /api/admin/concierge-orders — the Transaction Tracker's data source
// (/mission-control/orders, WP-2.3).
//
// concierge_orders (00308) is a same-session table not yet reflected in the
// checked-in packages/supabase/src/database.types.ts (regenerating + committing
// that file is the integration agent's job, per patina-parallel-work — this
// worktree does not commit it). The admin client is narrowed to an untyped
// `{ from }` shape before use, the same technique as the WP-2.2 designer-
// prospects route.
//
// Create is a route-side service-role INSERT (like designer_prospects) rather
// than a dedicated RPC: there is no cross-table write or stage change to audit
// at create time, and the BEFORE INSERT trigger seed_concierge_initial_checklist
// (00308) seeds the po_draft checklist automatically. Stage moves, checklist
// toggles and damage entry each get their own gated RPC-backed sub-route.
type LooseClient = { from: (table: string) => any };

export interface ConciergeOrderRow {
  id: string;
  title: string;
  purchase_order_id: string | null;
  direct_order_id: string | null;
  client_invoice_id: string | null;
  vendor_id: string | null;
  project_id: string | null;
  stage: string;
  stage_entered_at: string;
  checklists: Record<string, unknown>;
  freight: unknown | null;
  damage: Record<string, unknown> | null;
  linked_task_ids: string[];
  payment_flag: string;
  payment_flag_detail: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  vendor_name?: string | null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  const url = new URL(request.url);
  const stage = url.searchParams.get('stage') ?? undefined;
  const paymentFlag = url.searchParams.get('payment_flag') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;

  try {
    let query = db.from('concierge_orders').select('*, vendor:vendors(name)');

    if (stage) query = query.eq('stage', stage);
    if (paymentFlag) query = query.eq('payment_flag', paymentFlag);
    if (search) query = query.ilike('title', `%${search}%`);

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    const rows = ((data ?? []) as Array<Record<string, any>>).map((r) => {
      const { vendor, ...rest } = r;
      return { ...rest, vendor_name: vendor?.name ?? null } as ConciergeOrderRow;
    });

    return NextResponse.json({ data: rows });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to list concierge orders');
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return badRequest('title is required');

  try {
    const { data, error } = await db
      .from('concierge_orders')
      .insert({
        title,
        purchase_order_id: body.purchase_order_id ?? null,
        direct_order_id: body.direct_order_id ?? null,
        client_invoice_id: body.client_invoice_id ?? null,
        vendor_id: body.vendor_id ?? null,
        project_id: body.project_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;

    await createAuditLog(auth.adminClient, {
      userId: auth.user.id,
      action: 'concierge_order.create',
      resourceType: 'concierge_order',
      resourceId: (data as ConciergeOrderRow).id,
      newValues: { title, stage: (data as ConciergeOrderRow).stage },
    });

    return NextResponse.json({ data: data as ConciergeOrderRow }, { status: 201 });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to create concierge order');
  }
}
