-- ═══════════════════════════════════════════════════════════════════════════
-- 00412 — Design services before FF&E: commercial authority foundation
--
-- Adds a second, explicit commercial state machine beside the legacy proposal
-- lifecycle. Legacy documents retain sign_proposal and the 00398/00400
-- proposal↔project guards unchanged. Design-services editions use two immutable
-- signatures: the client act records consent but creates nothing; the studio
-- countersign calls the current 00398 private activation bridge and atomically
-- creates one project, one billing authority, immutable rate snapshots, and an
-- optional retainer invoice. Furnishing editions are named, independently
-- signed snapshots bound to that existing project.
--
-- Current-body lineage grafted here:
--   activate_proposal_as_project public wrapper: 00390 (private bridge 00398)
--   issue_invoice: 00178 → 00318 (studio numbering/co-member authorization)
--   create_purchase_order: 00186 remains byte-for-byte; 00412 adds table-edge
--     authority guards around its existing item-link transaction.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Commercial vocabulary on immutable proposal editions ─────────────────

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS commercial_state text,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_reason text,
  ADD COLUMN IF NOT EXISTS replacement_proposal_id uuid
    REFERENCES public.proposals(id) ON DELETE RESTRICT;

ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_document_kind_check,
  ADD CONSTRAINT proposals_document_kind_check CHECK (
    document_kind IN (
      'legacy', 'design_services', 'furnishings_authorization',
      'service_addendum'
    )
  ),
  DROP CONSTRAINT IF EXISTS proposals_commercial_state_check,
  ADD CONSTRAINT proposals_commercial_state_check CHECK (
    commercial_state IS NULL OR commercial_state IN (
      'draft', 'sent', 'client_signed', 'executed', 'declined', 'expired',
      'superseded'
    )
  ),
  DROP CONSTRAINT IF EXISTS proposals_supersession_shape_check,
  ADD CONSTRAINT proposals_supersession_shape_check CHECK (
    (commercial_state = 'superseded'
      AND superseded_at IS NOT NULL
      AND char_length(btrim(COALESCE(superseded_reason, ''))) > 0)
    OR
    (commercial_state IS DISTINCT FROM 'superseded'
      AND superseded_at IS NULL
      AND superseded_reason IS NULL
      AND replacement_proposal_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_proposals_commercial_kind_state
  ON public.proposals(document_kind, commercial_state, updated_at DESC)
  WHERE document_kind <> 'legacy';
CREATE INDEX IF NOT EXISTS idx_proposals_replacement
  ON public.proposals(replacement_proposal_id)
  WHERE replacement_proposal_id IS NOT NULL;

-- ── Agreement terms, immutable signatures, and project bindings ───────────

CREATE TABLE IF NOT EXISTS public.proposal_service_terms (
  proposal_id uuid PRIMARY KEY REFERENCES public.proposals(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT '',
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(deliverables) = 'array'),
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exclusions) = 'array'),
  billing_ceiling_cents integer NOT NULL CHECK (billing_ceiling_cents >= 0),
  retainer_amount_cents integer NOT NULL DEFAULT 0 CHECK (retainer_amount_cents >= 0),
  retainer_activation_policy text NOT NULL DEFAULT 'immediate'
    CHECK (retainer_activation_policy IN ('immediate', 'retainer_paid')),
  billing_cadence text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cadence IN ('monthly', 'biweekly', 'milestone')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  terms text,
  current_rate_version integer NOT NULL DEFAULT 1 CHECK (current_rate_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proposal_service_rates (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  role_name text NOT NULL CHECK (char_length(btrim(role_name)) > 0),
  hourly_rate_cents integer NOT NULL CHECK (hourly_rate_cents >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, version, role_name)
);

CREATE TABLE IF NOT EXISTS public.commercial_document_signatures (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE RESTRICT,
  party_role text NOT NULL CHECK (party_role IN ('client', 'studio')),
  signer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  signed_name text NOT NULL CHECK (char_length(btrim(signed_name)) >= 2),
  signed_ip text,
  evidence_fingerprint text NOT NULL CHECK (char_length(evidence_fingerprint) = 64),
  signed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (proposal_id, party_role)
);

CREATE TABLE IF NOT EXISTS public.project_commercial_documents (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL UNIQUE REFERENCES public.proposals(id) ON DELETE RESTRICT,
  document_kind text NOT NULL CHECK (
    document_kind IN ('design_services', 'furnishings_authorization', 'service_addendum')
  ),
  wave_name text,
  source_proposal_id uuid REFERENCES public.proposals(id) ON DELETE RESTRICT,
  budget_checkpoint_id uuid,
  deposit_invoice_id uuid REFERENCES public.invoices(id) ON DELETE RESTRICT,
  is_origin boolean NOT NULL DEFAULT false,
  bound_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CHECK ((document_kind = 'furnishings_authorization') = (wave_name IS NOT NULL)),
  CHECK (wave_name IS NULL OR char_length(btrim(wave_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_commercial_wave_name
  ON public.project_commercial_documents(project_id, lower(wave_name))
  WHERE wave_name IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_commercial_origin
  ON public.project_commercial_documents(project_id)
  WHERE is_origin;

-- ── Billing authority and immutable role-rate snapshots ───────────────────

CREATE TABLE IF NOT EXISTS public.project_billing_authorities (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  commercial_document_id uuid NOT NULL UNIQUE
    REFERENCES public.project_commercial_documents(id) ON DELETE RESTRICT,
  source_proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE RESTRICT,
  billing_ceiling_cents integer NOT NULL CHECK (billing_ceiling_cents >= 0),
  retainer_amount_cents integer NOT NULL DEFAULT 0 CHECK (retainer_amount_cents >= 0),
  retainer_activation_policy text NOT NULL CHECK (retainer_activation_policy IN ('immediate', 'retainer_paid')),
  billing_cadence text NOT NULL CHECK (billing_cadence IN ('monthly', 'biweekly', 'milestone')),
  retainer_invoice_id uuid REFERENCES public.invoices(id) ON DELETE RESTRICT,
  effective_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'exhausted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= effective_at)
);

CREATE INDEX IF NOT EXISTS idx_project_billing_authorities_active
  ON public.project_billing_authorities(project_id, effective_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.project_billing_authority_rates (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  billing_authority_id uuid NOT NULL
    REFERENCES public.project_billing_authorities(id) ON DELETE RESTRICT,
  source_rate_id uuid NOT NULL REFERENCES public.proposal_service_rates(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  role_name text NOT NULL CHECK (char_length(btrim(role_name)) > 0),
  hourly_rate_cents integer NOT NULL CHECK (hourly_rate_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_authority_id, version, role_name),
  UNIQUE (billing_authority_id, source_rate_id)
);

-- ── Versioned working budgets and client checkpoints ──────────────────────

CREATE TABLE IF NOT EXISTS public.project_budget_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  low_total_cents integer NOT NULL DEFAULT 0 CHECK (low_total_cents >= 0),
  target_total_cents integer NOT NULL DEFAULT 0 CHECK (target_total_cents >= 0),
  high_total_cents integer NOT NULL DEFAULT 0 CHECK (high_total_cents >= 0),
  note text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (project_id, version),
  CHECK (low_total_cents <= target_total_cents AND target_total_cents <= high_total_cents),
  CHECK ((status = 'published') = (published_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.project_budget_lines (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  budget_version_id uuid NOT NULL REFERENCES public.project_budget_versions(id) ON DELETE CASCADE,
  project_room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  room_name text NOT NULL CHECK (char_length(btrim(room_name)) > 0),
  category text NOT NULL CHECK (char_length(btrim(category)) > 0),
  low_cents integer NOT NULL CHECK (low_cents >= 0),
  target_cents integer NOT NULL CHECK (target_cents >= 0),
  high_cents integer NOT NULL CHECK (high_cents >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (low_cents <= target_cents AND target_cents <= high_cents),
  UNIQUE (budget_version_id, room_name, category)
);

CREATE TABLE IF NOT EXISTS public.project_budget_checkpoints (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_version_id uuid NOT NULL UNIQUE
    REFERENCES public.project_budget_versions(id) ON DELETE RESTRICT,
  checkpoint_code text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'overridden')),
  snapshot_fingerprint text NOT NULL CHECK (char_length(snapshot_fingerprint) = 64),
  published_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  acknowledged_at timestamptz,
  override_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  override_reason text,
  overridden_at timestamptz,
  UNIQUE (project_id, checkpoint_code),
  CHECK (
    (status = 'open' AND acknowledged_at IS NULL AND overridden_at IS NULL)
    OR (status = 'acknowledged' AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL AND overridden_at IS NULL)
    OR (status = 'overridden' AND override_by IS NOT NULL AND overridden_at IS NOT NULL
        AND char_length(btrim(COALESCE(override_reason, ''))) > 0 AND acknowledged_at IS NULL)
  )
);

ALTER TABLE public.project_commercial_documents
  DROP CONSTRAINT IF EXISTS project_commercial_documents_budget_checkpoint_id_fkey,
  ADD CONSTRAINT project_commercial_documents_budget_checkpoint_id_fkey
    FOREIGN KEY (budget_checkpoint_id) REFERENCES public.project_budget_checkpoints(id)
    ON DELETE RESTRICT;

-- ── Named furnishing snapshots ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.furnishing_authorization_items (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  commercial_document_id uuid NOT NULL
    REFERENCES public.project_commercial_documents(id) ON DELETE RESTRICT,
  source_proposal_item_id uuid NOT NULL REFERENCES public.proposal_items(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  room_name text,
  category text,
  item_type text NOT NULL DEFAULT 'fixed' CHECK (item_type IN ('fixed', 'allowance', 'tbd')),
  quantity integer NOT NULL CHECK (quantity > 0),
  client_unit_price_cents integer NOT NULL CHECK (client_unit_price_cents >= 0),
  client_line_total_cents integer NOT NULL CHECK (client_line_total_cents >= 0),
  trade_unit_cost_cents integer CHECK (trade_unit_cost_cents IS NULL OR trade_unit_cost_cents >= 0),
  markup_percent numeric CHECK (markup_percent IS NULL OR markup_percent >= 0),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  vendor_name text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot) = 'object'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commercial_document_id, source_proposal_item_id)
);

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS source_commercial_document_id uuid
    REFERENCES public.project_commercial_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_authorization_item_id uuid
    REFERENCES public.furnishing_authorization_items(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_ffe_authorization_item
  ON public.project_ffe_items(source_authorization_item_id)
  WHERE source_authorization_item_id IS NOT NULL;

-- ── Time-entry authority provenance ───────────────────────────────────────

ALTER TABLE public.project_time_entries
  ADD COLUMN IF NOT EXISTS billing_authority_id uuid
    REFERENCES public.project_billing_authorities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS authority_rate_id uuid
    REFERENCES public.project_billing_authority_rates(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS billing_state text NOT NULL DEFAULT 'authorized',
  ADD COLUMN IF NOT EXISTS rated_amount_cents integer;

ALTER TABLE public.project_time_entries
  DROP CONSTRAINT IF EXISTS project_time_entries_billing_state_check,
  ADD CONSTRAINT project_time_entries_billing_state_check CHECK (
    billing_state IN ('authorized', 'pending_authorization', 'nonbillable')
  ),
  DROP CONSTRAINT IF EXISTS project_time_entries_rated_amount_check,
  ADD CONSTRAINT project_time_entries_rated_amount_check CHECK (
    rated_amount_cents IS NULL OR rated_amount_cents >= 0
  ),
  DROP CONSTRAINT IF EXISTS project_time_entries_authority_shape_check,
  ADD CONSTRAINT project_time_entries_authority_shape_check CHECK (
    (billing_authority_id IS NULL AND authority_rate_id IS NULL)
    OR (billing_authority_id IS NOT NULL AND authority_rate_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_project_time_entries_authority_state
  ON public.project_time_entries(billing_authority_id, billing_state, started_at)
  WHERE billing_authority_id IS NOT NULL;

-- ── RLS: authored drafts are studio-write; authority ledgers are RPC-write ─

ALTER TABLE public.proposal_service_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_service_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_document_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_commercial_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_billing_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_billing_authority_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budget_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budget_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.furnishing_authorization_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposal_service_terms_studio_rw ON public.proposal_service_terms
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)));
CREATE POLICY proposal_service_rates_studio_rw ON public.proposal_service_rates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)));

CREATE POLICY commercial_signatures_studio_read ON public.commercial_document_signatures
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)));
CREATE POLICY commercial_signatures_client_read ON public.commercial_document_signatures
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.client_id = auth.uid()));

CREATE POLICY project_commercial_documents_studio_read ON public.project_commercial_documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)));
CREATE POLICY project_commercial_documents_client_read ON public.project_commercial_documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.client_id = auth.uid()));

