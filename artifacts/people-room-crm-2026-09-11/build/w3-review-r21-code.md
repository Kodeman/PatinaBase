# W3 (P2) — adversarial code review, round 21

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`, HEAD
`30934245c`. Read in full: `git diff 3d65f81e4..HEAD` over `apps/designer-portal/src` and
`packages/supabase/src` (50 files, +11 790 / −183), plus `supabase/migrations/00634`,
`supabase/tests/people/w3_merge_sweep_household_test.sql`, the two `e2e/people` specs, and
`build/w3-room-report.md` / `build/w3-fix-log-r20.md`.

Local Postgres only. No prod. No server started, no port taken, no migration minted, nothing
committed.

**Verdict: NOT CLEAN — four major, one major on the report, ten minor.** No blocking.

---

## 0. r20's findings, re-measured at HEAD

| r20 finding | State |
|---|---|
| r20-blocking-1 / qa-blocking-1 — 00634's ungated `SECURITY DEFINER` trigger | **FIXED.** `00634:144-161` states the gate in the body: `auth.uid() IS NULL` carve-out, then `is_active_studio_member(project_party_recorded_studio(NEW.id)) AND is_studio_comember(project_party_designer(NEW.id))`, then `is_org_admin_or_owner` where `v_principal > 0`. Trigger is `AFTER UPDATE OF off_job_at … WHEN (OLD.off_job_at IS NULL AND NEW.off_job_at IS NOT NULL)` (`00634:192-198`). Block `13e` exists and is the suite's last block (`w3_merge_sweep_household_test.sql:5455`) |
| r20-qa-blocking-2 / r20-major-1 — "Close this seat" on a seat that had already left | **FIXED on both legs.** `roster-row.tsx:230` `seatAlreadyClosed`, `:1207-1216` `disabled` + `held` + `aria-describedby`, `:1223-1230` the visible sentence; `use-coordination.ts:862-890` reads the standing row and never moves a written `off_job_at` nor NULLs a recorded reason |
| r20-major-2 — `w3-room-report.md` §2/§5 stale | **FIXED for §2 and §5**, and **re-opened elsewhere** — see major-5 |

---

## major-1 — closing a seat ends its money in the database and nothing tells the browser, so the Call Sheet goes on printing the figure 00634 just ended

**`packages/supabase/src/hooks/use-coordination.ts:896-903`** (and `:2676-2683` for the bid door).

`00634`'s trigger ends every open grant on the seat at the close
(`UPDATE public.project_party_authority SET effective_to = GREATEST(effective_from, NEW.off_job_at)
… WHERE engagement_id = NEW.id AND effective_to IS NULL`, `00634:163-167`). The act that fires it
invalidates five key roots and none of them is the authority root:

```ts
// use-coordination.ts:896-903 — useCloseProjectPartySeat
onSuccess: (_data, input) => {
  void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
  void queryClient.invalidateQueries({ queryKey: ['project-roster', input.projectId] });
  void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
  void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
  invalidateClientHouseholds(queryClient);
},
```

`partyAuthorityKeys.all` is `['project-party-authority']` (`use-coordination.ts:1917-1921`) and
`projectAuthorityKeys.project` nests under it
(`components/document/roster/use-project-authority.ts:24-27`). Neither `['project-parties']` nor
`['project-roster']` nor `peopleKeys` nor `peopleSeatKeys` nor `clientHouseholdKeys` is a prefix of
it, so the Call Sheet's `authorityBySeat` is **not** refetched. The portal's QueryClient runs
`staleTime` five minutes with `refetchOnWindowFocus: false` — the premise this wave already reasoned
from at `use-coordination.ts:20-35` and `use-studio-contacts.ts` (the r13 MAJOR-3 note).

`useSetHouseholdThreshold` already knows the rule and invalidates `partyAuthorityKeys.all`
(`use-households.ts:623`) for exactly this reason. The close door — the one 00634 was written for —
does not.

**Screen + state.** Okonkwo residence → Call Sheet → Client side. Chidi Okonkwo's `client_rep` seat
prints `Signs money to $2,500.` (`roster-row.tsx:386-395`, `authorityPhrase`). The studio takes
`Close this seat`. The row moves to the Done band (roster invalidated), `rosterWindowClause` prints
`Off the job 15 Sep 2026.` — and the authority phrase **still reads "Signs money to $2,500."**,
present tense, for the rest of the five-minute window, over a grant the database closed in the same
transaction. The household band two elements below IS invalidated
(`invalidateClientHouseholds`), refetches, sees `effective_to` set, and drops the money clause — so
the two faces on one screen state opposite things about one seat's signing authority.

`useProjectAuthority`'s own r19 fix (`use-project-authority.ts:60-76`, drop a grant whose
`effective_to` was stamped by its seat leaving the job) is the correct reducer and is simply never
re-run.

The same gap exists on the bid door: `useSetPartyBid` writes `off_job_at` for `withdrawn`
(`use-coordination.ts:2632-2634`), firing the same trigger, and its `onSuccess`
(`:2676-2683`) invalidates neither `partyAuthorityKeys.all` nor `clientHouseholdKeys.all`.

**Fix.** Add `void queryClient.invalidateQueries({ queryKey: partyAuthorityKeys.all });` to
`useCloseProjectPartySeat`'s and `useSetPartyBid`'s `onSuccess`, beside the existing roots, and add
`invalidateClientHouseholds(queryClient)` to `useSetPartyBid`. Pin it the way the household
invalidation is pinned in `people-crm-w3.test.ts`.

*Severity major · confidence high.*

---

## major-2 — 00634's two new refusals reach the studio as "Could not close the seat.", and the act that raises them is offered live to the caller the database will refuse

**`packages/supabase/src/hooks/use-coordination.ts:893`**,
**`apps/designer-portal/src/components/document/people/close-seat-act.tsx:126-130`**,
**`apps/designer-portal/src/components/document/roster/roster-row.tsx:1088-1092` and `:1196-1216`.**

00634 (minted last round) turned "Close this seat" into a **gated** act with two named refusals:

* `seat_close_authority_forbidden` — not an active member of the recorded studio, or not a co-member
  of the designer (`00634:150-154`);
* `seat_close_money_authority_forbidden` — the seat carries an open `money` / `draw_certify` grant
  and the caller is not an owner or admin of the recorded studio (`00634:156-160`, PR-n).

Nothing in `apps/` or `packages/` knows either word:

```
$ grep -rn "seat_close_authority_forbidden\|seat_close_money_authority_forbidden" apps packages
(no matches)
```

And the hook re-raises the bare PostgREST object rather than an `Error`:

```ts
// use-coordination.ts:891-893
  .single();
