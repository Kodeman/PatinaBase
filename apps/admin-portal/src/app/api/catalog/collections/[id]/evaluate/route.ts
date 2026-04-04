import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, serverError } from '@/lib/admin-api';

// POST /api/catalog/collections/:id/evaluate - Evaluate rule-based collection
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const { id } = await params;
  const { data, error } = await supabase.rpc('evaluate_collection_rules', {
    p_collection_id: id,
  });

  if (error) return serverError(error.message);
  if (data?.error) return serverError(data.error);

  return NextResponse.json(data);
}
