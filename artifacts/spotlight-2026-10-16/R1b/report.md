# R1b narrow re-walk after SQ-1113 (SQ-1114)

- **Walk SHA:** main `36a1f096e`, which is SQ-1113's repair `3229bfa22` merged onto `fe441b1c5`. It also carries US-37: SQ-1098 (00806), `1c6d0dcc6` and SQ-1102. The worktree held only this harness on top.
- **Local only:**
  - `pnpm supabase:reset` ran from this worktree, so the DB carries exactly that SHA's migrations.
  - The dev server's env came from `supabase status` and refuses anything but `http://127.0.0.1:*`.
  - Every session checked that the JWT `iss` is `http://127.0.0.1:54321/auth/v1`.
  - 0 requests went to supabase.co or patina.cloud.
- **Flags:** `NEXT_PUBLIC_FLAG_OVERRIDES=studio-workspaces:true,ask-the-paper:true,one-voice:true,agreement-parts:true`, the same as SQ-1060.
- **Browser:** headless Chromium (Playwright 1.58.2) with reduced motion. Desk is 1400×900 at DPR 1; phone is 390×844 at DPR 2.
- **Harness:** `walk.mjs`, `walk-lib.mjs` and `walk-seed.mjs` come from SQ-1060, with `fixtures.mjs` added. Run `node walk.mjs <group>`. The groups are header, probe, k8, direct, milestone, milestone2, send, us37 and us37b. Before `direct`, run `node fixtures.mjs repend`.
- **Raw probe JSON:** `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1114/`, one file per row.
- **Seed drift:** at this SHA, bob also owns a "Phase One Bob" workspace. The 6-arg `open_project_direct` therefore refuses him with `studio_id_not_designer_studio`. The seed now opens Linden and Ashgrove through the K9 7-arg overload with Local Dev Studio. Everything else in the seed is unchanged.

## Matrix (P pass · F fail · — not walked)

| # | Scenario | 1400 | 390 | Keyboard | Evidence |
|---|---|---|---|---|---|
| 6a-i | Leah's composer on Ashgrove → SET PHASE ONE BOB'S RATE. The Account sheet opens **above** the composer: dialogs are "Draw an invoice" z60 and "Account settings" z65. Focus is on `Hourly rate for Phase One Bob`. `elementFromPoint` at the field's centre returns the INPUT (1400 at 774,591; 390 at 63,554) | P | P | P | s6a-*-b-account-over-composer |
| 6a-ii | Type 150, then Tab: focus is on **PRICE THEM**. The offer "3 hours were logged before this rate. Price them at $150.00/hr?" is shown, and the button passes `elementFromPoint` | P | — | P | s6a-desk-kbd-c-offer |
| 6a-iii | Enter on Price them shows "PRICED THE HOURS LOGGED BEFORE THIS RATE." in a role=status. DB pending goes 2→0. After Esc, the composer's rate group is gone with no reload: the rows read 1H 30M · $150.00/H | P | — | P | s6a-desk-kbd-d-priced, -e-after-esc |
| 6a-iv | Esc with **no save** closes only the Account sheet. The composer stays, and focus returns to SET PHASE ONE BOB'S RATE | P | P | P | s6a-*-probe-e-after-esc |
| 6a-v | Esc **after Price them** closes only the Account sheet, but focus falls to `<body>` (finding 1) | F | — | F | s6a-desk-kbd.json `focusAfterEsc` |
| 2b | Plain member (bob) on Quill Lane Porch. The header shows MESSAGE THE CLIENT, "No client yet. Ask Leah Hartwell to link one.", the quoted note "Could you link a client to Quill Lane Porch? I'd like to message them." and COPY A NOTE, with **no** LINK A CLIENT | P | P | — | s2b-header-member-* |
| 2b-owner | Leah (owner and lead) on Quill keeps LINK A CLIENT in the header and sees no ask | P | — | — | s2b-header-owner-desk |
| 3 | Account → Studio settings directly as Leah, after switching to Local Dev Studio. Typing bob $170 and pressing Tab offers "2 hours… Price them at $170.00/hr?". Focus is on **PRICE THEM**, not SIGN OUT. Enter prices the hours, and DB pending goes 2→0. In the control, a save that raises no offer leaves focus on the next control (⏻ SIGN OUT, bob being the last row), which is the normal Tab order | P | — | P | s3-direct-desk-* |
| Low 4 | The Account sheet header follows the switch: it read "LEAH HARTWELL · OWNER" before and "LOCAL DEV STUDIO · OWNER" after (STUDIO 2 OF 2) | P | — | — | s3-direct-desk-a-switched |
| Low 5 | The offers print "3 hours" and "2 hours", with no ".0" | P | — | — | s6a-desk-kbd-c-offer, s3-direct-desk-b |
| 8a | Account-band milestone draft on Wren, where Leah is lead and there is no client. **No refusal.** `generate_milestone_invoice` returned 200 and a Draft invoice opened, offering SEND THE INVOICE (finding 2). The premise that it refuses with no client does not hold | — (no refusal) | — | — | s8-milestone-natural-desk-b-after |
| 8a′ | Milestone-draft refusal from a fixture: the milestone is deleted after the band renders, then Generate invoice is pressed. The RPC answered 400 P0001 `generate_milestone_invoice: milestone … not found`. The band shows the role=alert "Could not draft the invoice — This milestone couldn't be found. Reload the project and try again." with no code or id | P | — | — | s8-milestone-vanished-desk-b-after |
| 8b | Folio Send the invoice on a draft, with invoice-send answering **422 `{"error":"no_recipient"}`**. The issue went through (INV-0002), then the folio said "COULD NOT SEND — ISSUED AS INV-0002. THIS INVOICE HAS NO CLIENT EMAIL YET. ADD THEIR EMAIL, THEN SEND IT. RESEND TO RETRY." | P | — | — | s8-send-issue-no_recipient-desk-* |
| 8b′ | Folio Resend on an issued invoice with the same 422 gives "COULD NOT SEND — THIS INVOICE HAS NO CLIENT EMAIL YET. ADD THEIR EMAIL, THEN SEND IT." | P | — | — | s8-send-resend-no_recipient-desk-* |
| 8b″ | Resend with the edge runtime truly down (HTTP 503) gives "COULD NOT SEND — THE INVOICE COULDN'T BE COMPLETED. CHECK THE INVOICE AND TRY AGAIN.", with no code | P | — | — | s8-send-resend-unreachable-desk-c-after |
| US-37 #5 | As alice: PERSONAL shelf → ADD TO STUDIO LIBRARY → lead time left blank. Promote to Studio is enabled and saves. The sheet closes, the shelf moves (PERSONAL 0, STUDIO 2) and DB `lead_time_weeks` is NULL with layer studio. The piece facts show no lead-time row for blank, nor after setting it to 0 (CATEGORY and RETAIL PRICE only) | P | P | — | us37-promote-* |

