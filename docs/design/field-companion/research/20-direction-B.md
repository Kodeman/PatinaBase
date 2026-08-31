# Direction B — "Capture first, file later"

**Program:** Patina Field → a true field companion to the designer portal's project flow
**Date:** 2026-08-24 · **Agent:** Direction B (read-only repo survey + design)
**Evidence base:** the seven discovery reports and two synthesis documents in this directory,
cited as `[D-field-app]` `[D-backend]` `[D-portal-flow]` `[D-rulings]` `[D-substrate]`
`[D-external]` `[D-delivery]` `[G1]` `[T1]`. Everything I re-verified directly against the
repo carries a file:line citation. Design proposals are marked **PROPOSED**; anything I
could not prove from code is marked **(inference)**.

> This is **one** direction, developed independently and thoroughly. It is not a
> recommendation over the other directions and it does not hedge toward them. Where it
> diverges from `[T1]`'s architecture, §7 says so explicitly.

---

## 0 · One page

```
   TODAY                                   DIRECTION B
   ─────────────────────────────           ─────────────────────────────────────
   shutter                                 shutter
     ↓ C3 card (guesses she must read)       ↓ thumbnail flies to the Tray
     ↓ Save                                  ↓ viewfinder is still live
     ↓ S3 "Library or Inbox?"              (done — 1 tap, ~1.5 s, no screens)
     ↓ S4/S5 terminal
   ≈7 taps + a hold, and it still          the Pin says where we think it goes,
   has no project. Attaching one           always visibly a guess, never a gate
   costs ~6 more taps and a network
   round-trip.  [D-field-app §8]                        ↓
                                            THE TRAY  ·  in-app + on the Desk
                                            everything unfiled, durable, grouped
                                                        ↓
                                            FILE  ·  one tap accepts the suggestion
                                            (or an assistant does it, or the
                                             portal does it, days later)
                                                        ↓
                                     Library · project room · FF&E line · Room File
                                     · margin note · task · decision
```

**The one-sentence thesis:** *capture is an act, filing is a decision, and Leah should
never have to make a decision while her hands are full.*

Everything else in this document follows from separating those two things in time — and
from one discipline that keeps the separation honest: **a capture always carries what she
did (immutable fact) and where we think it goes (a suggestion, rendered as a suggestion,
never silently promoted to fact).** That is R114.1's two-tier trust framing
(`[D-rulings] §2`, device = orientation, server = truth) generalised from *transcripts* to
*filing*. It is the single ruled precedent this direction leans on hardest.

---

## 1 · Thesis

### 1.1 Why this shape serves Leah on the move

**Because the fast path today asks a question she cannot answer yet, and the whole cost of
the product's field story is downstream of that.**

`[G1]` scored nine outcomes; **0 of 9 pass**. Its friction ranking puts "the capture fast
path has no project picker" at #1 and "nothing a designer captures is visible in the
portal" at #2. Both are true. But look at what the fast path actually does today: it stops
her *twice* — once at C3 to read two guesses (which are a hardcoded literal, see below) and
once at S3 to answer "Library or Inbox?" — and **neither stop asks the question that
matters.** She is stopped twice and still has no project.

Direction A's answer is to add the missing question to the fast path (a project chip in
C3/C5). Direction B's answer is the opposite: **remove both stops, ask nothing, and make
filing a first-class, deliberately-designed later moment.**

Four evidence-grounded reasons this is the right trade for *this* persona and *this*
codebase:

1. **The context often does not exist at capture time.** At High Point she does not yet
   know which project a chair is for — that is the whole point of sourcing. On a walk-through
   the client says three things in ninety seconds and none of them are a project decision.
   Forcing a destination at capture time either produces a wrong answer or produces a
   stopped designer. Today's system produces both: `applySmartGuess`
   (`ViewfinderModel.swift:409-419`) hardcodes **every** photo as `category="seating"` @0.72
   and `material="Oak / bouclé"` @0.6, which makes `hasUnconfirmedGuess` always true, which
   makes **S3 recommend Inbox for literally every capture** `[G1] §3 #7`. The product
   already silently defaults to "file later" — it just does it dishonestly, behind two taps
   that pretend to be a decision.

2. **The filing machinery already exists and has never been used.** `route_field_capture`
   and `dismiss_field_capture` shipped in `00235_commit_field_capture_rpc.sql:309,348`,
   are `GRANT EXECUTE ... TO authenticated` (`:343,:377`), and have **zero web callers** —
   grep finds them only under `apps/mobile/Capture` `[D-portal-flow] §G1`. `commit_field_capture`'s
   library branch already safe-harbors any failure back to `status='inbox'` (`00235`
   `EXCEPTION WHEN OTHERS`), i.e. the schema's own designed failure mode is *exactly*
   Direction B's happy path. And `field_captures.status='inbox'` is the semantic twin of
   `sms_messages.needs_review`, which already has a full Desk card with Apply/Dismiss
   (`SmsReviewCard`) `[D-portal-flow] §7`. **Direction B is mostly the act of connecting
   parts that were built for it and left unconnected.**

3. **Filing is a desk act, and the desk is where the portal already is.** Leah files
   between visits, in the car, at night, or she has an assistant do it. A phone-only filing
   flow is the wrong instrument for the job; the Desk's triage card grammar
   (quote → proposed effect in words → Apply / Dismiss) is exactly right and already ships.
   Direction B gets the second surface almost free.

4. **It matches how field-capture products that work actually work.** `[D-external] §C1`
   found "capture-first, file-later inbox" as the dominant pattern (CompanyCam: snap +
   talk, report generated afterward; Otter: transcript lands in an inbox, tagged later),
   and `§C4` names the review-later inbox as distinct from the live record. It also matches
   the house's own already-shipped grammar: `site_binder_entries` is append-only *approved*
   evidence promoted out of raw deliverables (`[D-backend] §1.5`) — raw first, promoted
   later, by a human.

### 1.2 What Direction B deliberately does NOT do (YAGNI)

Stated as refusals, because each one is a real thing someone will ask for.

| Refused | Why |
|---|---|
| **A project picker in the capture path.** No project chip on C3/C5, no room picker on the shutter. | That is the other direction's thesis. Adding it here would give us both a gate *and* a tray, which is worse than either. The Pin (§2.4) covers the case where she *does* know, at zero cost per capture. |
| **A destination question at capture time.** S3 leaves the fast path. | Two of the three answers ("Inbox", "undecided") mean "I don't know yet", which is what the Tray is for. |
| **Any auto-write to a business table.** No auto-created task, decision, product, or FF&E line — at any confidence. | AGENTS.md: drafts land `awaiting_review`. Diverges from `sms-inbound`, which auto-applies at ≥0.8 (`pipeline.ts:574`) — deliberate, see ruling **B-09**. |
| **On-device model-based filing suggestions in v1.** No Core ML classifier, no WhisperKit, no on-device LLM. | v1's suggestions are *deterministic context matching* (pin, calendar, learned location centroid, scan binding) — free, explainable, offline, and honest. The only model in the whole direction is server-side transcript structuring, in W3. |
| **WhisperKit; iOS 26 / SpeechAnalyzer.** | 547–955 MB model, iPhone 15 Pro+/8 GB gating, new SPM dep `[D-external] §A2`; the floor is 18.0 across all 8 build configs `[D-external]`. Server re-transcription supersedes the on-device draft anyway. |
| **Background / ambient recording in v1.** No `UIBackgroundModes: [audio]`, no always-on, no geofence auto-start. | Consent exposure (§9 R-8), App Review surface, and iOS forbids *starting* a recording from the background anyway `[D-external] §D`. Revisit in W4 with evidence. |
| **A plan viewer or markup on the phone.** No PencilKit, no drawing set on device. | `[G1] §M9`. Real gap, wrong program. |
| **Video capture / walkthrough video.** | PRD puts it in the P2–P4 evidence-gated bucket `[D-rulings] §4`. |
| **Mood-board editing on the phone.** | `[D-external] §C12` flags Houzz Pro's mobile-view/desktop-edit split as a *cautionary* pattern. Direction B files a swatch *toward* a board later; it does not compose one in the field. |
| **A client-facing surface.** | PRD **O2** ("client visibility into the Binder — a share-view, or never?") is explicitly open `[D-rulings] §5`. Field notes must not pre-empt that ruling. |
| **A new "room" concept, a new "Capture Inbox", or a new "request".** | G-8/G-9/G-11. §2.2 picks the words; §7.4 picks the room. |
| **A new NestJS service; anything on Coolify.** | AGENTS.md; R108.4 → R109.1 `[D-rulings] §2`. |
| **Re-architecting the outbox, the scan rig, or the wire contracts.** | `[G1] §4` lists ten things that must not break. Direction B touches none of their internals. |

---

## 2 · Information architecture

### 2.1 The two realms stay; a third *place* appears inside the camera realm

Field's navigation is two realms with independent stacks — camera root `C1 .viewfinder`,
work root `W1 .work` — driven by `CaptureCoordinator` + `FieldRealmHistory`
(`CaptureKit/Navigation/FieldRealmHistory.swift`), with no tab bar and one `.sheet(item:)`
on the root (`RootView.swift:46-48`). **Direction B does not change this.**

What changes is the meaning of the tray handle in the bottom-right of C1
(`ViewfinderSessionHandle`, `ViewfinderScreen.swift:133`):

```
BEFORE   handle → V1 "This visit"        (visit-scoped, 4-hour window, one screen)
AFTER    handle → THE TRAY               (durable: everything unfiled, grouped by
                                          visit → day, with "This visit" on top)
```

`V1SessionTrayScreen` today builds its list from `store.session(visitID:owner:)`
(`V1SessionTrayScreen.swift:139-147`) — visit-scoped by construction, and the visit expires
after 4 hours of inactivity (`CaptureSessionContextPolicy.inactivityWindow`,
`CaptureSessionContext.swift`). **That is the wrong scope for a "file later" product**: a
thought captured on the drive home is already outside the window `[G1] §M6`. The Tray is
scoped to *unfiled*, not to *this visit*.

**Home is still the viewfinder.** The Tray is one swipe (or one tap on the handle) away.
The Work realm gains a Tray row in its attention section, so the Tray is reachable from
both realms without a tab bar.

### 2.2 Names

Naming has real rulings behind it here — several rulings exist *only* to fix collisions
(`[D-rulings] §6`, `[G1] §5`). Proposed lexicon:

| Concept | Name | Why it survives the collision audit |
|---|---|---|
| The unfiled holding place | **The Tray** (in-app) · **Field tray** (portal registry surface) · **"From the field"** (Desk population heading) | The app already calls V1 "the session tray"; the portal's noun-space is desk/document/margin/folio/ledger/shelf/spine — a tray belongs there. **Not** "Capture Inbox": I84 flags that `field_captures` and `proposal_captures` already share that name `[D-rulings] §2`. **Not** "request": three senses already ship (R98/PRD/I53). **Not** "field kit": `components/document/discovery/field-kit.tsx` is form-field primitives `[D-portal-flow] §G11`. |
| The act | **file** · states **unfiled / filed / dismissed** | Desk-and-document grammar. Pairs cleanly with the Binder (approved evidence) and the Library (kept things). |
| The session context | **the Pin** — "Pinned to Maple St · Kitchen" / "Not pinned" | Short, physical, one syllable, and it reads as provisional, which it is. |
| A filing proposal | **a suggestion**, with its **basis** always in words | Never "AI". The capability is **Designer-Taught Intelligence** in every surface (PRD §13 and `.agents/skills/patina-brand-voice/SKILL.md`) — and mostly, in v1, it isn't a model at all, so the copy names the actual reason: *"Suggested from where you were."* |

The DB keeps saying `status='inbox'`; the UI says "unfiled / in the Tray". Column values are
not user-facing copy, and this keeps us out of the I84 collision entirely.

### 2.3 Entry points

