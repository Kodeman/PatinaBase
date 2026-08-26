# G1 — Gap analysis and field-moments map

**Program:** Patina Field → a true field companion to the designer portal's project flow
**Date:** 2026-08-24 · **Agent:** G1 (read-only synthesis + spot verification)
**Evidence base:** the seven discovery reports in this directory, cited as `[D1]`–`[D7]`, plus
direct re-verification of every contested claim against the repo (all greps run at `main`, this
checkout). File:line citations are preserved from the discovery reports where I re-confirmed them
and marked **(unverified, from Dn)** where I did not.

| key | report |
|---|---|
| `[D1]` | `01-field-app-map.md` — Patina Field iOS deep map |
| `[D2]` | `02-backend-contract.md` — migrations, RPCs, buckets, edge functions |
| `[D3]` | `03-portal-project-flow.md` — the designer portal's project flow |
| `[D4]` | `04-intent-and-rulings.md` — stated intent + constraint ledger |
| `[D5]` | `05-patina-substrate.md` — shared iOS substrate |
| `[D6]` | `06-external-research.md` — transcription, LLM structuring, competitor UX, iOS affordances |
| `[D7]` | `07-delivery-infra.md` — gates, CI, device passes, analytics, flags |

---

## 0. Three corrections to the evidence base, established before anything else

These matter because two of them would send a design phase in the wrong direction.

### 0.1 Voice audio is NEVER written. `[D1]` is right; `[D2]` and `[D7]` are wrong.

`[D2] §5` says "the raw audio **is** uploaded … its storage path lands in
`field_captures.voice_audio_path`." `[D7]` §"Ready / reusable as-is" says the stack retains "audio
file retained alongside text" and that the older project-memory note is stale. **Both are reading
the file's own header comment, which is a lie.** Verified this session:

```
apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift:7
    "The raw audio file is always kept alongside the text."      ← the false claim
:22  private let mediaDirectory: URL?     ← stored in init, never read
:23  private var audioFilename: String?   ← never assigned anywhere
:107     audioFilename: audioFilename,    ← the only read; always nil
```

Repo-wide greps run this session:
- `grep -rn "audioFilename" apps/mobile/Capture --include="*.swift"` → 14 hits, **zero assignments**
  in `SpeechVoiceNoteService`; every other hit is a consumer or a test fixture.
- `grep -rn "AVAudioFile\|AVAudioRecorder" apps/mobile/Capture --include="*.swift"` → **zero hits.**
  No file-writing audio API exists anywhere in Patina Field.

So: `Specimen.voiceAudioFilename` is always `nil`; `FieldCapturePayload.voice.audioPath` is always
absent; `field_captures.voice_audio_path` is always `NULL` in production; the `audio/mp4`,
`audio/x-m4a`, `audio/aac`, `audio/wav` entries in the `capture-media` allow-list
(`supabase/migrations/00234_capture_media_bucket.sql:16`) and the matching branches of
`LocalCaptureSyncService.mimeType` are **dead code that has never executed**.

**Second-order consequence, and the sharper finding:** the mid-scan voice path has no audio
fallback for a failed transcription. `SiteScanContextCapture.stopVoice` (`:129`) gates on
`!transcript.isEmpty || result.audioFilename != nil`. With `audioFilename` permanently `nil`, a
voice note that transcribes to nothing — a noisy job site, a saw running, a mumbled aside — is
**silently discarded** with the toast `"Nothing recorded"`. The designer spoke; nothing was kept;
nothing can be recovered. This directly violates the house honesty law (`[D4]` §6, PRD FR-10:
"no spinner-forever, no silent loss").

### 0.2 iOS *does* write `receiving_inspections.photo_asset_ids`. `[D3]`'s open question #2 is answered: **yes.**

`apps/mobile/Capture/Capture/Features/Receiving/SupabaseReceivingService.swift:115` passes
`photoAssetIDs: submission.photoRefs` into `InspectionInsert`, whose `CodingKeys` map it to
`photo_asset_ids` (`:243,:250`). The web drawer hard-codes `[]`
(`log-inspection-drawer.tsx:151`, `[D3]` §Stage 7) and no portal surface renders the column.
**Receiving photos taken on a loading dock are already landing in production rows that no web
surface will ever display.** That is a live data-visibility defect today, not a future gap.

### 0.3 `routeAll` *is* called by one UI — but not the one that matters.

`[D1]` says the bulk route contract "exists and is tested but no UI calls it." Verified: the V2
cull deck does call it (`V2CullDeckScreen.swift:238`, `sync.routeAll(ids, to: .inbox)`), i.e. bulk
*discard-to-inbox* works. What does not exist is bulk **project routing** — the V1 tray's
"Route all N" footer still opens S1 for `items.first` only
(`V1SessionTrayScreen.swift:126`). The finding stands, narrowed: you can bulk-park, you cannot
bulk-place.

---

## 1. "True field companion" as measurable outcomes

Nine outcomes. Each is falsifiable, each has a current-state score with evidence, and each maps to
a designer moment in §2. Targets are proposals for Kody to rule on, not rulings.

