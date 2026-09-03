# W1 · L1-C — integration notes

Notes addressed **to** L1-C. Each is a numbered task for L1-C's own task list, carrying exact final
text. A note nobody schedules is not a plan.

---

## From L0.4 (Help & tour content) — 2026-09-02

**Why.** All six `?` help doors in the app query Sanity for `contentType == "helpArticle"` documents at
their surface key or an ancestor of it. **Production has 41 such documents and not one is under
`ios-app`** — read 2026-09-02, `count(*[_type=="helpContent" && contentType=="helpArticle" &&
surfaceKey match "ios-app*"]) → 0`. Every door therefore opens on *"No help articles yet — Help content
for this screen is on the way."* That is `C5-02`. Under **D1** all six are reachable on the four-tab
root a round-one tester sees on day one.

Round one **hides the doors** rather than authoring under time pressure. Authoring would not help in
build 1 anyway: the article-list request is malformed and returns HTTP 400 on every surface (`R-10`,
routed to L1-B — see `l1-b-notes.md`), so a freshly authored article would still render as an empty
panel. Full evidence, per door, with the live per-key probe results: `build/waves/w0/help-doors.md`.

**Scope of these notes: hide the trigger only.** In every case the `HelpPanelSheet` / `.helpPanel`
wiring stays exactly where it is. Two source-text tests assert it is present —
`PatinaTests/ProductDetailRoomSaveTests.swift:229` and `PatinaTests/CompanionSheetDriverTests.swift:77`
both `#expect(source.contains("HelpPanelSheet("))` — and removing the sheet turns them red for no gain.
W2 restores the buttons once the articles exist.

### Task C-L04-1 — Today: stop passing the help closure

`apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:255`

Replace:

```swift
                    onHelpTap: { isHelpPanelPresented = true },
```

with:

```swift
                    // Round one: no ios-app/* help articles exist, so the `?`
                    // would open on an empty panel (C5-02). W2 restores it.
                    onHelpTap: nil,
```

`DailyGreetingHeader.swift:114` already renders the button only `if let onHelpTap`, so the header needs
no edit. Leave the `.helpPanel(…)` modifier at `:188-191` and the `isHelpPanelPresented` state at `:30`
in place.

### Task C-L04-2 — Companion: stop passing the help closure

`apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift:360-366`

Replace:

```swift
                onHelp: {
                    collapseToButton()
                    Task {
                        try? await Task.sleep(for: .seconds(0.3))
                        presented = .help
                    }
                },
```

with:

```swift
                // Round one: no ios-app/companion help articles exist, so the
                // `?` would open on an empty panel (C5-02). W2 restores it.
                onHelp: nil,
```

`CompanionHearthView.swift:409` already renders the chip only `if onHelp != nil`, so the hearth needs no
edit. Keep the `case .help:` arm at `:567-577` — `CompanionSheetDriverTests.swift:77` depends on it.

### Task C-L04-3 — Piece detail: remove the `?` chip

`apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:330-341`

Delete these twelve lines (the comment, the button, and the blank line after it):

```swift
                            // Contextual help panel — tap the `?` chip to open
                            // a sheet listing every help article for this
                            // surface (`ios-app/product-detail`).
                            Button {
                                presented = .help
                            } label: {
                                floatingCircleButton(icon: "questionmark")
                            }
                            .accessibilityLabel("Help")
                            .accessibilityHint("Opens the help panel for this product.")
                            .accessibilityIdentifier("ProductDetailView.HelpButton")

```

Leave `Spacer()` at `:328` — it pushes the trailing controls right, and Back stays hard left without it
doing anything else. Leave the `case .help:` arm at `:162-170`
(`ProductDetailRoomSaveTests.swift:229`).

One consequence to check while you are in the file: the comment at `:342-348` on the Share button ends
*"so the share-action help copy ships through the help panel (`?` button) instead."* That sentence
stops being true. Replace its last clause with `…so the share-action help copy is deferred to W2 with
the rest of the ios-app help articles.` — comment-only, no behaviour.

### Task C-L04-4 — Studio: remove the `?` corner

`apps/mobile/Patina/Patina/Features/Profile/Views/ProfileView.swift:37-57`

Delete the whole leading-edge `HStack` including its comment and its `.padding(.horizontal, 24)`:

```swift
                    // Top-right `?` help-panel trigger. Placed in a leading-
                    // edge HStack so it lives in the corner of the profile
                    // header without disturbing the centered avatar layout.
                    HStack {
                        Spacer()
                        Button {
                            isHelpPanelPresented = true
                        } label: {
                            Image(systemName: "questionmark.circle")
                                .font(.system(size: 17, weight: .regular))
                                .foregroundStyle(PatinaColors.Text.secondary)
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Help")
                        .accessibilityHint("Opens the help panel for your profile.")
                        .accessibilityIdentifier("ProfileView.HelpButton")
                    }
                    .padding(.horizontal, 24)

```

**Do not leave an empty `HStack`** — it holds nothing else, and with `.padding(.horizontal, 24)` it
would still reserve the 44 pt row above the avatar. Leave the `.helpPanel(…)` at `:182-185` and the
`isHelpPanelPresented` state in place.

Because this is the Studio **tab root** under D1 (`TabRoot.swift:78-81`) it is on the layout critical
path L1-C already owns; take the vertical rhythm of the header into account when the row goes away.

### Task C-L04-5 — the two doors L1-C does not own

Recorded here so the picture is complete; **do not edit these files.**

| Door | File | Owner | Note lives at |
|---|---|---|---|
| Spaces (tab 2) | `Features/Rooms/Views/YourSpacesView.swift:138-152` | `Features/Rooms/**` → **L1-B** | `build/waves/w1/l1-b-notes.md` |
| QR sign-in | `Features/QRAuth/Views/QRScannerView.swift:59-77` | `Features/QRAuth/**` → **L1-A** (§3 residue table) | verbatim block below — **Fable must place it as `l1-a-notes.md`** |

