# W3 (P2) — fix log, round 2

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
base `5f264a602`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started.** Migrations 00629–00631 edited in place (unapplied on
Strata). No migration minted: nothing new was owed that the existing files could not carry.

Fourteen findings handed back — B2-1..B2-4 (migrations), F1/F3 (QA), B2R-1 and M2R-1..M2R-7
(code). All fourteen closed. Every ruling in `rulings.md` §3 re-read; R-AS, R-AY, R-BE, R-BL
and R-BM are each named below where they bear.

---

## Gates, on a fresh database

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | clean, rc=0 |
| `w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (blocks **1c**, **2b** and **7b** are new) |
| `w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` | rc=0 |
| `rls/studio_contacts_test.sql` | rc=0 (the policy split in B2-1 lands under it) |
| `rls/project_roster_test.sql` | rc=0 |
| `rls/00584_studio_comember_rls_sweep.test.sql` | rc=0 |
| `cron.job` after reset | `compliance-document-expiry-sweep · 0 6 * * * · SELECT public.sweep_compliance_expiries();` |
| `python3 scripts/generate-legacy-grants.py` | +6 lines — the one new `REVOKE` (`assert_merged_into_write()`); regenerated and committed |
| `SUPABASE_DB_URL=… pnpm db:generate` | byte-identical — no column or table shape moved |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter @patina/designer-portal type-check` | rc=0 |
| `pnpm --filter @patina/admin-portal build` | rc=0, full route table (shared-package edit) |
| `npx jest src/components/document/people src/components/document/roster …bring-forward …compliance-notice …write-error` | **41 suites, 577 tests, all green** |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **25 passed** (was 21) |
| `npx vitest run src/hooks/__tests__/people-crm-foundation.test.ts` | 35 passed |

Probes written this round (all rolled back, all under `build/`):
`probe310-w3-r2-b2-2-repro.sql`, `probe311-w3-r2-b2-2-reorder-trial.sql`,
`probe312-w3-r2-fix-controls.sql`, `probe313-w3-r2-f3-client-id.sql`.

---

## B2-1 · BLOCKING — `studio_contacts.merged_into` had no write guard

**Fixed in** `00629_studio_contact_merges.sql` — new §1b (guard + policy split), and the RPC's
pointer statements in §5.

Three legs, because one was not enough:

1. **`assert_merged_into_write()`**, a `BEFORE INSERT OR UPDATE OF merged_into` trigger on
   `studio_contacts`. Any change to the column raises `studio_contact_merge_pointer_forbidden`
   unless the caller is inside `merge_studio_contacts()`. The door is the 00594
   `refuse_legacy_consent_write()` idiom — one transaction-local GUC
   (`app.contact_merge_in_progress`), set by the RPC around its own two statements and cleared
   immediately after. A trigger rather than `auth.uid()`: a `SECURITY DEFINER` function still
   reports the caller's uid, so uid could not tell the RPC from a PATCH.
2. **Two structural rules that hold for every writer, door open or shut**: the survivor must be
   a card in the SAME studio (`studio_contact_merge_other_studio`) and the kind pair must be
   legal — crm-model §4's sole-proprietor fold is the one cross-kind case
   (`studio_contact_merge_kind_mismatch`).
3. **The policy split**, grafted from `00417:224-255` with one predicate added to each clause:
   `studio_contacts_member_insert` and `studio_contacts_member_update` now carry
   `merged_into IS NULL` exactly where they carry `archived_at IS NULL`. 00417's admin UPDATE
   leg is deliberately NOT re-issued — it has no column predicate at all and cannot compare OLD
   to NEW, which is what the trigger is for.

The FK is `ON DELETE SET NULL`, so the guard allows a `NOT NULL → NULL` transition when the
survivor row no longer exists — that is the referential action, not a caller un-merging a card,
and refusing it would make a survivor undeletable.

**Evidence** (`probe312`, rolled back, fresh seed):

