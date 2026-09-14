# W3 (P2) — fix log, round 10

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
base `d06cbe50e`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken.** Migration **00629** edited in place (the
00621–00633 block is unapplied on Strata). **No migration minted** — nothing here needs a number
above 00633, and 00595–00620 stay reserved to the hour-tracking program.

Five findings handed back: one blocking in the data lane (`BLOCKING-1`, the sole-proprietor fold's
paper), one blocking in the portal (`BLOCKING-1`, the household's money sentence), two major
(`MAJOR-1` the dead bid-refusal token, `MAJOR-2` the picker's person-held paper) and one QA finding
needing a ruling (`F1`, the sixth bring-forward candidate). All five closed; nothing else changed.
Governing rulings, all on `rulings.md` §3: **R-BN**, **R-BA**, **R-BJ**, **R-K**, **R-BP** (new,
2026-09-14), **PR-h**, **PR-i**, **PR-n**, **R-J**.

---

## Gates, on a fresh database

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, clean replay, head **00633** (the CLI telemetry `EPERM` again needed the sandbox off — harness, not product) |
| `people/w3_merge_sweep_household_test.sql` (**one new block: 11g**) | rc=0 — "11g. r10 BLOCKING-1 — the folded firm's paper stays readable for its crew: passed", "W3 SQL suite: all blocks passed" |
| block 11g **negative control** — 00626's body restored inside a transaction, suite re-run | `ERROR: BLOCK 11g FAIL (r10 BLOCKING-1): the crew's Directory paper word reads not_on_file after the fold`. The block pins the fix, not the fixture |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run — two new lines, the restated `REVOKE`/`GRANT EXECUTE` on `identity_paper_state(uuid, uuid)` under 00629. Nothing else moved |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift (no column, table or function signature changed) |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `pnpm --filter admin-portal build` | rc=0, full route table printed |
| `apps/designer-portal` `npx jest` (whole suite) | **593 suites, 7665 tests, all green** |
| `packages/supabase` `npx vitest run` (whole suite) | **105 files, 1337 passed / 12 skipped** |

---

## BLOCKING-1 (data) — the sole-proprietor fold blanked the firm's paper word on the rest of the crew

**Where the fix landed:** `supabase/migrations/00629_studio_contact_merges.sql`, new **§4f**
(between §4e and §5), plus the banner and one comment in §5's seats branch.

The pointer must keep naming the folded card (R-BN, r6 M-3), so the resolution went into the
READER — and into the ONE reader rather than its three call sites, because R-BA is "one formula
serves every reader". `identity_paper_state()` is re-issued, grafted from 00626:949-972 (the latest
body; `grep -rln "CREATE OR REPLACE FUNCTION[^(]*identity_paper_state"` answers 00626 alone), with
the worst-first order, the de-duplication leg, the ACL and the `search_path` pin unchanged. Only the
two ids handed to `compliance_state()` moved:

```sql
COALESCE(public.resolve_merged_contact(p_card_id),    p_card_id)    AS card_id,
COALESCE(public.resolve_merged_contact(p_company_id), p_company_id) AS company_id
```

`COALESCE` and not the bare call: §3 is SECURITY INVOKER and answers NULL for a card the caller may
not read, and a holder that cannot be resolved must fall back to the id it was handed rather than
drop out of the reduction. A live id resolves to itself, so every unmerged call is exactly today's
answer — which is what block 11g's control 5 asserts.

Because the three call sites (`00629:2477` party branch, `00629:2743` CONTACTS branch, `00626:2169`
`people_directory_seats`) call the function by name, and `CREATE OR REPLACE` keeps the OID, both
views pick the new body up with no view change at all.

**`00629`'s v_cross seats branch (the review's "also reconsider"):** the blanket
`SET company_id = NULL` stays, and the comment now says why. There is no legal alternative — the
survivor is a PERSON card and `party_company_not_a_company` (00624) refuses one in that column — and
it costs the crew seat nothing: `company_name` is a free-text snapshot the merge never writes, so
the Call Sheet row still prints the firm's name, and 00626's `COALESCE(seat's firm, card's firm)`
(R-BJ) falls back to the crew card's own pointer, still the folded firm, which §4f now resolves.

**Measured, fresh reset, rolled back** — the reviewer's own probe,
`build/probe52-r10-soleprop-crew-seat.sql`:

| Face | Before the fold | After the fold (r9) | After the fold (now) |
|---|---|---|---|
| `people_directory` — Joe Crew | `lapsed` · Northgate Probe Electric | `not_on_file` · Northgate Probe Electric | **`lapsed`** · Northgate Probe Electric |
| `people_directory_seats` — Joe's seat line | `lapsed` | `not_on_file` | **`lapsed`** |
| Dana Soleprop (the survivor) | `lapsed` | `lapsed` | `lapsed` |

**Pinned by** `supabase/tests/people/w3_merge_sweep_household_test.sql` **BLOCK 11g**: a fold with a
third-party crew member on a seat and a firm `coi_gl` lapsed 2026-03-31 gating
`{site_access, payment, draw}` — the crew's Directory `paper_state`, their seat line's
`paper_state` and the firm NAME on the row all asserted through the fold; the survivor asserted
unchanged; **firm-into-firm as the negative control** (it repoints `company_id` outright at
`00629:1736+` and is unaffected, asserted on both the row and the seat line); and a live paperless
card asserted still `not_on_file`, so the resolution cannot invent paper.

---

## BLOCKING-1 (portal) — "They may sign money to $X." over a grant the RPC leaves standing

**Where the fix landed:** `packages/supabase/src/hooks/use-households.ts`,
`packages/supabase/src/hooks/index.ts`,
`apps/designer-portal/src/components/document/roster/household-band.tsx`.

`useProjectHousehold`'s existing `project_party_authority` read (the one behind
`clientSideHasAuthority`) is widened rather than duplicated — same request, three more columns, no
`.limit(1)` — and returns `clientSideMoneyGrants`: `{ engagementId, personId, partyKind,
thresholdCents, sourceClause }` for every OPEN `money` grant on the job's client side. Keyed on
`(personId, partyKind)` and taking the earliest seat, because `add_household_member()` reuses a seat
by `(project_id, studio_contact_id, party_kind) ORDER BY created_at LIMIT 1` (00632:362-369) — so
adding somebody as "signs for the household" when their only seat is a plain client one opens a NEW
seat, which carries no grant at all.

`householdMemberConsequence()` gains a sixth argument and branches three ways, which is the
distinction `householdThresholdConsequence` (`:117-123`) already made correctly:

* no open grant → today's clause, "They may sign money to $5,000.";
* grant sourced `client_households.co_threshold_cents` → today's clause (the RPC moves it);
* any other clause → "Chidi Okonkwo already signs money to $2,500 on the Okonkwo residence,
  recorded outside the household, and that figure stands." (and, where that grant carries no
  figure, "… already signs money on the Okonkwo residence, recorded outside the household with no
  figure on it, and that stands.")

The clause TEXT is never printed — `source_clause` is studio-typed prose on the fixture ("Owner
agreement, Exhibit B §4.2") but may be anything, and SPEC §8 #3 governs. `HOUSEHOLD_GRANT_SOURCE_CLAUSE`
is exported from `@patina/supabase` so the face and the RPC name the household's clause in one place.

**Measured on the shipped seed** (`project_parties` ⋈ `project_party_authority`, Okonkwo residence):
seat `d0e30000-…-000000000005`, `client_rep`, Chidi Okonkwo, open `money` grant `250000` /
`Owner agreement, Exhibit B §4.2` — the exact row the reviewer probed. The band now prints the
standing figure instead of promising $5,000 over the Call Sheet row's "Signs money to $2,500."

**Tests:** `household-band.test.tsx:129`'s unconditional pin moved with the sentence, plus four new
cases (foreign clause; foreign clause with no figure; household-sourced clause; no grant) and one
RENDER case that pins the wiring — choose Chidi with a foreign grant on file and
`[data-household-consequence]` carries the standing sentence; choose Adaeze, who carries none, and
it carries the household's promise.

---

## MAJOR-1 — the bid editor's date-order refusal named a constraint that does not exist

**Where the fix landed:** `packages/supabase/src/hooks/use-coordination.ts` (`BID_REFUSAL_SENTENCES`),
`packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts`.

`project_parties_bid_valid_until_check` → **`project_parties_bid_window_check`**, the name 00631:86-88
actually mints and the one the catalog reports. No second key kept: 00631 is unapplied on Strata, so
no deployed constraint carries the old name.

The test now asserts against the REAL PostgREST message (the whole
`violates check constraint "project_parties_bid_window_check"` string, not the bare token), and a
second test asserts the dead token no longer resolves — so the next rename is caught rather than
staying green on a string the database never emits.

---

## MAJOR-2 — the picker's expiry clause could not see a paper the PERSON holds

**Where the fix landed:** `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx`,
`apps/designer-portal/src/lib/document/compliance-notice.ts`.

Both halves, as the review set them out:

1. **The read.** `firmIds` (company ids only) becomes `paperHolderIds` —
   `hits.flatMap(c => [c.company_id, c.id])` — so a 00623 `holder_type = 'person'` document is a
   candidate at all. `useComplianceDocumentsFor` is holder-agnostic (`.in('holder_id', ids)`), and
   the picker's page of hits is already capped, so this is the same one request.
2. **The name.** `noticedPaperClause`'s `holderName` now also accepts a RESOLVER —
   `(doc) => doc.holder_id === contact.id ? contactName(contact) : firmNameFor(contact)` — at both
   picker call sites (the mini row and `pickedFacts`, which feeds SPEC §5.7 #7's consequence
   sentence). A plain string still works and still means "this is the holder", which is what the
   company card (`company-card.tsx:522`) and the roster row (`roster-row.tsx:290`) each have; neither
   changed. This is the branch 00630:368-375 already makes for the notification, so the room and the
   notice name a holder the same way.

**Tests:** `compliance-notice.test.ts` gains a resolver case (person-held licence under the person's
name, firm-held certificate under the firm's, one call site, one resolver).
`rolodex-picker.test.tsx` gains "prints a person-held expiry under the person's own name", and its
`useComplianceDocumentsFor` mock now FILTERS by the holder ids it is handed — as the real hook does —
so the fetch half is pinned too. Verified the pin bites: reverting `paperHolderIds` to
`hits.map(c => c.company_id)` fails that test (`Rosa Martínez's licence lapsed 31 March 2026.` →
nothing), restored immediately after.

Not reachable on today's fixture (the seed's one person-held document expires 2029-05-01 and
`studio_compliance_notices` is empty), which is why the tests carry the evidence.

