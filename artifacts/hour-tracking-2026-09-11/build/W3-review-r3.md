# W3 — adversarial review, round 3

**clean = false** — 0 blockers, **2 majors**, 17 minors, 11 notes.

**Reviewed** `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal log --oneline origin/hour-tracking/integration..hour-tracking/portal`
→ `8c63ff3d4`, `d7d0ce16f`, `014d81ad4`, `0dd74dde8`, `959ead009`, `21ea053e1`, **`8635eae2e`** (33 files, +3471 / −201). Full diff of every touched file read.
**Against** plan-v2 §0 + §4, `rulings.md` (HT-1…HT-41, HT-3-a…g, HT-10-a), `W3-impl.md`, `W3-review-r2.md`, `W3-fix-r2.md`.

Round 2's **two majors are genuinely fixed**, verified by reading `8635eae2e` and by the two new falsifying cases:
* **M2** — `RateReadout` (`time-capture.tsx:190-201`) now suppresses the amount on the `nonbillable` arm. `not billable · $78` cannot render. Pinned by `log-strip.test.tsx:189` ("drops the amount the moment the pill says the hour is not billable").
* **M1** — resolved as option (a), DECLARED, with the evidence (`resolve_time_rate_cents` REVOKEd from `authenticated`, 00599/W1-R7-04) recorded beside the control strip at `hours-ledger.tsx:1053-1059` and pinned by `hours-ledger-add-row.test.tsx:258` (prints the HT-12 reason, prints **no** `$` and no `rate pending`/`rate not recorded`). The substitution is now a decision, not an omission. Accepted.

**Of round 2's sixteen minors, fourteen are unaddressed and are re-reported below** — nine of them now carry live measurement I took against a running dev server rather than a reading. Two of those measurements change what the findings mean, and I rate both **major** and say so.

---

## 1 · Gates, run by the reviewer, verbatim

