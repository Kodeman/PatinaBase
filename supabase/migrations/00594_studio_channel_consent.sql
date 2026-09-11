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
--      through the membership check, the evidence requirement and the
--      transition gate below.
--   5. record_channel_reconsent(...) — the one named exception to that gate:
--      PR-m's fresh recorded consent after a refusal, landing on `pending`.
--
-- Both RPCs key on public.normalize_channel_value(kind, value) — 00593's own
-- rule, in one function, so a channel row and its consent record can never land
-- on different keys (the RPC used to refuse an unparseable phone the channels
-- table deliberately keeps).
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
-- filtered.
--
-- THE INVARIANT: project_parties carries AFTER-row triggers that reach the
-- outside world, and a mirror write must fire none of them. A mirror write is
-- cache maintenance of a verdict decided elsewhere, never a studio act. So this
-- file REDEFINES BOTH of project_parties' outward-facing AFTER triggers to
-- stand down while the mirror is the one writing, reading one shared flag,
-- patina.suppress_consent_dispatch:
--
--   · fc_dispatch_optin_invite  — lineage 00432:27-68 (the grep-winner body,
--     verbatim below), trigger fc_optin_invite_dispatch created 00284:254-257.
--     Fires on an evidenced `pending`; sends the opt-in invite SMS.
--   · _site_request_consent_granted_dispatch — lineage 00374:3399-3444 (the
--     grep-winner body, verbatim below), trigger
--     site_request_consent_granted_dispatch created 00374:3446-3455. Fires when
--     sms_consent_status flips to `granted`; mints site-request dispatch work
--     and calls site-request-dispatch, which calls sendPartySms — a real text.
--
-- Before this file there was no studio-side path to `granted` at all (the
-- portal caps its own party-row write at `pending`), so the second trigger
-- could only ever fire from the recipient's own inbound YES/START. The mirror
-- creates that path, so the mirror has to close it. A designer writing an
-- evidenced `pending` (or a `granted`) onto a party row DIRECTLY still
-- dispatches, unchanged. Sending for a consent RECORD is W2's hook, once,
-- deliberately — not a trigger's fan-out. The invariant is restated as a
-- COMMENT on project_parties so the third such trigger cannot land unguarded.
--
-- THE WRITE DOOR IS A TRANSITION GATE, not just a value check.
-- record_channel_consent() is granted to every authenticated studio member, so
-- it has to enforce in SQL what the shipped portal enforces in TypeScript
-- (use-coordination.ts:519-522, :699-703, :721-733, :745):
--   · `pending`/`granted` require source + evidence + disclosure_version;
--     `opted_out` requires source + evidence (PR-m: a manual mark needs both).
--     `not_asked` is refused outright (R-AG) — it is the absence of a record,
--     not a verdict, and taking it was the one evidence-free door into this
--     table: four arguments erased a recorded grant and its whole 10DLC
--     evidence set, from the record and from every mirrored seat.
--   · Nothing leaves `opted_out` through this door — not to granted, not to
--     pending, not to not_asked. A STOP is the only stored record of a refusal
--     and the RPC may not erase it. PR-m's way back is a FRESH recorded
--     consent, which gets its own named door, record_channel_reconsent(),
--     landing on `pending` so the double opt-in still runs. Both doors state
--     that gate INSIDE the write (the upsert's DO UPDATE … WHERE, the UPDATE's
--     own WHERE) rather than as a read before it: a SELECT … FOR UPDATE locks
--     nothing when the row does not exist yet, and the inbound STOP rail writes
--     this table directly as service_role, so a refusal could land in the gap
--     and be overwritten by the grant that read past it.
--   · No write may EMPTY the evidence set: source / evidence /
--     disclosure_version / recorded_by keep what stands when the new verdict
--     does not restate them (R-AG). Laundering is closed by the evidence gate,
--     not by nulling — every status this door accepts must supply its own
--     source and evidence, so a status change has always restated them.
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