if (error) throw error;
```

Both faces then test `e instanceof Error`, which a PostgREST rejection is not — the exact trap
`lib/document/write-error.ts:1-16` was written to close ("PostgREST rejections arrive as a PLAIN
OBJECT … not an `Error`"). `close-seat-act.tsx:126-130` and `roster-row.tsx:1088-1092` both fall to
their literal.

**Screen + state.** Okonkwo residence → Call Sheet → Chidi Okonkwo's row → unfold → `Close this
seat` → `Close the seat`, signed in as a plain `member` of the studio. The press is live and
unqualified; the database rolls the whole close back; the row prints
`Could not close the seat.` — no reason, no named act, nobody to ask. On the Call Sheet that string
goes into `setNote` (`roster-row.tsx:1089`), which is the **polite** announcer (`role="status"` via
`onAnnounce`), not a `role="alert"` — the r7 MAJOR-4 rule this same wave applied to the bid editor
(`roster-row.tsx:258-269`) and to every other refusal in the wave.

Two faces in this wave already state PR-n standing **before** the press rather than after the
refusal — `household-band.tsx:780-788` (`household-figure-held`) and `:819-826`
(`HOUSEHOLD_AUTHORITY_HELD_REASON`). Close this seat, which now carries the same PR-n gate for any
money-bearing seat, states nothing: the only hold on it is r20's already-closed hold
(`roster-row.tsx:230`).

**Fix.** (a) a `SEAT_CLOSE_REFUSAL_SENTENCES` map + `asSeatCloseError()` beside `asBidError` in
`use-coordination.ts`, with the hook throwing `new Error(asSeatCloseError(error))`; (b) both faces
routing the catch through it (the Call Sheet's through a `role="alert"` line, not `setNote`); and
(c) a `held` + visible reason on the act for a non-owner/admin whose seat carries an open money
grant — the authority rows are already in hand on both surfaces (`authority` prop / `SeatFacts`).

*Severity major · confidence high.*

---

## major-3 — recording a bid outcome on a hand-closed seat puts it back in a crew band while its own record still says it left the job

**`packages/supabase/src/hooks/use-coordination.ts:2414-2420` (`SEAT_STAGES_PAST_THE_BID`), `:2451-2467` (`bidStageOutcome`)
and `:2610` (the `stage` write).**

`SEAT_STAGES_PAST_THE_BID` is `mobilized · active · closeout · warranty · retired` — `off_job` is
deliberately absent so `withdrawn` can reach past it (`:2404-2413`). Two rounds narrowed the two
`off_job_at` branches around it (r19: the stamp only where `!previous.offJobAt`; r18: the clear only
where `previous.bidOutcome === 'withdrawn'`) and **neither guards the `stage` write itself**.

The editor is offered on any seat carrying a bid in any band
(`roster-row.tsx:831` — `isSeat && (band === 'bidding' || hasBid)`), which by r18's own reasoning
includes a seat the studio closed by hand ("Change what came back", `:844`).

**Screen + state, three presses.** Okonkwo residence → Call Sheet. A sub's seat carries
`bid_outcome = 'quoted'` with its dates. The studio takes `Close this seat` with the reason
"Picked another electrician" → `stage = 'off_job'`, `off_job_at = '2026-09-10'`,
`off_job_reason = 'Picked another electrician'`; the row bands to Done. A week later the studio
tidies the bid record and selects **"Selected"** (or "Asked for a price", or "They quoted"):

* `bidStageOutcome({bidOutcome:'quoted', stage:'off_job'}, 'selected')` → `moved` true,
  `pastTheBid` false (`off_job` is not in the list), `stage: 'awarded'`;
* neither `off_job_at` branch fires (`patch.bidOutcome !== 'withdrawn'`;
  `previous.bidOutcome !== 'withdrawn'`), so **`off_job_at` and `off_job_reason` stand**.

The row now reads, on one line: stage word **Awarded** (`rosterBandFor`, `use-coordination.ts:1793-1803`,
sends `awarded` through the window rule into `this_week` / `later`), beside
`rosterWindowClause`'s **"Off the job 10 Sep 2026. Picked another electrician."**
(`roster-row.tsx:115-121`). The person card lists the same seat under **Seats on projects** as a
live seat and offers `Close this seat` on it (`person-profile.tsx:119-125` — `awarded` is not in
`DONE_STAGES`; `:511-527`), while the Call Sheet **holds** that act on the same seat
(`roster-row.tsx:230`). `useProjectHousehold`'s open-seat filter
(`use-households.ts:369`) goes on counting the seat closed.

Four readers, one seat, two opposite answers to "is this person on the job" — the harm statement
r17 and r18 both wrote, reached through the branch neither of them narrowed. The consequence
sentence in front of the press promises only "Recording this moves <name> to Awarded."
(`roster-row.tsx:546-549`).

**Fix.** `bidStageOutcome` should treat a seat that already carries `off_job_at` as past the bid for
every outcome except `withdrawn` — i.e. take `offJobAt` (already on `SetPartyBidInput['previous']`,
`:2386-2398`, and already passed by `roster-row.tsx:570`) into the `pastTheBid` predicate, so the
face and the write agree that recording an outcome on a closed seat records what came back and does
not put anyone back on the job. Reopening a seat stays its own named act, which is what
`00634:59-64` and r18 both say.

*Severity major · confidence high.*

---

## major-4 — a correction away from "They withdrew" NULLs a day and a reason that "Close this seat" wrote and the withdrawal never did

**`packages/supabase/src/hooks/use-coordination.ts:2632-2664`.**

```ts
if (patch.bidOutcome === 'withdrawn' && written.moved && !previous.offJobAt) {
  dbPatch.off_job_at = new Date().toISOString().slice(0, 10);
} else if (written.stage && previous.bidOutcome === 'withdrawn') {
  dbPatch.off_job_at = null;
  dbPatch.off_job_reason = null;
}
```

r19's guard on the first branch (`!previous.offJobAt`) means a hand-closed seat's recorded day is
**not** re-stamped when the studio records "They withdrew". The second branch has no such guard, so
it clears a date and a sentence the withdrawal never wrote.

**Screen + state, three presses.** `Close this seat`, reason "Picked another electrician"
(off_job_at 2026-09-10). Record **"They withdrew"** — `previous.offJobAt` set, so nothing is
stamped; `bid_outcome` becomes `withdrawn`. Correct it to **"They quoted"** — `written.stage` is
`'bidding'`, `previous.bidOutcome === 'withdrawn'` → `off_job_at = null`,
`off_job_reason = null`. The studio's own hand-written sentence is gone; nothing holds a second
copy, there is no audit row, and the consequence sentence beside the press promises only the move to
Bidding.

This is r18 BLOCKING-1's harm reached in three presses instead of one. r19's own rule for the branch
above it — "A date the room already holds is the record; this branch may only WRITE one, never move
one" (`:2655-2662`) — reads on this branch as: it may only clear a date **it** wrote.

R-BR ("Correcting a bid outcome away from 'withdrawn' clears off_job_at and off_job_reason") is the
reason the branch exists, and it presupposes the withdrawal put them there; r19 made that no longer
true for this population. Recording this as a finding rather than as settled, for the orchestrator to
rule.

**Fix.** Clear only where the withdrawal is what dated the seat — e.g. carry `offJobReason` beside
`offJobAt` on `previous` and clear only when the standing reason is the one the withdrawal wrote (or
when `previous.offJobAt` was absent at the moment `withdrawn` was recorded, which the row can know
from its own bid dates); otherwise leave the hand-written record standing and let the stage move
alone.

*Severity major · confidence medium (R-BR's scope is arguable; the data loss is not).*

---

## major-5 — `w3-room-report.md` is stale again at HEAD, in §1 and §9: the sixth filing

**`artifacts/people-room-crm-2026-09-11/build/w3-room-report.md` §1 and §9.**

Filed as r7 M-4, r8 MAJOR-1, r15 MAJOR-3, r19 major-2 and r20 major-2. r20's fix re-measured §2 and
§5 and left §1 and §9 at their r19 numbers, while r20 itself added tests to two of the files §1
counts and a block to the suite §9 names.

Measured at HEAD, each file run alone:

| Report claim | Measured |
|---|---|
| §1 `people-crm-w3.test.ts` (45, vitest) | **48** (`npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` → 48 passed) |
| §1 `roster-row.test.tsx` (26 → 50) | **52** (`npx jest … roster-row.test.tsx` → 52 passed) |
| §9 `vitest run … people-crm-w3.test.ts` → **45 passed** (r19) | **48 passed** |
| §9 "**Block 13d is the last**" | **13e** is the last (`w3_merge_sweep_household_test.sql:5359-5449`, then `:5455` "W3 SQL suite: all blocks passed") — the block r20's own fix log introduced |

Every other §1 count re-measured correct: `bring-forward` 17 · `compliance-notice` 10 ·
`travel-list-pane` 5 · `compare-merge-sheet` 17 · `household-band` 45 · `close-seat-act` 6 ·
`archive-card-door` 8 · `rolodex-picker` 38 · `use-project-authority` 3.

§9's whole-suite figures (594 suites / 7693 tests; 106 vitest files / 1355 passed) are r19
measurements and are now at least four tests low on each side; they were not re-run here as a whole.

*Severity major · confidence high (measured).*

---

## Minor

**minor-1 — the merge act is natively `disabled`, with no reason on the face.**
`compare-merge-sheet.tsx:604-613` passes `disabled={!canMerge || merge.isPending}` and no `held`.
`DocumentAction` renders `disabled={unavailable && !held}` (`document-action.tsx:309`), so in the
`!canMerge` state — either card not yet read — the sheet's terminal act is off the tab order with no
`aria-disabled` and no sentence, against direction §5.5 / SPEC §7 #4. Every other gated act in the
wave uses `held` + `aria-describedby` + a visible line. Transient in the ordinary path, which is why
it is minor.

**minor-2 — `asArchiveError`'s fallback returns the raw PostgREST message to a face.**
`use-studio-contacts.ts:400-411` falls through to `return message || 'The card did not move.'` and
`archive-card-door.tsx:70-72` prints `e.message` verbatim. `asMergeError` guards this with its
bare-token test (`use-studio-contacts.ts:2011-2015`) and every other door in the wave wraps its
catch in `writeErrorMessage`. A permission or trigger string from `archive_studio_contact` /
`restore_studio_contact` reaches the person card as a schema word (SPEC §8 #3).

**minor-3 — `ProjectParty` declares five of the eight bid columns.**
`use-coordination.ts:118-127` adds `bid_due_at · bid_outcome · bid_valid_until ·
bid_quoted_by_person_id · bid_amount_cents`; `SEAT_BID_COLUMNS` (`:2338-2347`) and
`database.types.ts:16289-16294` also carry `bid_asked_at`, `bid_quoted_at`, `bid_selected_at`.
`useSetPartyBid` returns `data as ProjectParty` over a row that holds all eight.

**minor-4 — a close/hard-delete refusal on the Call Sheet is announced politely, not as an alert.**
`roster-row.tsx:1088-1092` and `:1129-1133` route their failures into `setNote`, which is the row's
`role="status"` paper plus the sheet's polite announcer (`:246-254`). The wave's own rule, stated at
`:258-269` when it fixed the bid editor (r7 MAJOR-4), is that "every other refusal in this wave is a
`role="alert"`".

**minor-5 — `useSetPartyBid` is the seventh seat writer and the only one that does not invalidate
the household band.** `:2676-2683`. Recording `withdrawn` on a `client_rep` seat closes it, which is
exactly what `useProjectHousehold`'s open-seat filter reads (`use-households.ts:369`,
`:386-397`). The r15 fix names six writers; this one writes the same column.

**minor-6 — a batch of bring-forward refusals is explained by the first one's reason.**
`rolodex-picker.tsx:753-761` joins every refused name and then renders
`writeErrorMessage({ message: result.refused[0].reason }, …)` once, so two picks refused for two
different reasons are given one explanation covering both names.

**minor-7 — the r20 reason-seeding path is unreachable on the shipped write paths.**
`roster-row.tsx:1200-1206` seeds `reason` from `row.offJobReason` on press, but the act is `held`
whenever `row.offJobAt` is set or `stage === 'off_job'` (`:230`), and no writer in the repo sets
`off_job_reason` without `off_job_at` (`useCloseProjectPartySeat` writes both;
`useSetPartyBid`'s clearing branch NULLs both). The pinning test
(`roster-row.test.tsx:606-619`) constructs `offJobReason` with no `offJobAt` and stage
`this_week` — a state the product cannot reach — so it pins a path the face does not have.

**minor-8 — `asMergeError`'s seat-collision sentence can print a double space.**
`use-studio-contacts.ts:1994-2002`: `const seat = kind ? \`${getPartyKindLabel(kind)} seat\` :
'seat'`. `getPartyKindLabel` returns `''` for a kind outside its map (`other_named`, any widened
kind PR-f adds before the label map catches up), yielding "Both cards hold an open  seat on …".

