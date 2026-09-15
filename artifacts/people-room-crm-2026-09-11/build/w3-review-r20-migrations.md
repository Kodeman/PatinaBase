# W3 (P2) — adversarial migration review, round 20

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full this round: `00628`–`00634`; the bodies they stand in front of or graft
(`project_party_authority` + its four policies and `assert_party_authority_copy_to` 00624:824-1063,
`project_parties_studio_update` 00584:895-903, `compliance_state` / `studio_compliance_documents`
00623, `set_project_studio_id` 00317/00563, 00417's `studio_contacts` policies,
`project_parties_touch_updated_at` / `assert_merged_into_write` / the merge's seat, designation,
trade-agreement and household repoints 00629, `people_directory` v5's CONTACTS and TEAM legs);
`supabase/tests/people/w3_merge_sweep_household_test.sql` (block 13d in full);
`w3-data-report.md`; `w3-fix-log-r19.md`; `w3-review-r19-migrations.md`;
`probe-r19-a-closed-seat-two-figures.sql`; `rulings.md`; `direction.md` §3.1/§3.4/§5/§7/§8/§9;
`crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a-report.md`, `w1b-report.md`,
`w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md` §4. Plus the four readers that
decide whether 00634's new end date reaches a face (`use-project-authority.ts`,
`use-coordination.ts`'s `usePartyAuthority` and `useCloseProjectPartySeat`,
`person-profile.tsx`, `roster-row.tsx`).

**Verdict: NOT clean — ONE BLOCKING, ZERO MAJOR, thirty-three minor.**

All four r19 defects are FIXED and re-verified (§1.2). This round's BLOCKING is the r19 fix's own
door: `00634`'s trigger is `SECURITY DEFINER` with no standing check, and the table it writes
(`project_party_authority`) is reached through a table whose UPDATE policy is the legacy
`is_studio_comember(designer_id)` one — no tenant leg, no PR-n leg. Measured twice on a freshly
reset database, rolled back, with room acts only: a plain `member` who can neither SELECT nor
UPDATE a money grant ends it, and so does a plain `member` of a **second** studio who is not a
member of the studio the job records.

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **clean**, rc=0 — "Finished supabase db reset on branch main." Ledger head `20260910152111`, then `00634, 00633, 00632, 00631, 00630, 00629, 00628, 00627` |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." (26 blocks) |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed", **13d last**; re-run a second time, still clean and leaking no committed row |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff**, "baseline + 2767 replayed statements" |
| migration numbering | `00628`–`00634`; all above `00627`, none inside the reserved `00595`–`00620`; nothing minted this round |
| function ACL / `proconfig` (22 wave functions, from `pg_proc`) | every one pins `search_path=public` except `resolve_merged_contact`, `proconfig` NULL (m3). **No `anon` grant anywhere.** Trigger functions hold `postgres` + `service_role` only; `sweep_compliance_expiries` is `service_role` only; `end_party_authority_at_seat_close` is `postgres` + `service_role` only |
| `project_consent_org()` callers (`pg_proc.prosrc`, `pg_get_viewdef`, `pg_policy`) | **twelve**, all of them the consent ledger's key — 8 functions, 4 views, **0 policies**. R-BD's retirement from guards and reducers holds |
| R-AY (record-only consent) | grep over `00628`–`00634`: no non-comment `studio_channel_consent` / `record_channel_consent` / `sms_consent_*` token except `people_directory`'s OUTPUT keys `'sms_consent_status'` / `'sms_consented_at'` (`00629:2964-2965`), whose values are `identity_consent_status()`. No consent read for a verdict, no consent write |
| `client_households` policies (from `pg_policy`) | SELECT/UPDATE carry `is_active_studio_member AND is_studio_comember`; INSERT/UPDATE WITH CHECK carry PR-n's figure leg; DELETE carries `is_active_studio_member AND is_org_admin_or_owner` (r18-n2) |
| `client_decisions_court_check` | eleven words, a strict superset of 00212/00281's seven; ledger unchanged (6 rows, all `client`) |
| 00628 backfill | 8 projects, 5 still `studio_id IS NULL` — all ambiguous (designer holds two active design studios), 0 carrying seats. Zero and several both stay NULL, as R-BD rules |
| `sweep_compliance_expiries()` against the seeded book (probe-r20-c) | `{"scanned":3,"notices":3,"notified":6}` first run, `{"notices":0,"notified":0}` on rerun. Three notices — Ostrom `lapsed` 2025-12-31, Northgate `lapsed` 2026-03-31, Lakeshore `lapses_soon` 2026-10-08 — and six `notification_log` rows, **owner + admin only**, no plain member. `job_runs` rows written, `cron.job` carries `compliance-document-expiry-sweep` at `0 6 * * *`, active |
| every FK into `studio_contacts` (20, from `pg_constraint`) | every one is repointed, reduced or deliberately left by `merge_studio_contacts()`; no column is stranded. Merge orphans no channel, document, affiliation, designation, rule, waiver, token, household member or seat |
| branch RLS suites (`supabase/tests/rls/*.sql`, 24 files) | **21 pass, 3 fail** — unchanged from r18/r19 (n6) |

