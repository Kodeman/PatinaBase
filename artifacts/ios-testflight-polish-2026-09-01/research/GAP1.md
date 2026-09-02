# GAP1 — the decision path: list → detail → consent/e-sign → defer

Lane GAP1 · clone C `670DE752-BA1B-40C1-899E-57B50D5743B5` (iPhone 17 Pro, iOS 26.5, light, 9:41).
Launch: `xcrun simctl launch 670DE752-BA1B-40C1-899E-57B50D5743B5 cloud.patina.app -DeploymentTarget local`
Signed in as `client@patina.dev`. Build = steward's signed Debug (`d7287c3f+`). Local Supabase backend.
Every claim below is **sim-verified** (screenshot + AX tree). Nothing is device-verified.

---

## Clone-sharing caveat (read first)

Clone C was shared with lane **GAP7** for roughly the first 25 minutes of this walk. Symptoms seen in
that window and now explained: unprompted app relaunches, drops to the Home Screen, a signed-out
Welcome screen, Spotlight/widget sheets, and rooms/text I did not create.

**Every finding below was re-run and re-observed after C became exclusively mine**, except where the
row says `OVERLAP-ONLY`. Shots `01`–`15` are from the overlap window; `R01`–`R39` are authoritative.

Two things I *withdrew* after re-running them clean:
- "Cold launch shows a sign-in wall to a signed-in user" — **NOT a defect.** A clean
  `simctl terminate` + `simctl launch` puts the fully-populated signed-in Today home on screen at
  **0.7 s** (`R08-cold-0.7.png`). The Welcome screens I saw earlier were GAP7 signing the clone out.
- "The app is crashing" — **NOT a crash.** No crash report was ever written. The system log gives the
  exact cause: `RBSProcessExitStatus | domain:frontboard(10) code:force-quit(0xfbfbfbfb)` with
  `"isUserKill":0` and `explanation:Termination requested by simulator host` — an external
  `simctl terminate` from another host process (`research/GAP1-exit-04.log`). Environmental.

---

## Findings

### GAP1-01 · Approve and Cancel are off-screen on the consent sheet at accessibility text sizes
- **area** accessibility · **severity** blocker · **testerVisible** yes · **confidence** 0.97
- **where** `DecisionConsentSheet` — `apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:368-448`, presented at `:72-90` with `.presentationDetents([.medium, .large])`. Shot `R39-consent-axXL.png`; tree `research/GAP1-consent-axXL-axtree.json`.
- **evidence** At `content_size accessibility-extra-large` the sheet stays pinned to `.medium` (grabber AXValue `"Half screen"`, sheet top y=410.2 pt) while the content grows ~2.5×. Measured AX frames on an **874 pt** screen:
  `Button "Approve"  y=857.0 h=49.9` → only ~17 pt of it is on screen, the rest is below the display edge and under the home indicator.
  `Button "Cancel"   y=931.9 h=38.4` → **entirely off-screen**, 58 pt below the bottom.
  On screen the sheet ends mid-sentence at "…approval." with a tan sliver of Approve clipped at the boundary, and the underlying decision detail ("safer choice") bleeds through beneath it.
- **why it matters** This is the app's e-signature / contractual-approval surface. A tester using large text is shown a sheet that looks complete and has **no reachable primary action and no reachable way out**. The `ScrollView` is scrollable and `.large` exists, but `showsIndicators: false` means nothing hints at either.
- **fix sketch** Replace the fixed `[.medium, .large]` with a content-driven detent (`.presentationDetents([.height(measured), .large])`, or `.large` alone at accessibility sizes via `@Environment(\.dynamicTypeSize)`); pin the Approve/Cancel pair in a `safeAreaInset(edge: .bottom)` so they never scroll away. Same change fixes GAP1-02.
- **effort** M

