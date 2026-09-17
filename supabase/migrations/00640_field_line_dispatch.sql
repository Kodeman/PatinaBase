-- ═══════════════════════════════════════════════════════════════════════════
-- 00640 — The Field Line · sender, token overlap and durable dispatch
--
-- Phase 0 wave 0C (contract S5, S6, S7, S12). One migration, three authorities,
-- all of them things _shared/sms.ts and sms-dispatch cannot state on their own:
--
--   1. TOKEN OVERLAP (S6). create_field_link() gains `p_revoke_prior`, default
--      FALSE. A routine mint — the field-daily digest, both fc_dispatch
--      triggers, the site-request rail, any {{link}} template — no longer kills
--      the link the trade is already using. Regenerate still revokes, by asking
--      for it. revoke_party_field_links() is the explicit "all of them" door.
--   2. DURABLE DISPATCH (S5). sms_messages gains `recipe`, `dedupe_key` and
--      `claimed_at`: the deferred outbox stops being a stored BODY (which the
--      flush then had to trust) and becomes a stored RECIPE the flush renders
--      fresh, and a send that names a dedupe_key takes a LOGICAL SEND CLAIM
--      that concurrent trigger/cron retries cannot take twice.
--   3. PROVIDER-ACCEPTED-THEN-CRASH (S5). The claim row is written BEFORE the
--      provider is called and its provider id is written BEFORE the status
--      flips, so an accepted send that never got its status write is still
--      findable by sid. sms_reconcile_accepted_send() marks it from the
--      sms-status callback's MessageSid; sms_release_stale_send_claims()
--      releases the claims that never reached the provider at all.
--
-- THIS IS NOT EXACTLY-ONCE CARRIER DELIVERY, and nothing here claims it. The
-- claim makes at most one LOGICAL send per (party, template, dedupe key) while
-- that send is live; the carrier leg is at-least-once by construction (a crash
-- between Twilio accepting and our sid write is invisible to us, which is why
-- sms_release_stale_send_claims() says so in its own comment).
--
-- LINEAGE — every function replaced here is grafted from its LATEST definition
-- (patina-db-migrations, step "graft from the latest", grep|sort|tail winner):
--   · create_field_link(UUID, TIMESTAMPTZ)  ← 00627:525  (00283:86 → 00284:37 → 00627:525)
--   · create_field_link(UUID)               ← 00627:636  (the delegate)
--   Untouched on purpose: revoke_field_link(UUID) (00283:139 — per-token, still
--   the portal's single-link door), resolve_field_link() (00283:174),
--   sms_conversation_context / sms_backfill_conversation_context() (00639 —
--   P0-06b owns their consumers), channel_consent_status() (00639:323),
--   sms_create_prompt() (00639 — the ONLY short-code allocation entry point).
--
-- GRANTS: this file carries GRANT/REVOKE, so supabase/seed/00-legacy-grants.sql
-- is regenerated in the same commit (python3 scripts/generate-legacy-grants.py).
-- config.toml [db.seed] replays that file AFTER migrations, so an un-regenerated
-- seed silently re-grants what this migration revokes (story constraint #6).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. create_field_link — a routine mint no longer revokes (contract S6)
-- ═══════════════════════════════════════════════════════════════════════════
-- 00283's header states the old rule: "regenerate = revoke+create … at most one
-- live link per party". That rule was written for a BUTTON (the party sheet's
-- Regenerate), and then the automated rail inherited it: _shared/sms.ts mints
-- for every {{link}} template, so the daily digest revoked yesterday's link
-- mid-job, and a trade holding a working URL found it dead because a cron ran.
-- S6 splits the two acts: a mint is a mint, and a revoke is asked for.
--
-- The three-argument form is the real body; the two shipped signatures are
-- reached through it, so the window binding, the authorization guard and the
-- "no token dated in the past" invariant cannot drift between them. The old
-- two-argument signature is DROPped rather than kept beside the new one:
-- Postgres resolves create_field_link(uuid, timestamptz) against both an exact
-- two-argument function and a three-argument one with a defaulted tail, and
-- raises "function is not unique" at CALL time — which would break the portal's
-- own mint (packages/supabase/src/hooks/use-party-sms.ts:158) rather than any
-- test. One function, three arities, no ambiguity.
DROP FUNCTION IF EXISTS public.create_field_link(UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.create_field_link(
  p_party_id     UUID,
  p_expires_at   TIMESTAMPTZ,
  p_revoke_prior BOOLEAN DEFAULT false
)
RETURNS TABLE (id UUID, token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_token      TEXT;
  v_hash       TEXT;
  v_id         UUID;
  v_window_end DATE;
  v_expires    TIMESTAMPTZ;
BEGIN
  SELECT pp.project_id INTO v_project_id
    FROM public.project_parties pp WHERE pp.id = p_party_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'party % not found', p_party_id USING errcode = 'no_data_found';
  END IF;

  -- Authenticated callers must own the party's project. Service-role /
  -- internal callers (auth.uid() IS NULL — triggers, cron, edge fns) are
  -- already trusted and bypass the ownership check; created_by is left NULL
  -- for them. 00284's guard, verbatim.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = v_project_id AND p.designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized to mint a field link for party %', p_party_id
      USING errcode = 'insufficient_privilege';
  END IF;

  -- PR-d: the grant ends with the engagement, extended to the warranty end
  -- when the seat carries one (PR-l's second option, as the default). max()
  -- over the two ignores NULLs, so either alone answers.
  SELECT max(d) INTO v_window_end
    FROM public.project_parties pp
    CROSS JOIN LATERAL (VALUES (pp.on_site_to), (pp.warranty_until)) AS v(d)
   WHERE pp.id = p_party_id;

  -- Every branch must land in the FUTURE. A window that has already closed
  -- cannot date a live grant: taking it unconditionally stamped the token in
  -- the past (w1b final review r1 MAJOR-1), and because the supersede below
  -- runs first, the trade's working link was revoked in the same call while
  -- the text carried a URL that was dead on arrival. A closed window is the
  -- same fact as no window: the 90-day DEFAULT answers, exactly as it does for
  -- a windowless seat, rather than the studio being handed a dead date.
  --
  -- S6: a MOVED WINDOW NEVER EXTENDS AN ALREADY-MINTED TOKEN. expires_at is
  -- derived here, at mint, and stored on the row; nothing recomputes it later,
  -- so a seat whose on_site_to is pushed out dates the NEXT token and leaves
  -- the ones already in someone's phone exactly where they were.
  v_expires := CASE
    -- Through the END of the window's last day, not its midnight — while that
    -- day is still ahead.
    WHEN v_window_end IS NOT NULL
     AND v_window_end::timestamptz + interval '1 day' > now()
         THEN v_window_end::timestamptz + interval '1 day'
    WHEN p_expires_at IS NOT NULL AND p_expires_at > now() THEN p_expires_at
    ELSE now() + interval '90 days'
  END;

  -- The invariant, stated where it cannot be edited around: a mint that cannot
  -- produce a usable date revokes nothing. It must raise BEFORE the supersede.
  IF v_expires IS NULL OR v_expires <= now() THEN
    RAISE EXCEPTION 'field_link_window_closed'
      USING HINT = 'A field link may not be minted with an expiry in the past, '
                   'and a mint that cannot produce one must not revoke the '
                   'token the trade is already using.',
            ERRCODE = 'check_violation';
  END IF;

  -- S6: the supersede is now ASKED FOR. 00627 ran this unconditionally, so
  -- every automated mint killed the working link (deck defect 3). A routine
  -- mint leaves prior unexpired tokens valid and lets them reach their own
  -- expiry; overlap is the point — two links to the same work are two doors to
  -- the same room, each already bound to the engagement window.
  IF p_revoke_prior THEN
    UPDATE public.field_link_tokens
       SET status = 'revoked'
     WHERE party_id = p_party_id AND project_id = v_project_id AND status = 'active';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.field_link_tokens
    (party_id, project_id, token_hash, expires_at, created_by)
  VALUES (p_party_id, v_project_id, v_hash, v_expires, auth.uid())
  RETURNING field_link_tokens.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

COMMENT ON FUNCTION public.create_field_link(UUID, TIMESTAMPTZ, BOOLEAN) IS
  'Mint a no-auth field link for a party. Returns the raw token once; only '
  'sha256(token) is stored. Authenticated callers must own the party''s '
  'project; service-role/internal callers (auth.uid() IS NULL) bypass the '
  'ownership check with created_by NULL (00284). EXPIRY (PR-d, 00627): the '
  'seat''s window end — the later of on_site_to and warranty_until — through '
  'the end of that day, WHILE THAT DAY IS STILL AHEAD; else the caller''s '
  'p_expires_at when that is in the future; else the old 90 days. No branch may '
  'date a token in the past: a mint that cannot produce a usable date raises '
  'field_link_window_closed BEFORE anything is revoked. OVERLAP (The Field '
  'Line, 00640, contract S6): p_revoke_prior DEFAULTS TO FALSE, so a routine '
  'mint leaves prior unexpired tokens valid — the automated rail mints for '
  'every {{link}} template and used to revoke the link the trade was already '
  'holding. Regenerate passes TRUE; revoke_party_field_links() is the explicit '
  '"all of them" door. expires_at is derived at mint and never recomputed, so '
  'a moved window dates the next token only.';

REVOKE ALL ON FUNCTION public.create_field_link(UUID, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_field_link(UUID, TIMESTAMPTZ, BOOLEAN)
  TO authenticated, service_role;

-- The shipped one-argument signature, unchanged for every caller, still a
-- delegate. Restated (not left to resolve implicitly) so the revoke posture it
-- delegates with is visible at the call site: FALSE — the rail's mint.
CREATE OR REPLACE FUNCTION public.create_field_link(p_party_id UUID)
RETURNS TABLE (id UUID, token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT *
    FROM public.create_field_link(p_party_id, NULL::timestamptz, false);
END;
$$;

COMMENT ON FUNCTION public.create_field_link(UUID) IS
  'The shipped one-argument mint (00283:86 → 00284:37 → 00627:636), a delegate '
  'to create_field_link(uuid, timestamptz, boolean) so the window-based expiry '
  '(PR-d, 00627) applies to every existing caller — the party sheet, the roster '
  'row, sms-dispatch and the field-daily cron — with no call site changed. It '
  'delegates with p_revoke_prior = FALSE (The Field Line, 00640, contract S6): '
  'this is the automated rail''s signature, and the rail must not revoke the '
  'link someone is already holding.';

REVOKE ALL ON FUNCTION public.create_field_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_field_link(UUID) TO authenticated, service_role;

-- ── revoke_party_field_links — the explicit "all of them" door ──────────────
-- revoke_field_link(uuid) (00283:139) kills ONE token by id, which was enough
-- while at most one was ever live. With overlap allowed, "this person is off
-- the job" needs a door that closes every one of them in a single act, and the
-- portal must not have to enumerate token rows to do it.
CREATE OR REPLACE FUNCTION public.revoke_party_field_links(p_party_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_n          INTEGER;
BEGIN
  SELECT pp.project_id INTO v_project_id
    FROM public.project_parties pp WHERE pp.id = p_party_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'party % not found', p_party_id USING errcode = 'no_data_found';
  END IF;

  -- The same authority as the mint (00284's guard): an authenticated caller
  -- must own the party's project; service-role / internal callers are trusted.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = v_project_id AND p.designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized to revoke field links for party %', p_party_id
      USING errcode = 'insufficient_privilege';
  END IF;

  UPDATE public.field_link_tokens
     SET status = 'revoked'
   WHERE party_id = p_party_id AND status = 'active';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.revoke_party_field_links(UUID) IS
  'The Field Line (00640), contract S6: revoke EVERY active field link a party '
  'holds, across the seat''s project, and return how many died. The companion '
  'to create_field_link''s p_revoke_prior default of FALSE — once a routine '
  'mint stops superseding, "this person is off the job" needs one act rather '
  'than an enumeration of token rows. Same authority as the mint: an '
  'authenticated caller must own the party''s project; service-role / internal '
  'callers (auth.uid() IS NULL) are trusted. revoke_field_link(uuid) (00283) '
  'still kills a single token by id.';

REVOKE ALL ON FUNCTION public.revoke_party_field_links(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_party_field_links(UUID)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The deferred outbox becomes a RECIPE, and a send can take a CLAIM (S5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Two defects share these three columns.
--
-- (a) THE DEFERRED-REDACTION-FLUSH HAZARD (evidence case 12). sendPartySms
--     stored `auditBody` — the caller's deliberately REDACTED copy — on a
--     quiet-hours defer, and flushDeferredMessages sent `row.body` hours later.
--     The recipient got the redaction; or, with no auditBody, the row held a
--     raw field-link token at rest and the flush re-sent a URL minted before
--     the recipient's consent was last checked. A `recipe` says what to render
--     rather than what was rendered, so the flush mints at ACTUAL dispatch
--     (contract S6) and the stored body can stay a redacted preview.
--
-- (b) CONCURRENT RETRIES. fc_dispatch_court_assignment / fc_dispatch_task_assignment
--     (00284) fire from row writes and the field-daily cron re-runs; nothing
--     stopped two of them producing two texts for one fact. `dedupe_key` plus
--     the partial unique index below make the ROW the claim: the second writer
--     loses the insert and sends nothing.
ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS recipe     JSONB,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.sms_messages.recipe IS
  'The Field Line (00640), contract S5/S6: how to RENDER this message, for a '
  'row that has not been sent yet — { template_key, params, party_id, '
  'project_id, link_kind }. flushDeferredMessages renders from this, fresh, at '
  'actual dispatch (so the field link is minted then, not at defer time) and '
  'never trusts the stored body, which is a redacted preview. NULL for a row '
  'whose caller supplied a literal body: there the stored body IS the body. '
  'Never holds a raw token — link_kind names the link to mint, it does not '
  'carry one.';

COMMENT ON COLUMN public.sms_messages.dedupe_key IS
  'The Field Line (00640), contract S5: the caller''s name for the LOGICAL send '
  'this row is. While the row is live (see sms_messages_send_claim_uniq) no '
  'second row may take the same (party_id, template_key, dedupe_key), so a '
  'trigger and a cron racing over one fact produce one text. NULL opts out — '
  'every send that existed before this migration keeps its old behaviour.';

COMMENT ON COLUMN public.sms_messages.claimed_at IS
  'The Field Line (00640), contract S5: when the sender took this row as its '
  'claim, BEFORE calling the provider. A row still at twilio_status = ''claimed'' '
  'is a send whose outcome we do not know: sms_reconcile_accepted_send() '
  'settles the ones that reached the provider (they carry a twilio_sid, written '
  'before the status flip) and sms_release_stale_send_claims() releases the '
  'ones that did not.';

-- THE LOGICAL SEND CLAIM. "While pending" is every state that is not a
-- RELEASED one: a claim is held by a row that is claimed, deferred, or already
-- on the wire, and released only by a terminal failure — because a terminal
-- failure is the one outcome for which sending again is the right answer.
-- ('claimed' and 'deferred' are ours; the rest are Twilio's vocabulary, plus
-- the synthetic 'dry_run'.)
CREATE UNIQUE INDEX IF NOT EXISTS sms_messages_send_claim_uniq
  ON public.sms_messages (party_id, COALESCE(template_key, ''), dedupe_key)
  WHERE direction = 'outbound'
    AND dedupe_key IS NOT NULL
    AND party_id IS NOT NULL
    AND COALESCE(twilio_status, 'claimed') NOT IN
        ('failed', 'undelivered', 'canceled', 'expired', 'suppressed');

-- A selection belongs to the handset, not an arbitrary first studio. Keep
-- terminal rows in this claim too: STOP/expiry must not be resurrected by a
-- retry of the same originating inbound. A replacement needs a new origin.
CREATE UNIQUE INDEX IF NOT EXISTS sms_messages_selection_claim_uniq
  ON public.sms_messages (conversation_id, template_key, dedupe_key)
  WHERE direction = 'outbound' AND party_id IS NULL AND project_id IS NULL
    AND conversation_id IS NOT NULL AND template_key = 'sms_selection'
    AND dedupe_key IS NOT NULL;

COMMENT ON INDEX public.sms_messages_send_claim_uniq IS
  'The Field Line (00640), contract S5: one LOGICAL send per (party, template, '
  'dedupe key) while that send is live. The insert IS the claim — a concurrent '
  'trigger/cron retry loses it with 23505 and sends nothing. The claim releases '
  'on a terminal failure (failed/undelivered/canceled/expired/suppressed), '
  'which is exactly when re-sending is correct. THIS IS NOT EXACTLY-ONCE '
  'CARRIER DELIVERY: it bounds our own duplicate sends, and says nothing about '
  'what the carrier does with one accepted message.';

-- The reconciliation sweep's index: rows still sitting at 'claimed'.
CREATE INDEX IF NOT EXISTS idx_sms_messages_open_claims
  ON public.sms_messages (claimed_at)
  WHERE twilio_status = 'claimed';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Provider-accepted-then-crash reconciliation (contract S5)
-- ═══════════════════════════════════════════════════════════════════════════
-- The sender writes the row, calls Twilio, writes the returned sid, THEN flips
-- the status. Each step narrows the window:
--   · crash before the provider call  → 'claimed', no sid  → nothing was sent;
--     sms_release_stale_send_claims() frees the claim.
--   · crash after the provider call, after the sid write → 'claimed', WITH a
--     sid → Twilio accepted it; this function marks it, and the ordinary
--     sms-status callback (which matches on twilio_sid) settles it too.
--   · crash after the provider call, BEFORE the sid write → we hold nothing
--     that names the accepted message. That window is real and this migration
--     does not close it; sms_release_stale_send_claims() says so out loud.
CREATE OR REPLACE FUNCTION public.sms_reconcile_accepted_send(
  p_provider_sid  TEXT,
  p_status        TEXT DEFAULT 'accepted',
  p_error_code    TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_provider_sid IS NULL OR btrim(p_provider_sid) = '' THEN
    RETURN NULL;
  END IF;

  -- Only a row that is STILL an open claim is reconciled here. A row that
  -- already carries its own outcome is not re-stated by a late callback: that
  -- is sms-status's job (00282/00458), and this function must never walk back
  -- a terminal status the delivery webhook recorded.
  UPDATE public.sms_messages m
     SET twilio_status = COALESCE(NULLIF(btrim(p_status), ''), 'accepted'),
         error_code    = COALESCE(NULLIF(btrim(p_error_code), ''), m.error_code),
         error_message = COALESCE(NULLIF(btrim(p_error_message), ''), m.error_message)
   WHERE m.twilio_sid = btrim(p_provider_sid)
     AND m.twilio_status = 'claimed'
   RETURNING m.id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.sms_reconcile_accepted_send(TEXT, TEXT, TEXT, TEXT) IS
  'The Field Line (00640), contract S5: settle a send the provider ACCEPTED but '
  'whose status write never landed. The sender records the provider id before '
  'it flips the status, so such a row is findable by sid while still reading '
  '''claimed''; a sms-status callback carrying that MessageSid identifies it. '
  'Returns the reconciled message id, or NULL when there was nothing open to '
  'reconcile (already settled, or never claimed). Never walks back a terminal '
  'status a delivery callback already recorded. Service-role only: it is the '
  'webhook''s and the cron''s door, not a studio member''s.';

REVOKE ALL ON FUNCTION public.sms_reconcile_accepted_send(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_reconcile_accepted_send(TEXT, TEXT, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sms_release_stale_send_claims(
  p_older_than INTERVAL DEFAULT interval '15 minutes'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requeued INTEGER;
  v_failed   INTEGER;
BEGIN
  -- REQUEUED, NOT FAILED (SQ-43 R1). A claim nobody came back for is a text
  -- that was never sent — not a text that failed. Marking it 'failed' recorded
  -- the wrong fact and, worse, ended the send: the trade was simply never
  -- contacted and the row said the rail had tried. Handing it back to
  -- 'deferred' with the claim stamp cleared puts it where flushDeferredMessages
  -- looks, so the next flush re-checks every gate, mints a fresh link and sends
  -- it. The row KEEPS its logical claim (sms_messages_send_claim_uniq counts
  -- 'deferred' as live), so this is the same send resuming, never a second one.
  UPDATE public.sms_messages m
     SET twilio_status = 'deferred',
         claimed_at    = NULL,
         error_message = 'A sender took this claim and never reported an '
                         'outcome; the send was queued again.'
   WHERE m.twilio_status = 'claimed'
     AND m.twilio_sid IS NULL
     AND m.claimed_at IS NOT NULL
     AND m.claimed_at < now() - p_older_than
     AND m.recipe ->> 'template_key' IS NOT NULL;
  GET DIAGNOSTICS v_requeued = ROW_COUNT;

  -- And what CANNOT be rendered again is still failed, honestly. A row with no
  -- recipe can only be re-sent verbatim, and its stored body is the caller's
  -- audit copy — the redacted preview contract S6 forbids putting on the wire.
  -- Failing it releases the logical claim, so the caller may compose the send
  -- again with the words it actually meant; it does not guess at them here.
  UPDATE public.sms_messages m
     SET twilio_status = 'failed',
         error_code    = COALESCE(m.error_code, 'claim_abandoned'),
         error_message = COALESCE(m.error_message,
                                  'The sender took this claim and never reported an outcome, '
                                  'and the row carries no recipe to render a fresh send from.')
   WHERE m.twilio_status = 'claimed'
     AND m.twilio_sid IS NULL
     AND m.claimed_at IS NOT NULL
     AND m.claimed_at < now() - p_older_than
     AND m.recipe ->> 'template_key' IS NULL;
  GET DIAGNOSTICS v_failed = ROW_COUNT;

  RETURN v_requeued + v_failed;
END;
$$;

COMMENT ON FUNCTION public.sms_release_stale_send_claims(INTERVAL) IS
  'The Field Line (00640), contract S5: release send claims that never reported '
  'an outcome — rows still at ''claimed'' with NO provider id after p_older_than '
  '— so the logical send can be attempted again. A row that can be RENDERED '
  'again (it carries a recipe) goes back to ''deferred'' with its claim stamp '
  'cleared, which is where flushDeferredMessages looks: the same send resumes, '
  'gates re-checked and link minted fresh, and it keeps its logical claim so a '
  'resume is never a second text. A row with no recipe could only be re-sent '
  'verbatim from a stored body that is an audit preview, so it is failed '
  'honestly instead, releasing the claim for a caller to compose again. Returns '
  'how many claims were released, either way. It only touches rows with no '
  'twilio_sid, because a row that has one was accepted by the provider and '
  'belongs to sms_reconcile_accepted_send(). THE RESIDUAL WINDOW IS REAL AND IS '
  'NOT CLOSED HERE: a sender that crashed after Twilio accepted a message but '
  'before it could write the sid leaves a row this function will release, and '
  'the retry is then a SECOND carrier attempt at one logical send. There is no '
  'idempotency key on the Twilio Messages API to close it with, so the rail is '
  'at-least-once at the carrier and nothing in this phase may claim otherwise. '
  'Service-role only.';

REVOKE ALL ON FUNCTION public.sms_release_stale_send_claims(INTERVAL)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_release_stale_send_claims(INTERVAL)
  TO service_role;
