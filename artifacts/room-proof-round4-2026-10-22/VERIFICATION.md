# Round-four verification

22 October 2026. Static HTML/CSS/JavaScript artifact only. No portal, service, migration or production file changed. Verification used Chrome through the computer-use tools against a loopback-only static server. Prototype interactions used fictional data and were reset afterward.

## Browser interactions checked

- All eight presentation scene buttons load their correct job scene. Embedded and full-size entry points share the same sample.
- Client review starts with six selections and mixed outcomes. Approve one item and request changes on another. Missing required change reason leaves answers intact.
- Client reply does not record a decision. Unsaved radios/reasons survive reply saving; unsaved reply text and open conversations survive studio/client toggling.
- Client paper excludes private studio notes and internal trade figures; maker copy uses order costs without client selling values.
- A changed client price leaves the old snapshot intact and flags it as changed. A fresh review uses the new price. A newer review makes an older unanswered item read-only.
- Contextual specification opens show a return to the originating review; closing focuses that review row. Browser Back restores the review route instead of opening a rough sheet.
- Private note and unsent client draft saved on LR-36; history and notes survived reload. Order note text/open state survived a maker-copy change.
- Purchasing shows five ready lines across all rooms. Approval alone leaves authority/funding/terms holds visible. The authorization draft admits two approved, selected, priced sample lines and excludes 70, with eight earlier released lines separate.
- LR-12 and BR-03 group into one Still Light order with a $908 subtotal. Maker preview, local dispatch, discrepancy reason validation, order-linked unsent reply, matching acknowledgment and partial delivery exercised.
- A quantity above remaining is rejected; damage requires a note; damage produces a visible receiving exception. Issued order values stay intact. Earlier acknowledgment versions are retained by the final implementation.
- An already-paid EN-07 purchase with $125 amount + $6.88 tax + $15 extras records $146.88. Existing order/purchase lines are excluded from another purchase record.
- Changing room clears a selected purchasing batch. Reset returns the fictional sample to 80 lines and original review/orders; founder notes use a separate storage key.
- No browser console errors in the exercised flows.

## Responsive and visual checks

- Presentation cover and job paper inspected on the desktop viewport; the scene frame supports a 1440 × 1000 layout.
- Client paper checked in the 390 × 844 frame: document width and scroll width both 390px. Item content stays inside the paper.
- Purchasing checked at 390px: document stays 390px; the 940px operational table scrolls inside its own container, with an explicit cue.
- Already-paid purchase dialog corrected to a single form column on phone: dialog client width and scroll width both 356px.
- The original dense sheet styling and 36/80 line fixture remain. New notes use local folds and orders unfold inside the sheet.

## Static checks and limits

All nine JavaScript files pass `node --check`. Local asset, internal-anchor and file-reference checks cover the presentation/job files and bundled styles/scripts. Final `git diff --check` passes.

No app-wide build, production end-to-end suite or backend checks were run: no app implementation changed. This is not user testing or a production parity certification. Funding/signatures are fixtures; claims/replacements, permission roles, multi-user edits, real sends and real payments are not implemented. The source map and capability map disclose these limits.