| # | Outcome (target) | Today | Evidence |
|---|---|---|---|
| **O1** | **A photo + spoken note lands on the right project *and* room in ≤3 taps and ≤10 s, from a cold app, offline.** | **FAIL.** ~7 taps + one press-and-hold, and the record still has **no project**. Attaching one costs ~6 more taps *and a network round-trip*, and re-routes one record. Offline, the project/room pickers degrade to a warning banner — the offline capture is exactly the one that cannot be placed. | `[D1]` §8 tap table; `S1AssignVenueScreen` is reachable only from `V1SessionTrayScreen.swift:126`, `S2CreateProjectScreen.swift:172`, and the deep-link harness (verified: `grep -rn "assignVenue"` returns exactly those three call sites plus the registry/enum definitions) |
| **O2** | **A spoken note survives a bad transcription.** Audio is always retained; the transcript is a derived artifact that can be re-derived. | **FAIL.** No audio is ever written (§0.1). A failed transcription = permanent loss. | `SpeechVoiceNoteService.swift:22-23,107`; `SiteScanContextCapture.swift:129` |
| **O3** | **A voice note with no photo can be started from the camera surface in one gesture.** | **FAIL.** Every enrichment sheet is keyed to a `Specimen` UUID — `.voice(UUID)`, `.measure(UUID)`, `.ocr(UUID)`, `.code(UUID)` (`CaptureNavigation.swift:46-57`). A specimen must exist first. The only sheet-free voice entry in the app is *inside a running site scan*. | `[D1]` §8 pt 3; verified against `CaptureSheet` enum |
| **O4** | **Everything captured on a visit is visible in the portal within one refresh, in the document the designer is standing in.** | **FAIL.** `field_captures` has exactly **one** portal reader — `useScanContextCaptures` (`packages/supabase/src/hooks/use-room-files.ts:378`), which filters by scan id and renders only inside the Room File, behind the fail-closed `room-file` flag. A capture parked at `status='inbox'` is invisible forever. | `[D3]` §G1; verified: `grep -rn "field_captures" apps/designer-portal/src packages/supabase/src` excluding `database.types.ts` returns only `use-room-files.ts` |
| **O5** | **Field photos and audio are viewable/playable in the portal.** | **FAIL.** `grep -rn "capture-media" apps/ packages/` returns **nothing**. No web code has ever signed a URL from that bucket. `CaptureContextSection` renders a thumbnail only if the row already carries an `http(s)` URL. | `[D3]` §G2; verified this session |
| **O6** | **A designer's site-visit output is a shareable site report without retyping.** | **FAIL.** No such artifact exists on either side. There is no project-general photo table anywhere in the schema; the two closure checklist lines about photographs (`closure-derivation.ts:22-29`) are attestation checkboxes with no store. | `[D3]` §Stage 9, §G5 |
| **O7** | **A market find becomes a Library product AND an FF&E candidate with vendor/SKU/price/lead-time captured.** | **PARTIAL.** Library: ✅ (`commit_field_capture` library branch mints `products`). Vendor/SKU/price: ✅ via N1 tag OCR into `payload.tag`. **Lead time: MISSING** — no field on the payload, the table, or the Specimen. FF&E: the S1 "FF&E schedule" menu → `place_product_in_project` works, but is behind the orphaned S1. And `commit_field_capture` also writes `project_products`, which **no live portal surface reads**. | `[D1]` §5a, §3; `[D3]` §G8; verified `00235:249-252` writes `project_products`; `hooks/use-library-tabs.ts:68` is its only portal reader and is itself unreferenced |
| **O8** | **A punch item / RFI / site condition found on a walk becomes a real coordination item with a photo attached.** | **FAIL, twice over.** Field **cannot write** `project_tasks` (0 refs), `client_decisions` (read-only: `SupabaseDecisionsReadService` only), or `margin_notes` (0 refs) — verified by enumerating every `.from("…")` in the app (§2.0 below). And on the web side the coordination composer has **no attachment affordance at all**. | verified `grep -rho 'from("[a-z_]*")' apps/mobile/Capture`; `[D3]` §Stage 8 |
| **O9** | **The designer is told, on the capture surface, when she is offline and how much is queued — and the queue drains itself the moment signal returns.** | **FAIL.** `OfflineQueueBanner` is dead code (referenced only inside its own `#Preview`). `grep -rn "NWPathMonitor" apps/mobile/Capture` → **zero hits** — there is no connectivity observer anywhere in the app; drains fire only on enqueue, on launch reconciliation, and on manual "Retry all." | `[D1]` §DEAD, §Offline gaps; verified this session |

**Score: 0 of 9 outcomes pass; 1 of 9 is partial.** The transactional plumbing underneath is
genuinely excellent (§4) — every failure above is a *contextual* or *landing-place* failure, not a
reliability one.

---

## 2. Field moments map

### 2.0 The four structural facts that determine almost every cell

Everything in the grids below reduces to these:

1. **Field can read a lot and write almost nothing.** Complete enumeration of PostgREST table
   access in the app (`grep -rho 'from("[a-z_]*")' apps/mobile/Capture --include="*.swift"`, run
   this session):
   `projects`(5) · `purchase_orders`(3) · `rooms`(2) · `room_scans`(2) · `receiving_inspections`(2) ·
   `project_rooms`(2) · `profiles`(2) · `leads`(2) · `comms_messages`(2) · `client_decisions`(2) ·
   `user_roles`(1) · `site_requests`(1) · `site_request_items`(1) · `site_request_events`(1) ·
   `site_binder_entries`(1) · `room_scan_images`(1) · `project_phases`(1) ·
   `project_payment_milestones`(1) · `project_parties`(1) · `project_ffe_specs`(1) ·
   `project_ffe_items`(1) · `organization_members`(1) · `damage_claims`(1) · `comms_threads`(1) ·
   `client_decision_options`(1).
   **Absent entirely: `project_tasks`, `margin_notes`, `delivery_events`, `discovery`.** Field
   cannot create a task, write a marginal note, log a delivery event, or touch the brief.
2. **Only one capture shape has a project column that survives.** `commit_field_capture`'s
   **library** branch persists `project_id`/`project_room_id`/`shelf`
   (`00235:255-263`); the **inbox** branch sets `status='inbox'` and nothing else
   (`00235:205-209`, re-read this session). So *everything routed to Inbox from the field is
   weakly attached by construction* — its only durable association is the flat dotted provenance
   keys.
3. **The exact provenance key set** (answers `[D3]` open question #1 definitively —
   `CaptureKit/CaptureKit/SiteScan/ContextCaptureProvenance.swift:56-63`):
   `siteScanContext.source` · `.scanId` · `.projectId` (= `projects.id`) · `.projectRoomId`
   (**= `public.rooms.id`, NOT `project_rooms.id`** — the file says so at `:21` and `:30-32`) ·
   `.cameraPose` · `.capturedAt`. Flat dotted top-level keys, matching the portal filter
   `.contains('provenance', {'siteScanContext.scanId': scanId})` at `use-room-files.ts:378`.
4. **Three "room" concepts, and the field↔portal seam crosses all three.** `rooms` (what site scans
   attach to, what F1 picks, what `siteScanContext.projectRoomId` carries) · `project_rooms` (FF&E
   scope rooms, what S1 picks, what `field_captures.project_room_id` FKs to) · `room_scans` (the
   LiDAR row, `/room/[id]`). `[D1]` §8 pt 6 and `[D3]` §1 both flag this independently. **No
   unified "put this capture in this room" affordance is possible without ruling which one wins.**

### 2.1 Capture type × portal destination — the consolidated grid

Legend: **✅ EXISTS** end-to-end · **⚠ PARTIAL** (one side built, or built but unreachable/unread) ·
**❌ MISSING**. "Field" = can Patina Field produce it. "Portal" = does any portal surface receive
and render it.

