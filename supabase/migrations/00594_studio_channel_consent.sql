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
--      granted, then pending, then not_asked. The EVIDENCE on both sides is
--      asked of the whole group rather than of the winning row: the refusal's
--      own words and date off the seat that actually holds the refusal
--      (r8 W4-M1, r6 R6-M2, r2 R2-M1), and the grant's paperwork off the
--      group's best evidenced consent where the winner carries none (r9 M2) —
--      otherwise the shipped portal's sourceless `opted_out` seat wins the
--      bucket and the studio's signed grant on the seat next door is minted
--      away. The fold reads project_parties; it is the one act that ever does.
--   3. THE FREEZE (R-AS). project_parties.sms_consent_* becomes legacy:
--      commented as such, refused by refuse_legacy_consent_write(), and read by
--      nobody. v_project_roster and people_directory take the consent word off
--      the record through channel_consent_status(), resolving the studio the
--      seat's ledger belongs to through project_consent_org() — one SECURITY
--      DEFINER resolver shared with every writer, so a reader and a writer can
--      never name different studios for the same seat. There is no mirror and no
--      second copy — that copy is what ten review rounds kept finding defects
--      in, because one evidence set on the seat can only ever describe the act
--      that happened last.
--   4. record_channel_consent(...) — SECURITY DEFINER, studio-member gated. The
--      ONLY write path the portal gets: the table grants authenticated SELECT
--      and nothing else, so a consent fact cannot be written without passing
--      through the membership check, the evidence requirement and the
--      transition gate below. It never lowers a standing verdict either:
--      `pending` over `granted` is refused (consent_already_granted,
--      close-review r2 MAJOR-1).
--   4b. record_channel_invite(...) — the ADD path's door. The room's most
--      ordinary act — a repeat sub added to a second job with "text updates"
--      ticked — recorded a `pending` unconditionally and so demoted the
--      studio's own recorded grant, printed "Invited" for a granted number,
--      refused every non-invite send as not_consented, and filed the new act's
--      words under the old grant's date. This door records the invite through
--      the RPC above only when no sendable grant stands; where one does, the
--      record is returned untouched.
--   5. record_channel_reconsent(...) — the one named door beside that gate:
--      PR-m's fresh recorded consent after a refusal, written as EVIDENCE onto
--      a record that stays `opted_out` (r7 M7-2). It does not move the status
--      and does not run the double opt-in; only the recipient's YES/START on
--      the inbound rail reopens sending. The evidence it writes is DATED BY IT
--      (consented_at = now, r9 M1): the five evidence columns and the date name
--      one act, so a fresh source can never be filed under an older grant's
--      date, and the disclosure version that grant was given under is not
--      overwritten by one its recipient never saw.
--
-- All three RPCs key on public.normalize_channel_value(kind, value) — 00593's own
-- rule, in one function, so a channel row and its consent record can never land
-- on different keys (the RPC used to refuse an unparseable phone the channels
-- table deliberately keeps).
--
-- WHAT THE SINGLE SOURCE BUYS. project_parties carries two AFTER-row triggers
-- that reach the OUTSIDE WORLD — fc_dispatch_optin_invite (00432:27-68, trigger
-- created 00284:254-257, fires on an evidenced `pending` and sends the opt-in
-- invite SMS) and _site_request_consent_granted_dispatch (00374:3399-3444,
-- trigger created 00374:3446-3455, fires on a flip to `granted` and calls
-- site-request-dispatch, which calls sendPartySms). A mirror had to reach past
-- both of them, one shared suppression flag and two grafted redefinitions deep,
-- or one recorded `pending` became one real opt-in text per seat on the number,
-- on a 10DLC campaign where duplicate opt-in traffic is what gets a campaign
-- filtered. With nothing writing the seats, neither trigger can fire from a
-- consent act at all: both keep their shipped bodies, unguarded, and this file
-- redefines neither. Sending for a consent RECORD is W2's hook — once,
-- deliberately, not a trigger's fan-out.
--
-- WHAT IT COSTS, STATED HERE SO W2 CANNOT MISS IT. 00374's trigger is the only
-- caller of site_request_dispatch_after_consent(), and the lifecycle sweep only
-- promotes site requests that already hold an outbox row. The trigger fires on
-- a party-row transition, and party rows no longer transition. So a site
-- request parked in awaiting_consent is not released by consent arriving any
-- more, and site_request_send() — which moves a not_asked assignee to `pending`
-- before dispatching — now raises consent_legacy_column_frozen. The whole
-- site-request rail reads consent off the seat; repointing it at the record is
-- one change and it belongs with that rail, not inside a consent migration.
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
--     evidence set.
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
--   · EXCEPT ON EMAIL, WHERE THE STUDIO'S FRESH CONSENT IS THE WHOLE WAY BACK
--     (r6 R6-M3). Everything above is written for the SMS rail and defended on
--     10DLC grounds: the recipient's own YES/START is what reopens sending, and
--     the inbound rail is the one writer that lowers refusal_unanswered.
--     channel_kind also admits 'email', and on email that reply DOES NOT EXIST —
--     the inbound rail writes channel_kind 'sms' only (sms-inbound/pipeline.ts),
--     nothing in the tree writes an email consent row, and reconsent() leaves
--     the status where it stands. So an email refusal was PERMANENT: a dead
--     address in that studio's book, with no carrier rule asking for one. PR-m
--     rules "a fresh recorded consent OR an inbound START"; email has only the
--     first half, so on email — and on email alone — a `granted` recorded
--     through this door passes the opted_out gate and lowers the flag. The
--     evidence gate still forces source + evidence + disclosure_version, which
--     is what "a fresh recorded consent" means. `pending` stays refused on
--     email: the double opt-in is the SMS rail's dance.
--   · No write may EMPTY the evidence set: source / evidence /
--     disclosure_version / recorded_by keep what stands when the new verdict
--     does not restate them (R-AG). Laundering is closed by the evidence gate,
--     not by nulling — every status this door accepts must supply its own
--     source and evidence, so a status change has always restated them.
--     Blankness is tested the SQL way throughout — NULLIF(btrim(…), ''), not
--     IS NULL (r6 R6-M2). p_disclosure_version is the one evidence argument the
--     opted_out branch does not require, so a caller sending an empty form
--     field rather than omitting it wrote '' over the stored version, and
--     nothing in the file restores it.
--   · AND A REFUSAL WRITES NONE OF THE CONSENT'S FIVE (r6 R6-M1). source /
--     evidence / recorded_at / disclosure_version / recorded_by belong to the
--     GRANT whose consented_at the record keeps; the refusal has four columns
--     of its own. One ordinary PR-m act — a written kickoff-form grant, then a
--     verbal refusal the studio heard — used to leave the record reading
--     (verbal, "He told me on site") against the grant's date, so R-Q's grant
--     sentence composed to "Verbal consent, 2 May 2025" and the consent's own
--     10DLC artifact was gone with no audit row: W4-M2's failure, arriving from
--     the other side. r7 R7-M1's consolation goes with it — a studio refusal
--     recorded over a texted one no longer "lands on the consent side" either.
--     A second refusal adds no fact the record lacks, and the only space to put
--     it was on top of a consent's evidence.
--   · AND THE REFUSAL HAS AN EVIDENCE SET OF ITS OWN: opt_out_source /
--     opt_out_evidence / opt_out_recorded_at / opt_out_recorded_by, written by
--     every writer that records a refusal (the fold, record_channel_consent's
--     opted_out branch, the inbound STOP rail) and by nothing else — reconsent
--     included (r8 W4-M2). With one shared set, the studio's fresh consent
--     recorded over a STOP destroyed the refusal's own "Replied STOP",
--     inbound_sms, on the record and on every mirrored seat: sending stayed
--     blocked, but the carrier-audit artifact and R-Q's "opted out BY TEXT"
--     were gone. The four columns have no party-row counterpart, so the mirror
--     does not carry them.
--   · NOR MAY A LATER REFUSAL SPEAK FOR AN EARLIER ONE (r7 R7-M1). The record
--     keeps the EARLIEST opt_out_at, and a studio-sourced refusal recorded over
--     an inbound_sms one leaves all four opt_out_* columns standing. The seat
--     gate's hint sends a studio through that door on purpose ("record that
--     refusal here first"), and one ordinary call used to turn
--     (inbound_sms, "Inbound STOP", 3 Dec 2025, NULL) into
--     (verbal, "He told me on site", today, that member) on the record and on
--     every mirrored seat. Nor does the studio's own account land on the
--     CONSENT side instead (r6 R6-M1, above): that side holds the GRANT's
--     evidence. A duplicate refusal simply writes nothing.
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

  -- THE REFUSAL'S OWN EVIDENCE SET, BESIDE THE CONSENT'S (r8 W4-M2). The record
  -- holds two facts at once once record_channel_reconsent() has been called —
  -- "opted out by text, 3 Dec 2025" AND "fresh signed consent, 11 Sep 2026" —
  -- and one evidence set could only hold the later of them. See the column
  -- comments below.
  opt_out_source text
    CHECK (opt_out_source IN ('verbal', 'written', 'web_form', 'inbound_sms', 'other')),
  opt_out_evidence    text,
  opt_out_recorded_at timestamptz,
  opt_out_recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

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

ALTER TABLE public.studio_channel_consent
  ADD COLUMN IF NOT EXISTS opt_out_source      text,
  ADD COLUMN IF NOT EXISTS opt_out_evidence    text,
  ADD COLUMN IF NOT EXISTS opt_out_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_recorded_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Same constraint name the inline CHECK above produces, so this is a no-op on
-- the fresh-create path and adds the rule on the ALTER path.
DO $ck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.studio_channel_consent'::regclass
       AND conname  = 'studio_channel_consent_opt_out_source_check'
  ) THEN
    ALTER TABLE public.studio_channel_consent
      ADD CONSTRAINT studio_channel_consent_opt_out_source_check
      CHECK (opt_out_source IN ('verbal', 'written', 'web_form', 'inbound_sms', 'other'));
  END IF;
END
$ck$;

COMMENT ON TABLE public.studio_channel_consent IS
  'E8: ONE consent record per studio per channel value. Never per project '
  '(00417''s "consent is per engagement" note is superseded by the six '
  'construction seats: consent follows the phone, inside one studio). '
  'project_parties.sms_consent_* is FROZEN LEGACY beside it (R-AS): read by '
  'nobody, refused by refuse_legacy_consent_write(), kept only as the evidence '
  'the fold was built from. Written ONLY through record_channel_consent() / '
  'record_channel_reconsent(), or service_role (the inbound SMS rail).';

COMMENT ON COLUMN public.studio_channel_consent.channel_value IS
  'The phone in E.164 or the lowercased email — the fact consent is about. '
  'Normalised by record_channel_consent(); a phone reassigned to a new human '
  'keeps this record until a fresh consent is written (crm-model §4).';
COMMENT ON COLUMN public.studio_channel_consent.origin_project_id IS
  'The job the consent (or the STOP) came from, so the room can name it in '
  'words. Not a scope: consent is studio-wide.';
