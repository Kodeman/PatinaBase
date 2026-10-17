-- ═══════════════════════════════════════════════════════════════════════════
-- 00819 — A pricing approval records only the lines the client edition
-- printed a price for (pgTAP, US-37 #4, SQ-1293, walk C F9)
--
-- The client PDF prints a client price only on an item sheet, and only the
-- render_snapshot's 'items' become item sheets (spec-book-render pdf.ts
-- itemPage). The Allowances and To Be Determined schedules print the label,
-- the name and the quantity, never a price. R188: the approval records the
-- lines whose client price the PDF printed, so the approval lines must equal
-- the edition's priced item-sheet lines.
--
-- Studio A: owner D (the job's lead) and client C (the decision lead) on
-- Project P, whose one spec book has two issued client editions under the
-- residential client profile (it allows clientPrice):
--   walk   walk C's shape: six priced placeholder lines (item_type 'tbd'),
--          all in 'tbd', none in 'items'. The PDF printed no price.
--   mixed  'items': 311 priced (printed) and 314 priced but vendor-only (not
--          printed); 'allowances': 312 priced; 'tbd': 313 priced.
-- C approves both through respond_project_approval.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT plan(4);

-- ── fixture ────────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('81930000-0000-4000-8000-0000000000a1', 'p819-designer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81930000-0000-4000-8000-0000000000a2', 'p819-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('81930000-0000-4000-8000-0000000000a1', 'p819-designer@test.invalid', 'P819 Designer', true),
  ('81930000-0000-4000-8000-0000000000a2', 'p819-client@test.invalid',   'P819 Client',   false)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('81930000-0000-4000-8000-0000000000f1', 'design_studio', 'P819 Studio A', 'p819-studio-a-test', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('81930000-0000-4000-8000-0000000000e1', '81930000-0000-4000-8000-0000000000a1',
        '81930000-0000-4000-8000-0000000000f1', 'owner', 'active', now());

-- 00511: every project lead holds a designer-domain role.
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '81930000-0000-4000-8000-0000000000a1'::uuid, role.id, '81930000-0000-4000-8000-0000000000a1'::uuid
FROM public.roles AS role
WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
VALUES ('81930000-0000-4000-8000-0000000000c1', '81930000-0000-4000-8000-0000000000a1',
        '81930000-0000-4000-8000-0000000000a2', 'P819 Client', 'p819-client@test.invalid',
        'active', 'direct');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status, current_phase)
VALUES ('81930000-0000-4000-8000-000000000001', 'P819 Marrow House',
        '81930000-0000-4000-8000-0000000000a1', '81930000-0000-4000-8000-0000000000a2',
        '81930000-0000-4000-8000-0000000000a1', '81930000-0000-4000-8000-0000000000f1',
        'active', 'design');

INSERT INTO public.project_phases (id, project_id, name, phase_key, status, sort_order, lane, follows_phase_id)
VALUES ('81930000-0000-4000-8000-000000000002', '81930000-0000-4000-8000-000000000001',
        'P819 approvals', 'p819-approvals', 'pending', 0, 'thread', NULL);

INSERT INTO public.spec_book_templates (
  id, template_key, version, studio_id, name, page_grammar,
  audience_profiles, required_field_rules, visibility_rules, created_by
) VALUES (
  '81930000-0000-4000-8000-000000000201', 'p819.pricing', 1,
  '81930000-0000-4000-8000-0000000000f1', 'P819 spec template',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  '81930000-0000-4000-8000-0000000000a1'
);

INSERT INTO public.spec_books (id, project_id, title, template_id, default_audiences, created_by)
VALUES ('81930000-0000-4000-8000-000000000211', '81930000-0000-4000-8000-000000000001', 'P819 client book',
        '81930000-0000-4000-8000-000000000201', ARRAY['client']::text[], '81930000-0000-4000-8000-0000000000a1');

INSERT INTO public.project_documents (
  id, project_id, title, doc_type, storage_path, status, uploaded_by,
  section_key, client_visible, size_bytes
) VALUES
  ('81930000-0000-4000-8000-000000000221', '81930000-0000-4000-8000-000000000001', 'P819 walk edition PDF',
   'pdf', 'p819/spec-walk.pdf', 'ready', '81930000-0000-4000-8000-0000000000a1', 'spec-book', true, 4096),
  ('81930000-0000-4000-8000-000000000222', '81930000-0000-4000-8000-000000000001', 'P819 mixed edition PDF',
   'pdf', 'p819/spec-mixed.pdf', 'ready', '81930000-0000-4000-8000-0000000000a1', 'spec-book', true, 4096);

-- The frozen lines, in the shape _spec_book_current_item_snapshots writes
-- them. The client profile is the residential template's, which allows
-- clientPrice.
CREATE TEMP TABLE p819_line (
  id uuid PRIMARY KEY, item_type text NOT NULL, code text NOT NULL, name text NOT NULL,
  quantity integer NOT NULL, trade_cents integer NOT NULL, client_cents integer NOT NULL,
  audiences jsonb
) ON COMMIT DROP;
INSERT INTO p819_line VALUES
  ('81930000-0000-4000-8000-000000000301', 'tbd', 'LR-01', 'P819 Sofa',         1, 200000, 270000, NULL),
  ('81930000-0000-4000-8000-000000000302', 'tbd', 'LR-02', 'P819 Side chair',   4,  30000,  40500, NULL),
  ('81930000-0000-4000-8000-000000000303', 'tbd', 'LR-03', 'P819 Rug',          1, 133333, 180000, NULL),
  ('81930000-0000-4000-8000-000000000304', 'tbd', 'LR-04', 'P819 Drapery',      1, 180000, 243000, NULL),
  ('81930000-0000-4000-8000-000000000305', 'tbd', 'LR-05', 'P819 Floor lamp',   1,  40000,  54000, NULL),
  ('81930000-0000-4000-8000-000000000306', 'tbd', '001',   'P819 Brass sconce', 1,  15000,  20250, NULL),
  ('81930000-0000-4000-8000-000000000311', 'fixed',     'LR-11', 'P819 Console',  2,  30000,  40500, NULL),
  ('81930000-0000-4000-8000-000000000312', 'allowance', 'LR-12', 'P819 Lighting allowance', 1, 100000, 135000, NULL),
  ('81930000-0000-4000-8000-000000000313', 'tbd',       'LR-13', 'P819 Ottoman',  1,  20000,  27000, NULL),
  ('81930000-0000-4000-8000-000000000314', 'fixed',     'LR-14', 'P819 Bench',    1,  10000,  13500, '["vendor"]'::jsonb);

CREATE FUNCTION pg_temp.p819_frozen(p_ids uuid[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'ffeItemId', line.id, 'itemType', line.item_type, 'documentCode', line.code,
      'name', line.name, 'quantity', line.quantity, 'audiences', line.audiences,
      'pricing', jsonb_build_object('clientPriceCents', line.client_cents,
                                    'tradePriceCents', line.trade_cents,
                                    'markupPercent', 35, 'currency', 'USD')
    )) ORDER BY line.code), '[]'::jsonb)
  FROM p819_line AS line WHERE line.id = ANY (p_ids);
