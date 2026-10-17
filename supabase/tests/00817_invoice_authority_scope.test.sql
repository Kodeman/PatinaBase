-- ═══════════════════════════════════════════════════════════════════════════
-- 00817 — can_manage_invoice is scoped to the invoice's own studio
-- (SQ-1273; Astra SQ-1271 F3; R191).
--
-- Designer D sits in studios A and B. C sits only in A. O owns B. T is on
-- D's studio-B job (an active member of B). D has a job and an invoice in
-- each studio, and a studio-less job with a studio-less invoice.
--
--   (f) anon     holds no EXECUTE and a call is refused (42501)
--   (a) C        refused on D's studio-B invoice, with the same answer as for
--                an invoice that does not exist; get_invoice_link refuses her
--                with invoice_not_found, as it does for a missing invoice;
--                issue_invoice, record_invoice_payment, void_invoice and
--                add_invoice_billing_lines refuse her with their own
--                "not found or access denied", issue_invoice word for word
--                as for a missing invoice
--   (b) D        admitted on her studio-B invoice; she issues one studio-B
--                draft and voids another
--   (c) O        admitted on the studio-B invoice, not on the studio-A one;
--                she voids D's issued studio-B invoice and issues another
--   (d) T        admitted on the studio-B invoice
--   (e) C        still admitted on D's studio-A invoice
--   no studio    only the designer: C, D's peer in A, is refused
--   departed     with D's B seat suspended, T (the job's team) and O (B's
--                owner) are still admitted
--   (h) C        issue_invoice on D's studio-B draft 106, which has pending
--                linked time, refuses her exactly as for a missing invoice;
--                D still meets the linked-time check after the guard
--   (g) O        with studio B suspended, B's owner is refused; D, the
--                designer, is still admitted, as before 00817
--
-- Negative control: with the 00817 bodies set aside (00397 and 00718), (a),
-- the get_invoice_link refusal, the four money-write refusals, O on the
-- studio-A invoice, the studio-less refusal and both departed-designer
-- admissions fail. With only the SQ-1278 F1 studio gate set aside, (g)'s
-- owner refusal fails; with only F2 (00412's public.issue_invoice) set aside,
-- (h)'s two outsider refusals fail.
--
-- Run: cd supabase && supabase test db tests/00817_invoice_authority_scope.test.sql
--  or: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--        -v ON_ERROR_STOP=1 -f supabase/tests/00817_invoice_authority_scope.test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(33);

-- ─── fixtures (as postgres) ────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('81700000-0000-4000-8000-0000000000a1', 'us36-inv-scope-d@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81700000-0000-4000-8000-0000000000a2', 'us36-inv-scope-c@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81700000-0000-4000-8000-0000000000a3', 'us36-inv-scope-o@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81700000-0000-4000-8000-0000000000a4', 'us36-inv-scope-t@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('81700000-0000-4000-8000-0000000000a1', 'us36-inv-scope-d@test.invalid', 'Scope D', true, now(), now()),
  ('81700000-0000-4000-8000-0000000000a2', 'us36-inv-scope-c@test.invalid', 'Scope C', true, now(), now()),
  ('81700000-0000-4000-8000-0000000000a3', 'us36-inv-scope-o@test.invalid', 'Scope O', true, now(), now()),
  ('81700000-0000-4000-8000-0000000000a4', 'us36-inv-scope-t@test.invalid', 'Scope T', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('81700000-0000-4000-8000-0000000000f1', 'design_studio', 'Invoice Scope Studio A', 'us36-invoice-scope-studio-a-test'),
  ('81700000-0000-4000-8000-0000000000f2', 'design_studio', 'Invoice Scope Studio B', 'us36-invoice-scope-studio-b-test');

-- B's owner first: an owner seat is only inserted into an empty studio.
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('81700000-0000-4000-8000-0000000000e1', '81700000-0000-4000-8000-0000000000a3', '81700000-0000-4000-8000-0000000000f2', 'owner',  'active', now()),
  ('81700000-0000-4000-8000-0000000000e2', '81700000-0000-4000-8000-0000000000a1', '81700000-0000-4000-8000-0000000000f2', 'member', 'active', now()),
  ('81700000-0000-4000-8000-0000000000e3', '81700000-0000-4000-8000-0000000000a4', '81700000-0000-4000-8000-0000000000f2', 'member', 'active', now()),
  ('81700000-0000-4000-8000-0000000000e4', '81700000-0000-4000-8000-0000000000a1', '81700000-0000-4000-8000-0000000000f1', 'member', 'active', now()),
  ('81700000-0000-4000-8000-0000000000e5', '81700000-0000-4000-8000-0000000000a2', '81700000-0000-4000-8000-0000000000f1', 'member', 'active', now());

-- Issuing writes the invoice as its designer, who must hold a designer-domain
-- role (00511).
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '81700000-0000-4000-8000-0000000000a1', role.id, '81700000-0000-4000-8000-0000000000a1'
FROM public.roles AS role WHERE role.name = 'studio_owner';

INSERT INTO public.projects (id, name, designer_id, created_by, status, studio_id)
VALUES
  ('81700000-0000-4000-8000-000000000001', 'Invoice scope job B', '81700000-0000-4000-8000-0000000000a1', '81700000-0000-4000-8000-0000000000a1', 'active', '81700000-0000-4000-8000-0000000000f2'),
  ('81700000-0000-4000-8000-000000000002', 'Invoice scope job A', '81700000-0000-4000-8000-0000000000a1', '81700000-0000-4000-8000-0000000000a1', 'active', '81700000-0000-4000-8000-0000000000f1'),
  ('81700000-0000-4000-8000-000000000003', 'Invoice scope job N', '81700000-0000-4000-8000-0000000000a1', '81700000-0000-4000-8000-0000000000a1', 'active', NULL);

-- studio_id is left to set_invoice_studio_id, which copies the job's studio.
-- 104 and 105 are studio-B drafts with a line, for the issue/void admissions.
INSERT INTO public.invoices (id, project_id, designer_id, status, subtotal_cents, total_cents, memo)
VALUES
  ('81700000-0000-4000-8000-000000000101', '81700000-0000-4000-8000-000000000001', '81700000-0000-4000-8000-0000000000a1', 'draft', 1000, 1000, 'studio-B invoice'),
  ('81700000-0000-4000-8000-000000000102', '81700000-0000-4000-8000-000000000002', '81700000-0000-4000-8000-0000000000a1', 'draft', 1000, 1000, 'studio-A invoice'),
  ('81700000-0000-4000-8000-000000000103', '81700000-0000-4000-8000-000000000003', '81700000-0000-4000-8000-0000000000a1', 'draft', 1000, 1000, 'studio-less invoice'),
  ('81700000-0000-4000-8000-000000000104', '81700000-0000-4000-8000-000000000001', '81700000-0000-4000-8000-0000000000a1', 'draft', 1000, 1000, 'studio-B draft D issues'),
  ('81700000-0000-4000-8000-000000000105', '81700000-0000-4000-8000-000000000001', '81700000-0000-4000-8000-0000000000a1', 'draft', 1000, 1000, 'studio-B draft O issues'),
  ('81700000-0000-4000-8000-000000000106', '81700000-0000-4000-8000-000000000001', '81700000-0000-4000-8000-0000000000a1', 'draft', 1000, 1000, 'studio-B draft with pending linked time');

INSERT INTO public.invoice_line_items (invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, sort_order)
VALUES
  ('81700000-0000-4000-8000-000000000104', 'adhoc', 'Design fee', 1, 1000, 1000, 0),
  ('81700000-0000-4000-8000-000000000105', 'adhoc', 'Design fee', 1, 1000, 1000, 0),
  ('81700000-0000-4000-8000-000000000106', 'adhoc', 'Design fee', 1, 1000, 1000, 0);

-- Draft 106 carries linked time still pending authorization, the state
-- issue_invoice's first check names. The classifier and the link guard would
-- not write it, so this one insert runs with the table's triggers off.
ALTER TABLE public.project_time_entries DISABLE TRIGGER USER;
INSERT INTO public.project_time_entries (
  id, project_id, studio_id, user_id, started_at, duration_minutes, billable,
  invoice_id, billing_state, rate_source
)
VALUES (
  '81700000-0000-4000-8000-000000000301', '81700000-0000-4000-8000-000000000001',
  '81700000-0000-4000-8000-0000000000f2', '81700000-0000-4000-8000-0000000000a1',
  now() - interval '2 hours', 60, true,
  '81700000-0000-4000-8000-000000000106', 'pending_authorization', 'none'
);
ALTER TABLE public.project_time_entries ENABLE TRIGGER USER;

-- issue_invoice's answer for one invoice id, with the id written <id>, so a
-- refusal can be compared with the one for a missing invoice.
CREATE FUNCTION pg_temp.issue_invoice_answer(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.issue_invoice(p_invoice_id, NULL);
  RETURN 'issued';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || replace(SQLERRM, p_invoice_id::text, '<id>');
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.issue_invoice_answer(uuid) TO authenticated;

DO $$
BEGIN
  ASSERT (SELECT studio_id FROM public.invoices WHERE id = '81700000-0000-4000-8000-000000000101')
           = '81700000-0000-4000-8000-0000000000f2',
         'SETUP: the job-B invoice must carry studio B';
  ASSERT (SELECT studio_id FROM public.invoices WHERE id = '81700000-0000-4000-8000-000000000102')
           = '81700000-0000-4000-8000-0000000000f1',
         'SETUP: the job-A invoice must carry studio A';
  ASSERT (SELECT studio_id IS NULL FROM public.projects WHERE id = '81700000-0000-4000-8000-000000000003'),
         'SETUP: job N must have no studio';
  ASSERT (SELECT studio_id IS NULL FROM public.invoices WHERE id = '81700000-0000-4000-8000-000000000103'),
         'SETUP: the job-N invoice must have no studio';
  ASSERT (SELECT count(*) FROM public.invoices
           WHERE id IN ('81700000-0000-4000-8000-000000000104', '81700000-0000-4000-8000-000000000105')
             AND studio_id = '81700000-0000-4000-8000-0000000000f2' AND status = 'draft') = 2,
         'SETUP: drafts 104 and 105 must carry studio B';
  ASSERT (SELECT studio_id = '81700000-0000-4000-8000-0000000000f2' AND status = 'draft'
            FROM public.invoices WHERE id = '81700000-0000-4000-8000-000000000106'),
         'SETUP: draft 106 must carry studio B';
  ASSERT EXISTS (SELECT 1 FROM public.project_time_entries
                  WHERE invoice_id = '81700000-0000-4000-8000-000000000106'
                    AND billing_state = 'pending_authorization'),
         'SETUP: draft 106 must have linked time pending authorization';
  ASSERT NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = '81700000-0000-4000-8000-0000000001ff'),
         'SETUP: the missing invoice id must not exist';
END $$;

-- ─── the function keeps its shape and its ACL ──────────────────────────────

SELECT ok(
  (SELECT p.prosecdef
          AND p.provolatile = 's'
          AND p.prolang = (SELECT l.oid FROM pg_language AS l WHERE l.lanname = 'sql')
          AND p.prorettype = 'boolean'::regtype
          AND p.proconfig = ARRAY['search_path=public']
     FROM pg_proc AS p
    WHERE p.oid = 'public.can_manage_invoice(uuid)'::regprocedure),
  'can_manage_invoice(uuid) stays a STABLE SECURITY DEFINER sql function returning boolean, search_path = public');
SELECT ok(has_function_privilege('authenticated', 'public.can_manage_invoice(uuid)', 'EXECUTE'),
  'authenticated keeps EXECUTE on can_manage_invoice');
SELECT ok(
  (SELECT p.prosecdef
          AND p.prolang = (SELECT l.oid FROM pg_language AS l WHERE l.lanname = 'plpgsql')
          AND p.prorettype = 'public.invoices'::regtype
          AND p.pronargdefaults = 1
          AND p.proconfig = ARRAY['search_path=public, pg_temp']
     FROM pg_proc AS p
    WHERE p.oid = 'public.issue_invoice(uuid,date)'::regprocedure)
  AND has_function_privilege('authenticated', 'public.issue_invoice(uuid,date)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.issue_invoice(uuid,date)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.issue_invoice(uuid,date)', 'EXECUTE'),
  'issue_invoice(uuid, date) stays a SECURITY DEFINER plpgsql function, search_path = public, pg_temp, EXECUTE for authenticated only');

-- ─── (f) anon ──────────────────────────────────────────────────────────────

SELECT ok(NOT has_function_privilege('anon', 'public.can_manage_invoice(uuid)', 'EXECUTE'),
  '(f) anon holds no EXECUTE on can_manage_invoice');

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

SELECT throws_ok($$SELECT public.can_manage_invoice('81700000-0000-4000-8000-000000000101')$$, '42501', NULL,
  '(f) anon: calling can_manage_invoice is refused');

RESET ROLE;

-- ─── (a) C, who shares only studio A with D ────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a2","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000101'), false,
  '(a) C, sharing only studio A with D, is refused on D''s studio-B invoice');
SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-0000000001ff'), false,
  '(a) C gets the same answer for an invoice that does not exist');
SELECT throws_ok($$SELECT public.get_invoice_link('81700000-0000-4000-8000-000000000101')$$, 'P0001', 'invoice_not_found',
  '(a) get_invoice_link refuses C on the studio-B invoice with invoice_not_found, as for a missing invoice');

SELECT throws_ok($$SELECT public.issue_invoice('81700000-0000-4000-8000-000000000101', NULL)$$, 'P0001',
  'issue_invoice: invoice 81700000-0000-4000-8000-000000000101 not found or access denied',
  '(a) issue_invoice refuses C on the studio-B invoice');
SELECT throws_ok($$SELECT public.issue_invoice('81700000-0000-4000-8000-0000000001ff', NULL)$$, 'P0001',
  'issue_invoice: invoice 81700000-0000-4000-8000-0000000001ff not found or access denied',
  '(a) issue_invoice gives C the same refusal for an invoice that does not exist');
SELECT throws_ok($$SELECT public.record_invoice_payment('81700000-0000-4000-8000-000000000101', 100, 'check')$$, 'P0001',
  'record_invoice_payment: invoice 81700000-0000-4000-8000-000000000101 not found or access denied',
  '(a) record_invoice_payment refuses C on the studio-B invoice');
SELECT throws_ok($$SELECT public.void_invoice('81700000-0000-4000-8000-000000000101', 'cross-studio')$$, 'P0001',
  'void_invoice: invoice 81700000-0000-4000-8000-000000000101 not found or access denied',
  '(a) void_invoice refuses C on the studio-B invoice');
SELECT throws_ok($$SELECT * FROM public.add_invoice_billing_lines('81700000-0000-4000-8000-000000000101', '[]'::jsonb)$$, '42501',
  'add_invoice_billing_lines: invoice 81700000-0000-4000-8000-000000000101 not found or access denied',
  '(a) add_invoice_billing_lines refuses C on the studio-B invoice');

RESET ROLE;

-- ─── (b) D, the invoice's designer ─────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000101'), true,
  '(b) D, the designer, is admitted on her studio-B invoice');
