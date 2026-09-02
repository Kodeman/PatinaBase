# Lane GAP4 — gap-fill: the non-LiDAR fallback → Style Conversation → Reveal → Floor Plan flow

Script: Today → "Scan it" → `QuietConversationFlowHost` → (no LiDAR on Simulator) `.fallback`
→ `ScanFallbackEntryView` → "Continue to Style Discovery" → `StyleConversationContainerView` Q1–Q5
→ `ContemplativePauseView` → `RevealView` → `ScanFloorPlanPreviewView` → Accept → `.roomProject`.
Repeat Reveal + conversation at `content_size accessibility-extra-large` (tests C1-32).
Compare question set + progress vocabulary against the onboarding quiz (shots/A/05-12).

READ-ONLY. Shots under `shots/GAP4/`, one line each in `shots/GAP4/ledger.md`.

## ⚠ Device deviation (recorded up front)
The brief assigned me clone **C** `670DE752-BA1B-40C1-899E-57B50D5743B5`. On arrival that device was
**already being driven by lane GAP6** — `research/GAP6.md` names the same udid, was created at 19:09,
and `ps` showed a Patina process on that device started seconds earlier (pid 48063, 7:09PM). Two
agents tapping one simulator manufactures fake defects (rule: "violating the simulator rules
manufactures fake defects"), so instead of touching GAP6's device — or any other lane's — I
**created a brand-new device of the same model/runtime**:

```
tfp-GAP4  6D836431-49CA-4BC6-B508-527021313A86  iPhone 17 Pro · iOS 26.5
```

Installed the steward's ONE signed Debug build (`.build/DerivedData/.../Patina.app`, no
CODE_SIGNING_ALLOWED=NO), applied the same `status_bar override` + `appearance light`, and signed in
with the same local seeded account `client@patina.dev` / `password123` on the same local stack.
No existing clone was touched. Every call below carries `6D836431-49CA-4BC6-B508-527021313A86`.

Difference from clone C that matters: this device starts with **empty UserDefaults**, so it has no
`patina.style_profile_response.v1`. That is *required* for this script — with a saved profile,
`QuietConversationFlowHost.swift:230-236` routes `.conversation` through `ProfileSkipBridge` and the
five questions never render. (Clone C's plist confirmed no style-profile key either, so both would
have worked; the fresh device also costs me the 28-Aug onboarding flags, so I walk onboarding first.)

## HID preflight — PASS
`describe_screen` → 14-node Welcome tree → tapped `auth.welcome.passwordButton` @ (201, 626) →
screen changed to the "Sign In / Welcome back to Patina" sheet.
Shots `00-preflight-before.png`, `01-preflight-after.png`.
⚠ First `describe_screen` returned the known empty `[]` node; the second returned the full tree —
the steward's §8.1 warning reproduced exactly on a brand-new device too.

---

## Source read first (compile-level, not yet sim-verified)
- `RoomScan/Views/QuietConversationFlowHost.swift:145-152` — `bootstrap()`: `RoomCaptureService.isSupported`
  false on Simulator → `step = .fallback`. Confirms the whole branch below is the **default Simulator path**.
- `:195-201` `.fallback` → `ScanFallbackEntryView` → `.conversation`; `:228-247` `.conversation` →
  `StyleConversationContainerView` → `.reveal`; `:249-267` `.reveal` → `.floorPlan`;
  `:269-289` `.floorPlan` Accept → `acceptFallbackFloorPlan()` → `.roomProject(roomId:)`.
- `StyleReveal/Views/RevealView.swift:79-92` — `aestheticName` is an **`HStack(spacing: 0)` of one
  `Text` per character** at `.font(.custom("PlayfairDisplay-Light", size: 42))`. A fixed-size custom
  font with no `relativeTo:` → **no Dynamic Type response at all**, and an HStack of glyphs **cannot
  wrap**. This is the C1-32 prediction; to be confirmed on screen.
- `RevealView.swift:14` — `onExploreAction` is a declared parameter and the host passes a real closure
  (`:259-264`, tracks `.revealProfileExplored`), but **nothing in `RevealView.body` ever calls it** —
  the body has exactly one button (`StyleContinueButton`). A designed secondary action is missing.
- `RevealView.swift:69-75` — `primaryTitle` returns a constant and its comment promises a
  `primaryCtaOverride` that does not exist; `:57` therefore shows the *same* string
  ("See What Fits Your Space") on both branches of its own ternary.
- `QuietConversationFlowHost.swift:337-346` — `resetForRescan()` sets `step = .initial`, but
  `bootstrap()` only runs from the host's `.onAppear`, which has already fired. `.initial` renders
  `PatinaColors.Background.primary.ignoresSafeArea()` — **an empty screen with no controls**. So
  "Rescan" on the floor-plan step looks like a dead end. To be confirmed on screen.
- `ScanFloorPlanPreviewView.swift:124-131` — stats row always shows "Items Detected" =
  `session.detectedObjects.count`, which is **always 0** on the manual path.

---

## Walk log

### Steps 1–8 — getting to the flow (setup, not the target surface)
Sign in `client@patina.dev` → iOS "Save Password?" (system, dismissed *Not Now*, not an app finding)
→ onboarding intro carousel → **Skip** ("Skips the introduction and continues to style questions")
→ onboarding style quiz Q1–Q5 → taste-portrait result → View Recommendations → Browse pieces
→ back → notification pre-prompt ("Before we interrupt you") → Not now → Today home
→ scroll to YOUR HOUSE → swipe the room strip to its end → `DailyRoomView.AddRoom` "Add a room"
→ menu **{Type the dimensions, Scan it}** → **Scan it**.
Shots `02`–`12`.

