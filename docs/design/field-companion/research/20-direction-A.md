# Direction A — **The Project Spine**

**Program:** Patina Field → a true field companion to the designer portal's project flow
**Date:** 2026-08-24 · **Agent:** Direction-A (read-only design pass)
**Evidence base:** the seven discovery reports `[D1]`–`[D7]`, the two synthesis documents
`[G1]` (`10-gap-analysis.md`) and `[T1]` (`11-tech-architecture.md`), all read in full, plus
direct re-verification in the repo of every claim this direction leans on. New findings made in
this pass are marked **[A-new]**. Proposals are marked **PROPOSED**. Anything I could not prove
from code is marked **(inference)**.

| key | report |
|---|---|
| `[D1]` | `01-field-app-map.md` | `[D5]` | `05-patina-substrate.md` |
| `[D2]` | `02-backend-contract.md` | `[D6]` | `06-external-research.md` |
| `[D3]` | `03-portal-project-flow.md` | `[D7]` | `07-delivery-infra.md` |
| `[D4]` | `04-intent-and-rulings.md` | `[G1]` | `10-gap-analysis.md` |
| | | `[T1]` | `11-tech-architecture.md` |

---

## 0 · Four facts this direction is built on

Before the thesis, the four things I verified this session that make this direction possible —
and one that makes it necessary.

### 0.1 The visit already exists. It is just invisible. **[A-new]**

`CaptureKit/CaptureKit/Session/CaptureSessionContext.swift` already defines a first-class visit:
a `visitID: UUID`, a `startedAt`, a `lastActivityAt`, a `CaptureRoutingMemory`
(`destination`/`projectID`/`projectName`/`projectRoomID`/`room`/`shelf`), a 4-hour inactivity
window (`CaptureSessionContextPolicy.inactivityWindow`), an owner-scoped identity, App-Group
persistence, and an explicit **`endVisit(identity:now:)`** (`:150-161`).

Nothing in the app names it, shows it, starts it, or ends it. `visitID` is used only to scope
`Specimen.captureSessionID`; `endVisit` has **zero call sites outside the file itself**. The
designer has been standing inside a visit all along and has never been told.

**Direction A is, mechanically, the act of promoting this struct to the surface.**

### 0.2 One project fetch already carries *both* room concepts. **[A-new]**

`[G1] §2.0 pt 4` and `[D1] §8 pt 6` both flag the three-way room collision (`rooms` vs
`project_rooms` vs `room_scans`) as a hard blocker needing a ruling. It is softer than it looks
on the device: `FieldProjectDetail` (`CaptureKit/CaptureKit/Work/ProjectsService.swift:117-140`)
already returns **both** lists from one `projectDetail(id:)` call:

```swift
/// Project-scoped FF&E rooms (`project_rooms`), used by spec placement.
public let specRooms: [FieldProjectRoom]
/// Client-owned physical rooms (`rooms`), used by site scanning.
public let rooms: [FieldProjectRoom]
```

So a single "which room are you in?" picker can offer one merged list and stamp **both** ids
where each is legal — `project_rooms.id` → `field_captures.project_room_id`, `rooms.id` →
`siteScanContext.projectRoomId` provenance + `room_scans.room_id`. The collision does not need
a schema ruling to build a unified affordance; it needs a **matching rule** and an honest
answer when the two lists disagree (§7.4, ruling A-04).

### 0.3 `projectRoomID` is remembered and then silently dropped. **[A-new] — a real bug**

This one is load-bearing for Direction A and is not in any discovery report.

`S1AssignVenueScreen.persistRouting()` writes the FF&E room into visit routing memory:

```
Capture/Features/Route/S1AssignVenueScreen.swift:406-413
    sessionContext.remember(
      CaptureRouteSafetyPolicy.updatingAssignment(
        in: priorRouting, projectID: …, projectName: …, room: …, shelf: …,
        projectRoomID: selectedProjectRoomId.isEmpty ? nil : selectedProjectRoomId),
      identity: identity)
```

`ViewfinderModel.makeDraft()` reads that memory back onto every new capture — and copies four of
the five fields:

```
Capture/Features/Capture/ViewfinderModel.swift:341-344
    venue.projectId   = context.routing.projectID
    venue.projectName = context.routing.projectName
    venue.room        = context.routing.room
    venue.shelf       = context.routing.shelf
                                       ← venue.projectRoomId is NEVER assigned here
```

Verified by `grep -rn "projectRoomId" apps/mobile/Capture --include="*.swift"`: the only
non-test write to `VenueStamp.projectRoomId` in the whole app is
`S1AssignVenueScreen.swift:370`. **`CaptureRoutingMemory.projectRoomID` is write-only.** Every
capture after the first inherits the project and loses the room — even inside a visit where the
designer has already answered the question. A direction built entirely on inheritance cannot
ship with this bug; it is a two-line fix and it is the first line of code Direction A writes.

### 0.4 Field can already write a real margin note and a real punch item. **[A-new]**

`[G1] §2.0 pt 1` correctly enumerates that Field never touches `margin_notes`, `project_tasks`,
or writes `client_decisions`. What no report states is **why not** — and the answer is not
permissions. All three are already reachable from the phone with the credentials it holds:

| Target | Path | Grant, verified |
|---|---|---|
| `margin_notes` | plain PostgREST insert | `margin_notes_designer_all` — `FOR ALL TO authenticated USING (designer_id = auth.uid()) WITH CHECK (designer_id = auth.uid())` (`00196_per_item_claims_and_margin_notes.sql:51-54`). Studio co-members additionally **read** via `margin_notes_studio_read` (`00205:18-49`). |
| `project_tasks` | plain PostgREST insert | `"Designers manage their project tasks" FOR ALL USING (projects.designer_id = auth.uid())` (`00169_project_documents_and_tasks.sql:61-62`). ⚠ **designer-of-record only** — a studio co-member cannot insert. |
| `client_decisions` (punch / RFI) | RPC `create_client_decision(p_decision_id, p_payload, p_options, …)` | `REVOKE ALL … FROM PUBLIC, anon, service_role; GRANT EXECUTE … TO authenticated` (`00413_configuration_com_and_decision_selection.sql:2603-2609`). Takes a **caller-supplied `p_decision_id`** — a free idempotency key for a device outbox. Payload accepts `project_id`, `title`, `context`, `due_date`, `room_id`, `section_key`, `coordination_kind`, `court`, `court_party_id`, `blocks_kind` (`:1828-1833`). |

`apply_field_effect`'s party-anchor / service-role wall (`[G1] §M4`, `00282:472`) is a real wall
for a *texting GC*. **It was never the wall for Leah's own phone.** Leah is `auth.uid()`. She
does not need a new authority mechanism; she needs the three write paths that already accept her.

One genuine gap: `create_client_decision` requires `designer_client_id` in the payload
(`:1849-1855`) and Field's `FieldProject` DTO (`ProjectsService.swift:19-38`) does not carry it.
That is one column on one SELECT, not a new subsystem (§7.3).

---

## 1 · Thesis

### 1.1 The claim

**Today Patina Field asks "what did you capture?" and never gets around to asking "where does it
go?". Direction A asks "where are you?" once, and then never asks anything else.**

The measured cost of the current order is in `[G1] §O1`: seven taps and a press-and-hold to get a
photo and a spoken note onto the device, after which the record **still has no project**, and
another six taps plus a network round-trip to attach one — through S1, a screen the capture path
cannot reach (`grep "present(.assignVenue"` → three call sites, verified this session:
`CaptureDeepLink.swift:96`, `S2CreateProjectScreen.swift:172`,
`V1SessionTrayScreen.swift:126`; none of them is C3 or C5).

The order is backwards because the expensive question is asked at the wrong frequency. On a site
visit the answer to "which project?" changes **once, on arrival**. The answer to "what is this?"
changes twenty times an hour. Today the app asks the cheap question once and the expensive one
never; Direction A asks the expensive one once, at the door, when the designer's hands are still
free and she is standing in front of the address.

Everything else follows. If context is set at the door:

- A capture cannot be born unattached, so **there is nothing to triage** — no inbox on the phone,
  no inbox in the portal, no Desk card, no review queue.
- The portal does not need a *place for field stuff*. It needs the field stuff to appear in the
  places that already exist: the room, the margin, the FF&E line, the drawing set.
- The project picker never has to be reachable from the shutter, because it was answered before
  the shutter existed.
- A voice note has a project the instant it is spoken, which means **it can become a real
  `margin_notes` row with no server AI at all** (§0.4). Structuring becomes an optional
  enrichment, not a prerequisite.

### 1.2 Why this serves Leah specifically

Four persona facts from `[D4] §3`, and how the spine answers each:

| Persona fact | Direction A's answer |
|---|---|
| **One-handed, busy, on the move** (PRD §9, the explicit friction budget). | Two taps and a hold for photo+note, inside a visit. The heavy interaction — picking a project from a list, picking a room — happens standing still at the door, once. |
| **"Site visit" is already a first-class activity in the product's own data model** (`project_time_entries.activity` ∈ Design / Sourcing / Client / **Site visit** / Admin, 00177 — `[D4] §3`). | Direction A does not invent a noun. It gives the app the same word the timesheet already uses, and the same three kinds: site · sourcing · client. |
| **She retires the tape measure** (P1 gate, `field-capture-p1-package.md:72`). | The site scan's project step (`F1`, `SiteScanSetupScreen`) is the *only* place in today's app where context is asked before capture — and it is the app's best flow. Direction A takes F1's posture and makes it the app's posture. |
| **M4's device pilot was deferred; Leah may never have held this app on a real site** (`[D4] §3`, R113; `[G1] §6 item 11). | The spine is walkable in eight minutes with a phone and a real address, which makes it a *cheap* thing to put in front of her — unlike a structuring pipeline whose value can only be judged after weeks of notes. |

### 1.3 The competitive read

`[D6] §C1` names the dominant field-app pattern as **"capture-first, file-later"** (CompanyCam,
Otter, Limitless): snap and talk, let the software file it afterward. Direction A deliberately
takes **the opposite bet**, and it should be chosen with that trade understood:

- Capture-first is right when the *filer* is cheap and reliable — a geofence, a model, a
  human assistant. Patina has none of those today: no `CLVisit` (`[D7] §8` — no Always-location
  key), no server transcription (`[D2] §5`), and Leah has no assistant.
- File-first is right when the context is **stable across a whole work session** and the
  filing is **structurally impossible to recover later**. Both are true here: a site visit is one
  address for two hours, and `[G1] §2.1` shows five of the brief's eleven destinations are
  unreachable from Field at all — a capture that lands unattached today is unattached forever.

CompanyCam's geofence auto-tagging (`[D6] §C2`) is the *end state* Direction A is walking toward:
wave 4 adds `CLVisit` + `EventKit` — but strictly as a **suggestion that pre-fills the door
question**, never as an inference that files silently. The door stays.

### 1.4 What this direction deliberately does NOT do (YAGNI)

Stated as commitments, because half of the value of a direction is the work it refuses.

1. **No inbox, no triage queue, no review card — on either surface.** No Desk population, no
   `NeedKind`, no `document_state` column. `[D3] §10 rec 1` and `[T1] §4.3` both propose one;
   Direction A's position is that a triage queue is the *scar tissue of a missing spine*. If
   captures keep arriving unfiled, the door is broken — fix the door, don't staff the queue.
2. **No LLM structuring, no `field_note_drafts` table, no `agent_tasks` kind, in waves 0–4.**
   `[T1] §2.3` designs all three well; Direction A defers the entire pipeline to an optional
   wave 5 gated on evidence. A note that is already in the right document is 80% of the value at
   5% of the surface area.
