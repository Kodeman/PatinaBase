# Lane P — PRODUCTION (Strata) walker ledger

Device: clone "P" `BD8D6AC8-BA6C-484B-B819-6E671FA72D8D` (iPhone 17 Pro, iOS 26.5, fresh: erased + keychain reset).
Backend: **Strata PRODUCTION** (no launch arguments). Launch: `xcrun simctl launch BD8D6AC8-BA6C-484B-B819-6E671FA72D8D cloud.patina.app`.
Build: steward's signed Debug build, app code `d7287c3f8` (stamped `d7287c3f+`).
READ-ONLY: guest browsing + ONE sign-in attempt. No production writes.

## Step 1 — cold first launch (no arguments, PRODUCTION)

Launch t0 = 15:56:55.48. Timing shots (capture itself costs ~0.5 s, so intervals are ~1.05 s):
- t+1.26 s (`timing-1.png`) — **blank pure-WHITE screen, status bar hidden**, dark home indicator. Generated launch screen.
- t+2.32 s (`timing-2.png`) — cream (#faf6f0-ish) splash: greyed `PATINA` wordmark + hairline rule, status bar now visible.
- t+3.38 s (`timing-3.png` = `01-welcome-cold.png`) — Welcome home, fully interactive. Stable from here (shots 4–10 identical).

**Cold launch → first interactive frame ≈ 2.4–3.4 s** on a Debug simulator build. Release on device will be faster; recorded as a measurement, not asserted as a Release number.

Network on first launch: **only PostHog** (`us-assets.i.posthog.com/array/…/config`, `us.i.posthog.com/flags`, 3 calls). **Zero calls to Strata** (`bkvcixdmuyejfzcijpdg.supabase.co` never appears in the 45 s log) — the Welcome screen fetches nothing, which is correct.

Log grep (`research/P-log-launch.txt`, 1122 lines) for error|PGRST|401|403|404|406|decod|fail — only three real hits:
1. A ~450-line `[com.apple.coredata:error]` dump at t+0.17 s, ending `Recovery attempt while adding <NSPersistentStoreDescription…> (type: SQLite, url: …/Shared/AppGroup/…/Library/Application Support/default.store) was successful!` — the App-Group store directory does not exist on first install; CoreData self-heals.
2. `[com.patina.app:Supabase] [error] [Auth] [Auth/SessionStorage.live(clientID:):61] Failed to retrieve session: errSecItemNotFound: The item cannot be found.` ×2 — expected on a fresh keychain, logged at **error** level.
3. `canEvaluatePolicy:1 … Error … "No identities are enrolled."` — simulator has no Face ID enrolled (environment, not a finding).

**GOOD:** splash → welcome is a clean crossfade with no flash of unstyled content; the Welcome screen's typographic hierarchy (Canela-ish display serif wordmark + "Welcome home", warm-brown subhead) is genuinely handsome and reads premium; every control carries a stable `AXUniqueId`; the whole screen has real AX labels.

### P-01 — Launch screen is pure white; the app is cream. Visible flash on every cold launch.
- area first-run · severity minor · testerVisible true · confidence 0.95 · effort S
- where: `timing-1.png` (t+1.26 s) vs `timing-2.png` (t+2.32 s); pbxproj `INFOPLIST_KEY_UILaunchScreen_Generation = YES`
- evidence: the generated launch screen is white with the status bar hidden; the app's own splash is cream with the status bar shown. Two visible jumps in the first 2.5 s: white→cream, and status-bar-hidden→shown.
- why: the first second of the app is the first impression; a white flash into a cream brand canvas reads as a default Xcode template.
- fix: replace `UILaunchScreen_Generation` with a launch screen whose background colour is the app's canvas token, and match the status-bar treatment.

### P-02 — "Continue with email" uses an ✉️ emoji as its icon; "Continue with Google" uses a plain letter "G".
- area auth/visual-system · severity major · testerVisible true · confidence 0.98 · effort S
- where: Welcome home, `auth.welcome.emailButton` / `auth.welcome.googleButton`; `01-welcome-cold.png`
- evidence: `describe_screen` returns the AX labels **`"✉, Continue with email"`** and **`"G, Continue with Google"`**. The screenshot shows the colour-emoji envelope (greyish-white paper glyph) against the cream button, next to a correct Apple  glyph on the button above.
- why: three different icon idioms in one three-button stack — vector Apple mark, a typed letter, a colour emoji. The emoji is the single loudest "unfinished" tell on the app's first screen, and it also leaks into VoiceOver ("✉, Continue with email"). The bare "G" is additionally off Google's brand requirements for a "Continue with Google" button.
- fix: SF Symbol `envelope` (or a drawn mark) tinted to the ink token; ship the official Google "G" asset. Strip the glyph out of the accessibility label.

### P-03 — Terms of Service / Privacy Policy leave the app into full Safari, and land on a cookie-consent banner.
- area auth/copy/navigation · severity major · testerVisible true · confidence 0.95 · effort S
- where: `auth.welcome.termsLink` → `02-terms-link.png`, `03-terms-safari-cookiebanner.png`
- evidence: after the tap the status bar shows the "◀ Patina" return-to-app chip and the full Safari toolbar with `patina.cloud` — i.e. `UIApplication.open`, not `SFSafariViewController`. The page then presents the marketing site's GDPR banner: *"We use cookies to understand how you interact with Patina and improve your experience. See our Privacy Policy."* with **Decline / Accept**, sitting on top of and hiding the "1. Acceptance of Terms" heading. Full marketing chrome (logo + hamburger nav) is present.
- why: a tester reading terms during sign-up is ejected from the app, then asked for cookie consent by a website. It breaks the native spell at the exact moment trust is being asked for, and returning requires the tiny status-bar chip.
- fix: present both documents in an in-app `SFSafariViewController` (or a native reader), and serve an app-scoped legal route with no site chrome and no cookie banner.

## Step 2 — guest path

Guest entry = `auth.welcome.guestButton` labelled **"Look around first →"**. It does NOT lead to browsing. It leads to a 3-page intro carousel and then a mandatory 5-question style quiz.

### P-04 — "Look around first" is a trap: 3 intro pages + a 5-question quiz, with no Back, no Close and no working Skip.
- area onboarding/navigation · severity major · testerVisible true · confidence 0.95 · effort M
- where: `05-…-1.png` → `08-style-q1.png`; `Onboarding.SkipButton`, `Onboarding.PrimaryButton.{0,1,2}`
- evidence: intro pages 1 and 2 carry `Onboarding.SkipButton` whose AX help reads **"Skips the introduction and continues to style questions."** — Skip does not skip the quiz. Intro page 3 has **no** Skip: `scan_ui` returns exactly one element, `Onboarding.PrimaryButton.2 "Let's begin"`. Quiz Q1 `scan_ui` returns **only the four option buttons** — no Back, no Close, no Skip. There is no gesture back either (the pages are not a `NavigationStack` push).
- why: the button promised "look around first". A tester who wanted to browse the catalogue is instead locked into eight sequential screens with the app's own back-swipe unavailable; the only exit is force-quit, and on the next launch it starts over.
- fix: let "Look around first" land on the browse grid; move the quiz behind a dismissible "Find your style" entry point, and give every quiz screen a Back and a Close.

### P-05 — Colour emoji are used as production iconography in the style quiz and on the auth screen.
- area visual-system/accessibility · severity major · testerVisible true · confidence 0.99 · effort M
- where: quiz Q2 (`09-style-q2.png`, `10-style-q2-selected.png`); Welcome (`01-welcome-cold.png`)
- evidence: `scan_ui` AX labels are literally `"🍷, Love having people over, Entertaining & gathering"`, `"🧘, My quiet sanctuary, Rest & recharge"`, `"💻, Work from this room, Productivity & focus"`, `"👨‍👩‍👧, Family central, Activity & play"`, `"📚, Personal retreat, Reading & reflection"`, and on Welcome `"✉, Continue with email"`. The 👨‍👩‍👧 family emoji renders on iOS 26 as a **blue rounded square with white silhouettes** — it reads as a broken or foreign asset against the cream/ink palette.
- why: the app's whole visual argument is restraint — cream ground, display serif, warm neutrals. Five saturated Apple emoji in a vertical list detonate it, and the blue family glyph looks like a missing image. It is also read aloud by VoiceOver ("wine glass, Love having people over").
- fix: replace with SF Symbols or drawn marks tinted to the palette; strip glyphs from accessibility labels.

### P-06 — Q1 auto-advances on tap; Q2 requires a selection then Continue. Two interaction models in consecutive questions.
- area onboarding · severity minor · testerVisible true · confidence 0.9 · effort S
- where: `08-style-q1.png` (no Continue anywhere in `scan_ui`) vs `09-style-q2.png` (`companion.quiz.continue`, `enabled: false`)
- evidence: Q1's `scan_ui` returns four option buttons and nothing else — tapping "Warm Minimal" advanced immediately. Q2 returns the five options **plus** a disabled `companion.quiz.continue`.
- why: the tester learns "tap = next", then on the second question the tap appears to do nothing and they must find a low-contrast disabled button.
- fix: one model for the whole quiz.

### P-07 — A non-interactive "Next question →" label sits directly above the Continue button.
- area onboarding/copy · severity minor · testerVisible true · confidence 0.9 · effort S
- where: `10-style-q2-selected.png`, dark progress card
- evidence: after selecting an answer the card shows the text **"Next question →"** left-aligned with a trailing arrow, and immediately beneath it the filled **"Continue →"** button. `scan_ui` lists only `companion.quiz.continue` — "Next question →" is **static text**, not a control, despite being styled as a link with an arrow.
- why: two forward affordances, one of them fake; taps on it do nothing.
- fix: delete the label, or make it the button's own title.

### P-08 — The selected quiz row shrinks permanently (0.97 scale) and never reports its selected state to VoiceOver.
- area onboarding/accessibility/visual-system · severity minor · testerVisible true · confidence 0.95 · effort S
- where: `10-style-q2-selected.png`; `scan_ui` frames
- evidence: unselected rows are `{{24, y}, {354, 67}}`. The selected row is `{{29.31, 288.005}, {343.38, 64.99}}` — 343.38 / 354 = **0.97**. The row is visibly narrower and shorter than its siblings and stays that way. No option button exposes a selected trait: every one returns `AXValue: null` with no "selected" in `role_description`.
- why: the list loses its edge alignment at exactly the moment the tester commits; a VoiceOver user cannot hear which answer is chosen.
- fix: keep the frame and express selection with fill/ink only; add `.accessibilityAddTraits(.isSelected)`.

### P-09 — Onboarding hero art is abstract placeholder blocks; page 3 is a flat grey panel with a generic 4-square symbol.
- area onboarding/visual-system · severity major · testerVisible true · confidence 0.85 · effort L
- where: `05-…-1.png`, `06-…-2.png`, `07-…-3.png`
- evidence: page 1 = tan gradient with three grey/tan rounded rectangles; page 2 = sage gradient with a large grey rounded rectangle containing a tan rectangle; page 3 = **flat grey** panel, a `square.grid.2x2`-style symbol in a rounded square and a "✦ Five quick questions" pill. Quiz Q1's four "palettes" are single linear gradients — "Warm Minimal" and "Eclectic Curated" are near-identical tans and "Classic Comfort" is a near-white grey that barely separates from the cream page.
- why: the app sells furniture on the strength of how things look. The first three full-screen images a tester sees are wireframe blocks, and page 3 is an empty grey rectangle. It reads as art that never shipped.
- fix: real photography or crafted illustration; make the palette swatches actual multi-swatch palettes.

### P-10 — Onboarding CTAs use three different capitalisation conventions in three consecutive screens.
- area copy · severity minor · testerVisible true · confidence 0.95 · effort S
- where: `05/06/07-guest-onboarding-*.png`
- evidence: **"Start Your Journey"** (Title Case), **"Continue"**, **"Let's begin"** (sentence case) — three screens in a row. "Start Your Journey" is also generic startup copy against Patina's otherwise specific voice ("Welcome home", "Start with a piece you love").
- fix: sentence case everywhere; replace "Start Your Journey".

### P-11 — Straight ASCII apostrophes in body and button copy, next to correct curly ones elsewhere.
- area copy/visual-system · severity polish · testerVisible true · confidence 0.9 · effort S
- where: intro pages 1 and 3
- evidence: AX text is `"Let's discover yours. Walk your space, …"` and the button `"Let's begin"` — straight `'`. Page 2's body uses a correct typographic apostrophe: `"A guided scan records the room's shape…"`.
- why: in a display-serif brand a straight apostrophe is visible; mixing both inside one flow is worse than either.
- fix: audit strings for `'` and `"`.

### P-12 — Onboarding progress chrome states the same fact three times.
- area onboarding/copy · severity polish · testerVisible true · confidence 0.9 · effort S
- where: `08-style-q1.png`, `09-style-q2.png`
- evidence: one dark card carries **"Question 1 of 5"**, **"STEP 1 OF 5"** (monospaced, letterspaced) and **"20%"**, plus a progress bar — four representations of one number in ~100 pt of height. Intro page 3's hero pill "✦ Five quick questions" is repeated verbatim as the first four words of the body copy underneath it.
- fix: keep the bar and one label.

**GOOD:** the selected-row inversion (dark fill, white text) is confident and legible; intro page 2's copy — *"A guided scan records the room's shape and a few reference photos on this iPhone. Or enter the room details yourself."* — and page 3's *"Your camera comes later — only when you choose to scan a room."* are honest, specific, anxiety-reducing, and correctly use an em dash; the italic serif section titles ("Your visual style", "How you live") are a lovely touch.

### P-13 — The style-quiz progress bar reads 100% while question 5 is still unanswered.
- area onboarding/state-honesty · severity minor · testerVisible true · confidence 0.98 · effort S
- where: `13-style-q5.png`
- evidence: the card reads **"Question 5 of 5"**, **"STEP 5 OF 5"**, **"100%"** and a fully filled bar, while the four options are untouched and `companion.quiz.continue` is `enabled: false`. Q1 showed 20% before anything was answered, so the bar counts *the question you are looking at*, not work done.
- why: a full bar that still demands an answer is a small lie; a tester who reads "100%" and finds a dead Continue thinks the app is stuck.
- fix: progress = answered / total (0% … 100% on submit), or drop the percentage and keep "5 of 5".

### P-14 — Icon set inside a single quiz question mixes colour emoji with typographic glyphs at different weights.
- area visual-system · severity major · testerVisible true · confidence 0.95 · effort M
- where: `12-style-q4.png` (Q4), `13-style-q5.png` (Q5)
- evidence: Q4's four rows are iconed **🌱 (bright green emoji)**, **✦ (thin black text glyph)**, **◆ (heavy black text glyph)**, **💬 (grey-white emoji)** — two emoji and two typographic characters of visibly different optical weight, in one four-row list. Q5's are **🏠**, **✨**, **🔄** and **💎**; 🔄 renders on iOS 26 as a **blue rounded square** and 💎 as a saturated cyan gem.
- why: there is no icon system at all here — it is whatever character was to hand. On a screen asking a stranger how much money they will spend, it reads as amateur.
- fix: one drawn/SF-Symbol set, one weight, one tint.

### P-15 — Quiz "materials" and "palettes" are flat colour chips; several are indistinguishable from each other.
- area onboarding/visual-system · severity major · testerVisible true · confidence 0.9 · effort M
- where: `08-style-q1.png` (Q1), `11-style-q3.png` (Q3)
- evidence: Q3 asks **"Which material draws you in?"** and offers five solid rounded squares: "Weathered Oak" (brown), "Soft Linen" (near-white), "Aged Leather" (tan), "Brushed Metal" (grey), "Woven Rattan" (tan). "Aged Leather" and "Woven Rattan" are near-identical tans; "Soft Linen" is a near-white square on a cream page. Q1's four "palettes" are single linear gradients, and its "Classic Comfort" chip is a near-white grey that barely reads against the cream ground.
- why: a furniture app asking about *material* while showing no texture is asking the tester to answer blind; two visually identical chips make the choice arbitrary.
- fix: real material photography (or at minimum a texture pattern) per chip; multi-swatch palettes for Q1.

### P-16 — Some questions auto-advance and some need Continue, with no signal that the difference is single- vs multi-select.
- area onboarding · severity minor · testerVisible true · confidence 0.85 · effort S
- where: Q1/Q3/Q4 (no Continue in `scan_ui`) vs Q2/Q5 (`companion.quiz.continue`)
- evidence: Q1 "Which palette", Q3 "Which material", Q4 "Let's talk about investment" advanced on a single tap; Q2 "How do you actually live in your space?" and Q5 "What's driving your design journey?" render a Continue button. Nothing on Q2 or Q5 says "choose all that apply" or "select up to N".
- why: the tester cannot predict what a tap will do, and on Q2/Q5 the first tap looks like it did nothing.
- fix: label multi-select questions explicitly, and keep one advance model.

### P-17 — The quiz asks a stranger for their budget as question 4 of 5, before showing a single product.
- area onboarding/copy · severity minor · testerVisible true · confidence 0.7 · effort M
- where: `12-style-q4.png`
- evidence: heading **"Let's talk about investment"**, options **"Thoughtful Starter $500 – $2,000 per room"**, **"Curated Comfort $2,000 – $5,000 per room"**, **"Heirloom Investment $5,000+ per room"**, **"Let's Discuss / I'd like designer guidance"**. This is reached from a button labelled "Look around first", before any catalogue is visible.
- why: asking for spend before delivering any value is the classic drop-off point, and a tester invited to "look around" reasonably reads it as a sales gate.
- fix: move the budget question after the first browse, or make it skippable with a plain "Not sure yet".

**Coverage note:** Q5 was reached but deliberately **not answered** — completing the quiz writes preferences, and lane P is read-only against production. Everything downstream of quiz submission (the result/reveal screen, whatever "look around" finally lands on for a quiz-completing guest) is therefore **not verified in lane P**; lanes A/B cover it on the local stack.

## Step 4 (taken early, because it was the only way out of the quiz) — second and third cold relaunch

Relaunch = `xcrun simctl terminate … && xcrun simctl launch BD8D6AC8-… cloud.patina.app` (no arguments), 4 s settle.

| launch | root shown |
|---|---|
| 1st (fresh install) | **Welcome home** (auth root) — `01-welcome-cold.png` |
| 2nd (after one "Look around first" tap + 4 quiz answers) | **Guest intro page 1 of 3** — `14-relaunch2-root.png` |
| 3rd | **Guest intro page 1 of 3** — `16-relaunch3-root.png`, `describe_screen` identical to the 2nd |

No module changed between the 2nd and 3rd launch (the PostHog payload being cached made no visible difference — every flag stayed off, the root stayed the guest intro). Nothing in the app surfaced a flag-driven variant.

### P-18 — After one tap on "Look around first", the sign-in screen is unreachable on every later launch, and the quiz restarts from zero each time. (BLOCKER for an invited tester.)
- area first-run/auth/navigation · severity blocker · testerVisible true · confidence 0.9 · effort M
- where: `14-relaunch2-root.png`, `15-skip-destination.png`, `16-relaunch3-root.png`
- evidence: launch 1 shows the auth root with Apple / Google / email / "Have a password? Sign in". After tapping `auth.welcome.guestButton` once and answering questions 1–4, `terminate` + `launch` lands on the **guest intro carousel, page 1**, not the Welcome screen. A third cold launch does the same; `describe_screen` returns the same seven nodes both times, and the only controls are `Onboarding.SkipButton` and `Onboarding.PrimaryButton.0 "Start Your Journey"`. `Onboarding.SkipButton` leads to **quiz Q1 at "STEP 1 OF 5 · 20%"** (`15-skip-destination.png`) — the four answers given before the relaunch are gone.
- why: Kody's first-round testers are invited homeowners who have an account waiting. A tester who taps the "look around first" option out of curiosity and then backgrounds or force-quits the app can no longer find Sign in with Apple, Google, email or password on any subsequent launch, and is dropped into a five-question quiz that resets every time. There is no Back, no Close and no "I already have an account" anywhere in that flow. From the tester's side this is "the app won't let me log in".
- fix: (a) persist quiz progress; (b) put a persistent "I already have an account · Sign in" affordance on every guest onboarding and quiz screen; (c) make the guest flow dismissible back to the Welcome root.
- **verification limit:** whether completing the quiz eventually restores a sign-in route is **not verified in lane P** — completing the quiz writes preferences and lane P is read-only against production. Lanes A/B on the local stack should close this.

## Step 3 — sign-in attempt (tester@patina.cloud + 000000) — **FAILED**

Flow: Welcome → `auth.welcome.emailButton` → sheet "Continue with email" → typed `tester@patina.cloud` → `auth.form.primaryButton "Email me a code"` → OTP screen appeared instantly (<1 s) → typed `000000` into `auth.otp.tokenField` → `auth.otp.verifyButton "Verify"`.

**Result: rejected.** Error copy, verbatim: **"Token has expired or is invalid"**.
Log evidence (`research/P-log-signin.txt`): `Task <96F99D42-…>.<2> received response, status 403 … transaction_duration_ms=103`. The app renders GoTrue's message unmapped.

Conclusion for the program: **the portal's `000000` test-login fallback does NOT apply in-app on production.** A tester without access to the tester@patina.cloud inbox cannot sign in through the app. (Prod `auth.users` confirms the account exists and is confirmed: id `86cdd0aa-403c-4154-ae63-69105425e506`, `email_confirmed_at` set, `last_sign_in_at` 2026-09-01 20:09 UTC.)
**Everything behind sign-in — Today, Spaces/Rooms, Saved, Studio, Settings, Sign out — is therefore NOT verified in lane P.** Lane C covers the signed-in surfaces on the local stack.

### P-19 — The disabled state of every primary button is the brand's tan accent; the enabled state is ink. Disabled looks more actionable than enabled.
- area visual-system/auth · severity major · testerVisible true · confidence 0.98 · effort S
- where: `19-email-form.png` / `22-email-valid-enabled.png` (`auth.form.primaryButton`), `23-code-requested-t0.png` / `25-code-entered.png` (`auth.otp.verifyButton`)
- evidence: with an empty field, `scan_ui` reports `auth.form.primaryButton … enabled: false` and the button is rendered as a **fully saturated tan fill with white text**. After a valid address is typed the same button reports `enabled: true` and turns **near-black**. Identical inversion on `auth.otp.verifyButton`. White-on-tan measures roughly 2.2:1 — below WCAG AA for body text.
- why: the tester's eye is drawn to the coloured button, which is the dead one; they tap it, nothing happens, no message appears (see P-20). Then the button they *can* press is the quiet dark one.
- fix: disabled = reduced-opacity ink; enabled = the accent (or ink) at full strength; never use the brand accent as the disabled token.

### P-20 — An invalid email produces no message at all — the button just silently does nothing.
- area auth/state-honesty · severity major · testerVisible true · confidence 0.95 · effort S
- where: `20-email-malformed.png`
- evidence: typed `tester@@patina`. `auth.form.primaryButton` stayed `enabled: false`, and the screen showed **no** inline validation text, no field colouring, no helper copy — the sheet is pixel-identical to the empty state except for the typed characters.
- why: this is the exact experience of a tester who mistypes their address. Nothing tells them what is wrong; the button looks live (P-19) and does nothing.
- fix: inline validation copy under the field ("That doesn't look like an email address"), and a visibly inert disabled state.

### P-21 — The OTP failure surfaces a raw backend string: "Token has expired or is invalid".
- area auth/copy · severity major · testerVisible true · confidence 0.99 · effort S
- where: `26-verify-t0.png`, `28-verify-t5.png`; log `research/P-log-signin.txt` (403 in 103 ms)
- evidence: the red banner reads exactly **"Token has expired or is invalid"** — GoTrue's `otp_expired` message, passed through unmapped. The word "token" is developer language; a homeowner was told to expect a "6-digit code".
- why: raw backend copy is the single clearest "this is not finished" signal, and it is on the screen a tester hits when their code is stale or mistyped — the most likely failure in the whole app.
- fix: map GoTrue error codes to Patina copy, e.g. "That code didn't work. It may have expired — request a new one." with the resend action attached to the message.

### P-22 — After a failed code the screen shows the success banner and the error banner at once, and the Verify button is pushed off the bottom of the sheet.
- area auth/state-honesty/visual-system · severity major · testerVisible true · confidence 0.95 · effort S
- where: `26-verify-t0.png`, `28-verify-t5.png`
- evidence: the green banner **"✉ We emailed you a 6-digit code"** remains on screen directly above the red **"Token has expired or is invalid"**. The two banners have different widths and alignments — the green one is full-bleed to the sheet's 24 pt gutters, the red one is centre-inset and much narrower. Both push the layout down: in `28-verify-t5.png` the **Verify button is clipped by the bottom of the sheet** and "Resend code" is below the fold, so after a failure the primary action is no longer fully visible without scrolling.
- why: contradictory simultaneous states, and the recovery control gets pushed out of reach at the moment the tester needs it.
- fix: one status region that replaces its contents; keep the CTA pinned.

### P-23 — Semantic system green and system red are dropped into the warm palette, and both banners fail contrast.
- area visual-system/accessibility · severity minor · testerVisible true · confidence 0.9 · effort S
- where: `23-code-requested-t0.png`, `26-verify-t0.png`
- evidence: the success banner is bright system-green text on a pale-green fill with a **colour 📧 emoji**; the error banner is system-red on pale red. Nothing else in the app uses either hue — the whole system is cream / ink / warm tan / sage. Both banner texts are light-on-light-tint and read at roughly 2.5:1.
- fix: warm success/error tokens drawn from the palette, at AA contrast, with drawn marks instead of an emoji.

### P-24 — A giant "#" character is the illustration for the sign-in-code screen.
- area auth/visual-system · severity minor · testerVisible true · confidence 0.9 · effort S
- where: `23-code-requested-t0.png`
- evidence: the screen's hero mark is a ~90 pt display-serif **`#`** glyph. It is the only "illustration" on the screen.
- why: it reads as a stand-in for artwork that was never made.
- fix: a drawn mark, or drop the hero and lead with the heading.

### P-25 — The OTP field's placeholder is "000000", it is exposed as the field's accessibility value, and a filled field looks almost identical to an empty one.
- area auth/accessibility · severity minor · testerVisible true · confidence 0.95 · effort S
- where: `23-code-requested-t0.png` vs `25-code-entered.png`; `scan_ui` → `auth.otp.tokenField … AXValue: "000000"` **while empty**
- evidence: the empty field's `AXValue` is the string `000000`, so VoiceOver announces a code that is not there. Visually, empty and filled differ only in text opacity — same glyphs, same position, same font.
- fix: real placeholder handling (`AXValue` empty, `accessibilityLabel` "Sign-in code"), and either six separate digit boxes or a clearly distinct filled state. A placeholder that is not itself a plausible code would also help.

### P-26 — The email sheet stacks two full screens: the "Continue with email" header stays above the "Enter your sign-in code" screen.
- area auth/navigation · severity minor · testerVisible true · confidence 0.9 · effort S
- where: `23-code-requested-t0.png`
- evidence: after requesting the code, the sheet still shows the Patina mark, **"Continue with email"** and **"We'll email you a sign-in code — no password needed"**, and *below* them a second hero (`#`), a second title **"Enter your sign-in code"** and a second subtitle **"Enter the 6-digit code from your email"**. Two titles and two subtitles in one sheet.
- fix: replace the sheet's content on step change (or push), instead of appending.

### P-27 — "Sign in with Apple" is offered twice in two consecutive screens, and inside the sheet it outweighs the sheet's own primary action.
- area auth/visual-system · severity minor · testerVisible true · confidence 0.9 · effort S
- where: `19-email-form.png`
- evidence: the Welcome screen's top button is "Sign in with Apple"; the "Continue with email" sheet repeats a full-width black "Sign in with Apple" below its own tan "Email me a code". The black Apple button is the visually heaviest element on a sheet whose entire purpose is the email path.
- fix: drop the Apple button from the email sheet, or demote it.

**GOOD:** the code request round-trips in well under a second and the OTP screen echoes the address back (**"tester@patina.cloud"**) so a typo is catchable; "We'll email you a sign-in code — no password needed" is clear, correctly em-dashed, reassuring copy; the 60-second resend cooldown is honest and counts down live (`auth.otp.resendButton` label updates "Resend code in 51s" → "19s" → "Resend code"); the email field's icon here is a properly **drawn** line-art envelope in the brand brown — which is what makes the emoji on the Welcome button (P-02) an inconsistency rather than a missing asset.

## Step 3b — password path, error leak, and the causal chain into the guest trap

### P-28 — Wrong password surfaces a second raw backend string: "Invalid login credentials".
- area auth/copy · severity major · testerVisible true · confidence 0.99 · effort S
- where: `31-password-sheet.png` → `32-wrongpw-t0.png`, `33-wrongpw-t3.png`
- evidence: `tester@patina.cloud` + `wrongpassword123` → a red banner reading exactly **"Invalid login credentials"** — GoTrue's `invalid_credentials` message, unmapped. No recovery guidance is attached; "Forgot password?" sits ~180 pt lower in a separate footer row and is not linked from the error.
- fix: "That email and password don't match. Reset your password?" with the reset action inline.

### P-29 — After Cancel, the sign-in error string LEAKS onto the Welcome screen — and the resulting 33 pt layout shift makes the tester tap "Look around first" when they aim for "Sign in".
- area auth/navigation/visual-system · severity **blocker** · testerVisible true · confidence 0.95 · effort S
- where: `34-cancel-from-password.png`, `35-welcome-shifted-33pt.png`; scanned frames before/after
- evidence: after the failed password sign-in I tapped Cancel. The sheet dismissed to the Welcome screen — and **"Invalid login credentials" is rendered in red on the Welcome screen**, as bare unbannered text between "Start with a piece you love" and the Sign in with Apple button (`35-welcome-shifted-33pt.png`). It has no dismiss and no context. Inserting that line pushes the whole auth stack down **exactly 33 pt**:

  | control | fresh Welcome | after the leak |
  |---|---|---|
  | `auth.welcome.appleButton` | y 324.33 | y 357.33 |
  | `auth.welcome.googleButton` | y 385.58 | y 418.58 |
  | `auth.welcome.emailButton` | y 447.58 | y 480.58 |
  | `auth.welcome.guestButton` | y 552.25 **(552.25–603.75)** | y 584.92 **(584.92–636.42)** |
  | `auth.welcome.passwordButton` | y 619.00 **(619.00–633.67)** | y 651.67 |
  | Terms / Privacy footer | y 785.33 | y 785.33 *(unmoved)* |

  I then tapped y = 626 — the centre of "Have a password? Sign in" **on the screen as the tester last saw it**. With the stack shifted, 626 now falls inside **`auth.welcome.guestButton` "Look around first"** (584.92–636.42). The app went straight into the guest onboarding carousel, and from there — per P-18 — the sign-in screen was gone on every subsequent launch (`30-relaunch-after-cancel.png` shows the guest intro as the root; `scan_ui` returns only `Onboarding.SkipButton` and `Onboarding.PrimaryButton.0`).
- why: this is one continuous, entirely plausible tester journey — mistype a password, cancel, reach for "Sign in" — and it ends with the tester permanently locked out of sign-in. I hit it by accident, not by trying to break the app.
- fix: do not render sheet errors on the root; if the root must show a status, reserve its space so nothing moves. Independently, fix P-18 so the guest flow is escapable.
- **control experiments** (both clean, on freshly reset installs): Cancel from the *email-entry* step → Welcome, unshifted (`21-after-cancel.png`); Cancel from the *OTP* step with no failed verify → Welcome, unshifted, no leak (`37-cancel-from-otp.png`). The leak is specific to a **failed** attempt.

### P-30 — One mechanism, three names: "Continue with email", "sign-in code", "magic link" — and "magic link" is wrong.
- area copy · severity minor · testerVisible true · confidence 0.95 · effort S
- where: `31-password-sheet.png` footer; `19-email-form.png`; `23-code-requested-t0.png`
- evidence: the Welcome button says **"Continue with email"**; the sheet says **"We'll email you a sign-in code"** and **"Email me a code"**; the password sheet's footer offers **"Use magic link"**. The app sends a **6-digit code**, not a link — "magic link" is both jargon and factually wrong here.
- fix: one name everywhere ("Email me a code" / "sign-in code").

### P-31 — "Sign In" / "Sign Up" are Title Case while the rest of the auth surface is sentence case.
- area copy · severity polish · testerVisible true · confidence 0.9 · effort S
- where: `31-password-sheet.png`
- evidence: heading **"Sign In"**, button **"Sign In"**, link **"Sign Up"** (`auth.form.modeSwitcherButton`), against "Continue with email", "Welcome home", "Look around first", "Have a password? Sign in" (sentence case, same screen family). "Don't have an account?" also uses a straight apostrophe.

### P-32 — iOS offers "Save Password?" after a sign-in that FAILED.
- area auth · severity polish · testerVisible true · confidence 0.85 · effort S
- where: `34-cancel-from-password.png`
- evidence: after `wrongpassword123` was rejected, the system AutoFill sheet **"Save Password? — Securely store your password so it's filled automatically the next time you need it."** appeared over the Welcome screen.
- why: the app is inviting the keychain to memorise a password that does not work.
- fix: only signal a successful credential to AutoFill (`SecAddSharedWebCredential` / the `.newPassword` flow) after the sign-in succeeds.

## Step 5 — guest deep link

`xcrun simctl openurl BD8D6AC8-… "https://client.patina.cloud/piece/a7fa2107-8d2e-4131-8b8f-f5dd9826fdac"` (a **real, anon-visible** catalog product id, obtained by a read-only query against Strata — see P-33).

### P-33 — A universal link to a piece opens the app and then does nothing at all.
- area widget-deeplinks/navigation/state-honesty · severity major · testerVisible true · confidence 0.9 · effort M
- where: `17-deeplink-piece-guesttrapped.png` (guest-onboarding state), `38-deeplink-piece-from-welcome.png` (Welcome state); `research/P-log-deeplink.txt`
- evidence: run twice, from two different app states. Both times the app came to the front and **stayed exactly where it was** — the guest intro carousel in one case, the Welcome screen in the other. No product opened, no sheet, no toast, no "sign in to see this piece", no queued destination. The 90 s app log contains no `NSUserActivity` / `continueUserActivity` / `client.patina.cloud` line at all.
- why: AASA is live and lists `/piece/*` for this team, so a designer texting a client a Patina link produces exactly this: the app opens onto a generic welcome and the piece never appears. The tester concludes the link is broken.
- fix: handle `NSUserActivity` for the AASA paths; if the destination needs auth, hold it and resolve it after sign-in; if it cannot be shown, say so.
- **not verified:** whether the link resolves for a signed-in user (lane P could not sign in).

## Cross-cutting checks on the auth root

### P-34 — At the largest Dynamic Type size the first screen collapses: every button label truncates and text breaks the gutters, with no scroll.
- area accessibility/visual-system · severity major · testerVisible true · confidence 0.98 · effort M
- where: `40-welcome-ax3xl.png` (`xcrun simctl ui … content_size accessibility-extra-extra-extra-large`)
- evidence: **"Start with a piece…"**, **"Continue with…"** (Google), **"Continue wit…"** (email), **"Look around f…"**, **"Have a password? S…"**, **"By continuing, y…"**, **"Term… and Priva…"** — every one truncated. "Have a password? S…" and "Welcome home" run edge-to-edge with **no left gutter** (x starts at ~0 instead of 24). The legal links are unreadable, so a tester at this size cannot read the terms they are agreeing to. The screen does not scroll — nothing can be reached by scrolling. The **Sign in with Apple** label alone did not scale, so it is now the smallest text on a screen where everything else is enormous.
- fix: `ScrollView` fallback above `.accessibility1`, `minimumScaleFactor` / multi-line on button labels, stacked legal links, and let the Apple button scale with the rest.

### P-35 — In dark mode the primary CTA is pure black on a near-black ground.
- area visual-system/accessibility · severity minor · testerVisible true · confidence 0.9 · effort S
- where: `39-welcome-dark.png` (`xcrun simctl ui … appearance dark`)
- evidence: the page ground is a warm near-black (~#221E1B) and the "Sign in with Apple" button is filled **#000** — the app's single most important control reads as a darker hole rather than a raised button, while the two outlined buttons beneath it are the most visible elements on the screen. Apple's own guidance is the white/outline Apple button on dark grounds.
- fix: switch the Apple button style with the colour scheme.

**GOOD (dark mode):** apart from the Apple button, dark mode is properly done and genuinely handsome — warm near-black ground rather than pure black, cream wordmark, the gold rule preserved, hairline-outlined secondary buttons, warm-brown secondary text. Nothing was hard-coded light, nothing lost contrast. This is real work, not a `.preferredColorScheme` afterthought.

## Production data (read-only queries against Strata, no writes)

### P-36 — The production catalogue a tester can actually see is ONE product, named "Smoke Test Ceramic Lamp", priced $20.00, with no photograph.
- area prod-readiness · severity **blocker** · testerVisible true · confidence 0.95 · effort L
- where: Strata `public.products` + its RLS policies (read-only `execute_sql`)
- evidence: `public.products` holds **15** rows. The anon-read policy is `products_catalog_select_anon USING (layer = 'catalog')`, and the authenticated policy is the same plus each user's own `layer='personal'` rows — so a guest **or** a brand-new signed-in tester sees only `layer='catalog'`. Counting those: `anon_visible_total = 1`, `anon_published = 1`, **`anon_with_images = 0`**. The single row is `a7fa2107-8d2e-4131-8b8f-f5dd9826fdac` — **"Smoke Test Ceramic Lamp"**, status `published`, category `lighting`, `price_retail = 2000` (= $20.00), zero images.
- why: the entire product experience — browse grid, product detail, recommendations, saving, the purchase path — has nothing to render for a first-round tester. Whatever the empty state looks like, that is the app.
- fix: seed a real catalogue (`layer='catalog'`, published, with images) before the TestFlight round.

### P-37 — The other 14 production product rows are test junk, duplicates and mis-categorised captures, including a row named after UI copy.
- area prod-readiness · severity major · testerVisible false *(hidden by RLS today — but one promotion to `layer='catalog'` makes it tester-visible)* · confidence 0.95 · effort M
- where: Strata `public.products`
- evidence, verbatim `name` values: **"Laptop"** (category `storage`, no price, no images), **"new talble"** (sic, `in_review`), **"test"** (`draft`, $6,000.00), **"ZZ QA West Elm Chair"**, **"UX Audit — Custom reading chair"**, **"Smoke Test Ceramic Lamp"**, and **"Find a piece—or ask about one."** — a row whose name is a line of interface copy, `published`, $50.00, with 6 images. **"Line Credenza, Large – Design Within Reach"** appears **twice** with identical `price_retail` (377650) and 10 images each. Category assignment is broken: "PH5 Pendant Lamp" is `chair`; nine pieces of furniture and lighting are all `decor`.
- why: these rows sit one `layer` flip away from being the catalogue; the duplicate credenza and the copy-as-a-product row would ship straight into the tester's grid.
- fix: purge or quarantine the QA rows before seeding; add a uniqueness guard and a category check.

## Coverage — what lane P could NOT verify, and why
- **Guest browse, product detail, the Companion, notifications, settings, help centre / Sanity tour copy, every guest prompt (script step 2):** unreachable. "Look around first" leads only into the intro carousel and the 5-question quiz (P-04), and completing the quiz writes preferences, which lane P is forbidden to do. Lanes A/B cover these on the local stack.
- **Everything behind sign-in (script step 3's Today / Spaces / Saved / Studio / Settings / Sign out):** unreachable. The `000000` fallback is rejected in-app on production (P-21) and lane P has no access to the tester@patina.cloud inbox. Lane C covers these locally.
- **Whether the piece deep link resolves for a signed-in user:** not verified, same reason.
- **Whether completing the quiz restores a route to sign-in:** not verified (P-18's stated limit).
- Nothing in this lane is device-verified; all of it is **simulator-verified** on a signed Debug build (iPhone 17 Pro, iOS 26.5) against Strata production, except P-36/P-37 which are **prod-data-verified** by read-only SQL.
