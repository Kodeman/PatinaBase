-- ═══════════════════════════════════════════════════════════════════════════
-- 00429 — The Plan Room: sheets, prints, issues, and who is holding what
--
-- A set of drawings is not a folder of PDFs. It is a NUMBERED SET whose every
-- sheet has a current revision, and a record of which revision each trade was
-- handed and when. Everything expensive about drawings goes wrong in the gap
-- between those two facts: the millwork sub prices Rev A while the studio is
-- three revisions on, the GC builds to a plan nobody told him was superseded,
-- and the only evidence of what anyone was actually given is a sent-items
-- folder. This migration is the spine that closes that gap.
--
--   · plan_sheets — one row per SHEET (A-101, E-2), carrying a current-revision
--     POINTER. The sheet is the durable identity; its content is whatever print
--     the pointer names. 00374's site_request_items shape exactly:
--     current_version_number/current_version_id, deferred back-FK, and an advance
--     path that locks the parent, increments, inserts the immutable child, and
--     moves the pointer in ONE transaction.
--   · plan_prints — the revisions. Immutable. Each one owns a project_documents
--     row, so a drawing is a first-class Folio file and the client's document
--     list needs to know nothing about plan rooms.
--   · plan_print_batches — one filing act. Carries the idempotency key and the
--     request hash, so a retried upload of a 40-sheet set files those 40 sheets
--     exactly once (00380:1344-1366 replay/mismatch semantics).
--   · plan_issues + plan_issue_prints — the ISSUE: a named, numbered, checksummed
--     freeze of "the set, as of now". The snapshots carry the sheet number, the
--     title, the rev letter and the sha — not just pointers — because an issue
--     must still read correctly when a sheet has been renamed or revised eleven
--     times since.
--   · plan_transmittals + plan_transmittal_tokens — the send record and the
--     no-auth link, cut to 00424's rail: sha256 at rest, raw token returned once,
--     revoke-then-mint, NULL on every resolve miss, token_hash column-granted to
--     nobody but service_role.
--
-- THE TRANSMITTAL HAS NO STATUS MACHINE, deliberately. Every other rail here
-- can be revised; a transmittal cannot, because it is a statement about the
-- past — this set went to this party on this date. Revoking the LINK is a
-- different act from unsending the record, and the record never hides.
--
-- WHAT THE HOLDER IS SHOWN. resolve_plan_transmittal answers with the sheets
-- they were given, the rev each was at, whether that is still current, and the
-- name of the issue that superseded theirs. It departs from 00424's no-project-
-- name rule ONCE, deliberately, and PART 8 says why.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 0 — The folio learns a new section
--
-- Every print is a project_documents row, and the folio's section_key CHECK is
-- a closed list (live head: 00380:25-35). Drop and re-add rather than ALTER —
-- a CHECK constraint has no in-place widening.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_documents
  DROP CONSTRAINT IF EXISTS project_documents_section_key_check;
ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_section_key_check
  CHECK (
    section_key IS NULL
    OR section_key IN (
      'brief', 'discovery', 'direction', 'proposal', 'project', 'install',
      'care', 'spec-book', 'plan-room'
    )
  );

-- file_plan_prints probes this column once per entry to refuse a file that is
-- already filed against some other document. Unindexed that is a sequential
-- scan of the largest folio table, sixty-four times in one call.
CREATE INDEX IF NOT EXISTS idx_project_documents_storage_path
  ON public.project_documents (storage_path);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — DDL
-- ═══════════════════════════════════════════════════════════════════════════

-- ── DELETION POSTURE, DECLARED ONCE FOR THE WHOLE RAIL ────────────────────
-- Every project_id on this rail is ON DELETE RESTRICT, and that is a decision,
-- not an oversight. A project that has had drawings filed against it cannot be
-- deleted by a cascade: the prints are immutable, the issues are numbered and
-- have been read aloud, and third parties are holding links into them. The same
-- posture issued spec books already take.
--
-- Nothing is lost by saying it out loud here. Even under CASCADE the delete was
-- already refused three layers down — plan_prints.sheet_id and
-- plan_issue_prints.* are RESTRICT, and the immutability triggers fire before
-- any cascade could reach them — so the CASCADEs this replaces were unreachable
-- decoration that read as "this all goes away with the project". It does not.
-- Tearing down a project with a plan room is a deliberate admin path that
-- retires the room first; there is no accidental route to it.
--
-- ── The sheet ─────────────────────────────────────────────────────────────
-- The sheet outlives every print on it. Its number and title are editable
-- (a set gets renumbered during coordination, and it should) right up until an
-- issue names it — after that the number is what somebody else's transmittal
-- says, and the guard freezes it.
CREATE TABLE IF NOT EXISTS public.plan_sheets (
  id                   uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  sheet_number         text NOT NULL
                         CHECK (length(btrim(sheet_number)) BETWEEN 1 AND 32),
  title                text NOT NULL
                         CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  discipline           text,
  state                text NOT NULL DEFAULT 'draft'
                         CHECK (state IN ('draft', 'shared')),
  current_print_number integer NOT NULL DEFAULT 0
                         CHECK (current_print_number >= 0),
  current_print_id     uuid,
  sort_order           integer NOT NULL DEFAULT 0,
  created_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- A shared sheet with nothing filed on it is an empty promise to the client.
  CHECK (state = 'draft' OR current_print_id IS NOT NULL)
);

-- Sheet numbers are case- and whitespace-insensitive in practice: 'a-101' and
-- 'A-101 ' are the same sheet to everyone who reads them, so they are the same
-- sheet here. The expression index is the only place that fact is enforced.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_plan_sheets_number
  ON public.plan_sheets (project_id, upper(btrim(sheet_number)));
CREATE INDEX IF NOT EXISTS idx_plan_sheets_project
  ON public.plan_sheets (project_id, sort_order, id);

COMMENT ON TABLE public.plan_sheets IS
  'One sheet of a project''s drawing set. Durable identity; its content is whatever print current_print_id names. Studio-writable through the plan-room RPCs only; a client sees a sheet solely once it is shared.';
COMMENT ON COLUMN public.plan_sheets.current_print_id IS
  'The revision this sheet currently IS. Moved only by file_plan_prints, under the app.plan_room_sheet_maintenance GUC; a hand-written pointer would leave the set claiming a revision nobody filed.';
COMMENT ON COLUMN public.plan_sheets.current_print_number IS
  'Denormalized from the pointer so the next revision number can be taken under a row lock without reading the prints table.';
COMMENT ON COLUMN public.plan_sheets.state IS
  'draft = studio-only. shared = the current print is in the client''s folio. state is a CLIENT gate and nothing more: the studio''s own people still reach every print through the folio''s team leg (00169), which is correct — a superseded revision is exactly what a project manager sometimes needs.';

-- ── The filing act ────────────────────────────────────────────────────────
-- A 40-sheet drop is one act, and a retried upload must not file it twice. The
-- batch is where the idempotency key and the request hash live, so the replay
-- test is a single indexed lookup rather than a diff of 40 rows.
CREATE TABLE IF NOT EXISTS public.plan_print_batches (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  idempotency_key     text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  request_hash        text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  source_filename     text,
  confirmed_sheet_ids uuid[] NOT NULL DEFAULT '{}',
  created_sheet_ids   uuid[] NOT NULL DEFAULT '{}',
  flipped_sheet_ids   uuid[] NOT NULL DEFAULT '{}',
  item_count          integer NOT NULL CHECK (item_count > 0),
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, idempotency_key)
);

COMMENT ON TABLE public.plan_print_batches IS
  'One filing act. Immutable. The idempotency key is unique per project, and request_hash is what distinguishes an honest retry from a key reused for a different set.';
COMMENT ON COLUMN public.plan_print_batches.confirmed_sheet_ids IS
  'Sheets the studio looked at during this filing and declared UNCHANGED. Nothing was written for them, which is exactly why the fact has to be recorded here — otherwise "we checked A-101 and it is still Rev B" leaves no trace at all.';
COMMENT ON COLUMN public.plan_print_batches.created_sheet_ids IS
  'Sheets this filing brought into existence. Recorded rather than re-derived: a replay must answer with what happened, and every reconstruction from live state ("its first print is in this batch") is a guess that a later repair could falsify.';
COMMENT ON COLUMN public.plan_print_batches.flipped_sheet_ids IS
  'Sheets whose previously-shared print left the client''s folio during this filing. Recorded for the same reason as created_sheet_ids: the flip is an event, and live state a week later cannot say whether it happened here.';
COMMENT ON COLUMN public.plan_print_batches.request_hash IS
  'sha256 of the canonical {sourceFilename, entries} payload. A replay with the same key and the same hash returns the original result; the same key with a different request is a bug in the caller and raises.';

-- ── The revision ──────────────────────────────────────────────────────────
-- Immutable, and RESTRICT on the way out in every direction. A print is what a
-- transmittal is about; it does not get deleted because somebody tidied up.
CREATE TABLE IF NOT EXISTS public.plan_prints (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  sheet_id            uuid NOT NULL REFERENCES public.plan_sheets(id) ON DELETE RESTRICT,
  batch_id            uuid NOT NULL REFERENCES public.plan_print_batches(id) ON DELETE RESTRICT,
  print_number        integer NOT NULL CHECK (print_number > 0),
  rev_letter          text NOT NULL CHECK (rev_letter ~ '^[A-Z]{1,2}$'),
  project_document_id uuid NOT NULL UNIQUE
                        REFERENCES public.project_documents(id) ON DELETE RESTRICT,
  sha256              text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  text_sha256         text
                        CHECK (text_sha256 IS NULL OR text_sha256 ~ '^[0-9a-f]{64}$'),
  page_index          integer CHECK (page_index IS NULL OR page_index >= 0),
  source              text NOT NULL DEFAULT 'upload'
                        CHECK (source IN ('upload', 'system')),
  source_filename     text,
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sheet_id, print_number)
);

CREATE INDEX IF NOT EXISTS idx_plan_prints_sheet
  ON public.plan_prints (sheet_id, print_number DESC);

COMMENT ON TABLE public.plan_prints IS
  'One revision of one sheet. Immutable. Owns exactly one project_documents row, which is what makes a drawing an ordinary Folio file to every reader that has never heard of a plan room.';
COMMENT ON COLUMN public.plan_prints.sha256 IS
  'Hash of the file bytes. This is what a transmittal''s snapshot carries and what a holder can check their copy against — the storage path is not evidence of anything, the bytes are.';
COMMENT ON COLUMN public.plan_prints.text_sha256 IS
  'Hash of the extracted text layer when the pipeline produced one. Two prints can differ in bytes (re-plot, different producer) while saying the identical thing; this is how that is told apart.';
COMMENT ON COLUMN public.plan_prints.project_document_id
  IS 'The Folio row. UNIQUE and RESTRICT: one file per print, and the file cannot be deleted out from under the record.';

