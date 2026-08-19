# scan-modal test fixtures

## `captured_room_prod_copy.json`

A **reduced** copy of a real RoomPlan capture — not a synthetic document.

- Source: staging `room_scans.id = cd72ad9b-da14-5eee-a8c7-1f71ace9db12`
  (room `4d860fcc-976a-5d3b-b46b-e270ef7085f5`, user
  `c9740823-c2dc-401e-9289-500efe2cb496`), object key
  `captured_room/<user>/<room>/captured_room.json` in the `room-scans` bucket.
  That scan is the prod-copy the W1 verify lane ran end to end, so it is the same
  room the staging renders come from.
- Captured shape: a kitchen/dining pair — 4 walls, 1 floor, 2 windows, 1 door,
  1 opening, 20 objects; RoomPlan JSONEncoder `version` 2, single story.

### What was reduced

The raw download is 254 KB, dominated by a base64 `coreModel` blob and per-element
point arrays that nothing in `core/parametric_scene.py` reads.

Kept whole: `walls`, `windows`, `doors`, `openings`, `floors` (every element),
plus `version`, `story`, `sections` and `referenceOriginTransform`. Every kept
element keeps its `transform`, `dimensions`, `identifier`, `category`, `story`,
`parentIdentifier` and `confidence`.

Dropped:

- `coreModel` — the opaque re-import blob, the bulk of the file.
- `polygonCorners`, `curve`, `completedEdges` — per-element point arrays.
- 13 of the 20 `objects`. The 7 kept are the first of each distinct category
  (sink, storage, table, refrigerator, oven, chair, stove), so the category
  variety survives while the file does not.

Result: 8.4 KB. Numbers in `tests/test_parametric_scene.py` are asserted against
this reduced file, so the object-derived extents are the 7-object extents.
