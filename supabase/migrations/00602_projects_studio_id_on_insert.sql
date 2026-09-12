-- ═══════════════════════════════════════════════════════════════════════════
-- 00602 — projects.studio_id is stamped at INSERT, so HT-3-a's step 1 is the
--         normal path and not the exception
--
-- HT-3-a (RULED by Kody, 2026-09-12): the studio that prices an hour is derived
-- FROM THE PROJECT ONLY — (1) projects.studio_id when not NULL, (2) else HT-3-b's
-- two tiers over the project DESIGNER's own seats, (3) else 'none'. The ruling's
-- second half is this file: stamp the column at creation so (1) is what 00599
-- actually reads.
--
-- HT-3-b (RULED 2026-09-12, review round 11) is step 2, here and in 00599, and the
-- two bodies must stay identical in rule:
--   · the EMPLOYER tier — the studios where the project's DESIGNER holds an ACTIVE,
--     NON-GUEST organization_members row with `role <> 'owner'`. EXACTLY ONE → it is
--     stamped.
--   · only if she holds no employer seat at all — the OWNED tier, `role = 'owner'`.
--     EXACTLY ONE → it is stamped.
--   · any tier with more than one candidate → the column is LEFT NULL, and 00599's
--     step 3 says 'none' until somebody names the studio on the project.
-- No rate-existence, seat-date, org-age, member-count or created_by key survives in
-- either body, and neither carries an ORDER BY: HT-3-b is a count, not a contest
-- (W1-R10-02 dissolves with the deleted preference rather than being repaired).
--
-- The FUNCTION NAME still says `_owned`, and that is now only its second tier. It is
-- deliberately NOT renamed: the name is carried by the generated ACL seed
-- (supabase/seed/00-legacy-grants.sql) and the trigger's own name is load-bearing for
-- its firing ORDER (see below), so a rename would churn both for a word.
--
-- Lineage: NEW function and NEW trigger. Nothing is redefined — in particular
-- `activate_proposal_as_project` (head 00579) and `set_project_studio_id`
-- (00317 → 00511 → 00563) are NOT touched. Re-deriving either from a stale body
-- is the failure mode `patina-db-migrations` step 2 exists for, and 00563's body
-- is 250 lines of signing-ceremony authorization this program has no business
-- carrying.
--
-- P-4: no existing row is touched. There is no backfill (the trigger is BEFORE
-- INSERT only, and a postcondition below refuses an UPDATE event on it).
--
-- ── WHERE THIS BITES, measured on the isolated stack, stated plainly ────────
-- `set_project_studio_id` (head 00563) already resolves studio_id on every LIVE
-- creation path, and raises `studio_id_not_designer_studio` rather than leaving
-- the column NULL: its discovery fills the column when the designer has exactly
-- one candidate studio, the activation bridge resolves the ambiguous case, and
-- the check at 00563:352-362 refuses the insert outright if studio_id is still
-- NULL. The one path it lets through NULL is its own migration/seed bypass
-- (`session_user = 'postgres'` with no active role), which is why the NULL rows
-- on a seeded stack are seed rows and legacy rows rather than rows the product
-- writes today. The premise carried in plan-v2 and in 00599's earlier banners —
-- "activate_proposal_as_project never sets projects.studio_id, so the fallback is
-- the live path" — is therefore STALE for any project created since 00563.
--
-- So this trigger is named to fire AFTER `set_project_studio_id`, not before
-- (triggers on one event fire in tgname order; a postcondition below compares the
-- two names read from pg_trigger rather than as literals). Two reasons, one of
-- them measured:
--   · Firing FIRST would stamp a value before 00563 judged the write, and
--     `supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql` section 5a
--     asserts that a direct authenticated INSERT by a designer who holds two
--     candidate studios still RAISES. Measured this round: with this trigger
--     ordered first that test fails (the insert succeeds) — a shipped contract
--     broken to make a NULL less likely. Ordered last, every existing raise is
--     reached first and that test stays green.
--   · The anti-aiming guard is not bypassed by the ordering. 00317:31-47 (head
--     00563) exists to stop a CALLER aiming studio_id at a foreign org; this
--     trigger takes no caller input at all. The only value it can write is one
--     whose own WHERE clause requires the project's designer to hold an ACTIVE,
--     NON-GUEST seat in an ACTIVE design_studio — strictly inside the set the guard
--     admits — so the invariant the guard protects holds by construction rather
--     than by inspection.
--
-- ── HT-3-c (RULED by the orchestrator 2026-09-12, arm (a) — flagged to Kody) ──
-- The sentence this banner used to carry — that the guard's refusal "is what makes
-- the column trustworthy as a pricing key" — is RETRACTED, not edited (W1-R10-01,
-- measured 1/1 with two controls in review round 10). What the guard does is BOUND
-- the column to the studios the project's lead designer actively belongs to; it does
-- not choose among them, and its authenticated-INSERT arm asks only for
-- `membership.role <> 'guest'`. So a plain-member designer CAN create a project that
-- names the workspace she owns, and that project prices from that workspace — which
-- HT-3-c arm (a) rules acceptable: a sole proprietor billing her own studio's client,
-- not a member gaming her employer's books. Step 1 stands as written, this trigger
-- never fires on such a row (NEW.studio_id is already set), and W2's composer plus
-- the studio settings page are where a suspicious studio_member_rates row is seen.
-- The pin is case (ac) of supabase/tests/billing/time_rate_resolution_test.sql.
--
-- ── W1-R8-01 IS CLOSED BY HT-3-b, and what the close costs ──────────────────
-- Until round 11 the candidate set here was OWNERSHIP only, so a project led by a
-- designer who is an `admin` or `member` of the studio she works for — and who owns
-- the one-person workspace 00295 provisioned at her own designer grant — was stamped
-- with THAT WORKSPACE. Measured in review round 8 and again in its fix pass: her own
-- hour then priced at the number she set about herself (99900 → $1,998.00 into
-- project_unbilled_time) and a teammate's on the same project resolved 'none' / $0,
-- while the employing studio's rates for both were ignored. The EMPLOYER tier closes
-- both arms: S is now her one employer candidate, so S is stamped and S's rates price
-- every hour on her projects. Case (aa) of the billing suite carries the measurement,
-- with the control (a hire seated BEFORE her designer grant) in the same fixture.
--
-- WHAT THE CLOSE COSTS, stated rather than discovered later:
--   · a designer who owns TWO studios and has no employer (the principal who also
--     owns her auto-provisioned workspace) is stamped NOTHING — ambiguity is 'none'
--     under HT-3-b. Cases (n) and (w) pin it, and the repair beside them is naming
--     the studio on the project (HT-3-c).
--   · a designer with an employer is priced by the EMPLOYER even on her own project.
--     Case (p)'s and (s)'s asserts moved accordingly.
--   · seating somebody in an organization still needs NO consent from them, so a
--     second seat can make a designer's tier ambiguous — a $0 denial-of-service (the
--     pre-existing W1-R8-12), never somebody else's number. For a designer with NO
--     employer, a consent-free seat in a second account's workspace becomes her sole
--     employer tier and that account's rates price her hours; HT-3-b(c)'s consent
--     door (seats land `status = 'invited'`, only the named user activates her own)
--     is the closure and stays OWED in
--     artifacts/hour-tracking-2026-09-11/rulings.md.
--
-- There is no "member being priced" at project creation — the DESIGNER is the only
-- person the row names — which is why the rule here can be, and is, the same rule
-- 00599's step 2 applies. Where they could once disagree (the deleted rate-existence
-- preference asked about a member who does not exist yet) there is now nothing to
-- disagree about.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_project_studio_id_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- HT-3-b's tiers are collected as arrays, not ordered and LIMIT 1'd: the rule is
  -- "exactly one candidate is stamped; more than one leaves the column NULL", so the
  -- COUNT is the answer and there is no ordering key to choose with.
  v_employer_studios uuid[];
  v_owned_studios    uuid[];
