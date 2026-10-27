-- 00882 — Billing follows the countersign project → proposal → document order.
-- Lineage: public.issue_agreement_draw_invoice: 00578 → 00638 → 00882;
-- app_private.issue_invoice_for_actor: 00511 → 00578 → 00882.
-- Preserve monetary calculations, actor admission, state gates and pay-link minting.
-- The draw pins both project anchors before locking and refuses moved topology.
-- Private issuance takes the project UPDATE lock before proposal/document locks,
-- avoiding both inverse acquisition and concurrent project-SHARE upgrades.
-- set_invoice_studio_id (00578) is deliberately unchanged: UPDATE's historical
-- parent reads take no locks; INSERT holds the project before shared authority
-- reads. Adding a parent lock to that row UPDATE trigger would invert invoice → job.
-- No signatures, grants, capabilities, or activation state change.

CREATE OR REPLACE FUNCTION public.issue_agreement_draw_invoice(
  p_proposal_id uuid,
  p_draw_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_proposal public.proposals%ROWTYPE;
  v_draw public.agreement_draw_invoices%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_studio_id uuid;
  v_pinned_project_id uuid;
  v_pinned_proposal_project_id uuid;
  v_pinned_document_id uuid;
  v_pinned_document_project_id uuid;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_id uuid;
  v_unpaid integer;
  v_is_deposit boolean;
  v_client_authority boolean;
  v_pay_token text;
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
BEGIN
  IF NULLIF(btrim(COALESCE(p_draw_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'design-build draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_deposit := btrim(p_draw_key) = 'deposit';
  -- The one caller that is not the studio: the client-portal sign route's
  -- service client, offering the client her own deposit the moment her
  -- signature commits.
  v_client_authority := v_is_deposit AND v_active_role = 'service_role';

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id;
  -- Missing and denied answer identically, always: this RPC is granted to
  -- authenticated and must never confirm that a document exists.
  IF NOT FOUND
     OR v_proposal.document_kind <> 'design_build'
     OR NOT (
       v_client_authority
       OR (v_actor IS NOT NULL
           AND public._can_author_proposal(v_proposal.designer_id))
     )
  THEN
    RAISE EXCEPTION 'design-build draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Discover without locking; an origin deposit may not have a project yet.
  v_pinned_proposal_project_id := v_proposal.project_id;
  SELECT id, project_id INTO v_pinned_document_id, v_pinned_document_project_id
  FROM public.project_commercial_documents WHERE proposal_id = p_proposal_id;
  v_pinned_project_id := COALESCE(v_pinned_document_project_id, v_pinned_proposal_project_id);
  IF v_pinned_project_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.projects
    WHERE id = v_pinned_project_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design-build draw not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  -- Missing and denied answer identically, always: this RPC is granted to
  -- authenticated and must never confirm that a document exists.
  IF NOT FOUND
     OR v_proposal.document_kind <> 'design_build'
     OR NOT (
       v_client_authority
       OR (v_actor IS NOT NULL
           AND public._can_author_proposal(v_proposal.designer_id))
     )
  THEN
    RAISE EXCEPTION 'design-build draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Never follow a moved anchor after waiting for the project/proposal locks.
  IF v_proposal.project_id IS DISTINCT FROM v_pinned_proposal_project_id THEN
    RAISE EXCEPTION 'design-build draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS DISTINCT FROM v_pinned_document_id
     OR v_document.project_id IS DISTINCT FROM v_pinned_document_project_id
     OR (v_proposal.project_id IS NOT NULL AND v_document.project_id IS NOT NULL
         AND v_proposal.project_id <> v_document.project_id)
  THEN
    RAISE EXCEPTION 'design-build draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_document.project_id IS NOT NULL THEN
    v_studio_id := v_project.studio_id;
  END IF;

  SELECT * INTO v_draw FROM public.agreement_draw_invoices
  WHERE proposal_id = p_proposal_id AND draw_key = btrim(p_draw_key)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design-build draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The state gate (RC-7).
  IF v_is_deposit THEN
    IF v_proposal.commercial_state NOT IN ('client_signed', 'executed') THEN
      RAISE EXCEPTION 'the deposit is billable once the client has signed'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF v_proposal.commercial_state IS DISTINCT FROM 'executed' THEN
      RAISE EXCEPTION 'a draw is billable once the agreement is executed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT v_is_deposit THEN
    IF v_document.project_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.project_billing_authorities a
         WHERE a.project_id = v_document.project_id
           AND a.status = 'active'
       )
    THEN
      RAISE EXCEPTION 'a draw is billable once the agreement is executed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Already billed? A VOIDED invoice frees the draw; a live one does not
  -- (00511:6304-6317, verbatim rule).
  IF v_draw.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.invoices invoice
    WHERE invoice.id = v_draw.invoice_id
      AND invoice.status <> 'void'
  ) THEN
    RAISE EXCEPTION 'the draw "%" is already billed on a live invoice', v_draw.label
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every lower draw issued and paid in full.
  SELECT count(*) INTO v_unpaid
  FROM public.agreement_draw_invoices prior_draw
  LEFT JOIN public.invoices prior_invoice
    ON prior_invoice.id = prior_draw.invoice_id
  WHERE prior_draw.proposal_id = v_draw.proposal_id
    AND prior_draw.sort_order < v_draw.sort_order
    AND (
      prior_draw.invoice_id IS NULL
      OR prior_invoice.status IS DISTINCT FROM 'paid'
      OR prior_invoice.amount_paid_cents < prior_invoice.total_cents
    );
  IF v_unpaid > 0 THEN
    RAISE EXCEPTION 'earlier draws must be issued and paid before this one'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The retainage release additionally waits for every work draw, not only
  -- the ones beneath it in the order.
  IF v_draw.is_retainage_release THEN
    SELECT count(*) INTO v_unpaid
    FROM public.agreement_draw_invoices work_draw
    LEFT JOIN public.invoices work_invoice
      ON work_invoice.id = work_draw.invoice_id
    WHERE work_draw.proposal_id = v_draw.proposal_id
      AND NOT work_draw.is_retainage_release
      AND (
        work_draw.invoice_id IS NULL
        OR work_invoice.status IS DISTINCT FROM 'paid'
        OR work_invoice.amount_paid_cents < work_invoice.total_cents
      );
    IF v_unpaid > 0 THEN
      RAISE EXCEPTION 'the retainage release waits until every draw is paid'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_studio_id IS NULL THEN
    v_studio_id := public._agreement_studio_id(
      p_proposal_id, COALESCE(v_actor, v_proposal.designer_id));
  END IF;
  IF v_studio_id IS NULL THEN
    SELECT identity.studio_id INTO v_studio_id
    FROM public.resolve_studio_identity(
      v_document.project_id, v_proposal.designer_id) AS identity;
  END IF;
  IF v_studio_id IS NULL THEN
    RAISE EXCEPTION 'this agreement does not sit in a studio that can bill it'
      USING ERRCODE = 'check_violation';
  END IF;

  -- total_cents is the NET: retainage is withheld, not billed.
  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  INSERT INTO public.invoices (
    project_id, designer_id, client_id, studio_id, title, status, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents, memo
  ) VALUES (
    v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
    v_studio_id, v_draw.label, 'draft', 'USD',
    v_draw.net_cents, 0, 0, v_draw.net_cents,
    'Design-build draw · ' || v_draw.label
  ) RETURNING * INTO v_invoice;
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  v_invoice_id := v_invoice.id;

  INSERT INTO public.invoice_line_items (
    invoice_id, kind, description, quantity, unit_amount_cents,
    amount_cents, metadata
  ) VALUES (
    v_invoice_id, 'adhoc', v_draw.label, 1,
    v_draw.net_cents, v_draw.net_cents,
    jsonb_build_object(
      'agreementProposalId', v_draw.proposal_id,
      'commercialDocumentId', v_document.id,
      'drawKey', v_draw.draw_key,
      'kind', 'agreement_draw',
      'grossCents', v_draw.gross_cents,
      'retainageCents', v_draw.retainage_cents)
  );

  -- issue_invoice authorizes against the invoice's owning designer through
  -- is_studio_comember, which reads auth.uid(). The studio caller is already
  -- proven above and the service_role deposit caller carries no uid at all, so
  -- the owner is adopted for the width of the issuance and restored
  -- immediately (00423:2582-2589's sandwich, kept verbatim in shape).
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_proposal.designer_id, 'role', 'authenticated'
  )::text, true);
  PERFORM public.issue_invoice(v_invoice_id, current_date);
  PERFORM set_config(
    'request.jwt.claims', COALESCE(v_previous_claims, ''), true);

  UPDATE public.agreement_draw_invoices
  SET invoice_id = v_invoice_id, issued_at = now(), updated_at = now()
  WHERE id = v_draw.id
  RETURNING * INTO v_draw;

  -- The deposit pointer has to follow a re-issue, or voiding a deposit invoice
  -- and re-issuing it leaves every deposit readout on the dead one
  -- (00423:2596-2615's reasoning, verbatim).
  IF v_is_deposit AND v_document.id IS NOT NULL THEN
    UPDATE public.project_commercial_documents
    SET deposit_invoice_id = v_invoice_id
    WHERE id = v_document.id;
  END IF;

  -- THE ADDRESS IS MINTED, NOT READ BACK (W4 r1 B-1 / QA-B2).
  --
  -- invoice_link_mint_on_issue (00574:143-149) has already fired inside this
  -- transaction, because issue_invoice UPDATEs status — but since 00636 the
  -- row it wrote stores sha256(token) and holds `token` at NULL under
  -- chk_invoice_links_token_frozen, so re-reading the column answers NULL for
  -- every invoice, for ever. The client-portal sign route reads an empty
  -- payToken as "no deposit offer" and has no second route, so the homeowner
  -- signed a design-build agreement and was shown no way to pay her deposit.
  -- ensure_invoice_link is the one producer that can still emit a raw value:
  -- it revokes the link this transaction just minted, mints a fresh one, and
  -- returns it once. This IS the issuing transaction, so nobody is holding the
  -- address it revokes. NULL still means "no address to carry" — a draft, or a
  -- lost mint race — and the caller falls back exactly as it did before
  -- (00574:132-135's own rule, 00636's M7 valve).
  v_pay_token := public.ensure_invoice_link(v_invoice_id);

  RETURN jsonb_build_object(
    'drawKey', v_draw.draw_key,
    'label', v_draw.label,
    'amountCents', v_draw.gross_cents,
    'retainageCents', v_draw.retainage_cents,
    'netCents', v_draw.net_cents,
    'invoiceId', v_invoice_id,
    'invoiceStatus', (
      SELECT invoice.status FROM public.invoices invoice
      WHERE invoice.id = v_invoice_id),
    'payToken', v_pay_token
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.issue_invoice_for_actor(
  p_invoice_id uuid,
  p_due_date date,
  p_actor_id uuid
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_document_id uuid;
  v_document_kind text;
  v_proposal_id uuid;
  v_anchor_count integer;
  v_line_count integer;
  v_subtotal bigint;
  v_tax integer;
  v_number integer;
  v_due date;
  v_studio_id uuid;
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_admitted record;
BEGIN
  -- Discover only an invoice whose canonical project tuple already admits the
  -- explicit actor; no foreign project or invoice row is locked on denial.
  SELECT invoice, project
  INTO v_admitted
  FROM public.invoices AS invoice
  JOIN public.projects AS project ON project.id = invoice.project_id
  WHERE invoice.id = p_invoice_id
    AND invoice.designer_id = project.designer_id
    AND invoice.client_id = project.client_id
    AND invoice.studio_id = project.studio_id
    AND p_actor_id IS NOT NULL
    AND (
      p_actor_id = invoice.client_id
      OR p_actor_id = project.designer_id
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS actor_membership
        WHERE actor_membership.organization_id = project.studio_id
          AND actor_membership.user_id = p_actor_id
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_invoice := v_admitted.invoice;
  v_project := v_admitted.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_project.id
    AND project.designer_id = v_project.designer_id
    AND project.client_id = v_project.client_id
    AND project.studio_id = v_project.studio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, p_actor_id
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  SELECT invoice.* INTO v_invoice
  FROM public.invoices AS invoice
  WHERE invoice.id = p_invoice_id
    AND invoice.project_id = v_project.id
    AND invoice.designer_id = v_project.designer_id
    AND invoice.client_id = v_project.client_id
    AND invoice.studio_id = v_project.studio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM line.id
  FROM public.invoice_line_items AS line
  WHERE line.invoice_id = p_invoice_id
  ORDER BY line.id
  FOR SHARE;

  WITH anchors AS (
    SELECT DISTINCT document.id, document.proposal_id, document.document_kind
    FROM public.invoice_line_items AS line
    JOIN public.project_commercial_documents AS document
      ON (
        document.document_kind IN ('design_services', 'service_addendum', 'design_build')
        AND line.metadata->>'kind' = 'design_services_retainer'
        AND document.id::text =
              NULLIF(line.metadata->>'commercialDocumentId', '')
      )
      OR (
        document.document_kind = 'furnishings_authorization'
        AND document.id::text =
              NULLIF(line.metadata->>'commercialDocumentId', '')
      )
      OR (
        document.document_kind = 'trade_scope'
        AND document.id::text =
              NULLIF(line.metadata->>'tradeScopeDocumentId', '')
      )
    WHERE line.invoice_id = p_invoice_id
  )
  SELECT count(*) INTO v_anchor_count FROM anchors;

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document.id, document.proposal_id, document.document_kind
  INTO v_document_id, v_proposal_id, v_document_kind
  FROM public.project_commercial_documents AS document
  JOIN public.proposals AS proposal ON proposal.id = document.proposal_id
  JOIN public.designer_clients AS author_relationship
    ON author_relationship.id = proposal.designer_client_id
  WHERE EXISTS (
      SELECT 1
      FROM public.invoice_line_items AS line
      WHERE line.invoice_id = p_invoice_id
        AND (
          (
            document.document_kind IN (
              'design_services', 'service_addendum', 'design_build'
            )
            AND line.metadata->>'kind' = 'design_services_retainer'
            AND document.id::text =
                  NULLIF(line.metadata->>'commercialDocumentId', '')
          )
          OR (
            document.document_kind = 'furnishings_authorization'
            AND document.id::text =
                  NULLIF(line.metadata->>'commercialDocumentId', '')
          )
          OR (
            document.document_kind = 'trade_scope'
            AND document.id::text =
                  NULLIF(line.metadata->>'tradeScopeDocumentId', '')
          )
        )
    )
    AND document.project_id = v_project.id
    AND (
      proposal.project_id IS NULL
      OR proposal.project_id = v_project.id
    )
    AND proposal.document_kind = document.document_kind
    AND proposal.client_id = v_project.client_id
    AND author_relationship.designer_id = proposal.designer_id
    AND author_relationship.client_id = proposal.client_id
    AND v_invoice.project_id = v_project.id
    AND v_invoice.designer_id = v_project.designer_id
    AND v_invoice.client_id = proposal.client_id
    AND v_invoice.studio_id = v_project.studio_id;

  IF FOUND THEN
    SELECT proposal.* INTO v_proposal
    FROM public.proposals AS proposal
    WHERE proposal.id = v_proposal_id
      AND proposal.client_id = v_project.client_id
      AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
      AND proposal.document_kind = v_document_kind
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        'issue_invoice: invoice not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT document.* INTO v_document
    FROM public.project_commercial_documents AS document
    WHERE document.id = v_document_id
      AND document.project_id = v_project.id
      AND document.proposal_id = v_proposal.id
      AND document.document_kind = v_document_kind
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        'issue_invoice: invoice not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM author_relationship.id
    FROM public.designer_clients AS author_relationship
    WHERE author_relationship.id = v_proposal.designer_client_id
      AND author_relationship.designer_id = v_proposal.designer_id
      AND author_relationship.client_id = v_proposal.client_id
    FOR SHARE;
  END IF;

  IF NOT FOUND
     OR v_project.status <> 'active'
     OR NOT EXISTS (
       SELECT 1
       FROM public.organizations AS studio
       JOIN public.organization_members AS lead_membership
         ON lead_membership.organization_id = studio.id
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
         AND lead_membership.user_id = v_project.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.user_roles AS user_role
       JOIN public.roles AS role ON role.id = user_role.role_id
       WHERE user_role.user_id = v_project.designer_id
         AND role.domain = 'designer'
     )
     OR NOT (
       p_actor_id = v_proposal.client_id
       OR p_actor_id = v_project.designer_id
       OR EXISTS (
         SELECT 1
         FROM public.organization_members AS actor_membership
         WHERE actor_membership.organization_id = v_project.studio_id
           AND actor_membership.user_id = p_actor_id
           AND actor_membership.status = 'active'
           AND actor_membership.role <> 'guest'
       )
     )
  THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    WHERE time_entry.invoice_id = p_invoice_id
      AND time_entry.billing_state <> 'authorized'
  ) THEN
    RAISE EXCEPTION
      'issue_invoice: linked time includes entries pending authorization or nonbillable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    JOIN public.project_billing_authorities AS authority
      ON authority.id = time_entry.billing_authority_id
    WHERE time_entry.invoice_id = p_invoice_id
      AND authority.retainer_activation_policy = 'retainer_paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.invoices AS retainer
        WHERE retainer.id = authority.retainer_invoice_id
          AND retainer.status = 'paid'
          AND retainer.amount_paid_cents >= retainer.total_cents
      )
  ) THEN
    RAISE EXCEPTION
      'issue_invoice: signed retainer invoice must be paid first'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION
      'issue_invoice: invoice % is %, expected draft',
      p_invoice_id, v_invoice.status;
  END IF;

  SELECT count(*) INTO v_line_count
  FROM public.invoice_line_items
  WHERE invoice_id = p_invoice_id;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION
      'issue_invoice: invoice % has no line items', p_invoice_id;
  END IF;

  PERFORM 1
  FROM public.invoice_line_items AS line
  JOIN public.project_payment_milestones AS milestone
    ON milestone.id = line.milestone_id
  WHERE line.invoice_id = p_invoice_id
    AND (
      milestone.status = 'paid'
      OR EXISTS (
        SELECT 1
        FROM public.invoice_line_items AS other_line
        JOIN public.invoices AS other_invoice
          ON other_invoice.id = other_line.invoice_id
        WHERE other_line.milestone_id = line.milestone_id
          AND other_line.invoice_id <> p_invoice_id
          AND other_invoice.status IN (
            'draft', 'sent', 'partially_paid', 'paid'
          )
      )
    );
  IF FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: a linked milestone is already paid or billed on another invoice';
  END IF;

  v_studio_id := v_project.studio_id;
  IF v_studio_id IS NOT NULL THEN
    INSERT INTO public.studio_invoice_counters(studio_id)
    VALUES (v_studio_id)
    ON CONFLICT (studio_id)
      DO UPDATE
      SET next_number = public.studio_invoice_counters.next_number + 1
    RETURNING next_number INTO v_number;
  ELSE
    INSERT INTO public.invoice_counters(designer_id)
    VALUES (v_invoice.designer_id)
    ON CONFLICT (designer_id)
      DO UPDATE
      SET next_number = public.invoice_counters.next_number + 1
    RETURNING next_number INTO v_number;
  END IF;

  SELECT COALESCE(sum(amount_cents), 0) INTO v_subtotal
  FROM public.invoice_line_items
  WHERE invoice_id = p_invoice_id;
  v_tax := round(v_subtotal * v_invoice.tax_rate)::integer;
  v_due := COALESCE(
    p_due_date, current_date + v_invoice.payment_terms_days
  );

  UPDATE public.invoices
  SET status = 'sent',
      invoice_number = 'INV-' || lpad(v_number::text, 4, '0'),
      issue_date = current_date,
      due_date = v_due,
      subtotal_cents = v_subtotal::integer,
      tax_cents = v_tax,
      total_cents = v_subtotal::integer + v_tax,
      sent_at = now(),
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  UPDATE public.project_payment_milestones AS milestone
  SET status = 'outstanding',
      due_date = v_due,
      updated_at = now()
  FROM public.invoice_line_items AS line
  WHERE line.invoice_id = p_invoice_id
    AND line.milestone_id = milestone.id
    AND milestone.status = 'pending';

  RETURN v_invoice;
END;
$$;
