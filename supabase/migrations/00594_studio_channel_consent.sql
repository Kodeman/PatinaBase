-- ═══════════════════════════════════════════════════════════════════════════
-- 00594 — People room CRM · W1a (3 of 3): one consent record per studio per
--          channel value
--
-- E8, and the sharpest gap in the room (G-3, F-12). Consent lives today on
-- project_parties.sms_consent_* — one independent ledger per party row
-- (00281:55-61, evidence columns 00432:4-11). The send gate already knows that
-- is wrong and papers over it by reducing consent across EVERY party row on a
-- phone, phone-globally, across every studio (_shared/sms.ts:174-185). So Pete
-- Rusk's STOP on one studio's job silences him for a studio he never heard
-- from, while his new row still prints "Not asked".
--
-- The true shape, from the six construction seats: consent is a fact about a
-- (studio, channel value) pair. Never per project, never cross-studio.
--
--   1. studio_channel_consent, PK (organization_id, channel_kind, channel_value),
--      carrying every 00432 evidence column plus origin_project_id (so the room
--      can print "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." —
--      ruling R-Q).
--   2. backfill_channel_consent_from_parties() — folds the party ledgers in,
--      per org, with opted_out winning over everything, then the most recent
--      granted, then pending, then not_asked.
--   3. mirror_channel_consent_to_parties() — an AFTER trigger that pushes the
--      record back onto every party row in that org on that number. The
--      project_parties.sms_consent_* columns become a READ-ONLY CACHED MIRROR:
--      two readers, one writer. They are kept, not dropped — every existing
--      reader (the roster view, the chips, the send gate's secondary check)
--      keeps working while the room repoints.
--   4. record_channel_consent(...) — SECURITY DEFINER, studio-member gated. The
--      ONLY write path the portal gets: the table grants authenticated SELECT
--      and nothing else, so a consent fact cannot be written without passing
--      through the membership check and the evidence stamping.
--
-- ORDER IS LOAD-BEARING: the mirror trigger is created AFTER the backfill runs.
-- Creating it first would make the backfill push a consent verdict back down
-- onto sibling party rows, and a row moving to evidenced-`pending` fires
-- 00432's fc_dispatch_optin_invite — a real opt-in SMS, from a migration.
--
-- That ordering only protects THIS file's own fold. At runtime the same hazard
-- is live and worse: one recorded `pending` fans out to every party row in the
-- studio on that number, and each newly-evidenced-pending row fires its own
-- opt-in text — N identical messages to one human from one studio act, on a
-- 10DLC campaign where duplicate opt-in traffic is exactly what gets a campaign
-- filtered. So this file also REDEFINES fc_dispatch_optin_invite (lineage
-- 00432:27-68, retriggered 00284:254-257) to stand down while the mirror is the
-- one writing: a mirror write is cache maintenance, never a studio act, and
-- must have no external side effect. A designer writing an evidenced `pending`
-- onto a party row directly still dispatches, unchanged. Sending the invite for
-- a consent RECORD is W2's hook, once, deliberately — not a trigger's fan-out.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this migration
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The table
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.studio_channel_consent (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_kind    text NOT NULL CHECK (channel_kind IN ('sms', 'email')),
  channel_value   text NOT NULL,

  status text NOT NULL DEFAULT 'not_asked'
    CHECK (status IN ('not_asked', 'pending', 'granted', 'opted_out')),
  consented_at timestamptz,
  opt_out_at   timestamptz,

  -- The 00432 evidence set, verbatim in meaning.
  source text CHECK (source IN ('verbal', 'written', 'web_form', 'inbound_sms', 'other')),
  evidence           text,
  recorded_at        timestamptz,
  disclosure_version text,
  recorded_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- "opted out on Lindqvist 2025-12-03" (CS3-14, ruling R-Q).
  origin_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, channel_kind, channel_value)
);

COMMENT ON TABLE public.studio_channel_consent IS
  'E8: ONE consent record per studio per channel value. Never per project '
  '(00417''s "consent is per engagement" note is superseded by the six '
  'construction seats: consent follows the phone, inside one studio). '
  'project_parties.sms_consent_* is now a read-only cached mirror of this table, '
  'maintained by mirror_channel_consent_to_parties(). Written ONLY through '
  'record_channel_consent() or service_role (the inbound SMS rail).';

