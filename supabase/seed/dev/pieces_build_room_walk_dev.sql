-- US-21 T-59 · The Build room walk job, for a hand walk on the LOCAL stack.
--
-- LOCAL ONLY. Never wire this into supabase/config.toml [db.seed], and never
-- run it against Strata. It applies the same fixture the Playwright suite
-- reseeds before every scenario (SPEC §4, "Whole Home Renovation", owned by
-- designer@patina.dev), so a hand walk and the suite see the same job.
--
--   psql -X -v ON_ERROR_STOP=1 postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -f supabase/seed/dev/pieces_build_room_walk_dev.sql
--
-- Idempotent: it deletes and recreates the e6590000-… rows each run.
--
-- T-60f adds two walk jobs after the suite's fixture (sections 2 and 3):
--   2. "Walk · Two palettes in the Primary Suite": an accepted legacy
--      proposal with no project, for activating in the browser (the SIGNED
--      seal's "Open the project"). Printed as walk11_proposal_id.
--   3. "Walk · Release to invoice": a client-linked job with an executed
--      design-services origin and an acknowledged checkpoint, for release →
--      PO → receipt → invoice. Ids for its makers are e659b000-…; the job
--      itself is minted fresh each run (see section 3 for why) and printed
--      as walk12_project_id.
-- Neither section deletes a row: accepted proposals, executed documents and
-- signatures are immutable, so earlier walk jobs are archived, not removed.

-- ── 0. Local guard: refuse anything but the local stack ────────────────────
SELECT :'HOST' IN ('127.0.0.1', 'localhost', '::1') AND :'PORT' = '54322' AS walk_is_local \gset
\if :walk_is_local
\else
  \echo 'pieces_build_room_walk_dev.sql: refusing, this seed runs only against 127.0.0.1:54322'
  \quit
\endif

-- ── 1. The suite's fixture: Whole Home Renovation ──────────────────────────
\ir ../../../apps/designer-portal/e2e/document/pieces-fixture.sql

-- ── 2. Item 11: an accepted proposal with two palettes in one room ─────────
-- activate_proposal_as_project (00762) merges the two Primary Suite palettes
-- into one project_palettes row: swatches appended in order, names joined
-- with ' · ', notes joined with a blank line. Study keeps its own palette.
-- The Finishes lens shows only paint roles (wall, ceiling, trim, floor;
-- finishes-lens.tsx OLD_ROLE_SURFACE), so each Primary Suite palette carries
-- two of them: the lens then reads Walls, Ceiling, Trim, Floor in that order.
-- Brass accents also keeps a metal swatch the lens holds back unshown.
--
-- Nothing here is ever deleted. A non-draft proposal refuses DELETE
-- (guard_proposal_copy_immutability), and its activated project cannot be
-- deleted either, because the FK would null proposals.project_id, which the
-- same guard refuses. So: a project activated from an earlier walk proposal
-- is RETIRED (archived, name stamped), and a new proposal is minted only when
-- no un-activated one is waiting. Reseeding before the walk is a no-op here.
--
-- The items sit in scope rooms (bed and nightstands in the Primary Suite,
-- chair and lamp in the Study). Before 00763 (T-60h) that activation failed
-- with "non-room assignment cannot carry a room" (QA.md F18). An earlier
-- fixture proposal minted with unscoped items while F18 stood may still be
-- waiting; it is left alone (immutable), and a room-scoped one is minted
-- beside it. walk11_proposal_id names the room-scoped one.
BEGIN;

-- Rename while active, then archive through archive_project (the only way
-- into archived; guard_project_terminal_identity_integrity).
UPDATE public.projects
   SET name = 'Retired walk · ' || to_char(created_at, 'YYYY-MM-DD HH24:MI:SS')
 WHERE status <> 'archived'
   AND proposal_id IN (
     SELECT id FROM public.proposals
      WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
        AND title = 'Walk · Two palettes in the Primary Suite');
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.archive_project(id, status) FROM public.projects
 WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
   AND name LIKE 'Retired walk · %' AND status <> 'archived';
RESET ROLE;

SELECT NOT EXISTS (
  SELECT 1 FROM public.proposals p
   WHERE p.designer_id = 'a0000000-0000-0000-0000-000000000004'
     AND p.title = 'Walk · Two palettes in the Primary Suite'
     AND p.status = 'accepted' AND p.project_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.proposal_items pi
                      WHERE pi.proposal_id = p.id AND pi.scope_room_id IS NULL)
) AS walk11_mint \gset

