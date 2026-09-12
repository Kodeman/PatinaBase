-- ═══════════════════════════════════════════════════════════════════════════
-- 00626 — People room CRM · W1b (4 of 5): people_directory v4 — one row per
--          identity, seats beneath
--
-- Lineage (people_directory): 00221 → 00281 → 00420 → 00478 → 00583 →
--   00589:696-935 (v6) → 00594:1211-1458 (the record-based consent read) →
--   THIS FILE (v4 of the redesign; the view's own COMMENT numbering continues
--   from v6, so the comment below says v7 and the redesign calls it v4).
-- Reconciles: nothing reverted. 00594's party branch read
--   channel_consent_status(project_consent_org(project_id), 'sms', phone_e164)
--   for status_raw AND for meta.sms_consent_status; both reads are carried
--   verbatim. 00594 §5.3 owed W1b the two consent DATES, which still came off
--   the frozen project_parties columns — they now come off the record.
--
-- G-9, G-1 and C6 are what this file answers. The room's head count is
-- `${all.length} people` over a view that emits ONE ROW PER PARTY PER PROJECT
-- (`people-room.tsx:383`; 00589:824-860), so the fixture's Tom Marrow appears
-- twice under GCs and once more as a hidden `contact` card the Directory never
-- renders (`directory-view.tsx:294`). The number over-counts humans and
-- under-shows the rolodex. Building seats on that shape would bake in the
-- duplication the redesign exists to remove.
--
-- What changes, and only this:
--
--   1. The PARTY branch becomes one row per IDENTITY. A party carrying a
--      rolodex lineage stamp (studio_contact_id) is no longer its own
--      identity row at all — its identity is the person card, which the
--      CONTACTS branch already emits — and parties with no card collapse on
--      party_identity_key(): the card, else the login, else the E.164 number,
--      else the lowercased email, else the row itself. That is crm-model §4's
--      precedence (account proof, phone, email) with the lineage stamp first,
--      stated ONCE in a function so the Directory and the seats view cannot
--      key the same human differently.
--
--      The winning row per identity is the most recently updated seat, and
--      project_id stays the winner's project so every shipped reader that
--      opens a person from a Directory row still lands on a real seat. The
--      new seat_count is what tells the truth about how many there are.
--
--   2. Five columns are APPENDED — reach_state, consent_status, paper_state,
--      contact_rule_summary, seat_count. Appended, because CREATE OR REPLACE
--      VIEW cannot drop or reorder a column: all twelve existing columns keep
--      their position and type, so `select('*')` readers
--      (use-people.ts:125, :161) widen instead of breaking. PR-y is
--      OVERRULED (rulings §6): no flag, the rebuilt view replaces the
--      six-branch one at 100% on deploy.
--
--   3. public.people_directory_seats — E5 on its own surface, keyed by the
--      SAME identity, so the Directory can nest a person's seats under their
--      one row (PR-p: stage prints on a seat line, never as a person-level
--      column) and the person card's R4 region can list them. It admits EVERY
--      party kind, not the Directory's seven: "where is this human seated" is
--      a different question from "who belongs in the six chips", and PR-c's
--      client_rep seat has to be visible under the household member's card.
--
-- Column semantics worth stating once:
--   · consent_status is the RECORD's verdict (R-AY): channel_consent_status(),
--     which folds refusal_unanswered, never the frozen seat column. On the
--     CONTACTS branch it is that verdict reduced worst-first over every number
--     the identity carries — the card's phone_e164 and its seats' — through
--     identity_consent_status(), because v4 moved every carded human to that
--     branch and reading the card's number alone dropped a recorded refusal
--     on the number a seat carries off the face (r2 MAJOR-2). It is
--     NULL on the client, lead, maker and team branches on purpose — an
--     account holder's SMS permission is profiles.sms_opt_in on a different
--     rail (00162), and printing a studio_channel_consent word there would
--     claim a record that does not exist — and NULL on a contacts row that
--     carries no number anywhere.
--   · paper_state is identity_paper_state(card, firm): the person's OWN paper
--     AND their firm's, reduced worst-first, because a COI is the firm's and a
--     master licence is the person's (crm-model §2, direction §2.2 E10,
--     CS2-21) — both are facts about the same human and the worse one holds
--     the gate. It was COALESCE(company_id, id), which consults the person's
--     own card only when they have NO firm, so a holder_type='person' lapse
--     was reportable on a sole proprietor and invisible on everybody else (r4
--     MAJOR-2). A firm card answers with its own paper; `not_on_file` means
--     neither holder has any paper at all. R-A/C13/C24 (a lender or inspector
--     prints no paper word at all) is a DISPLAY rule and stays in the app: the
--     view reports the fact, the room decides whether the fact is owed.
--   · reach_state is direction §3.8's reach family, PD-12's order: a login is
--     `account`, else a live unexpired field link on one of this identity's
--     seats is `field_link`, else `on_paper`. The party branch asks that of
--     the IDENTITY (reach_state_for_identity, r2 MAJOR-3); the contacts
--     branch asks it of the card, which already matches every seat stamped
--     with that card. field_link_tokens is
--     designer-only RLS (00283), so a co-member without designer visibility
--     reads `on_paper` where a link exists — the same degrade posture
--     v_project_roster.has_active_field_link already carries (00594's own
--     comment), intended and not a leak.
--
-- ⚠ DEPLOY SEQUENCING — A HARD CONSTRAINT, NOT A PREFERENCE (w1b r1 MAJOR-5)
-- This file MUST NOT reach Strata ahead of W2's Directory. Every carded human
-- is now emitted by the CONTACTS branch as role='contact', and the shipped
-- feed drops exactly that role (directory-view.tsx:294,
-- `filter((p) => p.role !== 'contact')`). Measured on the seeded fixture as
-- designer@patina.dev: the six-branch view rendered 22 field rows (architect 1,
-- gc 5, photographer 1, receiver 1, stager 1, sub 13); after this file the feed
-- renders client 7 / lead 5 / sub 1, so every GC, sub, installer, receiver,
-- architect, photographer and stager disappears and people-room.tsx:383 says
-- "62 people" over what it draws. PR-y is overruled (rulings §6): there is no
-- flag to hide this, and §6 rules ONE deploy chain at the end of the program —
-- so 00623–00627 and W2's Directory ship in that one chain, together.
-- W2's chip mapping should read meta.entity_kind plus
-- people_directory_seats.party_kind rather than `role`, which is the shape
-- this view now offers.
--
-- No GRANT/REVOKE is added beyond the two views' own restated GRANT SELECT and
-- the new functions' REVOKE/GRANT → regenerate seed/00-legacy-grants.sql after
-- this migration (python3 scripts/generate-legacy-grants.py).
--
-- LINEAGE OF THE FIX ROUNDS (this file is unapplied on Strata, so every fix is
-- an edit in place):
--   · r1 MAJOR-2 — one candidate set for the identity winner
--     (party_kind_in_directory()), so a row claims what it nests.
--   · r2 MAJOR-2 — the CONTACTS branch's consent word reduces worst-first
--     over every number the identity carries (identity_consent_status()).
--   · r2 MAJOR-3 — the PARTY branch's reach asks the identity, not the
--     winning seat (reach_state_for_identity()).
--   · r3 tests MAJOR-1 — the PARTY branch's consent word asks the identity
--     too: identity_consent_status() in a wrapper ABOVE the DISTINCT ON,
--     replacing the winning seat's own phone_e164. An uncarded identity keyed
--     on a login or an email may hold two seats with two different numbers,
--     and the most recently updated seat decided the printed word.
--   · r3 migrations MAJOR-1 — seat_count is 0 on the client, lead, maker and
--     team branches. Their person_id is a domain-table id
--     (designer_clients / leads / vendors / project_team_members), which
--     people_directory_seats.person_id can never equal, so a count keyed on
--     the identity's PROFILE id claimed N seats and nested none; PR-c's own
--     client_rep seat, stamped with the household member's login, reached it
--     with one ordinary INSERT.
--   · r4 MAJOR-2 — the paper word asks BOTH holders, through one formula
--     (identity_paper_state()) called from all three sites. A person's own
--     gating lapse was invisible on every reader whenever they carried a firm,
--     which is the whole population holder_type='person' exists for. Closes
--     carried MINOR-11 (three formulas for one word) with it.
--   · r4 MAJOR-3 — identity_consent_status()'s number set moves into
--     identity_phone_numbers(), SECURITY DEFINER and gated on
--     is_active_studio_member(). The reduction is worst-first, so an
--     RLS-invisible seat dropped its refusal and the word got MORE permissive:
--     one ordinary organization_members.status='removed' flipped a Directory
--     row from opted_out to granted over a record that still refuses the
--     number, and that row is the send door party-profile-sheet.tsx:262/:742
--     opens the composer on. The verdict is still read by
--     channel_consent_status() under the caller's own RLS; only the number set
--     is definer, and R-AY/R-AW holds — seats are read for phone_e164 alone.
--   · r4 MAJOR-4 — the party branch's two consent DATES come off the record
--     whose verdict WON the reduction (identity_consent_evidence()), not off
--     the winning SEAT's number. The word was already the identity's after r3
--     while the dates were still the seat's, so R-Q's one consent sentence
--     composed "Written consent, 2 May 2025" over a human the record refuses.
--   · r5 BLOCKING-1 — identity_phone_numbers()' seat leg is scoped to the
--     studio it answers for (project_consent_org(pp.project_id) =
--     p_organization_id). Both arguments are caller-supplied and the definer
--     scan had no organization predicate, so any authenticated member of any
--     studio could POST /rest/v1/rpc/identity_phone_numbers and read another
--     studio's trade's mobile number. Suite leg 4e8 is re-stated intra-studio
--     and leg 3x3 walks the closed door.
--   · r5 MAJOR-1 — the party branch and the seats view require
--     is_active_studio_member(project_consent_org(project_id)) BESIDE the
--     three co-member legs. Seat visibility was satisfied by sharing any
--     active org with the designer of record while the consent word is
--     resolved at the project's studio, and both paths COALESCE an unreadable
--     record to `not_asked` — the affirmative word, over a record that
--     refuses, on a send door.
--   · r5 MAJOR-2 — identity_consent_evidence()'s two dates are one-sided: no
--     consented_at when the deciding verdict is `opted_out`, no opt_out_at
--     when it is not. channel_consent_status() folds refusal_unanswered into
--     the word and 00594's backfill mints `granted` records carrying an
--     unanswered, dateless refusal, so the deciding record is itself
--     contradictory and R-Q composed a dated consent claim over a refusal.
--   · r5 MAJOR-3 — the seats view's half of the same tenant conjunct; the
--     other two thirds are 00625's four site-access policies and 00624's four
--     authority policies.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. party_identity_key — crm-model §4's precedence, in one place
-- ═══════════════════════════════════════════════════════════════════════════
-- IMMUTABLE, so it can carry an expression index and be called from a view,
-- a backfill's WHERE clause and a test alike — normalize_channel_value()'s
-- posture (00593). Rule 5 ("name alone never merges") is honoured by falling
-- through to the row's own id: two nameless, numberless, address-less seats
-- stay two identities.
CREATE OR REPLACE FUNCTION public.party_identity_key(
  p_studio_contact_id uuid,
  p_profile_id        uuid,
  p_phone_e164        text,
  p_email             text,
  p_party_id          uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
           p_studio_contact_id::text,
           p_profile_id::text,
           NULLIF(btrim(COALESCE(p_phone_e164, '')), ''),
           NULLIF(lower(btrim(COALESCE(p_email, ''))), ''),
           p_party_id::text
         );
