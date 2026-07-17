import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import type { FulfillmentConfigRow } from '@patina/fulfillment';

// GET /api/admin/fulfillment/config — every fulfillment_config row (spec §10),
// key order matching the seed's read order (00351) so the R1.12 numbers lead.
const KEY_ORDER = [
  'commission_rate_default',
  'settlement_variance_tolerance',
  'margin_floor_warning',
  'pledge_accrual',
  'sla_hours',
  'inspection_window_days_default',
  'business_hours',
];

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  try {
    const { data, error } = await db.from('fulfillment_config').select('*');
    if (error) throw error;

    const rows: FulfillmentConfigRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
      key: r.key as string,
      value: r.value as Record<string, unknown>,
      description: (r.description as string | null) ?? null,
      updatedBy: (r.updated_by as string | null) ?? null,
      updatedAt: r.updated_at as string,
    }));
    rows.sort((a, b) => {
      const ai = KEY_ORDER.indexOf(a.key);
      const bi = KEY_ORDER.indexOf(b.key);
      if (ai === -1 && bi === -1) return a.key.localeCompare(b.key);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return NextResponse.json({ data: rows });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load fulfillment config');
  }
}
