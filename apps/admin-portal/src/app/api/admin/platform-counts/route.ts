import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export interface PlatformCounts {
  profiles: number;
  products: number;
  publishedProducts: number;
  vendors: number;
  rooms: number;
  proposals: number;
  designerEarningsTotal: number;
  designerPayoutsPending: number;
}

async function countTable(
  client: { from: (t: string) => any },
  table: string,
  filter?: { column: string; value: string },
): Promise<number> {
  let query = client.from(table).select('*', { count: 'exact', head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as { from: (t: string) => any };

  try {
    const [
      profiles,
      products,
      publishedProducts,
      vendors,
      rooms,
      proposals,
      designerPayoutsPending,
    ] = await Promise.all([
      countTable(db, 'profiles'),
      countTable(db, 'products'),
      countTable(db, 'products', { column: 'status', value: 'published' }).catch(() => 0),
      countTable(db, 'vendors').catch(() => 0),
      countTable(db, 'rooms').catch(() => 0),
      countTable(db, 'proposals').catch(() => 0),
      countTable(db, 'designer_payouts', { column: 'status', value: 'pending' }).catch(() => 0),
    ]);

    // Sum confirmed-but-unpaid earnings (cents) — best-effort.
    let designerEarningsTotal = 0;
    try {
      const { data, error } = await db
        .from('designer_earnings')
        .select('net_amount')
        .eq('status', 'confirmed');
      if (!error && Array.isArray(data)) {
        designerEarningsTotal = (data as Array<{ net_amount: number | null }>).reduce(
          (sum, row) => sum + (row.net_amount ?? 0),
          0,
        );
      }
    } catch {
      designerEarningsTotal = 0;
    }

    const payload: PlatformCounts = {
      profiles,
      products,
      publishedProducts,
      vendors,
      rooms,
      proposals,
      designerEarningsTotal,
      designerPayoutsPending,
    };

    return NextResponse.json({ data: payload });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load platform counts');
  }
}
