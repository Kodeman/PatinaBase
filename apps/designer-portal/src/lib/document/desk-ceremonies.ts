/**
 * Desk ceremony inputs (R106, the Arrival Arc — DECISIONS.md R106 + I65).
 *
 * The `match_ceremonies` analogue of desk-conflicts.ts / desk-flagged-lines.ts:
 * folds the designer's own ceremony rows into two lookup maps so
 * desk-derivation can find the ceremony belonging to a Shape C lead (by
 * lead_id — the parked-card need) or a Shape D relationship (by
 * designer_client_id — the in-motion chip). desk-derivation defines its own
 * structural `DeskCeremonySignal` shape and never imports from this module
 * (the desk-conflicts precedent: stay dependency-free).
 *
 * Pure presentation logic; the query lives in use-desk-engagements (the
 * Wave 2.1 precedent — every other side feed does the same, degrading to []
 * on its own error so "the Desk never dies on a side feed").
 */

/** One `match_ceremonies` row, the columns the Desk needs (raw DB shape). */
export interface CeremonyRow {
  id: string;
  lead_id: string;
  designer_client_id: string | null;
  state: 'draft' | 'sent' | 'picked';
  intro_text: string | null;
  offered_slots: Array<{ id: string; starts_at: string; duration_minutes: number }> | null;
  offered_at: string | null;
  picked_slot_starts_at: string | null;
  timezone: string | null;
  thread_id: string | null;
  created_at: string;
}

/** The camelCase shape desk-derivation's `DeskCeremonySignal` structurally
 *  matches. Kept as its own type (not imported by desk-derivation) so this
 *  module and desk-derivation.ts stay independently editable. */
export interface DeskCeremonyInput {
  id: string;
  state: 'draft' | 'sent' | 'picked';
  introText: string | null;
  offeredSlots: Array<{ id: string; starts_at: string; duration_minutes: number }> | null;
  offeredAt: string | null;
  pickedSlotStartsAt: string | null;
  timezone: string | null;
  threadId: string | null;
}

function toInput(row: CeremonyRow): DeskCeremonyInput {
  return {
    id: row.id,
    state: row.state,
    introText: row.intro_text,
    offeredSlots: row.offered_slots,
    offeredAt: row.offered_at,
    pickedSlotStartsAt: row.picked_slot_starts_at,
    timezone: row.timezone,
    threadId: row.thread_id,
  };
}

/** Keyed by lead_id — the Shape C (lead) parked-card need. Every ceremony row
 *  carries a lead_id (NOT NULL, unique per lead), so this is a 1:1 map. */
export function buildDeskCeremoniesByLead(rows: CeremonyRow[]): Map<string, DeskCeremonyInput> {
  const map = new Map<string, DeskCeremonyInput>();
  for (const row of rows) {
    if (!row.lead_id) continue;
    map.set(row.lead_id, toInput(row));
  }
  return map;
}

/** Keyed by designer_client_id — the Shape D (relationship) in-motion chip.
 *  Null until the ceremony sends (ceremony_complete stamps it), so a still-
 *  draft ceremony never appears here — consistent with it never reaching a
 *  Shape D row in the first place (the lead stays Shape C until send). */
export function buildDeskCeremoniesByDesignerClient(
  rows: CeremonyRow[],
): Map<string, DeskCeremonyInput> {
  const map = new Map<string, DeskCeremonyInput>();
  for (const row of rows) {
    if (!row.designer_client_id) continue;
    map.set(row.designer_client_id, toInput(row));
  }
  return map;
}