> ⚠ **Ownership conflict for the steward to settle before L1-C starts.** PROGRAM.md §3 gives
> `Features/Rooms/**` to **L1-B**, but L1-C's *"Notes this lane applies"* paragraph lists
> `YourSpacesView` among the files L1-C edits (L1-B's `.refreshable`, `C4-12`/`R-03`). Two lanes
> cannot both write it. The glob is treated as authoritative here and the door note is filed with
> L1-B; if the steward rules the other way, move Task B-L04-1 into L1-C's list unchanged.

**The QR block, exact final text, for L1-A** —
`apps/mobile/Patina/Patina/Features/QRAuth/Views/QRScannerView.swift:59-77`, delete:

```swift
                    // `?` help-panel trigger — surfaces the QR sign-in
                    // articles (what is QR sign-in, security model, etc.).
                    Button {
                        isHelpPanelPresented = true
                    } label: {
                        Image(systemName: "questionmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(PatinaColors.Text.primary)
                            .frame(width: 36, height: 36)
                            .background(
                                Circle()
                                    .fill(PatinaColors.Background.secondary.opacity(0.8))
                            )
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Help")
                    .accessibilityHint("Opens the help panel for QR sign-in.")
                    .accessibilityIdentifier("QRScannerView.HelpButton")
```

`Spacer()` at `:78` then `closeButton` at `:79` keep ✕ hard right with the leading control gone. Leave
the `.helpPanel(…)` at `:102-105`. The scanner itself must still open — R1's device row **D-06**
exercises it on Kody's phone.

### What these notes deliberately do NOT touch

- **`HelpInfoIcon` / `HelpTooltip`** — a different path (single document, `contentType == "tooltip"`,
  inline Swift fallback on a miss). Not part of `C5-02`; leave every one of them mounted.
- **The first-launch tour** — its three Sanity bodies are a content publish, not code
  (`build/waves/w0/sanity-tour-copy.md`). The binary fallbacks at `FirstLaunchTour.swift:274-299` are
  already correct and are what Sanity is being made to match; **do not change them**, or the
  publish drifts from the build the day it lands.
- **`HelpPanelSheet`'s empty/error copy** — `R-10`'s other half, L1-B's (`l1-b-notes.md`).

### VISION check on these notes

None of the four fixes adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an
engagement mechanic or the word "AI" — every one of them **removes** a control. The Studio-tab door in
Task C-L04-4 sits on the tab bar D1/V7 has already logged as the iOS app's dated exception.

---

## From L1-E (Copy) — 2026-09-02

Six rows, exact final text. Full reasoning for each in `build/waves/w1/l1-e-copy-deck.md`.

### Task C-L1E-1 — `A-60` + `C-22`, `CompanionActionRows.swift`'s two rows (done together)

Both findings land on the same two functions and are resolved by one coherent rename, not two
independent edits — see the deck for the full reasoning.

- `:36-39` (`profileRow` — the row that actually routes to `.profile`, the screen the Studio tab/pill/
  tour already all call "Studio"): label `"Your profile"` → **`"Your studio"`**; hint
  `"Style · Settings · Portal"` → **`"Style · Settings"`** (the Portal clause is dropped —
  `PatinaPortalLinks.swift` has zero call sites, nothing named Portal exists to open).
- `:51-54` (`studioRow` — routes to `.projectList`, a plain project list, not the hub the old name
  implied): label `"Your studio"` → **`"Your projects"`**; hint `"Projects · Messages · Decisions"` →
  **`"Projects"`**. This new label is now identical to `projectsRow()`'s existing label
  (`:56-58`) — a real redundancy (two rows, same name, same destination) that C-22's own judge note
  leaves as T1/T2 structural work; flagged here, not merged by this note.

> ⚠ **File-overlap flag for the steward.** This file is also touched by `l1-a-notes.md`'s `A-52` note,
> at `:32-34`/`:220-223` — different, non-overlapping lines from this task's `:36-54`. L1-C merges
> first (D14), so this task lands cleanly; L1-A rebases onto it.

### Task C-L1E-2 — `A-60`'s other half, `ProfileView.swift:148`

`Text("YOUR PROFILE")` → **`Text("MORE")`**. Not literally "YOUR STUDIO" — the screen's own tab title
already carries that word once (`:176`), and this section's rows (Retake Style Quiz / Get design help
/ Settings) are not the studio business objects ("projects, proposals, invoices and files") the tour's
copy describes; repeating "Studio" a second time on the same screen would trade one collision for a
smaller one. "MORE" removes the retired word without asserting a claim the section doesn't back up,
and matches the plain, unadorned mono-label style `"YOUR ROOMS"` (`:134`) already sets two sections
above it.

### Task C-L1E-3 — `C-30`, the pluralised stat label

`ProfileView.swift:201,207` (`statItem(value: "\(viewModel.roomCount)", label: "Rooms")` — static,
renders `"1 ROOMS"` at count 1): `label: "Rooms"` → **`label: viewModel.roomCount == 1 ? "Room" :
"Rooms"`**. `MonoLabel` applies the uppercase tracking; passing the already-inflected word is the
whole fix.

### Task C-L1E-4 — `C-38`, drop the browse-card rationale line

`Features/Recommendations/Views/RecommendationsView.swift:413-421` (`recommendationRationale`) —
`return "Selected from Patina's room-aware edit for \(scopedRoomName)."` → **`return nil`**. Matches
what the Pieces tab already does; the `tastePortrait` branch above it is unchanged.

### Task C-L1E-5 — `B-20`, the room CTA

`Features/Rooms/Views/RoomProjectView.swift:254` (`emptyBlock`) —
`cta(primary: "Browse pieces for the \(room.name)")` → **`cta(primary: "Browse pieces for this
room")`**. Fixed label rather than interpolating an article — no article rule is safe for every room
name a client might type.

### Task C-L1E-6 — `C5-05`, structural only, no string

`Features/Settings/Views/SettingsView.swift:153-155` — the row label `"Help Center"` is unchanged (a
proper noun, not a casing violation). This is L1-C's own row (routed `⇢L1-E` in
`findings-by-lane.md`); the fix needed is structural — point the row at the in-app `HelpPanelSheet`
instead of the dead `/help` URL, or remove the row until `/help` exists — and no L1-E word is coming
for it. Flagged so this task is not left waiting on a copy row that was never going to arrive.

### VISION check on this note

None of the six rows adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an
engagement mechanic or the word "AI" — all six are label rewrites or a dropped line.

---

# From L1-A (Welcome, sign-in, onboarding) — 2026-09-02

### Task C-L1A-1 — `B-13`: the guest Studio's CTA signs you in

`Features/Profile/Views/StudioHubView.swift:131` (inside `guestState`). The card offers a text link
**"Open settings"**, and Settings then contains no sign-in row either, so the guest's only route was a
QR scanner that needs the session they have not got. L1-A's half — a real signed-out Account state and
a `presentedSheet = .auth` door — is done in `AccountView.swift`; this is the card that points at it.

Replace, verbatim:

```swift
            Button("Sign in") {
                coordinator.presentedSheet = .auth
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityHint("Opens the sign-in screen.")
            .accessibilityIdentifier("StudioHub.GuestSignInButton")
```

The two `Text` lines above it (`:121-128`) are unchanged. `AuthSheet()` is what `.auth` presents; it
dismisses itself the moment a session lands (`AuthSheet.swift:79-81`), so nothing else is needed here.

### Task C-L1A-2 — `C1-14`: Settings offers a guest a way to sign in

`Features/Settings/Views/SettingsView.swift:62-76`. The **Account** `NavigationLink` and the
**"Sign in on the web"** row both sit ABOVE the `if authService.isAuthenticated` guard at `:77`, so a
guest sees a QR row that cannot work and no sign-in row at all.

Two changes inside `settingsGroup(title: "Account")`:

