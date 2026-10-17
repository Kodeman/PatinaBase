-- ═══════════════════════════════════════════════════════════════════════════
-- 00810 — What the client approved and the post-approval change log
-- (pgTAP, US-37 #4, SQ-1106; repaired by SQ-1169 for Astra SQ-1168 and by
-- SQ-1194 for Astra SQ-1190)
--
-- Studio A: owner D (designer, the job's lead) and client C (the frozen
-- decision lead) on Project P. Studio B: owner X (the outsider). Last, a
-- studio-less job P9 of D's, with household client H and Studio A teammate T.
--
-- Cases, in order:
--   grants            team-read tables with RLS; snapshot + trigger internal;
--                     readers authenticated-only; both approval paths record
--                     and stay private; the job label lock comes first in
--                     the approval path and in every pricing writer (F2)
--   before approval   an edit logs nothing; the reader returns NULL
--   plan_issue        a client approval of drawings records nothing
--   budget_version    records the approval event with no lines (F1)
--   spec book         records the edition's frozen client lines: frozen
--                     price, quantity, implied total and currency, only lines
--                     the client PDF priced; live edits before it do not
--                     count; per-currency totals (F1, F3); a replay records
--                     nothing new; a masked-price edition records no lines;
--                     a line added after it is not in the baseline
--   after approval    edits log who, when, field, old and new; a currency
--                     change logs one event (SQ-1190 F3); differs flips on
--                     unit, quantity, total and currency, each on its own
--   option consent    apply_client_decision's product option records its
--                     one line only (F4)
--   tie-break         equal approved_at falls back to the id
--   interleave        a line edit and a labor price edit each wait on the
--                     job label lock held by an open approval, then are
--                     logged (F2, dblink)
--   outsider/client   42501 on both readers and no rows from the tables
--   studio-less job   a client who shares an unrelated organization with the
--                     lead reads nothing and is refused; the lead and her
--                     design-studio teammate still read (SQ-1190 F1)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT plan(54);

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

-- Two issued client editions of the job's one spec book: "book" (revision 1)
-- prints client prices; "masked" (revision 2) is printed under a client
-- profile that hides them.
-- Book lines: 101 sofa (frozen at 100000, below its live price), 102 lamps,
-- 105 an EUR table under allowances (frozen currency in lower case), 107
-- vendor-only and 108 unpriced (neither printed with a client price).
INSERT INTO public.spec_book_templates (
  id, template_key, version, studio_id, name, page_grammar,
  audience_profiles, required_field_rules, visibility_rules, created_by
) VALUES (
  '81000000-0000-4000-8000-000000000201', 'p810.pricing', 1,
  '81000000-0000-4000-8000-0000000000f1', 'P810 spec template',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  '81000000-0000-4000-8000-0000000000a1'
);

INSERT INTO public.spec_books (id, project_id, title, template_id, default_audiences, created_by)
VALUES
  ('81000000-0000-4000-8000-000000000211', '81000000-0000-4000-8000-000000000001', 'P810 client book',
   '81000000-0000-4000-8000-000000000201', ARRAY['client']::text[], '81000000-0000-4000-8000-0000000000a1');

INSERT INTO public.project_documents (
  id, project_id, title, doc_type, storage_path, status, uploaded_by,
  section_key, client_visible, size_bytes
) VALUES
  ('81000000-0000-4000-8000-000000000221', '81000000-0000-4000-8000-000000000001', 'P810 client book PDF',
   'pdf', 'p810/spec-client.pdf', 'ready', '81000000-0000-4000-8000-0000000000a1', 'spec-book', true, 4096),
  ('81000000-0000-4000-8000-000000000222', '81000000-0000-4000-8000-000000000001', 'P810 masked book PDF',
   'pdf', 'p810/spec-masked.pdf', 'ready', '81000000-0000-4000-8000-0000000000a1', 'spec-book', true, 4096);

INSERT INTO public.spec_book_revisions (
  id, spec_book_id, revision_number, idempotency_key, issue_type, status,
  requested_audiences, template_snapshot, render_snapshot,
  snapshot_checksum, created_by, issued_at
) VALUES
  ('81000000-0000-4000-8000-000000000231', '81000000-0000-4000-8000-000000000211', 1, 'p810-book-1',
   'full', 'issued', ARRAY['client']::text[], '{}'::jsonb,
   jsonb_build_object(
     'template', jsonb_build_object('audience_profiles',
       jsonb_build_object('client', jsonb_build_object('allow', jsonb_build_array('name', 'quantity', 'clientPrice')))),
     'items', jsonb_build_array(
       jsonb_build_object('ffeItemId', '81000000-0000-4000-8000-000000000101', 'quantity', 1,
                          'pricing', jsonb_build_object('clientPriceCents', 100000, 'currency', 'USD')),
       jsonb_build_object('ffeItemId', '81000000-0000-4000-8000-000000000102', 'quantity', 2,
                          'pricing', jsonb_build_object('clientPriceCents', 30000, 'currency', 'USD')),
       jsonb_build_object('ffeItemId', '81000000-0000-4000-8000-000000000107', 'quantity', 1,
                          'audiences', jsonb_build_array('vendor'),
                          'pricing', jsonb_build_object('clientPriceCents', 5000)),
       jsonb_build_object('ffeItemId', '81000000-0000-4000-8000-000000000108', 'quantity', 1,
                          'pricing', jsonb_build_object('tradePriceCents', 5000))
     ),
     'allowances', jsonb_build_array(
       jsonb_build_object('ffeItemId', '81000000-0000-4000-8000-000000000105', 'quantity', 1,
                          'pricing', jsonb_build_object('clientPriceCents', 40000, 'currency', 'eur'))
     ),
     'tbd', jsonb_build_array()
   ),
   repeat('e', 64), '81000000-0000-4000-8000-0000000000a1', now()),
  ('81000000-0000-4000-8000-000000000232', '81000000-0000-4000-8000-000000000211', 2, 'p810-masked-2',
   'full', 'issued', ARRAY['client']::text[], '{}'::jsonb,
   jsonb_build_object(
     'template', jsonb_build_object('audienceProfiles',
       jsonb_build_object('client', jsonb_build_object('allow', jsonb_build_array('name', 'quantity')))),
     'items', jsonb_build_array(
       jsonb_build_object('ffeItemId', '81000000-0000-4000-8000-000000000101', 'quantity', 1,
                          'pricing', jsonb_build_object('clientPriceCents', 999, 'currency', 'USD'))
     )
   ),
   repeat('f', 64), '81000000-0000-4000-8000-0000000000a1', now());

