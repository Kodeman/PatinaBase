# W3 (P2) — adversarial migration review, round 17

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full this round: `00628`–`00633`; the bodies they graft or stand in front of
(`assert_compliance_holder`, `sync_person_affiliation_from_pointer`, `identity_paper_state`,
`rolodex_card_for_party_phone`, `link_rolodex_card_to_parties`, `project_parties_touch_updated_at`,
`people_directory`); `supabase/tests/people/w3_merge_sweep_household_test.sql` (blocks 13 / 13b in
full); `w3-data-report.md`; `w3-fix-log-r16.md`; `w3-review-r16-migrations.md`; `rulings.md`;
`direction.md` §3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7;
`w1a-report.md`, `w1b-report.md`, `w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md`
§4. Also read, because this round's blocking lands on a face:
`packages/supabase/src/hooks/use-households.ts`,
`apps/designer-portal/src/components/document/roster/household-band.tsx`,
`apps/designer-portal/src/lib/document/write-error.ts`.

**Verdict: NOT clean — ONE BLOCKING, ONE MAJOR, twenty-nine minor.**

r16's MAJOR-1 is **FIXED and re-measured** (probe-r16-b: raising the Lindqvist figure no longer
moves the Okonkwo grant). r16's F1 fix — the second loop `set_household_threshold()` gained, which
OPENS the missing grant — is the source of both findings this round. It is bounded by the
household's member array and by the `client_rep` role, and by **nothing about the project**, so it
writes money authority onto seats on jobs the household has nothing to do with. That is the same
cross-job money bleed r16 MAJOR-1 was filed for, re-entered through the door r16 opened to close
F1, and the suite's own pin (block 13b) cannot see it because it stages every member on one job.

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **rc=0, clean replay**, "Finished supabase db reset on branch main." |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (13b last) |
| all 24 `supabase/tests/rls/*.sql` | **21 pass, 3 fail** — the same three, all pre-existing, none W3's (n6) |
| `packages/supabase/src/database.types.ts` | clean in `git status`; carries `source_household_id` at `:16525/:16540/:16555` and `project_party_authority_source_household_id_fkey` at `:16589` |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff** (2766 replayed statements) |
| migration numbering | 00628–00633; all above 00627, none inside the reserved 00595–00620; nothing minted this round; `00632` edited in place, unapplied on Strata |
| `cron.job` after the reset | `compliance-document-expiry-sweep · 0 6 * * * · active=true`, body `SELECT public.sweep_compliance_expiries();` — schema-qualified |
| the sweep against the seeded book | run 1 `{"notices":3,"scanned":3,"notified":6}`; run 2 `{"notices":0,"scanned":3,"notified":0}` — idempotent; notices `lapsed 2025-12-31`, `lapsed 2026-03-31`, `lapses_soon 2026-10-08`; `job_runs` one `succeeded` row per invocation |
| sweep recipients | `admin, owner` only; **0** notifications to anyone who is not an active owner/admin |
| function ACL / `proconfig` | `sweep_compliance_expiries` denies `authenticated` (`permission denied for function`); `resolve_merged_contact` is the one wave function with no pinned `search_path` (m3) |
| cross-tenant, all four new objects | a member of another studio reads **0** households, **0** merge rows, **0** notices, **0** `project_party_authority` rows carrying `source_household_id` |
| 00628 backfill outcome | 8 projects, 3 stamped, **5 still `studio_id IS NULL`**, all five ambiguous — R-BD holds |
| 00633 | `client_decisions_court_check` reads eleven words, a strict superset (read from `pg_constraint`) |
| R-AY (record-only consent) | the only non-comment `studio_channel_consent` / `sms_consent_*` token anywhere in `00628`–`00633` is the view's OUTPUT key `'sms_consent_status', q.consent_word` (`00629:2869`), whose value is `identity_consent_status()`. No consent write, no consent read for a verdict |
| merge orphans | probe-r16-d re-run post-reset: the only residual pointer at a folded card is `studio_contact_merges.merged_id=1`; 0 Directory rows for the folded id, 1 for the survivor; the absorbed `unsubscribed` channel survives with `verified/preferred/sms_capable` |
| the doors | `merge_kind_mismatch` · `studio_contact_archive_forbidden` · `permission denied for table studio_contact_merges` · `studio_contact_merge_pointer_forbidden` · `permission denied for function sweep_compliance_expiries` — all five re-measured post-reset |
| `people_directory` body vs 00626 | code-only diff (comments and blank lines stripped): **exactly two deltas** — the TEAM branch's tenant leg and the CONTACTS branch's `AND sc.merged_into IS NULL`. No third. |

