# W1a — fix log, round 9 review (M1, M2)

Worktree `.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, base of this round `52c4d17ca`
("fix(consent): a STOP over a standing grant is not a refusal in writing
(r10 M1/M2)"). Findings fixed: the two majors of
`w1a-review-r9-migrations.md`. Nothing else was touched.

Local Supabase only — no `supabase db push`, no `supabase functions deploy`,
nothing touched on Strata. `00594` is unapplied everywhere but this local
stack, so it is edited in place.

---

## M1 — `record_channel_reconsent()` destroyed the GRANT's evidence set and left `consented_at` naming the older grant

**Finding (reproduced before the fix).** The SET list restated `source`,
`evidence`, `recorded_at`, `disclosure_version` and `recorded_by` on every call
and deliberately left `consented_at` alone. But `consented_at` is not an
independent fact — it is the date OF THOSE FIVE (`00594:159-170`, R-Q), the
rule r6 R6-M1 enforces in `record_channel_consent`'s `opted_out` branch. So a
record holding a real grant (2 May 2025 / `written` / "Signed the kickoff form"
/ `v3`) came out of one ordinary call reading (`verbal` / "He said it is fine
now" / recorded today / `v9`) against 2 May 2025: R-Q's grant sentence composing
"Verbal consent, 2 May 2025", the disclosure version the person was actually
shown destroyed on the record, and — through the mirror's `COALESCE`
(`00594:1016`) — `v9` stamped onto every seat in the studio on that number under
an `opted_out` status. The `channel_opted_out` HINT routes studios through this
door on purpose, so it is the ordinary path.

**Ruling taken.** Option (a) of the finding: restate `consented_at = v_now`
alongside the five, so source and date name the same act. Option (b) (refuse the
write and add a third evidence set) was not taken — it needs new columns and
changes what the door is for, while (a) is the same rule
`record_channel_consent`'s granted branch already applies (`consented_at =
EXCLUDED.consented_at` when a grant is written).

**Changed** — `supabase/migrations/00594_studio_channel_consent.sql`:

- the SET list of `record_channel_reconsent()` gains `consented_at = v_now`
  immediately above the five, with the reasoning and the r6 R6-M1 precedent in
  comment;
- `COMMENT ON FUNCTION record_channel_reconsent(...)` now says it writes the
  date of the consent it records;
- the function's preamble and the migration banner (item 5) say the same.

Nothing else moves: `status` stays `opted_out`, `opt_out_at` keeps the day the
refusal arrived, `refusal_unanswered` stays TRUE (r7 M7-2 untouched), and the
four `opt_out_*` columns are still not in the list (r8 W4-M2). No gate opens
either — `record_channel_consent`'s granted leg (`00594:1608-1612`) tests
`refusal_unanswered`, which this door keeps true; SQL 16c/16c2, 16Bc2 and
34e/34e2 all still refuse the composition.

**Evidence** (`probe26-r9-M1-M2.sql`, rolled back, on a full `supabase:reset`):

```
=== M1 --- before reconsent ---
  status   |      consented_at      | source  |        evidence         |      recorded_at       | disclosure_version
-----------+------------------------+---------+-------------------------+------------------------+--------------------
 opted_out | 2025-05-02 00:00:00+00 | written | Signed the kickoff form | 2025-05-02 00:00:00+00 | v3

=== M1 --- after ONE record_channel_reconsent(...,verbal,...,v9) ---
  status   |         consented_at          | source |        evidence        |          recorded_at          | disclosure_version |          opt_out_at           | opt_out_source | refusal_unanswered
-----------+-------------------------------+--------+------------------------+-------------------------------+--------------------+-------------------------------+----------------+--------------------
 opted_out | 2026-09-12 07:23:13.094951+00 | verbal | He said it is fine now | 2026-09-12 07:23:13.094951+00 | v9                 | 2026-09-12 07:23:13.094951+00 | inbound_sms    | t
