-- ═══════════════════════════════════════════════════════════════════════════
-- 00639 — The Field Line · tenant, suppression, consent-code and ref AUTHORITY
--
-- Phase 0 wave 0B, re-derived against origin/main (e0598724e, the People room
-- CRM program). One migration, four authorities, no TypeScript: the consumers
-- (P0-04 dispatch, P0-05 effects/templates, P0-06a/b inbound protocol) land
-- against the schema pinned here.
--
--   1. public.sms_suppressions — phone-global STOP per sender number, carrier
--      semantics: independent of project_parties rows, so it survives adding a
--      new party on a new project (contract S2). Helpers sms_is_suppressed()
--      (per sender/recipient pair, the dispatch question) and
--      sms_phone_suppressed() (any sender on the number, the consent question).
--   2. public.sms_prompts — the ref-code authority (contract S1). A prompt is an
--      IMMUTABLE binding of party + project + kind + subject + version + expiry
--      to a short code unique per (sender, recipient) across open prompts and
--      prompts closed inside the last 90 days. Consent challenges are
--      kind='optin' rows, one outstanding per (party, version) (contract S2).
--      sms_next_short_code() allocates, a partial unique index enforces, and
--      sms_resolve_prompt() refuses a closed or expired ref, so a stale ref can
--      never be retargeted at whatever that number means today.
--   3. public.sms_conversation_context — project-scoped conversation state,
--      keyed (conversation_id, project_id) (contract S4). sms_conversations
--      keeps its transport key and its legacy state columns; P0-06b moves the
--      reads, a later ticket drops the columns.
--   4. sms_messages.owner_user_id — review ownership (contract S4).
--
-- LINEAGE — every function replaced here is grafted from its LATEST definition
-- (patina-db-migrations, step "graft from the latest"):
--   · channel_consent_status(uuid,text,text)      ← 00594:1052  (only definition)
--   · review_sms_message(uuid,text,jsonb)         ← 00282:489   (only definition)
--   · sms_conversations/sms_messages team SELECT  ← 00282:120-164
--   · sms_conversations/sms_messages studio SELECT ← 00584:1043-1063
--   Untouched on purpose: record_channel_consent() (00622:110 — the write gate
--   needs no change once the record itself carries the suppression fact),
--   project_consent_org() (00594:1126), refuse_legacy_consent_write() (00594:854),
--   create_field_link() (00627:525 — P0-04 owns it), apply_field_effect()
--   (00399:4878 — P0-05 owns it), 00432's activation hardening.
--
-- CONSENT — THE RECORD STAYS THE ONLY GRANT (contract S2, ruling R-AW/R-AY).
--   This file adds NO parallel consent ledger. studio_channel_consent remains
--   the one grant and the one reader; suppression is a LAYER in front of it,
--   wired in two places so both the room and the rail see it without a line of
--   TypeScript changing:
--     · READ  — channel_consent_status() folds a suppressed sms value to
--       'opted_out' whatever the record says (the same shape the function
--       already uses for refusal_unanswered).
--     · WRITE — a BEFORE INSERT/UPDATE trigger on studio_channel_consent
--       stamps refusal_unanswered = true on any sms record for a suppressed
--       number. refusal_unanswered is ALREADY verdict-bearing in the send gate
--       (_shared/sms.ts channelConsentVerdict :438-440 refuses on it before it
--       reads status) and in the write gate (record_channel_consent's
--       DO UPDATE … WHERE), so a studio that records a fresh invite after a STOP
--       mints a record that is unsendable by construction. That is what closes
--       the `unknown` verdict gap at sms.ts:463-475 without touching sms.ts,
--       which this wave does not own.
--   START lifts the suppression (lifted_at) and re-asks; it never grants.
--
-- AUTHORITY REPAIR (the finding that forced this migration):
--   00282_sms_core.sql:120-141 and :143-164 let ANY studio with a party on a
--   phone read that phone's whole conversation AND its attributed messages —
--   including another studio's — through the phone fallback at :135 and :157.
--   00584_studio_comember_rls_sweep.sql:1043-1063 then added studio-wide SELECT
--   policies beside them; permissive policies OR, so both sets are rewritten:
--     · sms_messages: SELECT requires project_id IS NOT NULL and the reader's
--       own project (team, owning designer, or studio co-member). The phone
--       fallback is gone, so a message with no project attribution — the
--       unresolved chooser text and its media — matches no policy at all and is
--       service-role only.
--     · sms_conversations: SELECT stays scoped to active_project_id (00584's
--       own shape, which the 00584 sweep test asserts at case I2) but the phone
--       fallback is gone AND the three cross-studio columns — party_id, state,
--       state_context — are revoked at the COLUMN level. One transport row is
--       shared by every studio on the handset and its state_context carries the
--       cross-studio chooser plus the pending body and media; RLS is row-level
--       and cannot fix that, so the columns are. Project-scoped state lives in
--       sms_conversation_context.
--     · review_sms_message no longer resolves a project through the phone
--       fallback: an unattributed message cannot be triaged by anyone.
--     · a BEFORE UPDATE guard makes attribution final — once a message carries
--       a project_id, nothing (service role included) may retarget it.
--   Studio-facing projection: public.sms_review_queue (SECURITY INVOKER, so the
--   repaired base-table RLS is what scopes it).
--
-- PRIVILEGES (contract S12). On this stack ALTER DEFAULT PRIVILEGES still hands
--   anon and authenticated arwdDxtm on every new table and EXECUTE on every new
--   function at creation time (measured: pg_default_acl, and sms_messages'
--   relacl shows authenticated holding INSERT/UPDATE/DELETE today). "We granted
--   nothing" is therefore NOT a posture. Every table and function this file
--   creates carries an explicit REVOKE ALL … FROM PUBLIC, anon, authenticated
--   BEFORE its policies, and the two 00282 tables are narrowed the same way.
--   supabase/seed/00-legacy-grants.sql is regenerated alongside this file so
--   the REVOKEs survive `supabase db reset` (that seed replays the migrations'
--   ACL history after the blanket legacy baseline).
--
-- Additive + idempotent (D7): CREATE … IF NOT EXISTS, CREATE OR REPLACE,
-- DROP POLICY IF EXISTS + CREATE, guarded ALTER … ADD CONSTRAINT. Re-applying
-- the file converges the schema rather than failing, so a database that already
-- carries an earlier application of this same number lands on the shape below.
--
-- REPAIR PASS — the bound Codex review of the first candidate (SQ-24)
-- reproduced three defects in rolled-back local SQL. What changed:
--   F1  THE BACKFILL LEAKED. It copied the whole shared state_context onto the
--       active project's authenticated-readable context row, so studio A read
--       studio B's chooser entries and the unresolved pending body and media.
--       The backfill is now a CLASSIFIED MOVE
--       (public.sms_backfill_conversation_context): a project-attributed row
--       receives only the keys that belong to THAT project — menu,
--       menu_created_at, delivery_confirms_sent, and a project_pin that names
--       it — and it receives the parked reply as well ONLY when the chooser
--       names no other project. Anything still unresolved goes to an
--       UNATTRIBUTED HOLDING ROW (project_id NULL) that no studio policy
--       reaches, so P0-06b can finish the choice. project_id is therefore
--       nullable and the (conversation_id, project_id) key is a unique index
--       with NULLS NOT DISTINCT instead of a primary key.
--   F2  SUPPRESSION DID NOT REACH THE RECORDS THAT ALREADY EXISTED. The BEFORE
--       trigger below stamps a record as it is written, which leaves a record
--       already sitting at granted/refusal_unanswered=false untouched — and
--       that record is exactly what the real send gate reads
--       (_shared/sms.ts channelConsentVerdict :389-475, the direct read at
--       :408-436), so the rail kept saying allow while the room said opted_out.
--       An AFTER INSERT OR UPDATE trigger on sms_suppressions now stamps EVERY
--       existing sms record for that normalized channel_value, in every
--       organization, to status='opted_out' + refusal_unanswered=true. Lifting
--       a suppression restores nothing: START re-grants explicitly and only the
--       records it names (contract revision 4, owner decision), which is
--       P0-06a's work.
--   F3  THE 90-DAY RESERVATION DIED WITH THE ENGAGEMENT. It lived only on
--       sms_prompts, which cascades with its party and its project, so deleting
--       a sub from a job released that job's live `Ref 10` immediately and a
--       late `DONE 10` from the same handset resolved whatever 10 meant next —
--       for whichever studio. CHOICE MADE HERE: A TOMBSTONE, NOT A DELETION
--       BLOCK. public.sms_short_code_reservations (sender_number,
--       recipient_phone, short_code, reserved_until) carries no foreign key at
--       all, so nothing can cascade to it, and sms_next_short_code consults it.
--       Refusing to delete an engagement until reserved_until was rejected: a
--       studio taking a sub off a job must not be told to wait ninety days, and
--       a retention fact about a phone number is not a reason to hold tenant
--       rows hostage.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Composite key on project_parties so a party can only ever be referenced
--    together with its own project (cross-tenant rows become unwritable)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS project_parties_id_project_uniq
  ON public.project_parties (id, project_id);

