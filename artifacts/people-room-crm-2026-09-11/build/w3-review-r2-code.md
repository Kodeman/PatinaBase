# W3 (P2) — adversarial code review, round 2

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Scope: every changed file under `apps/designer-portal/src` and `packages/supabase/src` in
`3d65f81e4..HEAD` (39 files, +6557/−102), plus `apps/designer-portal/e2e/people/*` and the
migrations the surface reads. Local Postgres only. Nothing was written to the local database
outside a rolled-back transaction; no server was started; no prod was touched.

**Verdict: NOT CLEAN — 1 blocking, 7 major, 11 minor.**

---

## 0. Gates, re-run in this worktree

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | `tsc --noEmit`, exit 0, no output |
| `pnpm --filter @patina/designer-portal type-check` | `tsc --noEmit`, exit 0, no output |
| `pnpm --filter @patina/admin-portal build` | exit 0, full route table printed |
| `npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__/bring-forward.test.ts src/lib/document/__tests__/compliance-notice.test.ts` | **40 suites, 571 tests, all green** |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` (packages/supabase) | **21 passed** |

The gates the report claims are real and reproduce. They do not catch any finding below:
every one is a sentence, a filter or a refusal path that no test asserts against.

## 1. Round-1 findings, re-checked

All twenty are closed. Verified in the live local database and in the diff:

- **B-1** `merge_studio_contacts()` compliance block now moves an absorbed head only where the
  survivor holds a qualifying successor (`00629:591-645`); `prosrc` confirms.
- **B-2 / M-1** `rolodex_card_for_party_phone` and `link_rolodex_card_to_parties` both carry the
  `merged_into` predicate (`pg_proc.prosrc LIKE '%merged_into%'` → `t` for both).
- **M-2** `bid_quoted_by_person_id` repointed inside the seat block.
- **M-3** `array_remove` + append on `client_households.member_person_ids`.
- **M-4** `assert_household_threshold_principal_trg` exists on `client_households`.
- **M-5** `sweep_compliance_expiries()` maps the whole `doc_type` vocabulary; run in a rolled-back
  transaction it returns `{"notices": 3, "scanned": 3, "notified": 6}` with no token in any row.
- **M-6** the three dated bid columns are in `SEAT_BID_COLUMNS`, in `bidNote()`, and in the editor.
- **M-7** the TEAM branch carries `project_tenant_org(tm.project_id)`.
- **QA-1** `householdEmptySentence(clientSideHasAuthority)` (`household-band.tsx:70-74`).
- **QA-3 / MAJOR-6** `projectNames[]` accumulated and searched (`use-studio-contacts.ts:580-585`,
  `rolodex-picker.tsx:281-288`).
- **QA-4 / BLOCKING-1** `memberPersonIds` written at creation and the `designer_clients.household_id`
  pointer read first (`use-households.ts:271-296`, `:352`).
- **QA-5** `title:` gone from `bring-forward.spec.ts`.
- **MAJOR-1** `seatCarriesBid()` ORed into `hasBid` in both the hook and the row.
- **MAJOR-2** `picked` pruned against `cardById` (`rolodex-picker.tsx:376-381`).
- **MAJOR-3** `SEAT_BID_OUTCOME_LABELS` in the consequence sentence.
- **MAJOR-4** `bringForwardActLabel(0)` → "Add to the roster".
- **MAJOR-5** `excludeProjectId` carried, and a history-less row answers `null` into the name set.
- **MAJOR-7** the bid editor renders on `band === 'bidding' || seatCarriesBid(bid)`.

Nothing regressed. Everything below is fresh.

---

## 2. BLOCKING

### B2R-1 · The household band tells the studio the opposite of the grant it is about to write

`apps/designer-portal/src/components/document/roster/household-band.tsx:76-91`

```ts
const grant =
  role === "client_rep" && money
    ? ` They may sign change orders over ${money}.`
    : "";
