# W3 (P2) — adversarial migration review, round 15

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `3bcdf0d70`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full this round: `00628`–`00633`; the bodies they re-issue or graft
(`assert_compliance_holder` 00623, `sync_person_affiliation_from_pointer` 00592,
`identity_paper_state` / `rolodex_card_for_party_phone` / `link_rolodex_card_to_parties` 00626,
`people_directory` 00626); every trigger on `studio_contacts`, `project_parties`,
`studio_contact_channels` and `projects`, and the bodies of the ones a W3 statement fires
(`normalize_studio_contact_channel`, `fc_dispatch_optin_invite`, `stamp_project_completed_at`,
`set_project_studio_id`); `supabase/tests/people/w3_merge_sweep_household_test.sql`;
`w3-data-report.md`; `w3-fix-log-r14.md`; `w3-review-r14-migrations.md`; `rulings.md`;
`direction.md` §3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7;
`w1a-report.md`, `w1b-report.md`, `w2a/b/c-report.md`, `w2-review-r15-qa.md`;
`briefing/fixture.md` §4. Also read, because the finding below lands on a face:
`apps/designer-portal/src/lib/document/roster-derivation.ts`,
`apps/designer-portal/src/components/document/roster/roster-row.tsx`,
`apps/designer-portal/src/components/document/roster/household-band.tsx`,
`apps/designer-portal/src/components/document/people/views/person-profile.tsx`.

**Verdict: NOT clean — zero blocking, ONE MAJOR, twenty-three minor.**

r14's BLOCKING-1 is **FIXED and re-measured**. The major is fresh: it is in `00632`'s own
RPC, on the one fact PR-c and PR-n put under the principal.

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **rc=0, clean replay**, head `00633` |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" |
| all 24 `supabase/tests/rls/*.sql` | **21 pass, 3 fail** — all three pre-existing and none W3's (n6 below) |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff** (2766 replayed statements) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| migration numbering | 00628–00633, all above 00627, none inside the reserved 00595–00620 |
| `cron.job` after the reset | `compliance-document-expiry-sweep · 0 6 * * * · active`, body `SELECT public.sweep_compliance_expiries();` — schema-qualified |
| the sweep, measured against the seeded book | `job_runs` id 10 `succeeded {"notices":3,"scanned":3,"notified":6}`; three notices (`lapsed 2025-12-31`, `lapsed 2026-03-31`, `lapses_soon 2026-10-08`); notifications to **owner and admin only**; a second invocation returns `{"notices":0,"scanned":3,"notified":0}` — idempotent (probe C) |
| function ACL / `proconfig` sweep over all 21 wave functions (`pg_proc`) | no `anon`, no `PUBLIC`; every DEFINER pins `search_path=public`; `sweep_compliance_expiries` service_role-only; every trigger function postgres/service_role only. One deviation, m3 |
| table ACL + RLS on the three new tables | `studio_contact_merges` / `studio_compliance_notices`: RLS on, `authenticated=r`, SELECT policy only. `client_households`: `authenticated=arwd`, four policies. No `anon` on any of the three |
| `people_directory` 00626 → 00629, code-only diff | **exactly TWO deltas**, as §6's banner claims: the TEAM branch's tenant leg and the CONTACTS branch's `AND sc.merged_into IS NULL`. Nothing else moved (`diff` of the two comment-stripped bodies, 303 → 308 lines) |
| every FK into `studio_contacts` (20, re-enumerated from `pg_constraint`) + the `client_households.member_person_ids` array | after a person fold the ONLY residual pointer at the folded card is `studio_contact_merges.merged_id` — the lineage row (probe B-b, a generic sweep over all 20 columns) |
| cross-tenant sweep (probe D) | a member of a foreign design studio reads **0** households, **0** merge rows, **0** notices, **0** bid seats; `merge_not_a_member`, `household_not_found` (×2), `permission denied for function sweep_compliance_expiries`, `studio_contact_not_found`; `resolve_merged_contact()` answers NULL |
| R-AY (record-only consent) | no W3 migration reads or writes `studio_channel_consent` or `project_parties.sms_consent_*` for a verdict. The only three matches in `00628`–`00633` are two comments and the view's OUTPUT key `'sms_consent_status', q.consent_word`, whose value is `identity_consent_status()` — the record |
| `project_consent_org()` callers on a fresh reset | **twelve** exactly (8 functions, 4 views, 0 policies), the enumeration `00628:56-80` gives. See m5 for the one it mis-describes |
| 00628 backfill outcome | 8 projects, 5 still `studio_id IS NULL`, all five ambiguous — R-BD holds, measured |
| 00633 | widened CHECK admits a strict superset; DROP IF EXISTS / ADD, re-runnable |
| `fc_dispatch_optin_invite` on 00632's seat INSERT | does not fire: its first leg is `NEW.sms_consent_status <> 'pending'` and a fresh seat carries the default. **No automated external send rides any W3 write** |
| `projects`' eight triggers vs 00628's bulk UPDATE | `ae_project_created_dispatch` is INSERT-only; `stamp_project_completed_at` only acts on a status change to `completed`; `guard_project_terminal_identity_integrity_trg` does not list `studio_id`. Only `update_projects_updated_at` fires (m11) |

