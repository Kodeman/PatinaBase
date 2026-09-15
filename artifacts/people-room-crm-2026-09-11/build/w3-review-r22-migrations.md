# W3 (P2) — adversarial migration review, round 22

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`, HEAD `e7172c302`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full this round: `00628`–`00634`; `supabase/tests/people/w3_merge_sweep_household_test.sql` (transaction
boundaries and blocks 13d/13e/13f); the bodies these files graft or stand in front of
(`assert_project_party_cards` 00624, `assert_compliance_holder` as re-issued in 00629 §4c,
`sync_person_affiliation_from_pointer` §4e, `identity_paper_state` §4f, `people_directory` v5 whole);
`w3-data-report.md`; `w3-fix-log-r21.md`; `w3-review-r21-migrations.md`; `rulings.md`;
`direction.md` §3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7;
`w1a-report.md`, `w1b-report.md`, `w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md` §4.
Plus the three readers that decide what the R-BS clamp leaves on a face:
`use-coordination.ts` (`useCloseProjectPartySeat`, `useSetPartyBid`, `usePartyAuthority`),
`roster-row.tsx`'s bid editor, and `roster/use-project-authority.ts`.

**Verdict: NOT clean — ZERO BLOCKING, ONE MAJOR, thirty-two minor.**

Every one of r21's eight findings is **closed and re-read at HEAD** (§1.2). The single major is a
**consequence of r21's own fix**: R-BS clamps `00634`'s trigger off the withdrawal path, and
`merge_seat_collision`'s OPEN-SEATS-ONLY carve-out — whose own comment says it "stands as written
BECAUSE of that trigger; do not widen this predicate without reading it" (`00629:1708-1710`) — still
keys on `off_job_at IS NULL`. One press of "They withdrew" now walks the room straight back into
r19 MAJOR-1's state. Measured (§2).

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` | **clean**, rc=0 — "Finished supabase db reset on branch main." Ledger head `20260910152111`; hand numbers end at `00634` |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." (26 blocks) |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed", **13f last**; run a SECOND time against the already-run database and **leaks no committed row** (`job_runs` 3→3, `studio_compliance_notices` 3→3, `notification_log` 6→6) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | **no diff** — "baseline + **2767** replayed statements" |
| migration numbering | `00628`–`00634`, all above `00627`, none inside the reserved `00595`–`00620`; nothing minted this round |
| function `proconfig` / ACL (22 wave functions, `pg_proc`) | every one pins `search_path=public` **except `resolve_merged_contact` (proconfig NULL — m3)**. **Zero `anon` grants** anywhere in the wave |
| 00634 trigger, from `pg_get_triggerdef` | `AFTER UPDATE OF off_job_at … WHEN ((old.off_job_at IS NULL) AND (new.off_job_at IS NOT NULL) AND (NOT ((COALESCE(new.bid_outcome,'')='withdrawn') AND (COALESCE(old.bid_outcome,'')<>'withdrawn'))))` — the R-BS clamp, read off the catalog |
| FK census into `studio_contacts` (`pg_constraint`) | **20 columns**, every one repointed, reduced or deliberately left by `merge_studio_contacts()`; plus the one array (`client_households.member_person_ids`) and the polymorphic `studio_contact_rules.subject_id`. `project_party_authority.copy_to` holds **engagement** ids, not card ids — nothing owed there |
| `client_decisions_court_check` | eleven words, strict superset of 00212/00281's seven |
| 00628 backfill | 8 projects, **5 still `studio_id IS NULL`**, **0** carrying seats — zero and several both stay NULL, as R-BD rules |
| `studio_compliance_documents` | **36** rows: 9 `current`, 24 `held`, 2 `lapsed`, 1 `lapses_soon` (Ostrom 2025-12-31, Northgate 2026-03-31, Lakeshore **2026-10-08**) — §2 of the report reproduces exactly |
| `studio_compliance_notices` / `studio_contact_merges` | SELECT-only policy and SELECT-only grant for `authenticated`; no INSERT/UPDATE/DELETE policy; service_role full |
| branch RLS suites (the three r21 named) | **still failing**: `design_requests_test` ("FAIL 3b: expected no_scans"), `field_parties_test` (`consent_legacy_column_frozen` — R-AX/R-AY working as ruled, the suite never updated), `studio_titles_test` ("FAIL f: … last_owner"). None is W3's (n6) |

