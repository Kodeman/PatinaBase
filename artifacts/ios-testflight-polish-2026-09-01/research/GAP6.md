# Lane GAP6 — gap-fill: sheet-and-keyboard composition on the primary acts

Device: clone **C / "GAP6"** `670DE752-BA1B-40C1-899E-57B50D5743B5` (iPhone 17 Pro, iOS 26.5, signed in as client@patina.dev, local stack).
Launch: `xcrun simctl launch 670DE752-BA1B-40C1-899E-57B50D5743B5 cloud.patina.app -DeploymentTarget local`
READ-ONLY. Shots under `shots/GAP6/`, one line each in `shots/GAP6/ledger.md`.

Script: (a) room Budget cell -> RoomBudgetSheet + number pad + every dismissal attempt;
(b) room item -> ItemActionMenu -> Move/copy; (c) Pieces -> product -> Add to room, Browse card menu;
(d) Saved -> row menu -> Add a note; (e) Your Spaces -> Whole-Home bar -> All Items.
Repeat (a) and (c) at accessibility-extra-large.

---

## Source read first (compile-level, not yet sim-verified)
- `Features/Rooms/Views/RoomProjectView.swift:127-137` — both sheets presented at `.presentationDetents([.medium])`, single detent.
- `Features/Rooms/Views/RoomBudgetSheet.swift:38-111` — bare `VStack`, no `ScrollView`; `.keyboardType(.numberPad)` at `:61`; `Save` at `:77-87`; only compressible element is `Spacer(minLength: 0)` at `:102`.
- `Features/Home/Views/AddToRoomSheet.swift:58` — also single `.presentationDetents([.medium])`, bare `VStack`, `ForEach(rooms)` unbounded, no ScrollView.
- `Features/Collections/Views/SavedNoteSheet.swift` — NavigationStack + Cancel/Save toolbar + `@FocusState` autofocus; the one form in the app with a keyboard escape.

## Preflight
Relaunched 19:12 with `-DeploymentTarget local` (PID 55862). Signed-in Daily Return home ("Good evening.",
bell "3 unread", Studio "5 waiting"). `scan_ui` query "Notifications" returned `DailyRoomView.BellButton`
@ `{{210,118},{36,36}}`; tapped (228,136) -> **Notifications** screen (shot 05). **HID PASS.**

⚠ Harness note, NOT a finding: `mcp__blitz-iphone__get_screenshot` returned an all-blank frame on this
clone (shot discarded); every screenshot below is `xcrun simctl io <udid> screenshot`. Also, the FIRST
tap immediately after a relaunch landed on the Studio pill instead of the bell (shot 03/04) — not
reproducible on the second try, so treated as a settle artifact, not an app defect. Settle >=1.5 s after
launch before the first tap.

## ⚠ DEVICE CONTENTION (environment, NOT an app finding)
Between 19:12 and 19:22 the app on `670DE752-…` was navigated and relaunched by something other than
this lane. Evidence:
- `ps -Ao pid,args` shows a **foreign** shell (PID 83968) running a python loop that polls
  `Devices/670DE752-…/…/Patina.app/Patina` PIDs every 10 s — another agent is watching MY clone.
- Patina PIDs on this clone rolled 51841 → 55862 → 69791 → 73526 → 77081 → 82253 → 94828 with no
  crash reports in `~/Library/Logs/DiagnosticReports` or the sim's `CrashReporter` dir, i.e. external
  terminate/launch cycles, not crashes.
- Screens I never navigated to appeared between my screenshot and my next tool call: Studio hub,
  "Your design proposals", the Dining-chairs Decision detail with its CONFIRM-YOUR-CHOICE sheet, and
  finally the signed-OUT **Welcome home** screen (shot 12) — i.e. someone ran the reset recipe.
- Idle test: 4 screenshots 4 s apart with zero input from me — frame 1 differed from frames 2-4.
Consequence: `scan_ui`/`describe_screen` trees repeatedly disagreed with the screenshot taken 1 s
earlier. Every judgement below is anchored to a **screenshot**, never to an AX tree alone.

