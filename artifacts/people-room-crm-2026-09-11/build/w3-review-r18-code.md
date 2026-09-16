# W3 (P2) — round 18 adversarial code review

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `fb54b12cc`, working tree clean. Local Postgres only; no prod, no server, no port, no
migration minted, no file changed by this review.

Scope read in full: every changed file under `apps/designer-portal/src` and
`packages/supabase/src` across `3d65f81e4..HEAD` (46 files, +11190/−172), plus the surfaces they
mount (`document-action.tsx`, `person-profile.tsx`, `call-sheet.tsx`) and the three migrations the
code asserts about (`00624`, `00629`, `00632`).

Settled and not findings: every ruling in `rulings.md` §3 (R-A … R-BR), and anything the reports
scope to W4.

**Verdict: NOT CLEAN — 1 blocking, 2 major, 7 minor.**

---

## 1. Prior findings re-checked (`w3-fix-log-r17.md`)

| Prior finding | State | Evidence |
|---|---|---|
| `r17-blocking-1` / `F8` — the figure act opened money grants on other jobs' seats | **FIXED** | `set_household_threshold()` contains no `INSERT` at all: `awk` over the function body returns one `FOR … LOOP`, three `UPDATE public.project_party_authority` (the move/end legs) and one `UPDATE public.client_households`. The only `INSERT INTO public.project_party_authority` in `00632` is at :535, inside `add_household_member()` |
| `r17-major-1` (migrations) — a studio-less seat refused the whole figure act | **FIXED** | same removal; the opening loop that asked PR-n per seat is gone |
| `MAJOR-2-corroborated` / `r17-major-2` — the figure's sentence did not say it opened authority | **FIXED** | `householdThresholdConsequence` (`household-band.tsx:137-145`) names only moves; `clientRepSeatCardIds` (`use-households.ts:386-397`), `membersOwedAuthority` (`household-band.tsx:389-416`) and the `data-household-authority-gap` region (`:760-828`) carry R-BQ's named per-member act |
| `carried-code-review-MAJOR-1-bid-withdraw` / `r17-major-1` (code) — R-BR | **PARTIALLY FIXED → new blocking** | The withdrawal correction is fixed. The clearing branch is written wider than R-BR, and now destroys the record of a seat the studio closed by hand. See BLOCKING-1 |

Nothing else from r17 reopened.

---

## 2. Findings

### BLOCKING-1 · confidence high — recording a bid outcome on a hand-closed seat erases the studio's own closing date and reason, and puts the seat back on the job

`packages/supabase/src/hooks/use-coordination.ts:2577-2602`

```ts
const written = bidStageOutcome(previous, patch.bidOutcome ?? null);
if (written.stage) dbPatch.stage = written.stage;
if (patch.bidOutcome === 'withdrawn' && written.moved) {
  dbPatch.off_job_at = new Date().toISOString().slice(0, 10);
} else if (written.stage) {
  dbPatch.off_job_at = null;
  dbPatch.off_job_reason = null;
}
```

R-BR rules one thing: *"Correcting a bid outcome away from `'withdrawn'` clears `off_job_at` and
`off_job_reason`."* The branch implements something wider — it clears them on **any** save that
writes a stage and is not a withdrawal — and `'off_job'` is deliberately **not** in
`SEAT_STAGES_PAST_THE_BID` (`:2382-2388`, and the fix log states the omission on purpose, to keep
MAJOR-7's correction door open). So a seat closed by **"Close this seat"** — not by a bid
withdrawal — falls straight through it.

**The reachable walk.** A sub in the Bidding band is asked for a price (`bid_asked_at` written, so
`seatCarriesBid` is true). The studio awards the work elsewhere and closes the loser's seat from
the Call Sheet row: `useCloseProjectPartySeat` (`:857-870`) writes `stage='off_job'`,
`off_job_at=<today>`, `off_job_reason='the slab program went to Stonehaven'`. The row bands into
Done and `rosterWindowClause` prints "Off the job 15 Sep 2026. The slab program went to
Stonehaven." The editor is still offered on that row — `isSeat && (band === 'bidding' || hasBid)`
(`roster-row.tsx:796`), labelled "Change what came back" — and "Close this seat" is offered on
every seat row in every band (`roster-row.tsx:1161-1169`). The studio opens it to tidy the record
and picks **"They declined"**.

Measured, not argued — the mutation's own payload, taken through the shipped test harness (probe
file created, run and deleted; tree clean afterwards):

