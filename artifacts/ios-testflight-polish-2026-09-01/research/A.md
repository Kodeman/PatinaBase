# Lane A — walker: local stack, flags OFF, fresh install

Device: `8A11B31F-FD18-4751-976F-0999EFD8B0CA` (tfp-A, iPhone 17 Pro, iOS 26.5, light appearance, status bar overridden 9:41)
Launch: `xcrun simctl launch 8A11B31F-FD18-4751-976F-0999EFD8B0CA cloud.patina.app -DeploymentTarget local`
Build: Debug, signed, GitCommit `d7287c3f+`
Started: (see entries)

---
## Step 1 — Cold first launch (fresh install, local, flags OFF)

Launch issued 15:56:47. Timed screenshot series `01-cold-t1..t12.png` (t = seconds after launch command returned).

| t | frame |
|---|---|
| +0.4→1.0 | **pure white**, status bar HIDDEN, no logo, no colour (`01-cold-t1.png`) |
| +1.3→2.0 | cream splash, **PATINA wordmark at partial opacity**, strata lines faint, status bar back (`01-cold-t2.png`) |
| +2.2→2.8 | cross-fade: Welcome home behind a still-visible splash wordmark (`01-cold-t3.png`) |
| +3.1 | settled, interactive Welcome screen (`01-cold-t4.png`) |

**First interactive frame ≈ 3.1 s** on a warm-disk simulator.

### A-01 — Launch screen is plain white with no status bar; the app is cream with one
`INFOPLIST_KEY_UILaunchScreen_Generation = YES` + `INFOPLIST_KEY_UIStatusBarHidden = YES`
(project.pbxproj:690-691) generate a blank white launch screen with the status bar suppressed.
The app's own background is cream (`PatinaColors.Background.primary`). A tester therefore sees
white-no-statusbar → cream-with-statusbar → content: two visible pops in the first second.

### A-02 — The splash wordmark never reaches full opacity before the splash is dismissed
`SplashView.onAppear` animates `wordmarkOpacity 0→1` over **`.easeOut(duration: 2.0)`**
(SplashView.swift:44) and the strata lines over `1.0s` **after a 0.5 s delay** (finishes at 1.5 s),
but the phase gate is `AppCoordinator.splashMinimumDuration = 1.5` (AppCoordinator.swift:81).
The brand moment is cut at 75 % of its own fade. `01-cold-t2.png` shows PATINA as light grey;
`01-cold-t12.png` shows the Welcome screen's identical wordmark near-black. Same glyphs, two
different weights, one second apart.