$$;

REVOKE ALL ON FUNCTION public.party_identity_key(uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.party_identity_key(uuid, uuid, text, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.party_identity_key(uuid, uuid, text, text, uuid) IS
  'Which human a project_parties seat belongs to, by crm-model §4''s '
  'precedence: the rolodex lineage stamp (provenance, rule 6, first because it '
  'is the studio''s own act), then the login (rule 1, proof), then the exact '
  'E.164 number (rule 2), then the lowercased email (rule 3), then the row '
  'itself — rule 5, name alone, never merges. IMMUTABLE so people_directory, '
  'people_directory_seats and the expression index all key the same human the '
  'same way (00626).';

CREATE INDEX IF NOT EXISTS idx_project_parties_identity_key
  ON public.project_parties(
    public.party_identity_key(studio_contact_id, profile_id, phone_e164, email, id)
  );

-- ── party_kind_in_directory — the Directory's seven kinds, in ONE place ────
-- The winner per identity was computed twice over DIFFERENT candidate sets:
-- people_directory's DISTINCT ON saw only the seven kinds below, while
-- people_directory_seats' first_value() partitioned over every kind. For an
-- uncarded human whose most recently updated seat was outside the seven — a
-- `sub` on one job and a `vendor` on another — the two picked different
-- winners and `people_directory_seats.person_id = people_directory.person_id`
-- nested NOTHING, which is the one join the redesign rests on (w1b final
-- review r1 MAJOR-2). The vocabulary now lives here, and the seats view orders
-- its window by the same candidate set the Directory selects on, so the two
-- cannot pick differently again.
--
-- IMMUTABLE and a plain scalar SQL body, so the planner inlines it wherever it
-- appears — party_identity_key()'s posture, and the reason the Directory's
-- WHERE clause can call it without giving up its index.
CREATE OR REPLACE FUNCTION public.party_kind_in_directory(p_party_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_party_kind IN ('gc', 'sub', 'installer', 'receiver',
                          'architect', 'photographer', 'stager');
$$;

REVOKE ALL ON FUNCTION public.party_kind_in_directory(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.party_kind_in_directory(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.party_kind_in_directory(text) IS
  'Whether a project_parties kind is one of the seven the Directory''s party '
  'branch emits an identity row for (gc, sub, installer, receiver, architect, '
  'photographer, stager). Stated ONCE: people_directory selects on it and '
  'people_directory_seats orders its winner window by it, so the identity '
  'winner is computed over one candidate set and a Directory row that claims '
  'N seats nests N seats (00626).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. reach_state_for / identity_seat_count / contact_rule_summary
-- ═══════════════════════════════════════════════════════════════════════════
-- All three SECURITY INVOKER, so each base table's own RLS is the whole access
-- rule — 00594's channel_consent_status() posture, and the reason the views
-- can call them at all: a security_invoker view checks function permissions
-- against the CALLER, and a definer here would answer a question the caller
-- was not allowed to ask.
CREATE OR REPLACE FUNCTION public.reach_state_for(
  p_profile_id uuid,
  p_card_id    uuid,
  p_party_id   uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_profile_id IS NOT NULL THEN 'account'
    WHEN (p_card_id IS NOT NULL OR p_party_id IS NOT NULL)
      AND EXISTS (
        SELECT 1
          FROM public.field_link_tokens f
          JOIN public.project_parties pp ON pp.id = f.party_id
         WHERE f.status = 'active'
           AND f.expires_at > now()
           AND ( (p_card_id  IS NOT NULL AND pp.studio_contact_id = p_card_id)
              OR (p_party_id IS NOT NULL AND pp.id                = p_party_id) )
      ) THEN 'field_link'
    ELSE 'on_paper'
  END;
$$;

REVOKE ALL ON FUNCTION public.reach_state_for(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reach_state_for(uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.reach_state_for(uuid, uuid, uuid) IS
  'direction §3.8''s reach family for one identity: account | field_link | '
  'on_paper, in PD-12''s order. A login wins; else a live unexpired field link '
  'on a seat this identity holds (by rolodex stamp or by the seat itself); '
  'else on paper. SECURITY INVOKER — field_link_tokens is designer-only RLS '
  '(00283), so a co-member without that visibility reads on_paper where a link '
  'exists, the same degrade v_project_roster.has_active_field_link carries '
  '(00626).';

CREATE OR REPLACE FUNCTION public.identity_seat_count(p_identity_key text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT count(*)::integer
    FROM public.project_parties pp
   WHERE p_identity_key IS NOT NULL
     AND public.party_identity_key(
           pp.studio_contact_id, pp.profile_id, pp.phone_e164, pp.email, pp.id
         ) = p_identity_key;
$$;

REVOKE ALL ON FUNCTION public.identity_seat_count(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_seat_count(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.identity_seat_count(text) IS
  'How many project_parties seats one identity holds, across every project and '
  'every party kind. The honest answer to G-9: the Directory''s head counts '
  'CARDS and this counts SEATS, so one human is one row with N seats beneath '
  'instead of N rows. SECURITY INVOKER — project_parties'' own RLS scopes it '
  '(00626).';

CREATE OR REPLACE FUNCTION public.contact_rule_summary(
  p_subject_type text,
  p_subject_id   uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(btrim(concat_ws(' ',
           CASE WHEN 'sms' = ANY (r.channels_forbidden)
                THEN 'Never text.' END,
           CASE WHEN cardinality(
                       array(SELECT unnest(r.channels_forbidden) EXCEPT SELECT 'sms')
                     ) > 0
                THEN 'Do not use: ' || array_to_string(
                       array(SELECT c FROM unnest(r.channels_forbidden) c
                              WHERE c <> 'sms' ORDER BY c), ', ') || '.' END,
           CASE WHEN cardinality(r.channels_allowed) > 0
                THEN 'Use: ' || array_to_string(
                       array(SELECT c FROM unnest(r.channels_allowed) c
                              ORDER BY c), ', ') || '.' END,
           CASE WHEN r.route_to_person_id IS NOT NULL
                THEN 'Write ' || COALESCE(
                       (SELECT sc.full_name FROM public.studio_contacts sc
                         WHERE sc.id = r.route_to_person_id),
                       'the named contact') || ' instead.' END,
           -- rtrim of the terminal stop: the studio types "Weekdays 08:00
           -- to 16:00." as often as not, and one clause may not end "..".
           CASE WHEN btrim(COALESCE(r.contact_hours, '')) <> ''
                THEN 'Hours: ' || rtrim(btrim(r.contact_hours), '.') || '.' END
         )), '')
    FROM public.studio_contact_rules r
   WHERE r.subject_type = p_subject_type
     AND r.subject_id   = p_subject_id;
$$;

REVOKE ALL ON FUNCTION public.contact_rule_summary(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_rule_summary(text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.contact_rule_summary(text, uuid) IS
  'E7 as one line of words, for the Directory row''s rule clause (PR-e: a '
  'forbidding or routing rule prints as a sentence beside the reach word, '
  'never as a fourth word; R-S: wherever a rule is shown). Clause order is '
  'fixed — never text, do not use, use, write X instead, hours — so one '
  'recorded rule reads the same at every call site (the R-Q/R-L discipline). '
  'NULL when the subject carries no rule, which is a different fact from a '
  'rule that allows everything; the room prints "No contact rule on file." '
  '(R-V). SECURITY INVOKER: studio_contact_rules'' member RLS is the access '
  'rule (00626).';

-- ── reach_state_for_identity — the same word, over an IDENTITY ────────────
-- reach_state_for() answers for one CARD or one SEAT. The Directory's party
-- branch had no card to pass, so it passed the winning seat's id and the
-- EXISTS clause could only match a link minted on that one seat: an uncarded
-- two-seat trade whose live door hangs on the OLDER seat read `on_paper` on
-- the identity row while the seat line beneath it printed `field_link`, and
-- the studio's next act is to mint a second door for someone who already
-- holds one (w1b final review r2 MAJOR-3). The migration's own comment above
-- already stated the intended rule — "a live unexpired field link on one of
-- this identity's seats" — and the contacts branch, which passes a card, met
-- it; only the branch with no card did not.
--
-- So the question is asked of the identity: every seat whose
-- party_identity_key() is this key, which is exactly the set
-- identity_seat_count() counts and people_directory_seats nests. SECURITY
-- INVOKER, same posture and same designer-only field_link_tokens degrade as
-- reach_state_for().
CREATE OR REPLACE FUNCTION public.reach_state_for_identity(
  p_profile_id   uuid,
  p_identity_key text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_profile_id IS NOT NULL THEN 'account'
    WHEN p_identity_key IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM public.field_link_tokens f
          JOIN public.project_parties pp ON pp.id = f.party_id
         WHERE f.status = 'active'
           AND f.expires_at > now()
           AND public.party_identity_key(
                 pp.studio_contact_id, pp.profile_id,
                 pp.phone_e164, pp.email, pp.id
               ) = p_identity_key
      ) THEN 'field_link'
    ELSE 'on_paper'
  END;
$$;

REVOKE ALL ON FUNCTION public.reach_state_for_identity(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reach_state_for_identity(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.reach_state_for_identity(uuid, text) IS
  'direction §3.8''s reach family for one IDENTITY: account | field_link | '
  'on_paper, in PD-12''s order, over every project_parties seat whose '
  'party_identity_key() is this key — the same set identity_seat_count() '
  'counts and people_directory_seats nests. reach_state_for()''s sibling for '
  'the Directory''s party branch, which holds no card id and was therefore '
  'reading the winning seat alone: an uncarded identity whose live link hung '
  'on a non-winning seat printed on_paper over a seat line reading field_link '
  '(w1b final review r2 MAJOR-3). SECURITY INVOKER — field_link_tokens is '
  'designer-only RLS (00283), so a co-member without that visibility reads '
  'on_paper where a link exists (00626).';

-- ── identity_paper_state — the paper word over BOTH holders ───────────────
-- compliance_state() answers for ONE holder card. Every reader asked it
-- through COALESCE(company_id, card_id), which consults the person's own card
-- only when they have NO firm — so a person-held paper was reportable on a
-- sole proprietor and unreportable on everybody else, which is the entire
-- population holder_type = 'person' was added for (00623:16-17, :174-176,
-- CS2-21: "a COI is the firm's and a master licence is the person's").
--
-- Walked on the seeded fixture with one honest record change and no
-- adversarial write (w1b final review r4 MAJOR-2): Luis Ochoa's own
-- site_access-gating OSHA 30 card expires, compliance_state(his card) reads
-- `lapsed`, compliance_state(his firm) reads `current`, and BOTH shipped
-- readers printed `current` for him — on his Directory row and on his seat
-- line. The gate this program built the site_access vocabulary for was held
-- by a lapsed card and no surface in the room could say so.
--
-- So the paper word is asked of the IDENTITY: the person's own card AND their
-- firm, reduced WORST-FIRST, the way identity_consent_status() reduces
-- numbers. `not_on_file` is the weakest claim, not the worst one — a person
-- holding no personal paper at all must not drag a firm's `current` down to
-- `not_on_file` (C21/R-K: no paper is a different fact from a lapse) — so the
-- order is lapsed, lapses_soon, current, and not_on_file only when neither
-- holder has any paper at all.
--
-- ONE formula, called from all three sites (the party branch, the contacts
-- branch and people_directory_seats), which is also carried MINOR-11's
-- request: three copies of the paper word were three places for it to drift.
-- SECURITY INVOKER, so studio_compliance_documents' member-only RLS stays the
-- whole access rule and an outsider reads `not_on_file` — compliance_state()'s
-- own posture (00623), unchanged.
CREATE OR REPLACE FUNCTION public.identity_paper_state(
  p_card_id    uuid,
  p_company_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH words AS (
    SELECT public.compliance_state(p_card_id) AS w
     WHERE p_card_id IS NOT NULL
    UNION ALL
    SELECT public.compliance_state(p_company_id) AS w
     WHERE p_company_id IS NOT NULL
       AND p_company_id IS DISTINCT FROM p_card_id
  )
  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM words WHERE w = 'lapsed')      THEN 'lapsed'
           WHEN EXISTS (SELECT 1 FROM words WHERE w = 'lapses_soon') THEN 'lapses_soon'
           WHEN EXISTS (SELECT 1 FROM words WHERE w = 'current')     THEN 'current'
           ELSE 'not_on_file'
         END;
$$;

REVOKE ALL ON FUNCTION public.identity_paper_state(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_paper_state(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.identity_paper_state(uuid, uuid) IS
  'direction §3.8''s paper word for one IDENTITY rather than for one holder '
  'card: compliance_state() over the person''s OWN card and over their firm, '
  'reduced worst-first — lapsed, else lapses_soon, else current, else '
  'not_on_file when neither holder has any paper at all, because no paper is a '
  'different fact from a lapse (C21/R-K) and a person holding nothing '
  'personally must not drag their firm''s word down. Exists because every '
  'reader asked compliance_state(COALESCE(company_id, card_id)), which '
  'consults a person''s own card only when they have no firm — so a '
  'holder_type=''person'' lapse (a master licence, an OSHA card: the reason '
  'the column exists, CS2-21) was invisible on everyone who carries a firm '
  '(w1b final review r4 MAJOR-2). Called from all three sites, so the paper '
  'word has ONE formula (carried MINOR-11). For a firm card pass the firm as '
  'p_card_id. SECURITY INVOKER — studio_compliance_documents'' member-only RLS '
  'is the access rule, so an outsider reads not_on_file (00626).';

-- ── identity_phone_numbers — every number one identity carries ────────────
-- The number set identity_consent_status() reduces over, lifted into its own
-- SECURITY DEFINER function (w1b final review r4 MAJOR-3).
--
-- The reduction was SECURITY INVOKER over a project_parties scan, and the
-- reduction is WORST-FIRST: a seat the caller cannot see contributes no
-- number, and REMOVING a number can only make the printed word MORE
-- PERMISSIVE. So the function's own banner and COMMENT called it "fail-closed"
-- while RLS made it fail OPEN, and it was walked with an ordinary studio act:
-- the designer of record on one job is set to organization_members.status =
-- 'removed', and the owner's Directory row for the same rolodex card flips
-- from `opted_out` to `granted` while channel_consent_status() still returns
-- `opted_out` for the number and the seat line that would have argued is gone
-- with it. The misled reader is a send door — party-profile-sheet.tsx:262
-- computes `granted` from this word and :742 opens the text composer on it —
-- so the studio was invited to text a number the rail refuses (G-3).
--
-- The INVOKER degrade is only safe where the failure direction is safe, which
-- is true of reach_state (`on_paper`) and of paper_state (`not_on_file`) and
-- is not true of consent. So the NUMBER SET is definer and GATED: nothing is
-- returned unless the caller is an active member of p_organization_id, which
-- is 00594's channel_consent_status() posture stated as a predicate rather
-- than left to RLS, and is the same population the contacts branch's own WHERE
-- clause already requires. The VERDICT is still read by
-- channel_consent_status() under the CALLER's own RLS, so this adds no
-- consent-word oracle: it answers "which numbers is this human reachable on,
-- inside my studio", for a member of that studio.
--
-- Record-only (R-AY/R-AW): the seats are read for their phone_e164 ONLY. No
-- frozen project_parties.sms_consent_* column is read here or anywhere in this
-- file — the consent VERDICT has exactly one source, studio_channel_consent.
--
-- ONE STUDIO, on BOTH sides (w1b final review r5 BLOCKING-1). The seat leg
-- also requires project_consent_org(pp.project_id) = p_organization_id, which
-- is the population R-AK already resolves the RECORD at. Without it the
-- function was a cross-tenant phone-number oracle: p_organization_id and
-- p_identity_key are BOTH caller-supplied, the gate proved only that the
-- caller belonged to the studio they NAMED, and the seat scan — definer, so
-- no RLS — reached every project_parties row on the platform. Walked as the
-- owner of one unrelated studio, `identity_phone_numbers('<my own org>', '<a
-- foreign rolodex card uuid>', NULL)` returned another studio's trade's mobile
-- number, over `POST /rest/v1/rpc/identity_phone_numbers` as well as in SQL,
-- while people_directory, people_directory_seats and project_site_access_cards
-- all correctly returned nothing. It was also a yes/no existence oracle on any
-- number, login, card uuid or email.
--
-- The earlier round argued the wide scan was the fail-closed direction: a
-- foreign seat's number can only ADD `not_asked` and never borrow a foreign
-- `granted`. True, and not worth a cross-tenant read of PII. A number no seat
-- of THIS studio carries is not a number this studio can reach the human on,
-- so `not_asked` is the honest word for it, and the record the word is
-- resolved at is this studio's own either way (R-AK). Suite leg 4e8, whose
-- premise was constructible only through the cross-studio scan, is re-stated
-- intra-studio, and leg 3x3 walks the closed door.
CREATE OR REPLACE FUNCTION public.identity_phone_numbers(
  p_organization_id uuid,
  p_identity_key    text,
  p_card_phone_e164 text
)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT n.v FROM (
    SELECT NULLIF(btrim(COALESCE(p_card_phone_e164, '')), '') AS v
     WHERE public.is_active_studio_member(p_organization_id)
    UNION
    SELECT NULLIF(btrim(COALESCE(pp.phone_e164, '')), '')
      FROM public.project_parties pp
      JOIN public.projects pj ON pj.id = pp.project_id
     WHERE public.is_active_studio_member(p_organization_id)
       AND p_identity_key IS NOT NULL
       -- the seat must belong to the studio this call answers FOR, not merely
       -- to a studio the caller happens to belong to (w1b final review r5
       -- BLOCKING-1). Both arguments are caller-supplied and this leg had no
       -- organization predicate at all, so the gate proved only that the
       -- caller belonged to the studio they NAMED while the scan reached
       -- every seat on the platform.
       AND public.project_consent_org(pj.id) = p_organization_id
       AND public.party_identity_key(
             pp.studio_contact_id, pp.profile_id,
             pp.phone_e164, pp.email, pp.id
           ) = p_identity_key
  ) n
  WHERE n.v IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.identity_phone_numbers(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_phone_numbers(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.identity_phone_numbers(uuid, text, text) IS
  'Every SMS number one identity carries: the card''s phone_e164 plus the '
  'phone_e164 of every project_parties seat whose party_identity_key() is this '
  'key. SECURITY DEFINER, GATED on is_active_studio_member(p_organization_id) '
  '— a non-member gets nothing. Definer because the set feeds a WORST-FIRST '
  'consent reduction, where a seat the caller cannot see used to drop out and '
  'make the printed word MORE PERMISSIVE: an ordinary '
  'organization_members.status = ''removed'' flipped a Directory row from '
  'opted_out to granted over a record that still refused the number, and that '
  'row is a send door (w1b final review r4 MAJOR-3). Returns NUMBERS, never a '
  'verdict: channel_consent_status() still reads studio_channel_consent under '
  'the CALLER''s RLS, so this is no consent oracle. Record-only (R-AY/R-AW) — '
  'seats are read for phone_e164 alone, never for a frozen sms_consent_* '
  'column. ONE STUDIO on both sides: the seat leg requires '
  'project_consent_org(pp.project_id) = p_organization_id, the population '
  'R-AK resolves the record at. Without it this was a cross-tenant oracle — '
  'both arguments are caller-supplied, the gate proved only that the caller '
  'belonged to the studio they NAMED, and the definer scan reached every '
  'project_parties row on the platform, so a member of any studio could POST '
  '/rest/v1/rpc/identity_phone_numbers and read another studio''s trade''s '
  'mobile number (w1b final review r5 BLOCKING-1). A number no seat of this '
  'studio carries is not a number this studio can reach the human on, so '
  '`not_asked` is the honest word for it (00626).';

-- ── identity_consent_status — the consent word over every number ──────────
-- The contacts branch read channel_consent_status() off the CARD's
-- phone_e164 alone. v4 moves every carded human to that branch, so a recorded
-- `opted_out` on the number the person's SEAT carries stopped appearing on the
-- identity row: a card with a different number read `not_asked` and a card
-- with no number read no word at all, while people_directory_seats printed
-- `opted_out` for the same human off the same record. That is a regression
-- against what 00594 shipped for the seated population — the old party branch
-- emitted a row per seat carrying that seat's own verdict — and direction §1.4
-- is explicit that consent is printed against the number "everywhere that
-- number appears" (w1b final review r2 MAJOR-2).
--
-- RULED (Fable's fix instruction, first option): reduce the record's verdict
-- over every number this identity actually carries — the card's phone_e164
-- plus the phone_e164 of every seat keyed to the same identity — rather than
-- adding a second column the room would have to learn to print. This is
-- R-AK/PR-x's own reduction restated on the READ side, and it stays
-- record-only (R-AY/R-AW): every number is resolved through
-- channel_consent_status(), the frozen project_parties.sms_consent_* columns
-- are not read here or anywhere.
--
-- WORST-FIRST, which is least-permission-first:
--   opted_out  a refusal on ANY number this identity carries is a refusal
--              (fail-closed, and G-3's defect is a row promising reach the
--              rail refuses)
--   not_asked  a number with no record at all: nothing may be sent to it, and
--              "Not asked" is the honest call to action
--   pending    asked, unanswered
--   granted    only when EVERY number on file is permitted
-- NULL when the identity carries no number at all — the same fact the branch
-- used to state with `CASE WHEN sc.phone_e164 IS NOT NULL`, now true of the
-- whole identity rather than of the card alone.
--
-- One studio: every number is read at p_organization_id, the card's own org
-- (R-AK — a verdict is always the resolving studio's own, never another
-- tenant's). The NUMBER SET is identity_phone_numbers(), a gated SECURITY
-- DEFINER function, because a worst-first reduction over an RLS-filtered scan
-- fails OPEN — see that function's banner (w1b final review r4 MAJOR-3). This
-- one stays SECURITY INVOKER: studio_channel_consent's member-only RLS is
-- still what decides whether the caller may read the record at all.
CREATE OR REPLACE FUNCTION public.identity_consent_status(
  p_organization_id uuid,
  p_identity_key    text,
  p_card_phone_e164 text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH verdicts AS (
    SELECT COALESCE(
             public.channel_consent_status(p_organization_id, 'sms', n.v),
             'not_asked') AS word
      FROM public.identity_phone_numbers(
             p_organization_id, p_identity_key, p_card_phone_e164) AS n(v)
  )
  SELECT CASE
           WHEN NOT EXISTS (SELECT 1 FROM verdicts)                        THEN NULL
           WHEN EXISTS (SELECT 1 FROM verdicts WHERE word = 'opted_out')   THEN 'opted_out'
           WHEN EXISTS (SELECT 1 FROM verdicts WHERE word = 'not_asked')   THEN 'not_asked'
           WHEN EXISTS (SELECT 1 FROM verdicts WHERE word = 'pending')     THEN 'pending'
           ELSE 'granted'
         END;
$$;

REVOKE ALL ON FUNCTION public.identity_consent_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_consent_status(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.identity_consent_status(uuid, text, text) IS
  'The studio''s SMS consent word for one IDENTITY rather than for one number: '
  'channel_consent_status() reduced worst-first over the card''s phone_e164 '
  'plus the phone_e164 of every project_parties seat keyed to the same '
  'party_identity_key(), all read at p_organization_id (R-AK: one studio, '
  'never across tenants). Order is least-permission-first — opted_out on any '
  'number, else not_asked on any, else pending, else granted only when every '
  'number on file is permitted — because direction §1.4 prints consent '
  '"everywhere that number appears" and G-3''s defect is a row promising reach '
  'the send rail refuses. NULL when the identity carries no number at all. '
  'Record-only (R-AY): the frozen project_parties.sms_consent_* columns are '
  'not read. Exists because v4 moved every carded human to the Directory''s '
  'contacts branch, which read the CARD''s number alone, so a refusal recorded '
  'on the number a seat carries left the face (w1b final review r2 MAJOR-2). '
  'The number set comes from identity_phone_numbers(), gated SECURITY DEFINER, '
  'because this reduction read the seats under the caller''s own RLS and a '
  'worst-first reduction over a filtered set fails OPEN — an invisible seat '
  'dropped its refusal and the row printed `granted` (r4 MAJOR-3). Its dates '
  'are identity_consent_evidence()''s, off the same deciding record (00626).';

-- ── identity_consent_evidence — the DATES of the record that decided ──────
-- The word and its two dates have to come off the SAME number, and on the
-- party branch they did not (w1b final review r4 MAJOR-4). r3 lifted the word
-- above the DISTINCT ON and keyed it on the identity; the LEFT JOIN supplying
-- meta.sms_consented_at / meta.sms_opt_out_at still joined
-- studio_channel_consent on the WINNING SEAT's phone_e164 and was projected
-- beside it. For exactly the population the r3 fix exists for — an uncarded
-- identity keyed on a login or an email, holding two seats with two numbers —
-- the three values could not all be true: the walked row printed
-- consent_status `opted_out` with sms_consented_at 2025-05-02 and
-- sms_opt_out_at NULL, while the record said one number opted out on
-- 2025-12-03 and the other was granted on 2025-05-02. R-Q fixes ONE consent
-- sentence for every surface — "<Source> consent, <d Mon yyyy>, on the
-- <project>." — and composed from that row it read "Written consent, 2 May
-- 2025" for a human the record refuses, with the refusal's own date nowhere on
-- the row.
--
-- So the dates are taken from the record whose verdict WON the reduction. No
-- ordering and no fold is restated here: the winning word is
-- identity_consent_status()'s, each number's verdict is
-- channel_consent_status()'s (R-AS/R-AY — one home for the rule), and this
-- picks the record among the identity's numbers whose verdict equals the
-- printed word, most recently updated first so two records carrying the same
-- word answer deterministically. No row when the word is `not_asked` because a
-- number has NO record: the room then prints R-V's "no record" line rather
-- than a date it cannot source.
--
-- AND THE DATES ARE ONE-SIDED (w1b final review r5 MAJOR-2). R-BC was
-- satisfied — both dates off the DECIDING record — and r4 MAJOR-4's
-- consequence came back anyway, because channel_consent_status() folds
-- refusal_unanswered INTO the word (00594:1016) and 00594's own backfill
-- deliberately mints records that read status='granted' WITH an unanswered
-- refusal, carrying a real consented_at and, since a folded refusal is
-- routinely dateless, frequently no opt_out_at. The deciding record is then
-- internally contradictory and projecting it faithfully gave the room
-- consent_status `opted_out` beside sms_consented_at 2025-05-02 and an empty
-- sms_opt_out_at — R-Q's one fixed sentence composes "Written consent, 2 May
-- 2025" for a human the rail refuses, which is G-3's defect verbatim. The
-- local fixture carries refusal_unanswered false on every record, so nothing
-- in the wave touched this population; the Strata backfill creates it.
--
-- So: when the deciding verdict is `opted_out` no consented_at is projected
-- (the grant it names has been answered by a refusal), and when it is not
-- `opted_out` no opt_out_at is. R-BC is unaffected — the dates still come off
-- the deciding record, or are left empty, which R-BC explicitly permits — and
-- the word is still channel_consent_status()'s, unchanged: this suppresses a
-- DATE the word contradicts, never the word itself.
CREATE OR REPLACE FUNCTION public.identity_consent_evidence(
  p_organization_id uuid,
  p_identity_key    text,
  p_card_phone_e164 text
)
RETURNS TABLE (
  channel_value text,
  consented_at  timestamptz,
  opt_out_at    timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH decided AS (
    SELECT public.identity_consent_status(
             p_organization_id, p_identity_key, p_card_phone_e164) AS word
  )
  SELECT scc.channel_value,
         -- one-sided, so the dates cannot compose a clause the word
         -- contradicts (w1b final review r5 MAJOR-2)
         CASE WHEN d.word = 'opted_out' THEN NULL ELSE scc.consented_at END,
         CASE WHEN d.word = 'opted_out' THEN scc.opt_out_at ELSE NULL END
    FROM decided d
    CROSS JOIN public.identity_phone_numbers(
           p_organization_id, p_identity_key, p_card_phone_e164) AS n(v)
    JOIN public.studio_channel_consent scc
      ON scc.organization_id = p_organization_id
     AND scc.channel_kind    = 'sms'
     AND scc.channel_value   = n.v
   WHERE public.channel_consent_status(p_organization_id, 'sms', n.v)
         IS NOT DISTINCT FROM d.word
   ORDER BY scc.updated_at DESC, scc.channel_value
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.identity_consent_evidence(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_consent_evidence(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.identity_consent_evidence(uuid, text, text) IS
  'The consented_at / opt_out_at of the studio_channel_consent record that '
  'DECIDED identity_consent_status() for this identity — the number whose '
  'verdict won the worst-first reduction — plus that record''s channel_value. '
  'At most one row; none at all when the winning word came from a number with '
  'no record, so the room falls back to R-V''s "no record" line. Exists '
  'because the party branch''s word was the identity''s while its two dates '
  'were still joined on the WINNING SEAT''s number, so R-Q''s one consent '
  'sentence composed a dated consent claim over a recorded refusal (w1b final '
  'review r4 MAJOR-4). Restates no rule: the word is '
  'identity_consent_status()''s, each number''s verdict is '
  'channel_consent_status()''s (R-AS/R-AY), the number set is '
  'identity_phone_numbers()''s. The two dates are ONE-SIDED: no consented_at '
  'when the deciding verdict is `opted_out`, no opt_out_at when it is not, so '
  'the dates cannot compose a clause the word contradicts. '
  'channel_consent_status() folds refusal_unanswered into the word and '
  '00594''s backfill mints `granted` records carrying an unanswered, dateless '
  'refusal, so the deciding record itself is contradictory and projecting it '
  'faithfully put "Written consent, 2 May 2025" beside a refusal (w1b final '
  'review r5 MAJOR-2). R-BC permits dates left empty. SECURITY INVOKER — the '
  'record is read under the caller''s own member RLS (00626).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. people_directory v4
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── CLIENTS ───────────────────────────────────────────────────────────────
-- Carried verbatim from 00594:1217-1252, plus the five appended columns.
SELECT
  dc.id                                                          AS person_id,
  'client'::text                                                 AS role,
  COALESCE(dc.client_name, pr.full_name, pr.display_name, dc.client_email, 'Unnamed client') AS display_name,
  COALESCE(dc.client_email, pr.email)                            AS email,
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
  (CASE WHEN dc.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text AS scope,
  -- ── appended by 00626 ──
  public.reach_state_for(dc.client_id, NULL, NULL)               AS reach_state,
  NULL::text                                                     AS consent_status,
  NULL::text                                                     AS paper_state,
  NULL::text                                                     AS contact_rule_summary,
-- seat_count is 0, not identity_seat_count(<a profile id>). person_id on this
-- branch is a designer_clients id, while people_directory_seats.person_id is
-- only ever a rolodex card id or a project_parties id (its COALESCE at §4), so
-- NOTHING can
-- nest under this row by construction — the count claimed N seats and unfolded
-- to none, and the seats themselves hung under a person_id the Directory never
-- returns. One ordinary INSERT reached it: PR-c's own client_rep seat stamped
-- with the household member's LOGIN (w1b final review r3 MAJOR-1 in the
-- migrations review, r2's MINOR-24 promoted). 0 is what this row can nest, so
-- 0 is what it claims.
--
-- Keying the seats view at these rows instead (the other option) would move
-- the same defect rather than close it: an uncarded, profile-stamped seat of
-- one of the Directory's seven kinds ALSO gets a party-branch row keyed on
-- that same login, whose person_id is the winning seat's id, so the party row
-- would then claim N and nest 0 — and one login holding both a
-- designer_clients row and an open lead has no single right answer. PR-c's
-- "read the seats under the household member's card" is served today by
-- STAMPING the seat with that person's rolodex card (studio_contact_id), which
-- is what the dev seed does for Chidi Okonkwo and what puts the identity on
-- the contacts branch; the household OBJECT is P2.
  0::integer                                                     AS seat_count
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE public.is_studio_comember(dc.designer_id)

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
-- Carried verbatim from 00594:1258-1284.
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
  (CASE WHEN l.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text,
  public.reach_state_for(l.homeowner_id, NULL, NULL),
  NULL::text,
  NULL::text,
  NULL::text,
-- seat_count is 0 for the same reason as the client branch above: person_id
-- here is a leads id, which people_directory_seats.person_id can never be, so this row can nest nothing (r3 MAJOR-1, migrations review).
  0::integer
FROM public.leads l
LEFT JOIN public.profiles hp ON hp.id = l.homeowner_id
WHERE public.is_studio_comember(l.designer_id)
  AND l.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

-- ── MAKERS / VENDORS (saved or engaged, studio-wide) ──────────────────────
-- Carried verbatim from 00594:1290-1333.
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
   END)::text,
  public.reach_state_for(v.contact_profile_id, NULL, NULL),
  NULL::text,
  NULL::text,
  NULL::text,
-- seat_count is 0 for the same reason as the client branch above: person_id
-- here is a vendors id, which people_directory_seats.person_id can never be,
-- so this row can nest nothing (r3 MAJOR-1, migrations review).
  0::integer
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

-- ── SEATED PEOPLE WITH NO ROLODEX CARD (v4: one row per IDENTITY) ─────────
-- Was: one row per party per project (00594:1339-1383, unchanged since 00420).
-- Now: parties carrying a lineage stamp are NOT here at all — the CONTACTS
-- branch below emits their identity row — and the rest collapse on
-- party_identity_key(), most-recently-updated seat winning. The kind filter,
-- the three-way co-member predicate, every carried column and the two consent
-- reads are 00594's, byte for byte. project_id stays the winner's project so
-- every shipped reader that opens a person from a Directory row still lands
-- on a real seat; seat_count is what says how many there are.
--
-- The two consent DATES now come off studio_channel_consent (00594 §5.3's
-- debt to W1b) — off the record whose verdict DECIDED the printed word,
-- through identity_consent_evidence(), resolved at the org the ONE resolver
-- project_consent_org() names. They were joined on the winning SEAT's number
-- while the word was the identity's, which is r4 MAJOR-4. The VERDICT still
-- comes from channel_consent_status(), which folds refusal_unanswered — a rule
-- with one home (R-AY); only the raw dates are read beside it.
SELECT
  q.id,
  q.party_kind,
  q.display_name,
  q.email,
  q.phone,
  q.profile_id,
  q.project_id,
  auth.uid(),
  q.consent_word,
  q.updated_at,
  jsonb_build_object(
    'company_name',       q.company_name,
    'vendor_id',          q.vendor_id,
    'project_name',       q.project_name,
    'party_kind',         q.party_kind,
    'trade',              q.trade,
    'phone_e164',         q.phone_e164,
    'sms_consent_status', q.consent_word,
    'sms_consented_at',   q.record_consented_at,
    'sms_opt_out_at',     q.record_opt_out_at,
    'show_to_client',     q.show_to_client,
    'studio_contact_id',  q.studio_contact_id,
    'identity_key',       q.identity_key,
    'stage',              q.stage,
    'on_site_from',       q.on_site_from,
    'on_site_to',         q.on_site_to,
    'company_id',         q.company_id
  ),
  q.scope,
  -- the IDENTITY's links, not the winning seat's (r2 MAJOR-3)
  public.reach_state_for_identity(q.profile_id, q.identity_key),
  q.consent_word,
  -- the identity's own card AND its firm, worst-first (r4 MAJOR-2). This
  -- branch emits only UNSTAMPED seats, so q.studio_contact_id is NULL by
  -- construction and the firm is the whole answer here; the call shape is the
  -- one the other two sites use, so the paper word has one formula.
  public.identity_paper_state(q.studio_contact_id, q.company_id),
  public.contact_rule_summary('engagement', q.id),
  public.identity_seat_count(q.identity_key)
-- The consent word belongs to the IDENTITY, not to whichever seat won the
-- DISTINCT ON. It used to be computed INSIDE that subquery off the winning
-- seat's own phone_e164, while reach_state three lines above already asked the
-- identity through reach_state_for_identity(): an uncarded identity keyed on a
-- login or an email (party_identity_key()'s 2nd and 4th precedence legs) may
-- hold two seats with two DIFFERENT numbers, and the most recently updated one
-- decided the printed word even when a different number of that same identity
-- is the one the studio's record says opted_out (w1b final review r3 tests
-- MAJOR-1 — the carve-out the r2 fix log named as out of scope).
--
-- identity_consent_status() is r2 MAJOR-2's own reduction, already wired into
-- the contacts branch: worst-first over every number the identity carries,
-- each resolved through channel_consent_status() at ONE studio (R-AK),
-- record-only (R-AY) — the frozen project_parties.sms_consent_* columns are
-- read nowhere here. It sits in the wrapper below, AFTER the DISTINCT ON, so
-- it is evaluated once per emitted identity rather than once per candidate
-- seat, and its card-phone argument is NULL because an uncarded identity has
-- no card: its numbers are exactly its seats'. COALESCE to 'not_asked' keeps
-- 00594's party-branch shape, where status_raw and meta.sms_consent_status
-- have always carried a word rather than NULL; the contacts branch's
-- NULL-means-no-number-anywhere is its own rule (R-V).
-- The two consent DATES belong to the number whose verdict WON that
-- reduction, not to the winning seat's number, which is what the LEFT JOIN
-- inside q0 used to supply while the word above was already the identity's
-- (w1b final review r4 MAJOR-4). identity_consent_evidence() returns the
-- deciding record's own consented_at / opt_out_at, or no row at all when the
-- word came from a number with no record — in which case both dates are NULL
-- and the room prints R-V's "no record" line rather than a date it cannot
-- source. One LATERAL, evaluated once per emitted identity like the word.
FROM (
  SELECT
    q0.*,
    COALESCE(public.identity_consent_status(
      public.project_consent_org(q0.project_id),
      q0.identity_key, NULL), 'not_asked')    AS consent_word,
    ev.consented_at                           AS record_consented_at,
    ev.opt_out_at                             AS record_opt_out_at
  FROM (
    SELECT DISTINCT ON (
      public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                                pp.phone_e164, pp.email, pp.id)
    )
      public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                                pp.phone_e164, pp.email, pp.id) AS identity_key,
      pp.id, pp.party_kind, pp.display_name, pp.email, pp.phone, pp.profile_id,
      pp.project_id, pp.updated_at, pp.company_name, pp.vendor_id, pp.trade,
      pp.phone_e164, pp.show_to_client, pp.studio_contact_id, pp.stage,
      pp.on_site_from, pp.on_site_to, pp.company_id,
      pj.name AS project_name,
      (CASE
         WHEN pj.designer_id      = (select auth.uid())
           OR pj.lead_designer_id = (select auth.uid())
           OR pj.created_by       = (select auth.uid())
         THEN 'mine' ELSE 'studio'
       END)::text                               AS scope
    FROM public.project_parties pp
    JOIN public.projects pj ON pj.id = pp.project_id
    WHERE public.party_kind_in_directory(pp.party_kind)
      AND pp.studio_contact_id IS NULL
      -- the seat is visible only to a member of the studio whose CONSENT
      -- RECORD decides its word (w1b final review r5 MAJOR-1/MAJOR-3). The
      -- three co-member legs below are satisfied by sharing ANY active
      -- organization with the designer of record, while the word is resolved
      -- at project_consent_org(project_id) — so a caller who could see the
      -- seat but could not read the record had the unreadable record rendered
      -- as the affirmative word `not_asked`, over a record that says
      -- opted_out, on the row party-profile-sheet.tsx:262/:742 opens the text
      -- composer from.
      AND public.is_active_studio_member(public.project_consent_org(pp.project_id))
      AND ( public.is_studio_comember(pj.designer_id)
         OR public.is_studio_comember(pj.lead_designer_id)
         OR public.is_studio_comember(pj.created_by) )
    ORDER BY
      public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                                pp.phone_e164, pp.email, pp.id),
      pp.updated_at DESC, pp.id
  ) q0
  LEFT JOIN LATERAL public.identity_consent_evidence(
    public.project_consent_org(q0.project_id), q0.identity_key, NULL) ev ON true
) q

UNION ALL

-- ── TEAM (studio collaborators on studio projects, one row per teammate) ───
-- Carried verbatim from 00594:1389-1429. Already one row per identity
-- (DISTINCT ON user_id). reach_state is `account` by construction — the
-- branch joins project_team_members, which is logins only (00084:160-172).
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
  (CASE WHEN t.is_mine THEN 'mine' ELSE 'studio' END)::text,
  public.reach_state_for(t.user_id, NULL, NULL),
  NULL::text,
  NULL::text,
  NULL::text,
-- seat_count is 0 for the same reason as the client branch above: person_id
-- here is a project_team_members id, which people_directory_seats.person_id
-- can never be, so this row can nest nothing (r3 MAJOR-1, migrations review).
  0::integer
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
-- Carried verbatim from 00594:1435-1458, plus the five appended columns. This
-- is the branch that now carries the identity of every carded human AND every
-- firm: PR-g's mixed list ("29 people, 22 firms") reads both kinds from here,
-- told apart by meta.entity_kind, which 00420 already put in the bag.
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
  (CASE WHEN sc.created_by = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text,
  public.reach_state_for(sc.profile_id, sc.id, NULL),
  -- every number this identity carries, worst-first — the card's AND its
  -- seats' (r2 MAJOR-2). NULL only when there is no number anywhere.
  public.identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164),
  -- the card's OWN paper AND its firm's, worst-first (r4 MAJOR-2). It was
  -- COALESCE(company_id, id), which asks the person's own card only when they
  -- have no firm — so a person-held lapse, the reason holder_type='person'
  -- exists, was invisible on everyone who carries one. A firm card passes
  -- itself as the card and its own paper is the answer.
  public.identity_paper_state(sc.id, sc.company_id),
  public.contact_rule_summary(sc.entity_kind, sc.id),
  public.identity_seat_count(sc.id::text)
FROM public.studio_contacts sc
WHERE public.is_active_studio_member(sc.organization_id);

COMMENT ON VIEW public.people_directory IS
  'R57 / People Room roster (client|lead|maker|gc|sub|installer|receiver|'
  'architect|photographer|stager|team|contact) for the querying user. v7 '
  '(00626, the "Everyone on the Job" redesign''s v4): ONE ROW PER IDENTITY. '
  'The party branch no longer emits a row per party per project — a seat '
  'carrying a studio_contact_id has its identity in the CONTACTS branch, and '
  'the rest collapse on party_identity_key() with the most recently updated '
  'seat winning, so G-9''s over-count is gone and the head can count cards. '
  'project_id on such a row is the winning seat''s project, so a shipped '
  'reader that opens a person still lands on a real seat; seat_count says how '
  'many seats there are and people_directory_seats lists them (PR-p: stage '
  'prints on a seat line, never as a person-level column). PR-y is OVERRULED '
  '(rulings §6): no flag, this replaces the six-branch view at 100%. '
  'Five columns are APPENDED, never inserted, because CREATE OR REPLACE VIEW '
  'cannot reorder: reach_state (direction §3.8, PD-12''s order), '
  'consent_status (the RECORD''s verdict via channel_consent_status(), R-AY — '
  'on the contacts branch reduced worst-first over every number the identity '
  'carries, the card''s and its seats'', by identity_consent_status(); NULL on '
  'the client/lead/maker/team branches, whose SMS permission is '
  'profiles.sms_opt_in on a different rail), paper_state '
  '(identity_paper_state(card, firm) — the person''s OWN paper AND their '
  'firm''s, worst-first, because a COI is the firm''s and a master licence is '
  'the person''s; R-A/C13''s "no paper word for a lender or inspector" is a '
  'DISPLAY rule and stays in '
  'the app), contact_rule_summary (E7 as one line, PR-e/R-S) and seat_count. '
  'v6 (00589): PHONE ONLY is profile-first on the client and lead branches — '
  'COALESCE(NULLIF(btrim(profiles.phone), ''''), '
  'NULLIF(btrim(designer_clients.client_phone), '''')) and the same over '
  'leads.contact_phone, so a whitespace-only number on either side reads as '
  'no number rather than as a blank cell. display_name and email in those '
  'branches stay CAPTURED-first, and no SMS or email dispatch reads this '
  'view''s phone (dispatch reads project_parties.phone_e164). v5 (00583): '
  'those two branches gained the captured columns at all. v4 (00478): the '
  'client branch''s meta gains has_sent_proposal and issued_on_paper from '
  'designer_client_send_evidence(). 00594: the party branch''s consent word '
  'comes from the record, never the frozen seat column; 00626 moves the two '
  'consent DATES onto the record too (00594 §5.3). w1b final review r2: the '
  'party branch''s reach reads the IDENTITY''s field links rather than the '
  'winning seat''s (MAJOR-3), and the contacts branch''s consent word reduces '
  'worst-first over every number the identity carries (MAJOR-2). w1b final '
  'review r3: the PARTY branch''s consent word does the same — '
  'identity_consent_status() keyed on identity_key in a wrapper above the '
  'DISTINCT ON, replacing the winning seat''s own phone_e164, which printed '
  'one seat''s word over an identity holding two different numbers (tests '
  'MAJOR-1); and seat_count on the client, lead, maker and team branches is 0 '
  'rather than identity_seat_count() keyed on a PROFILE id, because person_id '
  'there is a designer_clients / leads / vendors / project_team_members id '
  'that people_directory_seats.person_id can never equal — the row claimed N '
  'seats and nested none (migrations MAJOR-1). w1b final review r4: '
  'paper_state asks BOTH holders through one formula, identity_paper_state() '
  '(MAJOR-2); the consent reduction''s number set is the gated definer '
  'identity_phone_numbers(), because an RLS-invisible seat dropped its refusal '
  'and softened the word (MAJOR-3); and the party branch''s two consent DATES '
  'come from identity_consent_evidence() — the record whose verdict won — '
  'instead of from the winning seat''s number (MAJOR-4). w1b final review r5: '
  'the party branch requires is_active_studio_member(project_consent_org('
  'project_id)) beside its three co-member legs, because seat visibility was '
  'satisfied by sharing any active org with the designer of record while the '
  'consent word is resolved at the project''s studio, and the COALESCE '
  'rendered an unreadable record as the affirmative word `not_asked` on a send '
  'door (MAJOR-1/MAJOR-3); identity_phone_numbers()'' seat leg is scoped to '
  'the studio it answers for, closing a cross-tenant phone-number oracle that '
  'answered over PostgREST (BLOCKING-1); and identity_consent_evidence()''s '
  'two dates are one-sided, so a folded refusal_unanswered can no longer put a '
  'dated consent claim beside a refusal (MAJOR-2).';

GRANT SELECT ON public.people_directory TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. people_directory_seats — E5, keyed by the same identity
-- ═══════════════════════════════════════════════════════════════════════════
-- person_id here is the identity's row in people_directory: the rolodex card
-- when the seat carries a stamp, otherwise the same winning party id the
-- Directory chose — the window below orders by the Directory's own candidate
-- set (unstamped, party_kind_in_directory()) first and then by its ORDER BY
-- verbatim, so the two computations cannot name different winners. So a UI
-- joining people_directory_seats.person_id = people_directory.person_id nests
-- every seat under exactly one row, and no Directory row ever claims a
-- seat_count it cannot nest.
--
-- EVERY party kind, not the Directory's seven: "where is this human seated" is
-- a different question from "who belongs in the six chips", and PR-c's
-- client_rep seat must appear under the household member's card. Two dangles
-- are therefore by design, and both are different from the winner divergence
-- r1 MAJOR-2 found:
--   · an identity with NO seat in the seven has no Directory row of its own
--     (an uncarded, loginless `vendor` or `other` party), so its seats list
--     here and join to nothing;
--   · a seat stamped with neither a rolodex card nor one of the seven kinds —
--     PR-c's client_rep seat carrying only the household member's LOGIN —
--     nests under its own party id, which the client/lead/maker/team branches
--     of people_directory do not carry, because their person_id is a
--     designer_clients / leads / vendors / project_team_members id. Those four
--     branches therefore report seat_count 0 rather than an
--     identity_seat_count() keyed on a profile id (r3 MAJOR-1, migrations
--     review): a row claims only what it can nest. Stamp such a seat with the
--     person's rolodex card and the identity moves to the CONTACTS branch,
--     where the count and the nesting are the same key.
CREATE OR REPLACE VIEW public.people_directory_seats
WITH (security_invoker = true) AS
SELECT
  public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                            pp.phone_e164, pp.email, pp.id)      AS identity_key,
  COALESCE(
    pp.studio_contact_id,
    first_value(pp.id) OVER (
      PARTITION BY public.party_identity_key(pp.studio_contact_id, pp.profile_id,
                                             pp.phone_e164, pp.email, pp.id)
      -- The Directory's candidate set, expressed as a preference: unstamped
      -- seats of the seven kinds first, then its own ORDER BY verbatim. Both
      -- views therefore name the same winner for the same identity even when
      -- the most recently updated seat is a kind the Directory does not emit
      -- (w1b final review r1 MAJOR-2).
      ORDER BY (pp.studio_contact_id IS NULL) DESC,
               public.party_kind_in_directory(pp.party_kind) DESC,
               pp.updated_at DESC, pp.id
    )
  )                                                              AS person_id,
  pp.id                                                          AS seat_id,
  pp.project_id                                                  AS project_id,
  pj.name                                                        AS project_name,
  pj.status::text                                                AS project_status,
  pj.designer_id                                                 AS designer_id,
  pp.party_kind                                                  AS party_kind,
  pp.display_name                                                AS display_name,
  pp.trade                                                       AS trade,
  pp.stage                                                       AS stage,
  pp.on_site_from                                                AS on_site_from,
  pp.on_site_to                                                  AS on_site_to,
  pp.site_access_mode                                            AS site_access_mode,
  pp.contracted_through                                          AS contracted_through,
  pp.company_id                                                  AS company_id,
  pp.company_name                                                AS company_name,
  pp.warranty_until                                              AS warranty_until,
  pp.warranty_contact_person_id                                  AS warranty_contact_person_id,
  pp.off_job_at                                                  AS off_job_at,
  pp.off_job_reason                                              AS off_job_reason,
  pp.show_to_client                                              AS show_to_client,
  pp.studio_contact_id                                           AS studio_contact_id,
  pp.phone_e164                                                  AS phone_e164,
  COALESCE(public.channel_consent_status(
    public.project_consent_org(pp.project_id),
    'sms', pp.phone_e164), 'not_asked')                          AS consent_status,
  public.reach_state_for(pp.profile_id, NULL, pp.id)             AS reach_state,
  -- the stamped card's OWN paper AND the seat's firm, worst-first (r4
  -- MAJOR-2): it was COALESCE(company_id, studio_contact_id), so a person-held
  -- lapse never reached a seat line for anyone who carries a firm.
  public.identity_paper_state(pp.studio_contact_id, pp.company_id) AS paper_state,
  public.contact_rule_summary('engagement', pp.id)               AS contact_rule_summary,
  pp.updated_at                                                  AS updated_at,
  (CASE
     WHEN pj.designer_id      = (select auth.uid())
       OR pj.lead_designer_id = (select auth.uid())
       OR pj.created_by       = (select auth.uid())
     THEN 'mine' ELSE 'studio'
   END)::text                                                    AS scope
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
-- TENANT FIRST, then the designer (w1b final review r5 MAJOR-1/MAJOR-3).
-- is_studio_comember(designer) is true whenever the caller shares ANY active
-- organization with the designer of record, so an outside designer who also
-- works for a second studio handed every member of that second studio all 31
-- of this studio's seat rows — and consent_status below COALESCEs the
-- unreadable record to `not_asked`, so each of them read the affirmative word
-- over records that say opted_out. The word is resolved at
-- project_consent_org(project_id); the seat is visible to that studio's own
-- active members.
WHERE public.is_active_studio_member(public.project_consent_org(pp.project_id))
  AND ( public.is_studio_comember(pj.designer_id)
     OR public.is_studio_comember(pj.lead_designer_id)
     OR public.is_studio_comember(pj.created_by) );

COMMENT ON VIEW public.people_directory_seats IS
  'E5 on its own surface: one row per project_parties SEAT, keyed by '
  'party_identity_key() and carrying person_id = the identity''s row in '
  'people_directory (the rolodex card when the seat is stamped, else the same '
  'party the Directory chose — the window orders by the Directory''s own '
  'candidate set, unstamped seats of party_kind_in_directory() first, then by '
  'updated_at DESC, id, so one identity can only have one winner). Nest seats '
  'under a Directory row by joining on person_id. '
  'Admits EVERY party kind, unlike people_directory''s seven, because "where '
  'is this human seated" is a different question from "who is in the six '
  'chips" and PR-c''s client_rep seat must appear under the household '
  'member''s card. consent_status is the RECORD''s verdict (R-AY); paper_state '
  'is identity_paper_state(stamped card, firm) — the person''s own paper AND '
  'the seat''s firm, worst-first, since r4 MAJOR-2 found a person-held lapse '
  'invisible behind COALESCE for everyone who carries a firm; both degrade to '
  'the caller''s '
  'own RLS. Stage, the window, the access mode and the warranty are the seat''s '
  'own facts (00624) and PR-p says they print HERE, never as a person-level '
  'column. TENANT-SCOPED: is_active_studio_member(project_consent_org('
  'project_id)) is required beside the three co-member legs, because '
  'is_studio_comember(designer) is true whenever the caller shares ANY active '
  'organization with the designer of record — an outside designer working for '
  'two studios handed every member of the second studio all of the first '
  'studio''s seat rows, each reading the COALESCEd `not_asked` over records '
  'that say opted_out (w1b final review r5 MAJOR-1/MAJOR-3) (00626).';

REVOKE ALL ON TABLE public.people_directory_seats FROM PUBLIC, anon;
GRANT SELECT ON public.people_directory_seats TO authenticated;
GRANT SELECT ON public.people_directory_seats TO service_role;
