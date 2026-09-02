# Lane R — backend-down resilience walk (clone C / tfp-C, udid 670DE752-BA1B-40C1-899E-57B50D5743B5)

Run 2026-09-01, evening. READ-ONLY. Local Supabase stack; signed in as `client@patina.dev`.
Launch args on EVERY launch: `-DeploymentTarget local` (no flags → house-first OFF, direct-orders OFF, house-widget OFF).

Purpose: what a signed-in tester sees when the backend is unreachable. Kong (`supabase_kong_supabase`)
is paused/unpaused with `docker pause` / `docker unpause` — this kills *every* Supabase call
(REST, auth, edge functions, storage, realtime) at the gateway while the simulator's network stays up,
i.e. the app cannot tell "server down" from "server slow". That is the realistic TestFlight failure
(Strata hiccup, Cloudflare blip, captive-portal wifi) — NOT the same as airplane mode, where
`NWPathMonitor`/URLSession fail fast with "offline".

## Preconditions at start
- `docker ps`: all supabase_* containers Up; `supabase_kong_supabase` Up 12 hours (healthy).
- Device Booted, no Patina process running.

## Step 0 — HID preflight (backend UP)

Launched 17:21:37 with `-DeploymentTarget local`. App restored the signed-in session and landed on the
Daily Return home ("Good afternoon.", SINCE YOU WERE LAST HERE · FRI, AUG 28, invoice $4,250.00,
bell badge 3, Studio badge 5) — `shots/R/00-preflight-before.png`.
`describe_screen` returned the full 21-node tree. Tapped `DailyRoomView.HelpButton` @ (268,136) →
Help sheet opened (`shots/R/01-preflight-after.png`). **Synthetic input lands. Preflight PASS.**

Incidental (help-tour area, likely also seen by lane C — flagged low-confidence-of-novelty):
the per-screen Help sheet on Today reads **"No help articles yet / Help content for this screen is on
the way. Pull down to dismiss."** — an unfinished-feature admission shown to a tester, and the copy
says "Pull down to dismiss" while a real ✕ button sits in the sheet's top-right.

## Step 1 — Kong PAUSED (17:22:33), signed-in walk

`docker pause supabase_kong_supabase` → `Up 12 hours (Paused)`. Note the failure *shape*: a paused
container still holds the listening socket via docker-proxy, so the TCP connect succeeds and the
request then **hangs until URLSession times out** (default 60 s). This is the realistic
"server wedged / captive wifi" case and is strictly harder than airplane mode.

### 1a. Pull-to-refresh on Today — **there is none**
Swiped (201,260)→(201,720) over the house record. Screens at +0 s and +2 s
(`03a-ptr.png`, `03b-ptr.png`) are **pixel-identical** to the pre-swipe frame: no refresh control,
no spinner, no bounce indicator, no toast.
Code confirms it: `Patina/Features/Home/Views/DailyRoomView.swift:249` is a bare
`ScrollView(showsIndicators: false)` with **no `.refreshable`**; the only refresh triggers are the
six `.task` blocks (lines 101–133) and `.onChange(of: scenePhase)` (line 168). Twelve other screens
DO have `.refreshable` (InvoiceListView, ProjectListView, ThreadListView, NotificationFeedView,
ProposalListView, BudgetView, …), so the app's own idiom is present everywhere except its home.

### 1b. Help sheet is an ERROR dressed as an empty state — and it is not a backend problem
The log line for the Help sheet I opened during preflight (backend still UP, 17:21:58):
`[SanityHelpClient] Article-list non-2xx status=400 url=https://kv3qrinl.api.sanity.io/v2024-01-01/data/query/production?query=…&$sk=%22ios-app/home%22`
A hard **HTTP 400** from Sanity is rendered to the tester as **"No help articles yet / Help content
for this screen is on the way."** — a confident, cheerful lie. Sanity is a third-party host, unaffected
by the Kong pause, so this is reproducible on production too.