| Capture type | Field can capture? | Lands where server-side | Portal shows it? | Grade | Evidence |
|---|---|---|---|---|---|
| **Photo (single)** | ✅ C1 photo mode | `capture-media/<uid>/<clientToken>/`, `field_captures.photos[]` | ❌ no web code touches `capture-media` | ⚠ | `[D1]` §5a; `[D3]` §G2 |
| **Burst / multi-shot** | ✅ C4 hold-shutter → one specimen | same, `photos[]` with order | ❌ | ⚠ | `ViewfinderControls.ViewfinderMultiShotOverlay` |
| **Annotated / marked-up photo** | ❌ no PencilKit, no markup canvas (`grep "PencilKit\|PKCanvas"` → 0 hits) | — | — | ❌ | verified this session |
| **Video clip** | ❌ no `AVCaptureMovieFileOutput` anywhere (verified: 0 hits) | — | — | ❌ | verified; also `[D4]` §4 — walkthrough video is a P2–P4 evidence-gated program |
| **LiDAR room scan** | ✅ F1–F4, 11-artifact bundle, background upload, `confirm-scan-bundle` | `room_scans` + `room_files` + `room_scan_images` | ⚠ `/rooms`, `/room/[id]` ✅; Room File behind fail-closed `room-file`; **nothing on `/doc/[id]`** — `RoomFilesSection` is unmounted dead code | ⚠ | `[D1]` §5b; `[D3]` §G3, §G10 |
| **Measurement (typed anchor)** | ✅ in-scan anchors; N3 AR/manual measure per specimen | `scan_anchors`; `payload.measurements` | ⚠ published set renders in Room File only; a loose dimension has no home but Discovery free-text `site_notes` | ⚠ | `[D2]` §1.3; `[D3]` §5 |
| **Voice note → transcript** | ⚠ transcript only, **no audio ever** (§0.1); requires a specimen to exist first, except in-scan | `voice_transcript` + duplicated into `notes` with `ProvenanceSource.voice` | ⚠ renders **only** in the Room File capture-context list, for scan-pinned rows only | ⚠ | §0.1; `VoiceNoteSheet.swift:200-212` |
| **Voice note → audio** | ❌ never written | column exists, always NULL | ❌ no playback anywhere | ❌ | §0.1 |
| **Voice note → structured items (task/decision/dimension)** | ❌ | no extraction path exists; `apply_field_effect` is SMS-only, party-anchored, service-role-only | ❌ | ❌ | `[D2]` §9.2; `[D3]` §G4; `00282:225-470`, `REVOKE … FROM PUBLIC, anon, authenticated` at `:472` |
| **Text note** | ✅ typed into the specimen `note` field | `field_captures.notes` | ⚠ same single reader | ⚠ | `[D1]` §5c |
| **Product / specimen spec (vendor, SKU, price)** | ✅ N1 tag OCR + N2 barcode + N5 guess | `products` (layer=personal, `capture_source='field_capture'`) + `field_captures` | ✅ appears on the Library shelf — **but provenance is invisible**: `capture_source`/`capture_provenance` are never read by the portal | ✅/⚠ | `[D1]` §5a; `[D3]` §Stage 4 |
| **Lead time** | ❌ no field on `FieldCapturePayload`, `Specimen`, or `field_captures` | — | — | ❌ | `[D1]` §3 payload key list; `[D2]` §4 |
| **Finish / material sample** | ⚠ captured only as a photo + free-text `materials[]`/`finish` on a specimen; no sample-as-first-class-object | `field_captures.materials/colors/finish` | ⚠ Library card only | ⚠ | `[D2]` §1.1 |
| **Client preference / decision spoken on site** | ❌ decisions are **read-only** in Field (`SupabaseDecisionsReadService` is the only decisions code) | — | — | ❌ | verified: `grep "client_decisions"` returns read service + protocol docs only |
| **Task / punch item** | ❌ Field never touches `project_tasks`; punch = `client_decisions` which Field cannot write | — | ⚠ web composer exists; **carries no photo** | ❌ | §2.0 pt 1; `[D3]` §Stage 8 |
| **Party / contact captured on site** | ❌ Field only *reads* `project_parties` (one call site, inside the Site Request service) | — | ⚠ `useAddProjectParty` exists on web, behind fail-closed `call-sheet` | ❌ | verified: `SupabaseSiteRequestService.swift:44` is the sole reference |
| **Site condition / issue** | ⚠ only as an Inbox photo + note with no typed meaning | `field_captures` inbox | ❌ | ❌ | — |
| **Delivery / receiving status + damage photos** | ✅ G1–G3: writes `receiving_inspections` (**including `photo_asset_ids`**, §0.2), `damage_claims`, and two `purchase_orders` status updates; photos go through the **NestJS media service**, not `capture-media` | `receiving_inspections`, `damage_claims` | ⚠ inspection row ✅ (Desk `awaiting_inspection` / `damage_claim` need kinds); **photos render nowhere** | ⚠ | §0.2; `[D1]` §5e; `[D3]` §Stage 7 |
| **Third-party evidence (Site Request)** | ✅ SR01–SR20, full guest loop | `site_deliverables` → `site_binder_entries` | ✅ margin handoff item with approve/redo/nudge/close | ✅ | `[D2]` §1.5; `[D3]` §4 row 4 |

**Destination coverage summary — of the eleven portal destinations named in the brief:**

| Destination | Reachable from Field today? |
|---|---|
| Room File | ⚠ indirectly (a scan produces it; captures pin to it by provenance; flag-gated) |
| Project room | ⚠ library-path captures only, via the orphaned S1 (`project_rooms`); scans use `public.rooms` |
| Brief (Discovery) | ❌ Field never touches `discovery` |
| FF&E line | ⚠ via S1's FF&E menu → `place_product_in_project`; unreachable in the fast path |
| Library product | ✅ |
| Task | ❌ |
| Decision | ❌ |
| Note / thread | ⚠ `comms_messages` send works (M2); `margin_notes` — the actual studio note surface — ❌ |
| Call Sheet party | ❌ |
| Receiving inspection | ✅ row; ❌ photos |
| Desk triage | ❌ nothing field-capture-shaped reaches the Desk (`document_state` has no field column; `NeedKind` has no field member) |

**5 of 11 destinations are unreachable from Patina Field at all. 4 more are partial.**

### 2.2 The nine moments