```

Two things are wrong, and both are money facts on a face.

1. **The scope is wrong.** `add_household_member()` writes exactly one authority row, and its
   scope is `money` (`supabase/migrations/00632_client_households.sql:403-407` — `VALUES
   (v_seat_id, 'money', v_h.co_threshold_cents, …)`). `grep -n change_order
   00632_client_households.sql` returns nothing. No `change_order` grant is ever written by this
   act, yet the sentence promises one.

2. **The limit is inverted.** `threshold_cents` is a CAP. Every reader in the portal prints it
   that way: `AUTHORITY_SCOPE_LABELS.money = 'Signs money'`
   (`packages/supabase/src/hooks/use-coordination.ts:1827`) and `authorityPhrase`
   (`apps/designer-portal/src/lib/document/roster-derivation.ts:1104-1107`) render
   `` `${label} to $${dollars}` `` → **"Signs money to $2,500."** The consequence sentence says
   **"They may sign change orders over $2,500."** — a floor, not a cap, i.e. the reverse.

The band contradicts itself on one screen: `data-household-threshold`
(`household-band.tsx:47-54`) prints *"Change orders over $2,500 need a signature from the
household."* — the figure as the line the household must be brought in ABOVE — and
`data-household-consequence` four elements below says the new member may sign above that same
line. Leah reads the second sentence and presses; the record then says he signs money **up to**
$2,500 and approves nothing.

**Screen + state:** Call Sheet → Client side → Household band → "Add a household member" → choose a
person → "signs for the household" (`client_rep`, the default), on a household carrying a figure.
`data-household-consequence` is the sentence.

**Fix:** name the scope the RPC writes and the direction it writes it in — e.g. `` ` They may sign
money on this job to ${money}.` `` — and, if change-order authority is meant, mint the
`change_order` grant in 00632 rather than claim it on the face.
Confidence: **high** (read off the migration and the two label maps; no inference).

---

## 3. MAJOR

### M2R-1 · "lapses in 30 days" is printed beside a date that is not 30 days away

`apps/designer-portal/src/lib/document/compliance-notice.ts:65-67`

```ts
return when
  ? `${possessive}${input.paperNoun} lapses in 30 days, on ${when}.`
  : `${possessive}${input.paperNoun} lapses in 30 days.`;
```

`lapses_soon` is a 30-day WINDOW, not a 30-day distance — `compliance-table.tsx:72` sets it for
`expires - now <= 30 days`, and the sweep writes the notice on the first night the document enters
that window and never again. The clause then keeps saying "in 30 days" for the whole window while
naming the real date beside it, so the two halves of one sentence disagree.

Measured on the shipped fixture, today (`current_date` = 2026-09-13), inside a rolled-back
transaction:

```
lapses_soon | 2026-10-06 | coi_gl | Lakeshore Painting Co. | days_out: 23
```

The face therefore reads **"Lakeshore Painting Co.'s insurance lapses in 30 days, on 6 October
2026."** — 23 days, not 30. The clause prints on three surfaces (`company-card.tsx:830-840`
`data-expiry-notice`, `roster-row.tsx:594-602` `data-expiry-notice`, and the picker's mini-row
subline `rolodex-picker.tsx:686-690`), so the wrong number is on the company card, the roster row
and the bring-forward picker at once.

**Fix:** say what the record says — either drop the interval ("…lapses on 6 October 2026.") or
compute it ("…lapses in 23 days, on 6 October 2026."). The state WORD "Lapses in 30 days"
(`packages/types/src/studio-config.ts:402`) is a label and may stay; a sentence with a date in it
is an arithmetic claim.
Confidence: **high** (reproduced against the local database).

### M2R-2 · The merge sheet promises the absorbed card's paper moves; 00629 deliberately leaves it

`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:78-87`

```ts
`${mergedName}’s seats, channels, contact rule, paper and firm designations move onto ` +
`${survivorName}. …`
```

Round 1's B-1 fix made the opposite true. `00629:591-645` now moves an absorbed document **only**
where the survivor already holds a qualifying successor (same `doc_type`, head of its own chain,
in force, expiring no earlier, carrying at least the absorbed row's `blocks`); the fix log's own
evidence says so — *"the absorbed `bond`, which the survivor holds nothing to retire, is still on
the absorbed card"*, and *"Block 1's person-into-person assertion was corrected … (the `license`
stays on the absorbed card, unsuperseded)"*. For an ordinary duplicate-person merge, where the
survivor holds no matching certificate, **no** paper moves.

The sheet makes this worse by showing the number first: `data-compare-field="Papers on file"`
(`compare-merge-sheet.tsx:200`) prints the absorbed card's document count, and the sentence
directly beneath then says those documents move onto the survivor. They do not, and the survivor's
count will not change.

**Fix:** say what crm-model §4 says — the absorbed card's paper stays on it, whole and readable
through `resolve_merged_contact()`, and is superseded only where the survivor already holds a
current successor.
Confidence: **high**.

### M2R-3 · A refused bring-forward pick prints a raw PostgREST string

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:512-521`

