-- ═══════════════════════════════════════════════════════════════════════════
-- 00650 — The Field Line, Phase 2: a homeowner who has only a phone
--
-- INTENT. Today a client_invitations row cannot exist without an email
-- (00118:8, email NOT NULL), and the only way a homeowner reaches the letter's
-- second page is the plaintext token in that email (00118:7). A homeowner who
-- gave a phone and no email therefore had no identity at all. This file gives
-- her one, and gives her a way in that is NOT a login:
--
--   1. client_invitations.phone, email nullable, and a CHECK that one of the
--      two stands. The row keeps carrying the frozen letter scalars (00581)
--      for both identities — the letter is the same letter.
--   2. client_links: a scoped, revocable, hash-at-rest capability, modelled on
--      field_link_tokens (00283:31) line for line. Only sha256(token) is ever
--      stored; the raw token is returned once by create_client_link and a
--      database leak cannot reconstruct a working link.
--   3. client_link_uses: every resolution, on the record.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · client_invitations.token stays PLAINTEXT. It is the email path (R6) and
--     out of scope for Phase 2 — known residue, not this file's business.
--   · client_invitations.kind keeps its two values, 'invite' and 'notice'.
--     Those name what the LETTER is, not who the recipient is; 'notice' means
--     "already has an account, nothing to accept". The identity discriminator
--     is the pair of columns themselves — a phone-only row is
--     `email IS NULL AND phone IS NOT NULL` — so no reader of kind changes
--     meaning and the email path stays byte-for-byte what it was.
--   · No GoTrue user, no session and no auth.users row is implied anywhere
--     here. A capability holder is not a logged-in person and never becomes
--     one through this table.
--
-- ONE MORE VALUE ON ONE CONSENT COLUMN. studio_channel_consent.source gains
-- 'kickoff_checkbox' (US-3 P22). The kickoff consent box in the Add Person
-- sheet's client branch is a NEW way a consent arrives — a studio ticking, in
-- front of the homeowner, a box that shows her the disclosure — and it is not
-- honestly any of 'verbal' / 'written' / 'web_form' / 'other'. The ledger, its
-- writers (record_channel_consent 00622, record_channel_invite 00594) and its
-- only reader (channelConsentDecision, _shared/sms.ts) are otherwise untouched:
-- this file adds no consent writer and no second ledger. opt_out_source is NOT
-- widened — a kickoff box is never a refusal.
--
-- Additive only: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, CREATE
-- OR REPLACE, and constraint changes guarded by pg_constraint lookups. No drop
-- of a column, no data movement, no row copied.
--
-- Carries GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py), per P12.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Identity: a phone is enough
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.client_invitations
  ALTER COLUMN email DROP NOT NULL;

DO $identity$
BEGIN
  -- One of the two has to stand. A row with neither is not a homeowner we can
  -- reach, and nothing downstream could deliver the letter it froze.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.client_invitations'::regclass
       AND conname  = 'client_invitations_identity_check'
  ) THEN
    ALTER TABLE public.client_invitations
      ADD CONSTRAINT client_invitations_identity_check
      CHECK (email IS NOT NULL OR phone IS NOT NULL);
  END IF;
END
$identity$;

-- E.164, or nothing. The SAME normalizer the consent ledger's key uses
-- (normalize_phone_e164, 00281:81 — what normalize_channel_value('sms', …)
-- resolves a phone through), so the number a capability was minted for and the
-- channel_value studio_channel_consent holds cannot be two different strings
-- for the same phone. Unlike normalize_channel_value this RAISES rather than
-- falling back to the typed text: an unparseable phone on an identity column is
-- a number nothing can text, and storing it would leave the CHECK above
-- satisfied by a value that is not an identity.
CREATE OR REPLACE FUNCTION public.normalize_client_invitation_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone text;
BEGIN
  IF NEW.phone IS NULL OR btrim(NEW.phone) = '' THEN
    NEW.phone := NULL;
    RETURN NEW;
  END IF;
  v_phone := public.normalize_phone_e164(NEW.phone);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'invalid_client_phone: % cannot be read as a phone number', NEW.phone
      USING ERRCODE = '23514';
  END IF;
  NEW.phone := v_phone;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_client_invitation_phone_trg ON public.client_invitations;
CREATE TRIGGER normalize_client_invitation_phone_trg
  BEFORE INSERT OR UPDATE OF phone ON public.client_invitations
  FOR EACH ROW EXECUTE FUNCTION public.normalize_client_invitation_phone();

CREATE INDEX IF NOT EXISTS idx_client_invitations_phone
  ON public.client_invitations(phone) WHERE phone IS NOT NULL;

COMMENT ON COLUMN public.client_invitations.phone IS
  '00650: the homeowner''s phone in E.164, normalized on write by '
  'normalize_phone_e164 — the same rule studio_channel_consent.channel_value '
  'is keyed on. Set on a phone-only letter (email NULL); may also stand beside '
  'an email. NEVER an authentication factor: a phone-only recipient gets a '
  'scoped client_links capability, never a GoTrue user or a session.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The kickoff box is a source the ledger can name
