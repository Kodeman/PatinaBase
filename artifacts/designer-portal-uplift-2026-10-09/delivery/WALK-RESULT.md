# US-25 walk result: the Day Sheet on local (SQ-750)

Walked 2026-10-11, about 08:40–09:10 CDT (Sunday). Code under test: main `6a41869d4`, the whole US-25 release plus Direction C D1/D2/D3/L and the SQ-752 fixes. It ran from this ticket's own worktree. Nothing was sent: no reminder, no PO chase and no email. The only writes were two "Not today" rows, which the closing seed re-run removed.

**Verdict: not ready to ship.** The Day Sheet's own guards hold: five lines at most, no count, no dot or badge, no streak, and "Not checked: invoices" when a feed fails. But five defects block release (D1–D5 below):
- Not today silently does nothing for any multi-studio user, and for any line whose project has no studio or no project yet.
- The hire sees studio revenue, A/R and margin.
- With 40-odd live jobs, Leah's five lines are stale legacy items, and none of S2, S3, S4-deposit or S7 reach her sheet.

## 1. Setup

- **DB.** Local Supabase only (API `http://127.0.0.1:54321`, from `supabase status`). No `.env.local` was written; the env came in through the process. Migration 00765 was already applied (`studio_need_states` exists). The DB was never reset.
- **Seed.** `walk/seed_uplift_walk_v2.sql` re-runs v1 (`\i`), then repairs it as SQ-739 diagnosed. It was applied 7 times, exit 0 on every run after the last edit. Its postconditions assert:
  - the Pell Court deposit INV-2026-0723 is `paid` / 920000 and its payment is `succeeded`;
  - Pell Court is a project created by `activate_proposal_as_project`, with `proposal_id` set.

  Along the way the seed had to work around four guards. Each workaround is in the file header:
  - `archive_project` RPC: retires the v1 Pell Court;
  - `decline_proposal`: Linden's new reason comes from a revision row, because the old decline row cannot be updated;
  - last-owner guard: the hire's auto-created solo studio is deleted as service_role;
  - `updated_at` trigger: hand-off dates are re-anchored with the trigger skipped.

  It seeds:
  - Linden declined yesterday, "The sofa is over budget";
  - Ines Calder 2 h ago;
  - PO-HD-0412 unanswered 12 days;
  - INV-2026-0721 12 days past due;
  - Jordan handed Marsh Street by Leah 2 days ago, with the note;
  - Pell Court paid 3 h ago, with draft PO-PC-0419 waiting;
  - Wren Row Bath, a signed proposal on Jordan's seat, for the false all-clear test.
- **Runtime.** `next dev --webpack -p 3007`, because :3000 was held by another project (`/Users/kody/Code/PatinaWebsite`, which was not touched). Flags came from `NEXT_PUBLIC_FLAG_OVERRIDES`, set to prod's on-for-everyone set. No orders, media or projects service ran, so one sheet logged "Network error" from the orders proxy. Browser: headless Chromium (Playwright 1.58), 1440×900 and 390×844, timezone America/Chicago unless stated.
- **Seats.** Leah = `designer@patina.dev`, Jordan = `hire@patina.dev` (`password123`).
- **Times.** "Measured" is the automation's wall clock: load to sheet painted, then click to sheet open. That is compile-warm dev, not a human. "Est." is a first-week reader's estimate, the same method as US-24 WALK §3.

## 2. S1–S8 against Direction B (direction.md §3 B)

