# GAP7 — widget gallery/placement + deep-link landing (clone C, udid 670DE752-BA1B-40C1-899E-57B50D5743B5)

Lane: GAP7 (gap-fill). READ-ONLY: no code edits, no git writes, no production writes.
Backend: local Supabase CLI stack. Signed in as client@patina.dev (session established by S0).
Build: steward's signed Debug build, GitCommit `d7287c3f+`.

Targets: C2-12 (widget gallery preview claimed to show only the empty state — never rendered),
C2-21 (deep link tapped while signed out is queued invisibly), and the AASA universal-link paths
(/piece, /invoices, /proposals, /decisions) whose landing behaviour was code-only for a signed-in user
(lane P could only test them signed out on prod — P-33).

## Log

### 19:10–19:20 — ENVIRONMENT: lane GAP2 was driving the same clone (contamination window)

`ps` showed a live shell running `U=670DE752-… ; xcrun simctl terminate/launch cloud.patina.app
-DeploymentTarget local ; idb ui tap …` writing into `shots/GAP2/`. Patina was relaunched on this
udid at 19:09:10, 19:10:02, 19:10:49, 19:11:27 and repeatedly to 19:19:33 **without** GAP7's launch
arguments, and the app was navigated under GAP7's own PID (Proposals list at 19:15, a message thread
at 19:17). Reported to the coordinator; GAP2 moved to clone B.

**Not findings — environment artefacts of the overlap:**
- `widget-snapshot.json` carrying `flagOn: false` at 19:11:30 (an argument-less GAP2 launch rewrote it).
  With GAP7's own `-PatinaFlags house-widget` launch the same file is written with `flagOn: true`
  (19:14:57 and 19:16:48) — the flag→mirror→snapshot chain works.
- shot `03-unexpected-proposals.png` and `05-jiggle-mode.png` (a message thread, not jiggle mode):
  both are GAP2 navigation landing on GAP7's screen. Re-run after the window closed.

### Setup facts confirmed (GAP7's own launches)
- Launch `xcrun simctl launch 670DE752-… cloud.patina.app -DeploymentTarget local -PatinaFlags house-widget`
  at 19:16:48 → App Group container
  `…/Devices/670DE752-…/data/Containers/Shared/AppGroup/11192F24-DF96-4E56-81A9-1759F1B189F1/`
  holds `house-record.json` (2.1 KB) and `widget-snapshot.json` (666 B), both rewritten on every launch.
- `widget-snapshot.json` = `{"sinceDate":"2026-08-25T05:00:00Z","houseLine":"Audit Room B","movedRows":[3 rows],"flagOn":true,"refreshedAt":"2026-09-02T00:16:48Z"}`.
  MOVED rows only, no `needsYou` — matches the ruled shape.
- Row ids available for `patina://record/<id>`:
  `thread:de3debc3-f607-4220-809a-54cd5efe5146` (route thread),
  `story:a8b3f8a0-1111-4111-8111-1d1a1a1a1a01` (**no route key at all**),
  `order:fulfillment:f5000000-0000-4000-8000-000000000001` (route order).
- Universal-link ids from `house-record.json` (real, signed-in-visible, local stack):
  invoice `b0000000-0000-0000-0000-00000000e142`, proposal `b0000000-0000-0000-0000-000000000002`,
  decision `b0000000-0000-0000-0000-0000000d2c02`.
- HID preflight PASS at 19:10:45 — tapped `DailyRoomView.BellButton` (228,136), screen changed
  Today → Notifications (`02-preflight-notifications.png`).

### Environment condition (NOT an app finding) — lane collision with GAP2
From 19:09 onward, lane **GAP2 was driving the same clone** (`670DE752-…`). `ps` showed a live shell
running `U=670DE752-… ; xcrun simctl terminate/launch cloud.patina.app -DeploymentTarget local ; idb ui tap …`
writing into `shots/GAP2/`. Patina relaunched on that udid at 19:09:10, 19:10:02, 19:10:49, 19:11:27
and repeatedly after, without GAP7's launch arguments; the app was navigated (Proposals list, a message
thread, a decision, a budget popup, the Sign-In sheet, a large Dynamic Type size) between GAP7 steps;
GAP2's keyboard input landed in GAP7's widget-gallery search field ("Patinaclient@patina.dev").
Consequences and how they were handled:
* every deep-link probe was re-run inside an **atomic script** that re-established and re-verified its own
  precondition (signed-in Today / Welcome) before firing the link (`research/gap7-probe.sh`,
  `research/gap7-signedout.sh`);
