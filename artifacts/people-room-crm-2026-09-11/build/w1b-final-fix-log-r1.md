# W1b final run — fix log, round 1

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, baseline `f21cc0087`
(`feat(people): P1 data — compliance, authority, engagement window, site access
card, people_directory v4, access grants, field-link expiry, dev seed`).
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
this wave's sole owner). **No prod act of any kind** — no `supabase db push`, no
`supabase functions deploy`, no Strata connection, no `supabase link`.

**Scope: the five MAJOR findings of `w1b-final-review-r1-migrations.md`
(MAJOR-1 … MAJOR-5) and nothing else.** The 17 MINORs there and the two MINORs
in `w1b-final-review-r1-tests.md` are deliberately untouched and stay open,
except where a ruled fix closes one as a side effect — called out per finding.

Every ruling in `rulings.md` §3 governs, R-AW/R-AY above all: the record
(`studio_channel_consent`) is the only thing any gate, RPC, view, trigger or
edge path consults for SMS consent. **No fix here reintroduces a seat read** —
none of the four SQL edits touches a consent read at all (`git diff` over the
three migrations contains no `sms_consent_`, no `channel_consent_status`, no
`project_consent_org` change; the two consent reads in 00626's party branch and
the seats view are byte-identical to the baseline).

00623–00627 are unapplied on Strata, so all four fixes are **edits in place**;
no new migration number is minted, and 00595–00620 stay untouched.

Environment, before the destructive local act (sandbox disabled for the grep):

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
$ ls -a .codex/worktrees/agent-people-build/apps/designer-portal/ | grep env
.env.example                 # the worktree has no .env.local of its own
```

---

## MAJOR-1 — `create_field_link` minted a token dated in the past and revoked the live one in the same call

**File.** `supabase/migrations/00627_access_grants_and_field_link_window.sql`
(the two-argument body; the one-argument delegate's COMMENT).

**Fix, as ruled.** The review offered two shapes. Taken: *take the window only
while it is still open, then `p_expires_at` only if it is in the future, then
the 90-day fallback* — the review's first option — plus the invariant stated
where it cannot be edited around, raising **before** the supersede:

```sql
  v_expires := CASE
    WHEN v_window_end IS NOT NULL
     AND v_window_end::timestamptz + interval '1 day' > now()
         THEN v_window_end::timestamptz + interval '1 day'
    WHEN p_expires_at IS NOT NULL AND p_expires_at > now() THEN p_expires_at
    ELSE now() + interval '90 days'
  END;

  IF v_expires IS NULL OR v_expires <= now() THEN
    RAISE EXCEPTION 'field_link_window_closed' USING HINT = '…', ERRCODE = 'check_violation';
  END IF;

  -- Supersede prior active tokens …