-- ── 3a. Teach BOTH outward-facing party triggers to stand down for a mirror ──
--
-- project_parties' non-internal trigger set, probed on the local stack:
--
--   set_updated_at_project_parties        update_updated_at_column        BEFORE
--   normalize_phone_project_parties       normalize_party_phone_e164      BEFORE
--   fc_optin_invite_dispatch              fc_dispatch_optin_invite        AFTER
--   site_request_consent_granted_dispatch _site_request_consent_granted_… AFTER
--
-- The two BEFORE triggers are pure row shaping. BOTH AFTER triggers reach the
-- outside world, and the mirror's UPDATE satisfies both of them — one on an
-- evidenced `pending`, one on any flip to `granted`. Guarding only the first
-- left a recorded `granted` minting site-request dispatch work and texting a
-- trade out of a cache write. Both are redefined here, from their grep-winner
-- bodies verbatim, with the same first-statement guard:
--
--   3a-1  fc_dispatch_optin_invite               lineage 00432:27-68
--   3a-2  _site_request_consent_granted_dispatch lineage 00374:3399-3444
--
-- patina.suppress_consent_dispatch is set (SET LOCAL, via set_config(...,true))
-- only by mirror_channel_consent_to_parties() below, around its own UPDATE, and
-- cleared immediately after it. AFTER-row triggers queued by that UPDATE fire
-- at the end of that statement, before the mirror's next statement, so the
-- window is exactly the mirror's own write and nothing else in the transaction.

-- ── 3a-1. The opt-in invite (lineage 00432:27-68, verbatim + one guard) ──────
-- Trigger fc_optin_invite_dispatch created at 00284:254-257.
CREATE OR REPLACE FUNCTION public.fc_dispatch_optin_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 00594: the mirror is maintaining the cached copy of a consent record that
  -- was already decided elsewhere. Mirroring a verdict is not asking for one.
  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
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
  'mirror_channel_consent_to_parties(), which sets patina.suppress_consent_dispatch '
  'for the duration of its own UPDATE — one recorded consent must not fan out '
  'into one text per party row on the number (00594).';

-- ── 3a-2. The site-request consent dispatch ─────────────────────────────────
-- Lineage: 00374:3399-3444 (current head — the body below is that body
-- verbatim), trigger site_request_consent_granted_dispatch created at
-- 00374:3446-3455 and left exactly as it is. Delta: one guard, first statement.
--
-- This one is the sharper of the two: it calls site_request_dispatch_after_consent()
-- (durable work, in-transaction) and then invoke_edge_function('site-request-dispatch',
-- …), whose handler calls sendPartySms — a real outbound text per awaiting_consent
-- request on the seat. The mirror's UPDATE flips sms_consent_status to 'granted'
-- on EVERY party row in the studio on that number, so one recorded grant fanned
-- out into one dispatch per open request per seat.
CREATE OR REPLACE FUNCTION public._site_request_consent_granted_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request record;
  v_dispatch jsonb;