SELECT lives_ok($$SELECT public.issue_invoice('81700000-0000-4000-8000-000000000104', NULL)$$,
  '(b) D issues her studio-B draft 104');

RESET ROLE;

-- ─── (c) O, owner of studio B ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a3","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000101'), true,
  '(c) the owner of studio B is admitted on the studio-B invoice');
SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000102'), false,
  '(c) the owner of studio B is refused on D''s studio-A invoice');
SELECT lives_ok($$SELECT public.void_invoice('81700000-0000-4000-8000-000000000104', 'owner voids D''s issued invoice')$$,
  '(c) the owner of studio B voids D''s issued studio-B invoice 104');
SELECT lives_ok($$SELECT public.issue_invoice('81700000-0000-4000-8000-000000000105', NULL)$$,
  '(c) the owner of studio B issues D''s studio-B draft 105');

RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT lives_ok($$SELECT public.void_invoice('81700000-0000-4000-8000-000000000105', 'designer voids the owner''s issue')$$,
  '(b) D voids studio-B invoice 105, which the owner issued');

RESET ROLE;

SELECT ok(
  (SELECT bool_and(status = 'void' AND invoice_number IS NOT NULL AND voided_at IS NOT NULL)
     FROM public.invoices
    WHERE id IN ('81700000-0000-4000-8000-000000000104', '81700000-0000-4000-8000-000000000105')),
  '104 and 105 were each issued (numbered) and then voided');