### A-03 — Three different icon idioms in three stacked auth buttons
`describe_screen` AXLabels, verbatim:
`"Sign in with Apple"` (SF Symbol apple.logo) · `"G, Continue with Google"` (the **letter G** set in
the UI font, not Google's brand mark) · `"✉, Continue with email"` (**a colour emoji**, U+2709).
`01-cold-t12.png` shows the emoji envelope rendering blue-grey against otherwise monochrome ink.

### A-04 — Terms of Service / Privacy Policy tap targets are 14.7 pt tall
`auth.welcome.termsLink` AXFrame `{{97, 785.3}, {97.7, 14.7}}`, `auth.welcome.privacyLink`
`{{224.3, 785.3}, {80.7, 14.7}}` — a third of the 44 pt HIG minimum, and the two sit 4 pt apart
horizontally. These are the legal links a beta-review reader is told to tap.

### GOOD
- The splash→Welcome cross-fade itself is a genuine dissolve, not a cut.
- Welcome copy is in voice: "Welcome home", "Start with a piece you love", "Look around first",
  "Have a password? Sign in". No developer speak anywhere on the first screen.
- Every control carries a stable `AXUniqueId`.

## Step 2a — Guest entry: the 3-page onboarding carousel
`auth.welcome.guestButton` ("Look around first") → `OnboardingFlowHost` carousel, NOT a browsable
home. Shots `02-guest-intro.png`, `03-guest-intro-p2.png`, `04-guest-intro-p3.png`.

### A-05 — "Skip" does not skip: it lands in the same 5-question quiz as the CTA
`OnboardingFlowHost.swift:83-85`: `onComplete: { advanceToQuiz() }, onSkip: { advanceToQuiz() }`.
The AX hint is honest ("Skips the introduction and continues to style questions.") but the visible
label is not. A guest who chose "Look around first" and then taps "Skip" expecting the app gets a
quiz. There is no way to reach browsable content without answering questions.
Compounding: the Skip button is hidden on the last page (`OnboardingFlowView.swift:77`
`if currentPage < pages.count - 1`) — confirmed absent from `describe_screen` on page 3 — so the
escape hatch vanishes exactly where a hesitant tester looks for it.

### A-06 — Apostrophes are mixed within one three-page carousel
`OnboardingFlowView.swift`: page 2 uses the typographic apostrophe — `"…records the room’s shape…"`
(line 37) — while page 1 (`"Let's discover yours."`, line 31), page 3 (`"then we'll show you"`,
line 57) and the CTA (`"Let's begin"`, line 58) use straight ASCII `'`. Three screens, two
apostrophe glyphs, in a serif-forward brand.

### A-07 — Onboarding hero art is placeholder-grade abstraction
Page 1: two grey rounded rectangles and an empty gold outline on a tan gradient. Page 2: a blank
grey rounded rectangle containing a blank tan rectangle on a sage gradient. Page 3: a flat grey
field with an SF Symbol `square.grid.2x2` in a beige rounded square. For an app selling *rooms*,
the first three images a tester sees contain no room, no furniture and no photograph.
(`PatinaGradients.warm/.sageGradient/.linen` + shape primitives — no image assets.)

### A-08 — CTA label on page 1 of 3 overpromises: "Start Your Journey" merely pages forward
Page 1 CTA `"Start Your Journey"` (Title Case), page 2 `"Continue"`, page 3 `"Let's begin"`.
Three casings and two different promises for the same "next page" action. "Start Your Journey" is
also the only Title-Case button string on any screen walked so far.

### A-09 — Duplicated phrase on page 3
The illustration pill reads "✦ Five quick questions" and the body copy 90 pt below opens
"Five quick questions, then we'll show you pieces that fit." The same four words twice in one view.

### A-10 — The hero illustration carries no accessibility label
`describe_screen` on all three pages returns the hero as an unlabelled `AXGroup {{0,62},{402,778}}`
with no child image element. VoiceOver announces nothing between the Skip button and the heading.

### GOOD
- Page 3's body is unusually honest and privacy-aware: "Your camera comes later — only when you
  choose to scan a room." Page 2 likewise says the scan stays "on this iPhone."
- Page indicator is exposed to VoiceOver as "Page 1 of 3".
- Skip's hit target is a correct 44×44 (`.frame(minWidth: 44, minHeight: 44)`).
- The carousel honours Reduce Motion (`.animation(reduceMotion ? nil : …)`).

## Step 2b / 4 — Style quiz (guest). Shots 05–12
Reached by "Let's begin". `05-quiz-q1.png`, `06-quiz-q1-selected.png` (already Q2 — see A-14),
`07-quiz-q2.png`, `08-quiz-q2-selected.png`.

### A-11 — Full-colour system emoji are the production iconography of the quiz
`describe_screen` AXLabels on Q2, verbatim:
`"🍷, Love having people over, Entertaining & gathering"` · `"🧘, My quiet sanctuary…"` ·
`"💻, Work from this room…"` · `"👨‍👩‍👧, Family central…"` · `"📚, Personal retreat…"`.
Five multicolour Apple emoji (the family glyph renders as a blue-square badge) inside a cream /
ink / tan brand. Same disease as A-03's `✉` on the auth screen. VoiceOver additionally speaks the
emoji name before every option ("wine glass, Love having people over").

### A-12 — Selecting an option shrinks the row and breaks the stack alignment
Selected: AXFrame `{{29.31, 211.005}, {343.38, 64.99}}`. Unselected siblings: `{{24, 287}, {354, 67}}`.
The chosen row is **10.6 pt narrower and inset 5.3 pt** from every other row — a press/scale effect
that is left applied to the selected state. `08-quiz-q2-selected.png` shows the dark selected row
visibly indented from the four light rows below it.

### A-13 — Two competing "next" affordances stacked 26 pt apart, and the upper one is dead
After selecting, the footer card renders `"Next question →"` as a **StaticText** at
`{{44, 722}, {102.33, 16}}` — no `AXButton` role, no action — immediately above the real
`companion.quiz.continue` button labelled `"Continue"` at `{{44, 748}, {314, 44}}`.
Same meaning, same arrow, one of them does nothing when tapped.

### A-14 — Q1 auto-advances on tap; Q2 requires an explicit Continue
A screenshot taken 0.35 s after tapping "Warm Minimal" already shows Q2 (`06-quiz-q1-selected.png`
is identical to `07-quiz-q2.png`). The user never sees their Q1 choice confirmed. Q2 then holds
until Continue is pressed. Two interaction models inside one five-step flow.

### A-15 — No Back anywhere in the quiz, and no exit
`describe_screen` on Q1 and Q2 returns no back, close, or skip control. A guest who mis-taps Q1
(which auto-advances) cannot correct it, and cannot leave the quiz except by killing the app.

### A-16 — The progress footer states the same fact four ways
One card carries: italic-serif section name ("Your visual style" / "How you live"), sans
"Question 2 of 5", monospaced letterspaced "STEP 2 OF 5", numeric "40%", and a progress bar.
The VoiceOver value is `"40 percent, Step 2 of 5, Question 2 of 5"` — the redundancy is audible too.
Three type families (italic serif, sans, mono) in a 100 pt-tall card.

### A-17 — Selection is invisible to VoiceOver
The selected option button carries no `.isSelected` trait and no "Selected" in its AXLabel/AXValue
(compare the selected `🍷` entry with its unselected siblings in the same tree — identical shape).

### A-18 — Q1's four "palettes" are single two-stop gradients, two of them nearly identical
"Warm Minimal" and "Eclectic Curated" are both tan gradients; "Cool Modern" and "Classic Comfort"
are both grey. The question that seeds every recommendation offers two visually distinguishable
answers dressed as four (`05-quiz-q1.png`). Nothing in a swatch shows a *palette* — no second
colour, no material, no room.

### A-19 — ~350 pt of dead vertical space on Q1
Options end at y≈514 (last row bottom, logical pt: 358+156), the progress card starts at y≈695
on Q1 with nothing between. `05-quiz-q1.png` shows the void.

### A-20 — Q4 mixes colour emoji and flat black geometric glyphs in ONE four-item list
`10-quiz-q4.png` ("Let's talk about investment"): 🌱 (colour emoji) · ✦ (flat black glyph) ·
◆ (flat black glyph) · 💬 (colour emoji). The two black glyphs are also near-indistinguishable from
each other at 24 pt, so the two middle price tiers carry effectively the same icon.

### A-21 — Progress reads 100 % while the last question is still unanswered
`11-quiz-q5.png`: the footer shows "STEP 5 OF 5 · 100%" with a full gold bar, while Q5 has no
selection and Continue is disabled. The bar counts the *current* question as done throughout
(Q1 unanswered already showed 20 %).

### A-22 — Q5 is four colour emoji: 🏡 ✨ 🔄 💎
`11-quiz-q5.png`. The 🔄 renders as a blue rounded square and 💎 as a blue gem — two saturated
blues in an app whose entire palette is cream, ink and tan.

### A-23 — Q3 asks about *material* and shows no material
`09-quiz-q3.png` "Which material draws you in?": Weathered Oak, Soft Linen, Aged Leather, Brushed
Metal, Woven Rattan — each a flat two-stop gradient square. Oak, Leather and Rattan are three tan
squares. No grain, no weave, no photograph. The question that seeds material recommendations is
unanswerable on sight.

### A-24 — Q3 has no Continue button at all; Q2 has a disabled one; Q1 auto-advances
Three consecutive questions, three different footer treatments (`05`, `07`, `09`).

## Step 4 — The reveal (`13-quiz-result-t1.png`, identical at t6 — rendered instantly)

### A-25 — The result name is not one of the answers, and collides with two of them
Q1 offered "Warm Minimal", "Cool Modern", "Classic Comfort", "Eclectic Curated". I chose
**Warm Minimal**. The portrait returned is **"Warm Modern"** — a name assembled from two different
Q1 option labels. A tester reads this as the app having misrecorded their answer.

### A-26 — An unlabelled meter sits under the reasoning bullets, ~55 % filled, and is invisible to VoiceOver
`13-quiz-result-t1.png` shows a gold/grey bar between the third bullet and
"A STARTING POINT — REFINE IT ANY TIME." `describe_screen` returns **no element** for it. There is
no legend, no percentage, no caption — nothing says what is 55 % of what.

### A-27 — "Tune this" button's accessible name is "Tune your taste portrait", and its role is a pop-up button
`StyleResultView.TuneButton`: `role AXPopUpButton`, `AXLabel "Tune your taste portrait"`, visible
title **"Tune this"**. Voice Control users who say the words they can see ("Tap Tune this") will
not hit it. The pop-up role also promises a menu where the visuals show a pill button.

### A-28 — A decorative ✦ is exposed to VoiceOver as content
`{{191,133},{20,30}}` `AXStaticText "✦"`. VoiceOver announces "black four-pointed star" as the
first element of the reveal.

### A-29 — Machine-flavoured copy in the reasoning bullets
Verbatim: `"Your gathering answers favor pieces that make everyday connection easier."` and
`"Your answers lean warm, so the edit will favor softened neutrals and warmer finishes."`
"Your gathering answers" is not English a homeowner writes; "the edit" is trade jargon.

### A-30 — All-caps letterspaced MONOSPACE is used for chrome throughout the first run
"YOUR TASTE PORTRAIT", "WHY PATINA SEES THIS", "A STARTING POINT — REFINE IT ANY TIME.",
"STEP 1 OF 5". A terminal/console idiom inside a serif luxury-interiors brand. (One systemic item,
seen on 6 screens so far.)

### A-31 — Button casing is inconsistent across the first run
Title Case: "Start Your Journey", "View Recommendations". Sentence case: "Continue", "Let's begin",
"Look around first", "Tune this". Same flow, same session.

### GOOD (reveal)
- "Your portrait stays on this device and can be reset in Settings." — honest, specific, and it
  names where to undo it.
- The reveal is instant: no fake "analysing…" delay.
- "WHY PATINA SEES THIS" explains the result in the user's own answers — genuinely good product
  thinking, and rare in a style quiz.

## Step 2c / 7 — "Browse pieces" (the guest's first content screen)
`14-home-t1.png`, `15-browse-scroll1.png`, `16-browse-scroll2.png`. "View Recommendations" pushes
a screen titled **"Browse pieces — 10 pieces chosen for your space"** with a Back chevron. The guest
never reaches a home; this pushed screen IS the guest destination.

### A-32 — The floating Companion orb + "NEXT STEPS" caption sit ON TOP of the product grid
`companion.bubble` AXFrame `{{169, 724}, {64, 64}}`, caption "NEXT STEPS" ~24 pt below it, both
drawn over the scroll view with **no bottom content inset**. In `14-home-t1.png` the black circle
covers the reason line of two cards ("…your Warm Modern por" disappears behind it) and "NEXT STEPS"
is legible *on top of* two product photographs. Reproduced at a second scroll offset
(`15-browse-scroll1.png`, over "a material you chose.").

### A-33 — The Companion orb is an AXGenericElement, not a button
`role AXGenericElement`, `AXLabel "Patina companion"`, `AXValue "Next steps"`, `help "Opens the
Companion."` — no button trait. VoiceOver will not announce it as actionable; Full Keyboard Access
and Switch Control will not focus it as a control.

### A-34 — Every recommendation scores 40–46 % match, after a five-question quiz
Observed badges: 46 %, 46 %, 45 %, 45 %, 45 %, 45 %, 41 %, 40 %, 45 %, 45 %. Ten pieces
"chosen for your space", none of which the app claims to be even half a match. A tester reads the
quiz as having failed.

### A-35 — Product images contradict their titles (BLOCKER-adjacent for a first impression)
`14-home-t1.png`, verbatim pairings:
- "Live-Edge Coffee Table" → photo of an **antique ladder-back chair standing on grass**
- "Terracotta Planter Set" → photo of a **mint-blue plastic pot** with a succulent
- "Brass Arc Floor Lamp" → photo of a **white/grey enamel pendant** on a teal wall
(Other cards are correct: Velvet Club Chair, Meadow Linen Sectional.) Local seed catalogue — lane P
must confirm whether prod carries the same rows, but the mismatch is what a tester sees here.

### A-36 — Two cards render as flat colour blocks with no image and no missing-image state
`15/16-browse-scroll*.png`: "Oak Reading Chair" is a solid tan rectangle, "Wool Kilim Runner" a
solid pale grey rectangle, each still carrying its "45 % match" badge, heart and ⋯ over nothing.
No placeholder glyph, no shimmer, no "image unavailable" — the app presents an empty swatch as if
it were the product.

### A-37 — The "why this piece" line is present on some cards and missing on others
"Velvet Club Chair" ($1,250) and "Wool Kilim Runner" ($680) have no reason line; their siblings do.
The result is a visible void under the price and cards whose content bottoms do not align
(`16-browse-scroll2.png`).

### A-38 — The reason line truncates mid-word
`"Its style tags connect to your Warm Modern por…"` on four separate cards. Two lines allotted, the
sentence needs three. The truncated word is "portrait".

### A-39 — Three of four reason lines are the identical sentence
`"Its style tags connect to your Warm Modern portrait."` repeated verbatim across cards. The one
specific reason ("Weathered Oak matches a material you chose.") shows what the others should be.

### A-40 — Scrolling content is hard-clipped under the pinned filter bar
`16-browse-scroll2.png`: card photographs are cut by a straight edge immediately under the
All/Seating/Tables chips — no scroll-edge blur or fade, so images visibly slice.

### GOOD
- The filter chips (All / Seating / Tables / Lighting / Storage) are correctly sized (26.7 pt tall
  but with generous horizontal padding) and the selected chip is unmistakable.
- Prices are set in the serif face with proper thousands separators.
- Vendor names are present on every card.

### A-41 — Guest "Save" succeeds silently with no confirmation and no reachable Saved list
Tapping the heart on "Oak Reading Chair" as a guest fills the heart (`17-guest-save.png`) — no toast,
no haptic-substitute visual, no sign-in prompt, and no tab bar or link anywhere on this screen that
leads to a saved list. A guest can save pieces into a place they cannot open.

## Step 7 — Product detail (`18-product-detail.png`, `19-product-detail-scrolled.png`)

### A-42 — The same piece shows two different match scores in one session
Browse card: **"41% match"** (`15-browse-scroll1.png`). Detail for the identical
"Velvet Club Chair": **"50% match"** (`18-product-detail.png`, AXLabel `"50% match"`).

### A-43 — "Designers Pick" is missing its apostrophe
`describe_screen` AXLabel, verbatim: `"Designers Pick"`. Visible on screen the same way
(`19-product-detail-scrolled.png`).

### A-44 — A raw category slug is rendered as a user-facing tag: "Accent-Chair"
AXLabel `"Accent-Chair"` — a title-cased `accent-chair` key with the hyphen left in, sitting beside
"Designers Pick" as if both were editorial labels.

### A-45 — Back, Share and Save scroll off the top of the product detail
`chevron.left` AXFrame after one swipe: `{{16, -43.33}, {36, 36}}` — off-screen, together with
`ProductDetailView.ShareButton` and `heart`. The detail has no navigation bar, so after reading the
description there is no visible way back, no way to share, and no way to save without scrolling up.
Switch Control / Full Keyboard Access users have no gesture fallback.

### A-46 — The hero photograph scrolls under the status bar with no scrim; the clock becomes unreadable
`19-product-detail-scrolled.png`: "9:41" and the signal glyphs render in dark ink directly over the
near-black wardrobe in the photograph. The status bar style is fixed, the image is not dimmed, and
there is no material behind it.

### A-47 — The Companion orb changes identity between screens while looking identical
Browse: `AXLabel "Patina companion"`, help "Opens the Companion.", 64×64 at bottom-centre with a
"NEXT STEPS" caption. Product detail: `AXLabel "Patina companion — menu"`, help "Opens quick actions
for this screen.", 44×44, grey, jammed against the right edge of the action bar (`{{338,768},{44,44}}`,
20 pt from "Add to room" at `{{205.67,752},{124.33,52}}`). Same glyph, two behaviours, two sizes,
two colours, and in neither case an `AXButton`.

