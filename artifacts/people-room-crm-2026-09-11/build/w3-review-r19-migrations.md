# W3 (P2) — adversarial migration review, round 19

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full this round: `00628`–`00633`; the bodies they graft or stand in front of
(`assert_compliance_holder` 00623, `sync_person_affiliation_from_pointer` 00592,
`identity_paper_state` / `rolodex_card_for_party_phone` / `link_rolodex_card_to_parties` /
`people_directory` / `party_identity_key` 00626, `set_project_studio_id` 00317/00563,
00417's studio_contacts policies); `supabase/tests/people/w3_merge_sweep_household_test.sql`
(block 13d in full); `w3-data-report.md`; `w3-fix-log-r18.md`; `w3-review-r18-migrations.md`;
`probe-r18-g-fix-seat-collision.sql`; `rulings.md`; `direction.md` §3.1/§3.4/§5/§7/§8/§9;
`crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a-report.md`, `w1b-report.md`,
`w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md` §4. Plus the three product
files the r18 fix touched and the four readers that render the seat this round's MAJOR is about
(`use-coordination.ts`, `use-project-authority.ts`, `roster-derivation.ts`, `roster-row.tsx`,
`use-households.ts`).

**Verdict: NOT clean — ZERO BLOCKING, ONE MAJOR, twenty-six minor.**

All four r18 defects are **FIXED and re-verified** (§1.2). This round's MAJOR is the r18 fix's
own escape hatch: the refusal's HINT names a repair — "Close one of these two seats first" —
and taking that repair produces exactly the two-contradictory-money-figures state the refusal
exists to prevent, because nothing in the room ends a closed seat's money grant. Measured on a
freshly reset database, rolled back, with room acts only.

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `supabase db reset` (full replay + every seed) | **clean** — a full reset on this worktree and these files completed 06:54 immediately before this round (another lane of this same program; a `next start -p 3000` from that lane was live, so this round did not re-reset). Ledger head reads `00633`, `00632`, `00631`, `00630`, `00629`, `00628`, `00627`, plus `20260910152111`; seeds landed (49 `studio_contacts`, 0 with `merged_into`). The DB carries the r18 edits: `merge_studio_contacts.prosrc LIKE '%merge_seat_collision%'` → `t` |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." (26 blocks) |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed", **13d last** |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff**, 2766 replayed statements |
| migration numbering | `00628`–`00633`; all above `00627`, none inside the reserved `00595`–`00620`; nothing minted this round |
| function ACL / `proconfig` (19 wave functions, read from `pg_proc`) | every one pins `search_path=public` except `resolve_merged_contact`, whose `proconfig` is NULL (m3). No `anon` grant anywhere. Trigger functions hold `postgres` + `service_role` only. `sweep_compliance_expiries` is `service_role` only |
| cross-tenant, every new object (Phase One Synthetic Studio owner) | **0** households, **0** merge rows, **0** notices, **0** `project_party_authority` rows, **0** Directory rows; `add_household_member` → `household_not_found`, `set_household_threshold` → `household_not_found`, `sweep_compliance_expiries` → `permission denied for function`, forge lineage → `permission denied for table studio_contact_merges`, write a notice → `permission denied for table studio_compliance_notices` |
| R-AY (record-only consent) | grep over `00628`–`00633`: no non-comment `studio_channel_consent` / `record_channel_consent` / `sms_consent_*` token anywhere except `people_directory`'s OUTPUT key `'sms_consent_status', q.consent_word` (`00629:2951`), whose value is `identity_consent_status()`. No consent read for a verdict, no consent write |
| `merge_studio_contacts` refusal census | **14** distinct `merge_*` / `studio_contact_merge_*` tokens raised (m9 item 1) |
| `client_households` policies (read from `pg_policy`) | SELECT / UPDATE carry `is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`; DELETE carries `is_active_studio_member AND is_org_admin_or_owner` (r18-n2); INSERT WITH CHECK carries both plus PR-n's figure leg |
| `client_decisions_court_check` | eleven words, a strict superset of 00212/00281's seven; ledger unchanged |

### 1.2 Every r18 finding re-checked

| r18 | State |
|---|---|
| **BLOCKING-1** — a bid-outcome correction erased a hand-closed seat's date and reason | **FIXED, re-read.** `use-coordination.ts:2586` now reads `} else if (written.stage && previous.bidOutcome === 'withdrawn') {`, exactly R-BR's scope; the comment at `:2599-2614` records why the guard is on the PREVIOUS outcome |
| **MAJOR-1 (migrations)** — the merge left one human holding two open seats of one kind on one job | **FIXED as written, and its prescribed repair opens §2.** The pre-check is `00629:1698-1717`; `merge_seat_collision` fires with DETAIL `Okonkwo residence · client_rep` and HINT naming the repair, writes nothing, and the suite pins it in 13d. The NEW finding is what happens after the studio takes the repair |
| **MAJOR (QA)** — "Add to the household" was natively `disabled` | **FIXED, re-read.** `household-band.tsx:942` reads `held={addHeld || !personId}`, `:127` exports `HOUSEHOLD_PICK_HELD_REASON`, `:927` renders it, `:954` routes it into the alert |
| **MAJOR (report)** — the room report stated a money write the RPC cannot make | **FIXED, re-read** at `w3-room-report.md:273-277` and `:399-403`: both lines now say the RPC reused the open seat and wrote no authority row, with the r18 re-measurement beside them |
| r18-n1 · r18-n2 · r18-n3 · r16-n1 · r17-n2 · n1–n9 · m1–m9 · m11–m16 | **ALL OPEN** — the r18 fix log names four defects closed and nothing else touched. Each re-read or re-measured this round and restated in §3 |

---

## 2. MAJOR-1 — `merge_seat_collision`'s own HINT names a repair that produces the contradiction the refusal exists to prevent

**Severity: major. Confidence: high (measured on the freshly reset database, one transaction,
ROLLBACKed, reached with room acts only — no hand-written repair, no legacy row).**

### The gap

`00629:1692-1697` states the reason the new pre-check reads open seats only:

```sql
-- OPEN SEATS ONLY (off_job_at IS NULL, 00632's own open-seat filter, the
-- room's "Close this seat" record). A closed seat beside a live one of the
-- same kind states no second money fact — its grant was ended at the close
-- — and refusing over a row the studio has already retired would cost the
-- room a fold it can make, and would name a repair that had already been
-- taken.
```

**"its grant was ended at the close" is not a rule anything makes.** `useCloseProjectPartySeat`
(`packages/supabase/src/hooks/use-coordination.ts:856-883`) writes exactly three columns —
`stage: 'off_job'`, `off_job_at`, `off_job_reason` — and never touches
`project_party_authority`. The only closer of a household-sourced grant is
`set_household_threshold()` (`00632:713-716`), which runs only when somebody touches the figure
and only over grants that household sourced; an `agreement §4` grant has no closer at all.

So the HINT's repair — *"Close one of these two seats first, then merge."* — leaves the closed
seat's `money` row **open** (`effective_to IS NULL`), the fold then goes through, and the
survivor comes out holding **two `client_rep` seats on one job, each with its own open money
grant.** Both land in the Call Sheet's Client side band, because
`callSheetProjection()` short-circuits on kind **before** the window rule is consulted
(`apps/designer-portal/src/lib/document/roster-derivation.ts:781-783`, `CLIENT_BAND_KINDS` at
`:720`), and both grants render, because `useProjectAuthority` keeps every row with
`effective_to IS NULL OR >= today`
(`apps/designer-portal/src/components/document/roster/use-project-authority.ts:47-53`) and
`authorityPhrase` prints a present-tense figure per seat
(`roster-derivation.ts:1105-1124`, called at `roster-row.tsx:355-360`).

### Measured

`artifacts/…/build/probe-r19-a-closed-seat-two-figures.sql`, one transaction, ROLLBACKed, as the
seeded studio's owner. Two cards for one client-side human sharing a phone (direction §3.1's
canonical duplicate); card A seated `client_rep` on the Okonkwo residence with the agreement's
$10,000 (R-J); card B added through `add_household_member(…, 'client_rep', <okonkwo>)` at the
household's $2,500.