SELECT is(
  (SELECT status FROM public.invoices WHERE id = '81700000-0000-4000-8000-000000000101'),
  'draft', 'C''s refused acts left the studio-B invoice 101 a draft');

-- ─── (d) T, on the studio-B job's team ─────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a4","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000101'), true,
  '(d) a team member on the studio-B job is admitted');

RESET ROLE;

-- ─── (e) C on D's studio-A invoice, and on the studio-less one ─────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a2","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000102'), true,
  '(e) C is still admitted on D''s studio-A invoice');
SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000103'), false,
  'no studio: C, D''s peer in studio A, is refused on D''s studio-less invoice');

RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000103'), true,
  'no studio: D, the designer, is admitted on her studio-less invoice');

RESET ROLE;

-- ─── D leaves studio B: the job's team and B's owner keep the invoice ──────

UPDATE public.organization_members
   SET status = 'suspended'
 WHERE id = '81700000-0000-4000-8000-0000000000e2';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a4","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000101'), true,
  'departed designer: T, on the studio-B job''s team, is still admitted');

RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a3","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000101'), true,
  'departed designer: the owner of studio B is still admitted');

RESET ROLE;

-- ─── (h) issue_invoice asks for authority before the billing checks ────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a2","role":"authenticated"}';

SELECT is(pg_temp.issue_invoice_answer('81700000-0000-4000-8000-000000000106'),
  'P0001 issue_invoice: invoice <id> not found or access denied',
  '(h) issue_invoice refuses C on draft 106, which has pending linked time, with P0001 not found or access denied');
