# US-37 walk C re-walk: release C on merged main (SQ-1303)

**Status: COMPLETE. F7, F9, F10, F8, L-a, L-b, L-c, P7 and P8 pass. The PO preview was NOT WALKED: the fixture cannot reach purchasing readiness.**

- Main: `04587adecda17c3a700f480473c6d15ffd7878bf`. It carries SQ-1292 (00818), SQ-1293 (00819) and SQ-1294 (UI). Local Supabase only.
- The walk ran `supabase db reset` from the SQ-1303 worktree, applying every migration through 00819 plus the seeds. Before the reset, only the 5 version pins were copied into `supabase/.temp`.
- The signed-in designer and client JWT `iss` was `http://127.0.0.1:54321/auth/v1`. It was checked in the browser before any act, and again by the probe script.
- Both portal `.env.local` files were generated from `supabase status` and point at `http://127.0.0.1:54321`.
- Edge functions ran under `supabase functions serve` from the worktree.
- Designer: `designer@patina.dev`. Client: `client@patina.dev` on `localhost:3002`.
- Job: Marrow & Vale Residence `b0000000-0000-0000-0000-0000000000d4`.

Evidence is in `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1303/`, with images resized by `sips -Z 1600`.

## Fixture (added, local only)

- `projects.studio_id` was set to Local Dev Studio `b0000000-…0001`.
- A `project_rooms` row "Living Room" (`c0ffee00-…13a1`) was inserted.
- A product "Linen Drapery Panels (SQ-1303)" (`c0ffee00-…1303`) was inserted, copied from the jute rug, with trade $1,800 and retail $2,600.
- Six library pieces were placed as the designer through `place_product_in_project_v2`. All are item_type `fixed`, defaulted to 35% markup over trade, and are real library lines, not TBD or allowance placeholders:

| Label | Piece | Qty | Room | Note |
|---|---|---|---|---|
| LR-01 | Velvet Club Chair | 2 | Living Room | stored markup 35.000727…, rounded cents |
| LR-02 | Woven Jute Area Rug 8×10 | 1 | Living Room | |
| LR-03 | Linen Drapery Panels | 1 | Living Room | |
| LR-04 | Brass Arc Floor Lamp | 1 | Living Room | |
| LR-05 | Live-Edge Coffee Table | 1 | Living Room | |
| 001 | Unmapped Brass Sconce | 2 | none | |

- `spec_book_item_settings.included = false` was set for the sconce (001). It had no room, image or selection, so it blocked the issue.

