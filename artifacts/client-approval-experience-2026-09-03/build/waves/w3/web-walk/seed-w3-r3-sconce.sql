-- Wave 3 iOS walk round 3: the three-option spread the brief asks to see fit.
-- Local stack only. Modelled on the seed's own two-option rows (d2c03 "Rug color").
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO public.client_decisions (
  id, designer_client_id, project_id, designer_id, title, context,
  decision_type, decision_kind, coordination_kind, court, blocks_kind,
  blocking_status, phase_id, linked_phase, room_id,
  due_date, sent_at, status, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-0000000d3c01',
  'e4526ae9-d7ef-4eea-a6b0-9d7d99ade1e4',
  'b0000000-0000-0000-0000-0000000000d1',
  'a0000000-0000-0000-0000-000000000004',
  'Entry sconce - three finishes',
  'Three finishes for the entry sconce. The brass warms the plaster; the steel is the quietest.',
  'material', 'choice', 'selection', 'client', 'none',
  'non_blocking',
  'b0000000-0000-0000-0000-00000005c103', 'Procurement',
  'b0000000-0000-0000-0000-0000000d2c0b',
  now() + interval '9 days', now() - interval '2 days', 'pending',
  now() - interval '2 days', now() - interval '2 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_decision_options
  (id, decision_id, name, designer_note, is_recommended, sort_order, price, quantity)
VALUES
  ('c3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000d3c01',
   'Antique Brass', 'Warms the plaster.', true, 0, 42000, 1),
  ('c3000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-0000000d3c01',
   'Blackened Steel', 'The quietest of the three.', false, 1, 39000, 1),
  ('c3000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-0000000d3c01',
   'Aged Nickel', 'Cooler, closer to the stair rail.', false, 2, 41000, 1)
ON CONFLICT (id) DO NOTHING;

UPDATE public.client_decisions
   SET recommended_option_id = 'c3000000-0000-0000-0000-000000000001'
 WHERE id = 'b0000000-0000-0000-0000-0000000d3c01';

COMMIT;

\pset format unaligned
\pset tuples_only on
SELECT (SELECT count(*) FROM public.client_decision_options
         WHERE decision_id = 'b0000000-0000-0000-0000-0000000d3c01')::text
       || ' options on the sconce';
