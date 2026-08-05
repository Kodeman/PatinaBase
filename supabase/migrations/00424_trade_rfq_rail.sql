-- ═══════════════════════════════════════════════════════════════════════════
-- 00424 — The trade RFQ: asking a sub for their number, and hearing it back
--
-- 00423 gave the trade scope everything except the conversation that produces
-- its buying position. `trade_scope_bids` could be WRITTEN — the studio typing
-- in what Hollis said on the phone — but there was no way to ASK. The two
-- columns 00423 left bare on that table say so in the schema itself:
--
--   rfq_request_id uuid,     -- 'Bare uuid, deliberately unconstrained: the RFQ
--   response_token_id uuid,  --  dispatch rail does not exist yet …'
--
-- This is that rail:
--
--   · trade_rfq_requests — one ask, per (scope, party). It carries the message
--     and the timeline the studio wrote, and a SNAPSHOT of the sections as they
--     read at the moment of asking. The scope's sections stay editable while the
--     scope is a draft; the RFQ freezes what was ASKED, so a number that comes
--     back is answerable to the words it was quoted against and not to whatever
--     the studio wrote afterwards.
--   · trade_rfq_tokens — the no-auth link, cut to the 00283/00284 field-link
--     idioms exactly: sha256 at rest, the raw token returned once at mint,
--     revoke-then-mint so at most one link per ask is live, and NULL-on-miss on
--     the resolve path so a dead link leaks nothing — not even whether it ever
--     existed.
--   · the two bare columns become real foreign keys.
--
-- WHAT THE SUB IS SHOWN, AND WHAT THEY ARE NOT. resolve_trade_rfq_link answers
-- with a narrow DTO: the studio's name, the scope title, the rooms and the
-- prose, the timeline, the message, and their OWN prior answer. It never
-- projects the client price, the draw schedule, any other party's bid, the
-- client's identity — or the PROJECT'S NAME, which is a client surname often
-- enough ('the Ashford residence') that it cannot be treated as neutral. A sub
-- quoting millwork is being asked what THEY charge; what the studio is charging
-- for it, and who they are charging, is the studio's business and the
-- client's — not a third party's.
--
-- SERVICE-ROLE SEAMS. Two RPCs here are service_role only, asserted on the JWT
-- role claim the way 00400's and 00423's trusted wrappers do it:
--   · mint_trade_rfq_token — it returns a live credential. The only caller is
--     the trade-rfq-send edge function, which mints inside a request it has
--     already authorized as the scope's designer.
--   · submit_trade_rfq_response — its caller is an UNAUTHENTICATED sub holding a
--     link. The client portal's server action re-resolves the token itself and
--     calls in as the service client; nothing an anon browser holds may reach
--     it directly.
-- resolve_trade_rfq_link is granted to authenticated and service_role and
-- revoked from PUBLIC/anon, matching resolve_field_link (00283:307-316): the
-- guest route reads it through the portal's service client.
--
-- Current-body lineage grafted here (grep-verified head at authoring time, body
-- VERBATIM except the stated delta):
--   _execute_trade_scope_authorized ............ 00423 (sole) → 00424
--   void_trade_scope ........................... 00423 (sole) → 00424
--
-- The delta on each is ONE line, the same line: retiring a scope closes its
-- asking. Both seams call public._close_trade_rfqs_for_scope, which revokes the
-- scope's live links and closes its open asks. A sub who still holds a link
-- after the client has signed — or after the studio voided the whole document —
-- must not be able to move a number that is already priced or already dead, and
-- must be TOLD which of those it is rather than that their link is broken. See
-- PART 7's ordering note and PART 8.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — DDL: the ask, and the link that carries it
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The ask ───────────────────────────────────────────────────────────────
-- party_id is RESTRICT for the same reason trade_scope_bids.party_id is: an ask
-- without an asked party is not evidence of anything, and the studio's buying
-- record must refuse to lose its counterparty. The display name and the email
-- are snapshotted anyway — the name at authoring time, the email at SEND time,
-- because the email is a statement about where a specific message actually went.
CREATE TABLE IF NOT EXISTS public.trade_rfq_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES public.project_parties(id) ON DELETE RESTRICT,
  party_display_name text,
  party_email text,
  message text,
  timeline text,
  -- What was ASKED. Sections remain editable while the scope is a draft; this is
  -- the frozen copy the returned number answers to.
  scope_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(scope_snapshot) = 'object'),
  scope_snapshot_hash text
    CHECK (scope_snapshot_hash IS NULL OR scope_snapshot_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'responded', 'closed')),
  sent_at timestamptz,
  responded_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One UNSENT ask per (scope, party) — the 00403 draft-only shape
