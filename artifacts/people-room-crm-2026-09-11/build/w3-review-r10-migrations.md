# W3 (P2) — adversarial migration review, round 10

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `d06cbe50e`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no file edited.**

Read in full: `00628`–`00633`, the three grafted bodies they re-issue (`assert_compliance_holder`
00623, `sync_person_affiliation_from_pointer` 00592, `rolodex_card_for_party_phone` /
`link_rolodex_card_to_parties` 00626), `people_directory` v4 and v5,
`supabase/tests/people/w3_merge_sweep_household_test.sql`, `w3-data-report.md`,
`w3-fix-log-r9.md`, `rulings.md`, `direction.md` §3.1/§3.4/§5/§7/§8/§9,
`crm-model.md` §4 + CRM-24, `SPEC.md` §5.4/§5.7, `fixture.md` §4.

**Verdict: NOT clean — one BLOCKING, zero major, six minor.**

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | rc=0, clean replay, head **00633** (`supabase_migrations.schema_migrations`). The CLI's `~/.supabase/telemetry.json` write needs the sandbox off — harness, not product |
| `cron.job` after the clean reset | `compliance-document-expiry-sweep · 0 6 * * * · active`, body `SELECT public.sweep_compliance_expiries();` |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (before AND after the reset) |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff** (baseline + 2763 replayed statements) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| migration numbering | 00628–00633, all above 00627, none inside the reserved 00595–00620 |
| `grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" \| tail -1` for every redefined object | every graft takes the true latest body (00623 / 00592 / 00626); `studio_contacts_member_insert/update` are 00417's, and 00593's only mention of them is a comment |
| code-only diff, `people_directory` 00626 → 00629 | **exactly two deltas** — the TEAM branch's tenant leg and the CONTACTS branch's `AND sc.merged_into IS NULL`. Nothing else moved |
| code-only diff, `assert_compliance_holder` 00623 → 00629 | one declaration, one assignment, six `v_retiring AND` guards. Every HINT byte for byte |
| function ACLs (`pg_proc.proacl`, `proconfig`) | every new DEFINER function pins `search_path=public`; no `anon` or `PUBLIC` execute anywhere; `sweep_compliance_expiries` is service_role-only; trigger functions hold nothing but postgres/service_role |

### Checklist items measured, not read

| Claim | Measured |
|---|---|
| merge cannot orphan a channel, document or seat (`probe54-r10-merge-no-orphan.sql`) | firm-into-firm fold with a two-deep supersede chain plus an unrelated lapsed bond: **0** documents, **0** channels, **0** seats left on the absorbed card; the absorbed head correctly earns the survivor's in-force certificate as its successor and the orphan bond still drives `lapsed` |
| no company into a person | `merge_kind_mismatch` unless survivor is a person with `is_sole_proprietor`; the pointer trigger restates it for every writer |
| `merged_into` resolved by `people_directory` | merged card emits no CONTACTS row; `resolve_merged_contact()` answers **NULL** for a caller in another tenant |
| sweep idempotent / locked / cron guarded | first run `{"notices":3,"scanned":3,"notified":6}`, second run `{"notices":0,"scanned":3,"notified":0}` |
| notice recipients owners/admins only | recipients group to `owner` and `admin` only; no `member` row |
| households RLS (`probe53-r10-rls-and-gating.sql`) | a co-owner of a second studio reads **0** of studio A's `client_households`; a plain member calling `add_household_member` with a threshold is refused `household_grant_forbidden` **and leaves no seat and no membership behind** |
| archive gating | a plain member calling `archive_studio_contact()` is refused `studio_contact_archive_forbidden` |
| court CHECK widened without invalidating rows | 11 words, strict superset of 00212/00281's 7; local ledger 6 rows, all `client` |
| `studio_id` backfill leaves ambiguous designers NULL | 8 projects, 3 stamped, 5 NULL, all 5 ambiguous, **0** carrying seats — and the test re-ENABLES `set_project_studio_id` before the statement under test, so the trigger interaction is exercised, not bypassed |
| consent record-only (R-AY) | no W3 migration reads or writes `project_parties.sms_consent_*`; the only occurrences are the metadata KEY names and comments |
| `add_household_member` cannot seat across tenants | a household member named against another studio's project is refused `party_studio_contact_other_studio` by 00624's own guard |

### Every r9 finding re-checked