### Device switch (forced by the contention above)
`670DE752-…` (tfp-C) was unusable: every 60-90 s another agent relaunched the app, deep-linked into it
from Safari (status bar read "◀ Safari"), signed it out, and drove it to screens I had not opened.
At 19:37 I cloned the **shut-down** review simulator `973D1724-…` (not erased, not touched otherwise)
into **`tfp-GAP6own` = `7B1C6975-CF68-424C-AD9A-BA5FB1BE072E`** — the same thing lanes GAP2/GAP3/GAP4
did for themselves — installed the steward's signed build, applied the standard status-bar/appearance
overrides, launched with `-DeploymentTarget local`, and signed in as `client@patina.dev`
(local stack only; no production contact). HID preflight on the new clone: tap
`auth.welcome.passwordButton` (201,625) -> Sign In sheet; typed credentials; **PASS**.
Rooms on this clone: **Audit Room B** (252 sq ft) and **Living Room** (252 sq ft), neither with a
budget — so step (a) exercises the "Set a budget" (empty-field) case.
Everything from shot 13 on is on `7B1C6975-…`.

---

# (a) Room -> "Set a budget" -> RoomBudgetSheet + number pad  [shots 14-22]

## The predicted blocker does NOT reproduce — C9-09 must be re-graded
Sequence: Today -> "Audit Room B" card -> "Set a budget" (`RoomProjectView.SetABudget`,
scanned frame `{{206,644.7},{176,48}}`) -> sheet at `.medium` (shot 15) -> tap the amount field
(shot 16) -> software keyboard forced on (shot 17).

**What actually happens when the number pad appears (shot 17):** SwiftUI's keyboard avoidance lifts the
WHOLE sheet — its top rises from **318 pt to 122 pt** — instead of clipping the content inside a fixed
`.medium` box. The `$` field lands at ~200 pt and the **Save capsule at 293-332 pt**, both far above the
keyboard's top edge at **568 pt**. Nothing the tester needs is hidden. C9-09 predicted "the tester types
a budget and cannot find Save"; on iOS 26.5 / iPhone 17 Pro that is **false**.

**And there IS a working keyboard escape** (shot 20): a downward drag anywhere on the sheet body
(204,200)->(204,520) dismisses the number pad, drops the sheet back to `.medium`, and **keeps** the typed
value with Save still enabled. So C9-08's "no keyboard-dismiss affordance exists anywhere" is true of
*explicit* affordances but not of behaviour — the native sheet drag does the job.

## What is genuinely wrong here
- **GAP6-01 — no visible way out of the number pad.** Tapping the sheet's own empty area does nothing
  (shot 19: 236 pt of blank sheet, tapped at (204,430), keyboard unchanged). The number pad itself has
  **no Return and no Done** — shot 17 shows 1-9, 0 and ⌫ only, and there is no `ToolbarItemGroup(.keyboard)`.
  The only two exits are a drag on a sheet that draws **no grabber**, or a backdrop tap that throws the
  entry away. severity minor (was predicted blocker) · testerVisible true.
- **GAP6-02 — `RoomBudgetSheet` draws no drag indicator.** `RoomProjectView.swift:132-136` sets
  `.presentationDetents([.medium])` and never `.presentationDragIndicator(.visible)`; the sheet body
  (`RoomBudgetSheet.swift:39-103`) starts straight at the title. The sibling sheet in the same
  `.sheet(item:)` switch — `ItemActionMenu.swift:20-23` — hand-draws its own capsule, so two sheets
  presented from one modifier disagree about whether a grabber exists.
- **GAP6-03 — the disabled Save capsule is off-palette.** `RoomBudgetSheet.swift:83` fills with
  `PatinaColors.Interactive.active` and `.disabled(…)` at `:86`; SwiftUI renders that as a flat mid-grey
  capsule with near-white text (shots 15/16) — the only cold grey on a warm cream screen, and the
  lowest-contrast text on it.
- **GAP6-04 — the raised sheet leaves a 236 pt dead band** between Save (332 pt) and the keyboard
  (568 pt) — shot 17. The sheet is *translated*, not resized, so a third of the screen is empty cream.
