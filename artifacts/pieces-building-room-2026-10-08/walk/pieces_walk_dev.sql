-- SQ-588 US-20 B0 Walk fixture: additive only, prefixed ids (e5880000-...), never touches existing rows.
-- Project resembling "Whole Home Renovation" in Leah's studio (designer_id = a0000000-0000-0000-0000-000000000004,
-- studio_id = b0000000-0000-0000-0000-000000000001), with the seven rooms the brief names.
-- Applied once via: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f walk/pieces_walk_dev.sql

insert into projects (id, name, status, created_by, designer_id, studio_id)
values (
  'e5880000-0000-4000-8000-000000000001',
  'Whole Home Renovation',
  'active',
  'a0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000004',
  'b0000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into project_rooms (id, project_id, name, sort_order)
values
  ('e5880000-0000-4000-8000-000000000002', 'e5880000-0000-4000-8000-000000000001', 'Hall', 1),
  ('e5880000-0000-4000-8000-000000000003', 'e5880000-0000-4000-8000-000000000001', 'Living Room', 2),
  ('e5880000-0000-4000-8000-000000000004', 'e5880000-0000-4000-8000-000000000001', 'Dining', 3),
  ('e5880000-0000-4000-8000-000000000005', 'e5880000-0000-4000-8000-000000000001', 'Kitchen', 4),
  ('e5880000-0000-4000-8000-000000000006', 'e5880000-0000-4000-8000-000000000001', 'Primary Bath', 5),
  ('e5880000-0000-4000-8000-000000000007', 'e5880000-0000-4000-8000-000000000001', 'Sunroom', 6),
  ('e5880000-0000-4000-8000-000000000008', 'e5880000-0000-4000-8000-000000000001', 'Bedroom', 7)
on conflict (id) do nothing;

-- Lines (the Sunroom mistake, the Living Room rough-in, etc.) are added through the designer-portal
-- UI's "Add a line" flow during the walk itself, not via SQL — project_ffe_items rows go through
-- create_named_project_need (00435) and its selection-thread/trigger plumbing, and the UI path is
-- also the thing being walked. See WALK.md Setup and step log.