```
A-a refusal: merge_seat_collision | DETAIL Okonkwo residence · client_rep
            | HINT Both cards hold an open seat of the same kind on the same job, and one
              person cannot hold the job twice. Close one of these two seats first, then merge.

A-b the room takes exactly that repair (the three columns useCloseProjectPartySeat writes)

A-c does "Close this seat" end that seat's money grant?
     seat 83e79154…  off_job_at 2026-09-15  money  250000  effective_to (none)
     -> NO. The grant is still OPEN.

A-d the fold now goes through: survivor f7d0…000a

A-e what the Call Sheet's Client side now holds for ONE human on ONE job:
     f7e0…000a  client_rep  off_job_at (none)      money 1000000  agreement §4
                -> "Signs money to $10,000."
     83e79154…  client_rep  off_job_at 2026-09-15  money  250000  client_households.co_threshold_cents
                -> "Off the job 15 Sep 2026. Seated twice by mistake." + "Signs money to $2,500."

A-f people_directory: Cyril R19 · seat_count 2
    people_directory_seats: two client_rep lines, same project, same identity
```

That is r18 MAJOR-1's own harm statement, word for word — *"the Call Sheet prints the same human
twice, 'Signs money to $2,500.' beside 'Signs money to $10,000.', one screen, two
simultaneously rendered, directly contradictory facts about money, over a record that had just
told the studio these are ONE human"* (`00629:1668-1678`) — reached by following the refusal's
own instruction. The only difference is that one of the two rows also prints a closing clause.

