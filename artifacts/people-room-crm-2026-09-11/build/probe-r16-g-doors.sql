\set ON_ERROR_STOP off
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
-- firm into a person who is NOT a sole proprietor (Chidi): must refuse
SELECT public.merge_studio_contacts(
  'd0e10000-0000-0000-0000-000000000005',
  'd0e20000-0000-0000-0000-000000000001','manual');
ROLLBACK;

-- a PLAIN member of the studio may not archive
BEGIN;
RESET ROLE;
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001','member','active')
ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT public.archive_studio_contact('d0e10000-0000-0000-0000-000000000005');
ROLLBACK;

-- a plain member may not write the merge lineage, nor the notices table
BEGIN;
RESET ROLE;
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001','member','active')
ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
INSERT INTO studio_contact_merges (organization_id, survivor_id, merged_id, matched_on)
VALUES ('b0000000-0000-0000-0000-000000000001',
        'd0e10000-0000-0000-0000-000000000005',
        'd0e10000-0000-0000-0000-000000000004','manual');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
-- the merged_into pointer is not an ordinary column, even for the owner
UPDATE studio_contacts SET merged_into='d0e10000-0000-0000-0000-000000000004'
 WHERE id='d0e10000-0000-0000-0000-000000000005';
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT public.sweep_compliance_expiries();
ROLLBACK;
