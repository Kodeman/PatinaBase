# W3 (P2) — adversarial migration review, round 13

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `227d68ac1`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full: `00628`–`00633`; the grafted bodies they re-issue (`assert_compliance_holder` 00623,
`sync_person_affiliation_from_pointer` 00592, `identity_paper_state` / `rolodex_card_for_party_phone`
/ `link_rolodex_card_to_parties` 00626); `assert_project_party_cards`, `project_tenant_org`,
`project_recorded_studio`, `identity_phone_numbers`, `people_directory_seats`;
`supabase/tests/people/w3_merge_sweep_household_test.sql`; `w3-data-report.md`;
`w3-fix-log-r12.md`; `w3-review-r12-migrations.md`; `rulings.md`; `direction.md`
§3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a-report.md`,
`w1b-report.md`, `w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md` §4.

**Verdict: NOT clean — zero blocking, TWO major, fifteen minor.**

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **rc=0, clean replay**, head `00633` |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff** (2765 replayed statements) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| `cron.job` after the clean reset | `compliance-document-expiry-sweep · 0 6 * * * · active`, body `SELECT public.sweep_compliance_expiries();` |
| the nightly cron actually FIRED at 06:00 during this round | `job_runs`: `succeeded {"notices":3,"scanned":3,"notified":6}`, then two manual re-runs `{"notices":0,...}` — idempotency measured on the real job, not only in a rolled-back block |
| migration numbering | W3 mints 00628–00633 — all above 00627, none inside the reserved 00595–00620 |
| function ACL / `proconfig` sweep over all 20 wave functions (`pg_proc`) | no `anon`, no `PUBLIC`; every DEFINER pins `search_path=public`; `sweep_compliance_expiries` service_role-only; trigger functions postgres/service_role only. One deviation, m3 |
| table ACL + RLS on the three new tables | `studio_contact_merges` / `studio_compliance_notices`: RLS on, `authenticated=r` only, SELECT policy only. `client_households`: `authenticated=arwd`, four policies. No `anon` on any of the three |
| every FK into `studio_contacts` (20, re-enumerated from `pg_constraint`) | each repointed by the RPC, structurally unreachable, or a declared freeze. `project_site_access_cards.told_refs` re-checked this round: `site-access-card.tsx:240-243` resolves it as SEAT ids only and a merge never changes a seat id — **not** a missing repoint |
| R-AY (record-only consent) | no W3 migration reads or writes `project_parties.sms_consent_*` for a verdict or writes `studio_channel_consent`; the only occurrences (`00629:2668-2670`) are metadata KEY names carrying record-derived values |
| `project_consent_org()` callers on a fresh reset | twelve, exactly the enumeration `00628:64-69` / report §6 gives. See m5 for the one it mis-describes |
| 00628 backfill outcome | 8 projects, 5 still `studio_id IS NULL`, **all five ambiguous** (designer `a0…0004` holds 2 active design-studio memberships) — R-BD's "ambiguous ones stay NULL" holds, measured |
| 00633 | `client_decisions` ledger 6 rows, all `court='client'`; widened CHECK admits a strict superset, no row invalidated |
| archive gating | measured: plain member → `studio_contact_archive_forbidden`; non-member → `studio_contact_not_found`; owner → archived, and the second call is idempotent; an OWNER's direct `PATCH merged_into` → `studio_contact_merge_pointer_forbidden` |

### Every r12 finding re-checked

| r12 | State |
|---|---|
| **MAJOR-1** — 00631's bid backfill rewrote `project_parties` in bulk with `set_updated_at_project_parties` armed | **FIXED.** `00631:335` / `:404` bracket the statement exactly as `00624:806/819` does; the NOTICE at `:422-424` prints the affected-seat count and says `updated_at` was not moved; block 7d + its unbracketed negative control pass on a clean reset |
| **MAJOR-2** — the studio-less pre-check asked a different resolver than the guard leg | **FIXED for the two `*_has_no_studio` legs** (`00629:1459-1480`), blocks 11i/11j/11k pass. **REOPENED in a third leg** — see this round's MAJOR-1: the same guard's `party_studio_contact_other_studio` leg is still unchecked and still reaches the sheet raw |
| code MAJOR-1 — `retainedComplianceDocuments` lost the `doc_type` leg | **FIXED**, `use-studio-contacts.ts:1590/1607` |
| qa owed-1 — the bring-forward acceptance text vs the seed | **STILL OWED A RULING.** `rulings.md` §3's last entry is R-BP (2026-09-14) and nothing in §3 reaches it. Not a migration finding |
| m1 — the sweep announces paper held by an ARCHIVED card | **OPEN.** `00630:376-394` carries `sc.merged_into IS NULL` and no `archived_at` leg |
| m2 — deleting a household, or dropping a member, orphans the money grants | **OPEN** (structural) |
| m3 — `resolve_merged_contact()` has no pinned `search_path` | **OPEN.** `pg_proc.proconfig` empty for it, `{search_path=public}` for all nineteen others |
| m4 — "33 papers in total" where the database says 36 | **OPEN.** Re-measured: `current` 9, `held` 24, `lapsed` 2, `lapses_soon` 1 = **36**; `w3-data-report.md:132` still reads 33 |
| m5 — the enumeration calls a visibility guard a ledger key | **OPEN.** `00629:2736-2737` still wraps the word in `CASE WHEN is_active_studio_member(project_consent_org(q0.project_id))` |
| m6 — `v_merge_id` unused; lineage COMMENT vs the `service_role` grant | **OPEN.** `00629:1209` / `:2335`; `:296-304` vs `:344` |
| m7 — `people_directory`'s own COMMENT still describes v4 | **OPEN**, re-measured: `obj_description('public.people_directory')` does not contain `merged_into` |
| m8 — `identity_paper_state()` runs two recursive walks per emitted Directory row | **OPEN** (`00629:1146-1160`, now four walks — two `resolve_merged_contact()` plus two `compliance_state()`) |
| m9 — the report is stale about the RPC's refusal list | **OPEN.** `w3-data-report.md:45` still reads "Eleven" and omits `merge_seat_on_studioless_project` |
| m10 — `add_household_member()` raises the guard's raw token on a studio-less job | **OPEN.** `00632:373-380` inserts the seat before any studio check, and for a household with no threshold there is no such check at all |
| m11 — 00628's backfill bumps `projects.updated_at` | **OPEN** (low confidence, as before) |

---

## 2. MAJOR-1 — the merge still aborts with a raw schema token on a seat stamped with a card of ANOTHER studio; r12's pre-check covers two of the guard's three doors

**Severity: major. Confidence: high (measured on a fresh reset, rolled back).**

`assert_project_party_cards()` (00624) has **three** ways to refuse a seat repoint, not two.
r11 pinned one, r12 pinned the second, and the third is untouched:

| leg | raises | reached when |
|---|---|---|
| 1 | `party_card_project_has_no_studio` | `project_tenant_org(project) IS NULL` |
| 2 | `party_card_project_has_no_studio` | `NEW.studio_contact_id IS NOT NULL` and `project_recorded_studio(project) IS NULL` |
| 3 | **`party_studio_contact_other_studio`** | the card's `organization_id` is not the project's `v_org` **and** `v_recorded` |

`00629:1459-1473`'s pre-check asks only legs 1 and 2 (`… IS NULL` on both resolvers). Leg 3 is
reached where **both** resolvers answer non-NULL and simply name a different studio from the card's
— the legacy shape `00629:2934-2937`'s own comment records as existing on the table:

> "a seat stamped with a card of ANOTHER studio — a shape 00624's R-AP guard refuses on every write
> from this wave onward but cannot undo on rows already on the table (00624:724-739's preflight,
> **unmeasured on Strata**)"

### Measured

`/tmp/claude/probe-r13-a.sql` — fresh reset, one transaction, ROLLBACKed. Studio A holds the two
duplicate cards; studio C holds a job that RECORDS studio C; one legacy seat on that job carries
studio A's card (staged around `assert_project_party_cards_trg`, the way blocks 11i/11j stage
theirs). The caller is studio A's owner:

```
A. resolvers: tenant=fa00…000c recorded=fa00…000c  (both non-NULL => pre-check finds nothing)
A. MERGE REFUSED -> party_studio_contact_other_studio
```

### Why it is the same harm r11 and r12 were ruled on

`asMergeError()` (`packages/supabase/src/hooks/use-studio-contacts.ts:1958-1977`) matches
`MERGE_REFUSAL_SENTENCES` and **falls through to `return message`** for anything else, so the raw
token `party_studio_contact_other_studio` is what the merge sheet's `role="alert"` paragraph
prints. That is a schema word on a face (SPEC §7, §5.7 #8), naming no act — and the pair can never
be folded, because nothing in the People room re-stamps a seat's studio. The two prior rounds ruled
exactly this major, with the refusal token as the only difference.

The mirror legs behave the same way: `party_company_other_studio` (`00629:2225`/`:2230`'s
`company_id` repoint) and `party_warranty_contact_other_studio` (`:2226-2234`).

### Blast radius, and the number the deploy will not have

00628's NOTICE counts studio-less projects, the seats on them, and the `has_designer_domain_role`
delta. It does **not** count seats whose `studio_contact_id`'s organization differs from the
project's studio — so 00624:724-739's preflight is still the only source for this population, and
the report's §10 item 5 does not ask for it. 0 such rows locally.

### Where a fix belongs (not prescriptive)

Either a fourth conjunct on the same pre-check (`the card's org <> project_tenant_org / 
project_recorded_studio`) with its own refusal name and the job in DETAIL, a sentence for that name
in `MERGE_REFUSAL_SENTENCES`, and a block in 11j's shape; or a generic non-`merge_*` fallback
sentence in `asMergeError()` so no guard token can reach a face — which would cover leg 3 and every
future leg at once, at the cost of naming no act.

---

## 3. MAJOR-2 — an ordinary firm-duplicate merge moves `project_parties.updated_at` and flips an uncarded identity's Directory row onto an old job, with `last_touch_at` reading the merge instant

**Severity: major. Confidence: high (measured, with a negative control).**

This is r12 MAJOR-1's mechanism reached through a live studio act instead of a one-time deploy
statement. `set_updated_at_project_parties` is armed for every one of the merge's seat repoints:

* `00629:2225` `UPDATE project_parties SET company_id = NULL WHERE company_id = p_merged` (cross fold)
* `00629:2230` `UPDATE project_parties SET company_id = p_survivor WHERE company_id = p_merged` (firm survivor)
* `00629:2226-2234` `SET warranty_contact_person_id = p_survivor`

All three can match **UNCARDED** seats (`studio_contact_id IS NULL`), which are exactly the rows
people_directory's PARTY branch ranks by `pp.updated_at DESC` (`00629:2804-2807`) and
`people_directory_seats` names `person_id` from
(`first_value(pp.id) OVER (… ORDER BY … pp.updated_at DESC, pp.id)`). r12's own MAJOR-1 states the
rule this breaks in terms: *"updated_at is not bookkeeping on this table: it is the tie-break
people_directory's PARTY branch ranks one identity's seats by … and the same order
people_directory_seats' first_value(pp.id) window uses to name person_id."*

### Measured

`/tmp/claude/probe-r13-d.sql` — fresh reset, one transaction, ROLLBACKed. Two firm cards
("Stonehaven Tile" / "Stonehaven Tile Gallery" — crm-model §4 rule 4, SPEC §5.7 #4d's "Saved twice,
one firm"); one UNCARDED human, `Marta Uncarded`, keyed on a phone, holding two seats: an OLD seat
on a closed job carrying the duplicate firm card, 400 days quiet, and a LIVE seat, 10 days quiet:

```
D-a BEFORE merge: seat=fb40…0002 job=LIVE job       firm=<NULL>                  last_touch=2026-09-05
D-b AFTER  merge: seat=fb40…0001 job=OLD closed job firm=Stonehaven Tile Gallery last_touch=2026-09-15
```

Negative control, `/tmp/claude/probe-r13-d2.sql` — the identical merge with
`set_updated_at_project_parties` DISABLED:

```
D2-b AFTER(updated_at trigger OFF) merge: seat=fb40…0002 job=LIVE job firm=<NULL> last_touch=2026-09-05
```

so the mechanism is that trigger and nothing else in the RPC.

### Why it is a wrong fact on a face, not bookkeeping

The room says this human's current job is a closed one and that the studio touched her today,
because the studio folded two firm cards. `party-profile-sheet.tsx` opens against the row's
`person_id`, which moved with it. Unlike r12 MAJOR-1 this is not bounded by a deploy: it recurs on
every firm-duplicate fold, which is precisely the act direction §3.1's duplicate band and direction
§8's P2 line ("duplicates converge") exist for.

### Blast radius

Every uncarded identity holding more than one seat where one of those seats names the folded firm
(or the folded person as its warranty contact) and is not already the most-recently-updated seat.
0 such rows in the seeded book; unmeasured on Strata and not among 00628's numbers.

### Where a fix belongs (not prescriptive)

`ALTER TABLE … DISABLE TRIGGER` inside the RPC would take an ACCESS EXCLUSIVE lock on
`project_parties` for the whole merge, which is a worse trade than the defect. The two shapes that
do not: capture each matched seat's `updated_at` before the three statements and restore it in one
`UPDATE … SET updated_at = <old>` with the trigger bracketed around that single narrow statement;
or give `update_updated_at_column()` the `patina.suppress_affiliation_sync` treatment (a
transaction-local GUC this RPC sets around its seat block, the idiom §5 already uses twice). Either
way the pin is r12's block 7d shape, over the merge instead of the backfill.

---

## 4. Minor

### m1 — the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · carried from r10/r11/r12, re-measured.** `00630:376-394` carries
`AND sc.merged_into IS NULL` and no `archived_at` leg, so a lapsed COI on an archived firm card
still writes a notice and an in-app notification to every owner and admin, deep-linking
`/people?firm=<id>` to a card `useStudioContacts(…, { includeArchived: false })` does not return.
0 archived holders in the seeded book, so it is not visible in a gate.

### m2 — deleting a household, or dropping a member from the array, still orphans the money grants it sourced
**minor · high confidence · carried, structural.** `00632:259-266` (the owner/admin DELETE policy)
and any direct `PATCH member_person_ids` leave open `project_party_authority` rows carrying
`source_clause = 'client_households.co_threshold_cents'` standing, with no household behind them.
`set_household_threshold()` (`:560-570`) is the only closer and it keys on the household's own
member array, which the delete has already emptied.

### m3 — `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · carried.** `00629:358-375`; `pg_proc.proconfig` is NULL for it and
`{search_path=public}` for the other nineteen. It is SECURITY INVOKER and every relation in the body
is schema-qualified, so the exposure is narrow — but it is now called twice per emitted Directory
row from inside `identity_paper_state()` (`00629:1147-1150`), which is a SET-pinned function, and
the wave's own stated rule is that every function pins.