### GAP1-02 · Send is clipped and Cancel is gone on the defer sheet at accessibility text sizes
- **area** accessibility · **severity** blocker · **testerVisible** yes · **confidence** 0.95
- **where** `DecisionDeferSheet` — `apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDeferSheet.swift:26-79`, presented at `DecisionDetailView.swift:55-71` with the same `[.medium, .large]`. Shot `R38-defer-axXL.png`.
- **evidence** Same medium-detent pin. At AX-XL the visible sheet ends inside the note editor ("…I need a little"); the tan **Send** pill is a clipped sliver at the sheet's bottom edge and **Cancel is not visible at all**. At `large` the same sheet fits (tree `GAP1-defer-axtree.json`: Send y=702.4, Cancel y=787.7 — both on screen), so this is purely the fixed detent.
- **why it matters** The client cannot send the message the sheet exists to send.
- **fix sketch** As GAP1-01.
- **effort** S (same fix)

### GAP1-03 · "Good evening." breaks mid-word on the Today home at accessibility text sizes
- **area** accessibility · **severity** major · **testerVisible** yes · **confidence** 0.95
- **where** Today home header (`DailyRoomView`). Shots `R19-control-plain-launch.png`, `R21-today-axXL.png` (independent reproduction at `accessibility-extra-large`).
- **evidence** The h1 greeting renders as five lines with two mid-word breaks: **"Goo / d / eve / ning / ."** The greeting is laid out in a column constrained by the icon cluster beside it, so the serif h1 is forced into ~150 pt of width and breaks inside words. Alongside it: the Studio chip truncates to **"Stu…"** while still drawing its "5" badge, and the date row "TUESDAY · SEP 1" wraps under the bell.
- **why it matters** The largest, most branded piece of type in the app becomes gibberish on the first screen a tester sees. It reads as broken, not as large-text support.
- **fix sketch** Give the greeting the full content width and move the bell/help/Studio cluster to its own row (or a toolbar) above it at `dynamicTypeSize >= .accessibility1`; the greeting should never share a horizontal band with the chip.
- **effort** M

### GAP1-04 · The "?" help glyph beside the greeting does not scale with Dynamic Type
- **area** accessibility · **severity** minor · **testerVisible** yes · **confidence** 0.85
- **where** Today home header. Shot `R21-today-axXL.png`.
- **evidence** At accessibility-extra-large every other element grows ~2.5× while the circled "?" next to "Good evening." stays at its base size (~16 pt), leaving it visually orphaned mid-air beside 60 pt type and giving it a tap target far under 44 pt.
- **fix sketch** Size the glyph with `@ScaledMetric`, or use a `Label` whose symbol inherits the text style.
- **effort** S

### GAP1-05 · The "Add my signature" toggle did not respond to three taps
- **area** money · **severity** major · **testerVisible** yes · **confidence** 0.6
- **where** `DecisionDetailView.swift:399-408` (`Toggle(isOn: $requireSignature)`). Shots `R30-consent-sig-on.png`, `R31-consent-sig-on.png`; tree `GAP1-consent-axtree.json`.
- **evidence** The switch is exposed as `CheckBox/AXSwitch`, `AXLabel "Add my signature, Type your full name to e-sign this approval."`, frame `{{31.04, 544.97},{339.91, 32.33}}`, `AXValue "0"`. Three `idb ui tap` events — at the switch glyph (342, 561), at the element's exact frame centre (201, 561), and once via the blitz driver — all left `AXValue` at `0` and the switch visually OFF. **The sheet was demonstrably interactive at the time**: a tap at (201, 621) on `decisionConsent.approve` fired immediately and resolved the decision (`R32-after-approve.png`).
- **why it matters** If real, the e-signature branch is unreachable and click-through is the only consent method the app can ever record — on a surface whose whole purpose is capturing consent per `client_decisions.client_consent_method` (00117).
- **caveat** Confidence held at 0.6: synthetic HID taps on SwiftUI `Toggle` can behave differently from a finger. **Needs one human tap to confirm or kill.**
- **fix sketch** If confirmed, give the row an explicit `.contentShape(Rectangle())` + `onTapGesture` toggle, or replace the compound label with a plain `Toggle("Add my signature", isOn:)` plus a separate hint line.
- **effort** S

