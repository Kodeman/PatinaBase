# Verification — Room Proof 05

22 October 2026. Scope: standalone HTML/CSS/JavaScript artifact only. No production app, service, database, deployment or business record was changed.

## Static checks

- `node --check` on all 11 JavaScript files.
- Parsed both HTML files; checked duplicate static IDs and local script/style/image links. Prior-round links resolve from the stable artifact collection and are included in the ZIP.
- Checked local CSS assets and parsed all four new SVGs as XML.
- Images and fonts are local. The review server binds to loopback only.

## Observed in Chrome

- Room spread renders; survey note opens; concept/material/drawing views stay inside the job.
- A-201 current and superseded revisions, comparison and enlargement render. Sheet-specific sharing changes the correct label and preserves the open disclosure.
- A design link opens the actual LR-36 FF&E editor visibly (not the earlier design button). Closing returns to room design. Browser Back followed by an ordinary sheet open does not retain the old origin.
- Index anchor jumps scroll through the paper without rerouting the active scene; browser Back still restores a different working view.
- Drawing ↔ site return restores the previous working context. The same-area return label is suppressed.
- A saved A-201/C set draft remains C after filing D and displays the newer-print notice.
- Recipient, purpose and selected sheet subset are reflected in a frozen draft. An empty drawing set is rejected with a clear message.
- Field copy contains the assigned scope and held B drawing, with a fabrication hold. Its rendered copy excludes client prices, markup, private studio responses and the studio access card. This is a preview, not a security boundary for the surrounding full job.
- A sample Field observation is recorded and appears in studio review. Its room/drawing attachment remains B. A follow-up creates an open task and does not automatically revise the drawing or complete work.
- Unsubmitted studio text and selected follow-up survive a Field/studio toggle. Two observations requesting revision are both linked to D and the resulting saved set. A later request remains open; further revisions beyond D are explicitly outside the focused sample.
- New actions appear in the job record.
- The inherited client-reply save path preserves the actual typed text. Replies do not record approval.
- Reset restores fictional design and FF&E data; founder notes stay separate.
- Founder notes save, export a Markdown document headed “Room proof round 5 review notes”, and clear through the two-step clear control. Export now uses the browser’s local calendar date.
- 390px phone frame: survey, drawing, drawing-set form and Field preview have document width = scroll width = 390px. At 160% drawing zoom, the plate scrolls (352px viewport / 563px content) without overflowing the job.
- Desktop visual inspection of the room spread, drawing bench and presentation; phone inspection of the Field preview. No console errors were observed in the tested job flows.

The context-return tests inspect visible position after the next animation frame, not just the existence of an opened sheet. This matters because the first review found a real scroll-target collision.

## Review evidence

Actual Claude Code source mapping, independent Opus review and a separate follow-up are preserved in `review/`. Findings and dispositions are in [COLLABORATION.md](COLLABORATION.md). Screenshots are `preview.jpg`, `review/drawing-desktop.jpg`, `review/field-phone.jpg` and `review/room-spread.jpg`.

## Limits

Chrome only; Safari and Firefox were not executed. Explicit source elements remove the identified Safari focus dependency, but that is a code correction, not a Safari test result. No production portals, backend permissions, real document delivery, CAD/PDF authoring, 3D/LiDAR processing, uploads, signatures or payments were tested or implemented. No app builds or broad monorepo tests were run because only a dependency-free design artifact changed.

State is local and assumes one active editing window; there is no collaborative or multi-tab merge. The field attachment and drawing geometry are labeled illustrations. All sizes, people, messages, issue records and financial fixtures are invented sample data.
