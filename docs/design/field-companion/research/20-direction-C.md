# Direction C — "Moments as modes"

**Program:** Patina Field → a true field companion to the designer portal's project flow
**Date:** 2026-08-24 · **Agent:** C (read-only design pass)
**Evidence base:** the seven discovery reports `[D-field-app]` `01`, `[D-backend]` `02`, `[D-portal-flow]` `03`, `[D-rulings]` `04`, `[D-substrate]` `05`, `[D-external]` `06`, `[D-delivery]` `07`, plus the two synthesis documents `[G1]` `10-gap-analysis.md` and `[T1]` `11-tech-architecture.md`. All nine read in full.
**Method:** every load-bearing claim re-verified against the repo this session. File:line citations are mine unless marked *(from Dn)*. Design proposals are marked **PROPOSED**; judgements are marked as such.

> **Four things I verified myself that this direction rests on.** They are the reason Direction C is mostly *promotion of an existing concept* rather than invention.
>
> 1. **The visit already exists as a first-class object in the app.** `CaptureKit/CaptureKit/Session/CaptureSessionContext.swift` defines `CaptureSessionContext { visitID: UUID, identity, startedAt, lastActivityAt, routing: CaptureRoutingMemory }`, persisted in the App-Group `UserDefaults` under key `capture.session-context.v1`, resumed by `CaptureSessionContextPolicy.resolve` inside a 4-hour inactivity window, reset on any owner change. It is **untyped, unnamed, invisible, and never ends** — but the container is there.
> 2. **Every capture already inherits the visit's routing.** `ViewfinderModel.makeDraft()` (`Capture/Features/Capture/ViewfinderModel.swift:337-346`) copies `context.routing.projectID`, `.projectName`, `.room`, `.shelf` and `.destination` onto every new draft. **This is the whole trick of Direction C**: set the routing once at the top of the visit and the fast path is already correct — no per-capture picker required.
> 3. **…but it drops the room.** `grep -n "projectRoomId" Capture/Features/Capture/ViewfinderModel.swift` returns **zero hits**, while `S1AssignVenueScreen.persistRouting()` (`:370-372`) does set `venue.projectRoomId`. So a fast-path capture can carry a project and can never carry a `project_rooms` id. One-line fix, and it is a hard prerequisite for room-level landing.
> 4. **V1 is already the visit tray.** `V1SessionTrayScreen.swift` renders the literal heading `Text("This visit")` (`:41`), groups by venue, and ends in a footer with `Review each` / `Route all N`. Its docstring already calls itself "The hub for finishing a sourcing run in one sitting." The close ceremony this direction needs is a *modification of a shipped screen*, not a new one.
>
> Two more, load-bearing but less happy: `CaptureSyncAttributes` (`CaptureKit/CaptureKit/LiveActivity/CaptureSyncAttributes.swift`) already carries `sessionStartedAt` and `venueLabel` and is stamped **FROZEN** — but no widget target exists to render it, so *right now* is the cheapest moment in the product's life to change its shape. And `project_time_entries.activity` already admits `'site_visit'` (`supabase/migrations/00198_time_entry_source_activity.sql:29`), with a partial unique index enforcing **one running timer per user** (`00177:37-39`) that a visit must never collide with.

---

## 1 · Thesis, and what this deliberately does not do

### 1.1 The thesis in one paragraph

**The mode carries the context, so the capture doesn't have to.** Today Patina Field asks *every single capture* the questions it cannot answer — which project, which room, library or inbox, what kind of thing is this — and because those questions are expensive mid-photograph, the app quietly stops asking and the capture is born unattached (`[G1]` friction #1: `S1AssignVenueScreen` has exactly three presenters and none of them is in the capture path). Direction C moves the questions to the one moment in the day when Leah has both hands and no urgency: **the moment she arrives.** She says what this is — *Site visit at Maple Street* — and from then on the phone knows. Every photo, every spoken note, every scan inside that window is born filed. The mode also decides **what is one tap away**: on a trade walk the shutter makes a punch item; at market it makes a specimen; on a walk-through the big affordance is the microphone, not the shutter. And because a mode has a beginning it can have an **end** — one closing ritual where a day's field work becomes portal work in a single pass, with everything visible at once, instead of thirty individual routing decisions taken thirty different times.

### 1.2 Why this shape serves Leah specifically

- **Her day is already shaped as named moments, not as captures.** Her calendar says "10:00 Maple St walk-through," not "capture 14 photos." `project_time_entries.activity` already encodes this: `design | sourcing | client | site_visit | admin` (`00198:29`). The product's own data model agrees that a designer's time comes in named blocks; the phone is the only surface that doesn't know it.
- **It puts the friction where her hands are free.** Three taps in the car, or at the front door, buys a whole visit of two-tap captures. `[D-external] §C1` names this pattern directly (CompanyCam: "capture-first, file-later" — the field worker never stops to categorize mid-capture); Direction C is the stricter version — *decide once up front, never categorize at all.*
- **It gives her something to hand someone.** `[G1]` O6 scores "a designer's site-visit output is a shareable site report without retyping" as an outright FAIL — no such artifact exists on either side. A mode with a close produces one by construction. That is the difference between "my captures are in an inbox somewhere" and "here is what happened Tuesday at Maple Street."
- **It is honest about what a phone knows.** The mode is stated by the designer, not inferred by a geofence. `[D-external] §D` confirms iOS will not let a background trigger *start* a recording, and `[G1]` G-3 (R108.5/R110/R113/R114.1) makes truth-framing over inference a house law. Location and calendar may *suggest*; only Leah decides.
- **It makes the offline story visible instead of invisible.** `[G1]` #10: the transactional layer is excellent and completely invisible; `OfflineQueueBanner` is dead code and there is zero `NWPathMonitor` in the app. A running visit has a persistent band — the natural, already-owned place to say "no signal · 6 captures held."

### 1.3 What this direction deliberately does NOT do (YAGNI)

Each of these is a live temptation with a named reason to refuse it.

| Not doing | Why |
|---|---|
| **Ambient / always-on capture, geofence auto-start, wearable-style continuous listening** | `[D-external] §C14` names Limitless/Plaud as "the ceiling of zero friction" and explicitly not phone-applicable; iOS forbids background-initiated recording (`§D`); and consent exposure (`[T1] §1.13`, ruling K-01) makes surreptitious recording of a client a criminal matter in all-party-consent states. A mode **begins on a deliberate act.** |
| **A third "Capture Inbox"** | I84 (`[D-rulings] §2`) already flags `field_captures` vs `proposal_captures` as a live collision. The Visit is not an inbox; it is a container with an end. |
| **A new mobile persistence stack, a parallel outbox, or a new NestJS service** | `docs/field-site-requests/p1-contract.md` — "There is no Coolify, guest account/JWT, second room model, or second mobile persistence stack." Direction C rides `CaptureStore` + `LocalCaptureSyncService` + `commit_field_capture` unchanged. |
| **Spoken measurements becoming measured records** | R108.1 (typed anchors only) + R114.1 (two-tier trust). A spoken "forty-two and three-quarters" becomes a note that *says* the number, never a `room_file_measurements` row, never `tolerance_class='verified'`. Ruling K-05 in `[T1]`; Direction C adopts it unchanged. |
| **Auto-applying anything the model extracted** | AGENTS.md "drafts land `awaiting_review`". Confidence orders the list; it never commits. |
| **Markup / annotation on photos or plans, video walkthroughs, on-phone mood-board editing** | Zero PencilKit and zero `AVCaptureMovieFileOutput` in the app today (`[G1]` §2.1, verified). Walkthrough video is a ruled P2–P4 evidence-gated program (`[D-rulings] §4`). `[D-external] §C12` flags Houzz's mobile-view/desktop-edit split as a *cautionary* pattern — Patina should rule it deliberately later, not default into it now. |
| **Replacing Site Requests** | The designer-asks-a-third-party loop is shipped and rigorous (SR01–SR20, `site_binder_entries`). Direction C **calls it from inside a mode** ("Ask" is a kit pill) and changes nothing about it. |
| **A client-facing surface** | PRD O2 ("client visibility into the Binder — a share-view, or never?") is explicitly open (`[D-rulings] §5`). A Visit Page is studio-private, inheriting `margin_notes`' posture. |
| **On-device Whisper / WhisperKit in v1, or moving the deployment target to iOS 26** | 547–955 MB model, iPhone 15 Pro+/8 GB gating (`[D-external] §A2`); SpeechAnalyzer needs iOS 26 vs the confirmed 18.0 floor (`generate_project.rb:17`). Server re-transcription supersedes the on-device draft anyway. |
| **Modes beyond the five** | Five is already at the edge of what a picker can present without reading like a form. "Vendor visit" collapses into Market; "office day" is not a field moment. New modes need evidence, not intuition. |
| **Making the mode mandatory** | A capture taken with no visit open must still work exactly as it does today. The mode is an accelerator, never a toll. (This is the single most important YAGNI line in the document — see §2.5.) |
| **A separate Visits room in the portal** | The Visit Page renders *inside the Document she is already reading* and on the Desk. It does not get its own route, its own room, or its own ledger. R95: the Desk never carries counts or tiles. |

---

## 2 · Information architecture

### 2.1 Naming (proposed — ruling K-C1)

The repo has rulings that exist *only* to fix naming collisions, so this is stated first.

| Concept | Proposed name | Why, and what it avoids |
|---|---|---|
| The typed, started, ended session | **a Visit** | Already the app's own internal noun (`CaptureSessionContext.visitID`, `V1SessionTrayScreen`'s literal "This visit", `CaptureLifecycleTests`' "4-hour visit window") and already a first-class value in `project_time_entries.activity` (`'site_visit'`). Reuse before inventing (G-6). |
| The five kinds | **Site visit · Walk-through · Market · Trade walk · Install day** | Plain-spoken, trade-native, Midwest (brand voice). Not "session," not "mode" in user-facing copy — *mode* is the engineering word for the mechanism; *visit* is the word Leah reads. |
| What one tap away is | **the kit** | Already the shipped grammar: Capture Kits K-01 Measure set / K-02 Detail photos (`[D-portal-flow]` §G7). Reusing "kit" for "what this visit puts under your thumb" extends a vocabulary rather than adding one. |
| The generated output | **the Visit Page** | The portal's whole grammar is book-shaped — Document, margin, letterhead, Contents Page, Ledger, the Post's Letters. A visit produces *a page*, filed into the project's document. Avoids "report" (corporate, off-voice), "record" (collides with the Post's **the Record**, R82), "folio" (already means attached-files strip, and Desk folders are "folios" too), "binder" (Site Binder is taken), and "request" (three existing senses, R98/PRD/I53). |

