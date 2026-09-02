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