```
B2-1 member write: REFUSED -> studio_contact_merge_pointer_forbidden
B2-1 pointer after the refused write: NULL
B2-1 owner write:  REFUSED -> studio_contact_merge_pointer_forbidden
postgres hand-fold: REFUSED -> studio_contact_merge_pointer_forbidden
under the door, person->firm:  REFUSED -> studio_contact_merge_kind_mismatch
under the door, cross-studio:  REFUSED -> studio_contact_merge_other_studio
```

The RPC itself still works end to end (B2-2's evidence below is a successful merge through the
same door). One INSERT-path correction was needed and made: the trigger fires on every
`studio_contacts` INSERT, so a card born with `merged_into IS NULL` returns early — caught by
the seed refusing to load, fixed, reset clean.

**Assertion added**: `w3_merge_sweep_household_test.sql` block **1c** — a plain member and an
owner are each refused `studio_contact_merge_pointer_forbidden`, the pointer is still NULL
after both, and under the door a person-into-firm and a cross-studio pointer are refused.

## B2-2 · MAJOR — a merge aborted whenever the absorbed card held a renewal

**Fixed in** `00629` — §5's compliance block reordered into three statements, plus a new §4c
grafting `assert_compliance_holder()`.

*Reproduced first* (`probe310`): absorbed firm with one retired COI predecessor, survivor with a
current COI → `ERROR: compliance_successor_already_superseded`, whole transaction lost.

**The reorder.** The block used to move the head and write its `superseded_by` in ONE statement
and then walk the rows behind it — so the second statement asked
`assert_compliance_holder()` to re-validate a supersede edge whose successor the first statement
had just retired. Now: (1) the qualifying heads move carrying the edge they already had (none),
(2) the lineage behind each head follows, outermost first, (3) the edge onto the survivor's
certificate is written last. The head/successor map is captured into two aligned arrays before
statement 1, because `d.holder_id = p_merged` stops being true after it.

**The graft, and why it was needed.** The reorder alone was not enough, and I measured it before
claiming so (`probe311` and then `probe312`): of
`assert_compliance_holder()`'s seven successor legs, two are **time-varying** —
`compliance_successor_already_superseded` (the successor is retired the moment the NEXT renewal
lands) and `compliance_successor_already_lapsed` (the successor lapses by the calendar, with
nobody writing anything). Re-running them on a holder-only move re-judges an edge written years
ago against today, and the LAPSED-head shape — a firm card is folded away precisely because its
paper stopped — then answered `compliance_successor_already_lapsed` instead. §4c grafts
`00623:293-471` **verbatim** (same signature, same SECURITY DEFINER and `search_path`, same
seven legs in the same order, every HINT byte for byte) plus one boolean `v_retiring` and two
`IF` conditions, so those two legs run only on the write that CHANGES `superseded_by`. The five
structural legs — holder exists, holder kind, holder studio, successor held for the SAME card,
same doc_type, dates, gates — still run on every write. This costs no safety: R-BF already
re-reckons both facts at READ time (`compliance_state()` drops a row from the count only while a
reachable successor is in force and carries its gates), so a chain whose head has since lapsed is
already counted against the card whatever the trigger said when the edge was written.

**Evidence** (`probe312`, the lapsed-head shape, rolled back):

```
B2-2 merge over a LAPSED head with a retired predecessor: SUCCEEDED
B2-2 survivor paper word: current -> current
B2-2 lineage rows now on the survivor (want 2): 2
B2-2 head now superseded by the survivor's certificate (want 1): 1
B2-2 the bond with no successor stayed on the absorbed card (want 1): 1
```

**Negative controls, same probe** — the r1 MAJOR-4 / r2 MAJOR-1 / r3 MAJOR-1 laundering doors
are each written by CHANGING `superseded_by`, which is exactly what `v_retiring` names:

```
hand supersede across doc_types:  REFUSED -> compliance_successor_other_holder
hand supersede onto a retired row: REFUSED -> compliance_successor_already_superseded
hand supersede onto a LAPSED head: REFUSED -> compliance_successor_already_lapsed
```

