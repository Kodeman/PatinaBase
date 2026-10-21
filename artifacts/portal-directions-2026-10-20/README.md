# Patina — A new point of view

A founder presentation and three independently developed interface concepts. Prepared October 20, 2026.

Open **index.html** in a browser. All imagery, styles, and scripts are included; no build, server, installation, or internet connection is needed. Keep the folder together when sharing, or use the accompanying ZIP. A local HTTP server also works.

## Presenting

- Use the top navigation or the footer arrows to move through six slides. Left/right keys work when focus is outside a form or control.
- Select a concept screenshot or **Explore** to open its working prototype.
- Use **Designer / Client / Maker** in each prototype to see the same example project through different perspectives. Use **Back to presentation** to return.
- On **Compare & respond**, choose a direction and record what feels right and what needs to change. Notes save in that browser when storage is available. **Download review notes** produces a text file for sharing. No messages are sent.
- **Print presentation** prints all slides, including the comparison and entered notes.

## The three proposals

| Concept | Organizing idea | Visual language | Best moment | Tradeoff to test |
|---|---|---|---|---|
| Folio | A living project book | Oversized serif type, cool stone, aubergine, room photography | Presenting a designer’s direction | Finding urgent details within a long project |
| Workroom | A spatial room composition | Cobalt, blueprint blue, bold sans, material studies, specification inspector | Choosing and specifying pieces | Working efficiently on small screens |
| Common Ground | A shared decision record | Forest and mineral green, humanist type, agreement spine | Delegating and coordinating | Keeping the visual pleasure of design |

Each concept was built by a separate design agent from the business brief, without copying the current portal. The presentation and integration were assembled by the lead agent. An independent Claude/Opus review was requested for interaction and workflow issues. Verification results are recorded in `VERIFICATION.md`.

The recommendation on the comparison slide is a design hypothesis, not a usability result. A next round should choose a foundation and test one complete room direction → client decision → maker-ready brief with Leah and a colleague.

## Business grounding

The canonical repository sources consulted were:

- `docs/vision/VISION.md` — studio first; a growing practice making its first hires; one engagement record; subscription and designer-led furniture economics.
- `docs/vision/VISION-DECISIONS.md`, V8 — client page as the client-facing side of the same record.
- `docs/vision/VISION-DECISIONS.md`, V14 — studio buying and reviewed release responsibilities.
- `docs/vision/VISION-DECISIONS.md`, V22 — designer review before studio outbound.
- `marketing/canon/voice.md` and `.agents/skills/patina-brand-voice/SKILL.md` — specific, tangible, Midwest language; the designer is the intelligence layer.

The user explicitly requested a completely new design take. These explorations propose alternative visual and interaction systems; they do not revise doctrine or change a production portal. The existing portal’s layout was not used as a starting template.

## Prototype scope

Middle West Studio is the real business context. Lake Mendota House, Nora Ellis, Northline Workshop, specifications, decisions, and dates are fictional demonstration data. Photographs illustrate an atmosphere and furniture form, not an actual client room or a qualified vendor listing. The photographed chair is not a Northline Workshop product.

The role switches are presentation controls, not authentication. Finish preferences, drafts, and notes stay local. No backend, real order, message, production release, or permission system is connected. Folio keeps prototype state for the open page; Workroom uses browser local storage; Common Ground uses session storage and includes a sample reset. The founder review form uses separate browser local storage.

The designer, client, and maker experiences are the focus. Internal admin operations are outside this concept study.

## Image credits

- `assets/room.jpg`: [Unsplash image source](https://images.unsplash.com/photo-1600210492486-724fe5c67fb0). Downloaded at 1600px for the local presentation.
- `assets/chair.jpg` and `assets/detail.jpg`: [Zoco Home — Oak Armchair](https://zocohome.com/products/oak-armchair-linen). Product form references for this private design review, not licensed Patina marketing assets or an endorsement. Replace with commissioned/approved photography before public use.
- `assets/*-preview.jpg`: screenshots of these HTML prototypes.

System font stacks keep the presentation independent of font services. No third-party JavaScript or CSS is loaded.

## Files

- `index.html`: six-slide founder presentation, concept comparison, local feedback and export.
- `folio.html`, `workroom.html`, `common-ground.html`: interactive concept prototypes.
- `*-notes.md`: each designer’s tokens, rationale, and tradeoff.
- `assets/`: local photographs and concept previews.
- `VERIFICATION.md`: review and browser-check evidence.
