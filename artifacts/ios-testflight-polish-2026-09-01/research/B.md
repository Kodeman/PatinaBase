# Lane B — flags-ON walk (local backend), udid 2B711913-9121-4E89-8E80-809AE8F34C2A

Build: Debug signed, `d7287c3f+`. Launch args on EVERY launch:
`-DeploymentTarget local -PatinaFlags house-first,direct-orders,house-widget`

## Log

### Step 0 — cold launch (flags ON, local)
Launch → first frame timing: shot `cold-1.png` (~1.2 s) = **completely blank cream screen**, no logo, no
spinner. `cold-2.png` (~2.0 s) = a **crossfade in which TWO "PATINA" wordmarks are on screen at once** —
the splash wordmark solid at screen centre (y≈500 pt) and the Welcome-screen wordmark ghosted at y≈163 pt.
`cold-3.png` (~2.7 s) = settled Welcome home. First interactive frame ≈2.5–3 s (Debug build, sim).

Welcome home AX tree (describe_screen): appleButton 346×50, googleButton 347.5×51.5 (AXLabel
`"G, Continue with Google"`), emailButton (AXLabel `"✉, Continue with email"`), guestButton
"Look around first", passwordButton "Have a password? Sign in" **frame height 14.67 pt**,
termsLink / privacyLink **frame height 14.67 pt**.

GOOD: the Welcome screen itself is handsome — serif wordmark, generous spacing, Apple button first,
guest path present and honestly labelled, legal line present.

### Step 1 — HID preflight PASS
Tapped `auth.welcome.guestButton` @ (201,578) → screen changed to guest onboarding page 1
("Every room tells a story"). Synthetic input lands on tfp-B.

### Step 2 — guest onboarding carousel (3 pages) + style quiz
Pages: 1 "Every room tells a story" (warm-tan gradient hero) · 2 "See it in your space" (SAGE-GREEN
gradient hero) · 3 "Find your style first" (FLAT GREY panel, no gradient). Three consecutive pages,
three unrelated background treatments; every hero is an abstract rounded-rectangle placeholder.
Button labels across the three pages: "Start Your Journey" (Title Case) → "Continue" → "Let's begin"
(sentence case). Skip present on 1 and 2, absent on 3.
Apostrophes: page 1 "Let's" = straight `'`; page 2 "room's" = curly `’`; page 3 "we'll"/"Let's" = straight.

Quiz Q1 "Which palette feels like home?" — 4 gradient swatches; **no Back, no Skip, no exit** in the
AX tree. Footer card states progress FOUR ways: "Question 1 of 5", "STEP 1 OF 5", "20%", and a bar
(AXValue literally `"20 percent, Step 1 of 5, Question 1 of 5"`).
Q2 "How do you actually live in your space?" — five rows iconed with **full-colour emoji**; AX labels
are `"🍷, Love having people over, …"`, `"🧘, My quiet sanctuary, …"`, `"👨‍👩‍👧, Family central, …"`.
Q1 auto-advances on tap; Q2 requires Continue — inconsistent between adjacent steps.
Selecting a Q2 row reveals a second forward affordance, the text line "Next question →", stacked
directly above the "Continue →" button; `scan_ui` returns only `companion.quiz.continue` as tappable.
Selected row carries no selected trait/value in AX.

### Step 3 — quiz Q3/Q4/Q5 + Taste Portrait
Q3 "Which material draws you in?" — swatches are FLAT GRADIENT SQUARES, no material texture; "Aged
Leather" and "Woven Rattan" are near-identical tans.
Q4 "Let's talk about investment" — row icons MIX colour emoji and typographic glyphs in ONE list:
🌱 (emoji) · ✦ (glyph) · ◆ (glyph) · 💬 (emoji).
Q5 "What's driving your design journey?" — 🏠 ✨ 🔄 💎; the 🔄 renders as a saturated BLUE square and
💎 as cyan, against a cream/brown palette. Footer reads **"STEP 5 OF 5 … 100%" with the bar full while
the question is still unanswered and Continue is disabled.**
On the last question the button is still labelled "Continue", AX help `"Moves to the next quiz question."`

