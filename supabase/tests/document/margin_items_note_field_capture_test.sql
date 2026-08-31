-- ═══════════════════════════════════════════════════════════════════════════
-- margin_items note branch + margin_notes.field_capture_id
-- (the margin migration — 005NN_margin_notes_field_capture.sql, §9.4)
--
-- 1. FULL BODY        → payload->>'body' is the WHOLE note. Before this
--                       migration the note branch emitted only
--                       left(n.body, 80) as title and ''::text as detail
--                       (00282:828-829), so a one-minute transcript reached
--                       the Document as its first eighty characters.
-- 2. TITLE UNCHANGED  → title is STILL left(body, 80). margin-item.tsx:63
--                       renders it in the collapsed rail row.
-- 3. DETAIL UNCHANGED → detail is STILL ''. margin-item.tsx:64 feeds detail to
--                       that same collapsed preview for EVERY kind; widening
--                       it would dump a transcript into the rail.
-- 4. FIELD LANE       → field_capture_id, capture_visible, has_audio,
--                       audio_segments, photo_paths and voice_duration_seconds
--                       reach the payload from the joined capture.
-- 5. FIELD-LESS NOTE  → a typed R14 note is byte-identical to today apart from
--                       the added keys reading null/false/[]. This is FC-R10's
--                       "renders nothing on a field-less project" at the SQL
--                       layer; the browser half is Task 18.
-- 6. SHAPE            → margin_items still emits exactly 11 columns, so the
--                       CREATE OR REPLACE stayed column-compatible and
--                       MarginItemRow (margin-derivation.ts:21-33) still fits.
-- 7. ANCHOR CHECK     → margin_notes.anchor_kind still admits exactly
--                       ('line','section','letterhead'). A field note anchors
--                       to 'letterhead'; nothing may widen this.
--
-- How to run:
--   scripts/run-sql-tests.sh -f margin_items_note_field_capture
-- and, for the wave report, the FULL suite as well — it exits 0 with the 22
-- documented known failures in supabase/tests/KNOWN_FAILURES.md, so a new
-- unexpected failure is a real regression.
--
-- ⚠ The runner connects as `postgres` (superuser, run-sql-tests.sh:92), so the
-- security_invoker join in margin_items resolves with RLS BYPASSED. This file
-- therefore CANNOT prove the FC-R8 co-member case (capture_visible = false
-- because field_captures is owner-only). Nothing here is evidence about RLS.
-- That case is browser-verified in Task 18.
--
-- ⚠ Every fixture UUID uses hex-only prefixes. 'm'/'r'/'g' are not hex digits
-- and the cast fails before the first assertion runs.
--
-- PREREQUISITE: the wave-1 routing migration (field_captures.voice_audio_segments,
-- .transcript_source). Transaction-wrapped + ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fb000000-0000-4000-8000-000000000001', 'fb-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fb000000-0000-4000-8000-000000000001', 'fb-designer@test.invalid', 'FB Designer', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
-- ⚠ DO UPDATE, not DO NOTHING: Supabase's own auth.users trigger has already
-- minted a profiles row by the time this runs, with a null full_name. Case 5e
-- asserts on ap.full_name, so the fixture must overwrite rather than skip.

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fb000000-0000-4000-8000-0000000000a1', 'FB Maple St',
        'fb000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000001');

-- The capture the note was spoken into: two audio segments, two photos.
INSERT INTO field_captures (
  id, client_capture_id, designer_id, status, destination, project_id,
  voice_audio_path, voice_transcript, voice_duration_seconds,
  voice_audio_segments, transcript_source, photos, primary_photo_path)
VALUES (
  'fb000000-0000-4000-8000-0000000000f1',
  'fb000000-0000-4000-8000-0000000000c1',
  'fb000000-0000-4000-8000-000000000001',
  'inbox', 'inbox', 'fb000000-0000-4000-8000-0000000000a1',
  'fb/ct/voice-000.m4a',
  'the base cabinet scribe is short on the left return',
  64.5,
  '["fb/ct/voice-000.m4a", "fb/ct/voice-001.m4a"]'::jsonb,
  'device',
  '[{"path": "fb/ct/photo-0.heic", "isPrimary": true}, {"path": "fb/ct/photo-1.heic"}]'::jsonb,
  'fb/ct/photo-0.heic');

-- A field note: body deliberately longer than 80 characters.
INSERT INTO margin_notes (id, project_id, designer_id, body, anchor_kind, field_capture_id)
VALUES (
  'fb000000-0000-4000-8000-0000000000e1',
  'fb000000-0000-4000-8000-0000000000a1',
  'fb000000-0000-4000-8000-000000000001',
  'The base cabinet scribe is short on the left return and the filler behind the range needs to be re-cut before the countertop template on Thursday.',
  'letterhead',
  'fb000000-0000-4000-8000-0000000000f1');

-- A typed R14 note with no field capture at all.
INSERT INTO margin_notes (id, project_id, designer_id, body, anchor_kind)
VALUES (
  'fb000000-0000-4000-8000-0000000000e2',
  'fb000000-0000-4000-8000-0000000000a1',
  'fb000000-0000-4000-8000-000000000001',
  'Ask about the runner.',
  'letterhead');

DO $$
DECLARE
  v_field    RECORD;
  v_typed    RECORD;
  v_body     TEXT;
  v_cols     INTEGER;
  v_check    TEXT;
