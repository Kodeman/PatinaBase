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
