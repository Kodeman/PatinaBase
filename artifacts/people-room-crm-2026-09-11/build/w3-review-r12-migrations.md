# W3 (P2) — adversarial migration review, round 12

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `c4b8f7abe`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full: `00628`–`00633`; the grafted bodies they re-issue (`assert_compliance_holder` 00623,
`sync_person_affiliation_from_pointer` 00592, `identity_paper_state` / `rolodex_card_for_party_phone`
/ `link_rolodex_card_to_parties` / `identity_phone_numbers` 00626); `assert_project_party_cards`,
`project_tenant_org`, `project_recorded_studio` and 00624's stage backfill; `set_project_studio_id`
(00563); `supabase/tests/people/w3_merge_sweep_household_test.sql`; `w3-data-report.md`;
`w3-fix-log-r11.md`; `w3-review-r11-migrations.md`; `rulings.md`; `direction.md`
§3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a-report.md`,
`w1b-report.md`, `w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md` §4.

**Verdict: NOT clean — zero blocking, TWO major, eleven minor.**

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **rc=0, clean replay**, head `00633` (`supabase_migrations.schema_migrations`) |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (re-run after the reset too) |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff** |
| `SUPABASE_DB_URL=… pnpm --filter @patina/supabase generate` | **no diff** — no type drift |
| `cron.job` after the clean reset | `compliance-document-expiry-sweep · 0 6 * * * · active`, body `SELECT public.sweep_compliance_expiries();` |
| migration numbering | W3 mints 00628–00633 — all above 00627, none inside the reserved 00595–00620 |
| function ACL / `proconfig` sweep over all 20 wave functions (`pg_proc`) | no `anon`, no `PUBLIC`; every DEFINER pins `search_path=public`; `sweep_compliance_expiries` service_role-only; trigger functions postgres/service_role only. One deviation, m3 |
| table ACL + RLS on the three new tables | `studio_contact_merges` and `studio_compliance_notices`: `authenticated=r` only, RLS on, SELECT policy only. `client_households`: `authenticated=arwd`, four policies. No `anon` anywhere |
| every FK into `studio_contacts` (20, re-enumerated from `pg_constraint`) | each repointed by the RPC, structurally unreachable, or a declared freeze (a SENT `studio_trade_agreements.contact_id`, 00579). `client_households.primary_member_person_id` and `project_parties.bid_quoted_by_person_id` — the two the later files add — are both covered |
| R-AY (record-only consent) | no W3 migration reads or writes `project_parties.sms_consent_*` or writes `studio_channel_consent`; the only occurrences (`00629:2632-2633`) are metadata KEY names carrying record-derived values |
| `project_consent_org()` callers on a fresh reset | **twelve**, exactly the enumeration `00628:64-69` / report §6 gives. See m5 for the one it mis-describes |

### Every r11 finding re-checked

| r11 | State |
|---|---|
| **MAJOR-1** — a carried `company_name` snapshot outranked the survivor's own firm card | **FIXED.** `00629:1750-1754` now carries the leg only where `s.company_name` is blank AND (`company_id IS NULL` OR `company_id = p_merged`); block 11h and its positive control pass on a clean reset |
| **MAJOR-2** — a merge of a card seated on a studio-less job aborts with a raw schema token | **HALF FIXED — REOPENED as this round's MAJOR-2.** The new pre-check asks a different resolver than the guard leg it is mirroring, so it misses the commoner population. Measured below |
| m1 — the sweep announces paper held by an ARCHIVED card | **OPEN**, re-measured this round |
| m2 — deleting a household, or dropping a member, orphans the money grants it sourced | **OPEN** (structural: nothing references `client_households` from `project_party_authority`) |
| m3 — `resolve_merged_contact()` has no pinned `search_path` | **OPEN.** `pg_proc.proconfig` empty for it, `{search_path=public}` for all nineteen others |
| m4 — "33 papers in total" where the database says 36 | **OPEN.** Measured this round: `current` 9, `held` 24, `lapsed` 2, `lapses_soon` 1 = **36**; `w3-data-report.md:132` still reads 33 |
| m5 — the `project_consent_org()` enumeration calls a visibility guard a ledger key | **OPEN.** `00629:2690-2700` still wraps the consent word in `CASE WHEN is_active_studio_member(project_consent_org(q0.project_id))` |
| m6 — `v_merge_id` unused; lineage COMMENT vs the `service_role` grant | **OPEN.** `00629:1209` / `:2299`; `00629:300` vs `:344` |
| m7 — `people_directory`'s own COMMENT still describes v4 | **OPEN**, re-measured: `obj_description('public.people_directory')` does not contain `merged_into` and still reads "v7 (00626 …)" |
| m8 — `identity_paper_state()` runs two recursive walks per emitted Directory row | **OPEN** (`00629:1147-1150`, unchanged) |

---

## 2. MAJOR-1 — 00631's bid backfill rewrites `project_parties` in bulk with `set_updated_at_project_parties` still armed, and flips a Directory row onto the bid seat at deploy

**Severity: major. Confidence: high (measured on a fresh reset, rolled back).**

`supabase/migrations/00631_project_party_bids.sql:362-372` — the `trade_rfq` / `trade_scope_bids`
backfill UPDATE. It is **not** bracketed by `ALTER TABLE public.project_parties DISABLE TRIGGER
set_updated_at_project_parties`, and the file contains no `DISABLE TRIGGER` at all
(`grep -n "DISABLE TRIGGER" 00631` → nothing).

### The rule it breaks is stated in this program's own record

`00624:800-806`, written for w1b final review r12 MAJOR-1:

```
-- `SET … , updated_at = pp.updated_at` does NOT work — update_updated_at_column()
-- overwrites NEW after the SET list is evaluated. The trigger is therefore
-- bracketed off for exactly this statement. Any future migration that
-- rewrites a project_parties column in bulk owes the same two lines.
ALTER TABLE public.project_parties DISABLE TRIGGER set_updated_at_project_parties;
```

`project_parties.updated_at` is not bookkeeping in this room. It is the tie-break
`people_directory`'s PARTY branch ranks one identity's seats by (`00629:2771`,
`DISTINCT ON (…) … ORDER BY … pp.updated_at DESC, pp.id`), the value that branch emits as
`last_touch_at` (`00629:2624` reading `pp.updated_at` at `:2716`), and the same order
`people_directory_seats`' `first_value(pp.id)` window uses to name `person_id`
(`00626:2096-2106`).

### Measured

`/tmp/claude/w3r12/probe-c.sql` (fresh reset, one transaction, ROLLBACKed). One UNCARDED identity —
`R12 Bidder`, two seats sharing a phone, no rolodex card — one seat on a live job updated yesterday,
one bid seat on an old job updated 400 days ago. Then 00631's backfill statement shape
(`SET bid_outcome = 'asked', bid_asked_at = …` guarded by `bid_outcome IS NULL`) run against the
old bid seat:

```
BEFORE backfill: directory row seat=…0001 job=R12 Live job   last_touch=2026-09-14 05:21:24+00
AFTER  backfill: directory row seat=…0002 job=R12 Old bid job last_touch=2026-09-15 05:21:24+00
```

The seat's `updated_at` moved to the write instant; the identity's whole Directory row moved with it —
`person_id`, `meta.project_name` and `last_touch_at`. That is r12 MAJOR-1's own harm, one file later:
the room says a bidder's last touch was the deploy, on the job that is not the live one, and
`party-profile-sheet.tsx` opens against the wrong seat.

### Why it is not visible in any gate

`supabase db reset` runs every migration **before** every seed, so `trade_rfq_requests` and
`trade_scope_bids` are empty when 00631 runs and the statement touches 0 rows — exactly what
`w3-data-report.md` §3 records ("the local database holds 0 … so the backfill wrote 0 rows here").
Its only real execution is the Strata deploy, which is the same blind spot 00624's own comment was
written about. The SQL suite's block 7 exercises the MAPPING against hand-written rows, not the
statement's collateral.

### Blast radius

Bounded by the seats `trade_rfq_requests` / `trade_scope_bids` name on Strata — unmeasured, and
not among the counts 00628's NOTICE prints. Every one of them gets `updated_at = <deploy instant>`,
all at the same instant, so among an uncarded identity's seats the bid seat wins the DISTINCT ON
outright.

### Where a fix belongs (not prescriptive)

The two lines 00624 names, around `00631:362-372`; a count of the affected seats beside the other
deploy numbers; and, if it is to be pinned, a SQL block in the r12 shape — stage two seats for one
uncarded identity, run the statement, assert the Directory row's `person_id` / `project_id` /
`last_touch_at` did not move (w1b block 21 is the pattern).

---

## 3. MAJOR-2 — r11's studio-less-seat refusal asks a different resolver than the guard it mirrors, so the raw schema token still reaches the merge sheet on the commoner shape

**Severity: major. Confidence: high (measured twice — before and after a clean reset, both
rolled back).**

`supabase/migrations/00629_studio_contact_merges.sql:1429-1444` — the r11 MAJOR-2 pre-check:

```sql
   WHERE (pp.studio_contact_id = p_merged OR pp.company_id = p_merged
          OR pp.warranty_contact_person_id = p_merged)
     AND public.project_tenant_org(pp.project_id) IS NULL
