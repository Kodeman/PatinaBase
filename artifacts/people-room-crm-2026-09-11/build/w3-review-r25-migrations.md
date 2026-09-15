# W3 (P2) — adversarial migration review, round 25

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `9a9d11d6e`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No migration minted. No portal source changed. No server started. No port taken.**
Every write in this round was made inside a transaction and ROLLBACKed.

**Verdict: CLEAN — ZERO BLOCKING, ZERO MAJOR. Twelve minor (eleven carried open from r24, one new).**

Nothing under `supabase/`, `packages/`, `apps/`, `services/` or `scripts/` changed between r24's HEAD
(`96fcc861b`) and this one: `git diff --stat 96fcc861b..HEAD` touches three files, all under
`artifacts/.../build`. So the seven migrations are byte-identical to the set r24 reviewed, and r24's
eleven open minors are all re-measured OPEN below. The round's work was therefore (a) re-running
every gate against a freshly reset database, (b) re-measuring every figure `w3-data-report.md`
states, and (c) a fresh pass looking for a defect twenty-four rounds have not filed. One new minor
came out of (c).

---

## 1. Gates run this round (all green)

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` | **clean** ×2 — "Finished supabase db reset on branch main." |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` | **All W1a assertions passed.** (`EXIT=0`, 0 `ERROR` lines) |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` | **All W1b assertions passed.** (`EXIT=0`, 0 `ERROR` lines; see §4 for one transient) |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | **W3 SQL suite: all blocks passed** — 21 numbered blocks, `13f` last |
| `python3 scripts/generate-legacy-grants.py` | **no diff** — "baseline + **2767** replayed statements"; `git status --porcelain -- supabase/seed/00-legacy-grants.sql` empty afterwards |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `pnpm --filter @patina/supabase type-check` | clean (`EXIT=0`) |
| `pnpm --filter designer-portal type-check` | clean (`EXIT=0`) |
| migration numbering | wave head `00634`; nothing in the reserved `00595`–`00620`; nothing minted below `00621`; `git status --porcelain -- supabase packages apps services scripts` empty |

### Every figure `w3-data-report.md` states, re-measured against the freshly reset database

| Report claim | Measured |
|---|---|
| §1 "seventeen `RAISE EXCEPTION` sites over fifteen distinct tokens" | `grep -cE "RAISE EXCEPTION 'merge_[a-z_]+'"` = **17**; `sort -u` = **15** |
| §1 / §9 the portal map holds the same fifteen | `MERGE_REFUSAL_SENTENCES` (`use-studio-contacts.ts:1925-2000`) = **15** keys; `comm` against the token list shows **no token missing and no extra key** |
| §0 "21 numbered blocks, 13f last" | `1 1b 1c 2 2b 3 4 5 6 7 8 9 10 11 12 13 13b 13c 13d 13e 13f` = **21**, `13f` last |
| §2 "36 papers: 9 current, 24 held, 2 lapsed, 1 lapses_soon" | 36 / 9 / 24 / 2 / 1 |
| §2 the three swept papers, their dates and their sentences | Ostrom Builders 2025-12-31 `lapsed`; Northgate Electric 2026-03-31 `lapsed`; Lakeshore Painting Co. 2026-10-08 `lapses_soon` |
| §2 / §10.6 "3 notices and 6 in-app notifications" | `{"notices":3,"scanned":3,"notified":6}`; the holding studio holds exactly 1 `owner` + 1 `admin` active |
| §6 "8 projects, 3 stamped, 5 NULL, 5 ambiguous, 0 carrying seats" | 8 / 3 / 5; each of the five designers-of-record holds **2** active design-studio memberships; **0** seats on any of the five |
| §6 "twelve `project_consent_org()` callers, every one the ledger key" | **12** — 8 functions, 4 views, **0 policies** (enumerated from `pg_proc.prosrc`, `pg_get_viewdef`, `pg_policies`); the same twelve names §6 lists |
| §7 "the TEAM branch's tenant leg SHIPPED" | present in `pg_get_viewdef(people_directory)`: `is_active_studio_member(project_tenant_org(tm.project_id)) OR pj.designer_id = auth.uid() OR …` |
| §8 "the wave's highest hand number is 00634" | correct |

### Posture, read from the catalog rather than from the files

* **`search_path`** — 21 of the wave's 22 functions carry `search_path=public`
  (`link_rolodex_card_to_parties` carries `public, pg_temp`). The one exception is
  `resolve_merged_contact`, `proconfig` NULL — §3 m1.
* **Grants** — no wave function is EXECUTE-able by `PUBLIC` or `anon`. `sweep_compliance_expiries`
  is `service_role` only. Every trigger function (`assert_merged_into_write`,
  `assert_party_card_not_merged`, `assert_party_bid_quoted_by`, `assert_client_household_members`,
  `assert_household_threshold_principal`, `clear_compliance_notices_on_date_change`,
  `end_party_authority_at_seat_close`, `project_parties_touch_updated_at`,
  `rolodex_card_for_party_phone`, `link_rolodex_card_to_parties`) holds **no** `authenticated` grant.
* **RLS** — `client_households`, `studio_compliance_notices`, `studio_contact_merges` all
  `relrowsecurity = t`. `authenticated` holds `SELECT` only on the two append-only tables;
  the households table's four policies all carry the tenant leg beside
  `is_studio_comember(designer_id)`, with `is_org_admin_or_owner` on any write carrying
  `co_threshold_cents` and on DELETE.
* **Cron** — `cron.job` holds `compliance-document-expiry-sweep` at `0 6 * * *`, body
  `SELECT public.sweep_compliance_expiries();` (schema-qualified), unschedule guarded by `EXISTS`.
* **Court** — `client_decisions_court_check` admits the eleven words; 6 live rows, **0** invalid.
* **Money is integer cents** — `project_parties_bid_amount_check` (`>= 0`),
  `client_households_threshold_check` (`>= 0`), `threshold_cents` unchanged.

### Consent is untouched (R-AY), measured

`grep -E '(INSERT INTO|UPDATE|DELETE FROM)\s+public\.studio_channel_consent'` over 00628–00634:
**no match**. The only `sms_consent_` appearances in the wave are `00629:3117`
(`meta->>'sms_consent_status'` populated from `q.consent_word`, i.e. the RECORD) and two comments at
`:3156` / `:3161` saying exactly that. No frozen `project_parties.sms_consent_*` column is read for a
verdict anywhere in the wave. `record_channel_consent` still has its three writers
(00593 / 00594 / 00622) and no fourth.

### Tenant isolation, probed directly

As `cf100000-…-0001` (a member of no Patina design studio), against Local Dev Studio's rows:
`client_households` / `studio_contact_merges` / `studio_compliance_notices` / `people_directory` /
`studio_channel_consent` → **0 rows each**; `resolve_merged_contact` → NULL;
`compliance_document_state` → NULL; `merge_studio_contacts` → `merge_not_a_member`;
`archive_studio_contact` → `studio_contact_not_found` (never a different error, so no card id leaks);
`sweep_compliance_expiries` → `permission denied for function`; a raw
`INSERT INTO studio_contact_merges` → `permission denied for table`; a raw
`UPDATE studio_contacts SET merged_into = …` → **0 rows** (RLS), and the same PATCH as the studio's
own **owner** → `studio_contact_merge_pointer_forbidden`. Both halves of r2 B2-1 hold.

### The merge orphans nothing (the sole-proprietor fold, which r24 did not walk)

r24 walked a person→person fold. This round walked crm-model §4's one cross-kind exception:
`d0e20000-…-0003` **Northgate Electric** (company) into `d0e10000-…-0011` **Dana Kowalski**
(person, `is_sole_proprietor`), as the studio owner, ROLLBACKed
(`build/probe-r25-b-soleprop-fold.sql`):

```
dangling FK refs across all 9 card-pointer columns   0
directory rows for the folded card (read as postgres, RLS bypassed)  0
survivor's Directory row                Dana Kowalski · Northgate Electric
compliance documents on the survivor    3        still on the folded card  0
studio_contact_merges rows              1
resolve_merged_contact(old id)          d0e10000-…-0011
```

The firm's name, its paper and its lineage all land on the survivor; the folded card leaves the room
and stays resolvable. Nothing is orphaned.

---

## 2. r24's findings, re-checked at HEAD

r24 returned **clean** (zero blocking, zero major) and filed eleven minor. `w3-fix-log-r24.md`
records that round's only fix as documentation drift in `w3-room-report.md` — "Nothing under `apps/`,
`packages/`, `supabase/` or `services/` was touched by this fix" — so none of the eleven was
addressed. All eleven are **OPEN**, each re-measured below rather than re-read. r23's two majors
stay **FIXED** (the `merge_seat_authority_collision` DETAIL/HINT still names the dated seat at
`00629:1828-1870`, and block `13d` still walks that repair end to end and passes).

---

## 3. Minor

### Carried open from r24 (all eleven, re-measured this round)

**m1 · `resolve_merged_contact(uuid)` pins no `search_path`.** *Severity: minor. Confidence: high
(read from `pg_proc.proconfig`).* It is the only one of the wave's 22 functions with a NULL
`proconfig`; the other 21 all carry `search_path=public`. SECURITY INVOKER, and its two in-wave
callers (`rolodex_card_for_party_phone`, `identity_paper_state`) both pin their own, so a nested call
inherits a pinned path — the exposure is the direct `authenticated` call over PostgREST, where the
callee is still INVOKER and escalates nothing. `00629:386-403`.
**Fix:** add `SET search_path TO 'public'` to the `CREATE OR REPLACE FUNCTION` at `00629:386-403`.

**m2 · `add_household_member()` on a studio-less job raises 00624's token, not 00632's own
refusal.** *Severity: minor. Confidence: high (re-measured this round, ROLLBACKed,
`build/probe-r25-c-household-studioless.sql`).* On `Aspen Loft Refresh` as the studio owner, with a
household carrying `co_threshold_cents`:
`add_household_member(h, card, 'client_rep', <studio-less job>)` → `party_card_project_has_no_studio`,
and `…, 'client', …` → the same. Both come from the seat INSERT at `00632:464-470`, before
`household_grant_project_has_no_studio` at `:482-487` can run, so 00632's own named refusal is
unreachable on both ordinary paths and `HOUSEHOLD_REFUSAL_SENTENCES
.household_grant_project_has_no_studio` is dead there.
**Fix:** move the `project_party_recorded_studio()` check above the seat INSERT, or widen
`household_grant_project_has_no_studio`'s sentence to cover the seat case.

**m3 · The sweep's notification renders a double possessive.** *Severity: minor. Confidence: high
(re-measured on the seeded book this round).* `00630:412-415` concatenates `v_holder || '''s …'`
with no rule for a holder name already ending in `s`. Measured subject line, in full:
`Ostrom Builders's paper has lapsed`. It reaches an in-app notice the principal reads.
**Fix:** `v_holder || CASE WHEN right(v_holder,1) IN ('s','S') THEN '''' ELSE '''s' END`.