- **GAP6-05 — the placeholder promises a format the field never produces.** Placeholder is `9,000`
  (`RoomBudgetSheet.swift:60`) but typed digits are never grouped: the field reads `$ 400` (shot 18).
  The grouped, right-weight placeholder also reads as a pre-filled value.
- **GAP6-06 — a backdrop tap silently discards a typed budget** (shot 22): tapped (200,120) on the room
  behind the sheet; the sheet went away, the acts row still reads "Set a budget", no confirmation and no
  way to get the number back. There is no Cancel control anywhere on the sheet.
- **GAP6-07 — room copy leaks internal state.** The room subtitle reads
  `14 × 18 FT · 252 SQ FT · TYPED, NOT SCANNED` (shots 14-16). "TYPED, NOT SCANNED" is capture-pipeline
  vocabulary shown to a homeowner.

GOOD here: the sheet copy is genuinely Patina — "What you mean to spend on this room. Only you see it."
answers the two questions a person actually has. Save enables the instant a valid number exists.

---

# (e) Your Spaces -> Whole Home -> All Items  [shots 24, 25]

- **GAP6-08 — three different help "?" glyphs crowd the "Your Spaces" title row** (shot 24): a ~14 pt
  ringed `?` immediately after the Playfair title, a ~20 pt ringed `?` in the middle, a ~12 pt ringed `?`
  to its right, then a black `+` disc — and a **fourth** `?` beside the Whole Home bar. Four help affordances
  on one screen at three different diameters, none labelled. Nothing else in the app does this.
- **GAP6-09 — the room-card subtitle is unreadable and leaks pipeline vocabulary** (shot 24):
  `252 SQ FT · TYPED, NOT SCANNED` is set in a warm brown over the darkest part of the card's gradient;
  it is the lowest-contrast text on the screen. Same string on every card.
- **GAP6-10 — "All Items" is the only right-aligned title in the app** (shot 25). Its Playfair title sits
  flush right at x≈337-382 pt with `0 ITEMS · $0` right-aligned beneath it, leaving ~300 pt of empty
  header on the left, while "Your Spaces", "Browse pieces", "Notifications" and "Your design proposals"
  are all flush left. It reads as a layout mistake.
- Also on that screen: the `All Items / By Category / By Maker` segmented row is drawn over an empty
  state — three ways to slice nothing.
- GOOD: the empty state itself is right — "No items yet / Pieces you save land here, organized across
  your rooms." + one "Browse pieces" button.

---

# (c) Browse card menu + product "Add to room"  [shots 26-35]

- **GAP6-11 — the same piece shows two different match scores on adjacent screens.** Browse card:
  **"73% match"** (shot 26/27). Its own detail screen: **"50% match"** (shot 31). Nothing changed
  between the two taps.
- **GAP6-12 — "1 ITEMS".** `AddToRoomSheet.swift:75` interpolates
  `"\(room.itemCount) items · \(room.squareFeet) sq ft"` with no pluralisation, so the picker reads
  **"Audit Room B · 1 ITEMS · 252 SQ FT"** and **"Living Room · 1 ITEMS · 252 SQ FT"** (shots 33 and the
  second picker) — while the Today room card for the same room says **"1 saved piece"** correctly.
- **GAP6-13 — `AddToRoomSheet` does not paint its own sheet.** In every capture (shots 28, 33) the cream
  `PatinaColors.Background.primary` block covers only the middle of the sheet: a ~25 pt translucent band
  at the top (the grabber floats on blurred content from the screen behind) and a ~68 pt translucent band
  at the bottom, through which the blurred Browse grid / product detail is plainly visible **inside** the
  sheet's rounded frame. Cause is visible in source: `AddToRoomSheet.swift:56-58` puts
  `.background(PatinaColors.Background.primary)` on a content-sized `VStack` and then sets
  `.presentationDetents([.medium])`, so the detent is taller than the painted content.
- **GAP6-14 — "Add to room" from the Browse card menu gives no confirmation.** Tapped Add to room ->
  Audit Room B, then Add to room -> Living Room; screenshots at **1.5 s** (shot 29) and **0.7 s**
  (shot 30) after the tap show no banner, no toast, no change to the card (its heart stays an outline),
  no layout shift. `RecommendationsView.swift:98-109 + 213-223` intends a 4-second
  "Added to {room}." banner in the header; it did not render in either trial. The add *did* happen —
  the picker's count went 0 -> 1 ITEMS.