* three intermediate observations were **discarded as collision artefacts after re-testing**:
  (a) "`patina://today` lands on a DECISION" — re-ran twice, both landed on Today at +1.2 s;
  (b) "the app restores its navigation stack across a cold launch" — a clean terminate→launch lands on
      Today (§C below);
  (c) "Back from a deep-linked decision lands on a different decision" — clean re-test lands on Today.
  None of these are reported as findings.
* the Home-Screen widget **placement** could not be completed (4 attempts) — see coverage.
Reported to the orchestrator via SendMessage at 19:22.

### Method notes
* Backend: an argument-less cold launch on this clone resolves to **Strata production**, where the
  local session does not restore → Welcome screen. Persisting `DeploymentTarget=local` into the app
  container's `Library/Preferences/cloud.patina.app.plist` did **not** take (cfprefsd cache; Kong logged
  0 requests). So: *signed-in* deep-link probes were fired at a running app launched with
  `-DeploymentTarget local -PatinaFlags house-widget`; *signed-out* probes used the argument-less launch.
  The key was removed at the end of the lane.
* Real local ids used: invoice `b0000000-0000-0000-0000-00000000e142` (INV-2026-0142), proposal
  `b0000000-0000-0000-0000-000000000002`, decision `b0000000-0000-0000-0000-0000000d2c02`, piece
  `ae440000-0000-4000-8000-00000000d001` (Oak Reading Chair), widget rows from the App-Group
  `house-record.json`.
* `-PatinaFlags house-widget` DOES reach the widget: after a flagged launch `widget-snapshot.json`
  carried `flagOn: true`; after an argument-less launch it carried `flagOn: false`. Both observed.

---

## A — C2-12 CONFIRMED, now rendered (GAP7-01)

`shots/GAP7/41-gallery-preview.png`. Home Screen → long-press → Edit → Add Widget → "Patina".
The gallery card renders a cream tile: a small rule glyph + `PATINA` eyebrow in letterspaced mono, then
**"Open Patina to see your house."** — under the gallery description **"What moved on your house."**
There is no sample row, no date, no house line. The tile is otherwise handsome and on-brand (warm cream
ground, brown text, the wordmark rule) — the craft is there, the content is not.
Code: `PatinaWidget/HouseWidgetProvider.swift:44` `let snapshot = context.isPreview ? nil : store.load()`
and `placeholder(in:)` returning `nil`; `HouseWidgetCopy.noData` = "Open Patina to see your house."
(`PatinaWidgetShared/HouseWidgetPayload.swift:231`).
Note the compounding fact for a first-round tester: in a Release build `-PatinaFlags` is ignored and
PostHog's cache is empty on first launch, so `flagOn` is written **false**, and the *placed* widget
draws the same sentence until Kody targets that tester and they relaunch (this half is A4-08's claim;
GAP7 verified the flagOn write both ways but could not render the placed widget).

## B — C2-02 CONFIRMED empirically, with a rate (GAP7-02)

Eight runs of: terminate → `simctl launch … -DeploymentTarget local -PatinaFlags house-widget` →
250 ms → `simctl openurl https://client.patina.cloud/proposals/b0000000-…-0002` → look at 6-7 s.
Outcome: **4 landed on the proposal, 2 stayed on Today (link silently dropped), 2 came up signed-out.**
Same command, same timing, three different outcomes. The drop is the `else` arm in
`DeepLinkHandler.handle(_:)` (`Patina/App/DeepLinking/DeepLinkHandler.swift:62-69`):
```
if let coordinator, coordinator.phase == .launching { coordinator.pendingDeepLink = url }
else { coordinator?.openExternal(route) }   // coordinator nil → no-op, and `return true`
```
The custom-scheme and APNs paths both stash into `pendingRoute` and replay it in
`configure(coordinator:)`; the **universal-link** path has no such stash, so a link that arrives before
SwiftUI has configured the handler is dropped and reported handled.
Why it matters: this is the exact path of the tester's first contact — an emailed invoice/proposal link
tapped when the app is not running.

## C — C2-21 CONFIRMED for the auth wall (GAP7-03) + the cold shape (GAP7-04)

* **Running at the auth wall**: app launched (production ⇒ signed out), Welcome on screen, screenshot
  taken, then `openurl …/invoices/b0000000-…e142`, screenshot 2 s later. `cmp` reports the two PNGs
  **PIXEL-IDENTICAL** (`28a-authwall-before-link.png`, `28b-authwall-after-link.png`). No toast, no
  "sign in to see your invoice", no queued destination, nothing.
* **Cold, signed out**: with the app terminated, the same link **does** launch the app (so the
  simulator honours the association) and lands on the Welcome screen with no acknowledgement
  (`29-cold-invoice-2s.png`, `30-cold-invoice-6s.png`). `pendingDeepLink` is process memory, so the
  destination dies at the next launch.
