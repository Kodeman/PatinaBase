# W3 (P2) — adversarial code review, round 1

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Scope: every changed file under `apps/designer-portal/src` and `packages/supabase/src` between
`b3f3907fd` (W3 data) and `e632fccc9` (HEAD). Working tree clean on those paths.
Settled and not findings: rulings.md §3 in full, and anything the W3 reports scope to W4.

**Verdict: NOT CLEAN — 1 blocking, 7 major, 10 minor.**

Gates re-run in this review, all green:

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | clean (no output) |
| `pnpm --filter @patina/designer-portal type-check` | clean (no output) |
| `pnpm --filter @patina/admin-portal build` | **EXIT=0**, full route table printed |
| `npx jest` over W3's nine new/extended designer suites | **9 suites, 126 tests, all green** |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **17 passed** |

Checks that PASSED and are not findings, stated so the record is complete:

- **The travel-list write names only the allowed facts.** `useBringForward`'s INSERT
  (`use-coordination.ts:2480-2494`) names `project_id, party_kind, display_name, company_name,
  company_id, trade, phone, email, studio_contact_id` and nothing else — no consent column, no bid
  column, no `show_to_client`, no pricing, no notes. Identical column set to the shipped
  `useAddProjectParty` (`use-coordination.ts:522-549`) minus its explicit `show_to_client: false`,
  which is the column default anyway.
- **Consent is never copied per seat.** No write in this diff touches `studio_channel_consent`,
  `sms_consent_*`, or any consent column; the merge is one RPC (00629) and the number keys the
  record (R-AY). Pinned by `people-crm-w3.test.ts`.
- **Close this seat replaced every hard delete.** `grep` over `apps/` and `packages/` for a party or
  seat DELETE returns exactly one call site, `useRemoveProjectParty` (`use-coordination.ts:905-985`),
  still behind `seatDeleteRefusal`, still reached only from the Call Sheet's "Added by mistake".
  No new delete path was added. (But see MAJOR-1: its guard no longer covers what it names.)
- **Merge invalidation is complete.** `useMergeStudioContacts.onSuccess`
  (`use-studio-contacts.ts:1900-1913`) fans out over ten roots covering every key a card's facts
  are read through.
- **RLS / grants.** `client_households` (00632) carries both tenant legs on SELECT/INSERT/UPDATE and
  PR-n's `is_org_admin_or_owner` on the figure; `studio_compliance_notices` reads
  `is_active_studio_member(organization_id)`; every RPC the hooks call has EXECUTE to `authenticated`
  (verified against the local database). No cross-tenant read or write found.
- **Hooks above early returns.** `person-profile.tsx`'s new `useOrganizations` / `useMemo` sit at
  :211-222, above the first early return at :304. `HouseholdBand`'s `if (!household)` at
  `household-band.tsx:202` follows every hook. `RosterRow`'s new state and queries sit at :206-269,
  above every branch.
- **Document grammar.** Zero `box-shadow` / `shadow-*` in any new file. Every token spent
  (`--terracotta-ink`, `--hairline-strong`, `--rail`, `--ink-subtle`, `--ink-faint`) is declared at
  `:root` in `globals.css:1975-2002`, so the DocSheet portal resolves them.
- **`aria-disabled`, where it was ruled.** `ArchiveCardDoor` (`archive-card-door.tsx:97-119`) passes
  `held` beside `disabled`, so `DocumentAction` renders `aria-disabled` and keeps the control
  focusable with its reason line always on the face; "Set the figure"
  (`household-band.tsx:278-306`) is a raw button with `aria-disabled` and no native `disabled`,
  reason line always printed at :318-326.
- **Playwright.** Both specs are chromium-pinned (`merge.spec.ts:22-25`, `bring-forward.spec.ts:29-32`),
  assert through `e2e/helpers/supabase-admin`'s `adminDb` with `expect.poll`, use web-first
  expectations throughout, and tear their fixtures down. Neither was run (the brief forbids it).

---

## BLOCKING

### BLOCKING-1 — "Open a household" mints a household the face can never find again

*confidence: high · `packages/supabase/src/hooks/use-households.ts:162-230, 231-265` ·
`apps/designer-portal/src/components/document/roster/household-band.tsx:137-156, 202-229`*

