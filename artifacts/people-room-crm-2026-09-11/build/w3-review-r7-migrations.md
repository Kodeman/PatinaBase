# W3 (P2) — adversarial migration review, round 7

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `a5e624191`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken.** Every measurement below was taken inside a
`BEGIN … ROLLBACK` probe except the `supabase db reset`, which is a named gate.

Read in full: `w3-data-report.md`; `00628`, `00629` (all 2591 lines), `00630`, `00631`, `00632`,
`00633`; `rulings.md`; `direction.md` §3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24;
`SPEC.md` §5.4/§5.7; `fixture.md` §4; `w3-fix-log-r6.md`; `w3-review-r6-migrations.md`;
`w1a`/`w1b`/`w2a`/`w2b`/`w2c` reports; `w2-review-r15-qa.md`.

**Verdict: NOT clean — 1 blocking, 4 major, 18 minor.**

Probes: `/tmp/claude/w3r7/pA.sql` … `pI.sql`.

---

## 0. Gates I ran myself

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **clean**; `00621 … 00633` + `20260910152111` all applied; seeds landed |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` (fresh DB) | rc=0 — "All W1a assertions passed." |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` (fresh DB) | rc=0 — "All W1b assertions passed." |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` (fresh DB) | rc=0 — "W3 SQL suite: all blocks passed" (10 blocks) |
| `supabase/tests/rls/people_directory_scope_test.sql` · `studio_contacts_test.sql` · `project_roster_test.sql` · `anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run, **no git diff** — the committed file is current |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no git diff** — no type drift |
| `anon` / `PUBLIC` privileges on the three new tables | **none** (measured through `information_schema.role_table_grants`) |
| `anon` EXECUTE on all 15 new functions | **f** on every one; `authenticated` EXECUTE only on the seven RPCs + `contact_rule_blocks_contact`; all three trigger functions and `sweep_compliance_expiries()` are off `authenticated` |
| cron registry | `compliance-document-expiry-sweep` · `0 6 * * *` · `SELECT public.sweep_compliance_expiries();` · active |
| cross-tenant as a genuine outsider (`cf100000-…-0001`, owner of another studio) | 0 households, 0 merges, 0 notices, 0 `contact`/`team`/`party` Directory rows; `set_household_threshold` → `household_not_found`; `merge_studio_contacts` → `merge_not_a_member`; `archive_studio_contact` → `studio_contact_not_found`; `resolve_merged_contact` → NULL; `sweep_compliance_expiries` → permission denied; direct INSERT on `studio_contact_merges` / `studio_compliance_notices` → permission denied; `UPDATE client_households` → 0 rows; hand-set `merged_into` → 0 rows |
| plain **member** of the owning studio (`pC.sql`) | erase the figure → `household_threshold_forbidden`; raise it → same; DELETE household → 0 rows; `archive_studio_contact` → `studio_contact_archive_forbidden`; hand-set `merged_into` → `studio_contact_merge_pointer_forbidden`; `add_household_member(..., 'client_rep', project)` on a household carrying a figure → `household_grant_forbidden`; `merge_studio_contacts` → permitted (correct: PR-o puts the merge with the studio, not the principal) |
| R-AY | grep over all six files: **no consent write anywhere**, no `record_channel_consent` call, no read of a frozen `project_parties.sms_consent_*` column for a verdict. The only consent references are `people_directory`'s record-reading legs carried verbatim from 00626 (`00629:2172-2173`, `:2241-2243`, `:2314`) and one COMMENT (`00629:1897`) |
| recipients | measured on the seeded book: 3 notices, 6 notifications, **owner 3 / admin 3**, no plain member |
| FK census into `studio_contacts` | 20 columns. Every one is reached by `merge_studio_contacts()` except the three named in **B-1** and the two deliberate freezes (`studio_trade_agreements.contact_id` on a sent agreement, `studio_contacts.company_id` on a folded sole-proprietor's crew) |

### 0b. Prior findings (`w3-fix-log-r6.md`) — five FIXED, fourteen MINORs still open

| Prior | State | Evidence |
|---|---|---|
| r6 B-1 (channel dedupe destroyed a recorded refusal) | **fixed** | `00629:1143-1177` reduces worst-first before `00629:1179-1185` deletes; ranking `unsubscribed > dead > bounced > active` on the file; `status_at` travels with the winning status, `verified`/`preferred` OR'd, `label` COALESCEd. Pinned by the suite's block 10 |
| r6 M-1 (rule route at the other card aborted the merge) | **fixed** | `00629:1508-1521` nulls both directions before the repoints; `00629:1087-1090` treats a route at the survivor as subsumed; `00629:1541-1542` excludes the survivor's own rule |
| r6 M-2 (affiliation collision deleted five typed facts) | **fixed** | `00629:1422-1434` and its mirror `00629:1448-1460` reduce (`role_at_firm` COALESCE, three booleans OR, `from_date` LEAST) before the DELETE |
| r6 M-3 (sole-prop fold erased the crew) | **fixed as specified** — but see **M-2** below | `00629:1412-1420` scopes the DELETE to the fold and closes the crew with `to_date` under `patina.suppress_affiliation_sync` |
| r6 M-4 (`is_sole_proprietor`, `vendor_id` left behind) | **fixed** | `00629:1356-1357` (OR) and `00629:1275-1280` (the guarded `vendor_id` pair); `compare-merge-sheet.tsx:181` adds the "Sole proprietor" row |
| r6 `m-1 … m-14` | **all still open** except `m-10`, which my own `db reset` cleared | each re-measured in §MINOR below |

---

# BLOCKING

## B-1 · A firm merge silently drops `paperwork_contact_person_id`, `signer_person_id` and `site_contact_person_id` — while the merge sheet tells the studio "firm designations move onto <survivor>", the Directory firm row loses its payee marker, and "Chase the renewal" loses its recipient

`00629:1342-1364` is the statement r5 B-1 and r6 M-4 built to carry every typed fact. It carries
sixteen columns. `studio_contacts` has 34. Of the non-identity, non-timestamp ones, **three** are
still left behind, and all three are the company card's own typed facts:

```
paperwork_contact_person_id
signer_person_id
site_contact_person_id
```

`00629:1710-1718` repoints the designations **other** cards hold naming the merged PERSON. Nothing
carries the merged **firm's own** three onto the survivor.

**Measured** (`/tmp/claude/w3r7/pG.sql`, fresh seeded database, rolled back) — the PR-o default,
older card survives:

```
BEFORE  a7000000-…-0002 "G7 Marrow & Sons"       (older)  pw f  sg f  st f
        a7000000-…-0003 "G7 Marrow and Sons LLC" (newer)  pw t  sg t  st t

merge_studio_contacts(older, newer, 'company_name') -> a7000000-…-0002

AFTER   survivor  paperwork_contact_person_id (null)
                  signer_person_id            (null)
                  site_contact_person_id      (null)
        folded card still holds all three, and emits 0 people_directory rows
```

**Three faces then say the wrong thing, and one of them said it in advance:**

1. **The merge sheet promised it.** `compare-merge-sheet.tsx:109-111` builds the consequence
   sentence as *"<merged>'s seats, channels **and firm designations** move onto <survivor>…"* —
   printed directly above the press, on both branches. On a firm-to-firm merge the only
   non-vacuous reading of "firm designations" is the folded firm's own three, and they do not move.
   This is the exact defect class r4 B-2's own comment names at `compare-merge-sheet.tsx:98-105`:
   *"the sentence said the rule moved either way, which was a wrong fact on a face."*
2. **The Directory firm row loses its payee marker.** `directory-view.tsx:236-237` builds
   "Signs: Tom Marrow" from `c.signer_person_id` — **not** from the affiliation's `is_signer`
   (which the merge does carry). R-G fixes the company row at two columns, paper and payee marker;
   after the merge the second one is blank over a signer the studio typed. `company-card.tsx:934-937`
   drops the same line, and the three designation rows (`company-card.tsx:234-238`, rendered at
   `:445-447`) come back empty.
3. **"Chase the renewal" loses its recipient.** `company-card.tsx:880-882` passes
   `paperworkContactPersonId: card.paperwork_contact_person_id` into the chase, and
   `api/people/chase-renewal/route.ts:90` writes it straight into the queued task payload with
   **no affiliation fallback**. After the merge every chase on that firm is drafted with
   `paperwork_contact_person_id: null` — PR-a's compliant fallback ("Patina drafts the chase to the
   firm's paperwork contact") with the contact gone.

This is r5 B-1's own standard applied to the last three columns: the values are not deleted, they
are on a card the room cannot open (no Directory row — measured 0 — no picker entry, and `?firm=`
resolves forward). R-BN: *"A merge never deletes a typed fact … The compare sheet shows both values
wherever a reduction will pick one."* The sheet's `carriedRows()` (`compare-merge-sheet.tsx:165-182`)
lists every column the COALESCE statement touches and none of these three, so the studio cannot even
see what the choice of survivor is about to cost.

**Fix**: add the three to `00629:1342-1364` as plain COALESCEs — they are person-card pointers inside
one studio and `assert_studio_contact_designations()` already holds them to a same-studio person card
that is not the row itself, so none can conflict destructively. Then add three rows to
`carriedRows()` (resolving the ids to names, as `company-card.tsx` already does), and the sentence at
`:109-111` becomes true rather than aspirational. If instead the ruling is that a designation must
NOT travel, the sentence must stop saying it does and the sheet must say what is lost.

---

# MAJOR

## M-1 · Two successor legs in `assert_compliance_holder()` were never gated on `v_retiring`, so an ordinary firm merge aborts with a schema token after an ordinary, permitted edit to a renewal

§4c (`00629:610-652`) is the r2 B2-2 fix: the two **time-varying** legs
(`compliance_successor_already_superseded`, `compliance_successor_already_lapsed`) now run only when
the write is the act of retiring a paper (`00629:774`, `00629:813`). Two other legs over the same
successor row were left ungated:

* `compliance_successor_not_later` — `00629:720-730`
* `compliance_successor_drops_a_gate` — `00629:823-832`

Neither is time-varying by the clock, but both are **edit-varying**: the trigger validates a row
against *its own* successor, never against its predecessors, and `expires_on` and `blocks` are both
freely editable by any active studio member (`studio_compliance_documents_member_update`). So an
edit that shrinks a renewal's gates, or pulls its date earlier, leaves an existing supersede edge
failing a leg that nothing re-checks — until `merge_studio_contacts()`'s holder-move statement
(`00629:1642-1649`, and its `v_cross` twin `00629:1693-1700`) re-judges it.

**Measured**, both variants, each reached by two ordinary member writes:

```
pH.sql   coi_gl (CURRENT_DATE-10, blocks {site_access,draw})
           superseded_by -> coi_gl (CURRENT_DATE+400, blocks {site_access,draw})
         member edits the RENEWAL's blocks to {site_access}          -> UPDATE 1 (permitted)
         merge_studio_contacts(older firm, newer firm, 'company_name')
           -> ERROR compliance_successor_drops_a_gate
              raised from assert_compliance_holder() line 167,
              inside merge_studio_contacts() line 751

pI.sql   coi_gl (CURRENT_DATE+100) superseded_by -> coi_gl (CURRENT_DATE+400)
         member corrects the RENEWAL's date to CURRENT_DATE+50       -> UPDATE 1 (permitted)
         merge -> ERROR compliance_successor_not_later
```

The whole transaction is lost and Leah gets a raw schema token naming nothing she did — the same
failure mode r2 B2-2 was raised and fixed for, reached through the two legs that fix did not reach.
`compliance_successor_wrong_type` and `compliance_successor_undated` are the same shape (edit the
successor's `doc_type`, or clear its date) and are ungated too, though those two edits are rarer.

**Fix**: one word, matching the two legs beside them — `IF v_retiring AND …` on both (and, for
completeness, on the type/undated legs). §4c's own argument covers them exactly: re-running an
ACT's guard over an unchanged edge adds nothing, because `compliance_state()` / R-BF re-reckon the
word at read time. The structural legs (holder exists, holder kind, holder studio, successor held
for the same card) must keep running on every write, and would.

## M-2 · The sole-proprietor fold leaves the crew's card in a state the shipped card editor silently "repairs" by rewriting their role and their start date

r6 M-3's fix (`00629:1412-1420`) closes every other person's affiliation at the folded firm with
`to_date` and — under `patina.suppress_affiliation_sync` — deliberately leaves their legacy
`studio_contacts.company_id` naming the folded card, so `people_directory`'s `company_name` COALESCE
still resolves the firm's name (`00629:2419-2423`). That half works.

What it also does is break 00592/R-AI's standing invariant ("a trigger keeps `company_id` equal to
the open affiliation") for those rows: pointer set, **zero** open affiliations.
`sync_person_affiliation_from_pointer_trg` is `AFTER INSERT OR UPDATE OF company_id`, and in Postgres
`UPDATE OF col` fires whenever the column is **named in the SET list**, changed or not — which is
every save of the shipped card editor (`use-studio-contacts.ts:202, :234` writes the whole row). The
function's ELSE branch then opens the affiliation the pointer names, `from_date = CURRENT_DATE`,
role and designations at their defaults.

**Measured** (`/tmp/claude/w3r7/pA.sql`):

```
BEFORE            A7 Bookkeeper  company_id A7 Firm  role Bookkeeper  paperwork t  licence t  from 2021-01-01  to (null)
AFTER MERGE       A7 Bookkeeper  company_id A7 Firm  role Bookkeeper  paperwork t  licence t  from 2021-01-01  to 2026-09-14
                  Directory row still prints company_name "A7 Firm"          <- r6 M-3 holds
AFTER ONE RE-SAVE A7 Bookkeeper  company_id A7 Firm  role Bookkeeper  paperwork t  licence t  from 2021-01-01  to 2026-09-14
                  A7 Bookkeeper  company_id A7 Firm  role (null)      paperwork f  licence f  from 2026-09-14  to (null)   <- NEW OPEN ROW
```

`person-profile.tsx:348-354` prints the **open** affiliation's role and "since", so one ordinary
card save after the fold turns "Bookkeeper, since 2021" into a bare "since 2026" — r6 M-2's exact
harm, one act later, and the crew line on the folded firm card (`company-card.tsx:186-201`) is
unreachable to put it back. The typed row survives as history, so this is a reader disagreeing with
the record rather than data loss, which is why it is major and not blocking.

**Fix**, in the function's own idiom: `sync_person_affiliation_from_pointer()` already stands down
for two older malformations it refuses to mirror (a cross-studio pointer, a pointer naming a person
card). A pointer naming a card that was **merged away** is a third — add
`OR (SELECT merged_into FROM public.studio_contacts WHERE id = NEW.company_id) IS NOT NULL` to that
`NULL` branch. That leaves the pointer standing, as R-BN requires, and stops the editor re-deriving
an affiliation the merge deliberately closed. (Second-best: in the `v_cross` branch, repoint the
crew's `company_id` at nothing and keep the Directory name off the closed affiliation instead — but
that is the change r6 M-3 was raised to prevent.)

## M-3 · The TEAM-branch tenant leg shipped, and the one assertion that would catch a regression of it was removed in the same wave — with a 22-line comment in the test file stating the leak is still open

`00629:2369-2380` is the narrowing: `is_active_studio_member(project_tenant_org(tm.project_id))`
plus the three designer-of-record legs, on the branch W1b left with `is_studio_comember(designer)`
alone. It works — **measured** (`/tmp/claude/w3r7/pE.sql`), rebuilding the suite's own block-13
fixture (`a0000000-…-0002`, an ordinary member of Test Studio B, a co-member of the seeded
studio's designer of record and not a member of the seeded studio):

```
people_directory WHERE role <> 'contact' AND project_id IN (…000a, …000b)   -> 0 rows
people_directory WHERE role = 'team'  (anywhere)                            -> 0 rows
```

So the **original** 13h predicate now passes. But `w1b_compliance_authority_directory_test.sql:2412-2433`
narrowed the assertion to `role NOT IN ('contact', 'team')` and carries a comment that says, in the
committed test file:

> "The TEAM branch's gate is `is_studio_comember(designer)` alone and it leaks a teammate's NAME and
> project id … Whether that leg takes a tenant conjunct is a product ruling this wave has no brief
> for, so it is **REPORTED** (w3-data-report.md §7) rather than silently changed, and this line is
> narrowed to the branch its own message names."

Both halves are false of the shipped file. `w3-data-report.md:311-319` itself records the correction
("MADE, not owed", r4 M-2) — but the test was never restored with it. The result is that a
**cross-tenant visibility narrowing ships with no assertion anywhere**: revert `00629:2376-2380`
tomorrow and all three suites stay green.

**Fix**: restore `role <> 'contact'` at `:2428` (measured green), and replace the comment with what
the file actually does. If Fable wants the TEAM branch left wide pending a product ruling, then the
migration's leg must come out, not the test's assertion.

## M-4 · `w3-data-report.md` §1, §2 and §9 describe the pre-r4/r5/r6 migrations, not the ones on the branch

The report is the artifact the W7 preflight and Fable read, and its object tables were not carried
forward through three rounds of fixes. Measured against the files:

| Report | Says | Shipped |
|---|---|---|
| `:35` | `studio_contact_merges` RLS is "**SELECT + INSERT** for `is_active_studio_member(organization_id)`" | `00629:331` **drops** the INSERT policy and `00629:333-334` grants SELECT only. Measured: a member's direct INSERT → `permission denied for table studio_contact_merges` |
| `:45` | refusals are the eight of `merge_contact_not_found … merge_kind_mismatch` | three more ship and all three were review findings: `merge_two_logins` (`00629:1011`, r4 B-1), `merge_contact_rule_conflict` (`00629:1092`, r4 B-2/r5 M-2), `merge_survivor_archived` (`00629:983`, r5 M-4) |
| `:51` | channels: "exact duplicates by `(channel_kind, value)` **deleted** from the merged card first" | r6 B-1: the row **reduces** onto the survivor first (`00629:1143-1177`). The report still describes the behaviour R-BN was written to forbid |
| `:52` | affiliations: "open collisions … **deleted**"; "Cross-kind: every affiliation naming the merged firm is **deleted**" | r6 M-2/M-3: collisions **reduce** (`00629:1422-1434`, `:1448-1460`) and the cross-kind case **closes with `to_date`** (`00629:1416-1419`). Both sentences now say the opposite of the file |
| `:83`, `:96` | `studio_compliance_notices` is `id, organization_id, document_id, state, noticed_at` with **UNIQUE (document_id, state)**, and "### One notice per (document, state)" | r5 M-3 added `expires_on NOT NULL` (`00630:142`) and the key is `(document_id, state, expires_on)` (`00630:193-194`), plus `clear_compliance_notices_on_date_change()` (`00630:258-288`), which the report does not mention at all |
| `:190-197`, `:346-381` | the §4 object table and the §9 "RPC signatures, one list" | both omit `set_household_threshold(uuid, integer)` (`00632:486-567`, r5 M-1) and `assert_household_threshold_principal()` (`00632:182-218`, r1 M-4) — two of the wave's own money guards |
| `:19`, `:340` | "the five bid columns"; the generated-types diff lists five | eight ship (`00631:53-62`); §3 corrects this at `:148-151` while §0 and §8 still carry five |

A reader working from §1 would re-raise r6 B-1, r6 M-2 and r6 M-3 as open, would not know
`set_household_threshold()` exists, and would believe an append-only lineage table accepts member
INSERTs. Not a product defect — but this document is the record, and it disagrees with it.

---

# MINOR

Fourteen carried from r6 (each re-measured this round), plus four new.

## m-1 · `people_directory`'s view COMMENT is still stale (r4 m-1, r5 m-1, r6 m-1 — unfixed)
Measured: `obj_description('public.people_directory')` ILIKE `'%merged%'` is **false**. `00629:1935`
uses `CREATE OR REPLACE VIEW`, which preserves the comment, and the file never re-states it — so the
one durable description of the room's central view mentions neither `merged_into` nor the TEAM
tenant leg.

## m-2 · `00630`'s justification for its `merged_into IS NULL` leg is still the rule r3 overturned (r4 m-2 … r6 m-2 — unfixed)
`00630:360-363` still argues the leg is needed because "merge_studio_contacts() leaves an absorbed
document on the absorbed card wherever the survivor holds no successor to retire it … correctly".
`00629:1630-1634` moves **every** absorbed head. The leg is still worth keeping (rows past the
depth-16 cap, pre-00629 pointers); the reason on the file is wrong.

## m-3 · `resolve_merged_contact()` still pins no `search_path` (r4 m-3 … r6 m-3 — unfixed)
`00629:349-366`; measured `proconfig = (none)` against `search_path=public` on its thirteen W3
siblings. INVOKER, fully schema-qualified, and its one definer caller
(`rolodex_card_for_party_phone`, `00629:514`) carries its own SET clause, so no live exploit.

## m-4 · Both depth caps still strand rows silently rather than refusing (r4 m-4 … r6 m-4 — unfixed)
`00629:1641`, `00629:1692` (`FOR i IN 1..16`) and `00629:363` (`h.depth < 16`). A supersede chain
deeper than sixteen leaves its tail on the absorbed card, where 00630's sweep, all three pickers and
`people_directory` skip it. Cheap fix: RAISE when the loop exits at 16 with rows still matching.

## m-5 · The sweep's possessive still reads "…'s paper has lapsed" on a name ending in s (r4 m-5 … r6 m-5 — unfixed)
`00630:390-393`. **Measured** on the seeded book this round: `subject = "Ostrom Builders's paper has
lapsed"`. SPEC §7 / §5.7 #8 hold notification copy to the room's voice, and a notification is a face.

## m-6 · `client_households_studio_delete` still drops the co-member leg its three siblings carry (r4 m-7 … r6 m-6 — unfixed)
`00632:259-266` gates DELETE on `is_active_studio_member(organization_id) AND
is_org_admin_or_owner(organization_id)` while SELECT/INSERT/UPDATE all carry
`is_studio_comember(designer_id)` beside the tenant leg. Defensible; the file's RLS banner
(`00632:27-38`) still does not mention the asymmetry.

## m-7 · The sweep still announces an ARCHIVED holder's paper, with a deep link to the archived card (r5 m-7, r6 m-7 — unfixed)
`00630:354-372` filters `sc.merged_into IS NULL` and nothing else; measured, `archived_at` appears
nowhere in `sweep_compliance_expiries()`'s body. `directory-view.tsx` reads the rolodex with
`includeArchived: false`, so the `/people?firm=…` link lands on a card the room does not list.
PR-h's "a date with no gate changes nothing" is the same argument one step over.

## m-8 · The merge sheet still says the folded card's rule "stays on the folded card as a record", and no surface opens a folded card (r5 m-8, r6 m-8 — unfixed)
`compare-merge-sheet.tsx:113`. True of the table, false of the room: `?person=`/`?firm=` resolve
forward (`people-room.tsx:125-132`), `useStudioContacts` filters `merged_into`, and
`people_directory` emits no row (measured 0).

## m-9 · The compliance notification still abbreviates the month where the room spells it out (r5 m-9, r6 m-9 — unfixed)
`00630:421` / `00630:425` use `to_char(expires_on, 'FMDD Mon YYYY')`. **Measured**: "The certificate
of insurance for Ostrom Builders lapsed 31 Dec 2025." R-Q and R-R both spell the month, and
`formatLongDate` does the same on every face this notification links to.

## m-10 · Sweep residue on the shared local Postgres — found again, then cleared by this round's reset (r4 m-8, r5 m-10, r6 m-10)
At the start of this review the database carried 3 committed `studio_compliance_notices` rows and
`job_runs` rows from another session's sweep, so a first-run probe read `{"notices":0}` over a book
that has three. My `supabase db reset` cleared it; the next reviewer's baseline is clean **only
until the next uncommitted-transaction slip**. Not a product finding.

## m-11 · One legacy studio-less job freezes a whole household's figure (r6 m-11 — unfixed)
`00632:534-546`: `set_household_threshold()` loops every open `money` grant the household sourced and
raises `household_grant_project_has_no_studio` if **any** of those seats sits on a project that
records no studio, aborting the whole act including the change to the figure itself. Narrow
(`add_household_member()` refuses to write such a grant in the first place), but the refusal names a
job the studio is not told the identity of.

## m-12 · A notice row is written even when nobody is told, and the key then silences it forever (r6 m-12 — unfixed)
`00630:377-387` inserts the notice and counts it; `00630:432-464` inserts one `notification_log` row
**per active owner/admin**. A studio whose only active members are plain members gets
`notices: 1, notified: 0`, and `(document_id, state, expires_on)` means that sentence is never said
again until the date moves. The table's own COMMENT calls itself "what the studio has ALREADY been
told". Fix: write the notice only where at least one notification landed, or notify the whole studio
when it holds no owner/admin.

## m-13 · A merge of a card seated on a legacy studio-less job aborts on W1b's own guards (r6 m-13 — unfixed)
`00629:1722-1723` (`studio_contact_id`) fires `assert_project_party_cards_trg`, which raises
`party_card_project_has_no_studio` while `project_recorded_studio()` is NULL; `00629:1758-1760`
(`bid_quoted_by_person_id`) fires `assert_party_bid_quoted_by_trg`, which raises
`party_bid_quoted_by_project_has_no_studio` on the same condition (`00631:180-187`). Not reachable
locally — measured again on the fresh seed: **5** studio-less projects of 9, **0** carrying seats —
but on Strata 00628 runs first in the same push and any project it leaves NULL (ambiguous designer)
whose seats predate 00624 will abort a merge with a schema token. One line in the W7 preflight.

## m-14 · `00629:1337` says `company_kind` "is carried unconditionally"; the code COALESCEs it (r6 m-14 — unfixed)
`00629:1349` is `company_kind = COALESCE(s.company_kind, v_merged.company_kind)` — the survivor's own
value wins, like every other scalar. The comment means "not gated on entity kind", but reads as
"overwrite".

## n-1 · `contact_rule_blocks_contact()` has no caller anywhere, and its COMMENT states a false fact about the shipped RPC
`00629:854-878`. Grepped: no migration body, no view, no policy, no portal file calls it (the only
other hit in the repo is the generated `database.types.ts` entry). r5 M-2 replaced the merge's
hard-block gate with the subsumption test at `00629:1082-1097`, but the COMMENT at `00629:873-878`
still says *"merge_studio_contacts() refuses on it so a recorded block cannot vanish into an
absorbed card (00629 r4 B-2)"*. A dead function with EXECUTE granted to `authenticated` and a
description of behaviour that no longer exists — either wire the portal's
`contactRuleIsHardBlock()` to it (which is the stated point of having one formula) or drop it.

## n-2 · The report's measured numbers are stale against the seed
Measured on the fresh reset: **9** projects, **4** with `studio_id`, 5 NULL (report §6 `:247-253`
says 8 / 3 / 5 — the load-bearing figures, 5 NULL and 0 carrying seats, are right); **36**
compliance documents, not the "33 papers in total" of §2 `:129` — whose own breakdown (9 + 24 + 2 + 1)
already sums to 36; and Lakeshore Painting Co.'s COI reads `2026-10-07`, not §2 `:127`'s
`2026-10-06`. The last one is the §7.1 class again: an absolute date written down against a seed
that shifts relative to `CURRENT_DATE`.

## n-3 · `w3-data-report.md` §7 carries an empty heading
`:311-313`: `### The finding that is owed, not fixed` has no body and is immediately followed by
`### The finding that WAS fixed, corrected on the record (r4 M-2)`. A leftover from the r4
correction; it reads as a section that was deleted without its header.

## n-4 · A merge can leave two `preferred` rows of the same kind on the survivor
`00629:1187-1190` repoints every non-duplicate channel with its `preferred` flag intact, and
`studio_contact_channels` carries no "one preferred per (owner, kind)" constraint (measured: the only
unique index is `(owner_id, channel_kind, value)`). Two cards each with a preferred mobile fold into
one card with two, and `channelRowParts()` (`reach-access.tsx:202`) prints "preferred" on both rows —
"the one to call first" printed twice. Pre-existing shape (the Reach editor never clears siblings
either), surfaced by the merge rather than caused by it.

---

## Checked and clean

* **The merge is one transaction and cannot orphan a channel, a document, a seat, a household, a
  bid pointer or an agreement token.** 20 FK columns into `studio_contacts`; the only unrepointed
  cases are the three of B-1, `studio_trade_agreements.contact_id` on a **sent** agreement (frozen by
  00579's own guard, resolves forward) and the folded sole-proprietor's crew pointer (deliberate,
  r6 M-3 — see M-2).
* **`merged_into` is unforgeable and the lineage is append-only.** Measured: a plain member's
  hand-set → `studio_contact_merge_pointer_forbidden`; an outsider's → 0 rows; a member's direct
  INSERT into `studio_contact_merges` → permission denied. The GUC door is transaction-local and
  closed at `00629:1832`.
* **No company into a person** except crm-model §4's sole-proprietor exception, stated twice
  (`00629:989-1000` and `00629:187-195`) so service_role and a repair script are held to it too.
* **Consent is untouched (R-AY).** No W3 file writes a consent table, calls `record_channel_consent`,
  or reads a frozen `project_parties.sms_consent_*` column for a verdict. `fc_dispatch_optin_invite`
  (AFTER UPDATE on `project_parties`, which the merge's seat repoint fires) returns early on any row
  whose OLD state already carried complete pending evidence — no send is dispatched by a merge.
* **The sweep** is idempotent (measured: run 1 → 3 notices / 6 notifications; run 2 → 0 / 0), takes
  `pg_try_advisory_xact_lock`, writes one `job_runs` row per invocation with a `skipped` row on
  contention, swallows its own exception without re-RAISE, is service_role-only, schema-qualifies its
  cron body, and notifies **owners and admins of the holding studio only** (measured 3 + 3, no plain
  member).
* **Households RLS** carries the tenant leg beside `is_studio_comember(designer_id)` on all four
  policies, PR-n's owner/admin gate in the WITH CHECK **and** in
  `assert_household_threshold_principal()` (which is the one that sees OLD — measured: a plain member
  can neither raise nor erase the figure), and owner/admin on DELETE. An outsider reads 0 rows and is
  refused both RPCs by name.
* **PR-c's split holds**: the `client_rep` seat gets the `money` grant, the plain `client` seat none
  (measured: a plain member's `client` call returns a seat id; the `client_rep` call is refused
  `household_grant_forbidden`). `add_household_member()` naming a project in another studio is
  refused by `assert_project_party_cards()` (`party_studio_contact_other_studio`), so the household
  cannot seat a card across a tenant boundary.
* **The bid guards bite by name** and all three CHECKs hold; `bid_selected_at` / `bid_due_at` /
  `bid_valid_until` are correctly left unbackfilled, and the backfill is guarded on
  `pp.bid_outcome IS NULL`.
* **00628** is idempotent on `studio_id IS NULL`, fires rather than bypasses `set_project_studio_id()`
  (whose `v_postgres_migration` leg is `session_user = 'postgres' AND role IN ('none','postgres')`,
  which is what `supabase db push` presents), and stamps nothing ambiguous — measured 5 studio-less
  of 9, every one with 2 candidate studios, 0 carrying seats.
* **`project_consent_org()`** is correct as shipped for the twelve consent-ledger-key callers
  (`00628:56-85`); R-BD's retirement is scoped to guards and reducers and W1b finished that half.
  Settled in r6; not re-litigated.
* **00633** is purely additive; every live row stays valid; `project_tasks.owner` correctly untouched.
* **Money is integer cents** with `>= 0` CHECKs on `bid_amount_cents` and `co_threshold_cents`; every
  vocabulary is a named CHECK, not an enum; every new SECURITY DEFINER pins `search_path`.
* **Generated types and `00-legacy-grants.sql` are both current** — both regenerated this round with
  no git diff.