INSERT INTO public.spec_book_artifacts (
  id, revision_id, audience, status, project_document_id, storage_path,
  checksum_sha256, size_bytes, rendered_at
) VALUES
  ('81000000-0000-4000-8000-000000000241', '81000000-0000-4000-8000-000000000231', 'client', 'ready',
   '81000000-0000-4000-8000-000000000221', 'p810/spec-client.pdf', repeat('1', 64), 4096, now()),
  ('81000000-0000-4000-8000-000000000242', '81000000-0000-4000-8000-000000000232', 'client', 'ready',
   '81000000-0000-4000-8000-000000000222', 'p810/spec-masked.pdf', repeat('2', 64), 4096, now());

-- Live lines: 101 sofa, 102 lamps, 105 EUR table, 106 a line the book does
-- not list.
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, trade_price_cents,
  unit_price_cents, line_total_cents, currency, design_disposition
) VALUES
  ('81000000-0000-4000-8000-000000000101', '81000000-0000-4000-8000-000000000001', 'P810 Sofa',
   'specified', 'fixed', 1, 100000, 150000, 150000, 'USD', 'selected'),
  ('81000000-0000-4000-8000-000000000102', '81000000-0000-4000-8000-000000000001', 'P810 Lamps',
   'specified', 'fixed', 2, 20000, 30000, 60000, 'USD', 'selected'),
  ('81000000-0000-4000-8000-000000000105', '81000000-0000-4000-8000-000000000001', 'P810 Paris table',
   'specified', 'fixed', 1, 30000, 40000, 40000, 'EUR', 'selected'),
  ('81000000-0000-4000-8000-000000000106', '81000000-0000-4000-8000-000000000001', 'P810 Unlisted mirror',
   'specified', 'fixed', 1, 20000, 25000, 25000, 'USD', 'selected');
SELECT set_config('app.ffe_mutation_rpc', '', true);

