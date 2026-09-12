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
--   5. record_channel_reconsent(...) — the one named door beside that gate:
--      PR-m's fresh recorded consent after a refusal, written as EVIDENCE onto
--      a record that stays `opted_out` (r7 M7-2). It does not move the status
--      and does not run the double opt-in; only the recipient's YES/START on
--      the inbound rail reopens sending.
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
-- OUTSIDE WORLD, and a mirror write must fire none of them. A mirror write is
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
-- IT IS AN INVARIANT ABOUT SENDING, NOT ABOUT WORK. Standing the triggers down
-- wholesale also stranded the DURABLE half: 00374's trigger is the only caller
-- of site_request_dispatch_after_consent(), and the lifecycle sweep only
-- promotes requests that already hold an outbox row. So a seat the mirror moved
-- to `granted` — every sibling seat an inbound YES covers beyond the ones it
-- transitioned itself, and every seat of a studio-recorded grant — read
-- `granted` while its site request sat in awaiting_consent for ever, its
-- consent_status_snapshot still saying not_asked. The mirror therefore carries
-- its own narrow release: for the seats it just moved onto `granted` it calls
-- site_request_dispatch_after_consent() directly, and ONLY that — no
-- invoke_edge_function. Snapshot and outbox row land in this transaction; the
-- eager wake-up, the one outward act, stays with the party-row trigger, and the
-- lifecycle sweep carries the outbox row the ordinary way. (The inbound rail
-- also writes the party rows FIRST, so on a YES/START the real transition fires
-- the real trigger and the mirror's release finds nothing left to do.)
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
--     and the RPC may not erase it. And `granted` is refused for as long as
--     refusal_unanswered stands — a STORED FACT, raised by every writer that
--     records a refusal and lowered by NOTHING THIS FILE'S RPCs CAN WRITE
--     (r7 M7-1): only the inbound rail's own service_role write, made when the
--     recipient texts YES or START. It is a column rather than a test
--     on opt_out_at because a refusal is routinely DATELESS (the shipped portal
--     writes opted_out party rows with a NULL sms_opt_out_at on purpose, and the
--     fold mints those records verbatim), and a date test failed OPEN for
--     exactly that population: reconsent() plus a grant walked a real STOP back
--     to `granted` in two calls. PR-m's way back is a FRESH recorded
--     consent, which gets its own named door, record_channel_reconsent() —
--     and that door is EVIDENCE-ONLY (r7 M7-2). It writes the studio's fresh
--     consent onto the record and LEAVES the record at `opted_out`, refusal
--     standing. After r6's M6-3 fix an unanswered refusal refuses EVERY send,
--     the opt-in invite included, so a door that moved the row to `pending`
--     sent nothing, cleared the seats' own backstop through the mirror, and
--     could not be called again (it needs `opted_out`) — the studio was
--     strictly worse off for using it. Sending resumes on the recipient's
--     YES/START and on nothing a studio can type. Both doors state
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

  -- "a refusal stands on this record that the person who made it has not
  -- answered". A FACT, not an inference from a nullable date — see the header.
  refusal_unanswered boolean NOT NULL DEFAULT false,

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

-- CREATE TABLE IF NOT EXISTS skips the body on a rerun, so the column is also
-- stated as an ALTER (the 00592/00593 idiom).
ALTER TABLE public.studio_channel_consent
  ADD COLUMN IF NOT EXISTS refusal_unanswered boolean NOT NULL DEFAULT false;

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
COMMENT ON COLUMN public.studio_channel_consent.refusal_unanswered IS
  'TRUE while a refusal stands that the person who made it has not answered. '
  'Set by every writer that records a refusal (the fold, record_channel_consent, '
  'record_channel_reconsent, the inbound STOP rail) and cleared by ONE writer: '
  'the inbound rail''s own service_role write, made when the recipient replies '
  'YES or START (sms-inbound/pipeline.ts writeChannelConsent). No RPC in this '
  'file lowers it (r7 M7-1 — the upsert used to exempt a record already AT '
  '`granted` from the gate and then set the flag false on that very write, so '
  'one ordinary granted-on-granted call by any studio member turned sending '
  'back on for a folded row carrying an unanswered refusal, with no recipient '
  'involved). '
  'record_channel_consent refuses every verdict but opted_out while it stands, '
  'so reconsent() plus a recorded grant cannot compose their way past a STOP. It is a stored FACT '
  'rather than a test on opt_out_at, because a refusal is routinely dateless: '
  'the shipped portal writes opted_out party rows with a NULL sms_opt_out_at on '
  'purpose (use-coordination.ts — "opted out, date unknown" is the truth), every '
  'pre-00432 row carries no date either, and the fold mints those records '
  'verbatim. Inferring the refusal from the date failed OPEN for exactly that '
  'population.';

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
      consented_at, opt_out_at, refusal_unanswered, source, evidence,
      recorded_at, disclosure_version, recorded_by, origin_project_id
    )
    SELECT org, 'sms', phone_e164, sms_consent_status,
           sms_consented_at, sms_opt_out_at,
           -- An unanswered refusal is recorded as a FACT here, never inferred
           -- later from opt_out_at: a folded `opted_out` row is routinely
           -- DATELESS (the shipped portal writes one deliberately —
           -- use-coordination.ts; so does every pre-00432 row), and a gate that
           -- read the date failed open for that whole population. A row that is
           -- not opted_out still counts as an unanswered refusal when it carries
           -- an opt-out date no later consent has answered — INCLUDING a winner
           -- whose status reads `granted` (r7 M7-1, ruled here). A legacy seat
           -- saying granted while carrying a dated opt-out and no later
           -- consented_at is contradictory data, and the refusal is the half
           -- that fails closed: the record is minted UNSENDABLE and only the
           -- recipient's own YES/START reopens it.
           (sms_consent_status = 'opted_out'
            OR (sms_opt_out_at IS NOT NULL
                AND (sms_consented_at IS NULL OR sms_consented_at <= sms_opt_out_at))),
           sms_consent_source,
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
  'most recent granted, then pending, then not_asked. Stamps '
  'refusal_unanswered on any folded refusal, dated or not, so the granted door '
  'fails closed for the dateless opted_out rows the shipped portal writes on '
  'purpose. Idempotent — ON CONFLICT '
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
  '_site_request_consent_granted_dispatch. The invariant is about SENDING: '
  'mirror_channel_consent_to_parties() still releases the site requests parked '
  'on the seats it moves to granted, by calling '
  'site_request_dispatch_after_consent() itself — durable, in-transaction, no '
  'edge invocation.';