- **GAP6-15 — the product detail's ghost button says "Saved ✓" and silently un-saves.**
  `PurchaseActionBar.swift:70` labels the button with a *state*; `ProductDetailView.swift:596-605` routes
  a tap on it to `viewModel.toggleSave(...)` when `isSaved`. Verified: shot 31 "Saved ✓" -> one tap ->
  shot 32 the header heart empties and the button reverts to "Add to room", with **no confirmation, no
  undo, no toast**. One button in one position is four different acts (unsave / add to the context room /
  open the picker / plain save) depending on hidden state.
- **GAP6-16 — the Companion contradicts the screen it is drawn over** (shot 35). With the piece saved
  (filled heart, bar reading "Saved ✓") the Companion opens on **"Save this one?"** and offers
  **"Save · ADD TO A COLLECTION"**. Its "Home · BACK TO YOUR SPACE" row also pairs a title and a subtitle
  that name two different places.
- **GAP6-17 — a Browse card ships with no image and no placeholder** (shots 26/27/29): "Wool Kilim
  Runner · STUDIO PIET · $680" renders as a flat empty grey rectangle with the match pill and the
  heart/⋯ floating on it, in a grid where every other card carries a photo.
- **GAP6-18 — product photography does not match the product.** "Terracotta Planter Set" (shot 26)
  is illustrated by a **mint-green** planter. "Heirloom Oak Dining Table", "Meadow Linen Sectional" and
  "Velvet Club Chair" are all full room scenes in which the named piece is one object among many.
- **GAP6-19 — the Companion orb and its caption print over live content on every screen.** Shot 26:
  "5 THINGS NEED YOUR EYE" is set directly over the Live-Edge Coffee Table photo with no plate behind it.
  Shot 00/02: the orb covers the designer-seat card's name ("Leah Hart▮"). Shot 04: the caption overprints
  "2 shared invoices". Shot 24: it covers the Living Room card's item count.
- **GAP6-20 — "OVERDUE" breaks mid-word on the Today home at default Dynamic Type** (shot 36, full-res
  crop). The "Leah asked about Rug color - Natural vs Sand." row's meta column renders
  `ASKED / SEP 1  ·  OVERDU / E  ·  NEW` — the word is hyphenlessly split after five letters.

GOOD: the Browse grid itself is handsome — Playfair old-style figures for prices, mono maker eyebrows,
a clean chip row with a trailing fade. The product detail's SIZE / LEAD TIME / MAKER / FINISH table and
"Ask Leah to source this" are exactly the right register.

---

# (b) Room item -> ItemActionMenu -> Move/copy  [shots 37-40]

- **GAP6-21 — the room item row shows a different maker than the piece has.** The room list and the
  ItemActionMenu header both read **"ROOM & BOARD"** for the Heirloom Oak Dining Table (shots 37, 38);
  the Browse card (shot 26) and the product detail (shot 31) both read **"NORDIC ATELIER"**. Same piece,
  three screens, two makers.
- **GAP6-22 — the room item row throws the photo away.** The piece has a real photograph on Browse and
  on its detail; in "YOUR ITEMS" and in the ItemActionMenu header it is a flat brown gradient square
  (shots 37, 38).
- **GAP6-23 — `ItemActionMenu` does not paint the bottom of its sheet** (shot 38): the cream stops at
  ~778 pt and a pale grey band runs to the sheet's bottom edge. Same cause as GAP6-13 —
  `ItemActionMenu.swift:41` backgrounds a content-sized `VStack` inside
  `RoomProjectView.swift:131`'s `.presentationDetents([.medium])`.
- **GAP6-24 — the menu offers "View in AR" on every item unconditionally.** `ItemActionMenu.swift:30`
  draws the row for any `SavedItem`, while `ProductDetailView.swift:588` gates its own AR button on
  `product.hasARModel`. Two surfaces, two rules, for the same piece.