COMMENT ON INDEX public.project_parties_id_project_uniq IS
  'The Field Line (00639): id is already the primary key, so this adds no rule '
  'a row could break. It exists so sms_prompts and sms_conversation_context can '
  'carry a COMPOSITE (party_id, project_id) foreign key — which makes a prompt '
  'or a context row naming another studio''s party impossible to write at all, '
  'rather than merely unreadable.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. sms_suppressions — phone-global STOP (contract S2)
-- ═══════════════════════════════════════════════════════════════════════════
-- Carrier semantics: STOP is a property of (our sender number, their handset),
-- NOT of a project_parties row or a studio. It therefore outlives party churn
-- and applies to every studio sharing the sender number.
CREATE TABLE IF NOT EXISTS public.sms_suppressions (
  sender_number   TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  reason          TEXT NOT NULL DEFAULT 'stop',
  suppressed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_at       TIMESTAMPTZ,
  PRIMARY KEY (sender_number, recipient_phone)
);

COMMENT ON TABLE public.sms_suppressions IS
  'The Field Line (00639), contract S2: phone-global STOP per sender number. '
  'Independent of project_parties — it survives adding a new party on a new '
  'project, and it wins over any studio_channel_consent record (the read fold '
  'in channel_consent_status() and the write stamp on the record itself). '
  'lifted_at set = START was received; START re-asks, it never grants. '
  'Service-role only (RLS on, no authenticated policy, no authenticated grant): '
  'one row is shared by every studio on that sender number, so there is no '
  'tenant that may read it.';

