# Room Proof 08: integration review

I found four high-severity integration bugs. Each one weakens a promise the mockup states on screen: one shared record across studio and job, a signed baseline that a proposal can't rewrite, issue contents that stay fixed, and record IDs that stay unique.

The separation between client approval, purchasing authority, funding and readiness holds up well. So do the fictional acceptance fixtures. I read the code only; nothing was run in a browser. Severity is my judgement of the impact on the mockup's integrity.

## High

**H1. Saving a draft in the studio first permanently deletes the job's seeded conversation.** Confidence: high.
- **Where:** the studio's thread-draft submit handler in `studio.js`. On a fresh browser `job()` returns `window.JobSeed`, which has no `notes`. The handler then writes `notes:[draft]` and `version:1` to the job's storage key. When the job opens, `Notes.init()` in `notes.js` only seeds notes if none exist, so it skips seeding.
- **Reproduce:** clear storage → studio Correspondence → Nora thread → type a reply → Save unsent reply → open LR-36 on the job. Nora's original request (N-seed-1), the studio note and Northline's COM note are gone. Only a reset brings them back.
- **Fix:** before writing, if the stored job record is missing, seed its notes the same way `notes.js` does. Better, move the notes seed into the shared data so both pages start from it.

**H2. A scope proposal changes how the signed SA-014 baseline reads.** Confidence: high.
- **Where:** `whole.js`.
  - `renderScope()` writes the proposal's label into the cover (`#cover-arrangement`), the side index (`#index-scope`) and the brief heading and service chips.
  - `renderAcceptance()` labels the current state "SA-014 edition 01" but lists the proposal's services. Its "Held" reasons also come from the proposal's gaps.
- **Reproduce:** Brief → unfold the arrangement → choose "Design package / client implements". The cover now shows that label as the job's arrangement. Acceptance reads "SA-014 edition 01 … Included scope: Design & agreed handoff", while the brief margin still says "SA-014 / full service". The Maple Street brief's "Explore these arrangements on the Lake Mendota sample" link invites exactly this.
- **Fix:** keep a frozen baseline object for SA-014. Draw the cover, index and acceptance from it. Show the proposal in a separate, labelled "unsigned proposal" block with a diff against the baseline.

**H3. The "held" IS-03 issue contents change when the proposal changes.** Confidence: high.
- **Where:** `whole.js`. `cabinetRecords()` reads `state.scope.drawing`. The evidence chain and the overview's "Instruction owner" and "Purchasing route" also read the proposal.
- **Reproduce:** set Drawing development to "Designer details; maker verifies" and save → unfold CP-01. The table headed "Exact contents of held issue IS-03" now lists KD-401/A instead of KS-101/B. The overview also names the proposed instruction owner as if it applied to the held issue.
- **Fix:** make IS-03 a constant record (its drawings, recipient, instructing party and receipt). Show proposal-dependent rows only in drafts or a column marked "proposed".

**H4. Two different records can both be called CH-01.** Confidence: high.
- **Where:** `save-change` in `actions.js` numbers FF&E change drafts `CH-${n}` from `changeDrafts`. That list doesn't include the CP-01 hardware change, which is the fixed CH-01 in `whole.js` and the studio.
- **Reproduce:** `job.html?scene=change` → save the LR-05 change → the record shows "CH-01 · change proposed for LR-05".
- **Fix:** give each kind its own prefix (for example `FC-01` for FF&E line changes and `CP-01/CH-01` for the package), or add the package's CH-01 to the same sequence.

## Medium

**M1. Northline and Sam have two appointments that don't agree.** Confidence: high that it's inconsistent, medium on what you intended.
- **Where:** `design.js` (`studioSite`, `fieldSite`) and the `people` list in `studio.js`.
  - `design.js` says Northline *Carpentry* has TS-04 to fabricate and install the living-room console, with IS-02 issued to "Sam Ortiz · carpenter" and payment "per the number agreed with the studio".
  - The `people` entry for Northline Cabinetry says only "Appointed to CP-01 by the GC".
  - LR-36 is still an unpriced FF&E candidate inside the studio furnishings subtotal.
- **Why it matters:** the specimen never says who contracts TS-04 or whose budget the console belongs to.
- **Fix:** add TS-04 to People and the scope editor with its contracting party and budget route. Mark LR-36 as custom work by that trade. Use one name for the company and for Sam.

**M2. The studio desk and the job disagree about whether a proposal exists.** Confidence: high.
- **Where:** `desk()` in `studio.js` checks only `type` and the five service checkboxes. `whole.js` compares the whole scope object.
- **Reproduce:** change "Contracts the maker" and save. The job shows the proposal warning; the desk shows nothing.
- **Related:** an edited proposal keeps its preset's type and label, so the warning reads "Scope proposal … Full service with a building team".
- **Fix:** share one check that diffs against the baseline. When any field is edited, set the type to `custom` and the label to "Tailored from …".