```

`consented_at` and `recorded_at` are now the same instant and the source is the
one that act used; the refusal's date, words and `refusal_unanswered` are
untouched. (The probe's `reconsent_recorded | f` line is composite `IS NOT NULL`
semantics on a row with NULL fields, not a failure — the write is visible in the
table above it.)

**Test.** New SQL block **35** — a dated, evidenced grant (`v3`), a STOP over it,
then one `record_channel_reconsent(verbal, …, v9)`:

- 35a the refusal leaves the grant's dated evidence standing (the r6 R6-M1 rule);
- 35b the fresh consent is on the record;
- 35b2 `consented_at <> '2025-05-02'` AND `consented_at = recorded_at` — the
  failing assertion before the fix;
- 35c `status`, `opt_out_at`, `refusal_unanswered`, `opt_out_source` and
  `opt_out_evidence` all unmoved;
- 35d the SEAT's `sms_consent_disclosure_version` and `sms_consented_at` name the
  same act (before the fix the seat read `v9` against a 2025 consent date).

Two existing assertions had encoded the old behaviour as a proxy and now assert
the composition fact directly instead — **16c2** and **16Bd** asserted
`consented_at IS NULL` after a refused grant; they now assert the record is
still the unanswered refusal carrying the reconsent's own evidence and its own
date (16c2 compares against the value captured at 16b4). That both of them
failed on the first run after the edit is itself the reproduction of the
finding.

---

## M2 — the fold took the CONSENT side off the winning refusing seat only, minting the group's real grant evidence away

**Finding (reproduced before the fix).** `ins` read the consent set from the
single `ranked` winner. r8 W4-M1 added the `refusal` CTE because `ROW_NUMBER()`
drops every sibling before a predicate can see it — but only for the refusal
side. For the commonest legacy shape (a fully evidenced grant on one seat, the
shipped portal's sourceless dateless `opted_out` on another seat on the same
number — `use-coordination.ts` writes exactly that) the fold minted a record
with `source` / `evidence` / `recorded_at` / `disclosure_version` /
`recorded_by` all NULL. `opt_out_source` then came out NULL as well, which is
what R-AQ's mirror branch reads as "this refusal has no words", so the mirror
wrote NULL over the four evidence columns on EVERY seat in the studio on that
number — the grant seat included. `ON CONFLICT DO NOTHING` means no later fold
repairs the record and reconsent never touches `opt_out_*`, so the studio's
proof of prior express written consent survived nowhere.

**Ruling taken.** The fix the finding names: a `grant_evidence` CTE beside
`refusal`, computed over `party_org`, projecting the group's best evidenced
consent onto the record's consent columns where the winning row carries none.
Two judgement calls inside it, both stated here because a reviewer will ask:

1. **`consented_at` moves with the five.** The finding names five columns; the
   date is taken from the same row, because a set half from one act and half
   from another is exactly the M1 failure one function over (R-Q,
   `00594:159-170`). Where the group holds no evidenced grant, `consented_at`
   stays the winner's, unchanged.
2. **The gate is "the winner carries no consent evidence at all"
   (`sms_consent_source IS NULL`), not "the winner's evidence is not a grant's".**
   The wider reading would null the consent side of a record a REFUSAL mints
   with its own words — and that is the settled grammar of every other writer of
   a mint in this file: `record_channel_consent`'s INSERT leg writes the act's
   own source and words into those five whatever the verdict, and
   `sms-inbound/pipeline.ts` matches it leg for leg ("when this act MINTS the
   record there is no grant standing to protect"). Widening it here would have
   put the fold out of step with both. SQL 36d is the control that pins the
   narrow reading, and 30f4 (unchanged) pins the other side: a winner that
   carries its own grant paperwork keeps it.

**Changed** — `supabase/migrations/00594_studio_channel_consent.sql`:

- `refusal_words_are_its_own` is **hoisted into `party_org`** (verbatim, from
  the `owned` subquery that used to compute it) so the `refusal` CTE and the new
  `grant_evidence` CTE read ONE definition in opposite directions and cannot
  drift apart. `owned` is now the refusal population and nothing else;
- new `grant_evidence` CTE: one row per (studio, number), population
  `sms_consent_source IS NOT NULL AND NOT refusal_words_are_its_own`, ordered
  most recent `sms_consented_at`, then `sms_consent_recorded_at`, then
  `updated_at`;
- `ins` `LEFT JOIN`s it and takes `consented_at` + the five off it when
  `r.sms_consent_source IS NULL`;
- `COMMENT ON FUNCTION backfill_channel_consent_from_parties()` and the banner
  (item 2) state the rule.

**Evidence** (`probe26-r9-M1-M2.sql`, same run):

```
=== M2 --- fold a group holding a sourceless refusal BESIDE a fully evidenced grant ===
 folded = 1
  status   | refusal_unanswered | opt_out_at | source  |        evidence         |      recorded_at       | disclosure_version | has_recorder |      consented_at      | opt_out_source
-----------+--------------------+------------+---------+-------------------------+------------------------+--------------------+--------------+------------------------+----------------
 opted_out | t                  |            | written | Signed the kickoff form | 2025-05-02 00:00:00+00 | v3                 | t            | 2025-05-02 00:00:00+00 |

=== M2 --- the seats after R-AQ (the wipe is ruled; the RECORD now holds the proof) ===
 display_name  | sms_consent_status | sms_consent_source | sms_consent_evidence |    sms_consented_at
