# Room Proof 08 follow-up review

Most of the round-one problems are fixed in the code. I found one new high-severity bug: a studio reply to Nora is addressed to Northline. The care-book return also still doesn't work, and a few small items remain. I only read the code; nothing was run in a browser.

## Fixed, checked in the code

- **H1, studio save deleting the job's notes:** fixed. `JobSeed.notes` in `data.js` now holds the four seed notes, and `whole-data.js` adds the four inbox notes. The studio loads the same scripts, so on a fresh browser it writes the full seed.
- **H2, proposal rewriting the SA-014 baseline:** fixed. The cover, index, brief heading, service chips and acceptance scope all read `seed.scope`. The proposal appears only in the editor and the labelled warning.
- **H3, IS-03 contents changing:** fixed. `cabinetRecords()` is constant, and the overview and maker copy name Ana / GC. KD-401/A appears only as a proposed route.
- **H4, duplicate CH-01:** fixed. Furniture changes are now numbered `FC-xx`.
- **M2, desk and job disagreeing about a proposal:** fixed. Both use the shared `proposedScopeDiffers`, which counts role-only edits.
- **M3, fabrication purpose on the cabinet draft:** fixed. "For fabrication" is disabled.
- **M5, inbox threads missing from the job:** fixed. Message bodies and draft status now come from the job's notes.
- **Small items fixed:**
  - L2: one shared time seed.
  - L4: draft status survives reset correctly.
  - L7: voiding an invoice draft releases its time.
  - Initials for Ana and Leah.
  - The founder-review link in the studio footer.
  - The `CP-DRAFT-01` padding.
  - The funding count is calculated; the "80 lines" and "Install in February" text now follows the record.
- **Mostly fixed:** M1 (TS-04 now says it's GC-appointed and for coordination only), M4 and M6. Details are below.

## Remaining findings

**High**

**N1. A studio reply to Nora is addressed to Northline.** Confidence: high.
- **Where:** the thread-draft handler in `studio.js` (line 71) sets the recipient to `site → 'Ana / GC'`, `foundry → 'Foundry'`, and `'Northline'` for everything else, including `nora`.
- **Effect:** the job then shows the client draft on LR-36 as "To Northline · not sent". Its local preview reads "To: Northline · Line LR-36 …", even though the studio form says "Leah / studio → Nora & Eli".
- **Fix:** add `nora: 'Nora & Eli'` to the recipient map, alongside the audience map that's already there.

**Medium**

**N2. "Return to the care book" goes to the living-room overview instead.** Confidence: high from the code order.
- **Where:** in `whole.js`, `care-return` calls `J.close()` and then `move('#care-work')`. `J.close()` (`job.js` line 30) schedules a `requestAnimationFrame` that scrolls to `#room-living` and focuses its button. That runs after `move()`, so it wins. This happens for both the LR-05 and the A-201 links.
- **Also:**
  - The URL keeps `?scene=spec&line=LR-05`, so reloading reopens the sheet.
  - On the A-201 path the drawing bench stays open.
  - The fixed return bar stays on screen if you navigate some other way.
- **Fix:** move to `#care-work` inside a later rAF, or skip `J.close()` when the sheet isn't open. Also reset the URL and the design view.

**Low**

These are high confidence unless noted.
- **L-a. Foundry's message appears twice in the CP-01 thread.** It's there as a hard-coded article and again as `N-inbox-foundry`, in different words. Remove the hard-coded copy.
- **L-b. The baseline is called a proposal in the package margin.** With no proposal open, it says "Ana / GC is the proposed instruction owner." The scope gaps shown under the held package aren't labelled as coming from the proposal. Change the wording only when `scopeChanged()` is true.
- **L-c. Cabinet package drafts don't say they depend on the unsigned proposal.** A draft can freeze KD-401/A without saying so. "For pricing" drafts, and the design.js TS-04 pricing set, also go straight to Sam, although Ana / GC holds SC-01 and TS-04. Confidence: medium; this is a workflow judgement.
- **L-d. Studio Books shows the wrong next step for some orders.** For an order marked "Difference to resolve", the Next evidence column shows the acknowledgement reference and its ETA. S-03 also takes `ack.eta` from a differing acknowledgement. Check `ack.status === 'matching'` first.
- **L-e. The return-to-studio link can be stale.** The origin stays in sessionStorage, so arriving at the job from index.html can still label the link "← Correspondence". Clear it on use or compare the referrer.
- **L-f. A proposal identical to the baseline still counts as a proposal.** Pick a non-full preset, then edit every field back to the baseline values: `type` still differs, so it reads "Cabinetry design & package / tailored". Set the type to `custom` when fields are edited, or drop `type` from the diff.
- **L-g. Names and fixed text left over:**
  - "Northline Carpentry" (`DesignSeed.parties`) vs "Northline Cabinetry".
  - "Ellis Receiving" (design.js roster) vs "White Glove Receiving".
  - "signed SA014" on the desk.
  - Fixed counts: "36 schedule lines" (cover), "36 working lines" (studio search), "36 living-room FF&E lines" (design.js).
- **L-h. The job's notes composer can't draft to GC or the supplier.** It only offers private, client and maker. The summary counts don't include gc or supplier either.
- **L-i. LR-36 can be recorded as "bought already".** That conflicts with TS-04 being the console's contracting route. Confidence: medium; this may be intentionally permissive.

## Deliberate limitations, not bugs

Writes between tabs aren't merged, and fictional acceptance and authority can't be recorded. LR-36 can't reach an order, because `readiness` requires authority, funding and terms facts it doesn't have.