CREATE POLICY billing_authorities_studio_read ON public.project_billing_authorities
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)));
CREATE POLICY billing_authorities_client_read ON public.project_billing_authorities
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.client_id = auth.uid()));
CREATE POLICY billing_authority_rates_studio_read ON public.project_billing_authority_rates
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_billing_authorities a JOIN public.projects p ON p.id = a.project_id WHERE a.id = billing_authority_id AND public.is_studio_comember(p.designer_id)));
CREATE POLICY billing_authority_rates_client_read ON public.project_billing_authority_rates
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_billing_authorities a JOIN public.projects p ON p.id = a.project_id WHERE a.id = billing_authority_id AND p.client_id = auth.uid()));

CREATE POLICY budget_versions_studio_rw ON public.project_budget_versions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)));
CREATE POLICY budget_versions_client_read ON public.project_budget_versions
  FOR SELECT TO authenticated
  USING (status = 'published' AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.client_id = auth.uid()));
CREATE POLICY budget_lines_studio_rw ON public.project_budget_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_budget_versions v JOIN public.projects p ON p.id = v.project_id WHERE v.id = budget_version_id AND public.is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.project_budget_versions v JOIN public.projects p ON p.id = v.project_id WHERE v.id = budget_version_id AND public.is_studio_comember(p.designer_id)));
CREATE POLICY budget_lines_client_read ON public.project_budget_lines
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_budget_versions v JOIN public.projects p ON p.id = v.project_id WHERE v.id = budget_version_id AND v.status = 'published' AND p.client_id = auth.uid()));
CREATE POLICY budget_checkpoints_studio_read ON public.project_budget_checkpoints
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.is_studio_comember(p.designer_id)));
CREATE POLICY budget_checkpoints_client_read ON public.project_budget_checkpoints
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.client_id = auth.uid()));

CREATE POLICY furnishing_authorization_items_studio_read ON public.furnishing_authorization_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_commercial_documents d JOIN public.projects p ON p.id = d.project_id WHERE d.id = commercial_document_id AND public.is_studio_comember(p.designer_id)));

-- Fresh-stack ACLs are explicit. Client-safe reads use SECURITY DEFINER RPCs;
-- no client grant exposes furnishing trade cost.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_service_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_service_rates TO authenticated;
GRANT SELECT ON public.commercial_document_signatures TO authenticated;
GRANT SELECT ON public.project_commercial_documents TO authenticated;
GRANT SELECT ON public.project_billing_authorities TO authenticated;
GRANT SELECT ON public.project_billing_authority_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_budget_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_budget_lines TO authenticated;
GRANT SELECT ON public.project_budget_checkpoints TO authenticated;
GRANT SELECT ON public.furnishing_authorization_items TO authenticated;

-- ── Immutable table edges and commercial lifecycle authority ─────────────

CREATE OR REPLACE FUNCTION public.guard_commercial_proposal_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exact_authority boolean := current_user IS NOT DISTINCT FROM 'postgres'
    AND (
      current_setting('app.commercial_document_id', true) IS NOT DISTINCT FROM NEW.id::text
      OR current_setting('app.commercial_cutover_id', true) IS NOT DISTINCT FROM NEW.id::text
    );
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.document_kind <> 'legacy' THEN
      NEW.commercial_state := COALESCE(NEW.commercial_state, 'draft');
      IF NEW.commercial_state <> 'draft' AND current_user IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION 'commercial document inserts must start as draft'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.document_kind IS DISTINCT FROM OLD.document_kind
     AND (OLD.status <> 'draft' OR OLD.signed_at IS NOT NULL)
  THEN
    RAISE EXCEPTION 'document kind is immutable after draft'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Existing send_proposal remains the only send rail. Mirror that authorized
  -- transition into the separate commercial state without redefining its
  -- hardened fingerprint/dispatch body.
  IF NEW.document_kind <> 'legacy'
     AND OLD.status = 'draft'
     AND NEW.status = 'sent'
     AND current_user IS NOT DISTINCT FROM 'postgres'
     AND current_setting('app.proposal_send_id', true) IS NOT DISTINCT FROM NEW.id::text
  THEN
    NEW.commercial_state := 'sent';
  END IF;

  -- A commercial client signature uses accepted only as the compatibility
  -- state required by the existing private activation implementation. It must
  -- carry this separate exact-row capability; legacy sign_proposal does not.
  IF NEW.document_kind <> 'legacy'
     AND NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM 'accepted'
     AND NOT v_exact_authority
  THEN
    RAISE EXCEPTION 'commercial documents require their dedicated signature authority'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.commercial_state IS DISTINCT FROM OLD.commercial_state
     OR NEW.superseded_at IS DISTINCT FROM OLD.superseded_at
     OR NEW.superseded_reason IS DISTINCT FROM OLD.superseded_reason
     OR NEW.replacement_proposal_id IS DISTINCT FROM OLD.replacement_proposal_id
  THEN
    IF NOT v_exact_authority
       AND NOT (
         current_user IS NOT DISTINCT FROM 'postgres'
         AND current_setting('app.proposal_send_id', true) IS NOT DISTINCT FROM NEW.id::text
         AND NEW.commercial_state = 'sent'
       )
    THEN
      RAISE EXCEPTION 'commercial lifecycle may only change through its canonical RPC'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_commercial_proposal_authority()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS aab_guard_commercial_proposal_authority_trg ON public.proposals;
CREATE TRIGGER aab_guard_commercial_proposal_authority_trg
BEFORE INSERT OR UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_proposal_authority();

CREATE OR REPLACE FUNCTION public.guard_commercial_immutable_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_immutable_row()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_commercial_document_signatures_immutable
BEFORE UPDATE OR DELETE ON public.commercial_document_signatures
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_immutable_row();
CREATE TRIGGER guard_project_commercial_documents_immutable
BEFORE DELETE ON public.project_commercial_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_immutable_row();
CREATE TRIGGER guard_billing_authority_rates_immutable
BEFORE UPDATE OR DELETE ON public.project_billing_authority_rates
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_immutable_row();
CREATE TRIGGER guard_furnishing_authorization_items_immutable
BEFORE UPDATE OR DELETE ON public.furnishing_authorization_items
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_immutable_row();

CREATE OR REPLACE FUNCTION public.guard_commercial_authored_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal_id uuid := CASE TG_TABLE_NAME
    WHEN 'proposal_service_terms' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'proposal_service_rates' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
  END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = v_proposal_id AND p.status = 'draft'
  ) THEN
    RAISE EXCEPTION '% is immutable after its proposal leaves draft', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_authored_child()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_proposal_service_terms_authored
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_service_terms
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_authored_child();
CREATE TRIGGER guard_proposal_service_rates_authored
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_service_rates
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_authored_child();

