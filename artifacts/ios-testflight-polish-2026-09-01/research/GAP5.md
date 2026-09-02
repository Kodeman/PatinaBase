# GAP5 — iPad idiom probe (gap-fill finder)

Lane **GAP5**. Run 2026-09-01 from `/Users/kody/Code/patina-merged`. READ-ONLY: no code edits, no
git writes, no production contact (local backend only).

## Device — DEVIATION FROM THE BOILERPLATE, DELIBERATE

The task boilerplate named clone `670DE752-BA1B-40C1-899E-57B50D5743B5` as "the clone GAP5". That
udid **is lane C (`tfp-C`)**, an iPhone 17 Pro, and the probe body says explicitly *"Do NOT touch
tfp-A/B/C/P or the review sim"*. The probe body also names the device to use. I followed the probe
body:

| | |
|---|---|
| device | **`7C8C092C-7AD4-453C-9CC6-40E0931260AC`** — iPad Pro 11-inch (M5), iOS 26.5 |
| state at start | Shutdown, no Patina installed. Booted by me; window opened in Simulator.app (verified `osascript` → `iPad Pro 11-inch (M5) – iOS 26.5` present, so **not headless**) |
| build installed | the steward's signed Debug build, `.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app` — the same binary all four lanes use. **No `CODE_SIGNING_ALLOWED=NO`.** |
| launch args | `xcrun simctl launch 7C8C092C-… cloud.patina.app -DeploymentTarget local` (repeated on every relaunch) |
| device settings | `status_bar override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4`; `ui … appearance light` |
| tfp-A/B/C/P | **never touched** |

## Canvas — the probe's "1024 pt" figure is wrong; the real one is worse in one axis

`xcrun simctl io … enumerate` → display `1668 × 2420 px` @2x = **834 × 1210 pt portrait**
(1210 × 834 pt landscape). Screenshots in `shots/GAP5/` are 1668×2420 px; **logical points =
pixel / 2** (the phone lanes are /3 — do not reuse their conversion).

So the canvas is **2.07× the width** and **1.38× the height** of the 402 × 874 pt phone the whole
app is drawn for. That ratio is the lens for everything below.

## HID preflight — PASS

`describe_screen` and unqueried `scan_ui {region:"full"}` both returned `[]` on the Welcome screen
(the same tooling quirk `00-steward.md` §8.1 records for the phone clones, here affecting
`describe_screen` too). A **queried** `scan_ui` worked and returned the real frame. Tapped
`auth.welcome.guestButton` at its scanned frame centre (417, 548) → screen changed
Welcome home → "Every room tells a story". Synthetic input lands on this device.

⚠ For later walkers: on this iPad, **only queried `scan_ui` returns anything**. An empty
`describe_screen` here is a tooling artefact, never evidence a control is missing.

---

# FINDINGS

(appended as the walk proceeds)