| r9 | State |
|---|---|
| B-1 — the notice named the FIRM for a paper the PERSON holds | **fixed**, and held. `holder_name` keys on `holder_type` (00630:368-375); block 11d passes on a fresh reset |
| B-2 — the sole-proprietor fold stripped the firm's own name off the survivor | **fixed** for the survivor: `company_name` joins the COALESCE (00629:1590-1591) and the cross-kind DELETE is inside the suppression window (00629:1673-1675). Measured: survivor keeps `Northgate Probe Electric` and its pointer. **See BLOCKING-1 — the same fold takes the firm's PAPER off everybody else on that crew, which r9 did not reach** |
| M-1 — `add_household_member()` overwrote a grant the household did not source | **fixed**. The open row is read first; a foreign `source_clause` stands (00632:426-444); block 11f passes |
| R9-MAJOR-1 — the cleared-outcome sentence | **fixed** (portal lane, not re-reviewed here) |

---

## 2. BLOCKING-1 — the sole-proprietor fold blanks the firm's paper word on every OTHER person on that crew

**Severity: blocking. Confidence: high (measured twice, on two faces).**

`supabase/migrations/00629_studio_contact_merges.sql:1638-1681` (the `v_cross` affiliations branch)
and `:2011-2015` (the `v_cross` seats branch), read by
`public.identity_paper_state(sc.id, sc.company_id)` at `00629:2743` (Directory CONTACTS branch),
`00629:2477` (party branch) and `00626:2169` (`people_directory_seats.paper_state`).

### What happens

The fold moves **every** compliance document off the folded firm onto the surviving person
(`00629:1948-1964`) — correctly: the firm IS the person. It then deliberately leaves the CREW
pointing at the folded card: their affiliations are CLOSED with `to_date` rather than deleted and
their legacy `studio_contacts.company_id` keeps naming the folded firm, "so the crew must not lose
their firm's name off their Directory row" (r6 M-3, R-BN, `00629:1655-1663`).

Nothing resolves that pointer forward for **paper**. `identity_paper_state(card, firm)` asks
`compliance_state()` of the firm id it is handed, and the folded firm now holds nothing, so the
crew's paper word falls back to their own card alone.

### Measured

`build/probe52-r10-soleprop-crew-seat.sql` (fresh reset, rolled back): a studio with Dana Soleprop (`is_sole_proprietor`),
Joe Crew (Foreman since 2021), the firm Northgate Probe Electric, and the firm's `coi_gl`
**lapsed 2026-03-31 gating `{site_access, payment, draw}`**; Joe holds a seat on the job stamped
with his card and the firm.

| Face | Before the fold | After the fold |
|---|---|---|
| `people_directory` — Joe Crew | firm `Northgate Probe Electric`, paper **`lapsed`** | firm `Northgate Probe Electric`, paper **`not_on_file`** |
| `people_directory_seats` — Joe's seat line | paper **`lapsed`** | paper **`not_on_file`** |
| Dana Soleprop (the survivor) | `lapsed` | `lapsed` (correct) |
| documents left on the folded firm | 1 | 0 |
| Joe's affiliation | open, Foreman | closed `to_date = <fold day>`, Foreman, pointer still the folded card |

`build/probe51-r10-soleprop-crew-paper.sql` reproduces the Directory half on a second fixture with no seats at all, so the
defect is in the identity's own row and not only in the seat view.

### Why this is blocking and not a shrug

The row still NAMES the firm — that is the whole point of r6 M-3's pointer preservation — and the
column beside the name now says the firm has no paper on file. One row, two disagreeing facts,
about a certificate that exists, that lapsed, and that carries `site_access` in `blocks[]`.

* PR-h: "Both, one source… the roster row prints a held clause in words with a terracotta leading
  rule", and its stated failure mode is precisely *"the lapse is visible only on the firm card, and
  a designer mobilises an uninsured sub from the Call Sheet."* Joe's roster row loses the held
  clause SPEC §5.4 #7 makes a hard acceptance criterion.
* R-BA: "the paper word for an identity reduces worst-first over BOTH the person's own documents
  and their firm's; one formula serves every reader." After the fold Joe's firm is the survivor's
  card, and no reader is told.
* R-K / C13: `Not on file` is the word for paper the studio never collected. Printing it over a
  firm that filed and lapsed is the inversion C13 exists to prevent.
* R-BN: "a merge never deletes a typed fact." Nothing was deleted from the table — but the
  certificate became unreadable from the three faces that decide whether a body gets on site,
  which is r4 B-1's own standard applied to the rest of the row.

This is reachable by the single act the `v_cross` branch exists for, on the fixture's own motivating
pair (F-11 Dana Kowalski, sole proprietor, Northgate Electric, the only lapsed certificate in the
book), and the file itself already documents "a sole proprietor who really has crew" as a real case
it means to support.

### Where a fix belongs (not prescriptive)

