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
-- one notice per (document, state, expires_on) as a paper crosses into
-- `lapses_soon` and again as it crosses into `lapsed`, plus one in-app
-- notification per owner/admin of the holding studio.
--
-- LINEAGE: 00300 (groom_agent_tasks — the advisory-lock / job_runs shape) →
-- 00574:1565-1699 (invoice-checkout-attempts-expire, the shipped copy of that
-- shape this file is asked to reuse) → 00623 (studio_compliance_documents,
-- compliance_state) → 00630.
--
-- ── ONE NOTICE PER (DOCUMENT, STATE, EXPIRES_ON) ──────────────────────────
-- The table's unique index IS the idempotency rule, not a nicety: the sweep
-- runs nightly and a paper stays lapsed for as long as it stays on file, so
-- without it the studio would be told the same thing every morning until
-- somebody uploaded a renewal. A paper that crosses `lapses_soon` and later
-- `lapsed` gets exactly two notices, in that order, and never a third.
--
-- The DATE is the third column of that key, and a genuine change to
-- expires_on clears that document's notices outright (r5 M-3, two halves —
-- see the index and the trigger below). expires_on is freely editable by any
-- active studio member, and a key of (document, state) that nothing ever
-- cleared was permanent: correcting a mistyped date, extending the same row
-- instead of recording a renewal, or moving the date out of the window and
-- back spent that document's notice forever and the studio was never told
-- again.
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
-- supersession walk with its depth cap, both hold a retirement to a successor
-- that is IN FORCE, carries the root's gates and IS THE SAME PAPER (the
-- doc_type leg, W3 round-8 B-1 — without it, retyping an honest renewal as a
-- w9 answered `superseded` here and the sweep CONTINUEd past a lapse that is
-- still on file, so "a lapse announces itself before it blocks a draw" was
-- switched off for that document forever), both gate on
-- cardinality(blocks) > 0, and both state the 30-day window. compliance_state() reduces worst-first
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
    SELECT d.id, d.blocks, d.expires_on, d.superseded_by, d.doc_type
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
       AND s.doc_type = m.doc_type          -- W3 r8 B-1, the same leg 00623 carries
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
  'cap and its three retirement legs (the successor in force, carrying the '
  'root''s gates, and the SAME doc_type — W3 round-8 B-1), the '
  'cardinality(blocks) > 0 gate (CS2 §4, "a date with no gate '
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

  -- THE DATE THE NOTICE WAS ABOUT (r5 M-3). Part of the idempotency key, not
  -- decoration: see the index below.
  expires_on      date NOT NULL,

  noticed_at      timestamptz NOT NULL DEFAULT now()
);

-- Idempotent for a database that already carries the pre-r5 shape.
ALTER TABLE public.studio_compliance_notices
  ADD COLUMN IF NOT EXISTS expires_on date;

UPDATE public.studio_compliance_notices n
   SET expires_on = COALESCE(d.expires_on, n.noticed_at::date)
  FROM public.studio_compliance_documents d
 WHERE d.id = n.document_id
   AND n.expires_on IS NULL;

-- No row can survive that UPDATE with a NULL: document_id is NOT NULL and
-- carries a foreign key, so every notice joins a document, and the COALESCE
-- has a second leg. This raises rather than deleting if that ever stops
-- being true.
ALTER TABLE public.studio_compliance_notices
  ALTER COLUMN expires_on SET NOT NULL;

ALTER TABLE public.studio_compliance_notices
  DROP CONSTRAINT IF EXISTS studio_compliance_notices_state_check;
ALTER TABLE public.studio_compliance_notices
  ADD CONSTRAINT studio_compliance_notices_state_check CHECK (
    state IN ('lapses_soon', 'lapsed')
  );