3. **No server transcription in waves 0–3.** Wave 2 writes the **audio**, which is the honesty
   obligation (`[G1] §0.1`, R108.5/R110-FR-10). Re-transcription is wave 5, gated on measured
   device-transcript quality — the corpus for which is a free byproduct of wave 2.
4. **No spoken measurement ever becomes a measured record.** R108.1 (typed anchors only) and
   R114.1 (two-tier trust) both say so; `[T1] §2.4` reaches the same conclusion. A spoken
   dimension becomes a note that *says* the number, tagged as spoken. Ruling A-06.
5. **No client-facing surface.** PRD O2 is open (`[D4] §5`); field notes must not pre-empt it.
6. **No share extension.** `CaptureShareExtension/` stays an empty directory. It solves a
   problem (importing from other apps) that no field moment in `[G1] §2.2` describes.
7. **No ambient/always-on recording and no background auto-start.** Recording begins on a
   deliberate act, always. This falls out of both the consent posture (§5.6) and iOS's own rule
   that a background trigger cannot start a recording (`[D6] §D`).
8. **No bulk-route UI.** `[G1] §0.3` narrows the "Route all N" defect to "you can bulk-park, you
   cannot bulk-place." Direction A's answer is that with a spine there is nothing to bulk-place —
   the routing already happened. `V1SessionTrayScreen.swift:126`'s footer is *replaced*, not
   fixed (§4.9).
9. **No new global room, ledger, or verb in `lib/document/registry.tsx`.** Field material appears
   inside existing surfaces. Nothing new to reach in ⌘K, nothing new on Desk Contents.
10. **No new NestJS service, no new worker, no Coolify** (G-5 / R109.1 / both root agent files).
11. **No WhisperKit, no iOS 26 bump, no diarization.** Deployment target stays 18.0
    (`generate_project.rb:17`, `[D6]` confirms across all 8 build configs).
12. **No plan markup, no PencilKit, no video.** `[G1] §2.1` confirms zero of each exists;
    `[D4] §4 item 5` puts walkthrough video in an evidence-gated P2–P4 bucket.
13. **No mood-board editing from the field.** `[D6] §C12` flags Houzz Pro's mobile-view/desktop-edit
    split as cautionary; Direction A declines to enter the argument in v1 and rules it out loud.

### 1.5 What this direction costs, stated up front

Three real prices, so nobody discovers them in wave 2.

- **It inverts the app's founding posture.** `apps/mobile/Capture/README.md` opens: *"Patina Field
  is a standalone camera-first iOS app."* Direction A makes the day, not the camera, the landing
  surface (mitigated in §2.1 — mid-visit launches still land on the camera). This is a product
  identity change and it is **ruling A-01**, not an implementation detail.
- **It makes the project cache load-bearing.** `[D1] §Offline gaps` is blunt: S1's pickers need
  `projectsService.projectDetail(id:)`, and offline they degrade to a banner — *"the offline
  capture is exactly the one that can't be placed."* A direction whose entire premise is
  "context is already set" cannot have its context picker fail in a basement. Direction A must
  build a durable local project/room cache. That is the single largest new subsystem in the plan
  and it has **no precedent in the app** (`CaptureProjectRef`, `Specimen.swift:224-249`, is a
  one-field stub for inline-created projects only).
- **A wrong visit is a systematic error, not a single one.** Today a mis-routed capture is one
  bad row. Under a spine, a visit left open from yesterday quietly stamps *today's* twenty
  captures with yesterday's project. Direction A must pay for this with visible chrome and an
  aggressive staleness policy (§2.5, §4.3).

---

## 2 · Information architecture

### 2.1 Home

**PROPOSED: `W1` becomes "Today" — the same screen, a new head.**

Not a new screen, and not a new realm. `WorkDashboardScreen` (`Features/Work/WorkDashboardScreen.swift`,
669 ln) already renders, in order: a greeting header with the studio name + `CaptureDates.dayHeading(Date())`
(`:103-117`), three attention sections *Needs you* / *Waiting on others* / *Moving today*
(`:36-56`, fed by `FieldAttentionBuilder`), and a six-tile Browse grid (`:274-331`). It already
has partial-failure handling with per-source Retry (`:230-260`) and it already drives the
Companion hint (`:171-186`).

Direction A inserts **one section above *Needs you***:

```
        THE STUDIO NAME
        Good morning, Leah
        Tuesday, August 25

        ┌─ TODAY ───────────────────────────────────────────────┐
        │  ● Maple St · Living + Dining          started 9:14am │   ← open visit
        │    12 captures · 1 scan · 3 notes        [ Camera ]   │
        ├───────────────────────────────────────────────────────┤
        │  Kippley residence          10:30am · site visit      │   ← suggested (wave 4)
        │  High Point · Showroom 214  2:00pm · sourcing         │
        ├───────────────────────────────────────────────────────┤
        │  + Start a visit                                      │
        └───────────────────────────────────────────────────────┘

        NEEDS YOU  (unchanged)
        WAITING ON OTHERS  (unchanged)
        MOVING TODAY  (unchanged)
        BROWSE  (unchanged, 6 tiles)
```

**Launch behaviour** (`RootView.rootContent`, phase `.ready`, `RootView.swift:317-372`):

| State on launch | Lands on |
|---|---|
| A visit is open and active within the last 30 min | **C1 viewfinder**, visit chip lit — today's rhythm, unchanged |
| A visit is open but idle > 30 min | **Today**, the visit row at the head with *"Still at Maple St?"* + Resume / End |
| No visit open | **Today** |
| Deep link `field://capture` | C1, using the open visit; if none, C1 with an **unfiled** chip (§2.4) |

That table is the whole concession to §1.5's identity risk, and it is deliberate: the camera-first
muscle memory survives *inside* a visit, which is exactly when it is right.

### 2.2 Primary navigation

**Unchanged.** Two realms, two independent `[CaptureRoute]` stacks
(`CaptureKit/CaptureKit/Navigation/FieldRealmHistory.swift`), no tabs, one `.sheet(item:)` on the
root (`RootView.swift:46-48`). The `WORK` pill (`ViewfinderWorkButton`, a11y id
`field.realm.work`, `ViewfinderControls.swift:63-82`) is **relabelled `TODAY`** and keeps its
position top-left above the venue chip (`ViewfinderScreen.swift:104-107`). The return trip stays
`cameraRealmButton` in the Today header (`WorkDashboardScreen.swift:120-155`).

Direction A adds **no route cases** and **one sheet case**. `CaptureRoute`/`CaptureSheet` carry
an explicit freeze comment — *"Changing a case is a foundation-owner-only edit"*
(`CaptureNavigation.swift:4-6`) — so this is named as a foundation edit, done once, at the top of
wave 1, not incrementally:

- `CaptureSheet.visit` — the V0 visit sheet (§4.3).
- `CameraMode` gains `.voice` (fifth case, `CaptureEnums.swift`) — not a route or sheet.
- `CaptureScreenID` gains `v0Visit`, `c6Voice`, `v4VisitReview`, **and fixes the orphan**
  `screen.F1.context`, which `SiteScanContextScreen` sets today but which is not a
  `CaptureScreenID` case, making it invisible to `capture-shots.sh` and the `-CaptureScreen`
  harness (`[D1] §6`).

### 2.3 Entry points

| Entry | Wave | What it does | Grounding |
|---|---|---|---|
| App icon / `field://capture` | — | Per §2.1's launch table. | `CaptureDeepLink.swift` |
| **`TODAY` pill** on C1 | 1 | Back to the day, keeps camera history. | `ViewfinderWorkButton` |
| **Companion hearth strip** | 1 | Already pinned as a bottom `safeAreaInset` on every non-camera screen (`RootView.swift:41-45`), hidden on the live viewfinder. Direction A gives it its first real job: **the open visit's banner**, with one typed action. `FieldCompanionAction` already exists (`FieldCompanionPresentation.swift:26-40`) and `RootView.handleCompanionAction` (`:218-226`) already switches on `action.id` with a `default:` no-op — adding `visit.resume` / `visit.end` is a two-case addition. `[D1] §8 pt 11` independently calls the Companion "decorative" and names this as the obvious fix. |
| **App Intent — `StartVisitIntent`, `CaptureVoiceNoteIntent`** | 4 | An `AppIntent` **in the app target** gives Siri + Shortcuts + Spotlight + Action Button with **no new target** (`[D6] §D`, `[T1] §5.5`). Note the app already fires a `settings.action_button_rebind` analytics event and O4 *teaches* the Action Button (`[D1] §1`) — the affordance is promised in onboarding and does not exist. | `[D7] §8`: zero `import AppIntents` in the tree |
| **Control Center control + Lock Screen widget + Live Activity renderer** | 4 | One new `CaptureWidgets` WidgetKit target pays three debts at once — including finally *rendering* the Live Activity whose `CaptureSyncAttributes` and `CaptureLiveActivityController` are already built and driven by `LocalCaptureSyncService` but cannot display. Requires new Ruby: `generate_project.rb` creates exactly four targets (`:28-30, :129`) and `CaptureWidgets/` is an empty directory with zero target-generation code. | `[D1]` banner, `[D7] §4` |
| **Calendar (EventKit) + `CLVisit`** | 4 | **Suggestion only** — pre-fills the door, never opens it. Needs `NSCalendarsUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription`, both absent today. | `[D6] §D`, `[D7] §8` |
| Share extension | ✗ | Out of scope (§1.4 pt 6). | |
| Universal link `https://client.patina.cloud/field/{token}` | — | Unchanged — the guest Site Request realm. | `Capture.entitlements` |

### 2.4 The visit — the session/context model

A **visit** is a bound, named, visible work session. It is `CaptureSessionContext` (§0.1) plus a
kind, an explicit lifecycle, and a face.

```swift
// PROPOSED — extends CaptureKit/CaptureKit/Session/CaptureSessionContext.swift
public enum FieldVisitKind: String, Codable, Sendable {
    case site      // bound to a project (+ optional room). Captures default to the project.
    case sourcing  // bound to a venue. Captures default to Library. 0..n "projects in mind".
    case roving    // bound to nothing. The drive home. Captures are UNFILED and say so.
}

public struct CaptureSessionContext {         // existing type, additive fields
    public let visitID: UUID                  // exists
    public let identity: CaptureSessionIdentity   // exists
    public let startedAt: Date                // exists
    public var lastActivityAt: Date           // exists
    public var routing: CaptureRoutingMemory  // exists (projectID/projectRoomID/room/shelf/destination)
    // ── new ──
    public var kind: FieldVisitKind           // default .roving for a legacy decode
    public var label: String?                 // "Maple St · Living + Dining" | "High Point 214"
    public var scanRoomID: String?            // public.rooms.id — the site-scan room concept
    public var projectsInMind: [String]       // sourcing only; ≤4 project ids for one-tap tagging
    public var endedAt: Date?                 // exists implicitly via endVisit(); made explicit
}
```

Three kinds, because the founding use case is not project-shaped and Direction A must not break it:

- **Site visit.** The thesis case. Project + optional room, chosen at the door. Captures inherit
  `projectID` + `projectRoomID` (+ `scanRoomID` for scan-context rows). Default destination is
  the project.