```

against the guard it exists to pre-empt, `assert_project_party_cards()` (00624), which raises
`party_card_project_has_no_studio` from **two** legs:

* `v_org := project_tenant_org(NEW.project_id)` IS NULL — the pre-check's own predicate; and
* `v_recorded := project_recorded_studio(NEW.project_id)` IS NULL, reached whenever
  `NEW.studio_contact_id IS NOT NULL` (00624's "THE RECORD, NOT THE WRITER" leg, w1b r11 MAJOR-3).

`project_tenant_org()` is `COALESCE(p.studio_id, <the caller's own shared-studio membership>)`;
`project_recorded_studio()` is `p.studio_id` and nothing else. So on R-BI's legacy population the
two disagree for every caller who shares an active design studio with the job's
`designer_id` / `lead_designer_id` / `created_by` — which is the ordinary studio member merging
cards in their own room. The pre-check finds no row, the seat repoint at `00629:2171-2172` fires the
trigger, and the second leg raises.

### Measured

`/tmp/claude/w3r12/probe-a.sql` (fresh reset, rolled back). A studio-less project whose **designer is
a co-member of the caller's own studio**, one pre-existing stamped seat on it (written with
`assert_project_party_cards_trg` disabled, which is how a pre-00624 row got there), then the
ordinary merge of the duplicate pair:

```
PROBE-A tenant_org=b0000000-0000-0000-0000-000000000001 recorded_studio=<NULL>
PROBE-A RESULT: merge REFUSED -> party_card_project_has_no_studio
```

Not `merge_seat_on_studioless_project`. `party_card_project_has_no_studio` is still absent from
`MERGE_REFUSAL_SENTENCES` (`packages/supabase/src/hooks/use-studio-contacts.ts:1907-1933`), so
`asMergeError()` falls through to `message || 'The merge did not go through.'` and the sheet's
`role="alert"` paragraph prints the bare schema token — SPEC §7 and §5.7 #8's own prohibition, over a
pair the room can then never fold and a duplicate band that goes on offering "Compare them?".

### Why the suite does not catch it

Block 11i stages the fixture with `designer_id = a0…0007`, a user who holds no membership in the
caller's studio, and then **asserts the opposite condition explicitly**
(`w3_merge_sweep_household_test.sql`: `IF public.project_tenant_org(…) IS NOT NULL THEN … 'the
fixture no longer reproduces'`). The block pins the half that was fixed and, by construction, can
never reach the half that was not.

### Blast radius, and the preflight number

00628's NOTICE counts "seat(s) stamped with a rolodex card" on studio-less jobs — the right number,
0 locally, unmeasured on Strata. Every one of those seats is in this finding's population, not r11's:
the refusal-by-name only covers the subset whose designer shares no studio with the merging member.

### Where a fix belongs (not prescriptive)

The pre-check has to ask the same question the leg it is standing in for asks. For the
`studio_contact_id` seats that is `project_recorded_studio(pp.project_id) IS NULL`; for the
`company_id` / `warranty_contact_person_id` seats the guard really does use `v_org`, so
`project_tenant_org()` is right there — one predicate per column, or the disjunction of the two.
A SQL block would stage the shape this probe stages (the job's designer a co-member of the caller's
studio) beside block 11i's, with 11i's own control unchanged.

