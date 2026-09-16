\pset pager off
BEGIN;
-- A shipped (pre-00636) link, simulated: plaintext gone, hash present.
INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fb010000-0000-4000-8000-00000000000a','design_studio','R11 Inv Studio','r11-inv','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fb010000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET status='active';
INSERT INTO public.projects (id,name,designer_id,studio_id,status,created_by,client_visibility_tier) VALUES
 ('fb310000-0000-4000-8000-00000000000a','R11 inv job','a0000000-0000-0000-0000-000000000004','fb010000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full');
INSERT INTO public.invoices (id,project_id,designer_id,invoice_number,status,total_cents,amount_paid_cents,currency,issue_date,due_date,sent_at)
VALUES ('fb410000-0000-4000-8000-00000000000a','fb310000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004','INV-R11-1','sent',250000,0,'usd',CURRENT_DATE,CURRENT_DATE+14,now());

DO $$
DECLARE v_tok text := encode(extensions.gen_random_bytes(32),'hex'); v_link uuid; r jsonb;
BEGIN
  INSERT INTO public.invoice_links (id, invoice_id, token, token_hash, status, expires_at, created_by)
  VALUES (gen_random_uuid(),'fb410000-0000-4000-8000-00000000000a', NULL,
          public.invoice_link_token_hash(v_tok), 'active', now()+interval '30 days',
          'a0000000-0000-0000-0000-000000000004')
  RETURNING id INTO v_link;
  PERFORM set_config('r11.paytok', v_tok, true);
  PERFORM set_config('r11.paylink', v_link::text, true);

  -- the hashed lookup works (a /pay link shipped before 00636 still opens)
  r := to_jsonb(public.resolve_invoice_link(v_tok));
  IF r IS NULL OR (r->'invoice'->>'number') IS DISTINCT FROM 'INV-R11-1' THEN
    RAISE EXCEPTION 'P10 FAIL: a pre-00636 /pay address no longer opens: %', left(r::text,200);
  END IF;
  RAISE NOTICE 'P10 pass: the backfilled /pay address opens — sheet=%, number=%, payable=%',
    r->>'sheet', r->'invoice'->>'number', r->'pay'->>'payable';

  -- a plaintext-shaped lookup of the STORED HASH must fail closed
  r := to_jsonb(public.resolve_invoice_link(public.invoice_link_token_hash(v_tok)));
  IF r IS NOT NULL AND (r->'invoice') IS NOT NULL THEN
    RAISE EXCEPTION 'P10 FAIL: the stored hash opened the door: %', left(r::text,200);
  END IF;
  RAISE NOTICE 'P10 pass: the stored hash, replayed as a token, is refused (answer=%)', COALESCE(left(r::text,60),'<null>');
  r := to_jsonb(public.resolve_invoice_link('not-a-token'));
  IF r IS NOT NULL AND (r->'invoice') IS NOT NULL THEN RAISE EXCEPTION 'P10 FAIL: garbage opened the door'; END IF;

  -- checkout resolver on the same token
  r := to_jsonb(public.resolve_invoice_link_for_checkout(v_tok));
  RAISE NOTICE 'P10: resolve_invoice_link_for_checkout(raw) -> %', COALESCE(left(r::text,120),'<null>');
END $$;

-- P11: no plaintext anywhere after the backfill; the freeze CHECK holds
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.invoice_links WHERE token IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'P11 FAIL: % plaintext tokens survive', n; END IF;
  BEGIN
    UPDATE public.invoice_links SET token = 'x' WHERE id = current_setting('r11.paylink')::uuid;
    RAISE EXCEPTION 'P11 FAIL: plaintext write accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  SELECT count(*) INTO n FROM public.invoice_links WHERE token_hash IS NULL AND status='active';
  IF n <> 0 THEN RAISE EXCEPTION 'P11 FAIL: % active links without a hash', n; END IF;
  RAISE NOTICE 'P11 pass: plaintext gone, frozen, every active link hashed';
END $$;

-- P12: a PAYER-BORNE attempt that rode the nonce holds the letter (R-BZ)
DO $$
DECLARE v_att uuid; v_hold boolean; v_tok text;
BEGIN
  INSERT INTO public.invoice_checkout_attempts
    (id, invoice_id, payer_id, stripe_customer_id, amount_cents, currency, stripe_idempotency_key, state, return_nonce, created_at, updated_at)
  VALUES (gen_random_uuid(),'fb410000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004','cus_r11probe',250000,'usd','idem-r11-probe','claimed',encode(extensions.gen_random_bytes(32),'hex'),now(),now())
  RETURNING id INTO v_att;
  SELECT public.invoice_letter_must_hold('fb410000-0000-4000-8000-00000000000a') INTO v_hold;
  IF NOT v_hold THEN RAISE EXCEPTION 'P12 FAIL: in-flight attempt does not hold'; END IF;
  v_tok := public.ensure_invoice_link('fb410000-0000-4000-8000-00000000000a');
  IF v_tok IS NOT NULL THEN RAISE EXCEPTION 'P12 FAIL: mint during flight'; END IF;

  -- finalize it as a payer-borne, nonce-riding success
  PERFORM public.stamp_invoice_checkout_return_origin(v_att, 'https://client.example');
  UPDATE public.invoice_checkout_attempts
     SET state='succeeded', stripe_checkout_session_id='cs_r11_probe', finalized_at = now() - interval '2 hours', updated_at = now() - interval '2 hours'
   WHERE id = v_att;
  SELECT public.invoice_letter_must_hold('fb410000-0000-4000-8000-00000000000a') INTO v_hold;
  IF NOT v_hold THEN RAISE EXCEPTION 'P12 FAIL: payer-borne nonce attempt does not hold inside 24h'; END IF;

  UPDATE public.invoice_checkout_attempts
     SET finalized_at = now() - interval '30 hours', updated_at = now() - interval '30 hours'
   WHERE id = v_att;
  SELECT public.invoice_letter_must_hold('fb410000-0000-4000-8000-00000000000a') INTO v_hold;
  IF v_hold THEN RAISE EXCEPTION 'P12 FAIL: hold never lifts'; END IF;
  v_tok := public.ensure_invoice_link('fb410000-0000-4000-8000-00000000000a');
  IF v_tok IS NULL OR v_tok !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'P12 FAIL: no mint after the window'; END IF;
  RAISE NOTICE 'P12 pass: payer-borne nonce attempt holds for 24h, then the letter mints again';
END $$;

-- P13: the old address dies when a new one is minted (regenerate-on-send)
DO $$
DECLARE v_old text := current_setting('r11.paytok'); r jsonb; v_new text;
BEGIN
  DELETE FROM public.invoice_checkout_attempts WHERE invoice_id='fb410000-0000-4000-8000-00000000000a';
  v_new := public.ensure_invoice_link('fb410000-0000-4000-8000-00000000000a');
  r := to_jsonb(public.resolve_invoice_link(v_old));
  IF r IS NOT NULL AND (r->'invoice') IS NOT NULL THEN
    RAISE EXCEPTION 'P13 FAIL: the previous address still opens after a fresh mint';
  END IF;
  RAISE NOTICE 'P13 pass: the previous address is dead (answer=%)', COALESCE(left(r::text,60),'<null>');
  r := to_jsonb(public.resolve_invoice_link(v_new));
  IF r IS NULL OR (r->'invoice'->>'number') IS DISTINCT FROM 'INV-R11-1' THEN
    RAISE EXCEPTION 'P13 FAIL: the fresh address does not open';
  END IF;
  RAISE NOTICE 'P13 pass: the fresh address opens on %', r->'invoice'->>'number';
END $$;
ROLLBACK;
