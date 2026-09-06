-- The door's paper needs its own terms and at least one role rate before
-- `sign_design_services_agreement_with_trusted_ip` will take a name
-- (00477:306). The first attempt at the door answered 500 `sign_failed` for
-- exactly this reason — a fixture gap, not a defect: the route's own refusal
-- sentence held ("This paper could not be signed just now.").
--
-- Local stack only.
\set ON_ERROR_STOP on
\set QUIET on
\pset pager off
\set DOORPROP '''b0000000-0000-0000-0000-0000000cd004'''

\o /dev/null
BEGIN;
SET LOCAL session_replication_role = 'replica';

INSERT INTO public.proposal_service_terms (
  proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
  retainer_amount_cents, retainer_activation_policy, billing_cadence,
  currency, terms, current_rate_version
) VALUES (
  (:DOORPROP)::uuid,
  'The hall and the stair: survey, plan and specification, added to the standing engagement.',
  '["Measured survey of hall and stair", "Lantern and rail specification"]'::jsonb,
  '["Structural engineering", "Permit expediting"]'::jsonb,
  240000, 0, 'immediate', 'monthly', 'USD',
  'Billed monthly against the ceiling. Either party may end the addendum on thirty days'' notice.',
  1
) ON CONFLICT (proposal_id) DO NOTHING;

INSERT INTO public.proposal_service_rates (
  proposal_id, version, role_name, hourly_rate_cents, sort_order
) VALUES
  ((:DOORPROP)::uuid, 1, 'Principal', 27500, 0),
  ((:DOORPROP)::uuid, 1, 'Designer', 16500, 1)
ON CONFLICT (proposal_id, version, role_name) DO NOTHING;

SET LOCAL session_replication_role = 'origin';
COMMIT;

\o
\pset format unaligned
\pset tuples_only on
SELECT jsonb_build_object(
  'terms', (SELECT count(*) FROM public.proposal_service_terms WHERE proposal_id = (:DOORPROP)::uuid),
  'rates', (SELECT count(*) FROM public.proposal_service_rates WHERE proposal_id = (:DOORPROP)::uuid))::text;
