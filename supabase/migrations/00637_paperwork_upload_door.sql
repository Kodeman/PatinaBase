-- ═══════════════════════════════════════════════════════════════════════════
-- 00637 — People room CRM · W4 (P3, 3 of 3): the trade-side compliance
--         upload door (PR-a, VISION V10)
--
-- Kody overruled the panel's park on 2026-09-11: BUILD the upload door in P3
-- (rulings.md PR-a, docs/vision/VISION-DECISIONS.md V10). Five of six
-- construction seats asked for the same object (AM-1, AM-8, AM-10, AM-13,
-- AM-15). The contract is build/upload-door-spec.md, ten sections; this file
-- is its §2 (token), §4 (storage), §5 (write path), §7 (audit) and §8 (data
-- changes). §3 (the page) and §6's band are the portal's; the edge function is
-- supabase/functions/paperwork-upload.
--
-- WHAT THE DOOR IS. One firm's paperwork, on a token keyed to
-- (organization_id, company_id) — NOT a repurposed field_link_tokens row,
-- which is keyed to (party_id, project_id): one person, one job. A firm's
-- paperwork contact holding seats on three jobs has ONE paperwork link
-- (R-AF), and a seat on the same firm's field link who is not the paperwork
-- contact sees no Paperwork section at all.
--
-- HASH AT REST, like every other bearer rail: sha256(token) hex is stored, the
-- raw value is returned once by the mint, and every read re-derives the
-- company from the TOKEN ROW and never from client input (§2, acceptance 3).
--
-- THE WINDOW (R-AD, PR-d, PR-l). expires_at is the latest on_site_to across
-- the firm's currently active seats at this studio, extended to the firm's
-- warranty_until only when the minting member asks for it. A firm with NO
-- active engagement has no window to borrow: the studio must name the date on
-- the mint act, in words, and a mint that names none is REFUSED
-- (paperwork_link_window_required). No silent fallback clock — that is the
-- 90-day default PR-d retired, and R-AD forbids reinventing it here.
--
-- NEVER OVERWRITES A VERIFIED DOCUMENT (§5.4). An upload always INSERTs; the
-- supersede happens on CONFIRM (§5.5), never on upload, and no row is ever
-- deleted by this door (§7 retention).
--
-- AND THE PAPER IT SUPERSEDES IS THE PAPER OF THE SAME NAME (W4 r9 MAJOR-1).
-- For every type but `other_named` the doc_type IS the identity; for
-- `other_named` the identity is the label, which is what resolve_paperwork_link
-- groups on ('other_named:' || lower(doc_label)). The confirm and the gate
-- inheritance both carry that label leg now, so a Safety plan can no longer
-- retire a Resale certificate — nor be refused for failing to carry its gates.
--
-- TWO DEVIATIONS FROM THE SPEC, named so they can be overruled in one line:
--
--  1. §2's rate limit is specified as "a BEFORE INSERT trigger" in the shape of
--     qr_auth_rate_limits (00427). There is no per-attempt table here to hang a
--     trigger on — the resolve and the upload are RPC calls, not inserts — so
--     the same atomic ON CONFLICT bucket lives in a function,
--     paperwork_link_rate_limit_hit(text, text, integer), which the edge
--     function calls before it does any work. One bucket covers BOTH calls,
--     which is the §2 requirement a script must not be able to dodge by
--     splitting volume. The key is the caller's address where there is a valid
--     one, the LIVE link's row id where there is not, the token's own sha256
--     where the token resolves to nothing live, and one shared bucket only for
--     a caller presenting no token at all: an inet parameter on a door whose
--     caller writes the address was itself the bypass (R-CA, W4 r10 MAJOR-2),
--     and a bucket that told a dead token from an unminted one was the next
--     one (W4 r11 MAJOR-2, §3).
--  2. The notification recipients (R-AC: owners and admins, plus the minter)
--     are written as notification_log in_app rows by the RPC itself rather than
--     through notification-dispatch, because the writer here is a DEFINER RPC
--     called from an anonymous edge request and has no session to dispatch on.
--     The row shape is 00572's, verbatim.
--
-- AND THE BUCKETS ARE SWEPT (W4 r12 MAJOR-1). 00427's table shape came with a
-- cron broom and this file took only the table; §3b schedules the broom, since
-- the key space is caller-chosen and the door is anonymous.
--
-- Lineage: paperwork_link_tokens, paperwork_link_rate_limits,
-- mint_paperwork_link, revoke_paperwork_link, resolve_paperwork_link,
-- record_inbound_compliance_document, confirm_inbound_document,
-- reject_inbound_document, paperwork_link_rate_limit_hit — all NEW (verified
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql
-- empty at 00636 for each). v_access_grants: 00627 → this file (00627's body
-- verbatim plus a twelfth branch, spec §8). compliance_state: 00623 → this
-- file (00623's body verbatim, two predicates added to its counting SELECT —
-- W4 round-1 review QA-B1 / MAJOR-2, section 1b). access_grants_invoice_links:
-- 00627 → this file (00627's body verbatim, one column changed — W4 round-1
-- review M-2, section 9b).
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. studio_compliance_documents — the reject columns (spec §8)
-- ═══════════════════════════════════════════════════════════════════════════
-- `source` and `inbound` already exist (00623:143-146, minted there for this
-- door); `superseded_by` too. Only the reject trail is new.
ALTER TABLE public.studio_compliance_documents
  ADD COLUMN IF NOT EXISTS rejected_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.studio_compliance_documents
  DROP CONSTRAINT IF EXISTS studio_compliance_documents_reject_check;
ALTER TABLE public.studio_compliance_documents
  ADD CONSTRAINT studio_compliance_documents_reject_check CHECK (
    -- A rejection carries its moment and its reason, or it is not a rejection.
    (rejected_at IS NULL AND btrim(COALESCE(rejection_reason, '')) = '')
    OR (rejected_at IS NOT NULL AND btrim(COALESCE(rejection_reason, '')) <> '')
  );

-- A paper cannot be both confirmed and refused. The two acts are exclusive and
-- the row records whichever happened.
ALTER TABLE public.studio_compliance_documents
  DROP CONSTRAINT IF EXISTS studio_compliance_documents_verify_xor_reject_check;
ALTER TABLE public.studio_compliance_documents
  ADD CONSTRAINT studio_compliance_documents_verify_xor_reject_check CHECK (
    verified_at IS NULL OR rejected_at IS NULL
  );

COMMENT ON COLUMN public.studio_compliance_documents.rejected_by IS
  'The studio member who refused an inbound document (spec §6, §7).';
COMMENT ON COLUMN public.studio_compliance_documents.rejection_reason IS
  'Why the studio refused it, in the member''s own words. Required whenever '
  'rejected_at is set; the row is kept, never deleted — it is the record of '
  'what was tried and refused (spec §7 retention).';

CREATE INDEX IF NOT EXISTS idx_studio_compliance_documents_pending
  ON public.studio_compliance_documents (organization_id, holder_id, created_at DESC)
  WHERE inbound = true AND verified_at IS NULL AND rejected_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1b. compliance_state — paper nobody has checked is not paper the studio