\if :walk11_mint
SELECT set_config('walk11.proposal', gen_random_uuid()::text, true),
       set_config('walk11.suite', gen_random_uuid()::text, true),
       set_config('walk11.study', gen_random_uuid()::text, true),
       set_config('walk11.warm', gen_random_uuid()::text, true),
       set_config('walk11.brass', gen_random_uuid()::text, true),
       set_config('walk11.green', gen_random_uuid()::text, true);

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
)
SELECT current_setting('walk11.proposal')::uuid,
       'a0000000-0000-0000-0000-000000000004', dc.id, dc.client_id,
       'Walk · Two palettes in the Primary Suite', 'Primary suite refresh.',
       1271000, 'draft', CURRENT_DATE + 60
  FROM public.designer_clients dc
 WHERE dc.designer_id = 'a0000000-0000-0000-0000-000000000004'
   AND dc.client_id = 'a0000000-0000-0000-0000-000000000005'
 LIMIT 1;

INSERT INTO public.proposal_phases (proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order)
VALUES (current_setting('walk11.proposal')::uuid, 'Design development', 'design-development', 30, 'main', 0, 0);

INSERT INTO public.proposal_scope_rooms (id, proposal_id, name, sort_order) VALUES
  (current_setting('walk11.suite')::uuid, current_setting('walk11.proposal')::uuid, 'Primary Suite', 0),
  (current_setting('walk11.study')::uuid, current_setting('walk11.proposal')::uuid, 'Study', 1);

INSERT INTO public.proposal_palettes (id, proposal_id, name, scope_room_id, notes, sort_order) VALUES
  (current_setting('walk11.warm')::uuid, current_setting('walk11.proposal')::uuid, 'Warm neutrals',
   current_setting('walk11.suite')::uuid, 'Limewash on the walls.', 0),
  (current_setting('walk11.brass')::uuid, current_setting('walk11.proposal')::uuid, 'Brass accents',
   current_setting('walk11.suite')::uuid, 'Unlacquered brass at the bed wall.', 1),
  (current_setting('walk11.green')::uuid, current_setting('walk11.proposal')::uuid, 'Library green',
   current_setting('walk11.study')::uuid, NULL, 2);

INSERT INTO public.palette_swatches (palette_id, hex, name, role, sort_order) VALUES
  (current_setting('walk11.warm')::uuid, '#E8DFD0', 'Oat limewash', 'wall', 0),
  (current_setting('walk11.warm')::uuid, '#F2EEE6', 'Linen white', 'ceiling', 1),
  (current_setting('walk11.brass')::uuid, '#B08D57', 'Brass trim enamel', 'trim', 0),
  (current_setting('walk11.brass')::uuid, '#5B4A3A', 'Smoked walnut floor', 'floor', 1),
  (current_setting('walk11.brass')::uuid, '#8A6B3F', 'Unlacquered brass', 'metal', 2),
  (current_setting('walk11.green')::uuid, '#3F5245', 'Library green', 'wall', 0);

INSERT INTO public.proposal_items (
  proposal_id, scope_room_id, name, quantity, unit_price, markup_percent,
  unit_sell_price, line_total_cents, item_type, vendor_name, position
) VALUES
  (current_setting('walk11.proposal')::uuid, current_setting('walk11.suite')::uuid, 'Bed, king, linen upholstered', 1, 380000, 25, 475000, 475000, 'fixed', 'Hollis Furniture Works', 0),
  (current_setting('walk11.proposal')::uuid, current_setting('walk11.suite')::uuid, 'Nightstands', 2, 96000, 25, 120000, 240000, 'fixed', 'Hollis Furniture Works', 1),
  (current_setting('walk11.proposal')::uuid, current_setting('walk11.study')::uuid, 'Reading chair', 1, 222400, 25, 278000, 278000, 'fixed', NULL, 2),
  (current_setting('walk11.proposal')::uuid, current_setting('walk11.study')::uuid, 'Desk lamp, brass', 2, 111200, 25, 139000, 278000, 'fixed', NULL, 3);

INSERT INTO public.proposal_payment_milestones (proposal_id, label, percentage, amount_cents, sort_order) VALUES
  (current_setting('walk11.proposal')::uuid, 'Deposit', 50, 635500, 0),
  (current_setting('walk11.proposal')::uuid, 'On delivery', 50, 635500, 1);

-- Sent and signed through the product's own lifecycle (the authored copy is
-- immutable once it leaves draft, and status moves only through its RPCs).
-- The studio records the client's signature without auto-activating: the
-- case the SIGNED seal's "Open the project" act exists for.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.send_proposal(current_setting('walk11.proposal')::uuid, NULL, NULL, now() + interval '60 days');
SELECT public.record_offline_signature(current_setting('walk11.proposal')::uuid, 'Client User', false);
RESET ROLE;
\endif

SELECT p.id AS walk11_proposal_id FROM public.proposals p
 WHERE p.designer_id = 'a0000000-0000-0000-0000-000000000004'
   AND p.title = 'Walk · Two palettes in the Primary Suite'
   AND p.status = 'accepted' AND p.project_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.proposal_items pi
                    WHERE pi.proposal_id = p.id AND pi.scope_room_id IS NULL);