### Every r16 finding re-checked

| r16 | State |
|---|---|
| **MAJOR-1 (migrations)** — a card in two households, either figure rewriting the other's grants | **FIXED.** `00632:338-344` mints `project_party_authority.source_household_id`; `00632:532-533` and `00632:672` ask it beside the clause. probe-r16-b re-run: `B-d Lindqvist kitchen=2500000 \| Okonkwo residence=250000` (was 2500000 on both) |
| **F1 (QA)** — the `client_rep` added before the figure never got a grant | **FIXED, and it is this round's BLOCKING.** `00632:734-773` opens the grant; block 13b pins it on one job. The loop's predicate names no project (§2) |
| **r16-major-1 (code)** — the band read a grant on a CLOSED seat | fixed in `use-households.ts`; out of this lane |
| **r16-major-2 (code)** — the bring-forward sentence over-counted | fixed in `rolodex-picker.tsx` / `bring-forward.ts`; out of this lane |
| r16-n1 · r16-n2 · n1 · n2 · n3 · n4 · n5 · n6 · n7 · n8 · n9 · m1 · m2 · m3 · m4 · m5 · m6 · m7 · m8 · m9 · m11 · m12 · m13 · m14 · m15 | **ALL OPEN** — the r16 fix log names four findings closed and nothing else touched. Each re-measured or re-read this round and restated in §4 |

---

## 2. BLOCKING-1 — the figure act opens money authority on seats belonging to other jobs, and the grant it leaves there can never be moved again

**Severity: blocking. Confidence: high (measured twice on a freshly reset database, both rolled
back; reachable with ONE household and no merge).**

### The gap

r16 F1 taught `set_household_threshold()` a second loop, after the move loop, that OPENS the
missing grant for a member seated before the household named a figure (`00632:734-773`). Its
predicate is:

```sql
-- 00632:735-746
SELECT pp.id AS seat_id
  FROM public.project_parties pp
 WHERE pp.party_kind        = 'client_rep'
   AND pp.studio_contact_id = ANY (v_h.member_person_ids)
   AND pp.off_job_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.project_party_authority pa
                    WHERE pa.engagement_id = pp.id
                      AND pa.scope         = 'money'
                      AND pa.effective_to IS NULL)
 ORDER BY pp.id
```

Three legs: the role, the membership, the seat's standing. **No leg about the project.** Every
other writer of this figure names one — `add_household_member()` takes `p_project_id` and opens the
grant on that job's seat and no other (`00632:445-452`, `:471-538`), and the move loop above only
ever visited rows the household itself had written. The opening loop visits every open `client_rep`
seat any member of the household holds anywhere in the studio's book, and stamps each one
`source_household_id = v_h.id` — which, since r16 MAJOR-1, is exactly the fact that makes the grant
**nobody else's to move**.

### Measured — two households, two jobs, one shared member

`artifacts/…/build/probe-r17-a-loop2-crossjob.sql`, one transaction, ROLLBACKed, as the seeded
studio's owner. Both households start with `co_threshold_cents` NULL — the ordinary order of work
r16 F1 exists for. Each member is seated by `add_household_member()` on its own household's job:

```
A-a Okonkwo seat   = 593e3fcd-…            (Okonkwo residence)
A-b Lindqvist seat = 6fcc50a0-…            (Lindqvist kitchen)
A-c open money grants before any figure: none
   <the OKONKWO household names $2,500. The Lindqvist household names nothing.>
A-d open money grants after the OKONKWO figure alone:
      Lindqvist kitchen=250000 [src_hh=Okonkwo r17 household]
    | Okonkwo residence=250000 [src_hh=Okonkwo r17 household]
A-e Lindqvist household record still says: <null>
   <the LINDQVIST household then names $9,000 of its own>
A-f after the LINDQVIST figure is set to 900000:
      Lindqvist kitchen=250000 [src_hh=Okonkwo r17 household]
    | Okonkwo residence=250000 [src_hh=Okonkwo r17 household]
```