CREATE TEMP TABLE p810_created (label text PRIMARY KEY, payload jsonb NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE p810_tokens (label text PRIMARY KEY, decision_id uuid NOT NULL, updated_at timestamptz NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON p810_created, p810_tokens TO authenticated;

-- ── grants and lock order ──────────────────────────────────────────────────

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
  'the Stage-2 approval path records the approval and stays private'
);

SELECT ok(
  (SELECT bool_and(
     prosrc LIKE '%PERFORM public.snapshot_project_pricing(v_decision.project_id, ''client_decision'', p_decision_id)%'
     AND NOT has_function_privilege('authenticated', oid, 'EXECUTE'))
   FROM pg_proc
   WHERE proname = '_apply_client_decision_authorized' AND pronamespace = 'public'::regnamespace),
  'the product-option consent path records its line and stays private (F4)'
);

SELECT ok(
  strpos(def, 'PERFORM public._ffe_lock_job_labels(decision.project_id)') > 0
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(decision.project_id)')
      < regexp_instr(def, 'FOR (UPDATE|SHARE|KEY SHARE|NO KEY UPDATE)'),
  'F2: the Stage-2 approval path takes the job label lock before its first row lock'
)
FROM (SELECT pg_get_functiondef(
  'public._respond_project_approval_checked(uuid,text,uuid,timestamptz,text,text,text)'::regprocedure) AS def) AS fn;

SELECT is(
  (SELECT string_agg(proname, ',' ORDER BY proname)
   FROM (SELECT proname, pg_get_functiondef(oid) AS def
         FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace
           AND proname IN ('set_ffe_line_pricing', 'set_ffe_line_kind',
                           'resolve_ffe_cost_change', 'reset_ffe_line_markup')) AS fn
   WHERE strpos(def, 'PERFORM public._ffe_lock_job_labels(item.project_id)') > 0
     AND strpos(def, 'PERFORM public._ffe_lock_job_labels(item.project_id)')
         < regexp_instr(def, 'FOR (UPDATE|SHARE|KEY SHARE|NO KEY UPDATE)')),
  'reset_ffe_line_markup,resolve_ffe_cost_change,set_ffe_line_kind,set_ffe_line_pricing',
  'F2: the 00809 line writers take the job label lock before their line lock'
);

-- SQ-1194 (Astra SQ-1190 F2): every other pricing writer takes the job label
-- lock before its line row lock (00810 §7c). The first three lock nothing
-- before the line; the other three lock rows no job-lock holder takes first.
SELECT ok(
  strpos(def, 'PERFORM public._ffe_lock_job_labels(') > 0
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(')
      < regexp_instr(def, 'FOR (UPDATE|SHARE|KEY SHARE|NO KEY UPDATE)')
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(')
      < strpos(def, 'SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE'),
  'F2: set_project_ffe_line_commercials takes the job label lock before its line lock'
)
FROM (SELECT pg_get_functiondef('public.set_project_ffe_line_commercials(uuid,jsonb)'::regprocedure) AS def) AS fn;

SELECT ok(
  strpos(def, 'PERFORM public._ffe_lock_job_labels(') > 0
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(')
      < regexp_instr(def, 'FOR (UPDATE|SHARE|KEY SHARE|NO KEY UPDATE)')
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(')
      < strpos(def, 'SELECT * INTO v_item FROM public.project_ffe_items'),
  'F2: set_labor_line_price takes the job label lock before its line lock'
)
FROM (SELECT pg_get_functiondef('public.set_labor_line_price(uuid,integer)'::regprocedure) AS def) AS fn;

SELECT ok(
  strpos(def, 'PERFORM public._ffe_lock_job_labels(') > 0
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(')
      < regexp_instr(def, 'FOR (UPDATE|SHARE|KEY SHARE|NO KEY UPDATE)')
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(')
      < strpos(def, 'SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE'),
  'F2: set_project_ffe_line_build_fields takes the job label lock before its line lock'
)
FROM (SELECT pg_get_functiondef('public.set_project_ffe_line_build_fields(uuid,jsonb)'::regprocedure) AS def) AS fn;

SELECT ok(
  strpos(def, 'PERFORM public._ffe_lock_job_labels(') > 0
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(')
      < strpos(def, 'SELECT * INTO v_item FROM public.project_ffe_items'),
  'F2: resolve_ack_line takes the job label lock before its line lock'
)
FROM (SELECT pg_get_functiondef('public.resolve_ack_line(uuid,text,text)'::regprocedure) AS def) AS fn;

SELECT ok(
  strpos(def, 'PERFORM public._ffe_lock_job_labels(') > 0
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(') < strpos(def, 'FOR UPDATE OF item'),
  'F2: reprice_replacement_purchase_order takes the job label lock before its line locks'
)
FROM (SELECT pg_get_functiondef('public.reprice_replacement_purchase_order(uuid,jsonb,jsonb)'::regprocedure) AS def) AS fn;

SELECT ok(
  strpos(def, 'PERFORM public._ffe_lock_job_labels(') > 0
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(')
      < strpos(def, 'SELECT * INTO v_item FROM public.project_ffe_items'),
  'F2: revise_project_ffe_configuration takes the job label lock before its line lock'
)
FROM (SELECT pg_get_functiondef(
  'public.revise_project_ffe_configuration(uuid,uuid,uuid,integer,text,uuid,integer)'::regprocedure) AS def) AS fn;

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

-- ── four asks: drawings, budget, the priced book, the masked book ──────────

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
  ('budget', 'budget_version', '81000000-0000-4000-8000-000000000004'::uuid),
  ('book', 'spec_book_artifact', '81000000-0000-4000-8000-000000000241'::uuid),
  ('masked', 'spec_book_artifact', '81000000-0000-4000-8000-000000000242'::uuid)
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
  'approving the drawings (plan_issue) records nothing'
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
                    bool_and(approval.approved_at IS NOT NULL),
                    (SELECT count(*) FROM public.ffe_pricing_approval_lines AS line
                     WHERE line.approval_id = min(approval.id::text)::uuid))
   FROM public.ffe_pricing_approvals AS approval
   CROSS JOIN p810_tokens AS token
   WHERE approval.project_id = '81000000-0000-4000-8000-000000000001'
     AND token.label = 'budget'),
  '1|project_approval|t|t|t|0',
  'F1: approving the budget records the approval event, naming the decision and the client, with no lines'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT concat_ws('|', snapshot->>'approvalRef' = token.decision_id::text, snapshot->'lines',
                    snapshot->'approvedTotals', snapshot ? 'approvedTotalCents')
   FROM (SELECT public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001') AS snapshot) AS reader
   CROSS JOIN p810_tokens AS token WHERE token.label = 'budget'),
  't|[]|[]|f',
  'after the budget the reader names its approval with no lines and no totals'
);

SELECT is(
  (SELECT count(*)::integer FROM public.ffe_pricing_events
   WHERE project_id = '81000000-0000-4000-8000-000000000001'),
  0,
  'the approval itself logs no pricing change'
);

-- The client approves the priced book.
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT public.respond_project_approval(token.decision_id, '{"outcome":"approved"}'::jsonb,
                                       token.updated_at, 'p810-respond-book')
FROM p810_tokens AS token WHERE token.label = 'book';
RESET ROLE;

SELECT is(
  (SELECT string_agg(concat_ws(':', right(line.item_id::text, 3), line.unit_client_cents,
                               line.quantity, line.line_total_cents, line.currency), ',' ORDER BY line.item_id)
   FROM public.ffe_pricing_approval_lines AS line
   JOIN public.ffe_pricing_approvals AS approval ON approval.id = line.approval_id
   JOIN p810_tokens AS token ON token.decision_id = approval.approval_ref
   WHERE token.label = 'book'),
  '101:100000:1:100000:USD,102:30000:2:60000:USD,105:40000:1:40000:EUR',
  'F1/F3: the book records its frozen client lines (price, quantity, total, currency), not live FF&E, '
  'and not the lines it did not price for the client'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'approvedTotals',
  '[{"currency":"EUR","cents":40000},{"currency":"USD","cents":160000}]'::jsonb,
  'F3: the approved totals are per currency, never summed across currencies'
);

SELECT is(
  (SELECT string_agg(concat_ws(':', right(line->>'itemId', 3), line->>'currency', line->>'differs'),
                     ',' ORDER BY line->>'itemId')
   FROM jsonb_array_elements(
     public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'lines') AS line),
  '101:USD:true,102:USD:false,105:EUR:false',
  'F1: differs compares live lines with the frozen approved values; the unlisted line is not approved'
);

-- A replay of the same answer records nothing new.
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT public.respond_project_approval(token.decision_id, '{"outcome":"approved"}'::jsonb,
                                       token.updated_at, 'p810-respond-book')
FROM p810_tokens AS token WHERE token.label = 'book';
RESET ROLE;

SELECT is(
  (SELECT count(*)::integer FROM public.ffe_pricing_approvals
   WHERE project_id = '81000000-0000-4000-8000-000000000001'),
  2,
  'an idempotent replay of the approval records no second approval'
);

-- The client approves the masked book.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT public.respond_project_approval(token.decision_id, '{"outcome":"approved"}'::jsonb,
                                       token.updated_at, 'p810-respond-masked')
FROM p810_tokens AS token WHERE token.label = 'masked';
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT concat_ws('|',
     (SELECT count(*) FROM public.ffe_pricing_approval_lines AS line
      JOIN public.ffe_pricing_approvals AS approval ON approval.id = line.approval_id
      WHERE approval.approval_ref = token.decision_id),
     snapshot->>'approvalRef' = token.decision_id::text,
     (SELECT string_agg(right(line->>'itemId', 3) || ':' || (line->>'approvedUnitClientPriceCents'), ','
                        ORDER BY line->>'itemId')
      FROM jsonb_array_elements(snapshot->'lines') AS line))
   FROM (SELECT public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001') AS snapshot) AS reader
   CROSS JOIN p810_tokens AS token WHERE token.label = 'masked'),
  '0|t|101:100000,102:30000,105:40000',
  'F1: an edition that hid client prices records no lines; the lines approved earlier keep their baseline'
);

-- A line added after the approval.
RESET ROLE;
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, trade_price_cents,
  unit_price_cents, line_total_cents, design_disposition
) VALUES ('81000000-0000-4000-8000-000000000110', '81000000-0000-4000-8000-000000000001', 'P810 Late bench',
          'specified', 'fixed', 1, 10000, 15000, 15000, 'selected');
SELECT set_config('app.ffe_mutation_rpc', '', true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT string_agg(right(line->>'itemId', 3), ',' ORDER BY line->>'itemId')
   FROM jsonb_array_elements(
     public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'lines') AS line),
  '101,102,105',
  'a line added after the approval is not in the baseline and is not flagged'
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
     AND event.at >= (SELECT min(approved_at) FROM public.ffe_pricing_approvals
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
  '101:true,102:true,105:false',
  'differs flips true for the changed line'
);

SELECT public.set_ffe_line_pricing('81000000-0000-4000-8000-000000000102', 'quantity', 2);

SELECT is(
  (SELECT string_agg(concat_ws(':', right(line->>'itemId', 3), line->>'differs'), ',' ORDER BY line->>'itemId')
   FROM jsonb_array_elements(
     public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'lines') AS line),
  '101:true,102:false,105:false',
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

SELECT public.set_ffe_line_kind('81000000-0000-4000-8000-000000000106', 'delivery');

SELECT is(
  (SELECT count(*)::integer
   FROM jsonb_array_elements(public.get_ffe_pricing_events(
     '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000106')) AS event
   WHERE event->>'field' = 'line_kind' AND event->>'oldValue' = 'goods' AND event->>'newValue' = 'delivery'),
  1,
  'a line kind edit is logged, on a line the approval did not name too'
);

-- Raw server writers, with no signed-in user.
RESET ROLE;
SET LOCAL request.jwt.claims = '';
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE public.project_ffe_items
SET unit_price_cents = 170000, line_total_cents = 170000
WHERE id = '81000000-0000-4000-8000-000000000101';

SELECT is(
  (SELECT count(*)::integer FROM public.ffe_pricing_events
   WHERE item_id = '81000000-0000-4000-8000-000000000101' AND field = 'unit_price_cents'
     AND actor IS NULL AND old_value = '160000' AND new_value = '170000'),
  1,
  'a raw server write is logged too, with no actor'
);

UPDATE public.project_ffe_items SET currency = 'USD' WHERE id = '81000000-0000-4000-8000-000000000105';

SELECT is(
  (SELECT string_agg(concat_ws(':', event.field, event.old_value, event.new_value), ',' ORDER BY event.at, event.id)
   FROM public.ffe_pricing_events AS event
   WHERE event.item_id = '81000000-0000-4000-8000-000000000105'),
  'currency:EUR:USD',
  'F3 (SQ-1190): a currency-only change after approval writes one event with the old and the new currency'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT line->>'differs'
   FROM jsonb_array_elements(
     public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'lines') AS line
   WHERE line->>'itemId' = '81000000-0000-4000-8000-000000000105'),
  'true',
  'F3: a currency change alone flips differs'
);

RESET ROLE;
UPDATE public.project_ffe_items SET quantity = 3, line_total_cents = 60000
WHERE id = '81000000-0000-4000-8000-000000000102';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT concat_ws(':', item.quantity, item.line_total_cents, line->>'differs')
   FROM jsonb_array_elements(
     public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'lines') AS line
   JOIN public.project_ffe_items AS item ON item.id = (line->>'itemId')::uuid
   WHERE line->>'itemId' = '81000000-0000-4000-8000-000000000102'),
  '3:60000:true',
  'a quantity change alone flips differs (the total still matches)'
);

RESET ROLE;
UPDATE public.project_ffe_items SET quantity = 2, line_total_cents = 61000
WHERE id = '81000000-0000-4000-8000-000000000102';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT concat_ws(':', item.quantity, item.line_total_cents, line->>'differs')
   FROM jsonb_array_elements(
     public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'lines') AS line
   JOIN public.project_ffe_items AS item ON item.id = (line->>'itemId')::uuid
   WHERE line->>'itemId' = '81000000-0000-4000-8000-000000000102'),
  '2:61000:true',
  'a total change alone flips differs (the quantity still matches)'
);

-- ── option consent: the client picks a product option (F4) ─────────────────

RESET ROLE;
SELECT set_config('app.ffe_mutation_rpc', '', true);
INSERT INTO public.products (id, name, captured_at, layer, owner_user_id)
VALUES ('81000000-0000-4000-8000-000000000301', 'P810 Side chair', now(), 'personal',
        '81000000-0000-4000-8000-0000000000a1');
INSERT INTO public.client_decisions (id, designer_client_id, designer_id, project_id, title, sent_at)
VALUES ('81000000-0000-4000-8000-000000000700', '81000000-0000-4000-8000-0000000000c1',
        '81000000-0000-4000-8000-0000000000a1', '81000000-0000-4000-8000-000000000001',
        'P810 Side chairs', now());
INSERT INTO public.client_decision_options (id, decision_id, name, price, quantity, product_id, selected, sort_order)
VALUES ('81000000-0000-4000-8000-000000000711', '81000000-0000-4000-8000-000000000700',
        'P810 Side chair', 50000, 2, '81000000-0000-4000-8000-000000000301', false, 0);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT public.apply_client_decision('81000000-0000-4000-8000-000000000700',
                                    '81000000-0000-4000-8000-000000000711');
RESET ROLE;

SELECT is(
  (SELECT concat_ws('|', approval.approval_source, approval.approved_by = '81000000-0000-4000-8000-0000000000a2',
                    count(line.item_id),
                    string_agg(concat_ws(':', line.unit_client_cents, line.quantity, line.line_total_cents,
                                         line.currency, line.item_id = item.id), ','))
   FROM public.ffe_pricing_approvals AS approval
   LEFT JOIN public.ffe_pricing_approval_lines AS line ON line.approval_id = approval.id
   LEFT JOIN public.project_ffe_items AS item
     ON item.source_decision_id = '81000000-0000-4000-8000-000000000700'
   WHERE approval.approval_ref = '81000000-0000-4000-8000-000000000700'
   GROUP BY approval.id, approval.approval_source, approval.approved_by),
  'client_decision|t|1|50000:2:100000:USD:t',
  'F4: the client''s product-option consent records that one line at the option''s price and quantity'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT string_agg(line->>'approvalSource', ',' ORDER BY line->>'approvalSource')
   FROM jsonb_array_elements(
     public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001')->'lines') AS line),
  'client_decision,project_approval,project_approval,project_approval',
  'F4: no other line is marked approved by the option consent; the book''s lines keep their approval'
);

-- ── equal approved_at falls back to the id ─────────────────────────────────

RESET ROLE;
INSERT INTO public.ffe_pricing_approvals (id, project_id, approval_source, approval_ref, approved_at)
VALUES
  ('81000000-0000-4000-8000-0000000000b1', '81000000-0000-4000-8000-000000000001', 'project_approval',
   '81000000-0000-4000-8000-0000000000d1', now() + interval '1 day'),
  ('81000000-0000-4000-8000-0000000000b2', '81000000-0000-4000-8000-000000000001', 'project_approval',
   '81000000-0000-4000-8000-0000000000d2', now() + interval '1 day');
INSERT INTO public.ffe_pricing_approval_lines (approval_id, item_id, unit_client_cents, quantity, line_total_cents, currency)
VALUES
  ('81000000-0000-4000-8000-0000000000b1', '81000000-0000-4000-8000-000000000101', 171000, 1, 171000, 'USD'),
  ('81000000-0000-4000-8000-0000000000b2', '81000000-0000-4000-8000-000000000101', 172000, 1, 172000, 'USD');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT concat_ws('|', right(snapshot->>'approvalId', 2),
     (SELECT concat_ws(':', right(line->>'approvalId', 2), line->>'approvedUnitClientPriceCents')
      FROM jsonb_array_elements(snapshot->'lines') AS line
      WHERE line->>'itemId' = '81000000-0000-4000-8000-000000000101'))
   FROM (SELECT public.get_project_pricing_approval('81000000-0000-4000-8000-000000000001') AS snapshot) AS reader),
  'b2|b2:172000',
  'an equal approved_at falls back to the higher id, for the header and for the line'
);

