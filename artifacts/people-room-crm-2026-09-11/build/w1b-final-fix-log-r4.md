# W1b — final-run round 4 fix log

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of
any kind: no `supabase db push`, no `supabase functions deploy`, no `supabase link`, no Strata
connection, no read of a Strata credential.** `apps/designer-portal/.env.local` does not exist in
this worktree (`ls` → `No such file or directory (os error 2)`), so nothing in it can point at
Strata — the destructive-local guard is satisfied by absence, as r2/r3 also found. Sole owner of
the local database, checked before resetting: no non-infrastructure session.

Scope: exactly the four findings handed over — r4 migrations-review MAJOR-1, MAJOR-2, MAJOR-3 and
MAJOR-4. Every open MINOR (r2/r3's carried set plus r4's MINOR-31…MINOR-35) is untouched and still
open, **except** carried MINOR-11 ("three formulas for the paper word"), which MAJOR-2's fix closes
because it is the same defect stated as a smell — the finding says so explicitly.

**R-AW / R-AY held throughout.** No consent write is added anywhere; no frozen
`project_parties.sms_consent_*` column is read by any function or view of this wave (machine-checked
below); every consent VERDICT still resolves through `studio_channel_consent` via
`channel_consent_status()`. MAJOR-3's fix reads seats for their **`phone_e164` only** — a number
set, never a verdict — which is the same read `identity_consent_status()` has made since r2
MAJOR-2, now made authoritative rather than RLS-filtered. No seat consent column is reintroduced.

Migration numbers: 00595–00620 untouched; 00621/00622 pre-existed; W1b's files remain exactly
00623–00627. Both edits are **in place** in files unapplied on Strata, which the migration rules
allow. Grep-winner check before redefining anything:

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*assert_compliance_holder" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00623_studio_compliance_documents.sql
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*compliance_state" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00623_studio_compliance_documents.sql
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*identity_consent_status" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00626_people_directory_v4_seats.sql
$ grep -rln "CREATE OR REPLACE VIEW[^(]*people_directory\b" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00626_people_directory_v4_seats.sql
$ grep -rln "CREATE OR REPLACE VIEW[^(]*people_directory_seats" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00626_people_directory_v4_seats.sql
```

The winner is the file being edited in each case, so there is nothing to graft from — the fix is
applied to the latest body. `identity_paper_state`, `identity_phone_numbers` and
`identity_consent_evidence` are new in 00626 and the grep names only that file.

---

## MAJOR-1 — the FOURTH supersede door: an undated successor retiring a dated, gating lapse for the four non-dated types

**FIXED.** `supabase/migrations/00623_studio_compliance_documents.sql`.

Both successor legs stop enumerating `doc_type` and key on the **paper's own date**, exactly as the
finding prescribes:

```sql
-- :353 (was: NEW.doc_type IN ('coi_gl','coi_wc','coi_auto','license','bond') AND v_succ_expires IS NULL)
IF NEW.expires_on IS NOT NULL AND v_succ_expires IS NULL THEN
  RAISE EXCEPTION 'compliance_successor_undated' …

-- :414 (was: NEW.doc_type IN (…five…) AND v_succ_expires < CURRENT_DATE)
IF v_succ_expires IS NOT NULL AND v_succ_expires < CURRENT_DATE THEN
  RAISE EXCEPTION 'compliance_successor_already_lapsed' …
```

One rule now covers all nine types and no vocabulary has to be kept in step. The reasoning the code
states: only a **dated** row can ever read `lapsed` (`compliance_state()` counts
`expires_on IS NOT NULL` on both date FILTERs), so a dated row may only be retired by a dated one,
and the in-force test applies whenever the successor carries a date at all. An undated row retired
by another undated one stays legitimate — it hides nothing, because neither can lapse.

`compliance_successor_not_later`'s HINT is corrected with it: it promised the undated exemption "for
a type that has no expiry at all", which is precisely the sentence that was the door.

**The CHECK (`studio_compliance_documents_dated_expiry_check`, :169-172) deliberately keeps its
five-type list.** It answers a different question — which types MUST carry a date when recorded —
and `w9` / both lien waivers / `other_named` legitimately may not. The finding's fix names only the
two successor legs; the banner now says why the CHECK is not touched.

**Walked, with the reviewer's own probe, unchanged** (`probe93-w1b-final-r4-nondated-supersede.sql`
— the act that read `word_before=lapsed → word_after=current`):

```
=== word BEFORE, on the record the studio holds ===   lapsed
 acting_as = a0000000-…-0003   is_member = t
