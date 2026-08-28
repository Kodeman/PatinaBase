# W3 · lane N3 — notes for the other lanes, the steward, and Fable

Written by N3 after its gate and sim check, 2026-08-27. Branch `daily-return/w3-n3`, based on
`daily-return/w3-n1` @ `b101f5009`. Everything below is either a cross-lane edit N3 took, or
something N3 found and does **not** own.

---

## 1. The one cross-lane edit N3 took, and why

**`Features/Navigation/HouseFirstRoot.swift` — N1's file — `companionSlot` only.**

N1 wrote the patch out itself (`n1-notes.md` §2a step 3: *"send N1 these two lines and N1 restores
the slot's button"*) and offered to apply it. N1's lane is closed, and the deliverable is a
Companion the user can actually open from the bar, so N3 applied N1's own lines rather than shipping
a dead mark and a note. The diff is `companionSlot` and nothing else — no stack, no bar, no
destination dispatcher, no `PatinaTabBar.swift` (§2c's closed file, untouched).

The safety ordering N1 identified is respected and now pinned: the overlay observes
`isCompanionExpanded` **first** (`CompanionBarSlotTests.theOverlayObservesTheFlagTheBarSlotWrites`),
so `HouseFirstRootTests.theCompanionSlotOpensThePanelOrIsNotAControl` passes on its *first*
disjunct — the meaningful one — rather than trivially. Had N3 hidden the slot in its own file
instead, that pin would have gone green by never mentioning `toggleCompanion()` at all, which is
worse than the edit.

**One other lane's test moved: `PatinaTests/InvoicesMoneyRailTests.swift`** (W1b lane B's).
`overlayHonoursTheYield` pinned the *literal source text* `"yieldsToPinnedFooter(for: screen) {
return .minimal }"`, and B-2 widens that call to take the root (`n1-notes.md` §2b). The pin is
updated to the new form and its actual subject — the yield resolves before the nudge — is unchanged
and still asserted, plus a second assertion that the root is what is passed. No behaviour moved.

---

## 2. For whoever owns `Features/Navigation/PatinaTabBar.swift` (N1's)

**2a. The bar's four labels collide at accessibility-XXL, and this is now the second lane to see it.**
`shots/w3-n3-11-today-dark-xxl-flagon-no-orb.png`, dark + accessibility-extra-extra-large: the row
reads `TodaySpac…PiecesStudio` with no inter-item spacing. N2 logged the same thing in
`w3-n2-09`. Not N3's file and not N3's to fix; recording it so it is not read as closed because
`w3-n2-09`'s *other* half (the orb over the bar) now is.

**2b. If a tour step is ever to hang off the bar, here is what it costs.** B-8 re-points step 3 "at
the Studio tab". N3 delivered the copy and kept the anchor on the app's Studio door
(`DailyGreetingHeader.studioControl`), because the popover cannot reach the bar today:
`FirstLaunchTour` creates its model in `@State` **inside `DailyRoomView`** and publishes it through
`\.firstLaunchTourModel` to its own subtree. The bar is a *sibling* of that subtree, mounted by
`HouseFirstRoot`. Moving the step onto the bar needs the tour hoisted above the four stacks
(`HouseFirstRoot.swift`) and the item tagged (`PatinaTabBar.swift`) — and the hoist would put a
second `FirstLaunchTour` model above the one `DailyRoomView` still owns on the flag-off root, so it
is a restructure, not a modifier. The anchor case and raw value are ready for it either way:

```swift
// PatinaTabBar.item(_:), on the .studio arm — if and when the tour is hoisted
.firstLaunchTourAnchor(.profileMonogram)
```

Raw value stays `profile-monogram` (steward §7·F) — it keys the Sanity document and is pinned by
`FirstLaunchTourTests`.

---

## 3. For the steward / whoever takes the unowned files

**3a. `Features/Home/Views/DailyRoomView.swift` was edited by N3 — five lines, and it is unowned.**
`Features/Home/**` is in no W3 lane's set (N1 §3b/§3c/§3d all say so). N3 added
`.firstLaunchTourAnchor(.todayRecord)` to the `HouseRecordCard` block and nothing else. Flagging it
because three separate lanes now want changes in that directory and it still has no name.

**3b. N1 §3c is now live, not hypothetical.** `DailyRoomView.swift:46` passes
`canAutoStart: coordinator.navigationPath.isEmpty`, and on the flag-on root that path is inert and
permanently empty. Observed this walk: the post-onboarding landing pushes `.emergence` onto the
**Pieces** stack while `DailyRoomView` is already mounted on Today, so the tour auto-starts against a
screen the user is not looking at. It did no visible harm — Today keeps its stack, the popover was
there when the Today tab was tapped — but the gate is not doing its job. N1's proposed expression
still stands:

```swift
coordinator.isHouseFirstRoot ? coordinator.tabs.stack(for: .today).isEmpty
                             : coordinator.navigationPath.isEmpty
```

**3c. N1 §3a and §3b (`MoneyScreenChrome.swift`, `ProductDetailView.swift`) are untouched by N3** and
still need a name. `CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` is sitting there for
both.

---

## 4. For Fable — three rulings N3 took rather than blocking on

**4a. Step 2 anchors on the record card, not the Saved row on Pieces.** The brief offered both. The
Saved row is disqualified three times over: it is not in the tour model's subtree (§2b above), so it
would never receive the popover; reaching it means a tab switch on first launch; and the Pieces tab
does not exist on the flag-off root, so the step would drop there — trading one dead step for
another. The record is on Today, inside the subtree, on both roots, and is the block step 1 has just
named. Cost of the choice: at guest/discovering an empty record draws nothing, so step 2 drops and
the tour renumbers to two — which is the tour's designed behaviour, not a regression, and is
`advance_skipsStepWhoseAnchorNeverMounts`' scenario verbatim.

**4b. The tour rewrite is unconditional, not branched on `house-first`.** B-8 says *"the tour is
gated by the same `house-first` flag as the root it describes."* Taken literally that means two step
lists and two mount sites. N3 read that line as a statement about the *root's* rollback, not the
copy's, and rewrote once, because **every sentence B-8 replaces is equally wrong on the flag-off
root**: step 1 names the "Daily Room", which B-7(c) retires from canon outright; step 2's anchor is
dead on both roots; step 3's control is `DailyGreetingHeader.studioControl` on both. Branching would
buy two code paths in exchange for leaving first-launch users on one root being told about a screen
that no longer has that name. **Reversible in one commit if Fable disagrees** — it is a second
`defaultSteps` array and a `steps:` argument at `DailyRoomView.swift:46`.

**4c. Step 3 delivers B-8's copy but not a popover physically on the tab.** Stated plainly rather
than buried: B-8's words are "re-points at the **Studio** tab". What ships is the sentence, on the
app's Studio door, with the anchor's raw value preserved. The gap and its price are §2b. If Fable
wants the literal tab, it is a `HouseFirstRoot` restructure and belongs to whoever owns that file —
not a modifier N3 could have added.

---

## 5. The thing the tests could not catch, and it gates B-8

**Every tour step still renders Sanity's copy, not the app's.**
`FirstLaunchTourPopoverCard.resolvedBody` is `loaded?.body ?? step.fallback?.body` — the CMS wins,
and the three documents still hold the retired sentences. Shots `w3-n3-06`, `-07`, `-08` show
`Step 1 of 3` through `Step 3 of 3` all speaking the old copy, including *"This is your Daily
Room."* `FirstLaunchTourTests` is green because it pins the fallbacks, which are correct.

So B-8 is **half-shipped by code and half by content ops**, exactly as the brief split it, and the
content half is not optional — without it the flag-on root introduces itself with the name B-7
retires. Three edits, keys unchanged, in `waves/w3/n3-sanity-copy.md`.

**And a trap for the next walker:** the tour would not auto-start at all until
`profiles.help_state` was cleared — `client@patina.dev` carried
`{"ios-first-launch-tour": {"launched": true, "abandoned": true, "abandonedAt":
"2026-08-28T01:59:17Z"}}` from an earlier lane's walk. That state is cross-device authoritative
through `SupabaseHelpStateAdapter`, so **reinstalling the app does not reset it**. The SQL is in the
copy doc.

---

## 6. What N3 did NOT change, and pinned so it stays that way

- `handleIntent` / `handleIntentWithResponse` — C8's frozen door, untouched, and now pinned
  *behaviourally* on both roots (`CompanionBarSlotTests.handleIntentIsUnchanged`:
  `.showRooms` selects Spaces on the flag-on root and sets `.yourSpaces` on the flag-off one).
- The coaching ladder — `.new` → `.learning` → `.learned` and the `MarkAttention` each carries.
  `CompanionOverlay` is still mounted on both roots, so `recordMainSessionStart()` and
  `recordPanelExpanded()` still fire; the bar changed where the mark is drawn, not what advances it.
- The ≤6-row composition — W1b's, unmoved. `CompanionActionMatrixTests` green untouched, and shot
  `w3-n3-04` shows the six rows on glass.
- The `NEXT STEPS` caption's copy policy — `CompanionContextualCopy.collapsedHint` is untouched;
  live Studio attention still wins over opted-in memory over the standing "Next steps". On the
  flag-on root the caption simply has no dock to draw under, which is B-2's point: *a slot cannot
  carry a caption.*
- `CompanionSafeArea.swift`, `PatinaTabBar.swift`, `CompanionHearthView.swift`,
  `CompanionActionRows.swift`, `CompanionAreaBuilders.swift` — read, not edited.