**m4 · 00634's one-off backfill contradicts the clamp it sits beside.** *Severity: minor.
Confidence: high (read).* `00634:267-273` ends every open grant on every seat with
`off_job_at IS NOT NULL` — including a seat dated by a recorded withdrawal, the one population R-BS
rules must KEEP its open grants. No-op on a first apply (`off_job_at` and `bid_outcome` ship in one
chain; locally the NOTICE reports 0), so the reach is a re-apply over a book that has since used the
Bidding band.
**Fix:** add `AND COALESCE(pp.bid_outcome,'') <> 'withdrawn'` to the backfill's WHERE, or say in the
banner why the backfill deliberately does not honour the clamp.

**m5 · `contact_rule_blocks_contact()` still has no caller, and its COMMENT still misstates the
merge.** *Severity: minor. Confidence: high (re-grepped at HEAD).*
`grep -rln contact_rule_blocks_contact supabase packages apps` returns only
`00629_studio_contact_merges.sql`, `seed/00-legacy-grants.sql` and `database.types.ts`. Its COMMENT
(`00629:946-947`) says `merge_studio_contacts()` "refuses on it", while the merge in fact refuses on
**subsumption** (`00629:1502-1517`, widened away from R-BL's formula at r5 M-2).
**Fix:** correct the COMMENT, and either drop the function or name the caller it is waiting for.

**m6 · 00631's prose names a trigger body that is no longer there.** *Severity: minor.
Confidence: high (re-read).* `00631:315` and `:327` both name `update_updated_at_column()` as the
body behind `set_updated_at_project_parties`, which `00629:1248-1279` replaced with
`project_parties_touch_updated_at()` — confirmed in `pg_get_triggerdef`. The bracketing
`DISABLE`/`ENABLE TRIGGER` at `00631:335`/`:404` still names the right object, so nothing is broken.
**Fix:** rename in the two comments.

**n1 · The wave's own files still say it is a six-migration wave.** *Severity: minor. Confidence:
high (read, line 2 of each file).* `00628:2` … `00633:2` read "W3/P2 (1 of 6)" … "(6 of 6)", and
`00634:2` carries no position at all ("W3/P2 (r19 MAJOR-1)"). Anyone counting the wave from the
migration folder — which is what the W7 deploy preflight does — reads six of seven, and the one file
that gates money on a seat close is the one with no number.
**Fix:** renumber the seven banners "(n of 7)".

**n2 · 00634 states, twice, an absolute invariant its own clamp removed.** *Severity: minor.
Confidence: high (read).* `00634:146-147` — "The invariant holds absolutely in every path: NO closed
seat carries an open grant." — and the closing clause of `COMMENT ON FUNCTION
end_party_authority_at_seat_close()` (`00634:228-230`) — "…so no closed seat can ever carry an open
grant." Both are false for the withdrawal path, which the *same* COMMENT states plainly twelve lines
earlier and which 00629's fourth pre-check exists entirely to catch. This is the precise sentence
whose staleness cost r22 a measured MAJOR.
**Fix:** strike both, or scope them to the hand-close act.

**n3 · `merge_seat_on_studioless_project`'s HINT names an act with no door.** *Severity: minor
(Fable may escalate). Confidence: high on the fact.* The HINT reads "Record that job's studio first,
then merge." (`00629:1585-1587`). Nothing in any portal writes `projects.studio_id`; the only writer
is 00317's `set_project_studio_id()` trigger, whose derivation cannot resolve an ambiguous designer
either — and 00629's own comment two dozen lines above says so. After 00628 the remaining population
is exactly the ambiguous residue R-BI rules *listed*, so a duplicate pair with a seat on one of those
jobs is unfoldable. Filed minor because the population is **0 on the local book** (measured again this
round: 5 remaining studio-less projects, all with `n_orgs = 2`, **0 carrying seats**), the refusal is
correct and safe, and R-BI already owes Kody the Strata count with the W7 preflight.
**Fix:** name an act the room has, or say plainly that the pair cannot be folded until the job's
studio is recorded and that R-BI's preflight is where that happens.

**n4 · The sweep skips a card the room FOLDED, but not one the studio PUT AWAY.** *Severity: minor.
Confidence: **high** — r24 filed this at medium because no archived gating holder existed in the seed;
it is MEASURED this round.* `00630:393` carries `AND sc.merged_into IS NULL` and nothing beside it
about `sc.archived_at`. Probe (ROLLBACKed, `build/probe-r25-a-archived-holder-sweep.sql`): archive
one of the three gating holders, clear the notice ledger, re-run the sweep →
`{"notices":3,"scanned":3,"notified":6}`, of which **1 notice is for the archived holder**, with an
in-app notification to every owner and admin and a deep link to a card
`useStudioContacts(…, { includeArchived: false })` does not return. Milder than the merged case —
`people_directory` does emit an archived card's row (`meta.archived_at`), so the link resolves — and
the unique key means it is said once, not nightly.
**Fix:** add `AND sc.archived_at IS NULL` beside the `merged_into` leg, or record in the banner why
archival is deliberately not a reason to stay silent.

**n5 · Deleting a household strands the money grants it sourced, with no act that can move or end
them.** *Severity: minor. Confidence: high on the mechanism (read + grants read), low on
reachability.* `authenticated` holds DELETE on `client_households` behind an owner/admin policy
(`00632:302-312`, confirmed in `pg_policies` this round), and
`project_party_authority.source_household_id` is `ON DELETE SET NULL` (`00632:347-349`). After such a
delete the seat's open `money` row keeps `source_clause = 'client_households.co_threshold_cents'` and
its `threshold_cents` with `source_household_id` NULL, so `set_household_threshold()` can never move
it again (its loop asks both legs, `00632:680-685`) and `add_household_member()` treats it as a
foreign grant (`:541-542`). **No door in the room reaches it**: no delete hook for
`client_households` exists anywhere in `packages/supabase/src` or `apps/designer-portal/src`.
**Fix:** withhold DELETE from `authenticated` until the room has a delete act that ends the grants
first, or say in the column's COMMENT that a deleted household's grants are the studio's to end by
hand.

### New this round

**o1 · Two of the five card pointers the merge repoints accept a card that was merged away; their
three siblings refuse it.** *Severity: minor. Confidence: high (measured, ROLLBACKed,
`build/probe-r25-d-stale-merged-pointers.sql`).*

`assert_party_card_not_merged_trg` is `BEFORE INSERT OR UPDATE OF studio_contact_id, company_id`
(`00629:479-482`) and 00631 added the same leg for `bid_quoted_by_person_id`
(`assert_party_bid_quoted_by`, `00631:205-208`). Neither covers
`project_parties.warranty_contact_person_id`, and nothing covers
`studio_contacts.{paperwork_contact_person_id, signer_person_id, site_contact_person_id}` —
`grep -n merged_into supabase/migrations/00624_*.sql supabase/migrations/00592_*.sql` returns
**nothing** in either file. Measured after a real fold (Pete Rusk `…0012` into Erin Sato `…0008`), as
the studio owner:

```
(a) project_parties.studio_contact_id      -> merged card   refused: party_card_merged_away
(b) project_parties.warranty_contact_person_id -> merged     LANDED  (no guard)
(c) studio_contacts.signer_person_id       -> merged card    LANDED  (no guard)
(d) client_households.member_person_ids    -> merged card    refused: household_member_not_a_live_person_card
(e) project_parties.bid_quoted_by_person_id -> merged card   refused: party_bid_quoted_by_merged_away
```

The merge itself repoints both columns (`00629:2648-2656`, `:2601-2611`), so the state is only
reachable by a later write carrying a stale id — which is precisely the sequence
`assert_party_card_not_merged()`'s own COMMENT names ("this catches the later write that carries a
stale id", `00629:475-476`) and which 00631 added its fourth leg for. The face consequence is
bounded and not a wrong fact: `directory-view.tsx:236-239` builds the payee marker from
`useStudioContacts`, which filters `merged_into` (`use-studio-contacts.ts:217`), so a firm row whose
`signer_person_id` names a folded card prints **no** "Signs:" marker at all, and
`company-card.tsx:937` prints **"Signs: on file"** in place of the name the studio typed — r7 B-1's
harm, reached through a different door. `warranty_contact_person_id` has no production reader in the
designer portal today (grep returns types and test fixtures only), so its half is latent.

Filed minor rather than major because no room act produces the write (every picker is sourced from a
`merged_into`-filtered read), nothing cross-tenant or money-bearing is reachable through it, and the
worst measured face is a degraded label rather than a false one.
**Fix:** widen `assert_party_card_not_merged_trg` to `UPDATE OF studio_contact_id, company_id,
warranty_contact_person_id` and add the warranty leg to the function body; add a `merged_into` leg to
`assert_studio_contact_designations()` (00592) for the three designation columns.

---

## 4. Two notes that are not findings

**(a) The shared local box is actively contended, and it moved a measurement once.** On the first of
this round's two resets, the loop `w1a → w1b → w3` failed in W1b at
`3l expected 28 person cards, got 30` (`w1b_compliance_authority_directory_test.sql:820`). It did not
reproduce: the same suite passed immediately afterwards and passed again on a second full
`supabase:reset`, and `studio_contacts` held exactly **28** person cards for that studio every time I
looked. The cause is another session on the shared database, and it is directly evidenced rather
than assumed — `job_runs` now holds a **committed** `compliance-document-expiry-sweep`
`succeeded` row at `2026-09-15 17:51:12Z` (id **10**, with ids 2–9 consumed and rolled back), plus 3
committed `studio_compliance_notices` rows, none of which this round wrote: every sweep call here was
inside a `BEGIN … ROLLBACK`, `cron.job_run_details` shows no run of the `0 6 * * *` job, and all three
suites are single `BEGIN … ROLLBACK` files (0 `COMMIT` statements between them). Same residue r23 §4
and r24 §4 recorded. Logged so round 26 does not file it as a product defect — and so that a future
round treating a one-off suite failure on this box as a finding re-runs it first.

**(b) `w3-data-report.md` needed no correction this round.** Every figure §1's own "How to re-measure
this file" block names, plus §0, §2, §6, §7 and §8, was taken again against the freshly reset database
and all of them are right (§1's table above). This is the first round since r19 in which the report's
counts did not move.

---

## 5. Scope note

This is the migration lane. The code and QA lanes' own gates (`admin-portal build`, the jest and
vitest suites, the Playwright walks) were not re-run here; the two type-checks the report cites were,
and both pass. `w3-review-r24-code.md` and `w3-review-r24-qa.md` both returned clean.