### 1.2 Every r19 finding re-checked

| r19 | State |
|---|---|
| **MAJOR-1** — `merge_seat_collision`'s HINT names a repair that produces the contradiction | **FIXED, re-measured.** `00634_seat_close_ends_authority.sql` ends every open grant on the day the seat closes; `00629:1699-1710` now records that the carve-out's sentence is a rule 00634 makes and names the trigger. 13d-o/p/q/r/s pin it. Re-running probe-r19-a's shape: the closed seat's grant reads `effective_to 2026-09-15`. **The fix opens §2.** |
| **MAJOR-1 (QA)** — the picker's sheet head named no job | out of this lane; `doc-sheet.tsx`'s page-label span no longer carries `hidden sm:inline` (re-read `:161-176`) |
| **MAJOR-1 (code)** — a bid correction moved a hand-closed seat's date | out of this lane; `use-coordination.ts:2584`'s branch now reads `&& !previous.offJobAt` (re-read) |
| **MAJOR-2 (report)** — `w3-room-report.md` §1/§9 stale | out of this lane |
| r19-n1 — `00629:1694` states a rule no code makes | **FIXED** — 00634 makes it, and the comment now says so |
| r19-n2 — 13d's controls scoped so §2's state cannot fail them | **FIXED** — 13d-q/r/s count without the `pp.off_job_at IS NULL` scope (`w3_merge_sweep_household_test.sql:5225, :5266, :5275`) |
| r18-n1 — no block stages a seat collision that SURVIVES a fold | **FIXED** — 13d-q/r do exactly that |
| r16-n1 — `add_household_member()` leaves the CLOSED seat's grant open | **FIXED** by 00634 (trigger + one-time backfill) |
| r18-n2 · r18-n3 · r17-n2 · n1–n9 · m1–m16 | **ALL OPEN** — each re-read or re-measured this round and restated in §4 |

---

## 2. BLOCKING-1 — 00634's trigger writes a money-authority row for callers the authority table's own policies refuse, across tenants included

**Severity: blocking. Confidence: high (measured twice on the freshly reset database, one
transaction each, ROLLBACKed, with room acts only).**

### The gap

`00634:76-90`:

```sql
CREATE OR REPLACE FUNCTION public.end_party_authority_at_seat_close()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.project_party_authority
     SET effective_to = GREATEST(effective_from, NEW.off_job_at), updated_at = now()
   WHERE engagement_id = NEW.id AND effective_to IS NULL;
  RETURN NULL;
END; $$;
```