RESET ROLE;

-- ── F2: a line edit waits on an open approval, then is logged ──────────────
-- Two-session interleave (dblink). Session A stands in for the approval
-- path: it holds the job label lock and records the job's first approval,
-- still open. Session B edits a line's price on the same job. B must wait on
-- the job label lock, then log its edit once A commits. Without the lock B
-- would write at once, before A's approval is visible, and log nothing. The
-- fixture is committed through a third session and removed after; B rolls
-- back.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TEMP TABLE p810_interleave (result text) ON COMMIT DROP;
DO $p810_interleave$
DECLARE
  v_dsn text := format(
    'host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1), current_database());
  v_cleanup text := $c$
    SET statement_timeout = '20s';
    SET lock_timeout = '10s';
    SET app.ffe_mutation_rpc = 'on';
    DELETE FROM public.ffe_pricing_approvals WHERE project_id = '81091000-0000-4000-8000-000000000001';
    DELETE FROM public.projects WHERE id = '81091000-0000-4000-8000-000000000001';
    DELETE FROM public.profiles WHERE id = '81091000-0000-4000-8000-0000000000d1';
    DELETE FROM auth.users WHERE id = '81091000-0000-4000-8000-0000000000d1';
  $c$;
  v_b_pid integer;
  v_wait text;
  v_logged integer;
  v_result text;
  v_conn text;
BEGIN
  PERFORM extensions.dblink_connect('p810_setup', v_dsn);
  PERFORM extensions.dblink_connect('p810_a', v_dsn);
  PERFORM extensions.dblink_connect('p810_b', v_dsn);
  BEGIN
    PERFORM extensions.dblink_exec('p810_setup', v_cleanup);
    PERFORM extensions.dblink_exec('p810_setup', $f$
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
      VALUES ('81091000-0000-4000-8000-0000000000d1', 'p810-interleave@test.invalid', '', now(), now(), now(),
              '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
      INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
      VALUES ('81091000-0000-4000-8000-0000000000d1', 'p810-interleave@test.invalid', 'P810 Interleave', now(), now())
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.projects (id, name, designer_id, created_by, status)
      VALUES ('81091000-0000-4000-8000-000000000001', 'P810 Interleave job', '81091000-0000-4000-8000-0000000000d1',
              '81091000-0000-4000-8000-0000000000d1', 'active');
      INSERT INTO public.project_ffe_items (id, project_id, name, status, item_type, quantity,
        trade_price_cents, unit_price_cents, line_total_cents, design_disposition)
      VALUES ('81091000-0000-4000-8000-0000000000b1', '81091000-0000-4000-8000-000000000001', 'Interleave sofa',
              'specified', 'fixed', 1, 10000, 15000, 15000, 'selected');
    $f$);
    PERFORM extensions.dblink_exec('p810_a', $q$SET lock_timeout = '20s'$q$);
    PERFORM extensions.dblink_exec('p810_b', $q$SET lock_timeout = '20s'$q$);
    PERFORM * FROM extensions.dblink('p810_b', $q$SELECT set_config('request.jwt.claims',
      '{"sub":"81091000-0000-4000-8000-0000000000d1","role":"authenticated"}', false),
      set_config('request.jwt.claim.sub', '81091000-0000-4000-8000-0000000000d1', false)$q$)
      AS r(claims text, sub text);

    PERFORM extensions.dblink_exec('p810_a', 'BEGIN');
    PERFORM * FROM extensions.dblink('p810_a',
      $q$SELECT public._ffe_lock_job_labels('81091000-0000-4000-8000-000000000001')::text$q$) AS r(x text);
    PERFORM extensions.dblink_exec('p810_a', $q$INSERT INTO public.ffe_pricing_approvals
      (project_id, approval_source, approval_ref)
      VALUES ('81091000-0000-4000-8000-000000000001', 'project_approval', '81091000-0000-4000-8000-0000000000e1')$q$);
    SELECT pid INTO v_b_pid FROM extensions.dblink('p810_b', 'SELECT pg_backend_pid()') AS r(pid integer);
    PERFORM extensions.dblink_exec('p810_b', 'BEGIN');
    PERFORM extensions.dblink_send_query('p810_b',
      $q$SELECT public.set_ffe_line_pricing('81091000-0000-4000-8000-0000000000b1',
        'unit_client_price_cents', 16000)::text$q$);
    FOR i IN 1..50 LOOP
      SELECT wait INTO v_wait FROM extensions.dblink('p810_setup', format(
        $q$SELECT wait_event FROM pg_stat_activity WHERE pid = %s AND wait_event_type = 'Lock'$q$, v_b_pid))
        AS r(wait text);
      EXIT WHEN v_wait IS NOT NULL;
      PERFORM pg_sleep(0.1);
    END LOOP;

    PERFORM extensions.dblink_exec('p810_a', 'COMMIT');
    PERFORM * FROM extensions.dblink_get_result('p810_b', false) AS r(x text);
    PERFORM * FROM extensions.dblink_get_result('p810_b', false) AS r(x text);
    SELECT n INTO v_logged FROM extensions.dblink('p810_b', $q$SELECT count(*)::integer
      FROM public.ffe_pricing_events WHERE item_id = '81091000-0000-4000-8000-0000000000b1'$q$) AS r(n integer);
    PERFORM extensions.dblink_exec('p810_b', 'ROLLBACK');
    v_result := CASE WHEN v_wait IS NULL THEN 'the line edit never waited' ELSE 'waits on ' || v_wait END
      || CASE WHEN v_logged > 0 THEN '; logged' ELSE '; unlogged' END;
  EXCEPTION WHEN OTHERS THEN
    v_result := COALESCE(v_result, 'interleave error: ' || SQLERRM);
  END;
  -- A and B close first, so nothing they still hold can block the cleanup.
  FOREACH v_conn IN ARRAY COALESCE(extensions.dblink_get_connections(), ARRAY[]::text[]) LOOP
    IF v_conn IN ('p810_a', 'p810_b') THEN PERFORM extensions.dblink_disconnect(v_conn); END IF;
  END LOOP;
  BEGIN
    PERFORM extensions.dblink_exec('p810_setup', v_cleanup);
  EXCEPTION WHEN OTHERS THEN
    v_result := COALESCE(v_result, '') || ' / cleanup error: ' || SQLERRM;
  END;
  PERFORM extensions.dblink_disconnect('p810_setup');
  INSERT INTO p810_interleave VALUES (v_result);
END
$p810_interleave$;

SELECT is(
  (SELECT result FROM p810_interleave),
  'waits on advisory; logged',
  'F2: a line edit waits on the job label lock an open first approval holds, then is logged (dblink interleave)'
);

-- ── F2 (SQ-1190): a labor price edit waits on an open approval too ─────────
-- The same interleave through set_labor_line_price (00810 §7c). Session A
-- holds the job label lock and records the job's first approval, still open.
-- Session B prices the job's labor line. B must wait on the job label lock,
-- then log its edit once A commits. Without the lock B would take the line at
-- once, write before A's approval is visible, and log nothing.
CREATE TEMP TABLE p810_labor_interleave (result text) ON COMMIT DROP;
DO $p810_labor_interleave$
DECLARE
  v_dsn text := format(
    'host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1), current_database());
  v_cleanup text := $c$
    SET statement_timeout = '20s';
    SET lock_timeout = '10s';
    SET app.ffe_mutation_rpc = 'on';
    DELETE FROM public.ffe_pricing_approvals WHERE project_id = '81092000-0000-4000-8000-000000000001';
    DELETE FROM public.projects WHERE id = '81092000-0000-4000-8000-000000000001';
    DELETE FROM public.profiles WHERE id = '81092000-0000-4000-8000-0000000000d1';
    DELETE FROM auth.users WHERE id = '81092000-0000-4000-8000-0000000000d1';
  $c$;
  v_b_pid integer;
  v_wait text;
  v_logged integer;
  v_result text;
  v_conn text;
BEGIN
  PERFORM extensions.dblink_connect('p810l_setup', v_dsn);
  PERFORM extensions.dblink_connect('p810l_a', v_dsn);
  PERFORM extensions.dblink_connect('p810l_b', v_dsn);
  BEGIN
    PERFORM extensions.dblink_exec('p810l_setup', v_cleanup);
    PERFORM extensions.dblink_exec('p810l_setup', $f$
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
      VALUES ('81092000-0000-4000-8000-0000000000d1', 'p810-labor-interleave@test.invalid', '', now(), now(), now(),
              '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
      INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
      VALUES ('81092000-0000-4000-8000-0000000000d1', 'p810-labor-interleave@test.invalid', 'P810 Labor Interleave', now(), now())
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.projects (id, name, designer_id, created_by, status)
      VALUES ('81092000-0000-4000-8000-000000000001', 'P810 Labor interleave job', '81092000-0000-4000-8000-0000000000d1',
              '81092000-0000-4000-8000-0000000000d1', 'active');
      INSERT INTO public.project_ffe_items (id, project_id, name, status, item_type, quantity, unit,
        trade_price_cents, unit_price_cents, line_total_cents, design_disposition,
        line_kind, link_kind, parent_ffe_item_id)
      VALUES
        ('81092000-0000-4000-8000-0000000000b1', '81092000-0000-4000-8000-000000000001', 'Labor interleave sofa',
         'specified', 'fixed', 1, 'each', 10000, 15000, 15000, 'selected', 'goods', NULL, NULL),
        ('81092000-0000-4000-8000-0000000000b2', '81092000-0000-4000-8000-000000000001', 'Labor interleave install',
         'specified', 'fixed', 2, 'hour', NULL, 0, 0, 'selected', 'labor', 'labor',
         '81092000-0000-4000-8000-0000000000b1');
    $f$);
    PERFORM extensions.dblink_exec('p810l_a', $q$SET lock_timeout = '20s'$q$);
    PERFORM extensions.dblink_exec('p810l_b', $q$SET lock_timeout = '20s'$q$);
    PERFORM * FROM extensions.dblink('p810l_b', $q$SELECT set_config('request.jwt.claims',
      '{"sub":"81092000-0000-4000-8000-0000000000d1","role":"authenticated"}', false),
      set_config('request.jwt.claim.sub', '81092000-0000-4000-8000-0000000000d1', false)$q$)
      AS r(claims text, sub text);

    PERFORM extensions.dblink_exec('p810l_a', 'BEGIN');
    PERFORM * FROM extensions.dblink('p810l_a',
      $q$SELECT public._ffe_lock_job_labels('81092000-0000-4000-8000-000000000001')::text$q$) AS r(x text);
    PERFORM extensions.dblink_exec('p810l_a', $q$INSERT INTO public.ffe_pricing_approvals
      (project_id, approval_source, approval_ref)
      VALUES ('81092000-0000-4000-8000-000000000001', 'project_approval', '81092000-0000-4000-8000-0000000000e1')$q$);
    SELECT pid INTO v_b_pid FROM extensions.dblink('p810l_b', 'SELECT pg_backend_pid()') AS r(pid integer);
    PERFORM extensions.dblink_exec('p810l_b', 'BEGIN');
    PERFORM extensions.dblink_send_query('p810l_b',
      $q$SELECT public.set_labor_line_price('81092000-0000-4000-8000-0000000000b2', 16000)::text$q$);
    FOR i IN 1..50 LOOP
      SELECT wait INTO v_wait FROM extensions.dblink('p810l_setup', format(
        $q$SELECT wait_event FROM pg_stat_activity WHERE pid = %s AND wait_event_type = 'Lock'$q$, v_b_pid))
        AS r(wait text);
      EXIT WHEN v_wait IS NOT NULL;
      PERFORM pg_sleep(0.1);
    END LOOP;

    PERFORM extensions.dblink_exec('p810l_a', 'COMMIT');
    PERFORM * FROM extensions.dblink_get_result('p810l_b', false) AS r(x text);
    PERFORM * FROM extensions.dblink_get_result('p810l_b', false) AS r(x text);
    SELECT n INTO v_logged FROM extensions.dblink('p810l_b', $q$SELECT count(*)::integer
      FROM public.ffe_pricing_events WHERE item_id = '81092000-0000-4000-8000-0000000000b2'
        AND field = 'unit_price_cents' AND old_value = '0' AND new_value = '16000'$q$) AS r(n integer);
    PERFORM extensions.dblink_exec('p810l_b', 'ROLLBACK');
    v_result := CASE WHEN v_wait IS NULL THEN 'the labor edit never waited' ELSE 'waits on ' || v_wait END
      || CASE WHEN v_logged > 0 THEN '; logged' ELSE '; unlogged' END;
  EXCEPTION WHEN OTHERS THEN
    v_result := COALESCE(v_result, 'interleave error: ' || SQLERRM);
  END;
  -- A and B close first, so nothing they still hold can block the cleanup.
  FOREACH v_conn IN ARRAY COALESCE(extensions.dblink_get_connections(), ARRAY[]::text[]) LOOP
    IF v_conn IN ('p810l_a', 'p810l_b') THEN PERFORM extensions.dblink_disconnect(v_conn); END IF;
  END LOOP;
  BEGIN
    PERFORM extensions.dblink_exec('p810l_setup', v_cleanup);
  EXCEPTION WHEN OTHERS THEN
    v_result := COALESCE(v_result, '') || ' / cleanup error: ' || SQLERRM;
  END;
  PERFORM extensions.dblink_disconnect('p810l_setup');
  INSERT INTO p810_labor_interleave VALUES (v_result);
END
$p810_labor_interleave$;

SELECT is(
  (SELECT result FROM p810_labor_interleave),
  'waits on advisory; logged',
  'F2 (SQ-1190): a labor price edit waits on the job label lock an open first approval holds, then is logged (dblink interleave)'
);

-- ── the outsider (X) ───────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
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

-- ── F1 (SQ-1190): a studio-less job's household client ─────────────────────
-- Job P9 has no studio (studio_id NULL). Its lead is D. Its client H shares an
-- unrelated active organization (a contractor) with D, which 00702's
-- fallback (is_studio_comember: any shared organization) counted as the
-- job's team. 00813 narrows that fallback to D's design-studio co-members who
-- are not the job's client. H reads nothing and is refused the change log;
-- D and her Studio A teammate T still read.

RESET ROLE;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('81000000-0000-4000-8000-0000000000a3', 'p810-household@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81000000-0000-4000-8000-0000000000a4', 'p810-teammate@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('81000000-0000-4000-8000-0000000000a3', 'p810-household@test.invalid', 'P810 Household', false),
  ('81000000-0000-4000-8000-0000000000a4', 'p810-teammate@test.invalid',  'P810 Teammate',  true)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('81000000-0000-4000-8000-0000000000f3', 'contractor', 'P810 Shared Co-op', 'p810-shared-coop-test', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('81000000-0000-4000-8000-0000000000e3', '81000000-0000-4000-8000-0000000000a1', '81000000-0000-4000-8000-0000000000f3', 'member', 'active', now()),
  ('81000000-0000-4000-8000-0000000000e4', '81000000-0000-4000-8000-0000000000a3', '81000000-0000-4000-8000-0000000000f3', 'member', 'active', now()),
  ('81000000-0000-4000-8000-0000000000e6', '81000000-0000-4000-8000-0000000000a4', '81000000-0000-4000-8000-0000000000f1', 'member', 'active', now());

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
VALUES ('81000000-0000-4000-8000-0000000000c3', '81000000-0000-4000-8000-0000000000a1',
        '81000000-0000-4000-8000-0000000000a3', 'P810 Household', 'p810-household@test.invalid',
        'active', 'direct');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, status, current_phase)
VALUES ('81000000-0000-4000-8000-000000000901', 'P810 Studio-less cottage',
        '81000000-0000-4000-8000-0000000000a1', '81000000-0000-4000-8000-0000000000a3',
        '81000000-0000-4000-8000-0000000000a1', 'active', 'design');
DO $$ BEGIN
  ASSERT (SELECT studio_id IS NULL FROM public.projects WHERE id = '81000000-0000-4000-8000-000000000901'),
    'the F1 job must stay studio-less';
END $$;

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, trade_price_cents,
  unit_price_cents, line_total_cents, currency, design_disposition
) VALUES ('81000000-0000-4000-8000-000000000911', '81000000-0000-4000-8000-000000000901', 'P810 Cottage bench',
          'specified', 'fixed', 1, 40000, 60000, 60000, 'USD', 'selected');
SELECT set_config('app.ffe_mutation_rpc', '', true);
INSERT INTO public.ffe_pricing_approvals (id, project_id, approval_source, approval_ref)
VALUES ('81000000-0000-4000-8000-000000000921', '81000000-0000-4000-8000-000000000901', 'project_approval',
        '81000000-0000-4000-8000-000000000922');
INSERT INTO public.ffe_pricing_approval_lines (approval_id, item_id, unit_client_cents, quantity, line_total_cents, currency)
VALUES ('81000000-0000-4000-8000-000000000921', '81000000-0000-4000-8000-000000000911', 60000, 1, 60000, 'USD');
INSERT INTO public.ffe_pricing_events (id, item_id, project_id, actor, field, old_value, new_value)
VALUES ('81000000-0000-4000-8000-000000000931', '81000000-0000-4000-8000-000000000911',
        '81000000-0000-4000-8000-000000000901', '81000000-0000-4000-8000-0000000000a1',
        'trade_price_cents', '35000', '40000');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a3","role":"authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.ffe_pricing_events WHERE project_id = '81000000-0000-4000-8000-000000000901')
  + (SELECT count(*) FROM public.ffe_pricing_approvals WHERE project_id = '81000000-0000-4000-8000-000000000901')
  + (SELECT count(*) FROM public.ffe_pricing_approval_lines
     WHERE approval_id = '81000000-0000-4000-8000-000000000921'),
  0::bigint,
  'F1 (SQ-1190): a studio-less job''s client who shares an unrelated organization with the lead reads no pricing history'
);

SELECT throws_ok(
  $$SELECT public.get_ffe_pricing_events('81000000-0000-4000-8000-000000000901', NULL)$$,
  '42501', NULL,
  'F1 (SQ-1190): that client is refused the change log (42501)'
);

SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  ((SELECT count(*) FROM public.ffe_pricing_events WHERE project_id = '81000000-0000-4000-8000-000000000901')
   + (SELECT count(*) FROM public.ffe_pricing_approvals WHERE project_id = '81000000-0000-4000-8000-000000000901')
   + (SELECT count(*) FROM public.ffe_pricing_approval_lines
      WHERE approval_id = '81000000-0000-4000-8000-000000000921'))::text
  || ':' || jsonb_array_length(public.get_ffe_pricing_events('81000000-0000-4000-8000-000000000901', NULL)),
  '3:1',
  'F1 (SQ-1190): the studio-less job''s lead still reads its pricing history and change log'
);

SET LOCAL request.jwt.claims = '{"sub":"81000000-0000-4000-8000-0000000000a4","role":"authenticated"}';

SELECT is(
  ((SELECT count(*) FROM public.ffe_pricing_events WHERE project_id = '81000000-0000-4000-8000-000000000901')
   + (SELECT count(*) FROM public.ffe_pricing_approvals WHERE project_id = '81000000-0000-4000-8000-000000000901')
   + (SELECT count(*) FROM public.ffe_pricing_approval_lines
      WHERE approval_id = '81000000-0000-4000-8000-000000000921'))::text
  || ':' || jsonb_array_length(public.get_ffe_pricing_events('81000000-0000-4000-8000-000000000901', NULL)),
  '3:1',
  'F1 (SQ-1190): the lead''s design-studio teammate still reads its pricing history and change log'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