### GAP1-06 · The consent sheet never shows what is being approved financially
- **area** money · **severity** major · **testerVisible** yes · **confidence** 0.95
- **where** `DecisionDetailView.swift:388-397` — the sheet renders `MonoLabel("CONFIRM YOUR CHOICE")`, `optionTitle`, and one sentence. Shots `R28-consent-medium.png`, `11-consent-sheet.png`.
- **evidence** The option card behind it reads "Shaker Oak · $680". The confirmation sheet reads only **"Shaker Oak"** — no price, no quantity ("Six chairs" per the decision body), no project, no date, no reference to the decision title. Copy in full: *"Approving sends your decision to your designer and unblocks any work waiting on it."*
- **why it matters** This is the click-through consent record. A homeowner confirms a $680 (×6 chairs) selection on a sheet that shows no number, and the stored consent has nothing tying it to an amount. On the Rug decision both options are $850, so even the card behind gives no differentiation.
- **fix sketch** Repeat option title + price (+ quantity, project, and the decision title) in the sheet, and add the one-line legal sentence that names what approval commits to.
- **effort** S

### GAP1-07 · "Cancel" on both decision sheets is a 17.6 pt tap target
- **area** accessibility · **severity** major · **testerVisible** partly · **confidence** 0.95
- **where** `DecisionDetailView.swift:438-441` and `DecisionDeferSheet.swift:67-70` — `PatinaButton(style: .ghost)`. Trees `GAP1-consent-axtree.json` (Cancel y=681.8 **h=17.6**) and `GAP1-defer-axtree.json` (Cancel y=787.7 **h=17.6**).
- **evidence** Measured heights of 17.6 pt against Apple's 44×44 pt minimum. Visually the `.ghost` style renders as bare left-aligned text while its sibling "Approve"/"Send" is a full-width filled pill — so the pair is inconsistent in both alignment and weight, and the dismiss affordance reads as an afterthought.
- **fix sketch** Give `.ghost` the same 44 pt min height and full-width frame as the other `PatinaButton` styles.
- **effort** S

### GAP1-08 · The auth screen's text links are all ~15–17 pt tall
- **area** accessibility · **severity** major · **testerVisible** partly · **confidence** 0.95
- **where** Welcome + Sign In screens. Measured via `idb ui describe-all`.
- **evidence** `"Have a password? Sign in"` **h=14.67**, `"Terms of Service"` **h=14.67**, `"Privacy Policy"` **h=14.67**, `"Forgot password?"` **h=17.0**, `"Use magic link"` **h=17.0**, `"Sign Up"` **h=17.0**. All far below 44 pt, and these are the first controls a TestFlight tester meets.
- **fix sketch** `.frame(minHeight: 44).contentShape(Rectangle())` on each.
- **effort** S

### GAP1-09 · The Sign In email and password fields have no accessibility label
- **area** accessibility · **severity** major · **testerVisible** no (VoiceOver only) · **confidence** 0.9
- **where** Sign In sheet. `idb ui describe-all` returns two `TextField` nodes (y=358.7 and y=428.7) with `AXLabel: None`.
- **evidence** Neither field carries a label; a VoiceOver user reaches two unlabelled text fields on the sign-in screen.
- **fix sketch** Add `.accessibilityLabel("Email")` / `"Password"` (or a real `label:` on `PatinaTextField`).
- **effort** S

### GAP1-10 · The defer sheet's note editor has no accessibility label
- **area** accessibility · **severity** minor · **testerVisible** no · **confidence** 0.9
- **where** `DecisionDeferSheet.swift:40-48` — the `TextEditor` carries `accessibilityIdentifier("decisionDefer.note")` but no label. Tree: `TextArea y=556.5 h=115.2 AXLabel None`.
- **fix sketch** `.accessibilityLabel("Your message to your designer")`.
- **effort** S

