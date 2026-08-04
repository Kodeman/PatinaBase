-- ═══════════════════════════════════════════════════════════════════════════
-- 00417 — Studio contacts, the shared rolodex (Call Sheet Wave 2)
--
-- R1 ruled the rolodex FULLY SHARED at the studio: every active non-guest
-- member of a design studio reads and writes the same book of people and
-- companies. This migration lays that spine:
--
--   1. is_active_studio_member(p_org) — the org-keyed sibling of 00315's
--      is_studio_comember(p_owner). 00315 answers "do I share a studio with
--      THIS USER"; the rolodex is keyed on the ORG itself, so it needs
--      "am I an active non-guest member of THIS ORG". Same SECURITY DEFINER
--      reasoning (organization_members SELECT is own-row + admin-only, 00021/
--      00068 — a plain member cannot see the membership rows a co-membership
--      predicate must inspect), same deliberate guest exclusion.
--   2. studio_contacts — one row per person or company the studio knows.
--   3. organizations.rolodex_seed_skipped_at — the day-1 checklist's SKIP stamp.
--
-- The admin leg of the RLS reuses is_org_admin_or_owner(uuid, uuid) from 00068
-- (grepped: 00068 is its only definition — no later CREATE OR REPLACE), rather
-- than minting a fourth admin helper.
--
-- NO DELETE policy and NO DELETE grant: the rolodex is soft-delete only
-- (archived_at). A contact carries lineage from project_parties (00418), so a
-- hard delete would orphan history.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this migration
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. is_active_studio_member(p_org) — org-keyed membership predicate
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors 00315's idiom exactly: SQL, STABLE, SECURITY DEFINER, pinned
-- search_path, (select auth.uid()) so the planner hoists it out of the row loop.
--
-- Guest exclusion is DELIBERATE and matches 00315: the member_role enum (00021)
-- includes 'guest', and the studio program has treated guests as lesser since
-- 00152/00154. A guest seat is a client/contractor courtesy login — it must not
-- open the studio's book of people. Guests therefore see zero rolodex rows.
CREATE OR REPLACE FUNCTION public.is_active_studio_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_org IS NOT NULL AND EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = p_org
      AND user_id = (select auth.uid())
      AND status  = 'active'
      AND role   <> 'guest'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_studio_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_studio_member(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_active_studio_member(uuid) IS
  'True when the caller holds an active, non-guest membership in p_org. '
  'Org-keyed sibling of 00315''s is_studio_comember(p_owner) (which is keyed on '
  'another USER). NULL-safe: a NULL org returns false. SECURITY DEFINER to '
  'bypass organization_members'' own-row/admin-only SELECT RLS so plain members '
  'resolve their own membership. Gates studio_contacts (the shared rolodex).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. studio_contacts — the shared rolodex
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.studio_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- person | company. A company card is an org (a vendor, a GC firm, a
  -- photography studio); a person card is a human who may hang off one.
  entity_kind     text NOT NULL CHECK (entity_kind IN ('person', 'company')),

  -- Self-FK: a person's employer card. SET NULL, never CASCADE — losing the
  -- company must not vaporize the people (the 00212 back-link posture).
  company_id      uuid REFERENCES public.studio_contacts(id) ON DELETE SET NULL,

  -- Free TEXT, deliberately NO CHECK: the vocab is code-resident in
  -- packages/types/src/studio-config.ts (ContactKind) and
  -- packages/types/src/field-config.ts (PartyKind), UI-validated. Same idiom as
  -- project_parties.trade (00281) and organization_members.job_title (00416) —
  -- the rolodex's kinds grow without a migration.
  contact_kind    text NOT NULL,

  full_name       text,
  company_name    text,
  email           text,
  phone           text,
  phone_e164      text,

  -- Trades / categories this contact covers (VendorSpecialty + FieldTrade in
  -- packages/types/src/studio-config.ts / field-config.ts). Array, not a join
  -- table: the rolodex filters on it, it never joins through it.
  specialties     text[] NOT NULL DEFAULT '{}',

  -- Soft back-links, both ON DELETE SET NULL (00212 posture): a rolodex card
  -- survives losing the vendor row or the login it once pointed at.
  vendor_id       uuid REFERENCES public.vendors(id)   ON DELETE SET NULL,
  profile_id      uuid REFERENCES public.profiles(id)  ON DELETE SET NULL,
  created_by      uuid REFERENCES public.profiles(id)  ON DELETE SET NULL,

  notes           text,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- A card must carry the name its own entity_kind reads from.
  CONSTRAINT studio_contacts_entity_name_check CHECK (
    (entity_kind = 'person'  AND full_name    IS NOT NULL) OR
    (entity_kind = 'company' AND company_name IS NOT NULL)
  ),
  -- Only a person hangs off a company. A company never nests inside a company
  -- (no parent/subsidiary tree in v1 — the People Room renders one level).
  CONSTRAINT studio_contacts_company_link_check CHECK (
    entity_kind = 'person' OR company_id IS NULL
  )
);

