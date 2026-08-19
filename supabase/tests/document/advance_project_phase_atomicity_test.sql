-- advance_project_phase atomicity, authority, graph, and ACL regression (00393)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/advance_project_phase_atomicity_test.sql

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('a9000000-0000-4000-8000-000000000001', 'phase-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a9000000-0000-4000-8000-000000000002', 'phase-peer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a9000000-0000-4000-8000-000000000003', 'phase-outsider@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a9000000-0000-4000-8000-000000000004', 'phase-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a9000000-0000-4000-8000-000000000001', 'phase-owner@test.invalid', 'Phase Owner', NOW(), NOW()),
  ('a9000000-0000-4000-8000-000000000002', 'phase-peer@test.invalid', 'Phase Peer', NOW(), NOW()),
  ('a9000000-0000-4000-8000-000000000003', 'phase-outsider@test.invalid', 'Phase Outsider', NOW(), NOW()),
  ('a9000000-0000-4000-8000-000000000004', 'phase-client@test.invalid', 'Phase Client', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a9100000-0000-4000-8000-000000000001', 'design_studio',
   'Atomic Phase Studio', 'atomic-phase-studio', 'active'),
  ('a9100000-0000-4000-8000-000000000002', 'contractor',
   'Atomic Phase Contractor', 'atomic-phase-contractor', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('a9110000-0000-4000-8000-000000000001',
   'a9000000-0000-4000-8000-000000000001',
   'a9100000-0000-4000-8000-000000000001', 'owner', 'active', NOW()),
  ('a9110000-0000-4000-8000-000000000002',
   'a9000000-0000-4000-8000-000000000002',
   'a9100000-0000-4000-8000-000000000001', 'member', 'active', NOW()),
  -- Sharing only a contractor organization must not confer lifecycle authority.
  ('a9110000-0000-4000-8000-000000000003',
   'a9000000-0000-4000-8000-000000000001',
   'a9100000-0000-4000-8000-000000000002', 'member', 'active', NOW()),
  ('a9110000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000003',
   'a9100000-0000-4000-8000-000000000002', 'member', 'active', NOW());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'a9200000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000004',
  'Phase Client', 'active', 'direct'
);

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, status, current_phase
)
VALUES
  ('a9300000-0000-4000-8000-000000000001', 'Canonical chain',
   'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000001', 'active', 'duplicate-key'),
  ('a9300000-0000-4000-8000-000000000002', 'Resume delayed',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'stale-pointer'),
  ('a9300000-0000-4000-8000-000000000003', 'Terminal main',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'last'),
  ('a9300000-0000-4000-8000-000000000004', 'Terminal thread',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'main-live'),
  ('a9300000-0000-4000-8000-000000000005', 'Track-five blocker',
   'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000001', 'active', 'blocked'),
  ('a9300000-0000-4000-8000-000000000006', 'Legacy blocker',
   'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000001', 'active', 'legacy-blocked'),
  ('a9300000-0000-4000-8000-000000000007', 'On hold',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'on_hold', 'paused'),
  ('a9300000-0000-4000-8000-000000000008', 'Completed project',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'completed', NULL),
  ('a9300000-0000-4000-8000-000000000009', 'Ambiguous graph',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'ambiguous'),
  ('a9300000-0000-4000-8000-00000000000a', 'Missing graph',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'missing'),
  ('a9300000-0000-4000-8000-00000000000b', 'Cyclic graph',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'cyclic'),
  ('a9300000-0000-4000-8000-00000000000c', 'Outsider target',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'owned'),
  ('a9300000-0000-4000-8000-00000000000d', 'Studio peer target',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'peer-delayed'),
  ('a9300000-0000-4000-8000-00000000000e', 'Cross-project phase source',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'cross'),
  ('a9300000-0000-4000-8000-00000000000f', 'Successor rollback',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'before-successor-failure'),
  ('a9300000-0000-4000-8000-000000000010', 'Project rollback',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'before-project-failure'),
  ('a9300000-0000-4000-8000-000000000011', 'Double CAS',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'double'),
  ('a9300000-0000-4000-8000-000000000012', 'Responded configured gate',
   'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004',
   'a9000000-0000-4000-8000-000000000001', 'active', 'gate'),
  ('a9300000-0000-4000-8000-000000000013', 'Malformed deep descendant',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'deep-target'),
  ('a9300000-0000-4000-8000-000000000014', 'Resume descendant conflict',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'resume-conflict'),
  ('a9300000-0000-4000-8000-000000000015', 'Resume predecessor conflict',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'resume-predecessor'),
  ('a9300000-0000-4000-8000-000000000016', 'Independent thread components',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'main-stable'),
  ('a9300000-0000-4000-8000-000000000017', 'Ancestor-side branch',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'branch-target'),
  ('a9300000-0000-4000-8000-000000000018', 'Ancestor-side cycle',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'cycle-target'),
  ('a9300000-0000-4000-8000-000000000019', 'Cross-lane legacy graph',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'cross-lane'),
  ('a9300000-0000-4000-8000-00000000001a', 'Cross-project target graph',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'cross-project-target'),
  ('a9300000-0000-4000-8000-00000000001b', 'Cross-project foreign graph',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'cross-project-foreign'),
  ('a9300000-0000-4000-8000-00000000001c', 'Direct lifecycle guards',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'guard-active'),
  ('a9300000-0000-4000-8000-00000000001d', 'Live main collision rollback',
   'a9000000-0000-4000-8000-000000000001', NULL,
   'a9000000-0000-4000-8000-000000000001', 'active', 'collision-main');

