-- ═══════════════════════════════════════════════════════════════════════════
-- 00618 — HT-4: a rate-card row binds to the roster role enum, not to a label
--
--   *"Rate-card rows bind to the roster role enum (lead_designer /
--     support_designer / bookkeeper / vendor), no free text."*
--     — HT-4, RULED 2026-09-11
--
-- WHAT THIS CLOSES. Defect #2 of the synthesis: a new hire's hours are
-- permanently stranded money. The rate card matched a FREE-TEXT role label
-- against the roster enum, and the shipped default label "Principal designer"
-- can never normalize-match 'lead_designer' — so a default two-role card
-- stranded EVERY entry on the project it priced, at 'pending_authorization'
-- with a NULL authority_rate_id, which 00577:2493-2496's promotion loop then
-- refuses to promote for ever. The label is now what the client reads; the enum
-- is what prices the hour, and the two can move independently.
--
-- Lineage:
--   _project_agreement_terms ................ 00575:2249 → 00618
--   upsert_agreement_parts .................. 00412 → 00422 → 00575 → 00577
--                                             → 00578:5095 → 00618
--   resolve_time_rate_cents ................. 00599 → 00615:380 → 00618
--   classify_project_time_entry_authority ... 00412 → 00575 → 00578 → 00601
--                                             → 00613:126 → 00618
-- Each body below is its head's body VERBATIM (extracted by line range, not
-- retyped) with exactly the delta named in its own banner comment grafted in.
--
-- WHY THE CLASSIFIER IS HERE AND plan-v2 §8 DOES NOT NAME IT. §8 names the
-- resolver alone. But the resolver hands back cents and provenance; it is
-- `classify_project_time_entry_authority` that picks the
-- project_billing_authority_rates ROW the entry is bound to, and that pick is
-- its own copy of the same label match (00613:401-421). Grafted into only one
-- of the two, HT-4 resolves 'authority' and still lands the row
-- `pending_authorization` with a NULL authority_rate_id — §8's own Done-when
-- ("a default two-role rate card prices a new hire's entry with
-- rate_source='authority'") is unreachable without both. The two legs are
-- written identically on purpose, and a postcondition below pins them together.
--
-- WHY THE NORMALISATION TOUCHES ONLY proposal_service_rates. §8 asks for a
-- normalisation step "for existing rows whose role_name does normalize-match
-- the enum (and leaves the rest NULL)". project_billing_authority_rates rows
-- are the IMMUTABLE snapshot of a signed contract —
-- `guard_billing_authority_rates_immutable` raises on any UPDATE, by design —
-- and stamping them buys nothing: the legacy label leg is kept verbatim in both
-- grafted bodies, so a roster_role-NULL snapshot prices exactly as it did
-- yesterday. Signed paper is not renormalised to tidy a column. A postcondition
-- asserts no snapshot row was written.
--
-- P-4 (no backfill) is not engaged: no project_time_entries row is re-priced,
-- re-rated or touched by this file.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (1) the column, on both halves of the rate's journey ───────────────────
-- The four values are the BILLABLE subset of project_team_members.role
-- (00084:164-165 — a TEXT CHECK, not a Postgres enum, whose full set also
-- carries 'client'; HT-4 names four and 'client' is deliberately excluded).
-- Nullable, because every row that exists today has no binding and must go on
-- pricing by its label.
ALTER TABLE public.proposal_service_rates
  ADD COLUMN IF NOT EXISTS roster_role text;
ALTER TABLE public.project_billing_authority_rates
  ADD COLUMN IF NOT EXISTS roster_role text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proposal_service_rates_roster_role_ck'
      AND conrelid = 'public.proposal_service_rates'::regclass
  ) THEN
    ALTER TABLE public.proposal_service_rates
      ADD CONSTRAINT proposal_service_rates_roster_role_ck
      CHECK (roster_role IS NULL OR roster_role IN
             ('lead_designer', 'support_designer', 'bookkeeper', 'vendor'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_billing_authority_rates_roster_role_ck'
      AND conrelid = 'public.project_billing_authority_rates'::regclass
  ) THEN
    ALTER TABLE public.project_billing_authority_rates
      ADD CONSTRAINT project_billing_authority_rates_roster_role_ck
      CHECK (roster_role IS NULL OR roster_role IN
             ('lead_designer', 'support_designer', 'bookkeeper', 'vendor'));
  END IF;
END
$$;

COMMENT ON COLUMN public.proposal_service_rates.roster_role IS
  'HT-4 (00618): the roster role this rate prices, picked from an enum in the '
  'rate-card part editor. role_name stays the label the client reads on the '
  'agreement; this is what resolve_time_rate_cents and '
  'classify_project_time_entry_authority match on. NULL = a card written before '
  'the binding existed, priced by the legacy normalized-label match.';
COMMENT ON COLUMN public.project_billing_authority_rates.roster_role IS
  'HT-4 (00618): carried verbatim from the proposal_service_rates row this '
  'snapshot froze (00619). NULL on every row materialized before 00619, and '
  'those are priced by the legacy normalized-label match, unchanged.';

-- ── (2) the normalisation ──────────────────────────────────────────────────
-- Only where the answer is unambiguous INSIDE ITS OWN CARD: a card carrying
-- both "Lead designer" and "lead_designer" normalizes to one value twice, and
-- today's label match already strands it (count(*) = 2). Stamping both would
-- move nothing and would hide the collision behind a column. Left NULL, it
-- goes on behaving exactly as it does today.
--
-- The two guards on this table refuse a write from outside the Contract Room
-- (`guard_commercial_authored_child`: draft-only; `guard_agreement_projection_write`:
-- the app.agreement_projection GUC). Both are application-write contracts, and
-- this is a schema-evolution statement running as the table owner inside the
-- migration — the same reasoning, and the same ALTER TABLE … DISABLE TRIGGER
-- idiom, as 00399:5117, 00461:1252 and 00572:1730. The value written is derived
-- from the row's OWN label and no money moves.
DO $$
DECLARE
  v_stamped integer;
BEGIN
  ALTER TABLE public.proposal_service_rates
    DISABLE TRIGGER guard_proposal_service_rates_authored;
  ALTER TABLE public.proposal_service_rates
    DISABLE TRIGGER guard_proposal_service_rates_projection;

  WITH normalized AS (
    SELECT rate.id,
           CASE regexp_replace(
                  replace(lower(btrim(rate.role_name)), '_', ' '), '\s+', ' ', 'g')
             WHEN 'lead designer'    THEN 'lead_designer'
             WHEN 'support designer' THEN 'support_designer'
             WHEN 'bookkeeper'       THEN 'bookkeeper'
             WHEN 'vendor'           THEN 'vendor'
           END AS roster_role,
           rate.proposal_id,
           rate.version
    FROM public.proposal_service_rates AS rate
    WHERE rate.roster_role IS NULL
  ),
  unambiguous AS (
    SELECT id, roster_role
    FROM normalized
    WHERE roster_role IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM normalized AS peer
        WHERE peer.proposal_id = normalized.proposal_id
          AND peer.version     = normalized.version
          AND peer.roster_role = normalized.roster_role
          AND peer.id         <> normalized.id
      )
  )
  UPDATE public.proposal_service_rates AS rate
     SET roster_role = unambiguous.roster_role
    FROM unambiguous
   WHERE rate.id = unambiguous.id;
  GET DIAGNOSTICS v_stamped = ROW_COUNT;

  ALTER TABLE public.proposal_service_rates
    ENABLE TRIGGER guard_proposal_service_rates_authored;
  ALTER TABLE public.proposal_service_rates
    ENABLE TRIGGER guard_proposal_service_rates_projection;

  RAISE NOTICE '00618: % proposal_service_rates row(s) normalized onto the roster enum; the rest keep their labels.', v_stamped;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (2b) HT-35 — auto-start is disclosed once, and a member may decline it
--
--   *"Disclose once on a member's first document open; per-member opt-out on
--     their own profile, default on, falls back to one-tap manual start."*
--     — HT-35, RULED 2026-09-11
--
-- WHY THESE TWO COLUMNS RIDE IN 00618. HT-35's surfaces were descoped from W2
-- and scoped by the orchestrator to this stage; both need a PER-MEMBER,
-- CROSS-DEVICE preference and there is no column for one — `user_settings` has
-- none, `profiles` has none, and `profiles.help_state` is the help system's own
-- cache, not a general preferences bag. plan-v2 reserves HT-35 no migration
-- number and this program's block is spent but for 00618 and 00619, so the two
-- columns land here rather than by minting a number outside the plan. They are
-- additive, defaulted, touch no other wave's objects and no hour.
--
-- DEFAULT ON, and the default is what a NULL row means: `false` on the opt-out
-- is "auto-start stands", which is the shipped behaviour (R19/D11) for every
-- member who never opens this setting. The disclosure stamp is NULL until the
-- band has been shown once; it is stamped when the band RENDERS rather than
-- when it is dismissed, because "appears once and never again" is the ruling's
-- own test and a member who reloads past an undismissed band has still seen it.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS time_autostart_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS time_autostart_disclosed_at timestamptz;

COMMENT ON COLUMN public.profiles.time_autostart_opt_out IS
  'HT-35 (00618): this member declined the automatic timer. Default false = '
  'auto-start stands (R19/D11). True does NOT mean "no timer" — the document '
  'spine falls back to a one-tap manual start, which is the ruling''s own '
  'wording. Written by the member on her own profile page, through the '
  '"Users can update own profile" policy; nobody else''s setting is reachable.';
