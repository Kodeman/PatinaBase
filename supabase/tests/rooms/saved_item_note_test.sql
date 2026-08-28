-- ═══════════════════════════════════════════════════════════════════════════
-- 00539 tests — the note on a saved row
--
-- The saved row prints save date · room · note (direction-b §3). The date and
-- the room have been columns since 00055; the note has been one too, named
-- `notes` (00055:29) — untyped in the sense that nothing bounded it and nothing
-- documented it. 00539 makes it first-class. These assertions cover the whole
-- migration:
--
--   1. saved_items.notes exists, is text, is nullable, and carries a comment;
--   2. NULL is accepted — an unset note is silence, not an empty string;
--   3. a note of exactly 2000 characters is accepted (the boundary is inside);
--   4. a note of 2001 characters is REFUSED with check_violation;
--   5. the empty string is accepted AT THE DATABASE. The rule that a row draws
--      no note line rather than an empty one belongs to the client — asserted
--      here so a later reader does not mistake the column for the enforcer;
--   6. `saved_items.note` (singular) does NOT exist. The W4 brief named that
--      column; it would have been a second home for a fact `notes` already
--      holds and the iOS write leg already fills (CreateSavedItemPayload.notes,
--      Core/Network/RoomsAPIClient.swift:133). This assertion is what keeps the
--      duplicate from being re-minted later.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rooms/saved_item_note_test.sql
--
-- Single transaction; ROLLBACK at the end. Nothing survives the run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('d9100000-0000-4000-8000-000000000001', 'note-client@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('d9100000-0000-4000-8000-000000000001', 'note-client@test.invalid', 'Note Client', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_client  uuid := 'd9100000-0000-4000-8000-000000000001';
  v_type    text;
  v_null    text;
  v_comment text;
  v_count   int;
  v_note    text;
BEGIN
  -- ── 1. the column, its type, its nullability, its comment ──
  SELECT data_type, is_nullable INTO v_type, v_null
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'notes';
  ASSERT v_type = 'text',
    'saved_items.notes must exist as text, got ' || COALESCE(v_type, '<missing>');
  ASSERT v_null = 'YES',
    'saved_items.notes must be nullable — an unset note is silence (C5)';

  SELECT col_description('public.saved_items'::regclass,
           (SELECT attnum FROM pg_attribute
             WHERE attrelid = 'public.saved_items'::regclass AND attname = 'notes'))
    INTO v_comment;
  ASSERT v_comment IS NOT NULL, 'saved_items.notes must carry a comment';

  -- ── 6. and there must be no second home for the same fact ──
  SELECT count(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'note';
  ASSERT v_count = 0,
    'saved_items.note (singular) must NOT exist — the note lives in notes (00055:29), '
    'and two columns for one fact would split what the app writes from what it reads';

  -- ── the length constraint is present and named ──
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.saved_items'::regclass
       AND conname = 'saved_items_notes_length_check'
       AND contype = 'c'),
    'the 2000-character bound on saved_items.notes must exist as a named CHECK';

  -- ── 2. NULL is accepted ──
  INSERT INTO public.saved_items (user_id, name, source, notes)
  VALUES (u_client, 'Note Piece — no note', 'extension', NULL);

  -- ── 5. the empty string is accepted at the database ──
  -- The client decides that an empty note draws no line; the column does not.
  INSERT INTO public.saved_items (user_id, name, source, notes)
  VALUES (u_client, 'Note Piece — empty note', 'extension', '');

  -- ── 3. exactly 2000 characters is inside the bound ──
  v_note := repeat('a', 2000);
  INSERT INTO public.saved_items (user_id, name, source, notes)
  VALUES (u_client, 'Note Piece — 2000', 'extension', v_note);

  SELECT char_length(notes) INTO v_count FROM public.saved_items
   WHERE user_id = u_client AND name = 'Note Piece — 2000';
  ASSERT v_count = 2000,
    'a 2000-character note must be stored whole, got ' || COALESCE(v_count::text, '<null>');

  -- ── 4. 2001 characters is refused ──
  BEGIN
    INSERT INTO public.saved_items (user_id, name, source, notes)
    VALUES (u_client, 'Note Piece — 2001', 'extension', repeat('a', 2001));
    ASSERT false, 'a note longer than 2000 characters must be refused';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;

  RAISE NOTICE 'saved_item_note_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