### GAP4-01 — "Scan it" silently becomes a typing form, with no word of explanation
**blocker-adjacent major · rooms-scan · testerVisible · confidence 0.95 · shot `13-fallback-entry.png`**

Tapping **"Scan it"** on `DailyRoomView.AddRoom` mounts `ScanFallbackEntryView` — the *manual
dimensions form* — with the header "TELL US ABOUT YOUR SPACE / What kind of room?". No camera, no
sheet, no toast, **not one word** saying why the scan did not start.
`QuietConversationFlowHost.swift:145-152`: `RoomCaptureService.isSupported == false` → `step = .fallback`.
It is the exact same destination as the menu's other item, "Type the dimensions".

Why it matters: `RoomCaptureService.isSupported` is a LiDAR check. Every iPhone in the first-round
tester pool that is not a **Pro** — iPhone 17, 17e, 16, 16e, SE, any iPad without LiDAR — lands here.
The tester asked the app to scan their room, and the app answered by asking them to type numbers,
pretending nothing happened. That reads as broken, not as a graceful fallback.

Fix sketch: keep the fallback, but tell the truth first — either grey out / relabel "Scan it" to
"Scan it · needs a Pro iPhone" when `isSupported` is false, or open the fallback with an honest
opening line ("This iPhone can't measure a room on its own — let's do it by hand, it takes a minute").
Effort **S**.

### GAP4-02 — the fallback entry screen is a hard dead end: no back, no cancel, and the pop gesture is dead
**major · rooms-scan/navigation · testerVisible · confidence 0.95 · shots `13`, `14-fallback-edge-swipe.png`, `15-fallback-edge-swipe2.png`**

`describe_screen` on the mounted screen returns **24 nodes and not one dismiss control** — no
navigation bar, no Cancel, no ✕, no "Not now". I then tried the interactive-pop gesture **twice**
(a 0.35 s swipe from x=2 and a 0.9 s swipe from x=1); the screen did not move either time — the two
"after" screenshots are pixel-for-pixel the first one.

So a tester who taps "Scan it" to look at it has exactly one way out of the app's own UI: complete a
five-question style quiz, sit through a pause, a reveal and a floor plan, and *create a room they did
not want*. The alternative is force-quitting Patina. `QuietConversationFlowHost` is a pushed
`NavigationStack` destination whose only exit is `leaveFlow(landingOn:)`, and no step before
`.floorPlan` ever calls it on the manual path.

Fix sketch: give the host a persistent "Not now" / ✕ that calls `leaveFlow(landingOn: .heroFrame)`,
and re-enable `.navigationBarBackButtonHidden(false)` (or the interactive pop) for `.fallback`.
Effort **S**.

### GAP4-03 — developer default dimensions are pre-filled and become the tester's real room data
**major · rooms-scan/state-honesty · testerVisible · confidence 0.9 · shot `13-fallback-entry.png`**

`ScanFallbackEntryView.swift:27-28` seeds `length = "18"`, `width = "14"` and the fields render those
values as if the user had typed them (clay-stroked "valid" borders, not placeholder grey). "Continue
to Style Discovery" is **enabled on arrival**, so the fastest path through the screen writes a room
measuring 18 × 14 ft / **252 sq ft** that the tester never entered — and `submit()` stamps
`scanQuality = 0.7` ("manual entry is fair") on top.

Corroborated on the same device: Today's YOUR HOUSE strip already carries a room named
**"Audit Ro…" showing "252 sq ft"** — 18 × 14 exactly (`shots/GAP4/09-home2.png`) — i.e. a previous
walk's untouched defaults are already sitting in the account as real data.

Fix sketch: start the fields empty with real placeholders ("18"), disable Continue until both are
entered, or label the row "typical for a living room — change it". Effort **S**.

### GAP4-04 — the two dimension fields have no accessibility label at all
**major · accessibility · confidence 0.95 · evidence: `describe_screen` tree on `13-fallback-entry.png`**

Both fields come back as `"AXLabel": null, "AXValue": "18"` / `"AXValue": "14"`. Source:
`ScanFallbackEntryView.swift:181` — `TextField("", text: text)`, an **empty** title, with the unit
caption living in a *separate* `Text` below the box. VoiceOver therefore announces only
"18, text field" / "14, text field": a blind tester cannot tell length from width, and cannot tell
feet from metres.

Fix sketch: `TextField("", text:).accessibilityLabel("\(title) in \(unit.label)")`, or give the
`TextField` its real title and hide it visually. Effort **S**.

### GAP4-05 — stepper VoiceOver labels are ungrammatical, and the two rows share duplicate AX ids
**minor · accessibility/copy · confidence 0.95 · evidence: AX tree**

`ScanFallbackEntryView.swift:249,262` build the labels as `"Remove one \(title.lowercased())"`, so
VoiceOver says **"Remove one windows"**, **"Add one windows"**, **"Remove one doors"**,
**"Add one doors"**. Separately, all four buttons carry `AXUniqueId` `"minus"` / `"plus"` — the SF
Symbol name — so the Windows and Doors steppers are **indistinguishable by id** (two elements share
`"minus"`, two share `"plus"`), which also makes them unaddressable in UI tests.

Fix sketch: singularise ("Add a window", "Remove a door") and give real ids
(`scan.fallback.windows.increment`, …). Effort **S**.

### GAP4-06 — full-colour emoji as the room-type iconography inside a monochrome editorial system
**minor · visual-system · testerVisible · confidence 0.85 · shot `13-fallback-entry.png`**

