-- Walk fixture: the studio surface that would create a Trade Agreement is
-- unreachable after execution (finding W3R1-01), so the sub-facing page is
-- reached by minting the agreement through the same RPCs the UI would call,
-- as the designer.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, company_name, email, specialties, created_by)
VALUES
  ('c0000000-0000-4000-8000-00000000ca01', 'e7d0c2a3-8e35-4282-8b32-638b51be95d0',
   'person', 'trade', 'Marta Reyes', 'Reyes Cabinetry', 'marta@reyescabinetry.example',
   ARRAY['cabinetry'], 'a0000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

SET LOCAL role authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text,
  true
);

SELECT public.create_trade_agreement(
  '6bb8a8b7-6d1e-4913-a8ef-954a49528bec',
  'c0000000-0000-4000-8000-00000000ca01',
  jsonb_build_object(
    'title', 'Cabinetry & millwork',
    'scope', 'Fabricate and install the kitchen and mudroom cabinetry and millwork per the issued drawings.',
    'priceCents', 3800000,
    'trade', 'Cabinetry',
    'schedule', jsonb_build_object('startOn', '2026-10-05', 'durationDays', 21),
    'retainageBps', 500,
    'payWhenPaidDays', 7,
    'insuranceCertificateRequired', true,
    'lienWaiverPolicy', 'conditional_then_unconditional',
    'sourceProposalId', '17143662-9354-4f24-87ea-503f818d0bae'
  )
) AS agreement_id \gset

SELECT public.send_trade_agreement(:'agreement_id') AS sent;

COMMIT;

BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
SELECT * FROM public.mint_trade_agreement_token(
  (SELECT id FROM public.studio_trade_agreements
   WHERE project_id = '6bb8a8b7-6d1e-4913-a8ef-954a49528bec' ORDER BY created_at DESC LIMIT 1));
COMMIT;