**minor-9 — two new files use raw type sizes rather than the `.t-*` steps.**
`travel-list-pane.tsx:36-38` (`text-[0.74rem]`, `text-[11px]`) and `household-band.tsx:41-44`,
`:585`, `:632`, `:806-811`. The sibling roster files already read this way, so it is consistent
rather than novel — but the People-side files this wave also added
(`compare-merge-sheet.tsx`, `close-seat-act.tsx`, `archive-card-door.tsx`) use `t-body-sm` /
`--ink` correctly, so the room now carries two grammars in one wave's own new code.

**minor-10 — `namesById` in the merge sheet excludes folded cards.**
`compare-merge-sheet.tsx:350-357` reads `useStudioContacts(open ? bookOrgId : null,
{ includeArchived: true })` without `includeMerged`, so a designation id still pointing at a folded
card resolves to the literal `"On file"` (`:214-217`) rather than a name. 00629 repoints the three
designations at the merge, so this should be unreachable; recorded for the same reason r13 MAJOR-1
recorded the archived case.

---

## What was checked and found sound

* **The travel list writes only the allowed facts.** `useBringForward`'s INSERT
  (`use-coordination.ts:2752-2765`) names `project_id · party_kind · display_name · company_name ·
  company_id · trade · phone · email · studio_contact_id` and nothing else — no bid column, no
  `show_to_client`, no pricing, no notes, no consent column. `TRAVELS` / `STAYS_BEHIND`
  (`travel-list-pane.tsx:20-34`) match the write.