### 1.2 Every r21 finding re-checked

| r21 | State at HEAD |
|---|---|
| **MAJOR-1 · major-2** — two refusal tokens printed verbatim, neither close act held | **FIXED.** `write-error.ts:86,89` carry both tokens ahead of the schema-word guard; `use-coordination.ts:868-870` carries `SEAT_CLOSE_REFUSAL_SENTENCES`; `asSeatCloseError` / `seatCloseIsHeldForMoney` / `SEAT_CLOSE_MONEY_HELD_REASON` exported; `useCloseProjectPartySeat` throws `new Error(asSeatCloseError(error))` (`:959`); `roster-row.tsx` and `close-seat-act.tsx` both hold the act and route their catch through `writeErrorMessage` |
| **MAJOR-2** — the Bidding band was a second door into 00634 | **FIXED as ruled, and it is the door §2 walks back through.** The `WHEN` clamp is on the catalog, both legs COALESCE-first; block 13f pins it |
| **major-1** — the close ended money and nothing told the browser | **FIXED.** `use-coordination.ts:977` (close) and `:2844-2845` (bid) both invalidate `partyAuthorityKeys.all`; the bid door also calls `invalidateClientHouseholds` |
| **major-3** — a bid outcome on a hand-closed seat put it back in a crew band | **FIXED.** `seatClosedByHand` at `:2505-2513`, folded into `pastTheBid` |
| **major-4** — a correction NULLed a day and a reason the withdrawal never wrote | **FIXED.** the R-BR clearing branch reads `&& !seatClosedByHand(previous)` (`:2773`, `:2819-2820`) |
| **MAJOR-3** — `w3-data-report.md` described a six-migration wave | **FIXED, and every figure re-measured here reproduces**: seven migrations named, 21 blocks / 13f last, fourteen distinct refusal tokens over sixteen `RAISE EXCEPTION` sites (counted: `merge_contact_not_found` ×3, thirteen others ×1), two `people_directory` deltas, 36 papers, Lakeshore 2026-10-08, `source_household_id` listed, no-diff gates, 2767 statements |
| **major-5** — `w3-room-report.md` §1/§9 stale | out of this lane (room report); the figures it names are not migration facts |
| r20-n1 · r20-n2 · r20-n3 · r20-n4 · r21-n1…n4 · r18-n2 · r18-n3 · r17-n2 · n1–n9 · m1–m8 · m11–m16 | **ALL OPEN** — each re-read or re-measured this round; restated in §4 |

---

## 2. MAJOR-1 — R-BS's clamp re-opens r19 MAJOR-1: one press of "They withdrew" lets a fold land that leaves one human holding two OPEN money grants on one job

**Severity: major. Confidence: high (measured on the freshly reset database, one transaction,
ROLLBACKed, room acts only — `build/probe-r22-a-withdrawal-dated-seat-merge.sql`).**
Filed **major** rather than blocking because it is the same harm statement r18 MAJOR-1 and r19
MAJOR-1 were both filed at — a reader disagreeing with the record about money — not a cross-tenant
write, an RLS hole or data loss.

### The two rules that no longer meet

`merge_seat_collision`'s carve-out is **open seats only**, and `00629:1692-1710` states in terms why
that is safe:

> "OPEN SEATS ONLY (`off_job_at IS NULL` …). A closed seat beside a live one of the same kind states
> no second money fact — **its grant was ended at the close** … `end_party_authority_at_seat_close_trg`
> (00634) ends every open grant on the day the seat closes … **The carve-out stands as written
> BECAUSE of that trigger; do not widen this predicate without reading it.**"

R-BS then clamped 00634 off exactly one of the two writers of `off_job_at`, and says so plainly
(`00634:91-99`): *"a seat dated by a recorded withdrawal keeps its open grants until the principal
closes the seat."*

So a seat can now be `off_job_at IS NOT NULL` **and** carry an open `money` grant. The collision
predicate cannot see it (`00629:1718`, `:1721` are both `off_job_at IS NULL`), and nothing else in the
merge asks about grants.

### Measured, with room acts only

