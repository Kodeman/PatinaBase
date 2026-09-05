-- ═══════════════════════════════════════════════════════════════════════════
-- 00571 — Studio invoices: an invoice with no house
--
-- Rulings implemented (plan "Studio invoices — invoices with no house",
-- 2026-09-05; Kody ruled "go with your recommendations"):
--   S1  first-class project-less invoice (nullable project_id, not a shell
--       project) .......................... PART 1, PART 2
--   S2  the name is "studio invoice"; "ad-hoc" stays the line kind . PART 3
--   S3  drawn from the same composer, one create RPC ............... PART 3
--   S4  addressed to a household on a studio member's designer_clients
--       roster (R73 invite-on-send), never an email-only recipient
--       ................................................. PART 2, PART 3
--   S5  the client pays in the letterbox, so the household needs a read
--       path that does not run through projects (and an index behind
--       it) ...................................................... PART 5
--   S6  ad-hoc lines only; milestone/time/ffe are project-bound .... PART 3
--   S7  studio invoices earn design_fee earnings .................. PART 4
--   S8  a two-studio designer draws off the chosen studio, never the
--       primary-studio fallback ................... PART 3, PART 6
--   S9  Desk visibility stays a Receivables-page concern (no DB work)
--   S10 no flag at the DB layer (inert until rows exist)
--   S11 iOS null-safety only (no DB work)
--   S12 the title is required ............................. PART 1, PART 3
--
-- The real gate is public.set_invoice_studio_id() (head 00511:2616-3057),
-- which RAISEs on every NULL-project row on both the INSERT and the UPDATE
-- arm, before its service_role early return. PART 2 adds a studio branch to
-- both arms; every project-path line is byte-identical to 00511's body (the
-- branch is 187 inserted lines across the two arms, zero removed). Its body
-- SHA-256 is re-pinned in
-- supabase/tests/edge_api/public_sd_hardening_contract_test.sql.
--
-- Adds GRANT/REVOKE (function) -> regenerate seed/00-legacy-grants.sql after
-- this file.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── PART 1: the invoice may stand on a household instead of a house ────────
--
-- The FK and its cascade stay: a project-bound invoice still dies with its
-- project. The anchor CHECK requires the studio on a project-less row so
-- numbering always comes off studio_invoice_counters (00318) and never the
-- designer-keyed studio-less fallback that uniq_invoices_designer_number_
-- studioless (00513) covers.

ALTER TABLE public.invoices
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE public.invoices
  ADD CONSTRAINT chk_invoices_anchor
  CHECK (
    project_id IS NOT NULL
    OR (client_id IS NOT NULL AND studio_id IS NOT NULL)
  );

COMMENT ON COLUMN public.invoices.title IS
  'The regarding line of a studio invoice (S12, required there): what the studio is billing for when no project names it. NULL on a project-bound invoice, which keeps reading the project name. Read by the ledger, the folio head, the invoice emails, and the Stripe product name.';

-- ─── PART 2: set_invoice_studio_id() — the real gate ────────────────────────
--
-- Body copied from its true head (00511_public_sd_hardening.sql:2616-3057)
-- with one addition: an `IF NEW.project_id IS NULL THEN ... END IF` studio
-- branch placed before the project lookups in BOTH arms. On UPDATE the branch
-- sits after 00511's identity-immutability check, so project_id, designer_id,
-- client_id and studio_id are as immutable on a studio invoice as they are on
-- a project one. Direct PostgREST DML (current_user = 'authenticated') is
-- held to the same clean-draft predicate the project path applies below, so
-- status, invoice_number and amount_paid_cents stay the billing RPCs' to
-- write. The branch reads no project and takes no lock, so the canonical
-- root -> user_roles -> memberships -> organization lock order the contract
-- test pins is untouched.

CREATE OR REPLACE FUNCTION public.set_invoice_studio_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_commercial_document_id text :=
    current_setting('app.commercial_document_id', true);
  v_capability_row_id uuid;
  v_capability_count integer;
  v_actor_is_member boolean := false;
  v_immutable_update boolean := false;
  v_postgres_migration boolean :=
    session_user = 'postgres' AND v_active_role IN ('none', 'postgres');