The six room-type tiles use 🛋 🛏 🍽 💻 🍳 ✨ at `.system(size: 20)`
(`ScanFallbackEntryView.swift:88-95`). Everything around them is cream, charcoal, clay and
Playfair/DM Mono; the emoji are saturated blue, red, yellow and grey and change shape with each iOS
release. The selected "Living" tile inverts to charcoal, and the blue sofa emoji on charcoal is the
loudest thing on the screen. The same emoji vocabulary is used in the onboarding quiz
(`shots/A/07,10,11`), so this is systemic rather than a one-screen slip.
Fix sketch: SF Symbols (`sofa`, `bed.double`, `fork.knife`, `laptopcomputer`, `frying.pan`, `sparkles`)
tinted with the semantic tokens. Effort **S**.

### GAP4-07 — the units control is the one stock UIKit segmented control in a bespoke screen
**polish · visual-system · confidence 0.8 · shot `13-fallback-entry.png`**

`.pickerStyle(.segmented)` at `:169` renders the standard grey iOS segmented control immediately
beside hand-drawn clay-stroked fields and hand-drawn stepper capsules. It is the only stock control
on the surface and reads as a placeholder. (It *is* an improvement on the two bare `Text` buttons
SP-19 replaced — the state is now legible — so this is a finish note, not a regression.)
Effort **S**.

### GAP4-08 — the conversation opens by telling the user "YOUR ROOM IS CAPTURED" when nothing was captured
**major · copy/state-honesty · testerVisible · confidence 0.95 · shot `16-conv-q1.png`**

Q1's whisper reads verbatim **"YOUR ROOM IS CAPTURED · LET'S DISCOVER YOUR STYLE"**. On this path the
room was not captured by anything — the user typed "18" and "14" into two boxes thirty seconds ago.
The copy is written for the LiDAR walk and is reused unchanged for the manual fallback
(`QuietConversationFlowHost.swift:195-201` sends both paths into the same
`StyleConversationContainerView`). Fix sketch: branch the whisper on `session.scanMethod == .manual`
("YOUR ROOM, NOTED · LET'S DISCOVER YOUR STYLE"). Effort **S**.

### GAP4-09 — the second style quiz has NO progress indicator, and its whispers misstate the progress
**major · onboarding/copy · testerVisible · confidence 0.95 · shots `16`,`18`,`20`,`22`,`23`**

The onboarding quiz (`shots/A/05-12`) tells you exactly where you are on every screen: a dark footer
card with an italic section name, **"Question N of 5"**, a mono **"STEP N OF 5"** and a **percentage
plus a filled progress bar** (20 / 40 / 60 / 80 / 100 %).

`StyleConversationContainerView` — a *second* five-question quiz — has **none of it**. No counter, no
bar, no percentage. All the user gets is a mono whisper that is wrong twice over:

| | scan conversation whisper | true position |
|---|---|---|
| Q1 | `YOUR ROOM IS CAPTURED · LET'S DISCOVER YOUR STYLE` | 1 of 5 |
| Q2 | `KEEP GOING — YOU'RE DOING GREAT` | 2 of 5 |
| Q3 | **`ALMOST THERE`** | **3 of 5 — 40 % done** |
| Q4 | **`ONE MORE THOUGHT`** | **4 of 5 — there are two left** |
| Q5 | `LAST ONE` | 5 of 5 ✓ |

"ALMOST THERE" at question three and "ONE MORE THOUGHT" with two questions remaining are both
untrue, and "KEEP GOING — YOU'RE DOING GREAT" praises the tester for having answered one question.
Against the brand's quiet voice this reads as filler. Fix sketch: reuse the onboarding quiz's footer
component verbatim — one progress vocabulary for both quizzes. Effort **M**.

### GAP4-10 — Q1's four "room photographs" are placeholder gradients, and the VoiceOver label calls them photographs
**major · onboarding/visual-system/accessibility · testerVisible · confidence 1.0 · shot `16-conv-q1.png`**

`VisualResonanceView.swift:16` — *"Replace these gradients with real photographs when assets land."*
They have not landed. The question asks **"Which room speaks to you?"** and shows four abstract
colour washes; a tester is asked to pick a room from four blank rectangles. The accessibility label
(`:92`) states `"\(displayName) room photograph"`, so VoiceOver announces "Warm Minimal room
photograph" for a gradient — the AX tree confirms all four.
The onboarding quiz asks the honest version of the same question over the same gradients
("Which **palette** feels like home?", `shots/A/05-quiz-q1.png`) — so the fix already exists one
screen away. Fix sketch: ship the photography, or ask about palettes here too and drop "photograph"
from the label. Effort **M** (S if copy-only).

### GAP4-11 — the taxonomy differs between the two quizzes that ask the same question
**minor · copy/naming · confidence 0.9 · shots `04-after-skip.png` vs `16-conv-q1.png`**

Onboarding Q1 options: Warm Minimal · Cool Modern · **Classic Comfort** · **Eclectic Curated**.
Conversation Q1 options: Warm Minimal · Cool Modern · **Layered Comfort** · **Curated Mix**.
Two of four names silently change between two quizzes the same tester takes twenty minutes apart,
over identical gradients. Onboarding Q3 asks "Which **material** draws you in?" while conversation Q3
asks "What **texture** calls to you?" over the same six swatches. Onboarding Q4 prints ranges with an
en dash (`$500 – $2,000`); conversation Q4 prints them with a hyphen (`$500 - $2,000`). Effort **S**.