-- Most fixtures model valid post-migration writes. A few deliberately preserve
-- legacy cross-project edges so the RPC can prove it fails closed.
-- Temporarily bypass only the structural trigger while constructing that
-- pre-existing state; all runtime write assertions below run with it enabled.
ALTER TABLE public.project_phases
  DISABLE TRIGGER a_guard_project_phase_chain_write_trg;

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, progress, sort_order,
  follows_phase_id, lane, gate_condition
)
VALUES
  -- Exact follows beats sort_order. Duplicate/NULL keys must never widen writes.
  ('aa000000-0000-4000-8000-000000000000', 'a9300000-0000-4000-8000-000000000001',
   'Completed predecessor', 'duplicate-key', 'completed', 100, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000001', 'a9300000-0000-4000-8000-000000000001',
   'Canonical target', 'duplicate-key', 'in_progress', 40, 500,
   'aa000000-0000-4000-8000-000000000000', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000002', 'a9300000-0000-4000-8000-000000000001',
   'Canonical successor', NULL, 'pending', 0, -500,
   'aa000000-0000-4000-8000-000000000001', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000003', 'a9300000-0000-4000-8000-000000000001',
   'Later successor', 'later', 'pending', 0, -1000,
   'aa000000-0000-4000-8000-000000000002', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000004', 'a9300000-0000-4000-8000-000000000001',
   'Canonical thread follower', NULL, 'pending', 0, -2000,
   'aa000000-0000-4000-8000-000000000001', 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000005', 'a9300000-0000-4000-8000-000000000001',
   'Thread successor sharing NULL key', NULL, 'pending', 0, -3000,
   'aa000000-0000-4000-8000-000000000004', 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000006', 'a9300000-0000-4000-8000-000000000001',
   'Disconnected completed legacy history', 'legacy-island', 'completed', 100, -4000,
   NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000007', 'a9300000-0000-4000-8000-000000000001',
   'Independent live thread root', 'independent-thread', 'in_progress', 50, -5000,
   NULL, 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000008', 'a9300000-0000-4000-8000-000000000001',
   'Second canonical thread follower', 'second-thread', 'pending', 0, -6000,
   'aa000000-0000-4000-8000-000000000001', 'thread', NULL),

  ('aa000000-0000-4000-8000-000000000010', 'a9300000-0000-4000-8000-000000000002',
   'Resume by name', NULL, 'delayed', 35, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000020', 'a9300000-0000-4000-8000-000000000003',
   'Last main phase', 'last', 'in_progress', 80, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000030', 'a9300000-0000-4000-8000-000000000004',
   'Live main', 'main-live', 'in_progress', 50, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000031', 'a9300000-0000-4000-8000-000000000004',
   'Last thread', 'thread-last', 'in_progress', 90, 1,
   NULL, 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000040', 'a9300000-0000-4000-8000-000000000005',
   'Blocked Track Five', 'blocked', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000050', 'a9300000-0000-4000-8000-000000000006',
   'Blocked legacy', 'legacy-blocked', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000060', 'a9300000-0000-4000-8000-000000000007',
   'Paused project phase', 'paused', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000070', 'a9300000-0000-4000-8000-000000000008',
   'Completed project phase', 'closed', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000080', 'a9300000-0000-4000-8000-000000000009',
   'Ambiguous target', 'ambiguous', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000081', 'a9300000-0000-4000-8000-000000000009',
   'Ambiguous child A', 'ambiguous-a', 'pending', 0, 1,
   'aa000000-0000-4000-8000-000000000080', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000082', 'a9300000-0000-4000-8000-000000000009',
   'Ambiguous child B', 'ambiguous-b', 'pending', 0, 2,
   'aa000000-0000-4000-8000-000000000080', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000090', 'a9300000-0000-4000-8000-00000000000a',
   'Missing target', 'missing', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000091', 'a9300000-0000-4000-8000-00000000000a',
   'Dangling pending root', 'dangling', 'pending', 0, -100, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000a0', 'a9300000-0000-4000-8000-00000000000b',
   'Cycle target', 'cyclic', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000a1', 'a9300000-0000-4000-8000-00000000000b',
   'Cycle B', 'cycle-b', 'pending', 0, 1,
   'aa000000-0000-4000-8000-0000000000a0', 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000a2', 'a9300000-0000-4000-8000-00000000000b',
   'Cycle C', 'cycle-c', 'pending', 0, 2,
   'aa000000-0000-4000-8000-0000000000a1', 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000b0', 'a9300000-0000-4000-8000-00000000000c',
   'Outsider phase', 'owned', 'in_progress', 70, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000c0', 'a9300000-0000-4000-8000-00000000000d',
   'Peer delayed phase', 'peer-delayed', 'delayed', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000d0', 'a9300000-0000-4000-8000-00000000000e',
   'Cross-project phase', 'cross', 'in_progress', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000e0', 'a9300000-0000-4000-8000-00000000000f',
   'Successor rollback target', 'before-successor-failure', 'in_progress', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000e1', 'a9300000-0000-4000-8000-00000000000f',
   'Injected successor', 'after-successor-failure', 'pending', 0, 1,
   'aa000000-0000-4000-8000-0000000000e0', 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000f0', 'a9300000-0000-4000-8000-000000000010',
   'Project rollback target', 'before-project-failure', 'in_progress', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000000f1', 'a9300000-0000-4000-8000-000000000010',
   'Project rollback successor', 'after-project-failure', 'pending', 0, 1,
   'aa000000-0000-4000-8000-0000000000f0', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000100', 'a9300000-0000-4000-8000-000000000011',
   'Double CAS target', 'double', 'in_progress', 20, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000110', 'a9300000-0000-4000-8000-000000000012',
   'Configured gate with resolved runtime item', 'gate', 'in_progress', 90, 0,
   NULL, 'main', 'Client sign-off recorded'),

  -- Deep status validation: every descendant after the immediate pending row
  -- must also remain pending.
  ('aa000000-0000-4000-8000-000000000120', 'a9300000-0000-4000-8000-000000000013',
   'Deep target', 'deep-target', 'in_progress', 40, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000121', 'a9300000-0000-4000-8000-000000000013',
   'Deep immediate pending', 'deep-immediate', 'pending', 0, 1,
   'aa000000-0000-4000-8000-000000000120', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000122', 'a9300000-0000-4000-8000-000000000013',
   'Deep malformed descendant', 'deep-malformed', 'in_progress', 60, 2,
   'aa000000-0000-4000-8000-000000000121', 'main', NULL),

  ('aa000000-0000-4000-8000-000000000130', 'a9300000-0000-4000-8000-000000000014',
   'Resume completed predecessor', 'resume-completed', 'completed', 100, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000131', 'a9300000-0000-4000-8000-000000000014',
   'Resume delayed target', 'resume-conflict', 'delayed', 25, 1,
   'aa000000-0000-4000-8000-000000000130', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000132', 'a9300000-0000-4000-8000-000000000014',
   'Resume active descendant', 'resume-active-descendant', 'in_progress', 10, 2,
   'aa000000-0000-4000-8000-000000000131', 'main', NULL),

  ('aa000000-0000-4000-8000-000000000140', 'a9300000-0000-4000-8000-000000000015',
   'Resume pending predecessor', 'resume-pending-predecessor', 'pending', 0, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000141', 'a9300000-0000-4000-8000-000000000015',
   'Resume target after unfinished predecessor', 'resume-predecessor', 'delayed', 30, 1,
   'aa000000-0000-4000-8000-000000000140', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000142', 'a9300000-0000-4000-8000-000000000015',
   'Resume pending descendant', 'resume-pending-descendant', 'pending', 0, 2,
   'aa000000-0000-4000-8000-000000000141', 'main', NULL),

  -- Two unrelated thread roots/components are legal and independently active.
  ('aa000000-0000-4000-8000-000000000150', 'a9300000-0000-4000-8000-000000000016',
   'Stable main', 'main-stable', 'in_progress', 50, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000151', 'a9300000-0000-4000-8000-000000000016',
   'Thread one active', 'thread-one', 'in_progress', 50, 1, NULL, 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000152', 'a9300000-0000-4000-8000-000000000016',
   'Thread one successor', 'thread-one-next', 'pending', 0, 2,
   'aa000000-0000-4000-8000-000000000151', 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000153', 'a9300000-0000-4000-8000-000000000016',
   'Thread two active', 'thread-two', 'in_progress', 60, 3, NULL, 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000154', 'a9300000-0000-4000-8000-000000000016',
   'Thread two successor', 'thread-two-next', 'pending', 0, 4,
   'aa000000-0000-4000-8000-000000000153', 'thread', NULL),

  ('aa000000-0000-4000-8000-000000000160', 'a9300000-0000-4000-8000-000000000017',
   'Ancestor branch root', 'branch-root', 'completed', 100, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000161', 'a9300000-0000-4000-8000-000000000017',
   'Ancestor branch sibling', 'branch-sibling', 'in_progress', 20, 1,
   'aa000000-0000-4000-8000-000000000160', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000162', 'a9300000-0000-4000-8000-000000000017',
   'Ancestor branch target', 'branch-target', 'in_progress', 30, 2,
   'aa000000-0000-4000-8000-000000000160', 'main', NULL),

  ('aa000000-0000-4000-8000-000000000170', 'a9300000-0000-4000-8000-000000000018',
   'Ancestor cycle A', 'cycle-ancestor-a', 'completed', 100, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000171', 'a9300000-0000-4000-8000-000000000018',
   'Ancestor cycle B', 'cycle-ancestor-b', 'completed', 100, 1,
   'aa000000-0000-4000-8000-000000000170', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000172', 'a9300000-0000-4000-8000-000000000018',
   'Target attached to ancestor cycle', 'cycle-target', 'in_progress', 30, 2,
   'aa000000-0000-4000-8000-000000000171', 'main', NULL),

  ('aa000000-0000-4000-8000-000000000180', 'a9300000-0000-4000-8000-000000000019',
   'Cross-lane main target', 'cross-lane', 'in_progress', 30, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-000000000181', 'a9300000-0000-4000-8000-000000000019',
   'Thread follows main', 'cross-lane-thread', 'pending', 0, 1,
   'aa000000-0000-4000-8000-000000000180', 'thread', NULL),
  ('aa000000-0000-4000-8000-000000000182', 'a9300000-0000-4000-8000-000000000019',
   'Main cross-lane candidate', 'cross-lane-main', 'pending', 0, 2,
   'aa000000-0000-4000-8000-000000000181', 'main', NULL),

  ('aa000000-0000-4000-8000-000000000190', 'a9300000-0000-4000-8000-00000000001a',
   'Cross-project target', 'cross-project-target', 'in_progress', 30, 0,
   'aa000000-0000-4000-8000-000000000191', 'main', NULL),
  ('aa000000-0000-4000-8000-000000000191', 'a9300000-0000-4000-8000-00000000001b',
   'Cross-project foreign phase', 'cross-project-foreign', 'pending', 0, 0,
   NULL, 'main', NULL),

  ('aa000000-0000-4000-8000-0000000001a0', 'a9300000-0000-4000-8000-00000000001c',
   'Guard pending root', 'guard-pending-root', 'pending', 0, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000001a1', 'a9300000-0000-4000-8000-00000000001c',
   'Guard pending child', 'guard-pending-child', 'pending', 0, 1, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000001a2', 'a9300000-0000-4000-8000-00000000001c',
   'Guard active', 'guard-active', 'in_progress', 20, 2, NULL, 'thread', NULL),
  ('aa000000-0000-4000-8000-0000000001a3', 'a9300000-0000-4000-8000-00000000001c',
   'Guard delayed', 'guard-delayed', 'delayed', 20, 3, NULL, 'thread', NULL),
  ('aa000000-0000-4000-8000-0000000001a4', 'a9300000-0000-4000-8000-00000000001c',
   'Guard completed', 'guard-completed', 'completed', 100, 4, NULL, 'thread', NULL);

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, progress, sort_order,
  follows_phase_id, lane, gate_condition
)
VALUES
  ('aa000000-0000-4000-8000-0000000001c0', 'a9300000-0000-4000-8000-00000000001d',
   'Collision completed root', 'collision-root', 'completed', 100, 0, NULL, 'main', NULL),
  ('aa000000-0000-4000-8000-0000000001c1', 'a9300000-0000-4000-8000-00000000001d',
   'Existing live main sibling', 'collision-main', 'in_progress', 30, 1,
   'aa000000-0000-4000-8000-0000000001c0', 'main', NULL),
  ('aa000000-0000-4000-8000-0000000001c2', 'a9300000-0000-4000-8000-00000000001d',
   'Thread target before main handoff', 'collision-thread', 'in_progress', 40, 2,
   'aa000000-0000-4000-8000-0000000001c0', 'thread', NULL),
  ('aa000000-0000-4000-8000-0000000001c3', 'a9300000-0000-4000-8000-00000000001d',
   'Pending main handoff', 'collision-next-main', 'pending', 0, 3,
   'aa000000-0000-4000-8000-0000000001c2', 'main', NULL);

-- Close the cycle only after every referenced row exists.
UPDATE public.project_phases
SET follows_phase_id = 'aa000000-0000-4000-8000-0000000000a2'
WHERE id = 'aa000000-0000-4000-8000-0000000000a0';

-- Close the ancestor-side cycle after its rows exist. The target is attached
-- to cycle B, so a forward-only walk would miss cycle A behind it.
UPDATE public.project_phases
SET follows_phase_id = 'aa000000-0000-4000-8000-000000000171'
WHERE id = 'aa000000-0000-4000-8000-000000000170';