```
previous: { bidOutcome: null, stage: "off_job" }   patch: { bidOutcome: "declined" }
PROBE-R18 {"bid_outcome":"declined","stage":"declined","off_job_at":null,"off_job_reason":null}
```

Three consequences, from one press:

1. **Data loss.** `off_job_reason` is the studio's own sentence about why the seat closed, written
   once, held nowhere else — `project_parties` carries no audit row for it. It is set to NULL and
   cannot be recovered.
2. **A wrong fact on a face.** The seat now reads as live: `rosterWindowClause`
   (`roster-row.tsx:105-124`) prints no closing clause, the row leaves Done for Bidding, the person
   card's Seats-on-projects region moves it from Past seats back to live seats, and
   `CloseSeatAct` is offered on it again as if it had never been closed.
3. **The consequence sentence is false.** `bidSentence` (`roster-row.tsx:495-512`) reads
   "Recording this moves Northgate Electric to Declined. A bidder who did not win never reads as
   crew." It says nothing about reopening a closed seat or discarding the reason — the exact class
   of face/write disagreement r8 BLOCKING-1 closed for the other two branches.

The r17 fix log claims the guard covers this ("Guarded on `written.stage` actually being written,
so a correction that moves nothing leaves a genuine 'Close this seat' date alone"), and the pinning
test proves only the *moves-nothing* case: `people-crm-w3.test.ts:351-361` uses
`previous: { bidOutcome: 'quoted', stage: 'active' }`, which is `pastTheBid`. The
`stage: 'off_job'` + outcome-that-moves case is untested.

**Fix.** Clear the two columns only when the seat is leaving `withdrawn` — the ruling's own words —
rather than on any stage write:

```ts
} else if (written.stage && previous.bidOutcome === 'withdrawn') {
  dbPatch.off_job_at = null;
  dbPatch.off_job_reason = null;
}
```

and pin `previous: { bidOutcome: null, stage: 'off_job' }` → `off_job_at`/`off_job_reason`
`undefined`. (If the studio should be able to reopen a hand-closed seat, that is its own named act
with its own consequence sentence — not a side effect of a select.)

---

### MAJOR-1 · confidence high — "Add to the household" is natively `disabled` before a person is chosen: the primary act is off the tab order with no reason on the face

`apps/designer-portal/src/components/document/roster/household-band.tsx:915-928`

```tsx
<DocumentAction
  actionKey="add-household-member"
  variant="primary"
  disabled={addHeld || !personId || addMember.isPending}
  held={addHeld}
  aria-describedby={addHeld ? "household-grant-held" : undefined}
```

`DocumentAction` renders `disabled={unavailable && !held}` (`document-action.tsx:306`). `addHeld`
is PR-n's standing gate only; the `!personId` leg carries no `held`, so in the region's **opening
state** — `personId` is `""` and the select's first option is "Choose someone from the book"
(`:849-856`) — the primary act is a native `disabled` button: removed from the tab order, no
`aria-disabled`, and no sentence saying what is missing. A keyboard or screen-reader user opening
"Add a household member" reaches the select, the two role buttons and "Not now", and never the act
itself, with nothing explaining the gap. The `data-household-consequence` line beside it reads
"This person joins the household and takes a seat on the Okonkwo residence." — a consequence, not
the reason.

This is the contract the wave's own sibling file states verbatim two components over, as a review
finding it already paid for (`roster-row.tsx:1220-1241`):

> Direction §5.5: a gated act is `aria-disabled` with a VISIBLE consequence sentence beside it —
> never `disabled`. … this one was a regression against the sheet beside it (CR-26).

and which the Send act there honours with `held={!body.trim()}` plus "Write the message first — a
text with no words is not a text." `ArchiveCardDoor` and the "Record the authority" act in this
same file both pair `held` with `disabled` correctly; this one act does not.

**Fix.** `held={addHeld || !personId}`, `aria-describedby` pointing at a visible line
("Choose someone from the book first." for the `!personId` branch), and `onHeldActivate` routing
the same sentence into `setError`.

---

### MAJOR-2 · confidence high — `w3-room-report.md` states a money-authority write the RPC does not make

`artifacts/people-room-crm-2026-09-11/build/w3-room-report.md:275` and `:401`

> …`add_household_member` for Chidi's card reuses his existing OPEN seat and writes `money` and
> `change_order` grants at `250000`…

> | `add_household_member()` round trip | reused Chidi's existing seat; `money` + `change_order`
> grants at 250000; … |

`00632` writes exactly one authority row, scope `'money'` (`00632:535-540`), and the string
`change_order` does not appear anywhere in the file — not at HEAD and not in its first commit
(`git show b3f3907fd:supabase/migrations/00632_client_households.sql | grep change_order` → empty).
`household-band.tsx:196-204` says so at the site, as the B2R-1 fix that corrected the same claim on
the face:

> `add_household_member()` writes exactly ONE authority row, and its scope is `money` … no
> `change_order` grant is minted anywhere in that file.

So the report's probe table records a result the code cannot produce, about money authority, in the
document the orchestrator reads to decide the wave is done — and §9's probe rows are exactly the
evidence a reader would trust over the code. The r15 round's preamble lists the report's
re-measured claims; this one was missed twice.

**Fix.** Amend both lines to "a `money` grant at 250000", and re-run the round trip if the number
is to stay quoted.

---

### MINOR-1 · confidence high — `useSetPartyBid` is the one seat writer that does not invalidate the household band

`use-coordination.ts:2613-2619`. Six seat/authority writers call `invalidateClientHouseholds`
(`:588, :755, :880, :1028, :2003, :2729`). `useSetPartyBid` does not — but R-BR has now made it a
writer of `off_job_at`, which is the exact column `useProjectHousehold`'s open-seat filter reads
(`use-households.ts:369`) to compose `clientSideHasAuthority`, `clientSideMoneyGrants` and
`clientRepSeatCardIds`. With `staleTime` at five minutes the band can keep reading a seat as closed
that the bid editor just reopened (or vice versa). Low likelihood — a client-side seat rarely
carries a bid — but it is the same defect r15 MAJOR closed for the other six, and one line closes it.

### MINOR-2 · confidence high — `useProjectHousehold`'s key is an ad-hoc literal, not a member of `clientHouseholdKeys`

`use-households.ts:248`, hand-spelled again at `:618` and `:656`. It sits under
`clientHouseholdKeys.all` so fan-outs do reach it, but the portal rule is canonical keys from the
factory; a fourth hand-spelling is one typo from a silently dead invalidation. Add
`clientHouseholdKeys.project(projectId)`.

### MINOR-3 · confidence medium — the household band resolves its studio through `project_consent_org()`, the resolver R-BD retires from tenant decisions

`roster-groups.tsx:232` passes `organizationId={consentOrg ?? null}`, and `consentOrg` is
`useProjectConsentOrg(projectId)` (`call-sheet.tsx:109`) = `COALESCE(projects.studio_id,
_primary_studio_for(designer_id))` (`00594:1126-1136`). The band then uses it to pick the candidate
rolodex (`household-band.tsx:314-317`) and as the `organization_id` a new `client_households` row is
minted into (`:453-462`). The rolodex picker makes the same decision through
`useProjectRecordedStudio` for exactly this reason (`rolodex-picker.tsx:252-261`), and R-BD rules
that *"every tenant resolution for a project uses `project_tenant_org()`; `project_consent_org()` is
retired from guards and reducers"*. On a job whose record names a studio the three resolvers agree;
on the studio-less legacy population they need not — measured locally, **5 of 8 projects still carry
`studio_id IS NULL`** after 00628's backfill, and `_primary_studio_for(designer)` answers one studio
for all five while `project_tenant_org()` is caller-relative. Degradation is graceful today
(`household_grant_project_has_no_studio` is translated), so this is a resolver-consistency finding
rather than a wrong face — but a household minted into a book the seat guard does not check is a
row the band may later fail to act on.

### MINOR-4 · confidence high — a merge leaves the picker's history lines stale

`use-studio-contacts.ts:2050-2078` (`useMergeStudioContacts.onSuccess`) reaches eleven roots,
including the two r13 MAJOR-3 added. It does not reach `['studio-contact-history', ids,
excludeProjectId]` (`:540`), which is a rollup over `project_parties.studio_contact_id` — precisely
the column the merge repoints. For the five-minute `staleTime` the bring-forward picker's
`pickerHistoryLine`, its in-memory prior-job search and `sharedJobName` all answer for the
pre-merge split.

### MINOR-5 · confidence high — `membersOwedAuthority` reads only `money` grants, so a `change_order`-only seat is told it has nothing

`household-band.tsx:389-416` builds `withGrant` from `clientSideMoneyGrants`, which
`use-households.ts:422-426` filters to `scope === 'money'`. `useSetPartyAuthority`
(`use-coordination.ts:1951-1995`) writes one scope per call, so a `client_rep` seat carrying a
`change_order` grant and no `money` grant is reachable. That seat is offered R-BQ's act under
"…has no figure of their own on the Okonkwo residence. Nothing defaulted from the agreement.",
directly above a Call Sheet line printing "Approves change orders to $2,500." from the same
`project_party_authority` table. Narrow, but it is the r10 BLOCKING-1 shape one scope over.

### MINOR-6 · confidence high — `TravelListPane`'s accessible name covers half its content

`travel-list-pane.tsx:42-45`: `<aside aria-label="What travels">` also holds the "What stays
behind" list, which is the half of SPEC §5.7 #5 the studio most needs read out. Name it
"What travels, and what stays behind".

### MINOR-7 · confidence high — two stale quotes in `w3-room-report.md`

* §3 row 3 quotes `data-pick-count` as `"4 of 5 from the Lindqvist kitchen selected"`
  (`w3-room-report.md:154`). R-BP settles the seeded Lindqvist pool at **six** and amends SPEC §5.7
  from five to six, and `bringForwardSelectionLine`'s own doc comment
  (`bring-forward.ts:66-76`) quotes "4 of 6". The report quotes a string the seed no longer produces.
* The same §3 table calls the pane's contract fixed but prints §5.7 #5's list without the
  `TRAVELS`/`STAYS_BEHIND` wording drift check; the code's lists are the contract
  (`travel-list-pane.tsx:20-35`) and do match SPEC — no action beyond the count above.

---

## 3. Checks that passed

| Check | Result |
|---|---|
| **Travel list writes only the allowed facts** | `useBringForward`'s INSERT (`use-coordination.ts:2694-2706`) names `project_id, party_kind, display_name, company_name, company_id, trade, phone, email, studio_contact_id` and nothing else. No pricing column, no `notes`, no `show_to_client`, no bid column, no consent column. `show_to_client` lands at PD-11's `false` default; `phone_e164` is minted by `00281`'s BEFORE trigger, so the consent read keys correctly with no consent write |
| **Consent never copied per seat** | `git diff … \| grep` over every added line finds no write to `studio_channel_consent`, `sms_consent_*`, `opt_out_*` or `record_channel_consent` anywhere in the wave's source (only test fixtures and prose). R-AY holds: every consent word on every new face is read, never written |
| **Merge sheet survivor flip and a true consequence sentence** | `preferredSurvivorId` (`compare-merge-sheet.tsx:63-70`) pre-picks the older card with an id tiebreak; the pre-pick effect (`:307-316`) takes once and never re-takes, so a refetch cannot undo a flip; both column heads are `aria-pressed` buttons (`:471-499`). `mergeConsequenceSentence` (`:96-158`) branches on the rule PAIR, splits the UNION'd trades/specialties/sole-proprietor clause, states consent-stays-with-the-number, and closes on the ID rather than on numbers. `survivor_flipped` is measured in analytics (`:445`). All 13 of `merge_studio_contacts()`'s `RAISE EXCEPTION` tokens have a sentence in `MERGE_REFUSAL_SENTENCES`, verified token-for-token against `00629` |
| **PR-n gating** | `householdAddIsHeld` mirrors `00632`'s grant leg; "Set the figure" / "Take the figure away" / "Record the authority" all carry `aria-disabled` (or `held`) plus a reason paragraph that is on the face pressed or not; `useSetHouseholdThreshold` translates the zero-row RLS refusal rather than swallowing it (`use-households.ts:604-609`) |
| **"Close this seat" replaced every hard delete** | `grep` for `useRemoveProjectParty` and `.delete()` across `apps/` and `packages/` returns exactly one call site — `roster-row.tsx`'s "Added by mistake", held behind `seatDeleteRefusal`, whose `hasBid` leg now reads the bid COLUMNS as well as `stage` (`use-coordination.ts:976-981`, `roster-row.tsx:726-733`). No new delete path. `CloseSeatAct` is mounted on `liveSeats` only (`person-profile.tsx:507-529`) |
| **Invalidations** | `useMergeStudioContacts` (11 roots), `useBringForward` (6), `useAddHouseholdMember` (7), `useSetHouseholdThreshold` (6), `useCreateClientHousehold` (2 under one root) all reach every key the touched facts are read through, save the two named in MINOR-1 and MINOR-4 |
| **aria rules** | Every `held` act renders `aria-disabled` and keeps focus (`document-action.tsx:303-309`); `PartyMiniRow` takes `role="checkbox"`/`aria-checked` under `multi` (`party-mini-row.tsx:245-246`); refusals are `role="alert"` and successes `role="status"` throughout; the bid editor's seven fields are `<label htmlFor>`-bound on a per-row `panelId`. One exception: MAJOR-1 |
| **Document grammar** | No `shadow`, `drop-shadow` or `boxShadow` in any new or changed component; no raw hex in any new component; every colour is a `var(--…)` house token. (`household-band.tsx` uses raw `text-[0.74rem]` sizes rather than `.t-*` steps, matching its own surface `roster-row.tsx` and diverging from the wave's other new files, which use `t-body-sm` — noted, not filed: it is the Call Sheet's established grammar) |
| **DocSheet** | Both sheets this wave adds use it — `CompareMergeSheet` (`:508-515`) and the multi-select `RolodexPicker` (`:849`). The household, archive and close-seat acts are inline band/card regions, not sheets |
| **SPEC vocabulary** | No schema token reaches a face: `SEAT_BID_OUTCOME_ACTS` / `_LABELS`, `HOUSEHOLD_MEMBER_ROLE_LABELS`, `MERGE_MATCHED_ON_LABELS` and `writeErrorMessage`'s nine new 00624/00629/00631 translations cover every door; `asMergeError` answers a bare snake_case token with a sentence (`use-studio-contacts.ts:1975-1979`) |
| **e2e shape** | `e2e/people/{bring-forward,merge}.spec.ts` are chromium-pinned (`skip(({browserName}) => browserName !== 'chromium')`), assert through `adminDb` from `e2e/helpers/supabase-admin`, and use web-first `expect(...).toBeVisible/toContainText` with `expect.poll` for the DB reads. No `networkidle`, no `waitForTimeout`. Not re-run this round (no port taken) |
| **No trade or homeowner writing surface** | Every new act is a studio act on a studio surface |

## 4. Gates run this round (pasted)

```
$ pnpm --dir …/packages/supabase type-check
> tsc --noEmit
RC=0

$ pnpm --dir …/apps/designer-portal type-check
> tsc --noEmit
RC=0

$ NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 pnpm --dir …/apps/admin-portal build
… full route table printed … ƒ Proxy (Middleware)   ○ (Static)   ƒ (Dynamic)
(exit 0)

$ cd apps/designer-portal && npx jest <the wave's 10 suites>
Test Suites: 10 passed, 10 total
Tests:       196 passed, 196 total
Time:        3.271 s

$ cd packages/supabase && npx vitest run src/hooks/__tests__/people-crm-w3.test.ts \
    src/hooks/__tests__/use-households-r16.test.ts
 ✓ use-households-r16.test.ts  (4 tests)
 ✓ people-crm-w3.test.ts       (42 tests)
 Test Files  2 passed (2)   Tests  46 passed (46)
```

No migration minted; nothing above 00627 touched; nothing in 00595–00620. Working tree clean at
the end of the review (the BLOCKING-1 probe file was written into
`packages/supabase/src/hooks/__tests__/probe-r18.test.ts`, run, and deleted; `git status` confirms).
