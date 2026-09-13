-- W2 round-8 fix evidence, read as designer@patina.dev under RLS.
begin;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '== QA-R8-1 — the seat window vs the stored field-link boundary =='
select pp.display_name,
       pp.on_site_to,
       pp.warranty_until,
       f.expires_at,
       (f.expires_at at time zone 'UTC')::date - 1 as last_open_day
  from public.project_parties pp
  join public.field_link_tokens f on f.party_id = pp.id and f.status = 'active'
 where pp.display_name = 'Dana Kowalski'
   and pp.project_id = 'd0e00000-0000-0000-0000-00000000000a';

\echo '== CR8-1 — the dated paper the roster clause names =='
select c.company_name, d.doc_type, d.number, d.expires_on, d.blocks
  from public.studio_compliance_documents d
  join public.studio_contacts c on c.id = d.holder_id
 where c.company_name = 'Northgate Electric';

\echo '== CR8-2 — which legacy client records actually duplicate a person card =='
with d as (select * from public.people_directory),
cards as (
  select coalesce(profile_id::text,'') pid,
         regexp_replace(coalesce(phone,''),'\D','','g') ph
  from d
  where role = 'contact' and coalesce(meta->>'entity_kind','person') <> 'company'
),
clients as (
  select display_name, profile_id,
         regexp_replace(coalesce(phone,''),'\D','','g') ph
  from d where role = 'client'
)
select c.display_name,
       (c.profile_id is not null and exists (select 1 from cards k where k.pid = c.profile_id::text)) as profile_hits_card,
       (length(c.ph) >= 10 and exists (select 1 from cards k where k.ph = c.ph)) as phone_hits_card
  from clients c order by 1;

\echo '== CR8-2 — the raw two-noun head the room counts from =='
select count(*) filter (where coalesce(meta->>'entity_kind','person') = 'company') as firms,
       count(*) filter (where coalesce(meta->>'entity_kind','person') <> 'company') as people
  from public.people_directory;

\echo '== CR8-3 — the card carries no trade; the seat does =='
select d.display_name,
       d.meta ? 'trade'        as card_has_trade_key,
       d.meta->>'specialties'  as card_specialties,
       s.trade                 as seat_trade
  from public.people_directory d
  left join public.people_directory_seats s
         on s.person_id = d.person_id and s.stage = 'active'
 where d.role = 'contact'
   and coalesce(d.meta->>'contact_kind','') in ('sub','gc','installer','receiver')
   and coalesce(d.meta->>'entity_kind','person') = 'person'
 order by 1 limit 12;

\echo '== CR8-5 — the seat kind cannot answer; the card kind can =='
select pp.display_name, pp.party_kind, sc.contact_kind as card_kind, sc.company_name
  from public.project_parties pp
  join public.studio_contacts sc on sc.id = pp.studio_contact_id
 where pp.display_name in ('Ray Thao','Carol Nyström','Dana Kowalski')
 order by 1;
rollback;