### Every r14 finding re-checked

| r14 | State |
|---|---|
| **BLOCKING-1** — a fold destroyed `studio_contact_channels.sms_capable` | **FIXED.** `00629:1713` carries `sms_capable = s.sms_capable OR u.merged_sms_capable` in the reduction and `:1730` carries `mc.sms_capable AS merged_sms_capable` in the `u` subquery, beside `verified` and `preferred`. The banner at `:1651-1699` names SEVEN typed columns and states the face it cost. Block 10's three new mobile-row assertions pass. Column-by-column re-audit of BOTH tables the merge DELETEs from (below) finds no eighth |
| n1 · n2 · n3 · n4 · n5 · m1 · m2 · m3 · m4 · m5 · m6 · m7 · m8 · m9 · m11 · m12 · m13 · m14 · m15 | **ALL OPEN**, each re-measured or re-read this round and restated below with this round's evidence |
| m10 | the same finding as n4; carried as n4 |

#### The R-BN column audit, done exhaustively rather than by name

`merge_studio_contacts()` DELETEs from exactly two tables. Enumerated from
`information_schema.columns`:

* `studio_contact_channels`, 15 columns. Key/identity: `id`, `owner_type`, `owner_id`,
  `channel_kind`, `value`. Reduced: `status`, `status_at`, `verified`, `verified_at`,
  `preferred`, `sms_capable`, `label` — **all seven**. Left: `created_by`, `created_at`,
  `updated_at`, which are provenance and which r14 B-1 explicitly declined to open.
* `studio_person_affiliations`, 12 columns. Key: `id`, `person_id`, `company_id`. Reduced:
  `role_at_firm`, `is_paperwork_contact`, `is_signer`, `holds_trade_license`, `from_date` —
  **all five**. `to_date` is NULL on both sides by the DELETE's own predicate. Left:
  `created_by`, `created_at`, `updated_at`.

No third table is deleted from, so R-BN's "a merge never deletes a typed fact" now holds
column-for-column. (`studio_contact_rules` is never deleted; what stays behind on the folded
card is covered by n7.)

---

## 2. Blocking

**None this round.**

---

## 3. MAJOR-1 — `add_household_member()` reuses a CLOSED seat, and writes an OPEN money authority onto it

**Severity: major. Confidence: high (measured on a fresh reset, rolled back; the face traced
to source).**

`00632:364-370` finds the seat to use:

```sql
  SELECT pp.id INTO v_seat_id
    FROM public.project_parties pp
   WHERE pp.project_id = p_project_id
     AND pp.studio_contact_id = p_person_id
     AND pp.party_kind = p_role
   ORDER BY pp.created_at
   LIMIT 1;
```

