# W3 (P2) — adversarial migration review, round 11

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `42ddf0aa4`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full: `00628`–`00633`; the grafted bodies they re-issue (`assert_compliance_holder` 00623,
`sync_person_affiliation_from_pointer` 00592, `rolodex_card_for_party_phone` /
`link_rolodex_card_to_parties` / `identity_paper_state` 00626); `people_directory` v4 and v5;
`supabase/tests/people/w3_merge_sweep_household_test.sql`; `w3-data-report.md`; `w3-fix-log-r10.md`;
`w3-review-r10-migrations.md`; `rulings.md`; `direction.md` §3.1/§3.4/§5/§7/§8/§9;
`crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a-report.md`, `w1b-report.md`,
`w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md` §4.

**Verdict: NOT clean — zero blocking, TWO major, eight minor.**

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | rc=0, clean replay, head **00633** (`supabase_migrations.schema_migrations`). The CLI's `~/.supabase/telemetry.json` write still needs the sandbox off — harness, not product |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." (26 blocks) |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "11g. r10 BLOCKING-1 … passed", "W3 SQL suite: all blocks passed" |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff** (baseline + 2765 replayed statements) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| `cron.job` after the clean reset | `compliance-document-expiry-sweep · 0 6 * * * · active`, body `SELECT public.sweep_compliance_expiries();` |
| migration numbering | 00628–00633, all above 00627, none inside the reserved 00595–00620 |
| code-only diff `people_directory` 00626 → 00629 | **exactly two deltas**: the TEAM branch's tenant leg and the CONTACTS branch's `AND sc.merged_into IS NULL`. Re-derived mechanically this round; nothing else moved |
| function ACLs (`pg_proc.proacl` / `proconfig`) over all 20 wave functions | no `anon`, no `PUBLIC`; every DEFINER pins `search_path=public`; `sweep_compliance_expiries` is service_role-only; trigger functions hold postgres/service_role only. One deviation, m3 below |
| every FK into `studio_contacts` (20, from `pg_constraint`) | each is repointed by the RPC, structurally unreachable, or a declared freeze (a SENT `studio_trade_agreements.contact_id`, 00579) |
| R-AY (record-only consent) | no W3 migration reads or writes `project_parties.sms_consent_*`; the only occurrences (`00629:2578-2579`) are metadata KEY names carrying record-derived values |
| depth caps | `compliance_state()` (00623) and `compliance_document_state()` (00630) both cap at 64 — the two reckonings cannot disagree on a deep chain |

### Every r10 finding re-checked

