# R2 re-walk 2: s5 folio Send + s1 sanity on the SQ-1320 candidate (SQ-1323)

- **Walk SHA:** SQ-1320 candidate `4049230dd` (base main `2c09edd5f`). The two candidate files (`hold-spotlight.tsx` and its test) were checked out over the base in this worktree for the run, then restored before the commit. Only this harness folder is committed.
- **Local only:**
  - DB local :54322 as SQ-1317 left it. No reset, no reseed.
  - The designer `.env.local` was generated from `supabase status`. The generator refuses any API URL that is not `http://127.0.0.1:*` and any env URL on supabase.co or patina.cloud.
  - All 6 runs asserted the JWT `iss` is `http://127.0.0.1:54321/auth/v1`, and all 6 sent 0 requests to supabase.co or patina.cloud.
  - **Send was never pressed.** Each s5 run ends at s5.5 and checks that its draft is still `draft` and that there were 0 `invoice-send` POSTs.
- **Flags:** `NEXT_PUBLIC_FLAG_OVERRIDES=studio-workspaces:true,ask-the-paper:true,one-voice:true,agreement-parts:true,studio-invoice:true`, in `name:true` pairs, the same set SQ-1317 used.
- **Browser:** headless Chromium (Playwright 1.58.2) with reduced motion. Desk is 1400×900 at DPR 1; phone is 390×844 at DPR 2. PNGs over 1600px were reduced with `sips -Z 1600`.
- **Harness:** copied from `../rewalk/` and repointed. Run `node walk.mjs <s1|s5> <desk|phone> [kbd]`. Changes to s5:
  - **s5.3a** probes geometry twice, first exactly as the press left it (no scroll) and then after `scrollIntoView`. It records `elementFromPoint` at the button centre and whether the bar rect intersects the active window rect or the button rect.
  - **s5.4** uses a real mouse click with no `force` and a 5s timeout, so a covered button fails fast. It also checks that focus is in the email field and that the household dialog is on top (`elementFromPoint`).
  - **s5.5** checks that focus is on SEND THE INVOICE.
  - **390 extent:** the harness records the folio frame and every scrolling ancestor (inline `padding-bottom` and `scrollHeight`) before the press, while open, and after close.
  - The Send press was removed.
