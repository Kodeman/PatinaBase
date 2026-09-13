-- ═══════════════════════════════════════════════════════════════════════════
-- 00630 — People room CRM · W3/P2 (3 of 6): the nightly expiry sweep
--
-- "Everyone on the Job" (artifacts/people-room-crm-2026-09-11) §7 (P2 row
-- `compliance-document-expiry-sweep`, "reuse pattern: pg_cron, advisory lock,
-- job_runs row, per 00574_invoice_links.sql") and §8 (P2: "a lapse announces
-- itself before it blocks a draw").
--
-- 00623 gave the studio a place to HOLD paper and a word to read it by
-- (compliance_state). Nothing announces. F-11's COI lapsed 2026-03-31 between
-- the Lindqvist kitchen and the Okonkwo residence, and the first time anybody
-- would learn it is the day a draw is assembled. This file is the announcement:
-- one notice per (document, state) as a paper crosses into `lapses_soon` and
-- again as it crosses into `lapsed`, plus one in-app notification per
-- owner/admin of the holding studio.
--
-- LINEAGE: 00300 (groom_agent_tasks — the advisory-lock / job_runs shape) →
-- 00574:1565-1699 (invoice-checkout-attempts-expire, the shipped copy of that
-- shape this file is asked to reuse) → 00623 (studio_compliance_documents,
-- compliance_state) → 00630.
--
-- ── ONE NOTICE PER (DOCUMENT, STATE) ──────────────────────────────────────
-- The table's unique index IS the idempotency rule, not a nicety: the sweep
-- runs nightly and a paper stays lapsed for as long as it stays on file, so
-- without it the studio would be told the same thing every morning until
-- somebody uploaded a renewal. A paper that crosses `lapses_soon` and later
-- `lapsed` gets exactly two notices, in that order, and never a third.
--
-- The in-app notification is written ONLY when the notice row was actually
-- inserted (ON CONFLICT DO NOTHING ... RETURNING), so the two can never
-- disagree about how many times a studio was told.
--
-- ── WHICH PAPER IS SWEPT ──────────────────────────────────────────────────
-- Exactly the paper that can move the holder's WORD: dated, carrying at least
-- one gate in blocks[], and not retired by an in-force successor.
-- compliance_state()'s own rule (00623:629-676, "a date with no gate changes
-- nothing", CS2 §4 / PR-h), read one row at a time by
-- compliance_document_state() below. A notice about paper the room never
-- prints a word for would be a promise on a face — 00623's own argument for
-- keeping `contract`, `permit` and `mobilization` out of blocks[].
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. compliance_document_state — 00623's reckoning, for ONE paper
-- ═══════════════════════════════════════════════════════════════════════════
-- COUPLED TO compliance_state() (00623). Both carry R-BF's transitive
-- supersession walk with its depth cap, both gate on cardinality(blocks) > 0,
-- and both state the 30-day window. compliance_state() reduces worst-first
-- over a HOLDER's papers; this answers for one paper, which is what a notice
-- is about. THE 30-DAY WINDOW NOW LIVES IN TWO PLACES — if one moves the
-- other must move with it, and w3-data-report.md §2 says so.
--
-- Words: superseded | held | current | lapses_soon | lapsed. `held` is
-- 00623's undated-paper rule (a W-9 cannot lapse) widened to cover paper with
-- no gate, because neither can move a word and neither earns a notice.
--
-- SECURITY INVOKER, like compliance_state(): studio_compliance_documents'
-- member-only RLS is the whole access rule, so a caller outside the studio
-- reads NULL rather than another studio's date.
CREATE OR REPLACE FUNCTION public.compliance_document_state(p_document_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH RECURSIVE me AS (
    SELECT d.id, d.blocks, d.expires_on, d.superseded_by
      FROM public.studio_compliance_documents d
     WHERE d.id = p_document_id
  ),
  chain(succ, depth) AS (
    SELECT m.superseded_by, 0 FROM me m WHERE m.superseded_by IS NOT NULL
    UNION ALL
    SELECT s.superseded_by, c.depth + 1
      FROM chain c
      JOIN public.studio_compliance_documents s ON s.id = c.succ
     WHERE c.depth < 64
  ),
  retired AS (
    SELECT 1
      FROM chain c
      JOIN public.studio_compliance_documents s ON s.id = c.succ
      CROSS JOIN me m
     WHERE (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
       AND m.blocks <@ s.blocks
     LIMIT 1
  )
  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM retired)              THEN 'superseded'
           WHEN cardinality(m.blocks) = 0
             OR m.expires_on IS NULL                        THEN 'held'
           WHEN m.expires_on <  CURRENT_DATE                THEN 'lapsed'
           WHEN m.expires_on <= CURRENT_DATE + 30           THEN 'lapses_soon'
           ELSE 'current'
         END
    FROM me m;
$$;

REVOKE ALL ON FUNCTION public.compliance_document_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compliance_document_state(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.compliance_document_state(uuid) IS
  'The state of ONE compliance paper: superseded | held | current | '
  'lapses_soon | lapsed. compliance_state() (00623) reduced worst-first over '
  'a holder''s papers; this is the same reckoning for one row, which is what '
  'a notice is about — R-BF''s transitive supersession walk with its depth '
  'cap, the cardinality(blocks) > 0 gate (CS2 §4, "a date with no gate '
  'changes nothing") and the same 30-day window. THE WINDOW IS NOW STATED IN '
  'TWO PLACES; move both together. `held` covers 00623''s undated paper (a '
  'W-9 cannot lapse) and paper carrying no gate. SECURITY INVOKER, so the '
  'table''s member-only RLS is the access rule (00630).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. studio_compliance_notices — what the studio has already been told
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.studio_compliance_notices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Denormalised from the document so the RLS predicate is one column read,
  -- the posture studio_compliance_documents itself takes (holder_id already
  -- implies the org, and 00623 carries organization_id anyway). The sweep is
  -- the only writer and copies it from the document in the same statement.
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  document_id     uuid NOT NULL
                    REFERENCES public.studio_compliance_documents(id) ON DELETE CASCADE,

  state           text NOT NULL,
  noticed_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_compliance_notices
  DROP CONSTRAINT IF EXISTS studio_compliance_notices_state_check;
ALTER TABLE public.studio_compliance_notices
  ADD CONSTRAINT studio_compliance_notices_state_check CHECK (
    state IN ('lapses_soon', 'lapsed')
  );

-- THE IDEMPOTENCY RULE. One notice per (document, state), forever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_compliance_notices_doc_state
  ON public.studio_compliance_notices(document_id, state);

CREATE INDEX IF NOT EXISTS idx_studio_compliance_notices_org
  ON public.studio_compliance_notices(organization_id, noticed_at DESC);

COMMENT ON TABLE public.studio_compliance_notices IS
  'What the studio has ALREADY been told about a compliance paper''s expiry '
  '(direction §8 P2). One row per (document, state), enforced by a unique '
  'index — the sweep runs nightly and a lapsed paper stays lapsed, so without '
  'it the studio would hear the same sentence every morning. A paper that '
  'crosses lapses_soon and later lapsed earns exactly two rows. Written ONLY '
  'by sweep_compliance_expiries(); there is no INSERT, UPDATE or DELETE '
  'policy for authenticated and no such grant (00630).';

COMMENT ON COLUMN public.studio_compliance_notices.state IS
  'lapses_soon (inside compliance_document_state()''s 30-day window) or '
  'lapsed (the date has passed). Never `current`, `held` or `superseded`: '
  'those are not news.';

ALTER TABLE public.studio_compliance_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_compliance_notices_member_select
  ON public.studio_compliance_notices;
CREATE POLICY studio_compliance_notices_member_select
  ON public.studio_compliance_notices FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(organization_id));

REVOKE ALL ON TABLE public.studio_compliance_notices
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_compliance_notices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_compliance_notices
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. sweep_compliance_expiries — 00574's shape, one job_runs row per run
-- ═══════════════════════════════════════════════════════════════════════════
-- THE NOTIFICATION SHAPE IS THE SHIPPED ONE, not a new table. notification_log
-- with channel 'in_app' and status 'delivered' is what every in-app notice in
-- this codebase is (00267:243, 00431:86-110, 00534, 00572); the metadata bag
-- carries `subject`, `message` and `deep_link` because that is what the
-- designer portal's notification reader renders. type =
-- 'compliance_document_expiry'. ref_type is deliberately left NULL:
-- notification_log_ref_type_chk admits only invoice / client_invitation /
-- client_review / proposal, and widening a live CHECK to carry a deep link
-- the metadata already carries would be a change this file has no need of.
--
-- RECIPIENTS: R-AC's population for the compliance family — the owners and
-- admins of the studio that holds the paper. Not the whole studio: a lapse is
-- an act somebody has to take (chase the renewal, hold the draw), and PR-n's
-- posture through this whole program is that the standing to act sits with
-- the owner and the admin.
CREATE OR REPLACE FUNCTION public.sweep_compliance_expiries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run_id     bigint;
  v_notices    int := 0;
  v_notified   int := 0;
  v_scanned    int := 0;
  v_count      int;
  v_doc        record;
  v_notice_id  uuid;
  v_holder     text;
  v_subject    text;
  v_message    text;
  v_link       text;
  v_detail     jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('job:compliance-document-expiry-sweep')) THEN
    INSERT INTO public.job_runs (job_name, status, finished_at)
    VALUES ('compliance-document-expiry-sweep', 'skipped', now());
    RETURN jsonb_build_object('skipped', true);
  END IF;

  PERFORM set_config('app.actor', 'job:compliance-document-expiry-sweep', true);

  INSERT INTO public.job_runs (job_name, status)
  VALUES ('compliance-document-expiry-sweep', 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    FOR v_doc IN
      SELECT d.id,
             d.organization_id,
             d.holder_id,
             d.holder_type,
             d.doc_type,
             d.doc_label,
             d.expires_on,
             public.compliance_document_state(d.id) AS state,
             COALESCE(NULLIF(btrim(sc.company_name), ''),
                      NULLIF(btrim(sc.full_name), ''),
                      'this card')                  AS holder_name
        FROM public.studio_compliance_documents d
        JOIN public.studio_contacts sc ON sc.id = d.holder_id
       WHERE d.expires_on IS NOT NULL
         AND cardinality(d.blocks) > 0
         AND d.expires_on <= CURRENT_DATE + 30
       ORDER BY d.expires_on, d.id
    LOOP
      v_scanned := v_scanned + 1;
      CONTINUE WHEN v_doc.state NOT IN ('lapses_soon', 'lapsed');

      INSERT INTO public.studio_compliance_notices
        (organization_id, document_id, state)
      VALUES
        (v_doc.organization_id, v_doc.id, v_doc.state)
      ON CONFLICT (document_id, state) DO NOTHING
      RETURNING id INTO v_notice_id;

      -- Already told. The nightly rerun stops here, and no notification is
      -- written: the two records can never disagree about the count.
      CONTINUE WHEN v_notice_id IS NULL;
      v_notices := v_notices + 1;

      v_holder := v_doc.holder_name;
      v_subject := CASE v_doc.state
                     WHEN 'lapsed' THEN v_holder || '''s paper has lapsed'
                     ELSE               v_holder || '''s paper lapses soon'
                   END;
      v_message := CASE v_doc.state
                     WHEN 'lapsed' THEN
                       COALESCE(NULLIF(btrim(v_doc.doc_label), ''), v_doc.doc_type)
                       || ' for ' || v_holder || ' lapsed '
                       || to_char(v_doc.expires_on, 'FMDD Mon YYYY') || '.'
                     ELSE
                       COALESCE(NULLIF(btrim(v_doc.doc_label), ''), v_doc.doc_type)
                       || ' for ' || v_holder || ' lapses '
                       || to_char(v_doc.expires_on, 'FMDD Mon YYYY') || '.'
                   END;
      v_link := CASE WHEN v_doc.holder_type = 'company'
                     THEN '/people?firm=' || v_doc.holder_id::text
                     ELSE '/people?person=' || v_doc.holder_id::text
                END;

      INSERT INTO public.notification_log
        (user_id, type, channel, status, metadata, sent_at)
      SELECT
        om.user_id,
        'compliance_document_expiry',
        'in_app',
        'delivered',
        jsonb_build_object(
          'document_id',   v_doc.id,
          'holder_id',     v_doc.holder_id,
          'holder_type',   v_doc.holder_type,
          'holder_name',   v_holder,
          'doc_type',      v_doc.doc_type,
          'doc_label',     v_doc.doc_label,
          'expires_on',    v_doc.expires_on,
          'state',         v_doc.state,
          'subject',       v_subject,
          'title',         v_subject,
          'headline',      v_subject,
          'message',       v_message,
          'preview',       v_message,
          'body',          v_message,
          'deep_link',     v_link,
          'url',           v_link,
          'read_at',       NULL
        ),
        now()
      FROM public.organization_members om
      WHERE om.organization_id = v_doc.organization_id
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin');
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_notified := v_notified + v_count;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- No re-RAISE (the 00300 / 00574 idiom): the failed row must persist as
    -- the authoritative failure record, the guarded block rolls back to its
    -- savepoint, and every pass is idempotent.
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object('scanned', v_scanned,
                                       'notices', v_notices,
                                       'notified', v_notified)
     WHERE id = v_run_id;
    RETURN jsonb_build_object('error', SQLERRM,
                              'scanned', v_scanned,
                              'notices', v_notices,
                              'notified', v_notified);
  END;

  v_detail := jsonb_build_object('scanned',  v_scanned,
                                 'notices',  v_notices,
                                 'notified', v_notified);

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_compliance_expiries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_compliance_expiries() TO service_role;

COMMENT ON FUNCTION public.sweep_compliance_expiries() IS
  'Nightly pg_cron sweep (00630, direction §8 P2): every dated, gating, '
  'non-superseded compliance paper inside compliance_document_state()''s '
  '30-day window or past its date writes ONE studio_compliance_notices row '
  'per (document, state) and one in_app notification_log row per owner/admin '
  'of the holding studio. The unique index is the idempotency rule, and the '
  'notification is written only where the notice row actually landed, so the '
  'studio is told twice in a paper''s life — once as it enters lapses_soon '
  'and once as it lapses — and never again. Advisory xact lock, one job_runs '
  'row per invocation, skipped on contention: 00574:1565-1699''s shape. '
  'service_role only; no authenticated grant — this is a job, not an act '
  '(00630).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The schedule — nightly at 06:00 UTC, guarded
-- ═══════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 00574:1686-1699's idiom exactly: the unschedule is guarded by EXISTS, the
-- schedule itself is NOT wrapped in an exception handler. A stack that cannot
-- schedule the job must FAIL the migration rather than apply it with the
-- nightly sweep silently absent — the sweep is the whole point of this file,
-- and a lapse nobody is told about is the defect it exists to close.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compliance-document-expiry-sweep') THEN
    PERFORM cron.unschedule('compliance-document-expiry-sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'compliance-document-expiry-sweep',
  '0 6 * * *',
  $$SELECT public.sweep_compliance_expiries();$$
);

-- Registry comment carried forward from 00574 and extended. The comment is
-- documentation; a stack without pg_cron must not fail the migration over a
-- sentence.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Everyone on the Job (00630): compliance-document-expiry-sweep nightly at 06:00 UTC -> public.sweep_compliance_expiries(), writing one studio_compliance_notices row per (document, state) as a gating compliance paper enters lapses_soon or lapses, plus one in_app notification_log row per owner/admin of the holding studio; history in job_runs. The Invoice, Standing Alone (00574): invoice-checkout-attempts-expire at 17 past every hour -> public.expire_stale_invoice_checkout_attempts(), expiring claimed/session_created Checkout attempts older than 24h (never processing), history in job_runs. The Decision, Delivered (00572): decision-reminders-hourly on the hour -> the decision-reminders edge function, replacing 00092''s decision-reminders-daily at 09:00 UTC so the per-recipient not-before-8am-local gate has an hour to release into; notification-digest-hourly at 20 past -> the notification-digest edge function, replacing 00278''s notification-digest-daily at 15:00 UTC for the same reason (the summary owes the same 8am-local, never-Sunday promise as the letter); client-push-window-release every 15 minutes -> public.release_due_client_pushes(200), dispatching push envelopes held outside 8am-8pm local; decision-first-notice-retry-sweep every 30 minutes -> public.sweep_decision_first_notices(100), re-inviting decision-first-notice for a published approval that never got its letter. Studio onboarding (00553): expire-stale-workspace-invites-daily at 07:40 UTC. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes. Rendered Room v2 (00501): expire-stale-upload-intents-daily at 07:15 UTC. Room View, Agent OS, BOH, Field Site Request, Mood Board, invoice/decision reminders, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