### A-48 — A grey band sits under the action bar in the home-indicator safe area
`18/19-product-detail*.png`: the action bar's cream background stops ~25 pt above the bottom edge
and a darker grey strip fills the remainder. The bar does not extend into the safe area.

### A-49 — "MAKER · Article" duplicates the "ARTICLE" eyebrow 6 lines above it
`ARTICLE` (eyebrow, y=426) and `Maker: Article` (spec row, y=616.7) on the same screen.

### GOOD (product detail)
- The spec block (SIZE / LEAD TIME / MAKER / FINISH) is genuinely useful and well aligned, and the
  VoiceOver labels are properly expanded ("Size: 31″ W × 34″ D × 28″ H" with real prime marks).
- "Ships in 9 weeks" is honest about lead time rather than hiding it.
- "Sold and shipped by Patina." answers the question a first-time buyer actually has.

## Step 2d — The Companion (`20-companion-menu.png`, `21-companion-menu-open.png`)

### A-50 — The Companion's first-run coach mark covers the menu it is explaining
`20-companion-menu.png`: a white card reading *"These are your next steps. They change with every
room you're in — tap one and I'll take you there."* is drawn **on top of** the just-opened menu,
hiding the panel title, the first action row and part of the close button. There is no pointer or
arrow tying it to anything. The user is told to "tap one" while the ones are covered.

