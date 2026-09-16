-- ═══════════════════════════════════════════════════════════════════════════
-- 00636 — People room CRM · W4 (P3, 2 of 3): CRM-29, the pay link hardened
--
-- CRM-29 (crm-model §5, direction §7 P3): "the invoice pay link is a plaintext
-- token with no expiry, unlike every other token rail" — `00574:63-89`. Every
-- other bearer rail in Patina stores sha256(token) and emits the raw value
-- once (field_link_tokens 00283, fulfillment_evidence_upload_tokens 00364,
-- trade agreement links 00579). invoice_links did not, by a deliberate 00574
-- ruling: four server producers had to re-emit the SAME address for the
-- invoice's life, and K7 said no expiry. This file reverses both.
--
--   token_hash  sha256 of the raw token, hex. UNIQUE. The lookup key.
--   expires_at  30 days, set at every mint. An expired LIVE link dies into the
--               same silence a revoked one does — no "expired" sentence, which
--               would tell a guesser the shape of the guess was right (S2).
--               Expiry is tested BELOW the dead-link branch (W4 r5 F1): a
--               closed link's sheet is a receipt, not a pay door, so it keeps
--               answering withdrawn/settling however old it is. A PAID
--               invoice's link is exempt for the same reason (W4 r7 MAJOR-4):
--               it stays `active`, its sheet is the household's own receipt,
--               and no Checkout can open on it.
--   token       FROZEN NULL. The column stays so the rollback is a widening,
--               and a CHECK holds it at NULL so no later code can refill it.
--
-- WHAT THIS COSTS, stated plainly because it is a behaviour change on a live
-- money rail and every consequence below is intended:
--
--  · ensure_invoice_link now MINTS A FRESH TOKEN on every call and returns it
--    once. It has to: the stored value is a hash, so the old address cannot be
--    re-emitted by anyone, including Patina. "Regenerate on send" (CRM-29) is
--    exactly this. Its callers are letters — invoice-send, invoice-reminders,
--    the two stripe-webhook receipts — so each letter now carries its own live
--    address and the previous letter's address dies. THE ONE NON-LETTER CALLER,
--    create-checkout-session, only needed a boolean ("is there a live link, so
--    may the return ride the nonce form"); it is repointed at the new
--    invoice_link_is_live() rather than minting a token mid-payment and
--    revoking the address the payer is standing on.
--  · get_invoice_link returns {token: NULL, status, expires_at}. There is no
--    token to return. The folio's copy-the-address act is therefore fed by
--    regenerate_invoice_link, which mints and returns one; the hook already
--    writes that answer straight into its cache. A folio opened on an invoice
--    it has not just regenerated therefore has no address to show, and says
--    so in those words — "Patina cannot show you its address again" — rather
--    than "no link yet", which would be false about an invoice whose link the
--    send itself minted (W4 r6 M-1). status and expires_at ride back for
--    exactly that sentence.
--  · resolve_invoice_return_nonce ROTATES, ONCE, ON A SUCCESS ONLY (R-BT).
--    The Stripe return trades a nonce for an address, and there is no stored
--    address left to trade. It mints a fresh token ON THE SAME LINK ROW the
--    attempt was claimed against — the row keeps its id, its Stripe customer
--    and its payer email, so F2 ("a nonce is not an alias for a regenerated
--    token") still holds: it is the same grant, re-addressed for the holder
--    who just proved they came back from Checkout. The function is VOLATILE
--    now, not STABLE. Two things bound it, and both are closed here rather
--    than named as hazards:
--      THE CANCEL PATH. Stripe's cancel_url no longer rides the nonce. The
--      driver hands back the /pay/<token> the client opened (the link rail
--      holds that token from the request) or the signed-in letterbox, so a
--      client who presses Back at Checkout keeps the address in her inbox
--      instead of watching it rotate out from under her (W4 r7 BLOCKING-1).
--      THE SPENT NONCE. §2b adds return_nonce_consumed_at and the function
--      claims it in the same statement it reads the nonce with, so a second
--      GET — back button, prefetch, mail-client scanner, double tap — rotates
--      nothing and answers {"state":"spent"}. The route lands that on
--      /pay/used, which is readable; it can no longer kill the address the
--      first redirect handed the browser (W4 r7 MAJOR-1).
--  · THE MINT GUARD HAS A SWEEP BEHIND IT (§6). ensure_invoice_link refuses
--    to rotate while a Checkout attempt is claimed / session_created /
--    processing; a `processing` row is ACH money in flight, which 00574's
--    hourly sweep never touches, so a lost Stripe result would hold that
--    refusal open on an invoice forever. expire_stale_invoice_checkout_
--    attempts is re-headed here to close processing attempts older than 10
--    days — beyond any honest ACH window — on the same entry, at the same
--    hour, with the same signature (R-BY). The letters do not take the
--    fallback address while the guard stands: they hold (invoice-reminders,
--    invoice-send).
--
-- Lineage (grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql
-- | sort | tail -1, run 2026-09-15):
--   mint_invoice_link_on_issue        00574 → this file
--   ensure_invoice_link               00574 → this file
--   regenerate_invoice_link           00574 → this file
--   get_invoice_link                  00574 → this file
--   resolve_invoice_return_nonce      00574 → this file
--   resolve_invoice_link              00574 → 00588 → this file (00588's body
--                                     verbatim, two lines changed: the lookup
--                                     and the expiry)
--   resolve_invoice_link_for_checkout 00574 → 00588 → this file (00588's body
--                                     verbatim, one predicate changed)
--   invoice_link_token_hash           NEW
--   invoice_link_is_live              NEW
--   expire_stale_invoice_checkout_attempts
--                                     00574 → this file (00574's body verbatim
--                                     except the candidate set, the re-judge,
--                                     and the two reason strings; §6)
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The hash rule, stated once
-- ═══════════════════════════════════════════════════════════════════════════
-- extensions.digest is schema-qualified: pgcrypto lives in `extensions` on
-- Strata and a bare digest() resolves to nothing under a pinned search_path.
CREATE OR REPLACE FUNCTION public.invoice_link_token_hash(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT CASE
    WHEN p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN NULL
    ELSE encode(extensions.digest(p_token, 'sha256'), 'hex')
  END;
$$;

REVOKE ALL ON FUNCTION public.invoice_link_token_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_link_token_hash(text) TO service_role;

COMMENT ON FUNCTION public.invoice_link_token_hash(text) IS
  'sha256(raw invoice link token) as hex, or NULL for anything that is not a '
  '64-hex token. The ONE statement of the lookup rule, so the resolvers and '
  'the producers cannot drift (00636).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The columns, the backfill, and the freeze
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.invoice_links
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Hash what is there, while it is still there.
UPDATE public.invoice_links
   SET token_hash = public.invoice_link_token_hash(token)
 WHERE token_hash IS NULL
   AND token IS NOT NULL;

-- EVERY LIVE LINK GETS A FULL 30 DAYS FROM THIS MIGRATION, not from its own
-- created_at. Dating a shipped link from its creation would kill, at deploy,
-- every pay address a client is already holding — a silent outage on the money
-- rail dressed as a hardening. A dead link keeps the date it died on, which
-- puts it in the past; that is harmless because resolve_invoice_link tests
-- expiry BELOW its dead-link branch (W4 r5 F1), so a client holding a /pay
-- address for an invoice she has already paid still gets the withdrawn sheet
-- rather than DeadLink.
UPDATE public.invoice_links
   SET expires_at = CASE
         WHEN status = 'active' THEN now() + interval '30 days'
         ELSE COALESCE(revoked_at, created_at)
       END
 WHERE expires_at IS NULL;

-- THE COLUMN IS WIDENED BEFORE IT IS EMPTIED, NEVER AFTER (W4 r6 BLOCKING-1).
-- 00574:73 declared `token text NOT NULL`. Nulling the column while that
-- constraint still stands raises 23502 (not_null_violation) on the first row,
-- rolls this whole migration back, and takes 00637/00638 with it. It is invisible on a local
-- box however many times the gate is re-run — `supabase db reset` replays
-- migrations BEFORE seeds, so invoice_links is empty here and the UPDATE
-- touches 0 rows — and fatal on Strata, which holds one row per issued
-- invoice (22 at the 00574 ceremony, one more per invoice since). Nothing
-- below depends on the old order: token_hash is written at :106 and
-- expires_at backfilled at :119, both before the plaintext goes.
-- W7 PREFLIGHT, because a green reset is exactly what this defect produces:
-- before `supabase db push`, assert `select count(*) from public.invoice_links`
-- is > 0 on Strata and dry-run this section inside a transaction that is
-- rolled back. An empty table proves nothing about these three statements.
-- The order is held by supabase/tests/people/w4_invoice_link_freeze_order_test.sql,
-- which replays this section on a probe table that HAS a row, with the old
-- order as its negative control (R-BX).
ALTER TABLE public.invoice_links ALTER COLUMN token DROP NOT NULL;
ALTER TABLE public.invoice_links DROP CONSTRAINT IF EXISTS chk_invoice_links_token;

-- The plaintext goes. Nothing reads it after this statement; the CHECK below
-- is what keeps it gone.
UPDATE public.invoice_links SET token = NULL WHERE token IS NOT NULL;

ALTER TABLE public.invoice_links
  DROP CONSTRAINT IF EXISTS chk_invoice_links_token_frozen;
ALTER TABLE public.invoice_links
  ADD CONSTRAINT chk_invoice_links_token_frozen CHECK (token IS NULL);

ALTER TABLE public.invoice_links
  DROP CONSTRAINT IF EXISTS chk_invoice_links_token_hash;
ALTER TABLE public.invoice_links
  ADD CONSTRAINT chk_invoice_links_token_hash
  CHECK (token_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE public.invoice_links ALTER COLUMN token_hash SET NOT NULL;

DROP INDEX IF EXISTS public.uniq_invoice_links_token;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_links_token_hash
  ON public.invoice_links(token_hash);

COMMENT ON COLUMN public.invoice_links.token IS
  'FROZEN NULL since 00636 (CRM-29). The raw token is emitted once by the '
  'producer that mints it and is never stored; a CHECK holds this column at '
  'NULL so no later code can refill it. Kept rather than dropped so the '
  'rollback is a widening.';
COMMENT ON COLUMN public.invoice_links.token_hash IS
  'sha256(raw token), hex. The lookup key for every resolver (00636).';
COMMENT ON COLUMN public.invoice_links.expires_at IS
  'When this address stops answering — 30 days from its mint, reset by every '
  'regeneration, which is every send (CRM-29). An expired ACTIVE link resolves '
  'to the same NULL a revoked or unknown one does (S2); a closed link is past '
  'expiry by construction and still answers its withdrawn/settling receipt '
  '(W4 r5 F1), and so does a PAID invoice''s link, which stays active and '
  'whose sheet is the household''s own receipt (W4 r7 MAJOR-4). Rows that were '
  'already dead when 00636 ran carry the date they died on.';

-- ── 2b. The return nonce is spent by its first use (R-BT) ──────────────────
-- 00574 minted a nonce per attempt and never marked it used, which was
-- harmless while the return merely READ an address. Since §4 rotates, an
-- unmarked nonce is a loaded gun: any replay of /pay/return/<nonce> — a back
-- button, a browser prefetch, a mail-client link scanner — re-addressed the
-- link and killed the address the previous redirect had just handed the payer.
-- The stamp below is the single-use gate; resolve_invoice_return_nonce claims
-- it in the same statement it reads, so two concurrent GETs cannot both win.
ALTER TABLE public.invoice_checkout_attempts
  ADD COLUMN IF NOT EXISTS return_nonce_consumed_at timestamptz;

COMMENT ON COLUMN public.invoice_checkout_attempts.return_nonce_consumed_at IS
  'When this attempt''s return nonce was resolved — stamped once, by '
  'resolve_invoice_return_nonce, in the statement that claims it. A nonce '
  'carrying this date rotates nothing further: the replay answers '
  '{"state":"spent"} and the payer lands on /pay/used rather than on a dead '
  'address (00636, R-BT).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The producers — mint the hash, emit the raw once
-- ═══════════════════════════════════════════════════════════════════════════

-- The issue trigger (00574 §2). It still mints a row so the invoice has a live
-- grant the moment it is issued, and the partial unique index still has its
-- one owner; the raw token it makes is discarded unread, which is honest —
-- the first letter regenerates and that is the address anybody holds.
CREATE OR REPLACE FUNCTION public.mint_invoice_link_on_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  INSERT INTO public.invoice_links (invoice_id, token_hash, expires_at, created_by)
  VALUES (
    NEW.id,
    encode(extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'), 'hex'),
    now() + interval '30 days',
    (SELECT pr.id FROM public.profiles pr WHERE pr.id = NEW.designer_id)
  )
  ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- M12: this trigger sits on the money path. A missing link is recoverable
  -- via ensure_invoice_link; a failed payment settlement is not.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_invoice_link_on_issue()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.mint_invoice_link_on_issue() IS
  'Trigger (00574 §2, re-headed 00636): mints the invoice''s first link row on '
  'issue, storing only sha256 and a 30-day expiry. The raw token is discarded '
  'unread — the first send regenerates and emits the address a client holds.';

-- ensure_invoice_link — the letter's address. MINTS EVERY TIME (see banner).
CREATE OR REPLACE FUNCTION public.ensure_invoice_link(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_status   text;
  v_designer uuid;
  v_token    text;
BEGIN
  SELECT status, designer_id INTO v_status, v_designer
  FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_status NOT IN ('sent','partially_paid','paid') THEN
    RETURN NULL;
  END IF;

  -- A Checkout in flight owns the address it is standing on: regenerating
  -- under it would kill the payer's own page mid-payment, which is exactly
  -- what regenerate_invoice_link refuses (M11). The live link keeps answering;
  -- this letter has no fresh address to carry and its caller falls back to the
  -- signed-in /?invoice=<id> letterbox (M7, letterFallbackUrl) — NOT
  -- /invoices/<id>, which the client portal has no page for (W4 r6 MAJOR-1).
  -- The automated dunning letter does not take that fallback at all: an
  -- invoice with an attempt in these three states is held out of the
  -- invoice-reminders scan, because an invoice being paid is not one to chase.
  IF EXISTS (
    SELECT 1 FROM invoice_checkout_attempts
    WHERE invoice_id = p_invoice_id
      AND state IN ('claimed','session_created','processing')
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE invoice_links
     SET status = 'revoked', revoked_at = now()
   WHERE invoice_id = p_invoice_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO invoice_links (invoice_id, token_hash, expires_at, created_by)
  VALUES (
    p_invoice_id,
    public.invoice_link_token_hash(v_token),
    now() + interval '30 days',
    (SELECT pr.id FROM profiles pr WHERE pr.id = v_designer)
  )
  ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING;

  IF NOT FOUND THEN
    -- J19: another letter going out won the partial unique index between the
    -- revoke and this insert. Its token is the live one and this call has no
    -- address to emit; NULL is the M7 safety valve the callers already draw.
    RETURN NULL;
  END IF;

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.ensure_invoice_link(uuid) IS
  'Service-only: MINT a fresh pay-link token for an issued invoice and return '
  'the raw value once (00636 — the stored value is a hash, so no address can '
  'be re-emitted). Revokes the prior active link: CRM-29''s "regenerate on '
  'send", and every caller is a letter. NULL for a draft/void/missing '
  'invoice, while a Checkout attempt is live (the payer''s address may not be '
  'pulled out from under them, M11), or on a lost mint race — the M7 safety '
  'valve the callers already fall back from.';

-- Regenerate (00574 §9). Unchanged in gate and refusals; mints the hash.
CREATE OR REPLACE FUNCTION public.regenerate_invoice_link(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_status text;
  v_token  text;
BEGIN
  IF NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  SELECT status INTO v_status FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;
  IF v_status NOT IN ('sent','partially_paid','paid') THEN
    RAISE EXCEPTION 'invoice_link_not_payable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM invoice_checkout_attempts
    WHERE invoice_id = p_invoice_id
      AND state IN ('claimed','session_created','processing')
  ) THEN
    RAISE EXCEPTION 'invoice_checkout_in_progress';
  END IF;

  UPDATE invoice_links
  SET status = 'revoked', revoked_at = now()
  WHERE invoice_id = p_invoice_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO invoice_links (invoice_id, token_hash, expires_at, created_by)
  VALUES (
    p_invoice_id,
    public.invoice_link_token_hash(v_token),
    now() + interval '30 days',
    (SELECT pr.id FROM profiles pr WHERE pr.id = auth.uid())
  )
  ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING;

  IF NOT FOUND THEN
    -- J19, restated for a hashed store: a letter won the index between the
    -- revoke and this insert and holds the only copy of ITS token. There is no
    -- address to hand back, and the honest answer is the refusal the folio
    -- already renders rather than a silent nothing.
    RAISE EXCEPTION 'invoice_link_not_payable';
  END IF;

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.regenerate_invoice_link(uuid) IS
  'Authenticated (can_manage_invoice): revokes the invoice''s active link and '
  'mints a fresh token, returning the raw value ONCE (00636 — it is stored as '
  'sha256 and can never be read back, so this is also the folio''s only way to '
  'obtain a copyable address). Raises invoice_not_found on every authority '
  'failure, invoice_link_not_payable for a draft/void or a lost mint race, and '
  'invoice_checkout_in_progress while an attempt is claimed/session_created/'
  'processing (M11).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The readers
-- ═══════════════════════════════════════════════════════════════════════════

-- Folio + iOS read. There is no token to return any more; the status and the
-- end date are what an authorized reader may still learn.
CREATE OR REPLACE FUNCTION public.get_invoice_link(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_project_client uuid;
  v_can_manage boolean;
  v_result jsonb;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  SELECT client_id INTO v_project_client
  FROM projects WHERE id = v_invoice.project_id;

  v_can_manage := public.can_manage_invoice(p_invoice_id);
  IF NOT (
    v_can_manage
    OR (auth.uid() IS NOT NULL
        AND auth.uid() = coalesce(v_invoice.client_id, v_project_client))
  ) THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;
  -- The household never learns a draft exists.
  IF v_invoice.status = 'draft' AND NOT v_can_manage THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  SELECT jsonb_build_object(
           'token', NULL,
           'status', l.status,
           'expires_at', l.expires_at
         )
  INTO v_result
  FROM invoice_links l
  WHERE l.invoice_id = p_invoice_id
    AND l.status <> 'revoked'
  ORDER BY (l.status = 'active') DESC, l.created_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_invoice_link(uuid) IS
  'Authenticated: {token: NULL, status, expires_at} for an invoice''s current '
  'link, or NULL when none exists. THE TOKEN KEY IS ALWAYS NULL since 00636 — '
  'the address is stored as sha256 and cannot be read back by anyone; '
  'regenerate_invoice_link is the door that hands out a copyable one. Readable '
  'by can_manage_invoice or the household payer only; every denial raises '
  'invoice_not_found.';

-- The boolean create-checkout-session actually needed: may a Checkout return
-- ride the /pay/return/<nonce> form, or must it use today's letterbox address.
-- Asking ensure_invoice_link for this minted a token nobody would ever read
-- and revoked the address the payer was standing on.
CREATE OR REPLACE FUNCTION public.invoice_link_is_live(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoice_links l
     WHERE l.invoice_id = p_invoice_id
       AND l.status = 'active'
       AND (l.expires_at IS NULL OR l.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.invoice_link_is_live(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_link_is_live(uuid) TO service_role;

COMMENT ON FUNCTION public.invoice_link_is_live(uuid) IS
  'Service-only: does this invoice have an active, unexpired link — the one '
  'fact create-checkout-session needed when it was calling ensure_invoice_link '
  'for a boolean (00636). Mints nothing and revokes nothing.';

-- THE STRIPE RETURN — ROTATES ONCE, AND ONLY FOR A SUCCESS (R-BT).
--
-- Two legs of one ruling live here; the third is in the driver.
--
--  · CANCEL NEVER COMES THROUGH HERE. invoiceCheckoutReturnBase now hands
--    Stripe the nonce address for 'success' only; a cancel_url goes back to
--    the /pay/<token> the client opened (the link rail holds that token from
--    the request) or to the signed-in letterbox. A client who presses Back at
--    Stripe therefore lands on the address in her inbox, still live, rather
--    than rotating the link she was about to pay with (W4 r7 BLOCKING-1).
--
--  · A NONCE IS SPENT BY ITS FIRST RESOLUTION. The claim is the UPDATE below:
--    one statement, so two simultaneous GETs cannot both win it. A repeat GET
--    — a back button, a prefetch, a mail-client link scanner, a double tap —
--    answers state 'spent' and rotates NOTHING, so it cannot kill the address
--    the first redirect just handed the browser (W4 r7 MAJOR-1). The route
--    lands a spent nonce on /pay/used, a readable page, never the dead sheet.
--
-- Returns jsonb rather than text because the route needs to tell three
-- outcomes apart and one of them carries no address:
--   {"state":"rotated","token":"<64 hex>"}   first resolution
--   {"state":"spent"}                        already resolved once
--   NULL                                     malformed / unknown / no link
DROP FUNCTION IF EXISTS public.resolve_invoice_return_nonce(text);
CREATE OR REPLACE FUNCTION public.resolve_invoice_return_nonce(p_nonce text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_attempt_id uuid;
  v_link_id    uuid;
  v_token      text;
BEGIN
  IF p_nonce IS NULL OR p_nonce !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  -- The claim. `return_nonce_consumed_at IS NULL` in the WHERE makes this the
  -- single-use gate: the row is stamped and returned in one statement, so a
  -- second caller reads no row and rotates nothing.
  UPDATE public.invoice_checkout_attempts a
     SET return_nonce_consumed_at = now()
   WHERE a.return_nonce = p_nonce
     AND a.return_nonce_consumed_at IS NULL
  RETURNING a.id INTO v_attempt_id;

  IF v_attempt_id IS NULL THEN
    -- Spent, or never existed. Only a nonce that really is on the books reads
    -- as spent; an unknown one keeps 00574's silence (S2).
    IF EXISTS (
      SELECT 1 FROM public.invoice_checkout_attempts a
       WHERE a.return_nonce = p_nonce
    ) THEN
      RETURN jsonb_build_object('state', 'spent');
    END IF;
    RETURN NULL;
  END IF;

  -- 00574's own selection rule, unchanged: the link in force when the attempt
  -- was claimed (active or closed, never revoked, never a later mint) — F2.
  SELECT l.id INTO v_link_id
  FROM public.invoice_checkout_attempts a
  JOIN public.invoice_links l ON l.invoice_id = a.invoice_id
  WHERE a.id = v_attempt_id
    AND l.status <> 'revoked'
    AND l.created_at <= a.created_at
  ORDER BY (l.status = 'active') DESC, l.created_at DESC
  LIMIT 1;

  IF v_link_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.invoice_links
     SET token_hash = public.invoice_link_token_hash(v_token),
         expires_at = now() + interval '30 days'
   WHERE id = v_link_id;

  RETURN jsonb_build_object('state', 'rotated', 'token', v_token);
END;
$$;

COMMENT ON FUNCTION public.resolve_invoice_return_nonce(text) IS
  'Service-only: the address behind a SUCCESSFUL Checkout return '
  '(/pay/return/<nonce> → /pay/<token>). Since 00636 it ROTATES rather than '
  'reads: the stored value is a hash, so the SAME link row the attempt was '
  'claimed against (F2 — never a later mint, never a revoked one) is '
  're-addressed with a fresh token and a fresh 30 days, and the raw value is '
  'returned once to the holder who just proved they came back from Checkout. '
  'SINGLE USE (R-BT): the first resolution stamps return_nonce_consumed_at in '
  'the same statement that claims it, so a replayed GET answers '
  '{"state":"spent"} and rotates nothing — the address the first redirect '
  'handed the browser stays live. A cancelled Checkout never reaches this '
  'function at all; its cancel_url is the /pay/<token> the client opened. '
  'NULL for malformed, unknown, or a nonce whose link has been revoked.';

CREATE OR REPLACE FUNCTION public.resolve_invoice_link(
  p_token text,
  p_record_view boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link           invoice_links%ROWTYPE;
  v_invoice        invoices%ROWTYPE;
  v_project_name   text;
  v_project_client uuid;
  v_payer          uuid;
  v_studio_name    text;
  v_studio_logo    text;
  v_studio_site    text;
  v_studio_source  text;
  v_studio_id      uuid;
  v_studio_location text;
  v_designer_name  text;
  v_client_name    text;
  v_bps            integer;
  v_remit          text;
  v_lines          jsonb;
  v_payments       jsonb;
  v_processing     boolean;
  v_requires_refund boolean;
  v_in_flight      boolean;
  v_dead           boolean;
  v_kind           text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  -- 00636: the raw token is never stored. The row is found by its sha256.
  SELECT * INTO v_link FROM invoice_links
   WHERE token_hash = public.invoice_link_token_hash(p_token);
  IF NOT FOUND OR v_link.status = 'revoked' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = v_link.invoice_id;
  IF NOT FOUND OR v_invoice.status = 'draft' THEN
    RETURN NULL;
  END IF;

  v_dead := v_link.status = 'closed' OR v_invoice.status = 'void';

  -- W4 r5 F1/MAJOR-1: an expiry silences a LIVE pay door only. A dead link's
  -- sheet is a receipt (K5/M10 withdrawn/settling), not a bearer pay door —
  -- nothing on it can be paid, and resolve_invoice_link_for_checkout already
  -- refuses anything that is not status='active'. Testing expiry above v_dead
  -- made two populations answer NULL and show the generic DeadLink page: every
  -- link closed before this migration (the backfill below dates a closed row
  -- from revoked_at, i.e. already past), and, forward-going, every receipt
  -- 30 days after its last mint.
  --
  -- A PAID INVOICE IS A RECEIPT TOO (W4 r7 MAJOR-4). Its link is still
  -- `active` — closing it is not what payment does — so the expiry test caught
  -- it, and 31 days after this migration every client re-opening the address
  -- she was emailed for an invoice she has already SETTLED met the dead sheet.
  -- There is no self-service way back: ensure_invoice_link is service_role and
  -- the regenerate door is the studio's. The paper is her own receipt and the
  -- till is shut on it either way — resolve_invoice_link_for_checkout takes
  -- only sent/partially_paid rows with a positive balance, so an expired paid
  -- link serves the sheet and can open no Checkout.
  IF NOT v_dead
     AND v_invoice.status <> 'paid'
     AND v_link.expires_at IS NOT NULL AND v_link.expires_at <= now() THEN
    RETURN NULL;
  END IF;

  IF NOT v_dead AND v_invoice.status NOT IN ('sent','partially_paid','paid') THEN
    RETURN NULL;
  END IF;

  IF p_record_view THEN
    UPDATE invoice_links
    SET view_count = view_count + 1, last_viewed_at = now()
    WHERE id = v_link.id;
  END IF;

  -- Studio-first letterhead: the invoice's own studio, then the project's,
  -- then the designer's primary — all three named (the two-studio fix).
  SELECT s.studio_id, s.name, s.logo_url, s.website, s.source
  INTO v_studio_id, v_studio_name, v_studio_logo, v_studio_site, v_studio_source
  FROM public.resolve_studio_identity(
    p_project_id  => v_invoice.project_id,
    p_designer_id => v_invoice.designer_id,
    p_studio_id   => v_invoice.studio_id
  ) AS s;

  -- "City, State" from the studio's address (organizations.address is the
  -- OrganizationAddress jsonb: street/city/state/zip/country). NULL when the
  -- studio has no address or the letterhead is not a studio org.
  IF v_studio_id IS NOT NULL THEN
    SELECT nullif(concat_ws(', ',
             nullif(btrim(o.address->>'city'), ''),
             nullif(btrim(o.address->>'state'), '')), '')
    INTO v_studio_location
    FROM organizations o WHERE o.id = v_studio_id;
  END IF;

  SELECT coalesce(
           nullif(btrim(pr.full_name), ''),
           nullif(btrim(pr.display_name), ''),
           nullif(btrim(pr.business_name), '')
         )
  INTO v_designer_name
  FROM profiles pr WHERE pr.id = v_invoice.designer_id;

  IF v_dead THEN
    -- J13: the same PaymentIntent rule payments[]/pay.processing apply at
    -- :1245 (F3). A pending row with no stamped PI is a claim nobody paid —
    -- an abandoned Checkout, not money in flight — and without this the
    -- withdrawn sheet would read "settling" forever behind one such row.
    v_in_flight := EXISTS (
      SELECT 1 FROM invoice_payments
      WHERE invoice_id = v_invoice.id
        AND method = 'stripe'
        AND (
          (status = 'pending' AND stripe_payment_intent_id IS NOT NULL)
          OR status = 'requires_refund'
        )
    );
    v_kind := CASE WHEN v_in_flight THEN 'settling' ELSE 'withdrawn' END;
    RETURN jsonb_build_object(
      'kind', v_kind,
      'sheet', v_kind,
      'invoice', jsonb_build_object(
        'number', v_invoice.invoice_number,
        'title', v_invoice.title
      ),
      'studio', jsonb_build_object(
        'name', v_studio_name, 'logo_url', v_studio_logo,
        'website', v_studio_site, 'source', v_studio_source,
        'location', v_studio_location
      ),
      'designer_display_name', v_designer_name,
      'contact', jsonb_build_object(
        'designer_display_name', v_designer_name,
        'studio_name', v_studio_name,
        'website', v_studio_site
      )
    );
  END IF;

  SELECT p.name, p.client_id INTO v_project_name, v_project_client
  FROM projects p WHERE p.id = v_invoice.project_id;
  v_payer := coalesce(v_invoice.client_id, v_project_client);

  IF v_payer IS NOT NULL THEN
    -- 1. The payer's own profile.
    SELECT coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(pr.display_name), ''))
    INTO v_client_name
    FROM profiles pr WHERE pr.id = v_payer;

    -- 2. The payer's OWN roster row — keyed on the payer, not the designer.
    -- A payer can hold more than one row: 00331 re-scoped
    -- idx_designer_clients_unique_profile to WHERE client_id IS NOT NULL AND
    -- status <> 'lead', so the lead row a household was promoted from survives
    -- alongside the active one and is usually the OLDER of the two (00585:49).
    -- The active row wins; dc.id breaks the created_at tie a single
    -- transaction timestamp would otherwise leave undecided, so this function
    -- and resolve_invoice_link_for_checkout cannot diverge (F14). The value
    -- test sits in the WHERE, before the LIMIT: a blank-named row must not be
    -- picked and then discarded, hiding a sibling row that does carry a name.
    IF v_client_name IS NULL THEN
      SELECT nullif(btrim(dc.client_name), '')
      INTO v_client_name
      FROM designer_clients dc
      WHERE dc.designer_id = v_invoice.designer_id
        AND dc.client_id = v_payer
        AND nullif(btrim(dc.client_name), '') IS NOT NULL
      ORDER BY (dc.status <> 'lead') DESC, dc.created_at, dc.id
      LIMIT 1;
    END IF;

    -- 3. The household email. A studio names a household by the address it
    -- entered and nothing else; printing that address is the studio's ask,
    -- and it beats printing a stranger's name or an unaddressed sheet.
    IF v_client_name IS NULL THEN
      SELECT nullif(btrim(dc.client_email), '')
      INTO v_client_name
      FROM designer_clients dc
      WHERE dc.designer_id = v_invoice.designer_id
        AND dc.client_id = v_payer
        AND nullif(btrim(dc.client_email), '') IS NOT NULL
      ORDER BY (dc.status <> 'lead') DESC, dc.created_at, dc.id
      LIMIT 1;
    END IF;
    IF v_client_name IS NULL THEN
      SELECT nullif(btrim(pr.email), '')
      INTO v_client_name
      FROM profiles pr WHERE pr.id = v_payer;
    END IF;
  ELSE
    -- 4. No payer at all (a project invoice whose project carries no client).
    -- A rostered household with no profile: the name resolves only when the
    -- roster holds exactly one email-only row for this designer (M5's
    -- implementable form — designer_clients has no project_id to key on).
    -- Gated to this branch: keyed on the designer, it cannot describe a payer.
    SELECT min(dc.client_name) INTO v_client_name
    FROM designer_clients dc
    WHERE dc.designer_id = v_invoice.designer_id
      AND dc.client_id IS NULL
      AND nullif(btrim(dc.client_name), '') IS NOT NULL
    HAVING count(*) = 1;
  END IF;

  -- attribution: the maker / vendor a furnishings line came through — an
  -- explicit text on the line's metadata, else the FF&E item's vendor_name,
  -- else the vendor record's name. A name only: anything shaped like an id or
  -- an address is dropped rather than printed.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'description', li.description,
           'quantity', li.quantity,
           'unit_amount_cents', li.unit_amount_cents,
           'amount_cents', li.amount_cents,
           'kind', li.kind,
           'attribution', (
             SELECT CASE
               WHEN a.name IS NULL THEN NULL
               WHEN a.name ~ '@' THEN NULL
               WHEN a.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NULL
               ELSE a.name
             END
             FROM (SELECT coalesce(
                     nullif(btrim(li.metadata->>'attribution'), ''),
                     nullif(btrim(li.metadata->>'vendor_name'), ''),
                     nullif(btrim(f.vendor_name), ''),
                     nullif(btrim(v.name), '')
                   ) AS name) a
           )
         ) ORDER BY li.sort_order, li.created_at, li.id), '[]'::jsonb)
  INTO v_lines
  FROM invoice_line_items li
  LEFT JOIN project_ffe_items f ON f.id = li.ffe_item_id
  LEFT JOIN vendors v ON v.id = f.vendor_id
  WHERE li.invoice_id = v_invoice.id;

  -- Review F3: a pending row exists from the moment of claim — before any
  -- Stripe session, and for up to 24h after an abandoned card Checkout. Only a
  -- row with a stamped PaymentIntent is money in flight (an ACH debit
  -- initiated; 00428's sync trigger moves the attempt to processing on that
  -- stamp), so only those pending rows are listed or count as processing.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'amount_cents', p.amount_cents,
           'surcharge_cents', coalesce(p.surcharge_cents, 0),
           'method', p.method,
           'status', p.status,
           'rail', p.stripe_payment_method_type,
           'received_at', p.received_at
         ) ORDER BY coalesce(p.received_at, p.created_at), p.id), '[]'::jsonb),
         coalesce(bool_or(p.status = 'pending'), false),
         coalesce(bool_or(p.status = 'requires_refund'), false)
  INTO v_payments, v_processing, v_requires_refund
  FROM invoice_payments p
  WHERE p.invoice_id = v_invoice.id
    AND p.status <> 'failed'
    AND NOT (p.status = 'pending' AND p.stripe_payment_intent_id IS NULL);

  SELECT sbs.card_surcharge_bps, sbs.check_remit_to INTO v_bps, v_remit
  FROM studio_billing_settings sbs
  WHERE sbs.studio_id = v_invoice.studio_id;

  RETURN jsonb_build_object(
    'kind', 'invoice',
    'sheet', 'invoice',
    'invoice', jsonb_build_object(
      'number', v_invoice.invoice_number,
      'title', v_invoice.title,
      'status', v_invoice.status,
      'issue_date', v_invoice.issue_date,
      'due_date', v_invoice.due_date,
      'paid_at', v_invoice.paid_at,
      'currency', coalesce(v_invoice.currency, 'USD'),
      'subtotal_cents', v_invoice.subtotal_cents,
      'tax_cents', v_invoice.tax_cents,
      'tax_rate', v_invoice.tax_rate,
      'total_cents', v_invoice.total_cents,
      'amount_paid_cents', v_invoice.amount_paid_cents,
      'balance_cents', greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0),
      'memo', v_invoice.memo,
      'project_name', v_project_name,
      'is_studio_invoice', v_invoice.project_id IS NULL
    ),
    'line_items', v_lines,
    'payments', v_payments,
    'studio', jsonb_build_object(
      'name', v_studio_name, 'logo_url', v_studio_logo,
      'website', v_studio_site, 'source', v_studio_source,
      'location', v_studio_location
    ),
    'designer_display_name', v_designer_name,
    'client_display_name', v_client_name,
    'payment_options', jsonb_build_object(
      -- ALWAYS the coalesced integer (G5): 300 is the rate the platform will
      -- charge, and most studios have no settings row.
      'card_surcharge_bps', coalesce(v_bps, 300),
      'check_remit_to', v_remit
    ),
    'pay', jsonb_build_object(
      'rails', jsonb_build_array('us_bank_account', 'card', 'check'),
      'processing', v_processing,
      -- J2: a requires_refund row is money that arrived and does NOT match the
      -- invoice — an overpayment or a gross mismatch, which only the studio can
      -- settle with Stripe. The balance reads as owing again while it stands,
      -- so re-offering Pay on top of it invites a second wrong payment and a
      -- second refund. The till closes until the row is resolved; the sheet
      -- says so in words rather than showing a dead button.
      'payable', NOT v_requires_refund
    )
  );
END;
$$;
COMMENT ON FUNCTION public.resolve_invoice_link(text, boolean) IS
  'The only guest read path for /pay/<token>. 00588''s body verbatim, with the '
  'lookup moved onto token_hash and an expired ACTIVE link added to the '
  'dead-link silence (00636; expiry sits below the v_dead branch per W4 r5 F1, '
  'so a receipt never goes silent). Called through the client portal''s service client '
  '(service_role only holds EXECUTE — J33). Validates the 64-hex token, bumps '
  'view_count when p_record_view, and returns one narrow jsonb discriminated '
  'by kind: invoice, withdrawn (closed link / void invoice, K5), settling '
  '(M10), or NULL for malformed/unknown/revoked/draft and for an EXPIRED link '
  'on an invoice that is still owing. A PAID invoice''s link answers its '
  'receipt however old it is (W4 r7 MAJOR-4).';

CREATE OR REPLACE FUNCTION public.resolve_invoice_link_for_checkout(p_token text)
RETURNS TABLE (
  invoice_id uuid,
  link_id uuid,
  payer_id uuid,
  link_stripe_customer_id text,
  balance_cents integer,
  currency text,
  card_surcharge_bps integer,
  -- Review F14: the name the link Stripe customer is given — the same
  -- derivation resolve_invoice_link uses, in the same order. With a payer:
  -- the household profile's name, else that payer's own roster row's name,
  -- else the address the studio entered for them. Payer-less: the designer's
  -- single email-only roster row.
  client_display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id,
         l.id,
         coalesce(i.client_id, p.client_id),
         l.stripe_customer_id,
         (i.total_cents - i.amount_paid_cents)::integer,
         lower(coalesce(i.currency, 'USD')),
         coalesce(s.card_surcharge_bps, 300),
         CASE WHEN coalesce(i.client_id, p.client_id) IS NOT NULL THEN
           coalesce(
             nullif(btrim(pr.full_name), ''),
             nullif(btrim(pr.display_name), ''),
             -- Same row choice as resolve_invoice_link, term for term (F14):
             -- the active row beats the lead row 00331 lets coexist with it,
             -- dc.id breaks the created_at tie, and the value test sits in the
             -- WHERE so a blank row cannot hide a sibling that carries a name.
             (SELECT nullif(btrim(dc.client_name), '')
              FROM public.designer_clients dc
              WHERE dc.designer_id = i.designer_id
                AND dc.client_id = coalesce(i.client_id, p.client_id)
                AND nullif(btrim(dc.client_name), '') IS NOT NULL
              ORDER BY (dc.status <> 'lead') DESC, dc.created_at, dc.id
              LIMIT 1),
             (SELECT nullif(btrim(dc.client_email), '')
              FROM public.designer_clients dc
              WHERE dc.designer_id = i.designer_id
                AND dc.client_id = coalesce(i.client_id, p.client_id)
                AND nullif(btrim(dc.client_email), '') IS NOT NULL
              ORDER BY (dc.status <> 'lead') DESC, dc.created_at, dc.id
              LIMIT 1),
             nullif(btrim(pr.email), '')
           )
         ELSE
           (SELECT min(dc.client_name)
            FROM public.designer_clients dc
            WHERE dc.designer_id = i.designer_id
              AND dc.client_id IS NULL
              AND nullif(btrim(dc.client_name), '') IS NOT NULL
            HAVING count(*) = 1)
         END
  FROM public.invoice_links l
  JOIN public.invoices i ON i.id = l.invoice_id
  LEFT JOIN public.projects p ON p.id = i.project_id
  LEFT JOIN public.studio_billing_settings s ON s.studio_id = i.studio_id
  LEFT JOIN public.profiles pr ON pr.id = coalesce(i.client_id, p.client_id)
  WHERE p_token IS NOT NULL
    AND p_token ~ '^[0-9a-f]{64}$'
    AND l.token_hash = public.invoice_link_token_hash(p_token)
    AND (l.expires_at IS NULL OR l.expires_at > now())
    AND l.status = 'active'
    AND i.status IN ('sent','partially_paid')
    AND i.total_cents - i.amount_paid_cents > 0;
$$;
COMMENT ON FUNCTION public.resolve_invoice_link_for_checkout(text) IS
  'Service-only: the ids invoice-link-checkout needs to open a Checkout for a '
  'link. 00588''s body verbatim with the token predicate moved onto token_hash '
  'and an expiry conjunct added (00636). Empty unless the link is active and '
  'unexpired, the invoice is sent/partially_paid, and the balance is positive.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Grants — 00574's block, restated (the seed generator replays TEXT)
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION
  public.mint_invoice_link_on_issue(),
  public.ensure_invoice_link(uuid),
  public.resolve_invoice_link(text, boolean),
  public.resolve_invoice_link_for_checkout(text),
  public.resolve_invoice_return_nonce(text),
  public.regenerate_invoice_link(uuid),
  public.get_invoice_link(uuid),
  public.invoice_link_is_live(uuid),
  public.invoice_link_token_hash(text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.ensure_invoice_link(uuid),
  public.resolve_invoice_link(text, boolean),
  public.resolve_invoice_link_for_checkout(text),
  public.resolve_invoice_return_nonce(text),
  public.regenerate_invoice_link(uuid),
  public.get_invoice_link(uuid),
  public.invoice_link_is_live(uuid),
  public.invoice_link_token_hash(text)
TO service_role;

-- J33 stands: resolve_invoice_link is never granted to authenticated. The two
-- folio RPCs are genuinely browser-callable and keep their grant.
GRANT EXECUTE ON FUNCTION
  public.regenerate_invoice_link(uuid),
  public.get_invoice_link(uuid)
TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. The sweep — a stuck ACH row must not hold the new guard open forever
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ensure_invoice_link (§3) now refuses to rotate while a Checkout attempt is
-- claimed / session_created / processing, because minting mid-payment would
-- kill the address the payer is standing on. That guard is right and it has a
-- cost: while it is held, a letter has no fresh address to carry (the callers
-- hold the letter instead — invoice-reminders / invoice-send, W4 r6 MAJOR-1).
--
-- 00574's sweep closes claimed/session_created after 24h and NEVER touches
-- processing — deliberately, because processing is ACH money in flight. But an
-- ACH debit settles in 3–5 business days, and nothing else ever moves that row:
-- a `processing` attempt whose Stripe result never arrives (a webhook lost
-- before 00591's rail, a session Stripe abandoned) stays processing forever and
-- holds the mint guard open on that invoice forever with it.
--
-- So processing gets a BACKSTOP, not a sweep: 10 days, beyond any honest ACH
-- window, on the same hourly job. Nothing else changes — same signature, same
-- 24h default for the two pre-bank states, same cron entry at 17 past
-- (R-BY: the entry is untouched; only the body is re-headed).
--
-- A LATE SUCCESS IS STILL RECOVERABLE, which is why 10 days is safe: the sweep
-- fails the pending invoice_payments row, and settle_invoice_checkout_payment
-- (00428:687) updates `WHERE status IN ('pending','failed')` — it short-circuits
-- only on succeeded/requires_refund/refunded. A Stripe result arriving on day
-- 12 still lands the money on the invoice; the swept row is not a grave.
--
-- Lineage: expire_stale_invoice_checkout_attempts 00574 → this file. 00574's
-- body verbatim except the candidate set, the re-judge, and the two reason
-- strings.

CREATE OR REPLACE FUNCTION public.expire_stale_invoice_checkout_attempts(
  p_stale interval DEFAULT '24 hours'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- Not a parameter: the cron entry calls this with no arguments, and a second
  -- defaulted argument would make that call ambiguous between two overloads.
  v_processing_stale  CONSTANT interval := '10 days';
  v_run_id            bigint;
  v_expired           int := 0;
  v_processing_closed int := 0;
  v_payments_failed   int := 0;
  v_pointers_cleared  int := 0;
  v_count             int;
  v_candidate         record;
  v_attempt           public.invoice_checkout_attempts%ROWTYPE;
  v_is_processing     boolean;
  v_detail            jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('job:invoice-checkout-attempts-expire')) THEN
    INSERT INTO public.job_runs (job_name, status, finished_at)
    VALUES ('invoice-checkout-attempts-expire', 'skipped', now());
    RETURN jsonb_build_object('skipped', true);
  END IF;

  PERFORM set_config('app.actor', 'job:invoice-checkout-attempts-expire', true);

  INSERT INTO public.job_runs (job_name, status)
  VALUES ('invoice-checkout-attempts-expire', 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    FOR v_candidate IN
      SELECT a.id, a.invoice_id
      FROM public.invoice_checkout_attempts a
      WHERE (a.state IN ('claimed','session_created') AND a.created_at < now() - p_stale)
         OR (a.state = 'processing' AND a.created_at < now() - v_processing_stale)
      ORDER BY a.created_at
    LOOP
      -- Re-judge under the invoice lock: a claim may have advanced or
      -- superseded the attempt since the candidate list was read — and an ACH
      -- row may have settled between the read and this lock, which is exactly
      -- the case this re-judge exists to refuse.
      PERFORM 1 FROM public.invoices WHERE id = v_candidate.invoice_id FOR UPDATE;
      SELECT * INTO v_attempt
      FROM public.invoice_checkout_attempts
      WHERE id = v_candidate.id
      FOR UPDATE;
      CONTINUE WHEN NOT FOUND;
      v_is_processing := v_attempt.state = 'processing';
      CONTINUE WHEN NOT (
        (v_attempt.state IN ('claimed','session_created')
           AND v_attempt.created_at < now() - p_stale)
        OR (v_is_processing AND v_attempt.created_at < now() - v_processing_stale)
      );

      -- Payment first, attempt second — fail_invoice_checkout_attempt's
      -- order: the 00397 sync trigger marks the attempt failed when its
      -- payment fails, and the unconditional write below then names the
      -- real reason.
      UPDATE public.invoice_payments
      SET status = 'failed',
          note = concat_ws(
            ' ', note,
            CASE WHEN v_is_processing
              THEN 'Expired: no result from the bank after 10 days.'
              ELSE 'Expired: Checkout was abandoned.'
            END
          )
      WHERE checkout_attempt_id = v_attempt.id
        AND status = 'pending';
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_payments_failed := v_payments_failed + v_count;

      UPDATE public.invoice_checkout_attempts
      SET state = 'expired',
          failure_reason = CASE WHEN v_is_processing
            THEN 'stale_processing_attempt'
            ELSE 'stale_checkout_attempt'
          END,
          finalized_at = coalesce(finalized_at, now())
      WHERE id = v_attempt.id;
      v_expired := v_expired + 1;
      IF v_is_processing THEN
        v_processing_closed := v_processing_closed + 1;
      END IF;

      UPDATE public.invoices
      SET stripe_checkout_session_id = NULL, updated_at = now()
      WHERE id = v_attempt.invoice_id
        AND v_attempt.stripe_checkout_session_id IS NOT NULL
        AND stripe_checkout_session_id = v_attempt.stripe_checkout_session_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_pointers_cleared := v_pointers_cleared + v_count;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- No re-RAISE (00300 idiom): the failed row must persist as the
    -- authoritative failure record; the guarded block's changes roll back to
    -- its savepoint and every pass is idempotent.
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object(
             'expired', v_expired,
             'processing_closed', v_processing_closed,
             'payments_failed', v_payments_failed,
             'pointers_cleared', v_pointers_cleared
           )
     WHERE id = v_run_id;
    RETURN jsonb_build_object(
      'error', SQLERRM,
      'expired', v_expired,
      'processing_closed', v_processing_closed,
      'payments_failed', v_payments_failed,
      'pointers_cleared', v_pointers_cleared
    );
  END;

  v_detail := jsonb_build_object(
    'expired', v_expired,
    'processing_closed', v_processing_closed,
    'payments_failed', v_payments_failed,
    'pointers_cleared', v_pointers_cleared
  );

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_invoice_checkout_attempts(interval) IS
  'Hourly pg_cron sweep (00574 M3, re-headed 00636): claimed/session_created '
  'Checkout attempts older than p_stale (24h) become expired, and — since '
  '00636 — processing attempts older than 10 days do too, so a stuck ACH row '
  'cannot hold ensure_invoice_link''s mint guard open forever (failure_reason '
  'stale_processing_attempt). In both cases the pending payment row fails and '
  'the invoice''s session pointer is cleared; a late Stripe success still '
  'settles, because settle_invoice_checkout_payment accepts a failed row. One '
  'job_runs row per invocation.';

-- 00574's posture, restated — replacing a function keeps its ACL, and the seed
-- generator replays TEXT.
REVOKE ALL ON FUNCTION public.expire_stale_invoice_checkout_attempts(interval)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_invoice_checkout_attempts(interval)
  TO service_role;

-- Registry comment carried forward from 00630 and corrected: the entry, its
-- schedule and its SQL are untouched (R-BY) — only the sentence describing
-- what the sweep closes, which 00630 still states as "never processing".
-- The comment is documentation; a stack without pg_cron must not fail the
-- migration over a sentence.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Everyone on the Job (00630): compliance-document-expiry-sweep nightly at 06:00 UTC -> public.sweep_compliance_expiries(), writing one studio_compliance_notices row per (document, state, expires_on) as a gating compliance paper enters lapses_soon or lapses, plus one in_app notification_log row per owner/admin of the holding studio; history in job_runs. The Invoice, Standing Alone (00574): invoice-checkout-attempts-expire at 17 past every hour -> public.expire_stale_invoice_checkout_attempts(), expiring claimed/session_created Checkout attempts older than 24h and, since 00636, processing attempts older than 10 days so a stuck ACH row cannot hold ensure_invoice_link''s mint guard open forever, history in job_runs. The Decision, Delivered (00572): decision-reminders-hourly on the hour -> the decision-reminders edge function, replacing 00092''s decision-reminders-daily at 09:00 UTC so the per-recipient not-before-8am-local gate has an hour to release into; notification-digest-hourly at 20 past -> the notification-digest edge function, replacing 00278''s notification-digest-daily at 15:00 UTC for the same reason (the summary owes the same 8am-local, never-Sunday promise as the letter); client-push-window-release every 15 minutes -> public.release_due_client_pushes(200), dispatching push envelopes held outside 8am-8pm local; decision-first-notice-retry-sweep every 30 minutes -> public.sweep_decision_first_notices(100), re-inviting decision-first-notice for a published approval that never got its letter. Studio onboarding (00553): expire-stale-workspace-invites-daily at 07:40 UTC. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes. Rendered Room v2 (00501): expire-stale-upload-intents-daily at 07:15 UTC. Room View, Agent OS, BOH, Field Site Request, Mood Board, invoice/decision reminders, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