-- ── 3b. The mirror ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mirror_channel_consent_to_parties()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_newly_granted uuid[];
  v_request       uuid;
BEGIN
  IF NEW.channel_kind <> 'sms' THEN
    RETURN NEW;
  END IF;

  -- The seats this write is about to move ONTO `granted`, captured before the
  -- UPDATE because after it they all read granted. See the release loop below.
  IF NEW.status = 'granted' THEN
    SELECT array_agg(pp.id)
      INTO v_newly_granted
      FROM public.project_parties pp
      JOIN public.projects p ON p.id = pp.project_id
     WHERE pp.phone_e164 = NEW.channel_value
       AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
           = NEW.organization_id
       AND pp.sms_consent_status IS DISTINCT FROM 'granted';
  END IF;

  -- Transaction-local, cleared below: fc_dispatch_optin_invite (redefined in
  -- 3a) reads this and returns without dispatching. Without it, one recorded
  -- `pending` becomes one real opt-in SMS per party row on the number.
  PERFORM set_config('patina.suppress_consent_dispatch', '1', true);

  -- THE VERDICT IS COPIED; THE DATES AND THE EVIDENCE ARE COALESCED, PER
  -- COLUMN (r5 M5-2, ruling R-AN; r6 M6-2 for the two dates). A record can
  -- carry a verdict without carrying every evidence column — the inbound rail
  -- mints one from a YES on a number whose evidence so far lives only on the
  -- seat — and before this, the mirror wrote those NULLs down over a disclosure
  -- version and a recorder the portal had recorded. That is the same
  -- hollow-evidence state r2 M-1 closed, arriving from the other side: the
  -- 10DLC evidence for the send cannot be erased by a write that simply did
  -- not restate it. So the mirror never overwrites a non-null evidence column
  -- with NULL; the record's own door (record_channel_consent) already refuses
  -- to empty the set.
  --
  -- THE SAME IS TRUE OF THE TWO DATES, and for the same reason (r6 M6-2). A
  -- record carrying a verdict without an opt_out_at is the ordinary case —
  -- every record record_channel_consent mints for pending or granted, and
  -- every record the inbound rail mints for a number with no prior row — and
  -- copying it straight wrote NULL over a real, dated refusal on every seat in
  -- the studio. The RPC goes to trouble to keep both dates on the RECORD
  -- ("granted 2 May 2025, opted out 3 Dec 2025" must both stay printable, R-Q)
  -- and the mirror must not destroy the pair on the seats. So each date keeps
  -- what stands when the new verdict does not restate it. The verdict itself
  -- is still copied — the status is the fact the record owns.
  UPDATE public.project_parties pp
     SET sms_consent_status             = NEW.status,
         sms_consented_at               = COALESCE(NEW.consented_at, pp.sms_consented_at),
         sms_opt_out_at                 = COALESCE(NEW.opt_out_at, pp.sms_opt_out_at),
         sms_consent_source             = COALESCE(NEW.source, pp.sms_consent_source),
         sms_consent_evidence           = COALESCE(NEW.evidence, pp.sms_consent_evidence),
         sms_consent_recorded_at        = COALESCE(NEW.recorded_at, pp.sms_consent_recorded_at),
         sms_consent_disclosure_version = COALESCE(NEW.disclosure_version, pp.sms_consent_disclosure_version),
         sms_consent_recorded_by        = COALESCE(NEW.recorded_by, pp.sms_consent_recorded_by)
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
     -- test is no longer load-bearing. Compared against the values this write
     -- would actually leave, so a NULL the COALESCE is not going to write no
     -- longer counts as a difference.
     AND (pp.sms_consent_status, pp.sms_consented_at, pp.sms_opt_out_at,
          pp.sms_consent_source, pp.sms_consent_evidence,
          pp.sms_consent_recorded_at, pp.sms_consent_disclosure_version,
          pp.sms_consent_recorded_by)
         IS DISTINCT FROM
         (NEW.status,
          COALESCE(NEW.consented_at, pp.sms_consented_at),
          COALESCE(NEW.opt_out_at, pp.sms_opt_out_at),
          COALESCE(NEW.source, pp.sms_consent_source),
          COALESCE(NEW.evidence, pp.sms_consent_evidence),
          COALESCE(NEW.recorded_at, pp.sms_consent_recorded_at),
          COALESCE(NEW.disclosure_version, pp.sms_consent_disclosure_version),
          COALESCE(NEW.recorded_by, pp.sms_consent_recorded_by));

  PERFORM set_config('patina.suppress_consent_dispatch', '', true);

  -- ── The narrow release path ───────────────────────────────────────────────
  -- The suppression above is about OUTWARD acts: a cached verdict must not text
  -- anyone. It is not a reason to strand durable work. 00374's trigger is the
  -- only caller of site_request_dispatch_after_consent(), and the lifecycle
  -- sweep only promotes requests that already hold an outbox row — so a seat
  -- this write moved to `granted` whose site request is parked in
  -- awaiting_consent stayed parked FOR EVER, reading `granted` with a
  -- consent_status_snapshot still saying not_asked. That is the studio-side
  -- grant (record_channel_consent) and every sibling seat an inbound YES covers
  -- beyond the ones it transitioned itself.
  --
  -- So the mirror releases them itself, and releases them the durable way only:
  -- site_request_dispatch_after_consent() stamps the snapshot and mints the
  -- 'consent-granted' outbox row, all inside this transaction. It does NOT call
  -- invoke_edge_function — the eager wake-up is the one outward act, and it
  -- stays with the party-row trigger. The lifecycle sweep claims the outbox row
  -- the ordinary way.
  --
  -- Idempotent against the party-first path the inbound rail uses: when the
  -- party write already moved the seat, v_newly_granted does not contain it,
  -- and consent_status_snapshot already reads granted.
  IF v_newly_granted IS NOT NULL THEN
    FOR v_request IN
      SELECT sr.id
        FROM public.site_requests sr
       WHERE sr.assignee_party_id = ANY (v_newly_granted)
         AND sr.status = 'awaiting_consent'
         AND sr.consent_status_snapshot IS DISTINCT FROM 'granted'
       ORDER BY sr.created_at
    LOOP
      BEGIN
        PERFORM public.site_request_dispatch_after_consent(v_request);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'mirrored consent could not release site request %: %',
          v_request, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_channel_consent_to_parties() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.mirror_channel_consent_to_parties() IS
  'AFTER INSERT/UPDATE on studio_channel_consent: pushes the studio''s verdict '
  'onto every party row in that studio carrying the same phone_e164, making '
  'project_parties.sms_consent_* a read-only cached mirror. Guarded on the '
  'whole cached tuple (status AND the evidence set) so a re-record does not '
  'rewrite already-identical rows but DOES refresh evidence — refresh, never '
  'erase: each evidence column is COALESCEd over what the seat holds, so a '
  'record that carries a verdict without a disclosure version or a recorder '
  '(the shape the inbound rail mints) cannot null the ones the portal recorded '
  '(R-AN). It also sets '
  'patina.suppress_consent_dispatch for the duration of its own UPDATE so a '
  'mirrored verdict cannot fire 00432''s opt-in dispatch or 00374''s '
  'site-request dispatch once per row. A mirrored `granted` DOES release the '
  'site requests parked in awaiting_consent on the seats it just moved — '
  'site_request_dispatch_after_consent() only, never invoke_edge_function, so '
  'the durable work lands in this transaction and the lifecycle sweep carries '
  'it out; without that a studio-recorded grant left the seat reading granted '
  'and its request parked for ever (00594).';

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
--   2. TRANSITION — AND IT READS BOTH LEDGERS, AND IT ASKS ONE QUESTION.
--      The send gate refuses on the record OR on a refusal standing on one of
--      this studio's own party rows; this door does the same (R-AL), because
--      until PR-x retires those writes a refusal can stand on a seat with no
--      record behind it, and granting over it also cleared — through the mirror
--      — the very seat the send gate would have tested. The seat test asks what
--      the send gate asks and nothing more: `sms_consent_status = 'opted_out'`,
--      in this org, DATED OR NOT (r6 M6-1 — orgHasOptedOutParty has no date
--      test, the shipped portal writes dateless refusals on purpose, and every
--      pre-00432 row is dateless).
--
--      Nothing leaves `opted_out` through this door. Not to granted (that is
--      the recipient's to give), not to pending, and not to not_asked — a STOP
--      is the only stored record of a refusal and the RPC may not erase it.
--      PR-m's way back is a fresh recorded consent, which has its own named
--      door: record_channel_reconsent() below.
--
--      AND THE TWO DOORS COMPOSED. The gate above is stated on the row's
--      CURRENT status, so on its own it was walked around: reconsent() USED TO
--      move the row opted_out -> pending (it no longer moves the status at all,
--      r7 M7-2), and a second call then found a row that is
--      no longer `opted_out` and wrote `granted` over it. Two calls, any
--      studio member, and a recorded STOP was back to granted with only
--      opt_out_at left behind — and the mirror cleared the party-row backstop
--      sendPartySms falls back on. So this door ALSO refuses while an
--      unanswered refusal stands — refusal_unanswered TRUE, or an opt_out_at
--      with no later consented_at. The answer is the recipient's, not the
--      studio's — an inbound YES/START, which the rail writes with a fresh
--      consented_at.
--
--      THE GATE IS ON THE REFUSAL, NOT ON THE VERDICT (r6 B6-1). Stated as
--      "refuse `granted`", it left `pending` as a free first hop: a recorded
--      `pending` mirrored `pending` and a NULL opt_out_at onto the seats,
--      erasing the refusal and its date, and the `granted` behind it then
--      passed every leg — strictly worse than the composition above, because
--      reconsent() cannot recover a row that no longer says opted_out. So every
--      verdict but `opted_out` is tested. The one act always open to the studio
--      is recording the refusal it is holding; the fresh consent it holds goes
--      on the record through reconsent(), as EVIDENCE beside the refusal (r7
--      M7-2 — no double opt-in runs from there), and the answer stays the
--      recipient's.
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
  v_value         text;
  v_now           timestamptz := now();
  v_row           public.studio_channel_consent;
  v_seat_refusal  boolean := false;
  v_record_status text;
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

  -- ── 2a. The refusal that lives only on a seat (r5 B5-1, ruling R-AL) ─────
  -- The gate below reads the RECORD. The send gate reads BOTH — the record and
  -- this studio's own party rows (_shared/sms.ts orgHasOptedOutParty), because
  -- project_parties.sms_consent_* is still writable by the portal (PR-x has not
  -- retired those writes) and a refusal can therefore stand on a seat with no
  -- record behind it at all: PR-m's manually marked verbal STOP, the phone-edit
  -- path's revertsToOptedOut (use-coordination.ts:596-620), any seat that goes
  -- opted_out after the fold. Reading only the record, this door wrote `granted`
  -- straight over such a refusal — and the mirror then cleared the very party
  -- row the send gate was going to test, so one RPC call by any studio member
  -- turned a refusal into a sendable number with no trace left.
  --
  -- So the write door reads the same two ledgers the read door does. Scoped to
  -- THIS org, resolved the way the mirror resolves it, so R-AK is not reopened:
  -- another studio's STOP is not this studio's fact.
  --
  -- The way past is not a second call to this door: the studio records the
  -- refusal it is holding (status opted_out, with its own evidence), which puts
  -- the fact on the books where reconsent() and the recipient's own YES/START
  -- can act on it.
  --
  -- TWO NARROWINGS ARE GONE (r6 B6-1 / M6-1), because both were walkable.
  --
  --   THE VERDICT. The gate asked `p_status = 'granted'`, so `pending` was an
  --   ungated first hop: one recorded `pending` over a dated, evidenced seat
  --   refusal mirrored `pending` and a NULL opt_out_at back onto the seat,
  --   erasing the refusal and its date, and the `granted` call after it then
  --   passed every leg. Two ordinary calls by any studio member walked a real
  --   inbound STOP back to granted with no trace on either ledger, and
  --   reconsent() could not recover it (it requires status opted_out). So the
  --   gate asks whether a REFUSAL STANDS, not which verdict is being written:
  --   everything but `opted_out` is tested. Recording the refusal is always
  --   allowed — that is the way forward, not around.
  --
  --   THE DATE. The gate also required `sms_opt_out_at IS NOT NULL`, so it
  --   failed OPEN for a DATELESS refusal — which is the shape the shipped
  --   portal writes on purpose (use-coordination.ts: "opted out, date unknown"
  --   is the truth) and the shape every pre-00432 row carries. That is the very
  --   population r4's B-1 forced the RECORD-level test off dates for, which is
  --   why refusal_unanswered exists; the seat test kept the date and kept the
  --   hole. And the SEND gate this door is meant to mirror
  --   (_shared/sms.ts orgHasOptedOutParty) filters on sms_consent_status alone
  --   with no date test at all. So the write door now asks exactly the question
  --   the read door asks.
  IF p_status <> 'opted_out' THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.project_parties pp
        JOIN public.projects p ON p.id = pp.project_id
       WHERE pp.phone_e164 = v_value
         AND pp.sms_consent_status = 'opted_out'
         AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
             = p_organization_id
    ) INTO v_seat_refusal;

    SELECT scc.status INTO v_record_status
      FROM public.studio_channel_consent scc
     WHERE scc.organization_id = p_organization_id
       AND scc.channel_kind    = p_channel_kind
       AND scc.channel_value   = v_value;

    IF v_seat_refusal AND v_record_status IS DISTINCT FROM 'opted_out' THEN
      RAISE EXCEPTION 'channel_opted_out'
        USING HINT = 'A seat in this studio on this number is marked opted out. '
                     'Record that refusal here first (status opted_out, with the '
                     'evidence); record_channel_reconsent() then puts your fresh '
                     'consent on the record, and the grant stays the '
                     'recipient''s to give by replying YES or START.';
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
  -- studio member: record_channel_reconsent() USED TO move the row opted_out ->
  -- pending (since r7 M7-2 it writes evidence only and leaves the status), and
  -- this door then saw a row that is no longer `opted_out` and wrote `granted` over
  -- it, leaving opt_out_at as the only trace and clearing, through the mirror,
  -- the party-row backstop sendPartySms falls back on. So every verdict but
  -- `opted_out` is refused while an UNANSWERED refusal stands (r6 B6-1 — read
  -- on the refusal, never on which verdict the caller happens to be writing;
  -- `pending` mirrors onto the seats exactly as `granted` does).
  --
  -- THAT IS READ OFF refusal_unanswered, A STORED FACT — never inferred from
  -- opt_out_at alone. A refusal is routinely DATELESS: the shipped portal
  -- writes opted_out party rows with a NULL sms_opt_out_at deliberately
  -- (use-coordination.ts — "opted out, date unknown" is the truth), every
  -- pre-00432 row carries no date either, and
  -- backfill_channel_consent_from_parties() folds that population verbatim. A
  -- date test therefore failed OPEN for exactly the records the first prod fold
  -- mints: reconsent() and then this door walked a real STOP back to `granted`
  -- in two calls. The date test is KEPT alongside the flag, so a service_role
  -- writer that dates a refusal without raising the flag still fails closed.
  -- What answers a refusal is the recipient's own YES or START, which the
  -- inbound rail writes directly — lowering the flag and stamping a fresh
  -- consented_at (sms-inbound/pipeline.ts writeChannelConsent); after that this
  -- door opens again. NOTHING HERE LOWERS IT (r7 M7-1). A record already AT
  -- `granted` used to be exempt from this gate so it could restate its
  -- evidence, and the write that came through then set the flag FALSE — one
  -- ordinary granted-on-granted call by any member, no recipient involved, and
  -- the send gate (channelConsentVerdict, which refuses on this flag since r6
  -- M6-3) opened. The first prod fold mints exactly that row: a legacy seat
  -- reading `granted` with a stale, unanswered opt-out. So the exemption is
  -- gone and this door never lowers the flag. Such a row is not stranded:
  -- recording the REFUSAL is always open — it is the way forward — and from
  -- there record_channel_reconsent() puts the studio's fresh consent on the
  -- record. What makes the number sendable again is the recipient's answer.

  -- ── 3. Write ──────────────────────────────────────────────────────────────
  -- No write may empty the evidence set (R-AG): each of source, evidence,
  -- disclosure_version and recorded_by keeps what stands when the new verdict
  -- does not restate it. Laundering is closed by the evidence gate above
  -- rather than by nulling — every status this door accepts must supply its
  -- own source and evidence, so a status CHANGE has already restated them by
  -- the time it reaches here.
  INSERT INTO public.studio_channel_consent AS scc (
    organization_id, channel_kind, channel_value, status,
    consented_at, opt_out_at, refusal_unanswered,
    source, evidence, recorded_at, disclosure_version, recorded_by,
    origin_project_id
  )
  VALUES (
    p_organization_id, p_channel_kind, v_value, p_status,
    CASE WHEN p_status = 'granted'   THEN v_now END,
    CASE WHEN p_status = 'opted_out' THEN v_now END,
    p_status = 'opted_out',
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
      -- A refusal raises the flag; NO verdict written through this door lowers
      -- it (r7 M7-1). Only the inbound rail's own write does, when the person
      -- who refused answers. A studio re-recording the consent it holds —
      -- `granted` or `pending` — does not answer the refusal, and the WHERE
      -- below means the only writes that reach here while one stands are the
      -- refusals themselves.
      refusal_unanswered = CASE WHEN EXCLUDED.status = 'opted_out' THEN true
                                ELSE scc.refusal_unanswered END,
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
    -- Stated on whether a refusal STANDS, not on which verdict is written
    -- (r6 B6-1). `EXCLUDED.status <> 'granted'` let `pending` through while an
    -- unanswered refusal stood, and a `pending` that lands is a `pending` the
    -- mirror stamps on every seat in the studio — the backstop gone, and the
    -- record moved off the status reconsent() needs to act on. Only `opted_out`
    -- is exempt: recording the refusal is the way forward. A record already at
    -- `granted` is NOT exempt either (r7 M7-1): the escape that let it restate
    -- its evidence was the one write that lowered the flag, and the fold mints
    -- the row it fired on.
    AND (EXCLUDED.status = 'opted_out'
         OR (scc.refusal_unanswered IS NOT TRUE
             AND (scc.opt_out_at IS NULL
                  OR (scc.consented_at IS NOT NULL
                      AND scc.consented_at > scc.opt_out_at))))
    -- 2a's seat test again, inside the write. The check above is what refuses
    -- the INSERT case (no record yet, refusal on a seat only); this leg is the
    -- same rule where the row already exists, so a seat marked opted_out
    -- between that read and this write cannot be written over either. Same two
    -- narrowings removed: every verdict but `opted_out` is tested (r6 B6-1),
    -- and a DATELESS refusal counts (r6 M6-1) — it is what the portal really
    -- writes and what the send gate really reads.
    AND (EXCLUDED.status = 'opted_out'
         OR NOT EXISTS (
              SELECT 1
                FROM public.project_parties pp
                JOIN public.projects p ON p.id = pp.project_id
               WHERE pp.phone_e164 = scc.channel_value
                 AND pp.sms_consent_status = 'opted_out'
                 AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
                     = scc.organization_id))
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
                     'rejoin, by replying START. record_channel_reconsent() puts '
                     'the studio''s fresh consent on the record — the refusal '
                     'keeps standing until they answer.';
    END IF;

    -- The seat leg (2a) raced in between: name it for what it is rather than
    -- letting it print as an unanswered refusal on the record.
    IF p_status <> 'opted_out' AND EXISTS (
         SELECT 1
           FROM public.project_parties pp
           JOIN public.projects p ON p.id = pp.project_id
          WHERE pp.phone_e164 = v_value
            AND pp.sms_consent_status = 'opted_out'
            AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
                = p_organization_id) THEN
      RAISE EXCEPTION 'channel_opted_out'
        USING HINT = 'A seat in this studio on this number is marked opted out. '
                     'Record that refusal here first (status opted_out, with the '
                     'evidence); record_channel_reconsent() then puts your fresh '
                     'consent on the record, and the grant stays the '
                     'recipient''s to give by replying YES or START.';
    END IF;

    RAISE EXCEPTION 'consent_awaiting_recipient'
      USING HINT = 'A refusal on this channel has not been answered yet. Put the '
                   'studio''s fresh consent on the record with '
                   'record_channel_reconsent() if it is not there; sending '
                   'resumes only when they reply YES or START.';
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
  'is the named door for putting the studio''s fresh consent on the record, '
  'PR-m, and it leaves the refusal standing, r7 M7-2), and states that gate '
  'inside the upsert''s '
  'DO UPDATE … WHERE so a concurrent STOP cannot land in a read-then-write '
  'window; also refuses EVERY verdict but opted_out while a refusal stands '
  'unanswered — refusal_unanswered TRUE, or an opt_out_at with no later '
  'consented_at (consent_awaiting_recipient) — so '
  'reconsent() plus a grant cannot compose their way back to granted without '
  'the recipient''s own YES or START; it never LOWERS refusal_unanswered on any '
  'verdict either (r7 M7-1 — only the inbound rail does), and a DATELESS '
  'refusal (the shipped '
  'portal writes them on purpose and the fold mints them) fails closed like a '
  'dated one; refuses the same verdicts (channel_opted_out) while an opted_out '
  'seat stands in THIS studio on that number — dated or not — even when the '
  'record knows nothing of it, since the portal still writes party rows '
  'directly and the send gate reads both ledgers with no date test of its own '
  '(R-AL, r6 B6-1/M6-1: gated on whether a refusal stands, never on which '
  'verdict is being written — a recorded `pending` mirrors onto the seats '
  'exactly as a `granted` does, and was the ungated first hop); '
  'never empties the evidence set — source, '
  'evidence, disclosure_version and recorded_by are kept when the new verdict '
  'does not restate them, and laundering is closed by the evidence gate, since '
  'every accepted status must supply its own source and evidence; normalises '
  'the channel value through normalize_channel_value(); stamps '
  'recorded_by/recorded_at; and keeps an earlier granted/opt-out date when the '
  'new verdict does not restate it (00594).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. record_channel_reconsent — PR-m's fresh recorded consent, on the record
-- ═══════════════════════════════════════════════════════════════════════════
-- PR-m: "The way back is always a fresh recorded consent or an inbound START."
-- The inbound START is the rail's own path. This is the other one, and it is
-- deliberately a SEPARATE, named door rather than a fourth argument to
-- record_channel_consent: superseding a refusal is not the same act as
-- recording one, it must be visible in the audit, and it must not be reachable
-- by a caller that merely got the status string wrong.
--
-- IT IS EVIDENCE-ONLY, AND IT LEAVES THE RECORD AT `opted_out` (r7 M7-2).
-- It used to land on `pending`, on the reading that the studio's fresh consent
-- put the record into the state the double opt-in confirmation exists for. That
-- reading died with r6's M6-3 fix: channelConsentVerdict refuses on
-- refusal_unanswered whatever the status says, so NO send could follow — the
-- opt-in invite included (sms.test.ts, "the opt-in invite does not slip past an
-- unanswered refusal", stages exactly the row this door used to write). What
-- the `pending` hop DID do was mirror `pending` onto every seat in the studio
-- on that number, erasing the party-row refusal the send rail falls back on,
-- and move the record off the one status this door can act on, so it could not
-- be called twice. The studio was strictly worse off for having called it.
--
-- So: the refusal keeps standing, the seats keep it, the studio's fresh consent
-- goes on the record where the room can print it ("opted out by text, 3 Dec
-- 2025; fresh signed consent 11 Sep 2026, waiting on their reply"), and the
-- door stays re-callable. THE DOUBLE OPT-IN DOES NOT RUN FROM HERE, and no
-- invite is dispatched (fc_dispatch_optin_invite fires on a mirrored `pending`,
-- which this no longer writes). `granted` is the recipient's to give by
-- replying YES or START, which the inbound rail writes directly — the one
-- writer that lowers refusal_unanswered. PR-m's "a fresh recorded consent OR an
-- inbound START" is read this way on the record: the fresh recorded consent is
-- what the studio may WRITE; the inbound START is what reopens SENDING.
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
         -- status is NOT MOVED (r7 M7-2). The refusal stays on the books at
         -- `opted_out`, and through the mirror so does the refusal on every
         -- seat. It is restated rather than left alone so the row is normalised
         -- whatever a prior writer left, and so the WHERE below is the gate.
     SET status             = 'opted_out',
         -- opt_out_at is KEPT. The room still has to be able to say "opted out
         -- by text, 3 Dec 2025" alongside the fresh consent recorded against it.
         -- refusal_unanswered is KEPT TRUE for the same reason, and it is the
         -- fact record_channel_consent's granted door AND the send rail read:
         -- the studio holds its own fresh consent, but the person who refused
         -- still has not answered. Only their YES/START lowers it.
         -- Stated rather than left alone, so this door is correct even on a row
         -- some other writer left at opted_out without raising the flag.
         refusal_unanswered = true,
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
  'PR-m''s named door for putting the studio''s OWN fresh consent on the record '
  'over a recorded opt-out, with source + evidence + disclosure_version all '
  'required. Refuses unless the channel is currently opted_out '
  '(no_opt_out_to_supersede — the condition is in the UPDATE''s own WHERE, so a '
  'concurrent writer cannot move the row out from under it). It is EVIDENCE-ONLY '
  'and LEAVES THE RECORD AT opted_out (r7 M7-2): it writes source, evidence, '
  'recorded_at, disclosure_version, recorded_by and origin_project_id, and keeps '
  'status, opt_out_at and refusal_unanswered exactly as they stand. It does NOT '
  'run the double opt-in — it used to land on `pending`, but since r6 M6-3 the '
  'send rail refuses on refusal_unanswered whatever the status says, so that hop '
  'sent nothing, cleared the mirrored refusal off every seat, and left the row '
  'on a status this door cannot act on (so it could not be called again). '
  'Sending resumes only when the recipient replies YES or START, which the '
  'inbound rail writes directly — the one writer that lowers '
  'refusal_unanswered — after which record_channel_consent opens again. Safe to '
  'call more than once: each call restates the studio''s latest evidence '
  '(00594).';