### GAP1-11 · Two identical black "Choose this" slabs dominate the decision detail
- **area** visual-system · **severity** major · **testerVisible** yes · **confidence** 0.85
- **where** `DecisionDetailView.swift:237-245, 271-279` — `HStack { price; Spacer(); PatinaButton(.primary) }`. Shots `R04-decision-detail.png`, `R25-decision-rug.png`.
- **evidence** `PatinaButton(.primary)` expands to fill, so each option card carries a ~272 pt near-black pill roughly 3× the visual weight of the option name it belongs to. Two of them stack, identical, competing for the eye; the price is squeezed to the far left in small type. On the Rug decision both prices are **$850**, so the two cards are visually indistinguishable apart from the option name.
- **why it matters** The screen's job is to help someone compare two choices. Instead the two commit buttons are the loudest thing on it, and the differentiating content (name, note, price) is the quietest.
- **fix sketch** Size the CTA to its content and right-align it, or move it to a full-width action below the pair with the selection made by tapping the card; let image/name/price carry the weight.
- **effort** M

### GAP1-12 · "Not yet" / "Neither of these" render as unstyled floating text
- **area** visual-system · **severity** minor · **testerVisible** yes · **confidence** 0.8
- **where** `DecisionDetailView.swift:296-322` (`deferralActs`). Shots `R04`, `R25`.
- **evidence** Two bare clay-coloured words sit alone in white space below the cards with no container, no divider and no icon — the only unstyled controls on an otherwise carefully composed screen. They read as leftover debug links rather than the two real answers the copy comment intends them to be. (Tap target itself is fine — measured h=44.)
- **fix sketch** Give the pair a quiet container or a labelled row ("Not ready to choose?") so they read as offered acts.
- **effort** S

### GAP1-13 · The consent sheet wastes ~40 % of its detent
- **area** visual-system · **severity** minor · **testerVisible** yes · **confidence** 0.9
- **where** `DecisionDetailView.swift:88` `.presentationDetents([.medium, .large])`. Shot `R28-consent-medium.png`; tree `GAP1-consent-axtree.json`.
- **evidence** At default text size the sheet spans y 410 → 874 (464 pt) but its content ends at Cancel (y 681.8 + 17.6 = 699). ~175 pt — about 40 % of the sheet — is empty cream below the last control.
- **why it matters** On a contractual sheet the emptiness reads as "something failed to load".
- **fix sketch** Content-driven detent (same fix as GAP1-01).
- **effort** S

### GAP1-14 · Raw `decision_type` enum values are shown to the client as pills
- **area** copy · **severity** minor · **testerVisible** yes · **confidence** 0.9
- **where** `DecisionListView.swift:78-86` — `Text(type.capitalized)`. Shot `R36-decision-list.png`.
- **evidence** Pills read **"Approval"** and **"Color"**. The column's DB values are `approval, color, product, material, substitution` (verified in `public.client_decisions`), so the client sees the internal taxonomy verbatim. "Color" on "Rug color - Natural vs Sand" merely repeats the title. `.capitalized` would also mangle any future multi-word or snake_case value.
- **fix sketch** Map the enum to client-facing labels (or drop the pill where it restates the title).
- **effort** S

### GAP1-15 · The Companion orb overprints and clips the Designer Seat on a full Today record
- **area** visual-system · **severity** major · **testerVisible** yes · **confidence** 0.8
- **where** Today home; orb frame is fixed at `{{169,724},{64,64}}` while the Designer Seat's y depends on how many rows the house record has. Shots `01-today-home.png`, `05-relaunch-home.png` (both OVERLAP window but the layout is not something another lane can fabricate).
- **evidence** With a 6-row record the seat sits at y=727.5 and the 64 pt orb lands on top of it: **"Leah Hart|"** and **"Aspen Loft Re|"** are cut mid-word by the orb. With a 5-row record (`R03-signin-form.png`, `R23-verify.png`) the seat clears it and reads fine.
- **why it matters** Content-dependent overlap — it will hit exactly the busiest testers, and it hides the designer's name, which is the emotional anchor of the screen.
- **caveat** Both captures are from the overlap window; I could not re-create a 6-row record afterwards (the "Leah Hartwell sent you a message" row had aged out). The *mechanism* — fixed orb position vs. content-driven seat position — is verifiable from either screenshot pair.
- **fix sketch** Reserve the orb's 64 pt band in the scroll content's bottom inset, or move the seat above it.
- **effort** S