BEGIN
  -- Financial machine transitions remain replayable after later authority
  -- revocation. UPDATE never reparents an invoice, and its historical parent
  -- checks stay non-locking to preserve project -> invoice lock order.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.designer_id IS DISTINCT FROM OLD.designer_id
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.studio_id IS DISTINCT FROM OLD.studio_id
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    v_immutable_update := true;

    -- 00571 studio invoices (S1): a row with no project is anchored by its
    -- studio. Authority is the studio itself: an active design studio, an
    -- active non-guest member stamped as designer, a named household, and an
    -- actor that is either an active non-guest member or a machine role. The
    -- branch reads no project and takes no lock, so the canonical
    -- root/authority lock order below is untouched.
    IF NEW.project_id IS NULL THEN
      IF NEW.studio_id IS NULL
         OR NEW.designer_id IS NULL
         OR NEW.client_id IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM public.organization_members AS studio_lead
           JOIN public.organizations AS anchor_studio
             ON anchor_studio.id = studio_lead.organization_id
           WHERE studio_lead.organization_id = NEW.studio_id
             AND studio_lead.user_id = NEW.designer_id
             AND studio_lead.status = 'active'
             AND studio_lead.role <> 'guest'
             AND anchor_studio.type = 'design_studio'
             AND anchor_studio.status = 'active'
         )
      THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;

      IF v_active_role = 'service_role' OR v_postgres_migration THEN
        RETURN NEW;
      END IF;

      IF v_active_role <> 'authenticated'
         OR v_actor IS NULL
         OR current_user NOT IN ('authenticated', 'postgres')
         OR NOT EXISTS (
           SELECT 1
           FROM public.organization_members AS studio_actor
           WHERE studio_actor.organization_id = NEW.studio_id
             AND studio_actor.user_id = v_actor
             AND studio_actor.status = 'active'
             AND studio_actor.role <> 'guest'
         )
         -- S4 is the row's law on both arms: the household must sit on the
         -- designer_clients roster of an active non-guest member of this
         -- studio, the same rule create_draft_studio_invoice resolves the
         -- household through. The read is RLS-safe for every actor this
         -- branch admits (designer_clients_studio_rw, 00316:39, is
         -- studio-wide) and takes no lock. The designer-domain law S7 asks
         -- for stays the INSERT arm's, exactly as the project path judges its
         -- lead there and not here: designer_id is immutable above.
         OR NOT EXISTS (
           SELECT 1
           FROM public.designer_clients AS studio_roster
           JOIN public.organization_members AS roster_membership
             ON roster_membership.organization_id = NEW.studio_id
            AND roster_membership.user_id = studio_roster.designer_id
           WHERE studio_roster.client_id = NEW.client_id
             AND roster_membership.status = 'active'
             AND roster_membership.role <> 'guest'
         )
      THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;

      -- Direct PostgREST DML (current_user = 'authenticated') may write only a
      -- clean draft, exactly as the project path below allows: every state,
      -- number and money field on an issued invoice belongs to the SECURITY
      -- DEFINER billing RPCs, which reach here as current_user = 'postgres'.
      IF current_user = 'authenticated'
         AND NOT (
           NEW.status = 'draft'
           AND NEW.invoice_number IS NULL
           AND NEW.issue_date IS NULL
           AND NEW.sent_at IS NULL
           AND NEW.paid_at IS NULL
           AND NEW.voided_at IS NULL
           AND NEW.void_reason IS NULL
           AND NEW.stripe_checkout_session_id IS NULL
           AND NEW.amount_paid_cents = 0
           AND NEW.reminder_count = 0
           AND NEW.last_reminder_at IS NULL
           AND NEW.ar_flagged_at IS NULL
           AND NEW.ar_last_chased_at IS NULL
           AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
         )
      THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;

      RETURN NEW;
    END IF;

    SELECT project.* INTO v_project
    FROM public.projects AS project
    WHERE project.id = NEW.project_id
      AND project.client_id IS NOT DISTINCT FROM NEW.client_id
      AND project.studio_id = NEW.studio_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF v_project.designer_id IS DISTINCT FROM NEW.designer_id THEN
      PERFORM historical_lead.id
      FROM public.project_team_members AS historical_lead
      WHERE historical_lead.project_id = NEW.project_id
        AND historical_lead.user_id = NEW.designer_id
        AND historical_lead.role = 'previous_lead'
      ORDER BY historical_lead.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;
    END IF;

    IF v_active_role = 'service_role' OR v_postgres_migration THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT v_immutable_update THEN
    -- 00571 studio invoices (S1): a row with no project is anchored by its
    -- studio. Authority is the studio itself: an active design studio, an
    -- active non-guest member stamped as designer, a named household, and an
    -- actor that is either an active non-guest member or a machine role. The
    -- branch reads no project and takes no lock, so the canonical
    -- root/authority lock order below is untouched.
    IF NEW.project_id IS NULL THEN
      IF NEW.studio_id IS NULL
         OR NEW.designer_id IS NULL
         OR NEW.client_id IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM public.organization_members AS studio_lead
           JOIN public.organizations AS anchor_studio
             ON anchor_studio.id = studio_lead.organization_id
           WHERE studio_lead.organization_id = NEW.studio_id
             AND studio_lead.user_id = NEW.designer_id
             AND studio_lead.status = 'active'
             AND studio_lead.role <> 'guest'
             AND anchor_studio.type = 'design_studio'
             AND anchor_studio.status = 'active'
         )
      THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;

      IF v_active_role = 'service_role' OR v_postgres_migration THEN
        RETURN NEW;
      END IF;

      IF v_active_role <> 'authenticated'
         OR v_actor IS NULL
         OR current_user NOT IN ('authenticated', 'postgres')
         OR NOT EXISTS (
           SELECT 1
           FROM public.organization_members AS studio_actor
           WHERE studio_actor.organization_id = NEW.studio_id
             AND studio_actor.user_id = v_actor
             AND studio_actor.status = 'active'
             AND studio_actor.role <> 'guest'
         )
         -- S4 is the row's law, not only the composer's: the household must
         -- sit on the designer_clients roster of an active non-guest member
         -- of this studio - the rule create_draft_studio_invoice resolves the
         -- household through - and the stamped member must hold a
         -- designer-domain role. Without both, a member could address a
         -- studio invoice to any profile in the database, or route its
         -- design_fee earning to a co-member who designs nothing. The roster
         -- read is RLS-safe for every actor this branch admits:
         -- designer_clients_studio_rw (00316:39) shows a co-member the whole
         -- studio's roster, and the SECURITY DEFINER billing RPCs arrive as
         -- the table owner. Neither read takes a lock, so the canonical
         -- root -> user_roles -> memberships -> organization order below is
         -- untouched.
         OR NOT EXISTS (
           SELECT 1
           FROM public.designer_clients AS studio_roster
           JOIN public.organization_members AS roster_membership
             ON roster_membership.organization_id = NEW.studio_id
            AND roster_membership.user_id = studio_roster.designer_id
           WHERE studio_roster.client_id = NEW.client_id
             AND roster_membership.status = 'active'
             AND roster_membership.role <> 'guest'
         )
         OR NOT public.has_designer_domain_role(NEW.designer_id)
      THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;

      -- Direct PostgREST DML (current_user = 'authenticated') may write only a
      -- clean draft, exactly as the project path below allows: every state,
      -- number and money field on an issued invoice belongs to the SECURITY
      -- DEFINER billing RPCs, which reach here as current_user = 'postgres'.
      IF current_user = 'authenticated'
         AND NOT (
           NEW.status = 'draft'
           AND NEW.invoice_number IS NULL
           AND NEW.issue_date IS NULL
           AND NEW.sent_at IS NULL
           AND NEW.paid_at IS NULL
           AND NEW.voided_at IS NULL
           AND NEW.void_reason IS NULL
           AND NEW.stripe_checkout_session_id IS NULL
           AND NEW.amount_paid_cents = 0
           AND NEW.reminder_count = 0
           AND NEW.last_reminder_at IS NULL
           AND NEW.ar_flagged_at IS NULL
           AND NEW.ar_last_chased_at IS NULL
         )
      THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;

      RETURN NEW;
    END IF;

    -- Authorization-qualified discovery precedes the canonical root lock.
    -- A direct actor must already belong to the exact active project studio;
    -- an owner-executed client path must present its exact transaction-bound
    -- commercial, activation, or decision capability. Neither path first
    -- reads or contends on a foreign project selected only by caller input.
    IF v_postgres_migration OR v_active_role = 'service_role' THEN
      SELECT project.* INTO v_project
      FROM public.projects AS project
      WHERE project.id = NEW.project_id;
    ELSIF v_active_role = 'authenticated' THEN
      IF v_actor IS NULL THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      ELSIF current_user = 'authenticated' THEN
        SELECT project.* INTO v_project
        FROM public.projects AS project
        JOIN public.organization_members AS actor_membership
          ON actor_membership.organization_id = project.studio_id
         AND actor_membership.user_id = v_actor
        JOIN public.organizations AS studio
          ON studio.id = actor_membership.organization_id
        WHERE project.id = NEW.project_id
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
          AND studio.type = 'design_studio'
          AND studio.status = 'active';
      ELSIF current_user = 'postgres' THEN
        SELECT project.* INTO v_project
        FROM public.projects AS project
        WHERE project.id = NEW.project_id
          AND (
            EXISTS (
              SELECT 1
              FROM public.organization_members AS actor_membership
              JOIN public.organizations AS studio
                ON studio.id = actor_membership.organization_id
              WHERE actor_membership.organization_id = project.studio_id
                AND actor_membership.user_id = v_actor
                AND actor_membership.status = 'active'
                AND actor_membership.role <> 'guest'
                AND studio.type = 'design_studio'
                AND studio.status = 'active'
            )
            OR (
              project.client_id = v_actor
              AND (
                EXISTS (
                  SELECT 1
                  FROM public.project_commercial_documents AS document
                  JOIN public.proposals AS proposal
                    ON proposal.id = document.proposal_id
                  JOIN public.designer_clients AS relationship
                    ON relationship.id = proposal.designer_client_id
                  WHERE document.project_id = project.id
                    AND document.proposal_id::text =
                          v_commercial_document_id
                    AND document.document_kind IN (
                      'design_services', 'service_addendum',
                      'furnishings_authorization', 'trade_scope'
                    )
                    AND proposal.document_kind = document.document_kind
                    AND (
                      proposal.project_id IS NULL
                      OR proposal.project_id = project.id
                    )
                    AND proposal.client_id = project.client_id
                    AND relationship.designer_id = proposal.designer_id
                    AND relationship.client_id = proposal.client_id
                    AND proposal.commercial_state = 'executed'
                )
                OR EXISTS (
                  SELECT 1
                  FROM public.proposals AS proposal
                  JOIN public.designer_clients AS relationship
                    ON relationship.id = proposal.designer_client_id
                  WHERE proposal.id = project.proposal_id
                    AND proposal.id::text = current_setting(
                      'app.proposal_activation_id', true
                    )
                    AND proposal.client_id = project.client_id
                    AND proposal.designer_id = project.designer_id
                    AND proposal.status = 'accepted'
                    AND (
                      proposal.project_id IS NULL
                      OR proposal.project_id = project.id
                    )
                    AND relationship.designer_id = proposal.designer_id
                    AND relationship.client_id = proposal.client_id
                )
                OR EXISTS (
                  SELECT 1
                  FROM public.client_decisions AS decision
                  JOIN public.designer_clients AS relationship
                    ON relationship.id = decision.designer_client_id
                  WHERE decision.id::text = current_setting(
                    'app.client_decision_write_id', true
                  )
                    AND decision.project_id = project.id
                    AND decision.designer_id = project.designer_id
                    AND decision.decision_kind = 'approval'
                    AND decision.coordination_kind = 'selection'
                    AND decision.court = 'client'
                    AND decision.status = 'responded'
                    AND relationship.designer_id = project.designer_id
                    AND relationship.client_id = project.client_id
                )
              )
            )
          );
      ELSE
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;
    ELSE
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    NEW.studio_id := COALESCE(NEW.studio_id, v_project.studio_id);
    NEW.designer_id := COALESCE(NEW.designer_id, v_project.designer_id);
    NEW.client_id := COALESCE(NEW.client_id, v_project.client_id);

    -- Legacy fixtures and owner maintenance may omit live authority rows, but
    -- only a true postgres/no-SET-ROLE session receives this bounded bypass.
    IF v_postgres_migration THEN
      RETURN NEW;
    END IF;

    SELECT project.* INTO v_project
    FROM public.projects AS project
    WHERE project.id = NEW.project_id
      AND project.designer_id = NEW.designer_id
      AND project.client_id IS NOT DISTINCT FROM NEW.client_id
      AND project.studio_id = NEW.studio_id
      AND project.status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    PERFORM user_role.id
    FROM public.user_roles AS user_role
    JOIN public.roles AS role ON role.id = user_role.role_id
    WHERE user_role.user_id = NEW.designer_id
      AND role.domain = 'designer'
    ORDER BY user_role.role_id, user_role.id
    FOR SHARE OF user_role;
    -- Lock above, authority from the DEFINER helper: FOUND would be false for
    -- any co-member, whose RLS hides the lead's user_roles row.
    IF NOT public.has_designer_domain_role(NEW.designer_id) THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    PERFORM membership.id
    FROM public.organization_members AS membership
    WHERE membership.organization_id = NEW.studio_id
      AND membership.user_id = ANY(ARRAY[NEW.designer_id, v_actor]::uuid[])
    ORDER BY membership.user_id, membership.id
    FOR SHARE;

    PERFORM studio.id
    FROM public.organizations AS studio
    WHERE studio.id = NEW.studio_id
    ORDER BY studio.id
    FOR SHARE;

    SELECT project.* INTO v_project
    FROM public.projects AS project
    JOIN public.organizations AS studio ON studio.id = project.studio_id
    JOIN public.organization_members AS lead_membership
      ON lead_membership.organization_id = project.studio_id
     AND lead_membership.user_id = project.designer_id
    WHERE project.id = NEW.project_id
      AND project.designer_id = NEW.designer_id
      AND project.client_id IS NOT DISTINCT FROM NEW.client_id
      AND project.studio_id = NEW.studio_id
      AND project.status = 'active'
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
      AND lead_membership.status = 'active'
      AND lead_membership.role <> 'guest';

    IF NEW.project_id IS NULL
       OR NEW.designer_id IS NULL
       OR NEW.studio_id IS NULL
       OR NOT FOUND
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

  END IF;

  IF v_active_role = 'authenticated' THEN
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.organizations AS actor_studio
      WHERE actor_studio.id = NEW.studio_id
        AND actor_studio.type = 'design_studio'
        AND actor_studio.status = 'active'
    ) THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    v_actor_is_member := EXISTS (
      SELECT 1
    FROM public.organization_members AS actor_membership
    JOIN public.organizations AS actor_studio
      ON actor_studio.id = actor_membership.organization_id
    WHERE actor_membership.organization_id = NEW.studio_id
      AND actor_membership.user_id = v_actor
      AND actor_membership.status = 'active'
      AND actor_membership.role <> 'guest'
      AND actor_studio.type = 'design_studio'
      AND actor_studio.status = 'active'
    );

    IF current_user = 'authenticated' THEN
      IF v_actor_is_member
         AND v_project.designer_id IS NOT DISTINCT FROM NEW.designer_id
         AND EXISTS (
           SELECT 1
           FROM public.organization_members AS lead_membership
           WHERE lead_membership.organization_id = NEW.studio_id
             AND lead_membership.user_id = NEW.designer_id
             AND lead_membership.status = 'active'
             AND lead_membership.role <> 'guest'
         )
         AND public.has_designer_domain_role(NEW.designer_id)
         AND NEW.status = 'draft'
         AND NEW.invoice_number IS NULL
         AND NEW.issue_date IS NULL
         AND NEW.sent_at IS NULL
         AND NEW.paid_at IS NULL
         AND NEW.voided_at IS NULL
         AND NEW.void_reason IS NULL
         AND NEW.stripe_checkout_session_id IS NULL
         AND NEW.amount_paid_cents = 0
         AND NEW.reminder_count = 0
         AND NEW.last_reminder_at IS NULL
         AND NEW.ar_flagged_at IS NULL
         AND NEW.ar_last_chased_at IS NULL
         AND (
           TG_OP = 'INSERT'
           OR (
             NEW.project_id IS NOT DISTINCT FROM OLD.project_id
             AND NEW.designer_id IS NOT DISTINCT FROM OLD.designer_id
             AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
             AND NEW.studio_id IS NOT DISTINCT FROM OLD.studio_id
             AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
             AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
           )
         )
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    ELSIF current_user IS DISTINCT FROM 'postgres' THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF v_actor_is_member THEN
      RETURN NEW;
    END IF;

    IF v_actor IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    PERFORM 1
    FROM public.project_commercial_documents AS document
    JOIN public.proposals AS proposal
      ON proposal.id = document.proposal_id
    JOIN public.designer_clients AS author_relationship
      ON author_relationship.id = proposal.designer_client_id
    WHERE document.proposal_id::text = v_commercial_document_id
      AND document.project_id = NEW.project_id
      AND document.document_kind IN (
        'design_services', 'service_addendum',
        'furnishings_authorization', 'trade_scope'
      )
      AND proposal.document_kind = document.document_kind
      AND (
        proposal.project_id IS NULL
        OR proposal.project_id = NEW.project_id
      )
      AND proposal.client_id = NEW.client_id
      AND author_relationship.designer_id = proposal.designer_id
      AND author_relationship.client_id = proposal.client_id
      AND proposal.commercial_state = 'executed'
    FOR SHARE OF document, proposal, author_relationship;
    IF FOUND THEN
      RETURN NEW;
    END IF;

    SELECT locked.id, count(*) OVER ()
    INTO v_capability_row_id, v_capability_count
    FROM (
      SELECT milestone.id
      FROM public.project_payment_milestones AS milestone
      JOIN public.proposals AS proposal
        ON proposal.id = v_project.proposal_id
      JOIN public.designer_clients AS relationship
        ON relationship.id = proposal.designer_client_id
      WHERE proposal.id::text =
              current_setting('app.proposal_activation_id', true)
        AND proposal.client_id = v_actor
        AND proposal.designer_id = v_project.designer_id
        AND proposal.status = 'accepted'
        AND (
          proposal.project_id IS NULL
          OR proposal.project_id = v_project.id
        )
        AND relationship.designer_id = proposal.designer_id
        AND relationship.client_id = proposal.client_id
        AND milestone.project_id = v_project.id
        AND milestone.trigger_kind = 'on_signing'
        AND milestone.invoice_id IS NULL
        AND milestone.label || ' — payment milestone' = NEW.memo
        AND milestone.amount_cents = NEW.subtotal_cents
        AND NEW.tax_cents = 0
        AND milestone.amount_cents = NEW.total_cents
      FOR UPDATE OF milestone
      FOR SHARE OF proposal, relationship
    ) AS locked
    LIMIT 1;
    IF FOUND AND v_capability_count = 1 THEN
      RETURN NEW;
    END IF;

    SELECT locked.id, count(*) OVER ()
    INTO v_capability_row_id, v_capability_count
    FROM (
      SELECT milestone.id
      FROM public.client_decisions AS decision
      JOIN public.designer_clients AS relationship
        ON relationship.id = decision.designer_client_id
      JOIN public.client_decision_options AS option
        ON option.decision_id = decision.id
      JOIN public.project_payment_milestones AS milestone
        ON milestone.project_id = decision.project_id
       AND milestone.trigger_kind = 'on_section_settled'
       AND milestone.trigger_section_key = decision.section_key
      WHERE decision.id::text =
              current_setting('app.client_decision_write_id', true)
        AND decision.project_id = v_project.id
        AND decision.designer_id = v_project.designer_id
        AND decision.decision_kind = 'approval'
        AND decision.coordination_kind = 'selection'
        AND decision.court = 'client'
        AND decision.status = 'responded'
        AND relationship.designer_id = v_project.designer_id
        AND relationship.client_id = v_actor
        AND option.selected
        AND option.approves
        AND milestone.invoice_id IS NULL
        AND milestone.label || ' — payment milestone' = NEW.memo
        AND milestone.amount_cents = NEW.subtotal_cents
        AND NEW.tax_cents = 0
        AND milestone.amount_cents = NEW.total_cents
      FOR UPDATE OF milestone
      FOR SHARE OF decision, relationship, option
    ) AS locked
    LIMIT 1;
    IF FOUND AND v_capability_count = 1 THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'studio_id_not_designer_studio';
  ELSIF v_active_role <> 'service_role' AND NOT v_postgres_migration THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_invoice_studio_id() IS
  'Invoker trigger authorizes project discovery before locking or deriving a missing invoice designer/client/studio from its canonical project. App/service inserts bind the current active non-guest project lead with a live designer-domain role, exact client, and active design studio; UPDATE cannot change invoice identity or its project/client/designer/studio tuple. Direct authenticated DML is limited to clean drafts by an exact-studio actor. Immutable machine updates require current-lead or previous_lead provenance. Authenticated owner cores require an exact-studio actor or exact client capability; service may reconcile exact historical tuples. A true postgres/no-SET-ROLE fixture or owner-maintenance session returns only after best-effort derivation and UPDATE immutability checks. 00571: a project-less studio invoice is authorized on both arms by its own studio instead - an active design studio, an active non-guest member as designer, a household on the designer_clients roster of an active non-guest member of that studio, and an actor that is an active non-guest member or a machine role - and takes no lock. The stamped member must additionally hold a designer-domain role on insert, where identity is settled.';

