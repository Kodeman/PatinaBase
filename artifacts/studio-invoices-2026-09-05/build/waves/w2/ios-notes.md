# W2 iOS lane — studio invoices ("the studio · no house")

Worktree: `.codex/worktrees/agent-si-ios`, branch `studio-invoices/w2-ios` (base `studio-invoices/integration` @ `3a54d87432af4f9f6ce9c6a2cab943b3c7ff1656`).
App: `apps/mobile/Patina` (Patina, client). No Capture (Patina Field) changes — this program is designer/client-side only.

## Facts confirmed before editing (discovery §6)

`RemoteInvoice.project_id` and `.project` were already `Optional` (`InvoicesAPIClient.swift`), and `listInvoices()` is an unscoped `.from("invoices")` select — so once the DB/edge lanes ship the RLS policy, studio invoices arrive over the wire with zero decode risk. This lane only needed: carry `title`, fix two display fallbacks, and stop `BudgetViewModel` from silently dropping project-less invoices.

## Delivered (exactly the 3 code changes + tests in the brief)

1. **`Patina/Patina/Services/API/InvoicesAPIClient.swift`**
   - `RemoteInvoice.title: String?` added.
   - `title` added to `listSelect` (`detailSelect` extends `listSelect`, so the detail fetch picks it up too — no separate edit needed there).

2. **`Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:117`** (`contextLine`)
   - `invoice.project?.name ?? "Your project"` → `invoice.project?.name ?? invoice.title ?? "Your studio"`.

3. **`Patina/Patina/Features/Budget/BudgetViewModel.swift`** (`BudgetMath.buildSections`)
   - Added `BudgetMath.studioSection(visibleInvoices:)`: invoices with `project_id == nil` are collected into one extra `BudgetProjectSection` (`id: "studio"`, `name: "From the studio"`, `proposals: []`, `invoices:`, `rollup:` computed over just those invoices, `designerBudgetCents: nil`), appended **last** after the per-project sections. No section is emitted when there are no project-less invoices.
   - Verified `BudgetProjectSectionView`/`BudgetInvoicesBlock` (`BudgetView.swift`, `BudgetBlocks.swift`) need no changes: they render `section.name` as plain text and each invoice row shows only `invoice_number`/status/amount — nothing keys off `section.id` being a real project id or navigates by it. So the "wider change" escape hatch in the brief wasn't needed; full grouping shipped as asked.
   - Naming note: "From the studio" was chosen to match the design intent directly — the proposal deck (`artifacts/studio-invoices-2026-09-05/proposal.html:492,512`) uses that exact phrase for the client-portal letterbox's studio-invoice label. S11 in the same deck had recommended "null-safety only" for iOS v1 and left full Budget placement as an open question (line 753); this lane's brief explicitly asked for the full grouping (not just null-safety), so it was built as instructed — flagging the discrepancy here for the record, not as a blocker.

   > **Superseded in Fix round 1 — see below.** This full-placement Budget section was reverted; the plan's S11 ruling as adopted ("go with your recommendations") is followed literally instead.

## Tests added (round 1, before revert)

- **`PatinaTests/InvoicesMoneyRailTests.swift`**
  - `decodesStudioInvoiceWithTitle()` — a fixture with `project_id: null`, `project: null`, `title: "Kitchen consult — ad hoc"` decodes cleanly; `balanceCents`/`isPayable` unaffected.
  - `contextLineFallsBackToTitleThenYourStudio()` — `SourcePin`-based (matches the file's existing pattern, e.g. `overlayHonoursTheYield`) assertion that `InvoiceDetailView.swift` contains the exact fallback chain `invoice.project?.name ?? invoice.title ?? "Your studio"`. (`contextLine` is a private method on the View struct, not a free function, so this file's established pattern — pinning the source text — is how the neighboring code already tests view-body logic; there was no pure/testable seam to call directly without widening scope.)
  - **Unchanged by the round-1 fix** — these two stay, since items 1 and 2 (title field, detail-view fallback) are the null-safety pieces S11 actually asks for.

- **`PatinaTests/BudgetAggregationTests.swift`** (round 1, since replaced — see Fix round 1)
  - `studioInvoicesFormTheirOwnSectionPlacedLast()` — one project invoice + two studio invoices (one with a title, one paid) → sections are `["P1", "studio"]` in that order; the studio section's `name`, `proposals` (empty), `invoices` (both, in input order), `designerBudgetCents` (nil), and `rollup` (billed/paid/outstanding computed over only the two studio invoices) are all asserted.
  - `noStudioSectionWhenAllInvoicesHaveAProject()` — no `"studio"` section appears when nothing is project-less.
  - `studioOnlyClientStillGetsASection()` — zero projects, one studio invoice → exactly one section, `id == "studio"`.

## Gates run (round 1, this worktree, sim `si-ios`)