**Assertion added**: block **1c** merges a firm whose absorbed card carries a retired predecessor
behind an aged-out head, checks the survivor's word before and after, that both lineage rows
moved, that the edge was written last, that the predecessor still names its own head, and that
the successor-less bond stayed behind — plus both negative controls.

## B2-3 · MAJOR — the bid backfill wrote a selection date the record does not hold

**Fixed in** `00631_project_party_bids.sql`.

- the `selected_bid` CTE is **gone**; `bid_selected_at` is not backfilled at all. It joins
  `bid_due_at` in the file's "WHAT IS DELIBERATELY NOT BACKFILLED, AND WHY" list, with the
  reason named: `select_trade_scope_bid()` (`00423:1500-1503`) promotes an existing
  `trade_scope_bids` row IN PLACE and never writes `noted_at`, and the table has no
  `updated_at` — so `noted_at` on a `selected` row is the day the NUMBER arrived.
- `quoted_bid` is narrowed from `status IN ('quoted','selected')` to `status = 'quoted'`, which
  is what `00631:229-231`'s own comment already claimed (m2-3 closed with it).
- the column COMMENT now says it is typed by the studio, never backfilled, and why.

**Evidence**: block **7b** (new) runs 00631's mapping CTEs verbatim over real
`trade_rfq_requests` and `trade_scope_bids` rows in the shipped shape — a selected bid, an
RFQ-only response, and an unanswered ask. It asserts `outcome='selected'`, `amount_cents`,
`asked_at`, and that `bid_quoted_at`, `bid_selected_at` and `bid_due_at` are all **NULL** on the
selected seat, so the roster row can never print "Quoted <d>. Selected <the same d>." It also
asserts the RFQ rail's own `responded_at` still answers `bid_quoted_at`, and that the
`bid_outcome IS NULL` guard leaves a hand-typed bid alone. (The block needed a
`project_commercial_documents` binding — `guard_trade_scope_bid_party()` resolves a bid's project
through it.) This also closes **m2-1**: the backfill now has coverage.

## B2-4 · MAJOR — the nightly sweep announced the paper of a folded-away firm

**Fixed in** `00630_compliance_expiry_sweep.sql`: the scan takes `AND sc.merged_into IS NULL`,
the same leg the Directory (00629 §6) and the auto-link resolver (§4b) already take.

**Evidence** (`probe312`, after a real firm merge, rolled back): the absorbed card still holds
its lapsed bond (correctly — the survivor holds nothing to retire it), the sweep runs, and

```
B2-4 notices about paper still on the folded card (want 0): 0
B2-4 lapsed papers still on the folded card (want 1, unannounced): 1
B2-4 notifications naming the folded firm (want 0): 0
B2-4 directory rows for the folded card (want 0): 0
```

**Assertion added**: block **2b** — it first proves the folded card's bond really does read
`lapsed` (so the assertion below is not vacuous), then runs the sweep and asserts zero notices
for any document held by the folded card, and zero Directory rows for it.

---

## F1 · BLOCKING — the picker named the person where the firm was meant

**Fixed in** `rolodex-picker.tsx` and `party-mini-row.tsx`.

`studio_contacts.company_name` on a PERSON row is 00417's typed-by-hand snapshot and nothing
since the affiliation model (00592) populates it — measured on the local book: **all 22** carded
humans with a `company_id` carry NULL there while their firm's card holds the name. So
`company_name ?? contactName(contact)` printed the PERSON.

The fix resolves the firm the same way W2 round 7 fixed the Directory row and the person-card
header: through `people_directory`'s own `meta.company_name` join (00629 §6), read with
`directoryFirmOf()` — the one reader of that join. The picker already holds the directory row
for every hit (`wordsByCard`, keyed on the card id), so **no new query is issued**. The legacy
column stays the fallback for a book that really did type a firm name by hand. Three call sites:
`paperClauseFor`, `pickedFacts` (both `firmName` and the holder name handed to
`noticedPaperClause`), and the mini row.

`PartyMiniRow` gains an optional `company` prop and `rosterMetaLine` a fourth argument, so the
meta line reads KIND · FIRM · TRADE — SPEC §5.7 #4's "name, firm and trade". Every existing
caller hands no firm and is unchanged; a firm's own row never gains a firm segment (its name IS
the row's name).

