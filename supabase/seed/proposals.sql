-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: One accepted proposal so the proposal→project fast-path is testable.
-- Idempotent via fixed UUID + ON CONFLICT.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.proposals (
  id,
  designer_id,
  client_id,
  title,
  description,
  status,
  subtotal,
  total_amount,
  accepted_at,
  created_at,
  updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000004',  -- designer@patina.dev
  'a0000000-0000-0000-0000-000000000005',  -- client@patina.dev
  'Sample accepted proposal',
  'Pre-seeded proposal in accepted status. Used to exercise the proposal-to-project activation flow in local dev.',
  'accepted',
  10000000,
  10000000,
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