### A-51 — "Got it" is white text on a tan pill (~2.4:1)
`20-companion-menu.png`. The only control on the coach mark, and the lowest-contrast text on the
screen.

### A-52 — The Companion menu promises a designer to an anonymous guest
Row: **"Ask about this piece — A DESIGNER WILL COME BACK TO YOU"** in a session with no account, no
email and no designer relationship. Row: **"Home — BACK TO YOUR SPACE"** offered to a guest who has
never seen a home screen and has no space.

### A-53 — Panel header layout is ragged
`21-companion-menu-open.png`: the title "Save this one?" runs to x≈480 px while its subtitle
"A considered next move, based on where you are." is forced into a ~260 px column and wraps to
three lines, leaving a large void to its right beneath the title. A decorative strata mark, a "?"
button and an "×" button all crowd the same header.

### A-54 — ALL-CAPS letterspaced monospace subtitles on every menu row
Verbatim: "ADD TO A COLLECTION", "A DESIGNER WILL COME BACK TO YOU", "BACK TO YOUR SPACE",
"SAVE ROOMS · SYNC ACROSS DEVICES". (Systemic — see A-30.)

### A-55 — The Companion panel floats short of the screen bottom over a grey band
The dark card ends ~30 pt above the bottom edge; below it the dimmed product screen and the same
grey safe-area strip from A-48 are visible. It reads as neither a sheet nor a popover.

### GOOD (Companion)
- The menu's own icons are consistent SF Symbols in rounded-square tiles — the one place in the app
  where iconography is coherent, which makes the emoji elsewhere look worse by comparison.
- "Sign in — SAVE ROOMS · SYNC ACROSS DEVICES" is an honest, benefit-led reason to create an account.
- The highlighted (tan) row correctly signals the recommended next action.

### A-56 — "Ask about this piece" opens a modal whose title and headline disagree
`22-guest-ask.png`: navigation title **"Sign in to ask"**, body headline **"Welcome home / Start with
a piece you love"** — the generic marketing headline from the cold-launch screen, reused unchanged
inside a task-specific modal. The user asked a question about a chair and is greeted with "Welcome
home".
Also: "Cancel" is a floating white pill at `~(58,100)` rather than a nav-bar item, and there is a
~190 pt void between "Have a password? Sign in" and the terms footer.

### A-57 — The system share sheet's link preview reads "Piece not found"
`24-share-sheet.png`, verbatim: title **"Piece not found"**, subtitle **"client.patina.cloud"**,
generic Safari compass icon. Two problems, one of them prod-relevant:
1. The app supplies only a URL to `UIActivityViewController` — no `LPLinkMetadata`, no title, no
   image, no price. Even with a valid link the preview will never show the piece.
2. The title shown is the destination page's own 404 title. **Caveat: this is a local-seed product
   id that does not exist on client.patina.cloud, so the 404 itself is an environment artefact —
   lane P must confirm on prod.** Point 1 is unconditional.

### A-58 — A guest has no settings, no help centre, no notifications and no home
Walked exhaustively: the guest's entire reachable surface is the onboarding carousel → style quiz →
style reveal → "Browse pieces" (a pushed screen with a Back chevron) → product detail → Companion
menu. `describe_screen` on every one of those returns no tab bar, no profile, no settings entry, no
bell, no help. The Companion's "Home — BACK TO YOUR SPACE" row is the only thing that names a home,
and there is none. Script steps 2 (notifications bell, settings/profile as guest, help centre as
guest) could not be executed because the surfaces do not exist for a guest.