Two separate harms, on the same row:

1. **A-d.** The Okonkwo household's principal named the Okonkwo household's figure, and the
   **Lindqvist kitchen**'s client-side seat came out signing money to $2,500 — a grant on a job that
   household has nothing to do with, under another principal, that nobody asked for. At that moment
   the Lindqvist household's own record read NULL (A-e), so the Lindqvist Call Sheet's household
   band printed "No change-order figure is on file for this household." while the client-side roster
   row two elements above it printed "Signs money to $2,500." — two simultaneously-rendered,
   directly contradictory facts about money on one screen with no act between them, which is the
   harm `00632:591-594`'s own banner names and the one PR-c and PR-n put under the principal.
2. **A-f.** The grant is stamped with the OKONKWO household's id, so the Lindqvist household can
   never move it: the move loop's `pa.source_household_id = v_h.id` (`00632:672`) excludes it and
   the opening loop's `NOT EXISTS` skips it. The Lindqvist band now prints $9,000 and its own seat
   prints $2,500, **permanently**, and there is no act in the People room that repairs it —
   `set_household_threshold()` is the band's only door onto this column and both of its loops are
   closed against that row.

### Measured — ONE household, no merge, no second household

`probe-r17-b-loop2-onehousehold.sql`. One household on the Okonkwo residence; the same person also
holds an ordinary `client_rep` seat on the Lindqvist kitchen, written by a plain roster
INSERT — which is what "Add to the roster" with the `a household member` kind does (SPEC §5.5 #2's
kind switch), and what `add_household_member(…, p_project_id => NULL)` deliberately leaves the
studio free to do:

```
B-b open money grants before the figure: none
B-c open money grants after the figure:  Lindqvist kitchen=250000 | Okonkwo residence=250000
```

So the state needs **no duplicate fold, no second household and no legacy row**. It is one
household, one figure, one press.

### Why this is blocking and not major

The brief lists "wrong fact on a face" under blocking, and A-d/A-f put a wrong money figure on the
Lindqvist Call Sheet's client side in one press with no act that takes it back. r16 calibrated the
same class as MAJOR on this program's precedent — but r16's defect needed a second household and
left the record repairable by the household that owned it; this one needs neither and is not
repairable at all. If Fable reads the precedent as binding, demote it; the mechanism and the
reachability are what matter.

### Where a fix belongs (not prescriptive)

The loop needs the project scope every other writer of this column already has. Three shapes, none
settled by this finding:

* **Name the jobs the household acts on.** The only seats `add_household_member()` ever opened are
  the ones a caller named a project for; the opening loop could be bounded to the projects the
  household already has a seat or a grant on (`source_household_id = v_h.id`, or a
  `designer_clients.household_id` join), which is PR-c's "split by job" read literally.
* **Bound it to seats the household created.** Stamp the SEAT as well as the grant, or key the loop
  on seats whose `project_id` the household's own `designer_clients` row names.