COMMENT ON COLUMN public.sms_suppressions.reason IS
  'Why the recipient is suppressed: ''stop'' (STOP/STOPALL/UNSUBSCRIBE/QUIT), '
  '''carrier'' (a provider-side block), ''manual'' (a studio or operator hold).';

-- Both endpoints are stored on the SAME key rule studio_channel_consent uses
-- (normalize_channel_value, 00593), so the dispatch gate, the inbound STOP
-- handler and the consent record can never miss each other over formatting. A
-- short code or alphanumeric sender id that does not parse is kept verbatim.
CREATE OR REPLACE FUNCTION public.sms_normalize_endpoint_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.sender_number   := public.normalize_channel_value('sms', NEW.sender_number);
  NEW.recipient_phone := public.normalize_channel_value('sms', NEW.recipient_phone);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_normalize_endpoint_columns() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sms_normalize_endpoint_columns() IS
  'BEFORE INSERT/UPDATE trigger (00639): normalizes sender_number and '
  'recipient_phone through normalize_channel_value(''sms'', …) — the one key '
  'rule studio_channel_consent and studio_contact_channels already share — on '
  'sms_suppressions and sms_prompts.';

DROP TRIGGER IF EXISTS sms_suppressions_a_normalize ON public.sms_suppressions;
CREATE TRIGGER sms_suppressions_a_normalize
  BEFORE INSERT OR UPDATE ON public.sms_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.sms_normalize_endpoint_columns();

-- S12: the REVOKE is load-bearing and comes BEFORE the policy. This stack's
-- creation-time defaults already handed anon and authenticated everything.
ALTER TABLE public.sms_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_suppressions FROM PUBLIC, anon, authenticated;
GRANT ALL  ON public.sms_suppressions TO service_role;
-- No authenticated policy on purpose: a suppression row belongs to no project.

CREATE INDEX IF NOT EXISTS idx_sms_suppressions_active
  ON public.sms_suppressions (recipient_phone)
  WHERE lifted_at IS NULL;

-- The question every send path asks before dispatch: has THIS handset stopped
-- THIS sender number?
CREATE OR REPLACE FUNCTION public.sms_is_suppressed(p_sender TEXT, p_recipient TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.sms_suppressions s
     WHERE s.sender_number   = public.normalize_channel_value('sms', p_sender)
       AND s.recipient_phone = public.normalize_channel_value('sms', p_recipient)
       AND s.lifted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.sms_is_suppressed(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_is_suppressed(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.sms_is_suppressed(TEXT, TEXT) IS
  'The Field Line (00639), contract S2: true when this handset has STOPped this '
  'sender number and has not STARTed again. Phone-global — no party row and no '
  'studio is consulted. Service-role only: the dispatch gate asks it, and a '
  'studio member asking it would learn about handsets it has no relationship '
  'with. The room asks sms_phone_suppressed() through channel_consent_status() '
  'instead.';

-- The consent question. channel_consent_status() is keyed (organization, kind,
-- value) and has no sender number to give, so the fold is over ANY of our
-- sender numbers: a handset that has stopped any Patina number reads opted_out.
-- Today there is one number platform-wide (00282's ruling 2), so the two
-- questions coincide; when there are several, the broader answer is the safe
-- one for a consent verdict.
CREATE OR REPLACE FUNCTION public.sms_phone_suppressed(p_recipient TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.sms_suppressions s
     WHERE s.recipient_phone = public.normalize_channel_value('sms', p_recipient)
       AND s.lifted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.sms_phone_suppressed(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_phone_suppressed(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.sms_phone_suppressed(TEXT) IS
  'The Field Line (00639): true when this handset has STOPped ANY Patina sender '
  'number and has not STARTed again. SECURITY DEFINER and granted to '
  'authenticated so channel_consent_status() — which is SECURITY INVOKER by '
  'design — can fold suppression into the verdict the Call Sheet and the '
  'Directory print. It returns a boolean about a number the caller already '
  'holds, never a row: the caller learns nothing it did not already ask about, '
  'and sms_suppressions itself stays service-role only. Without this, the room '
  'would print "Texting" for a number the rail refuses — the exact G-3 shape '
  '00594 exists to end.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The consent gate learns about suppression (contract S2)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 2a. The one reader folds it (grafted from 00594:1052, verbatim + one arm)
-- The original returns scc.status unless refusal_unanswered stands, in which
-- case the honest word is opted_out. A suppression IS a refusal that stands and
-- has not been answered — made by the recipient, to the carrier, about the
-- number itself — so it takes the same arm, and it is read FIRST because it
-- outranks any record a studio can write. The FROM becomes a LEFT JOIN so a
-- suppressed number with no record still answers opted_out instead of the
-- no-row NULL; for every other input the result is identical to 00594's.
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
  SELECT CASE
           WHEN p_channel_kind = 'sms'
                AND public.sms_phone_suppressed(p_channel_value) THEN 'opted_out'
           WHEN scc.refusal_unanswered IS TRUE                   THEN 'opted_out'
           ELSE scc.status
         END
    FROM (SELECT 1) AS one
    LEFT JOIN public.studio_channel_consent scc
           ON scc.organization_id = p_organization_id
          AND scc.channel_kind    = p_channel_kind
          AND scc.channel_value   = p_channel_value
$$;

REVOKE ALL ON FUNCTION public.channel_consent_status(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.channel_consent_status(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.channel_consent_status(uuid, text, text) IS
  'The studio''s verdict for one channel value, read off studio_channel_consent '
  '— the single source since R-AS. NULL means this studio holds no record for '
  'that value, which is what `not_asked` means; callers that must print a word '
  'COALESCE it. THE VERDICT IS status AND refusal_unanswered TOGETHER '
  '(close-review r2 MAJOR-2): an unanswered refusal reads `opted_out` whatever '
  'the status column says, because that is what the send gate (_shared/sms.ts '
  'channelConsentVerdict) and the write gate (record_channel_consent) both '
  'already do with the flag. 00639 adds the Field Line''s suppression layer '
  '(contract S2) as the FIRST arm: a handset that has texted STOP reads '
  '`opted_out` regardless of any record, and regardless of a fresh record a '
  'studio writes afterwards, so the room cannot print "Texting" for a number '
  'the rail refuses. SECURITY INVOKER, so the table''s member-only RLS decides '
  'what a caller may read; the suppression arm goes through '
  'sms_phone_suppressed(), which is DEFINER precisely so this function need not '
  'be. Used by v_project_roster and people_directory in place of '
  'project_parties.sms_consent_*, which is frozen legacy (00594).';

-- ── 2b. The record itself carries the fact, so the send gate needs no change
-- _shared/sms.ts channelConsentVerdict reads studio_channel_consent DIRECTLY
-- (:411-448), not through channel_consent_status, and refuses on
-- refusal_unanswered before it reads status. Stamping the flag at write time is
-- therefore what makes "a studio that records a fresh invite after a STOP
-- cannot text that number" true in the rail as well as in the room — with no
-- TypeScript change, which this wave does not own. It is the record speaking,
-- not a second ledger: the record is still the only grant.
CREATE OR REPLACE FUNCTION public.sms_suppression_holds_consent_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.channel_kind = 'sms' AND public.sms_phone_suppressed(NEW.channel_value) THEN
    NEW.refusal_unanswered := true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_suppression_holds_consent_record() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sms_suppression_holds_consent_record() IS
  'BEFORE INSERT/UPDATE on studio_channel_consent (00639, contract S2): an sms '
  'record for a suppressed handset is minted carrying refusal_unanswered — the '
  'flag every reader already treats as "a refusal stands and has not been '
  'answered". The studio''s own status and evidence are left intact (the record '
  'holds both facts at once, the r8 W4-M2 shape); what the stamp removes is the '
  'ability to write a sendable record over a STOP. Lifting the suppression '
  '(START) lets the flag be lowered again by the inbound rail''s own write.';

DROP TRIGGER IF EXISTS sms_suppression_holds_consent_record_trg ON public.studio_channel_consent;
CREATE TRIGGER sms_suppression_holds_consent_record_trg
  BEFORE INSERT OR UPDATE ON public.studio_channel_consent
  FOR EACH ROW EXECUTE FUNCTION public.sms_suppression_holds_consent_record();

-- ── 2c. …and the STOP reaches the records that already exist (SQ-24 F2)
-- 2b stamps a record as it is WRITTEN, which is the residue case: a studio
-- recording a fresh invite after a STOP. It cannot reach the record that was
-- already sitting at granted/refusal_unanswered=false when the STOP arrived —
-- and that record is precisely what the send gate reads, directly
-- (_shared/sms.ts channelConsentVerdict :408-436), so the rail went on saying
-- allow while channel_consent_status said opted_out. The suppression must
-- therefore write itself into every record it outranks, at the moment it
-- arrives: one statement, every organization holding an sms record for that
-- handset. status moves as well as the flag, because opted_out is what the
-- record now truthfully says.
--
-- The refusal's own evidence columns (opt_out_source / opt_out_evidence /
-- opt_out_recorded_at / opt_out_recorded_by) are deliberately NOT touched: the
-- rail that received the STOP writes those in its own words, and overwriting a
-- studio's recorded refusal evidence is the r8 W4-M2 defect. A dateless refusal
-- is the normal shape here (studio_channel_consent.refusal_unanswered's own
-- comment says so), which is why nothing is inferred from opt_out_at.
--
-- Lifting a suppression restores NOTHING — the guard is on lifted_at IS NULL,
-- so an UPDATE that sets lifted_at does no stamping and no un-stamping. Contract
-- revision 4: START re-grants only the records it names, explicitly, in P0-06a.
CREATE OR REPLACE FUNCTION public.sms_suppression_stamps_existing_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.lifted_at IS NULL THEN
    UPDATE public.studio_channel_consent scc
       SET status             = 'opted_out',
           refusal_unanswered = true
     WHERE scc.channel_kind  = 'sms'
       AND scc.channel_value = NEW.recipient_phone
       AND (scc.status IS DISTINCT FROM 'opted_out'
            OR scc.refusal_unanswered IS NOT TRUE);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_suppression_stamps_existing_records() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sms_suppression_stamps_existing_records() IS
  'AFTER INSERT OR UPDATE on sms_suppressions (00639, contract S2): an active '
  'suppression stamps every studio_channel_consent sms record for that handset '
  '— in every organization — to opted_out with refusal_unanswered raised, '
  'because the send gate reads the record itself and never asks a suppression '
  'helper. SECURITY DEFINER so the stamp is unconditional; the table it is '
  'triggered from is service-role only, so nothing an authenticated caller can '
  'do reaches it. NEW.recipient_phone is already normalized here — the BEFORE '
  'trigger sms_suppressions_a_normalize ran first. Lifting a suppression does '
  'not undo the stamp (contract revision 4: START re-grants explicitly).';

DROP TRIGGER IF EXISTS sms_suppressions_b_hold_records ON public.sms_suppressions;
CREATE TRIGGER sms_suppressions_b_hold_records
  AFTER INSERT OR UPDATE ON public.sms_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.sms_suppression_stamps_existing_records();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. sms_prompts — the ref-code authority (contract S1 + S2)
-- ═══════════════════════════════════════════════════════════════════════════
-- A prompt is the immutable record of one question we asked one handset:
--   "Ref 17 — Confirm the vanity is on site" → kind='confirm_availability',
--   subject_id = the task, version = the ask generation, expires_at = its life.
-- A late `DONE 17` resolves against THAT row or is refused; it can never be
-- re-pointed at whatever "17" means today.
--
-- code_reserved is not decoration: the 90-day non-reuse window cannot be
-- expressed in a partial index predicate (now() is not immutable), so the
-- window is materialized as a boolean that sms_release_expired_short_codes()
-- clears lazily, and the partial unique index keys off it.
CREATE TABLE IF NOT EXISTS public.sms_prompts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  party_id        UUID NOT NULL,
  sender_number   TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (btrim(kind) <> ''),
  subject_id      UUID,
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  short_code      TEXT NOT NULL CHECK (short_code ~ '^[0-9]{2,3}$'),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  answered_at     TIMESTAMPTZ,
  code_reserved   BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The party must belong to the prompt's OWN project — a cross-tenant prompt is
-- not merely unreadable, it cannot be written.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_prompts_party_project_fkey'
       AND conrelid = 'public.sms_prompts'::regclass
  ) THEN
    ALTER TABLE public.sms_prompts
      ADD CONSTRAINT sms_prompts_party_project_fkey
      FOREIGN KEY (party_id, project_id)
      REFERENCES public.project_parties (id, project_id) ON DELETE CASCADE;
  END IF;
END;
$$;

COMMENT ON TABLE public.sms_prompts IS
  'The Field Line (00639), contract S1: every question we asked a handset, and '
  'the `Ref NN` short code that answers it. The binding of party + project + '
  'kind + subject_id + version + expires_at is IMMUTABLE (a BEFORE UPDATE '
  'trigger, not a comment), so a late reply resolves the ORIGINAL prompt or is '
  'refused — never the current menu. kind=''optin'' rows are the consent '
  'challenges of contract S2. The composite (party_id, project_id) foreign key '
  'makes a prompt naming another studio''s party unwritable.';
COMMENT ON COLUMN public.sms_prompts.kind IS
  'Prompt kind. Phase 0 uses ''optin'' (consent challenge, contract S2) plus the '
  'field asks: confirm_availability, report_arrival, report_condition, '
  'report_departure, report_delay, mark_done. Deliberately not a CHECK list — '
  'new asks arrive with their effect migration (contract S3, P0-05).';
COMMENT ON COLUMN public.sms_prompts.subject_id IS
  'What the prompt is about (project_tasks.id, client_decisions.id, …), or NULL '
  'for a subject-less ask such as an opt-in challenge. Part of the immutable '
  'binding: a stale ref cannot be retargeted at a different subject.';
COMMENT ON COLUMN public.sms_prompts.version IS
  'The ask generation. A re-ask on the same subject opens a NEW version, so a '
  'reply to the old ref resolves the old version''s row (contract S1) and a '
  'new opt-in challenge is possible for a party whose earlier challenge is '
  'still open at an earlier version.';
COMMENT ON COLUMN public.sms_prompts.code_reserved IS
  'True while this short_code is unavailable for reuse on (sender_number, '
  'recipient_phone) — i.e. the prompt is open, or closed less than 90 days ago. '
  'Cleared by sms_release_expired_short_codes(); the partial unique index keys '
  'off it, because a 90-day window cannot live in an index predicate (now() is '
  'not immutable).';

-- Contract S1: a short code is unique per (sender, recipient) across open
-- prompts and prompts closed inside the 90-day window.
CREATE UNIQUE INDEX IF NOT EXISTS sms_prompts_short_code_reserved_uniq
  ON public.sms_prompts (sender_number, recipient_phone, short_code)
  WHERE code_reserved;

-- Contract S2: one outstanding consent challenge per (party, engagement
-- version). START re-asks the existing challenge; it never opens a second.
CREATE UNIQUE INDEX IF NOT EXISTS sms_prompts_open_optin_uniq
  ON public.sms_prompts (party_id, version)
  WHERE kind = 'optin' AND answered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sms_prompts_open
  ON public.sms_prompts (sender_number, recipient_phone, expires_at DESC)
  WHERE answered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sms_prompts_project
  ON public.sms_prompts (project_id, created_at DESC);

-- ── The reservation outlives the engagement (contract S1, SQ-24 F3) ─────────
-- sms_prompts cascades with its project and with its party. Without this table
-- the 90-day window lived only on rows inside the tenant graph, so removing a
-- sub from a job handed that job's live `Ref 10` straight back to the pool and
-- a late `DONE 10` from the same handset resolved whatever 10 meant next — for
-- whichever studio. The reservation is kept OUTSIDE that graph: no foreign key
-- at all, so no cascade can reach it, and sms_next_short_code asks it first.
CREATE TABLE IF NOT EXISTS public.sms_short_code_reservations (
  sender_number   TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  short_code      TEXT NOT NULL,
  reserved_until  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sender_number, recipient_phone, short_code)
);

COMMENT ON TABLE public.sms_short_code_reservations IS
  'The Field Line (00639), contract S1: the durable half of the short-code '
  'window. One row per (sender_number, recipient_phone, short_code) says when '
  'that code may be issued again — the prompt''s closure (answered, else '
  'expired) plus 90 days. It deliberately carries NO foreign key: a prompt row '
  'dies with its party and its project, and a ref that a handset may still '
  'reply to must not die with them (SQ-24 F3). sms_prompts.code_reserved and '
  'its partial unique index remain the write-time backstop for live rows; THIS '
  'table is what the allocator trusts, because it is what survives. '
  'Service-role only: a reservation belongs to a handset, not to a tenant.';

ALTER TABLE public.sms_short_code_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_short_code_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL  ON public.sms_short_code_reservations TO service_role;
-- No authenticated policy on purpose, exactly as for sms_suppressions.

DROP TRIGGER IF EXISTS sms_prompts_a_normalize ON public.sms_prompts;
CREATE TRIGGER sms_prompts_a_normalize
  BEFORE INSERT OR UPDATE ON public.sms_prompts
  FOR EACH ROW EXECUTE FUNCTION public.sms_normalize_endpoint_columns();

-- ── The immutable binding (contract S1) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sms_prompts_guard_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.project_id      IS DISTINCT FROM OLD.project_id
     OR NEW.party_id        IS DISTINCT FROM OLD.party_id
     OR NEW.sender_number   IS DISTINCT FROM OLD.sender_number
     OR NEW.recipient_phone IS DISTINCT FROM OLD.recipient_phone
     OR NEW.kind            IS DISTINCT FROM OLD.kind
     OR NEW.subject_id      IS DISTINCT FROM OLD.subject_id
     OR NEW.version         IS DISTINCT FROM OLD.version
     OR NEW.short_code      IS DISTINCT FROM OLD.short_code
     OR NEW.expires_at      IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'sms_prompts: the prompt binding (party/project/kind/subject/version/code/expiry) is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.answered_at IS NOT NULL AND NEW.answered_at IS DISTINCT FROM OLD.answered_at THEN
    RAISE EXCEPTION 'sms_prompts: answered_at is write-once'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.code_reserved AND NOT OLD.code_reserved THEN
    RAISE EXCEPTION 'sms_prompts: a released short code cannot be re-reserved'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_prompts_guard_binding() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sms_prompts_guard_binding() IS
  'BEFORE UPDATE on sms_prompts (00639): enforces contract S1''s immutable '
  'binding. Only answered_at (write-once) and code_reserved (true→false) may '
  'move, so no code path — service role included — can retarget a live ref.';

DROP TRIGGER IF EXISTS sms_prompts_b_guard_binding ON public.sms_prompts;
CREATE TRIGGER sms_prompts_b_guard_binding
  BEFORE UPDATE ON public.sms_prompts
  FOR EACH ROW EXECUTE FUNCTION public.sms_prompts_guard_binding();

-- Every reserved code writes its tombstone as it is taken, and extends it when
-- the prompt closes. GREATEST keeps the window monotonic, so a code cannot be
-- freed early by a later row that happens to close sooner.
CREATE OR REPLACE FUNCTION public.sms_prompts_reserve_short_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.code_reserved THEN
    INSERT INTO public.sms_short_code_reservations AS r
      (sender_number, recipient_phone, short_code, reserved_until)
    VALUES (NEW.sender_number, NEW.recipient_phone, NEW.short_code,
            COALESCE(NEW.answered_at, NEW.expires_at) + interval '90 days')
    ON CONFLICT (sender_number, recipient_phone, short_code) DO UPDATE
       SET reserved_until = GREATEST(r.reserved_until, EXCLUDED.reserved_until);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_prompts_reserve_short_code() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sms_prompts_reserve_short_code() IS
  'AFTER INSERT OR UPDATE on sms_prompts (00639, contract S1): mirrors the '
  'code''s 90-day window into sms_short_code_reservations, which no cascade can '
  'reach. A row whose code_reserved is already false writes nothing, so '
  'sms_release_expired_short_codes'' own UPDATE does not resurrect the tombstone '
  'it just deleted.';

DROP TRIGGER IF EXISTS sms_prompts_c_reserve_code ON public.sms_prompts;
CREATE TRIGGER sms_prompts_c_reserve_code
  AFTER INSERT OR UPDATE ON public.sms_prompts
  FOR EACH ROW EXECUTE FUNCTION public.sms_prompts_reserve_short_code();

-- ── Short-code allocation (contract S1) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sms_release_expired_short_codes(
  p_sender    TEXT,
  p_recipient TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender    TEXT := public.normalize_channel_value('sms', p_sender);
  v_recipient TEXT := public.normalize_channel_value('sms', p_recipient);
  v_released  INTEGER;
BEGIN
  -- A prompt closes when it is answered, else when it expires. 90 days after
  -- that its code returns to the pool. COALESCE(answered_at, expires_at) is one
  -- expression for both closures.
  UPDATE public.sms_prompts
     SET code_reserved = false
   WHERE sender_number   = v_sender
     AND recipient_phone = v_recipient
     AND code_reserved
     AND COALESCE(answered_at, expires_at) < now() - interval '90 days';
  GET DIAGNOSTICS v_released = ROW_COUNT;

  -- The tombstone expresses the same window and is the half that survives the
  -- prompt row, so it is cleared on the same rule and at the same moment.
  DELETE FROM public.sms_short_code_reservations
   WHERE sender_number   = v_sender
     AND recipient_phone = v_recipient
     AND reserved_until <= now();

  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_release_expired_short_codes(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_release_expired_short_codes(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.sms_release_expired_short_codes(TEXT, TEXT) IS
  'The Field Line (00639): returns short codes to the pool for one (sender, '
  'recipient) pair once their prompt has been closed for more than 90 days '
  '(contract S1). Called lazily by sms_next_short_code — no cron needed.';

CREATE OR REPLACE FUNCTION public.sms_next_short_code(
  p_sender    TEXT,
  p_recipient TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender    TEXT := public.normalize_channel_value('sms', p_sender);
  v_recipient TEXT := public.normalize_channel_value('sms', p_recipient);
  v_code      TEXT;
BEGIN
  IF v_sender IS NULL OR v_recipient IS NULL THEN
    RAISE EXCEPTION 'sms_next_short_code: sender and recipient are both required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize allocation for this pair to the end of the CALLER's transaction,
  -- so two issuers racing on the same handset cannot read the same free code:
  -- the second waits until the first has inserted its prompt and committed.
  -- sms_prompts_short_code_reserved_uniq is still the hard backstop for any
  -- writer that skips this function — the loser of such a race gets a
  -- unique_violation rather than a duplicate ref.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_sender || '|' || v_recipient, 0));

  PERFORM public.sms_release_expired_short_codes(v_sender, v_recipient);

  -- Two digits (10–99) first: a flip phone types `DONE 17`, not a UUID.
  SELECT g.n::text INTO v_code
    FROM generate_series(10, 99) AS g(n)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.sms_short_code_reservations r
      WHERE r.sender_number   = v_sender
        AND r.recipient_phone = v_recipient
        AND r.short_code      = g.n::text
        AND r.reserved_until  > now()
   )
     AND NOT EXISTS (
     SELECT 1 FROM public.sms_prompts p
      WHERE p.sender_number   = v_sender
        AND p.recipient_phone = v_recipient
        AND p.code_reserved
        AND p.short_code = g.n::text
   )
   ORDER BY g.n
   LIMIT 1;

  -- Three digits only once 10–99 is genuinely exhausted for this handset.
  IF v_code IS NULL THEN
    SELECT g.n::text INTO v_code
      FROM generate_series(100, 999) AS g(n)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.sms_short_code_reservations r
        WHERE r.sender_number   = v_sender
          AND r.recipient_phone = v_recipient
          AND r.short_code      = g.n::text
          AND r.reserved_until  > now()
     )
       AND NOT EXISTS (
       SELECT 1 FROM public.sms_prompts p
        WHERE p.sender_number   = v_sender
          AND p.recipient_phone = v_recipient
          AND p.code_reserved
          AND p.short_code = g.n::text
     )
     ORDER BY g.n
     LIMIT 1;
  END IF;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'sms_next_short_code: no short code left for % → %', v_sender, v_recipient
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_next_short_code(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_next_short_code(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.sms_next_short_code(TEXT, TEXT) IS
  'The Field Line (00639): allocate the next `Ref NN` for a (sender, recipient) '
  'pair — contract S1. Two digits 10–99, unique across open prompts and prompts '
  'closed inside 90 days, three digits once exhausted. The window is read from '
  'sms_short_code_reservations, which outlives the prompt rows (SQ-24 F3), AND '
  'from the live rows themselves, so neither half alone can hand a code back '
  'early. Takes a transaction-level advisory lock on the pair so concurrent '
  'issuers serialize; the partial unique index is the write-time backstop.';

-- ── Ref resolution: a stale ref can never retarget ──────────────────────────
CREATE OR REPLACE FUNCTION public.sms_resolve_prompt(
  p_sender    TEXT,
  p_recipient TEXT,
  p_code      TEXT
)
RETURNS TABLE (
  id         UUID,
  project_id UUID,
  party_id   UUID,
  kind       TEXT,
  subject_id UUID,
  version    INTEGER,
  short_code TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.project_id, p.party_id, p.kind, p.subject_id, p.version,
         p.short_code, p.expires_at
    FROM public.sms_prompts p
   WHERE p.sender_number   = public.normalize_channel_value('sms', p_sender)
     AND p.recipient_phone = public.normalize_channel_value('sms', p_recipient)
     AND p.short_code      = NULLIF(regexp_replace(COALESCE(p_code, ''), '\D', '', 'g'), '')
     AND p.answered_at IS NULL
     AND p.expires_at > now()
   ORDER BY p.created_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.sms_resolve_prompt(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_resolve_prompt(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.sms_resolve_prompt(TEXT, TEXT, TEXT) IS
  'The Field Line (00639): resolve `Ref NN` for a handset to its ORIGINAL '
  'prompt (contract S1). An answered or expired prompt is not returned, so a '
  'late reply is refused rather than applied to whatever NN means today. The '
  'code is read digits-only, so `Ref 17`, `#17` and `17` all resolve the same '
  'row.';

ALTER TABLE public.sms_prompts ENABLE ROW LEVEL SECURITY;
-- S12: strip the creation-time defaults BEFORE the policy, then hand back only
-- a team-scoped read. Writes belong to the service client alone.
REVOKE ALL   ON public.sms_prompts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sms_prompts TO authenticated;
GRANT ALL    ON public.sms_prompts TO service_role;

-- Studio members see only their own projects' prompts. Same shape as the
-- repaired sms_messages policy: owning designer inlined (00212 — the owner is
-- not auto-added to project_team_members), is_project_team_member (00087), and
-- the studio co-member branch 00584 established for every sibling table.
DROP POLICY IF EXISTS sms_prompts_team_select ON public.sms_prompts;
CREATE POLICY sms_prompts_team_select
  ON public.sms_prompts FOR SELECT
  TO authenticated
  USING (
    public.is_project_team_member(project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = sms_prompts.project_id
        AND (p.designer_id = (select auth.uid()) OR public.is_studio_comember(p.designer_id))
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. sms_conversation_context — project-scoped state (contract S4)
-- ═══════════════════════════════════════════════════════════════════════════
-- sms_conversations stays the transport row (phone ↔ sender number) and keeps
-- its legacy state/state_context/active_project_id columns until P0-06b moves
-- the reads. Everything a studio may see about a conversation lives here, keyed
-- by project, so one handset working three studios produces three rows and no
-- studio reads another's menu, pin or pending confirmation.
CREATE TABLE IF NOT EXISTS public.sms_conversation_context (
  conversation_id UUID NOT NULL REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  party_id        UUID,
  state           TEXT NOT NULL DEFAULT 'idle'
                    CHECK (state IN ('idle', 'awaiting_project_choice', 'awaiting_confirmation')),
  state_context   JSONB NOT NULL DEFAULT '{}'::jsonb,
  paused_until    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- project_id IS NULL is the UNATTRIBUTED HOLDING ROW (SQ-24 F1): what a
-- conversation carries while it still belongs to no project — the cross-studio
-- chooser and the pending body and media that arrived with it. It sits outside
-- every policy below, so it is service-role only until P0-06b resolves the
-- choice and moves the content onto the chosen project's row. A nullable half
-- of the key rules out a primary key, so the key is a unique index with NULLS
-- NOT DISTINCT: one holding row per conversation, exactly as one row per
-- project. The two ALTERs converge a database that already carries an earlier
-- application of this migration; where it was never applied they are no-ops.
ALTER TABLE public.sms_conversation_context DROP CONSTRAINT IF EXISTS sms_conversation_context_pkey;
ALTER TABLE public.sms_conversation_context ALTER COLUMN project_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sms_conversation_context_key
  ON public.sms_conversation_context (conversation_id, project_id) NULLS NOT DISTINCT;

-- Composite FK again, with a column-list SET NULL (PG 15+): losing the party
-- must not try to NULL project_id, which is half the primary key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_conversation_context_party_project_fkey'
       AND conrelid = 'public.sms_conversation_context'::regclass
  ) THEN
    ALTER TABLE public.sms_conversation_context
      ADD CONSTRAINT sms_conversation_context_party_project_fkey
      FOREIGN KEY (party_id, project_id)
      REFERENCES public.project_parties (id, project_id) ON DELETE SET NULL (party_id);
  END IF;
END;
$$;

COMMENT ON TABLE public.sms_conversation_context IS
  'The Field Line (00639), contract S4: per-(conversation, project) SMS state — '
  'the menu, the awaiting_confirmation parking spot, the project pin and the '
  'pause. The transport row (sms_conversations) is shared by every studio on a '
  'handset and its cross-studio columns are column-revoked; this table is what '
  'studio members read. state_context carries the keys sms-inbound/pipeline.ts '
  'uses today — menu, menu_created_at, chooser, pending_body, pending_media, '
  'pending_message_id, pending_effect, pending_party_id and the project pin — '
  'so P0-06b can move the reads without a shape change. The state CHECK is '
  'copied verbatim from sms_conversations so the move is a copy, not a '
  'redesign. A row with project_id NULL is the unattributed holding row: state '
  'that belongs to no project yet, readable by service_role alone.';
COMMENT ON COLUMN public.sms_conversation_context.project_id IS
  'The studio''s project, or NULL for the unattributed holding row — the '
  'mid-chooser state a conversation carries before anyone owns it. No policy '
  'admits a NULL, so the parked reply and its media are service-role only until '
  'the choice resolves (SQ-24 F1).';
COMMENT ON COLUMN public.sms_conversation_context.paused_until IS
  'Outbound automation for this party on this project is held until this '
  'instant (a studio can mute a handset without revoking consent). Enforcement '
  'lands with P0-06b.';

DROP TRIGGER IF EXISTS set_updated_at_sms_conversation_context ON public.sms_conversation_context;
CREATE TRIGGER set_updated_at_sms_conversation_context
  BEFORE UPDATE ON public.sms_conversation_context
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sms_conversation_context_project
  ON public.sms_conversation_context (project_id, updated_at DESC);

-- ── The backfill is a CLASSIFIED MOVE, not a copy (SQ-24 F1) ───────────────
-- The legacy state_context on the transport row is shared by every studio on
-- the handset: mid-chooser it names both studios' projects and parks the
-- unresolved inbound body and its media (pipeline.ts:1414-1425 writes exactly
-- that while leaving the older active_project_id in place). Copying it wholesale
-- onto the pinned project's row — which authenticated studio members read — was
-- the leak the review reproduced. Each key is therefore placed by whom it
-- belongs to:
--   menu, menu_created_at, delivery_confirms_sent → the pinned project's row;
--     field-daily wrote them for THAT project's digest.
--   project_pin → the pinned project's row, and only when the pin names it.
--   chooser, pending_body, pending_media, pending_message_id, pending_effect,
--     pending_party_id → the pinned project's row ONLY when nothing foreign is
--     parked (the chooser names no other project and no pending_effect names
--     one); otherwise the unattributed holding row, which no studio reads.
-- The state column follows its evidence: a row that did not receive a chooser
-- cannot be awaiting_project_choice, and one that did not receive a
-- pending_effect cannot be awaiting_confirmation.
--
-- It is a FUNCTION rather than a bare statement so the rule can be exercised
-- against a fixture after the migration has been applied (the negative test at
-- supabase/tests/rls/sms_tables_test.sql case 13 and the review probe), and so
-- P0-06b and the later legacy-column drop can re-run exactly this rule.
CREATE OR REPLACE FUNCTION public.sms_backfill_conversation_context()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  k_project    CONSTANT TEXT[] := ARRAY['menu', 'menu_created_at', 'delivery_confirms_sent'];
  k_unresolved CONSTANT TEXT[] := ARRAY['chooser', 'pending_body', 'pending_media',
                                        'pending_message_id', 'pending_effect', 'pending_party_id'];
  c         RECORD;
  v_foreign BOOLEAN;
  v_ctx     JSONB;
  v_state   TEXT;
  v_party   UUID;
  v_written INTEGER := 0;
  v_rows    INTEGER;
  k         TEXT;
BEGIN
  FOR c IN SELECT id, active_project_id, party_id, state, state_context, updated_at
             FROM public.sms_conversations LOOP

    -- Is anything parked here that names a project other than the pinned one?
    v_foreign := false;
    IF jsonb_typeof(c.state_context -> 'chooser') = 'array' THEN
      SELECT EXISTS (
        SELECT 1
          FROM jsonb_array_elements(c.state_context -> 'chooser') AS e
         WHERE NULLIF(e ->> 'project_id', '') IS DISTINCT FROM c.active_project_id::text
      ) INTO v_foreign;
    END IF;
    IF NULLIF(c.state_context -> 'pending_effect' ->> '_project_id', '') IS NOT NULL
       AND (c.state_context -> 'pending_effect' ->> '_project_id')
             IS DISTINCT FROM c.active_project_id::text THEN
      v_foreign := true;
    END IF;

    IF c.active_project_id IS NOT NULL THEN
      v_ctx := '{}'::jsonb;
      FOREACH k IN ARRAY k_project LOOP
        IF c.state_context ? k THEN
          v_ctx := v_ctx || jsonb_build_object(k, c.state_context -> k);
        END IF;
      END LOOP;
      IF (c.state_context -> 'project_pin' ->> 'project_id') = c.active_project_id::text THEN
        v_ctx := v_ctx || jsonb_build_object('project_pin', c.state_context -> 'project_pin');
      END IF;
      IF NOT v_foreign THEN
        FOREACH k IN ARRAY k_unresolved LOOP
          IF c.state_context ? k THEN
            v_ctx := v_ctx || jsonb_build_object(k, c.state_context -> k);
          END IF;
        END LOOP;
      END IF;

      v_state := c.state;
      IF v_state = 'awaiting_project_choice' AND NOT (v_ctx ? 'chooser') THEN
        v_state := 'idle';
      ELSIF v_state = 'awaiting_confirmation' AND NOT (v_ctx ? 'pending_effect') THEN
        v_state := 'idle';
      END IF;

      -- party_id is carried only when that party really belongs to that project;
      -- the composite foreign key would refuse it otherwise, which is the point.
      v_party := NULL;
      SELECT pp.id INTO v_party
        FROM public.project_parties pp
       WHERE pp.id = c.party_id AND pp.project_id = c.active_project_id;

      INSERT INTO public.sms_conversation_context
        (conversation_id, project_id, party_id, state, state_context, updated_at)
      VALUES (c.id, c.active_project_id, v_party, v_state, v_ctx, c.updated_at)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_written := v_written + v_rows;
    END IF;

    -- Whatever is still unresolved goes to the holding row, so that P0-06b can
    -- finish the choice without the content having been readable by a studio
    -- that may turn out not to own it.
    IF (v_foreign OR c.active_project_id IS NULL)
       AND EXISTS (SELECT 1 FROM unnest(k_unresolved) AS u(k) WHERE c.state_context ? u.k) THEN
      INSERT INTO public.sms_conversation_context
        (conversation_id, project_id, party_id, state, state_context, updated_at)
      VALUES (c.id, NULL, NULL, c.state, c.state_context, c.updated_at)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_written := v_written + v_rows;
    END IF;
  END LOOP;

  RETURN v_written;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sms_backfill_conversation_context() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_backfill_conversation_context() TO service_role;

COMMENT ON FUNCTION public.sms_backfill_conversation_context() IS
  'The Field Line (00639), contract S4: move the legacy sms_conversations state '
  'onto per-project sms_conversation_context rows, classifying every key by the '
  'project it belongs to. A project-attributed row never receives another '
  'studio''s chooser entry, nor a parked reply whose project is still undecided '
  '(SQ-24 F1); that content lands on the holding row (project_id NULL), which '
  'no studio policy admits. Idempotent — ON CONFLICT DO NOTHING — and '
  'service-role only. Returns the number of rows written.';

DO $$ BEGIN PERFORM public.sms_backfill_conversation_context(); END $$;

ALTER TABLE public.sms_conversation_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL   ON public.sms_conversation_context FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sms_conversation_context TO authenticated;
GRANT ALL    ON public.sms_conversation_context TO service_role;

DROP POLICY IF EXISTS sms_conversation_context_team_select ON public.sms_conversation_context;
CREATE POLICY sms_conversation_context_team_select
  ON public.sms_conversation_context FOR SELECT
  TO authenticated
  USING (
    -- The holding row belongs to no project, so it is admitted by no studio.
    -- Stated rather than inferred from is_project_team_member(NULL) (SQ-24 F1).
    project_id IS NOT NULL
    AND (
      public.is_project_team_member(project_id)
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = sms_conversation_context.project_id
          AND (p.designer_id = (select auth.uid()) OR public.is_studio_comember(p.designer_id))
      )
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. sms_messages.owner_user_id — review ownership (contract S4)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sms_messages.owner_user_id IS
  'The Field Line (00639), contract S4: the studio member who owns this row''s '
  'review. NULL = unclaimed. Assignment semantics ship with the portal ticket '
  '(P0-07); the column and the sms_review_queue projection are pinned here so '
  'the consumers can be written against them.';

CREATE INDEX IF NOT EXISTS idx_sms_messages_review_owner
  ON public.sms_messages (owner_user_id, created_at DESC)
  WHERE needs_review AND reviewed_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. AUTHORITY REPAIR of the 00282 / 00584 attribution path
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 6a. Attribution is final ────────────────────────────────────────────────
-- The phone fallback may attribute a message that has NO project attribution;
-- it may never override an attributed row. Enforced here rather than in the
-- pipeline so no code path — service role included — can retarget a message to
-- another studio's project after the fact.
CREATE OR REPLACE FUNCTION public.sms_messages_guard_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.project_id IS NOT NULL AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION
      'sms_messages: message % is already attributed to project % — attribution is final',
      OLD.id, OLD.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_messages_guard_attribution() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sms_messages_guard_attribution() IS
  'BEFORE UPDATE on sms_messages (00639): once a message carries a project_id, '
  'nothing may change it. Closes the half of the 00282 phone fallback that is '
  'not a policy — a second studio on the same handset claiming an already '
  'attributed message.';

DROP TRIGGER IF EXISTS sms_messages_guard_attribution ON public.sms_messages;
CREATE TRIGGER sms_messages_guard_attribution
  BEFORE UPDATE ON public.sms_messages
  FOR EACH ROW EXECUTE FUNCTION public.sms_messages_guard_attribution();

-- ── 6b. sms_messages: project-scoped SELECT, no phone fallback ──────────────
-- Replaces 00282:143-164 (team) AND 00584:1056-1063 (studio). The third branch
-- of the 00282 policy joined the conversation's phone to project_parties across
-- ALL projects, so studio A read studio B's attributed messages whenever one
-- phone worked for both. Unattributed rows — the unresolved chooser text and
-- its media — now match no studio policy at all.
REVOKE ALL   ON public.sms_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sms_messages TO authenticated;
GRANT ALL    ON public.sms_messages TO service_role;

DROP POLICY IF EXISTS sms_messages_team_select   ON public.sms_messages;
DROP POLICY IF EXISTS sms_messages_studio_select ON public.sms_messages;
CREATE POLICY sms_messages_team_select
  ON public.sms_messages FOR SELECT
  TO authenticated
  USING (
    project_id IS NOT NULL
    AND (
      public.is_project_team_member(project_id)
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = sms_messages.project_id
          AND p.designer_id = (select auth.uid())
      )
    )
  );
CREATE POLICY sms_messages_studio_select
  ON public.sms_messages FOR SELECT
  TO authenticated
  USING (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = sms_messages.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

COMMENT ON TABLE public.sms_messages IS
  'Field Coordination: every SMS in/out. twilio_sid UNIQUE = inbound idempotency '
  'claim. needs_review drives the Desk triage queue; applied_effect records what '
  'apply_field_effect did. Service-role write only — and as of 00639 that is '
  'true at the PRIVILEGE level too, not merely for want of a write policy '
  '(contract S12). SELECT is project-scoped: a row with no project_id is '
  'service-role only, and attribution is final once set.';

-- ── 6c. sms_conversations: the transport row, minus its cross-studio columns ─
-- Replaces 00282:120-141 (team) AND 00584:1044-1053 (studio). One row serves
-- every studio that shares the handset. The row itself stays readable by the
-- team and studio of its ACTIVE project — 00584 item 24 established that and
-- its sweep test asserts it — but the phone fallback that reached every studio
-- on the number is gone, and the three columns that carry another studio's
-- business are revoked at the column level, because RLS cannot scope a column.
--   party_id      — the current best-guess party, which may be another studio's
--   state         — the shared ladder position
--   state_context — the cross-studio chooser, the pending body and its media
-- Studio members read public.sms_conversation_context for all three, per project.
REVOKE ALL ON public.sms_conversations FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, twilio_number, phone_e164, active_project_id,
              last_inbound_at, last_outbound_at, created_at, updated_at)
  ON public.sms_conversations TO authenticated;
GRANT ALL ON public.sms_conversations TO service_role;

DROP POLICY IF EXISTS sms_conversations_team_select   ON public.sms_conversations;
DROP POLICY IF EXISTS sms_conversations_studio_select ON public.sms_conversations;
CREATE POLICY sms_conversations_team_select
  ON public.sms_conversations FOR SELECT
  TO authenticated
  USING (
    public.is_project_team_member(active_project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = sms_conversations.active_project_id
        AND p.designer_id = (select auth.uid())
    )
  );
CREATE POLICY sms_conversations_studio_select
  ON public.sms_conversations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = sms_conversations.active_project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

COMMENT ON TABLE public.sms_conversations IS
  'Field Coordination: one SMS thread per (twilio_number, phone_e164) — the '
  'TRANSPORT row. state/state_context/active_project_id are legacy as of 00639: '
  'project-scoped state lives in sms_conversation_context, and party_id, state '
  'and state_context are revoked from authenticated at the column level because '
  'one row is shared by every studio on the handset. SELECT on the remaining '
  'columns is scoped to the ACTIVE project''s team or studio; the 00282 phone '
  'fallback that reached every studio with a party on the number is gone.';

-- ── 6d. review_sms_message: no phone-fallback attribution ───────────────────
-- Grafted from 00282:489-561, the only definition of this function on
-- origin/main (grep -ln "FUNCTION public.review_sms_message"
-- supabase/migrations/*.sql → 00282 alone). One delta: the conversation→party
-- phone fallback that resolved a project for an UNattributed message is
-- removed. An unattributed message has no tenant, so no studio may triage it —
-- the pipeline attributes first.
CREATE OR REPLACE FUNCTION public.review_sms_message(
  p_message_id UUID,
  p_action     TEXT,
  p_effect     JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_msg        public.sms_messages;
  v_project_id UUID;
  v_effect     JSONB;
  v_result     JSONB := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'review_sms_message requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_msg FROM public.sms_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_sms_message: message % not found', p_message_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 00639: the project is the message's own attribution, full stop. The 00282
  -- conversation→party phone fallback let any studio sharing the handset triage
  -- an unattributed message — including one that turned out to be another
  -- studio's. An unresolved message stays with the service role.
  v_project_id := v_msg.project_id;

  -- Team = the owning designer (projects.designer_id — not auto in
  -- project_team_members) OR a co-designer/staff member (is_project_team_member).
  IF v_project_id IS NULL OR NOT (
       public.is_project_team_member(v_project_id, auth.uid())
       OR EXISTS (
         SELECT 1 FROM public.projects p
         WHERE p.id = v_project_id AND p.designer_id = auth.uid()
       )
     ) THEN
    RAISE EXCEPTION 'not authorized to review message %', p_message_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action = 'apply' THEN
    -- The effect to apply: an explicit designer-edited p_effect wins, else the
    -- parsed intent parked on the message.
    v_effect := COALESCE(p_effect, v_msg.parsed_intent);
    IF v_effect IS NULL OR v_msg.party_id IS NULL THEN
      RAISE EXCEPTION 'review_sms_message: nothing to apply (no effect or party)'
        USING ERRCODE = 'check_violation';
    END IF;
    v_result := public.apply_field_effect(v_msg.party_id, v_effect, 'triage', p_message_id);
  ELSIF p_action <> 'dismiss' THEN
    RAISE EXCEPTION 'review_sms_message: unknown action %', p_action
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.sms_messages
     SET needs_review = false, reviewed_at = now(), reviewed_by = auth.uid()
   WHERE id = p_message_id;

  RETURN jsonb_build_object('action', p_action, 'result', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.review_sms_message(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_sms_message(UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.review_sms_message(UUID, TEXT, JSONB) IS
  'Field Coordination Desk triage: apply the parked/edited effect or dismiss a '
  'needs_review message. SECURITY DEFINER (it calls the authenticated-revoked '
  'apply_field_effect) but authorizes the caller via is_project_team_member '
  'first. 00639: the project comes from the message''s own attribution only — '
  'the 00282 phone fallback is gone, so an unattributed message cannot be '
  'triaged by any studio.';

-- ── 6e. sms_review_queue — the assigned-review projection ───────────────────
-- SECURITY INVOKER, so the repaired sms_messages policies are what scope it: a
-- studio member sees the needs_review rows of their own projects and nothing
-- else, with owner_user_id for "assigned to me".
CREATE OR REPLACE VIEW public.sms_review_queue
  WITH (security_invoker = true) AS
SELECT
  m.id,
  m.conversation_id,
  m.project_id,
  m.party_id,
  m.owner_user_id,
  m.direction,
  m.body,
  m.media,
  m.template_key,
  m.parsed_intent,
  m.confidence,
  m.matched_task_id,
  m.matched_coordination_item_id,
  m.created_at,
  pp.display_name AS party_display_name,
  pp.party_kind,
  pp.trade
FROM public.sms_messages m
LEFT JOIN public.project_parties pp ON pp.id = m.party_id
WHERE m.direction = 'inbound'
  AND m.needs_review
  AND m.reviewed_at IS NULL
  AND m.project_id IS NOT NULL;

COMMENT ON VIEW public.sms_review_queue IS
  'The Field Line (00639), contract S4: the Desk''s unreviewed inbound field '
  'texts, with review ownership. SECURITY INVOKER — the project-scoped '
  'sms_messages policies scope every row, so an unattributed message never '
  'appears and no studio sees another''s queue.';

REVOKE ALL   ON public.sms_review_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sms_review_queue TO authenticated, service_role;