| # | B target (clicks · notice/done s) | Measured 1440 | Measured 390 | Result |
|---|---|---|---|---|
| S1 | read five sentences · 0 (1) · ≤8 / 5 | 5 lines, painted in 6.3 s; est. 8 / 5 | same 5 lines, 7.5 s | **partial**. Bounded and ranked. But four of the five are stale legacy items (Chen "$3,400 due 12 May", Walk INV-0007, Tanaka, Okafor), and only Holloway's invoice is from today's studio moments. `s1-leah-sheet-*.jpg` |
| S2 | Linden line → Follow up · 1 · 5 / 5 | not on sheet | not on sheet | **fail**. `proposal_declined:e7500000…0022` never reaches the top five. Not today cannot clear the lines above it (D1) |
| S3 | PO-HD-0412 line → scoped sheet · 1 · 5 / 5 | not on sheet | not on sheet | **fail** on the sheet. Inside Holloway, the rail reads "Pieces PO-HD-0412 UNANSWERED, 12 DAYS", which fixes US-24's NOTHING YET. `s6-holloway-doc-1440.jpg` |
| S4 | line 1 invoice; line 3 deposit → Release the order · 1 · 5 / 5 | invoice: line 2; SEND REMINDER opens a scoped sheet ("Invoice INV-2026-0721 · $3,800 · due 29 September") in 1.6 s. Deposit: not on sheet | same; 1.3 s | **invoice pass / deposit fail**. The deposit now reads PAID in Accounts (`hire-accounts-1440.jpg`: "INV-2026-0723 · paid 11 October · PAID"), so the SQ-739 seed fix holds. `S4inv-leah-act-*.jpg` |
| S5 | Jordan: hand-off line + PO chase · 0 (1) · 5 / 2 | 3 lines: Marsh PO, then "Leah Hartwell handed you Marsh Street Kitchen on Friday, October 9 · Read Leah Hartwell's note", then Wren Row signed. 5.8 s | same 3 lines | **pass, with copy defects** (D7, D8). Scoped to Jordan's jobs. `s5-jordan-sheet-*.jpg` |
| S6 | band, "Everything open on this job · 2" · 0 (1) · 3 / 5 | NEXT "OVERDUE 12D · INV-2026-0721 · SEND REMINDER", "All open · 5" | NEXT band at top, same | **pass** (the count reads "All open · 5", not B's wording). The coaching line "The band says what's next on this job. Press it. UNDERSTOOD" still sits at rest at 390. `s6-holloway-doc-*.jpg` |
| S7 | "Ines Calder wrote two hours ago" · 0 (1) · 5 / 5 | not on sheet | not on sheet | **fail**. Same crowding as S2 |
| S8 | "Nothing needs you tonight" + what comes back · 0 · 5–10 | not reachable | not reachable | **fail / not reached**. Leah's sheet cannot be emptied (D1). Jordan's cannot either: the hand-off line has no Not today, and Not today on the pre-project Wren line fails (D3) |

## 3. Q1 guards on the rendered page

These are a script check of the `[data-testid=day-sheet]` DOM. The dot check counts filled round elements of 16 px or less. The badge check looks for badge, pill or dot classes. The count check looks for `+N`, `(N)` and "N more". The streak check looks for "cleared today", "streak" and "in a row".

| Guard | Leah 1440 | Leah 390 | Jordan 1440 | Jordan 390 |
|---|---|---|---|---|
| ≤ 5 lines | 5 ✓ | 5 ✓ | 3 ✓ | 3 ✓ |
| no count | ✓ | ✓ | ✓ | ✓ |
| no dot or badge | 0 / 0 ✓ | ✓ | ✓ | ✓ |
| no "cleared today" or streak | ✓ | ✓ | ✓ | ✓ |
| monochrome | 5 text colours, all warm greys/browns ✓ | ✓ | ✓ | ✓ |
| Not today removes the line until the next working day | **✗**: the line stays (D1) | (not mutated) | **✓** for Marsh PO: the line leaves, and the stored `deferred_until = 2026-10-12` is the Monday after this Sunday. **✗** for Wren Row (D3) | (not mutated) |
| an act moves the line to waiting-on | **not exercised**: no send was allowed, and the Q11 save could not be reached (D4) | | | |

## 4. False all-clear (Jordan, 1440)

1. With Marsh deferred and the Wren Row signed proposal left unacted, the head stays "This morning, these need you." The signed line shows, and "Nothing needs you tonight" is absent. **Pass.** `allclear-signed-left-1440.jpg`
2. The invoices feed was blocked: Playwright aborted both `rest/v1/invoices?…status=in.(sent,partially_paid)` requests. The sheet prints "Not checked: invoices." and never the empty sentence. **Pass.** `allclear-invoices-blocked-1440.jpg`
3. The empty-sheet half (every line gone, then block invoices) **could not be reached**. The hand-off line has no Not today, and Wren's Not today fails (D3). The quiet branch `head = notChecked` is therefore unverified on the page.

## 5. Hire seat (Jordan)

- **Desk scoped to Jordan's jobs:** ✓ (Marsh, Wren Row only). "The studio's" switches to the studio-wide five, the same five as Leah's.
- **Hand-off until read:** ✓ on the Desk and on Marsh ("HAND-OFF – From Leah Hartwell: Marsh Street is yours from today… · MARK READ"). After "Read the note" (which opens `/doc/<marsh>`), the Desk line is still there and so is the Marsh note. Reading is the separate MARK READ on the Document, so the hire reads the note and the Desk still asks (D6). `s5-jordan-marsh-doc-*.jpg`, `s5-jordan-after-read-1440.jpg`
- **Non-lead PO chase ("Save the draft for Leah"; nothing sent):** **not reached**. Holloway's PO line is not in "The studio's" top five (D2), and the act sheet has no other entry point from the Day Sheet. No save was pressed and nothing was sent. **UNVERIFIED.**
- **Accounts without studio-wide revenue or A/R:** **✗ FAIL (D5).** Jordan (member) opens "Studio Accounts · Ledger", which shows "THE STUDIO $16,755 REVENUE · $29,610 A/R · 22% MARGIN", every studio invoice, and "Export the book → XLSX". `hire-accounts-1440.jpg`, `hire-accounts-390.jpg`

## 6. Money and day agreement: Holloway INV-2026-0721, due 2026-09-29

| Browser zone · local time | Desk line | Band | Accounts |
|---|---|---|---|
| America/Chicago · Sun 08:54 | "overdue — oldest due 29 September" (no day count) | OVERDUE 12D | not captured |
| Asia/Kolkata · Sun 19:25 (after 19:00 local) | same | OVERDUE 12D | not captured |
| Pacific/Kiritimati · Mon 03:55 (local date ahead of UTC, the US-24 split class) | same | OVERDUE 13D (right by the local-day convention) | not captured |

The Desk line and the band can't disagree, because the Desk line prints a date, not a count. The script's Accounts capture read the Desk text instead of the Receivables row, so the Accounts day count is **UNVERIFIED**. A literal Chicago-after-19:00 run was not done: moving the browser clock ahead of the access token risks a refresh loop. Kolkata and Kiritimati stand in for it.

## 7. Defects (for the fix pass)

| # | Sev | Defect | Evidence |
|---|---|---|---|
| D1 | S1 | **Need states are read by one studio and written by another.** The Desk resolves Leah's studio to her solo studio "Leah Hartwell" (`0df4cc7a…`, 11 jobs). `useNeedStates` then reads `organization_id=eq.0df4…`, but `set_need_state` stores the project's studio (`b0000000…0001`). Not today on Holloway returned 204 and stored `deferred_until 2026-10-12`, yet the line stayed. Any user in two studios can never defer or act a line. | `q1-after-not-today-1440.jpg`; network trace in the evidence dir |
| D2 | S1 | **Stale legacy needs crowd the five.** Chen's "$3,400 due 12 May" (5 months) leads. Today's moments (Linden decline, Ines 2 h, Pell deposit, PO-HD-0412 12 d) are ranked below the fold or out of the five altogether. With D1, Leah has no way to reach them from the Desk. | `s1-leah-sheet-1440.jpg` |
| D3 | S2 | **Not today fails silently on lines without a studio project.** `set_need_state` raises `not permitted` (403) when `projects.studio_id` is null (Chen) or when no project exists yet (pre-project Wren Row `proposal_signed`). The line stays and no message shows. | console trace; `allclear-quiet-1440.jpg` |
| D4 | S2 | **A non-lead's PO chase is unreachable from the Day Sheet** when that PO isn't in the studio five. The Q11 "Save the draft for Leah" path is unverified on the page. | `s5-jordan-studio-scope-1440.jpg` |
| D5 | S1 | **Q10 money leak:** a member sees studio revenue, A/R, margin and the whole invoice book in Accounts, with an XLSX export. | `hire-accounts-1440.jpg` |
| D6 | S3 | "Read the note" opens the job but doesn't mark the hand-off read. The Desk keeps asking until the hire finds MARK READ on the Document. | `s5-jordan-after-read-1440.jpg` |
| D7 | S4 | The hand-off line reads "Leah Hartwell handed you … · Read Leah Hartwell's note". The specimen and the Q5 copy say "Leah" and "Read Leah's note". It also ranks below the PO line; the specimen puts the hand-off first. | `s5-jordan-sheet-1440.jpg` |
| D8 | S4 | "Wren Row Bath — design services — Signed — open the project": the em-dash chain doubles. | `s5-jordan-sheet-1440.jpg` |
| D9 | S4 | The coaching line "The band says what's next on this job. Press it. UNDERSTOOD" is still at rest on the Document at 390 (US-24 noted it). | `s6-holloway-doc-390.jpg` |
| D10 | S3 | **e2e auth fixture is stale:** the sign-in disclosure is now "Use a password instead". `e2e/fixtures/auth.ts` matches only "sign in with email" or "use email and password instead", so every auth-backed spec fails at sign-in. | sign-in page text |

The seed found two more things, both seed fidelity rather than product, and both fixed in v2:
- The hire's auth insert auto-created a solo owner studio, which the portal then chose over Leah's.
- The re-anchored `updated_at` dated the hand-off "today".

## 8. Not done

- **Playwright e2e label reconciliation** (comment 3; SQ-759/SQ-764 lists, plan-room.spec.ts): **not run** (tool budget). Per D10, they would fail at sign-in until `e2e/fixtures/auth.ts` learns "Use a password instead".
- **Money rung names** ("Client-authorized purchases", "Authorized, not yet paid to vendors", "Prepare purchasing authorization" on the Delivery table): **not spot-checked.**
- **Accounts day count; the empty-sheet false all-clear; the Q11 save/no-send with the Mailpit count:** UNVERIFIED (see §4–§6).
- Screenshots are at 1440 for everything and at 390 for S1, S4, S5 and S6. There are no S2, S3 or S7 shots, because those lines never rendered.

## Re-walk 2026-10-11 (SQ-775)

Walked 2026-10-11, about 09:30–11:00 CDT (Sunday), on main `23290ab08` (SQ-773 parts 1 and 2 on top of the SQ-750 tree), from the SQ-775 worktree. Screenshots are in `delivery/rewalk/` (JPEG, `sips -Z 1600`). Probe logs and page text are in the board evidence dir `verification/SQ-775/`.

**Setup.** Same method as SQ-750.
- Local Supabase only (`http://127.0.0.1:54321`, checked by the start script). Never reset.
- `walk/seed_uplift_walk_v2.sql` re-applied before the walk and again before e2e (exit 0 both times).
- `next dev --webpack -p 3000`, with prod's on-for-everyone flag set through `NEXT_PUBLIC_FLAG_OVERRIDES`. No orders, media or projects service ran, and no edge runtime ran (the local stack has no `supabase_edge_runtime` container).
- Headless Chromium, America/Chicago.
- Seats:
  - Leah = `designer@patina.dev`. She is owner of two studios: "Local Dev Studio" `b0000000…0001` and her solo studio "Leah Hartwell" `0df4cc7a…`.
  - Jordan = `hire@patina.dev`. `organization_members.role = member` in `b0000000…0001` only. There is no `studio_members` table; membership is `organization_members`. That studio's `margin_visibility` is `everyone`, which is the column default.
- Outbound baseline:
  - `procurement_drafts` 2;
  - `comms_messages` 3;
  - `sms_messages` 0;
  - `proposal_send_dispatches` 14;
  - Mailpit 4.
- Cleanup: the walk's own writes were deleted after the run, and `studio_need_states` is back to 0 rows. Those writes were the Q11 draft `840edfcc…` and the acted row on Walk INV-0007, which sits in Leah's solo studio, where the seed does not clean.

### Pass/fail

| # | Item | Result | Evidence |
|---|---|---|---|
| 1a | W-D1: Leah's Not today removes the line until the next working day | **PASS**. Holloway INV-2026-0721 (studio `b000…`) left the sheet at once and stayed gone after reload, with `deferred_until = 2026-10-12` (the Monday after this Sunday). The multi-studio split is fixed: an acted row on Walk INV-0007 in her *other* studio (`0df4…`) is honoured too. The sheet refilled to five (Linden's decline and Aspen Loft surfaced), and Q1 guards held: 5 lines, 0 dots, 0 badges, no count, no streak. | `w1-leah-after-not-today-1440.jpg`, `w1-leah-after-act-1440.jpg` |
| 1b | An act moves a line to waiting-on | **PASS for the state and render, NOT exercised through a real send.** The send cannot succeed on this stack because there is no edge runtime: Leah's "Send the reminder to Client User" failed visibly, with nothing sent (Mailpit 4→4) and no state written. The `acted` state was then written through the same `set_need_state` RPC the act sheet calls. Leah's Walk line left her sheet, and on Jordan's quiet sheet the Marsh PO moved to "AWAITING · Awaiting the maker since 11 October · Marsh Street Kitchen". See N1 for the failure copy. | `w1-leah-send-attempt-1440.jpg`, `w6-jordan-quiet-awaiting-1440.jpg` |
| 2 | W-D3: no Not today on lines without a studio project, and no silent failure | **PASS**. No Not today control on Chen ("Record the payment", project `studio_id` null), Tanaka, Okafor, Aspen Loft (proposals with no project), or Jordan's pre-project Wren Row signed line. It is offered only on lines whose project has a studio. No 403 was observed. | `leah-sheet-1440.jpg`, `jordan-sheet-1440.jpg` |
| 3 | W-D5 + SQ-751 F3: Jordan's Accounts and Vendors withhold studio money | **PASS** under the DEFAULT `margin_visibility = everyone`, at 1440 and 390. Jordan's Accounts shows no revenue, A/R, margin, XLSX export or studio invoice book: only "No invoices drawn yet" plus Draw an invoice. Orders → Vendor accounts lists vendors and terms with no PO totals. Leah, as control, still sees REVENUE · A/R · MARGIN. See N4 for the copy. | `w5-jordan-accounts-{1440,390}.jpg`, `w5-jordan-vendors-{1440,390}.jpg` |
| 4 | W-D6/D7/D8: hand-off line and Read the note | **PARTIAL**. The line reads "Leah handed you Marsh Street Kitchen on Friday, October 9 · Read Leah's note" (D7 fixed). The Day Sheet's Wren line is now "Wren Row Bath — design services — Signed, open the project" (D8 fixed: the second dash is a comma; the first is inside the proposal's title). "Read the note" writes `handoff:<marsh>` acted and the line is gone on return (D6 fixed). **New defect N2:** after the press, the note is nowhere on the page it opens. | `jordan-sheet-1440.jpg`, `w6-jordan-after-read-1440.jpg`, `w6-jordan-marsh-after-read-1440.jpg` |
| 5 | Q11: Jordan saves the Holloway PO chase for Leah, and nothing is sent | **PASS on the no-send invariant, FAIL on copy (N3).** Path: `/doc/<holloway>` → "All open · 5" → FOLLOW UP WITH THE MAKER. The sheet has no send control, only SAVE THE DRAFT FOR THE LEAD. Pressing it gave `procurement_drafts` 2→3: the new row is `ack_chase`, `awaiting_review`, `purchase_order_id e7210000…0031` (PO-HD-0412), with `sent_at`, `sent_by` and `message_id` all null. `comms_messages` stayed 3→3, Mailpit 4→4, and no need state was written. The draft did not reach Leah's top five (crowded; see N5). | `q11-jordan-standing-1440.jpg`, `q11-jordan-act-sheet-1440.jpg`, `q11-jordan-after-save-1440.jpg`, `q11-leah-sheet-after-draft-1440.jpg` |
| 6 | False all-clear, empty-sheet half | **PASS**. Jordan, 1440. Wren Row's pre-project signed line offers no deferral (W-D3 ruling), so the harness dropped that one proposal from REST responses, which keeps the proposals feed read. Marsh PO was acted. The quiet sheet's head was "No current action alerts." with the Awaiting block. Then both `rest/v1/invoices` requests were aborted: the head became **"Not checked: invoices."** and the empty sentence was absent. | `w6-jordan-quiet-awaiting-1440.jpg`, `w6-jordan-quiet-invoices-blocked-1440.jpg` |
| 7 | Holloway INV-2026-0721 day count, Accounts against the band | **PASS** (Chicago, Sunday morning). The Receivables row reads "Overdue 12 days — Invoice INV-2026-0721 …" and the Holloway band reads "OVERDUE 12D · INV-2026-0721". | `w7-leah-receivables-1440.jpg`, `w7-leah-doc-holloway-1440.jpg` |
| 8 | Money labels | **PASS for the labels.** Pell Court Dining → Project financials shows the rungs "Client-authorized purchases · nothing executed yet" and "Authorized, not yet paid to vendors · nothing in motion yet", with the new meaning line. "PREPARE PURCHASING AUTHORIZATION" shows on the FF&E selections head. The Delivery-table mount (`[data-release-lift]`) rendered on none of the walked jobs, so the label was seen on FF&E selections, not on the Delivery table. | `w8-leah-money-ladder-pell-court-dining-1440.jpg`, `w8-leah-release-lift-pell-court-dining-1440.jpg` |
| 9 | e2e label reconciliation | see below | `verification/SQ-775/e2e-*.log` |

