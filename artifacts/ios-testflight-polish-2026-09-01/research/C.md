# Lane C — accessibility + appearance walk (signed in, client@patina.dev, local stack)

Device: clone **C** `670DE752-BA1B-40C1-899E-57B50D5743B5` (iPhone 17 Pro, iOS 26.5).
Launch: `xcrun simctl launch 670DE752-... cloud.patina.app -DeploymentTarget local`
Read-only. Shots under `shots/C/`, one line each in `shots/C/ledger.md`.

---

## Preflight
Launched 15:56:41 with `-DeploymentTarget local`. `describe_screen` returned the signed-in Daily Return
home (greeting "Good afternoon.", bell "3 unread", Studio "5 waiting", companion.bubble "5 things need
your eye"). Tapped `DailyRoomView.BellButton` @ (228,136) → Notifications screen. **HID PASS.**
Appearance light, content_size large, status bar overridden 9:41.

## Notifications — AX tree (light, flags OFF) — evidence for step 3
- Title "Notifications" is `AXStaticText`, **not** a heading (Today's "SINCE YOU WERE LAST HERE" IS `AXHeading`). No header trait on this screen at all.
- "Mark all read" AXFrame `{{297.3,126},{80.7,16}}` → **16 pt tall** hit target.
- "Back" AXFrame `{{17.75,69.75},{36.5,36.5}}` → **36.5 pt**, under 44.
- Row labels are run-on concatenations: `"Unread. A sign-off needs you Design Development sign-off — drawing set B 9h ago"`.
- Read rows carry `"Just now"` in the AX label (Invoice, Proposal) but **no timestamp is rendered** on screen.
- `companion.bubble` is `AXGenericElement` (role `AXGenericElement`), not a button — label "Patina companion", value "5 things need your eye", hint "Opens the Companion." (OPTION_B contract met) but no button trait.
- An unlabeled, enabled `AXGenericElement` `{{0,720},{402,120}}` sits behind the orb on every screen.

## Findings drafted from light baseline (appearance-independent, confirmed again in dark below)
- **C-01 status-bar underlap** (see 01/02): the Today scroll view extends to y=0 with no scroll-edge
  material and no fade. At any scroll offset the row text renders *behind* the status bar clock and the
  Dynamic Island. Screenshot 01: "Leah Hartwell sent a proposal to revi[ew]" is overprinted by the black
  Dynamic Island pill and "9:41".
- **C-02 dead gap under YOUR HOUSE**: ~46 pt of empty space between the "YOUR HOUSE" eyebrow and the
  room cards, far larger than any other section gap on the screen.
- **C-03 room cards are two-thirds empty**: "Guest Bedroom / 180 sq ft · budget $9,000" occupies the top
  ~55 pt of a 150 pt card; the rest is flat fill. Reads as a missing thumbnail.

## Companion — AX tree (evidence for step 3 / OPTION_B contract)
- Orb `companion.bubble`: label "Patina companion", value "5 things need your eye", hint "Opens the
  Companion." — **contract met**, but `role = AXGenericElement` (no button trait).
- `companion.help` and `companion.close`: 44x44, labelled "Help"/"Close" with hints. **GOOD.**
- Six action rows carry the chevron in the label: e.g.
  `"Message your designer, Chat with your designer, ›"` — the decorative `›` is spoken.
- Their AXUniqueIds are raw SF Symbol names: `companion.action.bubble.left.and.bubble.right`,
  `companion.action.rectangle.grid.1x2`, `companion.action.sparkles`, `companion.action.heart`,
  `companion.action.square.grid.2x2`, `companion.action.person.circle`.
- "Where to next?" is `AXStaticText`, no heading trait.
- Background Today content is correctly removed from the AX tree while the sheet is open. **GOOD.**
- Layout: subtitle frame `{{100,358},{88,31.7}}` — 88 pt measure inside a 314 pt panel forces
  "5 things need / your eye." to wrap, with ~44 pt of unused width before the Help button.

## Dark mode — measured contrast (from 06-dark-launch-2.0s.png, sRGB, WCAG formula)
| element | brightest stroke | base | ratio |
|---|---|---|---|
| Companion orb **fill** vs page bg | (44,41,38) | (33,30,27) | **1.15** |
| same orb in LIGHT (00-preflight-before) | (44,41,38) | (250,247,242) | 13.53 |
| "AUG 31 · NEW" meta on a MOVED row | (120,103,81) | card (44,41,38) | **2.66** |
| MOVED body "A new story from the workshop." | (143,139,134) | card | **4.27** |
| primary row text | (242,237,230) | card | 12.42 |
| "NEEDS YOU" eyebrow | (216,201,180) | card | 8.91 |
| "SINCE YOU WERE LAST HERE" / meta | (181,164,135) | card | 5.94 |
| "See all" link / "Message" label | (196,165,123) | card | 6.21 |
The orb fill is the **same literal RGB in both appearances** → it is a hardcoded, non-adaptive colour.

Launch frames: 0.4 s = **pure black, empty** (no wordmark, no logo); ~1.0 s = flat page background,
still empty; ~2.0 s = first content. Generated launch screen (`UILaunchScreen_Generation YES`) and its
black does not match the app's warm dark ground (33,30,27), so there is a visible colour pop.

## Greeting "?" tooltip (Today)
Second "?" glyph sits inline after "Good afternoon." at ~(151,155) pt. It is **absent from the AX tree**
(the full Today `describe_screen` lists only `DailyRoomView.HelpButton`), so VoiceOver cannot reach it.
Tapping it opens a popover whose text node is `{{53.7,180.8},{194.7,86.3}}` (86.3 pt tall) inside a
bubble that measures ~75 pt → the copy is **clipped at both the top and the bottom**:
verbatim string = "Today keeps Patina focused: one useful next move, one editorial story, and one
active room." On screen only "…focused: one useful next / move, one editorial story," is fully legible;
"Today keeps Patina" is half-cut by the bubble's top edge and "and one active room." is cut off below it.
While open, the whole screen collapses to `PopoverDismissRegion` "dismiss popup".
Two visually identical "?" circles sit ~100 pt apart on the same screen (this one, and
`DailyRoomView.HelpButton`) at different diameters and with different behaviour.

## Companion in dark appearance — subtitle inverts
Panel fill is the **same** (44,41,38) in both appearances. The title "Where to next?" stays (255,255,255)
in both. The subtitle "5 things need your eye." measures:
- LIGHT appearance: brightest stroke (193,190,185) on panel (44,41,38) = **7.8:1** — legible.
- DARK appearance: whole subtitle box max = (44,41,38), darkest (36,33,30) = **≈1.1:1** — invisible.
Crops `crop-light-companion-header.png` / `crop-dark-companion-header.png` show it side by side.
The panel is a fixed dark surface while the subtitle uses a colour that flips with the *system*
appearance, so in dark mode it resolves to a dark ink on a dark panel.
Same screen, dark: the panel has no visible edge against the page (1.1:1 fill-vs-page at the bottom
corner) and the dimming scrim barely darkens an already-dark background, so the sheet does not read as
a layer — "Guest Bedroom / 180 sq ft · budget $9,000" and "Good afternoon." stay visible at similar tone.

## Your Spaces — AX tree + layout (dark)
Four help-ish "?" controls on ONE screen:
| frame | AXUniqueId | AXLabel | hint |
|---|---|---|---|
| `{{155.3,118},{44,44}}` | `questionmark.circle` | **More information** | Shows additional information. |
| `{{250,121},{36,36}}` | `YourSpacesView.HelpButton` | Help | Opens the help panel for Your Spaces. |
| `{{294,118.7},{44,44}}` | `questionmark.circle` | **More information** | Shows additional information. |
| `{{338,194.7},{44,44}}` | `questionmark.circle` | **More information** | Shows additional information. |
→ three **identical** labels + identical hints + identical (SF-Symbol-named) unique ids. VoiceOver says
"More information, button" three times with nothing to tell them apart. `YourSpacesView.HelpButton` is
36 pt (under 44).
Other AX defects on this screen:
- Whole Home row label = `"⌂, Whole Home, 1 room · 0 items · $0 total"` — the decorative glyph **⌂** is
  inside the accessibility label.
- Room card label = `"Guest Bedroom, 180 sq ft · Typed, not scanned, 0, Items, $9.0K, Budget"` — stat
  pairs read inverted ("0, Items"), and "Typed, not scanned" is internal provenance jargon.
- "Your Spaces" is `AXStaticText`, no heading trait.
Layout: Whole Home card `{{20,178.7},{312,76}}` vs Guest Bedroom card `{{20,270.7},{362,243}}` — the two
stacked cards have **different widths and unaligned right edges** (332 vs 382), because the Whole Home
row's trailing "?" lives outside its card.
Copy: three formats for money on one screen — "$0 total", "$9.0K", and Today's "budget $9,000".
Visual: back button is a near-white filled disc here but a hairline-bordered circle on Notifications.
Room thumbnail placeholder is a cold blue-grey gradient, off-palette against the warm system.

## Room detail (Guest Bedroom) — AX tree + layout (dark)
- Settings button `{{347.75,55.75},{36.5,36.5}}` has **AXLabel `"⚙"`** — a raw glyph as the label, no
  hint. Also 36.5 pt (under 44).
- Decorative sparkle exposed as `AXStaticText` **AXLabel `"✦"`** `{{185,443},{32,48}}` — not hidden.
- `companion.hint` button: AXLabel **`"SEE RECOMMENDATIONS →"`**, hint **`"ACTIVATES THIS SUGGESTED NEXT
  STEP."`** — both shouted ALL CAPS, arrow glyph inside the label.
- The orb's AXValue on this screen is `"See recommendations →"` (arrow glyph in the value).
- **Overlap (geometry, not eyeballing):** orb `{{169,700},{64,64}}` → y 700–764, x 169–233.
  `RoomProjectView.EditDimensions` `{{20,665.3},{176,48}}` → x 20–196, y 665–713.
  `RoomProjectView.SetABudget` `{{206,665.3},{176,48}}` → x 206–382, y 665–713.
  The orb covers the **inner bottom corner of both buttons** (13 pt of overlap each) — visible in
  `10-dark-room.png` and it steals their hit area.
- Three different StaticTexts share the same AXUniqueId `RoomProjectView.Header`.
- "0" and "SAVED PIECES" are separate unlabeled StaticTexts — VoiceOver reads them as two stops.
- No heading trait anywhere on the screen.
- Visual: hero image starts *below* a hard-edged black status-bar band (Today lets content run under
  the status bar instead — inconsistent). Gear glyph renders in default multicolour/hierarchical grey,
  unlike every other monoline icon in the app.
- Content: a "0 / SAVED PIECES" stat card is immediately followed by a second empty state
  ("✦ / A blank canvas / Browse pieces for the Guest Bedroom") — two empty states stacked.
- Copy: "12 × 15 FT · 180 SQ FT · **TYPED, NOT SCANNED**" — internal provenance jargon in the subtitle.
  The next line drops to sentence case ("budget $9,000") directly under an ALL-CAPS mono line.

## Browse grid — AX tree + layout (dark)
- **Every product card is `role = AXPopUpButton`, role_description "pop up button"** — e.g.
  `"Heirloom Oak Dining Table by Nordic Atelier, $4,200, 57% match"`. VoiceOver announces "pop up
  button" while the hint says "Double-tap to view details."
- Custom actions on every card: `["Skip", "Save", "Save to favorites", "More actions"]` — **"Save" and
  "Save to favorites" are two separate actions with the same apparent meaning**.
- The visible heart / "…" overlay buttons are **not** separate AX elements; they exist only as those
  custom actions, so the sighted and the VoiceOver affordances do not match.
- Category chips `All / Seating / Tables / Lighting / Storage` are all **26.67 pt tall** (under 44) and
  carry **no selected state** — "All" is a white filled pill visually, but nothing in AX says so.
- Grid metrics are clean: 171 pt cards, 12 pt gutter, 24 pt margins. **GOOD.**
- **Orb overlap:** row-2 cards `y 492.3–754.7`; orb `y 724–788`, `x 169–233`. The orb covers the bottom
  ~30 pt of both row-2 cards and visibly eats the leading "r" of "room-aware edit" on the right card.
- The fixed caption "5 THINGS NEED YOUR EYE" is drawn with no backing plate directly over the row-3
  product photographs (see 11-dark-browse.png bottom) — illegible on light images.
- Copy: the identical sentence "Selected from Patina's room-aware edit for Gu…" repeats on all six
  cards, truncated mid-word, and inconsistently ("for Gu…" on three, "for Gu." on one).
  "room-aware edit" is internal product jargon.
- Match scores shown to a first-round tester are all 45–57%.

## Product detail — AX tree + layout (dark)
- **Data contradiction:** the grid card AX label is `"Heirloom Oak Dining Table by Nordic Atelier,
  $4,200, 57% match"`; the detail for the same piece renders **`"50% match"`**. Two different match
  scores one tap apart.
- **The floating action bar occludes live content.** `PurchaseActionBar.Primary` `{{24,752},{173.7,52}}`
  and `PurchaseActionBar.AddToRoom` `{{205.7,752},{124.3,52}}` sit over: `"PROVENANCE"` `y 761.7`,
  a `questionmark.circle` "More information" button `{{89,745.7},{44,44}}`, and the "Maker Piece" /
  "Dining" chips `y 801.7`. A tappable button is **buried under the bar** — VoiceOver reaches it,
  a finger cannot.
- **The Companion changes identity here**: `companion.bubble` is `{{338,768},{44,44}}` (44 pt, trailing,
  inside the action-bar row) with label **"Patina companion — menu"** and hint "Opens quick actions for
  this screen." Everywhere else it is 64 pt, centred, labelled "Patina companion", hint "Opens the
  Companion." Same identifier, two components.
- `heart` button label "Save" carries **no state** — nothing tells VoiceOver whether the piece is saved.
- Header buttons `chevron.left` / `ProductDetailView.HelpButton` / `ProductDetailView.ShareButton` /
  `heart` are all **36 x 36 pt** (under 44).
- Yet another `questionmark.circle` labelled "More information" (4th distinct screen with this label).
- Spec rows are well-formed for VoiceOver: "Size: 96″ W × 40″ D × 30″ H", "Lead time: Ships in 10
  weeks", etc. **GOOD.** Body copy is strong and human. **GOOD.**
- Title is `AXStaticText`; no heading trait anywhere on the screen (app-wide pattern).
- Visual: the "50% match" pill uses a green-tinted fill that appears nowhere else in the palette;
  the same badge in the grid is neutral.

### Correction to the product-detail entry above
Scrolling to the bottom (13-dark-product-scrolled.png) shows the action bar **is** a pinned bottom bar
and the content does clear it at the end of the scroll. So "the bar buries a button" is wrong as a
layout bug — withdraw it. What remains true and is the real defect: **the bar has no material.** Its
fill measures (35,33,31) against a page of (33,30,27) = **1.06:1**, so in dark mode content slides
behind an almost invisible slab with only a hairline to mark it. (In light mode the same bar reads as a
distinct surface.) The `questionmark.circle` under it at first paint is therefore invisible-but-tappable
until you scroll.
Also on this screen:
- The "50% match" pill fill measures (44,45,38) — a **green-shifted** neutral in an otherwise warm
  (44,41,38) system; the same badge in the grid is warm-neutral.
- Once scrolled, the hero photograph runs under the status bar and "9:41" is printed straight onto the
  white rug/chairs with no material — same C-01 fault as Today.
- "Questions or damage: hello@patina.cloud" is plain, non-tappable text (no mailto, no copy affordance).
- Ownership copy is excellent and unusually honest for a beta: "Patina is responsible for this order —
  for getting it to you, and for putting it right if it arrives damaged or isn't what was described."
  **GOOD.**

### Product detail — the back control scrolls away
After one swipe on the product page, `scan_ui {query:"Back"}` returns `chevron.left` at
`{{16, -158.67}, {36,36}}` — i.e. **off-screen above**. The hero-overlay controls (Back, Help, Share,
Save) are pinned to the photo, not to the screen, so once a tester scrolls there is **no visible way
back** and no navigation bar; only the edge-swipe gesture works. Tapping where Back used to be does
nothing (verified: a tap at (34,136) produced no navigation).

## Studio hub — AX tree (dark)
- **"More information available" is baked into accessibility labels of non-interactive text**, promising
  an action that does not exist:
  - `"MEMBER SINCE SEP 1, 2026. MORE INFORMATION AVAILABLE."` (shouted caps, plain StaticText)
  - `"Style: Style Explorer. More information available."` — **on two overlapping nodes**
    (`{{147.7,325.3},{13.7,20.3}}` the decorative sparkle and `{{167.3,327.5},{87,16}}` the label), so
    VoiceOver reads the identical sentence twice in a row.
  - `"Saved items: 0. More information available."`
- **Pluralisation bug:** the visible stat reads **"1 / ROOMS"**. The AX label for the same node is the
  correct `"Rooms: 1"` — so the intent exists and only the rendered label is wrong.
- `STUDIO` and `"Awaiting you, 5 things awaiting you"` DO carry `AXHeading`. **GOOD** — and the only
  headings found anywhere in the app so far.
- The list rows are `AXGenericElement`, not buttons: `"Decisions, 3 project choices are ready, Overdue ·
  Aug 28"` (hint "Opens Decisions."), `"Invoice, $4,250.00 remaining, Due Sep 6"` (hint "Opens
  Invoices." — plural hint for a singular row).
- `ProfileView.HelpButton` is 44x44 with a real hint. **GOOD.**
- **Orb collision, measured:** orb `y 724–788`; "Decisions" row `y 665.7–747`; "Invoice" row
  `y 747.3–828.7`. The orb and its caption sit on top of the money figure — the screenshot shows
  "5 THINGS NEED YOUR EYE" printed across "$4,250.00 remaining / Due Sep 6".
- The same count is stated three times on one screen: subtitle "5 things need your eye", the
  "Awaiting you … 5" badge, and the orb caption "5 THINGS NEED YOUR EYE".
- "Overdue · Aug 28" on the Decisions row is honest and correctly coloured. **GOOD.**

## Proposals + proposal detail (dark)
- List: the section header repeats verbatim as the card's eyebrow — "AWAITING YOUR REVIEW (1)" then a
  card starting "AWAITING YOUR REVIEW"; "ACCEPTED (1)" then "ACCEPTED".
- Detail top carries "Product Selections", "Investment", "Timeline" as three headings with **no content
  between them**, and "Investment" duplicates the INVESTMENT card at the top of the same screen.
- **The floating white Back circle has no material and sits on top of scrolled body text.** In
  `20-dark-proposal-scrolled.png` it covers the word "billed" in "Revisions: 2 rounds per phase
  included. Beyond that billed at $150/hr." — a fee clause, obscured by a UI chrome element.
- SELECTIONS rows use the app's own three-line companion glyph as the missing-thumbnail placeholder,
  leave ~120 pt of dead space per row, and their separators are full-strength white rather than the
  hairlines used elsewhere.
- **Two different primary-button styles in one app**: "Sign proposal" is a solid tan/gold pill
  (`proposalDetail.sign`), while "Browse pieces for the Guest Bedroom" and "Ask Leah to source this"
  are near-white pills.
- `scan_ui` full-screen returns only two interactive elements: Back and `proposalDetail.sign`. On a
  screen that states "Deposits are non-refundable once procurement begins. Custom items are final
  sale." the **only** action is Sign — no decline, no "ask a question", no way to raise a query in place.
- Terms and vision copy are strong and human. **GOOD.**

## Invoice detail (dark)
- `invoiceDetail.reminder` "Remind me the day before it's due" is a **Button with a 17 pt tall frame**
  (`{{24,387.3},{228.3,17}}`), styled as an amber heading with no control affordance and **no state** —
  nothing says whether the reminder is on or off.
- The **"Pay $4,250.00" button is below the fold** (`invoiceDetail.pay {{24,721.3},{354,52}}` only after
  scrolling); there is no pinned action bar, unlike the product detail which does pin one.
- Two redundant reassurance lines under the button, at different sizes: "Payment opens securely in
  Safari." and "Pay securely by card or bank transfer."
- One card, two separator treatments: the rule between the two line items is a **full-bleed full-white**
  line; the rule above Subtotal is **inset and dimmer**.
- The white floating Back circle covers "Due Sep 6" once scrolled (23-dark-invoice-bottom.png).
- Invoices list: "PAID" and "AWAITING PAYMENT" render in the **same amber** — status colour is
  decorative, not semantic.

### ★ GOOD — the payment-failure state is world-class
Tapping Pay with the local placeholder Stripe key produced, in under 0.7 s and with no spinner stall:
> **"We couldn't start this payment. Nothing has been charged."**
> Let's try that again    Message your designer
No raw error string, no error code, the money statement is explicit, and both recovery paths are
offered. This is the best-handled error surface I saw in the whole walk.
Nit: both recovery buttons (`invoiceDetail.failure`) are **17 pt tall** (`{{38,667},{125,17}}` and
`{{181,667},{157.3,17}}`) and carry no button chrome.

## Messages (dark)
- **No conversation header at all** — no title, no "Leah Hartwell", no avatar. The full `describe_screen`
  contains only: Back, the date heading "TUESDAY · SEP 1", the line "Project conversation opened.",
  the composer and Send. A tester arriving from "Message your designer" is never told who they are
  messaging.
- The only message content is the system line **"Project conversation opened."** — a log entry standing
  in for an empty state.
- **The composer text field has no accessibility label** (`AXLabel: null`) and its `AXValue` is the
  placeholder `"Type a message…"`, so VoiceOver announces an empty field as though it contains text.
  Its frame is `{{30,799.7},{288,17}}` — **17 pt tall**.
- `arrow.up.circle.fill` "Send message" is correctly `enabled: false` while the field is empty
  (**GOOD**) but renders as a **solid tan filled circle with no dimming** — a disabled control that
  looks fully enabled.
- **Worst orb collision of the walk:** orb `{{169,724},{64,64}}` and its caption container
  `{{0,720},{402,120}}` sit on top of the composer — "5 THINGS NEED YOUR EYE" is printed straight across
  the "Type a message…" placeholder and the orb breaks the composer's top divider.

## Navigation: three entry points, one destination
The Companion's **"Your studio — PROJECTS · MESSAGES · DECISIONS"**, its **"Your profile — STYLE ·
SETTINGS · PORTAL"**, and the Today header's **"Studio 5"** pill all land on the *same* screen
(27-dark-profile.png is identical to 16-dark-studio.png). "Your profile" promises "Portal"; no Portal
row exists anywhere on that screen.

## Data contradiction #2 — the same room, two provenances
- Your Spaces card + room detail: **"TYPED, NOT SCANNED"** (09, 10).
- Profile "YOUR ROOMS" card for the same Guest Bedroom: **"SCANNED AUG 28"** (28).

## Settings sheet — AX tree (dark)
- **Decorative row icons are focusable AXImages whose labels are raw SF Symbol names:**
  `hand.tap` → AXLabel **"hand.tap"**; `circle.lefthalf.filled` → AXLabel
  **"circle.lefthalf.filled"**; `brain.head.profile` → AXLabel **"brain.head.profile"**.
  VoiceOver reads these literally.
- Two more icons carry *wrong or duplicated* labels: `bell` → "Notifications" (identical to the row text
  and the switch), `antenna.radiowaves.left.and.right` → "Cellular Data" (the row says "Upload scans on
  cellular").
- Consequence: **every preferences row is announced two or three times** — icon, label, switch, all with
  the same string.
- The Appearance control is a `PopUpButton` labelled **"Appearance, Appearance"** with **AXValue null** —
  VoiceOver never says the current value ("System").
- Switch frames are `61 x 28` (28 pt tall) and the rows themselves are not buttons, so 28 pt is the
  whole target.
- Icon images are 13–14 pt and focusable.
- **No Done / Close / dismiss control and no drag indicator** — neither `scan_ui` (5 buttons) nor
  `describe_screen` contains one. The sheet is dismissible only by an undiscoverable swipe.
- "Settings" title is `AXStaticText`, no heading trait.
- Visual: `Sign in on the web`, `Upload scans on cellular` and `Use activity for context` render
  **blue-grey / grey-green icon tiles** in an otherwise warm amber icon set.
- **"Delete account" has no destructive treatment** — same weight, colour and disclosure chevron as
  "Account"; and both it and "Sign Out" carry a `›` chevron implying navigation rather than an action.
- Capitalisation is mixed within one list: "Sign Out" and "Haptic Feedback" (Title Case) beside
  "Delete account", "Sign in on the web", "Upload scans on cellular" (sentence case).
- ★ GOOD: `SettingsView.ContextMemoryToggle` carries the hint "Turning this off also forgets all recent
  contextual activity stored on this device.", and the privacy body copy ("Off until you choose it.
  When on, Patina remembers only activity type, an identifier, and time for up to 90 days.") is
  exemplary.

## ⚑ Every "?" opens an empty Help sheet
Tapping `DailyRoomView.HelpButton` opens a sheet whose entire content is, verbatim:
> **"No help articles yet"**
> "Help content for this screen is on the way. Pull down to dismiss."
The app puts a "?" affordance on nearly every screen — Today has two, Your Spaces has **four**, plus
`companion.help`, `ProductDetailView.HelpButton`, `ProfileView.HelpButton` and three
`questionmark.circle` "More information" buttons. Each is a dead end into this placeholder.
Two further problems on the sheet itself: the copy says "Pull down to dismiss" while an **X button is
right there**, and this sheet has a **grabber and an X** while the Settings sheet has **neither** —
two sheet chromes in one app.

## Dynamic Type — XXXL (`content_size extra-extra-extra-large`)
Today (30-xxxl-today.png):
- **The greeting hard-breaks inside a word: "Good / afternoo / n."** The header row does not reflow;
  the greeting column stays narrow because the bell, "?" and the "Studio 5" pill hold their width.
- **The notification badge grows and covers the bell glyph** it is anchored to — only a sliver of the
  bell shows behind the "3".
- The meta column wraps badly: "BY SEP / 15 · NEW" — the date breaks while "· NEW" stays on line 1.
- The **orb caption "5 THINGS NEED YOUR EYE" grows and is printed straight across the card's separator
  and the row text**, clipping "Meadow Linen Sectional shippe[d]".
Companion (31-xxxl-companion.png): the sheet and all six rows reflow correctly and nothing truncates.
**GOOD.** The subtitle is still dark-on-dark.

## ⚠ Environment note — cross-lane data contamination (NOT an app finding)
Mid-walk a room named **"Audit Room" (252 SQ FT)** appeared and the Companion's label changed from
"Your spaces, 1 room" to "Your spaces, 2 rooms". I created nothing. All local lanes share one Supabase
stack, so another walker created it. **Do not read the room-count changes as an app defect.** The
"1 ROOMS" pluralisation bug stands on its own (observed while there genuinely was one room).
Also: the Audit Room placeholder renders a *warm* cream/tan gradient while Guest Bedroom renders cold
blue-grey — the placeholder gradient is derived per room, so soften "off-palette placeholder" to
"the Guest Bedroom placeholder resolves to a cold blue-grey outside the warm palette".

## Dynamic Type — accessibility-XXXL
Catastrophic on the two screens that matter most:
- **Today** (35): "TUESDA / Y · / SEP 1" and **"Go / od / aft / er / no / on."** — the greeting breaks
  into six fragments of one to three letters and fills the entire screen. The notification badge
  **completely replaces** the bell glyph. The Studio pill truncates to **"St… 5"**.
- **Companion** (36, 37): "Wher / e to / next?" and "Your recomme / ndations" break mid-word; only one
  of six destinations is on screen at first. ★ The sheet **does** scroll, so navigation stays reachable
  — **GOOD**, and important, because with flags OFF this sheet is the only nav hub.
- **Your Spaces** (38): "Your / Space / s"; the room card truncates its title ("Audit Roo…") and
  subtitle ("252 SQ FT · T…") on single fixed lines while the card has spare height; the four "?"
  buttons and the "+" stay at their default 36–44 pt beside 60 pt type, so the header reads as a row of
  specks next to a giant title.
- Settings at XXXL (34) reflows correctly — rows grow, labels wrap, toggles hold. **GOOD.**
Root cause pattern: display-face text sits in containers whose width is fixed by sibling chrome
(badges, pills, buttons) that does not reflow, so SwiftUI breaks words rather than the layout.

## System accessibility toggles (step 4)
Set via the Settings app on this clone: `REDUCE_MOTION`=1, `ENHANCE_TEXT_LEGIBILITY` (Bold Text)=1,
`TEXT_COLORS_DARKEN` (Increase Contrast)=1, each confirmed by re-reading its AXValue.

**Reduce Motion** — the app renders correctly with it on. Source evidence: `grep -rn "reduceMotion"
apps/mobile/Patina --include=*.swift` returns **125 hits**, so the app does consult it broadly. I could
not judge the animations themselves from stills — see "not verified".

**Bold Text and Increase Contrast do nothing.** Evidence, two independent kinds:
1. Pixel diff of `40-reducemotion-today.png` (both off) vs `41-a11ytoggles-today.png` (both on), same
   content: the greeting region and the MOVED body region are **byte-identical (0 differing pixels)**;
   the one row that differs at all differs by 3.6% of pixels, which the 2x crop
   `crop-boldtext-compare.png` shows is anti-aliasing, not a weight change.
2. Source: `legibilityWeight` → **0 hits**, `colorSchemeContrast` → **0 hits**,
   `reduceTransparency` → **0 hits**, `differentiateWithoutColor` → **0 hits** across all Patina Swift.
Consequences a tester feels:
- The 2.66:1 "AUG 31 · NEW" meta stays at 2.66:1 with Increase Contrast on.
- The Companion subtitle stays at **1.11:1** with Increase Contrast on (42-a11ytoggles-companion.png).
- The app's translucent surfaces (Companion sheet, greeting tooltip, help sheet) stay translucent with
  Reduce Transparency unsupported.
- Status is signalled by colour alone in places (PAID vs AWAITING PAYMENT both amber) with no
  Differentiate-Without-Color fallback.
For reference: `dynamicTypeSize` → 39 hits, `accessibilityHidden` → 53 hits, `.isHeader` → **13 hits**
(which matches the near-total absence of heading traits I saw on screen).

## Auth screen (dark)
Mid-walk the signed-in session lapsed and the app returned to Welcome with **no explanation and no
re-auth prompt**. Relaunching *without* `-PatinaFlags` also showed Welcome, so **the flags argument did
not cause it** — most likely a token expiry or cross-lane action. Recorded as an observation, low
confidence as an app defect; worth a targeted refresh-failure check.
- **`auth.welcome.appleButton` fill is pure `#000000` on a (33,30,27) ground = 1.27:1.** In dark mode
  the button silhouette is invisible; only its white label reads. Apple's HIG calls for the white or
  white-outline variant on dark grounds.
- **`auth.welcome.emailButton` AXLabel is `"✉, Continue with email"`** and the glyph renders as the
  colour **emoji** ✉️ (sampled (237,237,237)/(227,228,230) — Apple Color Emoji, not a monoline symbol).
  The Sign In sheet one screen later uses a proper monoline SF Symbol envelope, so the two disagree.
- `auth.welcome.googleButton` AXLabel is `"G, Continue with Google"` — a bare letter, and the visible
  mark is a plain "G" in the app's own typeface rather than Google's brand mark.
- `auth.welcome.termsLink`, `auth.welcome.privacyLink` and `auth.welcome.passwordButton` are all
  **14.67 pt tall**.
- The Apple button is `{{28,324.3},{346,50}}` while Google/email are `{{27.25,…},{347.5,51.5}}` — the
  stack's edges are 0.75 pt out of alignment.
- No heading trait on "Welcome home".
- ★ GOOD: the whole screen is warm, calm and well written — "Welcome home / Start with a piece you
  love", "Look around first →", "Have a password? Sign in", and Forgot-password + magic-link + Sign-Up
  are all present on the Sign In sheet.

## Flags-ON four-tab root (steps 1–3 repeated)
★ **The flags-ON root removes the entire orb-collision family** — the Companion becomes a tab, so none
of the overprinting seen on Today / Studio / Messages / Browse occurs. The greeting also fits on one
line because the "Studio 5" pill is gone. This matters because **first-round TestFlight testers get the
flags-OFF root**, i.e. the worse one.
Tab bar AX (50-flagson-dark-tabroot.png):
- Five `AXTabButton`s with correct `AXValue` selection (Today=1, others=0). **GOOD.**
- **Visible labels do not match accessibility labels:** "Spaces"→`"Your Spaces"`, "Pieces"→`"Browse
  pieces"`, "Studio"→`"Your Studio"`. (WCAG 2.5.3 Label-in-Name; Voice Control users say the visible
  word and may miss.)
- Item widths are `84,84,84,84` then `54` for the Companion — the bar is not evenly divided, and the
  fifth item is a glyph with no visible label while the other four are text-only with **no icons**.
- Selection is signalled by **colour alone** (white vs tan), no indicator, no icon state.
- The bar has no material: content scrolls behind a flat slab with a hairline.
- **The Studio badge is lost** — flags-OFF surfaces "Studio 5" in the header; flags-ON shows no badge on
  the Studio tab, so the "5 things awaiting you" signal disappears from the root.
- Studio tab: a floating **"Your Studio" pill** sits top-left where a back button would be, duplicating
  the tab label; and the scroll has **no bottom inset**, so the Invoice row is clipped mid-line by the
  tab bar (53).
- Pieces tab: **"Wool Kilim Runner" renders a blank cream tile** — a missing image with no placeholder,
  no skeleton, no icon. On it the "% match" pill measures **1.86:1** text-on-pill (vs 4.86:1 over a dark
  photo) and the heart/… circles measure **2.01:1** against the tile.
- **Match-score contradiction, third value:** Heirloom Oak Dining Table reads **73% match** here,
  **57%** in the room-scoped grid, **50%** on its own detail page — all in one session.
- At AX-XXXL (54) the **tab bar does not scale at all** — ~17 pt labels beside ~60 pt body text; and the
  bell glyph disappears entirely leaving only the gold badge.

## Wrap-up
Restored: `content_size large`, `appearance light`, status bar override re-applied, app relaunched with
`-DeploymentTarget local`, `DailyRoomView.BellButton` present → **still signed in as client@patina.dev**.
System Reduce Motion / Bold Text / Increase Contrast all confirmed back to 0.
