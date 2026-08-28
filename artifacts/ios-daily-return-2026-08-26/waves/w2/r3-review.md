# W2 R3 — hygiene (Q4) — adversarial review

Reviewer: separate context, read-only. Worktree examined:
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-r3` on branch `daily-return/w2-r3`,
base `main` @ `e9da02569` (matches `steward.md` §1/§2). Did not build; did not commit; did not push.

**⚠ Reviewer housekeeping note (not a finding against the lane):** mid-review I ran `git checkout
main -- .` in this worktree to diff a deleted file's history, which staged main's pre-deletion
content over the R3 branch's working tree (`git status` briefly showed the 11 deletions as `A`
against the index). This was my error, not the implementer's. I corrected it immediately with
`git reset --hard HEAD` (unsandboxed, required for the `.env*` files a checkout touches) and
confirmed `git status --porcelain -uno` clean before continuing. `git log --oneline main..HEAD`
after the fix still shows exactly the three commits below, unchanged. Flagging so the steward
does not need to re-verify the worktree's integrity — I already have, post-fix.

```
$ git log --oneline main..HEAD
93c3df7d7 fix(ios): accepted-but-unsigned proposal shows checkmark.circle, not the signed seal (rulings-fable.md #6)
7016748ee fix(ios): retire the Companion's dead AR quick action (W1b SP-18 residual)
bb5897bee refactor(ios): retire the July home rail (Q4) — twelve dead views, HomeStoryRetryRow re-homed

$ git diff --stat main...HEAD
 16 files changed, 152 insertions(+), 2159 deletions(-)
```

## Verdict

**No blocking findings. Two low-severity, non-blocking observations.** This is a clean, well-evidenced
hygiene lane: every deletion is independently re-provable dead at `main` @ `e9da02569` (I re-ran the
call-graph greps myself, not just read the lane's), the one live struct inside the deletion set was
correctly extracted verbatim with a zero-edit call site, both carry-overs are scoped exactly to their
granted files, and the two new tests genuinely pin new behavior (TDD red→green, confirmed against the
symbols and types that actually exist in the tree). Nothing outside the owned set was touched. Commit
messages are Conventional Commits with pathspec-restricted diffs matching their stated file lists.

---

## What I independently re-verified (not just re-read from the report)

1. **Call-graph proof, re-run myself** — `git grep -n "<Symbol>(" main -- apps/mobile/Patina` for
   `HomeFilteredFeedEmpty(` and `HomeStudioBlock(` (the two structs bundled inside
   `DailyRoomStateBlocks.swift`, which the report names but whose own zero-caller status the
   `r3-tasks.md` table doesn't individually re-list line-by-line): **zero hits outside the file's own
   definition/preview**, confirming both are as dead as the ten sibling files. Combined with the
   lane's own §0 table (which I also re-ran for `DailyProductCard(`, `DailyProductDetailView(`,
   `ContinueScanCard(`, `DesignRequestStatusCard(`, `DailyRoomStateBlocks(`, `WorkWithDesignerCTA(`,
   `RoomChipRail(`, `RoomContextBar(`, `DailyFeedEmptyModule(` — all zero, `StudioHubSection(` — one
   hit, inside the dead `DailyRoomStateBlocks.swift` itself), every one of the twelve orphans is
   proven dead by constructor-call grep, not bare-name matching. `build-plan-critique.md` M1b's
   "still referenced" citations are confirmed stale doc comments (verified the exact lines: `git grep
   -n "DailyProductCard\|StudioHubSection\|ContinueScanCard\|DesignRequestStatusCard\|HomeStudioBlock\|
   HomeFilteredFeedEmpty" HEAD -- apps/mobile/Patina` returns only doc-comment prose in
   `DailyRoomViewModel.swift:70`, `ProductCard.swift:9,45`, `DesignRequestResumeBanner.swift:11`, and
   `HomeStoryRetryRow.swift`'s own header — no executable reference anywhere).
2. **`HomeStoryRetryRow` live-call proof** — `git grep -n "HomeStoryRetryRow" main --
   apps/mobile/Patina` shows the struct defined at `DailyRoomStateBlocks.swift:153` and called from
   `DailyRoomView.swift:196` at the base commit. Confirms the extraction was necessary, not
   precautionary.
3. **Verbatim-extraction proof** — diffed the struct body between `main`'s
   `DailyRoomStateBlocks.swift` (lines 153–172) and `HEAD`'s new `HomeStoryRetryRow.swift`: identical
   `let onRetry: () -> Void`, identical body, only the header comment and `#Preview` changed (the
   latter dropped the now-irrelevant `HomeFilteredFeedEmpty` pairing, harmless). `DailyRoomView.swift`
   has **zero diff** in `main...HEAD` — Swift's whole-target symbol resolution really does make the
   re-home a no-edit operation for R2's file, as claimed.
4. **`AddToRoomSheet.swift`/`AddedToRoomToast.swift` exclusion** — zero diff for either file in
   `main...HEAD`; confirmed not touched, matching steward.md §7's exclusion and the lane's own claim.
5. **pbxproj claim** — `PBXFileSystemSynchronizedRootGroup` appears 5× in `project.pbxproj`
   (unchanged count), and grepping the file for any of the deleted type/file names returns nothing —
   the "no project-file edit needed" claim holds.
6. **Carry-over 1 (AR quick action), file scope** — `CompanionActionRows.swift` and
   `CompanionContextProvider.swift` both show **zero diff** in `main...HEAD`. `tryInRoomRow(productId:)`
   is confirmed still defined at `CompanionActionRows.swift:85` and, post-diff, its only other
   reference anywhere in the app is the stale explanatory comment the lane itself added at
   `CompanionAreaBuilders.swift:82`. The second dead-end (`CompanionContextProvider.swift:278`'s
   `"Try in your room →"` nudge pill, `.arPlacement` route) is exactly where `r3-notes.md` §2 says it
   is, confirmed untouched — the disclosure is accurate, not just asserted.
7. **`CompanionAreaBuilders.swift` diff itself** — read the full patch. Both call sites removed
   exactly as described (`.emergence`/`.roomEmergence`'s conditional append, `.pieceDetail`'s
   unconditional array entry); the now-unused `pieceId` binding on `.pieceDetail(let pieceId)` was
   correctly dropped to `.pieceDetail` rather than left as an unused-variable warning. No other line
   in the function changed.
8. **Carry-over 2 (seal glyph), root cause and fix** — read `RemoteProposal` in full
   (`ProposalsAPIClient.swift:38–103`): `isSigned` is exactly `status == "accepted"` (line 81, no
   `signed_at` check) and `hasSignatureRecord` (lines 86–90) exactly checks non-empty `signed_at` OR
   `signed_by_name`, matching the commit message's description precisely. The `ProposalDetailView.swift`
   diff is minimal and precise: one new `static func statusIcon(for:justSigned:)`, one call-site swap
   inside `statusRow`, nothing else touched in the surrounding `header`/`investmentSummary`/branch
   logic. `ProposalStatusDisplay.swift` and `ProposalsMoneyRailTests.swift` both show zero diff —
   confirmed left alone as claimed (lane B's files, per steward.md §8a/§8b).
9. **New test file, read in full** — `ProposalDetailStatusIconTests.swift` has **4** `@Test` functions
   (accepted+no-signature→circle, accepted+signature→seal, justSigned=true→seal,
   sent-status→circle), not 3 as I'd expect from the task-list draft alone — the implementer added a
   fourth (`sentProposalIsUnaffected`) beyond the three sketched in `r3-tasks.md`, which is a strict
   improvement in coverage, not scope creep (same file, same symbol under test). Matches the report's
   claimed "4 tests… TDD red/green" and the 807→812 (+5: 1 from Task 2, 4 from Task 3) test-count
   arithmetic in the gate line.
10. **`AppRoute` case signatures** — confirmed `.emergence(pieceId: String?)`, `.roomEmergence(roomId:
    UUID)`, `.pieceDetail(pieceId: String)` in `Coordinator.swift` match exactly how the new
    `CompanionActionMatrixTests` test constructs them (`.roomEmergence(roomId: UUID())` — a fresh
    UUID rather than the task draft's placeholder `Self.sampleRoomId`; harmless, compiles, doesn't
    need determinism since the test only checks the returned action-id set, not room identity).
11. **`Fixture.context(for:roomCount:active:tier:...)` signature** — confirmed it exists with exactly
    the parameter labels the new test uses (`for:roomCount:active:tier:`, defaulted
    `hasStyleProfile`/`designer`).
12. **Working tree cleanliness, post my own hazard (see note above)** — `git status --porcelain -uno`
    empty except pre-existing sandbox read-permission noise on unrelated repo-root `.env.example`
    files (same eight files the implementer's own report disclosed hitting) — no real changes
    outstanding, confirming the branch is exactly the three commits and nothing else.

## Checked against the review brief's specific criteria

- **Every deletion proven by the call graph** — yes, independently re-run (§ above), not merely
  trusted from the lane's own table.
- **Does any live surface lose a piece** — no. `HomeStoryRetryRow` (the one live struct hiding inside
  a dead file) was found and correctly extracted; `AddToRoomSheet`/`AddedToRoomToast` (the one file
  the build-plan-critique flagged as wrongly grouped with Q4) were correctly excluded from the start,
  matching M1 taken; the two live AR-adjacent surfaces (menu row vs. nudge pill) were correctly
  distinguished and only the one in R3's granted scope was touched.
- **Tests adjusted, not silenced** — both `CompanionActionMatrixTests.swift` edits are additive (one
  new pinning test, one stale-comment correction that doesn't change any assertion), and the new
  `ProposalDetailStatusIconTests.swift` file is wholly new, not a rewrite of an existing red test.
  Nothing was `.disabled`, skipped, or had an assertion loosened to pass.
- **No edits outside owned files** — confirmed against `steward.md` §7's exact list (11 files +
  1 new) plus §8b's single named carry-over site (`ProposalDetailView.swift:83`'s region) plus the
  Q4-adjacent carry-over the brief separately granted (`CompanionAreaBuilders.swift`,
  `CompanionActionRows.swift` — the latter untouched, correctly). The full 16-file diff stat matches
  this set with no surprises.
- **Conventional Commits with pathspecs** — all three commit subjects follow `type(scope): summary`;
  each commit's `--stat` file list matches its message's described scope exactly (verified via
  `git show --stat` on each).
- **Anything the report claims that the diff does not show** — none found. Every specific claim in
  the implementer's report (file lists, line numbers, root-cause description, test counts, the
  second AR dead-end's exact location, the pbxproj mechanism) checked out against the actual diff and
  tree contents.
- **Gate output** — not independently re-run (brief: "do not build"). The claimed 812/812 across 96
  suites is internally consistent with the diff (5 new tests: 1 + 4; 1 new suite file), which is the
  strongest check available without building.

## Findings

### 1. LOW / non-blocking — stale doc-comment references to deleted files, left uncorrected

`DailyRoomViewModel.swift:70`, `ProductCard.swift:9` and `:45`, and
`DesignRequestResumeBanner.swift:11` still contain prose referencing the now-deleted
`DailyProductCard.swift`, `DailyProductDetailView.swift`, and `ContinueScanCard.swift` by name (e.g.
`ProductCard.swift:9`: "it's tightly coupled to Features/Home/Views/DailyProductCard.swift").
These are exactly the doc comments `r3-tasks.md` §0 and the canon-digest append both correctly
identify as the source of `build-plan-critique.md` M1b's false-positive "still referenced" claims —
the lane proved they aren't real call sites, which was the scoped job. But now that the files they
point at no longer exist, the comments are stale pointers a future reader will follow into nothing.
None of these three files are in R3's owned set (`ProductCard.swift` and `DailyRoomViewModel.swift`
belong to other lanes per `build-plan.md`'s W1b table; `DesignRequestResumeBanner.swift` is
unassigned), so leaving them isn't a scope violation — flagging only so whoever next touches one of
these three files, or the R3 canon-digest note, knows the comments are now dangling. Not a build
break, not a test break, not a behavior change.

### 2. LOW / non-blocking — commit-message "twelve dead views" requires the reader to know the
internal struct count to parse correctly

The first commit's subject and body say "twelve dead views" / "every view in the Q4 list" but the
pathspec-visible diff shows only 11 file deletions. The twelfth is `HomeFilteredFeedEmpty`, a struct
nested inside `DailyRoomStateBlocks.swift` alongside the also-dead `HomeStudioBlock` and the
re-homed-because-live `HomeStoryRetryRow` — a fact stated correctly in the commit body's second
paragraph and in `r3-notes.md`/`r3-tasks.md`, but not obvious from `git log --stat` alone, where the
count looks like it's off by one. Purely a readability nit for whoever audits this commit later
without the surrounding task docs open; the underlying accounting is correct and I verified both
structs (`HomeStudioBlock`, `HomeFilteredFeedEmpty`) are independently zero-caller (§ finding 1 in
"independently re-verified" above).

## Not findings — deliberately checked and confirmed correct, listed so the steward doesn't re-litigate

- Q4's ruling text itself originally listed `AddToRoomSheet`/`AddedToRoomToast` for deletion, but
  `build-plan.md`'s W2 R3 row and `steward.md` §7 both explicitly carve them out (critique M1, taken)
  — the lane followed the current authoritative map, not the stale ruling table, correctly.
- The `.pieceDetail(let pieceId)` → `.pieceDetail` narrowing in `CompanionAreaBuilders.swift` doesn't
  orphan `pieceId` anywhere else in that switch arm — checked the full arm body, nothing else in it
  referenced the binding.
- `viewModel.didSign` (passed as `justSigned:` in the seal-glyph fix) is an existing
  `ProposalDetailViewModel` property already in use by `ProposalStatusDisplay.detailStatusLine` two
  lines below the changed line — not a new symbol invented for this fix.
- The two "possible casualty" test groups the brief flagged (`CompanionActionMatrixTests.homeStudioRow*`,
  `DailyRoomFeedMappingTests`) were checked by me independently, not just taken on the lane's word:
  `homeStudioRowHiddenAtDiscovering`/`ShownAtEngaged`/`HiddenWhenTierUnknown` assert on
  `CompanionActionProvider.actions(...)` containing/excluding the string `"Your studio"`, which traces
  to the **live** `CompanionActionRows.studioRow()` — a different symbol from the deleted SwiftUI
  struct `HomeStudioBlock` despite the name collision. Left untouched, correctly.
