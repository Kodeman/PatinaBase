-- ═══════════════════════════════════════════════════════════════════════════
-- 00809 — Trade pricing core (US-37 item 4, contract D4; SQ-1101)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cost is fixed. The designer shapes the client price line by line so the
-- whole job reaches a target blended markup. All money is integer cents and
-- per unit; line total = unit client price × quantity. Markup is stored as
-- numeric at full precision:
--   markup = (client − cost) / cost × 100        margin = (client − cost) / client
--   35% markup on $1,000 is $1,350, a 25.9% margin.
--
-- One writer, set_ffe_line_pricing, replaces set_project_ffe_line_commercials
-- (00692) for UI use and SUBSUMES US-36 SQ-1057 (D19, migration 00799 stays
-- unused): the client price on a placed non-labor line, audited, refused once
-- the line is released or invoiced.
--
-- ── RULINGS (orchestrator, 2026-10-17, on the SQ-1101 steering comment) ─────
-- R1 line_kind already exists (00729:83, goods|labor). Its CHECK widens to
--    goods|labor|freight|delivery|install. 'goods' is the product kind; the
--    portal's pure module (lib/document/trade-pricing.ts) maps it to 'product'.
-- R2 markup_percent widens from NUMERIC(5,2) CHECK >= 0 (00185:49) to numeric,
--    CHECK >= -100: a typed price below cost is kept exactly and its negative
--    markup stored exactly.
-- R3 The library add path auto-populates the client price from the product
--    (_place_product_in_project_v2_00438_impl: unit = COALESCE(price_retail,
--    price_trade, 0)), so "unit null/0" alone never priced a real add. The
--    place path now marks its writes by PROVENANCE, never by value: its 00441
--    wrapper sets the transaction-local GUC app.ffe_price_source = 'library'
--    around the impl call. Under it, a line whose product has a real
--    price_trade takes the default markup (insert and need fill). A need the
--    designer priced by hand (price_basis 'client') keeps its price on a fill,
--    unless the fill changes the line's currency (00666 F4 relabels it USD).
--    Products with no price_trade keep today's behaviour (no real cost).
-- R4 00692/00755 have no audit table (they stamp updated_at only). Every
--    pricing edit here writes public.audit_logs (user, studio, action,
--    old/new values); its RLS lets only the actor and studio owners/admins
--    read it. The post-approval event log is 00810 (D5).
-- R5 A cost edit on an unpriced line applies the effective default (the 35%
--    rule at the moment the cost becomes known).
-- R6 The cost-change rule lives in one trigger: a cost change never moves the
--    client price; it flags the line and HOLDS the markup it was priced at in
--    pending_markup_held_percent (SQ-1124), whichever path wrote the cost
--    (00692, 00707 vendor quotes, resolve_ack_line, a library fill, ...). It
--    does not flag when the same statement also changes the client price (a
--    deliberate reprice). A released or invoiced line still flags;
--    resolve 'keep_client' is allowed there (internal columns only),
--    'keep_markup' is refused.
-- R7 The project override (markup_target_percent) covers goods lines and the
--    target only, never freight/delivery/install.
-- R8 The project override and sales tax live in a team-only table,
--    project_pricing_settings, not on projects: the projects row is readable
--    by its client (policy "Project participants can view projects":
--    client_id = auth.uid()). Its SELECT policy is the FF&E team read:
--    the lead (projects.designer_id = auth.uid(), as "Designers manage their
--    project FFE items") or can_buy_for_project (as project_ffe_items_studio_rw).
--    Writes go only through set_project_pricing. Sales tax stays
--    client-invisible; SQ-1107 decides any curated client exposure.
--
-- ── REPAIR (SQ-1124, Astra review SQ-1123 F1-F10, orchestrator verdict) ─────
-- T  markup_percent is ALWAYS the true markup of the line's current cents:
--    trim_scale((client - cost) x 100 / cost), NULL when the cost is NULL or 0
--    (or the client price is NULL or negative, a credit). The last BEFORE
--    trigger (zzz_ffe_markup_truth_trg) writes it on every insert and update,
--    after any trigger that rewrites cents (the 00422 configuration approval
--    guard does); a backfill makes existing rows true. No writer sets it. So
--    the spec book (00767 'markupPercent') and every reader see the truth
--    (F1), and a legacy writer's recomputed markup is harmless (F9).
-- H  The R6 held markup is pending_markup_held_percent: set from the old
--    cents only when a cost change raises the flag on a line not already
--    pending (a repeated or later cost write never overwrites it, F9);
--    keep_markup prices round(cost x (100 + held) / 100); resolve and reset
--    clear it with pending_cost_*.
-- F2 A library fill that keeps a typed price (R3) still flags a changed
--    non-null old cost.
-- F3 supersede_project_selection carries price_basis, the pending state and
--    retail to a same-product successor (a free line stays free); a new
--    product follows the library-fill rules.
-- F4 (ruled B) A configured placement's price is a client-approved price: it
--    lands as price_basis 'client' (the studio default never overrides it)
--    and clears any cost flag; the markup is true over the configuration cost.
-- F5 The automatic default refuses an unrepresentable line total.
-- F6 Superseded lines are history: every pricing RPC refuses them and the
--    job reset skips them (they are not counted).
-- F7 reset_project_markups locks its rows ORDER BY id (as 00759 triage and
--    00446 receiving).
-- F10 A configuration-locked line (project_ffe_specs.configuration_locked_at,
--    the 00422 guard's authority) is locked for pricing; the job reset skips
--    and counts it.
-- F8 (accepted, inherited) A pre-00809 price with a NULL basis keeps today's
--    library-fill behaviour; provenance is never guessed (DECISIONS.md).
-- The release snapshot furnishing_authorization_items.markup_percent widens
--    to >= -100 with the line's (R2): a below-cost line can be released.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- project_ffe_items
--   line_kind               CHECK widened (R1)
--   retail_unit_cents       bigint, the product's price_retail (integer cents
--                           since 00001:33; 00276:30) at add/fill; backfilled
--   price_basis             'markup' | 'client' | NULL: the field edited last
--   pending_cost_prev_cents bigint, the cost the line was priced on, set when
--   pending_cost_changed_at the cost changes under a priced line; cleared by
--                           resolve_ffe_cost_change and the resets. Both or
--                           neither.
--   pending_markup_held_percent  numeric, the markup the line was priced at
--                           when the flag was raised (SQ-1124); only while
--                           the flag stands
--   markup_percent          numeric, CHECK >= -100 (R2); always the true
--                           markup of the cents (SQ-1124 T)
--   All studio-only: no client reader selects them (D6; 00811 hardens).
-- designer_pricing_settings  user_id PK; default/freight/delivery/install
--                           markup percents, 35 each, 0..1000. Own row only.
-- project_pricing_settings   project_id PK; markup_target_percent (0..1000)
--                           and sales_tax_rate (a fraction, 0..1). R8.
-- ffe_line_default_markup(item)  goods: project target, else the lead's
--                           default; freight/delivery/install: the lead's kind
--                           default; 35 when unset; NULL for labor. The lead
--                           is projects.designer_id. Internal.
-- aa_ffe_pricing_maintain_trg  BEFORE INSERT OR UPDATE; runs before every
--                           guard (a_ffe_rpc_mutation_only_trg runs first),
--                           so the guards see its result:
--   (1) retail_unit_cents follows the product at add and at fill/swap.
--   (2) the default markup when the cost is known (> 0) and the client price
--       is not (null/0 and no price_basis), or under R3; never on labor, a
--       locked line (removed, superseded, released, drafted, invoiced,
--       configuration-locked), trade scope, or a line carrying signed or
--       proposal provenance (its price came from there). Leaves price_basis
--       'markup'. An unrepresentable line total is refused (F5).
--   (3) a cost change under a priced line flags it and holds its markup (R6,
--       H); a cost discovered (NULL → value) under a priced line is not
--       flagged.
--   (4) a client price changed by any other writer sets price_basis
--       'client', so price_basis stays true.
-- zzz_ffe_markup_truth_trg  the last BEFORE INSERT OR UPDATE trigger: writes
--                           the true markup (SQ-1124 T).
-- RPCs (SECURITY DEFINER, pinned search_path, gate _ffe_require_studio_project
-- = lead or active studio member, else 42501):
--   set_ffe_line_pricing(item, field, value numeric)   the one writer
--   set_ffe_line_kind(item, kind)                      goods|freight|delivery|install
--   resolve_ffe_cost_change(item, 'keep_client'|'keep_markup')
--   reset_ffe_line_markup(item)                        the line's kind default
--   reset_project_markups(project)                     every eligible line
--   set_project_pricing(project, markup_target_percent, sales_tax_rate)
--   get_my_pricing_settings() / set_my_pricing_settings(...)
-- Refusal sentences (check_violation, stable for the UI):
--   'This line was removed.'
--   'This line was replaced. Price the line that replaced it.'
--   'Labor lines are priced with the labor price.'
--   'Trade scope lines change through their scope.'
--   'Released lines change through Record a change.'
--   'This line is on a drafted release. Send it or void the draft first.'
--   'This line is invoiced, so its price stays as billed.'
--   'This configured line is locked. Change it through a configuration revision.'
--   'The quantity is below the rooms'' total (n).' (quantity only, as 00737 F5)
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- Redefines _place_product_in_project_v2_00441_wrapper: body 00439:287
-- (place_product_in_project_v2, renamed by 00442:5), verbatim plus the GUC.
-- Redefines _place_product_configuration_in_project_impl: body 00722:24,
-- verbatim plus the F4 price provenance on its line UPDATE and the 00808
-- job-label lock as its first lock (Astra SQ-1135 lock order). Its only
-- caller, place_product_configuration_in_project (00808:1360), already takes
-- that lock first (00808:1379); the lock is re-entrant, so this inner take
-- adds no new lock edge. The wrapper is reached only through
-- place_product_in_project_v2 (00808:711), which takes that lock before it
-- calls down (00808:770, :831).
-- Redefines supersede_project_selection: body 00808:418 (00758:63 plus the
-- 00808 job-label lock, kept first), verbatim plus the F3 price carry.
-- Idempotent: IF NOT EXISTS, DROP CONSTRAINT/TRIGGER/POLICY IF EXISTS,
-- CREATE OR REPLACE; the backfill only touches rows still NULL.
-- Test: supabase/tests/ffe/us37_trade_pricing_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. project_ffe_items: pricing columns ──────────────────────────────────

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS retail_unit_cents bigint,
  ADD COLUMN IF NOT EXISTS price_basis text,
  ADD COLUMN IF NOT EXISTS pending_cost_prev_cents bigint,
  ADD COLUMN IF NOT EXISTS pending_cost_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_markup_held_percent numeric;

ALTER TABLE public.project_ffe_items
  ALTER COLUMN markup_percent TYPE numeric;

ALTER TABLE public.project_ffe_items
  DROP CONSTRAINT IF EXISTS project_ffe_items_line_kind_check,
  ADD CONSTRAINT project_ffe_items_line_kind_check CHECK (
    line_kind IN ('goods', 'labor', 'freight', 'delivery', 'install')
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_markup_percent_check,
  ADD CONSTRAINT project_ffe_items_markup_percent_check CHECK (
    markup_percent IS NULL OR markup_percent >= -100
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_retail_unit_cents_check,
  ADD CONSTRAINT project_ffe_items_retail_unit_cents_check CHECK (
    retail_unit_cents IS NULL OR retail_unit_cents >= 0
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_price_basis_check,
  ADD CONSTRAINT project_ffe_items_price_basis_check CHECK (
    price_basis IS NULL OR price_basis IN ('markup', 'client')
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_pending_cost_pair,
  ADD CONSTRAINT project_ffe_items_pending_cost_pair CHECK (
    (pending_cost_prev_cents IS NULL) = (pending_cost_changed_at IS NULL)
    AND (pending_cost_prev_cents IS NULL OR pending_cost_prev_cents >= 0)
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_pending_markup_held_check,
  ADD CONSTRAINT project_ffe_items_pending_markup_held_check CHECK (
    pending_markup_held_percent IS NULL
    OR (pending_cost_changed_at IS NOT NULL AND pending_markup_held_percent >= -100)
  );

-- The release snapshot carries the line's markup (00412:257 had >= 0); a
-- below-cost line (R2) must release with its true, negative markup.
ALTER TABLE public.furnishing_authorization_items
  DROP CONSTRAINT IF EXISTS furnishing_authorization_items_markup_percent_check,
  ADD CONSTRAINT furnishing_authorization_items_markup_percent_check CHECK (
    markup_percent IS NULL OR markup_percent >= -100
  );

COMMENT ON COLUMN public.project_ffe_items.markup_percent IS
  'Designer markup in percent, full precision (00185; numeric and >= -100 since 00809). '
  'Always the true markup of the current cents, (client - cost) / cost x 100, written by '
  'zzz_ffe_markup_truth_trg; NULL when the cost is NULL or 0 (00809 SQ-1124). '
  'Studio-only: never on a client payload.';
COMMENT ON COLUMN public.project_ffe_items.line_kind IS
  'goods (the product kind) | labor (00729) | freight | delivery | install (00809). '
  'Each non-labor kind has its own default markup (designer_pricing_settings).';
COMMENT ON COLUMN public.project_ffe_items.retail_unit_cents IS
  'The product''s retail (MSRP) per unit in cents, taken from products.price_retail at add or fill '
  '(00809). For comparison only; the client price is unit_price_cents. Studio-only.';
COMMENT ON COLUMN public.project_ffe_items.price_basis IS
  'Which price field was edited last (00809): markup (client price derived from cost) or client '
  '(typed client price, markup derived). NULL until the line is priced through 00809. Studio-only.';
COMMENT ON COLUMN public.project_ffe_items.pending_cost_prev_cents IS
  'The unit cost the line was priced on, set when the cost changed under a priced line (00809); '
  'the earliest one while the flag stands. Cleared by resolve_ffe_cost_change and the markup '
  'resets. Studio-only.';
COMMENT ON COLUMN public.project_ffe_items.pending_cost_changed_at IS
  'When the cost last changed under a priced line (00809); NULL when no cost change is pending. Studio-only.';
COMMENT ON COLUMN public.project_ffe_items.pending_markup_held_percent IS
  'The markup the line was priced at when the cost-change flag was raised (00809 SQ-1124); '
  'set once per flag, never overwritten while it stands. keep_markup prices from it. '
  'Cleared with pending_cost_*. Studio-only.';

-- ─── 2. Backfill retail_unit_cents from each line's product ─────────────────
-- Writes only the new column, with the user triggers off so updated_at and
-- the spec-book snapshot do not move (the 00729 §2 pattern).

DO $$
BEGIN
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  -- The markup_percent rewrite above makes every row new to this transaction, so the
  -- UPDATE queues deferred FK checks; flush them or ENABLE TRIGGER fails (55006).
  SET CONSTRAINTS ALL IMMEDIATE;
  ALTER TABLE public.project_ffe_items DISABLE TRIGGER USER;
  UPDATE public.project_ffe_items AS item
     SET retail_unit_cents = product.price_retail
    FROM public.products AS product
   WHERE product.id = item.product_id
     AND item.retail_unit_cents IS NULL
     AND product.price_retail IS NOT NULL;
  ALTER TABLE public.project_ffe_items ENABLE TRIGGER USER;
END;
$$;

-- ─── 3. designer_pricing_settings ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.designer_pricing_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_markup_percent numeric NOT NULL DEFAULT 35
    CHECK (default_markup_percent >= 0 AND default_markup_percent <= 1000),
  freight_markup_percent numeric NOT NULL DEFAULT 35
    CHECK (freight_markup_percent >= 0 AND freight_markup_percent <= 1000),
  delivery_markup_percent numeric NOT NULL DEFAULT 35
    CHECK (delivery_markup_percent >= 0 AND delivery_markup_percent <= 1000),
  install_markup_percent numeric NOT NULL DEFAULT 35
    CHECK (install_markup_percent >= 0 AND install_markup_percent <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.designer_pricing_settings IS
  'A designer''s default markups (00809, US-37 D4): goods (default_markup_percent) and the '
  'freight/delivery/install kinds, 35 each unless set, 0 allowed. The job''s lead '
  '(projects.designer_id) supplies the defaults. Own row only; written by set_my_pricing_settings.';

ALTER TABLE public.designer_pricing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS designer_pricing_settings_own_select ON public.designer_pricing_settings;
CREATE POLICY designer_pricing_settings_own_select ON public.designer_pricing_settings
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.designer_pricing_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.designer_pricing_settings TO authenticated;
GRANT ALL ON public.designer_pricing_settings TO service_role;

-- ─── 4. project_pricing_settings (R8) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_pricing_settings (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  markup_target_percent numeric
    CHECK (markup_target_percent IS NULL OR (markup_target_percent >= 0 AND markup_target_percent <= 1000)),
  sales_tax_rate numeric
    CHECK (sales_tax_rate IS NULL OR (sales_tax_rate >= 0 AND sales_tax_rate <= 1)),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_pricing_settings IS
  'A job''s pricing (00809, US-37 D4): markup_target_percent overrides the lead''s goods default and '
  'is the blended target (never freight/delivery/install); sales_tax_rate is a fraction (0.0825) '
  'applied to the client price on its own row, never marked up, excluded from the blend. Team-only '
  '(the projects row is client-readable); written by set_project_pricing.';

ALTER TABLE public.project_pricing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_pricing_settings_team_select ON public.project_pricing_settings;
CREATE POLICY project_pricing_settings_team_select ON public.project_pricing_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = project_pricing_settings.project_id
        AND project.designer_id = (SELECT auth.uid())
    )
    OR public.can_buy_for_project(project_id)
  );

REVOKE ALL ON public.project_pricing_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.project_pricing_settings TO authenticated;
GRANT ALL ON public.project_pricing_settings TO service_role;

-- ─── 5. Internal helpers ────────────────────────────────────────────────────

-- The effective default markup for a line (R7).
CREATE OR REPLACE FUNCTION public.ffe_line_default_markup(p_item public.project_ffe_items)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE p_item.line_kind
           WHEN 'goods'    THEN COALESCE(project_pricing.markup_target_percent,
                                         settings.default_markup_percent, 35)
           WHEN 'freight'  THEN COALESCE(settings.freight_markup_percent, 35)
           WHEN 'delivery' THEN COALESCE(settings.delivery_markup_percent, 35)
           WHEN 'install'  THEN COALESCE(settings.install_markup_percent, 35)
         END
  FROM public.projects AS project
  LEFT JOIN public.designer_pricing_settings AS settings
    ON settings.user_id = project.designer_id
  LEFT JOIN public.project_pricing_settings AS project_pricing
    ON project_pricing.project_id = project.id
  WHERE project.id = p_item.project_id;
$$;

COMMENT ON FUNCTION public.ffe_line_default_markup(public.project_ffe_items) IS
  'The default markup for a line (00809, D4): goods take the job''s markup_target_percent, else the '
  'lead''s default_markup_percent; freight/delivery/install take the lead''s kind default (the job '
  'override never applies to them); 35 when unset; NULL for labor. Lead = projects.designer_id. Internal.';

-- Why a line's price can't be set here, or NULL.
CREATE OR REPLACE FUNCTION public._ffe_pricing_lock_reason(p_item public.project_ffe_items)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_item.removed_at IS NOT NULL THEN 'This line was removed.'
    WHEN p_item.design_disposition = 'superseded'
      THEN 'This line was replaced. Price the line that replaced it.'
    WHEN p_item.line_kind = 'labor' THEN 'Labor lines are priced with the labor price.'
    WHEN p_item.trade_scope_document_id IS NOT NULL THEN 'Trade scope lines change through their scope.'
    WHEN p_item.purchase_order_id IS NOT NULL OR EXISTS (
      SELECT 1
      FROM public.furnishing_authorization_items AS auth_item
      JOIN public.project_commercial_documents AS document ON document.id = auth_item.commercial_document_id
      JOIN public.proposals AS proposal ON proposal.id = document.proposal_id
      WHERE (auth_item.source_ffe_item_id = p_item.id OR auth_item.id = p_item.source_authorization_item_id)
        AND proposal.commercial_state IN ('sent', 'client_signed', 'executed')
    ) THEN 'Released lines change through Record a change.'
    WHEN EXISTS (
      SELECT 1
      FROM public.furnishing_authorization_items AS auth_item
      JOIN public.project_commercial_documents AS document ON document.id = auth_item.commercial_document_id
      JOIN public.proposals AS proposal ON proposal.id = document.proposal_id
      WHERE auth_item.source_ffe_item_id = p_item.id
        AND COALESCE(proposal.commercial_state, 'draft') = 'draft'
    ) THEN 'This line is on a drafted release. Send it or void the draft first.'
    WHEN EXISTS (
      SELECT 1 FROM public.invoice_line_items AS invoice_line
      WHERE invoice_line.ffe_item_id = p_item.id
    ) THEN 'This line is invoiced, so its price stays as billed.'
    WHEN EXISTS (
      SELECT 1 FROM public.project_ffe_specs AS spec
      WHERE spec.ffe_item_id = p_item.id
        AND spec.configuration_id IS NOT NULL
        AND spec.configuration_locked_at IS NOT NULL
    ) THEN 'This configured line is locked. Change it through a configuration revision.'
  END;
$$;

COMMENT ON FUNCTION public._ffe_pricing_lock_reason(public.project_ffe_items) IS
  'The plain sentence refusing a pricing edit on this line, or NULL (00809). Superseded = replaced by '
  'a successor (SQ-1124 F6); released = on a PO or on a sent, signed or executed authorization '
  '(ffe_line_authorization_state, 00705); drafted = on a draft authorization (00755 F-B1); invoiced = '
  'a live invoice line slot (00709); configuration-locked = the 00422 guard''s lock '
  '(project_ffe_specs.configuration_locked_at, SQ-1124 F10). Internal.';

-- The true markup of a line's cents (SQ-1124 T): exact, trailing zeros
-- trimmed; NULL without a positive cost, or for a NULL or negative (credit)
-- client price, which has no markup in the 00809 sense.
CREATE OR REPLACE FUNCTION public._ffe_true_markup(p_client_cents bigint, p_cost_cents bigint)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN COALESCE(p_cost_cents, 0) > 0 AND p_client_cents >= 0
      THEN trim_scale((p_client_cents - p_cost_cents)::numeric * 100 / p_cost_cents)
  END;
$$;

COMMENT ON FUNCTION public._ffe_true_markup(bigint, bigint) IS
  'The true markup in percent of a client price over a cost, (client - cost) / cost x 100, exact '
  '(00809 SQ-1124); NULL when the cost is NULL or 0 or the client price is NULL or negative. Internal.';

-- The pricing state of a line, as every pricing RPC returns it.
CREATE OR REPLACE FUNCTION public._ffe_pricing_line_json(p_item public.project_ffe_items)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'selectionId', p_item.id,
    'projectId', p_item.project_id,
    'lineKind', p_item.line_kind,
    'quantity', p_item.quantity,
    'unitClientPriceCents', p_item.unit_price_cents,
    'unitCostCents', p_item.trade_price_cents,
    'markupPercent', p_item.markup_percent,
    'lineTotalCents', p_item.line_total_cents,
    'retailUnitCents', p_item.retail_unit_cents,
    'priceBasis', p_item.price_basis,
    'pendingCostPrevCents', p_item.pending_cost_prev_cents,
    'pendingCostChangedAt', p_item.pending_cost_changed_at,
    'pendingMarkupHeldPercent', p_item.pending_markup_held_percent
  );
$$;

-- One audit_logs row per pricing edit (R4); nothing when nothing changed.
CREATE OR REPLACE FUNCTION public._ffe_pricing_audit(
  p_action text,
  p_old public.project_ffe_items,
  p_new public.project_ffe_items
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old jsonb := public._ffe_pricing_line_json(p_old) - 'selectionId' - 'projectId';
  v_new jsonb := public._ffe_pricing_line_json(p_new) - 'selectionId' - 'projectId';
BEGIN
  IF v_old = v_new THEN
    RETURN;
  END IF;
  INSERT INTO public.audit_logs
    (user_id, organization_id, action, resource_type, resource_id, old_values, new_values, metadata)
  SELECT auth.uid(), project.studio_id, p_action, 'project_ffe_items', p_new.id, v_old, v_new,
         jsonb_build_object('projectId', p_new.project_id)
  FROM public.projects AS project
  WHERE project.id = p_new.project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ffe_line_default_markup(public.project_ffe_items) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ffe_pricing_lock_reason(public.project_ffe_items) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ffe_true_markup(bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ffe_pricing_line_json(public.project_ffe_items) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ffe_pricing_audit(text, public.project_ffe_items, public.project_ffe_items) FROM PUBLIC, anon, authenticated;

-- ─── 6. The pricing trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ffe_pricing_maintain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_library boolean := COALESCE(current_setting('app.ffe_price_source', true), '') = 'library';
  v_writer boolean := COALESCE(current_setting('app.ffe_pricing_writer', true), '') = 'on';
  v_product_changed boolean;
  v_cost_changed boolean;
  v_unit_changed boolean;
  v_unpriced boolean;
  v_typed_kept boolean := false;
  v_markup numeric;
  v_client numeric;
BEGIN
  IF NEW.line_kind = 'labor' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_product_changed := NEW.product_id IS NOT NULL;
    v_cost_changed := NEW.trade_price_cents IS NOT NULL;
    v_unit_changed := false;
  ELSE
    v_product_changed := NEW.product_id IS DISTINCT FROM OLD.product_id;
    v_cost_changed := NEW.trade_price_cents IS DISTINCT FROM OLD.trade_price_cents;
    v_unit_changed := NEW.unit_price_cents IS DISTINCT FROM OLD.unit_price_cents;
  END IF;

  -- (1) Retail follows the product at add and at fill/swap, unless the
  -- writing statement set it itself.
  IF v_product_changed AND NEW.product_id IS NOT NULL
     AND (CASE WHEN TG_OP = 'INSERT' THEN NEW.retail_unit_cents IS NULL
               ELSE NEW.retail_unit_cents IS NOT DISTINCT FROM OLD.retail_unit_cents END)
  THEN
    NEW.retail_unit_cents := (
      SELECT product.price_retail FROM public.products AS product WHERE product.id = NEW.product_id
    );
  END IF;

  -- (R3) A need the designer priced by hand keeps its price when the place
  -- path fills it with a product, in the same currency. A fill that changes
  -- the currency (00666 F4) cannot carry the amount over under the new label.
  -- The kept price is not a reprice, so a changed cost still flags (F2, (3)).
  IF v_library AND TG_OP = 'UPDATE' AND v_product_changed
     AND OLD.price_basis = 'client' AND OLD.unit_price_cents IS NOT NULL
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
  THEN
    NEW.unit_price_cents := OLD.unit_price_cents;
    NEW.line_total_cents := NEW.quantity * OLD.unit_price_cents;
    NEW.price_basis := 'client';
    v_typed_kept := true;
    v_unit_changed := false;
  END IF;

  -- (2) The default markup.
  IF NOT v_writer AND NOT v_typed_kept
     AND (v_cost_changed OR v_product_changed OR (v_library AND v_unit_changed)) THEN
    IF v_library THEN
      -- The place path's client price came from the library: unset, when
      -- the product carries a real trade price.
      v_unpriced := EXISTS (
        SELECT 1 FROM public.products AS product
        WHERE product.id = NEW.product_id AND product.price_trade IS NOT NULL
      );
    ELSE
      v_unpriced := COALESCE(NEW.unit_price_cents, 0) = 0 AND NEW.price_basis IS NULL;
    END IF;
    IF v_unpriced
       AND COALESCE(NEW.trade_price_cents, 0) > 0
       AND NEW.source_authorization_item_id IS NULL
       AND NEW.source_commercial_document_id IS NULL
       AND NEW.source_proposal_item_id IS NULL
       AND NEW.source_decision_id IS NULL
       AND public._ffe_pricing_lock_reason(NEW) IS NULL
    THEN
      v_markup := public.ffe_line_default_markup(NEW);
      IF v_markup IS NOT NULL THEN
        v_client := round(NEW.trade_price_cents::numeric * (100 + v_markup) / 100);
        IF v_client * NEW.quantity > 2147483647 THEN
          RAISE EXCEPTION 'That price is too large for one line.' USING ERRCODE = 'check_violation';
        END IF;
        NEW.unit_price_cents := v_client;
        NEW.line_total_cents := v_client * NEW.quantity;
        NEW.price_basis := 'markup';
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- (3) A cost change under a priced line: never move the client price;
  -- flag it and hold the markup it was priced at (R6, SQ-1124 H). A line
  -- already flagged keeps the cost and markup it was first priced on.
  IF v_cost_changed AND NOT v_unit_changed AND NOT v_writer
     AND (COALESCE(OLD.unit_price_cents, 0) > 0 OR OLD.price_basis IS NOT NULL)
  THEN
    -- A cost discovered (NULL → value) is not a change: nothing to flag.
    IF OLD.trade_price_cents IS NOT NULL THEN
      IF OLD.pending_cost_changed_at IS NULL THEN
        NEW.pending_cost_prev_cents := OLD.trade_price_cents;
        NEW.pending_markup_held_percent :=
          public._ffe_true_markup(OLD.unit_price_cents, OLD.trade_price_cents);
      ELSE
        NEW.pending_cost_prev_cents := OLD.pending_cost_prev_cents;
        NEW.pending_markup_held_percent := OLD.pending_markup_held_percent;
      END IF;
      NEW.pending_cost_changed_at := now();
      NEW.price_basis := OLD.price_basis;
    END IF;
    RETURN NEW;
  END IF;

  -- (4) A client price changed by another writer: the client field was
  -- edited last.
  IF v_unit_changed AND NOT v_writer AND NOT v_library THEN
    NEW.price_basis := CASE WHEN COALESCE(NEW.unit_price_cents, 0) = 0 THEN NULL ELSE 'client' END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ffe_pricing_maintain() IS
  'The FF&E pricing trigger (00809, D4): retail follows the product; the default markup prices a line '
  'whose cost is known and client price is not (or whose client price the place path took from the '
  'library, app.ffe_price_source = library) and refuses an unrepresentable line total; a library fill '
  'keeps a typed client price (R3); a cost change under a priced line never moves the client price, '
  'sets the pending cost flag and, once per flag, holds the markup it was priced at '
  '(pending_markup_held_percent, SQ-1124); a client price changed outside set_ffe_line_pricing sets '
  'price_basis client. markup_percent is written by zzz_ffe_markup_truth_trg. Labor lines are left alone.';

REVOKE ALL ON FUNCTION public.ffe_pricing_maintain() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aa_ffe_pricing_maintain_trg ON public.project_ffe_items;
CREATE TRIGGER aa_ffe_pricing_maintain_trg
  BEFORE INSERT OR UPDATE ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public.ffe_pricing_maintain();

-- The true markup, written last (SQ-1124 T). BEFORE triggers fire in name
-- order and later ones rewrite cents (the 00422 configuration approval guard
-- sets the snapshot prices), so the markup is computed after all of them.
CREATE OR REPLACE FUNCTION public.ffe_markup_truth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.markup_percent := public._ffe_true_markup(NEW.unit_price_cents, NEW.trade_price_cents);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ffe_markup_truth() IS
  'Writes project_ffe_items.markup_percent as the true markup of the row''s final cents '
  '(_ffe_true_markup), on every insert and update, as the last BEFORE trigger (00809 SQ-1124). No '
  'writer sets markup_percent itself.';

REVOKE ALL ON FUNCTION public.ffe_markup_truth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zzz_ffe_markup_truth_trg ON public.project_ffe_items;
CREATE TRIGGER zzz_ffe_markup_truth_trg
  BEFORE INSERT OR UPDATE ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public.ffe_markup_truth();

-- Existing rows take their true markup, with the user triggers off so
-- updated_at and the spec-book snapshot do not move (the §2 pattern).
DO $$
BEGIN
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  -- The markup_percent rewrite above makes every row new to this transaction, so the
  -- UPDATE queues deferred FK checks; flush them or ENABLE TRIGGER fails (55006).
  SET CONSTRAINTS ALL IMMEDIATE;
  ALTER TABLE public.project_ffe_items DISABLE TRIGGER USER;
  UPDATE public.project_ffe_items
     SET markup_percent = public._ffe_true_markup(unit_price_cents, trade_price_cents)
   WHERE markup_percent IS DISTINCT FROM public._ffe_true_markup(unit_price_cents, trade_price_cents);
  ALTER TABLE public.project_ffe_items ENABLE TRIGGER USER;
END;
$$;

-- ─── 7. The place path marks its library prices (R3) ────────────────────────
-- Base: 00439:287 (place_product_in_project_v2, renamed to this by 00442:5),
-- verbatim plus the transaction-local app.ffe_price_source around the impl.

CREATE OR REPLACE FUNCTION public._place_product_in_project_v2_00441_wrapper(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_request jsonb:=p_request; v_project uuid:=NULLIF(p_request->>'projectId','')::uuid;
  v_product uuid:=NULLIF(p_request->>'productId','')::uuid; v_room uuid:=NULLIF(p_request->>'roomId','')::uuid;
  v_configuration uuid:=NULLIF(p_request->>'configurationId','')::uuid;
  v_role text:=COALESCE(NULLIF(p_request->>'roleIdentity',''),'default'); v_match uuid; v_result jsonb;
  -- 00809 (R3): the impl's price writes are library auto-populates.
  v_price_source text:=current_setting('app.ffe_price_source',true);
BEGIN
  IF v_role !~ '^[a-z0-9][a-z0-9_.:-]{0,79}$' THEN RAISE EXCEPTION 'invalid role identity' USING ERRCODE='check_violation'; END IF;
  IF COALESCE(p_request->>'duplicateMode','reuse')='reuse' AND v_product IS NOT NULL
     AND NULLIF(p_request->>'selectionReferenceId','') IS NULL
     AND NULLIF(p_request->>'placeholderSelectionId','') IS NULL THEN
    SELECT item.id INTO v_match FROM public.project_ffe_items item
    LEFT JOIN public.project_ffe_specs spec ON spec.ffe_item_id=item.id
    WHERE item.project_id=v_project AND item.product_id=v_product AND item.removed_at IS NULL
      AND item.design_disposition NOT IN ('not_selected','superseded')
      AND item.assignment_scope=COALESCE(NULLIF(p_request->>'assignmentScope',''),'unassigned')
      AND item.project_room_id IS NOT DISTINCT FROM v_room
      AND item.role_identity=v_role AND spec.configuration_id IS NOT DISTINCT FROM v_configuration
    ORDER BY item.created_at,item.id LIMIT 1 FOR UPDATE OF item;
    IF v_match IS NULL THEN v_request:=jsonb_set(v_request,'{duplicateMode}','"create"'::jsonb,true);
    ELSE v_request:=v_request||jsonb_build_object('selectionReferenceId',v_match); END IF;
  END IF;
  PERFORM set_config('app.ffe_price_source','library',true);
  v_result:=public._place_product_in_project_v2_00438_impl(v_request);
  PERFORM set_config('app.ffe_price_source',COALESCE(v_price_source,''),true);
  IF v_result->>'outcome' IN ('created','filled') THEN
    UPDATE public.project_ffe_items SET role_identity=v_role WHERE id=(v_result->>'selectionId')::uuid;
  END IF;
  RETURN v_result||jsonb_build_object('roleIdentity',v_role,'configurationId',v_configuration);
END;
$$;

REVOKE ALL ON FUNCTION public._place_product_in_project_v2_00441_wrapper(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ─── 7b. A configured placement's price is client-approved (F4, ruled B) ───
-- Base: 00722:24 (the latest body; lineage 00403 → 00413 → 00462 → 00722),
-- verbatim except the FF&E line UPDATE, which now marks the configuration's
-- price as a typed client price under the pricing-writer mark, and the 00808
-- job label lock, taken first after the access check (SQ-1135 lock order).

CREATE OR REPLACE FUNCTION public._place_product_configuration_in_project_impl(
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
  v_priced boolean;
  v_instantiation jsonb;
  v_item_id uuid;
  v_spec_id uuid;
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  -- 00809 (SQ-1124, lock order Astra SQ-1135): the job label lock is the first
  -- lock on this path, after the lock-free access check and before the
  -- configuration row lock, so a placement and a label writer never invert.
  PERFORM public._ffe_lock_job_labels(p_project_id);
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

  -- SQ-1151 (Astra SQ-1150 R4): a priced configuration installs its approved
  -- price below, so the studio default never prices the place path's line on
  -- the way: the place runs under the pricing-writer mark. An intermediate
  -- default past int4 would otherwise refuse a configured price that fits.
  -- The installed price is still validated below.
  v_priced := COALESCE(v_configuration.retail_price_cents, v_configuration.trade_price_cents) IS NOT NULL;
  IF v_priced THEN
    PERFORM set_config('app.ffe_pricing_writer', 'on', true);
  END IF;
  v_place := public.place_product_in_project(
    p_project_id, v_configuration.product_id, p_room_id, p_slot_id, p_category,
    COALESCE(p_source, '{}'::jsonb) || jsonb_build_object(
      'configurationId', v_configuration.id,
      'configurationVersion', v_configuration.version,
      'configurationSnapshotHash', v_configuration.snapshot_hash
    )
  );
  PERFORM set_config('app.ffe_pricing_writer', '', true);
  -- 00722: since 00439 place_product_in_project returns the v2 receipt
  -- ({outcome, selectionId}); ffeItemId/specId no longer exist.
  v_item_id := COALESCE(v_place->>'ffeItemId', v_place->>'selectionId')::uuid;
  v_spec_id := COALESCE((v_place->>'specId')::uuid, (
    SELECT spec.id FROM public.project_ffe_specs AS spec WHERE spec.ffe_item_id = v_item_id
  ));

  UPDATE public.product_configurations
  SET ffe_item_id = v_item_id, updated_at = now()
  WHERE id = v_configuration.id
    AND (ffe_item_id IS NULL OR ffe_item_id = v_item_id)
  RETURNING * INTO v_configuration;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'configuration is already bound to another FF&E line'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  -- 00809 (SQ-1124 F4, ruled B): the configuration's price is a
  -- client-approved price. It lands as a typed client price (price_basis
  -- 'client'), so the studio default never overrides it, and it settles any
  -- cost flag the line carried. The markup is the true one over the
  -- configuration cost (zzz_ffe_markup_truth_trg). A line total past int4 is
  -- refused in the same words as the default (SQ-1124 F5, SQ-1151 R4).
  IF v_priced AND (
    SELECT item.quantity::bigint FROM public.project_ffe_items AS item WHERE item.id = v_item_id
  ) * COALESCE(v_configuration.retail_price_cents, v_configuration.trade_price_cents) > 2147483647 THEN
    RAISE EXCEPTION 'That price is too large for one line.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.ffe_pricing_writer', 'on', true);
  UPDATE public.project_ffe_items
  SET trade_price_cents = COALESCE(v_configuration.trade_price_cents,
        v_configuration.retail_price_cents, trade_price_cents),
      unit_price_cents = COALESCE(v_configuration.retail_price_cents,
        v_configuration.trade_price_cents, unit_price_cents),
      line_total_cents = quantity * COALESCE(v_configuration.retail_price_cents,
        v_configuration.trade_price_cents, unit_price_cents, 0),
      price_basis = CASE WHEN v_priced THEN 'client' ELSE price_basis END,
      pending_cost_prev_cents = CASE WHEN v_priced THEN NULL ELSE pending_cost_prev_cents END,
      pending_cost_changed_at = CASE WHEN v_priced THEN NULL ELSE pending_cost_changed_at END,
      pending_markup_held_percent = CASE WHEN v_priced THEN NULL ELSE pending_markup_held_percent END,
      updated_at = now()
  WHERE id = v_item_id;
  PERFORM set_config('app.ffe_pricing_writer', '', true);

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
      color_fabric = COALESCE(NULLIF(public._configuration_com_color_fabric(
        COALESCE(v_configuration.com_details, v_configuration.snapshot->'comDetails')), ''), color_fabric),
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

-- Unchanged from 00462: the impl stays private behind the public wrapper.
REVOKE ALL ON FUNCTION public._place_product_configuration_in_project_impl(uuid, uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ─── 7c. A replacement carries its price state (F3) ────────────────────────
-- Base: 00808:418 (the latest body: 00758:63 plus the 00808 job-label lock,
-- which stays the first lock taken), verbatim except the price decision, the
-- library mark around the INSERT, five carried columns, and (SQ-1151) an
-- explicit productId equal to the predecessor's read as the same product.
-- Grants persist (00758:190).

CREATE OR REPLACE FUNCTION public.supersede_project_selection(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_old_id uuid:=NULLIF(p_request->>'selectionId','')::uuid; v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE; v_new_product uuid:=NULLIF(p_request->>'productId','')::uuid;
  v_placements uuid[]; v_expected integer; v_updated integer;
  -- 00809 (SQ-1124 F3): the successor's price state.
  v_keep_typed boolean; v_library_fill boolean; v_new_trade integer;
  v_prev bigint; v_changed timestamptz; v_held numeric;
BEGIN
  -- 00808 (SQ-1121): the job label lock comes before any row lock.
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = v_old_id;
  SELECT * INTO v_old FROM public.project_ffe_items WHERE id=v_old_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_old.project_id);
  IF v_old.purchase_order_id IS NOT NULL OR v_old.status IN ('delivered','installed') THEN
    RAISE EXCEPTION 'ordered, delivered, or installed selections require the PO change command'
      USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(SELECT 1 FROM public.furnishing_authorization_items line
    JOIN public.project_commercial_documents document ON document.id=line.commercial_document_id
    JOIN public.proposals proposal ON proposal.id=document.proposal_id
    WHERE line.source_ffe_item_id=v_old.id AND proposal.commercial_state IN ('draft','sent','executed')) THEN
    RAISE EXCEPTION 'authorized selections require void or commercial change authority'
      USING ERRCODE='check_violation';
  END IF;
  IF v_old.design_disposition='superseded' OR v_old.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'selection is already inactive' USING ERRCODE='check_violation';
  END IF;
  -- 00750: labor is never a product (00737 F4 refuses the fill the same way).
  IF v_old.line_kind='labor' AND v_new_product IS NOT NULL THEN
    RAISE EXCEPTION 'Labor isn''t replaced with a product.' USING ERRCODE='check_violation';
  END IF;
  IF v_new_product IS NOT NULL AND NOT public._can_read_configurable_product(v_new_product) THEN
    RAISE EXCEPTION 'replacement product not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT array_agg(DISTINCT value::uuid) INTO v_placements
  FROM jsonb_array_elements_text(COALESCE(p_request->'placementIds','[]'::jsonb));
  v_expected:=COALESCE(cardinality(v_placements),0);
  IF v_expected <> jsonb_array_length(COALESCE(p_request->'placementIds','[]'::jsonb)) OR (
    SELECT count(*) FROM public.proposal_board_items placement
    JOIN public.proposal_boards board ON board.id=placement.board_id
    WHERE placement.id=ANY(COALESCE(v_placements,'{}'::uuid[]))
      AND board.project_id=v_old.project_id AND placement.project_ffe_item_id=v_old.id
  ) <> v_expected THEN RAISE EXCEPTION 'chosen placements must be distinct links to the predecessor'
    USING ERRCODE='integrity_constraint_violation'; END IF;
  -- SQ-1151 (Astra SQ-1150 R2): a productId equal to the predecessor's is the
  -- same product, not a new one. It takes the unchanged-product branch below,
  -- after the checks above have run on it as given.
  IF v_new_product = v_old.product_id THEN v_new_product:=NULL; END IF;
  -- 00809 (SQ-1124 F3): the same product carries its price state whole: the
  -- basis (a free line stays free), the pending cost flag with its held
  -- markup, and retail. A new product follows the library-fill rules (00809
  -- R3, F2): a typed client price in the same currency is kept, and a moved
  -- cost under it flags once; any other price is the library's, and the
  -- trigger's default markup prices it (app.ffe_price_source = library).
  IF v_new_product IS NOT NULL THEN
    SELECT COALESCE(price_trade,price_retail,0) INTO v_new_trade FROM public.products WHERE id=v_new_product;
  END IF;
  v_keep_typed:=v_new_product IS NOT NULL AND v_old.price_basis='client'
    AND v_old.unit_price_cents IS NOT NULL AND v_old.currency IS NOT DISTINCT FROM 'USD';
  v_library_fill:=v_new_product IS NOT NULL AND NOT v_keep_typed;
  IF v_new_product IS NULL OR (v_keep_typed AND (v_old.trade_price_cents IS NULL
       OR v_new_trade IS NOT DISTINCT FROM v_old.trade_price_cents)) THEN
    v_prev:=v_old.pending_cost_prev_cents; v_changed:=v_old.pending_cost_changed_at;
    v_held:=v_old.pending_markup_held_percent;
  ELSIF v_keep_typed AND v_old.pending_cost_changed_at IS NULL THEN
    v_prev:=v_old.trade_price_cents; v_changed:=now();
    v_held:=public._ffe_true_markup(v_old.unit_price_cents,v_old.trade_price_cents);
  ELSIF v_keep_typed THEN
    v_prev:=v_old.pending_cost_prev_cents; v_changed:=now();
    v_held:=v_old.pending_markup_held_percent;
  END IF;
  UPDATE public.project_ffe_items SET design_disposition='superseded',updated_at=now() WHERE id=v_old.id;
  IF v_library_fill THEN PERFORM set_config('app.ffe_price_source','library',true); END IF;
  -- 00750: + notes (was NULL), unit, rough_cents, line_kind, link_kind,
  -- parent_ffe_item_id.
  INSERT INTO public.project_ffe_items(
    project_id,project_room_id,product_id,name,ffe_category,item_type,status,quantity,
    unit_price_cents,line_total_cents,budget_min_cents,budget_max_cents,vendor_name,vendor_id,
    blocked,notes,sort_order,trade_price_cents,markup_percent,added_via,doc_code,custom_fields,
    selection_thread_id,supersedes_ffe_item_id,design_disposition,assignment_scope,role_identity,
    currency,unit,rough_cents,line_kind,link_kind,parent_ffe_item_id,
    -- 00758 (F1): the group heading follows the line.
    line_group_id,
    -- 00809 (SQ-1124 F3): the price state.
    price_basis,retail_unit_cents,pending_cost_prev_cents,pending_cost_changed_at,pending_markup_held_percent
  ) SELECT project_id,project_room_id,COALESCE(v_new_product,product_id),
    COALESCE(NULLIF(btrim(p_request->>'name'),''),name),ffe_category,item_type,'specified',quantity,
    CASE WHEN v_new_product IS NULL OR v_keep_typed THEN unit_price_cents ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    quantity*CASE WHEN v_new_product IS NULL OR v_keep_typed THEN COALESCE(unit_price_cents,0) ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    budget_min_cents,budget_max_cents,
    CASE WHEN v_new_product IS NULL THEN vendor_name ELSE (SELECT vendor.name FROM public.products product LEFT JOIN public.vendors vendor ON vendor.id=product.vendor_id WHERE product.id=v_new_product) END,
    CASE WHEN v_new_product IS NULL THEN vendor_id ELSE (SELECT vendor_id FROM public.products WHERE id=v_new_product) END,
    false,notes,sort_order,
    CASE WHEN v_new_product IS NULL THEN trade_price_cents ELSE COALESCE((SELECT price_trade FROM public.products WHERE id=v_new_product),(SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    markup_percent,'replacement',doc_code,custom_fields,selection_thread_id,id,'selected',assignment_scope,role_identity,
    CASE WHEN v_new_product IS NULL THEN currency ELSE 'USD' END,
    unit,rough_cents,line_kind,link_kind,parent_ffe_item_id,
    line_group_id,
    CASE WHEN v_library_fill THEN NULL ELSE price_basis END,
    CASE WHEN v_new_product IS NULL THEN retail_unit_cents END,
    v_prev,v_changed,v_held
  FROM public.project_ffe_items WHERE id=v_old.id RETURNING * INTO v_new;
  IF v_library_fill THEN PERFORM set_config('app.ffe_price_source','',true); END IF;
  -- 00750: the spec row exists already (spec_book_attach_ffe_line seeded it
  -- from the successor's product). Carry the designer-authored fields onto it.
  UPDATE public.project_ffe_specs spec SET
    finish=CASE WHEN old_spec.finish IS NOT NULL
      AND old_spec.field_provenance->>'finish' IS DISTINCT FROM 'product_master'
      THEN old_spec.finish ELSE spec.finish END,
    material=CASE WHEN old_spec.material IS NOT NULL
      AND old_spec.field_provenance->>'material' IS DISTINCT FROM 'product_master'
      THEN old_spec.material ELSE spec.material END,
    color_fabric=CASE WHEN old_spec.color_fabric IS NOT NULL
      AND old_spec.field_provenance->>'colorFabric' IS DISTINCT FROM 'product_master'
      THEN old_spec.color_fabric ELSE spec.color_fabric END,
    selected_dimensions=CASE WHEN old_spec.selected_dimensions IS NOT NULL
      AND old_spec.field_provenance->>'dimensions' IS DISTINCT FROM 'product_master'
      THEN old_spec.selected_dimensions ELSE spec.selected_dimensions END,
    exact_location=COALESCE(old_spec.exact_location,spec.exact_location),
    client_notes=COALESCE(old_spec.client_notes,spec.client_notes),
    trade_notes=COALESCE(old_spec.trade_notes,spec.trade_notes),
    install_notes=COALESCE(old_spec.install_notes,spec.install_notes),
    care_notes=COALESCE(old_spec.care_notes,spec.care_notes),
    warranty_notes=COALESCE(old_spec.warranty_notes,spec.warranty_notes),
    selected_media=COALESCE(old_spec.selected_media,spec.selected_media),
    -- 00758 (F2): the COM facts, N/A declarations and source verifications.
    com_spec=COALESCE(old_spec.com_spec,spec.com_spec),
    na_declarations=spec.na_declarations||COALESCE(old_spec.na_declarations,'{}'::jsonb),
    source_verifications=spec.source_verifications||COALESCE(old_spec.source_verifications,'{}'::jsonb),
    routing_source=spec.routing_source||jsonb_build_object('supersedesSelectionId',v_old.id)
  FROM (SELECT 1) one
  LEFT JOIN public.project_ffe_specs old_spec ON old_spec.ffe_item_id=v_old.id
  WHERE spec.ffe_item_id=v_new.id;
  -- 00758 (F2): the spec-book settings the designer set on the predecessor
  -- win over the defaults spec_book_attach_ffe_line seeded for the new line.
  UPDATE public.spec_book_item_settings setting SET
    included=old_setting.included,
    page_template=old_setting.page_template,
    publication_overrides=old_setting.publication_overrides
  FROM public.spec_book_item_settings old_setting
  WHERE old_setting.ffe_item_id=v_old.id
    AND setting.ffe_item_id=v_new.id
    AND setting.spec_book_id=old_setting.spec_book_id;
  -- 00750: the room placements are copied; the predecessor keeps its rows.
  INSERT INTO public.project_ffe_placements
    (ffe_item_id,project_id,project_room_id,quantity,area_note,sort_order)
  SELECT v_new.id,placement.project_id,placement.project_room_id,placement.quantity,
    placement.area_note,placement.sort_order
  FROM public.project_ffe_placements placement WHERE placement.ffe_item_id=v_old.id;
  -- 00750: active children follow the piece; they are re-parented, not copied.
  UPDATE public.project_ffe_items SET parent_ffe_item_id=v_new.id
  WHERE parent_ffe_item_id=v_old.id AND removed_at IS NULL
    AND design_disposition<>'superseded';
  IF v_expected>0 THEN
    UPDATE public.proposal_board_items SET project_ffe_item_id=v_new.id,product_id=v_new.product_id
    WHERE id=ANY(v_placements) AND project_ffe_item_id=v_old.id;
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    IF v_updated<>v_expected THEN RAISE EXCEPTION 'not every chosen placement was repointed'
      USING ERRCODE='integrity_constraint_violation'; END IF;
  END IF;
  RETURN jsonb_build_object('predecessorSelectionId',v_old.id,'selectionId',v_new.id,
    'threadId',v_new.selection_thread_id,'repointedPlacementIds',to_jsonb(COALESCE(v_placements,'{}'::uuid[])));
END;
$$;

-- ─── 8. The one writer ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_ffe_line_pricing(
  p_item_id uuid,
  p_field text,
  p_value numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE;
  v_lock text;
  v_client numeric;
  v_total numeric;
  v_placed bigint;
BEGIN
  -- 00810 (SQ-1169 F2, R182): the job label lock comes before the line lock, so
  -- an edit lands wholly before or wholly after a first pricing approval.
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = p_item_id;
  SELECT * INTO v_old FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_old.project_id);

  IF p_field IS NULL OR p_field NOT IN (
    'unit_client_price_cents', 'markup_percent', 'unit_cost_cents', 'quantity', 'retail_unit_cents'
  ) THEN
    RAISE EXCEPTION 'set_ffe_line_pricing: the field is unit_client_price_cents, markup_percent, unit_cost_cents, quantity or retail_unit_cents'
      USING ERRCODE = 'check_violation';
  END IF;

  v_lock := public._ffe_pricing_lock_reason(v_old);
  IF v_lock IS NOT NULL THEN
    RAISE EXCEPTION '%', v_lock USING ERRCODE = 'check_violation';
  END IF;

  IF p_field = 'markup_percent' THEN
    IF p_value IS NULL OR p_value < -100 THEN
      RAISE EXCEPTION 'A markup is a number, -100%% or more.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(v_old.trade_price_cents, 0) = 0 THEN
      RAISE EXCEPTION 'Add the cost before setting a markup.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF p_field = 'quantity' THEN
    IF p_value IS NULL OR p_value <> trunc(p_value) OR p_value < 1 OR p_value > 2147483647 THEN
      RAISE EXCEPTION 'The quantity is a whole number, 1 or more.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- As update_project_ffe_line (00737 F5): never below the rooms' total.
    SELECT COALESCE(sum(placement.quantity), 0) INTO v_placed
    FROM public.project_ffe_placements AS placement
    WHERE placement.ffe_item_id = v_old.id;
    IF p_value < v_placed THEN
      RAISE EXCEPTION 'The quantity is below the rooms'' total (%).', v_placed
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF p_value IS NULL THEN
    IF p_field <> 'retail_unit_cents' THEN
      RAISE EXCEPTION 'A price is whole cents, 0 or more.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF p_value <> trunc(p_value) OR p_value < 0 OR p_value > 2147483647 THEN
    RAISE EXCEPTION 'A price is whole cents, 0 or more.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);

  IF p_field = 'unit_cost_cents' THEN
    -- No writer mark: the trigger flags a priced line (R6) or prices an
    -- unpriced one at its default (R5). A first cost under a client price
    -- keeps the price and makes its markup known (zzz_ffe_markup_truth_trg).
    UPDATE public.project_ffe_items
       SET trade_price_cents = p_value::integer,
           updated_at = now()
     WHERE id = v_old.id
    RETURNING * INTO v_new;
  ELSE
    IF p_field = 'unit_client_price_cents' THEN
      v_client := p_value;
    ELSIF p_field = 'markup_percent' THEN
      v_client := round(v_old.trade_price_cents::numeric * (100 + p_value) / 100);
    ELSE
      v_client := v_old.unit_price_cents;
    END IF;
    v_total := COALESCE(v_client, 0) * CASE WHEN p_field = 'quantity' THEN p_value ELSE v_old.quantity END;
    IF v_client > 2147483647 OR v_total > 2147483647 THEN
      RAISE EXCEPTION 'That price is too large for one line.'
        USING ERRCODE = 'check_violation';
    END IF;

    PERFORM set_config('app.ffe_pricing_writer', 'on', true);
    UPDATE public.project_ffe_items
       SET unit_price_cents = v_client::integer,
           line_total_cents = v_total::integer,
           quantity = CASE WHEN p_field = 'quantity' THEN p_value::integer ELSE quantity END,
           retail_unit_cents = CASE WHEN p_field = 'retail_unit_cents' THEN p_value::bigint ELSE retail_unit_cents END,
           price_basis = CASE p_field
             WHEN 'markup_percent' THEN 'markup'
             WHEN 'unit_client_price_cents' THEN 'client'
             ELSE price_basis END,
           updated_at = now()
     WHERE id = v_old.id
    RETURNING * INTO v_new;
    PERFORM set_config('app.ffe_pricing_writer', '', true);
  END IF;

  PERFORM public._ffe_pricing_audit('ffe_line_pricing_set:' || p_field, v_old, v_new);
  RETURN public._ffe_pricing_line_json(v_new);
END;
$$;

COMMENT ON FUNCTION public.set_ffe_line_pricing(uuid, text, numeric) IS
  'The one FF&E pricing writer (00809, D4; subsumes SQ-1057/D19). p_field: unit_client_price_cents '
  '(kept exactly; price_basis client), markup_percent (client = round(cost x (1 + m/100)), m >= -100; '
  'needs a cost; price_basis markup), unit_cost_cents (never recalculates a priced line: the trigger '
  'flags the cost change and holds the markup; an unpriced line takes its default), quantity (1 or '
  'more), retail_unit_cents (NULL clears). The stored markup_percent is always the true markup of the '
  'resulting cents (SQ-1124). Always line_total_cents = unit_price_cents x quantity. Refuses (42501) '
  'outside the lead and studio team; refuses removed, superseded, labor, trade scope, released, '
  'drafted, invoiced and configuration-locked lines with a plain sentence. Audited in audit_logs. '
  'Returns the line''s pricing state.';

-- ─── 9. The line kind ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_ffe_line_kind(p_item_id uuid, p_line_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE;
  v_lock text;
BEGIN
  -- 00810 (SQ-1169 F2, R182): the job label lock comes before the line lock, so
  -- an edit lands wholly before or wholly after a first pricing approval.
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = p_item_id;
  SELECT * INTO v_old FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_old.project_id);

  IF p_line_kind IS NULL OR p_line_kind NOT IN ('goods', 'freight', 'delivery', 'install') THEN
    RAISE EXCEPTION 'A line is goods, freight, delivery or install here; labor is added as labor.'
      USING ERRCODE = 'check_violation';
  END IF;
  v_lock := public._ffe_pricing_lock_reason(v_old);
  IF v_lock IS NOT NULL THEN
    RAISE EXCEPTION '%', v_lock USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
     SET line_kind = p_line_kind,
         updated_at = now()
   WHERE id = v_old.id
  RETURNING * INTO v_new;

  PERFORM public._ffe_pricing_audit('ffe_line_kind_set', v_old, v_new);
  RETURN public._ffe_pricing_line_json(v_new);
END;
$$;

COMMENT ON FUNCTION public.set_ffe_line_kind(uuid, text) IS
  'Sets a non-labor line''s kind (00809): goods | freight | delivery | install. The price is left '
  'alone; the kind chooses the default a reset or a later cost applies. Same gate and refusals as '
  'set_ffe_line_pricing. Audited. Returns the line''s pricing state.';

-- ─── 10. Resolving a cost change ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_ffe_cost_change(p_item_id uuid, p_resolution text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE;
  v_lock text;
  v_client numeric;
BEGIN
  -- 00810 (SQ-1169 F2, R182): the job label lock comes before the line lock, so
  -- an edit lands wholly before or wholly after a first pricing approval.
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = p_item_id;
  SELECT * INTO v_old FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_old.project_id);

  IF p_resolution IS NULL OR p_resolution NOT IN ('keep_client', 'keep_markup') THEN
    RAISE EXCEPTION 'resolve_ffe_cost_change: the resolution is keep_client or keep_markup'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_old.pending_cost_changed_at IS NULL THEN
    RAISE EXCEPTION 'This line has no cost change to settle.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- keep_client touches only internal columns, so a released or invoiced
  -- line can settle its flag too (R6); a replaced line is history (F6).
  IF p_resolution = 'keep_markup' OR v_old.design_disposition = 'superseded' THEN
    v_lock := public._ffe_pricing_lock_reason(v_old);
    IF v_lock IS NOT NULL THEN
      RAISE EXCEPTION '%', v_lock USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  PERFORM set_config('app.ffe_pricing_writer', 'on', true);
  IF p_resolution = 'keep_markup' THEN
    -- The markup the line was priced at when the cost changed (H).
    IF COALESCE(v_old.trade_price_cents, 0) = 0 OR v_old.pending_markup_held_percent IS NULL THEN
      RAISE EXCEPTION 'This line has no cost and markup to keep. Keep the client price instead.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_client := round(v_old.trade_price_cents::numeric * (100 + v_old.pending_markup_held_percent) / 100);
    IF v_client * v_old.quantity > 2147483647 THEN
      RAISE EXCEPTION 'That price is too large for one line.'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.project_ffe_items
       SET unit_price_cents = v_client::integer,
           line_total_cents = (v_client * quantity)::integer,
           price_basis = 'markup',
           pending_cost_prev_cents = NULL,
           pending_cost_changed_at = NULL,
           pending_markup_held_percent = NULL,
           updated_at = now()
     WHERE id = v_old.id
    RETURNING * INTO v_new;
  ELSE
    UPDATE public.project_ffe_items
       SET price_basis = 'client',
           pending_cost_prev_cents = NULL,
           pending_cost_changed_at = NULL,
           pending_markup_held_percent = NULL,
           updated_at = now()
     WHERE id = v_old.id
    RETURNING * INTO v_new;
  END IF;
  PERFORM set_config('app.ffe_pricing_writer', '', true);

  PERFORM public._ffe_pricing_audit('ffe_cost_change_resolved:' || p_resolution, v_old, v_new);
  RETURN public._ffe_pricing_line_json(v_new);
END;
$$;

COMMENT ON FUNCTION public.resolve_ffe_cost_change(uuid, text) IS
  'Settles a pending cost change (00809, D4). keep_client: the client price stays (its markup is the '
  'true one on the new cost), price_basis client (allowed on a released or invoiced line, refused on a '
  'replaced one). keep_markup: the client price moves to round(new cost x (1 + held/100)) where held '
  'is pending_markup_held_percent, the markup before the change (SQ-1124), price_basis markup '
  '(refused on a locked line). Either way the flag and the held markup clear. Audited.';

-- ─── 11. Reset to the default markup ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_ffe_line_markup(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE;
  v_lock text;
  v_markup numeric;
  v_client numeric;
BEGIN
  -- 00810 (SQ-1169 F2, R182): the job label lock comes before the line lock, so
  -- an edit lands wholly before or wholly after a first pricing approval.
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = p_item_id;
  SELECT * INTO v_old FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_old.project_id);

  v_lock := public._ffe_pricing_lock_reason(v_old);
  IF v_lock IS NOT NULL THEN
    RAISE EXCEPTION '%', v_lock USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(v_old.trade_price_cents, 0) = 0 THEN
    RAISE EXCEPTION 'Add the cost before resetting the markup.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_markup := public.ffe_line_default_markup(v_old);
  v_client := round(v_old.trade_price_cents::numeric * (100 + v_markup) / 100);
  IF v_client * v_old.quantity > 2147483647 THEN
    RAISE EXCEPTION 'That price is too large for one line.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  PERFORM set_config('app.ffe_pricing_writer', 'on', true);
  UPDATE public.project_ffe_items
     SET unit_price_cents = v_client::integer,
         line_total_cents = (v_client * quantity)::integer,
         price_basis = 'markup',
         pending_cost_prev_cents = NULL,
         pending_cost_changed_at = NULL,
         pending_markup_held_percent = NULL,
         updated_at = now()
   WHERE id = v_old.id
  RETURNING * INTO v_new;
  PERFORM set_config('app.ffe_pricing_writer', '', true);

  PERFORM public._ffe_pricing_audit('ffe_line_markup_reset', v_old, v_new);
  RETURN public._ffe_pricing_line_json(v_new);
END;
$$;

COMMENT ON FUNCTION public.reset_ffe_line_markup(uuid) IS
  'Applies the line''s default markup (ffe_line_default_markup) to its current cost (00809, D4): '
  'client = round(cost x (1 + m/100)), price_basis markup. The reset prices the current cost, so it '
  'also settles a pending cost flag and its held markup (SQ-1124). Needs a cost; same gate and '
  'refusals as set_ffe_line_pricing. Audited.';

CREATE OR REPLACE FUNCTION public.reset_project_markups(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE;
  v_markup numeric;
  v_client numeric;
  v_reset integer := 0;
  v_skipped integer := 0;
BEGIN
  PERFORM public._ffe_require_studio_project(p_project_id);
  -- SQ-1151 (Astra SQ-1150 R1, R182): the job label lock comes after the
  -- lock-free access check and before the first item row lock. Supersede
  -- holds it, then the parent, then the parent's active children; without
  -- it a child with a lower id than its parent deadlocks the two.
  PERFORM public._ffe_lock_job_labels(p_project_id);

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  -- Row locks in id order, as 00446 receiving and 00759 take them (F7).
  FOR v_old IN
    SELECT * FROM public.project_ffe_items
     WHERE project_id = p_project_id
       AND removed_at IS NULL
       AND design_disposition IS DISTINCT FROM 'superseded'
       AND line_kind <> 'labor'
     ORDER BY id
     FOR UPDATE
  LOOP
    v_markup := public.ffe_line_default_markup(v_old);
    v_client := round(v_old.trade_price_cents::numeric * (100 + v_markup) / 100);
    IF COALESCE(v_old.trade_price_cents, 0) = 0
       OR public._ffe_pricing_lock_reason(v_old) IS NOT NULL
       OR v_client * v_old.quantity > 2147483647
    THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    PERFORM set_config('app.ffe_pricing_writer', 'on', true);
    UPDATE public.project_ffe_items
       SET unit_price_cents = v_client::integer,
           line_total_cents = (v_client * quantity)::integer,
           price_basis = 'markup',
           pending_cost_prev_cents = NULL,
           pending_cost_changed_at = NULL,
           pending_markup_held_percent = NULL,
           updated_at = now()
     WHERE id = v_old.id
    RETURNING * INTO v_new;
    PERFORM set_config('app.ffe_pricing_writer', '', true);
    PERFORM public._ffe_pricing_audit('ffe_line_markup_reset', v_old, v_new);
    v_reset := v_reset + 1;
  END LOOP;

  RETURN jsonb_build_object('projectId', p_project_id, 'resetCount', v_reset, 'skippedCount', v_skipped);
END;
$$;

COMMENT ON FUNCTION public.reset_project_markups(uuid) IS
  'reset_ffe_line_markup for every active (not removed, not superseded) non-labor line on the job '
  'that has a cost and is not locked (trade scope, released, drafted, invoiced, configuration-locked) '
  '(00809, D4; SQ-1124 F6/F10). The job label lock comes first, after the access check (SQ-1151, '
  'R182); row locks are then taken in id order (F7). Returns '
  '{projectId, resetCount, skippedCount}; skippedCount counts the active non-labor lines left alone.';

-- ─── 12. Project pricing (R8) ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_project_pricing(
  p_project_id uuid,
  p_markup_target_percent numeric,
  p_sales_tax_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_old public.project_pricing_settings%ROWTYPE;
  v_new public.project_pricing_settings%ROWTYPE;
BEGIN
  v_project := public._ffe_require_studio_project(p_project_id);

  IF p_markup_target_percent IS NOT NULL
     AND (p_markup_target_percent < 0 OR p_markup_target_percent > 1000) THEN
    RAISE EXCEPTION 'A markup target is between 0%% and 1000%%.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_sales_tax_rate IS NOT NULL AND (p_sales_tax_rate < 0 OR p_sales_tax_rate > 1) THEN
    RAISE EXCEPTION 'A sales tax rate is a fraction between 0 and 1, like 0.0825.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old FROM public.project_pricing_settings WHERE project_id = p_project_id FOR UPDATE;
  INSERT INTO public.project_pricing_settings
    (project_id, markup_target_percent, sales_tax_rate, updated_by, updated_at)
  VALUES (p_project_id, p_markup_target_percent, p_sales_tax_rate, auth.uid(), now())
  ON CONFLICT (project_id) DO UPDATE
    SET markup_target_percent = EXCLUDED.markup_target_percent,
        sales_tax_rate = EXCLUDED.sales_tax_rate,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_new;

  INSERT INTO public.audit_logs
    (user_id, organization_id, action, resource_type, resource_id, old_values, new_values)
  VALUES (
    auth.uid(), v_project.studio_id, 'project_pricing_set', 'projects', p_project_id,
    jsonb_build_object('markupTargetPercent', v_old.markup_target_percent, 'salesTaxRate', v_old.sales_tax_rate),
    jsonb_build_object('markupTargetPercent', v_new.markup_target_percent, 'salesTaxRate', v_new.sales_tax_rate)
  );

  RETURN jsonb_build_object(
    'projectId', v_new.project_id,
    'markupTargetPercent', v_new.markup_target_percent,
    'salesTaxRate', v_new.sales_tax_rate,
    'updatedAt', v_new.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.set_project_pricing(uuid, numeric, numeric) IS
  'Sets a job''s markup target (0..1000, the goods default override and blended target; NULL clears) '
  'and sales tax rate (a fraction 0..1; NULL clears) (00809, D4, R8). Lead or studio team '
  '(_ffe_require_studio_project), else 42501. Prices nothing; reset_project_markups applies a new '
  'target. Audited. Returns {projectId, markupTargetPercent, salesTaxRate, updatedAt}.';

-- ─── 13. The designer's own defaults ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_pricing_settings()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.designer_pricing_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM public.designer_pricing_settings WHERE user_id = auth.uid();
  RETURN jsonb_build_object(
    'defaultMarkupPercent', COALESCE(v_row.default_markup_percent, 35),
    'freightMarkupPercent', COALESCE(v_row.freight_markup_percent, 35),
    'deliveryMarkupPercent', COALESCE(v_row.delivery_markup_percent, 35),
    'installMarkupPercent', COALESCE(v_row.install_markup_percent, 35),
    'isDefault', v_row.user_id IS NULL,
    'updatedAt', v_row.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_pricing_settings() IS
  'The caller''s default markups (00809): {defaultMarkupPercent, freightMarkupPercent, '
  'deliveryMarkupPercent, installMarkupPercent, isDefault, updatedAt}; 35 each and isDefault true '
  'when the caller has never set them. SECURITY INVOKER: the own-row policy decides.';

CREATE OR REPLACE FUNCTION public.set_my_pricing_settings(
  p_default_markup_percent numeric DEFAULT NULL,
  p_freight_markup_percent numeric DEFAULT NULL,
  p_delivery_markup_percent numeric DEFAULT NULL,
  p_install_markup_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[p_default_markup_percent, p_freight_markup_percent,
                               p_delivery_markup_percent, p_install_markup_percent]) AS v(value)
    WHERE v.value IS NOT NULL AND (v.value < 0 OR v.value > 1000)
  ) THEN
    RAISE EXCEPTION 'A default markup is between 0%% and 1000%%.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.designer_pricing_settings AS settings (
    user_id, default_markup_percent, freight_markup_percent,
    delivery_markup_percent, install_markup_percent, updated_at
  ) VALUES (
    auth.uid(),
    COALESCE(p_default_markup_percent, 35), COALESCE(p_freight_markup_percent, 35),
    COALESCE(p_delivery_markup_percent, 35), COALESCE(p_install_markup_percent, 35),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    default_markup_percent = COALESCE(p_default_markup_percent, settings.default_markup_percent),
    freight_markup_percent = COALESCE(p_freight_markup_percent, settings.freight_markup_percent),
    delivery_markup_percent = COALESCE(p_delivery_markup_percent, settings.delivery_markup_percent),
    install_markup_percent = COALESCE(p_install_markup_percent, settings.install_markup_percent),
    updated_at = now();

  RETURN public.get_my_pricing_settings();
END;
$$;

COMMENT ON FUNCTION public.set_my_pricing_settings(numeric, numeric, numeric, numeric) IS
  'Sets the caller''s default markups (00809), each 0..1000; a NULL argument keeps the current value '
  '(35 on first write). Prices nothing already placed. Returns get_my_pricing_settings().';

-- ─── 14. Grants ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.set_ffe_line_pricing(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ffe_line_pricing(uuid, text, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.set_ffe_line_kind(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ffe_line_kind(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_ffe_cost_change(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_ffe_cost_change(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reset_ffe_line_markup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_ffe_line_markup(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reset_project_markups(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_project_markups(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_project_pricing(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_pricing(uuid, numeric, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_pricing_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pricing_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.set_my_pricing_settings(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_pricing_settings(numeric, numeric, numeric, numeric) TO authenticated;

COMMIT;
