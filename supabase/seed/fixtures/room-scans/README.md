# Room-scan fixtures

## `elena-formal-dining.captured_room.json`

**Synthetic fixture — not a real device export.** Hand-authored to the
iOS 17 `CapturedRoom` Codable JSON shape (top-level
`{version, identifier, story, walls[], doors[], windows[], openings[],
floors[], objects[], sections[]}`; surfaces carry
`{category, confidence, curve, dimensions:[dx,dy,dz], identifier,
parentIdentifier, polygonCorners (floors only), story, transform:[16 floats
column-major]}`; keyed-container enums, e.g. `"confidence": {"high": {}}`,
`"category": {"wall": {}}`, `"category": {"door": {"isOpen": false}}`).

**To be cross-validated against the first real device export** once one
lands — this fixture was authored against the spec in the W1-T5 brief, not
against parser source, because `room-view/parser` (the branch that will read
this shape) had not been pushed at authoring time (its tip was identical to
`room-view/geometry-schema`, i.e. no parser code exists yet on any branch).
No shape adaptations were needed since there was nothing to cross-check
against; the gate should re-validate this fixture once `parse-room-scan`
lands.

### Content — Elena Ruiz, "Formal Dining Room"

Matched to `supabase/seed/leads_room_scans.sql` row `rs3`
(`width=14, length=14, height=10, unit='ft'`): room footprint 4.27 x 4.27 m
(~14x14 ft), wall height 3.048 m (10 ft). All geometry is authored in
**meters**, in a canonical local frame (origin at the room's NW corner,
+X → east, +Z → south, Y up — the same "plan frame" convention documented in
migration 00337), and then a **deliberate global transform** — 15° yaw
(within the specced 10-20°) plus an offset origin `(5.6, -1.42, -3.2)` m — is
baked into every `transform`, `polygonCorners`, and `center` value to
simulate a raw ARKit world-frame capture. The parser is expected to recover
and undo this rotation/offset when normalizing into plan frame; nothing in
this fixture is pre-de-rotated.

- **5 walls**: N / S / W are single full-length runs (high confidence). The
  **east side is split into two collinear runs** (`wallE1`, `wallE2`) at the
  same `x=4.27` local line with a small seam gap — a real RoomPlan artifact
  where one physical wall gets re-detected as two adjacent segments.
  `wallE1` is `medium` confidence; **`wallE2` is deliberately `low`
  confidence**.
- **2 windows**: on the north wall (sill 0.9 m / head 2.1 m / height 1.2 m)
  and the south wall (sill 1.0 m / head 2.0 m / height 1.0 m) — both carry
  real sill/head via `transform.y ± dimensions.y/2`, both `parentIdentifier`
  their wall.
- **1 door**: on the west wall, `category: {"door": {"isOpen": false}}` —
  RoomPlan doesn't detect swing direction, so there is no swing data in the
  raw export (a swing field only appears downstream, in the parsed
  `room_scan_geometry_elements` row, always `NULL` for this fixture).
- **1 pass-through opening** (`openings[0]`): floor-to-near-ceiling, on the
  first east-wall run, `category: {"opening": {}}`.
- **`floors[0]`**: `polygonCorners` = the four room corners in the same
  rotated/offset world frame as everything else.
- **5 objects**: dining table (room-centered, axis-aligned), three chairs
  (one facing north, one facing south, and **one at a deliberate 55° local
  yaw** — non-axis-aligned even before the additional 15° global rotation,
  satisfying the "at least one rotated transform" requirement), and a
  sideboard/storage piece against the south wall.
- **1 section**: a single-room `sections[0]` entry (`label: {"diningRoom":
  {}}`) summarizing the room footprint — iOS 17 multi-room/story support.
  This is the one part of the shape with the least external verification
  (no real export was available to check `Section` field names against);
  treat its exact shape as lower-confidence than the rest of the fixture.

Generation is scripted (not preserved in-repo — this file documents the
result). Regenerate by hand-authoring or scripting to the same spec if the
fixture ever needs to change; do not hand-edit the JSON's `transform` arrays
directly, since they're derived numbers (rotate-then-translate every local
point/orientation by the fixture's global 15°/offset transform).

## `elena-formal-dining.scan.usdz`

A trivial synthetic companion mesh (floor + 4 walls as flat quads, box room,
4.27 x 4.27 x 3.048 m) authored directly with `usd-core`, in the fixture's
own **local** (canonical, un-rotated) frame — it does not encode the global
rotation/offset baked into the JSON, and it does not encode confidence,
openings, or furniture. It exists only as a placeholder `model_url` payload
so the loader script's optional USDZ-upload path has something to exercise;
it is not test-critical. The GLB conversion lane is already gate/prod-verified
elsewhere (`room-view/glb-converter`) and does not depend on this file.