```ts
setError(
  `${result.refused.map((row) => row.name).join(', ')} did not go on: ${result.refused[0].reason}`,
);
```

`reason` is the untranslated message `useBringForward` stored
(`packages/supabase/src/hooks/use-coordination.ts:2545-2552` — it copies `error.message`
verbatim). Every other write path in this same component routes through `writeErrorMessage`
(`rolodex-picker.tsx:558, 597, 611, 916`), which exists precisely so a constraint name, a relation
name or an RLS string never reaches a face (`lib/document/write-error.ts:41-50`). The wave's own
terminal act is the one that skips it, so `new row for relation "project_parties" violates check
constraint …` or `new row violates row-level security policy for table "project_parties"` lands
under SPEC §8 #3's own prohibition.

**Fix:** run `reason` through `writeErrorMessage(..., 'They did not go on the call sheet.')` —
either at the hook (store a translated reason) or at this call site.
Confidence: **high**.

### M2R-4 · 00629's two new bare refusal tokens print verbatim

`apps/designer-portal/src/lib/document/write-error.ts:29-50`, against
`supabase/migrations/00629_studio_contact_merges.sql:233` and `:244`

00629 raises `party_card_merged_away` and `party_company_merged_away` as bare tokens.
`writeErrorMessage` names only 00624's three tokens (`party_card_project_has_no_studio`,
`party_company_other_studio`, `party_company_not_a_company`), and its schema-word guard
(`/duplicate key|violates|constraint|idx_|_fkey|_pkey|column |relation /i`) does not match a bare
token — so the function falls through to `return raw` and the studio reads the literal string
`party_card_merged_away`. The file's own CR-3 comment says why the other three are listed: *"They
are raised as bare tokens, which the schema-word guard below does not catch, so without these
three the token itself reached the face."* The same reasoning was not applied to the two tokens
this wave minted.

Reachable by "Add" on a merged-away card in the picker (see M2R-5), which is one press.

