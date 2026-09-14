# W3 (P2) — fix log, round 7

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
base `a5e624191`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken.** Migration **00629** edited in place (the
00621–00633 block is unapplied on Strata). **No migration minted** — nothing here needs a number
above 00633, and 00595–00620 stay reserved to the hour-tracking program.

Ten findings handed back — four in the data lane (`B-1`, `M-1`, `M-2`, `M-3`), one in the wave's own
record (`M-4`), and five in the designer portal (`R7-BLOCKING-1`, `R7-MAJOR-1..4`). All ten closed;
nothing else changed. The rulings that govern them, all already on `rulings.md` §3: **R-BN**
("a merge never deletes a typed fact"), **PR-o**, **PR-n**, **PR-a**, **PR-b**, **R-G**, **R-BD**,
**R-AI/R-AO**, **R-AY**.

---

## Gates, on a fresh database

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, clean replay (the CLI telemetry `EPERM` again needed `dangerouslyDisableSandbox` — harness, not product) |
| `people/w3_merge_sweep_household_test.sql` (**new block 11 + 11b**) | rc=0 — "11. the r7 review's three migration findings (B-1, M-1, M-2): passed", "11b. r7 M-1 negative control — the four legs still judge the ACT: passed", "W3 SQL suite: all blocks passed" |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` (**13h restored**) | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run; **one added statement** — the re-issued `REVOKE ALL ON FUNCTION public.sync_person_affiliation_from_pointer()` under 00629. Committed |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift (no column, table or function signature changed) |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `pnpm --filter admin-portal build` | rc=0, full route table printed (the strictest gate after the shared `@patina/supabase` edit) |
| `npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__` | **147 suites, 2893 tests, all green** (2885 before; **+8** new) |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **28 passed** (25 before; **+3** new) |
| `npx eslint` on the four touched designer files | clean |

No e2e run (the brief forbids taking a port this round). `e2e/people/merge.spec.ts` asserts the
announcer's prefix and the `studio_contact_merges` row; neither moved. `bring-forward.spec.ts` picks
by name, not by the trade chip, so the picker's filter change is not on its path.

Probes (one transaction each, ROLLBACKed):
`/tmp/claude/r7-m2-negctl.sql` (the pre-fix function body, re-measured) and
`/tmp/claude/r7-m2-posctl.sql` (the shipped one).

---

## B-1 · a firm merge dropped the folded card's own three designations — BLOCKING

**Where:** `supabase/migrations/00629_studio_contact_merges.sql` — the r5 B-1 / r6 M-4 COALESCE
statement, and its comment block above it.

**What shipped.** Three columns are added to the statement, each guarded against the one value that
cannot land:

```sql
paperwork_contact_person_id =
  COALESCE(s.paperwork_contact_person_id,
           NULLIF(v_merged.paperwork_contact_person_id, s.id)),
signer_person_id  =
  COALESCE(s.signer_person_id,  NULLIF(v_merged.signer_person_id,  s.id)),
site_contact_person_id =
  COALESCE(s.site_contact_person_id, NULLIF(v_merged.site_contact_person_id, s.id)),
