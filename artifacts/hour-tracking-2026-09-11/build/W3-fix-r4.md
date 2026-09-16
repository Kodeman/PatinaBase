# W3 — fix, round 4

**Scope taken:** the single assigned finding, **W3-R4-M1** (major, three surfaces), fixed together with **W3-R4-m17** as the brief directs — they are the same expression. Nothing else in `W3-review-r4.md` was touched; the 18 remaining minors and 12 notes are re-listed at the end unchanged.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`, branch `hour-tracking/portal`.
Commit **`c13ec3e08`** — `fix(time): the act waits for the answer it writes, and her statement stands`. Pushed (`26b34125d..c13ec3e08`).

**The finding is accepted in full.** Both halves reproduce by reading, and both are pinned by falsifying jest cases below. Nothing was skipped or disputed.

---

## 1 · What was wrong, restated from the code

Two independent defects sharing one cause — `intent.isSettled` was consulted by the *seed*, and by nothing else.

**(a) The act outran the answer.** `valid` (`log-time-sheet.tsx:137-141`), `addValid` (`hours-ledger.tsx:427-432`) and the phone's `valid` (`mobile-sheets.tsx:1177-1178`) required a project, a day and minutes. None required a settled authority. With minutes already typed, picking a document made the act live immediately; a submit in that window wrote the fail-closed default `billable = false` whatever the agreement said, under a pill that read like a resolved answer because `reason={intent.isSettled ? … : null}` suppressed the only thing that would have shown it was not.

**(b) Her tap was thrown away.** `seededFor.current = projectId` is written **inside** the settle branch, so during the pending window the slot is unclaimed. A tap then set `billable`, and the late seed overwrote it — the exact opposite of `log-time-sheet.tsx:88-91`'s own comment, and of HT-11.

**(m17, same expression.** `isSettled` was `Boolean(projectId) && !authority.isLoading`, so a *failed* read counted as an answer and printed `non-billable · no agreement` — a fact about the document that the browser never obtained.)

## 2 · What the fix is

| | |
|---|---|
| `time-capture.tsx:36-70` | `useBillableIntent` now consults `authority.isError`: `isSettled = projectId && !isLoading && !isError`, plus a new `unreadable` field and one shared sentence `BILLABLE_INTENT_UNREADABLE = 'agreement not read · state it yourself'`. `authority.isError` joins the `useMemo` deps |
| ×3 surfaces | `statedFor` — the document she last **stated** billable about (`useState<string \| null>`), set by the pill's `onChange` through a `stateBillable(next)` wrapper, cleared by an effect keyed on the project id and (⌘K) on reopen. `billableStated = Boolean(projectId) && statedFor === projectId` |
| ×3 seed effects | `if (billableStated) return;` **before** the `seededFor` check, and `billableStated` added to the deps. A late answer can no longer overwrite a stated one |
| ×3 acts | `valid` / `addValid` / `valid` gain `(intent.isSettled \|\| billableStated)` |
| ×3 pills | `reason={intent.isSettled \|\| intent.unreadable ? intent.sentence : null}` — so a failed read says what actually happened instead of saying nothing |

**Two deliberate deviations from the report's literal fix, both stated rather than hidden:**

1. **`statedFor` is state keyed on the project, not a bare `touched` ref.** The report's ref cannot participate in `valid` (a ref change does not re-render), and a ref reset "on project change" still mis-attributes a statement across an A → B → A return. Keying the statement to the document it was made about fixes both, and is the same two lines per surface.
2. **The gate is `(isSettled || billableStated)`, not `isSettled` alone.** This is forced by folding m17 in: once `isError` makes `isSettled` false, `isSettled` alone would leave a failed authority read permanently disabling the act on all three surfaces with no way forward — a new blocker traded for the old one. Her own statement *is* an answer under HT-11, so the act opens on it. Nothing is ever written without a stated or resolved answer; the fail-closed posture is unchanged.

`seededFor` is kept alongside `statedFor` — it still does its own job (one seed per document per read).

**The row-level `BillablePill` at `hours-ledger.tsx:1740` was deliberately not touched**: it commits an edit to a written row, is not seeded from `intent`, and carries no act to gate.

## 3 · Tests — three new cases, every one a proven falsifier

Each affected suite's `useProjectBillingAuthority` mock became a mutable `mockAuthority` (`{ data, isLoading, isError }`, reset in `beforeEach`) so the pending window is *driven*, not assumed.

| Suite | Case |
|---|---|
| `__tests__/command-bar-log-time.test.tsx` | **"waits for the authority read, and keeps the answer she states meanwhile (HT-11)"** — read in flight: no reason printed, `Log it` **disabled**; tap the pill → reads `Billable`, `Log it` **enabled**; settle the read (which says non-billable) → the reason appears and the pill **still reads `Billable`**; submit → `mockCreate` called with `billable: true` |
| `__tests__/command-bar-log-time.test.tsx` | **"does not report a failed authority read as 'no agreement' (W3-R4-m17)"** — `isError`: `non-billable · no agreement` **absent**, `agreement not read · state it yourself` **present**, `Log it` disabled; one tap on the pill re-enables it |
| `__tests__/hours-ledger-add-row.test.tsx` | the same shape on `Add` |
| `__tests__/mobile-sheets.test.tsx` | the same shape on `Add entry` (via `manualLog`) |

**Falsifiers, run three ways, each restored afterwards:**

```
A · gate neutralised  ((isSettled || stated) → true, all 3 surfaces)
    → 4 failed / 26 passed — exactly the 3 new M1 cases + the m17 case
