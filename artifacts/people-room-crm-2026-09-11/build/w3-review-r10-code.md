# W3 (P2) — adversarial code review, round 10

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `d06cbe50e`. Read range for the wave: `3d65f81e4..HEAD` over
`apps/designer-portal/src` and `packages/supabase/src` (45 files, +8928 / −158).
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
No prod, no server, no port taken, no migration minted.

**Verdict: NOT clean — 1 blocking, 2 major, 12 minor.**

---

## 0. Prior round (r9) re-checked

| r9 finding | State | Evidence |
|---|---|---|
| B-1 — the notice named the FIRM for a paper the PERSON holds | **CLOSED** | `00630_compliance_expiry_sweep.sql:368-373` — `holder_name` now branches on `d.holder_type`, matching `v_link` at `:449-452` |
| B-2 — the sole-proprietor fold stripped the firm's name off the survivor | **CLOSED** | `00629_studio_contact_merges.sql:1590-1591` (`company_name = COALESCE(NULLIF(btrim(s.company_name),''), v_merged.company_name)`) and `:1673-1682` (the cross-kind DELETE now inside the `patina.suppress_affiliation_sync` window) |
| M-1 — `add_household_member()` overwrote a money grant the household did not source | **CLOSED (write side)** | probed, rolled back, as the studio owner: household at $5,000, add Chidi as `client_rep` on the Okonkwo residence → seat `d0e30000-…-000000000005` REUSED, money grant unchanged at `250000 / Owner agreement, Exhibit B §4.2`, `effective_to` NULL. **See BLOCKING-1: the FACE was not carried with it.** |
| R9-MAJOR-1 — "Nothing recorded yet" erased an outcome under the wrong sentence | **CLOSED** | `roster-row.tsx` — `clearedOutcome` branch off `bidStageOutcome`, naming the outcome in `SEAT_BID_OUTCOME_ACTS` and the held stage in `getSeatStageLabel` |

---

## 1. Gates — run this round, not quoted

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | **rc=0**, no output |
| `pnpm --filter designer-portal type-check` | **rc=0**, no output |
| `pnpm --filter admin-portal build` | **rc=0**, full route table printed |
| `cd apps/designer-portal && npx jest src/components/document/roster src/components/document/people src/lib/document/__tests__` | **147 suites, 2898 tests, all green** (7.3 s) |
| `cd packages/supabase && npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **30 passed** |

`packages/supabase` ships source (`"." : "./src/index.ts"`, no `dist`), so there is
no stale-dist exposure from the shared edits; `admin-portal build` is the gate that
proves it, and it is green.

---

## BLOCKING-1 — the household's "They may sign money to $X." promises a grant the RPC no longer writes

**File:** `apps/designer-portal/src/components/document/roster/household-band.tsx:152-178`
(`householdMemberConsequence`), rendered at `:638-649`.
**Pinned by:** `apps/designer-portal/src/components/document/roster/__tests__/household-band.test.tsx:129`.
**Confidence: high — probed end to end on the seeded fixture.**

r9 M-1 taught `add_household_member()` to leave an OPEN money grant alone when its
`source_clause` is not `'client_households.co_threshold_cents'`
(`00632_client_households.sql:425-444`). The face was not taught the same rule:

```tsx
const grant =
  role === "client_rep" && money && canGrant
    ? ` They may sign money to ${money}.`
    : "";
```

`canGrant` is `!addHeld`, which is PR-n standing alone (`householdAddIsHeld`, `:187-193`).
Nothing in the sentence asks whether the seat already carries a grant the household did
not source — which is the ordinary path R-J draws ("Confirm from the agreement", then add
them to the household) and the exact case r9 M-1 exists for.

**Measured, on the shipped seed, rolled back** (`SET LOCAL ROLE authenticated`,
`request.jwt.claims.sub = a0000000-…-000000000004`, the studio's owner):

```
household co_threshold_cents = 500000        -- $5,000
add_household_member(household, Chidi, 'client_rep', Okonkwo)
  → seat_id d0e30000-0000-0000-0000-000000000005   (REUSED)
  → project_party_authority: money | 250000 | Owner agreement, Exhibit B §4.2 | effective_to NULL
