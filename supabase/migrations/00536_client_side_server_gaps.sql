-- ═══════════════════════════════════════════════════════════════════════════
-- 00536 — A client can see their designer, reach only their designer, and leave
--
-- Three server-side gaps, each of which leaves a CLIENT surface unreachable or
-- unsafe. Two are W1a escalations (waves/w1a/fix-log.md §M7, §m8, deliberately
-- not fixed in a lane whose gate ran no supabase db reset); the third is what
-- SP-20's Delete Account needs before its button can be anything but dead.
-- Grouping them under one number is a deliberate call — they are the same kind
-- of debt, and each is small — recorded here so it can be overruled.
--
--   1. designer_clients has ONLY designer-side policies: 00014:110
--      (FOR ALL USING auth.uid() = designer_id) and 00316:39's studio
--      co-member leg. RosterAPIClient.listRoster() therefore comes back EMPTY
--      rather than forbidden, and DesignerRelationship.roster — which W5's
--      attribution and R3's pre-emption both read — is unreachable in
--      production.
--
--      ⚠ NOT a base-table SELECT policy (review B-D2). The first cut here was
--      `CREATE POLICY … ON designer_clients FOR SELECT TO authenticated USING
--      (client_id = auth.uid())`, and RLS is ROW-level: that row also carries
--      notes, nickname, satisfaction_score, total_revenue, total_projects,
--      referral_source, tags, style_preferences, inspiration_quote and
--      last_contacted_at. Any homeowner could have issued
--      GET /rest/v1/designer_clients?select=*&client_id=eq.<self> and read the
--      designer's private CRM notes about them. Column GRANTs cannot help:
--      designer and client are both `authenticated`.
--
--      So the client's leg is a SECURITY DEFINER VIEW instead —
--      `client_designer_roster`, four columns wide, filtered on
--      auth.uid() inside the view. The base table keeps exactly the two
--      designer-side policies it had. The view is a COLUMN contract, which is
--      what this actually is; the policy would have been a row contract
--      pretending to be one.
--      Lane C's RosterAPIClient re-points at the view (d-notes §8): same
--      select list, same filters, same order — one identifier changes.
--
--   2. rpc_start_direct_thread(counterpart) (00103:51) checks only that the
--      caller is authenticated and is not the counterpart. Any signed-in user
--      can open a direct thread with any profile in the system. SP-13 shipped
--      the client half over this RPC in W1a, so the predicate is now load-
--      bearing. Redefined whole-body from 00103 — the SOLE definition, verified
--      via grep "CREATE OR REPLACE FUNCTION[^(]*rpc_start_direct_thread" — with
--      one guard grafted in. The parameter name STAYS `counterpart`: renaming
--      an input parameter fails with "cannot change name of input parameter"
--      and would break 00331's live call path.
--
--      The lead leg is `designer_id IS NOT NULL AND status NOT IN
--      ('declined','expired')`, not a status allow-list: leads.status carries no
--      CHECK, a claimed lead keeps status 'new'/'contacted'/'viewed' while
--      claim_design_request sets only designer_id (00289/00286), and
--      DesignRequestStage reads the same shape client-side. Symmetric in both
--      directions so the designer's own use of the RPC is unaffected.
--
--   3. purge_client_account(uuid) — the SQL half of the delete-account edge
--      function. Deleting a client's auth.users row cannot work from a
--      service-role client, because the FK actions the delete fires are
--      themselves blocked:
--
--        proposals.client_id / .designer_client_id  ON DELETE SET NULL
--          → guard_proposal_authority ("proposal client identity may only
--            change through set_document_client") and
--            guard_proposal_copy_immutability ("non-draft proposal authored
--            payload is immutable") — the latter has NO escape hatch at all.
--        projects.client_id  → guard_project_completion_authority
--        invoices.client_id  → set_invoice_studio_id ("studio_id_not_designer_studio")
--        client_decision_options (cascade) → guard_client_decision_option_authority
--        comms_threads.created_by is NOT NULL under an ON DELETE SET NULL FK.
--
--      So the purge disables the user triggers on exactly those five tables for
--      the length of one transaction, detaches the person from the designer's
--      documents, and re-enables. RI/system triggers stay enabled throughout —
--      every cascade still fires. An erasure request outranks edition
--      immutability: the designer's document survives, with the person
--      detached from it.
--
--      ⚠ THIS IS A MAINTENANCE-WINDOW-SHAPED OPERATION (review M-D5).
--      ALTER TABLE … DISABLE TRIGGER takes ACCESS EXCLUSIVE, which conflicts
--      with ACCESS SHARE: while it is held, every read and write of proposals,
--      projects, invoices, client_decisions and client_decision_options blocks
--      portal-wide, for every designer on Patina. That is a safety property —
--      no concurrent writer can slip past a disabled guard, it blocks instead —
--      and it is also a global stall. Two mitigations here, neither of which
--      makes it free:
--        · SET LOCAL lock_timeout — the purge gives up quickly rather than
--          queueing behind a long designer transaction and building a convoy
--          of ACCESS SHARE waiters behind its own lock request. A homeowner's
--          closure retries; a portal-wide stall does not get to happen.
--        · the triggers are disabled and restored ONE BY ONE, by name, with
--          each one's prior tgenabled remembered. Blanket `ENABLE TRIGGER USER`
--          resets an ENABLE ALWAYS / ENABLE REPLICA trigger to origin-only —
--          a silent downgrade the moment logical replication needs one.
--      Disabling the user triggers also silences updated_at and the audit
--      dispatchers for the purge's own UPDATEs, so the detachment would leave
--      no trail. It writes its own: client_account_purges, below.
--
--      Everything genuinely owned by the client (rooms, saved_items,
--      notification_log, device_push_tokens, client_style_profiles,
--      companion_*, interactions, user_settings, designer_clients, …) already
--      cascades from profiles.id, which is itself ON DELETE CASCADE from
--      auth.users (00013:12). This function adds nothing to that; it only
--      clears the road.
--
--      Recipe verified empirically against the local stack: rolled-back
--      DELETE FROM auth.users for client@patina.dev and all six seeded
--      homeowners, converging on exactly these five tables.
--
-- Generated types DO drift here (unlike 00534): `client_designer_roster` (a
-- view) and `client_account_purges` (a table) are both new.
-- database.types.ts is regenerated in the same wave.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. the client's own roster row ─────────────────────────────────────────

-- Never a base-table policy: see the banner. Stated as a DROP so a database
-- that already ran an earlier cut of this migration loses it.
DROP POLICY IF EXISTS designer_clients_client_read ON public.designer_clients;

DROP VIEW IF EXISTS public.client_designer_roster;
CREATE VIEW public.client_designer_roster
WITH (security_invoker = false) AS
  SELECT dc.designer_id,
         dc.client_id,
         dc.status,
         dc.created_at
    FROM public.designer_clients dc
   WHERE dc.client_id = auth.uid()
     AND dc.status = 'active';

-- security_invoker = false (the default, stated) means the view body runs as
-- its owner, so RLS on designer_clients does not apply INSIDE it — which is
-- the whole point: the filter is the view, and nothing else about the row
-- leaves the database. auth.uid() still resolves per request: it reads the
-- request.jwt.claims GUC PostgREST sets on the connection, not the role.
ALTER VIEW public.client_designer_roster OWNER TO postgres;
-- `authenticated` is named in the REVOKE deliberately, then given SELECT back:
-- seed/00-legacy-grants.sql re-grants ALL to anon+authenticated on every public
-- relation before replaying these statements, so a REVOKE that names only
-- PUBLIC and anon leaves the view WRITABLE by every signed-in user locally.
REVOKE ALL ON public.client_designer_roster FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.client_designer_roster TO authenticated;

COMMENT ON VIEW public.client_designer_roster IS
  'W1a M7 / review B-D2: the client''s own leg on designer_clients, as a column contract. Four columns — designer_id, client_id, status, created_at — for the ACTIVE relationship naming the caller, and nothing of the designer''s CRM row (notes, satisfaction_score, total_revenue, tags, …). SELECT to authenticated only. RosterAPIClient reads this, never the base table; the base table stays designer-side (00014:110, 00316:39).';

-- ─── 2. rpc_start_direct_thread — counterpart predicate (lineage 00103 → 00536)

CREATE OR REPLACE FUNCTION public.rpc_start_direct_thread(counterpart UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_thread   UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'rpc_start_direct_thread requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF counterpart IS NULL OR counterpart = v_caller THEN
    RAISE EXCEPTION 'counterpart must be a different profile than the caller'
      USING ERRCODE = 'check_violation';
  END IF;

  -- W1a m8: a thread is a relationship, not a directory lookup. Roster row,
  -- live lead, or shared project — symmetric, so the designer side is
  -- unaffected. Anything else is refused before a thread can exist.
  IF NOT (
       EXISTS (
         SELECT 1 FROM public.designer_clients dc
          WHERE dc.status = 'active'
            AND ((dc.designer_id = counterpart AND dc.client_id = v_caller)
              OR (dc.designer_id = v_caller    AND dc.client_id = counterpart))
       )
    OR EXISTS (
         SELECT 1 FROM public.leads l
          WHERE l.designer_id IS NOT NULL
            AND l.status NOT IN ('declined', 'expired')
            AND ((l.designer_id = counterpart AND l.homeowner_id = v_caller)
              OR (l.designer_id = v_caller    AND l.homeowner_id = counterpart))
       )
    OR EXISTS (
         SELECT 1 FROM public.projects p
          WHERE ((p.designer_id = counterpart AND p.client_id = v_caller)
              OR (p.designer_id = v_caller    AND p.client_id = counterpart))
       )
  ) THEN
    RAISE EXCEPTION 'no relationship with that counterpart'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Find an existing direct thread between these two users.
  SELECT t.id INTO v_thread
    FROM public.comms_threads t
   WHERE t.kind = 'direct'
     AND EXISTS (
       SELECT 1 FROM public.comms_thread_participants p
        WHERE p.thread_id = t.id AND p.profile_id = v_caller AND p.left_at IS NULL
     )
     AND EXISTS (
       SELECT 1 FROM public.comms_thread_participants p
        WHERE p.thread_id = t.id AND p.profile_id = counterpart AND p.left_at IS NULL
     )
   ORDER BY t.created_at ASC
   LIMIT 1;

  IF v_thread IS NOT NULL THEN
    RETURN v_thread;
  END IF;

  -- Create the thread + both participants in one tx; cardinality trigger
  -- defers to commit so the half-built state is allowed mid-tx.
  INSERT INTO public.comms_threads (kind, created_by)
    VALUES ('direct', v_caller)
    RETURNING id INTO v_thread;

  INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
    VALUES
      (v_thread, v_caller,    public.comms_resolve_role(v_caller)),
      (v_thread, counterpart, public.comms_resolve_role(counterpart));

  RETURN v_thread;
END;
$$;

-- Re-applied verbatim from 00103:105. CREATE OR REPLACE preserves the ACL, but
-- the generated legacy-grants seed reads these lines, so they stay stated.
GRANT EXECUTE ON FUNCTION public.rpc_start_direct_thread(UUID) TO authenticated;

COMMENT ON FUNCTION public.rpc_start_direct_thread(uuid) IS
  'Resolve-or-create the direct thread between the caller and a counterpart they actually have a relationship with — an active roster row, a live lead, or a shared project (00536; body otherwise verbatim from 00103). Idempotent. The parameter is named `counterpart` and must stay so: renaming an input parameter is rejected by Postgres and 00331 calls this live.';

-- ─── 3. purge_client_account ────────────────────────────────────────────────

-- The compensation record (review M-D4). purge_client_account and the auth
-- admin delete are two round trips from the edge function, and cannot be one
-- transaction: if the second fails, the account is still live over rows whose
-- client_id is already NULL, and the ids were the ONLY record of the link.
-- This table is that record. It is written inside the purge's own transaction,
-- so it is exactly as durable as the detachment it describes, and the edge
-- function stamps auth_deleted_at only once the auth user is really gone. A
-- row with auth_deleted_at NULL is an interrupted closure: everything needed
-- to re-attach the person is in `detached`.
--
-- It also carries the audit trail the purge would otherwise destroy — the
-- updated_at and dispatch triggers on those five tables are disabled for the
-- length of the detach.
CREATE TABLE IF NOT EXISTS public.client_account_purges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- deliberately NO foreign key: the user this names is about to stop existing.
  user_id         uuid NOT NULL,
  email           text,
  detached        jsonb NOT NULL DEFAULT '{}'::jsonb,
  purged_at       timestamptz NOT NULL DEFAULT now(),
  auth_deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS client_account_purges_incomplete_idx
  ON public.client_account_purges (purged_at DESC)
  WHERE auth_deleted_at IS NULL;

ALTER TABLE public.client_account_purges ENABLE ROW LEVEL SECURITY;
-- No policies at all. service_role bypasses RLS; every other role reads zero
-- rows, which is what a ledger of other people's erasures should give them.
REVOKE ALL ON TABLE public.client_account_purges FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.client_account_purges IS
  'SP-20 / review M-D4: one row per client account closure, written in the same transaction as the detachment. `detached` names every row the purge unlinked, by table and id, so an interrupted closure (auth_deleted_at NULL — the auth admin delete failed after the purge committed) can be reconciled. Unreadable to anon and authenticated; service_role only.';

-- The return type changes from void to uuid, so a plain CREATE OR REPLACE is
-- not enough on a database that ran an earlier cut of this migration.
DROP FUNCTION IF EXISTS public.purge_client_account(uuid);

CREATE FUNCTION public.purge_client_account(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tg       record;
  v_saved    jsonb := '[]'::jsonb;
  v_entry    jsonb;
  v_tables   text[] := ARRAY['public.proposals', 'public.projects', 'public.invoices',
                             'public.client_decisions', 'public.client_decision_options'];
  v_email    text;
  v_purge    uuid;
  v_prop_c   uuid[];
  v_prop_dc  uuid[];
  v_proj     uuid[];
  v_inv      uuid[];
  v_dec      uuid[];
  v_thr_move uuid[];
  v_thr_del  uuid[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'purge_client_account requires a user id'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── the designer refusal (review B-D3) ──
  -- This function disables the authority guards on the five busiest tables and
  -- then NULLs client identity. Called with a DESIGNER's id it would do nothing
  -- of the sort — designer_id is `REFERENCES profiles(id) ON DELETE CASCADE`
  -- everywhere (00014:74,124,301,349; 00020:18), so the auth delete that
  -- follows would take her projects, proposals, invoices and roster with it.
  -- The edge function refuses a designer caller too; this is the half that
  -- cannot be bypassed by calling the RPC directly with a service key.
  IF EXISTS (SELECT 1 FROM public.profiles pr
              WHERE pr.id = p_user_id AND pr.is_designer)
     OR EXISTS (SELECT 1 FROM public.projects        WHERE designer_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.proposals       WHERE designer_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.designer_clients WHERE designer_id = p_user_id)
  THEN
    RAISE EXCEPTION 'purge_client_account refuses a designer account: % owns designer-side rows that would cascade, not detach', p_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;

  -- Fail fast rather than queue: see the banner. A closure that cannot get the
  -- lock promptly is retried; a portal-wide convoy behind it is not undoable.
  SET LOCAL lock_timeout = '5s';

  -- Disable the user triggers one at a time, remembering each one's prior
  -- state, so ENABLE ALWAYS / ENABLE REPLICA survive the round trip.
  FOR v_tg IN
    SELECT c.oid::regclass::text AS tbl, t.tgname AS tgname, t.tgenabled AS tgenabled
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal
       AND c.oid = ANY (SELECT unnest(v_tables)::regclass)
     ORDER BY 1, 2
  LOOP
    v_saved := v_saved || jsonb_build_object(
      'tbl', v_tg.tbl, 'tg', v_tg.tgname, 'en', v_tg.tgenabled);
    IF v_tg.tgenabled <> 'D' THEN
      EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', v_tg.tbl, v_tg.tgname);
    END IF;
  END LOOP;

  BEGIN
    -- Detach the person from the designer's documents. The documents stay;
    -- the client identity on them does not. Every id is journalled.
    WITH u AS (
      UPDATE public.client_decisions SET selected_by = NULL
       WHERE selected_by = p_user_id RETURNING id)
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_dec FROM u;

    WITH u AS (
      UPDATE public.proposals SET client_id = NULL
       WHERE client_id = p_user_id RETURNING id)
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_prop_c FROM u;

    WITH u AS (
      UPDATE public.proposals SET designer_client_id = NULL
       WHERE designer_client_id IN (
         SELECT dc.id FROM public.designer_clients dc WHERE dc.client_id = p_user_id)
       RETURNING id)
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_prop_dc FROM u;

    WITH u AS (
      UPDATE public.projects SET client_id = NULL
       WHERE client_id = p_user_id RETURNING id)
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_proj FROM u;

    WITH u AS (
      UPDATE public.invoices SET client_id = NULL
       WHERE client_id = p_user_id RETURNING id)
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_inv FROM u;

    -- comms_threads.created_by is NOT NULL under an ON DELETE SET NULL FK, so
    -- the cascade cannot resolve it. Hand the thread to another live
    -- participant where there is one — a project conversation belongs to both
    -- parties — and delete it outright where the leaver was the only one left.
    WITH u AS (
      UPDATE public.comms_threads t
         SET created_by = (
               SELECT p.profile_id FROM public.comms_thread_participants p
                WHERE p.thread_id = t.id
                  AND p.profile_id <> p_user_id
                  AND p.left_at IS NULL
                ORDER BY p.joined_at
                LIMIT 1)
       WHERE t.created_by = p_user_id
         AND EXISTS (
               SELECT 1 FROM public.comms_thread_participants p
                WHERE p.thread_id = t.id
                  AND p.profile_id <> p_user_id
                  AND p.left_at IS NULL)
       RETURNING t.id)
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_thr_move FROM u;

    WITH d AS (
      DELETE FROM public.comms_threads WHERE created_by = p_user_id RETURNING id)
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_thr_del FROM d;

    INSERT INTO public.client_account_purges (user_id, email, detached)
    VALUES (p_user_id, v_email, jsonb_build_object(
      'proposals_client_id',          to_jsonb(v_prop_c),
      'proposals_designer_client_id', to_jsonb(v_prop_dc),
      'projects_client_id',           to_jsonb(v_proj),
      'invoices_client_id',           to_jsonb(v_inv),
      'client_decisions_selected_by', to_jsonb(v_dec),
      'comms_threads_reassigned',     to_jsonb(v_thr_move),
      'comms_threads_deleted',        to_jsonb(v_thr_del)))
    RETURNING id INTO v_purge;
  EXCEPTION WHEN OTHERS THEN
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_saved) LOOP
      IF v_entry->>'en' <> 'D' THEN
        EXECUTE format('ALTER TABLE %s ENABLE %s TRIGGER %I',
          v_entry->>'tbl',
          CASE v_entry->>'en' WHEN 'A' THEN 'ALWAYS' WHEN 'R' THEN 'REPLICA' ELSE '' END,
          v_entry->>'tg');
      END IF;
    END LOOP;
    RAISE;
  END;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_saved) LOOP
    IF v_entry->>'en' <> 'D' THEN
      EXECUTE format('ALTER TABLE %s ENABLE %s TRIGGER %I',
        v_entry->>'tbl',
        CASE v_entry->>'en' WHEN 'A' THEN 'ALWAYS' WHEN 'R' THEN 'REPLICA' ELSE '' END,
        v_entry->>'tg');
    END IF;
  END LOOP;

  RETURN v_purge;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_client_account(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_client_account(uuid) TO service_role;

COMMENT ON FUNCTION public.purge_client_account(uuid) IS
  'SP-20 / App Store 5.1.1(v): clears the road so DELETE FROM auth.users can run for a CLIENT, and refuses outright for a designer (review B-D3). Detaches the person from proposals, projects, invoices and decisions — the designer''s records survive without them — resolves comms_threads.created_by (NOT NULL under an ON DELETE SET NULL FK), and journals every id it unlinked into client_account_purges, returning that row''s id. Takes ACCESS EXCLUSIVE on five tables under a 5s lock_timeout: maintenance-window-shaped, retry on failure. service_role only.';

-- ─── 3b. the other half of the compensation record ──────────────────────────

CREATE OR REPLACE FUNCTION public.mark_client_account_purge_complete(p_purge_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.client_account_purges
     SET auth_deleted_at = now()
   WHERE id = p_purge_id AND auth_deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_client_account_purge_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_client_account_purge_complete(uuid) TO service_role;

COMMENT ON FUNCTION public.mark_client_account_purge_complete(uuid) IS
  'SP-20 / review M-D4: closes the client_account_purges row once the auth user is actually gone. A row left with auth_deleted_at NULL is an interrupted closure — the detachment committed, the auth delete did not — and `detached` carries everything needed to reconcile it. service_role only.';