---

## 4. Minor

### m1 — the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · carried from r10/r11, re-measured** — `00630:376-394`. The cursor takes
`sc.merged_into IS NULL` (`:393`) and no `archived_at` leg. Measured on a fresh reset (rolled back):
an archived company card holding a `coi_gl` that lapsed 10 days ago earned one notice row and one
in-app notification per owner/admin — *"The certificate of insurance for R12 Put Away Co lapsed 5 Sep
2026."* — and will earn another for every new date that card carries.

### m2 — deleting a household, or dropping a member from the array, still orphans the money grants it sourced
**minor · high confidence · carried, structural** — `00632:259-266` (the owner/admin DELETE policy)
and the blanket `GRANT … DELETE … TO authenticated` (`:269`), against `set_household_threshold()`'s
loop (`:560-596`). `project_party_authority` carries no reference to `client_households` — only the
text `source_clause` — and `ON DELETE SET NULL` on `designer_clients.household_id` is the only
cascade. A deleted household leaves its open `money` grants standing with
`source_clause = 'client_households.co_threshold_cents'` naming a row that no longer exists, and
`set_household_threshold()` can never reach them again. No room surface does either today.

### m3 — `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · carried** — `00629:358-375`; confirmed again against `pg_proc.proconfig`
(empty for it, `{search_path=public}` for the other nineteen, its SECURITY INVOKER siblings
`compliance_document_state()` and `contact_rule_blocks_contact()` included). Not exploitable
(INVOKER, body schema-qualifies `public.studio_contacts`) — but `identity_paper_state()` now calls
it twice on every Directory row, so the one function without the pin is the one on the hottest path.

### m4 — `w3-data-report.md:132` still says "33 papers in total" where the breakdown and the database say 36
**minor · high confidence · carried, re-measured.** `compliance_document_state()` over all 36 rows
returns `current` 9, `held` 24, `lapsed` 2, `lapses_soon` 1. Only the total is wrong, in the record.

### m5 — the `project_consent_org()` enumeration still describes one call site inaccurately
**minor · medium confidence · carried.** `w3-data-report.md` §6 and `00628:56-80` both say all twelve
remaining sites are "the CONSENT LEDGER'S KEY … not a guard and not a reducer". At `00629:2690-2700`
the call sits inside `CASE WHEN public.is_active_studio_member(public.project_consent_org(
q0.project_id)) THEN …`, which decides whether the consent word renders at all. The code is right and
deliberately so (r6 MAJOR-1); the sentence that declares R-BD's debt discharged is what is inaccurate.

### m6 — two small internal inconsistencies in 00629
**minor · high confidence · carried.** `v_merge_id` is declared (`:1209`) and assigned from the
lineage INSERT's `RETURNING` (`:2299`) but never read. And `studio_contact_merges`' COMMENT calls the
lineage one "nobody may forge or take back" (`:300`) while `:344` grants `service_role` INSERT,
UPDATE and DELETE on it — server-side only, so not a hole, but the sentence and the grant disagree.

### m7 — `people_directory`'s own COMMENT was not re-issued, so the record of the view still describes v4
**minor · high confidence · carried, re-measured.** `CREATE OR REPLACE VIEW` keeps the existing
comment and `00629:2395` re-issues the body without re-issuing `COMMENT ON VIEW`. On a fresh reset
the live comment reads "v7 (00626, …)" and contains the string `merged_into` **nowhere**, so the two
deltas 00629's own banner is careful to name — the merged-card fold and the TEAM branch's tenant leg,
the latter a narrowing §10.1 says Fable still owes a ruling on — are invisible to anyone reading the
object rather than the migration. Every other view and function this wave touches restates its
COMMENT.

