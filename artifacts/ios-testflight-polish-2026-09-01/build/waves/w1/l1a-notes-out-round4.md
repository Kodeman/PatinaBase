# L1-A → other lanes · fix round 3 (2026-09-03)

Branch `first-flight/w1-l1a`, worktree `.codex/worktrees/agent-ff-w1-l1a`.

Every block below is **also appended to its target's inbox**, verbatim — `steward.md` for A→S-5 and
A→S-6, `l1-e-notes.md` for A→E-4. This round also repairs round three's undelivered blocks: A→S-1,
A→S-2, A→S-3, A→S-4 and A→F-1 are now appended to `steward.md` too (`RL3A-04`). Verify with
`grep -n "Note A→S-" waves/w1/steward.md`.

---

## To the steward — Note A→S-5 · the copy deck names four files no L1-A glob covers

`l1-e-copy-deck.md` § **"L1-A applies"** carries twenty-one rows. Seventeen name files inside L1-A's
globs and **all seventeen are applied on this branch**. Four name files that are in **no L1-A glob**,
and this lane has deliberately not touched them:

| deck row | file | whose glob it is |
|---|---|---|
| `A-52` (`.askAboutPiece` hint) | `Features/Companion/Services/CompanionActionRows.swift:220-223` | `Features/Companion/**` — **L1-C**'s (it owns `CompanionHearthView`, `CompanionOverlay`, the bottom inset) |
| `A-52` (`homeRow` hint) | `Features/Companion/Services/CompanionActionRows.swift:32-34` | same |
| `A-52` (`guestInviteView` message) | `Features/Notifications/Views/NotificationFeedView.swift:193` | `Features/Notifications/**` — **L1-F**'s (the badge/queue lane) |
| `C5-10` (`Discard Scan` / `Keep Scanning`) | `Features/RoomScan/Shared/Components/PauseMenuView.swift:63-64` | `Features/RoomScan/**` — **L1-B**'s |

Both of the `CompanionActionRows` rows also need `isAuthenticated` threaded through
`pieceActRow(_:isAuthenticated:)` and `homeRow()` — a signature change in a file this lane does not
own, applied blind, two merges after the owner has already merged.

**The ask:** route these four rows to the three owning lanes in the deck itself (or rule that L1-A
applies them at the X29 rebase, in which case say so and they go on X29's checklist). They are
written out in full in **A→E-4** below so whoever applies them has the exact final text.

---

## To the steward — Note A→S-6 · `RL3A-06`, the acceptance criterion for merge 5

L1-A closes **25 of its 27** rows. Two read **OPEN**, by design, and both are `X29`'s — the rebase
task that runs in this worktree after merges 1–4 and before merge 5 is pushed:

| finding | what is still open | what closes it |
|---|---|---|
| `C9-08` | four of the five `.numberPad`/`.decimalPad` files have no `.keyboardDoneToolbar()` (`RoomBudgetSheet`, `ManualRoomEntryView` ×2, `RoomSettingsView`, `ScanFallbackEntryView` — all L1-B's) | `l1-b-notes.md` **B-L1A-2**, applied at X29 |
| `C2-21` / `GAP7B-09` (acknowledgement half) | `AuthScreenView` accepts `pendingLinkNotice` and renders it; nothing passes it, because `AppCoordinator.pendingLinkNotice` is L1-F's and merges fourth | the two call-site lines in `ContentView.swift` and `AuthSheet.swift`, applied at X29 |

**The ask:** make merge 5's acceptance criterion name both rows explicitly, so the steward can refuse
the merge if they are still open. Both are now enforced by tests rather than by prose (`RL3A-03`):

- `KeyboardDismissalTests.everyBareNumericFieldIsOneOfTheFiveKnownOpenSites` — a tree-wide walk. It
  reds when a sixth bare field appears **and** when one of the four named files is fixed and the list
  is not updated. That second direction is the signal that `C9-08` may read closed.
- `AuthErrorRoutingTests.theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt` — inert while
  `AppCoordinator` has no `pendingLinkNotice`; the moment L1-F's property is on the tip it requires
  both call sites to pass it.
- `AuthErrorRoutingTests.thePearlStrokesAreRatchetedToZero` — the `D→A-7` swap. `<= 2` while
  `PatinaColors.Border` is absent from `PatinaDesignKit`; **exactly 0** the moment it is present.

`PROGRAM.md` §11.6 and `findings-by-lane.md` currently record L1-A at 27/27. **That is not yet true.**
Either accept the deferral and record **25/27 with two carried rows**, or require the rebase before
this branch is called done — Fable's call, but the number should say what is so either way.

---

## To L1-E (Copy) — Note A→E-4 · four deck rows L1-A cannot reach, with the final text

These are the four `l1-e-copy-deck.md` § "L1-A applies" rows whose files are in no L1-A glob (see
A→S-5). L1-E merges last and owns the words; whoever ends up applying them, the text is settled:

| id | file:line | today | final |
|---|---|---|---|
| `A-52` | `Features/Companion/Services/CompanionActionRows.swift:222` (`pieceActRow`, `.askAboutPiece`) | `hint = "A designer will come back to you"` | **guest:** `"Sign in and a designer will get back to you"` · **signed-in, no designer yet:** `"A designer will get back to you"` |
| `A-52` | `Features/Companion/Services/CompanionActionRows.swift:33` (`homeRow`) | `item("house", "Home", "Back to your space", route: .heroFrame, id: "home")` | **guest with no local work:** hint `"See what's on Patina"` · otherwise unchanged |
| `A-52` | `Features/Notifications/Views/NotificationFeedView.swift:193` (`guestInviteView`) | `message: "Updates from your designer will land here. Sign in to stay in the loop."` | `message: "Sign in to see updates on your projects and messages here."` (the title `"Nothing yet"` at `:192` stays) |
| `C5-10` | `Features/RoomScan/Shared/Components/PauseMenuView.swift:63-64` | `Button("Discard Scan", …)` / `Button("Keep Scanning", …)` | `"Discard scan"` / `"Keep scanning"` |

Two notes the deck already carries and the applier will need:

1. Both `CompanionActionRows` rows need the same `isAuthenticated` parameter threaded into
   `pieceActRow(_:isAuthenticated:)` and `homeRow()`, so they belong in **one** task, not two.
   `PieceActResolver.entry(for:isAuthenticated:)` (`Features/Purchase/PieceAct.swift:114-127`)
   already auth-walls the tap; these rows only fix what a guest reads *before* the wall.
2. `Features/Purchase/AskAboutPieceSheet.swift:144-145` carries the same
   `"A designer will come back to you about this piece."` sentence twice. It is **not** a deck row
   and this lane has not touched it — but if the tense-neutral cleanup ("come back to" → "get back
   to") is meant to be applied "everywhere this phrase appears", as the deck's own note says, that
   file is where the other two live. `Features/Purchase/**` is "no lane, no W1 work" in the residue
   table, so it needs a decision rather than a silent edit.

**Also for the record (no action):** the seven straight apostrophes `A-06`'s sweep did not reach are
now fixed here, and `AuthAndQuizCopyTests.deckedFiles` grew by three of this lane's own files —
`AuthenticationView.swift`, `StyleConversationViewModel.swift`, `QRAuthModels.swift`. The W2 app-wide
pass has three fewer files to do.