* **Consent is never copied per seat.** `git diff 3d65f81e4..HEAD` over both trees contains no
  `sms_consent_*` write outside test fixtures; the merge writes nothing to
  `studio_channel_consent` (R-AY / R-AS hold), and the picker reads the verdict live off
  `people_directory` + `useChannelConsentRecords` keyed on the channel value
  (`rolodex-picker.tsx:377-384`, `:927-944`).
* **The merge sheet's survivor flip and consequence sentence.** `preferredSurvivorId` is taken once
  and never re-taken (`compare-merge-sheet.tsx:305-314`), both column heads are `aria-pressed`
  buttons (`:481-484`), and `mergeConsequenceSentence`'s contact-rule clause branches on the PAIR
  (`:131-138`), matching 00629's UNION/OR reductions for trades, specialties and sole proprietor.
  The `role="status"` announcement (`:461-466`) carries the same split.
* **PR-n gating.** `householdAddIsHeld` (`household-band.tsx:300-306`) mirrors
  `add_household_member()`'s own grant leg; the figure acts are `aria-disabled` with a permanently
  visible reason (`:716-719`, `:746-749`, `:780-788`); R-BQ's per-member "Record the authority" is
  project-scoped and goes through the one door that opens a grant (`:532-557`).
* **"Close this seat" replaced every hard delete.** `grep -rn "\.delete()"` over
  `apps/designer-portal/src` and `packages/supabase/src` returns one party call site,
  `use-coordination.ts:1041` (`useRemoveProjectParty`), held behind `seatDeleteRefusal` whose
  `hasBid` leg now reads the bid COLUMNS as well as the stage (`:998-1003`,
  `roster-row.tsx:607-614`) — and it is reachable only inside the `closing` confirm, which r20's
  hold now keeps shut on an already-closed seat.
