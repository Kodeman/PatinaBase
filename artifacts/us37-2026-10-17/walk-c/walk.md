# US-37 walk C: per-job labels and trade pricing (SQ-1111)

**Status: COMPLETE, with one item blocked by the fixture (PO preview) noted below.**

- Run 1 (partial): main `a0d0c0915`. Run 2 (this continuation): main `954dfcfdee6d424fe63179da2a3d771af57fc066`, on local Supabase only.
- `supabase db reset` was run from the run-2 worktree, applying every migration through 00817 plus the seeds.
- The signed-in designer and client JWT `iss` was `http://127.0.0.1:54321/auth/v1`. Both portal `.env.local` files were generated from `supabase status` and point at `http://127.0.0.1:54321`.
- Designer: `designer@patina.dev` (Leah Hartwell). Client: `client@patina.dev` on `localhost:3002`.
- Job: **Marrow & Vale Residence** `b0000000-0000-0000-0000-0000000000d4`.
- Fixture: `projects.studio_id` was set to Local Dev Studio `b0000000-…0001`, because every seeded client job has a NULL studio. This was needed for the spec book (see F3).
- ENV: the local edge-runtime container mounted a deleted worktree path, so every function failed with "failed to determine entrypoint". The walk ran functions with `supabase functions serve` from this worktree instead. This is a stale local container, not a product defect.

PNG and PDF evidence (sips -Z 1600) is in `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1111/`. Run-1 files are 01–09 and run-2 files are 20–53.

## Results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| L1 | New items get LR-01… in a room and 001 without one | PASS. LR-01..LR-05 (Living Room) and 001 (Brass sconce). | 01, 08 |
| L2 | Edit a label in the Spec pane | PASS (F1 fixed). The Item label field is in the Specifications detail pane. | 50-spec-pane-labels.png |
| L2 | A duplicate in the same job is refused with the sentence | PASS. "Another item in this job already uses LR-02." The field sets aria-invalid=true and aria-describedby points at the sentence. | 51-spec-label-duplicate-refused.png |
| L2 | The same label in another job is allowed | PASS. FF-201, which Cedar Lane Study already uses, saved with "Label saved.". Restored to LR-01 afterwards and confirmed in the DB. | 52-spec-label-other-job-allowed.png |
| L3 | Label in Preliminary rows / Price LINE column / Spec heading | PASS (F2 fixed). The Spec heading reads "LR-01 Sofa · ×1". The labels column wraps badly (L-a). | 20-labels-in-preliminary-rows.png, 46, 50 |
| L3 | Label in the spec book and client presentation (client edition PDF) | PASS. LR-01..LR-05 and 001 print. | 08, 31-client-edition-v4.pdf |
| L3 | Label in the PO preview | NOT WALKED. The fixture lines are placeholders, so the lens shows "No selections are ready for purchasing authorization." and offers no preview. The lens LINE column shows names only. | 53-po-preview-labels.png |
| P1–P6 | Defaults, markup and client-price edits, freight, summary, tax, cost-change flags | PASS (run 1). Re-checked in run 2: rug at 50% gives $1,800 with "Above retail ($1,500)"; drapery at $2,400 back-calculates to 33.3% / 25.0%. | 02–07 |
| F5 | "Keep client price" / "Keep markup" names include the line | PASS in source: `price-table.tsx:644,657` gives `Keep client price for ${lineName}`. Not re-walked live. | source |
| F3 | A job with no studio shows the hold sentence and does not issue | PASS. "This job isn't in a studio yet. Name its studio, then issue." The Issue button is disabled. See L-b. | 21-F3-*.png |
| F4 | Issue the spec book with warnings acknowledged | PASS (F4 fixed). Revision 4 issued with 6 acknowledgements and both PDFs were ready. | 24 |
| F7 | Spec book after a typed round client price | **FAIL (F7, HIGH)** | 24-F7-rev3-checksum-mismatch-rev4-issued.png |
| P7 | Client approval on :3002 | PASS. Decision lead assigned, approval "Living Room selections" sent for Spec Book v4, review confirmed and approved by "Client User". The snapshot holds 1 approval and 6 lines. | 25 |
| P7 | Edit after approval: approved-vs-current flag | PASS. Rug 35→50% shows "Changed since the client approved it." with "Approved $1,620" under the unit and line. | 26 |
| P7 | Change log (who/when/field/old/new) | PASS. "Leah Hartwell · Oct 17, 1:01 PM · Markup · 35.0% → 50.0%", plus the line total and unit client. It is a modal dialog; Esc returns focus to the button. | 27 |
| P7 | Summary approved vs current totals | PASS. "Approved total $9,112.50 · Current $9,292.50 (+$180)", then −$360 after the lamp was removed. | 26, 40 |
| P7 | Removed group | PASS. "Removed since the client approved it." shows Floor lamp · Approved $540 · Change log ("Change log, Floor lamp"). See F8. | 28, 48 |
| P8 | Client data: RPCs and tables as client@patina.dev | PASS. No cost/markup/margin/retail/price_basis keys before approval, after approval or after the edit. `get_project_pricing_approval` returns 403, and the pricing, approval, item and settings tables return 0 rows. The only hit is `costCentsDelta=0`, the decision review's client impact field, not trade cost. | 30/32/33-*.json |
| P8 | Client edition PDF | PASS for privacy: no cost, markup, margin or retail. **See F9.** | 31-client-edition-v4.pdf/.txt |
| P8 | Browser network capture of the client presentation | PARTIAL. The tool captured only OPTIONS requests. The data-level probe above replays the same client reads. | none |
| G2 | Reset all | PASS by keyboard. Confirm: "Put every open line back on its default markup? Typed prices are replaced." with Reset all / Keep prices. Everything goes to 35% and the gap to 0. | 22, 23 |
| G5 | 390: summary dock | PASS with F10. The summary is sticky at the bottom of the scroll area. Nothing overflows horizontally (scrollWidth 390). | 40, 46 |
| R1 | 390: approval flags, Removed group, approved-total row (USD first) | PASS for render: each wraps cleanly, "$" shows first and the job has one currency. See F10 for readability. | 46-390-flag-0.png, 48-390-bottom-0.png |
| R1 | Change log button names | PASS for the per-line buttons ("Change log, Rug" / "Change log, Floor lamp"). See L-c for the summary button. | 27, w390b probe |

