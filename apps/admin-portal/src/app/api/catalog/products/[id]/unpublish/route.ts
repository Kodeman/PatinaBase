import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, notFound, serverError } from '@/lib/admin-api';

// POST /api/catalog/products/[id]/unpublish
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from('products')
    .update({
      status: 'draft',
      published_at: null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return notFound('Product not found');
    return serverError(error.message);
  }

  return NextResponse.json(data);
}