- **GAP6-25 — capitalisation is inconsistent inside one flow.** This sheet is Title Case
  ("View in AR", "View Product Detail", "Move to Another Room", "Copy to Another Room",
  "Remove from Room"); the Browse card menu two taps earlier is sentence case ("Add to room",
  "Not for me", "View details"), and so is everything else in the app ("Set a budget", "Edit dimensions",
  "Get design help with this room").
- **GAP6-26 — Move/Copy re-asks a question the previous sheet already answered** (shot 39). Choosing
  "Move to Another Room" opens a sheet whose first control is a Move | Copy segmented pair with Move
  pre-selected. The tester picks the same thing twice.
- **GAP6-27 — the "current room" row reads as a rendering failure** (shot 39): "Audit Room B … CURRENT"
  is drawn with no card background at all while the two selectable rows have one, and at an opacity where
  its thumbnail is nearly white on cream.
- **GAP6-28 — a move is silent and irreversible** (shot 40). Tapped "Living Room"; the sheet closed and
  the room fell straight back to "A blank canvas / 0 SAVED PIECES". No confirmation, no
  "Moved to Living Room", no undo, no animation of the row leaving. A mis-tap loses the piece from the
  room with nothing on screen to say where it went.
- **GAP6-29 — the Saved list keeps the old room after a move** (shot 41): the dining table's footer still
  reads **"Saved Sep 1 · Audit Room B"** although the piece now lives in Living Room. The room screen and
  the Saved list disagree about where the same piece is.
- **GAP6-30 — "1 SAVED PIECES".** The room's stat card reads `1` over the label `SAVED PIECES`
  (shot 37) and the picker reads "1 ITEMS" (GAP6-12), while the Today room card for the same room says
  "1 saved piece". Three renderings of one count, two of them ungrammatical.
- Copy nit: the room says "You added the Heirloom Oak Dining Table **on Tuesday**" for something added
  fifteen seconds earlier (shot 37).

# (d) Saved -> "Add a note"  [shots 41-43]

- **GAP6-31 — "Add a note" is styled exactly like the metadata it sits beside** (shot 41). The footer line
  is `Saved Sep 1 · Audit Room B` on the left and `Add a note` on the right, same colour, same size,
  same weight, both outside the piece's card on the page background. The only actionable half of the line
  does not read as a control.
- **GAP6-32 — the note editor is a ~430 pt tall box for one sentence** (shots 42, 43).
  `SavedNoteSheet.swift:40` sets `minHeight: 140`, but `TextEditor` is greedy inside the `.large` sheet,
  so it fills almost the whole screen. The placeholder overlay (`:53-61`, insets 15/18) also does not sit
  on the caret's baseline — the caret is left of and below the placeholder's first glyph (shot 43).
- **GOOD, and the exception that proves C9-08:** this is the one text surface in the app with a proper
  escape — a `NavigationStack` with Cancel and Save in the toolbar, always above the keyboard, plus the
  app's only `@FocusState` autofocus (verified: the caret is in the field on appear, shot 43).
  The placeholder — "Why you saved it, what it's for, what to check." — is the best microcopy I saw.

---

# Repeat of (a) and (c) at `accessibility-extra-large`  [shots 44-54]

- **GAP6-33 — the Today greeting breaks mid-word across five lines** (shot 44). "Good evening." renders as
  `Goo / d / eve / ning / .` — the app's first line of copy, hyphenlessly split twice, with the full stop
  alone on line five. The bell glyph beside it is gone (only its "3" badge remains) and the Studio pill
  truncates to **"Stu…"**.
- **GAP6-34 — the room screen's three controls all truncate** (shot 47): the primary CTA becomes
  **"Browse pieces for the…"** (the room's name, the only reason the button is personalised, is the part
  cut), and the acts row becomes **"Edit dime…"** and **"Set a bud…"**. A tester at this size cannot read
  either action.