### m8 — `identity_paper_state()` runs two recursive walks per emitted Directory row
**minor · medium confidence · carried** — `00629:1147-1150`.
`COALESCE(public.resolve_merged_contact(p_card_id), p_card_id)` and the same for `p_company_id` are
evaluated unconditionally, including on the party branch where `p_card_id` is NULL by construction
and in the overwhelmingly common case where neither id was ever merged. r11 measured ~14 % on the
seeded 49-card book (136 ms vs 119 ms); w1b r11 MAJOR-2 measured this same statement passing
`authenticated`'s 8 s `statement_timeout` at 649 cards / 631 seats. Named so the Strata read is
measured at its real card count before deploy rather than after.

### m9 — NEW: `w3-data-report.md` is stale about the RPC's own refusal list after r11
**minor · high confidence.** `w3-data-report.md:45` still reads "Refusals, in order: … **Eleven**,
not eight" and its list stops at `merge_contact_rule_conflict`. The shipped function raises
**twelve** (`grep -o "RAISE EXCEPTION 'merge_[a-z_]*'" 00629 | sort -u`), the twelfth being
`merge_seat_on_studioless_project` (`00629:1439`); §9's signature list and §0's table do not name it
either. The same paragraph says the suite is "12 blocks as of r7", which the r8–r11 blocks have since
outgrown. The record is the thing W7's preflight reads.

### m10 — NEW: `add_household_member()` on a job that records no studio raises the guard's raw token, not its own named refusal
**minor · high confidence (mechanism) · narrow population.** `00632:372-380` inserts the seat
*before* the `project_party_recorded_studio()` check at `:389-396`, and that check only runs when the
household carries `co_threshold_cents` **and** the role is `client_rep`. For a plain `client` member,
or a household with no figure, the seat INSERT fires `assert_project_party_cards_trg` and the caller
gets `party_card_project_has_no_studio` — the same schema word on a face MAJOR-2 is about, through a
second door. `household_grant_project_has_no_studio` is the named refusal that exists for exactly
this; it simply runs too late and too narrowly. Population is R-BD's legacy projects.

### m11 — NEW: 00628's backfill bumps `projects.updated_at` for every project it repairs
**minor · low confidence.** `update_projects_updated_at` (BEFORE UPDATE FOR EACH ROW on `projects`)
is armed for `00628:117-122`, so every stamped project takes `updated_at = <deploy instant>`. I found
no face that reads `projects.updated_at` as a fact (`use-projects.ts` does not order by it), and
00624's own stage backfill — which reads `COALESCE(pj.completed_at, pj.updated_at)` — runs earlier in
the same push, so there is no interaction at deploy. Named because 00624 established the norm for the
sibling table and this is the one bulk `projects` rewrite in the wave.

---

## 5. What was checked and found sound (not findings)

* **The merge cannot orphan a channel, a document or a seat.** All 20 FK columns into
  `studio_contacts` re-enumerated from `pg_constraint` this round: every one is repointed,
  structurally unreachable, or a declared freeze. The two the later files add
  (`client_households.primary_member_person_id`, `project_parties.bid_quoted_by_person_id`) are both
  carried, the second only for a PERSON survivor — which is the only kind the column can ever name.
* **The channel union reduces before it deletes** (`00629:1490-1537`), worst-first
  `unsubscribed > dead > bounced > active` with `status_at` travelling with the verdict that wins.
  `normalize_studio_contact_channel_trg` normalises `value` on every write, so the collision
  predicate and the `ON CONFLICT (owner_id, channel_kind, value)` inference see the same strings; the
  absorbed card's legacy `phone_e164` / `email` are minted as channel rows, which is exactly what
  `identity_phone_numbers()`' channels leg (`00626`, kinds `mobile/office/dispatch/after_hours`)
  reduces over.
* **Trigger ordering inside the merge, re-derived from `pg_trigger` this round.**
  `apply_party_rolodex_link_trg` returns early on a non-NULL `studio_contact_id`, so it cannot
  re-derive the seat the merge just stamped. `fc_optin_invite_dispatch` (AFTER INSERT OR UPDATE on
  `project_parties`) returns early whenever OLD already carried the same pending-consent shape, so
  the seat repoint dispatches no SMS. `refuse_legacy_consent_write_trg` names phone and consent
  columns the merge never writes. `assert_studio_contact_identity_stable_trg` fires on
  `entity_kind, organization_id` only. `merged_into` is set LAST (`:2287`), after every repoint.
