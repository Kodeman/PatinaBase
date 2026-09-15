# W3 — fix, round 3

**Scope taken:** every **blocker/major** in `W3-review-r3.md` (0 blockers, 2 majors) — **W3-R3-M1** and **W3-R3-M2** — plus the one minor the M1 fix cannot honestly leave behind, **W3-R3-m6** (house-sheet §A on the row being rebuilt). The remaining 16 minors and the 11 notes were **not** in this round's assignment and are untouched; they are listed at the end so the next round can see what is still open and who owns it.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`, branch `hour-tracking/portal`.
Commit **`<see §4>`** — `fix(time): a date the member actually named, and an add row that fits a phone`.

---

## 1 · W3-R3-M1 — the add row at 390

**Applied exactly as the report's Fix describes.**

| | |
|---|---|
| `hours-ledger.tsx:1013` | `grid grid-cols-2 items-center gap-2 min-[700px]:grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto]` — two columns until there is room for the plan's five tracks |
| `hours-ledger.tsx:1066` | the `Add` act takes `className="col-span-2 min-[700px]:col-span-1"` |
| `hours-ledger.tsx:114` | one `ADD_FIELD_CLASS` for the four fields, carrying `w-full min-w-0` |

`min-w-0` is the half of the fix that does the work on WebKit and the half the report named second ("the Date input a real width on webkit"). Every track's `min-width` was `auto` = min-content, so `fr` could not shrink them; with `min-w-0` a track may fall below its field's intrinsic width and the field fills it.

`min-[700px]:` is already in this app's vocabulary (`min-[360px]` … `min-[1440px]` across `src`), so nothing new had to reach the JIT.

### Measured, before committing, chromium **and** webkit

Dev server started by hand on **:3000** from this worktree against `http://127.0.0.1:54421` with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` (port 3000 was free; killed afterwards, 3000 free again). Boxes read off the live DOM, not asserted from CSS.

```
chromium @390   cols "140px 140px"    container 289px   doc.scrollWidth 390 = viewport
  Project  x46..186  w140 h50 fs12px
  Minutes  x195..335 w140 h50 fs12px
  Date     x46..186  w140 h50 fs12px      ← was x383..504, off-screen
  Activity x195..335 w140 h50 fs12px
  Add      x46..335  w289 h44 fs12px      ← was x639..683, off-screen
webkit  @390   cols "140px 140px"    container 289px   doc.scrollWidth 390 = viewport
  Date     x46..186  w140 h50            ← was a 0px track with a 20px input
  Add      x46..335  w289 h44
chromium @1440  cols "185.7 108.3 139.3 154.7 44.0"  container 668px  — the plan's five tracks, unchanged
webkit  @1440  cols "188.5 110.0 141.4 157.1 44.0"  container 677px  — likewise
```

Every add-row field now begins at x ≥ 0 and ends at x ≤ viewport at both widths on both engines, and the page still does not scroll sideways.

**Pinned so it cannot go back**: `e2e/document/hours.spec.ts`'s existing per-width case (1440 / 1024 / 390) now asserts the Date field is in the viewport, is wider than 40px, and that both it and the `Add` act end inside the viewport.

**Falsifier proven, not assumed.** With the row temporarily restored to its pre-fix classes the 390 case fails on the real defect — `Expected: <= 390 / Received: 431` for the `Add` act's right edge — and passes again once restored. (In *this* seed the Date field alone stayed just inside 390 under the old classes, because the `Document…` select's min-content width depends on the seeded project names; the `Add` assertion is what carries the case here. Both assertions are kept — the reviewer's own measurement had Date at x=383 on a different seed.)

**One thing the fix does not reach, stated rather than hidden.** On WebKit the two `<select>`s still render **21px** tall despite `min-h-11`: Safari's `menulist` appearance locks a select's box and ignores `min-height`. That is pre-existing across the portal (every `min-h-11` select behaves the same on WebKit) and would take `appearance-none` — a visual decision about losing the native chevron, portal-wide — to change. The date `<input>` and the `Add` act, the two controls the findings are about, measure 50px and 44px on WebKit. Flagged, not silently fixed.

---

## 2 · W3-R3-M2 — a cleared date is no longer "today"

**Applied exactly as the report's Fix describes**, one predicate in each of the two expressions (the phone sheet carries no date field — confirmed: `grep 'type="date"'` across `src/components` returns the add row and the ⌘K form and nothing else in the time surfaces).

| | |
|---|---|
| `time-capture.tsx:242-252` | `isDayValue(value)` — `/^\d{4}-\d{2}-\d{2}$/`, exported beside `isoDateValue` / `startedAtFromDateValue`, with the reason in its doc comment |
| `log-time-sheet.tsx:135-141` | `valid = Boolean(projectId) && isDayValue(date) && Number.isFinite(parsed) && parsed >= 1` |
| `hours-ledger.tsx:427-432` | `addValid = addProject && isDayValue(addDate) && Number.isFinite(parsedAdd) && parsedAdd >= 1` |

No new copy, no new control: `Log it` / `Add` simply stand disabled while the field is empty. `startedAtFromDateValue`'s `now` fallback is left in place — it is still the right answer for a genuinely malformed value that no longer has a door to arrive through.

**Two new cases, and both are proven falsifiers.** With `isDayValue` neutralised to `|| true`, exactly these two fail; with it restored, both pass.

* `hours-ledger-add-row.test.tsx` — "will not add an hour while the date field is empty (HT-13)": `Add` is enabled with a project and minutes, goes **disabled** the moment the date is cleared, and a click on it never reaches `mockCreate`.
* `command-bar-log-time.test.tsx` — "will not log an hour while the date field is empty (HT-13)": the same shape on `Log it`.

Enter-to-submit is covered too: `submit()` / `batchAdd()` both open with `if (!valid …) return`, so the form's `onSubmit` cannot route around the disabled act.

---

## 3 · W3-R3-m6 — taken, because M1 rebuilds the row it is about

The report's own Fix offered two branches ("move the add row onto the type scale + `min-h-11` in one pass (naturally paired with M1's responsive fix), or record the exemption"). The first branch is taken, because the brief's hard rules make §A binding on **every new or changed control** and M1 changes all four.

`ADD_FIELD_CLASS` replaces `text-[11px]` with `t-meta` (the house sheet's 12px values step) and adds `min-h-11`. Measured: `font-size: 12px` and **50px** tall on chromium and WebKit for the date input, against 34 / 36 / 32px and 11px before. The three sibling fields move with it — a 12px field beside three 11px ones in the same row would be worse than either.

Scope held: **no other `text-[11px]` in `hours-ledger.tsx` was touched.** The file carries ~10 more outside this row; they belong to the house-sheet sweep, not to this fix.

---

## 4 · Gates

| Gate | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir <wt> --filter @patina/designer-portal test` | **578 suites passed / 578 · 7356 tests passed / 7356 · 1 snapshot** (base 578 / 7354 — the two new cases) |
| `pnpm --dir <wt> --filter @patina/designer-portal lint` | **✖ 201 problems (0 errors, 201 warnings)** — byte-for-byte the reviewer's r3 baseline; all pre-existing `Unused eslint-disable directive`, none from a touched file |
| `… test:e2e -- e2e/document/hours.spec.ts` (`DATA_MODE=live`, :54421) | **7 passed · 14 skipped**, including all three width cases carrying the new add-row assertions |
| ad-hoc geometry spec, chromium + webkit, 390 + 1440 | passed on both engines; numbers in §1. Spec deleted after measuring; `test-results/` and `playwright-report/` removed |
| falsifier check, M1 | pre-fix classes → 390 case **fails** (`Add` right edge 431 > 390) |
| falsifier check, M2 | `isDayValue` neutralised → exactly the two new cases **fail** |