- **GAP6-35 — `ItemActionMenu` overflows and clips its fixed `.medium` detent, and nothing can scroll**
  (shots 53, 54). Header, five rows and the item card need more than the detent gives:
  the item name is **sliced through** at the sheet's top edge (only "Planter Set" survives; "Terracotta"
  is cut in half), and the destructive **"Remove from Ro…"** row is cut through horizontally at the
  bottom edge. A drag upward inside the sheet (201,780)->(201,500) moves nothing — `.presentationDetents([.medium])`
  at `RoomProjectView.swift:131` with a bare `VStack` at `ItemActionMenu.swift:19` gives no second detent
  and no `ScrollView`. Four of the five rows also truncate: "View Product Det…", "Move to Another…",
  "Copy to Another…", "Remove from Ro…". This is the composition blocker the lane was sent to find —
  it is on the item menu, not on the budget sheet.
- **GAP6-36 — "Unknown Maker"** is shown to the tester as the maker of the Terracotta Planter Set in the
  ItemActionMenu header (shot 53), while the Browse card for the same piece says "REJUVENATION".
  A raw fallback string on a user-facing surface.
- **GAP6-37 — the match pill collides with the heart and ⋯ buttons on every Browse card** (shots 50, 52):
  "76% ma▮▮▮" runs underneath the two circular controls, which are drawn on top of the pill's own text.
  At default size the two clear each other; at this size they do not.
- **GAP6-38 — the Browse card loses its content to truncation** (shot 50): makers become "NORDIC A…",
  "WOODWARD…"; names become "Heirloom Oak Dini…", "Meadow Linen Se…"; and the provenance line is cut to
  **"Selected from Pat…"**, losing the word "Patina".
- **GAP6-39 — a third match score for the same piece.** Room-scoped browse says **76%** for the Heirloom
  Oak Dining Table (shot 50), unscoped browse said **73%** (shot 26), the detail says **50%** (shot 31).
- **GAP6-40 — `AddToRoomSheet` truncates its own room metadata and loses its grabber at this size**
  (shot 52): rows read "0 ITEMS · 252…" / "2 ITEMS · 252…" / "0 ITEMS · 180…", and the hand-drawn capsule
  at `AddToRoomSheet.swift:18-22` is no longer drawn. With three rooms the content exactly fills the
  `.medium` detent; the view is a bare `VStack` with no `ScrollView` and one detent
  (`AddToRoomSheet.swift:38-58`), so a person with four or more rooms loses the extra rooms — and
  "+ New Room" — off the bottom with no way to reach them. (Structural; not reproduced with 4 rooms.)
- **GAP6-41 — the "?" help glyphs do not scale with Dynamic Type** (shots 24 vs 46). On Your Spaces they
  stay the same tiny ringed marks at accessibility-extra-large while every label around them triples.
- **GAP6-42 — the Saved footer wraps into nonsense** (AXXL Saved list): `Saved Sep 1 · Audit Room / B`
  breaks the room name across lines with the "·" separator starting the second line, while "Add a note"
  stays pinned three lines above it.
- GOOD at this size: `RoomBudgetSheet` itself scales cleanly — title, subtitle, the two-line body, the
  field and Save all fit the `.medium` detent with room to spare (shot 48); and the Browse card menu
  drops its icons for a clean text-only list, which is correct iOS behaviour.

## What I could NOT verify
1. **The number pad at accessibility-extra-large.** The simulator's hardware keyboard suppresses the
   software pad; I forced it once via Simulator's I/O ▸ Keyboard ▸ Toggle Software Keyboard (shot 17,
   default size), but by the AXXL pass Simulator.app's window list had become unavailable to AppleScript
   (`get name of every window` returned nothing) and the toggle could not be reached again. Shot 49 shows
   the field focused with a caret at AXXL but no pad. Arithmetic only, NOT observed: Save's bottom sits at
   ~762 pt and a number pad occupies from ~538 pt down, so the lift SwiftUI applied at default size may
   leave Save at or just below the keyboard's top edge at this size. **Needs one re-run with the software
   keyboard forced.**
2. Whether `AddToRoomSheet` actually clips with 4+ rooms (only 3 rooms existed).
3. Whether the `addToRoomMessage` banner ever renders (two trials, 0.7 s and 1.5 s, both negative).
4. Anything on a physical device — no haptics, no real AR, no LiDAR.
