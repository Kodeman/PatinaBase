# W3 — adversarial review, round 4

**clean = false** — 0 blockers, **1 major (NEW)**, 19 minors, 12 notes.

**Reviewed** `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal log --oneline origin/hour-tracking/integration..hour-tracking/portal`
→ `8c63ff3d4`, `d7d0ce16f`, `014d81ad4`, `0dd74dde8`, `959ead009`, `21ea053e1`, `8635eae2e`, **`26b34125d`** (33 files, +3585 / −206). Full diff of every touched file read.
**Against** plan-v2 §0 + §4, `rulings.md` (HT-1…HT-41, HT-3-a…g, HT-10-a), `W3-impl.md`, `W3-review-r3.md`, `W3-fix-r3.md`.

**Round 3's two majors are genuinely fixed, and I re-measured both myself against a live dev server rather than reading the fix report.**

* **W3-R3-M1 (the add row off-screen at 390)** — fixed and measured by me on chromium at 390 and 1440, and at 700 / 768 / 900 / 1024:
  ```
  ADDROW @390   Project x=46.0..186.0 h=49.5 fs=12px   Minutes x=195.0..335.0
                Date    x=46.0..186.0 h=49.5 fs=12px   Activity x=195.0..335.0
                Add     x=46.0..335.0 h=44.0           BillablePill x=46.0..158.8 h=44.0
                h-overflow = 0
  ADDROW @1440  Project 381.5..567.2 · Minutes 576.2..684.5 · Date 693.5..832.8
                Activity 841.8..996.5 · Add 1005.5..1049.5   — the plan's five tracks
  ```
  Every field begins at x ≥ 0 and ends inside the viewport at both widths; the page does not scroll sideways. **W3-R3-m6 went with it**: the four fields now measure `font-size: 12px` (`t-meta`, a real house-sheet step) and 49.5px tall, against 11px / 32–36px before.
* **W3-R3-M2 (a cleared date silently means today)** — fixed and measured live: with a document picked and 45 minutes typed, clearing the Date field leaves `Log it` **disabled** (`logIt disabled with empty date = true` at both 390 and 1440), and the same predicate guards the ledger's `Add`. Two falsifying jest cases pin it.

**The 16 minors and 11 notes round 3 carried are all still open** — `26b34125d` touched five files and took only M1, M2 and m6, as its own §6 says. They are re-listed below unchanged so the orchestrator can see the standing set, and **two new minors** and **one new major** are added from this round's own measurement.

---

## 1 · Gates, run by the reviewer, verbatim