```

**Why the fallback rather than `RAISE` for a closed window.** `RAISE` reaches
the shipped SMS rail badly: `mintFieldLink` (`_shared/sms.ts:560-573`) returns
`null` on any RPC error and `resolveBody` then interpolates `link = ""`, so
field-daily's digest, both `fc_dispatch` triggers and the site-request rail
would text a trade a message with a **blank** link where today (pre-00627) that
seat receives a working 90-day one. A closed window is the same fact as no
window, and 00627's own comment already says the 90-day clock is "retired as a
DEFAULT, not removed". PR-d is satisfied in the only direction that matters:
nothing is ever dated in the past, and nothing live is revoked on behalf of a
mint that cannot succeed. **Owed as a ruling, not a defect:** if Kody wants
R-AD's "no silent fallback clock" applied to a closed engagement as well, the
`RAISE` branch is one line away and the desk act would then have to offer the
date — the raise path is already in the body and unreachable only because the
CASE can no longer produce a dead date.

**Test leg added** — block 10, `10h`–`10n`: a seat whose window closed
(`CURRENT_DATE - 90 .. CURRENT_DATE - 30`) mints a live token at the 90-day
default, `reach_state_for` reads `field_link`, a caller date in the past is not
stamped, the prior token is superseded only by a mint that succeeded, exactly
one active token remains, and no seat in the block carries a live token dated in
the past.

**Evidence — the reviewer's own probe66, rerun verbatim:**

```
$ psql … -f artifacts/people-room-crm-2026-09-11/build/probe66-w1b-final-r1-prn-and-link.sql
=== D. create_field_link on the seeded Lindqvist (closed job) seats ===
NOTICE:  Ben Ostrom        | stage=warranty  | on_site_to=2025-10-15 | warranty_until=2026-11-21 | minted expiry=2026-11-22 00:00:00+00 | ALREADY DEAD: f
NOTICE:  Dana Kowalski     | stage=warranty  | on_site_to=2025-10-15 | warranty_until=2026-11-21 | minted expiry=2026-11-22 00:00:00+00 | ALREADY DEAD: f
NOTICE:  Erin Sato         | stage=warranty  | on_site_to=2025-10-15 | warranty_until=2026-11-21 | minted expiry=2026-11-22 00:00:00+00 | ALREADY DEAD: f
NOTICE:  Ingrid Halvorsen  | stage=warranty  | on_site_to=2025-09-30 | warranty_until=2026-11-21 | minted expiry=2026-11-22 00:00:00+00 | ALREADY DEAD: f
NOTICE:  Pete Rusk         | stage=warranty  | on_site_to=2025-10-15 | warranty_until=2026-11-21 | minted expiry=2026-11-22 00:00:00+00 | ALREADY DEAD: f
=== D2. an off_job seat with no warranty: the link is dead on arrival ===
NOTICE:  minted expiry = 2026-12-11 14:47:24.3991+00  (dead: f) ; the prior LIVE token (now+45d) is now revoked
NOTICE:  reach_state_for = field_link
```

Before the fix probe66 D2 read `minted expiry = 2026-06-01 00:00:00+00 (dead: t)`
and `reach_state_for = on_paper`. The prior token is still revoked — correct,
because its replacement is live (2026-12-11 = now + 90 days) and the seat ends
with exactly one active token (probe68 D).

---

## MAJOR-2 — `people_directory` and `people_directory_seats` chose different winners, so a row could claim 2 seats and nest none

**File.** `supabase/migrations/00626_people_directory_v4_seats.sql`.

**Fix, as ruled.** The seven-kind vocabulary now lives in ONE place and both
views use it: a new `public.party_kind_in_directory(text)` (IMMUTABLE, a plain
scalar SQL body so the planner inlines it and the Directory's WHERE keeps its
index). The Directory's party branch selects on it; the seats view's winner
window *orders* by the Directory's whole candidate set, expressed as a
preference, then by the Directory's own ORDER BY verbatim:

```sql
    first_value(pp.id) OVER (
      PARTITION BY public.party_identity_key(…)
      ORDER BY (pp.studio_contact_id IS NULL) DESC,
               public.party_kind_in_directory(pp.party_kind) DESC,
               pp.updated_at DESC, pp.id
    )
```

The review's alternative — an `identity_winner_party(text)` STABLE function both
views call — was considered and **rejected on a concrete hazard**: it would read
`project_parties` under that table's own RLS (nine policies: team, self,
coordination party, client `show_to_client`, and a studio leg keyed on
`designer_id`/`studio_id`), which is *not* the two views' predicate
(co-member on `designer_id` / `lead_designer_id` / `created_by`). A winner
visible to the function but excluded by the views would make the identity vanish
from the Directory while its seats nested under a row that does not exist — the
same class of divergence with a new trigger. Ordering inside the views computes
the winner over exactly the rows both views admit, which is stronger.

Both COMMENTs that claimed the old (untrue) alignment are rewritten, including
the `:614-619` sentence the review named.

**Test leg added** — block 4, `4f`–`4k`: one uncarded human with a `sub` seat
(older) and a `vendor` seat (newer) on the same phone; the Directory wins on the
`sub`, `seat_count = 2`, both seats nest under it, the `vendor` seat is one of
them, and — the invariant itself — **no visible Directory row anywhere claims a
seat count it cannot nest**.

**Evidence — the reviewer's own probe61, rerun verbatim:**

```
=== people_directory row (DISTINCT ON, restricted to the seven kinds) ===
              person_id               | role | seat_count
 11111111-0000-0000-0000-00000000aaaa | sub  |          2
=== people_directory_seats (first_value over EVERY kind) ===
               seat_id                |              person_id               | party_kind
 11111111-0000-0000-0000-00000000aaaa | 11111111-0000-0000-0000-00000000aaaa | sub
 11111111-0000-0000-0000-00000000bbbb | 11111111-0000-0000-0000-00000000aaaa | vendor
=== the join W2 is meant to make ===
              dir_person              | claims | nests
 11111111-0000-0000-0000-00000000aaaa |      2 |     2
