# Field Companion · Build Package — "The Visit"

Issued 2026-08-24 · Design authority → Claude Code
Companion files: `field-companion-plan.md` (the build order) and `field-companion-rulings.md`
(what Kody owes before waves 2+). Evidence base: `research/01`–`07` (discovery),
`research/10-gap-analysis.md` `[G1]`, `research/11-tech-architecture.md` `[T1]`,
`research/20-direction-A/B/C.md`, and the two judge reports `research/30-judge-*.md`.
**If this package and a research document conflict, this package wins for the build.**

Nothing has been appended to `docs/design/the-document/DECISIONS.md`. Kody rules first (see
`field-companion-rulings.md`); the append-ready block is drafted after the rulings, not before.

---

## 1 · Executive summary

**The problem, measured.** Today Patina Field asks *"what did you capture?"* twenty times an
hour and never asks *"where does it go?"*. A photo plus a spoken note costs ~7 taps and a
press-and-hold, and the record still has no project (`[G1] §O1`). Eight of the nine "true field
companion" outcomes fail outright, one is partial; none passes. The failures are never reliability —
the outbox, the owner scoping and the scan-upload chain are genuinely excellent — they are
**contextual** (nothing knows where she is) and **terminal** (the material has nowhere to land).

**Two live defects sit underneath that.**

1. **No audio has ever left a Field device.** `SpeechVoiceNoteService.swift:22-23` declares
   `mediaDirectory` (stored in `init`, never read) and `audioFilename` (only ever read, at
   `:107`, assigned nowhere); `grep -rn "AVAudioFile\|AVAudioRecorder" apps/mobile/Capture` returns
   zero hits. The file's own header — *"The raw audio file is always kept alongside the text"* —
   is false. Consequence: `SiteScanContextCapture.swift:128` gates on
   `!transcript.isEmpty || result.audioFilename != nil`, so **a note that transcribes to nothing on
   a noisy site is discarded with the toast "Nothing recorded."** She spoke; nothing was kept.
   That is a live violation of a law this house has ruled four separate ways
   (R108.5, R110/FR-10, R113, R114.1).
2. **A note-shaped capture cannot carry a project even when she sets one.**
   `commit_field_capture`'s inbox branch (`00235:205-217`) sets only `status`; `project_id`,
   `project_room_id` and `shelf` are written **only** in the library branch (`:255-266`). And
   `ViewfinderModel.makeDraft()` (`:341-344`) copies four of the five routing fields — `projectRoomId`
   is never assigned, so `CaptureRoutingMemory.projectRoomID` is write-only and every capture after
   the first silently loses the room.

**The bet.** Ask *"where are you?"* once, at the door, and never ask again — Direction A's
**Project Spine** — with three grafts that make it safe: B's suggested-vs-confirmed honesty
enforced in the schema, B's unfiled-scope tray, and C's kit + close-as-output. Everything a
designer captures inside a visit inherits its project and room, lands in the surfaces the portal
already has (the margin, the Room-files block, the FF&E line, the Library shelf, the coordination
courts), and there is **no inbox, no triage queue and no new Desk population on either side**.

**Why this shape and not another.** Both judge panels scored A highest (40/50 designer-workflow,
39/50 engineering) on the same decisive axis: A's entire shipping server footprint is **one
migration plus one `CREATE OR REPLACE`**, because Leah's own phone can already write the portal's
real tables. Verified: `margin_notes_designer_all` is `FOR ALL TO authenticated USING (designer_id
= auth.uid())` (`00196:52-55`) and `create_client_decision` is `GRANT EXECUTE … TO authenticated`
(`00413:2603-2609`). `apply_field_effect`'s party-anchor / service-role wall was a wall for a
texting GC — **it was never the wall for Leah.** That single fact demotes `[T1]`'s whole server
pipeline (two edge functions, two crons, `field_note_drafts`, an agent-queue kind, three
migrations) from *foundation* to *optional, evidence-gated enrichment*.

**Wave 1 is not the spine.** It is the two defects above plus the cheapest possible project
affordance, in ≤2 engineer-weeks, device-walkable with no flag: **the note survives.** It lands
server-side *with a project on it* — but **nothing in the portal looks different after wave 1**,
because `field_captures` has exactly one portal reader and it is scan-scoped and fail-closed behind
the `room-file` flag (§11). Portal visibility begins in **wave 1P** (§11.7) or wave 4. That is the
honest first proof that this program works at all, and it is worth having even if Leah Session 05
says the wedge is elsewhere.

**Total to the program's stated goal: ≈12.5 engineer-weeks of build** — wave 1 ≤2 · wave 1P ≈1 (run
in parallel) · wave 2 ≈1 · wave 3 ≈5 · wave 4 ≈3.5 (four packages move into wave 1P; the newly-priced
punch back-reference DDL moves in) — **plus Wave 0.5 distribution (size M) and slack.** Call it 13–15
*calendar* weeks of one engineer, not 13–15 weeks of build. The arithmetic is stated because the
earlier headline said 13–15 over a plan that summed to less, and Kody does this arithmetic. Wave 6 is
specified here in full and **split**: **6A** (server transcription) is deterministic, costs
≈$1.15/mo, and is the brief's literal ask; **6B** (Designer-Taught structuring) stays
evidence-gated (§8.6/§8.7).

> ⚠ **Two live neighbour lanes touch this work and §9.0 is not optional reading.** `00521` is
> already taken on `main` and unrecorded in the reservations doc; and **Phase 3 capture enrichment is
> a second AI pipeline already pointed at `field_captures`** — with a sibling branch that does the
> *same* `CREATE OR REPLACE commit_field_capture` this program's wave-1 migration does. Whichever
> lands second silently reverts the other. Phase 3's 00516 body is being fixed (cross-tenant enqueue
> over-grant); W1 waits for the merged body.

---

## 2 · The chosen direction, and what came from where

### 2.1 The base — Direction A, "The Project Spine"

Adopted whole:

- **The door.** A **visit** is a bound, named, visible work session. It is
  `CaptureSessionContext` (which already carries `visitID`, `startedAt`, `lastActivityAt`,
  `CaptureRoutingMemory` and App-Group persistence) promoted to the surface with a kind, a label
  and a lifecycle. Direction A is, mechanically, the act of making that struct visible.
- **No inbox in the portal.** No Desk population, no `NeedKind`, no `document_state` column, no new
  room/ledger/verb in `lib/document/registry.tsx`, no third "Capture Inbox" (I84 forbids it), no
  new portal flag, **no card to clear**. A triage queue is the scar tissue of a missing spine; if
  captures keep arriving unfiled, fix the door.
  ⚠ **State this precisely, because the looser version is not true.** The *concept* survives on the
  device — `field_captures.status='inbox'`, `CaptureDestination.inbox` and S3 all stay (§7.7) — and
  the unplaced tray is a filing queue by another name. What this package removes is the **portal**
  inbox: no Desk population, no triage card, no second place to clear. Whether the *word* also leaves
  Field's copy is §17.3, and it costs **ten** designer-visible strings, not one.
- **A field note is a note.** One nullable `margin_notes.field_capture_id` column and two extra
  facts on the **existing** `note` branch of `margin_items` — **not** a `field_note` margin kind.
  Same author, same studio-privacy, same aged-oak lane, same escalation ladder. Both judges called
  this the best single design judgement in the set.
  ⚠ **"For free" is not free for a transcript.** `useEscalateNoteToDecision` /
  `useEscalateNoteToScopeChange` are **portal-local** hooks
  (`apps/designer-portal/src/hooks/use-margin-notes.ts:64` and `:128`) — not `@patina/supabase` — and
  they escalate the `margin_items` row's **title**, which is `left(n.body, 80)` with `detail`
  hard-coded to `''` (`00282:829-830`), and which `NoteBody` never renders at all
  (`margin-bodies.tsx:814-880`); the escalation then forwards `body: row.title` (`:855-859`). A
  five-second typed note survives that. A one-minute transcript — the entire artifact this program
  produces — does not. §9.4 and §11.4 therefore **must** carry the full body. That is a wave-4
  requirement, not a nicety.
- **The write path is the one that already exists.** Field writes `margin_notes` and calls
  `create_client_decision` from the device, on the existing outbox, with the caller-supplied
  `p_decision_id` as a free idempotency key.
- **One room picker, two id lanes.** `FieldProjectDetail` already returns **both**
  `specRooms` (`project_rooms`) and `rooms` (`public.rooms`) from one `projectDetail(id:)` call
  (`SupabaseProjectsService.swift`: the `FieldProjectDetail` struct at `:117-140`, `projectDetail(id:)` at `:146`). A merged picker stamps whichever id is legal per lane and
  never cross-assigns. This is the only proposal in the set that unblocks a unified room
  affordance **without** a schema ruling first.
- **No `field_visits` table.** `visit_id` is an opaque device-minted column on `field_captures`.
  A server row would be a second lifecycle to keep in sync for no read the portal needs — exactly
  what `docs/field-site-requests/p1-contract.md` rules against.
- **Portal changes ship unflagged**, because every one is a read of data that only exists if a
  Field build wrote it.

### 2.2 Grafted from Direction B — "Capture first, file later"

| Graft | Why |
|---|---|
| **The suggested/confirmed split, enforced in the schema.** `suggested_project_id` ≠ `project_id`; nothing reads `suggested_*` as truth; the basis is always shown **in words**, never as a number. | The best honesty mechanism produced anywhere in the set, and it is exactly what makes a spine safe to *forget*. It costs five nullable columns in a migration already being written. Both judges said graft unconditionally. |
| **Tray scope = unfiled, not this-visit.** `V1SessionTrayScreen.swift:139-147` builds from `store.session(visitID:owner:)`, and the context expires after 4 h (`CaptureSessionContextPolicy.inactivityWindow`). A thought captured on the drive home has nowhere to appear. | One query-scope change turns a shipped screen into the durable holding place both A ("roving") and C ("loose captures") need and under-design. |
| **The learned centroid.** Remember each *filed* capture's coordinate against its project in the local cache; next visit, proximity suggests. | Free, on-device, offline, explainable ("you filed 9 captures to Maple St from right here"), and needs **zero** schema on `projects` — `projects.site_address` is free-form nullable TEXT with no lat/lng anywhere. Best magic-per-line ratio in the set. It **replaces** wave-4 `CLVisit` as the first suggestion source: no Always-location entitlement, no App Review conversation. |
| **The 4-hour window becomes a prompt, not a silent reset.** *"Still at Maple St?"* / Yes / New / Not pinned. | Mitigates the systematic mis-stamp risk better than a timer. `CaptureSessionContextPolicy.resolve` already has the seam. |
| **The flight toast for a sourcing visit.** Thirty shutter presses should not each raise a confirm card. | C3 stays a confirm surface on a site visit; on a market run it auto-dismisses to a ~1.2 s toast. |
| **The voice failure ladder** (`[B] §5.6`) as the copy source. *"We couldn't make out the words — the audio is here."* | The best-written artifact across the three documents. Lifted close to verbatim into §15.4. |

**Not grafted:** B's `status='filed'` as specified. `field_captures_org_inbox_select` keys on
`status = 'inbox'` (`00233:175-188`), so a new terminal status **silently revokes studio read** on
exactly the rows a co-member was meant to help with. This package introduces **no new `status`
value at all**; "filed" is expressed as `project_id IS NOT NULL`.

### 2.3 Grafted from Direction C — "Moments as modes"

| Graft | Why |
|---|---|
| **The kit.** The visit's *kind* tunes what is one tap away — the C1 pill row and the C3 card's secondary act. | The best idea produced by any of the three, and cheap: `SiteScanContextControls`' shipped pill row (`SiteScanContextCapture.swift:162-193`) is the prototype. It is what makes a trade walk feel like a different instrument from a market run without being a different app. |
| **Per-pill honesty discipline.** On a non-LiDAR phone the **Scan** pill becomes **Reference** and its output is never labelled a scan. | R108.2/R108.5 enforced at the affordance rather than in a paragraph. `SiteScanEntryMode.forDevice` already makes the decision; the kit just reads it. |
| **The close as *output*, not triage.** The end-of-visit act **produces** the Visits-block row on the project spread. | `[G1]` O6 ("a shareable site-visit artifact without retyping") is an outright FAIL today and only C addresses it. Even with zero model: *"Tuesday at Maple Street · 12 photos · 3 notes · 1 scan · Living + Dining."* |
| **The time entry at close**, written as a **completed** entry, never a running timer. | `project_time_entries.activity` already admits `'site_visit'` (`00198:28-29`). `00177:39-41` enforces one running timer per user via a partial unique index owned by the portal's TimerButton — so a completed entry is the only safe shape. |
| **Mode-conditioned extraction framings** (`[C] §5.3`). | Specified now, built only if wave 6 is ruled in. Same tool schema, same cost — the difference between *"the return on the left casing is proud"* becoming a note and becoming a punch item in the GC's court. |
| **Mode-conditioned consent default.** A walk-through kit arms `note_setting='conversation'`; site and market default `solo`. | The cheapest substantive answer to the one ruling with real legal exposure, and it converts an invisible act into a deliberate one. The door question does consent work too. |
| **Act on `CaptureSyncAttributes` now.** It is stamped FROZEN, fully built, driven by `LocalCaptureSyncService` — and **nothing renders it**, because no widget target exists. | The freeze protects nothing today and will protect something the day a renderer lands. A free option that expires. Fold the shape change into the one foundation-seam commit. |
| **G2 receiving gets the live camera** alongside PhotosPicker. | A loading dock is not a photo library. |

**Not grafted:** C's five modes at once (start with two kinds + kits; let evidence add a third),
C's `field_visits` server table, and C's explicit-close-gated payoff (both judges scored C's
double adoption gate — *she must start* **and** *she must close* — as its fatal shape).

⚠ **The four-way kit chooser is deferred to wave 4; wave 3 ships only the consent posture.** In wave
3 a kit would change exactly two things: the C1 pill layout, and the `note_setting` default. Every
verb a kit actually tunes lands later — the trade-walk punch verb in wave 4 (§6 Flow 5), the install
receiving camera in wave 4 (§11.5), the mode-conditioned extraction framings in wave 6B (§8.7). Four
extra chips at the door, on the screen whose cost is the entire FC-R1 argument, buy nothing until
those exist. **Wave 3 ships the `solo` / `conversation` distinction only** — which is a consent
control (§15.2), not a convenience — and the kit row lands in wave 4 beside its verbs.

### 2.4 The five decisions that define this package

1. **Two visit kinds, not three or five: `site` and `sourcing`.** "Roving" is not a kind, it is the
   *absence* of one — modelled as a null kind whose captures carry the `suggested_*` columns and
   appear in the unfiled tray. That removes a third code path from the door, the chip, the card and
   the tray. Walk-through, Trade walk and Install day are **kits**, chosen after the project, as a
   second chip — **in wave 4, beside the verbs they tune** (§2.3). (Ruling **FC-R2**.)
   ⚠ **This overrules the designer judge, and says so out loud.**
   `research/30-judge-designer-workflow.md:437` recommends **three** kinds in C's words — *Site
   visit · Market · Roving* — with walk-through / trade / install as kits, and `:526` restates it as
   the panel's recommendation. The argument for two is that a null kind *deletes* a code path rather
   than adding one. The judge's counter is that "roving" is the moment Kody's brief names literally,
   and a nameless state is easy to under-serve — §4 M6 concedes exactly that. **Both arguments belong
   in FC-R2; Kody rules.**
   ⚠ **Either way, the vocabulary must stop naming one thing twice.** The draft below has
   `visit_kit='site'` duplicating `visit_kind='site'`, and `visit_kit='market'` duplicating
   `visit_kind='sourcing'`. Kinds are `site` / `market` (or `site` / `sourcing`); kits are
   `walk_through` / `trade_walk` / `install` **only**.
2. **The voice fix ships first, before any IA change.** Both judges overruled every direction's
   effort table on this point. It is one file, the entire downstream chain is dead-waiting, it
   repairs a ruled honesty violation, and it is the only slice walkable on a device with no schema,
   no portal work and no flag.
3. **Nothing infers a project into a fact.** A suggestion is written to `suggested_project_id` and
   rendered as a question with its basis in words. `project_id` means *she said so*.
4. **No new server surface in waves 1–5.** One reserved migration band, one `CREATE OR REPLACE`,
   zero edge functions, zero crons, zero `agent_tasks` kinds, zero new tables, zero new RPCs.
5. **Wave 6 is designed and unscheduled.** Server transcription and Designer-Taught structuring
   land behind the **same two verbs** wave 4 ships (*Make it a task* / *Make it a punch item*) — the
   model pre-fills a sheet she was already tapping. The UI does not change when the model arrives.

---

## 3 · Principles

1. **Ask the expensive question at the frequency it changes.** "Which project?" changes once, at
   the door, standing still, hands free. "What is this?" changes twenty times an hour.
2. **The audio is the record. The transcript is a reading of it.** (R114.1 two-tier trust.)
3. **Degrade honestly; never block; never silently drop.** (R108.5 / R110-FR-10.) Never a spinner,
   never an empty list, never a disabled control where an honest sentence would do.
4. **A suggestion is a question, and it says why.** *"Suggested from where you were"* — never a
   confidence number, never a silent write.
5. **Field material appears where she already looks.** No new surface in the Document unless the
   Document has no home for the thing. The portal's last year of rulings has been about shrinking
   surface (R21, R95, R94); run with that grain.
6. **A spoken measurement is never a measured record.** R108.1 (typed anchors only) + R114.1. A
   spoken dimension becomes a note that *says* the number, tagged as spoken.
7. **Nothing auto-applies — *in this program*.** Every business-record write it makes is a
   deliberate designer act. ⚠ That is **not** a house-wide fact today. Phase 3 capture enrichment's
   `record_capture_enrichment_result` already writes model output straight into
   `field_captures.category / subcategory / finish / vendor_name / sku` with **no review step**
   (`00515:250`, `:287` — service-role only, guarded only by `WHERE %1$I IS NULL OR %1$I = ''`).
   Confirm-gating a spoken note while silently accepting a model-written `vendor_name` on the same
   row is not a coherent posture. **Kody rules the family, not this program alone** (FC-R12,
   sequenced behind FC-R18).
8. **Never "AI".** The capability, if ever named, is **Designer-Taught Intelligence** — the rule is
   `docs/design/the-document/DECISIONS.md:1554`, **not** the brand-voice skill, which carries only the
   adjacent rules. Prefer mechanism-quiet copy: *"a clearer read of this note."*
9. **Recording is never ambient.** It begins and ends on a deliberate act, with unmissable chrome.
10. **Do not simplify what is already hardened.** The scan rig, the scan-upload chain, the outbox's
    idempotency and receipt discipline, owner scoping, the library safe-harbor, the SMS rail and the
    Site Request guest loop are load-bearing and stay untouched (`[G1] §4`).