ALTER TABLE public.project_phases
  ENABLE TRIGGER a_guard_project_phase_chain_write_trg;

INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, phase_id, title,
  decision_type, status, blocks_kind, blocking_status
)
VALUES
  ('ab000000-0000-4000-8000-000000000001',
   'a9200000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
   'a9300000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000040',
   'Pending Track Five phase blocker', 'approval', 'pending', 'phase', 'non_blocking'),
  ('ab000000-0000-4000-8000-000000000002',
   'a9200000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
   'a9300000-0000-4000-8000-000000000006', 'aa000000-0000-4000-8000-000000000050',
   'Pending legacy phase blocker', 'approval', 'pending', 'none', 'blocks_phase'),
  ('ab000000-0000-4000-8000-000000000003',
   'a9200000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
   'a9300000-0000-4000-8000-000000000012', 'aa000000-0000-4000-8000-000000000110',
   'Responded runtime gate', 'approval', 'responded', 'phase', 'blocks_phase');

CREATE OR REPLACE FUNCTION pg_temp.assume_phase_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    CASE
      WHEN p_actor IS NULL THEN json_build_object('role', p_role)::text
      ELSE json_build_object('sub', p_actor, 'role', p_role)::text
    END,
    true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_phase_actor(uuid, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.expect_phase_failure(
  p_project_id uuid,
  p_phase_id uuid,
  p_expected_status text,
  p_expected_state text,
  p_expected_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    PERFORM public.advance_project_phase(
      p_project_id, p_phase_id, p_expected_status
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
  END;

  ASSERT v_state = p_expected_state,
    format('expected SQLSTATE %s, got %L (%L)', p_expected_state, v_state, v_message);
  ASSERT v_message = p_expected_message,
    format('expected error %L, got %L', p_expected_message, v_message);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_phase_failure(uuid, uuid, text, text, text) TO PUBLIC;

-- Browser ACL: authenticated only. PUBLIC would make anon true, so the anon
-- assertion also proves no inherited PUBLIC execute; service_role is explicit.
DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated', 'public.advance_project_phase(uuid,uuid,text)', 'EXECUTE'
  ), 'authenticated must execute advance_project_phase';
  ASSERT NOT has_function_privilege(
    'anon', 'public.advance_project_phase(uuid,uuid,text)', 'EXECUTE'
  ), 'anon/PUBLIC must not execute advance_project_phase';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.advance_project_phase(uuid,uuid,text)', 'EXECUTE'
  ), 'service_role must not execute advance_project_phase';
  ASSERT (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.advance_project_phase(uuid,uuid,text)'::regprocedure
  ), 'advance_project_phase must remain SECURITY DEFINER';
  ASSERT (
    SELECT proconfig = ARRAY['search_path=public, pg_temp']
    FROM pg_proc
    WHERE oid = 'public.advance_project_phase(uuid,uuid,text)'::regprocedure
  ), 'advance_project_phase must pin public, pg_temp search_path';

  ASSERT NOT has_function_privilege(
    'authenticated', 'public.guard_project_phase_chain_write()', 'EXECUTE'
  ), 'authenticated must not invoke the structural guard directly';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public.guard_project_phase_lifecycle_write()', 'EXECUTE'
  ), 'authenticated must not invoke the lifecycle guard directly';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public.guard_client_decision_completed_phase_gate()', 'EXECUTE'
  ), 'authenticated must not invoke the completed-phase gate directly';
  ASSERT (
    SELECT prosecdef
       AND proconfig = ARRAY['search_path=public, pg_temp']
    FROM pg_proc
    WHERE oid = 'public.guard_project_phase_chain_write()'::regprocedure
  ), 'structural guard must be pinned SECURITY DEFINER';
  ASSERT (
    SELECT NOT prosecdef
       AND proconfig = ARRAY['search_path=public, pg_temp']
    FROM pg_proc
    WHERE oid = 'public.guard_project_phase_lifecycle_write()'::regprocedure
  ), 'lifecycle guard must be pinned SECURITY INVOKER';
  ASSERT (
    SELECT prosecdef
       AND proconfig = ARRAY['search_path=public, pg_temp']
    FROM pg_proc
    WHERE oid = 'public.guard_client_decision_completed_phase_gate()'::regprocedure
  ), 'completed-phase gate must be pinned SECURITY DEFINER';
END;
$$;

SET LOCAL ROLE authenticated;

-- A database role without a user subject remains unauthorized.
SELECT pg_temp.assume_phase_actor(NULL);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001',
  'in_progress', '42501',
  'advance_project_phase requires an authenticated user'
);

-- Contractor co-membership and an unrelated user never confer project acts.
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000003');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000000c',
  'aa000000-0000-4000-8000-0000000000b0',
  'in_progress', '42501',
  'advance_project_phase: project not found or access denied'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000000b0'),
    'outsider denial must preserve the target';
END $$;

-- An active non-guest design-studio peer may resume. Resume uses the same RPC
-- and exact three-key receipt, with the resumed phase as the sole next_phase_ids item.
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_receipt jsonb;
BEGIN
  v_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-00000000000d',
    'aa000000-0000-4000-8000-0000000000c0',
    'delayed'
  );
  ASSERT v_receipt = jsonb_build_object(
    'completed_phase_id', NULL,
    'next_phase_ids', ARRAY['aa000000-0000-4000-8000-0000000000c0'::uuid],
    'terminal', true
  ), format('unexpected peer resume receipt: %s', v_receipt);
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000000c0'),
    'peer resume must activate the exact delayed row';
END;
$$;

SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');

-- Invalid expected status and cross-project phase pairing both fail before a
-- write. The latter does not fall through to any phase belonging to the project.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001',
  'pending', '22023',
  'advance_project_phase expected status must be in_progress or delayed'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-0000000000d0',
  'in_progress', '23514',
  'advance_project_phase: phase does not belong to project'
);

-- Inactive projects reject without changing their in-progress phase.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000007',
  'aa000000-0000-4000-8000-000000000060',
  'in_progress', '23514',
  'advance_project_phase: project is not active'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000008',
  'aa000000-0000-4000-8000-000000000070',
  'in_progress', '23514',
  'advance_project_phase: project is not active'
);

-- Both runtime blocker spellings reject and roll back every phase/project row.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000005',
  'aa000000-0000-4000-8000-000000000040',
  'in_progress', '23514',
  'advance_project_phase: 1 unresolved phase blocker(s)'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000006',
  'aa000000-0000-4000-8000-000000000050',
  'in_progress', '23514',
  'advance_project_phase: 1 unresolved phase blocker(s)'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id IN ('aa000000-0000-4000-8000-000000000040',
                       'aa000000-0000-4000-8000-000000000050')
          GROUP BY status HAVING count(*) = 2),
    'blocker rejection must roll back both targets';
END $$;

-- A responded blocker is history. gate_condition text is descriptive, while
-- this resolved runtime row is the actual unlock state.
DO $$
DECLARE v_receipt jsonb;
BEGIN
  v_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000012',
    'aa000000-0000-4000-8000-000000000110',
    'in_progress'
  );
  ASSERT v_receipt->>'terminal' = 'true'
     AND v_receipt->'next_phase_ids' = '[]'::jsonb,
    format('resolved runtime gate should allow lane terminal: %s', v_receipt);
END;
$$;

-- Completion is also the write boundary for runtime gates. A new unresolved
-- blocker, or converting responded history back into one, must serialize on
-- the phase row and fail after completion. New non-blocking work remains
-- allowed, while responded history stays immutable.
DO $$
DECLARE
  v_failed boolean := false;
  v_state text;
  v_message text;
