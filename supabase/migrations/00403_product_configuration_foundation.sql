-- ═══════════════════════════════════════════════════════════════════════════
-- 00403 — Furniture configuration and custom-commission foundation
--
-- Extends one reusable Product master into four backward-compatible modes:
-- standard, finite variants, rule-based configuration, and custom commission.
-- Exact sellable variants are materialized; modular/custom combinations stay
-- rule-driven so a sectional or cabinet program does not explode into every
-- theoretical SKU permutation.
--
-- Saved configurations are version rows with frozen, hash-addressed snapshots.
-- Approved/issued versions cannot be edited. Project placement copies the
-- snapshot into project_ffe_specs so later source-library edits never silently
-- change an approved specification, quote, PO, or issued spec book.
--
-- place_product_in_project lineage: 00380 remains untouched. The configuration
-- path composes it through a separately named RPC to avoid PostgREST overload
-- ambiguity for every existing six-argument caller.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Product-family capability ──────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS configuration_mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS configuration_pricing_strategy text NOT NULL DEFAULT 'base_plus_adjustments',
  ADD COLUMN IF NOT EXISTS configuration_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS configuration_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS configuration_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_configuration_mode_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_configuration_mode_check
  CHECK (configuration_mode IN ('standard', 'variant', 'configured', 'custom'));

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_configuration_revision_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_configuration_revision_check
  CHECK (configuration_revision > 0);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_configuration_pricing_strategy_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_configuration_pricing_strategy_check
  CHECK (configuration_pricing_strategy IN ('base_plus_adjustments', 'component_sum'));

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_configuration_summary_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_configuration_summary_check
  CHECK (jsonb_typeof(configuration_summary) = 'object');

COMMENT ON COLUMN public.products.configuration_mode IS
  'Furniture sellability model. standard preserves every pre-00403 flat product; variant materializes finite sellable SKUs; configured applies options/components/rules; custom adds commission revisions.';
COMMENT ON COLUMN public.products.configuration_revision IS
  'Optimistic-concurrency revision for the reusable configuration definition. Incremented only by upsert_product_configuration_schema.';

-- ── Reusable option/variant/component/rule definition ──────────────────────
CREATE TABLE IF NOT EXISTS public.product_option_groups (
  id                uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  code              text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  name              text NOT NULL CHECK (length(btrim(name)) > 0),
  description       text,
  selection_type    text NOT NULL DEFAULT 'single'
                    CHECK (selection_type IN ('single', 'multiple')),
  required          boolean NOT NULL DEFAULT true,
  min_selections    integer NOT NULL DEFAULT 1 CHECK (min_selections >= 0),
  max_selections    integer NOT NULL DEFAULT 1 CHECK (max_selections > 0),
  position          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, code),
  CHECK (min_selections <= max_selections),
  CHECK (selection_type = 'multiple' OR max_selections = 1),
  CHECK (NOT required OR min_selections > 0)
);

CREATE TABLE IF NOT EXISTS public.product_option_values (
  id                       uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  option_group_id          uuid NOT NULL REFERENCES public.product_option_groups(id) ON DELETE CASCADE,
  code                     text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  label                    text NOT NULL CHECK (length(btrim(label)) > 0),
  description              text,
  swatch                   jsonb CHECK (swatch IS NULL OR jsonb_typeof(swatch) = 'object'),
  media                    jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(media) = 'array'),
  retail_price_delta_cents integer NOT NULL DEFAULT 0,
  trade_price_delta_cents  integer NOT NULL DEFAULT 0,
  lead_time_delta_weeks    integer NOT NULL DEFAULT 0,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  position                 integer NOT NULL DEFAULT 0,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (option_group_id, code)
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  code                text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  name                text NOT NULL CHECK (length(btrim(name)) > 0),
  sku                 text,
  vendor_sku          text,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('draft', 'active', 'discontinued')),
  retail_price_cents  integer CHECK (retail_price_cents IS NULL OR retail_price_cents >= 0),
  trade_price_cents   integer CHECK (trade_price_cents IS NULL OR trade_price_cents >= 0),
  lead_time_weeks     integer CHECK (lead_time_weeks IS NULL OR lead_time_weeks >= 0),
  dimensions          jsonb CHECK (dimensions IS NULL OR jsonb_typeof(dimensions) = 'object'),
  weight              jsonb CHECK (weight IS NULL OR jsonb_typeof(weight) = 'object'),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  is_default          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_default
  ON public.product_variants(product_id) WHERE is_default AND status <> 'discontinued';
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_sku
  ON public.product_variants(product_id, sku) WHERE sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.product_variant_values (
  variant_id       uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  option_value_id  uuid NOT NULL REFERENCES public.product_option_values(id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant_id, option_value_id)
);

CREATE TABLE IF NOT EXISTS public.product_components (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  code                text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  name                text NOT NULL CHECK (length(btrim(name)) > 0),
  description         text,
  component_type      text NOT NULL DEFAULT 'module'
                      CHECK (component_type IN ('module', 'part', 'service', 'custom')),
  handedness          text NOT NULL DEFAULT 'none'
                      CHECK (handedness IN ('none', 'left', 'right', 'either')),
  min_quantity        integer NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  max_quantity        integer CHECK (max_quantity IS NULL OR max_quantity >= 0),
  default_quantity    integer NOT NULL DEFAULT 0 CHECK (default_quantity >= 0),
  retail_price_cents  integer NOT NULL DEFAULT 0 CHECK (retail_price_cents >= 0),
  trade_price_cents   integer NOT NULL DEFAULT 0 CHECK (trade_price_cents >= 0),
  lead_time_weeks     integer NOT NULL DEFAULT 0 CHECK (lead_time_weeks >= 0),
  dimensions          jsonb CHECK (dimensions IS NULL OR jsonb_typeof(dimensions) = 'object'),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  position            integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, code),
  CHECK (max_quantity IS NULL OR min_quantity <= max_quantity),
  CHECK (default_quantity >= min_quantity),
  CHECK (max_quantity IS NULL OR default_quantity <= max_quantity)
);

CREATE TABLE IF NOT EXISTS public.product_configuration_rules (
  id          uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  rule_type   text NOT NULL CHECK (
                rule_type IN ('compatibility', 'requirement', 'exclusion', 'pricing', 'lead_time', 'dimension')
              ),
  condition   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(condition) = 'object'),
  effect      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(effect) = 'object'),
  message     text,
  priority    integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, code)
);

CREATE INDEX IF NOT EXISTS idx_product_option_groups_product
  ON public.product_option_groups(product_id, position);
CREATE INDEX IF NOT EXISTS idx_product_option_values_group
  ON public.product_option_values(option_group_id, position);
CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON public.product_variants(product_id, status);
CREATE INDEX IF NOT EXISTS idx_product_components_product
  ON public.product_components(product_id, position);
CREATE INDEX IF NOT EXISTS idx_product_configuration_rules_product
  ON public.product_configuration_rules(product_id, priority, code);

