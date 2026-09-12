-- probe45-r-aw-negative-control.sql
--
-- Restores the PRE-00622 bodies inside ONE rolled-back transaction and walks
-- the same facts blocks 8, 19 and 44 now assert, so those assertions are
-- visibly not tautologies. Objects and fixtures only; the real ledger is never
-- read or written, and the transaction ends in ROLLBACK.
--
--   · 00374:1220-1331  site_request_send              (seat read + seat WRITE)
--   · 00374:1395-1460  site_request_dispatch_after_consent (seat gate)
--   · 00374:3399-3444  _site_request_consent_granted_dispatch (party-row keyed)
--   · 00594:1581-2087  record_channel_consent          (the three seat tests)
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f artifacts/people-room-crm-2026-09-11/build/probe45-r-aw-negative-control.sql

BEGIN;
SET LOCAL search_path TO public;

-- ── restore the pre-00622 objects ─────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION public.site_request_send(
  p_request_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.site_requests;
  v_party public.project_parties;
  v_expiry timestamptz;
  v_consent text;
  v_event_id uuid;
  v_outbox_id uuid;
BEGIN
  SELECT * INTO v_request FROM public.site_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_request.status NOT IN ('draft','awaiting_consent') THEN
    RAISE EXCEPTION 'request in % must use resend, not send', v_request.status
      USING errcode = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.site_request_items
    WHERE request_id = p_request_id AND current_version_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'request must contain at least one item' USING errcode = '22023';
  END IF;

  SELECT * INTO v_party
  FROM public.project_parties
  WHERE id = v_request.assignee_party_id
    AND project_id = v_request.project_id
  FOR UPDATE;
  IF NOT FOUND OR v_party.phone_e164 IS NULL THEN
    RAISE EXCEPTION 'assignee must have a normalized phone number'
      USING errcode = '22023';
  END IF;

  IF v_party.sms_consent_status = 'not_asked' THEN
    UPDATE public.project_parties
    SET sms_consent_status = 'pending'
    WHERE id = v_party.id;
    v_consent := 'pending';
  ELSE
    v_consent := v_party.sms_consent_status;
  END IF;

  UPDATE public.site_requests
  SET assignee_name_snapshot = v_party.display_name,
      assignee_phone_snapshot = v_party.phone_e164,
      assignee_trade_snapshot = v_party.trade,
      consent_status_snapshot = v_consent
  WHERE id = p_request_id;

  UPDATE public.site_request_dispatch_outbox
  SET status = 'cancelled', completed_at = now(),
      last_error = 'consent_already_granted'
  WHERE request_id = p_request_id
    AND action = 'consent-invite'
    AND status IN ('pending','processing')
    AND v_consent = 'granted';

  IF v_consent <> 'granted' THEN
    UPDATE public.site_requests
    SET status = 'awaiting_consent'
    WHERE id = p_request_id;

    v_event_id := public._site_request_append_event(
      p_request_id, 'consent_requested', 'designer', auth.uid(), NULL,
      NULL, NULL,
      jsonb_build_object('party_id', v_party.id, 'consent_status', v_consent),
      'consent-requested:' || p_request_id::text
    );
    v_outbox_id := public._site_request_enqueue_dispatch(
      p_request_id, 'consent-invite', v_event_id
    );
    RETURN public._site_request_dispatch_result(
      p_request_id, 'consent-invite', NULL, NULL, true,
      v_request.status = 'awaiting_consent', v_outbox_id
    );
  END IF;

  v_expiry := COALESCE(
    p_expires_at,
    GREATEST(v_request.due_at + interval '7 days', now() + interval '7 days')
  );
  UPDATE public.site_requests
  SET consent_status_snapshot = 'granted',
      expires_at = v_expiry
  WHERE id = p_request_id;

  v_event_id := public._site_request_append_event(
    p_request_id, 'request_send_requested', 'designer', auth.uid(), NULL,
    NULL, NULL,
    jsonb_build_object('expires_at', v_expiry),
    'request-send-requested:' || p_request_id::text
  );
  v_outbox_id := public._site_request_enqueue_dispatch(
    p_request_id, 'send', v_event_id
  );
  RETURN public._site_request_dispatch_result(
    p_request_id, 'send', NULL, NULL, false, false, v_outbox_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_dispatch_after_consent(
  p_request_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.site_requests;
  v_party public.project_parties;
  v_expiry timestamptz;
  v_event_id uuid;
  v_outbox_id uuid;
BEGIN
  SELECT * INTO v_request FROM public.site_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;
  IF v_request.status IN ('completed','closed','expired') THEN
    RAISE EXCEPTION 'terminal request cannot dispatch' USING errcode = '55000';
  END IF;

  SELECT * INTO v_party
  FROM public.project_parties
  WHERE id = v_request.assignee_party_id
    AND project_id = v_request.project_id
  FOR UPDATE;
  IF NOT FOUND OR v_party.sms_consent_status <> 'granted' OR v_party.phone_e164 IS NULL THEN
    RAISE EXCEPTION 'assignee has not granted SMS consent' USING errcode = '55000';
  END IF;

  v_expiry := COALESCE(
    p_expires_at,
    GREATEST(v_request.due_at + interval '7 days', now() + interval '7 days')
  );
  UPDATE public.site_requests
  SET consent_status_snapshot = 'granted',
      assignee_name_snapshot = v_party.display_name,
      assignee_phone_snapshot = v_party.phone_e164,
      assignee_trade_snapshot = v_party.trade,
      expires_at = v_expiry
  WHERE id = p_request_id;

  UPDATE public.site_request_dispatch_outbox
  SET status = 'cancelled', completed_at = now(),
      last_error = 'consent_already_granted'
  WHERE request_id = p_request_id
    AND action = 'consent-invite'
    AND status IN ('pending','processing');

  v_event_id := public._site_request_append_event(
    p_request_id, 'consent_granted_dispatch_ready', 'service', NULL, NULL,
    NULL, NULL,
    jsonb_build_object('expires_at', v_expiry),
    'consent-dispatch-ready:' || p_request_id::text
  );
  v_outbox_id := public._site_request_enqueue_dispatch(
    p_request_id, 'consent-granted', v_event_id
  );
  RETURN public._site_request_dispatch_result(
    p_request_id, 'consent-granted', NULL, NULL, false, false, v_outbox_id
  );
END;
$$;

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

DROP TRIGGER IF EXISTS site_request_consent_granted_dispatch ON public.studio_channel_consent;
DROP TRIGGER IF EXISTS site_request_consent_granted_dispatch ON public.project_parties;
CREATE TRIGGER site_request_consent_granted_dispatch
  AFTER UPDATE OF sms_consent_status ON public.project_parties
  FOR EACH ROW
  WHEN (
    OLD.sms_consent_status IS DISTINCT FROM NEW.sms_consent_status
    AND NEW.sms_consent_status = 'granted'
  )
  EXECUTE FUNCTION public._site_request_consent_granted_dispatch();


-- ── fixtures ───────────────────────────────────────────────────────────────
CREATE TABLE pg_temp._probe_log (fn_name text, body jsonb);
CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $f$
BEGIN
  INSERT INTO pg_temp._probe_log (fn_name, body) VALUES (fn_name, body);
  RETURN 1;
END $f$;

DO $probe$
DECLARE
  v_user  uuid;
  v_org   uuid;
  v_proj  uuid := gen_random_uuid();
  v_pa    uuid := gen_random_uuid();
  v_pb    uuid := gen_random_uuid();
  v_ra    uuid := gen_random_uuid();
  v_rb    uuid := gen_random_uuid();
  v_ia    uuid := gen_random_uuid();
  v_va    uuid := gen_random_uuid();
  raised  text;
  n       integer;
  d       integer;
BEGIN
  SELECT om.user_id, om.organization_id INTO v_user, v_org
    FROM organization_members om JOIN organizations o ON o.id = om.organization_id
   WHERE o.type = 'design_studio' AND om.status = 'active'
     AND om.role IN ('owner','admin')
   ORDER BY om.joined_at LIMIT 1;
  ASSERT v_user IS NOT NULL, 'probe: no studio member to act as';

  INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
  VALUES (v_proj, 'PROBE45 negative control', v_user, v_org, v_user, 'active', now(), now());

  INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, trade,
                               sms_consent_status, sms_opt_out_at, sms_consent_source,
                               sms_consent_evidence, sms_consent_recorded_at)
  VALUES
    (v_pa, v_proj, 'sub', 'Probe Never-Asked', '612-555-0991', 'electrical',
     'not_asked', NULL, NULL, NULL, NULL),
    (v_pb, v_proj, 'sub', 'Probe Refused-Seat', '612-555-0992', 'plumbing',
     'opted_out', '2025-12-03T00:00:00Z', 'inbound_sms', 'Replied STOP', '2025-12-03T00:00:00Z');

  INSERT INTO site_requests (id, project_id, created_by, assignee_party_id, status, due_at, note)
  VALUES (v_ra, v_proj, v_user, v_pa, 'awaiting_consent', now() + interval '3 days', 'Panel photos'),
         (v_rb, v_proj, v_user, v_pa, 'draft',            now() + interval '3 days', 'Rough-in photos');

  INSERT INTO site_request_items (id, request_id, sort_order, status, current_version_number, current_version_id)
  VALUES (v_ia, v_rb, 1, 'open', 1, NULL);
  INSERT INTO site_request_item_versions (id, item_id, version_number, kit_code, title, configuration, created_by)
  VALUES (v_va, v_ia, 1, 'K-01', 'Rough-in photos', '{}'::jsonb, v_user);
  UPDATE site_request_items SET current_version_id = v_va WHERE id = v_ia;

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role','authenticated')::text, true);

  -- ── 1. BEFORE: a recorded grant releases nothing (block 8's old 8c) ──────
  PERFORM public.record_channel_consent(v_org, 'sms', '612-555-0991', 'granted',
    'written', 'Signed kickoff form', 'field-sms-v1', v_proj);
  SELECT COUNT(*) INTO d FROM pg_temp._probe_log WHERE fn_name = 'site-request-dispatch';
  SELECT COUNT(*) INTO n FROM site_requests WHERE id = v_ra AND consent_status_snapshot = 'granted';
  RAISE NOTICE 'BEFORE 00622: dispatches from a recorded grant = % (00622: 1 per parked request)', d;
  RAISE NOTICE 'BEFORE 00622: parked requests released         = % (00622: 1)', n;

  -- ── 2. BEFORE: site_request_send raises on a not_asked assignee ─────────
  raised := NULL;
  BEGIN
    PERFORM public.site_request_send(v_rb, NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'BEFORE 00622: site_request_send on a not_asked assignee -> % (00622: no error)',
    COALESCE(raised, '<no error>');

  -- ── 3. BEFORE: a frozen opted_out seat refuses the write door ───────────
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(v_org, 'sms', '612-555-0992', 'granted',
      'written', 'We have a new signed form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'BEFORE 00622: grant over a frozen opted_out SEAT -> % (00622: it lands)',
    COALESCE(raised, '<no error>');

  -- ── 4. BEFORE: the release trigger sat on project_parties ───────────────
  SELECT COUNT(*) INTO n FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
   WHERE c.relname = 'project_parties' AND tg.tgname = 'site_request_consent_granted_dispatch';
  RAISE NOTICE 'BEFORE 00622: release trigger on project_parties = % (00622: 0, it is on studio_channel_consent)', n;
END
$probe$;

ROLLBACK;
