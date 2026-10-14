-- ═══════════════════════════════════════════════════════════════════════════
-- 00791 — desk_read RLS parity (pgTAP, US-34 N8)
--
-- desk_read is SECURITY INVOKER: every row it answers must be one the caller's
-- own RLS already admits, no more and no fewer. For three identities (the
-- studio owner, a co-member admin of the same studio, and an outsider from
-- another studio) this compares each of the 25 feeds, row for row, against
-- an independent direct read of the same tables under the same JWT. Fixtures
-- give every feed at least one owner-visible row, so no parity check passes
-- by comparing two empty sets. The outsider must get nothing at all.
--
-- Run: supabase test db supabase/tests/desk_read_test.sql
--  or: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/desk_read_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(90);

-- ── grants and security ────────────────────────────────────────────────────
SELECT ok(
  has_function_privilege('authenticated', 'public.desk_read(uuid)', 'EXECUTE'),
  'authenticated can call desk_read'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.desk_read(uuid)', 'EXECUTE'),
  'anon cannot call desk_read'
);
SELECT ok(
  NOT has_function_privilege('service_role', 'public.desk_read(uuid)', 'EXECUTE'),
  'service_role is not granted desk_read'
);
SELECT ok(
  NOT (SELECT p.prosecdef FROM pg_proc AS p WHERE p.oid = 'public.desk_read(uuid)'::regprocedure),
  'desk_read is SECURITY INVOKER, so RLS decides every row'
);

-- ── fixtures (as postgres): one owner-visible row for each otherwise-empty
--    feed, on Leah's Wren Street Library job in studio b0…01 ─────────────────
-- Leah (owner)          a0000000-0000-0000-0000-000000000004
-- Studio Manager (admin) a0000000-0000-0000-0000-000000000003
-- Outsider (other studio) cf100000-0000-4000-8000-000000000001
INSERT INTO public.purchase_orders
  (id, designer_id, project_id, vendor_id, payment_pattern, status, held_at, held_by, hold_note, total_cents)
VALUES
  ('d7910000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000004',
   'f1900000-0000-4000-8000-000000000003', 'e2188953-ccdb-4489-a24a-d2bc5478ffcd',
   'fifty_fifty', 'held_for_release', now(), 'a0000000-0000-0000-0000-000000000004',
   'Over the release limit', 120000);

INSERT INTO public.receiving_inspections (id, purchase_order_id, inspected_by, outcome, inspected_at)
VALUES ('d7910000-0000-4000-8000-000000000002', 'f1900000-0000-4000-8000-000000000023',
        'a0000000-0000-0000-0000-000000000004', 'damaged', now() - interval '1 day');
INSERT INTO public.damage_claims (id, receiving_inspection_id, state)
VALUES ('d7910000-0000-4000-8000-000000000003', 'd7910000-0000-4000-8000-000000000002', 'drafted');
INSERT INTO public.procurement_notifications (user_id, kind, subject_purchase_order_id)
VALUES ('a0000000-0000-0000-0000-000000000004', 'claim_window_closing',
        'f1900000-0000-4000-8000-000000000023');

INSERT INTO public.match_ceremonies (id, lead_id, designer_id, state)
VALUES ('d7910000-0000-4000-8000-000000000004', 'f38c9353-07f8-4222-89ae-58d8bbc8d6b9',
        'a0000000-0000-0000-0000-000000000004', 'draft');

INSERT INTO public.procurement_exceptions (id, project_id, type, status)
VALUES ('d7910000-0000-4000-8000-000000000005', 'f1900000-0000-4000-8000-000000000003', 'damage', 'open');

INSERT INTO public.sample_requests (id, organization_id, project_id, kind, status, return_by)
VALUES ('d7910000-0000-4000-8000-000000000006', 'b0000000-0000-0000-0000-000000000001',
        'f1900000-0000-4000-8000-000000000003', 'memo', 'requested',
        (now() AT TIME ZONE 'UTC')::date + 3);