BEGIN
  IF NEW.studio_id IS NOT NULL OR NEW.designer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- EMPLOYER tier: the designer's active non-guest seats that are NOT owner seats.
  SELECT array_agg(DISTINCT studio.id)
    INTO v_employer_studios
  FROM public.organizations AS studio
  JOIN public.organization_members AS designer_seat
    ON designer_seat.organization_id = studio.id
   AND designer_seat.user_id = NEW.designer_id
  WHERE studio.type = 'design_studio'
    AND studio.status = 'active'
    AND designer_seat.status = 'active'
    AND designer_seat.role <> 'guest'
    AND designer_seat.role <> 'owner';

  IF COALESCE(array_length(v_employer_studios, 1), 0) = 1 THEN
    NEW.studio_id := v_employer_studios[1];
  ELSIF COALESCE(array_length(v_employer_studios, 1), 0) = 0 THEN
    -- OWNED tier, reached ONLY when she holds no employer seat anywhere. An employer
    -- tier of two or more leaves the column NULL on purpose: choosing between them is
    -- what every key HT-3-b deleted used to do.
    SELECT array_agg(DISTINCT studio.id)
      INTO v_owned_studios
    FROM public.organizations AS studio
    JOIN public.organization_members AS designer_seat
      ON designer_seat.organization_id = studio.id
     AND designer_seat.user_id = NEW.designer_id
    WHERE studio.type = 'design_studio'
      AND studio.status = 'active'
      AND designer_seat.status = 'active'
      AND designer_seat.role = 'owner';

    IF COALESCE(array_length(v_owned_studios, 1), 0) = 1 THEN
      NEW.studio_id := v_owned_studios[1];
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- SECURITY DEFINER because organization_members' SELECT policies are own-row /
-- admin-only (00315's own note), so an INVOKER read would see a partial candidate
-- set whenever the inserting actor is not the designer — and under HT-3-b a PARTIAL
-- candidate set is worse than no stamp at all, because it can turn an ambiguous tier
-- into a confident wrong answer. It escalates nothing: it takes no argument, writes
-- only NEW.studio_id, and can only write a studio the named designer actively belongs
-- to as a non-guest member. EXECUTE is revoked from every role — a trigger function
-- needs none at fire time (the privilege is checked at CREATE TRIGGER), which is the
-- 00597 precedent in this same wave.
REVOKE ALL ON FUNCTION public.set_project_studio_id_owned()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.set_project_studio_id_owned() IS
  'HT-3-a + HT-3-b: on INSERT, when projects.studio_id is unset, stamp the lead '
  'designer''s one EMPLOYER studio (active, non-guest seat with role <> ''owner'' in '
  'an active design_studio) or, if she has no employer seat at all, her one OWNED '
  'studio. More than one candidate in a tier leaves the column NULL, which 00599 '
  'reports as ''none'' until somebody names the studio on the project. No date, '
  'rate-existence or member-count key. Fires after set_project_studio_id so every '
  'existing refusal is reached first. INSERT only — no existing row is ever '
  'rewritten (P-4). The name''s _owned is now only the second tier.';

DROP TRIGGER IF EXISTS zzz_set_project_studio_id_owned_trg ON public.projects;
CREATE TRIGGER zzz_set_project_studio_id_owned_trg
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_project_studio_id_owned();

DO $postcondition$
DECLARE
  v_owned_name  text;
  v_legacy_name text;
BEGIN
  SELECT tgname INTO v_owned_name FROM pg_trigger
   WHERE tgrelid = 'public.projects'::regclass AND NOT tgisinternal
     AND tgname = 'zzz_set_project_studio_id_owned_trg';
  IF v_owned_name IS NULL THEN
    RAISE EXCEPTION '00602: the studio-stamp trigger must be installed on public.projects';
  END IF;

  SELECT tgname INTO v_legacy_name FROM pg_trigger
   WHERE tgrelid = 'public.projects'::regclass AND NOT tgisinternal
     AND tgname = 'set_project_studio_id';
  IF v_legacy_name IS NULL THEN
    RAISE EXCEPTION '00602: set_project_studio_id (00317 → 00563) must still be installed — this trigger is additive to it, not a replacement';
  END IF;

  -- Compared as values read from pg_trigger, not as two string literals: a literal
  -- comparison is constant-folded at parse time and can only ever fail when someone
  -- edits the literals (W1-R7-07).
  IF NOT (v_owned_name > v_legacy_name) THEN
    RAISE EXCEPTION '00602: this trigger must sort AFTER set_project_studio_id, or it stamps a value before that trigger judges the write and 00563''s fail-closed refusals stop being reached (% vs %)',
      v_owned_name, v_legacy_name;
  END IF;

  -- BEFORE INSERT, FOR EACH ROW, and nothing else: an UPDATE event would rewrite
  -- history, which P-4 forbids and which HT-3-a did not ask for.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass
      AND tgname = 'zzz_set_project_studio_id_owned_trg'
      AND (tgtype & 16) <> 0          -- 16 = UPDATE
  ) THEN
    RAISE EXCEPTION '00602: the studio stamp must not fire on UPDATE — no existing project is re-pointed (P-4)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass
      AND tgname = 'zzz_set_project_studio_id_owned_trg'
      AND (tgtype & 4) <> 0           -- 4 = INSERT
      AND (tgtype & 1) <> 0           -- 1 = ROW
      AND (tgtype & 2) <> 0           -- 2 = BEFORE
  ) THEN
    RAISE EXCEPTION '00602: the studio stamp must be a BEFORE INSERT FOR EACH ROW trigger';
  END IF;

  -- ── HT-3-b: the same two tiers 00599's step 2 applies, in the same order ──
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.user_id = NEW\.designer_id'
  THEN
    RAISE EXCEPTION '00602: the stamp must key on the PROJECT DESIGNER''s own seats, never on anybody else''s (HT-3-a)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.role <> ''owner'''
  THEN
    RAISE EXCEPTION '00602: the FIRST tier is the EMPLOYER tier — the designer''s active non-guest seats with role <> ''owner'' (HT-3-b, RULED 2026-09-12)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.role = ''owner'''
  THEN
    RAISE EXCEPTION '00602: the SECOND tier is the OWNED tier — role = ''owner'', reached only when the designer holds no employer seat (HT-3-b)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.role <> ''owner''[\s\S]*designer_seat\.role = ''owner'''
  THEN
    RAISE EXCEPTION '00602: the EMPLOYER tier must be read BEFORE the OWNED tier (HT-3-b) — reversed, the hire''s own workspace is stamped on her employer''s project again (W1-R8-01)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.role <> ''guest'''
  THEN
    RAISE EXCEPTION '00602: a guest seat is not a candidate studio (HT-3-b: ACTIVE, NON-GUEST membership)';
  END IF;

  -- No ordering key of any kind: HT-3-b is a count, and more than one candidate
  -- leaves the column NULL rather than picking. Each banned token is a key a review
  -- round measured as manufacturable or date-blind.
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure) ~ 'ORDER BY'
  THEN
    RAISE EXCEPTION '00602: the stamp must not ORDER its candidates — ambiguity leaves studio_id NULL under HT-3-b, and every ordering key this wave shipped was manufacturable (W1-R4-01/R5-02/R6-01/R7-01) or date-blind (W1-R10-02)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure) ~ 'studio_member_rates'
  THEN
    RAISE EXCEPTION '00602: the stamp must not read studio_member_rates at all — the rate-existence preference is deleted by HT-3-b, and it was date-blind besides (W1-R10-02)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure) ~ '[A-Za-z_]+\.created_at'
     OR pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure) ~ 'joined_at'
  THEN
    RAISE EXCEPTION '00602: no seat or organization date may influence the stamp — joined_at and a membership row''s created_at are written by whoever seats the member (W1-R6-01), and organizations.created_at is admin-writable (W1-R7-01)';
  END IF;

  IF has_function_privilege('authenticated', 'public.set_project_studio_id_owned()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_project_studio_id_owned()', 'EXECUTE')
  THEN
    RAISE EXCEPTION '00602: set_project_studio_id_owned is a trigger function — no role holds EXECUTE on it';
  END IF;
END
$postcondition$;
