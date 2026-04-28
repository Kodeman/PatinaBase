/**
 * PO generation route.
 *
 * Generates a purchase order PDF for a single FF&E item, uploads it to Supabase
 * Storage under project-documents/{projectId}/po-{poNumber}.pdf, and returns the
 * signed URL. Vendor email send is decoupled into @patina/email.
 *
 * Request: POST /api/po/generate { itemId: string }
 * Response: { url: string, poNumber: string }
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { itemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const itemId = body.itemId;
  if (!itemId) {
    return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient(cookieStore as any) as any;

  // Fetch item
  const { data: item, error: itemErr } = await supabase
    .from('project_ffe_items')
    .select(`
      *,
      project:projects!project_id(id, name, designer_id),
      room:project_rooms!project_room_id(id, name)
    `)
    .eq('id', itemId)
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: 'item_not_found' }, { status: 404 });
  }

  // Generate a PO number if absent
  let poNumber: string = item.po_number;
  if (!poNumber) {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('project_ffe_items')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', item.project_id)
      .not('po_number', 'is', null);
    poNumber = `PO-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`;
  }

  // Render PDF — using @react-pdf/renderer (Node runtime).
  // Lazy import to keep cold-start light.
  const [{ pdf }, { POTemplate }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/lib/pdf-templates/po-template'),
  ]);

  const pdfBuffer = await pdf(
    POTemplate({
      poNumber,
      projectName: item.project?.name ?? 'Project',
      vendorName: item.vendor_name ?? 'Vendor',
      lineItems: [
        {
          name: item.name,
          quantity: item.quantity ?? 1,
          unitPriceCents: item.unit_price_cents ?? 0,
          lineTotalCents: item.line_total_cents ?? 0,
        },
      ],
      issuedAt: new Date().toISOString(),
    })
  ).toBuffer();

  // Upload to storage
  const path = `${item.project_id}/po-${poNumber}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from('project-documents')
    .upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: 'storage_upload_failed', detail: uploadErr.message },
      { status: 500 }
    );
  }

  const { data: signed } = await supabase.storage
    .from('project-documents')
    .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days

  // Persist po_number on the item
  await supabase
    .from('project_ffe_items')
    .update({ po_number: poNumber, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  return NextResponse.json({ url: signed?.signedUrl ?? null, poNumber });
}