### GAP4-12 — five questions, five different option components
**major · visual-system · testerVisible · confidence 0.9 · shots `16`,`18`,`20`,`22`,`23`**

Inside one five-screen quiz the answer control changes shape every single screen:
Q1 square gradient tiles on an 8 pt grid · Q2 ragged-flow capsule pills **with emoji** ·
Q3 a gutterless slab of six square swatches (**3 pt** gutters, no emoji) · Q4 a borderless editorial
list with hairline rules and no icons at all · Q5 large rounded cards with a hairline stroke.
Nothing carries through — not the corner radius, not the gutter, not whether options have icons, not
whether options have a supporting line. It reads as five screens by five people. Effort **M**.

### GAP4-13 — Q3's grid has a 3 pt gutter and its CTA sits 0.3 pt off the swatches
**minor · visual-system/layout · testerVisible · confidence 0.95 · shot `20-conv-q3.png` + AX frames**

Measured from the AX tree: Q3 tiles are `x 24 … 199.67` then `202.67 …` → **3.0 pt** horizontal
gutter, rows `230 … 405.67` then `408.67` → **3.0 pt** vertical, so the six swatches read as one
solid slab rather than six choices. Q1's tiles on the previous screen measure an **8 pt** gutter.
Worse, the bottom swatch row ends at **y = 762.67** and the `Continue` capsule starts at **y = 763** —
a **0.33 pt** gap: the CTA is glued to the content with no breathing room, and the bottom tiles'
rounded corners are visually cut by it. Effort **S**.

### GAP4-14 — the "choose up to three" cap is enforced silently; the fourth tap does nothing at all
**minor · feedback/state-honesty · testerVisible · confidence 0.95 · shot `21-conv-q3-fourth-tap.png`**

With Weathered Oak, Soft Linen and Woven Rattan selected I tapped **Brushed Metal**. Nothing
happened — no shake, no toast, no dimming of the unselectable tiles, no counter ("3 of 3 chosen").
The tile stayed fully lit and fully tappable-looking. A tester reads that as an unresponsive tap, not
as a rule. Fix sketch: dim the remaining tiles at the cap, or show "3 of 3" beside "Choose up to
three". Effort **S**.

### GAP4-15 — 🚩 the Reveal's aesthetic name renders in the system font: `PlayfairDisplay-Light` is not in the bundle
**major · visual-system/typography · testerVisible · confidence 1.0 · shots `24-pause-t1.png`, `25-reveal-dark.png`, `26-reveal-light.png`**

`RevealView.swift:83` sets the hero name in `.font(.custom("PlayfairDisplay-Light", size: 42))`.
The shipped bundle contains **PlayfairDisplay-Regular, -Italic and -Medium and no -Light**:

```
$ find Patina.app -name "*.ttf"
  .../PatinaDesignKit_PatinaDesignKit.bundle/PlayfairDisplay-Medium.ttf
  .../PlayfairDisplay-Italic.ttf
  .../PlayfairDisplay-Regular.ttf
  .../Inter-{Regular,Medium,SemiBold}.ttf  DMMono-{Light,Medium,Regular}.ttf
```

`.custom` fails silently to the system face, so **"Modern Warmth" — the single most important word in
the whole flow — renders in Helvetica/SF** while the question screen immediately before it renders in
proper Playfair italic. Confirmed in both appearances (`25`, `26`).
`"PlayfairDisplay-Light"` is used **exactly once** in the codebase:
`grep -rhoE '\.custom\("[A-Za-z0-9-]+"' → 1 × PlayfairDisplay-Light` (every other name maps to a
shipped file). Fix sketch: use `PlayfairDisplay-Regular` at 42 pt, or add the Light .ttf to
PatinaDesignKit's resources. Effort **S**.

### GAP4-16 — 🚩 the Reveal's only CTA is invisible in light mode: charcoal capsule on a charcoal ground
**blocker-adjacent major · visual-system/navigation · testerVisible · confidence 1.0 · shots `26-reveal-light.png` (invisible) vs `25-reveal-dark.png` (correct)**

`RevealView.swift:34` paints the ground with the **raw brand constant** `PatinaColors.charcoal`
instead of a semantic token. Its only button is `StyleContinueButton`, which fills with
`PatinaColors.Interactive.active` = `patinaDynamic(light: charcoal, dark: DarkPalette.textPrimary)`
(`PatinaColors.swift:136-138`). In **light** appearance that is charcoal-on-charcoal: the capsule
vanishes and only the off-white label survives, floating as what looks like a caption at the bottom
of the screen. I proved the mechanism by flipping the simulator to **dark**, where
`Interactive.active` resolves light and the same button renders as a correct cream capsule (`25`),
then back to light where it disappears again (`26`).

Why it matters: this is the flow's climax and its **only** forward control. A light-mode tester sees
a dark screen with a style name and a small line of text at the bottom, with nothing that looks
tappable. This is the exact fault SP-19/F187 fixed on `ScanFloorPlanPreviewView` (its header comment
still describes it) — `RevealView` was missed. Fix sketch: paint the Reveal with the semantic
inverse-surface tokens, or give the CTA an explicit on-charcoal fill. Effort **S**.

### GAP4-17 — the Reveal's designed secondary action is dead code; the CTA's own override never existed
**minor · navigation/code-health · confidence 0.95 · `RevealView.swift:14,57,69-75`**