### New and remaining defects

| # | Sev | Defect | Evidence |
|---|---|---|---|
| N1 | S2 | **A failed send shows a raw transport error.** Leah's reminder printed "Edge Function returned a non-2xx status code" inside the act sheet. The failure is visible, but the words don't say whether anything reached the client or what to do next. | `w1-leah-send-attempt-1440.jpg` |
| N2 | S2 | **"Read the note" marks the hand-off read before the hire sees the note.** The act is a link to `/doc/<marsh>`. The press writes `handoff:` acted, and Marsh's project file then prints no hand-off note at all (body search for "Marsh Street is yours" or "hand-off": none). The hire who presses "Read the note" never reads it. The note survives only on act sheets (N3). | `w6-jordan-marsh-after-read-1440.jpg`; `acts/act-viewer.ts:84,106` |
| N3 | S2 | **Act sheets print the wrong job's hand-off note and an unnamed lead.** On *Holloway's* PO chase, Jordan's sheet prints "From Leah: Marsh Street is yours from today…". The note comes from the member's org-level `handoff_note`, not from that job's hand-off, so it shows on every job's sheet (contract: "prints on that job's act sheet"). The lead also reads "The lead sees this first. / SAVE THE DRAFT FOR THE LEAD", not Leah: Holloway's lead is `projects.lead_designer_id`, with no `project_team_members` lead row, so `useProjectLeads` has no entry. The same sheet says "ABOUT The purchase order — no acknowledgment" with no PO number, and the prefilled body says "We sent The purchase order…". | `q11-jordan-act-sheet-1440.jpg` |
| N4 | S3 | **The hire's Accounts header still claims the studio book.** "Accounts · the studio's book", "Revenue, what's owed, what you earn — the sum of every engagement's account" and "STUDIO EYES ONLY" sit above "No invoices drawn yet". A member would read that as the studio having no invoices. | `w5-jordan-accounts-1440.jpg` |
| N5 | S1 (carried D2/D4) | **Stale legacy needs still own Leah's five.** Chen "$3,400 due 12 May", Tanaka, Okafor and Aspen Loft (unviewed proposals) have no Not today (by the W-D3 ruling), so they can never be cleared from the Desk. Linden's decline only surfaced after deferring both invoices. Ines Calder, PO-HD-0412 and Jordan's Q11 draft never reach her sheet, and S8 is still unreachable for Leah. | `leah-sheet-1440.jpg`, `q11-leah-sheet-after-draft-1440.jpg` |
| N6 | S4 | Holloway's project file says "press Money on the index to open", but the index entry is now "Project financials". | `verification/SQ-775/leah-doc-holloway.txt:98` |
| N7 | S4 | Jordan, on Holloway, which Leah leads, reads "– You're on the call sheet as lead. Who else is on the job?". | `verification/SQ-775/q11-jordan-holloway-doc.txt` |
| N8 | S4 | The Studio workload roster under the Day Sheet still prints "Signed — open the project" (the D8 em-dash chain) and the header acts "CAPTURE A LEAD" / "OPEN A PROJECT". | `w6-jordan-read-note-1440.jpg` |