COMMENT ON COLUMN public.profiles.time_autostart_disclosed_at IS
  'HT-35 (00618): when the one-time auto-start disclosure band was first shown '
  'to this member. NULL = never shown. Per member rather than per device so the '
  'sentence is not re-served on a second browser.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) _project_agreement_terms — head 00575:2249, ONE delta
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._project_agreement_terms(
  p_proposal_id uuid,
  p_terms jsonb,
  p_rates jsonb,
  p_allow_null_ceiling boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rate jsonb;
  v_current_version integer := COALESCE((p_terms->>'currentRateVersion')::integer, 1);
BEGIN
  INSERT INTO public.proposal_service_terms (
    proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
    retainer_amount_cents, retainer_activation_policy, billing_cadence,
    currency, terms, current_rate_version, furnishings_deposit_percent
  ) VALUES (
    p_proposal_id,
    COALESCE(p_terms->>'scope', ''),
    COALESCE(p_terms->'deliverables', '[]'::jsonb),
    COALESCE(p_terms->'exclusions', '[]'::jsonb),
    -- The ONE delta from 00422:1756, and it is opt-in: only a caller that
    -- passes p_allow_null_ceiling may write NULL (uncapped). The false branch
    -- is 00422:1756 character for character, so the flag-off door still turns
    -- an omitted or JSON-null ceiling into 0.
    CASE WHEN p_allow_null_ceiling
      THEN (NULLIF(p_terms->>'billingCeilingCents', ''))::integer
      ELSE COALESCE((p_terms->>'billingCeilingCents')::integer, 0)
    END,
    COALESCE((p_terms->>'retainerAmountCents')::integer, 0),
    COALESCE(NULLIF(p_terms->>'retainerActivationPolicy', ''), 'immediate'),
    COALESCE(NULLIF(p_terms->>'billingCadence', ''), 'monthly'),
    upper(COALESCE(NULLIF(p_terms->>'currency', ''), 'USD')),
    NULLIF(p_terms->>'terms', ''),
    v_current_version,
    NULLIF(p_terms->>'furnishingsDepositPercent', '')::numeric
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
    furnishings_deposit_percent = EXCLUDED.furnishings_deposit_percent,
    updated_at = now();

  DELETE FROM public.proposal_service_rates WHERE proposal_id = p_proposal_id;
  FOR v_rate IN SELECT value FROM jsonb_array_elements(COALESCE(p_rates, '[]'::jsonb))
  LOOP
    INSERT INTO public.proposal_service_rates (
      proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at,
      roster_role
    ) VALUES (
      p_proposal_id,
      COALESCE((v_rate->>'version')::integer, v_current_version),
      btrim(v_rate->>'roleName'),
      (v_rate->>'hourlyRateCents')::integer,
      COALESCE((v_rate->>'sortOrder')::integer, 0),
      COALESCE((v_rate->>'effectiveAt')::timestamptz, now()),
      -- 00618 (HT-4). THE ONE DELTA. The picker's enum rides the same jsonb the
      -- label rides; an absent or empty rosterRole stays NULL and the row is a
      -- legacy label-only card, which the resolver still matches by name.
      NULLIF(btrim(COALESCE(v_rate->>'rosterRole', '')), '')
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._project_agreement_terms(uuid, jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) upsert_agreement_parts — head 00578:5095, the enum asked at the door
--     and carried into the projection. Everything else is 00578's body.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.upsert_agreement_parts(
  p_proposal_id uuid,
  p_parts jsonb,
  p_why text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_existing public.proposal_service_terms%ROWTYPE;
  v_terms jsonb;
  v_rates jsonb;
  v_version integer;
  v_duplicate text;
  v_part jsonb;
  v_payload jsonb;
  v_kind text;
  v_variant text;
  v_key text;
  v_title text;
  v_keys text[] := ARRAY[]::text[];
  v_role jsonb;
  v_role_name text;
  v_role_names text[];
  -- 00618 (HT-4)
  v_roster_role text;
  v_roster_roles text[];
  v_percent numeric;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_projection text := current_setting('app.agreement_projection', true);
  -- 00577
  v_before jsonb;
  v_after jsonb;
  v_fee_basis text;
  v_fee_amount_cents integer;
  v_fee_schedule jsonb;
  v_phase jsonb;
  -- 00578
  v_message text;
BEGIN
  IF auth.uid() IS NULL
     OR jsonb_typeof(COALESCE(p_parts, 'null'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION 'agreement parts require an authenticated author and an ordered array'
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
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum', 'design_build') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- R7 (N-7) and R2 (N-6): every refusal a composition can earn is worded
  -- HERE, in the designer's words, and asked BEFORE anything is written.
  --
  -- Everything below this loop lands rows whose CHECK constraints, unique
  -- indexes and NOT NULLs would otherwise answer for us — and Postgres
  -- answers with the name of a constraint, a column or a table, which the
  -- composer prints verbatim as its save note. A designer must never read
  -- one.
  --
  -- The money halves are asked with jsonb_typeof BEFORE any cast, exactly as
  -- _agreement_floor_unmet asks them, so the floor and the projection can
  -- never read one payload two ways: a rate stated as the string "22500" is
  -- refused here rather than billing hours against a cap the floor is blind
  -- to, and a ceiling stated as a string earns its own sentence rather than
  -- the floor's.
  --
  -- Nothing here is a UI courtesy duplicated in SQL: upsert_agreement_parts
  -- is GRANTed to authenticated, so this loop is the only thing standing
  -- between a hand-made payload and the money row the authority snapshots.
  -- ─────────────────────────────────────────────────────────────────────────
  FOR v_part IN SELECT value FROM jsonb_array_elements(p_parts)
  LOOP
    IF jsonb_typeof(v_part) <> 'object' THEN
      RAISE EXCEPTION 'this agreement could not be read as a list of parts'
        USING ERRCODE = 'check_violation';
    END IF;

    v_kind    := btrim(COALESCE(v_part->>'kind', ''));
    v_variant := NULLIF(btrim(COALESCE(v_part->>'variant', '')), '');
    v_key     := btrim(COALESCE(v_part->>'partKey', ''));
    v_title   := btrim(COALESCE(v_part->>'title', ''));
    v_payload := COALESCE(v_part->'payload', '{}'::jsonb);

    IF v_kind = '' OR v_key = '' THEN
      RAISE EXCEPTION 'every part of an agreement needs a name and a type'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_title = '' THEN
      RAISE EXCEPTION 'every part of an agreement needs a title'
        USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(v_payload) <> 'object' THEN
      RAISE EXCEPTION 'the part titled "%" could not be read', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    -- The uniqueness the table states as uniq_agreement_part_key, asked in
    -- the words of the rail rather than in the words of the index.
    IF v_key = ANY (v_keys) THEN
      RAISE EXCEPTION 'this agreement lists the part titled "%" twice', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    v_keys := v_keys || v_key;

    -- The three fields the INSERT below casts. Postgres answers a bad cast
    -- with `invalid input syntax for type boolean` and the like, and the
    -- composer prints the RPC's text verbatim as its save note — so these are
    -- asked here, in the words of the room, exactly as every money figure is.
    IF v_part ? 'required'
       AND jsonb_typeof(v_part->'required') NOT IN ('boolean', 'null') THEN
      RAISE EXCEPTION 'whether the part titled "%" is required is a yes or a no', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_part ? 'clientVisible'
       AND jsonb_typeof(v_part->'clientVisible') NOT IN ('boolean', 'null') THEN
      RAISE EXCEPTION 'whether the client sees the part titled "%" is a yes or a no', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF NULLIF(btrim(COALESCE(v_part->>'sourcePartId', '')), '') IS NOT NULL
       AND btrim(v_part->>'sourcePartId') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'the part that "%" was copied from could not be read', v_title
        USING ERRCODE = 'check_violation';
    END IF;

    -- R48 (W3R2-01) — THE PRICE IS NEVER HIDDEN.
    --
    -- R39's visibility act is general, and a general act applied to the
    -- pricing basis took the whole of a design-build agreement's money off
    -- the paper: the redacted projection dropped the part, the client's copy
    -- printed a draw schedule against a price it did not name, and the walk
    -- signed it. The draw schedule is the same kind of term — it is what she
    -- is asked to pay, and when.
    --
    -- So the two turnkey parts that state the money are client-visible by
    -- construction, refused here rather than caught downstream. The composer
    -- no longer offers the toggle on either; this is what holds for a payload
    -- that arrives any other way.
    IF COALESCE((v_part->>'clientVisible')::boolean, true) IS NOT TRUE
       AND v_kind = 'schedule'
       AND v_variant IN ('pricing_basis', 'draws') THEN
      RAISE EXCEPTION
        'your client signs the price and the draws, so "%" cannot be hidden from her',
        v_title
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'rate_card' THEN
      IF v_payload ? 'roles' AND jsonb_typeof(v_payload->'roles') <> 'array' THEN
        RAISE EXCEPTION 'a rate card is a list of roles and their hourly rates'
          USING ERRCODE = 'check_violation';
      END IF;
      v_role_names := ARRAY[]::text[];
      v_roster_roles := ARRAY[]::text[];
      FOR v_role IN
        SELECT value FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_payload->'roles') = 'array'
               THEN v_payload->'roles' ELSE '[]'::jsonb END)
      LOOP
        IF jsonb_typeof(v_role) <> 'object' THEN
          RAISE EXCEPTION 'a rate card is a list of roles and their hourly rates'
            USING ERRCODE = 'check_violation';
        END IF;
        v_role_name := btrim(COALESCE(v_role->>'roleName', ''));
        IF v_role_name = '' THEN
          RAISE EXCEPTION 'every role on the rate card needs a name'
            USING ERRCODE = 'check_violation';
        END IF;
        -- The rates table is unique on (proposal, version, role name), and
        -- the projection btrims the name exactly as this does.
        IF v_role_name = ANY (v_role_names) THEN
          RAISE EXCEPTION 'the rate card names % twice', v_role_name
            USING ERRCODE = 'check_violation';
        END IF;
        v_role_names := v_role_names || v_role_name;
        -- ── 00618 (HT-4): the role binding is an enum, asked at the door ────
        -- The rate card binds to the roster role, and the four values are the
        -- billable subset of project_team_members.role (00084:164-165, a TEXT
        -- CHECK whose full set also carries 'client'). Asked here rather than
        -- left to the column CHECK so the room hears a sentence instead of a
        -- 23514 from two functions down, the discipline every other refusal in
        -- this loop already follows.
        v_roster_role := NULLIF(btrim(COALESCE(v_role->>'rosterRole', '')), '');
        IF v_roster_role IS NOT NULL
           AND v_roster_role NOT IN
               ('lead_designer', 'support_designer', 'bookkeeper', 'vendor') THEN
          RAISE EXCEPTION '% is not a role the studio roster carries', v_role_name
            USING ERRCODE = 'check_violation';
        END IF;
        -- One rate per role, or the resolver's exact-one card match (00618's
        -- tier 1) finds two and strands the hour it was meant to price — the
        -- stranding defect HT-4 exists to close, arriving by a second door.
        IF v_roster_role IS NOT NULL AND v_roster_role = ANY (v_roster_roles) THEN
          RAISE EXCEPTION 'the rate card prices % twice', v_roster_role
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_roster_role IS NOT NULL THEN
          v_roster_roles := v_roster_roles || v_roster_role;
        END IF;
        IF v_role->'hourlyRateCents' IS NULL
           OR jsonb_typeof(v_role->'hourlyRateCents') = 'null' THEN
          RAISE EXCEPTION 'every role on the rate card needs an hourly rate'
            USING ERRCODE = 'check_violation';
        END IF;
        PERFORM public._agreement_assert_cents(v_role, 'hourlyRateCents', 'hourly rate');
        IF v_role ? 'sortOrder'
           AND jsonb_typeof(v_role->'sortOrder') NOT IN ('number', 'null') THEN
          RAISE EXCEPTION 'the rate card''s order could not be read at %', v_role_name
            USING ERRCODE = 'check_violation';
        END IF;
        -- (B-9) A date the projection cannot read would reach
        -- proposal_service_rates as a raw cast error. Asked here instead.
        IF NULLIF(btrim(COALESCE(v_role->>'effectiveAt', '')), '') IS NOT NULL THEN
          BEGIN
            PERFORM (v_role->>'effectiveAt')::timestamptz;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'the date % takes effect could not be read', v_role_name
              USING ERRCODE = 'check_violation';
          END;
        END IF;
      END LOOP;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'ceiling' THEN
      PERFORM public._agreement_assert_cents(v_payload, 'cents', 'ceiling');
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'retainer' THEN
      PERFORM public._agreement_assert_cents(v_payload, 'cents', 'retainer');
      IF NULLIF(btrim(COALESCE(v_payload->>'activationPolicy', '')), '') IS NOT NULL
         AND v_payload->>'activationPolicy' NOT IN ('immediate', 'retainer_paid') THEN
        RAISE EXCEPTION 'a retainer starts either right away or once it is paid'
          USING ERRCODE = 'check_violation';
      END IF;
      -- 00577: the credit rule reaches proposal_service_terms now, and its
      -- CHECK would answer a designer with the name of a constraint.
      IF NULLIF(btrim(COALESCE(v_payload->>'creditRule', '')), '') IS NOT NULL
         AND v_payload->>'creditRule'
             NOT IN ('credited', 'non_refundable', 'replenishing') THEN
        RAISE EXCEPTION 'a retainer is credited against fees, non-refundable, or replenishing'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- 00577 (P5). The two Wave-2 fee shapes, asked the way every other money
    -- figure in this loop is asked: jsonb_typeof BEFORE any cast, so a
    -- malformed payload earns a sentence rather than reaching the money row
    -- as a raw cast error.
    IF v_kind = 'schedule' AND v_variant = 'flat' THEN
      PERFORM public._agreement_assert_cents(v_payload, 'cents', 'flat fee');
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'per_phase' THEN
      IF v_payload ? 'phases' AND jsonb_typeof(v_payload->'phases') <> 'array' THEN
        RAISE EXCEPTION 'a per-phase fee is a list of phases and what each one costs'
          USING ERRCODE = 'check_violation';
      END IF;
      FOR v_phase IN
        SELECT value FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_payload->'phases') = 'array'
               THEN v_payload->'phases' ELSE '[]'::jsonb END)
      LOOP
        IF jsonb_typeof(v_phase) <> 'object' THEN
          RAISE EXCEPTION 'a per-phase fee is a list of phases and what each one costs'
            USING ERRCODE = 'check_violation';
        END IF;
        IF btrim(COALESCE(v_phase->>'label', '')) = '' THEN
          RAISE EXCEPTION 'every phase of a per-phase fee needs a name'
            USING ERRCODE = 'check_violation';
        END IF;
        PERFORM public._agreement_assert_cents(v_phase, 'cents', 'phase fee');
      END LOOP;
    END IF;

    -- 00578: 'per_draw' is legal in the money row from this migration on
    -- (PART 2 widened both cadence CHECKs), so it joins the sentence rather
    -- than being refused by it.
    IF v_kind = 'schedule' AND v_variant = 'cadence' THEN
      IF NULLIF(btrim(COALESCE(v_payload->>'cadence', '')), '') IS NOT NULL
         AND v_payload->>'cadence'
             NOT IN ('monthly', 'biweekly', 'milestone', 'per_draw') THEN
        RAISE EXCEPTION 'billing runs monthly, every two weeks, at milestones, or on each draw'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- 00578 (P9): the three turnkey money payloads, asked ONLY once the
    -- designer has filled the shape enough to be judged. See the header note
    -- (c): an empty basis and an empty draw list are what a materialized
    -- template looks like, and Save must not refuse them.
    IF v_kind = 'schedule' AND v_variant = 'pricing_basis'
       AND NULLIF(btrim(COALESCE(v_payload->>'basis', '')), '') IS NOT NULL
       AND jsonb_typeof(v_payload->'costLines') = 'array'
       AND jsonb_array_length(v_payload->'costLines') > 0 THEN
      v_message := public._validate_pricing_basis_payload(v_payload);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'draws'
       AND jsonb_typeof(v_payload->'draws') = 'array'
       AND jsonb_array_length(v_payload->'draws') > 1 THEN
      v_message := public._validate_draws_payload(v_payload);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'allowances'
       AND jsonb_typeof(v_payload->'allowances') = 'array'
       AND jsonb_array_length(v_payload->'allowances') > 0 THEN
      v_message := public._validate_allowances_payload(v_payload);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'procurement' THEN
      IF v_payload->'depositPercent' IS NOT NULL
         AND jsonb_typeof(v_payload->'depositPercent') <> 'null' THEN
        IF jsonb_typeof(v_payload->'depositPercent') <> 'number' THEN
          RAISE EXCEPTION 'a furnishings deposit is a percentage between 0 and 100'
            USING ERRCODE = 'check_violation';
        END IF;
        v_percent := (v_payload->'depositPercent' #>> '{}')::numeric;
        IF v_percent < 0 OR v_percent > 100 THEN
          RAISE EXCEPTION 'a furnishings deposit is a percentage between 0 and 100'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 00578 (§4.3, research 02 §9 item 6). SUPERVISION IS PAID ONCE. This is
  -- not incompleteness — a half-written draft cannot accidentally state both
  -- a supervision fee and a markup on the trades — so unlike the three
  -- payload validators above it is asked at every Save, in the same sentence
  -- the composer and the send door use.
  v_message := public._validate_no_double_count(p_parts);
  IF v_message IS NOT NULL THEN
    RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET document_kind = CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END,
      commercial_state = 'draft', updated_at = now()
  WHERE id = p_proposal_id;

  -- 00577 (P8): the set as it stood. Captured before the write, because the
  -- write is DELETE-then-INSERT and there is no other moment it exists.
  SELECT COALESCE(jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at' - 'proposal_id'
                            ORDER BY ap.position, ap.id), '[]'::jsonb)
  INTO v_before
  FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id;

  SET CONSTRAINTS uniq_agreement_part_position DEFERRED;
  DELETE FROM public.proposal_agreement_parts WHERE proposal_id = p_proposal_id;
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, variant, part_key, title, payload,
    required, client_visible, source_template_key, source_part_id
  )
  SELECT
    p_proposal_id,
    e.ord::integer,
    e.part->>'kind',
    NULLIF(e.part->>'variant', ''),
    e.part->>'partKey',
    btrim(e.part->>'title'),
    COALESCE(e.part->'payload', '{}'::jsonb),
    COALESCE((e.part->>'required')::boolean, false),
    COALESCE((e.part->>'clientVisible')::boolean, true),
    NULLIF(e.part->>'sourceTemplateKey', ''),
    NULLIF(e.part->>'sourcePartId', '')::uuid
  FROM jsonb_array_elements(p_parts) WITH ORDINALITY AS e(part, ord);

  -- One of each money part. The projection below reads a money part by its
  -- shape, so two ceilings — however they are keyed — would leave the money
  -- row picking between them. The Add menu offers every schedule variant;
  -- this is the sentence that answers "add a second ceiling", in the words a
  -- designer uses for the part rather than the words the table uses.
  SELECT CASE ap.variant
           WHEN 'rate_card'     THEN 'rate card'
           WHEN 'ceiling'       THEN 'ceiling'
           WHEN 'retainer'      THEN 'retainer'
           WHEN 'cadence'       THEN 'billing cadence'
           WHEN 'procurement'   THEN 'furnishings deposit'
           WHEN 'pricing_basis' THEN 'pricing basis'
           WHEN 'draws'         THEN 'draw schedule'
           WHEN 'allowances'    THEN 'allowances list'
         END
    INTO v_duplicate
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
    AND ap.kind = 'schedule'
    AND ap.variant IN ('rate_card', 'ceiling', 'retainer', 'cadence',
                       'procurement', 'pricing_basis', 'draws', 'allowances')
  GROUP BY ap.variant
  HAVING count(*) > 1
  ORDER BY 1
  LIMIT 1;
  IF v_duplicate IS NOT NULL THEN
    RAISE EXCEPTION 'an agreement carries only one %', v_duplicate
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00577 (P5, R9): ONE FEE BASIS. A flat fee and a per-phase schedule both
  -- answer "what does the work cost", and the projection below writes
  -- fee_basis from whichever is present — so two of them, in any combination,
  -- leave that column choosing between two answers. W1's refusal above cannot
  -- say this: it asks about one variant at a time, and flat-beside-per_phase
  -- is one of each.
  IF (SELECT count(*) FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule'
        AND ap.client_visible
        AND ap.variant IN ('flat', 'per_phase')) > 1 THEN
    RAISE EXCEPTION 'an agreement carries one fee basis'
      USING ERRCODE = 'check_violation';
  END IF;

  -- R4'S FLOOR IS NOT ASKED HERE. A DRAFT IS ALLOWED TO BE UNFINISHED.
  --
  -- R22 places the floor at the doors a document LEAVES DRAFT by — send, sign
  -- and the paper door — and Wave 1 also asked it here, at Save. The walk
  -- showed what that costs: a freshly materialized composition seeds a rate
  -- card from the studio's defaults with no ceiling beside it and no fee typed
  -- yet, so the first Save of the first sentence the designer writes is
  -- refused, and every Save after it, until a fee AND a cap are typed. There
  -- is no order of work that reaches a saved draft. Composing an agreement is
  -- writing, and writing is saved half-done.
  --
  -- Nothing is lost by moving it: _agreement_floor_unmet and
  -- _agreement_fee_unnamed are asked at send_commercial_document,
  -- _sign_design_services_agreement_authorized and
  -- _issue_design_services_agreement_on_paper, and parts freeze when the
  -- document leaves draft (R6) — so no composition below the floor can reach
  -- a homeowner. The readiness panel names both blockers in the room the
  -- moment the rail renders, which is where the designer needs to read them.
  --
  -- The duplicate refusal above STAYS at this door: it is not a floor, it is
  -- the projection's precondition — two ceilings leave the money row picking
  -- between them, and there is no half-composed state that wants that.

  SELECT * INTO v_existing FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id;
  v_version := COALESCE(v_existing.current_rate_version, 1);

  -- WHAT PROJECTS, AND ON WHAT GROUND.
  --
  -- The four prose columns are read from the four standard keys: 'the scope'
  -- and 'the terms' are named slots on the legacy row, and two clauses cannot
  -- both be the scope. UNIQUE (proposal_id, part_key) makes each of those a
  -- scalar, and each subquery also asserts the kind — a schedule keyed
  -- patina.services is not the scope.
  --
  -- The five money figures are read by SHAPE — kind 'schedule' plus variant —
  -- under whatever key the composition gave them, because the composer mints
  -- a fresh key for every part it adds and the figure on the page must be the
  -- figure in the money row. The duplicate refusal above makes each of these
  -- a scalar too.
  --
  -- Both halves still insist on the shape, so a clause keyed patina.ceiling
  -- is prose that happens to mention a cap and writes nothing (R5), and every
  -- variant outside these five — flat, per_phase, percent_of_cost, draws,
  -- allowances — is recorded and hashed and reaches the money row not at all,
  -- until R9's Wave-2 columns exist to hold it.
  --
  -- patina.retainer's payload->>'creditRule' is READ AND DISCARDED in Wave 1:
  -- the column arrives on proposal_service_terms in Wave 2 (D-2). It is not a
  -- dropped field, it is a field with nowhere to land yet.
  v_terms := jsonb_build_object(
    'scope', COALESCE((
      SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.services'
        AND ap.kind = 'clause'
    ), ''),
    'deliverables', COALESCE((
      SELECT jsonb_agg(e.item->>'text' ORDER BY e.ord)
             FILTER (WHERE e.item->>'text' IS NOT NULL)
      FROM public.proposal_agreement_parts ap
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ap.payload->'items') = 'array'
             THEN ap.payload->'items' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(item, ord)
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.deliverables'
        AND ap.kind = 'list'
    ), '[]'::jsonb),
    'exclusions', COALESCE((
      SELECT jsonb_agg(e.item->>'text' ORDER BY e.ord)
             FILTER (WHERE e.item->>'text' IS NOT NULL)
      FROM public.proposal_agreement_parts ap
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ap.payload->'items') = 'array'
             THEN ap.payload->'items' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(item, ord)
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.exclusions'
        AND ap.kind = 'list'
    ), '[]'::jsonb),
    'terms', (
      SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.terms'
        AND ap.kind = 'clause'
    ),
    'billingCeilingCents', (
      SELECT (ap.payload->>'cents')::integer FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'ceiling'
    ),
    'retainerAmountCents', COALESCE((
      SELECT (ap.payload->>'cents')::integer FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 0),
    'retainerActivationPolicy', COALESCE((
      SELECT NULLIF(ap.payload->>'activationPolicy', '')
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 'immediate'),
    'billingCadence', COALESCE((
      SELECT NULLIF(ap.payload->>'cadence', '') FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'cadence'
    -- 00578 (R9): a turnkey agreement bills on each draw, and that is the ONE
    -- authority this class writes. A design-build composition that carries no
    -- cadence part of its own still projects 'per_draw'; every other class
    -- keeps 00577's 'monthly'.
    ), CASE WHEN v_proposal.document_kind = 'design_build'
            THEN 'per_draw' ELSE 'monthly' END),
    'furnishingsDepositPercent', (
      SELECT (ap.payload->>'depositPercent')::numeric FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'procurement'
    ),
    'currency', COALESCE(v_existing.currency, 'USD'),
    'currentRateVersion', v_version
  );

  -- (B-9) effectiveAt rides through the parts door. Without it the
  -- projection falls to now() for every role, and
  -- classify_project_time_entry_authority filters authority rates on
  -- `effective_at <= started_at` — so a rate written for January stopped
  -- applying to January's hours the first time the agreement was opened in
  -- the Contract Room. A role that carries no date still falls to now(),
  -- which is what a rate written today means.
  v_rates := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'version', v_version,
      'roleName', e.rate->>'roleName',
      -- 00618 (HT-4). The enum rides to the projection beside the label.
      'rosterRole', NULLIF(e.rate->>'rosterRole', ''),
      'hourlyRateCents', (e.rate->>'hourlyRateCents')::integer,
      'sortOrder', COALESCE((e.rate->>'sortOrder')::integer, 0),
      'effectiveAt', NULLIF(e.rate->>'effectiveAt', '')
    ) ORDER BY e.ord)
    FROM public.proposal_agreement_parts ap
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(ap.payload->'roles') = 'array'
           THEN ap.payload->'roles' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(rate, ord)
    WHERE ap.proposal_id = p_proposal_id
      AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
  ), '[]'::jsonb);

  -- true = the parts door, and only the parts door, may leave the ceiling
  -- NULL: a removed ceiling part is uncapped, not zero-capped.
  --
  -- R17(a): the GUC is set for exactly the width of the projection and put
  -- back after, so guard_agreement_projection_write refuses every other
  -- writer of the money row while this document has parts. Transaction-local
  -- (set_config's third argument), so it cannot leak past this statement.
  -- 00577 (P5, R9). WHAT CREATES AUTHORITY AND WHAT ONLY GETS RECORDED.
  -- flat and per_phase name the fee; a rate card means hourly; everything
  -- else a schedule can be — percent_of_cost, percent_of_spend, cost_plus,
  -- day_rate, package, pricing_basis, draws, allowances — writes NOTHING
  -- here. The rule lives in the projection rather than behind a chip in the
  -- room, because this RPC is GRANTed to authenticated: a hand-crafted
  -- cost_plus part sent straight through it must still leave fee_basis NULL.
  -- Read by SHAPE, like every other money figure in this body.
  --
  -- R33 — AND ONLY WHAT SHE CAN SEE. Every fee read here is client_visible,
  -- because the fee set is what CHARGES her: a studio-only flat fee beside a
  -- visible rate card used to send `flat / $8,000` to the money row and onto
  -- the executed authority, while the sentence she ticked named the rates and
  -- the keepsake she keeps never mentioned the eight thousand. Three surfaces
  -- of one agreement disagreeing, and the one that disagreed was the one that
  -- billed. compose_agreement_consent, _render_agreement_snapshot_html and
  -- R22's floor all read client_visible already; this was the only reader that
  -- did not. A hidden fee is recorded on the agreement and reaches the money
  -- row not at all — the same answer R9 gives a cost_plus.
  --
  -- proposal_service_rates is NOT filtered that way, and deliberately: R33
  -- names proposal_service_terms and the authority, and the rate rows are a
  -- third thing — the send door refuses a rate card with no rate rows behind
  -- it, in words about role rates rather than about a fee. A hidden rate card
  -- still cannot bill: it writes no fee_basis here, and R22's floor refuses
  -- the send while it is the only fee on the paper.
  SELECT ap.variant,
         CASE WHEN ap.variant = 'flat'
              THEN CASE WHEN jsonb_typeof(ap.payload->'cents') = 'number'
                        THEN (ap.payload->>'cents')::integer END
              ELSE (SELECT sum((e.phase->>'cents')::integer)
                    FROM jsonb_array_elements(
                           CASE WHEN jsonb_typeof(ap.payload->'phases') = 'array'
                                THEN ap.payload->'phases' ELSE '[]'::jsonb END)
                      AS e(phase)
                    WHERE jsonb_typeof(e.phase->'cents') = 'number') END,
         CASE WHEN ap.variant = 'per_phase'
              THEN CASE WHEN jsonb_typeof(ap.payload->'phases') = 'array'
                        THEN ap.payload->'phases' ELSE '[]'::jsonb END END
    INTO v_fee_basis, v_fee_amount_cents, v_fee_schedule
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
    AND ap.kind = 'schedule' AND ap.variant IN ('flat', 'per_phase')
    AND ap.client_visible;

  IF v_fee_basis IS NULL THEN
    v_fee_amount_cents := NULL;
    v_fee_schedule := NULL;
    IF EXISTS (SELECT 1 FROM public.proposal_agreement_parts ap
               WHERE ap.proposal_id = p_proposal_id
                 AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
                 AND ap.client_visible) THEN
      v_fee_basis := 'hourly';
    END IF;
  END IF;

  -- true = the parts door, and only the parts door, may leave the ceiling
  -- NULL: a removed ceiling part is uncapped, not zero-capped.
  --
  -- R17(a): the GUC is set for exactly the width of the projection and put
  -- back after, so guard_agreement_projection_write refuses every other
  -- writer of the money row while this document has parts. Transaction-local
  -- (set_config's third argument), so it cannot leak past this statement.
  PERFORM set_config('app.agreement_projection', p_proposal_id::text, true);
  PERFORM public._project_agreement_terms(p_proposal_id, v_terms, v_rates, true);

  -- 00577: the four Wave-2 figures, written inside the SAME projection window
  -- and as their own statement rather than as four more arguments to
  -- _project_agreement_terms — that helper is ALSO the seven-facet room's
  -- writer, and the flag-off door must keep writing exactly what 00422 wrote.
  UPDATE public.proposal_service_terms t SET
    retainer_credit_rule = COALESCE((
      SELECT NULLIF(btrim(COALESCE(ap.payload->>'creditRule', '')), '')
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 'credited'),
    fee_basis = v_fee_basis,
    fee_amount_cents = v_fee_amount_cents,
    fee_schedule = v_fee_schedule,
    updated_at = now()
  WHERE t.proposal_id = p_proposal_id;

  PERFORM set_config('app.agreement_projection', COALESCE(v_previous_projection, ''), true);

  -- 00577 (P8): what moved, and the designer's one line about why. A no-op
  -- save writes nothing at all — the diff is empty — so a room that autosaves
  -- does not fill the history strip with silence.
  SELECT COALESCE(jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at' - 'proposal_id'
                            ORDER BY ap.position, ap.id), '[]'::jsonb)
  INTO v_after
  FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id;
  PERFORM public._log_agreement_part_events(p_proposal_id, v_before, v_after, p_why);

  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  -- The saved rows come back, in order, exactly as materialize_standard_parts
  -- returns them. The write is DELETE-then-INSERT and does not carry `id`
  -- through, so every part has a NEW uuid — a room that kept the array it
  -- sent would be holding ids the table no longer has, and the next save
  -- would look like a rename of nine parts. One round trip, one truth.
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentKind', CASE WHEN v_proposal.document_kind = 'legacy'
                         THEN 'design_services' ELSE v_proposal.document_kind END,
    'commercialState', 'draft',
    'partCount', jsonb_array_length(p_parts),
    'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id),
    'parts', COALESCE((
      SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id
    ), '[]'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.agreement_projection', COALESCE(v_previous_projection, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) resolve_time_rate_cents — head 00615:380, the enum leg above the label
--     leg in tier 1. Every assert, tier and anchor below is 00615's, verbatim.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_time_rate_cents(
  p_project_id uuid,
  p_user_id    uuid,
  p_at         timestamptz,
  p_rate_role  text DEFAULT NULL
)
RETURNS TABLE (cents integer, source text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id    uuid;
  v_studio_id      uuid;
  v_role           text;
  v_normalized     text;
  v_authority_id   uuid;
  v_version        integer;
  v_match_count    integer := 0;
  v_cents          integer;
BEGIN
  SELECT project.designer_id, project.studio_id
    INTO v_designer_id, v_studio_id
  FROM public.projects AS project
  WHERE project.id = p_project_id;

  -- ── HT-3-a / HT-3-c (RULED 2026-09-12) + HT-3-g(1) (RULED BY KODY 2026-09-12) ─
  -- THE STUDIO STEP IS ONE COLUMN READ AND NOTHING ELSE. It is projects.studio_id,
  -- read above; where that column is NULL this function falls through every tier
  -- below it and answers 'none' — HT-26's "rate pending" — for EVERYONE, the
  -- designer herself included. There is NO read-time derivation here, and under
  -- HT-3-g(1) there is none in any other body that prices an hour.
  --
  -- WHAT WAS HERE, and why it is gone. Rounds 4-11 of two review lanes each closed
  -- one input to a DERIVED studio and the next one opened, because a studio derived
  -- when the hour is priced is recomputed on EVERY hour: a seat she deletes under
  -- the shipped `Members can leave` policy (W2-R9-01, probe C), a seat an admin
  -- sets `status = 'removed'` (probe D2), a seat an outsider writes for her
  -- consent-free (W1-R11-01, W2-R3-01), a role she demotes by handing a workspace
  -- to a second account (W2-R5-01), a `joined_at` she backdates on the activation
  -- path (W1-R12-01), a rate row she rewrites in place (W2-R8-01), and finally the
  -- stamp arm the round-10 amendment left ungated (W2-R11-01, forms A and G). The
  -- answer is that the pricing studio is a COLUMN, stamped once by a party who is
  -- not the subject, and read afterwards.
  --
  -- HT-3-c arm (a) is untouched and is now the whole of step 1: a project whose
  -- designer NAMED its studio_id at creation prices from that studio even when she
  -- owns it — a sole proprietor billing her own studio's client rather than a
  -- member gaming her employer's books. (§0.13 still forbids this column as an RLS
  -- POLICY key: a legacy NULL must not move visibility. Pricing is not visibility,
  -- and a NULL here answers 'none', which is the safe direction.)
  --
  -- HT-3-b's tier rule still exists — as the ONE shared body defined at the top of
  -- this migration, used in exactly two places, NEITHER of which prices an hour:
  -- 00602's INSERT stamp and 00620's one-off legacy stamp at ship. (Its name is not
  -- written in this body on purpose: a postcondition below reads this source and
  -- forbids even a mention of it here, because a body that names the derivation is
  -- a body a later hand can be tempted to let call it.) The repair for a NULL
  -- column afterwards is a human act by an owner/admin of a studio that EMPLOYS the
  -- project's designer (00606's stamp_project_pricing_studio, HT-3-g(3)).

  -- ── ASSERT 1 (W1-R1-01): a relationship to THIS project ──────────────────
  -- Without it, a GRANTed DEFINER function hands any authenticated stranger the
  -- signed rate cards of any project id they can guess. The four legs are the
  -- actors the shipped project_time_entries write policies already admit
  -- (00484:1712-1760's team quartet, 00177:136-137's designer ALL policy,
  -- 00316:242-246's studio co-member insert), so no legitimate write path loses.
  -- p_project_id IS NULL resolves to nothing and leaks nothing, so it is not
  -- asserted against.
  IF auth.uid() IS NOT NULL AND p_project_id IS NOT NULL
     AND NOT (
       COALESCE(public.is_project_team_member(p_project_id), false)
       OR v_designer_id IS NOT DISTINCT FROM auth.uid()
       OR COALESCE(public.is_studio_comember(v_designer_id), false)
       OR COALESCE(public.is_org_admin_or_owner(v_studio_id), false)
     )
  THEN
    RAISE EXCEPTION 'resolve_time_rate_cents: no relationship to project %', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── ASSERT 2: you may resolve your own rate ──────────────────────────────
  -- Resolving someone ELSE's is the act of an owner/admin OF THE STUDIO THAT OWNS
  -- THE WORK — under HT-3-a v_studio_id is the project's studio, not a ladder
  -- winner — or, INSIDE THE CLASSIFIER ONLY, of the project's own designer, whose
  -- `Designers manage their project time entries` policy (00177:136-137, no user_id
  -- leg) lets her correct a teammate's entry and which an ungated assert would
  -- revoke in silence (W1-R1-05). W1-R7-05 named the old shape — "the assert asks
  -- about whichever studio the ladder picked, so a legitimate employing studio's
  -- owner is refused" — and the ruled derivation dissolves it: there is no longer a
  -- studio here that the project does not name.
  --
  -- W1-R2-03: the designer leg stays gated on pg_trigger_depth() > 0. Ungated it was
  -- a confidential-pay leak — a plain studio member who happens to be a project
  -- designer could read any colleague's studio rate by calling this with his user
  -- id, a number RLS gives her nothing of. W1-R7-04's REVOKE below means no
  -- authenticated caller can reach depth 0 today; the gate is kept so that a later
  -- wave re-GRANTing the function cannot reopen the leak by accident.
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT (v_designer_id IS NOT DISTINCT FROM auth.uid()
              AND pg_catalog.pg_trigger_depth() > 0)
     AND NOT COALESCE(public.is_org_admin_or_owner(v_studio_id), false)
  THEN
    RAISE EXCEPTION 'resolve_time_rate_cents: only a studio owner or admin may resolve another member''s rate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_role := NULLIF(btrim(COALESCE(p_rate_role, '')), '');

  -- ── ASSERT 3 (W1-R1-01): the role pick is validated AT THE RPC BOUNDARY ───
  -- Inside the classifier trigger (pg_trigger_depth() > 0) 00601 delta 1 owns
  -- this, and validates only a NEW pick on purpose: re-validating a role already
  -- recorded on a row freezes that row for ever the moment the owner removes the
  -- seat the role came from (W1-R1-03). A direct caller has no classifier in
  -- front of it, so the same EXISTS is applied here instead of trusting the
  -- argument.
  IF auth.uid() IS NOT NULL
     AND v_role IS NOT NULL
     AND pg_catalog.pg_trigger_depth() = 0
     AND NOT (
       (v_role = 'lead_designer' AND v_designer_id IS NOT DISTINCT FROM p_user_id)
       OR EXISTS (
         SELECT 1 FROM public.project_team_members AS member
         WHERE member.project_id = p_project_id
           AND member.user_id    = p_user_id
           AND member.removed_at IS NULL
           AND member.role       = v_role
       )
     )
  THEN
    RAISE EXCEPTION 'resolve_time_rate_cents: rate_role % is not a role this member holds on the project', v_role
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── W1-R5-03: the project's own designer is lead_designer, ABOVE her pick ──
  -- 00578:2708-2710 hard-coded 'lead_designer' for the project's own designer
  -- BEFORE any roster read, so her roster rows were never consulted for her.
  -- Taking p_rate_role first handed the one actor whose role the server used to fix
  -- a lever over her own client-billed rate: `Lead designers manage team members`
  -- is an ALL policy qualified on projects.designer_id = auth.uid() with no
  -- with_check of its own, so she seats HERSELF as 'vendor' through RLS, names it,
  -- and the signed Vendor card prices her hour in place of her own Lead designer
  -- card — rate_source still reading 'authority', so the row prints as a signed,
  -- client-agreed rate and claim_time_entries invoice-locks it. Measured on cards
  -- of 10000 (Lead designer) / 40000 (Vendor): 40000 with the pick, 10000 without.
  -- The pick is DISCARDED, not refused (§0.7's idiom) — ASSERT 3 above still
  -- refuses a role she does not hold at all. No capability is lost relative to the
  -- shipped 00578 baseline, which never consulted her roster.
  IF v_designer_id IS NOT NULL AND v_designer_id IS NOT DISTINCT FROM p_user_id THEN
    v_role := 'lead_designer';
  ELSIF v_role IS NULL THEN
    SELECT CASE WHEN count(DISTINCT member.role) = 1 THEN min(member.role) END
      INTO v_role
    FROM public.project_team_members AS member
    WHERE member.project_id = p_project_id
      AND member.user_id    = p_user_id
      AND member.removed_at IS NULL;
  END IF;

  -- ── Tier 1: the signed authority rate covering p_at ──────────────────────
  SELECT authority.id INTO v_authority_id
  FROM public.project_billing_authorities AS authority
  WHERE authority.project_id = p_project_id
    AND authority.effective_at <= p_at
    AND (authority.ended_at IS NULL OR authority.ended_at > p_at)
  ORDER BY authority.effective_at DESC, authority.id DESC
  LIMIT 1;

  IF v_authority_id IS NOT NULL THEN
    -- Same normalization 00578:2719-2722 uses, so the resolver and the
    -- classifier cannot disagree about which card a role matches.
    v_normalized := regexp_replace(
      replace(lower(btrim(COALESCE(v_role, ''))), '_', ' '), '\s+', ' ', 'g'
    );

    SELECT max(rate.version) INTO v_version
    FROM public.project_billing_authority_rates AS rate
    JOIN public.proposal_service_rates AS src ON src.id = rate.source_rate_id
    WHERE rate.billing_authority_id = v_authority_id
      AND src.effective_at <= p_at;

    -- ── 00618 delta (HT-4, RULED 2026-09-11): THE ENUM IS ASKED FIRST ──────
    -- A card that carries roster_role is bound to the roster role, and the
    -- label it prints for the client cannot move that binding. This is the
    -- whole of defect #2: the shipped default label "Principal designer" can
    -- never normalize-match 'lead_designer', so a default card stranded every
    -- entry on the project it priced. The legacy leg below is kept, not
    -- replaced — rows materialized before this migration carry roster_role
    -- NULL and must go on pricing exactly as they did.
    IF v_version IS NOT NULL AND v_role IS NOT NULL THEN
      SELECT count(*), min(rate.hourly_rate_cents)
        INTO v_match_count, v_cents
      FROM public.project_billing_authority_rates AS rate
      JOIN public.proposal_service_rates AS src ON src.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority_id
        AND rate.version = v_version
        AND src.effective_at <= p_at
        AND rate.roster_role = v_role;

      IF v_match_count = 1 THEN
        RETURN QUERY SELECT v_cents, 'authority'::text, v_role;
        RETURN;
      END IF;
    END IF;

    IF v_version IS NOT NULL AND v_normalized <> '' THEN
      SELECT count(*), min(rate.hourly_rate_cents)
        INTO v_match_count, v_cents
      FROM public.project_billing_authority_rates AS rate
      JOIN public.proposal_service_rates AS src ON src.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority_id
        AND rate.version = v_version
        AND src.effective_at <= p_at
        -- 00618: a bound card is answered by the enum leg above and must not be
        -- re-offered here under its printed label, or a studio that binds one
        -- card and labels another "Lead designer" gets two answers to the same
        -- question and the caller cannot tell which priced the hour.
        AND rate.roster_role IS NULL
        AND regexp_replace(
              replace(lower(btrim(rate.role_name)), '_', ' '), '\s+', ' ', 'g'
            ) = v_normalized;

      IF v_match_count = 1 THEN
        RETURN QUERY SELECT v_cents, 'authority'::text, v_role;
        RETURN;
      END IF;
    END IF;

    -- W1-R1-07: the classifier's own single-card fallback (00601:278-293) — when
    -- no role name matches (or no role is known) and the authority carries
    -- exactly ONE current card, that card prices the hour. Mirrored here, or the
    -- resolver reports 'studio_member' for an hour the classifier binds at the
    -- card rate and this file's own claim above is false.
    IF v_version IS NOT NULL THEN
      SELECT count(*), min(rate.hourly_rate_cents)
        INTO v_match_count, v_cents
      FROM public.project_billing_authority_rates AS rate
      JOIN public.proposal_service_rates AS src ON src.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority_id
        AND rate.version = v_version
        AND src.effective_at <= p_at;

      IF v_match_count = 1 THEN
        RETURN QUERY SELECT v_cents, 'authority'::text, v_role;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- ── Tier 2: the studio's per-member rate (00598) ─────────────────────────
  IF v_studio_id IS NOT NULL THEN
    SELECT rate.hourly_rate_cents INTO v_cents
    FROM public.studio_member_rates AS rate
    WHERE rate.studio_id = v_studio_id
      AND rate.user_id   = p_user_id
      -- W1-R1-11: the anchor is UTC, explicitly. `p_at::date` cast in the session
      -- time zone inside a DEFINER function, so an hour logged near midnight
      -- landed on a different day for a member in another zone.
      -- studio_member_rates.effective_from/_to are plain dates with no zone of
      -- their own, so UTC is the one anchor that does not move with the caller.
      AND rate.effective_from <= (p_at AT TIME ZONE 'UTC')::date
      AND (rate.effective_to IS NULL
           OR rate.effective_to >= (p_at AT TIME ZONE 'UTC')::date)
      -- ── HT-3-e(2), THE ONLY DELTA 00615 ADDS (RULED 2026-09-12) ───────────
      -- A row whose `created_by` IS its own `user_id` — the number she wrote for
      -- herself — prices an hour ONLY where that person is this studio's OWNER.
      -- Everywhere else it is IGNORED and the next qualifying row, one somebody
      -- else wrote, prices; where there is none the answer is tier 3's 'none'.
      -- This is a test of the ROW, not of the studio: it does not choose between
      -- candidate studios (the round-4 key HT-3-a deleted did that, and she could
      -- buy it with one signup), it does not care whose workspace this is (round
      -- 6 measured the same taking in an organization she has never owned), and
      -- it cannot be defeated by writing the number after the stamp (it is read
      -- when the hour is priced, not when the studio is named).
      -- `created_by` NULL is NOT self-authorship and prices: the only writer of
      -- NULL is `profiles ON DELETE SET NULL`, i.e. a deleted author, and a
      -- freeze guard (00598:290-293) already refuses any re-stamp that is not the
      -- actor's own id.
      AND (
        rate.created_by IS DISTINCT FROM rate.user_id
        OR EXISTS (
          SELECT 1
          FROM public.organization_members AS owner_seat
          WHERE owner_seat.organization_id = v_studio_id
            AND owner_seat.user_id = rate.user_id
            AND owner_seat.status = 'active'
            AND owner_seat.role = 'owner'
        )
      )
    ORDER BY rate.effective_from DESC
    LIMIT 1;

    IF v_cents IS NOT NULL THEN
      RETURN QUERY SELECT v_cents, 'studio_member'::text, v_role;
      RETURN;
    END IF;
  END IF;

  -- ── Tier 3: nothing. "Rate pending" (HT-26), never a blank. ──────────────
  RETURN QUERY SELECT NULL::integer, 'none'::text, v_role;
END;
$$;

-- Restated rather than inherited (00615's own note): CREATE OR REPLACE keeps a
-- function's ACL, so this is belt-and-braces on the one property five W1 rounds
-- of asserts existed to protect — the resolver is TRIGGER-PATH ONLY (W1-R7-04).
REVOKE EXECUTE ON FUNCTION public.resolve_time_rate_cents(uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.resolve_time_rate_cents(uuid, uuid, timestamptz, text) IS
  'HT-1: the ONE rate chain — signed authority rate → studio_member_rates → '
  'none. Returns (cents, source, role); source is one of authority / '
  'studio_member / none. HT-4 (RULED 2026-09-11, migration 00618): tier 1 asks '
  'project_billing_authority_rates.roster_role FIRST and the free-text label '
  'only for a card that carries no binding — the label "Principal designer" '
  'could never normalize-match ''lead_designer'', which is why a default '
  'two-role card stranded every entry it should have priced. A bound card is '
  'never re-offered under its label, so the two legs cannot both answer. Every '
  'other property of this body is 00615''s: HT-3-e(2)''s self-authored tier-2 '
  'row prices only for an owner; HT-3-g(1)''s studio step is projects.studio_id '
  'or ''none'' with NO read-time derivation; the legacy change-order leg stays '
  'cut and profiles.default_hourly_rate_cents is not a leg; the rate-boundary '
  'anchor is explicitly UTC; the three asserts (project relationship, own rate, '
  'role pick) stand.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) classify_project_time_entry_authority — head 00613:126, the same enum
--     leg, said about the row the entry BINDS to. See the banner: without it
--     the resolver's answer and the entry's authority_rate_id disagree.
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_current_version integer;
  v_project_designer_id uuid;
  v_team_role text;
  v_normalized_role text;
  v_role_match_count integer := 0;
  v_current_rate_count integer := 0;
  v_retainer_ready boolean := false;
  v_is_bound boolean := false;
  v_project_ceiling_cents bigint;
  -- 00601 delta
  v_rate_cents integer;
  v_rate_source text;
  v_rate_role text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.billing_authority_id IS NOT NULL AND (
    NEW.billing_authority_id IS DISTINCT FROM OLD.billing_authority_id
    OR NEW.authority_rate_id IS DISTINCT FROM OLD.authority_rate_id
    OR NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents
  ) THEN
    RAISE EXCEPTION 'time-entry authority and rate provenance are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Browser-supplied rate/authority ids are never selection authority. New
  -- rows and previously-unclassified rows are resolved exclusively from the
  -- signed project authority and server-owned team role below.
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.authority_rate_id IS NULL) THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
  END IF;

  -- ── 00613 delta: internal and admin time (HT-15) ──────────────────────────
  -- An hour with no project is never billed and never priced. It is placed above
  -- everything below that reads NEW.project_id; see this file's banner for the
  -- four reads and why each of them must not be reached with a NULL.
  IF NEW.project_id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id    := NULL;
    NEW.billing_state        := 'nonbillable';
    NEW.hourly_rate_cents    := NULL;
    NEW.rated_amount_cents   := 0;
    NEW.rate_source          := 'none';
    NEW.rate_role            := NULL;
    RETURN NEW;
  END IF;

  -- ── 00601 delta 1: HT-41's role pick is validated, never trusted ─────────
  -- W1-R1-03: only a NEW pick. The first revision validated on EVERY fire, so the
  -- moment the owner removed the roster seat a recorded role came from, every
  -- guarded edit to that entry raised — and rate_role itself cannot be changed
  -- (aab_ refuses it for any non-postgres caller), so the row was frozen with no
  -- escape but DELETE. HT-25-a's cross-role re-seat makes exactly that churn the
  -- expected case. Measured before the fix: a member's own duration correction
  -- raised 'rate_role vendor is not a role this member holds on the project' and
  -- the stored duration stayed 60.
  IF NEW.rate_role IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.rate_role IS DISTINCT FROM OLD.rate_role) THEN
    IF NOT (
      (
        NEW.rate_role = 'lead_designer'
        AND EXISTS (
          SELECT 1 FROM public.projects project
          WHERE project.id = NEW.project_id
            AND project.designer_id IS NOT DISTINCT FROM NEW.user_id
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.project_team_members member
        WHERE member.project_id = NEW.project_id
          AND member.user_id = NEW.user_id
          AND member.removed_at IS NULL
          AND member.role = NEW.rate_role
      )
    ) THEN
      RAISE EXCEPTION 'rate_role % is not a role this member holds on the project', NEW.rate_role
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── 00601 delta 1a (W1-R9-01): the hour belongs to the person who worked it ──
  -- Writing somebody else's user_id onto a priced row is the act of an owner or
  -- admin OF THE STUDIO THAT OWNS THE WORK — the same authority ASSERT 2 of the
  -- resolver names. Anyone else may only write their own. Both statements that can
  -- introduce another person's user_id are covered; a correction to a teammate's
  -- existing row (user_id unchanged) is not one of them, so W1-R1-05 stands. See
  -- the round-9 section of the banner for the measurement and for why the gate is
  -- auth.uid() rather than current_user.
  IF auth.uid() IS NOT NULL
     AND NEW.user_id IS DISTINCT FROM auth.uid()
     AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id)
     AND NOT COALESCE(public.is_org_admin_or_owner(
           (SELECT project.studio_id FROM public.projects AS project
             WHERE project.id = NEW.project_id)), false)
  THEN
    RAISE EXCEPTION 'a time entry is logged by the person who worked the hour'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── 00601 delta 2: the ONE rate chain, resolved once ────────────────────
  SELECT resolved.cents, resolved.source, resolved.role
    INTO v_rate_cents, v_rate_source, v_rate_role
  FROM public.resolve_time_rate_cents(
    NEW.project_id, NEW.user_id, NEW.started_at, NEW.rate_role
  ) AS resolved;

  -- delta 4: the row records the role that priced it.
  -- W1-R5-03: the resolver's answer, not the caller's pick, because those are the
  -- same value EXCEPT where the server owns the role — the project's own designer,
  -- whose 'lead_designer' is fixed above p_rate_role in 00599. Keeping the old
  -- `NEW.rate_role IS NULL` guard would have left her row printing the 'vendor' she
  -- asked for while the Lead designer card priced it: a row that lies about the
  -- number on it. For every other member v_rate_role IS her validated pick.
  IF v_rate_role IN ('lead_designer', 'support_designer', 'bookkeeper', 'vendor') THEN
    NEW.rate_role := v_rate_role;
  END IF;

  -- delta 5: P-4 preservation. An existing snapshot is not destroyed because the
  -- chain has no answer — and W1-R2-05: the provenance stays with the snapshot it
  -- describes. Forcing NULL here relabelled a W1-era row as pre-00600 legacy the
  -- moment HT-13's backdating moved it outside its rate's span.
  -- W1-R3-02: the preservation also fires when the chain HAS an answer but the row
  -- is PRE-00600 (rate_source NULL). Gated on 'none' alone, P-4 was honoured
  -- exactly where it cost nothing and dropped where it moved money: a legacy
  -- unbilled row carrying its own $175.00 snapshot, whose author holds a $150.00
  -- studio rate, was silently re-priced to 15000 by the only edit
  -- useUpdateTimeEntry offers (a duration correction) — and stopped being
  -- identifiable as legacy. A billable off/on round trip did the same through the
  -- non-billable branch below.
  IF TG_OP = 'UPDATE'
     AND OLD.hourly_rate_cents IS NOT NULL
     AND (v_rate_source = 'none' OR OLD.rate_source IS NULL)
  THEN
    v_rate_cents  := OLD.hourly_rate_cents;
    v_rate_source := OLD.rate_source;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build')
  ) INTO v_is_services_project;

  IF NOT NEW.billable THEN
    NEW.billing_state := 'nonbillable';
    -- W1-R1-02: a BOUND row's signed rate is never overwritten here. The first
    -- revision stamped the resolver's answer on this branch before the bound-row
    -- handling below could keep OLD.hourly_rate_cents, and `billable` is not in
    -- aab_'s watched list so nothing could catch it. Measured: a $300/h hour bound
    -- to a one-card authority came back from a plain billable off/on round trip
    -- priced at the $150/h studio rate with rate_source still claiming
    -- 'authority' — and claim_time_entries would then invoice-lock that number.
    -- 00578 never touched hourly_rate_cents on this branch at all.
    IF TG_OP = 'INSERT' OR OLD.billing_authority_id IS NULL THEN
      NEW.hourly_rate_cents := v_rate_cents;   -- 00601: discarded, not kept
      NEW.rate_source := v_rate_source;
    ELSE
      NEW.hourly_rate_cents := OLD.hourly_rate_cents;
      NEW.rate_source := OLD.rate_source;
    END IF;
    NEW.rated_amount_cents := CASE WHEN NEW.duration_minutes IS NULL THEN NULL ELSE 0 END;
    RETURN NEW;
  END IF;
  IF NOT v_is_services_project THEN
    NEW.billing_state := 'authorized';
    -- HT-1's headline branch: 00578:2650-2652 priced the hour from whatever the
    -- browser sent. The resolver owns it now, on this project kind too.
    NEW.hourly_rate_cents := v_rate_cents;
    NEW.rate_source := v_rate_source;
    NEW.rated_amount_cents := CASE
      WHEN NEW.duration_minutes IS NOT NULL AND v_rate_cents IS NOT NULL
      THEN round(NEW.duration_minutes / 60.0 * v_rate_cents)::integer
    END;
    RETURN NEW;
  END IF;

  -- Every commercial classifier takes the same stable project lock used by an
  -- addendum countersign. It serializes project-wide accrued-ceiling reads even
  -- when the entry binds a superseded authority while another entry binds the
  -- active replacement authority.
  SELECT project.designer_id INTO v_project_designer_id
  FROM public.projects project
  WHERE project.id = NEW.project_id
  FOR UPDATE;

  SELECT authority.billing_ceiling_cents INTO v_project_ceiling_cents
  FROM public.project_billing_authorities authority
  WHERE authority.project_id = NEW.project_id AND authority.status = 'active'
  ORDER BY authority.effective_at DESC, authority.id DESC
  LIMIT 1;

  IF TG_OP = 'UPDATE' AND OLD.billing_authority_id IS NOT NULL THEN
    v_is_bound := true;
    SELECT * INTO v_authority FROM public.project_billing_authorities
    WHERE id = OLD.billing_authority_id AND project_id = NEW.project_id
    FOR UPDATE;
    SELECT * INTO v_rate FROM public.project_billing_authority_rates
    WHERE id = OLD.authority_rate_id
      AND billing_authority_id = OLD.billing_authority_id;
    IF v_authority.id IS NULL OR v_rate.id IS NULL THEN
      RAISE EXCEPTION 'bound commercial time entry has invalid authority provenance'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.billing_authority_id := OLD.billing_authority_id;
    NEW.authority_rate_id := OLD.authority_rate_id;
    NEW.hourly_rate_cents := OLD.hourly_rate_cents;
  ELSE
    SELECT * INTO v_authority FROM public.project_billing_authorities
    WHERE project_id = NEW.project_id
      AND effective_at <= NEW.started_at
      AND (ended_at IS NULL OR ended_at > NEW.started_at)
    ORDER BY effective_at DESC, id DESC LIMIT 1
    FOR UPDATE;
  END IF;
  IF v_authority.id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
    NEW.billing_state := 'pending_authorization';
    -- 00601: server-owned here too (00578 left the caller's rate standing and
    -- nulled only the amount).
    NEW.hourly_rate_cents := v_rate_cents;
    NEW.rate_source := v_rate_source;
    NEW.rated_amount_cents := CASE
      WHEN NEW.duration_minutes IS NOT NULL AND v_rate_cents IS NOT NULL
      THEN round(NEW.duration_minutes / 60.0 * v_rate_cents)::integer
    END;
    RETURN NEW;
  END IF;

  IF NOT v_is_bound THEN
    SELECT max(rate.version) INTO v_current_version
    FROM public.project_billing_authority_rates rate
    JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
    WHERE rate.billing_authority_id = v_authority.id
      AND source.effective_at <= NEW.started_at;

    -- 00601 (HT-41): the member's validated pick decides which card prices the
    -- hour when she holds more than one role. With no pick, 00578's
    -- count(DISTINCT role) = 1 collapse is unchanged.
    --
    -- W1-R5-03: the project's own DESIGNER is not one of those members. 00578's
    -- branch fixed her role at 'lead_designer' before any roster read; putting the
    -- pick above it let her seat herself as 'vendor' (`Lead designers manage team
    -- members` is an ALL policy on projects.designer_id = auth.uid()) and bill the
    -- client at whichever signed card pays best — measured 40000 where her own card
    -- said 10000, rate_source still 'authority'. The designer branch therefore
    -- regains precedence; nothing is lost against 00578, which never read her
    -- roster at all.
    IF v_project_designer_id IS NOT DISTINCT FROM NEW.user_id THEN
      v_team_role := 'lead_designer';
    ELSIF NEW.rate_role IS NOT NULL THEN
      v_team_role := NEW.rate_role;
    ELSE
      SELECT CASE WHEN count(DISTINCT member.role) = 1 THEN min(member.role) END
      INTO v_team_role
      FROM public.project_team_members member
      WHERE member.project_id = NEW.project_id
        AND member.user_id = NEW.user_id
        AND member.removed_at IS NULL;
    END IF;
    v_normalized_role := regexp_replace(
      replace(lower(btrim(COALESCE(v_team_role, ''))), '_', ' '),
      '\s+', ' ', 'g'
    );

    -- ── 00618 delta (HT-4): THE CLASSIFIER ASKS THE ENUM FIRST TOO ─────────
    -- This pick and resolve_time_rate_cents' tier 1 answer the same question
    -- about the same card, and they must not be allowed to disagree: the
    -- resolver hands the cents and the provenance, this pick hands the
    -- authority_rate_id the row is bound to and the rate actually stored. A
    -- roster_role leg in only one of the two would price at card A and bind to
    -- card B — or, the shape that shipped, resolve 'authority' here and still
    -- land pending_authorization with a NULL authority_rate_id, which is
    -- defect #2 arriving under a new name. The legs below are 00613's, kept
    -- whole for cards materialized before this migration.
    IF v_current_version IS NOT NULL AND v_team_role IS NOT NULL THEN
      SELECT count(*) INTO v_role_match_count
      FROM public.project_billing_authority_rates rate
      JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority.id
        AND rate.version = v_current_version
        AND source.effective_at <= NEW.started_at
        AND rate.roster_role = v_team_role;
      IF v_role_match_count = 1 THEN
        SELECT rate.* INTO v_rate
        FROM public.project_billing_authority_rates rate
        JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
        WHERE rate.billing_authority_id = v_authority.id
          AND rate.version = v_current_version
          AND source.effective_at <= NEW.started_at
          AND rate.roster_role = v_team_role;
      END IF;
    END IF;

    IF v_rate.id IS NULL
       AND v_current_version IS NOT NULL AND v_normalized_role <> '' THEN
      SELECT count(*) INTO v_role_match_count
      FROM public.project_billing_authority_rates rate
      JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority.id
        AND rate.version = v_current_version
        AND source.effective_at <= NEW.started_at
        AND rate.roster_role IS NULL
        AND regexp_replace(
          replace(lower(btrim(rate.role_name)), '_', ' '), '\s+', ' ', 'g'
        ) = v_normalized_role;
      IF v_role_match_count = 1 THEN
        SELECT rate.* INTO v_rate
        FROM public.project_billing_authority_rates rate
        JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
        WHERE rate.billing_authority_id = v_authority.id
          AND rate.version = v_current_version
          AND source.effective_at <= NEW.started_at
          AND rate.roster_role IS NULL
          AND regexp_replace(
            replace(lower(btrim(rate.role_name)), '_', ' '), '\s+', ' ', 'g'
          ) = v_normalized_role;
      END IF;
    END IF;

    IF v_rate.id IS NULL AND v_current_version IS NOT NULL THEN
      SELECT count(*) INTO v_current_rate_count
      FROM public.project_billing_authority_rates rate
      JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority.id
        AND rate.version = v_current_version
        AND source.effective_at <= NEW.started_at;
      IF v_current_rate_count = 1 THEN
        SELECT rate.* INTO v_rate
        FROM public.project_billing_authority_rates rate
        JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
        WHERE rate.billing_authority_id = v_authority.id
          AND rate.version = v_current_version
          AND source.effective_at <= NEW.started_at;
      END IF;
    END IF;
  END IF;

  IF v_rate.id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
    NEW.billing_state := 'pending_authorization';
    -- 00601: 00578 nulled rate AND amount here, which stranded the row for ever
    -- (00577:2493-2496 promotes only rows carrying both). The studio rate stands
    -- in until an addendum names a card for this role.
    NEW.hourly_rate_cents := v_rate_cents;
    NEW.rate_source := v_rate_source;
    NEW.rated_amount_cents := CASE
      WHEN NEW.duration_minutes IS NOT NULL AND v_rate_cents IS NOT NULL
      THEN round(NEW.duration_minutes / 60.0 * v_rate_cents)::integer
    END;
    RETURN NEW;
  END IF;
  IF NOT v_is_bound THEN
    NEW.billing_authority_id := v_authority.id;
    NEW.authority_rate_id := v_rate.id;
    NEW.hourly_rate_cents := v_rate.hourly_rate_cents;
  END IF;
  -- 00601: reached only with a signed authority rate in hand, bound or selected.
  NEW.rate_source := 'authority';

  v_retainer_ready := v_authority.retainer_activation_policy = 'immediate'
    OR v_authority.retainer_amount_cents = 0
    OR EXISTS (
      SELECT 1 FROM public.invoices invoice
      WHERE invoice.id = v_authority.retainer_invoice_id
        AND invoice.status = 'paid'
        AND invoice.amount_paid_cents >= invoice.total_cents
    );

  IF NEW.duration_minutes IS NULL THEN
    NEW.rated_amount_cents := NULL;
    NEW.billing_state := CASE WHEN v_retainer_ready
      THEN 'authorized' ELSE 'pending_authorization' END;
    RETURN NEW;
  END IF;
  NEW.rated_amount_cents := round(
    NEW.duration_minutes / 60.0 * CASE WHEN v_is_bound
      THEN OLD.hourly_rate_cents ELSE v_rate.hourly_rate_cents END
  )::integer;
  IF NOT v_retainer_ready THEN
    NEW.billing_state := 'pending_authorization';
    RETURN NEW;
  END IF;
  SELECT COALESCE(sum(t.rated_amount_cents), 0) INTO v_prior_cents
  FROM public.project_time_entries t
  WHERE t.project_id = NEW.project_id
    AND t.billing_state = 'authorized'
    AND t.billable AND t.duration_minutes IS NOT NULL
    AND t.id IS DISTINCT FROM NEW.id;
  -- 00575 (F-2): the ONE delta from 00412:2607-2613. billing_ceiling_cents is
  -- nullable now and NULL means uncapped, so the comparison has to answer
  -- "authorized" instead of evaluating to NULL and falling to the ELSE.
  IF COALESCE(v_project_ceiling_cents, v_authority.billing_ceiling_cents) IS NULL
     OR v_prior_cents + NEW.rated_amount_cents
        <= COALESCE(v_project_ceiling_cents, v_authority.billing_ceiling_cents) THEN
    NEW.billing_state := 'authorized';
  ELSE
    NEW.billing_state := 'pending_authorization';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.classify_project_time_entry_authority()
  FROM PUBLIC, anon, authenticated, service_role;

-- ── postconditions ─────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_resolver   text := pg_get_functiondef(
    'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)'::regprocedure);
  v_classifier text := pg_get_functiondef(
    'public.classify_project_time_entry_authority()'::regprocedure);
  v_terms      text := pg_get_functiondef(
    'public._project_agreement_terms(uuid,jsonb,jsonb,boolean)'::regprocedure);
  v_upsert     text := pg_get_functiondef(
    'public.upsert_agreement_parts(uuid,jsonb,text)'::regprocedure);
  v_aac        text;
BEGIN
  -- ── (a) the column exists on both halves, bounded to the four values ──────
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'proposal_service_rates'
      AND column_name = 'roster_role'),
    '00618: proposal_service_rates.roster_role is the binding the picker writes';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_billing_authority_rates'
      AND column_name = 'roster_role'),
    '00618: project_billing_authority_rates.roster_role is the binding the '
    'resolver reads after countersign (carried by 00619)';
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proposal_service_rates_roster_role_ck'),
    '00618: the four-value CHECK is the enum — without it roster_role is free '
    'text again, which is the thing HT-4 deletes';
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_billing_authority_rates_roster_role_ck'),
    '00618: and the same CHECK on the snapshot';
  -- 'client' is a project_team_members.role value (00084:164-165) and is NOT a
  -- billable roster role. A CHECK that admitted it would let a signed rate card
  -- price the homeowner's own hours.
  BEGIN
    INSERT INTO public.proposal_service_rates
      (proposal_id, version, role_name, hourly_rate_cents, roster_role)
    VALUES (extensions.gen_random_uuid(), 1, 'probe', 0, 'client');
    ASSERT false, '00618: roster_role = ''client'' must be refused by the CHECK';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN foreign_key_violation THEN
      ASSERT false, '00618: the roster_role CHECK must be evaluated before the '
                    'proposal FK — got a FK error, so ''client'' was admitted';
  END;

  -- ── (b) nothing signed was rewritten ──────────────────────────────────────
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_billing_authority_rates
    WHERE roster_role IS NOT NULL),
    '00618: the normalisation must not touch project_billing_authority_rates — '
    'those rows are the immutable snapshot of a signed contract '
    '(guard_billing_authority_rates_immutable), and the legacy label leg prices '
    'them unchanged. 00619 stamps only rows countersigned from here on';

  -- ── (c) the enum leg is present in BOTH bodies, above the label leg ───────
  ASSERT v_resolver ~ 'rate\.roster_role = v_role',
    '00618: the resolver''s tier 1 must ask roster_role (HT-4)';
  ASSERT position('rate.roster_role = v_role' in v_resolver)
       < position('= v_normalized' in v_resolver),
    '00618: and must ask it ABOVE the label leg, or a bound card is priced by '
    'the label it happens to print';
  ASSERT v_resolver ~ 'AND rate\.roster_role IS NULL',
    '00618: the resolver''s label leg must exclude bound cards, or a studio that '
    'binds one card and labels another "Lead designer" gets two answers to one '
    'question and no caller can tell which priced the hour';
  ASSERT v_classifier ~ 'rate\.roster_role = v_team_role',
    '00618: the classifier''s authority-rate PICK must ask roster_role too — '
    'the resolver hands cents, this hands the authority_rate_id the row binds '
    'to. In only one of the two, HT-4 resolves ''authority'' and still lands '
    'pending_authorization with a NULL authority_rate_id, which is defect #2';
  ASSERT position('rate.roster_role = v_team_role' in v_classifier)
       < position('= v_normalized_role' in v_classifier),
    '00618: and above its own label leg, for the same reason';
  ASSERT v_classifier ~ 'AND rate\.roster_role IS NULL',
    '00618: and its label leg must exclude bound cards, so the two bodies agree '
    'card for card';

  -- ── (d) the binding reaches the row the picker writes ────────────────────
  ASSERT v_terms ~ 'rosterRole',
    '00618: _project_agreement_terms must carry rosterRole into '
    'proposal_service_rates, or the picker''s choice dies at the projection';
  ASSERT v_upsert ~ 'rosterRole',
    '00618: upsert_agreement_parts must carry rosterRole out of the part payload';
  ASSERT v_upsert ~ 'is not a role the studio roster carries',
    '00618: and must refuse a value outside the four at the door, so the room '
    'hears a sentence instead of a 23514 from two functions down';
  ASSERT v_upsert ~ 'the rate card prices % twice',
    '00618: and must refuse the same roster role twice on one card — two bound '
    'cards for one role is count(*) = 2 in both legs above, which is the '
    'stranding HT-4 exists to close arriving by a second door';

  -- ── (e) 00615's properties, re-asserted on the grafted resolver ──────────
  --     A graft from a stale body is the failure mode this lineage exists to
  --     prevent; 00615's own postconditions ran three migrations ago.
  ASSERT (SELECT prosecdef FROM pg_proc
           WHERE oid = to_regprocedure('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)')),
    '00618: resolve_time_rate_cents must stay SECURITY DEFINER';
  ASSERT (SELECT proconfig::text LIKE '%search_path%' FROM pg_proc
           WHERE oid = to_regprocedure('public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)')),
    '00618: and must keep its pinned search_path (§0.16)';
  ASSERT NOT has_function_privilege('anon',
    'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)', 'EXECUTE'),
    '00618: anon must not hold EXECUTE on the resolver';
  ASSERT NOT has_function_privilege('authenticated',
    'public.resolve_time_rate_cents(uuid,uuid,timestamptz,text)', 'EXECUTE'),
    '00618: authenticated must not hold EXECUTE either — the resolver is '
    'trigger-path only (W1-R7-04)';
  ASSERT v_resolver ~ 'rate\.created_by IS DISTINCT FROM rate\.user_id'
     AND v_resolver ~ 'owner_seat\.role = ''owner'''
     AND v_resolver ~ 'owner_seat\.organization_id = v_studio_id'
     AND v_resolver ~ 'owner_seat\.status = ''active''',
    '00618: HT-3-e(2) survives the graft — a self-authored studio rate prices '
    'only where its subject is an ACTIVE OWNER of the studio that prices the hour';
  ASSERT (SELECT count(*) FROM regexp_matches(v_resolver, 'public\.studio_member_rates', 'g')) = 1,
    '00618: studio_member_rates is still read EXACTLY once (W1-R10-02)';
  ASSERT (SELECT count(*) FROM regexp_matches(v_resolver, 'public\.organization_members', 'g')) = 1,
    '00618: HT-3-g(1) — organization_members is read EXACTLY once, and that '
    'read is HT-3-e(2)''s owner-seat question about the subject being priced. A '
    'second read is a studio-CHOICE question, the read-time derivation HT-3-g(1) '
    'deletes';
  ASSERT v_resolver !~ 'designer_seat'
     AND v_resolver !~ 'v_employer_studios'
     AND v_resolver !~ 'v_owned_studios'
     AND v_resolver !~ 'designer_tier_pricing_studio'
     AND v_resolver !~ 'role <> ''owner'''
     AND v_resolver !~ 'project\.created_by',
    '00618: HT-3-g(1) — the resolver still derives no pricing studio at all';
  ASSERT v_resolver !~ 'change_order_terms',
    '00618: the legacy change-order rate leg stays CUT (HT-1)';
  ASSERT v_resolver !~ 'default_hourly_rate_cents',
    '00618: profiles.default_hourly_rate_cents is still not a leg (HT-2 unruled)';
  ASSERT v_resolver ~ 'no relationship to project',
    '00618: the project-relationship assert survives the graft (W1-R1-01)';
  ASSERT v_resolver ~ 'pg_trigger_depth\(\) > 0',
    '00618: the designer-on-behalf leg stays gated on trigger depth (W1-R2-03)';
  ASSERT v_resolver ~ 'AT TIME ZONE ''UTC''',
    '00618: the rate-boundary date anchor stays explicitly UTC (W1-R1-11)';
  ASSERT v_resolver ~ 'project\.studio_id',
    '00618: HT-3-a step 1 — the project''s own column is the whole studio step';
  ASSERT (SELECT count(*) FROM regexp_matches(v_resolver, 'ORDER BY', 'g')) = 2,
    '00618: still exactly two ORDER BY clauses — tier 1''s authority pick and '
    'tier 2''s rate span. HT-4 adds a WHERE leg, not an ordering';
  ASSERT v_resolver ~ '''none''::text',
    '00618: tier 3 still answers ''none'' (HT-26, "rate pending", never a blank)';

  -- ── (f) 00613's properties, re-asserted on the grafted classifier ────────
  ASSERT v_classifier ~ 'IF NEW\.project_id IS NULL THEN',
    '00618: the internal-time short-circuit survives the graft (HT-15)';
  ASSERT position('IF NEW.project_id IS NULL THEN' in v_classifier)
       < position('project_commercial_documents' in v_classifier),
    '00618: and still sits above the project_commercial_documents lookup';
  ASSERT position('IF NEW.project_id IS NULL THEN' in v_classifier)
       < position('resolve_time_rate_cents' in v_classifier),
    '00618: and above the resolver call';
  ASSERT v_classifier ~ 'resolve_time_rate_cents',
    '00618: the classifier must still call resolve_time_rate_cents (HT-1)';
  ASSERT v_classifier ~ 'time-entry authority and rate provenance are immutable',
    '00618: 00578''s authority/rate immutability raise was lost';
  ASSERT v_classifier ~ 'bound commercial time entry has invalid authority provenance',
    '00618: 00578''s bound-provenance raise was lost';
  ASSERT v_classifier ~ 'FROM public\.projects project\s+WHERE project.id = NEW.project_id\s+FOR UPDATE',
    '00618: the stable project-row FOR UPDATE lock was lost';
  ASSERT v_classifier ~ 'COALESCE\(v_project_ceiling_cents, v_authority.billing_ceiling_cents\) IS NULL',
    '00618: 00575''s nullable-ceiling (F-2) delta was lost';
  ASSERT v_classifier ~ 'NEW\.hourly_rate_cents := OLD\.hourly_rate_cents',
    '00618: the non-billable branch must preserve a bound row''s signed rate (W1-R1-02)';
  ASSERT v_classifier ~ 'NEW\.rate_role IS DISTINCT FROM OLD\.rate_role',
    '00618: rate_role must be validated only on a NEW pick (W1-R1-03)';
  ASSERT v_classifier ~ 'v_rate_source := OLD\.rate_source'
     AND v_classifier ~ 'OLD\.rate_source IS NULL',
    '00618: delta 5 must preserve a pre-00600 snapshot (P-4, W1-R2-05, W1-R3-02)';
  ASSERT v_classifier ~ 'IF v_project_designer_id IS NOT DISTINCT FROM NEW\.user_id THEN\s+v_team_role := ''lead_designer'';\s+ELSIF NEW\.rate_role IS NOT NULL THEN',
    '00618: the project designer''s lead_designer role must stay fixed ABOVE '
    'NEW.rate_role in the role ladder (W1-R5-03)';
  ASSERT v_classifier ~ 'a time entry is logged by the person who worked the hour'
     AND v_classifier ~ 'TG_OP = ''INSERT'' OR NEW\.user_id IS DISTINCT FROM OLD\.user_id',
    '00618: W1-R9-01''s non-self user_id refusal was lost';
  ASSERT NOT has_function_privilege('authenticated',
    'public.classify_project_time_entry_authority()', 'EXECUTE'),
    '00618: the classifier stays revoked from authenticated (00412:2385-2386)';

  -- the aac_ trigger is not re-created here; CREATE OR REPLACE FUNCTION leaves
  -- it attached. Asserted because a dropped trigger is a silently unclassified
  -- table (§0.8).
  SELECT pg_get_triggerdef(oid) INTO v_aac FROM pg_trigger
   WHERE tgrelid = 'public.project_time_entries'::regclass
     AND tgname = 'aac_classify_project_time_entry_authority_trg';
  ASSERT v_aac IS NOT NULL, '00618: the classifier trigger is missing';
  ASSERT v_aac ~ 'studio_id' AND v_aac ~ 'rate_role' AND v_aac ~ 'project_id'
     AND v_aac ~ 'user_id' AND v_aac ~ 'started_at' AND v_aac ~ 'duration_minutes'
     AND v_aac ~ 'billable' AND v_aac ~ 'billing_authority_id'
     AND v_aac ~ 'authority_rate_id' AND v_aac ~ 'hourly_rate_cents',
    '00618: the aac_ watched-column list drifted; got ' || v_aac;

  -- ── (g) HT-35's preference, and its direction ────────────────────────────
  ASSERT (SELECT is_nullable = 'NO' AND column_default = 'false'
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'profiles'
            AND column_name = 'time_autostart_opt_out'),
    '00618: HT-35''s opt-out is DEFAULT ON — the column is the opt-OUT, so its '
    'default must be false. A default of true would silently stop the automatic '
    'timer for every member in the studio';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'time_autostart_disclosed_at'),
    '00618: HT-35''s disclosure stamp must exist, per member, or the band is a '
    'per-device sentence that a second browser serves again';
  -- The preference is the member's own and reaches nobody else's row: the only
  -- self-update door on profiles is 00021's "Users can update own profile",
  -- qualified auth.uid() = id. Asserted so a later wave cannot widen it here by
  -- accident.
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND cmd = 'UPDATE'
      AND policyname = 'Users can update own profile'),
    '00618: HT-35''s opt-out is written through "Users can update own profile" '
    'and no new policy — that policy must still exist';

  RAISE NOTICE '00618 postconditions passed.';
END
$postcondition$;
