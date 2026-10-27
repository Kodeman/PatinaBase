# Room Proof 05 — source and proposal map

Date: 22 October 2026. Source baseline: `30235ede4874feaff0f83859abcbb3bb9f37b654` in `patina-merged`.

This is source inspection, not a live production audit. The HTML prototype uses fictional people, records, drawings and dimensions. It does not call any portal API. Paths below are relative to the repository root.

## Design development

| Source | Observed capability | Proposal in this round |
|---|---|---|
| `apps/designer-portal/src/components/document/plans/plan-room-workspace.tsx:1–210` | Plan Room has Current set, Drawing intake, sheet detail and issue views; staged intake remains in the same workspace. PDFs are accepted for review. Project-only gate. | A room drawing bench unfolds inside the continuous job, before item approvals. Upload/intake and PDF rendering are not implemented. |
| `…/plans/plan-sheet-detail.tsx:1–190` | Current print pointer; newest-first history; older prints marked superseded. Client sharing follows the current print and is distinct from contractor issue. Issue/recipient history refers to exact prints. | A-101/B and A-201/B/C/D, old-print stamp, comparison, independent client-visibility toggle per sheet, and links to LR-36. D is a deliberate local studio action. |
| `…/plans/plan-issue-ceremony.tsx:1–210` | Frozen issues, current set/subset, changed sheets, roster/manual recipients, purposes pricing/production/information/record, recipient transmittals and holdings. | Unsent frozen recipient drafts with pricing/information purposes. Production purpose is unavailable in the sample while site verification is open. Drafts are not transmitted or treated as received. This is a demonstration gate, not a claim about the production release policy. |
| `…/rooms/concept-render-upload.tsx:1–210` | Inline room concept upload, private image storage, caption/date, “Concept · not installed” label. | Concept plate, material references and FF&E links. The existing room image is reused with that label. Board authoring, image uploads and render-version management remain outside this round. |
| `…/brief-scan-strip.tsx:1–200` | Room-linked scan strip, primary association, signed covers, route into Room View with document context. | Survey plate with capture date, explicit room association and unresolved measurement. |
| `…/rooms/room-view/plan-stage.tsx:1–100` | SVG plan projection from room geometry, walls/openings/furniture and dimensions; low-confidence treatment and focusable primitive tips are described in the implementation. | Hand-drawn SVG plan/survey illustrations. These are not exported geometry, measured LiDAR output or a functioning scan viewer. |
| `…/overlays/scan-viewer-sheet.tsx:1–210` | The overlay currently presents a still image; the previous r3f viewer was removed. | No claim of interactive 3D parity. The Room View plan and older overlay are distinct surfaces. |

`…` above expands to `apps/designer-portal/src/components/document`.

## Field and trade work

Claude Code independently read the following source for the mapping. Full report: [Field source review](review/CLAUDE-FIELD-SOURCE-REVIEW.md).

| Source | Observed capability | Proposal in this round |
|---|---|---|
| `apps/designer-portal/src/components/document/roster/project-team-roster.tsx:13–23,60–93` | Shared project/call-sheet roster, optional GC, direct trades, role kinds including installer/receiver/vendor/architect. | Names and roles sit alongside the room scope, grouped by current/later work. Scope, document reach and authority are explicitly separate. |
| `…/roster/site-access-card.tsx:6–17,79–113` | Studio-only access record: version, key holder, hours, receiving note, who was told. No code field. | Folded studio access note. Excluded from Sam’s Field copy. No access codes or permissions are created. |
| `…/commercial/trade/work-order-sheet.tsx:4–14,61–116` | Trade-facing room prose matches the scope; no client price, markup or bid ledger; payment per agreed number; print action. | Practical Field work-order copy with room, scope, visit and retained drawing versions. Actual signing, printing/exporting and contractor access are not implemented. |
| `…/commercial/trade/trade-scope-detail.tsx:4–17,313–325,365–449` | Authorization precedes engagement; separate events, schedule implications, visible gate reasons; studio substantial completion versus client acceptance. | Fixture dates and a visible coordination hold. No action pretends to engage a trade, sign a scope, accept work or release fabrication. |
| `…/field/field-desk.tsx:4–22,56–88,154–186` | Field rollup/triage with proposed effects, apply/dismiss and applied changes with undo. | Room-anchored site observation and explicit studio follow-up. This does not claim that production always requires manual review; the source has applied-by-text behavior too. |
| `apps/designer-portal/src/lib/document/field-note-payload.ts:15–52` | Portal reader exposes body, capture identity, audio and photos. | A labeled illustrative attachment stands in for a captured photo. No real photo, voice transcription or upload is performed. |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Work/FieldRosterRules.swift:34–107,173–218,232–319` | Roster phase bands; no access code exposure; phone authority phrased without dollar thresholds; reach and texting consent distinct. | Named roles and scoped Field preview. Consent, calling, authority grants and task editing are not simulated. |
| `…/Work/FieldVisitRoomMerge.swift:35–83,90–129` | Distinct spec-room and scan-room identifiers; matching by normalized name retains missing sides, never guesses an id; scan setup explains missing room. | Explicit sample association, never a claim that the two room ids are interchangeable. |
| `…/Sync/FieldCapturePayload.swift:21–59,103–193` | Notes/context captures, visit/kit, photo/voice metadata, per-field provenance and confirmation; suggestion distinct from fact. | Observation retains the room and drawing revision used, author and date. The exact drawing/scope cross-link and placement on the job paper are proposed connections. A reported observation does not revise a drawing. |

Swift `…` expands to `apps/mobile/Capture/CaptureKit/CaptureKit`; portal `…` expands as above.

## Retained operational work

The 80-line sample, six FF&E working views, line-by-line item decisions, private notes, client/maker draft correspondence, purchasing checks, order snapshots, acknowledgment and receiving continue from [round four](../room-proof-round4-2026-10-22/index.html). See that round’s [source map](../room-proof-round4-2026-10-22/SOURCE-MAP.md) for the original mapping and boundaries.

No claim of full production parity: CAD/BIM authoring, live PDFs/3D, full material boards, scan processing, file storage, contractor entitlements, delivery/receipts, signature, payments, full trade administration, installation punch and closeout remain outside this study.

## Artwork

- `room.png`, `chair-proof.png`, `studio-room.jpg` and local fonts are retained from the prior approved round. The room is labeled as a concept, not an installed photo.
- `room-survey.svg`, `furniture-plan.svg`, `north-elevation.svg`, `site-observation.svg` were drawn for this prototype. All dimensions and marks are illustrative, not construction documents. The elevation illustration is shared between revisions; the immutable revision record carries the changing depth. That is a prototype boundary, not a CAD-difference viewer.