**Not run, and why:** `pnpm --filter @patina/admin-portal build` (§0.24's gate after a `packages/*` edit) — this round touches **no** `packages/*` file; the whole diff is five files under `apps/designer-portal`. `supabase db reset` + the SQL suites — no migration, no SQL, no seed and no generated type changed this round (`00608` untouched, `database.types.ts` untouched, `supabase/seed/00-legacy-grants.sql` untouched, so §0.19 / §0.20 have nothing to regenerate). `supabase/config.toml` was never staged.

---

## 5 · Files

```
apps/designer-portal/src/components/document/time-capture.tsx                       +13
apps/designer-portal/src/components/document/hours-ledger.tsx                       +27 −8
apps/designer-portal/src/components/document/log-time-sheet.tsx                     +9  −1
apps/designer-portal/src/components/document/__tests__/hours-ledger-add-row.test.tsx +26
apps/designer-portal/src/components/document/__tests__/command-bar-log-time.test.tsx +24
apps/designer-portal/e2e/document/hours.spec.ts                                     +18 −1
```

---

## 6 · Left open, by design, for the orchestrator

Not in this round's assignment; none of them is disputed.

* **Unfixed minors carried forward:** m1 (strip says "that document"), m2 (server stop applies no R64 bound / emits no `time_timer_stopped`), m3 (`start_timer` dead-ends on a raw `unique_violation`), m4 (the HT-25 seating sentence vs a non-priceable seat), m5 (no focus trap / restore on the Log time dialog), m7 (mobile sheet keeps state and re-shows a stale refusal), m8 (weak `objectContaining` negative), m9 (SQL case (b) sequential, retry arm uncovered), m10 (named local day vs UTC bucket), m11 (`rateRole` not cleared on document change), m12 (the bare-`t` "where" copy), m13 (three statements of non-billable per row — the report itself calls this an orchestrator call), m14 (`RateRoleMark`'s per-project reads), m15 (`useBillableIntent` cannot see `isError`), m16 (`mintEntryId()` inside `mutationFn`), m17 (`hold` replaces an offer strip).
* **m6's residue:** the WebKit `<select>` 21px box described in §1.
* **Rulings owed** (unchanged): N-3 (two pre-existing red RLS suites, still no `KNOWN_FAILURES.md`), N-4 (pickers filter to `status === 'active'`), N-5 (forward-dating unbounded and unmarked), m10's timezone question, m13's three-way redundancy.
* **N-7's hazard stands for W4–W7:** `playwright.config.ts`'s `webServer` hard-codes `NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321` (the peer program's stack) with `reuseExistingServer`. This round was safe because my own server held :3000 against `:54421`; a lane that runs `test:e2e` cold will drive the peer's stack.
