/**
 * Discovery → proposal seed mapping — ruling R66 (Track 6, Slice 5).
 *
 * Pure mirror of begin_direction_from_discovery (00224): the field→field map
 * from the Discovery rooms[] to proposal_scope_rooms, plus the budget-range
 * label seeded onto the draft. Kept in TS so the seam's mapping is verifiable
 * without a database (the SQL RPC is the source of truth at runtime).
 */

export interface DiscoveryRoom {
  name?: string | null;
  room_type?: string | null;
  floor_area_sqft?: number | string | null;
  keep_as_is?: boolean | null;
  notes?: string | null;
}

export interface ScopeRoomSeed {
  name: string;
  room_type: string | null;
  floor_area_sqft: number | null;
  budget_cents: number;
  notes: string | null;
  sort_order: number;
}

function toArea(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Mirrors the RPC's scope-room insert loop (notes carry the keep-as-is prefix). */
export function mapDiscoveryToScopeRooms(rooms: DiscoveryRoom[]): ScopeRoomSeed[] {
  if (!Array.isArray(rooms)) return [];
  return rooms.map((r, i) => {
    const keepPrefix = r.keep_as_is ? 'Keep as-is' : null;
    const notes = [keepPrefix, r.notes?.trim() || null].filter(Boolean).join(' · ') || null;
    return {
      name: r.name?.trim() || 'Room',
      room_type: r.room_type?.trim() || null,
      floor_area_sqft: toArea(r.floor_area_sqft),
      budget_cents: 0, // per-room budget is allocated later in the Drafting Room
      notes,
      sort_order: i,
    };
  });
}

/** The budget-range label appended to the draft proposal description (RPC step 1). */
export function formatBudgetRange(
  minCents: number | null,
  maxCents: number | null
): string {
  const fmt = (c: number | null) =>
    c == null ? '?' : `$${Math.round(c / 100).toLocaleString('en-US')}`;
  return `${fmt(minCents)}–${fmt(maxCents)}`;
}