BEGIN
  BEGIN
    PERFORM public.create_client_decision(
      'ab000000-0000-4000-8000-000000000004',
      jsonb_build_object(
        'designer_client_id', 'a9200000-0000-4000-8000-000000000001',
        'project_id', 'a9300000-0000-4000-8000-000000000012',
        'phase_id', 'aa000000-0000-4000-8000-000000000110',
        'title', 'Late unresolved gate',
        'decision_type', 'approval',
        'status', 'pending',
        'blocks_kind', 'phase',
        'blocking_status', 'non_blocking'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
    ASSERT v_state = '23514'
       AND v_message =
         'client_decisions cannot add an unresolved blocker to a completed phase',
      format('unexpected late gate rejection: %s %L', v_state, v_message);
    v_failed := true;
  END;
  ASSERT v_failed, 'late unresolved gate insert must reject';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE id = 'ab000000-0000-4000-8000-000000000004'
  ), 'rejected late gate insert must not leave a row';

  v_failed := false;
  BEGIN
    PERFORM public.reopen_client_decision(
      'ab000000-0000-4000-8000-000000000003'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
    ASSERT v_state = '23514'
       AND v_message =
         'client_decisions cannot add an unresolved blocker to a completed phase',
      format('unexpected history-to-gate rejection: %s %L', v_state, v_message);
    v_failed := true;
  END;
  ASSERT v_failed, 'responded history cannot become a late unresolved gate';
  ASSERT (SELECT status = 'responded' FROM public.client_decisions
          WHERE id = 'ab000000-0000-4000-8000-000000000003'),
    'rejected history mutation must preserve responded status';

  v_failed := false;
  BEGIN
    PERFORM public.update_client_decision(
      'ab000000-0000-4000-8000-000000000003',
      jsonb_build_object(
        'title', 'Responded runtime gate (history rewritten)'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
    ASSERT v_state = '23514'
       AND v_message =
         'decision ab000000-0000-4000-8000-000000000003 cannot be edited from status responded',
      format('unexpected responded-history rejection: %s %L', v_state, v_message);
    v_failed := true;
  END;
  ASSERT v_failed, 'responded decision history must be immutable';
  ASSERT (SELECT title = 'Responded runtime gate'
          FROM public.client_decisions
          WHERE id = 'ab000000-0000-4000-8000-000000000003'),
    'rejected history edit must preserve the original title';

  PERFORM public.create_client_decision(
    'ab000000-0000-4000-8000-000000000005',
    jsonb_build_object(
      'designer_client_id', 'a9200000-0000-4000-8000-000000000001',
      'project_id', 'a9300000-0000-4000-8000-000000000012',
      'phase_id', 'aa000000-0000-4000-8000-000000000110',
      'title', 'Late non-blocking follow-up',
      'decision_type', 'approval',
      'status', 'pending',
      'blocks_kind', 'none',
      'blocking_status', 'non_blocking'
    )
  );
  ASSERT EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE id = 'ab000000-0000-4000-8000-000000000005'
  ), 'late non-blocking work must remain allowed';
END;
$$;

-- Multiple direct stored-main followers are pointer-ambiguous. Disconnected
-- unfinished main roots and cycles also reject deterministically.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000009',
  'aa000000-0000-4000-8000-000000000080',
  'in_progress', '23514',
  'advance_project_phase: canonical main successor is ambiguous'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000000a',
  'aa000000-0000-4000-8000-000000000090',
  'in_progress', '23514',
  'advance_project_phase: canonical successor is missing'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000000b',
  'aa000000-0000-4000-8000-0000000000a0',
  'in_progress', '23514',
  'advance_project_phase: canonical successor chain is cyclic'
);

-- Status validation covers the entire descendant chain, not only the row that
-- would be activated. Active, delayed, and completed deep descendants all
-- reject without completing the target or activating its immediate child.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000013',
  'aa000000-0000-4000-8000-000000000120',
  'in_progress', '23514',
  'advance_project_phase: successor phases must be pending'
);
RESET ROLE;
UPDATE public.project_phases
SET status = 'delayed'
WHERE id = 'aa000000-0000-4000-8000-000000000122';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000013',
  'aa000000-0000-4000-8000-000000000120',
  'in_progress', '23514',
  'advance_project_phase: successor phases must be pending'
);
RESET ROLE;
UPDATE public.project_phases
SET status = 'completed', progress = 100, completed_at = now()
WHERE id = 'aa000000-0000-4000-8000-000000000122';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000013',
  'aa000000-0000-4000-8000-000000000120',
  'in_progress', '23514',
  'advance_project_phase: successor phases must be pending'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' AND completed_at IS NULL
          FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000120'),
    'deep descendant rejection must preserve the target';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000121'),
    'deep descendant rejection must preserve the immediate successor';
  ASSERT (SELECT current_phase = 'deep-target' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000013'),
    'deep descendant rejection must preserve the project pointer';
END $$;
RESET ROLE;
UPDATE public.project_phases
SET status = 'pending', progress = 0, completed_at = NULL
WHERE id = 'aa000000-0000-4000-8000-000000000122';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');

-- A delayed target may resume only when every ancestor is completed and every
-- descendant is pending. Another active/delayed row in its component is never
-- silently tolerated.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000014',
  'aa000000-0000-4000-8000-000000000131',
  'delayed', '23514',
  'advance_project_phase: successor phases must be pending'
);
RESET ROLE;
UPDATE public.project_phases
SET status = 'delayed'
WHERE id = 'aa000000-0000-4000-8000-000000000132';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000014',
  'aa000000-0000-4000-8000-000000000131',
  'delayed', '23514',
  'advance_project_phase: successor phases must be pending'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'delayed' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000131'),
    'resume descendant conflict must preserve the delayed target';
  ASSERT (SELECT current_phase = 'resume-conflict' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000014'),
    'resume descendant conflict must preserve the project pointer';
END $$;
RESET ROLE;
UPDATE public.project_phases
SET status = 'pending', progress = 0, completed_at = NULL
WHERE id = 'aa000000-0000-4000-8000-000000000132';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');

SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000015',
  'aa000000-0000-4000-8000-000000000141',
  'delayed', '23514',
  'advance_project_phase: predecessor phases must be completed'
);
RESET ROLE;
UPDATE public.project_phases
SET status = 'in_progress', progress = 10
WHERE id = 'aa000000-0000-4000-8000-000000000140';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000015',
  'aa000000-0000-4000-8000-000000000141',
  'delayed', '23514',
  'advance_project_phase: predecessor phases must be completed'
);
RESET ROLE;
UPDATE public.project_phases
SET status = 'delayed'
WHERE id = 'aa000000-0000-4000-8000-000000000140';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000015',
  'aa000000-0000-4000-8000-000000000141',
  'delayed', '23514',
  'advance_project_phase: predecessor phases must be completed'
);
RESET ROLE;
UPDATE public.project_phases
SET status = 'completed', progress = 100, completed_at = now()
WHERE id = 'aa000000-0000-4000-8000-000000000140';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');

-- Once the malformed statuses are repaired explicitly, the same exact chains
-- succeed. The RPC never infers an ordering or repairs data on its own.
DO $$
DECLARE
  v_deep jsonb;
  v_resume_descendant jsonb;
  v_resume_predecessor jsonb;
BEGIN
  v_deep := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000013',
    'aa000000-0000-4000-8000-000000000120', 'in_progress'
  );
  ASSERT v_deep->'next_phase_ids' =
      jsonb_build_array('aa000000-0000-4000-8000-000000000121'),
    format('deep repaired chain chose wrong successor: %s', v_deep);
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000122'),
    'deep transition must leave later descendants pending';

  v_resume_descendant := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000014',
    'aa000000-0000-4000-8000-000000000131', 'delayed'
  );
  ASSERT v_resume_descendant->'next_phase_ids' =
      jsonb_build_array('aa000000-0000-4000-8000-000000000131'),
    format('repaired descendant resume returned wrong phase: %s', v_resume_descendant);
  ASSERT v_resume_descendant->>'terminal' = 'false',
    'resume terminal must reflect the target having a direct follower';

  v_resume_predecessor := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000015',
    'aa000000-0000-4000-8000-000000000141', 'delayed'
  );
  ASSERT v_resume_predecessor->'next_phase_ids' =
      jsonb_build_array('aa000000-0000-4000-8000-000000000141'),
    format('repaired predecessor resume returned wrong phase: %s', v_resume_predecessor);
  ASSERT v_resume_predecessor->>'terminal' = 'false',
    'resume terminal must reflect the target having a direct follower';
END;
$$;

-- Thread components are independent schedules. Advancing one exact component
-- neither rejects the other active root nor mutates it or the main pointer.
DO $$
DECLARE
  v_first jsonb;
  v_second jsonb;
BEGIN
  v_first := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000016',
    'aa000000-0000-4000-8000-000000000151', 'in_progress'
  );
  ASSERT v_first->'next_phase_ids' =
      jsonb_build_array('aa000000-0000-4000-8000-000000000152'),
    format('first thread component chose wrong successor: %s', v_first);
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000153'),
    'first thread transition must not disturb the second active root';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000154'),
    'first thread transition must not activate the second successor';

  v_second := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000016',
    'aa000000-0000-4000-8000-000000000153', 'in_progress'
  );
  ASSERT v_second->'next_phase_ids' =
      jsonb_build_array('aa000000-0000-4000-8000-000000000154'),
    format('second thread component chose wrong successor: %s', v_second);
  ASSERT (SELECT current_phase = 'main-stable' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000016'),
    'thread components must never change the main pointer';
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000150'),
    'thread components must never change the active main phase';
END;
$$;

-- An ancestor-side branch is valid: an active sibling is not a descendant of
-- the target and is left untouched. Completing the target repairs two live-main
-- rows down to the exact remaining sibling. A cycle still fails closed.
DO $$
DECLARE v_receipt jsonb;
BEGIN
  v_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000017',
    'aa000000-0000-4000-8000-000000000162', 'in_progress'
  );
  ASSERT v_receipt = jsonb_build_object(
    'completed_phase_id', 'aa000000-0000-4000-8000-000000000162'::uuid,
    'next_phase_ids', ARRAY[]::uuid[],
    'terminal', true
  ), format('ancestor branch terminal receipt mismatch: %s', v_receipt);
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000161'),
    'sibling branch must remain untouched';
  ASSERT (SELECT current_phase = 'branch-sibling' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000017'),
    'pointer must derive from the exact remaining live main sibling';
END;
$$;
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000018',
  'aa000000-0000-4000-8000-000000000172',
  'in_progress', '23514',
  'advance_project_phase: canonical successor chain is cyclic'
);

-- Lane is rendering/storage metadata, not a graph boundary. A main→thread
-- overlap handoff and the following thread→main handoff both transition by
-- exact edge; the project pointer follows locked live-main truth.
DO $$
DECLARE
  v_to_thread jsonb;
  v_to_main jsonb;
