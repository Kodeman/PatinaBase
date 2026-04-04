import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, serverError } from '@/lib/admin-api';

// POST /api/catalog/collections/:id/publish
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { data, error } = await supabase
    .from('collections')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      scheduled_publish_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, status, published_at')
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json({
    id: data.id,
    status: data.status,
    publishedAt: data.published_at,
  });
}