**Explicitly not used:** "Capture Inbox" (I84, forbidden third use), "field kit" (`components/document/discovery/field-kit.tsx` is form-field primitives, G-10), "session" in user copy (overloaded with auth sessions), "Walk" (Room View's third mode is Plan · Orbit · **Walk**, R107).

### 2.2 Home and primary navigation — what changes, and what does not

Nothing about the two-realm model changes. `FieldRealmHistory { camera, work }` keeps its two independent stacks; `.viewfinder` (C1) stays the camera root; `.work` (W1) stays the work root; the WORK pill and the `cameraRealmButton` keep their round trip. **The Visit is not a third realm — it is a band that crosses both.**

```
┌─────────────────────────────────────────────────────────────┐
│  THE VISIT BAND  — persistent, both realms, one line high     │
│  ● Site visit · Maple St · 0:42 · 8 held        [Close]      │
└─────────────────────────────────────────────────────────────┘
   camera realm  C1 ◄──── WORK pill / camera pill ────► W1  work realm
   (kit pills + shutter)                          (attention + browse)
```

- **On the camera surface** the band is a slim chip in the top-left stack, directly replacing the existing `ViewfinderVenueChip` position (`ViewfinderScreen.swift:104-107` renders `ViewfinderWorkButton` above `ViewfinderVenueChip`). When a visit is open the venue chip is subsumed — the visit already names the place, so "MAPLE ST · auto" becomes "SITE VISIT · MAPLE ST". When no visit is open, today's venue chip renders unchanged.
- **On every non-camera screen** the band is the **Companion Hearth's collapsed presentation**. `FieldCompanionCollapsedPresentation { hint, action: FieldCompanionAction? }` (`CaptureKit/CaptureKit/Companion/FieldCompanionPresentation.swift:43-50`) is exactly one hint plus one typed action — a perfect fit for "Site visit · Maple St · 0:42" + `Close`. `[D-field-app] §8` opportunity 11 already flags the Companion as "decorative… the obvious place for a one-tap action." This is that action. The hearth is already pinned as a bottom `safeAreaInset` on every non-camera, non-modal screen (`RootView.swift:41-45,132-166`) — zero new chrome.
- **On the Lock Screen / Dynamic Island** the band is the Live Activity (§2.4).

### 2.3 The five modes and their kits

The kit is a horizontal pill row on the camera surface, directly modelled on the shipped `SiteScanContextControls` pill row (`Capture/Features/SiteScan/SiteScanContextCapture.swift:162-193` — `HStack(spacing: 14) { pill("camera.fill","Photo"); pill("mic.fill","Note") }`). That component is the prototype; Direction C generalises it.

| Mode | Kit (left → right, thumb-reach) | Routing memory set at start | Generated output at close | Portal landing |
|---|---|---|---|---|
| **Site visit** | **Scan** (F1) · Photo · **Note** · Measure · Ask | `destination=.inbox`, project + `project_rooms` room | **Visit Page** + (if a scan ran) the Room File; loose dimensions → margin notes; constraints prose → optional one-tap append to `discovery.site_notes` | `/doc/[id]` Project section (Visit Page block) · `/room/[id]` · `/room/[id]/file` |
| **Walk-through** | **Note** (primary, large) · Photo · Decision · Preference | `destination=.inbox`, project, client present ⇒ `note_setting='conversation'` | **Meeting notes** + proposed `client_decisions` (selection / signoff) + preferences as `margin_notes` | `coordination/coordination-work.tsx` · `margin-rail.tsx` |
| **Market** | Photo · **Tag** (N1) · **Code** (N2) · Measure (N3) · Note | `destination=.library`, project optional | **Sourcing sheet** — the visit's specimens, minted as `products(capture_source='field_capture')`, optional FF&E placements | `/library` shelf · `ffe-section.tsx` / `line-unfold.tsx` |
| **Trade walk** | **Punch** (photo+note, one gesture) · Note · Ask · Measure | `destination=.inbox`, project, court default | **Punch list** — `client_decisions(coordination_kind='punch')` in the right court, each with a photo; follow-ups → `project_tasks` | `coordination/court-bar.tsx` / `court-group.tsx` / `item-resolve/resolve-punch.tsx` |
| **Install day** | **Inspect** (G2) · Photo · Punch · Note · Confirm delivery | `destination=.inbox`, project, today's POs pre-fetched | **Receiving inspections** (`receiving_inspections` with real `photo_asset_ids`) + `damage_claims` + PO status; punch found at install | `orders-book-receiving.tsx` · Desk need kinds `awaiting_inspection` / `damage_claim` |

Three disciplines the kits must carry:

- **G-1 / R108.2 label discipline is per-pill, not per-mode.** In Site visit mode on a non-LiDAR phone, the **Scan** pill becomes **Reference** and its output is "never labeled a scan." The mode does not blur the line; the kit renders the line honestly. `SiteScanEntryMode.forDevice` already makes this decision — the kit reads it.
- **Every kit contains Note.** Voice is the one capability that belongs in every moment, which is why §5 treats it as the spine rather than a fifth camera mode.
- **"Ask" is Site Requests, unchanged.** The pill routes to `SR02` composer (`Features/SiteRequests/SiteRequestScreens.swift`) with the visit's project and room pre-filled. `[D-portal-flow]` §G7 notes the portal has the whole *response* half and no create path; Direction C does not fix that (it is a portal gap), it just stops the create path from being buried three screens deep in P2 → "Open Site".

### 2.4 Entry points

| Entry | Mechanism | Wave | Notes |
|---|---|---|---|
| App icon / `field://capture` | shipped (`CaptureDeepLink.swift`) | — | Cold launch resumes the open visit; the band is on screen before the camera warms. |
| **Action Button** | `AppIntent` **in the app target** — `StartVisitIntent` + `AppShortcutsProvider` | W5 | `[T1] §5.5` is right that this needs **no new target**: an intent in the app target gives Siri + Shortcuts + Spotlight + Action-Button binding at the 18.0 floor. Note the app already ships a `settings.action_button_rebind` analytics event and an O4 screen that *teaches* a button that does not exist (`[D-field-app] §1`) — this pays a promise already made. |
| **Control Center control** | iOS 18 Control API, needs the `CaptureWidgets` target | W5 | `CaptureWidgets/` is an empty directory with **zero** target-generation code in `generate_project.rb` (verified by `[D-field-app]` banner and `[D-delivery] §4`). One new target pays three debts: the control, the Lock-Screen widget, and the Live Activity renderer. |
| **Siri** | same `AppIntent`, phrase "start a site visit in Patina Field" | W5 | Hands-free while carrying samples. |
| **Lock Screen widget** | WidgetKit, same new target | W5 | Glanceable: the open visit + its count. Control = *act*; widget = *status* (`[D-external] §D`). |
| **Live Activity** | `ActivityKit`; attributes + controller already built and driven, no renderer | W5 | `CaptureSyncAttributes` is stamped FROZEN "a ContentState shape change breaks both" — but **nothing renders it today**, so the freeze currently protects nothing. Change its shape now, before a renderer exists, or never cheaply again. Max 8 h active / 12 h visible (`[D-external] §D`) comfortably covers one visit and *not* a multi-day job — which is a feature: it forces the close. |
| **Share extension** | — | **Not in this direction** | `CaptureShareExtension/` is empty with no target. A share-sheet import is not a *moment*; it is a desk act. Explicitly deferred. |
| **Calendar / location suggestion** | `EventKit` read (`NSCalendarsUsageDescription`, absent today) + `CLVisit` (`NSLocationAlwaysAndWhenInUseUsageDescription`, absent today) | W5, gated | **Suggestion only.** The start screen offers "Maple St · 10:00 walk-through?" as a pre-filled chip; she still taps it. `CLVisit` is the power-efficient choice and returns a best-estimate centre, good for "probably at Project X," never for a room (`[D-external] §D`). Always-location is a real App Review conversation — ruling K-C7. |

### 2.5 The session / context model

**PROPOSED** — the Visit is `CaptureSessionContext` promoted, not replaced.

```
CaptureSessionContext (existing, App-Group UserDefaults "capture.session-context.v1")
  visitID: UUID          ← becomes field_visits.id  (server-side row, same uuid)
  identity               ← unchanged (owner scoping)
  startedAt / lastActivityAt
  routing: CaptureRoutingMemory { destination, projectID, projectName,
                                  projectRoomID, room, shelf }
+ kind: FieldVisitKind?        ← NEW: siteVisit|walkThrough|market|tradeWalk|installDay
+ state: FieldVisitState        ← NEW: open | closing | closed | abandoned
+ noteSetting: solo|conversation ← NEW (consent posture, §5.5)
+ cachedProject: CaptureProjectRef?   ← NEW: name + project_rooms list, for offline
+ endedAt: Date?
```

Rules:

1. **One visit open at a time, per owner.** A second start offers "Close *Market · Merchandise Mart* and start a site visit?" — never two silently.
2. **`kind` is nullable.** A capture with no visit open is a **loose capture** and behaves exactly as today: born unattached, routed at S3, landing in the inbox. The mode is never a toll (§1.3). At the next visit start, loose captures from the last hour are offered: "3 captures from before you started — add them?"
3. **Close is explicit.** The band's `Close` is the primary path. Auto-close is a *safety net, not a mechanism*: at `lastActivityAt + 4h` (the shipped `CaptureSessionContextPolicy.inactivityWindow`, unchanged) the visit moves to `closing` and surfaces on W1 as "Maple St is still open — close it?", never silently discarded, never auto-filed. At `startedAt + 18h` it becomes `abandoned` and its captures fall back to loose. Ruling K-C4.
4. **Resume survives kill.** Because the context already lives in App-Group `UserDefaults` and the captures already live in the App-Group SwiftData store, a killed app resumes the open visit with its counts intact. Nothing new is needed here.
5. **Owner change resets.** `RootView.invalidateOwnerBoundUI` already resets the context on any owner change — a visit can never leak across accounts. Do not weaken this.
6. **The server row is created lazily.** `field_visits` is inserted on the *first successful sync* inside the visit, not at start — so starting a visit in a basement costs nothing and never blocks. `visitID` is device-generated and is the idempotency key, exactly like `clientToken` / `client_capture_id`.

### 2.6 Offline posture

The transactional layer is already excellent (`[G1] §4` items 2–5) and Direction C changes none of it. What it adds is **contextual**:

- **Pre-cache at start.** When a visit binds a project, fetch and persist the project's name + its `project_rooms` list into `CaptureProjectRef` (an existing `@Model` in `CaptureStore.schema`). Today S1's pickers call `projectsService.projectDetail(id:)` live and degrade offline to a warning banner with the FF&E menu disabled — "the offline capture is exactly the one that can't be placed" (`[D-field-app] §8`). Pre-caching at start, when she usually still has signal in the car, kills that whole failure class.
- **The band is the offline surface.** `● Site visit · Maple St · 0:42 · 8 held · no signal`. This is where `OfflineQueueBanner` (`Features/Resilience/OfflineQueueBanner.swift`, currently referenced only inside its own `#Preview`) finally gets rendered — as the band's offline state rather than a floating banner.
- **`NWPathMonitor` → drain.** Zero `NWPathMonitor` exists in the app (verified). Add one observer that calls `sync.drain()` + `siteScan.resumePendingUploads(retryFailures: false)` on regained connectivity. Without it, walking out of a basement and pocketing the phone leaves the day in the outbox.
- **Close works fully offline.** Closing a visit is a local act: it stamps routing onto the visit's captures, writes the close summary locally, and enqueues. The Visit Page appears in the portal when the outbox drains. The close screen says so honestly: "Filed on this phone · will reach the studio when you have signal."
- **The server transcript may arrive days later.** The app must never block on it, must show the device draft marked as a draft, and must never clobber an edited transcript (R114.1 two-tier trust; `[T1] §1.7`).

---

## 3 · The eight key flows

Tap counts assume a physical device, real services. "Hold" = press-and-hold gesture, counted separately. Timing targets are design budgets, not measurements — **nothing here is measured, because Patina Field has never sent a single analytics event** (`[D-delivery] §6`, live-verified: `surface='field-ios'` = 0 rows over 180 days). Setting the PostHog key is prerequisite zero.

---

### F1 · Start a visit — 3 taps, ≤10 s, works offline

*She parks outside Maple Street.*

| # | Act | Surface | Under the hood |
|---|---|---|---|
| — | Open the app (icon, Action Button, or Siri) | cold launch → C1 | `CaptureSessionContextStore` finds no open visit; C1 shows the **Start a visit** chip where the band would be |
| 1 | Tap **Start a visit** | → **MO1 Visit start** (new sheet) | |
| 2 | Tap **Site visit** | MO1, kind row | sets `kind`, kit, and `destination=.inbox` |
| 3 | Tap **Maple Street — Rands** (top of the project list, GPS/calendar-suggested) | MO1, project list | `CaptureRouteSafetyPolicy.updatingAssignment(...)` writes routing memory; pre-caches `project_rooms` into `CaptureProjectRef`; Live Activity starts; band appears |
| — | *(optional)* tap a room | MO1, room row (from the pre-cached list) | sets `routing.projectRoomID` |

**Result:** the band reads `● Site visit · Maple St · 0:00 · 0 held`. Every capture from here is born with `venue.projectId`, `venue.projectRoomId`, `venue.room` and `destination` already set — because `ViewfinderModel.makeDraft()` already copies routing memory onto the draft (`:337-346`), *once the one-line `projectRoomId` omission is fixed.*

**Offline:** the project list falls back to `CaptureProjectRef` rows cached from any prior W1/P1 fetch; the GPS suggestion still works (venue stamping is local); only *new* projects are unavailable, and S2 inline creation already covers that case.

---

### F2 · A photo and a spoken note, inside a site visit — 2 taps + 1 hold, ≤8 s

*She sees a soffit that will fight the sconce.*

| # | Act | Surface | File |
|---|---|---|---|
| 1 | Shutter **tap** | C1 → **C3 quick-confirm card** | `ViewfinderModel.pressEnded → captureSingle()` (`:187-232`) |
| — | **Hold** the card's new mic pill, speak, release | C3 card, in place — *no sheet, no navigation* | new `CaptureCardOverlay` affordance driving `VoiceNoteService` directly |
| 2 | Tap **Save** | → back to C1 | `saveFromCard()`; `destination` is already `.inbox` from the mode, so it routes immediately and **never opens S3** |

**≈2 taps + 1 hold, and the record carries project, room, venue, GPS, transcript and audio.** Compare today: **≈7 taps + 1 hold and no project** (`[D-field-app] §8`), plus ~6 more taps and a network round-trip to attach one.

The two changes that produce this: (a) the C3 card gains a mic pill (the enrichment sheets are all keyed to a `Specimen` UUID — `.voice(UUID)` — so the specimen exists by the time the card is up; no new sheet is needed); (b) S3 is skipped whenever `routing.destination != .undecided`, which is already the code's own branch (`saveFromCard()`: "if `destination == .undecided` → present S3; otherwise route directly").

**Lands:** `field_captures` (`status='inbox'`, **now carrying `project_id` / `project_room_id`** via `[T1]`'s migration 00515 fix), photos + `voice-000.m4a` in `capture-media/<uid>/<clientToken>/`, `visit_id` set. Portal: the Visit Page block on `/doc/[id]`, and the margin as a `field_visit` item.

---

### F3 · Walk-and-talk on a client walk-through — 1 press + 1 tap

*The client is talking. Leah's hands are full of samples.*

| # | Act | Surface |
|---|---|---|
| — | Press the **Action Button** (or say "start a note in Patina Field") | app foregrounds into the visit, **already recording** — iOS forbids starting a recording from the background (`[D-external] §D`), so the intent's job is to foreground and start, not to record silently |
| — | She talks for four minutes while walking | C6 **Voice mode** — full-bleed waveform, live transcript, elapsed, segment counter |
| 1 | Tap **Done** | note is minted as a **media-less specimen** and enqueued |

The media-less path is already proven: `ContextCaptureService.enqueueVoice` commits a specimen with no photo today (`CaptureKit/CaptureKit/SiteScan/ContextCaptureService.swift`). What is missing is a way to reach it from C1 — hence C6.

**In Walk-through mode the note opens with the consent chip pre-armed** (`note_setting='conversation'`, §5.5), a single line she taps: *"Everyone here knows this is being recorded."*

**Lands:** `field_captures(capture_kind='note')` → server transcription → mode-conditioned extraction → `field_note_drafts(state='proposed')`. Preferences become `margin_notes` on confirm (`apps/designer-portal/src/hooks/use-margin-notes.ts:30` `useCreateMarginNote`, rendered by `components/document/margin-rail.tsx`); a "she approved the sofa" becomes a proposed `client_decisions` selection resolve, never applied without a tap.

---

### F4 · A market day: 27 specimens, one close — ~2 taps per piece, 1 tap at the end

| # | Act | Surface |
|---|---|---|
| 1 | Start: **Market** → *Merchandise Mart* (venue, no project) | MO1 · sets `destination=.library`, kit = Photo/Tag/Code/Measure/Note |
| — | Per piece: shutter tap → C3 → **Save** | 2 taps; the tag pill (N1 OCR) adds vendor/SKU/price in one more |
| 2 | End of day: tap the band's **Close** | → **MO3 Close the visit** |
| 3 | Tap **File all 27 to My Library** | `sync.routeAll(ids, to: .library)` — the tested bulk contract that **no UI calls for placement today** (`V1SessionTrayScreen.swift:126` routes `items.first` only) |
| — | Exceptions only: 3 rows flagged "looks like something already in your library" get individual attention | |

**Lands:** 27 × `products(layer='personal', capture_source='field_capture')` on the `/library` My Library shelf, plus the **sourcing sheet** — the Visit Page rendered as a list of the day's finds with venue, price and provenance. The provenance is the point: `products.capture_source` is written today and **never read by the portal** (`[D-portal-flow]` §Stage 4) — the sourcing sheet is the first surface that makes "I found this at the Mart in March" legible six months later.

**Known limit carried, not fixed here:** `lead_time` has no field on the payload, the Specimen, or `field_captures` (`[G1]` O7). Adding it is one column and one text field — W4.

---

### F5 · A trade walk becomes a punch list — 1 tap + 1 hold per item

*Punch is the mode's shutter.*

| # | Act | Surface |
|---|---|---|
| 1 | Start: **Trade walk** → Maple St → default court **GC** | MO1 |
| — | Per defect: **hold the shutter** → photo + immediate voice ("the return on the left casing is proud") | one gesture, one specimen, one transcript |
| 2 | *(optional)* tap the court chip on the C3 card to send it to the sub instead | C3 |
| 3 | At close: **MO3** shows 6 proposed punch items, each with its photo, its verbatim quote, and a court chip | |
| 4 | Tap **Keep all 6** (or confirm/dismiss per row) | `confirm_field_note_draft` per row |

**Lands:** `client_decisions(coordination_kind='punch', court=…, court_party_id=…)` rendered by `components/document/coordination/court-bar.tsx` / `court-group.tsx` / `open-item-row.tsx`, resolved via `item-resolve/resolve-punch.tsx`; follow-ups → `project_tasks` via the same applier (portal equivalent: `apps/designer-portal/src/hooks/use-section-work.ts:101` `useCreateSectionTask`).

**The hard part, named honestly:** the web coordination composer has **no attachment affordance at all** — `grep photo|image|attach|upload` across `item-composer.tsx`, `open-item-sheet.tsx`, `item-resolve/resolve-punch.tsx` returns nothing (`[D-portal-flow]` §Stage 8) — and **there is no project-general photo table in the schema.** A punch item without a photo is a punch item nobody can act on. This is the one gap in Direction C that needs a *schema ruling before wiring* (K-C6, §7.4). The cheap interim seam is `client_decision_options.image_url`, which already exists.

**Also named honestly:** `apply_field_effect`'s `punch_report` verb is exactly right and **unreachable** — it is `SECURITY DEFINER`, `REVOKE ALL … FROM PUBLIC, anon, authenticated` (`00282:472`), anchored on `p_party_id`, and *a designer is not a party*. Direction C does not try to widen it; it uses the sibling `_apply_field_note_draft` applier from `[T1] §2.4`, which is the same shape with the designer as the authority anchor.

---

### F6 · Install day — the inspection with real photos

| # | Act | Surface |
|---|---|---|
| 1 | Start: **Install day** → Maple St | MO1; pre-fetches today's in-flight `purchase_orders` (`SupabaseReceivingService`, G1) |
| — | The band shows `Install · Maple St · 3 of 7 POs` | |
| 2 | Tap **Inspect** → pick the PO | G1 → G2 |
| 3 | Shoot damage **with the live camera** | G2 modified — today G2 is **PhotosPicker only**, which on a loading dock is the wrong instrument (`[D-field-app] §8` pain 8) |
| 4 | Outcome + submit | G3 → `receiving_inspections` + `damage_claims` + two PO status updates |

**Lands:** the inspection row already rises on the Desk as need kinds `awaiting_inspection` / `damage_claim` (`lib/document/desk-derivation.ts:98-128`). **The photos already land and are already invisible** — `[G1] §0.2` verified that iOS writes `receiving_inspections.photo_asset_ids` (`SupabaseReceivingService.swift:115` → `CodingKeys :250`) while `log-inspection-drawer.tsx:151` hardcodes `[]` and no portal surface renders the column. *There are unviewable receiving photos in production today.* Rendering them is a small, immediate portal win (§6.6).

**Note the seam cost:** Receiving is the only Field flow that uploads through the **NestJS media service** (`ReceivingMediaUploadClient` → `https://media.patina.cloud`) rather than `capture-media`. Unifying it is not free and is not required by this direction — the Visit Page links the inspection rather than owning its media.

---

### F7 · Close the visit — the ritual (the heart of this direction)

*Twelve minutes in the car, or ninety seconds at the door.*

| # | Act | Surface |
|---|---|---|
| 1 | Tap the band's **Close** | → **MO3 Close the visit** |
| — | She sees: the visit's header (kind · project · elapsed · venue); a **narrative draft** of what happened; the captures as a grid; the proposed items grouped by what they'd become; the honesty line about what has and hasn't reached the studio | |
| 2 | *(optional)* per-row confirm / dismiss / re-court / re-room | inline, no navigation |
| 3 | Tap **Close the visit** | one atomic act: stamps routing on every unstamped capture, `routeAll` to the mode's destination, sets `ended_at`, enqueues the summarize task |
| — | *(optional)* the offered time entry: **"Log 1 h 40 m as a site visit?"** | one tap → `project_time_entries(duration_minutes, activity='site_visit')` |

Three rules for the close:

- **It is never blocking and never lossy.** Closing offline is fine. Closing with un-uploaded bytes is fine (the outbox is receipt-gated and idempotent). Closing with un-transcribed audio is fine — the visit page fills in later. FR-10: "no spinner-forever, no silent loss."
- **It never invents.** The narrative draft is Designer-Taught Intelligence, generated *after* close from the visit's own transcripts and titles, and it appears on the Visit Page — not as a thing she has to approve before she can leave. Nothing she said is paraphrased into a business record without her tap.
- **The time entry is offered, never taken.** And it must be written as a **completed** entry (`duration_minutes > 0`, `source='manual_entry'`), never as a running timer — `00177:37-39` enforces one running timer per user with a partial unique index, and the portal's header TimerButton owns that slot.

---

### F8 · The next morning, at the desk

| # | She sees | Surface | Hook / view |
|---|---|---|---|
| 1 | **Desk → "From the field"**: *Maple Street · site visit · yesterday · 8 captures · 4 items to confirm* | new Desk population beside `FieldDesk` (`components/document/field/field-desk.tsx`), card modelled on `SmsReviewCard` | new `useVisitInbox()` |
| 2 | Opens the project | `/doc/[id]` | |
| 3 | The **margin** carries `FIELD VISIT · Maple Street · yesterday`, raised while items are unconfirmed | `margin_items` view + `lib/document/margin-derivation.ts` `MarginKind` union (today: `decision · message · invoice · pulse · time · note · field_sms`) + a `margin-bodies.tsx` case | `field_visit` branch, `field_sms` as the byte-for-byte template |
| 4 | The Project section carries the **Visit Page**: the narrative, the photo strip (signed), the audio player, the scan that ran, the items and what they became | new `<VisitLog>` block on `/doc/[id]` | `useProjectVisits(projectId)` + `useCaptureMediaUrls(paths)` |
| 5 | The scan she took is *right there*, not two undiscoverable hops behind a fail-closed flag | same block, finally mounting `RoomFilesSection` (`components/room-file/room-files-section.tsx:31`, complete and unmounted) over `useProjectRoomScans` (`packages/supabase/src/hooks/use-room-scans.ts:406`) | |

---

## 4 · Screens

Legend: **NEW** · **MOD** (modified) · **RETIRE**. Every new screen needs a `CaptureScreenID` case so `capture-shots.sh` and the `-CaptureScreen` harness can reach it — and while there, fix `SiteScanContextScreen`'s orphan id `screen.F1.context`, which is *not* a `CaptureScreenID` case and has therefore never appeared in a screenshot sweep (`[D-field-app] §6`). Proposed prefix **`MO`** (Moment) — unused; `M` is Messages, so `screen.MO1.*` cannot collide.

---

### MO1 · Visit start — **NEW** (`screen.MO1.visit-start`)

A sheet, presented from the C1 start chip, the W1 header, the App Intent, and the Companion.

```
┌──────────────────────────────────────────────┐
│  ╌╌╌╌  (grabber)                             │
│                                              │
│  Start a visit                    [Playfair] │
│                                              │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐          │ ← KIND ROW (horizontal scroll)
│  │Site│ │Walk│ │Mrkt│ │Trade│ │Instl│         │   each: icon + 2-line label
│  │visit│ │thru│ │    │ │walk │ │ day │         │   selected = golden-hour dot
│  └────┘ └────┘ └────┘ └────┘ └────┘          │
│                                              │
│  ──────────────────────────────────────      │
│  WHERE                            [mono]     │
│  ◉ Maple Street — Rands      · nearby        │ ← SUGGESTION BLOCK
│    10:00 walk-through            · calendar  │   (GPS ≤200 m, then calendar,
│  ○ Kippley — Third Ave                       │    then recents, then all)
│  ○ Merchandise Mart          · venue only    │
│  ＋ New project                               │ → S2 (shipped)
│                                              │
│  ──────────────────────────────────────      │
│  ROOM  (optional)                 [mono]     │ ← ROOM ROW, from cached
│  [ Living ] [ Primary bath ] [ Kitchen ]     │   project_rooms; hidden for Market
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │            Start the visit             │  │ ← PRIMARY
│  └────────────────────────────────────────┘  │
│         Just capture, no visit               │ ← SECONDARY (the escape hatch)
└──────────────────────────────────────────────┘
```

- **Primary:** Start the visit. **Secondary:** "Just capture, no visit" (dismiss to C1 unbound — §1.3's last YAGNI line made literal).
- **States.** *Empty* (no projects yet): the suggestion block collapses to "＋ New project" + venue-only Market. *Offline*: the block renders cached `CaptureProjectRef` rows with a one-line mono note "showing projects saved on this phone"; the room row renders cached rooms; **no warning banner, no disabled controls** — this is the specific regression from S1's offline behaviour that Direction C exists to avoid. *Visit already open*: the sheet opens on a confirm — "Close *Market · Merchandise Mart* (27 held) and start a site visit?" *Non-LiDAR device + Site visit*: an inline mono line under the kind row — "This phone doesn't scan. Photos and notes only."
- **Reuses:** `S1AssignVenueScreen`'s project/room menu logic and `SupabaseSiteScanService.ownableProjects()`'s narrower filter (which mirrors the `room_scans_guard_routing` guard exactly, so it can never offer a project that would fail at upload). `PatinaEmptyState` for the empty case.

---

### MO2 · The visit band — **NEW** (chrome, not a route)

Two renderings of one state, plus the Live Activity.

```
CAMERA (top-left, replacing the venue chip's slot):
   ┌──────────────────────────────────────┐
   │ ● SITE VISIT · MAPLE ST · 0:42 · 8   │   tap → MO3
   └──────────────────────────────────────┘

NON-CAMERA (Companion Hearth collapsed presentation, bottom safeAreaInset):
   ┌──────────────────────────────────────────────────────┐
   │  ● Site visit · Maple St · 0:42 · 8 held    [Close]  │
   └──────────────────────────────────────────────────────┘

LOCK SCREEN (Live Activity, W5):
   ┌──────────────────────────────────────────────────────┐
   │  ◉ Patina Field                                       │
   │  Site visit · Maple Street              0:42          │
   │  8 captured · 2 uploading                             │
   │  [ Note ]                        [ Close the visit ]  │
   └──────────────────────────────────────────────────────┘
```

- **States.** *Recording* — the dot pulses and the line becomes `● recording · 1:12` (unmissable indicator, `[T1] §1.13` control 2). *Offline* — `no signal · 8 held`, warm not alarming; this is where the dead `OfflineQueueBanner` copy lives at last. *Syncing* — `uploading 3 of 8`, driven by the existing `SyncSnapshot` stream, `FieldCompanionProgressKind.averaging(percentages:)` already computes honest aggregate progress. *Needs review* — after close, `4 to confirm`, tapping into MO4. *Closing* (auto-close window elapsed) — `Maple St · still open?` with `Close` / `Keep going`.
- **Accessibility:** the hearth's presentation layer already owns accessibility semantics (`FieldCompanionPresentation.swift` header) — do not build a parallel one.

---

### MO3 · Close the visit — **NEW** (`screen.MO3.visit-close`)

The most important new screen in the direction. A full screen, not a sheet — she is finishing something.

```
┌──────────────────────────────────────────────────────┐
│  ‹ Keep going                                        │
│                                                      │
│  Site visit                          [Playfair disp] │ ← HEADER
│  Maple Street — Rands · 1 h 40 m · 2:10–3:50 pm      │   [mono sub]
│                                                      │
│  ┌────────────────────────────────────────────────┐  │ ← NARRATIVE (draft)
│  │ You walked the living room and primary bath.   │  │   editable inline;
│  │ The soffit at the north wall will fight the    │  │   marked "draft · from
│  │ sconce. The alcove reads about 42¾″.           │  │   your notes"
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  WHAT YOU CAUGHT                          8  [mono]  │ ← CAPTURE GRID
│  ┌──┐┌──┐┌──┐┌──┐   ┌────────────────┐               │   thumbs + a note row
│  └──┘└──┘└──┘└──┘   │ ▶ 4:12  note   │               │   per voice note
│  ┌──┐┌──┐  ⟳  ⟳     └────────────────┘               │   ⟳ = still uploading
│  └──┘└──┘                                            │
│                                                      │
│  WHAT IT BECOMES                          4  [mono]  │ ← PROPOSALS
│  ┌────────────────────────────────────────────────┐  │   each row: kind icon,
│  │ ⌁ TASK   Get the sconce spec to Dan            │  │   title, verbatim
│  │   “…send Dan the sconce spec before Friday”    │  │   quote in italic,
│  │   ▸ Due Friday   ▸ GC                 ✓   ✕    │  │   editable chips,
│  ├────────────────────────────────────────────────┤  │   ✓ keep / ✕ drop
│  │ ⌁ NOTE   Alcove reads about 42¾″               │  │
│  │   needs confirming · spoken, not measured      │  │ ← R108.1 / K-05 stamp
│  │                                       ✓   ✕    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  File to Maple Street  ·  Close the visit      │  │ ← PRIMARY
│  └────────────────────────────────────────────────┘  │
│   Log 1 h 40 m as a site visit                       │ ← SECONDARY (toggle)
│   Keep the visit open                                │ ← SECONDARY
│                                                      │
│  ⌂ 2 captures still uploading — they'll finish        │ ← HONESTY LINE
│    on their own.                                     │
└──────────────────────────────────────────────────────┘
```

- **Primary:** "File to *Maple Street* · Close the visit." In Market mode it reads "File all 27 to My Library." The destination is *named in the button*, never a picker.
- **Secondaries:** log time; keep the visit open; per-row confirm/dismiss; tap any thumbnail → V3 specimen detail (shipped); tap a proposal's project/room/court chip to change it inline.
- **States.** *Empty* — "Nothing captured on this visit" + Close / Keep going, no narrative, no proposals. *Offline* — the narrative block reads "Your notes are on this phone. The write-up arrives when you have signal." and the proposals section is absent (extraction is server-side); closing still works completely. *Transcribing* — a note row reads "still being read" rather than a spinner. *Needs review* — the default state; the primary button counts what will be kept. *Partial failure* — a rejected capture (`isRejected`, review-gated) gets its own row with the reason and a Retry, and **is excluded from the bulk file** exactly as `CaptureRouteSafetyPolicy` already requires.
- **Reuses:** `V1SessionTrayScreen`'s grouping and `RouteStatusChip` / `RouteFormat` / `RouteActionButton`; `V2CullDeckScreen`'s per-record safety policy; `sync.routeAll` (`CaptureSyncService.swift:114`, tested, currently only wired to cull-to-inbox).

---

### MO4 · Visit page (in-app, read-back) — **NEW** (`screen.MO4.visit-page`)

Reachable from W1's "Recent visits" and from the band after close. The same content the portal renders, so a designer sitting in her car after a walk-through can clear the proposals without a laptop.

Regions: header (kind · project · date · duration) → narrative → capture grid with inline audio playback → proposals with the same ✓/✕ acts as MO3 → a footer line naming exactly where each confirmed item went ("2 tasks · 1 punch · 1 note in the margin").
States: *empty* (a visit with nothing) · *pending* ("still being read — check back") · *offline* (cached last-read copy, mono note "as of 8:14 am") · *all-confirmed* (the proposals section collapses to a one-line receipt).

---

### C6 · Voice mode — **NEW** (`screen.C6.voice`)

A **fifth `CameraMode`** (`CameraMode { photo, tag, measure, scan, voice }`) rather than a sheet, because today every enrichment sheet is keyed to a `Specimen` UUID (`.voice(UUID)`) so a bare walk-and-talk note is impossible from C1 (`[G1]` O3).

```
┌──────────────────────────────────────┐
│ ● SITE VISIT · MAPLE ST · 1:12       │
│                                      │
│                                      │
│      ▁▃▅▇▅▃▁▃▅▇▇▅▃▁▃▅▁               │ ← WAVEFORM (live)
│                                      │
│   “…the soffit at the north wall     │ ← LIVE TRANSCRIPT
│    is going to fight the sconce…”    │   3 lines, scrolling
│                                      │
│   draft · will be read again later   │ ← R114.1 two-tier stamp
│                                      │
│  ┌──────────────────────────────┐    │
│  │ ◉ Everyone here knows this   │    │ ← CONSENT CHIP
│  │   is being recorded          │    │   (walk-through mode only)
│  └──────────────────────────────┘    │
│                                      │
│   PHOTO  TAG  MEASURE  SCAN  ▸VOICE◂ │ ← MODE SELECTOR (shipped)
│                                      │
│     ⏸ Pause          ⏹ Done          │
│                        1:12 · seg 2  │
└──────────────────────────────────────┘
```

- **Primary:** Done. **Secondaries:** Pause/Resume; add a photo without stopping (the note keeps recording, the photo attaches to the same specimen); cancel (confirms — "Discard 1:12 of note?").
- **States.** *Idle* — a large mic and "Hold, or tap to start." *Recording* — as drawn. *Interrupted* (call/Siri) — "Paused — a call came in" with Resume, opening audio **segment N+1** (`[T1] §1.4`). *Recognizer unavailable* (always on Simulator) — falls back to today's `TextEditor`, **but keeps recording audio**, which inverts today's all-or-nothing behaviour. *Offline* — no change; recording and transcription are local. *Near the cap* — at 19:00 of a 20:00 ceiling, "note ends at 20:00" — end honestly, never stop silently.

---

### MO5 · Recent visits — **NEW** (`screen.MO5.visits`) — W1 Browse tile

A list: kind icon, project, date, duration, counts, and a state chip (`open` · `closed` · `needs review`). Tapping opens MO4. This is also where an `abandoned` visit's captures can be recovered. *Empty state:* `PatinaEmptyState(icon: "calendar", …)`.

---

### Modified screens

| Screen | Change | Why |
|---|---|---|
| **C1 Viewfinder** — MOD | (a) visit band replaces the venue chip's slot when a visit is open; (b) **kit pill row** above the mode selector, per-mode; (c) `CameraMode` gains `.voice` | The kit is the mode's whole point. Pill row copies `SiteScanContextControls` (`:162-193`). |
| **C3 Quick-confirm card** — MOD | (a) a **project/room chip** at the card head showing where this is already going (tap → S1 to change); (b) a **mic pill** for hold-to-talk in place; (c) in Trade-walk mode, a **court chip**; (d) Save routes directly whenever the mode decided the destination | This one card change collapses ~5 taps. Also: **`applySmartGuess` (`ViewfinderModel.swift:409-419`) must be replaced with the real `HeuristicSmartGuessService`** before the chip ships — it currently hardcodes `seating`@0.72 / `"Oak / bouclé"`@0.6 into every capture's shipped provenance and makes `hasUnconfirmedGuess` always true. The card cannot claim to know where something is going while it is lying about what it is. |
| **V1 Session tray** — MOD | Becomes the visit's tray: header from the visit, footer's "Route all N" **actually calls `routeAll`**, and its primary becomes "Close the visit" → MO3 | The screen already says "This visit." One footer line is the fix (`:126`). |
| **S1 Assign & venue** — MOD | Unchanged in function; gains two new presenters (the C3 chip, the MO1 room row) and stops being orphaned | It is a good screen with three callers, none in the capture path. |
| **S3 Destination** — MOD | Stays reachable, stops being mandatory: skipped whenever the mode set a destination | Already the code's own branch. |
| **W1 Work dashboard** — MOD | A visit strip above "Needs you" (open visit, or "Start a visit"), plus a **Recent visits** Browse tile | W1's `FieldAttentionBuilder` sections stay untouched. |
| **G2 Receiving inspection** — MOD | Live camera alongside PhotosPicker | A loading dock is not a photo library (`[D-field-app] §8` pain 8). |
| **F1 Scan setup** — MOD | Pre-fills project/room from the open visit; one tap to start | A scan inside a visit should not re-ask. |
| **U1 Sync status** — MOD | Groups rows by visit | The outbox is currently a flat list of a day's work. |
| **T1 Settings** — MOD | "Default visit kind", "Offer to log time at close", "Ask before recording with others present" | Three switches, one per ruling. |

### Retired

| Screen / component | Action | Why |
|---|---|---|
| `FieldPlaceholderScreen` (`CaptureKit/Design/`) | **DELETE** | Zero references now that every wave shipped. |
| `LowLightTorchOverlay` (`Features/Resilience/`) | **DELETE** | Preview-only dead code; C1's real low-light UI is `ViewfinderNightChip` / `ViewfinderTorchPill` / `ViewfinderLowLightHint`. |
| `OfflineQueueBanner` (`Features/Resilience/`) | **REVIVE, re-homed** | Not dead code by choice — it is R4's shipped copy with nowhere to render. Its strings become the band's offline state. |
| S4 / S5 terminals | **DEMOTE, not delete** | Inside a visit they are noise (the band already confirms). Keep them for the loose-capture path. |

### Copy / placeholder cleanup owed inside this direction's blast radius

`[D-field-app] §6` catalogues ~9 files of **ESCALATE-class** placeholder copy, *all* on the SiteScan coach/anchor/context surfaces — which is precisely the Site-visit kit. Direction C cannot ship Site-visit mode with "Before you leave", `SurfaceLabeler`'s humanizer, the UNVERIFIED stamp wording, the anchor panel block, and the three non-Pro `SiteScanContextCapture.swift:261,264,267` strings still unworded. Budget a copy pass with Kody (brand-voice skill: Designer-Taught Intelligence, never "AI"; truth-framing over blocking) as a W1 line item, not a W5 afterthought. Also stale-doc debt to fix in passing: `CaptureScreenID.swift`'s "51 entries" header (it is 71), `README.md`'s migration `00258` claim (it is `00265`) and its Share/Widget target list, and `AVFoundationCameraService.swift:6`'s "NOT wired into AppContainer yet" (it is, `AppContainer.swift:111-112`).

---

## 5 · Voice notes in this direction

Direction C adopts `[T1]`'s pipeline wholesale — the audio writer, segment rotation, the two-lane transcript, the cron sweep + edge function for transcription, and the `agent_tasks`-backed structuring with `field_note_drafts` as the designer-readable proposal table. What Direction C adds is **the mode as context** and **the visit as container**.

### 5.1 Recording

Unchanged from `[T1] §1.2–1.4`, and the fix is one file: `SpeechVoiceNoteService.swift` declares `mediaDirectory` (`:22`) and `audioFilename` (`:23`) and uses neither — `grep -rn "AVAudioFile\|AVAudioRecorder" apps/mobile/Capture` returns **zero hits**, so no audio has ever left a Field device, the `audio/*` branches of the `capture-media` allow-list have never executed, and — the sharper harm — `SiteScanContextCapture.swift:129` gates on `!transcript.isEmpty || audioFilename != nil`, so **a note that fails to transcribe on a noisy site is silently discarded** with the toast "Nothing recorded."

Write the file from the existing `AVAudioEngine` tap (AAC-LC m4a, mono, 32 kbps ≈ 240 KB/min); rotate the *recognition request* every ~50 s against `SFSpeechRecognizer`'s ~1-minute cap while the audio file stays continuous; open segment N+1 on interruption; set `requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition` (never set today, despite the shipped permission string "Transcribes your voice notes on-device").

**In this direction, the audio is the visit's spine.** Everything downstream — the narrative, the proposals, the Visit Page — is derived and re-derivable. That is what makes the close ritual safe to be fast: nothing she says depends on the phone getting it right the first time.

### 5.2 Transcript

Two lanes, never merged: the on-device **draft** (`voice_transcript`, `transcript_source='device'`), and the server transcript (`server_transcript`, `transcript_source='server'`), which supersedes for display unless `transcript_edited_at IS NOT NULL`. R114.1's two-tier trust, cited not re-derived. The UI stamps the draft honestly ("draft · will be read again later") and never says "AI" (brand rule, absolute).

### 5.3 Structured items — **the mode conditions the extraction**

This is Direction C's substantive divergence from `[T1]`, and it is small in code and large in quality.

`_shared/field-note-extract.ts` takes a `visitKind` and selects (a) the allowed item kinds and (b) the framing sentence. Same tool schema, same forced `tool_choice`, same five mechanical anti-hallucination rules (verbatim `source_quote` substring check; the model may never emit a uuid, only text hints resolved in Postgres at confirm time under the caller's RLS; every measurement `needs_confirmation: true`; flag-don't-fill; whole transcript in one call).

| Visit kind | Item kinds allowed | Framing |
|---|---|---|
| Site visit | `note · measurement · task · product_mention` | "A designer walking a site, describing conditions and constraints." |
| Walk-through | `preference · decision · note · task` | "A designer with a client present. Distinguish what the client wants from what the designer intends." |
| Market | `product_mention · note · task` | "A designer sourcing. Vendor, SKU, price, lead time, and whether she liked it." |
| Trade walk | `punch · task · rfi · note` | "A designer walking work-in-place with a trade. Defects and who owns them." |
| Install day | `punch · note · task · damage` | "A designer receiving goods. Condition, count, damage." |

**Why it matters:** an open-ended extractor over "the return on the left casing is proud" produces a note. The trade-walk extractor produces a punch item in the GC's court. Same model, same cost (Haiku 4.5, ~$0.01/note, immaterial), materially better landing. And the guardrail is unchanged in both cases — *nothing applies without a tap.*

**Plus one new kind:** `field_visit.summarize`, an `agent_tasks` task type enqueued at close over the whole visit (all transcripts + capture titles + counts), producing (a) the Visit Page narrative and (b) a **deduped** item list — because "get Dan the sconce spec" said three times across a ninety-minute walk should be one task. `agent_tasks.task_type` has deliberately no CHECK (`00297:41`), so both kinds are **zero DDL**.

### 5.4 Confirmation and landing

The confirm act is the same on both surfaces (MO3/MO4 on the phone, the Desk card and margin in the portal) and calls the same RPC: `confirm_field_note_draft(p_draft_id, p_patch)` → the `SECURITY DEFINER` applier `_apply_field_note_draft`, revoked from `authenticated` entirely, modelled byte-for-byte on `review_sms_message` / `apply_field_effect` (`00282:472,489-560`). Designer edits in `p_patch` win over the model's proposal.

**No auto-apply at any confidence, in any mode.** This diverges from `sms-inbound`, which applies at ≥0.8 (`pipeline.ts:574`) — deliberately, because an inbound SMS is a third party reporting a fact against a *bounded set of open items the model was shown*, while a voice note is open-ended authoring inside the designer's own document. Ruling K-04, carried from `[T1]`.

**And a spoken measurement never becomes a measured record.** `_apply_field_note_draft` must refuse to touch `room_file_measurements` or `tolerance_class`; a confirmed `measurement` draft writes a `margin_notes` row that *says* the number, tagged spoken. R108.1 + R114.1. (If this program generates the "field evidence of transcription friction" that R108.1 named as its own re-open trigger, cite R108.1 directly when re-raising it — do not quietly widen the applier.)

### 5.5 Consent — the mode makes this tractable

This is the one place where the mode buys a genuine ethical improvement rather than just fewer taps. A visit's kind already implies whether someone else is in the room.

- **Walk-through** defaults `note_setting='conversation'` and arms the consent chip on C6; **Market** and **Site visit** default `solo`.
- The chip is a nudge she taps, not legal advice: *"Everyone here knows this is being recorded."* It converts an invisible act into a deliberate one — which is both the ethical and the defensible posture.
- Never ambient, never geofence-started, unmissable indicator while recording (the band's pulsing dot + eventually the Live Activity).
- **Retention is a policy, not an accident:** `audio_retention ∈ keep | discard_after_transcript | 90_days`, default `90_days`, purged by a `field-note-media-maintenance` cron mirroring `site-request-media-maintenance`'s shipped 90-day purge (00375). Transcript survives; audio does not.
- **No recording-consent policy exists anywhere under `docs/`** — grep for "consent" hits only SMS consent (`project_parties.sms_consent_status`, 00281). All-party-consent states make surreptitious recording of a private conversation criminal, Wisconsin is one-party, and Leah's clients are not guaranteed to be in Wisconsin. **This needs a lawyer's read before any non-Kody designer ships Walk-through mode.** Ruling K-C5 / `[T1]` K-01.

---

## 6 · Portal side — the minimum that makes this real

Ranked by value per unit of work. All ride shipped seams.

### 6.1 Sign `capture-media` — the prerequisite nobody can skip

`grep -rn "capture-media" apps/ packages/` returns **nothing**. No web code has ever signed a URL from that bucket, so field photos and every second of field audio are unreadable in the portal — which makes every other item below cosmetic. One batched hook, `useCaptureMediaUrls(paths, ttl)` over `storage.from('capture-media').createSignedUrls(...)`, mirroring the two shipped precedents: `letterhead-instruments.tsx:118-130` (batched, `room-scans`) and `useFieldMediaUrl` in `use-party-sms.ts` (MMS). **Cheapest high-value unit of work in the whole program.**

### 6.2 The Visit Page block on `/doc/[id]`

A new `<VisitLog>` block in the Project section: per visit — kind, date, duration, venue, narrative, signed photo strip, audio players, the scan if one ran, and the items with what they became. Hooks: `useProjectVisits(projectId)`, `useVisit(visitId)`, `useVisitDrafts(visitId)`, `useConfirmFieldNoteDraft()`, `useDismissFieldNoteDraft()`, plus the already-shipped-and-never-called-by-web `route_field_capture` / `dismiss_field_capture` (grep finds them only under `apps/mobile/Capture`).

**Mount `RoomFilesSection` in the same block.** It is a complete, tested component (`components/room-file/room-files-section.tsx:31`) whose docstring calls it "the project detail page's Room Files zone" and which is mounted nowhere — dead since the R21 dissolve. Its hook `useProjectRoomScans` (`packages/supabase/src/hooks/use-room-scans.ts:406`) already exists. This is the single highest-leverage portal change in the program: *a designer currently cannot attach her own site scan to her own project's document* — both attach points (`letterhead-instruments.tsx:87-95`, `use-room-scans.ts:185-214` feeding Discovery's `SiteScanEditor` at `editors.tsx:295-325`) filter to **client-owned** scans.

### 6.3 A `field_visit` branch on `margin_items`

`00282_sms_core.sql:600-604` documents the discipline: recreate the prior view body **verbatim** and append exactly one UNION branch; the `field_sms` branch (`:871-899`) is the byte-for-byte template (same 11 columns, `state` from a needs-review predicate, a `payload` JSONB the rail renders). Then extend `lib/document/margin-derivation.ts`'s `MarginKind` union (`decision · message · invoice · pulse · time · note · field_sms` → `+ field_visit`) and add a `margin-bodies.tsx` case. Raised while drafts are unconfirmed, settled after — the `field_sms` rule exactly. This is the smallest possible change that puts Leah's own field work in the document she is standing in.

### 6.4 "From the field" on the Desk

A new population beside `FieldDesk` inside `StudioPulse`, cards modelled on `SmsReviewCard` (`components/document/field/sms-review-card.tsx`) — quote, who/where/when, the proposed effect **in words**, an editable field, then Apply / Dismiss. `[D-portal-flow] §7` calls that card "the design template for any 'field capture needs your hand' surface"; it is.

**Placement is a ruling (K-C8).** `StudioPulse` renders a single preview sentence until "Open pulse" is pressed — field work is one click behind a fold. A visit with unconfirmed proposals *is* an act and arguably belongs above the fold in *Needs your hand*. That would need either a new `NeedKind` (`desk-derivation.ts:98-128` has 20, none field-shaped) **plus** a `document_state` column, or a separate population. **PROPOSED: a separate population above the fold** — three precedents exist for a non-`document_state` Desk population (`FieldDesk`, `OpenRequestsStrip`, `DeskReconnect`) and none required touching the view. And **register the surface in `lib/document/registry.tsx`** so ⌘K and the Desk Contents page can reach it — that file is explicitly "the single definition of every room, ledger, and verb," and R93 forbids parallel lists.

### 6.5 Union designer-owned scans into the two existing attach points

Broaden `useClientRoomScans` and `useClientScans` to union the designer's own scans on the same project/relationship, so Discovery's `SiteScanEditor` and the letterhead "The scan" instrument stop being client-only. Two contained hook changes.

### 6.6 Render `receiving_inspections.photo_asset_ids`

Not a new feature — a **live defect fix**. iOS writes the column (`SupabaseReceivingService.swift:115` → `CodingKeys :250`), the web drawer hardcodes `[]` (`log-inspection-drawer.tsx:151`) and tells the user "Desktop logs the inspection without photos" (`:466`), and no surface renders it. There are unviewable damage photos in production rows today.

### 6.7 Flag posture — decide before building

Eight fail-closed PostHog flags gate the portal; `room-file` gates the *entire* Room File including the capture-context list, and `call-sheet` gates the party profile and therefore the SMS thread and field links. **Most existing field surface is already dark by default.** Landing this behind a third dark flag makes it unwalkable — and MEMORY.md records at least four shipped-behind-a-flag surfaces whose flag "has never been seen by a human." **PROPOSED: one flag, `field-visits`, plus a hard commitment that the flag-on walk happens before any slice is called done.** Ruling K-C9.

---

## 7 · Data and back-end touchpoints

Direction C sits on top of `[T1] §2–3` and adds four things. Read `[T1]` for the transcription/structuring lanes; only the deltas are stated here.

### 7.1 Adopted from `[T1]` unchanged

`00514` (`capture_kind`, `voice_audio_segments`, `voice_audio_sha256`, the two transcript lanes, `transcript_state`/`attempts`/`error`, `audio_retention`, `note_setting`, the sweep indexes, and the provenance GIN index carried unbuilt since R112/R113) · `00515` (**the inbox branch of `commit_field_capture` must persist `project_id`/`project_room_id`/`shelf`** — `00235:204-217` sets only `status` today, which is why every note-shaped capture arrives unattached) · `00516` `field_note_drafts` · `00517` the confirm/dismiss/stage RPCs · `00518` the margin branch · `transcribe-field-note` + `structure-field-note` + their crons · Cloudflare Workers AI for transcription (no new subprocessor) · Haiku 4.5 forced-tool-use for structuring.

### 7.2 Divergence 1 — `field_visits` (new, ~00519)

`[T1]` has no visit entity. Direction C needs one, and it is small.

```
field_visits
  id                uuid PK              -- == the device's visitID (idempotency anchor)
  designer_id       uuid NOT NULL → profiles
  organization_id   uuid → organizations
  kind              text NOT NULL CHECK (kind IN
                      ('site_visit','walk_through','market','trade_walk','install_day'))
  project_id        uuid → projects
  project_room_id   uuid → project_rooms          -- the FF&E/scope room (see 7.5)
  room_scan_id      uuid → room_scans             -- set if a scan ran (see 7.5)
  venue_label       text · captured_lat/lng · captured_timezone
  started_at        timestamptz NOT NULL
  ended_at          timestamptz
  state             text NOT NULL DEFAULT 'open'
                      CHECK (state IN ('open','closing','closed','abandoned'))
  summary           text            -- the generated narrative
  summary_state     text NOT NULL DEFAULT 'none'
                      CHECK (... 'none','pending','running','done','failed','skipped')
  capture_count · note_count · draft_count   (denormalized, stamped at close)
  time_entry_id     uuid → project_time_entries
  created_at · updated_at
```

Plus `ALTER TABLE field_captures ADD COLUMN visit_id uuid REFERENCES field_visits(id) ON DELETE SET NULL;` and the same on `room_scans` (nullable, additive, no behaviour change for scans taken outside a visit).

RLS: owner (`designer_id = auth.uid()`) full CRUD, plus a project-team SELECT using the helper `review_sms_message` already uses (`public.is_project_team_member`, `00282:531`) — **subject to ruling K-C3** (per-designer vs per-studio), which also decides whether the `capture-media` object policy needs a co-member branch. That branch is a `storage.objects` policy owned by `supabase_storage_admin`, i.e. a **platform-admin phase migration**, not an ordinary one (`00483` header) — sequence the ruling before the schema work.

Every new `public.` routine must copy the `00437:516-529` idiom (`REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role; GRANT EXECUTE … TO <exactly the role>`) or it trips the ACL conformance gate — prod default privs auto-grant `anon` EXECUTE on new public functions, and that has bitten twice.

### 7.3 Divergence 2 — `close_field_visit` RPC (~00520)

One atomic designer act, `SECURITY DEFINER`, modelled on `close_project` (00238) and `site_request_close` (00374):

```
close_field_visit(p_visit_id uuid, p_patch jsonb DEFAULT NULL) RETURNS jsonb
  1. authorize: designer_id = auth.uid() OR is_project_team_member(project_id, auth.uid())
  2. idempotent no-op when state='closed' (return the existing summary + counts)
  3. stamp project_id/project_room_id onto this visit's field_captures rows that lack them
     -- safe: field_captures_guard_routing (00233:196-256) runs BEFORE UPDATE under
     --       SECURITY INVOKER and rejects a project the caller doesn't own
  4. ended_at = now(), state = 'closed', denormalize counts
  5. optionally insert project_time_entries (duration_minutes > 0, source='manual_entry',
     activity='site_visit') -- NEVER a running-timer row: 00177:37-39 enforces one
     running timer per user with a partial unique index, owned by the portal's TimerButton
  6. enqueue_agent_task('field_visit.summarize', idempotency_key='field_visit.summarize:'||id)
```

**A note on the time entry:** `project_time_entries.source` currently CHECKs `timer_auto | timer_manual | manual_entry` (`00198:26-27`). Writing `'manual_entry'` needs zero DDL but loses provenance. Adding `'field_visit'` is a one-line widened CHECK and makes the entry honest about where it came from. **PROPOSED: widen.** Ruling K-C10.

### 7.4 Divergence 3 — where a punch photo lives (unresolved, blocking F5)

`[G1]` #9 and `[D-portal-flow]` §G5 both land here: coordination items have **no attachment affordance at all**, and **there is no project-general photo table in the schema** — the only photo stores are `room_scan_images` (scan-scoped), `mood-board-assets` (board-scoped), comms attachments (message-scoped), `site_deliverable_media` (request-scoped). Three options, in ascending honesty:

1. **`client_decision_options.image_url`** — exists today, zero DDL, semantically wrong (an option is a choice, not evidence), but ships this week.
2. **A `field_captures` back-reference** — the punch item points at the capture that produced it; the portal signs `capture-media` (§6.1) to render it. Zero new media tables, correct provenance, and it makes the punch item's photo *the same object* as the visit's photo. **PROPOSED.**
3. **A project-general media table** — the honest long answer, and a real schema program with an RLS design of its own.

Direction C proposes (2) and explicitly flags that (3) is still owed. Ruling **K-C6** — the only place in this direction where design cannot proceed without a schema decision.

### 7.5 Divergence 4 — the room word, ruled by data (K-C2)

Three concepts collide: `rooms` (what site scans attach to, what F1 picks, what `siteScanContext.projectRoomId` carries — verified: `ContextCaptureProvenance.swift:21,29-32` says so explicitly), `project_rooms` (FF&E/scope rooms, what S1 picks, what `field_captures.project_room_id` FKs to), and `room_scans` (the LiDAR row).

**PROPOSED ruling:** *the Visit binds a `project_rooms` row*, because that is the room the Document's spine shows (`useDocumentRooms` → `spine-rooms-block.tsx` → FF&E headings) and the room a capture's real FK column points at. When a LiDAR scan runs inside a visit, it attaches to `public.rooms` exactly as it does today — and the **`field_visits` row records both ids**, which makes the visit the first place in the product where the two room concepts are reconciled by data rather than by convention. Scan-context captures keep their flat dotted provenance keys unchanged (`use-room-files.ts:361-395` filters `.contains('provenance', {'siteScanContext.scanId': scanId})`; the nested path matches zero real rows — do not "fix" it).

### 7.6 Numbering and gates

Filesystem head is `00513_invoice_numbering_studio_uniqueness.sql`, with gaps at 00487/00488, 00496/00497, 00502–00509, and **00512 parked and unapplied** on `followon/sd-caller-hardening-00512` — prod's ledger head is 00513 *with a hole at 00512*, so if that branch ever lands it applies out of order. Mint from **00514**, re-verify the live ledger against Strata before writing a byte, and coordinate with whoever owns the parked follow-on. Server tests go in `supabase/tests/field/` beside `apply_field_effect_test.sql` — noting MEMORY.md records **71/108 SQL tests currently red** (00483 `pg_temp` fallout), so that suite cannot certify new RLS work until it is repaired.

---

## 8 · Migration path from today's Field app

### 8.1 Kept, untouched

The site-scan rig (shared `ARSession`, four recorders, coverage coach, anchors, 11-artifact bundle) · the scan upload chain (container-independent durable key, background `URLSession`, `merge_scan_artifact_sha256`, `ScanConfirmPolicy`'s 4xx-vs-unreachable discrimination) · the capture outbox's idempotency and receipt discipline (`clientToken` never regenerated, upsert media, `CaptureTransferPhase.complete` impossible without a `receiptID`, `isDeferrable` vs `isRejected`) · owner scoping and the fail-closed `CaptureOwnerProjectionPolicy` · the library safe-harbor (`00235`'s `EXCEPTION WHEN OTHERS` → inbox with the error in `raw_payload.conflict`) · all eight Work flows including **decisions staying read-only by design** · the SMS rail · the Site Request guest loop · the private owner-scoped `capture-media` posture · every frozen wire contract (`FieldCapturePayload`'s camelCase keys, `ContextCaptureProvenance`'s flat dotted keys, `CaptureMediaPath`'s lowercase-both-segments rule, the B-17 semantic-vs-transport MIME split).

### 8.2 Re-homed

| Today | Becomes |
|---|---|
| `CaptureSessionContext` (implicit, untyped, never ends) | **the Visit** — typed, named, visible, ended |
| `V1SessionTrayScreen` "This visit" + "Route all N" (routes one) | **MO3 Close the visit** — real bulk routing through the tested `routeAll` |
| `ViewfinderVenueChip` | subsumed by the visit band when a visit is open; unchanged otherwise |
| `SiteScanContextControls`' pill row | generalised into **the kit** |
| `OfflineQueueBanner`'s copy (dead) | the band's **offline state** |
| `FieldCompanionController`'s collapsed presentation (decorative) | the band's **non-camera rendering**, with a real action |
| `CaptureSyncAttributes` (built, undriven by any renderer) | the visit's **Live Activity**, with a widget target to render it |
| S1's project/room menu | reused inside MO1, and finally reachable from C3 |
| `settings.action_button_rebind` (an event for a button that does not exist) | a real `StartVisitIntent` |

### 8.3 Retired / fixed on the way through

Delete `FieldPlaceholderScreen` and `LowLightTorchOverlay`. Replace `ViewfinderModel.applySmartGuess`'s hardcoded `seating`/`"Oak / bouclé"` literals with the real `HeuristicSmartGuessService` (already built, already Simulator-safe) — it currently ships fiction into `products.capture_provenance` and makes S3 recommend Inbox for every capture. Fix `makeDraft()`'s dropped `projectRoomId`. Wire `routeAll` in the V1/MO3 footer. Add the missing `CaptureScreenID` case for `screen.F1.context`. Clear the ~9 files of ESCALATE copy on the SiteScan surfaces. Fix the three stale doc claims in §4.

### 8.4 Frozen-seam edits — do them once, at the top

Four files carry explicit freeze comments and this direction edits all four: `CaptureRoute` / `CaptureSheet` / `CaptureScreenID` (`CaptureNavigation.swift:4-6` — "Changing a case is a foundation-owner-only edit"), `AppContainer` (`:13` — "FROZEN for the waves"), and `CaptureSyncAttributes` ("FROZEN — a ContentState shape change breaks both"). Name this in the brief as a **single foundation-owner edit at the top of W1**, not an incremental per-wave drip. New `AppContainer` seams follow the shipped `<Flow>ServiceFactory.make(deps:)` pattern exactly, with a `MockFieldVisitService` in `CaptureKitMocks` so all 71 screens keep rendering on the Simulator.

---

## 9 · Effort, risks, rulings

### 9.1 Waves

Rough engineer-weeks. S ≤ 1 wk · M 1–3 wk · L 3–6 wk. Each wave is independently shippable and independently valuable.

| Wave | Work packages | Size | Weeks |
|---|---|---|---|
| **W0 · Prerequisites** *(no product surface; everything after is unmeasurable without it)* | Set `postHogAPIKey` in Field's `Secrets.swift`, ship one build, **confirm `surface='field-ios'` rows appear** (S) · add `isFeatureEnabled` to `CaptureAnalytics` + `PostHogCaptureAnalytics` + `MockCaptureAnalytics`, fail-closed (S) · `useCaptureMediaUrls` signed-URL hook (S) · the four one-line fixes: `makeDraft` room, `applySmartGuess`, `routeAll`, `OfflineQueueBanner` + `NWPathMonitor` (S) · re-verify the live ledger | **S** | **1.5** |
| **W1 · The visit exists** | `field_visits` + `visit_id` columns + `close_field_visit` (M) · iOS visit model, kind/state/kit, App-Group persistence, project+room pre-cache (M) · MO1, MO3, MO5, the band in both realms (M) · C1/C3/V1/S1/S3/W1 modifications (M) · portal: Visit Page block + `RoomFilesSection` mounted + `field_visit` margin branch + Desk population + registry entry (M) · ESCALATE copy pass (S) · foundation-owner seam edit (S) | **L** | **5** |
| **W2 · The voice survives** | `SpeechVoiceNoteService` audio writer + segment rotation + interruptions + `requiresOnDeviceRecognition` (S) · C6 voice mode (M) · migrations 00514/00515 (S) · `transcribe-field-note` + `_shared/transcribe.ts` + cron + `job_runs` + attempt/park + billing guard + the stuck-`queued` sweep (M) · portal audio playback + reconciliation UX (S) | **M** | **3** |
| **W3 · The visit generates its output** | `00516`–`00518` (M) · `_shared/field-note-extract.ts` with the mode-conditioned prompts (M) · `structure-field-note` + `field_note.structure` (S) · `field_visit.summarize` + the narrative (M) · MO4 in-app review + MO3's proposals section (M) · portal confirm card + margin bodies (M) | **L** | **5** |
| **W4 · The kits earn their keep** | Trade-walk punch with a photo — **gated on K-C6** (M) · Install-day live camera in G2 + rendering `photo_asset_ids` (S) · Market bulk file + dedupe + `lead_time` column and field (M) · Walk-through decisions + preferences → margin (M) · "Ask" pill → SR02 pre-filled (S) · time-entry offer (S) | **M–L** | **4** |
| **W5 · One gesture away** | `StartVisitIntent` + `AppShortcutsProvider` — no new target (S) · **`CaptureWidgets` target generation in `generate_project.rb`** (M) · Control Center control + Lock-Screen widget + **the Live Activity renderer** (M) · `CLVisit` + `EventKit` suggestion, new permission strings, App Review prep (M) · background audio `UIBackgroundModes:[audio]` if W1–W3 evidence justifies it (S) | **M** | **3.5** |
| **Cross-cutting** | Device passes per wave (single-operator today) · TestFlight/fastlane setup **if this must reach Leah's phone** (M) · `VoiceRecordingTests`, `FieldVisitTests`, extensions to `FieldCapturePayloadTests` and `UploadStateTests`, `field_visit_rls_test.sql`, `close_field_visit_test.sql` | **M** | **2** |

**Total ≈ 24 engineer-weeks** to all five modes fully realised. **W0 + W1 alone ≈ 6.5 weeks** and deliver the direction's whole thesis with *no server AI whatsoever*: named visits, kit-tuned capture, two-tap filing, a real close, and Leah's own field work visible in her own document for the first time.

### 9.2 Risks

| # | Risk | Mitigation |
|---|---|---|
| **R-C1** | **She forgets to start a visit.** The whole design leans on an act that costs three taps and buys nothing until later. | Loose captures always work (§2.5 rule 2); the next visit start adopts orphans from the last hour; W5's Action Button/Control Center makes starting cheaper than not. **And measure it** — `visit.start` vs loose-capture ratio is the direction's single most important metric, which is why W0 exists. |
| **R-C2** | **She never closes.** The output is the payoff and the close is the gate. | The band is persistent and slightly insistent; the Live Activity's 8-hour cap forces the question; auto-close at 4 h idle *surfaces* rather than silently files; and the Desk card nags in the morning. But if telemetry shows closes lagging starts, the close must become passive (auto-file at the mode's default, review later) — a real fallback, not a failure. |
| **R-C3** | **We may be building the wrong wedge.** Leah Session 05 (prepped 2026-08-18) has not run — `leah-session-05-findings-template.md` is still blank — and its block 2 ranks "capture/memory" against three *other* MVP wedge candidates. | Ship W0+W1 as the cheap, reversible bet (it is overwhelmingly bug-fixes, wiring, and one small table) and hold W3 for the answer. |
| **R-C4** | **Consent exposure.** No recording policy exists anywhere under `docs/`. | §5.5 controls; K-C5; lawyer's read before Walk-through mode reaches a non-Kody designer. |
| **R-C5** | **Mode proliferation / the picker becomes a form.** Five is the ceiling. | Ruling K-C11 fixes the five. New kinds need field evidence, not intuition. |
| **R-C6** | **The Live Activity cannot render** — attributes and controller are built and driven, no widget target exists. Claiming it works without a device check would be false. | W5 builds the target; until then the band is in-app only, and no copy promises a Lock-Screen card. |
| **R-C7** | **Field has never emitted an analytics event and has no feature-flag mechanism.** Every claim of improvement in this document is currently unfalsifiable. | W0 items 1–2. Nothing later is measurable without them. |
| **R-C8** | **No UI tests, and CI enforcement unconfirmed.** `CaptureUITests/` is empty with no generated target; the "(advisory)" iOS jobs in `policy-quality.yml` set no `continue-on-error`, so whether they block is a branch-protection question invisible from the repo. `capture-gate.sh`'s lint step silently no-ops and exits 0 without swiftlint. | Device walks are the real gate. Budget them; never let a green `capture-gate.sh` stand in for one. |
| **R-C9** | **No distribution pipeline.** No fastlane, no archive step, no confirmed ASC record, no `asc-*` Field skill library. Every build is a manual Xcode archive on one machine. | If this must reach designers beyond Kody, TestFlight is a hard dependency of W1, not a nicety. K-C12. |
| **R-C10** | **Prod ledger has a hole at 00512**, parked on a branch that also carries a known live defect. | Mint from 00514, verify live, coordinate before pushing. |
| **R-C11** | **71/108 SQL tests are red**, so the suite cannot certify new RLS work. | Treat suite repair as a dependency of W1's RLS, or write the new tests standalone and say so plainly. |
| **R-C12** | **Frozen-seam churn** across four files with explicit freeze comments. | §8.4 — one foundation-owner edit at the top of W1. |
| **R-C13** | **Transcript quality on a job site is unmeasured** — compressors, saws, echo in an empty room. Whisper is good; nobody has tested it *here*. | W2 stores both transcripts on every note, so the corpus for measuring this is a byproduct of shipping. |
| **R-C14** | **Storage co-member gap.** If K-C3 rules the visit studio-wide, the `capture-media` object policy needs a co-member branch — a `supabase_storage_admin`-owned policy, i.e. a platform-admin phase migration. | Sequence the ruling before the schema work. |

### 9.3 Rulings Kody owes

Direction-specific rulings are `K-C*`; the four carried unchanged from `[T1]` keep their original numbers so the two documents can be read together.

| # | Ruling | Why it blocks |
|---|---|---|
| **K-C1** | **Naming.** "a Visit" (five kinds) · "the kit" · "the Visit Page." Or something else. | Names are hard to change after they reach ⌘K, the Desk, the margin, and a `CaptureScreenID` enum. I84 forbids a third "Capture Inbox"; R98/PRD/I53 make "request" ambiguous three ways. |
| **K-C2** | **Which room concept the Visit binds.** Proposed: `project_rooms`, with the visit row recording the `public.rooms`/`room_scans` ids too. | Blocks every "put this in this room" affordance and the `field_visits` schema. |
| **K-C3** | **Per-designer or per-studio.** `field_captures` RLS is owner + org-inbox; `room_files` delegates to the broader scan visibility. They disagree today, in code, documented as an unfixed P2. | Decides an RLS policy, a platform-admin storage migration (R-C14), and whether the Visit Page is a Desk population or a Studio ledger. |
| **K-C4** | **Auto-close policy.** Proposed: 4 h idle → `closing` and surfaced, never silently filed; 18 h → `abandoned`, captures fall back to loose. | Decides whether a forgotten visit costs her anything. |
| **K-C5** | **Recording consent posture.** Does Walk-through require the explicit affirmation? Is there a jurisdiction rule? *(= `[T1]` K-01.)* | The one item with legal exposure. Shapes the capture UI and the retention default. |
| **K-C6** | **Where a punch photo lives.** Proposed: a `field_captures` back-reference (option 2, §7.4). | **Hard-blocks F5 / W4.** There is no project-general photo table and coordination items have no attachment affordance at all. |
| **K-C7** | **Location and calendar.** Ship `CLVisit` + `EventKit` suggestion (needs Always-location and `NSCalendarsUsageDescription`, both absent), or stay with the manual start? | Always-location is a real App Review conversation. Suggestion-only is the honest scope. |
| **K-C8** | **Desk placement** — above the fold in *Needs your hand*, or inside the Studio Pulse fold beside `FieldDesk`? | Decides whether it needs a new `NeedKind` + a `document_state` column, or just a population. |
| **K-C9** | **Flag posture.** One flag `field-visits`, plus a commitment to the flag-on walk. | `room-file` + `call-sheet` already make most field surface dark; a third dark flag makes this unwalkable. |
| **K-C10** | **Time entry.** Offer it at close? Widen `project_time_entries.source` to add `'field_visit'`, or write `'manual_entry'`? | One CHECK line, and it decides whether a field visit is legible in the Hours ledger. |
| **K-C11** | **Are these the right five modes?** Site visit · Walk-through · Market · Trade walk · Install day. | Fixes the kit vocabulary and the extraction framings. |
| **K-C12** | **Is TestFlight a dependency?** | Decides whether W1 ends at "Kody's device" or "Leah's device." |
| **K-04** *(carried)* | **Does anything auto-apply?** Proposed: never, in any mode — diverging deliberately from `sms-inbound`'s ≥0.8 auto-apply. | The single biggest trust decision in the pipeline. |
| **K-05** *(carried)* | **Can a spoken measurement ever become a measured record?** Proposed: no. R108.1 + R114.1 both say a spoken number is not a measured record. | Decides whether `_apply_field_note_draft` may ever touch `room_file_measurements` / `tolerance_class`. |
| **K-07** *(carried)* | **Background audio** (`UIBackgroundModes:[audio]`) so a note survives screen-lock. | App Review + battery + privacy; changes the whole "phone in pocket" story. |
| **K-10** *(carried)* | **PRD O8** — "when The Document reads the Binder, what renders in the Desk vs the margin?" The PRD itself flags this as cross-cutting and not Field's call alone. | §6.3/§6.4 answer it *by implementation* for visits; it deserves an explicit ruling, because it sets the pattern every future field surface follows. |

---

*Read-only design pass. No repository file was modified other than this report.*
