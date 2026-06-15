-- ════════════════════════════════════════════════════════════════════════════
-- The Document · Track 5 — Project Coordination demo seed
--
-- Populates the seeded "Aspen Loft Refresh" project (the prototype's exact
-- scenario) with the full ball-in-court picture so the coordination band shows
-- all five item types across courts + the dependency web. Idempotent (fixed
-- UUIDs + ON CONFLICT / guarded UPDATEs). Run after `supabase db reset`:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     < scripts/the-document-track5-demo-coordination.sql
--
-- Project   b0000000-0000-0000-0000-0000000000d1  (Aspen Loft Refresh, active)
-- Rel (dc)  20495f61-5ced-4073-adf8-6dda002acb3c  (designer@patina.dev ↔ client)
-- Designer  a0000000-0000-0000-0000-000000000004  (Leah Hartwell)
-- ════════════════════════════════════════════════════════════════════════════

\set proj   '''b0000000-0000-0000-0000-0000000000d1'''
\set des    '''a0000000-0000-0000-0000-000000000004'''

-- The designer↔client relationship id is regenerated on every `supabase db
-- reset`, so resolve it dynamically (designer + client auth uids are fixed).
SELECT quote_literal(id) AS dc
  FROM designer_clients
  WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
    AND client_id   = 'a0000000-0000-0000-0000-000000000005'
  ORDER BY created_at
  LIMIT 1 \gset

begin;

-- ── 1. Parties (tracked GC + vendor; no login — R46) ────────────────────────
insert into project_parties (id, project_id, party_kind, display_name, company_name, email, vendor_id, created_by)
values
  ('a5510000-0000-0000-0000-000000000001', :proj, 'gc',     'Reyes Build',    'Reyes Build LLC', 'pm@reyesbuild.example',  null, :des),
  ('a5510000-0000-0000-0000-000000000002', :proj, 'vendor', 'Cisco Brothers', 'Cisco Brothers',  'orders@cisco.example', '11111111-1111-1111-1111-111111111105', :des)
on conflict (id) do nothing;

-- ── 2. The four new open items (the two seeded selections stay client-court) ──
-- RFI — in YOUR court, blocks the GC's install tasks.
insert into client_decisions
  (id, designer_client_id, designer_id, project_id, title, context, due_date,
   decision_kind, coordination_kind, court, blocks_kind, blocking_status, status, sent_at)
values
  ('d5c10000-0000-0000-0000-000000000001', :dc, :des, :proj,
   'Pendant drop vs. built-in soffit height',
   'Framing the built-in soffit — it lands at 8''2". The spec pendant drops 36", right at head height over the console run. Confirm the drop or relocate before the ceiling closes. Holding electrical rough-in.',
   now() + interval '0 day', 'choice', 'rfi', 'designer', 'task', 'blocks_phase', 'pending', now()),
  -- Submittal — in your court, carries revisions.
  ('d5c10000-0000-0000-0000-000000000002', :dc, :des, :proj,
   'Built-in millwork — shop drawings',
   'Rev 2 — corrected the toe-kick height and tightened the floating-shelf reveal to 1/4" per your markup. Ready to release to the shop on your approval.',
   now() + interval '2 day', 'choice', 'submittal', 'designer', 'task', 'non_blocking', 'pending', now()),
  -- Sign-off — in the client's court (gate; settles the phase).
  ('d5c10000-0000-0000-0000-000000000003', :dc, :des, :proj,
   'Concept sign-off — Phase 1',
   'The full concept package for your approval — palette, the built-in elevation, and the furniture plan. Once you sign off, we lock it and start ordering in earnest.',
   now() + interval '3 day', 'approval', 'signoff', 'client', 'phase', 'blocks_phase', 'pending', now()),
  -- Punch — in the GC's court (closeout fix).
  ('d5c10000-0000-0000-0000-000000000004', :dc, :des, :proj,
   'Touch-up paint at the north window return',
   'Closeout: paint scuff at the north window return where the scaffold sat. Touch up and we''ll verify on the final walk.',
   now() + interval '5 day', 'choice', 'punch', 'gc', 'phase', 'non_blocking', 'pending', now())
on conflict (id) do nothing;

-- point the gc/vendor-court items at their concrete party row
update client_decisions set court_party_id = 'a5510000-0000-0000-0000-000000000002'
  where id = 'd5c10000-0000-0000-0000-000000000002';   -- submittal ↔ vendor
update client_decisions set court_party_id = 'a5510000-0000-0000-0000-000000000001'
  where id = 'd5c10000-0000-0000-0000-000000000004';   -- punch ↔ GC

-- ── 3. Submittal revision history (RPC-only at runtime; seed bypasses RLS) ────
insert into coordination_item_revisions (id, decision_id, rev_number, status, note, submitted_by)
values
  ('d5e10000-0000-0000-0000-000000000001', 'd5c10000-0000-0000-0000-000000000002', 1, 'revise_resubmit', 'Toe-kick height + shelf reveal flagged on first review.', :des),
  ('d5e10000-0000-0000-0000-000000000002', 'd5c10000-0000-0000-0000-000000000002', 2, 'submitted',       'Corrected per markup; ready to release.', :des)
on conflict (id) do nothing;

-- ── 4. The dependency web: make the seeded tasks live + blocked/sequenced ────
-- Surface the tasks in the project section (they were section_key NULL).
update project_tasks set section_key = 'project'
  where project_id = :proj and section_key is null;

-- "Present concept storyboards" → blocked by the RFI, owned by the GC.
update project_tasks
  set status = 'blocked', blocked_by_item_id = 'd5c10000-0000-0000-0000-000000000001', owner = 'gc'
  where id = 'ba5c0000-0000-0000-0000-000000000002';

-- "Finalize material palette" → trade-sequenced after the storyboards task.
update project_tasks
  set seq_after_task_id = 'ba5c0000-0000-0000-0000-000000000002', owner = 'designer'
  where id = 'ba5c0000-0000-0000-0000-000000000003';

commit;

-- ── readback ────────────────────────────────────────────────────────────────
select coordination_kind, court, status, left(title, 38) as title
  from client_decisions where project_id = 'b0000000-0000-0000-0000-0000000000d1'
  order by court, coordination_kind;
select '— court summary —' as section;
select court, open_count, overdue_count from coordination_court_summary
  where project_id = 'b0000000-0000-0000-0000-0000000000d1' order by court;
select '— task blocked state —' as section;
select t.title, tb.blocked_by_open_item, tb.blocked_by_sequence
  from project_tasks t join task_blocked_state tb on tb.task_id = t.id
  where t.project_id = 'b0000000-0000-0000-0000-0000000000d1';