-- (idx_vendor_quote_requests_configuration_draft). Preparing again while the ask
-- is still a draft REVISES it; preparing again after it has gone out mints a
-- NEW ask, which is the honest record: a second ask, against whatever the
-- sections say now, is a different question.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_rfq_draft_per_party
  ON public.trade_rfq_requests(proposal_id, party_id)
  WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_trade_rfq_requests_proposal
  ON public.trade_rfq_requests(proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_rfq_requests_party
  ON public.trade_rfq_requests(party_id);

COMMENT ON TABLE public.trade_rfq_requests IS
  'One request for a number, per trade scope per party. Carries the message, the timeline, and a frozen snapshot of the sections as they read when the ask went out. STUDIO-ONLY at the table edge; a party reaches theirs solely through resolve_trade_rfq_link.';
COMMENT ON COLUMN public.trade_rfq_requests.scope_snapshot IS
  'The sections as they read at the moment of asking. Draft sections stay editable, so this is what a returned bid is answerable to. Deliberately carries no allocation, no client price and no draw schedule — a sub is asked what they charge, not told what the client pays.';
COMMENT ON COLUMN public.trade_rfq_requests.party_email IS
  'Snapshotted at SEND, not at authoring: it records where the message actually went, which a later roster edit must not rewrite.';

-- ── The link ──────────────────────────────────────────────────────────────
-- 00283's field_link_tokens, re-cut for an RFQ: sha256 at rest, raw token
-- returned once, revoke-then-mint (hash-at-rest precludes re-emitting an
-- existing token's raw value, so "resend" means "revoke and mint a fresh one"),
-- and a 30-day life — shorter than a field link's 90 because an ask that has
-- been open a month has been answered or abandoned.
CREATE TABLE IF NOT EXISTS public.trade_rfq_tokens (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  rfq_request_id uuid NOT NULL REFERENCES public.trade_rfq_requests(id) ON DELETE CASCADE,
  -- Denormalized from the ask, deliberately: every read path this token serves
  -- keys on the scope and the party, and the token is the row a guest request
  -- arrives holding. CASCADE on both, because a token to a vanished scope or a
  -- vanished party is not a credential, it is a dangling row.
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES public.project_parties(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_used_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_rfq_tokens_active
  ON public.trade_rfq_tokens(rfq_request_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_trade_rfq_tokens_proposal_active
  ON public.trade_rfq_tokens(proposal_id)
  WHERE status = 'active';

COMMENT ON TABLE public.trade_rfq_tokens IS
  'The no-auth link an RFQ travels on. Stores sha256(token) as hex only; the raw token exists once, returned by mint_trade_rfq_token (service_role). Revoke-then-mint keeps at most one live link per ask. Guests read through resolve_trade_rfq_link exclusively, which returns NULL on any miss.';
COMMENT ON COLUMN public.trade_rfq_tokens.token_hash IS
  'sha256(raw token) as hex — the guest lookup key. A database leak cannot reconstruct a working link.';

-- ── updated_at touch ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_trade_rfq_requests ON public.trade_rfq_requests;
CREATE TRIGGER set_updated_at_trade_rfq_requests
  BEFORE UPDATE ON public.trade_rfq_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_trade_rfq_tokens ON public.trade_rfq_tokens;
CREATE TRIGGER set_updated_at_trade_rfq_tokens
  BEFORE UPDATE ON public.trade_rfq_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── The two bare columns become real foreign keys ─────────────────────────
-- 00423:227-228 left these unconstrained because the tables they point at did
-- not exist. They do now. SET NULL on both: a bid is the studio's record of a
-- number it was given, and it must survive the deletion of the paperwork the
-- number arrived on — losing the provenance is a smaller harm than losing the
-- bid. (Mirrors trade_scope_terms.party_id's ON DELETE SET NULL for the same
-- reason: the record outlives its references.)
ALTER TABLE public.trade_scope_bids
  DROP CONSTRAINT IF EXISTS trade_scope_bids_rfq_request_id_fkey;
ALTER TABLE public.trade_scope_bids
  ADD CONSTRAINT trade_scope_bids_rfq_request_id_fkey
  FOREIGN KEY (rfq_request_id) REFERENCES public.trade_rfq_requests(id)
  ON DELETE SET NULL;

ALTER TABLE public.trade_scope_bids
  DROP CONSTRAINT IF EXISTS trade_scope_bids_response_token_id_fkey;
ALTER TABLE public.trade_scope_bids
  ADD CONSTRAINT trade_scope_bids_response_token_id_fkey
  FOREIGN KEY (response_token_id) REFERENCES public.trade_rfq_tokens(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.trade_scope_bids.rfq_request_id IS
  'The ask this number answers, when it came back through an RFQ rather than over the phone. A real FK as of 00424; ON DELETE SET NULL so the bid outlives its paperwork.';
COMMENT ON COLUMN public.trade_scope_bids.response_token_id IS
  'The link the party answered on (00424). ON DELETE SET NULL for the same reason as rfq_request_id.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — RLS and grants
--
-- Both tables are STUDIO-ONLY, FOR ALL, keyed through the owning scope's
-- designer, using public.is_design_studio_comember — the tightened posture
-- 00423:340-353 argued for and applied to all four trade tables. The same
-- reasoning applies here with more force: an RFQ names who the studio is
-- shopping to, and a token row is a live credential's shadow.
--
-- There is deliberately NO client policy and NO anon policy on either table. A
-- party reaches their ask through resolve_trade_rfq_link and answers through
-- submit_trade_rfq_response, both SECURITY DEFINER, neither reachable by anon.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trade_rfq_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_rfq_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trade_rfq_requests_studio_rw ON public.trade_rfq_requests;
CREATE POLICY trade_rfq_requests_studio_rw ON public.trade_rfq_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p
                 WHERE p.id = trade_rfq_requests.proposal_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                      WHERE p.id = trade_rfq_requests.proposal_id
                        AND public.is_design_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS trade_rfq_tokens_studio_rw ON public.trade_rfq_tokens;
CREATE POLICY trade_rfq_tokens_studio_rw ON public.trade_rfq_tokens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p
                 WHERE p.id = trade_rfq_tokens.proposal_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                      WHERE p.id = trade_rfq_tokens.proposal_id
                        AND public.is_design_studio_comember(p.designer_id)));

-- Post-flip (2026-05-30) ACLs are explicit; nothing here relies on creation
-- defaults. The REVOKE precedes the GRANT so the file is idempotent against a
-- database that saw an earlier, wider version of it.
--
-- READ ONLY for authenticated, and on the token table not even that in full.
-- Every write on this rail goes through a SECURITY DEFINER seam that has an
-- opinion about it — prepare_trade_rfq for the ask, mint_trade_rfq_token and
-- submit_trade_rfq_response (service_role) for the link and the answer, the
-- execution and void deltas for the close. A table-level UPDATE grant would let
-- a studio member re-write a frozen snapshot, un-revoke a dead link, or reopen a
-- closed ask with a hand-typed statement, out of band of every rule those
-- functions exist to enforce. The RLS policies stay FOR ALL: they describe WHOSE
-- rows these are, and the definer seams run as the owner, so the ACL is the
-- layer that says which verbs a logged-in session may use directly.
--
-- token_hash is granted to NOBODY but service_role. It is sha256 of a live
-- credential; a studio member has no use for it, and the column-level grant is
-- what makes `select('*')` on this table fail loudly rather than hand it over.
-- anon is revoked explicitly, not left to a default: Strata predates the flip,
-- so a table created there is auto-granted to anon at creation, and only RLS
-- would be standing between an anonymous key and this rail. RLS holds — there
-- is no anon policy — but a live credential's table is not the place to depend
-- on one layer.
REVOKE ALL ON public.trade_rfq_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.trade_rfq_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trade_rfq_requests TO authenticated;
GRANT SELECT (
  id, rfq_request_id, proposal_id, party_id, status, expires_at, last_used_at,
  created_at
) ON public.trade_rfq_tokens TO authenticated;
GRANT ALL ON public.trade_rfq_requests TO service_role;
GRANT ALL ON public.trade_rfq_tokens TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — What an ask freezes
-- ═══════════════════════════════════════════════════════════════════════════

-- The snapshot is deliberately NARROWER than the fingerprint's 'sections' arm
-- (00423:1259-1266): no allocation_cents, no project_room_id, no ids at all.
-- Allocation is the studio apportioning the CLIENT's price across rooms; a sub
-- being asked for a number has no business seeing it. What travels is the room
-- it happens in and the words describing the work.
CREATE OR REPLACE FUNCTION public._trade_rfq_scope_snapshot(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'scopeTitle', p.title,
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'roomName', s.room_name,
        'prose', s.prose,
        'sortOrder', s.sort_order
      ) ORDER BY s.sort_order, s.id)
      FROM public.trade_scope_sections s WHERE s.proposal_id = p.id
    ), '[]'::jsonb)
  )
  FROM public.proposals p
  WHERE p.id = p_proposal_id;