1. Move the **"Sign in on the web"** row inside the `if authService.isAuthenticated` block — it
   approves a *portal* sign-in with this device's session, which a guest does not have. (L1-A made the
   matching change in `AccountView.swift`: the QR row is now signed-in-only there too.)
2. Add, as the FIRST row in the group, guarded to the signed-out case:

```swift
                    if !authService.isAuthenticated {
                        settingsButtonRow(
                            icon: "person.crop.circle.badge.plus",
                            iconColor: PatinaColors.clay,
                            label: "Sign in or create your account"
                        ) {
                            coordinator.presentedSheet = .auth
                        }
                        .accessibilityIdentifier("SettingsView.SignInButton")
                    }
```

The **Account** `NavigationLink` itself stays where it is and needs no guard — `AccountView` now
renders a one-sentence signed-out state with its own "Sign in or create your account" button
(`AccountView.SignInButton`), so it is no longer a dead end.

### Task C-L1A-3 — `A-52`, from L1-E's copy deck, in L1-C's file

`build/waves/w1/l1-e-copy-deck.md` files two `A-52` rows under *"L1-A applies"* that land in
`Features/Companion/Services/CompanionActionRows.swift`, which is **L1-C's** glob
(`Features/Companion/**`, PROGRAM.md §3). L1-A did **not** apply them. Exact final text, from the deck:

- `:32-34` (`homeRow`) — guest hint `"See what's on Patina"`; signed-in, or a guest with local rooms,
  keeps `"Back to your space"`.
- `:220-223` (`pieceActRow`, `.askAboutPiece`) — guest hint
  `"Sign in and a designer will get back to you"`; signed-in with no designer yet
  `"A designer will get back to you"`.

Both need `isAuthenticated` (or `LocalStoreClaim.hasGuestWork` for the home row) threaded into the row
builders — the deck's own note. `:213-214` (`.askDesigner`) is **unchanged**; it is only reachable when
`relationship.isLive`, which a guest cannot be.

### Note C-L1A-4 — your tasks **A-L1C-1** and **A-L1C-2** are DONE (no action)

Both are **L1-C rows** whose only sites are in `Features/Authentication/**`, which is **L1-A's** glob.
PROGRAM.md §3 · L1-A says to "agree the split in writing on day 1" — this is that agreement, and the
work is applied, so **do not edit the tree**:

**`GAP1B-08` (your task A-L1C-1) — all six links, exactly your text.** Each `Button` (never the row)
carries `.frame(minHeight: 44)` then `.contentShape(Rectangle())`; the two legal links are framed
individually so they stay separately targetable:

| control | file |
|---|---|
| Terms of Service | `AuthScreenView.termsLink` |
| Privacy Policy | `AuthScreenView.privacyLink` |
| Have a password? Sign in | `AuthScreenView.passwordFallback` |
| Forgot password? | `AuthenticationView.modeSwitcher` |
| "Use magic link" → now **"Email me a code"** (`P-30`) | `AuthenticationView.modeSwitcher` |
| "Sign Up" → now **"Sign up"** (L1-E `C5-10`) | `AuthenticationView.modeSwitcher` |

Plus a seventh your measurement did not reach: **"Use a password instead"** on the code sheet.

Your suggested pin references a `SourceScan` helper that does not exist in `PatinaTests`; the real
pins are `LegalLinkTests.welcomeLinksMeetTheTapTarget` (the three on Welcome) and
`LegalLinkTests.signInSheetLinksMeetTheTapTarget` (asserts framed == links across the whole
`modeSwitcher` block, so a fifth link added later without a frame fails it).

**`P-34` (your task A-L1C-2) — items 1–3 applied, item 4 routed to L1-D.**

1. **ScrollView** — applied, but *unconditionally*, with `.scrollBounceBehavior(.basedOnSize)` rather
   than an `isAccessibilitySize` branch. Same result at accessibility sizes, and it also fixes the
   smaller sizes where the stack overflows once a status line is present; the bounce behaviour means
   it does not read as scrollable when it fits. Say the word if you want the branch instead.
2. **Multi-line / scaling labels** — applied to the wordmark, both headings, both provider rows and
   "Look around first" (`minimumScaleFactor` + `fixedSize(horizontal: false, vertical: true)`).
3. **Stacked legal links** — applied as your `ViewThatFits(in: .horizontal)`, horizontal row first,
   vertical stack as the fallback.
4. **The Apple button's fixed height** — L1-D's, per PROGRAM.md §3. Sent as task **D-L1A-1** below,
   together with `C3-03`.

One consequence worth knowing before you rebase: **the Google row is gone** (D3 / `A3-06` — the stack
is now rendered from `AuthProviderCatalog`, which asks `GET /auth/v1/settings`), so
`"Continue with…"` is no longer one of the labels that truncates.

---

## From L1-F (notifications, messaging, widget, deep links) — 2026-09-02

Full text, with the other three notes this lane sent, is at `build/waves/w1/l1f-notes-out.md`.

## L1F→C-1 → **L1-C** · the bell's unread count reads one service (`C2-07`)

**Finding.** `C2-07` (T0/major): *the bell's unread badge stays stale after reading the feed.* Read
every row, pop back, and the bell still badges 3.

**Cause, and the half L1-F has already fixed.** Two independent `NotificationsViewModel` instances —
Today holds one in `@State` (`DailyRoomView.swift:28`) and computes the badge from it (`:258`), while
`NotificationFeedView` holds its own (`:12`), and `markRead` / `markAllRead` mutate only the feed's.
Today reloads from `.task` (`:106-108`), once per mount, so popping back to a mounted Today refreshes
nothing.

L1-F has made `BadgeCountService` the single source: it now carries
`unreadNotificationCount`, `NotificationsViewModel` publishes into it on load and after every
mark-read (including both optimistic rollbacks), and `resetForSessionChange()` zeroes it.
`PatinaTests/BadgeFreshnessTests` pins all of that.

**What is left, and it is one argument in L1-C's file.** `DailyRoomView.swift` is L1-C's under the
contested-file table, which routes *"L1-F's badge binding"* here as an integration note. Replace
`DailyRoomView.swift:258`:

```swift
                    unreadCount: notificationsViewModel.notifications.filter { !$0.isRead }.count,
```

with:

```swift
                    // C2-07: one count, from the one service every surface
                    // reads. Today's private view model still drives the push
                    // primer (`presentPushPrimerIfEarned`); it no longer drives
                    // the badge, because marking a row read in the feed mutated
                    // a different instance and the bell went on badging 3.
                    unreadCount: BadgeCountService.shared.unreadNotificationCount,
```

**Nothing else in the file changes.** `@State private var notificationsViewModel` (`:28`) and its
`.task { await notificationsViewModel.load(); presentPushPrimerIfEarned() }` stay exactly as they are —
that `load()` is what arms SP-08 / Q7's push primer, and it is also what publishes the count on Today's
own mount. `BadgeCountService` is `@Observable`, so the bell repaints when the feed marks a row read
without Today re-running anything.

