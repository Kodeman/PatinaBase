-- ═══════════════════════════════════════════════════════════════════════════
-- 00603 — HT-3-b decides the stamp on the path that creates REAL projects, and
--         only where no caller NAMED the studio
--
-- ── THE DEFECT (W1-R11-02, measured 1/1 end to end on the isolated stack) ───
-- 00602 stamps projects.studio_id from HT-3-b's two tiers, but its trigger is
-- named `zzz_…` so it fires AFTER `set_project_studio_id` (00317 → 00511 →
-- 00563) and its first statement returns early on a non-NULL studio_id. On
-- every LIVE creation path 00563 has already filled the column, and 00563
-- carries its OWN, DIFFERENT rule for the same question: inside the
-- proposal-activation bridge it sorts the designer's candidate studios with
-- `(membership.role = 'owner') DESC` — owner FIRST, the exact preference HT-3-b
-- was ruled to invert. So HT-3-b was inert exactly where it mattered.
--
-- Measured through `public.sign_proposal`, the ordinary way a project is born
-- (fixture: Leah owns studio S; her hire is an ordinary designer signup, so
-- 00295 provisioned her a workspace W she owns, and she is seated `admin` in S;
-- Leah prices the hire 20000 and an assistant 12000 in S; the hire prices
-- herself 99900 in W; the client signs):
--
--   BEFORE 00603 : projects.studio_id = W        (the workspace she owns)
--                  her own client-billed hour → 99900 / studio_member / 199800
--                  the assistant's hour       → NULL  / none         / NULL
--                  project_unbilled_time      → $1,998.00 and $0.00
--   AFTER  00603 : projects.studio_id = S        (her one employer)
--                  her hour                  → 20000 / studio_member / 40000
--                  the assistant's hour       → 12000 / studio_member / 24000
--
-- Both of those BEFORE lines are W1-R8-01 arms A and B — the finding HT-3-b
-- exists to close — alive on the program's own customer shape with no attacker,
-- no manoeuvre and no extra signup. Case (aa) could not see it: its projects are
-- inserted AS POSTGRES, the one context (00563's migration bypass) where the
-- column is left NULL and 00602 decides, so the green suite proved nothing about
-- the live path. Case (ae) below pins the live path itself.
--
-- ── WHAT THIS FILE DOES, AND WHAT IT REFUSES TO DO ─────────────────────────
-- `set_project_studio_id` is NOT redefined. Its body is 250 lines of
-- signing-ceremony authorization (00563's fail-closed refusals, the canonical
-- lock order, the activation-capability proof) that this program has no business
-- carrying, and re-deriving it from a stale copy is the failure mode
-- `patina-db-migrations` step 2 exists for. 00602's banner is right to refuse it.
--
-- Instead, two additive pieces:
--
--   (1) `public.record_project_studio_id_named()` on a BEFORE INSERT FOR EACH ROW
--       trigger named `aaa_project_studio_id_named_trg`, which sorts BEFORE
--       `set_project_studio_id`. Its whole body records, in a transaction-local
--       GUC, whether the CALLER left studio_id NULL on THIS row. All BEFORE ROW
--       triggers fire for one row before the next row is processed, so the flag
--       is per row, not per statement.
--
--   (2) one arm in `set_project_studio_id_owned` (still LAST, still `zzz_…`):
--       when the flag says the caller named nothing AND HT-3-b's employer tier
--       holds EXACTLY ONE candidate, that candidate is stamped — overriding a
--       value 00563 DERIVED, never one the caller NAMED.
--
-- Why the flag is needed at all: by the time the `zzz_` trigger runs, a named
-- studio and a derived studio are indistinguishable in NEW. Reading
-- `NEW.studio_id IS NOT NULL` as "the caller named it" is what made HT-3-b inert;
-- reading it as "derived" would override HT-3-c. The flag is the only thing that
-- can tell them apart, and it is written before any rule can fill the column.
--
-- ── HT-3-c IS UNTOUCHED (arm (a), ruled by the orchestrator 2026-09-12) ─────
-- A project whose designer NAMED its studio_id at creation still prices from that
-- studio, even when she owns it — a sole proprietor billing her own studio's
-- client, not a member gaming her employer's books. With the flag at '1' this
-- body returns immediately, exactly as 00602 did. Case (ac) of the billing suite
-- is the pin and does not move.
--
-- A MISSING flag is read as NAMED. So the worst a lost GUC can do is leave
-- 00563's answer standing — the behaviour of the day before this file — and it
-- can never invent an override.
--
-- ── WHAT IS DELIBERATELY LEFT STANDING, and the question it raises ──────────
-- When the employer tier is EMPTY or AMBIGUOUS and 00563 already derived a value,
-- 00563's answer stands. HT-3-b says an ambiguous tier is 'none', but on the
-- activation path 'none' is unreachable without either leaving studio_id NULL —
-- which 00563's fail-closed check (00563:326-346) forbids for an authenticated
-- caller — or refusing the client's signature. Clearing the column here would
-- therefore either break the signing ceremony or smuggle a row past a check that
-- exists to stop exactly that. If HT-3-b's "more than one is 'none'" is meant to
-- bind the activation bridge too, that IS an edit to the signing ceremony and
-- must be ruled: it is flagged to the orchestrator in
-- artifacts/hour-tracking-2026-09-11/build/W1-fix-r11.md, not decided here.
--
-- THE OPEN SUB-QUESTION IS NOT COSMETIC (W1-R12-01, measured 1/1 end to end
-- through `public.sign_proposal` with a control in the same fixture; case (af) of
-- supabase/tests/billing/time_rate_resolution_test.sql pins it). What 00563's
-- answer rests on, once this file stands aside, is the remainder of its bridge's
-- ORDER BY (00563:266-277): after the sibling-project preference and
-- `(role = 'owner') DESC` it ranks on `membership.joined_at NULLS LAST`, then
-- `membership.created_at`. `joined_at` is nullable with NO default, `created_at` is
-- NOT NULL DEFAULT now(), `guard_org_membership_changes()` constrains neither, and
-- `Org owners can insert members` says nothing about the invitee. So the MEMBER
-- BEING PRICED can seat the project's DESIGNER in a workspace she owns with a
-- backdated `joined_at`, make the designer's employer tier AMBIGUOUS, and have her
-- own hour on the designer's client project come back
-- 99900 / studio_member / 199800 / authorized with project_unbilled_time reporting
-- $1,998.00 — EVEN WHEN THE DESIGNER ALREADY HOLDS AN EMPLOYER SEAT, which is the
-- one shape HT-3-b's ruling cell calls safe. Controls in the same fixture: no
-- manoeuvre, the same seat with `joined_at` NULL, and the same seat at
-- `status = 'invited'` each stamp the employer studio and read 12000 / 24000.
--
-- RETRACTED BY LINE: 00602:98-99 ("ambiguity is 'none' under HT-3-b") and
-- 00602:104-108 ("a second seat can make a designer's tier ambiguous — a $0
-- denial-of-service (the pre-existing W1-R8-12), never somebody else's number")
-- are both FALSE on the activation path, with the measured values above. They hold
-- on the postgres/seed path and for 00599 step 2, and nowhere else. The two
-- closures are RULINGS, and neither is code in this wave: HT-3-b arm (c) (seats
-- land `status = 'invited'`; only the named user activates her own seat), which is
-- already OWED and was measured to close it completely, or a ruling that an
-- ambiguous employer tier must FAIL CLOSED on the activation path — refuse the
-- signature, or leave the column NULL and amend 00563's check. No code-only
-- closure exists inside this program's files that does not key on the member being
-- priced (HT-3-a forbids it) or re-introduce a ranking key among the employer
-- candidates (rounds 4-7 rated every such key blocker-grade); restricting the
-- bridge to the employer tier does not help, because both candidates in the
-- measured shape ARE employer-tier seats.
--
-- When the caller named nothing and the column is STILL NULL after 00563 (the
-- migration/seed/service bypass), the two tiers behave exactly as 00602 shipped
-- them: employer tier of one stamps, else owned tier of one stamps, else NULL and
-- 00599 step 3 reports 'none'.
--
-- ── WHAT THIS DOES NOT CLOSE ────────────────────────────────────────────────
-- W1-R11-01: seating still needs no consent from the person seated, so a member
-- who owns an organization can seat the project's DESIGNER in it, become her one
-- employer candidate, and price herself there. That is HT-3-b arm (c) (seats land
-- `status = 'invited'`; only the named user activates her own seat), which stays
-- OWED. Cases (ad-i) and (ad-ii) of the billing suite pin it as built, on both
-- surfaces, and case (af) pins the AMBIGUOUS-tier shape above; rulings.md records
-- that a member CAN push the outcome toward a number she set — toward her own
-- number when the project's designer holds no employer seat, and, on the
-- activation path, even when the designer holds one.
--
-- Lineage: `set_project_studio_id_owned` 00602 → 00603 (body grafted from 00602
-- verbatim, one arm added). `record_project_studio_id_named` is new. Nothing else
-- is redefined — in particular NOT `set_project_studio_id` (head 00563) and NOT
-- `activate_proposal_as_project` (head 00579).
--
-- P-4: no existing row is touched; both triggers are BEFORE INSERT only and a
-- postcondition below refuses an UPDATE event on either.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (`python3 scripts/generate-legacy-grants.py`, plan-v2 §0.20).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (1) the flag: did the CALLER name studio_id on this row? ───────────────
CREATE OR REPLACE FUNCTION public.record_project_studio_id_named()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- '0' = the caller left it NULL, so any value the column carries later in this
  -- row's BEFORE chain was DERIVED by a server rule. '1' = the caller named it.
  -- Transaction-local; rewritten for every inserted row before any rule can fill
  -- the column, because all BEFORE ROW triggers run for one row before the next.
  PERFORM set_config(
    'app.project_studio_id_named',
    CASE WHEN NEW.studio_id IS NULL THEN '0' ELSE '1' END,
    true
  );
  RETURN NEW;
END;
$$;

-- A trigger function needs no EXECUTE at fire time (Postgres checks the
-- privilege at CREATE TRIGGER), which is 00597's and 00602's precedent in this
-- same wave. It takes no argument, reads only NEW.studio_id, and writes one
-- transaction-local GUC.
REVOKE ALL ON FUNCTION public.record_project_studio_id_named()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.record_project_studio_id_named() IS
  'Records in app.project_studio_id_named (transaction-local, per row) whether '
  'the caller supplied projects.studio_id on this INSERT. Fires FIRST, before '
  'set_project_studio_id can fill the column, so set_project_studio_id_owned can '
  'tell a value the caller NAMED (HT-3-c arm (a): left alone) from one a server '
  'rule DERIVED (HT-3-b: the employer tier may override it). A missing flag is '
  'read as NAMED, so a lost GUC can only leave the earlier answer standing.';

DROP TRIGGER IF EXISTS aaa_project_studio_id_named_trg ON public.projects;
CREATE TRIGGER aaa_project_studio_id_named_trg
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.record_project_studio_id_named();

-- ── (2) HT-3-b's employer tier outranks a DERIVED studio, never a NAMED one ─
CREATE OR REPLACE FUNCTION public.set_project_studio_id_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- HT-3-b's tiers are collected as arrays, not sorted and LIMIT 1'd: the rule is
  -- "exactly one candidate is stamped; more than one leaves the column alone", so
  -- the COUNT is the answer and there is no ranking key to choose with.
  v_employer_studios uuid[];
  v_owned_studios    uuid[];
  -- FALSE only when aaa_project_studio_id_named_trg recorded '0' for THIS row,
  -- i.e. the caller left studio_id NULL and anything in it now was derived by
  -- set_project_studio_id. A missing flag reads as NAMED (see the banner).
  v_caller_named boolean :=
    COALESCE(current_setting('app.project_studio_id_named', true), '1') <> '0';
BEGIN
  IF NEW.designer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- HT-3-c arm (a): a studio the caller NAMED is final, even when she owns it.
  IF NEW.studio_id IS NOT NULL AND v_caller_named THEN
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
    -- The one employer prices the work (HT-3-b). This is the only statement that
    -- may overwrite a studio 00563 DERIVED — and the row it overwrites is always
    -- one of the designer's own active non-guest studios either way, so 00317's
    -- anti-aiming invariant holds by construction.
    NEW.studio_id := v_employer_studios[1];
  ELSIF COALESCE(array_length(v_employer_studios, 1), 0) = 0
        AND NEW.studio_id IS NULL THEN
    -- OWNED tier, reached ONLY when she holds no employer seat anywhere AND no
    -- rule filled the column. An employer tier of two or more leaves the column
    -- exactly as it was on purpose: choosing between them is what every key
    -- HT-3-b deleted used to do. Where 00563 already derived a value, that value
    -- stands — clearing it would either refuse the client's signature or smuggle
    -- a NULL past 00563's fail-closed check (see the banner's open question).
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
-- set whenever the inserting actor is not the designer — and under HT-3-b a
-- PARTIAL candidate set is worse than no stamp at all, because it can turn an
-- ambiguous tier into a confident wrong answer. It escalates nothing: it takes no
-- argument, writes only NEW.studio_id, and can only write a studio the named
-- designer actively belongs to as a non-guest member.
REVOKE ALL ON FUNCTION public.set_project_studio_id_owned()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.set_project_studio_id_owned() IS
  'HT-3-a + HT-3-b + HT-3-c: on INSERT, stamp the lead designer''s one EMPLOYER '
  'studio (active, non-guest seat with role <> ''owner'' in an active '
  'design_studio) or, if she has no employer seat at all AND no rule filled the '
  'column, her one OWNED studio. A studio the CALLER named is left alone '
  '(HT-3-c arm (a), read from app.project_studio_id_named); a studio '
  'set_project_studio_id DERIVED is overridden by a single employer candidate '
  '(W1-R11-02) and otherwise left standing. More than one candidate in a tier '
  'never chooses. No date, rate-existence or member-count key. Fires last, so '
  'every 00563 refusal is reached first. INSERT only — no existing row is ever '
  'rewritten (P-4).';

DROP TRIGGER IF EXISTS zzz_set_project_studio_id_owned_trg ON public.projects;
CREATE TRIGGER zzz_set_project_studio_id_owned_trg
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_project_studio_id_owned();

DO $postcondition$
DECLARE
  v_flag_name   text;
  v_owned_name  text;
  v_legacy_name text;
BEGIN
  SELECT tgname INTO v_flag_name FROM pg_trigger
   WHERE tgrelid = 'public.projects'::regclass AND NOT tgisinternal
     AND tgname = 'aaa_project_studio_id_named_trg';
  SELECT tgname INTO v_owned_name FROM pg_trigger
   WHERE tgrelid = 'public.projects'::regclass AND NOT tgisinternal
     AND tgname = 'zzz_set_project_studio_id_owned_trg';
  SELECT tgname INTO v_legacy_name FROM pg_trigger
   WHERE tgrelid = 'public.projects'::regclass AND NOT tgisinternal
     AND tgname = 'set_project_studio_id';

  IF v_flag_name IS NULL THEN
    RAISE EXCEPTION '00603: the named/derived flag trigger must be installed on public.projects';
  END IF;
  IF v_owned_name IS NULL THEN
    RAISE EXCEPTION '00603: the studio-stamp trigger must still be installed on public.projects';
  END IF;
  IF v_legacy_name IS NULL THEN
    RAISE EXCEPTION '00603: set_project_studio_id (00317 → 00563) must still be installed — this file is additive to it, not a replacement';
  END IF;

  -- Names read from pg_trigger and compared as values, never as two literals (a
  -- literal comparison is constant-folded at parse time — W1-R7-07).
  IF NOT (v_flag_name < v_legacy_name) THEN
    RAISE EXCEPTION '00603: the flag trigger must sort BEFORE set_project_studio_id, or it records a column that rule already filled and HT-3-c cannot be told from HT-3-b (% vs %)',
      v_flag_name, v_legacy_name;
  END IF;
  IF NOT (v_owned_name > v_legacy_name) THEN
    RAISE EXCEPTION '00603: the stamp must sort AFTER set_project_studio_id, or it stamps a value before that trigger judges the write and 00563''s fail-closed refusals stop being reached (% vs %)',
      v_owned_name, v_legacy_name;
  END IF;

  -- BEFORE INSERT, FOR EACH ROW, and nothing else, for BOTH triggers: an UPDATE
  -- event would rewrite history, which P-4 forbids.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass
      AND tgname IN ('aaa_project_studio_id_named_trg', 'zzz_set_project_studio_id_owned_trg')
      AND (tgtype & 16) <> 0          -- 16 = UPDATE
  ) THEN
    RAISE EXCEPTION '00603: neither trigger may fire on UPDATE — no existing project is re-pointed (P-4)';
  END IF;
  IF (
    SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass
      AND tgname IN ('aaa_project_studio_id_named_trg', 'zzz_set_project_studio_id_owned_trg')
      AND (tgtype & 4) <> 0           -- 4 = INSERT
      AND (tgtype & 1) <> 0           -- 1 = ROW
      AND (tgtype & 2) <> 0           -- 2 = BEFORE
  ) <> 2 THEN
    RAISE EXCEPTION '00603: both triggers must be BEFORE INSERT FOR EACH ROW';
  END IF;

  -- ── the flag's own body: one set_config of one GUC, and nothing else ──────
  IF pg_get_functiondef('public.record_project_studio_id_named()'::regprocedure)
       !~ 'app\.project_studio_id_named'
     OR pg_get_functiondef('public.record_project_studio_id_named()'::regprocedure)
       !~ 'NEW\.studio_id IS NULL'
  THEN
    RAISE EXCEPTION '00603: the flag trigger must record whether the CALLER left projects.studio_id NULL, in app.project_studio_id_named';
  END IF;

  -- ── HT-3-c: a NAMED studio is never overridden ───────────────────────────
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'app\.project_studio_id_named'
  THEN
    RAISE EXCEPTION '00603: the stamp must read app.project_studio_id_named — without it a DERIVED studio cannot be told from one the caller NAMED, which is how HT-3-b went inert on the live path (W1-R11-02)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'NEW\.studio_id IS NOT NULL AND v_caller_named[\s\S]{0,80}RETURN NEW'
  THEN
    RAISE EXCEPTION '00603: a studio the CALLER named must end the function before any tier is read (HT-3-c arm (a), case (ac))';
  END IF;

  -- ── HT-3-b: the same two tiers 00599's step 2 applies, in the same order ──
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.user_id = NEW\.designer_id'
  THEN
    RAISE EXCEPTION '00603: the stamp must key on the PROJECT DESIGNER''s own seats, never on anybody else''s (HT-3-a)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.role <> ''owner'''
  THEN
    RAISE EXCEPTION '00603: the FIRST tier is the EMPLOYER tier — the designer''s active non-guest seats with role <> ''owner'' (HT-3-b, RULED 2026-09-12)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.role = ''owner'''
  THEN
    RAISE EXCEPTION '00603: the SECOND tier is the OWNED tier — role = ''owner'', reached only when the designer holds no employer seat (HT-3-b)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.role <> ''owner''[\s\S]*designer_seat\.role = ''owner'''
  THEN
    RAISE EXCEPTION '00603: the EMPLOYER tier must be read BEFORE the OWNED tier (HT-3-b) — reversed, the hire''s own workspace is stamped on her employer''s project again (W1-R8-01)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       !~ 'designer_seat\.role <> ''guest'''
  THEN
    RAISE EXCEPTION '00603: a guest seat is not a candidate studio (HT-3-b: ACTIVE, NON-GUEST membership)';
  END IF;

  -- No ranking key of any kind: HT-3-b is a count. Each banned token is a key a
  -- review round measured as manufacturable or date-blind.
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure) ~ 'ORDER BY'
  THEN
    RAISE EXCEPTION '00603: the stamp must not sort its candidates — ambiguity never chooses under HT-3-b, and every ranking key this wave shipped was manufacturable (W1-R4-01/R5-02/R6-01/R7-01) or date-blind (W1-R10-02)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure) ~ 'studio_member_rates'
  THEN
    RAISE EXCEPTION '00603: the stamp must not read studio_member_rates at all — the rate-existence preference is deleted by HT-3-b, and it was date-blind besides (W1-R10-02)';
  END IF;
  IF pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure) ~ '[A-Za-z_]+\.created_at'
     OR pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure) ~ 'joined_at'
  THEN
    RAISE EXCEPTION '00603: no seat or organization date may influence the stamp — a seat''s dates are written by whoever seats the member (W1-R6-01), and organizations'' creation date is admin-writable (W1-R7-01)';
  END IF;

  IF has_function_privilege('authenticated', 'public.set_project_studio_id_owned()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_project_studio_id_owned()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_project_studio_id_named()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_project_studio_id_named()', 'EXECUTE')
  THEN
    RAISE EXCEPTION '00603: both are trigger functions — no role holds EXECUTE on either';
  END IF;
END
$postcondition$;
