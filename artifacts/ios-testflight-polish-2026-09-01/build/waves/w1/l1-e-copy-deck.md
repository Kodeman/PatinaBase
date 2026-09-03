# W1 · L1-E — copy deck

**Revision 2, 2026-09-02** — rewritten after the adversarial review (`RL1E-01`…`RL1E-22`). Revision 1
is in this branch's history at `8cee27237`. What changed: three rows were addressed to lanes that do
not own the file and are re-addressed here (`RL1E-03`); `A-13` and `GAP1B-01` were missing and are
added (`RL1E-07`); `C5-09` covered one of its eight cited sites and now covers all eight, with a
recorded scope decision (`RL1E-10`); two live Title-Case CTAs and two "Curated" style-quiz labels
were unswept and now have rows (`RL1E-11`, `RL1E-12`); `A-101`'s deviation from its own exit
criterion is recorded as an exception rather than left silent (`RL1E-16`); `C5-16`'s Swift snippet
is a real fenced block (`RL1E-19`); the "tests this deck is pinned by" paragraph asserted seven
suites when four did not exist (`RL1E-02`).

Reviewed against `.claude/skills/patina-brand-voice/SKILL.md`: sentence case except proper nouns;
one voice on failure (modelled on `Features/Money/MoneyFailureCopy.swift` and
`Features/Purchase/OrderFailureCopy.swift` — never interpolate a thrown error or a server string);
one noun per thing (**Piece · Room · Studio · Companion · Record**); no "curated", "journey",
"elevated", "disrupt", "revolutionize"; no "AI"/"A.I."/"artificial intelligence"/"machine
learning"/"GPT"/"LLM" anywhere. Every row below was checked against that list before it was written.

**Format:** `finding id · file:line · today's string · final string · owning lane`. The owning lane
applies its own rows inside its own worktree as numbered tasks (PROGRAM.md §3 · L1-E's ownership
rule). Ownership is resolved against **`build/waves/w1/steward.md` §5**, not against the lane a
finding was filed under — revision 1 got three rows wrong that way.

L1-E applies only the rows marked **L1-E** below, in the three files it owns outright plus
`ARPlacement/**`, `Services/DesignServices/**`, `DesignRequestFlowView+Steps.swift`, and — under the
ownership rule's second clause, *"any file no other W1 lane owns"* — `Services/Companion/**`,
`App/Coordinators/Coordinator.swift` and `Features/Collections/Views/**`. See
`build/waves/w1/l1e-tasks.md`.

Covers all 18 W1 findings in L1-E's table (`build/findings-by-lane.md`), the five copy halves other
lanes flagged, and the four sites the fix round found on the built branch.

---

## Rows by owning lane

### L1-A applies — `Features/Authentication/**`, `Onboarding/**`, `FirstLaunch/**`, `StyleQuiz/**`, `Account/**`

