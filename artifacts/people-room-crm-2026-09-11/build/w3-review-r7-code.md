# W3 (P2) — adversarial code review, round 7

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `a5e624191`, W3 range `3d65f81e4..HEAD` (45 files, +7972/−155 under `apps/designer-portal/src`
and `packages/supabase/src`). Working tree clean except `artifacts/.../rulings.md`. Local Postgres
only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, head `20260910152111`). No prod, no
server started, no port taken, no migration minted, no file changed by this review.

**Verdict: not clean — 1 blocking, 4 major, 11 minor.**

The r6 MAJOR (the change-order figure, R-BO) is **closed** — verified in the shipped code, not from
the fix log's prose. The eleven r6 MINORs were scoped out of round 6 and are **all still open**;
they are restated below with their round-7 evidence. Five findings are new this round, four of them
above minor.

---

## 1. Gates re-run (not taken on trust)

| Gate | Result, this round |
|---|---|
| `pnpm --filter @patina/supabase type-check` | rc=0, no output |
| `pnpm --filter designer-portal type-check` | rc=0, no output |
| `pnpm --filter admin-portal build` | rc=0, full route table printed (the strictest gate after the shared `@patina/supabase` edits) |
| `npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__` | **147 suites, 2885 tests, all passed** (7.2 s) — matches the fix log exactly |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | 25 passed |

No e2e run (the brief forbids taking a port this round). Both specs read correctly:
chromium-pinned via `test.skip(({ browserName }) => browserName !== "chromium")`
(`e2e/people/merge.spec.ts:22`, `bring-forward.spec.ts`), `adminDb` from
`e2e/helpers/supabase-admin`, `expect.poll` on every database assertion
(`merge.spec.ts:136`, `bring-forward.spec.ts:134/178/216`), web-first `expect(...).toBeVisible`
with explicit timeouts, own fixtures created in `beforeAll` and torn down in `afterAll`.

**Note on the shared local database.** The first probes of this round hit
`relation "public.project_parties" does not exist` and a migration ledger that grew from 193 to 561
rows across three consecutive reads — a `supabase db reset` from another session was in flight.
Every measurement below was taken after it settled at head `20260910152111`. Not a product finding;
recorded because this wave is supposed to own the box.

## 2. The brief's own checklist

- **Travel list writes only the allowed facts** — `useBringForward` (`use-coordination.ts:2500+`)
  INSERTs exactly `project_id, party_kind, display_name, company_name, company_id, trade, phone,
  email, studio_contact_id`. No consent column, no bid column, no `show_to_client`, no note, no
  price. `TRAVELS` / `STAYS_BEHIND` (`travel-list-pane.tsx:20-34`) state the same contract. ✔
- **Consent never copied per seat** — `git diff 3d65f81e4..HEAD` over both trees returns **no**
  write to `studio_channel_consent`, `sms_consent_*` or `record_channel_consent`; every hit is a
  read, a comment or a test fixture. R-AY holds. ✔
- **Merge sheet survivor flip + a true consequence sentence** — `preferredSurvivorId`
  (`compare-merge-sheet.tsx:63-71`) pre-picks the older card, ties broken on the id; both heads are
  `aria-pressed` buttons (`:360-364`); the pre-pick is taken once (`:221-230`, guarded on
  `survivorId ||`) so a refetch cannot undo a flip; `mergeConsequenceSentence` names what moves,
  what the survivor overrides, that consent stays with the number and that the folded card is kept.
  ✔ (but see finding 2 for a field that cell-level disagrees with the record)
- **PR-n gating** — `set_household_threshold()` refuses `household_threshold_forbidden`
  (00632:514) and the face states the reason standing, `aria-disabled` + `aria-describedby`, never
  `disabled` (`household-band.tsx:475-478`, `:505-508`, `:539-547`). ✔ for the figure —
  **finding 4** for the other PR-n act on the same band.