COMMENT ON COLUMN public.studio_channel_consent.channel_value IS
  'The phone in E.164 or the lowercased email — the fact consent is about. '
  'Normalised by record_channel_consent(); a phone reassigned to a new human '
  'keeps this record until a fresh consent is written (crm-model §4).';
COMMENT ON COLUMN public.studio_channel_consent.origin_project_id IS
  'The job the consent (or the STOP) came from, so the room can name it in '
  'words. Not a scope: consent is studio-wide.';

-- The inbound rail and the merge sheet both ask "who else holds this number".
CREATE INDEX IF NOT EXISTS idx_studio_channel_consent_value
  ON public.studio_channel_consent(channel_kind, channel_value);

DROP TRIGGER IF EXISTS set_updated_at_studio_channel_consent ON public.studio_channel_consent;
CREATE TRIGGER set_updated_at_studio_channel_consent
  BEFORE UPDATE ON public.studio_channel_consent
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_channel_consent ENABLE ROW LEVEL SECURITY;

-- SELECT only for members. There is deliberately NO insert/update/delete policy
-- and NO write grant for authenticated: record_channel_consent() is the one
-- door, so the membership check and the evidence stamping cannot be walked past.
DROP POLICY IF EXISTS studio_channel_consent_member_select ON public.studio_channel_consent;
CREATE POLICY studio_channel_consent_member_select
  ON public.studio_channel_consent FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(organization_id));