**The other two call sites, checked as the finding asks.**
`company-card.tsx:508` reads `card.company_name` on a **firm's own card**, where the column is
the firm's own name — measured: 21 of 21 firm cards carry it, so this is not the same defect and
is left alone. `roster-row.tsx` passes `row.companyName`, the SEAT's snapshot from
`project_parties.company_name` — measured: 31 seats, 26 with a `company_id`, **0** with a
company_id and no name — which is PR-b's hybrid working as ruled (the firm name at time is
snapshotted). Neither is changed.

**Test added** (`rolodex-picker.test.tsx`): a card with `company_name: null` and
`company_id: 'firm-tile'` beside a directory row carrying `meta.company_name` now asserts the
meta line is `Subcontractor · Martínez Tile Works · Tile`, the row's `data-expiry-notice` is
"Martínez Tile Works's insurance lapsed 31 March 2026.", and that the consequence sentence
carries that clause and does **not** contain "Rosa Martínez's insurance". The mini row's meta
span gained `data-party-mini-meta` so the assertion has a handle.

## F3 · MAJOR — the bring-forward spec had never run

**Fixed in** `e2e/people/bring-forward.spec.ts:67` — `seed.data.client_id ?? null`.

**Evidence** (`probe313`, rolled back): `projects.client_id` is `uuid`, nullable; the seeded
Okonkwo project's is NULL; and

```
string client_id: REFUSED SQLSTATE 22P02  (invalid input syntax for type uuid: "bring-forward-e2e")
null   client_id: ACCEPTED
```

Per this round's brief no server was started, so the spec itself was not executed; the
`beforeAll` insert it dies on is proven at the database.

---

## B2R-1 · BLOCKING — the household band promised the opposite grant

**Fixed in** `household-band.tsx` — `householdMemberConsequence` now reads
" They may sign money to $2,500."

`add_household_member()` writes exactly one authority row and its scope is `money`
(`00632:403-407`; `grep -n change_order 00632…` returns nothing), and `threshold_cents` is a
CAP that every other reader prints as "Signs money to $2,500"
(`AUTHORITY_SCOPE_LABELS.money`, `authorityPhrase`). The old sentence named a scope the act never
writes and inverted the cap into a floor, contradicting the band's own
`data-household-threshold` line two elements above. No `change_order` grant was minted: PR-c
gives the household the figure and the seat the grant, and 00632 already writes the grant the
face now names.

Test updated: `household-band.test.tsx` asserts the new sentence verbatim.

## M2R-1 · MAJOR — "lapses in 30 days" printed beside a date that is not 30 days away

**Fixed in** `compliance-notice.ts` — `expiryNoticeClause` drops the interval:
"Northgate Electric's insurance lapses on 6 October 2026." (and "lapses soon." with no date).
`lapses_soon` is a 30-day WINDOW, not a distance, and 00630 writes the notice once on entry, so
the two halves of one sentence disagreed for the whole window. The state WORD
(`studio-config.ts:402`, "Lapses in 30 days") is a label and is untouched — a label may name a
window; a sentence carrying a date is an arithmetic claim.

Tests: the three assertions carrying the old wording are updated (`compliance-notice.test.ts`,
`roster-row.test.tsx`, `rolodex-picker.test.tsx`), plus a new one that sweeps 1/12/23/30 days out
and asserts the clause never contains "in 30 days".

## M2R-2 · MAJOR — the merge sheet promised paper that does not move

**Fixed in** `compare-merge-sheet.tsx` — `mergeConsequenceSentence` now says what crm-model §4
says: the absorbed card's paper **stays on it and is still readable there**, and is marked
superseded only where the survivor already holds the same paper still in force. "paper" is out of
the list of things that move.

Test updated to assert both new clauses and to assert the old promise is **absent**.

## M2R-3 · MAJOR — a refused bring-forward printed a raw PostgREST string