### 1c. Launch-time error logs on a healthy backend
`[SettingsService] user_settings fetch failed (may not exist yet): Cannot coerce the result to a single JSON object`
and `[SettingsService] notification_preferences fetch failed: Cannot coerce the result to a single JSON object`
— logged at `E` level on every launch for a signed-in account. PostHog's crash/error tracking is wired
in this build, so these become noise in the TestFlight error stream.

### 1d. Today screen with the backend down — GOOD: it does not degrade at all
`04-today-scrolled.png` / `05-today-bottom.png` (Kong paused): the whole home renders from local
SwiftData/cache — greeting, the six-row house record, designer seat, house rail, editorial story.
Nothing greys out, nothing spins, no tier collapse. **U45 (tier falling to `discovering`, Studio
button vanishing) did NOT reproduce**: the `Studio 5` pill and the `3` bell badge stayed put for the
whole ~11 minutes Kong was down. That is the right answer and it is worth protecting.

The honest flip side: **the app never says anything is wrong.** Every number on this screen
(invoice $4,250.00 due Sep 6, "3 unread", "Studio 5", "5 THINGS NEED YOUR EYE") is presented as
live fact while the server has been unreachable for minutes. No "last updated", no offline chip,
no way to retry (§1a).

### 1e. Room detail with the backend down — GOOD, and two copy defects
Tapped the house-rail card → `Audit Room B` opened **instantly**, fully populated, no spinner,
and was still identical at +3 s and +10 s (`06a/06b/06c-room-t*.png`). Local-first: correct.

Two things a tester sees on that screen regardless of backend:
* Primary CTA reads **"Browse pieces for the Audit Room B"** — string interpolation that pastes a
  definite article in front of a proper room name. Reads as a bug.
* Subtitle reads `14 × 18 FT · 252 SQ FT · TYPED, NOT SCANNED`. "TYPED, NOT SCANNED" is internal
  provenance vocabulary aimed at the build team, not at a homeowner.

### 1f. Accessibility traits on Today are wrong for three tappable things
From `describe_screen` (backend state irrelevant):
* house-rail room card — `type: GenericElement`, help "Opens this room.", **no button trait**;
  `scan_ui` does not list it as interactive at all.
* `companion.bubble` — `type: GenericElement`, help "Opens the Companion.", **no button trait**.
* the "A new story from the workshop." record row — `GenericElement` while its five sibling rows in
  the same list are `Button`s.
VoiceOver will read all three as plain content, so a VoiceOver user gets no "button" affordance and
no double-tap hint on the primary way into a room.

### 1g. Browse ("pieces for this room") — the screen does not fill the screen (NOT a backend artifact)
`07a/07b/07c`, `08a/08b/08c`. With Kong paused I tapped the room's primary CTA. The Browse screen
renders as a **cream band floating in the middle of a white screen**: pure white from the status bar
down to y≈218 pt and from y≈590 pt to the home indicator. `describe_screen` agrees — every element
sits between y=296 and y=613 in an 874 pt window.

Root cause is in the source, not in the network:
`Patina/Features/Recommendations/Views/RecommendationsView.swift:59` —
`var body: VStack(alignment:.leading, spacing:0) { header; chips; content }` then `:145`
`.background(PatinaColors.Background.primary)` and `.patinaScreen(title: nil)`. There is **no**
`.frame(maxWidth:.infinity, maxHeight:.infinity, alignment:.top)`. So whenever `content`
(lines 248–280) is one of the three *intrinsically sized* states — `PatinaLoadingState`,
`PatinaErrorState`, `PatinaEmptyState` — the VStack collapses to its content height, the cream
background paints only that band, and the window's white shows through above and below.
**This therefore also fires with a healthy backend on the empty state**
(`PatinaEmptyState(icon:"sparkles", title:"Nothing here yet", …)`) — the exact state a brand-new
TestFlight account with no taste profile is most likely to hit. Only the populated grid
(`ScrollView` + `LazyVGrid`, line 267) fills the screen.