INSERT INTO public.vendor_quotes (id, vendor_id, project_id, received_on, valid_until)
VALUES ('d7910000-0000-4000-8000-000000000007', 'e2188953-ccdb-4489-a24a-d2bc5478ffcd',
        'f1900000-0000-4000-8000-000000000003',
        (now() AT TIME ZONE 'UTC')::date - 10, (now() AT TIME ZONE 'UTC')::date + 1);

INSERT INTO public.studio_purchases
  (id, kind, payee_name, purchased_on, amount_cents, project_id, returnable, return_by, status)
VALUES ('d7910000-0000-4000-8000-000000000008', 'one_off', 'Estate sale',
        (now() AT TIME ZONE 'UTC')::date - 2, 4500, 'f1900000-0000-4000-8000-000000000003',
        true, (now() AT TIME ZONE 'UTC')::date + 1, 'recorded');

INSERT INTO public.schedule_proposals (id, project_id, source_event, state)
VALUES ('d7910000-0000-4000-8000-000000000009', 'f1900000-0000-4000-8000-000000000003',
        'po-sent', 'proposed');

INSERT INTO public.po_payments (id, purchase_order_id, kind, state, paid_date, amount_cents)
VALUES ('d7910000-0000-4000-8000-000000000010', 'f1900000-0000-4000-8000-000000000023',
        'milestone', 'paid', (now() AT TIME ZONE 'UTC')::date, 1000);

INSERT INTO public.invoices
  (id, designer_id, project_id, status, invoice_number, paid_at, total_cents, amount_paid_cents)
VALUES ('d7910000-0000-4000-8000-000000000011', 'a0000000-0000-0000-0000-000000000004',
        'f1900000-0000-4000-8000-000000000003', 'paid', 'SQ991-1', now(), 5000, 5000);

INSERT INTO public.outbound_drafts
  (id, organization_id, project_id, kind, channel, recipient_kind, status, to_address,
   subject, body, ref_type, ref_id, dedupe_key)
VALUES ('d7910000-0000-4000-8000-000000000012', 'b0000000-0000-0000-0000-000000000001',
        'f1900000-0000-4000-8000-000000000003', 'invoice_reminder', 'email', 'client',
        'awaiting_review', 'client@example.test', 'A reminder', 'Please review.',
        'invoice', 'd7910000-0000-4000-8000-000000000011', 'sq991-desk-read');

INSERT INTO public.item_feedback (proposal_item_id, client_id, verdict)
VALUES ('6ecbdf9a-f79a-43af-a22e-016e17ad27b4', 'a0000000-0000-0000-0000-000000000005', 'rejected');
INSERT INTO public.proposal_boards (id, proposal_id, name)
VALUES ('d7910000-0000-4000-8000-000000000013', 'b3900000-0000-4000-8000-000000000001', 'Pins');
INSERT INTO public.proposal_board_items (id, board_id, type)
VALUES ('d7910000-0000-4000-8000-000000000014', 'd7910000-0000-4000-8000-000000000013', 'note');
INSERT INTO public.item_feedback (board_item_id, client_id, verdict)
VALUES ('d7910000-0000-4000-8000-000000000014', 'a0000000-0000-0000-0000-000000000005', 'rejected');

-- ── the parity harness: each feed's row keys from desk_read beside the same
--    keys read straight from the tables, both under the caller's JWT ────────
CREATE FUNCTION pg_temp.desk_sorted(p_keys text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(k ORDER BY k), '[]'::jsonb) FROM unnest(p_keys) AS k
$$;

-- A feed that answered {error} becomes one keyless row, so parity fails loudly.
CREATE FUNCTION pg_temp.desk_rows(p_read jsonb, p_feed text) RETURNS SETOF jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT e FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_read->p_feed) = 'array' THEN p_read->p_feed
         ELSE jsonb_build_array(p_read->p_feed) END) AS e
$$;