### GAP1-16 · The Companion overlay lets backdrop text collide with the status-bar clock
- **area** companion · **severity** minor · **testerVisible** yes · **confidence** 0.7 · OVERLAP-ONLY
- **where** Companion panel presentation. Shot `06-companion-panel.png`.
- **evidence** With the panel open the dimmed Today content runs to y=0 and the word "Windsor" sits directly under the "9:41" clock, both illegible. The backdrop is dimmed but the status-bar region is not protected.
- **caveat** Observed once, during the overlap window; not re-run.
- **fix sketch** Extend the dimming scrim (or a blur) through the status-bar safe area.
- **effort** S

### GAP1-17 · The Companion promotes "Your recommendations" while 5 things need the user's eye
- **area** companion · **severity** minor · **testerVisible** yes · **confidence** 0.75 · OVERLAP-ONLY
- **where** Companion panel on Today. Shot `06-companion-panel.png`.
- **evidence** The panel's header reads "Where to next? · 5 things need your eye", and the **highlighted/suggested** row is "Your recommendations · BASED ON YOUR ROOMS". The five things needing the user's eye (an overdue decision, an unpaid $4,250 invoice, a proposal to review) are reachable only through the unhighlighted "Your studio" row. The panel also offers "Saved · NOTHING SAVED YET" — a row to an empty destination.
- **why it matters** The badge sets an expectation of urgency and the panel answers with merchandising.
- **fix sketch** Make the suggested row the top item from the "Awaiting you" set whenever the badge count is > 0.
- **effort** M

### GAP1-18 · "Browse pieces for the Audit Room B" — a definite article hard-coded before a user-named room
- **area** copy · **severity** minor · **testerVisible** yes · **confidence** 0.95
- **where** `apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:254` — `cta(primary: "Browse pieces for the \(room.name)")`. Shot `13-guest-today.png`.
- **evidence** Verbatim on screen: **"Browse pieces for the Audit Room B"**. The article is hard-coded, so it is wrong for any room whose name is a proper noun or already carries an article.
- **fix sketch** Drop the article: `"Browse pieces for \(room.name)"`.
- **effort** S

### GAP1-19 · Raw PostgREST error text is logged from SettingsService
- **area** performance-resilience · **severity** minor · **testerVisible** no · **confidence** 0.9
- **where** `SettingsService`. `research/GAP1-crash-02.log`.
- **evidence** Verbatim, twice per launch:
  `[SettingsService] user_settings fetch failed (may not exist yet): Cannot coerce the result to a single JSON object`
  `[SettingsService] notification_preferences fetch failed: Cannot coerce the result to a single JSON object`
  Also, once, `[Auth] [Auth/SessionStorage.live(clientID:):61] Failed to retrieve session: errSecItemNotFound: The item cannot be found.`
- **why it matters** Not tester-visible, but "may not exist yet" plus a PostgREST coercion string on **every** launch means a normal state is being handled as an error — noise that will mask a real fault in TestFlight logs.
- **fix sketch** Use `.maybeSingle()` and treat the empty row as the expected first-run state.
- **effort** S

### GAP1-20 · The defer sheet mixes dash styles inside one generated sentence
- **area** copy · **severity** polish · **testerVisible** yes · **confidence** 0.9
- **where** `DecisionDeferral.draft(decisionTitle:)`, rendered at `DecisionDeferSheet.swift:76-78`. Shot `R37-defer-sheet.png`.
- **evidence** Verbatim: **"About Rug color - Natural vs Sand — not yet. I need a little more time before I decide."** The interpolated title uses a hyphen, the template uses an em dash, so one sentence carries both.
- **fix sketch** Quote the title, or normalise the separator.
- **effort** S

### GAP1-21 · The pre-drafted note does not read as editable
- **area** copy · **severity** polish · **testerVisible** yes · **confidence** 0.7
- **where** `DecisionDeferSheet.swift:40-48`. Shot `R37-defer-sheet.png`.
- **evidence** The `TextEditor` is pre-filled and styled as a flat panel in the same secondary background used for read-only cards on the surrounding screens — no caret, no placeholder, no "edit" affordance, no character guidance. The copy above says "This goes to your designer as a message", implying it is fixed.
- **fix sketch** Give the editor a field treatment (border/focus ring) and a one-line hint such as "Edit before you send."
- **effort** S