### m4 — `w3-data-report.md:132` still says "33 papers in total" where the breakdown and the database say 36
**minor · high confidence · carried, re-measured.** `compliance_document_state()` over all 36 rows:
`current` 9, `held` 24, `lapsed` 2, `lapses_soon` 1 = 36. The four state counts in the same sentence
are right; the total is not.

### m5 — the `project_consent_org()` enumeration still describes one call site inaccurately
**minor · medium confidence · carried.** `w3-data-report.md` §6 and `00628:56-80` both say all twelve
remaining callers are "the CONSENT LEDGER'S KEY — not a guard and not a reducer". `00629:2736-2737`
is `CASE WHEN public.is_active_studio_member(public.project_consent_org(q0.project_id))` — a
membership GUARD on whether the affirmative word renders. The behaviour is right (and deliberately
so, per w1b r6 MAJOR-1: it narrows, it never widens); the sentence that enumerates it is not.

### m6 — two small internal inconsistencies in 00629
**minor · high confidence · carried.** `v_merge_id` is declared (`:1209`) and assigned
(`RETURNING id INTO v_merge_id`, `:2335`) and never read. And `studio_contact_merges`' COMMENT
(`:296-304`) says "a merge that happened is a fact nobody may forge or take back" beside
`GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role` (`:344`) — true of `authenticated`, not of
every writer.

