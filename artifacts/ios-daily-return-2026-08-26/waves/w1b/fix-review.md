# W1b — Fix-round review (V), separate context

Reviewed commits on `.codex/worktrees/agent-dr-w1b-integration` (head `6d4a0ba5c`):
`565e82ae2` (Companion menu), `6d2317f5e` (seed), `6d4a0ba5c` (browse grid). Read the full diff of
each commit, the surrounding source (`CompanionAreaBuilders.swift`, `CompanionActionRows.swift`,
`CompanionContextProvider.swift`, `RecommendationsView.swift`), and the other two seed files that
insert `auth.users` rows, to check the implementer's claims against the code rather than the report.

## Finding 1 — Companion home menu (crash)

**Mechanical check.** `homeItems(context:)` now builds from one list of five *slots*, each adding
0 or 1 rows:
- `message_designer` — 0/1, gated on `showsMessageDesignerRow` (`designerRelationship?.isLive`)
- `design_request` **or** `your_studio` — 0/1, mutually exclusive (`if/else if`)
- `recommendations` — always 1 (unconditional call, no gate)
- `collections` (Saved) — `collectionsRow(context:)` unconditionally returns non-nil today (SP-12)
- `your_spaces`/`scan` — always 1 (unconditional call; the two labels are the same slot, chosen by
  `roomCount == 0`)

Max = 1+1+1+1+1 = 5. `appendTail` for `.heroFrame` never appends `homeRow()` (screen ==
`.heroFrame` guard) and appends exactly one of `profileRow()`/`signInRow()`. So the cap holds by
construction — 6 max — for every value of every input, not just the inputs a test happens to
enumerate. This is a real fix, not a narrower crash workaround: the previous code had two
hand-built branches (`roomCount == 0` / `> 0`) that each independently added `collectionsRow` and
`showsMessageDesignerRow`'s row without any shared budget, which is exactly how 3 base + 1
(collections) + 1 (message) + 1 (studio/request) + 1 (tail) = 7 happened for
`client@patina.dev`.

**Is the collapse a design, not a silent drop?** Yes. The two rows removed (standalone "Add
another space" scan row, and the home style-quiz row) are named in the code comment above
`homeItems`, in the commit message, and their replacement doors are stated (scanning folds into
the `spacesOrScanRow` slot at zero rooms; the quiz keeps its Daily Room card, the
empty-recommendations hint, and Profile). Two renamed tests
(`quizlessHomeStillNamesTheQuizInTheRecommendationHint`,
`finishedQuizSwapsTheHomeRecommendationHint`) pin that the quiz's absence from Home is intentional
and that its hint text still tells the truth. Nothing was silently dropped.

**Test coverage.** `CompanionHomeMenuMatrixTests.everyHomeContext` walks rooms {0,1,3} ×
designer {nil, `.none`, `.roster`, `.lead`, `.project`} × request {true,false} × tier {nil,
discovering, engaged, activeProject} × saved {0,1,4} × signedIn {true,false} = 720 contexts,
verified by reading the loop nests directly (5×3×2×4×3×2 = 720, matches the report). Five
assertions run over all 720: `<=6` rows, strictly increasing priority rank (a `rank()` table
independently mirrors the intended priority, not the implementation, so it isn't circular), the
Saved door always present, exactly one spaces/scan row with the right route per room count, the
message row present iff `isLive`, exactly one suggested row. This closes exactly the gap the walk
identified (`everyCombination`'s grid had no designer axis) — verified `everyCombination` in
`CompanionActionMatrixTests` now also carries a `designer` axis (`[nil, liveDesigner]`), so the
broader matrix used by other screens exercises it too.

**Canonical labels (C4).** Unchanged by this fix: `"Saved"`, `"Your spaces"`/`"Add your first
space"`, `"Get design help"` (via `designerRow`, unused here — `studioRow()`'s `"Your studio"` was
already the home-menu behavior pre-fix), `"Message your designer"` (W1a's existing label, passed
through unchanged). No label was invented or altered.

**Minor discrepancy, not a defect.** The report says "+5 home-menu cases" toward the 803-vs-796
delta. Counting new `@Test` functions in this commit: `heroFrameWithRoomsAndALiveDesignerFitsTheCap`
(1) + the 5 in `CompanionHomeMenuMatrixTests` = 6 new tests, against 2 renamed (not new) tests.
6 + 2 (browse grid) = 8, not 7 (803−796). Immaterial to correctness — worth a note only because the
report's own arithmetic doesn't reconcile; not a code or coverage problem.

**Verdict: fix addresses the root cause (no shared budget across two hand-built branches),
verified sound by construction and by an appropriately-shaped exhaustive test.**

## Finding 2 — Seed (sign-in)

`supabase/seed/leads_room_scans.sql` is the only file changed. Diff adds
`confirmation_token, recovery_token, email_change_token_new, email_change` to the column list and
`''` × 4 to all six `VALUES` rows (h1–h6) — every seeded homeowner in this file, not just
`james.okafor`. Confirmed independently:
- `leads_room_scans.sql` is wired into both `sql_paths` entries in `supabase/config.toml`.
- The other two files that `INSERT INTO auth.users` (`dev-accounts.sql`, which seeds
  `client@patina.dev` — the walk's account that *could* sign in — and
  `cloudflare-phase1-staging.sql`) already list `confirmation_token, recovery_token, …` in their
  column lists, corroborating the report's "it was the only seed that didn't."
- Nothing else in the file or elsewhere touched.

**Verdict: covers every seeded row in the affected file, scoped correctly, no unrelated changes.**

## Finding 3 — Browse grid (mismatched card frames / hit-boxes)

Both named causes are addressed at the mechanism the walk pointed at, not a coordinate patch:
1. `.contentShape([.interaction, .accessibility], RoundedRectangle(cornerRadius: 14, style:
   .continuous))` on the card's `Button`, plus `.accessibilityHidden(true)` on the decorative
   photo. This directly answers the walk's finding — `accessibilityElement(children: .combine)`
   was unioning the photo's uncropped-geometry frame (FILL without `.clipped()` affecting AX
   bounds) into the card. Naming an explicit shape for both interaction and accessibility removes
   that union as a source of frame truth.
2. `.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)` added to
   `productCardLabel`'s outer `VStack` (image + info), applied *before* `.background`/`.clipShape`
   — so the visible card (not just its Button target) now fills whatever height `LazyVGrid` gives
   the row, top-aligned, rather than leaving its intrinsic (shorter, when no rationale) height to
   be centered by the grid.

Read the full before/after: only `RecommendationsView.swift` and the new `BrowseGridContractTests`
changed; `BrowseCardInfo` is a mechanical extraction of the same text block (unchanged content) so
it can be measured off-screen — not a behavior change.

**Test-pin gap (the one real finding of this review).** The two new tests
(`cardTextHeightDoesNotFollowNameLength`, `cardTextHeightDoesNotFollowRationaleOrMissingMaker`)
measure only `BrowseCardInfo`'s intrinsic height under varying text inputs (long name, long
rationale, missing maker) — an invariant that was **already true before this fix** (the pre-existing
`lineLimit(2, reservesSpace: true)` clamps on name/rationale predate this commit; they weren't
what broke). Neither test exercises the two things that actually were broken and actually got
fixed: (a) whether the card's accessibility/interaction frame now equals its visible rounded-rect
bounds (the `.contentShape` fix), or (b) whether two cards in the same grid row — one with a
rationale, one without — end up the same *outer* frame height once laid out in a real
`LazyVGrid` (the `.frame(maxHeight: .infinity)` fix). The `rationale: nil` vs `rationale:
non-nil` case, the one directly tied to cause 2, is never compared against each other in the new
tests — every call in `cardTextHeightDoesNotFollowNameLength` uses the default `rationale: nil`,
and `cardTextHeightDoesNotFollowRationaleOrMissingMaker` compares two *non-nil* rationale strings,
never nil vs non-nil.

Practical consequence: if a future edit dropped the `.contentShape` modifier, or changed
`.frame(maxHeight: .infinity)` back to no frame (or `maxHeight: nil`), on `productCardLabel`, this
test suite would stay green — it never touches either modifier or lays the card out inside an
actual grid row alongside a shorter neighbour. The regression protection for this specific bug is
currently the walker's manual `describe_screen` AX-frame measurement (real, and reported
convincingly — all ten cards' frames converge to `w:171, h:262.33` after the fix, per the commit
message and the fix-round report), not an automated test. That manual check is not repeatable by
CI.