There is no `off_job_at IS NULL` leg, and `ORDER BY created_at` deliberately takes the
**oldest** row. `off_job_at` is the room's own "Close this seat" act — 00624's COMMENT calls it
*"Replaces the hard delete (G-10, CS2-17). A seat that leaves the job keeps its row, its
lineage and its bid history"* — so a closed seat is exactly the row this lookup was built to
find. `00632:389-444` then writes the household's `money` grant onto whatever `v_seat_id`
holds, with `effective_to` left NULL.

### Measured

`artifacts/…/build/probe-r15-a-closed-seat-household.sql`, one transaction, ROLLBACKed, as the
studio's own owner (`a0000000-…-0004`), on Cedar Lane Study with the household carrying
`co_threshold_cents = 250000`:

```
A-a existing client_rep seats for this card on this job: 1 (all closed: 1)
A-b add_household_member returned seat aa000000-…-0000b1  (the closed one is aa000000-…-0000b1)
A-c seats for this card on this job now: 1
A-d MONEY GRANT ON A CLOSED SEAT: threshold=250000
    source=client_households.co_threshold_cents seat_off_job_at=2026-08-16 effective_to=<null>
```

No new seat was opened. The act the room calls "add the member to this job" reattached them to
a row the studio had closed thirty days earlier, and gave that row unrevoked authority to sign
change orders to $2,500.

### The face

`callSheetProjection()` (`roster-derivation.ts:775-785`) bands `client` / `client_rep` seats
into `clientSide` **before** `bandFor()` is consulted:

```ts
    if (CLIENT_BAND_KINDS.includes(seat.party_kind ?? '')) {
      bands.clientSide.push(row);
      continue;
    }
```

and `rosterWindowClause()` (`roster-row.tsx:107-116`) prints `Off the job <date>` **only** when
`band === 'done'`. So the Call Sheet's Client side prints the closed seat as a live row —
direction §3.4's *"Chidi Okonkwo · signs money over $2,500"* — with no off-job clause anywhere
on that band, over a seat whose record says the person left the job. That is the harm
`00632:486-496`'s own banner names for the threshold drift ("two simultaneously-rendered,
directly contradictory facts about the same household on one screen, with no act between
them"), landing again on the same column. `person-profile.tsx:556-558` is the one surface that
does print `Closed 16 Aug 2026` for that seat — beside the grant.

### Reachable through the room

`household-band.tsx:285` calls `useAddHouseholdMember()`
(`packages/supabase/src/hooks/use-households.ts:517-525` → `rpc("add_household_member")`) with
the job named. The sequence is ordinary: seat the rep, later press "Close this seat" (the act
`roster-row.tsx:18` documents), then add that member to the household with the job named —
which is precisely what a studio does when the household is recorded after the fact. The band's
own `standingGrantForChoice` (`household-band.tsx:299-305`) keys on *"the pair
`add_household_member()` reuses a seat by — the card and the role"*, so the band already knows
this lookup ignores everything except those two columns; it does not know it ignores closure.

### Both halves of the feature have it

`set_household_threshold()`'s loop (`00632:560-570`) selects
`party_kind = 'client_rep' AND studio_contact_id = ANY(member_person_ids) AND source_clause =
'client_households.co_threshold_cents' AND effective_to IS NULL` with no `off_job_at` leg
either, so raising or clearing the figure also moves the grant standing on a closed seat. The
two halves agree with each other and disagree with the record.

### Where a fix belongs (not prescriptive)

The seat lookup is the natural home — `AND pp.off_job_at IS NULL`, so a closed seat is left
closed and a new one is opened, which is what the RPC's own COMMENT already promises ("opens
(or finds) that member's seat on the job"). Whether `set_household_threshold()` should also
skip a closed seat's grant, or close it, is a second question this finding does not settle:
R-BN's posture one table over is that a record of what stood is kept, and 00624's own shape for
ending a delegation is `effective_to`, not a deletion. The pin is a block in
`w3_merge_sweep_household_test.sql` beside the existing household assertions, staging a closed
`client_rep` seat.