| # | Entry | Exists today? | Direction B |
|---|---|---|---|
| 1 | App icon → C1 | ✅ | unchanged; shutter armed as soon as `model.start()` resolves |
| 2 | `field://capture` | ✅ `CaptureDeepLink.swift` | unchanged |
| 3 | **App Intent** — `StartFieldNoteIntent`, `CaptureToTrayIntent` | ❌ zero `import AppIntents` in the tree `[D-delivery] §8` | **W4 step 1, no new target.** An `AppIntent` + `AppShortcutsProvider` in the *app* target gives Siri, Shortcuts, Spotlight, and — via a Shortcut binding — the **Action Button**. Note the app already fires a `settings.action_button_rebind` analytics event and O4 (`ReadyScreen`) *teaches* the Action Button: **the affordance is promised in onboarding and does not exist.** |
| 4 | **Control Center control** (iOS 18) | ❌ | **W4 step 2.** Needs a `CaptureWidgets` WidgetKit target, which needs new Ruby: `generate_project.rb` creates exactly four targets (`:28-30, :129`) and `CaptureWidgets/` is an **empty directory with zero target-generation code** `[D-field-app]`. |
| 5 | **Lock Screen widget** — "Tray · 7 unfiled", tap → Tray | ❌ | W4, same target |
| 6 | **Live Activity** — "At Maple St · 12 captured · 08:41" | attributes + controller exist (`CaptureKit/LiveActivity/CaptureSyncAttributes.swift`, `CaptureLiveActivityController`) and are driven by `LocalCaptureSyncService`, but **cannot render** — no widget target *(inference, `[D-field-app] §2`)* | W4, same target — **one target pays three debts** |
| 7 | **Share extension** — a photo texted by the GC, a URL from Safari → the Tray | ❌ `CaptureShareExtension/` is an empty directory | W4. `CaptureStore` already lives in the App Group `group.cloud.patina.field` "so the Share and Widget extensions read/write the same DB and the same on-disk media directory" (`CaptureStore.swift` header) — **the persistence side of the share extension is already built and waiting.** |
| 8 | Universal link `https://client.patina.cloud/field/{token}` (guest site request) | ✅ | untouched |
| 9 | `field://login` portal-QR sign-in | ✅ | untouched |
| 10 | **P2 "Start a visit here"** → sets the Pin, opens C1 | ❌ | W1. The highest-value *new* entry point and it costs one button. |

**Every entry point lands on the same surface** (C1, already recording or shutter-armed) and
**every one produces the same output** (an unfiled Tray item). No entry point has its own
flow. That is the property that makes W4's target work cheap: the extension only has to
mint a `Specimen` and enqueue.

### 2.4 The session/context model: the Pin

The plumbing exists. `CaptureSessionContext` carries a `CaptureRoutingMemory`
(`destination, projectID, projectName, projectRoomID, room, shelf`) resumed while the same
identity is active and within a 4-hour inactivity window
(`CaptureKit/Session/CaptureSessionContext.swift`). Today it is only ever *populated* by a
prior pass through S1, which is reachable from exactly three places, none of them the
capture path `[D-field-app] §5d`. So in practice it is always empty.

Direction B makes it the centrepiece and changes three things:

**(a) It is set from many sources, ranked, and each source names itself in words.**

| Basis | Signal | Strength | Cost |
|---|---|---|---|
| `pin` | she tapped the chip and picked | **confirmed** | free |
| `visit` | she tapped "Start a visit here" on P2 | **confirmed** | free |
| `scan` | the capture happened inside a running scan already bound to a project | **confirmed** | free — `ContextCaptureProvenance` already carries `siteScanContext.projectId` (`ContextCaptureProvenance.swift:56-63`) |
| `calendar` | an EventKit event overlapping the capture whose title or location matches a project name | suggested | needs `NSCalendarsUsageDescription` (**absent today**, `[D-delivery] §8`); on-device |
| `proximity` | the capture coordinate is within *N* m of the **learned centroid** of previously-filed captures for project X | suggested | **free, on-device, no schema, improves with use** — see (d) |
| `venue` | a GPS placemark that matches no project (a showroom, a market) | suggested *kind*, not project | free — `VenueStamp.placemarkName` already exists |
| `transcript` | the note says "in the Maple kitchen" | suggested | W3, server-side, ~$0.005/note |
| — | nothing resolves | **"Not pinned"** | — |

**(b) It never blocks.** If nothing resolves, the chip reads *"Not pinned · file later"* and
the shutter behaves identically. This is the R108.5 discipline — degrade honestly, never
block, never silently drop `[D-rulings] §2`.

**(c) Confirmed ≠ suggested, visually and in the data.** A *confirmed* pin renders solid
("Maple St · Kitchen"); a *suggested* pin renders as a question with a one-tap accept
("Maple St? · tap to pin"). A capture taken under a suggested pin is stored with
`suggested_project_id`, **not** `project_id`. A capture taken under a confirmed pin is
stored with both. **The distinction is the whole honesty contract of this direction** and it
is what stops a wrong guess from quietly becoming a wrong record.

**(d) The learned centroid is the cheap magic.** `projects.site_address` exists
(`00136_proposal_project_site_address.sql:17`) but is free-form `TEXT`, nullable, never
backfilled, and there is **no lat/lng anywhere on `projects`** — so "GPS → project" would
need geocoding or new columns. Instead: every time a capture is *filed* to project X, the
device remembers the capture's coordinate against X in the local `CaptureProjectRef` cache
(`CaptureKit/Domain/Specimen.swift:224` — today only `id/remoteId/name/createdAt/owner`;
additive `@Model` properties migrate lightweight, `[T1] §5.3`). Next visit, proximity to that
centroid suggests X. Zero schema on `projects`, zero geocoding, zero network, works in a
basement, and it is *explainable* — "you filed 9 captures to Maple St from right here."

**(e) The 4-hour window becomes a prompt, not a silent reset.** Today the routing memory
evaporates and nothing says so. Proposed: after the window, the chip reads *"Still at Maple
St?"* with Yes / New pin / Not pinned. `CaptureSessionContextPolicy.resolve` already has the
exact seam (`CaptureSessionContext.swift`) — it currently returns a fresh context; it would
return a *stale-but-offerable* one.

### 2.5 Offline posture

The transactional layer is genuinely excellent and Direction B changes none of it: enqueue
never touches the network, drains are per-owner serialized and revalidate `activeOwner` at
every await boundary, media lives in the App Group, `clientToken` is device-stable, upsert
makes media replay free, `commit_field_capture` is idempotent on `p_client_capture_id`, and
`CaptureTransferPhase.complete` is impossible without a receipt `[G1] §4`.

Five additions, all of which `[G1]` and `[T1]` independently identify:

1. **Render `OfflineQueueBanner`.** It is dead code — referenced only inside its own
   `#Preview` at `Features/Resilience/OfflineQueueBanner.swift:83-84`. Nothing on the camera
   surface tells her she is offline and queuing.
2. **Add an `NWPathMonitor`.** `grep -rn "NWPathMonitor" apps/mobile/Capture` → **zero
   hits**. Regained connectivity never auto-drains. Wire it to `sync.drain()` +
   `siteScan.resumePendingUploads(retryFailures: false)`.
3. **Filing must work offline too** — otherwise Direction B has only moved the blocking
   network call later. Filing writes to the local record and enqueues; the
   `file_field_capture` RPC fires on drain. The Tray shows "filed · syncing".
4. **Cache the project + `project_rooms` list** into the extended `CaptureProjectRef` on
   every successful W1/P1 fetch, so the filing picker works from a parking garage. Today
   S1's pickers need `projectsService.projectDetail(id:)` and offline they degrade to a
   banner with the FF&E menu disabled — "the offline capture is exactly the one that can't
   be placed" `[D-field-app] §8`.
5. **Suggestions are computed on device at capture time**, so they exist offline. This is a
   direct consequence of §1.2's refusal to use a model for filing suggestions in v1.

---

## 3 · The eight flows

Tap counts are counted the way `[D-field-app] §8` counts them (a press-and-hold is called
out separately). Timing targets are proposals.

Baseline for comparison, from `[D-field-app] §8`: *photo + voice note, into a project* costs
**≈7 taps + 1 press-and-hold and still has no project**; attaching one costs **~6 more taps
plus a network round-trip**, and re-routes one record.

---

### F1 · One-tap photo into the Tray

**Target: 1 tap · ≤1.5 s from armed shutter · ≤2.5 s from a cold app.**

| # | Hands | System | File |
|---|---|---|---|
| — | opens the app (or presses the Action Button, W4) | C1 live, shutter armed, Pin chip resolved from §2.4 | `ViewfinderScreen.swift`, `ViewfinderModel.start()` |
| **1** | **taps the shutter** | HEIC written to `<AppGroup>/CaptureMedia/`; `Specimen` minted with owner + `captureSessionID` + `VenueStamp` + the Pin snapshot + `suggestion{project, room, kind, basis, confidence}`; enqueued | `ViewfinderModel.pressEnded → captureSingle()` (`:187-232`), `LocalCaptureSyncService.enqueue()` |
| — | — | **thumbnail flies to the Tray handle**, handle count ticks, viewfinder stays live. **No card, no sheet, no terminal screen.** | new `CaptureFlightToast` replacing the `CaptureCardOverlay` gate |
| — | — | on signal: photos upsert-uploaded to `capture-media/<uid>/<clientToken>/`, then `commit_field_capture(p_destination:'inbox', …)` | `LocalCaptureSyncService.commit()` |
| — | — | server: `field_captures` row, `status='inbox'`, **now carrying `project_id`** (needs migration `00515`, §7.2) | `00235_commit_field_capture_rpc.sql` |

**Lands in the portal at:** the Desk, inside the **"From the field"** population — new
component `components/document/field/field-tray-card.tsx`, modelled on
`components/document/field/sms-review-card.tsx`, fed by a new
`packages/supabase/src/hooks/use-field-tray.ts::useFieldTray()`. Photos render through the
new `useCaptureMediaUrls` signed-URL hook (§6.1). Once filed to a project it also appears in
that document's margin via the new `field_capture` branch of the `margin_items` view (§6.4).

**Removed from this flow:** C3's guess card (which showed a hardcoded literal), S3's
destination question, S4/S5's terminal screens. **Removed from the fast path: 6 taps.**

---

### F2 · Walk-and-talk voice note, no photo

**Target: 1 press-and-hold for a quick note · 2 taps for a long one · ≤300 ms to recording.**

Today this is *impossible*: every enrichment sheet is keyed to a `Specimen` UUID —
`.voice(UUID)`, `.measure(UUID)`, `.ocr(UUID)`, `.code(UUID)`
(`CaptureKit/Navigation/CaptureNavigation.swift:45-58`) — so a specimen must exist first.
The only sheet-free voice entry in the entire app is *inside a running site scan*
`[G1] §O3`. `ContextCaptureService` already proves a media-less specimen commits fine.

| # | Hands | System | File |
|---|---|---|---|
| **1a** | **press-and-holds the mic button** (new, left of the shutter) | media-less `Specimen(captureKind: .note)` minted with the Pin snapshot; `AVAudioEngine` starts; **`AVAudioFile` opens and writes from the same tap** (§5.1); `SFSpeechRecognizer` streams a live draft | new mic control in `ViewfinderControls.swift`; `SpeechVoiceNoteService.swift` |
| — | speaks; releases | recognition finalises; note enqueued; thumbnail (a waveform glyph) flies to the Tray | |
| **1b** | *or* **taps** the mic button | opens the **C7 recording overlay** in-viewfinder (sibling of `ViewfinderMultiShotOverlay`) — elapsed time, live transcript, waveform, Pause, **Stop** | new `ViewfinderRecordingOverlay` |
| **2** | taps **Stop** | as above | |