=== ACT 1: record an UNDATED successor of the same non-dated type, gates carried ===   INSERT 0 1
=== ACT 2: retire the expired gating waiver with it ===
ERROR:  compliance_successor_undated
HINT:  A DATED paper may only be retired by a dated one: this row carries an expires_on, so its
       renewal must carry its own. … whatever the doc_type. An undated paper may still be retired
       by another undated one.
```

The launder is refused at ACT 2, so there is no `word_after` to print; the expired
`lien_waiver_conditional` still holds the card.

**Test legs added** (`supabase/tests/people/w1b_compliance_authority_directory_test.sql`, block 2):

- `2h` **rewritten**: it used to assert the exemption as a feature ("an undated successor of the
  same paper is open-ended and qualifies") over a `w9` that expired yesterday gating `payment` —
  i.e. it asserted the defect. It now expects `compliance_successor_undated`.
- `2h1`: the honest open-ended case still lands — an undated paper retired by another undated one.
- `2r0`–`2r4`, **one leg per non-dated type** (`w9`, `lien_waiver_conditional`,
  `lien_waiver_unconditional`, `other_named`), beside `2p`/`2q` as asked: the card starts `lapsed`
  on a dated gating paper, an undated successor carrying the gates is refused
  (`compliance_successor_undated`) and the word does not move; an expired dated successor is refused
  (`compliance_successor_already_lapsed`); a dated, in-force successor carrying the gates **lands**
  and the word moves honestly to `current`; the card is cleared between types.

Block 2's NOTICE now states the rule as "for ALL NINE types, keyed on the paper's own date and not
on a vocabulary".

---

## MAJOR-2 — a person's OWN gating lapse invisible on every reader whenever they carry a firm

**FIXED.** `supabase/migrations/00626_people_directory_v4_seats.sql`.

New `public.identity_paper_state(p_card_id uuid, p_company_id uuid)` — the
`identity_consent_status()` sibling the finding asks for — reduces `compliance_state()` over **both
holders**, worst-first, and is called from all three sites:

```
:966   party branch    public.identity_paper_state(q.studio_contact_id, q.company_id)
:1134  contacts branch public.identity_paper_state(sc.id, sc.company_id)        (was COALESCE(sc.company_id, sc.id))
:1277  seats view      public.identity_paper_state(pp.studio_contact_id, pp.company_id)
                                                        (was COALESCE(pp.company_id, pp.studio_contact_id))
```

Order: `lapsed` → `lapses_soon` → `current` → `not_on_file`. `not_on_file` is last on purpose and
the code says why: it is the **weakest** claim, not the worst one, so a person holding no personal
paper must not drag their firm's `current` down to `not_on_file` (C21/R-K — no paper is a different
fact from a lapse). A firm card passes itself as the card and answers with its own paper.
SECURITY INVOKER, `search_path` pinned, `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated,
service_role`, `COMMENT` naming the finding. This closes carried **MINOR-11** (three formulas for
one word) with it.

**Walked, with the reviewer's own probe** (`probe94-w1b-final-r4-person-held-paper.sql`), as a plain
member (`member=t admin=f`), on the seeded fixture:

```
=== B0: Luis Ochoa, as the shipped readers print him today ===
 Luis Ochoa | current | 1              Luis Ochoa | Okonkwo residence | current
=== B1: the honest act — the OSHA card expired last month ===
 Luis Ochoa | lapsed                   Luis Ochoa | Okonkwo residence | lapsed     ← both readers
=== B2: the launder — an UNDATED other_named successor carrying the same gate ===
ERROR:  compliance_successor_undated                                              ← MAJOR-1 too
```

Before the fix B1 printed `current` on both lines over `compliance_state(his card)='lapsed'`.

**No fixture word moved** (`probe103` §D, over all 49 contact rows as the studio owner):

```
 contact_rows | rows_the_old_formula_would_differ_on | rows_disagreeing_with_hand_worst_first
           49 |                                    0 |                                      0