-- The trigger's UPDATE OF list gains `title`: 00511's list predates the column,
-- so without it a direct UPDATE that touches only the regarding line never
-- fires the gate and could rewrite an issued studio invoice's title. The list
-- is 00511:3076-3083 verbatim with `title` appended; the normalized definition
-- is re-pinned in supabase/tests/edge_api/public_sd_hardening_contract_test.sql.
DROP TRIGGER IF EXISTS set_invoice_studio_id ON public.invoices;
CREATE TRIGGER set_invoice_studio_id
  BEFORE INSERT OR UPDATE OF
    id, studio_id, designer_id, client_id, project_id, status, invoice_number,
    issue_date, due_date, payment_terms_days, currency, subtotal_cents,
    tax_rate, tax_cents, total_cents, amount_paid_cents, memo, internal_notes,
    sent_at, paid_at, voided_at, void_reason, stripe_checkout_session_id,
    reminder_count, last_reminder_at, ar_flagged_at, ar_last_chased_at,
    created_at, updated_at, title
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_studio_id();

-- ─── PART 3: create_draft_studio_invoice — the composer boundary ────────────
--
-- Sibling of public.create_draft_invoice (00511:3344). Same posture: SECURITY
-- DEFINER, pinned search_path, EXECUTE to authenticated only, one transaction
-- that owns the header, its lines, and its totals. The differences are the
-- ones the shape forces:
--   * there is no project to discover, so authority is the studio (S8: the
--     caller names it, so a two-studio designer is never guessed at);
--   * the household must be on the designer_clients roster (00014:72-99, a
--     per-designer roster) of an active non-guest member of that studio, and
--     THAT member is stamped as invoices.designer_id, because RLS and
--     is_studio_comember both hang off it (S4);
--   * only kind='adhoc' lines are accepted (S6) - milestone/time/ffe lines
--     are project-bound and would otherwise raise opaquely later from
--     guard_time_entry_invoice_authority (00412:2643) or the milestone latch;
--   * the roles catalog is not locked, but the stamped member must still
--     hold a designer-domain role (public.has_designer_domain_role, an
--     unlocked DEFINER read): a studio invoice has no project lead whose
--     user_roles row could be locked, and its design_fee earning must land
--     on a designer all the same. The locked authority rows stay the
--     memberships and the organization, in that order.

