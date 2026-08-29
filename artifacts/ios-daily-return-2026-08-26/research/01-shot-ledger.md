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

| Shot | Launch | What it shows |
|---|---|---|
| `w3-n1-01-guest-today-flagon.png` | flag **on**, guest | The bar draws: `Today` `Spaces` `Pieces` `Studio` + the Strata mark in the trailing slot, over the guest Today (record, `Start with a room`, story, `Sign in to keep this on every device.`). `Today` is the active label after one tap from Pieces |
| `w3-n1-02-guest-spaces-flagon.png` | flag on, guest | One tap on `Spaces` → `Your Spaces` (empty state). ⚠ `YourSpacesView` still draws its own back chevron at a tab root — N2's wrapper item |
| `w3-n1-03-guest-pieces-flagon.png` | flag on, guest | One tap on `Pieces` → `Browse pieces` |
| `w3-n1-04-guest-studio-flagon.png` | flag on, guest | One tap on `Studio` → `Your Studio` (the canonical title) over `StudioHubView`'s guest state. AX tree on this screen: four `AXTabButton`s labelled `Today` / `Your Spaces` / `Browse pieces` / `Your Studio` plus `Companion`, with `AXValue: 1` on the selected one only — B-7's VoiceOver contract, verified in the tree rather than assumed |
| `w3-n1-05-client-today-flagon.png` | flag on, `client@patina.dev` | W2's Record under the bar, unchanged: NEEDS YOU (invoice `$4,250.00 · DUE SEP 2`, proposal `BY SEP 10`, decision `BY SEP 1`) / MOVED (message `AUG 27`, story `AUG 26`), designer seat, house rail |
| `w3-n1-06-record-row-pushes-on-today.png` | flag on, client | **The in-tab push rule.** Tapping the invoice row on Today pushes `INV-2026-0142` onto the **Today** stack — `Today` is still the active tab, so Back returns to Today rather than stranding the person in Studio |
| `w3-n1-07-money-footer-under-bar.png` | flag on, client | Same screen scrolled: `Pay $4,250.00` clears the bar, and ⚠ `MoneyScreenChrome`'s 148 pt dock clearance is now ~150 pt of dead space under it (steward §7·C, unowned file, not edited) |
| `w3-n1-08-deeplink-piece-switches-to-pieces-tab.png` | flag on, client | **Deep link → tab.** `xcrun simctl openurl … patina://piece/a0000000-…-004` fired while the app sat on **Today** switched to **Pieces** and pushed the piece — `openExternal` reading `RouteTabTable`, on the simulator. `https://client.patina.cloud/invoices/…` opened Safari instead: the AASA association is not installed on this simulator, which is a device claim this program does not make (`build-plan.md` "Global constraints"), so the Studio landing is pinned by `HouseFirstRootTests` rather than shot |
| `w3-n1-09-client-today-flagoff.png` | flag **off**, client | The W2 root, unchanged: **no bar**, the floating Companion dock, the Studio pill in the header, the Record, the designer seat, the house rail |

**Flag-off equivalence — how it is actually proven.** A screenshot diff against `w2-r2-03` reports
13.8% of pixels differing, and none of it is this lane: that shot predates W2's own one-`See all`
footer fix, and the seed's relative dates and the time-of-day greeting both moved between runs. The
proof that holds is the diff, not the pixels — `git diff 83b8c3340 HEAD -- ContentView.swift` is
**+19 lines and zero deletions inside the old body**: the whole W2 root moved into
`legacyMainContent` character for character, `companionHearthReservation` and `CompanionOverlay()`
included. Across the other three touched files the only removed lines are two signatures that gained
a defaulted `houseFirst: Bool = false`, `public init()` becoming a convenience initialiser, one
`navigate(to: route)` becoming `openExternal(route)` (identical on the off root), and a statement
reorder in `PatinaApp.init()`.

---

## w3-n2