CREATE OR REPLACE FUNCTION public.guard_budget_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_version_id uuid := CASE TG_TABLE_NAME
    WHEN 'project_budget_versions' THEN (v_row->>'id')::uuid
    WHEN 'project_budget_lines' THEN (v_row->>'budget_version_id')::uuid
  END;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_budget_versions v
    WHERE v.id = v_version_id AND v.status = 'published'
  ) AND NOT (
    TG_TABLE_NAME = 'project_budget_versions'
    AND TG_OP = 'UPDATE'
    AND OLD.status = 'draft'
    AND NEW.status = 'published'
    AND current_user IS NOT DISTINCT FROM 'postgres'
    AND current_setting('app.budget_publish_id', true) IS NOT DISTINCT FROM NEW.id::text
  ) THEN
    RAISE EXCEPTION 'published budget versions and lines are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_budget_immutability()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_project_budget_versions_immutable
BEFORE UPDATE OR DELETE ON public.project_budget_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_budget_immutability();
CREATE TRIGGER guard_project_budget_lines_immutable
BEFORE UPDATE OR DELETE ON public.project_budget_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_budget_immutability();

CREATE OR REPLACE FUNCTION public._commercial_document_fingerprint(p_proposal_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'proposal', public._proposal_review_fingerprint(p_proposal_id),
    'documentKind', p.document_kind,
    'serviceTerms', (
      SELECT to_jsonb(t) - 'created_at' - 'updated_at'
      FROM public.proposal_service_terms t WHERE t.proposal_id = p.id
    ),
    'serviceRates', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) - 'id' - 'created_at' ORDER BY r.version, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p.id
    ), '[]'::jsonb),
    'furnishings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceProposalItemId', i.source_proposal_item_id,
        'productId', i.product_id, 'name', i.name, 'roomName', i.room_name,
        'category', i.category, 'itemType', i.item_type, 'quantity', i.quantity,
        'clientUnitPriceCents', i.client_unit_price_cents,
        'clientLineTotalCents', i.client_line_total_cents,
        'snapshot', i.snapshot, 'sortOrder', i.sort_order
      ) ORDER BY i.sort_order, i.id)
      FROM public.furnishing_authorization_items i
      JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
      WHERE d.proposal_id = p.id
    ), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.proposals p
  WHERE p.id = p_proposal_id;
$$;
REVOKE ALL ON FUNCTION public._commercial_document_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._budget_version_fingerprint(p_version_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'projectId', v.project_id, 'version', v.version,
    'lowTotalCents', v.low_total_cents, 'targetTotalCents', v.target_total_cents,
    'highTotalCents', v.high_total_cents, 'note', v.note,
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'roomId', l.project_room_id, 'roomName', l.room_name, 'category', l.category,
      'lowCents', l.low_cents, 'targetCents', l.target_cents,
      'highCents', l.high_cents, 'sortOrder', l.sort_order
    ) ORDER BY l.sort_order, l.id) FROM public.project_budget_lines l
      WHERE l.budget_version_id = v.id), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.project_budget_versions v WHERE v.id = p_version_id;
$$;
REVOKE ALL ON FUNCTION public._budget_version_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── Design-services two-act signature rail ────────────────────────────────