```

`NULLIF(..., s.id)` is not decoration: on the SOLE-PROPRIETOR fold the folded firm names the
SURVIVING PERSON as its own site contact, and `assert_studio_contact_designations()` (00592/R-AP)
raises `designated_person_is_self` on that, which would abort the whole merge. R-BN is satisfied
either way — the folded card keeps its own copy of all three.

The sheet now prints them too. `carriedRows()`
(`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx`) gains three
name-resolved rows — Paperwork contact, Signer, Site contact — rendered only where a card holds one,
so the ordinary thin duplicate still shows nine rows. The names come from the book the two cards
live in (`useStudioContacts(card.organization_id)`, the same query key `company-card.tsx` uses), so
no id reaches a face. The consequence sentence at `:109-111` — "…'s seats, channels **and firm
designations** move onto \<survivor\>" — is now true rather than aspirational.

**Measured.** New SQL block 11, on a fresh database, PR-o's default (the older card survives):

| | before the fix | after |
|---|---|---|
| firm→firm, survivor's three | `(null) (null) (null)` | `R7 Paperwork Hand · R7 Signer Hand · R7 Site Hand` |
| folded card's own three | held | still held (R-BN) |
| sole-prop fold, survivor's paperwork contact | `(null)` | carried |
| sole-prop fold, survivor's site contact (the self case) | — | `NULL`, no refusal, merge completes |

Negative control: with `00629` stashed and the database reset, block 11 fails at its first
assertion — `BLOCK 11 FAIL (r7 B-1): paperwork_contact_person_id did not travel (<NULL>)`.

Jest: `resolves the Firm the way the Directory and the picker do` and
`prints the three firm designations, resolved to names`.

---

## M-1 · four successor legs were never gated on `v_retiring` — MAJOR

**Where:** `00629` §4c, `assert_compliance_holder()`.

**What shipped.** `compliance_successor_wrong_type`, `compliance_successor_not_later`,
`compliance_successor_undated` and `compliance_successor_drops_a_gate` each take `v_retiring AND`,
exactly as `compliance_successor_already_superseded` and `compliance_successor_already_lapsed`
already did. §4c's banner is rewritten to say so: the two TIME-varying legs plus four EDIT-varying
ones, six in all, judge the ACT of pointing a paper at its renewal; the four STRUCTURAL legs —
holder exists, holder kind, holder studio, successor held for the same card in the same studio —
still run on every write. The inner note in §5's cross branch that said "v_retiring suppresses only
the two time-varying legs" is corrected in the same file.

**Measured.** Both variants, each reached by two ordinary member writes, on a fresh database
(block 11):

```
shrink a renewal's blocks to {site_access}, then merge   -> before: ERROR compliance_successor_drops_a_gate
                                                            after:  2 of 2 chain rows moved
correct a renewal's expires_on earlier, then merge       -> before: ERROR compliance_successor_not_later
                                                            after:  2 of 2 chain rows moved
```

Negative control **11b**, on the fixed file: writing a supersede edge that drops a gate, that ends
earlier, or that names a W-9 as a certificate's renewal is still refused by name
(`compliance_successor_drops_a_gate`, `_not_later`, `_wrong_type`/`_undated`). The r1 MAJOR-4 /
r2 MAJOR-1 / r3 MAJOR-1 laundering doors stay shut.

---

## M-2 · the fold's closed crew affiliations were re-derived by the next ordinary card save — MAJOR

**Where:** `00629` new §4e — `sync_person_affiliation_from_pointer()`, grafted from `00592:580-666`.

**What shipped.** One disjunct on the branch that already stands down for two older malformations:

```sql
OR (SELECT sc.merged_into FROM public.studio_contacts sc
     WHERE sc.id = NEW.company_id) IS NOT NULL
```

It is re-issued in **00629**, not edited in 00592, for a reason the banner states: the disjunct
reads `studio_contacts.merged_into`, which §1 of 00629 is the migration that ADDS — the 00592 body
must stay runnable on every `company_id` write between the two files. Same signature, same
`SECURITY DEFINER` and `search_path`, same branches in the same order; the 00592 trigger is not
re-issued because it already fires on the same column. `REVOKE ALL … FROM PUBLIC, anon,
authenticated` is restated and `00-legacy-grants.sql` regenerated.

**Measured** (`/tmp/claude/r7-m2-negctl.sql` vs `-posctl.sql`, the reviewer's `pA` shape, both
rolled back):

```
PRE-FIX  open affiliations after ONE ordinary re-save: 1
         Bookkeeper | 2021-01-01 | 2026-09-14
                    | 2026-09-14 | (open)      <- role NULL, paperwork f, licence f
SHIPPED  open affiliations after ONE ordinary re-save: 0
         Bookkeeper | 2021-01-01 | 2026-09-14
