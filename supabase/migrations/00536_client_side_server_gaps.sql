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
--      production. One SELECT leg, keyed on the column the roster keys the
--      client by (`client_id`, 00014:74).
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
--      So the purge disables USER triggers on exactly those five tables for the
--      length of one transaction, detaches the person from the designer's
--      documents, and re-enables. DISABLE TRIGGER USER leaves RI/system
--      triggers enabled — every cascade still fires — and takes ACCESS
--      EXCLUSIVE, so no concurrent writer can slip past a disabled guard; it
--      blocks instead. An erasure request outranks edition immutability: the
--      designer's document survives, with the person detached from it.
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
-- No table shape changes → no generated-types drift expected.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. the client's own roster row ─────────────────────────────────────────

DROP POLICY IF EXISTS designer_clients_client_read ON public.designer_clients;
CREATE POLICY designer_clients_client_read ON public.designer_clients
  FOR SELECT TO authenticated
  USING (client_id = auth.uid() AND status = 'active');

COMMENT ON POLICY designer_clients_client_read ON public.designer_clients IS
  'W1a M7: the client''s own leg. SELECT only, scoped to the live relationship (status vocabulary is lead|proposal|active|completed|nurture) — the same filter RosterAPIClient sends. Without it DesignerRelationship.roster is unreachable and no direct order can credit the designer who brought the client in.';

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

CREATE OR REPLACE FUNCTION public.purge_client_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'purge_client_account requires a user id'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ACCESS EXCLUSIVE on all five for the rest of this transaction: concurrent
  -- writers block, they do not slip past a disabled guard. RI triggers stay
  -- enabled, so every ON DELETE CASCADE still fires when the auth user goes.
  ALTER TABLE public.proposals               DISABLE TRIGGER USER;
  ALTER TABLE public.projects                DISABLE TRIGGER USER;
  ALTER TABLE public.invoices                DISABLE TRIGGER USER;
  ALTER TABLE public.client_decisions        DISABLE TRIGGER USER;
  ALTER TABLE public.client_decision_options DISABLE TRIGGER USER;

  BEGIN
    -- Detach the person from the designer's documents. The documents stay;
    -- the client identity on them does not.
    UPDATE public.client_decisions SET selected_by = NULL
     WHERE selected_by = p_user_id;

    UPDATE public.proposals SET client_id = NULL
     WHERE client_id = p_user_id;
    UPDATE public.proposals SET designer_client_id = NULL
     WHERE designer_client_id IN (
       SELECT dc.id FROM public.designer_clients dc WHERE dc.client_id = p_user_id
     );

    UPDATE public.projects SET client_id = NULL WHERE client_id = p_user_id;
    UPDATE public.invoices SET client_id = NULL WHERE client_id = p_user_id;

    -- comms_threads.created_by is NOT NULL under an ON DELETE SET NULL FK, so
    -- the cascade cannot resolve it. Hand the thread to another live
    -- participant where there is one — a project conversation belongs to both
    -- parties — and delete it outright where the leaver was the only one left.
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
                AND p.left_at IS NULL);

    DELETE FROM public.comms_threads WHERE created_by = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.proposals               ENABLE TRIGGER USER;
    ALTER TABLE public.projects                ENABLE TRIGGER USER;
    ALTER TABLE public.invoices                ENABLE TRIGGER USER;
    ALTER TABLE public.client_decisions        ENABLE TRIGGER USER;
    ALTER TABLE public.client_decision_options ENABLE TRIGGER USER;
    RAISE;
  END;

  ALTER TABLE public.proposals               ENABLE TRIGGER USER;
  ALTER TABLE public.projects                ENABLE TRIGGER USER;
  ALTER TABLE public.invoices                ENABLE TRIGGER USER;
  ALTER TABLE public.client_decisions        ENABLE TRIGGER USER;
  ALTER TABLE public.client_decision_options ENABLE TRIGGER USER;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_client_account(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_client_account(uuid) TO service_role;

COMMENT ON FUNCTION public.purge_client_account(uuid) IS
  'SP-20 / App Store 5.1.1(v): clears the road so DELETE FROM auth.users can run for a client. Detaches the person from proposals, projects, invoices and decisions — the designer''s records survive without them — and resolves comms_threads.created_by, which is NOT NULL under an ON DELETE SET NULL FK. Everything the client actually owns already cascades from profiles.id. service_role only; called by the delete-account edge function immediately before the auth admin delete.';
