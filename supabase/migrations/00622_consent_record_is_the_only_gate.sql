-- ════════════════════════════════════════════════════════════════════════════
-- 00622 — THE RECORD IS THE ONLY GATE AND THE ONLY READER (ruling R-AW / R-AY)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Lineage
--   · 00212  project_parties (the seats, and the eight sms_consent_* columns)
--   · 00281  normalize_party_phone_e164()
--   · 00374  the site-request loop: site_request_send(),
--            site_request_dispatch_after_consent(),
--            _site_request_consent_granted_dispatch() + its trigger
--   · 00419  v_project_roster            · 00432  fc_dispatch_optin_invite
--   · 00484  _primary_studio_for revoked from every PostgREST role
--   · 00594  studio_channel_consent, the fold, the freeze,
--            channel_consent_status(), project_consent_org(),
--            record_channel_consent() / _invite() / _reconsent()
--   · 00621  field_activity_summary + the two 00284 dispatch gates, repointed
--   · 00622  THIS FILE
--
-- The ruling is R-AY in artifacts/people-room-crm-2026-09-11/rulings.md §3 and
-- R-AW in the W1 final-run brief; they are the same ruling. Kody may overrule.
--
-- WHY
--
-- R-AS made studio_channel_consent the single source of truth and froze
-- project_parties.sms_consent_*. It left one thing standing: PR-x's
-- "fail-closed SECOND check" — a handful of readers that still asked a frozen
-- seat for a verdict, in case the fold had missed something. R-AW retires that
-- lean, and the argument is short. 00594's backfill folds EVERY seat into a
-- record inside the same migration, opted_out winning per org; the freeze
-- trigger means no seat has carried news since. A seat therefore holds no fact
-- the record does not already hold, and a second reader of a frozen copy can
-- only ever contradict the one live ledger. Ten review rounds of evidence
-- defects lived in that copy; three close-out rounds lived in its readers.
--
-- So the seats are read by nothing. What this file changes:
--
--   1. record_channel_consent() — grafted from 00594:1581-2087 with its THREE
--      inlined seat tests removed (R-AL's read-before-write gate, the same
--      rule restated inside the upsert's DO UPDATE … WHERE, and the NOT FOUND
--      branch's diagnosis). The transition gate is the record's own:
--      a grant over a record at opted_out, or over one carrying
--      refusal_unanswered, is still refused with channel_opted_out, and
--      record_channel_reconsent() is still the only door past it — evidence
--      only, the refusal left standing for the recipient's own YES or START.
--      Every other leg, every HINT and the whole evidence rule set are
--      byte-identical to the graft. No RPC in the consent family reads
--      project_parties now; backfill_channel_consent_from_parties() is the one
--      permitted reader, and it runs at migration time.
--
--   2. THE SITE-REQUEST RAIL, ON THE RECORD. This is the casualty R-AS named
--      and owed to W2; R-AW pays it here.
--
--      · site_request_send() (00374:1220-1331) read the verdict off the seat
--        and WROTE the seat to `pending` for a not_asked assignee. That write
--        is frozen, so a live designer act — and Patina Field's own
--        "send a site request" — raised consent_legacy_column_frozen. It now
--        reads channel_consent_status(project_consent_org(project), 'sms',
--        phone) and writes no seat at all.
--      · _site_request_consent_granted_dispatch() (00374:3399-3444) fired
--        AFTER UPDATE OF sms_consent_status ON project_parties. No consent act
--        makes a party-row transition any more, so requests parked in
--        awaiting_consent were never released. The trigger MOVES onto
--        studio_channel_consent — AFTER INSERT OR UPDATE OF status, when the
--        verdict becomes `granted` — and releases every awaiting_consent
--        request whose assignee seat carries that org's phone. One consent act
--        releases each parked request once; there is no fan-out to guard,
--        because the loop is over REQUESTS, not over seats.
--      · site_request_dispatch_after_consent() (00374:1395-1460) is the only
--        thing that trigger calls, and it gated on the seat being `granted` —
--        which nothing can set. Repointed at the record too: without it the
--        release above raises inside the consent write and takes the whole
--        consent act down with it.
--
--      site_request_resend() is NOT repointed here: R-AW enumerates the
--      dispatch trigger and site_request_send(), and resend is not on the
--      release path. It still gates on the frozen seat and still cannot
--      succeed for a party created after 00594 — owed, and named in the W1a
--      report §8.
--
-- NOT CHANGED, ON PURPOSE
--   · the freeze trigger (00594 refuse_legacy_consent_write) and R-AX's
--     phone rule: they are WRITE guards, not verdict readers, and a frozen
--     column is still a column nothing may quietly rewrite.
--   · people_directory's meta.sms_consented_at / .sms_opt_out_at — dates, not
--     a verdict; W1b's v4 rebuild reads them off the record.
--   · 00621's two dispatch gates keep their seat leg (`… AND
--     v_party.sms_consent_status <> 'granted'`), which only ever makes them
--     MORE permissive than the send gate that follows. Named in the report.
--
-- Idempotent: CREATE OR REPLACE throughout, DROP TRIGGER IF EXISTS before each
-- CREATE TRIGGER. Re-runnable on a database at 00621 or at 00622.
-- No table is created or altered, so there is no new RLS in this file; every
-- redefined function restates its REVOKE FROM PUBLIC, anon and its grants.


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. record_channel_consent — the record's own gate, and nothing else
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
  v_value         text;
  v_now           timestamptz := now();
  v_row           public.studio_channel_consent;
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
  'inside the upsert''s DO UPDATE … WHERE so a concurrent STOP cannot land in a '
  'read-then-write window; also refuses EVERY verdict but opted_out while a '
  'refusal stands unanswered — refusal_unanswered TRUE, or an opt_out_at with '
  'no later consented_at (consent_awaiting_recipient) — so reconsent() plus a '
  'grant cannot compose their way back to granted without the recipient''s own '
  'YES or START; it never LOWERS refusal_unanswered on any verdict either '
  '(r7 M7-1 — only the inbound rail does), and a DATELESS refusal (the shipped '
  'portal writes them on purpose and the fold mints them) fails closed like a '
  'dated one. IT READS NO PARTY ROW (R-AW, 00622): the three inlined seat tests '
  '00594 carried for PR-x''s fail-closed second check are gone. 00594''s own '
  'backfill folded every seat into a record in the same migration and the '
  'freeze trigger stopped the seats carrying news, so a seat holds no fact this '
  'table does not, and a legacy opted_out seat with no record behind it would '
  'have folded to an opted_out record — the only way the record reads granted '
  'over one is a refusal the recipient answered. '
  'Stamps the refusal''s OWN evidence set (opt_out_source, opt_out_evidence, '
  'opt_out_recorded_at, opt_out_recorded_by) when and only when the verdict is '
  'opted_out, and leaves it untouched on every other verdict, so a later '
  'consent cannot speak for the refusal (r8 W4-M2) — nor may a later REFUSAL: '
  'the record keeps the earliest opt_out_at, and a studio-sourced refusal '
  'recorded over an inbound_sms one leaves all four columns standing and writes '
  'nothing in their place — not on the consent side either, which holds the '
  'grant''s evidence (r7 R7-M1 as narrowed by r6 R6-M1); '
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
  'gate, since every accepted status must supply its own source and evidence; '
  'A REFUSAL WRITES NONE OF THOSE FIVE (r6 R6-M1) — they are the GRANT''s '
  'evidence, standing beside the consented_at this door keeps, and the refusal '
  'has its own four; normalises the channel value through '
  'normalize_channel_value(); stamps recorded_by/recorded_at; keeps an earlier '
  'granted/opt-out date when the new verdict does not restate it; and REFUSES '
  '`pending` over a standing `granted` (consent_already_granted, close-review '
  'r2 MAJOR-1) — an invite is not news about a grant the studio already holds; '
  'record_channel_invite() is the add path''s door (00594, 00622).';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. site_request_send — the verdict off the record, and no seat written
-- ═══════════════════════════════════════════════════════════════════════════
-- Grafted from 00374:1220-1331 (its only definition site, and the grep-winner).
-- One expression changed: where the body read v_party.sms_consent_status — and,
-- for a `not_asked` assignee, UPDATEd the seat to `pending` — it now reads
-- channel_consent_status(). Every other statement, every errcode, every
-- snapshot column, the outbox cancellation and both return shapes are verbatim.
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

  -- THE RECORD IS THE CONSENT (R-AW). 00374 read the verdict off the seat and,
  -- for a `not_asked` assignee, WROTE the seat to `pending` — the column 00594
  -- froze, so this act raised consent_legacy_column_frozen on a live,
  -- un-flag-gated designer button (and on Patina Field's own send). The verdict
  -- now comes from channel_consent_status(project_consent_org(project), 'sms',
  -- phone); a studio that holds no record reads `not_asked`, which is what the
  -- COALESCE says, and the invite that follows is recorded by
  -- record_channel_invite()/record_channel_consent() — the doors that own that
  -- write — not by this one. The rest of this body is 00374:1220-1331 verbatim.
  v_consent := COALESCE(
    public.channel_consent_status(
      public.project_consent_org(v_request.project_id), 'sms', v_party.phone_e164),
    'not_asked');

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

REVOKE ALL ON FUNCTION public.site_request_send(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_request_send(uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.site_request_send(uuid, timestamptz) IS
  'Sends a drafted site request, or re-parks it awaiting consent. Since 00622 '
  'the assignee''s SMS consent is read from studio_channel_consent through '
  'channel_consent_status(project_consent_org(project_id), ''sms'', phone_e164) '
  'and NO party row is written: 00374 flipped a not_asked seat to `pending` '
  'here, 00594 froze that column, and this act — reachable from the designer '
  'portal and from Patina Field — raised consent_legacy_column_frozen (R-AW). '
  'A studio holding no record reads not_asked and the request parks in '
  'awaiting_consent exactly as before; recording the invite belongs to '
  'record_channel_invite() / record_channel_consent(). Otherwise 00374''s body.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. site_request_dispatch_after_consent — the same question, of the record
-- ═══════════════════════════════════════════════════════════════════════════
-- Grafted from 00374:1395-1460. One gate changed. This is not optional cleanup:
-- section 4's trigger is the only caller, and a body that requires a `granted`
-- SEAT can no longer be satisfied by anything, so the release would raise
-- inside the consent write and abort the consent act itself.
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
  -- THE RECORD IS THE CONSENT (R-AW). 00374 gated on the seat, and nothing can
  -- move a seat to `granted` any more, so this body could never succeed for any
  -- party created after 00594 — including from inside the consent-granted
  -- trigger below, whose whole purpose is to call it. The gate is the same
  -- question asked of the record. Everything else is 00374:1395-1460 verbatim.
  IF NOT FOUND
     OR COALESCE(
          public.channel_consent_status(
            public.project_consent_org(v_request.project_id), 'sms', v_party.phone_e164),
          'not_asked') <> 'granted'
     OR v_party.phone_e164 IS NULL THEN
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

REVOKE ALL ON FUNCTION public.site_request_dispatch_after_consent(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_request_dispatch_after_consent(uuid, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.site_request_dispatch_after_consent(uuid, timestamptz) IS
  'Mints the dispatch work for a site request whose assignee''s consent has '
  'arrived. Since 00622 the consent gate reads studio_channel_consent through '
  'channel_consent_status(project_consent_org(project_id), ''sms'', phone_e164) '
  'rather than project_parties.sms_consent_status, which 00594 froze and '
  'nothing can set to `granted` any more (R-AW). Called by '
  '_site_request_consent_granted_dispatch() and by site-request-dispatch; '
  'service_role only. Otherwise 00374''s body.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The consent-granted release, moved onto the record
-- ═══════════════════════════════════════════════════════════════════════════
-- Grafted from 00374:3399-3455. The body keeps its shape exactly — the same
-- FOR loop over awaiting_consent requests in created_at order, the same
-- durable-work-then-eager-wake-up split, the same fire-and-forget
-- BEGIN/EXCEPTION around invoke_edge_function with the same WARNING text — and
-- three things change, all of them the same change: NEW is a consent record
-- rather than a seat.
--
--   · the trigger is on studio_channel_consent, AFTER INSERT OR UPDATE OF
--     status, WHEN the verdict becomes `granted` on an sms channel. The verdict
--     is status AND refusal_unanswered together, exactly as
--     channel_consent_status() folds them (00594) — a `granted` carrying an
--     unanswered refusal is unsendable, so it must not release anything;
--   · the requests it looks for are those whose assignee SEAT carries this
--     record's phone in this record's studio — project_consent_org() resolves
--     the seat's studio the way every writer does;
--   · the party_id in the edge payload is that seat's id, which is what
--     site-request-dispatch has always been handed.
--
-- The old trigger on project_parties is dropped. It could not fire from a
-- consent act any more (nothing writes the seats), and leaving it would mean a
-- deliberate app.consent_legacy_write repair silently texted trades.
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
  -- 00374's own guard, translated onto the record. The verdict is `status` AND
  -- `refusal_unanswered` together (00594 channel_consent_status), and the gate
  -- is a TRANSITION: a re-recorded grant, or a grant whose evidence is merely
  -- restated, releases nothing a second time. The WHEN clause cannot ask this,
  -- because OLD does not exist on INSERT.
  IF NEW.channel_kind <> 'sms'
     OR NEW.status <> 'granted'
     OR NEW.refusal_unanswered IS TRUE
     OR (TG_OP = 'UPDATE'
         AND OLD.status = 'granted'
         AND OLD.refusal_unanswered IS NOT TRUE) THEN
    RETURN NEW;
  END IF;

  FOR v_request IN
    SELECT sr.id, pp.id AS party_id
    FROM public.site_requests sr
    JOIN public.project_parties pp
      ON pp.id = sr.assignee_party_id
    WHERE sr.status = 'awaiting_consent'
      AND pp.phone_e164 = NEW.channel_value
      AND public.project_consent_org(pp.project_id) = NEW.organization_id
    ORDER BY sr.created_at
  LOOP
    -- Durable work is part of the same transaction as the consent write.
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
          'party_id', v_request.party_id,
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

DROP TRIGGER IF EXISTS site_request_consent_granted_dispatch
  ON public.project_parties;
DROP TRIGGER IF EXISTS site_request_consent_granted_dispatch
  ON public.studio_channel_consent;
CREATE TRIGGER site_request_consent_granted_dispatch
  AFTER INSERT OR UPDATE OF status ON public.studio_channel_consent
  FOR EACH ROW
  WHEN (
    NEW.channel_kind = 'sms'
    AND NEW.status = 'granted'
    AND NEW.refusal_unanswered IS NOT TRUE
  )
  EXECUTE FUNCTION public._site_request_consent_granted_dispatch();

REVOKE ALL ON FUNCTION public._site_request_consent_granted_dispatch()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._site_request_consent_granted_dispatch() IS
  'Releases every site request parked in awaiting_consent when the studio''s '
  'consent record for the assignee''s number becomes a standing `granted`. '
  '00374 fired this AFTER UPDATE OF project_parties.sms_consent_status; 00594 '
  'froze that column, so no consent act made a party-row transition and parked '
  'requests were never released at all. Since 00622 the trigger is on '
  'studio_channel_consent (R-AW) and the loop finds requests whose assignee '
  'seat carries this record''s phone in this record''s studio, resolved through '
  'project_consent_org(). Durable work (site_request_dispatch_after_consent) is '
  'part of the consent transaction; the edge invocation is a fire-and-forget '
  'wake-up and the lifecycle sweep is the backstop. 00374''s body otherwise.';