| id | file:line | today | final | note |
|---|---|---|---|---|
| `A-101` | `Features/Account/AccountDeletionService.swift:41` | title `"Close your account?"` | `"Delete account"` | One verb everywhere — the row (`SettingsView.swift:89`), the confirmation title and the button all read the same word. "Close" reads as suspend/pause, which is not what this does. **Applied** (`l1-e-notes.md`, Note E-L1A-1). |
| `A-101` | `Features/Account/AccountDeletionService.swift:42-43` | `"This removes your account and everything Patina keeps on this device. It can't be undone."` (scopes deletion to the device only) | `"This deletes your Patina account, including your saved rooms, pieces, and messages. Any project you completed with a designer stays in our records — with your name and contact details removed — as required for our legal and accounting obligations. This can’t be undone."` | Grounded in `supabase/functions/delete-account/index.ts` + `supabase/migrations/00538_client_account_anonymize.sql`: the auth user is soft-deleted and `purge_client_account` deletes rooms, room scans, saved items, the client's threads and the notification/push-token/style-profile/companion rows — but **never** writes to `proposals`, `projects`, `invoices`, `client_decisions` or `designer_clients`. **Applied**, with U+0027; the apostrophe is a fix-round row below. |
| `A-101` | `Features/Account/AccountDeletionService.swift:39` (`failureCopy`) | `"We couldn't close your account just now. …"` | `"We couldn’t delete your account just now. Try again, or write to hello@patina.cloud."` | Same one-verb sweep. **Applied**, with U+0027; see the apostrophe row below. |
| `A-06` | `Features/Onboarding/Views/OnboardingFlowView.swift:31,57,58` | straight U+0027 in `"Let's discover yours."`, `"we'll"`, `"Let's begin"` | the same sentences with U+2019 | Line 37 already used U+2019 — that is the standard this sweep adopts. **Applied**. |
| `C5-20` | `Features/Onboarding/Views/OnboardingFlowView.swift:32` | `"Start Your Journey"` | `"Let’s begin"` | Reuses page 3's own CTA verbatim. **Applied**. |
| `C5-20` | `Features/Authentication/Views/AuthenticationView.swift:134` | `"Join the furniture discovery journey"` | `"Save your rooms and pieces, and pick them up on any device."` | States the actual benefit instead of brand-voice filler. **Applied**. |
| `C5-10` | `AccountView.swift:184`, `QRScannerView.swift:201`, `CameraPermissionView.swift:223`, `AuthenticationView.swift:526,528,530,532,632` | `"Sign Out"` / `"Open Settings"` ×2 / `"Sign In"` / `"Create Account"` / `"Send Reset Link"` / `"Sign Up"` | `"Sign out"` / `"Open settings"` ×2 / `"Sign in"` / `"Create account"` / `"Send reset link"` / `"Sign up"` (`"Email me a code"` unchanged) | Sentence case except proper nouns. **Applied**. |
| `C5-10` | `AuthenticationView.swift` · `headerTitle` (returned `AuthMode.rawValue`) | `"Sign In"` / `"Sign Up"` / `"Reset Password"` — Title Case directly above a submit button reading "Sign in" | `"Sign in"` / `"Create account"` / `"Reset password"` | The residue the deck's `C5-10` rows missed: they named `submitButtonTitle` (`:526-532`) and the mode switcher (`:632`), not the header the sheet opens with. Found and **applied** by L1-A (`l1-e-notes.md`, fix-round Note E-L1A-2); ratified here so the deck is the record. `AuthMode`'s raw values are unchanged — no longer rendered anywhere. |
| `A-79` | `Features/Collections/Views/LocalStoreClaimSheet.swift:17` | `"Keep the room and the pieces you saved on this phone?"` (fixed, regardless of what was saved) | Composed from the real counts: rooms only `"Keep the {n} room{s} you saved on this phone?"` · pieces only `"Keep the {n} piece{s} you saved on this phone?"` · both `"Keep the {r} room{s} and {p} piece{s} you saved on this phone?"` | `s` = `""` at 1, else `"s"`. The sheet is already never shown at zero (`LocalStoreClaim.shouldAsk` requires `hasGuestWork`), so the fix's "omit at zero" half needs no change. **`Features/Collections/Views/**` has no W1 owner**, so under L1-E's ownership rule this was L1-E's file to edit (`RL1E-04`) — but L1-A had already applied both rows verbatim before the fix round opened. Recorded and pinned in `GuestPromiseTests`, **not re-applied**, so the wave does not carry the edit twice. |
| `A-79` | `LocalStoreClaimSheet.swift:23` | `"They were saved before you signed in. …"` | **Unchanged** — it never claims a count. | **Applied** (as no-op). |
| `B-23` | `Features/StyleQuiz/Views/StyleResultView.swift:65` | `"Your portrait stays on this device and can be reset in Settings."` (false — the answers are POSTed) | `"Your portrait is yours — reset it any time in Settings."` | **Applied**. |
| **`A-13`** | `Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:44-47` (`companionNudgeLabel`) | `"Next question →"` — a `StaticText` with no button role and no action, 26 pt above the real Continue button | **Delete the line on every step that already has a Continue button.** Where a line survives (the last single-select step, whose Continue reads only "Continue"), the sentence is **`"See your style"`**. | `RL1E-07`: named by id in PROGRAM.md §3 · L1-E's integration notes ("the deck row names the string, the owning lane does the edit") and missing from revision 1. **Applied** on `first-flight/w1-l1a` at `StyleQuizViewModel.swift:61-66`, in exactly this shape; the string is ratified here rather than replaced. |
| **`C5-10`** | `Features/StyleQuiz/Views/StyleResultView.swift:54` | `Text("View Recommendations")` — Title Case, and "Recommendations" is not the tab's or the brand's noun | `"See your pieces"` | `RL1E-11`: found on the built branch, shot `w1-review-l1e/08-portrait-b23-stays-on-this-device.png`. Sentence case *and* the lexicon noun in one edit — "See the piece" is the phrase `OrderPlacedView` and (after `C5-09`) `ItemActionMenu` already use, so the plural is the same voice. **Not yet applied.** |
| **`C5-20`** | `Features/StyleQuiz/Models/QuizModels.swift:73` | `QuizOption(label: "Eclectic Curated", gradient: PatinaGradients.rattan, key: "eclectic_curated")` | `label: "Collected Eclectic"` — **`key:` unchanged** | `RL1E-12`: "curated" is on this deck's own banned list and `BrandVoiceLintTests` bans it, yet the app says it twice on question 1 and question 4 of the mandatory first-run quiz — a harder placement than `C5-20`'s own. "Collected" is the interiors word for a room assembled over time, which is the palette this option means, and it is the idea the brand is named for. **The `key` is a spectrum-mapping input, not copy — it must not change** (`StyleQuizViewModel.swift:221` matches on it). |
| **`C5-20`** | `Features/StyleQuiz/Models/QuizModels.swift:105` | `QuizOption(label: "Curated Comfort", subtitle: "$2,000 – $5,000 per room", icon: "✦", key: "curated_comfort")` | `label: "Considered Comfort"` — **`key:` unchanged** | Parallel to its siblings "Thoughtful Starter" and "Heirloom Investment": one plain adjective, one plain noun. `StyleQuizViewModel.swift:242,296` match on `"curated_comfort"` — **do not touch the key**. |
| **`A-06`** | `AuthViewModel.emailValidationMessage`, `AccountView.signedOutSection`, `StyleQuizView`'s defer control | `"That doesn't look like an email address yet."` · `"You're looking around without an account."` · `"I'll do this later"` | the same sentences with **U+2019** | `RL1E-05`/`RL1E-06`, and the answer to L1-A's own question in `l1-e-notes.md` Note E-L1A-3: **`A-06`'s W1 sweep is every user-facing string in a file this deck names, not only `OnboardingFlowView`; the app-wide sweep is W2.** These three are in files this deck names, so they are in scope. |
| **`A-06`** | `Features/Account/AccountDeletionService.swift:38-39,55-58` | `"We couldn't delete …"` · `"… This can't be undone."` (both U+0027) | the same sentences with **U+2019** | Same sweep. **Apply the matching pin in the same commit**: `PatinaTests/AccountActionsTests.deletionConfirmationCopyIsHonest` asserts `confirmationBody.contains("can't be undone")` with a straight apostrophe, so the string edit alone turns that test red. |
| **`C5-10`** | `Features/Account/AccountView.swift:59,61` | `.alert("Sign Out", isPresented: $showingSignOutAlert)` · `Button("Sign Out")` | `.alert("Sign out?", …)` · `Button("Sign out")` | `RL1E-11`, and the twin of the row L1-C flagged in `SettingsView`. The row that opens this alert already reads `"Sign out"` (`:217`), so one screen ships both spellings — which is exactly `C5-10`'s complaint. The **`?`** on the title matches the file's three sibling alerts ("Forget recent context?", "Reset taste portrait?"). **Apply the matching pin in the same commit**: `AccountActionsTests.accountViewSurfacesBothAccountActions` asserts `"Sign Out"`. |