```

So the band prints

> Chidi Okonkwo joins the household and takes a seat on the Okonkwo residence.
> **They may sign money to $5,000.** Nothing is sent to them.

and the Call Sheet row two elements above goes on printing "Signs money to $2,500."
off `authorityPhrase`. A wrong fact on a face, on money authority, on the fixture,
in one press — and it is the same class as r8 BLOCKING-1 ("the face can no longer
promise a move the write does not make") one door over.

The band's own sibling already makes this exact distinction correctly:
`householdThresholdConsequence` (`:117-123`) says "Every household member **who already
signs money from this figure** moves to $X" — the clause r9 M-1 wrote into the SQL. The
add sentence is the half that was left behind.

**Fix.** Read the chosen person's open `money` grant and its `source_clause` before the
press — `useProjectHousehold` already reads `project_party_authority` for
`clientSideHasAuthority` (`use-households.ts:256-267`), so widening that read to return
`{ engagementId, thresholdCents, sourceClause }` per client-side seat costs no request —
and branch:

* no open grant → keep today's clause;
* open grant sourced `client_households.co_threshold_cents` → keep today's clause;
* open grant with any other clause → say what actually happens, e.g.
  "Chidi Okonkwo already signs money to $2,500 from the agreement, and that stands."

The test at `household-band.test.tsx:129` pins the unconditional sentence and must move
with it, plus a case for the foreign-clause branch.

---

## MAJOR-1 — the bid editor's date-order refusal names a constraint that does not exist, so its sentence is dead

**File:** `packages/supabase/src/hooks/use-coordination.ts:2417-2418`
(`BID_REFUSAL_SENTENCES`). **Test pinning the dead string:**
`packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts:358`.
**Confidence: high — constraint name read out of the live catalog and out of 00631.**

```ts
project_parties_bid_valid_until_check:
  'A number cannot stop holding before the day it was owed.',
```

No constraint bears that name. 00631 mints it as **`project_parties_bid_window_check`**
(`00631_project_party_bids.sql:86-88`), and the catalog agrees:

```
project_parties_bid_window_check | CHECK (((bid_valid_until IS NULL) OR (bid_due_at IS NULL)
                                   OR (bid_valid_until >= bid_due_at)))
```

Probed (rolled back):

```
UPDATE project_parties SET bid_due_at='2026-10-05', bid_valid_until='2026-09-01' …
ERROR:  new row for relation "project_parties" violates check constraint
        "project_parties_bid_window_check"
```

`asBidError` loops its five other keys, matches none, and returns the raw PostgREST
string. `useSetPartyBid` rethrows it as an `Error`, `roster-row.tsx`'s `saveBid` hands it
to `writeErrorMessage`, whose schema-word guard (`write-error.ts:79-87`, matching
`violates|constraint`) correctly refuses to print it — and returns the bare fallback.

So the one refusal the seven-field editor can actually raise from two of its own date
inputs reads **"Could not write the bid."** with no field named. The studio types
"The answer was owed 5 Oct" and "The number holds until 1 Sep", presses, and is told
nothing it can act on. The room report §4's claim — "each of `asBidError`'s six refusals
renders as a sentence" — is false for one of six, and the suite is green because the test
asserts against a token the database never emits.

**Fix.** Rename the key to `project_parties_bid_window_check` (keep the old string as a
second key only if a deployed Strata constraint still carries the old name — it does not;
00631 is unapplied there). Update `people-crm-w3.test.ts:358` to the real token, and add a
negative case asserting the OLD token no longer resolves, so the next rename is caught.

---

## MAJOR-2 — the picker's expiry-notice clause cannot see a paper the PERSON holds

**Files:** `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:405-414`
(`firmIds`), `:524-531` (`paperClauseFor`), `:533-558` (`pickedFacts`).
**Confidence: medium — the read is unambiguous; not reachable on today's fixture.**

```tsx
const firmIds = useMemo(
  () => [...new Set(hits.map((c) => c.company_id).filter(Boolean))], [hits]);
