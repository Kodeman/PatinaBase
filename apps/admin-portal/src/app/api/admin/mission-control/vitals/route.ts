import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

// GET /api/admin/mission-control/vitals — the Marketplace Vitals strip (WP-1.2).
// Straight passthrough to get_marketplace_vitals() (00301): the RPC already
// joins marketplace_vitals to metric_thresholds and computes the band, so
// this route carries no metric or band logic of its own.
//
// get_marketplace_vitals() is a same-session addition (migration 00301) not
// yet reflected in the checked-in packages/supabase/src/database.types.ts
// (regenerating+committing that file is the integration agent's job, per
// patina-parallel-work). Mirrors @patina/agent-queue's createAgentQueue: the
// admin client is narrowed to the untyped `SupabaseClient` (generic default
// `any`) before calling .rpc(), so the RPC name is string-typed loosely
// instead of failing to compile against a Functions union that doesn't know
// about it yet.
export interface MarketplaceVitalRow {
  metric_key: string;
  label: string;
  unit: 'ratio' | 'usd' | 'pct';
  value: number | null;
  prev_value: number | null;
  band: 'green' | 'yellow' | 'red' | 'neutral';
  active: boolean;
  display_order: number;
  computed_at: string | null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const client: SupabaseClient = auth.adminClient;

  try {
    const { data, error } = await client.rpc('get_marketplace_vitals');
    if (error) throw error;

    const rows = ((data as MarketplaceVitalRow[] | null) ?? [])
      .slice()
      .sort((a, b) => a.display_order - b.display_order);

    return NextResponse.json({ data: rows });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load marketplace vitals');
  }
}