Two duplicate person cards for one human, each holding an OPEN `sub` seat on the Okonkwo residence,
each carrying its own open `money` grant written the way the Add sheet writes one (R-J,
`source_clause 'agreement §4'`; `add-person-sheet.tsx:893-911` is gated on admin standing, not on
party kind):

```
A0 refused: merge_seat_collision                       <- the gate doing its job
A1  the owner records "They withdrew" on the old seat  <- roster-row.tsx's bid editor, useSetPartyBid
A1 after  seat …22a1  off_job_at 2026-09-15  threshold 250000   effective_to (none)  reads_live t
          seat …22a2  off_job_at (none)      threshold 1000000  effective_to (none)  reads_live t
A2 the fold LANDED
A3  seat …22a1  sub  off_job 2026-09-15  withdrawn  250000   effective_to (none)  reads_live t
    seat …22a2  sub  off_job (none)      quoted     1000000  effective_to (none)  reads_live t
```

One human, one job, two `sub` seats stamped with one card, **both money grants open**, at $2,500 and
$10,000.

### And both figures reach the face

`use-project-authority.ts:73-74` drops a grant **only** when `effective_to != null && closedSeats.has(id)`,
and says why in its own comment: *"a grant still OPEN on a closed seat is deliberately kept, because
that is a state the room should show rather than hide."* Seat …22a1's grant has `effective_to` NULL,
so it is kept and `authorityPhrase` prints it in the present tense beside the other one — r18
MAJOR-1's harm statement (`00629:1664-1678`) word for word, and r19 MAJOR-1's
(`00634:30-41`) word for word.

### Why it is reachable, not theoretical

The bid editor is offered on any roster row (`roster-row.tsx:526-537`, no party-kind gate), and
"They withdrew" on a bidder who pulled out is the single most ordinary thing the Bidding band
exists to record. The duplicate band then offers "Compare them?" and the merge sheet the fold. No
step needs PostgREST, an admin, or a hand-written date.

### Where a fix belongs (not prescriptive)

