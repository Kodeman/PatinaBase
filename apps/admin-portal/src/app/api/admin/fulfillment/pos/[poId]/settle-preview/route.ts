import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import type { LedgerLinePreview, SettlementPreview } from '@patina/fulfillment';

// S7 settlement preview (spec §8) — read-only projected posting for a PO at a
// given vendor-invoice figure (fulfillment_settle_po_preview). Mirrors the real
// settle_po's T3 + pledge (+ T6) line-for-line, so the mono "projected posting"
// the operator sees equals what commit posts.

function mapLines(raw: unknown): LedgerLinePreview[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l: Record<string, unknown>) => ({
    accountCode: String(l.account_code ?? ''),
    accountName: (l.account_name as string) ?? null,
    debitCents: Number(l.debit_cents ?? 0),
    creditCents: Number(l.credit_cents ?? 0),
  }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const { poId } = await params;

  let body: { vendorInvoiceCents?: number };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (typeof body.vendorInvoiceCents !== 'number' || body.vendorInvoiceCents < 0) {
    return badRequest('vendorInvoiceCents (>= 0) is required');
  }

  try {
    const { data, error } = await db.rpc('fulfillment_settle_po_preview', {
      p_po_id: poId,
      p_vendor_invoice_cents: Math.round(body.vendorInvoiceCents),
    });
    if (error) throw error;
    const out = (data ?? {}) as Record<string, unknown>;
    const preview: SettlementPreview = {
      poId,
      vendorInvoiceCents: Number(out.vendor_invoice_cents ?? 0),
      expectedCents: Number(out.expected_cents ?? 0),
      varianceCents: Number(out.variance_cents ?? 0),
      toleranceCents: Number(out.tolerance_cents ?? 0),
      autoAccepted: Boolean(out.auto_accepted),
      requiresReason: Boolean(out.requires_reason),
      realizedCommissionCents: Number(out.realized_commission_cents ?? 0),
      pledgeCents: Number(out.pledge_cents ?? 0),
      lines: mapLines(out.lines),
      preview: true,
    };
    return NextResponse.json({ data: preview });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to preview settlement');
  }
}