* **No company into a person.** `merge_kind_mismatch` unless the merged card is a company and the
  survivor a sole-proprietor person; `assert_merged_into_write()` restates it for every writer,
  `service_role` included, and its only exemption is the FK's own `ON DELETE SET NULL`.
* **`merged_into` resolved by `people_directory`.** The merged card emits no CONTACTS row
  (`:2937`); `rolodex_card_for_party_phone()` maps candidates FORWARD rather than excluding them;
  `link_rolodex_card_to_parties()` and `sync_person_affiliation_from_pointer()` both stand down for a
  merged card.
* **Consent is record-only (R-AY).** No W3 migration reads or writes `project_parties.sms_consent_*`
  and none writes `studio_channel_consent`; the merge changes no verdict by construction, and the
  absorbed number arrives as a channel row so the survivor's worst-first reduction still sees a
  recorded refusal.
* **Households RLS.** All four policies carry `is_active_studio_member(organization_id)` beside
  `is_studio_comember(designer_id)` — the declared narrowing of direction §7's line — with PR-n's
  owner/admin gate on any write carrying `co_threshold_cents`, an owner/admin DELETE policy, and
  `assert_household_threshold_principal_trg` reading the CHANGE so erasing the figure is refused too.
  Both RPCs restate the gate in the body because SECURITY DEFINER bypasses it.
* **The sweep.** Advisory xact lock → `skipped` `job_runs` row on contention → `app.actor` →
  `running` row → guarded block with no re-RAISE → `succeeded` with `{scanned, notices, notified}`.
  The cron body is schema-qualified, the unschedule is `EXISTS`-guarded and `cron.schedule` is
  deliberately unwrapped; recipients are the holding studio's active owners and admins and nobody
  else; the notice key carries `expires_on` and a genuine date change clears that document's rows
  through a DEFINER trigger scoped to the one document.
* **Archive gating.** `archive_studio_contact()` / `restore_studio_contact()` are owner/admin only,
  a non-member reads `studio_contact_not_found` so the door leaks no ids, archive is idempotent, and
  both take `FOR UPDATE` first.
* **The `studio_id` backfill.** One rule, `project_tenant_org()`'s second leg with the caller legs
  removed; zero and several both stay NULL; `WHERE studio_id IS NULL` makes it idempotent;
  `set_project_studio_id()` (00563) is fired, not bypassed, and takes its `v_postgres_migration`
  return under `session_user = 'postgres'`; the NOTICE prints R-BD's, R-BI's and r11's counts.
  Measured on the seeded book: 8 projects, 5 studio-less, 0 of them carrying a stamped seat.
* **The court widening.** 11 words, a strict superset of 00212/00281's 7, and `court IN (…)` leaves
  a NULL court passing as it always did. `project_tasks.owner` deliberately not widened.
* **00631's guard and vocabulary.** `assert_party_bid_quoted_by()` takes 00624's "record, not the
  writer" pair and adds the merged-away leg; money is integer cents with a `>= 0` CHECK; the window
  CHECK is `project_parties_bid_window_check`; `bid_selected_at`, `bid_due_at`, `bid_valid_until` and
  `status = 'closed'` are refused rather than guessed; the backfill is guarded
  `WHERE pp.bid_outcome IS NULL`. (Its collateral on `updated_at` is §2.)
* **Idempotency.** Every DDL statement is `IF NOT EXISTS` / `DROP … IF EXISTS` / `CREATE OR REPLACE`;
  00630's `expires_on` widening (add nullable → backfill with a two-leg COALESCE → `SET NOT NULL`) is
  safe both on a fresh database and on one carrying the pre-r5 shape.
* **Reset replays clean, every suite passes, no type drift, no grant drift.** §1.

---

## 6. Probes written this round

`/tmp/claude/w3r12/probe-a.sql` (MAJOR-2, run twice — before and after the reset),
`/tmp/claude/w3r12/probe-b.sql` (m1), `/tmp/claude/w3r12/probe-c.sql` (MAJOR-1).
Every one runs inside a transaction that ROLLBACKs, against the local database only, and probes
objects rather than the ledger.