- **Probe JSON:** one file per run, in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1323/`.

## Matrix (P pass · F fail · — not applicable)

| # | Step | 1400 | 390 | Keyboard (1400) | PNGs |
|---|---|---|---|---|---|
| s5.1 | K10: SEND THE INVOICE is held before issue, with the reason "Add Juniper's email to send this." | P | P | P | s5-*-a-folio |
| s5.2 | The press gives 1 window (add-email). The DB stays `draft`. The status says "1 thing needs attention: Add Juniper's email to send this." | P | P | P | s5-*-b-send-held |
| s5.3 | The bar is inside the viewport | P (617–679) | P (765–844, docked) | P (617–679) | s5-*-b-send-held |
| **s5.3a** | **`elementFromPoint` at the ADD THEIR EMAIL centre returns the button, and the bar does not intersect the lit window** | **P**: button 715–759; window 709–765; the bar is above the window, 30px clear | **P**: button 666–710; window 642–715; the bar is below the window, 50px clear | **P** (same as 1400) | s5-*-b-send-held |
| **s5.4** | **A MOUSE click (no force) opens the household sheet above the folio**, which is on top by `elementFromPoint`. Focus is in the email field. Save writes `designer_clients.client_email = juniper.sq1047@patina.invalid` | **P** | **P** | P (Enter) | s5-*-household-over-folio |
| **s5.5** | **Back on the folio: the spotlight is closed, the status says "All set.", focus is on SEND THE INVOICE, and Send is no longer held** | **P** | **P** | **P** | s5-*-send-ready |
| s5.6 | No shadow or fade (0 elements). The scrim is inside the folio frame. The page veil is identical before and after | P | P | P | — |
| s5.7 | Tab ×10 / Shift-Tab ×6 all stay on window or bar stops. Esc closes the spotlight, the folio stays, and focus is on Send | — | — | P | s5-desk-kbd-c-send-held-again |
| **s5.8** | **390: after close, the padding the spotlight added is removed.** The folio overlay's inline `padding-bottom` goes from "" (before) to 97px (open) and back to "" (closed). Its `scrollHeight` goes 895 → 974 → 844, and no scroller stays grown | — | **P** | — | s5-phone-d-send-ready |
| — | Nothing is issued or sent. All 4 s5 drafts stay `draft` and there were 0 `invoice-send` POSTs | P | P | P | — |
| s1.3 | The bar is in the viewport on the Draft press | P (768–830) | P (765–844) | — | s1-*-b-draft-held |
| s1.5 | LINK A CLIENT is on top (`elementFromPoint`) and not inert (676–720 / 577–621). The household sheet opens above the composer | P | P | — | s1-*-c-household-over-spotlight |
| s1.7 | Hand-off after linking: the spotlight stays on invoice-lines and the status says "1 thing needs attention: Add at least one line first." Focus is in the window. The bar is on screen (822–884 / 765–844) | P | P | — | s1-*-f-after-fix-1 |
| s1.8 | Ticking the bench closes the spotlight. The status says "All set.", focus is on DRAFT THE INVOICE, and Draft is no longer held | P | P | — | s1-*-g-closed-draft-ready |
| axe | Spotlight elements: 0 violations in every open state of all 6 runs | P | P | P | — |

The 390 s5 run was run twice:
- The first run reported F on a stricter check that required the overlay `scrollHeight` to match its pre-spotlight value exactly.
- Before the press it was 895, and after close it was 844. That is lower, not higher.
- The folio panel itself shrinks from 857 to 786 once the add-email reason is gone; the same shrink shows at 1400, from 740 to 687. The inline padding was already back to "".
- I corrected the check to "no scroller keeps a grown extent" and re-ran it. Both runs show the same geometry, and the second run is the one recorded.

## axe

- **Spotlight: 0 violations.**
- The one hit in every run is `target-size` (serious, 1 node) on `button[aria-label="Clear start"]`. It is the × beside START on the page behind the sheet. SQ-1047 and SQ-1317 recorded it too, and it predates R2.

## Findings, worst first

1. **LOW (new with the SQ-1320 placement, 1400): when the bar lifts above the window, it half-covers the held act.**
   - Where: s5-desk-b-send-held.
   - The bar is now at y 617–679, directly above the add-email window (709–765). The SEND THE INVOICE / VOID row sits just above the window, about y 672–690 by the screenshot, so the bar's bottom edge clips the top of the SEND THE INVOICE label.
   - The fix is fully usable, and Esc or the fix returns focus to Send.
   - What a user may misunderstand: the act they just pressed seems to vanish behind the reason bar while it is held. This is cosmetic, and it is far better than SQ-1317 F1, where the fix itself was covered.
   - The Send rect was not probed while open; the overlap comes from the PNG.
2. **LOW (carry-over): after Save in the household sheet, the sheet stays open, and the user closes it (Esc) to get back to the folio.** All 4 s5 runs needed one Esc. After it, focus lands on SEND THE INVOICE and the spotlight is already closed. This is recorded, not failed. The brief's "back on the folio" holds after the sheet closes.
3. **LOW (carry-over, SQ-1317 F2): after the s1.7 hand-off, focus lands on SET PHASE ONE BOB'S RATE**, the first focusable element in the invoice-lines window, rather than on a line checkbox.
4. **Note, not a defect (dev only):** at 390 the Next.js dev-tools "N" badge overlaps the docked bar's left edge (s5-phone-b-send-held). It does not exist in production builds.

**SQ-1317 F1 is closed:**
- At 1400 the bar now sits above the active window with 30px clear, and at 390 it sits below the window with 50px clear.
- ADD THEIR EMAIL is the `elementFromPoint` hit both as pressed and after scrolling, and a real mouse click opens the household sheet.

**No s1 regression from the placement change:**
- The bar stays at the frame foot where it does not meet the active window: 768–830 at the press, and 822–884 after the hand-off at 1400.

## State left on local :54322

- **Ashgrove:** the client was cleared and relinked to Client User on each s1 run (2).
- **Juniper Row:** 4 new draft invoices, one per s5 run (00:1x UTC 2026-10-18). None was issued or sent. The household email is `juniper.sq1047@patina.invalid` (each run cleared it, then saved it).