-- ── Versioned saved configurations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_configurations (
  id                        uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  configuration_key         uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  product_id                uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_variant_id        uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  previous_configuration_id uuid REFERENCES public.product_configurations(id) ON DELETE RESTRICT,
  project_id                uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  ffe_item_id               uuid REFERENCES public.project_ffe_items(id) ON DELETE RESTRICT,
  owner_user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  studio_id                 uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  version                   integer NOT NULL CHECK (version > 0),
  schema_revision           integer NOT NULL CHECK (schema_revision > 0),
  status                    text NOT NULL DEFAULT 'saved'
                            CHECK (status IN ('saved', 'approved', 'issued', 'superseded', 'archived')),
  name                      text,
  notes                     text,
  custom_brief              jsonb CHECK (custom_brief IS NULL OR jsonb_typeof(custom_brief) = 'object'),
  normalized_selection      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(normalized_selection) = 'object'),
  component_quantities      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(component_quantities) = 'object'),
  evaluation                jsonb NOT NULL CHECK (jsonb_typeof(evaluation) = 'object'),
  snapshot                  jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash             text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  is_complete               boolean NOT NULL DEFAULT false,
  is_valid                  boolean NOT NULL DEFAULT false,
  retail_price_cents        integer CHECK (retail_price_cents IS NULL OR retail_price_cents >= 0),
  trade_price_cents         integer CHECK (trade_price_cents IS NULL OR trade_price_cents >= 0),
  lead_time_weeks           integer CHECK (lead_time_weeks IS NULL OR lead_time_weeks >= 0),
  resolved_dimensions       jsonb CHECK (resolved_dimensions IS NULL OR jsonb_typeof(resolved_dimensions) = 'object'),
  is_library_template       boolean NOT NULL DEFAULT false,
  approved_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at               timestamptz,
  issued_at                 timestamptz,
  promoted_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (configuration_key, version),
  CHECK ((status <> 'approved' AND status <> 'issued') OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)),
  CHECK (project_id IS NOT NULL OR ffe_item_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_product_configurations_product
  ON public.product_configurations(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_configurations_project
  ON public.product_configurations(project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_configurations_library
  ON public.product_configurations(product_id, promoted_at DESC) WHERE is_library_template;

CREATE TABLE IF NOT EXISTS public.product_configuration_selections (
  configuration_id  uuid NOT NULL REFERENCES public.product_configurations(id) ON DELETE CASCADE,
  option_group_id   uuid NOT NULL REFERENCES public.product_option_groups(id) ON DELETE RESTRICT,
  option_value_id   uuid NOT NULL REFERENCES public.product_option_values(id) ON DELETE RESTRICT,
  selection_snapshot jsonb NOT NULL CHECK (jsonb_typeof(selection_snapshot) = 'object'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (configuration_id, option_value_id),
  UNIQUE (configuration_id, option_group_id, option_value_id)
);

CREATE TABLE IF NOT EXISTS public.product_configuration_components (
  configuration_id uuid NOT NULL REFERENCES public.product_configurations(id) ON DELETE CASCADE,
  component_id      uuid NOT NULL REFERENCES public.product_components(id) ON DELETE RESTRICT,
  quantity          integer NOT NULL CHECK (quantity > 0),
  handedness        text CHECK (handedness IS NULL OR handedness IN ('left', 'right')),
  component_snapshot jsonb NOT NULL CHECK (jsonb_typeof(component_snapshot) = 'object'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (configuration_id, component_id)
);

CREATE TABLE IF NOT EXISTS public.custom_commission_revisions (
  id                    uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  configuration_id      uuid NOT NULL REFERENCES public.product_configurations(id) ON DELETE CASCADE,
  revision_number       integer NOT NULL CHECK (revision_number > 0),
  previous_revision_id  uuid REFERENCES public.custom_commission_revisions(id) ON DELETE RESTRICT,
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'submitted', 'quoted', 'client_review', 'approved', 'issued', 'rejected', 'superseded')),
  brief                 jsonb NOT NULL CHECK (jsonb_typeof(brief) = 'object'),
  drawings              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(drawings) = 'array'),
  quote                 jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quote) = 'object'),
  provenance            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  transition_note       text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at          timestamptz,
  quoted_at             timestamptz,
  approved_at           timestamptz,
  issued_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (configuration_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_custom_commission_revisions_configuration
  ON public.custom_commission_revisions(configuration_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS public.custom_commission_milestones (
  id               uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  configuration_id uuid NOT NULL REFERENCES public.product_configurations(id) ON DELETE RESTRICT,
  revision_id      uuid NOT NULL REFERENCES public.custom_commission_revisions(id) ON DELETE RESTRICT,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  milestone_type   text NOT NULL CHECK (milestone_type IN ('submittal','receiving','installed')),
  status           text NOT NULL DEFAULT 'pending',
  evidence         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  artifacts        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(artifacts) = 'array'),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, milestone_type),
  CHECK (
    (milestone_type = 'submittal' AND status IN ('pending','approved','rejected'))
    OR (milestone_type = 'receiving' AND status IN ('pending','received','rejected'))
    OR (milestone_type = 'installed' AND status IN ('pending','installed','rejected'))
  ),
  CHECK ((status = 'pending' AND completed_at IS NULL) OR (status <> 'pending' AND completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_custom_commission_milestones_configuration
  ON public.custom_commission_milestones(configuration_id, created_at);
CREATE INDEX IF NOT EXISTS idx_custom_commission_milestones_project
  ON public.custom_commission_milestones(project_id, created_at);

CREATE TABLE IF NOT EXISTS public.custom_commission_milestone_events (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  milestone_id    uuid NOT NULL REFERENCES public.custom_commission_milestones(id) ON DELETE RESTRICT,
  event_number    integer NOT NULL CHECK (event_number > 0),
  from_status     text,
  to_status       text NOT NULL,
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  artifacts       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(artifacts) = 'array'),
  note            text,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, event_number)
);

CREATE INDEX IF NOT EXISTS idx_custom_commission_milestone_events_milestone
  ON public.custom_commission_milestone_events(milestone_id, event_number);

ALTER TABLE public.custom_commission_revisions
  DROP CONSTRAINT IF EXISTS custom_commission_revision_timestamp_coherence;
ALTER TABLE public.custom_commission_revisions
  ADD CONSTRAINT custom_commission_revision_timestamp_coherence CHECK (
    (status NOT IN ('submitted','quoted','client_review','approved','issued') OR submitted_at IS NOT NULL)
    AND (status NOT IN ('quoted','client_review','approved','issued') OR quoted_at IS NOT NULL)
    AND (status NOT IN ('approved','issued') OR approved_at IS NOT NULL)
    AND (status <> 'issued' OR issued_at IS NOT NULL)
  );

-- Durable project-selection snapshot. A locked snapshot is never rewritten.
ALTER TABLE public.project_ffe_specs
  ADD COLUMN IF NOT EXISTS configuration_id uuid
    REFERENCES public.product_configurations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS configuration_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS configuration_locked_at timestamptz;

ALTER TABLE public.project_ffe_specs
  DROP CONSTRAINT IF EXISTS project_ffe_specs_configuration_snapshot_check;
ALTER TABLE public.project_ffe_specs
  ADD CONSTRAINT project_ffe_specs_configuration_snapshot_check
  CHECK (jsonb_typeof(configuration_snapshot) = 'object');
ALTER TABLE public.project_ffe_specs
  DROP CONSTRAINT IF EXISTS project_ffe_specs_configuration_hash_check;
ALTER TABLE public.project_ffe_specs
  ADD CONSTRAINT project_ffe_specs_configuration_hash_check
  CHECK (configuration_snapshot_hash IS NULL OR configuration_snapshot_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.project_ffe_specs
  DROP CONSTRAINT IF EXISTS project_ffe_specs_configuration_lock_coherence;
ALTER TABLE public.project_ffe_specs
  ADD CONSTRAINT project_ffe_specs_configuration_lock_coherence
  CHECK (
    configuration_locked_at IS NULL
    OR (configuration_id IS NOT NULL AND configuration_snapshot_hash IS NOT NULL AND configuration_snapshot <> '{}'::jsonb)
  );

CREATE INDEX IF NOT EXISTS idx_project_ffe_specs_configuration
  ON public.project_ffe_specs(configuration_id) WHERE configuration_id IS NOT NULL;

-- RFQ drafts carry the same frozen configuration as the later project line.
-- Existing generic quote requests remain valid because every new link is nullable.
ALTER TABLE public.vendor_quote_requests
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS configuration_id uuid REFERENCES public.product_configurations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS configuration_snapshot_hash text;

ALTER TABLE public.vendor_quote_requests
  DROP CONSTRAINT IF EXISTS vendor_quote_requests_configuration_snapshot_check;
ALTER TABLE public.vendor_quote_requests
  ADD CONSTRAINT vendor_quote_requests_configuration_snapshot_check
  CHECK (jsonb_typeof(configuration_snapshot) = 'object');
ALTER TABLE public.vendor_quote_requests
  DROP CONSTRAINT IF EXISTS vendor_quote_requests_configuration_hash_check;
ALTER TABLE public.vendor_quote_requests
  ADD CONSTRAINT vendor_quote_requests_configuration_hash_check
  CHECK (configuration_snapshot_hash IS NULL OR configuration_snapshot_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.vendor_quote_requests
  DROP CONSTRAINT IF EXISTS vendor_quote_requests_configuration_coherence;
ALTER TABLE public.vendor_quote_requests
  ADD CONSTRAINT vendor_quote_requests_configuration_coherence
  CHECK (
    configuration_id IS NULL
    OR (project_id IS NOT NULL AND configuration_snapshot <> '{}'::jsonb AND configuration_snapshot_hash IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_vendor_quote_requests_project
  ON public.vendor_quote_requests(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_quote_requests_configuration
  ON public.vendor_quote_requests(configuration_id) WHERE configuration_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_quote_requests_configuration_draft
  ON public.vendor_quote_requests(configuration_id, vendor_id)
  WHERE configuration_id IS NOT NULL AND status = 'draft';

-- ── Security helpers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._can_read_configurable_product(
  p_product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (select auth.uid()) IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.profiles actor WHERE actor.id = (select auth.uid()) AND actor.is_designer)
      OR EXISTS (
        SELECT 1 FROM public.organization_members om
        JOIN public.organizations o ON o.id = om.organization_id
        WHERE om.user_id = (select auth.uid()) AND om.status = 'active' AND om.role <> 'guest'
          AND o.type = 'design_studio' AND o.status = 'active'
      )
    ) AND EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = p_product_id
      AND p.deleted_at IS NULL
      AND p.merged_into_id IS NULL
      AND (
        p.layer = 'catalog'
        OR (p.layer = 'personal' AND p.owner_user_id = (select auth.uid()))
        OR (
          p.layer = 'studio'
          AND EXISTS (
            SELECT 1 FROM public.organization_members om
            JOIN public.organizations o ON o.id = om.organization_id
            WHERE om.organization_id = p.studio_id
              AND om.user_id = (select auth.uid())
              AND om.status = 'active'
              AND om.role <> 'guest'
              AND o.type = 'design_studio'
              AND o.status = 'active'
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public._can_manage_configurable_product(
  p_product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (select auth.uid()) IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.profiles actor WHERE actor.id = (select auth.uid()) AND actor.is_designer)
      OR EXISTS (
        SELECT 1 FROM public.organization_members om
        JOIN public.organizations o ON o.id = om.organization_id
        WHERE om.user_id = (select auth.uid()) AND om.status = 'active' AND om.role <> 'guest'
          AND o.type = 'design_studio' AND o.status = 'active'
      )
    ) AND EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = p_product_id
      AND p.deleted_at IS NULL
      AND p.merged_into_id IS NULL
      AND (
        (p.layer = 'personal' AND p.owner_user_id = (select auth.uid()))
        OR (
          p.layer = 'studio'
          AND EXISTS (
            SELECT 1 FROM public.organization_members om
            JOIN public.organizations o ON o.id = om.organization_id
            WHERE om.organization_id = p.studio_id
              AND om.user_id = (select auth.uid())
              AND om.status = 'active'
              AND om.role <> 'guest'
              AND o.type = 'design_studio'
              AND o.status = 'active'
          )
        )
        OR (p.layer = 'catalog' AND public.user_has_role((select auth.uid()), 'super_admin'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public._can_access_product_configuration(
  p_configuration_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (select auth.uid()) IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.profiles actor WHERE actor.id = (select auth.uid()) AND actor.is_designer)
      OR EXISTS (
        SELECT 1 FROM public.organization_members actor_membership
        JOIN public.organizations actor_organization
          ON actor_organization.id = actor_membership.organization_id
        WHERE actor_membership.user_id = (select auth.uid())
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
          AND actor_organization.type = 'design_studio'
          AND actor_organization.status = 'active'
      )
    ) AND EXISTS (
    SELECT 1
    FROM public.product_configurations c
    WHERE c.id = p_configuration_id
      AND (
        c.owner_user_id = (select auth.uid())
        OR (
          c.studio_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.organization_members om
            JOIN public.organizations o ON o.id = om.organization_id
            WHERE om.organization_id = c.studio_id
              AND om.user_id = (select auth.uid())
              AND om.status = 'active'
              AND om.role <> 'guest'
              AND o.type = 'design_studio'
              AND o.status = 'active'
          )
        )
        OR (
          c.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = c.project_id
              AND public.is_design_studio_comember(p.designer_id)
          )
        )
      )
  );
$$;

-- Exact variants cannot accidentally bind an option from a different product.
CREATE OR REPLACE FUNCTION public.product_variant_value_same_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_variant_product uuid;
  v_value_product uuid;
BEGIN
  SELECT product_id INTO v_variant_product
  FROM public.product_variants WHERE id = NEW.variant_id;
  SELECT g.product_id INTO v_value_product
  FROM public.product_option_values v
  JOIN public.product_option_groups g ON g.id = v.option_group_id
  WHERE v.id = NEW.option_value_id;
  IF v_variant_product IS DISTINCT FROM v_value_product THEN
    RAISE EXCEPTION 'variant and option value must belong to the same product'
      USING errcode = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_variant_value_same_product ON public.product_variant_values;
CREATE TRIGGER trg_product_variant_value_same_product
  BEFORE INSERT OR UPDATE ON public.product_variant_values
  FOR EACH ROW EXECUTE FUNCTION public.product_variant_value_same_product();

CREATE OR REPLACE FUNCTION public.guard_product_configuration_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_valid_ffe_binding boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'issued', 'superseded', 'archived') THEN
      RAISE EXCEPTION 'configuration version % is immutable (%)', OLD.id, OLD.status
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('superseded', 'archived') THEN
    RAISE EXCEPTION 'configuration version % is immutable (%)', OLD.id, OLD.status
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW.ffe_item_id IS DISTINCT FROM OLD.ffe_item_id THEN
    v_valid_ffe_binding := OLD.ffe_item_id IS NULL
      AND NEW.ffe_item_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.project_ffe_items item
        WHERE item.id = NEW.ffe_item_id
          AND item.product_id = NEW.product_id
          AND (NEW.project_id IS NULL OR item.project_id = NEW.project_id)
      );
    IF NOT v_valid_ffe_binding THEN
      RAISE EXCEPTION 'configuration may bind once to a matching project FF&E line'
        USING errcode = 'check_violation';
    END IF;
  END IF;
  IF OLD.status IN ('approved', 'issued') AND
     (to_jsonb(NEW) - ARRAY['status','name','updated_at','issued_at','is_library_template','promoted_at','ffe_item_id'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','name','updated_at','issued_at','is_library_template','promoted_at','ffe_item_id']) THEN
    RAISE EXCEPTION 'approved or issued configuration snapshots are immutable'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'issued', 'superseded') THEN
    RAISE EXCEPTION 'invalid approved configuration transition to %', NEW.status
      USING errcode = 'check_violation';
  END IF;
  IF OLD.status = 'issued' AND NEW.status NOT IN ('issued', 'superseded') THEN
    RAISE EXCEPTION 'invalid issued configuration transition to %', NEW.status
      USING errcode = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_configuration_immutability ON public.product_configurations;
CREATE TRIGGER trg_product_configuration_immutability
  BEFORE UPDATE OR DELETE ON public.product_configurations
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_configuration_immutability();

CREATE OR REPLACE FUNCTION public.guard_custom_commission_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'submitted custom commission revisions are immutable'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('issued', 'rejected', 'superseded') THEN
    RAISE EXCEPTION 'terminal custom commission revision is immutable (%)', OLD.status
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW.status = 'superseded' AND OLD.status IN ('draft', 'submitted', 'quoted', 'client_review') THEN
    IF (to_jsonb(NEW) - ARRAY['status','transition_note','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','transition_note','updated_at']) THEN
      RAISE EXCEPTION 'revision supersede may only change lifecycle metadata'
        USING errcode = 'check_violation';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF OLD.status = 'submitted' AND (
    NEW.status <> 'quoted'
    OR (to_jsonb(NEW) - ARRAY['status','quote','quoted_at','transition_note','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','quote','quoted_at','transition_note','updated_at'])
  ) THEN
    RAISE EXCEPTION 'submitted revisions may only accept a quote'
      USING errcode = 'check_violation';
  END IF;
  IF OLD.status = 'quoted' AND (
    NEW.status <> 'client_review'
    OR (to_jsonb(NEW) - ARRAY['status','transition_note','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','transition_note','updated_at'])
  ) THEN
    RAISE EXCEPTION 'quoted revisions may only move to client review'
      USING errcode = 'check_violation';
  END IF;
  IF OLD.status = 'client_review' AND NEW.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'client review must resolve to approved or rejected'
      USING errcode = 'check_violation';
  END IF;
  IF OLD.status = 'client_review' AND (
    (to_jsonb(NEW) - ARRAY['status','brief','approved_by','approved_at','transition_note','updated_at'])
      IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status','brief','approved_by','approved_at','transition_note','updated_at'])
    OR (NEW.brief - ARRAY['designerApproval','clientApproval'])
      IS DISTINCT FROM (OLD.brief - ARRAY['designerApproval','clientApproval'])
  ) THEN
    RAISE EXCEPTION 'approval may only change approval metadata'
      USING errcode = 'check_violation';
  END IF;
  IF OLD.status = 'approved' AND (
    NEW.status <> 'issued'
    OR (to_jsonb(NEW) - ARRAY['status','issued_at','transition_note','updated_at'])
      IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status','issued_at','transition_note','updated_at'])
  ) THEN
    RAISE EXCEPTION 'approved custom commission may only be issued'
      USING errcode = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_custom_commission_revision_guard ON public.custom_commission_revisions;
CREATE TRIGGER trg_custom_commission_revision_guard
  BEFORE UPDATE OR DELETE ON public.custom_commission_revisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_commission_revision();

CREATE OR REPLACE FUNCTION public.guard_custom_commission_milestone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'custom commission milestone history is append-preserved'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'custom commission milestones may only change through workflow RPCs'
      USING errcode = 'insufficient_privilege';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_custom_commission_milestone ON public.custom_commission_milestones;
CREATE TRIGGER trg_guard_custom_commission_milestone
  BEFORE UPDATE OR DELETE ON public.custom_commission_milestones
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_commission_milestone();

CREATE OR REPLACE FUNCTION public.guard_custom_commission_milestone_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'custom commission milestone events are immutable'
    USING errcode = 'object_not_in_prerequisite_state';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_custom_commission_milestone_event
  ON public.custom_commission_milestone_events;
CREATE TRIGGER trg_guard_custom_commission_milestone_event
  BEFORE UPDATE OR DELETE ON public.custom_commission_milestone_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_commission_milestone_event();

CREATE OR REPLACE FUNCTION public.guard_project_configuration_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.configuration_locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'locked project configuration specifications cannot be deleted'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
  END IF;
  IF current_user = 'postgres'
     AND current_setting('patina.configuration_spec_workflow', true) = '00403' THEN
    RETURN NEW;
  END IF;
  IF NEW.configuration_id IS DISTINCT FROM OLD.configuration_id
     OR NEW.configuration_snapshot IS DISTINCT FROM OLD.configuration_snapshot
     OR NEW.configuration_snapshot_hash IS DISTINCT FROM OLD.configuration_snapshot_hash
     OR NEW.configuration_locked_at IS DISTINCT FROM OLD.configuration_locked_at THEN
    RAISE EXCEPTION 'configuration linkage may only change through configuration workflow RPCs'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF OLD.configuration_locked_at IS NOT NULL AND (
    NEW.configuration_id IS DISTINCT FROM OLD.configuration_id
    OR NEW.configuration_snapshot IS DISTINCT FROM OLD.configuration_snapshot
    OR NEW.configuration_snapshot_hash IS DISTINCT FROM OLD.configuration_snapshot_hash
    OR NEW.configuration_locked_at IS DISTINCT FROM OLD.configuration_locked_at
    OR NEW.sku IS DISTINCT FROM OLD.sku
    OR NEW.finish IS DISTINCT FROM OLD.finish
    OR NEW.material IS DISTINCT FROM OLD.material
    OR NEW.color_fabric IS DISTINCT FROM OLD.color_fabric
    OR NEW.selected_dimensions IS DISTINCT FROM OLD.selected_dimensions
    OR NEW.routing_source->'configurationVersion' IS DISTINCT FROM OLD.routing_source->'configurationVersion'
    OR NEW.routing_source->'configurationSnapshotHash' IS DISTINCT FROM OLD.routing_source->'configurationSnapshotHash'
    OR NEW.routing_source->'configurationHistory' IS DISTINCT FROM OLD.routing_source->'configurationHistory'
  ) THEN
    RAISE EXCEPTION 'project configuration snapshot is locked; create a new selection revision'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_configuration_snapshot ON public.project_ffe_specs;
CREATE TRIGGER trg_project_configuration_snapshot
  BEFORE UPDATE OR DELETE ON public.project_ffe_specs
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_configuration_snapshot();

CREATE OR REPLACE FUNCTION public.guard_project_ffe_configuration_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_spec public.project_ffe_specs;
  v_configuration public.product_configurations;
  v_project public.projects;
  v_mode text;
  v_expected_unit integer;
  v_expected_trade integer;
  v_snapshot_retail integer;
  v_snapshot_trade integer;
  v_sku text;
  v_material text;
  v_finish text;
BEGIN
  SELECT * INTO v_spec
  FROM public.project_ffe_specs WHERE ffe_item_id = OLD.id FOR UPDATE;
  IF NOT FOUND OR v_spec.configuration_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_spec.configuration_locked_at IS NOT NULL AND (
    NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price_cents IS DISTINCT FROM OLD.unit_price_cents
    OR NEW.trade_price_cents IS DISTINCT FROM OLD.trade_price_cents
    OR NEW.line_total_cents IS DISTINCT FROM OLD.line_total_cents
  ) THEN
    RAISE EXCEPTION 'configuration-derived project line fields are locked; create a configuration revision'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required to approve a configured project line'
      USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = NEW.project_id FOR SHARE;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT public._can_access_product_configuration(v_spec.configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT c.*
  INTO v_configuration
  FROM public.product_configurations c
  WHERE c.id = v_spec.configuration_id
  FOR UPDATE OF c;
  SELECT configuration_mode INTO v_mode
  FROM public.products WHERE id = v_configuration.product_id;
  IF v_configuration.product_id IS DISTINCT FROM NEW.product_id
     OR (v_configuration.project_id IS NOT NULL AND v_configuration.project_id <> NEW.project_id)
     OR (v_configuration.ffe_item_id IS NOT NULL AND v_configuration.ffe_item_id <> NEW.id) THEN
    RAISE EXCEPTION 'configuration, project, product, and FF&E line do not agree'
      USING errcode = 'check_violation';
  END IF;
  IF NOT v_configuration.is_valid OR NOT v_configuration.is_complete THEN
    RAISE EXCEPTION 'configuration must be valid and complete before project approval'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_spec.configuration_snapshot IS DISTINCT FROM v_configuration.snapshot
     OR v_spec.configuration_snapshot_hash IS DISTINCT FROM v_configuration.snapshot_hash
     OR v_configuration.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_configuration.snapshot) THEN
    RAISE EXCEPTION 'configuration snapshot or hash does not match its approved source'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  v_snapshot_retail := NULLIF(v_configuration.snapshot->>'retailPriceCents', '')::integer;
  v_snapshot_trade := NULLIF(v_configuration.snapshot->>'tradePriceCents', '')::integer;
  IF v_snapshot_retail IS DISTINCT FROM v_configuration.retail_price_cents
     OR v_snapshot_trade IS DISTINCT FROM v_configuration.trade_price_cents THEN
    RAISE EXCEPTION 'configuration commercial columns diverge from the immutable snapshot'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_mode = 'custom' THEN
    IF v_configuration.status NOT IN ('approved', 'issued') THEN
      RAISE EXCEPTION 'custom commission must complete its approval workflow first'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
  ELSIF v_configuration.status = 'saved' THEN
    UPDATE public.product_configurations
    SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
    WHERE id = v_configuration.id;
  ELSIF v_configuration.status NOT IN ('approved', 'issued') THEN
    RAISE EXCEPTION 'configuration cannot be approved from status %', v_configuration.status
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  v_expected_unit := COALESCE(v_snapshot_retail, v_snapshot_trade);
  v_expected_trade := COALESCE(v_snapshot_trade, v_snapshot_retail);
  NEW.unit_price_cents := v_expected_unit;
  NEW.trade_price_cents := v_expected_trade;
  NEW.line_total_cents := CASE WHEN v_expected_unit IS NULL THEN NULL
    ELSE NEW.quantity * v_expected_unit END;
  v_sku := COALESCE(NULLIF(v_configuration.snapshot#>>'{variant,vendorSku}', ''),
    NULLIF(v_configuration.snapshot#>>'{variant,sku}', ''));
  SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
  INTO v_material
  FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
       WITH ORDINALITY AS chosen(selection, ordinality)
  WHERE lower(selection->>'groupCode') = 'material';
  SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
  INTO v_finish
  FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
       WITH ORDINALITY AS chosen(selection, ordinality)
  WHERE lower(selection->>'groupCode') = 'finish';
  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  UPDATE public.project_ffe_specs
  SET configuration_locked_at = COALESCE(configuration_locked_at, now()),
      selected_dimensions = v_configuration.resolved_dimensions,
      sku = COALESCE(v_sku, sku),
      material = COALESCE(v_material, material),
      finish = COALESCE(v_finish, finish),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_spec.id;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_project_ffe_configuration_integrity ON public.project_ffe_items;
CREATE TRIGGER trg_guard_project_ffe_configuration_integrity
  BEFORE UPDATE ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_ffe_configuration_integrity();

CREATE OR REPLACE FUNCTION public.guard_vendor_quote_configuration_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_configuration public.product_configurations;
  v_expected_snapshot jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.configuration_id IS NOT NULL AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'linked quote requests are immutable after draft'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.configuration_id IS NOT NULL
     AND OLD.status <> 'draft' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'linked quote requests cannot return to draft'
      USING errcode = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE'
     AND (OLD.configuration_id IS NOT NULL OR NEW.configuration_id IS NOT NULL)
     AND (OLD.status <> 'draft' OR NEW.status <> 'draft') AND (
       NEW.configuration_id IS DISTINCT FROM OLD.configuration_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.designer_id IS DISTINCT FROM OLD.designer_id
       OR NEW.configuration_snapshot IS DISTINCT FROM OLD.configuration_snapshot
       OR NEW.configuration_snapshot_hash IS DISTINCT FROM OLD.configuration_snapshot_hash
     ) THEN
    RAISE EXCEPTION 'linked quote configuration snapshots freeze when leaving draft'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW.configuration_id IS NULL THEN
    IF NEW.configuration_snapshot <> '{}'::jsonb
       OR NEW.configuration_snapshot_hash IS NOT NULL THEN
      RAISE EXCEPTION 'unlinked quote requests cannot retain a configuration snapshot'
        USING errcode = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'linked configuration quote requests must begin as drafts'
      USING errcode = 'check_violation';
  END IF;
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'authentication required for a linked quote request'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND (
       NEW.designer_id <> auth.uid()
       OR NOT public._can_access_product_configuration(NEW.configuration_id)
     ) THEN
    RAISE EXCEPTION 'quote request configuration is not accessible to its designer'
      USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_configuration
  FROM public.product_configurations WHERE id = NEW.configuration_id FOR SHARE;
  IF NOT FOUND OR v_configuration.project_id IS NULL
     OR NEW.project_id IS DISTINCT FROM v_configuration.project_id
     OR jsonb_typeof(NEW.configuration_snapshot) IS DISTINCT FROM 'object'
     OR NEW.configuration_snapshot = '{}'::jsonb THEN
    RAISE EXCEPTION 'linked quote project and configuration snapshot must be complete'
      USING errcode = 'check_violation';
  END IF;
  v_expected_snapshot := public._configuration_quote_snapshot(NEW.configuration_id);
  IF (NEW.status = 'draft' OR (TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'sent'))
     AND NEW.configuration_snapshot IS DISTINCT FROM v_expected_snapshot THEN
    RAISE EXCEPTION 'linked quote snapshot is not the authoritative configuration revision'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  NEW.configuration_snapshot_hash := public._configuration_snapshot_hash(NEW.configuration_snapshot);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_vendor_quote_configuration_snapshot ON public.vendor_quote_requests;
CREATE TRIGGER trg_guard_vendor_quote_configuration_snapshot
  BEFORE INSERT OR UPDATE OR DELETE ON public.vendor_quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_quote_configuration_snapshot();

CREATE OR REPLACE FUNCTION public.lock_configuration_snapshot_on_po_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spec public.project_ffe_specs;
  v_configuration public.product_configurations;
  v_po public.purchase_orders;
  v_expected_unit integer;
  v_expected_trade integer;
  v_total bigint;
BEGIN
  IF OLD.purchase_order_id IS NULL AND NEW.purchase_order_id IS NOT NULL THEN
    IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'authentication required to link a configured line to a purchase order'
        USING errcode = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = NEW.purchase_order_id FOR SHARE;
    IF NOT FOUND OR v_po.project_id <> NEW.project_id
       OR (auth.uid() IS NOT NULL AND v_po.designer_id <> auth.uid()) THEN
      RAISE EXCEPTION 'purchase order caller and project do not match the configured line'
        USING errcode = 'check_violation';
    END IF;
    SELECT * INTO v_spec FROM public.project_ffe_specs WHERE ffe_item_id = NEW.id FOR UPDATE;
    IF FOUND AND v_spec.configuration_id IS NOT NULL THEN
      IF auth.uid() IS NOT NULL
         AND NOT public._can_access_product_configuration(v_spec.configuration_id) THEN
        RAISE EXCEPTION 'configuration not found or not accessible'
          USING errcode = 'insufficient_privilege';
      END IF;
      SELECT * INTO STRICT v_configuration
      FROM public.product_configurations WHERE id = v_spec.configuration_id FOR SHARE;
      IF v_configuration.status NOT IN ('approved', 'issued') THEN
        RAISE EXCEPTION 'configuration must be approved before creating a purchase order'
          USING errcode = 'object_not_in_prerequisite_state';
      END IF;
      IF NOT v_configuration.is_valid OR NOT v_configuration.is_complete
         OR v_configuration.product_id IS DISTINCT FROM NEW.product_id
         OR (v_configuration.project_id IS NOT NULL AND v_configuration.project_id <> NEW.project_id)
         OR (v_configuration.ffe_item_id IS NOT NULL AND v_configuration.ffe_item_id <> NEW.id)
         OR v_spec.configuration_snapshot IS DISTINCT FROM v_configuration.snapshot
         OR v_spec.configuration_snapshot_hash IS DISTINCT FROM v_configuration.snapshot_hash
         OR v_configuration.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_configuration.snapshot) THEN
        RAISE EXCEPTION 'project configuration snapshot is stale; re-approve before purchase order'
          USING errcode = 'object_not_in_prerequisite_state';
      END IF;
      v_expected_unit := COALESCE(
        NULLIF(v_configuration.snapshot->>'retailPriceCents', '')::integer,
        NULLIF(v_configuration.snapshot->>'tradePriceCents', '')::integer
      );
      v_expected_trade := COALESCE(
        NULLIF(v_configuration.snapshot->>'tradePriceCents', '')::integer,
        NULLIF(v_configuration.snapshot->>'retailPriceCents', '')::integer
      );
      IF v_expected_trade IS NULL
         OR NEW.unit_price_cents IS DISTINCT FROM v_expected_unit
         OR NEW.trade_price_cents IS DISTINCT FROM v_expected_trade
         OR NEW.line_total_cents IS DISTINCT FROM NEW.quantity * v_expected_unit THEN
        RAISE EXCEPTION 'configured line pricing diverges from its approved snapshot'
          USING errcode = 'object_not_in_prerequisite_state';
      END IF;
      PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
      UPDATE public.project_ffe_specs
      SET configuration_locked_at = COALESCE(configuration_locked_at, now()),
          updated_at = now()
      WHERE id = v_spec.id;
      PERFORM set_config('patina.configuration_spec_workflow', '', true);
    END IF;
    SELECT COALESCE(sum(
      COALESCE(
        CASE WHEN s.configuration_id IS NOT NULL THEN COALESCE(
          NULLIF(s.configuration_snapshot->>'tradePriceCents', '')::integer,
          NULLIF(s.configuration_snapshot->>'retailPriceCents', '')::integer
        ) ELSE i.trade_price_cents END,
        i.unit_price_cents, 0
      )::bigint * COALESCE(i.quantity, 1)
    ), 0)
    INTO v_total
    FROM public.project_ffe_items i
    LEFT JOIN public.project_ffe_specs s ON s.ffe_item_id = i.id
    WHERE i.purchase_order_id = NEW.purchase_order_id;
    IF v_total IS DISTINCT FROM v_po.total_cents::bigint THEN
      RAISE EXCEPTION 'purchase order total % does not match immutable configured line total %',
        v_po.total_cents, v_total USING errcode = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_configuration_snapshot_on_po_link ON public.project_ffe_items;
CREATE TRIGGER trg_lock_configuration_snapshot_on_po_link
  AFTER UPDATE OF purchase_order_id ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public.lock_configuration_snapshot_on_po_link();

-- ── RLS: definition reads follow Product's three-layer law; all writes use RPCs.
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_configuration_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_configuration_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_configuration_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_commission_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_commission_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_commission_milestone_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_option_groups_visible ON public.product_option_groups;
DROP POLICY IF EXISTS product_option_values_visible ON public.product_option_values;
DROP POLICY IF EXISTS product_variants_visible ON public.product_variants;
DROP POLICY IF EXISTS product_variant_values_visible ON public.product_variant_values;
DROP POLICY IF EXISTS product_components_visible ON public.product_components;
DROP POLICY IF EXISTS product_configuration_rules_visible ON public.product_configuration_rules;
DROP POLICY IF EXISTS product_configurations_visible ON public.product_configurations;
DROP POLICY IF EXISTS product_configuration_selections_visible ON public.product_configuration_selections;
DROP POLICY IF EXISTS product_configuration_components_visible ON public.product_configuration_components;
DROP POLICY IF EXISTS custom_commission_revisions_visible ON public.custom_commission_revisions;
DROP POLICY IF EXISTS custom_commission_milestones_visible ON public.custom_commission_milestones;
DROP POLICY IF EXISTS custom_commission_milestone_events_visible ON public.custom_commission_milestone_events;

CREATE POLICY product_option_groups_visible ON public.product_option_groups
  FOR SELECT TO authenticated USING (public._can_read_configurable_product(product_id));
CREATE POLICY product_option_values_visible ON public.product_option_values
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.product_option_groups g
    WHERE g.id = option_group_id AND public._can_read_configurable_product(g.product_id)
  ));
CREATE POLICY product_variants_visible ON public.product_variants
  FOR SELECT TO authenticated USING (public._can_read_configurable_product(product_id));
CREATE POLICY product_variant_values_visible ON public.product_variant_values
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.product_variants v
    WHERE v.id = variant_id AND public._can_read_configurable_product(v.product_id)
  ));
CREATE POLICY product_components_visible ON public.product_components
  FOR SELECT TO authenticated USING (public._can_read_configurable_product(product_id));
CREATE POLICY product_configuration_rules_visible ON public.product_configuration_rules
  FOR SELECT TO authenticated USING (public._can_read_configurable_product(product_id));
CREATE POLICY product_configurations_visible ON public.product_configurations
  FOR SELECT TO authenticated USING (public._can_access_product_configuration(id));
CREATE POLICY product_configuration_selections_visible ON public.product_configuration_selections
  FOR SELECT TO authenticated USING (public._can_access_product_configuration(configuration_id));
CREATE POLICY product_configuration_components_visible ON public.product_configuration_components
  FOR SELECT TO authenticated USING (public._can_access_product_configuration(configuration_id));
CREATE POLICY custom_commission_revisions_visible ON public.custom_commission_revisions
  FOR SELECT TO authenticated USING (public._can_access_product_configuration(configuration_id));
CREATE POLICY custom_commission_milestones_visible ON public.custom_commission_milestones
  FOR SELECT TO authenticated USING (public._can_access_product_configuration(configuration_id));
CREATE POLICY custom_commission_milestone_events_visible ON public.custom_commission_milestone_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.custom_commission_milestones m
    WHERE m.id = milestone_id AND public._can_access_product_configuration(m.configuration_id)
  ));

-- ── Definition read + atomic authoring ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_product_configuration_schema(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.products;
BEGIN
  IF NOT public._can_read_configurable_product(p_product_id) THEN
    RAISE EXCEPTION 'product not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_product FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'productId', v_product.id,
    'productName', v_product.name,
    'mode', v_product.configuration_mode,
    'pricingStrategy', v_product.configuration_pricing_strategy,
    'revision', v_product.configuration_revision,
    'baseRetailPriceCents', v_product.price_retail,
    'baseTradePriceCents', v_product.price_trade,
    'baseLeadTimeWeeks', v_product.lead_time_weeks,
    'baseDimensions', v_product.dimensions,
    'summary', v_product.configuration_summary,
    'optionGroups', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'productId', g.product_id,
          'code', g.code,
          'name', g.name,
          'description', g.description,
          'selectionType', g.selection_type,
          'required', g.required,
          'minSelections', g.min_selections,
          'maxSelections', g.max_selections,
          'position', g.position,
          'values', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', v.id,
              'groupId', v.option_group_id,
              'code', v.code,
              'label', v.label,
              'description', v.description,
              'swatch', v.swatch,
              'media', v.media,
              'retailPriceDeltaCents', v.retail_price_delta_cents,
              'tradePriceDeltaCents', v.trade_price_delta_cents,
              'leadTimeDeltaWeeks', v.lead_time_delta_weeks,
              'metadata', v.metadata,
              'position', v.position,
              'isActive', v.is_active
            ) ORDER BY v.position, v.label)
            FROM public.product_option_values v
            WHERE v.option_group_id = g.id
          ), '[]'::jsonb)
        ) ORDER BY g.position, g.name
      )
      FROM public.product_option_groups g
      WHERE g.product_id = p_product_id
    ), '[]'::jsonb),
    'variants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id,
        'productId', v.product_id,
        'code', v.code,
        'name', v.name,
        'sku', v.sku,
        'vendorSku', v.vendor_sku,
        'status', v.status,
        'retailPriceCents', v.retail_price_cents,
        'tradePriceCents', v.trade_price_cents,
        'leadTimeWeeks', v.lead_time_weeks,
        'dimensions', v.dimensions,
        'weight', v.weight,
        'metadata', v.metadata,
        'isDefault', v.is_default,
        'optionValueIds', COALESCE((
          SELECT jsonb_agg(vv.option_value_id ORDER BY vv.option_value_id)
          FROM public.product_variant_values vv WHERE vv.variant_id = v.id
        ), '[]'::jsonb)
      ) ORDER BY v.name)
      FROM public.product_variants v WHERE v.product_id = p_product_id
    ), '[]'::jsonb),
    'components', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'productId', c.product_id,
        'code', c.code,
        'name', c.name,
        'description', c.description,
        'componentType', c.component_type,
        'handedness', c.handedness,
        'minQuantity', c.min_quantity,
        'maxQuantity', c.max_quantity,
        'defaultQuantity', c.default_quantity,
        'retailPriceCents', c.retail_price_cents,
        'tradePriceCents', c.trade_price_cents,
        'leadTimeWeeks', c.lead_time_weeks,
        'dimensions', c.dimensions,
        'metadata', c.metadata,
        'position', c.position,
        'isActive', c.is_active
      ) ORDER BY c.position, c.name)
      FROM public.product_components c WHERE c.product_id = p_product_id
    ), '[]'::jsonb),
    'rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'productId', r.product_id,
        'code', r.code,
        'name', r.name,
        'ruleType', r.rule_type,
        'condition', r.condition,
        'effect', r.effect,
        'message', r.message,
        'priority', r.priority,
        'isActive', r.is_active
      ) ORDER BY r.priority, r.code)
      FROM public.product_configuration_rules r WHERE r.product_id = p_product_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_product_configuration_schema(
  p_product_id uuid,
  p_input jsonb,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_product public.products;
  v_group jsonb;
  v_value jsonb;
  v_variant jsonb;
  v_component jsonb;
  v_rule jsonb;
  v_group_id uuid;
  v_value_id uuid;
  v_variant_id uuid;
  v_component_id uuid;
  v_rule_id uuid;
  v_ref text;
  v_ref_id uuid;
  v_seen_groups uuid[] := '{}'::uuid[];
  v_seen_values uuid[] := '{}'::uuid[];
  v_seen_variants uuid[] := '{}'::uuid[];
  v_seen_components uuid[] := '{}'::uuid[];
  v_seen_rules uuid[] := '{}'::uuid[];
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'definition input must be a JSON object'
      USING errcode = 'check_violation';
  END IF;
  IF NOT public._can_manage_configurable_product(p_product_id) THEN
    RAISE EXCEPTION 'product not found or not editable'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO STRICT v_product
  FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF p_expected_revision IS NOT NULL
     AND p_expected_revision <> v_product.configuration_revision THEN
    RAISE EXCEPTION 'configuration definition changed in another session (expected %, current %)',
      p_expected_revision, v_product.configuration_revision
      USING errcode = 'serialization_failure';
  END IF;
  IF COALESCE(p_input->>'mode', '') NOT IN ('standard', 'variant', 'configured', 'custom') THEN
    RAISE EXCEPTION 'invalid configuration mode' USING errcode = 'check_violation';
  END IF;
  IF COALESCE(p_input->>'pricingStrategy', 'base_plus_adjustments')
     NOT IN ('base_plus_adjustments', 'component_sum') THEN
    RAISE EXCEPTION 'invalid pricing strategy' USING errcode = 'check_violation';
  END IF;
  IF jsonb_typeof(COALESCE(p_input->'optionGroups', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_input->'variants', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_input->'components', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_input->'rules', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'definition collections must be arrays' USING errcode = 'check_violation';
  END IF;
  IF p_input->>'mode' IN ('standard', 'custom') AND (
       jsonb_array_length(COALESCE(p_input->'optionGroups', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(p_input->'variants', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(p_input->'components', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(p_input->'rules', '[]'::jsonb)) > 0
     ) THEN
    RAISE EXCEPTION '% mode cannot retain option groups, variants, components, or rules', p_input->>'mode'
      USING errcode = 'check_violation';
  END IF;
  IF p_input->>'mode' = 'variant'
     AND jsonb_array_length(COALESCE(p_input->'components', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'variant mode cannot retain modular components'
      USING errcode = 'check_violation';
  END IF;
  IF p_input->>'mode' = 'configured'
     AND jsonb_array_length(COALESCE(p_input->'variants', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'configured mode cannot retain exact variants'
      USING errcode = 'check_violation';
  END IF;
  IF COALESCE(p_input->>'pricingStrategy', 'base_plus_adjustments') = 'component_sum'
     AND p_input->>'mode' <> 'configured' THEN
    RAISE EXCEPTION 'component_sum pricing requires configured mode'
      USING errcode = 'check_violation';
  END IF;

  UPDATE public.products
  SET configuration_mode = p_input->>'mode',
      configuration_pricing_strategy = COALESCE(p_input->>'pricingStrategy', 'base_plus_adjustments'),
      configuration_revision = configuration_revision + 1,
      configuration_updated_at = now(),
      updated_at = now()
  WHERE id = p_product_id;

  FOR v_group IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'optionGroups', '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_group) <> 'object' OR COALESCE(v_group->>'code', '') = '' THEN
      RAISE EXCEPTION 'every option group needs a code' USING errcode = 'check_violation';
    END IF;
    INSERT INTO public.product_option_groups (
      id, product_id, code, name, description, selection_type, required,
      min_selections, max_selections, position
    ) VALUES (
      CASE WHEN COALESCE(v_group->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_group->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_group->>'code', COALESCE(v_group->>'name', v_group->>'code'),
      v_group->>'description', COALESCE(v_group->>'selectionType', 'single'),
      COALESCE((v_group->>'required')::boolean, true),
      COALESCE((v_group->>'minSelections')::integer, CASE WHEN COALESCE((v_group->>'required')::boolean, true) THEN 1 ELSE 0 END),
      COALESCE((v_group->>'maxSelections')::integer, 1),
      COALESCE((v_group->>'position')::integer, 0)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      selection_type = EXCLUDED.selection_type,
      required = EXCLUDED.required,
      min_selections = EXCLUDED.min_selections,
      max_selections = EXCLUDED.max_selections,
      position = EXCLUDED.position,
      updated_at = now()
    RETURNING id INTO v_group_id;
    v_seen_groups := array_append(v_seen_groups, v_group_id);

    IF jsonb_typeof(COALESCE(v_group->'values', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'option group values must be an array' USING errcode = 'check_violation';
    END IF;
    FOR v_value IN SELECT value FROM jsonb_array_elements(COALESCE(v_group->'values', '[]'::jsonb)) LOOP
      INSERT INTO public.product_option_values (
        id, option_group_id, code, label, description, swatch, media,
        retail_price_delta_cents, trade_price_delta_cents, lead_time_delta_weeks,
        metadata, position, is_active
      ) VALUES (
        CASE WHEN COALESCE(v_value->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (v_value->>'id')::uuid ELSE extensions.gen_random_uuid() END,
        v_group_id, v_value->>'code', COALESCE(v_value->>'label', v_value->>'code'),
        v_value->>'description', v_value->'swatch', COALESCE(v_value->'media', '[]'::jsonb),
        COALESCE((v_value->>'retailPriceDeltaCents')::integer, 0),
        COALESCE((v_value->>'tradePriceDeltaCents')::integer, 0),
        COALESCE((v_value->>'leadTimeDeltaWeeks')::integer, 0),
        COALESCE(v_value->'metadata', '{}'::jsonb),
        COALESCE((v_value->>'position')::integer, 0),
        COALESCE((v_value->>'isActive')::boolean, true)
      )
      ON CONFLICT (option_group_id, code) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        swatch = EXCLUDED.swatch,
        media = EXCLUDED.media,
        retail_price_delta_cents = EXCLUDED.retail_price_delta_cents,
        trade_price_delta_cents = EXCLUDED.trade_price_delta_cents,
        lead_time_delta_weeks = EXCLUDED.lead_time_delta_weeks,
        metadata = EXCLUDED.metadata,
        position = EXCLUDED.position,
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING id INTO v_value_id;
      v_seen_values := array_append(v_seen_values, v_value_id);
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.product_option_values ov
    JOIN public.product_option_groups og ON og.id = ov.option_group_id
    WHERE og.product_id = p_product_id
      AND NOT (ov.id = ANY(v_seen_values))
      AND (
        EXISTS (SELECT 1 FROM public.product_configuration_selections s WHERE s.option_value_id = ov.id)
        OR EXISTS (SELECT 1 FROM public.product_variant_values vv WHERE vv.option_value_id = ov.id)
      )
  ) THEN
    RAISE EXCEPTION 'used option values cannot be removed; deactivate them instead'
      USING errcode = 'foreign_key_violation';
  END IF;
  DELETE FROM public.product_option_values ov
  USING public.product_option_groups og
  WHERE ov.option_group_id = og.id AND og.product_id = p_product_id
    AND NOT (ov.id = ANY(v_seen_values));
  DELETE FROM public.product_option_groups
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_groups));

  FOR v_variant IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'variants', '[]'::jsonb)) LOOP
    INSERT INTO public.product_variants (
      id, product_id, code, name, sku, vendor_sku, status,
      retail_price_cents, trade_price_cents, lead_time_weeks,
      dimensions, weight, metadata, is_default
    ) VALUES (
      CASE WHEN COALESCE(v_variant->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_variant->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_variant->>'code', COALESCE(v_variant->>'name', v_variant->>'code'),
      v_variant->>'sku', v_variant->>'vendorSku', COALESCE(v_variant->>'status', 'active'),
      NULLIF(v_variant->>'retailPriceCents', '')::integer,
      NULLIF(v_variant->>'tradePriceCents', '')::integer,
      NULLIF(v_variant->>'leadTimeWeeks', '')::integer,
      v_variant->'dimensions', v_variant->'weight', COALESCE(v_variant->'metadata', '{}'::jsonb),
      COALESCE((v_variant->>'isDefault')::boolean, false)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      sku = EXCLUDED.sku,
      vendor_sku = EXCLUDED.vendor_sku,
      status = EXCLUDED.status,
      retail_price_cents = EXCLUDED.retail_price_cents,
      trade_price_cents = EXCLUDED.trade_price_cents,
      lead_time_weeks = EXCLUDED.lead_time_weeks,
      dimensions = EXCLUDED.dimensions,
      weight = EXCLUDED.weight,
      metadata = EXCLUDED.metadata,
      is_default = EXCLUDED.is_default,
      updated_at = now()
    RETURNING id INTO v_variant_id;
    v_seen_variants := array_append(v_seen_variants, v_variant_id);

    DELETE FROM public.product_variant_values WHERE variant_id = v_variant_id;
    FOR v_ref IN
      SELECT value #>> '{}'
      FROM jsonb_array_elements(COALESCE(v_variant->'optionValueIds', v_variant->'optionValueCodes', '[]'::jsonb))
    LOOP
      v_ref_id := NULL;
      BEGIN
        v_ref_id := v_ref::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        SELECT ov.id INTO v_ref_id
        FROM public.product_option_values ov
        JOIN public.product_option_groups og ON og.id = ov.option_group_id
        WHERE og.product_id = p_product_id
          AND (og.code || ':' || ov.code = v_ref OR ov.code = v_ref)
        ORDER BY (og.code || ':' || ov.code = v_ref) DESC
        LIMIT 1;
      END;
      IF v_ref_id IS NULL THEN
        RAISE EXCEPTION 'unknown option value reference % for variant %', v_ref, v_variant->>'code'
          USING errcode = 'foreign_key_violation';
      END IF;
      INSERT INTO public.product_variant_values(variant_id, option_value_id)
      VALUES (v_variant_id, v_ref_id) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.product_variants v
    WHERE v.product_id = p_product_id AND NOT (v.id = ANY(v_seen_variants))
      AND EXISTS (SELECT 1 FROM public.product_configurations c WHERE c.product_variant_id = v.id)
  ) THEN
    RAISE EXCEPTION 'used variants cannot be removed; mark them discontinued instead'
      USING errcode = 'foreign_key_violation';
  END IF;
  DELETE FROM public.product_variants
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_variants));

  FOR v_component IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'components', '[]'::jsonb)) LOOP
    INSERT INTO public.product_components (
      id, product_id, code, name, description, component_type, handedness,
      min_quantity, max_quantity, default_quantity, retail_price_cents,
      trade_price_cents, lead_time_weeks, dimensions, metadata, position, is_active
    ) VALUES (
      CASE WHEN COALESCE(v_component->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_component->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_component->>'code', COALESCE(v_component->>'name', v_component->>'code'),
      v_component->>'description', COALESCE(v_component->>'componentType', 'module'),
      COALESCE(v_component->>'handedness', 'none'),
      COALESCE((v_component->>'minQuantity')::integer, 0),
      NULLIF(v_component->>'maxQuantity', '')::integer,
      COALESCE((v_component->>'defaultQuantity')::integer, 0),
      COALESCE((v_component->>'retailPriceCents')::integer, 0),
      COALESCE((v_component->>'tradePriceCents')::integer, 0),
      COALESCE((v_component->>'leadTimeWeeks')::integer, 0),
      v_component->'dimensions', COALESCE(v_component->'metadata', '{}'::jsonb),
      COALESCE((v_component->>'position')::integer, 0),
      COALESCE((v_component->>'isActive')::boolean, true)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      component_type = EXCLUDED.component_type,
      handedness = EXCLUDED.handedness,
      min_quantity = EXCLUDED.min_quantity,
      max_quantity = EXCLUDED.max_quantity,
      default_quantity = EXCLUDED.default_quantity,
      retail_price_cents = EXCLUDED.retail_price_cents,
      trade_price_cents = EXCLUDED.trade_price_cents,
      lead_time_weeks = EXCLUDED.lead_time_weeks,
      dimensions = EXCLUDED.dimensions,
      metadata = EXCLUDED.metadata,
      position = EXCLUDED.position,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id INTO v_component_id;
    v_seen_components := array_append(v_seen_components, v_component_id);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.product_components c
    WHERE c.product_id = p_product_id AND NOT (c.id = ANY(v_seen_components))
      AND EXISTS (SELECT 1 FROM public.product_configuration_components cc WHERE cc.component_id = c.id)
  ) THEN
    RAISE EXCEPTION 'used components cannot be removed; deactivate them instead'
      USING errcode = 'foreign_key_violation';
  END IF;
  DELETE FROM public.product_components
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_components));

  FOR v_rule IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'rules', '[]'::jsonb)) LOOP
    IF jsonb_typeof(COALESCE(v_rule->'condition', '{}'::jsonb)) <> 'object'
       OR jsonb_typeof(COALESCE(v_rule->'effect', '{}'::jsonb)) <> 'object'
       OR (v_rule->'condition' ? 'selectedOptionValues' AND jsonb_typeof(v_rule->'condition'->'selectedOptionValues') <> 'object')
       OR (v_rule->'condition' ? 'notSelectedOptionValues' AND jsonb_typeof(v_rule->'condition'->'notSelectedOptionValues') <> 'object')
       OR (v_rule->'condition' ? 'components' AND jsonb_typeof(v_rule->'condition'->'components') <> 'object')
       OR (v_rule->'effect' ? 'requiredOptionValues' AND jsonb_typeof(v_rule->'effect'->'requiredOptionValues') <> 'object')
       OR (v_rule->'effect' ? 'requiredComponents' AND jsonb_typeof(v_rule->'effect'->'requiredComponents') <> 'object')
       OR (v_rule->'effect' ? 'dimensions' AND jsonb_typeof(v_rule->'effect'->'dimensions') <> 'object')
       OR (v_rule->'effect' ? 'allowed' AND jsonb_typeof(v_rule->'effect'->'allowed') <> 'boolean')
       OR (v_rule->'effect' ? 'priceOnRequest' AND jsonb_typeof(v_rule->'effect'->'priceOnRequest') <> 'boolean')
       OR (v_rule->'effect' ? 'retailPriceDeltaCents' AND jsonb_typeof(v_rule->'effect'->'retailPriceDeltaCents') <> 'number')
       OR (v_rule->'effect' ? 'tradePriceDeltaCents' AND jsonb_typeof(v_rule->'effect'->'tradePriceDeltaCents') <> 'number')
       OR (v_rule->'effect' ? 'leadTimeDeltaWeeks' AND jsonb_typeof(v_rule->'effect'->'leadTimeDeltaWeeks') <> 'number') THEN
      RAISE EXCEPTION 'rule % has malformed condition/effect JSON', COALESCE(v_rule->>'code', '<unknown>')
        USING errcode = 'check_violation';
    END IF;
    INSERT INTO public.product_configuration_rules (
      id, product_id, code, name, rule_type, condition, effect, message, priority, is_active
    ) VALUES (
      CASE WHEN COALESCE(v_rule->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_rule->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_rule->>'code', COALESCE(v_rule->>'name', v_rule->>'code'),
      v_rule->>'ruleType', COALESCE(v_rule->'condition', '{}'::jsonb),
      COALESCE(v_rule->'effect', '{}'::jsonb), v_rule->>'message',
      COALESCE((v_rule->>'priority')::integer, 0), COALESCE((v_rule->>'isActive')::boolean, true)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      rule_type = EXCLUDED.rule_type,
      condition = EXCLUDED.condition,
      effect = EXCLUDED.effect,
      message = EXCLUDED.message,
      priority = EXCLUDED.priority,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id INTO v_rule_id;
    v_seen_rules := array_append(v_seen_rules, v_rule_id);
  END LOOP;
  DELETE FROM public.product_configuration_rules
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_rules));

  UPDATE public.products p
  SET configuration_summary = jsonb_build_object(
    'mode', p.configuration_mode,
    'pricingStrategy', p.configuration_pricing_strategy,
    'groupCount', (SELECT count(*) FROM public.product_option_groups g WHERE g.product_id = p.id),
    'valueCount', (SELECT count(*) FROM public.product_option_values ov JOIN public.product_option_groups g ON g.id = ov.option_group_id WHERE g.product_id = p.id AND ov.is_active),
    'activeVariantCount', (SELECT count(*) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active'),
    'activeComponentCount', (SELECT count(*) FROM public.product_components c WHERE c.product_id = p.id AND c.is_active),
    'primaryGroupName', (SELECT g.name FROM public.product_option_groups g WHERE g.product_id = p.id ORDER BY g.position, g.name LIMIT 1),
    'primaryGroupValueCount', COALESCE((SELECT count(*) FROM public.product_option_values ov WHERE ov.option_group_id = (SELECT g.id FROM public.product_option_groups g WHERE g.product_id = p.id ORDER BY g.position, g.name LIMIT 1) AND ov.is_active), 0),
    'minRetailPriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN COALESCE(sum(c.min_quantity), 0) > 0
        THEN sum(c.retail_price_cents * c.min_quantity)
        ELSE min(c.retail_price_cents) END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT min(x) FROM unnest(ARRAY[p.price_retail] || COALESCE((SELECT array_agg(v.retail_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.retail_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'maxRetailPriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN bool_and(c.max_quantity IS NOT NULL)
        THEN sum(c.retail_price_cents * c.max_quantity) ELSE NULL END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT max(x) FROM unnest(ARRAY[p.price_retail] || COALESCE((SELECT array_agg(v.retail_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.retail_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'minTradePriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN COALESCE(sum(c.min_quantity), 0) > 0
        THEN sum(c.trade_price_cents * c.min_quantity)
        ELSE min(c.trade_price_cents) END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT min(x) FROM unnest(ARRAY[p.price_trade] || COALESCE((SELECT array_agg(v.trade_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.trade_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'maxTradePriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN bool_and(c.max_quantity IS NOT NULL)
        THEN sum(c.trade_price_cents * c.max_quantity) ELSE NULL END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT max(x) FROM unnest(ARRAY[p.price_trade] || COALESCE((SELECT array_agg(v.trade_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.trade_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'minLeadTimeWeeks', CASE WHEN p.configuration_pricing_strategy = 'component_sum'
      THEN (SELECT min(c.lead_time_weeks) FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT min(x) FROM unnest(ARRAY[p.lead_time_weeks] || COALESCE((SELECT array_agg(v.lead_time_weeks) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.lead_time_weeks IS NOT NULL), '{}'::integer[])) x) END,
    'maxLeadTimeWeeks', CASE WHEN p.configuration_pricing_strategy = 'component_sum'
      THEN (SELECT max(c.lead_time_weeks) FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT max(x) FROM unnest(ARRAY[p.lead_time_weeks] || COALESCE((SELECT array_agg(v.lead_time_weeks) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.lead_time_weeks IS NOT NULL), '{}'::integer[])) x) END,
    'priceOnRequest', CASE WHEN p.configuration_pricing_strategy = 'component_sum'
      THEN NOT EXISTS (SELECT 1 FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE p.configuration_mode = 'custom' AND p.price_retail IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.retail_price_cents IS NOT NULL) END
  )
  WHERE p.id = p_product_id;

  RETURN public.get_product_configuration_schema(p_product_id);
END;
$$;

-- Rule condition grammar is deliberately compact and vendor-neutral:
-- {
--   "selectedOptionValues": {"material":["walnut"]},
--   "notSelectedOptionValues": {"finish":["painted"]},
--   "components": {"left-arm":{"min":1,"max":1,"handedness":"left"}}
-- }
CREATE OR REPLACE FUNCTION public._product_configuration_condition_matches(
  p_condition jsonb,
  p_selections jsonb,
  p_components jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry record;
  v_expected text;
  v_quantity integer;
BEGIN
  IF p_condition IS NULL OR p_condition = '{}'::jsonb THEN
    RETURN true;
  END IF;
  FOR v_entry IN SELECT key, value FROM jsonb_each(COALESCE(p_condition->'selectedOptionValues', '{}'::jsonb)) LOOP
    IF jsonb_typeof(v_entry.value) <> 'array' THEN RETURN false; END IF;
    FOR v_expected IN SELECT jsonb_array_elements_text(v_entry.value) LOOP
      IF NOT COALESCE(p_selections->v_entry.key, '[]'::jsonb) @> jsonb_build_array(v_expected) THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  FOR v_entry IN SELECT key, value FROM jsonb_each(COALESCE(p_condition->'notSelectedOptionValues', '{}'::jsonb)) LOOP
    IF jsonb_typeof(v_entry.value) <> 'array' THEN RETURN false; END IF;
    FOR v_expected IN SELECT jsonb_array_elements_text(v_entry.value) LOOP
      IF COALESCE(p_selections->v_entry.key, '[]'::jsonb) @> jsonb_build_array(v_expected) THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  FOR v_entry IN SELECT key, value FROM jsonb_each(COALESCE(p_condition->'components', '{}'::jsonb)) LOOP
    v_quantity := COALESCE((p_components->v_entry.key->>'quantity')::integer, 0);
    IF v_quantity < COALESCE((v_entry.value->>'min')::integer, 0) THEN RETURN false; END IF;
    IF v_entry.value ? 'max' AND v_quantity > (v_entry.value->>'max')::integer THEN RETURN false; END IF;
    IF v_entry.value ? 'handedness'
       AND p_components->v_entry.key->>'handedness' IS DISTINCT FROM v_entry.value->>'handedness' THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_product_configuration(
  p_product_id uuid,
  p_variant_id uuid DEFAULT NULL,
  p_option_value_ids uuid[] DEFAULT '{}'::uuid[],
  p_components jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.products;
  v_variant public.product_variants;
  v_group public.product_option_groups;
  v_component public.product_components;
  v_component_input jsonb;
  v_rule public.product_configuration_rules;
  v_required record;
  v_required_code text;
  v_quantity integer;
  v_handedness text;
  v_selected_count integer;
  v_unknown_count integer;
  v_retail integer;
  v_trade integer;
  v_retail_delta integer := 0;
  v_trade_delta integer := 0;
  v_lead integer;
  v_lead_delta integer := 0;
  v_component_lead integer := 0;
  v_dimensions jsonb;
  v_selection jsonb := '{}'::jsonb;
  v_component_state jsonb := '{}'::jsonb;
  v_component_quantities jsonb := '{}'::jsonb;
  v_selection_snapshot jsonb := '[]'::jsonb;
  v_component_snapshot jsonb := '[]'::jsonb;
  v_matched_variant jsonb := NULL;
  v_violations jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_complete boolean := true;
  v_valid boolean := true;
  v_snapshot jsonb;
  v_rule_match boolean;
BEGIN
  IF NOT public._can_read_configurable_product(p_product_id) THEN
    RAISE EXCEPTION 'product not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF p_components IS NULL OR jsonb_typeof(p_components) <> 'array' THEN
    RAISE EXCEPTION 'components must be a JSON array' USING errcode = 'check_violation';
  END IF;
  SELECT * INTO STRICT v_product FROM public.products WHERE id = p_product_id;
  p_option_value_ids := COALESCE(p_option_value_ids, '{}'::uuid[]);

  SELECT count(*) INTO v_unknown_count
  FROM unnest(p_option_value_ids) selected(id)
  LEFT JOIN public.product_option_values ov ON ov.id = selected.id AND ov.is_active
  LEFT JOIN public.product_option_groups og ON og.id = ov.option_group_id AND og.product_id = p_product_id
  WHERE og.id IS NULL;
  IF v_unknown_count > 0 THEN
    v_valid := false;
    v_violations := v_violations || jsonb_build_array('One or more option values are unavailable for this product.');
  END IF;

  SELECT COALESCE(jsonb_object_agg(group_code, value_codes), '{}'::jsonb)
  INTO v_selection
  FROM (
    SELECT og.code AS group_code, jsonb_agg(ov.code ORDER BY ov.position, ov.code) AS value_codes
    FROM public.product_option_values ov
    JOIN public.product_option_groups og ON og.id = ov.option_group_id
    WHERE og.product_id = p_product_id AND ov.id = ANY(p_option_value_ids)
    GROUP BY og.code
  ) selected_groups;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'optionGroupId', og.id,
    'optionValueId', ov.id,
    'groupCode', og.code,
    'valueCode', ov.code,
    'groupName', og.name,
    'valueLabel', ov.label,
    'retailPriceDeltaCents', ov.retail_price_delta_cents,
    'tradePriceDeltaCents', ov.trade_price_delta_cents,
    'leadTimeDeltaWeeks', ov.lead_time_delta_weeks
  ) ORDER BY og.position, ov.position), '[]'::jsonb),
  COALESCE(sum(ov.retail_price_delta_cents), 0),
  COALESCE(sum(ov.trade_price_delta_cents), 0),
  COALESCE(max(ov.lead_time_delta_weeks), 0)
  INTO v_selection_snapshot, v_retail_delta, v_trade_delta, v_lead_delta
  FROM public.product_option_values ov
  JOIN public.product_option_groups og ON og.id = ov.option_group_id
  WHERE og.product_id = p_product_id AND ov.id = ANY(p_option_value_ids);

  FOR v_group IN
    SELECT * FROM public.product_option_groups WHERE product_id = p_product_id ORDER BY position, code
  LOOP
    SELECT count(*) INTO v_selected_count
    FROM public.product_option_values ov
    WHERE ov.option_group_id = v_group.id AND ov.id = ANY(p_option_value_ids);
    IF v_selected_count < v_group.min_selections THEN
      v_complete := false;
      v_violations := v_violations || jsonb_build_array(
        format('%s needs %s selection%s.', v_group.name, v_group.min_selections,
          CASE WHEN v_group.min_selections = 1 THEN '' ELSE 's' END)
      );
    END IF;
    IF v_selected_count > v_group.max_selections THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array(
        format('%s allows at most %s selection%s.', v_group.name, v_group.max_selections,
          CASE WHEN v_group.max_selections = 1 THEN '' ELSE 's' END)
      );
    END IF;
  END LOOP;

  IF p_variant_id IS NOT NULL THEN
    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE id = p_variant_id AND product_id = p_product_id AND status = 'active';
    IF NOT FOUND THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array('The selected sellable variant is unavailable.');
    END IF;
  ELSIF v_product.configuration_mode = 'variant' THEN
    SELECT v.* INTO v_variant
    FROM public.product_variants v
    WHERE v.product_id = p_product_id AND v.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.product_variant_values vv
        WHERE vv.variant_id = v.id AND NOT (vv.option_value_id = ANY(p_option_value_ids))
      )
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_option_value_ids) selected(id)
        JOIN public.product_option_values ov ON ov.id = selected.id
        JOIN public.product_option_groups og ON og.id = ov.option_group_id
        WHERE og.product_id = p_product_id
          AND NOT EXISTS (
            SELECT 1 FROM public.product_variant_values vv
            WHERE vv.variant_id = v.id AND vv.option_value_id = selected.id
          )
      )
    ORDER BY v.is_default DESC, v.created_at
    LIMIT 1;
    IF NOT FOUND THEN
      v_valid := false;
      v_complete := false;
      v_violations := v_violations || jsonb_build_array('This option combination does not match an active sellable variant.');
    END IF;
  END IF;

  IF v_variant.id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.product_variant_values vv
      WHERE vv.variant_id = v_variant.id AND NOT (vv.option_value_id = ANY(p_option_value_ids))
    ) OR EXISTS (
      SELECT 1 FROM unnest(p_option_value_ids) selected(id)
      JOIN public.product_option_values ov ON ov.id = selected.id
      JOIN public.product_option_groups og ON og.id = ov.option_group_id
      WHERE og.product_id = p_product_id
        AND NOT EXISTS (
          SELECT 1 FROM public.product_variant_values vv
          WHERE vv.variant_id = v_variant.id AND vv.option_value_id = selected.id
        )
    ) THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array('The selected variant does not match the chosen options.');
    END IF;
    v_matched_variant := jsonb_build_object(
      'id', v_variant.id,
      'productId', v_variant.product_id,
      'code', v_variant.code,
      'name', v_variant.name,
      'sku', v_variant.sku,
      'vendorSku', v_variant.vendor_sku,
      'status', v_variant.status,
      'retailPriceCents', v_variant.retail_price_cents,
      'tradePriceCents', v_variant.trade_price_cents,
      'leadTimeWeeks', v_variant.lead_time_weeks,
      'dimensions', v_variant.dimensions,
      'weight', v_variant.weight,
      'metadata', v_variant.metadata,
      'isDefault', v_variant.is_default,
      'optionValueIds', COALESCE((SELECT jsonb_agg(option_value_id) FROM public.product_variant_values WHERE variant_id = v_variant.id), '[]'::jsonb)
    );
  END IF;

  IF v_product.configuration_pricing_strategy = 'component_sum' THEN
    v_retail := 0;
    v_trade := 0;
  ELSE
    v_retail := COALESCE(v_variant.retail_price_cents, v_product.price_retail);
    v_trade := COALESCE(v_variant.trade_price_cents, v_product.price_trade);
  END IF;
  v_lead := COALESCE(v_variant.lead_time_weeks, v_product.lead_time_weeks);
  v_dimensions := COALESCE(v_variant.dimensions, v_product.dimensions);

  IF (SELECT count(*) FROM jsonb_array_elements(p_components))
     <> (SELECT count(DISTINCT value->>'componentId') FROM jsonb_array_elements(p_components)) THEN
    v_valid := false;
    v_violations := v_violations || jsonb_build_array('A modular component cannot be selected more than once.');
  END IF;

  IF v_product.configuration_pricing_strategy = 'component_sum'
     AND EXISTS (SELECT 1 FROM public.product_components WHERE product_id = p_product_id AND is_active)
     AND jsonb_array_length(p_components) = 0 THEN
    v_complete := false;
    v_violations := v_violations || jsonb_build_array('Choose at least one modular component.');
  END IF;

  FOR v_component_input IN SELECT value FROM jsonb_array_elements(p_components) LOOP
    BEGIN
      SELECT * INTO v_component
      FROM public.product_components
      WHERE id = (v_component_input->>'componentId')::uuid
        AND product_id = p_product_id AND is_active;
    EXCEPTION WHEN invalid_text_representation THEN
      v_component.id := NULL;
    END;
    IF v_component.id IS NULL THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array('One or more modular components are unavailable.');
      CONTINUE;
    END IF;
    v_quantity := COALESCE((v_component_input->>'quantity')::integer, 0);
    v_handedness := NULLIF(v_component_input->>'handedness', '');
    IF v_quantity < v_component.min_quantity
       OR (v_component.max_quantity IS NOT NULL AND v_quantity > v_component.max_quantity)
       OR v_quantity <= 0 THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array(
        format('%s quantity must be between %s and %s.', v_component.name,
          greatest(v_component.min_quantity, 1), COALESCE(v_component.max_quantity::text, 'any'))
      );
      CONTINUE;
    END IF;
    IF v_component.handedness = 'either' AND v_handedness NOT IN ('left', 'right') THEN
      v_complete := false;
      v_violations := v_violations || jsonb_build_array(format('%s needs left or right handedness.', v_component.name));
    ELSIF v_component.handedness IN ('left', 'right') THEN
      IF v_handedness IS NOT NULL AND v_handedness <> v_component.handedness THEN
        v_valid := false;
        v_violations := v_violations || jsonb_build_array(format('%s has fixed %s handedness.', v_component.name, v_component.handedness));
      END IF;
      v_handedness := v_component.handedness;
    ELSIF v_component.handedness = 'none' AND v_handedness IS NOT NULL THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array(format('%s is not handed.', v_component.name));
    END IF;
    v_component_state := jsonb_set(v_component_state, ARRAY[v_component.code], jsonb_build_object(
      'quantity', v_quantity, 'handedness', v_handedness
    ), true);
    v_component_quantities := jsonb_set(v_component_quantities, ARRAY[v_component.id::text], to_jsonb(v_quantity), true);
    v_component_snapshot := v_component_snapshot || jsonb_build_array(jsonb_build_object(
      'componentId', v_component.id,
      'code', v_component.code,
      'name', v_component.name,
      'quantity', v_quantity,
      'handedness', v_handedness,
      'retailPriceCents', v_component.retail_price_cents,
      'tradePriceCents', v_component.trade_price_cents,
      'leadTimeWeeks', v_component.lead_time_weeks,
      'dimensions', v_component.dimensions
    ));
    IF v_retail IS NOT NULL THEN v_retail := v_retail + (v_component.retail_price_cents * v_quantity); END IF;
    IF v_trade IS NOT NULL THEN v_trade := v_trade + (v_component.trade_price_cents * v_quantity); END IF;
    v_component_lead := greatest(v_component_lead, v_component.lead_time_weeks);
  END LOOP;

  -- Components declared mandatory by their own definition are checked even if absent.
  FOR v_component IN SELECT * FROM public.product_components WHERE product_id = p_product_id AND is_active AND min_quantity > 0 LOOP
    IF NOT (v_component_state ? v_component.code) THEN
      v_complete := false;
      v_violations := v_violations || jsonb_build_array(format('%s is required.', v_component.name));
    END IF;
  END LOOP;

  IF v_variant.id IS NULL OR v_variant.retail_price_cents IS NULL THEN
    IF v_retail IS NOT NULL THEN v_retail := v_retail + v_retail_delta; END IF;
  END IF;
  IF v_variant.id IS NULL OR v_variant.trade_price_cents IS NULL THEN
    IF v_trade IS NOT NULL THEN v_trade := v_trade + v_trade_delta; END IF;
  END IF;
  IF v_lead IS NOT NULL THEN v_lead := v_lead + greatest(v_lead_delta, v_component_lead); END IF;

  FOR v_rule IN
    SELECT * FROM public.product_configuration_rules
    WHERE product_id = p_product_id AND is_active ORDER BY priority, code
  LOOP
    v_rule_match := public._product_configuration_condition_matches(v_rule.condition, v_selection, v_component_state);
    IF NOT v_rule_match THEN CONTINUE; END IF;
    IF v_rule.rule_type IN ('exclusion', 'compatibility')
       AND COALESCE((v_rule.effect->>'allowed')::boolean, false) = false THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array(COALESCE(v_rule.message, v_rule.name));
    ELSIF v_rule.rule_type = 'requirement' THEN
      FOR v_required IN SELECT key, value FROM jsonb_each(COALESCE(v_rule.effect->'requiredOptionValues', '{}'::jsonb)) LOOP
        FOR v_required_code IN SELECT jsonb_array_elements_text(v_required.value) LOOP
          IF NOT COALESCE(v_selection->v_required.key, '[]'::jsonb) @> jsonb_build_array(v_required_code) THEN
            v_complete := false;
            v_violations := v_violations || jsonb_build_array(COALESCE(v_rule.message, v_rule.name));
          END IF;
        END LOOP;
      END LOOP;
      FOR v_required IN SELECT key, value FROM jsonb_each(COALESCE(v_rule.effect->'requiredComponents', '{}'::jsonb)) LOOP
        IF COALESCE((v_component_state->v_required.key->>'quantity')::integer, 0)
           < COALESCE((v_required.value->>'min')::integer, 1) THEN
          v_complete := false;
          v_violations := v_violations || jsonb_build_array(COALESCE(v_rule.message, v_rule.name));
        END IF;
      END LOOP;
    ELSIF v_rule.rule_type = 'pricing' THEN
      IF COALESCE((v_rule.effect->>'priceOnRequest')::boolean, false) THEN
        v_retail := NULL;
        v_trade := NULL;
      ELSE
        IF v_retail IS NOT NULL THEN v_retail := v_retail + COALESCE((v_rule.effect->>'retailPriceDeltaCents')::integer, 0); END IF;
        IF v_trade IS NOT NULL THEN v_trade := v_trade + COALESCE((v_rule.effect->>'tradePriceDeltaCents')::integer, 0); END IF;
      END IF;
    ELSIF v_rule.rule_type = 'lead_time' AND v_lead IS NOT NULL THEN
      v_lead := v_lead + COALESCE((v_rule.effect->>'leadTimeDeltaWeeks')::integer, 0);
    ELSIF v_rule.rule_type = 'dimension' AND jsonb_typeof(v_rule.effect->'dimensions') = 'object' THEN
      v_dimensions := COALESCE(v_dimensions, '{}'::jsonb) || (v_rule.effect->'dimensions');
    END IF;
  END LOOP;

  IF v_product.configuration_mode = 'custom' AND v_retail IS NULL THEN
    v_warnings := v_warnings || jsonb_build_array('Price on request until a fabricator quote is approved.');
  END IF;

  v_snapshot := jsonb_build_object(
    'productId', v_product.id,
    'productName', v_product.name,
    'configurationMode', v_product.configuration_mode,
    'pricingStrategy', v_product.configuration_pricing_strategy,
    'schemaRevision', v_product.configuration_revision,
    'variant', v_matched_variant,
    'selections', v_selection_snapshot,
    'components', v_component_snapshot,
    'retailPriceCents', v_retail,
    'tradePriceCents', v_trade,
    'leadTimeWeeks', v_lead,
    'dimensions', v_dimensions,
    'capturedAt', now()
  );

  RETURN jsonb_build_object(
    'valid', v_valid,
    'complete', v_complete,
    'violations', v_violations,
    'warnings', v_warnings,
    'normalizedSelection', v_selection,
    'componentQuantities', v_component_quantities,
    'componentState', v_component_state,
    'matchedVariant', v_matched_variant,
    'retailPriceCents', v_retail,
    'tradePriceCents', v_trade,
    'leadTimeWeeks', v_lead,
    'dimensions', v_dimensions,
    'schemaRevision', v_product.configuration_revision,
    'snapshot', v_snapshot
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._configuration_snapshot_hash(p_snapshot jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(convert_to((COALESCE(p_snapshot, '{}'::jsonb) - 'capturedAt')::text, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._product_configuration_json(p_configuration_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'configurationKey', c.configuration_key,
    'productId', c.product_id,
    'productVariantId', c.product_variant_id,
    'previousConfigurationId', c.previous_configuration_id,
    'projectId', c.project_id,
    'ffeItemId', c.ffe_item_id,
    'ownerUserId', c.owner_user_id,
    'studioId', c.studio_id,
    'version', c.version,
    'schemaRevision', c.schema_revision,
    'currentSchemaRevision', p.configuration_revision,
    'sourceChanged', c.schema_revision <> p.configuration_revision,
    'status', c.status,
    'name', c.name,
    'notes', c.notes,
    'customBrief', c.custom_brief,
    'evaluation', c.evaluation,
    'snapshot', c.snapshot,
    'snapshotHash', c.snapshot_hash,
    'isLibraryTemplate', c.is_library_template,
    'approvedAt', c.approved_at,
    'issuedAt', c.issued_at,
    'promotedAt', c.promoted_at,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at
  )
  FROM public.product_configurations c
  JOIN public.products p ON p.id = c.product_id
  WHERE c.id = p_configuration_id;
$$;

CREATE OR REPLACE FUNCTION public._custom_commission_revision_json(p_revision_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'configurationId', r.configuration_id,
    'productId', c.product_id,
    'configurationVersion', c.version,
    'name', c.name,
    'projectId', c.project_id,
    'snapshot', c.snapshot,
    'snapshotHash', c.snapshot_hash,
    'revisionNumber', r.revision_number,
    'previousRevisionId', r.previous_revision_id,
    'status', r.status,
    'brief', r.brief,
    'drawings', r.drawings,
    'quote', r.quote,
    'provenance', r.provenance,
    'transitionNote', r.transition_note,
    'createdBy', r.created_by,
    'approvedBy', r.approved_by,
    'submittedAt', r.submitted_at,
    'quotedAt', r.quoted_at,
    'approvedAt', r.approved_at,
    'issuedAt', r.issued_at,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  )
  FROM public.custom_commission_revisions r
  JOIN public.product_configurations c ON c.id = r.configuration_id
  WHERE r.id = p_revision_id;
$$;

CREATE OR REPLACE FUNCTION public._configuration_quote_snapshot(p_configuration_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN latest_revision.id IS NULL THEN c.snapshot ELSE c.snapshot || jsonb_build_object(
    'customCommission', jsonb_build_object(
      'revisionId', latest_revision.id,
      'revisionNumber', latest_revision.revision_number,
      'status', latest_revision.status,
      'brief', latest_revision.brief,
      'drawings', latest_revision.drawings,
      'quote', latest_revision.quote,
      'provenance', latest_revision.provenance
    )
  ) END
  FROM public.product_configurations c
  LEFT JOIN LATERAL (
    SELECT r.* FROM public.custom_commission_revisions r
    WHERE r.configuration_id = c.id
    ORDER BY r.revision_number DESC LIMIT 1
  ) latest_revision ON true
  WHERE c.id = p_configuration_id;
$$;

CREATE OR REPLACE FUNCTION public.save_product_configuration(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_product_id uuid;
  v_old_id uuid;
  v_old public.product_configurations;
  v_product public.products;
  v_project public.projects;
  v_configuration public.product_configurations;
  v_evaluation jsonb;
  v_snapshot jsonb;
  v_hash text;
  v_selected_ids uuid[] := '{}'::uuid[];
  v_group_entry record;
  v_value_ref text;
  v_value_id uuid;
  v_components jsonb;
  v_component_input jsonb;
  v_configuration_key uuid;
  v_version integer;
  v_project_id uuid;
  v_ffe_item_id uuid;
  v_variant_id uuid;
  v_studio_id uuid;
  v_latest_id uuid;
  v_custom_brief jsonb;
  v_custom_revision public.custom_commission_revisions;
  v_previous_custom_revision public.custom_commission_revisions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'configuration input must be an object' USING errcode = 'check_violation';
  END IF;
  v_product_id := NULLIF(p_input->>'productId', '')::uuid;
  v_project_id := NULLIF(p_input->>'projectId', '')::uuid;
  v_ffe_item_id := NULLIF(p_input->>'ffeItemId', '')::uuid;
  v_old_id := NULLIF(p_input->>'configurationId', '')::uuid;
  v_components := COALESCE(p_input->'components', '[]'::jsonb);

  IF NOT public._can_read_configurable_product(v_product_id) THEN
    RAISE EXCEPTION 'product not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_product FROM public.products WHERE id = v_product_id;
  v_custom_brief := p_input->'customBrief';
  IF v_product.configuration_mode = 'custom' THEN
    IF v_custom_brief IS NULL OR jsonb_typeof(v_custom_brief) <> 'object'
       OR length(btrim(COALESCE(v_custom_brief->>'summary', ''))) = 0 THEN
      RAISE EXCEPTION 'custom configuration requires a brief summary'
        USING errcode = 'check_violation';
    END IF;
    IF COALESCE(v_custom_brief->>'fabricatorVendorId', '') = '' THEN
      v_custom_brief := v_custom_brief - 'fabricatorVendorId';
    END IF;
  END IF;

  IF jsonb_typeof(COALESCE(p_input->'selections', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'selections must be an object' USING errcode = 'check_violation';
  END IF;
  IF jsonb_typeof(v_components) <> 'array' THEN
    RAISE EXCEPTION 'components must be an array' USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode IN ('standard', 'custom') AND (
       NULLIF(p_input->>'variantId', '') IS NOT NULL
       OR EXISTS (SELECT 1 FROM jsonb_each(COALESCE(p_input->'selections', '{}'::jsonb)))
       OR jsonb_array_length(v_components) > 0
     ) THEN
    RAISE EXCEPTION '% mode cannot save variants, option selections, or components',
      v_product.configuration_mode USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode = 'variant' AND jsonb_array_length(v_components) > 0 THEN
    RAISE EXCEPTION 'variant mode cannot save modular components'
      USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode = 'configured' AND NULLIF(p_input->>'variantId', '') IS NOT NULL THEN
    RAISE EXCEPTION 'configured mode cannot save an exact variant'
      USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode <> 'custom'
     AND p_input ? 'customBrief' AND p_input->'customBrief' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'customBrief is only valid for custom products'
      USING errcode = 'check_violation';
  END IF;
  FOR v_group_entry IN SELECT key, value FROM jsonb_each(COALESCE(p_input->'selections', '{}'::jsonb)) LOOP
    IF jsonb_typeof(v_group_entry.value) <> 'array' THEN
      RAISE EXCEPTION 'each selection value must be an array' USING errcode = 'check_violation';
    END IF;
    FOR v_value_ref IN SELECT jsonb_array_elements_text(v_group_entry.value) LOOP
      v_value_id := NULL;
      BEGIN
        v_value_id := v_value_ref::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        SELECT ov.id INTO v_value_id
        FROM public.product_option_values ov
        JOIN public.product_option_groups og ON og.id = ov.option_group_id
        WHERE og.product_id = v_product_id
          AND (og.code = v_group_entry.key OR og.id::text = v_group_entry.key)
          AND ov.code = v_value_ref;
      END;
      IF v_value_id IS NULL THEN
        RAISE EXCEPTION 'unknown option selection %:%', v_group_entry.key, v_value_ref
          USING errcode = 'foreign_key_violation';
      END IF;
      v_selected_ids := array_append(v_selected_ids, v_value_id);
    END LOOP;
  END LOOP;

  v_evaluation := public.evaluate_product_configuration(
    v_product_id,
    NULLIF(p_input->>'variantId', '')::uuid,
    v_selected_ids,
    v_components
  );
  IF NOT COALESCE((v_evaluation->>'valid')::boolean, false) THEN
    RAISE EXCEPTION 'invalid configuration: %', v_evaluation->'violations'
      USING errcode = 'check_violation';
  END IF;
  v_snapshot := v_evaluation->'snapshot';
  v_hash := public._configuration_snapshot_hash(v_snapshot);
  v_variant_id := NULLIF(v_evaluation#>>'{matchedVariant,id}', '')::uuid;

  IF v_project_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.projects WHERE id = v_project_id FOR SHARE;
    IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
      RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
    END IF;
    IF v_ffe_item_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.project_ffe_items WHERE id = v_ffe_item_id AND project_id = v_project_id
    ) THEN
      RAISE EXCEPTION 'FFE item does not belong to project' USING errcode = 'check_violation';
    END IF;
  ELSIF v_ffe_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'ffeItemId requires projectId' USING errcode = 'check_violation';
  END IF;

  IF v_old_id IS NOT NULL THEN
    IF NOT public._can_access_product_configuration(v_old_id) THEN
      RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
    END IF;
    SELECT * INTO STRICT v_old FROM public.product_configurations WHERE id = v_old_id FOR UPDATE;
    IF v_old.product_id <> v_product_id THEN
      RAISE EXCEPTION 'configuration belongs to another product' USING errcode = 'check_violation';
    END IF;
    IF v_old.project_id IS DISTINCT FROM v_project_id
       OR v_old.ffe_item_id IS DISTINCT FROM v_ffe_item_id THEN
      RAISE EXCEPTION 'configuration scope cannot change while versioning; instantiate a reusable template for another project'
        USING errcode = 'check_violation';
    END IF;
    IF p_input ? 'expectedVersion'
       AND (p_input->>'expectedVersion')::integer <> v_old.version THEN
      RAISE EXCEPTION 'configuration changed in another session'
        USING errcode = 'serialization_failure';
    END IF;
    v_configuration_key := v_old.configuration_key;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_configuration_key::text, 0));
    SELECT c.id, c.version + 1 INTO v_latest_id, v_version
    FROM public.product_configurations c
    WHERE c.configuration_key = v_configuration_key
    ORDER BY c.version DESC LIMIT 1;
    IF v_latest_id IS DISTINCT FROM v_old.id
       OR (p_input ? 'expectedVersion' AND (p_input->>'expectedVersion')::integer <> v_version - 1) THEN
      RAISE EXCEPTION 'configuration is not the latest version; refresh before saving'
        USING errcode = 'serialization_failure';
    END IF;
    IF v_old.status = 'saved' THEN
      UPDATE public.product_configurations SET status = 'superseded', updated_at = now() WHERE id = v_old.id;
    END IF;
  ELSE
    v_configuration_key := extensions.gen_random_uuid();
    v_version := 1;
  END IF;

  v_studio_id := CASE
    WHEN v_project_id IS NOT NULL THEN
      COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id))
    WHEN v_product.layer = 'studio' THEN v_product.studio_id
    WHEN v_product.layer = 'catalog' THEN public._primary_studio_for(auth.uid())
    ELSE NULL
  END;
  INSERT INTO public.product_configurations (
    configuration_key, product_id, product_variant_id, previous_configuration_id,
    project_id, ffe_item_id, owner_user_id, studio_id, version, schema_revision,
    status, name, notes, custom_brief, normalized_selection, component_quantities,
    evaluation, snapshot, snapshot_hash, is_complete, is_valid,
    retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions
  ) VALUES (
    v_configuration_key, v_product_id, v_variant_id, v_old_id,
    v_project_id, v_ffe_item_id, auth.uid(), v_studio_id, v_version,
    (v_evaluation->>'schemaRevision')::integer, 'saved',
    NULLIF(btrim(p_input->>'name'), ''), p_input->>'notes', v_custom_brief,
    v_evaluation->'normalizedSelection', v_evaluation->'componentQuantities',
    v_evaluation, v_snapshot, v_hash,
    (v_evaluation->>'complete')::boolean, (v_evaluation->>'valid')::boolean,
    NULLIF(v_evaluation->>'retailPriceCents', '')::integer,
    NULLIF(v_evaluation->>'tradePriceCents', '')::integer,
    NULLIF(v_evaluation->>'leadTimeWeeks', '')::integer,
    NULLIF(v_evaluation->'dimensions', 'null'::jsonb)
  ) RETURNING * INTO v_configuration;

  INSERT INTO public.product_configuration_selections (
    configuration_id, option_group_id, option_value_id, selection_snapshot
  )
  SELECT v_configuration.id, og.id, ov.id, jsonb_build_object(
    'optionGroupId', og.id, 'optionValueId', ov.id,
    'groupCode', og.code, 'valueCode', ov.code,
    'groupName', og.name, 'valueLabel', ov.label,
    'retailPriceDeltaCents', ov.retail_price_delta_cents,
    'tradePriceDeltaCents', ov.trade_price_delta_cents,
    'leadTimeDeltaWeeks', ov.lead_time_delta_weeks
  )
  FROM public.product_option_values ov
  JOIN public.product_option_groups og ON og.id = ov.option_group_id
  WHERE ov.id = ANY(v_selected_ids) AND og.product_id = v_product_id;

  FOR v_component_input IN SELECT value FROM jsonb_array_elements(v_components) LOOP
    INSERT INTO public.product_configuration_components (
      configuration_id, component_id, quantity, handedness, component_snapshot
    )
    SELECT v_configuration.id, c.id, (v_component_input->>'quantity')::integer,
      NULLIF(v_component_input->>'handedness', ''),
      jsonb_build_object(
        'componentId', c.id, 'code', c.code, 'name', c.name,
        'quantity', (v_component_input->>'quantity')::integer,
        'handedness', NULLIF(v_component_input->>'handedness', ''),
        'retailPriceCents', c.retail_price_cents,
        'tradePriceCents', c.trade_price_cents,
        'leadTimeWeeks', c.lead_time_weeks,
        'dimensions', c.dimensions
      )
    FROM public.product_components c
    WHERE c.id = (v_component_input->>'componentId')::uuid AND c.product_id = v_product_id;
  END LOOP;

  IF v_product.configuration_mode = 'custom' THEN
    SELECT r.* INTO v_previous_custom_revision
    FROM public.custom_commission_revisions r
    JOIN public.product_configurations lineage ON lineage.id = r.configuration_id
    WHERE lineage.configuration_key = v_configuration.configuration_key
    ORDER BY r.revision_number DESC LIMIT 1 FOR UPDATE OF r;
    IF FOUND AND v_previous_custom_revision.status IN ('submitted', 'quoted', 'client_review') THEN
      RAISE EXCEPTION 'resolve the active commission revision before saving another version'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    IF FOUND AND v_previous_custom_revision.status = 'draft' THEN
      UPDATE public.custom_commission_revisions
      SET status = 'superseded', updated_at = now()
      WHERE id = v_previous_custom_revision.id;
    END IF;
    INSERT INTO public.custom_commission_revisions (
      configuration_id, revision_number, previous_revision_id, status,
      brief, drawings, provenance, created_by
    ) VALUES (
      v_configuration.id, COALESCE(v_previous_custom_revision.revision_number, 0) + 1,
      v_previous_custom_revision.id, 'draft', v_custom_brief,
      COALESCE(v_custom_brief->'drawings', '[]'::jsonb),
      jsonb_build_object('source', 'configuration-save'), auth.uid()
    ) RETURNING * INTO v_custom_revision;
  END IF;

  RETURN jsonb_build_object(
    'configuration', public._product_configuration_json(v_configuration.id),
    'forkedFromConfigurationId', v_old_id,
    'customRevision', CASE WHEN v_custom_revision.id IS NULL THEN NULL
      ELSE public._custom_commission_revision_json(v_custom_revision.id) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_configuration(
  p_configuration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;
  RETURN public._product_configuration_json(p_configuration_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_product_configurations(
  p_product_id uuid,
  p_project_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public._can_read_configurable_product(p_product_id) THEN
    RAISE EXCEPTION 'product not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(public._product_configuration_json(latest.id) ORDER BY latest.created_at DESC)
    FROM (
      SELECT DISTINCT ON (c.configuration_key) c.id, c.created_at
      FROM public.product_configurations c
      WHERE c.product_id = p_product_id
        AND public._can_access_product_configuration(c.id)
        AND (p_project_id IS NULL OR c.project_id = p_project_id OR c.is_library_template)
      ORDER BY c.configuration_key, c.version DESC
    ) latest
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_product_configuration(
  p_configuration_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_configuration public.product_configurations;
  v_product_mode text;
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_configuration
  FROM public.product_configurations WHERE id = p_configuration_id FOR UPDATE;
  SELECT configuration_mode INTO STRICT v_product_mode
  FROM public.products WHERE id = v_configuration.product_id;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_configuration.version THEN
    RAISE EXCEPTION 'configuration changed in another session' USING errcode = 'serialization_failure';
  END IF;
  IF v_configuration.status <> 'saved' THEN
    RAISE EXCEPTION 'only a saved configuration can be approved' USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_product_mode = 'custom' THEN
    RAISE EXCEPTION 'custom configurations are approved through the commission approval workflow'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT v_configuration.is_valid OR NOT v_configuration.is_complete THEN
    RAISE EXCEPTION 'configuration must be valid and complete before approval'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE public.product_configurations
  SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = p_configuration_id;
  RETURN public._product_configuration_json(p_configuration_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_configuration_to_library(
  p_configuration_id uuid,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.product_configurations;
  v_template public.product_configurations;
  v_product_mode text;
  v_safe_brief jsonb;
  v_safe_snapshot jsonb;
  v_safe_evaluation jsonb;
  v_safe_hash text;
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_source
  FROM public.product_configurations WHERE id = p_configuration_id FOR UPDATE;
  IF v_source.status NOT IN ('approved', 'issued') THEN
    RAISE EXCEPTION 'only approved or issued configurations may be promoted'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('configuration-promotion:' || v_source.id::text, 0));
  SELECT configuration_mode INTO STRICT v_product_mode
  FROM public.products WHERE id = v_source.product_id;

  SELECT * INTO v_template
  FROM public.product_configurations
  WHERE previous_configuration_id = v_source.id
    AND is_library_template
    AND project_id IS NULL
    AND owner_user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    UPDATE public.product_configurations
    SET name = COALESCE(NULLIF(btrim(p_name), ''), name), updated_at = now()
    WHERE id = v_template.id;
    RETURN public._product_configuration_json(v_template.id);
  END IF;

  v_safe_brief := v_source.custom_brief;
  v_safe_snapshot := v_source.snapshot - 'customCommission';
  v_safe_evaluation := v_source.evaluation - 'customCommission';
  IF v_product_mode = 'custom' THEN
    v_safe_brief := jsonb_strip_nulls(jsonb_build_object(
      'summary', v_source.custom_brief->>'summary',
      'intent', v_source.custom_brief->>'intent',
      'requirements', v_source.custom_brief->'requirements',
      'materials', v_source.custom_brief->'materials',
      'finish', v_source.custom_brief->>'finish',
      'priceOnRequest', true
    ));
    v_safe_snapshot := v_safe_snapshot || jsonb_build_object(
      'retailPriceCents', NULL, 'tradePriceCents', NULL,
      'leadTimeWeeks', NULL, 'capturedAt', now()
    );
    v_safe_evaluation := v_safe_evaluation || jsonb_build_object(
      'retailPriceCents', NULL, 'tradePriceCents', NULL,
      'leadTimeWeeks', NULL, 'snapshot', v_safe_snapshot
    );
  END IF;
  v_safe_hash := public._configuration_snapshot_hash(v_safe_snapshot);

  INSERT INTO public.product_configurations (
    configuration_key, product_id, product_variant_id, previous_configuration_id,
    project_id, ffe_item_id, owner_user_id, studio_id, version, schema_revision,
    status, name, notes, custom_brief, normalized_selection, component_quantities,
    evaluation, snapshot, snapshot_hash, is_complete, is_valid,
    retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions,
    is_library_template, promoted_at
  ) VALUES (
    extensions.gen_random_uuid(), v_source.product_id,
    CASE WHEN v_product_mode = 'custom' THEN NULL ELSE v_source.product_variant_id END,
    v_source.id, NULL, NULL, auth.uid(),
    COALESCE(v_source.studio_id, public._primary_studio_for(auth.uid())),
    1, v_source.schema_revision, 'saved',
    COALESCE(NULLIF(btrim(p_name), ''), v_source.name), NULL, v_safe_brief,
    v_source.normalized_selection, v_source.component_quantities,
    v_safe_evaluation, v_safe_snapshot, v_safe_hash,
    v_source.is_complete, v_source.is_valid,
    CASE WHEN v_product_mode = 'custom' THEN NULL ELSE v_source.retail_price_cents END,
    CASE WHEN v_product_mode = 'custom' THEN NULL ELSE v_source.trade_price_cents END,
    CASE WHEN v_product_mode = 'custom' THEN NULL ELSE v_source.lead_time_weeks END,
    v_source.resolved_dimensions, true, now()
  ) RETURNING * INTO v_template;

  INSERT INTO public.product_configuration_selections (
    configuration_id, option_group_id, option_value_id, selection_snapshot
  )
  SELECT v_template.id, option_group_id, option_value_id, selection_snapshot
  FROM public.product_configuration_selections WHERE configuration_id = v_source.id;
  INSERT INTO public.product_configuration_components (
    configuration_id, component_id, quantity, handedness, component_snapshot
  )
  SELECT v_template.id, component_id, quantity, handedness, component_snapshot
  FROM public.product_configuration_components WHERE configuration_id = v_source.id;

  RETURN public._product_configuration_json(v_template.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.instantiate_product_configuration_template(
  p_template_configuration_id uuid,
  p_project_id uuid,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_template public.product_configurations;
  v_instance public.product_configurations;
  v_project public.projects;
  v_mode text;
  v_revision public.custom_commission_revisions;
BEGIN
  IF NOT public._can_access_product_configuration(p_template_configuration_id) THEN
    RAISE EXCEPTION 'configuration template not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_template
  FROM public.product_configurations
  WHERE id = p_template_configuration_id FOR SHARE;
  IF NOT v_template.is_library_template OR v_template.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'configuration is not a project-agnostic library template'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT configuration_mode INTO STRICT v_mode
  FROM public.products WHERE id = v_template.product_id;

  INSERT INTO public.product_configurations (
    configuration_key, product_id, product_variant_id, previous_configuration_id,
    project_id, owner_user_id, studio_id, version, schema_revision,
    status, name, notes, custom_brief, normalized_selection, component_quantities,
    evaluation, snapshot, snapshot_hash, is_complete, is_valid,
    retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions
  ) VALUES (
    extensions.gen_random_uuid(), v_template.product_id, v_template.product_variant_id,
    v_template.id, p_project_id, auth.uid(),
    COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)),
    1, v_template.schema_revision, 'saved',
    COALESCE(NULLIF(btrim(p_name), ''), v_template.name), NULL, v_template.custom_brief,
    v_template.normalized_selection, v_template.component_quantities,
    v_template.evaluation, v_template.snapshot, v_template.snapshot_hash,
    v_template.is_complete, v_template.is_valid,
    v_template.retail_price_cents, v_template.trade_price_cents,
    v_template.lead_time_weeks, v_template.resolved_dimensions
  ) RETURNING * INTO v_instance;

  INSERT INTO public.product_configuration_selections (
    configuration_id, option_group_id, option_value_id, selection_snapshot
  )
  SELECT v_instance.id, option_group_id, option_value_id, selection_snapshot
  FROM public.product_configuration_selections WHERE configuration_id = v_template.id;
  INSERT INTO public.product_configuration_components (
    configuration_id, component_id, quantity, handedness, component_snapshot
  )
  SELECT v_instance.id, component_id, quantity, handedness, component_snapshot
  FROM public.product_configuration_components WHERE configuration_id = v_template.id;

  IF v_mode = 'custom' THEN
    INSERT INTO public.custom_commission_revisions (
      configuration_id, revision_number, status, brief, drawings, provenance, created_by
    ) VALUES (
      v_instance.id, 1, 'draft', v_instance.custom_brief,
      '[]'::jsonb, jsonb_build_object(
        'source', 'library-template',
        'templateConfigurationId', v_template.id
      ), auth.uid()
    ) RETURNING * INTO v_revision;
  END IF;

  RETURN jsonb_build_object(
    'configuration', public._product_configuration_json(v_instance.id),
    'templateConfigurationId', v_template.id,
    'customRevision', CASE WHEN v_revision.id IS NULL THEN NULL
      ELSE public._custom_commission_revision_json(v_revision.id) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_configuration_quote_request(
  p_configuration_id uuid,
  p_vendor_id uuid,
  p_scope text DEFAULT NULL,
  p_timeline text DEFAULT NULL,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_configuration public.product_configurations;
  v_request public.vendor_quote_requests;
  v_quote_snapshot jsonb;
  v_quote_hash text;
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_configuration
  FROM public.product_configurations WHERE id = p_configuration_id FOR SHARE;
  IF v_configuration.project_id IS NULL THEN
    RAISE EXCEPTION 'a project configuration is required for a quote request'
      USING errcode = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id) THEN
    RAISE EXCEPTION 'vendor not found' USING errcode = 'foreign_key_violation';
  END IF;
  v_quote_snapshot := public._configuration_quote_snapshot(p_configuration_id);
  v_quote_hash := public._configuration_snapshot_hash(v_quote_snapshot);

  SELECT * INTO v_request
  FROM public.vendor_quote_requests
  WHERE configuration_id = p_configuration_id
    AND vendor_id = p_vendor_id
    AND status = 'draft'
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.vendor_quote_requests
    SET designer_id = auth.uid(),
        project_id = v_configuration.project_id,
        configuration_snapshot = v_quote_snapshot,
        configuration_snapshot_hash = v_quote_hash,
        scope = COALESCE(p_scope, scope),
        timeline = COALESCE(p_timeline, timeline),
        message = COALESCE(p_message, message),
        status = 'draft',
        updated_at = now()
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  ELSE
    INSERT INTO public.vendor_quote_requests (
      vendor_id, designer_id, project_id, configuration_id,
      configuration_snapshot, configuration_snapshot_hash,
      scope, timeline, message, status
    ) VALUES (
      p_vendor_id, auth.uid(), v_configuration.project_id, v_configuration.id,
      v_quote_snapshot, v_quote_hash,
      p_scope, p_timeline, p_message, 'draft'
    ) RETURNING * INTO v_request;
  END IF;

  RETURN jsonb_build_object(
    'id', v_request.id,
    'configurationId', v_request.configuration_id,
    'projectId', v_request.project_id,
    'vendorId', v_request.vendor_id,
    'designerId', v_request.designer_id,
    'status', v_request.status,
    'configurationSnapshot', v_request.configuration_snapshot,
    'configurationSnapshotHash', v_request.configuration_snapshot_hash,
    'scope', v_request.scope,
    'timeline', v_request.timeline,
    'message', v_request.message,
    'createdAt', v_request.created_at,
    'updatedAt', v_request.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_custom_commission_revision(
  p_configuration_id uuid,
  p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_configuration public.product_configurations;
  v_fork public.product_configurations;
  v_previous public.custom_commission_revisions;
  v_revision public.custom_commission_revisions;
  v_brief jsonb;
  v_vendor_id uuid;
  v_latest_configuration_id uuid;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'revision input must be a JSON object' USING errcode = 'check_violation';
  END IF;
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT c.* INTO STRICT v_configuration
  FROM public.product_configurations c
  JOIN public.products p ON p.id = c.product_id
  WHERE c.id = p_configuration_id AND p.configuration_mode = 'custom'
  FOR UPDATE OF c;
  IF v_configuration.status <> 'saved' THEN
    RAISE EXCEPTION 'start a new configuration version before revising an approved commission'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_configuration.configuration_key::text, 0));
  SELECT c.id INTO v_latest_configuration_id
  FROM public.product_configurations c
  WHERE c.configuration_key = v_configuration.configuration_key
  ORDER BY c.version DESC LIMIT 1 FOR UPDATE;
  IF v_latest_configuration_id IS DISTINCT FROM v_configuration.id THEN
    RAISE EXCEPTION 'configuration is not the latest version; refresh before revising'
      USING errcode = 'serialization_failure';
  END IF;
  v_brief := COALESCE(p_input->'brief', v_configuration.custom_brief);
  IF v_brief IS NULL OR jsonb_typeof(v_brief) <> 'object'
     OR length(btrim(COALESCE(v_brief->>'summary', ''))) = 0 THEN
    RAISE EXCEPTION 'custom commission brief needs a summary' USING errcode = 'check_violation';
  END IF;
  IF v_brief ? 'fabricatorVendorId' THEN
    BEGIN
      v_vendor_id := (v_brief->>'fabricatorVendorId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'fabricatorVendorId must be a UUID' USING errcode = 'check_violation';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor_id) THEN
      RAISE EXCEPTION 'fabricator vendor not found' USING errcode = 'foreign_key_violation';
    END IF;
  END IF;
  SELECT r.* INTO v_previous
  FROM public.custom_commission_revisions r
  JOIN public.product_configurations lineage ON lineage.id = r.configuration_id
  WHERE lineage.configuration_key = v_configuration.configuration_key
  ORDER BY r.revision_number DESC LIMIT 1 FOR UPDATE OF r;
  IF FOUND AND v_previous.status IN ('approved', 'issued') THEN
    RAISE EXCEPTION 'approved or issued commissions must fork through a new saved configuration'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF FOUND AND v_previous.status IN ('draft', 'submitted', 'quoted', 'client_review') THEN
    UPDATE public.custom_commission_revisions
    SET status = 'superseded', transition_note = 'Superseded by revision fork', updated_at = now()
    WHERE id = v_previous.id;
  END IF;

  UPDATE public.vendor_quote_requests
  SET status = 'closed', updated_at = now()
  WHERE configuration_id = v_configuration.id AND status = 'draft';

  UPDATE public.product_configurations
  SET status = 'superseded', updated_at = now()
  WHERE id = v_configuration.id;

  INSERT INTO public.product_configurations (
    configuration_key, product_id, product_variant_id, previous_configuration_id,
    project_id, ffe_item_id, owner_user_id, studio_id, version, schema_revision,
    status, name, notes, custom_brief, normalized_selection, component_quantities,
    evaluation, snapshot, snapshot_hash, is_complete, is_valid,
    retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions
  ) VALUES (
    v_configuration.configuration_key, v_configuration.product_id, NULL, v_configuration.id,
    v_configuration.project_id, v_configuration.ffe_item_id, auth.uid(), v_configuration.studio_id,
    v_configuration.version + 1, v_configuration.schema_revision,
    'saved', v_configuration.name, v_configuration.notes, v_brief,
    '{}'::jsonb, '{}'::jsonb, v_configuration.evaluation, v_configuration.snapshot,
    v_configuration.snapshot_hash, v_configuration.is_complete, v_configuration.is_valid,
    v_configuration.retail_price_cents, v_configuration.trade_price_cents,
    v_configuration.lead_time_weeks, v_configuration.resolved_dimensions
  ) RETURNING * INTO v_fork;

  INSERT INTO public.custom_commission_revisions (
    configuration_id, revision_number, previous_revision_id, status,
    brief, drawings, quote, provenance, created_by
  ) VALUES (
    v_fork.id, COALESCE(v_previous.revision_number, 0) + 1,
    v_previous.id, 'draft', v_brief,
    COALESCE(p_input->'drawings', v_brief->'drawings', '[]'::jsonb),
    COALESCE(p_input->'quote', '{}'::jsonb),
    COALESCE(p_input->'provenance', '{}'::jsonb) || jsonb_build_object(
      'forkedFromConfigurationId', v_configuration.id
    ), auth.uid()
  ) RETURNING * INTO v_revision;
  RETURN public._custom_commission_revision_json(v_revision.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_custom_commission_revision(
  p_revision_id uuid,
  p_target_status text,
  p_note text DEFAULT NULL,
  p_input jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revision public.custom_commission_revisions;
  v_configuration public.product_configurations;
  v_new_brief jsonb;
  v_enriched_snapshot jsonb;
  v_enriched_evaluation jsonb;
  v_new_hash text;
  v_quote_retail integer;
  v_quote_trade integer;
  v_quote_lead integer;
  v_quote jsonb;
  v_quote_retail_valid boolean;
  v_quote_trade_valid boolean;
  v_quote_lead_valid boolean;
  v_vendor_id uuid;
  v_designer_approved boolean;
  v_client_approved boolean;
BEGIN
  SELECT * INTO v_revision
  FROM public.custom_commission_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_access_product_configuration(v_revision.configuration_id) THEN
    RAISE EXCEPTION 'revision not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_target_status = 'issued' THEN
    RAISE EXCEPTION 'issuance occurs atomically with project placement'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT (
    (v_revision.status = 'draft' AND p_target_status = 'submitted')
    OR (v_revision.status = 'submitted' AND p_target_status = 'quoted')
    OR (v_revision.status = 'quoted' AND p_target_status = 'client_review')
    OR (v_revision.status = 'client_review' AND p_target_status IN ('approved', 'rejected'))
  ) THEN
    RAISE EXCEPTION 'invalid custom commission transition % -> %', v_revision.status, p_target_status
      USING errcode = 'check_violation';
  END IF;
  IF p_target_status IN ('quoted', 'approved') THEN
    v_quote := CASE
      WHEN p_target_status = 'quoted' THEN p_input->'quote'
      ELSE v_revision.quote
    END;
    IF jsonb_typeof(v_quote) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'a priced quote is required for %', p_target_status
        USING errcode = 'check_violation';
    END IF;
    v_quote_retail_valid := CASE
      WHEN jsonb_typeof(v_quote->'retailPriceCents') = 'number' THEN
        (v_quote->>'retailPriceCents')::numeric BETWEEN 0 AND 2147483647
        AND trunc((v_quote->>'retailPriceCents')::numeric)
          = (v_quote->>'retailPriceCents')::numeric
      ELSE false
    END;
    v_quote_trade_valid := CASE
      WHEN jsonb_typeof(v_quote->'tradePriceCents') = 'number' THEN
        (v_quote->>'tradePriceCents')::numeric BETWEEN 0 AND 2147483647
        AND trunc((v_quote->>'tradePriceCents')::numeric)
          = (v_quote->>'tradePriceCents')::numeric
      ELSE false
    END;
    v_quote_lead_valid := CASE
      WHEN jsonb_typeof(v_quote->'leadTimeWeeks') = 'number' THEN
        (v_quote->>'leadTimeWeeks')::numeric BETWEEN 0 AND 2147483647
        AND trunc((v_quote->>'leadTimeWeeks')::numeric)
          = (v_quote->>'leadTimeWeeks')::numeric
      ELSE false
    END;
    IF NOT v_quote_retail_valid AND NOT v_quote_trade_valid THEN
      RAISE EXCEPTION 'quote needs a nonnegative retailPriceCents or tradePriceCents amount'
        USING errcode = 'check_violation';
    END IF;
    IF v_quote ? 'retailPriceCents'
       AND v_quote->'retailPriceCents' <> 'null'::jsonb
       AND NOT v_quote_retail_valid THEN
      RAISE EXCEPTION 'retailPriceCents must be a nonnegative integer'
        USING errcode = 'check_violation';
    END IF;
    IF v_quote ? 'tradePriceCents'
       AND v_quote->'tradePriceCents' <> 'null'::jsonb
       AND NOT v_quote_trade_valid THEN
      RAISE EXCEPTION 'tradePriceCents must be a nonnegative integer'
        USING errcode = 'check_violation';
    END IF;
    IF v_quote ? 'leadTimeWeeks'
       AND v_quote->'leadTimeWeeks' <> 'null'::jsonb
       AND NOT v_quote_lead_valid THEN
      RAISE EXCEPTION 'leadTimeWeeks must be a nonnegative integer'
        USING errcode = 'check_violation';
    END IF;
  END IF;

  v_new_brief := v_revision.brief;
  IF v_revision.status = 'client_review' THEN
    v_designer_approved := COALESCE((p_input#>>'{approval,designerApproved}')::boolean, false);
    v_client_approved := COALESCE((p_input#>>'{approval,clientApproved}')::boolean, false);
    IF p_target_status = 'approved' AND (NOT v_designer_approved OR NOT v_client_approved) THEN
      RAISE EXCEPTION 'designer and client approvals are both required'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    v_new_brief := jsonb_set(v_new_brief, '{designerApproval}', jsonb_build_object(
      'status', CASE WHEN v_designer_approved THEN 'approved' ELSE 'rejected' END,
      'approvedBy', auth.uid(), 'approvedAt', now(), 'note', p_note
    ), true);
    v_new_brief := jsonb_set(v_new_brief, '{clientApproval}', jsonb_build_object(
      'status', CASE WHEN v_client_approved THEN 'approved' ELSE 'rejected' END,
      'approvedAt', now(), 'note', p_note
    ), true);
  END IF;

  UPDATE public.custom_commission_revisions
  SET status = p_target_status,
      brief = v_new_brief,
      quote = CASE WHEN p_target_status = 'quoted' THEN COALESCE(p_input->'quote', quote) ELSE quote END,
      transition_note = p_note,
      submitted_at = CASE WHEN p_target_status = 'submitted' THEN now() ELSE submitted_at END,
      quoted_at = CASE WHEN p_target_status = 'quoted' THEN now() ELSE quoted_at END,
      approved_by = CASE WHEN p_target_status = 'approved' THEN auth.uid() ELSE approved_by END,
      approved_at = CASE WHEN p_target_status = 'approved' THEN now() ELSE approved_at END,
      updated_at = now()
  WHERE id = p_revision_id
  RETURNING * INTO v_revision;

  IF p_target_status IN ('submitted', 'quoted') AND v_revision.brief ? 'fabricatorVendorId' THEN
    v_vendor_id := (v_revision.brief->>'fabricatorVendorId')::uuid;
    PERFORM public.prepare_configuration_quote_request(
      v_revision.configuration_id,
      v_vendor_id,
      v_revision.brief->>'summary',
      v_revision.brief->>'targetDate',
      p_note
    );
  END IF;
  IF p_target_status = 'approved' THEN
    SELECT * INTO STRICT v_configuration
    FROM public.product_configurations
    WHERE id = v_revision.configuration_id FOR UPDATE;
    IF v_configuration.status <> 'saved' THEN
      RAISE EXCEPTION 'commission configuration is no longer editable'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    IF NOT v_configuration.is_valid OR NOT v_configuration.is_complete THEN
      RAISE EXCEPTION 'custom configuration must already be valid and complete before approval'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    v_quote_retail := NULLIF(v_revision.quote->>'retailPriceCents', '')::integer;
    v_quote_trade := NULLIF(v_revision.quote->>'tradePriceCents', '')::integer;
    v_quote_lead := NULLIF(v_revision.quote->>'leadTimeWeeks', '')::integer;
    v_enriched_snapshot := v_configuration.snapshot || jsonb_build_object(
      'customCommission', jsonb_build_object(
        'revisionId', v_revision.id,
        'revisionNumber', v_revision.revision_number,
        'status', v_revision.status,
        'brief', v_revision.brief,
        'drawings', v_revision.drawings,
        'quote', v_revision.quote,
        'provenance', v_revision.provenance,
        'approvedAt', v_revision.approved_at
      ),
      'retailPriceCents', v_quote_retail,
      'tradePriceCents', v_quote_trade,
      'leadTimeWeeks', COALESCE(v_quote_lead, v_configuration.lead_time_weeks)
    );
    v_new_hash := public._configuration_snapshot_hash(v_enriched_snapshot);
    v_enriched_evaluation := v_configuration.evaluation
      || jsonb_build_object(
        'retailPriceCents', v_quote_retail,
        'tradePriceCents', v_quote_trade,
        'leadTimeWeeks', COALESCE(v_quote_lead, v_configuration.lead_time_weeks),
        'snapshot', v_enriched_snapshot,
        'complete', v_configuration.is_complete,
        'valid', v_configuration.is_valid
      );
    UPDATE public.product_configurations
    SET status = 'approved',
        custom_brief = v_revision.brief,
        evaluation = v_enriched_evaluation,
        snapshot = v_enriched_snapshot,
        snapshot_hash = v_new_hash,
        retail_price_cents = v_quote_retail,
        trade_price_cents = v_quote_trade,
        lead_time_weeks = COALESCE(v_quote_lead, lead_time_weeks),
        approved_by = auth.uid(),
        approved_at = now(),
        updated_at = now()
    WHERE id = v_configuration.id;
  END IF;
  RETURN public._custom_commission_revision_json(p_revision_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_custom_commission_revisions(p_configuration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(public._custom_commission_revision_json(r.id) ORDER BY r.revision_number DESC)
    FROM public.custom_commission_revisions r
    JOIN public.product_configurations lineage ON lineage.id = r.configuration_id
    JOIN public.product_configurations current_configuration
      ON current_configuration.id = p_configuration_id
     AND current_configuration.configuration_key = lineage.configuration_key
    WHERE public._can_access_product_configuration(r.configuration_id)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public._custom_commission_milestone_json(p_milestone_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', m.id,
    'configurationId', m.configuration_id,
    'revisionId', m.revision_id,
    'projectId', m.project_id,
    'milestoneType', m.milestone_type,
    'status', m.status,
    'evidence', m.evidence,
    'artifacts', m.artifacts,
    'createdBy', m.created_by,
    'completedBy', m.completed_by,
    'completedAt', m.completed_at,
    'createdAt', m.created_at,
    'updatedAt', m.updated_at,
    'sourceChanged', c.schema_revision <> p.configuration_revision,
    'currentSchemaRevision', p.configuration_revision,
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'eventNumber', e.event_number,
        'fromStatus', e.from_status,
        'toStatus', e.to_status,
        'evidence', e.evidence,
        'artifacts', e.artifacts,
        'note', e.note,
        'actorId', e.actor_id,
        'createdAt', e.created_at
      ) ORDER BY e.event_number)
      FROM public.custom_commission_milestone_events e
      WHERE e.milestone_id = m.id
    ), '[]'::jsonb)
  )
  FROM public.custom_commission_milestones m
  JOIN public.product_configurations c ON c.id = m.configuration_id
  JOIN public.products p ON p.id = c.product_id
  WHERE m.id = p_milestone_id;
$$;

CREATE OR REPLACE FUNCTION public.list_custom_commission_milestones(p_configuration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(public._custom_commission_milestone_json(m.id)
      ORDER BY CASE m.milestone_type WHEN 'submittal' THEN 1 WHEN 'receiving' THEN 2 ELSE 3 END)
    FROM public.custom_commission_milestones m
    WHERE m.configuration_id = p_configuration_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_custom_commission_milestone(
  p_configuration_id uuid,
  p_milestone_type text,
  p_status text,
  p_evidence jsonb,
  p_artifacts jsonb,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_configuration public.product_configurations;
  v_revision public.custom_commission_revisions;
  v_milestone public.custom_commission_milestones;
  v_from_status text;
  v_event_number integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(COALESCE(p_evidence, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_artifacts, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'milestone evidence must be an object and artifacts must be an array'
      USING errcode = 'check_violation';
  END IF;
  IF NOT (
    (p_milestone_type = 'submittal' AND p_status IN ('pending','approved','rejected'))
    OR (p_milestone_type = 'receiving' AND p_status IN ('pending','received','rejected'))
    OR (p_milestone_type = 'installed' AND p_status IN ('pending','installed','rejected'))
  ) THEN
    RAISE EXCEPTION 'invalid % milestone status %', p_milestone_type, p_status
      USING errcode = 'check_violation';
  END IF;
  SELECT c.* INTO v_configuration
  FROM public.product_configurations c
  JOIN public.products p ON p.id = c.product_id
  WHERE c.id = p_configuration_id AND p.configuration_mode = 'custom'
  FOR SHARE OF c;
  IF NOT FOUND OR v_configuration.status <> 'issued' OR v_configuration.project_id IS NULL THEN
    RAISE EXCEPTION 'custom fulfillment requires an issued project configuration'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_revision FROM public.custom_commission_revisions
  WHERE configuration_id = p_configuration_id
  ORDER BY revision_number DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND OR v_revision.status <> 'issued' THEN
    RAISE EXCEPTION 'custom fulfillment requires an issued commission revision'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_ffe_specs s
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    WHERE s.configuration_id = p_configuration_id
      AND s.configuration_locked_at IS NOT NULL
      AND i.project_id = v_configuration.project_id
      AND i.purchase_order_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'custom fulfillment begins only after the issued snapshot is on a purchase order'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF p_milestone_type = 'receiving' AND NOT EXISTS (
    SELECT 1 FROM public.custom_commission_milestones
    WHERE configuration_id = v_configuration.id
      AND revision_id = v_revision.id
      AND milestone_type = 'submittal' AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'submittal must be approved before receiving'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF p_milestone_type = 'installed' AND NOT EXISTS (
    SELECT 1 FROM public.custom_commission_milestones
    WHERE configuration_id = p_configuration_id
      AND revision_id = v_revision.id
      AND milestone_type = 'receiving' AND status = 'received'
  ) THEN
    RAISE EXCEPTION 'receiving must be recorded before installed truth'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF p_status NOT IN ('pending','rejected')
     AND COALESCE(p_evidence, '{}'::jsonb) = '{}'::jsonb
     AND jsonb_array_length(COALESCE(p_artifacts, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'completed milestones require evidence or an artifact'
      USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_milestone
  FROM public.custom_commission_milestones
  WHERE revision_id = v_revision.id AND milestone_type = p_milestone_type
  FOR UPDATE;
  IF FOUND THEN
    IF v_milestone.status NOT IN ('pending', 'rejected') THEN
      RAISE EXCEPTION 'terminal milestone % is immutable', v_milestone.id
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    v_from_status := v_milestone.status;
    UPDATE public.custom_commission_milestones
    SET status = p_status,
        evidence = COALESCE(p_evidence, '{}'::jsonb),
        artifacts = COALESCE(p_artifacts, '[]'::jsonb),
        completed_by = CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
        completed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END,
        updated_at = now()
    WHERE id = v_milestone.id
    RETURNING * INTO v_milestone;
  ELSE
    v_from_status := NULL;
    INSERT INTO public.custom_commission_milestones (
      configuration_id, revision_id, project_id, milestone_type, status,
      evidence, artifacts, created_by, completed_by, completed_at
    ) VALUES (
      p_configuration_id, v_revision.id, v_configuration.project_id,
      p_milestone_type, p_status, COALESCE(p_evidence, '{}'::jsonb),
      COALESCE(p_artifacts, '[]'::jsonb), auth.uid(),
      CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
      CASE WHEN p_status = 'pending' THEN NULL ELSE now() END
    ) RETURNING * INTO v_milestone;
  END IF;
  SELECT COALESCE(max(event_number), 0) + 1 INTO v_event_number
  FROM public.custom_commission_milestone_events WHERE milestone_id = v_milestone.id;
  INSERT INTO public.custom_commission_milestone_events (
    milestone_id, event_number, from_status, to_status,
    evidence, artifacts, note, actor_id
  ) VALUES (
    v_milestone.id, v_event_number, v_from_status, p_status,
    v_milestone.evidence, v_milestone.artifacts, p_note, auth.uid()
  );
  IF p_milestone_type = 'installed' AND p_status = 'installed' THEN
    UPDATE public.project_ffe_items i
    SET status = 'installed', updated_at = now()
    FROM public.project_ffe_specs s
    WHERE s.ffe_item_id = i.id AND s.configuration_id = p_configuration_id;
  END IF;
  RETURN public._custom_commission_milestone_json(v_milestone.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.place_product_configuration_in_project(
  p_project_id uuid,
  p_configuration_id uuid,
  p_room_id uuid DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_source jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_configuration public.product_configurations;
  v_product public.products;
  v_project public.projects;
  v_source_configuration_id uuid;
  v_custom_revision public.custom_commission_revisions;
  v_place jsonb;
  v_instantiation jsonb;
  v_item_id uuid;
  v_spec_id uuid;
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_configuration
  FROM public.product_configurations WHERE id = p_configuration_id FOR UPDATE;
  SELECT * INTO STRICT v_product FROM public.products WHERE id = v_configuration.product_id;
  IF v_configuration.project_id IS NULL THEN
    v_source_configuration_id := v_configuration.id;
    IF v_configuration.is_library_template THEN
      v_instantiation := public.instantiate_product_configuration_template(
        v_configuration.id, p_project_id, v_configuration.name
      );
      SELECT * INTO STRICT v_configuration
      FROM public.product_configurations
      WHERE id = (v_instantiation#>>'{configuration,id}')::uuid
      FOR UPDATE;
    ELSE
      IF v_product.configuration_mode = 'custom' THEN
        RAISE EXCEPTION 'projectless custom configurations must be promoted and explicitly instantiated before approval'
          USING errcode = 'object_not_in_prerequisite_state';
      END IF;
      SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
      IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
        RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
      END IF;
      INSERT INTO public.product_configurations (
        configuration_key, product_id, product_variant_id, previous_configuration_id,
        project_id, owner_user_id, studio_id, version, schema_revision,
        status, name, notes, custom_brief, normalized_selection, component_quantities,
        evaluation, snapshot, snapshot_hash, is_complete, is_valid,
        retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions
      ) VALUES (
        extensions.gen_random_uuid(), v_configuration.product_id,
        v_configuration.product_variant_id, v_source_configuration_id,
        p_project_id, auth.uid(),
        COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)),
        1, v_configuration.schema_revision, 'saved', v_configuration.name,
        v_configuration.notes, NULL, v_configuration.normalized_selection,
        v_configuration.component_quantities, v_configuration.evaluation,
        v_configuration.snapshot, v_configuration.snapshot_hash,
        v_configuration.is_complete, v_configuration.is_valid,
        v_configuration.retail_price_cents, v_configuration.trade_price_cents,
        v_configuration.lead_time_weeks, v_configuration.resolved_dimensions
      ) RETURNING * INTO v_configuration;
      INSERT INTO public.product_configuration_selections (
        configuration_id, option_group_id, option_value_id, selection_snapshot
      )
      SELECT v_configuration.id, option_group_id, option_value_id, selection_snapshot
      FROM public.product_configuration_selections
      WHERE configuration_id = v_source_configuration_id;
      INSERT INTO public.product_configuration_components (
        configuration_id, component_id, quantity, handedness, component_snapshot
      )
      SELECT v_configuration.id, component_id, quantity, handedness, component_snapshot
      FROM public.product_configuration_components
      WHERE configuration_id = v_source_configuration_id;
    END IF;
  END IF;
  IF NOT v_configuration.is_valid OR NOT v_configuration.is_complete THEN
    RAISE EXCEPTION 'configuration must be valid and complete before placement'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_configuration.project_id IS NOT NULL AND v_configuration.project_id <> p_project_id THEN
    RAISE EXCEPTION 'configuration belongs to another project' USING errcode = 'check_violation';
  END IF;

  IF v_product.configuration_mode = 'custom' THEN
    IF v_configuration.status <> 'approved' THEN
      RAISE EXCEPTION 'custom configuration must be approved before placement'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    SELECT * INTO v_custom_revision
    FROM public.custom_commission_revisions
    WHERE configuration_id = v_configuration.id
    ORDER BY revision_number DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR v_custom_revision.status <> 'approved'
       OR v_custom_revision.brief#>>'{designerApproval,status}' <> 'approved'
       OR v_custom_revision.brief#>>'{clientApproval,status}' <> 'approved' THEN
      RAISE EXCEPTION 'latest custom commission revision needs designer and client approval'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
  END IF;

  v_place := public.place_product_in_project(
    p_project_id, v_configuration.product_id, p_room_id, p_slot_id, p_category,
    COALESCE(p_source, '{}'::jsonb) || jsonb_build_object(
      'configurationId', v_configuration.id,
      'configurationVersion', v_configuration.version,
      'configurationSnapshotHash', v_configuration.snapshot_hash
    )
  );
  v_item_id := (v_place->>'ffeItemId')::uuid;
  v_spec_id := (v_place->>'specId')::uuid;

  UPDATE public.product_configurations
  SET ffe_item_id = v_item_id, updated_at = now()
  WHERE id = v_configuration.id
    AND (ffe_item_id IS NULL OR ffe_item_id = v_item_id)
  RETURNING * INTO v_configuration;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'configuration is already bound to another FF&E line'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  UPDATE public.project_ffe_items
  SET trade_price_cents = COALESCE(v_configuration.trade_price_cents,
        v_configuration.retail_price_cents, trade_price_cents),
      unit_price_cents = COALESCE(v_configuration.retail_price_cents,
        v_configuration.trade_price_cents, unit_price_cents),
      line_total_cents = quantity * COALESCE(v_configuration.retail_price_cents,
        v_configuration.trade_price_cents, unit_price_cents, 0),
      updated_at = now()
  WHERE id = v_item_id;

  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  UPDATE public.project_ffe_specs
  SET configuration_id = v_configuration.id,
      configuration_snapshot = v_configuration.snapshot,
      configuration_snapshot_hash = v_configuration.snapshot_hash,
      configuration_locked_at = CASE
        WHEN v_configuration.status IN ('approved', 'issued')
          OR v_product.configuration_mode = 'custom' THEN now()
        ELSE NULL
      END,
      selected_dimensions = v_configuration.resolved_dimensions,
      sku = COALESCE(NULLIF(v_configuration.snapshot#>>'{variant,vendorSku}', ''),
        NULLIF(v_configuration.snapshot#>>'{variant,sku}', ''), sku),
      material = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'material'
      ), material),
      finish = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'finish'
      ), finish),
      routing_source = routing_source || jsonb_build_object(
        'configurationVersion', v_configuration.version,
        'configurationSnapshotHash', v_configuration.snapshot_hash
      ),
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = v_spec_id;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);

  IF v_product.configuration_mode = 'custom' THEN
    UPDATE public.custom_commission_revisions
    SET status = 'issued', issued_at = now(), transition_note = 'Issued with project specification', updated_at = now()
    WHERE id = v_custom_revision.id;
    UPDATE public.product_configurations
    SET status = 'issued', issued_at = now(), updated_at = now()
    WHERE id = v_configuration.id;
  END IF;

  RETURN v_place || jsonb_build_object(
    'productId', v_configuration.product_id,
    'configurationId', v_configuration.id,
    'configurationVersion', v_configuration.version,
    'configurationSnapshotHash', v_configuration.snapshot_hash,
    'configurationLockedAt', (SELECT configuration_locked_at FROM public.project_ffe_specs WHERE id = v_spec_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revise_project_ffe_configuration(
  p_project_id uuid,
  p_ffe_item_id uuid,
  p_expected_configuration_id uuid,
  p_expected_configuration_version integer,
  p_expected_snapshot_hash text,
  p_new_configuration_id uuid,
  p_expected_new_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects;
  v_item public.project_ffe_items;
  v_spec public.project_ffe_specs;
  v_current public.product_configurations;
  v_new public.product_configurations;
  v_new_mode text;
  v_expected_unit integer;
  v_expected_trade integer;
  v_history jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_item FROM public.project_ffe_items
  WHERE id = p_ffe_item_id AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FF&E line not found in project' USING errcode = 'no_data_found';
  END IF;
  IF v_item.purchase_order_id IS NOT NULL
     OR v_item.status IN ('ordered','production','shipped','delivered','installed') THEN
    RAISE EXCEPTION 'ordered or fulfilled lines require a new FF&E line, not an in-place revision'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_spec FROM public.project_ffe_specs
  WHERE ffe_item_id = p_ffe_item_id FOR UPDATE;
  IF NOT FOUND OR v_spec.configuration_id IS DISTINCT FROM p_expected_configuration_id
     OR v_spec.configuration_snapshot_hash IS DISTINCT FROM p_expected_snapshot_hash THEN
    RAISE EXCEPTION 'project specification changed in another session'
      USING errcode = 'serialization_failure';
  END IF;
  IF NOT public._can_access_product_configuration(p_expected_configuration_id)
     OR NOT public._can_access_product_configuration(p_new_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_current FROM public.product_configurations
  WHERE id = p_expected_configuration_id FOR SHARE;
  SELECT * INTO STRICT v_new FROM public.product_configurations
  WHERE id = p_new_configuration_id FOR UPDATE;
  SELECT configuration_mode INTO STRICT v_new_mode
  FROM public.products WHERE id = v_new.product_id;
  IF v_new_mode = 'custom' THEN
    RAISE EXCEPTION 'custom commission changes require their approval/issuance lifecycle and a new project line'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_current.version <> p_expected_configuration_version
     OR v_new.version <> p_expected_new_version THEN
    RAISE EXCEPTION 'configuration version changed in another session'
      USING errcode = 'serialization_failure';
  END IF;
  IF v_spec.configuration_snapshot IS DISTINCT FROM v_current.snapshot
     OR v_current.snapshot_hash IS DISTINCT FROM p_expected_snapshot_hash
     OR v_current.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_current.snapshot) THEN
    RAISE EXCEPTION 'current project snapshot does not match its configuration source'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_new.id = v_current.id OR v_new.status <> 'saved'
     OR v_new.is_library_template
     OR v_new.project_id IS DISTINCT FROM p_project_id
     OR v_new.product_id IS DISTINCT FROM v_item.product_id
     OR (v_new.ffe_item_id IS NOT NULL AND v_new.ffe_item_id <> v_item.id)
     OR NOT v_new.is_valid OR NOT v_new.is_complete
     OR v_new.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_new.snapshot) THEN
    RAISE EXCEPTION 'replacement must be a valid, complete saved configuration instantiated for this project and product'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  v_expected_unit := COALESCE(v_new.retail_price_cents, v_new.trade_price_cents);
  v_expected_trade := COALESCE(v_new.trade_price_cents, v_new.retail_price_cents);
  v_history := COALESCE(v_spec.routing_source->'configurationHistory', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'fromConfigurationId', v_current.id,
      'fromVersion', v_current.version,
      'fromSnapshotHash', v_current.snapshot_hash,
      'toConfigurationId', v_new.id,
      'toVersion', v_new.version,
      'toSnapshotHash', v_new.snapshot_hash,
      'revisedBy', auth.uid(),
      'revisedAt', now()
    ));
  UPDATE public.product_configurations
  SET ffe_item_id = COALESCE(ffe_item_id, v_item.id), updated_at = now()
  WHERE id = v_new.id;

  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  UPDATE public.project_ffe_specs
  SET configuration_id = v_new.id,
      configuration_snapshot = v_new.snapshot,
      configuration_snapshot_hash = v_new.snapshot_hash,
      configuration_locked_at = NULL,
      selected_dimensions = v_new.resolved_dimensions,
      sku = COALESCE(NULLIF(v_new.snapshot#>>'{variant,vendorSku}', ''),
        NULLIF(v_new.snapshot#>>'{variant,sku}', ''), sku),
      material = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_new.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'material'
      ), material),
      finish = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_new.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'finish'
      ), finish),
      routing_source = routing_source || jsonb_build_object('configurationHistory', v_history),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_spec.id;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);
  UPDATE public.project_ffe_items
  SET status = 'specified',
      unit_price_cents = v_expected_unit,
      trade_price_cents = v_expected_trade,
      line_total_cents = CASE WHEN v_expected_unit IS NULL THEN NULL
        ELSE quantity * v_expected_unit END,
      updated_at = now()
  WHERE id = v_item.id;

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'ffeItemId', v_item.id,
    'specId', v_spec.id,
    'configurationId', v_new.id,
    'configurationVersion', v_new.version,
    'configurationSnapshotHash', v_new.snapshot_hash,
    'status', 'specified',
    'requiresApproval', true
  );
END;
$$;

-- 00380 snapshot materializer, extended so configuration identity and the
-- exact locked snapshot participate in immutable revision content and hashes.
-- The envelope is deliberately outside selection/pricing; non-internal
-- render audiences use an allow-listed DTO and drop unknown fields.
CREATE OR REPLACE FUNCTION public._spec_book_current_item_snapshots(p_spec_book_id uuid)
RETURNS TABLE (
  ffe_item_id uuid,
  item_type text,
  document_code text,
  chapter_position integer,
  item_position integer,
  item_snapshot jsonb,
  content_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH source AS (
    SELECT
      i.id AS ffe_item_id,
      i.item_type,
      i.doc_code,
      COALESCE(c.position, 2147483647) AS chapter_position,
      s.position AS item_position,
      jsonb_strip_nulls(jsonb_build_object(
        'ffeItemId', i.id,
        'itemType', i.item_type,
        'documentCode', i.doc_code,
        'name', i.name,
        'projectId', i.project_id,
        'room', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', r.id, 'name', r.name
        ) END,
        'quantity', i.quantity,
        'category', i.ffe_category,
        'selectedMedia', CASE
          WHEN jsonb_array_length(sp.selected_media) > 0 THEN sp.selected_media
          ELSE COALESCE(to_jsonb(p.images), '[]'::jsonb)
        END,
        'selection', jsonb_build_object(
          'sku', public._spec_book_resolve_field(
            to_jsonb(sp.sku), i.custom_fields->'sku', to_jsonb(p.sku),
            p.capture_provenance#>'{studioCustom,sku}', sp.na_declarations->'sku',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'sku', '')::timestamptz
          ),
          'finish', public._spec_book_resolve_field(
            to_jsonb(sp.finish), i.custom_fields->'finish', to_jsonb(p.finish),
            p.capture_provenance#>'{studioCustom,finish}', sp.na_declarations->'finish',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'finish', '')::timestamptz
          ),
          'material', public._spec_book_resolve_field(
            to_jsonb(sp.material), i.custom_fields->'material', to_jsonb(p.materials),
            p.capture_provenance#>'{studioCustom,material}', sp.na_declarations->'material',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'material', '')::timestamptz
          ),
          'colorFabric', public._spec_book_resolve_field(
            to_jsonb(sp.color_fabric), i.custom_fields->'colorFabric', to_jsonb(p.colors),
            p.capture_provenance#>'{studioCustom,colorFabric}', sp.na_declarations->'colorFabric',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'colorFabric', '')::timestamptz
          ),
          'dimensions', public._spec_book_resolve_field(
            sp.selected_dimensions, i.custom_fields->'dimensions', p.dimensions,
            p.capture_provenance#>'{studioCustom,dimensions}', sp.na_declarations->'dimensions',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'dimensions', '')::timestamptz
          ),
          'exactLocation', public._spec_book_resolve_field(
            to_jsonb(sp.exact_location), i.custom_fields->'exactLocation', NULL,
            p.capture_provenance#>'{studioCustom,exactLocation}', sp.na_declarations->'exactLocation',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'exactLocation', '')::timestamptz
          )
        ),
        'notes', jsonb_build_object(
          'client', sp.client_notes,
          'trade', sp.trade_notes,
          'install', sp.install_notes,
          'private', i.notes,
          'care', sp.care_notes,
          'warranty', sp.warranty_notes
        ),
        'pricing', jsonb_build_object(
          'clientPriceCents', i.unit_price_cents,
          'tradePriceCents', i.trade_price_cents,
          'markupPercent', i.markup_percent
        ),
        'vendor', jsonb_build_object(
          'id', i.vendor_id,
          'name', i.vendor_name,
          'internalContact', p.vendor_contact
        ),
        'configuration', CASE WHEN sp.configuration_id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', sp.configuration_id,
          'snapshot', sp.configuration_snapshot,
          'snapshotHash', sp.configuration_snapshot_hash,
          'lockedAt', sp.configuration_locked_at
        ) END,
        'provenance', sp.field_provenance,
        'sourceVerification', sp.source_verifications,
        'naDeclarations', sp.na_declarations,
        'readinessStatus', sp.readiness_status,
        'rowVersion', sp.row_version
      )) AS snapshot
    FROM public.spec_book_item_settings s
    JOIN public.spec_books b ON b.id = s.spec_book_id
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    JOIN public.project_ffe_specs sp ON sp.ffe_item_id = i.id
    LEFT JOIN public.spec_book_chapters c ON c.id = s.chapter_id
    LEFT JOIN public.project_rooms r ON r.id = i.project_room_id
    LEFT JOIN public.products p ON p.id = i.product_id
    WHERE s.spec_book_id = p_spec_book_id
      AND s.included
      AND (c.id IS NULL OR c.included)
  )
  SELECT
    source.ffe_item_id,
    source.item_type,
    source.doc_code,
    source.chapter_position,
    source.item_position,
    source.snapshot,
    encode(
      extensions.digest(public._spec_book_canonical_json(source.snapshot), 'sha256'),
      'hex'
    )
  FROM source
  ORDER BY source.chapter_position, source.item_position, source.ffe_item_id;
$$;

-- Preserve the 00380 issue bodies behind exact design-studio wrappers. This
-- avoids copying a high-churn monolith while closing raw commercial snapshot
-- access to contractor/manufacturer co-members.
DO $$
BEGIN
  IF to_regprocedure('public._prepare_spec_book_issue_00403(uuid,text[],text,text,uuid,text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.prepare_spec_book_issue(uuid,text[],text,text,uuid,text,jsonb)
      RENAME TO _prepare_spec_book_issue_00403;
  END IF;
  IF to_regprocedure('public._finalize_spec_book_issue_00403(uuid)') IS NULL THEN
    ALTER FUNCTION public.finalize_spec_book_issue(uuid)
      RENAME TO _finalize_spec_book_issue_00403;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_spec_book_issue(
  p_spec_book_id uuid,
  p_audiences text[],
  p_issue_type text,
  p_reason text,
  p_base_revision_id uuid,
  p_idempotency_key text,
  p_warning_acknowledgements jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id uuid;
BEGIN
  SELECT p.designer_id INTO v_designer_id
  FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
  WHERE b.id = p_spec_book_id;
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_design_studio_comember(v_designer_id)) THEN
    RAISE EXCEPTION 'spec book not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;
  RETURN public._prepare_spec_book_issue_00403(
    p_spec_book_id, p_audiences, p_issue_type, p_reason,
    p_base_revision_id, p_idempotency_key, p_warning_acknowledgements
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_spec_book_issue(p_revision_id uuid)
RETURNS public.spec_book_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id uuid;
BEGIN
  SELECT p.designer_id INTO v_designer_id
  FROM public.spec_book_revisions r
  JOIN public.spec_books b ON b.id = r.spec_book_id
  JOIN public.projects p ON p.id = b.project_id
  WHERE r.id = p_revision_id;
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_design_studio_comember(v_designer_id)) THEN
    RAISE EXCEPTION 'spec book revision not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;
  RETURN public._finalize_spec_book_issue_00403(p_revision_id);
END;
$$;

DROP POLICY IF EXISTS project_ffe_specs_studio_rw ON public.project_ffe_specs;
CREATE POLICY project_ffe_specs_studio_rw ON public.project_ffe_specs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.project_ffe_items i JOIN public.projects p ON p.id = i.project_id
    WHERE i.id = project_ffe_specs.ffe_item_id
      AND public.is_design_studio_comember(p.designer_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.project_ffe_items i JOIN public.projects p ON p.id = i.project_id
    WHERE i.id = project_ffe_specs.ffe_item_id
      AND public.is_design_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS spec_books_studio_rw ON public.spec_books;
CREATE POLICY spec_books_studio_rw ON public.spec_books
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = spec_books.project_id
    AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = spec_books.project_id
    AND public.is_design_studio_comember(p.designer_id)));
DROP POLICY IF EXISTS spec_book_chapters_studio_rw ON public.spec_book_chapters;
CREATE POLICY spec_book_chapters_studio_rw ON public.spec_book_chapters
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_chapters.spec_book_id AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_chapters.spec_book_id AND public.is_design_studio_comember(p.designer_id)));
DROP POLICY IF EXISTS spec_book_item_settings_studio_rw ON public.spec_book_item_settings;
CREATE POLICY spec_book_item_settings_studio_rw ON public.spec_book_item_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_item_settings.spec_book_id AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_item_settings.spec_book_id AND public.is_design_studio_comember(p.designer_id)));
DROP POLICY IF EXISTS spec_book_revisions_studio_select ON public.spec_book_revisions;
CREATE POLICY spec_book_revisions_studio_select ON public.spec_book_revisions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.spec_books b JOIN public.projects p ON p.id = b.project_id
    WHERE b.id = spec_book_revisions.spec_book_id AND public.is_design_studio_comember(p.designer_id)));
DROP POLICY IF EXISTS spec_book_revision_items_studio_select ON public.spec_book_revision_items;
CREATE POLICY spec_book_revision_items_studio_select ON public.spec_book_revision_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.spec_book_revisions r
    JOIN public.spec_books b ON b.id = r.spec_book_id
    JOIN public.projects p ON p.id = b.project_id
    WHERE r.id = spec_book_revision_items.revision_id
      AND public.is_design_studio_comember(p.designer_id)
  ));
DROP POLICY IF EXISTS spec_book_artifacts_studio_select ON public.spec_book_artifacts;
CREATE POLICY spec_book_artifacts_studio_select ON public.spec_book_artifacts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.spec_book_revisions r
    JOIN public.spec_books b ON b.id = r.spec_book_id
    JOIN public.projects p ON p.id = b.project_id
    WHERE r.id = spec_book_artifacts.revision_id
      AND public.is_design_studio_comember(p.designer_id)
  ));

-- ── Explicit ACLs ──────────────────────────────────────────────────────────
REVOKE ALL ON public.product_option_groups FROM PUBLIC, anon;
REVOKE ALL ON public.product_option_values FROM PUBLIC, anon;
REVOKE ALL ON public.product_variants FROM PUBLIC, anon;
REVOKE ALL ON public.product_variant_values FROM PUBLIC, anon;
REVOKE ALL ON public.product_components FROM PUBLIC, anon;
REVOKE ALL ON public.product_configuration_rules FROM PUBLIC, anon;
REVOKE ALL ON public.product_configurations FROM PUBLIC, anon;
REVOKE ALL ON public.product_configuration_selections FROM PUBLIC, anon;
REVOKE ALL ON public.product_configuration_components FROM PUBLIC, anon;
REVOKE ALL ON public.custom_commission_revisions FROM PUBLIC, anon;
REVOKE ALL ON public.custom_commission_milestones FROM PUBLIC, anon;
REVOKE ALL ON public.custom_commission_milestone_events FROM PUBLIC, anon;
REVOKE ALL ON public.vendor_quote_requests FROM PUBLIC, anon;

GRANT SELECT ON public.product_option_groups TO authenticated;
GRANT SELECT ON public.product_option_values TO authenticated;
GRANT SELECT ON public.product_variants TO authenticated;
GRANT SELECT ON public.product_variant_values TO authenticated;
GRANT SELECT ON public.product_components TO authenticated;
GRANT SELECT ON public.product_configuration_rules TO authenticated;
GRANT SELECT ON public.product_configurations TO authenticated;
GRANT SELECT ON public.product_configuration_selections TO authenticated;
GRANT SELECT ON public.product_configuration_components TO authenticated;
GRANT SELECT ON public.custom_commission_revisions TO authenticated;
GRANT SELECT ON public.custom_commission_milestones TO authenticated;
GRANT SELECT ON public.custom_commission_milestone_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_quote_requests TO authenticated;

GRANT ALL ON public.product_option_groups TO service_role;
GRANT ALL ON public.product_option_values TO service_role;
GRANT ALL ON public.product_variants TO service_role;
GRANT ALL ON public.product_variant_values TO service_role;
GRANT ALL ON public.product_components TO service_role;
GRANT ALL ON public.product_configuration_rules TO service_role;
GRANT ALL ON public.product_configurations TO service_role;
GRANT ALL ON public.product_configuration_selections TO service_role;
GRANT ALL ON public.product_configuration_components TO service_role;
GRANT ALL ON public.custom_commission_revisions TO service_role;
GRANT ALL ON public.custom_commission_milestones TO service_role;
GRANT ALL ON public.custom_commission_milestone_events TO service_role;
GRANT ALL ON public.vendor_quote_requests TO service_role;

REVOKE EXECUTE ON FUNCTION public._can_read_configurable_product(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._can_manage_configurable_product(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._can_access_product_configuration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._can_read_configurable_product(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._can_manage_configurable_product(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._can_access_product_configuration(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.product_variant_value_same_product() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_product_configuration_immutability() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_custom_commission_revision() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_custom_commission_milestone() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_custom_commission_milestone_event() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_project_configuration_snapshot() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_project_ffe_configuration_integrity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_vendor_quote_configuration_snapshot() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.lock_configuration_snapshot_on_po_link() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._product_configuration_condition_matches(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._configuration_snapshot_hash(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._product_configuration_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._custom_commission_revision_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._configuration_quote_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._custom_commission_milestone_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._product_configuration_condition_matches(jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._configuration_snapshot_hash(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._product_configuration_json(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._custom_commission_revision_json(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._configuration_quote_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._custom_commission_milestone_json(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public._prepare_spec_book_issue_00403(uuid, text[], text, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._finalize_spec_book_issue_00403(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._prepare_spec_book_issue_00403(uuid, text[], text, text, uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public._finalize_spec_book_issue_00403(uuid)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.prepare_spec_book_issue(uuid, text[], text, text, uuid, text, jsonb)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_spec_book_issue(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_spec_book_issue(uuid, text[], text, text, uuid, text, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_spec_book_issue(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_product_configuration_schema(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_product_configuration_schema(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_product_configuration(uuid, uuid, uuid[], jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_product_configuration(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_product_configuration(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_product_configurations(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_product_configuration(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.promote_configuration_to_library(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.instantiate_product_configuration_template(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prepare_configuration_quote_request(uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_custom_commission_revision(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_custom_commission_revision(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_custom_commission_revisions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_custom_commission_milestones(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_custom_commission_milestone(uuid, text, text, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.place_product_configuration_in_project(uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revise_project_ffe_configuration(uuid, uuid, uuid, integer, text, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_product_configuration_schema(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_product_configuration_schema(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_product_configuration(uuid, uuid, uuid[], jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_product_configuration(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_configuration(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_product_configurations(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_product_configuration(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_configuration_to_library(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.instantiate_product_configuration_template(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_configuration_quote_request(uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_custom_commission_revision(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_custom_commission_revision(uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_custom_commission_revisions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_custom_commission_milestones(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_custom_commission_milestone(uuid, text, text, jsonb, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_product_configuration_in_project(uuid, uuid, uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revise_project_ffe_configuration(uuid, uuid, uuid, integer, text, uuid, integer) TO authenticated, service_role;

COMMENT ON TABLE public.product_configurations IS
  'Version rows for designer-saved furniture configurations. The snapshot/hash is the commercial truth; approved and issued versions are immutable.';
COMMENT ON TABLE public.custom_commission_revisions IS
  'Drawing/brief/quote/approval lifecycle for custom furniture. Issuance is atomic with placement into a project specification.';
COMMENT ON FUNCTION public.upsert_product_configuration_schema(uuid, jsonb, integer) IS
  'Atomically authors a product definition with optimistic concurrency. Referenced values/components cannot be removed.';
COMMENT ON FUNCTION public.get_product_configuration(uuid) IS
  'Loads one exact authorized configuration version, including a superseded version pinned by an FF&E specification.';
COMMENT ON FUNCTION public.evaluate_product_configuration(uuid, uuid, uuid[], jsonb) IS
  'Evaluates options, exact variants, modular components, compatibility, pricing, lead time, dimensions, and completeness without persisting.';
COMMENT ON FUNCTION public.place_product_configuration_in_project(uuid, uuid, uuid, uuid, text, jsonb) IS
  'Places a reusable Product through the 00380 path, then freezes its configuration snapshot on the FF&E specification. Custom commissions issue atomically.';
COMMENT ON FUNCTION public.prepare_configuration_quote_request(uuid, uuid, text, text, text) IS
  'Creates or refreshes the unique draft-only RFQ for a configuration/vendor. Never sends externally and never advances status.';