| Gate | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **CLEAN** — `Finished supabase db reset on branch main.` `{"target":"local","version":"","message":"Reset local database."}` (exit 0) |
| `scripts/run-sql-tests.sh -d …/agent-portal/supabase/tests/billing -H 127.0.0.1 -p 54422` | **total 9 · green 9 · expected-fail 0 · unexpected-fail 0 · effective-green 9/9.** `time_log_rpc_test.sql PASS (1s)` |
| `scripts/run-sql-tests.sh -d …/agent-portal/supabase/tests/rls -H 127.0.0.1 -p 54422` | **total 31 · green 29 · expected-fail 0 · unexpected-fail 2** — `design_requests_test.sql`, `studio_titles_test.sql` (`FAIL f: demoting the sole active owner should raise last_owner_protected`). **Documented separately — pre-existing, not W3's** (N-3). W3's own three RLS suites (`time_entry_admin_write_test`, `time_entry_auto_roster_test`, `time_entry_studio_stamp_test`) PASS, as do `internal_time_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test` |
| `pnpm --dir … --filter @patina/supabase type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir … --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir … --filter @patina/designer-portal test` | **Test Suites 578 passed / 578 · Tests 7356 passed / 7356 · Snapshots 1 · 27.7s** (r3 baseline 578 / 7354 — `26b34125d`'s two new cases). All six specs plan-v2 §4 names are present and green |
| `pnpm --dir … --filter @patina/designer-portal lint` | **✖ 201 problems (0 errors, 201 warnings)** — byte-for-byte the r3 baseline; all `Unused eslint-disable directive`, none from a touched file |
| `pnpm --dir … --filter @patina/admin-portal build` | **green** (exit 0) — the repo's strictest gate, exercised after the `packages/supabase` edit |
| `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live … test:e2e -- e2e/document/hours.spec.ts` | **7 passed · 14 skipped (1.7m)** — including both W3 cases and all three width cases now carrying the add-row assertions |
| `python3 ./scripts/generate-legacy-grants.py` (the **worktree's own** copy, §0.20) | `baseline + 2643 replayed statements`; `git status supabase/seed/00-legacy-grants.sql` **empty** → the committed seed is exactly what regeneration produces. `grep -lE '^\s*(GRANT\|REVOKE)' supabase/migrations/006*.sql` lists `00608` among the thirteen, as it must |
| `supabase gen types typescript --db-url …54422` vs the committed `database.types.ts` | **substantively in sync** — both 37 322 lines; total diff **40 lines, all** at 37 078–37 178 in the trailing generic helpers (`TableName extends (… ) = never` parenthesisation, a CLI-version difference). Everything through line 37 000 is byte-identical (N-6) |

**Extra evidence this round: the write path driven end to end in a browser.** The e2e keeps its declared no-write posture, so I drove the ⌘K door myself in a throwaway spec (since deleted) against the isolated stack — ⌘K's bare `t`, pick a document, 45 minutes, date = yesterday, `Log it` — and then read the row:

```
id        0e070082-… | project b0000000-…d1 | started_at 2026-09-12 16:13:37+00
duration  45 | billable f | source command_bar | activity NULL
rate_source none | hourly_rate_cents NULL | rated_amount_cents 0
rate_role lead_designer | billing_state nonbillable | created_at 2026-09-13 16:13:37+00
```

The 5-interaction done-when, `source='command_bar'`, the yesterday `started_at`, the explicit `billable`, HT-24's NULL activity and HT-26's `rate_source='none'` ("rate pending") are all now **driven**, not inferred. The probe row was deleted afterwards (`DELETE 1`); the stack is as the reset left it.

**Commit hygiene** (`git show --stat` re-read on all eight): Conventional Commits throughout (`feat(time):` ×4, `test(time):` ×1, `fix(time):` ×3). **`supabase/config.toml` appears in zero commits** (`git log --name-only | grep -c` = 0). Migration + `database.types.ts` + grants seed + SQL test land in ONE commit (`8c63ff3d4`). Only `apps/designer-portal/next-env.d.ts` is dirty in the worktree: generated, pre-existing, uncommitted.

**Numbering** (§0.2a): `00608` exists on `hour-tracking/portal` / `origin/hour-tracking/portal` and nowhere else; `00609` exists on no ref.

---

## 2 · Findings

### MAJOR

---

**W3-R4-M1 — NEW. The billable pill is live before the resolved answer is, so the act can outrun it AND a member's explicit tap is silently reverted when the read lands.**
*Severity: **major** (a money-bearing, user-visible defect on this wave's own ruling — HT-11 exists so `billable` is **stated**, not guessed) · Confidence: **measured live**, chromium, three surfaces share the shape*
**Location** `apps/designer-portal/src/components/document/log-time-sheet.tsx:91-99` + `:134-141`; `apps/designer-portal/src/components/document/hours-ledger.tsx:415-422` + `:427-432`; `apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:1163-1170` + `:1157-1159`; the `isSettled` definition at `time-capture.tsx:41-57`.

**Finding.** All three capture surfaces seed the pill from the resolved answer in an effect gated on `intent.isSettled`, but **nothing gates the act on it**. `valid` / `addValid` / the phone's `valid` require a project, a parseable date and minutes — never a settled authority. Measured, with the authority read delayed by a route handler so the window is observable rather than assumed:

```
minutes already typed, then a document picked — read immediately:
  Log it enabled          = true
  pill                    = "Non-billable"
  reason printed beside it= false      ← intent.isSettled is still false
```

So an hour submitted in that window is written `billable = false` whatever the document's agreement says, with a pill that reads like a settled answer because `reason` is suppressed while unsettled (`reason={intent.isSettled ? intent.sentence : null}`). Fail-closed is the right *value*; offering the act before the value exists is not.

**The second, worse half — the member's own tap is thrown away.** The seed effect's guard is `seededFor.current === projectId`, and `seededFor.current` is only written **when the read settles**. A tap during the pending window therefore does not protect anything, and the late seed overwrites it:

```
before                                   = "Non-billable"
after tap                                = "Billable"
after the authority read settles         = "Non-billable"   ← her statement is gone
```

`log-time-sheet.tsx:88-91` states the opposite contract in its own comment — *"a hand that has already touched the pill for that document keeps its own answer"* — and that is false for the whole pending window. HT-11's content is that the member says; here the browser overrules her a second later, with no motion, no message, and the form still open in front of her.

**Why major, not minor.** It decides whether an hour is billed. It contradicts HT-11 and the code's own stated contract. It is reachable in the plan's flagship flow (type minutes → pick document → Enter), on all three surfaces this wave built, and in the same window a slow or contended authority read makes wide. It is not a pre-existing behaviour carried forward: both the pill and the seeding effect are W3's.

**Exact fix (small, and the same shape as the M2 fix already applied).**
```ts
// 1 · the act waits for the answer it is about to write
const valid = Boolean(projectId) && intent.isSettled && isDayValue(date) && Number.isFinite(parsed) && parsed >= 1;
// 2 · a tap claims the seed slot, so the late answer cannot overwrite it
const touched = useRef(false);
// pill onChange:  touched.current = true; setBillable(next);
// project change: touched.current = false;
// seed effect:    if (touched.current) return;   // before setBillable
```
Three surfaces, same two lines each. Add a case per surface: tap the pill while `isSettled` is false, settle the query, assert the pill kept the tapped value; and assert the act is disabled while `isSettled` is false. (Note this shares its root with **m15** — `isSettled` also cannot see `isError`; fixing both together is one expression.)

---

### MINOR

**W3-R4-m1 — NEW: the SQL suite's refusal cases catch `WHEN OTHERS`, so any error passes them.**
*minor · confirmed by reading · medium*
`supabase/tests/billing/time_log_rpc_test.sql` cases **(c)** (`:165-190`) and **(e)** (`:243-280`) wrap each call in `BEGIN … EXCEPTION WHEN OTHERS THEN v_raised := true; END`. The assertion then only proves *something* raised — an RLS denial, a fixture typo, a renamed column and HT-11's own `p_billable must be stated` are indistinguishable. Case (d)'s invoiced-guard arm has the same shape. A later wave that accidentally breaks the fixture's grant would keep these green.
**Fix:** capture `SQLERRM` and assert on it — `ASSERT v_msg LIKE '%p_billable%'`, `'%duration_minutes%'`, `'%invoiced%'` — three one-line additions.

**W3-R4-m2 — NEW: `isDayValue` accepts a structurally valid day that does not exist, and `startedAtFromDateValue` rolls it over in silence.**
*minor · confirmed by reading · low consequence today*
`time-capture.tsx:263-266` is `/^\d{4}-\d{2}-\d{2}$/`, so `2026-02-31` and `9999-99-99` pass; `startedAtFromDateValue` then calls `at.setFullYear(y, m-1, d)` and JS rolls the date forward (`2026-02-31` → 3 March). A native `<input type="date">` cannot produce those values, so the path is closed through the UI today — but the function is exported beside `isoDateValue` for any surface (W6's Field drain is the obvious next caller) and its doc comment promises "a day the member actually named".
**Fix:** round-trip it — `const at = …; return isoDateValue(at) === value ? at.toISOString() : null` — or state in the doc comment that the regex is a shape check, not a calendar check.

**W3-R4-m3 (= r3 m1) — the chain-out strip for another tab's row says "that document".**
*minor · confirmed · **carried from r1/r2/r3, unfixed*** — `document-time-provider.tsx:385` sets `projectName: 'that document'` in `offerFromServerStop`; `log-strip.tsx` prints it as the headline. The row carries `project_id`, and `useTimeCaptureProjects` already fills a name-bearing cache under `['document-hours-projects']`.

**W3-R4-m4 (= r3 m2) — the server-side stop applies no R64 bound and emits no `time_timer_stopped`.**
*minor · confirmed · **carried, unfixed*** — `00608:182-189` computes `duration_minutes` from raw wall clock with none of `closeOut()`'s protections, and `offerFromServerStop` proposes it verbatim with `idleSeconds: 0`. HT-17's instrument never fires for that hour. Narrow (only a row this session never watched), but an overnight tab proposes its full wall-clock hours.

**W3-R4-m5 (= r3 m3) — `start_timer` can dead-end on a raw `unique_violation` with nothing left to report it.**
*minor · high · **carried, unfixed*** — `00608:182-188`'s stop `UPDATE` runs under the caller's RLS; for a member who is not the designer, not a studio co-member, and whose roster seat was removed while her timer ran, it matches zero rows, the INSERT trips the partial index twice, attempt 2 `RAISE`s bare, and `hold`/`resume`'s `.catch(() => null)` swallows it. Auto-start then dies permanently with no message.

**W3-R4-m6 (= r3 m4) — the HT-25 seating sentence lies to a member who holds only a non-priceable seat.**
*minor · confirmed · **carried, unfixed*** — `log-time-sheet.tsx:88-91` reads `willBeSeated` off `useMyRateRoles`, which filters to the four priceable roles, so a member seated as `client`/`previous_lead` is told "You are not on this roster". She is.

**W3-R4-m7 (= r3 m5) — the Log time dialog has no focus trap and no focus restore.**
*minor · measured in r3 on chromium/webkit · **carried, unfixed*** — `log-time-sheet.tsx:177-190` declares `role="dialog" aria-modal="true"` and focuses the first field; nothing wraps focus, nothing restores it on close. The rest of the dialog's a11y is sound and I re-confirmed the geometry half this round: every control is labelled, minutes is a `spinbutton`, the failure is `role="alert"`, and **every act measures 44px and the panel sits at x=18..372 inside a 390 viewport** (measured).

**W3-R4-m8 (= r3 m6 residue) — WebKit `<select>` still renders 21px despite `min-h-11`.**
*minor · measured in r3 · **declared in `W3-fix-r3.md` §1, not fixed*** — Safari's `menulist` appearance ignores `min-height`; portal-wide and pre-existing; the date `<input>` and `Add` act (the controls the finding was about) measure 49.5px and 44px. Fixing it needs an `appearance-none` decision across the portal.

**W3-R4-m9 (= r3 m7) — the mobile sheet keeps its state after a successful add, and re-shows a stale refusal.**
*minor · confirmed · **carried, unfixed*** — `mobile-sheets.tsx:1318-1320` clears `minutes` and closes the form only; `pickedProject`, `activity`, `billable`, `rateRole` and `note` persist.

**W3-R4-m10 (= r3 m8) — a weak negative assertion.**
*minor · confirmed · **carried, unfixed*** — `command-bar-log-time.test.tsx:198-204`'s `expect(sent).not.toEqual(expect.objectContaining({hourlyRateCents, ratedAmountCents, rateSource}))` passes as soon as **one** of the three is absent.

**W3-R4-m11 (= r3 m9) — SQL case (b) is sequential; `start_timer`'s retry arm has no coverage.**
*minor · honestly documented in the file's own header (`time_log_rpc_test.sql:18-22`) · **carried, unfixed*** — the plan asks for two **concurrent** calls. `00608:208-212` (a genuine `unique_violation` from another session in the gap) is executed by no test in the repo.

**W3-R4-m12 (= r3 m10) — a named calendar day can land in the next UTC day.**
*minor · confirmed by reading · **carried, unfixed*** — `startedAtFromDateValue` keeps the current clock time and sets Y/M/D in **local** time, while `TimeEntryLedgerRow.day` is documented as a **UTC** bucket (`use-time-tracking.ts:789-790`). At UTC−7, "yesterday" logged at 17:00 local stores today 00:00 UTC. (My own end-to-end probe ran at UTC−5 and landed cleanly on the named day, so I did not reproduce the divergence — it is reasoned, and N-8's ruling is what settles it.)

**W3-R4-m13 (= r3 m11) — `rateRole` is not cleared when the document changes.**
*minor · confirmed · **carried, unfixed*** — `log-time-sheet.tsx:114` resets it only on open; `hours-ledger.tsx` never resets `addRateRole`; `mobile-sheets.tsx` never resets `rateRole`. Switching documents sends a role the member may not hold there, and W1's `00601` raises.

**W3-R4-m14 (= r3 m12) — the bare `t` is inert unless focus is on `<body>`, but "The keys" says "Anywhere you are not typing."**
*minor · confirmed by reading this round · **carried, unfixed*** — `registry-shortcuts.tsx:60-64`: `anOverlayIsOpen()` returns **true** whenever `document.activeElement` is anything but `<body>`/null, before it ever looks for a dialog. After clicking any button, link or card, `t` does nothing and nothing says why; the e2e's `page.locator('body').click()` is the tell. The `?` doorway wears the same guard and its copy admits it ("…**and nothing is open in front.**"); the new T row (`keys-reference.ts:89-96`) does not. Copy-only fix.

**W3-R4-m15 (= r3 m13) — three statements of the same fact on every ledger entry row.**
*minor · confirmed · design · **carried, unfixed*** — for one non-billable hour `EntryRow` prints `"… · not billable"` in the meta line, the new `BillablePill` reading "Non-billable", and the pre-existing state chip reading "Non-bill". The pill is plan-mandated, so this is a consequence of the plan; still worth an orchestrator call, not a silent edit.

**W3-R4-m16 (= r3 m14) — `RateRoleMark` issues two sequential reads per distinct project on a sheet that renders a week of rows.**
*minor · confirmed · performance, low · **carried, unfixed*** — `time-capture.tsx:147-165` calls `useMyRateRoles(projectId)` per `EntryRow`; the hook reads `projects` then `project_team_members` sequentially. Deduped per project, so a week across eight houses costs sixteen extra round trips to decide whether to print a usually-absent word.

**W3-R4-m17 (= r3 m15) — `useBillableIntent` cannot tell "the authority read failed" from "there is no agreement", and prints the second as a fact.**
*minor · confirmed by reading · medium · **carried, unfixed*** — `time-capture.tsx:41-57` derives `isSettled` as `Boolean(projectId) && !authority.isLoading` and never consults `authority.isError`, so a failed read prints `non-billable · no agreement` about a document whose agreement the browser never learned. **Same expression as M1; fix them together.**

**W3-R4-m18 (= r3 m16) — `mintEntryId()` runs inside `mutationFn`, so the hook's own retry mints a fresh id.**
*minor · confirmed by reading, exposure measured closed · **carried, unfixed*** — `use-time-tracking.ts:456-459`'s comment claims a retried call re-reads the hour it already wrote; that holds only for a caller-supplied `entryId`. The portal's QueryClient does configure a network-error mutation retry (`lib/react-query.ts:197-204`); it never fires today only because postgrest-js returns a plain object, not an `Error`, so `isNetworkError` is false. One `instanceof` away from a duplicate billable hour.

**W3-R4-m19 (= r3 m17) — in `hold`, a server-stopped row's strip can silently replace the strip `closeOut` just raised.**
*minor · confirmed by reading · low · **carried, unfixed*** — `document-time-provider.tsx:408-425`: `closeOut(…, {offerStrip: true})` sets an offer, then `offerFromServerStop(taken.stopped)` sets it again into the single `offer` slot. No hour is lost; one of the two is never offered for adjustment.

---

### NOTES

**N-1 — HT-35 (disclosure + opt-out) absent.** Correct: the orchestrator scoped it to stage 4 (lane B, with W7); `document-events.ts` is lane B's this phase. No action.

**N-2 — W4's portal follow-commits absent.** Correct per the orchestrator's scope ruling. `log_time` accepts `p_project_id NULL` and `p_studio_id`; the hook does not yet pass `p_studio_id`. `use-time-tracking-authority.test.tsx`'s `Object.keys(args).sort()` assertion pins an **eleven**-key argument list that W4 must edit when `p_studio_id` gets a caller — a one-line comment beside it now would stop that reading as a regression then.

**N-3 — two RLS suites are red and `supabase/tests/rls/` still has no `KNOWN_FAILURES.md`. Ruling owed.** Reproduced independently after my own clean reset: `design_requests_test.sql`, `studio_titles_test.sql (FAIL f)`. Not W3's, re-verified this round: neither file mentions `project_time_entries`/`log_time`/`start_timer` (grep count **0** in both), both were last touched by `ad74e34c8` (2026-09-04) / `ed980a595` (2026-08-18), and W3's entire DB delta is two new functions plus four GRANT/REVOKEs whose seed diff is exactly those four. The runner reports them as *unexpected* for every lane, so every remaining wave's RLS gate reads red for reasons unrelated to it. **Fourth round reported.**

**N-4 — all three document pickers filter to `status === 'active'`. Ruling owed if Kody disagrees.** `log-time-sheet.tsx:218`, `mobile-sheets.tsx:1236`, and the pre-existing `hours-ledger.tsx:998`. It brushes HT-13: an hour remembered a month late on a document closed in the meantime has no door. Measured: the ⌘K picker offered **6** documents and the phone **7** options (six plus the placeholder) on the seeded stack.

**N-5 — forward-dating is unbounded and unmarked. Ruling owed.** `log_time` accepts a future `p_started_at`; `isBackdatedEntry` marks only the past. An hour dated next month prints nothing, is `authorized`, and is claimable by the invoice composer.

**N-6 — the `database.types.ts` diff, stated precisely.** 40 lines, **all** at 37 078–37 178 in the trailing generic helpers — a CLI-version parenthesisation difference on my side. No table, function or enum type differs. Not a W3 defect. *(Carried: `pnpm db:generate` with a shell-exported `SUPABASE_DB_URL` truncates the file to zero inside this worktree before failing; I used `supabase gen types … > $TMPDIR/…` and diffed, leaving the tree untouched.)*

**N-7 — e2e isolation, and the port-3000 false-green hazard for W4–W7.** Port 3000 was free and this stage owns it. Two traps I hit that later lanes will hit too, both now measured: (a) starting `next dev` **inside the Bash sandbox** fails to read `.env.local` (`EPERM: operation not permitted, stat …/.env.local`) and the server then serves **404 on every route** while reporting "Ready" — start it with the sandbox disabled; (b) the same sandboxed run floods `Watchpack Error (watcher): EMFILE: too many open files`. With the sandbox off and `ulimit -n 65536` the server booted clean (`Environments: .env.local`) and `/desk` answered 307. The r2/r3 hazard stands unchanged: `playwright.config.ts`'s `webServer` hard-codes `NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321'` (the peer program's stack) with `reuseExistingServer`, so a lane that runs `test:e2e` cold drives the peer's stack and passes. Server killed; 3000 free.

**N-8 — the ruling sweep, re-verified independently this round.**
· **HT-26** — no surface renders a blank where a rate is pending: `timeRateProvenance` returns `rate pending` for `rate_source='none'` and `rate not recorded` otherwise, and `RateReadout` always prints the label; my end-to-end row came back `rate_source='none'`, the case the label exists for. The ⌘K form, the add row and the phone carry **no rate cell at all** rather than an empty one — the r2-M1 declaration, recorded in code at `hours-ledger.tsx:1076-1082` and still only there (a one-line comment in the other two would close it).
· **HT-36** — `notes` appears in the added lines only as `p_notes` in the generated types and as a pass-through in the hook. **No W3 surface reads or writes it**, no rollup is touched, `log_time`'s `p_notes` has no caller.
· **HT-11** — `CreateTimeEntryInput.billable` and `StartTimerInput.billable` are both **required**; the `?? true` is deleted; both RPCs raise on NULL (SQL case (c), both doors, though see m1); all four capture surfaces carry the pill. Every caller enumerated: `useCreateTimeEntry` has exactly three (`hours-ledger.tsx:441`, `log-time-sheet.tsx:152`, `document-time-provider.tsx:521`), `useStartTimer` exactly one (`document-time-provider.tsx:162`), all W3 surfaces, no orphan silently flipped to `false`. **Qualified by M1.**
· **HT-41** — `RateRoleChip` returns `null` below two priceable roles; `RateRoleMark` is the read-only twin where the row already exists, which is right given `00600` freezes `rate_role` after INSERT. Declared with its reason at `time-capture.tsx:139-146`.
· **HT-24** — all four surfaces open on `''` with an `activity not set` option and send `null`; my driven row stored `activity NULL`. The `'design'` default is gone from the strip, the add row and the phone.
· **HT-13** — driven: an hour dated yesterday landed on `started_at 2026-09-12`, not `created_at`. The add-row date follows the paged week; the mark is derived at 30 days and asserted 31-yes / 29-no on the add row, on a written row, on the scope rows and in the ⌘K form; `guard_invoiced_time_entry` still refuses to re-date a billed hour (SQL case (d)). Qualified by **m12** and **N-5**.
· **HT-14** — **driven at 390 this round**, by the only doorway that exists with nothing in hand (the mobile bar's `More → Time in hand`; the studio drawer's `[data-drawer-timer-doorway]` is gated on `holding && inHandToday > 0` and is absent on the Desk):
  ```
  headline "NOTHING IN HAND" · body "No clock is running. You can still log an hour against any document."
  Document 19.8..370.2 h=49.5 · Minutes 19.8..370.2 · Activity 19.8..370.2
  Add entry 19.8..109.6 h=44.0 disabled=true   BillablePill 19.8..132.6 h=44.0
  Add entry disabled with minutes but no document = true · document options=7 · h-overflow=0
  ```
  Never both-neither, and every control is inside a 390 viewport at the 44px floor. Marred by **m9**.
· **HT-25** — the ⌘K and phone pickers list every readable active project, rostered or not, and the form says so before she logs. Qualified by **m6** and **N-4**.
· **R69** — no `setInterval`, no ticking clock added; the backdated word, the role mark and the pill are static text.
· **§0.22** — the strip's `Log` with nothing touched still writes; no new required field on the stop payload.
· **§0.12** — the invoiced lock untouched; `00608` redefines nothing and touches no trigger.
· **No flag anywhere** — `useFeatureFlag` across the added lines: **one hit, and it is a `jest.mock` of an existing hook in a new spec's module tree**, not a gate. **No dashboard, tab, badge, red/green** — the only `badge` hits in added lines are the two comments saying "never a badge"; the only coloured ink added is `--color-terracotta-ink` on two `role="alert"` failures, the house's error ink with 251 pre-existing uses in this portal.

**N-9 — data access, the mock fallback, transitions.** Both new reads (`useTimeCaptureProjects`, `useMyRateRoles`) live in `packages/supabase`, are exported from `hooks/index.ts` and the package index, and no new component constructs a client or calls PostgREST directly. `useTimeCaptureProjects` reuses the Hours sheet's canonical `['document-hours-projects']` key with a byte-identical `select('id, name, status').order('name')`. `withMockData` wraps **no** W3 path, so `DATA_MODE=live` had nothing to unmask; every probe and the e2e ran in `live` regardless, against `http://127.0.0.1:54421`. No bare `<a>` in any added line.

**N-10 — `00609` correctly unused; `00608` is sound at the object level.** `SECURITY INVOKER` both, `SET search_path = public, pg_temp` both, `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` both, and a postcondition block probing `prosecdef`, the `ON CONFLICT` text, both billable raises and both roles' `has_function_privilege`. Two curiosities named and not fixed: `log_time`'s INSERT names `studio_id`, a column added by the **later** `00610` (harmless — plpgsql bodies are not name-resolved at `CREATE` time, and P-3 ships the range at once, but a partial push would find out); and a replayed `log_time` still fires `aaa0_time_entry_auto_roster_trg`, which `00597` makes idempotent.

**N-11 — `LogTimeOverlay` is correctly nested inside `DocumentTimeProvider`** (`(document)/layout.tsx:76,99-102`), and the bare `t` is guarded against the `g t` chord in both directions (`chordIsArmed()` from module scope **and** `e.defaultPrevented`), pinned by `log-time-shortcut.test.tsx:42` and `:56`. The chord flag's move from a component `useRef` to module scope changes no existing behaviour.

**N-12 — NEW: the Hours sheet scrolls the page sideways at 700 and 768, and it is NOT the add row.** Measured: `h-overflow = 29` at 700, `5` at 768, `0` at 390 / 900 / 1024 / 1440. The add row's own fields are comfortably inside the viewport at every one of those widths (at 700: `Add` ends at x=595.5 of 700). The overflowing elements are three pre-existing `SPAN.shrink-0 font-heading text-[17px]` entry-row headings, and hiding the entire add row leaves the overflow at 29 unchanged. **Not W3's**, and the wave's e2e (1440 / 1024 / 390) cannot see it. Worth a line in the house-sheet sweep's backlog.

---

## 3 · Done-when, re-checked by the reviewer

| Plan §4 done-when | Verdict |
|---|---|
| 45-minute call in **5 interactions** from ⌘K with no document open, `SELECT` shows `source='command_bar'` | **✅ now driven end to end.** `t` → Document → Minutes → Enter (date defaults to today, activity optional) = 5 with nothing in hand; the row read back `source='command_bar'`, 45 minutes. |
| The same entry dated yesterday lands on **yesterday** (`started_at`) | **✅ driven** — `started_at 2026-09-12 16:13+00` against `created_at 2026-09-13`. Qualified by **m12** (a named local day can bucket into the next UTC day at large offsets). |
| An entry dated 31 days back renders the quiet "backdated" mark | **✅** 31-yes / 29-no, on the add row, on a written row, on the scope rows and in the ⌘K form. |
| The mobile sheet with nothing held either logs or says why | **✅ driven at 390** — "Nothing in hand", a 7-option picker, `Add entry` disabled until a document is chosen, inline `role="alert"` refusal, no auto-closing effect. Marred by **m9**. |
| A log-strip entry carries an **explicit** `billable` and prints its reason | **✅** for `billable` (seeded from the stored row, never `true`) — but **qualified by M1**: the seed can be later than the act and later than the member's own tap. The reason *sentence* is on the ⌘K form and the add row; the strip prints stored provenance. |
| Two tabs → one running row, one offer strip | **✅** at the server (SQL case (b), sequential — **m11**) and at the provider. Not driven with two real browser tabs. Qualified by **m19**. |
| *(plan's hours-ledger row)* rate readout on the add row | **Declared absent, accepted** (r2-M1): the resolved rate is not client-knowable (`resolve_time_rate_cents` REVOKEd from `authenticated`), the decision is recorded at `hours-ledger.tsx:1076-1082` and pinned by a test. |
| **r3-M1** the add row at 390 | **✅ fixed, re-measured by me** on chromium at 390 / 700 / 768 / 900 / 1024 / 1440. |
| **r3-M2** a cleared date | **✅ fixed, re-measured by me** — `Log it` and `Add` stand disabled; two falsifying cases. |
| **r3-m6** house sheet §A on the add row | **✅ taken** — `t-meta` (12px, a real step) and `min-h-11`; measured 12px / 49.5px. Residue **m8** (WebKit `<select>`) declared. |

---

## 4 · What I did not verify

- **Two real browser tabs** racing `start_timer`, i.e. `00608`'s retry arm (**m11**) — nothing in the repo exercises it and I did not build a second session.
- **A project with an ACTIVE billing authority.** Every seeded project resolves to `no_authority`, so M1's wrong-direction write (an hour that *should* be billable written non-billable) was demonstrated by the reverted-tap measurement rather than by a differing resolved answer. The pending-window enablement and the revert are both measured; the resulting mis-bill on a billable project is inferred from them.
- **The log-offer strip's own controls in a browser** — reaching it needs a running timer, and the e2e file's single-actor pin forbids starting one. Pinned by `log-strip.test.tsx` (11 cases) instead.
- **m12's timezone divergence under a non-UTC `TZ`** — my probe ran at UTC−5 and landed cleanly; the divergence is reasoned from `TimeEntryLedgerRow.day`'s own doc comment, not reproduced under `TZ=America/Los_Angeles`.
- **m18's duplicate-hour path under a real dropped connection** — read, concluded closed, not induced.
- **Firefox / WebKit for the hours e2e and for this round's geometry probes** — all my measurements were chromium (the e2e skips the other two by the file's single-actor pin). r3's webkit/firefox numbers for the pre-fix defect stand on its own record.
- **`pnpm --filter @patina/supabase test`** — not in the wave's gate list; not run.
- **Lint outside designer-portal** — per `patina-verification`, no other package's ESLint config resolves; not claimed either way.
- **Prod** — nothing pushed, deployed or run against Strata. All SQL and all HTTP ran against the isolated `patina-hours` stack (`127.0.0.1:54421` / `:54422`); the shared 54321/54322 stack was never touched. My throwaway Playwright specs were deleted, `test-results/` and `playwright-report/` removed, the one probe row deleted, and the worktree is clean but for the pre-existing generated `next-env.d.ts`.
