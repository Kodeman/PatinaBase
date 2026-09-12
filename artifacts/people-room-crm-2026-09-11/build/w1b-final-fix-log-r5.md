# W1b — final-run round 5 fix log

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of
any kind: no `supabase db push`, no `supabase functions deploy`, no `supabase link`, no Strata
connection, no read of a Strata credential.**

```
$ ls .../agent-people-build/apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
$ psql … -At -c "select current_database(), inet_server_addr(), inet_server_port();"
postgres|172.18.0.2|5432          # the local supabase container, not Strata
```

The destructive-local guard is satisfied by absence, as r2/r3/r4/r5 also found. Sole owner of the
local database for the duration.

Scope: exactly the four findings handed over — r5 **BLOCKING-1**, **MAJOR-1**, **MAJOR-2**,
**MAJOR-3** — plus the two test legs those findings name as owed (BLOCKING-1's re-statement of
suite leg `4e8` and MINOR-39's missing gate leg; MAJOR-2's leg over a `granted` +
`refusal_unanswered` record). **Every open MINOR is untouched and still open**, MINOR-27 and
MINOR-33 included: nothing else in the five migrations, the seed, `w1b-report.md` or any other
suite was edited.

**R-AW / R-AY held throughout, and the record-only rule is what BLOCKING-1's fix rests on.** No
consent write is added anywhere; no seat consent read is reintroduced. Machine-checked after the
edits:

```
$ grep -nE "INSERT INTO public.studio_channel_consent|UPDATE public.studio_channel_consent|record_channel_consent" supabase/migrations/0062[3-7]*.sql
(nothing)
$ grep -nE "sms_consent_status|sms_consented_at|sms_opt_out_at|sms_consent_source|sms_consent_evidence" supabase/migrations/00626_people_directory_v4_seats.sql | grep -v "'sms_consent" | grep -v "^.*--"
(nothing — every remaining hit is a jsonb KEY name in meta, never a project_parties column read)
```

`identity_phone_numbers()` still reads seats for their **`phone_e164` only** — a number set, never
a verdict — and the fix *narrows* that read rather than widening it. Every verdict still resolves
through `studio_channel_consent` via `channel_consent_status()`, at one studio (R-AK).

Measured against the applied views, not only the source:

```
$ … select definition from pg_views where viewname='people_directory'
      | grep -o "[a-z_0-9]*\.sms_consent[a-z_]*\|[a-z_0-9]*\.sms_opt_out_at\|[a-z_0-9]*\.sms_consented_at"
(nothing)                       # same for people_directory_seats
```

`people_directory` matches a naive `definition ~ 'sms_consent'` search only on the jsonb KEY
literals `'sms_consent_status'` / `'sms_consented_at'` / `'sms_opt_out_at'` in `meta`; there is no
`pp.sms_*` column reference in either view. `v_project_roster` still reads the frozen columns and
is the pre-existing debt `w1b-report.md` §8 already owes W2 — unchanged by this round. The freeze
trigger's ten-column list is byte-identical:

```
refuse_legacy_consent_write_trg → phone, phone_e164, sms_consent_disclosure_version,
  sms_consent_evidence, sms_consent_recorded_at, sms_consent_recorded_by, sms_consent_source,
  sms_consent_status, sms_consented_at, sms_opt_out_at
```

Migration numbers: 00595–00620 untouched and reserved; 00621/00622 pre-existed on this branch;
W1b's files remain exactly **00623–00627**. Every edit is **in place** in a file unapplied on
Strata, which the migration rules allow. Grep-winner check before redefining anything:

