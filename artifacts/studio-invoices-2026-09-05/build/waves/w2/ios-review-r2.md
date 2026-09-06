# W2 iOS lane — adversarial review, round 2

Reviewer: separate context; did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-ios` (`git rev-parse --show-toplevel` confirmed), branch `studio-invoices/w2-ios`.
Range reviewed: `3a54d87432af4f9f6ce9c6a2cab943b3c7ff1656..HEAD` (`6176ea4b2`, `1e97d0a76`, `c849e49d1`).

## Gates I ran myself

Simulator created for this review: `xcrun simctl create si-ios-r2 "iPhone 16" com.apple.CoreSimulator.SimRuntime.iOS-26-5` → `A9579B23-4C3A-4CA9-84DB-EF80BCBE1DC4` (deleted at the end).

| Command | Result |
|---|---|
| `IOS_GATE_UDID=A9579B23-… apps/mobile/Patina/scripts/ios-gate.sh build` | `** BUILD SUCCEEDED **` (first run, no rerun needed) |
| `IOS_GATE_UDID=A9579B23-… apps/mobile/Patina/scripts/ios-gate.sh unit` | `Test run with 2471 tests in 271 suites failed after 12.228 seconds with 3 issues (including 2 known issues).` — sole failure `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves()` |
| isolated rerun of that test | `✔ Test run with 1 test in 1 suite passed after 0.061 seconds.` → the documented load flake, not a lane regression |
| `-only-testing:PatinaTests/BudgetAggregationTests -only-testing:PatinaTests/InvoicesMoneyRailTests` | `✔ Test run with 37 tests in 2 suites passed after 0.013 seconds.` — all four new studio-invoice tests named and green |

Claim level: **compile-green + sim-verified**. No device pass (no camera/scan/LiDAR surface touched — plain PostgREST reads).

## Round-1 findings — status

- **w2-ios-1 (Budget full placement violated S11) — FIXED, and the fix is right.** `6176ea4b2` reverted `BudgetMath.buildSections` to base behaviour; `git diff` on `BudgetViewModel.swift` across the whole range is now **comment-only** (+9 lines). The deck's own S11 option text settles it: `proposal.html:689` — *"Null-safety plus a title fallback only · full placement in the Invoices list **and Budget**" → "**Null-safety only.**"* — and `proposal.html:645` lists *"Placement in the iOS Budget (S11)"* as a Wave-4 idea. `plan:187` / `proposal.html:666` name "invisible … in the iOS Budget" as the accepted v1 outcome. The revert matches the ruling Kody adopted.
- **w2-ios-2 (notes file orphaned in the main checkout) — FIXED.** `git log --oneline -- artifacts/studio-invoices-2026-09-05/build/waves/w2/ios-notes.md` → `6176ea4b2`. Tracked on the lane branch, `git add -f`'d as required.
- **w2-ios-3 (Invoices list row shows no name for a studio invoice) — NOT fixed.** Still open, and it now has a sibling (`StudioQueueBuilder.swift:171`). See ios-r2-3.

## New findings this round

### ios-r2-1 — major (0.9) — the Budget headline totals count studio invoices that no section on the screen accounts for

`BudgetViewModel.swift:221` `self.summary = BudgetMath.rollup(invoices ?? [])` rolls over **every** invoice the client can see; `BudgetMath.rollup` (`:44-51`) filters only `draft`/`void`, never `project_id`. `buildSections` (`:99, :118`) keys strictly on non-nil `project_id`, so a studio invoice contributes to the headline and to **no** section. `BudgetView.swift:59-62` renders `BudgetSummaryCard(summary:)` above `ForEach(viewModel.sections)`.

Provable from the lane's own fixture: `studioInvoiceIsOmittedWithoutCrashing` asserts `sections.map(\.id) == ["P1"]` and `sections.first?.rollup.billedCents == 10_000` for an array that also holds a 40 000-cent studio invoice — `BudgetMath.rollup` over that same array is **50 000**. A homeowner with one house and one studio invoice therefore reads "Billed 500.00" up top and 100.00 in the only section below, with 400.00 unaccounted for anywhere on the screen.

This is not pre-existing: before `00571_studio_invoices.sql:48` dropped `invoices.project_id NOT NULL`, no visible invoice could have a nil `project_id`. The new client policy `invoices_household_select` (`00571:1268-1274`, `client_id = auth.uid() AND status <> 'draft'`) plus the unscoped `listInvoices()` (`InvoicesAPIClient.swift:204-212`) is exactly what makes it reachable. "Null-safety only" is not satisfied by a headline that silently absorbs money the screen never shows.

Minimal in-scope fix: roll the summary from the same set the sections use — `BudgetMath.rollup((invoices ?? []).filter { $0.project_id != nil })` — plus one `BudgetAggregationTests` case asserting headline == sum of section rollups when a studio invoice is present. (The zero-house case already reads correctly: `sections.isEmpty` → `BudgetView.swift:56` empty state, summary card not rendered.)

### ios-r2-2 — minor (1.0) — brief item 3 is intentionally not delivered; the plan supports that, so record it rather than flipping it back

The lane brief item 3 asked for a "From the studio" Budget section and gated the escape hatch on the model being unable to take one. That precondition is false (round 1 shipped the section, and it worked), so item 3 as literally written is undelivered. But the plan's S11 — adopted as recommended — rules the opposite, and the deck's option text (`proposal.html:689`) names *Budget* explicitly. The brief diverged from the plan; the plan wins. Needs one line of orchestrator acknowledgement so this does not oscillate a third time. **Recommendation: accept the current state.**

### ios-r2-3 — minor (1.0) — two homeowner surfaces still render a studio invoice with no name

- `InvoiceListView.swift:148` `if let projectName = invoice.project?.name, !projectName.isEmpty { … }` — false for a studio invoice, so the row is status + invoice number + amount with no identifying line.
- `StudioQueueBuilder.swift:163-171` maps every `isPayable` invoice with `detail: invoice.project?.name` — nil for a studio invoice, so the Studio Queue row is likewise nameless.

Discovery `04-blast-radius.md:135` classified both as merely "nil-tolerant" (no crash), which is true. But S11's chosen option is worded "**Null-safety plus a title fallback** only", S12 calls the title "the only thing that names the letter", and `plan:187` promises studio invoices "always appear in … the iOS invoice list". A nameless row is a weak version of that promise. Two one-line `?? invoice.title` additions would close it inside S11's own wording.

### ios-r2-4 — minor (0.6) — the new fallback chain can label a *project* invoice "Your studio"

`InvoiceDetailView.swift:119` `invoice.project?.name ?? invoice.title ?? "Your studio"`. A project-bound invoice whose `project` embed comes back null (the new `invoices_household_select` policy is keyed on `client_id` alone and does not require the client to be able to SELECT the project row) has `title == nil` (`00571:60` — "NULL on a project-bound invoice"), so it reads "Your studio · from …" for a house invoice. The old code read "Your project" there. Safer: `?? (invoice.project_id == nil ? "Your studio" : "Your project")`.

### ios-r2-5 — nit (1.0) — the S11 comment sits after the `return` it describes

`BudgetViewModel.swift:131-139`: the nine-line comment is placed *after* `return orderedIds.compactMap { … }`, at the end of `buildSections`, while describing the `orderedIds` walk at `:97-101`. `ios-notes.md` claims it was "added … on the (now unchanged) `orderedIds` construction". Compiles fine; move it above `:97` so it reads where it applies.

### ios-r2-6 — nit (0.8) — "Your studio" vs the client page's "From the studio"

The client-portal design intent for the same money says *"From the studio · not for a house"* / *"From the studio"* (`proposal.html:492, 512`). "Your studio" puts a possessive on a studio the homeowner does not own. In practice unreachable for well-formed rows (S12 makes `title` required and `00571:888-889` enforces it in the RPC), so this only ever shows in the ios-r2-4 path. No vision refusal is violated (no badge, chip, colour-status, checkmark, emoji, "AI", "gate", "task", "dashboard", "overdue"); money formatting untouched.

### ios-r2-7 — minor (0.85) — the build now hard-depends on `00571` being on Strata

`listSelect` requests `title` (`InvoicesAPIClient.swift:189`). PostgREST rejects a select naming an unknown column, so a TestFlight build carrying this change that reaches a database without `00571` would 400 the entire invoice list *and* the Budget screen's invoice source, not just lose the title. `deploySet = []` and the program ships DB first, so the ordering is right — but the TestFlight runbook should state "00571 on Strata before this build goes out". No column-level grants exist on `invoices` (`grep "GRANT SELECT[[:space:]]*(" supabase/migrations/*.sql | grep -i invoice` → no hits), so nothing else gates the column.

### ios-r2-8 — nit (1.0) — stale count in the notes

`ios-notes.md` records "2472 tests / 271 suites"; the round-2 tree runs **2471** (round 2 removed one Budget test net). Cosmetic.

## Things I checked that are clean

- `RemoteInvoice.title` is `String?` and every other field is optional; `grep -rn "RemoteInvoice("` → **0** memberwise-init call sites, so no compile fallout. Doc comment ("Always nil for project-scoped invoices") matches `COMMENT ON COLUMN public.invoices.title` (`00571:60`).
- `detailSelect` is `listSelect + …` (`InvoicesAPIClient.swift:194-195`), so the detail fetch picks `title` up — no second edit needed, as the notes claim.
- No money math changed: `rollup`, `balanceCents`, `isVisible` are byte-identical to base; no cents/float conversion introduced; no status writes anywhere in the diff.
- No new Swift files → `project.pbxproj` untouched (correct for Patina's `PBXFileSystemSynchronizedRootGroup` target).
- `git status --porcelain` clean (only sandbox "Operation not permitted" reads on `.env.example` files, which the reviewer never touched). Nothing under `.claude/`, `.agents/`, hooks, settings or `.env` in the range. `Capture` untouched.
- No supabase stack command was run by this review.

## Verdict

**fix** — one major (ios-r2-1). No blocker: every brief item is either delivered or deliberately superseded by the plan's own S11 ruling (ios-r2-2), gates are green, and no money-path, RLS or copy refusal is violated.
