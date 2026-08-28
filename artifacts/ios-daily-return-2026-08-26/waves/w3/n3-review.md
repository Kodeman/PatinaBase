# W3 · lane N3 review — the Companion in the bar, and the tour rewrite

Reviewer: separate context, read-only. Verified against `daily-return/w3-n1...HEAD` diff in
`.codex/worktrees/agent-dr-w3-n3`, `waves/w3/n3-tasks.md`, `n3-notes.md`, `n3-sanity-copy.md`,
`direction-b.md` §8 (B-1/B-2/B-7/B-8 verbatim) and §2, `build-plan.md` W3, `build-plan-critique.md`
B7/B8/M18, and the actual source (`CompanionOverlay.swift`, `HouseFirstRoot.swift`,
`FirstLaunchTour.swift`, `DailyRoomView.swift`, `CompanionSafeArea.swift`, `PatinaTabBar.swift`,
`AppCoordinator.swift`, `DailyGreetingHeader.swift`, `SourcePin.swift`, `SourceScan.swift`, the new/
edited test files).

**Overall:** the code is correct, the tests genuinely pin the claimed behavior (verified by reading
the pinned literals against the real source, including exact indentation), and the report is
unusually honest — every cross-lane edit, every unowned file, every known gap and every ruling taken
is disclosed with its cost, rather than being buried or silently "fixed." The one item that needed
escalating is a real spec/acceptance-criterion conflict, and N3 already surfaced it and called it
reversible — this review confirms it is real and elevates it because the walker/orchestrator brief
explicitly asks whether the flag-off root is untouched.

---

## Findings

### 1. MAJOR — the tour rewrite reaches the flag-off root, contradicting B-8's own "Rollback" clause and W3's stated acceptance line
**Confidence: high (verified in diff + disclosed by N3 itself). Severity: major (needs a ruling, not obviously a defect).**

`direction-b.md` §8, B-8's *Rollback* clause states verbatim: *"the tour is gated by the same
`house-first` flag as the root it describes."* `build-plan.md`'s W3 acceptance line states: *"flag
off restores the W2 root byte-for-byte."*

N3 shipped `FirstLaunchTourModel.defaultSteps` (the rewritten copy, the new `.todayRecord` anchor,
the retirement of the dead `.addToRoom` step) **unconditionally** — not branched on
`FeatureFlags.shared.isOn(.houseFirst)`. `DailyRoomView.swift`, which hosts the tour model in
`@State` and is mounted as the `.today` root on *both* the flag-on and flag-off roots (confirmed:
`HouseFirstRoot.root(for:)` returns `DailyRoomView()` for `.today`; the flag-off root also uses
`DailyRoomView`), now runs the new three-step tour with the new copy and the new `.todayRecord`
anchor for **every** user, flag on or off. Verified against the base: before N3's commit,
`defaultSteps` still said *"This is your Daily Room — picks and stories chosen for your space"* —
i.e. this is a change to what main (post-W2, pre-W3) already shipped, made inside a wave whose own
acceptance line promises the flag-off path is untouched.

N3 discloses this as a **deliberate, reasoned ruling** (`n3-tasks.md` §2, `n3-notes.md` §4b): every
sentence B-8 replaces is equally wrong on the flag-off root too (the "Daily Room" name B-7(c) retires
outright, the dead `.addToRoom` anchor, the same `DailyGreetingHeader.studioControl` step-3 target),
so branching would leave flag-off first-launch users being told about a screen that no longer has
that name. That is a defensible product argument — but it is still a **verified deviation from a
literal, written rollback contract and a written acceptance criterion**, taken unilaterally rather
than escalated before shipping. N3 does flag it explicitly ("RULING TAKEN, REVERSIBLE... one commit
to reverse") and even names the exact revert (`DailyRoomView.swift:46`, a second `defaultSteps` array
+ a `steps:` argument) — so this is not hidden, but it is real, and it is the kind of thing that
should have gone to Fable/Kody as a question before merge, not as a fait accompli in the report.