```
$ for f in identity_phone_numbers identity_consent_status identity_consent_evidence \
           people_directory people_directory_seats project_consent_org project_party_org \
           project_designer is_active_studio_member; do
    grep -rln "CREATE OR REPLACE \(FUNCTION\|VIEW\)[^(]*\b$f\b" supabase/migrations/*.sql | sort | tail -1
  done
identity_phone_numbers      -> supabase/migrations/00626_people_directory_v4_seats.sql   ← the file edited
identity_consent_status     -> supabase/migrations/00626_people_directory_v4_seats.sql   ← the file edited
identity_consent_evidence   -> supabase/migrations/00626_people_directory_v4_seats.sql   ← the file edited
people_directory            -> supabase/migrations/00626_people_directory_v4_seats.sql   ← the file edited
people_directory_seats      -> supabase/migrations/00626_people_directory_v4_seats.sql   ← the file edited
project_consent_org         -> supabase/migrations/00594_studio_channel_consent.sql      ← CALLED, not redefined
project_party_org           -> supabase/migrations/00624_project_party_window_and_authority.sql ← CALLED
project_designer            -> supabase/migrations/00625_project_site_access_cards.sql   ← CALLED
is_active_studio_member     -> supabase/migrations/00417_studio_contacts.sql             ← CALLED
```

No function body was grafted from another file; every redefinition is the edited file's own body.
**No GRANT or REVOKE changed** — `python3 scripts/generate-legacy-grants.py` reports no drift
(§5.1), so `seed/00-legacy-grants.sql` is unchanged.

---

## BLOCKING-1 — `identity_phone_numbers()` was a cross-tenant phone-number oracle over the public REST API

**File:** `supabase/migrations/00626_people_directory_v4_seats.sql` (the function's body, banner and
`COMMENT`).

Fable's fix instruction offered two doors and named the first as primary: scope the seat leg to the
studio it answers for, re-stating suite leg `4e8`; or keep the scan wide and revoke EXECUTE from
`authenticated`. **The first is taken.** The second keeps a defect in the source rule and can only
work by accident: both views are `security_invoker`, so PostgreSQL checks function EXECUTE against
the *invoking* user, and revoking it from `authenticated` would take the views down with the RPC.
Scoping is also what R-AK already says: a verdict is the resolving studio's own, so the number set
that feeds it must be too.

```sql
     WHERE public.is_active_studio_member(p_organization_id)
       AND p_identity_key IS NOT NULL
+      AND public.project_consent_org(pj.id) = p_organization_id
       AND public.party_identity_key(…) = p_identity_key
```

with `JOIN public.projects pj ON pj.id = pp.project_id` added to the seat leg. The gate on
`is_active_studio_member(p_organization_id)` stays: it proves the caller belongs to the studio
being answered for, and the new predicate proves the ROWS do.

**Evidence — the reviewer's own probe, replayed byte-for-byte** (it hard-codes only ids the seed
mints deterministically, so it replays; `probe105-r5fix-rerun.out`). Acting as
`cf100000-…-0001`, owner of Phase One Synthetic Studio and of nothing else:

```
              acting_as               | member_of_my_own_studio | member_of_the_victim_studio
 cf100000-0000-4000-8000-000000000001 | t                       | f

=== THE LEAK: my own org id + a FOREIGN identity key (a login) ===
 identity_phone_numbers
------------------------
(0 rows)                                  ← was +16125559871

=== THE LEAK: my own org id + a FOREIGN rolodex card uuid ===
 which | v
-------+---
(0 rows)                                  ← was Adaeze Okonkwo +16125550104, Amara Osei +16125550116

=== the existence oracle on a guessed number ===
 a number seated in the victim studio (+16125550219) |    0     ← was 1
 a number seated nowhere (+19995550000)              |    0

=== the CONTROL the r4 round ran, which passes: the victim org id refuses ===
 numbers_when_i_name_the_victim_org                  |    0

=== and the consent WORD does not leak ===
 consent_word_at_my_own_org                          | (null)
```

**And over the public API**, the same probe the finding was written from
(`probe106-w1b-final-r5-postgrest-cross-tenant.py`, unchanged, locally minted HS256 JWT for the
same user; `probe106-r5fix-rerun.out`):

```
a FOREIGN rolodex card (Adaeze Okonkwo)       -> HTTP 200 []      ← was HTTP 200 ["+16125550104"]
a FOREIGN rolodex card (Amara Osei)           -> HTTP 200 []      ← was HTTP 200 ["+16125550116"]
GET people_directory             -> HTTP 200 []
GET people_directory_seats       -> HTTP 200 []
GET project_site_access_cards    -> HTTP 200 []
```

The function's posture is otherwise unchanged and still correct:

