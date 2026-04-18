import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, serverError } from '@/lib/admin-api';

export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
  const offset = Number(searchParams.get('offset') ?? 0);

  const { data, error, count } = await supabase
    .from('profiles')
    .select(
      'id, email, display_name, email_suppressed, email_suppressed_at, email_bounce_count, email_complaint, updated_at',
      { count: 'exact' },
    )
    .eq('email_suppressed', true)
    .order('email_suppressed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return serverError(error.message);

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
