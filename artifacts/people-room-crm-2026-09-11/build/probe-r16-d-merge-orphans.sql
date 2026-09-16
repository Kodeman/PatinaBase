-- r16 probe D — merge: transactional, no orphan, directory folds, resolver,
-- the two refused kind pairs, and the archive door.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

-- a duplicate of Pete Rusk, the ordinary shared-phone duplicate
INSERT INTO studio_contacts (id, organization_id, entity_kind, full_name,
                             contact_kind, created_by)
VALUES ('aa000000-0000-4000-8000-00000000d001',
        'b0000000-0000-0000-0000-000000000001', 'person', 'Pete Rusk (dup)',
        'trade', 'a0000000-0000-0000-0000-000000000004');

INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value,
                                     status, status_at, verified, preferred,
                                     sms_capable, label)
VALUES ('person','aa000000-0000-4000-8000-00000000d001','mobile','+15555550199',
        'unsubscribed', now() - interval '30 days', true, true, true, 'Shop line');

SELECT 'D-a merge -> ' || public.merge_studio_contacts(
  'd0e10000-0000-0000-0000-000000000012',
  'aa000000-0000-4000-8000-00000000d001', 'phone')::text;

RESET ROLE;
-- every FK column into studio_contacts, swept for a residual pointer
SELECT 'D-b residual pointers at the folded card: ' ||
  COALESCE(string_agg(t.rel || '.' || t.col || '=' || t.n, ', '
                      ORDER BY t.rel, t.col), 'none')
FROM (
  SELECT c.conrelid::regclass::text AS rel, a.attname::text AS col,
         (SELECT count(*) FROM pg_class x WHERE false) AS z,
         (xpath('/row/c/text()',
                query_to_xml(format(
                  'select count(*) as c from %s where %I = %L',
                  c.conrelid::regclass, a.attname,
                  'aa000000-0000-4000-8000-00000000d001'), false, true, '')))[1]::text::int AS n
  FROM pg_constraint c
  JOIN unnest(c.conkey) k(attnum) ON true
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
  WHERE c.contype='f' AND c.confrelid='public.studio_contacts'::regclass
) t WHERE t.n > 0;

SET LOCAL ROLE authenticated;
SELECT 'D-c directory rows for the folded id: ' ||
       (SELECT count(*)::text FROM people_directory
         WHERE person_id='aa000000-0000-4000-8000-00000000d001')
     || ' ; for the survivor: ' ||
       (SELECT count(*)::text FROM people_directory
         WHERE person_id='d0e10000-0000-0000-0000-000000000012');

SELECT 'D-d resolve_merged_contact(folded) = ' ||
       COALESCE(public.resolve_merged_contact('aa000000-0000-4000-8000-00000000d001')::text,'<null>');

SELECT 'D-e the absorbed unsubscribe survived on the survivor: ' ||
       COALESCE((SELECT status || ' / verified=' || verified::text
                   || ' / preferred=' || preferred::text
                   || ' / sms_capable=' || sms_capable::text
                 FROM studio_contact_channels
                  WHERE owner_id='d0e10000-0000-0000-0000-000000000012'
                    AND value='+15555550199'), '<no row>');
ROLLBACK;