### 1h. 20–25 s of spinner before the failure is admitted, and no way to stop it
Timed sample after tapping **"Let's try that again"**, one frame every 5 s for 70 s
(`08a-retry-t20-spinner.png` = still spinning at t=20 s; `08b-retry-t25-error.png` = error at t=25 s;
identical thereafter to t=70 s). So the failure surfaces at **~20–25 s**.
`Patina/Services/API/APIConfiguration.swift:147` sets `requestTimeout = 30.0` for every API client.
During those 25 s the only affordance is Back; there is no cancel, and the chips
(All/Seating/Tables/Lighting/Storage) stay tappable and each one starts the same 25-s wait again.

GOOD: the error state itself is well-made — `exclamationmark.triangle`, sentence-case
**"Couldn't load recommendations"**, and a warm retry link **"Let's try that again"**. No raw
`NSError`, no status code, no stack. `RecommendationsViewModel.swift:142` sets exactly that string and
keeps `error.localizedDescription` inside `#if DEBUG`. That is the standard the rest of the app
should be held to.
The gap: the copy is the same whether the phone is offline, the server is down, or the RPC failed —
a tester on hotel wifi is told nothing they can act on.

### 1i. Studio with the backend down — the worst state in the walk
Opened `DailyRoomView.StudioButton` ("Your Studio", AXValue "5 waiting") with Kong still paused.

**Timing (measured, one frame per 10 s after tapping the error card's "Try again"):**
spinner/empty from t=2 s through t=50 s, error card at t=60 s — repeatable.
So the Studio admits failure at **50–60 s**, i.e. it is NOT using
`APIConfiguration.requestTimeout = 30.0`; it is riding URLSession's 60 s default. The Browse screen
fails at 20–25 s on the same dead backend. Two screens, same outage, 2.5× different patience,
different icon, different words.

**And for those 50 seconds the Studio states, as fact, that the client has nothing.**
`12a-studio-retry-t50-spinner.png` + `13a-studio-false-empty.png` (both taken while Kong was paused):
* `Awaiting you  0` — "Nothing needs a decision."
* `In progress  0` — "No active projects yet."
* `Conversation` — "No messages yet"
* `Money & documents  0` — "No shared records yet."
* `Archive  0` — "Nothing has been archived."
…**underneath a header that says "5 things need your eye"**, and one screen away from a home that
says an invoice of **$4,250.00** is due Sep 6, that **Leah Hartwell sent a proposal to review**, that
**Leah sent you a message** on Sep 1, and that there are **3 unread** notifications.
A first-round tester reading this concludes their designer's work has been deleted. This is the
same failure family as U45 (tier collapse) but expressed as *data* collapse rather than *tier*
collapse: on this build the tier held and the content zeroed instead.

**When it finally errors, the copy is good** (`11d-studio-t130.png`): wifi-slash glyph,
"We couldn't gather your Studio. Check your connection and try again." + "Try again". It is the only
place in the walk that names the connection.

### 1j. Two contradictions and two overlaps visible in `13a-studio-false-empty.png`
* **Scan provenance contradicts itself.** The Studio room card reads `Audit Room B / SCANNED SEP 1`;
  the room's own detail screen reads `14 × 18 FT · 252 SQ FT · TYPED, NOT SCANNED`. Same room, same
  session, opposite claims.
* **The floating back chevron has no scrim.** Scrolled content passes directly under it — the
  chevron's white circle sits on top of the "Conversation" card's speech-bubble icon.
* **The companion bubble occludes list rows.** It covers part of "Get design help" and its caption
  "5 THINGS NEED YOUR EYE" is drawn straight across the word "Settings". On Today the same bubble
  covers the designer's name in the designer seat ("Leah Hart⬤ / Aspen Loft Re⬤" in
  `00-preflight-before.png`).
