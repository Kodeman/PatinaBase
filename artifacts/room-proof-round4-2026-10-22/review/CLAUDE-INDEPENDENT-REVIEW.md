I've finished reading the five scripts and both HTML pages. Below are the review findings.

# Round-four Patina prototype review: approve with fixes

The core rules hold up. Client approvals are kept separate from authority, funding and orders. Review and order snapshots are frozen copies. Unsent drafts are clearly labelled. Notes keep studio, client and maker messages apart, and none of the three leak onto the client paper. The problems are in three places:
- **Which review edition an answer counts against.** A client can answer an out-of-date edition and nothing reflects it.
- **The round-three "return to your place" rule.** It breaks for the new ways into the sheet.
- **Text the user has typed but not saved.** Several re-renders throw it away.

I could not check `data.js`, `sheet.js` or `init.js` (out of scope), so findings that depend on seed values say so.

## Medium

**M1. Answers recorded on an out-of-date review are kept but never count.** High confidence.
- **Cause:** `decision()` only looks at the latest review that contains the line (commerce.js:11). But the edition dropdown lets the client answer any edition (:43, :85), and older editions are never marked as replaced.
- **Steps:** choose items for a new review, include LR-03 (unanswered in IR-03), save IR-04. Switch to IR-03, preview the client paper, approve LR-03.
- **Result:** the log and the line's approval field both say "Approved". Purchasing and the approval count still say "Awaiting response".
- This contradicts the claim "Each answer belongs to the exact edition the client saw."

**M2. The purchasing-authorization draft ignores item decisions.** Medium confidence (depends on seed data).
- `eligible()` and `blockers()` (job.js:15–16) never call `Commerce.decision`. A line marked "Pause to discuss", "Changes requested", changed since review, or never reviewed can still go into the PA—02 draft if it is selected and priced. LR-02 is a likely example if the seed has it selected and priced.
- That breaks the sequence the page itself shows: approval → authority.

**M3. The Back button breaks for the new scenes.** High confidence.
- The `popstate` handler (actions.js:75) only knows the old sheet views (lenses). For `scene=review|client|notes|order` it falls into `J.open('rough')`.
- **Steps:** load `?scene=review`, open the schedule, press Back. The rough sheet opens instead of the approvals chapter.
- Separately, `openLine` and the note jumps never update the URL, so Back leaves the page entirely.

**M4. Closing the sheet loses where you came from.** High confidence.
- `openLine` (commerce.js:60) and the line/order jumps in notes.js:179–180 open the sheet, but "Return to the room" (`J.close`, job.js:30) always scrolls to `#room-<room>`.
- Opening a line from the review ledger, the correspondence record, or the purchasing table's decision link (`review-line`, :69, which also doesn't close the sheet) drops the user back at the room list, not at the row they started from.
- This is the same-place return the user approved in round three.

**M5. Typed client text is lost on re-render.** High confidence.
- "Save sample reply" (:71) restores form fields from `FormData`, but the reply boxes (`data-client-comment`) have no `name`. Unsaved replies on other items are wiped, and all open "Conversation" sections collapse.
- On a successful "Record sample decisions", a note typed on an item with no answer chosen is skipped (`if(!outcome)continue`) and then wiped by `refresh()`. Nothing tells the user.
- Changing the edition or toggling the client preview also drops unsaved radio choices.

**M6. Order notes collapse and lose text on every order action.** High confidence.
- `Notes.order` doesn't remember open/closed state, and `J.renderSheet` replaces the order paper before `Notes.refresh` can save typed text. In `refresh()` the render also runs before the notes refresh (:58).
- **Steps:** open PO-01, unfold its notes, type a draft, click "Preview maker copy". The text is gone and the section is folded.

## Low

- **L1. The approval count includes changed lines** (:36). Change LR-01's finish and the header still reads "2 of 6 approved".
- **L2. Voided orders say "Awaiting acknowledgment".** The order register (:50) only checks for `Draft`. Prepare an order, then void it, to see it.
- **L3. Damaged units count as received** (:87, :90). There is no way to receive a replacement, and "Receiving exception" stays forever. Claims are an explicit future item, but blocking the replacement quantity is a modelling fault.
- **L4. Fractional receipts drift.** Receipt totals are added as floats, and the 0.01 step allows fractions. Receive 0.1, then 0.2, on a 3-unit line: the remaining shows 2.6999999999999997 and entering 2.7 is rejected.
- **L5. The review builder accepts any line that isn't released** (:44), including unpriced, candidate, alternate, allowance and labor lines. The client then sees "$— each" next to "Approve this item", although the page says approval "records the design and client price shown."
- **L6. "Draft a reply to the maker"** (:79) gives no toast and its notes section stays folded. Each click adds a duplicate. It also copies the internal "Difference / note" word for word into a draft addressed to the maker.
- **L7. A changed item hides the client's earlier answer** (:43). The frozen specs stay, but "Approved · 21 October" disappears from the client paper.
- **L8. Some changes don't mark the review as changed:**
  - Moving a line to another room: room isn't part of the change check (workflow-data.js:3).
  - Editing a line and then reverting it brings the old decision back, while the line's approval field still says "Needs new review".
- **L9. The order send step doesn't recheck everything.** `dispatch-order` (:77) and the order paper don't recheck removal, decision or authority; they only check the frozen copy and trade cost. This can't happen yet, because only released lines can become ready.
- **L10. Selected purchasing lines stay selected after a room change** (actions.js:66 doesn't clear them), so the order button can count lines you can't see. Lines that stop being ready are silently left out of the order (:76).
- **L11. The margin note is misattributed** (job.html:17). "Keep the north-wall console under 16 inches deep" is credited to "Leah, studio note", but the data has it as Nora's client request (IR-03 and N-seed-1).
- **L12. Presentation question.** No line approved in the client review can ever become ready to order: authority and funding are only seeded for released lines, and nothing in the UI records them. The purchasing intro says so, but index.html question 4 ("follow a line from approval to order") invites a test that can't succeed. Either aim it at a released line or add a fixture to record authority and funding.

## Mockup limits, not faults

Fixture authority and funding, no claim resolution, a single conversation thread with no studio replies on the client paper, the maker copy leaving out product and dimension fields, and fixed order terms are all disclosed or reasonable for this stage. No sending, signing, funding or payment is implied anywhere I read. Escaping was consistent.

## Recommendation

Before the founder session, fix M1 (mark replaced editions read-only), M3–M4 (Back button and return-to-origin), and M5–M6 (keep typed text and open sections across re-renders). M2 needs a design decision: should authorization require each item's approval?
