import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/lib/supabase-admin';
import { invokeFulfillmentPo } from '@/lib/fulfillment-po-fn';

// GET /api/admin/fulfillment/pos/[poId]/preview — proxy the fulfillment-po edge
// function's `preview` mode (service-role Bearer) and stream the rendered PO PDF
// back to the composer's <object> (S3, spec §5.3). Read-only: no mutation, no log.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { poId } = await params;
  const actor = auth.user.email ?? auth.user.id;

  const res = await invokeFulfillmentPo({ po_id: poId, mode: 'preview', actor });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ error: 'preview_failed' }));
    return NextResponse.json({ error: detail.error ?? 'preview_failed' }, { status: res.status });
  }
  const bytes = await res.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="po-${poId}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