---

## 4 · Persona and field moments

**Leah** — a working interior designer. Mobile, busy, one-handed, phone-out reflex. She is the
standing P1/P2 pilot subject, and **it is not confirmed she has ever held Patina Field on a real
site** (M4's device-pilot gate was deferred at R113). Leah Session 05 (prepped 2026-08-18) has not
run; its findings template is blank; it ranks "capture/memory" against three other MVP-wedge
candidates. That is why waves 1–2 are overwhelmingly bug-fixes and wiring — a cheap, reversible bet
worth making regardless of the answer.

| # | Moment | Today | After wave 4 |
|---|---|---|---|
| **M1** | **Site visit.** Two hours, one address, three rooms. | ~7 taps + a hold per capture, no project, no room. | 3 taps at the door; 2 taps + a hold per capture, project **and** room attached, offline. |
| **M2** | **Client walk-through.** Someone else is talking. | Voice only via a specimen round-trip (C5→N4→attach→C5); audio discarded. | Voice kit; hold-to-talk on the card or a bare voice mode; consent posture armed by the kit; the audio is kept. |
| **M3** | **Market / showroom.** 30 pieces, one afternoon. The app's founding moment. | 1 tap per specimen, ~6 more to place one. | 1 tap per specimen (flight toast, no gate); 2 to tag one to a project in mind; **Field** provenance chip on the Library card. |
| **M4** | **Trade walk.** Defects, and whose court they are in. | Impossible from Field; photoless on web. | Punch kit: shutter + hold + 2 taps → `create_client_decision(coordination_kind:'punch')` in the GC's court, with the photo back-referenced. |
| **M5** | **Install / receiving day.** | iOS already writes `receiving_inspections.photo_asset_ids` — **and no web surface has ever rendered it** (`SupabaseReceivingService.swift:115` vs `log-inspection-drawer.tsx:151` hardcoding `[]`). A live defect, not a gap. | Live camera in G2 alongside PhotosPicker; the portal finally renders the column. |
| **M6** | **Roving.** The drive-home thought; a light fixture on a wall. | Commits, then is unattached forever. | Commits with a *suggestion* (venue / learned centroid), never a fact; waits on **Today** in her hand, filed in one tap. ⚠ **The weakest cell — and it is the brief's literal phrase.** Under FC-R6(a) a roving capture never reaches the portal until she files it, and the only prompt to file is a band she must open the app to see: a filing queue with no reminder. Named as an accepted limitation in §16.16, given one cheap mechanism (a local notification when the unplaced count crosses a threshold, or wave 5's Live Activity carrying it), and attached to a falsifiable kill-criterion on `capture.unplaced` (§14). |
| **M7** | **Back at the desk.** | Field material is invisible: `field_captures` has exactly one portal reader (`use-room-files.ts:385`, fn at `:370` — scan-scoped, behind the fail-closed `room-file` flag), and no web code has ever signed a `capture-media` URL. | Room-files block mounted; Visits block on the project spread; audio playback and a photo strip on the margin note. **No card to clear.** |

⚠ **"After wave 4" for M1 and M7 assumes the `room-file` flag is *on*.** The Room File page — the
destination of every row `RoomFilesSection` renders, and the home of the portal's only
`field_captures` reader — is `useFeatureFlag("room-file")` and fail-closed by house rule
(`room-file-view.tsx:29`, `:63`). **Enabling it for the pilot cohort, with the flag-on walk as a
completion criterion, is a wave-4 prerequisite with a named owner**, not a follow-up (§11.2,
FC-R10). Until that happens, those two cells are aspirational.

---

## 5 · Information architecture and navigation

### 5.1 Two realms, unchanged

Two independent `[CaptureRoute]` stacks driven by `CaptureCoordinator` + `FieldRealmHistory`, one
`.sheet(item:)` on the root, no tabs. **No new realm, no tab bar.**

### 5.2 Home — `W1` becomes **Today**

Not a new screen. `WorkDashboardScreen` (669 ln) already renders a greeting header with
`CaptureDates.dayHeading(Date())`, three attention sections (*Needs you* / *Waiting on others* /
*Moving today*) fed by `FieldAttentionBuilder`, and a six-tile Browse grid, with per-source Retry.
One section is inserted above *Needs you*:

```
        MIDDLE WEST STUDIO
        Good morning, Leah
        Tuesday, August 25

        ┌─ TODAY ───────────────────────────────────────────────┐
        │  ● Maple St · Living + Dining          started 9:14am │  open visit
        │    12 captures · 1 scan · 3 notes        [ Camera ]   │
        ├───────────────────────────────────────────────────────┤
        │  4 captures not placed yet                        ›   │  the unfiled tray
        ├───────────────────────────────────────────────────────┤
        │  + Start a visit                                      │
        └───────────────────────────────────────────────────────┘

        NEEDS YOU · WAITING ON OTHERS · MOVING TODAY · BROWSE   (all unchanged)
```

The **Camera** control on the open-visit row is not new chrome, and that matters to FC-R1.
`WorkDashboardScreen` already renders a `cameraRealmButton` in its header — *"Camera"* →
`coordinator.switchRealm(.camera)` — in **both** the standard and accessibility-size layouts
(`:88-101`, `:119-130`). Even with no visit open, the camera is **one tap** from Today *today*. That
is the single strongest argument for FC-R1(a), and the band above should be read as keeping the
affordance, not inventing it.

### 5.3 Launch behaviour — the whole concession to the camera-first inversion

`apps/mobile/Capture/README.md` opens *"Patina Field is a standalone camera-first iOS app."*
Making the day the home is a **product identity change** and is ruling **FC-R1**. The mitigation is
that the camera-first muscle memory survives *inside* a visit, which is exactly when it is right:

| State on launch | Lands on |
|---|---|
| A visit is open and active within the last 30 min | **C1 viewfinder**, visit chip lit — today's rhythm, unchanged |
| A visit is open but idle > 30 min | **Today**, visit row at the head, *"Still at Maple St?"* / Resume / End |
| No visit open | **Today** |
| Deep link `field://capture` | C1, using the open visit; if none, C1 with an **unplaced** chip |

**Write the plan so FC-R1 is reversible without re-planning.** If Kody says no: the camera stays
home, "Today" becomes a strip reachable from the `TODAY` pill, and the visit chip is the only new
chrome. Nothing else in this package changes.

### 5.4 Invariant V

> **On every screen where a capture can be created, the visit's project and room are legible
> without a tap, and changing them is exactly one tap away.**

| Surface | Carrier |
|---|---|
| **C1 viewfinder** | `ViewfinderVenueChip` (`ViewfinderControls.swift:36`) becomes the **visit chip**, two lines, tappable → V0 |
| **C3 quick-confirm card** | a placement line: `Maple St · Living ⌄`, or `Not placed — tap to place` |
| **C5 specimen sheet** | inherited, read-only, with a *Change* link → V0 |
| **Every non-camera screen** | the Companion hearth strip, collapsed, carrying the visit label + one action (`FieldCompanionAction` exists; `RootView.handleCompanionAction` already switches on `action.id` with a `default:` no-op — a two-case addition) |
| **F1 scan setup** | the project step is pre-answered and collapses to one line |
| **Lock Screen / Dynamic Island** | wave 5's Live Activity renderer |

### 5.5 The frozen seams, edited once

`CaptureRoute` / `CaptureSheet` / `CaptureScreenID` carry *"Changing a case is a foundation-owner-only
edit"* (`CaptureNavigation.swift:4-6`); `AppContainer.swift:13` says *"FROZEN for the waves"*;
`CaptureSyncAttributes` says *"FROZEN — a ContentState shape change breaks both"*. **One commit, one
named owner, at the top of wave 2**, containing all of:

- `CaptureSheet.visit` (the V0 door)
- `CameraMode.voice` (fifth case, `CaptureEnums.swift`)
- `CaptureScreenID` gains `v0Visit`, `c6Voice`, `v4VisitReview` — **and fixes the orphan
  `screen.F1.context`**, which `SiteScanContextScreen` sets today but which is not an enum case, so
  it has never appeared in a `capture-shots.sh` sweep or the `-CaptureScreen` harness
- `AppContainer` gains `smartGuess: any SmartGuessService` and `featureFlags`
- `CaptureSyncAttributes.ContentState` gains `visitLabel: String?`, `elapsedSeconds: Int?`,
  `captureCount: Int?` — free **only** until a widget target exists
- Stale-header cleanup in the same files (see §17.4)
- Deleting `FieldPlaceholderScreen`, which removes a `public` symbol from CaptureKit's framework
  surface (zero in-repo references — recorded here so the removal is a named seam edit, not a silent
  one)

**What the freeze actually covers.** Navigation cases (`CaptureRoute` / `CaptureSheet` /
`CaptureScreenID`), DI (`AppContainer`), and the Live-Activity `ContentState` shape — the seams where
a change breaks a second target or a persisted decode. **Additive optional wire and model keys are
exempt**, and they land in the wave whose behaviour needs them: wave 1 adds
`VoiceNoteResult.audioSegments`, `Specimen.voiceAudioSegmentsRaw`,
`FieldCapturePayload.Voice.audioSegments` / `.captureKind` and a *defaulted* argument on
`ContextCaptureService.enqueueVoice`. §17.1's "frozen wire contracts" means the **rules** — camelCase
keys, flat dotted provenance keys, lowercase-both-segments paths, the semantic-vs-transport MIME
split — not "no new optional key, ever."

⚠ `CaptureSyncAttributes.ContentState` has a **hand-written** memberwise `init`
(`CaptureSyncAttributes.swift:17-20`), so the three new fields must carry `= nil` defaults or the
three construction sites and the `FieldCompanionPresentationTests` break. **Correction (Wave 2
ledger):** the three constructors are all in `Capture/Services/Sync/LocalCaptureSyncService.swift`
(`:184`, `:715-717`, `:825`), not `LocalCaptureSyncController` — `ContentState` values are built via
type inference (`.init(queued:…)`), so `grep -rn "ContentState"` misses all three. Wave 2's own seam
edit landed clean against them: commit `13cf6a28f` (Task 1) added `CameraMode.viewfinderSelectable =
[.photo, .tag, .measure, .scan]` (Wave 3 admits `.voice`), and left these three call sites untouched
on their `= nil` defaults. `CaptureLiveActivityController` (`start` `:35`, `update` `:55`, `end`
`:63`) never constructs a `ContentState` — it only forwards one already built by its caller.
Optionality is also what makes decoding an in-flight Activity across an app update safe.

---

## 6 · User flows

Tap counts exclude gestures (press-and-hold), counted separately. "Today" counts are from
`[G1] §O1` / `[D1] §8`. Timing targets are **proposals for Kody to rule**, and none of them is
currently measurable — Field has never emitted a PostHog event.

⚠ **Each count below is stated twice: best case, and real case.** Best case assumes the project is
already answered and no optional step is taken. Real case includes the optional kit chip, the
confirming tap on a sheet, and the placement detour where one exists. **The real-case numbers are
the program's targets** — they are the only ones a designer experiences, and since Field has never
emitted an event they are also the only ones anyone will ever be able to check.

### Flow 1 · Arrive on site — start the visit
**Target: 3 taps best case · 4 with a kit (the normal case for walk-throughs, trade walks and
install days), ≤8 s from cold launch. Must work offline.**

1. Open Field (cold) → **Today**
2. Tap **+ Start a visit** — *or* tap a suggested row (wave 5) and skip to step 4
3. Tap a project (recent-first, text filter, from the local cache)
4. Tap a room — or **Whole house**. *(Optional: tap a kit — Walk-through / Trade walk / Install day.)*

Chip reads `Maple St · Living`. **Lands:** nowhere yet — a visit is device-local until its first
capture, so an abandoned visit leaves no server rows. On first capture `field_captures.visit_id`
carries the `visitID`.
**Offline:** the door **must** work. Cache miss → the cached list plus an honest line —
*"12 projects on this phone. Others need signal."* Never an empty list, never a spinner, never a
disabled control. That is the exact S1 regression this direction exists to avoid
(`S1AssignVenueScreen.swift:306,333`: *"Project rooms are unavailable offline."*).

### Flow 2 · Photo + spoken note inside a visit — **the headline flow**
**Target: 2 taps + 1 hold, ≤10 s, fully offline — assuming a visit is open and has already answered
the project. With no visit open, add the wave-1 placement detour (3 taps, Flow-1 substitute).
Today: ~7 taps + 1 hold, and no project at all.**

1. Tap the shutter → `pressEnded → captureSingle()` → the C3 card
2. *(hold)* press and hold the card's mic, speak, release — inline, no sheet, no specimen round-trip
3. Tap **Save** → `saveFromCard()`. The `destination == .undecided` branch that presents S3 does not
   fire inside a visit, so **S3 is skipped**.

**Lands, exactly:**
1. Device — a `Specimen` with `venue.projectId`, **`venue.projectRoomId`** (the write-only bug fixed),
   `venue.room`, `captureSessionID = visitID`, one HEIC in `<AppGroup>/CaptureMedia/`,
   `voiceTranscript`, `voiceDurationSeconds`, and **`voiceAudioFilename` + `voiceAudioSegments`**.
2. Outbox — `enqueue()` (never touches the network) → per-owner serialized `drain()` →
   upsert-idempotent upload to `capture-media/<uid>/<clientToken>/` → `commit_field_capture`.
3. Server — a `field_captures` row with `project_id` and `project_room_id` **now persisted** on the
   inbox path (the §9.2 fix).
4. Portal, wave 4 — a `margin_notes` row written by the device, `body` = the transcript,
   `anchor_kind = 'letterhead'`, `field_capture_id` set. It appears in the margin rail of
   `/doc/[id]` through the existing `note` branch, aged-oak accent, **no new margin kind**.

### Flow 3 · Walk-and-talk — a note with no photo
**Target: 1 tap + tap-to-start / tap-to-stop from the camera; 1 press from the Lock Screen (wave 5).
Today: impossible.**

Impossible today because every enrichment sheet is keyed to a `Specimen` UUID —
`.voice(UUID)`, `.measure(UUID)`, `.ocr(UUID)`, `.code(UUID)` (`CaptureNavigation.swift:46-57`) — so
a specimen must exist before a voice note can. The only sheet-free voice entry is inside a running
scan.

1. Swipe the mode selector to **VOICE** (fifth `CameraMode`) — or press the Action Button (wave 5)
2. Tap the big mic to start, speak, tap again to stop. Live transcript rides up the screen. Auto-saves
   on stop.

`ContextCaptureService` already proves a media-less specimen commits cleanly through the existing
outbox (tested in `ContextCaptureTests.swift`) — C6 is that pattern with a viewfinder-scale mic.

### Flow 4 · Scan a room inside a visit
**Target: 1 tap to start scanning. Today: 3 taps + a project fetch.**

F1 opens with project + room filled from the visit, collapsed to one line: *"Maple St · Living — change"*.
**The guard is the tiebreak:** if the visit's project is not in `SupabaseSiteScanService.ownableProjects()`
— a filter that deliberately mirrors the `room_scans_guard_routing` BEFORE-INSERT guard — F1 must
**expand and say so**, not silently start a scan that will 4xx at upload.
**Lands:** `room_scans` (with `project_id`, 00265) → `room_files` → `/rooms`, `/room/[id]`,
`/room/[id]/file`, and the portal's newly-mounted Room-files block.

### Flow 5 · A punch item on a trade walk
**Target: 4 taps + 1 hold — shutter · ⋯ → *Make it a punch item* · confirm the court · **Add**.
Today: impossible from Field, photoless on web.**

1. Tap the shutter (photograph the defect) → C3
2. *(hold)* the mic: *"the base cabinet's scribe is short on the left return"*
3. Tap **⋯ → Make it a punch item**
4. Confirm the court (kit default: **GC**) and tap **Add**

**Lands, as currently specified (`status: 'draft'`):** `create_client_decision(p_decision_id:
<device UUID>, p_payload: { designer_client_id, project_id, title, context, coordination_kind:
'punch', court: 'gc', room_id, section_key: 'install', status: 'draft' })` → **the margin rail's
collapsed "Drafts · N" fold**, from which she publishes at the desk.

> ⚠ **Correction — the three landings this package first named are all false for a draft.**
> `margin_items`' `decision` branch ends `where cd.status in ('pending','responded','expired')`
> (`00282:645`), so a draft is not in the margin's decision branch at all. `isOpen(item)` is
> `item.status === 'pending'` and `groupByCourt` skips everything else — its own docstring reads
> *"resolved/draft items don't sit in anyone's court"* (`coordination-derivation.ts:84-86`,
> `:103-110`); `summarizeCourts` does `if (item.status !== 'pending') continue`
> (`use-coordination.ts:346`), so the court bar counts zero. The Desk raises nothing. The one place a
> draft **does** appear is `margin-rail.tsx:375-378` / `:519-556` — a collapsed **"Drafts · N"**
> disclosure whose rows open the composer (`usePublishCoordinationItem`, `:210`). **That is a triage
> queue, relocated to the portal** — precisely what §16.1 refuses.
>
> ⚠ **And `'draft'` does not avoid the registered-client failure; it defers it.**
> `publish_client_decision` flips draft → pending and calls
> `_enqueue_decision_notification(p_decision_id,'decision_required')` (`00399:3505-3512`), which
> resolves the recipient as `designer_clients.client_id` and then **raises** *"decision % has no
> notification recipient"* when it is null (`00466:54-90`). So publish fails on exactly the projects
> FC-R7 worries about — days later, with an error about notification recipients, while she is sending
> a general contractor a punch item. And where publish *succeeds*, the **homeowner is notified** about
> a defect in the GC's court: a client-facing send §15.7 forbids and AGENTS.md's "no automated
> external sends" rule sits beside.
>
> **Do not brief this verb until FC-R7 is ruled with both of those facts on the table.** The third
> option worth pricing there is that a trade-facing punch is not a `client_decisions` row at all, but
> a `project_tasks` row with `owner='gc'` plus the already-live, party-anchored SMS rail.
>
> ⚠ **The payload also names a court with no person.** `client_decisions.court_party_id` is
> allow-listed (`00413:1829-1838`) and the portal composer resolves one from `project_parties`, which
> Field already queries (`SupabaseSiteRequestService.swift:44`) — a picker is one tap over an existing
> query. Either carry `court_party_id`, or state plainly that a Field punch is court-level only and
> the party is attached at the desk. The product's only *complete* field→structure loop (SMS,
> `apply_field_effect`) is party-anchored; this one should not be an exception by accident.
>
> ⚠ **"Zero new portal code" is true; "zero DDL" is not.** FC-R15's back-reference needs a
> `client_decisions.field_capture_id` column, a widened payload allow-list, and a `CREATE OR REPLACE`
> of a `SECURITY DEFINER`, money-adjacent RPC — see §9.5.

