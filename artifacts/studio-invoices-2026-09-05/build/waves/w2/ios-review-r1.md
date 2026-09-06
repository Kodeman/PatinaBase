# W2 iOS lane — adversarial review, round 1

Reviewer: separate context, did not write this code. Verdict below is mine; findings are reported with severity + confidence, unfiltered, per the reviewer brief.

## Scope checked

- Diff: `git -C <wt> diff 3a54d87432af4f9f6ce9c6a2cab943b3c7ff1656...HEAD` (single commit `c849e49d1`, branch `studio-invoices/w2-ios`, confirmed via `git branch --show-current` before review).
- Files touched: `InvoicesAPIClient.swift`, `InvoiceDetailView.swift`, `BudgetViewModel.swift`, `BudgetAggregationTests.swift`, `InvoicesMoneyRailTests.swift`. No pbxproj change (no new files — confirmed with `git diff --stat -- apps/mobile/Patina/Patina.xcodeproj` → empty).
- Cross-checked against: the approved plan (`middle-west-studio-would-snazzy-whisper.md`, rulings S1–S12), `04-blast-radius.md` §6, and `proposal.html` (S11 entry, line 645, line 753).
- Built and ran full `PatinaTests` on a freshly created simulator (`si-ios-review`, iPhone 16 / iOS 26.5, UDID `C9119BC5-C25D-47E5-A84C-E15B3768E1C5`), deleted at the end of this review.

## Item-by-item

1. **`title` on `RemoteInvoice` + `listSelect`** — done. `detailSelect` extends `listSelect`, so the detail fetch inherits `title` with no separate edit needed, as the note claims. Verified by reading the file directly (`InvoicesAPIClient.swift:91,183-186,190`). ✅ matches brief item 1.
2. **`InvoiceDetailView.swift` context-line fallback** — `invoice.project?.name ?? invoice.title ?? "Your studio"`, exact chain the brief specified, capitalization matches the pre-existing `"Your project"` convention it replaced. ✅ matches brief item 2.
3. **`BudgetViewModel` studio section** — implemented as a `studioSection(visibleInvoices:)` helper appended last to `buildSections`, `id: "studio"`, `name: "From the studio"`, correct rollup scoping (only project-less invoices), `designerBudgetCents: nil`. Renders through the existing `BudgetProjectSectionView`, which the lane verified needs no changes (I spot-checked `BudgetBlocks.swift` — no code keys off `section.id` being a real project id, no badge/count is added next to `section.name`). Functionally correct and well-tested. **But see Finding 1 — this is off-plan.**
4. **Tests** — `InvoicesMoneyRailTests.decodesStudioInvoiceWithTitle` and `.contextLineFallsBackToTitleThenYourStudio`, plus three new `BudgetAggregationTests` cases, all present and, per my own gate run, all green. The `SourcePin`-based test for the private `contextLine` method matches the file's own established pattern (other `SourcePin.read`-based tests already exist across the suite) — not a new anti-pattern.

## Gates (run by me, this session)

```
xcrun simctl create si-ios-review "iPhone 16" com.apple.CoreSimulator.SimRuntime.iOS-26-5
→ C9119BC5-C25D-47E5-A84C-E15B3768E1C5

IOS_GATE_UDID=C9119BC5-... scripts/ios-gate.sh build
→ ** BUILD SUCCEEDED ** (first attempt, no rerun needed)

IOS_GATE_UDID=C9119BC5-... scripts/ios-gate.sh unit
→ 2472 tests / 271 suites. 1 failure:
    CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves()
  — this is the documented known flake named in the brief, unrelated to
  Invoices/Budget. All 5 new studio-invoice tests confirmed PASS by name in
  the raw log:
    ✔ "a studio invoice (no project) decodes cleanly and carries its title" passed after 1.144s
    ✔ "the detail context line falls back to the invoice's title, then "Your studio", when there is no project" passed after 1.144s
    ✔ "invoices with no project are grouped into one 'From the studio' section, placed last" passed after 1.147s
    ✔ "no studio section appears when every visible invoice has a project" passed after 1.147s
    ✔ "a client with only a studio invoice (no house at all) still gets one section" passed after 1.156s

xcrun simctl delete C9119BC5-... (cleaned up)
```

No gate failures attributable to this change.

## Findings

### Finding 1 — off-plan: full Budget placement built against ruling S11 (major, confidence 0.95)

The approved plan's ruling table is explicit:

> **S11 — iOS.** Null-safety only in v1 vs full placement in the iOS Invoices list → **Recommendation: Null-safety only; place in a later wave after the Daily Return / approvals program settles.**

The proposal deck (`proposal.html:689`) states the same recommendation in its own words ("Null-safety only. The decoder already tolerates a null project; full placement waits for the approvals and Daily Return programs to settle") and, separately, lists "Placement in the iOS Budget (S11)" as a Wave-4 **idea** (line 645) and as an explicitly **open, unresolved question** — "Whether the iOS Budget should show studio invoices, and under what heading, given the Budget groups by house (S11)" (line 753).

