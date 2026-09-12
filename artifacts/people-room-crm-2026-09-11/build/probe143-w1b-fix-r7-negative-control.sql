-- r7 FIX negative control: the two pre-fix bodies, replayed, so the new suite
-- legs (block 14's two card pointers, block 16's number set + control) are
-- shown to BITE rather than to describe behaviour that was already right.
--
-- Phase A: the SHIPPED bodies (project_tenant_org() in the card guard, the
--          three-leg "belongs to" in the number set).
-- Phase B: the same walk with r6's bodies restored inside the transaction.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f artifacts/.../probe143-w1b-fix-r7-negative-control.sql
-- Both phases ROLLBACK.

\echo '################ PHASE A — the shipped bodies ################'
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $fn$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $fn$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $fn$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $fn$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ── fixture: the two studios, the studio-less job, the four cards ───────────
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, full_name, created_by) VALUES
  ('e7100000-0000-4000-8000-0000000000a1','b0000000-0000-0000-0000-000000000001','company','trade','Probe143 Own Firm',NULL,'a0000000-0000-0000-0000-000000000004'),
  ('e7100000-0000-4000-8000-0000000000a2','b0000000-0000-0000-0000-000000000001','person','trade',NULL,'Probe143 Own Warranty','a0000000-0000-0000-0000-000000000004'),
  ('e7100000-0000-4000-8000-0000000000b1',public.project_consent_org('b0000000-0000-0000-0000-0000000000d1'),'company','trade','Probe143 Foreign Firm',NULL,'a0000000-0000-0000-0000-000000000004'),
  ('e7100000-0000-4000-8000-0000000000c9','b0000000-0000-0000-0000-000000000001','person','trade',NULL,'Probe143 Carded Trade','a0000000-0000-0000-0000-000000000004');