```

Before the fix the seats view gave both rows `person_id = …bbbb` and the join
nested **0**. probe68 E adds the fixture-wide invariant:
`rows_claiming_a_count_they_cannot_nest = 0`.

---

## MAJOR-3 — `compliance_state()` never read `blocks[]`, so a gateless lapse printed the blocked word

**File.** `supabase/migrations/00623_studio_compliance_documents.sql`.

**Fix, as ruled** (the review's first option — CS2 §4 and PR-h describe it):
`cardinality(d.blocks) > 0` on both date FILTERs, with `count(*) = 0`
deliberately unfiltered so `not_on_file` still means *no paper at all*:

```sql
           WHEN count(*) = 0 THEN 'not_on_file'
           WHEN count(*) FILTER (
                  WHERE cardinality(d.blocks) > 0
                    AND d.expires_on IS NOT NULL
                    AND d.expires_on < CURRENT_DATE) > 0 THEN 'lapsed'
           WHEN count(*) FILTER (
                  WHERE cardinality(d.blocks) > 0
                    AND d.expires_on IS NOT NULL
                    AND d.expires_on <= CURRENT_DATE + 30) > 0 THEN 'lapses_soon'
```

The function's own COMMENT, the preamble and the migration banner now say what
the code does, so the column comment at `:143-147` ("a date with no gate changes
nothing") is no longer contradicted.

**Test leg added** — block 1, `1k`–`1n`: a gateless paper lapsed yesterday
changes nothing; nor does one 10 days out; the *same* paper given one gate makes
the card read `lapsed`; and a card holding only a gateless expired certificate
reads `current`, not `not_on_file`.

**Evidence — the reviewer's own probe64, rerun verbatim:**

```
=== A. does compliance_state read blocks[] at all? ===
 reads_blocks
 t                      ← was f
=== C. a LAPSED paper that gates NOTHING still makes the holder read lapsed ===
  word   |                            record
 current | COI current to +200d; a gateless other_named lapsed yesterday
                          ← was lapsed
```

probe68 C, the same three facts in one transaction:
`word_with_a_gateless_lapse = current`,
`word_once_that_paper_holds_a_gate = lapsed`,
`a_card_with_no_paper = not_on_file`.

**The seeded fixture does not move.** F-11 Northgate Electric's lapsed
`coi_gl` holds `{site_access,draw}`, so G-14's headline fact survives — proven
by a full before/after diff of all 62 Directory rows (below).

---

## MAJOR-4 — one UPDATE turned `lapsed` into `current` while the lapsed COI was still on file

**File.** `supabase/migrations/00623_studio_compliance_documents.sql`
(`assert_compliance_holder()`).

**Fix, as ruled.** The successor leg now reads the successor row and requires
the two things a renewal implies, raising the two named errors:

```sql
    SELECT d.doc_type, d.expires_on INTO v_succ_type, v_succ_expires
      FROM public.studio_compliance_documents d
      WHERE d.id = NEW.superseded_by
        AND d.organization_id = NEW.organization_id
        AND d.holder_id = NEW.holder_id;
    IF NOT FOUND THEN … compliance_successor_other_holder … END IF;
    IF v_succ_type IS DISTINCT FROM NEW.doc_type THEN … compliance_successor_wrong_type … END IF;
    IF v_succ_expires IS NOT NULL AND NEW.expires_on IS NOT NULL
       AND v_succ_expires < NEW.expires_on THEN … compliance_successor_not_later … END IF;
```

One hardening beyond the literal wording, in the same act: the trigger's
`UPDATE OF` list gains `doc_type, expires_on`, so the guard also holds when a
row that already carries a `superseded_by` has its own type or date edited
afterwards — otherwise the same PostgREST writer reaches the same result in two
statements instead of one.

**Test legs added** — block 2, `2e`–`2h`: the walked laundering (a W-9 as the
renewal of a lapsed COI) is refused `compliance_successor_wrong_type`; a
shorter-dated COI is refused `compliance_successor_not_later`; a genuine renewal
(same paper, covering longer) still lands; an undated successor of the same
paper is open-ended and qualifies.

**Evidence — the walk itself, as `plainmember@example.test` with role `member`
(probe68 A/B):**

```
    display_name    | paper_before
 Northgate Electric | lapsed
-- point the lapsed COI at the firm undated W-9 (expect refused)
ERROR:  compliance_successor_wrong_type
HINT:  A renewal is the same paper: superseded_by must name a document of the same doc_type. …
    display_name    | paper_after_the_attempt
 Northgate Electric | lapsed
-- and a GENUINE renewal by the same member still lands
UPDATE 1
    display_name    | paper_after_a_real_renewal
 Northgate Electric | current

=== B. a shorter-dated successor of the same paper is refused ===
ERROR:  compliance_successor_not_later
 word_after_the_attempt
 lapsed
