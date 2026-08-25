"use client";

// ═══════════════════════════════════════════════════════════════════════════
// CAPTURE VENUES — the place name behind the Library provenance chip.
//
// `field_captures.venue_label` (00233:86) is written by commit_field_capture
// from the phone's venue object (00235:98), and `products.field_capture_id`
// points at that row (products_field_capture_id_fkey, 00233:144).
//
// Deliberately a SEPARATE query rather than an embed on useLayerProducts:
// that hook powers all three Library shelves, and an embed that errors would
// darken the whole Library. This one resolves to {} on failure, so the chip
// simply loses its place name.
// ═══════════════════════════════════════════════════════════════════════════

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createBrowserClient } from "../client";

const getSupabase = () => createBrowserClient();

function normalise(
  ids: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  for (const raw of ids ?? []) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (id.length > 0) seen.add(id);
  }
  return Array.from(seen).sort();
}

/** `field_captures.id → venue_label`, for capture ids that have one. */
export function useCaptureVenueLabels(
  fieldCaptureIds: readonly (string | null | undefined)[] | null | undefined,
): UseQueryResult<Record<string, string>> {
  const wanted = normalise(fieldCaptureIds);

  return useQuery<Record<string, string>>({
    queryKey: ["capture-venue-labels", wanted.join("|")],
    enabled: wanted.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from("field_captures")
        .select("id, venue_label")
        .in("id", wanted);

      // Never throw: a missing place name is a cosmetic loss, and this query
      // sits beside a shelf that must render regardless (Ruling 5-A).
      if (error) return {};

      const byId: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ id: string; venue_label: string | null }>) {
        if (row.id && row.venue_label) byId[row.id] = row.venue_label;
      }
      return byId;
    },
  });
}
