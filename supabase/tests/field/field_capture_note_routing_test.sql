-- ═══════════════════════════════════════════════════════════════════════════
-- commit_field_capture inbox-branch routing + the note/audio lane
-- (the W1 routing migration — 005NN_field_capture_notes_and_routing.sql)
--
-- 1. INBOX ROUTING       → project_id / project_room_id persist on the inbox
--                          path. Before this migration only the library branch
--                          wrote them (00235:205-217 vs :255-264), so every
--                          note-shaped capture arrived with no project.
-- 2. AUDIO SEGMENTS      → voice.audioSegments round-trips.
-- 3. CAPTURE KIND        → payload captureKind lands, defaulting to specimen.
-- 4. RE-COMMIT           → a second commit with the same client_capture_id is
--                          a FULL CONTENT OVERWRITE that must not clear
--                          routing. ⚠ It is NOT a no-op: status is 'inbox',
--                          which is not in ('saved','dismissed'), so the
--                          upsert fires and every content column is rewritten
--                          from EXCLUDED — this very case resets capture_kind
--                          to 'specimen' and voice_audio_segments to '[]',
--                          undoing what cases 2 and 3 just proved. Routing
--                          survives only because the destination branch
--                          COALESCEs it. The true no-op branch (already
--                          'saved' or 'dismissed') is NOT exercised here.
-- 5. SAFE HARBOR         → a project the caller does not own does NOT abort the
--                          RPC. 00235:85-88 documents the routing deferral as
--                          DELIBERATE ("so a bad route can be safe-harbored
--                          instead of hard-failing the whole sync") and wraps
--                          the library branch in EXCEPTION WHEN OTHERS. The
--                          inbox branch now carries the same harbor: the row
--                          parks at status='inbox' and the handler DETACHES
--                          the routing (project_id/project_room_id/shelf ->
--                          NULL) — it must, or its own UPDATE re-fires the
--                          guard it is handling — recording what it detached
--                          in raw_payload.conflict. ⚠ This case's fixture has
--                          NULL stored routing, so 5b would also pass on a
--                          handler that detached nothing; case 15 is what
--                          actually exercises detachment. An unwrapped
--                          RAISE would surface on the device as a plain Error,
--                          not a LocalSyncError, so runAttempt's catch would
--                          reach recordFailure → .retryableFailure and retry
--                          on EVERY drain forever.
-- 6. ROUTING CLEAR       → payload {routing:{clear:true}} un-places a capture.
--                          COALESCE alone cannot tell "not supplied" from
--                          "explicitly cleared", and a defaulted 8th argument
--                          would create a SECOND OVERLOAD that makes every
--                          existing 7-argument call ambiguous.
-- 7. POLICY SHAPE        → all five field_captures policies are TO
--                          authenticated AND carry their shipped predicates.
--                          Section (b) of the migration DROPs and re-CREATEs
--                          every one of them, so a typo in a USING clause is
--                          precisely the regression this case exists to catch
--                          — a count alone would stay green through a silently
--                          widened predicate. Each qual/with_check is compared
--                          (whitespace-normalised) against 00233:155-188.
--                          ⚠ The count is 5 TODAY (00233:155/159/163/168/175).
--                          FC-R8 ruling per-studio would add a sixth; this
--                          assertion is meant to fail loudly if it does.
-- 8-11. DEFENSIVE        → a malformed captureKind / transcriptSource /
--       PROJECTION         noteSetting / audioSegments must NOT raise. Each of
--                          those values would violate one of the migration's
--                          named CHECK constraints (or the jsonb type of
--                          voice_audio_segments), and the raise would come
--                          from the UPSERT — before both destination branches
--                          and therefore OUTSIDE every safe harbor. The RPC
--                          would fail on BOTH destinations and an offline
--                          device would retry that capture forever. The row
--                          must still commit, the offending column must carry
--                          its default, and the dropped value must be recorded
--                          in raw_payload -> 'projection_errors'.
-- 12. NO FALSE FIRE      → a well-formed payload leaves projection_errors
--                          absent. A projection that fires on good input is as
--                          wrong as one that never fires. Asserted inline on
--                          the case-1 row, which is the well-formed one.
-- 13. NO CLOBBER         → projection_errors and the safe harbor's conflict
--                          are distinct TOP-LEVEL keys of raw_payload, written
--                          by two different merges. A capture that is both
--                          malformed AND badly routed must end up carrying
--                          BOTH.
-- 14. CLEAR IS TOTAL     → a non-boolean routing.clear ("yes", 1, null) must
--                          neither abort nor clear. The read is a jsonb
--                          comparison, not a ::boolean cast, which would raise
--                          22P02 outside every handler.
-- 15. STALE STORED       → a capture whose STORED project_id has gone stale
--     ROUTING              (its room was re-parented) must still sync. The
--                          unconditional BEFORE UPDATE guard re-validates it
--                          on the upsert — before either destination branch
--                          and outside the harbors they carry — so the upsert
--                          needs its own harbor. The stale routing is detached
--                          and recorded, and the row commits.
-- 16. CONFLICT APPENDS   → two harbors can fire in ONE call (stale STORED
--                          routing at the upsert, then a bad INCOMING route in
--                          the inbox branch). raw_payload.conflict is an
--                          append-only ARRAY, so the second write must not
--                          replace the first — otherwise the only trace of
--                          what the row used to be filed under is lost.
-- 17. SPARSE SEGMENTS    → voice.audioSegments can legitimately arrive
--                          NON-CONTIGUOUS by filename (e.g. -000, -002): a
--                          local file lost to a full disk is OMITTED, never
--                          left as a hole or a null, so the array is always
--                          the ordered list of segments that actually exist.
--                          00530 stores it AS-IS — no contiguity check, no
--                          reordering, no renumbering — and the defensive
--                          projection (cases 8-11) must not mistake a
--                          legitimately sparse array for a corrupt one.
--
-- How to run:
--   scripts/run-sql-tests.sh -f field_capture_note_routing
-- and, for the wave report, the FULL suite as well — it exits 0 with the 22
-- documented known failures in supabase/tests/KNOWN_FAILURES.md, so a new
-- unexpected failure is a real regression.
--
-- ⚠ The runner connects as `postgres` (superuser, run-sql-tests.sh:92), so the
-- auth.uid()-shaped cases below exercise the RPC's LOGIC with RLS BYPASSED.
-- apply_field_effect_test.sql:25-27 documents the same caveat. Nothing here
-- proves RLS; do not report it as such.
--
-- Transaction-wrapped + ROLLBACK. commit_field_capture is SECURITY INVOKER and
-- reads auth.uid(), so every call sets request.jwt.claims first.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fc000000-0000-4000-8000-000000000001', 'fc-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ('fc000000-0000-4000-8000-000000000002', 'fc-other@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fc000000-0000-4000-8000-000000000001', 'fc-designer@test.invalid', 'FC Designer', NOW(), NOW()),
       ('fc000000-0000-4000-8000-000000000002', 'fc-other@test.invalid',    'FC Other',    NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fc000000-0000-4000-8000-0000000000a1', 'FC Maple St', 'fc000000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000001'),
       ('fc000000-0000-4000-8000-0000000000a2', 'FC Not Mine', 'fc000000-0000-4000-8000-000000000002', 'fc000000-0000-4000-8000-000000000002');

-- ⚠ 'd1', not 'r1': `r` is not a hex digit and the uuid cast fails before the
--   first assertion runs.
INSERT INTO project_rooms (id, project_id, name)
VALUES ('fc000000-0000-4000-8000-0000000000d1', 'fc000000-0000-4000-8000-0000000000a1', 'Living');

DO $$
DECLARE
  v_res       JSONB;
  v_project   UUID;
  v_room      UUID;
  v_segments  JSONB;
  v_kind      TEXT;
  v_status    TEXT;
  v_conflict  JSONB;
  v_count     INTEGER;
  v_projerr   JSONB;
  v_source    TEXT;
  v_setting   TEXT;
  v_pol       RECORD;
  v_roles     TEXT;
  v_cmd       TEXT;
  v_qual      TEXT;
  v_check     TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'fc000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

  -- 1 + 2 + 3 -------------------------------------------------------------
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c1',
    'inbox',
    jsonb_build_object(
      'captureKind', 'note',
      'voice', jsonb_build_object(
        'audioPath',        'fc/ct/voice-a-000.m4a',
        'audioSegments',    jsonb_build_array('fc/ct/voice-a-000.m4a', 'fc/ct/voice-a-001.m4a'),
        'transcriptSource', 'device',
        'transcript',       'the alcove reads about forty-two and three quarters')),
    'fc000000-0000-4000-8000-0000000000a1',
    'fc000000-0000-4000-8000-0000000000d1');

  SELECT project_id, project_room_id, voice_audio_segments, capture_kind, status,
         raw_payload -> 'projection_errors'
    INTO v_project, v_room, v_segments, v_kind, v_status, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c1';

  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 1a: inbox branch must persist project_id, got ' || COALESCE(v_project::text, 'NULL');
  ASSERT v_room = 'fc000000-0000-4000-8000-0000000000d1',
    'FAIL 1b: inbox branch must persist project_room_id, got ' || COALESCE(v_room::text, 'NULL');
  ASSERT v_status = 'inbox', 'FAIL 1c: status should be inbox, got ' || v_status;
  ASSERT jsonb_array_length(v_segments) = 2,
    'FAIL 2: voice_audio_segments should carry 2 entries, got ' || COALESCE(v_segments::text, 'NULL');
  ASSERT v_kind = 'note', 'FAIL 3: capture_kind should be note, got ' || v_kind;
  ASSERT v_projerr IS NULL OR jsonb_array_length(v_projerr) = 0,
    'FAIL 12: a WELL-FORMED payload must record no projection error, got ' || v_projerr::text;
  RAISE NOTICE 'field_capture routing: cases 1-3 + 12 passed.';

  -- 4 ---------------------------------------------------------------------
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c1', 'inbox', '{}'::jsonb);
  SELECT project_id INTO v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c1';
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 4: a re-commit with no routing must not clear the stored routing';
  RAISE NOTICE 'field_capture routing: case 4 passed.';

  -- 5 — SAFE HARBOR, not a raise -------------------------------------------
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c2', 'inbox', '{}'::jsonb,
    'fc000000-0000-4000-8000-0000000000a2');
  SELECT status, project_id, raw_payload -> 'conflict'
    INTO v_status, v_project, v_conflict
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c2';
  ASSERT v_status = 'inbox',
    'FAIL 5a: a bad route must safe-harbor to inbox, not abort the RPC; got ' || COALESCE(v_status, 'NULL');
  ASSERT v_project IS NULL,
    'FAIL 5b: a refused route must leave project_id NULL, got ' || COALESCE(v_project::text, 'NULL');
  ASSERT v_conflict IS NOT NULL,
    'FAIL 5c: the refused route must be stashed in raw_payload.conflict so she can re-route by hand';
  RAISE NOTICE 'field_capture routing: case 5 passed (safe harbor).';

  -- 6 — explicit un-placing ------------------------------------------------
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c1', 'inbox',
    jsonb_build_object('routing', jsonb_build_object('clear', true)));
  SELECT project_id, project_room_id INTO v_project, v_room
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c1';
  ASSERT v_project IS NULL AND v_room IS NULL,
    'FAIL 6: {routing:{clear:true}} must un-place a capture from the device';
  RAISE NOTICE 'field_capture routing: case 6 passed.';

  -- 7 — POLICY SHAPE: role AND predicate ------------------------------------
  -- Section (b) of the migration DROPs and re-CREATEs all five policies, so a
  -- typo in a USING clause is the regression this case exists to catch. A
  -- count assertion alone stays green through a silently widened predicate,
  -- so each qual / with_check is compared against the shipped 00233:155-188
  -- text, whitespace-normalised (pg_policies renders parenthesised, so the
  -- expected strings below are Postgres's canonical rendering, not the
  -- migration's source formatting).
  FOR v_pol IN
    SELECT *
      FROM (VALUES
        ('field_captures_org_inbox_select', 'SELECT',
         '((status = ''inbox''::text) AND (organization_id IS NOT NULL) AND (organization_id IN ( SELECT om.organization_id FROM organization_members om WHERE ((om.user_id = auth.uid()) AND (om.status = ''active''::member_status)))))',
         '<null>'),
        ('field_captures_owner_delete', 'DELETE', '(designer_id = auth.uid())',  '<null>'),
        ('field_captures_owner_insert', 'INSERT', '<null>',                      '(designer_id = auth.uid())'),
        ('field_captures_owner_select', 'SELECT', '(designer_id = auth.uid())',  '<null>'),
        ('field_captures_owner_update', 'UPDATE', '(designer_id = auth.uid())',  '(designer_id = auth.uid())')
      ) AS t(name, cmd, qual, with_check)
  LOOP
    SELECT array_to_string(p.roles, ','),
           p.cmd,
           COALESCE(btrim(regexp_replace(p.qual,       '\s+', ' ', 'g')), '<null>'),
           COALESCE(btrim(regexp_replace(p.with_check, '\s+', ' ', 'g')), '<null>')
      INTO v_roles, v_cmd, v_qual, v_check
      FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = 'field_captures'
       AND p.policyname = v_pol.name;

    ASSERT FOUND, 'FAIL 7a: policy ' || v_pol.name || ' is missing';
    ASSERT v_roles = 'authenticated',
      'FAIL 7b: policy ' || v_pol.name || ' must be TO authenticated, got ' || COALESCE(v_roles, 'NULL');
    ASSERT v_cmd = v_pol.cmd,
      'FAIL 7c: policy ' || v_pol.name || ' must be FOR ' || v_pol.cmd || ', got ' || COALESCE(v_cmd, 'NULL');
    ASSERT v_qual = v_pol.qual,
      'FAIL 7d: policy ' || v_pol.name || ' USING predicate changed.' || chr(10)
      || '  expected: ' || v_pol.qual || chr(10) || '  got:      ' || COALESCE(v_qual, 'NULL');
    ASSERT v_check = v_pol.with_check,
      'FAIL 7e: policy ' || v_pol.name || ' WITH CHECK predicate changed.' || chr(10)
      || '  expected: ' || v_pol.with_check || chr(10) || '  got:      ' || COALESCE(v_check, 'NULL');
  END LOOP;

  -- And no SIXTH policy has appeared alongside them.
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'field_captures';
  ASSERT v_count = 5,
    'FAIL 7f: field_captures should carry exactly five policies, got ' || v_count
    || ' (if FC-R8 ruled per-studio and added a sixth, update this case deliberately)';
  RAISE NOTICE 'field_capture routing: case 7 passed (5 policies, roles + predicates).';

  -- 8-11 — DEFENSIVE PROJECTION: malformed values must not raise -------------
  -- Each value below would violate a named CHECK constraint (or the jsonb type
  -- of voice_audio_segments) if written through unprojected, and the raise
  -- would come from the UPSERT — outside every safe harbor, failing the RPC on
  -- BOTH destinations and making an offline device retry forever.

  -- 8 — captureKind not on the whitelist
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c3', 'inbox',
    jsonb_build_object('captureKind', 'foo'));
  SELECT status, capture_kind, raw_payload -> 'projection_errors'
    INTO v_status, v_kind, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c3';
  ASSERT v_status = 'inbox',
    'FAIL 8a: a malformed captureKind must still commit, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_kind = 'specimen',
    'FAIL 8b: a malformed captureKind must fall back to specimen, got ' || COALESCE(v_kind, 'NULL');
  ASSERT v_projerr @> '[{"key": "captureKind"}]'::jsonb,
    'FAIL 8c: the dropped captureKind must be recorded in raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 8 passed (captureKind projected).';

  -- 9 — transcriptSource not on the whitelist
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c4', 'inbox',
    jsonb_build_object('voice', jsonb_build_object('transcriptSource', 'x')));
  SELECT status, transcript_source, raw_payload -> 'projection_errors'
    INTO v_status, v_source, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c4';
  ASSERT v_status = 'inbox',
    'FAIL 9a: a malformed transcriptSource must still commit, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_source IS NULL,
    'FAIL 9b: a malformed transcriptSource must land NULL, got ' || COALESCE(v_source, 'NULL');
  ASSERT v_projerr @> '[{"key": "voice.transcriptSource"}]'::jsonb,
    'FAIL 9c: the dropped transcriptSource must be recorded in raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 9 passed (transcriptSource projected).';

  -- 10 — noteSetting not on the whitelist
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c5', 'inbox',
    jsonb_build_object('voice', jsonb_build_object('noteSetting', 'both')));
  SELECT status, note_setting, raw_payload -> 'projection_errors'
    INTO v_status, v_setting, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c5';
  ASSERT v_status = 'inbox',
    'FAIL 10a: a malformed noteSetting must still commit, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_setting IS NULL,
    'FAIL 10b: a malformed noteSetting must land NULL, got ' || COALESCE(v_setting, 'NULL');
  ASSERT v_projerr @> '[{"key": "voice.noteSetting"}]'::jsonb,
    'FAIL 10c: the dropped noteSetting must be recorded in raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 10 passed (noteSetting projected).';

  -- 11 — audioSegments that is not a jsonb array
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c6', 'inbox',
    jsonb_build_object('voice', jsonb_build_object('audioSegments', 'not-an-array')));
  SELECT status, voice_audio_segments, raw_payload -> 'projection_errors'
    INTO v_status, v_segments, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c6';
  ASSERT v_status = 'inbox',
    'FAIL 11a: a non-array audioSegments must still commit, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_segments = '[]'::jsonb,
    'FAIL 11b: a non-array audioSegments must fall back to [], got ' || COALESCE(v_segments::text, 'NULL');
  ASSERT v_projerr @> '[{"key": "voice.audioSegments"}]'::jsonb,
    'FAIL 11c: the dropped audioSegments must be recorded in raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 11 passed (audioSegments projected).';

  -- 13 — projection_errors and conflict must COMPOSE, not clobber ------------
  -- Malformed captureKind (projection writes raw_payload.projection_errors on
  -- the upsert) AND a project owned by someone else (the inbox safe harbor
  -- writes raw_payload.conflict afterwards). A top-level jsonb || merges keys,
  -- so both must survive.
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c7', 'inbox',
    jsonb_build_object('captureKind', 'foo'),
    'fc000000-0000-4000-8000-0000000000a2');
  SELECT status, capture_kind, raw_payload -> 'projection_errors', raw_payload -> 'conflict'
    INTO v_status, v_kind, v_projerr, v_conflict
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c7';
  ASSERT v_status = 'inbox',
    'FAIL 13a: a malformed AND badly-routed capture must still park at inbox, got '
    || COALESCE(v_status, 'NULL');
  ASSERT v_kind = 'specimen',
    'FAIL 13b: capture_kind should be the projected default, got ' || COALESCE(v_kind, 'NULL');
  ASSERT v_projerr @> '[{"key": "captureKind"}]'::jsonb,
    'FAIL 13c: the safe harbor must not clobber raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  ASSERT v_conflict IS NOT NULL,
    'FAIL 13d: the projection must not clobber raw_payload.conflict';
  RAISE NOTICE 'field_capture routing: case 13 passed (projection_errors + conflict compose).';

  -- 14 — a NON-BOOLEAN routing.clear must not abort ---------------------------
  -- The read is ((v_payload #> '{routing,clear}') = 'true'::jsonb), not a
  -- ::boolean cast. A cast would raise 22P02 on each of these, before the
  -- upsert and outside every handler — the same forever-retry failure as
  -- cases 8-11, one step earlier. Each must commit and PRESERVE routing.
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c8', 'inbox', '{}'::jsonb,
    'fc000000-0000-4000-8000-0000000000a1',
    'fc000000-0000-4000-8000-0000000000d1');

  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c8', 'inbox',
    jsonb_build_object('routing', jsonb_build_object('clear', 'yes')));
  SELECT status, project_id INTO v_status, v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c8';
  ASSERT v_status = 'inbox',
    'FAIL 14a: routing.clear "yes" must not abort the RPC, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 14b: a non-boolean routing.clear must NOT clear routing, got '
    || COALESCE(v_project::text, 'NULL');

  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c8', 'inbox',
    jsonb_build_object('routing', jsonb_build_object('clear', 1)));
  SELECT project_id INTO v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c8';
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 14c: routing.clear 1 must not abort and must not clear routing, got '
    || COALESCE(v_project::text, 'NULL');

  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c8', 'inbox',
    '{"routing": {"clear": null}}'::jsonb);
  SELECT project_id INTO v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c8';
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 14d: routing.clear null must not abort and must not clear routing, got '
    || COALESCE(v_project::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 14 passed (non-boolean routing.clear).';

  -- 15 — STALE STORED ROUTING must not abort the upsert -----------------------
  -- trg_field_captures_guard_update is unconditional (00233:258-260), so the
  -- ON CONFLICT DO UPDATE re-validates the STORED project_id even though it
  -- never writes it. Transferring the project away makes that stored value
  -- illegal, and without the upsert's own harbor the RPC aborts BEFORE either
  -- destination branch — outside the harbors both branches carry. That row
  -- would then be un-syncable from the device forever.
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c9', 'inbox', '{}'::jsonb,
    'fc000000-0000-4000-8000-0000000000a1',
    'fc000000-0000-4000-8000-0000000000d1');
  SELECT project_id INTO v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c9';
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 15a: fixture setup — the capture should be routed before the project moves';

  -- The room is re-parented to the other project. The capture's stored
  -- (project_id, project_room_id) pair is now illegal — the guard's
  -- "room must belong to the routed project" branch (00233:231-236).
  -- (Transferring the project itself is not usable as a fixture here:
  --  guard_project_terminal_identity_integrity refuses a direct designer_id
  --  change, "project lead may only change through reassign_project_lead".)
  UPDATE project_rooms
     SET project_id = 'fc000000-0000-4000-8000-0000000000a2'
   WHERE id = 'fc000000-0000-4000-8000-0000000000d1';

  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c9', 'inbox',
    jsonb_build_object('title', 'still syncing'));
  SELECT status, project_id, project_room_id, raw_payload -> 'conflict'
    INTO v_status, v_project, v_room, v_conflict
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c9';
  ASSERT v_status = 'inbox',
    'FAIL 15b: a capture with STALE STORED routing must still sync, got status '
    || COALESCE(v_status, 'NULL');
  ASSERT v_project IS NULL AND v_room IS NULL,
    'FAIL 15c: stale stored routing must be detached, got project ' || COALESCE(v_project::text, 'NULL');
  ASSERT v_conflict IS NOT NULL,
    'FAIL 15d: the detached routing must be recorded in raw_payload.conflict';
  ASSERT jsonb_typeof(v_conflict) = 'array',
    'FAIL 15e: raw_payload.conflict is an append-only array, got '
    || COALESCE(jsonb_typeof(v_conflict), 'NULL');
  ASSERT v_conflict @> '[{"detached_project_id": "fc000000-0000-4000-8000-0000000000a1"}]'::jsonb,
    'FAIL 15f: the conflict must name what was detached so she can re-route by hand, got '
    || COALESCE(v_conflict::text, 'NULL');
  ASSERT v_conflict @> '[{"stage": "upsert"}]'::jsonb,
    'FAIL 15g: the record must say the UPSERT harbor caught it, not a branch harbor, got '
    || COALESCE(v_conflict::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 15 passed (stale stored routing detached, not aborted).';

  -- Restore the fixture so nothing after this depends on the re-parenting.
  UPDATE project_rooms
     SET project_id = 'fc000000-0000-4000-8000-0000000000a1'
   WHERE id = 'fc000000-0000-4000-8000-0000000000d1';

  -- 16 — TWO HARBORS, ONE CALL: conflict must APPEND, not clobber -------------
  -- raw_payload.conflict is written by more than one harbor and they are
  -- reachable together: stale STORED routing fires EDIT 4's upsert harbor,
  -- and a bad INCOMING route then fires the inbox harbor. A single-object key
  -- would have the second write replace the first, losing the only trace of
  -- what the row used to be filed under. It is an append-only ARRAY.
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000ca', 'inbox', '{}'::jsonb,
    'fc000000-0000-4000-8000-0000000000a1',
    'fc000000-0000-4000-8000-0000000000d1');

  UPDATE project_rooms
     SET project_id = 'fc000000-0000-4000-8000-0000000000a2'
   WHERE id = 'fc000000-0000-4000-8000-0000000000d1';

  -- Stale STORED routing AND a bad INCOMING route, in one call.
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000ca', 'inbox', '{}'::jsonb,
    'fc000000-0000-4000-8000-0000000000a2');
  SELECT status, project_id, raw_payload -> 'conflict'
    INTO v_status, v_project, v_conflict
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000ca';
  ASSERT v_status = 'inbox',
    'FAIL 16a: both harbors firing must still leave the capture synced, got status '
    || COALESCE(v_status, 'NULL');
  ASSERT v_project IS NULL,
    'FAIL 16b: neither route was legal, so project_id must be NULL, got '
    || COALESCE(v_project::text, 'NULL');
  ASSERT jsonb_typeof(v_conflict) = 'array',
    'FAIL 16c: raw_payload.conflict must be an append-only array, got '
    || COALESCE(jsonb_typeof(v_conflict), 'NULL');
  ASSERT jsonb_array_length(v_conflict) = 2,
    'FAIL 16d: both harbors must be recorded, got ' || COALESCE(v_conflict::text, 'NULL');
  ASSERT v_conflict @> '[{"stage": "upsert"}]'::jsonb,
    'FAIL 16e: the upsert harbor''s record must survive the inbox harbor''s write, got '
    || COALESCE(v_conflict::text, 'NULL');
  ASSERT v_conflict @> '[{"stage": "inbox_route"}]'::jsonb,
    'FAIL 16f: the inbox harbor must append its own record, got '
    || COALESCE(v_conflict::text, 'NULL');
  ASSERT v_conflict @> '[{"detached_project_id": "fc000000-0000-4000-8000-0000000000a1"}]'::jsonb,
    'FAIL 16g: the trace of what the row used to be filed under must survive, got '
    || COALESCE(v_conflict::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 16 passed (conflict appends, never clobbers).';

  UPDATE project_rooms
     SET project_id = 'fc000000-0000-4000-8000-0000000000a1'
   WHERE id = 'fc000000-0000-4000-8000-0000000000d1';

  -- 17 — NON-CONTIGUOUS audioSegments must round-trip AS-IS -------------------
  -- A missing local file (lost to a full disk) is OMITTED from the array —
  -- never a hole, never a null — so the array can legitimately arrive
  -- non-contiguous by filename. This is a LEGAL payload, not a malformed one:
  -- it must commit cleanly, round-trip exactly, and must NOT trip the
  -- defensive projection from case 11 (which exists for a value that fails
  -- jsonb_typeof(...) = 'array', not for an array that is merely short).
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000cb', 'inbox',
    jsonb_build_object(
      'voice', jsonb_build_object(
        'audioSegments', jsonb_build_array(
          'fc/ct/voice-a-000.m4a',
          'fc/ct/voice-a-002.m4a'))));
  SELECT status, voice_audio_segments, raw_payload -> 'projection_errors'
    INTO v_status, v_segments, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000cb';
  ASSERT v_status = 'inbox',
    'FAIL 17a: a non-contiguous audioSegments array must still commit, got status '
    || COALESCE(v_status, 'NULL');
  ASSERT v_segments = jsonb_build_array('fc/ct/voice-a-000.m4a', 'fc/ct/voice-a-002.m4a'),
    'FAIL 17b: voice_audio_segments must round-trip the array exactly — same two elements, same order — got '
    || COALESCE(v_segments::text, 'NULL');
  ASSERT jsonb_array_length(v_segments) = 2,
    'FAIL 17c: voice_audio_segments must still carry exactly 2 entries, got '
    || COALESCE(v_segments::text, 'NULL');
  ASSERT v_projerr IS NULL OR jsonb_array_length(v_projerr) = 0,
    'FAIL 17d: a legally sparse audioSegments array must NOT be mistaken for a corrupt one, got '
    || COALESCE(v_projerr::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 17 passed (non-contiguous audioSegments round-trips).';

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'All field_capture note-routing assertions passed.';
END
$$;

ROLLBACK;
