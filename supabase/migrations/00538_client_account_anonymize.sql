-- ═══════════════════════════════════════════════════════════════════════════
-- 00538 — An erasure anonymizes the client; the designer's record stays whole
--
-- Function-body lineage: purge_client_account 00536 → 00538.
--
-- Fable's W1b ruling 2, taken on lane D's own escalation (waves/w1b/d-notes.md
-- §6(c)): "Anonymize and detach; never cascade designer-owned records. Erasure
-- of a client's personal data ≠ deletion of the designer's business records."
--
-- WHAT 00536 DID, AND WHY IT COULD NOT DO THIS
-- 00536 cleared the road for a HARD `DELETE FROM auth.users`. Because
-- `profiles.id REFERENCES auth.users(id) ON DELETE CASCADE` (00013:12), that
-- delete takes the person's profile with it — so every designer-owned row
-- naming the client had to be NULLed first, and NULLing a NON-DRAFT proposal's
-- client_id has no sanctioned path at all: guard_proposal_copy_immutability
-- raises on any client_id/designer_client_id change to a non-draft row and,
-- unlike guard_proposal_authority, offers NO authority GUC to satisfy. (The
-- "sanctioned" set_document_client is also unavailable to a service-role
-- purge: it requires auth.uid() to be the owning designer AND refuses a
-- non-draft proposal — 00387:1092-1145.) So 00536 disabled the user triggers
-- on five tables inside the transaction. That works, and it is a
-- maintenance-window-shaped operation: ALTER TABLE … DISABLE TRIGGER takes
-- ACCESS EXCLUSIVE, and for the length of one homeowner's closure every read
-- and write of proposals, projects, invoices, client_decisions and
-- client_decision_options blocks portal-wide, for every designer (review
-- M-D5). It also destroyed the designer's decision record outright, because
-- client_decisions hangs off the client-owned designer_clients row, which
-- cascaded — the finding that produced ruling 2.
--
-- WHAT CHANGES HERE
-- The auth user is DETACHED rather than hard-deleted: the edge function now
-- calls GoTrue's admin delete with should_soft_delete. Verified against this
-- stack (spike, 2026-08-27): a soft delete obfuscates auth.users.email and
-- .phone, empties raw_user_meta_data, nulls encrypted_password, empties
-- auth.identities.identity_data and hashes its provider_id, drops every
-- session, stamps deleted_at — and LEAVES public.profiles standing. The login
-- is destroyed and the address is freed; the row that everything else points
-- at survives.
--
-- With the profile surviving, the tombstone IS the client's own profiles row,
-- and every designer-owned leg already points at it: proposals.client_id,
-- projects.client_id, invoices.client_id, designer_clients.client_id and
-- comms_threads.created_by all reference profiles(id) (only
-- client_decisions.{selected_by, answered_by} reference auth.users, whose row
-- also survives a soft delete). So this function writes NOTHING to proposals,
-- projects, invoices, client_decisions or designer_clients. No authority guard
-- is approached, no trigger is disabled, no ACCESS EXCLUSIVE is taken, and the
-- decision record — with its options and its roster parent — simply stays.
--
-- WHAT IT DOES DO
--   1. refuses a designer id outright, verbatim from 00536 (review B-D3):
--      designer_id is ON DELETE CASCADE everywhere, so the same call would
--      erase her book of business rather than detach a person from it;
--   2. replaces the PII on the client's profiles row with a tombstone;
--   3. deletes the client-owned artefacts. Ruling 2 names four — rooms, room
--      scans, saved items, and the threads the client started. The rest of the
--      list below is what USED to vanish through the auth.users → profiles
--      cascade when the delete was hard: with the profile now surviving,
--      nothing cascades, so not deleting them would leave the person's data
--      behind. The list is explicit rather than derived, so it can be read and
--      argued with. Deliberately NOT on it:
--        · public.profiles                — it is the tombstone;
--        · public.designer_clients        — the roster row is what keeps the
--          decision record alive; that is the whole point of ruling 2;
--        · public.comms_thread_participants — removing the leaver from a
--          thread the DESIGNER started would break comms_participants_
--          cardinality (a deferred constraint trigger) and rewrite her
--          conversation; the participant row now names a tombstone instead;
--        · consent_records, consent_audit_log, data_export_requests,
--          account_deletion_requests — the erasure paper trail. Deleting the
--          evidence of consent and of the deletion request is the one thing an
--          erasure must not do;
--   4. journals what it did into client_account_purges (00536), reusing an
--      open row rather than opening a second one, so a retry after a failed
--      auth step does not leave a phantom "interrupted closure".
--
-- ⚠ NOT scrubbed here, and flagged for Kody as a retention question rather
--   than decided by a lane: designer_clients.client_name / .client_email carry
--   the DESIGNER's own copy of the person's name and address, alongside her
--   private CRM notes. Ruling 2 scopes the tombstone to `profiles`. See
--   waves/w2/d-notes.md §4.
--
-- No new table, no new grant beyond re-stating 00536's posture (the generated
-- legacy-grants seed reads these lines), no public-schema shape change — so
-- database.types.ts does not drift on this file.
-- ═══════════════════════════════════════════════════════════════════════════

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
         last_seen_at              = NULL,
         sms_opt_in                = false,
         behavioral_tracking_opt_out = true,
         email_suppressed          = true,
         email_suppressed_at       = COALESCE(email_suppressed_at, now())
   WHERE id = p_user_id;

  -- ── 2. the threads the client started ──
  -- Ruling 2 puts these on the client-owned side. Participants and messages
  -- cascade from comms_threads. Threads the DESIGNER started are untouched;
  -- the client's participant row on those now names the tombstone.
  WITH gone AS (
    DELETE FROM public.comms_threads WHERE created_by = p_user_id RETURNING id)
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
  SELECT id INTO v_purge
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
    UPDATE public.client_account_purges
       SET detached = jsonb_build_object(
             'tombstoned_profile', to_jsonb(p_user_id),
             'deleted',            v_deleted,
             'threads_deleted',    to_jsonb(v_threads)),
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

COMMENT ON FUNCTION public.purge_client_account(uuid) IS
  'SP-20 / App Store 5.1.1(v) / W1b ruling 2: closes a CLIENT account by anonymizing rather than cascading. Replaces the PII on the client''s profiles row with a tombstone, deletes what the person owned (rooms, scans, saved items, the threads they started, and the rest of the former profiles-cascade set), and journals it into client_account_purges — reusing an open row so a retry does not read as a second interrupted closure. Writes NOTHING to proposals, projects, invoices, client_decisions or designer_clients: with the profile surviving, every designer-owned leg still names the tombstone, so the designer''s record — the decision included — stays whole. No trigger is disabled and no ACCESS EXCLUSIVE is taken (00536 needed both; see the 00538 banner). Refuses a designer id outright. The auth user is detached by the delete-account edge function through GoTrue''s SOFT admin delete, which obfuscates the login and leaves profiles standing. service_role only.';