```

The pointer still stands (R-BN), so `people_directory`'s `company_name` COALESCE still resolves the
firm's name and r6 M-3 holds. Block 11 asserts all four facts, plus a negative control: a pointer at
a LIVE firm with no open affiliation still derives one, which is R-AI.

---

## M-3 · the TEAM-branch assertion was removed in the same wave that shipped the leg — MAJOR

**Where:** `supabase/tests/people/w1b_compliance_authority_directory_test.sql`, block 13h.

**What shipped.** The predicate is back to `role <> 'contact'`, the error message names both
branches, and the 22-line comment is replaced with what the file actually does: `00629:2376-2380`
gives the TEAM branch R-BD's tenant conjunct, `w3-data-report.md` records that correction as MADE,
and the narrowing had therefore left a cross-tenant visibility fix with no assertion anywhere.

**Measured:** rc=0 on a fresh database — "All W1b assertions passed." The original predicate returns
**0 rows** for the block's own outsider (`a0000000-…-0002`, an ordinary member of Test Studio B and
a co-member of the seeded studio's designer of record), and **0** `team` rows anywhere.

---

## M-4 · the data report described the pre-r4/r5/r6 migrations — MAJOR

**Where:** `artifacts/people-room-crm-2026-09-11/build/w3-data-report.md`.

Carried forward against the shipped files, every row the review named:

| Was | Now |
|---|---|
| §1 `studio_contact_merges` RLS "SELECT + INSERT" | "SELECT only" — `00629:331` drops the member INSERT policy, `:333-334` grants SELECT alone; the measured refusal (`permission denied for table studio_contact_merges`) is quoted |
| §1 eight refusals | eleven, with `merge_survivor_archived`, `merge_two_logins` and `merge_contact_rule_conflict` named and line-referenced |
| §1 channels "deleted" | "REDUCES onto the survivor first" — the worst-first ranking, `status_at`, `verified`/`preferred`, `label` (r6 B-1) |
| §1 affiliations "deleted" / "every affiliation naming the merged firm is deleted" | collisions REDUCE (r6 M-2); the cross-kind fold CLOSES third parties with `to_date` and keeps the legacy pointer (r6 M-3); r7 M-2's stand-down named |
| §1 repoint item 5 (designations) | both halves — other cards' designations repointed, and the folded card's own three carried (r7 B-1), with the `NULLIF` self case |
| §2 notices `(document_id, state)`, no `expires_on` | `expires_on NOT NULL` and `UNIQUE (document_id, state, expires_on)` (r5 M-3), with `clear_compliance_notices_on_date_change()` as its own object row and its own paragraph |
| §4 / §9 omit the money guards | `set_household_threshold(uuid, integer)` and `assert_household_threshold_principal()` added to the object table, the RPC list and the trigger-function list |
| §0/§8 "five bid columns" | eight, in both places, plus `studio_compliance_notices.expires_on` in the generated-types diff |
| §7.2 "narrowed to `role NOT IN ('contact','team')`" | records the r7 revert and why |
| empty "### The finding that is owed, not fixed" heading at :311 | deleted |
| §8 suite "7 blocks" | 12 blocks as of r7 |

---

## R7-BLOCKING-1 · saving the bid editor rewrote the stage and re-dated the exit

**Where:** `packages/supabase/src/hooks/use-coordination.ts` (`useSetPartyBid`) and its one call site,
`apps/designer-portal/src/components/document/roster/roster-row.tsx` (`saveBid`).

**What shipped.** `SetPartyBidInput` gains a REQUIRED `previous: { bidOutcome, stage }`, so the hook
can tell a transition from a re-save at the type level rather than by convention — the designer
portal's one call site passes the row's own `bid?.bidOutcome` and `row.stage`, which is exactly what
`openBidEditor` seeds the draft from. Two guards:

* `stage` is written only when `(patch.bidOutcome ?? null) !== (previous.bidOutcome ?? null)`, and
  then only when the seat is not already past the bid — `SEAT_STAGES_PAST_THE_BID` is
  `mobilized · active · closeout · warranty · retired`. `withdrawn` is the one outcome that still
  reaches past them, because a seat that left the job left it.
* `off_job_at` is stamped on the transition INTO `withdrawn` only, so a Done row re-saved weeks
  later keeps the day the seat actually left the job — the date `rosterWindowClause` prints.

**Why the guard is stage-shaped and not rank-shaped:** correcting a mis-picked `selected` back to
`declined` on an `awarded` seat must still work (that is MAJOR-7's own reason for offering this
editor at all), and it does — `awarded` is not in the past-the-bid list.

**Vitest**, three new cases: `writes no stage and no date when the outcome did not move`;
`never regresses a seat that is already past the bid` (`quoted → selected` over `stage: 'active'`
writes `bid_outcome` and no `stage`); `still takes a crew off the job when they withdraw`
(`selected → withdrawn` over `stage: 'active'` writes `off_job` and today's date).

---

## R7-MAJOR-1 · the merge sheet's Firm row said neither card had a firm

**Where:** `compare-merge-sheet.tsx`.

`card?.company_name ?? "—"` is replaced by `firmNameOf(card)`: `company_id` → the firm card's own
name through the book, with the legacy column as the fallback — the same answer
`directoryFirmOf`/`people_directory` gives the Directory row, the person-card header and this wave's
picker. The book is read once and serves the three designation names as well (B-1 above), on the
query key `company-card.tsx` already uses.

Jest: `resolves the Firm the way the Directory and the picker do` — a card carrying
`company_name: null` with `company_id` naming Northgate Electric now prints **Northgate Electric**
where the sheet printed `—`, which is the same mark its table uses for "not read".

---

## R7-MAJOR-2 · the trade chip hid every row whose trade the picker itself printed

**Where:** `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx`.

One module-level resolver, `tradesOfCard(contact, firmCardById)` — own `trades[]`, then the FIRM
card's `trades[]`, then the legacy `specialties[]` — is now the single source for both the filter
and the printed word: `scanned` filters `tradesOfCard(c, firmCardById).includes(trade)` and
`tradeFor` returns `tradesOfCard(...)[0]`, byte-identical in behaviour to the expression it replaces.
A SET rather than a single value, so a card carrying two trades is found by either.

Jest: `finds a card by the trade its FIRM carries, which is the trade the row prints` — the mini row
reads `Subcontractor · Northgate Electric · Electrical`, and pressing kind Subcontractor then trade
`electrical` returns the row instead of "– No one by that name in the rolodex."

---

## R7-MAJOR-3 · "Add to the household" was offered ungated and always refused (PR-n)

**Where:** `apps/designer-portal/src/components/document/roster/household-band.tsx`.

`householdAddIsHeld(isPrincipal, thresholdCents, role)` mirrors `add_household_member()`'s own grant
leg (`00632:395-400`): a figure on the household, the `client_rep` role, and a caller who is not an
owner or an admin. In that state the act carries `disabled` + `held` (so `DocumentAction` renders
`aria-disabled` and keeps it focusable, never a bare `disabled`), `aria-describedby` pointing at a
standing reason that prints beside it whether or not it is pressed, and `onHeldActivate` that says
the reason out loud — the same idiom as the two figure acts on the same band and as
`archive-card-door.tsx`.

`householdMemberConsequence()` takes a `canGrant` flag and drops the money clause in that state, so
the sentence stops promising "They may sign money to $2,500." over an act that cannot write it. The
reason names the way through: add them as "decides the work" instead, or ask an owner or an admin.

Jest, three new cases: the pure `householdAddIsHeld` truth table (held only for the one combination
the database refuses); the held act with its reason and the shortened sentence; and the control —
switching the role to "decides the work" leaves the act live for the same plain member.

---

## R7-MAJOR-4 · a bid refusal was announced in the voice that says it succeeded

**Where:** `roster-row.tsx`.

`saveBid`'s catch writes to a new `bidError` state rendered as a `role="alert"` line inside the bid
editor (`data-bid-error`), beside the act that failed — the idiom CR11-10 settled and the one every
other refusal in this wave already uses. The polite `role="status"` announcer keeps only the success
sentence. `openBidEditor` clears it, so a stale refusal cannot outlive the editor.

Jest: `prints a refused bid in the row's own alert line, not the announcer` — a rejected
`party_bid_quoted_by_not_a_person` lands in `findByRole('alert')` and `onAnnounce` is not called.

---

## What this round did NOT touch

The r7 reviews' 18 migration MINORs, 11 code MINORs and the QA findings are out of this brief and
remain open. Nothing was deployed, no port was taken, no migration was minted, and no file outside
the ten findings was changed.