Each moment: what she does, what she can capture today, where it lands, and the specific friction.

---

#### M1 · Initial site visit / measure — "retire the tape measure"

*This is the moment the product was designed for, and it is the strongest cell in the matrix.*

| Cell | Grade | Friction |
|---|---|---|
| LiDAR scan → Room File | ✅ **EXISTS, and it is excellent** | F1 project picker (`ownableProjects()` mirrors the `room_scans_guard_routing` guard exactly, so it can never offer a project that would fail at upload) → F2 live coach + anchors → F3 review → F4 upload. Survives app kill via background `URLSession`; the durable record is keyed by a container-independent bundle path so a relaunch reuses the same `scanID` rather than orphaning a `processing` row. `[D1]` §4 |
| Typed anchor measurement | ✅ EXISTS | Two taps + a typed value. `<3` anchors ⇒ the bundle is stamped `UNVERIFIED` everywhere downstream — a soft gate, per R108.5. |
| Mid-scan detail photo | ✅ captures → ❌ **lands weakly** | Pinned by provenance only; the inbox branch persists no project columns (§2.0 pt 2). Portal shows it only inside the flag-gated Room File. |
| Mid-scan voice note | ⚠ → ❌ | Transcript-only; **a failed transcription is silently discarded** (§0.1). |
| Non-LiDAR device | ⚠ | `SiteScanContextScreen` — photos + voice → Inbox, "never labeled a scan" (R108.2). Carries **3 ESCALATE-class placeholder strings** (`SiteScanContextCapture.swift:261,264,267`) and uses accessibility id `screen.F1.context`, which is **not a `CaptureScreenID` case** — so it is invisible to `capture-shots.sh` and the `-CaptureScreen` harness and has never appeared in a screenshot sweep. |
| The scan appears in the Document | ❌ **MISSING** | `room_scans.project_id` is writable by Field (00265) and `useProjectRoomScans` exists (`use-room-scans.ts:406`) — but its only consumer, `RoomFilesSection`, is unmounted. Both "attach the scan" surfaces on `/doc/[id]` — the letterhead instrument (`letterhead-instruments.tsx:87-95`) and Discovery's `SiteScanEditor` (`editors.tsx:295-325`) — filter to **client-owned** scans. *A designer literally cannot attach her own site scan to her own project's document.* |
| Site notes / constraints prose | ❌ from Field | `discovery.site_notes` is a web textarea; Field has no path to it. |
| Offline | ✅ strong for the scan, ⚠ for context | Bundle bytes persist, upload resumes, receipt gates completion. But no connectivity observer exists — the resume is manual or launch-triggered. |

**Verdict:** the *instrument* is world-class and the *filing cabinet is missing*. The single
highest-leverage portal change in the program is mounting designer-owned scans on `/doc/[id]`.

---

#### M2 · Client walk-through / meeting

| Cell | Grade | Friction |
|---|---|---|
| Photo of a condition the client points at | ⚠ | Captures fine; lands in an inbox nothing reads. |
| "She said she hates the sconce" → a decision | ❌ **MISSING** | Field's decisions surface is read-only by design (selection is the client app's write path). |
| "She approved the sofa" → a selection resolve | ❌ | Same. |
| Voice note of the whole conversation | ⚠ → ❌ | Requires a specimen first (`.voice(UUID)`); no walk-and-talk mode; no audio kept; 1-minute `SFSpeechRecognizer` request cap makes a long conversation infeasible today anyway (`[D6]` §A1 — ~1 min/request, ~1,000 requests/device/hour). |
| Client preference → the brief | ❌ | Field never touches `discovery`. |
| Anything reaching the margin | ❌ | Field never writes `margin_notes` — the exact surface built for "≤5 seconds — one tap, type, save" (`margin-rail.tsx:386-421`). |

**Verdict:** the richest moment in a designer's week produces **zero structured output**. Everything
said in a walk-through must be re-typed at a desk.

---

#### M3 · Market / showroom / sourcing trip

*The founding use case. Strongest capture-type coverage, weakest routing.*

| Cell | Grade | Friction |
|---|---|---|
| Photo + tag OCR + barcode → Library product | ✅ EXISTS | N1 Vision OCR → vendor/SKU/price; N2 DataScanner. **N2's catalog lookup is a 2-row hardcoded dictionary with no network** (`DataScannerCodeService.swift:28-45`). |
| Dimensions | ✅ N3 AR measure or manual |
| Smart guess | ⚠ **ships a fiction** | `ViewfinderModel.applySmartGuess:409-419` (re-read this session) hardcodes **every** photo capture as `category = "seating"` @0.72 and `material = "Oak / bouclé"` @0.6, stamped `ProvenanceSource.smartGuess`. These ride `payload.guesses` + `payload.provenance` into `products.capture_provenance`. They also make `hasUnconfirmedGuess` always true, so **S3 recommends Inbox for literally every capture**. The real `HeuristicSmartGuessService` (real `VNClassifyImageRequest`, Simulator-safe) only runs behind the N5 sheet, which the photo path never opens. |
| "Is this already in my library?" | ⚠ device-local only | `LibrarySearchScreen` → `store.search(SpecimenQuery)`. No server-side library query exists, so at a market the dedupe promise covers only what *this phone* captured. |
| Route N specimens to a project at the end of the day | ❌ | "Route all N" routes one (§0.3). A market day producing 30 specimens means 30 × ~6 taps. |
| Lead time | ❌ | No field anywhere in the chain. |
| Provenance legible six months later | ❌ | `products.capture_source` never rendered — a market find is indistinguishable from a pasted URL. |
| Offline | ⚠ | Capture and enqueue: fully offline-safe. Routing: the S1 pickers need `projectDetail(id:)`; offline they degrade to a banner and the FF&E menu disables. |

---

#### M4 · Trade walk & punch list

| Cell | Grade | Friction |
|---|---|---|
| Punch item found → `client_decisions(coordination_kind='punch')` | ❌ **MISSING both ways** | Field cannot write decisions; the web composer has **no attachment field at all** (`grep photo\|image\|attach\|upload` across `item-composer.tsx`, `open-item-sheet.tsx`, `item-resolve/resolve-punch.tsx` → nothing, `[D3]` §Stage 8). |
| Photo of the defect | ⚠ captures → ❌ nowhere to attach it | The only existing seam is `client_decision_options.image_url`. |
| RFI raised on the spot | ❌ | `apply_field_effect`'s `flag_blocker` exists — but it is `SECURITY DEFINER`, `REVOKE ALL … FROM PUBLIC, anon, authenticated` (`00282:472`), and anchored on `p_party_id`. **A designer is not a `project_parties` row**, so Leah's own phone can never call it. |
| Asking a sub to go measure something | ✅ EXISTS | Site Requests SR01–SR04 → SMS → guest checklist. This is the **one complete designer-initiated field loop**, and it lives on the phone only — the portal has the whole *response* half and **no create path**. |
| Site condition with no owner yet | ❌ | Nothing typed; a photo in an unread inbox. |