The crew's pointer MUST keep naming the folded card (R-BN, r6 M-3), so the resolution belongs in the
reader, not in the fold. The smallest shape that closes all three faces at once is to resolve the
firm argument forward at the three `identity_paper_state()` call sites —
`identity_paper_state(sc.id, public.resolve_merged_contact(sc.company_id))` at `00629:2743`,
the same at `00629:2477`, and inside `people_directory_seats`' `COALESCE(seat.company_id,
card.company_id)` at `00626:2169` — or to teach `identity_paper_state()` itself to resolve its
second argument, which keeps "one formula serves every reader" literally true. Either way the
seat-side half also needs a thought: `00629:2014` nulls `project_parties.company_id` for EVERY seat
naming the folded firm, not only the sole proprietor's own, so a crew seat loses its firm pointer
as well and falls back to the card's.

A new SQL block pinning it would assert, on a fold with a third-party crew member and a lapsed
firm certificate: the crew's `people_directory.paper_state` is still `lapsed`, their seat line's
`paper_state` is still `lapsed`, and the survivor's is unchanged — with the firm-into-firm merge as
the negative control (it already repoints `company_id` at `00629:1736` and is unaffected).

---

## 3. Minor

### m1 — the nightly sweep announces paper held by a card the studio has PUT AWAY
**minor · high confidence** — `00630:378-394`.

The sweep's cursor takes `sc.merged_into IS NULL` (r2 B2-4) but no `archived_at` leg. Measured
(`build/probe50-r10-archived-card-notice.sql`, fresh reset, rolled back): an archived company card holding a `coi_gl` that lapsed
10 days ago earned a notice row and a notification to every owner and admin —
`"Put Away Co's paper has lapsed"`, `"The certificate of insurance for Put Away Co lapsed 4 Sep
2026."`, deep link `/people?firm=…` — and it will do so again for every new date the card ever
carries. The argument r2 B2-4 made for `merged_into` is weaker here (`useStudioContact(id)` fetches
by id with no archived filter, so the deep link does open the card, and `people_directory` still
emits the row with `status = 'archived'`), which is why this is minor rather than a repeat of that
finding. It is still nightly noise about a card the studio deliberately took out of the book, on the
one notice family direction §8 P2 promises is worth reading.

### m2 — deleting a household, or dropping a member from the array, orphans the money grants it sourced
**minor · medium confidence** — `00632:259-270` (the DELETE policy and the blanket
`GRANT … DELETE … TO authenticated`) against `00632:560-596`.

`set_household_threshold()` is careful in both directions: it moves only grants whose
`source_clause` is the household's, and erasing the figure CLOSES them with `effective_to`
"because a NULL threshold reads 'Signs money.' with no cap". Deleting the whole household does
neither — the open `project_party_authority` rows stay standing, still stamped
`source_clause = 'client_households.co_threshold_cents'`, now naming a row that no longer exists,
and `set_household_threshold()` can never reach them again (it needs the household). Removing a
person from `member_person_ids` has the same effect one grant at a time, since the loop's predicate
is `pp.studio_contact_id = ANY (v_h.member_person_ids)`. Neither act has a room surface today
(`use-households.ts` exposes create / set-threshold / add-member and nothing else), so this is latent
rather than live — but both are reachable through PostgREST by any owner/admin, and the standing
grant is exactly the "two contradictory facts about the same household" harm `household-band.tsx`'s
own banner names.

### m3 — `resolve_merged_contact()` is the one new function with no pinned `search_path`
**minor · high confidence** — `00629:355-372`; confirmed against `pg_proc.proconfig`, which is empty
for this function and `{search_path=public}` for all eighteen others in the wave, including its two
SECURITY INVOKER siblings `compliance_document_state()` (00630:78) and
`contact_rule_blocks_contact()` (00629:903). Not exploitable — it is INVOKER, its body
schema-qualifies `public.studio_contacts`, and its one internal caller
(`rolodex_card_for_party_phone`, 00629:503) has already pinned the path — but it is the wave's only
deviation from its own rule, and the report's §9 signature list records the absence without
flagging it.

### m4 — `w3-data-report.md` §2 says "33 papers in total" where the breakdown and the database say 36
**minor · high confidence** — `w3-data-report.md:132`. The line reads "33 papers in total: 9
`current`, 24 `held`, 2 `lapsed`, 1 `lapses_soon`"; those four sum to 36, and measured on a fresh
reset the database holds exactly 36 (`current` 9, `held` 24, `lapsed` 2, `lapses_soon` 1). The three
notices and six notifications the same paragraph predicts are right — measured
`{"notices":3,"notified":6}`. Only the total is wrong, in the record rather than on a face.

