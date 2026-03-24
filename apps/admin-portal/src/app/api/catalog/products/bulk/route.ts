import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, verifyAdmin, unauthorized, badRequest, serverError } from '@/lib/admin-api';

// POST /api/catalog/products/bulk
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const user = await verifyAdmin(supabase, req.headers.get('authorization'));
  if (!user) return unauthorized();

  const body = await req.json();
  const { action, productIds } = body;

  if (!action || !Array.isArray(productIds) || productIds.length === 0) {
    return badRequest('action and productIds[] are required');
  }

  if (productIds.length > 100) {
    return badRequest('Maximum 100 products per bulk operation');
  }

  try {
    switch (action) {
      case 'publish': {
        const { data, error } = await supabase
          .from('products')
          .update({
            status: 'published',
            published_at: new Date().toISOString(),
          })
          .in('id', productIds)
          .select('id');

        if (error) return serverError(error.message);

        const successIds = new Set((data ?? []).map((r: { id: string }) => r.id));
        return NextResponse.json({
          success: productIds.filter((id: string) => successIds.has(id)).map((id: string) => ({ id, success: true })),
          failed: productIds.filter((id: string) => !successIds.has(id)).map((id: string) => ({ id, success: false, error: 'Not found' })),
          total: productIds.length,
        });
      }

      case 'unpublish': {
        const { data, error } = await supabase
          .from('products')
          .update({
            status: 'draft',
            published_at: null,
          })
          .in('id', productIds)
          .select('id');

        if (error) return serverError(error.message);

        const successIds = new Set((data ?? []).map((r: { id: string }) => r.id));
        return NextResponse.json({
          success: productIds.filter((id: string) => successIds.has(id)).map((id: string) => ({ id, success: true })),
          failed: productIds.filter((id: string) => !successIds.has(id)).map((id: string) => ({ id, success: false, error: 'Not found' })),
          total: productIds.length,
        });
      }

      case 'delete': {
        const { data, error } = await supabase
          .from('products')
          .delete()
          .in('id', productIds)
          .select('id');

        if (error) return serverError(error.message);

        const successIds = new Set((data ?? []).map((r: { id: string }) => r.id));
        return NextResponse.json({
          success: productIds.filter((id: string) => successIds.has(id)).map((id: string) => ({ id, success: true })),
          failed: productIds.filter((id: string) => !successIds.has(id)).map((id: string) => ({ id, success: false, error: 'Not found' })),
          total: productIds.length,
        });
      }

      default:
        return badRequest(`Unknown action: ${action}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bulk operation failed';
    return serverError(message);
  }
}
