# W3 — adversarial review, round 5

**clean = false** — 0 blockers, **1 major (NEW)**, 23 minors (4 NEW + 18 carried + 1 gate-degradation), 15 notes.

**Reviewed** `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal log --oneline origin/hour-tracking/integration..hour-tracking/portal`
→ `8c63ff3d4`, `d7d0ce16f`, `014d81ad4`, `0dd74dde8`, `959ead009`, `21ea053e1`, `8635eae2e`, `26b34125d`, **`c13ec3e08`** (33 files, +3877 / −206). Full diff of every touched file read.
**Against** plan-v2 §0 + §4, `rulings.md` (HT-1…HT-41, HT-3-a…g, HT-10-a), `W3-impl.md`, `W3-review-r4.md`, `W3-fix-r4.md`.

**Round 4's major is genuinely fixed, and I re-read it rather than trusting the fix report.**

* **W3-R4-M1 (the act outruns the resolved answer; her tap is reverted)** — fixed on all three surfaces. `valid` / `addValid` / the phone's `valid` now carry `(intent.isSettled || billableStated)` (`log-time-sheet.tsx:158-164`, `hours-ledger.tsx:427-438`, `mobile-sheets.tsx:1194-1199`); each seed effect returns early on `billableStated` **before** the `seededFor` check; `statedFor` is project-keyed state (not a bare ref), cleared by an effect on the project id, so an A → B → A return re-asks. Measured live: after picking a document with 45 minutes already typed, `Log it` reads `disabled=true` for the first sample and enables only once the authority read settles.
* **W3-R4-m17 (a failed read printed as "no agreement")** — closed with it: `useBillableIntent` now consults `authority.isError` (`time-capture.tsx:56-68`), exposes `unreadable`, and prints `agreement not read · state it yourself`. `isError` is in the `useMemo` deps.
* The deviation the fix declared — gating on `(isSettled || billableStated)` rather than `isSettled` alone — is correct and is the only shape that does not strand the form on a failed read. Accepted.

**The 18 minors and 12 notes r4 carried are still open** (`c13ec3e08` took only M1 + m17, as its §6 says). They are re-listed unchanged. **Four new minors and one new major** come from this round's own measurement.

---

## 1 · Gates, run by the reviewer, verbatim