CREATE OR REPLACE FUNCTION public._sign_design_services_agreement_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_ip text := NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), '');
  v_fingerprint text;
  v_newly_signed boolean := false;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'sign_design_services_agreement requires an authenticated client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('design_services', 'service_addendum') THEN
    RAISE EXCEPTION 'proposal % is not a design services agreement or addendum', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.commercial_state NOT IN ('sent', 'client_signed') THEN
    RAISE EXCEPTION 'design services agreement % is not client-signable (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.valid_until IS NOT NULL AND v_proposal.valid_until < now() THEN
    RAISE EXCEPTION 'design services agreement % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
     OR NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id)
  THEN
    RAISE EXCEPTION 'design services agreement requires terms and at least one role rate'
      USING ERRCODE = 'check_violation';
  END IF;

  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_fingerprint IS NULL THEN
    RAISE EXCEPTION 'could not fingerprint design services agreement %', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client'
  FOR UPDATE;

  IF FOUND THEN
    IF v_signature.signer_user_id IS DISTINCT FROM p_client_id
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'client signature evidence conflicts with the current agreement fingerprint'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', p_client_id, v_name, v_ip, v_fingerprint,
      jsonb_build_object('via', 'sign_design_services_agreement')
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals
    SET commercial_state = 'client_signed', updated_at = now()
    WHERE id = p_proposal_id;
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly_signed := true;
  END IF;

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'client_signed',
    'projectId', NULL,
    'signatureId', v_signature.id,
    'evidenceFingerprint', v_signature.evidence_fingerprint,
    'newlyClientSigned', v_newly_signed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._sign_design_services_agreement_authorized(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sign_design_services_agreement(
  p_proposal_id uuid,
  p_signed_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._sign_design_services_agreement_authorized(
    p_proposal_id, p_signed_name, auth.uid(), NULL
  );
END;
$$;
REVOKE ALL ON FUNCTION public.sign_design_services_agreement(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_design_services_agreement(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.sign_design_services_agreement_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP design-services signing requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_client_id, 'role', 'authenticated'
  )::text, true);
  v_result := public._sign_design_services_agreement_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip
  );
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.countersign_design_services_agreement(
  p_proposal_id uuid,
  p_signer_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_client_signature public.commercial_document_signatures%ROWTYPE;
  v_studio_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.proposal_service_terms%ROWTYPE;
  v_fingerprint text;
  v_project_id uuid;
  v_document_id uuid;
  v_authority_id uuid;
  v_retainer_invoice_id uuid;
  v_newly_executed boolean := false;
  v_name text := btrim(COALESCE(p_signer_name, ''));
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'studio countersign requires an authenticated signer and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind NOT IN ('design_services', 'service_addendum')
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_client_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR SHARE;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_client_signature.id IS NULL
     OR v_client_signature.signer_user_id IS DISTINCT FROM v_proposal.client_id
     OR v_client_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
  THEN
    RAISE EXCEPTION 'studio countersign requires the exact current client consent fingerprint'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.commercial_state = 'executed' THEN
    SELECT d.id, d.project_id, a.id, a.retainer_invoice_id
    INTO v_document_id, v_project_id, v_authority_id, v_retainer_invoice_id
    FROM public.project_commercial_documents d
    JOIN public.project_billing_authorities a ON a.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id;
    SELECT * INTO v_studio_signature FROM public.commercial_document_signatures
    WHERE proposal_id = p_proposal_id AND party_role = 'studio';
    IF v_document_id IS NULL OR v_studio_signature.id IS NULL
       OR v_studio_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'executed agreement has incomplete authority topology'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'client_signed' THEN
    IF EXISTS (SELECT 1 FROM public.proposal_items i WHERE i.proposal_id = p_proposal_id) THEN
      RAISE EXCEPTION 'design services agreement must not carry furnishing items'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO STRICT v_terms FROM public.proposal_service_terms
    WHERE proposal_id = p_proposal_id;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'studio', v_actor, v_name, v_fingerprint,
      jsonb_build_object('via', 'countersign_design_services_agreement')
    ) RETURNING * INTO v_studio_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_client_signature.signed_at,
      signed_by_name = v_client_signature.signed_name,
      signed_ip = v_client_signature.signed_ip,
      accepted_at = v_studio_signature.signed_at,
      updated_at = now()
    WHERE id = p_proposal_id;

    IF v_proposal.document_kind = 'design_services' THEN
      -- Current private bridge is the 00398 wrapper around the long-lived
      -- 00331 implementation. It preserves every project/proposal guard.
      v_project_id := public._activate_proposal_as_project_authorized(
        p_proposal_id, current_date
      );
      INSERT INTO public.project_commercial_documents (
        project_id, proposal_id, document_kind, is_origin, executed_at, created_by
      ) VALUES (
        v_project_id, p_proposal_id, 'design_services', true,
        v_studio_signature.signed_at, v_actor
      ) RETURNING id INTO v_document_id;
    ELSE
      SELECT id, project_id INTO v_document_id, v_project_id
      FROM public.project_commercial_documents
      WHERE proposal_id = p_proposal_id AND document_kind = 'service_addendum'
      FOR UPDATE;
      IF v_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.project_commercial_documents origin
        JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
        WHERE origin.project_id = v_project_id AND origin.is_origin
          AND origin_proposal.commercial_state = 'executed'
      ) THEN
        RAISE EXCEPTION 'service addendum has no executed project origin'
          USING ERRCODE = 'check_violation';
      END IF;
      UPDATE public.project_commercial_documents
      SET executed_at = v_studio_signature.signed_at
      WHERE id = v_document_id;
      UPDATE public.project_billing_authorities
      SET status = 'superseded', ended_at = v_studio_signature.signed_at
      WHERE project_id = v_project_id AND status = 'active';
    END IF;

    IF v_terms.retainer_amount_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_project_id, v_proposal.designer_id, v_proposal.client_id, 'draft', 'USD',
        v_terms.retainer_amount_cents, 0, 0, v_terms.retainer_amount_cents,
        'Design services retainer · ' || v_proposal.title
      ) RETURNING id INTO v_retainer_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_retainer_invoice_id, 'adhoc', 'Design services retainer', 1,
        v_terms.retainer_amount_cents, v_terms.retainer_amount_cents,
        jsonb_build_object('commercialDocumentId', v_document_id, 'kind', 'design_services_retainer')
      );
      PERFORM public.issue_invoice(v_retainer_invoice_id, current_date);
    END IF;

    INSERT INTO public.project_billing_authorities (
      project_id, commercial_document_id, source_proposal_id,
      billing_ceiling_cents, retainer_amount_cents, retainer_activation_policy,
      billing_cadence, retainer_invoice_id, effective_at
    ) VALUES (
      v_project_id, v_document_id, p_proposal_id,
      v_terms.billing_ceiling_cents, v_terms.retainer_amount_cents,
      v_terms.retainer_activation_policy, v_terms.billing_cadence, v_retainer_invoice_id,
      v_studio_signature.signed_at
    ) RETURNING id INTO v_authority_id;

    INSERT INTO public.project_billing_authority_rates (
      billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents
    ) SELECT v_authority_id, r.id, r.version, r.role_name, r.hourly_rate_cents
      FROM public.proposal_service_rates r
      WHERE r.proposal_id = p_proposal_id
      ORDER BY r.version, r.sort_order, r.role_name;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly_executed := true;
  ELSE
    RAISE EXCEPTION 'design services agreement % is not ready to countersign (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'executed',
    'projectId', v_project_id,
    'billingAuthorityId', v_authority_id,
    'retainerInvoiceId', v_retainer_invoice_id,
    'newlyExecuted', v_newly_executed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.countersign_design_services_agreement(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.countersign_design_services_agreement(uuid, text)
  TO authenticated;

-- Preserve the 00390 public wrapper and add one boundary: commercial editions
-- cannot use the studio's legacy one-act activation entry point.
CREATE OR REPLACE FUNCTION public.activate_proposal_as_project(
  p_proposal_id uuid,
  p_start_date date DEFAULT current_date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id uuid;
  v_document_kind text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'activate_proposal_as_project requires an authenticated studio author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal.designer_id, proposal.document_kind
  INTO v_designer_id, v_document_kind
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_designer_id) THEN
    RAISE EXCEPTION 'activate_proposal_as_project: proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_document_kind <> 'legacy' THEN
    RAISE EXCEPTION 'commercial documents activate only through their dedicated execution RPC'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN public._activate_proposal_as_project_authorized(p_proposal_id, p_start_date);
END;
$$;
REVOKE ALL ON FUNCTION public.activate_proposal_as_project(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_proposal_as_project(uuid, date)
  TO authenticated;

-- ── Atomic draft authoring and commercial send seam ───────────────────────

CREATE OR REPLACE FUNCTION public.upsert_design_services_draft(
  p_proposal_id uuid,
  p_terms jsonb,
  p_rates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_rate jsonb;
  v_current_version integer := COALESCE((p_terms->>'currentRateVersion')::integer, 1);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(COALESCE(p_terms, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_rates, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_rates) = 0
  THEN
    RAISE EXCEPTION 'design-services draft requires an authenticated author, terms, and rates'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET document_kind = CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END,
      commercial_state = 'draft', updated_at = now()
  WHERE id = p_proposal_id;

  INSERT INTO public.proposal_service_terms (
    proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
    retainer_amount_cents, retainer_activation_policy, billing_cadence,
    currency, terms, current_rate_version
  ) VALUES (
    p_proposal_id,
    COALESCE(p_terms->>'scope', ''),
    COALESCE(p_terms->'deliverables', '[]'::jsonb),
    COALESCE(p_terms->'exclusions', '[]'::jsonb),
    COALESCE((p_terms->>'billingCeilingCents')::integer, 0),
    COALESCE((p_terms->>'retainerAmountCents')::integer, 0),
    COALESCE(NULLIF(p_terms->>'retainerActivationPolicy', ''), 'immediate'),
    COALESCE(NULLIF(p_terms->>'billingCadence', ''), 'monthly'),
    upper(COALESCE(NULLIF(p_terms->>'currency', ''), 'USD')),
    NULLIF(p_terms->>'terms', ''),
    v_current_version
  ) ON CONFLICT (proposal_id) DO UPDATE SET
    scope = EXCLUDED.scope,
    deliverables = EXCLUDED.deliverables,
    exclusions = EXCLUDED.exclusions,
    billing_ceiling_cents = EXCLUDED.billing_ceiling_cents,
    retainer_amount_cents = EXCLUDED.retainer_amount_cents,
    retainer_activation_policy = EXCLUDED.retainer_activation_policy,
    billing_cadence = EXCLUDED.billing_cadence,
    currency = EXCLUDED.currency,
    terms = EXCLUDED.terms,
    current_rate_version = EXCLUDED.current_rate_version,
    updated_at = now();

  DELETE FROM public.proposal_service_rates WHERE proposal_id = p_proposal_id;
  FOR v_rate IN SELECT value FROM jsonb_array_elements(p_rates)
  LOOP
    INSERT INTO public.proposal_service_rates (
      proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at
    ) VALUES (
      p_proposal_id,
      COALESCE((v_rate->>'version')::integer, v_current_version),
      btrim(v_rate->>'roleName'),
      (v_rate->>'hourlyRateCents')::integer,
      COALESCE((v_rate->>'sortOrder')::integer, 0),
      COALESCE((v_rate->>'effectiveAt')::timestamptz, now())
    );
  END LOOP;

  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentKind', CASE WHEN v_proposal.document_kind = 'legacy' THEN 'design_services' ELSE v_proposal.document_kind END,
    'commercialState', 'draft',
    'currentRateVersion', v_current_version,
    'rateCount', jsonb_array_length(p_rates),
    'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_design_services_draft(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_design_services_draft(uuid, jsonb, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.create_service_addendum(
  p_project_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_origin public.proposals%ROWTYPE;
  v_source_proposal_id uuid;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_title text := btrim(COALESCE(p_title, ''));
BEGIN
  IF v_actor IS NULL OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'service addendum requires an authenticated author and title'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT origin_proposal.*
  INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin_proposal.commercial_state = 'executed'
    AND public._can_author_proposal(origin_proposal.designer_id)
  LIMIT 1;
  IF v_origin.id IS NULL THEN
    RAISE EXCEPTION 'project % has no executed design-services authority', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT authority.source_proposal_id
  INTO v_source_proposal_id
  FROM public.project_billing_authorities authority
  WHERE authority.project_id = p_project_id AND authority.status = 'active'
  ORDER BY authority.effective_at DESC
  LIMIT 1;
  IF v_source_proposal_id IS NULL THEN
    RAISE EXCEPTION 'project % has no active billing authority', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    total_amount, status, version, parent_proposal_id, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_origin.designer_id, v_origin.client_id,
    v_origin.designer_client_id, v_title, 'Additional design-services authority',
    0, 'draft', 1, v_source_proposal_id, v_origin.project_address,
    v_origin.client_visibility_tier, v_origin.feedback_enabled,
    'service_addendum', 'draft'
  );
  INSERT INTO public.proposal_service_terms (
    proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
    retainer_amount_cents, retainer_activation_policy, billing_cadence,
    currency, terms, current_rate_version
  ) SELECT
    v_proposal_id, t.scope, t.deliverables, t.exclusions,
    t.billing_ceiling_cents, 0, 'immediate', t.billing_cadence,
    t.currency, t.terms, t.current_rate_version
  FROM public.proposal_service_terms t WHERE t.proposal_id = v_source_proposal_id;
  INSERT INTO public.proposal_service_rates (
    proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at
  ) SELECT v_proposal_id, r.version + 1, r.role_name, r.hourly_rate_cents,
      r.sort_order, now()
  FROM public.proposal_service_rates r WHERE r.proposal_id = v_source_proposal_id;
  UPDATE public.proposal_service_terms SET current_rate_version = current_rate_version + 1
  WHERE proposal_id = v_proposal_id;
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, source_proposal_id, created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'service_addendum', v_source_proposal_id, v_actor
  ) RETURNING id INTO v_document_id;

  RETURN jsonb_build_object(
    'proposalId', v_proposal_id, 'documentId', v_document_id,
    'projectId', p_project_id, 'documentKind', 'service_addendum',
    'commercialState', 'draft'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_service_addendum(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_service_addendum(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_commercial_document_send_snapshot(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal.id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_commercial_document_send_snapshot(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_commercial_document_send_snapshot(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.send_commercial_document(
  p_proposal_id uuid,
  p_expected_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_current_fingerprint text;
  v_dispatch_id uuid := extensions.gen_random_uuid();
  v_client_email text;
  v_client_name text;
  v_designer_name text;
  v_identity_name text;
  v_identity_logo text;
  v_identity_source text;
  v_sender_name text;
  v_studio_name text;
  v_studio_logo text;
  v_previous_send text := current_setting('app.proposal_send_id', true);
  v_previous_dispatch text := current_setting('app.proposal_send_dispatch_link', true);
BEGIN
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft' OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial draft % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_current_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed after review; refresh before sending'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_proposal.client_id IS NULL OR v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.designer_clients dc
       WHERE dc.id = v_proposal.designer_client_id
         AND dc.designer_id = v_proposal.designer_id
         AND dc.client_id = v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'commercial document requires an exact client relationship before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.document_kind IN ('design_services', 'service_addendum') AND (
    NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
    OR NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id)
  ) THEN
    RAISE EXCEPTION 'design-services send requires terms and role rates'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.document_kind = 'furnishings_authorization' AND NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.furnishing_authorization_items i ON i.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id
      AND EXISTS (SELECT 1 FROM public.project_budget_checkpoints c
        WHERE c.id = d.budget_checkpoint_id AND c.status IN ('acknowledged', 'overridden'))
  ) THEN
    RAISE EXCEPTION 'furnishings send requires a valid checkpoint and item snapshot'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.proposal_service_rates
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM i.id FROM public.furnishing_authorization_items i
  JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
  WHERE d.proposal_id = p_proposal_id ORDER BY i.id FOR UPDATE OF i;
  IF public._commercial_document_fingerprint(p_proposal_id)
     IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed while sending; refresh before sending'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    status = 'sent', sent_at = now(),
    personal_message = COALESCE(p_personal_message, personal_message),
    valid_until = COALESCE(p_valid_until, valid_until), updated_at = now()
  WHERE id = p_proposal_id RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);

  SELECT profile.email, profile.full_name INTO v_client_email, v_client_name
  FROM public.profiles profile WHERE profile.id = v_proposal.client_id;
  IF NULLIF(btrim(COALESCE(v_client_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'commercial document client must have an email before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(profile.full_name, profile.display_name) INTO v_designer_name
  FROM public.profiles profile WHERE profile.id = v_proposal.designer_id;
  SELECT identity.name, identity.logo_url, identity.source
  INTO v_identity_name, v_identity_logo, v_identity_source
  FROM public.resolve_studio_identity(v_proposal.project_id, v_proposal.designer_id) identity;
  v_designer_name := COALESCE(NULLIF(btrim(v_designer_name), ''),
    NULLIF(btrim(v_identity_name), ''), 'Your designer');
  v_sender_name := COALESCE(NULLIF(btrim(v_identity_name), ''), v_designer_name);
  IF v_identity_source IN ('studio', 'business_name') THEN
    v_studio_name := NULLIF(btrim(v_identity_name), '');
    v_studio_logo := NULLIF(btrim(v_identity_logo), '');
  END IF;

  INSERT INTO public.proposal_send_dispatches (
    id, proposal_id, sent_at, designer_id, client_id, project_id,
    proposal_title, personal_message, valid_until, total_amount,
    recipient_email, recipient_name, designer_name, sender_name,
    studio_name, studio_logo_url, client_portal_path,
    provider_idempotency_key, email_log_id, in_app_log_id
  ) VALUES (
    v_dispatch_id, v_proposal.id, v_proposal.sent_at, v_proposal.designer_id,
    v_proposal.client_id, v_proposal.project_id, v_proposal.title,
    v_proposal.personal_message, v_proposal.valid_until, v_proposal.total_amount,
    v_client_email, v_client_name, v_designer_name, v_sender_name,
    v_studio_name, v_studio_logo, '/proposals/' || v_proposal.id::text,
    'proposal-send/' || v_dispatch_id::text,
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/email/' || v_dispatch_id::text),
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/in-app/' || v_dispatch_id::text)
  );
  PERFORM set_config('app.proposal_send_dispatch_link',
    v_proposal.id::text || ':' || v_dispatch_id::text, true);
  UPDATE public.proposals SET proposal_send_dispatch_id = v_dispatch_id
  WHERE id = v_proposal.id AND proposal_send_dispatch_id IS NULL
  RETURNING * INTO v_proposal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial document send dispatch link already exists'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);

  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'documentKind', v_proposal.document_kind,
    'commercialState', 'sent',
    'status', v_proposal.status,
    'sentAt', v_proposal.sent_at,
    'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
    'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', v_current_fingerprint
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.send_commercial_document(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_commercial_document(uuid, text, text, timestamptz)
  TO authenticated;

-- ── Working-budget publication, acknowledgement, and audited override ─────

CREATE OR REPLACE FUNCTION public.publish_budget_checkpoint(
  p_project_id uuid,
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_low bigint;
  v_target bigint;
  v_high bigint;
  v_fingerprint text;
  v_previous_publish text := current_setting('app.budget_publish_id', true);
BEGIN
  SELECT v.* INTO v_version
  FROM public.project_budget_versions v
  JOIN public.projects p ON p.id = v.project_id
  WHERE v.id = p_version_id AND v.project_id = p_project_id
    AND public.is_studio_comember(p.designer_id)
  FOR UPDATE OF v;
  IF NOT FOUND OR v_actor IS NULL OR v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'draft budget version % not found or access denied', p_version_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_budget_lines l WHERE l.budget_version_id = p_version_id) THEN
    RAISE EXCEPTION 'budget version % has no lines', p_version_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT sum(low_cents), sum(target_cents), sum(high_cents)
  INTO v_low, v_target, v_high
  FROM public.project_budget_lines WHERE budget_version_id = p_version_id;

  PERFORM set_config('app.budget_publish_id', p_version_id::text, true);
  UPDATE public.project_budget_versions SET
    low_total_cents = v_low::integer,
    target_total_cents = v_target::integer,
    high_total_cents = v_high::integer,
    status = 'published', published_at = now()
  WHERE id = p_version_id RETURNING * INTO v_version;
  v_fingerprint := public._budget_version_fingerprint(p_version_id);

  INSERT INTO public.project_budget_checkpoints (
    project_id, budget_version_id, checkpoint_code, snapshot_fingerprint,
    published_by, published_at
  ) VALUES (
    p_project_id, p_version_id, 'B-' || lpad(v_version.version::text, 3, '0'),
    v_fingerprint, v_actor, v_version.published_at
  ) RETURNING * INTO v_checkpoint;
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);

  RETURN jsonb_build_object(
    'checkpointId', v_checkpoint.id,
    'projectId', p_project_id,
    'versionId', p_version_id,
    'checkpointCode', v_checkpoint.checkpoint_code,
    'status', v_checkpoint.status,
    'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
    'publishedAt', v_checkpoint.published_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_budget_checkpoint(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_budget_checkpoint(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_budget_checkpoint(p_checkpoint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_client_id uuid;
  v_newly boolean := false;
BEGIN
  SELECT c.* INTO v_checkpoint
  FROM public.project_budget_checkpoints c
  WHERE c.id = p_checkpoint_id FOR UPDATE;
  SELECT p.client_id INTO v_client_id
  FROM public.projects p WHERE p.id = v_checkpoint.project_id;
  IF NOT FOUND OR v_actor IS NULL OR v_client_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'budget checkpoint % not found or access denied', p_checkpoint_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_checkpoint.snapshot_fingerprint IS DISTINCT FROM
     public._budget_version_fingerprint(v_checkpoint.budget_version_id)
  THEN
    RAISE EXCEPTION 'budget checkpoint fingerprint no longer matches its published version'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_budget_versions newer
    JOIN public.project_budget_versions current_version
      ON current_version.id = v_checkpoint.budget_version_id
    WHERE newer.project_id = v_checkpoint.project_id
      AND newer.status = 'published'
      AND newer.version > current_version.version
  ) THEN
    RAISE EXCEPTION 'only the latest published budget checkpoint may be acknowledged'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_checkpoint.status = 'open' THEN
    UPDATE public.project_budget_checkpoints
    SET status = 'acknowledged', acknowledged_by = v_actor, acknowledged_at = now()
    WHERE id = p_checkpoint_id RETURNING * INTO v_checkpoint;
    v_newly := true;
  ELSIF v_checkpoint.status <> 'acknowledged'
        OR v_checkpoint.acknowledged_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'budget checkpoint % cannot be acknowledged from %',
      p_checkpoint_id, v_checkpoint.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN jsonb_build_object(
    'checkpointId', v_checkpoint.id,
    'projectId', v_checkpoint.project_id,
    'state', v_checkpoint.status,
    'status', v_checkpoint.status,
    'acknowledgedAt', v_checkpoint.acknowledged_at,
    'newlyAcknowledged', v_newly
  );
END;
$$;
REVOKE ALL ON FUNCTION public.acknowledge_budget_checkpoint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_budget_checkpoint(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.override_budget_checkpoint(
  p_checkpoint_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_newly boolean := false;
BEGIN
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'budget override requires a meaningful reason'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT c.* INTO v_checkpoint
  FROM public.project_budget_checkpoints c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = p_checkpoint_id AND public.is_studio_comember(p.designer_id)
  FOR UPDATE OF c;
  IF NOT FOUND OR v_actor IS NULL THEN
    RAISE EXCEPTION 'budget checkpoint % not found or access denied', p_checkpoint_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_checkpoint.snapshot_fingerprint IS DISTINCT FROM
     public._budget_version_fingerprint(v_checkpoint.budget_version_id)
  THEN
    RAISE EXCEPTION 'budget checkpoint fingerprint no longer matches its published version'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_checkpoint.status = 'open' THEN
    UPDATE public.project_budget_checkpoints
    SET status = 'overridden', override_by = v_actor,
        override_reason = v_reason, overridden_at = now()
    WHERE id = p_checkpoint_id RETURNING * INTO v_checkpoint;
    v_newly := true;
  ELSIF v_checkpoint.status <> 'overridden'
        OR v_checkpoint.override_by IS DISTINCT FROM v_actor
        OR v_checkpoint.override_reason IS DISTINCT FROM v_reason THEN
    RAISE EXCEPTION 'budget checkpoint % cannot be overridden from %',
      p_checkpoint_id, v_checkpoint.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN jsonb_build_object(
    'checkpointId', v_checkpoint.id,
    'status', v_checkpoint.status,
    'overrideReason', v_checkpoint.override_reason,
    'overriddenAt', v_checkpoint.overridden_at,
    'newlyOverridden', v_newly
  );
END;
$$;
REVOKE ALL ON FUNCTION public.override_budget_checkpoint(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.override_budget_checkpoint(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_project_working_budget(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_version FROM public.project_budget_versions
  WHERE project_id = p_project_id
    AND (status = 'published' OR public.is_studio_comember(v_project.designer_id))
  ORDER BY version DESC LIMIT 1;
  IF v_version.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_checkpoint FROM public.project_budget_checkpoints
  WHERE budget_version_id = v_version.id;
  RETURN jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id, 'projectId', v_version.project_id,
      'version', v_version.version, 'status', v_version.status,
      'lowTotalCents', v_version.low_total_cents,
      'targetTotalCents', v_version.target_total_cents,
      'highTotalCents', v_version.high_total_cents,
      'currency', 'USD', 'note', v_version.note,
      'createdAt', v_version.created_at, 'publishedAt', v_version.published_at
    ),
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', l.id, 'projectRoomId', l.project_room_id, 'roomName', l.room_name,
      'category', l.category, 'lowCents', l.low_cents,
      'targetCents', l.target_cents, 'highCents', l.high_cents,
      'sortOrder', l.sort_order
    ) ORDER BY l.sort_order, l.id) FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_version.id), '[]'::jsonb),
    'checkpoint', CASE WHEN v_checkpoint.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_checkpoint.id, 'projectId', v_checkpoint.project_id,
      'versionId', v_checkpoint.budget_version_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'status', v_checkpoint.status, 'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
      'publishedAt', v_checkpoint.published_at,
      'acknowledgedBy', v_checkpoint.acknowledged_by,
      'acknowledgedAt', v_checkpoint.acknowledged_at,
      'overrideBy', v_checkpoint.override_by,
      'overrideReason', v_checkpoint.override_reason,
      'overriddenAt', v_checkpoint.overridden_at
    ) END,
    'isPurchaseAuthority', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_project_working_budget(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_working_budget(uuid)
  TO authenticated;

-- ── Named furnishing waves: snapshot, send, sign, apply, deposit ───────────

CREATE OR REPLACE FUNCTION public.create_furnishings_authorization(
  p_project_id uuid,
  p_wave_name text,
  p_source_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_source public.proposals%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_item_count integer;
  v_wave_name text := btrim(COALESCE(p_wave_name, ''));
BEGIN
  IF v_actor IS NULL OR char_length(v_wave_name) < 2 THEN
    RAISE EXCEPTION 'furnishings authorization requires an authenticated author and wave name'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_checkpoint FROM public.project_budget_checkpoints
  WHERE project_id = p_project_id AND status IN ('acknowledged', 'overridden')
  ORDER BY published_at DESC LIMIT 1 FOR SHARE;
  IF v_checkpoint.id IS NULL THEN
    RAISE EXCEPTION 'furnishings authorization requires an acknowledged checkpoint or audited override'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_source FROM public.proposals
  WHERE id = p_source_proposal_id FOR SHARE;
  IF NOT FOUND OR v_source.status <> 'draft'
     OR v_source.document_kind <> 'legacy'
     OR v_source.project_id IS DISTINCT FROM p_project_id
     OR NOT public._can_author_proposal(v_source.designer_id)
     OR v_source.designer_id IS DISTINCT FROM v_project.designer_id
     OR v_source.client_id IS DISTINCT FROM v_project.client_id
  THEN
    RAISE EXCEPTION 'source furnishing draft % not found or does not match project', p_source_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO v_item_count FROM public.proposal_items
  WHERE proposal_id = p_source_proposal_id;
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'furnishings authorization requires at least one item'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    cover_image, subtotal, discount_amount, discount_percent, tax_rate,
    tax_amount, total_amount, deposit_percent, payment_terms, payment_notes,
    valid_until, status, version, project_address, personal_message,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_source.designer_id, v_source.client_id,
    v_source.designer_client_id, v_wave_name, v_source.description,
    v_source.cover_image, v_source.subtotal, v_source.discount_amount,
    v_source.discount_percent, v_source.tax_rate, v_source.tax_amount,
    v_source.total_amount, v_source.deposit_percent, v_source.payment_terms,
    v_source.payment_notes, v_source.valid_until, 'draft', 1,
    v_source.project_address, v_source.personal_message, 'full',
    v_source.feedback_enabled, 'furnishings_authorization', 'draft'
  );

  INSERT INTO public.proposal_items (
    id, proposal_id, product_id, name, description, image_url, room, category,
    quantity, unit_price, markup_percent, unit_sell_price, line_total_cents,
    position, notes, internal_notes, item_type, budget_min_cents,
    budget_max_cents, ffe_category, vendor_id, vendor_name, lead_time_weeks,
    doc_code, custom_fields, client_product_snapshot
  ) SELECT
    extensions.gen_random_uuid(), v_proposal_id, i.product_id, i.name,
    i.description, i.image_url, i.room, i.category, i.quantity, i.unit_price,
    i.markup_percent, i.unit_sell_price, i.line_total_cents, i.position,
    i.notes, i.internal_notes, i.item_type, i.budget_min_cents,
    i.budget_max_cents, i.ffe_category, i.vendor_id, i.vendor_name,
    i.lead_time_weeks, i.doc_code, i.custom_fields, i.client_product_snapshot
  FROM public.proposal_items i WHERE i.proposal_id = p_source_proposal_id
  ORDER BY i.position, i.id;

  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, wave_name, source_proposal_id,
    budget_checkpoint_id, created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'furnishings_authorization', v_wave_name,
    p_source_proposal_id, v_checkpoint.id, v_actor
  ) RETURNING id INTO v_document_id;

  INSERT INTO public.furnishing_authorization_items (
    commercial_document_id, source_proposal_item_id, product_id, name,
    room_name, category, item_type, quantity, client_unit_price_cents,
    client_line_total_cents, trade_unit_cost_cents, markup_percent,
    vendor_id, vendor_name, snapshot, sort_order
  ) SELECT
    v_document_id, i.id, i.product_id, i.name, i.room,
    COALESCE(i.ffe_category, i.category), i.item_type, i.quantity,
    i.unit_sell_price, i.line_total_cents, i.unit_price, i.markup_percent,
    i.vendor_id, i.vendor_name,
    jsonb_build_object(
      'description', i.description, 'imageUrl', i.image_url,
      'clientProductSnapshot', i.client_product_snapshot,
      'budgetMinCents', i.budget_min_cents, 'budgetMaxCents', i.budget_max_cents,
      'docCode', i.doc_code, 'customFields', i.custom_fields,
      'leadTimeWeeks', i.lead_time_weeks
    ), i.position
  FROM public.proposal_items i WHERE i.proposal_id = v_proposal_id
  ORDER BY i.position, i.id;

  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'waveName', v_wave_name,
    'commercialState', 'draft',
    'budgetCheckpointId', v_checkpoint.id,
    'itemCount', v_item_count,
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_furnishings_authorization(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_furnishings_authorization(uuid, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.client_id IS DISTINCT FROM v_actor
     OR v_proposal.document_kind <> 'furnishings_authorization'
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'furnishings authorization has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'furnishings authorization % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_furnishings_authorization')
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      signed_ip = v_signature.signed_ip,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      -- The client executes the authorization, but invoice issuance remains a
      -- studio act. Adopt the owning designer only for the existing issuance
      -- RPC, then restore the caller's claims before returning.
      PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_proposal.designer_id, 'role', 'authenticated'
      )::text, true);
      PERFORM public.issue_invoice(v_deposit_invoice_id, current_date);
      PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;
    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', v_deposit_cents,
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._execute_furnishings_authorization_authorized(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.execute_furnishings_authorization(
  p_proposal_id uuid,
  p_signed_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._execute_furnishings_authorization_authorized(
    p_proposal_id, p_signed_name, auth.uid(), NULL
  );
END;
$$;
REVOKE ALL ON FUNCTION public.execute_furnishings_authorization(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_furnishings_authorization(uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_furnishings_authorization_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP furnishings execution requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_client_id, 'role', 'authenticated'
  )::text, true);
  v_result := public._execute_furnishings_authorization_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip
  );
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.execute_furnishings_authorization_with_trusted_ip(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_furnishings_authorization_with_trusted_ip(uuid, text, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.list_furnishings_authorizations(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'documentId', d.id, 'proposalId', d.proposal_id, 'waveName', d.wave_name,
    'commercialState', p.commercial_state, 'status', p.status,
    'totalAmountCents', p.total_amount, 'depositPercent', p.deposit_percent,
    'depositInvoiceId', d.deposit_invoice_id, 'executedAt', d.executed_at,
    'budgetCheckpointId', d.budget_checkpoint_id,
    'itemCount', (SELECT count(*) FROM public.furnishing_authorization_items a WHERE a.commercial_document_id = d.id),
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'roomName', a.room_name, 'category', a.category,
      'itemType', a.item_type, 'quantity', a.quantity,
      'clientUnitPriceCents', a.client_unit_price_cents,
      'clientLineTotalCents', a.client_line_total_cents, 'sortOrder', a.sort_order
    ) ORDER BY a.sort_order, a.id), '[]'::jsonb)
      FROM public.furnishing_authorization_items a WHERE a.commercial_document_id = d.id)
  ) ORDER BY d.bound_at, d.id)
  FROM public.project_commercial_documents d
  JOIN public.proposals p ON p.id = d.proposal_id
  WHERE d.project_id = p_project_id AND d.document_kind = 'furnishings_authorization'
    AND (public.is_studio_comember(v_project.designer_id) OR p.commercial_state <> 'draft')),
  '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_furnishings_authorizations(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_furnishings_authorizations(uuid)
  TO authenticated;

-- ── Time capture is truthful; invoiceability follows signed authority ──────

CREATE OR REPLACE FUNCTION public.classify_project_time_entry_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_services_project boolean;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_rate public.project_billing_authority_rates%ROWTYPE;
  v_prior_cents bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.billing_authority_id IS NOT NULL AND (
    NEW.billing_authority_id IS DISTINCT FROM OLD.billing_authority_id
    OR NEW.authority_rate_id IS DISTINCT FROM OLD.authority_rate_id
    OR NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents
  ) THEN
    RAISE EXCEPTION 'time-entry authority and rate provenance are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind = 'design_services'
  ) INTO v_is_services_project;

  IF NOT NEW.billable THEN
    NEW.billing_state := 'nonbillable';
    NEW.rated_amount_cents := CASE WHEN NEW.duration_minutes IS NULL THEN NULL ELSE 0 END;
    RETURN NEW;
  END IF;
  IF NOT v_is_services_project THEN
    NEW.billing_state := 'authorized';
    IF NEW.duration_minutes IS NOT NULL AND NEW.hourly_rate_cents IS NOT NULL THEN
      NEW.rated_amount_cents := round(NEW.duration_minutes / 60.0 * NEW.hourly_rate_cents)::integer;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.billing_authority_id IS NOT NULL THEN
    SELECT * INTO v_authority FROM public.project_billing_authorities
    WHERE id = NEW.billing_authority_id AND project_id = NEW.project_id
      AND effective_at <= NEW.started_at
      AND (ended_at IS NULL OR ended_at > NEW.started_at);
  ELSE
    SELECT * INTO v_authority FROM public.project_billing_authorities
    WHERE project_id = NEW.project_id AND effective_at <= NEW.started_at
      AND (ended_at IS NULL OR ended_at > NEW.started_at)
    ORDER BY effective_at DESC, id DESC LIMIT 1;
  END IF;
  IF v_authority.id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
    NEW.billing_state := 'pending_authorization';
    NEW.rated_amount_cents := NULL;
    RETURN NEW;
  END IF;

  IF NEW.authority_rate_id IS NOT NULL THEN
    SELECT * INTO v_rate FROM public.project_billing_authority_rates
    WHERE id = NEW.authority_rate_id
      AND billing_authority_id = v_authority.id;
  ELSE
    SELECT * INTO v_rate FROM public.project_billing_authority_rates
    WHERE billing_authority_id = v_authority.id
    ORDER BY version DESC, created_at, id LIMIT 1;
  END IF;
  IF v_rate.id IS NULL THEN
    RAISE EXCEPTION 'billable design-services time requires a signed authority role rate'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.billing_authority_id := v_authority.id;
  NEW.authority_rate_id := v_rate.id;
  NEW.hourly_rate_cents := v_rate.hourly_rate_cents;

  IF NEW.duration_minutes IS NULL THEN
    NEW.rated_amount_cents := NULL;
    NEW.billing_state := 'authorized';
    RETURN NEW;
  END IF;
  NEW.rated_amount_cents := round(NEW.duration_minutes / 60.0 * v_rate.hourly_rate_cents)::integer;
  SELECT COALESCE(sum(t.rated_amount_cents), 0) INTO v_prior_cents
  FROM public.project_time_entries t
  WHERE t.billing_authority_id = v_authority.id
    AND t.billing_state = 'authorized'
    AND t.billable AND t.duration_minutes IS NOT NULL
    AND t.id IS DISTINCT FROM NEW.id;
  IF v_prior_cents + NEW.rated_amount_cents <= v_authority.billing_ceiling_cents THEN
    NEW.billing_state := 'authorized';
  ELSE
    NEW.billing_state := 'pending_authorization';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.classify_project_time_entry_authority()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS aac_classify_project_time_entry_authority_trg
  ON public.project_time_entries;
CREATE TRIGGER aac_classify_project_time_entry_authority_trg
BEFORE INSERT OR UPDATE OF project_id, user_id, started_at, duration_minutes,
  billable, billing_authority_id, authority_rate_id, hourly_rate_cents
ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.classify_project_time_entry_authority();

CREATE OR REPLACE FUNCTION public.guard_time_entry_invoice_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.invoice_id IS NOT DISTINCT FROM OLD.invoice_id THEN RETURN NEW; END IF;
  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.billing_state <> 'authorized' THEN
    RAISE EXCEPTION 'time entry % is not authorized for invoicing', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = NEW.invoice_id AND i.project_id = NEW.project_id AND i.status = 'draft'
  ) THEN
    RAISE EXCEPTION 'time entry invoice must be a draft on the same project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.billing_authority_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.project_billing_authorities a
    WHERE a.id = NEW.billing_authority_id
      AND a.retainer_activation_policy = 'retainer_paid'
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices ri WHERE ri.id = a.retainer_invoice_id
          AND ri.status = 'paid' AND ri.amount_paid_cents >= ri.total_cents
      )
  ) THEN
    RAISE EXCEPTION 'time entry cannot be invoiced until the signed retainer invoice is paid'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_time_entry_invoice_authority()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS aad_guard_time_entry_invoice_authority_trg
  ON public.project_time_entries;
CREATE TRIGGER aad_guard_time_entry_invoice_authority_trg
BEFORE UPDATE OF invoice_id ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_invoice_authority();

CREATE OR REPLACE VIEW public.project_unbilled_time
WITH (security_invoker = true) AS
SELECT
  te.id, te.project_id, te.phase_key, te.task_id, te.user_id, te.started_at,
  te.duration_minutes, te.notes,
  COALESCE(te.hourly_rate_cents,
    NULLIF((p.change_order_terms->>'hourly_rate_cents')::int, 0),
    pr.default_hourly_rate_cents, 0) AS resolved_rate_cents,
  COALESCE(te.rated_amount_cents, round(te.duration_minutes / 60.0 * COALESCE(
    te.hourly_rate_cents, NULLIF((p.change_order_terms->>'hourly_rate_cents')::int, 0),
    pr.default_hourly_rate_cents, 0))::int) AS amount_cents,
  te.billing_authority_id, te.authority_rate_id, te.billing_state
FROM public.project_time_entries te
JOIN public.projects p ON p.id = te.project_id
JOIN public.profiles pr ON pr.id = te.user_id
WHERE te.invoice_id IS NULL AND te.billable
  AND te.duration_minutes IS NOT NULL AND te.billing_state = 'authorized';

-- Graft the current 00318 issue_invoice body behind a new authority wrapper.
ALTER FUNCTION public.issue_invoice(uuid, date) RENAME TO _issue_invoice_pre_00412;
REVOKE ALL ON FUNCTION public._issue_invoice_pre_00412(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_invoice_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_time_entries t
    WHERE t.invoice_id = p_invoice_id AND t.billing_state <> 'authorized'
  ) THEN
    RAISE EXCEPTION 'issue_invoice: linked time includes entries pending authorization or nonbillable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_time_entries t
    JOIN public.project_billing_authorities a ON a.id = t.billing_authority_id
    WHERE t.invoice_id = p_invoice_id
      AND a.retainer_activation_policy = 'retainer_paid'
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices ri WHERE ri.id = a.retainer_invoice_id
          AND ri.status = 'paid' AND ri.amount_paid_cents >= ri.total_cents
      )
  ) THEN
    RAISE EXCEPTION 'issue_invoice: signed retainer invoice must be paid first'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN public._issue_invoice_pre_00412(p_invoice_id, p_due_date);
END;
$$;
REVOKE ALL ON FUNCTION public.issue_invoice(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, date) TO authenticated;

-- ── Procurement authority at both RPC and direct-table boundaries ─────────

CREATE OR REPLACE FUNCTION public.guard_purchase_order_direct_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'purchase orders may only be created through create_purchase_order'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_purchase_order_direct_insert()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS aab_guard_purchase_order_direct_insert_trg ON public.purchase_orders;
CREATE TRIGGER aab_guard_purchase_order_direct_insert_trg
BEFORE INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_direct_insert();

CREATE OR REPLACE FUNCTION public.guard_project_ffe_purchase_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_document public.project_commercial_documents%ROWTYPE;
  v_snapshot public.furnishing_authorization_items%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_commercial_document_id IS NOT NULL AND (
      NEW.source_commercial_document_id IS DISTINCT FROM OLD.source_commercial_document_id
      OR NEW.source_authorization_item_id IS DISTINCT FROM OLD.source_authorization_item_id
    ) THEN
      RAISE EXCEPTION 'furnishing authorization provenance is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Legacy-origin projects retain the existing 00186 behavior.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind = 'design_services'
  ) THEN RETURN NEW; END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = NEW.source_commercial_document_id
    AND project_id = NEW.project_id
    AND document_kind = 'furnishings_authorization';
  SELECT * INTO v_snapshot FROM public.furnishing_authorization_items
  WHERE id = NEW.source_authorization_item_id
    AND commercial_document_id = v_document.id;
  IF v_document.id IS NULL OR v_snapshot.id IS NULL
     OR v_document.executed_at IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.proposals p WHERE p.id = v_document.proposal_id
         AND p.commercial_state = 'executed'
     )
  THEN
    RAISE EXCEPTION 'FF&E item is not covered by an executed furnishing authorization'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.quantity IS DISTINCT FROM v_snapshot.quantity
     OR NEW.unit_price_cents IS DISTINCT FROM v_snapshot.client_unit_price_cents
     OR NEW.line_total_cents IS DISTINCT FROM v_snapshot.client_line_total_cents
  THEN
    RAISE EXCEPTION 'FF&E quantity or client price differs from its signed snapshot'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_document.deposit_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id
      AND i.status = 'paid' AND i.amount_paid_cents >= i.total_cents
  ) THEN
    RAISE EXCEPTION 'furnishings deposit invoice must be paid before purchase ordering'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_ffe_purchase_authority()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS aab_guard_project_ffe_purchase_authority_trg
  ON public.project_ffe_items;
