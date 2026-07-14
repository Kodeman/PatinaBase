-- ═══════════════════════════════════════════════════════════════════════════
-- 00320 — Studio branding read path (resolver RPC) + studio-logos bucket
--
-- One canonical identity resolver (plan D2), keyed by project OR designer, so
-- Deno edge functions, portal TS, and Swift all call the same precedence and
-- can't drift. Returns ONLY brand columns (never email/phone/address/tax_id).
--
-- Precedence:
--   1. p_project_id → projects.studio_id → organizations       (source='studio')
--   2. else owning designer (p_designer_id, or the project's designer_id when
--      p_designer_id is null) → _primary_studio_for → organizations (source='studio')
--   3. fallback profiles.business_name (is_designer only)  (source='business_name')
--   4. fallback profiles.full_name / display_name (is_designer only) (source='full_name')
-- The profile fallback is gated on is_designer so an anon caller can't enumerate
-- a non-designer (client) name through this RPC — a non-designer UUID falls
-- through to the all-NULL row. Always returns EXACTLY ONE row.
--
-- GRANT EXECUTE to anon is deliberate + safe: client print pages and the iOS
-- client app hit with the anon key, and only brand fields are exposed — same
-- posture as open_design_requests (00286).
--
-- Adds GRANT/REVOKE (function) → regenerate seed/00-legacy-grants.sql after this
-- file. (Storage policies are storage-schema; not in the grants regen scan.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── resolve_studio_identity(p_project_id, p_designer_id) ─────────────────────
CREATE OR REPLACE FUNCTION public.resolve_studio_identity(
  p_project_id uuid DEFAULT NULL,
  p_designer_id uuid DEFAULT NULL
)
RETURNS TABLE(studio_id uuid, name text, logo_url text, website text, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_studio_id uuid;
  v_designer  uuid := p_designer_id;
  v_name      text;
  v_logo      text;
  v_website   text;
  v_biz       text;
  v_full      text;
BEGIN
  -- 1. Project precedence: its studio_id, and its designer as the fallback owner.
  IF p_project_id IS NOT NULL THEN
    SELECT p.studio_id, COALESCE(v_designer, p.designer_id)
    INTO v_studio_id, v_designer
    FROM projects p
    WHERE p.id = p_project_id;
  END IF;

  -- 2. No project studio → the owning designer's primary studio.
  IF v_studio_id IS NULL AND v_designer IS NOT NULL THEN
    v_studio_id := public._primary_studio_for(v_designer);
  END IF;

  -- Studio org resolved → brand columns from organizations.
  IF v_studio_id IS NOT NULL THEN
    SELECT o.name, o.logo_url, o.website
    INTO v_name, v_logo, v_website
    FROM organizations o
    WHERE o.id = v_studio_id;

    IF FOUND THEN
      studio_id := v_studio_id;
      name      := v_name;
      logo_url  := v_logo;
      website   := v_website;
      source    := 'studio';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- 3/4. Fallback to the designer's profile identity — ONLY for actual designers.
  -- profiles are world-readable via 00013 RLS, but this resolver must not double
  -- as an anon enumeration convenience: a non-designer UUID (e.g. a client)
  -- matches no row here (is_designer filter) and falls through to the all-NULL
  -- row below rather than leaking a private individual's name.
  IF v_designer IS NOT NULL THEN
    SELECT pr.business_name, COALESCE(pr.full_name, pr.display_name)
    INTO v_biz, v_full
    FROM profiles pr
    WHERE pr.id = v_designer AND pr.is_designer;

    IF FOUND THEN
      IF v_biz IS NOT NULL AND btrim(v_biz) <> '' THEN
        studio_id := NULL; name := v_biz;  logo_url := NULL; website := NULL; source := 'business_name';
        RETURN NEXT;
        RETURN;
      END IF;

      studio_id := NULL; name := v_full; logo_url := NULL; website := NULL; source := 'full_name';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Nothing resolvable (or a non-designer UUID) → one empty row (exactly-one-row contract).
  studio_id := NULL; name := NULL; logo_url := NULL; website := NULL; source := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_studio_identity(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_studio_identity(uuid, uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_studio_identity(uuid, uuid) IS
  'Canonical studio brand resolver (plan D2): project→studio→org, else designer→primary studio→org, else profile business_name/full_name (gated on is_designer so anon can''t enumerate non-designer names). Returns exactly one row, brand columns only. anon-granted (brand-only, same posture as open_design_requests).';

-- ─── studio-logos storage bucket (modeled on 00115 avatars) ──────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'studio-logos',
  'studio-logos',
  true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (logos render on unauthenticated print/PDF and in the iOS client app).
CREATE POLICY "Studio logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'studio-logos');

-- Write gated to owner/admin of the org named in path segment 1 (studio-logos/{org_id}/...).
-- A malformed (non-UUID) first segment fails the ::uuid cast → write rejected.
CREATE POLICY "Org admins manage studio logos (insert)"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'studio-logos'
    AND is_org_admin_or_owner( ((storage.foldername(name))[1])::uuid )
  );

CREATE POLICY "Org admins manage studio logos (update)"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'studio-logos'
    AND is_org_admin_or_owner( ((storage.foldername(name))[1])::uuid )
  );

CREATE POLICY "Org admins manage studio logos (delete)"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'studio-logos'
    AND is_org_admin_or_owner( ((storage.foldername(name))[1])::uuid )
  );
