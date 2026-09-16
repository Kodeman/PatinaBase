# W3 (P2) — adversarial migration review, round 21

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full this round: `00628`–`00634`; the bodies they graft or stand in front of
(`project_tenant_org` / `project_recorded_studio` / `project_party_recorded_studio` and the four
`project_party_authority` policies 00624:190-400, :975-1041; `assert_compliance_holder` and
`sync_person_affiliation_from_pointer` as re-issued in 00629 §4c/§4e; `people_directory` v5 whole);
`supabase/tests/people/w3_merge_sweep_household_test.sql` (block 13e in full);
`w3-data-report.md`; `w3-fix-log-r20.md`; `w3-review-r20-migrations.md`; `rulings.md`;
`direction.md` §3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7;
`w1a-report.md`, `w1b-report.md`, `w2a/b/c-report.md`, `w2-review-r15-qa.md`;
`briefing/fixture.md` §4. Plus the four surfaces that decide whether 00634's new REFUSAL reaches a
face: `use-coordination.ts` (`useCloseProjectPartySeat`, `useSetPartyBid`, `asBidError`),
`roster-row.tsx`, `close-seat-act.tsx`, `lib/document/write-error.ts`, and `household-band.tsx` as
the surface that already holds the identical PR-n rule in words.

**Verdict: NOT clean — ZERO BLOCKING, THREE MAJOR, thirty-four minor.**

r20's BLOCKING is **fixed and re-measured**: 00634 now states its gate in the body and refuses the
close, block 13e pins both populations, and my own probe reproduces both refusals.

All three majors are **consequences of that fix reaching surfaces that never learned it**:

* the two refusal tokens r20 minted are printed **verbatim** on three faces, and neither close act
  is `held` for a caller without the standing — while `household-band.tsx` already holds exactly
  this PR-n rule in words one region away (§2);
* the Bidding band's **"They withdrew"** press is a seat close, so it is refused for a plain member,
  and when a principal takes it and then corrects it back (R-BR) the seat returns to the job with
  its money delegation silently ended and no act in the room to restore it (§3);