It is not confined to the roster. `useProjectHousehold` picks the first OPEN seat per
(card, kind) (`packages/supabase/src/hooks/use-households.ts:376-382`), so the household band
reads the $10,000 and prints "…recorded outside the household, and that figure stands." while
the band two regions down prints $2,500 for the same person on the same job.

The same state is reachable from the other direction: 13d-k/l's own control (the survivor's seat
is the closed one) folds successfully and leaves the identical pair.

### Why major and not blocking

No value is fabricated, nothing crosses a tenant, and both grants are rows the studio really
wrote. It is a reader disagreeing with the record — this brief's major bar, and the bar r18 used
for the both-open version of the same state.

### Why no gate sees it

`13d-n` (`w3_merge_sweep_household_test.sql:5182-5189`) counts the survivor's open money grants
**with `AND pp.off_job_at IS NULL` on the seat**, so the second open grant — which sits on the
closed seat — is outside the predicate by construction. `13d-l` counts open *seats*, likewise.
The suite passes over the state it is written not to look at (see r19-n2).

### Where a fix belongs (not prescriptive)

Three shapes, none settled by this finding:

* **End the grant when the seat closes.** `useCloseProjectPartySeat` (or a trigger on
  `off_job_at` moving from NULL) sets `effective_to = GREATEST(effective_from, off_job_at)` on
  that seat's open rows — which is exactly what `set_household_threshold()` already does at
  `00632:713-716`, and 00624's own shape for ending a delegation (CS5-24). It makes the comment
  at `00629:1694` true, and it is one rule rather than a merge-shaped exception.
* **Widen the pre-check to any seat carrying an open money grant**, open or closed, so the fold
  refuses until the second figure is actually retired. Cheapest, but it refuses folds that carry
  no money at all unless the predicate also reads `project_party_authority`.
* **Name the collision on the face after the fold** — the Client side band already knows both
  seats belong to one identity and could print one row with the second figure under it.

The pin belongs beside 13d: the same fixture, the repair taken, and an assertion over the
survivor's open money grants on that job **without** the `off_job_at IS NULL` scope.

---

## 3. Minor