COMMENT ON TABLE public.studio_contacts IS
  'Call Sheet Wave 2 (R1): the studio''s SHARED rolodex — one row per person or '
  'company the studio knows, scoped to organization_id, readable and writable by '
  'every active non-guest member. Soft delete only (archived_at); there is no '
  'DELETE policy or grant. Seeded from legacy saved_vendors / project_parties by '
  'fold_legacy_contacts_into_studios() in 00418.';

COMMENT ON COLUMN public.studio_contacts.contact_kind IS
  'What this card IS to the studio (vendor, gc, sub, installer, receiver, '
  'client, lead, architect, photographer, stager, team, …). Free TEXT, no CHECK '
  '— the vocab is code-resident in packages/types/src/studio-config.ts '
  '(ContactKind) and packages/types/src/field-config.ts (PartyKind), so it grows '
  'without a migration. Same posture as project_parties.trade (00281).';

COMMENT ON COLUMN public.studio_contacts.specialties IS
  'Trades / categories this contact covers. Vocab code-resident in '
  'packages/types/src/studio-config.ts (VendorSpecialty) and field-config.ts '
  '(FieldTrade). NOT NULL DEFAULT ''{}'' so filters never trip over NULL.';

COMMENT ON COLUMN public.studio_contacts.phone_e164 IS
  'E.164 normalization of `phone`, derived by the shared '
  'normalize_party_phone_e164() trigger (00281). The rolodex''s dedupe key '
  'component (00418 fold) — NOT an SMS reach key.';

COMMENT ON COLUMN public.studio_contacts.archived_at IS
  'Soft delete. Archived rows stay SELECTable by members (owner review of the '
  'seeded book needs them; the UI filters them out of the default lens) but are '
  'not writable by plain members — only an owner/admin can archive or unarchive.';

-- ── NO SMS CONSENT COLUMNS HERE. DELIBERATE. ────────────────────────────────
-- TCPA consent is PER ENGAGEMENT, not per contact: a sub who said YES on the
-- Adams job has not consented to be texted about the Bell job. Consent therefore
-- stays exactly where 00281 put it — project_parties.sms_consent_status /
-- sms_consented_at / sms_opt_out_at, one row per project. A rolodex card is an
-- address book entry; it never carries a reach permission, and sms-dispatch
-- (00284) must keep reading project_parties, never this table.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ═══════════════════════════════════════════════════════════════════════════
-- The People Room's default lens: live cards in my studio.
CREATE INDEX IF NOT EXISTS idx_studio_contacts_org_live
  ON public.studio_contacts(organization_id)
  WHERE archived_at IS NULL;

-- One company card per vendor per studio. Partial (vendor_id IS NOT NULL) so
-- the many vendor-less cards do not collide with each other; this is also the
-- ON CONFLICT arbiter the 00418 fold infers, which is why the predicate must be
-- repeated verbatim at every ON CONFLICT site.
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_contacts_org_vendor
  ON public.studio_contacts(organization_id, vendor_id)
  WHERE vendor_id IS NOT NULL;