UPDATE public.studio_contacts SET phone_e164 = '+16125559996' WHERE id = 'e7100000-0000-4000-8000-0000000000c9';
INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status, source, recorded_at, consented_at)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125559996','granted','written',now(),now())
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE SET status='granted', consented_at=now();
INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status, opt_out_at, opt_out_source)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125559997','opted_out',now(),'inbound_sms')
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE SET status='opted_out', opt_out_at=now(), opt_out_source='inbound_sms';
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, trade, phone_e164, created_by)
VALUES ('e7100000-0000-4000-8000-0000000000e1','b0000000-0000-0000-0000-0000000000d1','sub','Probe143 Studioless Sub','electrical','+16125557777','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, trade, phone_e164, studio_contact_id, created_by)
VALUES ('e7100000-0000-4000-8000-0000000000e2','b0000000-0000-0000-0000-0000000000d1','sub','Probe143 Carded Trade','electrical','+16125559997','e7100000-0000-4000-8000-0000000000c9','a0000000-0000-0000-0000-000000000004');

\echo '=== premise: the two resolvers disagree on this project ==='
SELECT (SELECT name FROM public.organizations WHERE id = public.project_consent_org('b0000000-0000-0000-0000-0000000000d1')) AS consent_resolver_names;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT (SELECT name FROM public.organizations WHERE id = public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1')) AS gate_resolver_names;

\echo '=== A. own firm card on own seat (block 14t) ==='
DO $do$ BEGIN
  UPDATE public.project_parties SET company_id = 'e7100000-0000-4000-8000-0000000000a1'
   WHERE id = 'e7100000-0000-4000-8000-0000000000e1';
  RAISE NOTICE 'A: the working studio''s OWN firm pointer LANDED';
EXCEPTION WHEN others THEN RAISE NOTICE 'A: REFUSED — %', SQLERRM; END $do$;

\echo '=== B. own warranty contact on own seat (block 14u) ==='
DO $do$ BEGIN
  UPDATE public.project_parties SET warranty_contact_person_id = 'e7100000-0000-4000-8000-0000000000a2'
   WHERE id = 'e7100000-0000-4000-8000-0000000000e1';
  RAISE NOTICE 'B: the working studio''s OWN warranty contact LANDED';
EXCEPTION WHEN others THEN RAISE NOTICE 'B: REFUSED — %', SQLERRM; END $do$;

\echo '=== C. a FOREIGN studio''s firm card on this studio''s seat (block 14w) ==='
SELECT count(*) AS can_the_admin_read_the_foreign_card FROM public.studio_contacts WHERE id = 'e7100000-0000-4000-8000-0000000000b1';
DO $do$ BEGIN
  UPDATE public.project_parties SET company_id = 'e7100000-0000-4000-8000-0000000000b1'
   WHERE id = 'e7100000-0000-4000-8000-0000000000e1';
  RAISE NOTICE 'C: a FOREIGN studio''s firm pointer LANDED on this studio''s seat';
EXCEPTION WHEN others THEN RAISE NOTICE 'C: refused — %', SQLERRM; END $do$;
SELECT company_id, paper_state FROM public.people_directory_seats WHERE seat_id = 'e7100000-0000-4000-8000-0000000000e1';

\echo '=== D. the number set and the identity word on the studio-less job (block 16c/16d) ==='
SELECT public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms','+16125559997') AS record_for_the_seats_number;
SELECT array_agg(n ORDER BY n)::text AS number_set FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001','e7100000-0000-4000-8000-0000000000c9','+16125559996') AS t(n);
SELECT display_name, consent_status FROM public.people_directory WHERE person_id = 'e7100000-0000-4000-8000-0000000000c9';

\echo '=== E. the mutation control: the same seat on a job that RECORDS its studio (block 16f/16g) ==='
SELECT pg_temp.reset_role();
UPDATE public.project_parties SET project_id = 'b0000000-0000-0000-0000-00000000c0d1' WHERE id = 'e7100000-0000-4000-8000-0000000000e2';
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT array_agg(n ORDER BY n)::text AS number_set_control FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001','e7100000-0000-4000-8000-0000000000c9','+16125559996') AS t(n);
SELECT display_name, consent_status FROM public.people_directory WHERE person_id = 'e7100000-0000-4000-8000-0000000000c9';
SELECT pg_temp.reset_role();
ROLLBACK;

\echo '################ PHASE B — r6''s bodies restored (the pre-fix behaviour) ################'
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $fn$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $fn$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $fn$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $fn$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ── r6's two bodies, restored verbatim from HEAD (git show HEAD:...) ────────
CREATE OR REPLACE FUNCTION public.assert_project_party_cards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org  uuid;
  v_kind text;
  v_card uuid;
BEGIN
  IF NEW.company_id IS NULL AND NEW.warranty_contact_person_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_org := public.project_consent_org(NEW.project_id);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'party_card_project_has_no_studio'
      USING HINT = 'This project resolves to no studio, so a rolodex card on '
                   'its seats cannot be checked against one. Give the project '
                   'a studio first.';
  END IF;

  IF NEW.company_id IS NOT NULL THEN
    SELECT sc.entity_kind INTO v_kind
      FROM public.studio_contacts sc
     WHERE sc.id = NEW.company_id AND sc.organization_id = v_org;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'party_company_other_studio'
        USING HINT = 'project_parties.company_id must name a card in the '
                     'project''s own studio rolodex.';
    END IF;
    IF v_kind IS DISTINCT FROM 'company' THEN
      RAISE EXCEPTION 'party_company_not_a_company'
        USING HINT = 'project_parties.company_id must name a COMPANY card. '
                     'A person does not hold the subcontract.';
    END IF;
  END IF;

  IF NEW.warranty_contact_person_id IS NOT NULL THEN
    SELECT sc.entity_kind, sc.id INTO v_kind, v_card
      FROM public.studio_contacts sc
     WHERE sc.id = NEW.warranty_contact_person_id
       AND sc.organization_id = v_org;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'party_warranty_contact_other_studio'
        USING HINT = 'warranty_contact_person_id must name a card in the '
                     'project''s own studio rolodex.';
    END IF;
    IF v_kind IS DISTINCT FROM 'person' THEN
      RAISE EXCEPTION 'party_warranty_contact_not_a_person'
        USING HINT = 'warranty_contact_person_id must name a PERSON card. A '
                     'warranty call goes to a human, not to a firm (CS5-25).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_phone_numbers(
  p_organization_id uuid,
  p_identity_key    text,
  p_card_phone_e164 text
)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT n.v FROM (
    SELECT NULLIF(btrim(COALESCE(p_card_phone_e164, '')), '') AS v
     WHERE public.is_active_studio_member(p_organization_id)
    UNION
    SELECT NULLIF(btrim(COALESCE(pp.phone_e164, '')), '')
      FROM public.project_parties pp
      JOIN public.projects pj ON pj.id = pp.project_id
     WHERE public.is_active_studio_member(p_organization_id)
       AND p_identity_key IS NOT NULL
       -- the seat must belong to the studio this call answers FOR, not merely
       -- to a studio the caller happens to belong to (w1b final review r5
       -- BLOCKING-1). Both arguments are caller-supplied and this leg had no
       -- organization predicate at all, so the gate proved only that the
       -- caller belonged to the studio they NAMED while the scan reached
       -- every seat on the platform.
       AND public.project_consent_org(pj.id) = p_organization_id
       AND public.party_identity_key(
             pp.studio_contact_id, pp.profile_id,
             pp.phone_e164, pp.email, pp.id
           ) = p_identity_key
  ) n
  WHERE n.v IS NOT NULL;
$$;


-- ── fixture: the two studios, the studio-less job, the four cards ───────────
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, full_name, created_by) VALUES
  ('e7100000-0000-4000-8000-0000000000a1','b0000000-0000-0000-0000-000000000001','company','trade','Probe143 Own Firm',NULL,'a0000000-0000-0000-0000-000000000004'),
  ('e7100000-0000-4000-8000-0000000000a2','b0000000-0000-0000-0000-000000000001','person','trade',NULL,'Probe143 Own Warranty','a0000000-0000-0000-0000-000000000004'),
  ('e7100000-0000-4000-8000-0000000000b1',public.project_consent_org('b0000000-0000-0000-0000-0000000000d1'),'company','trade','Probe143 Foreign Firm',NULL,'a0000000-0000-0000-0000-000000000004'),
  ('e7100000-0000-4000-8000-0000000000c9','b0000000-0000-0000-0000-000000000001','person','trade',NULL,'Probe143 Carded Trade','a0000000-0000-0000-0000-000000000004');