### m7 — `people_directory`'s own COMMENT was not re-issued, so the record of the view still describes v4
**minor · high confidence · carried, re-measured.** `CREATE OR REPLACE VIEW` keeps the existing
comment; `obj_description('public.people_directory'::regclass)` does not contain `merged_into` and
does not mention the TEAM branch's new tenant leg. Both are deltas §6's banner calls out in the file
and neither reaches the database's own record of the object.

### m8 — `identity_paper_state()` now runs four recursive walks per emitted Directory row
**minor · medium confidence · carried and widened.** `00629:1146-1160`: two
`resolve_merged_contact()` recursive CTEs (depth cap 16) on top of the two `compliance_state()`
walks it already made, on a function called once per CONTACTS row and once per PARTY row. The
`identity_seats` CTE was materialised in W1b r11 for exactly this class of cost on the same view;
this one is untouched and the merged-card resolution it adds is a no-op for every unmerged card,
which is all of them today.

### m9 — `w3-data-report.md` is stale about the RPC's own refusal list, and its line citations
**minor · high confidence · carried, widened.** `:45` still reads "Refusals, in order: … **Eleven**,
not eight" and omits `merge_seat_on_studioless_project` (r11), which makes twelve. The same line's
three citations are stale by ~300 lines: `merge_survivor_archived` is at `00629:1294` not `:983`,
`merge_two_logins` at `:1323` not `:1011`, `merge_contact_rule_conflict` at `:1404` not `:1092`.