### m5 — "every one is the consent ledger's key, not a guard" is not quite true of `people_directory`
**minor · medium confidence** — `w3-data-report.md` §6 and `00628:56-80` both state that all twelve
remaining `project_consent_org()` call sites are the ledger's key and none is "a guard or a
reducer". At `00629:2519-2528` the call sits inside
`CASE WHEN public.is_active_studio_member(public.project_consent_org(q0.project_id)) THEN …` —
which is a visibility guard: it decides whether the consent word renders at all. The CODE is right
and deliberately so (r6 MAJOR-1: the question is "may this caller read the record that decides the
word", so it must be keyed at the RECORD's org, not the caller's), but R-BD's retirement is scoped
to "guards and reducers", and the enumeration that declares the debt discharged describes this one
inaccurately. Worth one sentence in the record rather than a code change.

### m6 — two small internal inconsistencies in 00629
**minor · high confidence.**
`merge_studio_contacts()` declares `v_merge_id` (`00629:1100`) and assigns it from the lineage
INSERT's `RETURNING` (`:2125`) but never reads it; the function returns `p_survivor`.
And `studio_contact_merges`' own COMMENT says the lineage is one "nobody may forge or take back"
(`:296-298`) while `00629:341` grants `service_role` INSERT, UPDATE and DELETE on it — server-side
only, so not a hole, but the sentence and the grant disagree.

---

## 4. What was checked and found sound (not findings)

* **Grants both directions.** Every new table: `REVOKE ALL … FROM PUBLIC, anon, authenticated` then
  an explicit re-grant. `studio_contact_merges` and `studio_compliance_notices` give `authenticated`
  **SELECT only**, with no INSERT/UPDATE/DELETE policy at all — verified against
  `information_schema.role_table_grants` and `pg_policy`.
* **The `merged_into` write door.** `assert_merged_into_write()` refuses every caller but the RPC,
  owners and admins included, and restates the same-studio and legal-kind rules for every writer
  including `service_role`; the FK's `ON DELETE SET NULL` path is exempted correctly. The member
  INSERT/UPDATE policies carry the new `merged_into IS NULL` predicate; the 00417 admin leg is
  deliberately unchanged and the trigger is what holds it.
* **The supersede ordering.** Heads first, lineage outermost-first under a depth cap, the new edge
  last — and the capture query mirrors every leg `assert_compliance_holder()` will re-judge
  (same `doc_type`, head-of-chain, in force, dated-when-dated, `blocks <@`). The chosen successor is
  on the survivor and is untouched by statements 1 and 2, so the capture cannot go stale.
* **Every FK into `studio_contacts`.** All twenty enumerated from `pg_constraint`; each is either
  repointed by the RPC, structurally unreachable (a rule may not route at a company; a household's
  primary member must be in its own array), or a declared freeze (a SENT
  `studio_trade_agreements.contact_id`, 00579's). `project_site_access_cards.told_refs` holds SEAT
  ids on the shipped path (`useLogSiteAccessTold` writes `seatIds`, `site-access-card.tsx:240-243`
  reads them as seat ids), and seats survive a merge, so the "Told:" line is unaffected.
* **Trigger side effects of the merge.** `fc_dispatch_optin_invite` cannot fire (the seat repoint
  changes no consent column, and its UPDATE leg returns early when OLD already reads `pending` with
  evidence); `refuse_legacy_consent_write_trg` names phone columns the merge never writes;
  `link_rolodex_card_to_parties` now stands down for a merged card.
* **00628 and the shipped trigger.** `set_project_studio_id()` reaches its `v_postgres_migration`
  return after the UPDATE immutability checks and before every membership assertion, and the
  candidate-discovery block is skipped because `NEW.studio_id` is already set. The SQL test
  re-ENABLES the trigger before the statement under test, so this is exercised, not assumed.
* **00631's backfill.** Guarded `WHERE pp.bid_outcome IS NULL`; the SET list names neither
  `studio_contact_id`/`company_id` nor `bid_quoted_by_person_id`, so neither the merged-card guard
  nor the quoting-person guard fires on it. `bid_selected_at`, `bid_due_at`, `bid_valid_until` and
  `status='closed'` are refused rather than guessed. All six outcome words map into direction §3.8's
  own vocabulary through `SEAT_BID_OUTCOME_LABELS`.
* **CRM-24's travel list.** `travel-list-pane.tsx:19-34` carries exactly crm-model CRM-24's six
  travelling facts and three that stay behind, and the bring-forward insert names none of
  `show_to_client` / pricing / notes (`use-coordination.ts:2581-2582`).
* **Idempotency.** Every DDL statement is `IF NOT EXISTS` / `DROP … IF EXISTS` / `CREATE OR REPLACE`;
  00630's `expires_on` widening (add nullable → backfill → `SET NOT NULL`) is safe on a fresh
  database and on one carrying the pre-r5 shape; both one-time backfills are predicate-guarded.
* **Money is integer cents** on `bid_amount_cents`, `co_threshold_cents` and
  `project_party_authority.threshold_cents`; every new vocabulary is a named CHECK, no enums.
