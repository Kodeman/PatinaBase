# Patina round 3: review of the room schedule, editing, undo and client drafts

**Overall:** The direction is right. Opening the schedule in place inside the room, with five views over one shared set of lines and an inline line editor, does answer the worry about heavy work inside a document. But a few problems in undo, client-draft integrity and the screenshots need fixing before the founder sees it.

I read the code and looked at the three screenshots. I ran nothing. Findings marked **[Observed]** come from the screenshots; findings marked **[Code]** are what the code implies.

## Observed in screenshots

1. **The desktop pricing screenshot doesn't show pricing. Medium severity, high confidence.** The header reads "FF&E · Living room", so the schedule is open, but the page is still at the hero image. Either the scroll to the schedule ran after the capture, or it didn't run at all. Pricing on desktop can't be judged from this image, so it needs recapturing.
2. **The screenshots come from changed browser data, not the clean sample. Medium, high.** The brief says 80 lines with 36 in the living room. The screenshots show "81 lines across the job" and "Living room (37)". The specifications screenshot also shows the message "Reference attached to LR-36" while LR-02 is the line open. So the screenshots were taken after an earlier library action that the browser kept. Reset the sample, then recapture.
3. **The sample data looks copied from the first line. Low–medium, medium.** The Linen sofa (LR-02) shows the same "Natural finish / Oak / Natural / 8–10 weeks" as the Oak lounge chair. A founder will notice an oak linen sofa. New lines are built by copying the sample's first line (`addLine` clones `JobSeed.lines[0]`), and any field not reset carries over, possibly including issued prices or allowance flags.
4. **The line editor has an empty image box. Low, high.** A large blank beige panel sits beside LR-02's fields.
5. **Mobile pricing (taken before the header was compacted):**
   - A faint second line of text overlaps the header. Low, medium; it may be gone after the compaction.
   - The view tabs are cut off ("Purchas") with no sign they scroll sideways. Low–medium, high.
   - The first line row starts about 740px down the page, below several rows of controls. Medium, high.
   - The living-room table block sits flush against the left edge of the screen, outside the page margin. Low–medium, high.
   - The pricing table scrolls sideways on mobile. That's acceptable if phones are secondary, but tell the founder plainly.

## From the code

**Medium–High**
- **Undo replaces the entire saved job with a snapshot.** Any change made after a bulk action and within the 12 seconds the Undo button stays visible is silently lost when Undo is clicked. That includes saving or voiding a client draft and saving a change draft. Undo also deletes activity-record entries, and the undo itself isn't recorded. This conflicts with the prototype's "protected records" promise. Better: undo only the lines that action touched, and never roll back client drafts, change drafts or the record.

**Medium**
- **Paste and library add to the wrong room in the All rooms view.** `currentRoom()` falls back to Living room when the view is All rooms. So pasting into the Bedroom's add row, or pressing "/" there, puts the new lines in the Living room. The paste dialog does name the room, but the target is still wrong.
- **Voiding a client draft takes one click, with no confirmation and no undo.** "Void local draft" sits right next to "Print". A voided draft is kept in history but can't be brought back.
- **Every new or re-prepared client draft gets the same label, "PA—02 / local draft".** After voiding and preparing again, history holds several drafts with identical labels, so they can't be told apart.
- **The allowance dialog promises more than it does.** It says "the original working price will be preserved for undo", but the trade and client prices are cleared, and the only way back is the 12-second toast.
- **Return to the room reorders the document.** The overview always shows the last room worked on as the large spread and lists the others below. Rooms move around between visits, which works against the continuous document flow the user asked for. After "+ Freight", for example, the overview opens on the "Throughout" diagram.
- **"+ Freight / + Delivery / + Install" quietly switches the view.** They move you to the Throughout room with no message and don't update the address bar, so a user pricing the living room is pulled away.
- **Undo is inconsistent.** Remove, move, group, bulk markup, allowance and paste can be undone. Restoring a removed line, resolving a price conflict, adding labor or charges, attaching a library reference, saving a change draft and individual field edits cannot. Escape before saving is the only undo for field edits.

**Low–Medium**
- **The browser Back button misbehaves after Return to the room.** Closing the schedule replaces the history entry instead of adding one, so the next Back press visibly does nothing.
- **Escape on any focused non-input element closes the whole schedule** and jumps back to the overview. A user pressing Escape to leave a row loses their place.
- **Selections are cleared on every keystroke in "Find a line"** and on every filter change. You can't select lines and then narrow the list.
- **Focus is lost after some dialogs.** When one dialog replaces another (for example save draft → read draft), focus returns to a button that no longer exists.
- **Bulk markup runs even when no selected line qualifies.** It still takes an undo snapshot and reports "Applied to 0".
- **`refreshPrice` assumes the price-note and price-question rows exist.** If the mobile editor leaves them out, it will error.
- **Money values switch between whole dollars and cents** within a column, so the numbers don't line up.
- **Older browser data is never updated.** Saved data is accepted only if it has version 1, with no upgrade step, so returning reviewers won't see seed changes. Reset is the only way.

**What's sound**
- A changed trade cost asks whether to keep the client price or the markup, and locks both fields until answered.
- Released lines are protected from editing, moving and bulk actions; changes go through "Record a change".
- Client drafts are fixed snapshots, show a warning when the schedule has changed since, and leave out trade cost, markup and margin.
- Purchasing authorization covers the whole job and lists the excluded lines with reasons.
- Paste is reviewed before anything is added.
- Return to the room puts focus back on that room's open button.

## Does it solve the dense-operations concern?

Mostly, on desktop:
- The schedule stays in the document, with the room's name in the header.
- Lines open in place, and "Next unfinished line" moves through the work.
- Bulk actions skip protected lines and say so.
- Purchasing authorization and the finish schedule are separated correctly.

It falls short in three places. A large open line editor pushes the rest of the table far down the page. The overview reorders on every return. And mobile pricing is buried under controls and needs sideways scrolling.

## Agreed direction

Keep the model: the schedule opens in place, the five views share one set of lines, purchasing authorization covers the whole job, finishes stay on room surfaces, released lines change only through recorded changes, and client drafts are fixed and voidable.

## Fix before the founder review

1. Undo only the lines each action touched; never roll back client drafts, change drafts or the record. Record undo actions too.
2. Send paste and library additions to the room whose add row was used, not to `currentRoom()`.
3. Ask for confirmation before voiding a client draft, and number drafts uniquely (PA-02a, PA-02b…).
4. Make new lines from a blank template rather than a copy of the first line. Then fix the copied sample data (oak sofa).
5. Keep room order fixed on the overview. Show where you were with highlight and scroll, not by moving rooms.
6. Recapture all screenshots after a reset. Make sure desktop pricing actually shows the pricing table.
7. Mobile: show that the view tabs scroll, fold the room, show and find controls into one row, and fix the table that runs to the screen edge.
8. Correct the allowance dialog's undo wording.