### r19-n1 — NEW: `00629:1694` states a rule no code makes
**minor · high confidence · measured (probe A-c).** "its grant was ended at the close" is the
load-bearing sentence under the OPEN-SEATS-ONLY carve-out, and `useCloseProjectPartySeat`
(`use-coordination.ts:862-868`) writes `stage`, `off_job_at`, `off_job_reason` and nothing else.
The same claim is restated in `w3-fix-log-r18.md` §2 and in the suite's own comment at
`w3_merge_sweep_household_test.sql:5151-5154`. Separate from §2 because even with §2 answered by
widening the pre-check, the sentence would still be wrong.

### r19-n2 — NEW: block 13d's two "control" assertions are scoped so the state §2 measures cannot fail them
**minor · high confidence · read.** `13d-l` counts `project_parties … AND off_job_at IS NULL`;
`13d-n` counts open money grants `… AND pp.off_job_at IS NULL`. Both are written over the open
seat alone, so a second open grant on the closed seat is invisible. This is r18-n1's shape one
round later: the suite's merge blocks still stage nothing that can see a money fact standing on a
retired row.

### r18-n1 — CARRIED: no block in any suite stages a seat collision across a fold
**minor · high confidence.** Partly answered by 13d (which now stages exactly that shape and
asserts the refusal), but the seeded book still carries no collision and no block stages one that
SURVIVES a fold — which is §2's population.

### r18-n2 — CARRIED: the household DELETE policy drops the co-member leg its three siblings carry
**minor · high confidence · re-measured from `pg_policy`.** `client_households_studio_delete`
reads `is_active_studio_member(organization_id) AND is_org_admin_or_owner(organization_id)`;
`_select` / `_update` read `is_active_studio_member AND is_studio_comember(designer_id)`. No
cross-tenant delete is reachable, but an owner/admin may DELETE a row the same policy set would
not let them SELECT, and `designer_clients.household_id` is `ON DELETE SET NULL`.

### r18-n3 — CARRIED: a household's two tenancy facts can be written disagreeing
**minor · medium confidence.** `is_studio_comember(designer_id)` is true whenever the caller
shares ANY active organization with that designer, so a member of X and Y may INSERT a household
with `organization_id = X` naming a designer who belongs only to Y; `add_household_member()`'s
body (`00632:412-416`) makes the same pair of tests and accepts it.

### r16-n1 — CARRIED: `add_household_member()` leaves the CLOSED seat's grant open
**minor · high confidence · re-read at `00632:454-461`.** The seat lookup skips an `off_job_at`
row and opens a new one; nothing ends the closed seat's own open `money` grant. Now measured
end-to-end as §2's mechanism.

### r17-n2 — CARRIED: `source_household_id` carries no tenancy or consistency rule of its own
**minor · medium confidence · re-read at `00632:347-353`.** A bare FK, no CHECK, no trigger tying
the named household's `organization_id` to the seat's recorded studio. No cross-tenant write is
reachable (both writers are bounded by `member_person_ids` and by
`project_party_recorded_studio()`); the worst an owner/admin can do by hand is strand a grant no
loop will match.

### n1 — CARRIED: 00628's NOTICE reports the designer-domain-role delta over EVERY stamped project
**minor · high confidence · re-read at `00628:176-184`.** `WHERE p.studio_id IS NOT NULL AND NOT
has_designer_domain_role(p.designer_id)` — every project that has a studio, ever — printed as
"% **stamped** project(s)…". Locally both readings are 0; on Strata it reports the whole book,
and the W7 preflight reads that line.

### n2 — CARRIED: `contact_rule_blocks_contact()` has no caller, and its COMMENT states a rule the file stopped making at r5
**minor · high confidence · re-grepped.** The only files naming it are `00629` itself and
`seed/00-legacy-grants.sql`. Its COMMENT (`00629:934-939`) says "merge_studio_contacts() refuses
on it"; the merge refuses on subsumption instead (`00629:1480-1493`).

### n3 — CARRIED: `00631:334` cites "w3 block 12", which exists and is about something else
**minor · high confidence · re-read.** 00631's `updated_at` pin is block 7d; block 12 is r15's
closed-seat household block.

