-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: the client's own room
--
-- `public.rooms` is empty on every fresh local stack — no seed file has ever
-- written to it. "Your house" (direction-b §2) draws two kinds of card side by
-- side: the rooms a PROJECT owns (`project_rooms`, seeded by decisions.sql —
-- Aspen Loft Refresh already has Dining Room and Living Room) and the rooms the
-- CLIENT typed or scanned herself (`public.rooms`). Without this file the local
-- half is always empty, and a walker cannot tell a truthful empty from a broken
-- read.
--
-- One room, for client@patina.dev (a0000000-…-005, dev-accounts.sql:15).
--
-- Deliberately NOT named "Living Room" or "Dining Room": those two names are
-- already taken by her project rooms, and a rail carrying two cards called
-- "Living Room" would make a walk record unreadable. "Guest Bedroom" is the
-- typed one, and can be named as such in a walk.
--
-- Dimensions are metres — that is the unit of rooms.width/length/height_meters
-- (00019:22-26). 15 × 12 ft with a 9 ft ceiling. `floor_area_sqm` and
-- `volume_cbm` are computed with the SAME arithmetic the device does in
-- CreateRoomPayload (round to 2 dp — Core/Network/RoomsAPIClient.swift:80-92),
-- so a later sync from the app writes the identical figures rather than
-- silently disagreeing in the second decimal.
--
-- `budget_cents` = 900000 ($9,000), the figure mock/fragments/b-M4.html prints.
-- A number stored is a number that may be drawn (C5): the room's line reads
-- `budget $9,000` — labelled, never a spend figure the app cannot support.
--
-- `scan_count` is left at its default 0: this room is TYPED, not scanned, which
-- is what M4's own subtitle says. No saved items are seeded into it either —
-- with zero saved pieces the room must draw its budget and nothing else, and
-- that truthful empty is exactly what the wave has to get right.
--
-- Idempotent: fixed id + ON CONFLICT DO NOTHING, and the whole insert is
-- skipped when the profile is absent, so the file is safe in any seed order
-- (its only ordering requirement is: after dev-accounts.sql).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_client UUID := 'a0000000-0000-0000-0000-000000000005';  -- client@patina.dev
  rid_guest  UUID := 'c0000000-0000-4000-8000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_client) THEN
    RAISE NOTICE 'client-rooms: client@patina.dev profile absent — skipping';
    RETURN;
  END IF;

  INSERT INTO public.rooms (
    id, user_id, name, type,
    length_meters, width_meters, height_meters,
    floor_area_sqm, volume_cbm,
    budget_cents
  ) VALUES (
    rid_guest, uid_client, 'Guest Bedroom', 'bedroom',
    4.57, 3.66, 2.74,   -- 15 ft × 12 ft, 9 ft ceiling
    16.73,              -- round(4.57 * 3.66, 2)
    45.83,              -- round(4.57 * 3.66 * 2.74, 2)
    900000              -- $9,000
  )
  ON CONFLICT (id) DO NOTHING;
END $$;