**Verdict:** the moment with the clearest structural target (`apply_field_effect`'s six-verb
vocabulary is exactly right) is blocked by an authority-anchor mismatch, not by missing design.

---

#### M5 · Delivery / receiving / install day

| Cell | Grade | Friction |
|---|---|---|
| Inspection outcome + notes | ✅ EXISTS | G2/G3 → `receiving_inspections` + `damage_claims` + PO status. Rises on the Desk as `awaiting_inspection` / `damage_claim`. |
| Damage photos | ⚠ **written, never rendered** (§0.2) | And the photo source is **PhotosPicker, not the live camera** — on a loading dock that is the wrong instrument. Receiving is also the *only* Field flow using the NestJS media service (`ReceivingMediaUploadClient`, `https://media.patina.cloud`) rather than `capture-media`, so unifying it is not free. |
| Delivery confirmation | ⚠ | `confirm_delivery` exists in `apply_field_effect` — again party-anchored, reachable by a texting receiver, not by the designer standing there. Field never touches `delivery_events`. |
| Punch found at install | ❌ | See M4. |
| Install-day photos for the portfolio | ❌ | Closure checklist lines `photography` / `photos` are checkboxes with no store; **there is no project-general photo table in the schema at all**. |

---

#### M6 · On-the-go thought / phone-call aftermath

*The purest test of "companion," and the weakest cell in the entire matrix.*

| Cell | Grade | Friction |
|---|---|---|
| Open app → speak → done | ❌ **MISSING** | No voice mode on C1. `.voice(UUID)` needs a specimen. She must shoot a throwaway photo to open the sheet. |
| One-gesture entry from a locked phone | ❌ | O4 *teaches* the Action Button, but `CaptureShareExtension/` and `CaptureWidgets/` are **empty directories with no target-generation code** in `generate_project.rb` (`[D1]` banner; `[D7]` §4). Zero `import AppIntents` in the tree. `field://capture` is the only external entry. |
| Note lands against the right project | ❌ | Only via visit routing memory, itself only populated by a prior S1 pass — and the 4-hour inactivity window (`CaptureSessionContextPolicy`) means a thought on the drive home has already lost it. |
| Note reaches the margin | ❌ | Field never writes `margin_notes`. |
| Note becomes a task | ❌ | Field never writes `project_tasks`. |
| Recording continues if she pockets the phone | ❌ | **No `UIBackgroundModes` key of any kind** is set (`[D7]` §8) — `AVAudioSession(.record)` dies the moment the app backgrounds or the screen locks. |

---

#### M7 · Vendor visit

Substantially M3 with a relationship attached. Additional gaps: no vendor entity is captured
(`vendor_name`/`vendor_id` are free text on the payload, `[D2]` §4); no "met with X today" record;
`project_parties` is read-only from Field; no follow-up task can be created (§2.0 pt 1).

---

#### M8 · Photo of a sample / finish

| Cell | Grade | Friction |
|---|---|---|
| Shoot the swatch | ✅ | |
| Colour/material extracted | ⚠ | Real extraction exists (`HeuristicSmartGuessService`, OCR-derived material/colour) but only behind the N5 sheet; the fast path stamps `"Oak / bouclé"` on everything (M3). |
| Lands on a mood board | ❌ **MISSING** | Board items carry `project_room_id` (a real anchor is available), and `board-add-rail.tsx:817-842` accepts browser file upload — but there is **no `boards` destination in `commit_field_capture`** and no mobile ingestion path. `[D6]` §C12 flags Houzz Pro's mobile-view/desktop-edit split as a *cautionary* pattern; Patina should rule deliberately rather than default into it. |
| Lands on an FF&E line as a finish | ❌ | Only via the orphaned S1 FF&E menu, and only as a whole product, not a finish. |

---

#### M9 · Reading a plan on site

| Cell | Grade | Friction |
|---|---|---|
| Open the current drawing set on the phone | ❌ **MISSING** | Field has no plan/document viewer. `/doc/[id]/plans` and `/room/[id]/file` are web routes; the Room File is behind a fail-closed flag; nothing in `/doc/[id]` even links forward to it (`[D3]` §G10). |
| See the FF&E schedule for this room | ⚠ | P2 shows FF&E items read-only. |
| Show a spec to a trade, no login | ⚠ adjacent | `field_link_tokens` + `/field/[token]` exist (00283) for SMS coordination, and Site Requests use a deliberately separate `sr_` token namespace. Neither is "here is the current spec, scan this." `[D6]` §C10 names Programa's QR-to-spec pattern as the direct analogue. |
| Mark up the plan | ❌ | No markup anywhere (verified: no PencilKit). |

---

## 3. Top 12 friction points, ranked by designer impact

Ranked by *how often it costs Leah real work*, not by implementation cost.