### L1-B applies — `Core/**`, `Services/Sync/**`, `Features/RoomScan/**`, `Features/Rooms/**`, `Features/Collections/**` (schema side)

| id | file:line | today | final | note |
|---|---|---|---|---|
| `C4-09` | `Features/RoomScan/Shared/Components/ScanUploadProgressView.swift:57-63` | `Text(err)` where `err = package.lastError` — raw storage/Postgres text | A `ScanUploadFailureCopy` mapping, modelled on `Features/Purchase/OrderFailureCopy.swift`: network/transport → `"Upload paused — check your connection. It’ll pick up automatically."` · storage/Postgres write failure → `"We couldn’t finish uploading your scan. Try again from here."` · unclassified → the same sentence | `package.lastError: String?` stays as the on-disk diagnostic column; only the **view** stops printing it. **Applied** (`ScanUploadFailureCopy.swift` exists on `first-flight/w1-l1b`). |
| `C4-08` | `Core/Network/RoomsAPIClient.swift:415-419` | `enum RoomsAPIError: Error` with no `LocalizedError`, so any caller reading `.localizedDescription` repeats C4-08 | Conform to `LocalizedError`: `.notAuthenticated → "Please sign in to continue."` · `.emptyResponse → "We didn’t get a response. Try again."` · `.http → "Something went wrong. Try again."` (never the status or body) | The fix's own second half, in a file L1-E does not own. **Applied**. |
| `C5-11` | `Features/RoomScan/Views/ScanReviewView.swift:128` | `Text("Something went wrong")` (no terminal period) | `Text("Something went wrong.")` | One canonical generic headline everywhere. **Applied**. |
| `C5-16` | `Core/Models/SavedItem.swift` | — | new computed property, see **`### C5-16 — SavedItem.resolvedMakerName`** below | **Applied**. |
| `C5-16` | `Features/Rooms/Components/RoomItemRow.swift:43` | `Text(item.makerName)` — prints `"UNKNOWN MAKER"` uppercased | `if let maker = item.resolvedMakerName { Text(maker) }` | Same shape `RecommendationsView.swift:334-340` already ships. **Applied**. |
| `C5-16` | `RoomItemRow.swift:89` (`rowAccessibilityLabel`) | `"by \(item.makerName)"` unconditional | `if let maker = item.resolvedMakerName { parts.append("by \(maker)") }` | **Applied**. |
| `C5-16` | `Features/Rooms/Views/ItemActionMenu.swift:53`, `Views/MoveOrCopyItemSheet.swift:80` | `Text("\(item.makerName) · \(item.fullFormattedPrice)")` | `Text([item.resolvedMakerName, item.fullFormattedPrice].compactMap { $0 }.joined(separator: " · "))` | At `nil`, price alone, no dangling separator. **Applied**. |
| `C5-09` | `ItemActionMenu.swift:31` | `row("arrow.up.right", "View Product Detail", .viewDetail)` — a SwiftUI class name printed as a button label | `"See the piece"` | The sharp slice `C5-09` is T0 for. **Applied**. |
| `C5-09` / `C5-10` | `ItemActionMenu.swift:30,32-34` | `"View in AR"` / `"Move to Another Room"` / `"Copy to Another Room"` / `"Remove from Room"` | `"View in AR"` (unchanged — AR is an acronym) / `"Move to another room"` / `"Copy to another room"` / `"Remove from room"` | **Applied**. |
| `C5-10` | `Features/RoomScan/Shared/Components/PauseMenuView.swift:63-64` | `"Discard Scan"` / `"Keep Scanning"` | `"Discard scan"` / `"Keep scanning"` | **Applied**. |
| **`C5-09`** | `Features/Rooms/Views/CrossRoomView.swift:64` and `:81` | `Text("All Items")` (screen title) and `tabButton("All Items", .all)` | `"All pieces"` in both | `RL1E-10`: both are in `C5-09`'s own `where`, and revision 1 covered neither. The sibling tabs `"By Category"` / `"By Maker"` are Title Case too, but they are not the noun collision — leave them; `C5-10`'s casing sweep for this screen is W2. **Not yet applied.** |
| **`C5-09`** | `Features/Rooms/Views/RoomProjectView.swift:212` | `Text("Your Items")` (section eyebrow, uppercased by the type style) | `"Your pieces"` | `RL1E-10`. Same file as `B-20` below, different line. **Not yet applied.** |
| `B-20` | `Features/Rooms/Views/RoomProjectView.swift:254` (`emptyBlock`) | `cta(primary: "Browse pieces for the \(room.name)")` — breaks on every room name | `cta(primary: "Browse pieces for this room")` | A fixed label, not an article rule: a room can be named "Mum's Room" or "1". `RL1E-03c`: revision 1 addressed this to L1-C, but `Features/Rooms/**` is **L1-B's** (steward.md §5.3) and `RoomProjectView.swift` is not one of the carve-outs. **L1-C applied it anyway** (task `C-L1E-5`) — recorded here so the steward knows which branch carries the hunk, and so L1-B does not apply it a second time. |

