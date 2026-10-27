# Round six — presentation verification

22 October 2026. This record covers the static presentation only. No portal, service, database or production checks are claimed.

## Completed

- `node --check` passed for presentation.js and workflows.js.
- HTML parser checked duplicate IDs and internal anchors: none missing/duplicated. Final delivery link/asset check covers the stable folder and bundled prior rounds.
- Opened the presentation in Chrome through the local review server. Inspected the cover at the normal 2046px viewport; no horizontal document overflow or broken images.
- Exercised all four workflow choices across lead, agreement, decision, handoff and aftercare; content and pressed states updated. After critique, confirmed consultation has five core moments plus optional later questions, and design delivery comes before client implementation.
- Used keyboard Enter on the design-only selector and its delivery control; the correct content appeared.
- At 1440 × 1000, inspected the workflow comparison and mixed-job table. Captured compressed review images.
- At 390 × 844, inspected the paper layout and scope summary. Document width stayed 390px; the dense room table scrolls inside its own region (359px viewport, 628px content), not the page.
- Consultation paper hides the supplementary drawing strip; its agreement summary shows exclusions, and the advice-record fold opens and closes in place.
- Mixed-ownership fold showed payer, purchaser, receiver, installer and client-supplied-material distinctions.
- Temporary review text and a radio selection saved, survived reload, and downloaded as Markdown. Opened the actual downloaded file and checked all five question headings and the temporary text. Cleared only the temporary round-six notes through the form’s explicit two-click clear. Final form is empty.
- Browser console inspection returned no warnings/errors during the exercised states.
- Final tab returned to the cover at scroll position 0, normal viewport restored, default full-service example selected. All images loaded. Marked the presentation as the user-facing deliverable.
- Claude Code provided a separate-provider, separate-context content review and focused follow-up. Root incorporated remaining small corrections. See COLLABORATION.md; no third independent review is claimed.

## Artifacts

- preview.jpg — final cover, normal browser viewport, compressed to 1600px.
- review/journey-desktop.jpg — design-only delivery comparison at 1440px.
- review/mixed-desktop.jpg — room responsibilities and next acts at 1440px.
- review/paper-phone.jpg — design-delivery summary at 390px.

## Limits

No actual practitioners were interviewed. No representative research, real job data, full screen-reader audit, Safari check, backend behavior, permissions, contracts, payments or external messaging was tested. The presentation choices are illustrative, not functional portal implementations. Printing shows the selected example, not every interactive state. Review notes do not merge across browser tabs.

Product source and prior-round artifacts remain unchanged. Only artifacts/room-proof-round6-2026-10-22 is committed on the design branch; delivery copies and a review ZIP live in the main checkout’s artifacts directory.