## Findings (worst first)

- **F7 (HIGH): the spec book fails to render after a typed round client price.**
  - Repro: on Marrow & Vale, type a drapery client price of $2,400 (the markup back-calculates to 33.3%), then issue the spec book.
  - Revision 3 fails `snapshot_checksum_mismatch`, so neither PDF is produced.
  - Cause: `render_snapshot` stores `"markupPercent": 33.3333333333333333` as a full-precision numeric. JS `JSON.parse` reads it back as 33.333333333333336, so `canonicalStringify` in `spec-book-render/core.ts:186-193` no longer matches the SQL checksum.
  - After Reset all (every line exactly 35%), revision 4 issued. Each failed issue also leaves an orphan `pending` revision (revisions 1–3).
- **F9 (MEDIUM): the approval records priced lines, but the client edition PDF prints no prices.**
  - The approval snapshot holds 6 priced lines (for example 40500 × 4 = 162000), yet the v4 client edition prints only labels and quantities.
  - This contradicts R185: "lines whose client price the PDF printed".
  - Either the PDF should print client prices, or the approval should record only the lines it printed.
- **F10 (MEDIUM): at 390px the docked summary covers about two thirds of the scroll area.**
  - The dock is 331 of the 503 CSS px of `main`; the header, lens tabs and intro take the top 269 px. That leaves about 170 px for lines.
  - A flagged row (Rug) shows its "Changed since…" line, but its "Approved $1,620" values sit under the dock and the row has to be scrolled one strip at a time.
  - Repro: 390×844, Price lens, after an approval.
- **F8 (LOW, downgraded from MEDIUM): the removed line shows no label.**
  - On a fresh load the Removed group names it "Floor lamp" (28 showed "A removed line" right after the removal, before a reload).
  - The label LR-05 is not shown, unlike the other rows.
- **L-a (LOW):** the labels column wraps mid-label in Preliminary rows: "LR-" / "01" and "00" / "1".
- **L-b (LOW):** with no studio, the headline still reads "READY / Ready to issue". The disabled Issue button has no aria-describedby pointing at the hold sentence.
- **L-c (LOW):** the summary-level "Change log" button has no aria-label naming its scope, and no aria-expanded.

Previous findings: F1, F2 and F4 are fixed, F3 now passes, and F5 is fixed in source.

## Fixture state left behind

- Rug at 50%, Floor lamp removed and 1 approval.
- Orphan pending spec-book revisions 1–3.
- Marrow & Vale studio_id set.
- Labels restored to LR-01..LR-05 and 001.
