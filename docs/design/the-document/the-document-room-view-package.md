# The Room View — handoff package for Claude Code

*2026-07-16 · design authority → implementation authority*
*Pairs with: `room-view-prototype.html` (look/feel authority — port intent, never markup; note the file's source structure: ONE geometry object, two projections reading from it — that structure is the architecture ruling, not a demo convenience). Both land in `docs/design/the-document/` together with this package and the ruling.*

---

## Part A — the append-ready DECISIONS.md block

Not yet appended — this session ran without repo access. Landing: `scripts/workstream_state.py` for the true next R-id, replace `R{next}`, append via `scripts/append_entry.py --entry`, diff-confirm, `--commit`. The full ruling text is in `room-view-ruling.md` in this drop; its headline rulings, binding on this build:

1. **The scan becomes a Patina drawing, not a scan viewer.** Parametric re-render of the CapturedRoom JSON in the brand's hand — Aged Oak line-work, quiet fills, Off-White ground. No mesh ships in v1; USDZ→GLB conversion happens server-side at ingest as archival insurance for a later "as captured" toggle. USD never enters the browser — no WASM, no SharedArrayBuffer, no COEP/COOP tax.
2. **The Rooms is a Studio room** beside Library and People — every scanned room, one roster, each card a lens into its Document. One viewer, two doors (index and Document references); nothing copied.
3. **The grammar is Plan · Orbit · Walk — one geometry, three distances.** V1 ships Plan + Orbit one toggle apart. Walk is in the arc, built last, disabled in v1 with "arrives with Place."
4. **Confidence renders honestly.** Low-confidence walls draw lighter and dashed, in both projections, with the "verify on site" note. A drawing that hides its uncertainty lies.
5. **Detected furniture ghosts.** The client's current room, present but quiet — category labels, hover dimensions, never confused with proposal material.
6. **Stages two and three are ruled, not built here:** Annotate (pins → margin notes with room-references; named frames → folio/boards) and Place (plan-first true-scale footprints, live clearance checks — 30–36″ walkways, 14–18″ sofa-to-table — flagged as geometry facts with designer override). The prototype's scenes 03–04 are their designed record.

---

## Part B — the build plan

Four phases. **Phase 0 findings return as I-entries before building.** Code-only calls you bless and log; anything a designer would notice comes back for a ruling.

### Phase 0 · Audit first — verify before building

**0.1** Audit scan storage reality against the UserJourney contract: does the iOS upload actually deliver CapturedRoom JSON + USDZ (+ PLY) to object storage, and metadata to Postgres? Where, exactly? Elena's scan is the test row — find it.
**0.2** Audit the room entity. Project FF&E rooms exist ("Primary bedroom," "En-suite bath" on the Feldman doc) — same table as scanned rooms or separate? The Rooms index needs one room entity carrying a document reference; name what exists before adding anything.
**0.3** State the dependency: has arrival-arc Phase 1 (request→client→document linkage) landed? The Rooms index's doc references and the "scoped back" entry path require it. If not landed, build against seeded links but acceptance holds until the real chain exists.
**0.4** Inventory prior art in the repo: any three.js/R3F, any USDZ handling, any floor-plan rendering already present.

### Phase 1 · Ingest — the geometry spine

**1.1** Ingest job parses CapturedRoom JSON → normalized room-geometry rows: walls (endpoints, height, thickness, confidence), openings (windows with sill/head, doors with width), objects (category, oriented box dims + transform, confidence), floor polygon, scan quality, scan date. Additive schema only.
   *Accept: Elena's scan parses into rows that fully drive the prototype's ROOM object shape — every field the two projections read exists.*
**1.2** USDZ→GLB conversion at ingest (server-side, headless), output to cold storage. No UI.
   *Accept: a GLB exists per scan; nothing references it yet.*
**1.3** Room entity linked to client + document.
   *Accept: Elena's room row → her document → her client, one join.*

### Phase 2 · The Rooms + Plan

**2.1** The Rooms Studio room: roster of cards — client, room type, scan date, dims/area, quality dot, document reference with phase. Mini-plan thumbnail rendered from geometry rows (server-rendered SVG is fine).
   *Accept: matches prototype scene 01; cards are real anchors (the P2 lesson — no dead surfaces).*
**2.2** The Room View, Plan projection: SVG from geometry rows — double-line walls, window symbols, door swing, ghosted detected objects with category labels, low-confidence rendering (lighter fill + dashed stroke + verify note in the facts rail), quiet overall dimensions.
   *Accept: matches prototype scene 02 Plan; hover any wall/opening/object → true-dimension chip; facts rail shows area, wall height (labeled "stands in for ceiling"), openings, detected list, scan quality.*
**2.3** Two-point measure tool in Plan: click twice → dashed line + feet-and-inches label; clearable.
   *Accept: distance within 1″ of geometry truth at any zoom.*
**2.4** Entry paths: Rooms card → Room View; Document scan references (Discovery fold, ceremony preview's "tap to walk it") → same Room View scoped back with a "→ her Document · Discovery" return. `/room/[id]` survives refresh — if the A3 deep-link fix hasn't landed, document the workaround and log it as a known gap, don't silently ship a bouncing URL.
   *Accept: both doors open the same viewer; back-reference navigates correctly.*

### Phase 3 · Orbit

**3.1** Orbit projection from the same geometry rows: three.js/R3F — extruded walls with real window/door openings (split-run construction per the prototype source), EdgesGeometry line-work + low-opacity fills, LineDashedMaterial for the low-confidence run, ghost furniture volumes, cream ground. Drag to orbit, scroll to move closer, polar clamped. Walk button present, disabled, "arrives with Place."
   *Accept: visual language indistinguishable in kind from prototype scene 02 Orbit; mode toggle Plan | Orbit | Walk(disabled); Orbit initializes only on first open (no three.js cost on Plan-only visits).*

### Telemetry

`room_opened` (source: index | document), `mode_switched`, `measure_used`, `pin_created` (stage 2, reserved), `frame_saved` (reserved), `placement_started` (reserved), `clearance_flag_shown` (reserved), `clearance_overridden` (reserved).

### Out of scope — do not pull in

Annotate and Place interactivity (designed scenes only — their build follows their own handoffs), the "as captured" mesh toggle (conversion runs, UI doesn't), Walk, any client-facing room view, PLY point clouds, and the share rail. The Rooms index does not grow filters/search in v1 — four cards don't need them; rule it when the roster does.

### Sequence gates

Phase 0 report → Phase 1 → Phase 2 → Phase 3, strictly. Arrival-arc Phase 1 is the stated external dependency for 1.3 and 2.4 acceptance. If both packages run concurrently, the linkage work lands once, in the arrival-arc package's Wave 1 — never twice.

---

## The kickoff line

> Read `docs/design/the-document/the-document-room-view-package.md`, `room-view-ruling.md`, and `room-view-prototype.html` (its source structure — one ROOM object, two projections — is the architecture ruling); run the Phase 0 audit and log findings as I-entries before building; first review milestone is Phase 1 + 2.2 — Elena's scan parsed to geometry rows and her Plan rendering with hover dimensions — reported with screenshots.

---

*Manual landing step (no repo access this session): place this package, `room-view-ruling.md`, and `room-view-prototype.html` into `docs/design/the-document/`; append the ruling to DECISIONS.md via `append_entry.py` (real R-number, footer restored). Ruling + artifact + package land together.*