$$;

CREATE FUNCTION pg_temp.p819_edition(p_items jsonb, p_allowances jsonb, p_tbd jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'template', jsonb_build_object('audience_profiles', jsonb_build_object('client', jsonb_build_object(
      'allow', jsonb_build_array('identity', 'selection', 'dimensions', 'quantity', 'selectedMedia',
                                 'clientPrice', 'clientNotes', 'care', 'warranty')))),
    'items', p_items, 'allowances', p_allowances, 'tbd', p_tbd
  );
$$;

INSERT INTO public.spec_book_revisions (
  id, spec_book_id, revision_number, idempotency_key, issue_type, status,
  requested_audiences, template_snapshot, render_snapshot,
  snapshot_checksum, created_by, issued_at
) VALUES
  ('81930000-0000-4000-8000-000000000231', '81930000-0000-4000-8000-000000000211', 1, 'p819-walk-1',
   'full', 'issued', ARRAY['client']::text[], '{}'::jsonb,
   pg_temp.p819_edition('[]'::jsonb, '[]'::jsonb, pg_temp.p819_frozen(ARRAY[
     '81930000-0000-4000-8000-000000000301', '81930000-0000-4000-8000-000000000302',
     '81930000-0000-4000-8000-000000000303', '81930000-0000-4000-8000-000000000304',
     '81930000-0000-4000-8000-000000000305', '81930000-0000-4000-8000-000000000306']::uuid[])),
   repeat('e', 64), '81930000-0000-4000-8000-0000000000a1', now()),
  ('81930000-0000-4000-8000-000000000232', '81930000-0000-4000-8000-000000000211', 2, 'p819-mixed-2',
   'full', 'issued', ARRAY['client']::text[], '{}'::jsonb,
   pg_temp.p819_edition(
     pg_temp.p819_frozen(ARRAY['81930000-0000-4000-8000-000000000311',
                               '81930000-0000-4000-8000-000000000314']::uuid[]),
     pg_temp.p819_frozen(ARRAY['81930000-0000-4000-8000-000000000312']::uuid[]),
     pg_temp.p819_frozen(ARRAY['81930000-0000-4000-8000-000000000313']::uuid[])),
   repeat('f', 64), '81930000-0000-4000-8000-0000000000a1', now());