-- ── The issue ─────────────────────────────────────────────────────────────
-- Born issued. There is no draft issue and no issue status: an issue is the act
-- of saying "this is the set", and a set that has not been declared is just the
-- live sheets, which anyone can already read.
CREATE TABLE IF NOT EXISTS public.plan_issues (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  issue_number    integer NOT NULL CHECK (issue_number > 0),
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  request_hash    text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  prior_issue_id  uuid REFERENCES public.plan_issues(id) ON DELETE RESTRICT,
  set_checksum    text NOT NULL CHECK (set_checksum ~ '^[0-9a-f]{64}$'),
  sheet_count     integer NOT NULL CHECK (sheet_count > 0),
  issued_at       timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, issue_number),
  UNIQUE (project_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_plan_issues_project
  ON public.plan_issues (project_id, issue_number DESC);

COMMENT ON TABLE public.plan_issues IS
  'A named, numbered freeze of the set. Immutable, born issued. prior_issue_id chains them, so "what changed since you last had drawings" is answerable without keeping a diff table.';
COMMENT ON COLUMN public.plan_issues.set_checksum IS
  'sha256 over the canonical [{sheetNumber, revLetter, sha256}] triples in sheet-number order. Two issues with the same checksum ARE the same set of drawings, whatever their names.';
COMMENT ON COLUMN public.plan_issues.prior_issue_id IS
  'The issue this one follows. RESTRICT because the chain is the only record of sequence once issue numbers have been read aloud in a meeting.';

-- ── The snapshot ──────────────────────────────────────────────────────────
-- The number, the title, the rev and the sha are COPIED, not joined. A sheet
-- renamed after issue must not silently rewrite what an old transmittal says
-- was sent — that is the whole failure mode this table exists to prevent.
CREATE TABLE IF NOT EXISTS public.plan_issue_prints (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  issue_id     uuid NOT NULL REFERENCES public.plan_issues(id) ON DELETE RESTRICT,
  sheet_id     uuid NOT NULL REFERENCES public.plan_sheets(id) ON DELETE RESTRICT,
  print_id     uuid NOT NULL REFERENCES public.plan_prints(id) ON DELETE RESTRICT,
  sheet_number text NOT NULL,
  sheet_title  text NOT NULL,
  rev_letter   text NOT NULL CHECK (rev_letter ~ '^[A-Z]{1,2}$'),
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_id, sheet_id),
  UNIQUE (issue_id, print_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_issue_prints_print
  ON public.plan_issue_prints (print_id);
CREATE INDEX IF NOT EXISTS idx_plan_issue_prints_sheet
  ON public.plan_issue_prints (sheet_id);

COMMENT ON TABLE public.plan_issue_prints IS
  'One sheet as it read at issue. Immutable snapshot: number, title, rev letter and file hash are copies, so an old issue survives every later rename and revision intact.';

-- ── The send ──────────────────────────────────────────────────────────────
-- No status column, on purpose. A transmittal is a statement about the past.
-- The LINK can be revoked; the record that the set went out cannot be, because
-- the question it answers — "what did we send Hollis, and when" — is exactly
-- the question that gets asked after something has gone wrong.
CREATE TABLE IF NOT EXISTS public.plan_transmittals (
  id                 uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  issue_id           uuid NOT NULL REFERENCES public.plan_issues(id) ON DELETE RESTRICT,
  party_id           uuid REFERENCES public.project_parties(id) ON DELETE RESTRICT,
  party_display_name text NOT NULL CHECK (length(btrim(party_display_name)) > 0),
  party_company      text,
  party_email        text,
  purpose            text NOT NULL
                       CHECK (purpose IN ('pricing', 'production', 'information', 'record')),
  message            text,
  sent_at            timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_transmittals_project
  ON public.plan_transmittals (project_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_transmittals_party
  ON public.plan_transmittals (party_id, sent_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_plan_transmittals_issue
  ON public.plan_transmittals (issue_id);

COMMENT ON TABLE public.plan_transmittals IS
  'One issue, handed to one party, for one purpose, on one date. Immutable and statusless: revoking the link is a different act from unsending the record, and the record never hides.';
COMMENT ON COLUMN public.plan_transmittals.party_display_name IS
  'Snapshotted at send. A later roster edit — a name corrected, a sub replaced — must not rewrite who the drawings actually went to.';
COMMENT ON COLUMN public.plan_transmittals.party_company IS
  'Snapshotted alongside the name, from the roster when there is one and from the free-text send otherwise. Stored as its own column rather than appended to the display name, so the resolver can project it without ever parsing a string apart.';
COMMENT ON COLUMN public.plan_transmittals.party_id IS
  'The roster row, when the send went to one. NULL for a free-text recipient — a set often goes to somebody who will never be on the project roster.';
COMMENT ON COLUMN public.plan_transmittals.purpose IS
  'Why they got it. This is what separates "for pricing" from "for record" when a sub later claims they were told to build it.';

-- ── The link ──────────────────────────────────────────────────────────────
-- 00424's token rail, unchanged in mechanics: sha256 at rest, raw token once,
-- revoke-then-mint, expiry. 90 days rather than an RFQ's 30 — a set issued for
-- production is looked at for the length of the build, not the length of a bid.
CREATE TABLE IF NOT EXISTS public.plan_transmittal_tokens (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  transmittal_id  uuid NOT NULL REFERENCES public.plan_transmittals(id) ON DELETE CASCADE,
  -- Denormalized from the transmittal for the same reason 00424:126-132
  -- denormalizes proposal_id: every read path this token serves keys on the
  -- project, and the token is the row a guest request arrives holding. RESTRICT
  -- per the deletion posture declared above the sheet table.
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  token_hash      text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'revoked')),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  first_opened_at timestamptz,
  view_count      integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  last_used_at    timestamptz,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_transmittal_tokens_active
  ON public.plan_transmittal_tokens (transmittal_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_plan_transmittal_tokens_project_active
  ON public.plan_transmittal_tokens (project_id)
  WHERE status = 'active';

COMMENT ON TABLE public.plan_transmittal_tokens IS
  'The no-auth link a transmittal travels on. Stores sha256(token) as hex only; the raw token exists once, at mint. Revoke-then-mint keeps at most one live link per send.';
COMMENT ON COLUMN public.plan_transmittal_tokens.token_hash IS
  'sha256(raw token) as hex — the guest lookup key. Column-granted to service_role alone: a database leak cannot reconstruct a working link, and a studio member has no use for it.';
COMMENT ON COLUMN public.plan_transmittal_tokens.first_opened_at IS
  'The first time anyone opened the link. The studio chasing a silent sub needs to know whether the drawings were ever looked at, and this is the only place that fact exists.';

-- ── The pointer''s back-FK ─────────────────────────────────────────────────
-- Added after plan_prints exists, and DEFERRABLE INITIALLY DEFERRED for the
-- 00374 reason (00374:181-189): the advance path inserts the print and moves
-- the pointer inside one transaction, and a non-deferred constraint would fire
-- against a half-written statement order.
ALTER TABLE public.plan_sheets
  DROP CONSTRAINT IF EXISTS plan_sheets_current_print_id_fkey;
ALTER TABLE public.plan_sheets
  ADD CONSTRAINT plan_sheets_current_print_id_fkey
  FOREIGN KEY (current_print_id) REFERENCES public.plan_prints(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

-- ── updated_at touch ──────────────────────────────────────────────────────
-- Both triggers are named to sort AFTER their guards: same-event triggers fire
-- in name order, and a guard that runs after the row has been stamped is a
-- guard that already lost.
DROP TRIGGER IF EXISTS set_updated_at_plan_sheets ON public.plan_sheets;
CREATE TRIGGER set_updated_at_plan_sheets
  BEFORE UPDATE ON public.plan_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_plan_transmittal_tokens ON public.plan_transmittal_tokens;
CREATE TRIGGER set_updated_at_plan_transmittal_tokens
  BEFORE UPDATE ON public.plan_transmittal_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — Guards
--
-- Two different mechanisms here, and the difference is not stylistic.
--
--   · guard_plan_sheets_row is SECURITY INVOKER, and its
--     `current_user = 'postgres' AND current_setting('app...') = OLD.id::text`
--     gate works BECAUSE of that: inside an invoker-side trigger current_user is
--     whoever is writing, so a logged-in session cannot pass the first half.
--     (Anyone can set a custom GUC; the GUC alone would gate nothing.)
--   · guard_project_documents_plan_print must be SECURITY DEFINER to see the
--     evidence it judges — and inside a definer function current_user IS the
--     owner, which makes that same test a tautology. So it does not use one. It
--     checks the WRITE instead of the WRITER: client_visible has exactly one
--     legal value, derivable from the sheet, and any write that agrees with the
--     derivation is fine no matter who makes it.
-- ═══════════════════════════════════════════════════════════════════════════

-- 00374's _site_request_immutable_row, for the five tables here that record
-- acts rather than state.
CREATE OR REPLACE FUNCTION public._plan_room_immutable_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME
    USING errcode = 'object_not_in_prerequisite_state';
END;
$$;

REVOKE ALL ON FUNCTION public._plan_room_immutable_row()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._plan_room_immutable_row() IS
  'Blanket rejector for the plan-room record tables: a print, a filing, an issue, a snapshot and a send are all statements about the past.';

DROP TRIGGER IF EXISTS a_immutable_plan_prints ON public.plan_prints;
CREATE TRIGGER a_immutable_plan_prints
  BEFORE UPDATE OR DELETE ON public.plan_prints
  FOR EACH ROW EXECUTE FUNCTION public._plan_room_immutable_row();

DROP TRIGGER IF EXISTS a_immutable_plan_print_batches ON public.plan_print_batches;
CREATE TRIGGER a_immutable_plan_print_batches
  BEFORE UPDATE OR DELETE ON public.plan_print_batches
  FOR EACH ROW EXECUTE FUNCTION public._plan_room_immutable_row();

DROP TRIGGER IF EXISTS a_immutable_plan_issues ON public.plan_issues;
CREATE TRIGGER a_immutable_plan_issues
  BEFORE UPDATE OR DELETE ON public.plan_issues
  FOR EACH ROW EXECUTE FUNCTION public._plan_room_immutable_row();

DROP TRIGGER IF EXISTS a_immutable_plan_issue_prints ON public.plan_issue_prints;
CREATE TRIGGER a_immutable_plan_issue_prints
  BEFORE UPDATE OR DELETE ON public.plan_issue_prints
  FOR EACH ROW EXECUTE FUNCTION public._plan_room_immutable_row();

DROP TRIGGER IF EXISTS a_immutable_plan_transmittals ON public.plan_transmittals;
CREATE TRIGGER a_immutable_plan_transmittals
  BEFORE UPDATE OR DELETE ON public.plan_transmittals
  FOR EACH ROW EXECUTE FUNCTION public._plan_room_immutable_row();

-- ── The sheet is half mutable ─────────────────────────────────────────────
-- Title, sort order and discipline are the studio's own housekeeping and stay
-- free. The number is free UNTIL an issue names it, after which it is what
-- somebody else's paperwork says. The pointer and the sharing state are not
-- editable at all outside the RPCs that maintain them, because a hand-moved
-- pointer leaves the set claiming a revision nobody filed, and a hand-flipped
-- state leaves the client's folio and the sheet's state disagreeing.
CREATE OR REPLACE FUNCTION public.guard_plan_sheets_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_maintenance boolean;
BEGIN
  v_maintenance := current_user = 'postgres'
    AND current_setting('app.plan_room_sheet_maintenance', true) = OLD.id::text;

  IF TG_OP = 'DELETE' THEN
    IF NOT v_maintenance THEN
      RAISE EXCEPTION 'a plan sheet is retired through delete_plan_sheet, not by hand'
        USING errcode = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'a plan sheet cannot change project or provenance'
      USING errcode = 'insufficient_privilege';
  END IF;

  IF NOT v_maintenance AND (
       NEW.state IS DISTINCT FROM OLD.state
       OR NEW.current_print_number IS DISTINCT FROM OLD.current_print_number
       OR NEW.current_print_id IS DISTINCT FROM OLD.current_print_id)
  THEN
    RAISE EXCEPTION 'the filed set and its sharing move only through the plan-room RPCs'
      USING errcode = 'insufficient_privilege';
  END IF;

  IF NEW.sheet_number IS DISTINCT FROM OLD.sheet_number
     AND EXISTS (SELECT 1 FROM public.plan_issue_prints ip WHERE ip.sheet_id = OLD.id)
  THEN
    RAISE EXCEPTION 'sheet % has been issued; its number is what the transmittals name', OLD.sheet_number
      USING errcode = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_plan_sheets_row()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.guard_plan_sheets_row() IS
  '00429: freezes a plan sheet''s project and provenance always, its pointer and sharing state outside the plan-room RPCs, and its number once an issue has named it. Title, sort order and discipline stay editable.';

DROP TRIGGER IF EXISTS a_guard_plan_sheets_row ON public.plan_sheets;
CREATE TRIGGER a_guard_plan_sheets_row
  BEFORE UPDATE OR DELETE ON public.plan_sheets
  FOR EACH ROW EXECUTE FUNCTION public.guard_plan_sheets_row();

-- ── A filed print is not an ordinary Folio file ───────────────────────────
-- Every print owns a project_documents row, and that row was, until this
-- guard, freely re-uploaded over, re-anchored, un-shared and deleted like any
-- other file. Each of those turns the set into a lie: the sheet claims Rev C,
-- the file behind it is somebody's site photo.
--
-- SECURITY DEFINER for the 00425:235-239 reason — plan_prints is RLS'd, and an
-- invoker-side probe that sees no rows FAILS OPEN on exactly the writer it
-- most needs to stop.
--
-- WHICH IS WHY client_visible IS GATED ON THE VALUE, NOT ON THE ACTOR. Inside a
-- definer function current_user is always the owner, so any
-- `current_user = 'postgres'` test here is a tautology, and a GUC anybody can
-- set is not a credential. The gate is instead a DERIVATION: a print's sharing
-- is a function of its sheet — visible exactly when the sheet is shared and the
-- print is the one the pointer names — so there is precisely one legal value at
-- any moment, and this guard computes it. A write that agrees is allowed
-- whoever makes it; a write that disagrees is refused whoever makes it,
-- including service_role and including a future policy change that widens who
-- can reach the row at all. The RPCs pass because they move the SHEET first and
-- normalize the folio afterwards, so by the time they touch client_visible the
-- derivation already says what they are about to write.
CREATE OR REPLACE FUNCTION public.guard_project_documents_plan_print()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_print_id uuid;
  v_derived  boolean;
BEGIN
  -- The UNIQUE on plan_prints.project_document_id carries this probe.
  SELECT pp.id, (s.state = 'shared' AND s.current_print_id = pp.id)
    INTO v_print_id, v_derived
  FROM public.plan_prints pp
  JOIN public.plan_sheets s ON s.id = pp.sheet_id
  WHERE pp.project_document_id = OLD.id;

  -- An ordinary Folio file. Nothing here is any of this guard's business.
  IF v_print_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'this file is plan print %, and a filed print cannot be deleted', v_print_id
      USING errcode = 'check_violation';
  END IF;

  -- category and doc_type are frozen with the rest: the plan-room contract pins
  -- category='drawing', and every reader that filters the folio for drawings
  -- would silently lose the sheet if either moved.
  IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
     OR NEW.designer_client_id IS DISTINCT FROM OLD.designer_client_id
     OR NEW.version_of IS DISTINCT FROM OLD.version_of
     OR NEW.anchor_kind IS DISTINCT FROM OLD.anchor_kind
     OR NEW.section_key IS DISTINCT FROM OLD.section_key
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.doc_type IS DISTINCT FROM OLD.doc_type
     OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION
      'this file is plan print %, so its file, its anchor, its kind and its readiness are fixed', v_print_id
      USING errcode = 'check_violation';
  END IF;

  IF NEW.client_visible IS DISTINCT FROM OLD.client_visible
     AND NEW.client_visible IS DISTINCT FROM v_derived
  THEN
    RAISE EXCEPTION
      'a plan print is shared by sharing its sheet, not by flipping the file'
      USING errcode = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_documents_plan_print()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.guard_project_documents_plan_print() IS
  '00429: freezes a Folio row once a plan print owns it — no re-file, no re-anchor, no re-kind, no delete. client_visible may only be written to the value derived from the sheet (shared AND current), so the sharing of a drawing is never a fact anybody can assert by hand.';

-- Named to sort after guard_project_documents_paper_scan_trg (00425) and
-- before set_project_documents_updated_at (00169): same-event triggers fire in
-- name order, and both guards must refuse before the row is stamped.
DROP TRIGGER IF EXISTS guard_project_documents_plan_print_trg ON public.project_documents;
CREATE TRIGGER guard_project_documents_plan_print_trg
  BEFORE UPDATE OR DELETE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_documents_plan_print();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — Private helpers
--
-- EXECUTE revoked from everyone, service_role included. The only callers are
-- the definer RPCs below, which run as the owner.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drawing revisions are lettered, not numbered, everywhere in the trade. A..Z
-- then AA..ZZ; past ZZ a sheet has been revised 702 times and something else is
-- wrong.
CREATE OR REPLACE FUNCTION public._plan_room_rev_letter(p_n integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_n < 1 OR p_n > 702 THEN
    RAISE EXCEPTION 'revision letters run A..ZZ; % is outside that range', p_n
      USING errcode = 'check_violation';
  END IF;
  IF p_n <= 26 THEN
    RETURN chr(64 + p_n);
  END IF;
  RETURN chr(65 + ((p_n - 27) / 26)) || chr(65 + ((p_n - 27) % 26));
END;
$$;

REVOKE ALL ON FUNCTION public._plan_room_rev_letter(integer)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._plan_room_rev_letter(integer) IS
  'Print number to trade revision letter: 1→A, 26→Z, 27→AA, 702→ZZ. Raises outside that range.';

-- RFC-8259 JSON with recursively sorted object keys, stable array order, and no
-- insignificant whitespace. Body verbatim from _spec_book_canonical_json
-- (00380:1077-1096) so that a hash computed here and a hash computed by any
-- other Patina surface over the same value agree byte for byte.
CREATE OR REPLACE FUNCTION public._plan_room_canonical_json(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT CASE jsonb_typeof(p_value)
    WHEN 'object' THEN COALESCE((
      SELECT '{' || string_agg(to_jsonb(e.key)::text || ':' || public._plan_room_canonical_json(e.value), ',' ORDER BY e.key) || '}'
      FROM jsonb_each(p_value) AS e
    ), '{}')
    WHEN 'array' THEN COALESCE((
      SELECT '[' || string_agg(public._plan_room_canonical_json(e.value), ',' ORDER BY e.ordinality) || ']'
      FROM jsonb_array_elements(p_value) WITH ORDINALITY AS e(value, ordinality)
    ), '[]')
    WHEN 'number' THEN trim_scale((p_value #>> '{}')::numeric)::text
    ELSE p_value::text
  END;
$$;

REVOKE ALL ON FUNCTION public._plan_room_canonical_json(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._plan_room_canonical_json(jsonb) IS
  'Canonical compact JSON (sorted keys, ordinal arrays, trimmed number scale). The bytes every plan-room hash is taken over.';

-- The one place a print document's sharing is written. It carries no privilege
-- and no ceremony — the folio guard accepts this write only because the caller
-- has already moved the sheet, which is what makes the value it writes the
-- derived one. Calling this out of order simply fails.
CREATE OR REPLACE FUNCTION public._plan_room_set_doc_visibility(
  p_doc_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.project_documents SET client_visible = p_visible WHERE id = p_doc_id;
END;
$$;

REVOKE ALL ON FUNCTION public._plan_room_set_doc_visibility(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._plan_room_set_doc_visibility(uuid, boolean) IS
  'Writes one plan-print folio row''s client_visible. Private helper; the folio guard, not this function, is what decides the write is legal.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — Filing
--
-- file_plan_prints is the whole write path for drawings. One call files a
-- 40-sheet drop: new sheets, revisions of existing sheets, and confirmations
-- that a sheet is unchanged, in one transaction, with one idempotency key.
--
-- THE PROJECT ROW IS THE PLAN-ROOM MUTEX. Two concurrent filings against the
-- same project would otherwise race on sheet-number uniqueness and on the
-- per-sheet print counter, and the second would fail with a raw 23505 halfway
-- through a 40-sheet upload. Locking the project first serializes them; the
-- per-sheet FOR UPDATE inside the loop is belt and braces, taken in normalized
-- sheet-number order so any future caller that skips the project lock still
-- takes the sheets in one direction.
--
-- EVERYTHING IS VALIDATED BEFORE ANYTHING IS WRITTEN. A partial filing is worse
-- than a refused one: half a set on screen with no marker of what is missing is
-- how a studio issues drawings it does not have.
-- ═══════════════════════════════════════════════════════════════════════════

-- p_source_filename trails p_entries so it can carry a DEFAULT: a drop assembled
-- in the portal often has no single originating file, and Postgres will not let
-- a defaulted parameter sit ahead of a required one. Supabase RPC calls are by
-- name, so the order is a schema detail, not a caller-facing one.
DROP FUNCTION IF EXISTS public.file_plan_prints(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.file_plan_prints(
  p_project_id uuid,
  p_idempotency_key text,
  p_entries jsonb,
  p_source_filename text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_key          text := btrim(COALESCE(p_idempotency_key, ''));
  v_source       text := NULLIF(btrim(COALESCE(p_source_filename, '')), '');
  v_hash         text;
  v_batch        public.plan_print_batches%ROWTYPE;
  v_entry        jsonb;
  v_ord          integer;
  v_kind         text;
  v_print        jsonb;
  v_number       text;
  v_norm         text;
  v_title        text;
  v_discipline   text;
  v_sheet_id     uuid;
  v_sheet        public.plan_sheets%ROWTYPE;
  v_path         text;
  v_plan         jsonb := '[]'::jsonb;
  v_seen_sheets  uuid[] := ARRAY[]::uuid[];
  v_seen_numbers text[] := ARRAY[]::text[];
  v_seen_paths   text[] := ARRAY[]::text[];
  v_confirmed    uuid[] := ARRAY[]::uuid[];
  v_created      uuid[] := ARRAY[]::uuid[];
  v_sort         integer;
  v_item         jsonb;
  v_n            integer;
  v_rev          text;
  v_doc_id       uuid;
  v_prior_doc_id uuid;
  v_print_id     uuid;
  v_flipped      uuid[] := ARRAY[]::uuid[];
  v_results      jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'filing drawings requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'plan room for project % not found or access denied', p_project_id
      USING errcode = 'insufficient_privilege';
  END IF;
  IF v_key = '' THEN
    RAISE EXCEPTION 'a filing needs an idempotency key'
      USING errcode = 'check_violation';
  END IF;
  IF jsonb_typeof(p_entries) <> 'array'
     OR jsonb_array_length(p_entries) < 1
     OR jsonb_array_length(p_entries) > 64
  THEN
    RAISE EXCEPTION 'a filing carries between 1 and 64 entries'
      USING errcode = 'check_violation';
  END IF;

  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;

  -- The filename is part of the request, so it is part of the hash: the same
  -- entries arriving under a different source file is a different filing, and a
  -- caller that reused the key for it wants to hear about it.
  v_hash := encode(extensions.digest(public._plan_room_canonical_json(
    jsonb_build_object('sourceFilename', to_jsonb(v_source), 'entries', p_entries)
  ), 'sha256'), 'hex');

  SELECT * INTO v_batch FROM public.plan_print_batches
  WHERE project_id = p_project_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_batch.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'idempotency key was reused with a different request'
        USING errcode = 'unique_violation';
    END IF;

    -- A replay answers with the act as it landed, read straight off the record
    -- of it. Nothing here is re-derived from live state: what a filing DID is a
    -- fact about that moment, and a later repair or reshare must not be able to
    -- change the answer a retry gets.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'sheetId', s.id,
             'sheetNumber', s.sheet_number,
             'isNewSheet', s.id = ANY (v_batch.created_sheet_ids),
             'printId', pp.id,
             'printNumber', pp.print_number,
             'revLetter', pp.rev_letter,
             'projectDocumentId', pp.project_document_id
           ) ORDER BY upper(btrim(s.sheet_number)), pp.print_number), '[]'::jsonb)
      INTO v_results
      FROM public.plan_prints pp
      JOIN public.plan_sheets s ON s.id = pp.sheet_id
     WHERE pp.batch_id = v_batch.id;

    RETURN jsonb_build_object(
      'batchId', v_batch.id,
      'idempotent', true,
      'prints', v_results,
      'flippedSheetIds', to_jsonb(v_batch.flipped_sheet_ids)
    );
  END IF;

  -- ── Validate every entry ────────────────────────────────────────────────
  FOR v_entry, v_ord IN
    SELECT e.value, e.ordinality
    FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS e(value, ordinality)
  LOOP
    v_number := NULL;
    v_title := NULL;
    v_discipline := NULL;
    v_sheet_id := NULL;

    IF jsonb_typeof(v_entry) <> 'object' THEN
      RAISE EXCEPTION 'entry %: each entry must be an object', v_ord
        USING errcode = 'check_violation';
    END IF;
    v_kind := v_entry->>'kind';
    IF v_kind IS NULL OR v_kind NOT IN ('new_sheet', 'revision', 'confirm_current') THEN
      RAISE EXCEPTION 'entry %: kind must be new_sheet, revision or confirm_current', v_ord
        USING errcode = 'check_violation';
    END IF;

    IF v_kind IN ('revision', 'confirm_current') THEN
      IF COALESCE(v_entry->>'sheet_id', '')
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'entry %: a sheet_id is required', v_ord
          USING errcode = 'check_violation';
      END IF;
      v_sheet_id := (v_entry->>'sheet_id')::uuid;
      SELECT * INTO v_sheet FROM public.plan_sheets
      WHERE id = v_sheet_id AND project_id = p_project_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'entry %: sheet % is not in this plan room', v_ord, v_sheet_id
          USING errcode = 'check_violation';
      END IF;
      IF v_sheet_id = ANY (v_seen_sheets) THEN
        RAISE EXCEPTION 'entry %: sheet % is named twice in one filing', v_ord, v_sheet.sheet_number
          USING errcode = 'check_violation';
      END IF;
      v_seen_sheets := array_append(v_seen_sheets, v_sheet_id);
      v_number := v_sheet.sheet_number;
    END IF;

    IF v_kind = 'confirm_current' THEN
      IF v_sheet.current_print_id IS NULL THEN
        RAISE EXCEPTION 'entry %: sheet % has no filed print to confirm', v_ord, v_sheet.sheet_number
          USING errcode = 'check_violation';
      END IF;
      v_confirmed := array_append(v_confirmed, v_sheet_id);
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'ord', v_ord, 'kind', v_kind,
        'sheetId', v_sheet_id, 'sheetNumber', v_number));
      CONTINUE;
    END IF;

    -- ── The print, for both new_sheet and revision ────────────────────────
    v_print := v_entry->'print';
    IF v_print IS NULL OR jsonb_typeof(v_print) <> 'object' THEN
      RAISE EXCEPTION 'entry %: a print is required', v_ord
        USING errcode = 'check_violation';
    END IF;

    v_path := btrim(COALESCE(v_print->>'storage_path', ''));
    IF v_path = '' THEN
      RAISE EXCEPTION 'entry %: a print needs a storage_path', v_ord
        USING errcode = 'check_violation';
    END IF;
    -- A drawing filed from another project's prefix is either a mistake or an
    -- attempt to mount someone else's file into this folio.
    IF split_part(v_path, '/', 1) <> p_project_id::text THEN
      RAISE EXCEPTION 'entry %: a plan file must live under its own project''s storage prefix', v_ord
        USING errcode = 'check_violation';
    END IF;
    IF v_path = ANY (v_seen_paths) THEN
      RAISE EXCEPTION 'entry %: the same file is filed twice in one batch', v_ord
        USING errcode = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'project-documents' AND o.name = v_path
    ) THEN
      RAISE EXCEPTION 'entry %: nothing has been uploaded at %', v_ord, v_path
        USING errcode = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_documents d WHERE d.storage_path = v_path
    ) THEN
      RAISE EXCEPTION 'entry %: % is already filed against a document', v_ord, v_path
        USING errcode = 'check_violation';
    END IF;
    IF COALESCE(v_print->>'sha256', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'entry %: a print needs a lowercase hex sha256', v_ord
        USING errcode = 'check_violation';
    END IF;
    IF v_print->>'text_sha256' IS NOT NULL
       AND v_print->>'text_sha256' !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'entry %: text_sha256 must be a lowercase hex sha256', v_ord
        USING errcode = 'check_violation';
    END IF;
    IF v_print ? 'page_index' AND v_print->'page_index' <> 'null'::jsonb
       AND (jsonb_typeof(v_print->'page_index') <> 'number'
            OR (v_print->>'page_index')::numeric < 0) THEN
      RAISE EXCEPTION 'entry %: page_index must be a non-negative number', v_ord
        USING errcode = 'check_violation';
    END IF;
    IF v_print ? 'size_bytes' AND v_print->'size_bytes' <> 'null'::jsonb
       AND (jsonb_typeof(v_print->'size_bytes') <> 'number'
            OR (v_print->>'size_bytes')::numeric < 0) THEN
      RAISE EXCEPTION 'entry %: size_bytes must be a non-negative number', v_ord
        USING errcode = 'check_violation';
    END IF;
    v_seen_paths := array_append(v_seen_paths, v_path);

    IF v_kind = 'new_sheet' THEN
      v_number := btrim(COALESCE(v_entry#>>'{sheet,number}', ''));
      IF length(v_number) NOT BETWEEN 1 AND 32 THEN
        RAISE EXCEPTION 'entry %: a new sheet needs a number of 1 to 32 characters', v_ord
          USING errcode = 'check_violation';
      END IF;
      v_title := btrim(COALESCE(v_entry#>>'{sheet,title}', ''));
      IF length(v_title) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'entry %: a new sheet needs a title of 1 to 200 characters', v_ord
          USING errcode = 'check_violation';
      END IF;
      v_discipline := NULLIF(btrim(COALESCE(v_entry#>>'{sheet,discipline}', '')), '');
      v_norm := upper(v_number);
      IF v_norm = ANY (v_seen_numbers) THEN
        RAISE EXCEPTION 'entry %: sheet number % appears twice in one filing', v_ord, v_number
          USING errcode = 'check_violation';
      END IF;
      -- Caught here rather than left to uniq_plan_sheets_number, so the caller
      -- reads a sentence instead of a 23505 on an expression index.
      IF EXISTS (
        SELECT 1 FROM public.plan_sheets s
        WHERE s.project_id = p_project_id AND upper(btrim(s.sheet_number)) = v_norm
      ) THEN
        RAISE EXCEPTION 'entry %: sheet % already exists — file it as a revision', v_ord, v_number
          USING errcode = 'check_violation';
      END IF;
      v_seen_numbers := array_append(v_seen_numbers, v_norm);
      -- Minted here so the plan can name the sheet before it exists.
      v_sheet_id := extensions.gen_random_uuid();
      v_created := array_append(v_created, v_sheet_id);
    ELSIF v_sheet.state = 'shared' AND v_sheet.current_print_id IS NOT NULL THEN
      -- Decided here, under the project mutex, so the batch can RECORD the flip
      -- rather than have a later reader guess at it. The write loop below is
      -- driven off this same array, so the record and the act cannot diverge.
      v_flipped := array_append(v_flipped, v_sheet_id);
    END IF;

    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
      'ord', v_ord, 'kind', v_kind,
      'sheetId', v_sheet_id, 'sheetNumber', v_number,
      'sheetTitle', v_title, 'discipline', v_discipline,
      'print', v_print));
  END LOOP;

  -- ── Write ───────────────────────────────────────────────────────────────
  INSERT INTO public.plan_print_batches (
    project_id, idempotency_key, request_hash, source_filename,
    confirmed_sheet_ids, created_sheet_ids, flipped_sheet_ids, item_count, created_by
  ) VALUES (
    p_project_id, v_key, v_hash, v_source,
    v_confirmed, v_created, v_flipped, jsonb_array_length(p_entries), auth.uid()
  ) RETURNING * INTO v_batch;

  SELECT COALESCE(max(sort_order), -1) + 1 INTO v_sort
  FROM public.plan_sheets WHERE project_id = p_project_id;

  INSERT INTO public.plan_sheets (
    id, project_id, sheet_number, title, discipline, state, sort_order, created_by
  )
  SELECT (e.value->>'sheetId')::uuid, p_project_id, e.value->>'sheetNumber',
         e.value->>'sheetTitle', e.value->>'discipline', 'draft',
         v_sort + (row_number() OVER (ORDER BY (e.value->>'ord')::integer))::integer - 1,
         auth.uid()
  FROM jsonb_array_elements(v_plan) AS e(value)
  WHERE e.value->>'kind' = 'new_sheet';

  FOR v_item IN
    SELECT e.value
    FROM jsonb_array_elements(v_plan) AS e(value)
    WHERE e.value ? 'print'
    ORDER BY upper(btrim(e.value->>'sheetNumber')), (e.value->>'ord')::integer
  LOOP
    SELECT * INTO v_sheet FROM public.plan_sheets
    WHERE id = (v_item->>'sheetId')::uuid FOR UPDATE;

    v_n := v_sheet.current_print_number + 1;
    v_rev := public._plan_room_rev_letter(v_n);
    v_print := v_item->'print';

    v_prior_doc_id := NULL;
    IF v_sheet.current_print_id IS NOT NULL THEN
      SELECT pp.project_document_id INTO v_prior_doc_id
      FROM public.plan_prints pp WHERE pp.id = v_sheet.current_print_id;
    END IF;

    INSERT INTO public.project_documents (
      project_id, title, doc_type, category, storage_path, size_bytes, status,
      anchor_kind, section_key, client_visible, uploaded_by
    ) VALUES (
      p_project_id,
      v_sheet.sheet_number || ' · Rev ' || v_rev || ' — ' || v_sheet.title,
      COALESCE(NULLIF(btrim(COALESCE(v_print->>'doc_type', '')), ''), 'pdf'),
      'drawing',
      v_print->>'storage_path',
      CASE WHEN jsonb_typeof(v_print->'size_bytes') = 'number'
           THEN (v_print->>'size_bytes')::bigint END,
      'ready', 'section', 'plan-room',
      -- The print lands already sharing exactly as its sheet shares. A shared
      -- sheet whose newest revision is invisible is the failure this replaces.
      v_sheet.state = 'shared',
      auth.uid()
    ) RETURNING id INTO v_doc_id;
    -- The folio TITLE is baked here and never rewritten. A sheet renamed after
    -- filing leaves its old prints titled with the old number, which is honest
    -- for issued revisions and merely stale for unissued ones. Repairing the
    -- stale ones is a fast-follow RPC; v1 deliberately does not rewrite history
    -- as a side effect of a rename.

    INSERT INTO public.plan_prints (
      sheet_id, batch_id, print_number, rev_letter, project_document_id,
      sha256, text_sha256, page_index, source_filename, created_by
    ) VALUES (
      v_sheet.id, v_batch.id, v_n, v_rev, v_doc_id,
      v_print->>'sha256',
      NULLIF(btrim(COALESCE(v_print->>'text_sha256', '')), ''),
      CASE WHEN jsonb_typeof(v_print->'page_index') = 'number'
           THEN (v_print->>'page_index')::integer END,
      COALESCE(NULLIF(btrim(COALESCE(v_print->>'source_filename', '')), ''), v_source),
      auth.uid()
    ) RETURNING id INTO v_print_id;

    PERFORM set_config('app.plan_room_sheet_maintenance', v_sheet.id::text, true);
    UPDATE public.plan_sheets
       SET current_print_number = v_n, current_print_id = v_print_id
     WHERE id = v_sheet.id;
    PERFORM set_config('app.plan_room_sheet_maintenance', '', true);

    -- Superseding is a two-sided act on a shared sheet: the new print appears
    -- in the client's folio and the old one leaves it, in the same call. The
    -- pointer moved above, so the folio guard's derivation already says this
    -- doc is no longer visible — which is why the write is accepted.
    IF v_sheet.id = ANY (v_flipped) AND v_prior_doc_id IS NOT NULL THEN
      PERFORM public._plan_room_set_doc_visibility(v_prior_doc_id, false);
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'sheetId', v_sheet.id,
      'sheetNumber', v_sheet.sheet_number,
      'isNewSheet', v_item->>'kind' = 'new_sheet',
      'printId', v_print_id,
      'printNumber', v_n,
      'revLetter', v_rev,
      'projectDocumentId', v_doc_id));
  END LOOP;

  RETURN jsonb_build_object(
    'batchId', v_batch.id,
    'idempotent', false,
    'prints', v_results,
    'flippedSheetIds', to_jsonb(v_flipped)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.file_plan_prints(uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.file_plan_prints(uuid, text, jsonb, text)
  TO authenticated;

COMMENT ON FUNCTION public.file_plan_prints(uuid, text, jsonb, text) IS
  'Files one drawing drop: new sheets, revisions, and unchanged-sheet confirmations, atomically, under the project row as a mutex. Validates every entry before writing any. Idempotent on (project, key) with a matching request hash over {sourceFilename, entries}; a reused key with a different request raises unique_violation. A replay answers from the recorded batch, never from live state.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — Sharing and retiring a sheet
-- ═══════════════════════════════════════════════════════════════════════════

-- Sharing is stated on the SHEET, never on a file. The folio rows are then
-- normalized to agree with it: the current print visible, every superseded
-- print not. Setting the same state again re-normalizes on purpose — it is the
-- repair path for a folio that has drifted, and a no-op is the wrong answer to
-- 'make this right'.
CREATE OR REPLACE FUNCTION public.set_plan_sheet_state(
  p_sheet_id uuid,
  p_state text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_sheet public.plan_sheets%ROWTYPE;
  v_doc   record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sharing a plan sheet requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF p_state IS NULL OR p_state NOT IN ('draft', 'shared') THEN
    RAISE EXCEPTION 'a plan sheet is either draft or shared'
      USING errcode = 'check_violation';
  END IF;

  -- Authority BEFORE the lock, and one answer for both misses. Locking first
  -- would let an unauthorized caller hold a foreign row for the length of the
  -- refusal, and answering 'not found' separately from 'access denied' would
  -- turn this RPC into an existence oracle for other studios' sheets (00424's
  -- non-enumeration posture).
  IF NOT EXISTS (
    SELECT 1 FROM public.plan_sheets s
    JOIN public.projects p ON p.id = s.project_id
    WHERE s.id = p_sheet_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'plan sheet % not found or access denied', p_sheet_id
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sheet FROM public.plan_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan sheet % not found or access denied', p_sheet_id
      USING errcode = 'insufficient_privilege';
  END IF;
  IF p_state = 'shared' AND v_sheet.current_print_id IS NULL THEN
    RAISE EXCEPTION 'a sheet with no filed print cannot be shared'
      USING errcode = 'check_violation';
  END IF;

  PERFORM set_config('app.plan_room_sheet_maintenance', v_sheet.id::text, true);
  UPDATE public.plan_sheets SET state = p_state WHERE id = v_sheet.id
  RETURNING * INTO v_sheet;
  PERFORM set_config('app.plan_room_sheet_maintenance', '', true);

  FOR v_doc IN
    SELECT pp.project_document_id AS doc_id,
           (pp.id = v_sheet.current_print_id) AS is_current
    FROM public.plan_prints pp
    WHERE pp.sheet_id = v_sheet.id
  LOOP
    PERFORM public._plan_room_set_doc_visibility(
      v_doc.doc_id, p_state = 'shared' AND v_doc.is_current);
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_sheet.id,
    'projectId', v_sheet.project_id,
    'sheetNumber', v_sheet.sheet_number,
    'title', v_sheet.title,
    'discipline', v_sheet.discipline,
    'state', v_sheet.state,
    'currentPrintNumber', v_sheet.current_print_number,
    'currentPrintId', v_sheet.current_print_id,
    'sortOrder', v_sheet.sort_order,
    'updatedAt', v_sheet.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_plan_sheet_state(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_plan_sheet_state(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.set_plan_sheet_state(uuid, text) IS
  'Shares or unshares one plan sheet and normalizes its folio rows to match — current print visible when shared, every superseded print hidden always. Re-stating the same state re-normalizes, deliberately.';

-- A sheet with prints is evidence; the RESTRICT on plan_prints.sheet_id would
-- refuse this anyway, but a foreign-key error is not an explanation.
CREATE OR REPLACE FUNCTION public.delete_plan_sheet(p_sheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_sheet public.plan_sheets%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'retiring a plan sheet requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;

  -- Authority before the lock, one answer for both misses — see the same note
  -- on set_plan_sheet_state.
  IF NOT EXISTS (
    SELECT 1 FROM public.plan_sheets s
    JOIN public.projects p ON p.id = s.project_id
    WHERE s.id = p_sheet_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'plan sheet % not found or access denied', p_sheet_id
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sheet FROM public.plan_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan sheet % not found or access denied', p_sheet_id
      USING errcode = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.plan_prints pp WHERE pp.sheet_id = v_sheet.id) THEN
    RAISE EXCEPTION 'sheet % has filed prints and cannot be deleted', v_sheet.sheet_number
      USING errcode = 'check_violation';
  END IF;

  PERFORM set_config('app.plan_room_sheet_maintenance', v_sheet.id::text, true);
  DELETE FROM public.plan_sheets WHERE id = v_sheet.id;
  PERFORM set_config('app.plan_room_sheet_maintenance', '', true);

  RETURN jsonb_build_object('deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_plan_sheet(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_plan_sheet(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_plan_sheet(uuid) IS
  'Retires an empty plan sheet. Refuses once anything has been filed on it — a sheet with prints is what transmittals point at.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — Issuing the set
-- ═══════════════════════════════════════════════════════════════════════════

-- What the studio sees before it commits: the set as it stands, the checksum
-- that set would carry, and what has moved since the last issue. Drift is
-- keyed on the PRINT, not the file hash — a re-plot of identical content is
-- still a new revision the holder has not seen.
--
-- p_sheet_ids takes the same intersection and the same refusals as
-- create_plan_issue, so a partial issue can be previewed honestly: a preview
-- that could only ever describe the full set would print a checksum the studio
-- is not about to commit to.
DROP FUNCTION IF EXISTS public.preview_plan_issue(uuid);

CREATE OR REPLACE FUNCTION public.preview_plan_issue(
  p_project_id uuid,
  p_sheet_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_sheets   jsonb;
  v_checksum text;
  v_prior    jsonb;
  v_added    jsonb;
  v_changed  jsonb;
  v_removed  jsonb;
  v_unchanged jsonb;
  v_missing  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'previewing an issue requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'plan room for project % not found or access denied', p_project_id
      USING errcode = 'insufficient_privilege';
  END IF;

  IF p_sheet_ids IS NOT NULL THEN
    SELECT string_agg(x::text, ', ') INTO v_missing
    FROM unnest(p_sheet_ids) AS x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.plan_sheets s
      WHERE s.id = x AND s.project_id = p_project_id AND s.current_print_id IS NOT NULL
    );
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION
        'these sheets are not in this plan room, or have nothing filed on them: %', v_missing
        USING errcode = 'check_violation';
    END IF;
  END IF;

  WITH cur AS (
    SELECT s.id AS sheet_id,
           btrim(s.sheet_number) AS number,
           upper(btrim(s.sheet_number)) AS norm,
           s.title,
           pp.id AS print_id,
           pp.rev_letter,
           pp.sha256
    FROM public.plan_sheets s
    JOIN public.plan_prints pp ON pp.id = s.current_print_id
    WHERE s.project_id = p_project_id
      AND (p_sheet_ids IS NULL OR s.id = ANY (p_sheet_ids))
  ),
  prior AS (
    SELECT i.id, i.name, i.issue_number, i.issued_at
    FROM public.plan_issues i
    WHERE i.project_id = p_project_id
    ORDER BY i.issue_number DESC
    LIMIT 1
  ),
  snap AS (
    SELECT ip.sheet_id, ip.print_id
    FROM public.plan_issue_prints ip
    JOIN prior ON prior.id = ip.issue_id
  ),
  drift AS (
    SELECT COALESCE(c.sheet_id, s.sheet_id) AS sheet_id,
           CASE
             WHEN s.sheet_id IS NULL THEN 'added'
             WHEN c.sheet_id IS NULL THEN 'removed'
             WHEN s.print_id IS DISTINCT FROM c.print_id THEN 'changed'
             ELSE 'unchanged'
           END AS kind
    FROM cur c
    FULL OUTER JOIN snap s ON s.sheet_id = c.sheet_id
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'sheetId', sheet_id, 'sheetNumber', number, 'sheetTitle', title,
       'revLetter', rev_letter, 'sha256', sha256, 'printId', print_id
     ) ORDER BY norm), '[]'::jsonb) FROM cur),
    (SELECT encode(extensions.digest(public._plan_room_canonical_json(
       COALESCE(jsonb_agg(jsonb_build_object(
         'sheetNumber', number, 'revLetter', rev_letter, 'sha256', sha256
       ) ORDER BY norm), '[]'::jsonb)), 'sha256'), 'hex') FROM cur),
    (SELECT jsonb_build_object('id', p.id, 'name', p.name,
       'issueNumber', p.issue_number, 'issuedAt', p.issued_at) FROM prior p),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'added'),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'changed'),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'removed'),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'unchanged')
  INTO v_sheets, v_checksum, v_prior, v_added, v_changed, v_removed, v_unchanged;

  RETURN jsonb_build_object(
    'sheets', v_sheets,
    'checksumPreview', v_checksum,
    'priorIssue', v_prior,
    'drift', jsonb_build_object(
      'added', v_added, 'changed', v_changed,
      'removed', v_removed, 'unchanged', v_unchanged)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_plan_issue(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_plan_issue(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.preview_plan_issue(uuid, uuid[]) IS
  'The set as it stands, the checksum an issue over it would carry, and the drift against the last issue. NULL p_sheet_ids previews everything with a filed print; a named list takes the same intersection and the same refusals as create_plan_issue. Read-only; nothing here reserves an issue number.';

-- Issue numbers are taken under the project lock, exactly as print numbers are,
-- and for the same reason: two studio members pressing Issue at once must not
-- both become Issue 3.
CREATE OR REPLACE FUNCTION public.create_plan_issue(
  p_project_id uuid,
  p_name text,
  p_idempotency_key text,
  p_sheet_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_name       text := btrim(COALESCE(p_name, ''));
  v_key        text := btrim(COALESCE(p_idempotency_key, ''));
  v_hash       text;
  v_issue      public.plan_issues%ROWTYPE;
  v_prior      public.plan_issues%ROWTYPE;
  v_ids        uuid[];
  v_checksum   text;
  v_missing    text;
  v_idempotent boolean := false;
  v_sheets     jsonb;
  v_added      jsonb;
  v_changed    jsonb;
  v_removed    jsonb;
  v_unchanged  jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'issuing a set requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'plan room for project % not found or access denied', p_project_id
      USING errcode = 'insufficient_privilege';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'an issue needs a name of 1 to 120 characters'
      USING errcode = 'check_violation';
  END IF;
  IF v_key = '' THEN
    RAISE EXCEPTION 'an issue needs an idempotency key'
      USING errcode = 'check_violation';
  END IF;

  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;

  v_hash := encode(extensions.digest(public._plan_room_canonical_json(
    jsonb_build_object(
      'name', v_name,
      -- DISTINCT, because the write path dedupes: [A, A, B] and [A, B] resolve
      -- to the same set, so they must not be two different requests under one
      -- idempotency key.
      'sheetIds', CASE
        WHEN p_sheet_ids IS NULL THEN 'null'::jsonb
        ELSE (SELECT COALESCE(
                jsonb_agg(DISTINCT to_jsonb(x::text) ORDER BY to_jsonb(x::text)),
                '[]'::jsonb)
              FROM unnest(p_sheet_ids) AS x)
      END
    )), 'sha256'), 'hex');

  SELECT * INTO v_issue FROM public.plan_issues
  WHERE project_id = p_project_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_issue.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'idempotency key was reused with a different request'
        USING errcode = 'unique_violation';
    END IF;
    v_idempotent := true;
  ELSE
    SELECT COALESCE(array_agg(s.id ORDER BY upper(btrim(s.sheet_number))), ARRAY[]::uuid[])
      INTO v_ids
      FROM public.plan_sheets s
     WHERE s.project_id = p_project_id
       AND s.current_print_id IS NOT NULL
       AND (p_sheet_ids IS NULL OR s.id = ANY (p_sheet_ids));

    IF p_sheet_ids IS NOT NULL THEN
      SELECT string_agg(x::text, ', ') INTO v_missing
      FROM unnest(p_sheet_ids) AS x
      WHERE NOT EXISTS (
        SELECT 1 FROM public.plan_sheets s
        WHERE s.id = x AND s.project_id = p_project_id AND s.current_print_id IS NOT NULL
      );
      IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION
          'these sheets are not in this plan room, or have nothing filed on them: %', v_missing
          USING errcode = 'check_violation';
      END IF;
    END IF;

    IF cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'an issue needs at least one sheet with a filed print'
        USING errcode = 'check_violation';
    END IF;

    SELECT encode(extensions.digest(public._plan_room_canonical_json(
             COALESCE(jsonb_agg(jsonb_build_object(
               'sheetNumber', btrim(s.sheet_number),
               'revLetter', pp.rev_letter,
               'sha256', pp.sha256
             ) ORDER BY upper(btrim(s.sheet_number))), '[]'::jsonb)), 'sha256'), 'hex')
      INTO v_checksum
      FROM public.plan_sheets s
      JOIN public.plan_prints pp ON pp.id = s.current_print_id
     WHERE s.id = ANY (v_ids);

    SELECT * INTO v_prior FROM public.plan_issues
    WHERE project_id = p_project_id
    ORDER BY issue_number DESC
    LIMIT 1;

    INSERT INTO public.plan_issues (
      project_id, issue_number, name, idempotency_key, request_hash,
      prior_issue_id, set_checksum, sheet_count, created_by
    ) VALUES (
      p_project_id, COALESCE(v_prior.issue_number, 0) + 1, v_name, v_key, v_hash,
      v_prior.id, v_checksum, cardinality(v_ids), auth.uid()
    ) RETURNING * INTO v_issue;

    INSERT INTO public.plan_issue_prints (
      issue_id, sheet_id, print_id, sheet_number, sheet_title, rev_letter, sha256
    )
    SELECT v_issue.id, s.id, pp.id, btrim(s.sheet_number), s.title, pp.rev_letter, pp.sha256
    FROM public.plan_sheets s
    JOIN public.plan_prints pp ON pp.id = s.current_print_id
    WHERE s.id = ANY (v_ids);
  END IF;

  -- One DTO tail for both arms: the drift is derived from the issue's own
  -- snapshots against its prior's, so a replay answers exactly what the first
  -- call answered.
  WITH mine AS (
    SELECT ip.sheet_id, ip.print_id, ip.sheet_number, ip.sheet_title,
           ip.rev_letter, ip.sha256
    FROM public.plan_issue_prints ip WHERE ip.issue_id = v_issue.id
  ),
  theirs AS (
    SELECT ip.sheet_id, ip.print_id
    FROM public.plan_issue_prints ip WHERE ip.issue_id = v_issue.prior_issue_id
  ),
  drift AS (
    SELECT COALESCE(m.sheet_id, t.sheet_id) AS sheet_id,
           CASE
             WHEN t.sheet_id IS NULL THEN 'added'
             WHEN m.sheet_id IS NULL THEN 'removed'
             WHEN t.print_id IS DISTINCT FROM m.print_id THEN 'changed'
             ELSE 'unchanged'
           END AS kind
    FROM mine m
    FULL OUTER JOIN theirs t ON t.sheet_id = m.sheet_id
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'sheetId', sheet_id, 'printId', print_id, 'sheetNumber', sheet_number,
       'sheetTitle', sheet_title, 'revLetter', rev_letter, 'sha256', sha256
     ) ORDER BY upper(sheet_number)), '[]'::jsonb) FROM mine),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'added'),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'changed'),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'removed'),
    (SELECT COALESCE(jsonb_agg(sheet_id), '[]'::jsonb) FROM drift WHERE kind = 'unchanged')
  INTO v_sheets, v_added, v_changed, v_removed, v_unchanged;

  RETURN jsonb_build_object(
    'issue', jsonb_build_object(
      'id', v_issue.id,
      'projectId', v_issue.project_id,
      'issueNumber', v_issue.issue_number,
      'name', v_issue.name,
      'issuedAt', v_issue.issued_at,
      'setChecksum', v_issue.set_checksum,
      'sheetCount', v_issue.sheet_count,
      'priorIssueId', v_issue.prior_issue_id),
    'idempotent', v_idempotent,
    'sheets', v_sheets,
    'drift', jsonb_build_object(
      'added', v_added, 'changed', v_changed,
      'removed', v_removed, 'unchanged', v_unchanged)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_plan_issue(uuid, text, text, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_plan_issue(uuid, text, text, uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.create_plan_issue(uuid, text, text, uuid[]) IS
  'Freezes the set as a numbered issue and snapshots every included sheet. NULL p_sheet_ids issues everything with a filed print; a named list must be entirely in the project and entirely filed. Idempotent on (project, key) with a matching request hash.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — Sending it
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_plan_transmittal(
  p_issue_id uuid,
  p_purpose text,
  p_party_id uuid DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_recipient_company text DEFAULT NULL,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_issue       public.plan_issues%ROWTYPE;
  v_party       public.project_parties%ROWTYPE;
  v_name        text := NULLIF(btrim(COALESCE(p_recipient_name, '')), '');
  v_company     text := NULLIF(btrim(COALESCE(p_recipient_company, '')), '');
  v_transmittal public.plan_transmittals%ROWTYPE;
  v_token       text;
  v_token_row   public.plan_transmittal_tokens%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sending an issue requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;

  -- One answer for a missing issue and for another studio's issue: a caller
  -- must not be able to tell the two apart.
  SELECT * INTO v_issue FROM public.plan_issues WHERE id = p_issue_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = v_issue.project_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'plan issue % not found or access denied', p_issue_id
      USING errcode = 'insufficient_privilege';
  END IF;
  IF p_purpose IS NULL
     OR p_purpose NOT IN ('pricing', 'production', 'information', 'record') THEN
    RAISE EXCEPTION 'a transmittal is for pricing, production, information or record'
      USING errcode = 'check_violation';
  END IF;
  IF (p_party_id IS NULL) = (v_name IS NULL) THEN
    RAISE EXCEPTION 'name exactly one recipient: a roster party or a free-text name'
      USING errcode = 'check_violation';
  END IF;

  IF p_party_id IS NOT NULL THEN
    SELECT * INTO v_party FROM public.project_parties WHERE id = p_party_id;
    IF NOT FOUND OR v_party.project_id IS DISTINCT FROM v_issue.project_id THEN
      RAISE EXCEPTION 'party % does not belong to project %', p_party_id, v_issue.project_id
        USING errcode = 'check_violation';
    END IF;
    -- Snapshotted from the roster: what the record says must be what the roster
    -- said at send, not what it says after somebody corrects a spelling.
    v_name := v_party.display_name;
    v_company := v_party.company_name;
  END IF;

  INSERT INTO public.plan_transmittals (
    project_id, issue_id, party_id, party_display_name, party_company,
    party_email, purpose, message, created_by
  ) VALUES (
    v_issue.project_id, v_issue.id, p_party_id, v_name, v_company,
    CASE WHEN p_party_id IS NOT NULL THEN v_party.email END,
    p_purpose, NULLIF(btrim(COALESCE(p_message, '')), ''), auth.uid()
  ) RETURNING * INTO v_transmittal;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.plan_transmittal_tokens (
    transmittal_id, project_id, token_hash, created_by
  ) VALUES (
    v_transmittal.id, v_issue.project_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid()
  ) RETURNING * INTO v_token_row;

  RETURN jsonb_build_object(
    'transmittal', jsonb_build_object(
      'id', v_transmittal.id,
      'projectId', v_transmittal.project_id,
      'issueId', v_transmittal.issue_id,
      'issueName', v_issue.name,
      'partyId', v_transmittal.party_id,
      'partyDisplayName', v_transmittal.party_display_name,
      'partyCompany', v_transmittal.party_company,
      'partyEmail', v_transmittal.party_email,
      'purpose', v_transmittal.purpose,
      'message', v_transmittal.message,
      'sentAt', v_transmittal.sent_at,
      'expiresAt', v_token_row.expires_at),
    -- Returned ONCE. Only sha256(token) survives this call.
    'token', v_token
  );
END;
$$;

-- authenticated only. An earlier draft also granted service_role, which was
-- unreachable: the first thing this function does is require auth.uid(), and a
-- service_role session has none. A grant that can never succeed reads as a
-- supported seam and is worse than no grant at all.
REVOKE ALL ON FUNCTION public.create_plan_transmittal(uuid, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_plan_transmittal(uuid, text, uuid, text, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_plan_transmittal(uuid, text, uuid, text, text, text) IS
  'Records that one issue went to one recipient for one purpose, snapshotting their name, company and email, and mints the link. Returns the raw token ONCE. Exactly one of p_party_id / p_recipient_name.';

-- Revoke-then-mint: the hash at rest means an existing token's raw value can
-- never be re-emitted, so 'send the link again' is 'kill the old one, cut a
-- fresh one' (00424:444-446). The transmittal itself does not move.
CREATE OR REPLACE FUNCTION public.reissue_plan_transmittal_link(p_transmittal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_transmittal public.plan_transmittals%ROWTYPE;
  v_token       text;
  v_token_row   public.plan_transmittal_tokens%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'reissuing a link requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_transmittal FROM public.plan_transmittals WHERE id = p_transmittal_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = v_transmittal.project_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'transmittal % not found or access denied', p_transmittal_id
      USING errcode = 'insufficient_privilege';
  END IF;

  UPDATE public.plan_transmittal_tokens SET status = 'revoked'
  WHERE transmittal_id = p_transmittal_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.plan_transmittal_tokens (
    transmittal_id, project_id, token_hash, created_by
  ) VALUES (
    p_transmittal_id, v_transmittal.project_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid()
  ) RETURNING * INTO v_token_row;

  RETURN jsonb_build_object(
    'transmittalId', p_transmittal_id,
    'token', v_token,
    'expiresAt', v_token_row.expires_at
  );
END;
$$;

-- authenticated only, for the same reason as create_plan_transmittal: this
-- function requires auth.uid(), so a service_role grant could never be used.
REVOKE ALL ON FUNCTION public.reissue_plan_transmittal_link(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reissue_plan_transmittal_link(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.reissue_plan_transmittal_link(uuid) IS
  'Revokes every live link on a transmittal and mints a fresh one, returning the raw token ONCE. The send record is untouched — reissuing a link is not resending the drawings.';

CREATE OR REPLACE FUNCTION public.revoke_plan_transmittal_link(p_transmittal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_transmittal public.plan_transmittals%ROWTYPE;
  v_count       integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'revoking a link requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_transmittal FROM public.plan_transmittals WHERE id = p_transmittal_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = v_transmittal.project_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'transmittal % not found or access denied', p_transmittal_id
      USING errcode = 'insufficient_privilege';
  END IF;

  WITH killed AS (
    UPDATE public.plan_transmittal_tokens SET status = 'revoked'
    WHERE transmittal_id = p_transmittal_id AND status = 'active'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM killed;

  RETURN jsonb_build_object('revokedCount', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_plan_transmittal_link(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_plan_transmittal_link(uuid) TO authenticated;

COMMENT ON FUNCTION public.revoke_plan_transmittal_link(uuid) IS
  'Kills every live link on a transmittal. The send record stays — the drawings were still sent.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — The only guest read path
--
-- 00424's resolve grammar: validate by hash + status + expiry, answer with a
-- narrow DTO, and return NULL on ANY miss — unknown, revoked and expired are
-- indistinguishable from outside.
--
-- WHAT TRAVELS, AND WHY THE PROJECT NAME DOES. 00424 deliberately withholds the
-- project's name from a sub, because a studio names projects after the people
-- who live in them. This function projects it anyway, and the departure is
-- intentional: a set of construction drawings has the project name in the title
-- block of every sheet the holder is about to download. Withholding it from the
-- page while handing it over in the PDF would protect nothing and would leave
-- the holder unable to tell which of four jobs these drawings are for. What
-- still does not travel: storage paths, any uuid but the print's, the client's
-- identity, and anything at all about the other people holding this set.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_plan_transmittal(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash         text;
  v_token        public.plan_transmittal_tokens%ROWTYPE;
  v_transmittal  public.plan_transmittals%ROWTYPE;
  v_issue        public.plan_issues%ROWTYPE;
  v_project      public.projects%ROWTYPE;
  v_latest       public.plan_issues%ROWTYPE;
  v_studio_name  text;
  v_is_latest    boolean;
  v_all_current  boolean;
  v_sheets       jsonb;
BEGIN
  -- Shape gate first: a caller with no plausible token never reaches a lookup.
  IF p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  v_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_token FROM public.plan_transmittal_tokens t
  WHERE t.token_hash = v_hash
    AND t.status = 'active'
    AND t.expires_at > now()
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;  -- unknown / revoked / expired → dead link, no leak
  END IF;

  SELECT * INTO v_transmittal FROM public.plan_transmittals
  WHERE id = v_token.transmittal_id;
  IF v_transmittal.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_issue FROM public.plan_issues WHERE id = v_transmittal.issue_id;
  IF v_issue.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_issue.project_id;
  IF v_project.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- The studio's own name for the header — the designer's active design_studio
  -- org, else their display name (00424:586-597).
  SELECT o.name INTO v_studio_name
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
   WHERE om.user_id = v_project.designer_id
     AND om.status = 'active'
     AND o.type = 'design_studio'
   ORDER BY om.created_at
   LIMIT 1;
  IF v_studio_name IS NULL THEN
    SELECT COALESCE(pr.full_name, 'your designer') INTO v_studio_name
      FROM public.profiles pr WHERE pr.id = v_project.designer_id;
  END IF;

  SELECT * INTO v_latest FROM public.plan_issues
  WHERE project_id = v_issue.project_id
  ORDER BY issue_number DESC
  LIMIT 1;
  v_is_latest := v_latest.id = v_issue.id;

  -- 'Current' means both things at once: no later issue, AND every sheet in
  -- this one still standing at the revision it was snapshotted at.
  v_all_current := NOT EXISTS (
    SELECT 1
    FROM public.plan_issue_prints ip
    JOIN public.plan_sheets s ON s.id = ip.sheet_id
    WHERE ip.issue_id = v_issue.id
      AND s.current_print_id IS DISTINCT FROM ip.print_id
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'printId', ip.print_id,
           'number', ip.sheet_number,
           'title', ip.sheet_title,
           'revLetter', ip.rev_letter,
           'revDate', pp.created_at::date,
           'sha256', ip.sha256,
           'sizeBytes', d.size_bytes,
           'isCurrent', s.current_print_id IS NOT DISTINCT FROM ip.print_id
         ) ORDER BY upper(ip.sheet_number)), '[]'::jsonb)
    INTO v_sheets
    FROM public.plan_issue_prints ip
    JOIN public.plan_prints pp ON pp.id = ip.print_id
    JOIN public.plan_sheets s ON s.id = ip.sheet_id
    LEFT JOIN public.project_documents d ON d.id = pp.project_document_id
   WHERE ip.issue_id = v_issue.id;

  -- On success only. A miss must leave no trace that a lookup happened.
  UPDATE public.plan_transmittal_tokens SET
    view_count = view_count + 1,
    first_opened_at = COALESCE(first_opened_at, now()),
    last_used_at = now()
  WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'studioName', v_studio_name,
    'recipientName', v_transmittal.party_display_name,
    'recipientCompany', v_transmittal.party_company,
    'purpose', v_transmittal.purpose,
    'sentAt', v_transmittal.sent_at,
    'projectLabel', v_project.name,
    'issueName', v_issue.name,
    'issueDate', v_issue.issued_at::date,
    'setSha256', v_issue.set_checksum,
    'isCurrentSet', v_is_latest AND v_all_current,
    'supersededByName', CASE WHEN NOT v_is_latest THEN v_latest.name END,
    'supersededAt', CASE WHEN NOT v_is_latest THEN v_latest.issued_at END,
    'sheets', v_sheets
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_plan_transmittal(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_plan_transmittal(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_plan_transmittal(text) IS
  'The only guest read path for a transmittal link. Validates by hash + status + expiry, bumps the view counters on success only, and returns a narrow DTO: the studio, the recipient, the issue, and the sheets with their rev letters and hashes. NULL on any miss. Never a storage path, never a uuid but the print''s, never anything about another holder.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 9 — Who is holding what
--
-- The question the plan room exists to answer. One row per recipient — their
-- LATEST send, because that is what they are working from — with each sheet
-- they hold, the rev they hold, the rev that is current, and the count of the
-- gap. A free-text recipient is grouped by their folded name, because 'Hollis
-- Millwork' typed twice is one person.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_plan_room_holdings(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'reading holdings requires an authenticated designer'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND public.is_design_studio_comember(p.designer_id)
  ) THEN
    RAISE EXCEPTION 'plan room for project % not found or access denied', p_project_id
      USING errcode = 'insufficient_privilege';
  END IF;

  WITH latest AS (
    SELECT DISTINCT ON (COALESCE(t.party_id::text, lower(btrim(t.party_display_name))))
           t.*
    FROM public.plan_transmittals t
    WHERE t.project_id = p_project_id
    ORDER BY COALESCE(t.party_id::text, lower(btrim(t.party_display_name))),
             t.sent_at DESC, t.id DESC
  ),
  holds AS (
    SELECT l.id AS transmittal_id,
           ip.sheet_id,
           ip.sheet_number,
           ip.rev_letter AS held_rev,
           cp.rev_letter AS current_rev,
           (s.current_print_id IS DISTINCT FROM ip.print_id) AS behind
    FROM latest l
    JOIN public.plan_issue_prints ip ON ip.issue_id = l.issue_id
    JOIN public.plan_sheets s ON s.id = ip.sheet_id
    LEFT JOIN public.plan_prints cp ON cp.id = s.current_print_id
  ),
  -- Revoke-then-mint means at most one live token per send; expiry is REPORTED
  -- rather than filtered, so a studio can see that a link died of old age.
  link AS (
    SELECT DISTINCT ON (tk.transmittal_id) tk.*
    FROM public.plan_transmittal_tokens tk
    JOIN latest l ON l.id = tk.transmittal_id
    WHERE tk.status = 'active'
    ORDER BY tk.transmittal_id, tk.created_at DESC
  )
  SELECT jsonb_build_object('parties', COALESCE(jsonb_agg(jsonb_build_object(
           'partyId', l.party_id,
           'partyDisplayName', l.party_display_name,
           'partyCompany', l.party_company,
           'purpose', l.purpose,
           'sentAt', l.sent_at,
           'issueId', l.issue_id,
           'issueName', i.name,
           'activeLink', CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_object(
             'status', k.status,
             'expiresAt', k.expires_at,
             'firstOpenedAt', k.first_opened_at,
             'viewCount', k.view_count) END,
           'holds', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'sheetId', h.sheet_id,
               'sheetNumber', h.sheet_number,
               'heldRev', h.held_rev,
               'currentRev', h.current_rev,
               'behind', h.behind
             ) ORDER BY upper(h.sheet_number))
             FROM holds h WHERE h.transmittal_id = l.id), '[]'::jsonb),
           'behindCount', (
             SELECT count(*) FROM holds h
             WHERE h.transmittal_id = l.id AND h.behind)
         ) ORDER BY l.sent_at DESC, l.id DESC), '[]'::jsonb))
    INTO v_out
    FROM latest l
    JOIN public.plan_issues i ON i.id = l.issue_id
    LEFT JOIN link k ON k.transmittal_id = l.id;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.get_plan_room_holdings(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_plan_room_holdings(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_plan_room_holdings(uuid) IS
  'One row per recipient of this project''s drawings — their latest send, the sheets it carried, the rev they hold against the rev that is current, and how far behind they are.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 10 — RLS and ACLs
--
-- Every table is STUDIO-ONLY for writes, keyed through the owning project's
-- designer with public.is_design_studio_comember. Two tables also carry a
-- narrow CLIENT read: a client sees SHARED sheets and, on each, ONLY the print
-- the pointer currently names.
--
-- 'shared' is a CLIENT gate and only that. The folio's own team leg (00169's
-- `Team can view their project documents`, keyed on is_project_team_member and
-- ungated by client_visible) still shows every plan print to anyone on the
-- project team — which is right: a superseded revision is exactly what a
-- project manager sometimes needs to pull. What client_visible controls, and
-- what these policies control, is what the CLIENT is shown.
--
-- Post-flip (2026-05-30) ACLs are explicit; nothing relies on creation
-- defaults. REVOKE precedes GRANT so the file is idempotent against a database
-- that saw an earlier, wider version of it.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.plan_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_print_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_issue_prints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_transmittals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_transmittal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_sheets_studio_rw ON public.plan_sheets;
CREATE POLICY plan_sheets_studio_rw ON public.plan_sheets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = plan_sheets.project_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = plan_sheets.project_id
                        AND public.is_design_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS plan_sheets_client_read ON public.plan_sheets;
CREATE POLICY plan_sheets_client_read ON public.plan_sheets
  FOR SELECT TO authenticated
  USING (
    plan_sheets.state = 'shared'
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = plan_sheets.project_id AND p.client_id = auth.uid())
  );

DROP POLICY IF EXISTS plan_print_batches_studio_rw ON public.plan_print_batches;
CREATE POLICY plan_print_batches_studio_rw ON public.plan_print_batches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = plan_print_batches.project_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = plan_print_batches.project_id
                        AND public.is_design_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS plan_prints_studio_rw ON public.plan_prints;
CREATE POLICY plan_prints_studio_rw ON public.plan_prints
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plan_sheets s
                 JOIN public.projects p ON p.id = s.project_id
                 WHERE s.id = plan_prints.sheet_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plan_sheets s
                      JOIN public.projects p ON p.id = s.project_id
                      WHERE s.id = plan_prints.sheet_id
                        AND public.is_design_studio_comember(p.designer_id)));

-- A client sees the CURRENT print of a SHARED sheet, and nothing else. The
-- pointer equality is the whole policy: history is the studio's.
DROP POLICY IF EXISTS plan_prints_client_read ON public.plan_prints;
CREATE POLICY plan_prints_client_read ON public.plan_prints
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plan_sheets s
                 JOIN public.projects p ON p.id = s.project_id
                 WHERE s.id = plan_prints.sheet_id
                   AND s.state = 'shared'
                   AND s.current_print_id = plan_prints.id
                   AND p.client_id = auth.uid()));

DROP POLICY IF EXISTS plan_issues_studio_rw ON public.plan_issues;
CREATE POLICY plan_issues_studio_rw ON public.plan_issues
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = plan_issues.project_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = plan_issues.project_id
                        AND public.is_design_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS plan_issue_prints_studio_rw ON public.plan_issue_prints;
CREATE POLICY plan_issue_prints_studio_rw ON public.plan_issue_prints
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plan_issues i
                 JOIN public.projects p ON p.id = i.project_id
                 WHERE i.id = plan_issue_prints.issue_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plan_issues i
                      JOIN public.projects p ON p.id = i.project_id
                      WHERE i.id = plan_issue_prints.issue_id
                        AND public.is_design_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS plan_transmittals_studio_rw ON public.plan_transmittals;
CREATE POLICY plan_transmittals_studio_rw ON public.plan_transmittals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = plan_transmittals.project_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = plan_transmittals.project_id
                        AND public.is_design_studio_comember(p.designer_id)));

DROP POLICY IF EXISTS plan_transmittal_tokens_studio_rw ON public.plan_transmittal_tokens;
CREATE POLICY plan_transmittal_tokens_studio_rw ON public.plan_transmittal_tokens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = plan_transmittal_tokens.project_id
                   AND public.is_design_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = plan_transmittal_tokens.project_id
                        AND public.is_design_studio_comember(p.designer_id)));

-- READ ONLY for authenticated, plus the four housekeeping columns on the sheet.
-- Every other write goes through a definer seam that has an opinion about it: a
-- table-level INSERT would let a studio member mint a print with no file behind
-- it, and a table-level UPDATE would let them move a pointer or a state out of
-- band of the visibility normalization those RPCs exist to perform.
--
-- token_hash is granted to NOBODY but service_role. It is sha256 of a live
-- credential; the column-level grant is what makes `select('*')` on that table
-- fail loudly rather than hand it over. anon is revoked explicitly, not left to
-- a default: Strata predates the 2026-05-30 flip, so a table created there is
-- auto-granted to anon at creation, and RLS would be the only thing standing
-- between an anonymous key and this rail.
REVOKE ALL ON public.plan_sheets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.plan_print_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.plan_prints FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.plan_issues FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.plan_issue_prints FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.plan_transmittals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.plan_transmittal_tokens FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.plan_sheets TO authenticated;
GRANT SELECT ON public.plan_print_batches TO authenticated;
GRANT SELECT ON public.plan_prints TO authenticated;
GRANT SELECT ON public.plan_issues TO authenticated;
GRANT SELECT ON public.plan_issue_prints TO authenticated;
GRANT SELECT ON public.plan_transmittals TO authenticated;
GRANT UPDATE (title, sheet_number, sort_order, discipline)
  ON public.plan_sheets TO authenticated;
GRANT SELECT (
  id, transmittal_id, project_id, status, expires_at, first_opened_at,
  view_count, last_used_at, created_at
) ON public.plan_transmittal_tokens TO authenticated;

GRANT ALL ON public.plan_sheets TO service_role;
GRANT ALL ON public.plan_print_batches TO service_role;
GRANT ALL ON public.plan_prints TO service_role;
GRANT ALL ON public.plan_issues TO service_role;
GRANT ALL ON public.plan_issue_prints TO service_role;
GRANT ALL ON public.plan_transmittals TO service_role;
GRANT ALL ON public.plan_transmittal_tokens TO service_role;