**Fixed in** `rolodex-picker.tsx` — the refusal is routed through `writeErrorMessage`, which
every other write path in the same component already used. The face now reads
"Rosa Martínez did not go on the call sheet. That card has been folded into another one. Open the
card that survived and add them from there."

Test updated: the existing refusal test now asserts the full sentence and that
`party_card_merged_away` does not appear.

## M2R-4 · MAJOR — 00629's two bare tokens printed verbatim

**Fixed in** `write-error.ts` — `party_card_merged_away` and `party_company_merged_away` join
00624's three, for the reason the file's own CR-3 comment gives: a bare token matches neither the
RLS branch nor the schema-word guard, so it fell through to `return raw`.

**New test file** `src/lib/document/__tests__/write-error.test.ts` — the two new tokens, 00624's
three still answered, and the RLS / constraint-name / empty-message paths.

## M2R-5 · MAJOR — merged-away cards were still offered by three pickers

**Fixed in** `packages/supabase/src/hooks/use-studio-contacts.ts`: `StudioContact` gains
`merged_into: string | null`, `StudioContactFilters` gains `includeMerged`, and the list query
takes `.is('merged_into', null)` unless asked otherwise. That is one change reaching all three
surfaces the finding names — the bring-forward picker, `roster-groups`' "who priced it", and the
household-member selector — because all three read this one hook. The Directory now says one card
and nothing else says two.

Tests (vitest, `people-crm-w3.test.ts`): the builder records `.is()` calls; the default list
narrows on `archived_at` **and** `merged_into`, and `includeMerged: true` drops the second.

## M2R-6 · MAJOR — "Compare these two" was offered on pairs that are not both cards

**Fixed in** `people-derivation.ts` — `directoryDuplicatePairs` requires `role === 'contact'` on
both sides. Only that branch's `person_id` is a `studio_contacts.id`; a `lead` row carries
`leads.contact_phone` and a `team` row the teammate's profile phone, so a lead or teammate the
studio has since carded paired with their own card and the press answered "One of these cards is
no longer in the book." over a row that was never a card. The role test subsumes QA-R7-3's
legacy-client leg (`role === 'client'`), whose collision was the same shape one branch over; the
firm test is kept.

Test added: for each of `lead`, `team`, `sub`, `client` the pair is refused, and two real cards
sharing a number still pair.

## M2R-7 · MAJOR — `useComplianceDocumentsFor` dropped the retirement rule its sibling applies

**Fixed in** `use-studio-contacts.ts` — the hook now runs its rows through
`retainedComplianceDocuments(all, today)`, exactly as `useComplianceDocuments` does ten lines
below, for the reason that hook's own comment gives. The whole chain is still read (a superseded
row is what decides whether its predecessor is retired) and the rule is applied after the read,
never in the WHERE.

Tests: a direct assertion that the reducer keeps a row whose successor has since lapsed and drops
one whose successor is in force and carries its gates, plus a wiring check on the hook.

---

## What I did NOT change, and why

- **`assert_compliance_holder()`'s five structural legs** — untouched, and the two negative
  controls above prove they still refuse the three laundering doors W1b closed.
- **`company-card.tsx` / `roster-row.tsx` firm names** — measured, not the same defect (F1 above).
- **No `change_order` authority grant** — B2R-1 is a wording fix; minting a second grant is a
  ruling, not a repair, and PR-c is already served by the `money` grant 00632 writes.
- **R-AY** — nothing in this round reads or writes a consent table, a consent RPC or a frozen
  `project_parties.sms_consent_*` column. `grep` over the four edited migrations confirms it.
- **Migration numbers** — none minted. 00595–00620 untouched.
- **No prod, no server, no `.env.local`.**

## Still open from the r2 reviews (not in this round's brief)

m2-2 (the `people_directory` COMMENT contradicts the shipped view), m2-4..m2-16 and the code
review's m1–m11 are unaddressed here by instruction; the two the fixes above happen to close
(m2-1, m2-3) are noted in their findings. QA finding 2 (a merged card still selectable in two
dropdowns) is closed as a side effect of M2R-5.