* The caption "5 things need your eye" is printed twice on the same screen — once as the Studio
  subtitle and once as the companion bubble's caption.

### 1k. Proposal with the backend down — over a minute of a blank page
Tapped the Today record row "Leah Hartwell sent a proposal to review."
* `14a-proposal-t2.png` … `14c-proposal-t65.png`: an **entirely blank cream page** — back chevron,
  a spinner, the words **"One moment…"**, nothing else. No title, no "Aspen Loft — Living Room
  Refresh", no skeleton, no cancel. Identical at t=2, 10 and 65 s.
* `14d-proposal-t185.png`: at t=185 s it finally shows `exclamationmark.triangle` +
  **"Couldn't load this proposal"** + **"Let's try that again"**.
* Re-timed via that retry (`15a-proposal-retry-t30.png` spinner, `15b-proposal-retry-t60.png` error):
  the retry path fails at **30–60 s**; the first open took **65–185 s** (consistent with two chained
  60-s waits).

Entering from a push notification or a `client.patina.cloud/proposals/*` universal link, this is the
first thing a tester ever sees of Patina — a blank page for a minute or more.

### 1l. The four screens disagree about everything: how long to wait, what to say, what to draw
| screen | time to admit failure | glyph | words | retry |
|---|---|---|---|---|
| Today | never — shows stale data as live | — | — | none (no `.refreshable`) |
| Browse / recommendations | 20–25 s | `exclamationmark.triangle` | "Couldn't load recommendations" | "Let's try that again" |
| Studio | 50–60 s (and ~50 s of **false zeros** first) | wifi-slash | "We couldn't gather your Studio. Check your connection and try again." | "Try again" |
| Proposal | 30–60 s on retry, 65–185 s on first open | `exclamationmark.triangle` | "Couldn't load this proposal" | "Let's try that again" |

Four loading labels, too: "Finding pieces for you…", "Gathering your Studio…", "One moment…",
and (Today) nothing at all. `APIConfiguration.requestTimeout = 30.0` is evidently not on the path
used by Studio or Proposal.

### 1m. The companion bubble is styled and placed differently per screen
Today / Studio / Room: **dark** (near-black), horizontally centred, ~y 724–788, with the caption
"5 THINGS NEED YOUR EYE" under it.
Proposal (`14a`, `14d`): **mid-grey**, bottom-**right**, no caption.
Same control, two identities.

## Step 2 — cold relaunch while Kong is STILL paused (17:46:24)

`terminate` → `launch … -DeploymentTarget local`. Frames at ~0.5 s intervals (`16-cold-*.png`),
then `17a-cold-t12.png`, `17b-cold-t22.png`, `18-cold-today-bottom.png`.

**Which root:** the signed-in Today home. The session survives an unreachable backend — the app does
**not** bounce the tester to Welcome/sign-in. That is the single most important resilience answer in
this walk and it is correct.

**How fast:** first frame at ~0.5 s is the launch screen; Today is fully drawn by ~1.5–3 s and stable
from 3 s on. Cold launch is fast even with every request hanging.

### 2a. The splash wordmark is all but invisible
`16-cold-0.5.png`: the launch screen is flat cream with the word **PATINA** rendered at roughly the
same luminance as the background — legible only if you know it is there (I estimate under 1.1:1
contrast). For a TestFlight tester this reads as a blank white screen, not as a brand moment.

### 2b. Cold launch with the backend down SILENTLY DROPS content that was there a minute earlier
Same account, same device, one relaunch apart. Compare `00-preflight-before.png` (backend up) with
`17b-cold-t22.png` / `18-cold-today-bottom.png` (backend down):

