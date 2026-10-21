# The Room Proof

The room is the working surface. The image is an indexed plate; its objects lead to specifications, client decisions and a draft workshop instruction. This replaces the previous static cover/timeline structure with three compositions within one project document.

- **Room:** a complete illustrated room, four anchored figure references, an equivalent text index and a narrow authored working margin. Selecting a piece changes the margin without changing the room.
- **Piece proof:** the selected piece takes the stage. The room becomes a context thumbnail. The lounge chair has a working finish comparison; the other three pieces have sample specification records.
- **Maker folio:** a printable, ruled document with specification rows, the shared decision record and a studio review checklist. It remains a draft in every state.

Patina’s existing paper stock, Playfair/Inter/DM Mono typography, authored notes, fine rules and bottom studio dock remain. Blue is used as an annotation ink. Shape, scale and content do the work; there are no independent dashboard cards or timeline widgets.

The parent’s reference direction was MOHEIM’s product/gallery navigation, House of Honey’s authored interiors, Formafantasma’s meaningful contents, and Patina’s own working document. This implementation uses the principles in an original composition and does not reproduce those sites.

## Prototype behavior

- Query parameters `view=room|proof|folio`, `piece=chair|table|sofa|lamp`, and `role=studio|client` support direct review links. The URL controls the active view. The role parameter is read only on initial load; browser Back/Forward preserves the role currently being previewed.
- A studio preference and a client finish choice are separate. A studio preference never fills the maker instruction. No radio choice is selected initially.
- The client view omits the private preference, studio note and review checklist. The shared maker folio never includes the studio note.
- Selecting a client finish updates only the local sample record. Changing it invalidates the finish review checkbox. The folio remains a draft even if every review item is checked.
- Browser storage holds the selected piece, role, saved decisions and saved review checklist. Unsaved finish choices and checklist changes stay in memory across view and role changes; checklist changes are saved only with the review button. Storage failure leaves the sample usable for the current visit.
- Native details expose dimensions/material notes and history. Print shows only the shared maker folio. Reset clears local sample decisions and review checks.

## Content limits

The room and matching chair are concept illustrations. CSS finish swatches show a direction, not a photographed or accurate workshop sample. Workshop names, dimensions and all project details are fictional review content. This is not an ordering surface; no send or production service exists.

## Files

`prototype.html`, `prototype.css`, `prototype.js`, and this note are the complete implementation owned by this design agent. Assets and the enclosing founder presentation are supplied by the parent task.