| r10 | State |
|---|---|
| **BLOCKING-1** — the sole-proprietor fold blanked the firm's paper word on the rest of the crew | **FIXED, and verified independently of the suite.** My own probe (fresh reset, rolled back): a firm `coi_gl` lapsed 2026-03-31 gating `{site_access,payment,draw}`; crew member's `people_directory.paper_state` reads `lapsed` **before** the fold and `lapsed` **after**, firm name `R11 Northgate Probe` on both, survivor `lapsed`. §4f (`00629:1137-1156`) resolves BOTH ids through `resolve_merged_contact()` in the one reader, so `people_directory_seats` (`00626:2169`) picks it up with no view change |
| m1 — the nightly sweep announces paper held by an ARCHIVED card | **OPEN** (deliberately — r10's fix log says every minor was left). Re-measured below |
| m2 — deleting a household, or dropping a member, orphans the money grants it sourced | **OPEN.** Re-measured below |
| m3 — `resolve_merged_contact()` has no pinned `search_path` | **OPEN.** `pg_proc.proconfig` is empty for it and `{search_path=public}` for all nineteen others in the wave |
| m4 — the report says "33 papers in total" where the breakdown says 36 | **OPEN.** `w3-data-report.md:132` still reads 33; the database says `current` 9, `held` 24, `lapsed` 2, `lapses_soon` 1 = **36** |
| m5 — "every one is the ledger's key, not a guard" is not quite true of `people_directory` | **OPEN.** `00629:2646-2649` still wraps the consent word in `CASE WHEN is_active_studio_member(project_consent_org(q0.project_id))`, which is a visibility guard |
| m6 — `v_merge_id` unused; the lineage COMMENT vs the `service_role` grant | **OPEN.** `00629:1209` / `:2245` (assigned, never read); `00629:300` vs `:344` |

---

## 2. MAJOR-1 — a person-to-person merge replaces the survivor's RESOLVED firm name with the absorbed card's free-text snapshot

**Severity: major. Confidence: high (measured, fresh reset, rolled back).**

`supabase/migrations/00629_studio_contact_merges.sql:1699` — the `company_name` leg of §5's
contact-facts COALESCE, added by r9 B-2 for the sole-proprietor fold and sitting in the **shared**
path above the `v_cross` branch, so it also runs on every person-into-person merge.

### What happens

`people_directory`'s CONTACTS branch resolves a carded human's firm name as
`COALESCE(NULLIF(btrim(sc.company_name),''), firm.company_name, firm.full_name)` (`00629:2825-2830`)
— the free-text column FIRST, the firm card the pointer names second. That precedence is QA-1's own
(w2 r5): it exists because `studio_contacts.company_name` on a PERSON row is 00417's typed-by-hand
snapshot and the firm card is the fallback.

The merge now writes that snapshot forward: when the SURVIVOR's `company_name` is blank and the
ABSORBED card carries one, the survivor takes it — and it then outranks the firm card the
survivor's own `company_id` still names.

`usePromoteToStudioContact()` (`packages/supabase/src/hooks/use-studio-contacts.ts:646`) stamps
`company_name` from the seat's free text on **every** promotion, so the population is not
hypothetical: a card minted through the Add-a-person sheet (firm chosen from the rolodex →
`company_id`, no free text) and a second card created later by promoting the same human's seat
(free text, no pointer) is exactly the duplicate crm-model §4 rules 1–3 fold.

### Measured

`/tmp/claude/probe-r11-2.sql` — firm card `R11 Northgate Probe Electric`; survivor `Probe Human`
carrying an open affiliation at that card and no free text; absorbed `Probe Human` carrying
`company_name = 'Northgate Elec (old typo)'` and no pointer; PR-o's flip keeps the newer card:

| | `people_directory.meta.company_name` for the survivor |
|---|---|
| before the merge | **`Northgate Probe Electric`** (the firm card's own name) |
| after the merge | **`Northgate Elec (old typo)`** |

`studio_contacts.company_id` on the survivor is **unchanged** and still names the firm card. One
row, two disagreeing facts about which firm this human works for — the Directory identity line
(direction §1 line 2, SPEC §5.1 #8), the person card's R1 line, the bring-forward mini row and the
compare sheet all read `meta.company_name`.

### Why major

This is QA-1's own defect, re-opened by the one act the room offers for duplicates. R-BN says a
merge never DELETES a typed fact; it does not say a carried snapshot may OUTRANK a better-sourced
name on a face, and §5's own banner argues the opposite case for `company_name` ("a firm card's NAME
lives there") — which is true of the **cross-kind fold**, where the folded card IS a firm, and false
of a person-to-person merge, where the absorbed card's `company_name` is 00592-era drift.

### Where a fix belongs (not prescriptive)

The r9 B-2 need is the `v_cross` branch alone — the folded FIRM's name has nowhere else to live.
The smallest shape that keeps r9 B-2 and closes this is to carry `company_name` only where the
survivor has no firm the room can resolve either (`s.company_name` blank AND `s.company_id IS NULL`),
or to move the leg into the `v_cross` branch and leave the shared COALESCE without it. A SQL block
would assert, on a person-to-person merge with the shape above: the survivor's
`people_directory.meta.company_name` still reads the firm card's name, with the sole-proprietor fold
as the negative control (block 11e already pins that the survivor KEEPS `company_name` there).

---

## 3. MAJOR-2 — a merge of any card seated on a studio-less project aborts, with a raw schema token on the face

**Severity: major. Confidence: medium (measured locally on a synthetic legacy row; the size of the
population on Strata is exactly what the W7 preflight is owed and is currently unknown).**

`supabase/migrations/00629_studio_contact_merges.sql:2118` (the seat repoint) firing
`assert_project_party_cards()` (00624), whose `v_recorded IS NULL` leg raises
`party_card_project_has_no_studio`; surfaced through
`packages/supabase/src/hooks/use-studio-contacts.ts:1907-1927` (`MERGE_REFUSAL_SENTENCES` /
`asMergeError`) into `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:409`.

### What happens

`merge_studio_contacts()` repoints every seat it finds with
`UPDATE project_parties SET studio_contact_id = p_survivor WHERE studio_contact_id = p_merged`
(`00629:2118`). That fires `assert_project_party_cards_trg` (column list
`project_id, studio_contact_id, company_id, warranty_contact_person_id`), and 00624's own R-BD leg
refuses the write outright while the project records no studio:

```
IF v_recorded IS NULL THEN
  RAISE EXCEPTION 'party_card_project_has_no_studio' …
```

`project_tenant_org()` returns `p.studio_id` whenever it is set, so this is reachable on exactly
one population: **R-BI's legacy rows** — a seat stamped with a rolodex card on a project whose
`studio_id` is still NULL. 00628 stamps every unambiguous one; the ambiguous ones stay NULL by
ruling, and `00624:724-739`'s preflight over pre-existing stamped seats is unmeasured on Strata.

### Measured

`/tmp/claude/probe-r11-1.sql` (fresh reset, rolled back). A studio-less project, one pre-existing
stamped seat on it (written with `assert_project_party_cards_trg` disabled, which is how a
pre-00624 row got there), then the ordinary merge of the two cards:

```
P1 setup : project … studio_id=<NULL>, seat … stamped with <older card>
P1 RESULT: merge REFUSED -> party_card_project_has_no_studio
```

### Why major, and why the face matters

* The merge is **impossible** for that pair. Neither card can be folded, the duplicate band goes on
  offering "Compare them?", and there is no act in the People room that stamps a project's
  `studio_id` — r6 M-1's closed loop in a second door.
* `party_card_project_has_no_studio` is **not** one of `MERGE_REFUSAL_SENTENCES`'s eleven, so
  `asMergeError()` falls through to `message || 'The merge did not go through.'` and the sheet's
  `role="alert"` paragraph (`compare-merge-sheet.tsx:552-558`) prints the bare schema token. SPEC §7
  and §5.7 #8 forbid a schema word on a face; the RPC's other eleven refusals were each given a
  sentence for precisely this reason, and this one is a refusal the RPC itself does not raise.
* The HINT 00624 writes ("Give the project a studio first") never reaches the reader — PostgREST
  carries it in `error.hint`, and `asMergeError()` only reads `message`.

### Where a fix belongs (not prescriptive)

Either give the token a sentence in `MERGE_REFUSAL_SENTENCES` that names the act the studio can
actually take, or have `merge_studio_contacts()` pre-check its own seat set and refuse by name
(`merge_seat_on_studioless_project`) with the project named, the way `merge_survivor_archived` and
`merge_two_logins` each do. The W7 preflight should also count seats stamped with a card on
`studio_id IS NULL` projects beside R-BD's own count, since that number is this finding's blast
radius.

---

## 4. Minor

### m1 — the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · carried from r10, re-measured** — `00630:376-394`.

The cursor takes `sc.merged_into IS NULL` (`:393`) and no `archived_at` leg. Measured this round
(`/tmp/claude/probe-r11-3.sql`, fresh reset, rolled back): an archived company card holding a
`coi_gl` that lapsed 10 days ago earned one notice row and one in-app notification per owner/admin —
`"The certificate of insurance for Put Away Probe Co lapsed 4 Sep 2026."` — and will earn another
for every new date that card ever carries. Still nightly noise about a card the studio deliberately
took out of the book, on the one notice family direction §8 P2 promises is worth reading.

### m2 — deleting a household, or dropping a member from the array, still orphans the money grants it sourced
**minor · medium confidence · carried from r10, re-measured** — `00632:259-270` (the DELETE policy and
the blanket `GRANT … DELETE … TO authenticated`) against `00632:560-596`.

Measured: `add_household_member()` opens the seat's `money` grant at 250000 with
`source_clause = 'client_households.co_threshold_cents'`; `DELETE FROM client_households` then leaves
**1 open grant** still stamped with that clause, naming a row that no longer exists, and
`set_household_threshold()` can never reach it again (it needs the household). Removing a person
from `member_person_ids` has the same effect one grant at a time (`00632:568`). No room surface does
either today, so it stays latent — but both are reachable through PostgREST by any owner/admin.

### m3 — `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · carried from r10** — `00629:358-372`; confirmed again against
`pg_proc.proconfig`, empty for this function and `{search_path=public}` for the other nineteen,
including its SECURITY INVOKER siblings `compliance_document_state()` and
`contact_rule_blocks_contact()`. Not exploitable (INVOKER, body schema-qualifies
`public.studio_contacts`), and r10's fix log records the decision — but it is now called from
`identity_paper_state()` on **every Directory row**, so the one function without the pin is the one
on the hottest path, and §9's signature list still records the absence without flagging it.

### m4 — `w3-data-report.md:132` still says "33 papers in total" where the breakdown and the database say 36
**minor · high confidence · carried from r10.** The four words sum to 36 and the database holds 36.
Only the total is wrong, in the record rather than on a face.

### m5 — the `project_consent_org()` enumeration still describes one call site inaccurately
**minor · medium confidence · carried from r10** — `w3-data-report.md` §6 and `00628:56-80` both say
all twelve remaining sites are "the CONSENT LEDGER'S KEY … not a guard and not a reducer". At
`00629:2646-2649` the call sits inside
`CASE WHEN public.is_active_studio_member(public.project_consent_org(q0.project_id)) THEN …`, which
decides whether the consent word renders at all. The CODE is right and deliberately so (r6 MAJOR-1);
the enumeration that declares R-BD's debt discharged is the thing that is inaccurate.

### m6 — two small internal inconsistencies in 00629
**minor · high confidence · carried from r10.** `v_merge_id` is declared (`00629:1209`) and assigned
from the lineage INSERT's `RETURNING` (`:2245`) but never read; the function returns `p_survivor`.
And `studio_contact_merges`' COMMENT calls the lineage one "nobody may forge or take back"
(`00629:300`) while `00629:344` grants `service_role` INSERT, UPDATE and DELETE on it — server-side
only, so not a hole, but the sentence and the grant disagree.

### m7 — NEW: `people_directory`'s own COMMENT was not re-issued, so the record of the view still describes v4
**minor · high confidence** — `00629:2324-2341` (the §6 banner) against the live
`obj_description('public.people_directory')`.

`CREATE OR REPLACE VIEW` keeps the existing comment, and 00629 re-issues the body without re-issuing
the `COMMENT ON VIEW`. Measured on a fresh reset: the live comment is 00626's, it does **not**
contain the string `merged_into` anywhere, and its only `project_tenant_org` sentence is the PARTY
branch's (r6/r11). So the two deltas this file's banner is careful to name — the CONTACTS branch's
merged-card fold and the TEAM branch's new tenant leg, the latter a **narrowing of who reads a
studio's teammate names** that §10.1 says Fable still owes a ruling on — are invisible to anyone
reading the object rather than the migration. Every other view and function this wave touches
restates its COMMENT for exactly this reason (`identity_paper_state`'s is re-issued three hundred
lines earlier).

### m8 — NEW: `identity_paper_state()` now runs two recursive walks per emitted Directory row, on the one read that has already had to be rescued from `statement_timeout`
**minor · medium confidence** — `00629:1147-1150`.

`COALESCE(public.resolve_merged_contact(p_card_id), p_card_id)` and the same for `p_company_id` are
evaluated unconditionally, including for the party branch where `p_card_id` is NULL by construction
(`00629:2597`) and for the overwhelmingly common case where neither id was ever merged.
`resolve_merged_contact()` is `LANGUAGE sql STABLE` with no pin, so it is not inlined and each call
is its own RLS-filtered recursive CTE over `studio_contacts`.

Measured on the seeded book (49 cards / 26 seated identities), warm, `EXPLAIN (ANALYZE)` over
`SELECT * FROM people_directory` as the studio's owner:

| body | Execution Time |
|---|---|
| shipped (r10 resolve-forward) | **136 ms** |
| 00626's body restored in a transaction | **119 ms** |

~14% on a 49-card book. Small in absolute terms and nowhere near a gate — but w1b r11 MAJOR-2
measured this exact statement passing `authenticated`'s `statement_timeout = 8s` at 649 cards / 631
seats, and the MATERIALIZED `identity_seats` CTE exists only because of it. A guard that skips the
walk where there is nothing to resolve (`WHERE EXISTS (SELECT 1 FROM studio_contacts WHERE id = …
AND merged_into IS NOT NULL)`, or a partial-index-friendly shape) would keep r10 BLOCKING-1's answer
at today's cost. Named so the Strata read is measured at its real card count before deploy rather
than after.

---

## 5. What was checked and found sound (not findings)

* **The merge cannot orphan a channel, a document or a seat.** Every one of the 20 FK columns into
  `studio_contacts` is repointed, structurally unreachable, or a declared freeze; the channel union
  REDUCES before it deletes (`00629:1453-1494`), affiliations reduce on both sides, and the
  sole-proprietor fold CLOSES third parties' affiliations with `to_date` rather than deleting them.
* **No company into a person.** `merge_kind_mismatch` unless the merged card is a company and the
  survivor a `is_sole_proprietor` person; `assert_merged_into_write()` restates it for every writer,
  `service_role` included.
* **`merged_into` resolved by `people_directory`.** The merged card emits no CONTACTS row; the
  auto-link resolver maps candidates FORWARD rather than excluding them; `link_rolodex_card_to_parties()`
  stands down for a merged card; `sync_person_affiliation_from_pointer()` stands down for a pointer
  naming one.
* **Trigger ordering inside the merge.** `merged_into` is set LAST (`00629:2231-2233`), after every
  seat repoint, so `assert_party_card_not_merged_trg` and `assert_party_bid_quoted_by_trg` cannot
  refuse the RPC's own writes. `assert_studio_contact_identity_stable_trg` fires on
  `organization_id, entity_kind` only, neither of which the merge writes;
  `refuse_legacy_consent_write_trg` names phone and consent columns the merge never writes (R-AX
  untouched); `assert_channel_owner_kind()` places no restriction on WHICH kinds a person may hold,
  so the cross-kind fold's `office` / `dispatch` / `ap_email` rows survive the owner-type rewrite.
* **Consent is record-only (R-AY).** No W3 migration reads or writes `project_parties.sms_consent_*`;
  `studio_channel_consent` is keyed on the channel VALUE, so a merge changes no verdict, and the
  absorbed card's legacy `phone_e164` / `email` are minted as channel rows so the survivor's
  worst-first reduction still sees the refused number.
* **Households RLS.** All four policies carry `is_active_studio_member(organization_id)` beside
  `is_studio_comember(designer_id)` — the declared narrowing of direction §7's line — with PR-n's
  owner/admin gate on any write carrying `co_threshold_cents` and a trigger that reads the CHANGE so
  erasing the figure is refused too. `add_household_member()` and `set_household_threshold()` both
  restate the gate in the body because SECURITY DEFINER bypasses it.
* **The sweep.** Advisory xact lock → `skipped` `job_runs` row on contention → `app.actor` →
  `running` row → guarded block with no re-RAISE → `succeeded` with `{scanned, notices, notified}`;
  the cron body is schema-qualified, the unschedule is `EXISTS`-guarded and the `cron.schedule` call
  is deliberately unwrapped; recipients are the holding studio's active owners and admins and nobody
  else; the notice key carries `expires_on` and a genuine date change clears that document's rows.
* **Grants, both directions.** Every new table: `REVOKE ALL … FROM PUBLIC, anon, authenticated` then
  an explicit re-grant. `studio_contact_merges` and `studio_compliance_notices` give `authenticated`
  SELECT only, with no INSERT/UPDATE/DELETE policy at all. `generate-legacy-grants.py` re-run: no
  diff.
* **Archive gating.** `archive_studio_contact()` / `restore_studio_contact()` are owner/admin only,
  a non-member reads `studio_contact_not_found` so the door leaks no ids, and archive is idempotent.
* **The `studio_id` backfill.** One rule, `project_tenant_org()`'s second leg with the caller legs
  removed; zero and several both stay NULL; `WHERE studio_id IS NULL` makes it idempotent; the
  shipped `set_project_studio_id` trigger is fired, not bypassed; the NOTICE prints the four counts
  R-BD asks to be listed.
* **The court widening.** 11 words, a strict superset of 00212/00281's 7. Re-surveyed this round:
  `document_state` filters `court = 'designer'` or status alone, `coordination_court_summary` groups
  by court, `margin_items` / `task_blocked_state` / `room_scan_documents` pass it through; no
  function enumerating the field kinds reads `client_decisions.court` at all.
* **00631's backfill.** Guarded `WHERE pp.bid_outcome IS NULL`; the SET list names none of the
  columns the merged-card or quoting-person guards watch; `bid_selected_at`, `bid_due_at`,
  `bid_valid_until` and `status = 'closed'` are refused rather than guessed; money is integer cents
  with a `>= 0` CHECK and the window CHECK is named `project_parties_bid_window_check`, which is the
  name the catalog reports and the name the portal's refusal map now carries.
* **Idempotency.** Every DDL statement is `IF NOT EXISTS` / `DROP … IF EXISTS` / `CREATE OR REPLACE`;
  00630's `expires_on` widening (add nullable → backfill → `SET NOT NULL`) is safe on a fresh
  database and on one carrying the pre-r5 shape; both one-time backfills are predicate-guarded.
* **Reset replays clean, every suite passes, no type drift, no grant drift.** §1.

---

## 6. Probes written this round

`/tmp/claude/probe-r11-1.sql` (MAJOR-2), `/tmp/claude/probe-r11-2.sql` (MAJOR-1),
`/tmp/claude/probe-r11-3.sql` (m1, m2), `/tmp/claude/probe-r11-4.sql` (r10 BLOCKING-1, independent),
`/tmp/claude/pd_bench.sql` (m8). Every one runs inside a transaction that ROLLBACKs, against the
local database only, and probes objects rather than the ledger.