The host passes `onExploreAction:` and tracks `.revealProfileExplored`
(`QuietConversationFlowHost.swift:259-264`), but `RevealView.body` never calls it — the body contains
exactly one button. So an analytics event exists for a control the user cannot reach, and the
"explore your profile" affordance the design implies is simply absent. Separately `:57` reads
`profile.aestheticName.isEmpty ? "See What Fits Your Space" : primaryTitle` and `primaryTitle`
returns the identical string, so both branches of the ternary are the same; its comment promises a
`primaryCtaOverride` parameter that does not exist anywhere in the file. Effort **S**.

### GAP4-18 — 🚩 C1-32 CONFIRMED, and worse: at accessibility text sizes the aesthetic name is unreadable overlapping glyphs
**blocker-adjacent major · accessibility/visual-system · testerVisible · confidence 1.0 · shot `27-reveal-axXL.png`**

At `content_size accessibility-extra-large`, "Modern Warmth" on the Reveal renders as
**"vodern Aarrth"** — the letters are drawn *on top of one another* and the word is not readable at
all. It is not truncation and not clipping: it is thirteen glyphs printed over each other.

Mechanism, from the AX tree at that size: the name is **thirteen sibling `StaticText` nodes**, each
`AXFrame` **27.67 pt wide × 106 pt tall**, laid at x = 51.17, 78.83, 106.5, 134.17, … 350.83 — a
constant 27.67 pt pitch. `RevealView.swift:80-84` builds `HStack(spacing: 0) { ForEach(chars) { Text }}`,
so each character is its own view; at AX sizes the glyph grows past its 27.67 pt slot while the
neighbours hold their positions, and nothing clips, so the glyphs collide. An `HStack` of glyphs also
**cannot wrap**, so a longer aesthetic name has no escape at any text size.

The C1-32 prediction was "spells the aesthetic name one letter per view in a stack that cannot wrap".
Confirmed on screen, on the flow's climax screen, in the default light appearance.
Fix sketch: render the name as **one `Text`** with `.minimumScaleFactor` and multiline wrapping, and
drive the letter-by-letter reveal with a per-character opacity mask or `AttributedString` transition
rather than one view per character. Effort **M**.

### GAP4-19 — 🚩 VoiceOver reads the aesthetic name thirteen times
**major · accessibility · confidence 1.0 · evidence: AX tree on `27-reveal-axXL.png`**

The same thirteen per-character `StaticText` nodes each carry the label **"Modern Warmth"** — the
`.accessibilityLabel(Text(profile.aestheticName))` at `RevealView.swift:89` is applied to the
`HStack`, which does **not** merge its children, so the container label is inherited by every glyph
view. A VoiceOver user swiping through the Reveal hears "Modern Warmth" thirteen consecutive times,
once per letter, before reaching the spectrum. Fix sketch: add
`.accessibilityElement(children: .ignore)` (or collapse to one `Text`, which fixes GAP4-18 too).
Effort **S**.

### GAP4-20 — at accessibility sizes both floor-plan buttons truncate: "Resc…" and "This Loo…"
**major · accessibility/layout · testerVisible · confidence 1.0 · shots `28-floorplan-axXL.png` vs `29-floorplan-large.png`**

`ScanFloorPlanPreviewView.swift:50-70` pins both buttons to `.frame(height: 52)` with no
`minimumScaleFactor` and no vertical growth, so at `accessibility-extra-large` the labels are cut to
**"Resc…"** and **"This Loo…"**. The primary action on the last screen before a room is created is
unreadable. The stats row degrades with it: "SQUARE FEET" wraps to two lines, "WINDOWS" stays on one,
and **"ITEMS DETECTED" truncates to "ITEMS DETECT…"**, so the three columns no longer share a
baseline. Fix sketch: let the buttons grow vertically (`.frame(minHeight: 52)`), stack them at
accessibility sizes, and give the stat labels `.minimumScaleFactor(0.8)` + `lineLimit(2)`. Effort **S**.

### GAP4-21 — the floor plan says "Here's what I see." and reports "0 ITEMS DETECTED" for a room nobody looked at
**major · copy/state-honesty · testerVisible · confidence 0.95 · shot `29-floorplan-large.png`**

Header: **"YOUR SPACE / Here's what I see."** The app saw nothing — it drew a rectangle from the two
numbers the user typed. The stats row then reports **"0 · ITEMS DETECTED"**
(`ScanFloorPlanPreviewView.swift:124-131` reads `session.detectedObjects.count`, which is
structurally always 0 on the manual path), presented in the same weight as the real numbers, so the
screen's own summary of itself is "I detected nothing". The secondary button is labelled **"Rescan"**
on a path where nothing was ever scanned. Fix sketch: branch header, stat set and button label on
`session.scanMethod == .manual` — "Here's what you told me", drop the detected-items column, and call
the button "Start over". Effort **S**.

### GAP4-22 — GOOD: the destination is honest even though the flow that reaches it is not
**good · rooms-scan · shot `32-landing.png`**

Accept landed correctly on `.roomProject` (no black frame, no lost push — the `exitRoute`/`onDisappear`
handshake at `QuietConversationFlowHost.swift:44-58` works), and the room page states plainly:
**"Living Room · 14 × 18 FT · 252 SQ FT · TYPED, NOT SCANNED"**. That "TYPED, NOT SCANNED" stamp is
exactly the honesty the flow's own copy ("YOUR ROOM IS CAPTURED", "Here's what I see") lacks — the
fix for GAP4-01/08/21 is to make the flow speak the way this screen already does. Empty state
("A blank canvas", 0 SAVED PIECES) is designed, not blank. The Reveal→floor-plan→room transition ran
with no spinner over 1 s and no blank frame.

### GAP4-23 — the companion FAB sits on top of the landing screen's controls (and of Today's, and Browse's)
**major · visual-system/layout · testerVisible · confidence 0.95 · shots `32-landing.png`, `10-home-scrolled.png`, `07-today-home.png`**