-- THE IDEMPOTENCY RULE. One notice per (document, state, THE DATE IT WAS
-- ABOUT) — r5 M-3.
--
-- It was (document, state), which is permanent, and nothing ever clears a
-- notice row, while studio_compliance_documents.expires_on is freely editable
-- by any active studio member (studio_compliance_documents_member_update). So
-- the ordinary act of correcting a mistyped date — or extending the same row
-- instead of recording a renewal — permanently SPENT that document's notice.
-- Measured: the sweep writes the lapses_soon notice; expires_on moves to
-- CURRENT_DATE + 400 (state `current`); it moves back to CURRENT_DATE + 5
-- (state `lapses_soon` again); the sweep returns {"notices":0,"notified":0}
-- and the studio is never told. Direction §8 P2's promise — "a lapse
-- announces itself before it blocks a draw" — failed for every document whose
-- date had crossed the boundary twice.
--
-- The date is the right third column because it is what the notice SAYS: the
-- message reads "… lapses 31 Mar 2026", so a different date is a different
-- sentence and has never been told. A nightly rerun against an unchanged
-- document still writes nothing, which is the whole of the original rule.
-- Keyed rather than cleared on edit, so the table stays what its own COMMENT
-- says it is: an append-only record of what the studio has been told.
DROP INDEX IF EXISTS public.idx_studio_compliance_notices_doc_state;
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_compliance_notices_doc_state_date
  ON public.studio_compliance_notices(document_id, state, expires_on);

CREATE INDEX IF NOT EXISTS idx_studio_compliance_notices_org
  ON public.studio_compliance_notices(organization_id, noticed_at DESC);

COMMENT ON TABLE public.studio_compliance_notices IS
  'What the studio has ALREADY been told about a compliance paper''s expiry '
  '(direction §8 P2). One row per (document, state, expires_on), enforced by '
  'a unique index — the sweep runs nightly and a lapsed paper stays lapsed, '
  'so without it the studio would hear the same sentence every morning. The '
  'DATE is in the key because a corrected or extended expires_on is a '
  'different sentence the studio has never heard, and the pair (document, '
  'state) alone spent a document''s notice forever the first time anybody '
  'edited its date across the boundary (r5 M-3). A paper that '
  'crosses lapses_soon and later lapsed earns exactly two rows. Written ONLY '
  'by sweep_compliance_expiries(); there is no INSERT, UPDATE or DELETE '
  'policy for authenticated and no such grant (00630).';

COMMENT ON COLUMN public.studio_compliance_notices.expires_on IS
  'The document''s expiry AS IT STOOD when this notice was written — the date '
  'the notice''s own sentence names. Third column of the idempotency key, so '
  'a corrected or extended date earns its own announcement instead of being '
  'silenced by a notice about a date that no longer exists (r5 M-3).';

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

-- ── AND A MOVED DATE UNSPENDS THE NOTICE (r5 M-3, second half) ────────────
-- The key above is necessary and not sufficient. It answers the ordinary
-- correction — a mistyped 2026 for 2025, a renewal recorded by extending the
-- same row — because a different date is a different sentence. It does NOT
-- answer the measured repro, which moves the date OUT of the window
-- (CURRENT_DATE + 400, state `current`) and then back to the SAME value: the
-- key matches the notice already on file and the sweep stays silent over a
-- document that has crossed the boundary twice.
--
-- So a genuine change to expires_on clears that document's notices outright.
-- The two halves answer different halves of the defect and neither is
-- redundant: the trigger unspends what a change made stale, the key keeps the
-- row honest about which date it was about. Nothing the studio was actually
-- TOLD is lost — the notification_log rows are the record of what was said
-- and are untouched; this table is the sweep's idempotency ledger.
--
-- SECURITY DEFINER because the writer is an ordinary studio member
-- (studio_compliance_documents_member_update) and `authenticated` holds no
-- DELETE on studio_compliance_notices, deliberately. Scoped to the one
-- document's own rows and nothing else.
CREATE OR REPLACE FUNCTION public.clear_compliance_notices_on_date_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.studio_compliance_notices n WHERE n.document_id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_compliance_notices_on_date_change()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.clear_compliance_notices_on_date_change() IS
  'AFTER UPDATE OF expires_on on studio_compliance_documents, when the date '
  'actually changed: drops that document''s studio_compliance_notices rows so '
  'the nightly sweep announces the new date. Without it a document whose date '
  'crossed the lapses_soon boundary twice was never announced again, because '
  'nothing ever cleared a notice and expires_on is freely editable by any '
  'active studio member (r5 M-3). SECURITY DEFINER: the editor is an ordinary '
  'member and `authenticated` holds no DELETE on the notices table (00630).';