**Lands in the portal at:** the same Desk card, with an **inline audio player** (signed URL
from `capture-media`) plus the transcript. From W3 it also carries per-item proposals
(§5.4). Once filed against a project it can become a `margin_notes` row — the surface built
for "≤5 seconds — one tap, type, save" (`components/document/margin-rail.tsx:386-421`),
which **iOS has never written to** (`project_tasks`, `margin_notes`, `delivery_events`, and
`discovery` are absent from Field's entire PostgREST surface, `[G1] §2.0`).

---

### F3 · Pin a visit

**Target: 1 tap to accept a suggestion · 2 taps to pick one cold · once per visit.**

| # | Hands | System |
|---|---|---|
| — | arrives on site | proximity/calendar resolve a **suggestion**; chip reads *"Maple St? · tap to pin"* |
| **1** | taps the chip | pin confirmed; chip goes solid *"Maple St"*; every subsequent capture this visit carries a **confirmed** project |
| *(1b)* | *or* taps the chip when nothing resolved → the **Filing sheet in pin mode** (repurposed `S1AssignVenueScreen`, 490 lines of working project / `project_rooms` / FF&E-slot / shelf picker that is currently orphaned) | |
| **2** | picks a project (+ optionally a room) | as above; the room narrows every capture to `project_rooms` |

**Alternative entry:** P2 project detail → **"Start a visit here"** (new button) sets the pin
and opens C1. `ProjectDetailScreen.swift` already has the project in hand.

**Portal side:** none. The Pin is device state; its effect shows up as
`field_captures.project_id` on everything captured after it.

---

### F4 · End-of-visit filing sweep, in the Tray

**Target: 1 tap to file a whole pinned visit · 2 taps per item to override · ≤30 s for 12 items.**

| # | Hands | System | File |
|---|---|---|---|
| — | taps the Tray handle (or swipes up on C1) | **The Tray** opens: "This visit · Maple St · 12 unfiled" on top, older unfiled groups below | rebuilt `V1SessionTrayScreen` |
| — | — | each row shows its **suggested filing in words** with its basis: *"→ Maple St · Kitchen — you pinned this visit"* / *"→ Library — a market venue"* / *"→ Maple St — suggested from where you were"* | |
| **1** | taps **"File all 12 to Maple St"** in the footer | `sync.routeAll(ids, …)` — the bulk contract that **already exists and is tested** (`CaptureSyncService.routeAll`, `CaptureLifecycleTests.sendAllUsesThePerRecordRouteContract`) but which the V1 footer does not call: `V1SessionTrayScreen.swift:126` routes `items.first` only | `V1SessionTrayScreen.swift:126` |
| *(2)* | *or* per row: swipe/tap **Change** → the Filing sheet | project / room / shelf / FF&E slot / "what does this become" | `S1AssignVenueScreen` + a repurposed `S3DestinationScreen` |
| *(2)* | *or* per row: **Dismiss** | `dismiss_field_capture` — shipped, zero web callers | `00235:348` |

**Landing, by "what does this become":**

| Choice | Server | Portal surface it appears on |
|---|---|---|
| **Library product** | `route_field_capture` → `commit_field_capture('library')` → `products(layer='personal', capture_source='field_capture')` | `/library` My Library shelf (`components/document/rooms/library/library-room.tsx`) |
| **Project photo / site record** | new `file_field_capture` (§7.3): stamps `project_id`/`project_room_id`, `status='filed'`, **no product minted** | Desk card clears; margin `field_capture` item on `/doc/[id]`; project Field-tray block |
| **FF&E line** | `place_product_in_project` — the existing independently-retryable second step with lookup-before-write idempotency on `project_ffe_specs.routing_source->>captureId` | `ffe-section.tsx` / `line-unfold.tsx` |
| **Note / margin note** | W3: `confirm_field_note_draft` → `margin_notes` | `margin-rail.tsx`, escalatable via the shipped `useEscalateNoteToDecision` / `useEscalateNoteToScopeChange` |
| **Task / decision** | W3: `confirm_field_note_draft` → `project_tasks` / `client_decisions` | `coordination/coordination-work.tsx`; Desk `task_due` / `overdue_decision` need kinds |

---

### F5 · Portal triage — filing from the Desk

**Target: 1 click per item · zero context switches.**

| # | Hands | System | File |
|---|---|---|---|
| — | opens `/desk` | **"From the field"** population renders unfiled captures as cards | new population beside `FieldDesk` (`desk/page.tsx:376` mounts `StudioPulse`) |
| — | — | each card: photo/audio, venue + time, transcript, and **the suggestion in words** with an Accept | `field-tray-card.tsx`, modelled on `sms-review-card.tsx` |
| **1** | clicks **File to Maple St · Kitchen** | `useFileFieldCapture()` → `file_field_capture` RPC | `use-field-tray.ts` |
| *(1)* | or **Change** → a small project/room picker (`useDocumentRooms`) | | `hooks/use-document-rooms.ts` |
| *(1)* | or **Dismiss** → `dismiss_field_capture` | | |

An assistant can do all of this **only if** the Tray is studio-scoped — ruling **B-05**,
which is load-bearing for Direction B specifically because "the designer *or an assistant*
files items" is in the program brief. Today `field_captures` RLS is owner + org-inbox-SELECT
(`00233:154-188`), while `room_files` delegates to the broader scan visibility (00341): a
studio co-member sees a scan's drawings and an **empty** capture list — flagged in-code as
an unfixed P2 `[D-portal-flow] §G6`. And the `capture-media` object policies gate on
`auth.uid()::text = foldername[1]` only (`00234:41-67`), so a studio-wide Tray needs a
**`storage.objects` policy owned by `supabase_storage_admin` — a platform-admin phase
migration, not an ordinary one** (`00483` header). Sequence the ruling before the schema.

---

### F6 · A spoken note becomes work (W3)

**Target: 1 tap per proposed item · nothing auto-applies.**

| # | Hands | System | File |
|---|---|---|---|
| — | (server, minutes earlier) | `transcribe-field-note` cron sweep → server transcript; `enqueue_agent_task('field_note.structure', …)`; `structure-field-note` claims it → Claude Haiku 4.5 forced tool use → `field_note_drafts` rows at `state='proposed'` | `[T1] §3` |
| — | opens the Desk card (or **N6** in-app) | each proposed item shows kind icon, title, and **the verbatim quote it came from** | `field_note_drafts.source_quote` |
| **1** | taps **Keep** on *"Swap the powder-room faucet"* | `confirm_field_note_draft` → `project_tasks` row | `[T1] §2.4` |
| **1** | taps **Keep** on *"Alcove ≈ 42¾″"* | writes a **`margin_notes` row that says the number**, tagged as spoken — **never** `room_file_measurements`, never `tolerance_class='verified'`. R108.1 (typed anchors only) + R114.1 (two-tier trust) both forbid a spoken number becoming a measured record `[D-rulings] §2`. Ruling **B-12**. |
| **1** | taps **Dismiss** on the rest | `dismiss_field_note_draft` | |

---

### F7 · Site scan — unchanged instrument, new filing

**Target: unchanged capture · project becomes optional · scans join the Tray.**

The scan rig is world-class and Direction B touches none of its internals `[G1] §4.1-4.2`.
Two changes at the edges:

1. **F1 Scan setup's project pick becomes optional.** `CaptureRoute.siteScan(projectID: String?, projectRoomID: String?)` already takes optionals
   (`CaptureNavigation.swift:40`) and `SupabaseSiteScanService` already upserts a `rooms` row
   when none was picked. An unbound scan uploads, produces a Room File, and appears in the
   Tray as an unfiled item; filing writes `room_scans.project_id` — a column Field already
   writes at upload time (`00265_room_scans_project_linkage.sql`; note the README's "00258"
   is stale `[D-field-app] §5b`). *(Needs verification that an owner-side PATCH of
   `project_id` passes `room_scans_guard_routing` post-upload.)*
2. **Mid-scan context captures inherit the Pin** and land in the same Tray, alongside
   everything else — instead of only being findable through the flag-gated Room File's
   capture-context list, which is `field_captures`' **only** portal reader today
   (`use-room-files.ts:378`) `[G1] §O4`.

**Lands in the portal at:** `/rooms` and `/room/[id]` (already work for designer-owned
scans, via `useRoomRoster` → `room_scan_documents`), the Room File at `/room/[id]/file`
(flag `room-file`), and — new — **`/doc/[id]` itself**, by mounting the complete, tested,
**unmounted** `components/room-file/room-files-section.tsx` (`RoomFilesSection`) whose only
consumer disappeared in the R21 dissolve `[D-portal-flow] §G3`. *A designer literally cannot
attach her own site scan to her own project's document today* — both attach points filter to
**client-owned** scans (`letterhead-instruments.tsx:87-95`; `use-room-scans.ts:185-214`).

---

### F8 · Market run — 30 specimens, one filing pass

**Target: 1 tap per specimen while walking · 1 tap at the end for the lot.**

| # | Hands | System |
|---|---|---|
| — | arrives at High Point | no project resolves; the chip reads *"High Point · Showroom 214"* from `VenueStamp.placemarkName`, and the **kind** suggestion is `Library product` (a venue that matches no project) |
| — | *(optional)* taps the chip → **"Everything here → Library"** | a *filing default* on the Pin, not a per-capture question |
| **1–30** | shutter, shutter, shutter; occasional press-and-hold for a burst (C4, exists); occasional tap-mode for a tag (N1 OCR) or barcode (N2) | 30 unfiled items, all offline-safe |
| **31** | end of day, Tray → **"File all 30 to Library"** | `routeAll` |

**What this preserves:** today, *after* a prior S1 pass has seeded routing memory, C3's Save
routes in one tap. Direction B keeps that one-tap economy — it just moves the decision from
"a screen you have to pass through" to "a property of the visit you set once, or never".

**What still doesn't work, and is out of scope:** U2 library search is device-local only
(`LibrarySearchScreen` → `store.search`), so the "is this already in my library?" dedupe
promise covers only this phone's captures; N2's catalog lookup is a **2-row hardcoded
dictionary with no network** (`DataScannerCodeService.swift:28-45`); there is **no lead-time
field** anywhere on the payload, the Specimen, or `field_captures`; and
`products.capture_source` is never rendered, so a market find is indistinguishable from a
pasted URL `[G1] §M3`.

---

## 4 · Screens

Reusing Field's existing screen vocabulary by name. `CaptureScreenID` has **71 cases**
(the file's own header still says 51 — stale, `CaptureScreenID.swift:5`), and
`CaptureRoute`/`CaptureSheet` carry an explicit freeze comment: *"Changing a case is a
foundation-owner-only edit"* (`CaptureNavigation.swift:4-6`). Direction B needs a handful of
such edits; §8.4 says do them **once, at the top of W1**.

### 4.1 Delta summary

| | Screen | Verdict |
|---|---|---|
| C1 | Viewfinder | **modified** — Pin chip, mic button, Tray handle, offline banner |
| C3 | Quick-confirm card | **demoted** — from a gate to a 1.2 s flight toast |
| C4 | Multi-shot overlay | unchanged |
| C5 | Specimen sheet | **re-homed** — optional detail surface reached from the Tray/V3, never the fast path |
| C7 | **Recording overlay** | **NEW** (in-viewfinder, sibling of C4) |
| N1/N2/N3/N5 | Enrichment sheets | unchanged; reachable from C5/V3 |
| N4 | Voice note sheet | **modified** — long-form recording surface |
| N6 | **Note review** | **NEW** (W3) |
| I1 | **The Tray** | **rebuild of V1** — durable, grouped, suggested filing, bulk file |
| S1 | Assign & venue | **repurposed** as the **Filing sheet** *and* the **Pin picker** |
| S2 | Create project | unchanged (inline project creation from the Filing sheet) |
| S3 | Destination | **repurposed** as "what does this become" *inside* filing |
| S4/S5 | Saved / Inbox terminals | **retired from the fast path** (kept in the enum through W1; delete in W2 once telemetry shows zero reach) |
| V2 | Cull deck | unchanged — already calls `routeAll` (`V2CullDeckScreen.swift:238`) |
| V3 | Specimen detail | **modified** — carries the suggestion + Accept/Change/Dismiss |
| U1 | Sync status | unchanged (already lists outbox rows *and* durable scan uploads — the precedent for the Tray's unioned list) |
| W1 | Work dashboard | **modified** — a "Tray · N unfiled" attention row |
| P2 | Project detail | **modified** — "Start a visit here" + "Tray · N from this project" |
| F1–F4 | Site scan | **modified at the edges only** (§F7) |
| R1 | `LowLightTorchOverlay` | **delete** — preview-only dead code (`:122`); C1's real low-light UI is `ViewfinderNightChip`/`TorchPill`/`LowLightHint` |
| R4 | `OfflineQueueBanner` | **un-retire** — preview-only dead code (`:83-84`), *render it* |
| — | `FieldPlaceholderScreen` | **delete** — zero references |
| F1.context | Reference capture (non-Pro) | **modified** — inherits the Pin; **and fix its accessibility id `screen.F1.context`, which is not a `CaptureScreenID` case** and is therefore invisible to `capture-shots.sh` and the `-CaptureScreen` harness `[D-field-app] §6`. It also carries 3 ESCALATE-class placeholder strings (`SiteScanContextCapture.swift:261,264,267`). |

### 4.2 Wireframes

---

#### C1 · Viewfinder (modified)

```
┌──────────────────────────────────────────────┐
│ ⟨WORK⟩                              ⟨NIGHT⟩  │  top bar — unchanged structure
│ ┌──────────────────────────────┐    ⟨ TORCH ⟩│  (ViewfinderScreen.swift:104-116)
│ │ ◉  Maple St · Kitchen        │             │  ← THE PIN CHIP (replaces
│ └──────────────────────────────┘             │    ViewfinderVenueChip)
│                                              │
│                                              │
│              L I V E   F E E D               │  liveFeed + ViewfinderFramingGuides
│              (framing guides)                │  unchanged
│                                              │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ ⚠ No signal · saving on device · 7 held│  │  ← R4 OfflineQueueBanner, RENDERED
│  └────────────────────────────────────────┘  │    (dead code today)
│                                              │
│              ── level ──                     │  ViewfinderLevelReadout
│        PHOTO   TAG   MEASURE   SCAN          │  ViewfinderModeSelector (unchanged —
│                                              │   no 5th mode; voice is a button)
│   ⚙ ▦        ◉ mic      ( ● )      ▤ 12      │  ← mic button is NEW, left of shutter
│  cluster                shutter   Tray handle│    Tray handle count = UNFILED, not
│                                              │    just this-visit
│        Tap to capture · hold for more        │
└──────────────────────────────────────────────┘
```

- **Primary action:** the shutter. One tap = one capture. Nothing opens.
- **Secondary:** mic (hold = quick note, tap = C7); Tray handle (tap or swipe-up = the Tray);
  Pin chip (tap = Filing sheet in pin mode); WORK pill (realm switch, unchanged); torch/grid.
- **Pin chip states:**
  - *confirmed* — solid fill, `◉ Maple St · Kitchen`
  - *suggested* — outline + question mark, `○ Maple St? · tap to pin`, with the basis on a
    second line in mono micro-caps: `FROM WHERE YOU ARE` / `FROM YOUR CALENDAR`
  - *venue only* — `○ High Point · Showroom 214` (a place, not a project)
  - *unpinned* — `○ Not pinned · file later` — **calm, not an error**
- **Offline:** the banner appears above the level readout and never covers the shutter
  (R1's original rule: *never block the shutter*).
- **Syncing:** the Tray handle count carries a thin progress hairline; no modal, ever.
- **Camera denied:** unchanged (`CameraAccessDeniedNotice`) — plus the mic button stays
  live, because a voice note needs no camera.

---

#### C3 · Capture flight toast (replaces the gate card)

```
                     ┌───────────────────┐
                     │ ▣  → Maple St     │   1.2 s, then it flies to the handle
                     │    Undo           │
                     └───────────────────┘
```

- Bottom-centre, above the shutter, over the *live* feed (not a frozen frame).
- Shows the thumbnail and the **suggested destination in three words**.
- One secondary action: **Undo** (deletes the draft). No Save, no Add detail, no guesses.
- **The two guess rows are gone from the fast path** — because they were a hardcoded
  literal (`ViewfinderModel.applySmartGuess:409-419` stamps every photo `seating`@0.72 /
  `Oak / bouclé`@0.6 with `ProvenanceSource.smartGuess`, and those values ride
  `payload.guesses`/`provenance` into `products.capture_provenance`). W0 replaces the
  literal with the real `HeuristicSmartGuessService`, which already exists and is
  Simulator-safe; the real guess then surfaces in the Tray, where it can be confirmed.
- **"Add detail"** does not vanish — it moves to the Tray row and to V3.

---

#### C7 · Recording overlay (NEW, in-viewfinder)

```
┌──────────────────────────────────────────────┐
│                                        ✕     │  cancel (discards, confirms first)
│           ◉ RECORDING · 01:14                │  ← unmissable; red dot + mono clock
│                                              │
│      ▁▃▅▇▅▃▁▂▄▆▇▆▄▂▁▃▅▇▅▃▁                   │  live waveform from the same tap
│                                              │
│   "…and the alcove is about forty-two and    │  live SFSpeechRecognizer draft,
│    three quarters, we need to swap that      │  scrolling, italic, dimmed —
│    powder room faucet…"                      │  labelled DRAFT
│                                              │
│   ○ Solo note      ● Conversation            │  ← consent posture (§5.5)
│     "Everyone here knows this is recorded"   │    shown only for Conversation
│                                              │
│   ◉ Maple St · Kitchen         seg 2 of 24   │  pin + segment counter
│                                              │
│        ⏸ Pause              ⏹  STOP          │
└──────────────────────────────────────────────┘
```

- **Primary:** STOP. **Secondary:** Pause/Resume, Cancel, solo/conversation toggle.
- **States:**
  - *recording* — as drawn
  - *paused* — clock frozen, waveform flat, "Paused · tap to resume"
  - *interrupted* (call/Siri/alarm) — "Held for a call · your note is safe · Resume"; the
    audio file closes and segment N+1 opens on resume (§5.3)
  - *recognizer unavailable* (always on Simulator; sometimes on device) — the transcript
    pane is replaced by "We'll write this up when it lands" and **recording continues**.
    This inverts today's all-or-nothing behaviour (§5.6).
  - *audio write failed* (disk full / no App Group) — "Keeping the words only" + recording
    continues transcript-only. Never blocks.
  - *cap reached* (20 min) — "Note ended at 20:00", saved, honest.

---

#### I1 · The Tray (rebuild of V1)

```
┌──────────────────────────────────────────────┐
│  ‹ Camera            The Tray      End visit │
│                                              │
│  19 unfiled                                  │  ← honest headline count
│                                              │
│  THIS VISIT · MAPLE ST · 12                  │  ← group header
│  ┌────────────────────────────────────────┐  │
│  │ ▣  4:12p  photo                        │  │
│  │    → Maple St · Kitchen                │  │  suggestion, in words
│  │    YOU PINNED THIS VISIT          [✓]  │  │  basis + one-tap accept
│  ├────────────────────────────────────────┤  │
│  │ ◉  4:07p  note · 1:48   ▶              │  │  inline playback
│  │    "…swap that powder room faucet…"    │  │  transcript preview
│  │    → Maple St · 2 items to keep    [✓] │  │  W3: extracted items
│  ├────────────────────────────────────────┤  │
│  │ ⬡  3:51p  scan · Kitchen               │  │  a scan is a Tray item too
│  │    → not filed          UNVERIFIED [✓] │  │  (<3 anchors, R108.5)
│  └────────────────────────────────────────┘  │
│                                              │
│  TUESDAY · HIGH POINT · 7                    │  ← older, still unfiled
│  ┌────────────────────────────────────────┐  │
│  │ ▣ ▣ ▣  7 captures  → Library      [✓]  │  │  collapsed group
│  └────────────────────────────────────────┘  │
│                                              │
├──────────────────────────────────────────────┤
│   Review each          File all 12 →         │  ← footer, `routeAll`
└──────────────────────────────────────────────┘
```

- **Layout regions:** header (count + End visit) · scrolling grouped list · sticky footer.
  Grouping: **this visit** → **by day + pin**, newest first. This is `V1SessionTrayScreen`'s
  existing `groups` computed property (`:21-29`) widened from visit-scope to unfiled-scope.
- **Primary action:** the footer's **File all N** — the one-line fix that finally calls
  `sync.routeAll` (today `:126` opens S1 for `items.first`).
- **Secondary per row:** `[✓]` accept the suggestion · tap the row → V3 (change / add
  detail / dismiss) · swipe → Dismiss.
- **States:**
  - *empty* — `PatinaEmptyState(icon: "tray", …)` reworded: **"Nothing waiting. Everything's
    filed."** (today: "Nothing captured yet.")
  - *offline* — footer reads **"File all 12 — will sync"**; filing is local + enqueued
  - *syncing* — per-row hairline; `RouteStatusChip` already exists for this
  - *needs review* — a row that failed to commit is `rejected` (review-gated, excluded from
    bulk drain — existing, correct behaviour) and renders with a rust tab + "Needs your hand"
  - *filing debt* — if anything is >7 days unfiled, a single quiet line under the headline:
    **"7 from last week are still waiting."** One line. Never a badge, never a nag modal
    (R94: notes recede; R95: no counts-as-dashboards).
- **What it must NOT become:** a landfill. §9 R-1 treats this as the direction's chief risk
  and §9's mitigation list is part of the design, not an afterthought.

---

#### S1 · Filing sheet (repurposed Assign & venue)

Two modes over one 490-line screen that already works and is currently orphaned
(`S1AssignVenueScreen.swift`; `grep "present(.assignVenue"` → 3 call sites, none in the
capture path).

```
┌──────────────────────────────────────────────┐
│  Cancel        File 12 captures        Done  │  ← FILING mode (or "Pin this visit")
│                                              │
│  PROJECT                                     │
│  ┌────────────────────────────────────────┐  │
│  │ Maple St Residence                  ⌄  │  │  existing project menu +
│  └────────────────────────────────────────┘  │  "Create a project" → S2
│                                              │
│  ROOM                                        │
│  ┌────────────────────────────────────────┐  │
│  │ Kitchen                             ⌄  │  │  project_rooms (FF&E rooms)
│  └────────────────────────────────────────┘  │
│                                              │
│  WHAT DOES THIS BECOME                       │  ← the repurposed S3 question,
│  ( Site record ) ( Library ) ( FF&E line )   │    asked HERE, once, for N items
│                                              │
│  SHELF (optional)                            │
│  ┌────────────────────────────────────────┐  │
│  │ Seating · maybe                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ⚠ Project rooms are unavailable offline.    │  existing offline degrade —
│    These can still be filed to the project.  │  now honest instead of blocking
└──────────────────────────────────────────────┘
```

- **Pin mode:** same picker, header reads *"Pin this visit"*, and Done writes
  `CaptureRoutingMemory` instead of filing anything.
- **Offline:** the project list comes from the extended `CaptureProjectRef` cache (§2.5.4),
  so the project menu works; the room menu degrades with the existing banner.

---

#### N6 · Note review (NEW, W3)

```
┌──────────────────────────────────────────────┐
│  ‹ Tray         Maple St · 4:07p             │
│  ▶ ────────────●────────────── 1:48          │  audio scrubber
│                                              │
│  "…and the alcove is about forty-two and     │  full transcript, tappable to
│   three quarters. We need to swap that       │  seek. Server transcript if
│   powder room faucet before the walk."       │  present, marked.
│                                              │
│  2 THINGS TO KEEP                            │
│  ┌────────────────────────────────────────┐  │
│  │ ☑ TASK  Swap the powder-room faucet    │  │
│  │   "we need to swap that powder room…"  │  │  ← the verbatim quote, always
│  │   No owner · no date            Keep ✓ │  │  ← flag, don't fill
│  ├────────────────────────────────────────┤  │
│  │ ☐ NOTE  Alcove ≈ 42¾″                  │  │
│  │   "the alcove is about forty-two and…" │  │
│  │   SPOKEN — not a measured record  Keep │  │  ← R108.1 / R114.1, in the UI
│  └────────────────────────────────────────┘  │
│                                              │
│  Keep both            Dismiss the rest       │
└──────────────────────────────────────────────┘
```

- **States:** *transcribing* ("Still listening to this one" — never a spinner-forever,
  PRD FR-10) · *nothing found* ("Just a note." — the correct and common outcome) ·
  *transcription failed* (audio + device draft still fully usable).
- Copy never says "AI" (G-12).

---

#### Portal · The Desk card (`field-tray-card.tsx`)

```
 ┌─ FROM THE FIELD · UNFILED ───┐            ← status tab, golden-hour accent,
 ┌──────────────────────────────┴──────────┐   the SmsReviewCard idiom exactly
 │  ▣ ▣        ▶ ──────── 1:48             │
 │                                          │
 │  "…swap that powder room faucet before   │   font-heading italic — the
 │   the walk."                             │   SmsReviewCard quote treatment
 │                                          │
 │  Tue 4:07p · Maple St · 2 photos         │
 │                                          │
 │  ─────────────────────────────────────   │
 │  WE THINK THIS GOES                      │
 │  Maple St Residence · Kitchen            │
 │  Suggested from where you were           │   ← the basis, in words. Never "AI".
 │                                          │
 │  [ File it ]   [ Change ]   [ Dismiss ]  │   act lives on the card (Desk law)
 └──────────────────────────────────────────┘
```

- Direct lift of `components/document/field/sms-review-card.tsx`'s structure: status tab,
  paper face, quote in `font-heading` italic, a "proposed effect" band, then the acts.
- **States:** *unfiled* (as drawn) · *needs your hand* (no suggestion resolved — the
  "Change" picker is primary) · *syncing* (a capture still uploading: greyed, "still coming
  in from the phone") · *transcribing* · *filed* (card leaves the population).

---

## 5 · Voice notes in this direction

### 5.1 The one-file bug fix that is most of the value

`Capture/Services/Recognition/SpeechVoiceNoteService.swift:22-23` declares
`private let mediaDirectory: URL?` and `private var audioFilename: String?`.
`mediaDirectory` is stored in `init` and **never read**; `audioFilename` is **only ever
read**, at `:107`, and assigned nowhere. Its own header comment — *"The raw audio file is
always kept alongside the text"* — is false, which is why two discovery reports believed it
`[G1] §0.1`, `[T1] §0`. `grep -rn "AVAudioFile\|AVAudioRecorder" apps/mobile/Capture
--include="*.swift"` returns **zero hits**. **No audio has ever left a Field device.**

All three call sites already pass a real directory (`RecognitionScreens.swift:64`,
`SiteScanHostScreen.swift:212`, `SiteScanContextCapture.swift:237` all pass
`container.store.mediaDirectory()`), and the entire downstream chain is built and waiting:
`VoiceNoteResult.audioFilename` → `Specimen.voiceAudioFilename` →
`FieldCapturePayload.voice.audioPath` → `LocalCaptureSyncService.uploadMedia`'s voice branch
→ `mimeType`'s four audio cases → `capture-media`'s `audio/mp4, audio/x-m4a, audio/aac,
audio/wav` allow-list (`00234:26-29`) → `commit_field_capture`'s `voice.audioPath` read →
`field_captures.voice_audio_path` (`00233:69`). And
`CaptureStore.missingRequiredMedia(for:)` **already treats `voiceAudioFilename` as required
media** — dead code that becomes live and correct the moment the writer lands.

**The sharper consequence, and why this is not merely a nice-to-have:**
`SiteScanContextCapture.stopVoice` gates on `!transcript.isEmpty || result.audioFilename != nil`
(`:129`). With `audioFilename` permanently nil, **a voice note that transcribes to nothing on
a noisy job site is silently discarded** with the toast "Nothing recorded". She spoke;
nothing was kept; nothing can be recovered. That is a live violation of the honesty law the
house has ruled four separate ways (R108.5, R110/FR-10, R113, R114.1) `[G1] §0.1`.

**PROPOSED:** write the file from the *existing* `AVAudioEngine` input tap
(`SpeechVoiceNoteService.swift:74-76`) via `AVAudioFile` — AAC-LC, `.m4a`, mono, 32 kbps
≈ **240 KB/min**. No second `AVAudioSession`, no `AVAudioRecorder`, zero downstream change.
`[T1] §1.2` gives the exact code shape.

Also in the same file: **`requiresOnDeviceRecognition` is never set anywhere**, so despite
the shipped permission string *"Transcribes your voice notes on-device"*
(`generate_project.rb:87`) recognition may be going to Apple's servers — a
permission-string/behaviour mismatch with privacy consequences. Set it from
`recognizer.supportsOnDeviceRecognition` and record which path ran.

### 5.2 The audio is the record; the transcript is a derived draft

This is R114.1's two-tier trust, applied verbatim `[D-rulings] §2`:

| | Kept | Authority |
|---|---|---|
| the `.m4a` | always, first | **the record** |
| the on-device `SFSpeechRecognizer` draft | immediately | *orientation only*, labelled DRAFT |
| the server transcript (W2) | minutes later | **the transcript of record** — lands in a **new** `server_transcript` column; `voice_transcript` is never overwritten |
| the designer's edit | whenever she makes one | **wins over both** — `transcript_edited_at` stops a later server transcript from clobbering her words; she is offered "a clearer read is available", one tap to view, one to accept |

### 5.3 Rotation, not truncation

`SFSpeechRecognizer` caps at roughly **one minute of audio per request** (~1,000
requests/device/hour) `[D-external] §A1`, and today's code installs **one request for the
whole session**. Hold-to-talk rarely hit it; a walk-and-talk note hits it every time.

**PROPOSED:** rotate the recognition request every ~50 s, appending each finalised
`bestTranscription.formattedString`; **do not rotate the `AVAudioFile`** — the audio stays
one continuous file per note. Boundary word-loss in the draft is acceptable precisely
because the server transcript repairs it. Cap a note at 20 min / 24 segments and end
honestly ("note ended at 20:00"). Emit `voice.segment_rotated` so boundary quality can be
measured on real notes.

Interruptions (call, Siri, alarm) close the current file and open **segment N+1** — hence a
note carries an *ordered array* of audio paths, which is why
`field_captures.voice_audio_path` (a single `TEXT`, `00233:69`) needs a
`voice_audio_segments jsonb` sibling with segment 0 still in the legacy column so every
existing reader keeps working (§7.1).

### 5.4 From transcript to items (W3)

Direction B adopts `[T1] §1.10`'s design without modification, because it is already the
house pattern: `_shared/field-note-extract.ts` as a twin of the working, tested,
dependency-injectable `_shared/field-parse.ts` (Claude Haiku 4.5, forced `tool_choice`,
direct `fetch` to `api.anthropic.com`), producing `field_note_drafts` rows at
`state='proposed'`. Five mechanical anti-hallucination rules, all checkable in code without
a second model call — chief among them **every item must cite a verbatim transcript
substring** (dropped if it isn't) and **the model may never emit a uuid** (only text hints,
resolved in Postgres at confirm time under the caller's RLS).

**Direction-B-specific:** the extractor also returns a **filing hint** (`project_hint`,
`room_hint` as free text) which feeds the same suggestion slot as the deterministic sources
in §2.4, with basis `transcript`. It never wins over a *confirmed* pin.

**Nothing auto-applies at any confidence.** This diverges from `sms-inbound`, which applies
at ≥0.8 (`pipeline.ts:574`) — deliberate, because an inbound SMS reports a fact against a
*bounded set of open items the model was shown*, whereas a voice note is open-ended
authoring in the designer's own document. Ruling **B-09**.

### 5.5 Consent

No recording policy exists anywhere under `docs/` (grep for "consent" hits only SMS consent,
`project_parties.sms_consent_status`, 00281) `[T1] §1.13`. A field voice note will routinely
record other people — the client, the GC, a homeowner's family. **All-party-consent states**
(CA, IL, WA, FL, PA, MA, MD, MI, MT, NH, CT, DE, NV, OR) make surreptitious recording of a
private conversation criminal. Wisconsin is one-party; Leah's clients are not guaranteed to
be in Wisconsin.

Direction B's controls, all visible in §4.2's C7 wireframe:

1. **Never ambient.** Recording begins and ends on a deliberate act. (iOS enforces half of
   this anyway: a background trigger cannot *start* a recording `[D-external] §D`.)
2. **Solo vs Conversation, chosen at start.** A Conversation note shows a one-line
   "Everyone here knows this is being recorded" affirmation she taps. It is a nudge, not
   legal advice — but it converts an invisible act into a deliberate one.
3. **Unmissable in-app chrome** (the red dot + clock), and — once W4's widget target lands —
   a Live Activity so the recording is visible from the Lock Screen.
4. **Retention is a policy, not an accident.** `audio_retention ∈ keep |
   discard_after_transcript | 90_days`, default `90_days`, purged by a
   `field-note-media-maintenance` cron that stamps `voice_audio_purged_at` — mirroring
   `site-request-media-maintenance`'s 90-day purge of unapproved evidence (00375). Ruling
   **B-10**.
5. **Subprocessor minimisation.** Cloudflare Workers AI `whisper-large-v3-turbo`
   ($0.00051/audio-min) keeps the audio inside an account Patina already controls —
   **no new subprocessor**. Groq is the latency alternative; OpenAI/Deepgram/AssemblyAI each
   add one `[D-external] §A3`.
6. **Studio-private by default.** `margin_notes` is designer-authored, studio-visible, never
   client-visible. A confirmed field note inherits that posture; anything that would become
   client-visible is a separate, deliberate act.

### 5.6 Voice failure ladder (the honesty law, made concrete)

| Failure | Today | Direction B |
|---|---|---|
| Transcription returns nothing | **silently discarded** ("Nothing recorded") | audio kept; the Tray row says *"We couldn't make out the words — the audio is here."* |
| Recognizer unavailable / denied | typed-note fallback, **no recording** | **recording still starts**; the transcript pane says "We'll write this up when it lands"; the server transcribes it |
| Audio file won't open (disk full / no App Group) | n/a | recording continues transcript-only, `voice.audio_write_failed` event, never blocks |
| Note runs past 1 min | silently truncates or errors | segments rotate; the file is continuous |
| Offline | commits when signal returns (already good) | unchanged + `NWPathMonitor` auto-drain + the banner is finally rendered |

---

## 6 · Portal side — the minimum that closes the loop

Five pieces. Every one has a named in-repo precedent; none needs a new page.

### 6.1 Prerequisite: sign `capture-media`

`grep -rn "capture-media" apps/ packages/` (excluding `apps/mobile/Capture`) returns
**nothing** `[G1] §O5`. No web code has ever signed a URL from that bucket, so field photos
and every second of field audio are unreadable in the portal. Until this exists, **every
other surface here is cosmetic.**

**PROPOSED** `packages/supabase/src/hooks/use-capture-media.ts`:
```ts
export function useCaptureMediaUrls(paths: readonly string[], ttlSeconds = 3600)
// batched supabase.storage.from('capture-media').createSignedUrls(paths, ttl)
```
The pattern already exists twice: `letterhead-instruments.tsx:118-130` (batched
`createSignedUrls` over `room-scans`) and `useFieldMediaUrl` in `use-party-sms.ts` (MMS).
Cheapest high-value unit of work in the whole program `[D-portal-flow] §G2`.

### 6.2 Hooks: `packages/supabase/src/hooks/use-field-tray.ts`

Modelled on `use-sms-review.ts` (30 s poll, thin typed read, RLS does the scoping, a
`*Keys` object exported), registered from `packages/supabase/src/hooks/index.ts` the way
`use-sms-review` / `use-field-activity` are.

```
useFieldTray()                 // unfiled captures (+ scans, §7.5) across projects
useProjectFieldTray(projectId) // for the document's Project section
useFieldTrayItem(captureId)    // one item + signed media + drafts
useFileFieldCapture()          // NEW rpc file_field_capture  (§7.3)
useRouteFieldCapture()         // EXISTING rpc route_field_capture — zero web callers today
useDismissFieldCapture()       // EXISTING rpc dismiss_field_capture — zero web callers today
useConfirmFieldNoteDraft()     // W3
useDismissFieldNoteDraft()     // W3
```

### 6.3 Desk: the "From the field" population

A new population inside `StudioPulse` (mounted at `desk/page.tsx:376`), constructed exactly
like `useFieldDeskPopulation` + `FieldDesk` — whose own header states the law this must obey:
*"Two populations, both actionable, never KPI tiles"* (`field-desk.tsx:1-16`). The card is
§4.2's `field-tray-card.tsx`.

**Placement is a ruling (B-06).** `StudioPulse` renders a single preview sentence until
"Open pulse" is pressed — field work is one click behind a fold today `[D-portal-flow] §4.1`.
An unfiled capture **is** an act, so `[D-portal-flow] §10 rec 1` argues it should rise to
*Needs your hand*. Doing that through the normal path would need a new `NeedKind`
(`desk-derivation.ts:98-128` has 20, none field-shaped) **and** a `document_state` column —
and `document_state` has **no scan, capture, photo, or field column at all**
`[D-portal-flow] §2`. **PROPOSED: a separate population rendered above the fold**, since
three precedents exist for a non-`document_state` Desk population (`FieldDesk`,
`OpenRequestsStrip`, `DeskReconnect`) and none of them touched the view.

**Register the surface** in `lib/document/registry.tsx` — the canonical single definition
that ⌘K, the Studio Drawer and Desk Contents all read (`registry.tsx:1-20`). One new `room`
entry, `key: 'field-tray'`, aliases generous (`inbox, captures, photos, voice notes, from
the field, unfiled`).

### 6.4 The Document: margin branch + the project block

- **Margin.** Add a `field_capture` branch to the `margin_items` view. `00282_sms_core.sql`
  documents the discipline (recreate the prior body verbatim, append exactly one UNION
  branch) and its own `field_sms` branch is the byte-for-byte template — same 11 columns,
  `state` computed from a needs-attention predicate, a `payload` JSONB the rail renders.
  Then extend `lib/document/margin-derivation.ts:11-19`'s kind union. `[D-portal-flow] §10
  rec 5` and `[T1] §2.5` independently arrive at the same seam. **This is the smallest
  possible change that puts Leah's own capture in the document she is standing in.**
- **Project section.** A "From the field" block on `/doc/[id]`, which is also the natural
  place to finally **mount `RoomFilesSection`** (complete, tested, unmounted) and to union
  designer-owned scans into the Discovery `SiteScanEditor` and the letterhead "The scan"
  instrument — both of which filter to **client-owned** scans today
  (`letterhead-instruments.tsx:87-95`; `use-room-scans.ts:185-214`). All three are the same
  gap: *the designer's own field work has no home in her own document.*

### 6.5 Flags

Eight fail-closed PostHog flags already gate the portal; `room-file` and `call-sheet`
between them make **most of the existing field surface dark by default**
`[D-portal-flow] §8`. **PROPOSED: exactly one new flag, `field-tray`, and a hard commitment
that a flag-on walk happens before the slice is called done.** Project memory records at
least four shipped-behind-a-flag surfaces whose flag *has never been seen by a human* —
that is the failure mode to design against, not repeat. Ruling **B-07**.

---

## 7 · Data and back-end touchpoints

Direction B adopts `[T1]`'s architecture as its base. This section states only what is
**specific to** or **divergent from** it. Migration numbers are placeholders: filesystem max
is `00513_invoice_numbering_studio_uniqueness.sql`, with gaps at 00487/00488, 00496/00497,
00502–00509, and **00512 parked and unapplied** on
`followon/sd-caller-hardening-00512` — so prod's head is 00513 *with a hole*. **Mint from
00514 and re-verify the live ledger first** (`supabase migration list` against Strata).

### 7.1 `00514` — extend `field_captures` (adopted from `[T1] §2.1`, plus suggestion columns)

Adopt `[T1] §2.1` in full (`capture_kind`, `voice_audio_segments`, `voice_audio_sha256`,
`audio_retention`, the `server_transcript` lane, `transcript_state/attempts/error`, the
`structure_state` lane, `note_setting`, the sweep indexes, and — carried unbuilt since
R112/R113 — the **provenance GIN index** that `useScanContextCaptures`' `@>` containment
filter needs). Also restate the five existing policies `TO authenticated`, which they lack
today (`00233:154-188` default to PUBLIC; harmless because `auth.uid()` is null for anon,
but against house convention after the mood-board incident).

**Direction-B additions:**

```sql
ALTER TABLE field_captures
  -- the suggestion, always distinct from the fact (§2.4c)
  ADD COLUMN IF NOT EXISTS suggested_project_id      uuid REFERENCES projects(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_project_room_id uuid REFERENCES project_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_kind            text
    CHECK (suggested_kind IS NULL OR suggested_kind IN ('site_record','library','ffe','note')),
  ADD COLUMN IF NOT EXISTS suggestion_basis          text
    CHECK (suggestion_basis IS NULL OR suggestion_basis IN
           ('pin','visit','scan','calendar','proximity','venue','transcript')),
  ADD COLUMN IF NOT EXISTS suggestion_confidence     numeric(3,2)
    CHECK (suggestion_confidence IS NULL OR suggestion_confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS filed_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS filed_by                  uuid REFERENCES profiles(id) ON DELETE SET NULL;
```

**One suggestion per capture, not a table.** A note's *extracted items* are many and are
independently confirmed — that is `field_note_drafts`' job. A capture's *filing suggestion*
is exactly one, superseded on re-run, and needs to be indexable and sortable in the Tray.
Columns are right here; a table would be over-built.

**Crucially, the suggestion columns are NOT the FK columns.** `project_id` means *filed
there*; `suggested_project_id` means *we think so*. Nothing reads `suggested_*` as truth.
This is the schema-level expression of §0's honesty contract.

### 7.2 `00515` — the inbox branch must persist routing (adopted, and **load-bearing here**)

`commit_field_capture`'s inbox branch sets `status='inbox'` and returns; `project_id`,
`project_room_id` and `shelf` are written **only** in the library branch `[T1] §0.3`,
`[G1] §2.0 pt 2`. In `[T1]` this is a fix; **in Direction B it is a hard dependency of
slice 1**, because Direction B's fast path *always* commits `p_destination='inbox'` — so
without it, **every single capture arrives at the server with no project column**, even the
ones captured under a confirmed pin.

Safe because `field_captures_guard_routing` (`00233:196-256`) runs `BEFORE UPDATE` under
`SECURITY INVOKER` and rejects a project the caller doesn't own or a room outside it.

### 7.3 `00516` — `file_field_capture` (**Direction-B specific; not in `[T1]`**)

Neither shipped RPC covers Direction B's central act. `route_field_capture` **always mints a
product** — it wraps `commit_field_capture('library', …)` (`00235:309`). `dismiss_field_capture`
throws it away. There is no way to say *"this photo belongs to Maple St's kitchen and it is
a site record, not a product."* That is the most common filing outcome in this direction.

```sql
CREATE FUNCTION public.file_field_capture(
  p_capture_id      uuid,
  p_as              text,                 -- 'site_record' | 'library' | 'ffe' | 'note'
  p_project_id      uuid DEFAULT NULL,
  p_project_room_id uuid DEFAULT NULL,
  p_shelf           text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;
```

- `SECURITY INVOKER` like its siblings — the existing guard trigger and RLS do the
  authorisation, exactly as `route_field_capture` relies on them.
- `'library'` delegates to `route_field_capture` (no duplicated mint logic).
- `'site_record'` / `'note'` stamp the columns and set `status='filed'` — **no product**.
- `'ffe'` stamps + returns the placement target for `place_product_in_project`, which stays
  an independently retryable second step (its existing lookup-before-write idempotency on
  `project_ffe_specs.routing_source->>captureId` is a property worth keeping).
- Idempotent: a second call with the same arguments is a no-op returning the same shape.
- **ACL:** `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated` — the
  `00437:516-529` idiom. Any new `public.` routine without an explicit REVOKE trips the ACL
  conformance gate, and prod default-privs auto-grant `anon` EXECUTE on new public functions
  (a lesson that has bitten twice).

**Requires a new `status` value.** `field_captures.status` is
`CHECK (status IN ('queued','synced','inbox','saved','dismissed'))` (`00233:36-37`).
Add `'filed'`. Adding an allowed value to a CHECK never breaks an existing writer, so old
app builds keep working — but this **is** a change to a shipped table with a shipped device
writer, so it is a foundation-level edit worth naming. *(Alternative considered and rejected:
reuse `'saved'`. `'saved'` means "a product was minted"; overloading it would make
`route_field_capture`'s own conflict guard — "already saved ⇒ idempotent no-op" — silently
wrong for filed-not-minted rows.)*

### 7.4 The room question, settled for this direction

Three concepts, and the field↔portal seam crosses all three `[G1] §2.0 pt 4`:

| | what it is | who uses it |
|---|---|---|
| `project_rooms` | the project's FF&E/scope rooms | S1's picker, `field_captures.project_room_id` FK, the document spine |
| `rooms` | what a LiDAR scan attaches to | F1's optional picker, `siteScanContext.projectRoomId` (**a `public.rooms` id, not a `project_rooms` id** — `ContextCaptureProvenance.swift:21,29-32`) |
| `room_scans` | the scan row itself | `/rooms`, `/room/[id]` |

**PROPOSED ruling B-11: `project_rooms` is the filing room.** The Tray's room picker offers
`project_rooms` only, and files into `field_captures.project_room_id`. A scan's `public.rooms`
association stays exactly where it is, untouched, in provenance and on `room_scans` — the
scan-context flow keeps passing `p_project_room_id = NULL`, as `[T1] §2.2` requires. The two
are reconciled *by the project*, not by the room, and a future "these are the same room"
mapping is a separate, later problem. **Do not change the flat dotted-key provenance
convention** — `use-room-files.ts:361-395` filters
`.contains('provenance', {'siteScanContext.scanId': scanId})` and its own comment records
that the nested path "matches zero real captures"; `ContextCaptureProvenance.swift:57-63` is
the frozen writer.

### 7.5 Does the Tray span scans? (**Direction-B specific**)

"Everything flows to a Field Inbox" implies yes: an unfiled scan (`room_scans.project_id IS
NULL`) should sit in the Tray beside an unfiled photo. That means the Tray is a **union over
two tables**, which is a real cost.

- **In-app it is nearly free.** `U1 SyncStatusScreen` already renders outbox rows *and*
  durable scan uploads in one list — the precedent exists in the app already.
- **On the portal it needs a view.** **PROPOSED** `field_tray_items` — a SECURITY INVOKER
  view unioning unfiled `field_captures` and `room_scans WHERE project_id IS NULL`, with the
  same 8–10 columns, following `margin_items`' own union discipline. Its RLS is whatever the
  base tables' RLS is, which is exactly the asymmetry ruling B-05 has to settle
  (`field_captures` = owner + org-inbox; `room_scans` = owner + designer-association +
  studio co-member).
- **Filing a scan** writes `room_scans.project_id` directly — a column Field already writes
  at upload (00265). *(Unverified: whether an owner-side PATCH of `project_id` after upload
  passes `room_scans_guard_routing`. Check before W1.)*

Ruling **B-04**. If the answer is "no", the Tray is `field_captures`-only and scans stay
where they are; Direction B still works, it is just less complete.

### 7.6 Server pipeline (adopted from `[T1] §1.8, §3` without modification)

- **Transcription = pg_cron sweep + edge function**, the exact `derive-scan-photo-media`
  pattern (`00340:52-73`): partial index over the sweep predicate, `*/2 * * * *` →
  `public.invoke_edge_function`, `transcribe_attempts < 5` terminal park, an error column for
  triage, a `job_runs` row per invocation, and **a billing guard that checks for eligible
  rows before any outbound HTTP** (`derive-scan-photo-media/index.ts:38-45`).
- **Structuring = an `agent_tasks` kind** `field_note.structure` — **zero DDL**, because
  `task_type` is an open set with deliberately no CHECK (`00297:41`), the same free ride
  `scan_pipeline.refine/fuse/splat` took. Claimed by `structure-field-note` via
  `claim_agent_tasks` (the `dispatch-scan-modal` precedent), completing `awaiting_review`.
- **Rejected:** storage webhooks (zero in-repo precedent) and DB-trigger → `pg_net`
  (untestable, no park semantics, and `net` is a signed permanent ACL exception on prod).
- **`agent_tasks` cannot be the designer-facing surface** — its only SELECT policy is
  admin-domain (`00297:203-214`). It is the job ledger; `field_note_drafts` is the inbox.
- **Secrets:** `CLAUDE_API_KEY` is already set (`field-parse.ts:155`) but the repo uses
  **two names for the same credential** — `project-ffe-document-extract/index.ts:43` and
  `aesthete-dna-draft/claude.ts:8` read `ANTHROPIC_API_KEY`. Reading the wrong one degrades
  **silently** to `confidence: 0`. Ruling **B-14**.

### 7.7 What Direction B does *not* need from `[T1]`

- No change to `capture-media`'s path convention or policies (§7 of `[T1]` agrees).
- No adoption of the `media_objects` registry (00489/00494/00498) — its own header scopes it
  to the GPU splat pipeline and calls it "mutable until a second consumer adopts it".
- No `field_note_drafts` until W3. W1 and W2 ship with **zero LLM involvement**, because
  W1/W2's suggestions are deterministic (§2.4).

---

## 8 · Migration path from today

### 8.1 Kept, untouched

The scan rig and its four recorders · the whole scan upload chain (durable
container-independent record, background `URLSession`, orphan replay, per-artifact
`merge_scan_artifact_sha256`, `ScanConfirmPolicy`'s 4xx-vs-unreachable discrimination) ·
the capture outbox's idempotency and receipt discipline · owner scoping and the
`CaptureOwnerProjectionPolicy` fail-closed rules · `commit_field_capture`'s library
safe-harbor · all eight Work flows (P/L/D/M/G/Q/F/SR), including **Decisions being read-only
by design** — do not "fix" that without a ruling · the SMS rail · the Site Request guest
outbox · the frozen wire contracts (`FieldCapturePayload`'s camelCase keys,
`ContextCaptureProvenance`'s flat dotted keys, `CaptureMediaPath`'s lowercase-both-segments
rule, the B-17 semantic-vs-transport MIME split) `[G1] §4`.

### 8.2 Re-homed (moved, not rewritten)

| Thing | From | To |
|---|---|---|
| `S1AssignVenueScreen` (490 ln, orphaned) | reachable from 3 places, none in the capture path | **the Filing sheet** (from the Tray) **and the Pin picker** (from C1's chip) |
| `S3DestinationScreen` | a gate on the fast path | the "what does this become" step *inside* filing |
| `V1SessionTrayScreen` | visit-scoped, 4-hour window | **the Tray** — unfiled-scoped, durable, grouped |
| `C5 SpecimenSheet` + N1/N2/N3/N5 | reached by passing through C3 | reached from a Tray row / V3, on demand |
| `CaptureRoutingMemory` | populated only by a prior S1 pass, so in practice always empty | **the Pin**, populated from seven sources |
| `route_field_capture` / `dismiss_field_capture` | shipped, zero web callers | **the portal's filing acts** |
| `sync.routeAll` | tested, called only by V2's cull-to-inbox (`V2CullDeckScreen.swift:238`) | the Tray's "File all N" |
| `OfflineQueueBanner` | preview-only dead code | rendered on C1 |
| `RoomFilesSection` | complete, tested, unmounted since the R21 dissolve | mounted on `/doc/[id]` |
| `CaptureProjectRef` | inline-created projects only | the durable local project + room + learned-centroid cache |
| `CaptureLiveActivityController` + attributes | built and driven, **cannot render** | given a renderer by W4's widget target |

### 8.3 Retired / deleted

| Thing | When | Note |
|---|---|---|
| C3's guess card **as a gate** | W1 | the component is deleted; the flight toast replaces it |
| S4/S5 terminal screens | routing stops in W1; enum cases and files deleted in W2 | keep them alive one wave so nothing is deleted while telemetry is still dark |
| `LowLightTorchOverlay` | W0 | preview-only dead code (`:122`) |
| `FieldPlaceholderScreen` | W0 | zero references |
| `applySmartGuess`'s hardcoded literal | W0 | replaced by the real `HeuristicSmartGuessService`, which exists and is Simulator-safe |
| the `AppContainer.swift:88-91` "the freeze leaves these returning the mock" comment | W0 | stale — every Phase-2 factory returns a real Supabase concrete |
| README's "00258" scan-linkage claim, `CaptureScreenID`'s "51 entries", `AVFoundationCameraService.swift:6`'s "NOT wired into AppContainer yet" | W0 | all three are stale; fix while touching the files |

### 8.4 Copy and placeholder cleanup

**~9 files carry ESCALATE-class placeholder copy, all on the SiteScan coach/anchor/context
surfaces** — user-facing, seen during the M2 walk, and standing as accepted-for-P1 "unless
Kody flags changes" (R110) `[D-field-app] §6`: `SiteScanCoachViews.swift` (whole file per its
header; `:75, :92, :124, :137, :147`), `SiteScanAnchorViews.swift` (`:55, :168-207, :246`),
`SiteScanContextCapture.swift` (`:261, :264, :267`), `FieldCoverageCoach.swift:189`,
`CaptureSurface.swift:14,44`, `CoverageScorecard.swift:55,74`, `ScorecardEvaluator.swift:13,73,81,85`,
`AnchorGate.swift:42,53,136`, `AnchorRecord.swift:39`.

Direction B touches `SiteScanContextCapture.swift` directly (it inherits the Pin and it is
where the silent voice-note loss lives), so **its three strings are in scope for W1**. The
other six files are adjacent, not touched — **PROPOSED: one copy pass in W2**, batched, since
the brand voice skill governs every word and "Designer-Taught Intelligence, never AI" (G-12)
binds all of the new strings this direction introduces anyway.

New strings this direction adds, all of which must be written against the truth-framing law
(R108.5 / R110 FR-10 / R113 / R114.1 — degrade honestly, never block, never silently drop):
the Pin chip's four states, the flight toast, the Tray's empty/offline/debt lines, C7's six
states, the suggestion-basis phrases, and the Desk card's "We think this goes" band.

### 8.5 The frozen-seam edits, done once

`CaptureRoute` / `CaptureSheet` (`CaptureNavigation.swift:4-6`), `CaptureScreenID`,
`CameraMode` (`CaptureEnums.swift:5-6` — "adding cases is safe"), and `AppContainer`
(`:13` "FROZEN for the waves") all carry explicit freeze comments and Direction B edits
three of them:

- `CaptureSheet` += `.filing(FilingTarget)`, `.pinPicker`, `.noteReview(String)`
- `CaptureScreenID` += the Tray, C7, N6 — **and fix `screen.F1.context`**, which is not a
  case today and is therefore invisible to `capture-shots.sh` and the `-CaptureScreen`
  harness
- `AppContainer` += two lines for a `FieldNoteService` seam, following the one-line
  `<Flow>ServiceFactory.make(deps:)` pattern every Phase-2 flow uses (`:88-99`), with a
  `MockFieldNoteService` in `CaptureKitMocks` so all 71 screens keep rendering on the
  Simulator
- **`CameraMode` is NOT edited** — voice is a button, not a fifth mode, precisely so the
  mode selector stays four-wide and the frozen enum stays frozen

**Do all of these in one commit at the top of W1**, named in the brief as a foundation-owner
edit, rather than letting wave agents nibble at them.

### 8.6 Old builds keep working

Every schema change is additive (new nullable columns, a new allowed CHECK value, a new
function). An old app build that still commits `p_destination='library'` from a C3 card
continues to work unchanged. There is no coordinated-release requirement — which matters,
because **there is no distribution pipeline for Field at all** (§9 R-9).

---

## 9 · Effort, risks, rulings

### 9.1 Effort by wave

Sizes are S / M / L per work package; engineer-weeks are rough and assume one senior iOS
engineer plus one full-stack engineer working the portal/DB side, with Fable-orchestrated
subagents doing the mechanical work.

#### W0 · Prerequisites and truth-telling — **≈1 eng-week**

| WP | Size | What |
|---|---|---|
| W0.1 | **S** | Set `postHogAPIKey` in Field's `Secrets.swift`, ship one build, **confirm `surface='field-ios'` rows appear**. Field has **never sent a single analytics event** — 0 rows in 180 days vs 6,017 for `patina-ios`, live-verified `[D-delivery] §6`. Instrumenting a new feature into a channel that has never carried a byte is theatre. |
| W0.2 | **S** | Add `isFeatureEnabled` to `CaptureAnalytics` / `PostHogCaptureAnalytics` / `MockCaptureAnalytics` (fail-closed). Field has **no feature-flag mechanism at all** `[D-delivery] §7`. |
| W0.3 | **S** | `useCaptureMediaUrls` signed-URL hook (§6.1). |
| W0.4 | **S** | Replace `applySmartGuess`'s literal with the real service; delete `LowLightTorchOverlay` + `FieldPlaceholderScreen`; fix `screen.F1.context`; fix four stale comments. |
| W0.5 | **S** | Re-verify the live migration ledger against Strata; reserve 00514–00519. |

#### W1 · The Tray, and capture that never asks — **≈5 eng-weeks · the headline**

| WP | Size | What |
|---|---|---|
| W1.1 | **M** | `SpeechVoiceNoteService`: write the audio, rotate the recognizer, handle interruptions, sha256, `requiresOnDeviceRecognition`. **One file**, and it is 80% of the voice value (§5.1). |
| W1.2 | **M** | C1: Pin chip (+ 7 suggestion sources minus calendar/CLVisit, which are W4), mic button, C7 recording overlay, flight toast replacing the C3 gate, `OfflineQueueBanner` rendered, `NWPathMonitor` drain. |
| W1.3 | **L** | The Tray: rebuild V1 to unfiled-scope, grouping, per-row suggestions with basis, `routeAll` wired, V3 modified, S1 → Filing sheet, S3 repurposed, extended `CaptureProjectRef` cache. |
| W1.4 | **M** | Migrations 00514 / 00515 / 00516 (+ `status='filed'`) and the `field_tray_items` view if B-04 says yes. |
| W1.5 | **M** | Portal: `use-field-tray.ts`, `field-tray-card.tsx`, the Desk population, the registry entry, flag `field-tray`, mount `RoomFilesSection`. |
| W1.6 | **S** | Frozen-seam edits in one commit (§8.5); `FieldNoteService` seam + mock. |
| W1.7 | **S** | P2 "Start a visit here"; W1 dashboard "Tray · N unfiled" row. |
| W1.8 | **M** | Tests: `VoiceRecordingTests` (segment boundaries, transcript concatenation, interruption → N+1, **`audioFilename` non-nil after finish** as the regression guard); extend `FieldCapturePayloadTests` (`voice.audioPath` + the segment array against the 00235 reader — that suite already asserts *every* wire key); extend `UploadStateTests` (audio Content-Type must be bucket-legal — that suite is literally the MIME drift guard that caught a live Storage 400); `FieldTrayFilingTests`; `supabase/tests/field/file_field_capture_test.sql`. |
| — | — | **Gate:** `cd apps/mobile/Capture && scripts/capture-gate.sh all` **plus a device pass** (Speech and mic are device-only; the Simulator renders the typed fallback) **plus a flag-on portal walk**. Note `capture-gate.sh lint` silently no-ops and still exits 0 if `swiftlint` isn't on PATH, and `test` runs logic tests only — **Field has zero UI tests** `[D-delivery] §1-2`. |

**What W0+W1 delivers, with no server AI at all:** she talks and shoots one-handed; the
audio and the words survive offline; everything lands against the right project when she
pinned it and honestly says "not filed" when she didn't; she files a whole visit in one tap
in the car; and she — or an assistant — can see, hear, read, and file all of it from the
Desk. That is most of the program's stated goal.

#### W2 · The server hears it better — **≈3 eng-weeks**

| WP | Size | What |
|---|---|---|
| W2.1 | **M** | `transcribe-field-note` + `_shared/transcribe.ts` + cron + `job_runs` + attempts/park + billing guard (§7.6). |
| W2.2 | **S** | Reconciliation UX on both surfaces — never clobber an edited transcript (§5.2). |
| W2.3 | **S** | Stuck-`queued` capture sweep — `field_captures` has **no `confirm-scan-bundle` equivalent**, so a half-uploaded capture is invisible today `[T1] F14`. |
| W2.4 | **S** | `field-note-media-maintenance` retention cron. |
| W2.5 | **S** | Filing-debt honesty lines; Tray telemetry review against real W1 data. |
| W2.6 | **M** | The batched ESCALATE copy pass (§8.4) + retire S4/S5. |

#### W3 · It becomes work — **≈4 eng-weeks**

| WP | Size | What |
|---|---|---|
| W3.1 | **M** | 00517 `field_note_drafts` + 00518 RPCs (`confirm`/`dismiss`/`stage`, `SECURITY DEFINER` applier revoked from `authenticated`, the `review_sms_message` posture copied exactly). |
| W3.2 | **M** | `_shared/field-note-extract.ts` + `structure-field-note` + the `field_note.structure` agent kind (zero DDL). |
| W3.3 | **M** | 00519 `margin_items` `field_capture` branch + `margin-derivation.ts` union + `margin-bodies.tsx` case. |
| W3.4 | **M** | N6 in-app note review; per-draft confirm on the Desk card. |
| W3.5 | **S** | `field_note_drafts_rls_test.sql`, `confirm_field_note_draft_test.sql`. ⚠ **71/108 SQL tests are currently red** (00483 `pg_temp` fallout) with suite repair owed — either fix the suite first or write these to run standalone and say so. |

#### W4 · Hands full — **≈3 eng-weeks**

| WP | Size | What |
|---|---|---|
| W4.1 | **S** | `StartFieldNoteIntent` + `AppShortcutsProvider` **in the app target** → Siri, Shortcuts, Spotlight, and the Action Button. No new target, works at the 18.0 floor. |
| W4.2 | **L** | New Ruby in `generate_project.rb` for a `CaptureWidgets` WidgetKit target → Control Center control (iOS 18), Lock Screen widget, and **the renderer the Live Activity has never had**. One target, three debts. |
| W4.3 | **M** | `CaptureShareExtension` target (the App Group persistence side is already built). |
| W4.4 | **M** | EventKit read (`NSCalendarsUsageDescription` — absent today) and `CLVisit` (`NSLocationAlwaysAndWhenInUseUsageDescription` — absent; a real App Review conversation) as **suggestion** sources only. |
| W4.5 | **M** | Background audio (`UIBackgroundModes: [audio]`) — **only if W1–W3 evidence justifies it**, ruling B-13. |

**Total W0–W4 ≈ 16 engineer-weeks**, of which **W0+W1 ≈ 6** carry the headline promise.

### 9.2 Risks

Direction-B-specific risks first; `[T1] §7`'s R-01…R-12 all still apply underneath.

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R-1** | **THE LANDFILL.** "Capture first, file later" with no filing discipline becomes 400 unfiled items and a designer who has learned to ignore a number. This is the direction's single biggest failure mode and the honest counter-argument to it. | **highest** | Four things, all part of the design, not bolted on: (a) suggestions make filing one tap, not a decision; (b) **"File all N" for a pinned visit** is the ritual — one tap, whole visit; (c) the Desk population and an assistant give it a second and third owner; (d) one quiet filing-debt line, never a badge. **And a measurable kill-criterion: if median time-to-file exceeds 7 days after 60 days of real use, this direction has failed and should be re-ruled.** W0.1 is what makes that measurable at all. |
| **R-2** | **Filing feels like homework.** Capture is free; the bill arrives all at once. | high | The bulk path is the default and the per-item path is the exception. If the Tray ever requires per-item attention as the *normal* case, the suggestion layer isn't working — instrument `note.project_bound_source` to see. |
| **R-3** | **A wrong suggestion silently becomes a wrong record.** Worse than no suggestion. | high | The suggested/confirmed split is enforced *in the schema* (§7.1): `suggested_project_id` ≠ `project_id`, and nothing reads `suggested_*` as truth. The basis is always shown in words. Nothing auto-applies (B-09). |
| **R-4** | **We lose today's good market economy** — the 1-tap "Save to library" that works once routing memory is seeded. | medium | The Pin carries a filing default ("Everything here → Library"), so F8 stays one tap per specimen. Verify with a real market run, not a Simulator. |
| **R-5** | **The scan/capture union is two tables in one list** (§7.5), with two different RLS models. | medium | B-04 can say no and the direction still works. If yes, `field_tray_items` follows `margin_items`' union discipline and B-05 has to settle the RLS asymmetry first. |
| **R-6** | **`status='filed'` changes a shipped CHECK on a table with a shipped device writer.** | medium | Additive CHECK values never break existing writers; old builds keep working (§8.6). Still a foundation-level edit — name it. |
| **R-7** | **Frozen-seam churn** across `CaptureSheet`, `CaptureScreenID`, `AppContainer`. | medium | One commit at the top of W1 (§8.5). `CameraMode` deliberately untouched. |
| **R-8** | **Consent exposure.** No recording policy exists anywhere in `docs/`; all-party-consent states make surreptitious recording criminal. | high (legal) | §5.5's controls; ruling B-08; a lawyer's read before any non-Kody designer ships. |
| **R-9** | **There is no way to get this to Leah.** No fastlane, no archive step, no CI build, no confirmed ASC record, no `asc-*` skill library for Field `[D-delivery] §9`. Device-verified is single-operator (team `VP22LXHT7L`, Kody's phone). | high | If this program is meant to reach a designer other than Kody, **TestFlight setup is a hard dependency of W1**, not a nicety. Ruling B-15. |
| **R-10** | **We may be building the wrong wedge.** Leah Session 05 (prepped 2026-08-18) has not been run — the findings template is still blank — and its block 2 ranks "capture/memory" against three *other* MVP-wedge candidates `[D-rulings] §3, §5`. Nor is there confirmation Leah has **ever** held Patina Field on a real site (M4's literal gate was deferred at R113). | high | W0+W1 is mostly bug-fixes and wiring of parts that already exist — a cheap, reversible bet. Hold W3 for the session's answer. |
| **R-11** | **Portal flags are fail-closed and most of the field surface is already dark** (`room-file`, `call-sheet`). A third dark flag makes this unwalkable. | medium | One flag, and a walk before "done" (§6.5). |
| **R-12** | **Prod ledger has a hole at 00512** (parked, unapplied, on a branch carrying a known live defect). | medium | Mint from 00514, verify live, coordinate with the 00512 follow-on owner before pushing. |
| **R-13** | **Transcript quality on a job site is unmeasured.** Compressors, saws, echo in an empty room. Whisper is good; nobody has tested it *here*. | medium | W2 records `transcript_state` plus **both** transcripts on every note — the corpus for measuring this is a byproduct of shipping W2. |
| **R-14** | **Every volume and cost number is unfounded** — no telemetry exists at all. | medium | W0.1, then re-derive. `[T1] §1.11`'s ≈$5.25/mo at pilot volume is an order-of-magnitude sanity check, not a budget. |

### 9.3 Rulings owed by Kody

Direction-B-specific rulings first (**B-01…B-07**), then the ones inherited from `[T1]`
that this direction also needs (**B-08…B-15**, cross-referenced to `[T1]`'s K-numbers).

| # | Ruling | Why it blocks |
|---|---|---|
| **B-01** | **Does the fast path always go to the Tray?** Direction B says yes: the shutter never asks a destination question, and `commit_field_capture` is always called with `p_destination='inbox'`. The alternative is "always inbox *unless* the pin carries a filing default", which restores a one-tap library mint for a market run. | The single decision that defines this direction. It also decides whether 00515 is a fix or a hard dependency. |
| **B-02** | **Naming.** "The Tray" / "From the field" / "file" / "the Pin". I84 forbids a third "Capture Inbox"; R98/PRD/I53 make "request" ambiguous three ways; "field kit" is taken. | Names are hard to change once they ship into ⌘K, the Desk, the margin, and the registry. |
| **B-03** | **Is one-tap "File all N to the pin" acceptable as the only bulk write?** It writes N `field_captures` rows to a project on one confirm. | It is the ritual that keeps the Tray from becoming a landfill (R-1). If it needs per-item confirmation, R-1's mitigation is much weaker. |
| **B-04** | **Does the Tray span scans** (`room_scans WHERE project_id IS NULL`) as well as captures? | Decides whether a `field_tray_items` view exists, and drags two RLS models into one list (§7.5). |
| **B-05** | **Per-designer or per-studio Tray?** `field_captures` is owner + org-inbox SELECT; `room_files` delegates to the broader scan visibility; they disagree today, flagged in-code as an unfixed P2. | **Load-bearing for this direction specifically**, because "or an assistant files items" is in the brief. A studio-wide Tray also requires a `capture-media` object policy with a co-member branch — a `supabase_storage_admin`-owned **platform-admin phase migration**, not an ordinary one. Sequence the ruling before the schema. (= `[T1]` K-03) |
| **B-06** | **Desk placement:** above the fold in *Needs your hand*, or inside the Studio Pulse fold beside `FieldDesk`? | Above the fold via the normal path would need a new `NeedKind` **and** a `document_state` column; via a separate population it needs neither. (= `[T1]` K-06) |
| **B-07** | **Flag posture.** One flag `field-tray`, fail-closed, with a mandatory flag-on walk before "done"? | Four shipped-behind-a-flag surfaces in this repo have never been seen by a human. |
| **B-08** | **Recording consent posture** — does a `conversation` note require an explicit affirmation? Is there a jurisdiction rule? | The one item with legal exposure. Shapes C7 and the retention default. (= `[T1]` K-01) |
| **B-09** | **Does anything auto-apply?** SMS applies at ≥0.8; Direction B proposes never, for the designer's own notes. | The biggest trust decision in the pipeline. (= `[T1]` K-04) |
| **B-10** | **Audio retention default** — `keep`, `discard_after_transcript`, or `90_days` (the site-request precedent)? Per-note, per-studio, or fixed? | A column default, a cron, and what a client's lawyer sees on discovery. (= `[T1]` K-02) |
| **B-11** | **`project_rooms` is the filing room** (§7.4), and a scan's `public.rooms` association stays untouched in provenance. | No unified "put this in this room" affordance can ship without picking one. (= `[G1]` G-11) |
| **B-12** | **Can a spoken measurement ever become a measured record?** Proposed: no — it becomes a note that *says* the number, tagged as spoken. R108.1 (typed anchors only) and R114.1 (two-tier trust) both support that; R108.1's named re-open trigger is *"field evidence of transcription friction"*, which this program will generate. | Decides whether the applier may ever touch `room_file_measurements` / `tolerance_class`. (= `[T1]` K-05) |
| **B-13** | **Background audio** (`UIBackgroundModes: [audio]`) — ship it so a note survives screen-lock? | App Review + battery + privacy; changes the whole "phone in pocket" story. Proposed: W4, with evidence. (= `[T1]` K-07) |
| **B-14** | **`CLAUDE_API_KEY` vs `ANTHROPIC_API_KEY`** — pick one and document it. | Reading the wrong one degrades **silently** to zero-confidence output. (= `[T1]` K-11) |
| **B-15** | **Is TestFlight a dependency of W1?** If field notes are meant to reach a designer other than Kody, the missing distribution pipeline has to be built first. | Decides whether W1 ends at "Kody's device" or "Leah's device". (= `[T1]` K-12) |
| **B-16** | **PRD O8** — "when The Document reads the Binder, what renders in the Desk vs. the margin?" The PRD itself flags this as cross-cutting and not Field's call alone. §6.3/§6.4 answer it *by implementation* for the Tray; it deserves an explicit ruling. | Sets the pattern every future field surface follows. (= `[T1]` K-10) |

### 9.4 Things I could not verify

- Whether an owner-side PATCH of `room_scans.project_id` **after** upload passes
  `room_scans_guard_routing` (§7.5). Blocks B-04's "yes" path.
- Whether `comms_messages` is actually in the `supabase_realtime` publication on Strata —
  self-documented as unverified at `SupabaseMessagingService.swift:136-144`. Not on the
  critical path, but it decides whether an in-app "your note came back structured" live-tail
  is possible.
- Whether GitHub branch protection actually makes the "(advisory)" iOS CI jobs blocking
  `[D-delivery] §2`.
- Whether an App Store Connect record for `cloud.patina.field` exists at all `[D-delivery] §9`.
- Whether P2 item 10 (the voice-note seam + provenance GIN index) was ever picked up in the
  later "Rendered Room v2" work — DECISIONS.md's Field Capture coverage stops at R123
  (2026-07-29). The **code** says no (§5.1); a paper answer may exist.

---

*Read-only survey and design. No repository file was modified other than this report.*