### Item 9: e2e against this local stack

Run settings:
- `playwright test --project=chromium --workers=2`, from the portal, against the dev server above (`reuseExistingServer`). The server had prod's flag set, not the config's three-flag set.
- Local env came from `supabase status`. The seed was re-applied first.
- Specs, with no spec or product source edited:
  - **Named set:** SQ-764 c_mv2mpxqj_2826fd (F33), the SQ-759 hand-off list, `desk-claims` (decision #7) and `plan-room`.
  - **D2/D3 set:** the specs on the D2 surfaces (buying, proposals, pieces, spec-book) and the D3 surfaces (mood-board, library-configuration, deck-import).
- Report: `verification/SQ-775/e2e-*-summary.txt`.

**Named set: 119 tests in 13 min. 33 passed, 46 failed, 40 skipped (skips are serial-chain followers of a failure, or flag-gated).** The auth fixture works now (D10 fixed): every spec signs in.

**Fails only on a stale label.** The spec line and the label the product shows today:

| Spec:line | Spec expects | Current label (source) |
|---|---|---|
| `e2e/arrival/put-down.spec.ts:64` | link "Put down document" | "Back to Studio overview" (doc-spine) |
| `e2e/document/desk-claims.spec.ts:121` | "The rest are on their jobs." | "The rest are on their projects." (seen on the page) |
| `e2e/document/desk-error-state.spec.ts:62` | "The desk could not be read." | "Your studio overview couldn't load." |
| `e2e/document/help-panel.spec.ts:42/51` | dialog "Command bar" | "Studio search" |
| `e2e/document/hours.spec.ts:160/161` | dialog "Command bar" | "Studio search" |
| `e2e/people/directory.spec.ts:28` | heading "The People Room" | "Studio contacts" (`people-room.tsx:594`) |
| `e2e/people/directory.spec.ts:38-39` | group "Narrow the book", with chips Everyone/Clients/Crew/… | group "Filter directory" (`directory-view.tsx:395`), with chips "All contacts", "Clients", "Trades & contractors", "Makers & suppliers", "Studio team", "Companies" (`lib/document/directory-roles.ts:61-68`) |
| `e2e/people/directory.spec.ts:59,73,86` | button "Crew" | "Trades & contractors" |
| `e2e/people/directory.spec.ts:111` | label /ask/ | the field's label is "Ask the Engine" (`ask-bar.tsx:87`), so it still matches. The test timed out on the earlier "Crew" press, not here. |
| `e2e/people/add-sheet.spec.ts:44,110,164` | button "Add person" | "Add contact" (`people-room.tsx:618`) |
| `e2e/people/add-client-letter.spec.ts:53,131` | button /Add person/ | "Add contact" |
| `e2e/people/person-card.spec.ts:35` | button "Add person" | "Add contact" |

**Fails for reasons other than a label** (environment or behavior; not reconciled here):
- `field/field-coordination.spec.ts:47,166`: its own seed insert is refused, `studio_id_not_designer_studio`. This is a fixture or seed-data problem.
- `document/lens-density.spec.ts`: the long-paper fixture `…00d5` is not seeded ("Run scripts/the-document-lens-seed.sql"). The same fixture gap causes `[data-document-shell]` to never mount in:
  - `document/prework-regions.spec.ts:59`;
  - `document/workflow-stage-responsive.spec.ts:85,115` (6 of 7).

  The F33 `a[aria-label="Put down document"]` precondition (`:658,666`) was not reached.
- `document/action-visibility.spec.ts:181`: `[data-claim-card]` is absent from the desk roster, a structural change. The F33 label lines (`:157,204,250,267,348`) were not reached.
- `document/desk-walkthrough.spec.ts:129`: "New desk, same studio" is still in source (`desk/page.tsx:335`), so the offer note did not show for this seat (walkthrough state). The F33 `Command bar` line (`:78`) was not reached.
- `document/quiet-release-contracts.spec.ts:211`: `[data-drawer-timer-doorway]` timed out.
- `document/plan-room.spec.ts:159`: the filed-set count stayed 0 after `file-plan-prints` (needs the media service, which did not run).
- `arrival/input-and-escape.spec.ts:88,167`: `html.arr-pre` was never set. The arrival pre-state did not engage under this flag set.
- `responsive-review.spec.ts:250` (12 of 24): HIGH `overflowing_elements` on a page that rendered the sign-in card (`pa-auth-card`). The spec's own navigation lands unauthenticated; this is not a label.
- **Passed:** `smoke-tests` 9/9 (so its F33 route-name line `:16` is a route label, not display text), `hours` 5/6 and `desk-claims` 1/2. `room-view`, `arrival-arc` and `touch-wait-gesture` were skipped (flag-gated or serial), so `room-view.spec.ts:311,479` "The Scans" was not exercised.

**D2/D3 set: 93 tests in 11 min. 35 passed, 23 failed, 35 skipped.** These specs were chosen by surface (D2: buying, proposals, pieces, spec-book; D3: mood-board, library-configuration, deck-import), because the SQ-760/761 threads name no spec list.

Fails only on a stale label:

| Spec:line | Spec expects | Current label |
|---|---|---|
| `e2e/buying/phase0-member-walk.spec.ts:155-157` | its own sign-in regex `/sign in with email\|use email and password instead/` | "Use a password instead". The local copy of the D10 fixture fix was never applied here. |
| `e2e/buying/phase1-member-walk.spec.ts:258-260` | same | same |
| `e2e/buying/phase3-coverage-walk.spec.ts:320-322` (all 10 tests) | same | same |
| `e2e/mood-board/mood-board-ga.spec.ts:276` | main "… mood board room" | "{name} design board workspace" (`board-room-shell.tsx:1263`) |
| `e2e/mood-board/project-board-paths.spec.ts:136` | same | same |

Other D2/D3 failures (not labels):
- `buying/phase2-member-walk.spec.ts` (helpers/psql.ts:42): its profiles seed insert fails.
- `library-configuration/*` (4 specs): seed RPC raises P0001.
- `proposals/proposal-client-decline.spec.ts:42`: the client portal on :3002 was not running.
- `document/spec-book-workspace.spec.ts:77`: nav "Spec book workspace" did not appear, but the label is unchanged in source (`spec-book-workspace.tsx:1198`).
- `document/pieces-build-room.spec.ts` passed 35/37: S2 `:115` (URL hash) and S3 `:288` (count 3, expected 4) are behavior or seed issues, not labels.
- `deck-import/*`: all skipped (flag-gated).

