# R2 re-walk: s1, s2, s3, s5 after SQ-1311 (SQ-1317)

- **Walk SHA:** main `67ceeac24`, which has SQ-1311 integrated. The worktree held only this harness on top.
- **Local only:**
  - The DB was local :54322, as SQ-1047 left it. There was no reset and no reseed.
  - The designer `.env.local` was generated from `supabase status` and refuses anything but `http://127.0.0.1:*`.
  - All 12 runs checked that the JWT `iss` is `http://127.0.0.1:54321/auth/v1`.
  - All 12 runs sent 0 requests to supabase.co or patina.cloud.
  - Nothing was sent: the s5 Send step was never reached (see F1).
- **Flags:** `NEXT_PUBLIC_FLAG_OVERRIDES=studio-workspaces:true,ask-the-paper:true,one-voice:true,agreement-parts:true,studio-invoice:true`, the same set SQ-1047 used. The parser needs `name:true` pairs. My first batch used bare names, so every flag was off; I discarded that batch and re-ran all 12 runs.
- **Browser:** headless Chromium (Playwright 1.58.2) with reduced motion. Desk is 1400×900 at DPR 1; phone is 390×844 at DPR 2. PNGs over 1600px were reduced with `sips -Z 1600`.
- **Harness:**
  - The files in this folder are copies of the SQ-1047 harness, repointed to this worktree. Run `node walk.mjs <s1|s2|s3|s5> <desk|phone> [kbd]`.
  - New checks:
    - s1.7: the hand-off after fix 1 (window, status, focus, bar, axe).
    - s2.3: the exact NEXT order, compared on the id prefix, because the price-line id carries the piece uuid.
    - s3.4: the ring list read inside the next `requestAnimationFrame` after the Regarding input event.
  - s2.2 and s3.6 are recorded but not counted, per R193.
  - Raw probe JSON, one file per run, is in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1317/`.

## Matrix (P pass · F fail · — not applicable · R ruled by R193 · B blocked by an earlier failure)

| # | Step | 1400 | 390 | Keyboard | PNGs |
|---|---|---|---|---|---|
| s1.1 | Draft is held. The press gives 2 windows: link-client (active) and invoice-lines. The status says "2 things need attention. First: Link a client before drafting this invoice." Focus is in the window | P | P (1 lit) | P | s1-*-b-draft-held |
| s1.2 | No shadow or fade (0 elements). The scrim is inside the "Draw an invoice" frame. The page veil is byte-identical before and after | P | P | P | same |
| s1.3 | **The bar is inside the viewport** (rect top/bottom) | **P** (768–830) | **P** (765–844, docked) | **P** (768–830) | s1-*-b-draft-held |
| s1.4 | Tab ×10 / Shift-Tab ×6 all land on window or bar stops. Esc closes the spotlight, the sheet stays, and focus returns to DRAFT THE INVOICE | — | — | P | s1-desk-kbd-c-draft-held-again |
| s1.5 | LINK A CLIENT is on top (elementFromPoint) and not inert. The household sheet opens above the composer | P | P | P | s1-*-household-over-spotlight |
| s1.6 | The picker and the "Client User" option sit above the scrim. Picking links Ashgrove in the DB | P | P | P | s1-*-picker-popover, -linked |
| s1.7 | **After LINK A CLIENT → pick, the spotlight stays open on the remaining hold (invoice-lines).** The status says "1 thing needs attention: Add at least one line first." Focus moves into the window (lands on SET PHASE ONE BOB'S RATE). The bar is on screen. axe shows 0 on the spotlight | **P** | **P** | **P** | s1-*-after-fix-1 |
| s1.8 | Ticking the bench inside the window clears the last hold. The status says "All set." Focus is on DRAFT THE INVOICE, and Draft is no longer held | P | P | P | s1-*-closed-draft-ready |
| s2.1 | Bill the unpriced lamp on a job with no studio. The press gives 3 windows: ask-name-studio, price-line and invoice-lines. The status says "3 things need attention. First: Ask your studio owner to name this project's studio." Focus is on NEXT in the bar | P | P (1 lit) | P | s2-*-b-draft-held |
| s2.2 | The rate-pending hour has its own window | R | R | R | — |
| s2.3 | **NEXT visits [ask-name-studio, price-line, invoice-lines]** (labels 1 OF 3 · ASK WHO CAN NAME IT → 2 OF 3 · PRICE IT → 3 OF 3 · SELECT LINES) | **P** | **P** | **P** | s2-*-c-next-2, -d-next-3 |
| s2.4 | **The bar is inside the viewport at the first press and at every NEXT** | **P** (768–830, then 822–884) | **P** (743–844, then 765–844) | **P** | s2-*-b/c/d |
| s2.5 | No shadow or fade, scrim in the frame, veil unchanged, status announced. The Tab trap holds. Esc closes the spotlight only, with focus back on Draft | P | P | P | — |
| s3.1 | Studio mode ("the studio · no house"): 3 windows (household, regarding, lines). The status says "3 things need attention. First: Choose the household this invoice is for first." The bar is on screen (791–853 / 765–844) | P | P (1 lit) | P | s3-*-b-draft-held |
| s3.2 | The Household picker is on top in its window, and its "Client User" option sits above the scrim | P | P | P | s3-*-household-popover |
| s3.3 | Picking a household removes its window | P | P | P | s3-*-after-household-regarding |
| s3.4 | **Typing a Regarding title clears its window in the same frame** (rings [regarding, lines] → next rAF [lines]) | **P** | **P** | **P** | s3-*-after-household-regarding |
| s3.5 | Adding a line ($300) clears the last hold, the spotlight closes, and the status says "All set." | P | P | P | s3-*-closed |
| s3.6 | Focus goes back to Draft after the last fix (it stays in Unit price) | R | R | R | s3-*-closed |
| s3.7 | Tab trap and Esc: Esc closes the spotlight, the sheet stays, focus is on Draft | — | — | P | s3-desk-kbd-c-draft-held-again |
| s5.1 | K10: SEND THE INVOICE is held **before issue**, with the reason "Add Juniper's email to send this." | P | P | P | s5-*-a-folio |
| s5.2 | The press gives 1 window (add-email) in the folio. The DB stays `draft`. No shadow, scrim in the frame, veil unchanged, status announced | P | P | P | s5-*-b-send-held |
| s5.3 | **The bar is inside the viewport** | **P** (718–780) | **P** (765–844, docked) | **P** | s5-*-b-send-held |
| s5.3a | **The lit window and ADD THEIR EMAIL are not covered by the bar** | **F**: the bar covers it | **F**: the bar covers it | F (seen in geometry; keyboard still reaches it) | s5-desk-b-send-held, s5-phone-b-send-held |
| s5.4 | ADD THEIR EMAIL opens the household sheet above the folio, with focus in the email field. Save writes `designer_clients.client_email` | **B** (click times out) | **B** | P | s5-desk-kbd-d-household-over-folio |
| s5.5 | Back on the folio: the spotlight is closed, focus is on SEND THE INVOICE, and Send is no longer held | B | B | P | s5-desk-kbd-e-send-ready |
| s5.6 | Send issues the invoice | B (not reached; nothing sent) | — | — | — |
| s5.7 | Tab trap (window↔bar ×16) and Esc: Esc closes the spotlight, the folio stays, focus is on Send | — | — | P | s5-desk-kbd-c-send-held-again |

## axe (spotlight-open states)

- **The spotlight itself: 0 violations** in every run and state, including the s1.7 hand-off state.
- In s1, s2 and s5 the one hit is `target-size` (serious, 1 node) on `button[aria-label="Clear start"]`. That is the × beside START on the page behind the sheet; SQ-1047 recorded it too, and it predates R2. s3 has 0.

## Findings, worst first

1. **HIGH (new, after SQ-1311): in the folio, the docked bar sits on top of the add-email window, so a mouse user cannot press ADD THEIR EMAIL.**
   - Where: s5 at 1400 and at 390.
   - Geometry at 1400: the bar is at y 718–780 and the button at y 715–759. At 390: the bar is at y 765–844, the button at 745–789, and the window starts at 728.
   - `elementFromPoint` at the button's centre returns the bar's DIV ("Add Juniper's email to send this. CLOSE"), even after `scrollIntoView`. The window is the last thing in the folio, so it cannot scroll clear of the bar.
   - Playwright's click timed out after 30s in both mouse runs.
   - The keyboard run is unaffected: Tab reaches the button and Enter opens the household sheet.
   - What a user misunderstands: they see a terracotta ring whose fix is hidden behind the reason bar. The only visible controls are CLOSE and the reason text, so the hold looks like it has no fix, and Send can't be made ready with a mouse.
   - Cause (inferred): SQ-1311's on-screen docking moved the bar from the frame top to the frame foot without reserving space for a window that sits at the foot. The composer sheets in s1, s2 and s3 have content below their windows, so their fixers stayed hittable: LINK A CLIENT, the bench, the Household picker and Regarding are all `elementFromPoint` hits.
2. **LOW: after the s1.7 hand-off, focus lands on SET PHASE ONE BOB'S RATE.** That link is the first focusable element inside the invoice-lines window, ahead of the line checkboxes. The hold is "Add at least one line first", so the first stop is a rate link and not a line. This passes the brief: focus does move into the remaining window.
3. **LOW (pre-existing copy, outside the spotlight):** at 390 in s2, the composer reads "Nothing uninvoiced — every priced line is billed." directly above the listed unpriced "ZZ Dormer reading lamp" (s2-phone-b-draft-held).

Re-confirmed, not defects:

- The bar is on screen in every press state, and it docks at the foot at 390.
- NEXT walks all three windows.
- The hand-off keeps the spotlight open and announces the remaining hold.
- The Regarding window clears in the next frame.
- No shadow, drop-shadow, opacity fade or animation was found on any spotlight element.
- The scrim always sits inside the act's frame, and the page veil is byte-identical before and after.
- `role=status` spoke on every press.
- Tab trap: every Tab stop was a window or the bar, in all four keyboard runs.
- Esc closed the spotlight before the sheet or folio in every keyboard run.
- Popovers and the household sheet sit above the scrim.
- K10 holds Send before issue, and the DB stays `draft`.

## State left on local :54322

- **Ashgrove:** the client was cleared and relinked to Client User on every s1 run.
- **Juniper Row:** three new draft invoices, one per s5 run (23:43–23:44 UTC). None was issued. The household email is `juniper.sq1047@patina.invalid`; the s5 keyboard run saved it after each run cleared it.
- **Studio-mode composer:** nothing was drafted.