### n4 — CARRIED: `add_household_member()` raises the NEIGHBOURING file's raw tokens on both studio doors
**minor · high confidence · re-read at `00632:464-471`.** The seat INSERT runs before any studio
is resolved, so `assert_project_party_cards()` answers first —
`party_studio_contact_other_studio`, `party_card_project_has_no_studio` — while
`household_grant_forbidden` / `household_grant_project_has_no_studio` are defined two statements
later for one of the same conditions. Both 00624 tokens are humanised by `write-error.ts`.

### n5 — CARRIED: the notice's subject builds a possessive by concatenation
**minor · high confidence · re-read at `00630:412-415`.** `v_holder || '''s paper has lapsed'`
produces `Ostrom Builders's paper has lapsed`. A notification is a face.

### n6 — CARRIED: three of the branch's own RLS suites fail, and nothing on the branch records it
**minor · high confidence · carried unchanged from r18's measurement** (21 pass, 3 fail:
`design_requests_test.sql`, `field_parties_test.sql`, `studio_titles_test.sql`). None is W3's, and
`field_parties`'s is R-AX/R-AY working as ruled. Not re-run this round because the concurrent QA
lane held the database and a `next start` session on port 3000.

### n7 — CARRIED: the merge's note about what a rule leaves behind names two of three columns
**minor · high confidence · re-read at `00629:2216-2221`.** The comment names "its forbidden
channels, its reason, its hours"; `escalation_by_class` (direction §7's own column list for
`studio_contact_rules`) is the third the conditional repoint can strand, and the token appears
nowhere in the file.

### n8 — CARRIED: the seat guard covers two of the seat's four card pointers
**minor · high confidence · re-read from `pg_trigger`.** `assert_party_card_not_merged_trg` is
`BEFORE INSERT OR UPDATE OF studio_contact_id, company_id`;
`warranty_contact_person_id` is not in the list. `bid_quoted_by_person_id` is covered by 00631's
own guard.

### n9 — CARRIED: the studio-less / other-studio pre-checks enumerate three of the four card pointers
**minor · high confidence (the gap) · low confidence (reachable today).** `00629:1545-1567` and
`:1601-1654` pre-refuse over `studio_contact_id`, `company_id` and `warranty_contact_person_id`;
the seat block also writes `bid_quoted_by_person_id` (`00629:2522-2524`). Population empty today
(0 seats on the five studio-less projects).

### m1 — CARRIED: the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · re-grepped.** `archived_at` appears nowhere in
`00630_compliance_expiry_sweep.sql`; the document loop carries `sc.merged_into IS NULL` and no
archived leg. 0 archived holders in the seeded book.

### m2 — CARRIED: deleting a household, or dropping a member from the array, orphans the grants it sourced
**minor · high confidence · structural.** `00632:302-309`'s DELETE policy and any direct PATCH of
`member_person_ids` leave open `project_party_authority` rows carrying the clause with no
household behind them (`source_household_id` is `ON DELETE SET NULL`, so the id goes and the
clause stays). `set_household_threshold()` is the only closer and it keys on the member array.

### m3 — CARRIED: `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · re-measured (`proconfig` NULL for it, `search_path=public` for the
other eighteen).** SECURITY INVOKER and fully schema-qualified, so the exposure is narrow — but
it is granted to `authenticated` and called twice per emitted Directory row from inside
`identity_paper_state()` (`00629:1161-1165`), and the wave's own stated rule is that every
function pins.

### m4 — CARRIED: `w3-data-report.md:132` says "33 papers in total" where the database says 36
**minor · high confidence · re-measured post-reset.** `count(*) FROM
studio_compliance_documents` = **36**.

### m5 — CARRIED: the `project_consent_org()` enumeration describes one call site inaccurately
**minor · medium confidence.** `00628:56-80` and report §6 say all twelve are "the CONSENT
LEDGER'S KEY — not a guard and not a reducer"; `00629:2951`'s branch is a membership GUARD on
whether the affirmative word renders. The behaviour is right and deliberate; the sentence
enumerating it is not.