Kody's ruling for this program was "go with your recommendations" — every S1–S12 recommendation adopted **as written**. S11's recommendation is "null-safety only," with full placement (which the deck's own text treats the Budget section as part of) explicitly deferred to a later wave. This lane's diff ships exactly the deferred behavior: a new, fully-functional "From the studio" Budget section, not merely null-safety (which would have meant e.g. just not crashing / not silently losing money from the rollup, without necessarily surfacing a whole new section this wave).

This is not a code-quality defect — the section is correctly built, correctly scoped, and well tested — but it is off-plan against a ruling Kody explicitly approved. The lane's own `ios-notes.md` (§"Naming note", not committed — see Finding 2) discloses this honestly and attributes it to the lane brief explicitly asking for the fuller grouping rather than the null-safety-only path. I'm reporting it here because the shipped artifact still diverges from the approved plan regardless of which document (lane brief vs. master plan) is at fault, and the orchestrator should decide whether to keep the section, gate it, or revert to null-safety-only to match S11 exactly.

Note for completeness: this is low-risk to revert if the ruling should be honored literally — reverting to "drop project-less invoices from Budget" (the `compactMap` behavior before this change) is a small diff, or the new section can simply be left in place if the orchestrator decides the ruling's "later wave" language was over-cautious given how trivial the safe implementation turned out to be. I'm not asserting which way to resolve it — only that it is a real deviation from the ruling as written.

### Finding 2 — required deliverable not committed to the lane branch (major, confidence 1.0)

The brief required: "Write `/Users/kody/Code/patina-merged/artifacts/studio-invoices-2026-09-05/build/waves/w2/ios-notes.md` and `git add -f` it."

The file exists on disk, but only under the **main checkout** (`/Users/kody/Code/patina-merged/artifacts/...`), not under the **worktree's own copy** of that path (`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-ios/artifacts/...`, which is a materially different physical directory — worktrees do not share untracked/gitignored files). Evidence:

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-ios log --oneline --all -- '**/ios-notes.md'
(no output)

$ git -C /Users/kody/Code/patina-merged log --oneline --all -- artifacts/studio-invoices-2026-09-05/build/waves/w2/ios-notes.md
(no output)

$ git -C /Users/kody/Code/patina-merged status --porcelain --ignored -- artifacts/studio-invoices-2026-09-05/build/waves/w2/ios-notes.md
!! artifacts/studio-invoices-2026-09-05/build/

$ find /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-ios/artifacts/studio-invoices-2026-09-05/build/waves/w2
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-ios/artifacts/studio-invoices-2026-09-05/build/waves/w2
(empty — no files under it before this review added one)
```

The commit `c849e49d1` on the lane branch touches only the 5 Swift files — no `artifacts/` path. So the required lane doc was never actually version-controlled anywhere; it's sitting as an orphaned file in the main checkout that the next `git status` there will keep reporting as ignored/untracked. Zero functional impact (the code shipped is correct regardless), but it is a straightforward brief-compliance miss, and it means whoever integrates this lane's branch won't see the lane's own documentation of what it did and why, including the S11 disclosure in Finding 1 above.

### Finding 3 — advisory: `InvoiceListView` row silently drops the title for studio invoices (minor / advisory, confidence 0.9)

`InvoiceListView.swift:148` shows the project name only `if let projectName = invoice.project?.name, !projectName.isEmpty`. For a studio invoice (`project == nil`), that condition is false, so the list row shows no secondary line at all — the invoice's `title` (e.g. "Kitchen consult — ad hoc") never appears in the list, only in the detail view. This isn't a bug (no blank text, no crash, no wrong data) and it's outside the brief's explicit scope (blast radius §6 names only `InvoiceDetailView.swift:117`), so I'm not marking it a blocker — if anything it's arguably *more* consistent with S11's "null-safety only" instinct than Finding 1 is. Flagging only so the orchestrator can decide if it's an acceptable v1 gap or worth a follow-up.

## Verdict

No blocker, no red gate, no money-path or RLS defect, no vision-refusal violation in any string added. Two **major** findings: one is a genuine off-plan scope expansion against an explicit Kody-approved ruling (S11), the other is a missed brief requirement (uncommitted lane documentation) with zero functional impact. Recommend the orchestrator decide on Finding 1 (keep the studio Budget section vs. revert to null-safety-only per S11) before this lane merges, and have the ios-notes.md content actually committed to the branch (or accept this review's paste of it as the record).

**ship** is defensible on pure code-quality/test-quality grounds (nothing is broken, everything asked for in the literal brief is delivered and gated green) but the plan-fidelity gap in Finding 1 means this should go back to whoever owns the ruling before merge, not merge silently as-is.