| Gate | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **CLEAN** — `Finished supabase db reset on branch main.` `{"target":"local","version":"","message":"Reset local database."}` |
| `scripts/run-sql-tests.sh -d …/agent-portal/supabase/tests/billing -H 127.0.0.1 -p 54422` | **total 9 · green 9 · expected-fail 0 · unexpected-fail 0 · effective-green 9/9.** `time_log_rpc_test.sql PASS (1s)` |
| `scripts/run-sql-tests.sh -d …/agent-portal/supabase/tests/rls -H 127.0.0.1 -p 54422` | **total 31 · green 29 · expected-fail 0 · unexpected-fail 2** — `design_requests_test.sql`, `studio_titles_test.sql` (`FAIL f: demoting the sole active owner should raise last_owner_protected`). **Documented separately, pre-existing, not W3's** — see N-3. W3's three RLS suites (`time_entry_admin_write_test`, `time_entry_auto_roster_test`, `time_entry_studio_stamp_test`) all PASS, as do `internal_time_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test` |
| `pnpm --dir …/agent-portal --filter @patina/supabase type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal test` | **Test Suites 578 passed / 578 · Tests 7354 passed / 7354 · Snapshots 1 · 41.2s** (base 575 / 7310). All six specs the plan names are present and green |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal lint` | **✖ 201 problems (0 errors, 201 warnings)** — all pre-existing `Unused eslint-disable directive` noise; no touched file contributes one |
| `pnpm --dir …/agent-portal --filter @patina/admin-portal build` | **green** — the repo's strictest gate, exercised after the `packages/supabase` edit |
| `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live … test:e2e -- e2e/document/hours.spec.ts` | **7 passed · 14 skipped (1.9m)** — including both W3 cases. Run against a dev server I started by hand on **:3000** from this worktree against `http://127.0.0.1:54421` with `DATA_MODE=live`; port 3000 was free and this stage owns it. Server killed; 3000 free again |
| `python3 ./scripts/generate-legacy-grants.py` (the **worktree's own** copy, §0.20) | `baseline + 2643 replayed statements`; `git status supabase/seed/00-legacy-grants.sql` **empty** → the committed seed is exactly what regeneration produces |
| `supabase gen types typescript --db-url …54422` vs the committed `database.types.ts` | **substantively in sync** — total diff 40 lines, **all** in the trailing generic helpers at 37078–37178 (`TableName extends (…)` parenthesisation, a CLI-version difference). Everything through line 37000 is byte-identical; `log_time` (`:34196`) and `start_timer` (`:36406`) are present and identical (N-6) |

**Commit hygiene** (`git show --stat` re-read on all seven): Conventional Commits throughout (`feat(time):` ×4, `test(time):` ×1, `fix(time):` ×2). **`supabase/config.toml` appears in zero commits** (`git log --name-only | grep -c` = 0). Migration + `database.types.ts` + grants seed + SQL test land in ONE commit (`8c63ff3d4`) — correct grouping. Only `apps/designer-portal/next-env.d.ts` is dirty in the worktree: generated, pre-existing, uncommitted.

**Numbering** (§0.2a, re-run after `git fetch --all --prune`, `git ls-tree` per ref): `00608` exists on `hour-tracking/portal` / `origin/hour-tracking/portal` **and nowhere else**; `00609` exists on **no ref**. No collision.

---

## 2 · Findings

### MAJOR

---

**W3-R3-M1 — the Hours add row's new Date field is entirely off-screen at 390, and W3 pushed the row 130px further out.**
*Severity: **major** (a user-visible defect on this wave's own plan-mandated control) · Confidence: **measured** on chromium, webkit and firefox against the live app*
**Location** `apps/designer-portal/src/components/document/hours-ledger.tsx:992` (`grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto]`) and `:1018-1025` (the new `type="date"` input).
*Raised as **m7** in round 1 and round 2; not addressed. I am escalating it, on measurement, and saying so.*

**Finding.** I drove `/desk?book=hours` at 390×844 with `DATA_MODE=live` and read the real bounding boxes. The grid container is **289px** wide (chromium; 298 on webkit/firefox) inside a 390px viewport, but the five tracks do not shrink — every track's `min-width` is `auto` (min-content) under `1.2fr`/`0.7fr`/`0.9fr`/`1fr`, so they lay out at their intrinsic widths and overflow:

```
chromium @390  cols "173px 146px 121px 117px 44px"   container 289px
  Project  x46..219
  Minutes  x228..374
  Date     x383..504     ← starts BEYOND the 390px viewport
  Activity x513..630     ← entirely off-screen
  Add      x639..683     ← entirely off-screen
webkit  @390  cols "164px 186px 0px 108px 44px"      Date track collapses to 0px, input 20px wide
firefox @390  cols "170.65px 169px 114.917px 114.317px 44px"
```

`document.scrollWidth === clientWidth === 390` and the ancestor's `overflow-x` is `visible` — the page does **not** scroll sideways to reach them. The Date field, HT-13's flagship control on this surface, is **unreachable on a phone**. On WebKit (i.e. Safari, the iPhone browser) its track is literally zero.

**The honest baseline, measured, not assumed.** I simulated the pre-W3 row in-page (`display:none` on the date input, `gridTemplateColumns` back to `1.2fr 0.7fr 1fr auto`): `Add` already ended at **x=553** on a 390px viewport. So the add row was **already** overflowing before this wave — the overflow is not a W3 regression in capability. What W3 did is (a) push the right edge from 553 → **683**, and (b) ship a brand-new, plan-required control at x=383..504, which no one can see.

**Why major rather than minor.** It is a control this wave was asked to deliver, it does not function at a width the wave's own e2e file already exercises (`hours.spec.ts` has a 390 case), and the fix is one responsive utility. The pre-existing overflow is context for *how* it got there, not an exemption for shipping a new invisible control on top of it. If the orchestrator rules the whole 390 add row a house-sheet-sweep item, this becomes a minor by that ruling — but it should be an explicit ruling, not an omission for the third round running.

**Exact fix.**
```tsx
// hours-ledger.tsx:992
<div className="grid grid-cols-2 items-center gap-2 min-[700px]:grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto]">
```
(the `Add` act takes `col-span-2 min-[700px]:col-span-1`), and extend `hours.spec.ts`'s existing 390 case to assert `await expect(page.getByLabel('Date')).toBeInViewport()` on the add row so it cannot silently go back.

---

**W3-R3-M2 — clearing the date field leaves `Add` / `Log it` enabled, and the hour is silently filed under today.**
*Severity: **major** (a silent wrong-day write, on the exact ruling this wave exists to honour) · Confidence: **measured live**, all three engines*
**Location** `apps/designer-portal/src/components/document/log-time-sheet.tsx:134` (`valid`), `apps/designer-portal/src/components/document/hours-ledger.tsx:417` (`addValid`), `apps/designer-portal/src/components/document/time-capture.tsx:247-252` (`startedAtFromDateValue`).
*Raised as **m12** in round 2; not addressed. Escalating on measurement.*

**Finding.** Neither validity expression requires a parseable date:

```ts
const valid = Boolean(projectId) && Number.isFinite(parsed) && parsed >= 1;   // log-time-sheet.tsx:134
const addValid = addProject && Number.isFinite(parsedAdd) && parsedAdd >= 1;  // hours-ledger.tsx:417
```

A cleared `<input type="date">` yields `''`; `startedAtFromDateValue('')` splits to `['']`, `parseInt('')` is `NaN`, and the function **returns `now.toISOString()`**. Driven live in the ⌘K form: picked a document, typed 45 minutes, cleared the date — `Log it` **remained enabled** (`logItDisabled=false` on chromium, webkit and firefox). Submitting writes the hour to today, with an empty date field on screen and nothing said.

This is the same defect class the wave was written to close. `0dd74dde8`'s own commit body: *"It sent no `started_at` at all, so paging back a week and typing an hour silently mis-dated it into TODAY."* The paging case is fixed; an identical silent mis-date is one backspace away, and HT-13's whole content is that the date is hers.

**Exact fix.** One predicate in each of the two expressions (the phone has no date field, so two places, not three):
```ts
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const valid = Boolean(projectId) && ISO_DAY.test(date) && Number.isFinite(parsed) && parsed >= 1;
const addValid = addProject && ISO_DAY.test(addDate) && Number.isFinite(parsedAdd) && parsedAdd >= 1;
```
`Log it` / `Add` then simply stand disabled while the field is empty — no new copy, no new control. Add a case to `hours-ledger-add-row.test.tsx` and `command-bar-log-time.test.tsx`: clear the date, assert the act is disabled and `mockCreate` was never called.

---

### MINOR

**W3-R3-m1 — the chain-out strip for another tab's row says "that document".**
*minor · confirmed · **carried from r1(m1)/r2(m1), unfixed*** — `document-time-provider.tsx:385` sets `projectName: 'that document'` in `offerFromServerStop`; `log-strip.tsx` prints `offer.projectName` as the headline `<strong>`. A member with two tabs open reads *"that document · 12m in hand"*. The row carries `project_id`, and `useTimeCaptureProjects` already fills a name-bearing cache under `['document-hours-projects']`.
**Fix:** in `offerFromServerStop`, `qc.getQueryData(['document-hours-projects'])?.find(p => p.id === row.project_id)?.name ?? 'that document'`.

**W3-R3-m2 — the server-side stop applies no R64 bound and emits no `time_timer_stopped`.**
*minor · confirmed · **carried from r1(m2)/r2(m2), unfixed*** — `00608:182-189` computes `duration_minutes` from raw wall clock (`GREATEST(1, ROUND(EXTRACT(EPOCH FROM (now() - started_at))/60))`) with none of `closeOut()`'s protections (`RUNAWAY_IDLE_SECONDS`, the sub-60s `timer_auto` discard, the idle annotation), and `offerFromServerStop` proposes that number verbatim with `idleSeconds: 0`. HT-17's instrument never fires for that hour. Narrow — only a row this session never watched reaches it — but an overnight tab then proposes its full wall-clock hours.
**Fix:** either record the exposure in the `00608` banner and accept it, or bound `suggestedMinutes` in `offerFromServerStop` the way `closeOut` does and fire `documentEvents.time.timerStopped({ surface:'document', duration_minutes, adjusted:true, idle_minutes:null, idle_ratio:null })` (~6 lines).

**W3-R3-m3 — `start_timer` can dead-end on a raw `unique_violation` with nothing left to report it.**
*minor · high · **carried from r1(m3)/r2(m3), unfixed*** — `00608:182-188`'s stop `UPDATE … WHERE user_id = v_user AND duration_minutes IS NULL` runs under the caller's RLS. Measured in round 2 against `pg_policies`: `Designers manage their project time entries` and `time_entries_studio_update_own` save most cases, so the stuck clock needs a member who is not the project's designer, not a studio co-member of that designer, and whose roster seat was removed while her timer ran — HT-25's own "removable by the owner" path for an outside roster vendor. Then the UPDATE matches zero rows silently, the INSERT trips the partial index twice, attempt 2 `RAISE`s a bare `unique_violation`, and `hold`/`resume`'s `.catch(() => null)` swallows it. Auto-start dies with no message, permanently.
**Fix:** a third arm after the loop — if a `duration_minutes IS NULL` row still exists for `v_user`, `RAISE EXCEPTION 'start_timer: a timer is running on a document you can no longer write to (%), ask an owner to close it', v_blocked_project USING ERRCODE='55006'` — plus a case in `time_log_rpc_test.sql`.

**W3-R3-m4 — the HT-25 seating sentence lies to a member who holds only a non-priceable seat.**
*minor · confirmed · **carried from r1(m5)/r2(m4), unfixed*** — `log-time-sheet.tsx:88` `willBeSeated = Boolean(projectId) && myRoles?.length === 0`, and `useMyRateRoles` (`use-time-tracking.ts:1100-1118`) filters through `RATE_ROLES = ['lead_designer','support_designer','bookkeeper','vendor']`. A member seated as `client` or `previous_lead` returns `[]` and is told *"You are not on this roster — logging here seats you as a support designer."* She is on the roster.
**Fix:** return `{ priceable, seated }` from `useMyRateRoles` (or add a small sibling selector) and word the sentence off `seated`, not `priceable`.

**W3-R3-m5 — the Log time dialog has no focus trap and no focus restore. (Now measured, not reasoned.)**
*minor · **measured live** · **carried from r1(m6)/r2(m5), unfixed***
`log-time-sheet.tsx:177-190` declares `role="dialog" aria-modal="true"` and focuses the first field, but nothing wraps focus and nothing restores it. Driven: focus Minutes, press Tab twelve times → `focusStillInDialogAfter12Tabs=false` on **chromium and webkit** (firefox happened to stay in). Press Escape → `document.activeElement` is `BODY` (webkit, firefox) or an unrelated `BUTTON` (chromium) — never the trigger. A keyboard user tabs out into the page behind the modal, and on close lands nowhere she asked to be. Every other document overlay reaches this through `DocSheet`/`active-dialog`. (The rest of the dialog's a11y is sound: every control labelled, minutes is a `spinbutton`, the failure is `role="alert"`, every act ≥44px through `DocumentAction`.)
**Fix:** mount through the existing overlay primitive, or add a minimal Tab/Shift+Tab loop over `layer.querySelectorAll(FOCUSABLE)` plus `previouslyFocused.current?.focus()` in the close path.

**W3-R3-m6 — the new date input carries an inline font size and is below the 44px act floor (house sheet §A). (Measured.)**
*minor · **measured live** · **carried from r1(m7)/r2(m6), unfixed***
`hours-ledger.tsx:1022`: `className="rounded-[4px] … px-2 py-1.5 text-[11px] …"`. Two §A breaches in one new element. Measured rendered box: **34px tall on chromium, 36 webkit, 32 firefox**, computed `font-size: 11px` at every width — against §A's ≥44px for acts and its ban on inline font-size utilities. It copies its three siblings verbatim, which is the defensible part; it is still a **new** control carrying them forward. Every other W3 file is clean: `log-time-sheet.tsx`, `time-capture.tsx` and `log-time-shortcut.tsx` contain **zero** inline font-size utilities (`t-d3`/`t-body-sm`/`t-head` throughout) and every control is `min-h-11`.
**Fix:** move the add row onto the type scale + `min-h-11` in one pass (naturally paired with M1's responsive fix), or record the exemption explicitly in the wave report so the house-sheet sweep knows it is deliberate and scoped to that row.

**W3-R3-m7 — the mobile sheet keeps its state after a successful add, and re-shows a stale refusal.**
*minor · confirmed · **carried from r1(m9)/r2(m8), unfixed*** — `mobile-sheets.tsx:1318-1320` clears `minutes` and closes the form only. `pickedProject`, `activity`, `billable`, `rateRole` and `note` persist, so reopening proposes the previous document and role with an empty minutes field — and if the last attempt was refused, the old `role="alert"` text is on screen again before anything has been tried.
**Fix:** clear all five in the success path, and `setNote(null)` when `formOpen` flips on.

**W3-R3-m8 — a weak negative assertion.**
*minor · confirmed · **carried from r1(m12)/r2(m9), unfixed*** — `command-bar-log-time.test.tsx:198-204`:
```ts
expect(sent).not.toEqual(expect.objectContaining({
  hourlyRateCents: expect.anything(), ratedAmountCents: expect.anything(), rateSource: expect.anything(),
}));
```
`objectContaining` requires **all three** to match, so the negation passes as soon as **one** is absent — a regression reintroducing `hourlyRateCents` alone goes green. (The sibling exact `Object.keys(args).sort()` assertion in `use-time-tracking-authority.test.tsx` is the strong form and does hold.)
**Fix:** `expect(Object.keys(sent)).toEqual(expect.not.arrayContaining(['hourlyRateCents','ratedAmountCents','rateSource','billingState']))`.

**W3-R3-m9 — SQL case (b) is sequential, not concurrent; `start_timer`'s retry arm has no coverage.**
*minor · confirmed, honestly documented in the file's own header (`time_log_rpc_test.sql:18-22`) · **carried from r1(m13)/r2(m10), unfixed*** — the plan's test row asks for "two **concurrent** `start_timer` calls". The retry loop's second arm (`00608:208-212`, a genuine `unique_violation` raised by another session in the gap) is executed by no test in the repo, and it is the one piece of `00608` with no coverage.
**Fix:** accept and say so in the wave report, or drive a second session via `dblink` inside the test.

**W3-R3-m10 — a named calendar day can land in the next UTC day, and the member's own week and the studio rollup then disagree.**
*minor · confirmed by reading · **carried from r2(m11), unfixed***
`time-capture.tsx:242-252` `startedAtFromDateValue` keeps **the current clock time** and sets Y/M/D in **local** time. `TimeEntryLedgerRow.day` is documented as a **UTC bucket** ("UTC buckets, matching the resolver's own date basis", `use-time-tracking.ts:789-790`), while the Hours sheet's week groups through `fmtDay(started_at)` — local. A designer at UTC−7 logging at 17:00 local for "yesterday" stores `yesterday 17:00 −07:00` = **today 00:00 UTC**: her Hours week shows the day she named; the studio rollup and the scope lens bucket it a day later. This is the first surface where a member **names a calendar day**, so the mismatch is newly visible even though the arithmetic is old.
**Fix (smallest honest one):** `at.setHours(12,0,0,0)` after `setFullYear`, so no realistic offset crosses a UTC boundary — or take the ruling (see N-8): does a named day mean the member's local day or a UTC day?

**W3-R3-m11 — `rateRole` is not cleared when the document changes, so a role held on the previous document is sent to the new one.**
*minor · confirmed · **carried from r2(m13), unfixed*** — `log-time-sheet.tsx:109-119` resets `rateRole` (`:114`) only on **open**; `hours-ledger.tsx` never resets `addRateRole`; `mobile-sheets.tsx` never resets `rateRole`. A multi-role member who picks "bookkeeper" on one house, then switches the picker to another, sends `p_rate_role='bookkeeper'` for a project where she holds no such seat — and W1's `00601` raises. The refusal is honest; it is a refusal the form could have avoided.
**Fix:** `useEffect(() => setRateRole(null), [projectId])` in all three (and the `addProject`/`targetProjectId` equivalents), where `seededFor` already turns over.

**W3-R3-m12 — the bare `t` is inert unless focus is on `<body>`, but "The keys" says "Anywhere you are not typing."**
*minor · confirmed · **carried from r2(m14), unfixed*** — `registry-shortcuts.tsx:60-64` `anOverlayIsOpen()` returns **true** whenever `document.activeElement` is anything other than `<body>` or null, so after clicking any button, link or card, `t` does nothing and nothing says why. The e2e case has to `page.locator('body').click()` first, which is the tell. The `?` doorway wears the same guard and its copy admits the second half: *"Anywhere you are not typing, **and nothing is open in front.**"* The new T row (`keys-reference.ts:89-96`) prints only *"Anywhere you are not typing. Opens the form, nothing in hand."*
**Fix:** copy-only — `where: 'Anywhere you are not typing, and nothing is open in front.'`, matching its sibling and the actual guard.

**W3-R3-m13 — three statements of the same fact on every ledger entry row.**
*minor · confirmed · design · **carried from r2(m15), unfixed*** — `EntryRow` now prints, for one non-billable hour: `"… · not billable"` in the meta line (`timeRateProvenance`, `hours-ledger.tsx:1698-1706`), the new `BillablePill` reading **"Non-billable"** (`:1715-1721`), and the pre-existing state chip reading **"Non-bill"** (`timeBillingStateLabel`). The pill is plan-mandated ("billable pill … on the entry rows"), so this is a consequence of the plan rather than a deviation — but a week of rows now says one thing three times, and the row grew a third line.
**Fix:** drop the `nonbillable` arm from the meta line (the pill and the chip both carry it), or fold the chip and the pill into one control. Worth an orchestrator call, not a silent edit.

**W3-R3-m14 — `RateRoleMark` issues two sequential reads per distinct project on a sheet that renders a week of rows.**
*minor · confirmed · performance, low · **carried from r2(m16), unfixed*** — `RateRoleMark` (`time-capture.tsx:147-165`) calls `useMyRateRoles(projectId)` and is rendered per `EntryRow`; `useMyRateRoles` reads `projects` **then** `project_team_members`, sequentially. React Query dedupes per `['time','my-rate-roles', projectId]`, so it is 2 round trips per distinct project — but a member with a week across eight houses opens the Hours sheet with sixteen extra sequential requests, to decide whether to print a word that is usually absent.
**Fix:** resolve the viewer's seats for the whole visible set in one read (`.in('project_id', ids)`) behind a `useMyRateRolesFor(projectIds)`, or gate `RateRoleMark` on `rate_role !== null` before the hook can matter.

**W3-R3-m15 — NEW: `useBillableIntent` cannot tell "the authority read failed" from "there is no agreement", and prints the second as a fact.**
*minor · confirmed by reading · medium consequence*
`time-capture.tsx:41-57` derives `isSettled` as `Boolean(projectId) && !authority.isLoading` and never consults `authority.isError`. `useProjectBillingAuthority` (`use-commercial-documents.ts:905-911`) is a plain `useQuery` with no fallback. On a failed read (RLS denial, 500, exhausted retries) `data` is `undefined`, `isLoading` goes false, so the form treats the answer as **settled**, `automaticTimeBillingIntent(undefined)` returns `{billable:false, reason:'no_authority'}`, and all three capture surfaces print **`non-billable · no agreement`** beside a pill seeded to non-billable — a definite claim about a document whose agreement the browser never learned. The fail-closed *value* is the right posture and pre-existing (the auto-timer does the same); what is new in W3 is the **sentence**, on the surface `time-capture.tsx`'s own file doc says exists to stop "three facts wearing one face".
**Fix:** thread the error through — `isSettled: Boolean(projectId) && !authority.isLoading && !authority.isError` — and either print nothing or `billable not known — the agreement could not be read` when `isError`. The pill still seeds non-billable; it just stops naming a reason it does not have.

**W3-R3-m16 — NEW: `mintEntryId()` runs inside `mutationFn`, so the hook's own retry mints a fresh id — the documented replay-safety does not hold for it.**
*minor · confirmed by reading, exposure measured as currently closed · low consequence today*
`use-time-tracking.ts:456-459`: `p_entry_id: input.entryId ?? mintEntryId()`, evaluated **inside** `mutationFn`. The comment above it claims *"The id is minted here so a retried call re-reads the hour it already wrote instead of writing a second one."* That is only true for a caller that supplies `entryId` (W6's drain). The designer portal's QueryClient does configure a mutation retry — `apps/designer-portal/src/lib/react-query.ts:197-204`, one retry when `isNetworkError(error)` — and a TanStack retry re-invokes `mutationFn` with the same `variables`, so a fresh uuid is minted and `ON CONFLICT (id)` cannot recognise the replay: a request that committed but lost its response would write a **second billable hour**.
**Measured: the path is closed today, by accident.** `isNetworkError` (`error-handler.ts:120-129`) requires `error instanceof Error`, and postgrest-js 2.98.0 returns a **plain object literal** on a fetch rejection (`{ message: 'FetchError: …', details, hint, code }`, read in `node_modules/.pnpm/@supabase+postgrest-js@2.98.0/.../dist/index.mjs`), which the hook rethrows as-is. So `isNetworkError` is false and the retry never fires. That is one `instanceof` away from being a duplicate-hour bug.
**Fix:** mint the id in the caller-facing layer, not the mutation body — e.g. `mutationFn` takes `input.entryId ?? (input.entryId = mintEntryId())`, or the three call sites mint a `useRef`'d id per form session. Failing that, amend the comment to say the guarantee holds only for a caller-supplied `entryId`.

**W3-R3-m17 — NEW: in `hold`, a server-stopped row's strip can silently replace the strip `closeOut` just raised.**
*minor · confirmed by reading · low consequence*
`document-time-provider.tsx:408-425`: `hold` calls `closeOut(timer, { offerStrip: true })` (which `setOffer(...)` for the hour it just closed), then `start_timer`, then — if `taken.stopped` is a *different* row — `offerFromServerStop(taken.stopped)`, which `setOffer(...)` again. `offer` is a single slot, so the first strip disappears without ever having been seen. No hour is lost (both rows are written, R20/§0.22 holds) but one of the two is never offered for adjustment. `resume` (`:490-500`) has the same shape without the `!== timer?.id` guard, though its `if (timer) return;` precondition makes the collision unreachable there.
**Fix:** queue rather than replace — keep the existing offer and stash the second (the strip already has a "resurfaces the saved offer" mechanism, `log-strip.test.tsx:134`) — or state in the comment that the later stop wins and why.

---

### NOTES

**N-1 — HT-35 (disclosure + opt-out) absent.** Correct: the orchestrator scoped it to stage 4 (lane B, with W7), and `document-events.ts` is lane B's this phase. No action.

**N-2 — W4's portal follow-commits absent.** Correct per the orchestrator's scope ruling. `log_time` accepts `p_project_id NULL` and `p_studio_id`, so the door is open; the hook does not yet pass `p_studio_id`. `use-time-tracking-authority.test.tsx`'s `Object.keys(args).sort()` assertion pins an **eleven**-key argument list that W4 must edit when `p_studio_id` gets a caller — a one-line comment beside it now would stop that reading as a regression then. (r1's m10 / r2's N-2, unchanged and still correct to leave.)

**N-3 — two RLS suites are red and `supabase/tests/rls/` still has no `KNOWN_FAILURES.md`. Ruling owed.** Reproduced independently after my own clean reset: `design_requests_test.sql` and `studio_titles_test.sql (FAIL f)`. Not W3's — W3's entire DB delta is two new functions plus four GRANT/REVOKEs, the regenerated seed diff is exactly those four, and neither file mentions `project_time_entries`/`log_time`/`start_timer`. The runner reports them as *unexpected* for every lane, so every remaining wave's RLS gate reads red for reasons unrelated to it. Third round reported; nothing has happened to it.

**N-4 — all three document pickers filter to `status === 'active'`. Ruling owed if Kody disagrees.** `log-time-sheet.tsx:218`, `mobile-sheets.tsx:1236`, and the pre-existing `hours-ledger.tsx:998`. Deliberate and tested, and it matches the shipped ledger. It does brush HT-13: an hour remembered a month late on a document closed in the meantime has no door. `useTimeCaptureProjects`'s own doc says "every project the caller can read"; every consumer narrows it.

**N-5 — forward-dating is unbounded and unmarked. Ruling owed.** HT-13 says "any date", and `log_time` accepts a future `p_started_at` with no complaint. `isBackdatedEntry` only marks the past (`created_at - started_at > 30 days`), so an hour dated next month prints nothing, is `authorized`, and is claimable by the invoice composer. Probably not what "any date" meant; a word from Kody, not a code change from the lane.

**N-6 — the `database.types.ts` diff, stated precisely.** 40 lines of diff, **all** at 37078–37178 inside the trailing generic helpers (`TableName extends (DefaultSchemaTableNameOrOptions extends {…} : never) = never` vs the unparenthesised form) — a CLI-version formatting difference on my side. Everything through line 37000 is byte-identical. No table, function or enum type differs. Not a W3 defect. *(Incidental, carried from r2: `pnpm db:generate` with a shell-exported `SUPABASE_DB_URL` truncates `database.types.ts` to zero inside this worktree before failing. I used `supabase gen types … > /tmp/…` and diffed, leaving the tree untouched. Worth knowing before a later lane runs that command casually.)*

**N-7 — e2e isolation, and the port-3000 false-green hazard for W4–W7.** Port 3000 was **free** this round and this stage owns it, so I started `next dev --webpack -p 3000` from this worktree against `:54421` with `DATA_MODE=live`, ran Playwright (which adopted it via `reuseExistingServer`), and killed it afterwards — 3000 is free. The hazard from round 2 stands for later lanes: `playwright.config.ts`'s `webServer` hard-codes `NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321'` (the peer program's stack) and sets `reuseExistingServer: !process.env.CI` on `http://localhost:3000`, so a lane that runs `test:e2e` while a peer's server holds 3000 **silently drives the peer's build against the peer's stack, and passes**. Pin the port or assert the served build before trusting a green e2e.

**N-8 — the ruling sweep, re-verified independently this round.**
· **HT-26** — no surface renders a blank where a rate is pending: `timeRateProvenance` returns `rate pending` for `rate_source='none'` and `rate not recorded` otherwise, and `RateReadout` always prints the label. M2's contradiction is gone. The ⌘K form, the add row and the phone carry **no rate cell at all** rather than an empty one — consistent with the r2-M1 declaration, though only the add row records that decision in code (a one-line comment in the other two would close it).
· **HT-36** — `notes` appears in the added lines only as `p_notes` in the generated types and as a pass-through in the hook. **No W3 surface reads or writes it**, no rollup is touched, `log_time`'s `p_notes` has no caller.
· **HT-11** — `CreateTimeEntryInput.billable` and `StartTimerInput.billable` are both **required**; the `?? true` at `:320` is deleted; both RPCs raise on NULL (SQL case (c), both doors); all four capture surfaces carry the pill. I enumerated every caller: `useCreateTimeEntry` has exactly **three** call sites (`hours-ledger.tsx:426`, `log-time-sheet.tsx:145`, `document-time-provider.tsx:522`), all W3 surfaces, all seeded from the resolved intent — no orphan caller was silently flipped to `false`.
· **HT-41** — `RateRoleChip` returns `null` below two priceable roles; `RateRoleMark` is the read-only twin where the row already exists, which is right given `00600` freezes `rate_role` after INSERT. The plan's "role chip on the log strip and the entry rows" is delivered as a mark, declared in `time-capture.tsx:139-146` with its reason.
· **HT-24** — all four surfaces open on `''` with an `activity not set` option and send `null`; the `'design'` default is gone from `log-strip.tsx`, the add row and the phone.
· **HT-13** — the add-row date follows the paged week (`weekStart` is `useMemo`'d on `weekOffset`, so the effect cannot clobber a typed date — verified), the mark is derived at 30 days and asserted 31-yes / 29-no on the add row, on a written row, on the scope rows and in the ⌘K form, and `guard_invoiced_time_entry` still refuses to re-date a billed hour (SQL case (d)). Qualified by **M2**, **m10** and **N-5**.
· **HT-14** — the phone asks, disables `Add entry` until told, and clears only after the server answers; the old auto-closing effect is gone. Qualified by **m7**.
· **HT-25** — the ⌘K and phone pickers list every readable active project, rostered or not, and the form says so before she logs. Qualified by **m4**.
· **R69** — no `setInterval`, no ticking clock added; the backdated word, the role mark and the pill are static text.
· **§0.22** — the strip's `Log` with nothing touched still writes (seeded pill, seeded minutes, `activity ''→null`), pinned by `log-strip.test.tsx:234`; no new required field on the stop payload.
· **§0.12** — the invoiced lock is untouched; `00608` redefines nothing and touches no trigger.
· **No flag anywhere** (`useFeatureFlag` across the 19 touched source files: **0**). **No dashboard, tab, badge, red/green** — the only `badge` hits in added lines are the two comments saying "never a badge".

**N-9 — data access, the mock fallback, transitions.** Both new reads (`useTimeCaptureProjects`, `useMyRateRoles`) live in `packages/supabase`, are exported from `hooks/index.ts` and the package index, and no new component constructs a client or calls PostgREST directly (`createBrowserClient|getSupabase|.from(` in `log-time-sheet.tsx`, `time-capture.tsx`, `log-time-shortcut.tsx`, `log-strip.tsx`: **0**). `useTimeCaptureProjects` reuses the Hours sheet's canonical `['document-hours-projects']` key with a **byte-identical** `select('id, name, status').order('name')` — re-verified against `hours-ledger.tsx:245-255` this round — so the shared cache cannot serve a shape either reader does not expect. `withMockData` wraps **no** W3 path (0 hits across the touched components), so `DATA_MODE=live` had nothing to unmask; I ran both the e2e and my own probes in `live` anyway. **No bare `<a>`** in any added line.

**N-10 — `00609` correctly unused; `00608` is sound at the object level.** `RETURNS public.project_time_entries` / `RETURNS TABLE(started, stopped)`, `SECURITY INVOKER` both, `SET search_path = public, pg_temp` both, `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` both, and a postcondition block probing `prosecdef`, the `ON CONFLICT` text, both billable raises and both roles' `has_function_privilege`. Two curiosities worth naming and not fixing: (a) `log_time`'s INSERT names `studio_id`, a column added by **00610** — a later file; harmless (plpgsql bodies are not name-resolved at `CREATE` time, and P-3 ships the whole range at once), but a lane that ever pushes a partial range would find out the hard way; (b) a replayed `log_time` still fires `aaa0_time_entry_auto_roster_trg` (BEFORE INSERT runs even when `ON CONFLICT DO NOTHING` skips the row), and `00597` is idempotent on the live-seat check, so nothing is written twice.

**N-11 — `LogTimeOverlay` is correctly nested inside `DocumentTimeProvider`** (`(document)/layout.tsx:76,99-102`), so `useDocumentTime()` resolves; and the bare `t` is guarded against the `g t` chord in both directions (`chordIsArmed()` from module scope **and** `e.defaultPrevented`), pinned by `log-time-shortcut.test.tsx:42` and `:56`. The chord flag's move from a component `useRef` to module scope is the right shape for a second bare-key binding and changes no existing behaviour.

---

## 3 · Done-when, re-checked by the reviewer

| Plan §4 done-when | Verdict |
|---|---|
| 45-minute call in **5 interactions** from ⌘K with no document open, `SELECT` shows `source='command_bar'` | **✅** ⌘K → Log time → Document → Minutes → Enter = 5 (date defaults to today, activity optional); 4 with a document in hand. `source='command_bar'` pinned at the RPC boundary (`command-bar-log-time.test.tsx:166`), stored and read back in SQL case (a), and confirmed at the wire in round 2. Still not driven end-to-end in a browser — the e2e deliberately stops short of submitting, a declared posture. |
| The same entry dated yesterday lands on **yesterday** (`started_at`) | **✅** SQL case (d) (400 days back), both jest date assertions. **Qualified by M2** (a cleared field silently means today) and **m10** (a named local day can bucket into the next UTC day). |
| An entry dated 31 days back renders the quiet "backdated" mark | **✅** 31-yes / 29-no, on the add row, on a written row, on the scope rows and in the ⌘K form. |
| The mobile sheet with nothing held either logs or says why | **✅** picker + `Nothing in hand` + disabled Add + inline `role="alert"` refusal; the auto-closing effect is gone. Marred by **m7**. |
| A log-strip entry carries an **explicit** `billable` and prints its reason | **✅** for `billable` (seeded from the stored row, never `true`). The reason *sentence* is on the ⌘K form and the add row; the strip prints stored provenance, which is correct — and since `8635eae2e` it can no longer contradict the amount beside it. |
| Two tabs → one running row, one offer strip | **✅** at the server (SQL case (b), sequential — **m9**) and at the provider (`offerFromServerStop`). Not driven with two real browser tabs. Qualified by **m17**. |
| *(plan's hours-ledger row)* rate readout on the add row | **Declared absent, accepted.** See r2-M1 / `W3-fix-r2.md` — the resolved rate is not client-knowable (`resolve_time_rate_cents` REVOKEd from `authenticated`), the decision is recorded in code and pinned by a test. |

---

## 4 · What I did not verify

- **Two real browser tabs** racing `start_timer`, i.e. `00608`'s retry arm (**m9**) — nothing in the repo exercises it and I did not build a second session.
- **Submitting an hour end-to-end in a browser** — the e2e keeps its no-write posture; the write path is proven by jest, by the SQL suite, and by round 2's direct PostgREST probes. I did **not** repeat the wire probes this round.
- **The timezone claim in m10 under a non-UTC `TZ`** — reasoned from the code and from `TimeEntryLedgerRow.day`'s own doc comment, not reproduced by running the app under `TZ=America/Los_Angeles`.
- **The m16 duplicate-hour path under a real dropped connection** — I read the retry predicate, `isNetworkError`, and postgrest-js's fetch-rejection shape, and concluded the path is closed; I did not induce a network failure to confirm it.
- **Firefox / WebKit for the hours e2e** — the run was chromium (the other 14 are skipped by the file's single-actor pin). My own geometry/focus probes **did** run on all three engines.
- **`pnpm --filter @patina/supabase test`** — not in the wave's gate list; not run.
- **Lint outside designer-portal** — per `patina-verification`, no other package's ESLint config resolves; not claimed either way.
- **Prod** — nothing pushed, deployed or run against Strata. All SQL and all HTTP ran against the isolated `patina-hours` stack (`127.0.0.1:54421` / `:54422`); the shared 54321/54322 stack was never touched.