---

## 4. Minor

### n6 — NEW: three of the branch's own RLS suites fail, and nothing on the branch records it
**minor · high confidence · measured · not W3's defect.** `supabase/tests/rls/` holds 24 files;
21 pass on the fresh reset and three do not:

```
design_requests_test.sql   ERROR: FAIL 3b: expected no_scans, got <none>
field_parties_test.sql     ERROR: refuse_legacy_consent_write — "project_parties.sms_consent_*
                                  is legacy since 00594…"   (UPDATE project_parties SET
                                  sms_consent_status = 'pending' …)
studio_titles_test.sql     ERROR: FAIL f: demoting the sole active owner should raise
                                  last_owner_protected
```

None is W3's: `submit_design_request` is 00314/00567, `last_owner_protected` is 00319/00484,
and `field_parties_test.sql`'s failure is **R-AX/R-AY working as ruled** — W1's freeze trigger
refusing a direct write to a frozen consent column, which is exactly what the ruling says must
happen. The finding is that the branch carries three red suites nobody has written down.
`w3-data-report.md` §7 makes a point of repairing two pre-existing W1b failures W2 introduced;
these three are the same class and are unrecorded in any report or fix log. `field_parties`'s is
stale-test debt owed by W1; the other two predate this program.

### n7 — NEW: a merge silently leaves the folded card's `reason`, `contact_hours` and `escalation_by_class` behind, and the file's own note names only two of the three
**minor · high confidence · no reader today.** `00629:2124-2125`: *"What is left behind is the reason text and the
contact hours, which forbid nothing."* `studio_contact_rules` carries
thirteen columns; the three the conditional repoint can strand are `reason`, `contact_hours`
and **`escalation_by_class`** (jsonb, 00592:730). The last is not named. It has no face today —
grepped: `reach-access.tsx:992` round-trips it on save and
`use-studio-contacts.ts:1191-1192` preserves it, and nothing renders it — so no wrong fact
reaches a screen; it is the sentence that is incomplete, on the one paragraph a future reader
will use to decide whether the conditional repoint is still safe.

### n8 — NEW: the seat guard covers two of the seat's four card pointers
**minor · high confidence · measured.** `assert_party_card_not_merged_trg` is
`BEFORE INSERT OR UPDATE OF studio_contact_id, company_id` (`00629:460-465`).
`warranty_contact_person_id` is not in the list and `assert_project_party_cards()` tests only
the card's org, so a later write may stamp a seat with a card that was merged away. Measured
(probe B, after a person fold):

```
B-d later write of the DEAD id into warranty_contact_person_id: ACCEPTED
B-e later write of the DEAD id into bid_quoted_by_person_id:    party_bid_quoted_by_merged_away
B-f later write of the DEAD id into studio_contact_id (control): party_card_merged_away
```

The merge itself repoints the column (B-c measured), and nothing on any face reads it — grepped
across `apps/designer-portal/src` and `packages/supabase/src`, the only hit is a type field at
`use-people.ts:167`, plus the `people_directory_seats` column — so this is the cached-picker
hole §4's banner describes, on the one pointer where it costs nothing today.

### n9 — NEW: the studio-less / other-studio pre-checks enumerate three of the four card pointers the seat block writes
**minor · high confidence (the gap) · low confidence (reachable today).** `00629:1534-1553` and
`:1590-1670` pre-refuse by name over `studio_contact_id`, `company_id` and
`warranty_contact_person_id`. The seat block also writes `bid_quoted_by_person_id`
(`00629:2446-2450`), whose own guard `assert_party_bid_quoted_by()` raises
`party_bid_quoted_by_project_has_no_studio` and `party_bid_quoted_by_other_studio`
(`00631:163-199`) — two more raw schema tokens that would reach the merge sheet's
`role="alert"` paragraph the way r11 MAJOR-2 and r13 MAJOR-1 did. The population is empty
today: `bid_quoted_by_person_id` is minted by 00631 and its guard has refused both shapes since
the column existed, so no legacy row can carry one. Recorded because the pre-check's own
argument is "every shape the guard would abort the transaction over, refused by name first",
and one of the four is outside it.