UPDATE public.studio_contacts SET phone_e164 = '+16125559996' WHERE id = 'e7100000-0000-4000-8000-0000000000c9';
INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status, source, recorded_at, consented_at)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125559996','granted','written',now(),now())
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE SET status='granted', consented_at=now();
INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status, opt_out_at, opt_out_source)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125559997','opted_out',now(),'inbound_sms')
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE SET status='opted_out', opt_out_at=now(), opt_out_source='inbound_sms';
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, trade, phone_e164, created_by)
VALUES ('e7100000-0000-4000-8000-0000000000e1','b0000000-0000-0000-0000-0000000000d1','sub','Probe143 Studioless Sub','electrical','+16125557777','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, trade, phone_e164, studio_contact_id, created_by)
VALUES ('e7100000-0000-4000-8000-0000000000e2','b0000000-0000-0000-0000-0000000000d1','sub','Probe143 Carded Trade','electrical','+16125559997','e7100000-0000-4000-8000-0000000000c9','a0000000-0000-0000-0000-000000000004');

\echo '=== premise: the two resolvers disagree on this project ==='
SELECT (SELECT name FROM public.organizations WHERE id = public.project_consent_org('b0000000-0000-0000-0000-0000000000d1')) AS consent_resolver_names;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT (SELECT name FROM public.organizations WHERE id = public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1')) AS gate_resolver_names;

\echo '=== A. own firm card on own seat (block 14t) ==='
DO $do$ BEGIN
  UPDATE public.project_parties SET company_id = 'e7100000-0000-4000-8000-0000000000a1'
   WHERE id = 'e7100000-0000-4000-8000-0000000000e1';
  RAISE NOTICE 'A: the working studio''s OWN firm pointer LANDED';
EXCEPTION WHEN others THEN RAISE NOTICE 'A: REFUSED — %', SQLERRM; END $do$;

\echo '=== B. own warranty contact on own seat (block 14u) ==='
DO $do$ BEGIN
  UPDATE public.project_parties SET warranty_contact_person_id = 'e7100000-0000-4000-8000-0000000000a2'
   WHERE id = 'e7100000-0000-4000-8000-0000000000e1';
  RAISE NOTICE 'B: the working studio''s OWN warranty contact LANDED';
EXCEPTION WHEN others THEN RAISE NOTICE 'B: REFUSED — %', SQLERRM; END $do$;

\echo '=== C. a FOREIGN studio''s firm card on this studio''s seat (block 14w) ==='
SELECT count(*) AS can_the_admin_read_the_foreign_card FROM public.studio_contacts WHERE id = 'e7100000-0000-4000-8000-0000000000b1';
DO $do$ BEGIN
  UPDATE public.project_parties SET company_id = 'e7100000-0000-4000-8000-0000000000b1'
   WHERE id = 'e7100000-0000-4000-8000-0000000000e1';
  RAISE NOTICE 'C: a FOREIGN studio''s firm pointer LANDED on this studio''s seat';
EXCEPTION WHEN others THEN RAISE NOTICE 'C: refused — %', SQLERRM; END $do$;
SELECT company_id, paper_state FROM public.people_directory_seats WHERE seat_id = 'e7100000-0000-4000-8000-0000000000e1';

\echo '=== D. the number set and the identity word on the studio-less job (block 16c/16d) ==='
SELECT public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms','+16125559997') AS record_for_the_seats_number;
SELECT array_agg(n ORDER BY n)::text AS number_set FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001','e7100000-0000-4000-8000-0000000000c9','+16125559996') AS t(n);
SELECT display_name, consent_status FROM public.people_directory WHERE person_id = 'e7100000-0000-4000-8000-0000000000c9';

\echo '=== E. the mutation control: the same seat on a job that RECORDS its studio (block 16f/16g) ==='
SELECT pg_temp.reset_role();
UPDATE public.project_parties SET project_id = 'b0000000-0000-0000-0000-00000000c0d1' WHERE id = 'e7100000-0000-4000-8000-0000000000e2';
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT array_agg(n ORDER BY n)::text AS number_set_control FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001','e7100000-0000-4000-8000-0000000000c9','+16125559996') AS t(n);
SELECT display_name, consent_status FROM public.people_directory WHERE person_id = 'e7100000-0000-4000-8000-0000000000c9';
SELECT pg_temp.reset_role();
ROLLBACK;
