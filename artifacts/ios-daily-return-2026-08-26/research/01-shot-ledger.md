# 01 — Shot ledger (consolidated)

Rebuilt by the L1 ledger pass from the three walk agents' raw appends. Every row below is the walk agent's own wording, kept verbatim except for one completed filename citation (`g-26d` → `g-26d-second-quiz-next.png`) and reflowed into per-lane tables. No new taps were made and no new screenshots were taken to produce this pass.

## Run header

| | |
|---|---|
| Build HEAD | `3cd84ecb3` — the commit the walked `.app` was built from (per `research/02-steward-boot.md` §1). The live repo has since advanced to `f549e775b` under concurrent work elsewhere in this checkout (per `patina-parallel-work`); that later history is **not** reflected in the binary these screenshots show. |
| Project / scheme | `apps/mobile/Patina/Patina.xcodeproj`, scheme `Patina`, configuration **Debug** — plain simulator build, no `CODE_SIGNING_ALLOWED=NO` (entitlements intact; July's `securityd -34018` keychain trap did not reproduce) |
| Bundle id | `cloud.patina.app` |
| Simulator | iPhone 17 Pro · udid `973D1724-90BF-4A0A-B02D-481D561547B3` · **iOS 26.5** · logical screen 402×874 pt (screenshots captured at 1206×2622 px @3×, confirmed below) |
| App target | **Local Supabase stack only** — API `http://127.0.0.1:54321`, DB `127.0.0.1:54322`, Mailpit `127.0.0.1:54324`. Proven live: local Kong logged the app's own requests under `-DeploymentTarget local`, and the local-target anon key hard-coded in `APIConfiguration.anonKey` matches `supabase status`'s `ANON_KEY` byte-for-byte. **The override does not persist across launches** — every `simctl launch` in every lane repeats `-DeploymentTarget local`, or the app silently falls back to Strata prod. No shot in this ledger shows prod data. |
| Date | 2026-08-26 |
| Tap method | **Blitz MCP tools primary** (`mcp__blitz-iphone__device_action` tap/swipe/input-text against `scan_ui`-returned frame centres, logical-point coordinates, no scaling) — proven reliable end-to-end this run; **July's "blitz reads but taps don't land" trap did not reproduce** (s-02). AppleScript System Events click-through on the Simulator window was calibrated as a fallback and used for a handful of shots: window origin `(800, 117)`, size 456×972, **content inset (+27, +71)** from the window origin (`screen = (winX+27+pt_x, winY+71+pt_y)`) — note this differs from the brief's placeholder `(+27, +80)`; always recalibrate against a known control before trusting either number. |

## Harness notes

**Traps hit and workarounds** (see `research/02-steward-boot.md` for the full recipe this run used):

- **Blitz taps deliver this run** — the documented July regression ("blitz reads the UI tree but taps don't land") did not reproduce. Verified end-to-end (s-01→s-02): a blitz tap on `auth.welcome.guestButton` moved the app from the auth gate to the guest Daily Room. AppleScript stayed calibrated as a fallback (s-06/s-07) in case blitz degraded mid-walk; it did not need to be used as primary.
- **The steward's uninstall+reinstall reset does NOT sign the device out.** The Simulator keychain outlives app deletion, so the guest lane's first launch landed straight in a leftover client session (g-02a). Recovery required `xcrun simctl keychain <udid> reset` from the host — used repeatedly across lanes to force a clean signed-out state or to switch between accounts, since **no in-app Sign Out control exists anywhere in Settings or Profile** (reproduced independently in guest, client, and engaged-account contexts: g-02b, g-37b, c-27, c-30).
- **Guest sessions do not survive a relaunch or force-quit**; signed-in sessions do. Every guest-lane cold start returns to the auth gate with all quiz/portrait progress discarded (s-04, g-38), while a signed-in client's session and locally-created room both persist across `simctl terminate`+relaunch (c-29, d-06b).
- **Local SwiftData storage is not scoped to a user.** The guest lane's locally-typed room and locally-saved piece were silently adopted by the first real account that signed in afterward (c-03, c-05, c-26) — a cross-account data leak that only cleared once the keychain-reset cycle wiped the local store (c-34, matching d-00/d-09's clean "0 rooms/0 saved" baseline for the dark lane).
- **Every piece-detail screen is hard-broken** in this build/environment: `GET /rest/v1/products?...&select=*,vendors(...)` returns **HTTP 300 `PGRST201`** (ambiguous embed — `products` has two FKs to `vendors`). Root cause pinned at `apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:99`. `scan_ui` returns exactly one element (the retry link) on this screen — no Back, no nav, Companion absent from the AX tree — so it is a genuine dead end; the only recovery is `simctl terminate`+relaunch. Reproduced independently in all four lanes (g-17/g-17b, c-25, d-04, x-04) plus twice more as recovery/investigation byproducts (d-check10/d-check12, see below). This is an **app defect**, distinct from the known local edge-function 503s (§8 of `02-steward-boot.md`).
- **`POST /functions/v1/create-checkout-session` returns 503** — the known local edge-runtime fault, not an app defect (c-14). OTP/magic-link sign-in and Apple/Google sign-in were flagged unwalkable locally and not exercised; all lanes signed in with password (`password123`).
- **The coarse-sampling validation trap (this pass's own methodology note):** an initial 8×8 grid sample (64 points) flagged 23 of the 155 PNGs as "≤2 distinct colours" / possibly-blank. Every one of those 23 was re-checked at full-image resolution (64×64 downsample distinct-colour count + grayscale extrema) and two were opened visually — **all 23 are legitimate captures with 129–408 distinct colours and real tonal range**; the coarse grid simply landed repeatedly on large flat cream/near-black background regions on screens that are genuinely sparse (splash screens, empty states, auth gates, the dark-mode "Couldn't load product" trap). None were re-shot; none needed to be. See `research/validate_shots.py` and `research/validate_flagged.py`.

**Untracked / recovery captures** — 24 PNGs on disk have no narrated ledger row from the walk agents (their structured returns didn't list them). All 24 validated clean (real, ≥100 KB, 1206×2622, non-blank); none are duplicates of a byte-identical frame already covered. They are intermediate navigation/recovery shots taken mid-investigation, placed here by filename, on-disk timestamp, and (for the two starred) direct visual confirmation, rather than as their own ledger rows:

| file | lane / approx. position | inferred context |
| --- | --- | --- |
| d-check-studio-scrolled.png | dark, 18:25 | Studio-list navigation hunt between the d-04b recovery relaunch and d-07 (proposal detail) — scrolled view while locating the Proposals row |
| d-check-studio-bottom.png | dark, 18:25 | same hunt, scrolled further |
| d-check-studio-bottom2.png | dark, 18:26 | same hunt, another scroll position |
| d-check-after-tap.png | dark, 18:26 | a tap attempt on the Studio list en route to d-07 |
| d-check2.png | dark, 18:27 | further Studio navigation immediately before d-07 |
| d-check3.png | dark, 18:28 | navigation back toward Invoices between d-07 and d-check4 |
| d-check4-invoices-list.png | dark, 18:28 | Invoices list, en route to d-08 (invoice detail) |
| d-check5.png | dark, 18:29 | navigation back toward the bell icon between d-08 and d-10 (notifications) |
| d-check6-add-space.png | dark, 18:30 | "Add your first space" manual-entry form, mid-fill — one of the steps that produced d-06a's 18×14 ft input |
| d-check7.png | dark, 18:30 | same form flow, next step |
| d-check8.png | dark, 18:31 | same form flow, immediately before d-06a |
| d-check9.png | dark, 18:31 | transition tap between d-06a and d-06 ("This Looks Right") |
| **d-check10-after-heart-tap.png** | dark, 18:33 | **Visually confirmed**: room-context browse grid ("10 pieces curated for this room"), dark mode — heart icons still outlined/unfilled after a tap. Direct evidence for the d-05 "Saved unreachable" investigation's claim that the heart toggle produced no visible state change. |
| d-check11.png | dark, 18:33 | same Saved investigation, next attempt |
| **d-check12.png** | dark, 18:33 | **Confirmed via colour analysis** (129 distinct colours / 64×64, grayscale extrema 28–132 — identical profile to d-04): this is the "Couldn't load product" hard-trap re-triggered mid-investigation, immediately before the `simctl terminate`+relaunch that produces d-06b. Matches E3's failure note verbatim. |
| x-check-live-apply.png | Dynamic Type, 18:35 | proof shot (referenced by x-01's own row) that `content_size extra-extra-large` applied live with no relaunch needed |
| x-check-back.png | Dynamic Type, 18:36 | between x-02 and x-02b — likely the mis-tap itself that landed on "Active projects" instead of Back (per x-02b's row) |
| x-check-nav.png | Dynamic Type, 18:37 | navigation checkpoint between x-02b and x-09 |
| x-check-tap.png | Dynamic Type, 18:38 | tap verification between x-03 and x-04, immediately before the piece-detail hard-trap |
| x-check-after-relaunch.png | Dynamic Type, 18:39 | recovery shot immediately after x-04 confirming the relaunch succeeded and XXL was preserved (per x-04's own row) |
| x-check-proposals.png | Dynamic Type, 18:40 | navigation checkpoint en route to x-05 (proposal detail) |
| final-check-restore.png | end of walk, 18:42 | appearance/content-size restore-to-default verification (dark→light, XXL→default) at lane teardown |
| final-check-restore2.png | end of walk, 18:43 | same restore verification, second check |
| **final-handoff-state.png** | end of walk, 18:44 | **Visually confirmed**: Daily Room top, light mode, default content size — "Today" / "Review a project decision" / "2 decisions need your eye." / ACTIVE ROOM "Living Room" / "4 THINGS NEED YOUR EYE", avatar "C". Device fully restored to default appearance at handoff, matching d-00's own starting-state baseline. This is the genuine end-of-program state, distinct from c-34's earlier lane-handoff shot. |

**Validation method** (this pass): every PNG in `shots/` checked for existence, file size (min observed 104 KB, well above the 20 KB floor), pixel dimensions via `sips -g pixelWidth -g pixelHeight` (all 155 are exactly **1206×2622**, consistent with the iPhone 17 Pro's 3× logical 402×874), and non-blank content via PIL (8×8 grid sample per the brief, cross-checked at full-image resolution — see above). **All 155 PNGs pass.** Scripts and raw output kept at `research/validate_shots.py`, `research/validate_flagged.py`, `research/validate_out.json`.

## Guest lane (g-)

| file | screen | route/view | tier/state | how reached (taps) | what is time/date-aware on this screen | defects or surprises |
| --- | --- | --- | --- | --- | --- | --- |
| g-01-splash.png | Launch screen — blank white, no logo, no status bar | launch screen (storyboard) | guest, clean first launch | `simctl launch … -DeploymentTarget local`, shot at t≈0 | nothing | Launch screen is **completely blank white** — no wordmark, no color. Captured twice on two separate cold launches, identical. Jarring flash against the app's warm `#F7F4EF` ground. |
| g-02a-unexpected-signed-in-after-reinstall.png | Daily Room as "Client User" (avatar "C") | `DailyRoomView` | UNEXPECTED — signed in after uninstall+reinstall | the steward's reset recipe, then launch | "WEDNESDAY · AUG 26"; "Today"; "2 decisions need your eye."; "2 PROJECT DECISIONS WAITING" | **Steward reset recipe does NOT sign you out.** Simulator keychain outlives app deletion, so uninstall+install relaunched straight into the client session. Guest lane needed `xcrun simctl keychain <udid> reset`. |
| g-02b-settings-account-inert.png | Settings sheet stacked over a "Conversation" screen | `SettingsView` (sheet) | client tier (pre-reset) | Profile → Settings → tap "Account" | nothing | Two defects: (1) **"Account >" does not navigate** — tapped twice dead centre of its frame, screen unchanged; (2) there is **no Sign Out control anywhere in Profile or Settings** — the only ACCOUNT rows are "Account" and "Sign in on the web". (3) The status-bar clock overprints the underlying sheet's "Conversation" title. |
| g-02-first-screen-after-splash.png | Auth gate — "Welcome home" / "Start with a piece you love" | `AuthScreenView` | guest, signed out, clean first launch | keychain reset + reinstall, then launch | nothing — no greeting, no date | **No onboarding carousel exists**: splash goes straight to the gate. "Continue with email" is prefixed with the **emoji ✉️** while Apple gets a real logo and Google a bare letter "G" — three different icon systems in three stacked buttons. |
| g-09-home-tour-step1.png | Daily Room + coach mark "Step 1 of 2 / Welcome to Patina" | `DailyRoomView` + coach mark | guest | tap `auth.welcome.guestButton` "Look around first" (201,578) | "WEDNESDAY · AUG 26"; "Today"; "4 MIN READ" | "This is your Daily Room — picks and stories chosen for your space." **Skip/Next render in iOS system blue #007AFF**, the only blue in the app. The bubble fully covers the Next Move card it is describing. |
| g-10-home-tour-step2.png | Coach mark "Step 2 of 2 / Your profile" | `DailyRoomView` + coach mark | guest | tap "Next" (284,313) | same header | "Rooms, saved pieces, and settings live here." Again system-blue Skip/Done; again the bubble covers the Next Move card, not the profile avatar it points at. "Skip" on the final step is redundant with "Done". |
| g-11-companion-intro-card.png | Daily Room with Companion intro card (same frame as g-12) | `DailyRoomView` | guest | tap "Done" (343,290) | "WEDNESDAY · AUG 26" | "I'm your Companion." / "Tap me any time, anywhere in Patina — I'll show you the way to what's next." / "Show me" · "Later" |
| g-12-home-discovering-top.png | Daily Room (guest) top | `DailyRoomView` | guest / discovering | — | "WEDNESDAY · AUG 26"; "Today"; Next Move is state-derived; "4 MIN READ" | Next Move = "Bring your first room into Patina / A short scan gives the Companion a real space to work from." **No tab bar, no nav bar, no Browse/Saved/Spaces entry point anywhere.** |
| g-13-home-scrolled.png | Daily Room after an upward swipe — identical to g-12 | `DailyRoomView` | guest | swipe (201,700)→(201,250) | same | **The guest home does not scroll.** There is no "Your Studio" block and **no designer CTA on the guest home at all** — the requested g-13 target does not exist in this tier. |
| g-14-companion-panel-open.png | Companion panel opening, covered by a teaching bubble | companion panel | guest | tap `companion.intro.showMe` (114,674) | none | "These are your next steps. They change with every room you're in — tap one and I'll take you there." The bubble **covers the panel's own first row**, the third coach mark in a row to hide its target. |
| g-14b-companion-next-steps.png | Companion panel "Where to begin?" | companion panel | guest | tap "Got it" (62,549) | none | "A considered next move, based on where you are." Rows: "Add your first space / CAPTURE YOUR FIRST ROOM", "Style quiz / DISCOVER YOUR STYLE", "Your recommendations / TAKE THE QUIZ FIRST", "Sign in / SAVE ROOMS · SYNC ACROSS DEVICES". **No "Browse" row** — the app's only navigation surface offers no way to browse pieces. |
| g-06-quiz-q1.png | Style quiz Q1 "Which palette feels like home?" | style quiz | guest | Companion → "Style quiz" (201,634) | "STEP 1 OF 5", 20% | Options are **flat CSS-style gradients, not photographs**, on a quiz titled "Your visual style". "Warm Minimal" and "Classic Comfort" swatches are near-indistinguishable off-whites. Q1 auto-advances with no Continue button. |
| g-07-quiz-q2-midway.png | Style quiz Q2 "How do you actually live in your space?" | style quiz | guest | tap "Warm Minimal" (109,268) | "STEP 2 OF 5", 40% | Options carry **stock Apple emoji** (🍷 🧘 💻 👨‍👩‍👧 📚) as their icons. Q2 requires a "Continue" press while Q1 auto-advanced — inconsistent within one flow. |
| g-07b-quiz-q3.png | Q2 with "My quiet sanctuary" selected | style quiz | guest | tap option (201,320) | "STEP 2 OF 5", 40% | On selection the footer grows a **second, redundant affordance**: a plain "Next question →" line directly above the "Continue →" button. The growth also shifts Continue, so a quick tap at its previous position misses. |
| g-08-quiz-result.png | Taste portrait result "Warm Modern" | taste portrait | guest | 5 answers + Continue ×4 | "A STARTING POINT — REFINE IT ANY TIME." | **I chose "Warm Minimal" in Q1 and was returned "Warm Modern"** — a label that is not one of the four palettes offered. An **unlabeled progress bar sits at ~45%** under "WHY PATINA SEES THIS" with nothing saying what it measures. A **clipped black bar** juts across the screen above the Companion bubble. |
| g-08b-quiz-result-scrolled.png | Taste portrait, scrolled to the end | taste portrait | guest | swipe (201,650)→(201,250) | same | Screen barely scrolls; content ends at "Tune the portrait / Tell Patina which direction feels closer. / Tune this". **No "see your recommendations" CTA** — the quiz's payoff is a dead end unless you reopen the Companion. The clipped black bar persists. |
| g-15-browse-pieces-grid.png | "Browse pieces / 10 pieces curated for your space" | browse grid | guest, post-quiz | Companion bubble (201,757) → "View recommendations" (201,502) | none | **The 2-column grid is broken.** `describe_screen` gives card frames at **x = −32.7** and **x = −10.7** (off the left edge) and a 4th card ending at x = 412.7 (off the right, screen is 402). Card sizes differ wildly — 284×294, 171×341, 240×293, 240×304 — where a 2-col grid needs one size. Left column is unreadable: "M & BOARD", "rloom Oak / ing Table", ",200". |
| g-15b-browse-grid-settled.png | same, 3 s later | browse grid | guest | wait | none | Identical — **not a transition artifact**, a fixed layout bug. |
| g-15c-browse-after-right-swipe.png | same after a left→right swipe | browse grid | guest | swipe (100,400)→(350,400) | none | Grid does **not** scroll horizontally, so the offset is not a stuck scroll. The swipe also **toggled the first card's heart** — a horizontal drag over a card fires its save button. |
| g-16-filter-chip-seating.png | Browse pieces, "Seating" chip active — "3 pieces curated for your space" | browse grid | guest | tap "Seating" (110,192) | none | Filter works, layout does not: cards **overlap each other**, sit at different vertical offsets, and the third card is a **blank brown gradient with no image at all**. |
| g-17-piece-detail-top.png | "Couldn't load product / Let's try that again" | product detail | guest | tap the "Meadow Linen Sectional" card (292,330) | none | **Every piece detail fails.** `scan_ui` returns exactly ONE element for the whole screen — the retry button. **No Back, no nav, Companion greyed out and absent from the AX tree.** The retry hit-target is 125×17 pt, well under 44. |
| g-17b-piece-detail-after-retry.png | same error after retry | product detail | guest | tap "Let's try that again" (201,486) | none | Retry fails identically. |
| g-17c-after-edge-swipe-back.png | same error after a left-edge back swipe | product detail | guest | swipe (2,450)→(320,450) | none | **The guest is hard-trapped.** Edge-swipe back does nothing. The only escape is force-quitting the app — which also destroys the guest session (see g-38). ROOT CAUSE: Kong logs `GET /rest/v1/products?id=eq.…&select=*,vendors(name,made_in,brand_story)` → **HTTP 300 `PGRST201`** — `products` has two FKs to `vendors` (`retailer_id`, `vendor_id`) so the bare `vendors(...)` embed is ambiguous. Fix at `apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:99` → `vendors!products_vendor_id_fkey(...)`. NOT the known edge-function 503. |
| g-20-card-more-menu.png | ⋯ card menu: Save / Share / Not for me / View details | browse grid | guest | tap ⋯ (357,240) | none | No "Add to room" action. "View details" leads to the broken detail screen above. |
| g-19-share-sheet.png | iOS share sheet | share sheet | guest | ⋯ → "Share" (205,300) | none | **The client app shares a link titled "Patina Designer Portal — app.patina.cloud".** A homeowner sharing a piece hands their friend the *designer* portal. |
| g-22-saved-one-piece.png / g-21-saved-empty-boards-tab.png | "Saved" → Boards tab, "No boards yet" | saved | guest, 1 saved piece | Companion → "Saved, 1 saved piece" (201,700) | none | Boards is empty while the Companion reports "1 SAVED PIECE" — the count and the default tab disagree. "Boards" tab hit-target is 46×17 pt vs "All items" 165×31 — neither reaches 44. |
| g-22b-saved-all-items.png | "Saved" → All items | saved | guest | tap "All items" (295,199) | none | The piece renders as "**$4200**" — no thousands separator — while the same piece on the grid reads "$4,200". Image is a green-velvet dining set for a piece called "Heirloom Oak Dining Table". |
| g-40-companion-inconsistent-persistence.png | Companion "Where to begin?" after relaunch | companion panel | guest, post-relaunch | relaunch → guest → bubble | none | **Persistence contradicts itself**: "Saved / 1 SAVED PIECE" survived, but "Style quiz / DISCOVER YOUR STYLE" and "Your recommendations / TAKE THE QUIZ FIRST" claim no quiz was taken — while Profile (g-36) simultaneously shows the "Warm Modern" portrait. |
| g-30-designer-consultation.png | "Your design request" — "No scans on this phone yet" | design request sheet | guest | Companion → "Get design help" (201,634) | none | Copy says "You can scan a room to attach — or request design help without one below", but **there is no scan affordance on the sheet** — only "Request without a scan". |
| g-31-design-request-step1.png | Design request form | design request sheet | guest | tap "Request without a scan" (201,793) | none | "What kind of help? / Budget (optional) / Timeline / Your vision (optional)". Timeline is not marked optional yet is pre-filled "Flexible". **Nothing warns that an account will be required.** |
| g-32-design-request-review.png | Review — Scans / Help / Timeline | design request sheet | guest | tap "Review" (201,793) | none | No Back or Edit control — only "Close" (discard) and "Send request". |
| g-33-after-send-request.png / g-35-auth-wall-no-dismiss.png | **THE SOFT WALL** — full auth gate thrown as a sheet | `AuthScreenView` as modal | guest | tap "Send request" (201,793) | none | The guest completes the whole request, then hits the wall at the last tap. The sheet is the **generic gate** — "Welcome home / Start with a piece you love", no mention of the request. `scan_ui` confirms it has **no Cancel, no X, and no "Look around first"** — every escape hatch is gone; only a blind downward drag dismisses it. |
| g-34-after-dismissing-auth-wall.png | Back on the review screen | design request sheet | guest | drag the sheet down | none | Good news: the draft **is** preserved after dismissing the wall. |
| g-29-notifications-guest.png | "Notifications / Nothing yet" | notifications | guest | tap `DailyRoomView.BellButton` (280,136) | none | "Updates from your designer will land here. Sign in to stay in the loop." The **"Sign in" button is rendered as a circle** and its label overflows past both edges of that circle. |
| g-36-profile-guest.png | Profile — "Guest", "✦ Warm Modern", 0 ROOMS / 1 SAVED / 48% MATCH | `ProfileView` | guest | tap `DailyRoomView.ProfileButton` (364,136) | "MEMBER SINCE …" absent for guest | This is where the requested "Your Studio" block actually lives (**not** on home). "**48% MATCH**" — match with *what* is never stated. "Nothing needs your attention right now." sits directly above "Your Studio begins with a project. / Sign in to see conversations, decisions, proposals, invoices, and shared files." — the two contradict. Style badge says "Warm Modern" while the Companion says the quiz is untaken. |
| g-36b-profile-guest-scrolled.png | Profile scrolled | `ProfileView` | guest | swipe (201,700)→(201,300) | none | **The header scrolls up under the status bar and the floating Back button** — "Guest" is sliced by the screen top and the 9:41 clock overprints the "Warm Modern" pill. No safe-area inset, no clipping. Rows: Retake Style Quiz / Get design help / Settings. |
| g-37-settings-guest.png | Settings (guest) | `SettingsView` | guest | Profile → "Settings" (201,690) | none | **Byte-identical to the signed-in Settings** — an "ACCOUNT / Account / Sign in on the web" section for someone with no account, and still **no Sign In or Sign Out anywhere**. "Notifications" is toggled ON for a guest who can receive none. |
| g-37b-settings-account-tap-guest.png | Settings unchanged after tapping "Account" | `SettingsView` | guest | tap "Account" (209,228) | none | Confirms the inert "Account >" row in the guest tier too — chevron present, nothing happens. Reproduced in both tiers. |
| g-23-spaces-or-scan.png / g-25-manual-room-entry-metric.png | "TELL US ABOUT YOUR SPACE / What kind of room?" | room capture form | guest | home → Next Move card (201,264) | none | The camera-icon Next Move promising "a short scan" lands on a **typed form**, unexplained. **No Back/Close/Cancel anywhere on the screen.** Room types use stock emoji (🛋 🛏 🍽 💻 🍳 ✨). The **"ft" / "m" unit toggles measure 12×13 pt and 6×13 pt** — the metric target is 6 points wide. Steppers are 32×32. All far below the 44 pt minimum. Tapping "m" produced **no visible state change** (see g-27). |
| g-26-after-room-created.png | "YOUR ROOM IS CAPTURED · LET'S DISCOVER YOUR STYLE / Which room speaks to you?" | second style quiz | guest | tap "Continue to Style Discovery" (201,697) | none | **A SECOND, DIFFERENT style quiz.** Options here are Warm Minimal / Cool Modern / **Layered Comfort** / **Curated Mix**; the Companion quiz's were Warm Minimal / Cool Modern / **Classic Comfort** / **Eclectic Curated**. "Which *room* speaks to you?" shows flat gradients containing no room. "YOUR ROOM IS CAPTURED" — nothing was captured. No progress indicator, no back. |
| g-26b-second-quiz-next.png | "How do you actually live in this space?" | second style quiz | guest | tap "Warm Minimal" (110,307) | none | **Duplicate of Companion quiz Q2** ("…in your space?"), now multi-select with an added "Entertainment hub" 🎬. Progress replaced by "KEEP GOING — YOU'RE DOING GREAT" — the user cannot tell how many questions remain. |
| g-26c-second-quiz-q3.png / g-26d-second-quiz-next.png | "What texture calls to you?" | second style quiz | guest | select + Continue | none | **Duplicate of Companion quiz Q3** (materials) plus "Smooth Marble". Textures shown as flat gradients with no texture. The "Continue" button **overlaps the bottom row of tiles**. |
| g-26e-room-result.png | "Let's talk about investment." | second style quiz | guest | select + Continue | none | **Duplicate of Companion quiz Q4** — identical budget bands ($500–$2,000 / $2,000–$5,000 / $5,000+ / Let's Discuss). Four of five questions are asked twice across the two quizzes. |
| g-28-room-view-final.png | "YOUR STYLE, FOUND / **Modern Warmth**" | style result | guest | answer "A place to gather" | none | **A third name for one thing**: Companion quiz → "Warm Modern"; Profile badge → "Warm Modern"; this → "**Modern Warmth**". This screen is also **dark-themed and set in the system sans** while the entire rest of the app is light and serif — appearance is set to System/light. |
| g-27-room-with-recommendations.png | "YOUR SPACE / Here's what I see." — 46 ft × 59 ft, 2713 SQ FT | room summary | guest | tap "See What Fits Your Space" (201,771) | none | **DATA CORRUPTION.** I typed LENGTH 18 / WIDTH 14 while the field read "ft"; the room came out **46 ft × 59 ft = 2713 sq ft** (18 m = 59 ft, 14 m = 46 ft). The 6-pt "m" toggle fired **silently with no visual state change**, so the numbers were reinterpreted as metres. Also offers "Rescan" for a room that was never scanned, and "0 ITEMS DETECTED" for a typed form. |
| g-28b-room-view.png | "Living Room / 2713 SQ FT · 2 WINDOWS" | room view | guest | tap "This Looks Right" (261,771) | none | Bad dimensions persist ("59' × 46'"). Stats read "0 ITEMS", "— MATCH", "0 **IN AR**" — "IN AR" is undefined. The settings control is a **colour emoji ⚙️** opposite a monochrome chevron. Three competing, overlapping CTAs at the bottom: body copy says "Browse your Daily Room", the button says "Browse Picks for This Room", and a link says "SEE RECOMMENDATIONS →" — and the Companion bubble sits on top of all of them. |
| g-27b-room-picks.png | Browse pieces, reached from the room | browse grid | guest, 1 room | tap "Browse Picks for This Room" (201,677) | none | The button lies: it opens the **same generic "10 pieces curated for your space"** with no room name and no room filtering. Cards now overlap even more badly. Copy has switched to "your **Modern Warmth** portrait" — the second quiz silently overwrote the first. |
| g-27c-card-menu-in-room-context.png | ⋯ menu, in room context | browse grid | guest, 1 room | tap ⋯ (357,240) | none | **Still Save / Share / Not for me / View details — no "Add to room".** With a room created and entered from that room's own CTA, there is no way to put a piece into it, though the room view counts "ITEMS" and says "start building this room". g-27/g-28 as briefed are therefore unreachable. |
| g-38-relaunch-returning-guest.png | Auth gate | `AuthScreenView` | returning guest after force-quit | `simctl terminate` + `launch … -DeploymentTarget local` | none | A returning guest is dumped at the gate. The taste portrait, the quiz progress and the guest session are discarded with no warning and no "welcome back" — the screen says "**Welcome home**" to someone it just forgot. (The saved piece and the coach-mark flags *do* survive — see g-40.) |
| g-39-home-after-idle.png | Daily Room after 50 s untouched | `DailyRoomView` | guest, 1 room | tap Companion → "Home", then wait 50 s | "WEDNESDAY · AUG 26"; Next Move is state-derived | **No Companion nudge after 50 s idle** — the bubble never speaks first. Home has restated Next Move as "Find the first piece for Living Room / Browse Patina's edit and begin shaping the room." and grown an "ACTIVE ROOM" card that is clipped by the Companion bubble and the screen edge. |
| g-40b-home-active-room-clipped.png | Home scrolled to the ACTIVE ROOM card | `DailyRoomView` | guest, 1 room | swipe (201,650)→(201,300) | header date | Home *does* scroll once content exceeds the fold (so g-13's non-scroll was simply an empty page). But the header **scrolls up under the status bar** — "WEDNESDAY · AUG 26" collides with the 9:41 clock, same missing safe-area inset as Profile. The room card is an **image-less gradient placeholder**: "ACTIVE ROOM / Living Room / 2713 sq ft · 0 pieces saved". |
| g-26-room-view-after-create.png | "Let's talk about investment." (duplicate frame of g-26e) | second style quiz | guest | Continue from the texture question | none | Filename is a misnomer from an early guess at where this step would land — it is the budget question, identical to `g-26e-room-result.png`. Kept for completeness; use g-26e. |

## Client lane (c-)

| file | screen | route/view | tier/state | how reached (taps) | what is time/date-aware on this screen | defects or surprises |
| --- | --- | --- | --- | --- | --- | --- |
| c-00-start-state.png | Auth gate — "Welcome home" / "Start with a piece you love" | `AuthScreenView` | signed out (guest lane's session gone after relaunch) | `simctl terminate` + `launch … -DeploymentTarget local` | none | Confirms guest state does not survive a relaunch (third independent reproduction). |
| c-01-signin-email-entry.png | "Sign In / Welcome back to Patina" sheet | `AuthScreenView` password sheet | signed out | tap `auth.welcome.passwordButton` (201,626) | none | This sheet HAS a "Cancel" — the guest-lane auth wall (g-35) is the same component thrown without one. No show-password reveal on the Password field. Footer: "Forgot password? · Use magic link" / "Don't have an account? Sign Up". |
| c-01b-signin-filled.png | Sign In, both fields filled | password sheet | signed out | tap email (201,369) + type, tap password (201,438) + type | none | HID typing fills without raising the software keyboard. "Sign In" only darkens from tan to near-black once both fields are non-empty — the disabled state is a colour change with no other cue. |
| c-02-home-immediately-after-signin.png | Daily Room behind iOS "Save Password?" | `DailyRoomView` + system sheet | activeProject, t+3s | tap "Sign In" (201,505) | "WEDNESDAY · AUG 26"; Next Move; footer "2 PROJECT DECISIONS WAITING" | **Tier promotes LIVE — no relaunch needed.** Next Move is already "Review a project decision / 2 decisions need your eye." iOS Save Password sheet (not an app defect). |
| c-03-home-top-activeproject.png | Daily Room top, signed-in client | `DailyRoomView` | activeProject | dismiss "Not Now" (127,546) | "WEDNESDAY · AUG 26" / "Today"; "4 MIN READ"; "2 PROJECT DECISIONS WAITING" | **GUEST DATA LEAKS INTO THE ACCOUNT**: the "ACTIVE ROOM / Living Room" card is the room the *guest* lane typed in before sign-in. `client@patina.dev` has ZERO rooms server-side. Local store is not scoped to a user or cleared on sign-in. Also: the home still has **no tab bar and no nav bar** as a signed-in client — the only chrome is bell / "?" / avatar. Editorial hero "The Grain Whisperer of Maine" is an image-less brown gradient. |
| c-04-home-scrolled-studio-rows.png | Daily Room, swiped up | `DailyRoomView` | activeProject | swipe (201,700)→(201,200) | header date | **There is NO Studio hub on the signed-in home.** `describe_screen` returns the whole page: Next Move, editorial story, ACTIVE ROOM, Companion — four items, structurally identical to the guest home. A client with 3 projects, 4 proposals, 1 open invoice and 2 waiting decisions sees none of it on Today. Header again scrolls up under the status bar (no safe-area inset). |
| c-05-companion-panel-client.png | Companion "Where to next? / 2 project decisions waiting." | companion panel | activeProject | tap `companion.bubble` (201,756) | "2 project decisions waiting" | The Companion is the ONLY navigation in the app. Rows: "Your recommendations / BASED ON YOUR ROOMS", "Your spaces / 1 ROOM", "Add another space", "Saved / 1 SAVED PIECE", "Your studio / PROJECTS · MESSAGES · DECISIONS", "Your profile / STYLE · SETTINGS · PORTAL". "1 ROOM" and "1 SAVED PIECE" are the **guest lane's** local data surfacing under a real account. No Invoices row, no Proposals row, no Messages row of their own. |
| c-04b-your-studio-hub.png / c-07-projects-list.png | "PROJECTS / 3 projects" + "Search projects" | projects list | activeProject | Companion → "Your studio" (201,700) | none | **"Your studio" is not a hub** — the row promises "PROJECTS · MESSAGES · DECISIONS" and lands directly on a bare projects list. Messages and Decisions are not reachable from here. **Sort puts the COMPLETED project first**: "Birch Hollow / Completed / $185,000" above "Aspen Loft Refresh / In Progress" and "Marrow & Vale Residence / In Progress". Phase renders as the bare word "**Install**" while the AX label is the full "Installation & Styling" — truncated with no ellipsis, so it reads as a verb. |
| c-08-project-detail.png | "PROJECT / Aspen Loft Refresh / Currently: Installation & Styling" | project detail | activeProject | tap "Aspen Loft Refresh" (201,407) | none | **Two designer-facing leaks on a homeowner screen**: (1) a stat labelled "**CLIENT VIEW / Milestone**" — the raw `client_visibility_tier` column shown to the client it describes; (2) a link reading "**Set up phases, payments, and FF&E in the portal →**", an instruction to the designer, handed to the client. The whole detail is 3 stats + Invoices + that link: **no phases, no rooms, no tasks, no documents, no decisions, no proposals, no designer** — though Kong shows the app successfully fetched `project_phases` (3827 bytes) and `get_client_project_selections` for this screen and rendered none of it. |
| c-12-invoices-list.png | "INVOICES / Your invoices" — "AWAITING PAYMENT (1)" | invoices list | activeProject | project detail → "Invoices" (201,388) | "Due Sep 1, 2026" | Invoices DO exist for this account (the recipe's "0 invoices" is stale): INV-2026-0142, $4,250.00. "AWAITING PAYMENT" is printed twice in 100 pt of vertical space — once as the section header, once as the card's own status. No paid/history section, no filter. |
| c-13-invoice-detail.png | "INVOICE / Awaiting payment / INV-2026-0142" | invoice detail | activeProject | tap the invoice (201,264) | "Due Sep 1, 2026" (not shown on detail) | **First and only place the designer is named: "Aspen Loft Refresh · from Leah Hartwell"** — no photo, no studio, no contact affordance. Line items, "A NOTE FROM YOUR DESIGNER", "PAYMENTS / No payments recorded yet." The **due date shown on the list is dropped from the detail** — the screen that asks for money never says when it is due. |
| c-13b-invoice-detail-scrolled.png | Invoice detail with the pay act | invoice detail | activeProject | swipe (201,650)→(201,250) | none | "**Pay $4,250.00**" + "Pay securely by card or bank transfer." Header scrolls under the status bar: "Awaiting payment" collides with 9:41 and the floating Back button overprints "INV-2026-0142". |
| c-14-pay-handoff.png | Pay failed — "Unable to start payment. Please try again." | invoice detail | activeProject | tap "Pay $4,250.00" (201,651) | none | **No SFSafariViewController handoff.** Kong: `POST /functions/v1/create-checkout-session` → **503** (the known local edge-runtime fault, not an app bug). The *UX of the failure* is a finding: the error is one line of red body text **inserted below the button**, which shoves "Pay securely by card or bank transfer" half off the bottom edge; the button keeps its full enabled styling, there is no spinner, no retry affordance and no way to reach a human about a $4,250 payment that will not start. |
| c-17-decisions-list.png | "DECISIONS / Awaiting your call" | decisions list | activeProject | home → Next Move card (201,211) | none on this screen | Two decisions, both "Aspen Loft Refresh", tagged "Color" / "Product". **The overdue state visible on the Studio hub ("Overdue · Aug 22", c-06b) is dropped here** — the screen you act on is the one that hides the urgency. No dates, no "asked N days ago", no designer avatar. |
| c-18-decision-detail.png | "DECISION / Rug color - Natural vs Sand" | decision detail | activeProject | tap the first decision (201,250) | none | Two options, "Natural" (badged "Recommended") and "Sand", **both $850** and **both with no image** — a *colour* decision presented with no colour. Two identical black "Choose this" buttons. No way to ask a question, defer, or say "neither"; nothing states the choice is final. Title uses a hyphen where an en dash belongs. |
| c-26-profile.png | Profile — "Client User / MEMBER SINCE AUG 25, 2026 / ✦ Modern Warmth" | `ProfileView` | activeProject | `DailyRoomView.ProfileButton` (364,136) | "MEMBER SINCE AUG 25, 2026" | **The guest's taste portrait and counts followed the sign-in**: "✦ Modern Warmth", "1 ROOMS", "1 SAVED" all came from the guest lane. "**1 ROOMS**" is ungrammatical. "MATCH" jumped 48% → **63%** with no explanation of what is matched or why it moved. |
| c-06-studio-rows-designer.png / c-06b-studio-awaiting-you.png | Profile → STUDIO — "The work around your home, in one place." | `ProfileView` studio block | activeProject | swipe up on Profile | "Overdue · Aug 22", "Due Sep 1", "Review by Sep 8" | **This is the real Studio hub** (not on home, not behind "Your studio"). Rows: Awaiting you **3** — Decisions "2 project choices are ready / Overdue · Aug 22", Invoice "$4,250.00 remaining / Due Sep 1", Proposal "Aspen Loft — Living Room Refresh / Review by Sep 8"; In progress 1 — Active projects; Conversation **0** — "No project conversations yet."; Money & documents 3 — Proposals / Invoices / Budget. **Count contradiction on one screen: "Awaiting you 3" under a heading that says "4 things need your eye" and a footer that says "4 THINGS NEED YOUR EYE"** — while home and the Companion both say "2 project decisions waiting". Three different totals for one inbox. |
| c-06c-studio-bottom.png / c-06d-studio-money-documents.png | Studio tail — Archive, YOUR ROOMS, YOUR PROFILE | `ProfileView` | activeProject | swipe | "SCANNED AUG 26" | Archive 1 → "Project / 1 completed or archived project". YOUR ROOMS shows the guest's typed room as "Living Room / **SCANNED AUG 26**" — it was never scanned. YOUR PROFILE: Retake Style Quiz · Get design help · Settings. **Still no Sign Out anywhere** (reproduces the guest lane's finding on a real account). **No Documents surface exists** — "Money & documents" holds only Proposals, Invoices and Budget. `scan_ui` returns **none of the Studio rows as accessibility buttons** — only "Open Living Room", "Retake Style Quiz", "Get design help", "Settings" and Back — so the entire client inbox is unreachable by VoiceOver/Switch Control despite drawing chevrons. |
| c-09-proposals-list.png | "PROPOSALS / Your design proposals" | proposals list | activeProject | Studio → "Proposals" (201,325) | "Expires Sep 8" | **"SIGNED (1)" for a proposal whose status is `accepted`, not signed** — the seed has zero signed proposals. Calling an unsigned acceptance "SIGNED" on a $100,000.00 document is a legally loaded mislabel. Section header and card status again print the same word twice. The two `draft` proposals are correctly hidden. |
| c-10-proposal-detail-top.png | "PROPOSAL / Aspen Loft — Living Room Refresh / INVESTMENT $18,500.00" | proposal detail | activeProject | tap the awaiting-review card (201,264) | none | Sections: Design Vision, Concept Direction, Space Plan, Product Selections. **The "Expires Sep 8" from the list is dropped on the detail** — the same omission as the invoice: the deadline lives only on the card you leave behind. No designer named anywhere on the proposal. |
| c-11-proposal-detail-scrolled.png / c-11b-proposal-sign-act.png | Terms + SELECTIONS + "Sign proposal" | proposal detail | activeProject | swipe up ×2 | none | **No boards, no images, no per-item prices.** Five selections — "Walnut sectional sofa", "Hand-knotted wool rug", "Walnut coffee table", "Reading lounge chair Qty 2", "Floor lamp Qty 2" — each illustrated with the **Patina wordmark glyph as a placeholder** and priced at nothing; the $18,500.00 total is never broken down. Terms are real and severe ("Deposits are non-refundable once procurement begins. Custom items are final sale."). In c-11 the **Companion bubble sits directly on top of the "Sign proposal" button**, clipping it. |
| c-11c-sign-sheet.png | "SIGN PROPOSAL" sheet — "Type your full name to e-sign." | sign sheet | activeProject | tap "Sign proposal" (201,673) | none | The sheet a client legally signs **restates no amount, no terms, no date, and no line items** — only the project title, a "Full name" field, a disabled "Sign proposal" button and "Cancel". Disabled state is tan-on-tan and the label is barely legible. Cancelled without signing. |
| c-15-budget.png | "BUDGET / Your budget — ACROSS YOUR PROJECTS" | budget | activeProject | Studio → "Budget" (201,463) | none | **The number is wrong for the label.** "$4,250 BILLED / $0 PAID / $4,250 OUTSTANDING" is presented as the budget *across your projects*, but the three projects total **$725,000** ($185,000 + $120,000 + $420,000) on the projects list. This is a billing summary wearing the word "budget". Marrow & Vale Residence and Birch Hollow do not appear at all. Formats mix on one card: "$4,250" (no cents) above "$4,250.00". |
| c-19-messages-empty.png | Studio → "Conversation 0 / No project conversations yet." | studio conversation block | activeProject | Studio scroll | none | **This is the whole messaging surface** — a count and one line of grey text. There is no compose, no "message your designer", no thread list and no thread to open, so **c-20 (a thread) is unreachable in this build**. A client with an overdue decision, an unpaid invoice and an expiring proposal has no way to say anything to Leah Hartwell from inside the app. |
| c-21-notifications-signed-in.png | "Notifications / Nothing yet" | notifications | activeProject | `DailyRoomView.BellButton` (280,102) | none | "Updates from your designer will land here." plus a "**Get design help**" button — the acquisition CTA for someone with no designer, shown to a client who has one, three projects and four open items. **Zero notifications** while the Studio says 2 decisions are overdue since Aug 22, an invoice is due Sep 1 and a proposal expires Sep 8: nothing in this app tells a returning client what changed. |
| c-22-saved-signed-in.png / c-22b-saved-all-items.png | "Saved" → Boards / All items | saved | activeProject | Companion → "Saved" (201,634), then "All items" (295,199) | none | Both guest-lane defects reproduce on a real account: the default **Boards** tab says "No boards yet" while the Companion counts "1 SAVED PIECE", and the item renders "**$4200**" with no thousands separator. The piece itself (Heirloom Oak Dining Table) is the guest lane's save, now attributed to the signed-in client. |
| c-25-piece-detail-client.png | "Couldn't load product / Let's try that again" | product detail | activeProject | tap the saved piece (201,292) | none | **The broken piece detail is not a guest-only problem.** Kong: `GET /rest/v1/products?id=eq.a0000000-…-000000000001&select=*,vendors(name,made_in,brand_story)` → **HTTP 300** (`PGRST201`, ambiguous embed — two FKs from `products` to `vendors`). `scan_ui` returns exactly one element for the entire screen, so the signed-in client is **hard-trapped** with no Back; the only escape was force-quitting the app. Fix at `apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:99`. |
| c-29-relaunch-returning-client.png | Daily Room, unchanged | `DailyRoomView` | activeProject, after force-quit | `simctl terminate` + `launch … -DeploymentTarget local` | "WEDNESDAY · AUG 26" | The session **does** survive a relaunch for a signed-in client (guest's does not). But a returning client is dropped on a byte-identical Today: no "welcome back", no "here's what changed", no unread marker, no timestamp of the last visit. |
| c-23-your-spaces.png | "Your Spaces" — Whole Home + Living Room | spaces | activeProject | Companion → "Your spaces" (201,502) | "JUST SCANNED" badge | **Four "?" help buttons on one screen** — three stacked beside the title at three different sizes, plus a fourth on the "Whole Home" card. The room carries a **"JUST SCANNED"** chip (the only blue-grey element in the app) directly above its own subtitle "**2713 SQ FT · MANUAL ENTRY**" — the badge contradicts the caption. That subtitle is brown-on-brown-gradient and barely legible. A "**SAVED ON THIS PHONE**" chip confirms the room never left the device even though the user is signed in — yet Profile, Companion and Today all count it as account data. Stats "0 ITEMS / — BUDGET / — MATCH". |
| c-24-room-detail.png | "Living Room / 2713 SQ FT · 2 WINDOWS" | room view | activeProject | tap the room card (201,363) | none | Guest lane's corrupt dimensions persist under the account ("59' × 46'"). Row uses **colour emoji 📐 🪟 🚪** and the settings control is a colour **⚙️**, against an otherwise monochrome serif app. "**0 IN AR**" is never defined. The Companion bubble again sits on the primary CTA, clipping "Browse Picks for This Room". |
| c-28-settings-client.png / c-28b-settings-scrolled.png | Settings sheet | `SettingsView` (sheet) | activeProject | Profile → "Settings" (201,690) | none | Sections: ACCOUNT (Account · Sign in on the web), PREFERENCES (Notifications · Haptic Feedback · Upload scans on cellular · Appearance System), PRIVACY & MEMORY (Use activity for context · Forget recent context · Reset taste portrait), SUPPORT (Help Center · Contact Us · Terms & Privacy). **No Sign Out and no Delete Account anywhere in the signed-in app** — the latter is an App Store 5.1.1(v) exposure for an account you can create in-app. Row icons break the palette: the bell tints **pink/red**, "Upload scans on cellular" and "Sign in on the web" tint **blue**, "Use activity for context" tints grey-green. The sheet stacks over the Studio and the 9:41 clock overprints the "Invoices / 1 shared invoice" row behind it. |
| c-27-account-row-inert.png | Settings, unchanged after tapping "Account" | `SettingsView` | activeProject | tap "Account" (209,228) | none | **"Account >" is inert for a signed-in client too** — third independent reproduction (guest g-02b, guest g-37b, client here). There is no Account screen in this build, so the briefed c-27 does not exist. |
| c-30-after-keychain-signout.png | Auth gate | `AuthScreenView` | signed out | **no in-app sign out exists** → `xcrun simctl keychain … reset` + relaunch | none | Recorded as method, not as a screen: the briefed "sign out, sign in as the engaged account" step is **not performable through the UI**. Switching accounts required wiping the simulator keychain from the host. |
| c-31-engaged-home-top.png | Daily Room as "James Okafor" (avatar "J") | `DailyRoomView` | engaged (`james.okafor@example.com`) | password sign-in | "WEDNESDAY · AUG 26"; footer "NEXT STEPS" | **The engaged home is byte-for-byte the guest home.** Next Move = "Bring your first room into Patina / A short scan gives the Companion a real space to work from." — offered to a homeowner whose lead was **accepted and claimed by a designer on Aug 18** and who **already uploaded a room scan** (`lead_room_scans`). No designer, no match, no request status, no scan. Also: the two-step home coach mark **re-fires for the new account** (`Step 1 of 2 / Welcome to Patina`), with system-blue Skip/Next. |
| c-32-engaged-companion.png | Companion "Where to begin?" | companion panel | engaged | tap `companion.bubble` (201,756) | none | Rows: "Add your first space", "Retake the quiz / REFINE YOUR STYLE", "Your recommendations / PIECES FOR YOUR STYLE", "Your profile". **No "Your studio" row at all** — an engaged homeowner has no route to anything about the designer who accepted them. "Retake the quiz" is offered to an account that never took one. |
| c-32b-engaged-profile-studio.png | Profile — "James Okafor / ✦ Style Explorer" | `ProfileView` | engaged | Companion → "Your profile" (201,758) | "MEMBER SINCE AUG 25, 2026" | "0 ROOMS / 0 SAVED / — MATCH" though the server holds a `lead_room_scans` row for this user. Studio reads "**Nothing needs your attention right now.**" / "Awaiting you 0 / Nothing needs a decision." **"Style Explorer" is a fourth name for the taste layer**, after the guest lane's "Warm Modern" (Companion quiz + Profile badge) and "Modern Warmth" (room quiz). |
| c-32c-engaged-studio-rows.png | Engaged Studio — five empty blocks | `ProfileView` studio block | engaged | swipe up | none | "In progress 0 / No active projects yet.", "Conversation 0 / No project conversations yet.", "Money & documents 0 / No shared records yet.", "Archive 0 / Nothing has been archived." **Five stacked zeroes** for a matched homeowner. The one true fact about this account — a designer accepted their request eight days ago — appears nowhere in the app. |
| c-33-engaged-design-request-again.png | "Your design request" — "No scans on this phone yet" | design request sheet | engaged | Studio → "Get design help" (201,663) | none | The title promises the **status of the request they already made**; the body says "No scans on this phone yet / You can scan a room to attach — or request design help without one below" and the only act is "**Request without a scan**" — i.e. file a *second* request. The already-accepted lead is invisible, and the sheet still offers scanning with no scan affordance on it (guest-lane g-30 defect, reproduced signed-in). |
| c-34-final-state-signed-in-client.png | Daily Room, signed in as `client@patina.dev` | `DailyRoomView` | activeProject — **state left for the next lane** | keychain reset + password sign-in + dismiss "Not Now" | "WEDNESDAY · AUG 26"; "2 PROJECT DECISIONS WAITING" | Lane handoff shot. Note the **ACTIVE ROOM card and the "1 SAVED" count are now gone** — the keychain-reset cycle cleared the local store, so the client's true server state (0 rooms, 0 saved) finally shows. This confirms the c-03 leak mechanism: the guest's local SwiftData store was **adopted by the first account that signed in after it**, and is not scoped to a user. |

## Dark mode lane (d-)

| file | screen | route/view | tier/state | how reached (taps) | what is time/date-aware on this screen | defects or surprises |
| --- | --- | --- | --- | --- | --- | --- |
| d-00-current-state-before-dark.png | Daily Room, light, before dark switch | `DailyRoomView` | activeProject | (baseline, no tap) | "WEDNESDAY · AUG 26"; "Today" | Confirms E3's starting state matches c-34 handoff: "Review a project decision / 2 decisions need your eye.", "2 PROJECT DECISIONS WAITING". |
| d-01-home-top.png | Daily Room top, dark | `DailyRoomView` | activeProject, `appearance dark` | (baseline after `simctl ui … appearance dark`) | "WEDNESDAY · AUG 26"; "Today" | Dark palette is a clean near-black/espresso-brown, cream text throughout — good contrast on Next Move card and editorial hero. No clipped text. |
| d-02-home-studio-rows.png | Daily Room, swiped up — unchanged | `DailyRoomView` | activeProject, dark | swipe (201,700)→(201,250) | same | **Confirms c-04's finding in dark too: the signed-in Home does not scroll** — d-01 and d-02 are pixel-identical. There is no "Studio rows" surface on Home itself. |
| d-02-profile-top.png / d-02-profile-studio-rows.png | Profile → STUDIO block, dark | `ProfileView` | activeProject, dark | tap `DailyRoomView.ProfileButton` (364,136), swipe up | "MEMBER SINCE AUG 25, 2026" | Redirected the "home Studio rows" ask to the real Studio hub (per c-06 precedent). "0 ROOMS / 0 SAVED / — MATCH" — the guest-data leak from c-03 is gone (matches c-34). **New defect, dark-mode-specific placement bug**: the fixed status bar (`9:41`, signal icons) draws **over** the scrolled "Proposal / Aspen Loft — Living Room Refresh / Review by Sep 8" row — no safe-area inset on the scrolled Studio list, reproducing c-28's clock-over-content bug but now on the Studio list itself, not just Settings. |
| d-03-browse-pieces.png | "Browse pieces / 10 pieces curated for your space" | browse grid | activeProject, dark | Companion → "Your recommendations" (201,634) | none | **The broken 2-col grid (g-15) reproduces identically in dark**: left card off the left edge ("M & BOARD" / "rloom Oak" clipped, price "4,200" cut to invisible), overlapping card bounds, four different card sizes. Text remains legible against the dark cards (cream-on-brown) where visible. |
| d-04-piece-detail.png | "Couldn't load product / Let's try that again" | product detail | activeProject, dark | tap "Live-Edge Coffee Table" card (293,300) | none | **Confirms c-25's finding is not saved-item-specific**: ANY product tap (a fresh, never-saved "Live-Edge Coffee Table") hits the same broken load. `scan_ui` again returns only the retry link — **hard-trapped, no Back, no way out but `simctl terminate`+relaunch**. Recovery shot: d-04b-relaunch-recover-check.png confirms the client session survives the relaunch cleanly (matches c-29). |
| d-06a-room-summary-light-locked.png | "Here's what I see." room-summary screen | manual room entry, step 3 | activeProject, dark | "Add your first space" → filled 18×14 ft, 2 windows, 1 door → "Continue to Style Discovery" | none | **This screen ignores the system dark-mode override — renders in light (cream background, near-black text) inside an otherwise all-dark app.** Also pins down the exact root cause of the "bad dimensions" bug reported since the guest lane (g-28b, c-24): input 18 ft × 14 ft is shown back as **"59 ft" × "46 ft"** (2713 sq ft) — 18×3.28≈59, 14×3.28≈46 — the app is applying a meters→feet conversion factor to a value the user already entered in feet (the `ft/m` toggle was left on `ft`). |
| d-06-room-detail.png | "Living Room / 2713 SQ FT · 2 WINDOWS" | room view | activeProject, dark | tap "This Looks Right" (261,771) | none | Room view itself **does** honor dark mode (dark gradient hero, dark body). Confirms "59' × 46'" bad-dimension bug carries into the room view too. Stats "0 ITEMS / — MATCH / 0 IN AR" ("IN AR" still undefined). The gear/settings icon here renders as a plain monochrome SF Symbol, not the colour emoji ⚙️ the guest lane (c-24) reported — possibly a per-context rendering difference, not confirmed as fixed. "A blank canvas" copy contradicts "We've already found pieces that would fit this space" one line below it. |
| d-06b-home-with-active-room.png | Daily Room top, room now present | `DailyRoomView` | activeProject, dark, after relaunch | `simctl terminate`+`launch … -DeploymentTarget local` | "WEDNESDAY · AUG 26" | Session and the just-created room both survive relaunch. **ACTIVE ROOM card is an image-less gradient placeholder** ("Living Room", no dimensions/photo shown here) — reproduces c-03/g-40b's finding. |
| d-05 (Saved) — NOT REACHABLE | — | — | activeProject, dark, 0 saved items | Companion panel scanned at both 0-room and 1-room states | — | **No "Saved" row exists in the Companion ("Where to next?") menu while the saved count is 0** — confirmed via `scan_ui` both before and after adding a room. The Companion is the only nav surface (c-05), so Saved is architecturally unreachable until a piece is saved. Attempts to save a piece to populate it were blocked by two compounding defects: (1) tapping a card's heart icon produced no visible state change (outline stayed unfilled) at the coordinates tried; (2) a second tap near the heart/⋯ landed on the card body instead and re-triggered the d-04 hard-trap ("Couldn't load product"), requiring another relaunch to recover. Net finding: **a client who has never saved anything cannot discover what Saved looks like, and the broken product-detail load makes it hard to create that first save at all.** |
| d-07-proposal-detail.png | "PROPOSAL / Aspen Loft — Living Room Refresh / INVESTMENT $18,500.00" | proposal detail | activeProject, dark | Studio → Proposals (201,149) → "Aspen Loft…" card (201,267) | none | Dark rendering is clean and legible throughout (Design Vision / Concept Direction / Space Plan / Product Selections headers all cream-on-near-black). Reproduces d-02's Studio-row accessibility gap: `scan_ui` on the Studio list exposed only Retake Style Quiz / Get design help / Settings / Back as buttons — Proposals/Invoices/Budget/Archive rows are invisible to VoiceOver in dark mode too, confirming c-06d's finding is not a light-mode artifact. |
| d-08-invoice-detail.png | "INVOICE / Awaiting payment / INV-2026-0142" | invoice detail | activeProject, dark | Studio → Invoices (201,227) → invoice card (201,260) | "Due Sep 1, 2026" | Clean dark rendering — TOTAL/PAID/BALANCE $4,250.00/$0.00/$4,250.00, line items "Dining table — deposit (50%)" and "Primary bedroom nightstands (pair) — deposit (50%)", "A note from your designer", "No payments recorded yet." **No visible Pay/Pay Now CTA anywhere on the screen** despite the invoice being "Awaiting payment" with a due date. |
| d-09-companion-panel.png | Companion "Where to begin?" | companion panel | activeProject, dark, 0 rooms/saved | tap `companion.bubble` (201,756) | none | Dark rendering legible (semi-opaque dark sheet over a dimmed Home). Rows now read "Add your first space", "Retake the quiz", "Your recommendations", "Your studio", "Your profile" — confirms the local store really was cleared (matches c-34): no leaked "1 ROOM"/"1 SAVED PIECE" text as in c-05. |
| d-10-notifications.png | "Notifications / Nothing yet" | notifications | activeProject, dark | `DailyRoomView.BellButton` (280,136) | none | Reproduces c-21 in dark: empty bell icon, "Updates from your designer will land here.", "Get design help" CTA — while the Studio still shows 2 overdue decisions, 1 awaiting proposal and 1 awaiting invoice. Clean dark contrast, no clipping. |

## Dynamic Type lane (x-)

| file | screen | route/view | tier/state | how reached (taps) | what is time/date-aware on this screen | defects or surprises |
| --- | --- | --- | --- | --- | --- | --- |
| x-01-home-top.png | Daily Room top, XXL Dynamic Type | `DailyRoomView` | activeProject, light, content_size XXL | `simctl ui … appearance light` + `content_size extra-extra-large` (applied live, no relaunch needed) | "WEDNESDAY · AUG 26"; "Today" | "Review a project decision" now wraps to 2 lines inside the Next Move card; card grows to fit, no clipping. Editorial hero text still fits on 2 lines. No truncation observed on this screen. |
| x-02-profile-studio-rows.png | Profile → STUDIO block, XXL | `ProfileView` | activeProject, XXL | Profile (364,136) → swipe up | "Review by Sep 8" (illegible, see defect) | **Same status-bar-over-content bug as d-02, worse at XXL**: the "Aspen Loft — Living Room Refresh" title and "Review by Sep 8" line of the top proposal card are now partly **occluded by the Dynamic-Island status-bar pill itself**, not just the clock digits — at larger type the row sits directly under the notch. Row heights otherwise grow correctly to fit wrapped text ("Active projects / Aspen Loft Refresh and 1 more" wraps to 2 lines cleanly). |
| x-02b-projects-list-bonus.png | "PROJECTS / 3 projects" | projects list | activeProject, XXL | (mis-tap that landed on "Active projects" row instead of Back) | none | Bonus capture: reproduces c-04b's "completed project sorts first" bug at XXL — "Birch Hollow / Completed / $185,000" above the two in-progress projects. "Marrow & Vale Residence" wraps to 2 lines cleanly; "PHASE / Install" (truncated from "Installation & Styling", per c-04b) still reads as a bare verb, now more prominent at the larger type size. |
| x-09-companion-panel.png | Companion "Where to next?", XXL | companion panel | activeProject, XXL, 1 room (post d-06) | tap `companion.bubble` (201,756) | none | Bonus capture: all 5 rows (Your recommendations / Your spaces / Add another space / Your studio / Your profile) still fit on screen without needing to scroll — title wraps "Where / to next?" to 2 lines, "4 things need your eye." wraps to 2 lines. Row icon chips do not distort. No "Saved" row (0 saved), consistent with the dark-lane finding. |
| x-03-browse-pieces.png | "Browse pieces / 10 pieces curated for your space" | browse grid | activeProject, XXL | Companion → "Your recommendations" (201,447) | none | **New XXL-specific defect**: the filter chip row (All / Seating / Tables / Lighting / Storage) no longer fits the screen width — "Storage" is clipped to "Stor" at the right edge with no horizontal scroll affordance visible. The broken 2-col card grid (g-15/d-03) reproduces and is more visually broken at this text size — left card pushed further off-screen. |
| x-04-piece-detail.png | "Couldn't load product / Let's try that again" | product detail | activeProject, XXL | tap "Live-Edge Coffee Table" card (292,340) | none | Reproduces d-04: hard-trapped, no Back, `scan_ui` returns only the retry link. Recovered via `simctl terminate`+relaunch (session preserved, XXL setting preserved without re-issuing the command). Error text does not appear to scale with content_size the way other screens' text does — worth a follow-up check outside this walk. |
| x-05-proposal-detail.png | "PROPOSAL / Aspen Loft — Living Room Refresh" | proposal detail | activeProject, XXL | Studio → Proposals (201,448) → "Aspen Loft…" card (201,291) | none | **Content clipped by the floating nav button**: the "Space Plan" section's body text ("Conversation seating around the fireplace,…") runs directly into and is cut off by the fixed circular hamburger button at the bottom of the screen — no bottom padding/safe-area reserved for it once text wrapping pushes content that far down. Headings (Design Vision, Concept Direction, Space Plan) scale and wrap cleanly otherwise. |
| x-06-design-request.png | "Your design request" sheet | design-request sheet | activeProject, XXL | Studio → "Get design help" (201,618) | none | **Third reproduction of the missing-safe-area bug, now on a modal sheet**: the sheet's own "Close" button and "Your design request" title are drawn overlapping the `9:41` status-bar clock at the very top of the sheet — the sheet's own top padding does not account for the status bar at XXL. Body reproduces c-33/g-30: "No scans on this phone yet" with only "Request without a scan" offered, the already-real Aspen Loft project context nowhere acknowledged. |

## Appendix: Steward / harness-setup captures (s-)

Not a walk lane — these seven shots proved the harness (tap method, reset recipe, boot state) before the four lanes above began. Kept verbatim for provenance.

| file | screen | route/view | tier/state | how reached (taps) | what is time/date-aware on this screen | defects or surprises |
| --- | --- | --- | --- | --- | --- | --- |
| s-01-first-launch.png | Auth gate — "Welcome home" / "Start with a piece you love" | `AuthScreenView` | signed out, clean first launch | `simctl launch … -DeploymentTarget local` | none | — |
| s-02-after-blitz-tap.png | Daily Room — "Today" with "Step 1 of 2 / Welcome to Patina" coach mark | `DailyRoomView` | guest | blitz tap `auth.welcome.guestButton` (201, 578) | header "WEDNESDAY · AUG 26"; "Today"; editorial story "4 MIN READ" | Coach mark overlays the Next Move card. Proves blitz taps DELIVER (July trap did not reproduce). |
| s-03-after-swipe.png | Daily Room after coach mark dismissed — Next Move "Bring your first room into Patina" | `DailyRoomView` | guest | blitz swipe (201,700)→(201,300) | "WEDNESDAY · AUG 26"; Next Move copy is state-derived | Guest Next Move = "A short scan gives the Companion a real space to work from."; Companion intro card "I'm your Companion." with "Show me" / "Later" |
| s-04-relaunch-guest-persist.png | Auth gate again | `AuthScreenView` | guest state LOST after relaunch | `simctl terminate` + `launch … -DeploymentTarget local` | none | **Guest mode does not survive a relaunch** — walk agents must re-tap "Look around first" every cold start |
| s-05-signed-in-client.png | Daily Room behind an iOS "Save Password?" system sheet | `DailyRoomView` + system sheet | client tier (`client@patina.dev`, activeProject) | password sign-in: `auth.welcome.passwordButton` → email + `password123` → `auth.form.primaryButton` | "WEDNESDAY · AUG 26"; Next Move "Review a project decision / 2 decisions need your eye."; footer "2 PROJECT DECISIONS WAITING" | iOS **"Save Password?"** sheet photobombs the first post-sign-in screen. Not an app defect. Dismiss "Not Now" at (127, 546). |
| s-06-applescript-tap-test.png | Notifications — "Nothing yet" / "Updates from your designer will land here." | notifications sheet | client tier | AppleScript click on `DailyRoomView.BellButton` (pt 280,136 → screen 1107,324) | none | Calibrates the AppleScript fallback: window origin (800,117), inset (+27,+71). Empty state offers "Get design help". |
| s-07-helper-script-tap.png | Notifications (unchanged) | notifications sheet | client tier | `shots/_tap.sh 201 200` (empty area) | none | Confirms the helper script executes; tap on empty space correctly changes nothing |
## Coverage — `AppRoute` cases

`AppRoute` (`apps/mobile/Patina/Patina/App/Coordinators/Coordinator.swift:52–103`) declares 31 cases. Mapped against the 155 shots above using each screen's on-screen title/copy (not filenames, which are the walk agents' own labels and occasionally disagree with the route's `displayName`).

### Reached — at least one shot

| `AppRoute` case | `displayName` | evidence |
| --- | --- | --- |
| `heroFrame` | Home | g-09…g-14b, g-39, g-40b, c-02…c-05, c-31, d-00–d-02, x-01, final-handoff-state — every lane, extensively |
| `yourSpaces` | Your Spaces | c-23-your-spaces.png — **client lane only**; no guest- or dark/XXL-lane shot of this gallery |
| `roomProject(roomId)` | Room | g-26/g-28/g-28b, c-24-room-detail, d-06-room-detail |
| `manualRoomEntry` | Room Details | g-23/g-25, d-check6/7/8 (form-fill steps) — this is the substitute path used everywhere a "scan" was promised (see Not-reached below) |
| `table` | Saved | g-21/g-22/g-22b, c-22/c-22b, g-40, d-check10/11 (investigation) |
| `pieceDetail(pieceId)` | Piece Detail | **reached but never renders** — g-17/g-17b, c-25, d-04, x-04 all hit the same HTTP 300 `PGRST201` load failure; d-check10/12 are byproducts of the same trap. No lane ever saw a working product page. |
| `styleQuiz` | Style Quiz | g-06/g-07/g-07b (Companion-entry quiz) **and** g-26b/g-26c/g-26d (a second, differently-worded quiz reached via room creation) — see note below |
| `styleResult(result)` | Your Style | g-08/g-08b ("Warm Modern") and g-28 ("Modern Warmth") — two different result screens/names for what the code models as one route |
| `profile` | Profile | g-36/g-36b, c-26, c-32b, d-02-profile-*, x-02 |
| `notifications` | Notifications | g-29, c-21, d-10 |
| `designRequests(focusLeadId)` | Design Request | g-31/g-32/g-33/g-34/g-35, c-33, x-06 |
| `projectList` | Projects | c-07-projects-list, c-04b, x-02b |
| `projectDetail(projectId)` | Project | c-08-project-detail |
| `decisionList` | Decisions | c-17-decisions-list |
| `decisionDetail(decisionId)` | Decision | c-18-decision-detail |
| `proposalList` | Proposals | c-09-proposals-list |
| `proposalDetail(proposalId)` | Proposal | c-10/c-11/c-11b/c-11c, d-07, x-05 |
| `invoiceList` | Invoices | c-12-invoices-list, d-check4-invoices-list |
| `invoiceDetail(invoiceId)` | Invoice | c-13/c-13b/c-14 (pay-failure UX), d-08 |
| `budget` | Budget | c-15-budget |

**Note on `styleQuiz`/`styleResult`:** the walk agents document these as two genuinely different quizzes (different option sets — "Classic Comfort"/"Eclectic Curated" vs. "Layered Comfort"/"Curated Mix" — and different result names — "Warm Modern" vs. "Modern Warmth"), which would mean both are the *same* `AppRoute` case rendering divergent content depending on entry point (Companion vs. post-room-creation), not two routes. That divergence is itself the finding (g-40's "inconsistent persistence" row); it is not resolved here.

### Ambiguous — title/route correspondence not established

| `AppRoute` case | `displayName` | note |
| --- | --- | --- |
| `designerConsultation` | Designer | g-30-designer-consultation.png is reached via "Get design help" and captioned by the walk agent as this route, but the on-screen title is "Your design request" — the same title `designRequests` shows on every other shot of this flow (g-31…g-35, c-33, x-06). No shot shows a screen titled distinctly for "Designer". Likely `designerConsultation` and `designRequests` were conflated by the walk agent, or `designerConsultation` is a pass-through with no visible UI of its own — not resolved by this pass. |
| `crossRoom` | All Items | g-22b/c-22b tap an "All items" tab, but that reads as a segmented control *within* the `table` (Saved) screen, not a navigation to a separate "All Items" route. No shot shows a screen unambiguously titled "All Items" outside of Saved. |

### Not reached — no shot, with reason

| `AppRoute` case | `displayName` | reason |
| --- | --- | --- |
| `scanFlow(reason:)` | Quiet Conversation | **Simulator limit** — no camera/LiDAR. Every lane substituted the typed `manualRoomEntry` form for "a short scan," and that substitution itself is a recurring finding (g-23, g-27, d-06a: room dimensions come out wrong because the ft/m toggle silently reinterprets typed feet as metres). |
| `emergence(pieceId:)` | Emergence | **Simulator limit** (AR) — also gated behind the universally-broken `pieceDetail` screen, so even a pieceDetail-adjacent AR entry point was never reachable |
| `roomEmergence(roomId:)` | Emergence | **Simulator limit** (AR), same as above |
| `arPlacement(productId:roomRemoteId:)` | AR Placement | **Simulator limit** — no camera/AR. Room views report "0 IN AR" (c-24, d-06) but that stat was never tapped into or explorable |
| `roomSettings(roomId:)` | Room Settings | **Not reached** — a settings gear icon is visible on room views (c-24, d-06) but no shot documents tapping it; not a hardware limit, just not exercised in the time available |
| `roomSavedItems(roomId:)` | Saved | **Not reached / not distinguishable** — every "Saved" shot captured (table above) appears to be the global Saved screen, not a room-scoped variant; no shot demonstrates entering Saved scoped to one specific room |
| `threadList` | Messages | **Data + UI limit** — c-19-messages-empty.png shows the Studio hub's "Conversation 0 / No project conversations yet." summary card, not a navigable Messages screen; E2's own failure note confirms no compose, no thread list, and no tap target reaches this route in this build. Zero `comms_threads` rows exist server-side for the seeded account either. |
| `threadDetail(threadId:)` | Conversation | **Data + UI limit**, same as `threadList` — with zero threads to open, this is unreachable regardless |
| `documentList` | Documents | **Data + UI limit** — E2's failure note: no "Documents" row exists anywhere in the signed-in app; "Money & documents" holds only Proposals/Invoices/Budget, and `GET /rest/v1/project_documents?...client_visible=eq.true` returns `[]` for this account |

**Summary:** 20 of 31 `AppRoute` cases have at least one confirming shot (one of those, `pieceDetail`, only as a universal failure state — never a working render); 2 are ambiguous pending code-level confirmation; 9 were not reached — 4 for a hard Simulator hardware limit (camera/LiDAR/AR: `scanFlow`, `emergence`, `roomEmergence`, `arPlacement`), 2 for a combined empty-seed-data + no-UI-affordance limit (`threadList`, `threadDetail`), 1 for empty-seed-data + no UI row (`documentList`), and 2 simply not exercised in the walk's time budget (`roomSettings`, `roomSavedItems`).

---

## r — re-walk after stack restart (2026-08-27)

Steward S0, ruling Q12. Device `973D1724-90BF-4A0A-B02D-481D561547B3`, `-DeploymentTarget local`,
signed in as `client@patina.dev`, **after** the stack was restarted from the main checkout
(`research/04-stack-restart.md`) — i.e. the first shots in this program taken with the edge runtime
actually booting. Narrative: `research/05-rewalk.md`.

| shot | screen | what it shows |
| --- | --- | --- |
| `r-00-daily-room.png` | Daily Room | baseline after relaunch — `THURSDAY · AUG 27`, Next Move "Review a project decision / 2 decisions need your eye." |
| `r-00b-profile-studio.png` | Profile → Studio | Studio hub "Awaiting you, 3 categories": Decisions (Overdue · Aug 22), **Invoice $4,250.00 remaining, Due Sep 1**, Proposal (Review by Sep 8) |
| `r-01-invoice-pay-tap.png` | Invoice detail | `INV-2026-0142` fully rendered — TOTAL/PAID/BALANCE, both line items, designer memo, "No payments recorded yet.", CTA `invoiceDetail.pay` "Pay $4,250.00". Taken immediately before the tap |
| `r-02-checkout-page.png` | Invoice detail | **not a Checkout page** — 5 s after the pay tap. `create-checkout-session` returned 502; no `SFSafariViewController` ever opened, so no Apple Pay button and no Stripe test-mode banner could be observed |
| `r-03-pay-failure-raw-stripe-error.png` | Invoice detail | the failure **as the user sees it**: nothing visibly changed. The error is in the a11y tree at y≈763 but below the fold / behind the Companion dock |
| `r-03b-pay-error-after-scroll.png` | Invoice detail (scrolled) | the error revealed, verbatim in red under the Pay button: **"Invalid API Key provided: sk_test_********************alls"**. Also shows the unpinned header colliding with the status bar and back chevron |
| `r-04-return-state.png` | Invoices list | dismissed without paying — still `AWAITING PAYMENT (1)` / `INV-2026-0142` / `$4,250.00` / `Due Sep 1, 2026` |
| `r-05-companion-panel.png` | Companion (over Invoices) | **the panel the review never saw** — headline "Settling up? / 4 things need your eye." + rows Your budget · Message your designer · Proposals · Home · Your profile |
| `r-06-companion-row-result.png` | Budget | result of tapping the top suggested row — `$4,250 BILLED / $0 PAID / $4,250 OUTSTANDING`, Aspen Loft Refresh, invoice row. The review recorded this screen as empty |
| `r-07-companion-rows-shift-by-screen.png` | Companion (over Budget) | same panel, **different rows** — Invoices · Proposals · Your projects · Home · Your profile. Evidence the row set is screen-derived client-side |
| `r-08-companion-daily-room-no-composer.png` | Companion (over Daily Room) | headline "Where to begin?" + Add your first space · Retake the quiz · Your recommendations · Your studio · Your profile. **No composer, no text field** anywhere in the Companion — no message could be sent (no `r-07` conversation shot exists for that reason) |
| `r-09-final-daily-room.png` | Daily Room | state the simulator was left in: signed in, Companion closed, Daily Room |

### H0 verification — piece-detail hotfix (2026-08-27)

Verifier re-walk of commit `0b7f2291d` (`daily-return/w0-hotfix-piece-detail`) against the local
stack. **Rebuilt properly signed** — `xcodebuild build -destination 'platform=iOS
Simulator,id=973D1724-…'` (no `CODE_SIGNING_ALLOWED=NO`), derivedDataPath
`artifacts/ios-daily-return-2026-08-26/.build/h0-verify-dd`, `** BUILD SUCCEEDED **` — the
implementer's own `.app` was flagged `CODE_SIGNING_ALLOWED=NO` and per
`feedback_ios_sim_walk_harness` was not installed for this walk. Installed + launched (`-DeploymentTarget
local`), still signed in as `client@patina.dev`.

| shot | screen | what it shows |
| --- | --- | --- |
| `r-09b-h0-post-install.png` | Daily Room | post-install/relaunch baseline — session intact, no re-auth needed |
| `r-10-piece-detail-loads.png` | Piece detail — "Live-Edge Coffee Table" | **F04 (PGRST201) is fixed.** Tapped from Companion → "Your recommendations" → Browse pieces grid. Full real content renders: image, "Lee Industries", title, "$2,100", "50% match". Kong confirms `GET /rest/v1/products?id=eq.a0000000-…-000000000003&select=*,vendors!products_vendor_id_fkey(name,made_in,brand_story)` → **200**, 2257 bytes (was `PGRST201`/300 pre-fix per `c-25`/`d-04`) |
| `r-11-piece-detail-scrolled.png` | same, scrolled | full detail confirmed: "Reclaimed Hardwood · Hand-Forged Iron", Provenance tags "Maker Piece"/"Coffee-Table", `Add to Room` primary button, top bar Back/Help/Share/Save all present and on-screen |
| `r-12-back-to-grid.png` | Browse pieces grid | **Back worked** — tapped `chevron.left`, returned cleanly to the grid (10 pieces, filter chips, both cards still present) |
| `r-13-piece-detail-2.png` / `r-13b-detail2-topbar-check.png` | Piece detail — "Heirloom Oak Dining Table" | content again real (Kong: product id `…000000000001` → 200, 2368 bytes — the exact id/query from the implementer's own LIVE PROOF). **New finding, not this hotfix's scope**: the top bar (`chevron.left` Back, Help, Share, Save, `Add to Room`) rendered **off-screen** — `scan_ui`/`describe_screen` report `chevron.left` at `x=-85.3` (fully off the left edge); confirmed visually, no back control on screen; a horizontal swipe did not correct it (matches the pre-existing g-15c "grid doesn't scroll horizontally" finding). This card's browse-grid frame was itself off-canvas (`x=150.3, width=284.3` → right edge at 434.6 vs a 402pt screen, per `research/01-shot-ledger.md` g-15/§10-code-anatomy `RecommendationsView`), and the matched-geometry transition into `ProductDetailView` appears to inherit that offset without correcting it. Net effect: **a second, distinct hard-trap** — no PGRST201, real data loads, but Back is unreachable. Recovered via `simctl terminate`+`launch -DeploymentTarget local` (session preserved) — `r-13c-recover-relaunch.png` |
| `r-14-piece-detail-3.png` | Piece detail — "Terracotta Planter Set" | reproduces the same off-screen-top-bar pattern (`chevron.left` at `x=-38.3`) from a *different* off-canvas grid card (`x=-10.7` in the grid). Confirms the pattern is reproducible and tied to the source card's grid position, not a one-off. Recovered via the same terminate+launch |
| `r-15-final-state-daily-room.png` | Daily Room | state the simulator was left in: hotfix build installed, signed in as `client@patina.dev`, Companion closed, on the Daily Room |

**H0 verdict:** the qualified-embed fix (F04/PGRST201) is confirmed live-fixed on the local stack —
three different products now fetch and render real content where every prior attempt (guest, client,
dark, XXL) hard-failed. The errorView back-chevron fix was not exercised (no error state was
reproducible locally now that the embed is fixed — would need a forced-error condition to test that
branch specifically). **New follow-up needed**: the off-screen top-bar/Back trap on 2 of 3 pieces
opened (products `…001` and the Terracotta one) is a real, reproducible hard-trap distinct from F04 —
likely inherited from the pre-existing broken browse-grid card layout (g-15) via matched-geometry
transition — and should be triaged before this is called done for users, since most of the grid's 10
cards are off-canvas per g-15's "wildly differing card sizes" finding.

## w1a

Lane W1a (prerequisites), implementer I1. Simulator clone `dr-w1a`
`66973A52-06CB-4455-8EC1-4C8A75496FA8`, local stack (`-DeploymentTarget local`), flag override
`-PatinaFlags house-first` on every launch, signed simulator build from
`.codex/worktrees/agent-dr-w1a-prereq/.build/dd/.../Patina.app`. Claim level: **sim-verified**.

| Shot | Surface | What it shows |
|---|---|---|
| `w1a-01-james-matched-today.png` | Today, `james.okafor@example.com` | The SP-07 matched branch, reachable for the first time: `"See your design request"` / `"You're matched with Leah Hartwell"`. James's seeded lead is `status='accepted'`, claimed, `client_request_id IS NULL` — the exact row the dropped filter excluded, which is why this account previously saw the guest-identical `"Bring your first room into Patina"` |
| `w1a-02-get-design-help-existing.png` | Profile → "Get design help", same account | Opens the EXISTING request (`DESIGNER MATCHED` / `"You're matched with Leah Hartwell"` / the Request sent · Introduction · Discovery timeline) instead of the compose sheet. `select count(*) from leads where homeowner_id = '28fd9d2c-…'` = **1 before, 1 after** — no second lead filed |
| `w1a-03-studio-subhead-count.png` | Profile → Studio, `client@patina.dev` | Subhead reads `"4 things need your eye"` from `BadgeCountService.attentionCount`. The `"Awaiting you, 3 categories"` block below it is unchanged and now distinct in wording — it counts grouped rows, which is a different and honest number. The Conversation block reads `"Conversation · Start one with your designer"` with `"Opens Messages."` — SP-13's route at zero threads |
| `w1a-04-daily-room-footer-count.png` | Daily Room Companion, same account | The same `"4 things need your eye."`, where the pre-change build printed `"2 project decisions waiting"` on this surface. Also carries the new `"Message your designer"` row (`DesignerRelationship.isLive`) |
| `w1a-05-companion-count.png` | Profile Companion, same account | `"4 things need your eye."` again — third surface, one number |
| `w1a-06-project-message-designer.png` | Project detail (Aspen Loft Refresh) | The new `projectDetail.messageDesigner` affordance: `"Message your designer / Ask a question about this project"` |

**Server-side evidence (not screenshot-only).** Tapping the project-detail affordance called
`rpc_start_project_thread` and Postgres gained the row: `comms_threads` went 1 → 2, the new row is
`kind='project'`, `project_id='b0000000-…-0000000000d1'`, and its first message is the RPC's own
system line `"Project conversation opened."`. The app pushed the thread detail with a live compose
field.

**Flag override, proven.** `os_log` on the clone, launch with `-PatinaFlags house-first`:
`[com.patina.app:ui] [FeatureFlags] resolved via launch-arguments: on=[house-first]`. Nothing reads
the flag until W3 mounts the tab bar, so a DEBUG-only resolution log line is what makes it
observable on a walk.

**Not verified.** Nothing device-dependent was touched, so there is no device claim here. The
`.roster` branch of `DesignerRelationship` could not be exercised at all: `designer_clients` has no
client-side SELECT policy (00014:110 and 00316:39 are both designer-side), so the client's select
returns empty by RLS. Signing out through Settings → Account also could not be exercised — that row
does not push (the known SP-20 / F45 defect); the walk used a simulator keychain reset instead.

---

## w1b-b

Lane B (money & studio), branch `daily-return/w1b-b`, simulator `dr-w1b-b`
`8A414D4A-8CD2-4867-ADBE-4F00FAEB5E06` (iPhone 17 Pro, iOS 26.5), signed build installed from
`.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`, launched `-DeploymentTarget local`,
signed in as `client@patina.dev`. 2026-08-27 ~11:55–12:05 UTC−5.

⚠ The local stack has been reset by lane D since W0's re-walk, so **`INV-2026-0142` no longer
exists**: `select count(*) from invoices` = **0**, and no seed file creates one (`config.toml`
`[db.seed] sql_paths` has no invoice seed). Every invoice-surface shot in this row is therefore
unavailable, and the invoice half of SP-15 is unit-verified only — see the "not sim-verified" note
at the end.

| Shot | Surface | What it shows |
|---|---|---|
| `w1b-b-01-studio-budget-row.png` | Profile → Studio | SP-16: the Money & documents row reads `Budget` / **"What's been billed, and what's been paid"** — the row id is unchanged (`records.budget`), only the subtitle, which used to promise "Project totals and payment progress" from a screen that computes neither |
| `w1b-b-02-proposals-accepted-not-signed.png` | Proposals list | SP-04: **`ACCEPTED (1)`** over `Sample accepted proposal`, whose row label also reads `Accepted`. `select signed_at, signed_by_name from proposals where title='Sample accepted proposal'` is `null, null` — the proposal the app used to file under `SIGNED (1)` |
| `w1b-b-03-proposal-detail-expiry.png` | Proposal detail (Aspen Loft — Living Room Refresh) | SP-15: `proposalDetail.expiry` = **"Expires Sep 10"** in the investment summary. The list printed this and the detail dropped it |
| `w1b-b-04-proposal-sign-clears-hearth.png` | Same, scrolled to the end | SP-19 (money half): `proposalDetail.sign` measures y 644–696; the Hearth region begins at y 720. The primary act is fully clear of it, from `MoneyScreenMetrics.bottomClearance` rather than the old hard-coded 140 that still collided |
| `w1b-b-05-sign-sheet-restated-terms.png` | Proposal → Sign proposal sheet | SP-04: the sheet restates **TOTAL $18,500.00** and **EXPIRY Expires Sep 10, 2026** above the name field, with the existing instruction line verbatim below them. No Project / Deposit / Terms rows draw — the bundle returns null for all three on this proposal, which is the "absent honestly" rule working, not a missing row |
| `w1b-b-06-decisions-list-due-dates.png` | Decisions list | SP-15: **"Overdue · Aug 23"**, **"Overdue · Aug 24"**, **"Due Sep 1"** on the three cards. The Studio hub printed these and the list printed nothing |
| `w1b-b-07-decision-detail-due-and-defer.png` | Decision detail (Rug color - Natural vs Sand) | SP-15 `decisionDetail.due` = **"Overdue · Aug 24"**; SP-17 the two new acts `Not yet` and `Neither of these`, each with a 44 pt hit area (`decisionDetail.defer.notYet` = 48×44, `…neitherOfThese` = 108×44) |
| `w1b-b-08-decision-defer-sheet.png` | Same → "Not yet" | SP-17: the note sheet, prefilled and editable — **"About Rug color - Natural vs Sand — not yet. I need a little more time before I decide."** — under "This goes to your designer as a message. The decision stays open." |
| `w1b-b-09-defer-note-in-thread.png` | Same → Send | SP-17: the app opened the project thread and the note is in it, sent by "You" |
| `w1b-b-10-budget-billed-to-date.png` | Budget | SP-16: the H3 reads **"Billed to date"**, not "Your budget"; the empty state reads "Nothing billed yet" (true — this stack has zero invoices) |
| `w1b-b-11-project-detail-no-client-view.png` | Project detail (Aspen Loft Refresh) | SP-05: the overview card carries **BUDGET and STATUS only** — no CLIENT VIEW tile — and the designer's portal instruction is gone, replaced by "Your designer is still putting the phases together." / "No payment schedule yet." / "No furnishings list yet." |

**Server-side evidence (not screenshot-only).** After the deferral send:

```
$ psql … -tAc "select title, status, responded_at from client_decisions where title like 'Rug color%';"
Rug color - Natural vs Sand|pending|

$ psql … -tAc "select left(body,70), created_at from comms_messages order by created_at desc limit 1;"
About Rug color - Natural vs Sand — not yet. I need a little more time|2026-08-27 16:59:26.993565+00
```

The note reached `comms_messages` and the decision is still `pending` with a null `responded_at` —
SP-17's whole contract (`client_decisions.status` is CHECK-constrained to
`draft|pending|responded|expired`, 00062:80-81, so a deferral must be a message, not a state).

And the tile SP-05 removes was really there to remove:

```
$ psql … -tAc "select name, client_visibility_tier from projects where name='Aspen Loft Refresh';"
Aspen Loft Refresh|milestone
```

**Not sim-verified in this row.** Everything on the invoice rail — the due line on invoice detail,
the Patina-voice pay failure above the button with its two acts, the settle banner's truthful
default, and the paid-invoice payments line — is **unit-verified only** (`InvoicesMoneyRailTests`,
`MoneyAndStudioCopyTests`), because the local `invoices` table is empty and no seed recreates it.
The wave's acceptance walk cannot cover those lines either until an invoice exists; raised in
`waves/w1b/b-notes.md`. No device claim is made anywhere in this row.

## w1b-a

Lane W1b A (piece & saved), implementer. Simulator **`dr-w1b-a`
`15C4C76A-DCDD-43C1-9119-D0B022F0A653`** (a fresh iPhone 17 Pro / iOS 26.5 device, not a
clone of the review device — see `waves/w1b/steward.md` §3), local stack
(`-DeploymentTarget local`), **guest** lane throughout (the password sheet does not open
on this clone — `waves/w1b/a-notes.md` §6). Signed simulator build, no
`CODE_SIGNING_ALLOWED=NO`, from
`.codex/worktrees/agent-dr-w1b-a/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`.
Claim level: **sim-verified** except where a row says otherwise.

| Shot | Surface | What it shows |
|---|---|---|
| `w1b-a-01-before-piece-topbar-offcanvas.png` | Piece detail — "Heirloom Oak Dining Table", **before SP-02** | The H0 follow-up reproduced and measured. Content is dragged off-canvas to the left: the title reads "…om Oak Dining Table", the material line "…te White Oak", and the Back chevron is not in the accessibility tree at all. `scan_ui`: `Add to Room` at **`x = -77.3, width = 556.3`** on a 402 pt screen; `Help` at `x = 363.3`. 556.3 = a 1200 px-wide photo fill-scaled to `height: 340` — the hero image reporting a size wider than the screen and taking its whole `ZStack` with it. The edge-swipe-back does not recover (matches `r-13`); recovered by terminate + launch |
| `w1b-a-02-after-browse-grid-one-card-size.png` | Browse pieces grid, **after SP-02 + SP-10** | One card size, all four cards on canvas, every image clipped to one 4:3 area. Subtitle reads **"10 pieces chosen for your space"** (was "curated"). Maker lines now come from `products.brand` — NORDIC ATELIER, HERITAGE LUMBER, REJUVENATION, SCHOOLHOUSE — where the pre-change build printed the vendor ("ROOM & BOARD") and, for the planter, the literal "Unknown Maker" |
| `w1b-a-03-after-piece-topbar-onscreen.png` | Piece detail — same piece, **after SP-02 + SP-10** | The same screen as `w1b-a-01`. `scan_ui`: Back **`x = 16`**, Help 262, Share 306, Save 350, `Add to Room` **`x = 24, width = 354`** = 402 − 2×24 exactly. The SP-10 spec block renders real local data: `SIZE 96″ W × 40″ D × 30″ H`, `LEAD TIME Ships in 10 weeks`, `MAKER Nordic Atelier`, `FINISH Hand-rubbed tung oil`, then the description. (`products.dimensions` / `lead_time_weeks` / `brand` are read on the direct-fetch path, which already selects `*` — they do not wait on 00533) |
| `w1b-a-04-piece-spec-absent-honestly.png` | Piece detail — "Terracotta Planter Set" | **Absent honestly.** This row has null `dimensions` and null `lead_time_weeks`: `SIZE` and `LEAD TIME` do not draw at all, while `MAKER Rejuvenation` and `FINISH Unglazed terracotta` do. No placeholder, no em-dash, no "—" |
| `w1b-a-05-saved-door-at-zero.png` | Daily Room Companion, nothing saved | **SP-12.** The row reads `"Saved, Nothing saved yet, ›"` and routes to `.table`. Before the change `collectionsRow` returned `nil` at a zero count, so the app's only route to the Saved screen did not exist for a reader who had never saved anything |
| `w1b-a-06-saved-opens-on-all-items.png` | Saved | Opens on **All items** with the tab underlined, not on "Boards" / "No boards yet". The piece a reader just saved is no longer one tab away from the screen that opens |
| `w1b-a-07-profile-no-unexplained-match.png` | Profile, guest | **SP-18.** Two stats — `0 ROOMS`, `0 SAVED`. The `MATCH` tile (which printed `styleProfile.confidence` under a label claiming a match against nothing named) is gone |
| `w1b-a-08-room-no-ar-stat-one-cta.png` | Room detail — "Living Room" | **SP-18 + SP-11.** The stat row is two cells, `0 ITEMS` and `— ROOM MATCH`; `0 IN AR` is gone (`usdz_url` is hard-coded NULL on every path, so it could only ever read zero) and `MATCH` now names what it matches against. Below, the stacked triple ask has collapsed to one control: **"Browse pieces for the Living Room"** |
| `w1b-a-09-card-menu-add-to-room.png` | Browse grid card menu, with one room | **SP-11.** The card menu carries **"Add to room"** (`AXUniqueId: square.grid.2x2`, `{{16, 561.3}, {250, 42}}`) above Share / Not for me / View details. It draws only because a room exists. ⚠ **Claim level: the affordance is sim-verified; the tap-through is not.** The `.contextMenu` does not accept simulated taps through this harness (5 attempts, tap + swipe, 60–1200 ms, menu stays open) — `waves/w1b/a-notes.md` §6 |

**Not verified, and why.** No device claims. SP-06's claim sheet is compile-green only
— it presents on the first sign-in of an install carrying guest work, and sign-in does
not complete on this clone (`a-notes.md` §6); its decision is unit-pinned four ways in
`AccountIsolationTests`. SP-14's `saved_items` mirror writes as the signed-in user, so
it is compile-green + unit-pinned (`SavedItemMirrorTests`), not sim-verified; its local
half (idempotent save, seeded `isSaved`, one currency formatter) is unit-pinned. The
room-scoped browse fell back to the unscoped feed as designed, because a guest's room
has no `remoteId` (U07) — so the room-named title was not exercised either.

### Fix round (`waves/w1b/a-fix-log.md`, commits `5a6cd508f`, `4b1f7ed59`)

Same simulator, same signed build, **guest**, fresh install (`simctl uninstall` +
`install` + `launch -DeploymentTarget local`), local stack now carrying lane D's
00533–00536.

| Shot | Surface | What it shows |
|---|---|---|
| `w1b-a-10-guest-saves-survive-grid.png` | Browse pieces grid, guest, after two saves | **The blocking finding, closed.** Two pieces saved from the grid (swipe-right → `toggleSaved` → `saveProduct`, the same call the heart makes) carry **filled** hearts — Heirloom Oak Dining Table and Live-Edge Coffee Table — while the two untouched cards carry outlined ones. No failure banner. On the reviewed code the same taps deleted their own local row and printed "Couldn't save — check your connection and try again." Subtitle still reads **"10 pieces chosen for your space"**: the SP-10 withhold removes nothing here, because every feed row resolves a maker once 00533 returns `brand` |
| `w1b-a-11-guest-saved-shelf-two-pieces.png` | Saved → All items, same guest session | Both saves are on the shelf with their maker lines (HERITAGE LUMBER, NORDIC ATELIER) and `$2,100` / `$4,200` through the one formatter. The guest's save survived leaving the screen — which is the whole of SP-14's local half |

**Measured, not photographed.** `scan_ui` on each piece screen after its save reports the
primary button as `Saved ✓` and the top-bar heart as `heart.fill` / "Remove from saved",
seeded from the local store.

**Still not sim-verified, and why.** SP-10's *withhold* draws no visible change on this
stack: `select name, maker_name, brand from get_recommendations(...)` returns ten rows and
all ten carry a `brand`, so nothing is withheld (the four rows the RPC still calls
"Unknown Maker" are rescued by `brand`). Showing a withheld card would need a product with
neither `brand` nor `vendor_id`, and seeding one means writing to the local stack, which is
lane D's alone this wave. The filter is **unit-pinned** (`ProductDecodingTests`), and
`w1b-a-10` is the negative check: nothing with a maker is withheld.

**Gate at the tip of the lane branch** (`daily-return/w1b-a`):
`ios-gate.sh build` → `** BUILD SUCCEEDED **`; `xcodebuild test -only-testing:PatinaTests`
on `dr-w1b-a` → **`Test run with 700 tests in 88 suites passed`** (671 on the W1a base;
+24 across `ProductDecodingTests`, `BrowseGridContractTests`, `SavedItemMirrorTests`,
`CompanionActionMatrixTests`, `DailyRoomFeedMappingTests`, `AccountIsolationTests`, then
**+5 in the fix round** — 3 in `SavedItemMirrorTests`, 2 in `ProductDecodingTests`).

---

## w1b-c

Lane W1b-C (identity, reach & notify), implementer. Simulator `dr-w1b-c`
`18B12089-F4E2-4523-9173-1353A7F74CDF` (iPhone 17 Pro · iOS 26.5, logical 402×874), local stack
(`-DeploymentTarget local` on every launch), **signed** simulator build (no
`CODE_SIGNING_ALLOWED=NO`) from
`.codex/worktrees/agent-dr-w1b-c/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`.
Accounts: **guest** for SP-09 and the Settings-reach bisect, **client@patina.dev** for the bell,
the primer, the money screens and Settings signed-in. Claim level: **sim-verified** unless a row
says otherwise.

| Shot | Surface | What it shows |
|---|---|---|
| `w1b-c-01-bisect-account-pushes-on-label.png` | Settings → Account, guest, **pre-change build** | The SP-20 bisect's second half. Tapping the **word** "Account" pushes `AccountView` (Back chevron + "Sign Out" now on screen); the first half is not a shot but a state — a tap at (209, 228), the dead centre of the row's own 338×44 frame, left `scan_ui` byte-identical. The `NavigationLink` and its destination were always correct: `.buttonStyle(.plain)` hit-tests only the label's drawn content and `settingsRow`'s middle is a `Spacer()` |
| `w1b-c-02-request-review-signin-hint.png` | Design request → Review, guest | SP-09's first repair, said on the way in: **"You'll sign in to send this."** under the summary rows, above "Send request" |
| `w1b-c-03-soft-wall-title-and-cancel.png` | The soft wall after "Send request", guest | SP-09's second: the sheet now carries the title **"Sign in to send your request"** and a **Cancel**. Before, it was the bare gate with no Cancel, no ✕ and no "Look around first" (`showGuest: false`) |
| `w1b-c-04-soft-wall-cancel-returns-to-review.png` | Back on Review after Cancel | Cancelling returns to Review with all four answers intact (Scans / Help / Budget / Timeline unchanged) — the work was never at risk, and now the screen says so |
| `w1b-c-05-account-pushes-on-centre-tap.png` | Settings → Account, guest, **post-change build** | The same dead-centre tap that did nothing now pushes `AccountView`. `scan_ui` also reports the rows as **354×56** where they were 338×44 |
| `w1b-c-06-push-primer.png` | Daily Room, `client@patina.dev` | `PushPrimerView`, presented once, before the first money push: "Before we interrupt you" + ruling Q7's sentence **verbatim** (straight apostrophe and em dash, as ruled), "Turn on notifications" / "Not now" |
| `w1b-c-07-bell-agrees-with-studio.png` | Notifications, same account | SP-08. **Three** decision rows (`hand.raised`, "A decision needs you") where the same data drew **six** before de-duplication, plus one **composed** Proposal row from the Studio queue — no timestamp, no unread dot, because it was never delivered. Footer reads "4 THINGS NEED YOUR EYE", the same number the Studio and the Companion print |
| `w1b-c-08-settings-signout-delete.png` | Settings, same account | SP-20: **Sign Out** and **Delete account** in the Account group, signed-in only (the guest shots above correctly show neither) |
| `w1b-c-09-delete-account-confirmation.png` | Delete account confirmation | "Close your account? / This removes your account and everything Patina keeps on this device. It can't be undone." |
| `w1b-c-10-delete-failure-patina-voice.png` | Settings after a failed delete | The local stack serves **404** for `/functions/v1/delete-account` (lane D authored it; it is not deployed locally — verified by `curl`), and the failure renders as **"We couldn't close your account just now. Try again, or write to hello@patina.cloud."** in place, above the fold, with no vendor text and no splash flash (C5). **The account was not deleted** — this exercised the failure path only |
| `w1b-c-11-proposal-scrolled-hearth-not-painted.png` | Proposal detail, scrolled to the bottom | SP-19: **"Sign proposal" renders whole**, with the Companion orb below it. The Hearth's opaque band is gone; the 120 pt reservation is unchanged. (The status-bar overprint still visible at the top of this shot is F114 — lane B's half of SP-19, not touched here) |
| `w1b-c-12-unit-segmented-control-feet.png` | Manual room entry | SP-19: ft/m is a real segmented control with an unmistakable selected state, and the fields read **"LENGTH (ft)" / "WIDTH (ft)"** — the unit is now stated where the number is typed |
| `w1b-c-13-unit-segmented-control-metres.png` | Same screen, "m" selected | The selection moves and the field labels follow to **"(m)"**. Nothing is written to device defaults, so the next visit starts in feet — the F40 defect was that a single past tap on "m" silently reopened in metres and turned 18×14 into 59'×46' |
| `w1b-c-14-share-sheet-client-piece-url.png` | Browse pieces → ⋯ → Share | SP-03, the most-cited finding in the program: the sheet now reads **"Patina Client Portal" / "client.patina.cloud"** where it read "Patina Designer Portal" / "app.patina.cloud" |

**Measured, not photographed.** `scan_ui` reports the manual-entry steppers at **44×44**
(`"Remove one windows"`, `"Add one windows"`, `"Remove one doors"`, `"Add one doors"`) where they
were 32×32 and unlabelled; the settings rows at **354×56** where they were 338×44.

**Server-side evidence.** Lane D's `notify_client_attention` rows are already applied on the local
stack, and reading them is what found three defects a green test suite did not:
`select type, channel, status, metadata->>'entity_type' … from notification_log` returns **six** rows
for three decisions — `decision_attention`/`in_app`/`delivered` and `decision_attention`/`push`/`queued`
per event, both admitted by the feed's channel filter. The `type` spelling (`decision_attention`) was
in no client table, so every row landed in the `.newRecommendations` bucket and drew a sparkles icon.
The client now takes its bucket from `metadata.entity_type` and collapses the twin rows.

**Not verified.** `ScanFloorPlanPreviewView`'s dark-mode repair is **compile-green + source-pinned
only**: that screen sits after a real LiDAR scan, which the Simulator cannot produce, and the manual
fallback routes to the Style Conversation instead. The pin asserts no raw `offWhite` / `charcoal` /
`pearl` constant survives in the file; an appearance walk is owed on a device. Nothing else here is
device-dependent, so there is **no device claim in this lane** — in particular, a universal link
actually opening the app is device-gated and waits on lane D's AASA deployment; only the URL shape,
the parser and the entitlement's presence in the built app are claimed.

### w1b-c · fix round (review findings)

Same worktree, same simulator `dr-w1b-c` `18B12089-F4E2-4523-9173-1353A7F74CDF`, re-installed from
the signed `.build/dd/Build/Products/Debug-iphonesimulator/Patina.app` (`codesign -dv` →
`flags=0x2(adhoc)`), launched `-DeploymentTarget local`. 2026-08-27 ~12:54 UTC−5.

**⚠ No shots were captured this round, and the reason is not the app.** The fix round's finding 3
asked for a walk of the three call sites the new `AuthSheet` chrome reaches. The app launched and
stayed alive (`cloud.patina.app: 34832`, confirmed via `simctl spawn … launchctl list`) and the
local stack answered (`GET /rest/v1/ → 200`), but the harness would not deliver touches to this
clone: three taps on `auth.welcome.guestButton` at the centre of its own reported `AXFrame`
(`{{27.25, 552.25}, {347.5, 51.5}}`) and one on `auth.welcome.passwordButton` each returned
`"Tapped at (…)"` and left the auth gate on screen, verified by screenshot. This is the same
environment failure lane B recorded above on its own clone, ten minutes earlier.

Rather than assert a walk that did not happen, the un-walked surface was **removed in code**
(`ce0469c17`): `AuthSheet`'s nav bar and Cancel now apply only to the titled SP-09 presentation, so
the app-level `.auth` sheet raised by the Studio hub CTA, the notification feed's guest CTA and the
Companion prompt renders exactly as it did before this lane touched the file. Pinned by
`AuthSheetPresentationTests` — *"only the titled presentation carries the nav bar and Cancel."*

An earlier draft of `waves/w1b/c-fix-log.md` cited shots `w1b-c-15` / `w1b-c-16` for this walk.
**Those shots were never taken and no such rows exist**; that log has been corrected.

### w1b-b · fix round (Dynamic Type XXL)

Same worktree, same simulator `dr-w1b-b` `8A414D4A-8CD2-4867-ADBE-4F00FAEB5E06`, re-installed from
the signed `.build/dd/Build/Products/Debug-iphonesimulator/Patina.app` at `9f9386dae`, launched
`-DeploymentTarget local`, still signed in as `client@patina.dev`. Content size set with
`xcrun simctl ui <udid> content_size extra-extra-extra-large` and re-read back as
`extra-extra-extra-large` before and after the run. 2026-08-27 ~12:39–12:50 UTC−5.

Run to close the review's B-5: SP-19's named acceptance step is *"Verify at Dynamic Type XXL on the
four money screens"*, and the first round did not run it.

| Shot | Surface | What it shows |
|---|---|---|
| `w1b-b-12-xxl-proposals-list.png` | Proposals list, XXL | The status bar ("12:41") is legible over an opaque band and the list content passes behind it, not through it. `AWAITING YOUR REVIEW (1)` / `ACCEPTED (1)` both still read; `Expires Sep 10` wraps rather than truncating |
| `w1b-b-13-xxl-proposal-detail-top.png` | Proposal detail, XXL, at rest | SP-19's second half: at XXL the plank says the Dynamic Island pill "blots out a proposal title outright". It does not here — "Aspen Loft — Living Room Refresh" wraps to two lines fully below the band, and `proposalDetail.expiry` ("Expires Sep 10") renders under the investment figure |
| `w1b-b-18-xxl-proposal-detail-scrolled.png` | Same, scrolled ~40 % | Scrolled content passes **behind** the top band — "Design Vision" is clipped at the band's lower edge rather than being overprinted by the clock. This is the whole of what `moneyScreenTopBand()` claims to do |
| `w1b-b-17-companion-budget-label.png` | Companion sheet, XXL | Evidence for `b-notes.md` §7 (review finding B-4), not a lane B deliverable: the Companion row reads **`Budget` / `YOUR SPEND`** over route `.budget`, whose screen SP-16 renamed to "Billed to date". The disagreement F56 names, one layer out |

**⚠ Not captured, and why — stated rather than implied.**

1. **The proposal detail's `Sign proposal` button at XXL was NOT reached.** The blitz swipe
   injection could not drive this `ScrollView` to its end at XXL: a full-height drag advanced the
   content ~15–50 pt and then rubber-banded, and batched swipes returned it to the top. Roughly
   thirty swipes covered about 40 % of the screen (`w1b-b-18`). So the Hearth-clearance half of
   SP-19 is verified at **default type only** (`w1b-b-04`, first round: `proposalDetail.sign`
   y 644–696 against a Hearth beginning at y 720) and is **not** verified at XXL.
2. **Decision detail and Budget at XXL were not captured.** Partway through the run the harness
   stopped delivering navigations — taps rendered their pressed state but no push occurred, through
   an app relaunch and a full `simctl shutdown`/`boot` cycle. An environment failure, not an app
   one: the same taps worked ten minutes earlier in the same session on the same build.
3. **Invoice detail at XXL remains unavailable** for the same reason as the first round — the local
   stack has zero invoices and no seed creates one (`b-notes.md` §4).

So of SP-19's four money screens, XXL is sim-verified on **one** (proposal detail, top and scrolled)
plus the proposals list; two were blocked by the harness and one by missing seed data. The three
money sheets' new `.moneyScreenTopBand()` is **compile-green and unit-asserted only**
(`MoneyAndStudioCopyTests.moneySheetsReserveTheStatusBar`), not sim-verified.

---

## w1b walk

Walker (acceptance walk), review simulator `973D1724-90BF-4A0A-B02D-481D561547B3`, local stack
(`-DeploymentTarget local`, no `-PatinaFlags`), signed integration build from
`.codex/worktrees/agent-dr-w1b-integration/.build/dd-signed/.../Patina.app` at head `ef32ec5b6`.
Full report: `waves/w1b/walk.md`. **Verdict: FAIL — a release-blocking crash consumed most of the
budget; see `walk.md` Finding 1.**

**Blocking finding, not a shot.** `client@patina.dev` — the walk's primary account — crashes the
app on every launch the instant the Daily Room (`.heroFrame`) renders:
`Patina/CompanionContextProvider.swift:106: Assertion failed: Companion menu for heroFrame exceeds
6 rows (7)`. Reproduced 4/4, including from a keychain-reset **fresh interactive sign-in** (not
only a stale-session resume). Since `.heroFrame` is the app's one `NavigationStack` root
(`ContentView.swift:211-214`), nothing downstream — Proposals, Invoices, Decisions, the bell,
Settings, Sign Out — is reachable for this account. `james.okafor@example.com` is separately
unusable: GoTrue 500s on sign-in (`confirmation_token` NULL in the seed row). The walk therefore
ran almost entirely on the **guest** account; every item needing an authenticated client is
reported BLOCKED in `walk.md`, not fabricated.

| Shot | Surface | What it shows |
|---|---|---|
| `w1b-01-browse-grid.png` | Browse pieces, guest | Uniform 2-column grid, all filter chips (`All/Seating/Tables/Lighting/Storage`) render unclipped and scroll |
| `w1b-02-piece-detail-1-heirloom-oak.png` | Piece detail #1 | SP-10 full contract: SIZE `96″W×40″D×30″H`, LEAD TIME `Ships in 10 weeks`, MAKER `Nordic Atelier`, description — no PGRST201, no off-screen top bar |
| `w1b-03-share-sheet.png` | Share sheet, same piece | Preview host is **`client.patina.cloud`**, not `app.patina.cloud` — SP-03's URL fix confirmed. Title reads the domain's cached "Patina Client Portal," not the piece — expected, the public piece route isn't deployed this wave |
| `w1b-04-save-confirmation.png` | Same piece, after Save | Heart fills, CTA reads `"Saved ✓"`; heart AX label flips `Save` → `Remove from saved` |
| `w1b-05-piece-detail-2-live-edge.png` | Piece detail #2 | `Live-Edge Coffee Table` — SIZE/LEAD TIME/MAKER all render; heart already `.fill` — pre-existing save from earlier device use, not new |
| `w1b-06-piece-detail-3-terracotta-absent-fields.png` | Piece detail #3 | `Terracotta Planter Set` — SIZE and LEAD TIME are **genuinely absent** (columns null; no placeholder text), FINISH renders instead — SP-10's "absent honestly" clause confirmed |
| `w1b-07-saved-all-items-no-date.png` | Saved, All items | Defaults to All items (not Boards) with 3 saved pieces — SP-12 confirmed. No date renders on any row; see `walk.md` for the W1b-vs-W4 scope note |
| `w1b-08-CRASH-daily-room-heroframe-companion-7-rows.png` | Springboard, post-crash | The simulator kicked back to the home screen after `client@patina.dev` sign-in — the app process is dead (confirmed via `launchctl list`), this is the crash's own visible aftermath, not a screenshot of the crash itself |

**Also verified, no separate shot file (see session record / `walk.md`):** the manual room-entry
screen's `ft \| m` control is a real segmented control with a clear selected state (toggling to
`m` live-updates both field labels to `LENGTH (m)`/`WIDTH (m)`); window/door steppers measure
44×44 with real VoiceOver labels; Settings → Account pushes correctly (SP-20's dead-tap defect is
gone) and shows "Not signed in" for guest; `Sign Out`/`Delete account` rows are confirmed present
in `SettingsView.swift` at compile level but not sim-verified signed-in, per the crash blocker.

**A residual SP-02 finding, found only via the accessibility tree, not visible in any screenshot.**
`describe_screen` on the Browse grid returned `Heirloom Oak Dining Table`'s real hit-frame as
`{x: -4.33, y: 218, w: 228, h: 262.3}` and `Live-Edge Coffee Table`'s as `{x: 207, y: 154, w: 171,
h: 326.3}` — same visual row, 64pt Y-origin mismatch, different heights, one frame reaching
off-canvas. A coordinate tap aimed at the row-2 card underneath (`y: 460`/`475`, inside Heirloom's
oversized `y: 218–480` hit-box) opened Heirloom twice before the real frame centers were used. The
rendered screenshot shows a clean aligned grid; the tap geometry does not match it. Matches the
plank's own language ("the matched-geometry transition inheriting the off-canvas card offset").

**Server-side evidence for the bell (not a client screenshot — the client screen is blocked).**
Ran unsandboxed against local Postgres, before any client testing:
`select notify_client_attention('a0000000-…-005', 'invoice', '…e142', 'Invoice due Sep 1', …)` and
the equivalent for decision `…d2c03` (Rug color). `notification_log` afterward: exactly one
`in_app`/`delivered` row per entity (de-dup on `(user, entity_type, entity_id)` confirmed — the
invoice call ran twice, one row survived), plus two more pre-existing decision rows — 1 invoice +
3 decisions total, covering "the open invoice and the two decisions." The client Notifications
screen that would render these is unreachable per the blocking finding.

**Re-shoot targets (w1b-90..93) not captured.** All four (Studio subhead fallback, "Awaiting you"
item-count badge, Today's decision Next Move copy, Studio Conversation row at zero threads) live on
the Daily Room or Studio hub — both downstream of the crash for any authenticated client.

---

## w1b re-walk

Walker (acceptance re-walk after the fix round), review simulator
`973D1724-90BF-4A0A-B02D-481D561547B3`, local stack, signed integration build from
`.codex/worktrees/agent-dr-w1b-integration/.build/dd-signed/.../Patina.app` at head `6d4a0ba5c`
(the third and last of the three fix-round commits). Full report: `waves/w1b/walk.md` (rewritten in
place as the wave's final record). **Verdict: FAIL — one item (Pay-failure card under the Companion
dock on Invoice detail); both prior release-blockers (Companion crash, James's sign-in) are fixed
and reproduced fixed.**

**Both prior blockers closed, reproduced fixed 3 ways.** `client@patina.dev`, keychain-reset fresh
sign-in: process survives past `.heroFrame`. Companion menu opened directly on Daily Room (the
exact crash trigger): renders exactly 6 rows, process stays alive. Full app relaunch after further
navigation: still signed in, still lands cleanly on Daily Room. `james.okafor@example.com` was not
re-tested (not on the critical path once the client account was reachable; the seed fix was
independently verified sound by `fix-review.md`'s diff-level check).

| Shot | Surface | What it shows |
|---|---|---|
| `w1b-11-daily-room-fresh-signin.png` | Daily Room, fresh sign-in | `client@patina.dev` renders past `.heroFrame` with no crash — Finding 1 fixed |
| `w1b-12/13-companion-*.png` | Companion menu, Daily Room | Exactly 6 rows (Message your designer / Your studio / Your recommendations / Saved / Add your first space / Your profile), process alive |
| `w1b-14-bell-invoice-decisions.png` | Notifications | Both the invoice and the decision written by `notify_client_attention(...)` render as unread rows — first end-to-end (server+client) confirmation of this check in the program |
| `w1b-90-nextmove-decision-copy.png` | Daily Room, Next Move card | "Review a project decision / 3 decisions are waiting on you" — matches DB's real pending count |
| `w1b-91-studio-subhead-count.png` | Studio hub | Subhead "5 things need your eye", "Awaiting you — 5", footer "5 THINGS NEED YOUR EYE" — one number, three surfaces (B2/F37 fixed); also serves as w1b-92 evidence (the count badge itself) |
| `w1b-93-conversation-zero-threads.png` | Studio hub, Conversation | "No messages yet" (m1's fix — no longer promises a designer that may not exist) |
| `w1b-15..17` | Decisions list/detail/defer sheet | "Not yet" defer flow: real sheet, pre-filled note, Send/Cancel |
| `w1b-18-proposals-accepted-label.png` | Proposals list | "ACCEPTED (1)" section, row reads "Accepted" never "Signed" |
| `w1b-20-sign-sheet-total-expiry.png` | Sign-proposal sheet | Restates TOTAL `$18,500.00` and EXPIRY `Sep 10` |
| `w1b-21-invoice-detail-due-sep1.png` | Invoice detail | `Due Sep 1` renders explicitly |
| `w1b-22/22b-pay-failure-*.png` | Invoice detail, Pay tapped | Patina-voice failure text is correct, but the Companion dock's caption visibly overlaps it — **new finding, FAIL against the acceptance script's own "never under the Companion dock" clause** |
| `w1b-23/24` | Settings, Account | Account push works; Sign Out / Delete account both present |
| `w1b-25/26` | Sign Out / Delete Account confirmation alerts | Both real, both sim-verified this round (cancelled deliberately to preserve the only client test account) |
| `w1b-27-browse-grid-uniform.png` | Browse pieces, all 10 cards | Every card shares the identical 262.33pt frame height, Y-offsets exactly 274.33pt apart — broader confirmation than the prior pass's 2-card spot check |
| `w1b-28-share-sheet.png` | Share sheet | Host `client.patina.cloud`, title "Patina Client Portal" |
| `w1b-29-ar-model-not-available.png` | Companion quick-action, product detail | "Try in your room / See it in AR" still present and dead-ends "3D model not available for this product" on every product — not an acceptance-script item but flagged as a possible SP-18 residual (AR affordances were meant to come down) |
| `w1b-30/31-manual-room-entry-*.png` | Manual room entry (`ScanFallbackEntryView`) | Real segmented `ft`/`m` control (`AXTabGroup`), labels live-update, 44×44 window/door steppers with real VoiceOver labels |
| `w1b-32-design-request-review-close.png` | Design-request review screen | Persistent "Close" control at every step, returns cleanly with no request filed |
| `w1b-33-final-daily-room-state.png` | Daily Room, end state | Signed in as `client@patina.dev`, app alive, matches the required end state |

**Full acceptance table, all 17 items with PASS/FAIL/DEFERRED/PARTIAL/NOT VERIFIED and verbatim
copy, is in `waves/w1b/walk.md` — not duplicated here.**

## w1b re-walk

Walker, one-screen re-check on the review simulator `973D1724-90BF-4A0A-B02D-481D561547B3`, local
stack, signed integration build installed from
`.codex/worktrees/agent-dr-w1b-integration/.build/dd-signed/Build/Products/Debug-iphonesimulator/Patina.app`
at head `8bb98ecd9` (`fix(ios): the Companion steps aside when a screen asks you to pay or sign` —
the F2 fix for ruling 1's Pay-failure/dock-overlap finding). Signed in as `client@patina.dev`.
**Verdict: PASS — the Companion dock no longer covers the Pay-failure banner or the Pay button at
default text size, and stays clear of both the Pay-failure banner and the "Sign proposal" footer
at Dynamic Type XXL.** On all three screens the dock sits in its minimal resting state (a small
mark tucked in the trailing corner, caption retired) rather than centered with a caption, per
ruling 1's "the orb yields."

| Shot | Surface | What it shows |
|---|---|---|
| `w1b-34-pay-failure-recheck.png` | Invoice detail, Pay tapped, default text size | Failure card ("We couldn't start this payment. Nothing has been charged." + "Let's try that again" / "Message your designer") renders with nothing drawn over it; the dock's minimal mark sits in the card's bottom-right corner, clear of all text |
| `w1b-35-pay-failure-xxl.png` | Invoice detail, Pay tapped, Dynamic Type XXL | Same failure card, plus the "Pay $4,250.00" button and both footer disclosure lines, all fully visible and unobstructed; dock minimal mark clear of every line |
| `w1b-36-proposal-sign-xxl.png` | Proposal detail (Aspen Loft — Living Room Refresh), scrolled to "Sign proposal", Dynamic Type XXL | The explainer line and the full-width "Sign proposal" button both render clear of the dock's minimal mark |

Simulator restored to Dynamic Type medium and left signed in as `client@patina.dev` on the Daily
Room after the re-check.

## w2-r2

Lane R2 (the Record UI), sim pass on its own clone `dr-w2-r2`
`0B472471-1E2E-4C04-825A-8668695264C1` (iPhone 17 Pro, 402×874 pt), local stack (migrations through
00538), app launched with `-DeploymentTarget local`. Build: `xcodebuild` Debug, **no**
`CODE_SIGNING_ALLOWED=NO` — entitlements intact; the in-app version stamp read `3b252ab1` for shots
01–05 and the branch head `6b96a87a9` thereafter. Three accounts walked: guest ("Look around
first"), `client@patina.dev` (activeProject), `james.okafor@example.com` (engaged). OTP codes read
out of the local mail server (`:54324/api/v1/messages`), as `research/04-stack-restart.md` §3(c)
describes.

**Verdict: PASS on every item the lane brief names.** The record draws nothing at guest, draws its
truthful empties at engaged, and draws dated NEEDS YOU / MOVED rows at activeProject; the Studio
control carries the one attention count; dark and Dynamic Type XXL are clean.

| Shot | Surface | What it shows |
|---|---|---|
| `w2-r2-01-guest-light.png` | Today, guest, light | `THURSDAY · AUG 27` over `Good evening.` (TimeOfDay), bell, `?`, the labelled `Studio` control with **no** count. **The record is not drawn at all** — an empty record at guest draws nothing (synthesis §5). Next Move takes the second slot, then `YOUR HOUSE / Start with a room` with **Type the dimensions first, Scan it second**, the story at hero weight, and the one quiet line `Sign in to keep this on every device.` `NEW THIS WEEK` absent (below the three-row floor) |
| `w2-r2-02-guest-dark.png` | same, dark | Identical composition on `#211E1B`; no light band anywhere |
| `w2-r2-03-activeproject-light.png` | Today, `client@patina.dev`, light | The record: `NEEDS YOU` — `Your invoice is due.` / `$4,250.00 · DUE SEP 1`; `Leah Hartwell sent a proposal to review.` / `BY SEP 10`; **`Leah asked about Dining chairs - Shaker Oak vs Windsor Elm.`** / `BY SEP 1` (MJ-5's ruled copy, live); `See all →`; `MOVED` — `A new story from the workshop.` / `AUG 26`. Then the seat (`Leah Hartwell · Birch Hollow` + `Message`), `YOUR HOUSE` with the **project's** rooms `Dining Room` / `Living Room` read from `project_rooms`, and the story demoted below. `Studio 5` |
| `w2-r2-04-activeproject-dark.png` | same, dark | Same, dark ground, `pearl` hairlines, no white band on the room cards |
| `w2-r2-05-activeproject-xxl.png` | same, Dynamic Type XXL | Every row wraps, no clipping: the invoice row's state wraps to two lines, the decision title to three, `See all →` and both eyebrows intact |
| `w2-r2-06-engaged-light.png` | Today, `james.okafor@example.com`, light | `NEEDS YOU` → **`Nothing needs you right now.`** (the truthful empty, drawn because the tier is engaged); `MOVED` → `Leah Hartwell picked up your request.` / `AUG 27` — the fact the app hid before — and `A new story from the workshop.` / `AUG 25`. Next Move keeps the second slot (nothing needs him). Seat + `Message`. `Studio` with no count |
| `w2-r2-07-engaged-dark.png` | same, dark | Same |
| `w2-r2-08-engaged-xxl.png` | same, XXL | Same, wrapped, nothing clipped |
| `w2-r2-09-two-weeks-header-new-ticks.png` | Today, engaged, last visit forced to Aug 13 | The long-gap header **`YOU WERE LAST HERE ON THE 13TH`** — no count of days — and both MOVED rows now carrying the clay `· NEW` tick, because both postdate that visit |

Method note for shot 09: the last-visit stamp lives in the **App Group** suite, and on this
simulator the App Group container *is* honoured (`.../Containers/Shared/AppGroup/6E95EB57-…/`
holds both `house-record.json` and `group.cloud.patina.app.plist`), so it was forced by editing that
plist with the app terminated and `cfprefsd` killed — a plain `defaults write` is cached and lost.
The snapshot file was deleted in the same step, because the six-hour suppression otherwise holds the
previous anchor and the header would not move.

Simulator left booted, Dynamic Type medium, light appearance, signed in as
`james.okafor@example.com`.

## w2-r2 · fix round

Same clone `dr-w2-r2` `0B472471-1E2E-4C04-825A-8668695264C1` (iPhone 17 Pro, 402×874 pt), local stack
(migrations through 00538), `-DeploymentTarget local`, build from the lane's own `.build/dd` — **no**
`CODE_SIGNING_ALLOWED=NO`. Branch `daily-return/w2-r2` at `f815e4a60`. Shots re-taken only where the
fix round changed what is drawn.

**Verdict: PASS.** The account switch leaks nothing; `See all →` is one footer; the Studio control
and Message are 44 pt; the discovering house draws its room whole, with only the lines it can prove.

| Shot | Surface | What it shows |
|---|---|---|
| `w2-r2-10-engaged-story-date-chip-light.png` | Today, `james.okafor@example.com`, light | The story card's chip now reads **`AUG 25 · 3 MIN READ`** (minor 13) — the publish date beside the read time, from the raw row the view model already held. Studio control and `Message` at their new 44 pt height |
| `w2-r2-11-account-switch-cold-launch-no-leak.png` | Today, first paint after an account switch, light | **B-1's proof.** James signed out → `client@patina.dev` signed in → app terminated → cold launch, screenshot at the first Today paint. The record holds only client's own rows (`Your invoice is due. / $4,250.00 · DUE SEP 1`, the proposal, `Leah asked about Dining chairs …`); **no** `Leah Hartwell picked up your request.` from the previous account, and no `YOU WERE LAST HERE` header — the visit went with the account. Also shows the single `See all →` footer under both eyebrow groups, with its rule above |
| `w2-r2-13-activeproject-one-see-all-footer-dark.png` | same, dark | Same composition on the dark ground; the footer rule and the amber `See all →` both read |
| `w2-r2-14-activeproject-footer-xxl.png` | same, Dynamic Type XXL | Every row wraps, the footer wraps with them, nothing clipped |
| `w2-r2-15-discovering-room-hero-light.png` | Today, guest with one room the person typed, light | **MJ-B.** `YOUR HOUSE` / `TYPED, NOT SCANNED` / the full-width `RoomHeroCard` — `Living Room`, `14 × 18 ft · 252 sq ft` — and `+ Add a room` below it. No budget line and no state line, because this room has neither a budget field on the model nor a saved piece: the card draws only what it can prove (C5) |
| `w2-r2-16-add-a-room-both-acts.png` | same, `+ Add a room` tapped | Both acts, the light one first: `Type the dimensions`, then `Scan it` (minor 9 — `Scan it` was unreachable from Today once a room existed, and every rail tap reported itself as the typed act) |
| `w2-r2-17-discovering-room-hero-dark.png` | same, dark | The hero card's ground adapts; no white band where the rail cards' fixed gradient used to sit |
| `w2-r2-18-final-state-client-signed-in.png` | Today, `client@patina.dev`, light | The state the simulator was left in |

Method note for shot 11: the app's own Appearance preference (`patina.appearance`, Settings →
Preferences) overrides `simctl ui … appearance`, so the dark shots were taken by editing
`Library/Preferences/cloud.patina.app.plist` with the app terminated and `cfprefsd` killed — a plain
`defaults write` is cached and lost.

Simulator left booted, light appearance, Dynamic Type medium, signed in as `client@patina.dev`.

## w2 walk

Walker's acceptance pass on the **review device** `973D1724-90BF-4A0A-B02D-481D561547B3` (not a lane
clone), 2026-08-27. App from the **integration** branch build (`f2a51a1e3`, signed, 980
tests/117 suites green — `integration.md` §9e), local stack through migration `00538`,
`-DeploymentTarget local`. Full detail, per-item PASS/FAIL and verbatim FAIL copy: `waves/w2/walk.md`.

**Verdict: ok = false — one FAIL, already known and already ruled to W3.** Every content, honesty,
navigation and tier-composition item in the acceptance script PASSED against live local-DB data
(not the mock's illustrative dates). The FAIL is the Companion bubble overlapping Record/Budget text
at Dynamic Type XXL — named already in `r2-notes.md` §4.5 and ruled to W3 in
`waves/w1b/rulings-fable.md` #1; not a new regression, not owned by any W2 lane.

| Shot | Surface | What it shows |
|---|---|---|
| `w2-00-push-primer.png` | Push permission primer, fires at very first sign-in | Verbatim SP-08 copy: "We'll tell you when your designer sends something that needs you — a decision, a proposal, or an invoice. Nothing else." |
| `w2-01-today-activeproject-light.png` | Today, `client@patina.dev`, light | NEEDS YOU (invoice `$4,250.00 · DUE SEP 2`, proposal `BY SEP 10`, decision `BY SEP 1`) / MOVED (message `AUG 27`, story `AUG 25`) / `See all →`; ordering verified against `askedAt` in the live DB, not assumed |
| `w2-02-today-activeproject-dark.png` | same, dark | Clean, no light leakage |
| `w2-03/04/05` | same, dark + Dynamic Type XXL | `w2-03` header/record clean; `w2-04`/`w2-05` show the Companion bubble covering part of "asked" and "BY SEP 1" — the FAIL |
| `w2-06-proposal-sign-xxl-dark.png` | Proposal detail, `Sign proposal`, XXL/dark | Clean, 76 pt clear of the Companion (carry-over 8c) |
| `w2-07-decision-detail-xxl-dark.png` | Decision detail, XXL/dark | Clean, both `Choose this` buttons legible (carry-over 8c) |
| `w2-08/09` | Invoice detail, XXL/dark | `w2-08`'s TOTAL/PAID/BALANCE grid wraps digits across 2-3 lines (ugly, not hidden — observation, not FAIL); `w2-09`'s `Pay $4,250.00` button clean (carry-over 8c) |
| `w2-10-message-thread-opened.png` | Designer seat → Message | Opens a real `rpc_start_project_thread` conversation — but on **Birch Hollow**, not Aspen Loft Refresh, the project actually carrying every NEEDS YOU row (seat picks `projects.first` by `updated_at desc`, unrelated to which project has open items — flagged for a ruling, not a script FAIL) |
| `w2-11/12` | Budget, XXL/dark | Same BILLED/PAID/OUTSTANDING wrap as the invoice (observation); `w2-12` also shows the Companion bubble covering part of "your" in "your designer's figure" — the FAIL, second instance, same root cause |
| `w2-13/14/15` | Today, two-weeks-away last-seen | `w2-15` (the correctly-forced one, after fixing the App-Group/cfprefsd/six-hour-suppression procedure): header reads `YOU WERE LAST HERE ON THE 13TH`, every row postdating it carries `· NEW` |
| `w2-16-new-tick-yesterday.png` | Today, last-seen = exactly 24h ago | Precision-checked: a proposal sent ~38 min *before* the cutoff correctly shows no `· NEW` tick — timestamp-exact, not calendar-day |
| `w2-17/18/19/20` | Today, `james.okafor@example.com`, engaged | `w2-20` (clean): NEEDS YOU → `Nothing needs you right now.` (truthful empty); MOVED → `Leah Hartwell picked up your request.` `AUG 27` — **verbatim** acceptance-script match |
| `w2-21/22` | Today, guest | `DailyRoomView.HouseRecord` accessibility element **absent entirely** (confirmed via the AX tree, not a blank-area guess) — "or nothing," satisfied |
| `w2-23-final-state-client-daily-room.png` | End state | Signed in as `client@patina.dev`, light, Dynamic Type medium, Daily Room, scrolled to top |

Method notes (both non-obvious, both real, neither an app defect):
1. **Dark mode via `xcrun simctl ui <udid> appearance dark` does not work on this build** — even
   `Settings.app` itself stays visibly light after the command. The app's own in-app Appearance
   setting (`@AppStorage("patina.appearance")`) reads through `cfprefsd`, whose cache must be killed
   (`xcrun simctl spawn <udid> /usr/bin/killall cfprefsd`) before a direct plist edit takes effect.
2. **Two-weeks-header manipulation needs three steps, not one.** Writing `patina.house.lastSeenAt`
   via a plain `defaults write` targets the wrong domain; writing the real App-Group plist directly
   is cached by `cfprefsd` (same kill needed); and even with both fixed, `HouseRecordBuilder`'s
   six-hour suppression (real, working, by design) will keep the *previous* build's anchor unless the
   cached `house-record.json` snapshot in the same App Group container is also deleted before
   relaunch. Sequence: terminate → kill `cfprefsd` → edit the plist → delete the snapshot → launch.

Simulator left booted, light appearance, Dynamic Type medium, signed in as `client@patina.dev`, on
the Daily Room.

---

## w3-n1

Lane N1 (root + routing), 2026-08-27. Build `4a92058b5` on `daily-return/w3-n1`, signed simulator
`.app` from `.build/dd` (no `CODE_SIGNING_ALLOWED=NO`). Simulator **`dr-w3-n1`**
`3D350836-BAF9-443A-8598-588D8D4AEBF6` (iPhone 17 Pro · iOS 26.5 · 402×874 pt, shots 1206×2622 @3×) —
**not** the walker's review device. Every launch carries `-DeploymentTarget local`; the flag-on rows
add `-PatinaFlags house-first`. Taps via `mcp__blitz-iphone__device_action` with the explicit UDID.
Rows 10–13 were added in the fix round (`waves/w3/n1-fix-log.md`) from build `2debf67e2` plus that
round's changes.

| Shot | Launch | What it shows |
|---|---|---|
| `w3-n1-01-guest-today-flagon.png` | flag **on**, guest | The bar draws: `Today` `Spaces` `Pieces` `Studio` + the Strata mark in the trailing slot, over the guest Today (record, `Start with a room`, story, `Sign in to keep this on every device.`). `Today` is the active label after one tap from Pieces |
| `w3-n1-02-guest-spaces-flagon.png` | flag on, guest | One tap on `Spaces` → `Your Spaces` (empty state). ⚠ `YourSpacesView` still draws its own back chevron at a tab root — N2's wrapper item |
| `w3-n1-03-guest-pieces-flagon.png` | flag on, guest | One tap on `Pieces` → `Browse pieces` |
| `w3-n1-04-guest-studio-flagon.png` | flag on, guest | One tap on `Studio` → `Your Studio` (the canonical title) over `StudioHubView`'s guest state. AX tree on this screen: four `AXTabButton`s labelled `Today` / `Your Spaces` / `Browse pieces` / `Your Studio` plus `Companion`, with `AXValue: 1` on the selected one only — B-7's VoiceOver contract, verified in the tree rather than assumed |
| `w3-n1-05-client-today-flagon.png` | flag on, `client@patina.dev` | W2's Record under the bar, unchanged: NEEDS YOU (invoice `$4,250.00 · DUE SEP 2`, proposal `BY SEP 10`, decision `BY SEP 1`) / MOVED (message `AUG 27`, story `AUG 26`), designer seat, house rail |
| `w3-n1-06-record-row-pushes-on-today.png` | flag on, client | **The in-tab push rule.** Tapping the invoice row on Today pushes `INV-2026-0142` onto the **Today** stack — `Today` is still the active tab, so Back returns to Today rather than stranding the person in Studio |
| `w3-n1-07-money-footer-under-bar.png` | flag on, client | Same screen scrolled: `Pay $4,250.00` clears the bar, and ⚠ `MoneyScreenChrome`'s 148 pt dock clearance is now ~150 pt of dead space under it (steward §7·C, unowned file, not edited) |
| `w3-n1-08-deeplink-piece-switches-to-pieces-tab.png` | flag on, client | **Deep link → tab.** `xcrun simctl openurl … patina://piece/a0000000-…-004` fired while the app sat on **Today** switched to **Pieces** and pushed the piece — `openExternal` reading `RouteTabTable`, on the simulator. ⚠ The pinned `Add to Room` footer's lower edge is cut by the bar's top hairline (`n1-notes.md` §3b, unowned file) |
| `w3-n1-08b-universal-link-opened-safari-no-aasa.png` | flag on, client | `https://client.patina.cloud/invoices/…` opened **Safari**, not the app: the AASA association is not installed on this simulator, which is a device claim this program does not make (`build-plan.md` "Global constraints"). The Studio landing that link would take is pinned by `HouseFirstRootTests` instead of shot |
| `w3-n1-09-client-today-flagoff.png` | flag **off**, client | The W2 root, unchanged: **no bar**, the floating Companion dock, the Studio pill in the header, the Record, the designer seat, the house rail |

**Fix round, 2026-08-27 — dark + Dynamic Type XXL** (`xcrun simctl ui <udid> appearance dark` +
`content_size extra-extra-large`), flag on, same simulator and same signed build path. These are the
frames the W3 acceptance line ("dark + XXL") asks for and the reviewed round did not take (MJ-6).

| Shot | Launch | What it shows |
|---|---|---|
| `w3-n1-10-client-today-dark-xxl-flagon.png` | flag on, client, **dark + XXL** | The bar itself is clean at XXL in dark — `Today` `Spaces` `Pieces` `Studio` all legible, none truncated, `pearl` hairline and the active/muted split correct. W2's XXL FAIL (the Companion bubble over the Record's rows) **does not reproduce here** — the Record's text is clear. ⚠ Two open items in one frame: the dock's caption `5 THINGS NEED YOUR EYE` is drawn across the bar's label row (BL-2, N3), and the header still carries the `Studio 5` pill beside the bar's Studio tab (BL-3, unowned) |
| `w3-n1-11-client-pieces-dark-xxl-flagon.png` | flag on, client, dark + XXL | `Browse pieces` under the bar with `Pieces` active. Same caption collision. ⚠ `RecommendationsView` draws its own back chevron at a tab root, exactly as `YourSpacesView` does — `n1-notes.md` §1b, N2's pass |
| `w3-n1-12-client-studio-dark-xxl-flagon.png` | flag on, client, dark + XXL | `Your Studio` — the canonical title — over `StudioHubView`'s `Awaiting you` rows, which wrap without clipping at XXL. Same caption collision, plus the resting mark over the `Active projects` row |
| `w3-n1-13-piece-footer-under-bar-dark-xxl.png` | flag on, client, dark + XXL | `n1-notes.md` §3b in dark at XXL: the pinned `Add to Room` capsule is cut by the bar's hairline, and the `.minimal` Companion orb sits over both the capsule's trailing end and the bar's Strata slot — three marks in one corner |

**Flag-off equivalence — how it is actually proven.** A screenshot diff against `w2-r2-03` reports
13.8% of pixels differing, and none of it is this lane: that shot predates W2's own one-`See all`
footer fix, and the seed's relative dates and the time-of-day greeting both moved between runs. The
proof that holds is the diff, not the pixels — `git diff 83b8c3340 HEAD -- ContentView.swift` is
**+19 lines and zero deletions inside the old body**: the whole W2 root moved into
`legacyMainContent` character for character, `companionHearthReservation` and `CompanionOverlay()`
included. Across the other three touched files the only removed lines are two signatures that gained
a defaulted `houseFirst: Bool = false`, `public init()` becoming a convenience initialiser, **six**
`navigate(to:)` doors becoming `openExternal(...)` — five in `DeepLinkHandler.swift`, one in
`recomputePhase` — each identical on the off root, and a statement reorder in `PatinaApp.init()`.
(The count is corrected from the reviewed round, which said one: `n1-notes.md` §4c, review MJ-2.)