B · seed guard removed  (`if (billableStated) return;` deleted, all 3)
    → 3 failed / 27 passed — exactly the 3 new M1 cases ("kept the answer" half)
C · isError handling reverted  (unreadable=false, isSettled ignores isError)
    → 1 failed / 29 passed — exactly the m17 case
restored → 30 passed / 30
```

## 4 · Gates

| Gate | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --dir <wt> --filter @patina/designer-portal test` | **578 suites passed / 578 · 7360 tests passed / 7360 · 1 snapshot** (r4 baseline 578 / 7356 — the four new cases) |
| `pnpm --dir <wt> --filter @patina/designer-portal lint` | **✖ 201 problems (0 errors, 201 warnings)** — byte-for-byte the r4 baseline; all pre-existing `Unused eslint-disable directive`, none from a touched file |
| falsifiers A / B / C | as tabled in §3 |
| `git show --stat c13ec3e08` re-read | 7 files, +311 / −19, all under `apps/designer-portal/src/components/document`. `supabase/config.toml` not staged (it is not in the tree's modified set at all) |

**Not run, and why:**

* `pnpm --filter @patina/admin-portal build` (§0.24's gate after a `packages/*` edit) — this round touches **no** `packages/*` file. Whole diff is seven files under `apps/designer-portal`.
* `supabase db reset` + SQL suites, `db:generate`, `generate-legacy-grants.py` — no migration, no SQL, no seed, no generated type changed (`00608`, `database.types.ts`, `00-legacy-grants.sql` all untouched), so §0.19 / §0.20 have nothing to regenerate.
* `test:e2e` — **deliberately skipped, and the reason is a hazard the orchestrator should carry.** Port 3000 is currently held by **another lane's** dev server (`lsof -nP -iTCP:3000 -sTCP:LISTEN` → node pid 79615), and N-7 still stands: `playwright.config.ts`'s `webServer` hard-codes `NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321` (the **peer program's** stack) with `reuseExistingServer`. Running `test:e2e` cold from here would either drive the peer's stack or drive another lane's server — evidence worse than none. No e2e-visible surface changed: no selector, no route, no copy on the settled path.

## 5 · 390 / 1440

**No layout is touched, and that is measured rather than asserted:** `git diff` over the four component files contains **zero** `className` lines, added or removed (`git diff … | grep -iE '^[+-].*classname'` → no matches). The only new pixels are a different *string* in the reason slot on a failed read, and that slot is the existing `<span className="min-w-0 truncate …">` inside `<span className="inline-flex min-w-0 items-center gap-2">` inside the already-wrapping `flex flex-wrap items-center gap-x-3 gap-y-1` row — `min-w-0` + `truncate` makes the rendered width independent of the string's length, which is the same mechanism that already contains `non-billable · no agreement` (measured at 390 and 1440 in round 3, re-measured by the reviewer in round 4: `BillablePill x=46.0..158.8 h=44.0`, `h-overflow = 0`). A live 390/1440 pass was therefore not taken this round; port 3000 was unavailable (see §4) and there was no layout delta to put in front of it.

## 6 · Left open, by design, for the orchestrator

Not in this round's assignment; none is disputed.

* **Minors carried forward unfixed:** m1 (`WHEN OTHERS` in the SQL refusal cases), m2 (`isDayValue` accepts `2026-02-31`), m3 (strip says "that document"), m4 (server stop applies no R64 bound / emits no `time_timer_stopped`), m5 (`start_timer` dead-ends on a raw `unique_violation`), m6 (HT-25 seating sentence vs a non-priceable seat), m7–m14 as listed in `W3-review-r4.md`, m15 (three statements of non-billable per row), m16 (`RateRoleMark`'s per-project reads), m18 (`mintEntryId()` inside `mutationFn`), m19 (`hold` replaces an offer strip). **m17 is CLOSED by this round.**
* **Rulings owed** (unchanged): N-3 (two pre-existing red RLS suites, still no `KNOWN_FAILURES.md`), N-4 (pickers filter to `status === 'active'`), N-5 (forward-dating unbounded and unmarked), m10's timezone question, m15's three-way redundancy.
* **New copy introduced, worth a glance:** `agreement not read · state it yourself`. It is the only new sentence in the wave and it appears only when the authority read fails.
* **N-7 stands for W4–W7**, and bit this round: `playwright.config.ts` points `webServer` at the peer program's `:54321` stack, and port 3000 is contended across lanes.