--     holds (W4 round-1 review QA-B1 / MAJOR-2)
-- ═══════════════════════════════════════════════════════════════════════════
-- 00623's body verbatim (grep -rln "CREATE OR REPLACE FUNCTION[^(]*compliance_state"
-- supabase/migrations/*.sql | sort | tail -1 → 00623), with two predicates
-- added to the counting SELECT. It is re-headed HERE rather than edited there
-- because `rejected_at` is section 1's column, three statements above, and a
-- SQL function body is parsed at creation.
--
-- WHAT WAS WRONG. The count took every non-superseded row with no reference to
-- verified_at or rejected_at, and this file's own door (section 8) INSERTs an
-- inbound document `verified_at NULL, superseded_by NULL`. So on a firm
-- holding no paper of that type the word went `not_on_file → current` the
-- instant the trade uploaded — before any studio member opened it — and stayed
-- `current` after a member had explicitly REFUSED it (reproduced live in
-- round-1 QA: the company card's Paper table, the Directory row, the seat
-- line, every roster row, and the firm's own /paperwork/<token> page all read
-- the refused licence as held). For a doc_type carrying real gates that is
-- site_access, payment or draw reading as satisfied on a document the studio
-- never verified and had said no to.
--
-- BOTH LEGS ARE NAMED. `rejected_at IS NULL` is redundant today — a refused row
-- is always inbound and unverified — and it is written anyway, so that a later
-- edit to the inbound leg cannot quietly reopen the refused half. A document
-- the STUDIO recorded itself (`inbound = false`) is held the moment it is
-- typed, as it always was: the studio saying so IS the check, and
-- useRecordComplianceDocument never stamps verified_at.
--
-- identity_paper_state() (00626 → 00629) folds this function over the card and
-- its firm, so the whole Directory, every seat line and every roster row follow
-- from this one edit. `retainedComplianceDocuments` in @patina/supabase carries
-- the same rule to the browser's own list.
CREATE OR REPLACE FUNCTION public.compliance_state(p_holder_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH RECURSIVE chain(root, root_blocks, root_doc_type, succ, depth) AS (
    -- every retired row of this card, and the first hop of its chain
    SELECT d.id, d.blocks, d.doc_type, d.superseded_by, 0
      FROM public.studio_compliance_documents d
     WHERE d.holder_id = p_holder_id
       AND d.superseded_by IS NOT NULL
    UNION ALL
    -- … then the next hop, carrying the ROOT's gates AND the ROOT's paper
    -- forward unchanged
    SELECT c.root, c.root_blocks, c.root_doc_type, s.superseded_by, c.depth + 1
      FROM chain c
      JOIN public.studio_compliance_documents s ON s.id = c.succ
     WHERE c.depth < 64                        -- the head-of-chain guard makes
  ),                                           -- superseded_by acyclic; this
                                               -- caps a chain written before it
  retired AS (
    -- a row leaves the reckoning while ANY reachable successor still earns
    -- the retirement: in force, carrying at least the root's gates, and the
    -- SAME PAPER the root is (W3 r8 B-1 — the doc_type leg)
    SELECT DISTINCT c.root
      FROM chain c
      JOIN public.studio_compliance_documents s ON s.id = c.succ
     WHERE (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
       AND c.root_blocks <@ s.blocks
       AND s.doc_type = c.root_doc_type
  )
  SELECT CASE
           WHEN count(*) = 0 THEN 'not_on_file'
           WHEN count(*) FILTER (
                  WHERE cardinality(d.blocks) > 0
                    AND d.expires_on IS NOT NULL
                    AND d.expires_on < CURRENT_DATE) > 0 THEN 'lapsed'
           WHEN count(*) FILTER (
                  WHERE cardinality(d.blocks) > 0
                    AND d.expires_on IS NOT NULL
                    AND d.expires_on <= CURRENT_DATE + 30) > 0 THEN 'lapses_soon'
           ELSE 'current'
         END
    FROM public.studio_compliance_documents d
   WHERE d.holder_id = p_holder_id
     -- PAPER NOBODY CHECKED IS NOT PAPER THE STUDIO HOLDS (W4 r1 QA-B1 /
     -- MAJOR-2, the two legs below).
     AND d.rejected_at IS NULL
     AND NOT (d.inbound AND d.verified_at IS NULL)
     AND (d.superseded_by IS NULL
          OR d.id NOT IN (SELECT root FROM retired));
$$;

REVOKE ALL ON FUNCTION public.compliance_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compliance_state(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.compliance_state(uuid) IS
  'The paper word for one rolodex card: current | lapses_soon | lapsed | '
  'not_on_file (direction §3.8), over its non-superseded documents. Since '
  '00637 it counts only paper the studio HOLDS: an inbound upload waiting for '
  'a check, and a refused one, are not held, and the inbound queue band is '
  'where a pending upload is read. Worst-first; only paper with a non-empty '
  'blocks[] can move the word off current; undated paper is held and cannot '
  'lapse; NO paper at all is not_on_file. A superseded row leaves the '
  'reckoning only while a reachable successor is in force, carries its gates '
  'and is the same doc_type (00623''s recursive walk, kept verbatim).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. paperwork_link_tokens (spec §2)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.paperwork_link_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.studio_contacts(id) ON DELETE CASCADE,

  token_hash      text NOT NULL,

  status          text NOT NULL DEFAULT 'active',
  expires_at      timestamptz NOT NULL,
  last_used_at    timestamptz,

  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason   text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paperwork_link_tokens
  DROP CONSTRAINT IF EXISTS paperwork_link_tokens_status_check;
ALTER TABLE public.paperwork_link_tokens
  ADD CONSTRAINT paperwork_link_tokens_status_check
  CHECK (status IN ('active', 'revoked'));

ALTER TABLE public.paperwork_link_tokens
  DROP CONSTRAINT IF EXISTS paperwork_link_tokens_token_hash_check;
ALTER TABLE public.paperwork_link_tokens
  ADD CONSTRAINT paperwork_link_tokens_token_hash_check
  CHECK (token_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE public.paperwork_link_tokens
  DROP CONSTRAINT IF EXISTS paperwork_link_tokens_dead_check;
ALTER TABLE public.paperwork_link_tokens
  ADD CONSTRAINT paperwork_link_tokens_dead_check
  CHECK ((status <> 'active') = (revoked_at IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_paperwork_link_tokens_hash
  ON public.paperwork_link_tokens(token_hash);
-- R-AF: one live paperwork token per firm, by convention — enforced.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_paperwork_link_tokens_active_company
  ON public.paperwork_link_tokens(company_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_paperwork_link_tokens_org
  ON public.paperwork_link_tokens(organization_id, created_at DESC);

-- The company_id must name a COMPANY card in the SAME studio as the token —
-- spec §2 ("CHECK that the referenced row is company_kind, not a person"). A
-- CHECK cannot read another table, so it is a BEFORE trigger, the 00593
-- assert_channel_owner_kind shape.
CREATE OR REPLACE FUNCTION public.assert_paperwork_token_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kind text;
  v_org  uuid;
BEGIN
  SELECT sc.entity_kind, sc.organization_id INTO v_kind, v_org
    FROM public.studio_contacts sc WHERE sc.id = NEW.company_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'paperwork_token_company_not_found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_kind <> 'company' THEN
    RAISE EXCEPTION 'paperwork_token_company_required'
      USING HINT = 'A paperwork link is a firm''s door, never a person''s.',
            ERRCODE = 'check_violation';
  END IF;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'paperwork_token_company_wrong_studio'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_paperwork_token_company()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assert_paperwork_token_company_trg ON public.paperwork_link_tokens;
CREATE TRIGGER assert_paperwork_token_company_trg
  BEFORE INSERT OR UPDATE OF company_id, organization_id
  ON public.paperwork_link_tokens
  FOR EACH ROW EXECUTE FUNCTION public.assert_paperwork_token_company();

ALTER TABLE public.paperwork_link_tokens ENABLE ROW LEVEL SECURITY;

-- Spec §8: studio-member read; no anon or client policy at any tier. Writes go
-- through the definer RPCs below, so there is no INSERT/UPDATE policy either —
-- the mint's window rule and the revoke's reason are not optional.
DROP POLICY IF EXISTS paperwork_link_tokens_member_select ON public.paperwork_link_tokens;
CREATE POLICY paperwork_link_tokens_member_select
  ON public.paperwork_link_tokens FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(organization_id));

REVOKE ALL ON TABLE public.paperwork_link_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.paperwork_link_tokens TO authenticated;
GRANT ALL ON public.paperwork_link_tokens TO service_role;

COMMENT ON TABLE public.paperwork_link_tokens IS
  'PR-a / V10: the trade-side compliance upload door, keyed to (studio, firm) '
  'and not to a seat on a job — a firm''s paperwork contact holds ONE link '
  'however many of the studio''s jobs they are on (R-AF). sha256 at rest, raw '
  'value emitted once by mint_paperwork_link. expires_at is the firm''s '
  'engagement window at this studio, or a date the studio named out loud '
  '(R-AD); there is no fallback clock. Studio-member SELECT only; every write '
  'is a SECURITY DEFINER RPC (00637, spec §2).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. paperwork_link_rate_limits (spec §2) — one bucket, both calls
-- ═══════════════════════════════════════════════════════════════════════════
--
-- THE BUCKET IS KEYED BY TEXT, NOT BY inet (R-CA, W4 r10 MAJOR-2). An `inet`
-- parameter on a door whose caller supplies the address was the whole defect:
-- `cf-connecting-ip: not-an-ip` and the perfectly ordinary proxy value
-- `1.2.3.4:5678` both raised 22P02 (invalid input syntax for type inet),
-- PostgREST returned it as an error, and the edge function's `if (error)
-- return true` turned one header into a switch that disabled the door's only
-- abuse control. Two things close it, and both are needed:
--   · the callers validate the address to a v4/v6 shape before it is sent, and
--     treat ANY error from this function as a refusal (paperwork-upload/
--     core.ts, apps/client-portal /paperwork/[token]);
--   · the key is text and every caller-derived value is normalized here, so
--     there is no cast left to fail on.
--
-- AND NOBODY IS UNBUCKETED. A caller with no usable address used to be waved
-- through by construction (`if (!deps.ip) return true`), which is the same
-- bypass wearing different clothes. When there is no address the bucket falls
-- to the LINK the caller is knocking on — the token's row id, never the token
-- — and when the token resolves to nothing live, to a bucket of the token's
-- OWN hash. A no-address caller therefore cannot learn whether a token is real
-- by watching which answer it gets: every knock lands in a bucket of its own.
--
-- AND THE BUCKET IS NOT AN EXISTENCE ORACLE (W4 r11 MAJOR-2). The first shape
-- of this ladder was ip → link → one shared `anon` key, and the `link:` lookup
-- carried NO liveness predicate. So a revoked or expired token still resolved
-- to its own private bucket while everything unresolved shared `anon`: an
-- address-less caller saturated `anon` with twenty junk knocks, and from then
-- on a 64-hex value that had NEVER been minted answered 429 while a 64-hex
-- value that had been minted and since died answered "within limit". That is
-- the question upload-door-spec acceptance 4 forbids the door to answer —
-- "neither path reveals whether the token once existed" — reachable by anyone,
-- because `cf-connecting-ip` and `x-forwarded-for` are caller-written and a
-- caller may simply present neither.
--
-- Two changes close it, and both are needed:
--   · the `link:` branch carries the SAME liveness predicate the resolvers use
--     (status = 'active' AND expires_at > now()), so a dead token resolves to
--     no link at all, exactly as an unminted one does;
--   · the unresolved case is keyed by the token's own sha256 rather than by a
--     shared string, so a dead token and a never-minted token each get a fresh
--     private bucket and answer identically. `anon` is left for a caller who
--     presents no token to key on at all — a caller who can open nothing, and
--     so can deny nothing to anyone who can.
-- The hash is what is stored at rest anyway (§2): keying by it puts no new
-- secret in the table.
CREATE TABLE IF NOT EXISTS public.paperwork_link_rate_limits (
  bucket_key        text PRIMARY KEY
                      CHECK (length(bucket_key) BETWEEN 1 AND 200),
  window_started_at timestamptz NOT NULL,
  attempt_count     integer NOT NULL CHECK (attempt_count > 0),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paperwork_link_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paperwork_link_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.paperwork_link_rate_limits TO service_role;

COMMENT ON TABLE public.paperwork_link_rate_limits IS
  'Service-only atomic buckets for the anonymous paperwork door. One bucket '
  'covers BOTH the resolve and the upload so volume cannot be split across the '
  'two calls to dodge the limit (spec §2). bucket_key is ''ip:<address>'' for a '
  'caller with a valid address; ''link:<token row id>'' for one without, when '
  'the token is LIVE; ''tok:<sha256 of the token>'' for one without, when the '
  'token resolves to nothing live — so a dead token and a never-minted token '
  'get identical private buckets and identical answers (spec acceptance 4, W4 '
  'r11 MAJOR-2); and ''anon'' only when no token was presented at all. Nobody '
  'is unbucketed (R-CA). qr_auth_rate_limits'' shape (00427), keyed by text '
  'rather than inet because the address is caller-supplied.';

-- The (inet, integer) form is gone: it is this file's own object, never
-- deployed, and leaving it standing would let a caller reach the version with
-- the cast in it.
DROP FUNCTION IF EXISTS public.paperwork_link_rate_limit_hit(inet, integer);

CREATE OR REPLACE FUNCTION public.paperwork_link_rate_limit_hit(
  p_ip    text,
  p_token text DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_now   timestamptz := clock_timestamp();
  v_key   text;
  v_count integer;
BEGIN
  -- The address, if it is one. The callers validate before sending; this is
  -- the second gate, so a value that is not an address buckets as one of the
  -- other two kinds rather than raising (R-CA).
  IF p_ip IS NOT NULL AND btrim(p_ip) <> '' THEN
    BEGIN
      v_key := 'ip:' || host(btrim(p_ip)::inet);
    EXCEPTION WHEN OTHERS THEN
      v_key := NULL;
    END;
  END IF;

  -- No address: the link the caller is knocking on. The id, never the token
  -- (the token is the credential and never lands in a table in the clear).
  --
  -- THE LIVENESS PREDICATE IS THE RESOLVERS' OWN (W4 r11 MAJOR-2). Without it
  -- a revoked or expired token still resolved to its own private bucket while
  -- unknown tokens shared one, which made the limiter answer "was this ever
  -- minted?". A dead token resolves to no link here, exactly as an unminted
  -- one does, and falls to the hash branch below with it.
  IF v_key IS NULL AND p_token IS NOT NULL AND p_token ~ '^[0-9a-f]{64}$' THEN
    SELECT 'link:' || t.id::text INTO v_key
    FROM public.paperwork_link_tokens t
    WHERE t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      AND t.status = 'active'
      AND t.expires_at > now();

    -- No live link for a well-formed token — dead, or never minted. The two
    -- are the same answer here: a fresh private bucket keyed by the token's
    -- own hash, which is the value already stored at rest (§2). Never the raw
    -- token, and never a shared key that one caller could spend on another's
    -- behalf.
    IF v_key IS NULL THEN
      v_key := 'tok:' || encode(extensions.digest(p_token, 'sha256'), 'hex');
    END IF;
  END IF;

  -- No address and no token to key on: one shared bucket rather than a free
  -- pass. A caller in this branch can open nothing, so it can deny nothing to
  -- a caller who can.
  v_key := COALESCE(v_key, 'anon');

  INSERT INTO public.paperwork_link_rate_limits AS limits
    (bucket_key, window_started_at, attempt_count, updated_at)
  VALUES (v_key, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
  SET attempt_count = CASE
        WHEN limits.window_started_at <= v_now - interval '1 minute' THEN 1
        ELSE limits.attempt_count + 1
      END,
      window_started_at = CASE
        WHEN limits.window_started_at <= v_now - interval '1 minute' THEN v_now
        ELSE limits.window_started_at
      END,
      updated_at = v_now
  RETURNING limits.attempt_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.paperwork_link_rate_limit_hit(text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paperwork_link_rate_limit_hit(text, text, integer)
  TO service_role;

COMMENT ON FUNCTION public.paperwork_link_rate_limit_hit(text, text, integer) IS
  'One atomic rolling-minute bucket for the paperwork door; true when the '
  'attempt is within the limit. Count-then-insert races; this does not '
  '(00427''s idiom). Keyed ip:<address> → link:<live token row id> → '
  'tok:<sha256 of the token> → anon, so a caller with no forwardable address '
  'is bucketed rather than waved through (R-CA, W4 r10 MAJOR-2), and a dead '
  'token is indistinguishable from a never-minted one because neither '
  'resolves to a link and both get a private hash bucket (spec acceptance 4, '
  'W4 r11 MAJOR-2). Never raises on a caller-supplied address: an '
  'unparsable one falls to the next key instead of 22P02, which the door used '
  'to swallow as a pass. Deviation from spec §2, named in this file''s banner: '
  'the bucket is a function rather than a BEFORE INSERT trigger because the '
  'door has no per-attempt table to hang one on (00637).';

-- ───────────────────────────────────────────────────────────────────────────
-- 3b. The broom (W4 r12 MAJOR-1)
-- ───────────────────────────────────────────────────────────────────────────
-- 00427's OTHER half, which this file took the table shape from and left
-- behind. The key space stopped being bounded when the bucket stopped being an
-- existence oracle (§3, W4 r11 MAJOR-2): every well-formed token that resolves
-- to nothing live now gets its OWN permanent row, keyed by its hash, and none
-- of those knocks is refused because the limit is per bucket. `ip:` is the same
-- shape — the address is caller-written. The door is anonymous by design
-- (verify_jwt = false, anon key, an unauthenticated /paperwork/[token]), so the
-- writer here is the internet and the table grows with every stranger's guess.
--
-- One day is 00427's own horizon and far longer than the rolling minute the
-- limiter reads (§3's ON CONFLICT), so no live bucket is ever swept out from
-- under a caller: a row older than a day can only start a fresh window anyway.
-- 23 past the hour keeps it clear of the QR broom at 17 past and the invoice
-- attempt sweep at 17 past (00574/00636).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 00630:546-556's idiom: the unschedule is guarded by EXISTS, the schedule is
-- NOT wrapped in an exception handler. A stack that cannot schedule the broom
-- must fail the migration rather than apply the door with its only bound on an
-- anonymously-written table silently absent.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'paperwork-link-rate-limit-cleanup'
  ) THEN
    PERFORM cron.unschedule('paperwork-link-rate-limit-cleanup');
  END IF;
END $$;

SELECT cron.schedule(
  'paperwork-link-rate-limit-cleanup',
  '23 * * * *',
  $$DELETE FROM public.paperwork_link_rate_limits
     WHERE updated_at < now() - interval '1 day';$$
);

-- The registry comment, carried forward from 00636 with this file's entry
-- added. Documentation only: a stack without pg_cron must not fail the
-- migration over a sentence.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Everyone on the Job (00637): paperwork-link-rate-limit-cleanup at 23 past every hour -> DELETE FROM public.paperwork_link_rate_limits WHERE updated_at < now() - interval ''1 day'', 00427''s broom for the anonymous paperwork door''s buckets, whose key space is caller-chosen (ip: / tok:) and therefore unbounded without it (W4 r12 MAJOR-1); no job_runs row, the same as qr-auth-rate-limit-cleanup. Everyone on the Job (00630): compliance-document-expiry-sweep nightly at 06:00 UTC -> public.sweep_compliance_expiries(), writing one studio_compliance_notices row per (document, state, expires_on) as a gating compliance paper enters lapses_soon or lapses, plus one in_app notification_log row per owner/admin of the holding studio; history in job_runs. The Invoice, Standing Alone (00574): invoice-checkout-attempts-expire at 17 past every hour -> public.expire_stale_invoice_checkout_attempts(), expiring claimed/session_created Checkout attempts older than 24h and, since 00636, processing attempts older than 10 days so a stuck ACH row cannot hold ensure_invoice_link''s mint guard open forever, history in job_runs. The Decision, Delivered (00572): decision-reminders-hourly on the hour -> the decision-reminders edge function, replacing 00092''s decision-reminders-daily at 09:00 UTC so the per-recipient not-before-8am-local gate has an hour to release into; notification-digest-hourly at 20 past -> the notification-digest edge function, replacing 00278''s notification-digest-daily at 15:00 UTC for the same reason (the summary owes the same 8am-local, never-Sunday promise as the letter); client-push-window-release every 15 minutes -> public.release_due_client_pushes(200), dispatching push envelopes held outside 8am-8pm local; decision-first-notice-retry-sweep every 30 minutes -> public.sweep_decision_first_notices(100), re-inviting decision-first-notice for a published approval that never got its letter. Studio onboarding (00553): expire-stale-workspace-invites-daily at 07:40 UTC. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes. Rendered Room v2 (00501): expire-stale-upload-intents-daily at 07:15 UTC. QR auth (00427): qr-auth-rate-limit-cleanup at 17 past every hour. Room View, Agent OS, BOH, Field Site Request, Mood Board, invoice/decision reminders, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. compliance-documents bucket (spec §4)
-- ═══════════════════════════════════════════════════════════════════════════
-- NOT project-documents: its storage.objects policies cast
-- (storage.foldername(name))[1]::uuid (00170, patched 00430) and prod already
-- carries a non-uuid first segment that raises 22P02 on any authenticated scan.
-- Here EVERY segment a policy casts is a real uuid and the filename is last.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'compliance-documents',
  'compliance-documents',
  false,
  15728640,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Studio members read their own studio's paper. NOBODY writes through a
-- client-side authenticated upload: the door's only writer is the edge
-- function's service-role client, which bypasses RLS entirely.
DROP POLICY IF EXISTS compliance_documents_member_read ON storage.objects;
CREATE POLICY compliance_documents_member_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'compliance-documents'
    AND public.is_active_studio_member(
      NULLIF((storage.foldername(name))[1], '')::uuid)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. mint_paperwork_link (spec §2, R-AD, PR-l)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mint_paperwork_link(
  p_company_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_org        uuid;
  v_window_end date;
  v_expires    timestamptz;
  v_token      text;
  v_id         uuid;
BEGIN
  SELECT sc.organization_id INTO v_org
    FROM public.studio_contacts sc
   WHERE sc.id = p_company_id AND sc.entity_kind = 'company';

  IF v_org IS NULL OR NOT public.is_active_studio_member(v_org) THEN
    -- One refusal for "no such firm" and for "not your studio".
    RAISE EXCEPTION 'paperwork_link_not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- PR-d's rule, spelled for a FIRM rather than a seat: the latest window end
  -- across the firm's currently open seats at this studio, and the firm's
  -- warranty end beside it (PR-l's second option).
  SELECT max(d) INTO v_window_end
    FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
    CROSS JOIN LATERAL (VALUES (pp.on_site_to), (pp.warranty_until)) AS v(d)
   WHERE pp.company_id = p_company_id
     AND pp.off_job_at IS NULL
     AND public.project_tenant_org(pp.project_id) = v_org;

  v_expires := CASE
    -- The studio's own named date wins: R-AD says the end date is chosen out
    -- loud on the mint act, and PR-l says the warranty end is offered as the
    -- second option rather than applied silently.
    WHEN p_expires_at IS NOT NULL AND p_expires_at > now() THEN p_expires_at
    WHEN v_window_end IS NOT NULL
     AND v_window_end::timestamptz + interval '1 day' > now()
         THEN v_window_end::timestamptz + interval '1 day'
    ELSE NULL
  END;

  IF v_expires IS NULL THEN
    -- R-AD: a firm with no live engagement may still be minted a link, but the
    -- studio names the date. There is no fallback clock to fall back to — PR-d
    -- retired the 90-day default and this door does not bring it back.
    RAISE EXCEPTION 'paperwork_link_window_required'
      USING HINT = 'This firm has no open engagement at this studio, so the '
                   'end date has to be chosen: offer 30 days or the firm''s '
                   'next engagement window, in words, on the mint act.',
            ERRCODE = 'check_violation';
  END IF;

  -- Regenerate: hash-at-rest precludes re-emitting the old address, and R-AF
  -- holds a firm to one live door.
  UPDATE public.paperwork_link_tokens
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
         revoke_reason = 'Replaced by a new paperwork link.', updated_at = now()
   WHERE company_id = p_company_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.paperwork_link_tokens
    (organization_id, company_id, token_hash, expires_at, created_by)
  VALUES (v_org, p_company_id,
          encode(extensions.digest(v_token, 'sha256'), 'hex'),
          v_expires, auth.uid())
  RETURNING paperwork_link_tokens.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_paperwork_link(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mint_paperwork_link(uuid, timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.mint_paperwork_link(uuid, timestamptz) IS
  'Mint the firm''s paperwork-upload link and return the raw token ONCE '
  '(sha256 at rest). Studio members of the firm''s own studio only; a company '
  'card is required, never a person. The window is R-AD''s: the caller''s named '
  'date when it is in the future, else the latest on_site_to / warranty_until '
  'across the firm''s open seats at this studio, and otherwise the mint is '
  'REFUSED with paperwork_link_window_required — no silent fallback clock '
  '(PR-d, PR-l). Revokes the firm''s prior live link (R-AF) (00637).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. revoke_paperwork_link (spec §2 revoke path, §7 audit)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_paperwork_link(
  p_token_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT t.organization_id INTO v_org
    FROM public.paperwork_link_tokens t WHERE t.id = p_token_id;
  IF v_org IS NULL OR NOT public.is_active_studio_member(v_org) THEN
    RAISE EXCEPTION 'paperwork_link_not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.paperwork_link_tokens
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
         revoke_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         updated_at = now()
   WHERE id = p_token_id AND status = 'active';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_paperwork_link(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_paperwork_link(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.revoke_paperwork_link(uuid, text) IS
  'Close a firm''s paperwork door. The row is kept (spec §7 audit); the reason '
  'is optional and recorded where v_access_grants reads it. Studio members of '
  'the token''s own studio only (00637).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. resolve_paperwork_link (spec §3) — the page's one read
-- ═══════════════════════════════════════════════════════════════════════════
-- Service-only, like every other guest-token resolver: the browser holds no DB
-- access and reaches this through the edge function / the portal's service
-- client. Malformed, unknown, revoked and expired all die into ONE null, so a
-- dead link never confirms it once existed (spec §3, S2's posture).
CREATE OR REPLACE FUNCTION public.resolve_paperwork_link(
  p_token       text,
  p_record_use  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row       public.paperwork_link_tokens%ROWTYPE;
  v_company   public.studio_contacts%ROWTYPE;
  v_studio    text;
  v_documents jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM public.paperwork_link_tokens
   WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  IF NOT FOUND OR v_row.status <> 'active' OR v_row.expires_at <= now() THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_company FROM public.studio_contacts WHERE id = v_row.company_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT o.name INTO v_studio FROM public.organizations o
   WHERE o.id = v_row.organization_id;

  IF p_record_use THEN
    UPDATE public.paperwork_link_tokens
       SET last_used_at = now(), updated_at = now()
     WHERE id = v_row.id;
  END IF;

  -- ONE ROW PER DOCUMENT TYPE, AND THE WORD IS THE STUDIO'S (R-BU).
  --
  -- This used to hand the page one row per DOCUMENT with a separate
  -- awaiting_check flag, and computed `state` from expires_on/blocks alone.
  -- A firm whose only COI was the one it had just uploaded therefore read
  -- 'current' here while compliance_state (§1b) read not_on_file on the
  -- studio's own card: the firm's page and the studio's book disagreed about
  -- the same paper. 'current' is now reserved for paper a studio member has
  -- CONFIRMED. A type whose only paper is an unchecked upload reads
  -- 'awaiting_check'; when a confirmed paper and an unchecked upload both
  -- stand, the confirmed paper is the row and awaiting_check rides as its flag
  -- (spec §3, W4 r7 MAJOR-2).
  --
  -- A REFUSED PAPER SAYS SO, IN THE STUDIO'S OWN WORDS (W4 r7 M-4). A rejected
  -- row used to be filtered out entirely, so the firm's page reverted from
  -- "Received. <Studio> will confirm it." to "<Doc type> is not on file." and
  -- the refusal reached nobody — the chase is an agent draft that lands
  -- awaiting_review, and Agent OS forbids automated external sends. The reject
  -- act already promises the firm reads the reason ("Say why it is refused.
  -- The firm reads this"), so it travels here. A refusal is the LAST WORD only
  -- while nothing has replaced it: a type that now holds confirmed paper, or
  -- carries a fresh upload waiting to be checked, speaks with that instead.
  --
  -- Still no ids, no file paths, no uploader names: the firm learns what paper
  -- the studio holds, what a lapse blocks, and why a paper came back (spec §3).
  WITH paper AS (
    SELECT doc.doc_type,
           doc.doc_label,
           doc.expires_on,
           doc.blocks,
           doc.rejection_reason,
           doc.rejected_at,
           doc.created_at,
           (doc.rejected_at IS NOT NULL)                          AS refused,
           (doc.inbound AND doc.verified_at IS NULL
              AND doc.rejected_at IS NULL)                        AS unchecked,
           CASE
             WHEN doc.expires_on IS NULL OR cardinality(doc.blocks) = 0
               THEN 'current'
             WHEN doc.expires_on < CURRENT_DATE THEN 'lapsed'
             WHEN doc.expires_on <= CURRENT_DATE + 30 THEN 'lapses_soon'
             ELSE 'current' END                                   AS held_state,
           CASE WHEN doc.doc_type = 'other_named'
                THEN 'other_named:' || lower(btrim(COALESCE(doc.doc_label, '')))
                ELSE doc.doc_type END                             AS group_key
      FROM public.studio_compliance_documents doc
     WHERE doc.holder_id = v_row.company_id
       AND doc.organization_id = v_row.organization_id
       AND doc.superseded_by IS NULL
  ),
  -- The paper the studio HOLDS: its own typed record, or an upload a member
  -- has confirmed. Worst word first, so one lapsed certificate is not hidden
  -- behind a current one of the same type.
  held AS (
    SELECT DISTINCT ON (group_key) *
      FROM paper
     WHERE NOT refused AND NOT unchecked
     ORDER BY group_key,
              CASE held_state WHEN 'lapsed' THEN 0
                              WHEN 'lapses_soon' THEN 1
                              ELSE 2 END,
              expires_on NULLS LAST
  ),
  unchecked_paper AS (
    SELECT DISTINCT ON (group_key) *
      FROM paper
     WHERE unchecked
     ORDER BY group_key, created_at DESC
  ),
  -- The most recent refusal, and only for a type with nothing else standing.
  refused_paper AS (
    SELECT DISTINCT ON (group_key) *
      FROM paper
     WHERE refused
     ORDER BY group_key, rejected_at DESC
  ),
  keys AS (
    SELECT DISTINCT group_key FROM paper
  ),
  grouped AS (
    SELECT k.group_key,
           COALESCE(h.doc_type, u.doc_type, r.doc_type)      AS doc_type,
           COALESCE(h.doc_label, u.doc_label, r.doc_label)   AS doc_label,
           COALESCE(h.expires_on, u.expires_on)              AS expires_on,
           COALESCE(h.blocks, u.blocks, r.blocks)            AS blocks,
           CASE
             WHEN h.group_key IS NOT NULL THEN h.held_state
             WHEN u.group_key IS NOT NULL THEN 'awaiting_check'
             ELSE 'refused' END                              AS state,
           (u.group_key IS NOT NULL)                         AS awaiting_check,
           CASE WHEN h.group_key IS NULL AND u.group_key IS NULL
                THEN r.rejection_reason END                  AS refusal_reason
      FROM keys k
      LEFT JOIN held            h ON h.group_key = k.group_key
      LEFT JOIN unchecked_paper u ON u.group_key = k.group_key
      LEFT JOIN refused_paper   r ON r.group_key = k.group_key
  )
  SELECT COALESCE(
           jsonb_agg(jsonb_build_object(
             'doc_type', g.doc_type,
             'doc_label', g.doc_label,
             'expires_on', g.expires_on,
             'blocks', g.blocks,
             'state', g.state,
             'awaiting_check', g.awaiting_check,
             'refusal_reason', g.refusal_reason
           ) ORDER BY g.doc_type, g.doc_label NULLS FIRST),
           '[]'::jsonb)
    INTO v_documents
    FROM grouped g;

  RETURN jsonb_build_object(
    'studio_name', v_studio,
    'company_name', COALESCE(v_company.company_name, v_company.full_name),
    'expires_at', v_row.expires_at,
    'documents', v_documents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_paperwork_link(text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_paperwork_link(text, boolean) TO service_role;

COMMENT ON FUNCTION public.resolve_paperwork_link(text, boolean) IS
  'The paperwork page''s one read, by raw token (hashed here). Service-only — '
  'the browser reaches it through the edge function. Malformed, unknown, '
  'revoked and expired all return the same NULL so a dead link never confirms '
  'it existed (spec §3). Carries no ids, no file paths and no names: the firm '
  'learns the studio''s name, its own name, and what paper is held or owed '
  '(00637). ONE ROW PER DOCUMENT TYPE (R-BU): state is current / lapses_soon / '
  'lapsed for paper a member has confirmed, awaiting_check when the only paper '
  'of that type is an upload nobody has opened, and refused — with the '
  'studio''s own reason — when a refusal is the last word on the type. '
  '''current'' never speaks for unchecked paper, so this page and '
  'compliance_state agree.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. record_inbound_compliance_document (spec §5) — the write
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_inbound_compliance_document(
  p_token      text,
  p_doc_type   text,
  p_doc_label  text        DEFAULT NULL,
  p_number     text        DEFAULT NULL,
  p_issuer     text        DEFAULT NULL,
  p_issued_on  date        DEFAULT NULL,
  p_expires_on date        DEFAULT NULL,
  p_file_path  text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row     public.paperwork_link_tokens%ROWTYPE;
  v_doc_id  uuid;
  v_company text;
  v_member  uuid;
  v_blocks  text[];
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'paperwork_token_invalid' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Defence in depth: the edge function already checked the token; the
  -- authority is re-derived HERE, and the holder comes from this row and never
  -- from anything the browser sent (spec §5.3, acceptance 3).
  SELECT * INTO v_row FROM public.paperwork_link_tokens
   WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  IF NOT FOUND OR v_row.status <> 'active' OR v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'paperwork_token_invalid' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- WHAT A LAPSE BLOCKS IS THE STUDIO'S POLICY ON THE PAPER, not a fact the
  -- trade uploading it gets to set — and nothing on the upload form asks. So a
  -- renewal inherits the gates the studio already put on that doc_type for
  -- this firm. Without this the renewal lands with no gates, and R-AZ's
  -- successor guard (00623: a successor must carry at least the gates of the
  -- paper it retires) refuses the confirm outright — the door would accept
  -- every renewal and the studio could never verify one.
  --
  -- AND IT INHERITS THEM FROM THE PAPER OF THE SAME NAME (W4 r9 MAJOR-1). An
  -- `other_named` paper is identified by its LABEL — resolve_paperwork_link
  -- groups it as 'other_named:' || lower(doc_label), and the firm's page owes
  -- a Safety plan and a Resale certificate separately. Reading the gates off
  -- the type alone crossed the two: a Safety plan arrived carrying the gates
  -- of an unrelated certificate, and the confirm then retired that
  -- certificate (see confirm_inbound_document §9).
  SELECT d.blocks INTO v_blocks
    FROM public.studio_compliance_documents d
   WHERE d.holder_id = v_row.company_id
     AND d.organization_id = v_row.organization_id
     AND d.doc_type = p_doc_type
     AND (
       p_doc_type <> 'other_named'
       OR lower(btrim(COALESCE(d.doc_label, '')))
            = lower(btrim(COALESCE(p_doc_label, '')))
     )
     AND d.superseded_by IS NULL
     AND d.rejected_at IS NULL
   ORDER BY (d.verified_at IS NOT NULL) DESC, d.created_at DESC
   LIMIT 1;

  -- ALWAYS an INSERT (spec §5.4). A currently verified document of the same
  -- type is left exactly as it stands; the supersede is the confirm's job.
  INSERT INTO public.studio_compliance_documents (
    organization_id, holder_type, holder_id, doc_type, doc_label,
    number, issuer, issued_on, expires_on, file_path, blocks,
    source, inbound, verified_by, verified_at, superseded_by
  ) VALUES (
    v_row.organization_id, 'company', v_row.company_id, p_doc_type,
    NULLIF(btrim(COALESCE(p_doc_label, '')), ''),
    NULLIF(btrim(COALESCE(p_number, '')), ''),
    NULLIF(btrim(COALESCE(p_issuer, '')), ''),
    p_issued_on, p_expires_on, p_file_path,
    COALESCE(v_blocks, '{}'::text[]),
    'field_link', true, NULL, NULL, NULL
  )
  RETURNING studio_compliance_documents.id INTO v_doc_id;

  UPDATE public.paperwork_link_tokens
     SET last_used_at = now(), updated_at = now()
   WHERE id = v_row.id;

  SELECT COALESCE(sc.company_name, sc.full_name) INTO v_company
    FROM public.studio_contacts sc WHERE sc.id = v_row.company_id;

  -- R-AC: owners and admins of the studio, plus the member who minted the link
  -- when they are neither. No new role, one row each (spec §6).
  FOR v_member IN
    SELECT om.user_id
      FROM public.organization_members om
     WHERE om.organization_id = v_row.organization_id
       AND om.status = 'active'
       AND om.role IN ('owner', 'admin')
    UNION
    SELECT v_row.created_by WHERE v_row.created_by IS NOT NULL
  LOOP
    INSERT INTO public.notification_log
      (user_id, type, channel, status, template_id, metadata, sent_at)
    VALUES (
      v_member, 'compliance_document_inbound', 'in_app', 'delivered',
      'compliance-document-inbound',
      jsonb_build_object(
        'document_id', v_doc_id,
        'company_id', v_row.company_id,
        'company_name', v_company,
        'doc_type', p_doc_type,
        'entity_type', 'studio_compliance_document',
        'entity_id', v_doc_id::text,
        'title', 'A document is waiting for your check',
        'body', COALESCE(v_company, 'A firm') || ' sent paperwork.'
      ),
      now()
    );
  END LOOP;

  RETURN v_doc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inbound_compliance_document(
  text, text, text, text, text, date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_inbound_compliance_document(
  text, text, text, text, text, date, date, text) TO service_role;

COMMENT ON FUNCTION public.record_inbound_compliance_document(
  text, text, text, text, text, date, date, text) IS
  'The paperwork door''s write (spec §5). Service-only; re-verifies the token '
  'itself and takes the holder FROM THE TOKEN ROW, never from client input, so '
  'a forged company_id in the form body reaches nothing (acceptance 3). Always '
  'INSERTs, source field_link, inbound true, unverified — a currently verified '
  'document of the same type is never touched (acceptance 5). Inherits the '
  'studio''s gates from the paper of the same type, and of the same '
  'case-folded label when the type is other_named (W4 r9 MAJOR-1). Notifies the '
  'studio''s owners and admins plus the link''s minter, R-AC (00637).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. confirm / reject (spec §6)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirm_inbound_document(p_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doc         public.studio_compliance_documents%ROWTYPE;
  v_old         uuid;
  v_old_expires date;
  v_old_blocks  text[];
BEGIN
  SELECT * INTO v_doc FROM public.studio_compliance_documents WHERE id = p_document_id;
  IF NOT FOUND OR NOT public.is_active_studio_member(v_doc.organization_id) THEN
    RAISE EXCEPTION 'compliance_document_not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_doc.rejected_at IS NOT NULL THEN
    RAISE EXCEPTION 'compliance_document_already_rejected' USING ERRCODE = 'check_violation';
  END IF;
  IF v_doc.verified_at IS NOT NULL THEN
    RETURN v_doc.id;                 -- idempotent: a second Confirm changes nothing
  END IF;

  -- Spec §5.5: the supersede happens HERE, and only onto a currently verified
  -- paper of the SAME type on the SAME holder — and, for an `other_named`
  -- paper, of the SAME NAME (W4 r9 MAJOR-1). The type alone is not the
  -- paper's identity: resolve_paperwork_link keys an other_named document by
  -- 'other_named:' || lower(doc_label), so the firm's page owes a Safety plan
  -- and a Resale certificate separately, while this predicate treated them as
  -- one thing and picked whichever was verified last. Two faces, both proven:
  -- confirming a Safety plan silently stamped superseded_by on the firm's
  -- unrelated verified Resale certificate — the studio's book and the firm's
  -- page then disagreed, and every gate the retired paper held dropped out of
  -- compliance_state, which reads superseded_by IS NULL; and when the
  -- mis-picked predecessor held a gate the new paper did not, R-AZ's
  -- pre-check below raised compliance_confirm_drops_a_gate against a document
  -- with nothing to do with it, so the firm's paper could never be confirmed,
  -- only refused — the inert act D-8 says the pre-check exists to prevent.
  -- The label is compared case-folded and trimmed, exactly as the grouping
  -- folds it, so "Safety Plan" and "safety plan" are one paper.
  SELECT d.id, d.expires_on, d.blocks INTO v_old, v_old_expires, v_old_blocks
    FROM public.studio_compliance_documents d
   WHERE d.holder_id = v_doc.holder_id
     AND d.organization_id = v_doc.organization_id
     AND d.doc_type = v_doc.doc_type
     AND (
       v_doc.doc_type <> 'other_named'
       OR lower(btrim(COALESCE(d.doc_label, '')))
            = lower(btrim(COALESCE(v_doc.doc_label, '')))
     )
     AND d.id <> v_doc.id
     AND d.verified_at IS NOT NULL
     AND d.superseded_by IS NULL
   ORDER BY d.verified_at DESC
   LIMIT 1;

  -- R-AZ, checked BEFORE anything is stamped. 00623's guard refuses a
  -- successor that is not dated, in force, not shorter-dated, and carrying the
  -- retired paper's gates; letting it fire mid-function would roll the confirm
  -- back with a constraint name on the face. The studio gets a sentence
  -- instead, and the paper the firm sent stays pending until a dated one
  -- replaces it.
  --
  -- ALL FOUR TIME-VARYING LEGS ARE ANSWERED HERE (W4 r1 M-3). Two of them were
  -- nested under `v_old_expires IS NOT NULL` and a third was not checked at
  -- all, so two ordinary inputs walked past the sentence and died on the
  -- trigger — a replacement COI ending sooner than the one on file
  -- (compliance_successor_not_later), and a dated paper replacing an UNDATED
  -- one with a date already passed (compliance_successor_already_lapsed, whose
  -- trigger leg keys on the successor's own date and not on the retired row's).
  -- Both left the pending row confirmable by nobody, only refusable, which is
  -- the outcome D-8 says this pre-check exists to prevent.
  IF v_old IS NOT NULL THEN
    -- A DATED paper may only be retired by a dated one (compliance_successor_undated).
    IF v_old_expires IS NOT NULL AND v_doc.expires_on IS NULL THEN
      RAISE EXCEPTION 'compliance_confirm_needs_a_live_date'
        USING HINT = 'This paper retires a dated one, so it needs its own '
                     'expiry, and that date has to be ahead.',
              ERRCODE = 'check_violation';
    END IF;
    -- The successor must still be in force, whatever the retired paper's own
    -- datedness (compliance_successor_already_lapsed).
    IF v_doc.expires_on IS NOT NULL AND v_doc.expires_on < CURRENT_DATE THEN
      RAISE EXCEPTION 'compliance_confirm_already_lapsed'
        USING HINT = 'This paper has already lapsed, so it cannot retire the '
                     'paper on file.',
              ERRCODE = 'check_violation';
    END IF;
    -- A renewal covers at least as long as the paper it retires
    -- (compliance_successor_not_later).
    IF v_old_expires IS NOT NULL
       AND v_doc.expires_on IS NOT NULL
       AND v_doc.expires_on < v_old_expires THEN
      RAISE EXCEPTION 'compliance_confirm_ends_sooner'
        USING HINT = 'This paper ends before the one it would retire.',
              ERRCODE = 'check_violation';
    END IF;
    -- And it carries at least the gates it retires (compliance_successor_drops_a_gate).
    IF NOT (v_old_blocks <@ v_doc.blocks) THEN
      RAISE EXCEPTION 'compliance_confirm_drops_a_gate'
        USING HINT = 'The paper it retires blocks more than this one does.',
              ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.studio_compliance_documents
     SET verified_by = auth.uid(), verified_at = now(), updated_at = now()
   WHERE id = p_document_id;

  IF v_old IS NOT NULL THEN
    UPDATE public.studio_compliance_documents
       SET superseded_by = p_document_id, updated_at = now()
     WHERE id = v_old;
  END IF;

  RETURN p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_inbound_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_inbound_document(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_inbound_document(uuid) IS
  'Spec §6 Confirm: stamps verified_by/verified_at on a pending inbound '
  'document and, only then, points the previously verified paper of the same '
  'type — and, for an other_named paper, the same case-folded label (W4 r9 '
  'MAJOR-1) — at it (spec §5.5). Nothing is deleted. Studio members only; '
  'idempotent; refuses a document already rejected. ALL FOUR of R-AZ''s '
  'time-varying legs are checked BEFORE the stamp — undated, lapsed, '
  'shorter-dated, or carrying fewer gates than the paper it would retire — so '
  'each earns a sentence rather than a constraint name from 00623''s trigger '
  '(00637).';

CREATE OR REPLACE FUNCTION public.reject_inbound_document(
  p_document_id uuid,
  p_reason      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doc     public.studio_compliance_documents%ROWTYPE;
  v_reason  text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_company text;
  v_contact uuid;
BEGIN
  SELECT * INTO v_doc FROM public.studio_compliance_documents WHERE id = p_document_id;
  IF NOT FOUND OR NOT public.is_active_studio_member(v_doc.organization_id) THEN
    RAISE EXCEPTION 'compliance_document_not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'compliance_rejection_reason_required'
      USING HINT = 'A refusal the firm cannot read is a refusal it cannot fix.',
            ERRCODE = 'check_violation';
  END IF;
  IF v_doc.verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'compliance_document_already_verified' USING ERRCODE = 'check_violation';
  END IF;
  IF v_doc.rejected_at IS NOT NULL THEN
    RETURN v_doc.id;                 -- idempotent: the first refusal stands
  END IF;

  UPDATE public.studio_compliance_documents
     SET rejected_by = auth.uid(), rejected_at = now(),
         rejection_reason = v_reason, updated_at = now()
   WHERE id = p_document_id;

  SELECT COALESCE(sc.company_name, sc.full_name), sc.paperwork_contact_person_id
    INTO v_company, v_contact
    FROM public.studio_contacts sc WHERE sc.id = v_doc.holder_id;

  -- The chase is a DRAFT (Agent OS: no automated external sends). It lands
  -- awaiting_review on the existing queue, never a second drafting path.
  PERFORM public.enqueue_agent_task(
    p_task_type => 'compliance_chase',
    p_payload => jsonb_build_object(
      'document_id', p_document_id,
      'organization_id', v_doc.organization_id,
      'company_id', v_doc.holder_id,
      'company_name', v_company,
      'paperwork_contact_person_id', v_contact,
      'doc_type', v_doc.doc_type,
      'reason', v_reason
    ),
    p_source => 'reject_inbound_document',
    p_entity_type => 'studio_compliance_document',
    p_entity_id => p_document_id,
    p_idempotency_key => 'compliance_chase:' || p_document_id::text,
    p_summary => 'Chase ' || COALESCE(v_company, 'the firm') || ' for a replacement '
                 || v_doc.doc_type,
    p_status => 'awaiting_review',
    p_actor => COALESCE(auth.uid()::text, 'reject_inbound_document')
  );

  RETURN p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_inbound_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_inbound_document(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.reject_inbound_document(uuid, text) IS
  'Spec §6 Reject: records rejected_by/rejected_at/rejection_reason (a reason '
  'is required) and enqueues exactly one compliance_chase agent task, '
  'awaiting_review, keyed idempotently on the document so a double-tap drafts '
  'one chase (acceptance 7). The row is never deleted. Studio members only '
  '(00637).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 9b. access_grants_invoice_links — the pay link's door has an end date now
--     (W4 round-1 review M-2)
-- ═══════════════════════════════════════════════════════════════════════════
-- 00627's body verbatim (grep -rln "CREATE OR REPLACE FUNCTION[^(]*access_grants_invoice_links"
-- supabase/migrations/*.sql | sort | tail -1 → 00627), one column changed:
-- NULL::timestamptz → il.expires_at. Re-headed HERE rather than edited there
-- because invoice_links.expires_at is 00636's column, and a SQL function body
-- is parsed at creation.
--
-- 00636 gave every pay link a 30-day expiry two files ago in this same wave.
-- E9 is the one ledger that answers what is open on a person and when it ends
-- (CS2-14), and its invoice_pay tier went on reporting no end date at all —
-- while the paperwork tier three branches below carried its own expires_at
-- correctly, so the same view disagreed with itself about the same kind of
-- fact. No test caught it: invoice_links is empty on a fresh local reset.
CREATE OR REPLACE FUNCTION public.access_grants_invoice_links()
RETURNS TABLE (
  grant_id text, tier text, subject_type text, subject_id uuid,
  scope_type text, scope_id uuid, granted_by uuid, granted_at timestamptz,
  expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz,
  revoke_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    'invoice_pay:' || il.id::text, 'invoice_pay', 'link', il.id,
    'invoice', il.invoice_id, il.created_by, il.created_at,
    il.expires_at, il.last_viewed_at, il.revoked_at,
    CASE WHEN il.status = 'closed' THEN 'closed' END
  FROM public.invoice_links il
  JOIN public.invoices inv ON inv.id = il.invoice_id
  WHERE public.is_design_studio_comember(inv.designer_id)
    AND (CASE
           WHEN inv.studio_id IS NOT NULL
             THEN public.is_active_studio_member(inv.studio_id)
           WHEN inv.project_id IS NOT NULL
             THEN public.is_active_studio_member(
                    public.project_recorded_studio(inv.project_id))
           ELSE true
         END);
$$;

REVOKE ALL ON FUNCTION public.access_grants_invoice_links() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_grants_invoice_links()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.access_grants_invoice_links() IS
  'v_access_grants'' invoice_pay branch (00627''s body, re-headed in 00637). '
  'invoice_links has RLS enabled and ZERO policies (00574), so it stays closed '
  'to authenticated and this definer reader is the WHOLE access rule: the '
  'invoice''s own studio, else the studio its project RECORDS, else the '
  'design-studio predicate for a studio invoice that names neither, AND '
  'is_design_studio_comember(designer_id) beside it. It never selects the '
  'token column — grant_id is the row uuid, and since 00636 the column holds '
  'nothing but NULL anyway. expires_at is the link''s own 30-day end date '
  '(00636): a door with an end may not read as endless on the ledger that '
  'answers when doors end (W4 r1 M-2).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. v_access_grants — the twelfth door (spec §8)
-- ═══════════════════════════════════════════════════════════════════════════
-- 00627's body verbatim (the eleven branches, unchanged) with one branch
-- appended. NO CREDENTIAL IS IN IT: paperwork_link_tokens stores only sha256,
-- and grant_id is the row uuid.
DROP VIEW IF EXISTS public.v_access_grants;

CREATE VIEW public.v_access_grants
WITH (security_invoker = true) AS

-- 1 · Studio member — the account tier (00021:132-146, 00416:19-21)
SELECT
  'studio_member:' || om.id::text            AS grant_id,
  'studio_member'::text                      AS tier,
  'profile'::text                            AS subject_type,
  om.user_id                                 AS subject_id,
  'organization'::text                       AS scope_type,
  om.organization_id                         AS scope_id,
  om.invited_by                              AS granted_by,
  COALESCE(om.joined_at, om.created_at)      AS granted_at,
  CASE WHEN om.status = 'invited'
       THEN om.invitation_expires_at END     AS expires_at,
  NULL::timestamptz                          AS last_used_at,
  CASE WHEN om.status IN ('removed', 'suspended')
       THEN om.updated_at END                AS revoked_at,
  CASE WHEN om.status IN ('removed', 'suspended')
       THEN om.status::text END              AS revoke_reason
FROM public.organization_members om

UNION ALL

-- 2 · Client account — the standing homeowner login (00014:72-100, 00018)
SELECT
  'client_account:' || dc.id::text,
  'client_account',
  'profile',
  dc.client_id,
  'designer_client',
  dc.id,
  dc.designer_id,
  dc.created_at,
  NULL::timestamptz,
  dc.last_contacted_at,
  NULL::timestamptz,
  NULL::text
FROM public.designer_clients dc
WHERE dc.client_id IS NOT NULL

UNION ALL

-- 3 · Field link — per seat per project (00283:26-33, 00284:37)
SELECT
  'field_link:' || f.id::text,
  'field_link',
  'engagement',
  f.party_id,
  'project',
  f.project_id,
  f.created_by,
  f.created_at,
  f.expires_at,
  f.last_used_at,
  CASE WHEN f.status = 'revoked' THEN f.updated_at END,
  NULL::text
FROM public.field_link_tokens f

UNION ALL

-- 4 · Document share (00266:27-37)
SELECT
  'doc_share:' || ds.id::text,
  'doc_share',
  'link',
  ds.id,
  'proposal',
  ds.proposal_id,
  ds.created_by,
  ds.created_at,
  ds.expires_at,
  ds.last_viewed_at,
  CASE WHEN ds.status = 'revoked' THEN ds.updated_at END,
  NULL::text
FROM public.document_shares ds

UNION ALL

-- 5 · Trade RFQ link (00424:124-135) — through its definer reader
SELECT * FROM public.access_grants_trade_rfq()

UNION ALL

-- 6 · Trade Agreement link — keyed to a rolodex CARD, not a seat
--     (00579:182-191) — through its definer reader
SELECT * FROM public.access_grants_trade_agreement_links()

UNION ALL

-- 7 · Plan transmittal link (00429:260-264) — through its definer reader
SELECT * FROM public.access_grants_plan_transmittals()

UNION ALL

-- 8 · Site request access — the only base table that records its own reason
--     (00374:20-40)
SELECT
  'site_request:' || sra.id::text,
  'site_request',
  'engagement',
  sr.assignee_party_id,
  'project',
  sr.project_id,
  sra.created_by,
  sra.created_at,
  sra.expires_at,
  sra.last_used_at,
  sra.revoked_at,
  sra.revoked_reason
FROM public.site_request_access sra
JOIN public.site_requests sr ON sr.id = sra.request_id

UNION ALL

-- 9 · Invoice pay link. Since 00636 the row stores sha256(token) and carries
--     its own 30-day expires_at; the definer reader returns the row's uuid,
--     never a credential, and the tier's expires_at is the link's own
--     (00636 §2, access_grants_invoice_links 00627).
SELECT * FROM public.access_grants_invoice_links()

UNION ALL

-- 10 · Evidence upload link. The PLAINTEXT token is the primary key and the
--      whole credential, so grant_id carries md5(token) — a stable opaque
--      handle — and created_by on this table is TEXT, not a profile id, so
--      granted_by is NULL rather than a wrong-typed guess (00364:55-64).
SELECT
  'evidence_upload:' || md5(fet.token),
  'evidence_upload',
  'exception',
  fet.exception_id,
  'exception',
  fet.exception_id,
  NULL::uuid,
  fet.created_at,
  fet.expires_at,
  NULL::timestamptz,
  CASE WHEN fet.revoked THEN fet.updated_at END,
  NULL::text
FROM public.fulfillment_evidence_upload_tokens fet

UNION ALL

-- 11 · Project review access — logins only, and the one tier whose revoke
--      REQUIRES a reason (00438:12-26)
SELECT
  'project_review:' || pra.edition_id::text || ':' || pra.actor_id::text,
  'project_review',
  'profile',
  pra.actor_id,
  'ffe_edition',
  pra.edition_id,
  pra.revoked_by,
  pra.created_at,
  pra.expires_at,
  NULL::timestamptz,
  pra.revoked_at,
  pra.revoke_reason
FROM public.project_review_access pra

UNION ALL

-- 12 · Paperwork link — a firm's compliance door (00637, spec §2/§8)
SELECT
  'paperwork_link:' || plt.id::text,
  'paperwork_link',
  'company',
  plt.company_id,
  'organization',
  plt.organization_id,
  plt.created_by,
  plt.created_at,
  plt.expires_at,
  plt.last_used_at,
  plt.revoked_at,
  plt.revoke_reason
FROM public.paperwork_link_tokens plt;

COMMENT ON VIEW public.v_access_grants IS
  'E9: every door Patina opens, in one shape — grant_id, tier, subject_type/'
  'subject_id, scope_type/scope_id, granted_by, granted_at, expires_at, '
  'last_used_at, revoked_at, revoke_reason. TWELVE tiers since 00637, the '
  'twelfth being the firm-scoped paperwork link (PR-a / V10). READ-ONLY and '
  'security_invoker — each base table''s own RLS is the access rule, so a tier '
  'the caller cannot see is simply absent. NO BEARER CREDENTIAL IS IN IT: '
  'fulfillment_evidence_upload_tokens.token is plaintext so its grant_id is '
  'md5(token); invoice_links and paperwork_link_tokens store only sha256 and '
  'use the row uuid; no hash appears either. grant_id is TEXT, '
  '<tier>:<natural key>. tier is crm-model §2''s access-grant vocabulary '
  '(00627, extended 00637).';

REVOKE ALL ON TABLE public.v_access_grants FROM PUBLIC, anon;
GRANT SELECT ON public.v_access_grants TO authenticated;
GRANT SELECT ON public.v_access_grants TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. paperwork_link_storage_context — the edge function's one id read
-- ═══════════════════════════════════════════════════════════════════════════
-- The storage key is {organization_id}/{company_id}/{upload_id}/{filename}
-- (spec §4): every segment a policy casts to uuid IS a uuid, and the filename
-- is last. Those two ids have to come from the TOKEN, never from the browser
-- (acceptance 3), and resolve_paperwork_link deliberately carries no ids at all
-- because its answer is rendered to the firm. So the edge function asks here,
-- service-role only, and learns nothing else.
CREATE OR REPLACE FUNCTION public.paperwork_link_storage_context(p_token text)
RETURNS TABLE (organization_id uuid, company_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT t.organization_id, t.company_id
    FROM public.paperwork_link_tokens t
   WHERE p_token IS NOT NULL
     AND p_token ~ '^[0-9a-f]{64}$'
     AND t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     AND t.status = 'active'
     AND t.expires_at > now();
$$;

REVOKE ALL ON FUNCTION public.paperwork_link_storage_context(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paperwork_link_storage_context(text) TO service_role;

COMMENT ON FUNCTION public.paperwork_link_storage_context(text) IS
  'Service-only: the studio and firm ids behind a live paperwork token, for '
  'the upload''s storage key and nothing else. Empty for malformed, unknown, '
  'revoked or expired — the same silence every other read gives (00637).';