**M3. A cabinet package draft can be marked "For fabrication" while CH-01 is unresolved.** Confidence: high.
- **Where:** the issue form in `renderCabinet()` in `whole.js`. `design.js` blocks a production purpose while the console is unverified; the cabinet form doesn't.
- **Fix:** disable that purpose and list the blockers (CH-01, drilling impact, price and time).

**M4. Drafts to the GC and the supplier are filed as maker correspondence.** Confidence: high.
- **Where:** the studio thread-draft handler (Ana and Foundry threads) and `cabinet-note-form` in `whole.js` (GC audience) both store `audience:'maker'`. `notes.js` then shows "To maker · not sent".
- **Fix:** add GC and supplier audiences, or store the recipient's role.

**M5. Studio inbox threads aren't part of the job's record.** Confidence: high.
- **Where:** the `threads` list in `studio.js` is hard-coded.
- **Effect:** Nora's 22 Oct message, Morgan's message to the studio and Ana's site message don't exist in the job's notes. The job has Nora's message on 19 Oct and Foundry → Northline on 22 Oct. The studio shows a received client message the job doesn't contain.
- **Fix:** add the received threads to the job notes with a scope and ID, and have the studio read them from there.

**M6. Going back from the job loses where you came from.** Confidence: high.
- **Where:**
  - The job's "← Studio" link always goes to the desk, even when you arrived from Books → Orders or a correspondence thread.
  - In the care book (`renderCare`), the LR-05 and A-201 links don't record an origin, so their return buttons go to the room or design overview, not back to closeout.
- The browser's Back button still works.
- **Fix:** pass a `from=` parameter and label the return link ("← Studio books"). Record an origin for links inside `#closeout`.

## Low

These are all high confidence.

- **L1. Studio Books → Orders shows the wrong next step for some orders.** Draft and Voided orders read "Maker acknowledgement pending". Reuse the status logic from the job's own order register in `commerce.js`.
- **L2. Two copies of the time seed with different wording.** The studio's fallback in `whole()` differs from the `whole.js` seed ("Cabinetry coordination" vs "Cabinet maker coordination"; "Internal studio planning" vs "Internal studio filing"). Move it to one shared file.
- **L3. The receiver has two names.** "White Glove Receiving" in People (contact "Ellis / scheduling") is "Ellis Receiving" in the schedule and the site roster. It also collides with the clients' surname.
- **L4. Reset leaves stale studio drafts.** Reset removes the studio drafts from the job notes, but the studio thread list still says "Draft saved". Clear them on reset, or work out draft status from the job notes.
- **L5. Fixed text that doesn't follow the record:**
  - "36 schedule lines" (job cover) and "36 working lines" (studio search).
  - "80-line furnishing subtotal" (Books → Orders note).
  - "Install in February" and "Install in 16 weeks".
  - "7 of 8 lines funded".
  - The read-only S-03 delivery date isn't taken from the PO-01 acknowledgement date.
  - The desk's `||80` and `||36` fallbacks hide a real zero.
- **L6. Small mismatches:**
  - The studio footer links to `index.html#review`, but that section's id is `founder-review`.
  - Initials are wrong for Ana Cruz ("AR") and Leah Martin ("LH").
  - "SA014" vs "SA-014".
  - The `T-` prefix is shared by time entries and site tasks.
  - `CP-DRAFT-1` isn't zero-padded.
- **L7. Product depth, not a bug:** time allocated to an unsent invoice draft can't be released, because drafts can't be voided.

**Deliberately limited, not bugs:** new lines can't reach "ready to buy" because authority and funding can't be recorded; storage has no merge, so one tab per job; there are no sends, signatures or payments.

## What works well

- **Purchasing gates:** `Commerce.readiness` keeps client approval, authority, funding, terms and existing orders as separate checks. Review editions freeze each item and go stale when it changes. Order dispatch re-checks that nothing has changed. Released lines can only change through "Record a change".
- **Drawing drafts:** saved drawing-set drafts (DS-xx) freeze their exact revisions and warn when A-201 moves on. Field observations don't change drawings or scope.
- **Acceptance:** Nora and Eli are fixed as the two required signatories. The later-state examples are clearly labelled fictional, don't touch the current job or the desk, and completion stays disabled except in the "both accepted" example. Trade acceptance is a separate record.
- **Money:** CP-01 stays out of the FF&E subtotal and fee invoices in every view. Fee drafts never change the issued $8,400 / $6,000 / $2,400 in either the studio or the job. Studio Books reads the same stored orders and time as the job.
- **Return-to-context inside the job:** folding the cabinet package restores your scroll position and focus, and the review and design trails return to where you started. The library handoff rewrites the URL so a reload doesn't add the chair twice.
