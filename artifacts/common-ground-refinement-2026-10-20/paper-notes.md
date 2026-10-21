# Common Ground / Paper

## Design plan

A single project spread: 38% left page holds the room, authored direction and material story. The right page records agreement, the present decision and what comes next. This preserves Common Ground’s left visual weight/right project flow while bringing over the real designer portal’s serif project identity, ruled actions and paper document character.

Palette: paper #FCFAF6, rail stock #E8E3DB, charcoal #2C2926, quiet ink #65594E, aged oak #8B7355, forest #3E5145. All are actual portal tokens, not a new cream palette. Playfair Display carries the room identity and Leah’s voice, Inter carries working copy, DM Mono is limited to dates and document references.

The design uses darker left stock, a full-bleed room image within the left page, and fine, slightly offset paper edges on the finish sheet. No generic tiles or floating cards. A lower-case maker monogram is a modest sample identity, not a Patina brand revision. Left-page material swatches suggest substance without decorative texture covering the interface. Paper and Bound share exactly the same geometry, content and interaction state.

## Working interactions

- Paper / Bound switches update `?variant=` and presentation backlink in place, preserving all interaction state.
- Studio / Client preview changes the visible controls. Private note field value is cleared from the form when entering Client preview, and studio controls are hidden. Role changes close open dialogs.
- Finish sheet opens with native dialog semantics, keyboard focus trapping, Escape close and native focus restoration.
- No default finish is approved. Studio working preference and Nora’s client choice are separate state values; recording either requires selecting a radio option.
- Save note only persists a private note without recording a preference or approval.
- Client finish choice updates the main decision and draft brief. It does not release the brief.
- Workshop draft includes recorded client finish only. It never includes studio preference or private note. Release always remains awaiting review. There is no Send action.
- History expands to show the two recorded shared milestones.
- On mobile, the left narrative collapses behind About this project; project title, room photo and flow remain available.
- State is stored only in this browser’s localStorage (`patina-common-ground-refinement-v1`), shared by the two slight variants. No backend calls or external sends.

## Verification

Parent browser verification covered 1440, 768, 390 and 320 widths; see VERIFICATION.md for the final results. JavaScript syntax check passes. Native controls use visible focus, reduced motion is respected, all image/font assets are local and supplied by parent. No app files changed.
