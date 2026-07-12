import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  try {
    const { count, error } = await db
      .from('agent_tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['queued', 'running']);

    if (error) throw error;
    return NextResponse.json({ data: { count: count ?? 0 } });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to count tasks');
  }
}