> ⚠ **Three verified gates the plan must respect** (`00413:1829-1861`): `designer_client_id` is
> **mandatory** and is absent from Field's `FieldProject` DTO (`ProjectsService.swift:19-38`);
> authorization runs through `_can_author_proposal(designer_id)`, not `auth.uid()` directly; and
> `status='pending'` **raises** — *"pending decisions require a registered client recipient"* — on any
> project whose `designer_clients` row has no registered `client_id`, which has nothing to do with
> whether a GC punch item is valid. **`'draft'` is the only status that always works.** Ruling **FC-R7**.

### Flow 6 · A market day (the sourcing visit)
**Target: 1 tap per specimen; 2 taps to tag one. Today: 1 tap, or ~6 to place.**

1. Today → **+ Start a visit → Sourcing** → venue name (GPS-prefilled from `LocationService`) →
   optionally tap ≤4 *projects in mind*
2. Per piece: tap the shutter → **flight toast** (~1.2 s, no gate) → destination = Library, inherited
3. For a piece that belongs to a project: tap its chip before the toast expires (+1 tap)

**Lands:** unchanged — `commit_field_capture(p_destination:'library')` mints
`products(layer='personal', capture_source='field_capture', field_capture_id, capture_provenance)`
(`00235:239-266`) on `/library`'s My Library shelf. A chipped piece additionally takes the
`place_product_in_project` post-commit step already implemented in `ProjectPlacementOrchestrator`
(lookup-before-write on `project_ffe_specs.routing_source->>captureId`).

Two fixes ride along:
- **`applySmartGuess` stops lying.** `ViewfinderModel.swift:413-423` stamps **every** photo
  `category='seating'`@0.72 and `material="Oak / bouclé"`@0.6 with `ProvenanceSource.smartGuess`.
  Those ride `payload.guesses` + `payload.provenance` into `products.capture_provenance`, and they
  make `hasUnconfirmedGuess` always true — so **S3 recommends Inbox for every capture ever taken.**
  Swap in the real `HeuristicSmartGuessService` (real `VNClassifyImageRequest`, Simulator-safe,
  already built, reachable today only behind the N5 sheet the photo path never opens).
  ⚠ **Removing the lie flips S3's default toward Library.** `S3DestinationScreen.swift:52-57`
  recommends `specimen.hasUnconfirmedGuess ? .inbox : .library`; the hardcoded guess is what makes
  `hasUnconfirmedGuess` always true, so today everything recommends Inbox. With it gone, a
  *confidently* classified photo starts recommending **Library — i.e. mint a product** — including a
  photo of a damaged baseboard. **Wave 2 therefore holds the recommendation at `.inbox` regardless of
  confidence** until visit kinds exist (wave 3), at which point the Library recommendation is gated on
  `kind == 'sourcing'`. Wave 2's device pass photographs a wall defect and confirms the recommendation
  is not Library.
- **Provenance becomes legible.** `products.capture_source` is never read by the portal. One chip on
  the Library card — *"Field · High Point, Mar 2026"*.

### Flow 7 · End the visit — the close as output
**Target: 2 taps. Today: no such act exists.**

1. Today → the open visit row → **End visit** (or the Companion strip's action) → **V4**
2. Skim what the visit produced; tap **Done**

`endVisit(identity:now:)` is **already wired** — `V1SessionTrayScreen.swift:61` has an *"End visit"*
button calling it at `:153-154`. But it does **not end anything**:
`CaptureSessionContext.swift:157-169` replaces the context with a fresh one at `now`; there is no
`endedAt`, no closed state, no record a visit occurred. Wave 3 changes that function's contract
**and** the `Codable` shape persisted under `capture.session-context.v1`, which means a
legacy-decode path defaulting the new fields — or the first launch after upgrade silently loses the
open context.

**V4 is a receipt that produces something.** Every row is already filed; its only acts are *Change
room* and *Place* (on an unplaced capture). It writes the Visits-block row on the project spread:
*"Tue Aug 25 · Living, Dining · 12 photos · 3 notes · 1 scan"*. It offers, one tap, a **completed**
`project_time_entries` row (`activity='site_visit'`, `duration_minutes > 0`) — never a running timer.
If anything is unplaced, **Done** is captioned *"3 captures still unplaced — they'll wait on Today."*
Honest, non-blocking.

⚠ **The close cannot stamp what the visit produced, and that is priced here rather than discovered in
wave 4.** `commit_field_capture`'s upsert ends `WHERE field_captures.status NOT IN ('saved',
'dismissed')` and, when the conflict is skipped, returns `'created', false` **without touching the
row** (`00235:187-199`). A sourcing visit routes to Library, i.e. `status='saved'` (`:255-264`) — so
**every market-run capture is immutable the moment it commits**, and closing that visit can never
write `visit_ended_at` onto any of them. Three consequences:
1. The Visits block derives a visit's **span from `min/max(created_at)`** over its captures.
   `visit_ended_at` is a device-side nicety, correct only for captures still at `status='inbox'`.
2. A mid-visit rename leaves two `visit_label` values for one `visit_id`. **Latest `created_at`
   wins**, resolved in the hook (§11.3).
3. If a real server-side close is wanted later it costs one narrow `SECURITY INVOKER` update RPC —
   and §2.4 decision 4's "zero new RPCs" claim goes with it. Price that then, not now.

### Flow 8 · She opens the portal — no inbox step
**Target: zero triage acts.**

| What she captured | Where it already is |
|---|---|
| A room scan | **Room files** block on the project spread (`RoomFilesSection`, mounted) + `/rooms`, `/room/[id]` |
| A voice note | **The margin rail**, as a `note` item with a play button and a photo strip |
| A site photo | On the note it was taken with; on the room's card in the Visits block |
| A punch item | The coordination band's GC court + the `decision` margin branch |
| A market find | `/library`, My Library shelf, with a **Field** provenance chip |
| A piece placed to a room | The FF&E schedule, via `place_product_in_project` |
| The visit itself | The **Visits** block on the project spread |

---

## 7 · Screen catalogue

Legend: **NEW** · **MOD** · **RE-HOMED** · **RETIRED** (compiles, off the default path) · **DELETED**.

### 7.1 Today (`W1` `WorkDashboardScreen`) — MOD · wave 3
Vertical scroll on `CaptureColor.paper`, `.padding(.horizontal, 20)`, unchanged. Header unchanged.
**New Today band** above *Needs you*: an open-visit card (`CaptureColor.verdigris.opacity(0.14)`,
14 pt radius, filled dot + label in `CaptureType.bodyEmph`, `started 9:14am` + counts in
`CaptureType.footnote`/`inkSoft`, trailing **Camera** button); an **unplaced** row when the tray is
non-empty; `+ Start a visit` (`RouteActionButton(kind: .primary)`), always last.
**States** — *Empty*: header + Start a visit + the three existing empty attention lines, never a
blank screen. *Offline*: renders from cache with a hairline `wifi.exclamationmark` line —
*"Showing what's on this phone."* (the existing per-source `loadIssues` Retry block is not
duplicated). *Syncing*: `n queued` on the card's second line → U1. *Stale visit*: subtitle swaps for
*"Still at Maple St?"* with **Resume** / **End visit**.

### 7.2 C1 Viewfinder — MOD · waves 1–3
- `ViewfinderWorkButton` relabels **WORK → TODAY** (a11y id `field.realm.work` unchanged so the
  harness and analytics keep working).
- `ViewfinderVenueChip` (`ViewfinderControls.swift:36`) becomes the **visit chip**: project on top
  (`CaptureType.footnote` emph), room beneath (**`CaptureType.monoSmall`**, `inkSoft`). Tappable →
  `.visit`. ⚠ **There is no `CaptureType.caption`.** The enum is exactly `display, title, title2,
  body, bodyEmph, callout, footnote, eyebrow, monoSmall, monoBody` (`CaptureType.swift:22-35`);
  anything specifying `.caption` will not compile.

  | Visit state | Chip |
  |---|---|
  | Site visit, room chosen | `Maple St` / `Living` |
  | Site visit, whole house | `Maple St` / `Whole house` |
  | Sourcing | `High Point 214` / `Library` |
  | No visit | `Not placed` / `Tap to place` — `CaptureColor.terracotta` |
  | Locating | `Locating venue…` (today's string) |

- **The kit pill row** (wave 4), generalised from `SiteScanContextControls` (`:162-193`).
- **`OfflineQueueBanner` is finally rendered** (wave 1) as a thin strip beneath the top bar. It is
  dead code today, referenced only inside its own `#Preview` (`OfflineQueueBanner.swift:83-84`),
  driven by a new `NWPathMonitor` (zero hits in the tree) whose `.satisfied` transition also fires
  `sync.drain()` + `siteScan.resumePendingUploads(retryFailures: false)`.

### 7.3 V0 **Visit** — NEW (sheet `.visit`) · wave 3
The door. `.presentationDetents([.large])`, matching S1's chrome (`RouteSheetHeader`, `CaptureColor.paper3`).

```
┌───────────────────────────────────────────────┐
│  VISIT                                    ✕   │
│  Where are you today?                         │
├───────────────────────────────────────────────┤
│  ( Site visit )        ( Sourcing )           │   two kinds
├───────────────────────────────────────────────┤
│  Search projects…                             │
│  ● Maple St residence        last visit Fri   │   recent-first
│    Kippley residence         3 rooms          │
│    Harbor loft               ⚠ on this phone  │   ⚠ = cached, not refreshed
│  ─────────────────────────────────────────    │
│  + New project                                │   → S2 (existing)
├───────────────────────────────────────────────┤
│  ROOM        ( Whole house )  Living  Dining… │   merged specRooms + rooms
├───────────────────────────────────────────────┤
│  KIT   ( Site )  ( Walk-through )  ( Trade )  │   optional; sets consent + pills
│        ( Install )                            │
├───────────────────────────────────────────────┤
│              [  Start visit  ]                │
└───────────────────────────────────────────────┘
```

**States** — *Empty*: a `PatinaEmptyState`-shaped line pointing at `+ New project`. *Offline*:
uncached projects absent, list captioned *"12 projects on this phone. Others need signal."*
*Sourcing*: the project list is replaced by a venue field GPS-prefilled from `LocationService`, plus
*Projects in mind*, capped at four. *Already open*: the primary becomes **Change** and a destructive
**End visit** appears in the footer.

### 7.4 C6 **Voice** — NEW (fifth `CameraMode`) · wave 3
A full-bleed mode of the viewfinder, not a sheet, so it inherits the visit chip, the offline banner
and the mode selector.

```
        TODAY                       ⛰
        Maple St / Living
        ┌─────────────────────────────────────┐
        │   "the alcove on the north wall     │  live transcript, rising, max 6 lines
        │    is about forty-two and three     │
        │    quarters — check the return…"    │
        └─────────────────────────────────────┘
              ▁▂▃▅▇▅▃▂▁▂▃▅▇▅▃▂▁                  waveform from the existing engine tap
                        2:14                     elapsed ONLY — never a segment count
        (photo)(tag)(measure)(scan)[VOICE]
                 (  ●  tap to start  )           shutter-sized, shutter-placed
```

**Tap to start, tap to stop — not press-and-hold.** The design target is a twenty-minute client
walk-through, one-handed, while pointing at a room. Nobody holds a button for that, and a slipped
finger ends the note — which would make the whole segment/rotation apparatus (§8.2) exist for notes
the gesture forbids. **The correct interaction already ships one screen away:**
`SiteScanContextCapture.swift:175-177` — `pill(model.isRecordingVoice ? "stop.circle.fill" :
"mic.fill", model.isRecordingVoice ? "Stop" : "Note") { model.toggleVoice() }`. Copy that toggle into
C6, with a large visible **Stop**; today's N4 hold (`VoiceNoteSheet.swift:114-129`, a11y label
*"Hold to talk"*) becomes the same toggle in the same wave. **Press-and-hold survives only as the C3
card's shortcut for a ten-second remark**, where a hold is right.

*"seg 3"* is deleted from the chrome: a segment is an implementation detail she has no model for and
no action to take about. The count already lives in telemetry (§14, `voice.finish.segments`).

**States** — *Idle*: the mic and one line, *"Hold to talk. It lands on Maple St · Living."* — the
promise stated **before** she speaks. *Recording*: waveform + rising transcript + elapsed +
persistent recording chrome. *Interrupted*: *"Paused — your note is saved. Tap to keep
going."*; a resume opens audio segment N+1. *Recognizer unavailable / denied*: falls to the typed
editor **and the audio still records** — the inversion of today's all-or-nothing behaviour and the
single most important honesty fix in the package. *Offline*: nothing changes. *Cap reached*
(20 min / 24 segments): stops with a visible *"This note reached twenty minutes and stopped. Start
another when you're ready."*, never silently. (*"note ended at 20:00"* is withdrawn — it parses as a
clock time.)

### 7.5 C3 Quick-confirm card — MOD · waves 1, 3, 4
```
┌──────────────────────────────────────────────┐
│   ▢ thumb   Seating · 72%                    │  the guess, from the REAL service (wave 2)
│             Oak / bouclé · 60%               │
│   Maple St · Living            ⌄             │  placement line (WAVE 1) → S1 / V0
│   ─────────────────────────────────────────  │
│   ●  hold to add a note                      │  inline mic (wave 3)
│   [ Save ]        Add detail        ⌄ swipe  │
└──────────────────────────────────────────────┘
```
- **Wave 1** adds the placement line, presenting the **existing** `.assignVenue(id)` sheet (S1) — the
  app's only project picker — with no visit, no V0 and no offline cache.
  ⚠ **S1 as shipped cannot end there, and wave 1 must fix that or the affordance costs more taps than
  today.** Its single primary is *"Choose destination"* → `advance()`, which is
  `persistRouting(); coordinator.present(.destination(specimen.id))`
  (`S1AssignVenueScreen.swift:100-107`, `:359-362`) — so routing persists **only** on the path deeper
  into S3 → S4/S5, which *commits* the capture. And `onClose` dismisses without calling
  `persistRouting()` at all (`:78`), so **✕ throws away the project she just picked**. `.assignVenue`
  and `.destination` are both `CaptureSheet` cases over one root `.sheet(item:)`
  (`CaptureNavigation.swift:44-58`), so S3 *replaces* S1; nothing returns to the card, which is
  one-shot anyway (`ViewfinderModel.swift:281-284`). End to end that is **5–6 taps**, not one.
  **Wave 1 adds a second primary — "Done" → `persistRouting(); coordinator.dismissSheet()` — shown
  when S1 is presented from the capture path**, and makes ✕ either persist or say plainly that the
  placement was not kept. With that, the honest count is **placement line → project → room → Done =
  3 taps after the shutter**, returning to the camera.
- **Wave 3** replaces that target with `.visit` and adds the inline mic, which is what collapses
  Flow 2 from 7 taps to 2 (today, reaching voice costs *Add detail* → C5 → *Voice* → N4 → *Attach
  note* → back to C5).
- **Wave 4**: on a *sourcing* visit the card auto-dismisses to a ~1.2 s flight toast; the placement
  line becomes the projects-in-mind chips.

### 7.6 S1 Assign & venue — RE-HOMED · wave 3
490 working lines stop being *"the only screen that can set a project"* and become *"the screen that
corrects one capture."* It keeps its full form — project · project-room · **FF&E schedule slot** ·
shelf · editable venue label — because the placement menu (*No line* / *Create a new line* / *Fill an
empty slot* → `place_product_in_project`) has no other home and is genuinely per-capture. Header copy:
*"Route this capture"* → **"Where this belongs."** (*"Correct this capture"* was the first proposal
and is withdrawn: it names the screen after a mistake she probably did not make, on the surface where
placement actually *happens*.)

### 7.7 S3 Destination — RETIRED from the default path · wave 3
Remains the only caller of `sync.route()` and is **not deleted**. Skipped inside a visit; still
reachable from V3 and from the `catch` in `saveFromCard()` (`:297-300`), the deliberate
recoverable-choice seam. ⚠ Because it is *kept*, its own copy is inside §17.3's sweep: *"Inbox —
finish later"* (`:77`) and the blurb promising *"a quick visit you'll triage tonight"* both name the
thing this package says it removed.

### 7.8 V1 Session tray → **the tray** — MOD · waves 1, 3
- **Wave 1:** the footer reads *"Route all N"* and routes exactly one record —
  `if let first = items.first { coordinator.present(.assignVenue(first.id)) }` (`:126`). Wave 1 does
  **not** wire `sync.routeAll` here: bulk-placing a tray to one project is a different, unasked-for
  act. It **renames the button to what it does** — *"Place N"* — and walks the unplaced records one at
  a time. `sync.routeAll` keeps its one real caller, `V2CullDeckScreen.swift:238` (bulk cull-to-inbox),
  which stays.
- **Wave 3:** the query scope widens from `store.session(visitID:owner:)` to **unfiled** (graft from
  B), the header gains the visit line, and the footer's primary becomes **End visit** → V4. *Review
  each* → V2 cull deck is unchanged (V2's `sync.routeAll(ids, to: .inbox)` at `:238` is the one real
  `routeAll` caller and stays).

### 7.9 V4 **Visit review** — NEW (route `.visitReview`) · wave 4
Grouped list: *Captures · Notes · Scans · Unplaced*. Row = thumbnail (or a mic glyph), title or first
transcript line, room, sync state. Acts: *Change room* → S1; *Place* (unplaced only); *Play*.
Footer: **Done** + the time-entry offer. Empty: *"Nothing captured on this visit."* + **End anyway**.

### 7.10 F1 Scan setup — MOD · wave 3
Collapses to a one-line summary when a visit is open, auto-expanding when the visit's project is
absent from `ownableProjects()`.

### 7.11 SiteScanContextScreen (non-Pro) — MOD · waves 1, 3
- **Wave 1:** the honesty repair. `stopVoice` gates on `!transcript.isEmpty ||
  result.audioFilename != nil` (`:128`), where `transcript` is a **local** that already falls back to
  `self.partialTranscript` on the line above. Once audio is written the gate is satisfied, and the
  "Nothing recorded" branch is re-worded to the §15.4 ladder. **Keep the `partialTranscript`
  fallback**: the repaired guard is `!transcript.isEmpty || hasAudio` over that same local, and the
  *"couldn't make out the words"* branch keys on the same local — not on `result.transcript`, or the
  guard and the copy disagree about what "has text" means.
  ⚠ **The success toast overwrites the honest one.** `:141` sets
  `self.toast = "Voice note added to Inbox"` **unconditionally** after the enqueue, so a failure
  message set earlier never renders and the wave's acceptance criterion cannot pass. Hold the message
  in a local and set `toast` **once**, at the end — and reword `:141` in the same commit, since it is
  also one of §17.3's ten strings (as is `:86`, *"Photo added to Inbox"*).