CREATE OR REPLACE FUNCTION public.create_draft_studio_invoice(
  p_client_id uuid,
  p_studio_id uuid,
  p_title text,
  p_tax_rate numeric DEFAULT 0,
  p_payment_terms_days integer DEFAULT 15,
  p_memo text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_actor uuid := auth.uid();
  v_designer_id uuid;
  v_invoice_id uuid;
  v_subtotal integer := 0;
  v_tax integer := 0;
BEGIN
  IF v_active_role <> 'authenticated' OR v_actor IS NULL THEN
    RAISE EXCEPTION 'studio invoice studio not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_studio_id IS NULL
     OR p_client_id IS NULL
     OR NOT public.is_active_studio_member(p_studio_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.organizations AS studio
       WHERE studio.id = p_studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
  THEN
    RAISE EXCEPTION 'studio invoice studio not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Authorization-qualified discovery precedes the authority locks: the
  -- roster row must already belong to an active non-guest member of the named
  -- studio. The actor's own roster row wins when it exists, so a designer
  -- billing their own household is always stamped as themselves; otherwise
  -- the lowest-id roster owner carries the invoice.
  SELECT relationship.designer_id INTO v_designer_id
  FROM public.designer_clients AS relationship
  JOIN public.organization_members AS roster_membership
    ON roster_membership.organization_id = p_studio_id
   AND roster_membership.user_id = relationship.designer_id
  WHERE relationship.client_id = p_client_id
    AND roster_membership.status = 'active'
    AND roster_membership.role <> 'guest'
    AND public.has_designer_domain_role(relationship.designer_id)
  ORDER BY (relationship.designer_id = v_actor) DESC, relationship.designer_id
  LIMIT 1;
  IF v_designer_id IS NULL THEN
    RAISE EXCEPTION 'studio invoice household not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_studio_id
    AND membership.user_id = ANY(ARRAY[v_designer_id, v_actor]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = p_studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1
       FROM public.organizations AS studio
       WHERE studio.id = p_studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.organization_members AS membership
       WHERE membership.organization_id = p_studio_id
         AND membership.user_id = v_actor
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.organization_members AS membership
       WHERE membership.organization_id = p_studio_id
         AND membership.user_id = v_designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.designer_clients AS relationship
       WHERE relationship.designer_id = v_designer_id
         AND relationship.client_id = p_client_id
     )
     OR NOT public.has_designer_domain_role(v_designer_id)
  THEN
    RAISE EXCEPTION 'studio invoice studio not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0
     OR jsonb_array_length(p_lines) > 200
     OR octet_length(p_lines::text) > 262144
     OR NULLIF(btrim(COALESCE(p_title, '')), '') IS NULL
     OR char_length(p_title) > 200
     OR p_tax_rate IS NULL
     OR p_tax_rate < 0
     OR p_tax_rate > 1
     OR p_payment_terms_days IS NULL
     OR p_payment_terms_days < 0
     OR p_payment_terms_days > 365
     OR char_length(COALESCE(p_memo, '')) > 10000
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_lines) AS element(value)
       WHERE jsonb_typeof(element.value) <> 'object'
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(element.value) AS key(name)
            WHERE key.name <> ALL(ARRAY[
              'kind', 'description', 'quantity', 'unit_amount_cents',
              'metadata', 'sort_order'
            ]::text[])
          )
          OR jsonb_typeof(COALESCE(element.value->'metadata', '{}'::jsonb))
               <> 'object'
          OR COALESCE(element.value->'metadata', '{}'::jsonb) ?| ARRAY[
            'commercialDocumentId', 'tradeScopeDocumentId',
            'tradeScopeId', 'drawId'
          ]::text[]
     )
  THEN
    RAISE EXCEPTION 'invalid studio invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS line(kind text)
    WHERE line.kind IS DISTINCT FROM 'adhoc'
  ) THEN
    RAISE EXCEPTION 'a studio invoice carries ad-hoc lines only; milestone, time, and ffe lines are project-bound'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS line(
      description text,
      quantity numeric,
      unit_amount_cents integer,
      sort_order integer
    )
    WHERE NULLIF(btrim(line.description), '') IS NULL
       OR char_length(line.description) > 2000
       OR line.quantity IS NULL
       OR line.quantity <= 0
       OR line.quantity > 100000
       OR line.unit_amount_cents IS NULL
       OR line.unit_amount_cents < 0
       OR line.unit_amount_cents > 1000000000
       OR line.sort_order IS NULL
       OR line.sort_order < 0
       OR line.sort_order > 1000000
  ) THEN
    RAISE EXCEPTION 'invalid studio invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(
    round(line.quantity * line.unit_amount_cents)::integer
  ), 0)::integer
  INTO v_subtotal
  FROM jsonb_to_recordset(p_lines) AS line(
    quantity numeric,
    unit_amount_cents integer
  );
  v_tax := round(v_subtotal * p_tax_rate)::integer;

  INSERT INTO public.invoices (
    project_id, designer_id, client_id, studio_id, title, status, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents,
    payment_terms_days, memo
  ) VALUES (
    NULL, v_designer_id, p_client_id, p_studio_id, btrim(p_title), 'draft',
    'USD', v_subtotal, p_tax_rate, v_tax, v_subtotal + v_tax,
    p_payment_terms_days, NULLIF(p_memo, '')
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_line_items (
    invoice_id, kind, description, quantity, unit_amount_cents, amount_cents,
    metadata, sort_order
  )
  SELECT
    v_invoice_id, 'adhoc', btrim(line.description), line.quantity,
    line.unit_amount_cents,
    round(line.quantity * line.unit_amount_cents)::integer,
    COALESCE(line.metadata, '{}'::jsonb), line.sort_order
  FROM jsonb_to_recordset(p_lines) AS line(
    description text,
    quantity numeric,
    unit_amount_cents integer,
    metadata jsonb,
    sort_order integer
  )
  ORDER BY line.sort_order;

  RETURN v_invoice_id;
END;
$$;

COMMENT ON FUNCTION public.create_draft_studio_invoice(
  uuid, uuid, text, numeric, integer, text, jsonb
) IS
  'Atomic authenticated composer boundary for a studio invoice (an invoice with no project, 00571 / ruling S1). Revalidates an active design studio the actor is an active non-guest member of, resolves the household through the designer_clients roster of an active non-guest member of that studio and stamps that member as the invoice designer, locks memberships then the organization in canonical order, bounds and allowlists line JSON, accepts kind=adhoc lines only, and owns invoice identity, state, totals, header insertion, and every initial line in one transaction. Returns the draft invoice id.';

REVOKE ALL PRIVILEGES ON FUNCTION public.create_draft_studio_invoice(
  uuid, uuid, text, numeric, integer, text, jsonb
)
FROM PUBLIC, anon, authenticated, service_role, dashboard_user;
GRANT EXECUTE ON FUNCTION public.create_draft_studio_invoice(
  uuid, uuid, text, numeric, integer, text, jsonb
) TO authenticated;

-- ─── SD roster registration for create_draft_studio_invoice ─────────────────
--
-- 00511 registers create_draft_invoice by pinning its owner, semantics, ACL
-- and lock order at migration time; the same shape is pinned here for its
-- studio sibling. It cannot join 00511's canonical-lock-order roster verbatim
-- (that roster requires a roles/user_roles lock a studio invoice has no lead
-- to take), so the two authority locks it does take are asserted in order.

DO $studio_draft_roster$
BEGIN
  ASSERT 1 = (
    SELECT count(*)
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname = 'create_draft_studio_invoice'
  ), '00571 studio draft overload universe drifted';

  ASSERT (
    SELECT owner.rolname = 'postgres'
       AND language.lanname = 'plpgsql'
       AND routine.prokind = 'f'
       AND NOT routine.proretset
       AND routine.prosecdef
       AND routine.provolatile = 'v'
       AND NOT routine.proisstrict
       AND NOT routine.proleakproof
       AND routine.proparallel = 'u'
       AND routine.proconfig =
             ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
       AND pg_get_function_result(routine.oid) = 'uuid'
       AND position('PERFORM membership.id' IN routine.prosrc)
             < position('PERFORM studio.id' IN routine.prosrc)
    FROM pg_proc AS routine
    JOIN pg_roles AS owner ON owner.oid = routine.proowner
    JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid = to_regprocedure(
      'public.create_draft_studio_invoice(uuid,uuid,text,numeric,integer,text,jsonb)'
    )
  ), '00571 studio draft semantic profile or authority lock order drifted';

  ASSERT NOT EXISTS (
    WITH actual AS (
      SELECT
        CASE acl.grantee WHEN 0 THEN 'PUBLIC'
             ELSE grantee.rolname::text END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM pg_proc AS routine
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE routine.oid = to_regprocedure(
        'public.create_draft_studio_invoice(uuid,uuid,text,numeric,integer,text,jsonb)'
      )
        AND acl.grantee <> routine.proowner
    ),
    expected AS (
      SELECT 'authenticated'::text AS grantee, 'postgres'::text AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
    )
    SELECT 1
    FROM (
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
    ) AS drift
  ), '00571 studio draft direct ACL tuple drifted';
END
$studio_draft_roster$;

-- ─── PART 4: apply_invoice_payment_effects — earnings for a houseless row ───
--
-- Body from its true head (00277_refund_reconciliation.sql:128-271) with two
-- deltas, both on the forward earnings INSERT (S7): the projects join becomes
-- a LEFT JOIN so a project-less payment still writes designer_earnings, and
-- the description falls back to the invoice title. designer_earnings.project_id
-- stays i.project_id, which is NULL exactly when there is no house (the column
-- has been nullable since 00178:183). The refund-contra leg mirrors the
-- original row and is untouched.

CREATE OR REPLACE FUNCTION public.apply_invoice_payment_effects(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice    invoices%ROWTYPE;
  v_paid       BIGINT;
  v_was_paid   BOOLEAN;
  v_new_status TEXT;
  v_paid_at    TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_was_paid := v_invoice.status = 'paid';

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid
  FROM invoice_payments
  WHERE invoice_id = p_invoice_id AND status = 'succeeded';

  -- Status derivation — never resurrects a void invoice.
  IF v_invoice.status = 'void' THEN
    v_new_status := 'void';
  ELSIF v_paid >= v_invoice.total_cents AND v_invoice.total_cents > 0 THEN
    v_new_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSIF v_invoice.status IN ('partially_paid','paid') THEN
    -- All payments refunded/failed → fall back to sent.
    v_new_status := 'sent';
  ELSE
    v_new_status := v_invoice.status;
  END IF;

  IF v_new_status = 'paid' THEN
    SELECT COALESCE(MAX(received_at), NOW()) INTO v_paid_at
    FROM invoice_payments
    WHERE invoice_id = p_invoice_id AND status = 'succeeded';
  ELSE
    v_paid_at := NULL;
  END IF;

  UPDATE invoices
  SET amount_paid_cents = v_paid::INTEGER,
      status            = v_new_status,
      paid_at           = v_paid_at,
      updated_at        = NOW()
  WHERE id = p_invoice_id;

  -- One designer_earnings row per succeeded payment (design fee revenue).
  -- Stripe money is 'confirmed' until the platform payout lands; manual
  -- methods are already in the designer's hands → 'paid'.
  INSERT INTO designer_earnings (
    designer_id, source_type, gross_amount, platform_fee, net_amount,
    description, status, paid_at, earned_at,
    invoice_id, invoice_payment_id, project_id
  )
  SELECT
    i.designer_id,
    'design_fee',
    p.amount_cents,
    0,
    p.amount_cents,
    'Invoice ' || COALESCE(i.invoice_number, '(draft)') || ' — '
      || COALESCE(pr.name, i.title, 'Studio invoice'),
    CASE WHEN p.method = 'stripe' THEN 'confirmed' ELSE 'paid' END,
    CASE WHEN p.method = 'stripe' THEN NULL ELSE p.received_at END,
    COALESCE(p.received_at, NOW()),
    i.id,
    p.id,
    i.project_id
  FROM invoice_payments p
  JOIN invoices i  ON i.id = p.invoice_id
  LEFT JOIN projects pr ON pr.id = i.project_id
  WHERE p.invoice_id = p_invoice_id
    AND p.status = 'succeeded'
  ON CONFLICT (invoice_payment_id) WHERE invoice_payment_id IS NOT NULL
  DO NOTHING;

  -- 00277 REVERSE EFFECT 1 — earnings contra rows for refunded payments.
  -- designer_earnings carries settlement/payout state (status/payout_id/
  -- paid_at), so we never DELETE the credit — we post a negative mirror that
  -- nets it out in any aggregate while both rows stay auditable. The reversal
  -- mirrors the original's source_type/status/invoice/project (so it nets
  -- inside the SAME status bucket the credit landed in) and negates the money;
  -- paid_at is NULL (a clawback recognized now, not yet payout-settled) and
  -- invoice_payment_id is NULL (the credit holds that unique slot). Keyed on
  -- reverses_invoice_payment_id → at most one reversal per payment, ever.
  INSERT INTO designer_earnings (
    designer_id, source_type, gross_amount, platform_fee, net_amount,
    description, status, paid_at, earned_at,
    invoice_id, invoice_payment_id, project_id, reverses_invoice_payment_id
  )
  SELECT
    orig.designer_id,
    orig.source_type,
    -orig.gross_amount,
    -orig.platform_fee,
    -orig.net_amount,
    'Refund reversal — ' || COALESCE(orig.description, 'invoice payment'),
    orig.status,
    NULL,
    NOW(),
    orig.invoice_id,
    NULL,
    orig.project_id,
    p.id
  FROM invoice_payments p
  JOIN designer_earnings orig ON orig.invoice_payment_id = p.id
  WHERE p.invoice_id = p_invoice_id
    AND p.status = 'refunded'
  ON CONFLICT (reverses_invoice_payment_id) WHERE reverses_invoice_payment_id IS NOT NULL
  DO NOTHING;

  IF v_new_status = 'paid' AND NOT v_was_paid THEN
    -- Newly paid in full → linked milestones are paid through this invoice.
    UPDATE project_payment_milestones m
    SET status     = 'paid',
        paid_at    = v_paid_at,
        updated_at = NOW()
    FROM invoice_line_items li
    WHERE li.invoice_id = p_invoice_id
      AND li.milestone_id = m.id
      AND m.status <> 'paid';
  ELSIF v_was_paid AND v_new_status <> 'paid' THEN
    -- 00277 REVERSE EFFECT 2 — a refund dropped the invoice below fully-paid.
    -- Un-pay the milestone lines this invoice paid through: they return to
    -- 'outstanding' (issue-time state; the invoice is still live and billing
    -- them) with paid_at cleared. Symmetric with the forward flip; idempotent
    -- via the m.status = 'paid' guard (a replay finds them already outstanding).
    UPDATE project_payment_milestones m
    SET status     = 'outstanding',
        paid_at    = NULL,
        updated_at = NOW()
    FROM invoice_line_items li
    WHERE li.invoice_id = p_invoice_id
      AND li.milestone_id = m.id
      AND m.status = 'paid';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_invoice_payment_effects(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_invoice_payment_effects(UUID) TO service_role;

COMMENT ON FUNCTION public.apply_invoice_payment_effects(UUID) IS
  'Single source of truth for invoice payment side effects (00178 + 00277 '
  'refund reversal). Recomputes amount_paid over succeeded payments, derives '
  'status (never resurrects void), stamps/clears paid_at, upserts one earnings '
  'credit per succeeded payment, posts a negative earnings contra row per '
  'refunded payment (keyed on reverses_invoice_payment_id, replay-safe), and '
  'flips linked milestones paid?→outstanding as the invoice crosses the '
  'fully-paid line in either direction. Fired by the AFTER INSERT OR UPDATE OF '
  'status trigger on invoice_payments. 00571: the earnings credit LEFT JOINs '
  'projects and names itself from the invoice title when there is no house, so '
  'a studio invoice earns like any other design fee.';

-- ─── PART 5: the household read path (S5) ───────────────────────────────────
--
-- Additive. 00178's three client policies reach the homeowner through
-- projects.client_id and stay exactly as they are; these three reach the same
-- homeowner through invoices.client_id, which is the only anchor a studio
-- invoice has. Drafts stay invisible on both paths.

-- The household read path filters invoices.client_id and nothing else, so it
-- gets its own index; every project-keyed read still uses idx_invoices_project.
CREATE INDEX IF NOT EXISTS idx_invoices_client
  ON public.invoices (client_id)
  WHERE client_id IS NOT NULL;

CREATE POLICY invoices_household_select
  ON public.invoices FOR SELECT
  TO authenticated
  USING (
    client_id = auth.uid()
    AND status <> 'draft'
  );

CREATE POLICY invoice_line_items_household_select
  ON public.invoice_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices AS i
      WHERE i.id = invoice_line_items.invoice_id
        AND i.client_id = auth.uid()
        AND i.status <> 'draft'
    )
  );