DROP TRIGGER IF EXISTS clear_compliance_notices_on_date_change_trg
  ON public.studio_compliance_documents;
CREATE TRIGGER clear_compliance_notices_on_date_change_trg
  AFTER UPDATE OF expires_on ON public.studio_compliance_documents
  FOR EACH ROW
  WHEN (OLD.expires_on IS DISTINCT FROM NEW.expires_on)
  EXECUTE FUNCTION public.clear_compliance_notices_on_date_change();

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
  v_paper      text;
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
             -- THE PAPER'S OWN HOLDER, NOT THEIR FIRM (migrations review r9
             -- B-1, reproduced locally). studio_contacts.company_name on a
             -- PERSON card is 00417's typed-by-hand FIRM snapshot — the same
             -- column people_directory reads as the person's firm (00629 §6) —
             -- and usePromoteToStudioContact() stamps it from the seat on every
             -- promotion. Asking company_name first whatever the kind is wrote
             -- "Northgate Electric's paper has lapsed" over a master licence
             -- Marco Feliz holds himself, with a deep link to Marco. The name
             -- keys on holder_type, exactly as v_link below does.
             CASE WHEN d.holder_type = 'company'
                  THEN COALESCE(NULLIF(btrim(sc.company_name), ''),
                                NULLIF(btrim(sc.full_name), ''),
                                'this card')
                  ELSE COALESCE(NULLIF(btrim(sc.full_name), ''),
                                NULLIF(btrim(sc.company_name), ''),
                                'this card')
             END                                    AS holder_name
        FROM public.studio_compliance_documents d
        JOIN public.studio_contacts sc ON sc.id = d.holder_id
       WHERE d.expires_on IS NOT NULL
         AND cardinality(d.blocks) > 0
         AND d.expires_on <= CURRENT_DATE + 30
         -- A CARD THE ROOM HAS FOLDED AWAY ANNOUNCES NOTHING (migrations
         -- review r2 B2-4, reproduced locally). merge_studio_contacts() leaves
         -- an absorbed document on the absorbed card wherever the survivor
         -- holds no successor to retire it (00629 §5, crm-model §4) —
         -- correctly — and compliance_document_state() still reads that row
         -- `lapsed`. Without this leg the sweep wrote "Absorbed Firm B's paper
         -- has lapsed" to every owner and admin, with a deep link to a card
         -- people_directory emits no row for and company-card.tsx renders as
         -- though it were live, over a lapse that blocks nothing. The same
         -- `merged_into IS NULL` leg the Directory (00629 §6) and the auto-link
         -- resolver (§4b) already take: the survivor's own row is the whole
         -- human, and its paper is what the studio is told about.
         AND sc.merged_into IS NULL
       ORDER BY d.expires_on, d.id
    LOOP
      v_scanned := v_scanned + 1;
      CONTINUE WHEN v_doc.state NOT IN ('lapses_soon', 'lapsed');

      INSERT INTO public.studio_compliance_notices
        (organization_id, document_id, state, expires_on)
      VALUES
        (v_doc.organization_id, v_doc.id, v_doc.state, v_doc.expires_on)
      ON CONFLICT (document_id, state, expires_on) DO NOTHING
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
      -- THE PAPER, IN THE STUDIO'S WORDS (migrations review r1 M-5). The
      -- fallback used to be the raw column token, and doc_label is blank on
      -- every ordinary paper — so the notice the principal actually read was
      -- "coi_gl for Ostrom Builders lapsed 31 Dec 2025." SPEC §7 and §5.7 #8
      -- forbid a schema word on a face, and a notification IS a face. The map
      -- is the whole doc_type vocabulary (00623), so nothing can fall through
      -- to the token: an `other_named` row is required by
      -- studio_compliance_documents_doc_label_check to carry its own label,
      -- and a type this map has not learned reads "a document" rather than a
      -- column name. The studio's own typed label still wins where it has one.
      v_paper := COALESCE(
        NULLIF(btrim(v_doc.doc_label), ''),
        CASE v_doc.doc_type
          WHEN 'coi_gl'                    THEN 'the certificate of insurance'
          WHEN 'coi_wc'                    THEN 'the workers comp certificate'
          WHEN 'coi_auto'                  THEN 'the auto insurance certificate'
          WHEN 'w9'                        THEN 'the W-9'
          WHEN 'license'                   THEN 'the licence'
          WHEN 'bond'                      THEN 'the bond'
          WHEN 'lien_waiver_conditional'   THEN 'the conditional lien waiver'
          WHEN 'lien_waiver_unconditional' THEN 'the unconditional lien waiver'
          ELSE 'a document'
        END);
      v_message := CASE v_doc.state
                     WHEN 'lapsed' THEN
                       initcap(left(v_paper, 1)) || right(v_paper, -1)
                       || ' for ' || v_holder || ' lapsed '
                       || to_char(v_doc.expires_on, 'FMDD Mon YYYY') || '.'
                     ELSE
                       initcap(left(v_paper, 1)) || right(v_paper, -1)
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
  'per (document, state, expires_on) and one in_app notification_log row per '
  'owner/admin of the holding studio. The unique index is the idempotency '
  'rule, and the '
  'notification is written only where the notice row actually landed, so the '
  'studio is told twice for any one date — once as it enters lapses_soon '
  'and once as it lapses — and never again. A date the studio CORRECTS or '
  'EXTENDS is a different sentence, so it announces again rather than being '
  'silenced by a notice about a date that no longer exists (r5 M-3). '
  'Advisory xact lock, one job_runs '
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
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Everyone on the Job (00630): compliance-document-expiry-sweep nightly at 06:00 UTC -> public.sweep_compliance_expiries(), writing one studio_compliance_notices row per (document, state, expires_on) as a gating compliance paper enters lapses_soon or lapses, plus one in_app notification_log row per owner/admin of the holding studio; history in job_runs. The Invoice, Standing Alone (00574): invoice-checkout-attempts-expire at 17 past every hour -> public.expire_stale_invoice_checkout_attempts(), expiring claimed/session_created Checkout attempts older than 24h (never processing), history in job_runs. The Decision, Delivered (00572): decision-reminders-hourly on the hour -> the decision-reminders edge function, replacing 00092''s decision-reminders-daily at 09:00 UTC so the per-recipient not-before-8am-local gate has an hour to release into; notification-digest-hourly at 20 past -> the notification-digest edge function, replacing 00278''s notification-digest-daily at 15:00 UTC for the same reason (the summary owes the same 8am-local, never-Sunday promise as the letter); client-push-window-release every 15 minutes -> public.release_due_client_pushes(200), dispatching push envelopes held outside 8am-8pm local; decision-first-notice-retry-sweep every 30 minutes -> public.sweep_decision_first_notices(100), re-inviting decision-first-notice for a published approval that never got its letter. Studio onboarding (00553): expire-stale-workspace-invites-daily at 07:40 UTC. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes. Rendered Room v2 (00501): expire-stale-upload-intents-daily at 07:15 UTC. Room View, Agent OS, BOH, Field Site Request, Mood Board, invoice/decision reminders, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