| on the warm screen | after the cold relaunch |
|---|---|
| bell badge **3**, AXValue "3 unread" | **no badge**, AXValue **"No unread notifications"** |
| Studio pill **"Studio 5"**, AXValue "5 waiting" | pill reads just **"Studio"**, AXValue **""** |
| record row "Meadow Linen Sectional shipped. AUG 28" | **row absent** (6 rows → 5) |
| designer seat card "LH · Leah Hartwell · Aspen Loft Refresh · Message" | **card absent entirely** |
| companion caption "5 THINGS NEED YOUR EYE" | **"NEXT STEPS"** |
| editorial story card "The Grain Whisperer of Maine" | inline line **"Today's story couldn't load"** + "Let's try that again" |

Only the last of those admits anything is wrong. The rest are **asserted absences**: the app tells a
VoiceOver user in as many words that there are "No unread notifications" when it has simply not been
able to ask. A tester who opens the app on bad hotel wifi is told their designer is gone, their
messages are read and their shipment notice never happened. Then it all reappears when the network
returns — which is worse, because now the app has visibly lied.

### 2c. `18-cold-today-bottom.png` — the greeting collides with the system clock
The 32 pt serif "afternoon." is drawn straight through **9:41** in the status bar. Today's ScrollView
has no scroll-edge effect, no material, no top inset — content passes under the status bar unprotected.
Reproduced on every scrolled frame of Today (`04`, `05`, `18`).

### 2d. The one Today error line is laid out as two loose links
"Today's story couldn't load" (left-aligned) and "Let's try that again" (right-aligned) sit on one
full-bleed row with no card, no icon, no rule — they read as two unrelated pieces of text rather than
one message and its action.

## Step 3 — `docker unpause supabase_kong_supabase` (17:49:27), app left running

### 3a. It half-recovers on its own, into a state that is WRONG and self-contradictory
No touch at all for 45 s (`19a-unpause-t15-notouch.png`, `19b-unpause-t45-notouch.png` — identical).
Some things came back; the ones that did came back **wrong**. Verbatim from `describe_screen`:

* `DailyRoomView.StudioButton` AXValue → **"5 waiting"** (recovered) and the pill shows `Studio 5`.
* `DailyRoomView.BellButton` AXValue → still **"No unread notifications"**, still no badge (did NOT recover).
* `DailyRoomView.HouseRecord` → heading **"SINCE YOU WERE LAST HERE · FRI, AUG 28"**, then
  **"NEEDS YOU / Nothing needs you right now."** and **"MOVED / Nothing moved since Friday."**
  — where a minute earlier the same card listed six items including a **$4,250.00 invoice due Sep 6**.
* Immediately below it, `DailyRoomView.TodayNextMove` says
  **"Review a project decision. 3 decisions are waiting on you."**
  So the screen simultaneously says *nothing needs you* and *3 decisions are waiting on you*.
* `DailyRoomView.DesignerSeat` came back as **"Leah Hartwell, Birch Hollow"** — a *different project*
  from the "Leah Hartwell, Aspen Loft Refresh" it showed before the outage and after recovery.
* `DailyRoomView.EditorialStory` still shows the failure line, and it now **overlaps the companion
  caption**: the error text sits at y=791.3 and the companion's caption band is {0,720,402,120}, so
  "Today's story couldn't load", "5 THINGS NEED YOUR EYE" and "Let's try that again" are drawn on top
  of one another on the same baseline (`19b-unpause-t45-notouch.png` — three text runs interleaved
  into unreadable mush).

(Caveat I am recording honestly: I had opened the Studio during the outage, and `DailyRoomView`
stamps the visit inside the record rebuild, so the empty record may be `last_seen_at` advancing.
Even so, the heading still claims to be showing everything "SINCE … FRI, AUG 28", and the
next-move card on the same screen contradicts it — the observable defect stands either way.)

### 3b. Pull-to-refresh cannot fix it (there is none)
Swiped down on the recovered-but-wrong screen; `20-after-ptr-recovered.png` is **byte-identical** to
`19b`. The tester's only instinct is a no-op (§1a).