On the room page the FAB's ~78 pt charcoal disc is centred **directly over the "Edit dimensions /
Set a budget" row**, covering the middle of that pill and sitting between its two labels. The same
FAB overprints "5 THINGS NEED YOUR EYE" on Today (`10`) and a product card's description on Browse
(`07`). It is not a scroll artefact — it is the resting position. Fix sketch: give the scroll
content bottom inset equal to the FAB's height + margin, and move the FAB clear of any control row.
Effort **S**.

### GAP4-24 — the new room is named "Living Room" with no disambiguation from the "Living Room" already in the house
**minor · rooms-scan/copy · testerVisible · confidence 0.85 · shots `11-house-strip-end.png`, `32-landing.png`**

`FallbackRoomDraft` names the room from the chosen type, so the fallback produced **"Living Room"**
while the YOUR HOUSE strip already carried a "Living Ro…" card. Two identically named rooms, no
"2", no date, no prompt to name it — and the fallback form never offers a name field at all. It also
never asks for ceiling height, which the LiDAR path captures. Effort **S**.

### GAP4-25 — 🚩 BLOCKER: "Rescan" on the floor plan strands the tester on a permanently blank screen; only force-quitting recovers
**blocker · rooms-scan/navigation · testerVisible · confidence 1.0 · shots `37-rescan-t1.png`, `38-rescan-t2.png`, `39-rescan-escape-attempt.png`, `40-rescan-after-resume.png`, `41-after-forcequit.png`**

Tapping **Rescan** on `ScanFloorPlanPreviewView` produced an **entirely empty cream screen**. Not a
slow load — `describe_screen` returns **exactly one node, the `Patina` application element**, and
nothing else. It stayed that way for the whole observation.

Recovery attempts, in order:
1. Interactive pop from the left edge (0.7 s drag) — **no effect**; the AX tree is still the single
   application node (`39`).
2. **HOME, then reopen the app** — still the blank screen (`40`). Backgrounding does not reset it.
3. **Terminate and relaunch** (what a tester does as "force-quit from the app switcher") —
   **recovers**, landing on Today (`41`).

Mechanism (matches the source exactly): `QuietConversationFlowHost.resetForRescan()` at `:337-346`
sets `step = .initial`, and `.initial` renders only
`PatinaColors.Background.primary.ignoresSafeArea()`. The only caller of `bootstrap()` — which is what
moves `.initial` on to `.threshold` or `.fallback` — is the host's `.onAppear`, which fired long ago
and never fires again, and `bootstrap()` is additionally guarded by `step == .initial`. So the flow
parks on a blank state with no controls and no timer to leave it.

This is reachable in **two taps from Today** on any non-LiDAR iPhone — "Add a room → Scan it →
Continue → Rescan" — and there is no LiDAR check involved, so the same `resetForRescan()` is on the
LiDAR path too. A first-round tester who wants to correct the dimensions taps the button that says so
and loses the app. Fix sketch: have `resetForRescan()` call `bootstrap()` (or set the step directly),
and give `.initial` a real loading state rather than a bare background. Effort **S**.

### GAP4-26 — the second room silently skips the whole "Style Discovery" the button just promised
**major · rooms-scan/copy/navigation · testerVisible · confidence 0.95 · shots `34-fallback-pass2.png`, `36-pass2-after-continue-t2.png`**

Second run, same device, same account: "Add a room → Scan it" → the identical fallback form → the
identical button **"Continue to Style Discovery"** → and the app goes **straight to the floor plan**.
No questions, no pause, no reveal, no explanation, no "using the style you already told us".

That is `ProfileSkipBridge` (`QuietConversationFlowHost.swift:255-262`) doing exactly what PT-4-8
designed it to do — a returning user should not re-take the quiz — but the CTA still promises "Style
Discovery", and the manual path has no equivalent of the LiDAR path's `SoftLandingView`
("Use my style" / "Update my style"), so there is no way to *ask* for the conversation again from
here. The tester is left with a button that lies in one direction and a feature they can no longer
reach in the other. Fix sketch: label the button by what will happen
(`StyleProfileStore.shared.currentProfile == nil ? "Continue to Style Discovery" : "See your floor plan"`)
and surface the SoftLanding fork on the manual path. Effort **S–M**.

### GAP4-27 — the flow forgets nothing and remembers nothing: the fallback form resets to the developer defaults every time
**polish · rooms-scan · confidence 0.85 · shot `34-fallback-pass2.png`**

The second entry re-opened at Living / 18 / 14 / 2 windows / 1 door — the same hard-coded seed,
despite the account already holding a Living Room of exactly those dimensions. Resetting the *unit*
is deliberate and correct (SP-19/F40), but resetting to a fabricated 18 × 14 makes the duplicate-room
outcome of GAP4-03/GAP4-24 the default result of every visit. Effort **S**.

---

## Pass 3 — the conversation at `accessibility-extra-large` (taste portrait reset first)

To reach the conversation a third time I cleared the saved profile through the app's own
**Settings → "Reset taste portrait" → Reset** (`SettingsView.swift:182-190`; the plist keys
`patina.style_profile_response.v1` / `…_completed.v1` were confirmed gone afterwards). Editing the
plist directly did **not** work — cfprefsd rewrites it — so the in-app path is the only reliable reset.

### GAP4-28 — 🚩 at accessibility text sizes the five questions overflow the screen: labels run off the right edge, CTAs fall below the bottom
**blocker-adjacent major · accessibility · testerVisible · confidence 1.0 · shots `57`–`61`, `62-pause-f2*`**