Lane N2 (Pieces + Saved), 2026-08-27. Branch `daily-return/w3-n2` (cut from N1's tip `b101f5009`),
shots taken at `f74f52ff4`. Signed simulator `.app` from `.build/dd` (ad-hoc, no
`CODE_SIGNING_ALLOWED=NO`). Simulator **`dr-w3-n2`** `4839354A-D6ED-4544-BC8D-079108E479CE`
(iPhone 17 Pro · iOS 26.5 · 402×874 pt, raw shots 1206×2622 @3×) — created fresh for this lane; the
W2 clones are gone and the review device `973D1724-…` stays the walker's. Every launch carries
`-DeploymentTarget local`; flag-on rows add `-PatinaFlags house-first`. Taps via
`mcp__blitz-iphone__device_action` with the explicit UDID.

⚠ **A capture trap worth recording.** `mcp__blitz-iphone__get_screenshot` returns a **light-rendered**
image whatever the simulator's appearance — shot 09 was taken twice, once through the MCP tool
(light) and once with `xcrun simctl io … screenshot` (correctly dark) on the same unchanged screen.
Only the `simctl` capture is evidence for a dark-mode claim. Shots 01–08 were taken with the
simulator in light mode, so nothing is misreported by them; the dark row is the `simctl` one.

| Shot | Launch | What it shows |
|---|---|---|
| `w3-n2-01-pieces-tab-saved-row-flagon.png` | flag **on**, guest | The Pieces tab root: `Browse pieces` · `10 pieces chosen for your space` · **the `Saved` row** · chips · the grid, under the bar with `Pieces` active. AX tree: `Pieces.SavedDoorRow` labelled **`Saved, nothing yet`** with hint *"Opens your saved pieces, in boards and as a list."* — its own label, distinct from the tab's `Browse pieces` (B-7 b). **No back chevron** in the tree (n1-notes §1b closed). Four `AXTabButton`s labelled `Today` / `Your Spaces` / `Browse pieces` / `Your Studio` |
| `w3-n2-02-lighting-chip-server-filtered-flagon.png` | flag on, guest | One tap on `Lighting` → `1 piece chosen for your space`, one card. **Server-side, proven in the database, not inferred from the screen:** `match_events` row 72 `source='ios'`, `context->>'category' = 'lighting'`, `jsonb_array_length(results) = 1`, against rows 70/71 from the same session with `category` NULL and 10 results. Kong logged `POST /rest/v1/rpc/get_recommendations HTTP/1.1" 200` at the same second. `p_category` — "the parameter nobody sends" — is now sent and honoured |
| `w3-n2-03-saved-boards-allitems-on-pieces-tab.png` | flag on, guest | The `Saved` row pushes the canonical Saved surface: title `Saved`, **`Boards` / `All items`** intact, `New board`, the empty `No saved items yet` state. The bar still shows `Pieces` active — `.table` is filed under Pieces and is not a tab root, so the push stays on that stack. The pushed screen **does** draw `chevron.left` / `Back`, which is the same gate working in the other direction |
| `w3-n2-04-saved-row-counts-one-piece.png` | flag on, guest | One save from the grid → the row reads **`Saved, 1 piece`** live (singular). The count is `savedProductIds` — local rows merged with the account's `saved_items` — not a fabricated figure |
| `w3-n2-05-spaces-tab-root-no-chevron.png` | flag on, guest | The Spaces tab root, **no back chevron**. ⚠ At zero rooms `YourSpacesView` draws its `emptyState`, which carries no header, so the canonical name is not on glass here — see `n2-notes.md` §2 |
| `w3-n2-06-studio-tab-root-your-studio-title.png` | flag on, guest | The Studio tab root: large title **`Your Studio`** over `StudioHubView`'s guest state, one tap from anywhere. The ScrollView + title moved out of N1's shim into `StudioTabRoot` |
| `w3-n2-07-flagoff-today-no-tabbar.png` | flag **off**, guest | W2's root, unchanged: date · `Good night.` · bell · the labelled `Studio` pill · NEXT STEP · `Start with a room` · the story. **No bar** |
| `w3-n2-08-flagoff-browse-no-saved-row-chevron-back.png` | flag off, guest | The browse grid reached through the Companion's `Your recommendations` row: `chevron.left`/`Back` present, **no `Pieces.SavedDoorRow` in the tree**, chips at **y = 179.33** — the exact slot the Saved row occupies on the flag-on root — and no bar. The flag-off root renders as W2 left it. The Companion rows still resolve: `Saved, 1 saved piece` → `.table`, `Your recommendations` → `.emergence` |
| `w3-n2-09-pieces-saved-row-dark-xxl-flagon.png` | flag on, guest, **dark + accessibility-XXL**, `simctl io` capture | The `Saved` row survives XXL: `Saved` (Playfair 18) left, `1 PIECE` mono right-aligned, chevron — no clipping, no collision, meta stays on one line. Chips scroll with the SP-02 trailing fade. ⚠ **Two defects visible and neither is N2's:** the bar's four labels collide at XXL (`TodaySpac…PiecesStudio`, no inter-item spacing) — `PatinaTabBar`, N1's file; and the Companion `.minimal` orb still floats over the bar and the grid — N3's, per n1-notes §2a |

## w3-n3

Lane N3, Companion + tour. Simulator `dr-w3-n3` `2B7C2D64-2367-427E-B511-826E824E70CD`
(iPhone 17 Pro / iOS 26.5, created fresh — every existing device was booted and
`simctl clone` refuses a booted source). Signed `.app` from
`.codex/worktrees/agent-dr-w3-n3/.build/dd`, `codesign -dv` → `Identifier=cloud.patina.app`,
no `CODE_SIGNING_ALLOWED=NO`. Tier `client@patina.dev` (activeProject) throughout; every launch
carries `-DeploymentTarget local`. Shots 01–10 light, 11 dark + accessibility-XXL.

| Shot | Launch | What it shows |
|---|---|---|
| `w3-n3-01-today-flagon-mark-in-bar-no-orb.png` | flag **on** | Today with the record, under the bar — and **no floating dock anywhere on the screen**. The Strata mark sits in the bar's trailing slot; the `NEXT STEPS` / `5 THINGS NEED YOUR EYE` caption that printed across the bar's label row in every one of N1's flag-on shots (`w3-n1-05`, `-10`, `-11`, `-12`) is gone. AX tree: a 54 × 49 `AXTabButton` labelled **`Companion`**, hint *"Opens quick actions for this screen."* — M1 §6's fifth VoiceOver name |
| `w3-n3-03-companion-panel-from-bar-flagon.png` | flag on | One tap on the mark and the panel is up. This is the tap N1 could not ship: `toggleCompanion()` had no observer, so it presented nothing while taking all four stacks out of the VoiceOver tree (`n1-notes.md` §2a, §4d). The panel's bottom edge clears the bar — `CompanionOverlay` is a sibling of the four stacks, not a child of the bar's `safeAreaInset`, so it is lifted by `PatinaTabBar<EmptyView>.itemHeight` |
| `w3-n3-04-companion-six-rows-flagon.png` | flag on | The coachmark dismissed: **exactly six rows** — `Message your designer` · `Your studio` · `Your recommendations` · `Saved` · `Add your first space` · `Your profile` — under `Where to begin? / 5 things need your eye.` W1b's composition, unmoved (C8) |
| `w3-n3-05-companion-collapsed-back-to-bar-flagon.png` | flag on | ✕ collapses it and Today's whole content returns to the AX tree (`DailyRoomView.HouseRecord` ×5, `DailyRoomView.StudioButton`, `DailyRoomView.DesignerSeat` all readable again) — `accessibilityHidden(isCompanionExpanded)` releases, which is the half that was broken |
| `w3-n3-06-tour-step1-of-3-today-flagon.png` | flag on, tour state cleared | **`Step 1 of 3`.** The shipped tour has run **two** steps since W2 (`research/2x-panel-{u1,u2,d2,h1}.json`); step 2's anchor now mounts, so the denominator is the authored one again. ⚠ The body is Sanity's **stale** copy — see the finding below |
| `w3-n3-07-tour-step2-record-flagon.png` | flag on | **`Step 2 of 3`**, the popover arrow on the record card. The step that never rendered on any shipped build now does. ⚠ Sanity copy again |
| `w3-n3-08-tour-step3-studio-flagon.png` | flag on | **`Step 3 of 3`**, arrow on the header's `Studio 5` control, `Done`. ⚠ Sanity copy again |
| `w3-n3-09-today-flagoff-orb-and-hearth.png` | flag **off** | W2's root, untouched: **no bar**, the floating orb back over the room rail with its `5 THINGS NEED YOUR EYE` caption, the Hearth reservation still under the scroll. The orb-over-content defect W2's walk logged as a FAIL is still exactly there — which is what "the flag-off root is unchanged" has to mean |
| `w3-n3-10-companion-panel-flagoff-unchanged.png` | flag off | The same six rows, the same title, sitting ~49 pt lower than shot 03 — the bar lift is flag-on only |
| `w3-n3-11-today-dark-xxl-flagon-no-orb.png` | flag on, **dark + accessibility-XXL** | **Closes `w3-n2-09`'s N3 half.** N2 caught the `.minimal` orb still floating over the bar and the grid at this exact setting; at XXL in dark there is now no orb and no caption over the bar, and the mark is legible in the trailing slot. ⚠ N2's **other** finding stands and is not N3's: the bar's four labels still collide (`TodaySpac…PiecesStudio`, no inter-item spacing) — `PatinaTabBar.swift`, N1's file |

**One finding this walk produced that no test could.** All three tour steps render **Sanity's copy,
not the app's** — `FirstLaunchTourPopoverCard.resolvedBody` is `loaded?.body ?? step.fallback?.body`,
so the CMS wins and the three documents still hold the sentences B-8 retires, including *"This is
your Daily Room — picks and stories chosen for your space."* The rewrite is correct in the binary and
green in `FirstLaunchTourTests`, and **invisible to a user until the three Sanity documents are
updated**. Bodies for Kody: `waves/w3/n3-sanity-copy.md`. This is a release gate on B-8, not a code
defect.

**Also worth recording:** the tour would not auto-start at all on first attempt — `profiles.help_state`
for `client@patina.dev` carried `{"ios-first-launch-tour": {"launched": true, "abandoned": true,
"abandonedAt": "2026-08-28T01:59:17Z"}}` from an earlier lane's walk, and that state is
**cross-device authoritative** via `SupabaseHelpStateAdapter`. Any later lane or walker who needs to
see the tour must clear it in the database first, not just reinstall the app.

## w3 walk

Walker, acceptance pass on the review device **`973D1724-90BF-4A0A-B02D-481D561547B3`** (iPhone 17
Pro / iOS 26.5, 402×874 pt). Integration tip `daily-return/integration` @ `ccf1031f7` (docs), last
code commit `d0879b10a` — `.app` installed from
`/Users/kody/Library/Developer/Xcode/DerivedData/Patina-fqrqjvpfaowactdbiglvkpeuvzpz/Build/Products/Debug-iphonesimulator/Patina.app`,
`codesign -dv` confirms `Identifier=cloud.patina.app`, `Signature=adhoc` (signed, not
`CODE_SIGNING_ALLOWED=NO`). Every launch `-DeploymentTarget local`; flag-on rows add `-PatinaFlags
house-first`. Taps via `mcp__blitz-iphone__device_action` with the explicit UDID; dark-mode shots
taken only after confirming with `xcrun simctl io … screenshot` that the render was genuinely dark —
see the trap below.

⚠ **A second capture trap, worse than N2's.** `simctl ui appearance dark` sets the OS trait, but this
app persists its own `patina.appearance` override (`AppearanceSetting`, `@AppStorage` key
`patina.appearance`) independent of the OS setting — `PatinaApp.swift` applies
`.preferredColorScheme` from that stored value, defaulting to `.system` but **stuck on `Light` in
this install from an earlier lane's walk**, so `w3-05`/`w3-06`'s first captures (both
`mcp__blitz-iphone__get_screenshot` **and** a direct `simctl io screenshot`) were genuinely
light-rendered even with the OS in dark — not a tool artifact this time, a leftover in-app setting.
Fixed with `xcrun simctl spawn … defaults write cloud.patina.app patina.appearance -string dark` +
relaunch; confirmed dark on both capture paths before shooting. Reset to `system` after.

| Shot | Launch / account | What it shows |
|---|---|---|
| `w3-01-flagon-today-client.png` | flag on, `client@patina.dev` | Today under the bar, session already signed in from a prior lane. Push-primer dismissed first |
| `w3-02-flagon-studio-oneTap-client.png` | flag on, client | One tap on **Studio** → `Your Studio`, `StudioHubView`: Awaiting you (Decisions/Invoice/Proposal) · In progress · Conversation |
| `w3-03-flagon-pieces-client.png` | flag on, client | `Browse pieces`, `Saved` row (`nothing yet`), `All/Seating/Tables` chips, one card size (SP-02) |
| `w3-04-flagon-companion-from-bar.png` | flag on, client, on the pushed Saved screen | Bar's Companion slot opens the panel over a dimmed screen; 5 rows in this context (≤6) |
| `w3-05-flagon-today-dark-xxl.png` (+ `w3-05b-bar-zoom.png`) | flag on, client, **genuinely dark + accessibility-XXL** | Today: bar reads `Today  Spaces  Pieces  Studio`, gutters, no truncation/ellipsis (`116ba49b1` verified on glass, not just integration's shot) |
| `w3-06-flagon-pieces-dark-xxl.png` (+ `w3-06b-bar-zoom.png`) | flag on, client, dark + XXL | Pieces: same bar check, dark background confirmed genuine on the second attempt |
| `w3-07-flagon-studio-dark-xxl.png` | flag on, client, dark + XXL | Studio: dark, readable at XXL |
| `w3-08-flagoff-today-client.png` | flag **off**, client | W2 root: no bar, NEEDS YOU/MOVED card, Leah seat, Your House rail, dock hint at bottom |
| `w3-09-flagon-today-james.png` | flag on, `james.okafor@example.com` (matched/lead tier) | "Nothing needs you right now" / "Leah Hartwell picked up your request" (SP-07's matched branch) · "See your design request" · Leah seat · "Start with a room" |
| `w3-10-flagon-studio-oneTap-james.png` | flag on, james | One tap → `Your Studio`, lead-tier empty rows ("Nothing needs a decision", "No active projects yet") |
| `w3-11-flagon-guest-freshtour-step1.png` | flag on, **guest**, fresh session (no prior guest state survives a relaunch) | First-launch tour popover, **`Step 1 of 2`**, body **"This is your Daily Room — picks and stories chosen for your space."` — the retired pre-B-8 sentence, on the flag-on root |
| `w3-12-flagon-studio-oneTap-guest.png` | flag on, guest | One tap → `Your Studio`, truthful empty ("Your Studio begins with a project… Open settings") — guest/discovering draws nothing fabricated |
| `w3-13-flagoff-today-client-final.png` | flag off, client (final/leave state) | Same NEEDS YOU/MOVED/seat/house-rail structure as `w2-02-today-activeproject-dark.png`, only the dated rows differ (later data) — structural byte-for-byte held |
| `w3-14-flagon-companion-six-rows-today-client.png` | flag on, client, on Today | Companion panel, **exactly six rows**: Message your designer · Your studio · Your recommendations · Saved · Add your first space · Your profile |
| `w3-15-flagon-spaces-empty-client.png` | flag on, client | Spaces tab root at zero rooms: `Your Spaces`, **no back chevron** (`8fde85564` verified) |

**One finding beyond what integration.md already named.** `w3-11`'s `Step 1 of 2` is not just the
already-documented Sanity-content override (which explains the *body* text on either list, since
`step1Home`'s surface key is shared by both `FirstLaunchTourModel.defaultSteps` and
`.preHouseFirstSteps`) — it is also evidence the **denominator itself reads 2, not 3**, on a
confirmed flag-on root (the bar was on screen). Read against
`Features/Help/FirstLaunchTour.swift`: `defaultSteps` has 3 entries (`.homeGreeting`, `.todayRecord`,
`.profileMonogram`); guest/discovering's Record card **draws nothing when empty** (W2's synthesis
graft, reconfirmed live — the guest Today in this walk has no NEEDS YOU/record block at all). If the
tour's step count is computed from anchors that actually mount, `.todayRecord` never mounts for a
guest with an empty Record, which would explain 2-of-3 without needing the flag-off list at all. Not
independently verified against the runtime filtering code — flagged for whoever roots out the B-8
copy fix, since it changes the fix from "update three Sanity documents" to "also decide what a
guest's tour looks like when step 2 has nothing to point at."

## w3 re-walk

Walker, re-walk pass on the review device **`973D1724-90BF-4A0A-B02D-481D561547B3`** (iPhone 17
Pro / iOS 26.5, 402×874 pt), 2026-08-28. Build installed from the same DerivedData path, integration
tip `28597eaa7` (`fix2-log.md`'s commits — `c25c758bf` fixing V-1, `28597eaa7` fixing V-2). Local
Supabase (`docker compose` + `supabase:start`) was down at the start and had to be brought up before
sign-in worked; not otherwise notable. Numbering continues from `w3-24`.

| Shot | Launch / account | What it shows |
|---|---|---|
| `w3-25-flagon-onboarding-lands-pieces-no-tour.png` | flag on, fresh client sign-in, post-quiz | Onboarding lands on `Browse pieces` (`Pieces` tab selected); no tour element in the AX tree |
| `w3-26-flagon-today-client-no-studio-pill.png` | flag on, client | Today header: `Today` group + bell (`3 unread`) + `Help` only — no Studio pill |
| `w3-27-flagon-studio-tab-your-studio-title-client.png` | flag on, client | Studio tab root, heading reads `Your Studio` |
| `w3-28-flagon-studio-settings-signout-delete-client.png` | flag on, client | Settings sheet: `Sign Out` and `Delete account` both present, three taps from the bar (neither tapped) |
| `w3-29-flagon-companion-studio-signedin-5rows-no-profile.png` | flag on, client, on Studio tab | Companion panel: 5 rows (Decisions waiting · Messages · Proposals · Billed to date · Home), **no "Your profile" row** — V-2 fix confirmed live for a signed-in reader |
| `w3-30-flagon-invoice-pay-footer-clears-bar-default.png` | flag on, client, default text | Invoice detail `Pay $4,250.00` footer sits well above the bar |
| `w3-31-flagon-invoice-pay-footer-clears-bar-xxl.png` | flag on, client, XXL | Same screen at accessibility-XXL: `invoiceDetail.pay` frame ends y=722, bar starts y=791 |
| `w3-32-flagon-proposal-sign-footer-clears-bar-default.png` | flag on, client, default text | Proposal detail `Sign proposal` footer clear of the bar |
| `w3-33-flagon-proposal-sign-footer-clears-bar-xxl.png` | flag on, client, XXL | Same screen at XXL: `proposalDetail.sign` frame ends y=783, bar starts y=791 (8pt clear) |
| `w3-34-flagon-piece-add-to-room-clears-bar-default.png` | flag on, client, default text | Piece detail `Add to Room` capsule clear of the bar. The ledger's earlier PGRST201 "every piece detail is hard-broken" trap did not reproduce |
| `w3-35-flagon-piece-add-to-room-clears-bar-xxl.png` | flag on, client, XXL | Same piece at XXL, capsule still clear (ends y=783, bar at y=791) |
| `w3-36-flagon-today-dark-client-genuine.png` | flag on, client, genuinely dark (`simctl io screenshot`) | Today at night: bar reads `Today Spaces Pieces Studio` legibly, no Studio pill, dark background confirmed on the non-MCP capture path too |
| `w3-37-flagon-guest-freshtour-step1of2-empty-record.png` | flag on, fresh guest, first launch | Tour step 1 of 2 on Today: `Step 1 of 2, Welcome to Patina, This is your Daily Room…` (Sanity's retired copy — OWED-Kody, see `walk.md`); guest's Record is empty (`Start with a room` renders, no `NEEDS YOU` block), consistent with the "2 of 2" denominator |
| `w3-38-flagon-guest-tour-step2of2-studio-popover-above-bar.png` | flag on, fresh guest | Tour step 2 of 2: the popover card (y 642–773) sits fully **above** the bar row (y 791+); `Today Spaces Pieces Studio` all read clearly beneath it — V-1 fix confirmed live (compare `w3-fix-03`'s pre-fix occlusion) |
| `w3-39-flagoff-today-client-structure.png` | flag off, client | Today: NEEDS YOU/MOVED/See all card, Leah Hartwell designer seat, YOUR HOUSE rail, floating Companion orb, no tab bar — structurally matches `w3-13-flagoff-today-client-final.png` |
| `w3-40-flagoff-header-pill-opens-profile.png` | flag off, client | Tapping the header's `Your Studio` pill (the former "monogram") pushes `ProfileView` (`Client User`, `STUDIO`/`YOUR PROFILE` sections, `Settings` row) — unchanged by the W3 tab-bar refactor |
| `w3-41-flagoff-today-client-leave-state.png` | flag off, client (final/leave state) | Same frame as `w3-39`; this is the exact leave-state screenshot |

Verdict: every merge-rule item (`rulings-fable.md`, end) passes. The Sanity-copy gap (`w3-37`) is
carried as OWED (Kody) per ruling 5, not a FAIL — see `waves/w3/walk.md` for the full disposition.

## w4-h1

Lane H1 · rooms & budget. Simulator clone `dr-w4-h1`
`BA5B70BC-07A5-4F40-94A3-B6A7A307205B`, ad-hoc-signed `.app` from
`.codex/worktrees/agent-dr-w4-h1/.build/dd/…/Patina.app` (never
`CODE_SIGNING_ALLOWED=NO`), `-DeploymentTarget local` on every launch, account
`client@patina.dev` (activeProject). Shots 01–09 are the **flag-off** W2 root;
10–13 are **flag-on** (`-PatinaFlags house-first`). Shots 06 and 11–13 were
re-taken after the fix round below.

| Shot | State | What it shows |
|---|---|---|
| `w4-h1-01-flagoff-today.png` | flag off, client | Today with the Record, the Leah Hartwell seat and the `YOUR HOUSE` rail; Companion intro popover over the rail (pre-existing) |
| `w4-h1-02-flagoff-house-rail.png` | flag off, client | The rail: `Dining Room` / `Living Room` from `project_rooms`, **no meta** — both rows carry `budget_cents = 0`/`committed_cents = 0`, which W2's rule reads as "not set" and draws nothing rather than `$0` |
| `w4-h1-03-flagoff-light-act-first.png` | flag off, client, `Add a room` | The two-act dialog, ruled order live: `Type the dimensions` (y=481) above `Scan it` (y=537) |
| `w4-h1-04-flagoff-rail-local-room.png` | flag off, client | Today after typing a room; Companion popover re-fired over `YOUR HOUSE` (pre-existing) |
| `w4-h1-05-room-screen-no-budget.png` | flag off, client, room screen | `14 × 18 FT · 252 SQ FT · TYPED, NOT SCANNED`; `0 SAVED PIECES` / `— ROOM MATCH`; **no figure line at all** with no pieces and no budget (never a dash); M4's two ghost acts `Edit dimensions` · `Set a budget` |
| `w4-h1-06-set-a-budget-sheet.png` | flag off, client | The `Set a budget` sheet: `LIVING ROOM`, "What you mean to spend on this room. Only you see it.", `$` field, `Save` correctly **disabled** on an empty field |
| `w4-h1-07-edit-dimensions-segmented.png` | flag off, client, Room Settings | The new Dimensions section: SP-19's segmented `ft | m` control, `18 LENGTH (ft)` / `14 WIDTH (ft)`, `Save dimensions` |
| `w4-h1-08-room-screen-with-budget.png` | flag off, client | After saving $9,000: figure line reads `budget $9,000` (no pieces yet, so no pieces clause); the act relabels itself `Edit budget` |
| `w4-h1-09-flagoff-rail-with-budget.png` | flag off, client | The rail card now reads `Living Room. 252 sq ft · budget $9,000` (AX label) |
| `w4-h1-10-flagon-today.png` | flag on, client | Same Today under the four-tab bar: `Today Spaces Pieces Studio` + Companion slot; `YOUR HOUSE` rail present |
| `w4-h1-11-flagon-spaces-gallery-budget.png` | flag on, client, Spaces | The gallery card's stat row: `0 ITEMS` · **`$9.0K BUDGET`** · `— MATCH`. Before this wave the Budget cell printed the *saved-pieces total* under the word Budget; the false `JUST SCANNED` badge on a typed room is also gone. `MANUAL ENTRY` in the meta line is F51 wording, untouched (see `h1-notes.md`) |
| `w4-h1-12-flagon-room-screen.png` | flag on, client | The same room screen on the tab-bar root: both ghost acts fully clear of the bar, nothing under the Companion (it is in the bar's trailing slot on this root) |
| `w4-h1-13-flagon-rail-with-budget.png` | flag on, client | `Living Room` / `252 sq ft · budget $9,000` on the rail, `Add a room` last — the same strings on both roots |

Server-side proof of the mirror (read-only, local stack, not a reset):

```
$ psql -p 54322 -c "select id,name,budget_cents,created_at,updated_at from public.rooms …"
19703872-…|Living Room|900000|2026-08-28 11:02:18+00|2026-08-28 11:08:15+00
c0000000-…|Guest Bedroom|900000|2026-08-28 10:50:43+00|2026-08-28 10:50:43+00
```

The `Living Room` row was created at 11:02 by the typed-room path and updated at
11:08 by the budget sheet — `rooms.budget_cents = 900000` is the mirror landing.
(`Guest Bedroom` is lane D's seed row, created already carrying a budget.)

**Review fix round** (`waves/w4/h1-fix-log.md`) — shots 14–18, same clone, fresh install of the
post-fix build, signed in again as `client@patina.dev`. The Spaces gallery card's `Budget` cell was
still printing `—` for a room with no budget; it now does not draw at all. The budget was removed
and re-set through the sheet on each root, which also exercised the mirror live in both directions
(`public.rooms.budget_cents` for `19703872-…` → null → `900000`, `updated_at` 12:01:20Z). The room's
stored state is back exactly as the rows above record it.

| Shot | State | What it shows |
|---|---|---|
| `w4-h1-14-flagon-spaces-no-budget-cell.png` | flag on, client, Spaces | The same card after `Remove this budget`: the stat row is `0 ITEMS │ — MATCH` — **two cells, one divider, no `—` under `Budget` and no `Budget` label at all**. The pieces total does not move into the empty slot |
| `w4-h1-15-flagon-spaces-budget-cell-back.png` | flag on, client, Spaces | The budget re-set to $9,000: `0 ITEMS │ $9.0K BUDGET │ — MATCH` — the three-cell row is unchanged when there is a number to print |
| `w4-h1-16-flagoff-rail-unchanged.png` | flag off, client | The W2 root after the fix: `YOUR HOUSE` → `Living Room` / `252 sq ft · budget $9,000`, `Add a room`. Nothing on the rail moved |
| `w4-h1-17-flagoff-spaces-budget-cell.png` | flag off, client, Spaces | `Your Spaces` reached on the **flag-off** root via the Companion orb → `Your spaces` (`ContentView`'s `.yourSpaces` route): the same three-cell row, same strings — the card is a shared component with no flag branching |
| `w4-h1-18-flagoff-spaces-no-budget-cell.png` | flag off, client, Spaces | The two-cell row on the flag-off root — `0 ITEMS │ — MATCH`. Both roots, both states, one component |

The `— MATCH` cell one place to its right is deliberately untouched: that dash is the match score
Patina has not computed, not a figure its owner withheld (`h1-notes.md` §6.2, open for Fable).

**Two defects found on the first walk and fixed in that round** (`h1-notes.md` §3):
`Set a budget` did not present at all (a second `.sheet` deeper in the hierarchy
was dropped — both sheets now go through one `item:` binding on the root), and the
Room Settings field offered `18.0` for a room typed as 18 ft (a metres round-trip
float). Both re-verified in `w4-h1-06` and `w4-h1-07`.

## w4-h2

Lane H2 · saved rows, decays, timeline, seat, story date. Sim check on the lane clone `dr-w4-h2`
(`D6DACCE3-E865-4AB5-80FF-F7C49F16736F`, iPhone 17 Pro, iOS 26.5), signed build from
`ios-gate.sh build`, every launch `-DeploymentTarget local`, both roots walked. Branch
`daily-return/w4-h2` @ `293a1f5ec`.

⚠ **Shots 01–09 were taken on an app with no live session** (`/rest/v1/projects` → `[]` while the
DB holds three for `client@patina.dev`), which is why the signed-in ones show no projects, no
NEEDS YOU rows and no designer seat.

✅ **RESOLVED in the fix round (shots 10–13).** The cause was not a keychain trap: `ios-gate.sh
build` passes `CODE_SIGNING_ALLOWED=NO` (`scripts/ios-gate.sh:54`), so the installed `.app`
carried **no entitlements at all** (`codesign -d --entitlements -` → empty dict) and the Supabase
SDK could not persist its session — the recorded `feedback_ios_sim_walk_harness` rule, hit in
full. **Walk shots must come from a build made without that flag** (a plain `xcodebuild build …
-derivedDataPath <tree>/.build/dd`); the gate's own artifact is for compiling, not for walking.
With a signed build the session survives sign-in, relaunch and reinstall, and everything called
unverifiable above is shot below.

| Shot | Root / tier | What it shows |
|---|---|---|
| `w4-h2-01-flagoff-today.png` | flag off, first launch | The auth gate as it stands on a fresh install — the wall a guest is about to decline |
| `w4-h2-02-guest-optin.png` | flag off, guest | Immediately after `Look around first`: the guest Today. Story chip reads `AUG 27 · 4 MIN READ` (the publish date, drawn). Also visible: the first-launch tour still reads `Step 1 of 2` and still says "Daily Room" — W3 rulings 4 and 5, both OWED elsewhere, not H2's |
| `w4-h2-03-guest-survives-relaunch.png` | flag off, guest, **after terminate + relaunch** | **W3 ruling 9 proven.** The relaunch lands on the guest Today, not the gate. Before this lane the same sequence put the wall back |
| `w4-h2-04-flagon-guest-today.png` | **flag on** (`-PatinaFlags house-first`), guest | The same guest Today under the four-tab bar — the persisted opt-in and the story chip both render on the flag-on root |
| `w4-h2-05-flagoff-today-client.png` | flag off, signed in (`client@patina.dev`) | Today with the Record card (`YOU WERE LAST HERE ON THE 13TH` / `MOVED` / `A new story from the workshop. AUG 27 · NEW`) and the `Saved` summary row. The empty NEEDS YOU and absent seat are the anon-session condition above, not the record's doing |
| `w4-h2-06-saved-row-date-room.png` | flag off, signed in | The Saved surface: `Heirloom Oak Dining Table · $4,200`, and under it **`Saved Aug 28`** with **`Add a note`**. No room on the line because the save was made from Browse, which writes no `room_id` (nullable, 00055:23) — and `saved_items` is empty in this database, so no seeded save carries one |
| `w4-h2-07-saved-note-sheet.png` | flag off, signed in | The note sheet: the piece's name, one text field, `Cancel` / `Save`. Nothing else — B §10 refuses a compare surface by name |
| `w4-h2-08-saved-row-with-note.png` | flag off, signed in | The same row after saving: `Saved Aug 28` · **`Edit note`** · `Check the leaf width before the dining room measure.` |
| `w4-h2-09-flagon-saved-row.png` | **flag on**, guest | The Saved surface on the flag-on root — row, `Saved Aug 28`, `Add a note`, all clear of the 83 pt bar |
| `w4-h2-10-fix-seat-follows-record.png` | flag off, signed in, **signed build** | **The W2 walk defect closed, on screen.** The seat reads `Leah Hartwell · Aspen Loft Refresh` — the project the first NEEDS YOU row (the $4,250 invoice) belongs to — while `listProjects`' own `updated_at.desc` order puts `Birch Hollow` first. Three NEEDS YOU rows, a MOVED row, and the story chip `AUG 27 · 4 MIN READ` |
| `w4-h2-11-fix-phase-timeline.png` | flag off, signed in | **The project timeline, first shot of it.** Aspen Loft Refresh, five phases, **one continuous rail** down the dots (the pre-fix rail broke into 8 pt ticks with 28 pt gaps), each row status + start + `target_end_date` + fee. Nothing marked CURRENT: `projects.current_phase` is null and two rows claim `in_progress`, so the app refuses to guess |
| `w4-h2-12-fix-flagon-seat.png` | **flag on** (`-PatinaFlags house-first`), signed in | The same seat under the four-tab bar |
| `w4-h2-13-fix-flagon-timeline.png` | **flag on**, signed in | The same timeline on the house-first root |

Server-side, on the local stack. First pass (service-role reads; the one write reset to NULL
afterwards): `profiles.last_seen_at` accepts the mirror's exact PATCH with a client JWT (204, value
lands); `saved_items` holds 0 rows in this database.

Fix round, with a live session: **the app itself wrote the mirror** —
`profiles.last_seen_at = 2026-08-28 12:06:05+00` for `a0000000-…-005`, one minute after that
launch, reset to NULL afterwards. One `saved_items` row was inserted with a June `created_at` and
a `room_id` to try the reconcile live; it could not be reached (the reconcile also needs *local*
rooms carrying a `remoteId`, and this account's rooms exist only server-side) and was deleted —
`select count(*) from saved_items` → 0, as before.

## w4 walk

Acceptance walker · review device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro / iOS
26.5). Installed `.codex/worktrees/agent-dr-w4-integration/apps/mobile/Patina/.build/dd/…/Patina.app`
(`xcrun simctl install`, unsandboxed) — `codesign -dv` confirms `Identifier=cloud.patina.app`,
`Signature=adhoc`, not `CODE_SIGNING_ALLOWED=NO`. `-DeploymentTarget local` on every launch; flag-on
shots add `-PatinaFlags house-first`.

| Shot | State | What it shows |
|---|---|---|
| `w4-01-flagoff-today-top.png` | flag off, `client@patina.dev` | Post-sign-in Today: NEEDS YOU (invoice/proposal/decision, all Aspen Loft Refresh) |
| `w4-02-flagoff-today-house-rail.png` | flag off, client | MOVED, designer seat `Leah Hartwell · Aspen Loft Refresh` + Message, `YOUR HOUSE` rail — only `Dining Room` / `Living Room` (the two `project_rooms`); no third card for D's seeded `Guest Bedroom` typed room |
| `w4-03-flagoff-phase-timeline.png` | flag off, client, tapped `Dining Room` | Tapping a `project_rooms`-origin card opens **project detail**, not a room screen (`YourHouseRail.swift:372-373` routes `.project` origin cards to `.projectDetail`) — Aspen Loft Refresh, budget $120,000, 5-phase timeline, one continuous rail, each phase's own status + two dates + `$0` fee; two rows both read `In Progress`, nothing marked CURRENT (`projects.current_phase` is null) |
| `w4-04-flagoff-designer-seat-message-thread.png` | flag off, client | `Message Leah Hartwell` opens a fresh thread; `comms_threads` confirms server-side it is scoped to `project_id` = Aspen Loft Refresh, matching the seat |
| `w4-05-flagoff-house-rail-with-new-room.png` | flag off, client, after `Type the dimensions` | A local room (`Walk Test Room`, 18×14, Bedroom) created via the app now shows on the rail beside the two project rooms — confirms `HouseRoomCard.card(for: RoomModel)` works; only the *pre-seeded* room is invisible |
| `w4-06-flagoff-room-screen.png` | flag off, client, `RoomProjectView` | `Walk Test Room` · `14 × 18 FT · 252 SQ FT · TYPED, NOT SCANNED` (F51 label correct) · `0 SAVED PIECES` / `— ROOM MATCH` (em dash, unscored) · `Edit dimensions` / `Set a budget` |
| n/a (verified via `scan_ui`, no separate shot) | flag off, client | `Set a budget` → `$7,500` → Save: rail card updates to `216 sq ft · budget $7,500` (after a corrected `Edit dimensions` pass to 12×18); **relaunch (same session) → still `216 sq ft · budget $7,500`** — both acts persist across relaunch. Server: `rooms.budget_cents = 750000`, `length_meters/width_meters` match |
| `w4-07-flagon-today-tabbar.png` | **flag on**, client | Today under the four-tab bar (`Today · Spaces · Pieces · Studio` + Companion slot) — same record content as flag-off |
| n/a | flag on, client, Spaces tab | `Walk Test Room` visible here (`216 sq ft · South-facing · Manual entry · 0 Items · $7.5K Budget · — Match`) — confirms Spaces reads local `RoomModel`s correctly; also reconfirms the `MANUAL ENTRY`/`TYPED, NOT SCANNED` copy mismatch between the gallery card and the room header (`h1-notes.md` §6.3, carried, not new) |
| `w4-08-note-sheet.png` | flag on, client, Pieces → a product → `Add to Room` → Saved list → `Add a note` | The note sheet: piece name, one text field, `Cancel / Note / Save` |
| `w4-09-flagon-saved-row-date-note.png` | flag on, client, Saved list | `Heirloom Oak Dining Table · $4,200` under it **`Saved Aug 28`** and, after the note sheet, `Check the leaf width before the walk test measure.` — date + note both draw correctly |
| n/a | flag on, client | A second piece (`Meadow Linen Sectional`) saved via `Browse pieces for the Walk Test Room` (a room-scoped browse) → `Add to Room` still only toggles the generic save (`ProductDetailView.swift:443`, `viewModel.isSaved`), never sets `room_id`; the room's own `SAVED PIECES` stat stayed `0` and the Saved row for this piece also carries no room, confirming **no code path in this build ever attaches a room to a save** — `SavedRowMeta.line` supports `Saved Aug 24 · Living Room` (`SavedRowMeta.swift:28-41`) but nothing ever calls it with a non-nil `roomName` |
| `w4-10-james-matched-no-decay-20days.png` | flag on, `james.okafor@example.com` | `leads.id = 7bdd7af4-…` (the account's actual UUID is `b2490455-9737-4328-b943-507e727edc08` — `research/02-steward-boot.md` §6(b)'s `28fd9d2c-…` is stale, superseded by a later seed) manually set to `created_at`/`updated_at` = 20 days ago in local Postgres, unsandboxed; after `terminate` + relaunch the record's `Leah Hartwell picked up your request.` row and the `Your designer` seat are both **still visible** — `DesignRequestStatusService.isVisibleForPromotion` (`:357-366`) returns `true` unconditionally for `stage.isMatched`, so the 14-day window never applies to a match. `created_at` restored to `2026-08-21` afterward |
| n/a | flag on, client, `Heirloom Oak Dining Table` product detail | No fit line drawn despite a qualifying room (`Walk Test Room`, `measuredWithUnitControl = true` after `Edit dimensions`) and a qualifying product (has `dimensions.width`/`depth`) — `grep -rn "RoomFitLine" .` outside `RoomFitLine.swift` itself returns **zero matches**: the type is not instantiated anywhere. Confirms `integration.md` §4/§6.2's disposition (`h1-notes.md` §1, NOT APPLIED) |
| `w4-11/12/13-flagon-today-dark-xxl-*.png` | flag on, client, dark + XXL | Today scrolls cleanly top→bottom: record rows, seat, `YOUR HOUSE` rail, story card (frame ends y≈749, tab bar starts y=791 — 42pt clear). No Companion-orb overlap anywhere (W2/W3's carried defect; the orb now lives in the bar's trailing slot on this root, confirmed absent as a floating element) |
| `w4-14-flagon-room-dark-xxl-top.png` | flag on, client, dark + XXL, `RoomProjectView` (a fresh `XXL Test Room`, since sign-out had cleared local rooms — see below) | `Edit dimensions` / `Set a budget` both end y≈740, tab bar starts y=791 — 51pt clear, no overlap |
| `w4-15-leave-state-flagoff-client-daily-room.png` | flag off, client, light, default text | Leave state |

**Unscripted finding, material to the wave's own open item #1:** after a Sign Out / Sign In cycle
(Studio → Settings → Sign Out, back in as `client@patina.dev`), the **just-created, already-synced**
`Walk Test Room` vanished from both Today's house rail and the Spaces tab (`No rooms yet`), even
though `rooms.budget_cents = 750000` for it was still present server-side, untouched. This is the
same root cause `integration.md` §6 item 1 names for D's pre-seeded room (`RoomsAPIClient.listRooms()`
has zero call sites, so nothing re-hydrates local `RoomModel`s on sign-in) — this walk shows it also
destroys a room the *client typed in the same session*, not only a seeded one. Rooms created after
this (`XXL Test Room`, for the dark+XXL room-screen shot) were cleaned up server-side afterward
(`delete from rooms where id in (…)`), leaving only D's `Guest Bedroom` for the next steward.

Leave state: signed in as `client@patina.dev`, flag off, on the Daily Room, light appearance,
default text size, scrolled to top (`w4-15`).

## w4 re-walk

Second-pass walker, 2026-08-28 · review device `973D1724-90BF-4A0A-B02D-481D561547B3` · tip
`ba209c2a5` on `daily-return/integration` (the tip `fix2-review.md` reviewed). Rebuilt fresh for this
device — the build already on it (from `b1ff6e458`, the first-pass tip) was stale, from before both
fix rounds. `xcodebuild build -project Patina.xcodeproj -scheme Patina -configuration Debug
-destination "platform=iOS Simulator,id=973D1724-…" -derivedDataPath .build/dd` (signed `adhoc`, not
`CODE_SIGNING_ALLOWED=NO`); `codesign -dv` confirms `Identifier=cloud.patina.app`. Clean sign-in via
`xcrun simctl keychain … reset` + uninstall/install. Dark shots taken with `xcrun simctl io … screenshot`
(not the `get_screenshot` MCP path — already flagged above as light-rendering-buggy for dark mode);
`content_size accessibility-extra-extra-large` for "XXL". Full verdict and results table:
`waves/w4/walk.md` (this pass's rewrite is now the file's primary content; the original pass is
preserved there as an appendix).

| Shot | State | What it shows |
|---|---|---|
| `w4-16-flagoff-today-rail-2rooms-only-postsignin.png` | flag off, client, fresh clean sign-in | Today's rail shows only `Dining Room`/`Living Room`, moments after sign-in (through the app's forced onboarding/style-quiz detour) |
| `w4-17-yourspaces-guestbedroom-present.png` | flag off, client | `Your Spaces` correctly lists `Guest Bedroom` (180 sq ft, Typed, $9.0K budget) in the same session |
| `w4-18-flagoff-today-rail-still-2rooms-after-yourspaces.png` | flag off, client | Back on Today: still only 2 cards, **after** `Your Spaces`' own reconcile is proven to have populated the local store. Device log at the point of the first attempt: `[com.patina.app:sync] [RoomSync] listRooms failed: cancelled` — the `.task`-scoped reconcile at `DailyRoomView.swift:131` was cancelled by view churn through the onboarding/quiz flow |
| `w4-19-flagoff-today-rail-2rooms-after-signout-signin.png` | flag off, client | Typed `W4 Rewalk Room` (12×18 ft, synced server-side, `rooms.id=2b82d097-…`), then Settings → Sign Out → sign back in: Today's rail **still only 2 cards** |
| `w4-20-yourspaces-both-rooms-after-signout-signin.png` | flag off, client | `Your Spaces` correctly lists both `W4 Rewalk Room` and `Guest Bedroom` post sign-in; `psql` confirms both rows under the client's `user_id` server-side |
| `w4-21-flagoff-today-rail-2rooms-after-cold-relaunch.png` | flag off, client | A **full cold terminate+relaunch** (fresh process, fresh `DailyRoomViewModel`, a synchronous no-network `store.allRooms()` read on the first `.task`) still shows only the 2 project-room cards — rules out task-cancellation as the sole cause; the gap is in `DailyRoomViewModel`/`houseRoomCards`, not the network layer |
| `w4-22-houserfirst-today-rail-2rooms-only.png` | **flag on** (`house-first`), client | The 4-tab root's Today shows the identical 2-card rail |
| `w4-23-houserfirst-yourspaces-both-rooms.png` | flag on, client, Spaces tab | The same root's `Your Spaces` tab correctly lists both rooms — confirms the bug is root-independent |
| `w4-24-piecescreen-helppanel-opens.png` | flag on, client, `Oak Reading Chair` | `ProductDetailView.HelpButton` presents "Help / No help articles yet" — M-2's single-`sheet(item:)` collapse holds |
| `w4-25-piecescreen-fitline-present.png` | flag on, client, `Heirloom Oak Dining Table` | `RoomFitLine` draws: **"Your W4 Rewalk Room's longest wall is 18 ft. This table is 8 ft."** — correctly falls back past the mirrored, unmeasured `Guest Bedroom` to the most-recently-measured local room |
| `w4-26-savedrow-note-entry.png` | flag on, client | Tapped `Add to Room` → picked `Guest Bedroom` (server: `saved_items.room_id` set, `source='emergence'`) → note sheet with "W4 re-walk note" typed |
| `w4-27-savedrow-date-room-note-complete.png` | flag on, client | Saved row reads **"Saved Aug 28 · Guest Bedroom"** with the note beneath — date, room, and note all present |
| `w4-28-guestbedroom-room-saved-list.png` | flag on, client, Guest Bedroom room screen | "You added the Heirloom Oak Dining Table on Friday" under YOUR ITEMS, $4,200 |
| `w4-29-piecescreen-unsaved.png` | flag on, client | Tapped `Saved ✓` on the piece screen to un-save; button reverts to `Add to Room` |
| `w4-30-guestbedroom-count-dropped-to-zero.png` | flag on, client, Guest Bedroom room screen | "0 SAVED PIECES · A blank canvas" — the room's own count dropped to zero, confirming M-1's un-save-clears-the-room fix on this exact surface |
| `w4-31-james-matched-survives-20day.png` | flag on, `james.okafor@example.com` | `leads.id=38672cae-…` (fresh UUID this reset — `homeowner_id=603aa555-…`) set 20 days old; Today still shows "See your design request. You're matched with Leah Hartwell" and the `Leah Hartwell · Designer matched` seat. `created_at` restored afterward |
| `w4-32-flagoff-today-dark-xxl-top.png` | flag off→on for content, dark + XXL (genuine, `simctl io`) | Top of Today renders cleanly at XXL |
| `w4-33-flagoff-today-dark-xxl-rail-story-OVERLAP.png` | dark + XXL | The editorial story card (AX frame `y=595.17`, height `153.83`) **overlaps** the house rail cards (`y=458`, height `150`, bottom `608`) by ~13pt — measured from AX frames |
| `w4-34-flagoff-today-dark-xxl-bottom-overlap-confirmed.png` | dark + XXL | Same overlap at the true scroll-bottom; three separate taps aimed at the visible `Dining Room` card's lower two-thirds (`y≈615–650`) all activated the **story card** underneath instead of the room card — the story card sits above the rail in hit-test order across the overlap, not just visually. A tap near the card's top (`y≈580`) does reach it |
| `w4-35-leave-state-flagoff-client-daily-room.png` | flag off, client, light, default text size | Leave-state frame |
| `w4-36-project-room-dark-xxl.png` | dark + XXL, client | Aspen Loft Refresh (Dining Room) project detail renders cleanly at dark+XXL — budget/status row and "Message your designer" row both intact |
| `w4-37-room-dark-xxl-top.png` / `w4-38-room-dark-xxl-bottom.png` | dark + XXL, client, Guest Bedroom room screen | Title, dimensions, budget, saved-pieces stat, "A blank canvas", and `Edit dim…`/`Edit bud…` (ellipsis-truncated, not clipped) all render cleanly with adequate clearance above the Companion orb |

Not shot separately: the Companion action sheet's list does not scroll at XXL text size, leaving
`Your spaces` and `Your profile` (the last two of six rows) permanently off-screen and unreachable by
touch from Today at this text size — worked around for this walk by temporarily lowering
`content_size` to navigate, then restoring XXL on the target screen.

Cleanup: `leads.created_at`/`updated_at` for `38672cae-…` restored to `2026-08-21 15:26:53.64368+00`;
`W4 Rewalk Room` (`rooms.id=2b82d097-1eaf-4473-8142-23c3b1d1e794`) deleted server-side, leaving only
D's `Guest Bedroom` under the client's `user_id`; `saved_items` for the client confirmed empty
server-side (the save→unsave round-trip during this walk left no residue).

Leave state: signed in as `client@patina.dev`, flag off, on the Daily Room, light appearance,
default text size, scrolled to top (`w4-35`).

## w4 walk 4

Fourth-pass walker, 2026-08-28 · review device `973D1724-90BF-4A0A-B02D-481D561547B3` · commit
`2ba1864de` (F4's reviewed fix — "her rooms come first on YOUR HOUSE, and the next card peeks") on
`daily-return/integration`. **First install attempt used the wrong build path**
(`apps/mobile/Patina/.build/dd`, stale, built 10:53 — before the 12:26 fix4 commit) and reproduced
the pre-fix bug (project rooms first, her room off-screen at x=524); caught by cross-checking the
task's own specified path (`.build/dd` at the worktree root, built 12:27, matching the commit) and
redone correctly for every result below. Gestures delivered throughout — no harness failure.

| Shot | State | What it shows |
|---|---|---|
| `w4-39-freshsignin-today-house-rail.png` | flag off, client, fresh clean sign-in, correct build | **Ruling 1 confirmed**: Guest Bedroom (her room) first at x=20 filling from the left edge, Dining Room peeking at x=316 (280pt-wide cards, 86pt/280pt visible — a real scroll affordance), Living Room further off-screen, Add a room last |
| `w4-40-typed-room-appears-first.png` | flag off, client | Typed a new room ("W4 Walk4 Room", saved server-side as `W4 Wa` — see note below); it appears first on the rail, ahead of Guest Bedroom (newest-first among her own rooms) |
| `w4-41-signout-signin-both-rooms-survive.png` | flag off, client | Sign Out → sign in: both her rooms (`W4 Wa`, `Guest Bedroom`) still on the rail, in the ruling-1 order, ahead of the two project rooms; `psql` confirms both rows under the client's `user_id` |
| `w4-42-houseFirst-flag-rail-same-order.png` | **flag on** (`house-first`) | The 4-tab root's Today shows the identical rail order and peek — confirms ruling 1 is root-independent |
| `w4-43-xxLarge-light-rail-no-overlap.png` | `.xxLarge` (`content_size extra-extra-large`, light) | At this size the rail **stays a horizontal strip** (not wrapped — `layout(for:)` only wraps at true accessibility sizes, confirmed against `YourHouseRail.swift` and matching F4's own note on this exact terminology gap); no overlap with the story card (16pt clear gap, AX frames); tapped the first card and it opened the correct room |
| `w4-44-dark-xxLarge-today.png` | dark + `.xxLarge` | Genuinely dark (`simctl io` screenshot); rail cards visible, tab bar/labels correct |
| `w4-45-dark-xxLarge-rail-story.png` | dark + `.xxLarge` | Rail bottom `y=569`, story top `y=585` — 16pt clear gap, no overlap, dark too (round 3's `a849b39fd` fix holds at this size in both appearances) |
| `w4-46-dark-accessibilityXXL-rail-wrapped-vertical.png` | dark + a true accessibility size (`accessibility-extra-extra-large`) | The rail **does** wrap to a vertical list here (matching ruling 1's actual "accessibility sizes" language and F4's shot-02): her rooms first, then project rooms, then Add a room, each non-overlapping (AX frames sequential, no y-range collision) |
| `w4-47-companion-bubble-overlaps-story-flagoff-accessibilityXXL.png` | flag off, accessibility-XXL | **New finding.** At this scroll position the floating Companion bubble (`y=748–812, x=169–233`) sits entirely inside the `EditorialStory` card's bounds (`y=711–961`). A tap at the bubble's location (201,780) opened the Companion sheet, not the story — confirmed by AX frames and by the actual tap outcome, not appearance alone. Distinct from F4's flagged room-card overlap; this is the flag-off root's only nav surface stealing a tap from editorial content |
| — | flag on, client | Un-save round-trip: saved `Oak Reading Chair` into Guest Bedroom via the room picker (server: `saved_items.room_id` set) → un-saved via a Browse card's long-press → "Unsave" (server row gone, confirmed `psql`) → re-saved into `W4 Wa` → un-saved via the Saved screen's own long-press → "Remove" (server row gone again) → on-glass, `W4 Wa`'s rail card dropped the "1 saved piece" clause both times. Both paths work |
| — | flag on, client | The `?` help panel and the room-picker sheet both present correctly on the `Oak Reading Chair` piece screen |
| `w4-48-james-matched-survives-20day-walk4.png` | flag on, `james.okafor@example.com` | `leads.id=a8fc690e-…` (fresh UUID this reset, queried not quoted) set 20 days old; Today still shows "See your design request. You're matched with Leah Hartwell" and the `Leah Hartwell picked up your request` seat. `created_at` restored to `2026-08-21 17:08:24.922373+00` afterward |
| `w4-49-leave-state-flagoff-client-daily-room-walk4.png` | flag off, client, light, medium text size | Leave-state frame |

**The claim sheet** (guest types a room, then signs in → "Keep them?" → the room is the account's,
hydrate lands): not observed on the first attempt — `local_store_owner_user_id` (UserDefaults, only
cleared by uninstall) was already set to the client's id from earlier in this same walk, so
`LocalStoreClaim.shouldAsk` correctly declined to ask (`previousOwner != nil`) per the documented
"first sign-in only" rule (`LocalStoreClaim.swift`). Re-tested with a genuine fresh pairing (full
`keychain reset` + uninstall + reinstall): guest typed "Guest Claim Room" → `Sign in` via the
Companion's own row (Settings/Account for a guest offers only "Sign in on the web" — no in-app
password path once past the welcome gate; the Companion row is the actual route back to it) →
signed in as `client@patina.dev` → the push primer, then the claim sheet ("Keep the room and the
pieces you saved on this phone?") presented correctly → "Keep them" → the rail then showed the
account's own rooms (`Guest Bedroom`, `W4 Wa`, mirrored from the server) beside the newly-claimed
`Guest Cla` room, confirming the hydrate landed. The claimed room itself never syncs to the server
(`RoomSyncCoordinator` is documented as read-only — "the read half of the room mirror"; nothing in
the claim path pushes) — `psql` confirms no `Guest Claim Room` row server-side — but this is
honestly disclosed: `Your Spaces` shows a "Saved on this phone" pill under it (`YourSpacesView.swift`
`isLocalOnly`). Not a defect; worth flagging only because the Companion's "Sign in" CTA copy reads
"Save rooms · Sync across devices" and this room does the first but not, yet, the second.

**Room names get silently truncated on save** — "W4 Walk4 Room" saved as `W4 Wa` (`psql`-confirmed,
not a display ellipsis), two separate attempts at "Guest Claim Test"/"Guest Claim Room" both saved
as `Guest Cla`. The truncation points aren't a consistent character count, which points at an
automation input-timing artifact (the harness's `input-text` outrunning the field, or the tap-to-Save
landing before the last characters committed) rather than a deterministic field limit — flagged as an
observation, not a confirmed app defect, since it wasn't independently reproduced with a slower typing
cadence.

Cleanup: `leads.created_at`/`updated_at` for `a8fc690e-c31a-4928-b54b-1765d3b53697` restored;
`W4 Wa` (the only test room that reached the server) deleted server-side, leaving only D's
`Guest Bedroom` under the client's `user_id`; `saved_items` for the client confirmed empty
server-side; the local-only `Guest Claim Room`/`Guest Cla` was never server-side and needed no
server cleanup (its on-device SwiftData copy remains, harmless, consistent with the app's
local-first design).

Leave state: signed in as `client@patina.dev`, flag off, on the Daily Room, light appearance,
medium (default) text size, scrolled to top (`w4-49`).

## w5-a11y

Lane A11Y, W5. Clone `dr-w5-a11y` `E76EDACA-3C5A-4A3C-B1DC-A9915FEBDF56` (iPhone 17 Pro / iOS 26.5,
402×874 pt), signed adhoc from
`.codex/worktrees/agent-dr-w5-a11y/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
(`codesign -dv` → `Identifier=cloud.patina.app`, `Signature=adhoc` — not
`CODE_SIGNING_ALLOWED=NO`). Signed in as `client@patina.dev` against the local stack. Every frame
from `xcrun simctl io <udid> screenshot`; taps and swipes from blitz with the explicit udid. No
`screencapture`.

Text size is `accessibility-extra-extra-large` except where a row says otherwise.

| Shot | What it shows | AX frames quoted |
|---|---|---|
| `w5-a11y-01-prefix-panel-460pt-cap-ax-xxl.png` | **Pre-fix.** The Companion panel with round 3's hardcoded 460 pt cap, scrolled. The panel occupies 316…816 on an 874 pt screen — ~250 pt of screen unused above it. Flag off | Panel content top 316 (header `Where to next?` at `y=336`, h=184); `companion.help`/`companion.close` `{258,336}`/`{314,336}` 44×44; rows `bubble.left…` `y=699` h=262, `rectangle.grid.1x2` `y=967` h=177.33, `sparkles` `y=1150.33` h=225.33, `heart` `y=1381.67` h=140.67, **`square.grid.2x2` ("Your spaces") `y=1528.33`**, **`person.circle` ("Your profile") `y=1681`** — reproducing walk 4 item 7's numbers exactly |
| — (no shot; frames only) | **The diagnosis.** A swipe `fromY:740→400` moved every frame up by 540.33 pt (header `336 → -204.33`) — the ScrollView is real and it does scroll. A swipe `fromY:800→400` (walk 4's own start point) left the header at `y=336` — nothing. A swipe `fromY:790→400` scrolled. The ScrollView's viewport ended at 796; 796…816 was the shell's 20 pt inset, outside it | header `336` → `-204.33` (moved) · header `336` → `336` from y=800 (dead) · `rectangle.grid.1x2` at `y=220.67` from y=790 (moved) |
| `w5-a11y-02-orb-yields-corner-mark-flagoff-ax-xxl.png` | **Delivery 2.** The dock has yielded: `companion.bubble` is the 44 pt mark in the trailing corner, and the Hearth reservation shrank with it. Flag off, Today | `companion.bubble` **`{{338, 768}, {44, 44}}`** (was `{{169, 748}, {64, 64}}`); reservation `{{0, 768}, {402, 72}}` (was `{{0, 720}, {402, 120}}`); `AXValue: "5 things need your eye"` still announced |
| `w5-a11y-03-story-card-under-former-bubble-coords.png` | Today scrolled so the editorial story card sits under walk 4's failure point (201, 780) — the same coincidence finding 1 describes | `DailyRoomView.EditorialStory` `{{20, 620.33}, {362, 249.67}}` → spans y=620…870, x=20…382; (201, 780) is inside it, and inside the old bubble's `169…233 × 748…812` |
| `w5-a11y-04-tap-at-former-bubble-opens-the-story.png` | **Delivery 2 acceptance.** A tap at exactly (201, 780) opened the **story**, not the Companion — walk 4 finding 1's failure case, passing | After the tap: `MAKER SPOTLIGHT`, `The Grain Whisperer of Maine`, `Jonathan Chilton`, `FREEPORT, MAINE`, the article body. The corner mark is still mounted at `{{338, 768}, {44, 44}}`, out of the column |
| `w5-a11y-05-panel-takes-the-height-it-is-given-754pt.png` | **Delivery 1.** The panel at offset 0 after the fix: it now runs 62…816 — a 754 pt viewport against the old 460 | header `Where to next?` **`y=82`** (was `y=336`); `companion.help`/`companion.close` at `y=82`; rows `bubble.left…` `y=445`, `rectangle.grid.1x2` `y=713`, `sparkles` `y=896.33`, `heart` `y=1127.67`, `square.grid.2x2` `y=1274.33`, `person.circle` `y=1427` |
| `w5-a11y-06-one-swipe-from-y800-reaches-your-profile.png` | **Delivery 1 acceptance.** **One** swipe, started at **y=800** — the exact point that was dead before — put both last rows fully inside the viewport (62…816) | **`square.grid.2x2` ("Your spaces") `{{44, 466}, {314, 146.67}}`** and **`person.circle` ("Your profile") `{{44, 618.67}, {314, 177.33}}`** — both wholly within 62…816. Header at `y=-726.33` (full 808 pt of travel in one gesture) |
| `w5-a11y-07-last-row-tappable-profile-opened.png` | The last row is not merely visible but tappable: a tap at (200, 707) opened Your profile | `Client User`, `MEMBER SINCE AUG 28, 2026`, `STUDIO`, `StudioHub.Section.awaitingYou` … |
| `w5-a11y-08-default-size-panel-unchanged-hugs-content.png` | **Regression control, `content_size large`.** At a non-accessibility size the panel is unchanged: it hugs its content (311…816, 505 pt) rather than filling the screen, so `ViewThatFits` picks the plain column, and the dock is the centred 64 pt mark again | header `y=331.33`; rows at 60 pt each — `y=406/472/538/604/670/736`; panel bottom 796+20=816. Collapsed dock after close: `companion.bubble` `{{169, 724}, {64, 64}}`, label `"Patina companion"` (the resting Hearth, not the corner mark) |
| `w5-a11y-09-flag-on-direct-orders-same-result.png` | The same two proofs under `-PatinaFlags direct-orders`: identical | One swipe from y=800 → `person.circle` `{{44, 618.67}, {314, 177.33}}`; a point-probe at (201, 707) resolves **to that row**, so it wins the hit test there, not merely draws there |

Leave state: `dr-w5-a11y` booted, signed in as `client@patina.dev`, flag `direct-orders` on, the
Companion panel open and scrolled at `accessibility-extra-extra-large`. The review device
`973D1724-90BF-4A0A-B02D-481D561547B3` was shut down only to take the clone and was re-booted
immediately; nothing was installed on it and its own state is untouched.

## w5-c2

Lane C2, W5 — Ordered over both rails, and the order's return loop. Clone `dr-w5-c2`
`6611FFA8-1820-4C98-81B8-60DE52086D00` (iPhone 17 Pro / iOS 26.5, 402×874 pt), signed build from
`.codex/worktrees/agent-dr-w5-c2/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
(`codesign -dv` → `Identifier=cloud.patina.app`; built with a concrete simulator destination, **not**
`CODE_SIGNING_ALLOWED=NO`). Signed in as `client@patina.dev` against the local stack. Every frame from
`xcrun simctl io <udid> screenshot`; taps and swipes from blitz with the explicit udid. No
`screencapture`.

The data is the seed's, unedited except where a row says so: `fulfillment_orders`
`f5000000-…-0001` (client `a0000000-…-0005`, designer `a0000000-…-0004` = Leah Hartwell,
`captured_total_cents` 680000, `intake_at` Aug 7), one line `Meadow Linen Sectional` at
`line_state='shipped'`, `line_state_entered_at` Aug 24, and one shipment
(`carrier='Pilot Freight'`, `tracking='PFS4820117744'`, `current_eta='2026-09-03'`).
`direct_orders` is **empty** on this stack — C1's flow has not run yet, so the paid-but-not-on-rail
card is unit-tested and not on glass here.

| Shot | What it shows |
|---|---|
| `w5-c2-00-launch.png` | Launch state on the clone, flag `direct-orders` on. Signed out |
| `w5-c2-01-today.png` | The record after sign-in. **MOVED carries `Meadow Linen Sectional shipped.` · `AUG 24`** — the `orderMoved` producer, live, dated by the real `line_state_entered_at` and not by "now". No "Order placed" row anywhere: nothing on this stack was placed by the reader |
| `w5-c2-02-studio.png` | Studio hub top — Awaiting you (5), unchanged |
| `w5-c2-02-studio-ordered-row.png` | **Money & documents (4), and `Ordered · 1 piece on its way · Shipped` is its first row**, above Proposals / Invoices / Budget. Option B's Studio contract, the count from the same holder the screen reads |
| `w5-c2-03-ordered-list.png` | **M8.** `ORDERED / Your orders`; one card — eyebrow `ORDERED BY LEAH`, `Meadow Linen Sectional`, the four-step rail `CONFIRMED · IN PRODUCTION · SHIPPED · DELIVERED` with SHIPPED in charcoal and DELIVERED in pearl, `Shipped Aug 24 · arriving Sep 3.`, `$6,800.00 · PAID AUG 7`, footer `Leah ordered this for you.` (no project name: this seeded row carries no `designer_attribution`, so none is invented) |
| `w5-c2-04-order-detail.png` | The detail: the rail and state line, `PAID / $6,800.00 / August 7, 2026`, rows `Message Leah` · `See the piece` · `Report a problem`, and under `IF SOMETHING'S WRONG` the responsibility paragraph returned by **`get_direct_order_terms()`** — the RPC answering an `authenticated` caller end-to-end. **No `Track with the carrier` row**: `Pilot Freight` is not in the client-side carrier→URL map and the app does not guess a tracking URL (see the finding below) |
| `w5-c2-05-flag-off-studio.png` | Relaunched with **no** `-PatinaFlags`. The Ordered row is still there, still first in Money & documents — Ordered is deliberately unflagged; `direct-orders` gates *Buy* (R3), and M8's designer-sourced card exists with the flag off |
| `w5-c2-06-record-after-state-change.png` | **The state change, made unsandboxed in local Postgres** (`set local app.fulfillment_writer='migration'; update fulfillment_order_items set line_state='delivered', line_state_entered_at=now()`). After relaunch the record reads **`Meadow Linen Sectional arrived.` · `AUG 28`**, and it sorts above the Aug 27 story. The row followed the line, and took the line's own new date |

**Restored.** The line was put back to `shipped` / `2026-08-24 19:55:33.903572+00`. The monotonic
`trg_fulfillment_line_transition` refuses `delivered → shipped`, so it was disabled for that one
statement and re-enabled inside the same transaction; all three triggers on
`fulfillment_order_items` verify enabled (`tgenabled='O'`) afterwards. Only `updated_at` differs from
the seed (its own trigger bumped it) — no other column, no other table, no other row.

**Finding for the record: the one seeded carrier is not in the map.** `Pilot Freight` has no
verified public tracking-URL template, so `CarrierTracking.url` returns nil and the row does not
draw — which is the rule working, and also means `Track with the carrier` is unit-tested and
**compile-green on the walk, not sim-verified**. Adding a Pilot Freight template is a content
decision that needs a URL somebody has checked; guessing one puts a homeowner on a 404 with her
sofa's number in the address bar.

Leave state: `dr-w5-c2` booted, signed in as `client@patina.dev`, flag `direct-orders` on, sitting on
Today. The review device `973D1724-90BF-4A0A-B02D-481D561547B3` was shut down only to take the clone
and was re-booted immediately; nothing was installed on it.

### w5-c2 — fix round (after `waves/w5/c2-review.md`)

Same clone, same account, same local stack. Rebuilt and reinstalled from
`.codex/worktrees/agent-dr-w5-c2/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
(`codesign -dv` → `Identifier=cloud.patina.app`; the test-tier build, **not**
`CODE_SIGNING_ALLOWED=NO`). Every frame from `xcrun simctl io <udid> screenshot`; taps and swipes
from blitz with the explicit udid. No `screencapture`. `direct_orders` is **still empty** on this
stack, so everything below is the designer rail.

| Shot | What it shows |
|---|---|
| `w5-c2-07-today.png` | The record after relaunch, flag on. `Meadow Linen Sectional shipped. · Ordered by Leah · AUG 24` — the `orderMoved` producer unchanged by the fix round |
| `w5-c2-08-studio-ordered-row.png` | Money & documents; `Ordered · 1 piece on its way · Shipped` still first. The shipped case reads the same after M1 — as it must |
| `w5-c2-09-ordered-list.png` | **M2 + M5 + MI-6 on glass.** The card now: `Meadow Linen Sectional`, the four-step rail, `Shipped Aug 24 · arriving Sep 3.`, a rule, **`Message Leah` on the card**, footer `Leah ordered this for you.` — and **no `ORDERED BY LEAH` eyebrow and no `$6,800.00 · PAID AUG 7` money line**, which is M8's designer-sourced card exactly. (`Track with the carrier` still absent: `Pilot Freight` is not in the map) |
| `w5-c2-10-order-detail.png` | **M7 + M2 + MI-2/3/7 on glass.** No `PAID / $6,800.00 / August 7, 2026` block at all on a designer-sourced order. Three rows — `Message Leah` · `See the piece` · `Report a problem` — with dividers only *between* them, and `IF SOMETHING’S WRONG` with the curly apostrophe |
| `w5-c2-11-studio-delivered-row.png` | **M1 on glass.** With the seeded line temporarily at `delivered`, the Studio row reads **`Ordered · 1 piece delivered · Delivered`**. Before the fix it read `1 piece on its way` over an arrived order |
| `w5-c2-12-flag-off-studio.png` | Relaunched with **no** `-PatinaFlags`. `Ordered · 1 piece on its way · Shipped` still first in Money & documents — Ordered stays unflagged |

**The state change, and its restore.** Made unsandboxed in local Postgres, one row, one column pair:
`f5000000-0000-4000-8000-000000000002` set to `line_state='delivered', line_state_entered_at=now()`
behind `set local app.fulfillment_writer='migration'`, with `trg_fulfillment_line_transition`
disabled for that statement (the trigger is monotonic and refuses the way back) and re-enabled in the
same transaction. Restored immediately after the shot to `shipped` /
`2026-08-24 19:55:33.903572+00`, verified by `SELECT`; all three triggers on
`fulfillment_order_items` verified `tgenabled='O'` both times. Only `updated_at` differs from the
seed (its own trigger bumped it) — no other column, no other table, no other row.

**Claim level, restated (MI-11 stands).** Sim-verified here covers the **designer rail only**. The
direct rail, `paidNotOnRail`, the two-rail merge, the refund branch and `Track with the carrier` are
**compile-green + unit-tested, not sim-verified** — `direct_orders` is empty on this stack and
`Pilot Freight` is not in the carrier map. M4's unlinkable-contact branch is unit-tested only: the
config value is `hello@patina.cloud`, which takes the `mailto` branch.

Leave state: `dr-w5-c2` booted, signed in as `client@patina.dev`, flag `direct-orders` on, launched
onto Today. Nothing installed on the review device.

## w5-c1

Lane C1, W5 — the piece's acts and the purchase flow. Clone `dr-w5-c1`
`38B7C735-6911-4E7A-B8B8-0273BACA59AB` (iPhone 17 Pro / iOS 26.5, 402×874 pt), signed build from
`.codex/worktrees/agent-dr-w5-c1/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
(`codesign -dv` → `Identifier=cloud.patina.app`, `Signature=adhoc`; built against a concrete
simulator destination, **not** `CODE_SIGNING_ALLOWED=NO`). Local stack, launched
`-DeploymentTarget local -PatinaFlags direct-orders` (and once without the flag). Every frame from
`xcrun simctl io <udid> screenshot`; every tap from blitz with the explicit udid. No
`screencapture`. The AppleScript helper `shots/_tap.sh` was tried once mid-walk and did **not**
deliver (the screen did not change); blitz delivered every time and was used for everything after.

Four accounts, because the act is a function of the relationship: `client@patina.dev`
(three active projects → `.project`), `james.okafor@example.com` (accepted, claimed lead →
`.lead`), a guest, and `w5c1-discovering@patina.test` — a homeowner created in-app through the OTP
flow, because **no seeded account has no designer**. The local sign-in mail now renders a 6-digit
code (`Your Patina sign-in code is 927870`), so `02-steward-boot.md` §7's "OTP cannot be completed
locally" is superseded.

| Shot | What it shows |
|---|---|
| `w5-c1-01-live-client-ask-leah-no-buy.png` | **R3, on glass.** `client@patina.dev` on the Heirloom Oak Dining Table: the primary reads **`Ask Leah to source this`**, the ghost `Add to room`, and there is **no Buy control anywhere** — not as a secondary, not as a disclosure line. `PurchaseActionBar.Primary` `{{24,752},{179.67,52}}`, `.AddToRoom` `{{211.67,752},{118.33,52}}` |
| `w5-c1-02-ask-designer-sheet.png` | **M7.** `Ask Leah` over `HEIRLOOM OAK DINING TABLE`, the 56 pt thumbnail beside `NORDIC ATELIER · $4,200.00`, the editable message pre-filled `Can we use the Heirloom Oak Dining Table?`, primary `Send to Leah`, caption `She'll see the piece, the price and the room.` |
| `w5-c1-03-ask-designer-sent.png` | The send, landed. Server-side proof, not a screenshot claim: `comms_messages` gained one row from `a0000000-…-005` into project thread `b0000000-…-d3`, body `Can we use the Heirloom Oak Dining Table?\n\nHeirloom Oak Dining Table · $4,200.00 · Nordic Atelier`. **This frame also carries a defect the walk caught and the branch fixes:** the post-send caption read "…and the room" for a client with no rooms, over a message that carried two of the three. `AskDesignerSheet.caption(hasRoom:sent:)` now branches, and `AskSheetsTests` pins it |
| `w5-c1-04-guest-buy-draws.png` | Guest ("Look around first"), same piece: **`Buy — $4,200.00`** draws. B §5's Path A row for a guest |
| `w5-c1-05-guest-buy-auth-wall.png` | **C9 / SP-09.** The guest's tap on Buy raises the soft wall over context — titled `Sign in to order`, with a real `Cancel`. `select count(*) from direct_orders` was **0** before the tap and **0** after: nothing is written for a guest |
| `w5-c1-06-discovering-buy-draws.png` | `w5c1-discovering@patina.test`, signed in, no designer: `Buy — $4,200.00`. **The frame before this one was the fix:** on first sight the bar read `Ask about this piece` and never changed, because the two designer services never refresh for a session that lands straight on a piece from `patina://piece/<id>` — `ProductDetailView` now asks them for an answer when it has none |
| `w5-c1-07-order-sheet-tax-off.png` | **M5a, and critique M14.** `Piece $4,200.00`; `Delivery and tax are not included yet.`; `Sold and shipped by Patina.`; the responsibility paragraph and `Questions or damage: hello@patina.cloud` printed verbatim from `get_direct_order_terms()`; **`Continue to payment` disabled**, with `Delivery and tax are not included yet, so we can't take payment for this piece yet.` under it. Path A does not complete while the server setting is off |
| `w5-c1-08-order-sheet-tax-on.png` | The same sheet with `direct_orders.tax_shipping_enabled` flipped **true** for this capture: the line becomes `Delivery and tax are added at payment. You'll see the full total before you pay.`, the act is live, and the caption is `Payment opens securely in Safari.` The config was restored to `{"enabled": false}` immediately after — verified by re-select |
| `w5-c1-09-checkout-failure-patina-voice.png` | **C5, closed on this rail.** With the local `STRIPE_SECRET_KEY` still the 32-char placeholder, `Continue to payment` created the order and the Checkout call came back 502. The screen says **`We couldn't start this payment. Nothing has been charged.`** with `Let's try that again`, **above** the act. Stripe's own `Invalid API Key provided: sk_test_…` — the string W0 found on the invoice path — appears nowhere. The order row exists (`1959c6a7-…`, `Heirloom Oak Dining Table`, `420000`, `pending_payment`, `designer_id` NULL, so no credited inset, correctly) |
| `w5-c1-10-flag-off-no-buy.png` | Relaunched **without** `-PatinaFlags direct-orders`: the primary is `Ask about this piece` and **no reason is printed** — a feature flag is not a fact about the piece |
| `w5-c1-11-companion-piece-row-buy.png` | The Companion's piece-context menu: `Save` (not suggested) · **`Buy — $4,200.00` / `PAYMENT OPENS SECURELY IN SAFARI`** (the one suggested row) · `Home` · `Your profile`. Four rows, so the ≤6 ceiling holds, and the row carries the bar's exact label |
| `w5-c1-12-companion-row-opens-order-sheet.png` | Tapping that row opens the **same** sheet the bar opens — `OrderSheet.Primary` present, disabled (the config was back to false by then). The two surfaces cannot say the same words and do different things |
| `w5-c1-13-engaged-lead-ask-leah.png` | `james.okafor@example.com` — accepted, claimed lead, **no project**: `Ask Leah to source this`. R3's other live shape |

### Fix round (after `c1-review.md`) — shots 14–20

Same clone, same rules. Rebuilt and reinstalled from `.build/dd` after the fix round; launched
`-DeploymentTarget local -PatinaFlags direct-orders`, and once **without** the flag for `17`.

| Shot | What it shows |
|---|---|
| `w5-c1-14-r3-holds-after-fix-ask-leah-no-buy.png` | **R3 survives the round.** `client@patina.dev` on the Heirloom Oak Dining Table: `PurchaseActionBar.Primary` = `Ask Leah to source this`, ghost `Add to room`, no Buy control anywhere |
| `w5-c1-15-path-b-caption-names-leah.png` | **Minor 8, closed.** `AskDesignerSheet.Caption` reads `Leah will see the piece and the price.` — the designer's name rather than a guessed pronoun, and no room promised to a client with no rooms |
| `w5-c1-16-guest-buy-wall-sign-in-to-order.png` | **The guest wall, titled.** Guest taps `Buy — $4,200.00`; the wall heading is `Sign in to order`, with a real `Cancel`. `select count(*) from direct_orders` = **1** before and **1** after (the row is the first walk's `1959c6a7-…`; nothing new was written) |
| `w5-c1-17-path-c-wall-sign-in-to-ask.png` | **Minor 4, closed.** Relaunched without `-PatinaFlags direct-orders`: the guest's `Ask about this piece` raises a wall headed `Sign in to ask` — a reader who asked a question is no longer told to sign in to order something |
| `w5-c1-18-order-sheet-total-row.png` | **M3, closed.** With `products.shipping_flat_cents = 18000` on the Heirloom Oak, the sheet's money block prints `Piece $4,200.00` · `Delivery $180.00` · `Total $4,380.00` (`OrderSheet.Money.Total`). `Delivery and tax are not included yet.`, `Continue to payment` disabled with its reason — M14 unchanged. The column was set back to NULL immediately after, verified by re-select |
| `w5-c1-19-discovering-client-buy-still-draws.png` | **M1 did not over-tighten.** `w5c1-discovering@patina.test`, signed in, no designer, after a launch where the projects fetch answered: `Buy — $4,200.00` |
| `w5-c1-20-buy-after-signing-in-at-the-wall.png` | **A defect this round found on glass and fixed.** Signing in *through the wall* used to leave the bar on `Ask about this piece` for the session — `.task` had already run as a guest, where the relationship is knowable without any fetch, so nothing re-asked when the session landed. `ProductDetailView` now watches `AuthService.shared.isAuthenticated`. The frame is the bar reading `Buy — $4,200.00` with no relaunch; server-side proof is one `auth.sessions` row for that account created inside the preceding five minutes |

Data touched by the fix round, disclosed rather than cleaned: `products.shipping_flat_cents` on
`a0000000-0000-0000-0000-000000000001` set to `18000` and **restored to NULL**; two simulator
keychain resets (to reach a guest) and two OTP sign-ins for `w5c1-discovering@patina.test`. **No new
`direct_orders` row** — the count was 1 before and 1 after. `fulfillment_config` was not touched
this round.

Data written by this walk, disclosed rather than cleaned: one `auth.users` + `profiles` row
(`w5c1-discovering@patina.test`, role `homeowner`), one `comms_messages` row in project thread
`b0000000-…-d3`, and one `direct_orders` row `1959c6a7-78c0-4916-97d4-c5770e7ddcde` left
`pending_payment` (the Checkout call failed on the placeholder key — a real product state, not a
stranded write). `fulfillment_config.direct_orders.tax_shipping_enabled` was toggled true and
**restored to false**; nothing else on the shared local database was changed.

Environment repairs made to reach the walk, both restarts and neither a reset: the
`supabase_edge_runtime_supabase` container was **Exited** and was started, after which Kong
answered `{"message":"name resolution failed"}` for every function (the known Kong-DNS trap) until
`supabase_kong_supabase` was restarted. Edge functions have answered since.

Leave state: `dr-w5-c1` booted, signed in as `james.okafor@example.com`, flag `direct-orders` on,
on the piece screen, light appearance, status bar overridden to 9:41. The review device
`973D1724-90BF-4A0A-B02D-481D561547B3` was shut down only to take the clone and was re-booted
immediately; nothing was installed on it.

## w5 walk

Acceptance walker · review device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro / iOS 26.5),
2026-08-28. Installed `.codex/worktrees/agent-dr-w5-integration/.build/dd/…/Patina.app`
(`xcrun simctl install`, unsandboxed) — signed `adhoc`, not `CODE_SIGNING_ALLOWED=NO`.
`-DeploymentTarget local` on every launch; flag-on launches add `-PatinaFlags direct-orders`.
`STRIPE_SECRET_KEY` re-verified before the walk: still `sk_test_…alls`, 32 chars — the placeholder
(`w5/steward.md` §2, unchanged). `direct_orders.tax_shipping_enabled` = `false` (00540 default,
untouched).

| Shot | State | What it shows |
|---|---|---|
| `w5-01-activeproject-piece-ask-only.png` | flag on, `client@patina.dev`, Heirloom Oak Dining Table (gate-passing) | Primary `Ask Leah to source this`, secondary `Add to room` — **no Buy anywhere**, no "Buy it myself" (R3 as ruled: pre-emption holds with no secondary Buy act) |
| `w5-02-activeproject-ask-leah-sent.png` | same | `Ask Leah` sheet sent: `Can we use the Heirloom Oak Dining Table?` / `Heirloom Oak Dining Table · $4,200.00 · Nordic Atelier`. Server: `comms_messages` row landed in a **project** thread (`rpc_start_project_thread`) — but the project it landed on is `Birch Hollow` (`b0000000-…-d3`), not `Aspen Loft Refresh` (`b0000000-…-d1`, created earlier by `created_at`). `DesignerRelationshipResolver.activeProject(in:)` is `projects.first { !archived && designer_id != nil }` over three simultaneously-active projects for this seed, and "first" is not stably `created_at`-ordered here — the same `…-d3` target as `w5-c1`'s own walk (`01-shot-ledger.md` line 1433), so this is a **pre-existing, reproducible ambiguity**, not new. The message itself, the piece, and the price are all correct; only the specific project is arguably wrong when a client has >1 active project |
| `w5-03-engaged-piece-ask-only.png` | flag on, `james.okafor@example.com` (accepted lead, no project), same piece | Primary `Ask Leah to source this`, no Buy — correct for engaged tier |
| `w5-04-engaged-ask-leah-sheet.png` | same | `Ask Leah` sheet, same piece/price |
| `w5-05-engaged-ask-FAIL-wrong-project.png` | same, **sent within the SAME app process right after a Settings→Sign Out from `client@patina.dev`** | **FAIL.** The sheet shows `We couldn't send that. Your designer hasn't seen it yet.` No `comms_messages`/`comms_threads` row written. Postgres log at the same second: `authenticator@postgres ERROR: caller is not part of project b0000000-0000-0000-0000-0000000000d3` — the app tried `rpc_start_project_thread(Birch Hollow)`, **client@patina.dev's own project**, on James's account. `rpc_start_direct_thread(James, designer)` called directly in psql (bypassing the app) succeeds immediately, proving the RPC and the data are fine — the bug is client-side: `DesignerThreadOpener.currentRelationship` reads `BadgeCountService.shared.projects` / `DesignRequestStatusService.shared.liveLead`, process-lifetime `@Observable` singletons that were not cleared/refreshed after the in-process sign-out/sign-in, so `DesignerRelationshipResolver` resolved `.project(Birch Hollow, …)` for James using **client@patina.dev's stale project list** instead of `.lead(…)` for James's own accepted lead. The server's own authorization check correctly refused the cross-tenant write — no data actually leaked — but the user-facing consequence is a silent, wrongly-attributed send failure for anyone who switches accounts without a full relaunch |
| `w5-06-engaged-ask-succeeds-freshlaunch.png` | same account, **after `simctl terminate` + fresh `simctl launch`** (no sign-out/sign-in involved — the session persisted) | Same tap sequence now succeeds: `comms_messages` row lands in James's own **direct** thread (`rpc_start_direct_thread`, kind `direct`), sender = James, same piece/price text. Confirms the feature itself is correct; the defect is specifically the cross-account cache staleness above |
| `w5-07-guest-piece-buy-draws.png` | flag on, guest ("Look around first") | `Buy — $4,200.00` primary, `Add to room` secondary |
| `w5-08-guest-buy-authwall.png` | same, tapped Buy | `Sign in to order` sheet with `Cancel` — SP-09's auth wall, no guest option. `direct_orders` count **0 before and after** |
| `w5-09-discovering-buy-draws.png` | flag on, fresh sign-up `w5walk-discovering@patina.test` (role `homeowner`; verified server-side: no `leads`, no `projects`, no `designer_clients` row — the one seeded/creatable account this DB has with a genuinely dead relationship; every seeded homeowner in this stack currently resolves `isLive = true` via a non-terminal lead with `designer_id` set, so none could stand in) | `Buy — $4,200.00` draws for a true no-designer client |
| `w5-10-discovering-order-sheet-honest-taxline-disabled.png` | same, tapped Buy | Order sheet: `HEIRLOOM OAK DINING TABLE` / `Nordic Atelier` / real description / `Dimensions 96″ W × 40″ D × 30″ H` / `Lead time Made to order · ships in 10 weeks` / `Piece $4,200.00` / **`Delivery and tax are not included yet.`** (honest to `tax_shipping_enabled = false`) / `Sold and shipped by Patina.` / the real responsibility paragraph (`fulfillment_config`, not placeholder text) / `Questions or damage: hello@patina.cloud`. `Continue to payment` is **disabled**, subtitled `Delivery and tax are not included yet, so we can't take payment for this piece yet.` — `c1-tasks.md`'s ruled M14 behavior ("Path A stays off"): the sheet is reachable but checkout cannot complete. Tapped anyway — no-op, `direct_orders` count stayed **0** |
| `w5-11-ordered-list-seeded-shipped.png` | flag on, `client@patina.dev` | Studio → Ordered: `Meadow Linen Sectional` · Shipped Aug 24 · arriving Sep 3 · "Leah ordered this for you." |
| `w5-12-order-detail-shipped-no-tracking-row.png` | same, tapped in | Rail `Confirmed → In production → **Shipped**(current) → Delivered`; rows `Message Leah` / `See the piece` / `Report a problem`; the responsibility paragraph again. **No `Track with the carrier` row** — correct: the seed's carrier is `Pilot Freight` (white-glove), and `CarrierTracking.templates` only maps parcel carriers (UPS/FedEx/USPS/DHL + named LTL lines); an unmapped carrier resolves to `nil` and the row is withheld by design (`CarrierTracking.swift`'s own comment: "guessing a tracking URL is how a homeowner lands on a 404") |
| `w5-13-today-moved-delivered-realdate.png` | same, after flipping `fulfillment_order_items.line_state` → `delivered` (+ `fulfillment_shipments.delivered_at`) in local Postgres and a fresh `terminate`+`launch` | Today's MOVED row now reads **`Meadow Linen Sectional arrived. Ordered by Leah. Aug 28.`** — the real date (today), not a stale one. Reverting the flip was attempted and correctly **refused** — `enforce_fulfillment_line_transition()` raises `illegal transition delivered -> shipped`; the state machine is enforced server-side, not cosmetic. Left `delivered`; the next `supabase db reset` restores seed state |
| `w5-14-flagoff-today.png` / `w5-15-flagoff-activeproject-ask-unchanged.png` | flag **off**, `client@patina.dev` | Today unchanged; the same piece still shows `Ask Leah to source this` / `Add to room`, no Buy — R3's pre-emption is not flag-gated |
| `w5-16-flagoff-guest-askabout-nobuy.png` | flag off, guest, same piece | `Ask about this piece` primary, no Buy — Path C unchanged |
| `w5-17-leavestate-flagoff-client-daily-room.png` | flag off, `client@patina.dev`, Daily Room, light, default text | Leave state |

**Unscripted finding, item 2 (see `w5-05`):** a cross-account cache-staleness bug in
`DesignerThreadOpener`/`BadgeCountService` — switching accounts via Settings → Sign Out → Sign In
**within the same running app process** can leak the previous account's project id into the new
account's "Ask your designer" send, which then fails silently (server-side authorization correctly
blocks the cross-tenant write, so no message is misdelivered, but the user sees an unexplained
failure). A full `terminate`+`launch` between accounts avoids it. Filed as a **FAIL** for item 2 as
first attempted; the underlying feature is proven correct on a fresh process (`w5-06`).

Data written by this walk, disclosed rather than cleaned: one `auth.users`+`profiles` row
(`w5walk-discovering@patina.test`, role `homeowner`, no relationships); two `comms_messages` rows
(`client@patina.dev` → Birch Hollow project thread; `james.okafor@example.com` → a new direct
thread) and their two parent `comms_threads` rows; `fulfillment_order_items` id
`f5000000-…-0002` advanced `shipped → delivered` (irreversible by design — see above) with
`fulfillment_shipments` id `f5000000-…-0005`'s `delivered_at` set. **No `direct_orders` row was
ever created** — every path that could have written one either hit the guest auth wall or the
disabled/tax-gated `Continue to payment` before any RPC fired; count stayed **0** throughout.

Leave state: signed in as `client@patina.dev`, flag off, on the Daily Room, light appearance,
default text size (`w5-17`).

## w6-x2

Lane X2, W6. Clone `dr-w6-x2` `05F96C3D-FC4F-4C6B-AC07-503261141C8F` (iPhone 17 Pro / iOS 26.5,
402×874 pt), signed adhoc from
`.codex/worktrees/agent-dr-w6-x2/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
(the `xcodebuild test` product — **not** `CODE_SIGNING_ALLOWED=NO`). Launched
`-DeploymentTarget local -PatinaFlags house-widget`, signed in as `client@patina.dev` against the
local stack. Every frame from `xcrun simctl io <udid> screenshot`; taps from blitz with the explicit
udid. No `screencapture`.

| Shot | What it shows | Quoted |
|---|---|---|
| `w6-x2-01-today-record.png` | Today, flag on, the Record painted | AX: `Your invoice is due. INV-2026-0142. $4,250.00 · due Sep 2.` · MOVED: `Meadow Linen Sectional arrived. Ordered by Leah. Aug 28.` · house rail first card `Guest Bedroom` |
| `w6-x2-02-invoice-reminder-offered.png` | Invoice detail, the act offered under `Due Sep 2` | `Remind me the day before it's due` (AXUniqueId `invoiceDetail.reminder`) over `We'll send one notification: “Your invoice is due tomorrow — $4,250.00. Nothing else.”` |
| `w6-x2-03-reminder-set.png` | The same row, set | `Reminder set for Sep 1.` + `Remove` — Sep 1 is the day before Sep 2 |
| `w6-x2-04-reminder-removed.png` | After `Remove` | back to `Remind me the day before it's due`; nothing left claiming a reminder |
| `w6-x2-05-reminder-survives-relaunch.png` | Re-set, then `simctl terminate` + fresh `launch` | `Reminder set for Sep 1.` — read back from `UNUserNotificationCenter`'s own pending queue, not from a second copy the app keeps |

**The two files in the shared container, quoted from the device.** The App Group container **was**
honoured on this build (as `w2/r2-notes.md` §3 recorded, and unlike the empty-entitlements case
`w2/r1-notes.md` §7 recorded) —
`…/Devices/05F96C3D-…/data/Containers/Shared/AppGroup/11192F24-DF96-4E56-81A9-1759F1B189F1/`:

```
house-record.json    keys ['hasMoreMoved','hasMoreNeedsYou','moved','needsYou','window']
                     needsYou ['invoice:b0…e142', 'proposal:b0…0002', 'decision:b0…2c02']
widget-snapshot.json keys ['flagOn','movedRows','refreshedAt']
                     movedRows ['order:fulfillment:f5000000-…-0001', 'story:a8b3f8a0-…-1a01']
                     flagOn true   refreshedAt 2026-08-28T23:38:06Z → 23:39:58Z after relaunch
```

The record on disk carries three NEEDS YOU rows; the widget's file carries **none of them, and no
count** — Q8 / C5 / B §4, made structural rather than reviewed. `refreshedAt` advanced on the
relaunch, so the write and the `reloadTimelines(ofKind: "PatinaHouseWidget")` fire on every record
save. `houseLine` is absent because nothing calls `noteHouseLine` yet (integration note, X2 §1).

`Library/Preferences/group.cloud.patina.app.plist` in the same container:

```
"patina.flags.resolved" => { "direct-orders" => false, "house-first" => false, "house-widget" => true }
"patina.house.lastSeenAt" => 1787960286.728326
"patina.house.recordOwnerId" => "A0000000-0000-0000-0000-000000000005"
```

The flag mirror lands beside the visit stamp and the owner stamp, in the suite the widget reads.

**Claim level: sim-verified.** The App Group being genuinely shared between the app process and a
widget process remains a **device** claim; no widget was installed and none was drawn. Notification
authorization was granted through `PushPrimerView` → the system alert (`Allow`) on this clone; APNs
delivery was not exercised and is not claimed.

### w6-x2 · fix round (X2 review F1–F6)

Same clone `dr-w6-x2` `05F96C3D-FC4F-4C6B-AC07-503261141C8F`, signed adhoc from the `xcodebuild test`
product in the same worktree. **Uninstalled and reinstalled first**, so notification authorization
returned to `notDetermined` — the fix round's whole subject is the ask, and the earlier walk had
already granted it. Launched `-DeploymentTarget local -PatinaFlags house-widget`; the Supabase
session survived the reinstall in the keychain, so the app came back signed in as the same client.
Every frame from `xcrun simctl io <udid> screenshot`; taps from blitz with the explicit udid. No
`screencapture`.

| Shot | What it shows | Quoted |
|---|---|---|
| `w6-x2-fix-01-sp08-primer-untouched.png` | SP-08's push primer, fired by the money-moment trigger on a fresh install — **not** by the reminder | `Before we interrupt you` / `We'll tell you when your designer sends something that needs you — a decision, a proposal, or an invoice. Nothing else.` (`PushPrimerView.Allow` / `.NotNow`). Tapped **Not now** — arms Q7's gate, leaves authorization undecided |
| `w6-x2-fix-02-today-record.png` | Today, flag on, the Record painted | NEEDS YOU `Your invoice is due. INV-2026-0142. $4,250.00 · due Sep 2.` · MOVED `Meadow Linen Sectional arrived.` · house rail first card `Guest Bedroom` |
| `w6-x2-fix-03-reminder-offered.png` | Invoice detail, the act under `Due Sep 2`, consent sentence now at 12 pt (F12) | `Remind me the day before it's due` over `We'll send one notification: “Your invoice is due tomorrow — $4,250.00. Nothing else.”` |
| `w6-x2-fix-04-reminder-own-primer.png` | **F4** — the reminder's own primer, on an install whose Q7 ask is already spent | `The day before it's due` / the promise verbatim / `That is the whole of it — no badge, no repeat, nothing else. Remove it from this invoice whenever you like.` / `invoiceDetail.reminder.primer.allow` `Turn on the reminder` · `.dismiss` `Not now`. Pre-fix this path printed `Notifications are off for Patina.` (F9) |
| `w6-x2-fix-05-reminder-set.png` | After `Turn on the reminder` → system alert → `Allow` | `Reminder set for Sep 1.` + `Remove` — Sep 1 is the day before Sep 2, and the date now comes from the queued trigger, not a recomputed due date (F8) |
| `w6-x2-fix-06-paid-row-gone.png` | **F1** — `invoices.status → 'paid'` in the local stack, pull-to-refresh | header `Paid in full`; `invoiceDetail.reminder` is present at **zero height** — the row is mounted and drawing nothing, which is what lets its `.task` run on the transition |
| `w6-x2-fix-07-reminder-cancelled-by-payment.png` | **F1, the proof** — `status → 'sent'` again, pull-to-refresh | **`Remind me the day before it's due`** — not `Reminder set for Sep 1.` The row's only source is `UNUserNotificationCenter`'s pending queue, so reading *unset* means the request was genuinely cancelled while the invoice was paid |

**The two files in the shared container, quoted from the device** (a fresh container after the
reinstall — `…/AppGroup/C4C75B2E-969A-445E-A4F6-F3B89C45EFCA/`):

```
widget-snapshot.json keys ['flagOn','movedRows','refreshedAt','sinceDate']
                     sinceDate   2026-08-21T05:00:00Z      ← F2, new
                     refreshedAt 2026-08-29T00:32:31Z   flagOn true   houseLine ABSENT (F3, owed)
                     movedRows ['order:fulfillment:f5000000-…-0001', 'story:a8b3f8a0-…-1a01']
house-record.json    needsYou ['invoice:b0…e142', 'proposal:b0…0002', 'decision:b0…2c02']
                     window   {'start': '2026-08-21T05:00:00Z', duration 675151.27}
```

`sinceDate` is byte-identical to the record's window start — the window the app computed, not a day
derived from "now". 2026-08-21 is a **Friday**, so X1's widget now draws `Since Fri` and
`Nothing moved since Friday.` — M6b's strings — instead of the `What moved` / `Nothing moved.`
fallbacks. The record still carries three NEEDS YOU rows and the widget's file still carries none of
them and no count: the C5 / Q8 rule survived the change.

`houseLine` is still absent. Nothing calls `noteHouseLine` yet — F3, owed, one line in
`DailyRoomView`, the steward's (`x2-notes.md` §1).

**F5, measured on the same clone.** `launchArgumentOverrideWins` names `house-first,house-widget`;
run alone, the real suite read back afterwards:

```
"patina.flags.resolved" => { "direct-orders" => false, "house-first" => false, "house-widget" => false }
```

All three false — the test's values went to its own throwaway suite. The falses are the app host's
own launch resolution, which is the app doing what it does at every launch.

Leave state: signed in as the seeded client on the invoice detail, `house-widget` on, notification
authorization **granted**, no reminder scheduled, `INV-2026-0142` restored to `sent` / `$0.00 paid`
(the two temporary DB writes were reverted; `paid_at` back to null).

**Claim level: sim-verified.** A genuinely shared App Group between app and widget processes stays a
**device** claim — no widget installed, none drawn. Notification *delivery* was not exercised: the
walk proves the request enters and leaves the pending queue, not that iOS presents it on Sep 1. No
APNs claim; the reminder registers for nothing remote by design.


## w6-x1

Lane X1 (the widget target, its timeline, the deep links), worktree
`.codex/worktrees/agent-dr-w6-x1`, simulator clone **dr-w6-x1**
`C0F004CB-95D4-4BC5-AAD3-25E6513BD180` (iPhone 17 Pro, iOS 26.5). Build installed:
`.build/dd/Build/Products/Debug-iphonesimulator/Patina.app` — the signed test build, **not** a
`CODE_SIGNING_ALLOWED=NO` product. Every launch carried `-DeploymentTarget local`.
Every shot is `xcrun simctl io <udid> screenshot`; no desktop capture was used.

| Shot | What it shows |
|---|---|
| `w6-x1-01-launch-on-lane-clone.png` | The lane build launched with `-PatinaFlags house-widget` on the signed-in clone (owner `A0000000-0000-0000-0000-000000000005`). `PushPrimerView` on top — SP-08's sentence, dismissed with `Not now`. |
| `w6-x1-02-record-link-lands-on-studio.png` | `patina://record/order:fulfillment:f5000000-0000-4000-8000-000000000001` — the widget's row door — opens the order detail **on the Studio tab** (`Studio` bold in the bar). The row id is `HouseRecordRow.id` verbatim, taken from the record the app itself wrote. |
| `w6-x1-03-today-link-lands-on-today.png` | `patina://today` — M6d's "opens M1 plain" — selects **Today** and pops it to root: the Record card, NEEDS YOU over MOVED, the designer seat, `YOUR HOUSE`. |
| `w6-x1-04-routeless-row-opens-today-plain.png` | `patina://record/story:a8b3f8a0-…` — a MOVED row whose `route` is nil — opens **Today plain** from the Studio screen. A widget tap never dead-ends and never lands somewhere the widget did not name. |

### The `.appex` is embedded

```
$ ls .build/dd/Build/Products/Debug-iphonesimulator/Patina.app/PlugIns/
PatinaTests.xctest   PatinaWidget.appex

$ ls …/Patina.app/PlugIns/PatinaWidget.appex/
Info.plist  PatinaWidget  PatinaWidget.debug.dylib  PatinaDesignKit_PatinaDesignKit.bundle  __preview.dylib

$ /usr/libexec/PlistBuddy -c "Print :NSExtension" …/PatinaWidget.appex/Info.plist
Dict { NSExtensionPointIdentifier = com.apple.widgetkit-extension }
$ /usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" …/PatinaWidget.appex/Info.plist
cloud.patina.app.widget
```

`PatinaDesignKit_PatinaDesignKit.bundle` inside the appex is the SPM resource bundle carrying
Playfair, Inter and DM Mono — what `PatinaFonts.registerAll()` reads, and why the widget links the
design package instead of vendoring tokens.

### The App Group container is honoured on this clone

```
$ xcrun simctl get_app_container <udid> cloud.patina.app groups
group.cloud.patina.app  …/Containers/Shared/AppGroup/11192F24-DF96-4E56-81A9-1759F1B189F1
```

The lane's own launch wrote `house-record.json` there. Its MOVED rows are
`order:fulfillment:f5000000-…` ("Meadow Linen Sectional arrived.", Aug 28) and
`story:a8b3f8a0-…` ("A new story from the workshop.", Aug 27) — the two ids the shots above route
on. This matches `w2/r2-notes.md` §3 and remains **not** a device claim.

### ⚠ BLOCKED — the widget could not be added to the Home Screen

The Home Screen widget gallery needs a long press, and **long presses stopped delivering to
SpringBoard on this clone**. The first long press worked (the jiggle-mode tree with `Edit` / `Done`
was returned); every later attempt — `tap` with `duration` 1200/1500/2000/3000 on the wallpaper and
on the app icon, and `swipe` with a 1 pt delta over 2.5–3 s — returned "Tapped"/"Swiped" and left
the Home Screen unchanged. Page swipes stopped landing too (`Page 2 of 2`, unmoved). Plain taps
still worked throughout (the primer's `Not now` and the HOME button both landed), so this is a
long-press/drag failure, not a dead channel.

Per the wave's rule ("if gestures stop delivering, stop and report") no further gestures were
improvised. The AppleScript fallback (`shots/_tap.sh` → `_geom.sh`) was deliberately **not** used:
it addresses the Simulator by `window 1`, and four simulators are booted in this wave, so it could
have driven another lane's device.

**Not captured, therefore not claimed:** the widget drawn on the Home Screen with data, the
Lock Screen accessories, the gallery preview, and the flag-off placeholder as rendered pixels.
Those belong to the walker after integration. What IS proven here: the appex builds, embeds and
carries the right identity; the payload contract decodes through the widget's own decoder
(`HouseWidgetPayloadTests`); and both widget URLs route correctly in the running app on real data
(the three shots above).

**Claim level: compile-green for the widget's drawing, sim-verified for the deep links.** No device
claim of any kind; the shared App Group between an app process and a widget process is still owed a
device pass.

## w6 walk

Acceptance walker · review device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro), 2026-08-28
into 2026-08-29. Installed `.codex/worktrees/agent-dr-w6-integration/.build/dd/…/Patina.app`
(`xcrun simctl install`, unsandboxed) — the same signed product `w6/integration.md` gated, no
rebuild. `-DeploymentTarget local` on every launch. Already signed in as `client@patina.dev` from
the W5 walk; no fresh sign-in needed.

**Gesture delivery failed mid-walk.** The first long-press on the Patina Home Screen icon reached
jiggle mode (screenshot confirmed `Edit`/`Done`); the very next tap, meant to open the widget-add
menu, instead exited jiggle mode with no menu ever drawn, and no `device_action` call landed
afterward — not `tap` (five different targets, three screens), not `swipe`, not `button: HOME`
(after the first two). `simctl launch` from the host kept foregrounding/backgrounding the app
correctly throughout, proving the simulator stayed responsive — the failure is blitz's WDA input
delivery to this udid, not a frozen device. Same class of failure as `w6-x1`'s own note above
("long presses stopped delivering to SpringBoard"), broader here (plain taps too). Per the wave's
rule, no desktop-tooling substitute was used; retried ~9 times across ~15 minutes before stopping.

**Substitute for anything not requiring an on-screen tap:** `xcrun simctl openurl <udid>
"patina://…"` — the OS's own URL-scheme delivery, the same path a real widget/Lock-Screen tap
invokes (`.onOpenURL` → `route(forWidgetLink:in:)`), not a coordinate-clicking or screen-capture
workaround.

| Shot | State | What it shows |
|---|---|---|
| `w6-01-flagon-launch-dailyroom.png` | `-PatinaFlags house-widget` | Daily Room, W2 root (no tab bar) — NEEDS YOU ×3, MOVED ×2, Leah's seat, `YOUR HOUSE` rail |
| `w6-02-check-launch.png` | same, after a `simctl launch` re-foreground probe | Confirms the device/app is alive and responsive at the OS level while blitz gestures were failing |
| `w6-03-widgetlink-orderrow-flagon-house-widget-only.png` | `patina://record/order:fulfillment:f5000000-…-000000000001` (the top MOVED row's id) via `simctl openurl`, W2 root | Order-detail screen, `Meadow Linen Sectional`, rail at **Delivered**, back chevron, no tab bar — correct destination |
| `w6-04-flagon-housefirst-launch.png` | `-PatinaFlags house-widget,house-first` | Same Daily Room content, now under the W3 root: tab bar `Today · Spaces · Pieces · Studio` + Companion slot |
| `w6-05-widgetlink-orderrow-flagon-housefirst.png` | same widget-link URL, W3 root | Identical order-detail screen, **`Studio` tab bolded/selected** in the tab bar — the right tab per `RouteTabTable.tab(for: .orderDetail) == .studio` |
| `w6-06-flagoff-dailyroom.png` | `-PatinaFlags none` | Daily Room unchanged, W2 root |
| `w6-07-widgetlink-storyrow-noroute-fallback-heroframe.png` | `patina://record/story:a8b3f8a0-…` (the second MOVED row, which carries no `route` in `house-record.json`) via `simctl openurl` | Lands on Today (`.heroFrame`) rather than dead-ending — the documented fallback held |
| `w6-08-leavestate-flagoff-client-daily-room.png` | `-PatinaFlags none`, leave state | Daily Room, signed in as `client@patina.dev` |

**File evidence, not screenshots:** `widget-snapshot.json` in the App Group container
(`11192F24-DF96-4E56-81A9-1759F1B189F1/`) re-verified after each launch. Flag on:
`movedRows` = exactly the two MOVED rows with real dates, `houseLine: "Guest Bedroom"` (matching the
rail), `sinceDate` present, `flagOn: true`. Flag off: `flagOn: false`, same rows carried forward
(never blanked). `grep -ioE "needsYou|badge|count|pending|awaiting|isNew"` over the file →
**no match**, both states — Q8/C5 hold structurally on the artefact the widget reads.

**Item results** (full table in `waves/w6/walk.md`): item 2 (record saves) **PASS**; item 6 (tap a
row → right route, right tab, both roots) **PASS via the openurl substitute**; items 5 and 7
(no-count content, flag-off placeholder) **PASS at the data-contract level, not pixel-verified**;
items 3, 4, 8, 9 (widget added to Home/Lock Screen, dark/XXL gallery, the invoice reminder set/show/
remove) **BLOCKED** — gesture-delivery failure, not a product finding; none of these four could be
reached without a working tap/long-press channel back to the simulator, and none has a non-gesture
substitute (no debug deep-link launch-arg exists, and the invoice reminder's only entry is a
button tap on `InvoiceReminderRow`).

**Claim level:** sim-verified for items 2 and 6 (6 via the OS's own URL-scheme delivery, not a
screen tap); data-contract-verified-not-pixel-verified for items 5 and 7; unverified/BLOCKED for
items 3, 4, 8, 9 — tooling failure, named as such, not folded into a false PASS or a silent gap. No
device claim anywhere in this walk.

No secret value was read, printed, or written. No new `auth.users`/`profiles`/`comms_*` rows — this
walk never reached a screen with a send affordance.

Leave state: signed in as `client@patina.dev`, flags off, on the Daily Room (`w6-08`).

## w6-x3

Lane X3 (resumed), W6. Device **`dr-w6-x3r` `7AB6C26E-3D2A-4323-AA71-49FA34B0C52E`** — created for
this lane (iPhone 17 Pro / iOS 26.5, 402×874 pt), never the review device. Signed adhoc build from
`.codex/worktrees/agent-dr-w6-x3/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app` (the
`xcodebuild test` product, **not** `CODE_SIGNING_ALLOWED=NO`), installed with `simctl install`.
Launched `-DeploymentTarget local` with `-PatinaFlags house-first` (flag on) and `-PatinaFlags none`
(flag off). Signed in as `client@patina.dev` against the local stack. Every frame from
`xcrun simctl io <udid> screenshot`; **no `screencapture`, no desktop capture at any point.**

| Shot | What it shows | Quoted |
|---|---|---|
| `w6-x3-01-client-today.png` | Today, flag on, the Record + the seat + the tab bar | NEEDS YOU `Your invoice is due. $4,250.00 · DUE SEP 2` · `Leah Hartwell sent a proposal to review. BY SEP 11` · `Leah asked about Dining chairs - Shaker Oak vs Windsor Elm. BY SEP 2`; MOVED `Meadow Linen Sectional arrived. AUG 28`; seat `Leah Hartwell / Aspen Loft Refresh`; bar `Today · Spaces · Pieces · Studio · ≡` |
| `w6-x3-01-client-ask-leah.png` | The ask sheet after Send | `Ask Leah` / `MEADOW LINEN SECTIONAL` / `WOODWARD & SONS · $6,800.00` / `Can we use the Meadow Linen Sectional?` / **`Sent`** / `Leah has the piece and the price.` — no error sheet |
| `w6-x3-02-client-studio.png` | The Studio hub for `client@patina.dev` | `Client User` · `MEMBER SINCE AUG 28, 2026` · `1 ROOMS` `0 SAVED` · `The work around your home, in one place.` · `5 things need your eye` |
| `w6-x3-03-flagoff-root.png` | The flag-off root (`-PatinaFlags none`) — no tab bar, floating orb, `Studio 5` pill | the same Record draws; seat `Leah Hartwell / Aspen Loft Refresh`; `YOUR HOUSE` rail `Guest Bedroom · 180 sq ft · budget $9,000` |
| `w6-x3-04-client-threads.png` | Conversations after the ask | `Aspen Loft Refresh — You: Can we use the Meadow Linen Sectiona… 13m` above `Birch Hollow — You: Can we use the Heirloom Oak Dinin… 5:41 PM` — the new ask on the urgent project, W5's on `.first`'s |
| `w6-x3-05-blocked-open-alert.png` | Where the walk stopped | iOS's `Open in "Patina"?` for the `patina://auth/callback` hand-off; the one tap it needs could not be delivered (input delivery dead — see `waves/w6/x3-notes.md` §7) |

**psql, run against the local stack (`127.0.0.1:54322`):**

```
select t.id, t.project_id, p.name, t.created_by from comms_threads t
  left join projects p on p.id = t.project_id order by t.created_at desc limit 3;

 32fdec87-a6a6-42a0-a21e-55edf587246b | b0000000-…-d1 | Aspen Loft Refresh | a0000000-…-0005  ← this lane
 85016582-cf6e-4489-9734-c3613906a5fc |               |                    | f25f5e06-…       ← W5, James, direct
 3b5ab10b-4fa9-4c53-b9a9-ca4ab35dc87d | b0000000-…-d3 | Birch Hollow       | a0000000-…-0005  ← W5, the wrong project
```

**Foreground rebuild, on the file rather than on the code:** on the Studio → `Aspen Loft Refresh`
screen, `…/AppGroup/…/house-record.json` was last written `20:38:18`; backgrounding the app and
returning rewrote it at `20:44:58` (`stat -f %Sm`). `widget-snapshot.json` does not exist at this
lane's base — X1/X2's writer is on `daily-return/integration`, not on `main 4b35e0a94` — so the
widget half of Q8 is not observable here and was not claimed.

**Claim level: compile-green + partially sim-verified.** No device claim. The account-switch leg is
BLOCKED, not passed — see `waves/w6/x3-notes.md` §7 for what failed and what was tried.

## w6 walk 2

Walker (Sonnet), 2026-08-28/29, review device **`973D1724-90BF-4A0A-B02D-481D561547B3`**. X3's
items only (`integration.md` §9, X3 landed at `9a8af5d28`/`f48e11d20` after walk 1 ran). Full
detail: `waves/w6/walk.md` "## walk 2 — X3". All frames `xcrun simctl io <udid> screenshot`; no
desktop capture.

| Shot | What it shows |
|---|---|
| `w6-09-initial-state.png` | Welcome/Sign In after the fresh `ddapp` install reset the container (disclosed deviation from walk 1's left-behind session) |
| `w6-10-client-today-before-switch.png` | `client@patina.dev` re-signed-in; Today matches walk 1's/integration's recorded baseline (NEEDS YOU ×3, MOVED ×2, Leah's seat) |
| `w6-11-signed-out.png` | Settings → Sign Out → confirm → back at Sign In (SP-20 reachable) |
| `w6-12-james-signed-in.png` | `james.okafor@example.com` signed in; own Today underneath the Save-Password sheet: `Awaiting you 0`, matched-with-Leah, no active projects |
| `w6-13-james-studio.png` | James's Studio: 0 rooms, 0 saved, "Nothing needs your attention right now." — no forbidden strings |
| `w6-14-james-housefirst.png` | Relaunched `-PatinaFlags house-first` to reach the Pieces tab from James's account |
| `w6-15-james-ask-leah-sent.png` | James's Ask Leah sheet on Live-Edge Coffee Table → `Sent` / "Leah has the piece and the price." — no error |
| `w6-16-client-back-signed-in.png` | Signed back into `client@patina.dev`; own 5-items-awaiting data intact, undisturbed by James's session |
| `w6-17-client-ask-leah-sent.png` | Client's Ask Leah sheet on Oak Reading Chair → `Sent` — psql confirms it lands on `Aspen Loft Refresh`'s thread (`32fdec87-…`), the project carrying the open NEEDS YOU items, not `.first`-by-`updated_at` |
| `w6-18-studio-foreground-refresh.png` | Studio tab still selected after a background/foreground round trip; `widget-snapshot.json`'s `refreshedAt` advanced `03:36:04Z → 03:39:03Z` while off Today — confirms the root-level foreground fix |
| `w6-19-leavestate-flagoff-client-daily-room.png` | Leave state: `client@patina.dev`, flags off, W2 Daily Room root |

**psql, run against the local stack (`127.0.0.1:54322`):**

```
-- James's ask (existing direct thread, no project — correct for a lead-only relationship)
select thread_id, body, created_at from comms_messages
  where body ilike '%Live-Edge Coffee Table%' order by created_at desc limit 1;
 85016582-cf6e-4489-9734-c3613906a5fc | Can we use the Live-Edge Coffee Table?... | 2026-08-29 03:33:10

-- the client's ask (existing project thread — Aspen Loft Refresh, the urgent project)
select t.id, t.project_id, p.name from comms_threads t
  left join projects p on p.id = t.project_id
  where t.id = '32fdec87-a6a6-42a0-a21e-55edf587246b';
 32fdec87-a6a6-42a0-a21e-55edf587246b | b0000000-…-d1 | Aspen Loft Refresh
```

**Foreground refresh, off Today:** `widget-snapshot.json` mtime `22:36:04 → 22:39:03` (local) after
`simctl launch com.apple.mobilesafari` (background) → `simctl launch cloud.patina.app` (same pid
`2188`, a real foreground) while the Studio tab was on screen — X3's `RecordForeground` fix
(`integration.md` §9.2) confirmed on the artefact, not just by unit test.

**Claim level: sim-verified**, including two psql-confirmed server-side facts. No device claim.
Nothing here supersedes walk 1's verdicts on items 1–9 (still BLOCKED-HARNESS where recorded); this
pass covers X3's items only, and no gesture failure occurred in this pass.
