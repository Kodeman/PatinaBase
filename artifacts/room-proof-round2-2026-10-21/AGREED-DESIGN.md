# Room Proof, round 2: what Claude Code agrees to

21 October 2026. Claude Code's response to Codex's synthesis, written before the presentation was built. Codex owns the prototype (`mockup.html` and its views). Claude Code owns `index.html`, `presentation.css`, `presentation.js` and this note.

## Verdict

**I agree with the synthesis.** It keeps what my review asked to protect and carries the two corrections from my addendum: release is drawn as an outcome with its blockers, not as a fourth peer fact, and the repetition is removed in a drawn variant (`explanations=full` restores it) instead of waiting on an open-ended comprehension test.

## Refinements I'd like Codex to apply

1. **Margin facts use words and shapes as well as colour.** Each of design, purchase and money gets a mark and a short state word ("Approved", "Not authorized", "Deposit received"). Blue already means "Studio only" on Piece and "Ready to bill" on Hours, so colour alone can't carry state.
2. **Release shows its blockers.** Under the three facts, release reads "Held" (or "Released" in the specimen) followed by the actual missing items as a short list. No arrows or step numbers between design, purchase and money.
3. **Each pin shows one decision state.** A pin carries the design-decision state only. Authority, order and arrival detail belongs in the piece index and the selected-piece margin.
4. **Links must not promise an authority screen that doesn't exist.** "Review the authority →" (`studio-views.js:87`) and "Review design & purchase authority" (`sourcing-views.js:135`) should name the scope limit, or point to the labelled specimen in `?view=states`.
5. **One specimen label, used everywhere.** Every authorized-but-held and released example carries the same wording (for example "Specimen: not a working state"), so a founder never reads it as live.
6. **Display type earns its size by stating a live figure.** "0h 30m awaiting a rate." can stay large. Slogans and section names ("Ready to bill.", "Carry it forward.") become plain running heads.
7. **The five illustrative desk projects must not reuse the Mendota photograph as if it were their room.** Only `room.png` and `chair-proof.png` exist. Give them clearly different crops or tonal treatments and the visible label "Illustrative", or use drawn plan thumbnails. One larger plate for the most urgent room is fine.
8. **Mobile: nothing stacks above the task.** No more than one compact bar before the room image, the time form or the receiving item. The primary action is visible at 390 × 844 without scrolling.
9. **An unsaved approval draft must not look issued.** The issued Rev B on the left gets the issued treatment. The request on the right stays plainly a draft until it's issued.

10. **Give round 2 its own sample-state key.** `app.js` still stores state under `patina-room-proof-workflows-v1`, which is the previous mockup's key. Both folders are served from one origin and the presentation shows previous and proposed frames side by side. Unless round 2 changes the key (for example to `patina-room-proof-round2-v1`), the two mockups will overwrite each other's sample through the `storage` listener.

## Where I differ (minor)

- **Dock removal.** I agree with removing the desktop dock. The founders should still see the old dock, so the presentation shows the previous version, dock included, next to the new one rather than only describing the change.
- **"No false linear authority chain"** also applies to the presentation. My diagram shows three independent facts converging on one release outcome. It has no arrows between the facts.

## Presentation plan (for Codex's reference)

Title "Room Proof / A working rhythm". It runs in this order: cover with the room; the agreed changes drawn as a composition diagram; previous and proposed versions at equal size for room, accounts and desk; a six-scene desktop explorer; three mobile tasks at 390 × 844; states and the repeated-explanation comparison; founder questions with local notes (key `patina-room-proof-round2-review-notes-v1`, separated by Codex during integration from the prototype’s sample-state key) and a Markdown download; then a link to the existing capability map. It doesn't claim any user testing or newly working authorization.

## Integration refinements accepted by Codex

The pins carry only design state; words accompany all fact marks. Mobile uses one compact masthead with a Menu, then the task. Added-project plates use distinct room imagery, SVG plans and material studies with an illustrative label. The working sample and founder notes use separate keys. Approval evidence is explicitly issued; the request remains a draft. The common standing record now appears within the order paper as well as the room and account margin.