`StyleConversationContainerView` is a fixed `VStack` with **no `ScrollView`**, so at
`accessibility-extra-large` every question breaks, and measurably:

| screen | what happens | measurement |
|---|---|---|
| Q1 `57` | all four option names truncate to **"Warm…", "Cool M…", "Layered…", "Curated…"** over unlabelled gradients — the question becomes unanswerable | `Inter-SemiBold 11 relativeTo:.caption2` in a fixed-aspect square |
| Q2 `58` | the first pill **runs off the right edge of the display** — "Love having people ove" is cut by the screen, not ellipsised | AX frame `x 23.25, width 416.83` → right edge **440.08 pt on a 402 pt screen** (38 pt off-screen) |
| Q2 `58` | `Continue` is pushed into the home-indicator zone | AX frame `y 814…866` on an 874 pt screen |
| Q3 `59` | "Weathered Oak" wraps **mid-word** ("Weathere / d Oak"); the whisper "ALMOST THERE" is jammed against the status bar | — |
| Q3 `59` | `Continue` is **cut off by the bottom edge** and, before a selection exists, is **absent from the AX tree entirely** — a VoiceOver user cannot reach it | after selecting, AX frame `y 830.33…882.33` → **8.33 pt below the 874 pt screen** |
| Q4 `60` | **every** tier name and descriptor truncates — "Thoughtf…", "Curate…", "Heirloo…", "Let's Di…", "Smart finds…", "Quality pi…", "Pieces you'…" — while the *prices* stay fully legible; the 4th row is clipped by the bottom edge | — |
| Q5 `61` | "A piece that anch…", "More room to bre…" truncate; the 4th card is clipped and the home indicator crosses "Less clutter, more c…" | — |

Fix sketch: wrap the container body in a `ScrollView`, give the pills `lineLimit(2)` +
`.fixedSize(horizontal: false, vertical: true)` inside a width-constrained flow, and let the option
rows grow vertically instead of truncating. Effort **M**.

### GAP4-29 — the fallback form also degrades at accessibility sizes (word-break, ragged tiles, truncated CTA)
**major · accessibility · testerVisible · confidence 1.0 · shots `45-fallback-axXL.png`, `46-fallback-axXL-scrolled.png`**

Unlike the conversation this screen **is** a `ScrollView`, so nothing is unreachable — but:
"Bedroom" **breaks mid-word** to "Bedroo / m"; the first grid row's three tiles end up three
different heights, so the grid is visibly ragged; the emoji stay at a fixed `.system(size: 20)`
while the labels roughly double, collapsing the icon/label proportion; the `−`/`+` stepper glyphs
stay at a fixed `.system(size: 12)` beside ~40 pt row titles and stop reading as controls; the
segmented unit control is pinned to `.frame(width: 104)` and does not grow while "ROOM DIMENSIONS"
wraps to two lines; and the CTA truncates to **"Continue to Style Di…"**. Effort **S–M**.

### GAP4-30 — ContemplativePauseView: captured, and it is honest and quiet — but it is 1.2 s of an unattributed "me"
**polish/good · companion/copy · confidence 0.9 · shot `62-pause-f23.png`**

Caught mid-crossfade: the pause reads **"Let me think about this."** in Playfair italic with three
animating dots, on `Background.primary`, then cross-dissolves into the charcoal Reveal. It is
restrained and it *is* a designed state rather than a spinner — GOOD, and `runScoring()`
(`ContemplativePauseView.swift:66-100`) guarantees a 1.2 s floor with a local-engine fallback so it
never hangs and never shows a raw error. Two notes: (a) "me" is never attributed — the flow has no
companion avatar or name on screen, and this is the only first-person voice besides the floor plan's
"Here's what I see."; (b) the pause is cream and the Reveal is charcoal, so the crossfade passes
through a flat mid-grey wash (visible in the frame) rather than resolving cleanly. Effort **S**.

### GAP4-31 — the two quizzes produce two different names for the same person's taste, and the second silently overwrites the first
**major · copy/state-honesty · testerVisible · confidence 0.95 · shots `06-onboard-quiz-done.png`, `48-studio.png`, `64-reveal-large-settled.png`**

On one device, one account, one session:
* the onboarding quiz produced **"Warm Modern"**, labelled **"YOUR TASTE PORTRAIT"** (`06`);
* the scan conversation produced **"Modern Warmth"**, labelled **"YOUR STYLE, FOUND"** (`64`);
* the Studio hub then displays the pill **"✦ Modern Warmth"** (`48`) — the second answer has replaced
  the first, with no mention that anything changed.

Two near-anagram names for the same taste, from two quizzes that ask overlapping questions, under
three different labels ("taste portrait" / "style" / "Style Quiz"). And the two live in different
stores — onboarding never writes `StyleProfileStore` (`grep -rn "StyleProfileStore.shared"` shows the
only writers are `StyleConversationViewModel` and `ContemplativePauseView`), which is exactly why the
tester is asked twice. Fix sketch: one taste model, one name for it, and one quiz — have the scan
flow reuse the onboarding portrait instead of running a second questionnaire. Effort **L**.

### GAP4-32 — after the taste reset the profile still shows a portrait-shaped badge, "✦ Style Explorer"
**minor · state-honesty/copy · testerVisible · confidence 0.9 · shot `54-after-exit-quiz.png`**