BEGIN
  -- 00594: the mirror is maintaining the cached copy of a consent record that
  -- was already decided elsewhere. Mirroring a verdict is not asking for one,
  -- and it is not the moment a trade learns there is work waiting.
  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.sms_consent_status <> 'granted'
     OR OLD.sms_consent_status = 'granted' THEN
    RETURN NEW;
  END IF;

  FOR v_request IN
    SELECT id
    FROM public.site_requests
    WHERE assignee_party_id = NEW.id
      AND status = 'awaiting_consent'
    ORDER BY created_at
  LOOP
    -- Durable work is part of the same transaction as the consent update.
    -- The Edge invocation below is only an eager wake-up: pg_net can miss,
    -- retry, or arrive after a worker restart without stranding the request in
    -- awaiting_consent. The lifecycle sweep will claim this identifier-only
    -- row and mint a raw guest token only when an SMS attempt actually begins.
    v_dispatch := public.site_request_dispatch_after_consent(v_request.id);
    BEGIN
      PERFORM public.invoke_edge_function(
        'site-request-dispatch',
        jsonb_build_object(
          'action', 'consent-granted',
          'request_id', v_request.id,
          'party_id', NEW.id,
          'outbox_id', v_dispatch->>'outbox_id'
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'site request consent dispatch failed for request %: %',
        v_request.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._site_request_consent_granted_dispatch() IS
  'Releases site requests parked in awaiting_consent when the assignee''s '
  'consent turns granted (00374), and never for a write made by '
  'mirror_channel_consent_to_parties(), which sets patina.suppress_consent_dispatch '
  'for the duration of its own UPDATE — a cached verdict must not mint dispatch '
  'work or text a trade (00594).';

-- The invariant, on the table itself, so the third one cannot land unguarded.
COMMENT ON TABLE public.project_parties IS
  'Track 5 coordination courts (R46): GC / vendor / client_rep / other parties '
  'on a project. profile_id NULLABLE — v1 parties do NOT log in; the designer '
  'records their move via resolve_coordination_item. Setting profile_id later '
  'gives that party a real login (a flag flip, not a migration). vendor_id '
  'soft-links a known vendor; both back-links ON DELETE SET NULL so item/task '
  'court history survives (00212). '
  'sms_consent_* is a READ-ONLY CACHED MIRROR '
  'of studio_channel_consent since 00594, maintained by '
  'mirror_channel_consent_to_parties(). INVARIANT: any AFTER-row trigger added '
  'to this table that reaches outside the transaction (an SMS, an email, an '
  'edge invocation, durable dispatch work) MUST stand down when '
  'current_setting(''patina.suppress_consent_dispatch'', true) = ''1'' — that '
  'flag marks a mirror write, which is cache maintenance of a verdict already '
  'decided, never a studio act. Guarded so far: fc_dispatch_optin_invite, '
  '_site_request_consent_granted_dispatch.';

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
  PERFORM set_config('patina.suppress_consent_dispatch', '1', true);

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
     -- The whole cached tuple, not the status alone. Guarding on status only
     -- suppressed every EVIDENCE refresh too, so a row could sit at `granted`
     -- with NULL source / recorded_at / evidence — a state the portal's own
     -- write path cannot produce and project_parties has no CHECK against,
     -- and it is the 10DLC evidence for the send. Re-firing is already held
     -- off by patina.suppress_consent_dispatch above, so the narrow status
     -- test is no longer load-bearing.
     AND (pp.sms_consent_status, pp.sms_consented_at, pp.sms_opt_out_at,
          pp.sms_consent_source, pp.sms_consent_evidence,
          pp.sms_consent_recorded_at, pp.sms_consent_disclosure_version,
          pp.sms_consent_recorded_by)
         IS DISTINCT FROM
         (NEW.status, NEW.consented_at, NEW.opt_out_at,
          NEW.source, NEW.evidence,
          NEW.recorded_at, NEW.disclosure_version,
          NEW.recorded_by);

  PERFORM set_config('patina.suppress_consent_dispatch', '', true);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_channel_consent_to_parties() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.mirror_channel_consent_to_parties() IS
  'AFTER INSERT/UPDATE on studio_channel_consent: pushes the studio''s verdict '
  'onto every party row in that studio carrying the same phone_e164, making '
  'project_parties.sms_consent_* a read-only cached mirror. Guarded on the '
  'whole cached tuple (status AND the evidence set) so a re-record does not '
  'rewrite already-identical rows but DOES refresh evidence, and it sets '
  'patina.suppress_consent_dispatch for the duration of its own UPDATE so a '
  'mirrored verdict cannot fire 00432''s opt-in dispatch or 00374''s '
  'site-request dispatch once per row (00594).';

DROP TRIGGER IF EXISTS mirror_channel_consent_to_parties_trg ON public.studio_channel_consent;
CREATE TRIGGER mirror_channel_consent_to_parties_trg
  AFTER INSERT OR UPDATE ON public.studio_channel_consent
  FOR EACH ROW EXECUTE FUNCTION public.mirror_channel_consent_to_parties();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. record_channel_consent — the portal's only write path
-- ═══════════════════════════════════════════════════════════════════════════
-- Granted to every authenticated studio member, so this function IS the
-- policy. It enforces, in SQL, what the shipped portal enforces in TypeScript
-- (use-coordination.ts:519-522, :699-703, :721-733, :745):
--
--   1. EVIDENCE. `pending` and `granted` require source + evidence +
--      disclosure_version; `opted_out` requires source + evidence (PR-m: a
--      verbal STOP the studio heard is a real record, and needs to say who
--      heard it and when). Nothing else may claim consent. `not_asked` is
--      REFUSED outright (R-AG): it is the absence of a record, not a verdict,
--      and there is nothing to record. It stays a legal value in the CHECK
--      because the backfill mints it, and it stays a legal thing to READ — the
--      chip still prints "Not asked" — but no studio act may write it here.
--      Before R-AG the four-argument call record_channel_consent(org, 'sms',
--      number, 'not_asked') was the one door into this table that needed no
--      evidence at all, and it erased a recorded grant, its source, its words
--      and its disclosure version — from the record AND, through the mirror,
--      from every seat in the studio on that number.
--   2. TRANSITION. Nothing leaves `opted_out` through this door. Not to
--      granted (that is the recipient's to give), not to pending, and not to
--      not_asked — a STOP is the only stored record of a refusal and the RPC
--      may not erase it. PR-m's way back is a fresh recorded consent, which
--      has its own named door: record_channel_reconsent() below.
--
--      AND THE TWO DOORS COMPOSE. The gate above is stated on the row's
--      CURRENT status, so on its own it was walked around: reconsent() moves
--      the row opted_out -> pending, and a second call then found a row that is
--      no longer `opted_out` and wrote `granted` over it. Two calls, any
--      studio member, and a recorded STOP was back to granted with only
--      opt_out_at left behind — and the mirror cleared the party-row backstop
--      sendPartySms falls back on. So this door ALSO refuses `granted` while
--      an unanswered refusal stands: `opt_out_at IS NOT NULL` with no
--      `consented_at` after it. The answer is the recipient's, not the
--      studio's — an inbound YES/START, which the rail writes with a fresh
--      consented_at. What the studio may always do is record the fresh consent
--      it holds: reconsent() lands it on `pending`, which is exactly what the
--      double opt-in confirmation is for.
--   3. NO LAUNDERING, AND NO ERASURE. Every status this door still accepts
--      requires its own source and evidence, so a status change always
--      RESTATES them — a grant can never inherit the STOP's own words
--      ("Replied STOP", source inbound_sms) as the evidence a carrier audit
--      would be shown, because the caller had to type new words to get here.
--      And no write may empty the evidence set: source, evidence,
--      disclosure_version and recorded_by are COALESCEd over what stands, so a
--      verdict that does not restate a field keeps it rather than nulling it
--      (R-AG). The only field a change may legitimately omit is
--      disclosure_version on an `opted_out` — a refusal is not shown a
--      disclosure — and the version the person WAS shown when they consented
--      is a fact the audit still needs.
--
-- Dates still survive a verdict that does not restate them: "granted 2 May
-- 2025, opted out 3 Dec 2025" must both stay printable (R-Q).
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
  v_value  text;
  v_now    timestamptz := now();
  v_row    public.studio_channel_consent;
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
  -- R-AG. `not_asked` is the absence of a record; recording it is not an act
  -- the studio can perform, and taking it here destroys the evidence set both
  -- on the record and on every mirrored seat.
  IF p_status = 'not_asked' THEN
    RAISE EXCEPTION 'consent_not_recordable'
      USING HINT = 'There is nothing to record: not_asked is the absence of a '
                   'consent, not a verdict. Record the verdict that actually '
                   'happened (pending / granted / opted_out).';
  END IF;

  -- The channels table's own rule, shared: public.normalize_channel_value
  -- (00593). One function, both callers — so a channel row and its consent
  -- record cannot land on different keys.
  v_value := public.normalize_channel_value(p_channel_kind, p_channel_value);
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_value';
  END IF;

  -- ── 1. Evidence ───────────────────────────────────────────────────────────
  IF p_status IN ('pending', 'granted') THEN
    IF COALESCE(btrim(p_source), '') = ''
       OR COALESCE(btrim(p_evidence), '') = ''
       OR COALESCE(btrim(p_disclosure_version), '') = '' THEN
      RAISE EXCEPTION 'consent_evidence_required'
        USING HINT = 'pending and granted need a source, the evidence in words, '
                     'and the disclosure version the person was shown.';
    END IF;
  ELSIF p_status = 'opted_out' THEN
    IF COALESCE(btrim(p_source), '') = ''
       OR COALESCE(btrim(p_evidence), '') = '' THEN
      RAISE EXCEPTION 'consent_evidence_required'
        USING HINT = 'Marking a refusal needs a source and the evidence in words (PR-m).';
    END IF;
  END IF;

  -- ── 2. Transition — stated INSIDE the write, never as a read before it ───
  -- A `SELECT … FOR UPDATE` ahead of the upsert locks NOTHING when no row
  -- exists yet, and the first record on a channel is exactly the contested
  -- case: the inbound STOP rail upserts this table directly as service_role
  -- (sms-inbound/pipeline.ts writeChannelConsent), so it could land `opted_out`
  -- in the gap between that read and the upsert — and the upsert would then
  -- take the DO UPDATE branch and write `granted` straight over a refusal that
  -- was already on the books, leaving only opt_out_at behind and mirroring the
  -- grant onto every seat in the studio on that number.
  --
  -- ON CONFLICT DO UPDATE re-reads the LATEST row version and re-evaluates its
  -- own WHERE, so the rule belongs there: the write either happens or returns
  -- nothing, and nothing returned IS the refusal (the IF NOT FOUND below).
  -- Re-recording a refusal on a refusal is still allowed — hence the
  -- EXCLUDED.status leg.
  --
  -- The SECOND leg of that WHERE is the two doors composed. A gate stated on
  -- the row's CURRENT status alone was walked around in two calls, by any
  -- studio member: record_channel_reconsent() moves the row opted_out ->
  -- pending (it is meant to — granted is the recipient's to give), and this
  -- door then saw a row that is no longer `opted_out` and wrote `granted` over
  -- it, leaving opt_out_at as the only trace and clearing, through the mirror,
  -- the party-row backstop sendPartySms falls back on. So `granted` is also
  -- refused while an UNANSWERED refusal stands: opt_out_at set with no
  -- consented_at after it. What answers a refusal is the recipient's own YES
  -- or START, which the inbound rail writes directly with a fresh consented_at
  -- (sms-inbound/pipeline.ts writeChannelConsent); after that,
  -- consented_at > opt_out_at and this door opens again. A record already AT
  -- `granted` may still restate its evidence — the number is sendable either
  -- way, and refusing there would strand a folded row whose dates disagree
  -- with its status, since reconsent() requires status = 'opted_out' and would
  -- have no door left to offer.

  -- ── 3. Write ──────────────────────────────────────────────────────────────
  -- No write may empty the evidence set (R-AG): each of source, evidence,
  -- disclosure_version and recorded_by keeps what stands when the new verdict
  -- does not restate it. Laundering is closed by the evidence gate above
  -- rather than by nulling — every status this door accepts must supply its
  -- own source and evidence, so a status CHANGE has already restated them by
  -- the time it reaches here.
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
      recorded_by        = COALESCE(EXCLUDED.recorded_by, scc.recorded_by),
      -- The origin follows the CURRENT verdict, in both writers (the inbound
      -- rail agrees: pipeline.ts writes t.projectId ?? prior). R-Q's sentence
      -- names the job the verdict on the books came from, not an older one.
      origin_project_id  = COALESCE(EXCLUDED.origin_project_id, scc.origin_project_id)
  WHERE (scc.status IS DISTINCT FROM 'opted_out'
         OR EXCLUDED.status = 'opted_out')
    AND (EXCLUDED.status <> 'granted'
         OR scc.status = 'granted'
         OR scc.opt_out_at IS NULL
         OR (scc.consented_at IS NOT NULL AND scc.consented_at > scc.opt_out_at))
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Nothing was written. Re-read the row the conflict landed on purely to
    -- say WHICH leg refused; the write is already decided either way.
    SELECT * INTO v_row
      FROM public.studio_channel_consent scc
     WHERE scc.organization_id = p_organization_id
       AND scc.channel_kind    = p_channel_kind
       AND scc.channel_value   = v_value;

    IF v_row.status = 'opted_out' THEN
      RAISE EXCEPTION 'channel_opted_out'
        USING HINT = 'This number or address already opted out. Only they can '
                     'rejoin by replying START, or the studio can record a fresh '
                     'consent through record_channel_reconsent().';
    END IF;

    RAISE EXCEPTION 'consent_awaiting_recipient'
      USING HINT = 'A refusal on this channel has not been answered yet. The '
                   'fresh consent is recorded (pending); granted is the '
                   'recipient''s to give, by replying YES or START.';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_channel_consent(uuid, text, text, text, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_channel_consent(uuid, text, text, text, text, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_channel_consent(uuid, text, text, text, text, text, text, uuid) IS
  'The one write path into studio_channel_consent for the portal. Studio-member '
  'gated (not_a_studio_member); requires source + evidence + disclosure_version '
  'for pending/granted and source + evidence for opted_out '
  '(consent_evidence_required); REFUSES not_asked outright '
  '(consent_not_recordable — there is nothing to record, R-AG); refuses every '
  'transition OUT of opted_out (channel_opted_out — record_channel_reconsent() '
  'is the named way back, PR-m), and states that gate inside the upsert''s '
  'DO UPDATE … WHERE so a concurrent STOP cannot land in a read-then-write '
  'window; also refuses `granted` while a refusal stands unanswered — '
  'opt_out_at set with no later consented_at (consent_awaiting_recipient) — so '
  'reconsent() plus a grant cannot compose their way back to granted without '
  'the recipient''s own YES or START; never empties the evidence set — source, '
  'evidence, disclosure_version and recorded_by are kept when the new verdict '
  'does not restate them, and laundering is closed by the evidence gate, since '
  'every accepted status must supply its own source and evidence; normalises '
  'the channel value through normalize_channel_value(); stamps '
  'recorded_by/recorded_at; and keeps an earlier granted/opt-out date when the '
  'new verdict does not restate it (00594).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. record_channel_reconsent — PR-m's named way back from a STOP
-- ═══════════════════════════════════════════════════════════════════════════
-- PR-m: "The way back is always a fresh recorded consent or an inbound START."
-- The inbound START is the rail's own path. This is the other one, and it is
-- deliberately a SEPARATE, named door rather than a fourth argument to
-- record_channel_consent: superseding a refusal is not the same act as
-- recording one, it must be visible in the audit, and it must not be reachable
-- by a caller that merely got the status string wrong.
--
-- It lands on `pending`, never `granted`. The person said stop; the studio now
-- holds fresh prior express consent, which is exactly the state the double
-- opt-in confirmation exists for. `granted` stays the recipient's to give, by
-- replying YES or START — and that holds THROUGH this door, not merely at it:
-- record_channel_consent() refuses `granted` while the refusal this door
-- superseded is still unanswered (opt_out_at set, no later consented_at), so
-- the pair reconsent() -> record_channel_consent('granted') cannot walk a STOP
-- back to granted in two calls. The answer has to arrive on the inbound rail. (The invite itself is W2's hook on the consent record
-- — the mirror still suppresses the per-row trigger fan-out.)
CREATE OR REPLACE FUNCTION public.record_channel_reconsent(
  p_organization_id    uuid,
  p_channel_kind       text,
  p_channel_value      text,
  p_source             text,
  p_evidence           text,
  p_disclosure_version text,
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

  IF COALESCE(btrim(p_source), '') = ''
     OR COALESCE(btrim(p_evidence), '') = ''
     OR COALESCE(btrim(p_disclosure_version), '') = '' THEN
    RAISE EXCEPTION 'consent_evidence_required'
      USING HINT = 'Superseding a refusal needs a source, the evidence in words, '
                   'and the disclosure version the person was shown.';
  END IF;

  v_value := public.normalize_channel_value(p_channel_kind, p_channel_value);
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_value';
  END IF;

  -- The mirror image of record_channel_consent's gate, stated the same way:
  -- inside the write. A read-then-check here had the same window in reverse —
  -- the read saw `opted_out`, a concurrent writer moved the row, and this
  -- UPDATE then superseded a refusal that was no longer on the books. In READ
  -- COMMITTED an UPDATE re-reads the row it blocked on and re-applies its own
  -- WHERE, so `AND scc.status = 'opted_out'` IS the gate and zero rows returned
  -- is the refusal.
  UPDATE public.studio_channel_consent scc
     SET status             = 'pending',
         -- opt_out_at is KEPT. The room still has to be able to say "opted out
         -- by text, 3 Dec 2025" alongside the fresh consent that superseded it.
         source             = p_source,
         evidence           = p_evidence,
         recorded_at        = v_now,
         disclosure_version = p_disclosure_version,
         recorded_by        = auth.uid(),
         origin_project_id  = COALESCE(p_origin_project_id, scc.origin_project_id)
   WHERE scc.organization_id = p_organization_id
     AND scc.channel_kind    = p_channel_kind
     AND scc.channel_value   = v_value
     AND scc.status          = 'opted_out'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_opt_out_to_supersede'
      USING HINT = 'There is no refusal on the books for this channel. Record '
                   'the consent through record_channel_consent() instead.';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_channel_reconsent(uuid, text, text, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_channel_reconsent(uuid, text, text, text, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_channel_reconsent(uuid, text, text, text, text, text, uuid) IS
  'PR-m''s named way back from a recorded opt-out: a FRESH recorded consent, '
  'with source + evidence + disclosure_version all required. Refuses unless the '
  'channel is currently opted_out (no_opt_out_to_supersede — the condition is in '
  'the UPDATE''s own WHERE, so a concurrent writer cannot move the row out from '
  'under it). Lands on `pending`, '
  'never `granted` — granted stays the recipient''s to give by replying YES or '
  'START, which record_channel_consent enforces on the far side too '
  '(consent_awaiting_recipient) so the two doors cannot compose their way past '
  'a STOP — and keeps opt_out_at so the refusal it superseded stays printable '
  '(00594).';
