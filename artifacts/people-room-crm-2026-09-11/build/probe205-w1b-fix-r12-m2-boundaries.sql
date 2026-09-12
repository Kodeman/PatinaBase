\pset pager off
-- probe205 (r12 FIX, M2) — the auto-link's boundaries, walked:
--   · a card in ANOTHER studio never stamps a seat of this one
--   · a refused (opted_out) seat is stamped without touching a consent column
--     or phone/phone_e164, so R-AX's freeze never fires
--   · the stamp the trigger writes is the one assert_project_party_cards()
--     would accept — a foreign card is still refused by hand
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE d uuid; foreign_card uuid; n int; pete uuid; pete_ph text; st text;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';

  -- (1) a person card of Phase One Synthetic Studio on a number an LDS seat
  -- carries
  INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, phone, created_by)
  VALUES ('cf120000-0000-4000-8000-000000000001','person','trade','Foreign Card','+16125559955', d)
  RETURNING id INTO foreign_card;
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164, trade)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Foreign Seat','+16125559955','hvac');
  SELECT count(*) INTO n FROM public.project_parties
   WHERE display_name='Foreign Seat' AND studio_contact_id IS NULL;
  RAISE NOTICE 'CROSS-TENANT: a card of another studio stamped nothing (unstamped seats = % of 1)', n;

  -- and the hand-written stamp is still refused by the r11 MAJOR-3 guard
  BEGIN
    UPDATE public.project_parties SET studio_contact_id = foreign_card
     WHERE display_name='Foreign Seat';
    RAISE NOTICE 'CROSS-TENANT: UNEXPECTED — the foreign stamp landed';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CROSS-TENANT: hand-written foreign stamp still refused: %', SQLERRM;
  END;

  -- (2) a REFUSED seat: Pete Rusk, opted_out on +16125550112
  SELECT id, phone_e164 INTO pete, pete_ph FROM public.project_parties
   WHERE phone_e164='+16125550112' LIMIT 1;
  RAISE NOTICE 'R-AX: Pete seat=% phone=% frozen-consent status=%',
    pete, pete_ph, (SELECT sms_consent_status FROM public.project_parties WHERE id=pete);

  -- a fresh unstamped seat on his number, auto-linked, with the freeze live
  INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164, trade)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Pete Rusk', pete_ph, 'electrical');
  SELECT count(*) INTO n FROM public.project_parties
   WHERE phone_e164 = pete_ph AND studio_contact_id IS NOT NULL;
  RAISE NOTICE 'R-AX: seats on Pete''s number now carrying his card: %', n;
  SELECT channel_consent_status INTO st FROM (
    SELECT public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms', pete_ph) AS channel_consent_status
  ) x;
  RAISE NOTICE 'R-AY: the RECORD still decides, and it still says: %', st;

  -- the freeze itself, unchanged by any of this. NOTE, recorded and NOT a
  -- finding of this fix: refuse_legacy_consent_write() keys its phone clause
  -- on OLD.sms_consent_status = 'opted_out', the FROZEN seat column, and this
  -- seeded seat reads 'not_asked' there while the RECORD says opted_out — so
  -- the number moves. That is R-AX's own shape meeting R-AY's frozen column;
  -- nothing in the r12 fix touches either, and the control below proves the
  -- clause still fires on a seat whose frozen column does say opted_out.
  BEGIN
    UPDATE public.project_parties SET phone_e164='+16125550999' WHERE id=pete;
    RAISE NOTICE 'R-AX: the number moved — the seat''s FROZEN column reads %, not opted_out (pre-existing, see note)',
      (SELECT sms_consent_status FROM public.project_parties WHERE id=pete);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'R-AX: refused: %', SQLERRM;
  END;

  -- control: a seat whose FROZEN column says opted_out is still frozen, and
  -- the auto-link trigger sitting in front of it changes nothing
  SELECT id INTO pete FROM public.project_parties
   WHERE sms_consent_status = 'opted_out' LIMIT 1;
  IF pete IS NULL THEN
    INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164, sms_consent_status)
    VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Frozen Control','+16125559966','opted_out')
    RETURNING id INTO pete;
  END IF;
  BEGIN
    UPDATE public.project_parties SET phone_e164='+16125559967' WHERE id=pete;
    RAISE NOTICE 'R-AX CONTROL: UNEXPECTED — an opted_out seat''s number moved';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'R-AX CONTROL: an opted_out seat''s number is still frozen: %', SQLERRM;
  END;
END $$;
ROLLBACK;