Three shapes, none settled, and R-BS forbids a new migration so each edits `00628`–`00634` in place:
ask the collision predicate about the **grant** rather than the seat's openness (`… OR EXISTS (open
authority on the seat)`), which is the fact the carve-out's own argument is about; or widen 00634's
clamp to end grants on a withdrawal after all and give the room the named re-open act the file's
banner already assumes; or refuse the fold by a fourth name when either seat carries an open grant.
A pin belongs beside block **13d**, which asserts today only that the HAND close lifts the gate and
ends the money.

---

## 3. What was checked and found sound (not findings)

* **The reset replays clean and all three people suites pass on it.** The W3 suite run a second time
  against the already-run database leaks **no committed row** (3/3/6 → 3/3/6), so r21's "environment
  contention" reading of the stray sweep rows is confirmed, not the suite's doing (see r22-n4).
* **Types and legacy grants both regenerate with no diff**; every GRANT/REVOKE in the wave is replayed.
* **Numbering, banner, LINEAGE and idempotence** on all seven files (`CREATE OR REPLACE`,
  `DROP … IF EXISTS`, `ADD COLUMN IF NOT EXISTS`, `WHERE studio_id IS NULL`, `ON CONFLICT DO NOTHING`,
  and 00634's backfill finding no `effective_to IS NULL` row on a second run).
* **The merge is transactional and orphans nothing.** Re-censused from `pg_constraint` this round:
  twenty FK columns into `studio_contacts`, the one `uuid[]`, and the polymorphic rule subject are
  each repointed, reduced or deliberately left; `project_party_authority.copy_to` holds engagement
  ids, so it owes nothing.
* **`merged_into` is `merge_studio_contacts()`'s alone** — `assert_merged_into_write()` refuses every
  other writer including owners, admins and service_role, restates survivor-exists / same-studio /
  legal-kind for every writer, and exempts only the FK's own `ON DELETE SET NULL`.
* **No company into a person** except crm-model §4's sole-proprietor exception, one direction,
  enforced in both the RPC and the column trigger.
* **`merged_into` resolved by `people_directory`**: the CONTACTS branch carries `AND sc.merged_into IS NULL`;
  `resolve_merged_contact()` maps the old id forward; both ids stay resolvable (PR-o).
* **The sweep**: schema-qualified, advisory-xact-locked with a `skipped` `job_runs` row on contention,
  `service_role`-only with no `authenticated` grant, cron guarded by `EXISTS` before `cron.unschedule`,
  body `SELECT public.sweep_compliance_expiries();`, registry COMMENT extended; recipients owner + admin
  only; idempotent (measured: an already-swept book answers `{"scanned":3,"notices":0,"notified":0}` twice).
* **Households RLS**: all four policies carry the tenant leg; owner/admin on DELETE and on any write
  carrying `co_threshold_cents`; `assert_household_threshold_principal()` reads the CHANGE so an ERASE
  is refused. R-BQ holds — `set_household_threshold()` opens nothing.
* **Court widening is purely additive** (eleven words, strict superset); `project_tasks.owner`
  deliberately not widened.
* **00628** leaves zero and several both NULL, is idempotent, does not bypass `set_project_studio_id()`,
  and prints R-BD's and R-BI's counts.
* **`project_consent_org()`**: zero policy callers; the twelve remaining are the ledger key, which is
  R-BD's own scope, and every project tenant resolution in the wave's guards uses `project_tenant_org()`
  or `project_recorded_studio()`.
* **Consent is record-only (R-AY)**: no W3 migration reads or writes consent for a verdict; the two
  `sms_consent_*` tokens in `00629` are `people_directory` OUTPUT keys over `identity_consent_status()`;
  nothing writes consent outside `record_channel_consent`.
* **Money is integer cents** everywhere new, each with a `>= 0` CHECK; vocabularies are named CHECK
  constraints, never enums.
* **Archive gating**: owner/admin only, restated in the body, idempotent, and a non-member reads
  `studio_contact_not_found` so the door leaks no ids.
* **No `anon` grant anywhere in the wave**; every SECURITY DEFINER pins `search_path=public`.

---

## 4. Minor

### NEW this round

**r22-n1 — every migration banner still says "N of 6" while the wave mints seven.**
minor · high confidence · read. `00628:2`, `00629:2`, `00630:2`, `00631:2`, `00632:2`, `00633:2` all
read `W3/P2 (N of 6)`; `00634:2` carries no ordinal. r21 MAJOR-3 corrected the report and left the
files, so the deploy record and the files it describes disagree about the size of the wave in the one
place a reader opening a migration looks first.

**r22-n2 — 00634 states an absolute it no longer makes, and its backfill disagrees with its trigger.**
minor · high confidence · read at `00634:146-147`, `:248-275`. The gate comment still reads "The
invariant holds absolutely in every path: NO closed seat carries an open grant", while `:91-99` and the
function COMMENT both name the withdrawal exception R-BS created and §2 measures. Separately, the
one-off backfill ends every grant standing on **any** seat with `off_job_at IS NOT NULL` — including
the withdrawal-dated population the trigger now spares — so the rule applied once at deploy and the
rule applied from then on are different rules. (Harmless on Strata today: `bid_outcome` is minted by
00631 and no pre-existing `off_job_at` can have been written by a withdrawal. It is the sentence, not
the data.)

**r22-n3 — `project_site_access_cards.told_refs` is a card pointer no merge repoint reaches.**
minor · high confidence (the gap) · empty population (measured). The column's own COMMENT says
"Person-card or seat ids"; `merge_studio_contacts()` repoints twenty FK columns, one array and one
polymorphic subject and never this one. Measured on the seeded book: the one populated card carries
five ids, all `project_parties` ids, **0** naming a merged card — so nothing is wrong today, and the
first person-card id written there is stale the first time that human's duplicate is folded.

**r22-n4 — the local Postgres is not this wave's alone, and §10.6's last sentence is no longer true of it.**
minor · high confidence · measured. Between my reset and my probes three
`compliance-document-expiry-sweep` `job_runs` rows, three `studio_compliance_notices` rows and six
`notification_log` rows appeared (DB times 15:30:46 ×2 and 15:32:08). The W3 suite is one
`BEGIN … ROLLBACK` (`:31`, `:5574`) and I measured it leaking nothing across a re-run, and the cron is
`0 6 * * *`, so these are another session's. `w3-data-report.md` §10.6 says the sweep "has still never
been left committed on a local book outside a review probe"; on this database it now has. Environment,
not a product defect — but a later round measuring "first call writes 3 notices" will read 0 and should
not file it as a regression.

### CARRIED — re-read or re-measured this round, all still open

* **r20-n1** — a future-dated `off_job_at` leaves an unended grant. `00634:201` is still
  `GREATEST(effective_from, NEW.off_job_at)` with no `CURRENT_DATE` clamp. **Measured this round**: a
  close dated `CURRENT_DATE + 30` writes `effective_to = 2026-10-15`, so the grant reads live today on
  a seat the SQL side calls closed. No portal caller passes `offJobAt` (grep: `roster-row.tsx:561,617`
  pass it to `SetPartyBidInput.previous`, never to the close), and `use-project-authority.ts` drops the
  grant anyway, so the face is safe; the SQL-side invariant is not. **high (mechanism) · low (reachable)**
* **r20-n2** — the two authority readers still disagree. `usePartyAuthority`
  (`use-coordination.ts:2008-2017`) keeps every grant with `effective_to >= today` and has no
  closed-seat leg, while `use-project-authority.ts:73-74` drops one ended by its seat's close. The
  person card and the Call Sheet print different things on the day a seat closes. **medium**
* **r20-n3** — `00631:314-317` still names `update_updated_at_column` as the trigger body and calls it
  "unconditional"; `pg_get_triggerdef` says `EXECUTE FUNCTION project_parties_touch_updated_at()`, which
  stands down under `patina.suppress_party_touch`. **high**
* **r20-n4** — `set_household_threshold()`'s closed-seat branch (`00632:713-716`) and its comment
  present themselves as the rule that makes r15 MAJOR-1 safe; 00634 made it near-dead. §2's clamp now
  makes it reachable again for a withdrawal-dated `client_rep` seat, so the comment is wrong in a second
  direction. **high**
* **r21-n1** — `matched_on` is validated as a WORD and never against the pair
  (`00629:1314-1319`); the lineage row is evidence of an act, not of a match. **medium**
* **r21-n2** — `00634:2-3` still titles the file "CLOSING A SEAT ENDS THE MONEY IT CARRIED" where the
  trigger ends every scope. **high**
* **r21-n3** — `seat_close_authority_forbidden`'s HINT (`00634:188-189`) says "another studio's book"
  on a branch also taken when `project_party_recorded_studio()` is NULL. **medium (wording) · low (reachable)**
* **r21-n4** — deleting a survivor un-merges the absorbed card (`merged_into` `ON DELETE SET NULL`,
  `00629:88-89`) and cascades the lineage away (`:287-288`) in one statement. `authenticated` holds no
  DELETE grant and no DELETE policy on `studio_contacts` (re-measured), so only service_role reaches it. **high**
* **r18-n2** — `client_households_studio_delete` carries `is_active_studio_member AND is_org_admin_or_owner`
  while its three siblings carry the co-member leg (`00632:302-309`). **high**
* **r18-n3** — `00632:412-415` accepts a household whose `organization_id` and `designer_id` name two
  different studios. **medium**
* **r17-n2** — `source_household_id` (`00632:347-353`) is a bare FK with no tenancy or consistency rule. **medium**
* **n1** — `00628:178-182` reports the designer-domain-role delta over EVERY stamped project
  (`WHERE p.studio_id IS NOT NULL`) and the NOTICE prints it as "% stamped project(s)"; on Strata that
  is the whole book. **high**
* **n2** — `contact_rule_blocks_contact()` has **no caller** (grep over `supabase/`, `packages/`,
  `apps/`: only 00629 itself and the replayed grants) and its COMMENT (`00629:933-938`) says "the merge
  refuses on it"; the merge refuses on subsumption (`00629:1480-1495`). **high**
* **n3** — `00631:334` cites "w3 block 12"; the `updated_at` pin is block **7d** (`w3_…_test.sql:1904`,
  `:2103`). **high**
* **n4** — `add_household_member()` reaches 00624's raw tokens (`party_card_project_has_no_studio`,
  `party_studio_contact_other_studio`) on its seat INSERT before its own named refusals
  (`00632:463-471`). **high**
* **n5** — the notice subject concatenates a possessive: "Ostrom Builders's paper has lapsed"
  (`00630:412-415`). A notification is a face. **high**
* **n6** — three of the branch's own RLS suites fail and nothing on the branch records it.
  **Re-run this round**, all three still fail: `design_requests_test` ("FAIL 3b: expected no_scans"),
  `field_parties_test` (`consent_legacy_column_frozen` — R-AX/R-AY working as ruled), `studio_titles_test`
  ("FAIL f: … last_owner"). None is W3's. **high**
* **n7** — `00629:2213` names two of three columns a left-behind rule keeps; `escalation_by_class`
  appears **0** times in the file (re-measured). **high**
* **n8** — `assert_party_card_not_merged_trg` covers `studio_contact_id, company_id` only
  (`pg_trigger`, re-measured); `warranty_contact_person_id` is in `assert_project_party_cards_trg`'s
  column list but no merged-away leg guards it. **high**
* **n9** — the studio-less / other-studio pre-checks (`00629:1545-1559`, `:1601-1646`) enumerate three
  of the seat's four card pointers; `bid_quoted_by_person_id` is repointed at `:2534-2538` outside both.
  Population empty today (0 seats on the five studio-less projects, re-measured). **high (gap) · low (reachable)**
* **m1** — the nightly sweep still announces paper held by a card the studio has PUT AWAY: `archived_at`
  appears **0** times in `00630` (re-measured); the loop carries `sc.merged_into IS NULL` and no
  archived leg. **high**
* **m2** — deleting a household, or dropping a member from the array, orphans the grants it sourced:
  `source_household_id` is `ON DELETE SET NULL` and `set_household_threshold()` is the only closer. **high**
* **m3** — `resolve_merged_contact()` is the wave's one function with no pinned `search_path`
  (`proconfig` NULL, re-measured; the other twenty-one pin `search_path=public`). SECURITY INVOKER and
  fully schema-qualified, but granted to `authenticated` and called twice per emitted Directory row from
  inside `identity_paper_state()`. **high**
* **m5** — the `project_consent_org()` enumeration calls all twelve callers "the consent ledger's key —
  not a guard"; the party branch's `CASE WHEN is_active_studio_member(project_consent_org(q0.project_id))`
  is a membership GUARD on whether the word renders. Behaviour right, sentence wrong. **medium**
* **m6** — `v_merge_id` is declared (`00629:1287`), assigned (`:2619`) and never read;
  `studio_contact_merges`' COMMENT says "nobody may forge or take back" beside
  `GRANT … INSERT, UPDATE, DELETE … TO service_role`. **high**
* **m7** — `people_directory`'s own COMMENT was not re-issued. **Measured this round**: the live comment
  still opens "R57 / People Room roster (client|lead|maker|…) … v7 (00626 …)", so neither of 00629's two
  declared deltas reaches the object's record. **high**
* **m8** — `identity_paper_state()` runs four recursive walks per emitted Directory row (two
  `resolve_merged_contact`, depth 16; two `compliance_state`, depth 64). **medium**
* **m11** — `00628:117-122` does not bracket `update_projects_updated_at` where `00631:335/404` brackets
  its own. Nothing in this program ranks by `projects.updated_at`. **low**
* **m12** — a notice is SPENT even when nobody was told: `00630:399-409` writes the row and increments
  `v_notices` before `:454-486` writes any notification, and never checks that one landed. A studio whose
  only active members are plain `member`s consumes the key with `v_notified = 0`. **high (mechanism) · narrow**
* **m13** — after a firm-to-firm fold an uncarded seat's Directory row names the folded card's spelling:
  `project_parties.company_name` is a free-text snapshot the merge never writes. **high**
* **m14** — `00630:381-393`'s `merged_into` leg describes merge behaviour r3 replaced ("leaves an absorbed
  document on the absorbed card … correctly"); 00629 moves every absorbed head unconditionally. Pure
  defence in depth, stated as load-bearing. **high**

---

## 5. Probe written this round

Beside this file under `artifacts/people-room-crm-2026-09-11/build/`, one transaction, ROLLBACKed, on
the freshly reset database:

* `probe-r22-a-withdrawal-dated-seat-merge.sql` — §2 (A0–A3: the fold refused while both seats are
  open, one "They withdrew" press, the fold landing, and the survivor holding two open money grants on
  one job), r20-n1 (B: a future-dated hand close leaving `effective_to` in the future), r22-n3 (C:
  `told_refs` after a merge) and m7 (D: `people_directory`'s live COMMENT).