**Severity/confidence:** MEDIUM confidence this is worth fixing before calling the plank durably
closed, LOW-to-MEDIUM severity — the fix itself is verified correct by direct code reading and by
the walker's own before/after simulator measurements (not merely re-asserted from the report), so
nothing is currently broken; the gap is regression protection going forward, not a live defect.
Not blocking, since C8/the wave's gate doesn't require every plank to carry an automated UI-layout
test and the sim evidence is genuine — but worth a follow-up test (e.g., a snapshot or an
`XCUIElement.frame` assertion in a UI test, or at minimum a test asserting the two SwiftUI
modifiers are present) before this plank is considered permanently pinned.

**Verdict: fix addresses the actual causes (verified by reading the code, not just the report);
the automated test added is real but pins an adjacent, previously-true invariant rather than the
two modifiers that were the actual fix.**

## Cross-cutting checks

- **Pathspec commits, no unrelated changes:** `git show --name-only` on each commit lists exactly
  the files named in each commit message (2 files each) — confirmed directly, not from the report.
  `git status --short` on the worktree head is clean (the `.env*` "Operation not permitted" lines
  are sandbox read-denial noise on files the worktree never touched, not uncommitted changes).
- **Scope vs. rulings-fable.md:** confirmed none of the eight open items in `rulings-fable.md` bear
  on these three commits (items 1/6/8 are W2/W3 carry-overs; items 2–5, 7 are backend/legal/product
  items untouched here).
- **`.writer.lock.d` released**, worktree at `6d4a0ba5c` (matches the implementer's report), nothing
  to reconcile.
- **Gate claims:** not independently re-run (out of scope for a read-only review context per the
  brief), but the commits, diffs, and test-file contents are internally consistent with what the
  report describes having run.

## Summary

| # | Finding | Root cause fixed? | Design vs. silent drop | Test coverage | Verdict |
|---|---|---|---|---|---|
| 1 | Companion crash | Yes — shared budget, cap holds by construction | Design, documented + pinned | Exhaustive (720 contexts), closes the exact grid hole | Sound |
| 2 | Seed sign-in | Yes — every affected row, right file | N/A | Not independently re-run this round (already deno/pgTAP-covered per report) but scope verified correct by diff + cross-file comparison | Sound |
| 3 | Browse grid | Yes — both causes addressed at mechanism | N/A (bug fix) | **Gap**: new tests pin an adjacent invariant, not the two modifiers that are the actual fix | Correct fix, weak regression pin (MEDIUM, non-blocking) |

No blocking findings. One medium/non-blocking finding (Finding 3's test-pin gap) worth a follow-up
task, not a fix-round bounce.