### L1-C applies — `Design/**`, `Features/Companion/**`, `Home/**`, `Decisions/**`, `Help/**`, `Settings/**`, `Profile/Views/ProfileView.swift`, `Recommendations/Views/RecommendationsView.swift`

| id | file:line | today | final | note |
|---|---|---|---|---|
| `A-60` / `C-22` | `Features/Companion/Services/CompanionActionRows.swift:36-39` (`profileRow`) | label `"Your profile"`, hint `"Style · Settings · Portal"` | label `"Your studio"`, hint `"Style · Settings"` | The label is `A-60`'s ask; dropping "Portal" is `C-22`'s — `PatinaPortalLinks.swift` has zero call sites. **Applied**. |
| `A-60` / `C-22` | `CompanionActionRows.swift:51-54` (`studioRow`, routes to `.projectList`) | label `"Your studio"`, hint `"Projects · Messages · Decisions"` | label `"Your projects"`, hint `"Projects"` | Necessary consequence of the row above. **Applied**. |
| `A-60` | `Features/Profile/Views/ProfileView.swift:148` | `Text("YOUR PROFILE")` | `Text("MORE")` | Not "YOUR STUDIO": the screen's tab title already carries that word once, and this section's rows are not studio business objects. **Applied**. |
| `C-30` | `ProfileView.swift:201,207` | `label: "Rooms"` (renders `"1 ROOMS"`) | `label: viewModel.roomCount == 1 ? "Room" : "Rooms"` | **Applied at both call sites** — the stat row is drawn twice, stacked and horizontal, and both printed the bug. |
| `C-38` | `Features/Recommendations/Views/RecommendationsView.swift:413-421` | `return "Selected from Patina's room-aware edit for \(scopedRoomName)."` on every card | `return nil` | Deletes the fallback entirely, matching what the Pieces tab already does; the `tastePortrait` branch above it is untouched. **Applied**. |
| `C5-05` | `Features/Settings/Views/SettingsView.swift:153-155` | `"Help Center"` row → `https://patina.cloud/help`, a live 404 whose SPA fallback serves the marketing homepage | **Structural, no string.** Point the row at a page that exists, or remove it. | **Applied as removal** — the in-app `HelpPanelSheet` was not available because all six `?` doors are hidden for round one (`C5-02`) and the article fetch still 400s (`R-10`). If W2 restores the row, it needs a new deck row. |
| `C5-10` | `SettingsView.swift:81,121,156,159` | `"Sign Out"` / `"Haptic Feedback"` / `"Contact Us"` / `"Terms & Privacy"` | `"Sign out"` / `"Haptic feedback"` / `"Contact us"` / `"Terms & privacy"` | Ampersand kept — it is doing the job of "and" inside a short label. **Applied**. |
| **`C5-10`** | `SettingsView.swift:212,214` | `.alert("Sign Out", isPresented: $showingSignOutConfirmation)` · `Button("Sign Out")` | `.alert("Sign out?", …)` · `Button("Sign out")` | **The answer to L1-C's open question** in `l1-e-notes.md` ("If L1-E wants the alert cased to match, send the two strings and the pin update together"). The `?` matches the file's three sibling alerts ("Forget recent context?", "Reset taste portrait?", "Discard this scan?"), which is `C5-10`'s actual complaint — inconsistency inside one screen. **Apply the matching pin in the same commit**: `PatinaTests/AccountActionsTests.settingsSurfacesBothAccountActions` asserts `source.contains("\"Sign Out\"")` → `"\"Sign out\""`. The twin in `AccountView.swift:59,61` is L1-A's row, with the other half of that test file; the two edits are separate `@Test` functions, so they merge cleanly. |
| **`C5-09`** | `ProfileView.swift:217` | `.accessibilityLabel("Saved items: \(viewModel.savedItemCount). More information available.")` | `"Saved pieces: \(viewModel.savedItemCount). More information available."` | `RL1E-10`: the visible stat reads `"Saved"`, which is fine; only the announcement names the retired noun. VoiceOver-only, one word. **Not yet applied.** |
| **`C5-10`** | `ProfileView.swift:154` (`:140` post-rebase) | `profileActionRow(icon: "paintpalette", label: "Retake Style Quiz")` | `"Retake your style quiz"` | `RL1E-11`: Title Case sits directly above `"Get design help"` and `"Settings"` inside one section — `C5-10`'s complaint verbatim. The final string is `GAP2-22`'s own ruled fix, reused so W2 has nothing left to decide. **Not yet applied.** |
| `A-52` | `CompanionActionRows.swift:32-34` (`homeRow`) | label `"Home"`, hint `"Back to your space"` — drawn identically to a guest who has never scanned a room | **Guest:** hint `"See what’s on Patina"` · **signed in, or a guest with local rooms:** unchanged | `RL1E-03a`: revision 1 addressed this to L1-A, but `Features/Companion/**` is **L1-C's** (steward.md §5.4). L1-A re-routed it as task **`C-L1A-3`**. Needs `isAuthenticated` (or `LocalStoreClaim.hasGuestWork`) threaded into the row builder. **Not yet applied** — pinned by `GuestPromiseTests.companionRowsBranchOnAuthState`. |
| `A-52` | `CompanionActionRows.swift:220-223` (`pieceActRow`, `.askAboutPiece`) | hint `"A designer will come back to you"` — drawn for a guest and for a signed-in stranger with no designer | **Guest:** `"Sign in and a designer will get back to you"` · **signed in, no designer yet:** `"A designer will get back to you"` | Same task `C-L1A-3`, same parameter. `:213-214` (`.askDesigner`) is **unchanged** — only reachable when `relationship.isLive`, which a guest cannot be. **Not yet applied.** |
| **`GAP1B-01`** | `Features/Decisions/Views/DecisionDetailView.swift:368-448` (`DecisionConsentSheet`) | Approve and Cancel are off-screen at accessibility text sizes | **No string.** The fix is entirely structural: a content-driven detent, or `.large` alone at accessibility sizes via `@Environment(\.dynamicTypeSize)`. | `RL1E-07`: PROGRAM.md §3 · L1-E's integration notes name this row as one the deck owes ("the sheet is L1-C's, the sentence is a deck row L1-C applies"). Revision 1 omitted it entirely. Having read the sheet: **no sentence is needed** — the copy inside it is already correct and no new text appears at any size. Recorded so the exit criterion's "every deck row is either applied or carries a written 'not this wave, because…'" has an entry for it. |

