import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, badRequest, notFound, serverError } from '@/lib/supabase-admin';
import { gateForDelivery, loadShipmentForGate } from '@/lib/fulfillment-shipments';

// POST /api/admin/fulfillment/shipments/[shipmentId]/pod — upload proof of
// delivery (S5, spec §5.4 "POD -> inspection window countdown from carrier
// profile days"). multipart/form-data, field `file`.
//
// Two steps, both required by the spec:
//   1. Upload to the existing project-documents storage bucket (00170, the
//      pattern supabase/functions/po-send/index.ts and use-projects.ts's
//      useUploadProjectDocument use) under the key
//      fulfillment/pod/{shipment_id}/{uuid}-{filename}.
//   2. THEN stamp pod_r2_key + open the inspection window server-side via the
//      RPC. Bound verbatim to fulfillment_record_delivery (00353):
//
//        CREATE OR REPLACE FUNCTION public.fulfillment_record_delivery(
//          p_shipment_id uuid, p_pod_r2_key text, p_actor text)
//        ...
//        UPDATE public.fulfillment_shipments
//           SET delivered_at = now(), pod_r2_key = p_pod_r2_key,
//               inspection_closes_at = now() + make_interval(days => COALESCE(v_window, 5))
//         WHERE id = p_shipment_id;
//        UPDATE public.fulfillment_vendor_pos SET status = 'delivered' WHERE id = v_po AND status = 'shipped';
//        UPDATE public.fulfillment_order_items i SET line_state = 'delivered' ...
//
//      VERDICT (I10): this RPC correctly stamps pod_r2_key and opens
//      inspection_closes_at from inspection_window_days (captured at shipment-
//      creation time from the vendor profile / config default, 00353's
//      fulfillment_record_shipment) - that half of the package's S5
//      accepts-when is met at the RPC layer, no gap.
//
//      BUT this same call also unconditionally marks the shipment delivered
//      (delivered_at, PO status, line_state) with NO check of
//      mode/appointment_confirmed_at - the LTL/WG appointment gate does NOT
//      exist at this layer. Enforced here instead (gateForDelivery,
//      @/lib/fulfillment-shipments -> canDeliverShipment,
//      @patina/fulfillment) BEFORE the RPC is ever called, so an LTL/white_glove
//      shipment without a confirmed appointment gets a 409 instead of a
//      silent, incorrect "delivered". This is an application-layer mitigation
//      only (a direct RPC call from elsewhere still bypasses it) - reported
//      for S6 to harden at the database layer.

const BUCKET = 'project-documents';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as any;
  const { shipmentId } = await params;
  const actor = auth.user.email ?? auth.user.id;

  let shipment;
  try {
    shipment = await loadShipmentForGate(db, shipmentId);
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load the shipment');
  }
  if (!shipment) return notFound('Shipment not found');

  const gate = gateForDelivery(shipment);
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.message, code: gate.reason }, { status: 409 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest('Expected multipart/form-data');
  }
  const file = formData.get('file');
  if (!(file instanceof File)) return badRequest('file is required');
  if (file.size === 0) return badRequest('file is empty');

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `fulfillment/pod/${shipmentId}/${crypto.randomUUID()}-${safeName}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadErr } = await db.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: file.type || undefined, upsert: false });
    if (uploadErr) return serverError(`storage upload failed: ${uploadErr.message}`);

    const { error: rpcErr } = await db.rpc('fulfillment_record_delivery', {
      p_shipment_id: shipmentId,
      p_pod_r2_key: storagePath,
      p_actor: actor,
    });
    if (rpcErr) {
      if (/shipment .* not found/i.test(rpcErr.message ?? '')) return notFound('Shipment not found');
      throw rpcErr;
    }

    const { data: updated } = await db
      .from('fulfillment_shipments')
      .select('inspection_closes_at')
      .eq('id', shipmentId)
      .maybeSingle();

    return NextResponse.json({
      data: {
        ok: true,
        podR2Key: storagePath,
        inspectionClosesAt: updated?.inspection_closes_at ?? null,
      },
    });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to record the proof of delivery');
  }
}