### 3c. Only a background → foreground cycle repairs it
HOME, 3 s, re-activate. `21-after-foreground.png`: everything correct again — bell badge **3**,
`Studio 5`, the full six-row record including "Meadow Linen Sectional shipped · AUG 28", the designer
seat back to "Leah Hartwell / Aspen Loft Re…", the editorial story card back, the error line gone.
That path works because `DailyRoomView.swift:168` `.onChange(of: scenePhase)` re-runs the whole load.
**So the app has a complete refresh routine and no user-reachable way to trigger it.**

## Step 4 — status-bar override (visual only)

⚠ Script deviation: `--dataNetwork none` is **rejected** by this Xcode
(`Invalid dataNetwork: none`; the accepted set is hide/wifi/3g/4g/lte/lte-a/lte+/5g/5g+/5g-uwb/5g-uc).
Used `--dataNetwork hide --wifiMode failed --cellularMode notSupported` instead.
**The simulator still had full network** — this changes only the drawn glyphs, so it proves nothing
about app behaviour and I claim nothing from it.

`22-statusbar-offline-look.png`: the status bar draws a greyed-out wifi glyph and no cellular bars;
both stay legible against the cream ground. The app itself renders **no** difference — no offline
banner, no muted state. Overridden then cleared and the brief's standard override re-applied
(`23-statusbar-restored.png`; `status_bar list` confirms time 9:41, wifi 3, cell 4, battery 100 charged).

### 4a. `UIStatusBarHidden = true` is in the shipped Info.plist and has no effect
```
$ plutil -p .../Patina.app/Info.plist
  "UIStatusBarHidden" => true
```
`UIViewControllerBasedStatusBarAppearance` is **absent**, so it defaults to YES and the
`UIStatusBarHidden` key is ignored — the status bar renders on every screen (all 24 shots).
That is very likely why Today's ScrollView has no top inset and no scroll-edge treatment: the layout
was built for a screen with no status bar, and it gets one. Result is §2c — the greeting drawn
through the clock. Either honour the key or design for the bar; today the app does neither.

## Step 5 — teardown
`docker ps`: `supabase_kong_supabase  Up 13 hours (healthy)`. No container left paused
(`docker ps | grep -i paused` → none). App terminated; simulator left Booted.

## What is GOOD (calibration)
1. **The session survives an unreachable backend.** A cold launch with every Supabase call hanging
   lands on the signed-in home in ~1.5–3 s and never bounces the tester to Welcome. This is the thing
   that most often goes wrong in a token-refresh app and it is right here.
2. **U45 did not reproduce.** The tier held; the Studio button never vanished.
3. **Room detail is genuinely local-first** — instant, complete, unchanged after 10 s of dead network.
4. **No raw error strings anywhere in the walk.** Four failure surfaces, four human sentences,
   zero `NSError`/status codes. `RecommendationsViewModel.swift:142` keeps
   `error.localizedDescription` behind `#if DEBUG`. That discipline is already in place.
5. **Every failure surface offers a retry**, and the retries work.
6. **The Studio's error names the cause**: "Check your connection and try again" — the right model
   for the other three.
7. **No crash** in ~40 minutes of walking against a dead backend, including a cold launch into it.

## Could NOT verify
- Real airplane mode / `NWPathMonitor` behaviour: the brief's step is explicitly visual-only and the
  simulator kept its network. Whether the app has any true reachability awareness is **unverified**.
- Production behaviour: this lane is entirely local (`-DeploymentTarget local`). Strata may have
  different latencies and timeouts.
- Whether §3a's empty record is caused by `last_seen_at` advancing (I visited the Studio mid-outage)
  or by the failed refresh; the on-screen contradiction is verified, the mechanism is not.
- Haptics (not observable), Dynamic Type, VoiceOver rotor behaviour, dark mode — out of this lane.
- The `AXValue`-vs-badge behaviour on a *first-ever* launch (this device is a returning user).

---

# LANE R — FINDING LEDGER