INSERT INTO public.spec_book_artifacts (
  id, revision_id, audience, status, project_document_id, storage_path,
  checksum_sha256, size_bytes, rendered_at
) VALUES
  ('81930000-0000-4000-8000-000000000241', '81930000-0000-4000-8000-000000000231', 'client', 'ready',
   '81930000-0000-4000-8000-000000000221', 'p819/spec-walk.pdf', repeat('1', 64), 4096, now()),
  ('81930000-0000-4000-8000-000000000242', '81930000-0000-4000-8000-000000000232', 'client', 'ready',
   '81930000-0000-4000-8000-000000000222', 'p819/spec-mixed.pdf', repeat('2', 64), 4096, now());

-- The live lines, as frozen.
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, doc_code, quantity, trade_price_cents,
  unit_price_cents, line_total_cents, currency, design_disposition
)
SELECT line.id, '81930000-0000-4000-8000-000000000001', line.name, 'specified', line.item_type,
       line.code, line.quantity, line.trade_cents, line.client_cents,
       line.client_cents * line.quantity, 'USD', 'selected'
FROM p819_line AS line;
SELECT set_config('app.ffe_mutation_rpc', '', true);

CREATE TEMP TABLE p819_created (label text PRIMARY KEY, payload jsonb NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE p819_tokens (label text PRIMARY KEY, decision_id uuid NOT NULL, updated_at timestamptz NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON p819_created, p819_tokens TO authenticated;

-- ── two asks, both approved by the client ──────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81930000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT public.set_project_decision_authority(
  '81930000-0000-4000-8000-000000000001', '81930000-0000-4000-8000-0000000000a2', NULL, 0
);

INSERT INTO p819_created (label, payload)
SELECT kind.label, public.create_project_approval_decision(
  '81930000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'title', 'P819 ' || kind.label,
    'question', 'Approve the ' || kind.label || ' edition?',
    'context', 'Client-safe P819 fixture.',
    'dueAt', (now() + interval '9 days')::text,
    'phaseId', '81930000-0000-4000-8000-000000000002',
    'sectionKey', 'project',
    'artifactKind', 'spec_book_artifact',
    'artifactId', kind.artifact_id,
    'costCentsDelta', 0,
    'scheduleDaysDelta', 0,
    'leadTimeDaysDelta', 0
  ),
  'p819-create-' || kind.label,
  NULL
)
FROM (VALUES
  ('walk', '81930000-0000-4000-8000-000000000241'::uuid),
  ('mixed', '81930000-0000-4000-8000-000000000242'::uuid)
) AS kind(label, artifact_id)
ORDER BY kind.label DESC;

SET LOCAL request.jwt.claims = '{"sub":"81930000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT public.confirm_project_decision_review(
  (created.payload->>'decisionId')::uuid,
  jsonb_build_object(
    'authorityRevision', (created.payload->>'authorityRevision')::integer,
    'artifactHash', created.payload->>'artifactHash',
    'reviewMethod', 'portal_clickthrough'
  ),
  'p819-confirm-' || created.label
)
FROM p819_created AS created
ORDER BY created.label DESC;

