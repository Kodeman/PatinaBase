-- probe135 — r6 MAJOR-1's consequence, closed. Restoring the studio-less
-- job's seats to the studio doing the work also handed that studio the seat's
-- consent WORD — and the record that decides it lives at the org
-- project_consent_org() guesses, which the working studio need not belong to.
-- Measured before the second fix: `not_asked` on a seat whose record says
-- `opted_out`, on the row the composer opens from — r5 MAJOR-1's fail-open
-- word, reintroduced by the wider gate. The COALESCE is now gated on the
-- caller being able to read that record, so unknown prints as NULL.
BEGIN;
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone_e164, trade)
VALUES ('b9100000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-0000000000d1','sub','Studioless Refuser','+16125559992','electrical');
INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status, opt_out_at, opt_out_source)
VALUES (public.project_consent_org('b0000000-0000-0000-0000-0000000000d1'),'sms','+16125559992','opted_out',now(),'inbound_sms');
SELECT (SELECT name FROM public.organizations WHERE id = public.project_consent_org('b0000000-0000-0000-0000-0000000000d1')) AS record_lives_at;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
\echo '-- as the admin of the studio doing the work, who cannot read that record'
SELECT phone_e164, consent_status FROM public.people_directory_seats
 WHERE seat_id = 'b9100000-0000-4000-8000-000000000001';
SELECT display_name, consent_status FROM public.people_directory
 WHERE display_name = 'Studioless Refuser';
SELECT public.channel_consent_status(public.project_consent_org('b0000000-0000-0000-0000-0000000000d1'),'sms','+16125559992') AS raw_word_to_this_caller;
RESET ROLE;
\echo '-- and to a member of the org the record lives at, for contrast'
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT phone_e164, consent_status FROM public.people_directory_seats
 WHERE seat_id = 'b9100000-0000-4000-8000-000000000001';
RESET ROLE;
ROLLBACK;