* A clean terminate → launch lands on **Today** (no navigation restoration), and Back from a
  deep-linked invoice lands on **Today** (`54-back-lands-today.png`) — neither is a defect.

## D — What actually works (reconciles P-33)

With the app **running and signed in**, every AASA family routes correctly, first try, in ~1 s:
* `/invoices/<id>` → Invoice detail "Awaiting payment · INV-2026-0142 · TOTAL $4,250.00 / PAID $0.00 /
  BALANCE $4,250.00" (`13-ul-invoice-warm.png`)
* `/proposals/<id>` → Proposal "Aspen Loft — Living Room Refresh · INVESTMENT $18,500.00"
  (`18-ul-proposal-warm.png`)
* `/decisions/<id>` → Decision "Dining chairs - Shaker Oak vs Windsor Elm" with both options
  (`17-ul-decision-warm.png`)
* `/piece/<id>` → Product "Oak Reading Chair · $1,550 · 82% match" (`19-ul-piece-warm.png`)
* `patina://today` → Today, path cleared, verified twice at +1.2 s (`21-widget-today-link-run{1,2}.png`)
* `patina://record/order:fulfillment:f5000000-…-0001` → Order "ORDERED · Meadow Linen Sectional"
  (`26-record-order.png`) — a two-colon row id survives the round trip
* `patina://record/<id no longer in the record>` and `…/does-not-exist` → Today, no dead end
So **P-33's "opens the app and then does nothing at all" is the signed-out/cold shape, not a broken
router.** The fix is queueing + acknowledgement + a nil-coordinator stash, not new routing.

## E — Findings

### GAP7-01 — The widget gallery card advertises the widget with its empty state
- area widget-deeplinks · **major** · testerVisible true · confidence 0.95 · effort S
- where `shots/GAP7/41-gallery-preview.png`; `PatinaWidget/HouseWidgetProvider.swift:38-46`
- evidence verbatim on the card: **"Open Patina to see your house."** under the description
  **"What moved on your house."** No sample row, no date, no house line.
- why This is the one frame that sells the widget; every first-party widget shows representative
  content there. A tester reads it as "this widget has nothing in it" and does not add it.