CREATE FUNCTION pg_temp.desk_parity(p_read jsonb)
RETURNS TABLE (feed text, rpc jsonb, direct jsonb)
LANGUAGE sql STABLE AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'UTC')::date AS today)
  SELECT v.feed, v.rpc, v.direct
  FROM t, LATERAL (VALUES
    ('engagements',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'engagement_id' FROM pg_temp.desk_rows(p_read, 'engagements') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT d.engagement_id::text FROM public.document_state AS d))),
    ('delivery_events',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'event_id' FROM pg_temp.desk_rows(p_read, 'delivery_events') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT de.event_id::text FROM public.delivery_events AS de
                               WHERE de.event_date BETWEEN t.today AND t.today + 120))),
    ('receivables',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'receivables') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT i.id::text FROM public.invoices AS i
                               WHERE i.status IN ('sent', 'partially_paid')))),
    ('flagged_lines',
     pg_temp.desk_sorted(ARRAY(SELECT e#>>'{proposal_items,proposal_id}' FROM pg_temp.desk_rows(p_read, 'flagged_lines') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT pi.proposal_id::text
                               FROM public.item_feedback AS f
                               JOIN public.proposal_items AS pi ON pi.id = f.proposal_item_id
                               JOIN public.proposals AS pr ON pr.id = pi.proposal_id
                               WHERE f.verdict = 'rejected' AND f.resolved_at IS NULL))),
    ('flagged_board_pins',
     pg_temp.desk_sorted(ARRAY(SELECT e#>>'{proposal_board_items,proposal_boards,proposal_id}'
                               FROM pg_temp.desk_rows(p_read, 'flagged_board_pins') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT b.proposal_id::text
                               FROM public.item_feedback AS f
                               JOIN public.proposal_board_items AS bi ON bi.id = f.board_item_id
                               JOIN public.proposal_boards AS b ON b.id = bi.board_id
                               JOIN public.proposals AS pr ON pr.id = b.proposal_id
                               WHERE f.verdict = 'rejected' AND f.resolved_at IS NULL))),
    ('ceremonies',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'ceremonies') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT mc.id::text FROM public.match_ceremonies AS mc))),
    ('phases',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'phases') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT ph.id::text FROM public.project_phases AS ph))),
    ('milestones',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'milestones') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT m.id::text FROM public.schedule_milestones AS m))),
    ('project_starts',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'project_starts') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT p.id::text FROM public.projects AS p))),
    ('schedule_proposals',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'schedule_proposals') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT sp.id::text FROM public.schedule_proposals AS sp
                               WHERE sp.state = 'proposed'))),
    ('claim_notices',
     pg_temp.desk_sorted(ARRAY(SELECT e#>>'{purchase_order,id}' FROM pg_temp.desk_rows(p_read, 'claim_notices') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT (SELECT po.id::text FROM public.purchase_orders AS po
                                       WHERE po.id = n.subject_purchase_order_id)
                               FROM public.procurement_notifications AS n
                               WHERE n.kind = 'claim_window_closing'
                                 AND n.created_at >= now() - interval '60 days'))),
    ('claim_deadlines',
     pg_temp.desk_sorted(ARRAY(SELECT (e->>'purchase_order_id') || '|' || coalesce(e->>'vendor_deadline', '-')
                               FROM pg_temp.desk_rows(p_read, 'claim_deadlines') AS e)),
     pg_temp.desk_sorted(ARRAY(
       SELECT po.id::text || '|' || coalesce(to_jsonb(dl.vendor_deadline)#>>'{}', '-')
       FROM (SELECT DISTINCT po.id
             FROM public.procurement_notifications AS n
             JOIN public.purchase_orders AS po ON po.id = n.subject_purchase_order_id
             JOIN public.receiving_inspections AS ri ON ri.purchase_order_id = po.id
             JOIN public.damage_claims AS dc ON dc.receiving_inspection_id = ri.id
             WHERE n.kind = 'claim_window_closing'
               AND n.created_at >= now() - interval '60 days'
               AND dc.state = 'drafted') AS po
       LEFT JOIN LATERAL public.procurement_claim_deadline(po.id) AS dl ON true))),
    ('payment_notices',
     pg_temp.desk_sorted(ARRAY(SELECT e#>>'{payment,id}' FROM pg_temp.desk_rows(p_read, 'payment_notices') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT pay.id::text
                               FROM public.procurement_notifications AS n
                               JOIN public.po_payments AS pay ON pay.id = n.subject_payment_id
                               WHERE pay.state IN ('pending', 'due')
                                 AND n.kind IN ('deposit_due', 'balance_due', 'milestone_due', 'payment_failed')))),
    ('returns',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'returns') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT s.id::text FROM public.studio_purchases AS s
                               WHERE s.status IN ('recorded', 'billed') AND s.returnable
                                 AND s.returned_on IS NULL
                                 AND s.return_by BETWEEN t.today - 1 AND t.today + 4))),
    ('drafts',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'drafts') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT d.id::text FROM public.procurement_drafts AS d
                               WHERE d.status IN ('awaiting_review', 'sending')))),
    ('outbound_drafts',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'outbound_drafts') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT od.id::text FROM public.outbound_drafts AS od
                               WHERE od.status IN ('awaiting_review', 'sending')))),
    ('quotes',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'quotes') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT q.id::text FROM public.vendor_quotes AS q
                               WHERE q.superseded_by IS NULL
                                 AND q.valid_until BETWEEN t.today - 1 AND t.today + 2))),
    ('exceptions',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'exceptions') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT x.id::text FROM public.procurement_exceptions AS x
                               WHERE x.status = 'open' AND x.type <> 'ack_discrepancy'))),
    ('held',
     pg_temp.desk_sorted(ARRAY(SELECT (e->>'id') || '|' || (e->>'viewerCanRelease')
                               FROM pg_temp.desk_rows(p_read, 'held') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT po.id::text || '|' ||
                                      coalesce(p.studio_id IS NOT NULL
                                               AND public.is_org_admin_or_owner(p.studio_id), false)::text
                               FROM public.purchase_orders AS po
                               LEFT JOIN public.projects AS p ON p.id = po.project_id
                               WHERE po.status = 'held_for_release' AND po.project_id IS NOT NULL))),
    ('samples',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'samples') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT s.id::text FROM public.sample_requests AS s
                               WHERE s.status IN ('requested', 'received') AND s.return_by IS NOT NULL))),
    ('live_proposals',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'live_proposals') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT pr.id::text FROM public.proposals AS pr WHERE pr.project_id IS NOT NULL))),
    ('paid_invoices',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'paid_invoices') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT i.id::text FROM public.invoices AS i
                               WHERE i.status = 'paid' AND i.paid_at >= now() - interval '8 days'))),
    ('paid_po_payments',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'paid_po_payments') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT pay.id::text FROM public.po_payments AS pay
                               WHERE pay.state = 'paid' AND pay.paid_date >= t.today - 8))),
    ('sent_purchase_orders',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'sent_purchase_orders') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT po.id::text FROM public.purchase_orders AS po
                               WHERE po.sent_at IS NOT NULL
                                 AND po.status NOT IN ('delivered', 'cancelled')))),
    ('leads',
     pg_temp.desk_sorted(ARRAY(SELECT e->>'id' FROM pg_temp.desk_rows(p_read, 'leads') AS e)),
     pg_temp.desk_sorted(ARRAY(SELECT l.id::text FROM public.leads AS l
                               WHERE l.status IN ('new', 'viewed', 'contacted'))))
  ) AS v (feed, rpc, direct)