```

Before the fix that first UPDATE reported `UPDATE 1` and
`paper_after_the_hide = current`.

**Side effect, recorded not claimed:** MINOR-2's two-row supersede *cycle* is no
longer reachable for differently-typed or differently-dated paper — probe64 D's
`coi_gl → coi_wc` cycle now stops at `compliance_successor_wrong_type`. MINOR-2
stays open as a finding; only its stated repro is closed.

---

## MAJOR-5 — on deploy the shipped Directory feed loses every trade (22 rows → 1)

**No SQL change, as ruled.** Recorded as a hard sequencing constraint in the one
place a deployer cannot miss it — the top of the migration itself,
`00626_people_directory_v4_seats.sql`:

> ⚠ DEPLOY SEQUENCING — A HARD CONSTRAINT, NOT A PREFERENCE (w1b r1 MAJOR-5)
> This file MUST NOT reach Strata ahead of W2's Directory. … after this file the
> feed renders client 7 / lead 5 / sub 1 … PR-y is overruled (rulings §6): there
> is no flag to hide this, and §6 rules ONE deploy chain at the end of the
> program — so 00623–00627 and W2's Directory ship in that one chain, together.
> W2's chip mapping should read `meta.entity_kind` plus
> `people_directory_seats.party_kind` rather than `role`, which is the shape this
> view now offers.

**Evidence — the face is unchanged by these fixes, which is the point**
(probe68 F, as `designer@patina.dev`):

```
  role  | count
 client |     7
 lead   |     5
 sub    |     1
 head_count_all_rows | rows_the_feed_renders
                  62 |                    13
```

Identical to probe67's reading in the review. Nothing in the four SQL fixes
mitigates MAJOR-5, and nothing was expected to.

---

## Gates run after the edits

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2703 replayed statements
$ git diff -- supabase/seed/00-legacy-grants.sql
+12 lines: REVOKE/GRANT for public.party_kind_in_directory(text)   # the only new grant

$ pnpm --dir <worktree> supabase:reset
… Applying migration 00623 … 00624 … 00625 … 00626 … 00627 …
Finished supabase db reset on branch main.   RESET_EXIT=0

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence, a superseded lapse released, and a gateless lapse that changes nothing until it holds a gate: passed
NOTICE:  2. the holder guard: … and a supersede must be the same paper covering at least as long: passed
NOTICE:  3. people_directory v4: … an honest 28 + 21: passed
NOTICE:  4. the uncarded identity: … a mixed-kind identity nests every seat it claims, and no row anywhere claims a count it cannot nest: passed
NOTICE:  5 … 9 (unchanged): passed
NOTICE:  10. create_field_link: … the 90-day fallback survives for a windowless seat and for a CLOSED one, no mint is dated in the past or revokes on behalf of one …: passed
NOTICE:  11 … 12 (unchanged): passed
NOTICE:  All W1b assertions passed.
ROLLBACK                                     W1B_EXIT=0   (13 lines matching "passed")

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  All W1a assertions passed.
ROLLBACK                                     W1A_EXIT=0   (49 lines matching "passed")

$ SUPABASE_DB_URL=…54322/postgres pnpm --dir <worktree> db:generate     GEN_EXIT=0
$ git diff -- packages/supabase/src/database.types.ts
+      party_kind_in_directory: { Args: { p_party_kind: string }; Returns: boolean }
                                              # the only drift, and it is the new function

$ pnpm --dir <worktree> --filter @patina/supabase type-check        SUPABASE_TC=0
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check DESIGNER_TC=0

# idempotency: the three edited files replayed over the reset DB, in one rolled-back tx
$ psql … -v ON_ERROR_STOP=1 -c BEGIN -f 00623 -f 00626 -f 00627 -c ROLLBACK
RERUN_EXIT=0   (output: five "already exists, skipping" NOTICEs, no error)
```

**No Deno or TypeScript file was edited** — `_shared/sms.ts` is named in
MAJOR-1 as the *consumer* of the RPC and is deliberately untouched; the fix is
entirely inside `create_field_link`. The three Deno suites the pre-push hook
names for that rail were run anyway, and are green:

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts
ok | 40 passed | 0 failed
$ deno test … supabase/functions/_tests/field-daily.test.ts
ok | 13 passed | 0 failed
$ deno test … supabase/functions/_tests/sms-inbound.test.ts
ok | 52 passed | 0 failed
```

### The seeded fixture, before and after all four SQL fixes

All 62 Directory rows (`display_name`, `role`, `reach_state`, `consent_status`,
`paper_state`, `seat_count`), the two view counts, and the claims-vs-nests table
for every row with seats, captured as `designer@patina.dev` on the pre-fix DB and
again after the reset:

```
$ diff baseline.txt after.txt ; echo DIFF_EXIT=$?
DIFF_EXIT=0
```

Byte-identical: no word moved, no count moved, no seat re-parented. The four
fixes bite only the cases the review constructed.
