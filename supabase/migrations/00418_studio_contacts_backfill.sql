-- ═══════════════════════════════════════════════════════════════════════════
-- 00418 — Fold the legacy books into the studio rolodex (Call Sheet Wave 2)
--
-- R5 ruled the rolodex AUTO-SEEDED, then reviewed by the owner. The studio's
-- people already exist, scattered across two designer-scoped books:
--   • saved_vendors (00009)   — "makers I saved", keyed on designer_id
--   • project_parties (00212/00281) — GCs, subs, installers, receivers, vendors
--     recorded per project
-- This migration folds both into studio_contacts (00417) and stamps the lineage
-- back onto the party rows.
--
-- ORG RESOLUTION — two rules, deliberately different:
--   • A PROJECT row resolves via projects.studio_id (00084 column, kept correct
--     on every write path by 00317's trigger). Never re-derived from the
--     designer: the project already knows whose studio it is.
--   • A SAVED_VENDORS row is designer-scoped and has no project, so it resolves
--     to the designer's best NON-GUEST design_studio seat: owner role first,
--     then earliest joined_at. This is 00315's _primary_studio_for ordering with
--     the guest exclusion folded INTO the resolution rather than re-checked
--     after it. That ordering matters: _primary_studio_for does not exclude
--     guests, so "resolve, then re-assert non-guest on the resolved org" DROPS a
--     designer whose earliest/only-ordered-first seat happens to be a guest
--     courtesy login, even when they hold a real member seat in another studio.
--     The rolodex must seed from that real seat. _primary_studio_for itself is
--     left ALONE (the projects/invoice triggers and the branding resolver depend
--     on its current semantics); the guest-aware variant lives here, inline.
--   • A designer with zero active non-guest design_studio seats resolves to
--     nothing and is SKIPPED — never defaulted anywhere.
--
-- IDEMPOTENT / RE-RUNNABLE, including twice inside one transaction:
--   passes A and B land on the 00417 partial unique index via ON CONFLICT DO
--   NOTHING; pass C guards with a NOT EXISTS anti-join on its dedupe key (and
--   DISTINCT ON to dedupe within the statement, since NOT EXISTS cannot see
--   rows the same statement is inserting); pass D only touches rows whose
--   studio_contact_id IS NULL. No temp tables (they would collide on a second
--   call in the same transaction).
--
-- PERSON DEDUPE — MERGES REQUIRE EVIDENCE:
--   The person key is (org, lower(trim(display_name)), DISCRIMINATOR) where the
--   discriminator is, in strict precedence:
--       phone_e164                    when present
--       'email:' || lower(trim(email)) when present
--       'party:' || <party row id>     otherwise
--   A shared NAME is not evidence that two humans are one human. Two "John
--   Smith" rows with no phone and no email are two people until something says
--   otherwise, so each keeps its own card — the R5 owner review archives any
--   real duplicate, which is cheap; a wrong MERGE is not recoverable (it welds
--   two people's history onto one card).
--   The 'party:' fallback is what makes that stable across re-runs: a card born
--   from an evidence-free party row is inserted WITH THAT PARTY ROW'S id, so the
--   card side of the key ('party:' || studio_contacts.id) reproduces the party
--   side ('party:' || project_parties.id) exactly, on every subsequent run and
--   in pass D1's link-back. Nothing is derived from a clock or a sequence.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. project_parties.studio_contact_id — the lineage stamp
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.project_parties
  ADD COLUMN IF NOT EXISTS studio_contact_id uuid
    REFERENCES public.studio_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_parties_studio_contact
  ON public.project_parties(studio_contact_id)
  WHERE studio_contact_id IS NOT NULL;

COMMENT ON COLUMN public.project_parties.studio_contact_id IS
  'Call Sheet: LINEAGE, not a live join. The party row keeps its OWN snapshotted '
  'display_name / company_name / email / phone / trade — those are what this '
  'project agreed to and they must not drift when someone edits the rolodex '
  'card. This column only records which studio_contacts card the party came '
  'from (or was later matched to), so the Call Sheet can show history lines '
  '("worked 3 of your projects") and the picker can avoid re-adding a duplicate. '
  'ON DELETE SET NULL — archiving/removing a card never disturbs a project''s '
  'party roster. NULL = a party with no rolodex counterpart.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. fold_legacy_contacts_into_studios() — the four-pass seeder
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fold_legacy_contacts_into_studios()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ─── PASS A — saved_vendors → company cards ──────────────────────────────
  -- Every maker a designer saved becomes a company card in that designer's
  -- studio. One card per (org, vendor): if two designers in the same studio
  -- both saved the vendor, the EARLIEST saver is recorded as created_by (that
  -- is who actually brought the maker into the studio's book) and the card's
  -- created_at carries that first save. Specialties seed from the vendor's
  -- primary_category when it says something.
  INSERT INTO public.studio_contacts (
    organization_id, entity_kind, contact_kind, company_name,
    vendor_id, specialties, created_by, created_at
  )
  SELECT DISTINCT ON (a.org_id, a.vendor_id)
    a.org_id,
    'company',
    'vendor',
    v.name,
    a.vendor_id,
    CASE
      WHEN v.primary_category IS NOT NULL AND btrim(v.primary_category) <> ''
        THEN ARRAY[v.primary_category]
      ELSE '{}'::text[]
    END,
    cb.id,                                   -- NULL when the saver has no profile row
    COALESCE(a.saved_at, now())
  FROM (
    SELECT
      sv.designer_id,
      sv.vendor_id,
      sv.saved_at,
      s.organization_id AS org_id
    FROM public.saved_vendors sv
    -- The designer's best NON-GUEST design_studio seat. Deliberately NOT
    -- _primary_studio_for(): that resolver ignores role, so resolving first and
    -- re-asserting non-guest afterwards drops a designer whose ordering happens
    -- to surface a guest courtesy seat, even when they hold a real member seat
    -- in another studio. Guest exclusion belongs INSIDE the resolution. Same
    -- ordering as 00315 otherwise (owner first, then earliest joined), so a
    -- designer's saved makers still land where 00317 files their projects.
    -- No seat → no row → the saved_vendors row is skipped (correct).
    LEFT JOIN LATERAL (
      SELECT om.organization_id
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.user_id = sv.designer_id
        AND om.status  = 'active'
        AND om.role   <> 'guest'
        AND o.type     = 'design_studio'
      ORDER BY (om.role = 'owner') DESC, om.joined_at NULLS LAST, om.created_at
      LIMIT 1
    ) s ON TRUE
  ) a
  JOIN public.vendors v         ON v.id  = a.vendor_id
  LEFT JOIN public.profiles cb  ON cb.id = a.designer_id
  WHERE a.org_id IS NOT NULL
    AND v.name IS NOT NULL
  ORDER BY a.org_id, a.vendor_id, a.saved_at NULLS LAST
  ON CONFLICT (organization_id, vendor_id) WHERE vendor_id IS NOT NULL
    DO NOTHING;

  -- ─── PASS B — vendor-linked parties → company cards ──────────────────────
  -- A vendor engaged on a project but never "saved" still belongs in the book.
  -- Same shape as pass A; the display name prefers the name the project wrote
  -- down (pp.company_name) over the catalog name, because that is what the
  -- studio calls them. Cards created by pass A are skipped by ON CONFLICT.
  INSERT INTO public.studio_contacts (
    organization_id, entity_kind, contact_kind, company_name,
    vendor_id, specialties, created_by, created_at
  )
  SELECT DISTINCT ON (b.org_id, b.vendor_id)
    b.org_id,
    'company',
    'vendor',
    b.company_name,
    b.vendor_id,
    CASE
      WHEN b.primary_category IS NOT NULL AND btrim(b.primary_category) <> ''
        THEN ARRAY[b.primary_category]
      ELSE '{}'::text[]
    END,
    b.created_by,
    b.created_at
  FROM (
    SELECT
      pj.studio_id                              AS org_id,
      pp.vendor_id,
      COALESCE(NULLIF(btrim(pp.company_name), ''), v.name) AS company_name,
      v.primary_category,
      pp.created_by,
      pp.created_at
    FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
    JOIN public.vendors  v  ON v.id  = pp.vendor_id
    WHERE pp.vendor_id IS NOT NULL
      AND pj.studio_id IS NOT NULL
  ) b
  WHERE b.company_name IS NOT NULL
  ORDER BY b.org_id, b.vendor_id, b.created_at NULLS LAST
  ON CONFLICT (organization_id, vendor_id) WHERE vendor_id IS NOT NULL
    DO NOTHING;

  -- ─── PASS C — project_parties → person cards ─────────────────────────────
  -- The humans: GCs, subs, installers, receivers, and vendor reps. One card per
  -- (org, lower(trim(name)), discriminator) — the same human on three projects
  -- collapses to one card, and the LATEST-UPDATED party row wins the details
  -- (email, trade, kind), because that is the freshest thing anyone recorded.
  --
  -- The DISCRIMINATOR is what makes a collapse legitimate (see the header):
  -- phone_e164, else 'email:'||lower(trim(email)), else 'party:'||<party id>.
  -- A name alone never merges two rows. The evidence-free branch inserts the
  -- card WITH THE PARTY ROW'S id, so 'party:'||studio_contacts.id on the card
  -- side reproduces 'party:'||project_parties.id on the party side — the key is
  -- symmetric, which is what keeps the anti-join below (and pass D1) exact on
  -- every re-run. gen_random_uuid() is used for the evidence-bearing branches,
  -- where the card is found by its phone/email instead.
  --
  -- phone AND phone_e164 are both copied so the 00417 normalize trigger
  -- recomputes normalize(COALESCE(phone, phone_e164)) — identical to what
  -- produced the party's phone_e164 (the function is idempotent on an already
  -- normalized value). Without copying phone_e164, a party carrying only a
  -- pre-normalized number would land on a card with NULL phone_e164 and the
  -- anti-join below would re-insert it on every re-run.
  --
  -- company_id hangs the person off the pass-A/B company card for their vendor,
  -- when they have one. No vendor_id is set on a PERSON card — that would
  -- collide with the company card on the 00417 partial unique index.
  INSERT INTO public.studio_contacts (
    id, organization_id, entity_kind, contact_kind, full_name,
    email, phone, phone_e164, specialties, company_id, created_by, created_at
  )
  SELECT DISTINCT ON (c.org_id, c.name_key, c.dedupe_key)
    CASE
      WHEN c.dedupe_key = 'party:' || c.party_id::text THEN c.party_id
      ELSE gen_random_uuid()
    END,
    c.org_id,
    'person',
    c.party_kind,
    c.display_name,
    c.email,
    c.phone,
    c.phone_e164,
    CASE
      WHEN c.trade IS NOT NULL AND btrim(c.trade) <> ''
        THEN ARRAY[c.trade]
      ELSE '{}'::text[]
    END,
    cc.id,
    c.created_by,
    c.created_at
  FROM (
    SELECT
      pj.studio_id                        AS org_id,
      lower(btrim(pp.display_name))       AS name_key,
      -- THE DISCRIMINATOR. COALESCE gives the precedence directly: an absent
      -- email makes 'email:' || NULL NULL, so the branch falls through.
      COALESCE(
        NULLIF(btrim(pp.phone_e164), ''),
        'email:' || NULLIF(lower(btrim(pp.email)), ''),
        'party:' || pp.id::text
      )                                   AS dedupe_key,
      pp.id                               AS party_id,
      pp.display_name,
      pp.email,
      pp.phone,
      pp.phone_e164,
      pp.trade,
      pp.party_kind,
      pp.vendor_id,
      pp.created_by,
      pp.created_at,
      pp.updated_at
    FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
    WHERE pp.party_kind IN ('gc', 'sub', 'installer', 'receiver', 'vendor')
      AND pj.studio_id IS NOT NULL
      AND btrim(COALESCE(pp.display_name, '')) <> ''
  ) c
  LEFT JOIN public.studio_contacts cc
    ON  cc.organization_id = c.org_id
    AND cc.entity_kind     = 'company'
    AND cc.vendor_id       = c.vendor_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.studio_contacts sc
    WHERE sc.organization_id = c.org_id
      AND sc.entity_kind     = 'person'
      AND lower(btrim(sc.full_name)) = c.name_key
      -- Same expression as the subquery's dedupe_key, read off the CARD. The
      -- evidence-free branch resolves to 'party:'||sc.id, which matches only
      -- the card this very party row minted (id = party id).
      AND COALESCE(
            NULLIF(btrim(sc.phone_e164), ''),
            'email:' || NULLIF(lower(btrim(sc.email)), ''),
            'party:' || sc.id::text
          ) = c.dedupe_key
  )
  ORDER BY c.org_id, c.name_key, c.dedupe_key,
           c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
  -- Belt-and-braces: the evidence-free branch reuses the party row's uuid as
  -- the card id, so a party whose project is REPARENTED to another studio after
  -- a fold would try to mint a second card under the same id. Do nothing rather
  -- than raise — the party keeps the card it already has.
  ON CONFLICT (id) DO NOTHING;

  -- ─── PASS D — link the party rows back to their cards ────────────────────
  -- D1: person match on the SAME dedupe key pass C used — verbatim, both sides.
  -- Not restricted to the folded party_kinds: if a client_rep/other party
  -- happens to be a person already in the book, that IS the lineage and the
  -- Call Sheet should show it. For an evidence-free party the key collapses to
  -- 'party:'||id on both sides, so it links to the card its OWN pass-C row
  -- produced and to no other — a same-named stranger is never claimed.
  UPDATE public.project_parties pp
     SET studio_contact_id = sc.id
    FROM public.projects pj,
         public.studio_contacts sc
   WHERE pj.id = pp.project_id
     AND pp.studio_contact_id IS NULL
     AND pj.studio_id IS NOT NULL
     AND sc.organization_id = pj.studio_id
     AND sc.entity_kind     = 'person'
     AND lower(btrim(sc.full_name)) = lower(btrim(pp.display_name))
     AND COALESCE(
           NULLIF(btrim(sc.phone_e164), ''),
           'email:' || NULLIF(lower(btrim(sc.email)), ''),
           'party:' || sc.id::text
         ) = COALESCE(
           NULLIF(btrim(pp.phone_e164), ''),
           'email:' || NULLIF(lower(btrim(pp.email)), ''),
           'party:' || pp.id::text
         );

  -- D2: whatever is still unlinked but carries a vendor_id points at the
  -- company card for that vendor.
  UPDATE public.project_parties pp
     SET studio_contact_id = sc.id
    FROM public.projects pj,
         public.studio_contacts sc
   WHERE pj.id = pp.project_id
     AND pp.studio_contact_id IS NULL
     AND pp.vendor_id IS NOT NULL
     AND pj.studio_id IS NOT NULL
     AND sc.organization_id = pj.studio_id
     AND sc.entity_kind     = 'company'
     AND sc.vendor_id       = pp.vendor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fold_legacy_contacts_into_studios() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fold_legacy_contacts_into_studios() TO service_role;

COMMENT ON FUNCTION public.fold_legacy_contacts_into_studios() IS
  'Call Sheet R5 seeder: folds saved_vendors + project_parties into '
  'studio_contacts (company cards per (org, vendor); person cards deduped on '
  '(org, lower(trim(full_name)), DISCRIMINATOR) where the discriminator is '
  'phone_e164, else ''email:''||lower(trim(email)), else ''party:''||<party id>) '
  'and stamps project_parties.studio_contact_id with the lineage. A merge '
  'requires evidence — two same-named people with no phone and no email stay '
  'two cards (the R5 owner review archives real duplicates; a wrong merge is '
  'not recoverable). Evidence-free person cards are minted with their source '
  'party row''s id so the key is symmetric across re-runs. saved_vendors rows '
  'resolve to the designer''s best ACTIVE NON-GUEST design_studio seat (owner '
  'first, then earliest joined) — resolved with the guest exclusion inline, not '
  'via _primary_studio_for + an after-the-fact re-check. '
  'Idempotent and re-runnable — including '
  'twice in one transaction. SECURITY DEFINER (writes across every studio, '
  'bypassing RLS); service_role only, never callable from a portal session. '
  'Re-run after importing legacy data.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Seed once, now.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT public.fold_legacy_contacts_into_studios();