| Gate | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **CLEAN** — `Finished supabase db reset on branch main.` `{"target":"local","version":"","message":"Reset local database."}` (exit 0) |
| `scripts/run-sql-tests.sh -d …/agent-portal/supabase/tests/billing -H 127.0.0.1 -p 54422` | **total 9 · green 9 · expected-fail 0 · unexpected-fail 0 · effective-green 9/9.** `time_log_rpc_test.sql PASS` |
| `scripts/run-sql-tests.sh -d …/agent-portal/supabase/tests/rls -H 127.0.0.1 -p 54422` | **total 31 · green 29 · expected-fail 0 · unexpected-fail 2** — `design_requests_test.sql`, `studio_titles_test.sql` (`ERROR: FAIL f: demoting the sole active owner should raise last_owner_protected`). **Documented separately — pre-existing, not W3's** (N-3). W3's own three RLS suites pass, as do `internal_time_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test` |
| `pnpm --dir … --filter @patina/supabase type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir … --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir … --filter @patina/designer-portal test` | **Test Suites 578 passed / 578 · Tests 7360 passed / 7360 · Snapshots 1 · 24.1s** (r4 baseline 578 / 7356 — `c13ec3e08`'s four new cases). Every spec plan-v2 §4 names is present and green |
| `pnpm --dir … --filter @patina/designer-portal lint` | **exit 0 · ✖ 201 problems (0 errors, 201 warnings)** — byte-for-byte the r4 baseline; all `Unused eslint-disable directive`; a grep over the fifteen touched files' paths in the lint output returns **nothing** |
| `pnpm --dir … --filter @patina/admin-portal build` | **green** (exit 0) — the repo's strictest gate, exercised after the `packages/supabase` edit |
| Playwright `e2e/document/hours.spec.ts` | **PARTIAL — see m-new-5 and N-13.** Under the only server I could get to hydrate (a production build of this worktree, `next start -p 3000`, `.env.local` → `:54421`, `DATA_MODE=live`): the three width cases (1440 / 1024 / 390, which carry the add-row assertions), the studio-scope case and **both W3 cases** = **6 passed (1.3m)**. The pre-existing first case, `the sheet doorway opens the Hours book`, **fails** at `:72` (`?sheet=hours` is never stripped from the address) and, because the file is `mode: 'serial'`, aborts the rest of a whole-file run. Reproduced twice |
| `python3 ./scripts/generate-legacy-grants.py` (the **worktree's own** copy, §0.20) | `baseline + 2643 replayed statements`; `git status supabase/seed/00-legacy-grants.sql` **empty** → the committed seed is exactly what regeneration produces. `grep -lE '^\s*(GRANT\|REVOKE)' supabase/migrations/006*.sql` lists `00608` among the thirteen |
| `supabase gen types typescript --db-url …54422` vs the committed `database.types.ts` | **substantively in sync** — total diff **40 lines, all** at 37 078–37 178 in the trailing generic helpers (a CLI-version parenthesisation difference). `log_time` at `:34196` and `start_timer` at `:36406` are both present (N-6) |

**Commit hygiene** (`git show --stat` re-read on all nine): Conventional Commits throughout (`feat(time):` ×4, `test(time):` ×1, `fix(time):` ×4). **`supabase/config.toml` appears in zero commits** (`git log --name-only … | grep -c` = **0**). Migration + `database.types.ts` + grants seed + SQL test land in ONE commit (`8c63ff3d4`). The worktree is now **fully clean** — even `next-env.d.ts`, dirty since before this stage, was rewritten back to its committed content by the production build I ran.

**Numbering** (§0.2a, after `git fetch --all --prune`): `00608` exists on `refs/heads/hour-tracking/portal` and `refs/remotes/origin/hour-tracking/portal` and **nowhere else**; `00609` exists on no ref.

**Extra evidence this round: the capture path driven end to end in a real browser.** Signed in as the seeded designer against the isolated stack and opened a document; the portal's own `start_timer` call wrote the running row —

```
id 43522394-… | project b0000000-…d1 | duration_minutes NULL | billable f | source timer_auto
```

— which is the RPC, the required `billable`, and §0.11's one slot, observed rather than inferred. I then put the document down through the client router and the log-offer strip rose for it. **The probe row was deleted afterwards (`DELETE 1`); the stack is as the reset left it.**

---

## 2 · Findings

### MAJOR

---

**W3-R5-M1 — NEW. The log-offer strip's two new controls are dark-on-dark below 1180px: the billable pill measures 2.14:1 against the strip, the rate readout 3.23:1 at 11px.**
*Severity: **major** (a user-visible defect on a NEW control at 390 — and the control in question is the one that decides whether an hour is billed) · Confidence: **measured live**, chromium at 390, computed styles + screenshot*
**Location** `apps/designer-portal/src/components/document/log-strip.tsx:177-200` (the new `<div className="flex flex-wrap items-center gap-x-3 gap-y-1">` block); the colours come from `time-capture.tsx:79-114` (`BillablePill` → `DocumentAction variant="tertiary"`) and `:186-222` (`RateReadout` → `t-head text-[var(--color-aged-oak)]`).

**Finding.** The strip is `bg-[var(--color-charcoal)]` at every width **below** `min-[1180px]` — so at 390 *and* at 1024. Every control that shipped in it before W3 carries an explicit light-ink override for exactly that reason (`className="min-h-11 max-[1179px]:!text-[var(--color-off-white)]"` on `Log`, `max-[1179px]:!text-[rgba(250,247,242,0.72)]` on `Discard`; the minutes input and the activity select set `text-[var(--color-pearl)]`). The two controls W3 adds carry no override and inherit the light-paper palette.

Measured on the real strip at 390 (raised by holding a document and putting it down through the client router), `getComputedStyle` on each node:

```
strip background                    rgb(44, 41, 38)      #2C2926
"Log"            (pre-existing)     rgb(250, 247, 242)   contrast 14.5:1
"Discard"        (pre-existing)     rgba(250,247,242,.72)          ~8:1
minutes input    (pre-existing)     rgb(229, 226, 221)   contrast 12.3:1
"Non-billable"   ← W3 BillablePill  rgb(101, 89, 78)     contrast  2.14:1   fs 12px
"not billable"   ← W3 RateReadout   rgb(139, 115, 85)    contrast  3.23:1   fs 11px
h-overflow = 0
```

The screenshot agrees with the numbers: the whole first row reads white on charcoal and the second row is two brown words that all but vanish into the ink. WCAG AA wants 4.5:1 for text this size; 2.14:1 is not "low contrast", it is a control you have to hunt for. The phone strip is the surface the D10 offer exists for.

**Why major, not minor.** It is a **new** control (both the pill and the readout are W3's), on **this wave's own ruling** (HT-11 — billable is said out loud), at 390, on the primary thumb-edge surface; and it is wrong at 1024 as well, so it is not a phone-only edge. The brief's bar is "a control off-screen at 390 is a major" — a control rendered at 2.14:1 is the same defect by a different mechanism. Nothing about it is pre-existing: the sibling controls' overrides are the proof that this surface's palette flip was a known, solved problem before W3 arrived.

**Exact fix (small).** `RateReadout` already accepts a `className`, so pass `max-[1179px]:!text-[rgba(250,247,242,0.72)]` from the strip. `BillablePill` accepts none — give it a `className` prop forwarded to the `DocumentAction` (and to the reason `<span>`), and pass the same override from the strip only. Then re-measure the two nodes at 390 and 1024 and assert ≥ 4.5:1, or assert the computed colour is the off-white token in a jest case on `log-strip.test.tsx`.

---

### MINOR

**W3-R5-m1 — NEW: the strip prints the same fact twice, side by side.**
*minor · measured at 390 · design*
`log-strip.tsx:180-197`: for one non-billable hour the strip now renders `BillablePill` reading **"Non-billable"** and, immediately beside it, `RateReadout` reading **"not billable"** (`timeRateProvenance`'s `nonbillable` label). Screenshot-confirmed. This is r4's **m15** (three statements per ledger row) reappearing on a second surface, and here the two words are adjacent rather than a line apart. Both are plan-mandated, so it wants an orchestrator call rather than a silent edit — most likely `RateReadout` should print nothing when the pill already says it.

**W3-R5-m2 — NEW: `useTimeCaptureProjects()` runs on every `(document)` page, whether or not the form is ever opened.**
*minor · measured · performance*
`(document)/layout.tsx:102` mounts `LogTimeOverlay` unconditionally; `LogTimeSheet` calls `useTimeCaptureProjects()` (and `useCreateTimeEntry`, `useBillableIntent`, `useMyRateRoles`) **above** its `if (!open) return null` at `:203`. Measured on a cold `/desk` with the form never opened: the portal issues `projects?select=id%2Cname%2Cstatus&order=name.asc` against the isolated stack. It is an unfiltered read of every project the member can see, on every Desk and every document, to populate a picker nobody has asked for yet. `enabled: open` on that one query (or lifting `open` into `LogTimeOverlay` so the sheet body mounts only when open) closes it. It does warm the Hours sheet's canonical `['document-hours-projects']` key, which is the only thing it buys.

**W3-R5-m3 — NEW: pressing Enter during the authority window does nothing, and says nothing.**
*minor · measured · consequence of the M1 fix, not an argument against it*
`log-time-sheet.tsx:167` — `submit()` opens `if (!valid || busy) return;`. Between picking a document and the authority read settling, `valid` is false, so Enter in the Minutes field submits the form and is swallowed with no note, no focus move and no message; only the greyed `Log it` says why. Measured: `Log it disabled` over 1.2 s after selecting a document reads `true,false,false,…` — about 100 ms locally, and as long as the read takes on a slow link. The plan's flagship "5 interactions" flow (`t` → document → minutes → Enter) is exactly the flow that can outrun it. One line in the existing `note` slot ("checking the agreement…") would make the wait legible.

**W3-R5-m4 — NEW: a pill tap made before a document is picked is silently discarded.**
*minor · confirmed by reading · low*
`log-time-sheet.tsx:100-113` — `stateBillable` writes `setStatedFor(projectId)`, and with no document picked that is `''`; `billableStated` is `Boolean(projectId) && …`, so it is false, and the `[projectId]` effect then clears `statedFor` when she picks one. The pill is enabled in that state (no `disabled` prop on this surface, unlike the ledger's and the phone's, which pass `disabled={addBusy}` / `disabled={busy}` but are equally live before a project exists), so she can state an answer that the next click throws away. Arguably the right *value* — an answer is about a document — but the control gives no sign of it. Disabling the pill until a document is named would be honest.

**W3-R5-m5 — NEW (gate degradation, not a code defect I can attribute): the wave's own e2e file cannot be run whole in this session, and the pre-existing first case fails under the only server that hydrates.**
*minor · measured · see N-13 for the environment half*
`hours.spec.ts` is `test.describe.configure({ mode: 'serial' })`, so `the sheet doorway opens the Hours book` failing at `:72` (`await expect.poll(() => new URL(page.url()).search).toBe('')`) leaves the other six "did not run" on a whole-file invocation. Driven by hand: `/desk?sheet=hours` **does** open the Hours dialog, and the address then stays `?sheet=hours` indefinitely — `desk-doorway.tsx:203`'s `router.replace('/desk')` never lands. That file is untouched by W3, the test predates the wave, and r4 ran this same case green in dev mode at `26b34125d`; the difference is that my only hydrating server is a **production** build (`next start`, which itself warns `"next start" does not work with "output: standalone"`). So I cannot separate "prod-mode-only behaviour of a pre-existing doorway" from "a real regression" from here. Naming it rather than absorbing it: **someone should run this one case against a working `next dev` before the merge.** Filtered to the rest (`--grep "W3|scope lens reads|total above its buckets"`), **6 passed**, including both W3 cases and all three width cases with the add-row assertions.

---

**Carried from round 4, unfixed (re-verified present this round; numbering kept so the orchestrator can diff):**

| id | one line |
|---|---|
| **m1** | `time_log_rpc_test.sql` cases (c)/(d)/(e) catch `WHEN OTHERS`, so any error passes them — `SQLERRM` is never asserted. Re-read at `:165-190`, `:243-280`: unchanged |
| **m2** | `isDayValue` (`time-capture.tsx:270-273`) is a shape regex — `2026-02-31` passes and `startedAtFromDateValue` rolls it to 3 March in silence |
| **m3** | `document-time-provider.tsx:385` sets `projectName: 'that document'` for another tab's chained-out row |
| **m4** | `00608`'s server-side stop applies no R64 bound and emits no `time_timer_stopped` |
| **m5** | `start_timer` can dead-end on a raw `unique_violation` that `hold`/`resume`'s `.catch(() => null)` swallows |
| **m6** | the HT-25 seating sentence tells a member holding only a non-priceable seat (`client`/`previous_lead`) that she is "not on this roster" |
| **m7** | the Log time dialog has no focus trap and no focus restore (`log-time-sheet.tsx:196-209`) |
| **m8** | WebKit `<select>` renders 21px despite `min-h-11`; declared in `W3-fix-r3.md` §1, portal-wide |
| **m9** | the mobile sheet keeps `pickedProject`, `activity`, `billable`, `rateRole`, `note` after a successful add and re-shows a stale refusal |
| **m10** | `command-bar-log-time.test.tsx`'s `not.toEqual(expect.objectContaining({…three keys}))` passes as soon as ONE is absent |
| **m11** | SQL case (b) is sequential; `00608:208-212`'s retry arm is executed by no test in the repo |
| **m12** | `startedAtFromDateValue` sets Y/M/D in LOCAL time while `TimeEntryLedgerRow.day` is a UTC bucket — a named day can land in the next UTC day at large offsets |
| **m13** | `rateRole` is not cleared when the document changes (⌘K resets only on open; the ledger and the phone never reset it), and `00601` raises on a role she does not hold there |
| **m14** | the bare `t` is inert unless focus is on `<body>` (`registry-shortcuts.tsx:60-64`), but "The keys" (`keys-reference.ts:89-96`) says only "Anywhere you are not typing" — the `?` row admits the second half, the new T row does not |
| **m15** | three statements of the same fact on every ledger entry row (meta "· not billable" + the new pill + the state chip). **See m-new-1 — the same shape now on the strip too** |
| **m16** | `RateRoleMark` issues two sequential reads per distinct project across a week of rows |
| **m18** | `mintEntryId()` runs inside `mutationFn`, so the QueryClient's network-error mutation retry would mint a fresh id — closed today only because postgrest-js returns a plain object |
| **m19** | in `hold`, `offerFromServerStop` can overwrite the offer `closeOut` just set into the single `offer` slot |

*(**m17 is CLOSED** by `c13ec3e08` — verified above.)*

---

### NOTES

**N-1 — HT-35 (disclosure + opt-out) absent.** Correct: stage 4 (lane B, with W7). `document-events.ts` is lane B's this phase and is not in this diff — the three emitters W3 calls (`time.entryLogged`, `time.timerStarted`, `time.timerStopped`) already exist from lane D's integrated work and type-check clean against the call sites. No action.

**N-2 — W4's portal follow-commits absent.** Correct per the orchestrator's scope ruling. `log_time` takes `p_project_id NULL` and `p_studio_id`; the hook passes eleven of the twelve arguments and never sends `p_studio_id`. `use-time-tracking-authority.test.tsx`'s `Object.keys(args).sort()` assertion pins that **eleven**-key list, so W4 must edit it when `p_studio_id` gets a caller — a one-line comment beside it now would stop that reading as a regression then. (Carried from r4, still true.)

**N-3 — two RLS suites are red and `supabase/tests/rls/` still has no `KNOWN_FAILURES.md`. Ruling owed.** Reproduced independently after my own clean reset: `design_requests_test.sql`, `studio_titles_test.sql (FAIL f)`. Not W3's: neither file mentions `project_time_entries`/`log_time`/`start_timer`, and W3's whole DB delta is two new functions plus four GRANT/REVOKEs whose seed diff is exactly those four. The runner reports them as *unexpected* for every lane, so every remaining wave's RLS gate reads red for reasons unrelated to it. **Fifth round reported.**

**N-4 — all three document pickers filter to `status === 'active'`. Ruling owed if Kody disagrees.** `log-time-sheet.tsx:246`, `mobile-sheets.tsx:1259`, the pre-existing `hours-ledger.tsx:998`. It brushes HT-13: an hour remembered a month late on a document closed in the meantime has no door.

**N-5 — forward-dating is unbounded and unmarked. Ruling owed.** `log_time` accepts a future `p_started_at`; `isBackdatedEntry` marks only the past.

**N-6 — the `database.types.ts` diff, stated precisely.** 40 lines, all at 37 078–37 178 in the trailing generic helpers — a CLI-version parenthesisation difference on my side, not a schema drift. Both new functions are present in the committed file. *(Carried: `pnpm db:generate` with a shell-exported `SUPABASE_DB_URL` truncates the file to zero inside this worktree before failing; I used `supabase gen types … > $TMPDIR/…` and diffed, leaving the tree untouched.)*

**N-7 — `playwright.config.ts` still aims the peer program's stack.** `webServer.env` hard-codes `NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321'` with `reuseExistingServer: !CI`, and `use.baseURL` is a literal `http://localhost:3000` with no env override. A lane that runs `test:e2e` cold either drives the **peer's** stack or adopts **whatever** is already on 3000. Unchanged and still the trap for W4–W7.

**N-8 — the ruling sweep, re-verified independently this round.**
· **HT-11** — `CreateTimeEntryInput.billable` and `StartTimerInput.billable` are both required; the `?? true` is gone; both RPCs raise on NULL (SQL case (c), though see m1); all four capture surfaces carry the pill. **The act now waits for a stated or resolved answer on all three write surfaces** (M1 fixed). Marred at 390 by **M1 of this round** — the control exists and is honest, and on a phone you can barely read it.
· **HT-13** — `p_started_at` unbounded (SQL case (d): 400 days back lands on the day named); the add-row date follows the paged week (`hours-ledger.tsx:415-417`); the mark is derived at 30 days from `created_at - started_at` and asserted 31-yes / 29-no on the add row, a written row, the scope rows and the ⌘K form; `guard_invoiced_time_entry` still refuses to re-date a billed hour. Qualified by **m2**, **m12**, **N-5**.
· **HT-14** — `MobileTimerSheet` says `Nothing in hand` + "No clock is running. You can still log an hour against any document.", offers a picker, disables `Add entry` until one is chosen (`valid` requires `targetProjectId`), guards the handler (`if (!targetProjectId) return`), renders a `role="alert"` refusal inline, and clears **only** after the server answers. The auto-closing `useEffect` is deleted. Marred by **m9**. *(I did not re-drive the phone sheet myself this round — the mobile bar's `More` doorway would not open under my probe; r4 drove and measured it at 390, and the four jest cases pin it.)*
· **HT-24** — all four surfaces open on `''` with an `activity not set` option and send `null`; the `'design'` default is gone from the strip (`:37`, `:46`), the add row (`hours-ledger.tsx:367`) and the phone (`mobile-sheets.tsx:1154`). The one declared residue — the add row's select now carries the empty option, so `W3-impl.md` §6's "the add row's default stays 'design'" is **stale and in the implementer's favour**: it was taken.
· **HT-25** — the ⌘K and phone pickers list every readable active project; the form says so before she logs. Qualified by **m6** and **N-4**.
· **HT-26** — no surface renders a blank where a rate is pending. `timeRateProvenance` returns `rate pending` for `rate_source='none'` and `RateReadout` always prints a label; measured on the live strip, the readout printed `not billable` rather than nothing. The ⌘K form, the add row and the phone carry **no rate cell at all** (the r2-M1 declaration), recorded in code only at `hours-ledger.tsx:1096-1102`.
· **HT-36** — `notes` appears in the added lines **only** as `p_notes` (the generated type, the RPC parameter, the hook pass-through). No W3 surface reads or writes it; `log_time`'s `p_notes` has no caller; no rollup is touched.
· **HT-41** — `RateRoleChip` returns `null` below two priceable roles; `RateRoleMark` is the read-only twin where the row already exists, which is right given `00600` freezes `rate_role` after INSERT. *(Not driven: the seeded designer holds one role on every seeded project, so the chip's multi-role arm is pinned by jest only — measured `rolechip count=0` on the Hours sheet at both widths, which is the correct single-role behaviour.)*
· **R69 / §6** — no `setInterval` in any added line; the one `requestAnimationFrame` is a focus call. **No badge, no tab, no dashboard, no red/green**: the only `badge` hits in added lines are two comments saying "never a badge"; the only new coloured ink is `--color-terracotta-ink` on two `role="alert"` failures.
· **§0.22** — the strip's `Log` with nothing touched still writes (`billable` is seeded from `offer.billable`, `activity` from `''` → `null`); no new required field on the stop payload.
· **§0.12** — the invoiced lock untouched; `00608` redefines nothing and touches no trigger.
· **No flag anywhere** — `useFeatureFlag` across the added lines: **one hit, and it is a `jest.mock`** in a new spec (`jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false }) }))`), not a gate.

**N-9 — data access, the mock fallback, transitions.** Both new reads (`useTimeCaptureProjects`, `useMyRateRoles`) live in `packages/supabase`, are exported from `hooks/index.ts` and the package index; no new component constructs a client or calls PostgREST directly. `useTimeCaptureProjects` reuses the Hours sheet's canonical `['document-hours-projects']` key with a byte-identical `select('id, name, status').order('name')`. `withMockData` wraps **no** W3 path, so `DATA_MODE=live` had nothing to unmask; every probe and the e2e ran with it set, against `http://127.0.0.1:54421` — and in the production build the value is inlined, so the fallback is compiled out. No bare `<a>` in any added line.

**N-10 — `00609` correctly unused; `00608` is sound at the object level.** `SECURITY INVOKER` both, `SET search_path = public, pg_temp` both, `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` both, banner header with lineage, and a postcondition block probing `prosecdef`, the `ON CONFLICT` text, both billable raises and both roles' `has_function_privilege`. Two curiosities named and not fixed: `log_time`'s INSERT names `studio_id`, a column added by the **later** `00610` (harmless — plpgsql bodies are not name-resolved at `CREATE` time — but a partial push would find out); and a replayed `log_time` still fires `aaa0_time_entry_auto_roster_trg`, which `00597` makes idempotent.

**N-11 — `LogTimeOverlay` is correctly nested inside `DocumentTimeProvider`** (`(document)/layout.tsx:76, 99-103`), and the bare `t` is guarded against the `g t` chord in both directions (`chordIsArmed()` from module scope **and** `e.defaultPrevented`). The chord flag's move from a component `useRef` to module scope changes no existing behaviour. The Desk's own Begin column row also dispatches — **driven at 390 this round: clicking "Log time" on the Desk opened the dialog**, which is `21ea053e1`'s fix holding.

**N-12 — the Hours sheet scrolls the page sideways at 700 and 768 (r4's measurement), and it is not W3's.** Not re-measured this round; my 390 / 1440 measurements both report `h-overflow = 0`.

**N-13 — NEW, and the orchestrator should carry it: `next dev` does not hydrate at all in this worktree right now.** Measured, and it cost this round most of an hour. Started from `apps/designer-portal` with the sandbox disabled and `ulimit -n 65536`, on 3100 and on 3000, via `npx next dev --webpack` and via `pnpm dev`, with and without `.next` removed: the server boots (`Environments: .env.local`, `/desk` → 307), all six client chunks return 200, `self.__next_f.push` is `nextServerDataCallback` so the flight payload IS consumed, there are **zero** page errors and **zero** failed requests — and the document body never gets a React fiber. Every control is inert: the sign-in disclosure's `aria-expanded` stays `false` after a click, typing a valid address never enables the OTP button. The auth fixture therefore fails on every spec. `next build --webpack` + `next start` on the **same tree** hydrates immediately (`pw inputs: 1`), which is how I ran the e2e at all. `/auth/signin` imports nothing W3 touched, so I do not attribute this to the wave — but the plan's verbatim e2e gate cannot be run as written from this machine until it is understood, and W4–W7 will hit it. (r4 also recorded a sandbox-related dev-server trap; this is a different and worse one.)

**N-14 — NEW, owed to another lane: I killed the peer program's dev server.** Port 3000 was held by `next-server` (pid 79615) with cwd `…/.codex/worktrees/agent-people-build/apps/designer-portal`. A `pkill` of mine took it down while I was clearing my own 3100 server. I did not restart it (I do not know that lane's env). I then used 3000 myself and **stopped my server at the end; port 3000 is free.** The people-room lane should be told.

**N-15 — one inline font-size appears in added lines and is not a new §A violation.** `mobile-sheets.tsx` `font-mono text-[26px]` is the pre-existing elapsed clock, re-indented inside the new `heldProjectId ? … : …` ternary — the `-`/`+` pair is a move. No other `text-[Npx]` is added to a component in this wave; the add row moved **off** `text-[11px]` onto `t-meta`.

---

## 3 · Done-when, re-checked by the reviewer

| Plan §4 done-when | Verdict |
|---|---|
| 45-minute call in **5 interactions** from ⌘K with no document open, `SELECT` shows `source='command_bar'` | **✅ carried from r4's driven probe** (`source command_bar`, 45 min, `rate_source none`, `activity NULL`). Re-confirmed structurally this round; qualified by **m-new-3** (Enter inside the authority window is swallowed silently) |
| The same entry dated yesterday lands on **yesterday** (`started_at`) | **✅** SQL case (d) + both jest specs; r4 drove it. Qualified by **m12** |
| An entry dated 31 days back renders the quiet "backdated" mark | **✅** 31-yes / 29-no, on the add row, a written row, the scope rows and the ⌘K form |
| The mobile sheet with nothing held either logs or says why | **✅** by code + four jest cases + r4's 390 drive. Marred by **m9**; not re-driven by me |
| A log-strip entry carries an **explicit** `billable` and prints its reason | **✅ for the value** — seeded from the stored row (`offer.billable`), never `true`; **✗ for the reading at 390 and 1024** — see **M1**. The reason *sentence* is on the ⌘K form and the add row; the strip prints stored provenance, and that provenance is one of the two unreadable words |
| Two tabs → one running row, one offer strip | **✅** at the server (SQL case (b), sequential — **m11**) and at the provider. Not driven with two real browser tabs. Qualified by **m19** |
| *(plan's hours-ledger row)* rate readout on the add row | **Declared absent, accepted** (r2-M1): `resolve_time_rate_cents` is REVOKEd from `authenticated`, so a browser-side figure would be a false fact. Recorded at `hours-ledger.tsx:1096-1102` |
| **r3-M1** the add row at 390 | **✅ re-measured by me** — `Project 46.0..186.0 · Minutes 195.0..335.0 · Date 46.0..186.0 · Activity 195.0..335.0 · Add 46.0..335.0 h=44.0 · pill 46.0..158.8 h=44.0 · fs=12px · h-overflow 0`. At 1440 the plan's five tracks: `381.5..567.2 / 576.2..684.5 / 693.5..832.8 / 841.8..996.5 / 1005.5..1049.5` |
| **r4-M1 + m17** the act waits, her statement stands, a failed read says so | **✅ fixed**, verified by reading all three surfaces and by measuring the disabled window live |
| *(new this round)* the ⌘K form at 390 and 1440 | **✅ measured by me.** @390: panel `18.0..372.0`; Document `41.5..348.5` h=49.5, Minutes `41.5..188.3`, Date `201.8..348.5`, Activity `41.5..348.5`, billable pill `41.5..154.3` h=44.0, `Never mind` `179.7..275.7` h=44.0, `Log it` `284.7..348.5` h=44.0, h-overflow 0. @1440 the same, centred at `490..950`. Every act ≥ 44px, every control inside the viewport at both widths |

---

## 4 · What I did not verify

- **The phone's timer sheet driven by me.** The mobile bar's `More` doorway would not open under my probe at 390; r4 drove and measured it, and four jest cases pin it. HT-14 is accepted on that basis, not on mine.
- **The multi-role arm of HT-41.** No seeded project gives the seeded designer two priceable roles (`rolechip count=0`, which is the correct single-role answer). The chip's appearance is pinned by jest only.
- **`hours.spec.ts` under a working `next dev`** — see **N-13** and **m-new-5**. What I ran was a production build of the same tree; six of the seven cases pass there, one pre-existing case fails, and I cannot tell prod-mode behaviour from regression from here.
- **Two real browser tabs** racing `start_timer`, i.e. `00608`'s retry arm (**m11**).
- **The ledger's per-entry `BillablePill` at 390** — the seeded current week has no entry rows, so only the add row's pill rendered (`billable acts on the sheet @390: 1`). Pinned by jest.
- **A project with an ACTIVE billing authority.** Every seeded project resolves to `no_authority`, so the resolved-billable branch of the pill was never observed with a differing answer.
- **Firefox / WebKit** — every measurement this round was chromium (the e2e file skips the other two by its single-actor pin). **m8** (WebKit `<select>` 21px) therefore stands on r3's record.
- **`pnpm --filter @patina/supabase test`** — not in the wave's gate list; not run.
- **Lint outside designer-portal** — per `patina-verification`, no other package's ESLint config resolves; not claimed either way.
- **Prod** — nothing pushed, deployed, or run against Strata. All SQL and all HTTP ran against the isolated `patina-hours` stack (`127.0.0.1:54421` / `:54422`); the shared 54321/54322 stack was never touched. My throwaway Playwright config, probe scripts and screenshot are deleted, `test-results/` and `playwright-report/` removed, the one probe row deleted (`DELETE 1`), both dev/prod servers stopped, port 3000 free, and `git status` in the worktree is **empty**.