- **Wave 1 copy for the three ESCALATE strings** (`:261`, `:264`, `:267`). Two earlier proposals are
  withdrawn: *"…go to Maple St · Living"* cannot ship in wave 1 because there is no visit to name, and
  *"stay with this scan session"* is **untrue** — `:135-142` enqueues these through the outbox to
  `field_captures`, pinned to the scan by provenance and readable in the Room File; "stay with this
  scan session" reads as *they do not leave this phone*. **Ship, in wave 1, in one commit with the two
  toasts:** *"This iPhone can't measure a room."* / *"Photos & notes for this room."* / *"These reach
  the studio as soon as you have signal — they're notes, not a scan."* The literal edit must preserve
  the shipped `.font(CaptureType.eyebrow / .title2 / .footnote)` and the three `CaptureColor` tokens
  chained at `:261-269`.
- **Wave 3:** give it a real `CaptureScreenID` case (it sets `screen.F1.context` at `:222`/`:224`,
  which is not an enum case), and re-word to name the visit once one exists.

### 7.12 Deleted
- `FieldPlaceholderScreen` — the Phase-2 freeze placeholder, zero references.
- `LowLightTorchOverlay` — preview-only dead code (`:122`); C1's real low-light UI is
  `ViewfinderNightChip` / `ViewfinderTorchPill` / `ViewfinderLowLightHint`. Delete or wire; do not
  leave it ambiguous.
- The two literals in `ViewfinderModel.applySmartGuess`.

---

## 8 · The voice-note pipeline, end to end

### 8.1 The rule
> **The audio is the record. The transcript is a reading of it.** (R114.1 two-tier trust.)

### 8.2 Recording (wave 1)
Write the file from the **existing** `AVAudioEngine` input tap (`SpeechVoiceNoteService.swift:74-76`).
No second `AVAudioSession`, no `AVAudioRecorder`.

- **AAC-LC in `.m4a`**, mono, 32 kbps ≈ **240 KB/min**. A 5-min note ≈ 1.2 MB; a 30-min walkthrough
  ≈ 7 MB — well inside the bucket's 500 MB object limit.
- **Nothing downstream changes.** `LocalCaptureSyncService.mimeType` already maps `m4a → audio/x-m4a`
  (`:656-668`); `00234:27-30` already allows `audio/mp4, audio/x-m4a, audio/aac, audio/wav`;
  `uploadMedia` already uploads the voice file and sets `payload.voice.audioPath` (`:313`);
  `CaptureStore.missingRequiredMedia` (`:510-531`) already treats `voiceAudioFilename` as required
  media. **All of it is dead code that becomes live and correct the moment the writer lands.**
- **A failed `AVAudioFile` open is non-fatal.** Recognition continues, the note ships transcript-only,
  `voice.audio_write_failed` is emitted. Never block a capture.
- ⚠ **A failed or missing *write* must be non-fatal too — and as the required-media rule stands, it
  is not.** `missingRequiredMedia` exempts a photo once it carries a durable `remotePath`
  (`CaptureStore.swift:512-517`) but appends the voice filename **unconditionally** (`:518-522`), and
  the voice upload never stamps a remote path on the specimen
  (`LocalCaptureSyncService.swift:404-420`) — so a voice file is required-*local* **forever**. Worse,
  `CaptureMediaAvailabilityError` is not a `LocalSyncError`, so `isDeferrable` (`:48-53`) does not
  apply: it is a **hard** failure, not a deferrable retry. Extending that rule to every segment
  unchanged would let one unreadable segment permanently block a note that **today** syncs
  transcript-only — the honesty repair making the outcome worse. **Mirror the photo rule:** stamp each
  segment with its remote path and exempt it once uploaded; on a missing local segment **drop that
  segment, mark the row `audio_lost`, and commit the transcript.** Device pass: fill the disk, record,
  confirm the note still lands.
- ⚠ **Derive the file format from the tap; never hardcode the channel count.** `format` is
  `inputNode.outputFormat(forBus: 0)` (`SpeechVoiceNoteService.swift:63`), and its channel count is
  route-dependent — a USB or Bluetooth interface can yield ≠ 1. `AVAudioFile.write(from:)` asserts
  `processingFormat.channelCount == buffer.format.channelCount` and raises an
  `NSInvalidArgumentException`, which is **not** a Swift `Error`: `try?` does not catch it and the
  process traps. Take `AVNumberOfChannelsKey` from `format.channelCount` (or install the tap with an
  explicit mono `AVAudioFormat`), and guard every write with
  `buffer.format == file.processingFormat`. Device pass: connect and disconnect AirPods mid-note.
- ⚠ **Enforce the cap, do not merely define it.** `VoiceRecordingPolicy.shouldEnd(totalElapsed:
  segmentCount:)` must actually be called from the rotation check and end the note visibly. A policy
  type that is unit-tested and never invoked reports green over behaviour that cannot happen.
- **Rotate the recognizer, never the file.** `SFSpeechRecognizer` caps at roughly **one minute of
  audio per request** (~1,000 requests/device/hour), and today one request covers the whole session —
  so any note over a minute silently truncates. Restart the request every ~50 s, appending each
  finalized `bestTranscription.formattedString`; the `AVAudioFile` stays one continuous file per
  segment. Boundary word-loss is acceptable **because the audio is the record**.
- **Cap at 20 minutes / 24 segments**, ending visibly.
- **Set `requiresOnDeviceRecognition`.** It is never assigned anywhere in the file, so despite the
  shipped permission string *"Transcribes your voice notes on-device."* (`generate_project.rb:88`)
  recognition may be going to Apple's servers — a permission-string/behaviour mismatch with privacy
  consequences. `request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition`, and
  record which path ran.

### 8.3 Interruptions (wave 1)
Nothing in the app observes `AVAudioSession.interruptionNotification` today.

| Event | Behaviour |
|---|---|
| `.began` (call, Siri, alarm) | finalize the segment, release the `AVAudioFile`, mark the note `interrupted`, keep everything written; C6 shows *"Paused — your note is saved."* |
| `.ended` with `.shouldResume` | **reactivate the `AVAudioSession`, `prepare()`/`start()` the engine, reinstall the tap** — *then* open **audio segment N+1**; the note carries an ordered array of paths. ⚠ iOS **stops** the engine on `.began`, so a handler that early-returns on `guard audioEngine.isRunning` at `.ended` can never fire, and nothing else restarts the engine or the session |
| A second note on the same screen | **Reset every per-note field at the top of `startLiveTranscription()`** — `noteID`, `audioFile`, `audioFilename`, `audioSegments`, `segmentStartedAt`, `interrupted`. One `SpeechVoiceNoteService` instance serves arbitrarily many notes: it is constructed once per **screen** (`SiteScanContextCapture.swift:237`, `SiteScanHostScreen.swift:212`), and `startLiveTranscription()` today resets only `latestTranscript` and `startedAt` (`:46-48`). Per-instance segment state makes note 2 inherit note 1's audio |
| `mediaServicesWereReset` | rebuild the engine; same segment-N+1 rule |
| Route change (AirPods yanked) | keep recording on the new route; one honest line |
| Backgrounded / locked | **stops** in waves 1–4. No `UIBackgroundModes` key exists anywhere. Ruling **FC-R9**. |

⚠ **The tap block belongs to the render thread and may do exactly two things.** `installTap`'s
callback runs on `AVAudioEngine`'s real-time render thread; it may `append` to the recognition request
and `write` to the `AVAudioFile`, and nothing else. Recognizer rotation mutates `request` / `task` /
`segmentStartedAt`, reads `latestTranscript` (written from the recognition callback) and performs an
XPC round-trip — all of which must be **posted** to a serial queue or an actor, never performed inline.
`@unchecked Sendable` (`SpeechVoiceNoteService.swift:14`) silences the compiler, not the race; the
symptom is audio glitching and torn state at rotation boundaries.

⚠ **Remove the interruption observer, correctly.** `NotificationCenter.addObserver(forName:object:
queue:using:)` returns an opaque token — the observer is **not** `self`, so
`removeObserver(self, name:…)` removes nothing and every recording leaks another block observer onto a
long-lived service. Store the returned `NSObjectProtocol` and `removeObserver(token)` in `finish()` and
`deinit`.

### 8.4 Storage
`capture-media/<uid>/<clientToken>/…` exactly as today, built in the one place that builds it
(`CaptureMediaPath`, both segments lowercased, with its own test). Zero policy change, zero bucket
change, upsert-idempotent replay preserved.

```
capture-media/<uid>/<clientToken>/voice-<noteID>-000.m4a   # segment 0 == voice_audio_path
capture-media/<uid>/<clientToken>/voice-<noteID>-001.m4a   # segment 1 after an interruption
capture-media/<uid>/<clientToken>/<photoUUID>.heic         # unchanged
```

> **Do NOT route this through the `media_objects` registry** (00489/00494/00495/00498). 00489's own
> header scopes it to the GPU splat pipeline and calls it *"mutable until a second consumer adopts
> it."* Becoming that second consumer would freeze a moving registry for zero v1 benefit.

### 8.5 Transcript today (waves 1–5)
- The on-device draft lands in `field_captures.voice_transcript` with `transcript_source='device'`
  (or `'device_partial'` when recognition threw mid-note) and — as today — is also written into the
  specimen's `note` field with `ProvenanceSource.voice` (`VoiceNoteSheet.attach()`, `:200-212`).
- **It is labelled a draft once, where she reads it** — one italic line under the note in the margin:
  *"A first reading. The recording is here."* No mechanism talk. Never "AI".

### 8.6 Server transcription — **wave 6A**, deterministic, cheap, and separately schedulable