## Steps 5 + 9 (guest variant) — Home ("Daily Room") appears only on the SECOND launch
Relaunch (`terminate` + same args): first interactive frame ≈ 3.0 s, and the app lands on a home the
guest has never seen, running a 2-step coach tour. Shots `25-relaunch-guest-t1..t6.png`,
`26-tour-step2.png`, `27-guest-home.png`, `28-guest-home-scroll.png`, `29-guest-bell.png`.

### A-59 — BLOCKER-grade craft: the coach tour uses stock iOS system-blue buttons
`25-relaunch-guest-t6.png` / `26-tour-step2.png`: "Skip" in `#007AFF` link blue and "Next"/"Done" as
a filled `#007AFF` capsule, inside an app whose entire palette is cream / ink / tan / gold. The
default `accentColor` was never overridden for this component. It is the first thing a tester sees
on their second launch and it reads as an unstyled system alert.

### A-60 — The tour calls the destination "Your profile"; the button says "Studio"
Step 2 of 2 points at a pill labelled **"Studio"** and reads **"Your profile — Rooms, saved pieces,
and settings live here."** Two different names for the same place, 40 pt apart. ("Studio" is also
Patina's word for the *designer's* workspace elsewhere in the product.)

### A-61 — Both tour steps cover the element they describe
Step 1's bubble points at "Good afternoon." and covers the entire NEXT MOVE card beneath it;
step 2's bubble points at "Studio" and covers the same card. In both shots the described content is
blurred out behind the tooltip.

### A-62 — "Skip" is still offered on the final step ("Step 2 of 2", beside "Done")

### A-63 — The empty-state "Sign in" button is a circle narrower than its own label
`29-guest-bell.png`. `NotificationFeedView.GuestInvite` AXFrame `{{175.92, 551.25}, {50.17, 53.5}}` —
the text "Sign in" visibly spills past the circular stroke on both sides. The primary CTA of the
notifications empty state is visually broken.

### A-64 — The home's only conversion CTA is truncated by the Companion orb at rest
`27-guest-home.png` (default scroll position): **"Sign in to keep this on ever"** — the sentence is
cut where the black orb begins. Scrolling 65 pt reveals the full "Sign in to keep this on every
device." (`28-guest-home-scroll.png`). The orb has no content inset here either (A-32).

### A-65 — Nothing the guest just did appears on the home
The style portrait ("Warm Modern"), the 10 recommendations and the piece they hearted are absent.
The home says "Bring your first room into Patina" / "Start with a room" as though the session had
not happened. The five questions are never referenced again.

### A-66 — Four names for one place on one screen
"Daily Room" (tour step 1) · "YOUR HOUSE" (section eyebrow) · "your space" (Companion row) ·
"Studio" (the profile pill). Plus "Start with a room" as the section title.

### A-67 — Two "?" help buttons on the home, different sizes, 100 pt apart
One beside the greeting at ~(345, 355) px, one in the top bar at ~(667, 311) px
(`27-guest-home.png`).

### A-68 — The "MAKER SPOTLIGHT" hero has no photograph
A flat brown gradient carrying "AUG 31 · 4 MIN READ", "The Grain Whisperer of Maine",
"Jonathan Chilton on 40 years of listening to wood". An editorial card about craftsmanship with no
image of the craft.

### A-69 — The NEXT MOVE card uses ↗ (open-externally) as its navigation chevron

### GOOD (guest home)
- "Nothing yet — Updates from your designer will land here. Sign in to stay in the loop." is a
  properly designed empty state with an icon, a headline, a reason and an action.
- "Start with a room" offers both "Type the dimensions" and "Scan it" — the non-camera path is
  given equal weight, which is unusually respectful.
- "A minute, and the room is in Patina." is excellent, specific copy.

## Step 3 — Sign-in surfaces (`30`–`38`)

### A-70 — The auth error is red system text inserted into the layout; it shifts every button 50 pt down
`32-google-signin.png`, verbatim: **"Apple Sign In couldn't be completed. Please try again."** in
system red, centred, above the button stack. `scan_ui` before the error:
`auth.welcome.googleButton` at `{{27.25, 385.58}, {347.5, 51.5}}`. After the error:
`{{27.25, 435.58}, {347.5, 51.5}}` — a **50 pt jump**.
I reproduced the consequence live: my tap aimed at "Continue with Google" landed on
"Sign in with Apple" and re-ran the Apple flow, because the banner appeared between the scan and the
tap. A tester who taps a moment after the error hits the wrong provider.
Copy also: "Apple Sign In" is not Apple's term ("Sign in with Apple"), and "Please try again" is the
one instruction guaranteed to fail again in the same state.

### A-71 — Google sign-in asks the user to trust a raw backend hostname
`33-google-real.png`, system consent dialog, verbatim:
**«"Patina" Wants to Use "127.0.0.1" to Sign In — This allows the app and website to share
information about you.»**
Locally that host is the Supabase CLI. **On production the same dialog will name
`bkvcixdmuyejfzcijpdg.supabase.co`**, a random-looking project ref, not `patina.cloud`. To a
homeowner that reads as a phishing prompt. Fix = a Supabase custom auth domain (e.g.
`auth.patina.cloud`) so the consent dialog names the brand. Lane P should capture the exact prod
string.

### Environment note (NOT a finding)
"Sign in with Apple" raises the system sheet *"Sign in to your Apple Account — You need to sign in
to your Apple Account in Settings."* (`31-apple-signin.png`) because the clone has no iCloud
account. That is the simulator, not the app.

### A-72 — The disabled primary button is the brand's *accent tan*; the enabled one is black
`34/35-email-form/malformed.png` (disabled) vs `37-email-valid.png` (enabled). The disabled
"Email me a code" is a solid tan pill with white text — visually identical to real buttons elsewhere
in the app ("Got it", "Tune this", "Verify"). The enabled state is near-black. So the *inert* state
is the more inviting one, and a tester taps it and gets nothing. There is also no inline validation
message for the malformed address `not-an-email` — the button just silently does not respond
(`enabled: false` in `scan_ui`).

### A-73 — White-on-tan primary buttons fail contrast (~2.2:1)
"Email me a code" (disabled), "Verify" (disabled), "Got it" (A-51). AA for body text is 4.5:1.