Taste Portrait — the best screen so far. "Warm Modern / YOUR TASTE PORTRAIT", material chip, three
"WHY PATINA SEES THIS" bullets, mono captions. Two defects:
 * an **unlabelled progress bar** (~55% fill) sits under the bullets with only the caption
   "A STARTING POINT — REFINE IT ANY TIME." — nothing says what the bar measures.
 * footnote: **"Your portrait stays on this device and can be reset in Settings."** — but Kong shows
   exactly one Patina request in the 120 s window containing my Continue tap:
   `[01/Sep/2026:21:01:30] "POST /rest/v1/rpc/process_style_quiz HTTP/1.1" 200 339 "Patina/1 …"`.
   The guest's answers DO leave the device.
 * "Tune the portrait" card sits directly above a "Tune this" button — near-duplicate labels.

### Step 4 — guest lands on Pieces (four-tab root, flags ON)
"View Recommendations" lands on the **Pieces** tab, not Today. Header "Browse pieces / 10 pieces chosen
for your space" (a guest has no space). Saved door: "Saved · NOTHING YET" — honest empty state, GOOD.

Tab bar AX (describe_screen) — **five** AXTabButtons:
`Today (84pt)` · `Your Spaces (84)` · `Browse pieces (84)` · `Your Studio (84)` · `Companion (54, no
visible label, help "Opens quick actions for this screen.")`. Printed labels are "Today / Spaces /
Pieces / Studio" — VoiceOver says "Your Spaces", "Browse pieces", "Your Studio". Mismatch.

Product cards are exposed as **`AXPopUpButton` / role_description "pop up button"** with custom actions
`["Skip", "Save", "Save to favorites", "More actions"]` — wrong role, and Save is duplicated.
Filter chips (All/Seating/Tables/Lighting/Storage) are **26.67 pt tall** — under the 44 pt minimum.

Recommendation quality/content, all four visible cards:
 * "Heirloom Oak Dining Table" — photo is a WHITE table with GREEN velvet chairs.
 * "Live-Edge Coffee Table" — photo is a rustic wooden CHAIR standing on GRASS outdoors.
 * "Terracotta Planter Set" — photo is a single MINT-GREEN plastic planter.
 * "Brass Arc Floor Lamp" — photo is a grey/white pendant on a TEAL studio background.
 Match scores: **46%, 46%, 45%, 45%** — the best result of a five-question taste quiz is 46%.
 Reason line truncates mid-word: "Its style tags connect to your Warm Modern por…"