* **Do not open at all; make it an act.** r16 F1's harm was a member left unable to sign; a named
  per-member "Record the authority" act on the band (R-J's own shape, "Nothing defaulted from the
  agreement." / "Record the authority") closes it without a loop that can reach a job nobody named.

The pin belongs in `w3_merge_sweep_household_test.sql` beside block 13b, staging one member on TWO
jobs with only one household naming a figure, with A-f's "the other household can never move it"
assertion as the negative control.

---

## 3. MAJOR-1 — one member's seat on a studio-less job now refuses the whole figure act for the household

**Severity: major. Confidence: high (measured, rolled back).**

Same root cause, different harm, different repair.

The opening loop asks PR-n per seat on the studio the PROJECT records (`00632:752-764`), refusing
the whole act rather than half-opening the grants — which is the right posture for the seats the
household named. But because the loop's predicate names no project, the seats it asks about include
every open `client_rep` seat the member holds, R-BI's legacy studio-less population among them.
`project_party_recorded_studio()` answers NULL there, so the act raises
`household_grant_project_has_no_studio` and **the household cannot name its figure at all**, over a
job it has nothing to do with and cannot repair from the People room (nothing in `/people` or the
Call Sheet stamps a project's `studio_id`).

`probe-r17-c-studioless-widening.sql`, one transaction, ROLLBACKed — a studio-less project staged
with 00624's card guard off, which is the legacy shape R-BI names and not a write the room makes:

```
C-a studio_id of the staged job: <null>
C-b the figure act was REFUSED: household_grant_project_has_no_studio
```

Before r16 F1 the same household named its figure without incident: the move loop only ever visited
grants the household had already written, and `add_household_member()` refuses to write one on a
studio-less job in the first place, so no row in the loop meant no PR-n question to ask. The reach
is new in r16.

The refusal itself is humanised — `use-households.ts:113` maps the token to "This job is not
attached to a studio yet, so there is nothing to record the authority against." and
`useSetHouseholdThreshold` (`:563`) converts before throwing — so **no schema word reaches the
face**, which is why this is major and not blocking. What reaches the face is a sentence naming a
job the studio is not looking at, over an act it cannot complete, with the Okonkwo household band
stuck on "No change-order figure is on file for this household." The population is 0 locally (all
five studio-less projects carry no seats) and **unmeasured on Strata**; 00628's NOTICE counts it at
deploy, and the W7 preflight is owed the number beside R-BD's.

The r16 fix log names this consequence in words ("Note the widened consequence… which is R-BD's
repair sentence"), so it is declared rather than missed — but it is declared by the implementer, not
ruled, and the same class (`party_card_project_has_no_studio` reaching an act the room could not
complete) was filed MAJOR and fixed with a named pre-check in r11 and r13.

---

## 4. Minor

### r17-n1 — NEW: nothing in the suite can see either finding above
**minor · high confidence · read.** Block 13b (`w3_merge_sweep_household_test.sql:4699-4793`) stages
`v_early` and `v_plain` on `f9300000-…-000a` and `v_closed` on `f9300000-…-00c1`, one project per
member, and asserts `count(*) … WHERE engagement_id = v_early`. Block 13's cross-job control
(13-e) is about the MOVE loop, which r16 fixed. No block stages one member on two jobs with one
household naming a figure, which is the whole of §2, and no block stages a member on a studio-less
job, which is §3.

### r17-n2 — NEW: `source_household_id` carries no tenancy or consistency rule of its own
**minor · medium confidence · reasoned from `pg_policy` + the two loop predicates.** The column is a
bare FK (`00632:338-340`) with no CHECK and no trigger tying the named household's
`organization_id` to the seat's recorded studio. No cross-tenant write is reachable — both loops are
bounded by `member_person_ids`, which `assert_client_household_members()` holds to cards in the
household's own studio, and `project_party_authority`'s money policies require
`is_org_admin_or_owner(project_party_recorded_studio(engagement_id))` (read live from `pg_policy`) —
so the worst an owner/admin can do is stamp a grant with an id no loop will ever match, stranding it
the way m2 describes. Recorded because the column is now the load-bearing half of "the household's
own grant" and the only thing holding it honest is two function bodies.

### r17-n3 — NEW: `w3-data-report.md` does not mention the new column at all
**minor · high confidence · re-read.** The report's mtime is 2026-09-13 22:20; the r16 fix log's is
2026-09-15 04:51, so the report predates rounds 8 through 16 entirely. Beyond m9's list: §8's
"New columns" enumerates eight bid columns, `studio_contacts.merged_into`,
`studio_compliance_notices.expires_on` and `designer_clients.household_id` and **omits
`project_party_authority.source_household_id`, its index and its FK**; §9's RPC list describes
`set_household_threshold()` as "the figure AND the grants it sources" with no word of the second
loop or of the closed-seat ending; §4's `add_household_member()` walk (`:212`) still describes the
pre-r15 seat lookup. The report is what the W7 preflight reads. Folds into m9.

### r16-n1 — CARRIED: `add_household_member()` leaves the CLOSED seat's grant open
**minor · high confidence · re-measured.** `probe-r16-c` re-run post-reset:
`C-c open money grants for this card on this job: 2 — seat off_job_at=<null> threshold=250000 |
seat off_job_at=2026-08-16 threshold=250000`. `00632:39-45`'s banner claims both halves of the rule;
the add path skips a closed seat but never ends its grant. The next `set_household_threshold()` call
now closes it (the move loop's `off_job_at` branch, `00632:700-703`) — but only if the household
also owns it, and only when somebody touches the figure.

### r16-n2 — CARRIED: the report describes the pre-r15 `add_household_member()`
**minor · high confidence.** Folds into m9 / r17-n3.

### n1 — CARRIED: 00628's NOTICE reports the designer-domain-role delta over EVERY stamped project
**minor · high confidence · re-read.** `00628:178-182` counts
`WHERE p.studio_id IS NOT NULL AND NOT has_designer_domain_role(p.designer_id)` — every project that
has a studio, ever — and `:184` prints it as "% **stamped** project(s)…". Locally both readings are
0; on Strata it reports the whole book.

### n2 — CARRIED: `contact_rule_blocks_contact()` has no caller, and its COMMENT states a rule the file stopped making at r5
**minor · high confidence · re-grepped.** The only files naming it are `00629` itself,
`seed/00-legacy-grants.sql` and the generated `database.types.ts`. Its COMMENT (`00629:928-934`) and
§4d's banner (`:907`) say "merge_studio_contacts() refuses on it"; `00629:1469-1484` refuses on
subsumption instead.

### n3 — CARRIED: `00631:334` cites "w3 block 12", which now exists and is about something else
**minor · high confidence.** 00631's `updated_at` pin is block 7d; block 12 is r15's closed-seat
household block.

### n4 — CARRIED: `add_household_member()` raises the NEIGHBOURING file's raw tokens on both studio doors
**minor · high confidence · re-read.** `00632:454-462` inserts the seat before any studio is
resolved, so `assert_project_party_cards()` answers first — `party_studio_contact_other_studio`,
`party_card_project_has_no_studio` — while `household_grant_forbidden` /
`household_grant_project_has_no_studio` are defined two statements later for one of the same
conditions. Both 00624 tokens are humanised by `write-error.ts:32-34` / `:57-59`, so nothing raw
reaches the face; the finding is that one condition has two vocabularies.

### n5 — CARRIED: the notice's subject builds a possessive by concatenation
**minor · high confidence · re-measured off the rows the sweep actually wrote.**
`00630:412-415`'s `v_holder || '''s paper has lapsed'` produced, this round:
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
**minor · high confidence · re-read from `pg_trigger`.** `assert_party_card_not_merged_trg` is
`BEFORE INSERT OR UPDATE OF studio_contact_id, company_id`; `warranty_contact_person_id` is not in
the list and `assert_project_party_cards()` tests only the card's org.
`bid_quoted_by_person_id` is covered by 00631's own guard.

### n9 — CARRIED: the studio-less / other-studio pre-checks enumerate three of the four card pointers
**minor · high confidence (the gap) · low confidence (reachable today).** `00629:1534-1555` and
`:1590-1642` pre-refuse over `studio_contact_id`, `company_id` and `warranty_contact_person_id`. The
seat block also writes `bid_quoted_by_person_id` (`00629:2446-2450`), whose guard raises
`party_bid_quoted_by_project_has_no_studio` / `_other_studio` — both humanised in
`write-error.ts:66-73`, so the token no longer reaches the face, but the merge still aborts
mid-transaction where the pre-checks would have refused by name. Population empty today.

### m1 — CARRIED: the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · re-measured (`prosrc like '%archived_at%'` answers false).**
`00630:376-394` carries `sc.merged_into IS NULL` and no `archived_at` leg, so a lapsed COI on an
archived firm card writes a notice and an in-app notification to every owner and admin, deep-linking
to a card `useStudioContacts(…, { includeArchived: false })` does not return. 0 archived holders in
the seeded book.

### m2 — CARRIED: deleting a household, or dropping a member from the array, orphans the grants it sourced
**minor · high confidence · structural.** `00632:293-300`'s DELETE policy and any direct PATCH of
`member_person_ids` leave open `project_party_authority` rows carrying the clause and the household
id standing with no household behind them (`source_household_id` is `ON DELETE SET NULL`, so the id
goes and the clause stays). `set_household_threshold()` is the only closer and it keys on the member
array the delete has already emptied. §2 above reaches the same stranded state by a shorter road.

### m3 — CARRIED: `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · re-measured (`proconfig` is NULL for it, `{search_path=public}` for
every other wave function).** SECURITY INVOKER and fully schema-qualified, so the exposure is narrow
— but it is granted to `authenticated` and called twice per emitted Directory row from inside
`identity_paper_state()`, and the wave's own stated rule is that every function pins.

### m4 — CARRIED: `w3-data-report.md:132` says "33 papers in total" where the database says 36
**minor · high confidence · re-measured post-reset.** `count(*) FROM studio_compliance_documents` =
36; `compliance_document_state()` over every row: `current` 9, `held` 24, `lapsed` 2, `lapses_soon`
1 = 36. The four state counts in the same sentence are right.

### m5 — CARRIED: the `project_consent_org()` enumeration describes one call site inaccurately
**minor · medium confidence.** `00628:56-80` and report §6 say all twelve are "the CONSENT LEDGER'S
KEY — not a guard and not a reducer". `00629:2937-2942` is
`CASE WHEN is_active_studio_member(project_consent_org(q0.project_id)) THEN COALESCE(…) END` — a
membership GUARD on whether the affirmative word renders. The behaviour is right and deliberate; the
sentence enumerating it is not.

### m6 — CARRIED: two small internal inconsistencies in 00629
**minor · high confidence · re-read.** `v_merge_id` is declared (`:1282`), assigned by the final
`RETURNING` (`:2531`) and never read. `studio_contact_merges`' COMMENT (`:306-314`) says "a merge
that happened is a fact nobody may forge or take back" beside
`GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role` (`:354`) — true of `authenticated`, not of
every writer.

### m7 — CARRIED: `people_directory`'s own COMMENT was not re-issued
**minor · high confidence · re-measured post-reset.** `CREATE OR REPLACE VIEW` keeps the existing
comment; `obj_description('public.people_directory'::regclass) ~ 'merged_into'` answers **false**.
Neither of §6's two declared deltas — the merged-card fold and the TEAM branch's tenant leg, the
latter a narrowing of who reads a studio's teammate names — reaches the object's own record.

### m8 — CARRIED: `identity_paper_state()` runs four recursive walks per emitted Directory row
**minor · medium confidence.** `00629:1156-1161`: two `resolve_merged_contact()` recursive CTEs
(depth cap 16) on top of the two `compliance_state()` walks (depth cap 64), on a function called
once per CONTACTS row and once per PARTY row. `identity_seats` was materialised in W1b r11 for
exactly this class of cost on the same view.

### m9 — CARRIED and WIDENED: `w3-data-report.md` is stale in eleven places
**minor · high confidence · re-measured this round.** r16's nine, plus r17-n3's two. In one list:
the refusal count and its three citations (`:45`), the "plus one line" view claim (`:41` against
`:320`), the omitted `project_parties_touch_updated_at()` and `contact_rule_blocks_contact()`
(§1/§9), "12 blocks as of r7" against a suite that now carries 13b (`:23`/`:333`), "33 papers"
(`:132`), "2752 replayed statements" against a measured 2766 (`:337`), Lakeshore's absolute
`lapses_soon` date (`:130`, measured 2026-10-08 today and seed-relative by construction), the
pre-r15 household RPC walks (`:201`/`:212`), and the wholly absent
`project_party_authority.source_household_id` (§8) and two-loop `set_household_threshold()` (§9).

### m11 — CARRIED: 00628's backfill bumps `projects.updated_at` for every project it repairs
**minor · low confidence.** `update_projects_updated_at` is BEFORE UPDATE FOR EACH ROW on `projects`
and `00628:117-122` does not bracket it. Nothing in this program ranks by `projects.updated_at`.

### m12 — CARRIED: a notice is SPENT even when nobody was told
**minor · high confidence (mechanism) · narrow population.** `00630:399-409` writes the notice row
and increments `v_notices` first; `:454-486` then writes one `notification_log` row per active
owner/admin and never checks that any landed. A studio whose only active members are plain `member`s
has the `(document_id, state, expires_on)` key permanently consumed while `v_notified` stays 0.

### m13 — CARRIED: after a firm-to-firm fold an uncarded seat's Directory row names the folded card's spelling
**minor · high confidence.** `project_parties.company_name` is a free-text snapshot the merge never
writes (`00629:2411-2413` argues the case for the CROSS fold); on a same-kind firm fold the argument
does not carry.

### m14 — CARRIED: 00630's `merged_into` leg describes merge behaviour that r3 replaced
**minor · high confidence · re-read at `00630:381-393`.** The comment says the merge "leaves an
absorbed document on the absorbed card wherever the survivor holds no successor to retire it …
correctly"; `00629:2269-2273` moves EVERY absorbed head unconditionally and `:2280-2290` walks the
lineage behind it. The leg is pure defence in depth; the comment states it as load-bearing.

### m15 — CARRIED: neither household door reads `archived_at`
**minor · medium confidence · re-measured (`prosrc like '%archived_at%'` answers false for
`add_household_member`).** `00632:408-416` refuses a card that is missing, in another studio, not a
person, or merged away — but not one the studio has PUT AWAY.
`assert_client_household_members()` (`:157-170`) makes the same four tests and the same omission. So
a card `useStudioContacts(…, { includeArchived: false })` hides can still be made a household member
and seated on a job — the shape `merge_survivor_archived` (r5 M-4) exists to refuse one table over.

---

## 5. What was checked and found sound (not findings)

* **r16 MAJOR-1's fix, both halves.** `source_household_id` is stamped by both writers and asked by
  both loops; probe-r16-b's cross-household rewrite no longer occurs; `householdOwnsGrant()` is one
  exported rule.
* **The merge is transactional and orphans nothing** (probe-r16-d's generic sweep over every FK
  column into `studio_contacts`, re-run post-reset). The Directory folds the merged card and keeps
  the survivor's single row; both ids stay resolvable (PR-o).
* **R-BN's channel reduction survives the fold** including `sms_capable`, `verified` and
  `preferred`.
* **No company into a person** except crm-model §4's one exception, both directions measured; the
  pointer is the RPC's alone; the lineage table refuses a member INSERT; archive is owner/admin only.
* **Households RLS**: four policies carry the tenant leg beside `is_studio_comember()`, owner/admin
  on DELETE and on any write carrying `co_threshold_cents`, plus `assert_household_threshold_
  principal()` reading the CHANGE so an ERASE is refused too.
* **`project_party_authority`'s money policies** (read live) already require
  `is_org_admin_or_owner(project_party_recorded_studio(engagement_id))` on INSERT, UPDATE and
  DELETE, so no plain member can hand-stamp `source_household_id` on a money grant.
* **Every household refusal token is humanised before it reaches a face**:
  `use-households.ts:103-118` maps the eight, and both mutating hooks (`:563`, `:609`) convert
  before throwing, so `writeErrorMessage()` receives a sentence and not a token.
* **The sweep end to end on the seeded book**, its idempotent second run, its owner/admin-only
  recipients (0 notifications to anyone else), its `job_runs` rows and its cron registration.
* **Cross-tenant, every door**: 0 households, 0 merge rows, 0 notices, 0 stamped grants;
  `permission denied for function sweep_compliance_expiries`.
* **R-BD's backfill** leaves all five ambiguous projects NULL; `project_consent_org()`'s remaining
  callers are the consent ledger's key — the RULING, not a gap.
* **Court widening** is purely additive (`pg_constraint` read post-reset); `project_tasks.owner`
  deliberately not widened.
* **`people_directory`'s body is 00626's with exactly two deltas** — verified by a comment-stripped
  code diff, not by reading the banner.
* **R-AY**: no W3 migration reads or writes consent for a verdict.
* **Reset replays clean; all three people suites pass; types and legacy grants both regenerate with
  no diff.**

---

## 6. Probes written this round

Beside this file under `artifacts/people-room-crm-2026-09-11/build/`, all one transaction and
ROLLBACKed, all on a freshly reset database:

* `probe-r17-a-loop2-crossjob.sql` — BLOCKING-1 across two jobs, with the second household's
  permanent lock-out (A-f).
* `probe-r17-b-loop2-onehousehold.sql` — BLOCKING-1 with ONE household and no merge.
* `probe-r17-c-studioless-widening.sql` — MAJOR-1, the whole figure act refused over a studio-less
  seat the household never named.
