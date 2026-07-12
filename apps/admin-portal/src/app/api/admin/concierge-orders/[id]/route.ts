import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';
import type { ConciergeOrderRow } from '../route';

type LooseClient = { from: (table: string) => any };

// GET /api/admin/concierge-orders/[id] — order detail + the linked agent_tasks
// (payment_discrepancy / damage_claim_escalation) resolved from linked_task_ids
// so the detail panel can render their artifacts without a second round trip.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  const { id } = await params;

  try {
    const { data: order, error } = await db
      .from('concierge_orders')
      .select('*, vendor:vendors(name)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!order) return notFound(`Concierge order "${id}" not found`);

    const { vendor, ...rest } = order as Record<string, any>;
    const row = { ...rest, vendor_name: vendor?.name ?? null } as ConciergeOrderRow;

    let linkedTasks: unknown[] = [];
    const ids = row.linked_task_ids ?? [];
    if (ids.length > 0) {
      const { data: tasks, error: taskErr } = await db
        .from('agent_tasks')
        .select('id, task_type, status, summary, artifacts, confidence, created_at')
        .in('id', ids)
        .order('created_at', { ascending: false });
      if (taskErr) throw taskErr;
      linkedTasks = tasks ?? [];
    }

    return NextResponse.json({ data: { ...row, linked_tasks: linkedTasks } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load concierge order');
  }
}