### n1 — 00628's NOTICE reports the designer-domain-role delta over EVERY stamped project, not the ones it stamped
**minor · high confidence · carried from r14, re-read.** `00628:178-182` counts
`WHERE p.studio_id IS NOT NULL AND NOT has_designer_domain_role(p.designer_id)` — every project
that has a studio, ever — and `:184` prints it as *"% **stamped** project(s) have a designer
with no designer domain role"*. The statement above it stamps only
`WHERE studio_id IS NULL AND n_orgs = 1`. The number exists to quantify the delta between this
file's predicate and `set_project_studio_id()`'s, and R-BD / report §10 item 5 owe it to the W7
preflight. Locally both readings are 0, so no gate sees it; on Strata it reports the whole book.

### n2 — `contact_rule_blocks_contact()` has no caller anywhere, and its COMMENT states a rule the file stopped making at r5
**minor · high confidence · re-measured.** `00629:909-921` mints it and `:925-926` grants it to
`authenticated`. Re-grepped this round across `supabase/`, `apps/` and `packages/`: the only hit
outside 00629's own text and the regenerated grants file is the generated
`database.types.ts:33348`. `00629:1425-1479` records why — r5 M-2 replaced R-BL's hard-block
test with subsumption — but the function's COMMENT (`00629:928-934`) still reads
*"merge_studio_contacts() refuses on it so a recorded block cannot vanish into an absorbed
card"*, and §4d's banner (`:907`) says *"stated here because the merge now refuses on it"*.
Neither is true of the shipped body.

### n3 — `00631:334` pins its `updated_at` obligation to a test block that does not exist
**minor · high confidence · re-measured.** *"the pin lives in the SQL suite (w3 **block 12**,
w1b block 21's shape)"*. The suite's own NOTICE labels run `…7d, 10, 11, 11b … 11m`; there is
no block 12. The actual pin is block 7d.

### n4 — `add_household_member()` raises the NEIGHBOURING file's raw tokens on both of its studio doors
**minor · high confidence · carried, re-read.** `00632:372-380` inserts the seat before any
studio is resolved, so `assert_project_party_cards()` (00624) answers for it:
`party_studio_contact_other_studio` on a cross-studio job and
`party_card_project_has_no_studio` on a studio-less one — while `household_grant_forbidden` and
`household_grant_project_has_no_studio` are defined two statements later for one of the same
conditions. No cross-tenant write occurs (measured again this round, probe D), and
`writeErrorMessage()` happens to carry sentences for both tokens, so nothing raw reaches the
face today; a second reader of this RPC inherits none of that.

### n5 — the notice's subject builds a possessive by concatenation
**minor · high confidence · measured on a face.** `00630:412-415`. Probe C, reading the rows the
sweep actually wrote to `notification_log`:

```
C-c notification subject: Ostrom Builders's paper has lapsed | The certificate of insurance
    for Ostrom Builders lapsed 31 Dec 2025.
```

A notification is a face — the argument `00630:416-425` already makes for `v_paper`.

### m1 — the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · carried since r10, re-read.** `00630:376-394` carries
`sc.merged_into IS NULL` and no `archived_at` leg, so a lapsed COI on an archived firm card
still writes a notice and an in-app notification to every owner and admin, deep-linking
`/people?firm=<id>` to a card `useStudioContacts(…, { includeArchived: false })` does not
return. 0 archived holders in the seeded book, so no gate sees it.