### L1-D applies — `PatinaDesignKit/**`, `Features/Shared/**`

| id | file:line | today | final | note |
|---|---|---|---|---|
| `C5-09` | `PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift:66-67` (`#Preview` default) | `title: "No products yet", message: "Products you capture will appear here, ready to add to a room."` | `title: "Still building the collection", message: "New pieces are added by hand — check back soon."` | `RL1E-10`: this site **is** in `C5-09`'s own `where` — revision 1 mis-filed it as "proactive, no W1 finding id" and marked it optional. It is a real `C5-09` row. `"products"` is the noun `C5-09` retires and "Products you capture" implies an AR-capture flow that has nothing to do with an empty catalogue. **Applied**. |
| `C5-09` | `PatinaEmptyState.swift` — the named content value `PatinaEmptyStateContent.stillChoosingPieces` | *(new in L1-D's wave, for `A3-01`)* | `title: "Nothing here yet"` · `message: "Your designer is still choosing pieces for you. This fills in as they do."` | **Ratified as written, not replaced** — the answer to L1-D's question in `l1-e-notes.md` (D→E-1). L1-D is right that round one is Leah's own clients on the four-tab root, where the Pieces tab is *their designer's* selection, so naming the designer is the truer sentence than this deck's marketplace one. The identifier rename `stillCuratingPieces` → `stillChoosingPieces` is also right: a word the codebase says to itself becomes a word the codebase ships. |
| `C5-14` | *(the money formatter's output strings)* | `$4,200` and `$4.2K` for the same piece, one tap apart | — | **No string for L1-E to supply.** `C5-14` is a formatter-selection problem, not a wording one, and PROGRAM.md §3 · L1-E's own routing table assigns it to L1-D. Recorded so the row is not read as unassigned. |

### L1-F applies — `Features/Notifications/**`, `Messaging/**`, `PatinaWidget*/**`, `App/DeepLinking/**`, `AppCoordinator.swift`

| id | file:line | today | final | note |
|---|---|---|---|---|
| `A-52` | `Features/Notifications/Views/NotificationFeedView.swift:193` (`guestInviteView`) | `"Updates from your designer will land here. Sign in to stay in the loop."` | `"Sign in to see updates on your projects and messages here."` | `RL1E-03b`: revision 1 addressed this to L1-A, but `Features/Notifications/**` is **L1-F's** (steward.md §5.7), and `l1e-notes-out.md` recorded "L1-F (none in W1)" — so L1-F was never told. L1-F found and applied it anyway (`NotificationFeedView.swift:242` on `first-flight/w1-l1f`). The title `"Nothing yet"` is fine — unchanged. **Applied**; the routing is corrected here and confirmed to L1-F in `l1e-notes-out.md`. |

### L1-E applies — its own worktree, its own files

| id | file:line | today | final | note |
|---|---|---|---|---|
| `C5-06` | `PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift:29-41` (`greeting`) | dawn `"Early morning."` · morning `"Good morning."` · day `"Good day."` · afternoon `"Good afternoon."` · evening `"Good evening."` · night `"Good night."` | dawn/morning `"Good morning"` · day/afternoon `"Good afternoon"` · evening/night `"Good evening"` | Six windows onto the three greetings people actually say, and every terminal period dropped, per the fix. `DailyRoomView.swift:253` reads `TimeOfDay.current.greeting` directly; no other file carries a copy of these six sentences. **Applied.** |
| `C4-08` | `Features/ARPlacement/ViewModels/ARPlacementViewModel.swift:46,87` | `self.saveState = .failed(error.localizedDescription)` — for a plain `Error`, renders `"The operation couldn't be completed. (Patina.RoomsAPIError error 2.)"` | `static let saveFailureMessage = "We couldn’t save this. Try again."`, and `.failed(Self.saveFailureMessage)` | The thrown error is now logged **unconditionally** at `PatinaLog.ui.error`, not under `#if DEBUG` — `os.Logger.error` is the level that survives into a Release archive, which is where a TestFlight tester's failed save has to be readable (`RL1E-13`). **Applied.** |
| `C4-08` | `Features/ARPlacement/Views/ARPlacementView.swift:111-113` | `toastPill(text: "Save failed: \(msg)", …)` | `toastPill(text: msg, …)` | Drops the prefix now that `msg` is always the whole sentence. **Applied.** |
| `C4-09` | `Features/DesignServices/DesignRequestFlowView+Steps.swift:169-171` | `Text(error.errorDescription ?? "Something went wrong.")` | `?? "Something went wrong. Try again."` | Unified to the app's one canonical generic sentence. **Applied.** |
| `C4-09` / `C5-11` | `Services/DesignServices/DesignServicesService.swift:201` (`.invalidRequest`) | `return message` — the raw Postgres/RPC message | `"We couldn’t process your request. Try again."` | The associated value stays on the case; `submitDesignRequest`'s catch now logs the raw error at `PatinaLog.sync.error` before mapping (`RL1E-13`). **Applied.** |
| `C5-11` | `DesignServicesService.swift:203-204` (`.networkError`) | `"Network error: \(message)"` | `"Check your connection and try again."` | Byte-identical to `CompanionAPIError.networkError` — which revision 1 claimed and the code did not do (`RL1E-08`). **Applied.** |
| `C5-11` | `DesignServicesService.swift:205-206` (`.submissionFailed`) | `"Failed to submit your request. Please try again."` | `"We couldn’t send your request. Nothing was lost — try again."` | Exact text from the fix. **Applied.** |
| `C5-11` | `DesignServicesService.swift` — `.notAuthenticated`, `.noScans`, `.primaryNotInSet`, `.invalidProjectType` | four sentences with no terminal punctuation, beside eight that have it | the same sentences, each ending in a period | `RL1E-08`. **One rule: a complete failure sentence ends in a period.** Applied to every arm of both services so sibling arms cannot disagree. **Applied.** |
| `C5-11` | `Services/Companion/Models/CompanionAPIModels.swift:286-287` (`.serverError`) | `"Something went wrong (error \(code)). Please try again."` | `"Something went wrong. Try again."` | Never a status code in front of a homeowner; the code is now logged at the throw site instead. **Applied.** |
| `C5-11` | `CompanionAPIModels.swift:290-291` (`.decodingError`) | `"Something went wrong. Please try again."` | `"Something went wrong. Try again."` | One register, not a formal one. **Applied.** |
| `C5-11` | `CompanionAPIModels.swift` — `.unauthorized`, `.networkError`, `.noToken`, `.rateLimited` ×2 | four sentences with no terminal punctuation, plus `"Too many requests. Please try again later."` | each ending in a period; `"Too many requests. Try again later."` | The other half of `RL1E-08`'s one rule. `"Please sign in to continue."` keeps its "Please" — a polite instruction is not the "Please try again" padding this rule removes. **Applied.** |
| `C5-11` | `Design/Components/PatinaErrorState.swift:41,49` (`#Preview` only) | `"Something went wrong loading this."` | `"Something went wrong."` | The component takes `message` from its caller and has no default of its own. **Applied.** |
| **`C5-09`** | `App/Coordinators/Coordinator.swift:135` (`AppRoute.displayName`) | `case .crossRoom: return "All Items"` | `return "All pieces"` | `RL1E-10`. `App/Coordinators/Coordinator.swift` is **not** in any lane's glob — L1-F owns `AppCoordinator.swift`, "the WHOLE file, not a slice", and this is a different file — so it is L1-E's under the ownership rule's second clause. **Applied.** |
| **`C5-09`** | `App/Coordinators/Coordinator.swift:198` (`AppRoute.analyticsScreenName`) | `case .roomSavedItems: return "Saved Items"` | **Unchanged, and `.crossRoom` is now pinned there explicitly.** | `C5-09`'s `where` cites `:198`, but that line is a **PostHog screen name**, frozen by `RouteAnalyticsParityTests.stableRouteScreenNamesAreUnchanged` precisely so a copy rename cannot silently break a dashboard — the file's own comment says so about `.table` and `.roomSavedItems`. Renaming `displayName` therefore required adding `case .crossRoom: return "All Items"` to `analyticsScreenName`, exactly as those two routes already do. **Applied.** |
| **`C5-09`** | `Features/Collections/Views/CollectionsView.swift:151` | `Text("No saved items yet")` | `Text("No saved pieces yet")` | `RL1E-10`. `:157`'s body line already says "pieces". `Features/Collections/Views/**` has no W1 owner (steward.md §5.1's last row), so this is L1-E's. **Applied.** |
| **`C5-11`** | `DesignServicesService.swift:286` (`PickIntroductionError.failed`) | `return "Couldn't book that time: \(message)"` — the raw Postgres/system message | `"We couldn’t book that time. Try again."`, and `.notFound`'s `"Please try again."` becomes `"Try again."` | **A no-id fix**, recorded per `RL1E-22` rather than filed as a new finding: it is the identical raw-interpolation defect as `.invalidRequest` and `.badRequest`, on the same enum family in a file this finding names, found by the apostrophe sweep this fix round ran. `.notFound` and `.failed` now read the same sentence, which is what the mapping already treats them as. **Applied.** |
| **`C5-11`** | `CompanionAPIModels.swift:280-281` (`CompanionAPIError.badRequest`) | `return message` — raw server text | `"That didn’t go through. Try again."` | The other **no-id fix** (`RL1E-22`). Reuses `NotificationFeedView.swift:144`'s existing phrase verbatim. **Applied.** |
| **`A-06`** | every user-facing literal in `PatinaErrorState.swift`, `ARPlacementViewModel.swift`, `DesignServicesService.swift`, `DesignRequestFlowView+Steps.swift`, `CompanionAPIModels.swift` | thirteen literals typed with straight U+0027 — including the four this lane wrote in revision 1 | the same sentences with U+2019 | `RL1E-05`: the lane set the U+2019 standard for L1-A and broke it in its own four new strings, in the same commit range. Pinned by `BrandVoiceLintTests.apostrophesAreCurly`, which is `A-06`'s missing "add a lint rule" half (`RL1E-06`). **Applied.** |

---

### `C5-16` — `SavedItem.resolvedMakerName`

`RL1E-19`: revision 1 carried this snippet as an escaped one-liner inside a table cell, so the "exact
final text" the ownership rule requires was not copy-pasteable. It is the row's real contract:

```swift
var resolvedMakerName: String? {
    let vendor = makerName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !vendor.isEmpty,
          vendor.caseInsensitiveCompare("Unknown Maker") != .orderedSame,
          vendor.caseInsensitiveCompare("Unknown") != .orderedSame else { return nil }
    return vendor
}
```

`SavedItem.makerName` is a non-optional `String` (`Core/Models/SavedItem.swift:27`) and `SavedItem`
has no `brand` field, unlike `ProductModel` — so the guard is the vendor-string check only, with no
`if let brand` leg. Mirrors `ProductModel.swift:222-229`.

---

## Recorded consequences and exceptions

| id | what is recorded |
|---|---|
| **`C5-06` / `RL1E-21`** | After the fix, `"Good evening"` owns **21:00–04:59** as well as 18:00–20:59 — eleven hours, including the small hours, where the finding's own complaint was that one greeting owned eight. This follows `C5-06`'s fix line verbatim ("night → 'Good evening.'"), so it is the ruling's consequence, not a deviation. **Declined for W1**: the finer answer is a fourth band (`case 21..<24` evening, `case 0..<5` something else), but every candidate for the small hours is worse than "Good evening" — "Good morning" at 03:00 is a claim about the day that has not started, and a neutral "Hello" is a fourth register in a headline that is supposed to have one. Two lines in `TimeOfDay.current` and one case in `GreetingWindowTests` if Fable wants it; `hourBandsArePinned` makes the change deliberate rather than silent. |
| **`C5-06` / `RL1E-15`** | On the **flags-off** root (the D1 kill-switch fallback, whose header also carries the Studio pill, the bell and the help icon) the longer greetings wrap to two lines for more of the day than "Good night." did — "Good / evening" at 21:41, and "Good afternoon" (14 chars) replaces "Good day." (9) at midday. The four-tab root has the width and renders one line. Low stakes, and not a reason to revert; sent to L1-C as a heads-up because it owns `DailyRoomView.swift` and `DailyGreetingHeader.swift`. |
| **`A-101` / `RL1E-16`** | PROGRAM.md §3 · L1-E's exit criteria says the delete-account sentence names what is deleted, what is retained **"and for how long", agreed with L1-A**. This deck's sentence names what is deleted and what is retained but **states no retention period, deliberately**: there is no purge window anywhere in the code — `purge_client_account` (00538) never writes to `proposals`, `projects`, `invoices`, `client_decisions` or `designer_clients`, and `delete-account/index.ts` schedules nothing — so any number would be a claim the product cannot keep, on the one screen App Review reads under 5.1.1(v). **Recorded as an explicit exception to that exit criterion, for Fable to ratify**, rather than left as a silent deviation. L1-A's acknowledgement is requested in `l1-a-notes.md` so "agreed with L1-A" has a referent. |
| **`C5-09` / `RL1E-10`** | The finding's `where` names eight sites. **All eight now have rows** — the scope decision revision 1 made silently (cover the sharp slice, defer the sweep) is not needed, because the remaining seven are one-line label edits. What *is* still deferred, and recorded here: `CrossRoomView`'s sibling tabs `"By Category"` / `"By Maker"` are Title Case, which is `C5-10`'s sweep, not `C5-09`'s noun collision — W2. |
| **`A-79` / `RL1E-04`** | `Features/Collections/Views/LocalStoreClaimSheet.swift` has **no W1 owner**, which under L1-E's own ownership rule made it L1-E's file to edit. L1-A applied both rows verbatim before the fix round opened. Recorded rather than re-applied; `GuestPromiseTests` pins the result either way. The steward should confirm the file's owner in the merge plan. |
| **`Services/Companion/**` / `RL1E-22`** | Edited by L1-E under the "no other lane owns it" clause while L1-C rewrites `Features/Companion/**`. Permitted as written, but worth the steward's eye: the file is the Companion's *error voice* while L1-C rewrites the Companion's *surface*. Two repairs in it (`.badRequest`, and `PickIntroductionError.failed` in the sibling service) are **no-id fixes**, recorded above rather than filed as new findings. |

## Not applied this wave, with reasons

| id | reason |
|---|---|
| `A3-28` | The fix's migration half is **explicitly reverted by ruling B2 v3** (`l1-a-notes.md`): "`handle_new_user` is now 00313 verbatim." `profiles.role` is ruled a label, not an authorization input, and the OAuth-mislabelling half of this finding's evidence is separately closed by `A3-07` (W1 · L1-A). What survives into copy is that no role word is *rendered*: `Services/API/ProfileLookupService.swift:39-44`'s `bestName` already collapses `"client"`/`"homeowner"` to one word, `"Client"`. **`NounConsistencyTests.roleWordsCollapseToOnePerKind` now pins that** (`RL1E-20`) — revision 1 closed the row with a grep in prose that nobody could re-run. The vocabulary reconciliation at the schema layer is W2 · L0.2's `DM-1` `profile_private` split. |
| L0.4's tour "Studio" wording | **Already correct in the binary, and a Kody-run CMS publish otherwise.** `Features/Help/FirstLaunchTour.swift:291-297`'s fallback already reads `"Your Studio"` / `"Your studio — projects, proposals, invoices and files"`, byte-for-byte what `build/waves/w0/sanity-tour-copy.md` §3 proposes. The stale `"Your profile"` a walker saw came from Sanity's current production content, which overrides the binary. |
| L0.1's seven permission sentences (`A2-12`) | Reviewed in full below; **not applied this wave** — `build/waves/w1/steward.md` §5.6: "`L0.1` is closed — its deck row (`A2-12`) is a **W2** carry-forward, not a W1 apply target", because `project.pbxproj`'s `INFOPLIST_KEY_NS*UsageDescription` build settings are not a W1-owned file for any lane. |

---

## L0.1's seven permission sentences — reviewed, held for W2

Source: `build/waves/w0/l01-notes.md` N1. The build settings win over `Info.plist` (already enforced by
`PermissionStringTests` — L0.1 shipped that); these are the strings for whoever owns
`project.pbxproj`'s `INFOPLIST_KEY_NS*UsageDescription` entries in W2 to paste in, unchanged from what
is reviewed here.

| key | today (shipped) | final (reviewed) | note |
|---|---|---|---|
| `NSCameraUsageDescription` | `Patina uses your camera to walk through your space together and visualize furniture in your room.` | `Patina uses your camera to walk through your space and show furniture in your room.` | "together" is a stray collaborative-voice word with nothing on the other end of it; "visualize" → "show". |
| `NSFaceIDUsageDescription` | `Patina uses Face ID to securely confirm sign-in requests from the web` (no terminal period) | `Patina uses Face ID to confirm sign-in requests from the web.` | "securely" is filler — Face ID confirming a sign-in *is* the security; added the missing period. |
| `NSMicrophoneUsageDescription` | `Have a voice conversation with Patina about your space and style.` | `Patina uses your microphone for voice conversations about your space and style.` | Imperative → "Patina uses X to Y." per `A2-12`'s own fix line. |
| `NSMotionUsageDescription` | `Patina uses motion data to detect when your device is steady for capturing the best room photos.` | `Patina uses motion data to tell when your phone is steady enough for a clear room photo.` | "detect"/"capturing the best" is measurement-instrument language. |
| `NSPhotoLibraryAddUsageDescription` | `Patina saves AR previews and room captures to your photo library when you ask` (no terminal period) | `Patina saves AR previews and room photos to your library when you ask.` | "captures" → "photos"; added the missing period. |
| `NSPhotoLibraryUsageDescription` | `Save room designs and furniture visualizations to your photo library.` | *(no rewrite — recorded, not deleted)* | L0.1's own note confirms this permission has **no real call site** and is a W2 candidate for deletion, not a rewording. |
| `NSSpeechRecognitionUsageDescription` | `Speak naturally with Patina instead of typing.` | `Patina uses speech recognition so you can talk instead of type.` | The two voice permissions should read as one pair. |

---

## Tests this deck's rows are pinned by

`RL1E-02`: revision 1 asserted all seven suites had been written; four had not. All seven now exist in
`apps/mobile/Patina/PatinaTests/`, plus one this lane added for `C4-08`:

| suite | rows it pins |
|---|---|
| `ErrorVoiceTests` | `C4-08`, `C4-09`, `C5-11`, and `RL1E-08`'s one-punctuation-rule / one-network-sentence assertions, and `RL1E-13`'s "the raw detail is still logged" |
| `NounConsistencyTests` | `C5-09` (all eight sites), `A-60`, `C-22`, `C5-16`, `A3-28` |
| `BrandVoiceLintTests` | `C5-20`, `A-06` (including its lint half), and the style quiz's two "Curated" labels |
| `GreetingWindowTests` | `C5-06` — the three greetings **and** the six hour bands |
| `PluralisationTests` | `C-30`, at both `ProfileView` call sites |
| `SentenceCaseTests` | `C5-10`, per site, including the two the fix round found |
| `GuestPromiseTests` | `A-52`, `A-79`, `B-23` |
| `ARPlacementFailureCopyTests` | `C4-08`'s fixed sentence and the toast that no longer prefixes it |

**How they behave before the merge.** Every assertion over a file this lane does not own is wrapped in
Swift Testing's `withKnownIssue`, naming the deck row and the owning lane. On this branch the suite is
**green** — `ios-gate.sh unit`: *"Test run with 1600 tests in 178 suites passed after 4.538 seconds
with 55 known issues"* — and each wrapper records the expected failure. At the deck pass, after L1-E
rebases onto the integrated tip, a wrapper whose row has landed fails with **"Known issue was not
recorded"**: that is the signal to delete the wrapper, and the commit that does so is the proof the row
landed. A wrapper that *keeps passing* after the rebase means the row was never applied — the fix round
PROGRAM.md §3 · L1-E describes. Revision 1 left five of these assertions bare, which meant a branch
handed to the steward with a red gate and no way to tell designed-red from real-red at six merges.
