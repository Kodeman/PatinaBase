-- ═══════════════════════════════════════════════════════════════════════════
-- 00283 — Field magic-link tokens (Field Coordination · Wave 1)
--
-- A party who does NOT log in still needs a no-auth way to see "what's on me"
-- and tap Done / Problem. That is a tokenized link — the exact document_shares
-- (00266) primitive, re-cut for a field party:
--   · Store ONLY sha256(token) as hex. The raw token exists once, returned by
--     create_field_link. A DB leak cannot reconstruct a working link.
--   · No client/anon RLS policy — the table is designer-only. A guest reaches
--     their work SOLELY through resolve_field_link() (SECURITY DEFINER), which
--     returns a NARROW JSONB DTO (open owned tasks, court items, punch list,
--     and — for receivers/gc — near deliveries). Never raw rows, no pricing,
--     no client PII beyond the project name.
--
-- Regenerate, not literal reuse: hash-at-rest means we can never re-emit an
-- existing token's raw value, so create_field_link supersedes (revokes) any
-- prior active token for the (party, project) and mints a fresh one — at most
-- one live link per party, matching document_shares' "regenerate = revoke+create".
--
-- Additive only (CREATE ... IF NOT EXISTS, CREATE OR REPLACE). Grant posture
-- mirrors 00266 exactly.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.field_link_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id     UUID NOT NULL REFERENCES public.project_parties(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- sha256(raw token) as hex. UNIQUE = the guest lookup key. Never the raw token.
  token_hash   TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  last_used_at TIMESTAMPTZ,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.field_link_tokens IS
  'Field Coordination: tokenized, revocable, 90-day no-auth links to a party''s '
  '"on you" work. Stores sha256(token) only; guests read through resolve_field_link() '
  'exclusively (narrow DTO). Designer-only RLS.';

CREATE INDEX IF NOT EXISTS idx_field_link_tokens_party
  ON public.field_link_tokens(party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_link_tokens_active
  ON public.field_link_tokens(party_id, project_id)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS set_updated_at_field_link_tokens ON public.field_link_tokens;
CREATE TRIGGER set_updated_at_field_link_tokens
  BEFORE UPDATE ON public.field_link_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: designer-of-project only. No client/anon policy. ────────────────────
ALTER TABLE public.field_link_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_link_tokens_designer_all ON public.field_link_tokens;
CREATE POLICY field_link_tokens_designer_all
  ON public.field_link_tokens FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = field_link_tokens.project_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = field_link_tokens.project_id
        AND p.designer_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_link_tokens TO authenticated;
GRANT ALL ON public.field_link_tokens TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- create_field_link — mint a link for a party. Returns the RAW token ONCE.
-- Supersedes any prior active token for the (party, project) so at most one is
-- live. Only the designer who owns the party's project may create.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_field_link(p_party_id UUID)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT pp.project_id INTO v_project_id
    FROM public.project_parties pp WHERE pp.id = p_party_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'party % not found', p_party_id USING errcode = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = v_project_id AND p.designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized to mint a field link for party %', p_party_id
      USING errcode = 'insufficient_privilege';
  END IF;

  -- Supersede prior active tokens (regenerate — hash-at-rest precludes reuse).
  UPDATE public.field_link_tokens
     SET status = 'revoked'
   WHERE party_id = p_party_id AND project_id = v_project_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, created_by)
  VALUES (p_party_id, v_project_id, v_hash, auth.uid())
  RETURNING field_link_tokens.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

COMMENT ON FUNCTION public.create_field_link(UUID) IS
  'Mint a no-auth field link for a party (designer-only). Returns the raw token '
  'once; only sha256(token) is stored. Supersedes the prior active token.';

-- ═══════════════════════════════════════════════════════════════════════════
-- revoke_field_link — kill a link (designer-only).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_field_link(p_token_id UUID)
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

  UPDATE public.field_link_tokens f
     SET status = 'revoked'
   WHERE f.id = p_token_id
     AND EXISTS (
       SELECT 1 FROM public.projects p
       WHERE p.id = f.project_id AND p.designer_id = auth.uid()
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'field link % not found or not owned', p_token_id
      USING errcode = 'no_data_found';
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.revoke_field_link(UUID) IS
  'Revoke a field link (designer-only). The link dies immediately.';

-- ═══════════════════════════════════════════════════════════════════════════
-- resolve_field_link — THE ONLY guest read path. Validates a raw token by
-- HASH + status + expiry, bumps last_used_at, and returns a NARROW JSONB DTO:
--   { project:{id,name}, studio_name, party:{id,display_name,party_kind,trade},
--     tasks:[…open owned tasks…], items:[…open court items…], punch:[…],
--     deliveries:[…next-14d, receiver/gc only…] }
-- Returns NULL on any miss (invalid / revoked / expired) — no existence leak,
-- no raw rows, no pricing, no client PII beyond the project name.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_field_link(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash        TEXT;
  v_link        public.field_link_tokens;
  v_party       public.project_parties;
  v_project     public.projects;
  v_studio_name TEXT;
  v_tasks       JSONB;
  v_items       JSONB;
  v_punch       JSONB;
  v_deliveries  JSONB := '[]'::jsonb;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN NULL;  -- dead link
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_link
    FROM public.field_link_tokens f
   WHERE f.token_hash = v_hash
     AND f.status = 'active'
     AND (f.expires_at IS NULL OR f.expires_at > now())
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;  -- invalid / revoked / expired → dead link (no leak)
  END IF;

  SELECT * INTO v_party  FROM public.project_parties WHERE id = v_link.party_id;
  SELECT * INTO v_project FROM public.projects       WHERE id = v_link.project_id;
  IF v_party IS NULL OR v_project IS NULL THEN
    RETURN NULL;  -- party/project vanished
  END IF;

  UPDATE public.field_link_tokens SET last_used_at = now() WHERE id = v_link.id;

  -- Studio name for the header (the designer's active design_studio org, else
  -- their display name — no client PII).
  SELECT o.name INTO v_studio_name
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
   WHERE om.user_id = v_project.designer_id
     AND om.status = 'active'
     AND o.type = 'design_studio'
   ORDER BY om.created_at
   LIMIT 1;
  IF v_studio_name IS NULL THEN
    SELECT COALESCE(pr.full_name, 'your designer') INTO v_studio_name
      FROM public.profiles pr WHERE pr.id = v_project.designer_id;
  END IF;

  -- Open tasks owned by this party.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'title', t.title, 'status', t.status, 'due_date', t.due_date
         ) ORDER BY t.due_date NULLS LAST, t.sort_order), '[]'::jsonb)
    INTO v_tasks
    FROM public.project_tasks t
   WHERE t.owner_party_id = v_link.party_id
     AND t.project_id = v_link.project_id
     AND t.status <> 'done';

  -- Open coordination items in this party's court (non-punch).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', cd.id, 'title', cd.title, 'coordination_kind', cd.coordination_kind,
           'due_date', cd.due_date
         ) ORDER BY cd.due_date NULLS LAST, cd.created_at), '[]'::jsonb)
    INTO v_items
    FROM public.client_decisions cd
   WHERE cd.court_party_id = v_link.party_id
     AND cd.project_id = v_link.project_id
     AND cd.status = 'pending'
     AND cd.coordination_kind <> 'punch';

  -- Open punch items in this party's court.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', cd.id, 'title', cd.title, 'due_date', cd.due_date
         ) ORDER BY cd.due_date NULLS LAST, cd.created_at), '[]'::jsonb)
    INTO v_punch
    FROM public.client_decisions cd
   WHERE cd.court_party_id = v_link.party_id
     AND cd.project_id = v_link.project_id
     AND cd.status = 'pending'
     AND cd.coordination_kind = 'punch';

  -- Near deliveries — receivers/gc only (project-scoped, next 14 days).
  IF v_party.party_kind IN ('receiver', 'gc') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', de.event_id, 'vendor_name', de.vendor_name,
             'event_date', de.event_date, 'po_status', de.po_status,
             'ffe_item_count', de.ffe_item_count
           ) ORDER BY de.event_date), '[]'::jsonb)
      INTO v_deliveries
      FROM public.delivery_events de
     WHERE de.project_id = v_link.project_id
       AND de.event_type = 'delivery_expected'
       AND de.event_date IS NOT NULL
       AND de.event_date >= current_date
       AND de.event_date <= current_date + 14;
  END IF;

  RETURN jsonb_build_object(
    'project',     jsonb_build_object('id', v_project.id, 'name', v_project.name),
    'studio_name', v_studio_name,
    'party',       jsonb_build_object(
                     'id', v_party.id, 'display_name', v_party.display_name,
                     'party_kind', v_party.party_kind, 'trade', v_party.trade),
    'tasks',       v_tasks,
    'items',       v_items,
    'punch',       v_punch,
    'deliveries',  v_deliveries
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_field_link(TEXT) IS
  'The only guest read path for a field link. Validates token by hash + status + '
  'expiry, bumps last_used_at, returns a narrow JSONB DTO (open owned tasks, court '
  'items, punch, near deliveries for receivers/gc). NULL on any miss (no leak, no '
  'raw rows, no pricing, no client PII beyond project name).';

-- ── Grants: mirror 00266 exactly. Functions get EXECUTE via PUBLIC by default —
-- revoke PUBLIC + anon on all three, then grant the intended callers. resolve is
-- called by the /field guest route's service client (service_role retains its
-- explicit default grant); authenticated is granted for parity with 00266.
REVOKE ALL ON FUNCTION public.create_field_link(UUID)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_field_link(UUID)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_field_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_field_link(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_field_link(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_field_link(TEXT) TO authenticated;