$$;

CREATE TEMP TABLE desk_reads (who text, read jsonb);
CREATE TEMP TABLE desk_parity (who text, feed text, rpc jsonb, direct jsonb);
GRANT ALL ON desk_reads, desk_parity TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.desk_sorted(text[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.desk_rows(jsonb, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.desk_parity(jsonb) TO PUBLIC;

-- ── read as each identity ──────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
INSERT INTO desk_reads SELECT 'owner', public.desk_read();
INSERT INTO desk_parity SELECT 'owner', p.* FROM desk_reads AS r, pg_temp.desk_parity(r.read) AS p WHERE r.who = 'owner';
INSERT INTO desk_reads SELECT 'owner, one job', public.desk_read('f1900000-0000-4000-8000-000000000003');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
INSERT INTO desk_reads SELECT 'co-member', public.desk_read();
INSERT INTO desk_parity SELECT 'co-member', p.* FROM desk_reads AS r, pg_temp.desk_parity(r.read) AS p WHERE r.who = 'co-member';
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}';
INSERT INTO desk_reads SELECT 'outsider', public.desk_read();
INSERT INTO desk_parity SELECT 'outsider', p.* FROM desk_reads AS r, pg_temp.desk_parity(r.read) AS p WHERE r.who = 'outsider';
RESET ROLE;

-- ── shape ──────────────────────────────────────────────────────────────────
SELECT is(
  ARRAY(SELECT k.key FROM desk_reads AS r, jsonb_each(r.read) AS k WHERE r.who = 'owner' ORDER BY k.key),
  ARRAY['ceremonies', 'claim_deadlines', 'claim_notices', 'delivery_events', 'drafts',
        'engagements', 'exceptions', 'flagged_board_pins', 'flagged_lines', 'held', 'leads',
        'live_proposals', 'milestones', 'outbound_drafts', 'paid_invoices', 'paid_po_payments',
        'payment_notices', 'phases', 'project_starts', 'quotes', 'receivables', 'returns',
        'samples', 'schedule_proposals', 'sent_purchase_orders'],
  'desk_read answers exactly the 25 Desk feeds'
);

SELECT is(
  ARRAY(SELECT k.key FROM jsonb_each(r.read) AS k WHERE jsonb_typeof(k.value) <> 'array' ORDER BY k.key),
  '{}'::text[],
  format('%s: every feed answered rows, none an error', r.who)
)
FROM desk_reads AS r
ORDER BY r.who;

-- ── RLS parity: 3 identities x 25 feeds ────────────────────────────────────
SELECT is((SELECT count(*)::int FROM desk_parity), 75, 'three identities x 25 feeds compared');

SELECT is(p.rpc, p.direct, format('%s: desk_read %s matches the direct read', p.who, p.feed))
FROM desk_parity AS p
ORDER BY p.who, p.feed;

SELECT is(
  ARRAY(SELECT k.key FROM desk_reads AS r, jsonb_each(r.read) AS k
        WHERE r.who = 'owner' AND jsonb_array_length(k.value) = 0 ORDER BY k.key),
  '{}'::text[],
  'owner: every feed carries a row, so no parity check compares two empty sets'
);

SELECT is(
  (SELECT sum(jsonb_array_length(k.value))::int FROM desk_reads AS r, jsonb_each(r.read) AS k
   WHERE r.who = 'outsider'),
  0,
  'outsider from another studio gets nothing from any feed'
);

SELECT is(
  (SELECT (h->>'viewerCanRelease')::boolean
   FROM desk_reads AS r, jsonb_array_elements(r.read->'held') AS h
   WHERE r.who = 'co-member' AND h->>'id' = 'd7910000-0000-4000-8000-000000000001'),
  true,
  'co-member admin sees the studio''s held PO and may release it'
);

-- ── scoped read: one job ───────────────────────────────────────────────────
SELECT is(
  ARRAY(SELECT e->>'engagement_id' FROM desk_reads AS r, jsonb_array_elements(r.read->'engagements') AS e
        WHERE r.who = 'owner, one job'),
  ARRAY['f1900000-0000-4000-8000-000000000003'],
  'desk_read(engagement) answers that one engagement'
);

SELECT is(
  ARRAY(SELECT DISTINCT coalesce(e->>'project_id', e->>'projectId', e#>>'{purchase_order,project_id}')
        FROM desk_reads AS r,
             jsonb_each(r.read) AS k,
             jsonb_array_elements(k.value) AS e
        WHERE r.who = 'owner, one job'
          AND k.key IN ('receivables', 'phases', 'schedule_proposals', 'claim_notices',
                        'payment_notices', 'returns', 'drafts', 'outbound_drafts', 'quotes',
                        'exceptions', 'held', 'samples', 'live_proposals', 'paid_invoices',
                        'paid_po_payments', 'sent_purchase_orders')),
  ARRAY['f1900000-0000-4000-8000-000000000003'],
  'desk_read(engagement) keeps every job-keyed feed to that job, and finds its rows'
);

SELECT * FROM finish();
ROLLBACK;