## GAP5-01 — Rotation is NOT refused: on a landscape iPad the app is pillarboxed in black over half the screen, with the system status bar stranded in the void
area visual-system · **major** · testerVisible **true** · confidence 0.95 · effort S
where iPad Pro 11" landscape · `shots/GAP5/03-rotate-right.png`, `shots/GAP5/04-landscape-settled.png`
evidence Device rotated to landscape (framebuffer `2420×1668`). The app did **not** refuse the
rotation and did **not** stay upright — it followed the device and re-laid-out into a portrait-shaped
column occupying x≈634–1789 px of a 2420 px canvas (**≈577 pt of a 1210 pt-wide screen — 52% of the
display is solid black**). The system status bar ("9:41 AM Tue Sep 1" left, battery/wifi right) is
drawn across the **full 1210 pt width**, so the clock and the battery both float in the black bars
with ~300 pt of nothing between them and the app. `04-landscape-settled.png` was taken 4 s after
`03` and is pixel-identical in layout — this is the **settled** state, not a rotation animation frame.
why it matters An iPad-owning tester will rotate within the first minute; every iPad user does. What
they get is not "the app politely stays portrait" (which is a legitimate, shippable choice) — it is a
letterboxed column with orphaned system chrome. It reads as an app that was never opened on the
device it was installed on. This is A2-03 / C7-11 made visible: the consequence of shipping
`TARGETED_DEVICE_FAMILY = "1,2"` with a portrait-only declaration and no `UIRequiresFullScreen`.
fix `TARGETED_DEVICE_FAMILY = 1` (A2-03's fix) removes this entirely — the app then installs on iPad
only in iPhone-compatibility mode, which Apple letterboxes deliberately and consistently. If iPad
must stay a family, `UIRequiresFullScreen = YES` at minimum, and then an actual iPad layout.

## GAP5-02 — In landscape the next onboarding page bleeds permanently into the right edge of the column
area onboarding · **major** · testerVisible **true** · confidence 0.85 · effort M
where guest onboarding page 1 · `shots/GAP5/04-landscape-settled.png`, right edge of the app column
evidence At the right edge of the pillarboxed column, ~30 pt wide and running the full height, sits a
**pale sage-green vertical strip** (a colour that appears nowhere on page 1) and, level with the CTA
at y≈1220 displayed, the **left cap of a second dark pill**. That is onboarding **page 2** — its
background and its own primary button — showing through. The horizontal paging container kept a page
width narrower than its resized viewport, so the neighbouring page never leaves the screen. Persistent
across `03` and `04` (4 s apart).
why it matters A permanent sliver of the next screen down the edge of the current one is the single
most "unfinished build" artefact in this walk — it looks like a rendering bug, not a design.
fix Whatever fixes the resize story fixes this. If the page width is derived from a captured/hard-coded
value rather than the live container width, derive it from the container.

## GAP5-03 — Every primary control is a 779 pt-wide slab: the phone layout is stretched, not adapted
area visual-system · **major** · testerVisible **true** · confidence 0.95 · effort L
where Welcome home · `shots/GAP5/01-welcome-portrait.png`; guest onboarding · `02-preflight-after.png`
evidence Measured, not eyeballed. `scan_ui` on the iPad returns
`auth.welcome.guestButton` → `AXFrame {{27.25, 522.75}, {779.5, 51.5}}` — **779.5 pt wide**.
`00-steward.md` §8.1 records the same control on the iPhone clones at
`{{27.25, 552.25}, {347.5, 51.5}}` — **347.5 pt**. Same x-inset (27.25), same height (51.5), width
**2.24×**. "Sign in with Apple", "Continue with Google", "Continue with email", "Look around first"
and the onboarding CTA (`Onboarding.PrimaryButton.0`, 778 pt) are all the same edge-to-edge slab.
The `or` divider rule likewise runs the full 779 pt.
why it matters A 779 pt-wide, 51.5 pt-tall button is roughly 15:1 — Apple ships nothing at that ratio.
It is the clearest possible tell that the layout has one hard-coded assumption (fill the width) and no
maximum. C7-11 predicted this from zero `horizontalSizeClass` / `userInterfaceIdiom` hits across 435
Swift files; this is that prediction in pixels.
fix A single `.frame(maxWidth: 420)` on the auth/onboarding button stack would make this defensible on
any width — but the real answer for round one is A2-03: don't ship the iPad family at all.

## GAP5-04 — On the 1210 pt canvas the vertical rhythm collapses into dead space
area visual-system · **major** · testerVisible **true** · confidence 0.9 · effort M
where Welcome home + guest onboarding · `01-welcome-portrait.png`, `02-preflight-after.png`
evidence Welcome home: the wordmark→"Have a password? Sign in" block ends at y≈1000 px (500 pt) and
the legal footer is pinned at y≈2280 px (1140 pt). **≈640 pt — 53% of the screen height — is empty
cream** with nothing in it. Guest onboarding: the hero glyph is a fixed ~195×130 pt mark floating in a
464 pt-tall gradient band (it occupies 8% of the band's area); the page dots sit at y≈1203 displayed
and the CTA at y≈1770, leaving **≈340 pt of empty cream** between them.
why it matters Content anchored top and bottom with a void in the middle is what a phone layout looks
like when it is handed a taller canvas. The composition the designer intended — a balanced column —
is gone.
fix Centre the auth stack vertically and cap the hero band as a proportion of height, or (round one)
A2-03.

## GAP5-05 — RECONCILIATION: `UIStatusBarHidden = true` is not taking effect on EITHER idiom — A2-11's premise is wrong
area visual-system · **minor** · testerVisible false · confidence 0.9 · effort S
where every screen, both idioms · `shots/GAP5/07-ipad-statusbar-crop.png` (iPad),
`shots/GAP5/06-phone-statusbar-crop.png` (top 160 px of the steward's own phone shot
`shots/steward/a-preflight-before.png`, cropped for comparison — the steward's file was not modified)
evidence A2-11 reads the built plist (`UIStatusBarHidden = true`) and concludes "status bar hidden
app-wide". **Pixels say otherwise on both devices.** The iPad Welcome screen shows
"9:41 AM  Tue Sep 1" + signal/wifi/battery; the *iPhone* Welcome screen, from the steward's own
preflight shot, shows "9:41" + signal/wifi/battery in exactly the same place. The status bar is
**visible everywhere**, so the plist key is inert — the usual cause is that
`UIViewControllerBasedStatusBarAppearance` defaults to YES, which makes the legacy app-wide
`UIStatusBarHidden` key non-authoritative, and SwiftUI then honours only per-view
`.statusBarHidden(_:)` (the app has exactly one such call, `DailyStoryDetailView.swift:51`).
why it matters It redirects A2-11. There is nothing to un-hide: the plist setting is dead weight, not
an active app-wide hide. A fix program acting on A2-11 as written would go looking for a hidden status
bar that was never hidden. (The setting should still be removed — it states an intent the app does not
have.)
fix Delete `INFOPLIST_KEY_UIStatusBarHidden` from both targets; keep the one per-view call.
NOTE This is the one finding here that is **not** iPad-specific — it is a correction to another lane,
found because the iPad shot invited the comparison.

## GAP5-06 — `.presentationDetents` do not apply on iPad: sheets become fixed-height form sheets and phone-tuned content is clipped mid-glyph
area auth · **major** · testerVisible **true** · confidence 0.9 · effort M
where Sign In sheet · `shots/GAP5/08-signin-sheet.png` (as presented),
`09-signin-sheet-after-swipe.png` + `09b-sheet-bottom-crop.png` (after a manual scroll)
evidence On iPad the Sign In sheet is presented as a **centred form sheet measuring ≈576 × 660 pt**
(card spans x 128–704 pt, y 275–935 pt of the 834 × 1210 canvas) — iPadOS ignores the phone detent
model in a regular size class and gives the sheet a fixed size. The app's content is taller than that,
so **as presented, the bottom row is sliced horizontally through the middle of the glyphs**: in
`08-signin-sheet.png` "Forgot password?" and "Use magic link" are cut in half by the card's bottom
edge. `scan_ui` confirms it: "Forgot password?" sits at `{{291, 918}, {118.5, 17}}`, i.e. its bottom
(935 pt) is exactly the sheet's bottom edge. There is **no scroll indicator and no visual hint** that
more exists. It *is* scrollable — one swipe reveals "Forgot password? · Use magic link" and
"Don't have an account? Sign Up" intact (`09b`) — but nothing tells the tester that.
why it matters The first screen after "Sign in" shows text sliced in half. And the two affordances it
cuts are exactly the ones a tester needs when their password does not work — password recovery and
magic link. This is the probe's "sheet detents on a wide canvas" question answered: **detents are not
honoured here at all.**
fix Round one: A2-03 (drop family 2). Otherwise give the sheet a `ScrollView` with visible indicators
and enough bottom inset that no row can land on the card edge.

## GAP5-07 — One screen, two width systems: 786 pt option rows above a 340 pt primary button
area onboarding · **major** · testerVisible **true** · confidence 0.95 · effort M
where taste quiz Q2–Q5 · `shots/GAP5/_q3s.png`, `_q4s.png`, `_q6s.png`; measured via `scan_ui`
evidence Same screen, same moment. The option row
"🍷, Love having people over, Entertaining & gathering" → `AXFrame {{24, 148}, {786, 67.5}}` —
**786 pt wide, filling the canvas**. The primary action `companion.quiz.continue` →
`AXFrame {{247, 1093}, {340, 44}}` — **340 pt wide, centred**, i.e. still at its phone width. The
floating progress card around it is likewise pinned near 370 pt. So on one screen some elements were
written to fill the container and others to a fixed phone measure, and the wide canvas splits them
apart.
why it matters This is what makes the app read "stretched" rather than "large": not the absolute
sizes, but the fact that neighbouring elements disagree about how wide the screen is.
fix Any single, deliberate content-width rule (one `maxWidth` on the shared container) resolves both
halves at once — and it also fixes GAP5-03. It is the cheapest global improvement available if iPad
support is ever kept.

## GAP5-08 — The palette swatches lose their meaning at 387 pt: a "palette" becomes a 3:1 letterbox band
area onboarding · **minor** · testerVisible true · confidence 0.85 · effort S
where taste quiz Q1 "Which palette feels like home?" · `shots/GAP5/12-after-skip.png`
evidence The four palette cards are laid out two-up filling the width, so each card is **≈387 pt wide
with a fixed-height swatch of ≈124 pt** — a 3.1:1 band. Underneath them, from y≈400 pt to y≈840 pt,
**≈440 pt of empty cream** before the floating progress card.
why it matters The swatch is the content of this question. Stretched to a thin band it stops reading
as a palette and starts reading as a divider. Combined with the void beneath, the screen looks
half-built.
fix Cap the grid's content width, or make the swatch aspect-ratio-locked rather than
fixed-height-and-fill-width.

## GAP5-09 — A product card shows a flat grey rectangle where the image should be — no placeholder, no spinner, no failure state
area browse-saved · **major** · testerVisible **true** · confidence 0.8 · effort S
where Browse pieces, "Wool Kilim Runner" (STUDIO PIET, $680, 67% match) ·
`shots/GAP5/14-home-today.png`, `15-browse-recheck.png`, crop `15b-runner-card.png`
evidence The card's entire image area is a **flat light-grey rectangle**. Re-shot **14 s** after the
grid appeared and it is unchanged — so it is a settled state, not a load in progress. There is no
progress indicator, no placeholder mark, no "image unavailable" copy; the "67% match" badge and the
heart / overflow controls float on the empty grey as though an image were there. The other five cards
in view loaded real photography.
why it matters A tester reads a blank grey tile as a broken app, not as missing catalogue data. The
seeded row may simply have no image (an environment gap) — but **how the app presents that is the
finding**: it presents it as nothing at all.
fix Give `AsyncImage`-style product art a real three-state treatment: a branded placeholder mark while
loading, and a distinct (quiet) "no image" mark on failure/absence, so the empty case is designed
rather than blank.
NOTE Not iPad-specific — the same card would be blank on a phone; the iPad grid just makes it a
387 pt-wide void instead of a 170 pt one.

## GAP5-10 — The Companion dock's label sits on raw product photography with no scrim
area companion · **minor** · testerVisible true · confidence 0.75 · effort S
where Browse pieces, bottom of screen · `shots/GAP5/15c-bottom-dock.png`
evidence "5 THINGS NEED YOUR EYE" is rendered in dark letter-spaced caps **directly over the scrolling
product grid** — in this frame over a dark blurred photograph — with no backing surface. Contrast is
low enough that the string is barely resolvable. The circular Companion button overlaps the top of the
same text.
why it matters The one persistent piece of chrome in the browse experience is illegible against
half the content it floats over.
fix A material/scrim behind the dock label, or move the count into the button's own surface.

## GAP5-11 — Decorative emoji are inside accessibility labels
area accessibility · **minor** · testerVisible false · confidence 0.9 · effort S
where taste quiz Q2 · `scan_ui` output
evidence The row's `AXLabel` is verbatim `"🍷, Love having people over, Entertaining & gathering"`.
The emoji is decoration but is part of the announced label, so VoiceOver reads "wine glass" before the
option. Every row in that question follows the pattern.
why it matters Small, but it is exactly the kind of thing the bar ("correct VoiceOver") is about.
fix `.accessibilityHidden(true)` on the emoji, or build the label from the two text strings only.
NOTE Not iPad-specific.

## GAP5-12 — The last quiz step reads "100%" before it has been answered
area onboarding · **polish** · testerVisible true · confidence 0.9 · effort S
where taste quiz Q5 · `shots/GAP5/_q6s.png`
evidence On arriving at question 5 the progress card reads "STEP 5 OF 5" with a **full bar and
"100%"**, while the question is unanswered and Continue is disabled (greyed).
why it matters Progress that reports done before it is done is a small honesty bug; the greyed
Continue directly contradicts it in the same card.
fix Report completed/total (4 of 5 = 80% on arrival), or drive the bar off answers rather than index.
NOTE Not iPad-specific.

## GAP5-13 — PostgREST 406s on two settings reads at sign-in
area settings-account · **minor** · testerVisible false · confidence 0.7 · effort S
where Kong log during sign-in as `client@patina.dev`
evidence Verbatim, two of the sign-in fan-out requests answer **406**:
`GET /rest/v1/user_settings?select=user_id%2Cpush_notifications%2Cemail_notifications&user_id=eq.a0000000-…-005 HTTP/1.1" 406`
`GET /rest/v1/notification_preferences?select=user_id%2Cchannels_push%2Cchannels_email%2Cchannels_in_app&user_id=eq.a0000000-…-005 HTTP/1.1" 406`
Every other request in the same burst is 200/201. PostgREST answers 406 when a single-object
representation is requested and zero rows match — i.e. the app asks for exactly one settings row for a
user who has none, and swallows the failure.
why it matters Nothing visibly breaks, so it is minor — but the notification-preference screens are
reading from a call that fails silently for any user without a seeded row, which on production is
every brand-new tester.
fix Use a maybe-single read with a defined default, and surface a real error if the read fails for any
other reason.
NOTE Local-stack evidence; a production tester's row may exist. Not iPad-specific.

## GAP5-14 — Four question-mark buttons, three sizes, one screen — and two different right margins
area visual-system · **major** · testerVisible **true** · confidence 0.9 · effort S
where Your Spaces · `shots/GAP5/20-your-spaces.png`
evidence Counting glyphs in one frame: a small "?" circle beside the "Your Spaces" title (x≈292 disp),
a large outlined "?" at x≈1157, a smaller lighter "?" at x≈1237, and a fourth "?" beside the
"Whole Home" summary bar at x≈1309 — **four help affordances, three visual weights**, three of them
inside the same header strip. Separately, the "Whole Home" bar's right edge lands at x≈1262 while the
room cards below it end at x≈1343 — **two different right margins on one screen** (≈49 pt apart).
why it matters On a 402 pt phone these sit close enough to read as one cluster; at 834 pt they spread
out and the eye sees four unrelated help buttons and a ragged right edge. It is the first screen after
"Your spaces" and it looks like three people built it.
fix One help entry point per screen; one shared trailing inset token for every block.

## GAP5-15 — Two room cards in the same list have structurally different footers
area rooms-scan · **minor** · testerVisible true · confidence 0.9 · effort S
where Your Spaces · `shots/GAP5/20-your-spaces.png`
evidence "Guest Bedroom" footer = two columns with a vertical divider — `0 / ITEMS` | `$9.0K / BUDGET`.
"Audit Room B" footer directly beneath = a **single centred** `0 / ITEMS`, no divider, no budget column.
The difference is that one room has a budget and the other does not, and the layout collapses instead
of showing an empty/placeholder budget.
why it matters Two cards in one vertical list with different internal structure reads as a bug, not a
data difference — especially at 795 pt wide where a centred single stat looks lost.
fix Keep the two-column frame and render the missing budget as a designed empty value ("—", or
"No budget set"), rather than restructuring the card.

## GAP5-16 — The same rooms are labelled "TYPED, NOT SCANNED" on one screen and "SCANNED SEP 1" on another
area rooms-scan · **major** · testerVisible **true** · confidence 0.7 · effort M
where Your Spaces vs Studio ("YOUR ROOMS") · `shots/GAP5/20-your-spaces.png` vs
`shots/GAP5/24-after-tap-outside.png`
evidence Verbatim. Your Spaces: "Guest Bedroom — 180 SQ FT · TYPED, NOT SCANNED" and
"Audit Room B — 252 SQ FT · TYPED, NOT SCANNED". Studio, ~3 minutes later in the same session,
same two rooms: "Guest Bedroom / SCANNED SEP 1" and "Audit Room B / SCANNED SEP 1". Both rooms flip,
so this is not one row changing — it is two surfaces formatting the same provenance field differently.
why it matters "Was my room scanned or not?" is a factual question the app answers two ways. Whichever
is right, one of them is lying to the tester.
fix One formatter for room provenance, used by both surfaces.
NOTE confidence 0.7 — the local Supabase is shared with other concurrent audit lanes, so I cannot
completely exclude a row being mutated between the two screenshots. The fact that **both** rooms
changed together, and that "SCANNED SEP 1" is impossible for a room the other screen calls "typed",
is what keeps this above 0.5.

## GAP5-17 — Today shows three rooms; Your Spaces, the profile stat and the Companion all say two
area today-home · **minor** · testerVisible true · confidence 0.65 · effort M
where `shots/GAP5/17-today-clean.png` (YOUR HOUSE: Guest Bedroom, Audit Room B, Dining Room) vs
`20-your-spaces.png` ("Whole Home — 2 rooms", and exactly two cards listed) vs
`21-profile.png` ("2 / ROOMS") vs `19b-companion-crop.png` ("Your spaces — 2 ROOMS")
evidence Three independent surfaces say **2**; the Today "YOUR HOUSE" carousel renders **3** cards,
the extra one being "Dining Room · budget $4,500".
why it matters A tester counts their own rooms. Two different answers in one app is the kind of thing
that makes people stop trusting the numbers — including the money ones.
fix Decide whether "YOUR HOUSE" on Today includes designer-project rooms that "Your Spaces" excludes,
and if so label the difference; otherwise use one source.
NOTE confidence 0.65 — the Today carousel may deliberately include project rooms. Shared local DB
caveat as GAP5-16.

## GAP5-18 — Measured: the story card's "MAKER SPOTLIGHT" eyebrow is at 1.36:1 contrast — effectively invisible
area accessibility · **major** · testerVisible **true** · confidence 0.95 · effort S
where Today home, story card · `shots/GAP5/17-today-clean.png`, crop `17b-story-eyebrow.png`
evidence Sampled from the PNG. The eyebrow's **lightest** glyph pixel is `rgb(159,126,72)` against a
card background of `rgb(124,107,85)` → **contrast ratio 1.36 : 1** (most of the glyph body measures
1.06 : 1). The headline immediately below it, on the same background, measures **4.8 : 1** and reads
perfectly. WCAG AA needs 4.5 : 1 (3 : 1 for large text), so the eyebrow misses by a factor of three
even against the lenient threshold.
why it matters It is the label that tells you what kind of content the card is. It is gold-on-brown at
the exact point where the gradient is lightest, so it disappears entirely — and it is on the home
screen, in the first minute.
fix Put the eyebrow on the dark end of the gradient, add a scrim behind it, or use the same near-white
as the headline. NOTE not iPad-specific.

## GAP5-19 — The notification pre-permission sheet is mostly empty on the iPad form sheet
area notifications · **major** · testerVisible **true** · confidence 0.9 · effort M
where first return to Today after sign-in · `shots/GAP5/16-today-home.png`
evidence The sheet is the same fixed ≈576 × 660 pt form sheet as GAP5-06. Its content — bell mark,
"Before we interrupt you", two lines of body — occupies a band roughly 125 pt tall in the middle.
Above it: ≈150 pt of empty cream. Below it, before "Turn on notifications": ≈140 pt more. The card is
a Spacer-driven phone layout that reads generous at 402 × 400 and empty at 576 × 660.
why it matters This is the app's first *ask*. Asking for notifications from the middle of a mostly
blank card weakens the ask and looks unfinished.
fix Size the sheet to its content (`.presentationDetents([.height(...)])` on phone,
`.presentationSizing(.fitted)` on iPad), or replace the spacers with fixed spacing.
GOOD the copy is excellent — "We'll tell you when your designer sends something that needs you — a
decision, a proposal, or an invoice. Nothing else." is exactly the right promise, and "Not now" is
offered as a real choice.

## GAP5-20 — The Settings sheet clips its own section header and offers no visible way to close
area settings-account · **major** · testerVisible **true** · confidence 0.9 · effort S
where Studio → Settings · `shots/GAP5/22-settings-sheet.png`, `23-settings-scrolled.png`,
`23b-settings-crop.png`, `24-after-tap-outside.png`
evidence Second reproduction of GAP5-06 on a different sheet: as presented, the section header
**"PRIVACY & MEMORY" is sliced horizontally through the middle of its capitals** by the form sheet's
bottom edge. Scrolling reveals the rest. Separately, `scan_ui` finds **no "Done" and no "Close"**
anywhere in the sheet, there is no grabber at the top of the card, and nothing at the bottom either
(the sheet ends in ≈150 pt of empty cream after "Terms & Privacy"). Tapping outside the card **does**
dismiss it (`24-after-tap-outside.png`), so it is not a trap — but nothing says so.
why it matters The Sign In sheet has a "Cancel" pill; this one has nothing. Inconsistent dismissal
across two sheets in the same app, and on iPad the "swipe the sheet down" instinct people have from
iPhone does not obviously apply to a centred card.
fix A "Done" in a consistent position on every sheet.

## GAP5-21 — Settings carries no version or build number — a TestFlight tester cannot say which build they are on
area testflight-config · **major** · testerVisible **true** · confidence 0.85 · effort S
where Settings sheet, scrolled to the end · `shots/GAP5/23b-settings-crop.png`
evidence The sheet ends: PRIVACY & MEMORY (3 rows) → SUPPORT (Help Center, Contact Us,
Terms & Privacy) → **≈150 pt of empty space, then the card edge.** No version row, no build number, no
commit stamp. The app *has* the data — `00-steward.md` §1 records the build stamping
`GitCommit.sha = "d7287c3f+"` and A2 notes `AppConfiguration.swift:77` compiles it — it is simply not
surfaced where a tester would look.
why it matters TestFlight testers install multiple builds. Bug reports that do not name a build cost
a round trip each, and Kody's first round is the round where that matters most. The empty tail of the
Settings sheet is exactly where the version row belongs.
fix A quiet "Patina 1.0 (1) · d7287c3f" row at the bottom of SUPPORT, tap-to-copy.

## GAP5-22 — `house-first` tab bar: the 402 pt arithmetic scales to 192 pt cells per word — a web nav bar, not a tab bar
area today-home · **minor** · testerVisible true · confidence 0.9 · effort S
where `PatinaTabBar` under `-PatinaFlags house-first,…` · `shots/GAP5/25-tabbar-house-first.png`,
crop `25b-tabbar-crop.png`; measured via `scan_ui`
evidence The "Spaces" tab measures `AXFrame {{198, 1136}, {192, 49}}` — **exactly 192 pt wide**, which
is `(834 − 12 − 54) / 4`, i.e. C9-16's formula evaluated at the iPad width. So the hand-rolled
arithmetic **does not break** here — C9-16's truncation risk is a *narrow*-screen risk. What it
produces instead is four ~70 pt words each alone in a 192 pt cell, text-only, no icons, spread across
the full width with the companion glyph marooned in its fixed 54 pt slot at the far right.
why it matters It answers the probe's tab-bar question: the arithmetic survives, the composition does
not. Relevant only if `house-first` is ever turned on for an iPad tester — it is OFF for round one.
ALSO the tab's `AXLabel` is **"Your Spaces"** while the visible label reads **"Spaces"** — VoiceOver
and the screen disagree (WCAG 2.5.3 "Label in Name"). Same for the visible/AX pairing on the other tabs.
fix Derive the trailing slot and inter-item spacing from the container width (which also fixes C9-16's
narrow case), and make the AX label start with the visible word.

## GAP5-23 — The Companion coach mark covers the panel it is explaining
area companion · **major** · testerVisible **true** · confidence 0.9 · effort S
where first Companion open · `shots/GAP5/18-companion-panel.png`
evidence The white callout — "These are your next steps. They change with every room you're in — tap
one and I'll take you there." — is anchored to the **left** of the Companion panel and overlaps roughly
55% of its width. It completely hides the panel's first row ("Message your designer" — only its
chevron peeks out at x≈938 disp) and half-covers the panel's own "?" and "×" controls.
why it matters The coach mark's entire job is to point at the list. It is sitting on it. And the row it
hides is the one a client most needs — messaging their designer.
fix Anchor the callout above or below the panel (there is ~450 pt of free space above it on iPad), or
constrain it to not intersect its anchor view.

## GAP5-24 — Stretched list rows put the label and its value ~900 pt apart
area today-home · **major** · testerVisible **true** · confidence 0.9 · effort M
where Today home "NEEDS YOU" / "MOVED" · `shots/GAP5/17-today-clean.png`
evidence "Your invoice is due." starts at x≈60 disp; its value "$4,250.00 · DUE SEP 6" ends at
x≈1318 disp — the two halves of one fact are separated by **≈900 pt of blank row**. Same for every
other row ("Leah Hartwell sent a proposal to review." … "BY SEP 15").
why it matters On a 402 pt phone these read as a pair. At 834 pt the eye has to travel the width of the
screen to pair a task with its date, and adjacent rows' values line up into a column that looks
detached from the tasks. It is the single most "this is a phone app on a tablet" moment in the walk.
fix Cap the row's content width (the same `maxWidth` that fixes GAP5-03/GAP5-07), or move the value
under the label above a threshold width.

## GAP5-25 — Room cards on Today are more than half empty
area today-home · **minor** · testerVisible true · confidence 0.85 · effort S
where Today home "YOUR HOUSE" · `shots/GAP5/17-today-clean.png`, crop `17c-room-card.png`
evidence Each card is ≈278 × 124 pt. It contains a title and one subtitle line at the top
("Guest Bedroom" / "180 sq ft · budget $9,000") and then **≈60% of the card is blank cream** — no
thumbnail, no status, no chevron. The card's height is fixed while its width stretched, so the void grew.
why it matters The rooms are the emotional centre of the product and their cards are empty rectangles.
fix Either fill the space (the room's gradient/photo, as Your Spaces uses) or let the card size to its
content.

## GAP5-26 — "5 things need your eye" is on screen twice at once
area companion · **polish** · testerVisible true · confidence 0.9 · effort S
where Studio/profile · `shots/GAP5/21-profile.png`
evidence The string appears as the screen's own subtitle under "The work around your home, in one
place." **and** as the floating Companion dock label ("5 THINGS NEED YOUR EYE") near the bottom of the
same frame. On a phone the two are far enough apart to be forgivable; on the taller iPad canvas both
are comfortably in view together.
fix Suppress the dock label on screens that already state the count.

## GAP5-27 — Decorative chevrons are inside accessibility labels too
area accessibility · **minor** · testerVisible false · confidence 0.9 · effort S
where Companion panel rows · `scan_ui` output
evidence `companion.action.person.circle` has `AXLabel` = `"Your profile, Style · Settings · Portal, ›"`
— the decorative "›" is part of the announced label. Companion rows all follow the pattern.
Extends GAP5-11 (which is about emoji in labels) to the trailing chevrons.
fix Mark the chevron decorative; the row's button trait already conveys "opens something".

---

# WHAT IS GOOD (calibration)

- **The Companion panel is the best-composed surface in the walk.** "Where to next? / 5 things need
  your eye", six rows with consistent glyph tiles, honest sublabels ("Saved — NOTHING SAVED YET",
  "Your spaces — 2 ROOMS"), one highlighted recommendation row. At 375 pt it stays a panel on iPad
  instead of stretching, which is the *only* surface that keeps its intended proportions here.
- **Copy is genuinely good throughout.** "Before we interrupt you… Nothing else." ·
  "Use activity for context — Off until you choose it. When on, Patina remembers only activity type,
  an identifier, and time for up to 90 days." · "Budget — What's been billed, and what's been paid" ·
  "Archive / Nothing has been archived." No developer speak, no lorem, no raw error strings anywhere
  in this walk.
- **Empty states are written, not defaulted**: "NOTHING SAVED YET", "All caught up",
  "Nothing has been archived."
- **The Settings sheet's information architecture is right** — ACCOUNT / PREFERENCES /
  PRIVACY & MEMORY / SUPPORT, with in-app account deletion present and a real privacy explanation.
- **The taste quiz auto-advances on single-select** and shows a Continue only where a choice can be
  revised — a considered interaction, not a default.
- **The Studio screen holds up at 834 pt** better than anything else: enough content that the width
  does not read as empty, icons on every row, counts on every section header.
- **No crash, no hang, no spinner over 1 s, no blank frame** across ~40 interactions, including two
  device rotations, a sign-in, a five-question quiz and six screen transitions. Sign-in fan-out on the
  local stack completed in ≈2 s.
- **Not one raw error string** was surfaced during the walk.

# NOT VERIFIED / COVERAGE GAPS

1. **Cold-launch timing** — `xcrun simctl io … screenshot` costs ≈7 s per capture on this iPad, so the
   0.5 s-interval method in the brief is not usable here. `cold-1…6.png` show the sequence but not the
   timing. No launch-duration claim is made.
2. **Dark mode and Dynamic Type on iPad** — not run. The whole budget went to the idiom questions the
   probe asked for. `xcrun simctl ui <udid> appearance dark` / `content_size accessibility-*` on this
   clone would be cheap follow-ups and would land on top of GAP5-03/04/24 (a 779 pt slab at AX3 is a
   different problem again).
3. **Split View / Slide Over / a resized iPad window** — not tested. Rotation was the reachable proxy.
   Because `UIRequiresFullScreen` is absent (A2-03), iPadOS 26 will let a user resize this app's window
   to widths far below 577 pt, and GAP5-02 shows the paging container already misbehaves at one
   non-native width. This is the highest-value untested surface left.
4. **iPad multitasking upload validation (A2-03's actual blocker claim)** — cannot be reproduced on a
   simulator; it is an App Store Connect upload-time check. What this lane adds is the *consequence*
   side of A2-03, in pixels; the ITMS-90474 claim itself remains as A2 left it.
5. **Production behaviour** — this lane ran entirely against the local Supabase stack. Nothing here
   touched Strata.
6. **Shared local database** — other audit lanes were writing to the same local stack during this walk
   ("Audit Room B" is not seed data). GAP5-16 and GAP5-17 carry that caveat explicitly.
7. **`scan_ui` unqueried and `describe_screen` both return `[]` on this iPad**, so element inventories
   here are only as complete as the queries I thought to run. Absence of a control was never inferred
   from an empty scan.
8. **A post-rotation screenshot artefact**: after rotating back to portrait, `11-today-home.png` shows
   the system status-bar cluster drawn a second time at the bottom-right. It does not appear in shots
   taken before any rotation, it is **system chrome, not app UI**, and it is not reported as a finding.
   Later walkers should not mistake it for one.