### A-74 — A third and fourth uncustomised system colour appear in auth
`38-code-requested-t1.png`: a **system-green** success chip with **📧 colour emoji** reading
"We emailed you a 6-digit code"; `32-google-signin.png`: **system red** error text; the coach tour
(A-59): **system blue**. Red, green and blue system semantics in a cream/ink/tan brand, none of them
restyled.

### A-75 — The code step keeps the previous step's headline and instructions
`38-code-requested-t1.png` shows, top to bottom: "Continue with email" / "We'll email you a sign-in
code — no password needed" / green "We emailed you a 6-digit code" / a giant **#** glyph /
"Enter your sign-in code" / "Enter the 6-digit code from your email" / the address / the field.
Two headlines and three restatements of the same instruction before the input.

### A-76 — A bare "#" character is used as the step icon
~48 pt hash glyph above "Enter your sign-in code". Reads as a placeholder, not an icon.

### A-77 — The OTP field has no accessibility label
`auth.otp.tokenField`: `AXLabel: null`, `AXValue: "705902"`. VoiceOver announces the digits with no
statement of what the field is.

## Step 9 — Notification permission (`40-verify-t2.png`, `41-push-prompt.png`)
The system prompt appears **only after** an in-app primer, and only after a successful sign-in —
correct sequencing. Primer verbatim: *"Before we interrupt you — We'll tell you when your designer
sends something that needs you — a decision, a proposal, or an invoice. Nothing else."*
System prompt: *«"Patina" Would Like to Send You Notifications — Notifications may include alerts,
sounds, and icon badges. These can be configured in Settings.»*

### A-78 — The primer's layout is left-aligned content marooned in a 500 pt void
Bell + headline + body occupy y≈230–365 pt, the buttons y≈525–590 pt, with nothing between and
~230 pt of empty space above the bell (`40-verify-t2.png`).

### GOOD (auth)
- **The push primer is the best-written screen in the app.** "Before we interrupt you… Nothing
  else." is honest, specific, and earns the permission. Correct primer-then-prompt sequencing.
- Email → code → verify worked first time and was fast (sign-in to primer < 1.6 s).
- The malformed address is correctly rejected client-side (button disabled) rather than round-tripped.
- "We'll email you a sign-in code — no password needed" sets the right expectation up front.
- "Resend code in 47s" tells the user exactly how long they must wait.

### Environment note (NOT a finding)
The local OTP mail is `From: Admin <admin@email.com>`, subject "Sign in to Patina" — the GoTrue
default sender on the local stack. Prod uses Resend/`hello@patina.cloud`; lane P confirms.

## Steps 5 + 9 (signed in as client@patina.dev) — `42`–`45`

### A-79 — The guest→account migration sheet names data the user does not have
`42-signed-in-home.png`, verbatim: **"Keep the room and the pieces you saved on this phone? — They
were saved before you signed in. Keep them and they become yours; start fresh and this phone keeps
nothing from before."** I created **no rooms** as a guest (I only hearted one piece). The copy is a
fixed string, not count-aware.

### A-80 — The notifications screen shows its EMPTY state while data is still loading
`43-after-migrate.png`: "Nothing yet — Updates from your designer will land here." with a
"Message your designer" pill, **while the same app's bell badge reads 3** and the Companion caption
reads "5 THINGS NEED YOUR EYE". Re-entering the same screen seconds later
(`45-bell-signedin.png`) shows **5 populated rows**. There is no loading state; the app asserts
"nothing" before it knows.

### A-81 — Four different counts of "what needs you" on one screen
`44-home-signedin.png`: bell badge **3** · Studio badge **5** · Companion caption
**"5 THINGS NEED YOUR EYE"** · the "NEEDS YOU" list showing **3** rows. Nothing on screen explains
which number counts what.

### A-82 — Machine-composed strings use " - " (hyphen) where the rest of the app uses "—"
Same list, adjacent rows (`45-bell-signedin.png`):
`"Design Development sign-off — drawing set B"` and `"Aspen Loft — Living Room Refresh"` (em dash)
vs `"Dining chairs - Shaker Oak vs Windsor Elm"` and `"Rug color - Natural vs Sand"` (spaced hyphen).
Also on the home: `"Leah asked about Dining chairs - Shaker Oak vs Windsor Elm."`

### A-83 — "MOVED" is an opaque section header
`44-home-signedin.png`: the second group under "NEEDS YOU" is headed **"MOVED"**. Nothing on the
screen says what moved or why those five items are grouped that way.

### A-84 — One row in the home feed is greyed with no legend
"A new story from the workshop." renders in muted grey while its five siblings are ink black
(`44-home-signedin.png`). No key, no timestamp difference to explain it.

### A-85 — The Companion orb occludes the designer card and the room rail on the signed-in home
`44-home-signedin.png`: the orb covers the right end of the "Leah Hartwell / Aspen Loft Refresh /
Message" card, and "5 THINGS NEED YOUR EYE" is printed over the "YOUR HOUSE" room row. Fourth
distinct screen with the same occlusion (A-32, A-64, A-47).

### A-86 — Notification rows have inconsistent anatomy
The three "needs you" rows carry "9h ago" + an unread dot; the Invoice and Proposal rows carry
neither. The unread group's tint is full-bleed to the screen edges while its separators are inset
178 px, so the tinted block and the list rules do not share a margin.

### A-87 — Room card clipped mid-word at the screen edge
`44-home-signedin.png`: the second room card reads **"Audit Ro"** — cut by the viewport with no peek
padding. (The room is also *named* "Audit Room", which reads as seed/test data; lane P to confirm
prod.)

### GOOD (signed in)
- The guest→account migration sheet exists at all, and "Keep them and they become yours" is a clear,
  non-technical statement of what happens. Most apps silently discard guest state.
- "NEEDS YOU" is a strong, human section name and the three rows under it are the right three things
  (invoice, proposal, decision) with dates.
- The notification list's `hand.raised` glyph, unread tint and unread dot are consistent and legible.
- "Message your designer" as the empty-state action is the right next step.

## Step 8 — Studio, invoices, payment (`46`–`51`)

### A-88 — The floating Companion orb occludes content on EVERY signed-in screen
Confirmed on six distinct screens: Browse (`14`), guest home (`27`), product detail (`18`),
signed-in home (`44`), Studio (`46`, `47` — it covers "3 project choices are ready" and
"$4,250.00 remaining", and "5 THINGS NEED YOUR EYE" overprints "Due Sep 6" and both room
thumbnails), invoices (`48`), invoice detail (`49`, `50`). No screen adds a bottom content inset for
it. This single defect is the most repeated visual fault in the app.

