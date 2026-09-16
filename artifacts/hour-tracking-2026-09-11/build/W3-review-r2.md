# W3 — adversarial review, round 2

**clean = false** — 0 blockers, 2 majors, 16 minors, 10 notes.

**Reviewed** `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal log --oneline origin/hour-tracking/integration..hour-tracking/portal`
→ `8c63ff3d4`, `d7d0ce16f`, `014d81ad4`, `0dd74dde8`, `959ead009`, `21ea053e1` (33 files, +3411 / −201), full diff of every touched file read.
**Against** plan-v2 §0 + §4, `rulings.md` (HT-1…HT-41, HT-3-a…g, HT-10-a), `W3-impl.md`, `W3-review-r1.md`, `W3-fix-r1.md`.

Round 1's three majors (M1 dead Desk verb · M2 `'design'` default on two surfaces · M3 ⌘K never read the document in hand) are **all genuinely fixed** — verified by reading `21ea053e1` and by the registry-driven `desk-contents.test.tsx` case, which fails if any rendered verb loses its handler. **None of round 1's thirteen minors was addressed**; they are re-reported below, three of them with new measurement that changes what they mean. Two of them I now rate **major**.

---

## 1 · Gates, run by the reviewer, verbatim

| Gate | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **CLEAN** — `Finished supabase db reset on branch main.` `{"target":"local","version":"","message":"Reset local database."}` exit 0 |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **total 9 · green 9 · expected-fail 0 · unexpected-fail 0 · effective-green 9/9.** `time_log_rpc_test.sql PASS (1s)` |
| `scripts/run-sql-tests.sh -d …/supabase/tests/rls -H 127.0.0.1 -p 54422` | **total 31 · green 29 · unexpected-fail 2** — `design_requests_test.sql`, `studio_titles_test.sql (FAIL f: demoting the sole active owner should raise last_owner_protected)`. **Pre-existing and unrelated** (see N-3). W3's own three RLS suites (`time_entry_admin_write_test`, `time_entry_auto_roster_test`, `time_entry_studio_stamp_test`) all PASS |
| `pnpm --dir …/agent-portal --filter @patina/supabase type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal test` | **Test Suites 578 passed / 578 · Tests 7352 passed / 7352 · Snapshots 1 · 29.5s** — includes all six new/extended W3 specs the plan names, plus the r1-fix cases |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal lint` | **✖ 201 problems (0 errors, 201 warnings)**. Independently narrowed: `npx eslint` over the **14 W3-touched source files** returns **zero output** — no touched file contributes a warning |
| `pnpm --dir …/agent-portal --filter @patina/admin-portal build` | **green** — the strictest gate, exercised after the `packages/supabase` edit |
| `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live … playwright … e2e/document/hours.spec.ts --project=chromium` | **7 passed (1.6m)** — including both W3 cases (`the ⌘K "Log time" verb opens a dated form with nothing in hand`, `the bare t key opens the same form`). Run against a hand-started dev server on **:3010** from this worktree pointed at `http://127.0.0.1:54421` with `DATA_MODE=live`, via an override config (see N-7 — port 3000 was held by the PEER program). Server killed; 3010 free |
| `python3 ./scripts/generate-legacy-grants.py` (worktree's own copy, §0.20) | `baseline + 2643 replayed statements`; `git status` on `supabase/seed/00-legacy-grants.sql` **empty** → the committed seed is exactly what regeneration produces |
| `supabase gen types typescript --db-url …54422` vs the committed `database.types.ts` | **substantively in sync** — the only diff is 20 lines of trailing generic-helper boilerplate (parenthesisation of `TableName extends (…)`), attributable to my CLI version. **No table or function type differs**; `log_time` / `start_timer` are byte-identical (N-6) |

**Live wire probes I ran that no test in the repo covers** (authenticated JWT minted against the local JWT secret, against `http://127.0.0.1:54421/rest/v1/rpc/…`) — these **close round 1's m11**:

- `start_timer` with the slot free → `[{"started":{…full row…},"stopped":null}]`
- `start_timer` again → `[{"started":{…},"stopped":{…the first row, duration_minutes 1, rated_amount_cents 0…}}]`
- `log_time` with the hook's **eleven** `p_*` args (no `p_studio_id`) → a **single JSON object**, `source:"command_bar"`, `rate_role:"lead_designer"` derived server-side
- the same `p_entry_id` replayed with a different payload → the **stored** row back (`duration_minutes 45`, `started_at 2026-08-01`, `source command_bar`) — one row in the table
- `log_time` without `p_billable` → `{"code":"P0001","message":"log_time: p_billable must be stated (HT-11) — there is no default"}`

So the `{started, stopped}` envelope the hook reads (`Array.isArray(data) ? data[0] : data`) is the shape PostgREST actually returns, and the `log_time` composite return is a single object, not an array. Probe rows were deleted afterwards; `select count(*) … where duration_minutes is null` = 0.

**Commit hygiene** (`git log --name-only` over all six): six commits, Conventional Commits (`feat(time):` ×4, `test(time):` ×1, `fix(time):` ×1). **`supabase/config.toml` appears in none of them.** Only `apps/designer-portal/next-env.d.ts` is dirty in the worktree — generated, pre-existing, uncommitted. Migration + `database.types.ts` + grants seed + SQL test land in ONE commit (`8c63ff3d4`) — correct grouping.

**Numbering** (§0.2a, re-run across every ref): `00608` exists on `hour-tracking/portal` / `origin/hour-tracking/portal` and nowhere else; `00609` exists on no ref. No collision.

---

## 2 · Findings

### MAJOR

---

**W3-R2-M1 — the Hours add row has no rate readout; plan §4 asks for one and the substitution is undeclared.**
*Severity: major (plan item for THIS wave not delivered) · Confidence: confirmed absent; severity arguable*
**Location** `apps/designer-portal/src/components/document/hours-ledger.tsx:1053-1075` (the new control strip under the add row).

**Finding.** plan-v2 §4's portal table for `hours-ledger.tsx` reads: *"**date field** on the add row …; **billable pill** + rate readout on the add row and the entry rows; the **"backdated" mark**; the **role chip** when multi-role."* Four of the five landed. The add row's new strip carries `BillablePill`, `RateRoleChip` and the `backdated` word — and **no `RateReadout`**. (`RateReadout` is imported and used in `log-strip.tsx` only; grep in `hours-ledger.tsx`: 0 hits.) The entry rows' readout at `:1686-1700` is **pre-existing** (`timeRateProvenance` in the meta line), so it satisfies the "and the entry rows" half without W3 having done anything.

`W3-impl.md` §6 declares three deliberate scope lines (`00609` unused, the add row's `'design'` default — since fixed — and stage-4 work). This one is not among them, so it reads as an omission rather than a decision.

**Why it is arguable rather than obvious.** A pre-write row has no server-resolved rate: `timeRateProvenance({})` returns `{kind:'unrecorded', label:'rate not recorded'}`, which on an empty form is worse than silence and brushes HT-26 in the wrong direction. The implementer's substitute — `billableIntentSentence()` beside the pill ("non-billable · no agreement") — is the honest half that IS knowable client-side.

**Exact fix.** One of two, and the choice is the orchestrator's:
(a) **Declare it.** Add to the wave report: *"plan §4's 'rate readout on the add row' is served by the HT-12 reason sentence; the resolved rate is not knowable before the row is written and printing 'rate not recorded' on an empty form would be a false fact."* Nothing to code.
(b) **Build it.** `useBillableIntent` already holds the authority (`useProjectBillingAuthority(addProject)`); render the matching role rate as a forward-looking line — `<span className="t-head …">{rate ? `${rate.roleName} · ${fmtUsd(rate.hourlyRateCents)}/hr` : 'rate pending'}</span>` — and say in the copy that it is the rate the server will apply, not a stored fact.
Either way, pin the choice with a case in `hours-ledger-add-row.test.tsx`.

---

**W3-R2-M2 — the log strip prints "not billable · $150.00".**
*Severity: major (user-visible money contradiction on the wave's own capture surface) · Confidence: confirmed by reading all three files end to end*
**Location** `apps/designer-portal/src/components/document/log-strip.tsx:188-196` (the `RateReadout` call) × `apps/designer-portal/src/components/document/time-capture.tsx:177-203` (`RateReadout`; the amount arm is `:199`) × `apps/designer-portal/src/lib/document/authority-hours.ts` (`timeRateProvenance`, the `nonbillable` branch).

**Finding.** *(Raised as **m4** in round 1 and not addressed; I am escalating it, and saying so.)* The strip passes the **live pill state** as `entry.billable` but the **stored** `rated_amount_cents` as the amount:

```tsx
<RateReadout entry={{ hourly_rate_cents: offer.hourlyRateCents, rate_source: …,
                      billable,                       // ← live pill state
                      rated_amount_cents: offer.ratedAmountCents }} />   // ← stored
```

`timeRateProvenance` returns `{kind:'nonbillable', label:'not billable'}` the moment `billable === false`, and `RateReadout` then still appends `amount > 0 ? fmtUsd(amount) : null`. So a designer who stops a billable, priced hour and taps the pill to non-billable reads **`not billable · $150.00`** until the write lands. One tap, on the most-travelled path in the wave.

I rate it major rather than minor because it is a **money figure standing next to its own negation**, on the surface `time-capture.tsx`'s own file doc says exists to stop "three facts wearing one face" — and because the plan's done-when for this surface is *"a log-strip entry carries an explicit `billable` and the row prints its reason."* The reason it prints is self-contradictory.

**Exact fix.** In `time-capture.tsx`'s `RateReadout`, suppress the amount whenever the provenance is non-billable:
```tsx
provenance.kind === 'nonbillable' ? null : (amount > 0 ? fmtUsd(amount) : null),
```
Add a case to `log-strip.test.tsx`: offer `{billable:true, hourlyRateCents:18000, ratedAmountCents:7800}`, click the pill, assert `queryByText(/\$78/)` is null and `getByText(/not billable/)` is present.

---

### MINOR

**W3-R2-m1 — the chain-out strip for another tab's row says "that document".**
*minor · confirmed · **carried from r1 (m1), unfixed*** — `document-time-provider.tsx:386` sets `projectName: 'that document'`; `log-strip.tsx` prints `offer.projectName` as the headline `<strong>`. A member with two tabs open gets a strip reading *"that document · 12m in hand"*. The row carries `project_id`, and `useTimeCaptureProjects` already populates a name-bearing cache under `['document-hours-projects']`.
**Fix:** in `offerFromServerStop`, read the name out of `qc.getQueryData(['document-hours-projects'])` by `row.project_id` and fall back to `'that document'` only on a miss.

**W3-R2-m2 — the server-side stop applies no R64 bound and emits no `time_timer_stopped`.**
*minor · confirmed · **carried from r1 (m2), unfixed*** — `00608`'s incumbent-stop computes `duration_minutes` from raw wall clock (`GREATEST(1, ROUND(EXTRACT(EPOCH FROM (now() - started_at))/60))`) with none of `closeOut()`'s protections (R64's `RUNAWAY_IDLE_SECONDS`, the sub-60s `timer_auto` discard, the idle annotation), and `offerFromServerStop` proposes that raw number verbatim with `idleSeconds: 0`. HT-17's instrument never fires for that hour. Narrow — only a row this session never saw reaches it — but when it does, an overnight tab proposes its full wall-clock hours.
**Fix:** either note the exposure in the `00608` banner and accept it, or in `offerFromServerStop` bound `suggestedMinutes` the way `closeOut` does and fire `documentEvents.time.timerStopped({ surface:'document', duration_minutes, adjusted:true, idle_minutes:null, idle_ratio:null })` (~6 lines).

**W3-R2-m3 — `start_timer` can dead-end on a raw `unique_violation` with nothing left to report it. (Exposure measured: narrower than round 1 said.)**
*minor · high · **carried from r1 (m3), unfixed; re-measured***
`00608`'s stop `UPDATE … WHERE user_id = v_user AND duration_minutes IS NULL` runs under the caller's RLS. Round 1 reasoned from the 00484 quartet alone. Measured against a clean reset (`pg_policies`, `cmd IN ('UPDATE','ALL')`), `project_time_entries` now carries **six** write policies, and two of them save most cases:
`Designers manage their project time entries` (ALL, `p.designer_id = auth.uid()`) and `time_entries_studio_update_own` (`user_id = auth.uid() AND is_studio_comember(p.designer_id)`).
So the stuck clock needs a member who is **not** the project's designer, **not** a studio co-member of that designer, and whose roster seat is removed while her timer runs — HT-25's own "removable by the owner" path for an outside roster vendor/bookkeeper. Then: UPDATE matches zero rows silently, the INSERT trips the partial index twice, attempt 2 `RAISE`s a bare `unique_violation`, and `hold`/`resume`'s `.catch(() => null)` swallows it. Auto-start dies with no message anywhere, permanently.
**Fix:** a third arm in `start_timer` — after two attempts, if a `duration_minutes IS NULL` row still exists for `v_user`, `RAISE EXCEPTION 'start_timer: a timer is running on a document you can no longer write to (%), ask an owner to close it', v_blocked_project USING ERRCODE='55006'` — plus one case in `time_log_rpc_test.sql`.

**W3-R2-m4 — the HT-25 seating sentence lies to a member who holds only a non-priceable seat.**
*minor · confirmed · **carried from r1 (m5), unfixed*** — `log-time-sheet.tsx:88` `willBeSeated = Boolean(projectId) && myRoles?.length === 0`, and `useMyRateRoles` (`use-time-tracking.ts:1074-1118`) filters to the four priceable roles. A member seated as `client` or `previous_lead` returns `[]` and is told *"You are not on this roster — logging here seats you as a support designer."* She is on the roster.
**Fix:** widen `useMyRateRoles` to `{ priceable, seated }` (or add a second small selector) and word the sentence off `seated`, not `priceable`.

**W3-R2-m5 — the Log time dialog has no focus trap and no focus restore.**
*minor · confirmed · **carried from r1 (m6), unfixed*** — `log-time-sheet.tsx` declares `role="dialog" aria-modal="true"` and focuses the first field on open, but Tab walks straight out into the page behind (the backdrop `<button>` is `tabIndex={-1}` and nothing wraps focus), and on Escape/close focus is not returned to the trigger — a keyboard user lands back at the top of the document. Every other document overlay reaches this through `DocSheet`/`active-dialog`. (The rest of the dialog's a11y is sound: every control has a label, minutes is a `spinbutton`, the failure is `role="alert"`, all acts are ≥44px via `DocumentAction`.)
**Fix:** mount through the existing overlay primitive, or add a minimal Tab/Shift+Tab loop over `layer.querySelectorAll(FOCUSABLE)` plus `previouslyFocused.current?.focus()` in the close path.

**W3-R2-m6 — the new date input carries an inline font size AND is below the 44px act floor (house sheet §A).**
*minor · confirmed · **carried from r1 (m7), extended***
`hours-ledger.tsx:1017-1024` (the `type="date"` input): `className="… px-2 py-1.5 text-[11px] …"`. Two §A breaches in one new element — an inline font-size utility instead of the type scale, and no `min-h-11` (the box lands ≈30px, against §A's ≥44px for acts). Both copy the row's three siblings verbatim, which is the defensible part; it is still a **new** control carrying them forward, and it is the one control on that row a designer will hit on a phone. Every other W3 file is clean: `log-time-sheet.tsx`, `time-capture.tsx` and `log-time-shortcut.tsx` contain **zero** inline font-size utilities (`t-d3` / `t-body-sm` / `t-head` throughout) and every control is `min-h-11`.
**Fix:** move the whole add row onto the type scale + `min-h-11` in one pass (`t-body-sm`, `doc-type-control`), or record the exemption explicitly in the wave report so the house-sheet sweep knows it is deliberate and scoped to that row.

**W3-R2-m7 — the add row is now five columns with no responsive stack.**
*minor · high · **carried from r1 (m8), unfixed*** — `hours-ledger.tsx:992` `grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto]` (was four). At 390 the document select, minutes, date, activity and Add share one row; a `<input type="date">` alone wants ≈110px. Not covered: the two new e2e cases run at 1440 only, and the existing 390 case exercises the scope lens, not the add row.
**Fix:** `min-[700px]:grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto]` with a stacked `grid-cols-2` below, and extend `hours.spec.ts`'s 390 case to open the add row.

**W3-R2-m8 — the mobile sheet keeps its state after a successful add, and re-shows a stale refusal.**
*minor · confirmed · **carried from r1 (m9), unfixed*** — `mobile-sheets.tsx:1320-1321` clears `minutes` and closes the form only. `pickedProject`, `activity`, `billable`, `rateRole` and `note` persist, so reopening proposes the previous document and role with an empty minutes field — and if the last attempt was refused, the old `role="alert"` text is on screen again before anything has been tried.
**Fix:** clear all five in the success path, and `setNote(null)` when `formOpen` flips on.

**W3-R2-m9 — a weak negative assertion.**
*minor · confirmed · **carried from r1 (m12), unfixed*** — `command-bar-log-time.test.tsx` (the `not.toEqual(objectContaining(...))` block):
```ts
expect(sent).not.toEqual(expect.objectContaining({
  hourlyRateCents: expect.anything(), ratedAmountCents: expect.anything(), rateSource: expect.anything(),
}));
```
`objectContaining` requires **all three** to match, so the negation passes as soon as **one** is absent: a regression reintroducing `hourlyRateCents` alone would go green. (The sibling assertion in `use-time-tracking-authority.test.tsx` (the `Object.keys(args).sort()` assertion) — an exact `Object.keys().sort()` on the RPC argument list — is the strong form and does hold.)
**Fix:** `expect(Object.keys(sent)).toEqual(expect.not.arrayContaining(['hourlyRateCents','ratedAmountCents','rateSource','billingState']))`.

**W3-R2-m10 — SQL case (b) is sequential, not concurrent; `start_timer`'s retry arm has no coverage.**
*minor · confirmed, honestly documented in the file's own header · **carried from r1 (m13), unfixed*** — the plan's test row asks for "two **concurrent** `start_timer` calls". The retry loop's second arm (a genuine `unique_violation` raised by another session in the gap) is executed by no test in the repo, and it is the one piece of `00608` with no coverage. My live probe confirmed the sequential contract at the wire; concurrency is still unproven.
**Fix:** accept and say so in the wave report, or drive a second session via `dblink` inside the test.

**W3-R2-m11 — NEW: a named calendar day can land in the next UTC day, and the member's own week and the studio rollup then disagree.**
*minor · confirmed by reading · medium consequence*
`time-capture.tsx:238-252` `startedAtFromDateValue` keeps **the current clock time** and sets Y/M/D in **local** time. `TimeEntryLedgerRow.day` is documented as a **UTC bucket** ("UTC buckets, matching the resolver's own date basis", `use-time-tracking.ts:789-790`), while the Hours sheet's own week groups rows through `fmtDay(started_at)` — local. A designer at UTC−7 who logs at 17:00 local for "yesterday" stores `yesterday 17:00 −07:00` = **today 00:00 UTC**: her own Hours week shows the day she named; the studio rollup and the scope lens bucket it a day later. This is the first surface in the product where a member **names a calendar day**, so the mismatch is newly visible even though the instant arithmetic is old.
**Fix (smallest honest one):** store the named day at a fixed local mid-day (`at.setHours(12,0,0,0)` after `setFullYear`) so no realistic offset crosses a UTC boundary — or, better, take the ruling: does a named day mean the member's local day or a UTC day? (See also N-9.)

**W3-R2-m12 — NEW: clearing the date field silently logs today.**
*minor · confirmed · low consequence*
`log-time-sheet.tsx:134` `valid = Boolean(projectId) && Number.isFinite(parsed) && parsed >= 1` and `hours-ledger.tsx:418` `addValid = addProject && …` — neither requires a parseable date. A cleared `<input type="date">` yields `''`, `startedAtFromDateValue('')` sees `NaN` and returns `now.toISOString()`. The form shows an empty date; the write says today; nothing tells the designer. HT-13's whole point is that the date is hers.
**Fix:** add `&& /^\d{4}-\d{2}-\d{2}$/.test(date)` to both validity expressions so `Log it` / `Add` are simply disabled while the field is empty.

**W3-R2-m13 — NEW: `rateRole` is not cleared when the document changes, so a role held on the previous document is sent to the new one.**
*minor · confirmed · low consequence (the server refuses, inline)*
`log-time-sheet.tsx:110-120` resets `rateRole` (`:114`) only on **open**; `hours-ledger.tsx` never resets `addRateRole`; `mobile-sheets.tsx` never resets `rateRole`. A multi-role member who picks "bookkeeper" on Okonkwo, then switches the picker to Ellsworth, sends `p_rate_role='bookkeeper'` for a project where she holds no such seat — and W1's `00601` raises. The refusal is honest, but it is a refusal the form could have avoided.
**Fix:** in all three, reset the role whenever the project changes — e.g. `useEffect(() => setRateRole(null), [projectId])` (and the `addProject` / `targetProjectId` equivalents), which is also where `seededFor` already turns over.

**W3-R2-m14 — NEW: the bare `t` is inert unless focus is on `<body>`, but "The keys" says "Anywhere you are not typing."**
*minor · confirmed · discoverability*
`registry-shortcuts.tsx:59-65` `anOverlayIsOpen()` returns **true** whenever `document.activeElement` is anything other than `<body>` (or null) — so after clicking any button, link or card, `t` does nothing at all and nothing says why. The e2e case has to `page.locator('body').click()` first, which is the tell. The `?` doorway wears the same guard but its own copy admits the second half: *"Anywhere you are not typing, **and nothing is open in front.**"* The new entry (`keys-reference.ts:89-96`) prints only *"Anywhere you are not typing."*
**Fix:** copy-only — make the T row read `'Anywhere you are not typing, and nothing is open in front.'`, matching its sibling and the actual guard.

**W3-R2-m15 — NEW: three statements of the same fact on every ledger entry row.**
*minor · confirmed · design*
`hours-ledger.tsx` `EntryRow` now prints, for one non-billable hour: `"… · not billable"` in the meta line (`timeRateProvenance`), the new `BillablePill` reading **"Non-billable"**, and the pre-existing state chip reading **"Non-bill"** (`timeBillingStateLabel`, `hours-ledger.tsx:1782`). The pill is plan-mandated ("billable pill … on the entry rows"), so this is a consequence of the plan rather than a deviation — but a week of rows now says one thing three times, and the row grew a third line.
**Fix:** drop the `nonbillable` arm from the meta line's provenance (the pill and the chip both already carry it), or fold the chip and the pill into one control. Worth an orchestrator call rather than a silent edit.

**W3-R2-m16 — NEW: `RateRoleMark` issues two sequential reads per distinct project on a sheet that renders a week of rows.**
*minor · confirmed · performance, low*
`RateRoleMark` (`time-capture.tsx:155-175`) calls `useMyRateRoles(projectId)` and is rendered per `EntryRow`. `useMyRateRoles` does a `projects` read **then** a `project_team_members` read, sequentially. React Query dedupes per `['time','my-rate-roles', projectId]`, so it is 2 round trips per distinct project, not per row — but a member with a week across eight houses opens the Hours sheet with sixteen extra sequential requests, to decide whether to print a word that is usually absent.
**Fix:** resolve the viewer's seats for the whole visible set in one read (`.in('project_id', ids)`) behind a `useMyRateRolesFor(projectIds)`, or gate `RateRoleMark` on `rate_role !== null` before the hook can matter (hoist the roles read to `HoursLedger` and pass it down).

---

### NOTES

**N-1 — HT-35 (disclosure + opt-out) absent.** Correct: the orchestrator scoped it to stage 4 (lane B, with W7). `document-events.ts` already carries the standing comment. No action.

**N-2 — W4's portal follow-commits absent.** Correct per the orchestrator's scope ruling. `log_time` accepts `p_project_id NULL` and `p_studio_id`, so the door is open. `use-time-tracking-authority.test.tsx` (the `Object.keys(args).sort()` assertion) pins an **eleven**-key argument list that W4 will have to edit when `p_studio_id` gets a caller — worth a one-line comment beside the assertion now so it is not read as a regression then (this is r1's m10, unchanged and still correct to leave).

**N-3 — two RLS suites are red and `supabase/tests/rls/` still has no `KNOWN_FAILURES.md`. Ruling owed.** I reproduced both independently after a clean reset (`design_requests_test.sql` FAIL 3b; `studio_titles_test.sql` FAIL f). Not W3's: `grep -c 'project_time_entries\|log_time\|start_timer'` = 0 in both; W3's entire DB delta is two new functions plus four GRANT/REVOKEs, and the regenerated seed diff is exactly those four. The runner reports them as *unexpected* for every lane that runs the suite, so every remaining wave's RLS gate reads red for reasons unrelated to it. Someone should fix them or create that file. (Unchanged from r1 N-3 — repeated because nothing has happened to it.)

**N-4 — all three document pickers filter to `status === 'active'`. Ruling owed if Kody disagrees.** `log-time-sheet.tsx:218`, `mobile-sheets.tsx:1237`, and the pre-existing `hours-ledger.tsx:998`. Deliberate and tested ("An archived document is not a place to log an hour"), and it matches the shipped ledger. It does brush HT-13: an hour remembered a month late on a document closed in the meantime has no door. The hook's own doc says "every project the caller can read"; every consumer narrows it.

**N-5 — forward-dating is unbounded and unmarked. Ruling owed.** HT-13 says "any date", and `log_time` accepts a future `p_started_at` with no complaint. `isBackdatedEntry` only marks the past (`created_at - started_at > 30 days`), so an hour dated next month prints nothing, is `authorized`, and is claimable by the invoice composer. Probably not what "any date" meant; it needs a word from Kody rather than a code change from the lane.

**N-6 — the `database.types.ts` diff, stated precisely.** Regenerating against `127.0.0.1:54422` with my Supabase CLI produces a file differing from the committed one on **20 lines**, all inside the trailing generic helpers (`TableName extends (DefaultSchemaTableNameOrOptions extends {…} : never) = never` vs the unparenthesised form), at lines 37078–37178. No table type, no function type, no enum differs; `log_time` and `start_timer` are identical. This is a CLI-version formatting difference on my side, **not** a W3 defect. (Incidental: `pnpm db:generate` with a shell-exported `SUPABASE_DB_URL` fails inside this worktree and **truncates** `database.types.ts` to zero content before failing — I restored it with `git checkout --`; the tree is clean. Worth knowing before a later lane runs that command casually.)

**N-7 — e2e isolation, and a live false-green hazard for W4–W7.** Port **3000 was held by the PEER program** — `next start -p 3000` with cwd `.codex/worktrees/agent-people-build/apps/designer-portal`. I did not touch it (it exited on its own later); I ran my own `next dev --webpack -p 3010` from this worktree against `:54421` and drove Playwright through an override config with `baseURL: http://localhost:3010`. **The hazard:** `playwright.config.ts`'s `webServer` has `reuseExistingServer: !process.env.CI` and `url: 'http://localhost:3000'` — so any lane that runs `pnpm --filter @patina/designer-portal test:e2e` while a peer's server is up on 3000 **silently drives the peer's build against whatever stack the peer pointed at**, and passes. Later waves should pin the port or assert the served build before trusting a green e2e. Separately: running `next dev` **inside the Bash sandbox** floods `Watchpack Error (watcher): EMFILE` and the first compile never completes; outside the sandbox the same command was ready and served `/auth/signin 200` in 18s.

**N-8 — the ruling sweep, re-verified independently.**
· **HT-26** — no surface renders a blank where a rate is pending: `timeRateProvenance` returns `rate pending` for `rate_source='none'` and `rate not recorded` otherwise, and `RateReadout` always prints the label. (Marred only by M2's amount.)
· **HT-36** — no surface in this diff reads or writes `notes`; `log_time`'s `p_notes` has no caller; nothing new touches a rollup.
· **HT-11** — `CreateTimeEntryInput.billable` and `StartTimerInput.billable` are both **required**, the `?? true` at `:320` is deleted, both RPCs raise on NULL (verified at the wire, not only in SQL), and all four capture surfaces carry the pill.
· **HT-41** — `RateRoleChip` returns `null` below two priceable roles; `RateRoleMark` is the read-only twin where the row already exists, which is right given `00600` freezes `rate_role` after INSERT.
· **HT-24** — all four surfaces now open on `''` with an `activity not set` option, and all four send `null`.
· **HT-13** — the date follows the paged week (`weekStart` is `useMemo`'d on `weekOffset`, so the effect cannot clobber a typed date), the mark is derived at 30 days and asserted 31-yes / 29-no on the add row, on a written row and in the ⌘K form, and `guard_invoiced_time_entry` still refuses to re-date a billed hour (SQL case (d)).
· **HT-14** — the phone asks, disables `Add entry` until told, and clears only after the server answers; the old auto-closing effect is gone.
· **R69** — no new ticking clock; the mark, the backdated word and the role mark are static text.
· **§0.22** — the strip's `Log` with nothing touched still writes (seeded pill, seeded minutes, `activity ''→null`); no new required field on the stop payload.
· **§0.12** — the invoiced lock is untouched.
· **No flag anywhere** (`useFeatureFlag` in the touched files: 0). **No dashboard, tab, badge, red/green.**

**N-9 — data access, the mock fallback, and transitions.** Both new reads (`useTimeCaptureProjects`, `useMyRateRoles`) live in `packages/supabase`, are exported from `hooks/index.ts`, and no component in the diff constructs a client or calls PostgREST directly (`createBrowserClient|getSupabase|from('` in the three new files: 0). `useTimeCaptureProjects` reuses the Hours sheet's canonical `['document-hours-projects']` key with a **byte-identical** `select('id, name, status').order('name')` — verified against `hours-ledger.tsx:245-255` — so the shared cache cannot serve a shape either reader does not expect. `withMockData` wraps **no** W3 path (grep over all six touched components: 0), so `DATA_MODE=live` had nothing to unmask; I ran the e2e in `live` anyway. No bare `<a>` for an in-app route.

**N-10 — `00609` correctly unused, and `00608` is sound at the object level.** `RETURNS public.project_time_entries` / `RETURNS TABLE(started, stopped)`, `SECURITY INVOKER` both, `SET search_path = public, pg_temp`, `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` both, and a postcondition block that probes `prosecdef`, the `ON CONFLICT` text, both billable raises and both roles' `has_function_privilege`. One curiosity worth naming and not fixing: `log_time`'s INSERT names `studio_id`, a column added by **00610** — i.e. a later file. Harmless (plpgsql bodies are not name-resolved at `CREATE` time, and P-3 ships the whole range at once), but a lane that ever pushes a partial range would find out the hard way. Also: a replayed `log_time` still fires `aaa0_time_entry_auto_roster_trg` (BEFORE INSERT runs even when `ON CONFLICT DO NOTHING` skips the row); `00597` is idempotent on the live-seat check, so nothing is written twice.

---

## 3 · Done-when, re-checked by the reviewer

| Plan §4 done-when | Verdict |
|---|---|
| 45-minute call in **5 interactions** from ⌘K with no document open, `SELECT` shows `source='command_bar'` | **✅ now.** ⌘K → Log time → Document → Minutes → Enter = 5 (date defaults to today, activity optional). r1's M3 is fixed, so with a document in hand it is 4. `source='command_bar'` pinned at the RPC boundary (jest), stored and read back in SQL case (a), **and confirmed at the wire** by my PostgREST probe. Still not driven end-to-end in a browser — the e2e deliberately stops short of submitting, an honest declared posture. |
| The same entry dated yesterday lands on **yesterday** (`started_at`) | ✅ SQL case (d) (400 days), both jest date assertions, and the wire probe (`started_at 2026-08-01`). Qualified by **m11** (a named local day can bucket into the next UTC day in a UTC-behind timezone) and **m12** (a cleared field silently means today). |
| An entry dated 31 days back renders the quiet "backdated" mark | ✅ 31-yes / 29-no, on the add row, on a written row, in the ⌘K form, and on the scope rows. |
| The mobile sheet with nothing held either logs or says why | ✅ picker + `Nothing in hand` + disabled Add + inline `role="alert"` refusal; the auto-closing effect is gone; `activity` now unset (r1 M2 fixed). Marred by **m8** (state and stale alert survive). |
| A log-strip entry carries an **explicit** `billable` and prints its reason | ✅ for `billable`. The reason *sentence* is on the ⌘K form and the add row; the strip prints stored provenance, which is correct. **Marred by M2** — the provenance it prints can contradict the amount beside it. |
| Two tabs → one running row, one offer strip | ✅ at the server (SQL case (b), sequential — **m10**), at the provider (`offerFromServerStop` case), and **at the wire** (my two probes: one running row, the first returned as `stopped`). Not driven with two real browser tabs. |

---

## 4 · What I did not verify

- **Two real browser tabs** racing `start_timer`, i.e. `00608`'s retry arm (**m10**) — nothing in the repo exercises it and I did not build a second session.
- **Firefox / WebKit** — the Playwright run was `--project=chromium`.
- **Any mobile viewport for the new add row** (**m7**) — the 390 e2e case covers the scope lens, not the add row.
- **Submitting an hour end-to-end in a browser** — the e2e keeps its no-write posture; the write path is proven by jest, by the SQL suite, and by my direct PostgREST probes, not by a driven form.
- **The timezone claim in m11 under a non-UTC `TZ`** — reasoned from the code and from `TimeEntryLedgerRow.day`'s own doc comment, not reproduced by running the app under `TZ=America/Los_Angeles`.
- **Prod** — nothing pushed, deployed or run against Strata. All SQL and all HTTP ran against the isolated `patina-hours` stack (`127.0.0.1:54421` / `:54422`); the shared 54321/54322 stack was never touched, and the peer's dev server on :3000 was never killed or driven.
- **`pnpm --filter @patina/supabase test`** — not in the wave's gate list; not run.
- **Lint outside designer-portal** — per `patina-verification`, no other package's ESLint config resolves; not claimed either way.
