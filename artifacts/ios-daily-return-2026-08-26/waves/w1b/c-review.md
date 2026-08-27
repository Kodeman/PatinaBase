# W1b — Lane C review (identity, reach & notify)

Adversarial review, separate context. Read-only against `daily-return/w1b-c` @ `294ecc0fa` (11
commits on `main` @ `5b5c0c054`), the lane's task list (`c-tasks.md`), integration notes
(`c-notes.md`), the steward's owned-file map (`steward.md`), the shared planks (SP-03, SP-08, SP-09,
SP-19, SP-20 in `source/shared-planks.md`), the rulings (`source/rulings-2026-08-27.md`) and the
build-plan critique. No build run; every claim below was checked by reading the diff and the
surrounding source tree.

**Overall:** the lane delivers everything its task list commits to, the tests are real (each
source-pinned or behavioral test fails without its corresponding code change, verified by reading
both), the ownership boundary is honored with one disclosed and defensible exception, and the
honesty/brand-voice rules are followed throughout (no vendor error text, no fabricated data, Q7's
sentence is verbatim down to the punctuation). One real correctness bug survives, in the bell/Studio
merge logic, that the shipped test suite does not exercise.

---

## Findings

### 1. MAJOR (confidence: high) — the bell/Studio merge suppresses by type, not by entity, and can silently hide real "awaiting you" rows

**File:** `apps/mobile/Patina/Patina/Features/Notifications/ViewModels/NotificationsViewModel.swift:141-149`

```swift
static func merge(real: [AppNotification], fallback: [AppNotification]) -> [AppNotification] {
    guard !real.isEmpty else { return fallback }
    let covered = Set(real.compactMap(\.entityType))
    let surviving = fallback.filter { row in
        guard let entityType = row.entityType else { return false }
        return !covered.contains(entityType)
    }
    return real + surviving
}
```

`covered` is a set of **types** (`"proposal"`, `"invoice"`, `"decision"`), not entity ids. Once a
single real `notification_log` row of a given type exists, **every** Studio-fallback row of that
same type is dropped — including fallback rows for a *different* entity of the same kind that the
backend never wrote a row for.

**Failure scenario:** two proposals are awaiting the client's signature. Proposal A was sent through
the live `proposal-send` path and has a real `notification_log` row (type `proposal`). Proposal B
predates 00534, or was created directly, and has none — exactly the situation SP-08's own plank text
describes ("the review's seed bypassed [proposal-send]"). `NotificationsViewModel.currentFallbackRows`
composes a fallback row for both A and B from `StudioQueueBuilder`'s `awaitingYou` section. `merge`
sees `real = [A]`, computes `covered = ["proposal"]`, and drops **B's fallback row too**, because the
filter only checks `row.entityType`, never `row.entityId`. The bell now shows one proposal while the
Studio shows two — the exact class of contradiction (`"the bell can never contradict the Studio"`)
SP-08 exists to close, reproduced by the fix itself in the mixed-coverage case.

The plank's own stated risk (`shared-planks.md` SP-08, Size/Risk) is explicit: *"Duplicate or
contradictory rows if both the fallback and the log rows render — de-duplicate on entity id."* The
shipped code de-duplicates on entity **type**, not entity **id**.

**Why the test suite doesn't catch it:** every fixture in `BellQueueFallbackTests.swift` builds a
`StudioQueueSnapshot` with at most **one** row per kind (`decisionFixture`, `proposalFixture`,
`invoiceFixture` are each a single-element array). `fallbackDedupesAgainstRealRows` and
`emptyLogFallsBackWholesale` both exercise only the one-real/one-fallback-of-the-same-entity case,
which is indistinguishable from correct entity-level dedup. No test constructs two Studio rows of the
same kind with only one carrying a real row, so the bucket-vs-entity distinction is never exercised.

**Fix shape:** key `covered` on `"\(entityType)|\(entityId)"` the same way `collapseDuplicates` already
does two functions above it, and filter fallback rows against that compound key instead of the bare
type.

### 2. MINOR (confidence: medium) — T1's brief asked for `.contentShape(Rectangle())` on four row builders; only one got it, and the covering test can't tell

**File:** `apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift`

