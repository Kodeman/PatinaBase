I found no blocking problems and nothing that misstates authority, money or release. The approved identity holds: the room keeps the weight on the left and its standing and work sit on the right. The approval screen now shows the issued Rev B before the form, and the request is labelled "Draft approval request", so it doesn't look issued. Round 2 has its own state key (`app.js:3`). The two links that promised an authority screen are gone: the accounts version was removed with its margin note, and the order link now reads "Review the design decision". The five extra projects are labelled illustrative and none of them reuses the Mendota photograph. Accounts, orders and time now have compact 35px headings, and all six financial readings fit above 900px. On mobile, the time form and the receipt action are on the first screen.

The findings below are ranked by severity. "Observed" means I saw it in a screenshot or the code; "inferred" means I reasoned it from code without seeing it on screen.

### Medium

**1. The desk doesn't put the most urgent work first, and it only covers two of the six projects.** Observed (desk.jpg; `round2.js:31-34`). The list runs 28 Oct, 10 Nov, Today, Today, so the two items due today come third and fourth. The four tasks are hardcoded for Mendota and Oak only. Ridge House shows the earliest date on the contact sheet (23 Oct, "Review the walnut sample") but has no task. That weakens the brief's test: "find the next action across six projects".
*Fix:* sort by due date and add one illustrative task each for Ridge, June, Monroe and Cedar, using the `next` values already in the `projects` array.

**2. Time & billing has no place in either navigation bar.** Observed (hours.jpg; `mockup.html:8,11`; `app.js:49`). The time view counts as part of the project (the selector reads "Lake Mendota House" and the project row shows), but the desktop project row has no Time item, so nothing is highlighted. You can only reach it through Books ▾ "Mendota time", and a closed `<details>` summary never gets `aria-current`. Purchase orders has the same problem: no marker anywhere. The mobile section menu does include "Time", so the two navigations disagree.
*Fix:* add "Time" to `.project-sections`, and mark the Books summary as current when one of its items is active.

**3. On mobile, the room's decision action isn't on the first screen.** Observed (mobile-project.jpg). At 390×844 you can see the image, the selected piece, "Design review needed" and an outlined secondary button, "Open the piece proof". The action that moves the decision forward ("Open the design review") is further down in Current standing. I'm only claiming it's not on the first screen; it can be scrolled to. Agreed refinement 8 asks for the primary action without scrolling.
*Fix:* on mobile, place the standing's action next to the piece state and style it as primary, or make the piece-proof button the clearly labelled primary for this task.

**4. The selected pin can be mistaken for "Approved".** Observed (mobile-project.jpg; `core.css` `.core-pin[aria-pressed=true]{background:#355267}`). The selected pin 01 is filled dark blue. Right below it, the legend uses a filled dark circle for "Approved". The "Money received" mark is the same blue fill. So in the review-needed state, the most prominent pin looks agreed.
*Fix:* show selection with a ring or offset outline only, and keep the fill for the decision state.

**5. On Accounts, the deposit card still outweighs the authority fact.** Observed (accounts.jpg; `round2.js:92-93`). $6,000.00 now appears twice in the margin: once as a 13px standing line, then again as a 35px Playfair figure directly under "Purchase authority: Not recorded". In concise mode the card's only qualifying sentence, "A received deposit does not authorize a purchase.", is hidden. The brief said the deposit card must not compete with purchase authority; visually it now does.
*Fix:* either drop the standing's money row on Accounts or make the card's figure ledger-sized. Keep the qualifying sentence while the large figure remains.

### Low to medium

**6. Mobile type is small, and form fields are likely to trigger iOS zoom.** The sizes are observed in `round2.css`; the zoom is inferred. The project selector is 10px (line 24), the pin legend and room caption 9–10px, the object-index notes 10px, and the time fields 13px (line 17). iOS Safari zooms in when you tap a form field set below 16px, so the selector and the time entry will likely jump.
*Fix:* make the selector and fields 16px, and keep labels at 11px or above.

**7. On desktop, the margin doesn't say whether the selected piece is in the review.** Inferred from code. `round2.css:25` hides `.round-piece-state` on desktop, so the margin shows only the project-wide standing. If you select a reference-only piece, the margin still shows "Design: Review needed" and "Order release held", with nothing saying this piece isn't included.
*Fix:* show the piece state line on desktop as well.

**8. The order's top summary doesn't say who acts next, and doesn't show a stale draft.** Observed for the first part (orders.jpg); inferred for the second (`sourcing-views.js:134`). The summary gives the state and the blocking items but no responsible person, which the brief asked for. Its text is fixed, so a stale PO-024 draft still reads only "Release held". The "differs from the current specification" warning appears below the release checks, below the fold.
*Fix:* add the next action and person (for example "Leah · send Rev B to Nora"), and add a stale-draft line to the summary.

### Low

**9. The specimen label is the faintest text on each states card.** Observed (states.jpg). "Specimen: not a working state" is 10px grey, while the card title ("Authorized, still held") is bold. The release text also reads as fragments: "purchase authority · deposit allocation." starts lowercase, and the third card says only "deposit allocation." (`round2.js:23`).
*Fix:* make the label at least as strong as the title, and write it as a sentence, e.g. "Still open: purchase authority, deposit allocation."

**10. The Oak Street tile is blank in the desk capture.** Observed (desk.jpg), cause unconfirmed. The same image loads on the Oak Street page, so this is probably the capture firing before a lazy-loaded image appeared.
*Fix:* remove `loading="lazy"` from the first-screen tiles and recapture before the presentation.

**11. Several controls are tied to Mendota whatever project you're in.** Observed (`mockup.html:8,14`; mobile-orders.jpg). Books lists "Mendota account" and "Mendota time" as studio-wide items. The mobile dock's "Room" always opens Mendota, even from the Oak Street overview. On mobile Receiving, the selector says "All studio projects" while the record above it reads "Oak Street Apartment / PO-021".

**12. Receiving pre-selects "Received clean".** Observed (`sourcing-views.js:149`), carried over from the original logic rather than introduced by Codex. The mobile task now puts "Record receipt" one tap away, so a clean receipt can be recorded without an explicit choice. Worth deciding on.

**13. Small items**, all observed:
- The "Receive the linen sofa" task names no person.
- The mobile rate dropdown is cut off at "Design · $150 / hou".
- The footer's "Design presentation" and "Reset example" are presentation controls sitting inside the product frame, which DESIGN-PLAN.md says should live outside it.
- Hours shows two dark primary buttons ("Record time", "Draft an invoice").

### Safety distinctions

These held up, observed in code. Concise mode hides only background explanations. The decision points keep their consequence language: the approval-response line "A design decision does not authorize a purchase…" (`core-views.js:122`) stays visible. The order summary matches the three release checks listed in the order. Changing the specification clears both approval and authority (`app.js:40`), so "Current edition approved" can't sit alongside a changed selection.
