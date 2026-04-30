import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export interface ApplicationsMetrics {
  designer: {
    pending: number;
    inReview: number;
    total: number;
  };
  maker: {
    pending: number;
    inReview: number;
    total: number;
  };
  totalAwaiting: number;
}

async function countByStatus(
  client: { from: (t: string) => any },
  table: string,
  status: string,
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('status', status);
  if (error) throw error;
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as { from: (t: string) => any };

  try {
    const [
      designerPending,
      designerInReview,
      makerPending,
      makerInReview,
    ] = await Promise.all([
      countByStatus(db, 'founding_designer_applications', 'pending'),
      countByStatus(db, 'founding_designer_applications', 'in_review'),
      countByStatus(db, 'maker_applications', 'pending'),
      countByStatus(db, 'maker_applications', 'in_review'),
    ]);

    const metrics: ApplicationsMetrics = {
      designer: {
        pending: designerPending,
        inReview: designerInReview,
        total: designerPending + designerInReview,
      },
      maker: {
        pending: makerPending,
        inReview: makerInReview,
        total: makerPending + makerInReview,
      },
      totalAwaiting:
        designerPending + designerInReview + makerPending + makerInReview,
    };

    return NextResponse.json({ data: metrics });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load applications metrics');
  }
}
