-- ═══════════════════════════════════════════════════════════════════════════
-- 00266 — Tokenized read-only document shares  (Schedule & Boards Wave 2 · C2)
--
-- The first tokenized share primitive in Patina. The only prior "share" is
-- room_scan_associations (00020) — account-to-account, not a link. This is a
-- revocable, optionally-expiring, VIEW-ONLY link a designer mints to a
-- proposal's client copy, rendered under a per-field ShareVisibility record
-- (packages/utils/src/proposal-visibility.ts).
--
-- Ruling (the Schedule & Boards plan, 2026-07-07): a link is VIEW-ONLY.
-- Verdicts/comments require the authed client account; signing is untouched.
--
-- Security posture:
--   · We store ONLY sha256(token) as hex. The raw token exists once, in the
--     creator's clipboard — a DB leak cannot reconstruct a working link.
--   · No client/anon RLS policy. The table is designer-only. A guest reaches a
--     proposal SOLELY through resolve_document_share() (SECURITY DEFINER), the
--     single audited read path, which returns only the addressed proposal.
--   · feedbackEnabled is meaningless on a guest render — the guest route forces
--     it false regardless of what a share stored (verdicts need an account).
--
-- Additive only (CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.document_shares (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  -- sha256(raw token) as hex. UNIQUE = the guest lookup key. Never the raw token.
  token_hash     TEXT NOT NULL UNIQUE,
  label          TEXT,
  -- A ShareVisibility record (the fielded law). feedbackEnabled is forced false
  -- on every guest render regardless of what is stored here.
  visibility     JSONB NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at     TIMESTAMPTZ,
  view_count     INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_shares IS
  'Tokenized, revocable, view-only share links to a proposal''s client copy '
  '(Schedule & Boards Wave 2 · C2). Stores sha256(token) only; guests read '
  'through resolve_document_share() exclusively. visibility = a ShareVisibility '
  'record; feedback is always off on a guest render.';

CREATE INDEX IF NOT EXISTS idx_document_shares_proposal
  ON public.document_shares(proposal_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_document_shares ON public.document_shares;
CREATE TRIGGER set_updated_at_document_shares
  BEFORE UPDATE ON public.document_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: designer-of-proposal only. No client/anon policy. ───────────────────
ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_shares_designer_all ON public.document_shares;
CREATE POLICY document_shares_designer_all
  ON public.document_shares FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = document_shares.proposal_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = document_shares.proposal_id
        AND p.designer_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_shares TO authenticated;
GRANT ALL ON public.document_shares TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- create_document_share — mint a link. Returns the RAW token EXACTLY ONCE.
-- Only the designer who owns the proposal may create. 32 random bytes → hex
-- token (64 chars); we persist sha256(token).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_document_share(
  p_proposal_id UUID,
  p_label       TEXT  DEFAULT NULL,
  p_visibility  JSONB DEFAULT NULL,
  p_expires_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (id UUID, token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token TEXT;
  v_hash  TEXT;
  v_id    UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = p_proposal_id AND p.designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized to share proposal %', p_proposal_id
      USING errcode = 'insufficient_privilege';
  END IF;

  IF p_visibility IS NULL THEN
    RAISE EXCEPTION 'visibility is required' USING errcode = 'check_violation';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.document_shares (proposal_id, token_hash, label, visibility, expires_at, created_by)
  VALUES (p_proposal_id, v_hash, NULLIF(btrim(p_label), ''), p_visibility, p_expires_at, auth.uid())
  RETURNING document_shares.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

COMMENT ON FUNCTION public.create_document_share(UUID, TEXT, JSONB, TIMESTAMPTZ) IS
  'Mint a view-only share link for a proposal (designer-only). Returns the raw '
  'token once; only sha256(token) is stored.';

-- ═══════════════════════════════════════════════════════════════════════════
-- revoke_document_share — kill a link (designer-only). Idempotent-ish: raises
-- if the share is not found or not owned. "Regenerate" in the UI = revoke+create.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_document_share(p_share_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  UPDATE public.document_shares s
     SET status = 'revoked'
   WHERE s.id = p_share_id
     AND EXISTS (
       SELECT 1 FROM public.proposals p
       WHERE p.id = s.proposal_id AND p.designer_id = auth.uid()
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'share % not found or not owned', p_share_id
      USING errcode = 'no_data_found';
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.revoke_document_share(UUID) IS
  'Revoke a share link (designer-only). The link dies immediately.';

-- ═══════════════════════════════════════════════════════════════════════════
-- resolve_document_share — THE ONLY guest read path. Validates a raw token by
-- HASH + status + expiry, bumps view stats, and returns the addressed proposal
-- id + visibility + a studio label for the letterhead. Returns NOTHING on any
-- miss (invalid / revoked / expired) — no existence leak, no data beyond the
-- one proposal the token addresses.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_document_share(p_token TEXT)
RETURNS TABLE (proposal_id UUID, visibility JSONB, label TEXT, studio_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash  TEXT;
  v_share public.document_shares;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN;  -- empty result set → dead link
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_share
    FROM public.document_shares s
   WHERE s.token_hash = v_hash
     AND s.status = 'active'
     AND (s.expires_at IS NULL OR s.expires_at > now())
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;  -- invalid / revoked / expired → dead link (no leak)
  END IF;

  UPDATE public.document_shares
     SET view_count     = view_count + 1,
         last_viewed_at = now()
   WHERE id = v_share.id;

  RETURN QUERY
    SELECT v_share.proposal_id,
           v_share.visibility,
           v_share.label,
           COALESCE(pr.full_name, pr.email, 'the studio')::text
      FROM public.proposals p
      LEFT JOIN public.profiles pr ON pr.id = p.designer_id
     WHERE p.id = v_share.proposal_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_document_share(TEXT) IS
  'The only guest read path for a share link. Validates token by hash + status '
  '+ expiry, bumps view stats, returns the single addressed proposal id + '
  'visibility. Empty on any miss (no existence leak).';

GRANT EXECUTE ON FUNCTION public.create_document_share(UUID, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_document_share(UUID)   TO authenticated;
-- resolve is called ONLY by the guest route's service client. No anon grant —
-- least privilege: nothing anonymous calls PostgREST directly today, and the
-- grant would open a direct token-probe endpoint for no caller. Re-grant to
-- anon deliberately if an anon-client caller ever ships.
REVOKE EXECUTE ON FUNCTION public.resolve_document_share(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_document_share(TEXT)  TO authenticated;
