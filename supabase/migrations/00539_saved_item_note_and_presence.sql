-- ═══════════════════════════════════════════════════════════════════════════
-- 00539 — the note on a saved row
--
-- W4 gives the Saved row its three facts: save date, room, and note
-- (direction-b §3, F197/F170). The first two have been columns since 00055
-- (`created_at`, `room_id`). The third has been one too — `notes`, 00055:29 —
-- but unbounded and undocumented, which is the whole of what this file fixes.
--
-- ⚠ The W4 brief named this column `note`, singular, and asked for
--   `ADD COLUMN IF NOT EXISTS note text`. `note` genuinely does not exist, so
--   that statement would have SUCCEEDED and minted a second home for one fact.
--   The iOS write leg already fills `notes` — `CreateSavedItemPayload.notes`,
--   `apps/mobile/Patina/Patina/Core/Network/RoomsAPIClient.swift:133`, backed
--   by `TableItemModel.notes:42` — so a reader of a new `note` column would
--   have found every row NULL and the app would have said nothing where the
--   person had written something. The note therefore stays where it lives, and
--   this migration hardens that column instead. Same shape 00535 used when the
--   build plan named `room_id` and `room_id` turned out to already exist
--   (00535:22-27).
--
-- Three statements, in order:
--
--   1. ADD COLUMN IF NOT EXISTS — a no-op at or past 00055:29. Kept so a replay
--      from an older baseline lands the same shape before the CHECK is added.
--
--   2. A named length CHECK, ≤ 2000 characters. Postgres has no
--      `ADD CONSTRAINT IF NOT EXISTS`, so the idempotent pair is DROP IF EXISTS
--      then ADD. NULL passes the CHECK explicitly (`notes IS NULL OR …`) rather
--      than by SQL's three-valued accident, so the intent is readable: an unset
--      note is silence.
--
--      ⚠ This CHECK VALIDATES EXISTING ROWS. On a stack already holding a note
--        longer than 2000 characters the migration FAILS rather than truncating
--        somebody's words — the loud failure is the correct one; nobody's note
--        gets shortened by a migration. Local is 0 rows at 00538, so nothing is
--        validated here; nothing is asserted about Strata.
--
--   3. A comment, so the next reader knows who writes the column and what an
--      absent note means.
--
-- No GRANT, no REVOKE, no function, no policy, no new table ⇒
-- `seed/00-legacy-grants.sql` is NOT regenerated, and the 00055 owner policies
-- ("Users can view/insert/update/delete their own saved items") already cover
-- every column of this table. Generated types do NOT drift either — the column
-- already existed at 00538 — and `database.types.ts` is regenerated in this
-- wave to prove that rather than to assume it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. no-op at or past 00055:29; present for replay from an older baseline ─

ALTER TABLE public.saved_items
  ADD COLUMN IF NOT EXISTS notes text;

-- ─── 2. a note is a note, not an essay ──────────────────────────────────────

ALTER TABLE public.saved_items
  DROP CONSTRAINT IF EXISTS saved_items_notes_length_check;

ALTER TABLE public.saved_items
  ADD CONSTRAINT saved_items_notes_length_check
  CHECK (notes IS NULL OR char_length(notes) <= 2000);

-- ─── 3. what the column is ──────────────────────────────────────────────────

COMMENT ON COLUMN public.saved_items.notes IS
  'What the person wrote about this piece when she saved it, in her own words — the third fact on a Saved row, beside the save date (created_at) and the room (room_id). Written by the client apps only; nothing derives it and nothing generates it. NULL when she wrote nothing, and the row then draws no note line rather than an empty one — that rule is the client''s, not this column''s. Bounded at 2000 characters by saved_items_notes_length_check.';

