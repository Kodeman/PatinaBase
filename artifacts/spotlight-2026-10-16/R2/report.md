# R2 walk: the billing spotlight (SQ-1047)

> Placed by the orchestrator at integration. The harness refused the walker's write. The text below is verbatim from the SQ-1047 ticket comment headed "report.md content".

- **Walk SHA:** main `62ec94535`, which carries the R2 chain through SQ-1299 (reviewed by SQ-1304). The worktree held only this harness on top.
- **Local only:**
  - The DB was local :54322 with migrations through 00819, the state SQ-1303 released. There was no reset.
  - The designer `.env.local` was generated from `supabase status` and refuses anything but `http://127.0.0.1:*`.
  - Every session checked that the JWT `iss` is `http://127.0.0.1:54321/auth/v1`.
  - All 15 runs sent 0 requests to supabase.co or patina.cloud.
  - Edge functions ran under `supabase functions serve` from this worktree.
- **Flags:** `NEXT_PUBLIC_FLAG_OVERRIDES=studio-workspaces,ask-the-paper,one-voice,agreement-parts` (as in SQ-1060/SQ-1114), plus `studio-invoice`. Without `studio-invoice` the composer does not offer studio mode. None of these is an R2 flag.
- **Browser:** headless Chromium (Playwright 1.58.2) with reduced motion. Desk is 1400×900 at DPR 1; phone is 390×844 at DPR 2. PNGs were reduced to fit 1600px with `sips -Z 1600`.
- **Harness:**
  - Run `node walk.mjs <s1..s5> <desk|phone> [kbd]`.
  - `walk-lib.mjs` and `walk-seed.mjs` come from SQ-1114. `spot-lib.mjs` holds the spotlight, veil and axe probes. `fixtures.mjs base|draft` builds the fixtures below.
  - Raw probe JSON, one file per run, is in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1047/`.
- **Openers:** the composer and the folio were opened by dispatching the same `document:open-invoice-composer` / `document:open-invoice-folio` events their in-app doors dispatch (as SQ-1114 did). In s2 that event is line-unfold's Bill act with `initialFfeItemIds`. Every held-act press, fix, Tab, Shift-Tab, Enter and Esc after that is real input.
- **Keyboard runs:** these press the held act with focus plus Enter. From there everything is Tab, Shift-Tab, Enter, Space or Esc: the spotlight, the fixes inside the windows, the popover pick and the Esc checks.
- **axe:** axe-core 4.11.1, injected from `node_modules`, because `@axe-core/playwright` is not installed. It ran with the wcag2a/aa, 21a/aa and 22aa tags on every spotlight-open state.

## Fixtures

These sit on top of SQ-1060's seed (`walk-seed.mjs`):

| Fixture | Project and state |
|---|---|
| s1 | **Ashgrove Mudroom.** bob is lead, Local Dev Studio, no client. It has bob's 3h of rate-pending time, "ZZ Oak entry bench" at $1,200, and the unpriced "ZZ Iron coat hooks". The walk is run as Leah, the studio owner. Each s1 run first clears the client. |
| s2 | **Linden Attic.** No studio, client linked. It has bob's 1h of rate-pending time and the unpriced "ZZ Dormer reading lamp". The walk is run as bob. |
| s3 | Leah on the Desk, studio mode ("the studio · no house"). |
| s4 | **Wren Street Library.** Leah is lead, there is no client, and the milestone "ZZ SQ-1047 deposit" is $1,200. |
| s5 | **Juniper Row.** Leah's job for the household "Juniper Okafor", whose profile email is NULL and whose book row has no `client_email`. Each run drafts a fresh invoice. |

## Checks applied to every spotlight-open state

- The spotlight opens with the expected number of lit windows. At 390 that is 1, because the bar docks and shows one window at a time.
- No box-shadow, drop-shadow, opacity fade or animation anywhere in the layer, which is computed-style on every element.
- The scrim layer is a child of the act's own frame.
- The full-viewport fixed layers (the page veil) are byte-identical before and after.
- `role=status` announces "N things need attention. First: …".
- Focus lands in a window or the bar.
- The bar is inside the viewport.
- An axe run, and a PNG.

In the scenario steps:

- **Tab trap:** 10×Tab and 6×Shift-Tab must stay in the windows or the bar.
- **Esc:** must close the spotlight, leave the sheet open and return focus to the held act.
- **Popovers and fixes:** checked with `elementFromPoint` at their centre, and not `inert`.

## Matrix (P pass · F fail · E environment-limited)

| # | Step | 1400 | 390 | Keyboard | PNGs |
|---|---|---|---|---|---|
| s1.1 | Draft is held. The press opens the spotlight in the "Draw an invoice" sheet with **2 windows**: link-client (active) and invoice-lines. The status says "2 things need attention. First: Link a client before drafting this invoice." Focus is on LINK A CLIENT in the window | P | P (1 lit) | P | s1-*-b-draft-held |
| s1.2 | No shadow or fade. The scrim is inside the sheet. The page veil is unchanged (`paper-folio-backdrop` rgba(20,18,16,.55) before and after) | P | P | P | same |
| s1.3 | **The bar (reason · NEXT · CLOSE) is on screen** | **F** (top −132) | **F** (top −97) | **F** | s1-*-b-draft-held (no bar visible) |
| s1.4 | Tab ×10 / Shift-Tab ×6 stay in the windows and the bar. Esc closes the spotlight, the sheet stays, and focus returns to DRAFT THE INVOICE | — | — | P | s1-desk-kbd-c-draft-held-again |
| s1.5 | LINK A CLIENT is live in its window. The household sheet opens **above** the composer and its spotlight | P | P | P | s1-*-household-over-spotlight |
| s1.6 | The household picker popover sits above the scrim. `elementFromPoint` returns the "Client User" option, and picking it links Ashgrove in the DB | P | P | P | s1-*-picker-popover, -linked |
| s1.7 | After fix 1 the spotlight **stays open** on the one window left (Select lines) | **F** (closes) | **F** | **F** | s1-*-after-fix-1 |
| s1.8 | Draft pressed again gives 1 window, "Add at least one line first." The bar is on screen (top 768 / 747) | P | P | P | s1-*-draft-held-remaining |
| s1.9 | Ticking the bench inside the window clears the last hold. The spotlight closes, focus is on DRAFT THE INVOICE, and Draft is no longer held | P | P | P | s1-*-closed-draft-ready |
| s2.1 | Bill the unpriced lamp on a no-studio job with a rate-pending hour. The press gives **3 windows**: ask-name-studio ("Ask your studio owner to name this project's studio."), price-line (lamp) and invoice-lines | P | P (1 lit) | P | s2-*-b-draft-held |
| s2.2 | **The rate-pending hour has its own window** | **F** | **F** | **F** | s2-*-b-draft-held |
| s2.3 | NEXT walks every window (1→2→3) | **F** (stops at 2 of 3) | **F** | **F** | s2-*-c-next-2, -d-next-3 |
| s2.4 | The bar is on screen at the first press | **F** (top −93) | **F** (top −118) | **F** | s2-*-b-draft-held |
| s2.5 | No shadow or fade, scrim in the sheet, veil unchanged, status announced. Tab trap holds. Esc closes the spotlight only, with focus back on Draft | P | P | P | — |
| s3.1 | Studio mode: the press gives **3 windows**: household, regarding and lines. The bar is on screen (frame top 54) | P | P (1 lit) | P | s3-*-b-draft-held |
| s3.2 | The Household picker is live in its window, and its popover sits above the scrim (`elementFromPoint` returns "Client User") | P | P | P | s3-*-household-popover |
| s3.3 | Picking a household removes its window | P | P | P | s3-*-after-household-regarding |
| s3.4 | Typing "regarding" removes its window | **F** (still lit 1.2s later) | **F** | **F** | s3-*-after-household-regarding |
| s3.5 | Adding a line ($300) clears the last hold and the spotlight closes | P | P | P | s3-*-closed |
| s3.6 | Focus goes back to Draft after the last fix | **F**: stays in Unit price | **F** | **F** | s3-*-closed (see finding 6) |
| s3.7 | Tab trap and Esc (closes the spotlight, sheet stays, focus on Draft) | — | — | P | s3-desk-kbd-c-draft-held-again |
| s4.1 | GENERATE INVOICE on the account band is held, and `aria-describedby` reads "Wren Street Library has no client yet. Link one to bill it." | P | P | P | s4-*-a-band-held |
| s4.2 | The press opens 1 window (no-client) in the paper column, `main[data-document-paper]`. The bar is on screen. No RPC is sent | P | P | P | s4-*-b-generate-held |
| s4.3 | No shadow or fade, veil unchanged, status announced. Tab cycles window↔bar. Esc closes, focus on GENERATE INVOICE | P | P | P | — |
| s5.1 | The folio's SEND THE INVOICE is held **before issue**, with the reason "Add Juniper's email to send this." | P | P | P | s5-*-a-folio |
| s5.2 | The press gives 1 window (add-email) in the "Invoice folio" sheet. The DB stays `draft`, so nothing issued | P | P | P | s5-*-send-held |
| s5.3 | The bar is on screen | P | **F** (top −32) | P | s5-phone-b-send-held |
| s5.4 | ADD THEIR EMAIL is live, and the household sheet opens **above** the folio with focus in the email field. Typing and pressing Save writes `designer_clients.client_email` | P | P | P | s5-*-household-over-folio |
| s5.5 | Back on the folio: the spotlight is closed, focus is on SEND THE INVOICE, and Send is no longer held | P | P | P | s5-*-send-ready |
| s5.6 | Send → "Send the invoice · $450.00". The invoice issues as INV-0001 and invoice-send is reached | **E** | — | — | s5-desk-e-sent |
| s5.7 | Tab trap and Esc (closes the spotlight, folio stays, focus on Send) | — | — | P | s5-desk-kbd-c-send-held-again |

About s5.6:

- invoice-send answered 502 `send_failed`, "RESEND_API_KEY environment variable is required". Local has no Resend key, and this walk makes no external sends.
- The folio said "COULD NOT SEND — ISSUED AS INV-0001. THE INVOICE COULDN'T BE COMPLETED. CHECK THE INVOICE AND TRY AGAIN. RESEND TO RETRY."
- The hold-to-send path works. Only the mail transport is missing.

## axe (spotlight-open states)

- **The spotlight itself: 0 violations** in every run.
- The one hit, in s1, s2 and s5 at both widths: `target-size` (serious, 1 node) on `button[aria-label="Clear start"]`. That is the × beside the project's START date on the page behind the sheet, and it predates R2. s3 and s4 have 0.

## Findings, worst first

1. **HIGH: the spotlight bar (reason, NEXT and CLOSE) renders above the viewport whenever the sheet is taller than the screen.**
   - Where: s1 at 1400/390/keyboard, s2 at all three, and s5 at 390.
   - Measured bar tops: −132 and −97 (s1), −93 and −118 (s2), −32 (s5 at 390).
   - The bar lands at the frame's **top**, not docked at the foot. s3, s5 at 1400 and s4 place it at frame top 54/55 or at the foot.
   - At 390 the contract says ≤640px docks the bar to the bottom. On the paper column (s4) it does dock, but in the composer and the folio sheets it does not.
   - What a user misunderstands: a sighted mouse user sees the dark scrim and a ring but no reason sentence, no NEXT and no CLOSE. They cannot tell there are more windows, or how to leave other than Esc.
   - Keyboard users still reach the bar by Tab: the trap shows `bar` stops while it is off-screen.
   - This is the latent `bottom: calc(16px - inset)` sticky issue from story-log #14, now reproduced on the sheets, not the paper column.
   - Evidence: `s1-desk-b-draft-held.png` and `s2-phone-b-draft-held.png`. JSON `steps[0].sp.bar.rect`.
2. **MEDIUM: fixing one hold closes the whole spotlight instead of moving to the next window.**
   - In s1, after LINK A CLIENT → pick, the composer's spotlight is gone with one hold left (Select lines).
   - Focus is on DRAFT THE INVOICE, which is still held, and nothing announces the remaining hold until Draft is pressed again (s1.7/s1.8).
   - The user reads the job as done and presses Draft into a second spotlight.
   - Evidence: `s1-*-after-fix-1.png`; JSON `afterLinkBack.sp.open=false`.
3. **MEDIUM: NEXT stops at "2 of 3" when the third window contains the second.**
   - s2's price-line window (the lamp row) sits inside the invoice-lines window.
   - Pressing NEXT on 2 of 3 leaves the label at "2 OF 3 · PRICE IT", so "Add at least one line first" is never presented. This happens with the mouse and with the keyboard.
   - Evidence: `s2-*-d-next-3.png`; JSON `seenIds` is [ask-name-studio, price-line, price-line].
4. **MEDIUM (premise gap): a rate-pending hour never gets a window.**
   - Rate-pending rows cannot be ticked (MS-01), and `assessInvoiceReadiness` only raises `rate-pending` for ticked entries, so the "no-studio + rate-pending + unpriced" state lights studio, lamp and lines.
   - The "1H WAITING FOR A RATE" line sits unlit inside the lines window.
   - On a studio-less job the hour has no fix anyway. On Ashgrove, SET PHASE ONE BOB'S RATE is visible but is never named as a hold.
   - Confidence: high on behaviour, medium on whether K7/K8 meant to light it.
5. **LOW: the Regarding window stays lit after a title is typed.**
   - In studio mode, 1.2s after `fill("ZZ SQ-1047 studio retainer")` the ring list is still [lines, regarding]. It clears only after the next field change.
   - A user can think the title was rejected.
   - Evidence: `s3-*-after-household-regarding.png`; JSON `afterRegarding`.
6. **LOW / as designed?: in studio mode, focus stays in the field last typed in when the final hold clears.**
   - That field is Unit price. In s1 focus is moved to Draft.
   - Leaving focus where the user is typing is arguably right. It is listed because the brief expected "focus back on Draft".
7. **LOW (pre-existing, environment): s5 issued INV-0001 and the DB reads `status = sent` although invoice-send returned 502 `send_failed`, so no email went out.**
   - The folio's line is correct ("COULD NOT SEND — ISSUED AS INV-0001 … RESEND TO RETRY"), but the folio stamp and the DB say SENT.
   - Local only: the cause is the missing Resend key. Confidence that this also happens on a real transport failure: medium.

Not defects:

- The household sheet and both pickers sit correctly above the scrim (K10, R186).
- The page veil was never doubled (K2).
- Esc closed the spotlight before the sheet in every keyboard run.
- No shadow, opacity fade or animation was found on any spotlight element.
- The `role=status` line spoke on every press.

## State left on local :54322

- **Ashgrove:** client relinked to Client User.
- **Fixtures added:** three FF&E pieces (Ashgrove ×2, Linden ×1) and bob's extra Linden hour. The Wren milestone "ZZ SQ-1047 deposit" is still unbilled, because every press was held.
- **Juniper Row (household user `zz-sq1047-juniper@patina.invalid`):**
  - INV-0001 is issued, with status sent and no mail.
  - Five ZZ SQ-1047 drafts: the base fixture draft, plus one fresh draft from each of the s5 runs other than the desk mouse run. The desk mouse run's draft is the one that became INV-0001.
  - The household's email is set to `juniper.sq1047@patina.invalid`.
- **Studio-mode composer:** nothing was drafted.