* `w3-data-report.md` — the wave's own deploy record, and the document this review was pointed at —
  still describes a **six-migration** wave and never names `00634` (§4).

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` | **clean**, rc=0, run TWICE — "Finished supabase db reset on branch main." Ledger head `20260910152111`, then `00634 … 00627` |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." (re-run after both resets) |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed", **13e last**; re-run against the already-run database and **leaks no committed row** (`job_runs` 2→2, `studio_compliance_notices` 3→3, `notification_log` 6→6) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | **no diff** — "baseline + 2767 replayed statements" |
| migration numbering | `00628`–`00634`, all above `00627`, none inside the reserved `00595`–`00620`; nothing minted this round |
| function `proconfig` / ACL (22 wave functions, `pg_proc`) | every one pins `search_path=public` **except `resolve_merged_contact` (proconfig NULL — m3)**. **Zero `anon` grants** anywhere in the wave |
| `project_consent_org()` in policies (`pg_policy`) | **0**. R-BD's retirement from guards holds; the twelve remaining callers are the ledger key, as ruled |
| `client_decisions_court_check` | eleven words, strict superset of 00212/00281's seven; measured from `pg_get_constraintdef` |
| 00628 backfill | 8 projects, **5 still `studio_id IS NULL`**, all ambiguous, 0 carrying seats — zero and several both stay NULL, as R-BD rules |
| cron | `compliance-document-expiry-sweep`, `0 6 * * *`, `SELECT public.sweep_compliance_expiries();`, active |
| sweep idempotence + recipients | run twice in one rolled-back transaction: `{"scanned":3,"notices":3,"notified":6}` then `{"notices":0,"notified":0}`; `job_runs` carries `succeeded` / `skipped` on contention; recipients **owner + admin only** |
| `studio_compliance_notices` / `studio_contact_merges` | **SELECT-only** policy and **SELECT-only** grant for `authenticated`; no INSERT/UPDATE/DELETE policy; service_role full |
| `client_households` policies (`pg_policy`) | SELECT/UPDATE carry the tenant + co-member legs; INSERT/UPDATE WITH CHECK carry PR-n's figure leg; DELETE is `is_active_studio_member AND is_org_admin_or_owner` (r18-n2 stands) |
| `studio_contacts` grants | `authenticated` holds SELECT/INSERT/UPDATE and **no DELETE**, and there is no DELETE policy — so the ON DELETE CASCADE / SET NULL paths below are service_role-only |
| branch RLS suites (`supabase/tests/rls/*.sql`, 24 files) | **21 pass, 3 fail** — `design_requests_test`, `field_parties_test`, `studio_titles_test`; unchanged from r18/r19/r20 (n6). (`00563_proposal_signing_multi_studio.test.sql` passes; a first pass of my harness mis-scored it on the string "fails closed".) |

### 1.2 Every r20 finding re-checked

| r20 | State |
|---|---|
| **BLOCKING-1 / qa BLOCKING-1** — 00634's trigger wrote a money grant for callers the authority policies refuse, cross-tenant included | **FIXED.** `00634:146-162` states the gate in the body and **refuses the close**; `13e-a…k` pin both populations. Re-measured independently (`probe-r21-a`, C1): a plain member of the recorded studio is refused `seat_close_money_authority_forbidden`, record untouched. **The fix opens §2 and §3.** |
| **qa BLOCKING-2 / code major-1** — "Close this seat" offered on an already-closed seat, overwriting the day and erasing the reason | **FIXED.** `roster-row.tsx:230` `seatAlreadyClosed`, `:1207-1223` `disabled` + `held` + described-by; `use-coordination.ts:870-895` reads the standing row before writing |
| **major-2** — `w3-room-report.md` §2/§5 stale | out of this lane (room report). **`w3-data-report.md` is worse than r20 recorded — see §4.** |
| r20-n5 — the file argues money while the trigger ends every scope | **PARTLY FIXED.** The COMMENT now says "every scope, not money alone" (`00634:178-179`); the **file title still reads "CLOSING A SEAT ENDS THE MONEY IT CARRIED"** (`00634:2-3`) |
| r20-n6 — no block asks who may fire the trigger | **FIXED** — block 13e is that negative control |
| r20-n1 · r20-n2 · r20-n3 · r20-n4 · r18-n2 · r18-n3 · r17-n2 · n1–n9 · m1–m16 | **ALL OPEN** — each re-read or re-measured this round; restated in §5 |

---

## 2. MAJOR-1 — r20's two new refusals are raw schema tokens on three faces, and neither close act is held for a caller without the standing

**Severity: major. Confidence: high (measured on the freshly reset database, one transaction,
ROLLBACKed, room acts only — `build/probe-r21-a-seat-close-gate-on-the-face.sql` / `.out`).**

### What the fix minted

`00634:151` and `:157` raise two bare tokens with no SQLSTATE, so PostgREST returns them as
`message`:

```
seat_close_authority_forbidden
seat_close_money_authority_forbidden
```

Grepped across the whole worktree, the only non-migration, non-test, non-artifact occurrences are
**none**: no hook, no error mapper, no component knows either word.

### Where they land

Three surfaces, none of which translates them:

| Surface | Line | What it prints |
|---|---|---|
| Call Sheet roster row, "Close the seat" | `roster-row.tsx:1088-1092` | `setNote(e instanceof Error ? e.message : 'Could not close the seat.')` → into the sheet's `role="status"` announcer |
| Person card, `CloseSeatAct` | `close-seat-act.tsx:127-131`, rendered at `:145-152` | `setError(e.message)` → `role="alert"` paragraph |
| Bidding band, "They withdrew" | `roster-row.tsx:600` → `write-error.ts:79-86`, rendered `:1027-1033` | `writeErrorMessage(e, …)` falls through: its schema-word guard tests `/duplicate key\|violates\|constraint\|idx_\|_fkey\|_pkey\|column \|relation /i`, which a bare token matches on none of, so it `return raw` |

`@supabase/postgrest-js@2.98.0` declares `class PostgrestError extends Error`
(`dist/index.d.cts:7`), so `e instanceof Error` is **true** and `e.message` is the token itself. The
first two paths do not even reach `writeErrorMessage`.

`asBidError` (`use-coordination.ts:2489-2512`) has its own map of six tokens; neither new one is in
it, and its own fallthrough is `return message`.

### Measured

`probe-r21-a`, C1 — a plain `member` of `b0000000-…-0001` presses "Close this seat" on a `sub` seat
on the Okonkwo residence carrying an open `money` grant of $5,000 (`source_clause 'agreement §4'`,
R-J — the Add sheet writes exactly this, `add-person-sheet.tsx:893-911`, gated on admin standing but
**not** on party kind):

```
C1 refused, message the portal prints verbatim: seat_close_money_authority_forbidden
```

### Why this is the program's own standard and not a new one

`write-error.ts` states the rule in its own header — "A raw Postgres string is still never printed …
a schema word (SPEC §8 #3) is replaced by the fallback rather than shown" — and its body carries
eleven hand-written translations for exactly this class, each with a comment saying the token
"reached the face verbatim" before it was added (`:32-77`, CR-3, M2R-4, code-review MAJOR-3).
00634's two tokens are the twelfth and thirteenth and were not added with them.

### And the act is offered, not held

`household-band.tsx` already holds the identical PR-n rule on the face: it reads the caller's own
role (`:328` `role === "owner" || role === "admin"`) and prints
"A change-order figure is the principal's to set. Ask an owner or an admin of the studio." (`:723`,
`:753`, `:785`) rather than letting `set_household_threshold()` answer. Neither close act reads
anything about standing: `roster-row.tsx:1207-1208` holds the act **only** for
`seatAlreadyClosed`, and `close-seat-act.tsx:72-86` holds it for nothing at all. Direction §5.5 /
SPEC §7 #4 — a gated act keeps its reason on the face — is the rule the r20 fix log itself invoked
for the already-closed case one paragraph earlier.

### The closed loop this re-opens

`merge_seat_collision`'s HINT (`00629:1727-1729`) names one repair: *"Close one of these two seats
first, then merge."* For a plain member folding a duplicate whose seat carries a money grant, that
repair is now refused, in a schema word, and the merge sheet's own fourteen-sentence refusal map has
no entry for it. That is r6 M-1's shape — a refusal naming a repair the database then refuses —
restored for every caller who is not an owner or an admin.

### Where a fix belongs (not prescriptive)

Two sentences in `write-error.ts` beside CR-3's three, both close surfaces routed through it rather
than through `e.message`, and the act **held** with its reason for a caller whose
`useStudioRole`/`role` is not owner or admin — the shape `household-band.tsx` already ships. A pin
belongs beside 13e, in the portal tests, not in SQL.

---

## 3. MAJOR-2 — the Bidding band's "They withdrew" is a seat close, so it is refused for a plain member; and correcting it back (R-BR) returns the seat to the job with its money delegation silently ended

**Severity: major. Confidence: high (measured, `probe-r21-a` C2/C3/C4).**

`useSetPartyBid` writes `off_job_at = today` on the transition into `withdrawn`
(`use-coordination.ts:2630-2632`). That is `NULL -> a date` on `project_parties.off_job_at`, which is
exactly `end_party_authority_at_seat_close_trg`'s `WHEN` clause (`00634:194-198`). So the Bidding
band is a second door into 00634, and nothing in 00631, 00634 or either report says so.

### (a) A plain member cannot record a withdrawal

```
C2 refused, message asBidError()/writeErrorMessage() return verbatim:
   seat_close_money_authority_forbidden
C2 after  stage bidding  bid_outcome quoted  off_job_at (none)  money 500000  effective_to (none)
```

Recording what a bidder did is not a money act, and PR-n says nothing about it; the seat's grant is
incidental. The press is refused, in a schema word, in the one band §3.4 exists for.

### (b) The correction R-BR rules leaves the money ended

```
C3 (owner) after  stage off_job  bid_outcome withdrawn  off_job_at 2026-09-15  money 500000  effective_to 2026-09-15
C4 (owner corrects to "They quoted", R-BR clears off_job_at + off_job_reason)
C4 after  stage bidding  bid_outcome quoted  off_job_at (none)  money 500000  effective_to 2026-09-15
```

The seat is back on the job, banded into Bidding, `off_job_at` NULL — and its `money` grant is
closed. `usePartyAuthority` (`use-coordination.ts:1911-1917`) keeps a grant while
`effective_to >= today`, so the person card prints "Signs money to $5,000." **today** and stops
printing it tomorrow, with no act between.

00634's banner rules this deliberate (`:59-64`: "R-BR's correction … deliberately does NOT re-open a
grant: … re-opening one is its own named act with its own consequence sentence"). **There is no such
act.** The only writer of `project_party_authority` in the People room is the Add sheet
(`add-person-sheet.tsx:905`, reached only when adding a seat) and `add_household_member()` (client /
client_rep only, R-BQ). Restoring the grant on an existing `sub` seat needs hand-written SQL.

And the press says nothing: the bid editor's own consequence sentence
(`roster-row.tsx:544-552`) promises only the band move — *"Recording this moves &lt;name&gt; to Off the
job."* — over a press that also ends every open delegation the seat carried, money included. PR-n's
"the principal's to set, **and the principal's to take away**" is taken away here by an outcome
record.

### Where a fix belongs (not prescriptive)

Three shapes, none settled: clamp 00634's trigger to the hand-close path only (it already reads
`NEW.off_job_at`, not the writer); state the money consequence in the bid editor's consequence
sentence and hold the press for a non-principal; or give the room the named re-open act 00634's
banner already assumes. The first is the smallest and the only one that keeps the Bidding band a
bidding act.

---

## 4. MAJOR-3 — `w3-data-report.md` describes a six-migration wave and never names `00634`

**Severity: major. Confidence: high (every line below re-measured this round). Filed above minor
this round, where m9 has stood for six rounds, because the report is the wave's DEPLOY record — W7's
preflight reads it — and the file it omits is the one that gates money on a seat close.**

| § | The report says | Measured |
|---|---|---|
| §0 title + table | "W3 mints **00628–00633**", six files | Seven. `00634_seat_close_ends_authority.sql` is on the branch and applied |
| §0 | "**12 blocks** as of r7" | The suite ends at **13e**; r8–r20 added the rest |
| §1 | "Eleven, not eight" refusals, eleven listed | `merge_studio_contacts` raises **fourteen**: + `merge_seat_on_studioless_project`, `merge_seat_card_other_studio`, `merge_seat_collision` |
| §1 / §7 | `people_directory` is "00626 … **verbatim**, plus one line" | Two deltas — the CONTACTS `merged_into` leg (`00629:3269`) **and** the TEAM tenant leg (`00629:3168`). §7.2 and §10.1 still argue about whether the second shipped; it did |
| §2 | "**33 papers** in total: 9 current, 24 held, 2 lapsed, 1 lapses_soon" | `count(*) FROM studio_compliance_documents` = **36** |
| §2 | Lakeshore `lapses_soon` **2026-10-06** | seed-relative; **2026-10-08** measured |
| §4 | `project_party_authority` objects table | **`source_household_id` (r16 MAJOR-1) appears nowhere in the report** — 0 hits |
| §8 gates | "db:generate: **301 insertions, 0 deletions**"; "legacy grants **+168 lines (2752 replayed statements)**" | Both now **no diff**; **2767** replayed statements |
| §8 gates | no `00634` row, no 13e row | — |
| §9 | RPC and trigger-function lists | `end_party_authority_at_seat_close()` and `project_parties_touch_updated_at()` absent; `contact_rule_blocks_contact()` absent |
| §10.6 | "`sweep_compliance_expiries()` has never run against the seeded book outside a rolled-back transaction" | It has (r20's probe-r20-c; and re-measured here) |

A reader taking this file as the record of the wave would not know that closing a seat now ends its
delegations, that it can be refused, or that a second column decides which household owns a grant.

---

## 5. Minor

### NEW

**r21-n1 — the merge records `matched_on` and never checks it, while crm-model §4 says a
person-to-person merge requires rule 1, 2 or 3.**
minor · medium confidence · read. `00629:1314-1319` validates the WORD against a five-value list and
nothing else; a studio may record `phone` on two cards with different numbers, or `company_name` on
a person pair that §4's table calls "propose, a member confirms". The file's own COMMENT
(`:321-326`) argues PR-o makes the studio's call final, which is a defensible reading — but the
lineage row is then evidence of an act, not evidence of a match, and `studio_contact_merges` is the
only record PR-o leaves behind.

**r21-n2 — 00634's file title still argues money where the trigger ends every scope.**
minor · high confidence · read at `00634:2-3`. r20-n5's COMMENT half is fixed (`:178-179`); the
title and the §"THE SENTENCE THIS FILE MAKES TRUE" banner still read as if `money` were the subject.

**r21-n3 — `seat_close_authority_forbidden`'s HINT states a fact that is false for the one
population it can reach by accident.**
minor · medium confidence (the wording) · low confidence (reachable) · read at `00634:151-153`. The
HINT reads "This seat carries a standing grant recorded in **another studio's book**." The branch is
also taken when `project_party_recorded_studio(NEW.id)` answers NULL — R-BD's studio-less
population — where the truth is that the job records no studio at all. No grant can be written there
today (00624's policies refuse `is_active_studio_member(NULL)`), so the population is empty; the
sentence is wrong if it ever fills.

**r21-n4 — deleting a survivor card un-merges the absorbed one and erases the lineage in the same
statement.**
minor · high confidence (mechanism) · narrow population. `studio_contacts.merged_into` is
`ON DELETE SET NULL` (`00629:88-89`) and both `studio_contact_merges.survivor_id` / `merged_id` are
`ON DELETE CASCADE` (`:287-288`), and `assert_merged_into_write()` deliberately exempts the clear
(`:178-184`). So one DELETE of the survivor returns the absorbed card to `people_directory` stripped
of every channel, document, seat and designation the merge moved off it, with no lineage row left to
say why. `authenticated` holds **no DELETE grant and no DELETE policy** on `studio_contacts`
(measured), so only `service_role`/`postgres` can reach it — which is the same door m6 already notes
for the "append-only" claim.

### CARRIED — re-read or re-measured this round, all still open

* **r20-n1** — a future-dated `off_job_at` walks the merge carve-out back to r19's state.
  `00634:165` is still `GREATEST(effective_from, NEW.off_job_at)` with no `CURRENT_DATE` clamp, and
  every SQL-side window is `effective_to IS NULL OR effective_to >= CURRENT_DATE`. **high**
* **r20-n2** — `usePartyAuthority` (`use-coordination.ts:1911-1917`) never learned r19's rule, so
  the two authority readers disagree. §3(b) is the population that makes it visible. **medium**
* **r20-n3** — `00631:314-317` still names `update_updated_at_column` as the trigger body and calls
  it "unconditionally"; `pg_get_triggerdef` says
  `EXECUTE FUNCTION project_parties_touch_updated_at()`. **high**
* **r20-n4** — `set_household_threshold()`'s closed-seat branch (`00632:713-716`) is unreachable
  after 00634 and its comment presents it as the rule that makes r15 MAJOR-1 safe. **high**
* **r18-n2** — `client_households_studio_delete` carries `is_active_studio_member AND
  is_org_admin_or_owner` while its three siblings carry the co-member leg (re-measured from
  `pg_policy`). **high**
* **r18-n3** — `00632:412-416` accepts a household whose `organization_id` and `designer_id` name
  two different studios. **medium**
* **r17-n2** — `source_household_id` (`00632:347-353`) is a bare FK with no tenancy or consistency
  rule. **medium**
* **n1** — `00628:178-182` reports the designer-domain-role delta over EVERY stamped project and
  prints it as "% **stamped** project(s)"; on Strata that is the whole book. **high**
* **n2** — `contact_rule_blocks_contact()` has no caller (`grep`: `00629` itself,
  `00-legacy-grants.sql`, `database.types.ts`) and its COMMENT (`00629:934-939`) says the merge
  refuses on it; the merge refuses on subsumption. **high**
* **n3** — `00631:334` cites "w3 block 12"; the `updated_at` pin is block 7d. **high**
* **n4** — `add_household_member()` raises 00624's raw tokens on both studio doors before its own
  are reached (`00632:454-471`). **high**
* **n5** — the notice subject concatenates a possessive: "Ostrom Builders's paper has lapsed"
  (`00630:412-415`). A notification is a face. **high**
* **n6** — three of the branch's own RLS suites fail and nothing on the branch records it:
  `design_requests_test`, `field_parties_test` (`consent_legacy_column_frozen` — R-AX/R-AY working
  as ruled, the suite never updated), `studio_titles_test`. **Re-run this round: 21 pass, 3 fail.**
  None is W3's. **high**
* **n7** — `00629:2213` names two of three columns a left-behind rule keeps;
  `escalation_by_class` appears 0 times in the file. **high**
* **n8** — `assert_party_card_not_merged_trg` covers `studio_contact_id, company_id` only
  (`pg_trigger`, re-measured); `warranty_contact_person_id` is not in the list. **high**
* **n9** — the studio-less / other-studio pre-checks (`00629:1545-1559`, `:1601-1646`) enumerate
  three of the seat's four card pointers; `bid_quoted_by_person_id` is repointed at `:2534-2538`
  outside both. Population empty today (0 seats on the five studio-less projects, re-measured), and
  the column is minted by 00631 under its own guard so no legacy row can carry a bad value.
  **high (the gap) · low (reachable)**
* **m1** — the nightly sweep still announces paper held by a card the studio has PUT AWAY:
  `archived_at` appears **0** times in `00630` (re-measured); the loop carries `sc.merged_into IS
  NULL` and no archived leg. **high**
* **m2** — deleting a household, or dropping a member from the array, orphans the grants it sourced:
  `source_household_id` is `ON DELETE SET NULL` and `set_household_threshold()` is the only closer.
  **high**
* **m3** — `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
  (`proconfig` NULL, re-measured; the other twenty-one pin `search_path=public`). SECURITY INVOKER
  and fully schema-qualified, but granted to `authenticated` and called twice per emitted Directory
  row from inside `identity_paper_state()`. **high**
* **m4** — see §4: 33 vs a measured 36. **high**
* **m5** — the `project_consent_org()` enumeration calls all twelve callers "the consent ledger's
  key — not a guard"; `00629:3031-3036` is a membership GUARD on whether the word renders.
  Behaviour right, sentence wrong. **medium**
* **m6** — `v_merge_id` is declared (`00629:1287`), assigned (`:2619`) and never read;
  `studio_contact_merges`' COMMENT says "nobody may forge or take back" beside
  `GRANT … INSERT, UPDATE, DELETE … TO service_role`. **high**
* **m7** — `people_directory`'s own COMMENT was not re-issued: the live comment still opens
  "R57 / People Room roster (client|lead|maker|…)" (re-measured), so neither declared delta reaches
  the object's record. **high**
* **m8** — `identity_paper_state()` runs four recursive walks per emitted Directory row (two
  `resolve_merged_contact`, depth 16; two `compliance_state`, depth 64). **medium**
* **m9** — report staleness. **Promoted to MAJOR-3 this round** (§4).
* **m11** — `00628:117-122` does not bracket `update_projects_updated_at` where `00631:335/404`
  brackets its own. Nothing in this program ranks by `projects.updated_at`. **low**
* **m12** — a notice is SPENT even when nobody was told: `00630:399-409` writes the row and
  increments `v_notices` before `:454-486` writes any notification, and never checks that one
  landed. A studio whose only active members are plain `member`s consumes the key with
  `v_notified = 0`. **high (mechanism) · narrow**
* **m13** — after a firm-to-firm fold an uncarded seat's Directory row names the folded card's
  spelling: `project_parties.company_name` is a free-text snapshot the merge never writes
  (`00629:2496-2504` argues the case for the CROSS fold only). **high**
* **m14** — `00630:381-393`'s `merged_into` leg describes merge behaviour r3 replaced ("leaves an
  absorbed document on the absorbed card … correctly"); 00629 moves every absorbed head
  unconditionally. Pure defence in depth, stated as load-bearing. **high**
* **m15** — neither household door reads `archived_at` (`grep`: 0 hits in `00632`), so a card
  `useStudioContacts(…, { includeArchived: false })` hides can still be seated —
  the shape `merge_survivor_archived` (r5 M-4) refuses one table over. **medium**
* **m16** — the report omits `source_household_id`; folded into §4.

---

## 6. What was checked and found sound (not findings)

* **The reset replays clean, twice, and all three people suites pass on each.** The W3 suite run a
  second time against the already-run database leaks no committed row.
* **Types and legacy grants both regenerate with no diff.**
* **Numbering, banner, LINEAGE and idempotence** on all seven files, 00634 included
  (`CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, and a backfill whose second run finds no
  `effective_to IS NULL` row on a closed seat).
* **r20's BLOCKING is genuinely closed**: the gate is in the body, it refuses rather than ending
  silently, it carries the `auth.uid() IS NULL` internal-caller carve-out 00632:235 already takes,
  it is narrow (13e-j: a plain member still closes a `schedule`-only seat and 00634 still ends it),
  and 13e is the negative control r20-n6 asked for.
* **The merge is transactional and orphans nothing** — blocks 1–13e pass; the twenty FK columns into
  `studio_contacts` plus the two polymorphic pointers and the one array are each repointed, reduced
  or deliberately left (r20's census re-confirmed; 00629 is byte-identical since).
* **`merged_into` is `merge_studio_contacts()`'s alone** — `assert_merged_into_write()` refuses
  every other writer including owners, admins and service_role, restates survivor-exists /
  same-studio / legal-kind for every writer, and exempts only the FK's own `ON DELETE SET NULL`.
* **No company into a person** except crm-model §4's sole-proprietor exception, one direction,
  enforced in both the RPC and the column trigger.
* **`merged_into` resolved by `people_directory`**: CONTACTS carries `AND sc.merged_into IS NULL`
  (`00629:3269`); `resolve_merged_contact()` maps the old id forward; both ids stay resolvable
  (PR-o).
* **The sweep**: idempotent (measured twice), advisory-xact-locked with a `skipped` `job_runs` row on
  contention, schema-qualified, `service_role`-only with no `authenticated` grant, cron guarded by
  `EXISTS` before `cron.unschedule`, body `SELECT public.sweep_compliance_expiries();`, registry
  COMMENT extended. **Recipients owner + admin only — measured.**
* **Households RLS**: all four policies carry the tenant leg; owner/admin on DELETE and on any write
  carrying `co_threshold_cents`; `assert_household_threshold_principal()` reads the CHANGE so an
  ERASE is refused. R-BQ holds — `set_household_threshold()` opens nothing.
* **Court widening is purely additive** (eleven words, strict superset), `project_tasks.owner`
  deliberately not widened.
* **00628** leaves zero and several both NULL, is idempotent on `studio_id IS NULL`, does not bypass
  `set_project_studio_id()`, and prints R-BD's and R-BI's counts.
* **`project_consent_org()`**: zero policy callers; the twelve remaining are the ledger key, which is
  R-BD's own scope.
* **Consent is record-only (R-AY)**: no W3 migration reads or writes consent for a verdict; the two
  `sms_consent_*` tokens in `00629` are `people_directory` OUTPUT keys over
  `identity_consent_status()`.
* **Money is integer cents** everywhere new, each with a `>= 0` CHECK; vocabularies are named CHECK
  constraints, never enums.
* **Archive gating**: owner/admin only, restated in the body because SECURITY DEFINER bypasses the
  policy, idempotent, and a non-member reads `studio_contact_not_found` so the door leaks no ids.
* **No `anon` grant anywhere in the wave**; every SECURITY DEFINER pins `search_path=public`
  (m3 is the one SECURITY INVOKER exception).
* The two `job_runs` sweep rows and three committed notices found on the database between my first
  reset and my probes were **not** produced by the reset — a second reset left `job_runs` holding
  only `marketplace-vitals-refresh` and zero notices. Environment contention on the shared local
  Postgres, not a product finding.

---

## 7. Probe written this round

Beside this file under `artifacts/people-room-crm-2026-09-11/build/`, one transaction, ROLLBACKed,
on the freshly reset database:

* `probe-r21-a-seat-close-gate-on-the-face.sql` / `.out` — §2 and §3: a plain member's "Close this
  seat" and a plain member's "They withdrew" are both refused
  `seat_close_money_authority_forbidden` (the string the three faces print verbatim); the owner's
  withdrawal ends the $5,000 on the day; and R-BR's correction back to "They quoted" returns the
  seat to the Bidding band with `off_job_at` NULL and `effective_to` still stamped.