| # | Friction | Why it ranks here | Evidence |
|---|---|---|---|
| **1** | **The capture fast path has no project picker.** S1 — the only screen that sets `VenueStamp.projectId`/`projectRoomId`/FF&E placement — is unreachable from C3 and C5. C5's Save goes straight to S3 (`SpecimenSheetScreen.swift:157`); C3's goes to S3 or routes directly (`ViewfinderModel.swift:280-302`). | Every single capture, in every moment, is born unattached. This is the root cause of most of the "lands in the wrong place" complaints the program exists to fix. | verified: `grep -rn "assignVenue"` → 3 presenters, none in the capture path |
| **2** | **Nothing a designer captures is visible in the portal.** One reader, scan-scoped, flag-gated, plus a bucket the web has never signed. | The loop simply does not close. Everything else is upstream of this. | `use-room-files.ts:378` is the only `field_captures` reader; `grep "capture-media" apps/ packages/` → 0 |
| **3** | **Voice audio is never written — a failed transcription is silent, permanent loss.** | Directly contradicts the honesty law the house has ruled four separate ways (R108.5, R110/FR-10, R113, R114.1). The entire downstream chain — `VoiceNoteResult.audioFilename`, `payload.voice.audioPath`, the m4a/aac MIME branches, `00235`'s reader, the 00234 bucket allow-list — **is already built and waiting**. Only the writer is missing. | §0.1 |
| **4** | **A voice note cannot become work.** No path from `voice_transcript` to `margin_notes`, `project_tasks`, or `client_decisions`. `apply_field_effect` — the existing "signal → structure" choke point with exactly the right six-verb vocabulary — is party-anchored and service-role-only. | This is the whole "field information lands in the right place" premise. | `[D3]` §G4; `00282:225-470,472` |
| **5** | **Voice requires a photo first; there is no walk-and-talk mode.** Plus no background audio entitlement, plus `SFSpeechRecognizer`'s ~1-min/request cap. | Kills M6 entirely and cripples M2. Note `ContextCaptureService` already proves a media-less specimen commits fine — the pattern exists. | `CaptureNavigation.swift:46-57`; `[D7]` §8; `[D6]` §A1 |
| **6** | **Bulk routing does not exist at the UI layer.** "Route all N" routes one; the tested `routeAll` contract is wired only to cull-to-inbox. | A market day is N specimens. The tray is the natural end-of-day ritual and it does one record at a time. | §0.3 |
| **7** | **`applySmartGuess` ships a hardcoded lie into production data.** Every photo → `seating` @0.72, `Oak / bouclé` @0.6, `ProvenanceSource.smartGuess`, propagated into `products.capture_provenance`. Also makes S3 recommend Inbox for every capture. | Corrupts the provenance record — the thing the brand voice is built on — and mis-steers the destination default that causes friction #1's downstream damage. Fix is one line: call the real service that already exists. | `ViewfinderModel.swift:409-419`, re-read this session |
| **8** | **A designer's own site scan has no home in her own document.** Both attach points filter to client-owned scans; `RoomFilesSection` is unmounted; Room File is two undiscoverable hops behind a fail-closed flag. | This is the P1 gate promise ("Leah retires the tape measure") failing at the last inch — the drawing exists, she just can't find it from the project. | `letterhead-instruments.tsx:87-95`; `use-room-scans.ts:185-214,406`; `[D3]` §G3, §G10 |
| **9** | **Photos cannot attach to the things that most need them:** punch items, RFIs, receiving inspections (written but unrendered, §0.2), project close-out. **There is no project-general photo table in the schema.** | A punch item without a photo is a punch item nobody can act on. This is the one gap that needs a *schema decision* before any wiring. | `[D3]` §G5; §0.2 |
| **10** | **Nothing tells her she is offline, and nothing drains when signal returns.** `OfflineQueueBanner` is dead code; zero `NWPathMonitor` in the app. | The transactional layer is excellent and completely invisible. She has to navigate to U1 to learn her day's work is queued. | `[D1]` §DEAD; verified `grep NWPathMonitor` → 0 |
| **11** | **No inbox triage anywhere, on either surface.** `field_captures.status='inbox'` is the semantic twin of `sms_messages.needs_review` — which has a full Desk card with Apply/Dismiss. The capture equivalent has no reader. | Whatever the fast path fails to attach has nowhere to go to get fixed later. This is the safety net for friction #1, and it does not exist. | `[D3]` §7, §G1 |
| **12** | **Patina Field has never sent a single analytics event, and has no feature-flag mechanism.** 0 rows for `surface='field-ios'` in 180 days (live-verified) because `Secrets.swift` ships `postHogAPIKey = nil`; `CaptureAnalytics` has no `isFeatureEnabled` at all. | Nothing this program ships can be measured or staged-rolled. It is the cheapest fix on the list (one key + one protocol method) and it gates every claim of improvement. | `[D7]` §6, §7 |

**Honourable mentions** (real, lower designer impact): ~9 files of ESCALATE-class placeholder copy,
all on the SiteScan coach/anchor/context surfaces (`[D1]` §6) — user-facing and never finally
worded; U2 library search is device-local only; N2's catalog lookup is a 2-row dictionary; no
Live-Activity widget target exists so the controller cannot render; `screen.F1.context` is invisible
to the screenshot harness; `project_products` receives routed captures that nothing reads.

---

## 4. What already works and must NOT be broken

Ten things. Several are unusually well-built and represent real, hard-won production lessons.

1. **The site-scan rig.** One shared `ARWorldTrackingConfiguration` `ARSession` handed to RoomPlan
   via `RoomCaptureView(frame:arSession:)` — "four streams, one clock." Four recorders
   (`FieldSceneMeshRecorder` serializes `mesh.ply` once at finish *on the calling thread* because
   ARKit recycles mesh buffers; `FieldDepthRecorder`; `FieldKeyframeRecorder` at ≥0.5 m/≥15°,
   sharpness-gated; `FieldPosedPhotoService`). Parametric coverage coach, not Metal mesh painting.
   `[D1]` §4.
2. **The scan upload chain.** Durable `ScanUploadRecord` keyed by a **container-independent** bundle
   relative path (so a relaunch reuses the same `scanID` instead of orphaning a `processing`
   `room_scans` row); background `URLSession` with `sessionSendsLaunchEvents` + the
   `CaptureAppDelegate` completion seam; orphan-completion replay; per-artifact
   `merge_scan_artifact_sha256`; and **`ScanConfirmPolicy`** — only an *unreachable* confirm
   (transport/5xx) falls back to `mark_scan_upload_complete`; a 4xx marks the record `.rejected`
   rather than marking a broken bundle ready. Do not simplify this.
3. **The capture outbox's idempotency and receipt discipline.** `clientToken` is device-stable and
   never regenerated (== `client_capture_id`); media upload uses upsert so replay is free;
   `commit_field_capture` is idempotent on `p_client_capture_id`;
   `CaptureTransferPhase.complete` is **impossible** without a non-empty `receiptID`; the failure
   taxonomy separates `isDeferrable` (no retry penalty) from `isRejected` (review-gated, excluded
   from bulk drain). `[D1]` §3.
4. **Owner scoping / multi-account safety.** `CaptureOwnerIdentity` normalization, owner-scoped
   overloads on every store query, legacy `nil`-owner rows quarantined and never claimed,
   `CaptureOwnerProjectionPolicy` fail-closed in real mode, per-owner serialized drains that
   revalidate `activeOwner` at every await boundary, and per-user active-workspace persistence with
   the legacy global keys deleted on every init. 935 lines of `CaptureLifecycleTests` guard this.