`useCreateClientHousehold` inserts `organization_id`, `designer_id`, `display_name`,
`co_threshold_cents` — and no members. 00632 defaults `member_person_ids` to `'{}'::uuid[]`
(`00632_client_households.sql:56`).

`useProjectHousehold` resolves a job's household by **overlap only**:

```
.from("client_households").select("*")
.overlaps("member_person_ids", memberCardIds).limit(1)
```

An empty array overlaps nothing. Probed on the local database:

```
select '{}'::uuid[] && array['…0001'::uuid] as overlaps_empty;  →  f
```

So the sequence a designer actually performs is:

1. Client side band prints "No household is on file for this client, so there is nowhere to record
   who else may sign." + **Open a household** (`household-band.tsx:202-218`).
2. They press it. The row lands. `onAnnounce("The household is open.")` fires.
3. The band re-renders on the same resolver and **still reads "No household is on file for this
   client"**, with **Open a household** offered again.

Two consequences, both blocking by the brief's own rubric:

- **A wrong fact on a face.** The studio is told no household exists over a household that does.
- **The whole of W3 scope 4 is unreachable.** `data-household-threshold`, "Set the figure", PR-n's
  held act and "Add a household member" all render only inside `if (household)`. There is no other
  door: `add_household_member` needs a household id the face cannot obtain. Leah's task — Chidi
  signs change orders over $2,500 — cannot be performed at all, on any project, seeded or new.
  Every press also mints another orphan row (no uniqueness, no pointer read).

The report's §5 probe ("creating the household, `add_household_member` … and the overlap read finds
the household afterwards") is true *in that order* — it called the RPC directly, which is the step
the face cannot reach.

Note `useCreateClientHousehold` already writes `designer_clients.household_id` when a client record
exists (:253-260), and `useProjectHousehold` already resolves `designerClientId` (:186-198) — and
then never reads the pointer back.

**Fix (either, ideally both):** have `openHousehold` seed the membership with the job's client-side
cards (`resolved.memberCardIds` are in hand at `household-band.tsx:105-108`) by widening
`CreateClientHouseholdInput` with `memberPersonIds`; and have `useProjectHousehold` try
`designer_clients.household_id` before falling back to the overlap, so a household with no members
yet is still the job's household.

---

## MAJOR

### MAJOR-1 — the hard delete destroys the bid record the guard exists to protect

*confidence: high · `apps/designer-portal/src/components/document/roster/roster-row.tsx:92-98, 404-411,
820-847` · `packages/supabase/src/hooks/use-coordination.ts:896-904`*

`useRemoveProjectParty`'s own comment states the contract:

> "The bid check reads `stage`, because the bid COLUMNS (`bid_due_at`, `bid_outcome`, …) are P2 and
> do not exist yet … **Named here so the check widens with the columns rather than silently staying
> narrow.**"

W3 shipped the columns and did not widen either predicate. Both the hook's guard
(`use-coordination.ts:903-904`) and the face's (`roster-row.tsx:410`) test
`stage ∈ {prospect, invited, bidding, declined, no_response}`.

`useSetPartyBid` writes the stage from `SEAT_BID_OUTCOME_STAGE`: `selected → awarded`,
`withdrawn → off_job` (`use-coordination.ts:2229-2236`). Neither is in that set.

**Failure:** a sub is asked for a price; the studio writes "Due 5 Oct", "Holds until 4 Nov",
"Priced by Tom Marrow", outcome **Selected**. The seat is now `awarded`, so `hasBid` is false. If the
seat carries no consent record and its firm's paper reads `not_on_file`, pressing "Close this seat" →
**Added by mistake** runs a real `DELETE` and the whole bid history goes with the row. Same for
**They withdrew** (`off_job`).

**Fix:** read `bid_due_at / bid_outcome / bid_valid_until / bid_quoted_by_person_id / bid_amount_cents`
in `useRemoveProjectParty`'s seat select and set `hasBid` when any is non-null; pass the same fact
down to the row so the act is held with its sentence before it is pressed.

### MAJOR-2 — ticked rows are silently dropped when the list changes underneath them