- Simulator created for this lane only: `xcrun simctl create si-ios "iPhone 16" com.apple.CoreSimulator.SimRuntime.iOS-26-5` → UDID `F2698D54-6FBC-4C90-9468-E383E8C74E27`. Deleted at end of run (see below).
- `IOS_GATE_UDID=F2698D54-6FBC-4C90-9468-E383E8C74E27 scripts/ios-gate.sh build` — first run hit the documented cold-build x86_64 `SwiftCompile` noise (3 spurious failures on unrelated files); rerun once → `** BUILD SUCCEEDED **`. Compile-green (no device-dependent surfaces touched by this change — invoice/budget rows are plain PostgREST reads, no camera/scan/LiDAR involved).
- `IOS_GATE_UDID=F2698D54-6FBC-4C90-9468-E383E8C74E27 scripts/ios-gate.sh unit` — full `PatinaTests` (Swift Testing), 2472 tests / 271 suites. One failure: `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves()` — the pre-documented load flake (unrelated to this change; nowhere near Invoices/Budget). Reran it alone (`-only-testing:"PatinaTests/CompanionCoachingModelTests/introGate_freshUser_pollsUntilTourResolves()"`) → passed in 0.063s. `InvoicesMoneyRailTests` (all cases incl. the 2 new) and `BudgetAggregationTests` (all cases incl. the 3 new) both reported `passed` as full suites.
- Sim-verified only (no physical device this session) — appropriate for this change: no hardware-dependent surface (camera/scan/RoomPlan/ARKit/LiDAR) was touched, per patina-ios-verification's own guidance that Simulator is sufficient for non-AR UI + data-layer changes.

## Not touched / explicitly out of scope

- No new Swift files (pbxproj unaffected — `Patina.xcodeproj` uses `PBXFileSystemSynchronizedRootGroup`, and nothing was added/removed/renamed).
- `apps/mobile/Capture` (Patina Field): untouched — no invoice reads in that app per the blast-radius doc §6.
- No DB/edge/portal changes — those are other lanes' responsibility per the wave plan.
- `deploySet = []` — iOS ships in the next TestFlight build, not with this program.

## Advisories (round 1)

- None required. The brief's escape hatch ("if the Budget model can't take a project-less section without a wider change, leave as-is") wasn't needed — `BudgetProjectSection`/`BudgetProjectSectionView` already tolerate a synthetic, non-project `id`/`name` with zero further changes.
- Noted above (not blocking): this lane's brief asked for full "From the studio" Budget grouping, while the proposal deck's S11 ruling text had recommended "null-safety only" for iOS v1 and left full placement as an open question. Built per this lane's explicit brief; flagging for whoever reconciles the deck's open-questions list against what actually shipped.

---

## Fix round 1 (adversarial review response, same date)

Two **major** findings came back from an independent review of this lane (`ios-review-r1.md`, committed on this branch at `1e97d0a76`):

1. **w2-ios-1 (plan-fidelity, major, confidence 0.95)** — the "From the studio" Budget section above was full placement of studio invoices in the iOS Budget screen, which is exactly what ruling **S11** (adopted as-recommended per Kody's "go with your recommendations" instruction for this whole program) explicitly defers to a later wave: *"Null-safety only; place in a later wave after the Daily Return / approvals program settles."* The lane brief's item 3 had asked for the fuller grouping, which diverged from the plan's own ruling table — the master ruling wins.

   **Fix applied:** reverted `BudgetMath.buildSections` in `BudgetViewModel.swift` to the pre-lane behavior — project-less invoices are not collected into any section; `orderedIds` is still built from `acceptedProposals.compactMap(\.project_id)` / `visibleInvoices.compactMap(\.project_id)`, so an invoice with `project_id == nil` never enters `orderedIds` and the corresponding `BudgetProjectSection` is never built for it. This is null-safety, not a drop-with-crash-risk: the invoice still decodes cleanly (item 1/2's `title` field and `InvoiceDetailView` fallback are unchanged and unaffected — those are the null-safety pieces S11 actually calls for), it simply contributes no Budget section in this wave, matching S11 literally. Removed the `studioSection(visibleInvoices:)` helper entirely; added an inline comment on the (now unchanged) `orderedIds` construction explaining why project-less invoices are omitted by construction and citing S11.

   **Tests updated** in `PatinaTests/BudgetAggregationTests.swift`: replaced the three studio-section tests with two null-safety tests —
   - `studioInvoiceIsOmittedWithoutCrashing()` — a project invoice plus a studio invoice (with `title`) → `buildSections` returns only the `["P1"]` section; the studio invoice contributes no section, no crash, and the project section's rollup is unaffected by the studio invoice's amount.
   - `studioOnlyClientGetsNoSections()` — a client with only a studio invoice and zero projects → `buildSections` returns `[]` (not a crash, not a synthetic section).

   `InvoicesMoneyRailTests.swift` is unchanged — its two studio-invoice tests (`decodesStudioInvoiceWithTitle`, `contextLineFallsBackToTitleThenYourStudio`) cover exactly the null-safety scope S11 asks for and needed no revision.

2. **w2-ios-2 (missing deliverable, major, confidence 1.0)** — this notes file was written to the main checkout's path (`/Users/kody/Code/patina-merged/artifacts/...`) instead of the worktree's own copy (`.codex/worktrees/agent-si-ios/artifacts/...`), so it was never committed to the lane branch. **Fix applied:** this file now lives at the correct worktree-relative path and is committed here with `git add -f`, as the brief originally required.

### Gates re-run after the fix

See the StructuredOutput report for this fix round for the exact command output; summary: `ios-gate.sh build` → BUILD SUCCEEDED, `ios-gate.sh unit` → full `PatinaTests` suite green except the pre-existing, pre-documented `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` flake (confirmed by isolated rerun), with the two new/updated Budget tests and the two unchanged Invoices tests all passing by name in the raw log.