$$;
REVOKE ALL ON FUNCTION public._trade_rfq_scope_snapshot(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._trade_rfq_scope_snapshot(uuid) IS
  'The scope as an RFQ asks it: title, and the rooms and prose. No allocation, no price, no draws — private helper for prepare_trade_rfq.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — Preparing an ask
-- ═══════════════════════════════════════════════════════════════════════════

-- Upsert-by-draft, the 00403 prepare_configuration_quote_request shape: revise
-- the unsent ask if there is one, otherwise mint a fresh one. The window is
-- draft OR sent, matching the window a bid may be recorded in — the studio is
-- still buying right up until the client signs, and a scope out for signature
-- is exactly when a late number is worth having.
CREATE OR REPLACE FUNCTION public.prepare_trade_rfq(
  p_proposal_id uuid,
  p_party_id uuid,
  p_message text DEFAULT NULL,
  p_timeline text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_party public.project_parties%ROWTYPE;
  v_request public.trade_rfq_requests%ROWTYPE;
  v_snapshot jsonb;
  v_hash text;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR SHARE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR auth.uid() IS NULL
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.commercial_state NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'a trade scope may only be put out for bid while it is a draft or out for signature'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'trade scope has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The same party-scoping set_trade_scope_party and select_trade_bid enforce
  -- (00423:1413-1418, 1490-1495). An RFQ is the third way a party's identity
  -- reaches this document, and it is the one that puts a live link in their
  -- hands — so it gets the same check, not a weaker one.
  SELECT * INTO v_party FROM public.project_parties WHERE id = p_party_id;
  IF NOT FOUND OR v_party.project_id IS DISTINCT FROM v_document.project_id THEN
    RAISE EXCEPTION 'party % does not belong to project %',
      p_party_id, v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_snapshot := public._trade_rfq_scope_snapshot(p_proposal_id);
  v_hash := encode(extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO v_request FROM public.trade_rfq_requests
  WHERE proposal_id = p_proposal_id AND party_id = p_party_id AND status = 'draft'
  FOR UPDATE;

  IF FOUND THEN
    -- A draft ask is normally private paperwork — nobody outside the studio has
    -- seen it, so revising it revises nothing anyone was told. A LIVE LINK
    -- changes that: the question is in the party's hands, and re-snapshotting it
    -- would silently move the words a sub is quoting against while they are
    -- quoting against them. (The ordinary send stamps the ask 'sent', so this
    -- only bites the draft-with-a-live-link shape a partial send leaves behind —
    -- which is exactly the shape where the freeze matters most, because the link
    -- went out and the bookkeeping did not.) Revoke the link, then revise.
    IF EXISTS (
      SELECT 1 FROM public.trade_rfq_tokens t
      WHERE t.rfq_request_id = v_request.id
        AND t.status = 'active'
        AND t.expires_at > now()
    ) THEN
      RAISE EXCEPTION 'the request is already in the party''s hands — revoke its link before revising'
        USING ERRCODE = 'check_violation';
    END IF;

    -- COALESCE only on ABSENT (NULL). An explicit empty string is a studio
    -- deleting the words it wrote, and a form that cannot clear a field is a
    -- form that makes its own last draft permanent.
    UPDATE public.trade_rfq_requests SET
      party_display_name = v_party.display_name,
      message = CASE WHEN p_message IS NULL THEN message
                     ELSE NULLIF(btrim(p_message), '') END,
      timeline = CASE WHEN p_timeline IS NULL THEN timeline
                      ELSE NULLIF(btrim(p_timeline), '') END,
      scope_snapshot = v_snapshot,
      scope_snapshot_hash = v_hash
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  ELSE
    INSERT INTO public.trade_rfq_requests (
      proposal_id, party_id, party_display_name, message, timeline,
      scope_snapshot, scope_snapshot_hash, status, created_by
    ) VALUES (
      p_proposal_id, p_party_id, v_party.display_name,
      NULLIF(btrim(COALESCE(p_message, '')), ''),
      NULLIF(btrim(COALESCE(p_timeline, '')), ''),
      v_snapshot, v_hash, 'draft', auth.uid()
    ) RETURNING * INTO v_request;
  END IF;

  RETURN jsonb_build_object(
    'id', v_request.id,
    'proposalId', v_request.proposal_id,
    'projectId', v_document.project_id,
    'partyId', v_request.party_id,
    'partyDisplayName', v_request.party_display_name,
    'status', v_request.status,
    'message', v_request.message,
    'timeline', v_request.timeline,
    'scopeSnapshotHash', v_request.scope_snapshot_hash,
    'sentAt', v_request.sent_at,
    'respondedAt', v_request.responded_at,
    'createdAt', v_request.created_at,
    'updatedAt', v_request.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_trade_rfq(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_trade_rfq(uuid, uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.prepare_trade_rfq(uuid, uuid, text, text) IS
  'Creates or revises the unsent RFQ for a (trade scope, party) and freezes the sections as they read now. Draft-only upsert (00403 idiom); never sends anything and never mints a link. Refuses to re-snapshot a draft that already has a live link — the question is in the party''s hands, so the link must be revoked before the words move. NULL message/timeline leave the stored values alone; an empty string clears them.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — Minting the link
-- ═══════════════════════════════════════════════════════════════════════════

-- SERVICE ROLE ONLY, asserted on the JWT role claim exactly as
-- execute_trade_scope_with_trusted_ip does (00423:2081-2084). This function
-- returns a live credential; its only caller is the trade-rfq-send edge
-- function, which has already proven the caller is the scope's designer before
-- it calls in as the service client. Granting it to authenticated would let any
-- studio member mint a link for any ask their RLS lets them see, out of band of
-- the send that is supposed to be the act of handing it over.
--
-- Revoke-then-mint: hash-at-rest means an existing token's raw value can never
-- be re-emitted, so "send it again" is "kill the old link, cut a new one"
-- (00283:116-119). At most one link per ask is live.
CREATE OR REPLACE FUNCTION public.mint_trade_rfq_token(p_rfq_id uuid)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_request public.trade_rfq_requests%ROWTYPE;
  v_token text;
  v_hash text;
  v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'minting a trade RFQ link requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request FROM public.trade_rfq_requests
  WHERE trade_rfq_requests.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade RFQ % not found', p_rfq_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_request.status = 'closed' THEN
    RAISE EXCEPTION 'trade RFQ % is closed and cannot be re-linked', p_rfq_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.trade_rfq_tokens SET status = 'revoked'
  WHERE rfq_request_id = p_rfq_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.trade_rfq_tokens (
    rfq_request_id, proposal_id, party_id, token_hash, created_by
  ) VALUES (
    p_rfq_id, v_request.proposal_id, v_request.party_id, v_hash, auth.uid()
  ) RETURNING trade_rfq_tokens.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.mint_trade_rfq_token(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mint_trade_rfq_token(uuid) TO service_role;

COMMENT ON FUNCTION public.mint_trade_rfq_token(uuid) IS
  'Mints the no-auth link for an RFQ and returns the RAW token ONCE (service_role only). Revokes any prior active link for the same ask; only sha256(token) is stored.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — The only guest read path
-- ═══════════════════════════════════════════════════════════════════════════

-- resolve_field_link's shape (00283:182-299): validate by hash + status +
-- expiry, bump last_used_at, answer with a narrow DTO, and return NULL on ANY
-- miss — invalid, revoked, expired, or pointing at something that has since
-- vanished. A dead link is indistinguishable from a link that never existed.
--
-- The DTO's ABSENCES are the point of the function:
--   · no client price, no allocation, no draw schedule. What the studio charges
--     the client is not the sub's business, and a sub who can see it prices
--     against it rather than against the work.
--   · no other party's bid, and no count of them. A sub must not learn they are
--     one of three, or what the other two said.
--   · no client identity, AND NO PROJECT NAME. The sub is told the studio's
--     name — who they are working for — and the scope's title, which is what
--     the work is. The project's name is not the third thing they need: studios
--     name projects after the people who live in them ('the Ashford residence',
--     'Vance loft'), so projecting it hands a sub the client's surname under an
--     innocent key. The project row is still read and still gates the answer —
--     an ask pointing at a vanished project resolves NULL — it just does not
--     travel.
--   · the sub's OWN prior answer IS projected: they are entitled to see the
--     number they gave, and the alternative is a form that silently overwrites.
CREATE OR REPLACE FUNCTION public.resolve_trade_rfq_link(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_token public.trade_rfq_tokens%ROWTYPE;
  v_request public.trade_rfq_requests%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_studio_name text;
  v_sections jsonb;
  v_existing jsonb;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN NULL;  -- dead link
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_token FROM public.trade_rfq_tokens t
  WHERE t.token_hash = v_hash
    AND t.status = 'active'
    AND t.expires_at > now()
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;  -- invalid / revoked / expired → dead link (no leak)
  END IF;

  SELECT * INTO v_request FROM public.trade_rfq_requests
  WHERE id = v_token.rfq_request_id;
  IF v_request.id IS NULL THEN
    RETURN NULL;
  END IF;
  -- The same window submit answers in. A link whose ask is still a DRAFT was
  -- minted out of band of the send that is supposed to hand it over — the portal
  -- cannot produce one, but the RPC can, and a draft ask is a question the studio
  -- has not finished writing. A CLOSED ask is over. Both are dead links here,
  -- which is why the DTO's `rfq.status` can only ever read 'sent' or 'responded'.
  IF v_request.status NOT IN ('sent', 'responded') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = v_request.proposal_id;
  IF v_proposal.id IS NULL OR v_proposal.document_kind <> 'trade_scope' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = v_request.proposal_id;
  IF v_document.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_document.project_id;
  IF v_project.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.trade_rfq_tokens SET last_used_at = now() WHERE id = v_token.id;

  -- The studio's own name for the header — the designer's active design_studio
  -- org, else their display name. No client PII, exactly as resolve_field_link
  -- does it (00283:225-236).
  SELECT o.name INTO v_studio_name
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
   WHERE om.user_id = v_proposal.designer_id
     AND om.status = 'active'
     AND o.type = 'design_studio'
   ORDER BY om.created_at
   LIMIT 1;
  IF v_studio_name IS NULL THEN
    SELECT COALESCE(pr.full_name, 'your designer') INTO v_studio_name
      FROM public.profiles pr WHERE pr.id = v_proposal.designer_id;
  END IF;

  -- Read from the SNAPSHOT, not from the live sections: the sub is answering
  -- the question that was asked. Projected down to roomName + prose, so even a
  -- snapshot written by a future, wider builder cannot widen this DTO.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'roomName', s.value->>'roomName',
           'prose', s.value->>'prose'
         ) ORDER BY s.ordinality), '[]'::jsonb)
    INTO v_sections
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(v_request.scope_snapshot->'sections') = 'array'
                THEN v_request.scope_snapshot->'sections'
                ELSE '[]'::jsonb END
         ) WITH ORDINALITY AS s(value, ordinality);

  SELECT jsonb_build_object(
           'amountCents', b.amount_cents,
           'note', b.note,
           'respondedAt', b.responded_at
         )
    INTO v_existing
    FROM public.trade_scope_bids b
   WHERE b.proposal_id = v_request.proposal_id
     AND b.party_id = v_request.party_id
     AND b.source = 'party_response'
   LIMIT 1;

  RETURN jsonb_build_object(
    'studioName', v_studio_name,
    'scopeTitle', COALESCE(
      NULLIF(btrim(COALESCE(v_request.scope_snapshot->>'scopeTitle', '')), ''),
      v_proposal.title),
    'partyDisplayName', v_request.party_display_name,
    'sections', v_sections,
    'timeline', v_request.timeline,
    'message', v_request.message,
    'rfq', jsonb_build_object(
      'id', v_request.id,
      'status', v_request.status,
      'respondedAt', v_request.responded_at
    ),
    'existingResponse', v_existing
  );
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_trade_rfq_link(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_trade_rfq_link(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_trade_rfq_link(text) IS
  'The only guest read path for a trade RFQ link. Validates by hash + status + expiry AND by the ask being sent or responded, bumps last_used_at, returns a narrow JSONB DTO (studio, scope title, room prose from the frozen snapshot, timeline, message, the party''s own prior answer). NULL on any miss. NEVER the client price, the draws, another party''s bid, the client''s identity — or the project''s name, which routinely carries the client''s surname.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — Hearing the number back
-- ═══════════════════════════════════════════════════════════════════════════

-- SERVICE ROLE ONLY, same assertion as the mint. The caller is a server action
-- in the client portal holding a token an unauthenticated browser supplied; it
-- re-resolves the token here rather than trusting anything the page carried.
--
-- LOCK ORDER: THE SCOPE FIRST, ALWAYS. This function and the execution delta in
-- PART 8 touch the same three tables, and they are the two things that can
-- plausibly run at the same instant — the client presses Sign while a sub
-- presses Send. Execution locks proposals → … → trade_rfq_tokens →
-- trade_rfq_requests. If this function locked the token it arrived holding and
-- only then reached for the proposal, the two would take the same pair of rows
-- in opposite orders and Postgres would resolve the ABBA by killing one of them
-- with a 40P01 — at signature time, in front of a client. So the token is read
-- ONCE WITHOUT A LOCK, purely to learn which scope it belongs to; the proposal
-- is locked first (FOR SHARE — nothing here writes it, it only has to hold
-- still); and only then are the token and the ask locked and RE-READ. Nothing
-- the unlocked pass returned is trusted afterwards: every value it produced is
-- fetched again under the lock, because the award may have landed in between,
-- and that is precisely the case this ordering exists for.
--
-- CHECK ORDER IS DELIBERATE, and it is the one thing in this function that is
-- not obvious. The "is this window still open" questions are answered BEFORE
-- the "is this link still live" one. The reason is the delta in PART 8:
-- awarding the work revokes every live link for the scope. Under the natural
-- ordering, the sub who opens the email an hour after the client signed is told
-- their link is invalid — which is both untrue and useless. They are told the
-- truth instead: the window is closed. Nothing is disclosed by this that the
-- holder of a valid raw token did not already know, and a caller holding NO
-- valid token never gets past the hash lookup.
CREATE OR REPLACE FUNCTION public.submit_trade_rfq_response(
  p_token text,
  p_amount_cents integer,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_proposal_id uuid;
  v_token public.trade_rfq_tokens%ROWTYPE;
  v_request public.trade_rfq_requests%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_party public.project_parties%ROWTYPE;
  v_bid public.trade_scope_bids%ROWTYPE;
  v_written public.trade_scope_bids%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_replayed boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'answering a trade RFQ requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents < 0 THEN
    RAISE EXCEPTION 'a trade RFQ response must carry a whole, non-negative amount in cents'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RAISE EXCEPTION 'invalid_rfq_link' USING ERRCODE = 'no_data_found';
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- PASS ONE, UNLOCKED. This read decides NOTHING. Its only job is to name the
  -- scope so the scope can be locked first (see the lock-order note above).
  SELECT t.proposal_id INTO v_proposal_id FROM public.trade_rfq_tokens t
  WHERE t.token_hash = v_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_rfq_link' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = v_proposal_id FOR SHARE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope' THEN
    RAISE EXCEPTION 'invalid_rfq_link' USING ERRCODE = 'no_data_found';
  END IF;

  -- PASS TWO, UNDER LOCK. Re-read, not re-used: an execution that committed
  -- between the two passes has revoked this link and closed this ask, and the
  -- rows fetched here are the ones that say so.
  SELECT * INTO v_token FROM public.trade_rfq_tokens t
  WHERE t.token_hash = v_hash FOR UPDATE;
  IF NOT FOUND OR v_token.proposal_id IS DISTINCT FROM v_proposal.id THEN
    -- Gone, or no longer this scope's — either way the proposal we are holding
    -- is not the one this link is about, and we will not answer into it.
    RAISE EXCEPTION 'invalid_rfq_link' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_request FROM public.trade_rfq_requests
  WHERE id = v_token.rfq_request_id FOR UPDATE;
  IF v_request.id IS NULL OR v_request.proposal_id IS DISTINCT FROM v_proposal.id THEN
    RAISE EXCEPTION 'invalid_rfq_link' USING ERRCODE = 'no_data_found';
  END IF;

  -- The window, first (see the ordering note above), read off the rows we hold.
  IF v_proposal.commercial_state NOT IN ('draft', 'sent')
     OR v_request.status = 'closed'
  THEN
    RAISE EXCEPTION 'bid_window_closed' USING ERRCODE = 'check_violation';
  END IF;

  -- Then liveness.
  IF v_token.status <> 'active' OR v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_rfq_link' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_request.status NOT IN ('sent', 'responded') THEN
    RAISE EXCEPTION 'invalid_rfq_link' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_party FROM public.project_parties WHERE id = v_request.party_id;

  -- At most one party response per (scope, party) — uniq_trade_scope_party_response
  -- (00423:242-244). The row is READ under lock to decide what kind of arrival
  -- this is (a replay, a revision, or a first answer), and then WRITTEN through
  -- ON CONFLICT on that same partial index. The read cannot lock a row that does
  -- not exist yet, so two first answers for one pair — the double-clicked form,
  -- the retried request that beat its own predecessor — would otherwise race
  -- into a 23505 the sub reads as a broken form rather than as their bid landing.
  SELECT * INTO v_bid FROM public.trade_scope_bids b
  WHERE b.proposal_id = v_request.proposal_id
    AND b.party_id = v_request.party_id
    AND b.source = 'party_response'
  FOR UPDATE;

  IF FOUND THEN
    -- Once the studio has SELECTED this number it is the buying position the
    -- document is being written against. A sub does not get to move it out from
    -- under an award by re-opening an old email.
    IF v_bid.status = 'selected' THEN
      RAISE EXCEPTION 'bid_locked' USING ERRCODE = 'check_violation';
    END IF;

    IF v_bid.amount_cents = p_amount_cents
       AND v_bid.note IS NOT DISTINCT FROM v_note
    THEN
      -- The same number, again. A double-submitted form, a retried request, a
      -- back button. The BID does not move, and its responded_at keeps saying
      -- when the answer actually arrived.
      v_replayed := true;
    END IF;
  END IF;

  IF NOT v_replayed THEN
    INSERT INTO public.trade_scope_bids (
      proposal_id, party_id, party_display_name, amount_cents, status, source,
      note, rfq_request_id, response_token_id, responded_at
    ) VALUES (
      v_request.proposal_id, v_request.party_id,
      COALESCE(v_party.display_name, v_request.party_display_name),
      p_amount_cents, 'quoted', 'party_response',
      v_note, v_request.id, v_token.id, now()
    )
    ON CONFLICT (proposal_id, party_id) WHERE source = 'party_response'
    DO UPDATE SET
      amount_cents = EXCLUDED.amount_cents,
      note = EXCLUDED.note,
      responded_at = EXCLUDED.responded_at,
      rfq_request_id = EXCLUDED.rfq_request_id,
      response_token_id = EXCLUDED.response_token_id,
      party_display_name = COALESCE(v_party.display_name,
                                    trade_scope_bids.party_display_name)
    WHERE trade_scope_bids.status <> 'selected'
    RETURNING * INTO v_written;

    IF v_written.id IS NULL THEN
      -- The conflicting row is selected and the branch above did not see it,
      -- which means it was selected between that read and this write. Same
      -- refusal, write side: the award is not overwritten by an ON CONFLICT.
      RAISE EXCEPTION 'bid_locked' USING ERRCODE = 'check_violation';
    END IF;
    v_bid := v_written;
  END IF;

  -- THE ASK AND THE LINK RECORD EVERY ARRIVAL, REPLAY INCLUDED. A replay is not
  -- a non-event: the sub opened the link and pressed the button, and
  -- last_used_at is the only evidence anywhere that they did — the studio
  -- chasing a silent sub needs to know the link was used, not merely minted.
  -- What a replay must not move is WHEN the answer arrived, and it does not:
  -- responded_at is first-answer-only on the ask (COALESCE) and untouched on the
  -- bid. The status stamp is unconditional for the same reason — an ask that has
  -- been answered reads 'responded' no matter which arrival did it.
  UPDATE public.trade_rfq_requests SET
    status = 'responded',
    responded_at = COALESCE(responded_at, now())
  WHERE id = v_request.id;
  UPDATE public.trade_rfq_tokens SET last_used_at = now() WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'ok', true,
    'bidId', v_bid.id,
    'amountCents', v_bid.amount_cents,
    'respondedAt', v_bid.responded_at,
    'replayed', v_replayed
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_trade_rfq_response(text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_trade_rfq_response(text, integer, text)
  TO service_role;

COMMENT ON FUNCTION public.submit_trade_rfq_response(text, integer, text) IS
  'Records a party''s answer to an RFQ against a raw link token (service_role only). Locks the scope BEFORE the link and the ask — the same order the execution delta takes them in, so a signature and an answer cannot deadlock — and re-reads both under that lock. Idempotent on an identical amount+note (replayed; the ask and the link still record the arrival), last-write-wins otherwise, and refuses with bid_locked once the studio has selected the number or bid_window_closed once the scope has left the buying window.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — Retiring a scope closes the asking
--
-- A trade scope stops being out for bid in exactly two ways, and BOTH of them
-- have to end the asking or the rail leaks a live credential into a document
-- that is finished with:
--
--   · the client SIGNS — the price is fixed and the work is awarded;
--   · the studio VOIDS it — the document is retired and there is nothing left
--     to quote.
--
-- The second one is the easier to forget and the more embarrassing to explain:
-- a studio that voids a scope has told everyone in the room the ask is off, and
-- a link that still resolves afterwards invites a sub to spend an evening
-- pricing work that no longer exists — and then lets them submit into it,
-- because void leaves commercial_state 'superseded', which the window gate
-- reads as closed only by accident of enumeration. So the sweep is factored
-- into ONE private helper and called from both seams, rather than written twice
-- and maintained once.
--
-- In execution it lands inside the `sent → executed` arm, after the deposit
-- draw is linked and before the GUC restore, so it participates in the same
-- transaction and the same EXCEPTION unwind as everything else execution does.
-- The retry arm is deliberately untouched: an idempotent retry finds the asks
-- already closed. In void it lands after the supersede write, for the same
-- reason and with the same unwind.
--
-- Lineage:
--   _execute_trade_scope_authorized ..... 00423 (sole) → 00424
--   void_trade_scope .................... 00423 (sole) → 00424
-- ═══════════════════════════════════════════════════════════════════════════

-- Both sweeps are needed and neither is redundant: the token revoke kills the
-- credential (resolve_trade_rfq_link then answers NULL), and the close is what
-- submit_trade_rfq_response reads to tell a late sub the truth —
-- 'bid_window_closed' — instead of that their link is broken.
--
-- LOCK ORDER: both callers already hold the proposal row when they call this,
-- and this helper never reaches back for it. That is the invariant
-- submit_trade_rfq_response's two-pass lock order is written against (PART 7);
-- a future caller that touches these tables before locking the scope reopens
-- the ABBA that ordering exists to close.
CREATE OR REPLACE FUNCTION public._close_trade_rfqs_for_scope(p_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.trade_rfq_tokens SET status = 'revoked'
  WHERE proposal_id = p_proposal_id AND status = 'active';
  UPDATE public.trade_rfq_requests SET
    status = 'closed', closed_at = now()
  WHERE proposal_id = p_proposal_id AND status <> 'closed';
END;
$$;
REVOKE ALL ON FUNCTION public._close_trade_rfqs_for_scope(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._close_trade_rfqs_for_scope(uuid) IS
  'Ends the asking for one trade scope: revokes every live RFQ link and closes every open ask. Private helper — called by _execute_trade_scope_authorized (the client signed) and void_trade_scope (the studio retired it), each of which already holds the proposal row.';

-- Modeled on _execute_furnishings_authorization_authorized (00422 head): the
-- same private-authorized / public-wrapper / trusted-ip triple, the same
-- signature topology checks, the same adopt-designer-claims idiom for issuing
-- the invoice, and the same idempotent-retry contract keyed on immutable
-- evidence. What differs is what execution PRODUCES: no lines are minted or
-- linked here at all. A trade scope's presence in the schedule appears at
-- ENGAGEMENT, once the deposit is actually paid — an unpaid scope has not
-- started, and a room plan that says otherwise is lying to the client.
CREATE OR REPLACE FUNCTION public._execute_trade_scope_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw public.trade_scope_draws%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_invoice_id uuid;
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_draw text := current_setting('app.trade_draw_invoice_id', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'trade scope execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.client_id IS DISTINCT FROM v_actor
     OR v_proposal.document_kind <> 'trade_scope'
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'trade scope has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'trade scope % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- Defense in depth, exactly as the furnishings rail does it: the origin proved
  -- at authoring must still be there when the authority is exercised.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms FROM public.trade_scope_terms WHERE proposal_id = p_proposal_id;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'trade scope signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'trade scope signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_draw FROM public.trade_scope_draws
    WHERE proposal_id = p_proposal_id ORDER BY sort_order, id LIMIT 1 FOR UPDATE;
    IF v_draw.id IS NULL THEN
      RAISE EXCEPTION 'trade scope has no draw schedule to bill'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Belt to the send seam's braces. The send gate refuses a schedule whose
    -- first draw gates on acceptance, so this should be unreachable — but the
    -- draw about to be billed unconditionally, at signature, is the last place
    -- to notice that it says it is due on acceptance. issue_trade_draw_invoice
    -- makes the same assertion at its own seam; this rail should not be the one
    -- place a gated draw can be billed without the gate.
    IF v_draw.gates_on_acceptance THEN
      RAISE EXCEPTION 'the trade scope deposit draw gates on acceptance and cannot be billed at signature'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_trade_scope')
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- Draw one is the deposit. It is issued unconditionally: the whole point of
    -- a draw schedule is that the first draw is what puts the trade to work.
    INSERT INTO public.invoices (
      project_id, designer_id, client_id, status, currency,
      subtotal_cents, tax_rate, tax_cents, total_cents, memo
    ) VALUES (
      v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
      'draft', COALESCE(v_terms.currency, 'USD'),
      v_draw.amount_cents, 0, 0, v_draw.amount_cents,
      'Trade scope deposit · ' || v_draw.label
    ) RETURNING id INTO v_deposit_invoice_id;
    INSERT INTO public.invoice_line_items (
      invoice_id, kind, description, quantity, unit_amount_cents,
      amount_cents, metadata
    ) VALUES (
      v_deposit_invoice_id, 'adhoc', v_draw.label, 1,
      v_draw.amount_cents, v_draw.amount_cents,
      jsonb_build_object(
        'tradeScopeId', p_proposal_id,
        'tradeScopeDocumentId', v_document.id,
        'drawId', v_draw.id,
        'kind', 'trade_draw'
      )
    );
    -- The client executes; issuance stays a studio act. Adopt the owning
    -- designer only for the existing issuance RPC, then restore the caller.
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', v_proposal.designer_id, 'role', 'authenticated'
    )::text, true);
    PERFORM public.issue_invoice(v_deposit_invoice_id, current_date);
    PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);

    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    PERFORM set_config('app.trade_draw_invoice_id', v_draw.id::text, true);
    UPDATE public.trade_scope_draws SET invoice_id = v_deposit_invoice_id
    WHERE id = v_draw.id;
    PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);

    -- 00424 DELTA — the work is awarded, so the asking is over.
    PERFORM public._close_trade_rfqs_for_scope(p_proposal_id);

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'trade scope % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = v_document.id;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'commercialState', 'executed',
    'progressState', COALESCE((SELECT t.progress_state FROM public.trade_scope_terms t
      WHERE t.proposal_id = p_proposal_id), 'none'),
    'depositInvoiceId', v_document.deposit_invoice_id,
    'depositRequiredCents', (SELECT i.total_cents FROM public.invoices i
      WHERE i.id = v_document.deposit_invoice_id),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents FROM public.invoices i
      WHERE i.id = v_document.deposit_invoice_id), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._execute_trade_scope_authorized(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- The public wrapper and the trusted-IP twin (00423:2047-2101) are UNCHANGED
-- and deliberately not re-emitted: both delegate whole, and neither carries a
-- line this delta touches.

-- ── Voiding closes the asking too ─────────────────────────────────────────
-- 00423:2654-2709 body VERBATIM except ONE added line — the same helper call
-- execution makes. Everything else here, including the deliberate non-write of
-- proposals.status and the GUC save/restore around the supersede, is 00423's.
--
-- The call lands after the supersede write and after the GUC restore: the
-- commercial-document audit trigger the GUC is for does not watch these tables,
-- and the sweep has no business inside that window. It is inside the same
-- transaction and the same EXCEPTION unwind, so a void that fails leaves the
-- links exactly as it found them.
--
-- Lineage: 00423 (sole) → 00424.
CREATE OR REPLACE FUNCTION public.void_trade_scope(
  p_proposal_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'voiding a trade scope requires an authenticated author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'voiding a trade scope requires a reason of at least 5 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF COALESCE(v_proposal.commercial_state, 'draft') NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'trade scope % is % and can no longer be voided',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'draft')
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    commercial_state = 'superseded',
    superseded_at = now(),
    superseded_reason = v_reason,
    updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);

  -- 00424 DELTA — the document is retired, so the asking is over. A sub holding
  -- a link to a voided scope must not be able to spend an evening pricing it,
  -- and must not be able to answer into it.
  PERFORM public._close_trade_rfqs_for_scope(p_proposal_id);

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'commercialState', 'superseded'
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.void_trade_scope(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_trade_scope(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.void_trade_scope(uuid, text) IS
  'Retires a draft or sent trade scope with an audited reason, and ends its asking — every live RFQ link revoked, every open ask closed (00424). Executed scopes are terminal. status is deliberately left alone, so a never-sent draft stays invisible to the client.';