**Fix:** add both tokens with sentences ("That card has been folded into another one. Open the
card that survived.").
Confidence: **high**.

### M2R-5 · Merged-away cards are still offered by every picker this wave added

`packages/supabase/src/hooks/use-studio-contacts.ts:177-222` (`useStudioContacts`) and the
`StudioContact` interface at `:30-86`

W3 minted `studio_contacts.merged_into` as a tombstone and taught `people_directory` to skip it
(`pg_get_viewdef('people_directory')` contains `merged_into IS NULL`). It taught the *data layer*
nothing: `useStudioContacts` filters `archived_at` and `contact_kind` and nothing else, and the
hand-authored `StudioContact` interface does not even carry `merged_into`, so no consumer can
filter it. Three W3 surfaces read that hook and offer a card the Directory has already folded away:

- `rolodex-picker.tsx:243-245` → the card appears among the hits, with blank reach/consent/paper
  words because `wordsByCard` (built off `people_directory`) has no row for it, and both "Add" and
  the travel-list confirm are refused at the database by `assert_party_card_not_merged` — see
  M2R-4 for what the studio then reads.
- `roster-groups.tsx:121-130` → `bidPeople`, so the merged card is offered as "who priced it";
  00631 refuses with `party_bid_quoted_by_merged_away`.
- `household-band.tsx:129-141` → `candidates`, so the merged card is offered as a household
  member; 00632 refuses with `household_member_not_a_live_person_card`.

So the Directory says one card and three other surfaces say two, and each of the three ends in a
refusal rather than a fact.

**Fix:** add `merged_into` to `StudioContact` and `.is('merged_into', null)` to `useStudioContacts`
(an `includeMerged` escape hatch if some reader needs the tombstone).
Confidence: **high**.

### M2R-6 · "Compare these two" is offered on pairs that are not both rolodex cards

`apps/designer-portal/src/components/document/people/views/directory-view.tsx:504-517` over
`apps/designer-portal/src/lib/document/people-derivation.ts:1352-1375`

`directoryDuplicatePairs` scans **all** directory rows and excludes only firms and `role ===
'client'`. `people_directory` has five identity branches, and only the `contact` branch's
`person_id` is a `studio_contacts.id`:

```
role    | rows | person_id is a studio_contacts.id
client  |    7 | 0
contact |   49 | 49
lead    |    5 | 0
sub     |    1 | 0
team    |    1 | 0
```
(as the seeded designer, `a0000000-…-0004`, in a rolled-back transaction)

A `lead` row carries `leads.contact_phone` (00583) and a `team` row carries the teammate's profile
phone, so a lead or a teammate who is ALSO in the rolodex — the ordinary case for a lead the studio
has since carded — pairs with their card in the band. W2's band merely named the two rows; W3 put
an act on it. Pressing it opens the sheet with one column reading "This card" and "—" for every
field (`useStudioContact(leadId)` → null), `preferredSurvivorId` still resolves, `canMerge` is
true, and the press answers `merge_contact_not_found` → *"One of these cards is no longer in the
book."* — a sentence that is false: the row is in the book, it was never a card.

The seed happens not to produce such a pair (only Rivera Finishes collides, and its `contact` row
is a firm, which is excluded), so nothing is visible on the fixture. The code path is unguarded.

**Fix:** require `role === 'contact'` on both sides of a pair in `directoryDuplicatePairs`, or gate
the "Compare these two" control on it.
Confidence: **medium-high** (path proven by reading the view's branches and the derivation; not
reproducible on the seed).

### M2R-7 · `useComplianceDocumentsFor` drops the retirement rule its sibling applies

`packages/supabase/src/hooks/use-studio-contacts.ts:1580-1605`

The new multi-holder hook returns raw rows. `useComplianceDocuments`, ten lines below
(`:1607-1638`), runs the same rows through `retainedComplianceDocuments(all, today)` — the rule
that exists because *"the company card's table, its held clause and the chase target all read this
list, and the firm row beside them reads the SQL — so the same paper printed two words"* (the
hook's own comment at `:1541-1543`).

`noticedPaperClause` then matches a notice against a document the reducers have retired.
`compliance_state()` reckons supersession transitively (R-BF), so a superseded certificate leaves
the paper word while its `studio_compliance_notices` row stays forever (00630 is append-only). The
picker's mini row consequently prints `paper: Current` beside `data-expiry-notice: "Northgate
Electric's insurance lapsed 31 March 2026."` — the exact divergence B-1 was raised about, moved
one surface over. `bringForwardConsequence` carries the same clause into the confirm sentence
(`rolodex-picker.tsx:397-412`).

`superseded_by` is written today by `merge_studio_contacts()` (`00629:612-617`) and by
`useRecordComplianceDocument({supersedes})`, so the state is reachable through a firm merge.

**Fix:** apply `retainedComplianceDocuments` inside `useComplianceDocumentsFor`, as its sibling does.
Confidence: **medium-high**.

---

## 4. MINOR

| id | Finding | Where | Confidence |
|---|---|---|---|
| m1 | `useSetPartyBid` sets `off_job_at` when the outcome is `withdrawn` but never clears it when the outcome is corrected away — MAJOR-7 made that correction reachable. The seat then reads `awarded` carrying a close date. Nothing prints it today (`rosterWindowClause` only reads `offJobAt` in the `done` band; `person-profile` splits on `stage`), so it is a stale fact in the record rather than on a face — until an export or Patina Field reads it. | `packages/supabase/src/hooks/use-coordination.ts:2434-2442` | high |
| m2 | The same write dates the close in **UTC** (`new Date().toISOString().slice(0,10)`). In US Central after 19:00 the seat is dated tomorrow. `useCloseProjectPartySeat:840` has the identical shape, so this is a copied idiom, not a new bug — named because W3 added a second call site. | `use-coordination.ts:2440` | high |
| m3 | The picker's carried-consent notice passes `originProjectName: null` unconditionally, so it prints *"Opted out by text, 3 December 2025."* where R-Q fixes one wording everywhere — *"Opted out by text, 3 Dec 2025, on the Lindqvist kitchen."* The record carries `origin_project_id` and `directory-view.tsx:322-329` already resolves it to a name. | `rolodex-picker.tsx:676-684` | high |
| m4 | `useComplianceDocumentsFor` is asked only for `company_id`s (`firmIds`, `rolodex-picker.tsx:317-327`) while `paperClauseFor` passes `[contact.company_id, contact.id]` as holders — so a sole proprietor's own paper can never earn a notice clause in the picker, though R-BA says one paper word reduces over both. | `rolodex-picker.tsx:317-390` | high |
| m5 | `useProjectHousehold`'s overlap fallback is `.overlaps(…).limit(1)` with **no ordering**. Where two households in one studio share a member card the band attaches a non-deterministic one, and can flip between them across refetches. RLS keeps it inside the tenant, so this is not a cross-tenant read. | `use-households.ts:308-313` | medium |
| m6 | `HouseholdBand`'s `organizationId` is `useProjectConsentOrg` → `project_consent_org()`, which R-BD retires from guards and reducers in favour of `project_tenant_org()`. The household is therefore *minted* in `COALESCE(studio_id, _primary_studio_for(designer_id))` while `add_household_member`'s PR-n check resolves through `project_recorded_studio()` = `studio_id` alone. They agree wherever `studio_id` is set (00628 backfills it); on a still-NULL project they disagree and the act answers `household_grant_project_has_no_studio` over a household already written in the fallback org. | `call-sheet.tsx:109`, `roster-groups.tsx:200-206`, `household-band.tsx:157-172` | medium |
| m7 | `useSetHouseholdThreshold` treats every zero-row UPDATE as PR-n's permission refusal. A household deleted or made invisible between read and write reads *"A change-order figure is the principal's to set…"*, which is not what happened. | `use-households.ts:399-403` | high |
| m8 | `useCreateClientHousehold` writes `designer_clients.household_id` and invalidates only `client-households`; no `designer_clients` key is touched. Nothing prints the pointer today. | `use-households.ts:358-372` | high |
| m9 | `useMergeStudioContacts` does not invalidate `client-households` or `partyBidKeys` — both of which `merge_studio_contacts()` repoints (round 1's M-3 rewrites `member_person_ids`/`primary_member_person_id`; M-2 rewrites `bid_quoted_by_person_id`). `project-parties` is invalidated but `project-party-bids` is its own key, so the Bidding band keeps printing "Priced by …" off the pre-merge id until a remount. | `use-studio-contacts.ts:1897-1911` | high |
| m10 | `bring-forward.spec.ts` calls `adminDb.rpc("sweep_compliance_expiries")` in `beforeAll` and never removes the `studio_compliance_notices` rows it writes. The shared local database gains permanent notice rows on every run; the spec's `afterAll` tears down only its own project and seats. | `apps/designer-portal/e2e/people/bring-forward.spec.ts:50` | high |
| m11 | `saveFigure` strips to `[0-9.]` and calls `Number()`; a typo like `2.5.0` yields `NaN` and the hook is then asked to write `null`, silently clearing the figure instead of refusing the input. | `household-band.tsx:181-198` | medium |

---

## 5. What was checked and found sound

- **The travel list writes only the allowed facts.** `useBringForward`'s INSERT names exactly
  `project_id, party_kind, display_name, company_name, company_id, trade, phone, email,
  studio_contact_id` (`use-coordination.ts:2523-2534`). No consent column, no bid column, no
  `show_to_client`, no pricing, no notes. `phone` is written, not `phone_e164`, and
  `normalize_party_phone_e164` (00281:117-139) derives the key — so the seat is born reading the
  record's verdict with no write, as the report claims.
- **Consent is never copied per seat.** `grep` for `sms_consent|studio_channel_consent|
  record_channel_consent` across 00629 finds only comments and the directory's READ of the record.
  R-AY holds.
- **Close this seat replaced every hard delete.** Exactly one call site of the DELETE survives —
  `roster-row.tsx:920-947`'s "Added by mistake" — held behind `seatDeleteRefusal` with `held`,
  `aria-describedby` and the reason on the face. `useRemoveProjectParty` re-reads the same three
  facts server-side. `CloseSeatAct` is mounted on the person card's live seats only
  (`person-profile.tsx:511-528`, over `liveSeats`), never on a closed one.
- **The survivor flip.** `preferredSurvivorId` picks the older card, ties on the id; the pre-pick
  is taken once (`compare-merge-sheet.tsx:122-131` guards on `survivorId ||`), so a refetch cannot
  undo a flip; both heads are `aria-pressed` buttons.
- **aria-disabled, not disabled.** Every standing refusal uses the right form:
  `archive-card-door.tsx:97-102` (`held` + `aria-describedby` + a reason line rendered whether or
  not the act can be pressed), `roster-row.tsx:924-928`, and `household-band.tsx:300-328` (a raw
  button carrying `aria-disabled` directly). `DocumentAction`'s `held` is what keeps the control
  focusable (`document-action.tsx:281, 309`). The remaining `disabled=` props in W3's files are
  `isPending` / empty-form transients, the established portal idiom.
- **Document grammar.** No `box-shadow` and no `shadow-*` utility in any file this wave added.
  Colours are house tokens (`--color-*`, `--ink*`, `--hairline-strong`); the two `bg-white/40`
  occurrences are pre-existing idioms lifted from the shipped picker's fallback band.
- **Tenancy.** `client_households`' SELECT/INSERT/UPDATE policies are
  `is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`, with the PR-n leg
  on `co_threshold_cents` in both WITH CHECKs (`00632:225-257`). The unfiltered `.overlaps()` read
  therefore cannot cross a tenant (m5 is an ordering complaint, not a leak).
- **`people_directory` folds the merged card away** (`merged_into IS NULL` present in the live
  view definition), and `people_directory_seats` needs no such filter because the merge repoints
  every seat.
- **Analytics** go through `people-events.ts` only; the three new events are act-shaped, and
  `bringForwardPicked` now fires.
- **e2e** is chromium-pinned via `test.skip(({browserName}) => browserName !== "chromium")`, reads
  back through `e2e/helpers/supabase-admin`'s `adminDb`, and uses `expect.poll` / web-first
  `expect` with no `waitForTimeout` and no `networkidle`. `data-duplicate-band` and every other
  selector the two specs name exists in the source. Neither has been run.