REVOKE ALL ON TABLE public.studio_channel_consent FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.studio_channel_consent TO authenticated;
GRANT ALL ON public.studio_channel_consent TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Backfill from the party ledgers
-- ═══════════════════════════════════════════════════════════════════════════
-- A function, not a bare statement, for two reasons: the fold is the precedence
-- rule the whole room now depends on, so it is worth being able to re-run and
-- to test directly (supabase/tests/people/w1a_identity_channels_consent_test.sql);
-- and it is idempotent (ON CONFLICT DO NOTHING), so re-running never overwrites
-- a consent decision recorded after the fold.
CREATE OR REPLACE FUNCTION public.backfill_channel_consent_from_parties()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted integer;
BEGIN
  WITH party_org AS (
    SELECT pp.phone_e164,
           pp.project_id,
           pp.sms_consent_status,
           pp.sms_consented_at,
           pp.sms_opt_out_at,
           pp.sms_consent_source,
           pp.sms_consent_evidence,
           pp.sms_consent_recorded_at,
           pp.sms_consent_disclosure_version,
           pp.sms_consent_recorded_by,
           pp.updated_at,
           COALESCE(p.studio_id, public._primary_studio_for(p.designer_id)) AS org
    FROM public.project_parties pp
    JOIN public.projects p ON p.id = pp.project_id
    WHERE pp.phone_e164 IS NOT NULL
  ),
  ranked AS (
    SELECT party_org.*,
           ROW_NUMBER() OVER (
             PARTITION BY org, phone_e164
             ORDER BY CASE sms_consent_status
                        WHEN 'opted_out' THEN 0   -- opted_out wins over everything
                        WHEN 'granted'   THEN 1   -- then the most recent granted
                        WHEN 'pending'   THEN 2
                        ELSE 3                    -- not_asked last
                      END,
                      COALESCE(sms_opt_out_at, sms_consented_at,
                               sms_consent_recorded_at, updated_at) DESC NULLS LAST
           ) AS rn
    FROM party_org
    WHERE org IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.studio_channel_consent (
      organization_id, channel_kind, channel_value, status,
      consented_at, opt_out_at, source, evidence, recorded_at,
      disclosure_version, recorded_by, origin_project_id
    )
    SELECT org, 'sms', phone_e164, sms_consent_status,
           sms_consented_at, sms_opt_out_at, sms_consent_source,
           sms_consent_evidence, sms_consent_recorded_at,
           sms_consent_disclosure_version, sms_consent_recorded_by, project_id
    FROM ranked
    WHERE rn = 1
    ON CONFLICT (organization_id, channel_kind, channel_value) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_channel_consent_from_parties()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_channel_consent_from_parties() TO service_role;

COMMENT ON FUNCTION public.backfill_channel_consent_from_parties() IS
  'Folds project_parties.sms_consent_* into studio_channel_consent, one row per '
  '(studio, sms, phone_e164). Precedence: opted_out over everything, then the '
  'most recent granted, then pending, then not_asked. Idempotent — ON CONFLICT '
  'DO NOTHING never overwrites a later decision — and side-effect-free to '
  're-run once the trigger exists: a folded `pending` reaches the party rows '
  'through the mirror, which suppresses 00432''s opt-in dispatch (00594).';

SELECT public.backfill_channel_consent_from_parties();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The mirror — created AFTER the backfill, see the header
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 3a. Teach the opt-in dispatch to stand down for a mirror write ──────────
-- Lineage: 00432:27-68 (current head — the body below is that body verbatim),
-- trigger fc_optin_invite_dispatch created at 00284:254-257. Delta: one guard,
-- first statement. Everything else is untouched.
--
-- patina.suppress_optin_dispatch is set (SET LOCAL, via set_config(...,true))
-- only by mirror_channel_consent_to_parties() below, around its own UPDATE, and
-- cleared immediately after it. AFTER-row triggers queued by that UPDATE fire
-- at the end of that statement, before the mirror's next statement, so the
-- window is exactly the mirror's own write and nothing else in the transaction.
CREATE OR REPLACE FUNCTION public.fc_dispatch_optin_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 00594: the mirror is maintaining the cached copy of a consent record that
  -- was already decided elsewhere. Mirroring a verdict is not asking for one.
  IF COALESCE(current_setting('patina.suppress_optin_dispatch', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.sms_consent_status <> 'pending' OR NEW.phone_e164 IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.sms_consent_source IS NULL
     OR NEW.sms_consent_recorded_at IS NULL
     OR NEW.sms_consent_disclosure_version IS NULL
     OR btrim(COALESCE(NEW.sms_consent_evidence, '')) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.sms_consent_status IS NOT DISTINCT FROM 'pending'
     AND OLD.sms_consent_source IS NOT NULL
     AND OLD.sms_consent_recorded_at IS NOT NULL
     AND OLD.sms_consent_disclosure_version IS NOT NULL
     AND btrim(COALESCE(OLD.sms_consent_evidence, '')) <> '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'sms-dispatch',
      jsonb_build_object(
        'partyId',     NEW.id,
        'projectId',   NEW.project_id,
        'templateKey', 'sms_optin_invite',
        'type',        'field_optin_confirmation'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fc_dispatch_optin_invite: dispatch failed for party %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fc_dispatch_optin_invite() IS
  'Dispatches the SMS double-confirmation only after auditable prior express '
  'consent is recorded (00432), and never for a write made by '
  'mirror_channel_consent_to_parties(), which sets patina.suppress_optin_dispatch '
  'for the duration of its own UPDATE — one recorded consent must not fan out '
  'into one text per party row on the number (00594).';

-- ── 3b. The mirror ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mirror_channel_consent_to_parties()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.channel_kind <> 'sms' THEN
    RETURN NEW;
  END IF;

  -- Transaction-local, cleared below: fc_dispatch_optin_invite (redefined in
  -- 3a) reads this and returns without dispatching. Without it, one recorded
  -- `pending` becomes one real opt-in SMS per party row on the number.
  PERFORM set_config('patina.suppress_optin_dispatch', '1', true);

  UPDATE public.project_parties pp
     SET sms_consent_status             = NEW.status,
         sms_consented_at               = NEW.consented_at,
         sms_opt_out_at                 = NEW.opt_out_at,
         sms_consent_source             = NEW.source,
         sms_consent_evidence           = NEW.evidence,
         sms_consent_recorded_at        = NEW.recorded_at,
         sms_consent_disclosure_version = NEW.disclosure_version,
         sms_consent_recorded_by        = NEW.recorded_by
    FROM public.projects p
   WHERE p.id = pp.project_id
     AND pp.phone_e164 = NEW.channel_value
     AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
         = NEW.organization_id
     AND pp.sms_consent_status IS DISTINCT FROM NEW.status;

  PERFORM set_config('patina.suppress_optin_dispatch', '', true);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_channel_consent_to_parties() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.mirror_channel_consent_to_parties() IS
  'AFTER INSERT/UPDATE on studio_channel_consent: pushes the studio''s verdict '
  'onto every party row in that studio carrying the same phone_e164, making '
  'project_parties.sms_consent_* a read-only cached mirror. Guarded on a real '
  'status change so a re-record does not rewrite unchanged rows, and it sets '
  'patina.suppress_optin_dispatch for the duration of its own UPDATE so a '
  'mirrored `pending` cannot fire 00432''s opt-in dispatch once per row '
  '(00594).';

DROP TRIGGER IF EXISTS mirror_channel_consent_to_parties_trg ON public.studio_channel_consent;
CREATE TRIGGER mirror_channel_consent_to_parties_trg
  AFTER INSERT OR UPDATE ON public.studio_channel_consent
  FOR EACH ROW EXECUTE FUNCTION public.mirror_channel_consent_to_parties();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. record_channel_consent — the portal's only write path
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_channel_consent(
  p_organization_id    uuid,
  p_channel_kind       text,
  p_channel_value      text,
  p_status             text,
  p_source             text DEFAULT NULL,
  p_evidence           text DEFAULT NULL,
  p_disclosure_version text DEFAULT NULL,
  p_origin_project_id  uuid DEFAULT NULL
)
RETURNS public.studio_channel_consent
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_value text;
  v_now   timestamptz := now();
  v_row   public.studio_channel_consent;
BEGIN
  IF NOT public.is_active_studio_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_a_studio_member'
      USING HINT = 'Only an active, non-guest member of this studio may record consent.';
  END IF;

  IF p_channel_kind NOT IN ('sms', 'email') THEN
    RAISE EXCEPTION 'invalid_channel_kind';
  END IF;
  IF p_status NOT IN ('not_asked', 'pending', 'granted', 'opted_out') THEN
    RAISE EXCEPTION 'invalid_consent_status';
  END IF;

  -- Same normalisation the channels table applies, so the record and the
  -- channel land on the same key.
  IF p_channel_kind = 'email' THEN
    v_value := NULLIF(lower(btrim(COALESCE(p_channel_value, ''))), '');
  ELSE
    v_value := public.normalize_phone_e164(p_channel_value);
  END IF;
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_value';
  END IF;

  INSERT INTO public.studio_channel_consent AS scc (
    organization_id, channel_kind, channel_value, status,
    consented_at, opt_out_at,
    source, evidence, recorded_at, disclosure_version, recorded_by,
    origin_project_id
  )
  VALUES (
    p_organization_id, p_channel_kind, v_value, p_status,
    CASE WHEN p_status = 'granted'   THEN v_now END,
    CASE WHEN p_status = 'opted_out' THEN v_now END,
    p_source, p_evidence, v_now, p_disclosure_version, auth.uid(),
    p_origin_project_id
  )
  ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
  SET status = EXCLUDED.status,
      -- A date already earned is kept when the new verdict does not restate it:
      -- "granted 2 May 2025, opted out 3 Dec 2025" must both survive.
      consented_at = CASE WHEN EXCLUDED.status = 'granted'
                          THEN EXCLUDED.consented_at ELSE scc.consented_at END,
      opt_out_at   = CASE WHEN EXCLUDED.status = 'opted_out'
                          THEN EXCLUDED.opt_out_at ELSE scc.opt_out_at END,
      source             = COALESCE(EXCLUDED.source, scc.source),
      evidence           = COALESCE(EXCLUDED.evidence, scc.evidence),
      recorded_at        = EXCLUDED.recorded_at,
      disclosure_version = COALESCE(EXCLUDED.disclosure_version, scc.disclosure_version),
      recorded_by        = EXCLUDED.recorded_by,
      origin_project_id  = COALESCE(EXCLUDED.origin_project_id, scc.origin_project_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_channel_consent(uuid, text, text, text, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_channel_consent(uuid, text, text, text, text, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_channel_consent(uuid, text, text, text, text, text, text, uuid) IS
  'The one write path into studio_channel_consent for the portal. Studio-member '
  'gated (raises not_a_studio_member), normalises the channel value, stamps '
  'recorded_by/recorded_at, and keeps an earlier granted/opt-out date when the '
  'new verdict does not restate it. PR-m''s manual "mark opted out" runs through '
  'here with a source and evidence (00594).';