### m2 — deleting a household, or dropping a member from the array, still orphans the money grants it sourced
**minor · high confidence · carried, structural.** `00632:259-266` (the owner/admin DELETE
policy) and any direct `PATCH member_person_ids` leave open `project_party_authority` rows
carrying `source_clause = 'client_households.co_threshold_cents'` standing with no household
behind them. `set_household_threshold()` (`00632:560-596`) is the only closer and it keys on the
household's own member array, which the delete has already emptied.

### m3 — `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · re-measured.** `00629:368-385`; `pg_proc.proconfig` is NULL for it
and `{search_path=public}` for the other twenty (this round's ACL sweep). SECURITY INVOKER and
fully schema-qualified, so the exposure is narrow — but it is granted to `authenticated`, called
twice per emitted Directory row from inside `identity_paper_state()`, and the wave's own stated
rule is that every function pins.

### m4 — `w3-data-report.md:132` still says "33 papers in total" where the database says 36
**minor · high confidence · re-measured.** `compliance_document_state()` over every row:
`current` 9, `held` 24, `lapsed` 2, `lapses_soon` 1 = **36**, and
`count(*) FROM studio_compliance_documents` = 36. The four state counts in the same sentence are
right; the total is not.

### m5 — the `project_consent_org()` enumeration still describes one call site inaccurately
**minor · medium confidence · re-measured.** `00628:56-80` and report §6 say all twelve remaining
callers are "the CONSENT LEDGER'S KEY — not a guard and not a reducer". `00629:2937-2942` is
`CASE WHEN public.is_active_studio_member(public.project_consent_org(q0.project_id)) THEN
COALESCE(identity_consent_status(…), 'not_asked') END` — a membership GUARD on whether the
affirmative word renders. Re-reasoned this round: it can only narrow (the row's own visibility
leg already resolves through `project_tenant_org()`, and `identity_consent_status()` is itself
membership-gated), so the behaviour is right and deliberate; the sentence enumerating it is not.

### m6 — two small internal inconsistencies in 00629
**minor · high confidence · re-read.** `v_merge_id` is declared (`:1282`), assigned by the final
`RETURNING` (`:2531`) and never read. And `studio_contact_merges`' COMMENT (`:306-314`) says "a
merge that happened is a fact nobody may forge or take back" beside
`GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role` (`:354`) — true of `authenticated`, not
of every writer.

### m7 — `people_directory`'s own COMMENT was not re-issued, so the database's record of the view still describes v4
**minor · high confidence · re-measured.** `CREATE OR REPLACE VIEW` keeps the existing comment;
`obj_description('public.people_directory'::regclass) ~ 'merged_into'` answers **false**, and the
comment still opens `R57 / People Room roster (client|lead|maker|…)`. Neither of §6's two
declared deltas reaches the object's own record.

### m8 — `identity_paper_state()` runs four recursive walks per emitted Directory row
**minor · medium confidence · carried.** `00629:1156-1161`: two `resolve_merged_contact()`
recursive CTEs (depth cap 16) on top of the two `compliance_state()` walks (depth cap 64) it
already made, on a function called once per CONTACTS row and once per PARTY row.
`identity_seats` was materialised in W1b r11 for exactly this class of cost on the same view;
the merged-card resolution is a no-op for every unmerged card, which is all of them today.

### m9 — `w3-data-report.md` is stale in eight places, and the report is what the W7 preflight reads
**minor · high confidence · re-measured this round.**

* `:45` "Refusals, in order: … **Eleven**, not eight" — `pg_proc.prosrc` yields **thirteen**
  distinct `merge_*` tokens (adding `merge_seat_on_studioless_project` and
  `merge_seat_card_other_studio`).
* the same line's citations are ~300 lines out: `merge_survivor_archived` is at `00629:1370`
  not `:983`, `merge_two_logins` at `:1398` not `:1011`, `merge_contact_rule_conflict` at
  `:1479` not `:1092`.
* `:41` says `people_directory` is 00626 "plus **one line**"; `:320` and §6's banner say **two
  deltas**, and this round's code-only diff measures two. The report contradicts itself about a
  cross-tenant narrowing.
* §1's Objects table and §9's function list omit `project_parties_touch_updated_at()` and
  `contact_rule_blocks_contact()` entirely.
* `:23` / `:333` say the suite is "12 blocks as of r7"; the suite's own NOTICE labels end at
  11m and there is no block 12 (see n3).
* `:132` "33 papers" against a measured 36 (m4).
* §8 says `generate-legacy-grants.py` wrote "2752 replayed statements"; it writes **2766**.
* §2's seeded-book table gives Lakeshore's `lapses_soon` date as 2026-10-06; measured today it
  is **2026-10-08**. The seed shifts every fixture window by `CURRENT_DATE - 2026-10-20`
  (§7.1's own finding), so an absolute date in the report is stale the day after it is written —
  the same defect §7.1 repaired in the test, left standing in the prose.

### m11 — 00628's backfill bumps `projects.updated_at` for every project it repairs
**minor · low confidence · carried.** `update_projects_updated_at` is BEFORE UPDATE FOR EACH ROW
on `projects` (re-enumerated this round) and `00628:117-122` does not bracket it. Unlike
`project_parties.updated_at`, nothing in this program ranks by `projects.updated_at`; recorded
because 00624's stated obligation is about bulk column rewrites generally and this is one.

### m12 — a notice is SPENT even when nobody was told
**minor · high confidence (mechanism) · narrow population · carried.** `00630:399-409` writes the
`studio_compliance_notices` row and increments `v_notices` first; `:454-486` then writes one
`notification_log` row per **active owner or admin** and never checks that any landed. A studio
whose only active members are plain `member`s has the `(document_id, state, expires_on)` key
permanently consumed while `v_notified` stays 0, and nothing but a date change clears it — so it
is never told about that paper at that date again, even after an owner is added. The symmetric
rule the file states one statement earlier ("the two records can never disagree") does not hold
in this direction.

### m13 — after a firm-to-firm fold an uncarded seat's Directory row names the folded card's spelling
**minor · high confidence · carried (measured r13).** The seat's free-text
`project_parties.company_name` snapshot is deliberately never written by the merge
(`00629:2411-2413` argues the case for the CROSS fold, where keeping the folded firm's name is
right). On a same-kind firm fold the argument does not carry: the row prints a firm name off a
card the Directory emits no row for, beside a `company_id` that says otherwise. Minor because
the two names are the same firm.

### m14 — 00630's `merged_into` leg describes merge behaviour that r3 replaced
**minor · high confidence · carried, re-read.** `00630:381-392` says "merge_studio_contacts()
leaves an absorbed document on the absorbed card wherever the survivor holds no successor to
retire it (00629 §5, crm-model §4) — correctly". §5 has not done that since r3 W3-R3-1:
`00629:2269-2273` moves EVERY absorbed head unconditionally and `:2280-2291` walks the lineage
behind it, so no document remains on a merged card at all (chains deeper than 16 renewals
excepted). The leg is pure defence in depth; the comment states it as load-bearing and cites a
rule that was reversed.

### m15 — `add_household_member()` does not read `archived_at`
**minor · medium confidence · carried, re-read.** `00632:340-348` refuses a card that is missing,
in another studio, not a person, or merged away — but not one the studio has PUT AWAY.
`assert_client_household_members()` (`:123-136`) makes the same four tests and the same omission.
So a card `useStudioContacts(…, { includeArchived: false })` hides can still be made a household
member and seated on a job through the RPC, which is the shape `merge_survivor_archived` (r5 M-4)
exists to refuse one table over. It is the same class as MAJOR-1 — the RPC reads the card's and
the seat's identity and not their standing.

---

## 5. What was checked and found sound (not findings)

* **r14 BLOCKING-1, fixed and re-measured**, plus the exhaustive column audit above that shows
  there is no eighth column of the same kind.
* **Merge is transactional and orphans nothing.** Probe B's generic sweep executes
  `SELECT count(*) FROM <tbl> WHERE <col> = <folded card>` over all 20 FK columns
  `pg_constraint` reports into `studio_contacts`, after a real fold: the only non-zero is
  `studio_contact_merges.merged_id = 1`, which is PR-o's own lineage row.
* **The seat's fourth card pointer travels.** `B-c seat after fold: warranty=<survivor>
  bid_quoted_by=<survivor>`.
* **`people_directory` is 00626 plus exactly two legs**, measured by diffing the two
  comment-stripped bodies rather than by reading the banner.
* **No automated external send.** `fc_dispatch_optin_invite()`'s first leg is
  `NEW.sms_consent_status <> 'pending'`, and no W3 statement writes a consent column, so the
  household seat INSERT and every seat repoint return before `invoke_edge_function`.
* **The sweep, end to end on the seeded book**: `{"notices":3,"scanned":3,"notified":6}`,
  three notice rows, notifications to the owner and the admin and to no plain member, a second
  invocation writing nothing, and `job_runs` carrying the run.
* **Cross-tenant, all six doors** (probe D): reads 0/0/0/0 and four refusals plus one
  `permission denied`, with `resolve_merged_contact()` answering NULL across the boundary.
* **Households RLS and PR-n.** Four policies read live from `pg_policy`, all carrying the tenant
  leg beside `is_studio_comember()` (the declared narrowing of direction §7's line), owner/admin
  on DELETE and on any write carrying `co_threshold_cents`, plus
  `assert_household_threshold_principal()` reading the CHANGE so an ERASE is refused too.
* **Money is integer cents everywhere it meets.** `project_parties.bid_amount_cents`,
  `trade_scope_bids.amount_cents`, `project_party_authority.threshold_cents` and
  `client_households.co_threshold_cents` are all `integer`, so the 00631 backfill and both
  household RPCs carry no widening or narrowing cast.
* **`project_party_authority.copy_to` needs no merge repoint**: its own COMMENT and
  `assert_party_authority_copy_to()` hold it to *engagement* ids, not card ids. Likewise
  `project_site_access_cards.key_holder_engagement_id`, whose only FKs are to `project_parties`
  and `profiles`.
* **Court widening.** Purely additive; `project_tasks.owner` deliberately not widened, with the
  reason stated; DROP IF EXISTS / ADD so a rerun really does widen.
* **R-BD backfill.** `WHERE studio_id IS NULL` is the idempotency; `n_orgs = 1` is the only
  stamp; all five local studio-less projects have an ambiguous designer and stay NULL.
* **Idempotency of every file.** 00630's `ADD COLUMN IF NOT EXISTS expires_on` → UPDATE →
  `SET NOT NULL` is safe on both shapes (document_id is NOT NULL and FK'd, so the COALESCE
  cannot leave a NULL); 00631 brackets its one bulk statement with DISABLE/ENABLE TRIGGER;
  every table is `CREATE TABLE IF NOT EXISTS` and every constraint DROP-then-ADD.
* **The channel dedupe cannot be defeated by formatting.** `normalize_studio_contact_channel()`
  is BEFORE INSERT OR UPDATE and rewrites `value` through `normalize_channel_value()`, so every
  stored value is already normalised and the DELETE's raw `(channel_kind, value)` match is the
  normalised match.

---

## 6. Probes written this round

Committed beside this file under `artifacts/people-room-crm-2026-09-11/build/`, all one
transaction and ROLLBACKed, all on a freshly reset database:

* `probe-r15-a-closed-seat-household.sql` — MAJOR-1, with the seat id and the grant printed.
* `probe-r15-b-merge-sweep.sql` — a person fold, the generic 20-column residual sweep, the bid
  and warranty repoints, and the three later-write controls.
* `probe-r15-c-sweep.sql` — the sweep against the seeded book, its notices, the exact
  notification sentences, the recipient roles and the idempotent second run.
* `probe-r15-d-tenant.sql` — the cross-tenant sweep over W3's three new tables and five RPCs.
