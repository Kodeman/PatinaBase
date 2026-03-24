import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/waitlist/stats - Aggregate waitlist statistics
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  try {
    const { data, error } = await adminClient
      .from('waitlist')
      .select('source, role, converted_at');

    if (error) return serverError(error.message);

    const rows = data ?? [];
    const stats = {
      total: rows.length,
      bySource: {} as Record<string, number>,
      byRole: {} as Record<string, number>,
      converted: 0,
      unconverted: 0,
    };

    for (const row of rows) {
      const src = (row as any).source as string;
      const rl = (row as any).role as string;
      const isConverted = (row as any).converted_at !== null;

      stats.bySource[src] = (stats.bySource[src] || 0) + 1;
      stats.byRole[rl] = (stats.byRole[rl] || 0) + 1;

      if (isConverted) {
        stats.converted++;
      } else {
        stats.unconverted++;
      }
    }

    return NextResponse.json({ data: stats });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to get waitlist stats');
  }
}