- **Sourcing visit** (market, showroom, vendor). This is M3, the app's founding moment
  (`README.md`: *"turns a physical object in a showroom into a structured, located, synced
  specimen"*). Its spine is the **venue**, not a project. Default destination is **Library**.
  It may carry up to four *projects in mind*, rendered as chips on C3 so a piece found for the
  Kippley dining room is one tap from being tagged — the closest Direction A gets to the old
  routing flow, and the only place it is right.
- **Roving.** No project. A thought on the drive home; a photo of a light fixture on a wall.
  Captures commit normally (audio, transcript, photos, `field_captures` row) so **nothing is
  ever lost**, but they are stamped **unfiled** and Today shows them until they are filed with
  one tap. This is the one queue Direction A tolerates — and it lives **on the phone, in her
  hand, on the surface she opens every morning**, not in a portal she opens on Thursdays.

**Staleness.** Today's `CaptureSessionContextPolicy.inactivityWindow` is 4 hours (`:71`) and
resumption is silent. Direction A keeps 4 hours for *silent* resumption and adds a second,
louder rule: **a visit older than 30 minutes of inactivity is confirmed, not assumed** (§2.1's
launch table). PROPOSED: a `site` visit auto-ends at 12 hours and is *never* silently resumed
across a calendar day. This is the mitigation for §1.5's systematic-error risk.

### 2.5 Where the visit is visible, at all times

The direction lives or dies on this, so it is stated as an invariant:

> **INVARIANT V:** on every screen where a capture can be created, the visit's project and room
> are legible without a tap, and changing them is exactly one tap away.

| Surface | What carries it |
|---|---|
| **C1 viewfinder** | `ViewfinderVenueChip` (`ViewfinderControls.swift:43`, top-left under the pill) becomes the **visit chip**: `Maple St · Living` — tappable, opens V0. Today it shows only a placemark string or *"Locating venue…"*. |
| **C3 quick-confirm card** | A second, smaller room chip beside the guessed category (§4.5). |
| **C5 specimen sheet** | The project/room row becomes an inherited, read-only display with a *Change* link → V0. |
| **Every non-camera screen** | The Companion hearth strip, collapsed, carrying the visit label + one action. |
| **F1 scan setup** | The project step is pre-answered and collapses to a line (§3.4). |
| **Lock Screen / Dynamic Island** | Wave 4's Live Activity. |

---

## 3 · The key flows

Timing targets are proposals for Kody to rule. Tap counts exclude gestures (hold, swipe), which
are counted separately. "Today" tap counts assume the identical starting state and are taken from
`[G1] §O1` / `[D1] §8`.

---

### Flow 1 · Arrive on site — start the visit

**Target: ≤3 taps, ≤8 s from cold launch. Must work offline.**

| # | Act | Surface |
|---|---|---|
| — | Open Field (cold) | → **Today** (§2.1) |
| 1 | Tap **+ Start a visit** — *or*, wave 4, tap a suggested row and skip to step 3 | V0 visit sheet |
| 2 | Tap a project from the list (recent-first; text filter; offline from cache) | V0, room step |
| 3 | Tap a room — or **Whole house** | V0 → dismiss, land on C1 |

The visit chip reads `Maple St · Living`. Every capture from here inherits it.

**Where it lands:** nowhere yet — a visit is device-local until its first capture. That is
deliberate: an abandoned visit leaves no server rows. On first capture, `field_captures.visit_id`
(new column, §7.1) carries the `visitID` so the portal can group a day's material (§3.8).

**Offline:** requires the project + room cache (§1.5, §5.5 W1-3). Cache miss → V0 shows the
locally-cached projects and an honest line: *"Showing the 12 projects on this phone. Others need
signal."* Never an empty list, never a spinner.

---

### Flow 2 · Photo + spoken note, inside a visit — **the headline flow**

**Target: 2 taps + 1 hold, ≤10 s, fully offline. Today: ~7 taps + 1 hold, and no project.**

| # | Act | Surface | File |
|---|---|---|---|
| — | App is on C1, visit chip reads `Maple St · Living` | C1 | |
| 1 | **Tap the shutter** | `ViewfinderModel.pressEnded → captureSingle()` (`:206-236`) → C3 card | |
| — | **Press and hold the card's mic**, speak, release | C3 gains an inline mic (§4.5) — no sheet, no specimen round-trip | new |
| 2 | **Tap Save** | `saveFromCard()` (`:277-297`). Destination is **already decided** by the visit kind, so the `destination == .undecided` branch that presents S3 does not fire. | `ViewfinderModel.swift:280-284` |

**Where it lands, exactly:**

1. Device: a `Specimen` with `venue.projectId`, **`venue.projectRoomId`** (the §0.3 fix),
   `venue.room`, `captureSessionID = visitID`, one `CapturePhoto` HEIC in
   `<AppGroup>/CaptureMedia/`, `voiceTranscript`, `voiceDurationSeconds`, and — from wave 2 —
   `voiceAudioFilename`.
2. Outbox: `LocalCaptureSyncService.enqueue()` (never touches the network) → per-owner serialized
   `drain()` → upsert-idempotent upload to `capture-media/<uid>/<clientToken>/`
   (`CaptureMediaPath.folder`, both segments lowercased) → `commit_field_capture` RPC.
3. Server: `field_captures` row with `status='inbox'`, `project_id` and `project_room_id`
   **now persisted** (the 00514 fix, §7.1 — today `00235:204-217` sets only `status`).
4. Portal, **wave 2**: a `margin_notes` row written by the device (§0.4) with
   `project_id`, `body` = the transcript, `anchor_kind='letterhead'`, and the new
   `field_capture_id`. It appears in the margin rail of `/doc/[id]` through the existing
   `margin_items` **`note`** branch (`00197_margin_items_note_branch.sql`), rendered by
   `components/document/margin-bodies.tsx` with the aged-oak accent
   (`lib/document/margin-derivation.ts:44`) — **no new margin kind** (§6.3).

**Offline:** every step above is offline-durable today except the `margin_notes` insert, which
Direction A puts on the **same outbox** as the capture (§5.5, W2-2) rather than a second queue.

---

### Flow 3 · Walk-and-talk — a note with no photo

**Target: 1 tap + 1 hold from the camera; 1 press from the Lock Screen (wave 4). Today: impossible.**

`[G1] §O3` establishes why it is impossible: every enrichment sheet is keyed to a `Specimen` UUID
— `.voice(UUID)`, `.measure(UUID)`, `.ocr(UUID)`, `.code(UUID)` (`CaptureNavigation.swift:46-57`)
— so a specimen must exist before a voice note can. The only sheet-free voice entry in the app is
inside a running site scan (`SiteScanContextCapture`).

| # | Act | Surface |
|---|---|---|
| 1 | Swipe the mode selector to **VOICE** (a fifth `CameraMode`) — or press the Action Button (wave 4) | C1 → **C6** |
| — | **Hold the big mic**, speak, release. Live transcript rides up the screen. | C6 |
| — | Auto-save on release (the record already has a project). No confirm step. | |

`ContextCaptureService` already proves a media-less specimen commits cleanly through the existing
outbox (`CaptureKit/CaptureKit/SiteScan/ContextCaptureService.swift`, tested in
`ContextCaptureTests.swift`) — C6 is that pattern with a viewfinder-scale mic instead of a pill.

**Where it lands:** identical to Flow 2 minus the photo.

---

### Flow 4 · Scan a room, inside a visit

**Target: 1 tap to start scanning. Today: 3 taps + a project fetch.**

F1 (`SiteScanSetupScreen`) already asks the door question — project, optional `public.rooms` pick,
scan name — using `SupabaseSiteScanService.ownableProjects()`, a filter that deliberately mirrors
the `room_scans_guard_routing` BEFORE-INSERT guard so F1 can never offer a project that would
fail at upload (`[D1] §5b step 2`). Direction A **keeps that guard and pre-answers the form**.

| # | Act | Surface |
|---|---|---|
| — | Today → Browse → **Site scan** (or C1 mode selector → SCAN) | |
| 1 | F1 opens with project + room **filled from the visit** and collapsed to one line: *"Maple St · Living — change"*. Tap **Start**. | F1 → F2 |
| — | Scan (F2, unchanged), review (F3), upload (F4) — all unchanged | |

⚠ **The guard is the tiebreak.** If the visit's project is not in `ownableProjects()` — she is a
studio co-member, not the designer of record — F1 must **expand and say so**, not silently start
a scan that will 4xx at upload. Honest degrade, per R108.5.

**Where it lands:** `room_scans` (with `project_id`, 00265) → `room_files` → `/rooms`,
`/room/[id]`, `/room/[id]/file`. In the portal, wave 1 finally mounts `RoomFilesSection`
(`components/room-file/room-files-section.tsx` — complete, tested, and referenced by nothing but
its own file) on the project spread (§6.2).

---

### Flow 5 · A punch item on a trade walk

**Target: 3 taps + 1 hold. Today: impossible from Field, and photoless on web.**

`[G1] §M4` scores this "MISSING both ways." §0.4 shows the write path is already open to Leah.

| # | Act | Surface |
|---|---|---|
| 1 | Tap the shutter (photograph the defect) | C3 card |
| — | **Hold the mic:** *"the base cabinet's scribe is short on the left return"* | C3 |
| 2 | Tap **⋯ → Make it a punch item** on the card | small menu on C3 |
| 3 | Confirm the court (default: **GC**) and tap **Add** | inline, one row |

**Where it lands:**
`create_client_decision(p_decision_id: <device UUID>, p_payload: { designer_client_id, project_id,
title: <first line of transcript>, context: <full transcript>, coordination_kind: 'punch',
court: 'gc', room_id: <project_rooms.id from the visit>, section_key: 'install' })`
— `GRANT EXECUTE … TO authenticated`, verified
(`00413_configuration_com_and_decision_selection.sql:2603-2609`); payload keys verified
(`:1828-1833`); `p_decision_id` is caller-supplied, so the device outbox gets idempotency free.

In the portal it appears exactly where a punch item appears today: the coordination band's court
groups (`components/document/coordination/court-group.tsx`, mounted from
`schedule/schedule-spine.tsx:1038`), the `decision` margin branch, and the Desk's
`overdue_decision` need kind. **Zero new portal code.**

⚠ Two real blockers, both named in §7.3: `designer_client_id` is not on Field's `FieldProject`
DTO, and **the photo has nowhere to attach** — `[D3] §Stage 8` verified the composer has no
attachment affordance and `[G1] §9` verified there is no project-general photo table in the
schema. Direction A's wave-3 answer is the cheap seam `client_decision_options.image_url`
(`use-decisions.ts:57`) plus a `field_capture_id` reference in `context`; the honest answer needs
ruling **A-05**.

---

### Flow 6 · A market day (the sourcing visit)

**Target: 1 tap per specimen; 2 taps to tag one to a project. Today: 1 tap, or ~6 to place.**

| # | Act | Surface |
|---|---|---|
| 1 | Today → **+ Start a visit → Sourcing** → venue name (GPS-prefilled from `LocationService`) → optionally tap ≤4 *projects in mind* | V0 |
| — | For each piece: tap the shutter → C3 card → **Save** (destination = Library, inherited) | 1 tap after the shutter |
| — | For a piece that belongs to a project: tap its chip on the C3 card before Save | +1 tap |

**Where it lands:** unchanged from today's library path —
`commit_field_capture(p_destination:'library')` mints `products(layer='personal',
capture_source='field_capture', field_capture_id, capture_provenance)`
(`00235:239-266`), which renders on `/library`'s My Library shelf. A chipped piece additionally
takes the `place_product_in_project` post-commit step already implemented in
`ProjectPlacementOrchestrator` (lookup-before-write on
`project_ffe_specs.routing_source->>captureId`, tested in `ProjectPlacementTests`).

Two fixes ride along, both from `[G1] §3`:

- **`applySmartGuess` stops lying.** `ViewfinderModel.swift:413-421` hardcodes *every* photo as
  `category = seating` @0.72 and `material = "Oak / bouclé"` @0.6 with
  `ProvenanceSource.smartGuess` (re-read this session at those exact lines). Those values ride
  `payload.guesses` + `payload.provenance` into `products.capture_provenance`. Swap in the real
  `HeuristicSmartGuessService` — real `VNClassifyImageRequest`, already Simulator-safe, already
  built, currently reachable only behind the N5 sheet the photo path never opens.
- **Provenance becomes legible.** `products.capture_source` is never read by the portal
  (`grep capture_source apps/designer-portal/src` → nothing, `[D3] §Stage 4`). One chip on the
  Library card — *"Field · High Point, Mar 2026"* — makes a market find distinguishable from a
  pasted URL six months later.

---

### Flow 7 · End the visit

**Target: 2 taps. Today: no such act exists.**

| # | Act | Surface |
|---|---|---|
| 1 | Today → the open visit row → **End visit** (or the Companion strip's action) | V0 → **V4 Visit review** |
| 2 | Skim what the visit produced — captures, notes, the scan, anything unfiled — tap **Done** | V4 |

`CaptureSessionContextStore.endVisit(identity:now:)` already exists (`:150-161`) and has zero
callers outside its own file. This flow is its first.

**Where it lands:** V4 is a *review*, not a triage queue — every row is already filed. Its only
acts are *Change room* on a row and *File* on an unfiled roving capture. If everything is filed,
V4 is a receipt: *"12 captures, 3 notes, 1 scan — all on Maple St."*

---

### Flow 8 · She opens the portal — no inbox step

**Target: field material is already where she would look for it. Zero triage acts.**

| What she captured | Where it already is |
|---|---|
| A room scan | **Room files** block on the project spread of `/doc/[id]` — `RoomFilesSection` mounted (§6.2); plus `/rooms` and `/room/[id]` (`useRoomRoster` → `room_scan_documents`, already works for designer-owned scans) |
| A voice note | **The margin rail** of `/doc/[id]`, as a `note` item with a play button and a photo strip (§6.3) |
| A site photo | On the note it was taken with; on the room's card in the Visits block |
| A punch item | The coordination band's GC court + the `decision` margin branch |
| A market find | `/library`, My Library shelf, with a **Field** provenance chip |
| A piece placed to a room | The FF&E schedule, via `place_product_in_project` |
| The visit itself | The **Visits** block on the project spread: one line per visit, date, room, counts (§6.4) |

**There is no card to clear, no queue to drain, and no `NeedKind` to add.** That is the whole
point of the direction.

---

## 4 · Screens

Legend: **NEW** · **MOD** (modified) · **RE-HOMED** (kept, different role) · **RETIRED** (still
compiles, off the default path) · **DELETED**.

### 4.1 W1 → **Today** — MOD

`Features/Work/WorkDashboardScreen.swift` + `WorkDashboardModel.swift`.

**Layout.** A vertical scroll on `CaptureColor.paper`, `.padding(.horizontal, 20)`, unchanged.

- **Header** (unchanged): studio name in `CaptureType.eyebrow` uppercase / greeting in
  `CaptureType.display` / `CaptureDates.dayHeading(Date())` in `CaptureType.callout`. Right:
  the existing `cameraRealmButton` (a11y `field.realm.camera`).
- **NEW — the Today band**, directly under the header, above *Needs you*:
  - **Open-visit card** (when one exists): a filled `CaptureColor.verdigris.opacity(0.14)`
    rounded rect, 14pt radius (matching `cameraRealmButton`'s treatment). Line 1: a filled dot +
    the visit label in `CaptureType.bodyEmph`. Line 2: `started 9:14am` + counts
    (`12 captures · 1 scan · 3 notes`) in `CaptureType.footnote`, `CaptureColor.inkSoft`.
    Trailing: a **Camera** button. Tapping the card body opens V0.
  - **Suggested rows** (wave 4, from EventKit/`CLVisit`): title + time + kind, in the
    `WorkAttentionSection` row idiom so nothing new is invented. Tapping starts the visit.
  - **`+ Start a visit`** — always present, always last, `RouteActionButton(kind: .primary)`.
- **Attention sections** (unchanged): *Needs you* (terracotta), *Waiting on others* (warning),
  *Moving today* (verdigris), each via `WorkAttentionSection` with its existing empty text.
- **Browse** (unchanged): the six-tile `LazyVGrid` — Projects · Leads · Decisions · Messages ·
  Receiving · Site scan (`:288-330`).

**Primary action:** Start / resume a visit. **Secondary:** camera; any attention row; any browse tile.

**States.**
- *Empty (no visit, nothing needs her):* header + `+ Start a visit` + the three empty attention
  lines. Never a blank screen.
- *Offline:* the Today band renders from cache with a hairline `wifi.exclamationmark` line —
  *"Showing what's on this phone."* The existing per-source `loadIssues` block (`:230-260`)
  keeps its Retry buttons and is not duplicated.
- *Syncing:* `n queued` on the open-visit card's second line; tap → U1.
- *Stale visit:* the card swaps its subtitle for *"Still at Maple St?"* with **Resume** /
  **End visit**.
- *Needs review:* rejected outbox rows already surface via *Needs you*
  (`FieldAttentionBuilder`, `FieldAttention.swift`) — Direction A adds nothing here.

### 4.2 C1 Viewfinder — MOD

`Features/Capture/ViewfinderScreen.swift` + `ViewfinderModel.swift`.

Two changes, both in the top bar (`ViewfinderScreen.swift:103-115`):

- `ViewfinderWorkButton` relabels **WORK → TODAY** (id `field.realm.work` unchanged so the
  harness and analytics keep working).
- `ViewfinderVenueChip` (`ViewfinderControls.swift:43`) becomes the **visit chip**: two lines —
  project on top in `CaptureType.footnote` emphasis, room beneath in `CaptureType.caption`,
  `CaptureColor.inkSoft`. **Tappable**, presents `.visit`. States:

| Visit state | Chip |
|---|---|
| Site visit, room chosen | `Maple St` / `Living` |
| Site visit, whole house | `Maple St` / `Whole house` |
| Sourcing | `High Point 214` / `Library` |
| Roving | `Unfiled` / `Tap to place` — in `CaptureColor.terracotta`, the app's attention colour |
| Locating | `Locating venue…` (today's string, unchanged) |

Third change, non-visual: **render `OfflineQueueBanner`.** It is dead code today, referenced only
inside its own `#Preview` at `Features/Resilience/OfflineQueueBanner.swift:83-84` (`[G1] §O9`).
Direction A mounts it as a thin strip beneath the top bar, driven by a new `NWPathMonitor`
(`grep -rn "NWPathMonitor" apps/mobile/Capture` → **zero hits**, re-verified) whose
`.satisfied` transition also fires `sync.drain()` + `siteScan.resumePendingUploads(retryFailures: false)`.

### 4.3 V0 **Visit** — NEW (sheet `.visit`)

The door. One sheet, three steps, `.presentationDetents([.large])`, matching S1's chrome
(`RouteSheetHeader`, `CaptureColor.paper3`).

```
┌───────────────────────────────────────────────┐
│  VISIT                                    ✕   │   RouteSheetHeader, eyebrow + close
│  Where are you today?                         │   CaptureType.display
├───────────────────────────────────────────────┤
│  ( Site visit )  ( Sourcing )  ( Roving )     │   segmented, 44pt min height
├───────────────────────────────────────────────┤
│  Search projects…                             │   text filter, no keyboard on open
│                                               │
│  ● Maple St residence        last visit Fri   │   recent-first
│    Kippley residence         3 rooms          │
│    Harbor loft               ⚠ on this phone  │   ⚠ = cached, not refreshed
│  ─────────────────────────────────────────    │
│  + New project                                │   → S2 (existing)
├───────────────────────────────────────────────┤
│  ROOM                                         │   step 2, appears after a project is picked
│  ( Whole house )  Living  Dining  Primary …   │   merged specRooms + rooms (§0.2, §7.4)
├───────────────────────────────────────────────┤
│              [  Start visit  ]                │   primary; disabled until a project (site kind)
└───────────────────────────────────────────────┘
```

**Primary:** Start visit. **Secondary:** New project (S2); switch kind; on an already-open visit
the primary becomes **Change** and a destructive **End visit** appears in the footer.

**States.** *Empty* (no projects at all): a `PatinaEmptyState`-shaped line pointing at
`+ New project`. *Offline*: every uncached project row is absent and the list is captioned
*"12 projects on this phone. Others need signal."* — never a spinner, never an empty list
(R108.5 honesty). *Sourcing*: the project list is replaced by a venue-name field GPS-prefilled
from `LocationService`, plus a *Projects in mind* multi-select capped at four. *Roving*: both
steps hide; the primary reads **Start** and the chip will read `Unfiled`.

### 4.4 C6 **Voice** — NEW (fifth `CameraMode`)

Not a sheet. A full-bleed mode of the viewfinder, so it inherits the visit chip, the offline
banner, and the mode selector.

```
        TODAY                       ⛰            ← pill + visit chip, unchanged
        Maple St / Living

        ┌─────────────────────────────────────┐
        │                                     │
        │   "the alcove on the north wall     │   live transcript, Playfair-adjacent
        │    is about forty-two and three     │   CaptureType.title2, rising, max 6 lines
        │    quarters — we should check the   │
        │    return before we spec the…"      │
        │                                     │
        └─────────────────────────────────────┘

              ▁▂▃▅▇▅▃▂▁▂▃▅▇▅▃▂▁                 ← waveform (from the existing engine tap)
                    2:14  ·  seg 3              ← elapsed + segment counter (§5.2)

        (photo) (tag) (measure) (scan) [VOICE]   ← ViewfinderModeSelector, 5th case
                    (  ●  hold  )                ← the mic, shutter-sized, shutter-placed
```

**Primary:** hold the mic. **Secondary:** *Type instead* (the existing `VoiceNoteSheet`
`TextEditor` fallback, `:200-212`, which is what the Simulator always shows); *Add a photo*
(swaps to photo mode, keeps the note).

**States.**
- *Idle:* the mic, and one line — *"Hold to talk. It lands on Maple St · Living."* The promise is
  stated **before** she speaks, not after.
- *Recording:* waveform + rising transcript + elapsed + segment counter. Persistent, unmissable
  recording chrome (§5.6).
- *Interrupted* (call, Siri, route change): *"Paused — your note is saved. Tap to keep going."*
  A resume opens audio segment N+1 (§5.3).
- *Recognizer unavailable / denied:* falls straight to the typed editor — but from wave 2
  **the audio still records**, which inverts today's all-or-nothing behaviour and is the single
  most important honesty fix in the direction (§5.1).
- *Offline:* nothing changes. Recognition is on-device; the outbox absorbs the rest.
- *Cap reached* (20 min, §5.2): recording stops with a visible *"note ended at 20:00"* — never
  a silent stop.

### 4.5 C3 Quick-confirm card — MOD

`Features/Capture/CaptureCardOverlay.swift`. The post-shutter paper card. Direction A adds three
things to it and, in doing so, deletes four screens from the common path.

```
┌──────────────────────────────────────────────┐
│   ▢ thumb   Seating · 72%                    │   ← the guess, now from the REAL service
│             Oak / bouclé · 60%               │
│                                              │
│   Maple St · Living            ⌄             │   ← NEW: the inherited placement, one tap to change
│   ─────────────────────────────────────────  │
│   ●  hold to add a note                      │   ← NEW: inline mic. No sheet, no specimen hop.
│                                              │
│   [ Save ]        Add detail        ⌄ swipe  │
└──────────────────────────────────────────────┘
```

- **Placement line** — project · room, tap → `.visit`. On a *sourcing* visit this row is the
  **projects-in-mind chips** instead.
- **Inline mic** — the same `VoiceNoteService` the N4 sheet uses, hosted on the card. This is
  what collapses Flow 2 from 7 taps to 2: today reaching voice costs *Add detail* → C5 →
  *Voice* → N4 → *Attach note* → back to C5 (`[D1] §8`).
- **Save** goes straight to route, because the destination is already known from the visit kind
  — the `destination == .undecided → present(.destination(id))` branch
  (`ViewfinderModel.swift:280-284`) does not fire inside a visit.

### 4.6 C5 Specimen sheet — MOD

`Features/Specimen/SpecimenSheetScreen.swift` (374 ln). Unchanged except: the project/room fields
become an **inherited, read-only line** with a *Change* link → `.visit`, and **Save** routes
directly instead of presenting S3 (`:157`).

### 4.7 S1 Assign & venue — RE-HOMED

`Features/Route/S1AssignVenueScreen.swift` (490 ln) stops being *"the only screen that can set a
project"* and becomes *"the screen that corrects one capture."* It keeps its full form —
project · project-room · **FF&E schedule slot** · shelf · editable venue label — because the FF&E
placement menu (`No line` / `Create a new line` / `Fill an empty slot` → `place_product_in_project`)
has no other home and is genuinely per-capture. It is reached from V3 specimen detail and from
V4's *Change room*, never from the shutter.

Its header copy changes: *"Route this capture"* → *"Correct this capture"*.

### 4.8 S3 Destination — RETIRED from the default path

`Features/Route/S3DestinationScreen.swift` remains the only caller of `sync.route()` and is not
deleted. Inside a visit it is skipped: the destination is a property of the visit kind. It stays
reachable from V3 and from the recovery path in `saveFromCard()`'s `catch` (`:290-294`), which
`[D1] §5a step 6` documents as the deliberate recoverable-choice seam.

⚠ This also retires a defect: `hasUnconfirmedGuess` is *always true* because of the hardcoded
guess (§Flow 6), so **S3 currently recommends Inbox for every capture ever taken**. Fixing the
guess and skipping S3 close it from both ends.

### 4.9 V1 Session tray → **the visit's tray** — MOD

`Features/Session/V1SessionTrayScreen.swift`. The list is unchanged. The footer changes:

- *"Route all N"* — which routes exactly one record
  (`if let first = items.first { coordinator.present(.assignVenue(first.id)) }`, `:126`,
  re-verified) — is **removed**, because under a spine there is nothing to route.
- Replaced by **"End visit"** → V4, and **"Review each"** → V2 cull deck (unchanged; V2's
  `sync.routeAll(ids, to: .inbox)` at `:238` is the one real `routeAll` caller and stays).

### 4.10 V4 **Visit review** — NEW (route `.visitReview`)

The end-of-visit receipt. A grouped list: *Captures* · *Notes* · *Scans* · *Unfiled*.

Row: thumbnail (or a mic glyph), the title or first transcript line, the room, the sync state.
Row acts: *Change room* → S1; *File* (unfiled only) → V0's picker; *Play* (wave 2). Footer:
**Done**. Empty state: *"Nothing captured on this visit."* + **End anyway**.

⚠ If *Unfiled* is non-empty, **Done** is captioned *"3 captures still unfiled — they'll wait on
Today."* Honest, non-blocking (R108.5).

### 4.11 F1 Scan setup — MOD

`Features/SiteScan/SiteScanSetupScreen.swift`. Collapses to a one-line summary when a visit is
open, expanding automatically if the visit's project is absent from `ownableProjects()` (Flow 4's
tiebreak).

### 4.12 SiteScanContextScreen (non-Pro) — MOD

`Features/SiteScan/SiteScanContextCapture.swift:250-280`. Two changes:

- Give it a real `CaptureScreenID` case. It sets `screen.F1.context`, which is **not** an enum
  case, so it is invisible to `capture-shots.sh` and to the `-CaptureScreen` harness
  (`[D1] §6`) and has never appeared in a screenshot sweep.
- Its three ESCALATE-class strings (`:261`, `:264`, `:267`) get finally worded (§8.4). The third
  — *"This device has no LiDAR, so this isn't a scan — these land in your Inbox"* — **must** be
  rewritten anyway, because Direction A has no Inbox. PROPOSED: *"This iPhone can't measure a
  room. These photos and notes go to Maple St · Living."*

### 4.13 Portal screens

| Surface | Change | Waves |
|---|---|---|
| `/doc/[id]` project spread | **Room files** block (mount the existing unmounted `RoomFilesSection`) + a new **Visits** block | 1 |
| `/doc/[id]` margin rail | The existing `note` item gains audio playback + a photo strip when it carries a `field_capture_id` | 2 |
| `/doc/[id]` Discovery | `SiteScanEditor`'s picker unions designer-owned scans | 1 |
| `/doc/[id]` letterhead | "The scan" instrument unions designer-owned scans | 1 |
| `/room/[id]/file` | Unchanged (its capture-context list starts rendering thumbnails once §6.1 lands) | 1 |
| `/desk` | **No new population.** One need-line for a visit left open > 12 h | 3 |

### 4.14 Deleted

- `FieldPlaceholderScreen` (`CaptureKit/Design/FieldPlaceholderScreen.swift`) — the Phase-2 freeze
  placeholder, zero references now every wave has shipped (`[D1] §DEAD`).
- The two hardcoded literals in `ViewfinderModel.applySmartGuess` (`:413-421`).
- `LowLightTorchOverlay` — preview-only dead code (`:122`); C1's real low-light UI is
  `ViewfinderNightChip` / `ViewfinderTorchPill` / `ViewfinderLowLightHint`. Delete or wire; do
  not leave it ambiguous.

---

## 5 · Voice notes in this direction

### 5.1 The rule that governs everything below

> **The audio is the record. The transcript is a reading of it.**

`[G1] §0.1` and `[T1]`'s headline correction both establish, from source, that no audio has ever
left a Field device: `SpeechVoiceNoteService.swift:22-23` declares `private let mediaDirectory: URL?`
(stored in `init`, never read) and `private var audioFilename: String?` (only ever read, at
`:107`, assigned nowhere), while its own header comment claims the opposite. Repo-wide there are
**zero** `AVAudioFile` / `AVAudioRecorder` hits.

The consequence is worse than a missing feature. `SiteScanContextCapture.stopVoice` (`:129`)
gates on `!transcript.isEmpty || result.audioFilename != nil`. With `audioFilename` permanently
nil, **a note that transcribes to nothing on a noisy site is discarded with the toast "Nothing
recorded."** She spoke; nothing was kept. That is a live violation of a law this house has ruled
four separate ways (R108.5, R110/FR-10, R113, R114.1) and it is the first thing wave 2 fixes.

### 5.2 Recording

Write the file from the **existing** `AVAudioEngine` input tap (`:74-76`) — no second
`AVAudioSession`, no `AVAudioRecorder`:

- **AAC-LC in `.m4a`**, mono, 32 kbps ≈ 240 KB/min. Nothing downstream changes:
  `LocalCaptureSyncService.mimeType` already maps `m4a → audio/x-m4a` (`:661`), the
  `capture-media` bucket already allows `audio/mp4, audio/x-m4a, audio/aac, audio/wav`
  (`00234:26-29`), `uploadMedia` already uploads the voice file and sets `payload.voice.audioPath`
  (`:313`), and `CaptureStore.missingRequiredMedia` already treats `voiceAudioFilename` as
  required media (`:517-521`). **All of it is dead code that becomes live and correct the moment
  the writer lands.**
- **A failed `AVAudioFile` open is non-fatal.** Recognition continues, the note ships
  transcript-only, and `voice.audio_write_failed` is recorded. Never block a capture.
- **Rotate the recognizer, never the file.** `SFSpeechRecognizer` caps at roughly one minute of
  audio per request (`[D6] §A1`), and today one request covers the whole session — so any note
  over a minute silently truncates. Restart the request every ~50 s, appending each finalized
  `bestTranscription.formattedString`; the `AVAudioFile` stays one continuous file. Boundary word
  loss is acceptable *because the audio is the record*.
- **Cap at 20 minutes / 24 segments** and end visibly.
- **Set `requiresOnDeviceRecognition`.** It is never assigned anywhere in the file, so despite the
  shipped permission string *"Transcribes your voice notes on-device"* (`generate_project.rb:87`),
  recognition may be going to Apple's servers. PROPOSED:
  `request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition`, and record
  which path ran.

### 5.3 Interruptions

Nothing in the app observes `AVAudioSession.interruptionNotification` today (grep: no hits).

| Event | Behaviour |
|---|---|
| Interruption `.began` (call, Siri, alarm) | Finalize the segment, release the `AVAudioFile`, mark the note `interrupted`, keep everything written. C6 shows *"Paused — your note is saved."* |
| `.ended` with `.shouldResume` | Open **audio segment N+1**; the note carries an ordered array of paths |
| `mediaServicesWereReset` | Rebuild the engine; same segment-N+1 rule |
| Route change (AirPods yanked) | Keep recording on the new route; one honest line |
| Backgrounded / locked | **Stops** in waves 0–4. No `UIBackgroundModes` key exists anywhere (`[D7] §8`). Ruling **A-08**. |

### 5.4 Transcript

- The on-device transcript lands in `field_captures.voice_transcript` with
  `transcript_source='device'` and — as today — is *also* written into the specimen's `note` field
  with `ProvenanceSource.voice` (`VoiceNoteSheet.attach()`, `:200-212`).
- **It is labelled a draft, once, where she reads it** — one italic line under the note in the
  margin: *"A first reading. The recording is here."* No mechanism talk. Never the two-letter
  abbreviation; the capability, if ever named, is **Designer-Taught Intelligence** (G-12; PRD §13;
  `.agents/skills/patina-brand-voice/SKILL.md`).
- If wave 5 ever adds server re-transcription, R114.1's two-tier trust governs: the server text
  lands in a **new** `server_transcript` column, `voice_transcript` is **never** overwritten, and
  an edited transcript (`transcript_edited_at IS NOT NULL`) is never silently replaced —
  *"a clearer read of this note"*, one tap to view, one tap to accept.

### 5.5 Structured items — and why they are not in this direction's first four waves

`[T1] §1.10` designs the extraction well and it should be built eventually. Direction A defers it,
for a reason specific to this direction: **the marginal value of structuring collapses once the
note is already in the right document.** A note that says *"we need to swap that faucet"*, sitting
in the margin of the Maple St document with a play button, is a task Leah can act on in one
glance. Extracting it into `project_tasks` saves her one tap and costs a table, an RPC pair, an
agent-queue kind, two edge functions, two crons, a confirm sheet on two surfaces, and a
hallucination surface.

**What Direction A ships instead, in wave 3:** two explicit, designer-initiated verbs on a note —
**Make it a task** and **Make it a punch item** — using the write paths verified in §0.4. She
decides; nothing is inferred; nothing auto-applies (which also sidesteps ruling K-04 entirely).

Wave 5, if ruled in, adds the `[T1]` pipeline behind the same two verbs — the model pre-fills the
sheet instead of her typing. The UI does not change. That is the correct order.

### 5.6 Consent and retention

`[T1] §1.13` is right that this is the part most needing a lawyer, and Direction A adopts its
controls with one addition the spine makes natural:

1. **Never ambient.** Recording begins and ends on a deliberate act. (Also forced by iOS: a
   background trigger cannot start a recording, `[D6] §D`.)
2. **A note is *solo* or *conversation*, chosen at start.** A conversation note shows a one-line
   *"Everyone here knows this is being recorded"* affirmation. It is a nudge, not legal advice —
   but it converts an invisible act into a deliberate one.
3. **Direction A's addition: the visit carries the default.** A *client walk-through* visit
   defaults every note to `conversation`; a *site* or *sourcing* visit defaults to `solo`. The
   door question does consent work too.
4. **Unmissable in-app recording chrome**, plus wave 4's Live Activity.
5. **Retention is a policy, not an accident.** PROPOSED `audio_retention ∈ keep |
   discard_after_transcript | 90_days`, default `90_days`, purged by a daily cron mirroring
   `site-request-media-maintenance`'s shipped 90-day purge (00375). Ruling **A-07**.
6. **Studio-private by default.** `margin_notes` is explicitly designer-authored, studio-visible,
   never client-visible (`use-margin-notes.ts:1-8`). A field note inherits that posture. Anything
   that would become client-visible is a separate, deliberate act.
7. ⚠ **No recording-consent policy exists anywhere under `docs/`** (`[T1] §1.13`, grep for
   "consent" hits only SMS consent and `project_parties.sms_consent_status`). Wisconsin is
   one-party; Leah's clients are not guaranteed to be. Ruling **A-09**.

---

## 6 · The portal side

Direction A's portal work is deliberately small, because the phone does the filing. Five changes,
one of which is a hard prerequisite.

### 6.1 Prerequisite — sign `capture-media` (wave 0)

`grep -rn "capture-media" apps/ packages/` returns **nothing** outside `apps/mobile/Capture`
(`[D3] §0.2`, `[G1] §O5`, re-verified). Until web code can sign a URL from that bucket, every
field photo and every second of field audio is unreadable and every surface below is cosmetic.

**PROPOSED** `packages/supabase/src/hooks/use-capture-media.ts`:

```ts
export function useCaptureMediaUrls(paths: readonly string[], ttlSeconds = 3600)
// batched supabase.storage.from('capture-media').createSignedUrls(paths, ttl)
```

The pattern exists twice already: `letterhead-instruments.tsx:118-130` (batched
`createSignedUrls` over `room-scans`) and `useFieldMediaUrl` in `use-party-sms.ts` (MMS). This is
the cheapest high-value unit of work in the whole program, and it lights up
`capture-context-section.tsx` — whose docstring says signing was *"out of this slice's scope"* —
as a free side effect.

### 6.2 Mount what already exists (wave 1)

- **`RoomFilesSection`** (`components/room-file/room-files-section.tsx`) is complete, tested, and
  referenced by nothing but its own file — its docstring calls it *"the project detail page's
  Room Files zone"* and it returns `null` when a project has no room-file-bearing scans, so
  mounting it is safe and quiet. Mount it on the project spread of
  `app/(document)/doc/[id]/page.tsx`, between `<ScheduleSpine>` (`:1354`) and `<FFESection>`
  (`:1360`).
- **Union designer-owned scans into the two existing attach points.** Both filter to
  client-owned scans today: `useClientScans` in `letterhead-instruments.tsx:87-95`
  (`room_scans.user_id = clientProfileId`) and `useClientRoomScans`
  (`use-room-scans.ts:185-214`, `user_id = designer_clients.client_id`), which feeds Discovery's
  `SiteScanEditor` (`editors.tsx:295-325`). *A designer literally cannot attach her own site scan
  to her own project's document today.* Both are one-hook changes.

### 6.3 The margin — no new kind (wave 2)

`[D3] §10 rec 5` and `[T1] §2.5` both propose adding a `field_note` branch to the `margin_items`
view, copying the `field_sms` branch (`00282:871-899`). **Direction A declines**, deliberately.

A field note *is* a note. It is authored by the designer, it is studio-private, it escalates the
same way, it belongs in the same aged-oak lane. Giving it its own kind builds a field ghetto in
the margin and tells Leah that what she said on site is a different species from what she typed
at her desk. It is not.

Instead:

1. `margin_notes` gains **one nullable column**, `field_capture_id uuid references field_captures(id)`
   (migration 00515, §7.2).
2. The **existing** `note` branch of `margin_items`
   (`00197_margin_items_note_branch.sql`) adds two facts to its `payload` JSONB —
   `field_capture_id` and `has_audio` — with no new branch, no new kind, no
   `lib/document/margin-derivation.ts:11-19` union change, and no new accent.
3. `components/document/margin-bodies.tsx`'s note case renders, when
   `payload.field_capture_id` is present: a **play button** (signed via §6.1), a small photo
   strip, and the italic draft line from §5.4. The existing escalate acts
   (`useEscalateNoteToDecision`, `useEscalateNoteToScopeChange`) are untouched and now work on
   field notes for free.

### 6.4 The **Visits** block (wave 1)

New, small, on the project spread beside Room files.

```
  VISITS
  ─────────────────────────────────────────────────────────
  Tue Aug 25 · Living, Dining        12 photos · 3 notes · 1 scan
  Fri Aug 15 · Whole house            4 photos · 1 note
  ─────────────────────────────────────────────────────────
```

One line per `field_captures.visit_id` on this project, grouped in the hook, newest first. Tapping
a row expands to the captures with their thumbnails and transcripts. Read-only. This is what
replaces an inbox: the same information, filed by day and room instead of stacked in a queue.

**Naming check** (G-8/G-9/G-10): *Visits* collides with nothing. "Capture Inbox" is doubly taken
(`field_captures` and `proposal_captures`, I84) — Direction A has no inbox to name. "Request" has
three live senses (R98 / Site Requests / SMS coordination items). "Field kit" is
`components/document/discovery/field-kit.tsx`, form-field primitives. And *"site visit"* is
already the product's own vocabulary (`project_time_entries.activity`, 00177).

### 6.5 The Desk (wave 3)

**No new population, no new `NeedKind`, no `document_state` column.** One addition to
`FieldDesk`'s existing soft need-lines (`components/document/field/field-desk.tsx` — *"Two
populations, both actionable, never KPI tiles"*): a line when a visit has been open more than 12
hours. *"Maple St · visit open since Tuesday."* That is the only Desk surface Direction A asks for.

### 6.6 Flags

**PROPOSED: no new portal flag, and Direction A ships the portal changes unflagged.**

G-22 is a real trap: `room-file` and `call-sheet` are fail-closed and between them make most of
the existing field surface dark by default, and MEMORY.md records at least four surfaces whose
flag *"has never been seen by a human."* Landing this behind a third dark flag makes it unwalkable.

It is safe to ship unflagged because every change is a **read of data that only exists if a Field
build wrote it**: `RoomFilesSection` already returns `null` with no scans, the Visits block
renders nothing with no visits, and the margin note branch only lights when `field_capture_id`
is set. A designer with no Field build sees exactly today's portal.

On the phone, the "flag" is the **build** — a TestFlight pilot group. `[D7] §7` confirms Field has
no feature-flag mechanism at all; wave 0 adds `isFeatureEnabled` to the `CaptureAnalytics` seam
anyway (three files, fail-closed) so a later kill switch exists. Ruling **A-10** (and its harder
half, **A-12**: is TestFlight a dependency at all, given no fastlane / archive step / confirmed
ASC record exists — `[D7] §9`).

---

## 7 · Data and back-end touchpoints

### 7.1 Migration 00514 — the visit, and the routing fix

⚠ **Numbering.** Filesystem max is `00513_invoice_numbering_studio_uniqueness.sql`; gaps at
00487, 00488, 00496, 00497, 00502–00509; **00512 is parked and unapplied** on
`followon/sd-caller-hardening-00512`, so prod's ledger head is 00513 with a hole at 00512. Mint
from **00514** and re-verify the live ledger (`supabase migration list` against Strata) before
writing a byte (G-15, `[T1] §2`).

```sql
ALTER TABLE field_captures
  ADD COLUMN IF NOT EXISTS capture_kind text NOT NULL DEFAULT 'specimen'
    CHECK (capture_kind IN ('specimen','note','context')),
  ADD COLUMN IF NOT EXISTS visit_id  uuid,          -- the device's visitID; no FK, no visits table
  ADD COLUMN IF NOT EXISTS visit_kind text
    CHECK (visit_kind IS NULL OR visit_kind IN ('site','sourcing','roving')),
  ADD COLUMN IF NOT EXISTS visit_label text,
  -- voice, wave 2 (shipped in 00514 so the wire contract lands once)
  ADD COLUMN IF NOT EXISTS voice_audio_segments jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS voice_audio_sha256   text,
  ADD COLUMN IF NOT EXISTS voice_audio_purged_at timestamptz,
  ADD COLUMN IF NOT EXISTS audio_retention text NOT NULL DEFAULT '90_days'
    CHECK (audio_retention IN ('keep','discard_after_transcript','90_days')),
  ADD COLUMN IF NOT EXISTS transcript_source text
    CHECK (transcript_source IS NULL OR transcript_source IN ('device','device_partial','designer')),
  ADD COLUMN IF NOT EXISTS transcript_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS note_setting text
    CHECK (note_setting IS NULL OR note_setting IN ('solo','conversation'));

CREATE INDEX IF NOT EXISTS idx_field_captures_visit
  ON field_captures (project_id, visit_id, created_at DESC)
  WHERE project_id IS NOT NULL;

-- Carried unbuilt since R112/R113 ([D4] §4 item 9). useScanContextCaptures does a
-- @> containment filter (use-room-files.ts:378) that is a seq scan today.
CREATE INDEX IF NOT EXISTS idx_field_captures_provenance_gin
  ON field_captures USING gin (provenance jsonb_path_ops);
```

**And the fix without which the direction does not work.** `commit_field_capture`'s initial
INSERT never sets `project_id`/`project_room_id` at all (`00235:95-146`, re-read this session),
and its inbox branch sets only `status` (`:204-217`); only the library branch persists routing
(`:255-266`). Under a spine **every** note-shaped capture goes to the inbox path, so every note
would arrive with no project column. `CREATE OR REPLACE FUNCTION commit_field_capture` with the
same signature, adding:

```sql
  IF p_destination = 'inbox' THEN
    UPDATE field_captures
       SET status          = 'inbox',
           project_id      = COALESCE(p_project_id, project_id),
           project_room_id = COALESCE(p_project_room_id, project_room_id),
           shelf           = COALESCE(p_shelf, shelf)
     WHERE id = v_capture.id
    RETURNING * INTO v_capture;
```

Safe because `field_captures_guard_routing` runs `BEFORE UPDATE` under `SECURITY INVOKER`
(`00233:196-256`) and rejects a project the caller doesn't own or a room outside it.

**RLS.** Inherit the five existing policies unchanged, with one hardening: they carry **no
`TO authenticated` clause** (`00233:154-188`), so they default to `PUBLIC`. Harmless today
(`auth.uid()` is null for `anon`) but against house convention after the mood-board incident.
Restate all five `TO authenticated` — one line each, no behaviour change.

**No visits table.** `visit_id` is an opaque device-minted UUID used only for grouping. A visit is
a device concept; giving it a server table would mean a second lifecycle to keep in sync for no
read the portal actually needs. (inference: revisit if cross-device visit resumption is ever
wanted.)

### 7.2 Migration 00515 — the note in the margin (wave 2)

```sql
ALTER TABLE margin_notes
  ADD COLUMN IF NOT EXISTS field_capture_id uuid REFERENCES field_captures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_margin_notes_field_capture
  ON margin_notes (field_capture_id) WHERE field_capture_id IS NOT NULL;
```

Plus a `CREATE OR REPLACE VIEW margin_items` that recreates the prior body **verbatim** and
changes exactly the `note` branch's `payload` to carry `field_capture_id` and `has_audio` —
00282's documented discipline for this view (`00282:600-604`).

⚠ `margin_notes.anchor_kind` is `CHECK (anchor_kind IN ('line','section','letterhead'))`
(`00196:31-32`). Direction A does **not** widen it; a field note anchors to `letterhead`, which is
the view's own default for un-anchored items.

### 7.3 What Field writes, and the two gaps

| Write | Mechanism | Status |
|---|---|---|
| `field_captures` + `capture-media` | `commit_field_capture` via the existing outbox | ✅ shipped, extended by 00514 |
| `room_scans` + bundle | `confirm-scan-bundle` + `merge_scan_artifact_sha256` | ✅ shipped, untouched |
| `margin_notes` | plain insert, `margin_notes_designer_all` | ✅ open to Leah (§0.4) |
| `project_tasks` | plain insert | ⚠ **designer-of-record only** — `projects.designer_id = auth.uid()` (`00169:61-62`). A studio co-member cannot. Ruling **A-11**. |
| `client_decisions` (punch/RFI) | `create_client_decision` | ⚠ needs `designer_client_id`, absent from `FieldProject` (`ProjectsService.swift:19-38`). Fix: add it to the projects SELECT + DTO. |
| `place_product_in_project` | existing post-commit orchestrator | ✅ shipped |
| `receiving_inspections.photo_asset_ids` | already written by iOS | ⚠ **already written, never rendered** — `SupabaseReceivingService.swift:115` → CodingKeys `:250`, while `log-inspection-drawer.tsx:151` hardcodes `[]` and no portal surface reads the column (`[G1] §0.2`). Live defect; wave 3 renders it. |

**No new edge function. No new cron. No new `agent_tasks` kind. No RPC beyond the
`commit_field_capture` replace.** That is the whole server footprint of waves 0–4.

### 7.4 Divergences from `[T1]`, stated plainly

| `[T1]` proposes | Direction A | Why |
|---|---|---|
| `field_note_drafts` table + 3 RPCs (00516/00517) | **Deferred to wave 5** | §5.5 — the note is already in the right place |
| `field_note.structure` agent_tasks kind + `structure-field-note` | Deferred to wave 5 | same |
| `transcribe-field-note` + Workers AI + 2 crons | Deferred to wave 5 | the device draft is sufficient once filed; wave 2's audio corpus is what would justify it |
| A `field_note` branch on `margin_items` (00518) | **Rejected** — extend the `note` branch instead | §6.3 — a field note is a note |
| A Desk "From the field" population + `SmsReviewCard` clone | **Rejected** | §1.4 pt 1 — no triage under a spine |
| `field_captures.server_transcript` | Deferred with the pipeline | |
| — | **New:** `visit_id` / `visit_kind` / `visit_label` on `field_captures` | `[T1]` has no visit concept |
| — | **New:** `margin_notes.field_capture_id` | the landing seam that replaces the drafts table |
| Start at 00514, re-verify live ledger | **Adopted verbatim** | G-15 |
| Restate `field_captures` policies `TO authenticated` | **Adopted verbatim** | |
| Keep the flat dotted provenance keys | **Adopted verbatim** | `use-room-files.ts:378` reads them |
| `capture-media` path + policies unchanged | **Adopted verbatim** | |

**The room question (G-11), answered without a schema ruling.** V0's room picker merges
`FieldProjectDetail.specRooms` (`project_rooms`) and `.rooms` (`public.rooms`), both already
returned by one call (§0.2), matching case-insensitively on trimmed name. Each merged entry
carries up to two ids and the capture stamps whichever is legal for its lane:
`project_rooms.id` → `field_captures.project_room_id`; `rooms.id` → `siteScanContext.projectRoomId`
provenance and `room_scans.room_id`. When a room exists in only one list, that lane is stamped and
the other stays null — never guessed, never cross-assigned. `ContextCaptureProvenance.swift:21`
already refuses to put a `rooms.id` in the `project_room_id` column and that refusal stands.
Ruling **A-04** is whether the *merge-by-name* heuristic is acceptable or whether the two lists
need a real server-side link.

---

## 8 · Migration path from today's app

### 8.1 Kept, untouched

Everything in `[G1] §4`'s ten-item list. Specifically and deliberately:

1. The site-scan rig — one shared `ARSession`, four recorders, the parametric coverage coach.
2. The scan upload chain — container-independent durable keys, background `URLSession`,
   `ScanConfirmPolicy`'s 4xx-vs-unreachable discrimination. **Do not simplify this.**
3. The capture outbox's idempotency and receipt discipline — `clientToken` never regenerated,
   `CaptureTransferPhase.complete` impossible without a `receiptID`, `isDeferrable` vs `isRejected`.
4. Owner scoping — `CaptureOwnerIdentity`, owner-scoped store overloads, `nil`-owner quarantine,
   per-owner serialized drains, 935 lines of `CaptureLifecycleTests` guarding it.
5. The library safe-harbor — `commit_field_capture`'s `EXCEPTION WHEN OTHERS` parking failures
   back to inbox (`00235:272-300`), and `applyCommitResult` trusting server truth only.
6. All eight Work flows. **Decisions stay read-only** — that is a deliberate design (selection is
   the client app's write path), not an omission. Direction A adds punch/RFI *creation*, which is
   a different act from *resolving* a client decision.
7. The SMS rail — the product's only complete field→structure loop, untouched.
8. The Site Request guest loop — SR01–SR20, `sr_` token namespace, the most rigorous outbox in
   the codebase.
9. The private, owner-scoped `capture-media` posture.
10. The frozen wire contracts — `FieldCapturePayload`'s camelCase keys, `ContextCaptureProvenance`'s
    flat dotted keys, `CaptureMediaPath`'s lowercase-both-segments rule, the B-17 semantic-vs-transport
    MIME split.

### 8.2 Re-homed

| Was | Becomes |
|---|---|
| `CaptureSessionContext` — invisible routing memory | **The visit** — the app's spine (§2.4) |
| `WORK` pill / W1 dashboard | **TODAY** — the app's home (§4.1) |
| S1 — the only project picker, orphaned from the capture path | **The correction screen** for one capture (§4.7) |
| S3 — mandatory destination step | Recovery + V3 only (§4.8) |
| V1 footer "Route all N" (routes one) | **"End visit"** → V4 (§4.9) |
| The Companion hearth — decorative, two actions | **The visit banner**, one typed action (§2.3) |
| `ViewfinderVenueChip` — a placemark string | **The visit chip**, tappable (§4.2) |
| `OfflineQueueBanner` — dead preview-only code | **Rendered on C1**, driven by a real `NWPathMonitor` (§4.2) |
| `RoomFilesSection` — unmounted dead component | **Mounted** on the project spread (§6.2) |
| `route_field_capture` / `dismiss_field_capture` — zero web callers since 00235 | Wired into V4 / the Visits block for corrections |

### 8.3 Retired or deleted

- `FieldPlaceholderScreen` — delete (zero references).
- `LowLightTorchOverlay` — delete or wire; do not leave ambiguous.
- `applySmartGuess`'s two literals — delete, call the real service.
- The "unattached capture" as a normal state — retired by construction.
- The **word "Inbox"** in Field's user-facing copy — Direction A has no inbox, and leaving the
  word on the non-Pro context screen (`SiteScanContextCapture.swift:267`) would be a lie.

### 8.4 Copy and placeholder cleanup

Nine files carry ESCALATE-class placeholder copy, all on SiteScan surfaces
(`[D1] §6`): `SiteScanCoachViews.swift` (whole file per its header; `:75`, `:92`, `:124`, `:137`,
`:147`), `SiteScanAnchorViews.swift` (`:55`, `:168-207`, `:246`), `SiteScanContextCapture.swift`
(`:261`, `:264`, `:267`), `FieldCoverageCoach.swift:189`, `CaptureSurface.swift:14,44`,
`CoverageScorecard.swift:55,74`, `ScorecardEvaluator.swift:13,73,81,85`,
`AnchorGate.swift:42,53,136`, `AnchorRecord.swift:39`. There are **zero** `TODO`/`FIXME` markers
in the app; ESCALATE is the repo's convention.

Direction A must finally word **three of them** because it changes their meaning
(`SiteScanContextCapture.swift:261,264,267` — the non-Pro screen now names a project, not an
Inbox). The other six sets are pre-existing debt, and the honest position is that a program
touching the coach surfaces should clear them rather than ship a tenth placeholder beside them.

Stale documentation to fix while in the file:
`CaptureScreenID.swift`'s header says "51 entries" (it has 71, and 74 after §2.2);
`README.md` credits migration 00258 for scan-project linkage (it is
`00265_room_scans_project_linkage.sql`; 00258 is `edge_settings_vault`) and lists
Share/Widget targets that do not exist; `AVFoundationCameraService.swift:6` says "NOT wired into
AppContainer yet" (`AppContainer.swift:111-112` wires it on device);
`AppContainer.swift:88-91` says the freeze leaves the Phase-2 factories returning mocks (every one
returns a real Supabase concrete); and `SpeechVoiceNoteService.swift:7` claims the raw audio is
always kept (§5.1).

---

## 9 · Effort, risks, rulings

### 9.1 Waves

Sizes are per work package (S ≈ ≤3 days, M ≈ 1–2 weeks, L ≈ 3+ weeks of one engineer). Estimates
assume the existing gate (`scripts/capture-gate.sh all`) plus a **device** pass per wave — Speech,
mic, camera, ARKit, and Live Activity are all Simulator-fallback surfaces (`[D7] §3`).

#### Wave 0 — Prerequisites · **~1.5 eng-weeks**

| # | Package | Size | Note |
|---|---|---|---|
| 0-1 | Set `postHogAPIKey` in Field's `Secrets.swift`, ship one build, **confirm `surface='field-ios'` rows appear** | S | `[D7] §6` live-verified **zero** Field events in 180 days vs 6,017 for `patina-ios`. Instrumenting into a dead channel is theatre. |
| 0-2 | `isFeatureEnabled` on `CaptureAnalytics` + `PostHogCaptureAnalytics` + `MockCaptureAnalytics` (fail-closed) | S | `posthog-ios` is already linked and initialized |
| 0-3 | `useCaptureMediaUrls` batched signed-URL hook | S | §6.1 — nothing else works without it |
| 0-4 | Re-verify the live migration ledger against Strata; reserve 00514/00515 | S | G-15; coordinate with the parked 00512 |
| 0-5 | Decide TestFlight (ruling A-12); if yes, stand up an archive path | M | `[D7] §9` — no fastlane, no CI archive, no confirmed ASC record |

#### Wave 1 — The visit spine · **~5–6 eng-weeks** · *the direction, minus voice*

| # | Package | Size |
|---|---|---|
| 1-1 | **Foundation edit, once:** `CaptureSheet.visit`, `CameraMode.voice`, 3 new `CaptureScreenID` cases + the `screen.F1.context` orphan fix | S |
| 1-2 | Visit model — extend `CaptureSessionContext` (kind/label/scanRoomID/projectsInMind/endedAt), the >30 min confirm rule, the 12 h auto-end, `endVisit` wired | M |
| 1-3 | **Offline project + room cache** — a new `@Model` holding projects, `specRooms`, `rooms`, refreshed on every successful W1/P1/V0 fetch; additive to `CaptureStore.schema` (`:41-45`, no `VersionedSchema` exists, so keep everything optional/defaulted) | **L** — the largest new subsystem, no precedent in the app |
| 1-4 | V0 visit sheet — 3 kinds, 3 steps, merged room picker, offline states | M |
| 1-5 | Today band on W1 + launch routing (§2.1) + the Companion visit banner | M |
| 1-6 | C1/C3/C5 visit chip + inherited placement + `saveFromCard` skips S3 | M |
| 1-7 | **The §0.3 fix** — `makeDraft` copies `projectRoomID`; regression test | S |
| 1-8 | **`applySmartGuess`** → `HeuristicSmartGuessService` | S |
| 1-9 | `NWPathMonitor` → drain + resume; render `OfflineQueueBanner` | S |
| 1-10 | V1 footer → End visit; V4 visit review | M |
| 1-11 | F1 collapse + the `ownableProjects()` tiebreak | S |
| 1-12 | Migration **00514** (visit columns, capture_kind, GIN index, `TO authenticated`, **inbox-branch routing fix**) | M |
| 1-13 | Portal: mount `RoomFilesSection`; **Visits** block + hook; union designer scans into both attach points; Library provenance chip | M |
| 1-14 | Tests: `VisitContextTests`, extend `FieldCapturePayloadTests` for the visit keys, extend `CaptureLifecycleTests` for inheritance | M |

**Ships:** a designer starts a visit at the door and everything she captures for the next two
hours lands on the right project and room, offline, and shows up in her document. That is the
program's stated goal, with **no voice work and no server work at all**.

#### Wave 2 — The note that survives · **~3–4 eng-weeks**

| # | Package | Size |
|---|---|---|
| 2-1 | `SpeechVoiceNoteService`: write the audio, rotate the recognizer at 50 s, handle interruptions, sha256, set `requiresOnDeviceRecognition` | M |
| 2-2 | C6 voice mode + the C3 inline mic + the solo/conversation affirmation | M |
| 2-3 | Device writes `margin_notes` through the **same** outbox (no second queue), with `field_capture_id` | M |
| 2-4 | Migration **00515** — `margin_notes.field_capture_id` + the `note` branch payload | S |
| 2-5 | Portal: audio playback + photo strip + draft line on the existing note item | M |
| 2-6 | Tests: `VoiceRecordingTests` (rotation boundaries, interruption → segment N+1, **`audioFilename` non-nil after finish** — the regression guard for §5.1); extend `UploadStateTests`' bucket-MIME drift guard for audio | M |

#### Wave 3 — Work from the field · **~3 eng-weeks**

| # | Package | Size |
|---|---|---|
| 3-1 | `designer_client_id` onto `FieldProject` (SELECT + DTO) | S |
| 3-2 | **Make it a punch item** / **Make it a task** on a note and on C3, via `create_client_decision` + `project_tasks`, on the outbox with `p_decision_id` as the idempotency key | M |
| 3-3 | Photo-on-a-punch, per ruling A-05 (cheap seam: `client_decision_options.image_url`) | M |
| 3-4 | Render `receiving_inspections.photo_asset_ids` in the portal (live defect, §7.3) | S |
| 3-5 | Desk: the open-visit need-line | S |

#### Wave 4 — It knows before she tells it · **~3–4 eng-weeks**

| # | Package | Size |
|---|---|---|
| 4-1 | `StartVisitIntent` + `CaptureVoiceNoteIntent` **in the app target** (no new target) + `AppShortcutsProvider` | M |
| 4-2 | `CaptureWidgets` WidgetKit target — new Ruby in `generate_project.rb`, then Control Center control + Lock Screen widget + **the Live Activity renderer that has never existed** | **L** |
| 4-3 | `EventKit` read + `CLVisit` → **suggested visits** on Today (needs two new Info.plist keys; Always-location is a real App Review conversation) | M |
| 4-4 | Background audio, if ruling A-08 says yes | M |

#### Wave 5 — *optional, evidence-gated* · **~3 eng-weeks**

Server transcription + LLM structuring, exactly as `[T1] §1.8`–`§2.4` design them, behind the same
two verbs wave 3 shipped. **Gate:** measured device-transcript quality from wave 2's corpus, and
a measured tap-cost of the manual verbs from wave 3's telemetry. Do not build it on a hunch.

**Total, waves 0–4: ≈ 16–20 engineer-weeks**, of which ~40% is wave 1.

### 9.2 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R-A1** | **The camera-first inversion is a product identity change.** `README.md` opens with it. A designer who opens the app to shoot and lands on a list will feel it. | High | §2.1's launch table keeps the camera as the mid-visit landing. Ruling **A-01**. Measure `intent.start_note` / cold-launch → first-capture latency from wave 0's telemetry. |
| **R-A2** | **The offline project cache has no precedent in the app** and is the direction's load-bearing new subsystem. If it is late or wrong, the door fails exactly where the door matters. | High | Package 1-3 is sized L and sequenced first inside wave 1. Fail visibly, never emptily (§4.3). |
| **R-A3** | **A wrong visit is a systematic error.** Yesterday's visit silently stamping today's twenty captures is worse than today's twenty unattached ones. | High | The >30 min confirm, the 12 h auto-end, the never-cross-a-calendar-day rule, and INVARIANT V (the visit is legible on every capture surface). |
| **R-A4** | **`project_tasks` writes are designer-of-record only** (`00169:61-62`). A studio co-member's "Make it a task" fails with 42501. | Med | Detect and degrade to a margin note with an honest line. Ruling **A-11**. |
| **R-A5** | **A punch item still has nowhere to put its photo.** No project-general photo table exists (`[G1] §9`). | Med | Wave 3 ships the `client_decision_options.image_url` seam; the honest answer is a schema decision. Ruling **A-05**. |
| **R-A6** | **Field writes `margin_notes` directly**, diverging from the house pattern where field signal reaches business tables through a reviewed RPC (`review_sms_message` → `apply_field_effect`). | Med | Argue it plainly: this is the *designer's own authored note*, not a third party's parsed claim, and `margin_notes_designer_all` already contemplates exactly this author. Ruling **A-03**. |
| **R-A7** | **Frozen-seam churn.** `CaptureRoute`/`CaptureSheet`/`CaptureScreenID` and `AppContainer` all carry explicit freeze comments; this direction edits all four. | Med | Package 1-1 does it **once**, at the top of wave 1, named in the brief as a foundation-owner edit. |
| **R-A8** | **Every number here is unfounded.** Field has never emitted an analytics event and no Leah device pilot is confirmed to have happened (M4's gate deferred at R113). | Med | Wave 0-1, before anything else. |
| **R-A9** | **The sourcing visit is a second spine.** Two kinds means two default destinations, two chip behaviours, two pickers. | Med | It is the founding use case and cannot be dropped. Keep the *roving* kind trivially small so the surface is 2.5 shapes, not 3. |
| **R-A10** | **Roving notes are a real hole.** `margin_notes` requires `project_id` XOR `proposal_id` (`chk_margin_notes_engagement`), so an unfiled note cannot be a margin note. | Med | The capture still commits (audio + transcript + `field_captures` row) — only the *filing* waits, on Today, in her hand. Nothing is lost. |
| **R-A11** | **No UI tests, no confirmed-blocking CI.** `CaptureUITests/` is an empty directory with no generated target; the "(advisory)" iOS jobs in `policy-quality.yml` set no `continue-on-error` and branch protection is not visible from the repo. | Med | Device walks are the real gate. Budget one per wave; never let `capture-gate.sh` green stand in for one. Note lint silently no-ops and still exits 0 without swiftlint. |
| **R-A12** | **No distribution pipeline.** No fastlane, no archive step, no confirmed ASC record for `cloud.patina.field`. Every build is a manual Xcode archive on one machine. | Med | Ruling **A-12**, resolved in wave 0. |
| **R-A13** | **Consent exposure.** No recording policy exists anywhere under `docs/`; all-party-consent states make surreptitious client recording criminal. | Med–High | §5.6's controls; ruling **A-09**; a lawyer's read before any non-Kody designer ships. |
| **R-A14** | **71/108 SQL tests are currently red** (00483 `pg_temp` fallout, suite repair owed). | Low–Med | Write 00514/00515's tests to run standalone and say so; do not read a green/red signal from that suite. |
| **R-A15** | **Shipping portal changes unflagged.** | Low | Every change renders nothing without Field-written data (§6.6). |
| **R-A16** | **The wedge may be wrong.** Leah Session 05 (prepped 2026-08-18) is unrun; its findings template is blank; it ranks "capture/memory" against three other MVP candidates. | Med | Wave 1 is mostly bug-fixes and wiring — a cheap, reversible bet. Hold waves 3–5 for the answer. |

### 9.3 Rulings Kody owes

| # | Ruling | Why it blocks |
|---|---|---|
| **A-01** | **Does Field stop being camera-first?** Direction A makes the day the home and the camera the mid-visit landing (§2.1). | The direction's premise. Everything else is downstream. |
| **A-02** | **Three visit kinds — site, sourcing, roving — or fewer?** Sourcing preserves the founding market-day flow; roving is the drive-home hole. | Decides V0's shape and the direction's complexity budget. |
| **A-03** | **May Patina Field write `margin_notes` and `project_tasks` directly?** The RLS already permits it (§0.4). This diverges from the SMS pattern where field signal reaches business tables through a reviewed RPC. | The whole wave-2 landing. If no, Direction A needs `[T1]`'s confirm-RPC pair and wave 2 grows by ~2 weeks. |
| **A-04** | **The room merge.** Is merging `project_rooms` and `public.rooms` by trimmed name in one picker (§7.4) acceptable, or do the two lists need a real server-side link? | Blocks V0's room step and every "put this in this room" affordance. |
| **A-05** | **Where do project photos live?** There is no project-general photo table. A punch item without a photo is a punch item nobody can act on. | Blocks wave 3-3, and M4/M5/M8/M9 generally. This is a schema decision, not a wiring one. |
| **A-06** | **Can a spoken measurement ever become a measured record?** Direction A says no — it becomes a note that says the number, tagged as spoken. R108.1 (typed anchors only) and R114.1 (two-tier trust) both support that; R108.1's named re-open trigger is *"field evidence of transcription friction,"* which this program will generate. | Decides whether anything may ever touch `room_file_measurements` / `tolerance_class` from voice. |
| **A-07** | **Audio retention default** — `keep`, `discard_after_transcript`, or `90_days` (the site-request precedent)? Per-note override, per-studio setting, or fixed? | A column default, a cron, and what a client's lawyer sees on discovery. |
| **A-08** | **Background audio** (`UIBackgroundModes: [audio]`)? Ship it so a note survives screen-lock, or keep foreground-only with an honest "recording paused"? | App Review conversation, battery, privacy; changes the whole phone-in-pocket story. Direction A proposes wave 4, not before. |
| **A-09** | **Recording-consent posture.** Does a `conversation` note require an explicit affirmation? Is there a jurisdiction rule? | The one item with legal exposure. No policy exists anywhere in `docs/`. |
| **A-10** | **No new portal flag** (§6.6)? Direction A ships the portal changes unflagged because they are inert without Field data. | `room-file` and `call-sheet` are already dark; a third dark flag makes this unwalkable. |
| **A-11** | **Per-designer or per-studio?** `field_captures` RLS is owner + org-inbox; `room_files` delegates to the broader scan visibility; `project_tasks` writes are designer-of-record only. The three disagree. | Decides an RLS policy, whether the `capture-media` object policy needs a co-member branch (a **platform-admin phase** migration, not an ordinary one), and whether wave 3's verbs work for a second designer at all. |
| **A-12** | **Is TestFlight a dependency?** If field notes are meant to reach Leah's phone and not just Kody's, the missing distribution pipeline has to be built. | Decides whether wave 1 ends at "Kody's device" or "Leah's device" — and therefore whether R-A16's wedge question ever gets answered. |
| **A-13** | **Naming.** "Today" (home) · "a visit" (the session) · "Visits" (the portal block). Checked against I84 (no third "Capture Inbox"), R98/PRD/I53 (no unqualified "request"), and `discovery/field-kit.tsx`. | Names are hard to change once they ship into the margin, the spine, and the app's launch screen. |

---

*Read-only design pass. No repository file was modified other than this report.*