`c-tasks.md` T1 says: *"in `settingsRow(...)`, `settingsToggleRow(...)`, `contextMemoryToggle` and
`appearanceRow`, add `.frame(minHeight: 44)` and `.contentShape(Rectangle())`... so the whole row,
Spacer included, is the tap target."* The diff adds `.frame(minHeight: 44)` to all four, but
`.contentShape(Rectangle())` only to `settingsRow` (the label used by the Account `NavigationLink`
and every `settingsButtonRow`). `settingsToggleRow`, `contextMemoryToggle` and `appearanceRow` are not
wrapped in a `Button`/`NavigationLink` — their tap surface is the embedded `Toggle`/`Picker` control
itself, not the row — so there's a real argument the "dead Spacer" bug the bisect found doesn't apply
to them and the extra modifier would have been a no-op. That argument is plausible but it is not made
anywhere: the report and `c-notes.md` are silent on the three-of-four gap, and it isn't obviously true
for `contextMemoryToggle`/`appearanceRow`, whose trailing controls (`Toggle`, `Picker(.menu)`) sit
flush against the trailing edge with a `Spacer()` before them — a tap just left of the control is
still dead space under `.buttonStyle(.plain)`'s hit-testing on a bare `HStack` (no Button wraps
these rows at all, so `.buttonStyle(.plain)` doesn't apply here — but there is likewise no
`.contentShape` making the row itself register a tap independent of the native control's own hit
area, which is the literal thing the brief asked for).

The test that's supposed to guard this, `ChromeReachTests.settingsRowsAreFullyTappable`, only checks
`source.contains(".contentShape(Rectangle())")` and `source.contains("minHeight: 44")` against the
**whole file** — it passes as long as the string appears anywhere, so it cannot distinguish "all four
rows fixed" from "one row fixed." The test's name ("every settings row...") promises more than the
assertion verifies.

Low functional risk (no report of the other three rows having dead centers), but worth a scoped
source-pin (or a walk that taps the middle of the toggle rows, not just their controls) before this is
called closed.

### 3. MINOR (confidence: low) — the new `AuthSheet` chrome (NavigationStack + always-on Cancel) reaches three call sites the walk doesn't cover

**File:** `apps/mobile/Patina/Patina/Features/Authentication/Views/AuthSheet.swift`

Per `c-tasks.md` T3, `AuthSheet.body` now unconditionally wraps `gate` in a `NavigationStack` with a
`.navigationTitle(title ?? "")` and a `.cancellationAction` Cancel button — this is exactly what the
task list specifies, so it is not an implementer deviation. But `AuthSheet()` (no title) is also the
view behind three other call sites outside SP-09's scope: the app-level `.auth` sheet
(`ContentView.swift:112`), the Studio hub's sign-in CTA (`StudioHubSection.swift:308`), the
notification feed's guest CTA (`NotificationFeedView.swift:195`), and the Companion overlay's sign-in
prompt (`CompanionOverlay.swift:561`). All four now render a nav bar strip with a blank title and a
visible "Cancel" where before there was none. The report's shots (`shots/w1b-c-*.png`) and claim
levels only cover the design-request soft wall (shots 02–04); nothing confirms the other three still
look right with the new chrome (blank-title nav bar, Cancel button placement) rather than looking like
an unfinished screen. Likely fine — `showGuest: false` means there's no competing dismiss affordance
to duplicate — but it's an un-walked side effect of a shared-file change, worth a line in the W2 walk
rather than assumed.

---

## What checks out

- **SP-20 bisect (T1):** the stated cause — `settingsRow`'s `Spacer()` swallowing centred taps under
  `.buttonStyle(.plain)` — is real: `settingsRow` (SettingsView.swift:353-376) is the label for both
  the Account `NavigationLink` (line 64) and every `settingsButtonRow` (327-332), and adding
  `.contentShape(Rectangle())` there is the correct single-point fix for all of them at once (fixing
  one shared builder rather than each call site). This is a better fix than the brief's literal
  "touch four functions," not a worse one, for the Button/NavigationLink rows — see Finding 2 for the
  gap in disclosure and test coverage.