5. **The library safe-harbor.** `commit_field_capture`'s `EXCEPTION WHEN OTHERS` parks any
   library-path failure back into the inbox with the error in `raw_payload.conflict`
   (`00235:273-290`) — sync always converges, never hard-fails the client. And the device trusts
   **server truth only** (`applyCommitResult`).
6. **All eight Work flows are real.** P/L/D/M/G/Q/F/SR each construct a Supabase concrete;
   `AppContainer.swift:88-91`'s "the freeze leaves these returning the mock" comment is stale.
   Decisions being **read-only** is a deliberate design (selection is the client app's write path),
   not an omission — do not "fix" it without a ruling.
7. **The SMS rail.** `project_parties` + `sms_conversations`/`sms_messages` + `apply_field_effect`'s
   six-verb vocabulary + `review_sms_message` + the `field-daily` 13:00 UTC digest with its
   numbered-menu `state_context` (so "DONE 2" resolves deterministically) + `SmsReviewCard` on the
   Desk. This is the **only complete field→structure loop in the product** and the design template
   any "capture needs your hand" card should copy. 10DLC is live.
8. **The Site Request guest loop.** `sr_`-namespaced opaque tokens deliberately distinct from the
   legacy 64-hex `/field/*` coordination family; `SiteRequestOutboxRecord` with an explicit
   `canTransition` state machine, SHA-256 checksums, capped exponential backoff, and
   `SiteRequestFailureClassifier` terminal classification; signed capabilities never enter durable
   encoding. The most rigorous delivery outbox in the codebase.
9. **The scan/media privacy posture.** `capture-media` is **private**, 500 MB, and all four object
   policies gate on `auth.uid()::text = (storage.foldername(name))[1]` — strictly owner-scoped,
   no studio co-member storage access even when the row is inbox-shared
   (`00234:44,52,60,68`, re-read this session). `CaptureMediaPath.folder` lowercases **both**
   segments to match `auth.uid()::text` — one place builds that string; do not build it twice.
   `room-scans` URLs are "public-shaped path-carriers only." Site Request unapproved evidence purges
   at 90 days.
10. **The frozen wire contracts.** `FieldCapturePayload`'s camelCase keys **are** the contract for
    `00235`'s `->>`/`#>>` readers (`schemaVersion = 1`), guarded key-by-key by
    `FieldCapturePayloadTests`. The bucket-MIME drift guard in `UploadStateTests` is what caught the
    M2 Storage 400. `ContextCaptureProvenance`'s flat dotted keys are matched exactly by the
    portal's `.contains()` filter. Breaking any of these breaks production silently.

**Portal side, additionally:** the Desk's whole-desk error state (I64 — a 0-row `document_state`
read with an invalid session throws and replaces everything below the greeting, deliberately
including the field populations, so you never get a half-desk); the `margin_items` view's
raised/settled discipline; Room View's Plan·Orbit·Walk mode vocabulary.

---

## 5. Guardrails any design must satisfy

Drawn from `[D4]`'s constraint ledger, `[D2]`'s schema findings, `AGENTS.md`/`CLAUDE.md`, and the
brand-voice skill. Each is stated as a design obligation.

### Product rulings

- **G-1 · The scan/context line is hard (R108.2, 2026-07-17).** Scanning is LiDAR-Pro-gated and
  measured; non-Pro capture is "context," lands in the Inbox, and is **never labeled a scan**. A
  unified capture UI must carry the label discipline, not blur it.
- **G-2 · Two-tier trust (R114.1, 2026-07-18).** On-device output is orientation-only — never the
  deliverable, never measured against. Only server-side processing is truth. **This is the house
  precedent that governs an on-device draft transcript vs. a server re-transcription**, and `[D6]`
  §A5 independently converged on the same shape. Cite R114.1, don't re-derive it.
- **G-3 · Truth-framing over blocking (R108.5 + R110/FR-10 + R113).** Degrade honestly with a
  visible stamp (`UNVERIFIED` is the existing vocabulary); never block, never silently drop.
  §0.1's silent voice-note loss is a live violation of this law.
- **G-4 · Typed anchors only in P1 (R108.1).** Voice-driven dimension entry is **not** a ruled
  feature. The named re-open trigger is *"field evidence of transcription friction"* — if this
  program assembles that evidence, cite R108.1 directly when re-raising it.
- **G-5 · No Coolify, ever (R108.4 → R109.1, and both root agent files).** New server-side work
  targets Supabase edge functions, pg_cron, Cloudflare Workers/Workers AI, or the existing GPU box —
  never a new bespoke worker. GPU spend "earns its keep" against a real trigger.
- **G-6 · Kits are the existing capture grammar.** K-01 Measure set / K-02 Detail photos already
  define what a structured field ask looks like, and `site_binder_entries` (append-only, approved,
  `supersedes_entry_id`) is the shipped pattern for promoting raw capture into a durable project
  record. Reuse before inventing.
- **G-7 · Field pros are guests, forever.** No account as toll, ≤2 taps from an SMS link. Leah is an
  account holder; her contacts must never be asked to sign up. These are opposite friction budgets
  in the same feature.

### Naming (this repo has rulings that exist *only* to fix naming collisions)

- **G-8 · Never a third "Capture Inbox" (I84).** `field_captures` and `proposal_captures` already
  share the name. Pick something unambiguous.
- **G-9 · Never an unqualified "request" (R98 + I53).** Three senses already ship: design requests
  (Desk pool/claim), Site Requests (SR01–20), SMS field-coordination items.
- **G-10 · "Field kit" is taken.** `components/document/discovery/field-kit.tsx` is form-field
  primitives, not on-site tooling.
- **G-11 · Rule the room word.** `rooms` vs `project_rooms` vs `room_scans` (§2.0 pt 4). No unified
  "put this in this room" affordance can ship without picking one and stating the mapping.
- **G-12 · Never say "AI."** The capability is always **Designer-Taught Intelligence** — stated in
  both `.agents/skills/patina-brand-voice/SKILL.md` and PRD §13. Binds every transcription and
  extraction string a designer or client reads.

### Platform / architecture