BEGIN
  SELECT body INTO v_body FROM margin_notes
   WHERE id = 'fb000000-0000-4000-8000-0000000000e1';

  SELECT * INTO v_field FROM margin_items
   WHERE kind = 'note' AND item_id = 'fb000000-0000-4000-8000-0000000000e1';
  SELECT * INTO v_typed FROM margin_items
   WHERE kind = 'note' AND item_id = 'fb000000-0000-4000-8000-0000000000e2';

  -- 0 — SELECT … INTO leaves a RECORD null (the whole-row NULL sentinel) when
  -- no row matched, and every assertion below would then read NULL fields off
  -- nothing. Prove both rows exist before asserting anything about them.
  --
  -- ⚠ CORRECTED: `v_field IS NOT NULL` on a composite RECORD is a row-value
  -- comparison, which Postgres defines FIELD-WISE — true only if every column
  -- is non-null (docs: "row is not null" is false whenever the row has ANY
  -- null field, not just when the whole row is the not-found sentinel). A
  -- letterhead-anchored note legitimately has anchor_id and proposal_id NULL
  -- in margin_items, so `v_field IS NOT NULL` reads false even when the SELECT
  -- INTO found the row — a false FAIL 0a, verified by direct psql probing
  -- against 00543 (the note reaches margin_items with the full field-capture
  -- payload; only the row-nullness check was wrong). item_id is NOT NULL in
  -- the schema and is the actual "a row was found" signal: it is present when
  -- SELECT INTO matched a row and only NULL when v_field is the true
  -- not-found sentinel (field access on a NULL record yields NULL, not error).
  ASSERT v_field.item_id IS NOT NULL,
    'FAIL 0a: the field note did not reach margin_items at all';
  ASSERT v_typed.item_id IS NOT NULL,
    'FAIL 0b: the typed note did not reach margin_items at all';

  -- 1 ---------------------------------------------------------------------
  ASSERT length(v_body) > 80,
    'FIXTURE: the field note body must exceed 80 chars or case 1 proves nothing';
  ASSERT v_field.payload->>'body' = v_body,
    'FAIL 1: payload.body must carry the FULL note, got ' ||
    COALESCE(left(v_field.payload->>'body', 40), 'NULL');

  -- 2 + 3 -----------------------------------------------------------------
  ASSERT v_field.title = left(v_body, 80),
    'FAIL 2: title must still be left(body, 80), got ' || COALESCE(v_field.title, 'NULL');
  ASSERT v_field.detail = '',
    'FAIL 3: detail must still be empty, got ' || COALESCE(v_field.detail, 'NULL');

  -- 4 ---------------------------------------------------------------------
  ASSERT v_field.payload->>'field_capture_id' = 'fb000000-0000-4000-8000-0000000000f1',
    'FAIL 4a: payload.field_capture_id missing';
  ASSERT (v_field.payload->>'capture_visible')::boolean,
    'FAIL 4b: capture_visible must be true when the capture joins';
  ASSERT (v_field.payload->>'has_audio')::boolean,
    'FAIL 4c: has_audio must be true when the capture carries segments';
  ASSERT jsonb_array_length(v_field.payload->'audio_segments') = 2,
    'FAIL 4d: audio_segments must carry 2 entries, got ' ||
    COALESCE(v_field.payload->>'audio_segments', 'NULL');
  ASSERT v_field.payload->'photo_paths' = '["fb/ct/photo-0.heic", "fb/ct/photo-1.heic"]'::jsonb,
    'FAIL 4e: photo_paths must be the capture order storage keys, got ' ||
    COALESCE(v_field.payload->>'photo_paths', 'NULL');
  ASSERT (v_field.payload->>'voice_duration_seconds')::numeric = 64.5,
    'FAIL 4f: voice_duration_seconds must reach the payload';
  ASSERT v_field.payload->>'transcript_source' = 'device',
    'FAIL 4g: transcript_source must reach the payload';
  ASSERT v_field.state = 'open',
    'FAIL 4h: an un-escalated, un-dued note is still open, got ' || v_field.state;
  ASSERT v_field.anchor_kind = 'letterhead',
    'FAIL 4i: a field note anchors to letterhead, got ' || v_field.anchor_kind;

  -- 5 ---------------------------------------------------------------------
  ASSERT v_typed.payload->>'field_capture_id' IS NULL,
    'FAIL 5a: a typed note must carry a null field_capture_id';
  ASSERT NOT (v_typed.payload->>'capture_visible')::boolean,
    'FAIL 5b: a typed note must read capture_visible false';
  ASSERT NOT (v_typed.payload->>'has_audio')::boolean,
    'FAIL 5c: a typed note must read has_audio false';
  ASSERT v_typed.payload->'photo_paths' = '[]'::jsonb,
    'FAIL 5d: a typed note must read photo_paths [], got ' ||
    COALESCE(v_typed.payload->>'photo_paths', 'NULL');
  ASSERT v_typed.payload->>'author_name' = 'FB Designer',
    'FAIL 5e: the pre-existing author_name key must survive the replace';
  ASSERT v_typed.title = 'Ask about the runner.' AND v_typed.detail = '',
    'FAIL 5f: a typed note''s title/detail must be byte-identical to today';

  -- 6 ---------------------------------------------------------------------
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'margin_items';
  ASSERT v_cols = 11,
    'FAIL 6: margin_items must still emit 11 columns, got ' || v_cols;

  -- 7 ---------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO v_check
    FROM pg_constraint
   WHERE conrelid = 'public.margin_notes'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%letterhead%';
  ASSERT v_check LIKE '%''line''%' AND v_check LIKE '%''section''%'
     AND v_check LIKE '%''letterhead''%',
    'FAIL 7a: anchor_kind CHECK lost one of its three values: ' || COALESCE(v_check, 'NULL');
  ASSERT v_check NOT LIKE '%field%',
    'FAIL 7b: anchor_kind was widened — §9.4 forbids a new anchor kind: ' || v_check;

  RAISE NOTICE 'margin_items note/field-capture: all 7 cases passed.';
END $$;

ROLLBACK;