- **SP-20 Sign Out / Delete Account (T2, T2b/294ecc0fa):** `APIConfiguration.Endpoint.deleteAccount`
  correctly repointed from the non-existent `/rest/v1/rpc/delete_user_account` (verified: no such RPC
  in any migration, matching critique B5) to `POST /functions/v1/delete-account`, method changed
  `DELETE`→`POST` to match. `AccountDeletionService` sends only the caller's bearer token (no id in
  the body — cannot be aimed at another account), never surfaces the response body outside `#if
  DEBUG`, and the shipped ordering asks the server **before** tearing down the UI (`294ecc0fa`
  correctly fixes an ordering defect where the original T2 cut tore the UI down first). Settings and
  AccountView carry identical confirmation/failure copy from one shared source
  (`AccountDeletionService.confirmationTitle/confirmationBody/failureCopy`), so the two surfaces
  cannot disagree. `LocalStoreReset.wipeUserScopedData()` (lane A's file, read-only use) is called
  only after a verified 2xx.
- **SP-09 (T3):** `AuthSheet` gains a `title` parameter with a default that keeps
  `AuthSheet()` compiling at its one pre-existing call site; the design-request flow presents
  `AuthSheet(title: DesignRequestAuthCopy.wallTitle)` and clears `awaitingAuthToSend` via
  `.onChange(of: showAuthSheet)` so a Cancel returns to an intact Review step (the `@State var
  awaitingAuthToSend` guard at `DesignRequestFlowView.swift:83-87` only auto-sends when both
  `isAuth` and the flag are true, so clearing the flag on dismiss correctly prevents a stray send).
  The review hint renders only when `!authService.isAuthenticated`, matching the plank's "said on the
  way in."
- **SP-19 Hearth (T4):** the diff removes exactly the `.background { PatinaColors.Background.primary
  .ignoresSafeArea(edges: .bottom) }` block and nothing else — height (120), `allowsHitTesting(false)`
  and `accessibilityHidden(true)` are byte-identical to before. Matches C8 ("a reserved layout region,
  never a painted bar") precisely.
- **SP-19 unit control (T5):** `ScanFallbackEntryView.Unit` gains `CaseIterable`/`Identifiable`; the
  two-button toggle is replaced with a real `Picker(.segmented)`; every `UserDefaults` write and the
  `onAppear` restore are deleted (not merely bypassed); `metres(from:unit:)` is extracted as a static,
  testable function and `submit()` is refactored to call it — the conversion arithmetic
  (`value / 3.28084`) is unchanged. The steppers are wrapped in an outer `.frame(width: 44, height:
  44).contentShape(Rectangle())` around the existing 32×32 circle, correctly growing the tap target
  without changing the drawn art, and the row height grows 48→56 so the new 44pt circles don't clip.
- **SP-19 dark-mode fix (T5):** `ScanFloorPlanPreviewView`'s five raw-constant call sites
  (`offWhite`/`charcoal`/`pearl`) are all routed onto the semantic tokens (`Background.primary`,
  `Text.primary`, `Text.inverse`, `Interactive.active`, `Text.muted.opacity(0.3)`), matching the
  plank's prescribed mapping exactly. Correctly disclosed as compile-green + source-pinned only (not
  sim-walked) since the screen sits after a real LiDAR scan.
- **SP-03 (T6):** `PatinaDeepLinks.piece(_:)` builds the correct client-host URL;
  `productURL(forProductId:)` becomes a delegate, so A's three `ShareLink` call sites need no edit —
  verified true no-op for lane A. `DeepLinkHandler.route(forUniversalLink:)` is a pure static function,
  checked before the `patina://` scheme guard (previously the guard dropped `https` links outright,
  verified at the old `:62-64` position), scoped to `client.patina.cloud` only (`app.patina.cloud` and
  any other host correctly rejected, unit-tested). The entitlement is added with no `project.pbxproj`
  edit, consistent with `CODE_SIGN_ENTITLEMENTS` already pointing at the file (verified at pbxproj
  lines 505/553) — the diff confirms no pbxproj changes accompany this commit.
- **SP-08 durable-read half + the twin-row/type-spelling fixes (T7, dc2c9d47e):** `AppNotificationType`
  now decides its bucket from `metadata.entity_type` first (matching what `NotificationRouter` already
  routes on) and falls back to the `type` string only when `entity_type` is absent — this correctly
  survives lane D's actual `decision_attention` spelling, which was not anticipated by the `type`-only
  table alone. `collapseDuplicates` correctly folds 00534's two rows (`in_app`/`push`) per event onto
  one, preferring a read copy, and leaves entity-less rows untouched — this part **is** scoped
  correctly to `entityType|entityId` (contrast with Finding 1, where the *merge* step regresses to
  type-only). The empty CTA (`emptyCTATitle`) is a pure static function, correctly branches on the live
  relationship before falling back to the request-tier check, and a roster-only (non-live) relationship
  correctly still reads "Get design help" rather than offering a conversation with no counterpart.
- **SP-08 primer (T8):** the sentence is verified **character-for-character** against
  `rulings-2026-08-27.md` Q7, including the straight ASCII apostrophe (U+0027) and em dash (U+2014)
  — I diffed both files' codepoints directly. The once-per-install `UserDefaults` key
  (`patina.push.hasPromptedAfterFirstSubmission`) is unchanged across the rename, so an install
  already prompted via the old design-request call site is correctly never re-prompted. The gate is
  armed by the *presenter* (`DailyRoomView.presentPushPrimerIfEarned`), not by the pure predicate
  (`PushPrimerTrigger.shouldPresent`), so checking eligibility never burns the one ask — verified this
  is actually true by reading `shouldPresent`/`hasMoneyMoment`, which touch no `UserDefaults` write.
  `dc2c9d47e`'s re-check on `.onChange(of: AuthService.shared.isAuthenticated)` correctly closes the
  gap where a guest who signs in inside `DailyRoomView`'s lifetime would otherwise never see the primer
  until relaunch (the view's original `.task` only runs once). The one-line removal in
  `DesignRequestCoordinator.swift` is disclosed as an ownership exception in both `c-notes.md` §4 and
  the report, with a correct rationale (no other lane's row covers `Services/DesignServices/**`) and
  the exact diff shown.
- **companion-context fix (T9):** correctly identified as an app-side duplicate-fetch defect, not
  retry behaviour. `CompanionOverlay.swift` (lane A's carve-out) is untouched; `updateContext(_:)`'s
  signature is unchanged so the carve-out's three call sites keep compiling. `fetchAPIQuickActions()`
  still always fetches when called directly (an explicit refresh is not gated), and marks the gate
  afterward so a subsequent `updateContext` for the same screen doesn't immediately re-fetch.
- **Ownership:** every file touched matches the steward's §6.3 map for lane C, with the one disclosed
  exception (`Services/DesignServices/DesignRequestCoordinator.swift`, one line, justified and shown in
  both `c-notes.md` and the report). No edits found in any file the map assigns to A, B or D. All eleven
  commits' file lists match their Conventional Commit messages (checked via `git show --stat` per
  commit).
- **Test count:** the report's "+49 tests, 720 total" is arithmetically verified — the five new test
  files sum to 6+6+16+5+7 = 40 `@Test` functions, plus 4 added to `AuthSheetPresentationTests` and 5 to
  `PushTokenServiceTests`, totalling exactly 49.
- **Compilation sanity:** spot-checked every new symbol reference against its actual declaration on
  this branch (`AppRoute` cases, `PatinaColors` tokens, `StudioQueueInput`/`StudioQueueSnapshot`/
  `StudioQueueRow` fields, `MessagingAPIClient` signatures, `DesignerRelationship`/`Resolver`,
  `BadgeCountService` retained-row properties, `PatinaLog` categories, `AppCoordinator
  .beginSplashTransition()`, `LocalStoreReset.wipeUserScopedData()`) — no undefined-symbol risk found.
- **Honesty / brand voice (C5/C6):** no vendor or system error text is rendered anywhere in the new
  code (the delete-account failure path is Patina's own sentence, logged raw only under `#if DEBUG`);
  no fabricated read/unread state or timestamp on composed Studio-fallback rows
  (`isStudioFallback`/`fallbackRoute` correctly suppress the unread dot, "Mark all read," swipe-to-read
  and the timestamp for synthetic rows); no invented figures.

---

## Not evaluated here (out of this review's scope)

- Simulator/device claims (bisect taps, shot contents, the psql output showing 00534's live rows,
  the curl 404 against the local `delete-account` function) — these are the report's own claims from a
  build+run this review did not perform, per instructions. Nothing in the diff contradicts them.
- Lane D's migration/edge-function correctness, lane A's/B's files, and the cross-lane integration
  notes' eventual application — reviewed only for whether lane C's *notes* are accurate about what it
  needs from those lanes, not whether those lanes will deliver it correctly.