### A-89 — The circular Back button floats over scrolling content with no bar or material behind it
`47-studio-scroll1.png`: the white circle sits on top of the "Conversation / 1 unread thread" row and
cuts the word "Conversation" in half. `50-invoice-bottom.png`: it cuts through "Due Sep 6".
Every scrolling screen has the same collision.

### A-90 — "Pay $4,250.00" is painted in the app's DISABLED-button tan
`50-invoice-bottom.png`. Identical fill and white label to the disabled "Email me a code" (A-72) and
disabled "Verify". The highest-stakes button in the product wears the inert colour, at ~2.2:1
contrast.

### A-91 — Two "secure" reassurances stacked under the Pay button
"Payment opens securely in Safari." / "Pay securely by card or bank transfer."

### A-92 — "Remind me the day before it's due" has no visible control
`49-invoice-detail.png`: styled as tan body copy with an explanatory paragraph under it, but no
switch, checkbox, chevron or button. It reads as a heading and sounds like an action.

### A-93 — The payment error is inserted into the layout, pushing the Pay button 250 pt down
`51-pay-t1.png`. Same class as A-70. Its two actions ("Let's try that again", "Message your
designer") are bare tan text set side by side with no chrome or separator and read as one line.

### A-94 — "AWAITING PAYMENT" / "PAID" are printed twice per card, and share one colour
`48-invoices.png`: section header "AWAITING PAYMENT (1)" then the card's own eyebrow "AWAITING
PAYMENT"; likewise "PAID (1)" / "PAID". Both status eyebrows are the same tan — an unpaid invoice and
a paid one are colour-identical. The cards also carry no disclosure indicator.

### A-95 — Three phrasings of one concept across three screens
Home: "NEEDS YOU" · Studio: "Awaiting you" and "5 things need your eye" (twice on the same screen,
plus a "5" badge) · Companion: "5 THINGS NEED YOUR EYE".

### A-96 — Room and editorial imagery is absent app-wide
`47-studio-scroll1.png`: "Guest Bedroom" and "Audit Room B" are flat gradient blocks. Combined with
A-36 (two product cards) and A-68 (the Maker Spotlight), the app shows a coloured rectangle wherever
a photograph belongs, with no placeholder treatment that admits it.

### GOOD (money) — the strongest screen in the app
- Payment failure copy, verbatim: **"We couldn't start this payment. Nothing has been charged."**
  with **"Let's try that again"** and **"Message your designer"**. No error code, no raw string,
  explicit reassurance about money, and a route to a human. This is the standard the rest of the app
  should be held to.
- The failure card is blush, not system red — the one error state that is on-brand.
- The invoice detail itself is excellent: TOTAL / PAID / BALANCE triad, line items with real
  descriptions, "A NOTE FROM YOUR DESIGNER", "No payments recorded yet."
- The reminder promise is exact: *"We'll send one notification: 'Your invoice is due tomorrow —
  $4,250.00. Nothing else.'"*
- Studio IA (Awaiting you / Money & documents / Archive / Your rooms) is clear and well grouped.

## Step 10 — Settings / Account (`54`–`60`)

### A-97 — Settings row-icon tiles use five unrelated colours, and RED marks a harmless toggle
`54-settings.png`, light mode: Account tan · **Sign in on the web BLUE** · Sign Out tan ·
**Delete account PINK/RED** · **Notifications PINK/RED** · Haptic Feedback tan ·
**Upload scans on cellular BLUE** · Appearance grey · **Use activity for context GREEN** ·
Forget recent context tan · **Help Center GREEN** · Contact Us tan · Terms & Privacy tan.
"Notifications" therefore wears the same destructive red as "Delete account".
In dark mode (`57`) most of those colours collapse to one brown tile, so the system is not even
consistent between appearances.

### A-98 — Casing is inconsistent inside a single settings list
Sentence case: "Sign in on the web", "Delete account", "Upload scans on cellular", "Use activity for
context", "Forget recent context", "Reset taste portrait".
Title Case: **"Sign Out"**, **"Haptic Feedback"**, **"Help Center"**, **"Contact Us"**,
**"Terms & Privacy"**. Same screen, adjacent rows.

### A-99 — BLOCKER-grade: switching Appearance back to Light leaves the Settings sheet dark
Reproduced deterministically. `57-dark-settings.png`: choose Dark → the whole app darkens correctly.
Then choose Light: `60-back-to-light.png` / `63` / `64` show `Appearance  Light` selected while the
entire Settings sheet is still black. Dismissing the sheet (`65-settings-dismissed.png`) reveals the
app behind it *is* light. Every user who tries dark mode and changes their mind sees this, because
the switch lives inside the sheet that fails to repaint.

### A-100 — The Settings sheet has no dismiss control
`scan_ui {region:"full"}` on Settings returns only content rows — no Done, Close, Cancel or ×, and no
visible grabber. The only exit is an undiscoverable drag from the sheet's top edge (a downward swipe
started 48 pt lower just scrolls the list — I hit that twice).

### A-101 — Delete-account naming is three-way, and the copy scopes deletion to the device
Row: **"Delete account"** → dialog title: **"Close your account?"** → destructive button:
**"Delete account"**. Body verbatim: *"This removes your account and everything Patina keeps on this
device. It can't be undone."* — it names only device-local data. Server-side invoices, proposals and
projects are not mentioned. App Review guideline 5.1.1(v) expects account deletion to delete the
account; a reviewer reading this copy may reject it. (`59-delete-account.png`)

### A-102 — Settings shows no app version or build number
The list ends at "Terms & Privacy" (`55-settings-scroll.png`). A TestFlight tester filing a report
has no build string to quote, and Kody cannot tell which build a report came from. There is also no
"Send feedback" entry.

### A-103 — "Sign Out" and "Delete account" are drawn as navigation rows with disclosure chevrons

### A-104 — "PRIVACY & MEMORY" uses an internal term for a homeowner-facing section

## Step 12 — Deep links (`61`–`68`)

### A-105 — `patina://record/<id>` does nothing, with a valid id, from the home, with no sheet in the way
`xcrun simctl openurl … "patina://record/c0000000-0000-4000-8000-000000000001"` (a real seeded room,
"Guest Bedroom") → `67-deeplink-record2.png` is the unchanged home. No navigation, no error, no
toast. `patina://today` is likewise indistinguishable from a no-op (`66`). The `patina` scheme is
declared in `Patina/Info.plist` (`CFBundleURLSchemes`), so the OS routes it; the app swallows it.
Earlier, with the Settings sheet presented, two `patina://` opens also did nothing (`61`–`64`).