**The VISION ruling this carries**, from PROGRAM.md §3 · L1-F, so it travels with the change: the badge
stays *in one form only* — a single count of what needs you, on the bell and the app icon, and nowhere
else. No second badge, no badge on another surface, no red-as-meaning. L1-F adds no app-icon badge in
W1 (not in `C2-07`'s fix line).

**How L1-C can check it landed:** `BadgeFreshnessTests.thereIsNoSecondCount` scans
`Features/Notifications/**` for the old expression; the same expression in `Features/Home/**` is what
this note removes.


---

# From L1-D (Tokens, dark mode, contrast, iconography) — 2026-09-02

Appended by L1-D. The full set, with the notes sent to the other lanes, is
`build/waves/w1/l1d-notes-out.md`. Each block below is a numbered task for this lane's own
task list, carrying exact final text.

Written by L1-D on 2026-09-02 from `first-flight/w1-l1d` (base `ba83aa67f`). Every note below is
**also appended verbatim** to its target lane's inbox — `l1-a-notes.md`, `l1-b-notes.md`,
`l1-c-notes.md`, `l1-f-notes.md` — because a note nobody schedules is not a plan.

**What L1-D shipped that these notes depend on.** All of it is on `first-flight/w1-l1d`, in
`PatinaDesignKit` and this lane's four `Patina/**` files, and all of it merges **second**
(D14: L1-C → **L1-D** → L1-B → L1-F → L1-A → L1-X → L1-E). So every token named below exists by the
time any other lane rebases.

| New API | What it is for |
|---|---|
| `PatinaColors.Border.hairline` | The quiet rule: card edges, list separators, the tab bar's top line. Light `#E5E2DD` (unchanged) / dark `#322E29`. Replaces `PatinaColors.pearl` wherever pearl was drawing a **border or divider** |
| `PatinaColors.Border.strong` | The rule a tester is meant to see: field outlines, unselected chip edges, an "inactive step" fill. Light `#C8C3BB` / dark `#524C45` |
| `PatinaColors.Border.onDark` | A hairline on a `Background.dark` object, where the page behind it is what it has to separate from. Static `#756B61`, 3.18:1 on the dark canvas |
| `PatinaColors.OnDark.primary` / `.secondary` / `.muted` | Ink for a surface that is dark in **both** appearances. Static — it does not flip. `#FAF7F2` / `#D8D2C8` / `#B7AE9F` |
| `PatinaColors.Scrim.chrome` | An opaque ground for a control drawn over a photograph. Static `#332F2B`; `OnDark.primary` on it is 12.42:1 whatever the photo |
| `PatinaColors.clayInk` (`#82612F`) | Interactive labels and filled accent surfaces that carry a light label. `Text.interactive`'s light side is now this: `clayDeep` was 3.54:1 |
| `PatinaColors.errorDeep` (`#9C4C3F`) | The destructive fill. `error` under `offWhite` is 3.03:1 |
| `PatinaTypography.voiceLead` · `voiceSmall` · `voiceCaption` · `bodySerif` · `h6` · `monoLarge` | The six ramp gaps the 44 remaining inline `.font(.custom(…))` sites were reaching past |

**Changed behaviour, so nobody is surprised at merge:**

- **`PatinaColors.Background.dark` is now adaptive** — light `charcoal` (unchanged) / dark `#524B44`.
  Seven surfaces read it: the Companion orb and panel, `AddedToRoomToast`, `DesignerConsultationView`'s
  hero, `RoomBudgetBar`, `WholeHomeCrossRoomBar`. In dark mode they were 1.15:1 against the page and
  had no body at all (`C-01`). Their light-mode look is byte-identical.
- **`PatinaButtonStyle.clay` now renders the `.primary` treatment** (`C-41`). The five call sites —
  `InvoiceDetailView:219`, `ProposalDetailView:165`, `ProposalSignSheet:69`, `DecisionDetailView:425`,
  `DecisionDeferSheet:59` — keep compiling and stop being tan. `.destructive` fills with `errorDeep`.
  `PatinaButtonStyle` also publishes `patinaFillColor`, `patinaLabelColor`, `patinaBorderColor` and
  `filledCases`.
- **`DarkPalette.textSecondary` and `textMuted` are raised** (`#DFD2C0`, `#C7B99F`) — `C-20`.
- **`PatinaAsyncImage` takes a `caption:`** and has three states, not two: `loading` (shimmering mark),
  `failed` (mark + "Tap to retry"), `missing` (mark + the caption, no retry). Passing `url: nil` now
  gives the *missing* state rather than the failure state.
- **`PatinaTests` now links `PatinaDesignKit`.** `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj`
  gains one `XCSwiftPackageProductDependency` on the test target. Before this, a test referencing any
  kit symbol compiled and then failed to link (`Undefined symbols … PatinaDesignKit.PatinaColors…`),
  which is why `HomeHeaderTests` says the target "does not link PatinaDesignKit" and pins `TimeOfDay`
  through a source read. It does now. Steward ruling **S-5** assumed the link already existed; it did
  not, and this is the smaller of the two fixes it implies.

---

---

## D→C-1 · L1-C · `C-02` — the Companion's status line vanishes in dark mode

`Features/Companion/Components/CompanionHearthView.swift:402`.

The panel is `Background.dark`, a surface that is dark in **both** appearances. The subtitle uses
`PatinaColors.Text.inverse`, which flips to `#211E1B` in dark, composites at 0.72 over the panel to
`(36,33,30)` and measures **1.11:1** — including with Increase Contrast on. The title directly above it
stays legible only because `:396` uses a static light value. The app's signature voice moment — "5
things need your eye." — simply is not there for any tester whose phone is in dark mode.

```swift
                        .foregroundStyle(PatinaColors.OnDark.secondary)
```

Drop the `.opacity(0.72)`: `OnDark.secondary` is already the dimmer step, and it holds 5.71:1 on the
panel in dark and 9.62:1 in light. (If the opacity is wanted for the animation, `OnDark.secondary` at
0.72 is still 3.81:1, which clears the meta bar — `CompanionOrbAppearanceTests` asserts both.)

Same file, same class, `:467`: `.foregroundStyle(PatinaColors.pearl)` → `PatinaColors.OnDark.secondary`.
And `Features/Companion/Views/CompanionOverlay.swift:806`:
`isSuggested ? PatinaColors.offWhite : PatinaColors.pearl` →
`isSuggested ? PatinaColors.OnDark.primary : PatinaColors.OnDark.secondary`.

---

---

## D→C-2 · L1-C · `C-01` — the Companion orb, second notch (optional)

**The token half is already done and needs nothing from L1-C.**
`PatinaColors.Background.dark` is adaptive on `first-flight/w1-l1d` — light `charcoal` unchanged, dark
`#524B44` — so the orb's disc goes from 1.15:1 to **1.93:1** against the dark page with no call-site
change, and `CompanionMarkView.swift:163-168` compiles untouched.

If the walk still reads the disc as thin against the page, the second notch is a hairline, **not** a
glow — VISION §6 refuses shadows, and `PatinaShadows.companion` is deliberately unchanged:

```swift
                Circle()
                    .fill(PatinaColors.Background.dark)
                    .frame(width: 52, height: 52)
                    .overlay(Circle().stroke(PatinaColors.Border.onDark, lineWidth: 1))
                    .patinaShadow(PatinaShadows.companion)
```

`Border.onDark` is 3.18:1 against the dark canvas and 3.2:1 against the light one, so the rule reads in
both. The same one-liner applies to the panel shell at `CompanionHearthView.swift:96-105`. Take it only
if the screenshot says so.

---

---

## D→C-3 · L1-C · `A-36`, `C-27`, `B-18` — the missing-image state and the chrome scrim

`Features/Recommendations/Views/RecommendationsView.swift:362-370`:

```swift
            if let imageURL = product.imageURL, let url = URL(string: imageURL) {
                PatinaAsyncImage(url: url)
            } else {
                product.placeholderGradient
            }
```

The `else` branch is why two of ten pieces on the app's shopping screen are flat colour rectangles
still carrying a heart, a ⋯ and a "45% match" badge over nothing — and why the Pieces tab paints a
blank **cream** slab on a near-black page (`placeholderGradient` has no dark variant). Replace the
whole conditional with:

```swift
            PatinaAsyncImage(
                url: product.imageURL.flatMap(URL.init(string:)),
                contentMode: .fill,
                caption: product.name
            )
```

`PatinaAsyncImage` now has three states — a shimmering mark while loading, mark + "Tap to retry" on a
failed load, and mark + the piece's name when there is no photograph at all. Passing `nil` is the
*missing* state, which is the distinction `A-36` asks for.

**The scrim half of `C-27`, which does not go away when real photography lands.** The heart and ⋯ are
`Circle().fill(.ultraThinMaterial)` (`:504-508`, `:526-530`) and the match pill is
`.background(.ultraThinMaterial)` (`:375-382`). A material's contrast is a function of what is behind
it: over a light tile in dark mode it inverts to a light-on-light wash, and the chrome measured
**2.01:1** with the pill's text at **1.86:1**. Replace each `.ultraThinMaterial` background with the
scrim and pin the ink:

```swift
                        .foregroundStyle(PatinaColors.OnDark.primary)
                        .patinaChromeScrim(Circle())
```

and for the match pill:

```swift
                        .foregroundStyle(PatinaColors.OnDark.primary)
                        .patinaChromeScrim(RoundedRectangle(cornerRadius: 6, style: .continuous))
```

`patinaChromeScrim` is a `View` extension in `PatinaDesignKit`; `OnDark.primary` on
`Scrim.chrome` is 12.42:1 whatever the photograph.

The same `else product.placeholderGradient` shape appears on the Pieces tab and the piece detail —
every one of them takes the same replacement.

---

---

## D→C-4 · L1-C · `A3-01` — the honest empty state on every product surface

Production's `get_aesthete_matches` returns **zero rows for every tester**: `public.products` holds 15
rows, exactly one of which is `layer='catalog' AND status='published'`, and it is named
"Smoke Test Ceramic Lamp" at $20 with no image. Whether or not Leah's manifest lands before build 1
(**D2**), the app has to say one true thing when nothing comes back — the same sentence on every
surface, and no door with nothing behind it.

`PatinaDesignKit` publishes it:

```swift
PatinaEmptyState(.stillChoosingPieces)
```

which renders `square.stack` over **"Nothing here yet"** and *"Your designer is still choosing pieces
for you. This fills in as they do."* — with no CTA, deliberately.

Apply it in place of every "no recommendations" branch on:

```
Features/Recommendations/Views/RecommendationsView.swift    (the Pieces tab root)
Features/Home/Views/DailyRoomView.swift                     (the Today rails, when the rail is empty)
```

**Copy ownership.** The two strings are L1-D's placeholder for an L1-E deck row that does not exist
yet — `build/waves/w1/l1-e-copy-deck.md` was absent when this note was written. If the deck lands with
different words, change them in
`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift`
(`PatinaEmptyStateContent.stillChoosingPieces`) — **one place, not per surface** — and
`PatinaTests/ImagePlaceholderTests.stillCuratingStateIsAvailable` will name the two rows that changed.

---

---

## D→C-5 · L1-C · `A3-17` — the story card with no hero

**The read-time half is done** in `Core/Network/EditorialStoriesAPIClient.swift` (L1-D's file): the
row's `read_minutes` is now clamped to what its body can carry, so the 387-character "A defense of
imperfect linen" prints "1 min read" instead of "5 min read". All three production rows are stubs
billed at 3–5 minutes; none of them changes in the database.

**The hero half is L1-C's.** All three rows have `hero_image_url` NULL, so `DailyStory.heroGradient`
falls back to `PatinaGradients.hero` — a coloured rectangle where the art should be, on the one card a
tester can open when the catalogue is empty. `Features/Home/Views/DailyStoryCard.swift` and
`DailyStoryDetailView.swift` should route the hero through the component that knows what to do:

```swift
                PatinaAsyncImage(url: story.heroImageURL, contentMode: .fill, caption: story.tag)
```

which draws the strata mark on the quiet surface with the story's tag under it, instead of a gradient
pretending to be a photograph. Keep `story.heroGradient` only if a *deliberate* editorial gradient is
wanted for rows that pin `hero_gradient_key`; the fallback case is the one this is about.

Also in those two files, `DailyStoryCard.swift:71` and `DailyStoryDetailView.swift:140`:
`.foregroundStyle(PatinaColors.pearl)` → `PatinaColors.OnDark.secondary` (ink over a dark hero, not a
border).

---

---

## D→C-6 · L1-C · `C3-01` — the `pearl` hairline sites in L1-C's files

**`Border.hairline`:**

```
Design/Animations/PatinaTransitions.swift:53              (the `style == .light ?` arm)
Features/Home/Views/HouseRecordCard.swift:271, 302, 329
Features/Invoices/Views/InvoiceDetailBlocks.swift:97, 133
Features/Navigation/PatinaTabBar.swift:68
```

`PatinaTabBar.swift:68` is the loudest single site in the app: it is the top rule of the four-tab bar
every round-one tester sees on the shipped root, and in dark mode it is a 12.84:1 near-white line
across the screen.

**`Border.strong`:**

```
Features/Home/Views/YourHouseRail.swift:293               (the dashed "add" outline)
Features/Profile/Views/StudioHubView.swift:181, 190, 254
Features/Rooms/Components/RoomTypePillRow.swift:41        (the unselected arm only)
```

**`OnDark.secondary`** — ink on a permanently dark surface, not a border:

```
Features/Companion/Components/CompanionHearthView.swift:467      (also in D→C-1)
Features/Companion/Views/CompanionOverlay.swift:806              (also in D→C-1)
Features/DesignServices/DesignerConsultationView.swift:27
Features/Home/Views/DailyStoryCard.swift:71                      (also in D→C-5)
Features/Home/Views/DailyStoryDetailView.swift:140               (also in D→C-5)
Features/ProductDetail/Views/ProductDetailView.swift:637
```

---

---

## D→C-7 · L1-C · `C3-15` and `C3-05` in L1-C's files

**Inline fonts** — three sites, all in `Features/Companion/Views/CompanionIntroBubble.swift`:

| line | today | final |
|---|---|---|
| `:70` | `.font(.custom("PlayfairDisplay-Italic", size: 18, relativeTo: .headline))` | `.font(PatinaTypography.patinaVoice)` |
| `:74` | `.font(.custom("PlayfairDisplay-Italic", size: 15, relativeTo: .body))` | `.font(PatinaTypography.voiceSmall)` |
| `:118` | `.font(.custom("PlayfairDisplay-Italic", size: 15, relativeTo: .body))` | `.font(PatinaTypography.voiceSmall)` |

**Clay fills carrying a light label** (`C3-05`, 2.18:1):

| file:line | today | final |
|---|---|---|
| `Features/Companion/Views/CompanionIntroBubble.swift:90` | a `clay` fill under an `offWhite` label | fill `PatinaColors.Interactive.active`, label `PatinaColors.Text.inverse` |
| `Features/Home/Views/DailyGreetingHeader.swift:155-158` | the attention count on `clayDeep` with an `offWhite` numeral (3.54:1) | fill `PatinaColors.clayInk` (5.31:1) — or `Interactive.active` if the count should read as neutral |
| `Features/Home/Views/DailyGreetingHeader.swift:189-192` | `UnreadBadge`, a 10 pt numeral on `clay` | fill `PatinaColors.Interactive.active`, label `PatinaColors.Text.inverse` |
| `Features/Rooms/Components/RoomTypePillRow.swift:32, 37` | selected pill: light label on `clay` | fill `PatinaColors.Interactive.active`, label `PatinaColors.Text.inverse` — or route through `FilterChip` |

`TierPill.swift` is L1-D's and is already done; `PatinaButton .clay` is already collapsed into
`.primary`, so `DecisionDetailView:425` and `DecisionDeferSheet:59` need no edit — they stop being tan
on their own.

**`C-06` / `GAP1B-03` interaction, recorded not requested.** L1-C is rewriting the Today header for
Dynamic Type. `DarkPalette.textSecondary` and `textMuted` moved on L1-D's branch (`C-20`), so if the
header's dark-mode screenshots are being taken as evidence, take them **after** rebasing onto L1-D.

---

---

## D→C-8 · L1-C · `C-20`'s body half is a disabled control, not an ink colour

**This one is new, and it changes what `C-20` asks for.** Measured on this lane's own clone, on the
four-tab root, signed in, in dark mode — `shots/w1-l1d/before-04-today-dark.png` and
`after-04-today-dark.png`, method and table in `shots/w1-l1d/ledger.md`:

| row on the Today card | measured |
|---|---|
| "Leah Hartwell sent you a message." — **has** a route | 12.42:1 |
| "Meadow Linen Sectional shipped." — **has** a route | 12.42:1 |
| "A new story from the workshop." — **no** route | **4.27:1** |
| `SEP 2` meta on a routed row | 5.94:1 → 7.48:1 after L1-D's token raise |
| `SEP 1` meta on the unrouted row | 2.60:1 → 3.01:1 after L1-D's token raise |

Every row uses `PatinaColors.Text.primary` at `HouseRecordCard.swift:384`. The dim one is dim because
`HouseRecordCard.swift:375` puts `.disabled(row.route == nil)` on the row's `Button`, and SwiftUI
renders a disabled button's label at roughly half alpha. `C-20` measured 4.27:1 and 2.66:1 and read
them as a token problem; they reproduce exactly here, and **no token value can fix the body half** —
the row has to stop being a disabled control.

L1-D's side is done: the meta tier now clears the 3:1 bar even under the dimming.

The fix is L1-C's, and the smallest version is to stop dressing an informational row as a dead
control — keep it a plain, non-interactive row rather than a `Button` that is `.disabled`:

```swift
        .buttonStyle(.plain)
        // C-20: a row with no route was a *disabled* Button, and SwiftUI dims a
        // disabled label to about half alpha — 12.42:1 became 4.27:1 on the app's
        // home screen in dark mode. `.allowsHitTesting` withholds the tap without
        // withholding the contrast.
        .allowsHitTesting(row.route != nil)
        .accessibilityElement(children: .ignore)
```

i.e. drop `.disabled(row.route == nil)` at `:375` and keep the trait line below it, which already says
`accessibilityAddTraits(row.route == nil ? [] : .isButton)` — so VoiceOver still does not announce it
as a button.

If a row with nowhere to go should read as quieter, that is a **deliberate** ink choice
(`PatinaColors.Text.secondary`, 9.72:1 in dark) rather than a system side effect — and it would still
clear the 4.5:1 body bar, which the current dimming does not.

---


---

# From L1-D — round 2 (2026-09-02, after reading `l1-d-notes.md` and the copy deck)

Written after L1-D read its own inbox (`l1-d-notes.md`, four notes) and `l1-e-copy-deck.md`, both of
which landed while this lane was mid-build. Round 1 is `l1d-notes-out.md`. Each block below is
appended verbatim to its target lane's inbox.

---

---

## D→C-9 · L1-C · `GAP4-16` — L1-D took the finding's first option too, and they compose

`D-L1C-1` gave `StyleContinueButton` a `Ground` enum and passed `ground: .charcoal` from
`RevealView.swift:54-59`, and said: *"If L1-D would rather paint the Reveal with semantic
inverse-surface tokens (the finding's first option), that supersedes this and `ground: .charcoal` can
go with it."*

**L1-D took the first option, and is keeping L1-C's as well.** `RevealView`'s body is now wrapped in
`.environment(\.colorScheme, .dark)`, so the whole subtree resolves the semantic tokens on the side
that matches its permanently-charcoal ground. That is one line and it fixes more than the CTA:

| on the Reveal, in **light** mode | before | after |
|---|---|---|
| `StyleContinueButton`'s capsule — `Interactive.active` | charcoal on charcoal, invisible (`GAP4-16`) | near-white on charcoal |
| "YOUR STYLE, FOUND" — `Text.interactive` | `clayInk` `#82612F` on charcoal = **2.92:1** | `clay` = **7.12:1** |
| the tag row's ink | was `pearl`, now `OnDark.secondary` | unchanged in both appearances by design |

`ground: .charcoal` is still correct under it — an `offWhite` fill with a `charcoal` label is what the
`.app` ground now resolves to anyway — so the two changes agree rather than fight.
`SheetChromeTests.theRevealCTAIsVisibleInLight` passes either way.

**For the steward at merge:** the two lanes touch different regions of `RevealView.swift` (L1-C at
`:54-59`, L1-D at the `body`/`content` split and the two font lines), so this should auto-merge. If it
conflicts, **take both**. If only one can survive, take L1-D's — it is the option that also fixes the
eyebrow, and `ground: .charcoal` then reduces to a no-op rather than a regression.

---

---

## D→C-10 · L1-C · `GAP1B-07`'s global half is done

`D-L1C-2` asked for the `.ghost` hit region in `PatinaButton`. It is on `first-flight/w1-l1d`, exactly
as specified:

```swift
            .background(backgroundColor)
            .clipShape(Capsule())
            .contentShape(Capsule())
```

Pinned by `PatinaTests/PrimaryButtonStyleTests.theCapsuleIsAControlNotAnOutline`, together with
L1-F's `A-63` padding, which landed on the same three lines.

---

## From L1-B (Data, persistence, resilience) — 2026-09-02

Four tasks. Full context, and the notes L1-B sent to the other lanes, in
`build/waves/w1/l1b-notes-out.md`. `PatinaTests/RefreshableSurfacesTests.swift` on
`first-flight/w1-l1b` carries a `withKnownIssue(isIntermittent: true)` row naming every surface below
that still owes a `.refreshable`, so the test report is the ledger for these — it passes in both
states by design.

### Task C-L1B-1 — `C4-12` + `R-03`: pull-to-refresh on the four tab roots, and Today's staleness line

`.refreshable` exists on twelve Features screens and on none of the four roots. With the backend down
the only recovery for Today is to background the app; pulling produced pixel-identical frames.

**`Features/Home/Views/DailyRoomView.swift`** — on the root `ScrollView(showsIndicators: false)` at
`:250`, immediately after the closing brace of its `VStack`, add the modifier. It is the same sequence
the `scenePhase` handler at `:168-186` runs:

```swift
        // R-03: the only recovery from a failed refresh was to background the
        // app. This runs exactly what the `.onChange(of: scenePhase)` handler
        // below runs, in the same order.
        .refreshable {
            viewModel.load()
            syncCompanionContext()
            await badges.refresh()
            await requestStatus.refresh()
            syncCompanionContext()
            await viewModel.refreshProjectRooms()
            await viewModel.refreshRecord()
            await ProfileService.shared.mirrorLastSeenIfNeeded()
            await viewModel.refreshNewThisWeek()
            await notificationsViewModel.load()
        }
```

`presentPushPrimerIfEarned()` is deliberately **not** in the list: a pull-to-refresh is not the moment
to put a permission prompt in front of someone.

**`Features/Profile/Views/ProfileView.swift`**:

```swift
        .refreshable {
            await StudioHubViewModel.shared.load()
            viewModel.loadData(context: modelContext)
        }
```

`StudioHubViewModel.load()` is what the screen's `.task` runs; `loadData(context:)` is what its
`onAppear` runs. Both, in that order.

**`Features/Rooms/Views/YourSpacesView.swift`**:

```swift
        .refreshable {
            await RoomSyncCoordinator.shared.reconcile(store: RoomStore(context: modelContext))
        }
```

**`Features/Recommendations/Views/RecommendationsView.swift`**:

```swift
        .refreshable { await viewModel.load() }
```

— matching whatever that screen's `.task` calls; if the `.task` calls something else, use that, and
the same arguments.

**R-03's second half — the staleness line on Today.** `StudioHubViewModel` (L1-B's file) now exposes:

```swift
    var stalenessLine: String?   // "Last updated 2 minutes ago." / "We couldn’t reach your studio just now."
```

It is `nil` whenever the last refresh answered. Render it in `DailyRoomView`'s header block, below the
greeting, as a sentence:

```swift
                if let staleness = StudioHubViewModel.shared.stalenessLine {
                    Text(staleness)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("DailyRoomView.StalenessLine")
                }
```

**VISION constraint, carried verbatim from `L07-05`'s own fix line and the L0.7 walk:** *the affordance
must be a word ("last updated…", "we couldn't reach the studio"), never a dot or a badge.*

### Task C-L1B-2 — `C4-12`: the decision detail

`Features/Decisions/Views/DecisionDetailView.swift` — `.refreshable` calling exactly what its `.task`
calls:

```swift
        .refreshable { await viewModel.load(decisionId: decisionId) }
```

(substitute the `.task`'s own call verbatim if the signature differs).

### Task C-L1B-3 — `C4-03`: Your Spaces must not say "no rooms" about a failed fetch

`RoomSyncCoordinator` (L1-B's file) previously swallowed a failed `listRooms` with a bare `return`; it
now publishes:

```swift
    public private(set) var lastLoadFailed: Bool
    public private(set) var lastSuccessAt: Date?
    public var isLoading: Bool
```

A failed read deliberately does **not** stamp `lastRunAt`, so the retry below is not swallowed by the
thirty-second debounce.

`Features/Rooms/Views/YourSpacesView.swift` — ahead of the existing empty state (`:31`, `:180`), add:

```swift
            } else if rooms.isEmpty && RoomSyncCoordinator.shared.lastLoadFailed {
                // C4-03: an empty list meant both "you have no rooms" and "we
                // could not read your rooms", and the copy asserted the first
                // to a client who has them.
                PatinaErrorState(
                    message: "We couldn’t reach your rooms. Check your connection and try again.",
                    action: {
                        Task {
                            await RoomSyncCoordinator.shared.reconcile(
                                store: RoomStore(context: modelContext)
                            )
                        }
                    }
                )
                .accessibilityIdentifier("YourSpacesView.ErrorState")
```

The branch must sit **before** the "No rooms yet" branch, not beside it.

### Task C-L1B-4 — `R-02` + `A-81`: the bell must not assert absence it never checked

`Features/Home/Views/DailyGreetingHeader.swift:107`:

```swift
                    .accessibilityValue(unreadCount > 0 ? "\(unreadCount) unread" : "No unread notifications")
```

With the backend down and nothing fetched, `unreadCount` is `0` and VoiceOver is told **"No unread
notifications"** — an assertion the app never checked. Take a third input and say nothing rather than
say the wrong thing:

```swift
    /// R-02: `false` until a notifications fetch has answered. A count of zero
    /// that nobody fetched is not "none".
    var unreadCountIsKnown: Bool = true
```

```swift
                    .accessibilityValue(
                        unreadCount > 0
                            ? "\(unreadCount) unread"
                            : (unreadCountIsKnown ? "No unread notifications" : "")
                    )
```

`DailyRoomView` passes `unreadCountIsKnown: notificationsViewModel.hasLoaded` (or whatever that view
model's "a fetch answered" flag is called — it needs one either way).

**`A-81`, for the record:** the four numbers the finding counted are two counts each shown twice, and
both are already single-sourced (SP-16) and named for VoiceOver — `accessibilityLabel("Notifications")`
+ `accessibilityValue("3 unread")` on the bell, `StudioControlLabel.waitingValue(count:)` on the pill —
and the capped NEEDS YOU section already draws `See all →` off `record.hasMoreNeedsYou` (M1).
`PatinaTests/AttentionCountTests.swift` now pins all three. The line above is the last thing on that
screen that says something it does not know.

### Heads-up, no action

`Product.matchLabel` no longer prints a percentage — it bands (`Strong match` / `Good match` /
`Worth a look` / `Not scored yet`) for `A-34` and `C-11`. Its three call sites are
`RecommendationsView.swift:338`, `:381` and `ProductDetailView.swift:413`, all L1-C's, and **none of
them needs an edit**: the property's type is unchanged. `Product.hasMatchScore` is new beside it if a
screen wants to hide the pill entirely on an unscored piece.

### VISION check on these notes

Nothing here adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an engagement
mechanic or the word "AI". The staleness affordance is a sentence by ruling; the `.refreshable`
modifiers add no chrome at all; Task C-L1B-4 makes a VoiceOver value say **less**, not more.

---


---

## From L1-E (Copy) — round 2, 2026-09-02 (after the adversarial review of deck revision 1)

Full text, with the blocks sent to the other lanes, is at `build/waves/w1/l1e-notes-out.md`. Deck: `build/waves/w1/l1-e-copy-deck.md` **revision 2**.

### Task C-L1E-7 — `C5-10` · the sign-out alert, with its pin (answers your open question)

**This is the answer to "One thing the deck does not cover" in `l1-e-notes.md`.** Yes — case the
alert to match the row, and here are both strings and the pin update, as you asked:

`Features/Settings/Views/SettingsView.swift:212,214`

```swift
.alert("Sign Out", isPresented: $showingSignOutConfirmation)   // today
Button("Sign Out") { signOut() }                                // today

.alert("Sign out?", isPresented: $showingSignOutConfirmation)  // final
Button("Sign out") { signOut() }                                // final
```

The `?` is not a casing change: the file's three other alerts are questions ("Forget recent
context?", "Reset taste portrait?", "Discard this scan?"), and a title that is a bare command
reads as a second button. One screen, one shape.

⚠ **Same-commit pin:** `PatinaTests/AccountActionsTests.settingsSurfacesBothAccountActions` asserts
`source.contains("\"Sign Out\"")` → change to `"\"Sign out\""`. Leave
`accountViewSurfacesBothAccountActions` alone — that is L1-A's half, a different `@Test` function in
the same file, so the two merge cleanly. Pinned by
`SentenceCaseTests.settingsSignOutAlertMatchesItsRow`.

### Task C-L1E-8 — `C5-10` · "Retake Style Quiz" beside "Get design help"

`Features/Profile/Views/ProfileView.swift:154` (`:140` on your branch)

```swift
profileActionRow(icon: "paintpalette", label: "Retake Style Quiz")   // today
profileActionRow(icon: "paintpalette", label: "Retake your style quiz")  // final
```

Title Case sits directly above `"Get design help"` and `"Settings"` inside one section — `C5-10`'s
complaint verbatim, and `GAP2-22`'s own ruled fix, reused so W2 has nothing left to decide. Pinned
by `SentenceCaseTests.studioActionRowsShareOneCasing`.

### Task C-L1E-9 — `C5-09` · one word in one VoiceOver announcement

`Features/Profile/Views/ProfileView.swift:217`

```swift
.accessibilityLabel("Saved items: \(viewModel.savedItemCount). More information available.")   // today
.accessibilityLabel("Saved pieces: \(viewModel.savedItemCount). More information available.")  // final
```

The visible stat reads `"Saved"`, which is fine; only the announcement names the retired noun.
Pinned by `NounConsistencyTests.profileSavedStatSaysPieces`.

### Task C-L1E-10 — `A-52` · the two Companion guest rows are still open

Your task `C-L1A-3` (re-routed to you by L1-A, correctly — `Features/Companion/**` is yours under
§5.4) is **not applied on `first-flight/w1-l1c`**: `CompanionActionRows.swift:33` still reads
`item("house", "Home", "Back to your space", …)` unconditionally, and the file carries no
`isAuthenticated` parameter. Exact final text, unchanged from the deck:

- `:32-34` (`homeRow`) — **guest** hint `"See what’s on Patina"`; signed in, or a guest with local
  rooms, keeps `"Back to your space"`.
- `:220-223` (`pieceActRow`, `.askAboutPiece`) — **guest** hint
  `"Sign in and a designer will get back to you"`; signed in with no designer yet,
  `"A designer will get back to you"`.

Both need `isAuthenticated` (or `LocalStoreClaim.hasGuestWork` for the home row) threaded into the
row builder. `:213-214` (`.askDesigner`) is **unchanged** — it is only reachable when
`relationship.isLive`, which a guest cannot be. Note the apostrophe in `"what’s"` is **U+2019**
(`A-06`). Pinned by `GuestPromiseTests.companionRowsBranchOnAuthState`, which is a recorded known
issue until this lands.

### Note C-L1E-11 — `C5-06` changed the greeting's width on the flags-off root

Not a request; a heads-up, because you own `DailyRoomView.swift` and `DailyGreetingHeader.swift`.
Launched on L1-E's clone at 21:41 with `-PatinaFlags ""`: the flags-off header — which carries the
Studio pill, the bell and the help icon on the same row — now breaks the headline as "Good /
evening" over two lines, where "Good night." fitted one. The same happens at midday, where "Good
afternoon" (14 characters) replaces "Good day." (9). **The four-tab root has the width and renders
one line**, so this only affects the D1 kill-switch fallback. Recorded rather than reverted; if you
want the header to reserve two lines there, that is your call, not a copy change.

### Note C-L1E-12 — `GAP1B-01` needs no sentence, and that is now written down

`Features/Decisions/Views/DecisionDetailView.swift:368-448`. PROGRAM.md names `GAP1B-01` as a row
this deck owes ("the sheet is L1-C's, the sentence is a deck row L1-C applies"). Having read the
sheet: **no string is needed.** The copy inside it is already correct and no new text appears at any
Dynamic Type size — the fix is entirely the content-driven detent. Recorded in the deck so the exit
criterion "every deck row is either applied or carries a written 'not this wave, because…'" has an
entry for it, and so you are not waiting on a sentence that is not coming.

### Note C-L1E-13 — your three VoiceOver labels are blessed

`"About Your Spaces"`, `"About Whole Home"`, `"About scanning a room"`, `"About Today"`. Correct
voice, correct specificity, and `C-05`'s fix line asks for exactly this. No deck row needed. (Two
carry Title Case — `"Your Spaces"` and `"Whole Home"` — but both are the on-screen proper names of
those surfaces, so the announcement matching them is right.)