-- ═══════════════════════════════════════════════════════════════════════════
-- §2 — when a homeowner was last here is hers, and her designer's
--
-- Added to this file rather than minted as 00540: 00539 is unmerged, W5's
-- backend already holds 00540 (integration.md §7), and the ruling this answers
-- (integration.md §6.6) arrived after the file was written. The file's own
-- name moved with it — `00539_saved_items_note.sql` →
-- `00539_saved_item_note_and_presence.sql` — so it does not hide a
-- security-shaped change behind a note-shaped name.
--
-- What was wrong. 00537 §2 put `last_seen_at` on `public.profiles`, and
-- `profiles` carries `FOR SELECT USING (true)` (00013:57-58). W4's H2 lane is
-- the first writer of the column, so from the first foreground **any**
-- authenticated user could read when a given homeowner last opened the app.
-- Nothing designed that; nobody had ruled on the surface (h2-notes.md §3a.1,
-- integration.md §6.6). Fable's ruling: the person herself, and the designer
-- of record — nobody else.
--
-- So the fact moves off the world-readable row onto a table whose whole
-- purpose is that one column, with RLS that says exactly who may read it:
--
--   · the owner              — SELECT, INSERT, UPDATE on her own row
--   · her designer of record — SELECT only, where an ACCEPTED lead or an
--                              ACTIVE project names that designer for that
--                              client. Nothing else, and never a write.
--
-- The two EXISTS clauses read `leads` and `projects` under the caller's own
-- RLS, which is what makes them safe without a SECURITY DEFINER helper: a
-- designer's own leads (`00027`: "Designers can view their leads",
-- auth.uid() = designer_id) and her own projects (`00168`: "Project
-- participants can view projects") are visible to her, and rows naming
-- another designer are not — so the clause cannot be used to widen the read.
--
-- `profiles.last_seen_at` is then DROPPED. Nothing reads it: the grep is
-- 00538's anonymize UPDATE (re-issued below without the column), this wave's
-- own mirror (re-pointed at the new table), the 00537 test (re-pointed), and
-- the generated types (regenerated). The column was NULL on every row of the
-- local stack and was never pushed to Strata.
--
-- ⚠ `purge_client_account` is re-issued in full below, because 00538's body
--   writes `last_seen_at = NULL` and a plpgsql body is only parsed when it
--   runs — the DROP would have left a function that fails at the moment a
--   person closes her account. The re-issue is 00538's text with that one
--   line removed and `public.profile_presence` added to the owned-table set,
--   so closing an account still takes the presence row with it. 00538 is on
--   `main` and is not edited.
--
-- GRANTs: a new table ⇒ `seed/00-legacy-grants.sql` IS regenerated in this
-- wave. Generated types DO drift on this file (one table gained, one column
-- dropped); `packages/supabase/src/database.types.ts` is regenerated with it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. the table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profile_presence (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_presence IS
  'When a person was last seen in a Patina client, for server-side surfaces that cannot ask the device. One row per profile, readable by that person and by her designer of record and by nobody else — it moved off public.profiles because that table is world-readable to any authenticated user (00013:57-58) and this fact is not (integration.md §6.6). The app''s own "new since you were here" tick still reads LastSeenStore on the device; nothing counts days away at the person (C5).';

COMMENT ON COLUMN public.profile_presence.last_seen_at IS
  'The moment of this person''s most recent foreground in a Patina client. Written by the client apps for themselves only.';

ALTER TABLE public.profile_presence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_presence FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profile_presence TO authenticated;
GRANT ALL ON TABLE public.profile_presence TO service_role;

-- ─── 2. who may read it, and who may write it ───────────────────────────────

DROP POLICY IF EXISTS "A person reads her own presence" ON public.profile_presence;
CREATE POLICY "A person reads her own presence"
  ON public.profile_presence FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "A person records her own presence" ON public.profile_presence;
CREATE POLICY "A person records her own presence"
  ON public.profile_presence FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "A person updates her own presence" ON public.profile_presence;
CREATE POLICY "A person updates her own presence"
  ON public.profile_presence FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "The designer of record reads her client's presence" ON public.profile_presence;
CREATE POLICY "The designer of record reads her client's presence"
  ON public.profile_presence FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.homeowner_id = public.profile_presence.user_id
         AND l.designer_id  = auth.uid()
         AND l.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.client_id   = public.profile_presence.user_id
         AND p.designer_id = auth.uid()
         AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Service role full access to profile_presence" ON public.profile_presence;
CREATE POLICY "Service role full access to profile_presence"
  ON public.profile_presence FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- ─── 3. carry anything already written, then drop the world-readable column ─

INSERT INTO public.profile_presence (user_id, last_seen_at)
SELECT id, last_seen_at FROM public.profiles WHERE last_seen_at IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
  SET last_seen_at = GREATEST(public.profile_presence.last_seen_at, EXCLUDED.last_seen_at);

ALTER TABLE public.profiles DROP COLUMN IF EXISTS last_seen_at;

-- ─── 4. 00538's account closure, without the dropped column ─────────────────

CREATE OR REPLACE FUNCTION public.purge_client_account(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- 'schema.table:column' — every table keyed by the CLIENT's own user id that
  -- used to vanish through the profiles cascade. Read the banner for what is
  -- deliberately absent.
  v_owned    text[] := ARRAY[
    'public.profile_presence:user_id',          -- 00539: the presence row is hers too
    'public.rooms:user_id',                     -- ruling 2, named
    'public.room_scans:user_id',                -- ruling 2, named
    'public.saved_items:user_id',               -- ruling 2, named
    'public.board_unfurl_usage:user_id',
    'public.client_style_profiles:user_id',
    'public.comms_quick_replies:profile_id',
    'public.companion_conversations:user_id',
    'public.companion_messages:user_id',
    'public.companion_quick_action_log:user_id',
    'public.decision_comments:author_id',
    'public.decision_notifications:user_id',
    'public.device_pair_sessions:user_id',
    'public.device_push_tokens:user_id',
    'public.engagement_events:user_id',
    'public.feed_cache_meta:user_id',
    'public.interactions:user_id',
    'public.item_feedback:client_id',
    'public.notification_log:user_id',
    'public.notification_preferences:user_id',
    'public.oauth_accounts:user_id',
    'public.procurement_notifications:user_id',
    'public.product_user_dwell:user_id',
    'public.sequence_enrollments:user_id',
    'public.user_roles:user_id',
    'public.user_room_engagement:user_id',
    'public.user_sessions:user_id',
    'public.user_settings:user_id',
    'public.user_style_signals:user_id',
    'public.user_wishlist:user_id',
    'public.client_messages:sender_id'
  ];
  v_target   text;
  v_tbl      text;
  v_col      text;
  v_rows     integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_threads  uuid[];
  v_purge    uuid;
  -- the journal as it already stands, when this call is a retry
  v_prior       jsonb := '{}'::jsonb;
  v_merged      jsonb;
  v_threads_all uuid[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'purge_client_account requires a user id'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── the designer refusal (review B-D3), verbatim from 00536 ──
  IF EXISTS (SELECT 1 FROM public.profiles pr
              WHERE pr.id = p_user_id AND pr.is_designer)
     OR EXISTS (SELECT 1 FROM public.projects        WHERE designer_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.proposals       WHERE designer_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.designer_clients WHERE designer_id = p_user_id)
  THEN
    RAISE EXCEPTION 'purge_client_account refuses a designer account: % owns designer-side rows that would cascade, not detach', p_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'purge_client_account found no profile for %', p_user_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── 1. the tombstone ──
  -- display_name is what a designer's screen reads when it names the client on
  -- a document she keeps. It says what happened, plainly, and carries nothing
  -- of the person. role and is_designer stay: the relationship was a
  -- homeowner's, and that remains true of the record. help_state and
  -- availability_status go back to their defaults rather than NULL — both are
  -- NOT NULL, and neither carries anything personal once emptied.
  UPDATE public.profiles
     SET display_name              = 'Former client',
         email                     = NULL,
         full_name                 = NULL,
         avatar_url                = NULL,
         phone                     = NULL,
         city                      = NULL,
         state                     = NULL,
         zip                       = NULL,
         bio                       = NULL,
         website                   = NULL,
         business_name             = NULL,
         posthog_distinct_id       = NULL,
         extension_user_id         = NULL,
         ios_device_id             = NULL,
         original_source           = NULL,
         original_utm              = NULL,
         help_state                = '{}'::jsonb,
         stripe_customer_id        = NULL,
         availability_status       = 'online',
         last_active_at            = NULL,
         sms_opt_in                = false,
         behavioral_tracking_opt_out = true,
         email_suppressed          = true,
         email_suppressed_at       = COALESCE(email_suppressed_at, now())
   WHERE id = p_user_id;

  -- ── 2. the threads the client started, minus the ones she does not own alone ──
  -- Ruling 2 puts these on the client-owned side; Fable narrowed the clause
  -- (integration.md §7 item 3, from d-notes §3): a thread is the client's alone
  -- only while no designer has spoken in it. One that carries a designer-
  -- authored message is HER record too, and cascading it would take her words
  -- with it — the one thing ruling 2's own headline forbids. That thread is
  -- kept whole.
  --
  -- Nothing inside a kept thread is scrubbed, because nothing in it names the
  -- person any more: comms_messages.sender_id references profiles(id), and that
  -- row survived step 1 as the tombstone, so the client's messages already read
  -- as 'Former client'. Their bodies are the designer's conversation.
  --
  -- Participants and messages cascade from the threads that ARE deleted.
  -- Threads the DESIGNER started are untouched, as before; the client's
  -- participant row on those now names the tombstone.
  WITH gone AS (
    DELETE FROM public.comms_threads t
     WHERE t.created_by = p_user_id
       AND NOT EXISTS (
             SELECT 1
               FROM public.comms_messages m
               JOIN public.profiles pr ON pr.id = m.sender_id
              WHERE m.thread_id = t.id
                AND m.sender_id <> p_user_id
                AND pr.is_designer)
    RETURNING t.id)
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_threads FROM gone;
  IF array_length(v_threads, 1) IS NOT NULL THEN
    v_deleted := v_deleted || jsonb_build_object(
      'public.comms_threads', array_length(v_threads, 1));
  END IF;

  -- ── 3. everything else the person owned ──
  FOREACH v_target IN ARRAY v_owned LOOP
    v_tbl := split_part(v_target, ':', 1);
    v_col := split_part(v_target, ':', 2);
    -- A table that does not exist on this database is skipped rather than
    -- fatal: the list outlives any one migration baseline.
    CONTINUE WHEN to_regclass(v_tbl) IS NULL;
    EXECUTE format('DELETE FROM %s WHERE %I = $1', v_tbl, v_col) USING p_user_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      v_deleted := v_deleted || jsonb_build_object(v_tbl, v_rows);
    END IF;
  END LOOP;

  -- ── 4. the journal ──
  -- Reuse an open row. The purge and the auth detach are two round trips (the
  -- detach goes through GoTrue's admin API), so a retry is expected; a second
  -- row would read as a second interrupted closure that never happened.
  -- No email is stored: an erasure ledger does not retain the address it
  -- erased. user_id identifies the row, and after the soft delete it names a
  -- profile that carries nothing of the person.
  SELECT id, COALESCE(detached, '{}'::jsonb)
    INTO v_purge, v_prior
    FROM public.client_account_purges
   WHERE user_id = p_user_id AND auth_deleted_at IS NULL
   ORDER BY purged_at DESC
   LIMIT 1;

  IF v_purge IS NULL THEN
    INSERT INTO public.client_account_purges (user_id, email, detached)
    VALUES (p_user_id, NULL, jsonb_build_object(
      'tombstoned_profile', to_jsonb(p_user_id),
      'deleted',            v_deleted,
      'threads_deleted',    to_jsonb(v_threads)))
    RETURNING id INTO v_purge;
  ELSE
    -- MERGE into the standing record; never overwrite it. On a retry the first
    -- pass has already deleted everything, so THIS pass's counts are all zero —
    -- writing them over the row would discard the only evidence of what the
    -- closure actually removed, which is the one thing client_account_purges
    -- exists to hold ("so an interrupted closure can be reconciled", 00536).
    -- Counts are summed per table, so a row created between the two calls and
    -- swept by the second is added to the tally rather than replacing it.
    SELECT COALESCE(jsonb_object_agg(g.tbl, g.n), '{}'::jsonb) INTO v_merged
      FROM (SELECT e.key AS tbl, sum(e.value::bigint) AS n
              FROM (SELECT key, value FROM jsonb_each_text(
                      CASE WHEN jsonb_typeof(v_prior->'deleted') = 'object'
                           THEN v_prior->'deleted' ELSE '{}'::jsonb END)
                    UNION ALL
                    SELECT key, value FROM jsonb_each_text(v_deleted)) e
             GROUP BY e.key) g;

    SELECT COALESCE(array_agg(DISTINCT s.u), '{}'::uuid[]) INTO v_threads_all
      FROM (SELECT x::uuid AS u
              FROM jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(v_prior->'threads_deleted') = 'array'
                          THEN v_prior->'threads_deleted' ELSE '[]'::jsonb END) AS x
            UNION ALL
            SELECT unnest(v_threads)) s;

    -- v_prior || … keeps any key an earlier lineage wrote that this one does not.
    UPDATE public.client_account_purges
       SET detached = v_prior || jsonb_build_object(
             'tombstoned_profile', to_jsonb(p_user_id),
             'deleted',            v_merged,
             'threads_deleted',    to_jsonb(v_threads_all)),
           purged_at = now()
     WHERE id = v_purge;
  END IF;

  RETURN v_purge;
END;
$$;

-- CREATE OR REPLACE preserves the ACL, but the generated legacy-grants seed
-- reads these lines, so they stay stated.
REVOKE ALL ON FUNCTION public.purge_client_account(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_client_account(uuid) TO service_role;