*confidence: high · `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:269-284,
335-338, 349-367, 426-458*

`picked` holds card ids; every consumer resolves them through `cardById`, which is built from `hits`
alone (`:335-338`). Nothing prunes `picked` when `hits` changes.

**Failure:** search "Lindqvist", tick Dana, Pete, Ingrid, Claire. Then narrow the search to "Dana"
(or press a kind chip, which also re-filters). Now:

- `data-pick-count` reads **"4 of 1 … selected"** (`bringForwardSelectionLine(picked.length, hits.length, …)`, `:601`);
- the primary act still reads **"Add four to the roster"** (`bringForwardActLabel(picked.length)`, `:713`);
- `data-bring-forward-consequence` reads "Adds one seat…" because `pickedFacts` filters through
  `cardById` (`:349-367`);
- pressing it inserts **one** seat, and `finish()` announces one name (`:429-431, 476-480`).

Three numbers on one face disagree, and the studio gets a quarter of the act it pressed.

**Fix:** reconcile on every change — `setPicked(p => p.filter(id => scanned.some(c => c.id === id)))` —
or keep a `Map<string, StudioContact>` of picked cards that outlives the filter so the count, the
label, the sentence and the insert all name the same four people.

### MAJOR-3 — the bid editor's consequence sentence is not a sentence

*confidence: high · `apps/designer-portal/src/components/document/roster/roster-row.tsx:711-716` ·
`packages/supabase/src/hooks/use-coordination.ts:2238-2245, 2248-2255`*

```
`Recording this moves ${row.name} to ${SEAT_BID_OUTCOME_ACTS[bidDraft.outcome].toLowerCase()}.`
```

`SEAT_BID_OUTCOME_ACTS` are **acts** — "They declined", "They withdrew", "Asked for a price", "No
response". Rendered into that frame the studio reads:

> "Recording this moves Northgate Electric to they declined. A bidder who did not win never reads as crew."
> "Recording this moves Northgate Electric to they withdrew."
> "Recording this moves Northgate Electric to asked for a price."

The map this sentence wants is `SEAT_BID_OUTCOME_LABELS` — "Bidding / Awarded / Declined / No
response / Off the job" — which W3 defined, exported through `index.ts:500`, and then **used
nowhere** (`grep` over `apps/designer-portal/src` and `packages/supabase/src`: definition and
re-export only). Its existence is the evidence this is a slip, not a choice.

**Fix:** `…moves ${row.name} to ${SEAT_BID_OUTCOME_LABELS[outcome]}.` (or "…to the Declined band.").

### MAJOR-4 — the picker's primary act opens reading "Add no to the roster"

*confidence: high · `apps/designer-portal/src/lib/document/bring-forward.ts:15-33, 85-87` ·
`rolodex-picker.tsx:706-714` · pinned by `e2e/people/bring-forward.spec.ts:241-243`*

`countInWords(0)` is `"no"`, so `bringForwardActLabel(0)` is `"Add no to the roster"`. The act row
renders as soon as `hits.length > 0` (`:595`) and `picked` is reset to `[]` on every open (`:192`),
so **this is the sheet's opening state on every single use** — and the state it returns to after
"Put back", which the e2e spec asserts verbatim.

R-I forbids gating the act, so the answer is the wording, not `aria-disabled`.

**Fix:** `selected === 0 ? "Add to the roster" : \`Add ${countInWords(selected)} to the roster\`` (and
update the spec's assertion).

### MAJOR-5 — the pick-count names a prior job most of the page never worked

*confidence: high · `rolodex-picker.tsx:325-333` · `packages/supabase/src/hooks/use-studio-contacts.ts:494-546`*

```
const names = new Set(hits.map(c => history?.[c.id]?.lastProjectName).filter(Boolean));
return names.size === 1 && hits.length > 0 ? [...names][0] : null;
```

Rows with **no** history are filtered out *before* the uniqueness test. So a page of five where one
card worked the Lindqvist kitchen and four have never been on a job still yields
`sharedJobName = "Lindqvist kitchen"`, and `data-pick-count` prints

> "4 of 5 **from the Lindqvist kitchen** selected"

over four rows that were never there. w3-room-report §3 #3 states the opposite rule — "The job is
named only when every hit on the page shares one prior job — naming one of several would be a claim
about the other rows" — so the report and the code disagree, and the code makes the claim.

Second face, same read: `lastProjectName` is the card's **most recent** seat, current job included
(`useStudioContactHistory` filters on `studio_contact_id` only and takes `max(created_at)`,
`:494-535`). The picker lists cards already on this job (it refuses them only at the press,
`:386-397`), so opening it on the Okonkwo residence can print "Worked 1 prior project, Okonkwo
residence, …" on a row and "from the Okonkwo residence" in the count line — while adding to Okonkwo.

**Fix:** count the rows with no history as their own name (`names.add(null)` before the filter), and
exclude the open `projectId` from the history rollup.

### MAJOR-6 — the prior-job search can only find a card's most recent job

*confidence: high · `rolodex-picker.tsx:269-284` · `use-studio-contacts.ts:519-546`*

The in-memory search matches `history?.[c.id]?.lastProjectName`, and the history hook keeps exactly
one project name per card (the newest by the party row's `created_at`).

So the population this feature exists for — a **repeat** sub — is the population it cannot find:
Dana worked the Lindqvist kitchen in 2025 and anything at all since, and searching "Lindqvist" no
longer returns her. SPEC §5.7 #3's own specimen search, and Leah task 5's whole premise, work only
for cards whose last job happens to be the one being searched.

w3-room-report §3's declared deviation names the 200-card cap but not this, so the record reads as
though the search covers the card's history when it covers one row of it.

**Fix:** carry a `projectNames: string[]` (or a `Set`) per card out of the same query the hook
already runs — the rows are in hand — and search over it. The cost is zero extra requests.

### MAJOR-7 — "Selected" and "They withdrew" are one-way doors

*confidence: high · `roster-row.tsx:625-628` (`isSeat && band === 'bidding'`) ·
`packages/supabase/src/hooks/use-coordination.ts:1690-1702, 1734-1746`*

The whole `data-bid-editor` region renders only in the Bidding band. `declined` and `no_response`
stay in `BIDDING_STAGES` so those rows keep their editor. But `selected → awarded` bands by window
and `withdrawn → off_job` bands to Done — and no other surface offers the bid fields.

**Failure:** a designer picks the wrong line in "How it came back" (the select's six options sit one
above the other), presses **Write the bid**, and the seat leaves the band with a wrong outcome, a
wrong stage, and — for `withdrawn` — a dated `off_job_at` written by `useSetPartyBid:2372-2374`. The
dates and the estimator underneath it can no longer be corrected, and the outcome cannot be walked
back, from anywhere in the portal.

**Fix:** offer the editor on any seat that carries a bid column (`bid ? … : null`) rather than on the
band, or print the written bid with an "Change what came back" act on the banded row.

---

## MINOR

### minor-1 — `CloseSeatAct` did not replace the Call Sheet's copy; the report says it did

*confidence: high · `close-seat-act.tsx:1-144` · `roster-row.tsx:762-812` · report §6*

w3-room-report §6: "`CloseSeatAct` is that act, **extracted so the wording, the dated write and
`peopleEvents.seatClosed` cannot drift** between the two surfaces."

`roster-row.tsx` imports neither `CloseSeatAct` nor `closeSeatConfirmSentence`; it keeps its own
`useCloseProjectPartySeat` (`:217`), its own confirm panel (`:762-812`), its own
`peopleEvents.seatClosed` call (`:793-796`), and a byte-duplicate of the confirm sentence
(`:764-767` vs `close-seat-act.tsx:30-35`). Two copies is exactly the drift the extraction was for,
and a reader of the report will believe there is one.

### minor-2 — R-Q's consent sentence loses its project at the pick

*confidence: high · `rolodex-picker.tsx:615-625` · `bring-forward.ts:137-150`*

`carriedConsentNotice` is always called with `originProjectName: null`, so `data-carried-consent`
prints "Opted out by text, 3 Dec 2025." where R-Q's one wording is
"Opted out by text, 3 Dec 2025, **on the Lindqvist kitchen**." The record has the column
(`consentByValue` already holds the row; `origin_project_id` is on it) — only the name is missing.

### minor-3 — a sole proprietor's own noticed paper never speaks in the picker

*confidence: high · `rolodex-picker.tsx:312-321, 340-347, 358-364`*

`paperClauseFor` asks `noticedPaperClause` for `[contact.company_id, contact.id]`, but
`useComplianceDocumentsFor` is only handed `firmIds = hits.map(c => c.company_id)`. A person card
holding its own documents (the `is_sole_proprietor` population R-BA is written for) has none of them
in `firmPaper`, so the row's paper WORD can read `Lapsed` with no sentence beside it.
Adding `...hits.map(c => c.id)` to `firmIds` costs nothing — it is the same `in()`.

### minor-4 — the roster row prints a notice for `lapses_soon` only

*confidence: high · `roster-row.tsx:234-269`*

`lapsesSoonClause` is computed only when `row.paper === 'lapses_soon'`, so a `lapsed` firm's noticed
date never reaches `data-expiry-notice` on the Call Sheet. Report §7's table lists the roster row as
one of three surfaces reading `noticedPaperClause`, without that narrowing. `heldClause` covers the
"what is held" half but never prints the date the paper lapsed.

### minor-5 — `useProjectHousehold` bypasses its own key factory

*confidence: high · `use-households.ts:166`*

`queryKey: ["client-households", "project", projectId ?? null]` is written inline while
`clientHouseholdKeys` (`:79-87`) is the canonical factory and carries no `project` member. Fan-out
happens to work (the root is a prefix), but the key is unreachable by name and the two invalidation
sites that target it (`:302-304`, `:341-343`) hand-roll the literal.

### minor-6 — schema vocabulary on the travel list

*confidence: medium · `travel-list-pane.tsx:20-27`*

"consent by channel value" spends `channel_value` — a column name on
`studio_channel_consent` — on a face SPEC §8 #3 reserves for the studio's words. "consent, by the
number or address it was given for" says the same thing in the room's own language.
(`e2e/people/bring-forward.spec.ts:116` pins the current string.)

### minor-7 — a withdrawal leaves an undated reason and fires no `seatClosed`

*confidence: high · `use-coordination.ts:2364-2376`*

`useSetPartyBid` stamps `off_job_at` for `withdrawn` (good — a Done row is never undated) but writes
no `off_job_reason`, and the Bidding band fires `peopleEvents.bidRecorded` only. So a seat that
leaves the job through the bid editor is invisible to `people_seat_closed`, which
`people-events.ts:105` names as "the measure of whether Close this seat actually replaced Remove".

### minor-8 — two acts use native `disabled` with no held reason

*confidence: high · `compare-merge-sheet.tsx:350-359` · `household-band.tsx:390-399`*

"Merge into <survivor>" and "Add to the household" pass `disabled` without `held`, so
`DocumentAction` renders a native `disabled` button (`document-action.tsx:309`) — out of the tab
order, with no `aria-describedby` target. Both are only unavailable for a trivially recoverable
reason (no survivor picked yet / nobody chosen), and the portal's existing sheets do the same, so
this is consistency with precedent rather than a new break of §5.5 — noted because the wave
otherwise holds the `held` grammar carefully.

### minor-9 — the act row is not first

*confidence: medium · `rolodex-picker.tsx:595-729` · R-I*

DOM order inside the hits block is: `data-pick-count` → the `<ul>` of rows + `TravelListPane` →
the act row → `data-bring-forward-consequence`. R-I reads "the act row … **comes first**, the
consequence sentence directly beneath it". The consequence pairing is honoured; the "comes first"
half is not, and w3-room-report §3 #6 asserts it as landed ("The act row comes first").
Flagging for a ruling read rather than a rewrite — if R-I meant only "above the consequence", the
report's line is the thing to correct.

### minor-10 — the picker's history line is stale after a bring-forward

*confidence: medium · `use-coordination.ts:2497-2504`*

`useBringForward.onSuccess` invalidates parties, roster, bids, `peopleKeys` and `peopleSeatKeys`, but
not the studio-contact-history key `useStudioContactHistory` owns. Reopening the picker on the same
job shows the pre-add "Worked N prior projects" for the cards just seated. The sheet closes on
success so this is only visible on a second open in the same session.

---

## Where the report over-claims

For the orchestrator's synthesis, the three lines in `w3-room-report.md` a reader should not take at
face value:

1. §6 — "extracted so the wording … cannot drift between the two surfaces" (minor-1: roster-row was
   not repointed).
2. §3 #3 — "The job is named only when every hit on the page shares one prior job" (MAJOR-5: rows
   with no history are excluded from the test).
3. §5 / §10.2 — "the band is inert on the seeded Okonkwo residence **until somebody presses 'Open a
   household'**" (BLOCKING-1: pressing it changes nothing the face can see).
