-- ═══════════════════════════════════════════════════════════════════════════
-- 00810 — The approved pricing snapshot and the post-approval change log
-- (pgTAP, US-37 #4, SQ-1106)
--
-- Studio A: owner D (designer, the job's lead) and client C (the frozen
-- decision lead) on Project P. Studio B: owner X (the outsider).
--
-- Cases, in order:
--   grants            team-read tables with RLS; snapshot + trigger internal;
--                     readers authenticated-only; the approval path calls the
--                     snapshot and stays private
--   before approval   an edit logs nothing; the reader returns NULL
--   plan_issue        a client approval of drawings takes no snapshot
--   budget_version    a client approval snapshots every live line (not the
--                     removed or not-selected ones) and names the decision
--                     and the approving client
--   after approval    an edit logs who, when, field, old and new; the events
--                     reader returns them; differs flips true, then back to
--                     false when the line returns to its approved value; a
--                     cost edit logs cost and the recomputed markup; a line
--                     kind edit and a raw server write are logged too
--   latest            the newest snapshot is the approved one
--   outsider/client   42501 on both readers and no rows from the tables
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT plan(28);

-- ── fixture ────────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('81000000-0000-4000-8000-0000000000a1', 'p810-designer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81000000-0000-4000-8000-0000000000a2', 'p810-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81000000-0000-4000-8000-0000000000a5', 'p810-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('81000000-0000-4000-8000-0000000000a1', 'p810-designer@test.invalid', 'P810 Designer', true),
  ('81000000-0000-4000-8000-0000000000a2', 'p810-client@test.invalid',   'P810 Client',   false),
  ('81000000-0000-4000-8000-0000000000a5', 'p810-outsider@test.invalid', 'P810 Outsider', true)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('81000000-0000-4000-8000-0000000000f1', 'design_studio', 'P810 Studio A', 'p810-studio-a-test', 'active'),
  ('81000000-0000-4000-8000-0000000000f2', 'design_studio', 'P810 Studio B', 'p810-studio-b-test', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('81000000-0000-4000-8000-0000000000e1', '81000000-0000-4000-8000-0000000000a1', '81000000-0000-4000-8000-0000000000f1', 'owner', 'active', now()),
  ('81000000-0000-4000-8000-0000000000e5', '81000000-0000-4000-8000-0000000000a5', '81000000-0000-4000-8000-0000000000f2', 'owner', 'active', now());

-- 00511: every project lead holds a designer-domain role.
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '81000000-0000-4000-8000-0000000000a1'::uuid, role.id, '81000000-0000-4000-8000-0000000000a1'::uuid
FROM public.roles AS role
WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
VALUES ('81000000-0000-4000-8000-0000000000c1', '81000000-0000-4000-8000-0000000000a1',
        '81000000-0000-4000-8000-0000000000a2', 'P810 Client', 'p810-client@test.invalid',
        'active', 'direct');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status, current_phase)
VALUES ('81000000-0000-4000-8000-000000000001', 'P810 Lake House',
        '81000000-0000-4000-8000-0000000000a1', '81000000-0000-4000-8000-0000000000a2',
        '81000000-0000-4000-8000-0000000000a1', '81000000-0000-4000-8000-0000000000f1',
        'active', 'design');

INSERT INTO public.project_phases (id, project_id, name, phase_key, status, sort_order, lane, follows_phase_id)
VALUES ('81000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001',
        'P810 approvals', 'p810-approvals', 'pending', 0, 'thread', NULL);

-- A drawing set (no money) and a published budget with its checkpoint.
INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash, set_checksum, sheet_count, created_by
) VALUES (
  '81000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000001', 1,
  'P810 issued set', 'p810-plan-1',
  encode(extensions.digest('p810-request-1'::bytea, 'sha256'), 'hex'),
  encode(extensions.digest('p810-artifact-1'::bytea, 'sha256'), 'hex'),
  4, '81000000-0000-4000-8000-0000000000a1'
);

INSERT INTO public.project_budget_versions (id, project_id, version, status, note, created_by)
VALUES ('81000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000001', 1,
        'draft', 'P810 budget', '81000000-0000-4000-8000-0000000000a1');
INSERT INTO public.project_budget_lines (
  id, budget_version_id, room_name, category, low_cents, target_cents, high_cents,
  scheduled_cents, authorized_cents, sort_order
) VALUES ('81000000-0000-4000-8000-000000000005', '81000000-0000-4000-8000-000000000004',
          'Living Room', 'Furnishings', 200000, 220000, 250000, 220000, 0, 0);
SELECT set_config('app.budget_publish_id', '81000000-0000-4000-8000-000000000004', true);
UPDATE public.project_budget_versions
SET status = 'published', low_total_cents = 200000, target_total_cents = 220000,
    high_total_cents = 250000, published_at = now()
WHERE id = '81000000-0000-4000-8000-000000000004';
SELECT set_config('app.budget_publish_id', '', true);
INSERT INTO public.project_budget_checkpoints (
  id, project_id, budget_version_id, checkpoint_code, snapshot_fingerprint, published_by
) VALUES (
  '81000000-0000-4000-8000-000000000006', '81000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000004', 'B-810',
  public._budget_version_fingerprint('81000000-0000-4000-8000-000000000004'),
  '81000000-0000-4000-8000-0000000000a1'
);

-- Lines: 101 sofa and 102 lamps are live; 103 is removed; 104 is not selected.
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, trade_price_cents,
  unit_price_cents, line_total_cents, design_disposition, removed_at, removed_by, removal_reason
) VALUES
  ('81000000-0000-4000-8000-000000000101', '81000000-0000-4000-8000-000000000001', 'P810 Sofa',
   'specified', 'fixed', 1, 100000, 150000, 150000, 'selected', NULL, NULL, NULL),
  ('81000000-0000-4000-8000-000000000102', '81000000-0000-4000-8000-000000000001', 'P810 Lamps',
   'specified', 'fixed', 2, 20000, 30000, 60000, 'selected', NULL, NULL, NULL),
  ('81000000-0000-4000-8000-000000000103', '81000000-0000-4000-8000-000000000001', 'P810 Removed rug',
   'specified', 'fixed', 1, 30000, 50000, 50000, 'selected', now(), '81000000-0000-4000-8000-0000000000a1', 'Client passed'),
  ('81000000-0000-4000-8000-000000000104', '81000000-0000-4000-8000-000000000001', 'P810 Passed chair',
   'specified', 'fixed', 1, 10000, 15000, 15000, 'not_selected', NULL, NULL, NULL);