* **Merge invalidation.** `useMergeStudioContacts` (`use-studio-contacts.ts:2060-2101`) reaches
  studio-contacts, merges, people, seats, channels, rules, affiliations, compliance,
  `['project-parties']`, `['project-roster']`, `partyBidKeys.all`, `clientHouseholdKeys.all` and
  `resolvedContactKeys.all`.
* **`aria-disabled` not `disabled`.** Every gated act in the wave but minor-1 uses `held`, and
  `DocumentAction` only emits native `disabled` when `held` is false
  (`document-action.tsx:309-310`). The two `aria-disabled` plain buttons in `household-band.tsx`
  keep their click handlers and print their refusal.
* **Document grammar.** No `box-shadow` / `shadow-` / `drop-shadow` anywhere in the added
  designer-portal lines.
* **Playwright.** `e2e/people/bring-forward.spec.ts` and `merge.spec.ts` are chromium-pinned
  (`:31` / `:23` skip every other browser), use `expect.poll` against
  `e2e/helpers/supabase-admin.ts`'s `adminDb`, and contain no `networkidle` and no
  `waitForTimeout`.

---

## Gates run this round (all from the worktree, local only)

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/admin-portal build` (shared-package edits) | **clean**, full route table printed |
| `cd packages/supabase && npx vitest run src/hooks/__tests__/people-crm-w3.test.ts src/hooks/__tests__/use-households-r16.test.ts` | **2 files, 52 passed** (people-crm-w3 **48**, use-households-r16 4) |
| `cd apps/designer-portal && npx jest src/components/document/roster src/components/document/people src/lib/document/__tests__/{bring-forward,compliance-notice,write-error}.test.* src/components/document/overlays/doc-sheet.test.tsx` | **43 suites, 654 tests, all green** |
| per-file jest counts (ten W3 files) | roster-row **52** · household-band 45 · rolodex-picker 38 · compare-merge-sheet 17 · close-seat-act 6 · archive-card-door 8 · bring-forward 17 · compliance-notice 10 · travel-list-pane 5 · use-project-authority 3 |

Local prod-build env was passed inline from `supabase status -o env`; no `.env.local` was created,
no dev server was started, no port was taken, no migration was minted, nothing was pushed.
