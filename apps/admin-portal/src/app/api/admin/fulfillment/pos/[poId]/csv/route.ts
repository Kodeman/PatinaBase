import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, notFound, serverError } from '@/lib/supabase-admin';

// GET /api/admin/fulfillment/pos/[poId]/csv — build the vendor's CSV to its
// column spec (S3, spec §5.3, "CSV to spec"). vendor_profiles.csv_column_spec is
// { "columns": ["sku","qty","ship_to","side_mark"] } — one line per PO line, in
// the vendor's declared column order. Pure Node route (no edge fn): the composer
// downloads this then calls /transmit (mode=mark_transmitted, method=csv) to log
// the send. This route itself never mutates.

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function shipToLine(shipTo: Record<string, unknown> | null): string {
  if (!shipTo) return '';
  const s = shipTo as Record<string, string | undefined>;
  return [s.line1, s.line2, s.city, s.state, s.postal_code].filter(Boolean).join('; ');
}

function resolveField(
  key: string,
  line: { itemName: string; vendorSku: string | null; qty: number; unitCostCents: number; lineTotalCents: number },
  ctx: { sideMark: string | null; poNumber: string | null; shipTo: string },
): string {
  switch (key.toLowerCase()) {
    case 'sku':
    case 'vendor_sku':
    case 'item_sku':
      return line.vendorSku ?? '';
    case 'item':
    case 'name':
    case 'description':
      return line.itemName;
    case 'qty':
    case 'quantity':
      return String(line.qty);
    case 'unit_cost':
    case 'cost':
      return dollars(line.unitCostCents);
    case 'line_total':
    case 'total':
      return dollars(line.lineTotalCents);
    case 'ship_to':
    case 'address':
      return ctx.shipTo;
    case 'side_mark':
    case 'sidemark':
      return ctx.sideMark ?? '';
    case 'po_number':
    case 'po':
      return ctx.poNumber ?? '';
    default:
      return '';
  }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as any;
  const { poId } = await params;

  try {
    const { data: po, error: poErr } = await db
      .from('fulfillment_vendor_pos')
      .select('id, order_id, vendor_id, po_number, side_mark')
      .eq('id', poId)
      .maybeSingle();
    if (poErr) throw poErr;
    if (!po) return notFound('PO not found');

    const { data: order } = await db
      .from('fulfillment_orders')
      .select('ship_to')
      .eq('id', po.order_id)
      .maybeSingle();

    const { data: profile } = await db
      .from('vendor_profiles')
      .select('csv_column_spec')
      .eq('vendor_id', po.vendor_id)
      .maybeSingle();

    const columns: string[] = Array.isArray(profile?.csv_column_spec?.columns)
      ? profile.csv_column_spec.columns
      : ['sku', 'qty', 'ship_to', 'side_mark'];

    const { data: poLines } = await db
      .from('fulfillment_vendor_po_lines')
      .select('order_item_id, qty, unit_cost_cents')
      .eq('po_id', poId);
    const itemIds = (poLines ?? []).map((l: any) => l.order_item_id);
    const { data: items } = itemIds.length
      ? await db.from('fulfillment_order_items').select('id, item_name, vendor_sku, line_index').in('id', itemIds)
      : { data: [] };
    const itemById = new Map((items ?? []).map((i: any) => [i.id, i]));

    const ctx = {
      sideMark: po.side_mark as string | null,
      poNumber: po.po_number as string | null,
      shipTo: shipToLine((order?.ship_to as Record<string, unknown> | null) ?? null),
    };

    const lines = (poLines ?? [])
      .map((l: any) => {
        const item: any = itemById.get(l.order_item_id) ?? {};
        const qty = l.qty ?? 1;
        const unit = l.unit_cost_cents ?? 0;
        return {
          lineIndex: item.line_index ?? 0,
          itemName: item.item_name ?? 'Item',
          vendorSku: item.vendor_sku ?? null,
          qty,
          unitCostCents: unit,
          lineTotalCents: unit * qty,
        };
      })
      .sort((a: any, b: any) => a.lineIndex - b.lineIndex);

    const header = columns.map(csvCell).join(',');
    const rows = lines.map((line: any) =>
      columns.map((c) => csvCell(resolveField(c, line, ctx))).join(','),
    );
    const csv = [header, ...rows].join('\r\n') + '\r\n';

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${po.po_number ?? poId}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to build the CSV');
  }
}
