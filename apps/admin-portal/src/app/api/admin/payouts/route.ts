import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DesignerPayoutRow {
  id: string;
  designerId: string;
  designerName: string | null;
  designerEmail: string | null;
  amountCents: number;
  currency: string;
  status: PayoutStatus;
  paymentMethod: string | null;
  paymentReference: string | null;
  periodStart: string;
  periodEnd: string;
  processedAt: string | null;
  failedReason: string | null;
  createdAt: string;
}

export interface PayoutsListResponse {
  rows: DesignerPayoutRow[];
  totals: {
    pendingCents: number;
    processingCents: number;
    completedCentsLast30Days: number;
    failedCount: number;
  };
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
}

const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as { from: (t: string) => any };

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50),
  );
  const statusParam = url.searchParams.get('status')?.trim() || null;
  const status: PayoutStatus | null =
    statusParam === 'pending' ||
    statusParam === 'processing' ||
    statusParam === 'completed' ||
    statusParam === 'failed'
      ? statusParam
      : null;

  const offset = (page - 1) * pageSize;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    let listQuery = db
      .from('designer_payouts')
      .select(
        `
        id,
        designer_id,
        amount,
        currency,
        status,
        payment_method,
        payment_reference,
        period_start,
        period_end,
        processed_at,
        failed_reason,
        created_at,
        profiles:designer_id ( id, display_name, email )
        `,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (status) listQuery = listQuery.eq('status', status);

    const [listRes, pendingSumRes, processingSumRes, completedSumRes, failedCountRes] =
      await Promise.all([
        listQuery,
        db.from('designer_payouts').select('amount').eq('status', 'pending'),
        db.from('designer_payouts').select('amount').eq('status', 'processing'),
        db
          .from('designer_payouts')
          .select('amount')
          .eq('status', 'completed')
          .gte('processed_at', thirtyDaysAgo),
        db
          .from('designer_payouts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'failed'),
      ]);

    if (listRes.error) throw listRes.error;

    const sumAmounts = (rows: Array<{ amount: number | null }> | null | undefined): number =>
      (rows ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0);

    type Row = {
      id: string;
      designer_id: string;
      amount: number;
      currency: string | null;
      status: PayoutStatus;
      payment_method: string | null;
      payment_reference: string | null;
      period_start: string;
      period_end: string;
      processed_at: string | null;
      failed_reason: string | null;
      created_at: string;
      profiles: { id: string; display_name: string | null; email: string | null } | null;
    };

    const rows: DesignerPayoutRow[] = ((listRes.data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      designerId: r.designer_id,
      designerName: r.profiles?.display_name ?? null,
      designerEmail: r.profiles?.email ?? null,
      amountCents: r.amount,
      currency: r.currency ?? 'USD',
      status: r.status,
      paymentMethod: r.payment_method,
      paymentReference: r.payment_reference,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      processedAt: r.processed_at,
      failedReason: r.failed_reason,
      createdAt: r.created_at,
    }));

    const payload: PayoutsListResponse = {
      rows,
      totals: {
        pendingCents: sumAmounts(pendingSumRes.data as any),
        processingCents: sumAmounts(processingSumRes.data as any),
        completedCentsLast30Days: sumAmounts(completedSumRes.data as any),
        failedCount: failedCountRes.count ?? 0,
      },
      meta: { total: listRes.count ?? 0, page, pageSize },
    };

    return NextResponse.json({ data: payload });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load payouts');
  }
}