```

and the four fixture words the suite and `fixture.md` name are unchanged
(`Dana Kowalski field_link/granted/lapsed/2`, `Pete Rusk on_paper/opted_out/current/2`,
`Amara Osei on_paper/granted/lapses_soon/1`, `Ray Thao on_paper/not_asked/not_on_file/1`).

**Test legs added** (block 3, `3u`–`3v4`), which is the leg the finding asks for plus its controls:
a person with a **current firm and a lapsed personal card** reads `lapsed` on the Directory row
(`3v`) and on the seat line (`3v1`); a person on the same firm holding **no** personal paper still
reads the firm's `current` (`3v2`, `3v3`) — the regression guard in the other direction; the firm's
own row reads its own paper (`3v4`). Block 3's NOTICE names the new rule.

---

## MAJOR-3 — `identity_consent_status()` failed OPEN: an invisible seat softened the printed word

**FIXED.** `supabase/migrations/00626_people_directory_v4_seats.sql`.

The number set is lifted into new `public.identity_phone_numbers(p_organization_id, p_identity_key,
p_card_phone_e164) RETURNS SETOF text` — **SECURITY DEFINER**, `search_path=public`, and **gated on
`public.is_active_studio_member(p_organization_id)`** on both legs of its `UNION`, which is the
finding's first option (00594's `channel_consent_status()` posture, stated as a predicate) and the
same population the contacts branch's own `WHERE` clause already requires. A non-member gets no
numbers, so the word degrades to NULL / `not_asked` rather than to a foreign studio's verdict.

`identity_consent_status()` itself **stays SECURITY INVOKER** and now reads:

```sql
WITH verdicts AS (
  SELECT COALESCE(public.channel_consent_status(p_organization_id, 'sms', n.v), 'not_asked') AS word
    FROM public.identity_phone_numbers(p_organization_id, p_identity_key, p_card_phone_e164) AS n(v)
)
```

so the definer surface is a **list of numbers, not a consent word**: the record is still read under
the caller's own member RLS on `studio_channel_consent`, and no new consent oracle is created (the
finding's concern, and MINOR-12's). `w1a` leg 37c3 — `identity_consent_status`'s body must reach the
record — still holds: `reaches_the_record=t`, and `uses_the_gated_number_set=t` (`probe103` §B2).

Why the seat scan is **not** additionally narrowed to `p_organization_id`, stated in the code: for a
carded human the identity key is the studio-scoped card id, so the contacts branch can only collect
its own studio's seats; for an **uncarded** identity keyed on a login, a phone or an email, a seat in
another studio does contribute its number — and because every verdict is still resolved at
`p_organization_id` (R-AK), such a number can only add `not_asked` and make the word **more**
restrictive, never borrow a foreign `granted`. Narrowing it would *remove* numbers, which is the
softening direction this finding is about; it would also have re-opened r3 tests MAJOR-1's own test
leg `4e8`, whose refusal sits on a seat in a different studio from the winning seat.

**Walked, with the reviewer's own probe** (`probe95-w1b-final-r4-rls-softened-consent.sql`):

```
=== F1: the record ===              +16125559001 granted · +16125559002 opted_out
=== F2: while the leaver is still a member ===   Two Line Trade | opted_out | 1
=== F3: the leaver leaves the studio ===         UPDATE 1
=== F4: what the owner now reads ===
  display_name  | consent_status | reach_state | seat_count
 Two Line Trade | opted_out      | on_paper    |          0     ← was `granted` before the fix
 (0 rows)                                                        ← the seat line is still invisible
=== F5: the record itself ===        +16125559002 opted_out · record_verdict = opted_out
```

The reader now agrees with the record even though the seat that carries the refused number is
outside the caller's visibility (`seat_count 0`, no seat line) — which is exactly what "as
authoritative as the verdict it reduces" means.

**Cross-tenant and anon, as a genuine foreign studio's owner**
(`probe104-w1b-r4-cross-tenant-foreign-owner.sql`; `probe103` §E2):

```
 acting_as cf100000-…-0001 (owner of cf120000-…-0001) · member_of_the_seed_studio = f
 numbers_pulled 0 | consent_word (null) | paper_word not_on_file | evidence_rows 0
 directory_rows_visible 0 | seat_rows_visible 0
 own_studio_card_number_echoed 1            ← the gate discriminates, it is not a wall
 anon identity_phone_numbers    -> permission denied for function identity_phone_numbers
 anon identity_consent_evidence -> permission denied for function identity_consent_evidence
 anon identity_paper_state      -> permission denied for function identity_paper_state
