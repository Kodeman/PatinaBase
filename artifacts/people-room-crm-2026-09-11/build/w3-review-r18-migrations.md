# W3 (P2) — adversarial migration review, round 18

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full this round: `00628`–`00633`; the bodies they graft or stand in front of
(`assert_compliance_holder` 00623, `sync_person_affiliation_from_pointer` 00592,
`identity_paper_state` / `rolodex_card_for_party_phone` / `link_rolodex_card_to_parties` /
`people_directory` 00626, `compliance_state` 00623, `set_project_studio_id` 00563,
`link_party_to_rolodex_card`, `fc_dispatch_optin_invite`, 00417's three studio_contacts
policies); `supabase/tests/people/w3_merge_sweep_household_test.sql`; `w3-data-report.md`;
`w3-fix-log-r17.md`; `w3-review-r17-migrations.md`; `rulings.md`; `direction.md`
§3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a-report.md`,
`w1b-report.md`, `w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md` §4.

**Verdict: NOT clean — ZERO BLOCKING, ONE MAJOR, twenty-four minor.**

r17's BLOCKING-1 and MAJOR-1 are both **FIXED and re-measured** with r17's own probes
(§1.2). The removal is clean: `set_household_threshold()` now moves and opens nothing, and
the suite pins it in two new blocks. This round's MAJOR is a different door onto the same
column — not the figure act, but the **merge**, which repoints seats without ever asking
whether the survivor already holds one of the same kind on the same job.

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `supabase db reset` (full replay + every seed) | **rc=0**, "Finished supabase db reset on branch main." Head carries 00628–00633 (read from `supabase_migrations.schema_migrations`) |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." (26 blocks) |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (13c last) |
| all 24 `supabase/tests/rls/*.sql` | **21 pass, 3 fail** — the same three, all pre-existing, none W3's (n6) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff**, 2766 replayed statements |
| migration numbering | 00628–00633; all above 00627, none inside the reserved 00595–00620; nothing minted this round |
| `cron.job` after the reset | `compliance-document-expiry-sweep · 0 6 * * * · active=t · owner postgres`, body `SELECT public.sweep_compliance_expiries();` — schema-qualified |
| the sweep against the seeded book | `{"notices":3,"scanned":3,"notified":6}` then `{"notices":0,…}` twice — idempotent; one `job_runs` row per invocation |
| sweep recipients | **0** notifications to anyone who is not an active `owner`/`admin` of the holding studio (measured as a NOT EXISTS over `notification_log`) |
| function ACL / `proconfig` | every W3 function pins `search_path=public` except `resolve_merged_contact`, whose `proconfig` is NULL (m3). Trigger functions hold no `authenticated` grant; `sweep_compliance_expiries` is `service_role` only |
| cross-tenant, every new object | an outsider (Phase One Synthetic Studio owner) reads **0** households, **0** merge rows, **0** notices, **0** `project_party_authority` rows, **0** Okonkwo Directory rows; `add_household_member` → `household_not_found`, `set_household_threshold` → `household_not_found`, `merge_studio_contacts` → `merge_not_a_member`, `archive_studio_contact` → `studio_contact_not_found`, `sweep_compliance_expiries` → `permission denied for function` |
| the member doors | plain member: raise the figure → `household_threshold_forbidden`; ERASE the figure → `household_threshold_forbidden`; forge lineage → `permission denied for table studio_contact_merges`; PATCH `merged_into` → `studio_contact_merge_pointer_forbidden`; write a notice → `permission denied for table studio_compliance_notices`; archive → `studio_contact_archive_forbidden`. **ADMIN** PATCHing `merged_into` → `studio_contact_merge_pointer_forbidden` |
| no company into a person | firm → non-sole-prop person `merge_kind_mismatch`; person → firm `merge_kind_mismatch`; firm → sole-prop person (Dana Kowalski) succeeds — crm-model §4's one exception, one direction |
| 00628 backfill outcome | 8 projects, 3 stamped, **5 still `studio_id IS NULL`**, all five with `n_orgs = 2` (ambiguous) and **0 seats** — R-BD holds, R-BI's hazard not live locally |
| 00633 | `client_decisions_court_check` reads eleven words, a strict superset (read from `pg_constraint`); ledger unchanged, 6 rows all `court='client'` |
| R-AY (record-only consent) | grep over `00628`–`00633`: **no** non-comment `studio_channel_consent` / `record_channel_consent` / `sms_consent_*` token anywhere except `people_directory`'s OUTPUT key `'sms_consent_status', q.consent_word` (`00629:2869`), whose value is `identity_consent_status()`. No consent read for a verdict, no consent write |
| merge orphans | generic sweep over all **20** FK columns into `studio_contacts` after a fold: the only residual pointer at the folded card is `studio_contact_merges.merged_id=1`; `client_households.member_person_ids` carries 0 |
| graft fidelity | comment-stripped body diffs: `assert_compliance_holder` = 00623 + `v_retiring` and six IF conditions and nothing else; `sync_person_affiliation_from_pointer` = 00592 + one disjunct; `identity_paper_state` = 00626 + the `holder` CTE; `rolodex_card_for_party_phone` = 00626 + resolve-forward; `link_rolodex_card_to_parties` = 00626 + one disjunct; `people_directory` = 00626 with **exactly two** deltas (TEAM tenant leg, CONTACTS `merged_into IS NULL`). Each grafted from the true head (`grep … | sort | tail -1`) |
| 00417 policy graft | `studio_contacts_member_insert` / `_member_update` are 00417:225-249 verbatim plus one `merged_into IS NULL` predicate per clause; the admin leg is deliberately not re-issued. No predicate lost |

### 1.2 Every r17 finding re-checked

| r17 | State |
|---|---|
| **BLOCKING-1** — the figure act opened money authority on other jobs' seats | **FIXED, re-measured.** `probe-r17-a` re-run on a fresh reset: `A-d open money grants after the OKONKWO figure alone: none`; `A-f after the LINDQVIST figure is set to 900000: none`. `probe-r17-b` (one household, no fold): `B-c open money grants after the figure: none`. The loop is gone from `set_household_threshold()`; `00632:729-759` carries R-BQ at the site |
| **MAJOR-1** — a studio-less seat refused the whole figure act | **FIXED, re-measured.** `probe-r17-c` re-run: `C-b the figure act SUCCEEDED` (was `REFUSED: household_grant_project_has_no_studio`) |
| **r17-n1** — nothing in the suite could see either finding | **CLOSED.** Block 13b is rewritten to R-BQ and block 13c stages one member on THREE jobs (household job, ordinary roster seat, R-BI studio-less seat). Both pass |
| r17-n2 · r17-n3 · r16-n1 · r16-n2 · n1–n9 · m1–m9 · m11–m15 | **ALL OPEN** — the r17 fix log names four findings closed and nothing else touched. Each re-read or re-measured this round and restated in §3 |

---

## 2. MAJOR-1 — the duplicate band's own act leaves one human holding two open seats of the same kind on one job, each with its own open money authority

**Severity: major. Confidence: high (measured on a freshly reset database, rolled back;
reached with room acts only, no hand-written SQL, no legacy row).**

### The gap

`merge_studio_contacts()`'s seat block repoints the identity key with one unconditional
statement (`00629:2400-2401`):

```sql
UPDATE public.project_parties
   SET studio_contact_id = p_survivor WHERE studio_contact_id = p_merged;
```

There is no uniqueness on `(project_id, studio_contact_id, party_kind)` — read from
`pg_constraint`, `project_parties` carries no such index — and the RPC asks no question
about what the survivor already holds. So when the same human was seated on the same job
under BOTH cards, the fold produces two live seats of the same kind stamped with one card,
and `people_directory` then claims both: `seat_count` goes to 2 and
`people_directory_seats` nests two lines for one job and one `party_kind`.

That much is only a duplicated row. The harm is the column `00632` writes onto it.

### Measured — the shape, with money on it

`artifacts/…/build/probe-r18-e-merge-duplicate-authority.sql`, one transaction, ROLLBACKed,
every step an act the room offers, as the seeded studio's owner:

1. Two cards for one client-side human sharing a phone — direction §3.1's canonical
   duplicate band, "These two cards share a phone.", crm-model §4 rule 2.
2. Card A is seated `client_rep` on the Okonkwo residence and given the agreement's
   authority (R-J's "Confirm from the agreement"), `$10,000`, `source_clause = 'agreement §4'`.
3. Card B is made a household member and seated on the SAME job through
   `add_household_member(…, 'client_rep', <okonkwo>)` — the household's figure, `$2,500`.
4. The duplicate band's own act: `merge_studio_contacts(A, B, 'phone')`.

```
E-a before the merge — two Directory rows, one seat each, one money row each
      f8d0…000a Cyril Probe  seat_count 1   agreement §4                         1000000
      f8d0…000b Cyril Probe  seat_count 1   client_households.co_threshold_cents  250000

E-b after the merge — ONE Directory row, seat_count 2, and BOTH grants still open
      seat 57bd2483…  client_rep  Cyril Probe   250000  client_households.co_threshold_cents
      seat f8e0…000a  client_rep  Cyril Probe  1000000  agreement §4

E-c the owner then raises the household figure to $9,000
      seat 57bd2483…   900000  client_households.co_threshold_cents
      seat f8e0…000a  1000000  agreement §4
```

The Call Sheet's Client side bands `client` / `client_rep` before the window rule is
consulted (`00632:450-452`'s own note), so after the fold it prints the same human twice —
"Signs money to $2,500." beside "Signs money to $10,000." — one screen, two simultaneously
rendered, directly contradictory facts about money, over a record that had just told the
studio the two cards are ONE human. It is the harm `00632:600-607`'s own banner names and the
one PR-c and PR-n put under the principal, reached through the one act direction §8's P2 row
promises as "duplicates converge".

E-c shows it does not converge on its own: `set_household_threshold()` correctly moves only
the grant it sourced (r9 M-1 / r16 MAJOR-1 / R-BQ), so the two figures then differ by more
than they did before the merge.

### Why this is major and not blocking

No value is fabricated and nothing crosses a tenant: both grants are records the studio
really wrote, and the RPC writes neither. And unlike r17's blocking there IS a repair in the
room — "Close this seat" on the duplicate seat, or Revoke on its grant, both of which
`project_party_authority`'s owner/admin money policies permit. What is broken is that the
room does not say the repair is owed: the merge sheet promises in words that the seats move
onto the survivor, and the survivor's row then claims two of them without a word about the
collision. It is a reader disagreeing with the record, which is this brief's major bar.

### The milder version, also measured, also live

`probe-r18-c-merge-duplicate-seats.sql` reaches the same duplicated seat with two ordinary
trade cards and no household at all:

```
C-a before: Probe Twin A seat_count 1 | Probe Twin B seat_count 1
C-b after:  Probe Twin A seat_count 2
C-c people_directory_seats nests:
      Okonkwo residence · sub · Probe Twin A
      Okonkwo residence · sub · Probe Twin B
```

The second seat line still carries the FOLDED card's name, which is PR-b's ruling working
("Name at time and trade on the job stay snapshotted") and not a finding — but the identity
row beneath which both lines sit is now one human on one job in one role, twice.

### Where a fix belongs (not prescriptive)

Three shapes, none settled by this finding:

* **Refuse by name, before the first write**, the way `merge_survivor_archived`,
  `merge_two_logins`, `merge_seat_on_studioless_project` and `merge_seat_card_other_studio`
  already do — a `merge_seat_collision` naming the job, with the repair ("close one of these
  two seats first") stated in the HINT. This is the posture the file already takes five times
  for exactly this class: a state the merge cannot resolve for the studio.
* **Close the absorbed seat** with `off_job_at` / `off_job_reason` at the fold. R-BN forbids
  deleting a typed fact; closing is adding one, and 00624 already makes `off_job_at` the
  room's own "this seat left the job" record. Its grant would then be ended the way
  `set_household_threshold()` ends a closed seat's grant (`00632:713-716`).
* **Leave the data and name the collision on the face** — the compare sheet already shows
  both values wherever a reduction will pick one (R-BN's last sentence); a seat collision is
  the one place it shows nothing because nothing reduces.

The pin belongs in `w3_merge_sweep_household_test.sql` beside block 13c: one identity, two
cards, both seated `client_rep` on ONE job with two open money grants, asserted across the
fold, with the ordinary trade-card version (probe C) as the control that the same shape is
reachable with no household in it.

---

## 3. Minor

### r18-n1 — NEW: no block in any suite stages a seat collision across a fold
**minor · high confidence · read.** The W3 suite's merge blocks (2, 8–11m) each stage one
seat per card per job, and blocks 13/13b/13c stage households on jobs with one seat apiece.
`w1b`'s block 3 stages two seats for one identity (Dana Kowalski, 3d/3i; Erin Sato, 3n) but
on two different PROJECTS, and the seeded book itself carries no collision — measured, every
`(project_id, studio_contact_id, party_kind)` triple in `project_parties` is unique, and
Dana's two Okonkwo seats are `sub` and `client_rep`. Nothing anywhere stages one identity
holding two seats of the same `party_kind` on one project, which is the whole of §2, so the
state is invisible to every gate this wave runs.

### r18-n2 — NEW: the household DELETE policy drops the co-member leg its three siblings carry
**minor · high confidence · read from `pg_policies`.** `client_households_studio_select`,
`_insert` and `_update` all read
`is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`;
`client_households_studio_delete` (`00632:302-309`) reads
`is_active_studio_member(organization_id) AND is_org_admin_or_owner(organization_id)` and
drops the designer leg. The tenant leg still bounds it, so no cross-tenant delete is
reachable and the population where the two differ is empty on any ordinary book — but an
owner/admin can DELETE a row the same policy set would not let them SELECT, and
`designer_clients.household_id` is `ON DELETE SET NULL`, so the client record loses its
household silently.

### r18-n3 — NEW: a household's two tenancy facts can be written disagreeing
**minor · medium confidence · reasoned from the policy text.**
`is_studio_comember(designer_id)` is true whenever the caller shares ANY active organization
with that designer (the finding w1b r5 MAJOR-3 established and `00632:27-37`'s own banner
restates), so a member of studios X and Y may INSERT a household with
`organization_id = X` naming a designer who belongs only to Y. The tenant leg then bounds
every later read and every member card to X, so nothing leaks — but the row's
`designer_id` names a designer of record with no standing in the studio that holds it, and
`add_household_member()`'s body makes the same pair of tests, so the RPC accepts it too.

### r16-n1 — CARRIED: `add_household_member()` leaves the CLOSED seat's grant open
**minor · high confidence · re-read at `00632:454-461`.** The seat lookup skips an
`off_job_at` row and opens a new seat; nothing ends the closed seat's own open `money` grant.
`00632:39-45`'s banner claims both halves of the rule. The next `set_household_threshold()`
call closes it (`00632:713-716`) — but only if the household also owns it, and only when
somebody touches the figure. Widened by r17's removal, as the r17 fix log records.

### r17-n2 — CARRIED: `source_household_id` carries no tenancy or consistency rule of its own
**minor · medium confidence · re-read.** `00632:347-353` is a bare FK with no CHECK and no
trigger tying the named household's `organization_id` to the seat's recorded studio. No
cross-tenant write is reachable (both writers are bounded by `member_person_ids`, which
`assert_client_household_members()` holds to cards in the household's own studio, and
`project_party_authority`'s money policies require
`is_org_admin_or_owner(project_party_recorded_studio(engagement_id))` — read live from
`pg_policy`). The worst an owner/admin can do by hand is strand a grant no loop will match.

### n1 — CARRIED: 00628's NOTICE reports the designer-domain-role delta over EVERY stamped project
**minor · high confidence · re-read at `00628:178-184`.** The count is
`WHERE p.studio_id IS NOT NULL AND NOT has_designer_domain_role(p.designer_id)` — every
project that has a studio, ever — printed as "% **stamped** project(s)…". Locally both
readings are 0; on Strata it reports the whole book, and the W7 preflight reads that line.

### n2 — CARRIED: `contact_rule_blocks_contact()` has no caller, and its COMMENT states a rule the file stopped making at r5
**minor · high confidence · re-grepped.** The only files naming it are `00629` itself,
`seed/00-legacy-grants.sql` and the generated `database.types.ts`. Its COMMENT
(`00629:928-933`) says "merge_studio_contacts() refuses on it"; `00629:1469-1484` refuses on
subsumption instead.

### n3 — CARRIED: `00631:334` cites "w3 block 12", which now exists and is about something else
**minor · high confidence · re-read.** 00631's `updated_at` pin is block 7d; block 12 is
r15's closed-seat household block.

### n4 — CARRIED: `add_household_member()` raises the NEIGHBOURING file's raw tokens on both studio doors
**minor · high confidence · re-read.** `00632:464-471` inserts the seat before any studio is
resolved, so `assert_project_party_cards()` answers first —
`party_studio_contact_other_studio`, `party_card_project_has_no_studio` — while
`household_grant_forbidden` / `household_grant_project_has_no_studio` are defined two
statements later for one of the same conditions. Both 00624 tokens are humanised by
`write-error.ts`, so nothing raw reaches the face; the finding is that one condition has two
vocabularies.

### n5 — CARRIED: the notice's subject builds a possessive by concatenation
**minor · high confidence · re-measured off the rows the sweep actually wrote this round.**
`00630:412-415`'s `v_holder || '''s paper has lapsed'` produced
`Ostrom Builders's paper has lapsed`. A notification is a face.

### n6 — CARRIED: three of the branch's own RLS suites fail, and nothing on the branch records it
**minor · high confidence · re-measured post-reset (21 pass, 3 fail).**

```
design_requests_test.sql   ERROR: FAIL 3b: expected no_scans, got <none>
field_parties_test.sql     ERROR: consent_legacy_column_frozen
studio_titles_test.sql     ERROR: FAIL f: demoting the sole active owner should raise last_owner_protected
```

None is W3's, and `field_parties`'s is R-AX/R-AY working as ruled.

### n7 — CARRIED: the merge's note about what a rule leaves behind names two of three columns
**minor · high confidence.** `00629:2124-2125` names `reason` and `contact_hours`;
`escalation_by_class` is the third the conditional repoint can strand, and is unnamed.

### n8 — CARRIED: the seat guard covers two of the seat's four card pointers
**minor · high confidence · re-read from `pg_trigger`.** `assert_party_card_not_merged_trg`
is `BEFORE INSERT OR UPDATE OF studio_contact_id, company_id`;
`warranty_contact_person_id` is not in the list and `assert_project_party_cards()` tests only
the card's org. `bid_quoted_by_person_id` is covered by 00631's own guard.

### n9 — CARRIED: the studio-less / other-studio pre-checks enumerate three of the four card pointers
**minor · high confidence (the gap) · low confidence (reachable today).** `00629:1534-1548`
and `:1590-1635` pre-refuse over `studio_contact_id`, `company_id` and
`warranty_contact_person_id`. The seat block also writes `bid_quoted_by_person_id`
(`00629:2446-2450`), whose guard raises `party_bid_quoted_by_project_has_no_studio` /
`_other_studio` — both humanised in `write-error.ts`, so the token no longer reaches the
face, but the merge still aborts mid-transaction where the pre-checks would have refused by
name. Population empty today (0 seats on the five studio-less projects).

### m1 — CARRIED: the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · RE-MEASURED LIVE this round** (not by `prosrc` alone):
`probe-r18-f-archived-holder.sql` archives Northgate Electric's card, clears the notice
ledger and runs the sweep — `{"notices":3,"scanned":3,"notified":6}`, with
`subject = "Northgate Electric's paper has lapsed"` and
`deep_link = /people?firm=d0e20000-…-000003`, a card
`useStudioContacts(…, { includeArchived: false })` does not return. `00630:376-394` carries
`sc.merged_into IS NULL` and no `archived_at` leg. 0 archived holders in the seeded book.

### m2 — CARRIED: deleting a household, or dropping a member from the array, orphans the grants it sourced
**minor · high confidence · structural.** `00632:302-309`'s DELETE policy and any direct
PATCH of `member_person_ids` leave open `project_party_authority` rows carrying the clause
and the household id standing with no household behind them (`source_household_id` is
`ON DELETE SET NULL`, so the id goes and the clause stays). `set_household_threshold()` is the
only closer and it keys on the member array the delete has already emptied.

### m3 — CARRIED: `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · re-measured (`proconfig` is NULL for it, `search_path=public`
for every other wave function, read from `pg_proc`).** SECURITY INVOKER and fully
schema-qualified, so the exposure is narrow — but it is granted to `authenticated` and called
twice per emitted Directory row from inside `identity_paper_state()`, and the wave's own
stated rule is that every function pins.

### m4 — CARRIED: `w3-data-report.md:132` says "33 papers in total" where the database says 36
**minor · high confidence · re-measured post-reset.** `count(*) FROM
studio_compliance_documents` = 36; `compliance_document_state()` over every row: `current` 9,
`held` 24, `lapsed` 2, `lapses_soon` 1 = 36. The four state counts in the same sentence are
right; the total is not.

### m5 — CARRIED: the `project_consent_org()` enumeration describes one call site inaccurately
**minor · medium confidence · re-measured (the twelve callers enumerated live from
`pg_proc`, `pg_get_viewdef` and `pg_policy` match the report's list exactly).**
`00628:56-80` and report §6 say all twelve are "the CONSENT LEDGER'S KEY — not a guard and
not a reducer". `00629:2937-2942` is
`CASE WHEN is_active_studio_member(project_consent_org(q0.project_id)) THEN COALESCE(…) END`
— a membership GUARD on whether the affirmative word renders. The behaviour is right and
deliberate (w1b r6 MAJOR-1 put it there, and `project_tenant_org()` cannot answer the
question "may this caller read the record that decided the word"); the sentence enumerating
it is not.

### m6 — CARRIED: two small internal inconsistencies in 00629
**minor · high confidence · re-read.** `v_merge_id` is declared (`:1282`), assigned by the
final `RETURNING` (`:2531`) and never read. `studio_contact_merges`' COMMENT (`:306-314`)
says "a merge that happened is a fact nobody may forge or take back" beside
`GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role` (`:354`) — true of `authenticated`,
not of every writer.

### m7 — CARRIED: `people_directory`'s own COMMENT was not re-issued
**minor · high confidence · re-measured post-reset and confirmed by the body diff.**
`CREATE OR REPLACE VIEW` keeps the existing comment, and 00626's `COMMENT ON VIEW` is the
last thing the comment-stripped diff shows 00629 dropping. So neither declared delta — the
merged-card fold and the TEAM branch's tenant leg, the latter a narrowing of who reads a
studio's teammate names — reaches the object's own record.

### m8 — CARRIED: `identity_paper_state()` runs four recursive walks per emitted Directory row
**minor · medium confidence.** `00629:1156-1161`: two `resolve_merged_contact()` recursive
CTEs (depth cap 16) on top of the two `compliance_state()` walks (depth cap 64), on a
function called once per CONTACTS row and once per PARTY row. `identity_seats` was
materialised in W1b r11 for exactly this class of cost on the same view.

### m9 — CARRIED and WIDENED AGAIN: `w3-data-report.md` is stale in at least thirteen places
**minor · high confidence · re-measured this round.** The report's mtime is 2026-09-13
22:20; the r17 fix log's is 2026-09-15 06:00, so the report predates rounds 8 through 17
entirely, and the W7 preflight reads it. Measured drifts, in one list:

1. §1:45 "Eleven, not eight" refusals — `merge_studio_contacts()` raises **thirteen**
   distinct tokens (`merge_seat_on_studioless_project` and `merge_seat_card_other_studio`
   are absent from the report's list).
2. §1:41 "plus one line" on `people_directory` — the body diff returns **two** deltas (§7
   corrects this; §1 was never corrected).
3. §1/§9 omit `project_parties_touch_updated_at()` and `contact_rule_blocks_contact()`.
4. §0:23 / §8:333 "12 blocks as of r7" — the suite now ends at **13c**.
5. §2:132 "33 papers" against a measured **36**.
6. §2:130 Lakeshore's absolute `lapses_soon` date 2026-10-06 — measured **2026-10-08**, and
   seed-relative by construction.
7. §8:337 "2752 replayed statements" against a measured **2766**.
8. §8:334 "301 insertions, 0 deletions" — `db:generate` now regenerates with **no diff**.
9. §4:201 / :212 describe the pre-r15 `add_household_member()` seat lookup.
10. §4/§8/§9 never mention `project_party_authority.source_household_id`, its index or its
    FK — the load-bearing half of "the household's own grant" since r16.
11. §9 describes `set_household_threshold()` as "the figure AND the grants it sources" with
    no word of R-BQ, which is the round-17 ruling the function now turns on.
12. §7.2 / §10.1 still argue about whether the TEAM tenant leg shipped; it did.
13. §10.4's portal-lane claims are five rounds old.

### m11 — CARRIED: 00628's backfill bumps `projects.updated_at` for every project it repairs
**minor · low confidence.** `update_projects_updated_at` is BEFORE UPDATE FOR EACH ROW on
`projects` and `00628:117-122` does not bracket it. Nothing in this program ranks by
`projects.updated_at`.

### m12 — CARRIED: a notice is SPENT even when nobody was told
**minor · high confidence (mechanism) · narrow population.** `00630:399-409` writes the
notice row and increments `v_notices` first; `:454-486` then writes one `notification_log`
row per active owner/admin and never checks that any landed. A studio whose only active
members are plain `member`s has the `(document_id, state, expires_on)` key permanently
consumed while `v_notified` stays 0.

### m13 — CARRIED: after a firm-to-firm fold an uncarded seat's Directory row names the folded card's spelling
**minor · high confidence.** `project_parties.company_name` is a free-text snapshot the
merge never writes (`00629:2411-2413` argues the case for the CROSS fold); on a same-kind
firm fold the argument does not carry.

### m14 — CARRIED: 00630's `merged_into` leg describes merge behaviour that r3 replaced
**minor · high confidence · re-read at `00630:381-393`.** The comment says the merge "leaves
an absorbed document on the absorbed card wherever the survivor holds no successor to retire
it … correctly"; `00629:2269-2273` moves EVERY absorbed head unconditionally and
`:2280-2290` walks the lineage behind it. The leg is pure defence in depth; the comment
states it as load-bearing.

### m15 — CARRIED: neither household door reads `archived_at`
**minor · medium confidence · re-measured (`prosrc like '%archived_at%'` answers false for
both `add_household_member` and `assert_client_household_members`).** `00632:417-425` and
`:166-179` refuse a card that is missing, in another studio, not a person, or merged away —
but not one the studio has PUT AWAY. So a card `useStudioContacts(…, { includeArchived:
false })` hides can still be made a household member and seated on a job — the shape
`merge_survivor_archived` (r5 M-4) exists to refuse one table over.

### m16 — CARRIED (was r17-n3, folded here): the report omits `source_household_id` — see m9 items 10 and 11.

---

## 4. What was checked and found sound (not findings)

* **r17's two findings, both fixed and re-measured with r17's own probes** (§1.2). The fix is
  a removal plus R-BQ stated at the site, in the banner and in both function COMMENTs; the
  move loop keeps its `source_household_id` leg, its closed-seat ending and its per-seat PR-n
  refusals unchanged.
* **The merge is transactional and orphans nothing.** A generic sweep over all 20 FK columns
  into `studio_contacts` after a fold leaves only `studio_contact_merges.merged_id`; the
  household array carries 0. The Directory folds the merged card and the survivor's row is
  the whole human; both ids stay resolvable (PR-o).
* **`merged_into` is the RPC's alone.** Member and ADMIN PATCHes both answer
  `studio_contact_merge_pointer_forbidden`; the lineage table refuses a member INSERT by
  privilege, not by policy silence.
* **No company into a person** except crm-model §4's one exception, both directions measured.
* **Households RLS**: all four policies carry the tenant leg, owner/admin on DELETE and on any
  write carrying `co_threshold_cents`, plus `assert_household_threshold_principal()` reading
  the CHANGE so an ERASE is refused too — measured for both directions as a plain member.
* **Cross-tenant, every door**: 0 rows and five named refusals for an outsider;
  `permission denied for function sweep_compliance_expiries` for `authenticated`.
* **The sweep end to end** on the seeded book, its idempotent second and third runs, its
  owner/admin-only recipients (0 notifications to anyone else, measured as a NOT EXISTS),
  its `job_runs` rows, its advisory xact lock and its cron registration at `0 6 * * *` with a
  schema-qualified body.
* **`compliance_document_state()` and `compliance_state()` agree** on all four coupled rules —
  30-day window, `cardinality(blocks) > 0`, the transitive walk with depth cap 64, and the
  in-force / gates / same-doc_type retirement legs — read side by side this round.
* **Every graft is faithful to the true head**, verified by comment-stripped body diffs
  rather than by reading banners (§1, "graft fidelity"), and the head of each was found with
  `grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" | sort | tail -1`.
* **00417's three studio_contacts policies**: the two re-issued in 00629 are 00417's byte for
  byte plus one predicate each; no predicate was dropped, and the admin leg is left where
  00417 put it with the trigger holding `merged_into` against it.
* **00628's claim about `set_project_studio_id()` holds**: read at 00563:89-323, the
  migration session takes `v_postgres_migration` and returns NEW after the immutability
  checks, which 00628's UPDATE (studio_id only) satisfies.
* **R-BD's backfill** leaves all five ambiguous projects NULL, none carrying seats;
  `project_consent_org()`'s twelve remaining callers are the consent ledger's key — the
  RULING, not a gap.
* **Court widening** is purely additive (`pg_constraint` read post-reset);
  `project_tasks.owner` deliberately not widened, and the court is independent of
  `party_kind`, so 00633 promises nothing a seat has to carry.
* **R-AY**: no W3 migration reads or writes consent for a verdict. `fc_optin_invite_dispatch`
  (00374-era, AFTER INSERT OR UPDATE on `project_parties`) fires on the merge's four seat
  repoints and on `add_household_member()`'s seat INSERT, and was checked: its own OLD/NEW
  idempotency gate returns before `invoke_edge_function` in both cases, so no merge and no
  household act sends anything.
* **`link_party_to_rolodex_card()`** returns early when `studio_contact_id` is already set, so
  `add_household_member()`'s explicit stamp cannot be overwritten by the phone resolver.
* **Reset replays clean; all three people suites pass; types and legacy grants both
  regenerate with no diff.**

---

## 5. Probes written this round

Beside this file under `artifacts/people-room-crm-2026-09-11/build/`, all one transaction and
ROLLBACKed, all on a freshly reset database:

* `probe-r18-c-merge-duplicate-seats.sql` — §2's milder version: two trade cards, two seats
  on one job, one fold, `seat_count 2` and two nested seat lines.
* `probe-r18-e-merge-duplicate-authority.sql` — MAJOR-1: the same fold with money on both
  seats, plus E-c's demonstration that raising the household figure widens the gap.
* `probe-r18-d-gates-and-tenancy.sql` — the outsider, the plain member, the admin, and the
  three kind-mismatch directions.
* `probe-r18-f-archived-holder.sql` — m1, measured live rather than by `prosrc`.
* `probe-r18-a-structure.sql` / `probe-r18-b-sweep.sql` — the ACL, policy, cron, court,
  backfill, consent-caller and sweep census tables quoted in §1.

r17's `probe-r17-a-loop2-crossjob.sql`, `probe-r17-b-loop2-onehousehold.sql` and
`probe-r17-c-studioless-widening.sql` were re-run unmodified; their output is in §1.2.