## Results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| F7 | A typed round client price, then issue the spec book | **PASS.** The drapery was typed at $2,400 and reads 33.3% / 25.0%. The DB stores `markup_percent` 33.3333333333333333 with `price_basis` client. Revision 1 issued with the client and internal PDFs both `ready` and no `snapshot_checksum_mismatch`. Frozen `pricing.markupPercent` values are 33.3333, 35 and 35.0007, rounded per 00818. The chair's non-round 35.0007 also survived. | 01, 02, 10, 11 |
| F9 | The approval snapshot equals the prices the client PDF prints | **PASS.** See the comparison below this table: 5 approval lines, exactly the 5 item sheets that print a CLIENT PRICE. The excluded sconce is in neither. | 10-client-edition-rev1.txt, 20-F9-approval-snapshot.txt |
| F9 | Client PDF privacy | **PASS.** No cost, markup, margin or retail text. The only near-hit is the word "TRADE", the chapter-kind kicker above "Lighting/Chair/Decor/Table" (`pdf.ts:63`). See L-1. | 10-client-edition-rev1.txt |
| P7 | Approval on :3002 | **PASS.** The decision lead was assigned and "Living Room selections" sent for Spec Book v1. The client confirmed the review with a hold, then chose Approve, typed a name and submitted with a hold. The approval shows "APPROVED 17 OCTOBER 2026". | 20 |
| P7 | Edit after approval: approved-vs-current flag | **PASS.** Rug 35→50% reads "Changed since the client approved it." with "Approved $1,566" under the unit and the line, plus a Change log. The summary reads "Approved total $8,671.84 · Current $9,882.64 (+$1,210.80)". See F-2. | 22-P7-rug-50-flag-1400.jpg |
| F8 | The Removed group shows the item label | **PASS after reload.** It shows "LR-04 Brass Arc Floor Lamp · Approved $865.08 · Change log". Right after the remove, before a reload, it shows "A removed line" with no label. See L-2. | 23, 24 |
| F10 | 390: docked summary height vs `main` | **PASS.** Collapsed, the dock is **104 of 503 px** of `main` (331/503 in SQ-1111). It reads "Markup 37.2% · Margin 27.1% · Gap +2.2% · +$144.01" with a Full summary button. There is no horizontal scroll (scrollWidth 381). Expanded on request, it is 416/503. | 30-F10-390-dock-measurements.json |
| F10 | The disclosure uses aria-expanded and works by keyboard | **PASS.** It is a native `<button type=button>` with tabIndex 0. It is focusable, and `aria-expanded` goes false→true→false. `aria-controls` points at an existing region. Real keypresses could not be sent to the 390 popup (see the method note), so keyboard support rests on native button semantics plus a focus check. | 30 |
| F10 | A flagged row's "Approved $…" is reachable | **PASS with L-3.** With the row scrolled to centre, "Approved $1,566" sits at 413–431 px, clear of the dock top at 569. `scrollIntoView({block:'nearest'})` parks it under the dock (753 vs 667), because `main` has no scroll-padding for the dock. | 30 |
| L-a | Labels don't wrap mid-label in Preliminary rows | **PASS** at 1400 and 390. Every label (LR-01…LR-05, 001) is `white-space: nowrap` and one line high, 16 px. | 31-La-preliminary-labels-1400.jpg |
| L-b | No studio: headline and Issue described by the hold sentence | **PASS.** It reads "HELD / Held until the job has a studio". "Issue 2 editions" is disabled, and its `aria-describedby` resolves to "This job isn't in a studio yet. Name its studio, then issue." The studio was restored afterwards. | 32-Lb-held-no-studio-1400.jpg |
| L-c | The summary Change log button is scoped | **PASS.** `aria-label="Change log for Marrow & Vale Residence"`, `aria-expanded="false"`. The per-line button is "Change log, Woven Jute Area Rug 8x10". | DOM probe |
| PO | Labels in the PO preview with real lines | **NOT WALKED.** The Purchasing authorization lens says "No selections are ready for purchasing authorization." Each line still needs a maker picked from vendors, an image, and the Selected disposition, and a PO needs an executed furnishings authorization after that. That chain is outside this fixture and the ticket's time box. po-send was not run and no mail was sent. The lens LINE column still shows names without labels ("Velvet Club Chair Living Room"). | page text |
| P8 | Client data probe as client@patina.dev | **PASS** after approval and again after the edit and removal. `get_client_project_threshold` and `get_client_project_selections` return 200 with no cost, markup, margin, retail or price_basis keys. `get_project_pricing_approval` returns 403. `project_ffe_items`, `ffe_pricing_approvals`, `ffe_pricing_approval_lines`, `ffe_pricing_events`, `designer_pricing_settings` and `project_pricing_settings` return 0 rows. Caveat: both readers returned `selections: []` for this job, so the key scan covered the envelope only, not line objects. | 21-P8-*.json, 33-P8-*.json |

F9 comparison, client edition rev 1 against `ffe_pricing_approval_lines`:

| Label | PDF CLIENT PRICE | Snapshot unit × qty = total |
|---|---|---|
| LR-01 | $928.13 | 92813 × 2 = 185626 |
| LR-02 | $1566.00 | 156600 × 1 |
| LR-03 | $2400.00 | 240000 × 1 |
| LR-04 | $865.08 | 86508 × 1 |
| LR-05 | $1984.50 | 198450 × 1 |

All rows are USD.