- **"Close this seat" replaced every hard delete** — one `.delete()` on `project_parties` in the
  whole data layer (`use-coordination.ts:992`), reached from one call site
  (`roster-row.tsx:950`, "Added by mistake"), behind `seatDeleteRefusal` whose `hasBid` now reads
  the eight bid columns as well as `stage`. The only other `.delete()` in the two packages is
  `useClearContactRule` on `studio_contact_rules` (`use-studio-contacts.ts:1224`), which is a rule,
  not a seat or a card. `CloseSeatAct` is mounted on the Call Sheet row and on the person card's
  live seats (`person-profile.tsx:518-527`). No new delete path. ✔
- **Invalidations** — complete for `useSetPartyBid`, `useBringForward`, `useAddHouseholdMember`,
  `useSetHouseholdThreshold`, `useCloseProjectPartySeat`. **Incomplete for `useMergeStudioContacts`
  — finding 10.**
- **aria rules** — `DocumentAction` renders `disabled={unavailable && !held}` and adds
  `aria-disabled` only when `held` (`document-action.tsx:309-310`, `:281`), so every
  permission-gated act in this wave stays focusable with its reason on the face. The plain
  `disabled` that remains (`compare-merge-sheet.tsx:476`, `household-band.tsx:615`,
  `rolodex-picker.tsx:855/866`) is the shipped empty-form / in-flight idiom. ✔
- **Document grammar** — zero `box-shadow` / `shadow-*` / `drop-shadow` in the added lines
  (grep over `git diff … | grep '^+'`). See finding 14 for the two token dialects. ✔ with a note
- **DocSheet for every sheet** — `CompareMergeSheet` (`:394`) and `RolodexPicker` (`:723`) are the
  wave's only sheets and both mount `DocSheet`. The household band and the bid editor are inline
  regions, not sheets. ✔
- **Hooks above early returns** — verified in all five new components: `household-band.tsx`
  (hooks `:171-219`, first return `:341`), `compare-merge-sheet.tsx`, `close-seat-act.tsx`
  (`:53-57`, return `:59`), `archive-card-door.tsx`, `rolodex-picker.tsx`. No conditional hook. ✔
- **SPEC vocabulary** — the outcome select prints `SEAT_BID_OUTCOME_ACTS`, the household roles
  `HOUSEHOLD_MEMBER_ROLE_LABELS`, the merge evidence `MERGE_MATCHED_ON_LABELS`, the notice clause
  `heldClausePaperNoun`; every raw refusal routes through
  `writeErrorMessage` / `asMergeError` / `asHouseholdError` / `asBidError`. Two exceptions:
  findings 8 and 15.
