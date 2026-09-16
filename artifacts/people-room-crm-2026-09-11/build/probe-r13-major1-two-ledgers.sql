-- W4 r13 MAJOR-1 — the two ledgers an address lives in.
--
-- The fix is edge code (resend-webhook writes profiles.email_suppressed from the
-- same event that writes studio_contact_channels.status), so the deno suite is
-- its gate. This probe only establishes the facts that fix rests on:
--   1. profiles carries the three columns the mirror writes/reads.
--   2. campaign-dispatch's audience filter column is profiles.email_suppressed.
--   3. profiles.email is stored lower-cased, so `eq` on the 00593-normalised
--      channel value matches it — an `ilike` would read `_`/`%` as wildcards.
\set ON_ERROR_STOP on

select 'columns' as probe, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('email', 'email_suppressed', 'email_suppressed_at')
order by column_name;

select 'profiles email casing' as probe,
       count(*) as total,
       count(*) filter (where email is distinct from lower(btrim(email))) as not_normalised
from public.profiles;

select 'channel email casing' as probe,
       count(*) as total,
       count(*) filter (where value is distinct from lower(btrim(value))) as not_normalised
from public.studio_contact_channels
where channel_kind in ('email', 'ap_email');

-- The overlap the finding is about: an address that is BOTH a typed channel and
-- a profiles row. For these, a channel verdict that never reached profiles left
-- campaign-dispatch mailing a dead mailbox.
select 'overlap' as probe, count(*) as addresses
from (
  select distinct c.value
  from public.studio_contact_channels c
  join public.profiles p on p.email = c.value
  where c.channel_kind in ('email', 'ap_email')
) s;
