# W3 (P2) — adversarial migration review, round 3

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `fa199109d` ("fix(people-crm): W3 round-2 review — 14
findings closed"). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod touched. No server
started. No migration written, no product file edited.** Three probe files were added under
`build/` and every one of them runs inside a transaction that ROLLBACKs.

Under review: `00628_project_studio_id_backfill.sql`, `00629_studio_contact_merges.sql`,
`00630_compliance_expiry_sweep.sql`, `00631_project_party_bids.sql`,
`00632_client_households.sql`, `00633_decision_court_widened.sql`, and
`supabase/tests/people/w3_merge_sweep_household_test.sql`, read in full, against
`rulings.md` §§1–3, `synthesis/direction.md` §3.1 / §3.4 / §5 / §7 / §8 / §9,
`synthesis/crm-model.md` §4 and CRM-24, `specimens/SPEC.md` §5.4 / §5.7, `briefing/fixture.md`
§4, and the W1a / W1b / W2a / W2b / W2c reports plus `w2-review-r15-qa.md`.

**Verdict: NOT CLEAN — 2 blocking, 3 major, 5 minor.**

All fourteen round-2 findings are confirmed closed (§1). The three new blocking/major merge
findings are one family: `merge_studio_contacts()` moves the tables that were named in the brief
and leaves behind the two things a rolodex card carries in its own columns — its **paper**, and
its **number**. Each stranding is measurable on a face.

---

## 0. Gates, as run

| Gate | Result |
|---|---|
| `pnpm --dir <worktree> supabase:reset` (full replay + every seed) | **rc=0**, clean. (Needed `dangerouslyDisableSandbox` once for the CLI telemetry write — the same harness/sandbox interaction `w2-review-r13-qa.md` §0 and `r15-qa` §0 name. Not a product finding.) |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | **rc=0** — "W3 SQL suite: all blocks passed" |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` | **rc=0** — "All W1a assertions passed." |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` | **rc=0** — "All W1b assertions passed." |
| `python3 scripts/generate-legacy-grants.py` re-run | byte-identical, `git status` clean — the seed is current for every W3 GRANT/REVOKE |
| `packages/supabase/src/database.types.ts` | carries all three new tables and **all eight** new `project_parties` bid columns |
| migration numbering | 00628–00633, minted above 00627; 00595–00620 untouched |
| `cron.job` after reset | `compliance-document-expiry-sweep · 0 6 * * * · SELECT public.sweep_compliance_expiries();` |
| local DB after probing | probe residue (`studio_compliance_notices`, `notification_log`, `job_runs`) deleted; the three tables are back at 0 |

Probes written this round, all under `build/`, all ROLLBACKed:
`probe400-w3-r3.sql`, `probe401-w3-r3.sql`, `probe402-w3-r3.sql`, `probe403-w3-r3.sql`.

---

## 1. Round-2 findings, re-checked

| Finding | State | Evidence |
|---|---|---|
| B2-1 · the `merged_into` write guard | **FIXED** | `00629:118-212` trigger + `:220-243` policy split; suite block **1c** green |
| B2-2 · a merge aborted over a renewal | **FIXED** | `00629:613-797` (§4c `v_retiring`) + `:1005-1060` (three statements); suite block **1c** green. Independently re-measured: the sole-proprietor branch's blanket move (`00629:1069-1072`) also survives a two-row renewal chain in either physical order (probe K2/K3: both documents land on the person, the edge intact, paper word `current`) |
| B2-3 · the bid backfill wrote a selection date | **FIXED** | `00631:299-306` (`status = 'quoted'` only), no `bid_selected_at` write anywhere; suite block **7b** green |
| B2-4 · the sweep announced a folded-away firm | **FIXED** | `00630:257` `AND sc.merged_into IS NULL`; suite block **2b** green |
| F1 · the picker named the person where the firm was meant | **FIXED** | `roster/rolodex-picker.tsx:70,:408-437` `directoryFirmOf` |
| F3 · the bring-forward spec never ran | **FIXED** | `e2e/people/bring-forward.spec.ts:67` `seed.data.client_id ?? null` |
| B2R-1 · the household band promised the opposite grant | **FIXED** | `roster/household-band.tsx:104` "They may sign money to …" |
| M2R-1 · "lapses in 30 days" beside a date | **FIXED** | `lib/document/compliance-notice.ts:49` |
| M2R-2 · the merge sheet promised paper that does not move | **FIXED (wording)** — but see **W3-R3-1**: the new wording is now the *only* place the room tells the studio its paper stayed behind, and it is still not what a duplicate-card merge should do | `people/compare-merge-sheet.tsx:92-103` |
| M2R-3 · a refused bring-forward printed a raw PostgREST string | **FIXED** | `roster/rolodex-picker.tsx:501,:565` `writeErrorMessage` |
| M2R-4 · 00629's two bare tokens printed verbatim | **FIXED** | `lib/document/write-error.ts:45,:48` |
| M2R-5 · merged-away cards offered by three pickers | **FIXED** | `use-studio-contacts.ts:64,:175,:214-215` |
| M2R-6 · "Compare these two" on pairs that are not both cards | **FIXED** | `lib/document/people-derivation.ts:1368` `row.role !== "contact"` |
| M2R-7 · `useComplianceDocumentsFor` dropped the retirement rule | **FIXED** | `use-studio-contacts.ts:1636` |

Still open from r2 by instruction, and still open now: **m2-2** — see minor **W3-R3-7**.

---

## 2. Findings

### W3-R3-1 · BLOCKING · confidence HIGH — a merge strands the firm's paper on the card that disappears, and the survivor then prints the wrong paper word

`supabase/migrations/00629_studio_contact_merges.sql:1005-1060`

The compliance block moves an absorbed document onto the survivor **only** where the survivor
already holds the same `doc_type`, still in force, expiring no earlier, carrying at least the
same gates (`:1016-1029`). That is the right rule for crm-model §4's *acquisition* ("On
acquisition, the surviving card absorbs the other, documents of the absorbed firm keep their
original holder id"). It is the wrong rule for the merge the room actually offers — direction
§3.1's duplicate band, "These two cards share a phone. Compare them?", crm-model §4 rule 2, one
firm carded twice — where the two cards' paper is **one firm's paper** and the survivor is the
studio's free choice (PR-o: "Yes, always the studio's call").

Measured on a fresh reset (`probe400-w3-r3.sql`, rolled back):

```
A1 survivor paper BEFORE merge (holds nothing): not_on_file
A1 absorbed duplicate paper BEFORE merge (current COI): current
A1 survivor paper AFTER merge: not_on_file   (certificate still held by fa1…0002)
A1 Directory rows for the absorbed card after the merge (want 0): 0

A2 survivor paper BEFORE merge (lapsed COI): lapsed
A2 absorbed duplicate BEFORE merge (current COI): current
A2 survivor paper AFTER merge: lapsed
A2 the current renewal is still held by fa1…0004 (survivor is fa1…0003)
```

Both are wrong facts on a face, and A2 is the worse one:

* **A2**: the studio holds a **current** general-liability certificate for the firm. After the
  merge the surviving Directory row, the seat line and the company card all read `lapsed`
  (`identity_paper_state` → `compliance_state`, `people_directory.paper_state` at
  `00629:1744`, `people_directory_seats.paper_state` per R-BJ), the roster row prints PR-h /
  R-S / SPEC §5.4 #7's terracotta held clause — "Site access held. …'s insurance lapsed …" —
  and 00630's nightly sweep then writes "…'s paper has lapsed" to every owner and admin
  (confirmed: the survivor's stale certificate earned a notice in probe400 §B). The renewal that
  answers it is on a card `people_directory` emits no row for.
* **A1**: the survivor reads `not_on_file`, so the company card prints R-K's "Not on file" with
  the act "Record a document" over paper the studio already recorded.

The stranded document is unreachable from every path the room offers: the absorbed card emits no
Directory row (`00629:1764`), the three pickers now filter `merged_into` (M2R-5), and the sweep
skips it (`00630:257`). It is still `SELECT`able by id — probe400 §F confirms one row, one
document — which is exactly the shape "data loss on merge" takes in a soft-delete model.

The outcome also depends on **which card the studio picked as survivor**, which PR-o says is
free: merging A into B and merging B into A give different paper words for the same firm.

The merge sheet's own consequence sentence
(`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:92-103`) now says
the absorbed paper "stays on <merged>'s card and is still readable there" — true of the row, not
of any surface the studio can reach.

**Fix**: for a duplicate-card merge the absorbed paper must arrive on the survivor. The shape
that satisfies both this and r1 B-1 (which is what produced the current rule) is to move **every**
absorbed document and let `compliance_state()`'s existing worst-first reckoning settle the word,
writing `superseded_by` where a legitimate successor exists — i.e. keep the current
`v_heads`/`v_succs` edge-writing pass and add an unconditional holder move for the remainder,
rather than leaving the remainder behind. r1 B-1's complaint ("a merge manufactured a block the
survivor never earned") is then answered by the studio's own act of merging two cards it has
declared to be one firm; the present rule answers it by hiding a lapse and hiding a renewal,
which is worse in both directions. If Fable prefers to keep two firms' paper apart, the rule has
to key on the *evidence* (`matched_on`) or on an explicit studio choice on the merge sheet, not
on whether the survivor happens to hold a matching in-force row.

---

### W3-R3-2 · BLOCKING · confidence HIGH — `bid_quoted_by_person_id` is checked against the CALLER's studio, so on a studio-less project a member of another studio writes their own card onto the seat

`supabase/migrations/00631_project_party_bids.sql:160-176`

`assert_party_bid_quoted_by()` resolves the job's studio with `project_tenant_org()` alone.
`project_tenant_org()` is caller-relative by construction: `COALESCE(p.studio_id, <the caller's
own design studio that the designer of record also belongs to>)`
(`00624_project_party_window_and_authority.sql`, the function body). On the
`projects.studio_id IS NULL` population — R-BD/R-BI's legacy population, **5 of the 8 seeded
projects, all of them ambiguous and therefore left NULL by 00628** — it therefore answers *the
writer's* studio, and the guard checks the card against the writer's own rolodex.

This is the identical hole 00624 closed for `studio_contact_id` at w1b final review r11 MAJOR-3,
whose own comment states the rule: "THE RECORD, NOT THE WRITER … v_org is caller-relative where
the project records no studio, so checking the card against it checks the card against the
WRITER's own studio" (`00624:645-655`). 00631 reuses the function's *shape* and drops its
correction.

Measured (`probe403-w3-r3.sql`, rolled back), as an admin of a second design studio the seeded
designer of record also belongs to, against the seeded studio-less project "Aspen Loft Refresh":

```
J the project records studio_id = <NULL> (NULL is R-BD's legacy population)
J project_tenant_org() answers fd0…000b for a member of the OTHER studio
J project_recorded_studio() answers <NULL>
J a member of the OTHER studio wrote its own card onto this seat: ACCEPTED
J the seat now names card fd1…0001 (org fd0…000b)
J control: studio_contact_id REFUSED -> party_card_project_has_no_studio
```

The negative control is the point: the same caller, the same seat, the same card, refused on
`studio_contact_id` and accepted on `bid_quoted_by_person_id`.

**Fix**: give `assert_party_bid_quoted_by()` 00624's second resolver — require
`public.project_recorded_studio(NEW.project_id)` to be non-NULL and check the card against it
(`sc.organization_id = v_org AND sc.organization_id = v_recorded`), raising
`party_bid_quoted_by_project_has_no_studio` while the project records none, exactly as
`assert_project_party_cards()` does. Add a suite assertion beside block 7's three refusals.

---

### W3-R3-3 · MAJOR · confidence HIGH — after a merge the absorbed card's own number resolves to no card, so the next seat on it becomes a SECOND Directory identity for the human just merged

`supabase/migrations/00629_studio_contact_merges.sql:465-494` (the `merged_into IS NULL` leg on
`rolodex_card_for_party_phone()`), with `:895-907` (the merge unions
`studio_contact_channels` but never either card's own `phone_e164`).

§4b's banner argues the new filter "closes the SHARED-PHONE MERGE", and it does — when the two
cards carry the *same* number. crm-model §4 rules 3 and 4 (email match; company plus name) merge
cards that carry *different* numbers, and there the filter opens a new hole: the absorbed card's
number was the only card carrying it, the resolver now excludes that card, and the number
resolves to nothing at all.

Measured (`probe402-w3-r3.sql`, rolled back) — two cards for one human matched on email, merged,
then the ordinary "Add to the roster" write on the absorbed number:

```
I BEFORE the merge, a seat on +16125550872 resolves to card fc1…0002
I AFTER the merge, the SAME number resolves to card <NULL>
I  (the survivor's own number still resolves to fc1…0001)
I the new seat was stamped with card <NULL> (NULL = uncarded)
I Directory rows for this one human after the merge: 2   [fc1…0001 contact + fc2…0001 sub]
```

An uncarded seat lands on `people_directory`'s party branch and becomes its own identity row —
"the exact over-count the merge exists to remove", in §4b's own words, reintroduced by the merge
itself. It also makes the head count ("29 people, 22 firms", PR-g) wrong the day after a merge,
and there is no act in the room that repairs it: the studio would have to merge the new
uncarded identity, which is not a card.

**Fix**: resolve a merged card **forward** instead of excluding it — have
`rolodex_card_for_party_phone()` count live identities and answer
`resolve_merged_contact(sc.id)`, so a number that names exactly one identity (live card, or a
card merged into one) stamps the survivor. That keeps the shared-phone case §4b fixed, keeps
§4's seat guard satisfiable (the answer is always a live card), and closes this case.
Carrying the absorbed card's `phone_e164` / `email` into the survivor's
`studio_contact_channels` as part of crm-model §4's "Channels union" is the complementary half
(see W3-R3-4).

---

### W3-R3-4 · MAJOR · confidence HIGH — after a merge the identity's consent word reads `not_asked` over a number the studio's own record says `opted_out`

`supabase/migrations/00629_studio_contact_merges.sql:895-907` and `:1738`.

The merge unions `studio_contact_channels` rows, but the number a rolodex card actually carries
is `studio_contacts.phone_e164` — that is what `identity_phone_numbers()` reads as its card leg
(`00626`), what `rolodex_card_for_party_phone()` matches on, and what
`link_rolodex_card_to_parties()` fires on. Nothing mints a channel row from it (confirmed: the
only triggers on `studio_contacts` are `assert_merged_into_write_trg`,
`assert_studio_contact_designations_trg`, `assert_studio_contact_identity_stable_trg`,
`link_rolodex_card_to_parties_trg`, `normalize_phone_studio_contacts`,
`set_updated_at_studio_contacts`, `sync_person_affiliation_from_pointer_trg`; 00593's channel
fill is a one-time backfill). So the absorbed card's number moves nowhere, and
`identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164)` on the survivor
(`00629:1738`) never sees it.

Measured (`probe401-w3-r3.sql`, rolled back) — two cards for one human, the duplicate's number
carrying a recorded `opted_out` in the same studio:

```
G survivor consent BEFORE: not_asked   duplicate consent BEFORE: opted_out
G the duplicate card holds 0 typed channel row(s) before the merge
G survivor consent AFTER the merge: not_asked
G the survivor's typed channels after the merge: <NULL>
G identity_phone_numbers() answers: {+16125550801}
```

Before the merge the room printed two rows, one of them `Opted out`. After it, one row reading
`Not asked`, and the opt-out is printed nowhere for that human — not on the Directory row
(R-G's consent column), not on the collapsed roster row (R-T), not on the bring-forward mini row
(SPEC §5.7 #4b, which is Pete Rusk's case exactly: a STOP recorded on another job that must
travel). The merge sheet's consequence sentence says "Consent stays with the number, not with
the card, so nobody's yes or no changes"
(`compare-merge-sheet.tsx:98`) — true of the ledger, false of what the room then prints.

The send gate itself is safe: it asks `channel_consent_status()` per number (R-AY), so a text to
that number is still refused. This is a wrong word, not an unsafe send — hence major, not
blocking.

**Fix**: in `merge_studio_contacts()`, before the pointer is set, upsert the absorbed card's
`phone_e164` (kind `mobile`) and `email` (kind `email`) into `studio_contact_channels` on the
survivor with `ON CONFLICT (owner_id, channel_kind, value) DO NOTHING` — crm-model §4's
"Channels union" over the legacy columns as well as the typed table — **and** teach
`identity_phone_numbers()` to read the identity's `studio_contact_channels` phone kinds beside
the card column, so the union is what the reduction sees. The second half is a W1b-shaped
change; the first half alone still leaves a two-number identity reducing over one number.

---

### W3-R3-5 · MAJOR · confidence HIGH — the append-only lineage table is forgeable by any studio member

`supabase/migrations/00629_studio_contact_merges.sql:311-325`

`studio_contact_merges` is granted `INSERT` to `authenticated` with a policy that only checks
that both ids are cards in the caller's own studio. It does **not** check that
`studio_contacts.merged_into` actually says so. B2-1 closed the pointer against every writer but
the RPC; the other half of PR-o's record — the table whose own COMMENT says "PR-o's *both ids
stay resolvable* is this table plus `studio_contacts.merged_into`" (`00629:277-283`) — is still
writable by hand, and there is no UPDATE or DELETE policy to undo a bad row.

Measured (`probe400-w3-r3.sql`, rolled back), as a plain member:

```
D a plain member INSERTed a lineage row for a merge that never happened
D lineage rows naming a LIVE card as merged away: 1 (its merged_into is <NULL>)
```

The W4 merge sheet / lineage reader is owed this table; a forged row says "this card was merged
into that one" over a card the Directory still emits its own row for.

**Fix**: drop `studio_contacts_member_insert` and the `INSERT` grant (the RPC is SECURITY
DEFINER and does not need them — its own COMMENT says so), or add the agreeing predicate
`EXISTS (SELECT 1 FROM studio_contacts sc WHERE sc.id = merged_id AND sc.merged_into =
survivor_id)` to the WITH CHECK.

---

### W3-R3-6 · MINOR · confidence HIGH — `w3-data-report.md` §3 and §8 under-count the bid columns

`build/w3-data-report.md:135-145` lists five columns on `project_parties`; `:323` repeats the
five as the generated-types diff. `00631:53-62` adds **eight** — `bid_asked_at`,
`bid_quoted_at` and `bid_selected_at` as well — and `packages/supabase/src/database.types.ts`
carries all eight. The three extra columns are the ones R-R's "Quoted 2 October 2026. Selected
9 October 2026." and SPEC §5.4 #9's "Asked 28 September 2026" are built on, so the row the W4
wave reads to learn what it may print is the one that is short. (The r2 fix log describes them;
the report Fable reads does not.)

---

### W3-R3-7 · MINOR · confidence HIGH — `people_directory`'s COMMENT is now two edits behind its body (m2-2, carried)

`00629:1222` re-issues the view and does not re-issue its COMMENT. The live comment
(`obj_description('public.people_directory')`) still reads "v7 (00626 …)" and describes neither
the `merged_into IS NULL` fold on the CONTACTS branch (`00629:1764`) nor the TEAM branch's new
`project_tenant_org()` leg (`00629:1663-1666`). 00629's own header meanwhile calls the result
"people_directory v5" while the shipped comment calls the 00626 body v7, so the file and the
object disagree about the version number too. Open since r2 by instruction; still open.

---

### W3-R3-8 · MINOR · confidence HIGH — the nightly sweep announces paper held by an ARCHIVED card

`00630:240-258`. The scan filters `sc.merged_into IS NULL` (B2-4) but takes no `archived_at`
leg, so a card the studio has soft-deleted through `archive_studio_contact()` still earns
`studio_compliance_notices` rows and one `notification_log` row per owner/admin, with a
`/people?firm=<id>` deep link into a card the room's default lens filters out. The same argument
B2-4 makes for a folded card applies to an archived one: the studio is told to chase paper for a
firm it has put away.

---

### W3-R3-9 · MINOR · confidence MEDIUM — the merge can leave two `preferred` channels on one card

`00629:896-907`. The union drops exact duplicates by `(channel_kind, value)` — the shape of
`idx_studio_contact_channels_owner_kind_value` — but nothing reconciles `preferred`, and
`studio_contact_channels` has no "one preferred per owner" constraint (`00593:84`, `:335-336`).
Two cards each carrying a preferred mobile therefore leave the survivor with two rows marked
PREFERRED, and direction §5.1's Channels row prints a PREFERRED marker per row. Not reproduced
(the seeded and probe cards carry no channel rows), hence medium confidence; the shape is
readable from the schema.

---

### W3-R3-10 · MINOR · confidence MEDIUM — deleting a survivor card erases the merge from both records at once

`00629:55` (`merged_into` FK `ON DELETE SET NULL`), `:253-254` (`studio_contact_merges`
survivor/merged FKs `ON DELETE CASCADE`) and `:144-150` (the trigger's referential-action
escape). A `DELETE` of the survivor clears every `merged_into` pointing at it *and* cascades the
lineage row away, so an "append-only" record of the act vanishes with no trace. `authenticated`
holds no DELETE on `studio_contacts` (00417 revokes it explicitly and re-grants only
SELECT/INSERT/UPDATE — verified), so this is reachable only by `service_role` or a migration;
the mismatch is that `merged_into` chose SET NULL "so losing the survivor must not vaporise the
history" (`00629:71-72`) while the table that *is* the history chose CASCADE.

---

## 3. Checked and clean

* **Merge is transactional and does not orphan a seat, a designation or a household.** Seats,
  `company_id`, `warranty_contact_person_id`, `bid_quoted_by_person_id`, the three designations
  and `client_households.member_person_ids` / `primary_member_person_id` all repoint before the
  pointer is set (`00629:1075-1156`), and suite block 1 asserts each. `assert_party_card_not_merged()`
  (`00629:387-435`) refuses the later stale write; probe400 confirms 0 Directory rows for an
  absorbed card.
* **`merged_into` is resolved by `people_directory`** — the CONTACTS branch folds it away
  (`00629:1764`) and `resolve_merged_contact()` maps the old id forward, SECURITY INVOKER, so a
  non-member resolves NULL (probe400 §E: `<NULL>`).
* **No company into a person, no person into a firm.** `merge_kind_mismatch` in the RPC
  (`00629:882-893`) and `studio_contact_merge_kind_mismatch` in the trigger (`00629:177-185`);
  the sole-proprietor fold is the one exception and it moves the paper correctly, including a
  two-row renewal chain in either physical order (probe K2/K3).
* **The sweep is idempotent, locked, schema-qualified and the cron is guarded.**
  `pg_try_advisory_xact_lock` + `skipped` `job_runs` row (`00630:215-219`), the
  `UNIQUE (document_id, state)` index as the idempotency rule, the notification written only
  where the notice landed, `cron.unschedule` behind an `EXISTS` guard with the bare
  `cron.schedule` deliberately unwrapped (`00630:399-416`), body schema-qualified. Re-measured
  against the seeded book: 3 scanned, 3 notices, 6 notifications on the first run; 0 and 0 on the
  second; two `succeeded` `job_runs` rows.
* **Notice recipients are owners and admins only** (`00630:345-348`, R-AC) — suite block 2
  asserts a plain member is never notified.
* **Households RLS.** The tenant leg beside `is_studio_comember(designer_id)` is real: a member
  of a second studio the designer of record also belongs to reads **0** household rows and no
  figure, while a plain member of the owning studio reads 1 (probe400 §C). PR-n is enforced over
  a *change* by `assert_household_threshold_principal()` (`00632:182-218`), which is what the
  WITH CHECK could not do.
* **`add_household_member()` cannot open a seat on another studio's project** — refused
  `party_studio_contact_other_studio` (probe401 §H), and the whole act rolls back with it.
* **The court CHECK is a strict superset** (`00633:44-53`) — every live row stays valid; suite
  block 4 takes all four new words and refuses an undefined one.
* **Archive gating** — owner/admin only, non-member reads `studio_contact_not_found` so no card
  id leaks, idempotent (`00629:1778-1849`); suite block 5.
* **The `studio_id` backfill leaves ambiguous designers NULL.** On the seeded book 5 of 8
  projects stay NULL, all of them ambiguous, exactly as `w3-data-report.md` §6 reports; the
  statement is `WHERE studio_id IS NULL` and `n_orgs = 1`, so it is idempotent.
* **`project_consent_org()` callers.** The brief's line ("no `project_consent_org()` caller
  remains") reads narrower than R-BD, which retires it "from guards and reducers". The twelve
  remaining callers enumerated in `00628:56-85` are the consent ledger's key, and grafting them
  onto the caller-relative `project_tenant_org()` would make one number read two verdicts.
  Re-checked on a fresh database: every one of the twelve is a `channel_consent_status(...)` /
  `identity_consent_*` key, and the one gate that names it (`00629:1527-1528`) gates *the
  consent word* on membership of the record's own org, which is correct. Not a finding.
* **R-AY.** No W3 migration reads or writes a consent table, a consent RPC or a frozen
  `project_parties.sms_consent_*` column; the only occurrences are the `meta` key name and
  COMMENT prose (grep over all six files).
* **Money is integer cents** (`bid_amount_cents`, `co_threshold_cents`), vocabularies are CHECK
  constraints stated as named constraints so a rerun widens them, every SECURITY DEFINER
  function pins `search_path`, every new function carries `REVOKE ALL FROM PUBLIC, anon` (and
  `authenticated` on the trigger functions and the job), and every new table carries RLS plus
  explicit grants in both directions.

---

## 4. Not findings (settled, or scoped elsewhere)

* Every ruling in `rulings.md` §3, per the brief.
* The travel-list picker (CRM-24, SPEC §5.7), the merge sheet's layout and the Bidding band's
  face — W4 portal scope, and R-BM.
* The TEAM branch's tenant leg is now taken (`00629:1663-1666`), closing the item
  `w3-data-report.md` §7 owed to Fable.
* The 30-day window stated twice (`compliance_state()` and `compliance_document_state()`) —
  declared in `00630:46-51` and in `w3-data-report.md` §10 item 2.
* `bid_due_at` / `bid_valid_until` / `bid_selected_at` empty after the backfill — declared, and
  correct: there is no source.
* The `supabase:reset` telemetry `EPERM` — harness/sandbox, named in two prior QA rounds.
