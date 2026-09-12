-- ═══════════════════════════════════════════════════════════════════════════
-- 00625 — People room CRM · W1b (3 of 5): the site access card (E15)
--
-- "Everyone on the Job" §3.7, §7. CS2-3: how a body gets on site — who holds
-- the key, what the hours are, which lockbox is current, who to call when the
-- alarm goes — has no home anywhere in Patina, so it lives in one
-- superintendent's phone and in a text thread. F-06 holds a key and that fact
-- cannot be written down.
--
-- PR-r IS THE SHAPE OF THIS TABLE: Patina stores the lockbox VERSION, the key
-- holder, the hours, and who was told. IT NEVER STORES THE CODE. There is no
-- gate_code column here and there is not meant to be one; crm-model §2 lists
-- gate_code and direction §7 repeats it, and PR-r overrules both. The room
-- prints that the code is held off Patina and names the key holder to ask.
-- A column that does not exist needs no sensitivity treatment, no re-auth
-- gate and no hide-on-glance — which is the whole argument for the ruling.
--
-- PR-w IS THE RLS: studio-only, is_studio_comember(designer_id) through the
-- project, NO client branch and no show_to_client toggle, in writing. Every
-- other project-scoped table in this family carries a client leg
-- (project_parties' own show_to_client row policy, 00420:373-383); this one
-- must not, because show_to_client is per ROW and this table is one row per
-- project (00419:61-62) — a single toggle would expose the whole card.
-- anon is revoked explicitly rather than left to creation defaults.
--
-- told_refs[] and changed_at/changed_by are CS2-22: a code change is an
-- event, and "the sister still has the old code" (CS5-14) is what the lockbox
-- version exists to make visible. The notice RECORDS themselves are P3
-- (`touches`); this is the card's own change log.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this
-- migration (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. project_designer(project) → the lead designer of record
-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER for 00592's stated reason: a policy that resolved the
-- designer through the caller's own projects SELECT would make one table's RLS
-- depend on another's, and a project the caller cannot see would read as "no
-- designer" rather than "not yours".
CREATE OR REPLACE FUNCTION public.project_designer(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.designer_id FROM public.projects p WHERE p.id = p_project_id;
$$;

REVOKE ALL ON FUNCTION public.project_designer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_designer(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.project_designer(uuid) IS
  'The designer of record of a project. SECURITY DEFINER so a project-scoped '
  'table''s RLS does not depend on the caller''s own visibility of projects; '
  'feeds is_studio_comember() for project_site_access_cards (00625).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. project_site_access_cards — one per job
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.project_site_access_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id    uuid NOT NULL UNIQUE
                  REFERENCES public.projects(id) ON DELETE CASCADE,

  -- NO gate_code (PR-r). Deliberate and load-bearing: see the banner.
  lockbox_version text,
  alarm_ref       text,

  key_holder_engagement_id uuid
                  REFERENCES public.project_parties(id) ON DELETE SET NULL,

  site_hours      text,
  site_notes      text,

  -- [{ "label": "gas", "name": "...", "phone": "+1612..." }, ...] — gas,
  -- locate, alarm company, owner (CS2-19).
  emergency_lines jsonb NOT NULL DEFAULT '[]'::jsonb,

  receiver_instructions text,

  changed_at    timestamptz,
  changed_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  told_refs     uuid[] NOT NULL DEFAULT '{}'::uuid[],

  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_site_access_cards_emergency_lines_check
    CHECK (jsonb_typeof(emergency_lines) = 'array')
);

COMMENT ON TABLE public.project_site_access_cards IS
  'E15: how a body gets on site, who holds the key, who was told. One row per '
  'project. PR-r: Patina stores the lockbox VERSION, the key holder, the '
  'hours and who was told, and NEVER the code — there is no gate_code column '
  'and there is not meant to be one (crm-model §2 and direction §7 both name '
  'one; PR-r overrules them). The room prints that the code is held off '
  'Patina and names the key holder to ask. PR-w: STUDIO ONLY — '
  'is_studio_comember(project_designer(project_id)), no client policy, no '
  'show_to_client toggle, anon revoked. show_to_client is per row '
  '(00419:61-62) and this table is one row per project, so a single toggle '
  'would expose the whole card (00625).';

COMMENT ON COLUMN public.project_site_access_cards.lockbox_version IS
  'Which lockbox combination is current, as a version the studio can name '
  '("changed 16 Oct, third code") — never the combination itself (PR-r). '
  'CS5-14: the sister still has the old code, and this is the column that '
  'makes that visible.';
COMMENT ON COLUMN public.project_site_access_cards.key_holder_engagement_id IS
  'The SEAT that holds a physical key (F-06). A seat, not a person card: '
  'holding a key is a fact about one job. Asserted to a seat on THIS project '
  'by assert_site_access_key_holder().';
COMMENT ON COLUMN public.project_site_access_cards.told_refs IS
  'Who was told the current access facts (CS2-22). Person-card or seat ids; a '
  'uuid[] carries no FK, and the notice RECORDS are P3 (`touches`). This is '
  'the card''s own change log, beside changed_at / changed_by.';
COMMENT ON COLUMN public.project_site_access_cards.emergency_lines IS
  'A JSON ARRAY of lines — gas, locate, alarm company, owner (CS2-19). '
  'Enforced to an array so a reader can iterate without a type test.';

CREATE INDEX IF NOT EXISTS idx_project_site_access_cards_key_holder
  ON public.project_site_access_cards(key_holder_engagement_id)
  WHERE key_holder_engagement_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_project_site_access_cards
  ON public.project_site_access_cards;
CREATE TRIGGER set_updated_at_project_site_access_cards
  BEFORE UPDATE ON public.project_site_access_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The key holder must be a seat on THIS job. A cross-project seat here would
-- name someone with no relationship to the site as the person to call for the
-- way in — and on a studio-less project, someone in another tenant.
CREATE OR REPLACE FUNCTION public.assert_site_access_key_holder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.key_holder_engagement_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.project_parties pp
    WHERE pp.id = NEW.key_holder_engagement_id
      AND pp.project_id = NEW.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site_access_key_holder_off_project'
      USING HINT = 'key_holder_engagement_id must name a seat on THIS '
                   'project. The person who holds the key is on the job.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_site_access_key_holder()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_site_access_key_holder() IS
  'BEFORE INSERT/UPDATE on project_site_access_cards: the key holder must be a '
  'seat on the card''s own project (site_access_key_holder_off_project). The '
  'FK alone permits any party row on any project (00625).';

DROP TRIGGER IF EXISTS assert_site_access_key_holder_trg
  ON public.project_site_access_cards;
CREATE TRIGGER assert_site_access_key_holder_trg
  BEFORE INSERT OR UPDATE OF key_holder_engagement_id, project_id
  ON public.project_site_access_cards
  FOR EACH ROW EXECUTE FUNCTION public.assert_site_access_key_holder();

-- ── RLS: PR-w. Studio only. No client branch. ───────────────────────────────
ALTER TABLE public.project_site_access_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_site_access_cards_studio_select
  ON public.project_site_access_cards;
CREATE POLICY project_site_access_cards_studio_select
  ON public.project_site_access_cards FOR SELECT
  TO authenticated
  USING (public.is_studio_comember(public.project_designer(project_id)));

DROP POLICY IF EXISTS project_site_access_cards_studio_insert
  ON public.project_site_access_cards;
CREATE POLICY project_site_access_cards_studio_insert
  ON public.project_site_access_cards FOR INSERT
  TO authenticated
  WITH CHECK (public.is_studio_comember(public.project_designer(project_id)));

DROP POLICY IF EXISTS project_site_access_cards_studio_update
  ON public.project_site_access_cards;
CREATE POLICY project_site_access_cards_studio_update
  ON public.project_site_access_cards FOR UPDATE
  TO authenticated
  USING (public.is_studio_comember(public.project_designer(project_id)))
  WITH CHECK (public.is_studio_comember(public.project_designer(project_id)));

DROP POLICY IF EXISTS project_site_access_cards_studio_delete
  ON public.project_site_access_cards;
CREATE POLICY project_site_access_cards_studio_delete
  ON public.project_site_access_cards FOR DELETE
  TO authenticated
  USING (public.is_studio_comember(public.project_designer(project_id)));

-- No anon leg, ever (PR-w). Revoked explicitly, not left to defaults.
REVOKE ALL ON TABLE public.project_site_access_cards
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_site_access_cards TO authenticated;
GRANT ALL ON public.project_site_access_cards TO service_role;