CREATE TRIGGER aab_guard_project_ffe_purchase_authority_trg
BEFORE INSERT OR UPDATE
ON public.project_ffe_items
FOR EACH ROW EXECUTE FUNCTION public.guard_project_ffe_purchase_authority();

-- ── Client-safe commercial reads (never expose trade cost or raw time) ─────

CREATE OR REPLACE FUNCTION public.get_project_authority_summary(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_currency text := 'USD';
  v_accrued bigint := 0;
  v_invoiced bigint := 0;
  v_pending bigint := 0;
  v_retainer_paid_cents bigint := 0;
  v_active_rate_version integer := 1;
  v_billing_through timestamptz;
  v_state text;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_authority FROM public.project_billing_authorities
  WHERE project_id = p_project_id
  ORDER BY effective_at DESC, id DESC LIMIT 1;
  IF v_authority.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(t.currency, 'USD'), COALESCE(t.current_rate_version, 1)
  INTO v_currency, v_active_rate_version
  FROM public.proposal_service_terms t
  WHERE t.proposal_id = v_authority.source_proposal_id;

  SELECT
    COALESCE(sum(rated_amount_cents) FILTER (WHERE billing_state = 'authorized'), 0),
    COALESCE(sum(rated_amount_cents) FILTER (WHERE billing_state = 'pending_authorization'), 0),
    COALESCE(sum(rated_amount_cents) FILTER (
      WHERE billing_state = 'authorized' AND invoice_id IS NOT NULL
        AND invoice_status IS DISTINCT FROM 'void'
    ), 0),
    max(started_at) FILTER (
      WHERE billing_state = 'authorized' AND invoice_id IS NOT NULL
        AND invoice_status IS DISTINCT FROM 'void'
    )
  INTO v_accrued, v_pending, v_invoiced, v_billing_through
  FROM (
    SELECT te.*, invoice.status AS invoice_status
    FROM public.project_time_entries te
    LEFT JOIN public.invoices invoice ON invoice.id = te.invoice_id
    WHERE te.billing_authority_id = v_authority.id AND te.billable
      AND te.duration_minutes IS NOT NULL
  ) rated;

  IF v_authority.retainer_invoice_id IS NOT NULL THEN
    SELECT least(COALESCE(i.amount_paid_cents, 0), v_authority.retainer_amount_cents)
    INTO v_retainer_paid_cents
    FROM public.invoices i WHERE i.id = v_authority.retainer_invoice_id;
  END IF;
  v_retainer_paid_cents := COALESCE(v_retainer_paid_cents, 0);
  v_state := CASE
    WHEN v_authority.status = 'superseded' THEN 'superseded'
    WHEN v_authority.status = 'exhausted'
      OR v_accrued >= v_authority.billing_ceiling_cents THEN 'exhausted'
    WHEN v_authority.retainer_activation_policy = 'retainer_paid'
      AND v_retainer_paid_cents < v_authority.retainer_amount_cents
      THEN 'retainer_pending'
    ELSE 'active'
  END;

  RETURN jsonb_build_object(
    'id', v_authority.id,
    'projectId', v_authority.project_id,
    'agreementId', v_authority.source_proposal_id,
    'state', v_state,
    'currency', v_currency,
    'ceilingCents', v_authority.billing_ceiling_cents,
    'authorizedCents', v_authority.billing_ceiling_cents,
    'accruedCents', v_accrued,
    'invoicedCents', v_invoiced,
    'pendingAuthorizationCents', v_pending,
    'remainingCents', greatest(v_authority.billing_ceiling_cents - v_accrued, 0),
    'retainerAmountCents', v_authority.retainer_amount_cents,
    'retainerPaidCents', v_retainer_paid_cents,
    'retainerActivationPolicy', v_authority.retainer_activation_policy,
    'activeRateVersion', v_active_rate_version,
    'billingThrough', v_billing_through,
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'proposalId', v_authority.source_proposal_id,
      'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents,
      'effectiveAt', source.effective_at
    ) ORDER BY r.version DESC, r.role_name) FROM public.project_billing_authority_rates r
      JOIN public.proposal_service_rates source ON source.id = r.source_rate_id
      WHERE r.billing_authority_id = v_authority.id), '[]'::jsonb),
    'includesRawEntries', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_project_authority_summary(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_authority_summary(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_client_commercial_document_bundle(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR auth.uid() IS NULL OR v_proposal.document_kind = 'legacy' OR NOT (
    v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_proposal.designer_id)
  ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
     AND v_proposal.commercial_state = 'draft' THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id;

  RETURN jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_proposal.id, 'projectId', COALESCE(v_document.project_id, v_proposal.project_id),
      'designerId', v_proposal.designer_id, 'clientId', v_proposal.client_id,
      'title', v_proposal.title, 'description', v_proposal.description,
      'documentKind', v_proposal.document_kind,
      'commercialState', v_proposal.commercial_state,
      'status', v_proposal.status, 'totalAmountCents', v_proposal.total_amount,
      'depositPercent', v_proposal.deposit_percent,
      'validUntil', v_proposal.valid_until, 'sentAt', v_proposal.sent_at,
      'executedAt', v_document.executed_at,
      'supersededAt', v_proposal.superseded_at,
      'supersededReason', v_proposal.superseded_reason,
      'replacementProposalId', v_proposal.replacement_proposal_id,
      'createdAt', v_proposal.created_at, 'updatedAt', v_proposal.updated_at
    ),
    'serviceTerms', (SELECT jsonb_build_object(
      'scope', t.scope, 'deliverables', t.deliverables, 'exclusions', t.exclusions,
      'billingCeilingCents', t.billing_ceiling_cents,
      'retainerAmountCents', t.retainer_amount_cents,
      'retainerActivationPolicy', t.retainer_activation_policy,
      'billingCadence', t.billing_cadence, 'currency', t.currency,
      'terms', t.terms, 'currentRateVersion', t.current_rate_version
    ) FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id),
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents, 'sortOrder', r.sort_order,
      'effectiveAt', r.effective_at
    ) ORDER BY r.version DESC, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id), '[]'::jsonb),
    'signatures', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'partyRole', s.party_role, 'signerUserId', s.signer_user_id,
      'signedName', s.signed_name, 'signedAt', s.signed_at,
      'evidenceFingerprint', s.evidence_fingerprint
    ) ORDER BY s.signed_at, s.id) FROM public.commercial_document_signatures s
      WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
    'furnishings', CASE WHEN v_document.document_kind = 'furnishings_authorization'
      THEN jsonb_build_object(
        'documentId', v_document.id, 'waveName', v_document.wave_name,
        'budgetCheckpointId', v_document.budget_checkpoint_id,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'roomName', a.room_name,
          'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
          'clientUnitPriceCents', a.client_unit_price_cents,
          'clientLineTotalCents', a.client_line_total_cents, 'sortOrder', a.sort_order
        ) ORDER BY a.sort_order, a.id) FROM public.furnishing_authorization_items a
          WHERE a.commercial_document_id = v_document.id), '[]'::jsonb)
      ) ELSE NULL END,
    'replacement', (SELECT jsonb_build_object(
      'id', replacement.id, 'title', replacement.title,
      'documentKind', replacement.document_kind,
      'commercialState', replacement.commercial_state
    ) FROM public.proposals replacement WHERE replacement.id = v_proposal.replacement_proposal_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  TO authenticated;

-- Service-only cutover: unsigned legacy editions may be retired, but accepted
-- rows and every historical signature remain untouched.
CREATE OR REPLACE FUNCTION public.supersede_unsigned_legacy_proposals(
  p_proposal_ids uuid[],
  p_replacement_proposal_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Replaced by design-services commercial rail'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
  v_previous text := current_setting('app.commercial_cutover_id', true);
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'legacy commercial cutover requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'legacy commercial cutover requires a reason'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_replacement_proposal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.proposals p WHERE p.id = p_replacement_proposal_id
      AND p.document_kind <> 'legacy'
  ) THEN
    RAISE EXCEPTION 'replacement proposal must be a commercial edition'
      USING ERRCODE = 'check_violation';
  END IF;
  FOREACH v_id IN ARRAY COALESCE(p_proposal_ids, '{}'::uuid[])
  LOOP
    PERFORM set_config('app.commercial_cutover_id', v_id::text, true);
    UPDATE public.proposals SET
      commercial_state = 'superseded', superseded_at = now(),
      superseded_reason = btrim(p_reason),
      replacement_proposal_id = p_replacement_proposal_id,
      updated_at = now()
    WHERE id = v_id AND document_kind = 'legacy'
      AND status <> 'accepted' AND signed_at IS NULL AND accepted_at IS NULL
      AND project_id IS NULL AND commercial_state IS DISTINCT FROM 'superseded';
    v_count := v_count + CASE WHEN FOUND THEN 1 ELSE 0 END;
  END LOOP;
  PERFORM set_config('app.commercial_cutover_id', COALESCE(v_previous, ''), true);
  RETURN jsonb_build_object(
    'supersededCount', v_count,
    'replacementProposalId', p_replacement_proposal_id
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_cutover_id', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.supersede_unsigned_legacy_proposals(uuid[], uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supersede_unsigned_legacy_proposals(uuid[], uuid, text)
  TO service_role;

COMMENT ON TABLE public.project_billing_authorities IS
  'Signed design-services billing ceilings and retainer/cadence policy. Internal invoices remain the payment source of truth.';
COMMENT ON TABLE public.project_budget_checkpoints IS
  'Frozen planning acknowledgements or audited overrides. Never purchasing authority.';
COMMENT ON TABLE public.furnishing_authorization_items IS
  'Immutable named-wave snapshots. Client reads are curated by RPC so trade cost never crosses the boundary.';