`SECURITY DEFINER` is right for the *capability* (an ordinary member's "Close this seat" must be
able to end a row behind `project_party_authority`'s RLS) and wrong as written, because the body
states **no gate at all**. It ends every open grant on the seat — `money` and `draw_certify`
included — for whoever managed to write `off_job_at`.

And the table that fires it is not gated like the table it writes:

| | predicate |
|---|---|
| `project_parties_studio_update` (`00584:895-903`) | `EXISTS (… projects p … is_studio_comember(p.designer_id))` — **no tenant leg, no owner/admin leg**. 00624:523 already notes it "tests only the project" |
| `project_party_authority_studio_update` (`00624:1017-1041`) | `is_active_studio_member(project_party_recorded_studio(engagement_id)) AND is_studio_comember(project_party_designer(engagement_id)) AND (scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(project_party_recorded_studio(engagement_id)))` |

The second predicate is not a nicety. It is w1b final review r5 MAJOR-3 and r8 BLOCKING-1 in the
policy text — 00624's own COMMENT (`:874-886`) says the tenant leg exists because
`is_studio_comember(designer)` "is true whenever the caller shares ANY active organization with
the designer of record, so a second studio that designer also works for read every grant and its
money threshold". 00634 routes a write into that table through the one door that never learned it.

### Measured — (a) the PR-n half, inside the tenant

`build/probe-r20-a-plain-member-ends-money.sql`. A plain `member` of the recorded studio
(`b0000000-…-0001`), a `client_rep` seat on the Okonkwo residence carrying the agreement's
$10,000 (`source_clause 'agreement §4'`, R-J):

```
A1  direct UPDATE of the money grant           -> rows=0      (RLS refuses, as PR-n intends)
A1  after                                       money 1000000  effective_to (none)
A2  the SAME member writes the three columns useCloseProjectPartySeat writes
A2  after                                       money 1000000  effective_to 2026-09-15   <- ENDED
```

A member who may not set a money grant has just retired one. Nothing re-opens it: 00634's own
banner (`:59-64`) rules that re-opening is a separate named act, so the principal's delegation is
gone and only an owner/admin can write a new one.

### Measured — (b) the cross-tenant half

`build/probe-r20-b-cross-tenant-ends-money.sql`. The designer of record (`a0000000-…-0004`) owns
two design studios; the job records `b0000000-…-0001`. The caller is a plain `member` of the
**other** one (`9b2e938a-…`) and of nothing else:

```
B0  is_active_studio_member('b0000000…0001') = f
    is_studio_comember(designer)             = t
    project_party_recorded_studio(seat)      = b0000000…0001
B1  authority rows the caller can SELECT      -> 0      (00624's tenant leg holds)
B2  direct UPDATE of the money grant          -> rows=0 (00624's tenant leg holds)
B3  UPDATE project_parties SET stage/off_job_at/off_job_reason -> rows=1
B4  after   money 1000000  effective_to 2026-09-15   off_job_at 2026-09-15
```

A caller who cannot read the row wrote it. That is a cross-tenant write to another studio's money
record, produced by this wave's newest file, on the exact population W1b hardened this table
against.

The seat-close write itself is a pre-existing 00584 leak and not W3's; what is new is that it now
reaches `project_party_authority`, which is the one table in the program that carries a money
figure and the one whose policies were deliberately narrowed twice.

### Why no gate sees it

The trigger has no negative control anywhere. `13d-o`…`13d-s` exercise it only as the seeded
studio's owner (`w3_merge_sweep_household_test.sql:5160-5279`), and r19's cross-tenant census
(review r19 §1) was taken before 00634 existed, so no block asks who may fire it. The W3 suite's
own cross-tenant blocks stop at `add_household_member`, `set_household_threshold`,
`sweep_compliance_expiries`, `studio_contact_merges` and `studio_compliance_notices`.

### Where a fix belongs (not prescriptive)

Three shapes, none settled by this finding:

* **State the gate in the body**, the posture every other SECURITY DEFINER function in this wave
  takes (`add_household_member` `00632:410-416`, `set_household_threshold` `00632:655-666`,
  `archive_studio_contact` `00629:3300-3307`): end grants only when
  `auth.uid() IS NULL` (a migration, a job, service_role — 00632:235's own internal-caller
  carve-out) **or** `is_active_studio_member(project_party_recorded_studio(NEW.id))`, and apply
  PR-n's narrowing to `money` / `draw_certify` — leave those two standing for a caller without
  owner/admin standing at the recorded studio rather than ending them silently.
* **Refuse the close** instead, when the seat carries an open `money` grant and the caller lacks
  the standing to end it — louder, and the failure 00624's COMMENT names ("a wrong grant silently
  over- or under-authorises an approval") argues for it.
* **Narrow `project_parties_studio_update`** with the tenant leg every other table in this program
  took. Correct, and far wider than W3: it is 00584's policy and every seat reader/writer depends
  on it.

The pin belongs beside 13d: the same fixture, closed by (a) a plain member of the recorded studio
and (b) a plain member of the designer's second studio, asserting the money grant's `effective_to`
is untouched in both.

---

## 3. Major

None this round.

---

## 4. Minor

### r20-n1 — NEW: a future-dated `off_job_at` walks the merge carve-out back to r19's state
**minor · high confidence · measured (`build/probe-r20-d-future-dated-close.sql`).**
`00634:84` writes `effective_to = GREATEST(effective_from, NEW.off_job_at)` with no clamp to
`CURRENT_DATE`, and every SQL-side window in the program is `effective_to IS NULL OR effective_to
>= CURRENT_DATE`. So a seat closed with a date 30 days out keeps a **live** grant while
`merge_seat_collision`'s carve-out (`00629:1713-1723`, `pm.off_job_at IS NULL` / `ps.off_job_at IS
NULL`) already reads the seat as closed:

```
D1  close card B's seat with off_job_at = CURRENT_DATE + 30
    seat 44d8f29b…  off_job_at 2026-10-15  money 250000  effective_to 2026-10-15  still_live_to_a_reader t
D2  merge_studio_contacts(A, B, 'phone')  ->  goes through
D3  one human, one job, both grants inside the reader's window:
      f7e0…20d1  off_job_at (none)      money 1000000  agreement §4
      44d8f29b…  off_job_at 2026-10-15  money  250000  client_households.co_threshold_cents
```

Two faces are protected by portal rules rather than by the record: `useProjectAuthority`
(`use-project-authority.ts:76-79`) drops a grant whose `effective_to` is set on a seat carrying
`off_job_at`, and `person-profile.tsx:119-125, :256` routes an `off_job` stage into "Past seats",
which renders no `authorityPhrase`. The room's own act cannot produce the state either —
`roster-row.tsx:533-540` calls `useCloseProjectPartySeat` with no `offJobAt`, so
`use-coordination.ts:866` defaults to today. PostgREST can, and "PostgREST is a writer too" is
this program's own standard (`00624:872-873`).

### r20-n2 — NEW: `usePartyAuthority` never learned r19's rule, so the two authority readers disagree for one day
**minor · medium confidence · read.** r19 taught `useProjectAuthority` that a grant whose
`effective_to` was stamped by its seat leaving the job is history
(`use-project-authority.ts:62-79`). `usePartyAuthority` (`use-coordination.ts:1911-1917`), which
`person-profile.tsx:142` renders every seat's `authorityPhrase` from, still keeps any grant with
`effective_to >= today` and never reads `off_job_at`. Today the divergence is invisible because
`DONE_STAGES` moves an `off_job` seat into the folded "Past seats" region; it becomes visible the
moment `off_job_at` is written without `stage` (r20-n1's population, or any non-room writer). Two
readers of one money fact, one rule between them.

### r20-n3 — NEW: `00631:314` names a trigger body that 00629 replaced
**minor · high confidence · re-read + `pg_get_triggerdef`.** 00631's bracketing note says
"`set_updated_at_project_parties` is a BEFORE UPDATE FOR EACH ROW trigger whose body
(`update_updated_at_column`) sets `NEW.updated_at := now()` **unconditionally**". `00629:1235-1266`
replaced it with `project_parties_touch_updated_at()`, which stands down under
`patina.suppress_party_touch`. Live definition: `EXECUTE FUNCTION project_parties_touch_updated_at()`.
The bracketing still works (the trigger name is deliberately unchanged), but the file's stated
mechanism is a function that no longer runs on this table, and the word "unconditionally" is now
false.

### r20-n4 — NEW: `set_household_threshold()`'s closed-seat branch is now unreachable, and its comment presents it as load-bearing
**minor · high confidence · structural.** `00632:702-716` ends a grant standing open on a closed
seat. After 00634 no such row can be written — the trigger ends it at the close and the one-time
backfill ended the ones already standing — so `v_seat.off_job_at IS NOT NULL` can only be reached
by a row whose seat closed with the trigger disabled. Defence in depth is fine; the 15-line
comment above it reads as the rule that makes r15 MAJOR-1 safe, and 00634 is now that rule.

### r20-n5 — NEW: 00634's own record says "the money it carried" and the trigger ends every scope
**minor · high confidence · read.** The file title (`:2-3`), the banner and the COMMENT
(`:95-102`) argue exclusively about money. The `UPDATE` has no `scope` predicate, so
`selections`, `schedule`, `site_access`, `key` and `draw_certify` end at the close too. That is
probably the right rule — CS5-24 is about delegations, not about money — but the file is the
record of what it does, and a later reader widening or narrowing `money` handling from this banner
would be reasoning off half the behaviour.

### r20-n6 — NEW: no block in any suite asks who may fire 00634's trigger
**minor · high confidence · read.** See §2 "why no gate sees it". Filed separately from the
BLOCKING because the gap survives any of the three fix shapes unless a negative control is written
with it.

### r18-n2 — CARRIED: the household DELETE policy drops the co-member leg its three siblings carry
**minor · high confidence · re-measured from `pg_policy`.** `client_households_studio_delete` reads
`is_active_studio_member(organization_id) AND is_org_admin_or_owner(organization_id)`; `_select` /
`_update` read `is_active_studio_member AND is_studio_comember(designer_id)`. No cross-tenant
delete is reachable, but an owner/admin may DELETE a row the same policy set would not let them
SELECT, and `designer_clients.household_id` is `ON DELETE SET NULL`.

### r18-n3 — CARRIED: a household's two tenancy facts can be written disagreeing
**minor · medium confidence · re-read at `00632:412-416`.** `is_studio_comember(designer_id)` is
true whenever the caller shares ANY active organization with that designer, so a member of X and Y
may INSERT a household with `organization_id = X` naming a designer who belongs only to Y;
`add_household_member()`'s body makes the same pair of tests and accepts it.

### r17-n2 — CARRIED: `source_household_id` carries no tenancy or consistency rule of its own
**minor · medium confidence · re-read at `00632:347-353`.** A bare FK, no CHECK, no trigger tying
the named household's `organization_id` to the seat's recorded studio. No cross-tenant write is
reachable; the worst an owner/admin can do by hand is strand a grant no loop will match.

### n1 — CARRIED: 00628's NOTICE reports the designer-domain-role delta over EVERY stamped project
**minor · high confidence · re-read at `00628:178-182`.** `WHERE p.studio_id IS NOT NULL AND NOT
has_designer_domain_role(p.designer_id)` — every project that has a studio, ever — printed as "%
**stamped** project(s)…". Locally both readings are 0; on Strata it reports the whole book, and the
W7 preflight reads that line.

### n2 — CARRIED: `contact_rule_blocks_contact()` has no caller, and its COMMENT states a rule the file stopped making at r5
**minor · high confidence · re-grepped.** The only files naming it are `00629` itself,
`seed/00-legacy-grants.sql` and the generated `database.types.ts`. Its COMMENT (`00629:934-939`)
says "merge_studio_contacts() refuses on it"; the merge refuses on subsumption instead.

### n3 — CARRIED: `00631:334` cites "w3 block 12", which exists and is about something else
**minor · high confidence · re-read.** 00631's `updated_at` pin is block 7d; block 12 is r15's
closed-seat household block.

### n4 — CARRIED: `add_household_member()` raises the NEIGHBOURING file's raw tokens on both studio doors
**minor · high confidence · re-read at `00632:463-471`.** The seat INSERT runs before any studio is
resolved, so `assert_project_party_cards()` answers first —
`party_studio_contact_other_studio`, `party_card_project_has_no_studio` — while
`household_grant_forbidden` / `household_grant_project_has_no_studio` are defined for one of the
same conditions two statements later.

### n5 — CARRIED: the notice's subject builds a possessive by concatenation
**minor · high confidence · MEASURED LIVE this round (probe-r20-c).** `00630:412-415` produced, in
the notification the principal actually reads: **"Ostrom Builders's paper has lapsed"**. A
notification is a face.

### n6 — CARRIED: three of the branch's own RLS suites fail, and nothing on the branch records it
**minor · high confidence · re-run this round on the freshly reset database** (24 files: 21 pass,
3 fail). `design_requests_test.sql` ("FAIL 3b: expected no_scans, got <none>"),
`field_parties_test.sql` (`consent_legacy_column_frozen` — R-AX/R-AY working as ruled, the suite
never updated), `studio_titles_test.sql` ("FAIL f: demoting the sole active owner should raise
last_owner_protected"). None is W3's; the second is this program's own ruling with no test note.

### n7 — CARRIED: the merge's note about what a rule leaves behind names two of three columns
**minor · high confidence · re-read at `00629:2216-2221`; `escalation_by_class` appears 0 times in
the file.**

### n8 — CARRIED: the seat guard covers two of the seat's four card pointers
**minor · high confidence · re-read from `pg_trigger`.** `assert_party_card_not_merged_trg` is
`BEFORE INSERT OR UPDATE OF studio_contact_id, company_id`; `warranty_contact_person_id` is not in
the list. `bid_quoted_by_person_id` is covered by 00631's own guard.

### n9 — CARRIED: the studio-less / other-studio pre-checks enumerate three of the four card pointers
**minor · high confidence (the gap) · low confidence (reachable today).** Population empty today:
0 seats on the five studio-less projects (measured again this round).

### m1 — CARRIED: the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · re-grepped.** `archived_at` appears **0** times in
`00630_compliance_expiry_sweep.sql`; the document loop carries `sc.merged_into IS NULL` and no
archived leg.

### m2 — CARRIED: deleting a household, or dropping a member from the array, orphans the grants it sourced
**minor · high confidence · structural.** `source_household_id` is `ON DELETE SET NULL`, so the id
goes and the clause stays; `set_household_threshold()` is the only closer and it keys on the member
array.

### m3 — CARRIED: `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · re-measured (`proconfig` NULL for it, `search_path=public` for the other
twenty-one).** SECURITY INVOKER and fully schema-qualified, so the exposure is narrow — but it is
granted to `authenticated` and called twice per emitted Directory row from inside
`identity_paper_state()`.

### m4 — CARRIED: `w3-data-report.md:132` says "33 papers in total" where the database says 36
**minor · high confidence · re-measured post-reset: `count(*) FROM studio_compliance_documents` = 36.**

### m5 — CARRIED: the `project_consent_org()` enumeration describes one call site inaccurately
**minor · medium confidence · re-read at `00629:3031-3036`.** `00628:56-80` and report §6 say all
twelve are "the CONSENT LEDGER'S KEY — not a guard and not a reducer"; that branch is a membership
GUARD (`CASE WHEN is_active_studio_member(project_consent_org(q0.project_id)) THEN …`) on whether
the word renders. The behaviour is right and deliberate; the sentence enumerating it is not.

### m6 — CARRIED: two small internal inconsistencies in 00629
**minor · high confidence · re-read.** `v_merge_id` is declared (`:1287`), assigned by the final
`RETURNING` (`:2619`) and never read. `studio_contact_merges`' COMMENT says "a merge that happened
is a fact nobody may forge or take back" beside `GRANT SELECT, INSERT, UPDATE, DELETE … TO
service_role`.

### m7 — CARRIED: `people_directory`'s own COMMENT was not re-issued
**minor · high confidence · re-measured post-reset.** The live comment still opens "R57 / People
Room roster (client|lead|maker|…)" — 00626's text. `CREATE OR REPLACE VIEW` keeps the existing
comment, so neither declared delta (the merged-card fold at `00629:3269`, the TEAM branch's tenant
leg at `00629:3168`) reaches the object's own record.

### m8 — CARRIED: `identity_paper_state()` runs four recursive walks per emitted Directory row
**minor · medium confidence.** Two `resolve_merged_contact()` walks (depth cap 16) on top of two
`compliance_state()` walks (depth cap 64), once per CONTACTS row and once per PARTY row.

### m9 — CARRIED and WIDENED AGAIN: `w3-data-report.md` is stale in at least eighteen places
**minor · high confidence · re-measured.** The report still says "12 blocks as of r7"; it now
predates rounds 8 through 19 **and the whole of 00634**. New drifts this round, on top of r19's
fifteen:

16. **§0's migration table lists six files and never names `00634`** — the wave's seventh
    migration, the one that makes `merge_seat_collision`'s carve-out true.
17. **§9's RPC/trigger list omits `end_party_authority_at_seat_close()`**, and §8's gate table
    predates it.
18. **§10.6 — "`sweep_compliance_expiries()` has never run against the seeded book outside a
    rolled-back transaction"** — it has now (probe-r20-c, and this database carries three committed
    notices and six notifications from a run at 13:20:59Z), and §2's projected table is confirmed
    except Lakeshore's date, which is seed-relative (2026-10-08 measured, 2026-10-06 stated).

Also re-confirmed from r19's list: "Eleven, not eight" refusals against fourteen tokens; no mention
of `merge_seat_collision`; "plus one line" on `people_directory` against two deltas;
`project_parties_touch_updated_at()` and `contact_rule_blocks_contact()` absent; "2752 replayed
statements" against a measured 2767; "301 insertions, 0 deletions" against a `db:generate` that now
produces no diff; `source_household_id` absent (0 hits); §7.2/§10.1 still arguing about a TEAM
tenant leg that shipped.

### m11 — CARRIED: 00628's backfill bumps `projects.updated_at` for every project it repairs
**minor · low confidence.** `00628:117-122` does not bracket `update_projects_updated_at`, where
`00631:335/404` brackets its own. Nothing in this program ranks by `projects.updated_at`.

### m12 — CARRIED: a notice is SPENT even when nobody was told
**minor · high confidence (mechanism) · narrow population.** `00630:399-409` writes the notice row
and increments `v_notices` first; `:454-486` then writes one `notification_log` row per active
owner/admin and never checks that any landed. A studio whose only active members are plain
`member`s has the `(document_id, state, expires_on)` key permanently consumed while `v_notified`
stays 0.

### m13 — CARRIED: after a firm-to-firm fold an uncarded seat's Directory row names the folded card's spelling
**minor · high confidence.** `project_parties.company_name` is a free-text snapshot the merge never
writes; `00629:2496-2504` argues the case for the CROSS fold, and on a same-kind firm fold the
argument does not carry.

### m14 — CARRIED: 00630's `merged_into` leg describes merge behaviour that r3 replaced
**minor · high confidence · re-read at `00630:381-393`.** The comment says the merge "leaves an
absorbed document on the absorbed card wherever the survivor holds no successor to retire it …
correctly"; 00629 moves every absorbed head unconditionally. The leg is pure defence in depth; the
comment states it as load-bearing.

### m15 — CARRIED: neither household door reads `archived_at`
**minor · medium confidence · re-measured (`archived_at` appears 0 times in
`00632_client_households.sql`).** A card `useStudioContacts(…, { includeArchived: false })` hides
can still be made a household member and seated on a job — the shape `merge_survivor_archived`
(r5 M-4) exists to refuse one table over.

### m16 — CARRIED: the report omits `source_household_id` — see m9.

---

## 5. What was checked and found sound (not findings)

* **The reset replays clean and all three people suites pass**, re-run from a full
  `supabase:reset` this round; the W3 suite run twice leaks no committed row.
* **Types and legacy grants both regenerate with no diff** (2767 replayed statements).
* **Numbering**: `00628`–`00634`, all above `00627`, none inside the reserved `00595`–`00620`;
  banner + LINEAGE + idempotence on every file, including 00634 (`CREATE OR REPLACE`,
  `DROP TRIGGER IF EXISTS`, and a backfill whose second run finds no `effective_to IS NULL` row).
* **The merge is transactional and orphans nothing.** All twenty FK columns into `studio_contacts`
  (`pg_constraint`) are repointed, reduced or deliberately left, plus the two polymorphic pointers
  (`studio_contact_rules.subject_id`, `studio_compliance_documents.holder_id/holder_type`) and the
  one array (`client_households.member_person_ids`). Blocks 1–13d pass.
* **`merged_into` is the RPC's alone** — `assert_merged_into_write()` (`00629:152-262`) refuses
  every other writer, owners, admins and service_role included, and restates the survivor-exists /
  same-studio / legal-kind rules for every writer. The FK's `ON DELETE SET NULL` is the one
  exempted clear.
* **No company into a person** except crm-model §4's sole-proprietor exception, one direction,
  enforced in both the RPC (`merge_kind_mismatch`) and the column trigger.
* **`merged_into` resolved by `people_directory`**: CONTACTS carries `AND sc.merged_into IS NULL`
  (`00629:3269`), TEAM carries the tenant leg (`00629:3168`), `resolve_merged_contact()` maps the
  old id forward (PR-o), and both ids stay resolvable.
* **The sweep**: idempotent, locked (`pg_try_advisory_xact_lock`), schema-qualified,
  `service_role`-only, one `job_runs` row per invocation with `skipped` on contention; the cron is
  guarded (`EXISTS` before `cron.unschedule`), its body is `SELECT public.sweep_compliance_expiries();`
  and the registry COMMENT is extended. **Recipients are owners and admins only — measured, 3
  notices → 6 notifications, 0 to the plain member.**
* **Households RLS**: all four policies carry the tenant leg; owner/admin on DELETE and on any write
  carrying `co_threshold_cents`; `assert_household_threshold_principal()` reads the CHANGE, so an
  ERASE is refused too. R-BQ holds: `set_household_threshold()` opens nothing.
* **Court widening is purely additive** (eleven words, a strict superset) and `project_tasks.owner`
  is deliberately not widened.
* **00628's backfill** leaves zero and several both NULL (5 local studio-less projects, all
  ambiguous, 0 carrying seats), is idempotent on `studio_id IS NULL`, and does not bypass
  `set_project_studio_id()`.
* **`project_consent_org()`**: twelve callers, all the consent ledger's key; **no policy** and no
  guard-or-reducer among them. R-BD's retirement is complete as ruled.
* **Consent is record-only (R-AY)**: no W3 migration reads or writes consent for a verdict; the two
  `sms_consent_*` tokens are output keys over `identity_consent_status()`.
* **Money is integer cents** everywhere new (`bid_amount_cents`, `co_threshold_cents`,
  `threshold_cents`), each with a `>= 0` CHECK; vocabularies are named CHECK constraints, never
  enums.
* **Archive gating**: `archive_studio_contact()` / `restore_studio_contact()` are owner/admin only,
  restate 00417's rule in the body because SECURITY DEFINER bypasses the policy, are idempotent,
  and answer `studio_contact_not_found` to a non-member so the door leaks no card ids.

---

## 6. Probes written this round

Beside this file under `artifacts/people-room-crm-2026-09-11/build/`, one transaction each,
ROLLBACKed, on the freshly reset database:

* `probe-r20-a-plain-member-ends-money.sql` — §2(a): a plain member of the recorded studio cannot
  write the money grant and ends it by closing the seat.
* `probe-r20-b-cross-tenant-ends-money.sql` — §2(b): a plain member of the designer's SECOND studio
  cannot even SELECT the grant and ends it by closing the seat.
* `probe-r20-c-sweep-against-the-book.sql` — the sweep run against the seeded book: the three
  notices, the six owner/admin notifications, the `job_runs` rows, the cron entry, and the 36-paper
  count (m4, n5, m9 item 18).
* `probe-r20-d-future-dated-close.sql` — r20-n1: a future-dated close leaves the grant live and the
  fold goes through.
