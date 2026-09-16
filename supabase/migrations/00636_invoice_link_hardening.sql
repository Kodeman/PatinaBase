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
--               answering withdrawn/settling however old it is.
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
--    it has not just regenerated shows its existing "no link yet — resend the
--    invoice" copy, which is now the literal truth.
--  · resolve_invoice_return_nonce ROTATES. The Stripe return trades a nonce
--    for an address, and there is no stored address left to trade. It mints a
--    fresh token ON THE SAME LINK ROW the attempt was claimed against — the
--    row keeps its id, its Stripe customer and its payer email, so F2 ("a
--    nonce is not an alias for a regenerated token") still holds: it is the
--    same grant, re-addressed for the holder who just proved they came back
--    from Checkout. The function is VOLATILE now, not STABLE.
--    KNOWN HAZARD: two GETs of /pay/return/<nonce> rotate twice and the first
--    redirect's address is then dead. The route is a 303 with
--    Cache-Control: private, no-store and is fetched once by the returning
--    browser; a prefetch of it would flake. Named here so it is not discovered
--    as a mystery.
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

-- The plaintext goes. Nothing reads it after this statement; the CHECK below
-- is what keeps it gone.
UPDATE public.invoice_links SET token = NULL WHERE token IS NOT NULL;

ALTER TABLE public.invoice_links ALTER COLUMN token DROP NOT NULL;
ALTER TABLE public.invoice_links DROP CONSTRAINT IF EXISTS chk_invoice_links_token;
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
  '(W4 r5 F1). Rows that were already dead when 00636 ran carry the date they '
  'died on.';

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
  -- signed-in /invoices/<id> form (M7).
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

-- The Stripe return. ROTATES the bound link''s token (see banner).
CREATE OR REPLACE FUNCTION public.resolve_invoice_return_nonce(p_nonce text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_link_id uuid;
  v_token   text;
BEGIN
  IF p_nonce IS NULL OR p_nonce !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  -- 00574's own selection rule, unchanged: the link in force when the attempt
  -- was claimed (active or closed, never revoked, never a later mint) — F2.
  SELECT l.id INTO v_link_id
  FROM public.invoice_checkout_attempts a
  JOIN public.invoice_links l ON l.invoice_id = a.invoice_id
  WHERE a.return_nonce = p_nonce
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

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.resolve_invoice_return_nonce(text) IS
  'Service-only: the address behind a Checkout return nonce '
  '(/pay/return/<nonce> → /pay/<token>). Since 00636 it ROTATES rather than '
  'reads: the stored value is a hash, so the SAME link row the attempt was '
  'claimed against (F2 — never a later mint, never a revoked one) is '
  're-addressed with a fresh token and a fresh 30 days, and the raw value is '
  'returned once to the holder who just proved they came back from Checkout. '
  'NULL for malformed/unknown. VOLATILE: two GETs of the return route rotate '
  'twice and the first address dies — the route is a single 303, no-store.';

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
  IF NOT v_dead
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
  'that is still live.';

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