COMMIT;

-- ── 3. Item 12: a client-linked job ready to release ────────────────────────
-- Why the job is minted fresh each run: project_commercial_documents and
-- commercial_document_signatures refuse every UPDATE and DELETE, the
-- superuser's included (guard_commercial_immutable_row, 00412), and a
-- project's delete cascades into them. A job with an executed origin can
-- never be deleted, and a release, PO or invoice walked on it adds more such
-- rows. So this section never deletes: it RETIRES the previous walk job
-- (status archived, name stamped) and builds a new one through the product's
-- own commercial rail, the way a studio gets one:
--   designer drafts and sends a design-services agreement → client signs →
--   designer countersigns (that activates the job and binds the origin) →
--   lines through the Build room RPCs → budget derived and published →
--   client acknowledges the checkpoint.
-- The makers are upserted, never deleted, because retired jobs' POs keep
-- pointing at them. Their orders_email addresses are on the reserved
-- .invalid TLD (RFC 2606) so a PO send can never reach a real inbox.
-- Countersigning opens the job in the designer's own studio (projects
-- set_project_studio_id_owned → designer_tier_pricing_studio), which for
-- designer@patina.dev is "Leah Hartwell", not "Local Dev Studio". The seed
-- leaves that as the product sets it.
-- The new job's id is printed at the end (walk12_project_id).
BEGIN;

INSERT INTO public.vendors (id, name, is_patina_catalog, founding_circle, orders_email) VALUES
  ('e659b000-0000-4000-8000-000000000201', 'Hollis Furniture Works', false, false, 'orders@hollis.walk.invalid'),
  ('e659b000-0000-4000-8000-000000000202', 'Ridge Install Co.', false, false, 'jobs@ridge-install.walk.invalid')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, orders_email = EXCLUDED.orders_email;

-- Retire every earlier walk job (never delete; see above).
UPDATE public.projects
   SET name = 'Retired walk · ' || to_char(created_at, 'YYYY-MM-DD HH24:MI:SS')
 WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
   AND name = 'Walk · Release to invoice' AND status <> 'archived';
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.archive_project(id, status) FROM public.projects
 WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
   AND name LIKE 'Retired walk · %' AND status <> 'archived';
RESET ROLE;

SELECT set_config('walk12.agreement', gen_random_uuid()::text, true);

-- The designer drafts and sends the agreement.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
)
SELECT current_setting('walk12.agreement')::uuid,
       'a0000000-0000-0000-0000-000000000004', dc.id, dc.client_id,
       'Walk · Release to invoice', 'Dining and living room furnishings.',
       0, 'draft', CURRENT_DATE + 60
  FROM public.designer_clients dc
 WHERE dc.designer_id = 'a0000000-0000-0000-0000-000000000004'
   AND dc.client_id = 'a0000000-0000-0000-0000-000000000005'
 LIMIT 1;

INSERT INTO public.proposal_phases (proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order)
VALUES (current_setting('walk12.agreement')::uuid, 'Design development', 'design-development', 30, 'main', 0, 0);

SELECT public.upsert_design_services_draft(
  current_setting('walk12.agreement')::uuid,
  jsonb_build_object(
    'scope', 'Interior design services for the dining and living rooms.',
    'deliverables', jsonb_build_array('Concept', 'Selections', 'Installation'),
    'exclusions', jsonb_build_array('Structural engineering'),
    'billingCeilingCents', 900000,
    'retainerAmountCents', 250000,
    'retainerActivationPolicy', 'immediate',
    'billingCadence', 'monthly', 'currency', 'USD',
    'terms', 'Actual hours to the signed ceiling.',
    'currentRateVersion', 1,
    'furnishingsDepositPercent', 30
  ),
  jsonb_build_array(jsonb_build_object(
    'version', 1, 'roleName', 'Lead Designer',
    'hourlyRateCents', 15000, 'sortOrder', 0, 'effectiveAt', CURRENT_DATE
  ))
);

SELECT public.send_commercial_document(
  current_setting('walk12.agreement')::uuid,
  public.get_commercial_document_send_snapshot(current_setting('walk12.agreement')::uuid)->>'documentFingerprint',
  NULL, now() + interval '60 days');

-- The client signs.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
SELECT public.sign_design_services_agreement(current_setting('walk12.agreement')::uuid, 'Client User');

-- The designer countersigns: the job opens with its executed origin.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SELECT set_config('walk12.project',
  public.countersign_design_services_agreement(current_setting('walk12.agreement')::uuid, 'Leah Hartwell')->>'projectId',
  true);

RESET ROLE;

-- Two rooms (the agreement carries none).
INSERT INTO public.project_rooms (project_id, name, sort_order) VALUES
  (current_setting('walk12.project')::uuid, 'Dining', 1),
  (current_setting('walk12.project')::uuid, 'Living Room', 2);

