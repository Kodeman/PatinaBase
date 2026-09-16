-- QA-1 (w2 fix r4): the recovery re-read must key on the STORED value.
-- Dana Kowalski's card already holds her mobile; the Add sheet types it raw.
\set ON_ERROR_ROLLBACK interactive
BEGIN;
SELECT value AS stored_on_danas_card
  FROM studio_contact_channels
 WHERE owner_id = 'd0e10000-0000-0000-0000-000000000011' AND channel_kind = 'mobile';

-- 1. the insert the Add sheet makes on a returning sub: raises 23505.
SAVEPOINT s1;
INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable, preferred)
VALUES ('person', 'd0e10000-0000-0000-0000-000000000011', 'mobile', '(612) 555-0111', true, true);
ROLLBACK TO SAVEPOINT s1;

-- 2. the OLD recovery read, keyed on the typed string: no row -> re-throws 23505.
SELECT count(*) AS old_recovery_rows
  FROM studio_contact_channels
 WHERE owner_id = 'd0e10000-0000-0000-0000-000000000011'
   AND channel_kind = 'mobile'
   AND value = '(612) 555-0111';

-- 3. the NEW recovery read, keyed through the DB's own rule: the standing row.
SELECT count(*) AS new_recovery_rows, min(status) AS status, bool_or(preferred) AS preferred
  FROM studio_contact_channels
 WHERE owner_id = 'd0e10000-0000-0000-0000-000000000011'
   AND channel_kind = 'mobile'
   AND value = public.normalize_channel_value('mobile', '(612) 555-0111');
ROLLBACK;