-- "Who works at this company" (the company row's unfold).
CREATE INDEX IF NOT EXISTS idx_studio_contacts_company
  ON public.studio_contacts(company_id)
  WHERE company_id IS NOT NULL;

-- Resolving a card to a real login (promote band).
CREATE INDEX IF NOT EXISTS idx_studio_contacts_profile
  ON public.studio_contacts(profile_id)
  WHERE profile_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Triggers
-- ═══════════════════════════════════════════════════════════════════════════
-- updated_at touch — the project-wide helper from 00014.
DROP TRIGGER IF EXISTS set_updated_at_studio_contacts ON public.studio_contacts;
CREATE TRIGGER set_updated_at_studio_contacts
  BEFORE UPDATE ON public.studio_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- phone_e164 derivation — CROSS-TABLE REUSE of 00281's trigger function.
-- Verified before attaching: normalize_party_phone_e164()'s entire body is
--   NEW.phone_e164 := public.normalize_phone_e164(COALESCE(NEW.phone, NEW.phone_e164));
--   RETURN NEW;
-- It touches ONLY NEW.phone / NEW.phone_e164 — no project_parties column, no
-- table lookup — so it is safe on any table carrying that column pair. It is
-- also idempotent on an already-normalized value (+15551234567 → digits
-- 15551234567 → +15551234567), which is what lets the 00418 fold copy a party's
-- phone_e164 straight onto a card and still land on the same dedupe key.
DROP TRIGGER IF EXISTS normalize_phone_studio_contacts ON public.studio_contacts;
CREATE TRIGGER normalize_phone_studio_contacts
  BEFORE INSERT OR UPDATE ON public.studio_contacts
  FOR EACH ROW EXECUTE FUNCTION public.normalize_party_phone_e164();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.studio_contacts ENABLE ROW LEVEL SECURITY;

-- SELECT: every active non-guest member, INCLUDING archived rows. The owner's
-- review of the auto-folded book (R5) has to be able to see what was archived,
-- and un-archiving needs the row visible first. The People Room filters
-- archived_at IS NULL in its default lens.
DROP POLICY IF EXISTS studio_contacts_member_select ON public.studio_contacts;
CREATE POLICY studio_contacts_member_select
  ON public.studio_contacts FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(organization_id));

-- INSERT: any member, live rows only — you cannot create a card born archived.
DROP POLICY IF EXISTS studio_contacts_member_insert ON public.studio_contacts;
CREATE POLICY studio_contacts_member_insert
  ON public.studio_contacts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_studio_member(organization_id)
    AND archived_at IS NULL
  );

-- UPDATE (member leg): edit LIVE cards only, and the edit must leave the card
-- live. USING blocks touching an archived row; WITH CHECK blocks a member
-- setting archived_at — so archive/unarchive is not reachable from this policy
-- in either direction.
DROP POLICY IF EXISTS studio_contacts_member_update ON public.studio_contacts;
CREATE POLICY studio_contacts_member_update
  ON public.studio_contacts FOR UPDATE
  TO authenticated
  USING (
    public.is_active_studio_member(organization_id)
    AND archived_at IS NULL
  )
  WITH CHECK (
    public.is_active_studio_member(organization_id)
    AND archived_at IS NULL
  );

-- UPDATE (admin leg): owner/admin only, no archived_at predicate on either
-- side — this is the archive AND unarchive leg. Policies are PERMISSIVE, so
-- this ORs with the member leg: an owner/admin gets the union (edit live rows
-- as a member, plus flip archived_at in both directions). Reuses 00068's
-- helper; role IN ('owner','admin') already excludes guests.
DROP POLICY IF EXISTS studio_contacts_admin_update ON public.studio_contacts;
CREATE POLICY studio_contacts_admin_update
  ON public.studio_contacts FOR UPDATE
  TO authenticated
  USING (public.is_org_admin_or_owner(organization_id))
  WITH CHECK (public.is_org_admin_or_owner(organization_id));

-- No DELETE policy. No DELETE grant. Soft delete only.
--
-- The REVOKE must name `authenticated` too, not just PUBLIC/anon. Strata
-- PREDATES Supabase's 2026-05-30 default-privilege flip, so a table created
-- there is auto-granted ALL (DELETE and TRUNCATE included) to anon AND
-- authenticated at creation; locally the same blanket baseline is re-applied by
-- seed/00-legacy-grants.sql, which runs AFTER migrations. Revoking only
-- PUBLIC/anon leaves authenticated holding DELETE — verified: with the narrower
-- revoke, a `DELETE FROM studio_contacts` as authenticated did NOT raise 42501,
-- it silently deleted 0 rows because RLS (not privilege) was the only thing in
-- the way. Naming authenticated in the REVOKE and re-granting exactly
-- SELECT/INSERT/UPDATE is what makes "no hard delete" a privilege guarantee.
REVOKE ALL ON TABLE public.studio_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.studio_contacts TO authenticated;
GRANT ALL ON public.studio_contacts TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. organizations.rolodex_seed_skipped_at — the checklist SKIP stamp
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS rolodex_seed_skipped_at timestamptz;

COMMENT ON COLUMN public.organizations.rolodex_seed_skipped_at IS
  'Call Sheet day-1 checklist, row 4 ("Review your rolodex"): when set, the '
  'owner explicitly SKIPPED the seeded-rolodex review, so the checklist row '
  'ticks and the desk whisper stops. NULL = not yet skipped. Written through the '
  'EXISTING 00021 "Org admins can update organization" UPDATE policy (owner/admin '
  'only) — no new policy or grant is needed for it.';