SELECT is(pg_temp.issue_invoice_answer('81700000-0000-4000-8000-000000000106'),
  pg_temp.issue_invoice_answer('81700000-0000-4000-8000-0000000001ff'),
  '(h) C gets the same code and words on draft 106 as for an invoice that does not exist');

RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT throws_ok($$SELECT public.issue_invoice('81700000-0000-4000-8000-000000000106', NULL)$$, '23514',
  'issue_invoice: linked time includes entries pending authorization or nonbillable',
  '(h) D, the designer, still meets the linked-time check after the guard');

RESET ROLE;

-- ─── (g) studio B suspended: its owner loses the invoice, D keeps it ───────
-- D's B seat is active again, so suspension alone separates O from 00397's
-- answer (_can_author_proposal admits a peer only in an active studio, and
-- the designer herself whatever the studio's status).

SET LOCAL request.jwt.claims = '{}';

UPDATE public.organization_members
   SET status = 'active'
 WHERE id = '81700000-0000-4000-8000-0000000000e2';
UPDATE public.organizations
   SET status = 'suspended'
 WHERE id = '81700000-0000-4000-8000-0000000000f2';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a3","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000101'), false,
  '(g) the owner of suspended studio B, who is not the designer, is refused on the studio-B invoice');

RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81700000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(public.can_manage_invoice('81700000-0000-4000-8000-000000000101'), true,
  '(g) D, the designer, is still admitted on her invoice in suspended studio B, as before 00817');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