> **Wave 6 is two halves, and they are not gated together.** Transcription is deterministic, costs
> **$1.15/mo** at pilot volume (§8.9), has an exact in-repo precedent, and is Kody's brief's literal
> ask — *"voice notes with transcription"*. It is also what makes a one-minute transcript in the
> margin readable at all (§2.1's 80-character caveat). Structuring (§8.7) is the speculative half.
> Gating them on one number — *"is the device transcript good enough?"* — is circular, because §8.2
> **specifies** the device transcript as lossy at every 50-second rotation boundary by design; the
> answer is knowable before the measurement. **Wave 6A is schedulable with or immediately after wave
> 4**, subject to FC-R18. **Wave 6B stays evidence-gated exactly as written.**

> ⚠ **The mechanism below is not settled until FC-R18 is ruled.** Phase 3 capture enrichment already
> ships an execution ledger, a transactional outbox, an atomic claim
> (`claim_capture_enrichment_run`) and a Cloudflare-Queue consumer whose `target_type` CHECK is
> `('proposal_capture','field_capture')` (`00514:41-43`) — **for these same rows** — and AGENTS.md's
> standing rule is *"Never a parallel queue."* If the Phase 3 ledger wins, wave 6A collapses to
> *"add a transcript-shaped suggestion key and a consumer branch"*, not a new edge function, a new
> cron and a new sweep predicate. Build the shape below **only if** Kody rules that voice is a
> separate lane, and say why in §10 if so.

**Mechanism (if voice is a separate lane): pg_cron sweep + edge function**, the exact
`derive-scan-photo-media` shape
(`00340:52-73`): a partial index over the sweep predicate, `cron.schedule('*/2 * * * *', $$SELECT
public.invoke_edge_function('transcribe-field-note','{}'::jsonb)$$)`, `transcribe_attempts < 5`
terminal park, a `transcribe_error` column for triage, a `job_runs` row per invocation, and a
**billing guard that checks for eligible rows before any outbound HTTP** (`derive-scan-photo-media/index.ts:38-45`).

Rejected: **storage webhooks** (zero in-repo precedent) and **DB trigger → `pg_net`** (untestable in
the SQL suite, no attempt/park semantics, and `net` is a *signed permanent ACL exception* on prod per
`supabase/tests/edge_api/public_acl_exception_registry.sql` — adding new dependence on it is the
wrong direction).

**Vendor: Cloudflare Workers AI `whisper-large-v3-turbo`, $0.00051/audio-min.** Chosen not primarily
on price but because the audio never leaves an account Patina already controls — **no new
subprocessor**. Groq Whisper turbo (~$0.00067/min, 217–228× realtime) is the latency alternative;
OpenAI/Deepgram/AssemblyAI each add a subprocessor.
**`SpeechAnalyzer` is unavailable** (iOS 26 floor; Field's deployment target is 18.0,
`generate_project.rb:17`). **WhisperKit is deliberately excluded** — a 547–955 MB model gated to
iPhone 15 Pro+/8 GB, a new SPM dependency and a first-run download UX, all to improve a transcript
that server re-transcription supersedes anyway.

**Reconciliation (R114.1, non-negotiable):** the server text lands in a **new `server_transcript`
column**; `voice_transcript` is **never overwritten**. The UI reads
`COALESCE(server_transcript, voice_transcript)` **unless** `transcript_edited_at IS NOT NULL`, in
which case her words stand and she is offered *"a clearer read of this note"* — one tap to view, one
to accept.

### 8.7 Structuring — **wave 6B**, designed and unscheduled

⚠ Same FC-R18 caveat as §8.6: a second dispatch mechanism over `field_captures` needs a ruling before
it needs a design.

**Mechanism (if ruled a separate lane): an `agent_tasks` kind, `field_note.structure`.** `task_type` has deliberately **no
CHECK** (`00297:41`), so a new kind is **zero DDL** — the same free ride `scan_pipeline.*` took.
Claimed by an edge function via `claim_agent_tasks` on a cron (`dispatch-scan-modal` is the
precedent), completing `outcome:'awaiting_review'`.

> **`agent_tasks` cannot be the designer-facing surface.** Its only SELECT policy is admin-domain
> (`00297:202-214`). Leah reads nothing from it. `agent_tasks` is the **job ledger**; the drafts
> table is the **proposal surface**.

**Module:** `supabase/functions/_shared/field-note-extract.ts`, a twin of the working, tested,
dependency-injectable `_shared/field-parse.ts` — direct `fetch` to `https://api.anthropic.com/v1/messages`
with `x-api-key` + `anthropic-version: 2023-06-01`, `tools: [TOOL]`,
`tool_choice: { type: 'tool', name: 'record_field_note_items' }`, injectable `fetchImpl`/`getEnv` so
tests run with no network. **Model: `claude-haiku-4-5`**, injectable per `field-parse.ts:47` so a
quality problem is a config flip to `claude-sonnet-5`, not a code change.

**Five mechanical anti-hallucination rules**, each checkable in code without a second model call:
1. **`source_quote` must be a literal substring of the transcript** (after whitespace
   normalization). If it is not, the item is dropped and the count is recorded in
   `agent_tasks.artifacts.dropped_count` for calibration.
2. **The model may never emit a uuid.** It returns `room_hint` / `project_hint` as *text*; resolution
   happens in Postgres at confirm time, against rows the caller can see. This extends
   `field-parse.ts:212`'s "only trust an id the model was shown" one step to "never let it emit one."
3. **Every measurement is `needs_confirmation: true`.**
4. **Flag, don't fill.** No owner and no date come back as `court: null, due_hint: null`, not a
   confidently assigned task.
5. **Whole transcript in one call** — a 20-min note is ~4k tokens; chunking loses the reference
   resolution that makes extraction useful.

**Mode-conditioned framing** (graft from C) — same tool schema, same cost, materially better landing:

| Kit | Item kinds allowed | Framing |
|---|---|---|
| Site | `note · measurement · task · product_mention` | "A designer walking a site, describing conditions and constraints." |
| Walk-through | `preference · decision · note · task` | "A designer with a client present. Distinguish what the client wants from what the designer intends." |
| Market | `product_mention · note · task` | "A designer sourcing. Vendor, SKU, price, lead time, and whether she liked it." |
| Trade walk | `punch · task · rfi · note` | "A designer walking work-in-place with a trade. Defects and who owns them." |
| Install | `punch · note · task · damage` | "A designer receiving goods. Condition, count, damage." |

**No auto-apply at any confidence.** This diverges from `sms-inbound`, which applies at ≥0.8
(`pipeline.ts:574`) — deliberately: an inbound SMS is a third party reporting a fact against a
*bounded set of open items the model was shown*; a voice note is open-ended authoring inside the
designer's own document. Confidence orders the list and pre-selects; it never commits. Ruling **FC-R12**.

**And a spoken measurement never becomes a measured record.** The applier must refuse to touch
`room_file_measurements` or `tolerance_class`; a confirmed `measurement` writes a `margin_notes` row
that *says* the number, tagged spoken. R108.1 + R114.1. If this program generates the *"field
evidence of transcription friction"* R108.1 named as its own re-open trigger, cite R108.1 directly —
do not quietly widen the applier.

### 8.8 Confirmation and landing (wave 6)
The confirm act is identical on both surfaces and calls one RPC:
`confirm_field_note_draft(p_draft_id uuid, p_patch jsonb)` → the `SECURITY DEFINER` applier
`_apply_field_note_draft`, **revoked from `authenticated` entirely**, modelled byte-for-byte on
`review_sms_message` / `apply_field_effect` (`00282:472, 489-560`). Designer edits in `p_patch` win
over the model's proposal. **The UI does not change when the model arrives** — it pre-fills the same
two verbs wave 4 already shipped.

### 8.9 Cost model
Pilot assumption (**inference** — no telemetry exists): 5 designers × 6 notes/day × 2.5 min ≈ 2,250
audio-min/month.

| Line | Rate | @2,250 min/mo | @20,000 min/mo |
|---|---|---|---|
| Cloudflare Workers AI `whisper-large-v3-turbo` | $0.00051/audio-min | **$1.15** | $10.20 |
| Claude Haiku 4.5 structuring (~1.5k in / 0.6k out per note) | $1 / $5 per MTok | **$4.05** (900 notes) | $36 |
| Supabase storage (32 kbps AAC ≈ 240 KB/min) | ~$0.021/GB-mo | **$0.01** | $0.10 |
| **Total** | | **≈ $5.25/mo** | **≈ $46/mo** |

Structuring cost is immaterial; model choice should be driven by extraction quality alone.

### 8.10 Idempotency, every hop

| Hop | Key | Enforcement |
|---|---|---|
| capture row | `client_capture_id` | `UNIQUE` (`00233:30`); `commit_field_capture` is `ON CONFLICT DO UPDATE … WHERE status NOT IN ('saved','dismissed')` (`00235:147-191`) |
| audio object | `capture-media/<uid>/<clientToken>/voice-<noteID>-NNN.m4a` | upsert PUT — replay overwrites identical bytes |
| audio integrity | **no wave-1 producer — deferred to 6A.** Nothing in waves 1–5 hashes the audio, and the two candidate mechanisms are *not* the same hop: `merge_capture_artifact_sha256` (`00235:382-395`) merges into the `artifacts_sha256` **JSONB** column, while a scalar `voice_audio_sha256` is a different lane. Pick one when a producer exists — 6A's re-transcription no-op check is its first real reader. Until then neither the column nor the `voice.audioSha256` wire key ships (§9.2) | — |
| transcription (w6) | sweep predicate `transcript_state='pending' AND voice_audio_path IS NOT NULL`; function no-ops when `transcribed_sha256 = voice_audio_sha256` | a re-run is free; a re-recorded note legitimately re-transcribes |
| structuring enqueue (w6) | `idempotency_key = 'field_note.structure:' || capture_id || ':' || transcribed_sha256` | `agent_tasks.idempotency_key` is `UNIQUE` (`00297:54`) |
| draft rows (w6) | `UNIQUE (capture_id, extraction_run_id, ordinal)`; a new run **supersedes** prior `proposed` rows, never `confirmed`/`dismissed` | mirrors `site_binder_entries.supersedes_entry_id` |
| confirmation (w6) | the RPC no-ops when `state <> 'proposed'` and returns the existing `created_*_id` | mirrors `commit_field_capture`'s "already saved ⇒ idempotent no-op" |
| punch item | caller-supplied `p_decision_id` on `create_client_decision` | free outbox idempotency key |
| margin note | client-minted `id` on the insert | the outbox retries the same row |

---

## 9 · Data model

### 9.0 Two live neighbour lanes — read before touching `field_captures`

Both landed on `main` in the hour before this package was issued, and both touch exactly the objects
wave 1 touches. Neither is optional context, and the first of them falsifies this section's own
earlier headline.

**(1) `00521` is already taken.** `00521_svc_media_shape_reconciliation.sql` is on `main`
(`ca2b0641b`, 2026-08-24 15:05, branch `feat/svc-media-shape-reconcile`, pushed to `origin`) and is
**absent from `docs/engineering/migration-number-reservations.md`** — that lane skipped discipline
rule 5. So the reservations doc, the repo's declared single source of truth, is demonstrably
incomplete, and **repairing it is worth more than the reservation**: step one is to record the
svc-media 00521 in the doc; step two is to draw the Field Companion band above the true head after
`supabase migration list` **and** `git log --all --oneline -- 'supabase/migrations/*.sql'` **and** a
sweep of sibling worktrees (`git worktree list`) — the census this package originally ran covered
only the doc and `main`'s filesystem, which is exactly how it missed this.

**Consequently this package refers to its migrations symbolically** — *the W1 routing migration*,
*the visit/suggestion migration*, *the margin migration*, *the time-entry migration*, *the punch
back-reference migration* — and the numbers live in **one** place, the reservations doc, claimed at
landing (discipline rule 1). Twenty hard-coded numbers spread across a spec, a plan, a PR body and
six commit messages is the same class of error this section exists to correct.

**The band, confirmed 2026-08-24: `00530–00535`.** Both concurrent lanes have agreed it is clear and
acceptable as Field Companion's future band — **Phase 2 stays at or below `00529`, and Phase 3 holds
`00514–00520`** — so nothing either lane is carrying can collide with it. Three things about that
agreement matter more than the numbers:

1. **It is a *symbolic* reservation.** It is to be written into
   `docs/engineering/migration-number-reservations.md` as a band row; **nothing is minted until Kody
   approves the build.** No file in this program is named `005NN_*.sql` on disk before then.
2. **It is re-confirmed immediately before every push**, against **both** the ledger file **and**
   `supabase migration list` on Strata — the file-based push invariant recorded in
   `docs/ops/strata-staging.md`. A band agreed on a Tuesday is evidence, not authority; the head on
   the day of the push is authority.
3. **Where a file name is unavoidable** — the reservations-doc rows, the migration header, a
   `git add` pathspec, a commit subject — this package and the plan write **`005NN_<slug>.sql`**,
   where `NN` is **drawn from the reserved band `00530–00535` at landing**. That form is explained
   once, here, and used everywhere else without re-explanation.

The band holds six numbers and this program has six *scheduled* migrations: the W1 routing migration
(wave 1), the visit/suggestion migration (wave 3), the margin migration, the time-entry migration and
the punch back-reference migration (all wave 4, and the third of those is FC-R15's newly-priced DDL —
§9.5), plus wave 6A's server-transcript migration. **Wave 6B's `field_note_drafts` migration draws
its own number at its own landing, outside this band**, because 6B is unscheduled and a number
reserved for an unscheduled wave is a number held hostage.

**(2) Phase 3 "capture enrichment" is a second AI lane already pointed at `field_captures` — and it
auto-applies.** `00514_capture_enrichment_ledger.sql` + `00515_capture_enrichment_rpcs.sql` (commit
`a11268420`) ship an execution ledger whose `target_type` CHECK is
`('proposal_capture','field_capture')` (`00514:41-43`), an atomic claim
(`claim_capture_enrichment_run`), a transactional outbox and a Cloudflare-Queue message contract
(`packages/types/src/capture-enrichment.ts`) — and `record_capture_enrichment_result` writes model
output **straight into** `field_captures.category / subcategory / finish / vendor_name / sku`,
service-role only, with no review step (`00515:250`, `:287`). The reservations doc holds 00516–00520
for the rest of that lane.

**Three consequences to price now, not discover later:**

1. **`commit_field_capture` is a shared object with two live authors.** Phase 3's
   `00516_capture_producer_idempotency.sql` (branch `feat/capture-producer-idempotency`, committed in
   a sibling worktree) does `CREATE OR REPLACE FUNCTION commit_field_capture` **"from its 00235 body
   verbatim"** plus one added `enqueue_capture_enrichment(...)` call, and widens
   `enqueue_capture_enrichment`'s EXECUTE to `authenticated` because `commit_field_capture` is
   `SECURITY INVOKER`. **Whichever of the two lands second silently reverts the other** — no error,
   no failed migration. Applying the W1 migration after 00516 deletes the enrichment enqueue and
   Phase 3's producer stops firing; applying 00516 after it deletes the inbox-routing fix and the new
   payload reads. **Either author the W1 replacement from 00516's body, with 00516 declared a hard
   prerequisite in the reservations doc and in the migration header, or fold the routing fix into
   00516 and drop it from this program's band.** Ruling **FC-R18**.
2. **Principle 7 is no longer this program's ruling alone** — see §3.7.
3. **Wave 2 narrows a Phase 3 fill that cannot fire today anyway.** Phase 3 writes only when the
   column is `NULL OR ''`; `commit_field_capture` writes
   `category`/`subcategory`/`finish`/`vendor_name`/`sku` straight from the device payload
   (`00235:107-116`), and `applySmartGuess` (`ViewfinderModel.swift:413-423`) stamps a category on
   **every** photo — so Phase 3 can never fill `category` for a field capture. Wave 2's real-classifier
   swap narrows that without closing it: a confident-but-wrong on-device guess still permanently
   suppresses the server one. That is a fact for FC-R18's owner, not a wave-2 blocker.

### 9.1 Migration numbering, ACLs, and what the SQL suite proves

Discipline rules 1 and 2 bind: **pick the number at landing, not at authoring, and re-check
`supabase migration list` against Strata immediately before every push** — with the census widened
per §9.0. Land the band — **00530–00535**, pre-agreed with both live lanes — as an edit to
`docs/engineering/migration-number-reservations.md` before or with the first migration (rule 5),
**in the same commit that records the missing svc-media 00521**. The reservation is symbolic until
Kody approves the build; the address on each file is drawn at that file's landing.

Live bands to draw above: 00494–00497 (Phase 2), 00498–00502 (Rendered Room v2), 00510,
00511–00513 (SD-hardening; **00512 is reserved-parked and unapplied** on
`followon/sd-caller-hardening-00512`, a branch that also carries a known live defect, so if it ever
lands it applies out of order), **00514–00520 (Phase 3 capture enrichment — 00516 authored on a
branch, 00517–00520 still held by that lane)**, and **00521 (svc-media, on `main`, unrecorded)**.
Field Companion's band is **00530–00535**, pre-agreed with both live lanes (§9.0) and re-confirmed
against the ledger file + `supabase migration list` before every push.

Every **new** `public.` routine needs the explicit `REVOKE ALL … FROM PUBLIC, anon` idiom
(`00437:516-529`) or the ACL conformance gate trips — prod default privileges auto-grant `anon`
EXECUTE on new public functions, and that has bitten twice. ⚠ **That rule is for *new* routines.**
`CREATE OR REPLACE` **preserves** the existing ACL — Postgres applies default privileges only at
creation — and `commit_field_capture` already carries `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE …
TO authenticated` (`00235:303-304`). Restate it belt-and-braces, but do not justify the restatement
with the default-privilege trap, and match the fuller canonical idiom if the conformance gate is
expected to notice (`00437:516-529` revokes from `PUBLIC, anon, authenticated, service_role`;
`00413:2603-2605` from `PUBLIC, anon, service_role` — "`PUBLIC, anon`" matches neither).

**The SQL suite is usable — the "71/108 red" figure is stale and must not be quoted again.**
`supabase/tests/KNOWN_FAILURES.md` records that the `pg_temp` permission-denied family (55 files)
**is fixed**, leaving **22** documented known failures across **122** test files, one of which was
closed by 00510; `scripts/run-sql-tests.sh` treats those 22 as expected and **exits 0 if only they
fail**. So every wave runs `scripts/run-sql-tests.sh -f <name>` *and* the full suite, and reports
both — a new unexpected failure is a real regression, not noise. ⚠ The runner connects as `postgres`
(superuser, `:92`), so `auth.uid()`-shaped assertions exercise the RPC's logic with **RLS bypassed**
(`apply_field_effect_test.sql:25-27` documents exactly this caveat). **No wave report may claim "RLS
verified" on the strength of them.**

### 9.2 The **W1 routing migration** — `005NN_field_capture_notes_and_routing.sql` (wave 1)

The one migration wave 1 needs. Three things, all additive. ⚠ **`NN` is drawn from the reserved band
00530–00535 at landing (§9.0/9.1); the body is authored from 00516's, not 00235's (FC-R18).** 00516's
body is in flight: a fix lane is adding a `SECURITY DEFINER` wrapper,
`enqueue_capture_enrichment_for_producer(...)`, keeping the raw `enqueue_capture_enrichment` primitive
service-role-only, and repointing `commit_field_capture` to call the wrapper. The W1 author must start
from the **merged**, post-fix 00516 body and land after it; any enrichment enqueue this migration adds
must call `enqueue_capture_enrichment_for_producer(...)`, never the raw primitive.

```sql
BEGIN;

-- ── (a) The note shape and the audio lane ────────────────────────────────
-- CHECK constraints are NAMED: wave 6A widens transcript_source and
-- audio_retention, and a system-generated name is more expensive to DROP.
ALTER TABLE field_captures
  ADD COLUMN IF NOT EXISTS capture_kind text NOT NULL DEFAULT 'specimen'
    CONSTRAINT field_captures_capture_kind_ck
    CHECK (capture_kind IN ('specimen','note','context')),
  ADD COLUMN IF NOT EXISTS voice_audio_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS voice_audio_purged_at timestamptz,
  -- DEFAULT 'keep', NOT '90_days'. Nothing purges anything until wave 6A's
  -- maintenance cron exists, and a column default that asserts a retention
  -- policy nothing implements is exactly the unverifiable claim §15 forbids.
  -- The default flips to '90_days' in the migration that ships the purge.
  ADD COLUMN IF NOT EXISTS audio_retention text NOT NULL DEFAULT 'keep'
    CONSTRAINT field_captures_audio_retention_ck
    CHECK (audio_retention IN ('keep','discard_after_transcript','90_days')),
  ADD COLUMN IF NOT EXISTS transcript_source text
    CONSTRAINT field_captures_transcript_source_ck
    CHECK (transcript_source IS NULL
           OR transcript_source IN ('device','device_partial','server','designer')),
  ADD COLUMN IF NOT EXISTS note_setting text
    CONSTRAINT field_captures_note_setting_ck
    CHECK (note_setting IS NULL OR note_setting IN ('solo','conversation'));

-- Carried unbuilt since R112/R113. useScanContextCaptures does a `@>` containment
-- filter (use-room-files.ts:385, fn at :370) that is a seq scan today.
CREATE INDEX IF NOT EXISTS idx_field_captures_provenance_gin
  ON field_captures USING gin (provenance jsonb_path_ops);

-- ── (b) RLS hardening: five policies, no behaviour change ────────────────
-- 00233:155-188 carries NO `TO authenticated` clause, so all five default to
-- PUBLIC. Harmless today (auth.uid() is null for anon) but against house
-- convention after the mood-board incident. Restate, do not widen.
DROP POLICY IF EXISTS field_captures_owner_select ON field_captures;
CREATE POLICY field_captures_owner_select ON field_captures
  FOR SELECT TO authenticated USING (designer_id = auth.uid());
-- … owner_insert / owner_update / owner_delete / org_inbox_select restated
--     identically, TO authenticated, predicates byte-identical.

-- ── (c) The fix without which nothing lands ──────────────────────────────
-- commit_field_capture's initial INSERT never sets project_id/project_room_id
-- (00235:89-146), and its inbox branch sets ONLY status (00235:205-217); only
-- the library branch persists routing (:255-264). Every note-shaped capture
-- takes the inbox path, so today every note arrives with no project column.
-- CREATE OR REPLACE with the SAME signature, authored from 00516's body.
--
-- ⚠ THE INBOX BRANCH NEEDS ITS OWN SAFE HARBOR. 00235:85-88 states the routing
--   deferral is DELIBERATE: "project_id / project_room_id are deferred to the
--   library branch so a bad route can be safe-harbored instead of hard-failing
--   the whole sync," and the library branch is wrapped in
--   BEGIN … EXCEPTION WHEN OTHERS (00235:223-299). An unwrapped inbox UPDATE
--   turns a documented safe-harbor into a hard abort: field_captures_guard_routing
--   RAISEs (00233:206/212/224/230/240) would kill the whole RPC, and on the device
--   that surfaces as a plain Error, not a LocalSyncError — so runAttempt's catch
--   falls to recordFailure (LocalCaptureSyncService.swift:219-235) →
--   .retryableFailure, retried on EVERY drain forever. Reachable whenever a
--   stamped project/room goes stale (project transferred, room deleted, room
--   belonging to another project once projectRoomID starts flowing). So:
--
--   IF p_destination = 'inbox' THEN
--     BEGIN
--       UPDATE field_captures
--          SET status          = 'inbox',
--              project_id      = CASE WHEN v_clear_routing THEN NULL
--                                     ELSE COALESCE(p_project_id, project_id) END,
--              project_room_id = CASE WHEN v_clear_routing THEN NULL
--                                     ELSE COALESCE(p_project_room_id, project_room_id) END,
--              shelf           = CASE WHEN v_clear_routing THEN NULL
--                                     ELSE COALESCE(p_shelf, shelf) END
--        WHERE id = v_capture.id
--       RETURNING * INTO v_capture;
--     EXCEPTION WHEN OTHERS THEN
--       -- Safe harbor, byte-for-byte the shape of 00235:278-291: park with
--       -- routing untouched and stash the conflict so she can re-route by hand.
--       UPDATE field_captures
--          SET status      = 'inbox',
--              raw_payload = COALESCE(raw_payload, '{}'::jsonb)
--                            || jsonb_build_object('conflict', jsonb_build_object(
--                                 'error', SQLERRM, 'sqlstate', SQLSTATE, 'at', NOW(),
--                                 'attempted_project_id', p_project_id))
--        WHERE id = v_capture.id
--       RETURNING * INTO v_capture;
--     END;
--
-- The same replacement reads four new payload keys into the new columns, plus
-- the clear flag:
--   v_clear_routing      := COALESCE((v_payload#>>'{routing,clear}')::boolean, false)
--   voice_audio_segments = COALESCE(v_payload#>'{voice,audioSegments}', '[]'::jsonb)
--   capture_kind         = COALESCE(NULLIF(v_payload#>>'{captureKind}',''), 'specimen')
--   transcript_source    = v_payload#>>'{voice,transcriptSource}'
--   note_setting         = v_payload#>>'{voice,noteSetting}'
-- and adds them to the ON CONFLICT DO UPDATE SET list, matching the existing
-- voice_* lines at 00235:168-171.

REVOKE ALL ON FUNCTION public.commit_field_capture(uuid, text, jsonb, uuid, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_field_capture(uuid, text, jsonb, uuid, uuid, text, uuid)
  TO authenticated;

COMMIT;
```

**No new `status` value.** "Filed" is `project_id IS NOT NULL`. Introducing a terminal status would
silently revoke studio read, because `field_captures_org_inbox_select` keys on `status = 'inbox'`
(`00233:175-188`) — a defect nobody caught in Direction B and a trap for any synthesis that adopts
one.

**Un-placing is a payload key, not a new parameter.** `COALESCE` cannot distinguish *"not supplied"*
from *"explicitly cleared"*, so without a clear path a mis-placed capture can never be un-placed from
the phone — and S1, the very screen §7.6 re-homes as *"Where this belongs"*, could not perform the
correction it exists for. R3-1 calls a wrong visit a **systematic** error, and there is no portal
surface that un-places either (`route_field_capture` / `dismiss_field_capture` have zero web callers;
they appear only in `database.types.ts`). ⚠ **Do not solve it with a defaulted argument**: in Postgres
`CREATE OR REPLACE` with an added defaulted parameter creates a *second overload*, and every existing
seven-argument call then resolves ambiguously. Read `v_payload#>>'{routing,clear}'` instead — one more
wire key on a path that already reads four, with no signature change.

**Two columns deliberately *not* shipped in wave 1, and three forward-declared.**
`voice_audio_sha256` and its `voice.audioSha256` wire key have **no wave-1 producer** — nothing in the
recorder or the uploader hashes the audio — so they land with wave 6A beside the re-transcription
no-op check that is their first reader (§8.10). `transcript_edited_at` lands with 6A too: its only
consumer is 6A's `COALESCE` rule. Forward-declared on purpose, because the payload reader is written
once: `note_setting` (writer = wave 3's consent posture), `audio_retention` (purge = 6A), and
`voice_audio_purged_at`. **`capture_kind` gets a real wave-1 producer** —
`FieldCapturePayload` gains a top-level `captureKind` (`'note'` for the voice-only path, `'context'`
for `ContextCaptureService`) — because a CHECK the app can never satisfy is a green test over
behaviour that cannot happen. And **bump `FieldCapturePayload.currentSchemaVersion` to 2** in the same
commit: its own contract says *"Bumped only alongside a 00235-side reader change"* (`:41-43`), and
four new payload reads is one. Without the bump, `capture_schema_version` cannot distinguish a
pre-wave-1 payload from a post-wave-1 one, which matters for any later backfill.

### 9.3 The **visit/suggestion migration** — `005NN_field_capture_visit_and_suggestion.sql` (wave 3)

```sql
ALTER TABLE field_captures
  -- the visit: an opaque, device-minted grouping key. NO FK, no visits table.
  ADD COLUMN IF NOT EXISTS visit_id   uuid,
  -- FC-R2 is unruled: this is the two-kind shape. If the designer judge's
  -- three-kind recommendation wins, this reads ('site','market','roving').
  -- EITHER WAY the vocabulary must not name one thing twice — the earlier
  -- draft had kit='site' duplicating kind='site' and kit='market' duplicating
  -- kind='sourcing'. Kits are the three that are NOT kinds.
  ADD COLUMN IF NOT EXISTS visit_kind text
    CONSTRAINT field_captures_visit_kind_ck
    CHECK (visit_kind IS NULL OR visit_kind IN ('site','sourcing')),
  ADD COLUMN IF NOT EXISTS visit_kit  text
    CONSTRAINT field_captures_visit_kit_ck
    CHECK (visit_kit IS NULL
           OR visit_kit IN ('walk_through','trade_walk','install')),
  ADD COLUMN IF NOT EXISTS visit_label text,
  ADD COLUMN IF NOT EXISTS visit_started_at timestamptz,
  -- Device-side only, and correct ONLY for captures still at status='inbox':
  -- a saved capture is immutable (00235:187). The Visits block derives a
  -- visit's span from min/max(created_at). See §6 Flow 7.
  ADD COLUMN IF NOT EXISTS visit_ended_at   timestamptz,

  -- the suggestion, ALWAYS distinct from the fact (graft from Direction B)
  ADD COLUMN IF NOT EXISTS suggested_project_id      uuid REFERENCES projects(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_project_room_id uuid REFERENCES project_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggestion_basis          text
    CHECK (suggestion_basis IS NULL
           OR suggestion_basis IN ('visit','scan','proximity','venue','calendar','transcript')),
  -- ORDERS suggestions in the tray. NEVER RENDERED (Principle 4, §2.2).
  ADD COLUMN IF NOT EXISTS suggestion_confidence     numeric(3,2)
    CONSTRAINT field_captures_suggestion_confidence_ck
    CHECK (suggestion_confidence IS NULL OR suggestion_confidence BETWEEN 0 AND 1);

CREATE INDEX IF NOT EXISTS idx_field_captures_visit
  ON field_captures (project_id, visit_id, created_at DESC)
  WHERE project_id IS NOT NULL;
```

> **`project_id` means *she said so*. `suggested_project_id` means *we think so*. Nothing reads
> `suggested_*` as truth, ever, anywhere.** One suggestion per capture, superseded on re-run —
> columns, not a table, because it must be indexable and sortable in the tray.

**`suggestion_confidence` orders suggestions and is never rendered.** Principle 4 forbids a confidence
number on any designer surface and §2.2 restates it — *the basis is always shown in words*. The column
exists so the tray can sort; a surface that renders it is a bug, and storing a number is exactly how a
future surface talks itself into showing one.

### 9.4 The **margin migration** — `005NN_margin_notes_field_capture.sql` (wave 4)

```sql
ALTER TABLE margin_notes
  ADD COLUMN IF NOT EXISTS field_capture_id uuid REFERENCES field_captures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_margin_notes_field_capture
  ON margin_notes (field_capture_id) WHERE field_capture_id IS NOT NULL;
```

Plus a `CREATE OR REPLACE VIEW margin_items` that recreates the prior body **verbatim** and changes
exactly the `note` branch — 00282's documented discipline for this view (`00282:600-604`). **No new
branch, no new kind**, no change to `lib/document/margin-derivation.ts`'s union, no new accent.

⚠ **The `note` branch must start carrying the body, or this program's central artifact is
unreadable in the Document.** Today it emits `left(n.body, 80) as title` and `''::text as detail`
(`00282:829-830`), and `NoteBody` (`margin-bodies.tsx:814-880`) renders the author and the escalation
actions and **never the body at all**; `useEscalateNoteToDecision` then forwards `body: row.title`
(`:855-859`), so escalating a transcript produces a decision whose text is its first eighty
characters. Fine for the R14 five-second typed note the branch was designed for. Not fine for a
transcript. **Wave 4's replace carries the full body** — in `payload.body`, or by widening `detail`
for the `note` branch only — **`NoteBody` renders it, and the escalation hooks receive the full
text.** "Recreate the prior body verbatim and change only the payload" will not produce that unless it
is written down, so it is written down here.

⚠ **`has_audio` reads false for a studio co-member, silently.** `margin_items` is
`with (security_invoker = true)` (`00282:606-607`), so the `field_captures` join runs under the
*reader's* RLS — and a co-member can read the **note** (`margin_notes_studio_read`, 00205) but not the
**capture** (owner-only unless `status='inbox'` **and** same organization, `00233:155-188`). She gets a
note with no play button and no explanation, which is §3.3's "never silently drop" and FC-R8's
asymmetry surfacing in a *view* rather than a policy. Either render an honest line — *"the recording is
the author's"* — or fold this case into FC-R8 before the view is written.

⚠ `margin_notes.anchor_kind` is `CHECK (anchor_kind IN ('line','section','letterhead'))`
(`00196:31-32`). Do **not** widen it; a field note anchors to `letterhead`, the view's own default
for un-anchored items.
⚠ **`chk_margin_notes_engagement` is an inclusive OR, not an XOR — and it has a third anchor.**
`00224:100-102` dropped and redefined it as
`check (project_id is not null or proposal_id is not null or designer_client_id is not null)`, where
`margin_notes.designer_client_id` (00224) anchors a note to a pre-project Discovery relationship. The
downstream conclusion holds — a capture with no project *and* no client still cannot be a margin note,
so it stays a `field_captures` row and waits on Today, the roving hole — **but an unplaced note that
belongs to a known client is already expressible as a margin note today, with zero schema change.**
That is a fourth option FC-R6 must list.

### 9.5 Reserved but unwritten

- **The time-entry migration** — `005NN_time_entry_field_visit_source.sql` (wave 4) —
  `project_time_entries.source` gains `'field_visit'`, one CHECK line.
- **The punch back-reference migration** — `005NN_client_decision_field_capture_ref.sql` (wave 4) —
  ⚠ **FC-R15 option (a) is not zero DDL, and the
  wave-4 package list must be re-sized for it.** `create_client_decision` allow-lists its payload keys
  and raises on anything else (`00413:1829-1838`): there is no `field_capture_id` key and no such
  column on `client_decisions`. Carrying the back-reference costs a column, a widened allow-list
  **and** a `CREATE OR REPLACE` of a `SECURITY DEFINER`, money-adjacent RPC — with its
  `REVOKE ALL … FROM PUBLIC, anon, service_role; GRANT EXECUTE … TO authenticated` restated
  (`00413:2603-2608`).
- **Wave 6A** (transcription) — `005NN_field_capture_server_transcript.sql`, the band's sixth and
  last number: `server_transcript`, `transcript_state`, `transcribe_attempts`,
  `transcribe_error`, `transcribed_sha256`, `voice_audio_sha256`, `transcript_edited_at`, the sweep's
  partial index, and the `audio_retention` default flip to `'90_days'` with the purge cron. **Shape
  depends on FC-R18** — if the Phase 3 ledger wins, most of this is a suggestion key instead.
- **Wave 6B** (structuring) — `field_note_drafts` + the confirm/dismiss RPC pair + the DEFINER
  applier. **Not written unless 6B is ruled in**, and its number is drawn at its own landing,
  **outside** the 00530–00535 band (§9.0): an unscheduled wave does not hold a number hostage.

### 9.6 What Field writes, and the gates

| Write | Mechanism | Status |
|---|---|---|
| `field_captures` + `capture-media` | `commit_field_capture` via the existing outbox | ✅ shipped, extended by the W1 routing migration (§9.2) and the visit/suggestion migration (§9.3) |
| `room_scans` + bundle | `confirm-scan-bundle` + `merge_scan_artifact_sha256` | ✅ shipped, untouched |
| `margin_notes` | plain insert, `margin_notes_designer_all` (`00196:52-55`) | ✅ open to Leah; studio co-members **read** only (00205). ⚠ The `margin_items` `note` branch truncates to 80 chars today — §9.4 |
| `client_decisions` (punch/RFI) | `create_client_decision` (`00413:2603-2608`) | ⚠ needs `designer_client_id` (absent from `FieldProject`'s DTO), passes `_can_author_proposal`, and **`'pending'` raises** without a registered client. ⚠ **`'draft'` is not a free pass**: a draft lands only in the margin's collapsed *"Drafts · N"* fold, and publishing it re-raises the same failure and notifies the **client** (§6 Flow 5). **FC-R7 must be re-decided with both facts on the table.** Carrying `court_party_id` is unsettled too |
| `project_tasks` | plain insert | ⚠ **designer-of-record only** — `projects.designer_id = auth.uid()` (`00169:60-62`). A studio co-member's *Make it a task* returns 42501. **FC-R8** |
| `project_time_entries` | plain insert, **completed** entry only | ⚠ never a running timer — `00177:39-41` partial unique index is the portal TimerButton's |
| `place_product_in_project` | existing post-commit orchestrator | ✅ shipped |
| `receiving_inspections.photo_asset_ids` | already written by iOS (`SupabaseReceivingService.swift:115` → CodingKeys `:250`) | ⚠ **already written, never rendered** — `log-inspection-drawer.tsx:151` hardcodes `[]`. A live defect; wave 4 renders it |

### 9.7 The room question, answered without a schema ruling
V0's room picker merges `FieldProjectDetail.specRooms` (`project_rooms`) and `.rooms`
(`public.rooms`) — both already returned by one `projectDetail(id:)` call
(`SupabaseProjectsService.swift`: the `FieldProjectDetail` struct at `:117-140`, `projectDetail(id:)` at `:146`) — matching case-insensitively on trimmed name. Each merged entry
carries up to two ids, and a capture stamps **whichever is legal for its lane**:

- `project_rooms.id` → `field_captures.project_room_id`
- `rooms.id` → `siteScanContext.projectRoomId` provenance + `room_scans.room_id`

When a room exists in only one list, that lane is stamped and the other stays null — never guessed,
never cross-assigned. `ContextCaptureProvenance.swift:21` already refuses to put a `rooms.id` in the
`project_room_id` column and **that refusal stands**. Whether merge-by-trimmed-name is acceptable, or
whether the two lists need a real server-side link, is ruling **FC-R5**.
**Do not change the flat dotted provenance keys** — `use-room-files.ts:370-395` filters
`.contains('provenance', {'siteScanContext.scanId': scanId})` and its own comment records that the
nested path matches zero real captures.

⚠ **The `public.rooms` lane is empty on exactly the projects FC-R7 is about.**
`FieldProjectDetail.rooms` is fetched by `fetchClientRooms(clientID: row.clientID)`
(`SupabaseProjectsService.swift:102`), and that file's own comment reads *"no client → no rooms to
list — return [] without a query"* (`:189`). So on any project whose `designer_clients` row has no
registered `client_id` — the same population where `create_client_decision('pending')` raises — the
merged picker degrades silently to `project_rooms`-only, and a site scan started from V0 has **no
room to attach to at all**. FC-R5's "cost of being wrong" and Flow 4's `ownableProjects()` tiebreak
must both cover *"this project has no client rooms yet"*, out loud, in the honest-expansion copy.

### 9.8 The RLS fault line — decide once, for the whole family
`field_captures` RLS is owner + org-inbox-**select** only; `margin_notes` gives studio co-members
**read** only (00205); `project_tasks` writes are designer-of-record only; `room_files` delegates to
a broader owner + designer-association + studio-co-member model. **These four disagree**, and the
disagreement must be settled **once** (ruling **FC-R8**), not per surface. Three facts the ruling has
to price:

1. There is **no org-scoped UPDATE policy** on `field_captures` at all (`00233:155-172` is
   owner-only), so any `SECURITY INVOKER` filing RPC no-ops for an assistant.
2. `capture-media` object policies gate on `auth.uid()::text = (storage.foldername(name))[1]`
   (`00234:39-69`), so a co-member branch is a `storage.objects` policy owned by
   `supabase_storage_admin` — a **platform-admin phase migration**, not an ordinary one.
3. Today a studio co-member can see a scan's drawings and an **empty** capture list. That asymmetry
   is documented in-code as an unfixed P2 and becomes load-bearing the moment the Visits block ships.

---

## 10 · Edge functions and crons

**Waves 1–5: none. Zero edge functions, zero crons, zero `agent_tasks` kinds, zero new RPCs.** That
is the point of the direction and it is what both judges scored highest.

**Wave 6, if ruled in — and only in the shape FC-R18 leaves standing.** Phase 3 capture enrichment
already owns a ledger + outbox + Queue consumer for these rows (§9.0), and AGENTS.md's standing rule is
*"Never a parallel queue."* If that ledger wins, most of this table collapses into a suggestion key and
a consumer branch. If it does not, **§10 must state why voice is a separate lane** — that sentence is
part of the deliverable, not a footnote.

| Unit | Shape | Precedent |
|---|---|---|
| `supabase/functions/transcribe-field-note/index.ts` | cron-invoked sweep; billing guard **before** any outbound HTTP; `transcribe_attempts < 5` park; `job_runs` row per invocation; `transcribe_error` for triage | `derive-scan-photo-media` (00340) |
| `supabase/functions/structure-field-note/index.ts` | claims `field_note.structure` via `claim_agent_tasks`; completes `awaiting_review`; never writes a business table | `dispatch-scan-modal` |
| `supabase/functions/_shared/field-note-extract.ts` | injectable `fetchImpl`/`getEnv`; forced `tool_choice`; the five §8.7 rules in `normalize()` | `_shared/field-parse.ts` |
| cron `transcribe-field-notes` | `*/2 * * * *` → `public.invoke_edge_function('transcribe-field-note','{}'::jsonb)` | `room-scan-parse-sweep` |
| cron `structure-field-notes` | `*/5 * * * *` | `dispatch-scan-modal-sweep` |
| cron `field-note-media-maintenance` | daily; purges audio past `audio_retention`, stamps `voice_audio_purged_at` | `site-request-media-maintenance` (00375) |

A `_shared/*` edit requires redeploying **every** importing function.

---

## 11 · Portal surfaces (minimal)

Five pieces, one of which is a hard prerequisite. All ship **unflagged** (§11.6).

### 11.1 Prerequisite — sign `capture-media` (wave 4, or earlier in parallel)
`grep -rn "capture-media" apps/ packages/` returns **nothing** outside `apps/mobile/Capture`. Until
web code can sign a URL from that bucket, every field photo and every second of field audio is
unreadable and every surface below is cosmetic.

```ts
// packages/supabase/src/hooks/use-capture-media.ts   (NEW)
export function useCaptureMediaUrls(
  paths: readonly string[],
  ttlSeconds = 3600,
): UseQueryResult<Record<string, string>>
// batched supabase.storage.from('capture-media').createSignedUrls([...paths], ttl)
```

The pattern exists twice already: `letterhead-instruments.tsx` (batched `createSignedUrls` at `:123`)
and `useFieldMediaUrl` in `use-party-sms.ts:164` (MMS). It also lights up
`components/room-file/capture-context-section.tsx`, whose docstring says signing was *"out of this
slice's scope"*, as a free side effect.

**Placement convention, stated so the data layer does not split by accident.** `useCaptureMediaUrls`
and `useProjectVisits` go in `packages/supabase/src/hooks/` (Supabase reads, shared). The escalation
hooks this package leans on are **portal-local** and stay where they are
(`apps/designer-portal/src/hooks/use-margin-notes.ts:64`, `:128`). Both conventions exist in the repo;
naming which is which here is the whole point.

### 11.2 Mount what already exists (wave 4)
- **`RoomFilesSection`** (`components/room-file/room-files-section.tsx`) is complete, tested, and
  referenced by nothing but its own file; its docstring calls it *"the project detail page's Room
  Files zone"* and it returns `null` when a project has no room-file-bearing scans. Mount it on the
  project spread of `app/(document)/doc/[id]/page.tsx`, between `<ScheduleSpine>` (`:1354`) and
  `<FFESection>` (`:1360`).
- **Union designer-owned scans into the two existing attach points.** Both filter to *client*-owned
  scans today — `useClientScans` in `letterhead-instruments.tsx:87-95` (`room_scans.user_id =
  clientProfileId`) and `useClientRoomScans` (`use-room-scans.ts:185-214`, `user_id =
  designer_clients.client_id`), which feeds Discovery's `SiteScanEditor` (`editors.tsx:295-325`).
  **A designer literally cannot attach her own site scan to her own project's document today.**

⚠ **Mounting `RoomFilesSection` unflagged puts rows on the project spread whose every destination is
dark.** Each row links to `/room/${scan.id}/file` (`room-files-section.tsx:65-69`), and that view is
`useFeatureFlag("room-file")` — fail-closed by house rule (`room-file-view.tsx:29`, `:63`) — and the
portal's only `field_captures` reader lives inside it. **Wave 4 therefore has a named prerequisite:
enable `room-file` for the pilot cohort, with the flag-on walk as a completion criterion, not a
follow-up.** Decide `call-sheet` at the same time if party/SMS surfaces are in the story. Refusing a
*new* dark flag while leaving the *existing* one off makes the wave-4 payoff invisible (FC-R10).

⚠ **And it ships ESCALATE-class placeholder copy onto the project spread.** `room-file-copy.ts:1-10`
says so in its own header — *"every designer-visible string here … is a design-owned decision … treat
these as provisional until that ruling lands"* — and `RoomFilesSection` renders `C.sectionTitle` from
it (`:53`). Add `room-file-copy.ts` and the Room File view's strings to §17.4's brand-voice budget, as
a wave-4 line item beside the mount.

⚠ **Unioning designer-owned scans changes what a client-provenance instrument *means*, and that is a
ruling, not "two one-hook changes".** `useClientScans` (`letterhead-instruments.tsx:84-95`) and
`useClientRoomScans` (`use-room-scans.ts:185-214`) are both *"what your client sent you"* instruments
inside the handoff-pipeline narrative. The union is probably right; make it a named line in FC-R10 and
**keep the provenance visible in the row** — *"yours"* vs *"from your client"*.

### 11.3 The **Visits** block (wave 4)
New, small, on the project spread beside Room files. One line per `field_captures.visit_id` on this
project, grouped in the hook, newest first; tapping a row expands to the captures with thumbnails and
transcripts. Read-only.

```
  VISITS
  ─────────────────────────────────────────────────────────
  Tue Aug 25 · Living, Dining        12 photos · 3 notes · 1 scan
  Fri Aug 15 · Whole house            4 photos · 1 note
```

**The label rule, and where the span comes from.** One `visit_id` can carry two `visit_label` values
if she renames mid-visit — **latest `created_at` wins**, resolved in the hook. The visit's span is
derived from `min/max(created_at)` over its captures, **not** from `visit_ended_at`, which a saved
capture can never receive (§6 Flow 7).

**Designed against a real volume, and the margin is not.** §4 M1 posits 12 captures · 3 notes · 1 scan
for one visit, and a project can accumulate six visits. **The Visits block is the home for everything
a visit produced; the margin rail carries only notes she deliberately promoted** — see §11.4. Without
that split the same material is listed twice and the rail drowns.

**Naming check.** *Visits* collides with nothing. "Capture Inbox" is doubly taken (`field_captures`
and `proposal_captures`, I84) — this package has no inbox to name. "Request" has three live senses
(R98 design requests / Site Requests / SMS coordination items) and is avoided unqualified. "Field
kit" is `components/document/discovery/field-kit.tsx` — form-field primitives, not on-site tooling.
And *"site visit"* is already the product's own vocabulary (`project_time_entries.activity`, 00198).

### 11.4 The margin (wave 4)
`components/document/margin-bodies.tsx`'s **existing** note case renders, when
`payload.field_capture_id` is present: the **full transcript body** (§9.4 — today `NoteBody` renders
no body at all), a **play button** (signed via §11.1), a small photo strip, and the italic draft line
from §8.5. `useEscalateNoteToDecision` / `useEscalateNoteToScopeChange` are untouched structurally and
work on field notes — **once they are passed the full text instead of the 80-character title**
(§9.4). That is the difference between "works for free" and "works".

**Only promoted notes go in the rail.** `margin-rail.tsx:436-468` renders a flat list (needs-action
float → anchor order → a *"Settled"* fold) with **no visit dimension**, built for the R14 five-second
note. Forty transcripts across six visits would drown it, and the Visits block already re-lists the
same material. The rule: **the Visits block is the record of a visit; the margin carries the notes she
promoted.** (If wave 4 prefers the alternative — field notes grouped under one expandable row per
visit in the margin — that is fine, but it is the *same* decision and it is made before the wave, not
during it.)

### 11.5 The Desk (wave 5)
**No new population, no new `NeedKind`, no `document_state` column.** One line added to `FieldDesk`'s
existing soft need-lines (`components/document/field/field-desk.tsx` — *"Two populations, both
actionable, never KPI tiles"*): a visit open more than 12 hours. *"Maple St · visit open since
Tuesday."* That is the only Desk surface this package asks for.

Also wave 4, a live defect: render `receiving_inspections.photo_asset_ids` in
`log-inspection-drawer.tsx` and the receiving surfaces, and stop hardcoding `[]` at `:151`.

### 11.6 Flags
**No new portal flag; the portal changes ship unflagged.** `room-file` and `call-sheet` are already
fail-closed and between them make most existing field surface dark, and MEMORY.md records at least
four flags never seen by a human. A third dark flag makes this work unwalkable.

It is safe because every change is a **read of data that only exists if a Field build wrote it**:
`RoomFilesSection` returns `null` with no scans (verified in its own docstring), the Visits block
renders nothing with no visits, and the margin payload only lights when `field_capture_id` is set.
⚠ **Two of those three are asserted, not verified.** Confirming the Visits block and the margin
payload change render nothing on a field-less project is an explicit acceptance criterion of wave 4,
not a footnote. Ruling **FC-R10**.

⚠ **But the flag that matters is the one that already exists.** `room-file` is fail-closed and gates
the destination of every Room-files row *and* the portal's only `field_captures` reader; `call-sheet`
gates the party surfaces. **Enabling `room-file` for the pilot cohort is a wave-4 prerequisite with a
named owner** (§11.2). Refusing a third dark flag is right; leaving the second one dark and calling the
wave delivered is not.

On the phone, the flag is the **build** — with one exception. Field has **no feature-flag mechanism at
all**: `CaptureAnalytics` exposes only `screen`/`event`/`identify`, while the client app already uses
`PostHogService.shared.isFeatureEnabled`. Wave 1 adds `isFeatureEnabled` to the seam, fail-closed,
**and gates the voice recorder behind it**. That gives the seam a real first consumer instead of a kill
switch wired to no circuit, gives FC-R11's consent question an off-switch that needs no build, and
gives the wave a device-pass step. ⚠ PostHog loads flags **asynchronously** —
`PostHogSDK.isFeatureEnabled(_:)` reads a cache populated after `setup` / `identify` /
`reloadFeatureFlags` — so a cold launch answers `false` for every key until the first fetch. That is
correct per the fail-closed intent and it is also the reason wave 1 calls `reloadFeatureFlags()` once
auth resolves.

### 11.7 Wave 1P — the portal work that can run *beside* wave 1

Four of the wave-4 portal packages need **no Field build at all** and act on data already in
production. Together they are ≈1 engineer-week, reversible with a portal revert, and they are the
cheapest available answer to *"does field material in the Document change how she works?"* — which is
this program's own P-1 risk. Sitting them behind ~10 weeks of iOS work and a distribution pipeline
that does not exist is the wrong order.

| Piece | Why it can run today |
|---|---|
| `useCaptureMediaUrls` (§11.1) | two in-repo precedents; **nothing downstream is anything but cosmetic without it** |
| Mount `RoomFilesSection` (§11.2) | complete, tested, returns `null` with no scans (`:37-40`); `room_scans.project_id` has been writable by Field since 00265, so any existing scan renders |
| Render `receiving_inspections.photo_asset_ids` (§11.5) | **a live defect, not a feature**: iOS has been writing the column (`SupabaseReceivingService.swift:115` → CodingKeys `:250`) into rows `log-inspection-drawer.tsx:151` hardcodes `[]` for. Those photos are in production **now** |
| Library provenance chip (§6 Flow 6) | `products.capture_source` already carries data and no portal surface reads it |

Plus the **`room-file` flag decision**, which is the prerequisite for the first two being visible at
all, and the brand-voice pass on `room-file-copy.ts`.

---

## 12 · Entry points beyond the app icon

| Entry | Wave | What it needs |
|---|---|---|
| **`TODAY` pill** on C1 | 3 | relabel only |
| **Companion hearth strip** | 3 | `FieldCompanionAction` exists; `RootView.handleCompanionAction` (`:218-226`) already switches on `action.id` with a `default:` no-op — adding `visit.resume` / `visit.end` is a two-case addition |
| **App Intents** — `StartVisitIntent`, `CaptureVoiceNoteIntent` | 5 | An `AppIntent` **in the app target** gives Siri + Shortcuts + Spotlight + **Action Button** with **no new target**, at the 18.0 floor. Note the app already fires a `settings.action_button_rebind` event and its O4 onboarding screen *teaches* an Action Button that does not exist. Zero `import AppIntents` in the tree today |
| **Control Center control + Lock Screen widget + the Live Activity renderer** | 5 | One new `CaptureWidgets` WidgetKit target. `generate_project.rb` creates **exactly four** targets (`:28-30`, `:129`) and `CaptureWidgets/` is an empty directory with zero target-generation code — **new Ruby before a single Swift file matters**. This one target pays three debts, including finally *rendering* the Live Activity whose `CaptureSyncAttributes` and `CaptureLiveActivityController` are built and driven but cannot display |
| **Learned-centroid suggestion** | 5 | on-device only, no entitlement, no App Review conversation |
| **EventKit + `CLVisit`** | 5, gated | `NSCalendarsUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription` are absent from **both** `Info.plist` (which declares only the `field://` scheme) and the `INFOPLIST_KEY_*` build settings. Always-location is a real App Review conversation. **Suggestion only** — pre-fills the door, never opens it |
| **Share extension** | ✗ | `CaptureShareExtension/` stays an empty directory. It solves importing from other apps, which no field moment in this package describes. Explicitly out of scope |

iOS forbids **starting** a recording from the background, so any Control-Center / Action-Button voice
entry must foreground the app for a moment regardless.

---

## 13 · Offline and sync semantics

**Unchanged and untouched** (`[G1] §4`): `enqueue()` never touches the network; drains are per-owner
serialized and revalidate `activeOwner` at every await boundary; media lives in the App Group;
`clientToken` is device-stable and never regenerated; upsert makes media replay free;
`commit_field_capture` is idempotent on `p_client_capture_id`; `CaptureTransferPhase.complete` is
impossible without a `receiptID`; `LocalSyncError.isDeferrable` leaves a record queued with no retry
penalty; the scan-upload chain's container-independent durable keys and `ScanConfirmPolicy`'s
4xx-vs-unreachable discrimination stay exactly as they are. **Do not simplify any of it.**

Five additions:

1. **Render `OfflineQueueBanner`** (wave 1). Dead code today. Nothing on the camera surface tells her
   she is offline and queuing.
2. **Add an `NWPathMonitor`** (wave 1). Zero hits in the tree. Wire `.satisfied` to `sync.drain()` +
   `siteScan.resumePendingUploads(retryFailures: false)`. Regained connectivity has never
   auto-drained.
3. **The door must work offline** (wave 3). The offline project + room cache is the largest new
   subsystem in the package and it sits on the critical path. **Extend `CaptureProjectRef` with
   additive optional properties** — it is today `{id, remoteId, name, createdAt, ownerUserID,
   ownerWorkspaceID}` (`Specimen.swift:224-249`), a stub for inline-created projects — rather than
   adding a new `@Model`. There is **no `VersionedSchema`/`SchemaMigrationPlan` anywhere in Field**
   (`Specimen.swift:7` says adding one is an owner-only migration), so additive *optional* properties
   migrate lightweight and a new `@Model` class must be added to `CaptureStore.schema` (`:41-45`).
   Extending is an **M**, not an L; the genuinely new work is refresh policy, eviction, owner scoping
   and honest staleness display — not the storage.
4. **Suggestions are computed on device at capture time**, so they exist offline.
5. **Filing works offline**: it writes the local record and enqueues; the tray shows *"placed ·
   syncing"*.

**Failure copy is specified, not improvised.** Never a spinner, never an empty list, never a disabled
control: *"12 projects on this phone. Others need signal."*

---

## 14 · Telemetry

⚠ **Prerequisite zero.** Field has **never sent a single analytics event**: a live PostHog query
returns **0 rows for `surface='field-ios'` over 180 days** against 6,017 for `surface='patina-ios'`,
because `Secrets.example.swift:16` has `postHogAPIKey: String? = nil` and no build or CI job sets
`POSTHOG_API_KEY`. A 64-event taxonomy and 75 call sites already exist and have never emitted a byte.
**Every tap count, latency target and kill-criterion in this package is currently unfalsifiable.**
Setting the key and *confirming rows appear* is wave 1 task 2, with a named owner, not a checkbox.

⚠ **And the fix must be a *build-time* path, or it silently regresses.**
`AppConfiguration.postHogAPIKey` is
`Secrets.postHogAPIKey ?? ProcessInfo.processInfo.environment["POSTHOG_API_KEY"] ?? ""`
(`AppConfiguration.swift:130-132`). On iOS `ProcessInfo.environment` carries only what an Xcode
scheme's **Run** action injects — never a device install, never TestFlight, never a CI archive — and
`Secrets.swift` is gitignored with a known worktree trap that drops it on a pbxproj regen. Setting it
in one engineer's `Secrets.swift` therefore makes the acceptance criterion pass on exactly one Mac,
**including for the archive Wave 0.5 exists to produce**. Wave 1 delivers an `.xcconfig` / build-setting
→ `Info.plist` path (or a CI/archive step that writes `Secrets.swift` from a secret), a startup log
line — *"analytics disabled — no key"* — and an archive-time assertion.

⚠ **Wave 1 emits its own events; they are a work package, not an aspiration.** `voice.start`,
`voice.finish`, `voice.segment_rotated`, `voice.interrupted`, `voice.audio_write_failed`,
`voice.empty_transcript`, `capture.placed` and `capture.unplaced` all land in wave 1, because the
wave's own acceptance criterion asks PostHog for `voice.finish` with `segments` and `on_device` and it
will not be there otherwise. `on_device` requires **storing** the resolved
`requiresOnDeviceRecognition` value, not merely setting it.

New events (all on the existing `CaptureAnalytics.event` seam):

| Event | Properties | Answers |
|---|---|---|
| `voice.start` | `surface` (c3/c6/f2/n4), `note_setting` | is voice used at all |
| `voice.finish` | `duration_s`, `segments`, `transcript_chars`, `on_device` | how long real notes are; is on-device recognition actually running |
| `voice.segment_rotated` | `index` | boundary quality on real notes |
| `voice.interrupted` | `reason` | how often a site visit interrupts a note |
| `voice.audio_write_failed` | `reason` | F1 rate |
| `voice.empty_transcript` | `had_audio` | **the honesty repair's own metric** — how often the old code would have silently discarded |
| `capture.placed` | `basis` (visit/manual/suggested), `has_room` | the program's headline metric |
| `capture.unplaced` | — | the roving hole's size |
| `visit.start` | `kind`, `kit`, `offline` | wave 3 |
| `visit.end` | `duration_min`, `captures`, `notes`, `scans`, `unplaced` | wave 3 |
| `visit.stale_prompt` | `answer` | the mis-stamp mitigation's own metric |
| `suggestion.shown` / `suggestion.accepted` | `basis` | whether suggestions earn their keep |
| `note.made_task` / `note.made_punch` | `outcome` | wave 4 — **and the evidence gate for wave 6** |

**Wave 6's gate is these numbers, not a hunch:** measured device-transcript quality from wave 1–3's
corpus, and the measured tap-cost of wave 4's manual verbs.

---

## 15 · Security, privacy, consent

### 15.1 The facts
A field voice note will routinely record **other people's voices** — the client on a walk-through, a
GC, a homeowner's family. **All-party-consent states** (CA, IL, WA, FL, PA, MA, MD, MI, MT, NH, CT,
DE, NV, OR) make surreptitious recording of a private conversation a criminal matter. Wisconsin is
one-party; **Leah's clients are not guaranteed to be in Wisconsin.**
⚠ **No recording-consent policy exists anywhere under `docs/`** — grep for "consent" hits only SMS
consent and `project_parties.sms_consent_status` (00281). This is the one item in the package with
real legal exposure and it needs a lawyer's read before any non-Kody designer records a client.
Ruling **FC-R11**.

⚠ **The exposure begins in wave 1, not wave 3 — so FC-R11 blocks wave 1.** Wave 1 writes and uploads
the `.m4a`, and **both** wave-1-reachable voice surfaces record other people by construction: N4 (a rep
at a showroom) and the in-scan context capture (`SiteScanContextCapture.swift:117-142`, used on a
walk-through with a client present). Every mitigation designed below — the `solo`/`conversation`
choice, the affirmation chip, the kit default, the recording chrome, the purge — is wave 3 or wave 6.
The mitigation wave 1 *can* carry is a switch: **gate the recorder behind the fail-closed
`isFeatureEnabled` seam wave 1 is already adding** (§11.6), so the exposure has an off-switch that
needs no build and no App Store round-trip.

### 15.2 Controls
1. **Never ambient.** Recording begins and ends on a deliberate act. (iOS enforces half of this: a
   background trigger cannot start a recording.)
2. **A note is `solo` or `conversation`, chosen at start.** A conversation note shows a one-line
   *"Everyone here knows this is being recorded"* affirmation she taps. A nudge, not legal advice —
   but it converts an invisible act into a deliberate one.
3. **The kit carries the default** (graft from C). A *walk-through* kit defaults every note to
   `conversation`; *site* and *market* default `solo`. The door question does consent work too.
4. **Unmissable in-app recording chrome**, plus wave 5's Live Activity.
5. **Retention is two policies, not one — the server's and the phone's.**
   *Server:* `audio_retention ∈ keep | discard_after_transcript | 90_days`, purged by a daily cron
   mirroring `site-request-media-maintenance`'s shipped 90-day purge (00375), stamping
   `voice_audio_purged_at`. The transcript survives; the audio does not. ⚠ **The column ships
   defaulted to `keep` until that cron exists** (§9.2): a default of `90_days` with nothing
   implementing it is precisely the unverifiable claim this section exists to forbid. Ruling
   **FC-R13**.
   *Phone:* there is **no local media lifecycle at all** today. `grep -rn removeItem
   apps/mobile/Capture --include="*.swift"` finds deletions only in `SiteScanBundleHome.swift` (scan
   bundles); `uploadMedia` does not clear local files after a successful commit, and
   `VoiceNoteSheet.discard()` (`:194-199`) abandons a recorded segment with no delete at all. At
   240 KB/min a single 30-minute walk-through is ~7 MB, on top of accumulating photos. **Wave 1 adds
   the phone-side rule**: delete a segment once its commit receipt lands, delete on Discard, and a
   size-capped sweep. Ruling **FC-R19**.
6. **Studio-private by default.** `margin_notes` is designer-authored, studio-visible, **never
   client-visible** (`use-margin-notes.ts:1-8`). A field note inherits that posture. Anything that
   would become client-visible is a separate, deliberate act.
7. **Never a client-facing surface in v1.** PRD open question O2 (client visibility into the Site
   Binder) is explicitly open; field notes must not pre-empt it.
8. **Subprocessor minimisation** (wave 6): Cloudflare Workers AI keeps audio inside an account Patina
   already controls — no new subprocessor.
9. **No automated external sends.** Drafts land `awaiting_review` (AGENTS.md, with full force).

### 15.3 Storage posture, unchanged
`capture-media` stays **private**, owner-scoped, `auth.uid()`-foldered. Any change to that posture is
a `supabase_storage_admin`-owned platform-admin phase migration and is out of scope until FC-R8 is
ruled.

### 15.4 The voice failure ladder — the honesty law, made concrete
Lifted close to verbatim from `[B] §5.6`, the best-written artifact in the research set. **This table
is the copy source; take it to the brand-voice pass nearly as written.**

| Failure | Today | After wave 1 |
|---|---|---|
| Transcription returns nothing | **silently discarded** — toast *"Nothing recorded"* | audio kept; the row reads *"We couldn't make out the words — the audio is here."* |
| Recognizer unavailable / denied | typed-note fallback, **no recording** | **recording still starts**; the transcript pane says *"We'll write this up when it lands."* |
| Audio file won't open (disk full / no App Group) | n/a | recording continues transcript-only, `voice.audio_write_failed`, never blocks |
| Note runs past 1 minute | silently truncates or errors | segments rotate; the file is continuous |
| Note hits the 20-minute cap | n/a | stops with *"This note reached twenty minutes and stopped. Start another when you're ready."* — never a silent stop |
| **N4: audio recorded, no words** | *"Attach note"* is **disabled**; the only enabled control is Discard, which dismisses without writing the specimen | the primary is enabled whenever `result.audioSegments` is non-empty, and it reads **"Keep the recording"** |
| Offline | commits when signal returns (already good) | unchanged + `NWPathMonitor` auto-drain + the banner is finally rendered |

⚠ **The ladder applies to every voice surface, not only the scan-context screen.** Wave 1's headline
repair lives in `SiteScanContextModel.stopVoice` (`SiteScanContextCapture.swift:128-134`), which is
reachable **only** from the F2 in-scan overlay and the non-Pro reference screen — so "she holds the mic
on a loud job site and the recording is still there" describes a moment that requires her to be running
a LiDAR scan. **N4 — the specimen voice sheet, where most voice notes are actually taken — fails
differently, and wave 1 must fix it too**: *"Attach note"* is
`primaryEnabled: !transcript.isEmpty && !isRecording` (`VoiceNoteSheet.swift:62-69`), so a note with
audio and no words cannot be kept at all; `discard()` (`:194-199`) dismisses without writing the
specimen and leaves the `.m4a` orphaned on disk forever. Wave 1: enable the primary whenever
`result.audioSegments` is non-empty, label it **"Keep the recording"**, apply the ladder line, and
delete the segments on Discard. The device pass records in a loud room **from N4**, not only from the
scan screen.

⚠ **"The audio is here" must be checkable, or the repair is another unverifiable claim.**
`grep -rn "AVAudioPlayer\|AVPlayer" apps/mobile/Capture --include="*.swift"` returns **zero hits** —
nothing in Patina Field can play a recording — and portal playback is wave 4, behind the `room-file`
question. **Wave 1 adds a play control** (size S; the file is already in the App Group): an
`AVAudioPlayer` on the N4 sheet and on the tray row. A day of work that turns an assertion into
something she can hear.

Every new string is bound by **"Designer-Taught Intelligence, never AI"** — the rule itself is
`docs/design/the-document/DECISIONS.md:1554` (*"Always the Engine / Designer-Taught Intelligence in
copy — never 'AI.'"*); the brand-voice skill carries only the adjacent rules (`:23` "NEVER lead with
AI, algorithm, engine"; `:36`'s avoid-list) — and by the truth-framing law: degrade honestly, never
block, never silently drop.

---

## 16 · Non-goals

Stated as commitments, because half the value of a direction is the work it refuses.

1. **No inbox, no triage queue, no review card, *in the portal*.** No Desk population, no `NeedKind`,
   no `document_state` column, no new registry room/ledger/verb, no card to clear. ⚠ On the *device*
   the concept remains — `status='inbox'`, `CaptureDestination.inbox`, S3 — and the unplaced tray is a
   filing queue, named as one, on Today, in her hand. Claim the true thing; it is still the strongest
   refusal in the set.
2. **No LLM structuring, no `field_note_drafts`, no `agent_tasks` kind, in waves 1–5.**
3. **No server transcription in waves 1–5.** Wave 1 writes the **audio**, which is the honesty
   obligation; re-transcription is wave 6, gated on measured device-transcript quality — the corpus
   for which is a free byproduct of wave 1.
4. **No spoken measurement ever becomes a measured record.** (R108.1 + R114.1.)
5. **No client-facing surface.**
6. **No share extension.** `CaptureShareExtension/` stays empty.
7. **No ambient or always-on recording, and no background auto-start.**
8. **No new `field_captures.status` value.** "Filed" is `project_id IS NOT NULL` (§9.2).
9. **No `field_visits` table.**
10. **No new global room, ledger, or verb in `lib/document/registry.tsx`.**
11. **No new NestJS service, no new worker, no Coolify** (the box is retired).
12. **No WhisperKit, no iOS 26 bump, no diarization.** Deployment target stays 18.0.
13. **No plan markup, no PencilKit, no video.** Zero of each exists today.
14. **No mood-board editing from the field.**
15. **No unification of the Receiving (`G2`) NestJS upload-session path** with `capture-media`. It is
    the one flow that uses the media service; wave 4 gives it a live camera, not a new pipeline.
16. **No reminder for an unplaced capture beyond the Today band**, in waves 1–4. M6 — *"capturing
    whatever a designer needs while on the move"*, the brief's own literal phrase — is an accepted
    limitation until wave 5 carries it on the Live Activity, or a local notification is ruled in
    (§4 M6, FC-R6). Written down because a refusal that is not written down does not count.
17. **No plan or spec viewer on the phone.** `[G1]` scored M9 (reading the current plan or spec on
    site) an outright FAIL and `[D6] §C10` names Programa's QR-to-spec pattern for it; nothing in
    waves 1–6 addresses it.
18. **No path from Field to `discovery` or the brief, and no finish-as-a-first-class-object.** Field
    never touches the `discovery` table and Work-flow decisions are read-only by design, so a client
    walk-through's real output — a preference or a selection — has **no destination in any wave**.
    M8 (a finish or a sample) has no home either: the nearest thing is the Library shelf, and that
    mints a *product*, which a finish is not. Named, refused, and owed.

---

## 17 · Migration path from today's app

### 17.1 Kept, untouched
The ten things that must not break (`[G1] §4`): the site-scan rig (one shared `ARSession`, four
recorders, the parametric coverage coach); the scan-upload chain; the capture outbox's idempotency
and receipt discipline; owner scoping (935 lines of `CaptureLifecycleTests` guard it); the library
safe-harbor (`commit_field_capture`'s `EXCEPTION WHEN OTHERS` parking failures back to inbox,
`00235:272-300`, and `applyCommitResult` trusting server truth only); **all eight Work flows**
(decisions stay read-only — a deliberate design, since selection is the client app's write path, and
this package adds punch/RFI *creation*, a different act); the SMS rail — the product's only complete
field→structure loop; the Site Request guest loop (`sr_` token namespace, the most rigorous outbox in
the codebase); the private owner-scoped `capture-media` posture; and the frozen wire contracts
(`FieldCapturePayload`'s camelCase keys, `ContextCaptureProvenance`'s flat dotted keys,
`CaptureMediaPath`'s lowercase-both-segments rule, the semantic-vs-transport MIME split).
⚠ **"Frozen wire contracts" means those *rules*, not "no new optional key, ever."** Additive optional
keys land in the wave whose behaviour needs them (§5.5) — wave 1 adds four, all optional, none of them
a foundation seam. ⚠ Note also that `00234:11` documents the object path as
`capture-media/<auth.uid()>/<client_capture_id>/<artifact>` while `CaptureMediaPath.folder(userID:
clientToken:)` builds `<uid>/<clientToken>` (`CaptureMediaPath.swift:21-23`); they coincide only
because the device passes `clientToken` as `p_client_capture_id`. **Do not "fix" either one to match
the other.**

### 17.2 Re-homed

| Was | Becomes |
|---|---|
| `CaptureSessionContext` — invisible routing memory | **The visit** — the app's spine |
| `WORK` pill / W1 dashboard | **TODAY** — the app's home |
| S1 — the only project picker, orphaned from the capture path (`present(.assignVenue…)` has exactly three call sites: `CaptureDeepLink.swift:96`, `S2CreateProjectScreen.swift:172`, `V1SessionTrayScreen.swift:126`; none is C3 or C5) | **The correction screen** for one capture |
| S3 — mandatory destination step | Recovery + V3 only |
| V1's *"Route all N"* footer (which routes one) | **End visit** → V4; the tray's scope widens to unfiled |
| The Companion hearth — decorative, two actions | **The visit banner**, one typed action |
| `ViewfinderVenueChip` — a placemark string | **The visit chip**, tappable |
| `OfflineQueueBanner` — dead preview-only code | **Rendered on C1**, driven by a real `NWPathMonitor` |
| `RoomFilesSection` — unmounted dead component | **Mounted** on the project spread |
| `route_field_capture` / `dismiss_field_capture` — zero web callers since 00235 | Wired into V4 / the Visits block for corrections |
| `CaptureSyncAttributes` — frozen, built, driven, unrenderable | Shape changed once (free until a renderer exists), then rendered in wave 5 |

### 17.3 Retired or deleted
- `FieldPlaceholderScreen` — delete (zero references).
- `LowLightTorchOverlay` — delete or wire; do not leave ambiguous.
- `applySmartGuess`'s two literals — delete, call the real service.
- The "unattached capture" as a *normal* state — retired by construction; it survives only as the
  explicitly-named unplaced tray.
- **The word "Inbox" in Field's user-facing copy.** ⚠ **Ten strings, not one — and the count *is* the
  decision.** `S3DestinationScreen.swift:77` (on a screen §7.7 explicitly **keeps**),
  `S1AssignVenueScreen.swift:306` and `:333`, `SiteScanContextCapture.swift:86`, `:141`, `:267`,
  `SiteScanSetupScreen.swift:154`, `SettingsScreen.swift:34`, `S4SavedTerminalScreen.swift:170`,
  `LocalCaptureSyncService.swift:38`. **Pick one: retire the concept from her vocabulary — rename the
  destination, rewrite all ten, re-title S3 — or keep the word and delete this claim.** Wave 1
  rewrites the three on the context screen (`:86`, `:141`, `:267`) because it is already editing that
  file; the other seven are an explicit wave-3 line item, not a footnote.

### 17.4 Copy and placeholder cleanup — inside the blast radius, not adjacent to it
Nine files carry ESCALATE-class placeholder copy, **all on the SiteScan coach/anchor/context
surfaces the site kit uses**: `SiteScanCoachViews.swift` (whole file per its own header; `:75`, `:92`,
`:124`, `:137`, `:147`), `SiteScanAnchorViews.swift` (`:55`, `:168-207`, `:246`),
`SiteScanContextCapture.swift` (`:261`, `:264`, `:267`), `FieldCoverageCoach.swift:189`,
`CaptureSurface.swift:14,44`, `CoverageScorecard.swift:55,74`,
`ScorecardEvaluator.swift:13,73,81,85`, `AnchorGate.swift:42,53,136`, `AnchorRecord.swift:39`.
There are **zero** `TODO`/`FIXME` markers in the app source; ESCALATE is the repo's convention.

This package **must** finally word three of them (`SiteScanContextCapture.swift:261,264,267`) because
it changes their meaning. The other six sets are pre-existing debt, and the honest position is that a
program touching these surfaces should clear them rather than ship a tenth placeholder beside them.
**Budget a brand-voice pass with Kody as a wave line item, not an afterthought.**

Stale documentation to fix while in the file — **all six items below are DONE, landed by Wave 2**
(`docs/design/field-companion/waves/wave-2/`); kept here as the record of what was wrong and what now
reads true:
- ~~`CaptureScreenID.swift`'s header says "51 entries" (it has 71, and 74 after §5.5).~~ **Corrected
  number: the enum carries 75 cases (33 original + 19 Work-flow, incl. `f1Context` + 20 Site Request +
  3 reserved visit-spine ids — `v0Visit`, `c6Voice`, `v4VisitReview`); 72 of them reach a built screen
  today (the three reserved ids stay on `break` in `route(for:)`, exhaustively, with no `default:`).
  Header now reads "75 entries ... 72 of them reach a built screen today." Landed in Wave 2 Task 1
  (`CaptureScreenID.swift`), commit `13cf6a28f`.
- ~~`README.md` credits migration 00258 for scan-project linkage (it is
  `00265_room_scans_project_linkage.sql`; 00258 is `edge_settings_vault`) and lists Share/Widget
  targets that do not exist.~~ Fixed — `README.md:100` now credits `00265_room_scans_project_linkage.sql`,
  and the `CaptureShareExtension/`/`CaptureWidgets/` line is deleted (`generate_project.rb` creates
  exactly four targets). Landed Wave 2 Task 4, commit `86e369f10`.
- ~~`AVFoundationCameraService.swift:6` says *"NOT wired into AppContainer yet"* — `AppContainer.swift:105-110`
  wires it on device.~~ Fixed across three passes as the anchor itself drifted: `86e369f10` first
  corrected the claim but cited `AppContainer.swift:104-110`, which review caught as the Work-service
  wiring block, not the camera one; `5c757d3f2` dropped the line-number citation and named the
  `#if targetEnvironment(simulator)` mechanism instead, but read backward (implied `AVFoundationCameraService`
  lived in the `#if` arm); `621b521d3` named the `#else` arm explicitly. Header now reads "Wired into
  the #else arm of AppContainer.init()'s #if targetEnvironment(simulator) check; the simulator arm
  takes MockCameraService instead."
- ~~`AppContainer.swift:88-91` says the freeze leaves the Phase-2 factories returning mocks — every one
  of the eight returns a real Supabase concrete.~~ Fixed — the comment (now at `:100-102` after Task 1's
  seam edit added lines above it) reads "Phase 2 seams — each flow owns a `<Flow>ServiceFactory.make(deps:)`,
  and all eight now hand back a real Supabase service. Mock mode never reaches this branch; it wires
  the CaptureKitMocks conformers below." Landed Wave 2 Task 1 fix round 1, commit `1ac708735`.
- ~~`SpeechVoiceNoteService.swift:7` claims the raw audio is always kept. **It is the reason two
  discovery reports got this wrong.** Delete the claim in the same commit that makes it true.~~ Already
  false-by-omission before Wave 2 touched it: Wave 1 (Task 8.1) had already replaced the line with
  accurate R114.1 language describing the shared engine tap and non-fatal write failure. Wave 2 Task 4
  verified this by census and made **no edit** — recorded here so the file isn't re-flagged.
- ~~`Capture/Features/Resilience/ResilienceScreens.swift:9` describes `LowLightTorchOverlay` /
  `OfflineQueueBanner` as things *"the C1 viewfinder / session tray drop in"* — which has never been
  true, and stops being false for the banner the moment wave 1 renders it.~~ Fixed — `LowLightTorchOverlay`
  was deleted (Wave 2 Task 3, zero references) and `ResilienceScreens.swift:8-10`'s header now reads
  "Registers ONLY `.photoImport`. OfflineQueueBanner is a composable overlay the C1 viewfinder renders,
  not a registered screen; `.ocr` (R2) and `.syncStatus` (U1) belong to Teams C/F." — the PRIMARY
  wording, since `OfflineQueueBanner` is confirmed rendered at `ViewfinderScreen.swift:43`. Landed Wave
  2 Task 4, commit `86e369f10`.

**Portal-side copy debt, same budget, same wave.**
`apps/designer-portal/src/components/room-file/room-file-copy.ts:1-10` carries an ESCALATE-class
header over **every** Room File string — section titles, the UNVERIFIED stamp, the badge legend, the
empty states — and wave 4 mounts a section that renders `C.sectionTitle` from it (§11.2). Nine Field
files plus this one and the Room File view.

---

## 18 · Rulings register

Full text, options and blast radius in `field-companion-rulings.md`. Summary, with recommended
defaults:

| # | Ruling | Recommended default | Blocks |
|---|---|---|---|
| **FC-R18** | Does Field Companion **own** `field_captures` enrichment, share it with Phase 3, or defer to it? | **Share the ledger** — one queue, one consumer (§9.0) | **Wave 1's migration** (it decides whose body `commit_field_capture` is authored from) and wave 6's whole shape. **Sequence this first, ahead of FC-R8.** |
| **FC-R19** | What is the **phone's** own retention policy for capture media? | Delete a segment on commit receipt, delete on Discard, size-capped sweep | Wave 1's recorder; on-device storage growth |
| **FC-R1** | Does Field stop being camera-first? | **Yes, with the launch table** (§5.3) — and note the Camera control is *already* one tap from Today (§5.2) | Wave 3's shape. Nothing in waves 1–2. |
| **FC-R2** | Two visit kinds + kits, or more? | **Two** (`site`, `sourcing`) + three kits — ⚠ **overrules the designer judge's three-kind recommendation**; both arguments in §2.4 | V0's shape; wave 3's cost |
| **FC-R3** | Naming: *Today* · *a visit* · *Visits* · *unplaced* | **Adopt** | The margin, the spine and the launch screen |
| **FC-R4** | May Field write `margin_notes` / `project_tasks` / `create_client_decision` **directly** from the device? | **Yes** — she is the author, not a third party's parsed claim | Wave 4's whole landing; ±2 weeks |
| **FC-R5** | Merge `project_rooms` + `public.rooms` by trimmed name? | **Yes**, with the never-cross-assign rule | V0's room step; every placement affordance |
| **FC-R6** | What *is* an unplaced note? | A `field_captures` row that waits on Today | Wave 3; the M6 hole |
| **FC-R7** | Punch-item default status | ⚠ **RE-OPEN.** `'draft'` lands in a collapsed *"Drafts · N"* fold, and publishing it re-raises the registered-client failure **and notifies the client** (§6 Flow 5) | Wave 4's punch verb |
| **FC-R8** | Per-designer or per-studio — decided **once** for `field_captures`, `margin_notes`, `project_tasks` and `capture-media` | **Per-designer in v1**; detect-and-degrade honestly | Any RLS work; a platform-admin storage migration |
| **FC-R9** | Background audio (`UIBackgroundModes: [audio]`)? | **No in v1**; honest "recording paused" on lock | Wave 5; App Review |
| **FC-R10** | Ship portal changes unflagged? | **Yes** for a *new* flag, with the wave-4 inert-render check — **and turn the existing `room-file` flag on for the pilot cohort**, plus a line on the designer-scan union | Wave 4's rollout, and whether wave 4 is visible at all |
| **FC-R11** | Recording-consent posture and jurisdiction rule | Kit-defaulted `solo`/`conversation` + affirmation; **lawyer's read before any non-Kody designer** | ⚠ **Wave 1** — that is when third-party audio first leaves a phone. Wave 1 gates the recorder behind the fail-closed flag seam so the exposure has an off-switch |
| **FC-R12** | Does anything ever auto-apply? | **No, at any confidence** — ⚠ but rule the **family**: Phase 3 already auto-fills five `field_captures` columns (§3.7) | Wave 6's design |
| **FC-R13** | Audio retention default | **`90_days`** as the *policy*, per-note override — ⚠ the **column ships defaulted to `keep`** until the purge cron exists; and see FC-R19 for the phone | A column default, a cron, and discovery |
| **FC-R14** | Is TestFlight a dependency? | **Yes** — otherwise the wedge question is unanswerable | Whether wave 1 ends at Kody's device or Leah's |
| **FC-R15** | Where does a punch photo live? | The punch item **back-references the `field_captures` row**; the portal signs `capture-media` — ⚠ **not zero DDL**: it costs a column, a widened payload allow-list and a DEFINER-RPC replacement (§9.5) | Wave 4's punch verb. A project-general media table is still owed |
| **FC-R16** | Can a spoken measurement ever become a measured record? | **No** | Whether anything may touch `room_file_measurements` / `tolerance_class` |
| **FC-R17** | Which migration band? | ⚠ **`00521` is taken and unrecorded.** Repair the reservations doc first (record the svc-media 00521, re-census across `main` + `git log --all` + sibling worktrees), **then reserve `00530–00535`** — pre-agreed 2026-08-24 with both live lanes (Phase 2 ≤ 00529, Phase 3 holds 00514–00520). Symbolic only; addresses claimed at landing and re-confirmed against the ledger + `supabase migration list` before every push (§9.0) | Every migration in the program |

---

*Read-only design pass. The only repository files created are this package, the plan and the
rulings register, all under `docs/design/field-companion/`.*