SELECT set_config('app.ffe_mutation_rpc', '', true);

CREATE TEMP TABLE p810_created (label text PRIMARY KEY, payload jsonb NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE p810_tokens (label text PRIMARY KEY, decision_id uuid NOT NULL, updated_at timestamptz NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON p810_created, p810_tokens TO authenticated;

-- ── grants ─────────────────────────────────────────────────────────────────

SELECT ok(
  (SELECT count(*) FROM pg_class
   WHERE oid IN ('public.ffe_pricing_approvals'::regclass,
                 'public.ffe_pricing_approval_lines'::regclass,
                 'public.ffe_pricing_events'::regclass)
     AND relrowsecurity) = 3,
  'the three tables exist with row level security on'
);

SELECT ok(
  (SELECT bool_and(
     has_table_privilege('authenticated', t, 'SELECT')
     AND NOT has_table_privilege('authenticated', t, 'INSERT')
     AND NOT has_table_privilege('authenticated', t, 'UPDATE')
     AND NOT has_table_privilege('authenticated', t, 'DELETE')
     AND NOT has_table_privilege('anon', t, 'SELECT'))
   FROM unnest(ARRAY['public.ffe_pricing_approvals', 'public.ffe_pricing_approval_lines',
                     'public.ffe_pricing_events']) AS t),
  'authenticated may only read the three tables; anon may not touch them'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.snapshot_project_pricing(uuid,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.snapshot_project_pricing(uuid,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.ffe_pricing_events_log()', 'EXECUTE'),
  'the snapshot and the log trigger are internal'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.get_project_pricing_approval(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_ffe_pricing_events(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_project_pricing_approval(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_ffe_pricing_events(uuid,uuid)', 'EXECUTE'),
  'the two readers are authenticated-only'
);

SELECT ok(
  (SELECT prosrc LIKE '%PERFORM public.snapshot_project_pricing(v_decision.project_id, ''project_approval'', p_decision_id)%'
   FROM pg_proc
   WHERE oid = 'public._respond_project_approval_checked(uuid,text,uuid,timestamptz,text,text,text)'::regprocedure)
  AND NOT has_function_privilege('authenticated',
    'public._respond_project_approval_checked(uuid,text,uuid,timestamptz,text,text,text)', 'EXECUTE'),
  'the approval path calls the snapshot and stays private'
);

-- ── before approval (D) ────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT public.set_ffe_line_pricing('81000000-0000-4000-8000-000000000101', 'unit_client_price_cents', 160000);

SELECT is(
  (SELECT count(*)::integer FROM public.ffe_pricing_events
   WHERE project_id = '81000000-0000-4000-8000-000000000001'),
  0,
  'a pre-approval edit logs nothing'
);

SELECT is(
  public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001'),
  NULL::jsonb,
  'the reader returns NULL before any approval'
);

-- ── two approvals: the drawings, then the budget ───────────────────────────

SELECT public.set_project_decision_authority(
  '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-0000000000a2', NULL, 0
);

INSERT INTO p810_created (label, payload)
SELECT kind.label, public.create_project_approval_decision(
  '81000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'title', 'P810 ' || kind.label,
    'question', 'Approve the ' || kind.label || '?',
    'context', 'Client-safe P810 fixture.',
    'dueAt', (now() + interval '9 days')::text,
    'phaseId', '81000000-0000-4000-8000-000000000002',
    'sectionKey', 'project',
    'artifactKind', kind.artifact_kind,
    'artifactId', kind.artifact_id,
    'costCentsDelta', 0,
    'scheduleDaysDelta', 0,
    'leadTimeDaysDelta', 0
  ),
  'p810-create-' || kind.label,
  NULL
)
FROM (VALUES
  ('drawings', 'plan_issue', '81000000-0000-4000-8000-000000000003'::uuid),
  ('budget', 'budget_version', '81000000-0000-4000-8000-000000000004'::uuid)
) AS kind(label, artifact_kind, artifact_id)
ORDER BY kind.label DESC;

SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT public.confirm_project_decision_review(
  (created.payload->>'decisionId')::uuid,
  jsonb_build_object(
    'authorityRevision', (created.payload->>'authorityRevision')::integer,
    'artifactHash', created.payload->>'artifactHash',
    'reviewMethod', 'portal_clickthrough'
  ),
  'p810-confirm-' || created.label
)
FROM p810_created AS created
ORDER BY created.label DESC;

SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
INSERT INTO p810_tokens (label, decision_id, updated_at)
SELECT created.label, published.id, published.updated_at
FROM p810_created AS created
CROSS JOIN LATERAL public.publish_client_decision((created.payload->>'decisionId')::uuid) AS published
ORDER BY created.label DESC;

-- The client approves the drawings.
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT public.respond_project_approval(token.decision_id, '{"outcome":"approved"}'::jsonb,
                                       token.updated_at, 'p810-respond-drawings')
FROM p810_tokens AS token WHERE token.label = 'drawings';

RESET ROLE;

SELECT is(
  (SELECT count(*)::integer FROM public.ffe_pricing_approvals
   WHERE project_id = '81000000-0000-4000-8000-000000000001'),
  0,
  'approving the drawings (plan_issue) takes no pricing snapshot'
);

-- The client approves the budget.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT public.respond_project_approval(token.decision_id, '{"outcome":"approved"}'::jsonb,
                                       token.updated_at, 'p810-respond-budget')
FROM p810_tokens AS token WHERE token.label = 'budget';
RESET ROLE;

SELECT is(
  (SELECT concat_ws('|', count(*), min(approval.approval_source),
                    bool_and(approval.approval_ref = token.decision_id),
                    bool_and(approval.approved_by = '81000000-0000-4000-8000-0000000000a2'),
                    bool_and(approval.approved_at IS NOT NULL))
   FROM public.ffe_pricing_approvals AS approval
   CROSS JOIN p810_tokens AS token
   WHERE approval.project_id = '81000000-0000-4000-8000-000000000001'
     AND token.label = 'budget'),
  '1|project_approval|t|t|t',
  'approving the budget writes one approval naming the decision and the approving client'
);

SELECT is(
  (SELECT string_agg(concat_ws(':', right(line.item_id::text, 3), line.unit_client_cents,
                               line.quantity, line.line_total_cents), ',' ORDER BY line.item_id)
   FROM public.ffe_pricing_approval_lines AS line
   JOIN public.ffe_pricing_approvals AS approval ON approval.id = line.approval_id
   WHERE approval.project_id = '81000000-0000-4000-8000-000000000001'),
  '101:160000:1:160000,102:30000:2:60000',
  'approving snapshots every live line at its client price, quantity and total (not removed or passed lines)'
);

SELECT is(
  (SELECT count(*)::integer FROM public.ffe_pricing_events
   WHERE project_id = '81000000-0000-4000-8000-000000000001'),
  0,
  'the approval itself logs no pricing change'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT concat_ws('|', snapshot->>'approvedTotalCents', jsonb_array_length(snapshot->'lines'),
                    (SELECT bool_or((line->>'differs')::boolean) FROM jsonb_array_elements(snapshot->'lines') AS line),
                    snapshot->>'approvalSource', snapshot ? 'approvedAt')
   FROM (SELECT public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001') AS snapshot) AS reader),
  '220000|2|f|project_approval|t',
  'the team reads the snapshot: the approved total, two lines, nothing differs'
);

-- ── after approval: the lamps go from 2 to 3 (D) ───────────────────────────

SELECT public.set_ffe_line_pricing('81000000-0000-4000-8000-000000000102', 'quantity', 3);

RESET ROLE;

SELECT is(
  (SELECT string_agg(concat_ws(':', event.field, event.old_value, event.new_value), ',' ORDER BY event.field)
   FROM public.ffe_pricing_events AS event
   WHERE event.item_id = '81000000-0000-4000-8000-000000000102'
     AND event.actor = '81000000-0000-4000-8000-0000000000a1'
     AND event.project_id = '81000000-0000-4000-8000-000000000001'
     AND event.at >= (SELECT max(approved_at) FROM public.ffe_pricing_approvals
                      WHERE project_id = '81000000-0000-4000-8000-000000000001')),
  'line_total_cents:60000:90000,quantity:2:3',
  'a post-approval edit logs who, when, which field, the old and the new value'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT string_agg(concat_ws(':', event->>'field', event->>'oldValue', event->>'newValue',
                               event->>'actorName', event->>'actorId', event ? 'at', event ? 'id',
                               right(event->>'itemId', 3)), ',' ORDER BY event->>'field')
   FROM jsonb_array_elements(public.get_ffe_pricing_events(
     '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000102')) AS event),
  'line_total_cents:60000:90000:P810 Designer:81000000-0000-4000-8000-0000000000a1:t:t:102,'
  || 'quantity:2:3:P810 Designer:81000000-0000-4000-8000-0000000000a1:t:t:102',
  'the events reader returns the changes with who made them'
);

SELECT is(
  (SELECT string_agg(concat_ws(':', right(line->>'itemId', 3), line->>'differs'), ',' ORDER BY line->>'itemId')
   FROM jsonb_array_elements(
     public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'lines') AS line),
  '101:false,102:true',
  'differs flips true for the changed line only'
);

SELECT public.set_ffe_line_pricing('81000000-0000-4000-8000-000000000102', 'quantity', 2);

SELECT is(
  (SELECT string_agg(concat_ws(':', right(line->>'itemId', 3), line->>'differs'), ',' ORDER BY line->>'itemId')
   FROM jsonb_array_elements(
     public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'lines') AS line),
  '101:false,102:false',
  'differs flips back to false when the line returns to its approved value'
);

SELECT is(
  jsonb_array_length(public.get_ffe_pricing_events(
    '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000102')),
  4,
  'the return to the approved value is logged too'
);

-- A cost edit under a priced line keeps the client price; the markup that
-- zzz_ffe_markup_truth_trg recomputes is what the log sees.
SELECT public.set_ffe_line_pricing('81000000-0000-4000-8000-000000000101', 'unit_cost_cents', 110000);

SELECT is(
  (SELECT string_agg(event->>'field', ',' ORDER BY event->>'field')
   FROM jsonb_array_elements(public.get_ffe_pricing_events(
     '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000101')) AS event),
  'markup_percent,trade_price_cents',
  'a cost edit logs the cost and the recomputed markup'
);

SELECT is(
  (SELECT event->>'newValue'
   FROM jsonb_array_elements(public.get_ffe_pricing_events(
     '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000101')) AS event
   WHERE event->>'field' = 'markup_percent'
   ORDER BY event->>'at' DESC LIMIT 1),
  (SELECT markup_percent::text FROM public.project_ffe_items WHERE id = '81000000-0000-4000-8000-000000000101'),
  'the logged markup is the final stored markup'
);

SELECT public.set_ffe_line_kind('81000000-0000-4000-8000-000000000102', 'delivery');

SELECT is(
  (SELECT count(*)::integer
   FROM jsonb_array_elements(public.get_ffe_pricing_events(
     '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000102')) AS event
   WHERE event->>'field' = 'line_kind' AND event->>'oldValue' = 'goods' AND event->>'newValue' = 'delivery'),
  1,
  'a line kind edit is logged'
);

-- A raw server writer, with no signed-in user, is logged with no actor.
RESET ROLE;
SET LOCAL request.jwt.claims = '';
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE public.project_ffe_items
SET unit_price_cents = 170000, line_total_cents = 170000
WHERE id = '81000000-0000-4000-8000-000000000101';
SELECT set_config('app.ffe_mutation_rpc', '', true);

SELECT is(
  (SELECT count(*)::integer FROM public.ffe_pricing_events
   WHERE item_id = '81000000-0000-4000-8000-000000000101' AND field = 'unit_price_cents'
     AND actor IS NULL AND old_value = '160000' AND new_value = '170000'),
  1,
  'a raw server write is logged too, with no actor'
);

-- ── the latest snapshot is the approved one ────────────────────────────────

SELECT public.snapshot_project_pricing(
  '81000000-0000-4000-8000-000000000001', 'project_approval', '81000000-0000-4000-8000-0000000000d9'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT concat_ws('|', snapshot->>'approvalRef', snapshot->>'approvedTotalCents',
                    (SELECT bool_or((line->>'differs')::boolean) FROM jsonb_array_elements(snapshot->'lines') AS line))
   FROM (SELECT public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001') AS snapshot) AS reader),
  '81000000-0000-4000-8000-0000000000d9|230000|f',
  'the newest approval is the approved snapshot'
);

-- ── the outsider (X) ───────────────────────────────────────────────────────

SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a5","role":"authenticated"}';

SELECT throws_ok(
  $$SELECT public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'an outsider is refused the snapshot (42501)'
);

SELECT throws_ok(
  $$SELECT public.get_ffe_pricing_events('81000000-0000-4000-8000-000000000001', NULL)$$,
  '42501', NULL, 'an outsider is refused the change log (42501)'
);

SELECT is(
  (SELECT count(*) FROM public.ffe_pricing_approvals)
  + (SELECT count(*) FROM public.ffe_pricing_approval_lines)
  + (SELECT count(*) FROM public.ffe_pricing_events),
  0::bigint,
  'an outsider reads no rows from the three tables'
);

-- ── the client (C) ─────────────────────────────────────────────────────────

SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

SELECT throws_ok(
  $$SELECT public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'the client is refused the snapshot (42501)'
);

SELECT throws_ok(
  $$SELECT public.get_ffe_pricing_events('81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000101')$$,
  '42501', NULL, 'the client is refused the change log (42501)'
);

SELECT is(
  (SELECT count(*) FROM public.ffe_pricing_approvals)
  + (SELECT count(*) FROM public.ffe_pricing_approval_lines)
  + (SELECT count(*) FROM public.ffe_pricing_events),
  0::bigint,
  'the client reads no rows from the three tables'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