SET LOCAL request.jwt.claims = '{"sub":"81930000-0000-4000-8000-0000000000a1","role":"authenticated"}';
INSERT INTO p819_tokens (label, decision_id, updated_at)
SELECT created.label, published.id, published.updated_at
FROM p819_created AS created
CROSS JOIN LATERAL public.publish_client_decision((created.payload->>'decisionId')::uuid) AS published
ORDER BY created.label DESC;

SET LOCAL request.jwt.claims = '{"sub":"81930000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT public.respond_project_approval(token.decision_id, '{"outcome":"approved"}'::jsonb,
                                       token.updated_at, 'p819-respond-' || token.label)
FROM p819_tokens AS token
ORDER BY token.label DESC;
RESET ROLE;

-- ── what the approvals recorded ────────────────────────────────────────────

SELECT is(
  (SELECT concat_ws('|', count(*), min(approval.approval_source),
                    bool_and(approval.approved_by = '81930000-0000-4000-8000-0000000000a2'),
                    (SELECT count(*) FROM public.ffe_pricing_approval_lines AS line
                     WHERE line.approval_id = min(approval.id::text)::uuid))
   FROM public.ffe_pricing_approvals AS approval
   JOIN p819_tokens AS token ON token.decision_id = approval.approval_ref
   WHERE token.label = 'walk'),
  '1|project_approval|t|0',
  'F9: an edition that listed its priced lines only under To Be Determined printed no price, '
  'so its approval records the event with no lines'
);

SELECT is(
  (SELECT string_agg(concat_ws(':', right(line.item_id::text, 3), line.unit_client_cents,
                               line.quantity, line.line_total_cents, line.currency), ',' ORDER BY line.item_id)
   FROM public.ffe_pricing_approval_lines AS line
   JOIN public.ffe_pricing_approvals AS approval ON approval.id = line.approval_id
   JOIN p819_tokens AS token ON token.decision_id = approval.approval_ref
   WHERE token.label = 'mixed'),
  '311:40500:2:81000:USD',
  'F9: only the item sheet that printed a client price is recorded; the priced allowance, the priced '
  'TBD line and the vendor-only item are not'
);

-- The contract, for every approval of the job: the recorded lines are exactly
-- the edition's item-sheet lines that print a client price for the client.
SELECT set_eq(
  $$SELECT approval.approval_ref, line.item_id, line.unit_client_cents, line.quantity
    FROM public.ffe_pricing_approval_lines AS line
    JOIN public.ffe_pricing_approvals AS approval ON approval.id = line.approval_id
    WHERE approval.project_id = '81930000-0000-4000-8000-000000000001'$$,
  $$SELECT artifact.decision_id, (entry->>'ffeItemId')::uuid AS item_id,
           (entry#>>'{pricing,clientPriceCents}')::integer AS unit_client_cents,
           (entry->>'quantity')::integer AS quantity
    FROM public.project_approval_artifacts AS artifact
    JOIN public.spec_book_artifacts AS book_artifact ON book_artifact.id = artifact.source_id
    JOIN public.spec_book_revisions AS revision ON revision.id = book_artifact.revision_id
    CROSS JOIN LATERAL jsonb_array_elements(revision.render_snapshot->'items') AS entry
    WHERE artifact.project_id = '81930000-0000-4000-8000-000000000001'
      AND jsonb_typeof(entry#>'{pricing,clientPriceCents}') = 'number'
      AND (NOT entry ? 'audiences' OR entry->'audiences' ? 'client')$$,
  'F9 (R188): the approval lines equal the printed-price lines of each approved client edition'
);

-- What the Price lens reads: only the printed line is approved.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81930000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT concat_ws('|',
     (SELECT string_agg(right(line->>'itemId', 3) || ':' || (line->>'approvedUnitClientPriceCents'), ','
                        ORDER BY line->>'itemId')
      FROM jsonb_array_elements(snapshot->'lines') AS line),
     snapshot->'approvedTotals')
   FROM (SELECT public.get_project_pricing_approval('81930000-0000-4000-8000-000000000001') AS snapshot) AS reader),
  '311:40500|[{"cents": 81000, "currency": "USD"}]',
  'F9: the reader lists no unprinted line as approved, and the approved total counts the printed line only'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