- **G-13 · Agent OS.** Async work rides `agent_tasks` via `enqueue_agent_task` — never a parallel
  queue; agents write business data only through the queue; **drafts land `awaiting_review`**; no
  automated external sends; scheduled jobs are pg_cron → `public.invoke_edge_function` with history
  in `job_runs`. Note `[D2]` §8's caveat: the scan-pipeline kinds use `claim_agent_tasks` (00297),
  a *different* claim/lease path from the canonical one — pick a mechanism deliberately, and note
  that the closest precedents for a sweep (`derive-scan-photo-media`, `convert-room-scan-glb`) use
  cron+edge-fn with **no** agent queue at all.
- **G-14 · Wire contracts are frozen.** `FieldCapturePayload` camelCase keys (`schemaVersion = 1`),
  `ContextCaptureProvenance`'s flat dotted keys, `CaptureMediaPath`'s lowercase-both-segments rule,
  and the B-17 semantic-vs-transport MIME split (a new audio artifact type must follow the split,
  not fight the bucket allow-list — that was a real fixed production defect).
- **G-15 · Migrations.** Filesystem head is **00513** (verified: `00513_invoice_numbering_studio_uniqueness.sql`);
  gaps exist at 00487/00488 (renumbered) and 00496/00497/00502–00509 (cause undetermined). Mint from
  **00514** and re-verify the live head against Strata first. `00512` is parked/unapplied on
  `followon/sd-caller-hardening-00512`.
- **G-16 · Auth is Supabase only; Field is invite-only** (`signInWithOTP(shouldCreateUser: false)`).
  Types from `@patina/types`; Supabase data through `@patina/supabase` hooks; NestJS service data
  through `@patina/api-routes`. **No new NestJS services** — new server logic is an edge function.
- **G-17 · iOS 18.0 floor.** Verified across all 8 build configs. This blocks
  SpeechAnalyzer/SpeechTranscriber (iOS 26) and makes WhisperKit or chunked `SFSpeechRecognizer` the
  only on-device options without an explicit deployment-target decision. App Intents, iOS 18 Control
  Center controls, Action Button binding, Lock Screen widgets, Live Activities, and `CLVisit` are
  **all available today** at this floor.
- **G-18 · New entitlements are all blank slates.** Missing today: any `UIBackgroundModes` (so
  background audio does not work), App Intents/Siri, `NSLocationAlwaysUsageDescription`,
  `BGTaskSchedulerPermittedIdentifiers`, `NSCalendarsUsageDescription`. Already present: camera,
  **microphone**, **speech recognition**, photo library, When-In-Use location, motion, Face ID; App
  Group `group.cloud.patina.field`; `applinks:client.patina.cloud`.
- **G-19 · Extension targets do not exist and cannot be created by dropping files.**
  `CaptureShareExtension/` and `CaptureWidgets/` are empty directories with **zero** target-generation
  code in `generate_project.rb` — any widget, share-sheet, App Intents, or Live-Activity work needs
  new Ruby target-generation code first.
- **G-20 · The gate is `scripts/capture-gate.sh all`** (build → test → lint), and its lint step
  silently no-ops and still exits 0 if `swiftlint` is absent. There are **no UI tests** and no
  Field TestFlight/fastlane/archive pipeline. Device-verified is single-operator (team `VP22LXHT7L`,
  Kody's phone, `blitz-iphone setup_device` with an explicit UDID — `booted` returns an empty tree
  when a phone and a simulator are both present). Never install a `CODE_SIGNING_ALLOWED=NO` build
  for a walk.
- **G-21 · RLS asymmetry is real and unfixed.** `field_captures` is owner + org-inbox-shared (00233);
  `room_scans`/`room_files` compose owner + designer-association + studio-co-member (00341). A
  studio co-member sees a scan's drawings and an **empty** capture list. Whether the field inbox is
  per-designer or per-studio is a decision that must precede the surface.
- **G-22 · Portal flags are fail-closed and most of the field surface is already dark.** `room-file`
  gates the entire Room File including the capture-context list; `call-sheet` gates the party
  profile and therefore the SMS thread and field links. **Landing this program behind a third dark
  flag makes it unwalkable** — decide the flag posture before building.
- **G-23 · Git hygiene.** Never `git add -A`; concurrent agents get their own worktree;
  `Secrets.swift` does **not** follow `git worktree add` (copy it in *before* the first regen);
  `git stash` is shared across worktrees — never stash in parallel agents.

---

## 6. Decisions owed before design, and the open questions this pass could not close

**Answered this pass** (removing them from the open list): `[D3]` Q1 (provenance key set — §2.0 pt 3),
`[D3]` Q2 (iOS does write `photo_asset_ids` — §0.2), and the `[D1]`/`[D2]`/`[D7]` voice-audio
contradiction (§0.1).

**Still owed, and each blocks design work:**

1. **Which room concept wins** for a unified capture-placement affordance (G-11). Blocks any "put
   this in this room" UI spanning scan and specimen capture.
2. **Where project photos live.** There is no project-general photo table. Blocks M4, M5, M8, M9 and
   friction #9. This is a schema decision, not a wiring one.
3. **Per-designer or per-studio field inbox** (G-21). Decides whether the inbox is a Desk population
   or a Studio ledger.
4. **Flag posture** (G-22).
5. **`project_products` — retained or vestigial?** It receives every project-routed field capture and
   nothing in the document-era portal reads it.
6. **Was S1's orphaning from C3/C5 a design choice or a regression?** The V1 "Route all" footer
   suggests batch-routing was the intended rhythm — but it routes one record, which reads unfinished.
   `[D1]` open question.
7. **Was the missing voice-audio writer a scope cut or a dropped stitch?** The whole downstream chain
   is built and waiting; someone with the P1 item-7 history should say before the D-phase treats it
   as new work.
8. **PRD O8** — "when The Document reads the Binder, what renders in the Desk vs. the margin?" The
   PRD itself flags this as cross-cutting and not Field's call alone. It is the single most directly
   relevant unresolved ruling to this program's brief.
9. **PRD O2** — client visibility into the Binder, and **Leah Session 05** (prepped 2026-08-18,
   findings template still blank) which asks "Would her clients scan a room?" and ranks
   "capture/memory" as one of four MVP-wedge candidates. Live, unresolved, squarely in this
   program's territory.
10. **Deployment target: stay at 18.0 with WhisperKit, or move to 26 for SpeechAnalyzer?** `[D6]`
    surfaces this and explicitly does not resolve it.
11. **Has Leah ever held Patina Field on a real site?** M4's literal gate was deferred (R113), Kody
    accepted on his own device, and project memory still lists the walk as owed. This program should
    not assume field evidence exists.

---

*Read-only synthesis. No repository file was modified other than this report.*
