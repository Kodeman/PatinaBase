# W3 (P2) — adversarial migration review, round 16

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `aa615473e`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full this round: `00628`–`00633`; the bodies they graft or stand in front of
(`assert_compliance_holder`, `sync_person_affiliation_from_pointer`, `identity_paper_state`,
`rolodex_card_for_party_phone`, `link_rolodex_card_to_parties`, `people_directory`);
`set_project_studio_id` (00317, to test 00628's own claim about it), `fc_dispatch_optin_invite`,
`assert_channel_owner_kind`; every trigger on `project_parties`, `studio_contacts` and
`studio_contact_channels`, read live from `pg_trigger`;
`supabase/tests/people/w3_merge_sweep_household_test.sql`; `w3-data-report.md`;
`w3-fix-log-r15.md`; `w3-review-r15-migrations.md`; `rulings.md`; `direction.md`
§3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a-report.md`,
`w1b-report.md`, `w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md` §4. Also read,
because this round's major lands on a face: `packages/supabase/src/hooks/use-households.ts` and
`apps/designer-portal/src/components/document/roster/household-band.tsx`.

**Verdict: NOT clean — zero blocking, ONE MAJOR, twenty-five minor.**

r15's MAJOR-1 is **FIXED and re-measured** (block 12 green, and the closed seat is no longer
reused). The major this round is fresh and sits in the same RPC pair, on the same column: the
household's money figure. It is not the r15 defect by another name — it needs no closed seat,
and it is reachable through the room's own duplicate fold, which is the act this entire wave
exists to perform.

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **rc=0, clean replay**, "Finished supabase db reset on branch main." |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (block 12 last) |
| all 24 `supabase/tests/rls/*.sql` | **21 pass, 3 fail** — the same three, all pre-existing, none W3's (n6) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff** (2766 replayed statements) |
| migration numbering | 00628–00633; all above 00627, none inside the reserved 00595–00620; nothing minted this round |
| `cron.job` after the reset | `compliance-document-expiry-sweep · 0 6 * * * · active=true`, body `SELECT public.sweep_compliance_expiries();` — schema-qualified (probe H-f) |
| the sweep against the seeded book | run 1 `{"notices":3,"scanned":3,"notified":6}`; run 2 `{"notices":0,"scanned":3,"notified":0}` — idempotent; notices `lapsed 2025-12-31`, `lapsed 2026-03-31`, `lapses_soon 2026-10-08`; recipients the owner and the admin and nobody else; two `job_runs` rows, both `succeeded` (probe H) |
| function ACL / `proconfig` sweep over all 21 wave functions | **no `anon`, no `PUBLIC`** anywhere; every SECURITY DEFINER pins `search_path=public`; `sweep_compliance_expiries` service_role only; every trigger function postgres/service_role only. One deviation, m3 |
| table ACL + RLS on the three new tables | `studio_contact_merges` / `studio_compliance_notices`: RLS on, `authenticated=r`, SELECT policy only. `client_households`: RLS on, `authenticated=arwd`, four policies. No `anon` on any of the three |
| R-AY (record-only consent) | no W3 migration reads or writes `studio_channel_consent` or `project_parties.sms_consent_*` for a verdict; the only matches in `00628`–`00633` are comments and the view's OUTPUT key `'sms_consent_status', q.consent_word`, whose value is `identity_consent_status()` — the record |
| `project_consent_org()` callers on a fresh reset | **twelve** exactly (8 functions, 4 views, **0 policies**), matching `00628:56-80`'s enumeration. See m5 for the one line it mis-describes |
| 00628 backfill outcome | 8 projects, 3 stamped, **5 still `studio_id IS NULL`**, all five ambiguous — R-BD holds (probe H-g) |
| 00633 | `client_decisions_court_check` reads eleven words, a strict superset; every live row stays valid (probe H-h) |
| **no automated external send** | `fc_optin_invite_dispatch` is AFTER INSERT OR UPDATE on the WHOLE row, so every seat repoint in the merge fires it. Body read: on UPDATE it returns before `invoke_edge_function` unless the four consent columns MOVE into the dispatchable shape, and no W3 statement writes any of them — so OLD satisfies whatever NEW satisfies and the fourth `IF` returns. Confirmed for the merge's seat block as well as 00632's fresh seat INSERT |

### Every r15 finding re-checked

| r15 | State |
|---|---|
| **MAJOR-1** — `add_household_member()` reused a CLOSED seat and wrote live money authority onto it | **FIXED.** `00632:390` carries `AND pp.off_job_at IS NULL`; `00632:611-635` ends a closed seat's grant with `effective_to = GREATEST(effective_from, off_job_at)` rather than moving the figure. Block 12 passes; probe C re-measures the open half (r16-minor-1) |
| n1 · n2 · n3 · n4 · n5 · n6 · n7 · n8 · n9 · m1 · m2 · m3 · m4 · m5 · m6 · m7 · m8 · m9 · m11 · m12 · m13 · m14 · m15 | **ALL OPEN** — the r15 fix log names them as out of that round's brief. Each re-measured or re-read this round and restated in §4 with this round's evidence; n3 is restated because r15 changed what it points at |

---

## 2. Blocking

**None this round.**

Measured rather than assumed, on a fresh reset, all rolled back:

* **A merge orphans nothing.** Probe D sweeps `SELECT count(*) FROM <tbl> WHERE <col> = <folded card>`
  over every FK column `pg_constraint` reports into `studio_contacts`, after a real person fold:
  the only non-zero is `studio_contact_merges.merged_id=1`, PR-o's own lineage row.
  `D-c directory rows for the folded id: 0 ; for the survivor: 1`.
  `D-d resolve_merged_contact(folded) = <survivor>`.
  `D-e the absorbed unsubscribe survived on the survivor: unsubscribed / verified=true /
  preferred=true / sms_capable=true` — r14 B-1's column stays carried.
* **No company into a person** except crm-model §4's one exception: a firm into a
  non-sole-proprietor person raises `merge_kind_mismatch`, and a person into a firm always does
  (probe G, both directions; the one case that succeeded was Pete Rusk, who the seed marks
  `is_sole_proprietor = t`).
* **The pointer is the RPC's alone.** An owner's hand `UPDATE studio_contacts SET merged_into`
  raises `studio_contact_merge_pointer_forbidden`; a member's `INSERT INTO studio_contact_merges`
  answers `permission denied for table`; `authenticated` calling the sweep answers
  `permission denied for function sweep_compliance_expiries` (probe G).
* **Archive gating.** A plain `member` is refused `studio_contact_archive_forbidden`; an admin
  succeeds; a caller in another studio reads `studio_contact_not_found` and 0 households, 0 merge
  rows, 0 notices (probe F/G).
* **Households RLS.** Four policies carry the tenant leg beside `is_studio_comember()`, owner/admin
  on DELETE and on any write carrying `co_threshold_cents`, plus
  `assert_household_threshold_principal()` reading the CHANGE so an ERASE is refused too.
* **Idempotency of every file**, the cron guard, the advisory lock and the `job_runs` row, the
  30-day window's two homes, money as integer cents in all four columns that meet — all as r15
  recorded, re-read against the files this round.

---

## 3. MAJOR-1 — one person card may belong to TWO households, and either household's figure then rewrites the other's money grants

**Severity: major. Confidence: high (mechanism measured twice on a fresh reset, rolled back;
reachability measured through the merge the room itself offers).**

### The gap

`client_households.member_person_ids` has no exclusivity rule of any kind:
`assert_client_household_members()` (`00632:117-155`) holds each id to a live, unmerged PERSON
card in the household's own studio and checks nothing about other households, and no index or
CHECK does either. `add_household_member()` (`00632:311`) makes the same four tests and adds none.

The money grant it writes carries **no household id**: `source_clause` is the literal string
`'client_households.co_threshold_cents'` (`00632:460`), and both halves of the feature key on that
string alone —

```sql
-- 00632:585-595, set_household_threshold()
 WHERE pp.party_kind        = 'client_rep'
   AND pp.studio_contact_id = ANY (v_h.member_person_ids)
   AND pa.source_clause     = 'client_households.co_threshold_cents'
```

— so "the household's own grant" cannot be told from "some other household's own grant". The rule
r9 M-1 wrote to protect a grant the studio re-sourced by hand (`00632:461`,
`ELSIF v_grant.source_clause = 'client_households.co_threshold_cents'`) reads a SECOND household's
grant as its own.

### Measured — one job

`artifacts/…/build/probe-r16-a-two-households.sql`, one transaction, ROLLBACKed, as the seeded
studio's owner:

```
A-a H1 seat = 3f33c9fd-…                      (H1 figure 250000)
A-b after H1: threshold=250000 clause=client_households.co_threshold_cents
A-c H2 seat = 3f33c9fd-…                      (the SAME seat; H2 figure 900000)
A-d after H2 add: threshold=900000            <- H1's grant, rewritten by the add
f
A-e H1 figure=250000 H2 figure=1500000 SEAT grant=1500000
A-f households naming this card: 2
```

Nothing refused the second membership; `add_household_member()` rewrote the standing grant;
`set_household_threshold()` on H2 then moved it again. H1's own record still says $2,500.

### Measured — across two jobs, which is the harm

`probe-r16-b-two-jobs-one-member.sql`. Two households on two different jobs, one shared member,
each seated on its own job, each grant written by its own household:

```
B-c grants after the add:   Lindqvist kitchen=1000000 | Okonkwo residence=250000
B-d grants after moving the LINDQVIST figure only:
                            Lindqvist kitchen=2500000 | Okonkwo residence=2500000
B-e Okonkwo household still says 250000
```

Raising the **Lindqvist** household's figure raised the change-order authority on the **Okonkwo
residence** seat from $2,500 to $25,000. The Okonkwo household band prints "Change orders over
$2,500 need a signature from the household." while that job's client-side roster row prints
"Signs money to $25,000." — the exact harm `00632:516-521`'s own banner names ("two
simultaneously-rendered, directly contradictory facts about the same household on one screen, with
no act between them"), and the over-authorisation 00624's COMMENT names ("a wrong grant silently
over- or under-authorises an approval"), landing on the one fact PR-c and PR-n put under the
principal. PR-n's principal for the Lindqvist household moved money authority on a job that
household has nothing to do with.

### Reachable through the room, two ways

1. **The duplicate fold itself.** `probe-r16-e-fold-makes-two-households.sql`: household ONE names
   Adaeze's card, household TWO names a duplicate card of Adaeze, and the studio folds the
   duplicate — direction §3.1's whole act. `00629:2498-2508` repoints the member array:

   ```
   E-a merge -> d0e10000-…-0004
   E-b households naming the survivor after the fold: 2 (H one=250000, H two=900000)
   ```

   The merge is the only writer that can create this state without anybody meaning to, and it
   creates it silently.
2. **The band's own picker.** `household-band.tsx:263-275` builds `candidates` from every person
   card in the studio rolodex with a name, sorted so the already-seated come first, and filters
   nothing about existing membership; `useAddHouseholdMember()` then calls the RPC. One press.

The band cannot even say which household it is showing: `useProjectHousehold`'s last resort is
`.overlaps("member_person_ids", memberCardIds).limit(1)` with **no ORDER BY**
(`use-households.ts:389-393`), so for a card in two households the row the face reads is whichever
Postgres returns first.

### Why this is filed major and not blocking

It puts a wrong money figure on a face, which the brief lists under blocking — but it is the same
class and the same column r15 filed as MAJOR (live authority on a closed seat), it needs a second
household, and the record itself is never destroyed. Calibrated to this program's own precedent.
If Fable reads "wrong fact on a face" strictly, promote it.

### Where a fix belongs (not prescriptive)

Three shapes, none of them settled by this finding:

* **Stamp the household on the grant** — `source_clause = 'client_households.co_threshold_cents:'
  || household_id`, or a real column — so "the household's own grant" is a fact and not a string
  match. This is the only one that also fixes the `.limit(1)` ambiguity's money half.
* **Refuse the second membership** — a partial exclusion in `assert_client_household_members()`
  and in `add_household_member()`, plus a rule for what the merge does when a fold would create
  one (it cannot refuse: the fold is the studio's act and the household is downstream of it).
* **Scope the loop to the seats this household sourced** by remembering them.

The pin belongs in `w3_merge_sweep_household_test.sql` beside block 12, staging two households and
one card, with the cross-job assertion of B-d as the negative control.

---

## 4. Minor

### r16-n1 — NEW: `add_household_member()` leaves the CLOSED seat's grant open, so one card holds two open money grants on one job
**minor · high confidence · measured.** r15 fixed half the rule. `00632:39-45`'s banner states
both halves: *"NEITHER RPC TOUCHES A SEAT THE STUDIO CLOSED. add_household_member() skips an
off_job_at seat and opens a new one; set_household_threshold() ends a closed seat's grant with
effective_to."* The add path skips but never ends, so until the figure is next touched both rows
stand open. `probe-r16-c-closed-seat-grant.sql`:

```
C-a first add  -> aa000000-…-0000c1        (grant 250000 written here)
     <the studio closes that seat, off_job_at = CURRENT_DATE - 30>
C-b second add -> 3f492c17-…               (a new seat, correctly)
C-c open money grants for this card on this job: 2 —
      seat off_job_at=<null>      threshold=250000
    | seat off_job_at=2026-08-16  threshold=250000
```

Minor rather than major because r15's third fix makes `roster-row.tsx` print the row's own off-job
clause wherever it is banded, so the face no longer prints live authority with no closing date
beside it; and because the fix log names the general rule (a trigger ending every authority row
with its seat) as a ruling owed to Fable. What is recorded here is that the RPC's own banner
claims a rule the RPC makes on only one of its two doors.

### r16-n2 — NEW: `w3-data-report.md` §4 describes the pre-r15 `add_household_member()`
**minor · high confidence · re-read.** `:212` still says *"an existing `(project_id,
studio_contact_id, party_kind)` seat is reused"* — the OPEN leg r15 added is the whole of that
finding's fix and is absent; and `:201`'s `set_household_threshold()` row names the move and the
clear but not the closed-seat ending. The report is what the W7 preflight reads. Folds into m9.

### n3 — RESTATED: `00631:334` cites a block that now EXISTS and is about something else
**minor · high confidence · re-measured.** The comment reads *"the pin lives in the SQL suite (w3
**block 12**, w1b block 21's shape)"*. When r15 filed n3 there was no block 12; r15 then added one
— **`12. r15 MAJOR-1 — a closed seat is left closed…`** — so the citation now resolves to a real
block about the household RPC rather than failing loudly. 00631's `updated_at` pin is **block 7d**
(`7d. 00631 …`, measured from the suite's own NOTICE labels).

### n1 — 00628's NOTICE reports the designer-domain-role delta over EVERY stamped project
**minor · high confidence · carried, re-read.** `00628:178-182` counts
`WHERE p.studio_id IS NOT NULL AND NOT has_designer_domain_role(p.designer_id)` — every project
that has a studio, ever — and `:184` prints it as *"% **stamped** project(s)…"*. The statement
above it stamps only `WHERE studio_id IS NULL AND n_orgs = 1`. Locally both readings are 0; on
Strata it reports the whole book, and R-BD owes that number to the W7 preflight.

### n2 — `contact_rule_blocks_contact()` has no caller, and its COMMENT states a rule the file stopped making at r5
**minor · high confidence · re-measured.** `00629:909-921` mints it, `:925-926` grants it to
`authenticated`. Re-grepped across `supabase/`, `apps/` and `packages/`: the only files that
mention it are 00629 itself, the regenerated `seed/00-legacy-grants.sql`, and the generated
`database.types.ts`. Its COMMENT (`:928-934`) and §4d's banner (`:907`) both say
*"merge_studio_contacts() refuses on it"*; `00629:1469-1484` refuses on subsumption instead.

### n4 — `add_household_member()` raises the NEIGHBOURING file's raw tokens on both of its studio doors
**minor · high confidence · carried, re-read.** `00632:394-402` inserts the seat before any studio
is resolved, so `assert_project_party_cards()` (00624) answers for it —
`party_studio_contact_other_studio`, `party_card_project_has_no_studio` — while
`household_grant_forbidden` and `household_grant_project_has_no_studio` are defined two statements
later for one of the same conditions. No cross-tenant write occurs (re-measured, probe F-d).

### n5 — the notice's subject builds a possessive by concatenation
**minor · high confidence · code re-read at `00630:412-415`.** `v_holder || '''s paper has lapsed'`
produces *"Ostrom Builders's paper has lapsed"* (r15 measured the string off the rows the sweep
actually wrote). A notification is a face — the argument `00630:416-425` already makes for
`v_paper`.

### n6 — three of the branch's own RLS suites fail, and nothing on the branch records it
**minor · high confidence · re-measured (21 pass, 3 fail).**

```
design_requests_test.sql   ERROR: FAIL 3b: expected no_scans, got <none>
field_parties_test.sql     ERROR: consent_legacy_column_frozen
studio_titles_test.sql     ERROR: FAIL f: demoting the sole active owner should raise
                                  last_owner_protected
```

None is W3's, and `field_parties`'s is R-AX/R-AY working as ruled. The finding is that the branch
carries three red suites nobody has written down, while `w3-data-report.md` §7 makes a point of
repairing two pre-existing W1b failures of exactly this class.

### n7 — the merge's own note about what a rule leaves behind names two of three columns
**minor · high confidence · re-measured.** `00629:2124-2125`: *"What is left behind is the reason
text and the contact hours, which forbid nothing."* `studio_contact_rules` carries thirteen
columns (read from `information_schema`); the three the conditional repoint can strand are
`reason`, `contact_hours` and **`escalation_by_class`**. The last is unnamed and has no reader
today, so no wrong fact reaches a screen; the sentence is what a future reader will use to decide
whether the conditional repoint is still safe.

### n8 — the seat guard covers two of the seat's four card pointers
**minor · high confidence · re-measured from `pg_trigger`.**
`assert_party_card_not_merged_trg` is `BEFORE INSERT OR UPDATE OF studio_contact_id, company_id`.
`warranty_contact_person_id` is not in the list and `assert_project_party_cards()` tests only the
card's org, so a later write may stamp a seat with a card that was merged away.
`bid_quoted_by_person_id` is covered by 00631's own guard; `studio_contact_id` is the control.
The merge repoints the column and no face reads it, so this is the cached-picker hole on the one
pointer where it costs nothing today.

### n9 — the studio-less / other-studio pre-checks enumerate three of the four card pointers the seat block writes
**minor · high confidence (the gap) · low confidence (reachable today).** `00629:1534-1555` and
`:1590-1642` pre-refuse by name over `studio_contact_id`, `company_id` and
`warranty_contact_person_id`. The seat block also writes `bid_quoted_by_person_id`
(`00629:2446-2450`), whose guard raises `party_bid_quoted_by_project_has_no_studio` and
`party_bid_quoted_by_other_studio` (`00631:163-199`) — two more raw schema tokens that would reach
the merge sheet's `role="alert"` the way r11 MAJOR-2 and r13 MAJOR-1 did. The population is empty
today: the column is minted by 00631 and its guard has refused both shapes since it existed.

### m1 — the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · re-measured (`grep archived_at 00630` returns nothing).**
`00630:376-394` carries `sc.merged_into IS NULL` and no `archived_at` leg, so a lapsed COI on an
archived firm card writes a notice and an in-app notification to every owner and admin,
deep-linking `/people?firm=<id>` to a card `useStudioContacts(…, { includeArchived: false })` does
not return. 0 archived holders in the seeded book.

### m2 — deleting a household, or dropping a member from the array, still orphans the money grants it sourced
**minor · high confidence · carried, structural.** `00632:267-274`'s owner/admin DELETE policy and
any direct `PATCH member_person_ids` leave open `project_party_authority` rows carrying
`source_clause = 'client_households.co_threshold_cents'` standing with no household behind them.
`set_household_threshold()` is the only closer and it keys on the member array the delete has
already emptied. MAJOR-1 above is the same root cause read the other way: the clause names a
table, not a row.

### m3 — `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · re-measured.** `pg_proc.proconfig` is NULL for it and
`{search_path=public}` for the other twenty. SECURITY INVOKER and fully schema-qualified, so the
exposure is narrow — but it is granted to `authenticated` and called twice per emitted Directory
row from inside `identity_paper_state()`, and the wave's own stated rule is that every function
pins.

### m4 — `w3-data-report.md:132` still says "33 papers in total" where the database says 36
**minor · high confidence · re-measured.** `compliance_document_state()` over every row: `current`
9, `held` 24, `lapsed` 2, `lapses_soon` 1 = **36**, and `count(*) FROM
studio_compliance_documents` = 36. The four state counts in the same sentence are right.

### m5 — the `project_consent_org()` enumeration still describes one call site inaccurately
**minor · medium confidence · re-measured (twelve callers, exactly as listed).** `00628:56-80` and
report §6 say all twelve are "the CONSENT LEDGER'S KEY — not a guard and not a reducer".
`00629:2937-2942` is `CASE WHEN is_active_studio_member(project_consent_org(q0.project_id)) THEN
COALESCE(identity_consent_status(…), 'not_asked') END` — a membership GUARD on whether the
affirmative word renders. The behaviour is right and deliberate (it can only narrow); the sentence
enumerating it is not.

### m6 — two small internal inconsistencies in 00629
**minor · high confidence · re-measured.** `v_merge_id` is declared (`:1282`), assigned by the
final `RETURNING` (`:2531`) and never read. And `studio_contact_merges`' COMMENT (`:306-314`) says
"a merge that happened is a fact nobody may forge or take back" beside
`GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role` (`:354`) — true of `authenticated`, not
of every writer.

### m7 — `people_directory`'s own COMMENT was not re-issued
**minor · high confidence · re-measured.** `CREATE OR REPLACE VIEW` keeps the existing comment;
`obj_description('public.people_directory'::regclass) ~ 'merged_into'` answers **false**. Neither
of §6's two declared deltas reaches the object's own record.

### m8 — `identity_paper_state()` runs four recursive walks per emitted Directory row
**minor · medium confidence · carried.** `00629:1156-1161`: two `resolve_merged_contact()`
recursive CTEs (depth cap 16) on top of the two `compliance_state()` walks (depth cap 64) it
already made, on a function called once per CONTACTS row and once per PARTY row. `identity_seats`
was materialised in W1b r11 for exactly this class of cost on the same view; the merged-card
resolution is a no-op for every unmerged card, which is all of them today.

### m9 — `w3-data-report.md` is stale in nine places, and the report is what the W7 preflight reads
**minor · high confidence · re-measured this round.**

* `:45` "Refusals, in order: … **Eleven**, not eight" — `pg_proc.prosrc` yields **thirteen**
  distinct `merge_*` tokens (adding `merge_seat_on_studioless_project` and
  `merge_seat_card_other_studio`).
* the same line's citations are ~300 lines out: `merge_survivor_archived` is at `00629:1370` not
  `:983`, `merge_two_logins` at `:1398` not `:1011`, `merge_contact_rule_conflict` at `:1479` not
  `:1092`.
* `:41` says `people_directory` is 00626 "plus **one line**"; `:320` and §6's banner say **two
  deltas**, and a code-only diff measures two.
* §1's Objects table and §9's function list omit `project_parties_touch_updated_at()` and
  `contact_rule_blocks_contact()` entirely.
* `:23` / `:333` say the suite is "12 blocks as of r7"; the suite carries **17** labelled blocks
  and block 12 arrived in r15, not r7.
* `:132` "33 papers" against a measured 36 (m4).
* `:337` says `generate-legacy-grants.py` wrote "2752 replayed statements"; it writes **2766**.
* `:130` gives Lakeshore's `lapses_soon` date as 2026-10-06; measured today it is **2026-10-08**,
  and the seed shifts every fixture window by `CURRENT_DATE - 2026-10-20`, so an absolute date in
  the prose is stale the day after it is written — the defect §7.1 repaired in the test.
* `:201` / `:212` describe the pre-r15 household RPCs (r16-n2).

### m11 — 00628's backfill bumps `projects.updated_at` for every project it repairs
**minor · low confidence · carried.** `update_projects_updated_at` is BEFORE UPDATE FOR EACH ROW on
`projects` (re-enumerated from `pg_trigger` this round) and `00628:117-122` does not bracket it. Unlike `project_parties.updated_at`, nothing in
this program ranks by `projects.updated_at`. Recorded because 00624's stated obligation is about
bulk column rewrites generally and this is one. (Re-read this round: `set_project_studio_id()`
itself is confirmed harmless on this statement — its `v_postgres_migration` return is taken after
the immutability checks, and its derivation block is skipped because `NEW.studio_id` is already
set. It does, however, take four `FOR SHARE` lock statements per repaired row, which is a Strata
runtime note for the W7 preflight rather than a defect.)

### m12 — a notice is SPENT even when nobody was told
**minor · high confidence (mechanism) · narrow population · carried.** `00630:399-409` writes the
`studio_compliance_notices` row and increments `v_notices` first; `:454-486` then writes one
`notification_log` row per **active owner or admin** and never checks that any landed. A studio
whose only active members are plain `member`s has the `(document_id, state, expires_on)` key
permanently consumed while `v_notified` stays 0, and nothing but a date change clears it. The rule
the file states one statement earlier ("the two records can never disagree") does not hold in this
direction.

### m13 — after a firm-to-firm fold an uncarded seat's Directory row names the folded card's spelling
**minor · high confidence · carried (measured r13).** The seat's free-text
`project_parties.company_name` snapshot is deliberately never written by the merge
(`00629:2411-2413` argues the case for the CROSS fold). On a same-kind firm fold the argument does
not carry: the row prints a firm name off a card the Directory emits no row for, beside a
`company_id` that says otherwise. Minor because the two names are the same firm.

### m14 — 00630's `merged_into` leg describes merge behaviour that r3 replaced
**minor · high confidence · carried, re-read at `00630:381-393`.** The comment says
"merge_studio_contacts() leaves an absorbed document on the absorbed card wherever the survivor
holds no successor to retire it (00629 §5, crm-model §4) — correctly". §5 has not done that since
r3: `00629:2269-2273` moves EVERY absorbed head unconditionally and `:2280-2290` walks the lineage
behind it. The leg is pure defence in depth; the comment states it as load-bearing and cites a rule
that was reversed.

### m15 — `add_household_member()` does not read `archived_at`
**minor · medium confidence · carried, re-read.** `00632:348-356` refuses a card that is missing,
in another studio, not a person, or merged away — but not one the studio has PUT AWAY.
`assert_client_household_members()` (`:131-144`) makes the same four tests and the same omission.
So a card `useStudioContacts(…, { includeArchived: false })` hides can still be made a household
member and seated on a job, which is the shape `merge_survivor_archived` (r5 M-4) exists to refuse
one table over. Same class as MAJOR-1: the RPC reads identity and not standing.

---

## 5. What was checked and found sound (not findings)

* **r15 MAJOR-1's SQL halves, both of them**, re-measured: the closed seat is not reused, and a
  grant standing on one is ended rather than grown.
* **Merge is transactional and orphans nothing** (probe D's generic sweep over every FK column into
  `studio_contacts`).
* **The Directory folds the merged card and keeps the survivor's single row**; both ids stay
  resolvable (PR-o).
* **R-BN's channel reduction survives the fold** including `sms_capable`, `verified` and
  `preferred` (probe D-e).
* **No automated external send rides any W3 write** — `fc_dispatch_optin_invite()`'s fourth `IF`
  returns for every merge seat repoint, because no W3 statement moves a consent column.
* **No channel-kind × owner-kind rule exists**, so the sole-proprietor fold's `dispatch` /
  `after_hours` / `ap_email` rows land on a person card without aborting (read from
  `pg_constraint` and `assert_channel_owner_kind()`).
* **No unique index on the three trade-agreement card pointers** can collide with the merge's
  unconditional repoint (`uniq_trade_agreement_token_active` keys on `agreement_id`).
* **The affiliation partial unique index** (`(person_id, company_id) WHERE to_date IS NULL`) cannot
  be violated by either same-kind branch: the reduce-then-delete only ever touches open rows, and
  closed rows are outside the index.
* **The sweep end to end on the seeded book**, its idempotent second run, its recipients, its two
  `job_runs` rows and its cron registration.
* **Cross-tenant, every door**: 0 households, 0 merge rows, 0 notices, `studio_contact_not_found`,
  `merge_kind_mismatch` / `merge_not_a_member`, `permission denied for function
  sweep_compliance_expiries`.
* **R-BD's backfill** leaves all five ambiguous projects NULL, and `project_consent_org()`'s twelve
  remaining callers are the consent ledger's key — the RULING, not a gap.
* **Court widening** is purely additive; `project_tasks.owner` deliberately not widened.
* **Reset replays clean; all three people suites pass; types and legacy grants both regenerate with
  no diff.**

---

## 6. Probes written this round

Beside this file under `artifacts/people-room-crm-2026-09-11/build/`, all one transaction and
ROLLBACKed, all on a freshly reset database:

* `probe-r16-a-two-households.sql` — MAJOR-1 on one job, with both figures and the seat's grant.
* `probe-r16-b-two-jobs-one-member.sql` — MAJOR-1 across two jobs, the cross-job bleed.
* `probe-r16-c-closed-seat-grant.sql` — r16-n1, two open money grants on one job.
* `probe-r16-d-merge-orphans.sql` — the generic FK sweep, the Directory fold, the resolver and the
  channel reduction.
* `probe-r16-e-fold-makes-two-households.sql` — the room's own duplicate fold creating the dual
  membership.
* `probe-r16-g-doors.sql` — the kind refusal, the archive gate, the lineage write, the merged_into
  door and the sweep's grant.

---

## 7. One environment note, not a finding

Mid-round, two consecutive `psql` sessions saw `public.merge_studio_contacts` and
`public.organization_members` as non-existent, then everything was present again and every suite
passed. The local stack is shared across sessions (`feedback_shared_local_postgres_across_sessions`
warns about exactly this), so the likeliest reading is another session's reset window overlapping
these probes. Every measurement quoted above was re-run afterwards against a database whose three
people suites are green. Recorded so a later reader does not mistake it for a product signal.