### m10 — `add_household_member()` on a job that records no studio raises the guard's raw token, not its own named refusal
**minor · high confidence (mechanism) · narrow population · carried.** `00632:373-380` inserts the
seat BEFORE `project_party_recorded_studio()` is ever consulted (`:390`), and for a household
carrying no `co_threshold_cents` it is never consulted at all — so on R-BI's legacy population the
INSERT raises `party_card_project_has_no_studio` from 00624 rather than
`household_grant_project_has_no_studio`, which this file defines two statements later for the same
condition.

### m11 — 00628's backfill bumps `projects.updated_at` for every project it repairs
**minor · low confidence · carried.** `update_projects_updated_at` is BEFORE UPDATE FOR EACH ROW on
`projects` and 00628:117-122 does not bracket it. Unlike `project_parties.updated_at`, nothing in
this program ranks by `projects.updated_at`; recorded because 00624's stated obligation is about
bulk column rewrites generally and this is one.

### m12 — NEW: a notice is SPENT even when nobody was told
**minor · high confidence (mechanism) · narrow population.** `00630:399-409` writes the
`studio_compliance_notices` row and increments `v_notices` first; `:454-486` then writes one
`notification_log` row per **active owner or admin** and never checks that any landed. A studio whose
only active members are plain `member`s therefore has the `(document_id, state, expires_on)` key
permanently consumed while `v_notified` stays 0, and — because the key is permanent and nothing but
a date change clears it (`:266-296`) — it is never told about that paper at that date again, even
after an owner is added. Direction §8 P2's promise ("a lapse announces itself before it blocks a
draw") fails silently for that studio. The symmetric rule the file already applies one statement
earlier ("the notification is written only where the notice row actually landed, so the two records
can never disagree") does not hold in this direction.

### m13 — NEW: after a firm-to-firm fold an uncarded seat's Directory row names the folded card's spelling
**minor · high confidence · measured.** Probe D above: after folding `Stonehaven Tile Gallery` into
`Stonehaven Tile`, the uncarded seat's row prints `meta.company_name = 'Stonehaven Tile Gallery'`
(`00629:2662`, the seat's free-text snapshot) while `pp.company_id` now names the survivor. The
snapshot is deliberately never written by the merge (`:2218-2219` argues the case for the CROSS
fold, where the folded card's name is the right one to keep). On a same-kind firm fold the argument
does not carry: the room is showing a firm name off a card it no longer emits a row for, beside a
pointer that says otherwise. Recorded as minor because the two names are the same firm.

### m14 — NEW: 00630's `merged_into` leg describes merge behaviour that r3 replaced
**minor · high confidence.** `00630:381-392` says "merge_studio_contacts() leaves an absorbed
document on the absorbed card wherever the survivor holds no successor to retire it (00629 §5,
crm-model §4) — correctly". §5 has not done that since r3 W3-R3-1: `00629:2088-2094` moves EVERY
absorbed head unconditionally and `:2096-2111` walks the lineage behind it, so no document remains
on a merged card at all (chains deeper than 16 renewals excepted). The leg is now pure defence in
depth; the comment states it as load-bearing and cites a rule that was reversed.

### m15 — NEW: `add_household_member()` does not read `archived_at`
**minor · medium confidence.** `00632:340-348` refuses a card that is missing, in another studio,
not a person, or merged away — but not one the studio has PUT AWAY. `assert_client_household_members()`
(`:123-136`) makes the same four tests and the same omission. So a card `useStudioContacts(…,
{ includeArchived: false })` hides can still be made a household member and seated on a job through
the RPC, which is the shape `merge_survivor_archived` (r5 M-4) exists to refuse one table over.

---

## 5. What was checked and found sound (not findings)

* **Merge is transactional and orphans nothing.** All 20 FK columns into `studio_contacts`
  re-enumerated from `pg_constraint`: `project_parties` ×4, `studio_contacts` ×5,
  `studio_person_affiliations` ×2, `studio_contact_channels`, `studio_compliance_documents`,
  `studio_contact_rules.route_to_person_id`, `studio_trade_agreement_tokens`,
  `agreement_draw_lien_waivers`, `studio_trade_agreements` (draft only — 00579's freeze),
  `client_households.primary_member_person_id`, `studio_contact_merges` ×2. Each is repointed,
  structurally unreachable for the kind pair, or a declared R-BN standing pointer that
  `resolve_merged_contact()` / `identity_paper_state()` (§4f) resolve forward.
  `project_site_access_cards.told_refs` was chased this round and is read as SEAT ids only.
* **`merged_into` is folded away by the Directory and by nothing else.** `00629:2966-2973`
  (CONTACTS branch), `§4b`'s resolver maps forward rather than excluding, `§4`'s seat guard keeps
  the answer live, and `00630:393` keeps the sweep off a folded card.
* **No company-into-person outside crm-model §4's one exception.** `00629:1301-1312` allows the
  fold only where merged is a `company`, survivor is a `person` AND `is_sole_proprietor`; every
  other cross-kind pair raises `merge_kind_mismatch`, and person→company is refused in every case.
  `assert_merged_into_write()` (`:196-204`) restates it for every writer including `service_role`.
* **The sweep.** Advisory xact lock → `skipped` `job_runs` row on contention → `app.actor` → a
  `running` row → guarded block with no re-RAISE (so a partial run's notices roll back to the
  savepoint and the failed row persists) → `succeeded` with `{scanned, notices, notified}`. Cron
  unschedule is EXISTS-guarded, the schedule itself deliberately unguarded, the body
  schema-qualified. Measured idempotent on the real 06:00 run plus two re-runs.
* **Notice recipients.** Measured: every `compliance_document_expiry` row in `notification_log`
  belongs to an `owner` or an `admin` of the holding org; no plain member. R-AC / PR-n.
* **Households RLS.** Four policies, all carrying the tenant leg beside `is_studio_comember()`
  (the declared narrowing of direction §7's line), owner/admin on DELETE and on any write carrying
  `co_threshold_cents`, plus `assert_household_threshold_principal()` reading the CHANGE so an
  ERASE is refused too. `add_household_member()` and `set_household_threshold()` restate both legs
  in their bodies because DEFINER bypasses the policies.
* **Court widening.** Purely additive; 6 live rows, all `client`; `project_tasks.owner` deliberately
  not widened, with the reason stated.
* **R-BD backfill.** `WHERE studio_id IS NULL` is the idempotency; `n_orgs = 1` is the only stamp;
  all five local studio-less projects have an ambiguous designer and stay NULL, measured.
* **R-AY.** No consent write anywhere in the wave; no verdict read from
  `project_parties.sms_consent_*`; `identity_phone_numbers()` reads the survivor's channel rows, so
  the absorbed card's number keeps deciding the identity's word after the fold.
* **Every DEFINER function pins `search_path`, no function is granted to `anon` or `PUBLIC`,
  `sweep_compliance_expiries()` is `service_role` only, and the three new tables carry no `anon`
  grant.** `people_directory`'s `authenticated=arwdDxtm` is pre-existing (00221/00281) and inert on
  a `UNION ALL` view; 00629:3086 revokes PUBLIC and anon and that holds.

---

## 6. Probes written this round

Committed beside this file under `artifacts/people-room-crm-2026-09-11/build/`, all one transaction and ROLLBACKed, all on a freshly reset database:

* `probe-r13-a.sql` — MAJOR-1: the other-studio seat, with both resolvers printed first.
* `probe-r13-b.sql` — sweep re-runs, recipient roles, archived holders, the 36-paper census.
* `probe-r13-c.sql` — 00628's remaining NULLs and their `n_orgs`, the court ledger, `cron.job`,
  `obj_description('public.people_directory')`.
* `probe-r13-d.sql` / `probe-r13-d2.sql` — MAJOR-2 and its negative control.
* `probe-r13-e.sql` — archive/restore gating at three standings, and an owner's direct
  `merged_into` PATCH.