```

**Test legs added** (block 3, `3w`–`3x2`), the leg the finding asks for: a card whose office line is
granted and whose mobile said STOP, the mobile carried **only** by a seat on a job whose designer of
record then goes `organization_members.status='removed'`. The suite asserts the word is `opted_out`
while the seat is visible (`3w`), that the seat really is invisible afterwards
(`people_directory_seats` 0 rows, `seat_count` 0 — otherwise the leg proves nothing: `3w1`, `3w2`),
that the word is **still** `opted_out` (`3x`), that the record did not move (`3x1`), and that a
non-member of the studio still reads no word at all through the definer number set (`3x2`).

---

## MAJOR-4 — the party branch's consent WORD and its two DATES came off different numbers

**FIXED.** `supabase/migrations/00626_people_directory_v4_seats.sql`.

New `public.identity_consent_evidence(p_organization_id, p_identity_key, p_card_phone_e164)
RETURNS TABLE (channel_value, consented_at, opt_out_at)` — the finding's "sibling
`identity_consent_evidence()`" option — returns the dates of the record whose verdict **won** the
reduction, at most one row:

```sql
  SELECT scc.channel_value, scc.consented_at, scc.opt_out_at
    FROM public.identity_phone_numbers(…) AS n(v)
    JOIN public.studio_channel_consent scc ON … scc.channel_value = n.v
   WHERE public.channel_consent_status(p_organization_id, 'sms', n.v)
         IS NOT DISTINCT FROM public.identity_consent_status(…)
   ORDER BY scc.updated_at DESC, scc.channel_value
   LIMIT 1;
```

It restates **no** rule: the winning word is `identity_consent_status()`'s, each number's verdict is
`channel_consent_status()`'s (R-AS/R-AY — one home for the fold), the number set is
`identity_phone_numbers()`'s. The `ORDER BY` only breaks a tie between records that carry the same
winning word. When the word is `not_asked` because a number has **no** record, it returns no row and
both dates are NULL, so the room falls back to R-V's "no record" line rather than printing a date it
cannot source.

The party branch's `LEFT JOIN studio_channel_consent … ON scc.channel_value = pp.phone_e164` inside
the `DISTINCT ON` subquery is **removed**, and the wrapper that already carries the identity's word
gains one `LEFT JOIN LATERAL`:

```sql
  SELECT q0.*,
         COALESCE(public.identity_consent_status(project_consent_org(q0.project_id),
                                                 q0.identity_key, NULL), 'not_asked') AS consent_word,
         ev.consented_at AS record_consented_at,
         ev.opt_out_at   AS record_opt_out_at
    FROM ( …DISTINCT ON… ) q0
    LEFT JOIN LATERAL public.identity_consent_evidence(
      public.project_consent_org(q0.project_id), q0.identity_key, NULL) ev ON true
```

The projected names `meta.sms_consented_at` / `meta.sms_opt_out_at` are unchanged, so no reader's
shape moves; only their source does. Evaluated once per emitted identity, like the word.

**Walked, with the reviewer's own probe** (`probe96-w1b-final-r4-word-date-split.sql`):

```
=== K1: the one Directory row — its word, and the two dates it carries ===
 display_name  | consent_status | winning_number |      consented_at      |        opt_out_at
 Two Num Trade | opted_out      | +16125559102   |  (null)                | 2025-12-03T00:00:00+00
=== K2: the record, per number ===
 +16125559101 | opted_out |            | 2025-12-03
 +16125559102 | granted   | 2025-05-02 |
```

Before the fix this row read `consented_at 2025-05-02, opt_out_at (null)` beside `opted_out`, so
R-Q's fixed sentence composed "Written consent, 2 May 2025" for a human the record refuses. It now
composes "Opted out by text, 3 Dec 2025" — the refusal's own date, off the record that decided the
word.

**Test legs added** (block 4, `4e12`–`4e17`), beside `4e6`–`4e11` as asked. They run **after**
`4e11` so that leg's premise (the winning seat's number carries no record) still holds, then give
the winning seat's number a dated grant (2025-05-02) and the older seat's number the dated refusal
(2025-12-03) — the reviewer's exact shape: the word stays `opted_out` (`4e12`), `sms_opt_out_at` is
the refusal's own date (`4e13`), `sms_consented_at` is NULL rather than the other number's grant
(`4e14`); then the refusal is lifted and the row reads `granted` (`4e15`) carrying one of the
identity's own grant dates (`4e16`) and no opt-out date (`4e17`). Block 4's NOTICE names the rule.

---

## Verification

Legacy grants regenerated **after** the new GRANT/REVOKEs (four new functions):

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2713 replayed statements   (was 2707)
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
36  0   supabase/seed/00-legacy-grants.sql        # identity_paper_state, identity_phone_numbers,
                                                  # identity_consent_evidence REVOKE+GRANT pairs
```

