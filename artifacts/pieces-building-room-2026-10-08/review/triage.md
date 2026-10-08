# Triage: the adversarial review of US-20

Review: `review/adversarial.md` (SQ-598, GPT-6 Sol, single-shot). Triage: the orchestrator accepted all 26 findings and rejected or skipped none. Fix pass: SQ-599 (Opus 5.5) applied every one to `synthesis/direction.md`, `specimens/*.html`, `specimens/SPEC.md` and `deck/src/index.html`, then rebuilt `deck/index.html`.

**Sol's closing count is wrong.** `adversarial.md:61` reads "4 S1 · 13 S2 · 8 S3 · 1 S4". Counting the 26 findings one by one gives **3 S1 · 13 S2 · 9 S3 · 1 S4**:
- S1: ADV-5, 6 and 8.
- S2: ADV-1, 3, 4, 7, 9, 11, 12, 13, 14, 15, 18, 21 and 23.
- S3: ADV-2, 10, 16, 17, 19, 20, 22, 24 and 25.
- S4: ADV-26.

The total of 26 is right. `adversarial.md` is left unedited.

| ADV | Sev · conf | Disposition | What changed |
|---|---|---|---|
| ADV-1 | S2 · high | Accepted | Sheet 02 now attributes to Leah only the lines that are hers. Four lines go under a new, unattributed group, "From the session, speaker not marked": "You want just something to hold space" (`:49`), "right now if you click on them, they're all specified" (`:11`), "You're still technically working on the project…" (`:33`) and "Yeah I can't delete anything" (`:39`). Each of the other quotes was checked against `TRANSCRIPT.md`. |
| ADV-2 | S3 · high | Accepted | The softened expletive stays. Sheet 02's label and intro now say one expletive is softened and that `:55` prints it in full. |
| ADV-3 | S2 · high | Accepted | Synthesis §1 and deck sheets 01, 05 and 07 now separate two kinds of gap. Three asks have no data under them: multi-room placement, units and labor. Removal is half built: `00435:521-545` and `use-project-ffe-ga.ts:248` exist with no control and no restore. The thesis is now "half right about the first", and the primitives list includes the remove control and its restore. |
| ADV-4 | S2 · high | Accepted | ROUGHED is dropped as a stage. The stage words are Placeholder · Specced · Ready · Released, and a placeholder means no product and no maker, whatever price it carries. Changed: SPEC §2.4, synthesis §2, D1 and Q3, deck sheet 06 (state diagram redrawn, with a "rough price never changes the word" line), and sheet 24's Q3. |
| ADV-5 | S1 · high | Accepted | a3 and b3 now list the authorization set: 7 lines, $30,760, ending with "↳ Install, wallpaper hanger (labor) $765". The act reads "Release 7 lines · $30,760 for authorization", and the heads read "7 ready". Matching updates in SPEC a3/b3, the fixture note, and deck sheets 09, 12 and 18. |
| ADV-6 | S1 · high | Accepted | D7 now ships in three phases. Phase 1 (slice 1) renders placements. Phase 2 (slice 3, before Release ships) covers client selections and the authorization snapshot. Phase 3 (slice 4) covers the PO sidemark, receiving and budgets. Until phase 3, Order refuses a multi-room line, and the refusal sentence is quoted in the synthesis and on sheet 22. Synthesis §5 slices 1, 3 and 4 and deck sheet 23 are rewritten to match. |
| ADV-7 | S2 · high | Accepted | Rule changed to `line.quantity ≥ sum(placements)`, with the difference printed as waste. Three worked cases (waste, partial receipt, a share change after the PO) are added to D7, Q4 and the slice-1 gate as SQL tests, and to sheet 22's diagram, figcaption and sheet 24's Q4. |
| ADV-8 | S1 · high | Accepted | Client price and markup are editable only before activation (`00692:31-54`); after that they are read-only, with a refusal that names Record a change. Changed: a7 (a new consequence sentence and note), b7 and c7 notes, SPEC a7, synthesis Direction A, and deck sheets 09 and 14. New D19 (a future client-price path) and Q16, also on sheets 22 and 24. |
| ADV-9 | S2 · high | Accepted | READY FOR LEAH records an internal fact, D18 `project_room_handbacks(project_room_id, handed_back_by, handed_back_at)`. It never writes `design_disposition` and cannot select or release. Changed: Q13, the a3 and b3 notes, SPEC a3, deck sheet 07's disposition row, sheet 12, sheet 22 (D18 row) and sheet 24. |
| ADV-10 | S3 · high | Accepted | In a3 the counter stools move from Dining to a new Kitchen group, matching a9's move. |
| ADV-11 | S2 · high | Accepted | Coverage now uses three states: illustrated, passes whole at slice N, and verified (none yet). S3 passes whole at slice 4 (D6 groups). Added as the synthesis §5 coverage table and on deck sheets 08 and 17. |
| ADV-12 | S2 · high | Accepted | Same coverage model. S5 passes at slice 0 for line removal, slice 1 for undo and slice 4 for the catalog merge (D11). Added to synthesis §5 and deck sheets 08 and 17. |
| ADV-13 | S2 · high | Accepted | All six specimens' note headings and bars now say "interaction illustration, not a (working) prototype". "Under twenty seconds" is gone from sheet 17. Synthesis §3 A, §5 acceptance, §7, and deck sheets 09, 11, 23 and 25 say that S1's timing and keyboard, touch and screen-reader use need a working prototype. |
| ADV-14 | S2 · high | Accepted | Labor is now one release gate in §5 (slice 1): the link-kind backfill, every parent-link reader, PO exclusion, authorization, billing and Trade Scope reconciliation. Its acceptance cases are the wallpaper's order and invoice. Reflected in D5, the a7/b7/c7 notes and deck sheets 14, 20, 22 and 23. |
| ADV-15 | S2 · high | Accepted | Rough $ is now an internal planning figure in its own column (D12), never shown to the client. "Make it an allowance" is the only act that sets a client-visible ceiling. Changed: D12, fix-now #10, Q7, Q12, the a1/a2/a7/c notes, SPEC a2, and deck sheets 07, 09, 11, 14, 21, 22 and 24. |
| ADV-16 | S3 · high | Accepted | The fix-now track is split into (a) unconditional fixes 1–3, 5–9, 11 and 12, and (b) ruling-gated items: #4 waits on Q3, and #10 waits on Q7 plus D12's column. The "canon-safe" sentence is removed. Changed: synthesis §4 and §5 slice 0, and deck sheets 01, 20, 21 and 23. |
| ADV-17 | S3 · high | Accepted | Sheets 10–16 label each side's moment. Today tags read e.g. "Today · walk: 4 lines" or "walk step 7: one wallpaper line". Proposed labels read e.g. "illustrative worked fixture: 26 lines". |
| ADV-18 | S2 · high | Accepted | The deck script now holds a deep link until the reader interacts, instead of releasing it after 8 s. After that, every iframe height change and every resize re-anchors the reader to the same point of the same sheet. Verified by rendering every `#s-*` hash (see the SQ-599 verify comment). |
| ADV-19 | S3 · high | Accepted | The pager now sits in its own 50px strip under the deck: `--pager-h`, with `#deck` and `.slide` sized to `100dvh − --pager-h`. It never covers a sheet. At 760px and below it is hidden and the strip is 0. |
| ADV-20 | S3 · high | Accepted | At 760px and below, a1, a2, a4 and a8 swap for their 390 twins (a12–a15); b2 and c2 hide in favour of b13 and c13. Every other desktop frame carries a "desktop frame" note. Sheet 16 now puts the phones (Rough in) before Finishes and is retitled. `build.mjs` and `DECK.md` now count `SPECIMEN_A_390` as 8. |
| ADV-21 | S2 · high | Accepted | Covered by the same three-state coverage model as ADV-11 and 12, across all nine scenario rows. |
| ADV-22 | S3 · medium | Accepted | Q1 and Q4 each gain an "If declined" branch, in synthesis §6 and on deck sheets 20 and 24. |
| ADV-23 | S2 · high | Accepted | D1 gains a nine-row precedence table: decision, damage, trade, partial, goods, Released (with Allowance), Ready, Specced, Placeholder, plus a labor-line rule. Mirrored compactly on deck sheet 06. |
| ADV-24 | S3 · high | Accepted (light) | One compact source line sits under the headline claims on deck sheets 05, 08 and 20. |
| ADV-25 | S3 · high | Accepted | Handled with ADV-13: keyboard, touch and screen-reader acceptance moves to a working prototype in §5 acceptance and on sheet 23, and the illustration labels say so. |
| ADV-26 | S4 · high | Accepted (light) | Sheet 26 is retitled "Appendix · team and provenance" and gains the SQ-599 row. Sheet 25 now ends with "The next Leah test". |

All 26 were applied; none were deferred.