Immediately after "Reset taste portrait", the Studio hub shows **"✦ Style Explorer"** where it
previously showed "✦ Modern Warmth". The user now has *no* taste portrait, but the UI presents a
placeholder that looks exactly like one — same pill, same sparkle. An empty state here should invite
the quiz ("Take the style quiz →"), not invent a name. Effort **S**.

### GAP4-33 — "Retake Style Quiz" opens a THIRD style-question surface, with the onboarding taxonomy
**minor · onboarding/navigation · testerVisible · confidence 0.95 · shots `53-quiz-closed.png`, `55-retake-repro.png`**

Studio hub → YOUR PROFILE → **"Retake Style Quiz"** navigates to `AppRoute.styleQuiz` →
`StyleQuizView` (`ProfileView.swift:154-156`, `ContentView.swift:324`) — a standalone quiz with an
"Exit quiz" ✕, the dark "Question 1 of 5 / STEP 1 OF 5 / 20%" footer, and the **onboarding**
options *Warm Minimal · Cool Modern · Classic Comfort · Eclectic Curated*. So the app ships three
style-question surfaces — `OnboardingFlowView`'s quiz, `StyleQuizView`, and
`StyleConversationContainerView` — of which the first two share a taxonomy and the third does not,
and only the third feeds the Reveal. (This screen *does* have a proper ✕ exit, which the scan flow
lacks — see GAP4-02.) Effort **M**.

### GAP4-34 — at accessibility sizes the auth root truncates its own legal links
**minor · accessibility/prod-readiness · testerVisible · confidence 0.95 · shot `49-retake-quiz-axXL.png`**

Observed incidentally at `accessibility-extra-large`: the Welcome screen shows
**"Continue with Goo…"**, **"By continuing, you agr…"** and **"Terms of… and Privacy…"**. The
Terms-of-Service and Privacy-Policy links — the consent line App Review reads — are unreadable at
accessibility text sizes. Effort **S**.

---

## What is GOOD (calibration)
- **The room page tells the truth.** "Living Room · 14 × 18 FT · 252 SQ FT · **TYPED, NOT SCANNED**" is
  exactly the honesty the flow that produced it lacks. Its empty state ("A blank canvas", 0 SAVED
  PIECES) is designed, not blank.
- **Q4's editorial list is the best screen in the flow** at default text size: serif tier names,
  mono prices, hairline rules, no chrome. It looks like the brand.
- **Q5's copy is genuinely good**: "What would change everything?" / "A place to gather — Somewhere
  people want to sit and stay". Quiet, concrete, not chirpy.
- **Selection feedback on Q2/Q3/Q5 is unambiguous** — charcoal fill with white text, or a filled
  checkmark disc, both settling in ~0.2 s.
- **The Contemplative Pause is a designed waiting state, not a spinner**, with a 1.2 s floor and a
  local-engine fallback that cannot throw — no raw error can reach the user here.
- **No crash, no spinner over 1 s, no blank frame anywhere in the happy path.** Q1/Q4/Q5 auto-advance
  within ~0.4 s of the tap; the Reveal → floor plan → room hand-off is clean.
- **The flow-exit handshake works**: `exitRoute` + `onDisappear` landed `.roomProject` with no black
  pushed container (the bug its comment documents is genuinely fixed).
- `describe_screen` labels are present and sensible on most controls (`DailyRoomView.*`,
  `Onboarding.SkipButton`, `SettingsView.ResetTasteButton`), and the tag pills on the Reveal reflow
  correctly at accessibility sizes via `StylePillFlow`.

## What I could NOT verify, and why
1. **The sign-out after "Retake Style Quiz" (shots `49`–`51`) — observed once, NOT reproduced.** A
   clean repro at default text size (`55`) opened `StyleQuizView` normally with the session intact.
   I cannot attribute a cause and am **not** filing it as a finding. What is solid and worth a look:
   after signing back in, the app restored the pushed `.styleQuiz` route and dropped the user
   **inside the quiz** rather than on Today (`52`).
2. **The ContemplativePauseView in isolation.** My screenshot cadence (~0.5 s/frame via `simctl io`)
   is coarser than the 1.2 s pause plus its crossfade, so `62-pause-f23.png` catches it mid-dissolve
   into the Reveal rather than alone. Its copy and dots are legible in that frame and its logic is
   read from source; a clean plate would need a screen recording.
2b. **Every claim here is sim-verified only.** Nothing in this lane is device-verified.
3. **The LiDAR branch** (`.threshold` → `ScanThresholdView` → `ScanReviewView` → `.savedConfirmation`
   → `SoftLandingView`) is unreachable on a Simulator — `RoomCaptureService.isSupported` is false —
   so I could not check whether `SoftLandingView`'s "Use my style / Update my style" fork behaves,
   nor whether GAP4-25's `resetForRescan()` blank screen also strands LiDAR users (the source says
   the same code path runs, so it very likely does).
4. **Real Aesthete-engine names.** The local stack's inference worker is unconfigured
   (`inference_unconfigured`, steward §2), so every profile came from `LocalAestheteEngine`. A
   production name longer than "Modern Warmth" (13 characters) would overflow `RevealView`'s
   un-wrappable `HStack` at the *default* text size too — I could not force one to prove it.
5. **VoiceOver was not actually run.** GAP4-04/05/19 are read from the AX tree
   (`describe_screen`), which is what VoiceOver reads, but no speech was heard.
6. **Haptics** are not observable through this harness; per the brief I recorded latency and
   loading states instead.
7. **The device deviation**: everything above was walked on `tfp-GAP4`
   `6D836431-49CA-4BC6-B508-527021313A86`, a clone-equivalent I created because lane GAP6 was
   already driving the assigned clone C. Same build, same account, same local stack.