```
 proname                   | definer | proconfig            | auth_exec | anon_exec
 identity_phone_numbers    | t       | {search_path=public} | t         | f
 identity_consent_status   | f       | {search_path=public} | t         | f
 identity_consent_evidence | f       | {search_path=public} | t         | f
```

### The two test legs BLOCKING-1's fix owes

**`4e8`, re-stated intra-studio.** Its premise — a refusal recorded at the seeded studio on a
number only a *Test Studio A* seat carried — was constructible only through the hole, exactly as
the finding says, and the leg failed on the first run after the fix:

```
ERROR:  4e8 a refusal on a NON-winning seat's number must be the identity's word, got not_asked
```

The two seats now both sit in the seeded studio — the older on **Lindqvist**
(`d0e00000-…-000b`) instead of the Test Studio A project, the winner still on **Okonkwo**
(`d0e00000-…-000a`), both resolving to `b0000000-…-0001` — so the r3 defect the leg exists for
(two numbers on one login-keyed identity, the refusal on the NON-winning one) is unchanged while
the premise is honest. `4e6`, `4e7`, `4e9`–`4e17` are untouched and still pass.

**`4e8b`, new: the closed door.** A seat in Test Studio A carrying `+16125550773`, with a refusal
for that number recorded at the seeded studio, asserts four things: the record says `opted_out`
(`4e8b0`), the seat's project does *not* resolve to the seeded studio (`4e8b1`), the seeded
studio's number set does not reach it (`4e8b2`), and the studio that **does** hold the seat still
sees its number (`4e8b3` — the fix narrows, it does not break the leg's own tenant).

**MINOR-39's missing gate leg** is `13j`–`13n1` in the new block 13 (below): it names the
**caller's own** org with a **foreign** identity key, which is the call the suite never made — leg
`3x2` only ever named the victim's org, which the gate already refused, which is why two review
rounds' probes could not see this. A pointer comment now says so beside `3x2`, because the leg
needs a caller who holds a studio of their own and no actor in block 3 has one.

---

## MAJOR-1 — the consent word failed OPEN at two call sites

**File:** `supabase/migrations/00626_people_directory_v4_seats.sql` (the Directory's party branch
`WHERE`, and `people_directory_seats`' `WHERE`).

Option **(b)** taken — the one the finding says "also closes MAJOR-3". Dropping the two COALESCEs
(option a) would have left the seat visible to a caller who cannot source its word, and would have
changed the party branch's shipped contract that `status_raw` and `meta.sms_consent_status` always
carry a word (00594's own rule, R-V's NULL is the contacts branch's). The tenant conjunct instead
makes the two sets agree: the caller who sees the seat is the caller who can read the record.

```sql
-- the Directory's party branch (q0)
   WHERE public.party_kind_in_directory(pp.party_kind)
     AND pp.studio_contact_id IS NULL
+    AND public.is_active_studio_member(public.project_consent_org(pp.project_id))
     AND ( public.is_studio_comember(pj.designer_id) OR … )

-- people_directory_seats
-WHERE public.is_studio_comember(pj.designer_id)
-   OR public.is_studio_comember(pj.lead_designer_id)
-   OR public.is_studio_comember(pj.created_by);
+WHERE public.is_active_studio_member(public.project_consent_org(pp.project_id))
+  AND ( public.is_studio_comember(pj.designer_id)
+     OR public.is_studio_comember(pj.lead_designer_id)
+     OR public.is_studio_comember(pj.created_by) );
```

**Evidence.** The reviewer's `probe107` hard-codes `e1c06557-8536-421a-8a10-83e7ce8c22ab` for the
second studio `designer@patina.dev` belongs to, and that org id is minted at seed time — this run
it is `72e10110-e64e-46d1-a3db-906bd627795b` ("Leah Hartwell") — so `probe107` and `probe109` both
abort on a foreign-key violation and cannot replay. `probe116-w1b-final-r5-fix-negative-control.sql`
walks the identical shape with the org resolved at runtime
(`probe116-w1b-final-r5-fix-negative-control.out`):

```
=== the side studio this run resolved (minted at seed time) ===
 72e10110-e64e-46d1-a3db-906bd627795b | Leah Hartwell

=== the records, as postgres ===
 b0000000-…-0001 | +16125550112 | opted_out | verdict opted_out
 b0000000-…-0001 | +16125550219 | opted_out | verdict opted_out

=== the side-studio member ===
 comember_of_the_designer t | member_of_local_dev_studio f

=== MAJOR-1: the seat rows they read of Local Dev Studio (was 31) ===
 seat_rows_they_read           0
 party_branch_directory_rows  11        ← their OWN studio's rows; see below
 display_name | phone_e164 | consent_status
 (0 rows)                               ← was Pete Rusk +16125550112 not_asked ×2,
                                          Rivera Finishes +16125550219 not_asked
```

Those 11 party-branch rows are **not** a residue of the leak: broken down by role they are
`client 6 / lead 5`, every one with `project_id IS NULL`, from the side studio's own
`designer_clients` and `leads` — branches this wave never touched. The party branch itself returns
**zero** rows of the seeded studio to that caller.

```
$ … as the side-studio member
  role  | count | with_project
 client |     6 |            0
 lead   |     5 |            0
```

**The positive control**, in the same probe: the seeded studio's owner still reads all of it, and
reads the refusal honestly — which is precisely what the softened word hid.

```
 people_directory_seats    |    31
 project_party_authority   |    11
 project_site_access_cards |     1
 people_directory          |    62
 Pete Rusk       | +16125550112 | opted_out
 Pete Rusk       | +16125550112 | opted_out
 Rivera Finishes | +16125550219 | opted_out
```

The two `COALESCE(…, 'not_asked')` expressions are deliberately left in place: with the conjunct
above they can no longer stand in for an unreadable record, and removing them would change the
party branch's word contract for the population that legitimately has no record at all.

MINOR-13 (`studio_id IS NULL` projects resolving through `_primary_studio_for`) is untouched and
still open; it is the other side of the same resolver and was not in this round's scope.

---

## MAJOR-2 — a dated consent claim beside a refusal, through `refusal_unanswered`

**File:** `supabase/migrations/00626_people_directory_v4_seats.sql`
(`identity_consent_evidence()`).

One-sided suppression, in the evidence function rather than in the view, so the single formula
serves every reader:

```sql
+  WITH decided AS (
+    SELECT public.identity_consent_status(
+             p_organization_id, p_identity_key, p_card_phone_e164) AS word
+  )
   SELECT scc.channel_value,
+         CASE WHEN d.word = 'opted_out' THEN NULL ELSE scc.consented_at END,
+         CASE WHEN d.word = 'opted_out' THEN scc.opt_out_at ELSE NULL END
```

The word itself is untouched — `channel_consent_status()` still folds `refusal_unanswered`, which
is R-AS/R-AY's one home for the rule. Only a date the word contradicts is withheld, which R-BC
explicitly permits ("or are left empty"). Hoisting the winning word into a CTE also means the
reduction runs once instead of once per number; that is the natural shape of the fix, not a
separate change, and MINOR-38 falls out of it rather than being worked on.

**Evidence — the reviewer's `probe108`, replayed byte-for-byte** (`probe108-r5fix-rerun.out`):

```
=== the record ===
 +16125559301 | granted | refusal_unanswered t | consented_at 2025-05-02 | opt_out_at (null) | verdict opted_out

=== the Directory row the room renders, and R-Q composed from it ===
     display_name     | consent_status | meta_word | sms_consented_at | sms_opt_out_at
 Folded Refusal Trade | opted_out      | opted_out |                  |
                                                     ↑ was 2025-05-02T00:00:00+00:00

=== identity_consent_evidence ===
 +16125559301 |              |
```

R-Q now has no date to compose from, so the sentence falls back to R-V's "no record" line instead
of reading "Written consent, 2 May 2025" beside a refusal.

**The test leg the finding asks for** is `4e18`–`4e23` in block 4, over exactly the population no
probe or leg in the wave touched. It asserts the fixture first (`4e18`: the record reads
`granted/true/2025-05-02/-`; `4e19`: the fold makes the verdict `opted_out`), then the word
(`4e20`), then the suppression (`4e21`: no `sms_consented_at`), then that nothing is invented
(`4e22`: a dateless folded refusal leaves `sms_opt_out_at` empty), and finally the **other side**
of the rule (`4e23`: lift the fold and the grant's own date prints again — the suppression is
one-sided, not a deletion).

---

## MAJOR-3 — the site access card, the authority table and the seats view were scoped through the designer

**Files:** `supabase/migrations/00625_project_site_access_cards.sql` (four policies),
`supabase/migrations/00624_project_party_window_and_authority.sql` (four policies),
`supabase/migrations/00626_people_directory_v4_seats.sql` (the seats view — the same conjunct as
MAJOR-1, above).

The finding names `is_active_studio_member(public.project_consent_org(project_id))`.
`project_party_authority` carries `engagement_id` and no `project_id`, so there it is written
`is_active_studio_member(public.project_party_org(engagement_id))` — and
`project_party_org(p)` **is** `project_consent_org(pp.project_id)` (00624:69-79), the one resolver,
already the argument PR-n's admin leg uses two lines below. Nothing is inlined or restated.

Applied, as the database reports them:

```
project_party_authority   | _studio_select | r | is_active_studio_member(project_party_org(engagement_id)) AND is_studio_comember(project_party_designer(engagement_id))
project_party_authority   | _studio_update | w | … AND ((scope <> ALL (ARRAY['money','draw_certify'])) OR is_org_admin_or_owner(project_party_org(engagement_id)))
project_party_authority   | _studio_delete | d | … same
project_party_authority   | _studio_insert | a | (WITH CHECK only, same shape)
project_site_access_cards | _studio_select | r | is_active_studio_member(project_consent_org(project_id)) AND is_studio_comember(project_designer(project_id))
project_site_access_cards | _studio_update | w | … same
project_site_access_cards | _studio_delete | d | … same
project_site_access_cards | _studio_insert | a | (WITH CHECK only, same shape)
```

PR-w (§2) rules out a client branch and names no studio predicate, so tightening reopens no
ruling; PR-n's admin narrowing sits untouched beside the new conjunct, and suite block 5 still
walks it by role.

**Evidence** (`probe116-w1b-final-r5-fix-negative-control.out`, the side-studio member):

```
=== MAJOR-3: the sensitive objects (was 1 card / 11 grants) ===
 studio_compliance_documents      |     0     (was 0 — already correct)
 people_directory contacts branch |     0     (was 0 — already correct)
 project_party_authority          |     0     ← was 11, with their money thresholds
 project_site_access_cards        |     0     ← was 1

=== the site access card itself ===
 project_id | lockbox_version | alarm_ref
 (0 rows)                                   ← was "Lockbox, version 3" / "Sentry Alarm, account 88-4412"

=== can they WRITE, too? ===
NOTICE:  UPDATE landed on 0 row(s)          ← was "UPDATE landed on 1 row(s)"
```

**The test legs** are the new **block 13**, "the tenant boundary", which builds a third studio
holding the seeded studio's designer *and* one outsider — created inside the block rather than in
the file's top fixture so no earlier block's actor changes. It asserts the premise first (`13a`
co-member of the designer, `13b` NOT a member of the seeded studio, `13c` the designer is the
shared one), then the closures — `13d` no site access card, `13e` the lockbox UPDATE lands on 0
rows, `13f` no authority grant, `13g` no seat row, `13h` no party-branch Directory row, `13i` the
rolodex unchanged (it was never the finding) — then BLOCKING-1's `13j`–`13n1`, then the positive
controls `13o`–`13t`: the studio's own owner and admin still read the card, the grants, the seats
and the recorded refusal.

`13m1`/`13n1` are worth naming: passing the **foreign number itself** as `p_card_phone_e164` still
returns `not_asked` and no evidence row, and that is correct — that leg echoes a number the caller
already holds, resolved against their own studio's record, which has none. The oracle was the seat
scan, not the card argument. An earlier draft of `13m` asserted NULL there and failed
(`ERROR: 13m a foreign identity's consent word answered under the caller's own org`); the
assertion, not the code, was wrong.

**Severity.** The finding flagged that the brief's literal BLOCKING wording covers this and left
promotion to Fable. It is fixed either way, so the grading is moot; recorded here because
`is_studio_comember` remains the predicate `project_parties` itself carries since 00420/00584 and
this wave's three new objects now sit one conjunct tighter than that family.

---

## 5. Verification, after the edits

### 5.1 Legacy grants — no drift, because no grant changed

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2713 replayed statements
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
(nothing)
```

### 5.2 Reset, twice

```
$ pnpm --dir … supabase:reset     RESET1_EXIT=0    (grep -i error, minus *_error → nothing)
$ pnpm --dir … supabase:reset     RESET2_EXIT=0    (idem)
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111 00627 00626 00625 00624 00623
```

### 5.3 Idempotency — all five files applied TWICE in one rolled-back transaction

```
$ psql … -v ON_ERROR_STOP=1 -f <00623..00627 concatenated, then again>
REPLAY2X_EXIT=0      # no ERROR line; 46 "already exists, skipping" notices
```

### 5.4 Both people suites, and every shipped suite touching the changed objects

```
people/w1b_compliance_authority_directory_test   exit=0   13 blocks, "All W1b assertions passed."
people/w1a_identity_channels_consent_test        exit=0
field/field_links_test                           exit=0
rls/project_roster_test                          exit=0
rls/sms_tables_test                              exit=0
rls/studio_contacts_backfill_test                exit=0
document/lead_contact_phone_test                 exit=0
rls/00584_studio_comember_rls_sweep.test         exit=0
rls/people_directory_scope_test                  exit=3  ERROR: FAIL a2: expected exactly 12 columns, got 17
rls/field_parties_test                           exit=3  ERROR: consent_legacy_column_frozen
site_requests/security_and_lifecycle_test        exit=3  ERROR: send must transition not_asked consent to pending
commercial/trade_rfq_test                        exit=3  ERROR: design services agreement d9300000-… not found
```

The same four reds, same messages, as r3/r4/r5 measured — MINOR-27 and MINOR-28, both still open
and out of this round's scope. **No new red.**

### 5.5 Generated types and type-checks

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0 ; wc -l packages/supabase/src/database.types.ts → 38173
$ git diff --numstat -- packages/supabase/src/database.types.ts
(nothing)                 # no drift: the fixes change no column, type or signature

$ pnpm --dir … --filter @patina/supabase        type-check   SUPABASE_TC=0
$ pnpm --dir … --filter @patina/designer-portal type-check   DESIGNER_TC=0
```

### 5.6 Deno / vitest — nothing relevant

No TypeScript caller exists yet for any object these fixes touch (W2 owns those readers):

```
$ grep -rn --include="*.ts" --include="*.tsx" -e identity_phone_numbers -e identity_consent_evidence \
    -e people_directory_seats -e project_site_access_cards -e project_party_authority \
    apps packages supabase/functions | grep -v database.types.ts
(nothing)
```

No edge function, hook or portal file changed, so no Deno or vitest suite is in scope. The three
Deno suites the pre-push hook names for a `supabase/` change were run anyway, and pass:

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts        exit=0
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/field-daily.test.ts  exit=0
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts  exit=0
```

### 5.7 The diff's whole footprint

```
$ git diff --numstat
 37   10  supabase/migrations/00624_project_party_window_and_authority.sql
 46    8  supabase/migrations/00625_project_site_access_cards.sql
146   24  supabase/migrations/00626_people_directory_v4_seats.sql
327    2  supabase/tests/people/w1b_compliance_authority_directory_test.sql
```

Four files. `00623`, `00627`, the seed, `00-legacy-grants.sql`, `database.types.ts` and every other
suite are untouched.

---

## 6. What is NOT fixed

Every MINOR from r2/r3/r4/r5 stays open and unedited, including the two the r5 report suggested
taking along (**MINOR-27**, the one-line `12` → `17` in `people_directory_scope_test.sql`, and
**MINOR-33**, the missing `search_path` on `party_identity_key` / `party_kind_in_directory`) and
**MINOR-35** (`w1b-report.md` is now five rounds stale). The brief for this round is "these four
findings, nothing else"; MINOR-38 is incidentally gone as a by-product of MAJOR-2's CTE and is not
claimed as worked.