CREATE POLICY invoice_payments_household_select
  ON public.invoice_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices AS i
      WHERE i.id = invoice_payments.invoice_id
        AND i.client_id = auth.uid()
        AND i.status <> 'draft'
    )
  );

COMMENT ON POLICY invoices_household_select ON public.invoices IS
  'The household reads its own issued invoices by invoices.client_id, the only anchor a studio invoice has (00571 / ruling S5). Additive to 00178''s project-keyed client policy; drafts stay invisible.';

-- ─── PART 6: resolve_studio_identity gains the studio it is asked about ─────
--
-- Head 00320:27. With no project the two-argument form falls to
-- _primary_studio_for(designer), which brands a two-studio designer's studio
-- invoice with the wrong letterhead (S8). The studio is named directly
-- instead - but only an active design studio short-circuits, so the resolver
-- stays a brand resolver and never becomes an anon organization-name lookup. Two overloads would make the PostgREST rpc call ambiguous, so this
-- is DROP + CREATE, not an added overload; plpgsql bodies carry no dependency
-- on the old signature and every in-repo caller passes two positional or two
-- named arguments, which still resolve against the default third.

DROP FUNCTION IF EXISTS public.resolve_studio_identity(uuid, uuid);

CREATE OR REPLACE FUNCTION public.resolve_studio_identity(
  p_project_id uuid DEFAULT NULL,
  p_designer_id uuid DEFAULT NULL,
  p_studio_id uuid DEFAULT NULL
)
RETURNS TABLE(studio_id uuid, name text, logo_url text, website text, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_studio_id uuid;
  v_designer  uuid := p_designer_id;
  v_name      text;
  v_logo      text;
  v_website   text;
  v_biz       text;
  v_full      text;
BEGIN
  -- 0. Named studio precedence (00571): a studio invoice carries its own
  -- studio_id, so neither the project nor the designer's primary studio is
  -- consulted. Only an active design studio short-circuits; anything else -
  -- a dead id, a manufacturer organization, an archived studio - falls
  -- through to the project and designer derivations below rather than
  -- lending this anon-granted resolver as an organization name lookup.
  IF p_studio_id IS NOT NULL THEN
    SELECT o.id INTO v_studio_id
    FROM organizations o
    WHERE o.id = p_studio_id
      AND o.type = 'design_studio'
      AND o.status = 'active';
  END IF;

  -- 1. Project precedence: its studio_id, and its designer as the fallback owner.
  IF v_studio_id IS NULL AND p_project_id IS NOT NULL THEN
    SELECT p.studio_id, COALESCE(v_designer, p.designer_id)
    INTO v_studio_id, v_designer
    FROM projects p
    WHERE p.id = p_project_id;
  END IF;

  -- 2. No project studio → the owning designer's primary studio.
  IF v_studio_id IS NULL AND v_designer IS NOT NULL THEN
    v_studio_id := public._primary_studio_for(v_designer);
  END IF;

  -- Studio org resolved → brand columns from organizations.
  IF v_studio_id IS NOT NULL THEN
    SELECT o.name, o.logo_url, o.website
    INTO v_name, v_logo, v_website
    FROM organizations o
    WHERE o.id = v_studio_id;

    IF FOUND THEN
      studio_id := v_studio_id;
      name      := v_name;
      logo_url  := v_logo;
      website   := v_website;
      source    := 'studio';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- 3/4. Fallback to the designer's profile identity — ONLY for actual designers.
  -- profiles are world-readable via 00013 RLS, but this resolver must not double
  -- as an anon enumeration convenience: a non-designer UUID (e.g. a client)
  -- matches no row here (is_designer filter) and falls through to the all-NULL
  -- row below rather than leaking a private individual's name.
  IF v_designer IS NOT NULL THEN
    SELECT pr.business_name, COALESCE(pr.full_name, pr.display_name)
    INTO v_biz, v_full
    FROM profiles pr
    WHERE pr.id = v_designer AND pr.is_designer;

    IF FOUND THEN
      IF v_biz IS NOT NULL AND btrim(v_biz) <> '' THEN
        studio_id := NULL; name := v_biz;  logo_url := NULL; website := NULL; source := 'business_name';
        RETURN NEXT;
        RETURN;
      END IF;

      studio_id := NULL; name := v_full; logo_url := NULL; website := NULL; source := 'full_name';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Nothing resolvable (or a non-designer UUID) → one empty row (exactly-one-row contract).
  studio_id := NULL; name := NULL; logo_url := NULL; website := NULL; source := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_studio_identity(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_studio_identity(uuid, uuid, uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_studio_identity(uuid, uuid, uuid) IS
  'Canonical studio brand resolver (plan D2): named studio→org when that id is an active design studio (00571, so a studio invoice brands off its own studio_id rather than the designer''s primary studio; anything else falls through rather than lending this anon-granted resolver as an organization name lookup), else project→studio→org, else designer→primary studio→org, else profile business_name/full_name (gated on is_designer so anon can''t enumerate non-designer names). Returns exactly one row, brand columns only. anon-granted (brand-only, same posture as open_design_requests).';

COMMIT;