-- ═══════════════════════════════════════════════════════════════════════════
DO $src$
BEGIN
  ALTER TABLE public.studio_channel_consent
    DROP CONSTRAINT IF EXISTS studio_channel_consent_source_check;
  ALTER TABLE public.studio_channel_consent
    ADD CONSTRAINT studio_channel_consent_source_check
    CHECK (source IN ('verbal', 'written', 'web_form', 'inbound_sms', 'other',
                      'kickoff_checkbox'));
END
$src$;

COMMENT ON COLUMN public.studio_channel_consent.source IS
  'How the consent arrived: verbal / written / web_form / inbound_sms / other, '
  'and since 00650 kickoff_checkbox — a studio ticking, with the homeowner '
  'there, the Add Person sheet''s unchecked kickoff box that shows her the '
  'disclosure it records the version of. opt_out_source deliberately does NOT '
  'carry that value: a kickoff box is never a refusal.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. client_links — the capability
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.client_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.client_invitations(id) ON DELETE CASCADE,
  -- The house the capability is about. NULL only when the letter named no
  -- project; such a capability opens the letter and can authorize nothing,
  -- because every act downstream is asked about a project (P23).
  project_id    uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  -- FROZEN AT MINT. The seat is resolved once, here, so changing the phone on
  -- project_parties later moves nothing: the capability keeps pointing at the
  -- same person on the same job (US-3 P21, "changing the phone never changes
  -- party identity").
  party_id      uuid REFERENCES public.project_parties(id) ON DELETE SET NULL,
  -- sha256(raw token) as hex. UNIQUE = the lookup key. Never the raw token.
  token_hash    text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- {project_id, party_id, invitation_id, actions[]} — what this token may
  -- speak for, written down rather than re-derived at every use.
  scope         jsonb NOT NULL
    CHECK (jsonb_typeof(scope) = 'object' AND jsonb_typeof(scope->'actions') = 'array'),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  last_used_at  timestamptz,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_links IS
  '00650: a scoped, revocable, hash-at-rest capability that lets a homeowner '
  'with no account open her letter and (P23) answer what is addressed to her. '
  'Stores sha256(token) only; the raw token is returned once by '
  'create_client_link and is never at rest anywhere. Deny-all RLS: no policy '
  'exists, so only service_role (which bypasses RLS) reads or writes it, and '
  'the only read path for a token holder is resolve_client_link().';

CREATE INDEX IF NOT EXISTS idx_client_links_invitation
  ON public.client_links(invitation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_links_active
  ON public.client_links(project_id, party_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.client_link_uses (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.client_links(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT now(),
  action  text,
  source  text
);

COMMENT ON TABLE public.client_link_uses IS
  '00650: one row per resolution of a client_links capability — what was asked '
  'for and where it came from. The audit a consent-sensitive rail needs: a '
  'homeowner opening her own link is a fact worth keeping, and a forwarded '
  'token that was refused leaves no row at all.';

CREATE INDEX IF NOT EXISTS idx_client_link_uses_link
  ON public.client_link_uses(link_id, used_at DESC);

-- ── RLS: deny-all. No policy, ever — service_role only. ────────────────────
ALTER TABLE public.client_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_link_uses ENABLE ROW LEVEL SECURITY;

-- DENY-ALL IS STATED, NOT ASSUMED. Withholding a GRANT is not enough here: the
-- stack's ALTER DEFAULT PRIVILEGES for role postgres in schema public hands
-- anon, authenticated and service_role ALL privileges on every table created in
-- it, so a new table arrives with anon already holding SELECT (proved on the
-- clone: information_schema.role_table_grants listed anon/authenticated on
-- client_links before this REVOKE existed). RLS with no policy would still have
-- refused every row, but a capability table should not be one policy away from
-- being world-readable. So the privilege itself is taken back, and the seed
-- sheet replays this REVOKE after its blanket baseline (P12).
REVOKE ALL ON public.client_links     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.client_link_uses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_links     TO service_role;
GRANT ALL ON public.client_link_uses TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. create_client_link — mint. Returns the RAW token ONCE.
-- ═══════════════════════════════════════════════════════════════════════════
-- Supersedes any prior active link for the same invitation, exactly as
-- create_field_link does (00283/00284): hash-at-rest means an existing token's
-- raw value can never be re-emitted, so a regenerate is revoke + create.
CREATE OR REPLACE FUNCTION public.create_client_link(
  p_invitation_id uuid,
  p_actions       text[] DEFAULT ARRAY['open_letter']::text[],
  p_ttl           interval DEFAULT interval '90 days'
)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_invitation public.client_invitations;
  v_actions    text[];
  v_party_id   uuid;
  v_matches    integer;
  v_token      text;
  v_hash       text;
  v_id         uuid;
BEGIN
  SELECT * INTO v_invitation
    FROM public.client_invitations ci WHERE ci.id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation % not found', p_invitation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Service-role / internal callers (auth.uid() IS NULL) are the only ones this
  -- function is granted to; the ownership arm is defence in depth for any
  -- future grant, and mirrors create_field_link's own (00284).
  IF auth.uid() IS NOT NULL AND v_invitation.designer_id <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized to mint a capability for invitation %', p_invitation_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT array_agg(a) INTO v_actions
    FROM unnest(COALESCE(p_actions, ARRAY[]::text[])) AS a
   WHERE NULLIF(btrim(a), '') IS NOT NULL;
  IF v_actions IS NULL OR array_length(v_actions, 1) = 0 THEN
    RAISE EXCEPTION 'a capability with no actions authorizes nothing'
      USING ERRCODE = '23514';
  END IF;

  IF p_ttl IS NULL OR p_ttl <= interval '0' THEN
    RAISE EXCEPTION 'a capability that has already expired is not a capability'
      USING ERRCODE = '23514';
  END IF;

  -- The seat, resolved ONCE and frozen into the row and the scope. Exactly one
  -- match on this job's phone or none — the rule 00626's
  -- rolodex_card_for_party_phone already sets for a phone-keyed lookup.
  IF v_invitation.project_id IS NOT NULL AND v_invitation.phone IS NOT NULL THEN
    SELECT count(*), (array_agg(pp.id))[1] INTO v_matches, v_party_id
      FROM public.project_parties pp
     WHERE pp.project_id = v_invitation.project_id
       AND pp.phone_e164 = v_invitation.phone;
    IF v_matches <> 1 THEN
      v_party_id := NULL;
    END IF;
  END IF;

  UPDATE public.client_links
     SET status = 'revoked'
   WHERE invitation_id = p_invitation_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.client_links (
    invitation_id, project_id, party_id, token_hash, scope, expires_at, created_by
  )
  VALUES (
    p_invitation_id,
    v_invitation.project_id,
    v_party_id,
    v_hash,
    jsonb_build_object(
      'project_id',    v_invitation.project_id,
      'party_id',      v_party_id,
      'invitation_id', p_invitation_id,
      'actions',       to_jsonb(v_actions)
    ),
    now() + p_ttl,
    auth.uid()
  )
  RETURNING client_links.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

COMMENT ON FUNCTION public.create_client_link(uuid, text[], interval) IS
  '00650: mint a scoped capability for a client invitation. Returns the raw '
  'token ONCE — only sha256(token) is stored, and no caller may ask for it '
  'again. Supersedes the invitation''s prior active link. The seat and the '
  'project are frozen into the row and the scope at mint, so a later phone '
  'change on project_parties moves neither.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. resolve_client_link — THE ONLY read path for a token holder
-- ═══════════════════════════════════════════════════════════════════════════
-- Validates a raw token by HASH + status + expiry, stamps last_used_at, writes
-- one audit row, and answers with the invitation id and the scope. NULL on any
-- miss — invalid, revoked, expired — so the answer leaks nothing about whether
-- a token ever existed.
CREATE OR REPLACE FUNCTION public.resolve_client_link(
  p_token  text,
  p_action text DEFAULT 'open',
  p_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_link public.client_links;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN NULL;
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_link
    FROM public.client_links cl
   WHERE cl.token_hash = v_hash
     AND cl.status = 'active'
     AND cl.expires_at > now()
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.client_links SET last_used_at = now() WHERE id = v_link.id;
  INSERT INTO public.client_link_uses (link_id, action, source)
  VALUES (v_link.id, NULLIF(btrim(COALESCE(p_action, '')), ''), NULLIF(btrim(COALESCE(p_source, '')), ''));

  RETURN jsonb_build_object(
    'link_id',       v_link.id,
    'invitation_id', v_link.invitation_id,
    'project_id',    v_link.project_id,
    'party_id',      v_link.party_id,
    'scope',         v_link.scope,
    'expires_at',    v_link.expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_client_link(text, text, text) IS
  '00650: resolve a raw client capability token by hash. Returns '
  '{link_id, invitation_id, project_id, party_id, scope, expires_at} or NULL — '
  'invalid, revoked and expired all answer NULL, so the function is no oracle '
  'for which tokens exist. Stamps last_used_at and writes one client_link_uses '
  'row on every hit; a miss writes nothing.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. revoke_client_link — the door closes now
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_client_link(p_link_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.client_links cl
     SET status = 'revoked'
   WHERE cl.id = p_link_id
     AND (
       auth.uid() IS NULL
       OR EXISTS (
         SELECT 1 FROM public.client_invitations ci
          WHERE ci.id = cl.invitation_id AND ci.designer_id = auth.uid()
       )
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'client link % not found or not owned', p_link_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.revoke_client_link(uuid) IS
  '00650: revoke a client capability. Idempotent on an already-revoked link; '
  'raises when the link does not exist or the caller does not own its '
  'invitation. The link dies immediately — resolve_client_link answers NULL.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Grants — service_role only, on all three
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.create_client_link(uuid, text[], interval)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_client_link(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_client_link(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_client_link(uuid, text[], interval)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_client_link(text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_client_link(uuid)
  TO service_role;

-- The normalizer trigger function runs as the table's trigger, not as a
-- callable door; nothing may invoke it directly.
REVOKE ALL ON FUNCTION public.normalize_client_invitation_phone()
  FROM PUBLIC, anon, authenticated;