All sim-verified on tfp-C (iPhone 17 Pro, iOS 26.5), Debug build `d7287c3f+`, local backend,
flags OFF. Nothing here is device-verified.

| id | sev | conf | title | where |
|---|---|---|---|---|
| R-01 | blocker | 0.95 | Studio asserts the client has nothing (0 decisions / 0 records / no messages) for ~50 s during an outage, under its own "5 things need your eye" | `12a-studio-retry-t50-spinner.png`, `13a-studio-false-empty.png` |
| R-02 | major | 0.95 | Cold launch with the backend down silently deletes the badge counts, the designer seat and a record row; the bell tells VoiceOver "No unread notifications" | `16-cold-3.png`, `17b-cold-t22.png`, `18-cold-today-bottom.png`, scan_ui AXValue |
| R-03 | major | 0.98 | Today has no pull-to-refresh and no staleness signal — the only recovery is backgrounding the app | `DailyRoomView.swift:249`; `03a/03b-ptr.png`, `20-after-ptr-recovered.png` |
| R-04 | major | 0.8 | After the backend returns, Today settles into a self-contradictory state and stays there | `19b-unpause-t45-notouch.png` + describe_screen |
| R-05 | major | 0.9 | Proposal shows a blank page with "One moment…" for 65–185 s before admitting failure | `14a…14d`, `15a/15b` |
| R-06 | major | 0.9 | Browse/Recommendations does not fill the screen in its loading, error AND empty states | `RecommendationsView.swift:59,145` ; `07a…07c`, `08a/08b` |
| R-07 | major | 0.9 | Overlapping text at the foot of Today: the story-error line is drawn through the companion caption | `19b-unpause-t45-notouch.png`; frames y=791 vs {0,720,402,120} |
| R-08 | major | 0.85 | Content scrolls under the status bar unprotected; `UIStatusBarHidden=true` in Info.plist is inert | `04`, `05`, `18`; `plutil -p Info.plist` |
| R-09 | major | 0.9 | Four failure surfaces disagree on timing (20 s / 55 s / 185 s / never), glyph, and wording | table in §1l |
| R-10 | major | 0.85 | The Help sheet renders an HTTP 400 as "No help articles yet … on the way", and says "Pull down to dismiss" beside an ✕ | `01-preflight-after.png`; SanityHelpClient log line |
| R-11 | major | 0.9 | The companion bubble occludes content on Today and in Studio | `00`, `02`, `22`, `13a` |
| R-12 | minor | 0.85 | The companion bubble has two identities (dark+centred+captioned vs grey+bottom-right+bare) | `14a` vs `00` |
| R-13 | minor | 0.8 | Same room, opposite provenance: "SCANNED SEP 1" in Studio vs "TYPED, NOT SCANNED" in room detail | `13a` vs `06a` |
| R-14 | minor | 0.95 | "Browse pieces for the Audit Room B" — article pasted in front of a proper name | `06a-room-t0.png` |
| R-15 | minor | 0.8 | "TYPED, NOT SCANNED" is internal vocabulary on a homeowner screen | `06a-room-t0.png` |
| R-16 | minor | 0.9 | Three tappable things on Today carry no button trait (room card, companion bubble, story row) | describe_screen |
| R-17 | minor | 0.85 | The launch-screen "PATINA" wordmark is all but invisible | `16-cold-0.5.png` |
| R-18 | minor | 0.85 | 3 of the 4 error messages cannot tell the tester whether it is them or us | §1l |
| R-19 | minor | 0.8 | Two `E`-level SettingsService errors on every launch of a healthy backend | app log 17:21:38.901/.907 |
| R-20 | polish | 0.8 | Today's error line is two loose links, not a message with an action | `17b`, `18` |
| R-21 | polish | 0.9 | "5 things need your eye" printed twice on the Studio screen | `11a-studio-t2.png` |
| R-22 | minor | 0.85 | No cancel during the long waits, and the filter chips each restart one | `07`/`08` series |