COMMENT ON COLUMN public.studio_channel_consent.opt_out_source IS
  'THE REFUSAL''S OWN evidence set (with opt_out_evidence / opt_out_recorded_at '
  '/ opt_out_recorded_by): how the refusal arrived, in its own words, and who '
  'wrote it down. Separate from source/evidence/recorded_at/... because the '
  'record has to hold the refusal AND the studio''s later fresh consent at the '
  'same time — R-Q''s sentence "Opted out by text, 3 Dec 2025, on the Lindqvist '
  'kitchen" is composed from THIS source plus opt_out_at plus '
  'origin_project_id, and record_channel_reconsent() writes the consent side. '
  'Written by every writer that records a refusal — the fold, '
  'record_channel_consent''s opted_out branch, the inbound STOP rail — and '
  'touched by NOTHING else: no consent verdict, and never reconsent (r8 W4-M2, '
  'which found reconsent overwriting source/evidence/recorded_at/'
  'disclosure_version/recorded_by while leaving status opted_out, so the STOP''s '
  'own "Replied STOP" / inbound_sms was destroyed). These four have no '
  'party-row counterpart at all, which is one more reason the seat was never '
  'able to hold this record''s facts (R-AS).';

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
           -- WHOSE ACT DOES THIS ROW'S ONE EVIDENCE SET DESCRIBE? (r4 R4-M1,
           -- widened by r10 M1, hoisted here by r9 M2.) project_parties has a
           -- SINGLE evidence set, so before anything is projected anywhere the
           -- fold has to say which act it belongs to. It is the REFUSAL's own
           -- words only when the row's STATUS is the refusal and nothing about
           -- the evidence contradicts that: it says so itself (`inbound_sms` —
           -- only the rail writes it), or it was written down no earlier than
           -- the refusal happened, or one of the two dates is missing so there
           -- is nothing to contradict. Otherwise the words are the GRANT's —
           -- the ordinary STOP-flipped seat — and the consent side is where
           -- they belong.
           --
           -- Computed ONCE, here, because two CTEs below read it in opposite
           -- directions (`refusal` takes the words only when it is true,
           -- `grant_evidence` only when it is false); stated twice they could
           -- drift apart and file one row's paperwork under both acts, or
           -- neither.
           (pp.sms_consent_status = 'opted_out'
            AND pp.sms_consent_source IS NOT NULL
            AND (pp.sms_consent_source = 'inbound_sms'
                 OR pp.sms_opt_out_at IS NULL
                 OR pp.sms_consent_recorded_at IS NULL
                 OR pp.sms_consent_recorded_at >= pp.sms_opt_out_at))
             AS refusal_words_are_its_own,
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
                      -- INSIDE THE REFUSAL BUCKET, THE SEAT THAT CARRIES THE
                      -- REFUSAL'S OWN FACTS OUTRANKS ONE THAT CARRIES NONE
                      -- (r2 R2-M1). The date fallback below is COALESCE(...,
                      -- updated_at) — a row-maintenance timestamp, not a
                      -- refusal date. The shipped portal writes `opted_out`
                      -- seats with a NULL sms_opt_out_at, a NULL source and no
                      -- words on purpose (use-coordination.ts), and such a row
                      -- is touched whenever anything on the roster changes, so
                      -- its updated_at routinely outranks the 2025
                      -- sms_opt_out_at of the seat that actually received the
                      -- STOP. The winner supplies the record's status, its
                      -- origin project and (where the winner has one) its
                      -- opt-out date, so picking the dateless sibling mints the
                      -- record with none of the refusal's facts. These two
                      -- legs are inert outside the refusal bucket — every row
                      -- in a granted / pending / not_asked group scores 1 — so
                      -- "then the most recent granted" is unchanged.
                      CASE WHEN sms_consent_status = 'opted_out'
                            AND sms_consent_source IS NOT NULL THEN 0 ELSE 1 END,
                      CASE WHEN sms_consent_status = 'opted_out'
                            AND sms_opt_out_at IS NOT NULL THEN 0 ELSE 1 END,
                      COALESCE(sms_opt_out_at, sms_consented_at,
                               sms_consent_recorded_at, updated_at) DESC NULLS LAST
           ) AS rn
    FROM party_org
    WHERE org IS NOT NULL
  ),
  -- THE REFUSAL IS ASKED OF THE WHOLE GROUP, NOT OF THE WINNING ROW (r8 W4-M1).
  -- ROW_NUMBER() above drops every sibling seat before the predicate below can
  -- see it, so a studio holding two seats on one number — a clean recent grant
  -- and a legacy row reading `granted` while carrying a stale opt-out no later
  -- consent answered — folded to a fully SENDABLE record: inside `granted` the
  -- tiebreak is the most recent date, so the clean grant won and the refusal
  -- went in the bin with the row that carried it. Nothing downstream caught it
  -- either — the send gate's second check (orgHasOptedOutParty) and this file's
  -- own seat gate both filter on sms_consent_status = 'opted_out', and the
  -- contaminated seat reads `granted`. That is exactly the record r7's M7-1
  -- ruled must be minted UNSENDABLE, and it only bites on the first prod fold,
  -- over real project_parties data.
  --
  -- The same CTE carries the refusal's OWN evidence (r8 W4-M2): the refusing
  -- sibling is not the row whose source and words land in the consent evidence
  -- set, so without this the record would say "a refusal stands here" and hold
  -- nothing at all about it. Most recently refused wins when there is more than
  -- one.
  --
  -- IT CARRIES THE REFUSAL'S DATE TOO (r6 R6-M2). `opt_out_at` used to be taken
  -- from the WINNING row while the source and the words came from the refusing
  -- sibling — and in this CTE's own population the winner is a clean grant, so
  -- the record was minted saying "it arrived by text, it said Replied STOP, it
  -- was written down on 2025-11-16" with opt_out_at, the column that carries
  -- WHEN THEY REFUSED, empty. R-Q's sentence ("opted out by text, 3 Dec 2025,
  -- on the Lindqvist kitchen") lost its date for exactly this population, and
  -- the belt-and-braces pair the gate below relies on — the date test KEPT
  -- alongside refusal_unanswered — collapsed to one strand for every record the
  -- fold mints, since the fold raises the flag and left the date NULL. The date
  -- had not moved anywhere: it was still only on the losing sibling seat, which
  -- is the thing this CTE exists to stop relying on.
  --
  -- AND THE SIBLING IT PICKS IS THE ONE THAT ACTUALLY HOLDS THE REFUSAL
  -- (r2 R2-M1). Ranking the refusing seats by COALESCE(sms_opt_out_at,
  -- sms_consent_recorded_at, updated_at) alone ranks them by most recently
  -- TOUCHED: a dateless, sourceless portal refusal (the shape
  -- use-coordination.ts writes on purpose) wins over the seat carrying
  -- `inbound_sms` / "Replied STOP" / 2025-12-03 as soon as anything on the
  -- roster touches it. Everything the record knows about the refusal then
  -- comes off a row that knows nothing: opt_out_at NULL and all four opt_out_*
  -- NULL, permanently (ON CONFLICT DO NOTHING means no later fold repairs it,
  -- and record_channel_reconsent never touches opt_out_* by design), so R-Q's
  -- "Opted out by text, 3 Dec 2025" is unprintable and the carrier-audit
  -- artifact is gone. (Under the retired mirror it was worse still: a NULL
  -- opt_out_source was read as "this refusal has no words" — R-AQ — and the
  -- NULL was written down over every seat's evidence, the seat holding the
  -- STOP's own words included. R-AS retired the mirror and with it that branch;
  -- the picker still has to be right, because the record is now the only copy
  -- there is.)
  --
  -- So: words first, then a date, then recency. And the date has a group-wide
  -- last resort — max(sms_opt_out_at) across the refusing seats — so a refusal
  -- that carries words but no date of its own still lands a real date on the
  -- record instead of NULL, rather than the pair being silently split.
  refusal AS (
    SELECT org, phone_e164,
           COALESCE(sms_opt_out_at, group_opt_out_at) AS sms_opt_out_at,
           -- AND THE WORDS ARE ONLY EVER TAKEN OFF A ROW WHOSE EVIDENCE COULD
           -- ACTUALLY BE THE REFUSAL'S (r4 R4-M1, widened by r10 M1).
           --
           -- This CTE's population is two shapes, not one: a seat whose STATUS
           -- is `opted_out`, and a seat carrying an unanswered opt-out date
           -- while its status still reads granted / pending (the r8 W4-M1
           -- shape, admitted by the second disjunct below). project_parties has
           -- ONE evidence set, and on that second shape it belongs to whatever
           -- wrote the row's CURRENT status — THE GRANT. Projected straight
           -- across, the studio's own consent paperwork was filed as the
           -- refusal's own words: a record reading (opted_out, written,
           -- "Signed the Lindqvist kickoff form", recorded 2025-01-01) against
           -- an opt_out_at of 2025-11-16 — the refusal written down ten months
           -- before it happened, and R-Q's sentence printing "Opted out in
           -- writing, 16 Nov 2025", naming the consent document as the refusal.
           --
           -- AND STATUS ALONE IS NOT ENOUGH EITHER (r10 M1) — the shape it
           -- misses is the COMMONEST REAL REFUSAL ON THE BOOKS. The shipped
           -- inbound STOP rail (sms-inbound/pipeline.ts optOutAllForPhone)
           -- flips sms_consent_status to `opted_out` and stamps the date, and
           -- until the r10 fix on the same finding it left the GRANT's four
           -- evidence columns standing on the row. Every seat that held a
           -- recorded grant and later texted STOP therefore reads as a refusal
           -- holding the studio's consent paperwork, and the fold minted
           -- (opted_out, written, "Signed the Lindqvist kickoff form",
           -- recorded seven months BEFORE opt_out_at, recorded_by the studio
           -- member who wrote the GRANT down — the attribution R7-M1 and R5-M2
           -- ruled must be NULL on a rail-written STOP). R-Q then printed
           -- "Opted out IN WRITING" for a refusal that arrived by text.
           --
           -- Either way the damage is permanent: ON CONFLICT DO NOTHING means
           -- no later fold repairs the record, and record_channel_reconsent
           -- never touches opt_out_* by design. Since R-AS the record is the
           -- only copy, so a lie minted here is the only thing the room can
           -- read.
           --
           -- So the evidence must PLAUSIBLY BELONG TO THE REFUSAL: either it
           -- says so itself (`inbound_sms` — only the rail writes that), or
           -- nothing about it contradicts the refusal, i.e. it was written down
           -- no earlier than the refusal happened (or one of the two dates is
           -- missing, and there is nothing to contradict). Otherwise NULL, and
           -- all four together because R-AQ reads them as a set: the record
           -- then reads as the wordless refusal it is and R-AQ's branch does
           -- its job. The DATE legs are untouched — a date is a date whichever
           -- status carries it, and the unanswered opt-out date is the whole
           -- reason the row is here.
           --
           -- The `ranked` picker above is deliberately NOT given this test. Its
           -- winner supplies the record's STATUS, its origin project and its
           -- CONSENT set, and on a STOP-flipped seat all three are right: the
           -- grant really was signed, so it belongs on the consent side
           -- (source / evidence / recorded_at), and that seat carries the
           -- refusal's real date. Only the refusal's OWN four columns must not
           -- borrow it.
           CASE WHEN refusal_words_are_its_own
                THEN sms_consent_source      END AS opt_out_source,
           CASE WHEN refusal_words_are_its_own
                THEN sms_consent_evidence    END AS opt_out_evidence,
           CASE WHEN refusal_words_are_its_own
                THEN sms_consent_recorded_at END AS opt_out_recorded_at,
           CASE WHEN refusal_words_are_its_own
                THEN sms_consent_recorded_by END AS opt_out_recorded_by
      FROM (
        SELECT owned.*,
               max(sms_opt_out_at) OVER (
                 PARTITION BY org, phone_e164
               ) AS group_opt_out_at,
               ROW_NUMBER() OVER (
                 PARTITION BY org, phone_e164
                 -- The words leg asks the same question the projection above
                 -- asks (r4 R4-M1, r10 M1): evidence that belongs to a GRANT is
                 -- not refusal words, so it must not outrank a real refusal
                 -- that happens to be wordless — which is the shape the shipped
                 -- portal writes on purpose (use-coordination.ts).
                 ORDER BY CASE WHEN refusal_words_are_its_own
                               THEN 0 ELSE 1 END,
                          (sms_opt_out_at IS NOT NULL) DESC,
                          COALESCE(sms_opt_out_at, sms_consent_recorded_at,
                                   updated_at) DESC NULLS LAST
               ) AS rrn
          FROM (
            -- refusal_words_are_its_own comes off party_org (r9 M2) — one
            -- definition, read here and by grant_evidence below. This
            -- subquery is now the refusal POPULATION and nothing else.
            SELECT party_org.*
              FROM party_org
             WHERE org IS NOT NULL
               AND (sms_consent_status = 'opted_out'
                    OR (sms_opt_out_at IS NOT NULL
                        AND (sms_consented_at IS NULL
                             OR sms_consented_at <= sms_opt_out_at)))
          ) owned
      ) refusals
     WHERE rrn = 1
  ),
  -- AND THE CONSENT SIDE IS ASKED OF THE WHOLE GROUP TOO (r9 M2).
  --
  -- The winning row supplies the record's consent set, and for the COMMONEST
  -- legacy shape it has none to give: the shipped portal writes a SOURCELESS,
  -- DATELESS `opted_out` seat on purpose (use-coordination.ts), that seat wins
  -- the refusal bucket, and the studio's fully evidenced grant — written,
  -- "Signed the kickoff form", 2 May 2025, v3, a named recorder — is sitting on
  -- THE SEAT NEXT DOOR. The record was minted with source / evidence /
  -- recorded_at / disclosure_version / recorded_by all NULL and the group's real
  -- consent paperwork nowhere on it.
  --
  -- And nothing puts it back: ON CONFLICT DO NOTHING means no later fold
  -- repairs the record, and record_channel_reconsent never touches opt_out_*.
  -- Since R-AS the record is the only copy, so the studio's proof of prior
  -- express written consent for that number would then exist NOWHERE, which is
  -- the one artifact a 10DLC audit asks for.
  --
  -- So the group's best evidenced consent is carried the way r8 W4-M1 already
  -- carries its refusal: one row per (studio, number), projected onto the
  -- record's consent side ONLY where the winning row carries no consent
  -- evidence at all. A winner that carries its own keeps it — including a
  -- STOP-flipped seat, whose words belong to the grant that really was signed
  -- (r10 M1), and including a refusal that MINTS the record with its own words,
  -- which is what the other two writers of a mint do (the RPC's INSERT leg
  -- :1444, sms-inbound/pipeline.ts writeChannelConsent).
  --
  -- The population is the mirror image of `refusal`'s words test: a row may
  -- speak for the GRANT when it has a source and that source is not the
  -- refusal's own words. Otherwise "Replied STOP" would be filed as the
  -- consent's evidence — r4 R4-M1 in reverse. Most recent grant first, then the
  -- most recently written down, then row recency.
  --
  -- AND consented_at TRAVELS WITH THE FIVE (R-Q, :159-170): whichever row's
  -- paperwork lands on the consent side supplies the date of the act it
  -- describes, so the record can never read "<this source> consent, <another
  -- act's date>" — the failure r6 R6-M1 closed in the RPC and r9 M1 closed in
  -- reconsent, arriving here from a third door.
  grant_evidence AS (
    SELECT org, phone_e164, sms_consented_at, sms_consent_source,
           sms_consent_evidence, sms_consent_recorded_at,
           sms_consent_disclosure_version, sms_consent_recorded_by
      FROM (
        SELECT party_org.*,
               ROW_NUMBER() OVER (
                 PARTITION BY org, phone_e164
                 ORDER BY sms_consented_at        DESC NULLS LAST,
                          sms_consent_recorded_at DESC NULLS LAST,
                          updated_at              DESC NULLS LAST
               ) AS grn
          FROM party_org
         WHERE org IS NOT NULL
           AND sms_consent_source IS NOT NULL
           AND NOT refusal_words_are_its_own
      ) grants
     WHERE grn = 1
  ),
  ins AS (
    INSERT INTO public.studio_channel_consent (
      organization_id, channel_kind, channel_value, status,
      consented_at, opt_out_at, refusal_unanswered, source, evidence,
      recorded_at, disclosure_version, recorded_by,
      opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by,
      origin_project_id
    )
    SELECT r.org, 'sms', r.phone_e164, r.sms_consent_status,
           -- The grant's DATE comes off the same row as the grant's WORDS
           -- (r9 M2, R-Q): the winner's own where it carries paperwork, the
           -- group's best evidenced grant where it carries none.
           CASE WHEN r.sms_consent_source IS NULL AND g.org IS NOT NULL
                THEN g.sms_consented_at ELSE r.sms_consented_at END,
           -- The winning row's date, or THE REFUSING SIBLING'S when the winner
           -- has none (r6 R6-M2) — the refusal's words and the refusal's date
           -- come off the same row.
           COALESCE(r.sms_opt_out_at, f.sms_opt_out_at),
           -- An unanswered refusal is recorded as a FACT here, never inferred
           -- later from opt_out_at: a folded `opted_out` row is routinely
           -- DATELESS (the shipped portal writes one deliberately —
           -- use-coordination.ts; so does every pre-00432 row), and a gate that
           -- read the date failed open for that whole population. A row that is
           -- not opted_out still counts as an unanswered refusal when it carries
           -- an opt-out date no later consent has answered — INCLUDING a winner
           -- whose status reads `granted` (r7 M7-1, ruled here), and INCLUDING a
           -- LOSING SIBLING the ranking discarded (r8 W4-M1). A legacy seat
           -- saying granted while carrying a dated opt-out and no later
           -- consented_at is contradictory data, and the refusal is the half
           -- that fails closed: the record is minted UNSENDABLE and only the
           -- recipient's own YES/START reopens it. `refusal` holds one row per
           -- group exactly when such a refusal stands anywhere in it.
           (f.org IS NOT NULL),
           -- THE GROUP'S CONSENT EVIDENCE, NOT THE WINNING ROW'S ALONE
           -- (r9 M2 — see grant_evidence above). All five move together with
           -- the date above: a set half from one act and half from another is
           -- the thing every consent rule in this file refuses.
           CASE WHEN r.sms_consent_source IS NULL AND g.org IS NOT NULL
                THEN g.sms_consent_source             ELSE r.sms_consent_source             END,
           CASE WHEN r.sms_consent_source IS NULL AND g.org IS NOT NULL
                THEN g.sms_consent_evidence           ELSE r.sms_consent_evidence           END,
           CASE WHEN r.sms_consent_source IS NULL AND g.org IS NOT NULL
                THEN g.sms_consent_recorded_at        ELSE r.sms_consent_recorded_at        END,
           CASE WHEN r.sms_consent_source IS NULL AND g.org IS NOT NULL
                THEN g.sms_consent_disclosure_version ELSE r.sms_consent_disclosure_version END,
           CASE WHEN r.sms_consent_source IS NULL AND g.org IS NOT NULL
                THEN g.sms_consent_recorded_by        ELSE r.sms_consent_recorded_by        END,
           f.opt_out_source, f.opt_out_evidence,
           f.opt_out_recorded_at, f.opt_out_recorded_by,
           r.project_id
    FROM ranked r
    LEFT JOIN refusal f
      ON f.org = r.org AND f.phone_e164 = r.phone_e164
    LEFT JOIN grant_evidence g
      ON g.org = r.org AND g.phone_e164 = r.phone_e164
    WHERE r.rn = 1
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
  'refusal_unanswered on any folded refusal, dated or not — and asks for one '
  'across EVERY seat the studio holds on that number, not just the winning row '
  '(r8 W4-M1) — so the granted door '
  'fails closed for the dateless opted_out rows the shipped portal writes on '
  'purpose. The refusing sibling gives the record the refusal''s own source, '
  'words, recorder AND DATE: opt_out_at is the winning row''s date or, where '
  'the winner has none, the refusing sibling''s, so the date and the words come '
  'off the same row (r6 R6-M2). The refusing sibling is chosen by the '
  'refusal''s OWN facts — its words first, then its date, and only then row '
  'recency — so a dateless sourceless portal refusal never outranks the seat '
  'that received the STOP and empties the record''s refusal evidence set '
  '(r2 R2-M1); and the words are only ever taken off a row whose evidence '
  'could BE the refusal''s — it says `inbound_sms`, or nothing about it '
  'contradicts the refusal — so neither the GRANT''s paperwork on a seat '
  'carrying a stale unanswered opt-out (r4 R4-M1) nor the GRANT''s paperwork '
  'left standing on a seat the inbound STOP rail flipped to `opted_out` '
  '(r10 M1) is ever filed as the refusal''s own words; such a refusal is '
  'recorded wordless, which is the honest record of it. '
  'THE CONSENT SIDE IS ASKED OF THE WHOLE GROUP TOO (r9 M2): where the winning '
  'row carries no consent evidence at all — the sourceless dateless opted_out '
  'seat the shipped portal writes on purpose, which wins the refusal bucket — '
  'the record takes source, evidence, recorded_at, disclosure_version, '
  'recorded_by AND consented_at, as one set, off the group''s best evidenced '
  'grant (grant_evidence), so a studio holding a signed grant on the seat next '
  'door does not have it minted away — and since R-AS the record is the only '
  'copy, so a grant lost at the fold is lost outright. A winner that carries '
  'its own '
  'consent evidence keeps it (a STOP-flipped seat''s grant paperwork, or a '
  'refusal minting the record with its own words, as both other writers of a '
  'mint do). '
  'Idempotent — ON CONFLICT '
  'DO NOTHING never overwrites a later decision — and side-effect-free to '
  're-run: it writes studio_channel_consent and nothing else, so a folded '
  '`pending` reaches no party row and fires no opt-in dispatch (00594, R-AS).';

SELECT public.backfill_channel_consent_from_parties();
-- ═══════════════════════════════════════════════════════════════════════════
-- 3. THE RECORD IS THE SINGLE SOURCE — the mirror is retired (R-AS)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ten review rounds (r5–r10) found the same class of defect over and over, and
-- every one of them lived in the COPY: a verdict and an evidence set held in
-- two places, with one set of columns on project_parties that has to speak for
-- whichever act happened last. The refusal's words under the grant's date; the
-- grant's recorder named as the person who refused; a sibling seat's paperwork
-- standing in for a refusal that had none. Each was patched where it was
-- found, and the next round found the next one.
--
-- R-AS ends the class rather than the instance. studio_channel_consent is the
-- single source of truth for consent. Nothing writes
-- project_parties.sms_consent_* any more:
--
--   · mirror_channel_consent_to_parties() and its trigger are GONE, and so are
--     the two redefinitions that existed only to serve them —
--     fc_dispatch_optin_invite (00432) and
--     _site_request_consent_granted_dispatch (00374) keep their shipped bodies,
--     unguarded, because no mirror write can reach them any more. The flag
--     patina.suppress_consent_dispatch is not set by anything in this file.
--   · the inbound SMS rail writes the record only
--     (supabase/functions/sms-inbound/pipeline.ts).
--   · the eight legacy columns are FROZEN: readable, commented as legacy, and
--     guarded by a BEFORE UPDATE trigger that refuses any change to them
--     unless current_setting('app.consent_legacy_write', true) = 'on'.
--     Nothing in the send rails sets that flag, on purpose: a shipped writer
--     that still reaches for these columns FAILS LOUDLY rather than quietly
--     writing a fact nobody reads. The escape hatch exists for a deliberate
--     data repair, and for W2, which retires those writers.
--
-- The writers that will now fail, found by grep and listed in the build report:
--   · public.site_request_send() (00374:1265-1269) — moves a not_asked
--     assignee to `pending` before dispatching a site request.
--   · useRecordPartySmsConsent and the phone-edit revertsToOptedOut branch
--     (packages/supabase/src/hooks/use-coordination.ts) — the portal's two
--     UPDATE paths. useAddProjectParty INSERTs and is untouched: the freeze is
--     BEFORE UPDATE, so a seat may still be born carrying what the studio
--     recorded at the door.
--
-- ONE CONSEQUENCE IS DELIBERATELY LEFT OPEN FOR W2, not closed here. 00374's
-- site_request_consent_granted_dispatch fires on a party-row transition to
-- `granted`. With the legacy columns frozen and the rail writing the record,
-- no party row transitions any more, so a site request parked in
-- awaiting_consent is no longer released by consent arriving. The site-request
-- rail reads consent off the seat throughout (site_request_send,
-- consent_status_snapshot, the lifecycle sweep); repointing it at the record is
-- one change, and it belongs with the rail, not inside a consent migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- Idempotent retirement: this file has only ever run locally, but a stack that
-- replayed an earlier 00594 still carries the mirror.
DROP TRIGGER IF EXISTS mirror_channel_consent_to_parties_trg ON public.studio_channel_consent;
DROP FUNCTION IF EXISTS public.mirror_channel_consent_to_parties();

-- ── 3a. The eight legacy columns say what they are ──────────────────────────
COMMENT ON COLUMN public.project_parties.sms_consent_status IS
  'legacy; read studio_channel_consent. Frozen by 00594 (R-AS): the consent '
  'record for (this project''s studio, ''sms'', phone_e164) is the single '
  'source of truth, and v_project_roster / people_directory read it through '
  'public.channel_consent_status(). Kept for the rows already written and for '
  'backfill_channel_consent_from_parties(), which folds them in once.';
COMMENT ON COLUMN public.project_parties.sms_consented_at IS
  'legacy; read studio_channel_consent.consented_at (00594, R-AS).';
COMMENT ON COLUMN public.project_parties.sms_opt_out_at IS
  'legacy; read studio_channel_consent.opt_out_at (00594, R-AS).';
COMMENT ON COLUMN public.project_parties.sms_consent_source IS
  'legacy; read studio_channel_consent.source, or opt_out_source when the '
  'verdict is a refusal — the record holds the grant''s evidence and the '
  'refusal''s side by side, which one column never could (00594, R-AS).';
COMMENT ON COLUMN public.project_parties.sms_consent_evidence IS
  'legacy; read studio_channel_consent.evidence / opt_out_evidence '
  '(00594, R-AS).';
COMMENT ON COLUMN public.project_parties.sms_consent_recorded_at IS
  'legacy; read studio_channel_consent.recorded_at / opt_out_recorded_at '
  '(00594, R-AS).';
COMMENT ON COLUMN public.project_parties.sms_consent_recorded_by IS
  'legacy; read studio_channel_consent.recorded_by / opt_out_recorded_by '
  '(00594, R-AS).';
COMMENT ON COLUMN public.project_parties.sms_consent_disclosure_version IS
  'legacy; read studio_channel_consent.disclosure_version (00594, R-AS).';

-- ── 3b. …and refuse to be written ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refuse_legacy_consent_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- The deliberate door: a data repair, or W2 retiring a writer, opens it with
  -- SET LOCAL app.consent_legacy_write = 'on' around its own statement.
  IF COALESCE(current_setting('app.consent_legacy_write', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- BEFORE UPDATE OF fires whenever a column is NAMED in the SET list, whether
  -- or not its value moves, and the shipped portal writes whole rows. Only a
  -- real change is refused.
  IF (NEW.sms_consent_status, NEW.sms_consented_at, NEW.sms_opt_out_at,
      NEW.sms_consent_source, NEW.sms_consent_evidence,
      NEW.sms_consent_recorded_at, NEW.sms_consent_recorded_by,
      NEW.sms_consent_disclosure_version)
     IS DISTINCT FROM
     (OLD.sms_consent_status, OLD.sms_consented_at, OLD.sms_opt_out_at,
      OLD.sms_consent_source, OLD.sms_consent_evidence,
      OLD.sms_consent_recorded_at, OLD.sms_consent_recorded_by,
      OLD.sms_consent_disclosure_version) THEN
    RAISE EXCEPTION 'consent_legacy_column_frozen'
      USING HINT = 'project_parties.sms_consent_* is legacy since 00594. '
                   'Consent is a fact about (studio, channel, value): record '
                   'it with record_channel_consent(), or record_channel_'
                   'reconsent() over a standing refusal. Reads go through '
                   'studio_channel_consent / channel_consent_status().';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_legacy_consent_write() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.refuse_legacy_consent_write() IS
  'Freezes project_parties.sms_consent_* (R-AS). A change to any of the eight '
  'columns is refused with consent_legacy_column_frozen unless the caller has '
  'set app.consent_legacy_write = ''on'' for its own statement. Restating the '
  'same values is allowed, so a whole-row UPDATE that happens to name them '
  'still writes. Nothing in the send rails sets the flag: a shipped writer '
  'that still reaches for these columns is meant to fail loudly, not to write '
  'a fact no reader reads (00594).';

DROP TRIGGER IF EXISTS refuse_legacy_consent_write_trg ON public.project_parties;
CREATE TRIGGER refuse_legacy_consent_write_trg
  BEFORE UPDATE OF sms_consent_status, sms_consented_at, sms_opt_out_at,
                   sms_consent_source, sms_consent_evidence,
                   sms_consent_recorded_at, sms_consent_recorded_by,
                   sms_consent_disclosure_version
  ON public.project_parties
  FOR EACH ROW EXECUTE FUNCTION public.refuse_legacy_consent_write();

COMMENT ON TABLE public.project_parties IS
  'Track 5 coordination courts (R46): GC / vendor / client_rep / other parties '
  'on a project. profile_id NULLABLE — v1 parties do NOT log in; the designer '
  'records their move via resolve_coordination_item. Setting profile_id later '
  'gives that party a real login (a flag flip, not a migration). vendor_id '
  'soft-links a known vendor; both back-links ON DELETE SET NULL so item/task '
  'court history survives (00212). '
  'sms_consent_* is FROZEN LEGACY since 00594 (R-AS): studio_channel_consent '
  'is the single source of truth for consent, refuse_legacy_consent_write() '
  'refuses any change to those eight columns, and every reader goes through '
  'channel_consent_status(). They are not dropped — '
  'backfill_channel_consent_from_parties() folds them in once, and the rows '
  'themselves are 10DLC evidence of what the studio held before the record '
  'existed.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3c. The one reader — channel_consent_status()
-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER on purpose: studio_channel_consent's own RLS
-- (is_active_studio_member) is the access rule, and a definer here would hand
-- any caller any studio's verdict for the price of an org id.
--
-- ONE VERDICT, NOT ONE COLUMN (close-review r2 MAJOR-2). This used to return
-- scc.status alone, and status is only HALF the verdict this record carries.
-- refusal_unanswered is the other half and it is verdict-bearing everywhere
-- else: _shared/sms.ts channelConsentVerdict refuses every send on it whatever
-- the status says, and record_channel_consent's DO UPDATE … WHERE refuses every
-- studio-side write on it. The fold MINTS records where it is TRUE while the
-- status reads `granted` — that is the r8 W4-M1 shape, ruled at :655-666 as
-- "the record is minted UNSENDABLE": a legacy seat saying granted while a
-- sibling seat holds a dated refusal no later consent answered.
--
-- Reading the column alone, both views printed `granted` for such a record, and
-- `granted` renders as "Texting" (field-config.ts, §3.8, R-Q). So the Call
-- Sheet and the Directory told the designer the number was on the rail while
-- every sendPartySms to it came back opted_out — G-3 verbatim ("one row can
-- read 'Texting' while the same phone is opted out"), restored inside the
-- record built to end it, and unfixable by the studio because
-- record_channel_consent refuses every verdict but opted_out while the flag
-- stands.
--
-- So the ONE reader carries the ONE verdict, and it is the honest word: a
-- refusal stands and has not been answered, so the number is opted out until
-- the recipient's own YES or START lowers the flag on the inbound rail. The
-- same applies to a folded `pending` or `not_asked` winner with a refusing
-- sibling. Fixing it HERE rather than in the two views is what R-AS exists for
-- — the rule lives in one place, and the send gate and the room now agree by
-- construction.
CREATE OR REPLACE FUNCTION public.channel_consent_status(
  p_organization_id uuid,
  p_channel_kind    text,
  p_channel_value   text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN scc.refusal_unanswered IS TRUE THEN 'opted_out'
              ELSE scc.status END
    FROM public.studio_channel_consent scc
   WHERE scc.organization_id = p_organization_id
     AND scc.channel_kind    = p_channel_kind
     AND scc.channel_value   = p_channel_value
$$;

REVOKE ALL ON FUNCTION public.channel_consent_status(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.channel_consent_status(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.channel_consent_status(uuid, text, text) IS
  'The studio''s verdict for one channel value, read off '
  'studio_channel_consent — the single source since R-AS. NULL means this '
  'studio holds no record for that value, which is what `not_asked` means; '
  'callers that must print a word COALESCE it. THE VERDICT IS status AND '
  'refusal_unanswered TOGETHER (close-review r2 MAJOR-2): an unanswered refusal '
  'reads `opted_out` whatever the status column says, because that is what the '
  'send gate (_shared/sms.ts channelConsentVerdict) and the write gate '
  '(record_channel_consent) both already do with the flag, and the fold mints '
  '`granted` records carrying it on purpose (:655-666, r8 W4-M1). One reader, '
  'one verdict — patching the two views instead would put the rule in two '
  'places, which is the thing R-AS exists to stop. SECURITY INVOKER, so the '
  'table''s member-only RLS decides what a caller may read. Used by '
  'v_project_roster and people_directory in place of '
  'project_parties.sms_consent_*, which is frozen legacy (00594).';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3c-2. The org whose ledger a project's consent is read from
-- ═══════════════════════════════════════════════════════════════════════════
-- ONE RESOLVER, NOT THREE INLINED COPIES (close-review r1 MAJOR-1).
--
-- Both views below need the org a project belongs to: studio_id, falling back
-- to the designer's primary studio. _primary_studio_for() is that fallback, but
-- 00484:1221/:1278-1289 revoked EXECUTE on it from every PostgREST role, and a
-- security_invoker view checks function permissions against the CALLER — so the
-- views inlined its body instead, three times.
--
-- The inlined copy is textually identical and behaviourally is NOT: the
-- function is SECURITY DEFINER and a subquery in an invoker view is not.
-- organization_members carries "Active members can view co-members"
-- (is_active_org_member), so the inlined copy sees only memberships in orgs the
-- CALLER belongs to, while backfill_channel_consent_from_parties() (:381),
-- record_channel_consent()'s seat gate and the send rail (_shared/sms.ts
-- primaryStudioFor) see every membership. For a project with studio_id IS NULL
-- whose designer belongs to more than one design_studio the two diverge, and
-- the view then asks ANOTHER studio's ledger and prints its word with
-- confidence: one seat, one number, "Not asked" to a member of studio A and
-- "Opted out" to a member of studio B. Worse than the degrade-to-NULL the old
-- comment documented, and on exactly the studio_id IS NULL population §5.2
-- names as this wave's blind spot.
--
-- So the resolution gets a function of its own — the shape studio_contact_org()
-- already takes (00592:65-76) — and the views call it. It returns an ORG ID,
-- never a consent word: channel_consent_status() stays SECURITY INVOKER, so
-- studio_channel_consent's member-only RLS is still the whole of what a caller
-- may read through it.
CREATE OR REPLACE FUNCTION public.project_consent_org(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
    FROM public.projects p
   WHERE p.id = p_project_id;
$$;

REVOKE ALL ON FUNCTION public.project_consent_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_consent_org(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.project_consent_org(uuid) IS
  'The organization whose consent ledger a project''s seats are read against: '
  'projects.studio_id, falling back to _primary_studio_for(designer_id) — the '
  'same resolution backfill_channel_consent_from_parties(), '
  'record_channel_consent()''s seat gate and the SMS send rail use. SECURITY '
  'DEFINER so v_project_roster and people_directory (both security_invoker) '
  'resolve it the way every writer does instead of through the caller''s own '
  'organization_members RLS, which answered for a different studio entirely '
  'when a designer belongs to more than one (00594, close-review r1 MAJOR-1). '
  'Returns an org id only; the consent word still comes from '
  'channel_consent_status(), which is INVOKER.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3d. The two shipped readers, repointed at the record
-- ═══════════════════════════════════════════════════════════════════════════
-- Both views are grafted from their grep-winning bodies and changed in exactly
-- one place each — the consent word:
--   · v_project_roster  lineage 00419:94-156 (the Call Sheet's own view)
--   · people_directory  lineage 00221 -> 00281 -> 00420 -> 00478 -> 00583 ->
--                       00589:696-935 (v6)
-- Everything else, every other branch and column, is byte-identical to the
-- winner. people_directory's v4 rebuild in W1b keeps this read.

CREATE OR REPLACE VIEW public.v_project_roster
WITH (security_invoker = true) AS

-- ── PARTY BRANCH ─────────────────────────────────────────────────────────
SELECT
  pp.id                                                          AS roster_id,
  'party'::text                                                  AS source,
  pp.project_id                                                  AS project_id,
  pp.party_kind                                                  AS kind,
  pp.display_name                                                AS display_name,
  pp.company_name                                                AS company_name,
  pp.email                                                       AS email,
  pp.phone                                                       AS phone,
  pp.trade                                                       AS trade,
  NULL::text                                                     AS job_title,
  NULL::text                                                     AS staff_role,
  pp.studio_contact_id                                           AS studio_contact_id,
  pp.profile_id                                                  AS profile_id,
  pp.show_to_client                                              AS show_to_client,
  EXISTS (
    SELECT 1 FROM public.field_link_tokens flt
    WHERE flt.party_id = pp.id
      AND flt.status = 'active'
      AND (flt.expires_at IS NULL OR flt.expires_at > now())
  )                                                               AS has_active_field_link,
  -- THE RECORD, NOT THE SEAT (R-AS). project_parties.sms_consent_* is frozen
  -- legacy since 00594; the studio's verdict for this number lives in
  -- studio_channel_consent. No record is what `not_asked` means, and this
  -- column was NOT NULL before, so the absence is COALESCEd to the word.
  COALESCE(
    public.channel_consent_status(
      -- One resolver, shared with every writer (3c-2). It is SECURITY DEFINER,
      -- so a caller who cannot see the project — or who belongs to a different
      -- studio than the one the seat's consent lives under — still gets the
      -- studio this seat's ledger actually belongs to, and the join this
      -- expression used to need is gone with the inlined copy.
      public.project_consent_org(pp.project_id),
      'sms', pp.phone_e164),
    'not_asked')                                                 AS sms_consent_status,
  pp.updated_at                                                  AS updated_at
FROM public.project_parties pp

UNION ALL

-- ── TEAM BRANCH ──────────────────────────────────────────────────────────
SELECT
  tm.id                                                          AS roster_id,
  'team'::text                                                   AS source,
  tm.project_id                                                  AS project_id,
  tm.role                                                        AS kind,
  COALESCE(
    NULLIF(trim(p.display_name), ''),
    NULLIF(trim(p.full_name), ''),
    NULLIF(trim(split_part(p.email, '@', 1)), ''),
    'Teammate'
  )                                                               AS display_name,
  NULL::text                                                     AS company_name,
  p.email                                                        AS email,
  p.phone                                                        AS phone,
  NULL::text                                                     AS trade,
  om.job_title                                                   AS job_title,
  om.staff_role                                                  AS staff_role,
  NULL::uuid                                                     AS studio_contact_id,
  tm.user_id                                                     AS profile_id,
  false                                                           AS show_to_client,
  false                                                           AS has_active_field_link,
  NULL::text                                                     AS sms_consent_status,
  tm.updated_at                                                  AS updated_at
FROM public.project_team_members tm
JOIN public.projects pj ON pj.id = tm.project_id
LEFT JOIN public.profiles p ON p.id = tm.user_id
LEFT JOIN public.organization_members om
  ON om.user_id = tm.user_id
 AND om.organization_id = pj.studio_id
 AND om.status = 'active'
WHERE tm.removed_at IS NULL;

GRANT SELECT ON public.v_project_roster TO authenticated;

COMMENT ON VIEW public.v_project_roster IS
  'Call Sheet (Wave 3): the project roster — every tracked project_parties '
  'row (source=party) UNION ALL every active project_team_members login '
  '(source=team), one shape for the Call Sheet UI. security_invoker = true: '
  'base-table RLS on project_parties, project_team_members, profiles, and '
  'organization_members governs what each caller actually sees; the om join '
  'degrading to NULL job_title/staff_role for a viewer without co-member '
  'visibility is intended, not a leak. has_active_field_link checks '
  'field_link_tokens (00283) for a live, unexpired, unrevoked token; that '
  'table is designer-only RLS, so a non-designer viewer sees false even when '
  'a link exists — same degrade posture as the om join.';

CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── CLIENTS ───────────────────────────────────────────────────────────────
-- v4: meta gains has_sent_proposal + issued_on_paper (this migration).
-- Everything else in this branch is unchanged from 00420.
SELECT
  dc.id                                                          AS person_id,
  'client'::text                                                 AS role,
  COALESCE(dc.client_name, pr.full_name, pr.display_name, dc.client_email, 'Unnamed client') AS display_name,
  COALESCE(dc.client_email, pr.email)                            AS email,
  -- NULLIF(btrim(...)) — COALESCE only falls through on NULL, and an
  -- empty-string profiles.phone would otherwise win over a real captured
  -- number and read the row blank (review R2 F11). Nothing forbids '' on that
  -- column; only the studio's own capture answers for it here. Both legs are
  -- guarded, not just the profile one: a whitespace-only captured number
  -- would otherwise fall straight through and render the same blank cell
  -- (review R3-05).
  COALESCE(NULLIF(btrim(pr.phone), ''), NULLIF(btrim(dc.client_phone), '')) AS phone,
  dc.client_id                                                   AS profile_id,
  NULL::uuid                                                     AS project_id,
  dc.designer_id                                                 AS designer_id,
  dc.status                                                      AS status_raw,
  COALESCE(dc.last_contacted_at, dc.last_project_at, dc.updated_at) AS last_touch_at,
  jsonb_build_object(
    'total_projects',     dc.total_projects,
    'total_revenue',      dc.total_revenue,
    'last_project_at',    dc.last_project_at,
    'last_contacted_at',  dc.last_contacted_at,
    'first_project_at',   dc.first_project_at,
    'style_tags',         dc.style_tags,
    'source',             dc.source,
    'satisfaction_score', dc.satisfaction_score,
    'nickname',           dc.nickname,
    'location',           dc.location,
    'lead_id',            dc.lead_id
  ) || public.designer_client_send_evidence(dc.id, dc.designer_id, dc.client_id)
                                                                 AS meta,
  (CASE WHEN dc.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text AS scope
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE public.is_studio_comember(dc.designer_id)

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
-- Unchanged from 00420.
SELECT
  l.id,
  'lead',
  COALESCE(l.contact_name, hp.full_name, hp.display_name, l.contact_email, 'New lead'),
  COALESCE(l.contact_email, hp.email),
  COALESCE(NULLIF(btrim(hp.phone), ''), NULLIF(btrim(l.contact_phone), '')),
  l.homeowner_id,
  NULL::uuid,
  l.designer_id,
  l.status,
  COALESCE(l.contacted_at, l.created_at),
  jsonb_build_object(
    'project_type',      l.project_type,
    'project_description', l.project_description,
    'budget_range',      l.budget_range,
    'timeline',          l.timeline,
    'match_score',       l.match_score,
    'location_city',     l.location_city,
    'location_state',    l.location_state,
    'response_deadline', l.response_deadline,
    'created_at',        l.created_at
  ),
  (CASE WHEN l.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text
FROM public.leads l
LEFT JOIN public.profiles hp ON hp.id = l.homeowner_id
WHERE public.is_studio_comember(l.designer_id)
  AND l.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

-- ── MAKERS / VENDORS (saved or engaged, studio-wide) ──────────────────────
-- Unchanged from 00420.
SELECT
  v.id,
  'maker',
  v.name,
  COALESCE(v.orders_email, v.trade_account_email),
  NULL::text,
  v.contact_profile_id,
  NULL::uuid,
  auth.uid(),
  v.nomination_status,
  v.updated_at,
  jsonb_build_object(
    'primary_category',      v.primary_category,
    'lead_times',            v.lead_times,
    'default_payment_terms', v.default_payment_terms,
    'founding_circle',       v.founding_circle,
    'made_in',               v.made_in,
    'trade_terms',           v.trade_terms,
    'is_patina_catalog',     v.is_patina_catalog,
    'review_count',          v.review_count,
    'designer_rating_avg',   v.designer_rating_avg
  ),
  (CASE
     WHEN EXISTS (
       SELECT 1 FROM public.saved_vendors mine
       WHERE mine.vendor_id = v.id
         AND mine.designer_id = (select auth.uid())
     ) THEN 'mine'
     ELSE 'studio'
   END)::text
FROM public.vendors v
WHERE v.id IN (
  SELECT sv.vendor_id
  FROM public.saved_vendors sv
  WHERE public.is_studio_comember(sv.designer_id)
  UNION
  SELECT pp.vendor_id
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  WHERE pp.vendor_id IS NOT NULL
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
)

UNION ALL

-- ── FIELD / ROSTER PARTIES on studio projects ─────────────────────────────
-- Unchanged from 00420.
SELECT
  pp.id,
  pp.party_kind,
  pp.display_name,
  pp.email,
  pp.phone,
  pp.profile_id,
  pp.project_id,
  auth.uid(),
  -- status_raw and the meta both read the RECORD (R-AS): the seat's own
  -- column is frozen legacy since 00594.
  COALESCE(public.channel_consent_status(
    -- One resolver, shared with every writer (3c-2).
    public.project_consent_org(pp.project_id),
    'sms', pp.phone_e164), 'not_asked'),
  pp.updated_at,
  jsonb_build_object(
    'company_name',       pp.company_name,
    'vendor_id',          pp.vendor_id,
    'project_name',       pj.name,
    'party_kind',         pp.party_kind,
    'trade',              pp.trade,
    'phone_e164',         pp.phone_e164,
    'sms_consent_status', COALESCE(public.channel_consent_status(
      -- One resolver, shared with every writer (3c-2).
      public.project_consent_org(pp.project_id),
      'sms', pp.phone_e164), 'not_asked'),
    'sms_consented_at',   pp.sms_consented_at,
    'sms_opt_out_at',     pp.sms_opt_out_at,
    'show_to_client',     pp.show_to_client,
    'studio_contact_id',  pp.studio_contact_id
  ),
  (CASE
     WHEN pj.designer_id      = (select auth.uid())
       OR pj.lead_designer_id = (select auth.uid())
       OR pj.created_by       = (select auth.uid())
     THEN 'mine' ELSE 'studio'
   END)::text
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
WHERE pp.party_kind IN ('gc', 'sub', 'installer', 'receiver',
                        'architect', 'photographer', 'stager')
  AND ( public.is_studio_comember(pj.designer_id)
     OR public.is_studio_comember(pj.lead_designer_id)
     OR public.is_studio_comember(pj.created_by) )

UNION ALL

-- ── TEAM (studio collaborators on studio projects, one row per teammate) ───
-- Unchanged from 00420.
SELECT
  t.id,
  'team',
  COALESCE(tp.full_name, tp.display_name, tp.email, 'Teammate'),
  tp.email,
  tp.phone,
  t.user_id,
  t.project_id,
  auth.uid(),
  t.role,
  t.assigned_at,
  jsonb_build_object(
    'role',         t.role,
    'project_name', t.project_name,
    'job_title',    t.job_title,
    'staff_role',   t.staff_role
  ),
  (CASE WHEN t.is_mine THEN 'mine' ELSE 'studio' END)::text
FROM (
  SELECT DISTINCT ON (tm.user_id)
    tm.id, tm.user_id, tm.role, tm.project_id, tm.assigned_at, pj.name AS project_name,
    om.job_title  AS job_title,
    om.staff_role AS staff_role,
    ( pj.designer_id      = (select auth.uid())
   OR pj.lead_designer_id = (select auth.uid())
   OR pj.created_by       = (select auth.uid()) ) AS is_mine
  FROM public.project_team_members tm
  JOIN public.projects pj ON pj.id = tm.project_id
  LEFT JOIN public.organization_members om
    ON om.user_id = tm.user_id
   AND om.organization_id = pj.studio_id
   AND om.status = 'active'
  WHERE tm.removed_at IS NULL
    AND tm.user_id <> auth.uid()
    AND tm.role IN ('lead_designer', 'support_designer', 'bookkeeper', 'previous_lead')
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
  ORDER BY tm.user_id, tm.assigned_at DESC
) t
LEFT JOIN public.profiles tp ON tp.id = t.user_id

UNION ALL

-- ── CONTACTS (the shared rolodex, 00417) ──────────────────────────────────
-- Unchanged from 00420.
SELECT
  sc.id,
  'contact',
  COALESCE(sc.full_name, sc.company_name),
  sc.email,
  sc.phone,
  sc.profile_id,
  NULL::uuid,
  sc.created_by,
  (CASE WHEN sc.archived_at IS NULL THEN 'active' ELSE 'archived' END)::text,
  sc.updated_at,
  jsonb_build_object(
    'contact_kind',    sc.contact_kind,
    'entity_kind',     sc.entity_kind,
    'company_name',    sc.company_name,
    'company_id',      sc.company_id,
    'specialties',     sc.specialties,
    'vendor_id',       sc.vendor_id,
    'organization_id', sc.organization_id,
    'archived_at',     sc.archived_at
  ),
  (CASE WHEN sc.created_by = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text
FROM public.studio_contacts sc
WHERE public.is_active_studio_member(sc.organization_id);

COMMENT ON VIEW public.people_directory IS
  'R57 / People Room roster (client|lead|maker|gc|sub|installer|receiver|'
  'architect|photographer|stager|team|contact) for the querying user. v6 '
  '(00589): PHONE ONLY is profile-first on the client and lead branches — '
  'COALESCE(NULLIF(btrim(profiles.phone), ''''), '
  'NULLIF(btrim(designer_clients.client_phone), '''')) and the same over '
  'leads.contact_phone, so a whitespace-only number on either side reads as '
  'no number rather than as a blank cell. An '
  'account holder''s own number is theirs to manage and the studio is given no '
  'field to edit it, so it wins over a number taken at the front door, which '
  'is the order the household sheet and the Brief already read. display_name '
  'and email in those branches stay CAPTURED-first, so one directory row can '
  'pair the studio''s captured name with the household''s own number — '
  'deliberate, and display-only: no SMS or email dispatch reads this view''s '
  'phone (dispatch reads project_parties.phone_e164). The captured column '
  'still answers for a household with no Patina account, and on the lead '
  'branch it answers for nearly every open lead: profiles RLS hides a '
  'homeowner from a studio that has no designer_clients row with them yet, so '
  'the profile leg only speaks once some other relationship exists. v5 '
  '(00583): those two '
  'branches gained the captured columns at all, so a phone taken at capture '
  'shows instead of reading blank. v4 (00478): the client branch''s meta gains '
  'has_sent_proposal and issued_on_paper from '
  'designer_client_send_evidence(), so the directory/Nurture derivations can '
  'tell a merely-drafted agreement from one that was really emailed and from '
  'one handed over on paper (00477), instead of all three reading as '
  'status_raw = ''proposal''. Read them paper-first, then send evidence, then '
  'draft. v3 (00420): every branch is STUDIO-scoped via is_studio_comember '
  '(00315), a contacts branch surfaces the shared rolodex (studio_contacts, '
  '00417), and the appended `scope` column reads ''mine'' | ''studio'' for the '
  'scope lens. The party branch admits the 00419 roster kinds but excludes '
  '''client'' (it would collide with the clients branch''s role semantics). '
  'security_invoker view — base-table RLS still governs, so branches over '
  'tables that are not studio-widened (project_parties, project_team_members, '
  'saved_vendors) widen only for callers those tables already admit.';

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
--      AND THE REFUSAL KEEPS ITS OWN EVIDENCE SET (r8 W4-M2). A refusal writes
--      opt_out_source / opt_out_evidence / opt_out_recorded_at /
--      opt_out_recorded_by as well as the shared set; no later verdict, and no
--      reconsent, may write them. One evidence set could only ever hold the
--      LATEST act, so the studio's fresh consent recorded over a STOP erased
--      "Replied STOP", source inbound_sms — the carrier-audit artifact of the
--      refusal itself, and the noun R-Q's "Opted out BY TEXT, 3 Dec 2025"
--      prints — from the record and, through the mirror, from every seat.
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
  -- THIS org, resolved the way the fold resolves it, so R-AK is not reopened:
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
  --   refusal wrote `pending` and a NULL opt_out_at over the record's own
  --   refusal and its date, and the `granted` call after it then
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
  -- `pending` clears the refusal off the record exactly as `granted` does).
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
  -- door opens again. NOTHING HERE LOWERS IT ON SMS (r7 M7-1; email is the one
  -- exception, r6 R6-M3 — there is no inbound START to wait for, so the
  -- studio's recorded grant is the answer). A record already AT
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
    opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by,
    origin_project_id
  )
  VALUES (
    p_organization_id, p_channel_kind, v_value, p_status,
    CASE WHEN p_status = 'granted'   THEN v_now END,
    CASE WHEN p_status = 'opted_out' THEN v_now END,
    p_status = 'opted_out',
    p_source, p_evidence, v_now, p_disclosure_version, auth.uid(),
    -- THE REFUSAL'S OWN EVIDENCE (r8 W4-M2). Written only when the verdict IS
    -- the refusal, so "Replied STOP" / inbound_sms stays on the record beside
    -- whatever the studio records later. Nothing in this file but a fresh
    -- refusal touches these four again — reconsent() in particular does not.
    CASE WHEN p_status = 'opted_out' THEN p_source END,
    CASE WHEN p_status = 'opted_out' THEN p_evidence END,
    CASE WHEN p_status = 'opted_out' THEN v_now END,
    CASE WHEN p_status = 'opted_out' THEN auth.uid() END,
    p_origin_project_id
  )
  ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
  SET status = EXCLUDED.status,
      -- A date already earned is kept when the new verdict does not restate it:
      -- "granted 2 May 2025, opted out 3 Dec 2025" must both survive.
      consented_at = CASE WHEN EXCLUDED.status = 'granted'
                          THEN EXCLUDED.consented_at ELSE scc.consented_at END,
      -- THE REFUSAL KEEPS THE DATE IT ALREADY HAS (r7 R7-M1). A second refusal
      -- recorded over a standing one is not a new refusal: it has stood since
      -- the day it arrived, and that day is what R-Q's sentence prints and what
      -- a carrier audit asks for. Stamping v_now walked "opted out 3 Dec 2025"
      -- forward to today on one ordinary call, through the very door the
      -- channel_opted_out HINT instructs the studio to use. LEAST skips NULLs,
      -- so a DATELESS refusal -- the shape the shipped portal writes on purpose
      -- and the fold mints verbatim -- does take the date of the refusal being
      -- recorded now: that is dating a refusal that had none, not overwriting
      -- one.
      opt_out_at   = CASE WHEN EXCLUDED.status = 'opted_out'
                          THEN LEAST(scc.opt_out_at, EXCLUDED.opt_out_at)
                          ELSE scc.opt_out_at END,
      -- A refusal raises the flag; NO verdict written through this door lowers
      -- it (r7 M7-1). Only the inbound rail's own write does, when the person
      -- who refused answers. A studio re-recording the consent it holds —
      -- `granted` or `pending` — does not answer the refusal, and the WHERE
      -- below means the only writes that reach here while one stands are the
      -- refusals themselves.
      refusal_unanswered = CASE
                             WHEN EXCLUDED.status = 'opted_out' THEN true
                             -- THE EMAIL ASYMMETRY (r6 R6-M3). An email refusal
                             -- has no inbound START to answer it, so the grant
                             -- the studio records IS the answer — see the
                             -- WHERE's email leg below and the header.
                             WHEN EXCLUDED.channel_kind = 'email'
                              AND EXCLUDED.status = 'granted' THEN false
                             ELSE scc.refusal_unanswered END,
      -- THE CONSENT SIDE IS NOT FREE SPACE (r6 R6-M1). A refusal writes NONE of
      -- these five: they belong to the GRANT whose consented_at this same
      -- statement keeps, and the refusal has four columns of its own below.
      -- Before this, one ordinary PR-m act — a written kickoff-form grant, then
      -- a verbal refusal the studio heard — left the record reading
      -- (verbal, "He told me on site") against the GRANT's date, so R-Q's grant
      -- sentence composed to "Verbal consent, 2 May 2025" and the consent's own
      -- 10DLC artifact was gone with no audit row. That is verbatim W4-M2's
      -- failure arriving from the other side, and it contradicts :1139-1142's
      -- rule that the evidence a consent stood on is a fact the audit keeps.
      --
      -- r7 R7-M1's consolation is WITHDRAWN with it: a studio refusal recorded
      -- over a texted one no longer "lands on the consent side" either. A
      -- second refusal adds no fact the record lacks, and the only place to put
      -- it was on top of a consent's evidence. Nothing is written rather than
      -- the wrong thing.
      --
      -- AND BLANKNESS IS TESTED THE WAY EVERY GATE IN THIS RPC TESTS IT (r6
      -- R6-M2): NULLIF(btrim(…), ''), not IS NULL. p_disclosure_version is the
      -- one evidence argument the opted_out branch does not require, so a
      -- caller sending an empty form field rather than omitting it used to
      -- write '' straight over the stored version — the single column
      -- :1139-1142 names as the one a refusal may not touch — and nothing in
      -- the file restores it. Kept on source and evidence for the same reason.
      source             = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.source
                                ELSE COALESCE(NULLIF(btrim(EXCLUDED.source), ''), scc.source) END,
      evidence           = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.evidence
                                ELSE COALESCE(NULLIF(btrim(EXCLUDED.evidence), ''), scc.evidence) END,
      recorded_at        = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.recorded_at
                                ELSE EXCLUDED.recorded_at END,
      disclosure_version = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.disclosure_version
                                ELSE COALESCE(NULLIF(btrim(EXCLUDED.disclosure_version), ''),
                                              scc.disclosure_version) END,
      recorded_by        = CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.recorded_by
                                ELSE COALESCE(EXCLUDED.recorded_by, scc.recorded_by) END,
      -- A NEW refusal restates the refusal's own evidence; every other verdict
      -- leaves it exactly as it stands (r8 W4-M2). This is the half of the
      -- record a later consent must not be able to speak for.
      --
      -- AND A STUDIO-SOURCED REFUSAL NEVER SPEAKS FOR A TEXTED ONE (r7 R7-M1).
      -- The seat gate's HINT tells a studio facing an opted_out seat to
      -- "record that refusal here first"; obeying it over a number that really
      -- replied STOP used to write (verbal, "He told me on site", today, that
      -- member) straight over (inbound_sms, "Inbound STOP", 3 Dec 2025, NULL) --
      -- on the record and, through the mirror, on every seat. Sending stayed
      -- blocked, but the 10DLC artifact that the refusal ARRIVED BY TEXT was
      -- gone with no audit row, and opt_out_recorded_by named a studio member
      -- for a refusal the recipient made -- the attribution the inbound rail
      -- deliberately writes NULL to avoid. "They texted STOP / we also heard it
      -- verbally" is not a pair this record has to collapse -- and since r6
      -- R6-M1 the studio's account does not go on the CONSENT side either: that
      -- side is the GRANT's evidence, not free space. The hearsay refusal
      -- writes nothing at all, which is what a duplicate refusal is worth.
      -- A second INBOUND refusal does restate all four -- that is the carrier
      -- speaking again, and its later words are the better ones.
      opt_out_source      = CASE
                              WHEN EXCLUDED.status <> 'opted_out'
                                THEN scc.opt_out_source
                              WHEN scc.opt_out_source = 'inbound_sms'
                               AND EXCLUDED.opt_out_source IS DISTINCT FROM 'inbound_sms'
                                THEN scc.opt_out_source
                              ELSE EXCLUDED.opt_out_source END,
      opt_out_evidence    = CASE
                              WHEN EXCLUDED.status <> 'opted_out'
                                THEN scc.opt_out_evidence
                              WHEN scc.opt_out_source = 'inbound_sms'
                               AND EXCLUDED.opt_out_source IS DISTINCT FROM 'inbound_sms'
                                THEN scc.opt_out_evidence
                              ELSE EXCLUDED.opt_out_evidence END,
      opt_out_recorded_at = CASE
                              WHEN EXCLUDED.status <> 'opted_out'
                                THEN scc.opt_out_recorded_at
                              WHEN scc.opt_out_source = 'inbound_sms'
                               AND EXCLUDED.opt_out_source IS DISTINCT FROM 'inbound_sms'
                                THEN scc.opt_out_recorded_at
                              ELSE EXCLUDED.opt_out_recorded_at END,
      opt_out_recorded_by = CASE
                              WHEN EXCLUDED.status <> 'opted_out'
                                THEN scc.opt_out_recorded_by
                              WHEN scc.opt_out_source = 'inbound_sms'
                               AND EXCLUDED.opt_out_source IS DISTINCT FROM 'inbound_sms'
                                THEN scc.opt_out_recorded_by
                              ELSE EXCLUDED.opt_out_recorded_by END,
      -- The origin follows the CURRENT verdict, in both writers (the inbound
      -- rail agrees: pipeline.ts writes t.projectId ?? prior). R-Q's sentence
      -- names the job the verdict on the books came from, not an older one.
      origin_project_id  = COALESCE(EXCLUDED.origin_project_id, scc.origin_project_id)
  WHERE (scc.status IS DISTINCT FROM 'opted_out'
         OR EXCLUDED.status = 'opted_out'
         -- EMAIL HAS NO INBOUND START, SO THE STUDIO'S FRESH CONSENT IS THE WAY
         -- BACK (r6 R6-M3). Everything above is written for the SMS rail, where
         -- the recipient's own YES/START is what reopens sending and 10DLC says
         -- it must be. There is no such reply on email: nothing in the tree
         -- writes an email consent row, the inbound rail is SMS-only
         -- (pipeline.ts writes channel_kind 'sms'), and reconsent() leaves the
         -- status where it is — so an email refusal recorded by a studio member
         -- was PERMANENT, a dead address in that studio's book with no door at
         -- all. PR-m's ruling is "a fresh recorded consent OR an inbound
         -- START"; for email only the first half can exist, so it is the one
         -- that operates. The evidence gate above already forces a `granted`
         -- to carry source + evidence + disclosure_version, which is exactly
         -- what "a fresh recorded consent" means. `pending` is NOT let through:
         -- the double opt-in is the SMS rail's dance.
         OR (EXCLUDED.channel_kind = 'email' AND EXCLUDED.status = 'granted'))
    -- Stated on whether a refusal STANDS, not on which verdict is written
    -- (r6 B6-1). `EXCLUDED.status <> 'granted'` let `pending` through while an
    -- unanswered refusal stood, and a `pending` that lands is a `pending` the
    -- moves the record off its refusal — the standing fact gone, and the
    -- record moved off the status reconsent() needs to act on. Only `opted_out`
    -- is exempt: recording the refusal is the way forward. A record already at
    -- `granted` is NOT exempt either (r7 M7-1): the escape that let it restate
    -- its evidence was the one write that lowered the flag, and the fold mints
    -- the row it fired on.
    AND (EXCLUDED.status = 'opted_out'
         -- The same email leg (r6 R6-M3). refusal_unanswered is the flag the
         -- send rail reads, so letting the grant through without lowering it
         -- would be a door onto nothing; the SET above lowers it on exactly
         -- this leg. opt_out_at is kept either way — "opted out 3 Dec 2025,
         -- consented again 12 Sep 2026" must both stay printable (R-Q).
         OR (EXCLUDED.channel_kind = 'email' AND EXCLUDED.status = 'granted')
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
    -- NO WRITE THROUGH THIS DOOR LOWERS A STANDING GRANT (close-review r2
    -- MAJOR-1). `pending` is an INVITE — the first half of the SMS double
    -- opt-in — and an invite is not news about a number the studio already
    -- holds a recorded, evidenced grant for. Every other leg above asks
    -- whether a REFUSAL stands; none of them looked at the other direction, so
    -- granted -> pending passed cleanly, and the act the room performs most
    -- often (adding a repeat sub to a second job with "text updates" ticked)
    -- walked the studio's own grant down to `pending` on every add. Three
    -- things went with it: the room printed "Invited" for a number it holds a
    -- grant for; channelConsentVerdict dropped from "allow" to "unknown", so
    -- sms.ts refused every non-invite send as not_consented against a seat born
    -- `pending` (fixture F-11 — exactly the half of G-3 sms.ts:404-410 says
    -- this record exists to fix); and the five evidence columns were restated
    -- by the new act while consented_at kept the OLD grant's date, so R-Q
    -- composed "Verbal consent, 2 May 2025" and the disclosure version the
    -- person was actually shown was gone from the only copy there is — r6
    -- R6-M1 / r9 M1 arriving through a third door.
    --
    -- The gate is stated HERE, inside the write, for the same reason every
    -- other gate in this statement is: a read-then-write ahead of the upsert
    -- cannot see a grant that lands in the gap. record_channel_invite() is the
    -- named door the add path uses — it mints a `pending` only when no grant
    -- stands, and treats this refusal as "the grant already covers it".
    --
    -- Narrow on purpose: only `pending` over `granted`. A studio that really
    -- means to withdraw a grant records the REFUSAL, which is always open.
    AND NOT (EXCLUDED.status = 'pending' AND scc.status = 'granted')
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
      -- On email, `granted` never reaches here (r6 R6-M3's leg lets it through),
      -- so the only verdict this refuses on an email refusal is `pending` — and
      -- the double opt-in it asks for is the SMS rail's dance. Say so rather
      -- than telling an email address to reply START.
      IF p_channel_kind = 'email' THEN
        RAISE EXCEPTION 'channel_opted_out'
          USING HINT = 'This address already opted out, and `pending` is the SMS '
                       'opt-in dance — there is no inbound START on email. '
                       'Record the studio''s fresh consent as `granted`, with '
                       'its source, evidence and disclosure version: on email '
                       'that IS PR-m''s way back.';
      END IF;
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

    -- The downgrade leg (close-review r2 MAJOR-1). Named, so the caller can
    -- tell "your invite is redundant, the grant already stands" apart from
    -- "a refusal stands and you may not write at all" — the two are opposite
    -- facts and the generic sentence below says the wrong one.
    --
    -- IT IS THE SECOND-WEAKEST CLAIM ON THIS BRANCH, so it is tested last but
    -- one: a `granted` carrying an UNANSWERED REFUSAL is not a grant that
    -- stands — it is unsendable (channel_consent_status reads it as opted_out)
    -- and what refused the write was the refusal leg, not this one. The
    -- condition therefore mirrors that leg exactly, so such a row still reports
    -- consent_awaiting_recipient and reconsent() is still the door named.
    IF p_status = 'pending'
       AND v_row.status = 'granted'
       AND v_row.refusal_unanswered IS NOT TRUE
       AND (v_row.opt_out_at IS NULL
            OR (v_row.consented_at IS NOT NULL
                AND v_row.consented_at > v_row.opt_out_at)) THEN
      RAISE EXCEPTION 'consent_already_granted'
        USING HINT = 'This studio already holds a recorded grant for this '
                     'number, so there is no invite to send and nothing to '
                     'lower it to. record_channel_invite() is the add path''s '
                     'door: it leaves a standing grant exactly as it is.';
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
  'SMS transition OUT of opted_out (channel_opted_out — record_channel_reconsent() '
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
  'verdict is being written — a recorded `pending` clears the record''s own '
  'refusal exactly as a `granted` does, and was the ungated first hop); '
  'stamps the refusal''s OWN evidence set (opt_out_source, opt_out_evidence, '
  'opt_out_recorded_at, opt_out_recorded_by) when and only when the verdict is '
  'opted_out, and leaves it untouched on every other verdict, so a later '
  'consent cannot speak for the refusal (r8 W4-M2) — nor may a later REFUSAL: '
  'the record keeps the earliest opt_out_at, and a studio-sourced refusal '
  'recorded over an inbound_sms one (the path the seat-gate hint instructs) '
  'leaves all four columns standing and writes nothing in their place — not on '
  'the consent side either, which holds the grant''s evidence (r7 R7-M1 as '
  'narrowed by r6 R6-M1); '
  'ON EMAIL THE OPTED_OUT GATE IS ASYMMETRIC (r6 R6-M3): a `granted` with its '
  'source, evidence and disclosure version passes it and LOWERS '
  'refusal_unanswered, because email has no inbound START — the rail is SMS-only '
  '— so PR-m''s "a fresh recorded consent OR an inbound START" has only its '
  'first half there, and without this an email refusal was permanent; `pending` '
  'stays refused on email (the double opt-in is the SMS dance), and every SMS '
  'rule above is unchanged; '
  'never empties the evidence set — source, '
  'evidence, disclosure_version and recorded_by are kept when the new verdict '
  'does not restate them (blankness tested as NULLIF(btrim(…), ''''), not IS '
  'NULL, so an empty form field cannot wipe the disclosure version a refusal is '
  'not even asked for — r6 R6-M2), and laundering is closed by the evidence '
  'gate, since '
  'every accepted status must supply its own source and evidence; A REFUSAL '
  'WRITES NONE OF THOSE FIVE (r6 R6-M1) — they are the GRANT''s evidence, '
  'standing beside the consented_at this door keeps, and the refusal has its own '
  'four; normalises '
  'the channel value through normalize_channel_value(); stamps '
  'recorded_by/recorded_at; keeps an earlier granted/opt-out date when the '
  'new verdict does not restate it; and REFUSES `pending` over a standing '
  '`granted` (consent_already_granted, close-review r2 MAJOR-1) — an invite is '
  'not news about a grant the studio already holds, and letting it land '
  'demoted the record, printed "Invited" for a granted number, refused every '
  'non-invite send as not_consented, and filed the new act''s words under the '
  'old grant''s date; record_channel_invite() is the add path''s door (00594).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4b. record_channel_invite — the add path's door, which never lowers a grant
-- ═══════════════════════════════════════════════════════════════════════════
-- close-review r2 MAJOR-1. useAddProjectParty records the studio's consent
-- BEFORE it writes the seat, so the room never prints "Not asked" for someone
-- Patina has just texted (close-review r1 MAJOR-2). It did that by calling
-- record_channel_consent(…, 'pending', …) unconditionally — and `pending` is
-- the FIRST half of the double opt-in, so on a repeat sub the studio already
-- holds a grant for, the most ordinary act in the room walked that grant down.
--
-- The gate inside record_channel_consent now refuses that write. This is the
-- other half of the fix: the add path needs a door that says "record the
-- invite IF there is nothing better on the books", and asking it to read the
-- record first from the client would be a read-then-write across the network —
-- the one shape this file has refused everywhere else.
--
-- So: one statement's worth of decision, server-side, under the same
-- membership gate. A standing `granted` is returned UNTOUCHED — no write, no
-- audit row, no date moved, and the seat that follows inherits the studio's
-- grant through channelConsentVerdict's "allow" branch (sms.ts:404-410, the
-- half of G-3 the per-party ledger cannot do, fixture F-11). Anything else
-- goes to record_channel_consent, which applies every gate it always did:
-- evidence required, the seat refusal, the unanswered refusal, the normalizer.
--
-- The EXCEPTION handler is the race, not a second opinion: a grant that lands
-- between the read and the call comes back as consent_already_granted from the
-- statement-level gate, and the honest answer to it is the same answer —
-- the grant stands, return it.
CREATE OR REPLACE FUNCTION public.record_channel_invite(
  p_organization_id    uuid,
  p_channel_kind       text,
  p_channel_value      text,
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
  v_row   public.studio_channel_consent;
BEGIN
  -- The membership gate is stated HERE as well as inside the sibling: this
  -- door READS the record on the standing-grant leg and returns it, so a
  -- non-member must be refused before the read, not after it. (SECURITY
  -- DEFINER, so the table's RLS is not the backstop it is for the views.)
  IF NOT public.is_active_studio_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_a_studio_member'
      USING HINT = 'Only an active, non-guest member of this studio may record consent.';
  END IF;

  IF p_channel_kind NOT IN ('sms', 'email') THEN
    RAISE EXCEPTION 'invalid_channel_kind';
  END IF;

  -- The same normalizer both siblings use (00593), so this door cannot look up
  -- a different key than the one record_channel_consent would write.
  v_value := public.normalize_channel_value(p_channel_kind, p_channel_value);
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_value';
  END IF;

  SELECT * INTO v_row
    FROM public.studio_channel_consent scc
   WHERE scc.organization_id = p_organization_id
     AND scc.channel_kind    = p_channel_kind
     AND scc.channel_value   = v_value;

  -- A STANDING GRANT IS THE BETTER FACT — but only a SENDABLE one. A record
  -- reading `granted` with an unanswered refusal under it is unsendable
  -- (channel_consent_status reads it as opted_out and the send gate refuses),
  -- so there is no grant to protect: the call below is allowed to refuse it
  -- properly and name reconsent(). The predicate is the sibling's own refusal
  -- leg, word for word, so the two doors cannot drift apart on what "stands".
  IF FOUND
     AND v_row.status = 'granted'
     AND v_row.refusal_unanswered IS NOT TRUE
     AND (v_row.opt_out_at IS NULL
          OR (v_row.consented_at IS NOT NULL
              AND v_row.consented_at > v_row.opt_out_at)) THEN
    RETURN v_row;
  END IF;

  BEGIN
    RETURN public.record_channel_consent(
      p_organization_id, p_channel_kind, v_value, 'pending',
      p_source, p_evidence, p_disclosure_version, p_origin_project_id);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'consent_already_granted' THEN
      RAISE;
    END IF;
    -- The race: a grant landed between the read above and the write. Same
    -- answer as the read would have given a moment later.
    SELECT * INTO v_row
      FROM public.studio_channel_consent scc
     WHERE scc.organization_id = p_organization_id
       AND scc.channel_kind    = p_channel_kind
       AND scc.channel_value   = v_value;
    RETURN v_row;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_channel_invite(uuid, text, text, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_channel_invite(uuid, text, text, text, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_channel_invite(uuid, text, text, text, text, text, uuid) IS
  'The add path''s door onto studio_channel_consent (close-review r2 MAJOR-1). '
  'Records the SMS opt-in invite as `pending` through record_channel_consent — '
  'every gate of that door applies — but ONLY when this studio holds no '
  'standing, sendable `granted` for the value; where one stands the record is '
  'returned untouched and nothing is written, so adding a repeat sub to a '
  'second job cannot demote the studio''s own recorded grant, refile its '
  'evidence under a new act''s words, or turn an "allow" send verdict into '
  '"unknown". A `granted` carrying an unanswered refusal is NOT treated as '
  'standing — it is unsendable (channel_consent_status reads it as opted_out), '
  'so the call falls through and is refused properly. Studio-member gated '
  'before the read, since it is SECURITY DEFINER; normalises through '
  'normalize_channel_value() so both doors share one key (00594).';

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
-- the `pending` hop DID do was move the record off the one status this door
-- can act on, so it could not be called twice, while clearing the refusal the
-- send rail falls back on. The studio was strictly worse off for having called
-- it.
--
-- So: the refusal keeps standing, the studio's fresh consent
-- goes on the record where the room can print it ("opted out by text, 3 Dec
-- 2025; fresh signed consent 11 Sep 2026, waiting on their reply"), and the
-- door stays re-callable. THAT SECOND HALF OF THE SENTENCE IS DATED BY THIS
-- DOOR (r9 M1): the five evidence columns and consented_at are one set, so the
-- consent recorded here carries today, not whatever older grant the record was
-- keeping — see the SET list. THE DOUBLE OPT-IN DOES NOT RUN FROM HERE, and no
-- invite is dispatched (fc_dispatch_optin_invite fires on a PARTY ROW moving to
-- an evidenced `pending`, and no consent act writes party rows since R-AS).
-- `granted` is the recipient's to give by
-- replying YES or START, which the inbound rail writes directly — the one
-- writer that lowers refusal_unanswered. PR-m's "a fresh recorded consent OR an
-- inbound START" is read this way on the record: the fresh recorded consent is
-- what the studio may WRITE; the inbound START is what reopens SENDING.
--
-- THAT READING IS THE SMS RAIL'S (r6 R6-M3). On email there is no inbound
-- START, so this door is not where an email refusal is answered: the studio
-- records `granted` through record_channel_consent(), which on email — and only
-- on email — passes the opted_out gate and lowers refusal_unanswered. This door
-- still works on an email record (it is evidence-only and harmless), but it is
-- not the way back there.
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
         -- opt_out_source / opt_out_evidence / opt_out_recorded_at /
         -- opt_out_recorded_by ARE NOT IN THIS LIST, and must never be (r8
         -- W4-M2). They are the REFUSAL's evidence; the five columns below are
         -- the STUDIO's. Before they existed this UPDATE wrote the studio's
         -- source and words over "Replied STOP" / inbound_sms while leaving the
         -- status at opted_out — so the record still refused every send but
         -- could no longer say what the refusal was or how it arrived, and the
         -- mirror pushed the same overwrite onto every seat in the studio on
         -- that number, taking the party-row copy with it. R-Q's sentence needs
         -- both halves printable at once.
         -- AND THE FRESH CONSENT DATES ITSELF (r9 M1). The five columns
         -- below are restated by every call, and consented_at is THE DATE OF
         -- THE ACT THEY DESCRIBE (R-Q, :159-170). Left on the older grant this
         -- door composed the exact sentence r6 R6-M1 closed one function up: a
         -- record holding (2 May 2025, written, "Signed the kickoff form", v3)
         -- came out of one ordinary call reading (verbal, "He said it is fine
         -- now", recorded today, v9) AGAINST 2 May 2025 — the new source and
         -- words filed under the old grant's date, so R-Q's grant sentence
         -- printed "Verbal consent, 2 May 2025"; and v3, the disclosure the
         -- person was actually shown at that grant, was destroyed on the record
         -- and, through the mirror's COALESCE (:1016), stamped as v9 onto every
         -- seat in the studio on that number. The studio's fresh consent is a
         -- NEW act: it gets today's date, and the five belong to it.
         --
         -- This moves NOTHING else (r7 M7-2): status stays opted_out,
         -- opt_out_at keeps the day the refusal arrived, refusal_unanswered
         -- stays TRUE. It opens no gate either — record_channel_consent's
         -- granted leg tests refusal_unanswered (:1608-1612), which this door
         -- keeps true, so "opted out 3 Dec 2025, fresh signed consent today,
         -- waiting on their reply" is exactly what the record now says.
         consented_at       = v_now,
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
  'recorded_at, disclosure_version, recorded_by, origin_project_id AND THE DATE '
  'OF THE CONSENT IT RECORDS (consented_at = now, r9 M1 — the five evidence '
  'columns and the date name the SAME act; leaving the older grant''s date under '
  'a fresh source composed R-Q''s sentence as "<new source> consent, <old grant '
  'date>" and silently replaced the disclosure version the person was shown at a '
  'grant this is not the grant for), and keeps '
  'status, opt_out_at, refusal_unanswered AND THE REFUSAL''S OWN EVIDENCE SET '
  '(opt_out_source / opt_out_evidence / opt_out_recorded_at / '
  'opt_out_recorded_by) exactly as they stand — before that set existed this '
  'door overwrote the STOP''s own source and words with the studio''s, on the '
  'record and, through the mirror, on every seat (r8 W4-M2). It does NOT '
  'run the double opt-in — it used to land on `pending`, but since r6 M6-3 the '
  'send rail refuses on refusal_unanswered whatever the status says, so that hop '
  'sent nothing, cleared the mirrored refusal off every seat, and left the row '
  'on a status this door cannot act on (so it could not be called again). '
  'Sending resumes only when the recipient replies YES or START, which the '
  'inbound rail writes directly — the one writer that lowers '
  'refusal_unanswered — after which record_channel_consent opens again. Safe to '
  'call more than once: each call restates the studio''s latest evidence '
  '(00594).';