Replay / idempotency — both changed files applied **twice** inside one rolled-back transaction:

```
$ psql … -v ON_ERROR_STOP=1 -f <00623,00626,00623,00626 concatenated>
REPLAY_EXIT=0            # no ERROR line; only "already exists, skipping" notices
```

Reset, twice, and the ledger head:

```
$ pnpm --dir …/agent-people-build supabase:reset     RESET1_EXIT=0
$ pnpm --dir …/agent-people-build supabase:reset     RESET2_EXIT=0
  grep -in error <log> | grep -vi _error   → (nothing)
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111 00627 00626 00625 00624 00623
```

(`supabase:reset` and `db:generate` need the sandbox disabled — `~/.supabase/telemetry.json` and the
Docker socket. Filesystem refusals, never SQL.)

Both people suites, and every shipped suite that touches the changed objects:

```
people/w1b_compliance_authority_directory_test   exit=0   # 12 blocks, all passed, new legs included
people/w1a_identity_channels_consent_test        exit=0   # All W1a assertions passed (37c3 included)
field/field_links_test                           exit=0
rls/project_roster_test                          exit=0
rls/sms_tables_test                              exit=0
rls/studio_contacts_backfill_test                exit=0
document/lead_contact_phone_test                 exit=0
rls/00584_studio_comember_rls_sweep.test         exit=0
rls/field_parties_test                           exit=3  ERROR: consent_legacy_column_frozen
rls/people_directory_scope_test                  exit=3  ERROR: FAIL a2: expected exactly 12 columns, got 17
site_requests/security_and_lifecycle_test        exit=3  ERROR: send must transition not_asked consent to pending
commercial/trade_rfq_test                        exit=3  ERROR: design services agreement d9300000-… not found
```

The same four reds, with the same messages, as r3 and r4 measured — MINOR-27 and MINOR-28, both
still open and out of this round's scope. No new red.

Generated types and type-checks:

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
24  0     # three new Functions entries only: identity_consent_evidence, identity_paper_state,
          # identity_phone_numbers. No row shape changed, no column added or reordered.
$ pnpm --dir … --filter @patina/supabase type-check        SUPABASE_TC_EXIT=0
$ pnpm --dir … --filter @patina/designer-portal type-check DESIGNER_TC_EXIT=0
```

Fix controls, run as the studio owner through ordinary RLS
(`probe103-w1b-r4-fix-controls.sql` / `.out`):

```
A   identity_consent_evidence  definer=f  stable  search_path=public
    identity_consent_status    definer=f  stable  search_path=public
    identity_paper_state       definer=f  stable  search_path=public
    identity_phone_numbers     definer=t  stable  search_path=public
A2  all four: anon=f  authenticated=t  service_role=t
B   functions_reading_a_frozen_consent_column = 0
    views_reading_the_frozen_seat_verdict     = 0        ← R-AW / R-AY
C   carded_rows_compared 49 | rows_where_the_word_diverges 0
      (recomputed off studio_channel_consent with NO Patina function in the path)
D   contact_rows 49 | rows_the_old_formula_would_differ_on 0
                    | rows_disagreeing_with_hand_worst_first 0
F   directory_rows 62 | seat_rows 31 | directory_columns 17
    rows_claiming_a_count_they_cannot_nest 0
```

Cost, warm, as the owner: `select * from people_directory` 8.5 ms over 62 rows (18.7 ms cold),
`people_directory_seats` 3.0 ms over 31 — the LATERAL and the definer number set are evaluated once
per emitted identity, not once per candidate seat.

## What this round did NOT touch

- Every MINOR from r2/r3/r4 stays open, with one exception: carried MINOR-11 is closed by MAJOR-2's
  single formula, because the finding names it as the same defect. MINOR-27 (one line, `12` → `17`)
  and MINOR-28's reds are still red; MINOR-31…MINOR-35 (including `w1b-report.md` being four fix
  rounds stale) are untouched.
- No portal, hook or component file. `party-profile-sheet.tsx` is named in MAJOR-3 as the misled
  reader; the word it reads is now honest, and no TypeScript changed.
- No ruling reopened. R-AW/R-AY, R-AK, R-Q, R-V, PR-h, PR-n, PR-p, PR-r, PR-w are all as they were.