const { data: firmPaper } = useComplianceDocumentsFor(open ? firmIds : []);
…
const paperClauseFor = (contact) =>
  noticedPaperClause([contact.company_id, contact.id], firmNameFor(contact) ?? contactName(contact),
                     firmPaper, noticeIndex, COMPLIANCE_DOC_TYPE_LABELS);
```

The holder set names the card as well as the firm, but the DOCUMENT list only ever holds
firm-held rows: `firmIds` is built from `company_id` alone. `noticedPaperClause` filters
`documents` by `holders.has(doc.holder_id)` (`compliance-notice.ts:98-106`), so a document
whose `holder_id` is the person's own card can never be a candidate.

00623 mints `holder_type = 'person'` deliberately, and r9 B-1 was entirely about a
person-held licence being announced under the wrong name — so this is a live population.
The consequence:

* a mini row prints its paper WORD off `people_directory` (`paper={words?.paper_state}`,
  `:859`), which per **R-BA** reduces worst-first over the person's own documents AND the
  firm's — so the row can read `Lapsed` with no sentence beside it, while the roster row
  and the company card both print one for the firm's equivalent;
* SPEC §5.7 #7's consequence sentence (`bringForwardConsequence`, fed by `pickedFacts`)
  omits it, so the studio brings a sole proprietor forward with no word about their own
  lapsed licence — over a travel list that says "document expiries" travel.

And the second half: adding the card ids to `firmIds` alone would print the wrong name.
`holderName` is `firmNameFor(contact) ?? contactName(contact)`, so a person-held paper
would be announced as **the firm's** — r9 B-1 in reverse, on a face this time.

Measured on the local database: the seed holds exactly one person-held document
(`d0e50000-…-000000000036`, Luis Ochoa, `other_named`, expires **2029-05-01**) and
`studio_compliance_notices` is currently empty, so no walk on this fixture exposes it.

**Fix.** Read both holder classes —
`useComplianceDocumentsFor([...companyIds, ...hits.map(c => c.id)])` — and resolve the
holder NAME off the document rather than off the row: `doc.holder_id === contact.id ?
contactName(contact) : firmNameFor(contact)`. That is the branch 00630 already makes for
the notification; `noticedPaperClause` needs a holder-name resolver, not a single string.

---

## Minor

| # | Where | What |
|---|---|---|
| m1 | `use-studio-contacts.ts` `useMergeStudioContacts.onSuccess` | Does not invalidate `partyBidKeys`, `['studio-contact-history']` or `resolvedContactKeys`. 00629 repoints `bid_quoted_by_person_id` onto the survivor (`00629:2044-2046`), so the cached `useProjectPartyBids` index keeps the folded id while `RosterGroups`' `bidPeople` (refetched — the merged card is filtered out) can no longer resolve it: "Priced by Tom Marrow." silently drops off the roster row until the bid query refetches. The picker's history lines go stale the same way. |
| m2 | `household-band.tsx:671-673`; `compare-merge-sheet.tsx:537` | `disabled` without `held`. In the add-member form's OPENING state (`personId === ''`) the primary act carries the native `disabled` attribute, so it leaves the tab order with no reason on the face — the `held` + `aria-describedby` grammar the same file uses six lines above for PR-n. Same shape on "Merge into <survivor>" while the two cards load. |
| m3 | `rolodex-picker.tsx:668-686` | The refused branch names EVERY refused card but translates only `result.refused[0].reason`, so two cards refused for two different reasons read one sentence about the first. |
| m4 | `household-band.tsx:92-98` + `use-households.ts:396` | `parseThresholdEntry` has no upper bound; `set_household_threshold(p_threshold_cents integer)` overflows int4 above $21,474,836.47. Postgres answers "is out of range for type integer", which `writeErrorMessage`'s schema-word regex (`duplicate key\|violates\|constraint\|idx_\|_fkey\|_pkey\|column \|relation `) does not match — so a type name reaches the face. |
| m5 | `household-band.tsx:126-132` | `householdThresholdClearConsequence` says "**every** household member's money grant of $X closes today, on every job". `set_household_threshold()` closes only grants sourced `client_households.co_threshold_cents`; a member's agreement-sourced grant is untouched. The leading clause half-qualifies it ("the signing authority it gave"); the quantifier does not. |
| m6 | `use-coordination.ts:412` | `off_job_at = new Date().toISOString().slice(0,10)` is a **UTC** date. West of UTC an evening withdrawal dates the day the seat left the job to tomorrow, which is what `rosterWindowClause` prints in the Done band. |
| m7 | `people-room.tsx` `?firm=` branch | Now `if (!all) return;` and opens only when `all.some(p => p.person_id === firm)`. If `usePeopleDirectory` errors (data stays `undefined`) the firm deep link is dropped where it previously opened the card immediately. A directory failure now costs the address. |
| m8 | `archive-card-door.tsx:71`; `compare-merge-sheet.tsx:409-411` | `asArchiveError` / `asMergeError` / `asHouseholdError` / `asBidError` all fall through to `return message`, and these two call sites take `e.message` straight to the face without `writeErrorMessage`. An unmapped Postgres string (an RLS 42501, a `_fkey`) prints verbatim, which is SPEC §8 #3's own prohibition. Every other write path in the wave routes through `writeErrorMessage`. |
| m9 | `e2e/people/merge.spec.ts`, `e2e/people/bring-forward.spec.ts` | Neither imports `e2e/utils/wait-helpers`; both use `waitUntil: 'domcontentloaded'` + web-first `expect` + `expect.poll` over `e2e/helpers/supabase-admin`. Chromium-pinned correctly. Consistent with every other spec under `e2e/people/` — a family-wide gap against the brief's WaitHelpers rule, not a wave regression. |
| m10 | `e2e/people/bring-forward.spec.ts:230-236` | `expect(records?.length).toBe(1)` queries `studio_channel_consent` by `channel_value` alone with the service key — no `organization_id`. A second studio holding `+16125550112` fails the assertion for a reason the spec is not about. |
| m11 | `roster-row.tsx` `bidSentence`, moving branch | Appends "A bidder who did not win never reads as crew." for EVERY outcome that moves the stage, including `selected`: "Recording this moves Rivera Finishes to Awarded. A bidder who did not win never reads as crew." A non-sequitur beside a winning bid. |
| m12 | `use-households.ts:341-365` | `useCreateClientHousehold` INSERTs the household, then UPDATEs `designer_clients.household_id`. A refused pointer UPDATE throws after the household exists, so the band reports a failure over a row that was written; the `member_person_ids` leg is what keeps it findable. |
| m13 | `travel-list-pane.tsx:23` | "consent by channel value" carries a column name into the travel list's prose. `STAYS_BEHIND`'s "show to client" is the Call Sheet's own act word and reads fine; "channel value" does not. |

---

## Checked and clean

* **Travel list writes only the allowed facts.** `useBringForward`'s INSERT
  (`use-coordination.ts:502-514`) names exactly `project_id, party_kind, display_name,
  company_name, company_id, trade, phone, email, studio_contact_id`. No consent column,
  no bid column, no `show_to_client`, no pricing, no notes. `normalize_phone_project_parties`
  derives `phone_e164`; PD-11's `false` default stands untouched.
* **Consent is never copied per seat.** No `studio_channel_consent` write, no
  `record_channel_consent` call, and no read of the frozen `project_parties.sms_consent_*`
  columns anywhere in the wave's diff. R-AS / R-AY hold.
* **Merge sheet — survivor flip.** `preferredSurvivorId` picks the older card, ties on id;
  the pre-pick is taken once (`compare-merge-sheet.tsx:248-257`) so a refetch cannot undo a
  flip; both column heads are `aria-pressed` buttons; `survivor_flipped` is measured against
  the pre-pick. The consequence sentence branches correctly on whether the survivor already
  carries a contact rule, and its closing clause is about the ID, which is what the merge
  record guarantees.
* **PR-n gating.** `householdAddIsHeld` mirrors `add_household_member()`'s grant leg
  (`00632:389-400`); both figure acts are `aria-disabled` with `aria-describedby` pointing
  at a sentence that stands on the face pressed or not; `set_household_threshold()`'s
  refusal renders as a sentence.
* **"Close this seat" replaced every hard delete.** `grep` over `apps/` and `packages/`
  returns exactly one `project_parties` DELETE call site (`use-coordination.ts:992`,
  reached only from `roster-row.tsx:245` behind `seatDeleteRefusal`). `seatDeleteRefusal`'s
  `hasBid` now reads the eight bid COLUMNS as well as the stage list, so an awarded or
  off-the-job seat carrying a bid can no longer be hard-deleted. `CloseSeatAct` is one
  component mounted on both the Call Sheet row and the person card's live-seat list
  (`person-profile.tsx:518-527`, over `liveSeats` only).
* **Every refusal token except MAJOR-1's exists.** All eleven merge tokens, all eight
  household tokens, both archive tokens and the four `party_bid_quoted_by_*` tokens are
  raised by name in 00629 / 00631 / 00632; `project_parties_bid_outcome_check` is a real
  constraint. No prefix collisions in any `includes()` map.
* **Stage vocabulary.** Every value `SEAT_BID_OUTCOME_STAGE` writes (`invited, bidding,
  awarded, declined, no_response, off_job`) is admitted by
  `project_parties_stage_check`. `bidStageOutcome` is the single reckoning the write and
  the consequence sentence both read (r8 BLOCKING-1's remedy, intact), including the
  r9 clear branch.
* **Tenancy.** `client_households` RLS is
  `is_active_studio_member(organization_id) AND is_studio_comember(designer_id)` on SELECT,
  with the `co_threshold_cents` principal narrowing on INSERT and UPDATE (catalog-read).
  `useProjectHousehold`'s `.overlaps()` read carries no org filter and does not need one.
  No cross-tenant read or write found in the wave.
* **Document grammar.** Zero `box-shadow` / `shadow-*` in any file this wave added or
  changed. Every colour is a house token; `--color-terracotta-ink` (globals.css:35) and
  `--terracotta-ink` (globals.css:2002) both exist, as do `--ink`, `--ink-subtle`,
  `--ink-faint`, `--rail`, `--paper`, `--hairline-strong`, `.t-body-sm`, `.da-score-hover`
  and `.da-score-on`. `bg-white/40` is the shipped band idiom (kickoff-band, notice-log,
  plan-room-band). `CompareMergeSheet` is a `DocSheet`; the bid editor, the household band
  and `CloseSeatAct` are inline bands, not sheets.
* **Hooks above early returns.** `HouseholdBand`'s `if (!household)` return sits below
  every hook (`:386`); `RosterRow`'s new `useComplianceNotices` / `useMemo` sit above its
  branches; `CompareMergeSheet` and `PersonProfile` hold the same shape.
* **Data access.** Every read and write in the wave goes through a `@patina/supabase` hook
  with a canonical key; no ad-hoc `fetch`; `@patina/types` for `PartyKind`,
  `getSeatStageLabel`, `partyKindOwesPaper`; `database.types.ts` regenerated with the new
  tables, columns and FKs.
* **Duplicate band.** `directoryDuplicatePairs` now requires `row.role === "contact"` on
  both sides, so only rolodex cards — the ids `merge_studio_contacts` takes — can be paired.