---------------+--------------------+--------------------+----------------------+------------------------
 Granted Seat  | opted_out          |                    |                      | 2025-05-02 00:00:00+00
 Refusing Seat | opted_out          |                    |                      | 2025-05-02 00:00:00+00

=== M2 --- and after ONE ordinary reconsent the record still carries a dated, evidenced consent ===
  status   |         consented_at          | source  |       evidence       | disclosure_version | opt_out_source
-----------+-------------------------------+---------+----------------------+--------------------+----------------
 opted_out | 2026-09-12 07:23:13.094951+00 | written | Fresh signed consent | v9                 |
```

The review's table for the same fixture read `opted_out | t | | | | | | f |` —
every consent column blank. **Residual, stated plainly:** the record carries ONE
consent set, so a later `record_channel_reconsent()` still restates it (third
table above: the 2025 written grant is replaced by the studio's fresh 2026
written consent, which is itself a valid 10DLC artifact and is now correctly
dated, M1). What the fix removes is the fold minting the set EMPTY and R-AQ then
clearing the last copy off the seats; it does not turn the record into a
consent history, and nothing in the direction asks for one.

**Test.** New SQL block **36** (fixture: sourceless dateless `opted_out` seat +
fully evidenced grant seat on one number; a control number whose only evidence
is a rail-written STOP):

- 36a the verdict is unchanged — wordless unanswered refusal;
- 36b all five consent columns AND `consented_at` come off the group's grant;
- 36c both seats are still wiped by R-AQ, which is why the record has to hold
  the proof;
- 36d/36d2 the control: a group holding no grant has none invented for it, and
  no consent DATE appears, so no grant sentence composes.

And block **27i** — whose fixture is exactly this shape (Ola Nyquist's
sourceless refusal beside Nils Ek's kickoff form) — asserted
`r.source IS NULL AND r.evidence IS NULL`, i.e. the defect. It failed on the
first run after the edit (the reproduction), and now asserts the grant's five
plus `consented_at` on the record's consent side (**27i1b**) while 27i6–27i8
keep asserting the ruled seat wipe.

**Operator artifact.** `probe10-r9-fold-dry-run.sql` is the fold's CTE chain
verbatim with the INSERT replaced by a SELECT, and §5 of the report claims the
two agree row for row — so it was updated the same way (hoisted predicate,
`grant_evidence` CTE, two new output columns `consent_source` / `consented_at`).
Re-checked against the fold on a two-group fixture in one rolled-back
transaction:

```
### DRY RUN (what the operator is shown before the push)
 phone_e164   | sms_consent_status | refusal_unanswered |       opt_out_at       | consent_source |      consented_at
 +16125550911 | opted_out          | t                  |                        | written        | 2025-05-02 00:00:00+00
 +16125550912 | opted_out          | t                  | 2025-12-03 00:00:00+00 | written        | 2025-05-02 00:00:00+00

### THE FOLD ITSELF   (folded = 2)
 +16125550911 | opted_out | t |                        | | written | 2025-05-02 00:00:00+00
 +16125550912 | opted_out | t | 2025-12-03 00:00:00+00 | | written | 2025-05-02 00:00:00+00
```

---

## Gates

```
$ pnpm --dir …/agent-people-build supabase:reset
…Applying migration 00594_studio_channel_consent.sql… Finished supabase db reset on branch main.

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  35. a fresh consent recorded over a refusal carries its own date, so
         source, words, disclosure version and date name one act (r9 M1): passed
NOTICE:  36. the fold keeps the group's grant evidence when the winning row
         carries none, and never invents one for a group that holds none
         (r9 M2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ psql … | grep -c "NOTICE:"
39                     (was 37 — two new blocks)

$ (echo BEGIN; cat supabase/migrations/00594_studio_channel_consent.sql; echo ROLLBACK) \
    | psql … -v ON_ERROR_STOP=1        # idempotent replay against the migrated DB
… CREATE FUNCTION / REVOKE / GRANT / COMMENT / ROLLBACK      (no errors)

$ SUPABASE_DB_URL=… pnpm db:generate && git diff --stat packages/supabase/src/database.types.ts
(empty — no schema change, so no type drift)

$ python3 scripts/generate-legacy-grants.py && git diff --stat supabase/seed/00-legacy-grants.sql
wrote … baseline + 2633 replayed statements
(empty — no GRANT/REVOKE change)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 80 passed | 0 failed (96ms)
```

`w1a-report.md` updated: decisions **31** (M1) and **32** (M2); §1's 00594 row;
§3's counts (39 blocks / 38 notices / `grep -c NOTICE` = 39) and transcript;
§3's prose on 27i; §5's dry-run shape and its agreement check.