-- The lines, as the designer, through the Build room's own RPCs.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', current_setting('walk12.project'),
  'roomId', (SELECT id FROM public.project_rooms WHERE project_id = current_setting('walk12.project')::uuid AND name = 'Dining'),
  'assignmentScope', 'room', 'idempotencyKey', 'e659b-dining-' || gen_random_uuid(),
  'lines', jsonb_build_array(
    jsonb_build_object('name', 'Dining table, walnut', 'quantity', 1, 'unit', 'each', 'roughCents', 680000),
    jsonb_build_object('name', 'Dining chairs', 'quantity', 6, 'unit', 'each', 'roughCents', 85000))));

SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', current_setting('walk12.project'),
  'roomId', (SELECT id FROM public.project_rooms WHERE project_id = current_setting('walk12.project')::uuid AND name = 'Living Room'),
  'assignmentScope', 'room', 'idempotencyKey', 'e659b-living-' || gen_random_uuid(),
  'lines', jsonb_build_array(
    jsonb_build_object('name', 'Area rug, 9 × 12', 'quantity', 1, 'unit', 'each', 'roughCents', 450000),
    jsonb_build_object('name', 'Sconces, plaster', 'quantity', 2, 'unit', 'each', 'roughCents', 65000))));

-- The labor on the table, priced by its installer.
SELECT public.add_labor_line(
  (SELECT id FROM public.project_ffe_items WHERE project_id = current_setting('walk12.project')::uuid
     AND name = 'Dining table, walnut'),
  jsonb_build_object('name', 'Install, dining table delivery and set', 'quantity', 1, 'unit', 'each'),
  45000);

RESET ROLE;

-- Makers and prices (postgres, as the suite's fixture does; see its header).
SELECT set_config('app.ffe_mutation_rpc', 'on', true);

-- The maker line: a vendor row, so it lands on the maker's PO.
UPDATE public.project_ffe_items
   SET vendor_id = 'e659b000-0000-4000-8000-000000000201', vendor_name = 'Hollis Furniture Works',
       item_type = 'fixed', unit_price_cents = 680000, line_total_cents = 680000, trade_price_cents = 540000,
       design_disposition = 'selected'
 WHERE project_id = current_setting('walk12.project')::uuid AND name = 'Dining table, walnut';
UPDATE public.project_ffe_items
   SET vendor_id = 'e659b000-0000-4000-8000-000000000201', vendor_name = 'Hollis Furniture Works',
       item_type = 'fixed', unit_price_cents = 85000, line_total_cents = 85000 * quantity, trade_price_cents = 68000,
       design_disposition = 'selected'
 WHERE project_id = current_setting('walk12.project')::uuid AND name = 'Dining chairs';
-- The labor line: its own maker (the installer).
UPDATE public.project_ffe_items
   SET vendor_id = 'e659b000-0000-4000-8000-000000000202', vendor_name = 'Ridge Install Co.',
       design_disposition = 'selected'
 WHERE project_id = current_setting('walk12.project')::uuid AND line_kind = 'labor';
-- The vendor-name-only line (T-60d's sentence): priced, selected, no vendor row.
UPDATE public.project_ffe_items
   SET vendor_name = 'Lumen Atelier', item_type = 'fixed',
       unit_price_cents = 65000, line_total_cents = 65000 * quantity, trade_price_cents = 52000,
       design_disposition = 'selected'
 WHERE project_id = current_setting('walk12.project')::uuid AND name = 'Sconces, plaster';
-- The allowance line's maker; its ceiling is set through the RPC below.
UPDATE public.project_ffe_items
   SET vendor_id = 'e659b000-0000-4000-8000-000000000201', vendor_name = 'Hollis Furniture Works',
       design_disposition = 'selected'
 WHERE project_id = current_setting('walk12.project')::uuid AND name = 'Area rug, 9 × 12';

SELECT set_config('app.ffe_mutation_rpc', '', true);

-- The allowance, the budget, and its checkpoint, as the designer.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT public.make_ffe_line_allowance(
  (SELECT id FROM public.project_ffe_items WHERE project_id = current_setting('walk12.project')::uuid
     AND name = 'Area rug, 9 × 12'),
  450000);

SELECT set_config('walk12.checkpoint',
  public.publish_budget_checkpoint(
    current_setting('walk12.project')::uuid,
    (public.derive_working_budget_draft(current_setting('walk12.project')::uuid)->'version'->>'id')::uuid
  )->>'checkpointId',
  true);

-- The client acknowledges it.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
SELECT public.acknowledge_budget_checkpoint(current_setting('walk12.checkpoint')::uuid);

RESET ROLE;

SELECT current_setting('walk12.project') AS walk12_project_id;

COMMIT;