---

## What is GOOD (calibration)

- **The resolved-decision state is excellent** (`R32-after-approve.png`): a sage `checkmark.seal.fill` with "You've responded to this decision", the chosen card gains a sage outline and a "Your choice" check, both CTAs and both deferral acts disappear, and "Discuss this with your designer" stays. Nothing is ambiguous about what just happened.
- **Live counts are honest.** After one approval the Studio hub moved 3 → 2 project choices and the orb caption 5 → 4 things, with no refresh.
- **Overdue is treated properly.** "Overdue · Aug 29" renders in red on both the list card and the detail header, matching the Studio hub — the SP-15 fix holds.
- **The decision list is calm and client-voiced** — eyebrow + serif title "Awaiting your call", project name, a 3-line description clamp, and a whole-card tap target with a combined VoiceOver label.
- **The defer sheet's premise is genuinely thoughtful**: two real human answers, a pre-drafted message, and honest copy — "This goes to your designer as a message. The decision stays open."
- **Deep-link routing is correct when the link reaches a running app**: `https://client.patina.cloud/decisions/<id>` landed on the right decision detail three times (`08`, `10`, `R04`).
- **Cold launch is fast and honest** — populated signed-in home at 0.7 s, with state restoration to the last screen.
- **The Today "Leah asked about…" row is a working one-tap route into the decision** (`R27`), which is the path a real tester takes.

---

## Coverage — completed / skipped

**Completed:** HID preflight · Companion orb → panel · Studio hub "Awaiting you" → Decisions ·
decision **list** · decision **detail** (top; the screen fits without scrolling at default size) ·
**consent sheet** (detent measured, legal copy quoted, signature affordance probed, orb-overprint
question answered — the orb is **absent** on both sheets, no overprint) · **defer sheet** ·
consent **and** defer sheets re-run at `content_size accessibility-extra-large` · fixed-height control
audit via AX frames · raw-error hunt (log + UI).

**Skipped / not verified:**
- **CG-1 · Deep-link from a cold app is untestable here.** `simctl openurl` with the universal link from a terminated state opened the Home Screen, not the app (`R14`); `patina://today` from cold left the app on the Welcome screen (`R17`). The simulator's `swcd` cannot validate the AASA the way a device does, so I cannot separate "app defect" from "simulator limitation". **Needs a device pass.** When the app was already running the same link routed correctly.
- **CG-2 · The signature text field was never reached** (GAP1-05 blocked it), so `PatinaTextField` validation (`canConfirm` needs ≥2 chars), the e-signature submit path, and `ConsentMethod.electronicSignature` are unverified.
- **CG-3 · The submit-failure banner** (`decisionDetail.failure`, `MoneyFailureCopy.decision`) was never triggered — the local backend answered every request. Its copy and its two acts are unverified on screen.
- **CG-4 · The "Send" path on the defer sheet** was not exercised (it would post a message into the local thread); the sheet's error state (`decisionDefer.error`) is unverified.
- **CG-5 · `hasNoRenderableOptions` / `DecisionOptionCopy.unavailableLine`** (the "blank cards" guard, SP-17) was not reachable — every seeded option has a name and a note.
- **CG-6 · Keyboard behaviour on the defer sheet** at `.medium` (whether the keyboard covers Send) was not tested.
- **CG-7 · Dark mode** on any decision surface — not run.

**Harness notes for other lanes**
1. `mcp__blitz-iphone__scan_ui` and `describe_screen` **relaunch the target app** on this clone and return a stale tree (they reported the Today home while the screenshot showed the Studio hub). `/Users/kody/.blitz/python/bin/idb ui describe-all|describe-point|tap|text|swipe --udid <U>` is accurate and does **not** disturb the app — use it.
2. Screenshot → point conversion: raw PNG is 1206×2622 px, logical screen 402×874 pt, so **pt = px / 3**.
