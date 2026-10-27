# Room Proof — next design round

21 October 2026 · Design brief following an independent Claude Code review

**Keep the approved Room Proof direction. Give it a clearer working structure.** The next round should retain the room’s visual weight on the left, the project’s decisions and next steps on the right, Patina’s typography, and the paper character. Its purpose is to show that this can remain beautiful when a studio is busy.

This is a brief for the next round, not an implemented redesign. No portal code or existing mockups were changed. The full independent critique is in [Claude’s review](CLAUDE-REVIEW.md); read it alongside the [corrections and review limits](README.md).

## What we are protecting

- The room photograph, numbered objects and working margin: a designer enters through the actual room and follows a piece into its specification and decision record.
- Different compositions for different work: the agreement as a letter, the specification book as a publication, the purchase order as a sheet, the account as a ledger. These are stronger than applying one reusable card layout everywhere.
- Playfair, Inter and restrained reference notation; warm paper, charcoal, fine rules, authored notes and material imagery.
- Exact issued editions, named reviewers, preserved decision history, and previews of consequences before a commitment.
- Separate facts for design agreement, authority to purchase, money received, vendor obligations and order release.

## Decisions from the critique

| Claude’s recommendation | Direction for the next round |
| --- | --- |
| Simplify the navigation and clarify project scope. | **Accept.** Prototype a compact global bar with a project selector, direct Inbox access and studio destinations; put project sections in one contextual row. Include Agreement. Compare removing the desktop dock, rather than assume its removal is automatically better. Keep local tabs subordinate to their document. |
| Replace repeated warnings with a consistent standing component. | **Adapt.** Give independent facts a stable place in the working margin, then show release as an outcome with its actual blocking reasons. Avoid a progress chain that implies design approval grants purchasing authority or that a deposit clears release. Draw a comparison version with repeated background explanations removed; keep explicit scope and consequence language at decision points, then test comprehension. |
| Give operational screens smaller headings. | **Accept.** Keep expressive display typography on the room and presentation documents. Use compact titles, plain section labels and stronger state hierarchy for accounts, orders and time. A meaningful live figure may still earn larger type. Preserve readable body type and space between meaningful groups. |
| Make the room reveal the state of its pieces. | **Adapt.** Give each pin one clearly explained decision state. Put richer design, authority, order and arrival details in the object index and selected-piece margin. Do not encode five independent facts in a tiny pin. |
| Show the approval evidence before the form. | **Accept with precise wording.** The left side should show the existing issued revision and its pieces. Put the question, reviewers, deadline and scope on the right. An unsaved draft must not look issued or frozen. |
| Make the desk work across several projects. | **Accept as a design stress test.** Use six fictional projects and a compact room contact sheet on the left. On the right, show next actions with a verb, object, responsible person, project and due date. This explores layout; it does not authorize new backend features. |
| Replace mobile reflow with task-specific screens. | **Accept.** Concentrate on checking a room decision, recording time and receiving an item. Keep the desktop’s character while changing the information order. |
| Introduce a week grid, a purchase-authority document and new global state marks everywhere. | **Defer those as product decisions.** First validate navigation, scope and the existing states. A week grid is a hypothesis, not a requirement. Future authority/release states can be clearly labelled static specimens until mapped to verified current behavior. |

## Six desktop scenes to redraw

### 1. The studio desk — several rooms, one working day

Keep the left/right balance, with a contact sheet of six active rooms on the left and the cross-project work list on the right. One room may receive a larger plate; avoid six interchangeable dashboard cards. Every action names the project, person and deadline. A project selector makes moving into a room explicit.

**Compare:** today’s single-room hero against the contact sheet. Can a designer find the most urgent work and enter a different project without hunting?

### 2. The room — visual context and visible decisions

Keep the large photograph. Bring the current room, selected piece and next decision into view sooner by simplifying the header. The right margin should clearly distinguish the designer’s authored note from the next required action and the current state. Make the piece index useful as a small room schedule, retaining a clear relationship to the photograph.