## Limits

- **Row 8 send:** the local edge runtime (`supabase_edge_runtime_supabase`) was stopped, and this ticket does not start shared services. The `no_recipient` rows therefore answer `functions/v1/invoice-send` in the browser with the function's own response (`index.ts:285-287`, 422 `{"error":"no_recipient"}`). That exercises the real UI path from `useSendInvoice` → `billingRefusal('send')` → the folio note. It does not exercise the function's own recipient lookup. Row 8b″ is the unstubbed call.
- **US-37 toast:** "Promoted to the Studio Library…" dismisses itself after 3.4s (`library-room.tsx:129`). The 1400 run read it at 3.5s and missed it, so the save was confirmed by the sheet closing, the shelf counts and the DB.
- **Not walked:** a 390 run of 6a-ii and 6a-iii, which price hours and so can run only once per fixture; the brief asks for 390 visibility only. Row 3 at 390.

## Findings, worst first

1. **MEDIUM (keyboard): after Price them from the composer's Set doorway, Esc drops focus to `<body>`.**
   - Path: Leah → Ashgrove composer → SET PHASE ONE BOB'S RATE → $150 → Tab → Enter on Price them → Esc.
   - The Account sheet closes and the composer stays, which is correct. But the act that opened the sheet, SET PHASE ONE BOB'S RATE, has unmounted with the cleared rate group, so focus has nowhere to return.
   - A keyboard or screen-reader user lands at the top of the page, behind the open composer, with no announcement. The next Tab starts from the document's skip link.
   - Without a save, focus does return to Set (6a-iv).
   - Evidence: `s6a-desk-kbd.json` `focusAfterEsc: {tag: BODY}`; `s6a-desk-kbd-e-after-esc.png`.
2. **MEDIUM: the account band's Generate invoice drafts a milestone invoice on a project with no client, and the folio then offers SEND THE INVOICE.**
   - Path: Wren Street Library (Leah lead, no client) → payment milestone "ZZ SQ-1114 deposit" → GENERATE INVOICE.
   - `generate_milestone_invoice` and `draft_invoice_from_milestone` (00397) accept it and return a Draft invoice with `client_id` NULL.
   - The composer, by contrast, holds the draft with "…has no client yet. Link one to bill it."
   - A designer is led to a send that will fail with "no client email". This is the same gap K6 and K7 close in the composer.
   - Confidence: high on the behaviour, medium on whether R1 means to cover this doorway, since K10's send hold is R2.
   - Evidence: `s8-milestone-natural-desk.json` (rpc 200); `s8-milestone-natural-desk-b-after.png`.
3. **LOW (accessibility, existing code that US-37 #5 touches): the promote sheet's labels are not tied to their inputs.**
   - The `Field` `<label>` elements carry no `for`/`id` and do not wrap their input, so "Lead time (weeks, optional)" and every other field has no accessible name (`leadAccessibleName: null`).
   - A screen reader announces a bare "spin button". The walk had to find fields by placeholder or by the label next to them.
   - Evidence: `us37-promote-desk.json`; `promote-to-studio-modal.tsx` `Field`.
4. **Observed, not defects:**
   - The `no_recipient` sentence says "Add their email" as words only. There is no act to add it yet; K10's "Add their email" act is R2.
   - After the header's COPY A NOTE was pressed, no new role=status line was seen. The note text was selected (the fallback), and headless clipboard access may be denied. Not confirmed either way.
   - The piece page's back bar reads "Studio Library · Draft" while the facts read "STUDIO LIBRARY PUBLISHED" (`us37-promote-desk-d-facts-zero.png`). This is outside this ticket.
   - With no offer pending, a save's Tab lands on SIGN OUT because bob is the last row. That is the natural order, not a jump.

## State left on local :54322 (released to SQ-1099)

- Ashgrove: bob's 3h are priced at $150, and the two re-pended 1h entries at $170. Rate rows: $150 (composer), $170 and $175 (Studio settings).
- Wren: two no-client draft milestone invoices (finding 2); one milestone was deleted by the 8a′ fixture.
- Cedar Lane Study: INV-0001 (issued, then Resend) and INV-0002 (issued by 8b). No email went out, because the send was answered in the browser.
- Phase One Personal Lamp: promoted twice (1400, then 390). It is now studio-layer with lead time NULL.