### m6 — CARRIED: two small internal inconsistencies in 00629
**minor · high confidence · re-read.** `v_merge_id` is declared (`:1287`), assigned by the final
`RETURNING` (`:2606`) and never read. `studio_contact_merges`' COMMENT says "a merge that happened
is a fact nobody may forge or take back" beside `GRANT SELECT, INSERT, UPDATE, DELETE … TO
service_role` — true of `authenticated`, not of every writer.

### m7 — CARRIED: `people_directory`'s own COMMENT was not re-issued
**minor · high confidence · re-measured post-reset.** The live comment still opens
"R57 / People Room roster (client|lead|maker|…)" — 00626's text. `CREATE OR REPLACE VIEW` keeps
the existing comment, so neither declared delta (the merged-card fold, the TEAM branch's tenant
leg at `00629:3155`) reaches the object's own record.

### m8 — CARRIED: `identity_paper_state()` runs four recursive walks per emitted Directory row
**minor · medium confidence.** Two `resolve_merged_contact()` recursive CTEs (depth cap 16) on
top of two `compliance_state()` walks (depth cap 64), on a function called once per CONTACTS row
and once per PARTY row.

### m9 — CARRIED and WIDENED AGAIN: `w3-data-report.md` is stale in at least fifteen places
**minor · high confidence · re-measured.** The report's mtime is 2026-09-13 22:20; the r18 fix
log's is 2026-09-15 06:51, so the report predates rounds 8 through 18 entirely, and the W7
preflight reads it. Measured drifts:

1. §1:45 "Eleven, not eight" refusals — the function raises **fourteen** distinct tokens
   (`merge_seat_on_studioless_project`, `merge_seat_card_other_studio`, `merge_seat_collision`
   are all absent from the report's list).
2. **§1 / §9 never mention `merge_seat_collision` at all** — r18's whole MAJOR, and the sixth
   refusal the function's own COMMENT and banner now name. NEW this round.
3. §1:41 "plus one line" on `people_directory` — the body diff returns **two** deltas.
4. §1/§9 omit `project_parties_touch_updated_at()` and `contact_rule_blocks_contact()`.
5. §0:23 / §8:333 "12 blocks as of r7" — the suite now ends at **13d** (33 distinct block ids).
6. §2:132 "33 papers" against a measured **36**.
7. §2:130 Lakeshore's absolute `lapses_soon` date 2026-10-06 — seed-relative by construction.
8. §8:337 "2752 replayed statements" against a measured **2766**.
9. §8:334 "301 insertions, 0 deletions" — `db:generate` now regenerates with **no diff**.
10. §4:201 / :212 describe the pre-r15 `add_household_member()` seat lookup.
11. §4/§8/§9 never mention `project_party_authority.source_household_id`, its index or its FK
    (grep of the report for the token: **0 hits**).
12. §9 describes `set_household_threshold()` as "the figure AND the grants it sources" with no
    word of R-BQ, which is the round-17 ruling the function now turns on.
13. §7.2 / §10.1 still argue about whether the TEAM tenant leg shipped; it did (`00629:3155`).
14. §10.4's portal-lane claims are six rounds old.
15. §1's refusal list is the only place a reader learns what the merge refuses, and it is the
    list the merge sheet's sentences were written from.

### m11 — CARRIED: 00628's backfill bumps `projects.updated_at` for every project it repairs
**minor · low confidence.** `update_projects_updated_at` is BEFORE UPDATE FOR EACH ROW on
`projects` and `00628:117-122` does not bracket it, where `00631:334-338` does bracket its own.
Nothing in this program ranks by `projects.updated_at`.

### m12 — CARRIED: a notice is SPENT even when nobody was told
**minor · high confidence (mechanism) · narrow population.** `00630:399-409` writes the notice row
and increments `v_notices` first; `:454-486` then writes one `notification_log` row per active
owner/admin and never checks that any landed. A studio whose only active members are plain
`member`s has the `(document_id, state, expires_on)` key permanently consumed while `v_notified`
stays 0.

### m13 — CARRIED: after a firm-to-firm fold an uncarded seat's Directory row names the folded card's spelling
**minor · high confidence.** `project_parties.company_name` is a free-text snapshot the merge
never writes; `00629:2411-2413` argues the case for the CROSS fold, and on a same-kind firm fold
the argument does not carry.

### m14 — CARRIED: 00630's `merged_into` leg describes merge behaviour that r3 replaced
**minor · high confidence · re-read at `00630:381-393`.** The comment says the merge "leaves an
absorbed document on the absorbed card wherever the survivor holds no successor to retire it …
correctly"; `00629:2343-2348` moves EVERY absorbed head unconditionally. The leg is pure defence
in depth; the comment states it as load-bearing.

### m15 — CARRIED: neither household door reads `archived_at`
**minor · medium confidence · re-measured (`prosrc LIKE '%archived_at%'` is false for both
`add_household_member` and `assert_client_household_members`).** A card
`useStudioContacts(…, { includeArchived: false })` hides can still be made a household member and
seated on a job — the shape `merge_survivor_archived` (r5 M-4) exists to refuse one table over.

### m16 — CARRIED: the report omits `source_household_id` — see m9 item 11.

---

## 4. What was checked and found sound (not findings)

* **All four r18 defects, re-verified at the source** (§1.2), including the SQL, the two hook
  files and the two report lines.
* **The merge is transactional and orphans nothing.** Blocks 1–13d pass; the household array,
  the designation pointers, the trade-agreement token and waiver pointers, the four seat card
  pointers, compliance lineage and the chain flattening all move inside one transaction.
* **`merged_into` is the RPC's alone** — `assert_merged_into_write()` (`00629:152-262`) refuses
  every other writer, owners and admins included, and states the survivor-exists /
  same-studio / legal-kind rules for service_role too. The FK's own `ON DELETE SET NULL` is the
  one exempted clear.
* **No company into a person** except crm-model §4's sole-proprietor exception, one direction,
  enforced in both the RPC (`merge_kind_mismatch`) and the column trigger
  (`studio_contact_merge_kind_mismatch`).
* **`merged_into` resolved by `people_directory`**: the CONTACTS branch carries
  `AND sc.merged_into IS NULL` (`00629:3256`), the TEAM branch carries the tenant leg
  (`00629:3155`), and `resolve_merged_contact()` maps the old id forward (PR-o).
* **Households RLS**: all four policies carry the tenant leg; owner/admin on DELETE and on any
  write carrying `co_threshold_cents`; `assert_household_threshold_principal()` reads the CHANGE,
  so an ERASE is refused too.
* **Consent is record-only (R-AY)**: no W3 migration reads or writes consent for a verdict; the
  one `sms_consent_status` token is an output key over `identity_consent_status()`.
* **Cross-tenant, every door**: 0 rows and five named refusals for an outsider, measured this
  round.
* **The sweep's recipients are owners and admins only** (`00630:481-484`), and the cron body is
  schema-qualified with a guarded unschedule (`00630:546-556`).
* **Court widening is purely additive** and `project_tasks.owner` is deliberately not widened.
* **00628's backfill** leaves zero and several both NULL; `project_consent_org()`'s twelve
  remaining callers are the consent ledger's key — the RULING, not a gap.
* **Types and legacy grants both regenerate with no diff; all three people suites pass; the
  numbering is above 00627 and clear of 00595–00620.**

---

## 5. Probes written this round

Beside this file under `artifacts/people-room-crm-2026-09-11/build/`, one transaction, ROLLBACKed,
on the freshly reset database:

* `probe-r19-a-closed-seat-two-figures.sql` — §2: the refusal, the repair its own HINT names,
  the measurement that "Close this seat" leaves the money grant open, the fold, and the two
  Client-side rows with two contradictory figures for one human on one job.