- fix Return a fixed sample payload when `context.isPreview` (WidgetKit redacts the placeholder on the
  Home Screen anyway, so C5's "never fabricate a row" is not breached where it matters).
- CONFIRMS C2-12 (was code-only, minor) — now rendered.

### GAP7-02 — A universal link tapped while the app is not running is dropped about a third of the time
- area widget-deeplinks/performance-resilience · **major** · testerVisible true · confidence 0.9 · effort M
- where `Patina/App/DeepLinking/DeepLinkHandler.swift:62-69`; 8-run sample above
- evidence 8 identical runs → 4 landed on the proposal, 2 stayed on Today with the link silently
  swallowed, 2 came up signed out. The `else` arm calls `coordinator?.openExternal(route)` on an
  optional that is still nil that early, and `handle` returns `true` regardless.
- why The emailed invoice link is the tester's first contact. A coin-flip first contact is worse than a
  broken one: it cannot be reproduced or reported.
- fix Give the universal-link branch the same `pendingRoute` stash the APNs/custom-scheme branches use,
  and replay it from `configure(coordinator:)`.
- CONFIRMS C2-02 (code-only) with a measured rate.

### GAP7-03 — A link tapped at the sign-in wall changes literally nothing
- area widget-deeplinks/state-honesty · **major** · testerVisible true · confidence 0.95 · effort M
- where `shots/GAP7/28a-authwall-before-link.png` vs `28b-authwall-after-link.png` (byte-identical)
- evidence `cmp` reports the before/after screenshots PIXEL-IDENTICAL 2 s after
  `openurl https://client.patina.cloud/invoices/b0000000-…e142`.
- why An invited tester's first tap is usually an emailed link, and their first app state is the auth
  wall. The app receives the destination and says nothing about it, ever.
- fix Queue for every non-`.main` phase, say so in one line on the auth screen ("We'll take you to your
  invoice after you sign in"), and drain after sign-in.
- CONFIRMS C2-21 for the running-at-auth shape.

### GAP7-04 — A cold tap on an emailed link opens the app onto the Welcome screen and loses the destination
- area widget-deeplinks · **minor** (same root cause as GAP7-03) · testerVisible true · confidence 0.9 · effort M
- where `shots/GAP7/29-cold-invoice-2s.png`, `30-cold-invoice-6s.png`
- evidence with the app terminated, the invoice link launches the app (association honoured) and lands
  on "Welcome home / Start with a piece you love". Nothing names the invoice at +2 s or +6 s.
  `pendingDeepLink` is a single in-memory `URL?`, so the destination does not survive the process.
- fix persist the pending destination (App Group/UserDefaults) with a short TTL, and drain it after the
  first successful sign-in.

### GAP7-05 — A widget row whose subject has since been resolved lands on Today with no explanation
- area widget-deeplinks/copy · **polish** · testerVisible true · confidence 0.85 · effort S
- where `DeepLinkHandler.route(forWidgetLink:in:)`; observed with a row id that had dropped out of
  `house-record.json` between the widget write and the tap (`22-record-thread.png`)
- evidence `patina://record/thread:de3debc3-…` (a row the widget had drawn minutes earlier) resolved to
  `.heroFrame` because the row was gone from the record, so the app opened Today silently.
- why The widget is a promise about one specific thing. Tapping it and landing on the home screen with
  no line saying "you've already seen that" reads as a broken widget rather than a resolved item.
- fix keep the row's route token in the widget payload (not just its id) or acknowledge the fallback.

### GAP7-06 — The companion bubble parks on top of content on two more screens
- area visual-system · **minor** · testerVisible true · confidence 0.8 · effort S
- where `shots/GAP7/01-today-settled.png` (Today), `05-jiggle-mode.png` (message thread)
- evidence On Today the black circular companion sits over the designer seat card and clips
  "Leah Hart[well]" and "Aspen Loft Re[fresh]". In a message thread it sits over the composer, and its
  caption "5 THINGS NEED YOUR EYE" overlaps the "Type a message…" placeholder.
- why Two screens where the app's own furniture covers the app's own content.
- fix inset the seat card / composer by the bubble's footprint, or hide the caption when a text field
  is on screen. (Same class as A-108 on Room Settings; different screens.)

## F — GOOD
* All four AASA families and both widget doors route correctly and quickly for a signed-in, running app
  (§D) — the router table is right, and a two-colon row id survives the round trip.
* Landing frames are strong: the invoice detail is honest and complete ("No payments recorded yet.",
  "Remind me the day before it's due" with the exact notification text quoted); the decision screen
  states both options with price and a recommendation; the piece screen carries maker, provenance and
  two clear CTAs. Nothing looked half-built.
* `patina://record/<unknown id>` and a row with no route both land on Today rather than dead-ending —
  the "a widget tap must never dead-end" rule holds in practice.
* Back from a deep-linked detail returns to Today; a cold launch lands on Today (no stale restoration).
* The widget gallery tile's typography is genuinely on-brand — the failure is content, not craft.

---

## ⚠ TWO AGENTS WROTE THIS FILE — everything BELOW this line is the SECOND GAP7 instance

A duplicate GAP7 lane wrote the sections above (its own ids `GAP7-01…GAP7-06`, shots named
`*-ul-*`, `*-record-*`, `*-warm-*` in `shots/GAP7/`). This instance was moved by the coordinator
to **clone A** and re-ran the script there; its ids are re-labelled **`GAP7B-01…GAP7B-16`** and its
shots are the `NN-<slug>.png` series listed in `shots/GAP7/ledger.md` rows for 08–42.
The two sets AGREE on C2-12 and on the signed-out link being dropped; they do not duplicate ids.

## Lane move (coordinator instruction, 19:24)

GAP1 was also driving clone C, so the coordinator moved GAP7 to **clone A**
`8A11B31F-FD18-4751-976F-0999EFD8B0CA` (walker A finished; nobody else assigned; verified by `ps`).
Everything from `08-cloneA-launch.png` onward is clone A, uncontended (no foreign Patina process
appeared on A at any point). Shots 01–07 were taken on clone C during the overlap and are used only
for setup facts, not for findings. Clone A was found **signed out**; GAP7 signed in through the app's
own password path with the brief's local credentials (`client@patina.dev` / `password123`).

### Two environment changes GAP7 made on clone A (record for the next lane)
1. `xcrun simctl spawn 8A11B31F-… defaults write cloud.patina.app DeploymentTarget local` — persisted,
   because a `simctl openurl` cold launch carries **no** launch arguments, so without it every
   deep-link launch would have pointed at Strata **production** while holding a *local* session.
   Left in place (clone A's designated backend is local anyway).
2. A **small Patina widget is now placed** on clone A's Home Screen page 2 (added via the iOS 26
   icon→widget morph). Left in place.

Cold-launch note: an argument-less launch resolves **every flag OFF** — i.e. exactly the TestFlight
first-launch condition. Flagged runs used
`xcrun simctl launch … -DeploymentTarget local -PatinaFlags house-widget`.

---

## FINDINGS

### GAP7B-01 — The widget gallery card is an empty state: "Open Patina to see your house." (C2-12 CONFIRMED, now sim-verified)
- area widget-deeplinks · **minor** · testerVisible true · confidence 0.99 · effort S
- where Home Screen ▸ long-press ▸ Edit ▸ Add Widget ▸ search "Patina" ▸ Patina —
  `shots/GAP7/40-gallery-patina-card.png` (20:02); code `PatinaWidget/HouseWidgetProvider.swift:38-45`
- evidence The gallery sheet reads **"Patina" / "What moved on your house."** and the single preview
  card below it carries only the **"≡ PATINA"** eyebrow, a hairline rule, a large empty band, and
  the sentence **"Open Patina to see your house."** — verbatim. This is the card a tester decides on,
  and it is the no-data state. C2-12 predicted this from `getSnapshot(in:)`'s
  `context.isPreview ? nil : store.load()`; the screenshot confirms it on device-class hardware.
- why It is the only moment the tester evaluates the widget, and it shows a widget with nothing in it.
  Worse, the empty copy is an instruction to leave the surface being sold.
- fix Return a fixed sample payload when `context.isPreview` (WidgetKit redacts placeholders anyway).
- Also: the preview's empty state is **not vertically composed** — the eyebrow sits at the top, then a
  ~40 % void, then the sentence low in the card. It reads as content that failed to load rather than a
  designed empty state.

### GAP7B-02 — With `house-widget` OFF — the TestFlight first-launch condition — the PLACED widget stays on "Open Patina to see your house." forever, even seconds after the app was opened
- area widget-deeplinks/state-honesty · **major** · testerVisible true · confidence 0.97 · effort M
- where `shots/GAP7/41-widget-flag-off.png` (20:04, taken 40 s after a full app launch);
  `Patina/Core/State/FeatureFlags.swift` (mirror), `WidgetSnapshot.flagOn`,
  `PatinaWidgetShared/HouseWidgetPayload.swift:76-79`
- evidence Launch **without** `-PatinaFlags` (= a Release/TestFlight launch, where the PostHog cache is
  empty on first run): `widget-snapshot.json` is written with `"flagOn": false` and **2 real rows**
  (`refreshedAt 2026-09-02T01:03:45Z`), and the widget on the Home Screen renders the no-data card.
  The same widget, after a launch **with** `-PatinaFlags house-widget`, renders both rows
  (`35-gallery-preview-small.png`). So the widget is not empty because there is nothing to say — it is
  empty because a flag the tester cannot see is off.
- why A first-round tester who adds the widget gets a card that says "Open Patina to see your house."
  *no matter how often they open Patina*. It never fills. Flags resolve OFF on first launch by design
  and stay off unless Kody targets that tester in PostHog — so for most of the first round this is
  permanent. The widget is the app's most public surface; a permanently dead one is worse than none.
- fix Either ship the widget ungated for the TestFlight round, or hide/greay the widget out of the
  gallery while the flag is off, or have the no-data card say why ("Not switched on yet.").

### GAP7B-03 — Every row title on the small widget truncates mid-word
- area widget-deeplinks/typography · **major** · testerVisible true · confidence 0.98 · effort S
- where `shots/GAP7/35-gallery-preview-small.png` (19:51)
- evidence The placed small widget shows **"A new story fro…"** and **"Meadow Linen…"** — both rows cut
  off. Full titles are "A new story from the workshop." and "Meadow Linen Sectional shipped."
  Neither row wraps to a second line and neither scales down; the date lines below them
  ("Aug 31", "Aug 28") have room to spare.
- why Two half-sentences is the whole content of the widget. The tester cannot tell what moved.
- fix Two-line titles with `lineLimit(2)` + `minimumScaleFactor`, or a smaller type ramp for the title.

### GAP7B-04 — The whole small widget is one tap target pointed at the FIRST row, so tapping the second row opens the first row's destination
- area widget-deeplinks/navigation · **major** · testerVisible true · confidence 0.95 · effort M
- where `PatinaWidget/HouseWidgetViews.swift:38`
  (`.widgetURL(PatinaWidgetLinks.link(for: snapshot?.drawableRows.first))`);
  `shots/GAP7/36-widget-tap-second-row.png` (19:55)
- evidence With the app terminated, I tapped the widget's **second** row
  ("Meadow Linen Sectional shipped.", which has a real `order` route). The app cold-launched to
  **Today** — not to the order. `systemSmall` cannot host per-row `Link`s, so the single `widgetURL`
  silently wins for every pixel of the card.
- why A widget that lists two things and honours only the first teaches the tester that the widget
  cannot be tapped meaningfully. Nothing on the card signals that only line one is live.
- fix Either draw one row on `systemSmall` (with a real destination), or make the card's tap target
  visibly the whole record ("See what moved") rather than a list that pretends to be tappable.

### GAP7B-05 — The first row is a "story" with no route at all, so the widget's only live tap target lands on Today
- area widget-deeplinks/state-honesty · **major** · testerVisible true · confidence 0.95 · effort M
- where `house-record.json` (row `story:a8b3f8a0-…` has **no `route` key**);
  `DeepLinkHandler.route(forWidgetLink:in:)` falls back to `.heroFrame`;
  `shots/GAP7/30-widgetlink-record-story.png` (19:44) and `36-widget-tap-second-row.png`
- evidence `xcrun simctl openurl … "patina://record/story:a8b3f8a0-1111-4111-8111-1d1a1a1a1a01"` →
  Today. `patina://record/does-not-exist-1234` → Today (byte-identical screenshots). And because of
  GAP7B-04 the widget's whole surface carries that same story link, so **every** tap on the widget in
  this state opens Today with no explanation of why the thing you tapped is not on screen.
- why The row says "A new story from the workshop." and the tap produces a home screen with no story
  anywhere on it. The fallback is safe (never a dead end) but silent — a tester reads it as broken.
- fix Give story rows a destination, or exclude rows with no route from the widget projection.

### GAP7B-06 — The widget's eyebrow reads "SINCE TUE" on a Tuesday, for a window that opened the PREVIOUS Tuesday
- area widget-deeplinks/copy · **minor** · testerVisible true · confidence 0.9 · effort S
- where `shots/GAP7/35-gallery-preview-small.png`; `sinceDate` = `2026-08-25T05:00:00Z` (Tue 25 Aug);
  the walk ran Tue 1 Sep
- evidence The card's eyebrow is **"SINCE TUE"** while the rows below are dated **Aug 31** and
  **Aug 28** — both *before* "Tue" as the tester will read it (today). A weekday name alone cannot
  name a day seven days ago.
- why It makes the widget's one framing statement wrong for exactly the readers who look at it weekly.
- fix Use a date once the window is older than ~5 days ("SINCE AUG 25"), as the rows already do.

### GAP7B-07 — Only the small family is offered on the Home Screen; the medium and large slots are greyed out in the iOS 26 icon menu
- area widget-deeplinks · **polish** · testerVisible true · confidence 0.95 · effort L
- where `shots/GAP7/34-icon-context-menu.png` (19:50); AX tree: "Small widget" enabled,
  **"Medium-sized widget" enabled=false**, **"Large widget" enabled=false**;
  `PatinaWidget/HouseWidget.swift:23` `supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryCircular])`
- evidence In iOS 26 the app-icon long-press shows a four-up size row; two of the four options are
  visibly disabled for Patina.
- why Medium is the size most people actually keep, and it is the size that would fit the untruncated
  titles GAP7B-03 is about. Two greyed cells read as an app that only half-supports widgets.
- fix Add `.systemMedium` (it solves GAP7B-03 and gives room for two real rows with destinations).

### GAP7B-08 — GOOD: every AASA universal link opens the right screen for a signed-in user, cold, and Back returns to Today
- area widget-deeplinks · not a defect · confidence 0.97
- where shots `18-signedin-cold-invoice.png`, `19-invoice-back.png`, `20-signedin-cold-proposal.png`,
  `23-decision-retry-3s.png`, `26-signedin-cold-piece.png`, `27-widgetlink-today.png`,
  `28-widgetlink-record-order.png` (19:33–19:44)
- evidence With the app terminated, `xcrun simctl openurl` on each of
  `https://client.patina.cloud/{invoices,proposals,decisions,piece}/<real id>` cold-launched Patina
  straight onto: the invoice ("Awaiting payment · INV-2026-0142 · $4,250.00 · Due Sep 6"), the proposal
  ("Aspen Loft — Living Room Refresh · $18,500.00 · Expires Sep 15"), the decision ("Dining chairs -
  Shaker Oak vs Windsor Elm", both options + Choose this), and the piece ("Oak Reading Chair · $1,550").
  `patina://today` → Today; `patina://record/order:fulfillment:f5000000-…` → the order detail
  ("Meadow Linen Sectional · SHIPPED · Shipped Aug 28 · arriving Sep 7"), colon-laden id and all.
  Back from a cold-launched invoice lands on **Today**, not a blank stack — no dead end.
- This retires P-33's open question ("whether the link resolves for a signed-in user: not verified").
  The AASA paths work; P-33's failure was the *signed-out* case, which is GAP7B-09.

### GAP7B-09 — A link tapped while signed out is not queued, not acknowledged, and never arrives — not even after signing in (C2-21 confirmed, and worse than described)
- area widget-deeplinks/auth/state-honesty · **major** · testerVisible true · confidence 0.95 · effort M
- where shots `09-signedout-warm-invoice-link.png` (19:25, app running at Welcome),
  `10-signedout-cold-proposal-link.png` (19:26, cold), `11-signedout-cold-link-local.png` (19:27),
  `12-signin-sheet.png`, `15/16-after-signin*.png`, `17-queue-drain-8s-later.png` (19:32);
  `AppCoordinator.swift:94-97,243-246`, `DeepLinkHandler.swift:64-71`
- evidence Three shapes, all silent:
  (a) **warm, signed out** — `openurl …/invoices/b0000000-…e142` while the app sat on Welcome: the
      screen did not change at all. `describe_screen` afterwards lists the same 14 Welcome nodes and
      **nothing** referring to an invoice.
  (b) **cold, signed out** — `openurl …/proposals/b0000000-…0002` with the app terminated: it launched
      to Welcome with no acknowledgement.
  (c) **the queue never drains** — from (b) I signed in with the password path. The app went to Today.
      The proposal never appeared: `16-after-signin-queue-drain.png` and
      `17-queue-drain-8s-later.png` (taken ~35 s after sign-in) are **byte-identical** (md5
      `b4e684ae0df8`), and neither is the proposal. C2-21 predicted a confusing *late* arrival; what
      actually happens is that the link is **lost**.
- why This is the invited tester's most likely first contact: a designer emails an invoice or proposal
  link, TestFlight is freshly installed, nobody is signed in. The link opens a generic welcome screen,
  and after the tester signs in the thing they were sent is still nowhere. They conclude the link is
  broken — and the designer who sent it hears about it.
- fix Queue for every non-`.main` phase, hold a FIFO not one slot, acknowledge it on the auth screen in
  one line ("We'll take you to your invoice after you sign in"), and drain on the transition to `.main`.

### GAP7B-10 — One cold universal link in five silently did nothing (decision link)
- area widget-deeplinks/performance-resilience · **minor** · testerVisible true · confidence 0.5 · effort M
- where `shots/GAP7/22-signedin-cold-decision.png` (19:36:49 → Today) vs
  `23/24-decision-retry-*.png` and three scripted repeats at 19:39:03 / 19:39:28 / 19:39:52
  (all → the decision, byte-identical `5363195a33`)
- evidence 5 cold runs of the same `/decisions/<id>` link, same signed-in state: **4 opened the
  decision, 1 landed on Today with no message**. The failing run was the only one whose `openurl`
  followed the `terminate` by 1.0 s instead of 1.5 s, so this may be a harness race (a URL delivered
  to a process that is still tearing down) rather than an app defect — hence confidence 0.5.
- why If it is real, it is the worst kind of failure: the same link works four times and quietly does
  nothing the fifth, so nobody can reproduce the tester's complaint.
- fix Worth a deliberate repeat-run before the round; if it reproduces, log the dropped URL.

### GAP7B-11 — With no photograph, a piece's hero is a flat brown gradient occupying the top third of the screen
- area product/visual-system/prod-readiness · **major** · testerVisible true · confidence 0.9 · effort M
- where `shots/GAP7/26-signedin-cold-piece.png` (19:40) — "Oak Reading Chair", local catalogue row
  with no images
- evidence The image area is a plain olive-to-brown vertical gradient with the four circular chrome
  buttons (back, help, share, favourite) floating on it. No icon, no wordmark, no "no photograph yet"
  — it reads as an image that failed to load, not as a designed absence.
- why P-36 established that **every** anon/first-run-visible product on production today has zero
  images (`anon_with_images = 0`). So this gradient IS the production product page for a first-round
  tester, on every piece they open.
- fix Either seed images before the round (P-36's fix) or give the empty hero a composed treatment —
  the mark, the maker, and a line that admits there is no photograph yet.

### GAP7B-12 — The widget's house line changes between launches for no reason the tester can see
- area widget-deeplinks/state-honesty · **minor** · testerVisible true · confidence 0.75 · effort S
- where `widget-snapshot.json` `houseLine`: **"Audit Room B"** (clone C, 19:16), **"Guest Bedroom"**
  (clone A, 19:40:29), **"Living Room"** (clone A, 19:46:18) — same account, same data
- evidence The line is "the house rail's first room" and the rail's first card is itself unstable
  across launches (`19-invoice-back.png` shows *Guest Bedroom* first; `30-widgetlink-record-story.png`
  shows *Living Room* first). The widget quotes whichever won that launch.
- why The widget's only piece of context about the house flickers between rooms; on the Home Screen,
  where it sits all day, that is visible.
- fix Order the rail deterministically (and pick the house line by a stable rule, not by array order).

### GAP7B-13 — Corroborations of findings other lanes already filed (do NOT double-count)
- **Companion orb over content** (C's orb-overlap findings): on Today the dark orb sits on the YOUR
  HOUSE rail and its caption **"5 THINGS NEED YOUR EYE"** is printed *through* the first room card's
  title — "Guest Bedroo**m**5 THINGS NEED YOUR EYE" / "Living Roo**m**5 THINGS NEED YOUR EYE"
  (`19-invoice-back.png`, `27-widgetlink-today.png`, `30-widgetlink-record-story.png`). Two type
  layers occupy the same pixels.
- **Floating back circle over scrolled content** (B.md:224/248): on the proposal detail, scrolling puts
  the "Terms" heading **under** the back button — the T is half-hidden
  (`21-proposal-scrolled.png`).
- **"Write to the address below" with no address** (GAP2-04): reproduced verbatim on the order detail
  reached from `patina://record/…`; the page does not scroll and no address exists anywhere on it
  (`28-widgetlink-record-order.png`, `29-order-scrolled.png` are identical after a swipe).
- **"Aesthete-Dev-Seed"** (GAP1-17): reproduced verbatim as the PROVENANCE chip on the piece opened by
  the universal link (`26-signedin-cold-piece.png`).

### GAP7B-14 — Proposal "SELECTIONS" rows: five identical placeholder glyphs and uneven row heights
- area money/visual-system · **polish** · testerVisible true · confidence 0.8 · effort S
- where `shots/GAP7/21-proposal-scrolled.png` (19:36)
- evidence Every one of the five selections ("Walnut sectional sofa", "Hand-knotted wool rug",
  "Walnut coffee table", "Reading lounge chair Qty 2", "Floor lamp Qty 2") carries the same
  three-bar Patina glyph where a product thumbnail would go, and every row is the same tall height
  with its title top-aligned — so the three rows without a "Qty" line have a large empty band beneath
  the title. On an $18,500 proposal the selections list is the part the client studies.
- fix Product thumbnails (or a smaller mark), and rows that size to their content.

### GOOD, briefly
- Universal links + widget links land correctly for a signed-in user, cold, including an id containing
  two colons (GAP7B-08). Back from a deep-linked screen goes to Today — no orphan stacks.
- An unknown row id and a row with no route both resolve to Today rather than a dead end or an error.
- The placed widget's visual language is genuinely Patina: cream ground, mono eyebrow, the three-bar
  mark, serif-adjacent titles — it reads as the same product as the app.
- The invoice, proposal, decision and order screens reached by link are complete, composed screens with
  real content, not stubs — the decision screen in particular (two options, prices, "Recommended",
  "Not yet" / "Neither of these" / "Discuss this with your designer") is a considered piece of design.
- Sign-in with a password is fast (~2 s to Today) and the session persisted across every relaunch.

### Could NOT verify
- **The Lock Screen families** (`accessoryRectangular`, `accessoryCircular`): reaching them needs Lock
  Screen editing, which the simulator's lock UI does not expose to synthetic input reliably. Not attempted.
- **The widget gallery's full list** (before searching): the sheet rendered blank in the Simulator for
  ~5 s and never populated a browse list; only the *search* path produced the Patina card. Simulator
  limitation, not an app defect — the card itself (GAP7B-01) is the evidence that matters.
- **Whether GAP7B-10's one silent miss reproduces** under a tester's real timing (background app, real
  tap) — only the simulator's terminate/openurl timing was exercised.
- **Anything on production**: this lane ran entirely on the local stack (clone A). Nothing here is
  device-verified; all of it is **simulator-verified** on the steward's signed Debug build.

### GAP7B-15 — A decision on Today reads "ASKED SEP 1 · OVERDUE" on Sep 1, because its due date precedes the day it was asked
- area today-home/state-honesty/copy · **minor** · testerVisible true · confidence 0.85 · effort S
- where `shots/GAP7/42-empty-widget-tap.png` (20:08); local row
  `public.client_decisions` "Rug color - Natural vs Sand": `created_at 2026-09-01 11:56:37+00`,
  **`due_date 2026-08-29`**, status `pending`
- evidence The NEEDS YOU row renders **"Leah asked about Rug color - Natural vs Sand." · "ASKED SEP 1 ·
  OVERDUE"** with OVERDUE in red — on Sep 1. The data really is impossible (due three days before it
  was asked) and the app repeats it without a guard.
- why The one red word on the home screen is attached to a self-contradicting sentence. A tester who
  reads it carefully concludes the dates are made up — which, in the seed, they are.
- fix Clamp/validate `due_date >= asked_at` where the row is built (and fix the seed), or suppress the
  OVERDUE stamp when the due date precedes the ask.

### GAP7B-16 — GOOD: the empty (flag-off) widget still opens Today rather than nothing
- `shots/GAP7/42-empty-widget-tap.png` — tapping the "Open Patina to see your house." widget with the
  app terminated cold-launches to Today. The no-data card's `widgetURL` is `PatinaWidgetLinks.today`
  (`HouseWidgetViews.swift:42,47`) and it behaves. The instruction it prints is at least honoured.