**Additional gap on top of the ruling itself:** the tour's new behavior was sim-verified only on the
**flag-on** root (shots `w3-n3-06/-07/-08`, explicitly captioned "flag on, tour state cleared"). No
shot exists of the rewritten tour running on the **flag-off** root. The claim that it "still runs
correctly there" rests on code-path reasoning (same shared `DailyRoomView`, same anchors present on
both roots per W1a's Studio-control fallback) rather than an observed run — worth a spot-check before
this is treated as flag-off-safe.

**Recommendation:** Fable rules on whether this is accepted as-is (in which case B-8's Rollback
clause and W3's acceptance line should be amended to say so explicitly) or reverted to a
flag-branched tour. Either way this is a five-minute ruling, not a rework — N3 already did the harder
part of building both the argument and the revert path.

### 2. MINOR — B-8's step 3 delivers the copy but not the anchor B-8 literally describes
**Confidence: high (verified in diff). Severity: minor — disclosed, reversible, does not block correctness.**

B-8 says step 3 "re-points at the **Studio** tab." What ships is B-8's exact sentence
(*"Your studio — projects, proposals, invoices and files"*, verbatim match confirmed against
`direction-b.md`), still anchored on `DailyGreetingHeader.studioControl` — the header pill inside
`DailyRoomView`, not a popover physically anchored to `PatinaTabBar`'s Studio item. N3's reasoning is
sound and verified: `FirstLaunchTour`'s model lives in `DailyRoomView`'s own `@State`/environment
subtree, and `HouseFirstRoot`'s bar is a sibling of that subtree — reaching the bar item requires
hoisting the tour model above the four stacks (a `HouseFirstRoot.swift` + `PatinaTabBar.swift`
change), one of which is N1's explicitly closed file. Correctly scoped out of this lane, correctly
named as a cost for whoever owns those files (`n3-notes.md` §2b), with the exact anchor line ready to
drop in. No action needed from this lane; worth tracking as a follow-up if Fable wants the literal
tab-anchored popover.

### 3. Real release-gating issue, correctly attributed to content ops, not this lane's code
**Confidence: high (verified: `FirstLaunchTourPopoverCard.resolvedBody` is `loaded?.body ?? step.fallback?.body`). Severity: high, but out of scope for N3 to fix.**

Every tour step currently renders stale Sanity CMS copy (including the retired "Daily Room" sentence)
because the CMS documents were never edited — the app's rewritten copy exists correctly as the
fallback and is what `FirstLaunchTourTests` correctly pins, but Sanity wins at runtime until three
documents are hand-edited (`waves/w3/n3-sanity-copy.md` gives the exact edits, keys unchanged). This
is a genuine pre-ship gate — flagging so it isn't lost — but it is Kody's action item, not a code
defect in this branch, and N3 is right not to have tried to route around it in code.

### 4. Disclosed cross-lane edits — reviewed, both are narrow and justified
**Confidence: high. Severity: informational.**

- `Features/Navigation/HouseFirstRoot.swift` (N1's file) — `companionSlot` only, verified as the
  *sole* change to that file (turns the mark into a `Button`, adds `.accessibilityLabel("Companion")`
  / `.accessibilityHint`). This is N1's own pre-written patch (`n1-notes.md` §2a step 3), and N1's
  lane is closed. Applying it here is reasonable — the alternative (a dead mark plus a note) would
  have made `HouseFirstRootTests.theCompanionSlotOpensThePanelOrIsNotAControl` pass vacuously via its
  `!slotTogglesTheFlag` disjunct instead of its meaningful one. Verified directly against the test
  source: with N3's change, the pin now passes through `overlayObservesTheFlag` (the real assertion),
  not the escape hatch. `PatinaTabBar.swift` (N1's other, explicitly closed file) is untouched —
  confirmed by the diff stat.
- `PatinaTests/InvoicesMoneyRailTests.swift` (W1b lane B's file) — `overlayHonoursTheYield` pinned a
  literal source string that B-2 necessarily widens (`yieldsToPinnedFooter(for: screen)` →
  `yieldsToPinnedFooter(for:houseFirst:)`, confirmed the new signature exists in
  `CompanionSafeArea.swift:87` with a default parameter so every other W1b caller is untouched). The
  updated pin was checked byte-for-byte against the real source's indentation and matches. The
  ordering guarantee the test exists to protect (yield resolves before the nudge) is preserved and
  now additionally asserts the root is what gets passed. This is a legitimate, minimal pin update,
  not a behavior change smuggled through another lane's test.

### 5. Unowned file edited — process note, not a defect
**Confidence: high. Severity: informational.**

`Features/Home/Views/DailyRoomView.swift` is in no W3 lane's owned file set (confirmed against
`build-plan.md`'s W1b/W2 tables — it's W2 R2's file, and W3's lane table doesn't list
`Features/Home/**` for N1/N2/N3). N3's edit is exactly five lines — the
`.firstLaunchTourAnchor(.todayRecord)` modifier on `HouseRecordCard`, verified as the only change to
this file — and is necessary for B-8's step 2 to have anywhere to mount. Correctly disclosed
(`n3-notes.md` §3a) as a file that now wants changes from three separate lanes with no assigned
owner. No functional concern; a housekeeping item for the steward.

### 6. Pre-existing defect re-observed, correctly not "fixed" out of scope
**Confidence: high (matches N1's own prior note, and the mechanism is real). Severity: informational.**

`DailyRoomView.swift:46`'s `canAutoStart: coordinator.navigationPath.isEmpty` is permanently true on
the house-first root (that path is never populated there), so the first-launch tour can auto-start
while a different tab is on screen. N3 observed this live during its walk, named it as N1's §3c
finding coming true, proposed no fix (correctly — it isn't this lane's file to change under its own
task list), and restated N1's proposed fix. This is good practice, not a gap in N3's own work.

---

## What checked out cleanly

- **B-2 mechanics** — `displayMode`'s ordering (`.expanded` resolves before the house-first
  retirement check; verified the `if state.isExpanded { return .expanded }` guard precedes the
  `.hidden` branch in the actual source, matching `CompanionBarSlotTests.theRetirementCannotSwallowTheExpandedPanel`).
  Because the `.hidden` branch fires for *every* non-expanded state on the house-first root, the
  `.resting`/`.nudging`/`.journeyMode`/`.minimal` branches are provably dead code on that root — which
  is exactly the retirement B-2 calls for, and `expandedBottomLift`'s `28`-pt branch (never combined
  with the bar's `itemHeight` add) is therefore only ever reached on the flag-off root, where nothing
  changed. No bug here; the geometry math is correct on inspection, not just on the reported shot.
- **`yieldsToPinnedFooter(for:houseFirst:)`** — confirmed the one-argument callers (W1b's, elsewhere)
  are unaffected by the `houseFirst: Bool = false` default; N3's overlay is the only call site passing
  the new argument.
- **C8 (Companion contract)** — `AppCoordinator.swift` and `PatinaTabBar.swift` are absent from the
  diff entirely (confirmed via `git diff --stat`), so `handleIntent`/`handleIntentWithResponse` and
  the ≤6-row composition are provably untouched, not just asserted untouched.
- **B-7 tab labels / VoiceOver** — the fifth VoiceOver name ("Companion") is added exactly where M1
  §6 calls for it; canonical names for the four tabs are outside this lane's files and untouched.
- **Test suite naming correction** — verified `CompanionHomeMenuMatrixTests` does not exist anywhere
  under `PatinaTests/`; `CompanionActionMatrixTests` is the real suite, confirmed present.
- **`everyDefaultStepAnchorHasExactlyOneProductionMount`** — this is a real regression test for the
  actual defect class the whole rewrite responds to (a step whose anchor mounts zero times). Verified
  it scans with comments stripped (`SourceScan.code`, a pre-existing, untouched helper) so it isn't
  fooled by the doc comments in `HouseFirstRoot.swift`/`n1-notes.md` that also mention
  `.todayRecord`.
- **Git hygiene** — worktree clean, two commits only, matches the reported log exactly, base is
  `daily-return/w3-n1` as briefed, no `git add -A` markers (each commit's file list is exactly what
  the task list said it would touch plus the two disclosed cross-lane files).