- **RLS / grants** — unchanged this round; no new query without a tenant answer. The one unscoped
  read (`useProjectHousehold`'s `.overlaps`) is answered by `client_households`' own policy
  (`is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`). No cross-tenant
  read or write found.

## 3. Prior findings, re-checked

| r6 id | State | Evidence |
|---|---|---|
| **MAJOR 1** the change-order figure | **fixed** | `parseThresholdEntry` (`household-band.tsx:92-98`) refuses `""`, `abc`, `2.5.0`, `-500`; `saveFigure` (`:272-295`) returns on null with `HOUSEHOLD_FIGURE_REFUSAL` on the `role="alert"` line and calls the RPC not at all; "Take the figure away" is a separate two-step act (`:501-527`, `:438-469`) carrying PR-n's `aria-disabled` + `household-figure-held`; both acts print `data-household-threshold-consequence`; the announcement is `householdThresholdSentence(cents)` (`:291`, `:312`), the same function `data-household-threshold` renders |
| m-2 bid constraint name | **open** — finding 8 | |
| m-3 one-directional outcome | **open** — finding 6 (and the wider blocking, finding 1) | |
| m-4 second roster surface | **open, downgraded** — finding 12 | `ProjectTeamRoster` is imported by nothing but its own test |
| m-5 person-held paper in the picker | **open** — finding 9 | |
| m-6 merge invalidation | **open** — finding 10 | |
| m-7 "Papers on file" while loading | **open** — finding 11 | |
| m-8 future tense over a past date | **open** — finding 13 | |
| m-9 the other PR-n act | **open, raised to major** — finding 4 | |
| m-10 two token dialects | **open** — finding 14 | |
| m-11 household resolver ordering | **open** — finding 16 | |
| m-12 the band's tenant | **open** — finding 17 | |

---

## 4. Findings

### BLOCKING

**1 · Saving the bid editor rewrites the seat's stage and re-dates the day it left the job.** —
`packages/supabase/src/hooks/use-coordination.ts:2432-2442` (confidence: high)

```ts
if (patch.bidOutcome !== undefined) {
  dbPatch.bid_outcome = patch.bidOutcome ?? null;
  if (patch.bidOutcome) {
    dbPatch.stage = SEAT_BID_OUTCOME_STAGE[patch.bidOutcome];   // unconditional
    if (patch.bidOutcome === 'withdrawn') {
      dbPatch.off_job_at = new Date().toISOString().slice(0, 10); // re-stamped every press
    }
  }
}
```

`saveBid` (`roster-row.tsx`, the `saveBid` block) always sends `bidOutcome`, and `openBidEditor`
seeds the draft from the row's **existing** outcome. So pressing "Write the bid" after correcting
an unrelated field re-applies the outcome's stage:

* **A crew seat is demoted.** `SEAT_BID_OUTCOME_STAGE.selected = 'awarded'`. A seat that was
  selected and has since progressed to `mobilized` / `active` / `closeout` / `warranty` carries
  `bid_outcome = 'selected'`, so `seatCarriesBid` is true and the editor is offered on it
  (`roster-row.tsx`, `isSeat && (band === 'bidding' || hasBid)`, act word "Change what came back").
  Correcting "Who priced it" or "The number holds until" writes `stage = 'awarded'` over `active`.
  `SEAT_STAGE_TO_WORD` (`packages/types/src/studio-config.ts:361-372`) maps `active → on_the_job`
  and `awarded → awarded`, and `SEAT_STAGE_WORD_PIGMENTS` moves `current → pending`, so the person
  card's seat line (`person-profile.tsx:555`, `<StateWord family="stage" …>`) and the Directory
  seat line flip from **"On the job"** to **"Awarded"** for a crew that is on site. Nothing on the
  face says the act would do that; the editor's own sentence says "Recording this moves <name> to
  Awarded", which is a claim about recording an outcome, not about re-saving a date.
* **A withdrawn seat's exit date moves to today.** `off_job_at` is re-stamped on every save, so
  opening a Done row weeks later to add the estimator rewrites the day the seat left the job.
  `rosterWindowClause` prints `offJobAt` in the Done band, so the sheet then states a date the
  record never held.

Neither leg is guarded by a change test, and `stage` has no other writer on this surface.

**Fix:** write `stage` only when the outcome actually changed (`patch.bidOutcome !==
previousOutcome`), and never regress a stage the seat has already passed; stamp `off_job_at` only
on the transition into `withdrawn`, leaving an existing date alone.

---

### MAJOR

**2 · The merge sheet's "Firm" row says neither card has a firm, on a book where every carded human
does.** — `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:271`
(confidence: high)

```ts
firm: card?.company_name ?? "—",
```

`studio_contacts.company_name` on a PERSON row is 00417's typed-by-hand snapshot and nothing since
the affiliation model (00592) populates it. Measured on the local book **this round**: all 13
carded humans with `contact_kind in (sub, gc, installer)` carry `company_name` NULL with
`company_id` set, and `people_directory`'s `contact` branch COALESCEs
`sc.company_name → firm.company_name → firm.full_name`
(`pg_get_viewdef('public.people_directory')`, the `jsonb_build_object('contact_kind', …)` line), so
the Directory row, the person-card header and — after this wave's own F1 fix — the picker's mini
row all print "Northgate Electric" for the same card the compare sheet prints "—" for.

The sheet is the one surface whose entire job is to show the studio what each card holds before one
of them folds; it is also the surface that states `mergeConsequenceSentence`'s "firm designations
move onto <survivor>". `directoryFirmOf` is the one reader of the resolved name and this wave
already uses it twice in `rolodex-picker.tsx:454-458` for exactly this trap. Every other unknown in
the same table prints "—" too, so the reader cannot tell "no firm" from "not read".

**Fix:** resolve the firm the way the picker and the Directory do (the card's `company_id` →
the firm card's own name), with the legacy column as the fallback.

---

**3 · The picker's trade chip hides every row whose trade the picker itself just printed.** —
`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:281-287` vs `:480-488`
(confidence: high)

`scanned` narrows by `(c.specialties ?? []).includes(trade)`, while the row's trade is now
`tradeFor(c)` — own `trades[]`, then **the firm card's** `trades[]`, then the legacy
`specialties[]`. Measured on the local book this round:

```
person  Dana Kowalski     sub   trades {}  specialties {}   company_id -> Northgate Electric
company Northgate Electric sub  trades {electrical}  specialties {}
```

So the mini row prints `SUBCONTRACTOR · NORTHGATE ELECTRIC · ELECTRICAL`, and pressing the
kind chip "Subcontractor" followed by the trade chip "Electrical" filters on `specialties` and
returns **zero** rows — the sheet then prints "– No one by that name in the rolodex." over a book
that holds nine subs. The same is true of every construction trade (9 subs, 4 gcs, 1 installer);
only `vendor` and `maker` cards survive, because a vendor really does keep its trade in
`specialties` (Claire Bissett `{tile_stone}`, Marcus Hale `{plumbing_fixtures}`).

This is W3's own contradiction: before this wave the row printed `c.specialties?.[0]`
(`3d65f81e4:rolodex-picker.tsx:412`), which was empty and therefore agreed with the filter. The
wave taught the row to read the firm's trade and left the filter where it was, so the picker now
denies a fact it prints. "Search by what you need rather than by what you remember" is this
sheet's own stated purpose.

**Fix:** filter through the same `tradeFor` the row prints (the memory filter already runs over
`scanned`, so the firm lookup is in hand).

---

**4 · "Add to the household" is offered ungated and always refuses, and its consequence sentence
promises the grant it cannot write (PR-n).** —
`apps/designer-portal/src/components/document/roster/household-band.tsx:605-620` (confidence: high)
— *carried from r6 m-9, raised*

`add_household_member()` raises `household_grant_forbidden` for **the whole act** — not just the
grant — whenever the household carries a figure and the role is `client_rep`
(`supabase/migrations/00632_client_households.sql:395-400`), and the exception rolls back the
membership and the seat with it. The band's default role IS `client_rep`
(`household-band.tsx:211`), so for a plain studio member on a household with a figure **every
press fails**.

The act is nonetheless rendered with `disabled={!personId || addMember.isPending}` alone, beside
`data-household-consequence` reading "…Chidi Okonkwo joins the household and takes a seat on the
Okonkwo residence. **They may sign money to $2,500.** Nothing is sent to them."
(`householdMemberConsequence`, `:145-157`). `isPrincipal` is already in hand 400 lines up and its
two sibling acts on the same band both carry `aria-disabled` + `household-figure-held`. The brief
names PR-n gating as binding, and this is the one act on the band that states its rule only after
the database refuses.

Related, smaller: `isPrincipal` is computed against `household.organization_id`, while the RPC's
grant leg gates on `is_org_admin_or_owner(project_party_recorded_studio(seat))` — a different org
whenever finding 17's mis-filing happens.

**Fix:** hold the act with `aria-disabled` + the standing reason when
`!isPrincipal && household.co_threshold_cents != null && role === 'client_rep'`, and drop the
money clause from the consequence sentence in that state.

---

**5 · An unsaved bid refusal is announced through the row's status line, not an alert.** —
`apps/designer-portal/src/components/document/roster/roster-row.tsx`, `saveBid`'s `catch`
(confidence: medium)

`setNote(writeErrorMessage(e, 'Could not write the bid.'))` routes a refusal into the same `note`
channel the row uses for "The bid is written on <name>'s seat." — a polite `role="status"` line via
`onAnnounce`. Every other refusal in this wave is a `role="alert"` (`rolodex-picker.tsx:938`,
`household-band.tsx:632`, `compare-merge-sheet.tsx:491`, `archive-card-door.tsx:121`,
`close-seat-act.tsx:134`), which is the idiom CR11-10 settled. A refusal announced politely can be
swallowed by a subsequent status change, and a screen-reader user is told the bid failed in the
same voice that tells them it succeeded.

---

### MINOR

**6 · Clearing the outcome leaves the stage and `off_job_at` where the last pick put them.** —
`packages/supabase/src/hooks/use-coordination.ts:2432-2442` (confidence: high) — *carried, r6 m-3*

`if (patch.bidOutcome)` guards the stage write, so choosing "Nothing recorded yet" nulls
`bid_outcome` and leaves `stage` at `awarded` / `declined` / `off_job`, while the editor's own
sentence in that state reads "The outcome is what moves them out of the bidding band. Nothing else
on this row does." `off_job_at` is likewise never cleared when a `withdrawn` outcome is corrected
to `quoted`. Same code block as finding 1; listed separately because the fix is the other half
(clear on transition out, as well as guard on transition in).

**7 · `useBringForward` hands the raw PostgREST message back, and the picker is the only thing
stopping it reaching a face.** — `packages/supabase/src/hooks/use-coordination.ts:2540-2549`
(confidence: high)

`result.refused[].reason` is the untranslated `error.message`. `addPicked` re-wraps it through
`writeErrorMessage` (`rolodex-picker.tsx:642-649`), so today nothing leaks — but the data layer's
own contract is that a refusal comes back named (every sibling hook throws
`new Error(asXError(error))`), and the next caller of `useBringForward` inherits a raw Postgres
string. Also: only `refused[0]`'s reason is shown, so four picks refused for four different reasons
read as one.

**8 · One bid refusal can never render its sentence — the constraint name is wrong.** —
`packages/supabase/src/hooks/use-coordination.ts:2336-2337` (confidence: high) — *carried, r6 m-2*

`BID_REFUSAL_SENTENCES` keys on `project_parties_bid_valid_until_check`. Measured live this round:

```
select conname from pg_constraint where conrelid='public.project_parties'::regclass and conname like '%bid%';
 project_parties_bid_amount_check | project_parties_bid_outcome_check
 project_parties_bid_quoted_by_person_id_fkey | project_parties_bid_window_check
```

The shipped constraint is `project_parties_bid_window_check` (00631:86-90), so `asBidError` never
matches, returns the raw Postgres text, and `writeErrorMessage`'s schema-word guard
(`/violates|constraint/`, `write-error.ts:80-86`) replaces it with "Could not write the bid." A
studio that types a "holds until" earlier than "the answer was owed" is told nothing about why, and
the intended sentence — "A number cannot stop holding before the day it was owed." — is dead code.
The room report §4's "each of its four refusals renders as a sentence" is not true of this one.

**9 · The picker's paper clause can never speak for a person who holds their own paper.** —
`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:364-373, 490-497`
(confidence: high) — *carried, r6 m-5*

`firmIds` is `hits.map(c => c.company_id)` — company cards only — and that is the only list handed
to `useComplianceDocumentsFor`. `paperClauseFor` and `pickedFacts` then pass
`[contact.company_id, contact.id]` as holders to `noticedPaperClause`, so the person-held leg is
asked of a document set that can never contain a person's document. A sole proprietor — the exact
population R-BA / `identity_paper_state` reduces over both legs for — carries a lapse the mini row
and the confirm sentence stay silent about.

**10 · The merge's invalidation list misses three keys the merge itself repoints.** —
`packages/supabase/src/hooks/use-studio-contacts.ts:1995-2010` (confidence: high) — *carried, r6 m-6*

`merge_studio_contacts()` rewrites `client_households.member_person_ids` /
`primary_member_person_id` (00629:1807-1815) and `project_parties.bid_quoted_by_person_id`
(00629:1759-1760), and `onSuccess` invalidates neither `clientHouseholdKeys.all` nor
`partyBidKeys.all`. An open Call Sheet keeps the pre-merge household membership and keeps resolving
"Priced by …" against a card id that is no longer offered, so the clause disappears until a
refetch. `resolvedContactKeys` is also never invalidated, so a cached `resolve_merged_contact`
answer for a just-merged id stays stale — on the one reader (`people-room.tsx`) PR-o's "both ids
stay resolvable" promise rests on.

**11 · "Papers on file" asserts an absence while the query is still in flight.** —
`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:283-286`
(confidence: medium) — *carried, r6 m-7*

`String((leftPaper ?? []).length || "None")` — `useComplianceDocuments` is `enabled` only once the
sheet is open, so on the first paint of every merge sheet both paper columns read **None** before
the fetch resolves, on a row the studio is using to choose which card keeps the record. Every other
unknown in the same table prints "—".

**12 · The second component that renders the roster gets none of W3's seat facts — and is
unreachable.** — `apps/designer-portal/src/components/document/roster/project-team-roster.tsx:134,
145` (confidence: high) — *carried, r6 m-4, downgraded*

`<RosterGroups projection … consentOrg …>` is mounted with no `projectId`, so
`useProjectPartyBids(null)` is disabled (no `data-bid-note`, no bid editor, no `HouseholdBand`) and
the row-level `hasBid` falls back to `stage` alone, offering "Added by mistake" on an `awarded` seat
carrying a bid (refused at the press by `useRemoveProjectParty`, so no data is lost). `RolodexPicker`
at `:145` gets no `projectName`, so the consequence sentence reads "Adds four seats." with no job.
**Downgraded from r6's reading because `ProjectTeamRoster` is imported by nothing outside
`__tests__/project-roster-surfaces.test.tsx`** (grep over `apps/designer-portal/src`) — no user can
reach it. It is either dead code to delete or a surface to wire; leaving it half-wired is what makes
the next mount wrong.

**13 · The notice clause can print a future tense over a past date.** —
`apps/designer-portal/src/lib/document/compliance-notice.ts:67-79` (confidence: medium)
— *carried, r6 m-8*

The tense comes from the *notice's* state and the date from the *document's* `expires_on`, so
between a `lapses_soon` paper actually crossing its date and the next nightly sweep writing the
`lapsed` notice, the company card prints "Northgate Electric's insurance lapses on 6 October 2026."
on 7 October, beside a paper word that already says lapsed. A ≤24 h window.

**14 · Two token dialects inside one wave.** — `household-band.tsx:39-42`,
`travel-list-pane.tsx:36-38`, `rolodex-picker.tsx:115-122` vs `compare-merge-sheet.tsx:45-46`,
`close-seat-act.tsx:26-27`, `archive-card-door.tsx` (confidence: low) — *carried, r6 m-10*

The people-side files this wave adds use the house tokens and the type steps (`t-body-sm`,
`var(--ink)`, `var(--hairline-strong)`); the roster-side files it adds use `text-[0.74rem]` /
`text-[0.72rem]`, `bg-white/40`, `var(--color-charcoal)`, `var(--color-aged-oak)`,
`var(--color-pearl)`. Both sets are defined and the new roster files match their shipped
neighbours exactly, so this is consistency with the surface rather than a regression — flagged only
because the brief names the `.t-*` steps as binding.

**15 · The merge sheet's "What they are" row can print a raw kind token.** —
`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:268-270`
(confidence: medium)

`getPartyKindLabel(card.contact_kind) || card.contact_kind` falls back to the stored word for any
kind outside `PARTY_KIND_LABELS` (`packages/types/src/field-config.ts:203-224`). The local book
holds person cards with `contact_kind` `maker` (1) and `studio` (3), neither of which is a
`PartyKind`, so the cell prints the lowercase column value. The idiom is shipped (the picker's
`rosterMetaLine` does the same), which is why this is minor rather than a SPEC §8 #3 break unique to
this wave — but the compare sheet is new and could take `companyKindLabel`'s treatment.

**16 · The household resolver picks an arbitrary row when two households share a member.** —
`packages/supabase/src/hooks/use-households.ts:308-313` (confidence: medium) — *carried, r6 m-11*

`.overlaps("member_person_ids", memberCardIds).limit(1)` with no `ORDER BY` and no
`organization_id` / `designer_id` narrowing. 00632 has no uniqueness constraint on membership, so a
card in two households makes which figure the band prints a plan detail. (RLS makes the missing org
filter harmless; the missing order does not.)

**17 · The band's tenant comes from `project_consent_org()`, which R-BD retires.** —
`roster-groups.tsx:195-202` ← `call-sheet.tsx:109` (confidence: medium) — *carried, r6 m-12*

`HouseholdBand` takes `organizationId={consentOrg}`, i.e. `project_consent_org()` =
`COALESCE(projects.studio_id, _primary_studio_for(designer_id))` (verified live in `pg_proc`), and
uses it as the `organization_id` a new `client_households` row — a row that will carry a money
figure — is **created** in. On the legacy `studio_id IS NULL` population R-BI names, that resolves
to a studio the job does not record, while `add_household_member()`'s grant leg resolves through
`project_party_recorded_studio()` (NULL) and refuses by name. R-BD: "Every tenant resolution for a
project uses `project_tenant_org()`; `project_consent_org()` is retired from guards and reducers."
`useProjectRecordedStudio` — which the picker in the same wave already uses for exactly this
question (`rolodex-picker.tsx:233-236`) — is the resolver R-BD points at.

---

## 5. What I could not fault

- **No data loss on merge.** 00629's repoint list is complete against the live schema, and r6's
  five reductions (channel union worst-first with its date, affiliation COALESCE/OR/LEAST, the
  route-drop rule, the sole-proprietor fold closing third parties with `to_date`,
  `is_sole_proprietor` / `vendor_id`) are in the shipped file and named on the compare sheet's own
  table (`carriedRows`, the "Sole proprietor" row at `:181`). R-BN holds.
- **The delete surface is exactly one act at exactly one call site**, and its predicate now reads
  the eight bid columns as well as `stage`.
- **`useBringForward`'s payload is swept by test** for every forbidden key, and the seat is born at
  `show_to_client = false` with its consent read live off the record.
- **`directoryDuplicatePairs`' `row.role !== "contact"` narrowing is right**: only the `contact`
  branch's `person_id` is a `studio_contacts` id, so the band can only ever offer two card ids to
  the merge.
- **Analytics are act-shaped**: `people_cards_merged` carries `survivor_flipped` (PR-o's own
  measure), `people_household_member_added` carries `with_threshold` / `seated`,
  `people_bid_recorded` carries which fields were filled, and `people_bring_forward_picked` finally
  fires.
- **PR-o's deep link** (`people-room.tsx`, `useResolvedContactId` + the two effects) keeps the
  sheet's "an old link still opens this person" promise, waits for `all` before giving up, and
  leaves the Directory standing on every other answer.