### A-106 — The universal link opens the app but arrives with no memory of the link
`xcrun simctl openurl … "https://client.patina.cloud/piece/<id>"` launched Patina rather than Safari
— **AASA is working**. But the app came up on the generic "Welcome home" auth screen
(`68-universal-piece.png`) with no indication that a piece link is pending: no "Sign in to see this
piece", no headline naming the shared item, and after signing in there is nothing to say the link was
kept. A tester who taps a friend's shared piece link and is not signed in loses the piece.
**Caveat: `simctl openurl` cannot carry `-DeploymentTarget local`, so that launch hit Strata
production, where this local id and session do not exist. The *no-context landing* is the finding;
lane P must confirm the signed-in behaviour on prod.**

## Step 11 — Relaunch (`69-relaunch-signedin-t1..t8.png`)
`terminate` + `launch … -DeploymentTarget local` → **the session persists**; the signed-in Daily Room
home returns with the same badges (bell 3, Studio 5). Time to content comparable to the cold launch
(~3 s). No finding. (The signed-out screen in `68` was the missing backend argument, not the app.)

### GOOD (settings)
- Dark mode itself is well made: a warm brown-black, tan accents, legible body copy, no pure #000.
- "Use activity for context — Off until you choose it. When on, Patina remembers only activity type,
  an identifier, and time for up to 90 days." Default-off, specific, time-bounded. Excellent.
- "Reset taste portrait" and "Forget recent context" give the user real control over their data.
- The destructive confirmation correctly uses red and a Cancel default.

## Step 6 — Rooms (`70`–`72`)

### A-107 — BLOCKER-grade: every "Room Type" chip breaks its label mid-word
`72-room-settings.png`, all six chips at once:
**"Livin / g"**, **"Bedro / om"**, **"Offic / e"**, **"Dinin / g"**, **"Kitc / hen"**, **"Oth / er"**.
The chip row is laid out to fit six fixed-width pills across 402 pt and every label wraps.
This is the single most obviously unfinished screen in the app.

### A-108 — The Companion orb covers the primary AND the destructive action on Room Settings
`72-room-settings.png`: the black orb sits on the word "help" in **"Get design h⬤p with this room"**,
and "5 THINGS NEED YOUR EYE" is printed across **"Delete This Room"**. Eighth screen with this
defect, and the only one where it obscures a destructive control.

### A-109 — A room labelled "TYPED, NOT SCANNED" has a "Scan Data" panel and a "Re-Scan This Room" button
Room detail (`71`): `12 × 15 FT · 180 SQ FT · TYPED, NOT SCANNED`.
Room settings (`72`): a **"Scan Data"** card reading `SEP 1, 2026` / `180 sq ft`, with
**"Re-Scan This Room"** — "re-scan" a room that was never scanned. Two screens, one room,
contradictory claims.

### A-110 — The room's settings button is a colour emoji, and the emoji is its accessible name
`scan_ui`: `{{347.75, 55.75}, {36.5, 36.5}}` `AXLabel "⚙"`. It renders as the multicolour Apple gear
over the room hero (`71-room-detail.png`), and VoiceOver has nothing to announce but the glyph — no
"Room settings".

### A-111 — An accessibility hint is stored in ALL CAPS
`companion.hint`: `AXLabel "SEE RECOMMENDATIONS →"`, `help "ACTIVATES THIS SUGGESTED NEXT STEP."`
The display styling (uppercase + a literal → arrow) has leaked into the strings VoiceOver speaks.

### A-112 — Content scrolls under the status bar with no material; the clock becomes unreadable
`70-home-rooms.png`: "Leah Hartwell sent you a message." runs straight through **9:41** and the
signal/wifi/battery glyphs — black text over black text. Same class as A-46 (product hero).
No blur, no scrim, no scroll-edge effect anywhere in the app.

### A-113 — "TYPED, NOT SCANNED" and "budget $9,000" read as raw template strings
`71-room-detail.png`: an all-caps mono badge stating what the room is *not*, and a lower-case
"budget $9,000" beside Title-Case and sentence-case text everywhere else.

### A-114 — Three stacked empty states in one room
`71-room-detail.png`: a "0 / SAVED PIECES" card, then ~180 pt of void, then a ✦ glyph with
"A blank canvas", then "Browse pieces for the Guest Bedroom".

### A-115 — Title Case vs sentence case inside Room Settings
"Room Settings", "Room Name", "Room Type", "Scan Data", "Re-Scan This Room", "Delete This Room"
against "Save dimensions" and "Get design help with this room".

### A-116 — Room imagery differs between screens for the same room
Studio (`53`) renders "Guest Bedroom" with a blue-grey gradient thumbnail; the home rail (`70`)
renders the same room as a plain cream card with no image area at all.

### GOOD (rooms)
- The ft/m segmented control on Dimensions is a real, well-placed courtesy.
- "A blank canvas" is charming, and "Browse pieces for the Guest Bedroom" names the room in the CTA.
- The room detail states dimensions, area and budget together, in one honest line.

## Coverage gaps (lane A)
- **Step 2**: notifications bell / settings / help centre *as a guest* — these surfaces do not exist
  for a guest before the second launch (A-58); walked exhaustively, recorded as a finding.
- **Step 6**: "add a room by typing", "Start a scan" on this non-LiDAR simulator, and deleting a
  room I created — NOT executed. No add-room affordance was reachable from the signed-in home or
  Studio within budget, and I did not delete a seeded room (the only rooms present) because the
  audit is read-only with respect to data I did not create.
- **Step 8**: proposal signing, deciding a decision, documents, sending a message, design requests,
  orders — NOT executed (time). Invoices + payment failure were covered in full.
- **Step 7**: Saved list, filters and unsave — only the save action and the share sheet were covered.
- **Step 12**: `https://client.patina.cloud/invoices/<id>` — NOT executed. `simctl openurl` cannot
  carry `-DeploymentTarget local`, so any universal-link launch hits production and cannot be
  interpreted against local seed data (see A-106). Lane P owns this.
- Dynamic Type, VoiceOver rotor navigation and Reduce Motion were not swept (time); the
  accessibility findings above come from AX-tree evidence, not from a screen-reader pass.
