// ─────────────────────────────────────────────────────────────────────────────
// vitals service — client-side data slice for the Marketplace Vitals strip.
//
// Mirrors services/agent-tasks.ts: a thin apiFetch wrapper over
// /api/admin/mission-control/vitals, the only place the service-role
// get_marketplace_vitals() RPC runs. The browser never calls Postgres RPCs
// directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { MarketplaceVitalRow } from '@/app/api/admin/mission-control/vitals/route';

export type { MarketplaceVitalRow };

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const vitalsService = {
  async list(): Promise<MarketplaceVitalRow[]> {
    const json = await apiFetch<{ data: MarketplaceVitalRow[] }>('/api/admin/mission-control/vitals');
    return json.data;
  },
};