BEGIN
  v_to_thread := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000019',
    'aa000000-0000-4000-8000-000000000180', 'in_progress'
  );
  ASSERT v_to_thread->'next_phase_ids' =
      jsonb_build_array('aa000000-0000-4000-8000-000000000181'),
    format('main-to-thread handoff mismatch: %s', v_to_thread);
  ASSERT (SELECT current_phase IS NULL FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000019'),
    'thread-only live truth must clear the scalar main pointer';

  v_to_main := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000019',
    'aa000000-0000-4000-8000-000000000181', 'in_progress'
  );
  ASSERT v_to_main->'next_phase_ids' =
      jsonb_build_array('aa000000-0000-4000-8000-000000000182'),
    format('thread-to-main handoff mismatch: %s', v_to_main);
  ASSERT (SELECT current_phase = 'cross-lane-main' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000019'),
    'thread-to-main handoff must derive the exact live-main pointer';
END;
$$;

-- Cross-project legacy edges still fail closed in either direction. The
-- structural trigger prevents creating these shapes after migration; the
-- owner-only trigger pause below flips the legacy fixture orientation.

SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000001a',
  'aa000000-0000-4000-8000-000000000190',
  'in_progress', '23514',
  'advance_project_phase: cross-project handoff is unsupported'
);
RESET ROLE;
ALTER TABLE public.project_phases
  DISABLE TRIGGER a_guard_project_phase_chain_write_trg;
UPDATE public.project_phases
SET follows_phase_id = NULL
WHERE id = 'aa000000-0000-4000-8000-000000000190';
UPDATE public.project_phases
SET follows_phase_id = 'aa000000-0000-4000-8000-000000000190'
WHERE id = 'aa000000-0000-4000-8000-000000000191';
ALTER TABLE public.project_phases
  ENABLE TRIGGER a_guard_project_phase_chain_write_trg;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000001a',
  'aa000000-0000-4000-8000-000000000190',
  'in_progress', '23514',
  'advance_project_phase: cross-project handoff is unsupported'
);

