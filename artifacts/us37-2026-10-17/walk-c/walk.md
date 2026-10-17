# US-37 walk C: per-job labels and trade pricing (SQ-1111)

**Status: PARTIAL. This is a continuation checkpoint, not a finished walk.**

- Walked: main `a0d0c091534c9dcbc947422852ac255038b25462`, on local Supabase only.
- `supabase db reset` was run from the worktree at that SHA, with all migrations through 00816 and the seeds.
- Signed-in designer JWT `iss` = `http://127.0.0.1:54321/auth/v1`. Both portal `.env.local` files were generated from `supabase status` and point at `http://127.0.0.1:54321`.
- Designer: `designer@patina.dev` (Leah Hartwell). Job: **Marrow & Vale Residence** `b0000000-0000-0000-0000-0000000000d4` (client `client@patina.dev`).
- Fixture change: `projects.studio_id` on this job was set to Local Dev Studio `b0000000-…0001`, because every seeded client job has a NULL studio and spec-book issue refuses those jobs (see F3).

PNG evidence (sips -Z 1600) is in `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1111/`.

## Results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| L1 | New items get LR-01… in a room and 001 without one | PASS. DB shows LR-01..LR-05 (Living Room) and 001 (Brass sconce, no room). | 01-item-list-keyboard-adds.png, 08-labels-in-spec-book-LR-01-001.png |
| L2 | Edit a label; a duplicate in the same job is refused with the sentence; the same label in another job is allowed | **FAIL (F1)**. No reachable designer surface edits a label. | none |
| L3 | Label shows in the item list | **FAIL (F2)**. Not in Preliminary selections (rough) or the Pricing table. | 01, 02 |
| L3 | Label shows in the item detail | **FAIL (F2)**. Not in the Specifications detail pane. | none (DOM probe: no LR-/00x text, no label input) |
| L3 | Label shows in the spec book | PASS. LR-01…, 001 appear under each line. | 08 |
| L3 | Label shows in the client presentation / PO preview | NOT RUN | |
| P1 | 5 items with cost default to 35%; qty-4 line = 4 × unit | PASS. Sofa $2,000→$2,700; side chair qty 4 × $405 = $1,620. Entered keyboard-only (Tab/Enter). | 02-acc1-five-items-35pct-qty4.png |
| P2 | Rug markup → 50%; client price and margin update | PASS. $1,200 → $1,800, 33.3% margin. | 03-acc2-3-rug50-drapery2400.png |
| P3 | Drapery client price $2,400 is kept exactly; markup and margin back-calculate | PASS. $2,400 kept; 33.3% markup / 25.0% margin. | 03 |
| P4 | Freight line with its own default markup is in the blend | PASS. Freight default set to 20% in Account › Pricing, then the line reset to default gives 20.0% / $300; blend cost $6,850. | 04, 05-freight-own-default-20-reset-line.png |
| P5 | Summary always visible; blended markup/margin and gap in % and $; updates per change; uses extended totals | PASS. Sticky on scroll; e.g. 37.3% / 27.2% / +2.3% · +$150 matches hand math on extended totals. | 03, 04 |
| P5 | Sales tax is its own row, not in the blend | PASS. 8.25% → tax $775.29 on $9,397.50; markup unchanged. | 04 |
| P6 | Cost change flags old → new; Keep client price and Keep markup each resolve correctly | PASS. Sofa $2,000→$2,200, Keep client price gives $2,700 / 22.7%. Rug $1,200→$1,000, Keep markup gives 50% / $1,500. | 06, 07 |
| P7 | Client approval, then a line edit shows approved vs current, the change log, and summary approved totals | **BLOCKED (F4)**. The spec book cannot issue with warnings. | 09 |
| P8 | Client privacy (presentation, exports/PDF, network payloads) | NOT RUN (depends on P7) | |
| G1 | Retail guardrail shows above retail and not when retail is blank | PASS. Rug at $1,620/$1,800 shows "Above retail ($1,500)"; lamp (no retail) has no note; rug at $1,500 has no note. | 02, 03, 07 |
| G2 | Reset per line | PASS (freight, via the Acts menu with keyboard arrows and Enter). | 05 |
| G2 | Reset all | NOT RUN | |
| G3 | Tab/Enter/Esc across fields | PASS. Tab order: cost → markup → client → retail → Acts → next row qty → cost. Enter commits and keeps focus. Esc reverted a draft 99 to 33.3%. | probes in ticket comment |
| G4 | D4: zero shadows | PASS. The only computed shadows were the focus ring, the React Query devtools button (dev only) and the browser-extension overlay. | JS probe |
| G5 | 390 layout docks the summary | NOT RUN | |
| R1 | SQ-1270 owed: 390px approval flags, "Removed since…" group, approved-total row; Change log button names | NOT RUN (depends on P7) | |

## Findings

- **F1 (HIGH): there is no way to edit a label in the designer UI.**
  - `useSetFfeItemLabel` is used only in `components/document/line-unfold.tsx`. That component mounts in `FFESection` (`app/(document)/doc/[id]/page.tsx`), and `/doc/<id>` redirects to `/doc/<id>/pieces?lens=rough`, where none of the lenses render it.
  - Repro: open any job, then Preliminary selections, Specifications, Pricing and the spec book. None of them offers a label field.
  - Impact: Kody's item 3 (edit a label; a duplicate is refused) cannot be done.
- **F2 (HIGH): the label is missing from the item list and the item detail.**
  - Repro: on Marrow & Vale, Preliminary selections shows only the name. The Pricing LINE column and the Specifications detail pane have no LR-01 or 001 either.
  - Only the spec book prints the label.
- **F3 (MEDIUM): a studio-less job cannot issue its spec book, and the reason is not shown.**
  - `prepare_spec_book_issue` requires `projects.studio_id`. All seeded client jobs (Aspen Loft, Birch Hollow, Marrow & Vale) have a NULL studio.
  - The UI says only "The issue could not complete."
- **F4 (HIGH, blocks P7/P8): issuing a spec book with warnings always fails.**
  - `spec-book-workspace.tsx:1226` sends `warningAcknowledgements: [{code, reason}]`, but `_prepare_spec_book_issue_00403` (00380:1312) requires `ack->>'id'`, so it raises "every warning acknowledgement requires id and reason".
  - Repro: on a job with a studio and a line without a client note, open Issue readiness, type a reason and click Issue 2 editions. It shows "The issue could not complete."
  - Possibly pre-existing (not US-37 code). Workaround for the walk: clear every warning (add a client note to each line) so the acks list is empty.
- **F5 (LOW): the accessible names of the cost-change buttons are ambiguous.**
  - "Keep client price" and "Keep markup" carry no line name (no aria-label or aria-describedby). With two flagged lines, a screen reader hears identical buttons.

## Continuation next steps

1. Get "[db] yours", then reuse the DB state if it was not reset. If it was reset, redo P1–P6 quickly and set the job's studio_id.
2. Clear the spec-book warnings (add a client note to each line), issue the Client edition, and send it for approval. Approve as `client@patina.dev` on :3002.
3. Edit a line, then check the approval flags, the change log (who/when/field/old/new), approved vs current totals, and the SQ-1270 390px items.
4. Check P8 privacy in the client presentation, the PDFs and exports, and the client-portal network payloads (no cost/markup/margin/retail/price_basis keys).
5. Check the label in the client presentation and the PO preview, then Reset all, then the 390 dock.
