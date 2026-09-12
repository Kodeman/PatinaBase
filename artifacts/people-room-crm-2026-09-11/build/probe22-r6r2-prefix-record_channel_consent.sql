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
      refusal_unanswered = CASE WHEN EXCLUDED.status = 'opted_out' THEN true
                                ELSE scc.refusal_unanswered END,
      source             = COALESCE(EXCLUDED.source, scc.source),
      evidence           = COALESCE(EXCLUDED.evidence, scc.evidence),
      recorded_at        = EXCLUDED.recorded_at,
      disclosure_version = COALESCE(EXCLUDED.disclosure_version, scc.disclosure_version),
      recorded_by        = COALESCE(EXCLUDED.recorded_by, scc.recorded_by),
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
      -- verbally" is not a pair this record has to collapse: the studio's own
      -- account lands on the CONSENT side (source / evidence / recorded_at /
      -- recorded_by, set above) and says when the studio told us.
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