### Step 5 — Today (guest) + the hoisted first-launch tour
Tour popover step 1 anchored under the greeting, **covering the very card it describes** ("This is your
Daily Room — picks and stories chosen for your space" sits on top of the blurred Next-Move card).
Its Skip/Next are **iOS system blue** (`Skip` blue text, `Next` blue filled pill) — the only blue in a
cream/brown/black app. AX exposes the whole popover as ONE `AXHeading` with
AXUniqueId `"FirstLaunchTour.StepIndicator-FirstLaunchTour.Heading-FirstLaunchTour.Body-FirstLaunchTour.SkipButton-FirstLaunchTour.NextButton"`
and custom_actions `["Skip","Next"]` — the buttons are not separately focusable.
Step 2 of 2 anchors on the Studio tab and calls it **"Your profile"**. Names for that one destination
so far: tab label "Studio", AX label "Your Studio", tour "Your profile". Today is called "Today" (tab),
"Daily Room" (tour), "YOUR HOUSE" (section eyebrow). Step 2 still offers "Skip" beside "Done".

Today header controls: `DailyRoomView.BellButton` **36×36 pt** and `DailyRoomView.HelpButton` **36×36 pt**
— both under 44 pt. The two "Start with a room" cards share ONE AXUniqueId `DailyRoomView.StartWithARoom`
for two different destinations, and their frames differ: `{20, 393.33, 175×111}` vs `{207, 394, 175×109.33}`
— a 1.7 pt height and 0.7 pt baseline mismatch between a side-by-side pair.

**Tooltip overflow (shot 17).** The small (?) beside "Good afternoon." opens a white bubble whose text
overflows its own shape top and bottom: line 1 "Today keeps Patina" is cut by the bubble's top edge and
the last line "and one active room." is cut by the bottom edge and renders over the page behind it.
Third distinct tooltip style in the app.

Guest Today content: "NEXT MOVE / Bring your first room into Patina / A short scan gives **the Companion**
a real space to work from." — "the Companion" is a proper noun never introduced to a first-run tester.
Editorial hero "The Grain Whisperer of Maine" is a **flat brown gradient with no photograph**.
Guest sign-in prompt is a bare sentence "Sign in to keep this on every device." with no button.

### Step 6 — Spaces (guest, empty)
**FOUR help glyphs in one screen**, three of them with the literal AXUniqueId **`questionmark.circle`**
(an SF Symbol name used as the accessibility identifier), AXLabel "More information", help
"Shows additional information.":
  `{155.33, 118, 44×44}` (beside the title) · `{294, 118.67, 44×44}` (header) · `{247.33, 457, 44×44}`
  (beside "No rooms yet")
plus `YourSpacesView.HelpButton` "Help" at `{250, 121, 36×35.67}`. Rendered glyphs are three different
sizes and two different colours, unevenly spaced, with `Add a room` (`{346.17, 121, 35.67×35.67}`) 8 pt
to the right of the last one. Header controls at 36 pt < 44 pt minimum.

Empty-state art is the **literal Unicode character "⌂" (U+2302)** exposed to VoiceOver as
`StaticText "⌂"`; the CTA is `Button "◎, Scan Your First Room"` — **"◎" is U+25CE BULLSEYE**, again a
text character, and it is read aloud in the VoiceOver label.
The empty state's only CTA is **scan** — the "Type the dimensions" path Today offers is absent here,
so a tester on a device without LiDAR (or who declines camera) has no room-creation path from Spaces.
"Scan Your First Room" is Title Case; other primary buttons are sentence case.
GOOD: the empty-state copy ("Scan a room and Patina fills it with furniture that knows your space —
your light, your walls, your style.") is genuinely well written.

### Step 7 — Studio (guest) → Settings → Account
Studio: the title **"Your Studio" renders inside a grey rounded capsule pinned at the top-left**; when
the page scrolls, the section hairline runs behind/through the capsule (shots 19 + 20). No other tab
has this treatment; it reads as a stuck collapsed nav title.
Sign-in card: "Your Studio begins with a project. / Sign in to see conversations, decisions, proposals,
invoices, and shared files." — its only action is the text link **"Open settings"**. There is no
Sign In control. "YOUR PROFILE" rows: "Retake Style Quiz" (Title Case) · "Get design help" (sentence)
· "Settings" — three capitalisation conventions in a three-row list.

Settings sheet: **no Done/Close button and no grabber** (`scan_ui` top-half returns only content rows) —
swipe-to-dismiss only. Every grouped card draws a **trailing hairline below its LAST row** (under
"Sign in on the web", "Appearance", "Reset taste portrait", "Terms & Privacy"), hugging the rounded
corner. Row icon tiles are tinted off-palette: Notifications PINK, "Upload scans on cellular" BLUE,
"Use activity for context" GREEN, Help Center GREEN, Contact Us ORANGE — among otherwise tan tiles.
GOOD: the privacy copy "Off until you choose it. When on, Patina remembers only activity type, an
identifier, and time for up to 90 days." is honest and well written; the brown custom toggle tint is
on-brand.

Account: shows `Not signed in`, `Email —`, `Member since —`, and **one** action: "Sign in on the web".
**A guest has no in-app email/Apple/password sign-in route anywhere** — the Welcome screen is
unreachable once you have chosen "Look around first". Version string lives here (Settings has none):
**"Patina 1.0 (1) · d7287c3f+"** — a raw git SHA with a dirty-tree `+` shown to testers.
"Sign in on the web" → "Camera Access Required / Patina needs camera access to scan QR codes for secure
sign-in." with a large FILLED brown camera glyph (every other icon in the app is a thin line icon),
~200 pt of dead space above it, a `?` button in a grey circle at the TOP-LEFT where Back belongs, and
the actual close `X` at top-right.

### Step 8 — sign in (client@patina.dev / password123) and signed-in Today
Sign In sheet: the primary "Sign In" button in its **disabled** state is a light TAN fill with WHITE
text (shot 26) — it does not read as disabled and white-on-tan is far under 4.5:1; when enabled it turns
near-black (shot 27). On that screen the secondary "Sign in with Apple" (solid black) is visually more
prominent than the primary. Dismissal is a floating white "Cancel" capsule at top-right — a treatment
used nowhere else. Envelope is a line icon here but a colour emoji ✉️ on the Welcome screen for the
same concept. "Don't have an account?" straight apostrophe.

**After a successful sign-in with an EXISTING account** (client@patina.dev has projects, rooms,
invoices, a live designer) the app drops into the **first-run intro carousel** "Every room tells a
story / Let's discover yours." (shot 30) and then, on Skip, the **mandatory 5-question style quiz**
with no back/skip/exit (shot 31). Onboarding completion is device-local, not account-linked.
The taste-portrait footnote still reads "Your portrait stays on this device…" for a signed-in user.

Then a pre-permission sheet: "Before we interrupt you / We'll tell you when your designer sends
something that needs you — a decision, a proposal, or an invoice. Nothing else." Copy is EXCELLENT;
layout is not — the bell sits 36 % down the sheet, ~500 px of empty space separates the body from the
button, and left-aligned text sits above centred buttons.

Signed-in Pieces: matches are 73/69/67/67 %. **"Wool Kilim Runner" renders a flat grey block where the
photo should be** — no icon, no shimmer, no label (shot 34). "Meadow Linen Sectional" photo is a dark
charcoal sectional. Same "…Warm Modern por…" truncation.

Signed-in Today:
 * **Content scrolls UNDER the status bar with no material and no top safe-area inset — the 9:41 clock
   sits directly on top of the row text "to review."** (shot 36). Clear, testerVisible.
 * `"Leah asked about Dining chairs - Shaker Oak vs Windsor Elm."` — a HYPHEN where a dash belongs.
 * Section eyebrow "MOVED" (jargon) with two rows in different text colours and no legend:
   "A new story from the workshop." light grey vs "Meadow Linen Sectional shipped." near-black.
 * NEEDS YOU rows carry no chevron or other tap affordance.
 * **"YOUR HOUSE" eyebrow is followed by ~140 px of empty space where a section heading should be** —
   the guest build renders "Start with a room" there; signed-in renders nothing.
 * Room cards ("Guest Bedroom · 180 sq ft · budget $9,000") have **no image** — the bottom half of each
   227 px card is blank. The peeking "Dining R…" card is cut flat by the screen edge.

### Step 9 — tab re-tap, Spaces signed-in, add / inspect / delete a room
**Re-tapping the already-selected Today tab does NOT scroll to top** (shots 36 vs 37 identical) — the
standard iOS idiom is missing.

Spaces (signed in): the dark "Whole Home" summary card is **~50 pt narrower than the room card below
it**, left-aligned, with a stray `?` floating in the gap — a ragged right edge in a two-card stack.
Room cards carry no photograph (arbitrary gradients: warm tan for one, BLUE-GREY for the other) and
their captions ("180 SQ FT · TYPED, NOT SCANNED") are mid-brown mono on a mid-brown gradient — very
low contrast. **"TYPED, NOT SCANNED" is system language shown to a homeowner.** Budget is "$9,000" on
Today and "$9.0K" here for the same room.

"Add a new room" sheet: "Scan with camera" has a 90 pt tan tile with a ◎ glyph; "Enter manually" has a
bare BLUE-GREY 📐 ruler EMOJI with no tile — two different icon systems in a two-row sheet. The sheet
draws its cream background only down to y≈740 pt; below that a grey band of a different colour fills to
the bottom, and its top strip is a translucent blur — three materials in one sheet.

**Room details form: every Room Type chip breaks its own word across two lines at the default text size
— "Livin/g", "Bedro/om", "Offic/e", "Dinin/g", "Kitc/hen", "Oth/er"** (shots 40, 41, 44, 45). The same
component repeats on Room Settings. The "Room Name" placeholder "e.g. Living Room" is set in the SERIF
display face while all other field text is sans. The text caret is **system blue**.

Room detail: the settings control top-right is the **⚙️ colour emoji** in a white circle; the attribute
row uses **🧭 / 🪟 / 🚪 colour emoji**. Primary CTA reads **"Browse pieces for the Audit Room B"** — a
`for the \(roomName)` template that produces ungrammatical copy for any proper-noun room. The form was
entered as LENGTH 18 × WIDTH 14 but the detail prints "14 × 18 FT". **No scan entry point exists on a
typed room's detail screen.**

Room Settings: **a room created by typing shows a "Scan Data" panel — "SEP 1, 2026 · 252 sq ft ·
2 windows detected · Re-Scan This Room" — while the room card for the same room says "TYPED, NOT
SCANNED".** The primary "Get design help with this room" is **white text on the light tan fill** (same
low-contrast pair as the disabled Sign In button). "Delete This Room" is pale salmon, clipped by the
tab bar before scrolling, and the confirm alert uses full system RED — two destructive colours.
The floating back-chevron circle **overlaps the "Room Settings" title and "AUDIT ROOM B" eyebrow** once
the page scrolls (shot 45). Capitalisation on one screen: "Save dimensions" / "Re-Scan This Room" /
"Get design help with this room" / "Delete This Room".
GOOD: the delete confirmation copy — "Delete this room? / Items in this room will also be removed."

### Step 10 — deleting a room, Studio, invoices, Pay
**After confirming a delete the app stays on the dead detail screen and shows an error:**
`"This room isn't on this phone"` / `"It may have been removed."` with a `Your rooms` button (shot 47).
The user deliberately deleted it a second earlier; the app should have popped to the list, and it
hedges about a fact it knows.
**The deletion did not propagate**: Studio still reports `2 ROOMS` and still renders TWO room cards
under "YOUR ROOMS" (shots 48, 49).

Studio: the pinned "Your Studio" capsule **covers a list row's icon and the first word of its label**
("…sation / 1 unread thread", shot 49). "Awaiting you" is iconed with the **✋ colour emoji**;
the rest of the list uses thin-line SF Symbols — GOOD icons, spoiled by the one emoji.
"5 things need your eye" is immediately followed by "Awaiting you · 5" — the same count twice.
"Decisions / 3 project choices are ready / **Overdue** · Aug 28" — "Overdue" is the same brown as the
date; an overdue item carries no visual urgency.

Invoices list and invoice detail are among the **best screens in the app** — clear TOTAL/PAID/BALANCE,
em-dashed line items, "A NOTE FROM YOUR DESIGNER", and the reminder copy quotes the exact push it will
send: `We'll send one notification: “Your invoice is due tomorrow — $4,250.00. Nothing else.”`
Nits: Subtotal and Total are identical with no tax row; "Subtotal" is brown and "Total" black;
the floating back circle overlaps the "$4,250.00" TOTAL figure once scrolled; two adjacent footnotes
both say "securely" ("Payment opens securely in Safari." / "Pay securely by card or bank transfer.").
**"Pay $4,250.00" is white text on the light tan fill** — the lowest-contrast, highest-stakes button.

**Payment failure UX (verbatim, local placeholder Stripe key):**
> "We couldn't start this payment. Nothing has been charged."
> [Let's try that again]  [Message your designer]
GOOD — no raw error, reassuring, two recoveries. Faults: it **replaces** the Pay button rather than
appearing beside it, the page does not scroll to it, and the panel is clipped by the tab bar.

### Step 11 — product detail, sign-out, second account, purchase path
Product detail (Heirloom Oak Dining Table): the grid card said **73 % match** (signed in) / 46 % (guest);
the detail badge says **50 % match**. Brass Arc Floor Lamp detail ALSO says **50 %** while its grid card
said 45 %. The detail badge appears fixed at 50 % regardless of the product or the grid value.
The badge is a **pale GREEN pill** — the only green in the palette.
Hero photos keep contradicting the product: "Heirloom Oak Dining Table / Quarter-Sawn White Oak" over a
white-top table with green velvet chairs; "Brass Arc Floor Lamp / Solid Brass · Marble" over a grey
PENDANT lamp on teal. Description text is clipped mid-sentence ("made to order by a three-") by the
bottom action bar, which has no bottom content inset. The four circular header chips sit on the photo;
the "?" is a bare text glyph next to two SF Symbols, optically lighter and differently weighted, and on
the teal photo all four are dark-on-dark.
GOOD: the spec table (SIZE / LEAD TIME / MAKER / FINISH with proper ″ marks) and the trust block —
"Sold and shipped by Patina. / Patina is responsible for this order — for getting it to you, and for
putting it right if it arrives damaged or isn't what was described… If a designer is working on your
home, they are copied on anything you raise."

Sign-out: **there is NO Sign Out anywhere in Settings** (the signed-in sheet is identical to the guest
sheet). It lives only under Settings ▸ Account, as a faint outlined pill, with the irreversible
"Delete account" 40 pt below it in the same visual family and no separating section.
Account shows the **email as the profile name** even though the profile has a display name
("Client User" / "James Okafor" on Studio), and **"Member since Sep 1, 2026"** — today's date — for both
seeded accounts.

**Purchase path (direct-orders) — NOT REACHABLE.** After signing in as james.okafor@example.com the
Today screen shows "NEXT MOVE / See your design request / You're matched with Leah Hartwell" and a
designer card, and **every** product detail (freshly pushed, and again after a full relaunch) offers
"Ask Leah to source this" instead of Buy. The pre-emption fires on a *matched* designer, not an engaged
roster, so neither seeded local account can reach the order sheet, checkout, or the Ordered rails.
The designer card prints the name twice: title "Leah Hartwell", subtitle "Leah Hartwell · Designer
matched".
**The first-launch tour re-ran after the account switch, and its length changed from "Step 1 of 2" to
"Step 1 of 3"** (shot 66) — still with system-blue Skip/Next, still covering the card it describes.

### Step 12 — Companion, Dynamic Type, widget bridge, sign-out completeness
Companion (the 5th tab item, no visible label): opens a **modal dark panel**, not a tab. First open shows
a FOURTH coach-mark style — cream card, italic serif, tan "Got it" — and it **covers the panel's own
title and first row**. Voice shifts to first person ("tap one and **I'll** take you there") against the
third-person "Patina" voice used everywhere else. Row subtitles are mono uppercase that wrap awkwardly
("LEAH WILL SEE THE PIECE AND / THE PRICE"). One row reads "Your profile / STYLE · SETTINGS · **PORTAL**"
— internal jargon. On a product screen the panel's bottom edge leaves the product's own action bar
half-visible beneath it (two ghost pills at shots 68/69).

**Dynamic Type — `xcrun simctl ui … content_size accessibility-extra-large`, relaunched.**
Body text scales well and Today reflows without truncation (GOOD). Failures:
 * **The Companion panel overflows its own container and runs through the tab bar** (shot 72): the
   4th row "Billed to date / WHAT'S BEEN BILLED" renders BELOW the panel's rounded bottom edge, on top
   of the dimmed page, overlapping the words "Spaces Pieces Studio", and is cut off by the screen
   bottom. The panel neither scrolls nor resizes.
 * **Studio's "MEMBER SINCE SEP 1, 2026" is clipped at BOTH screen edges** (shot 71) — the mono caption
   has no horizontal padding at AX sizes.
 * The inline (?) beside the greeting does not scale and is left orphaned between the two lines of
   "Good / afternoon." (shot 70); the bell and header (?) stay 36 pt.
 * Tab-bar labels do not scale and "Spaces"/"Pieces" nearly touch.
 * The pinned "Your Studio" capsule scales, swelling to fill the header and pushing the (?) to its own line.
Restored with `content_size large` + relaunch.

**Widget bridge — sim-verified, WORKS.**
`xcrun simctl get_app_container … groups` → `group.cloud.patina.app` →
`…/AppGroup/0AB6432C-AF02-4DAB-A138-534D0B87985E`, containing `widget-snapshot.json` (431 B) and
`house-record.json` (675 B), both written at 17:08 — 18 s before I read them.
`widget-snapshot.json`: `{"refreshedAt":"2026-09-01T22:08:23Z","sinceDate":"2026-08-25T05:00:00Z",
"flagOn":true,"movedRows":[…"Leah Hartwell picked up your request."…,…"A new story from the workshop."…]}`
— matches Today exactly, and carries deep-link routes. **The widget on the Home Screen itself is a
device claim and is NOT verified here.**
Faults: the payload carries **no account identifier**, and **it is not cleared on sign-out** — after
signing James out (17:10:40) both files were still the 17:08 versions naming "Leah Hartwell".
`house-record.json` also serialises a raw Double: `"window":{"duration":666503.9479579926,…}`.

**Sign-out completeness — INCOMPLETE.** After signing out, the guest Studio still shows the previous
account's taste portrait chip "**✦ Style Explorer**" beneath the "Guest" avatar (shot 75). Rooms/Saved
correctly read 0 and guest Today carries no account rows (shot 76). The onboarding/quiz flag also
carries across accounts (signing in as a second account skipped onboarding entirely).
**The first-launch tour re-ran on every auth transition** — "Step 1 of 2" (first run) → "Step 1 of 3"
(after switching accounts) → "Step 1 of 2" (after sign-out).

### Step 13 — non-LiDAR scan fallback, save/unsave, Saved
"Scan it" on a device with no LiDAR falls back gracefully to a manual form — no error, no dead end
(GOOD). But it is a **THIRD, unrelated room-entry UI**: "TELL US ABOUT YOUR SPACE / What kind of room?"
with a 2×3 grid of **six full-colour emoji** (🛋️ 🛏️ 🍽️ 💻 🍳 ✨), tan-bordered dimension fields, a
Doors stepper the other form lacks, and a CTA "Continue to Style Discovery" — a feature name the user
has never seen. Notably the room types do NOT break mid-word here, proving the chip row elsewhere is a
fixable layout choice.
Save/unsave: tapping the card heart fills it and the door row updates to "Saved · 1 PIECE" instantly,
no spinner (GOOD). Saved screen is clean; the "Saved Sep 1 / Add a note" meta row floats outside and
below the card with no container and misaligned to it; the add "+" here is a brown outlined circle
while Spaces uses a black filled FAB.

## What is GOOD
Invoice list + invoice detail; the payment-failure copy; the "Sold and shipped by Patina" trust block;
the notification pre-permission copy; the delete-room confirmation; the Spaces empty-state prose; the
privacy copy in Settings; the Taste Portrait screen; the spec table with true ″ marks; the widget
snapshot bridge; save/unsave responsiveness; Dynamic Type reflow on Today; the non-LiDAR fallback
existing at all; tab state preserved across tab switches.

## Not verified in lane B
Direct-orders Buy → order sheet → checkout → Ordered rails (pre-empted by "Ask Leah to source this"
for BOTH seeded accounts). Messages send, design-request detail, proposals detail, decisions detail,
orders detail, Boards tab, Help Center / Contact Us / Terms destinations, notifications list,
dark mode, VoiceOver navigation, the widget on the Home Screen (device claim), production behaviour.