-- A thread→main handoff may not create a second live main phase. The error is
-- raised after the exact phase writes, so the whole statement must roll back.
-- Once the sibling main finishes, the same exact handoff succeeds.
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000001d',
  'aa000000-0000-4000-8000-0000000001c2',
  'in_progress', '23514',
  'advance_project_phase: multiple live main phases are unsupported'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' AND completed_at IS NULL
          FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000001c2'),
    'live-main collision must roll the thread target back';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000001c3'),
    'live-main collision must roll the main follower back';
  ASSERT (SELECT current_phase = 'collision-main' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-00000000001d'),
    'live-main collision must preserve the project pointer';
END $$;

DO $$
DECLARE
  v_main_done jsonb;
  v_handoff jsonb;
BEGIN
  v_main_done := public.advance_project_phase(
    'a9300000-0000-4000-8000-00000000001d',
    'aa000000-0000-4000-8000-0000000001c1', 'in_progress'
  );
  ASSERT v_main_done->>'terminal' = 'true'
     AND v_main_done->'next_phase_ids' = '[]'::jsonb,
    format('sibling main completion mismatch: %s', v_main_done);

  v_handoff := public.advance_project_phase(
    'a9300000-0000-4000-8000-00000000001d',
    'aa000000-0000-4000-8000-0000000001c2', 'in_progress'
  );
  ASSERT v_handoff->'next_phase_ids' =
      jsonb_build_array('aa000000-0000-4000-8000-0000000001c3'),
    format('resolved thread-to-main handoff mismatch: %s', v_handoff);
  ASSERT (SELECT current_phase = 'collision-next-main' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-00000000001d'),
    'resolved handoff must publish the sole live main phase';
END;
$$;

-- Direct-write regression harness. It runs as the authenticated invoker, while
-- the second helper is intentionally SECURITY DEFINER and owned by postgres.
-- That proves neither a spoofable custom GUC nor an unrelated definer context
-- can impersonate the lifecycle RPC's owner+transaction token.
RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.owner_phase_lifecycle_bypass()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.project_phases
  SET status = 'completed'
  WHERE id = 'aa000000-0000-4000-8000-0000000001a2'
$$;
GRANT EXECUTE ON FUNCTION pg_temp.owner_phase_lifecycle_bypass() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.expect_direct_phase_failure(
  p_case text,
  p_expected_state text,
  p_expected_message text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    CASE p_case
      WHEN 'insert_status' THEN
        INSERT INTO public.project_phases (
          id, project_id, name, status, progress, sort_order, lane
        ) VALUES (
          'aa000000-0000-4000-8000-0000000001b0',
          'a9300000-0000-4000-8000-00000000001c',
          'Illegal completed insert', 'completed', 0, 20, 'main'
        );
      WHEN 'insert_completed_at' THEN
        INSERT INTO public.project_phases (
          id, project_id, name, status, progress, completed_at, sort_order, lane
        ) VALUES (
          'aa000000-0000-4000-8000-0000000001b1',
          'a9300000-0000-4000-8000-00000000001c',
          'Illegal completed timestamp insert', 'pending', 0, now(), 21, 'main'
        );
      WHEN 'insert_progress' THEN
        INSERT INTO public.project_phases (
          id, project_id, name, status, progress, sort_order, lane
        ) VALUES (
          'aa000000-0000-4000-8000-0000000001b2',
          'a9300000-0000-4000-8000-00000000001c',
          'Illegal progress insert', 'pending', 1, 22, 'main'
        );
      WHEN 'insert_null_progress' THEN
        INSERT INTO public.project_phases (
          id, project_id, name, status, progress, sort_order, lane
        ) VALUES (
          'aa000000-0000-4000-8000-0000000001b3',
          'a9300000-0000-4000-8000-00000000001c',
          'Illegal null progress insert', 'pending', NULL, 23, 'main'
        );
      WHEN 'insert_pending' THEN
        INSERT INTO public.project_phases (
          id, project_id, name, phase_key, status, progress, sort_order, lane
        ) VALUES (
          'aa000000-0000-4000-8000-0000000001b3',
          'a9300000-0000-4000-8000-00000000001c',
          'Direct pending insert', 'direct-pending',
          'pending', 0, 23, 'main'
        );
      WHEN 'update_status' THEN
        UPDATE public.project_phases
        SET status = 'completed'
        WHERE id = 'aa000000-0000-4000-8000-0000000001a2';
      WHEN 'update_completed_at' THEN
        UPDATE public.project_phases
        SET completed_at = now()
        WHERE id = 'aa000000-0000-4000-8000-0000000001a0';
      WHEN 'update_progress' THEN
        UPDATE public.project_phases
        SET progress = 10
        WHERE id = 'aa000000-0000-4000-8000-0000000001a0';
      WHEN 'spoof_rpc_token' THEN
        PERFORM set_config(
          'app.advance_project_phase_token',
          format(
            'advance_project_phase:%s:%s',
            'a9300000-0000-4000-8000-00000000001c',
            pg_catalog.txid_current()
          ),
          true
        );
        UPDATE public.project_phases
        SET status = 'completed'
        WHERE id = 'aa000000-0000-4000-8000-0000000001a2';
      WHEN 'security_definer_without_token' THEN
        PERFORM pg_temp.owner_phase_lifecycle_bypass();
      WHEN 'delete_active' THEN
        DELETE FROM public.project_phases
        WHERE id = 'aa000000-0000-4000-8000-0000000001a2';
      WHEN 'delete_delayed' THEN
        DELETE FROM public.project_phases
        WHERE id = 'aa000000-0000-4000-8000-0000000001a3';
      WHEN 'delete_completed' THEN
        DELETE FROM public.project_phases
        WHERE id = 'aa000000-0000-4000-8000-0000000001a4';
      WHEN 'update_cross_project' THEN
        UPDATE public.project_phases
        SET follows_phase_id = 'aa000000-0000-4000-8000-000000000000'
        WHERE id = 'aa000000-0000-4000-8000-0000000001a1';
      WHEN 'insert_cross_project' THEN
        INSERT INTO public.project_phases (
          id, project_id, name, status, progress, sort_order,
          follows_phase_id, lane
        ) VALUES (
          'aa000000-0000-4000-8000-0000000001b5',
          'a9300000-0000-4000-8000-00000000001c',
          'Illegal cross-project insert', 'pending', 0, 25,
          'aa000000-0000-4000-8000-000000000000', 'main'
        );
      WHEN 'strand_child_project' THEN
        UPDATE public.project_phases
        SET project_id = 'a9300000-0000-4000-8000-000000000001'
        WHERE id = 'aa000000-0000-4000-8000-0000000001a0';
      WHEN 'update_same_project_topology' THEN
        UPDATE public.project_phases
        SET follows_phase_id = 'aa000000-0000-4000-8000-0000000001a0'
        WHERE id = 'aa000000-0000-4000-8000-0000000001a1';
      WHEN 'insert_cross_lane' THEN
        INSERT INTO public.project_phases (
          id, project_id, name, status, progress, sort_order,
          follows_phase_id, lane
        ) VALUES (
          'aa000000-0000-4000-8000-0000000001b4',
          'a9300000-0000-4000-8000-00000000001c',
          'Direct cross-lane insert', 'pending', 0, 24,
          'aa000000-0000-4000-8000-0000000001a2', 'main'
        );
      WHEN 'update_lane' THEN
        UPDATE public.project_phases
        SET lane = 'main'
        WHERE id = 'aa000000-0000-4000-8000-0000000001a2';
      WHEN 'delete_pending' THEN
        DELETE FROM public.project_phases
        WHERE id = 'aa000000-0000-4000-8000-0000000001a1';
      ELSE
        RAISE EXCEPTION 'unknown direct phase test case: %', p_case;
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
  END;

  ASSERT v_state = p_expected_state,
    format('direct %s expected SQLSTATE %s, got %L (%L)',
           p_case, p_expected_state, v_state, v_message);
  ASSERT v_message = p_expected_message,
    format('direct %s expected error %L, got %L',
           p_case, p_expected_message, v_message);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_direct_phase_failure(text, text, text) TO PUBLIC;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  ASSERT current_user = 'authenticated',
    'direct guard probes must run as the authenticated invoker';
  ASSERT current_setting('role') = 'authenticated',
    'direct guard probes must preserve a non-owner SET ROLE context';
END $$;

SELECT pg_temp.expect_direct_phase_failure(
  'insert_status', '42501',
  'project_phases lifecycle inserts must start pending with zero progress'
);
SELECT pg_temp.expect_direct_phase_failure(
  'insert_completed_at', '42501',
  'project_phases lifecycle inserts must start pending with zero progress'
);
SELECT pg_temp.expect_direct_phase_failure(
  'insert_progress', '42501',
  'project_phases lifecycle inserts must start pending with zero progress'
);
SELECT pg_temp.expect_direct_phase_failure(
  'insert_null_progress', '42501',
  'project_phases lifecycle inserts must start pending with zero progress'
);
SELECT pg_temp.expect_direct_phase_failure(
  'update_status', '42501',
  'project_phases lifecycle fields are writable only through advance_project_phase'
);
SELECT pg_temp.expect_direct_phase_failure(
  'update_completed_at', '42501',
  'project_phases lifecycle fields are writable only through advance_project_phase'
);
SELECT pg_temp.expect_direct_phase_failure(
  'update_progress', '42501',
  'project_phases lifecycle fields are writable only through advance_project_phase'
);
SELECT pg_temp.expect_direct_phase_failure(
  'spoof_rpc_token', '42501',
  'project_phases lifecycle fields are writable only through advance_project_phase'
);
SELECT pg_temp.expect_direct_phase_failure(
  'security_definer_without_token', '42501',
  'project_phases lifecycle fields are writable only through advance_project_phase'
);
SELECT pg_temp.expect_direct_phase_failure(
  'delete_active', '42501',
  'project_phases non-pending lifecycle rows cannot be deleted directly'
);
SELECT pg_temp.expect_direct_phase_failure(
  'delete_delayed', '42501',
  'project_phases non-pending lifecycle rows cannot be deleted directly'
);
SELECT pg_temp.expect_direct_phase_failure(
  'delete_completed', '42501',
  'project_phases non-pending lifecycle rows cannot be deleted directly'
);

-- 00398 closes topology identity to direct authenticated writes. Ordinary
-- schedule/date fields stay directly editable; project_id/phase_key/lane/
-- follows and all row birth/deletion cross checked RPCs instead.
SELECT pg_temp.expect_direct_phase_failure(
  'insert_pending', '42501',
  'project_phases topology inserts are writable only through create_project_phase'
);

UPDATE public.project_phases
SET start_date = DATE '2027-01-04',
    target_end_date = DATE '2027-01-10',
    duration_days = 7
WHERE id = 'aa000000-0000-4000-8000-0000000001a2';
DO $$ BEGIN
  ASSERT (SELECT start_date = DATE '2027-01-04'
             AND target_end_date = DATE '2027-01-10'
             AND duration_days = 7
          FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000001a2'),
    'ordinary schedule fields must remain directly editable';
END $$;

SELECT pg_temp.expect_direct_phase_failure(
  'update_same_project_topology', '42501',
  'project_phases project_id, phase_key, lane, and follows_phase_id are writable only through checked phase RPCs'
);

SELECT pg_temp.expect_direct_phase_failure(
  'update_cross_project', '23514',
  'project_phases predecessor must belong to the same project'
);
SELECT pg_temp.expect_direct_phase_failure(
  'insert_cross_project', '23514',
  'project_phases predecessor must belong to the same project'
);
SELECT pg_temp.expect_direct_phase_failure(
  'strand_child_project', '42501',
  'project_phases project_id, phase_key, lane, and follows_phase_id are writable only through checked phase RPCs'
);

SELECT pg_temp.expect_direct_phase_failure(
  'insert_cross_lane', '42501',
  'project_phases topology inserts are writable only through create_project_phase'
);
SELECT pg_temp.expect_direct_phase_failure(
  'update_lane', '42501',
  'project_phases project_id, phase_key, lane, and follows_phase_id are writable only through checked phase RPCs'
);
SELECT pg_temp.expect_direct_phase_failure(
  'delete_pending', '42501',
  'project_phases rows are deletable only through delete_project_phase'
);

DO $$ BEGIN
  ASSERT (SELECT follows_phase_id IS NULL
          FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000001a1'),
    'rejected direct topology write must preserve pending phase';
  ASSERT (SELECT status = 'in_progress' AND progress = 20 AND completed_at IS NULL
          FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000001a2'),
    'rejected lifecycle mutations must preserve the active row';
  ASSERT (SELECT status = 'delayed' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000001a3'),
    'rejected delete must preserve the delayed row';
  ASSERT (SELECT status = 'completed' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000001a4'),
    'rejected delete must preserve the completed row';
END $$;

-- Canonical branch transition: exact follows edges win despite inverse sort.
-- Main + thread direct followers activate together, while an independent
-- thread, deep descendants, and NULL/duplicate phase-key peers stay exact.
DO $$
DECLARE
  v_receipt jsonb;
  v_keys text[];
BEGIN
  v_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000001',
    'in_progress'
  );
  SELECT array_agg(key ORDER BY key) INTO v_keys
  FROM jsonb_object_keys(v_receipt) AS key;

  ASSERT v_keys = ARRAY['completed_phase_id', 'next_phase_ids', 'terminal'],
    format('receipt leaked keys: %s', v_keys);
  ASSERT v_receipt = jsonb_build_object(
    'completed_phase_id', 'aa000000-0000-4000-8000-000000000001'::uuid,
    'next_phase_ids', ARRAY[
      'aa000000-0000-4000-8000-000000000002'::uuid,
      'aa000000-0000-4000-8000-000000000004'::uuid,
      'aa000000-0000-4000-8000-000000000008'::uuid
    ],
    'terminal', false
  ), format('unexpected canonical receipt: %s', v_receipt);
  ASSERT (SELECT status = 'completed' AND progress = 100 AND completed_at IS NOT NULL
          FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000001'),
    'exact target must complete';
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000002'),
    'exact follows successor must activate';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000003'),
    'later lower-sort descendant must remain pending';
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000004'),
    'exact thread follower must activate atomically with the main follower';
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000008'),
    'every direct thread follower must activate atomically';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000005'),
    'NULL-key thread successor must not be widened by main successor update';
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000007'),
    'independent live thread component must remain active';
  ASSERT (SELECT status = 'completed' AND progress = 100
          FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000006'),
    'disconnected completed legacy history must remain inert';
  ASSERT (SELECT current_phase = 'Canonical successor' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000001'),
    'NULL successor key must use its name for the main display pointer';
END;
$$;

-- Main resume fallback and its receipt are exact.
DO $$
DECLARE v_receipt jsonb;
BEGIN
  v_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000002',
    'aa000000-0000-4000-8000-000000000010',
    'delayed'
  );
  ASSERT v_receipt = jsonb_build_object(
    'completed_phase_id', NULL,
    'next_phase_ids', ARRAY['aa000000-0000-4000-8000-000000000010'::uuid],
    'terminal', true
  ), format('unexpected resume receipt: %s', v_receipt);
  ASSERT (SELECT current_phase = 'Resume by name' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000002'),
    'main resume with NULL phase_key must use phase name';
END;
$$;

-- Lane-terminal is not project closeout. Main terminal clears current_phase;
-- thread terminal leaves the main pointer and main status untouched.
DO $$
DECLARE
  v_main_receipt jsonb;
  v_thread_receipt jsonb;
BEGIN
  v_main_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000003',
    'aa000000-0000-4000-8000-000000000020',
    'in_progress'
  );
  ASSERT v_main_receipt = jsonb_build_object(
    'completed_phase_id', 'aa000000-0000-4000-8000-000000000020'::uuid,
    'next_phase_ids', ARRAY[]::uuid[],
    'terminal', true
  ), format('unexpected main terminal receipt: %s', v_main_receipt);
  ASSERT (SELECT current_phase IS NULL AND status = 'active'
          FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000003'),
    'main lane terminal must clear pointer without closing project';

  v_thread_receipt := public.advance_project_phase(
    'a9300000-0000-4000-8000-000000000004',
    'aa000000-0000-4000-8000-000000000031',
    'in_progress'
  );
  ASSERT v_thread_receipt = jsonb_build_object(
    'completed_phase_id', 'aa000000-0000-4000-8000-000000000031'::uuid,
    'next_phase_ids', ARRAY[]::uuid[],
    'terminal', true
  ), format('unexpected thread terminal receipt: %s', v_thread_receipt);
  ASSERT (SELECT current_phase = 'main-live' AND status = 'active'
          FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000004'),
    'thread terminal must preserve the main project pointer';
  ASSERT (SELECT status = 'in_progress' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000030'),
    'thread terminal must preserve the active main phase';
END;
$$;

-- Successor-write failure occurs after target UPDATE inside the RPC, but the
-- caught statement error must restore target, successor, and project pointer.
RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.reject_injected_successor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = 'aa000000-0000-4000-8000-0000000000e1'::uuid
     AND NEW.status = 'in_progress' THEN
    RAISE EXCEPTION 'injected successor update failure'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.reject_injected_successor() TO PUBLIC;
CREATE TRIGGER reject_injected_successor_trg
  BEFORE UPDATE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_injected_successor();
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-00000000000f',
  'aa000000-0000-4000-8000-0000000000e0',
  'in_progress', '23514', 'injected successor update failure'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' AND completed_at IS NULL
          FROM public.project_phases WHERE id = 'aa000000-0000-4000-8000-0000000000e0'),
    'successor failure must roll target back';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000000e1'),
    'successor failure must preserve successor';
  ASSERT (SELECT current_phase = 'before-successor-failure' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-00000000000f'),
    'successor failure must preserve project pointer';
END $$;
RESET ROLE;
DROP TRIGGER reject_injected_successor_trg ON public.project_phases;

-- Project-pointer failure occurs after both phase writes; all three still roll
-- back because no receipt is returned before every dependent write succeeds.
CREATE OR REPLACE FUNCTION pg_temp.reject_injected_project_pointer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = 'a9300000-0000-4000-8000-000000000010'::uuid THEN
    RAISE EXCEPTION 'injected project update failure'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.reject_injected_project_pointer() TO PUBLIC;
CREATE TRIGGER reject_injected_project_pointer_trg
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_injected_project_pointer();
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000010',
  'aa000000-0000-4000-8000-0000000000f0',
  'in_progress', '23514', 'injected project update failure'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'in_progress' AND completed_at IS NULL
          FROM public.project_phases WHERE id = 'aa000000-0000-4000-8000-0000000000f0'),
    'project failure must roll target back';
  ASSERT (SELECT status = 'pending' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-0000000000f1'),
    'project failure must roll successor back';
  ASSERT (SELECT current_phase = 'before-project-failure' FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000010'),
    'project failure must preserve old pointer';
END $$;
RESET ROLE;
DROP TRIGGER reject_injected_project_pointer_trg ON public.projects;

-- Sequential retry: first completion wins; stale second attempt gets 40001 and
-- cannot disturb the terminal state.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('a9000000-0000-4000-8000-000000000001');
SELECT public.advance_project_phase(
  'a9300000-0000-4000-8000-000000000011',
  'aa000000-0000-4000-8000-000000000100',
  'in_progress'
);
SELECT pg_temp.expect_phase_failure(
  'a9300000-0000-4000-8000-000000000011',
  'aa000000-0000-4000-8000-000000000100',
  'in_progress', '40001',
  'advance_project_phase: phase status changed (expected in_progress, found completed)'
);
DO $$ BEGIN
  ASSERT (SELECT status = 'completed' FROM public.project_phases
          WHERE id = 'aa000000-0000-4000-8000-000000000100'),
    'stale retry must preserve winner';
  ASSERT (SELECT current_phase IS NULL FROM public.projects
          WHERE id = 'a9300000-0000-4000-8000-000000000011'),
    'stale retry must preserve terminal pointer';
END $$;
RESET ROLE;

-- True two-session race. Remote setup is committed because dblink sessions
-- cannot see the rollback-scoped fixtures above. End that transaction first so
-- its trigger DDL locks cannot block the remote fixture; cleanup is explicit
-- and idempotent.
ROLLBACK;

DO $$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_receipt_a text;
  v_receipt_b text;
  v_error_a text;
  v_error_b text;
  v_successes integer;
  v_state record;
BEGIN
  PERFORM extensions.dblink_connect('phase_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'phase_setup',
    'SET lock_timeout = ''5s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'phase_setup',
    $setup$
      DELETE FROM public.projects WHERE id = 'ad300000-0000-4000-8000-000000000001';
      DELETE FROM public.profiles WHERE id = 'ad000000-0000-4000-8000-000000000001';
      DELETE FROM auth.users WHERE id = 'ad000000-0000-4000-8000-000000000001';
      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
        instance_id, aud, role
      ) VALUES (
        'ad000000-0000-4000-8000-000000000001', 'phase-race@test.invalid', '',
        now(), now(), now(), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated'
      );
      INSERT INTO public.projects (
        id, name, designer_id, created_by, status, current_phase
      ) VALUES (
        'ad300000-0000-4000-8000-000000000001', 'Concurrent phase project',
        'ad000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', 'active', 'race-a'
      );
      INSERT INTO public.project_phases (
        id, project_id, name, phase_key, status, progress, sort_order,
        follows_phase_id, lane
      ) VALUES
        ('ad400000-0000-4000-8000-000000000001',
         'ad300000-0000-4000-8000-000000000001', 'Race A', 'race-a',
         'in_progress', 50, 0, NULL, 'main'),
        ('ad400000-0000-4000-8000-000000000002',
         'ad300000-0000-4000-8000-000000000001', 'Race B', 'race-b',
         'pending', 0, 1, 'ad400000-0000-4000-8000-000000000001', 'main');
    $setup$
  );

  PERFORM extensions.dblink_connect('phase_locker', v_conninfo);
  PERFORM extensions.dblink_connect('phase_racer_a', v_conninfo);
  PERFORM extensions.dblink_connect('phase_racer_b', v_conninfo);

  PERFORM extensions.dblink_exec(
    'phase_locker',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'phase_racer_a',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'phase_racer_b',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );

  PERFORM extensions.dblink_exec('phase_locker', 'BEGIN');
  PERFORM locked.id
  FROM extensions.dblink(
    'phase_locker',
    $lock$SELECT id::text FROM public.projects
      WHERE id = 'ad300000-0000-4000-8000-000000000001' FOR UPDATE$lock$
  ) AS locked(id text);

  PERFORM extensions.dblink_exec('phase_racer_a', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'phase_racer_a',
    $claim$SET request.jwt.claims =
      '{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}'$claim$
  );
  PERFORM extensions.dblink_exec('phase_racer_b', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'phase_racer_b',
    $claim$SET request.jwt.claims =
      '{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}'$claim$
  );

  PERFORM extensions.dblink_send_query(
    'phase_racer_a',
    $race$SELECT public.advance_project_phase(
      'ad300000-0000-4000-8000-000000000001',
      'ad400000-0000-4000-8000-000000000001',
      'in_progress'
    )::text$race$
  );
  PERFORM extensions.dblink_send_query(
    'phase_racer_b',
    $race$SELECT public.advance_project_phase(
      'ad300000-0000-4000-8000-000000000001',
      'ad400000-0000-4000-8000-000000000001',
      'in_progress'
    )::text$race$
  );
  PERFORM pg_sleep(0.2);
  ASSERT extensions.dblink_is_busy('phase_racer_a') = 1
     AND extensions.dblink_is_busy('phase_racer_b') = 1,
    'both racers must wait behind the held project lock';

  PERFORM extensions.dblink_exec('phase_locker', 'COMMIT');

  SELECT result.receipt INTO v_receipt_a
  FROM extensions.dblink_get_result('phase_racer_a', false)
    AS result(receipt text);
  v_error_a := extensions.dblink_error_message('phase_racer_a');
  SELECT result.receipt INTO v_receipt_b
  FROM extensions.dblink_get_result('phase_racer_b', false)
    AS result(receipt text);
  v_error_b := extensions.dblink_error_message('phase_racer_b');

  v_successes := (v_error_a = 'OK')::integer + (v_error_b = 'OK')::integer;
  ASSERT v_successes = 1,
    format('exactly one concurrent call must succeed: a=%L b=%L', v_error_a, v_error_b);
  ASSERT (v_error_a = 'OK' AND position('phase status changed' IN v_error_b) > 0)
      OR (v_error_b = 'OK' AND position('phase status changed' IN v_error_a) > 0),
    format('loser must be the CAS rejection: a=%L b=%L', v_error_a, v_error_b);

  SELECT remote.* INTO STRICT v_state
  FROM extensions.dblink(
    'phase_setup',
    $state$SELECT target.status, successor.status, project.current_phase
      FROM public.projects AS project
      JOIN public.project_phases AS target
        ON target.id = 'ad400000-0000-4000-8000-000000000001'
      JOIN public.project_phases AS successor
        ON successor.id = 'ad400000-0000-4000-8000-000000000002'
      WHERE project.id = 'ad300000-0000-4000-8000-000000000001'$state$
  ) AS remote(target_status text, successor_status text, current_phase text);
  ASSERT v_state.target_status = 'completed'
     AND v_state.successor_status = 'in_progress'
     AND v_state.current_phase = 'race-b',
    format('concurrent winner must leave one coherent handoff: %s', v_state);

  PERFORM extensions.dblink_disconnect('phase_racer_b');
  PERFORM extensions.dblink_disconnect('phase_racer_a');
  PERFORM extensions.dblink_disconnect('phase_locker');
  PERFORM extensions.dblink_exec(
    'phase_setup',
    $cleanup$
      DELETE FROM public.projects WHERE id = 'ad300000-0000-4000-8000-000000000001';
      DELETE FROM public.profiles WHERE id = 'ad000000-0000-4000-8000-000000000001';
      DELETE FROM auth.users WHERE id = 'ad000000-0000-4000-8000-000000000001';
    $cleanup$
  );
  PERFORM extensions.dblink_disconnect('phase_setup');
END;
$$;

-- True decision/phase serialization in both directions. A committed gate wins
-- before completion and causes the RPC to reject. Once the RPC wins and holds
-- the completed phase uncommitted, a late gate waits, then rejects after commit.
DO $$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_phase_error text;
  v_late_error text;
  v_phase_receipt text;
  v_remote_id text;
  v_state record;
BEGIN
  PERFORM extensions.dblink_connect('gate_setup', v_conninfo);
  PERFORM extensions.dblink_connect('gate_writer', v_conninfo);
  PERFORM extensions.dblink_connect('gate_phase', v_conninfo);
  PERFORM extensions.dblink_connect('gate_late', v_conninfo);

  PERFORM extensions.dblink_exec(
    'gate_setup',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'gate_writer',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'gate_phase',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec(
    'gate_late',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );

  PERFORM extensions.dblink_exec(
    'gate_setup',
    $setup$
      DELETE FROM public.client_decisions
      WHERE id IN (
        'ae500000-0000-4000-8000-000000000001',
        'ae500000-0000-4000-8000-000000000002'
      );
      DELETE FROM public.projects
      WHERE id = 'ae300000-0000-4000-8000-000000000001';
      DELETE FROM public.designer_clients
      WHERE id = 'ae200000-0000-4000-8000-000000000001';
      DELETE FROM public.profiles
      WHERE id IN (
        'ae000000-0000-4000-8000-000000000001',
        'ae000000-0000-4000-8000-000000000002'
      );
      DELETE FROM auth.users
      WHERE id IN (
        'ae000000-0000-4000-8000-000000000001',
        'ae000000-0000-4000-8000-000000000002'
      );

      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
        instance_id, aud, role
      ) VALUES
        ('ae000000-0000-4000-8000-000000000001',
         'phase-gate-owner@test.invalid', '', now(), now(), now(),
         '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
        ('ae000000-0000-4000-8000-000000000002',
         'phase-gate-client@test.invalid', '', now(), now(), now(),
         '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
      INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
      VALUES
        ('ae000000-0000-4000-8000-000000000001',
         'phase-gate-owner@test.invalid', 'Phase Gate Owner', now(), now()),
        ('ae000000-0000-4000-8000-000000000002',
         'phase-gate-client@test.invalid', 'Phase Gate Client', now(), now())
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.designer_clients (
        id, designer_id, client_id, client_name, status, source
      ) VALUES (
        'ae200000-0000-4000-8000-000000000001',
        'ae000000-0000-4000-8000-000000000001',
        'ae000000-0000-4000-8000-000000000002',
        'Phase Gate Client', 'active', 'direct'
      );
      INSERT INTO public.projects (
        id, name, designer_id, client_id, created_by, status, current_phase
      ) VALUES (
        'ae300000-0000-4000-8000-000000000001',
        'Concurrent decision gate project',
        'ae000000-0000-4000-8000-000000000001',
        'ae000000-0000-4000-8000-000000000002',
        'ae000000-0000-4000-8000-000000000001',
        'active', 'gate-race'
      );
      INSERT INTO public.project_phases (
        id, project_id, name, phase_key, status, progress, sort_order,
        follows_phase_id, lane
      ) VALUES (
        'ae400000-0000-4000-8000-000000000001',
        'ae300000-0000-4000-8000-000000000001',
        'Gate race phase', 'gate-race', 'in_progress', 50, 0, NULL, 'main'
      );
    $setup$
  );

  PERFORM extensions.dblink_exec('gate_writer', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'gate_writer',
    $claim$SET request.jwt.claims =
      '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}'$claim$
  );
  PERFORM extensions.dblink_exec('gate_phase', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'gate_phase',
    $claim$SET request.jwt.claims =
      '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}'$claim$
  );
  PERFORM extensions.dblink_exec('gate_late', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'gate_late',
    $claim$SET request.jwt.claims =
      '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}'$claim$
  );

  -- Gate-first ordering: the uncommitted checked create owns its decision row
  -- and the phase lock. Completion waits; after commit its rescan sees one blocker.
  PERFORM extensions.dblink_exec('gate_writer', 'BEGIN');
  SELECT result.id INTO STRICT v_remote_id
  FROM extensions.dblink(
    'gate_writer',
    $gate$
      SELECT (public.create_client_decision(
        'ae500000-0000-4000-8000-000000000001',
        jsonb_build_object(
          'designer_client_id', 'ae200000-0000-4000-8000-000000000001',
          'project_id', 'ae300000-0000-4000-8000-000000000001',
          'phase_id', 'ae400000-0000-4000-8000-000000000001',
          'title', 'Gate committed before completion',
          'decision_type', 'approval',
          'status', 'pending',
          'blocks_kind', 'phase',
          'blocking_status', 'non_blocking'
        )
      )).id::text
    $gate$
  ) AS result(id text);
  PERFORM extensions.dblink_send_query(
    'gate_phase',
    $phase$SELECT public.advance_project_phase(
      'ae300000-0000-4000-8000-000000000001',
      'ae400000-0000-4000-8000-000000000001',
      'in_progress'
    )::text$phase$
  );
  PERFORM pg_sleep(0.2);
  ASSERT extensions.dblink_is_busy('gate_phase') = 1,
    'completion must wait behind the uncommitted exact-phase gate';
  PERFORM extensions.dblink_exec('gate_writer', 'COMMIT');
  SELECT result.receipt INTO v_phase_receipt
  FROM extensions.dblink_get_result('gate_phase', false)
    AS result(receipt text);
  v_phase_error := extensions.dblink_error_message('gate_phase');
  ASSERT position('1 unresolved phase blocker(s)' IN v_phase_error) > 0,
    format('gate-first completion must reject: %L', v_phase_error);

  -- libpq leaves an async error result pending on a reusable dblink
  -- connection. Reconnect before exercising the opposite ordering.
  PERFORM extensions.dblink_disconnect('gate_phase');
  PERFORM extensions.dblink_connect('gate_phase', v_conninfo);
  PERFORM extensions.dblink_exec(
    'gate_phase',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s'''
  );
  PERFORM extensions.dblink_exec('gate_phase', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'gate_phase',
    $claim$SET request.jwt.claims =
      '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}'$claim$
  );

  PERFORM extensions.dblink_exec(
    'gate_setup',
    $respond$UPDATE public.client_decisions
      SET status = 'responded', responded_at = now()
      WHERE id = 'ae500000-0000-4000-8000-000000000001'$respond$
  );

  -- Completion-first ordering: keep the successful phase RPC transaction open
  -- while the late checked create waits on its phase lock. After commit, the
  -- guard observes completed and rejects the new blocker.
  PERFORM extensions.dblink_exec('gate_phase', 'BEGIN');
  SELECT result.receipt INTO STRICT v_phase_receipt
  FROM extensions.dblink(
    'gate_phase',
    $phase$SELECT public.advance_project_phase(
      'ae300000-0000-4000-8000-000000000001',
      'ae400000-0000-4000-8000-000000000001',
      'in_progress'
    )::text$phase$
  ) AS result(receipt text);
  ASSERT position('"terminal": true' IN v_phase_receipt) > 0,
    format('completion-first RPC must succeed before commit: %s', v_phase_receipt);

  PERFORM extensions.dblink_send_query(
    'gate_late',
    $late$
      SELECT (public.create_client_decision(
        'ae500000-0000-4000-8000-000000000002',
        jsonb_build_object(
          'designer_client_id', 'ae200000-0000-4000-8000-000000000001',
          'project_id', 'ae300000-0000-4000-8000-000000000001',
          'phase_id', 'ae400000-0000-4000-8000-000000000001',
          'title', 'Gate attempted after completion',
          'decision_type', 'approval',
          'status', 'pending',
          'blocks_kind', 'phase',
          'blocking_status', 'non_blocking'
        )
      )).id::text
    $late$
  );
  PERFORM pg_sleep(0.2);
  ASSERT extensions.dblink_is_busy('gate_late') = 1,
    'late gate must wait behind the uncommitted completion';
  PERFORM extensions.dblink_exec('gate_phase', 'COMMIT');
  SELECT result.id INTO v_remote_id
  FROM extensions.dblink_get_result('gate_late', false)
    AS result(id text);
  v_late_error := extensions.dblink_error_message('gate_late');
  ASSERT position(
    'client_decisions cannot add an unresolved blocker to a completed phase'
    IN v_late_error
  ) > 0, format('completion-first late gate must reject: %L', v_late_error);

  SELECT remote.* INTO STRICT v_state
  FROM extensions.dblink(
    'gate_setup',
    $state$SELECT phase.status,
                   project.current_phase,
                   EXISTS (
                     SELECT 1 FROM public.client_decisions
                     WHERE id = 'ae500000-0000-4000-8000-000000000002'
                   )
      FROM public.project_phases AS phase
      JOIN public.projects AS project ON project.id = phase.project_id
      WHERE phase.id = 'ae400000-0000-4000-8000-000000000001'$state$
  ) AS remote(phase_status text, current_phase text, late_gate_exists boolean);
  ASSERT v_state.phase_status = 'completed'
     AND v_state.current_phase IS NULL
     AND NOT v_state.late_gate_exists,
    format('completion-first state must remain coherent: %s', v_state);

  PERFORM extensions.dblink_disconnect('gate_late');
  PERFORM extensions.dblink_disconnect('gate_phase');
  PERFORM extensions.dblink_disconnect('gate_writer');
  PERFORM extensions.dblink_exec(
    'gate_setup',
    $cleanup$
      DELETE FROM public.client_decisions
      WHERE id IN (
        'ae500000-0000-4000-8000-000000000001',
        'ae500000-0000-4000-8000-000000000002'
      );
      DELETE FROM public.projects
      WHERE id = 'ae300000-0000-4000-8000-000000000001';
      DELETE FROM public.designer_clients
      WHERE id = 'ae200000-0000-4000-8000-000000000001';
      DELETE FROM public.profiles
      WHERE id IN (
        'ae000000-0000-4000-8000-000000000001',
        'ae000000-0000-4000-8000-000000000002'
      );
      DELETE FROM auth.users
      WHERE id IN (
        'ae000000-0000-4000-8000-000000000001',
        'ae000000-0000-4000-8000-000000000002'
      );
    $cleanup$
  );
  PERFORM extensions.dblink_disconnect('gate_setup');
END;
$$;