Show three examples: awaiting a design decision; design approved while purchasing remains unauthorized; a changed specification with the previous approved edition retained. The middle state already works in the current prototype and needs better presentation, not new business logic.

**Compare:** whether the founder can explain what changed, who acts next, and which record that action applies to.

### 3. The approval — the issued evidence is the subject

Put the issued room revision and included pieces on the left. Place the approval question, two reviewers, named decision lead, due date and scope on the right. Distinguish preparation, issued request and recorded response through document treatment and plain labels. Keep the exact evidence available in every state.

**Compare:** today’s form-first create screen against the evidence-first composition. Can reviewers identify the edition and explain what their approval does and does not authorize?

### 4. Accounts — a calm, readable ledger

Use a compact project title and explicit scope. Give the six financial readings enough visual proximity to be understood together. The received-deposit paper can remain, but it must not compete with or imply purchase authority. Place the relevant next action beside the unresolved fact.

**Compare:** the current large headline treatment with a working ledger at the same viewport. Aim to show the six readings and key next action at 1440 × 900 without shrinking the body copy. Treat that as a design target to test, not a reason to cram long content.

### 5. Orders — register on the left, the selected commitment on the right

Preserve the separate order sheet. Make studio-versus-project scope unmistakable. Put the release state, exact blocking reason and next responsible action near the top of the selected order. Distinguish a stale draft from an order held for missing authority. Keep receiving records attached to the correct project.

**Compare:** whether a designer can answer “Can this order be released, and what is missing?” without reading the whole page. If a released/in-transit example is shown, identify it as a separate sample order; do not imply the held Mendota order was released.

### 6. Time — immediate entry and legible billing state

Keep the ruled ledger and the separate unpriced-time explanation. Give “Record time” an immediate, predictable location. Show project scope explicitly and reduce the display-heading footprint. Preserve the distinction between recorded, priced, reserved in a draft and invoiced time.

**Compare:** the current layout with a compact working version using several projects and long task descriptions. Test a weekly layout only if designers say it matches their work.

## Three mobile tasks

1. **Check a room decision:** project context, useful room image, selected piece, current decision and primary action. Avoid stacking multiple horizontal navigation rows before the room.
2. **Record time:** project, duration, description and billing state presented vertically, with an obvious save action. Financial meaning must not depend on columns off-screen.
3. **Receive an item:** identify the order and expected item, then show quantity, condition and the next action. Keep the task separate from releasing an order.

At 390 × 844, the task and its main action should be apparent on the first screen. Further evidence can scroll. Preserve readable labels, touch targets and access to details; do not solve the problem with smaller type.

## How the founders should review the next presentation

Show current and proposed versions at identical sizes, with presentation controls outside the product frame. Include the repeated-explanation comparison and clearly labelled specimens for authorized-but-held and released orders; those are design examples, not newly implemented actions. Use the same sample data for comparisons. Start with the room so the approved identity is the reference, then the busy desk and the compact ledger, then the three mobile tasks.

Ask designers to do three things before asking which treatment they prefer:

- Find the next action across six projects and move to a different room.
- Explain why an approved design with a received deposit can still have a held purchase order.
- Record time or review a delivery on mobile without missing billing or order state.

Observe accuracy, navigation errors and time to find the action. Then ask whether the new screens still feel like Patina and where the editorial voice helps or interrupts work. These are proposed tests; no user testing has yet been performed.

## Scope of the next round

Six desktop scenes, three mobile task views, and the named state variations. Keep Library, Piece proof, Engagement, Spec book, People and Schedule visually stable except where the common navigation or state treatment requires adjustment. Inbox’s contextual subject preview is a useful subsequent refinement, after the shared structure is settled.

This brief integrates the critique into a concrete next round. It does not change production, add authorization flows, remove important decision language, or rebuild the existing prototype in this review session.