Method note (390): the Chrome tab could not be resized, because its window reports a 2461 px CSS viewport at about 55% zoom. The 390 checks ran in a `window.open` popup with an inner size of exactly 390×844, measured through DOM APIs. The Chrome tool cannot screenshot that popup, and `screencapture` lacks permission, so there is no 390 PNG; the numbers are in `30-F10-390-dock-measurements.json`. The 1400 PNGs were captured at that zoom.

## Findings (worst first)

- **F-1 (MEDIUM, pre-existing, client-facing): the client edition PDF prints "false" for SKU and an unlabeled jumble for dimensions.**
  - Every item sheet prints `SKU false`. The Brass Arc Floor Lamp's dimensions read `22, 82, in, 68`.
  - Cause: the frozen `selection.sku` is `{"na": false}` with no value, and the renderer prints the `na` boolean. `selection.dimensions.value` is the object `{unit, depth, width, height}`, and its values are joined in key order with no labels.
  - Repro: issue any spec book whose library products have a null sku and object dimensions, then run `pdftotext` on the client PDF (10-client-edition-rev1.txt, lines 46–51).
  - This is not release C code, but clients read it.
- **F-2 (LOW): the summary's "Current (+$…)" delta mixes lines the client never approved with post-approval edits.**
  - "+$1,210.80" = the rug edit (+$174) + the unroomed sconce ($1,036.80). The sconce was excluded from the approved book and is never flagged as unapproved in the lens.
  - A designer can read the whole delta as drift since approval.
  - Repro: approve a book that excludes a priced line, then open the Price lens summary.
- **F-3 (LOW, needs triage): line images look missing in two places even though item images exist.**
  - The Purchasing authorization lens says "Needs an image" for LR-01 and LR-05, although `project_ffe_item_images` holds one primary picture per line (Unsplash URLs, snapshotted per D1).
  - The local client PDF prints "Image unavailable". That one is likely the local renderer failing to fetch the remote URL, so it is an environment issue.
  - Repro: Purchasing authorization lens on this fixture.
- **F-4 (LOW, needs triage): the edition 2 working copy's Issue readiness still lists warnings for the removed Brass Arc Floor Lamp ("6 lines checked").**
  - The job has 4 live, included lines at that point.
  - Repro: after the approval, remove a line, then open Spec book › Issue readiness.
- **L-1 (LOW):** the client edition prints the chapter kicker "TRADE" above each category chapter. A homeowner can read it as trade pricing. Consider "Category" or nothing on the client edition.
- **L-2 (LOW, residual of F8):** right after Remove, the Removed group reads "A removed line · Approved $865.08" with no label until the page reloads.
- **L-3 (LOW, residual of F10):** `main` has no `scroll-padding-bottom` for `--price-dock-h`. Focus or `scrollIntoView` on content near the bottom can land it under the docked summary. Manual scrolling reaches it.
- **L-4 (LOW, pre-existing):** the client page headline reads "Nothing waits for your name." while an approval awaits the client's review and answer below it.
- **ENV (not product):**
  - Both portals share one `sb-<prod-ref>-auth-token` cookie on `localhost`, so signing into :3002 signs :3000 out. The JWT `iss` was local throughout; only the cookie name carries the prod ref.
  - Admin `generate_link` magic links don't complete the PKCE callback. The walk used the sign-in form plus Mailpit, and the designer Dev Accounts picker.

Release C verdict: F7 (00818), F9 (00819) and the SQ-1294 UI fixes (F10, F8, L-a, L-b, L-c) all hold on merged main. None of the findings above blocks release C. F-1 is the one worth a ticket before more client editions go out.

## Fixture state left behind

- Marrow & Vale studio_id is set.
- 1 approval exists, with 5 lines.
- The rug is at 50%.
- The floor lamp is removed.
- The sconce is excluded from the spec book.
- Spec book revision 1 is issued and the edition 2 working copy is open.
- Product `c0ffee00-…1303` and room `c0ffee00-…13a1` remain.