---

## F1 — the bring-forward picker's sixth candidate (ruled R-BP)

**Ruling:** R-BP (Fable, 2026-09-14) — *"The bring-forward picker's candidate pool is whatever the
studio's book holds for the prior job: on the dev seed 'Lindqvist' returns six people (Ben Ostrom,
Claire Bissett, Dana Kowalski, Erin Sato, Ingrid Halvorsen, Pete Rusk). SPEC §5.7 is amended from
five to six (Erin Sato listed, not selected, the GC PM who also worked the closed job); no exclusion
rule is invented to hide her."* Option (a), not (b): **no picker query change was made.**

**Measured on the fresh reset** — every card holding a seat on the Lindqvist kitchen:

```
Ben Ostrom (gc) · Claire Bissett (vendor) · Dana Kowalski (sub)
Erin Sato (gc) · Ingrid Halvorsen (sub) · Pete Rusk (sub)      -- six
```

Changed, and only these:

* `specimens/SPEC.md` §5.7 rows 3 and 4 (five → six, Erin Sato as row f: Marrow & Sons · project
  management · not selected · the same history line · reach "Field link"), plus a dated note under
  the table recording R-BP and what it did and did not change;
* both specimen plates — `people-room-1440.html` (`CARRY`) and `people-room-390.html`
  (`PICK_ROWS`) gain `F-08` unticked, and the hard-coded count line reads "4 of 6". Erin Sato is
  F-08 in SPEC §3's own fixture, so §5.7 #8 ("no name outside §3") still holds; four are still
  ticked, the act still reads "Add four to the roster" and the consequence sentence is unchanged.
  `specimens/publish/` is left alone: it is the snapshot of what was published;
* `e2e/people/bring-forward.spec.ts` — "4 of 5" → "4 of 6", plus an assertion that Erin Sato's row
  is present and NOT ticked, so an exclusion rule invented later fails the suite;
* `src/lib/document/bring-forward.ts`'s doc comment and its unit test's example, which quoted the
  dead string.

The e2e run itself is not part of this round — the brief forbids starting a server — so the change
rests on the pool measured in SQL above and on the QA round's own walk
(`qa-w3-r10/bring-forward-okonkwo-1440.png`, `-390.png`).

---

## What was NOT changed

Every minor from the three r10 reports (migrations m1–m6, code m1–m13, the QA report's §6 notes) is
untouched: this round was the five findings handed back and nothing else. `resolve_merged_contact()`
still carries no `proconfig` pin (migrations m3) — it is SECURITY INVOKER, schema-qualifies its one
relation, and is now called from `identity_paper_state()`, which does pin `search_path=public`.
