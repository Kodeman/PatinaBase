# R1 walk: phase-1 hardening (SQ-1060, attempt 2)

- **Walk SHA:** main `36c0a2ff7` (SQ-1091 on top of 33f7347a6 and f766d7e6c). The worktree carried only this harness on top. No migrations changed between f766d7e6c and 36c0a2ff7.
- **LOCAL only:**
  - The dev server takes its env from `supabase status` and refuses any URL that is not `http://127.0.0.1:*`.
  - Every session checked that the JWT `iss` was `http://127.0.0.1:54321/auth/v1`.
  - 0 requests went to supabase.co or patina.cloud.
- **Seeds:** `walk-seed.mjs`, run after `pnpm supabase:reset` in attempt 1. Attempt 2 reused that DB.
- **Flags:** `NEXT_PUBLIC_FLAG_OVERRIDES=studio-workspaces:true,ask-the-paper:true,one-voice:true,agreement-parts:true`. These match prod, where `studio-workspaces` is at 100%. Without the override, Account → Studio settings does not exist locally, so the K8 rate surface cannot be reached.
- **Browser:** headless Chromium (Playwright 1.58.2) with reduced motion. Desk is 1400×900 at DPR 1; phone is 390×844 at DPR 2. PNGs are downscaled to 1600px only when larger.
- **Raw probe JSON:** `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1060/`.
- **Run:** `node walk.mjs <group …>`. The groups are band, band0, member, header, rate, k8, k8d, solo, picker, create, name, lows, link.

## Findings, worst first

1. **HIGH: "Set Phase One Bob's rate" opens the rate field invisibly under the composer.**
   - Path: Leah's composer on Ashgrove → Set.
   - What works: the act switches the viewer studio to Local Dev Studio (the account sheet reads "STUDIO 2 OF 2"). It also focuses `Hourly rate for Phase One Bob`.
   - What breaks: the Account sheet renders **beneath** the open "Draw an invoice" sheet. `elementFromPoint` at the field's centre returns the composer, and the PNG shows only the composer.
   - A keyboard user types a rate into a field they cannot see. Saving raises "3.0 hours were logged before this rate. Price them at $150.00/hr?", which is also hidden.
   - Esc closes the hidden account sheet, not the composer, and focus returns to Set. Attempt 1's run saved $150 this way without the field ever being visible.
   - Evidence: `s6-leah-k8-desk-b-account.png`, `-c-offer.png`, `-probe-a-after-set.png`, `-probe-b-after-esc.png`; verification `k8-stacking-desk.json`.
   - The composer → Price them path does not work. The flow passes only through the Account page's own doorway (row 6b).
2. **MEDIUM: the K5 header act is not gated.**
   - A plain member (bob) on Leah's Quill Lane Porch sees `MESSAGE THE CLIENT` / "Link a client first." / `LINK A CLIENT` in the document header.
   - Pressing it opens the household sheet with "Link a household…". The composer correctly says "Ask Leah Hartwell to link one" and offers Copy a note.
   - Only `invoice-composer.tsx` consults `useDocumentClientLinkHold`.
   - Not exercised: bob picking a client. The server should refuse with 42501.
   - Evidence: `s2-member-header-desk.png`.
3. **MEDIUM (keyboard): after a rate save, focus jumps to "⏻ SIGN OUT".**
   - Leaving a rate field with Tab saves it, and focus then lands on the account sheet's last control.
   - "Price them" is 59 Tab presses away from there.
   - Evidence: `s6-leah-k8-direct-desk-kbd.json`.
4. **LOW: the account sheet header disagrees with the studio body after a switch.** The header still reads "LEAH HARTWELL · OWNER" while the body shows Local Dev Studio (2 of 2).
5. **LOW: the copy says "3.0 hours" and "2.0 hours".** House style would print "3 hours".
6. **LOW: with the client linked and 0 lines ticked, Draft the invoice shows no reason before it is pressed.** Its `aria-describedby` status is empty until the press. This is the R1 behaviour; the spotlight arrives in R2.
7. **Observed, not a defect:**
   - When a plain member presses the held Draft, focus **stays on Draft the invoice**, and the status fills with "Ask Leah Hartwell to link a client." The brief expected focus to land on the ask line.
   - When the owner presses it, focus moves to `LINK A CLIENT`.
   - Name studio ran after bob's rate existed, so SQ-1093 F1 ("…has no rate for this project's designer yet…") was not met.

## Matrix (P pass · F fail · — not walked)

| # | Scenario | 1400 | 390 | Keyboard | PNGs |
|---|---|---|---|---|---|
| 1 | Owner, not lead (Leah on bob's Ashgrove), links a client from the composer: held Draft → focus to LINK A CLIENT → household sheet → Client User from the lead's book → DB `client_id` set → Esc returns to Draft and the client hold is gone | P | — (mutating; desk once) | P (held press lands on LINK A CLIENT; picker by keys) | s1-owner-links-desk-a…d |
| 2 | Plain member (bob, Quill): "Quill Lane Porch has no client yet. Ask Leah Hartwell to link one." + quoted note + COPY A NOTE; no Link act in the composer | P | P | P (26 Tab to the accounts band, 2 to the entry, 12 to Draft; Enter keeps focus on Draft and the status announces the ask) | s2-member-ask-* |
| 2b | Plain member, header Link a client (finding 2) | F | — | — | s2-member-header-desk |
| 3 | Two-studio designer (Leah) gets a picker: Choose a studio / Leah Hartwell / Local Dev Studio; creating "Quarry Shed" with Local Dev Studio stamps that studio | P | P (picker present) | — (opened via ⌘K and typed; the picker was not driven by Tab) | s3-picker-two-studio-* |
| 4 | One-studio designer (bob): no picker; "Bramble Loft" is stamped Local Dev Studio | P | — | — | s3-picker-one-studio-* |
| 5a | Owner names the studio on an employee's NULL project (Leah, Linden): "Linden Attic isn't tied to your studio yet." → Name studio → "Name Local Dev Studio? This can't be undone." with focus on NAME → Enter → DB studio = Local Dev Studio | P | — (mutating) | P | s5-name-studio-desk-* |
| 5b | Solo owner on a legacy NULL row (alice, Old Mill): "This job was opened before your studio had one home. Write to hello@patina.cloud and we'll set it." + Copy the address; no Name studio (decision #3) | P | — | — | s5-solo-legacy-desk |
| 5c | Solo owner sets her own rate (alice, Fernhill): "2.0 hours… Price them at $120.00/hr?" → Price them → "Priced the hours logged before this rate."; pending 1→0 | — | P | — | s6-price-them-alice-self-phone-* |
| 6a | K8 from the composer as Leah: "3H WAITING FOR A RATE…" + SET PHASE ONE BOB'S RATE (the attempt-1 HIGH is fixed); Set → hidden field (finding 1) | F | rate group P | F | s6-leah-k8-desk-*, s6-rate-group-owner-* |
| 6b | K8 via Account → Studio settings as Leah: switch to Local Dev Studio → bob $170 → offer → Price them → "Priced the hours logged before this rate."; DB pending 2→0 (`studio_member:17000:25500` ×2); composer group cleared (rows $170.00/H, $255.00) | P | — | P (59 Tab; finding 3) | s6-leah-k8-direct-desk-* |
| 6c | Plain member's rate group: "Ask Leah Hartwell to set a rate." + Copy a note; no Set act | P | — | — | s6-rate-group-member-desk |
| 7 | K6 band: no money (new Quarry Shed) gives "No client linked"; with money (Ashgrove hours, Wren FF&E) "Link a client before you bill this job." leads SETUP | P | P (Ashgrove) | — | s7-band-* |
| 7b | SQ-1063 cold-load row jump (Ashgrove, no client, money = unbilled hours; hard load, 250ms sampling for 25s): the band line went "" → "OPEN THE PIECES · All open 4" at 1.75s with no visible jump; SETUP rows sit behind "All open". Quarry's count went 3→4 at 1.5→1.75s | not observed | not observed | — | s7-band-*-load* |
| 8 | Account-band milestone + folio send errors show house sentences (no codes) | — | — | — | NOT WALKED: needs a failing send (local edge runtime stopped) and a milestone-error fixture; DB released to the US-37 queue |
| 9 | SQ-1030 lows: TOTAL inside the panel (390: 281 < frame 372; 1400: 617 < 1060); scrim covers the full height (0→844 / 0→900); no horizontal page scroll; remove × inside the frame; held focus cue (`data-held-focus-cue`, 2px outline) | P | P | P | s9-lows-*, s2-member-ask-*-b |
| 9b | SQ-1030 lows: dedupe and `?sheet` consumed | — | — | — | not walked separately |

## State left on local :54322
- Ashgrove: client linked. Bob's two hours are priced at $170 in Local Dev Studio.
- Linden Attic: studio set to Local Dev Studio.
- Fernhill: alice's hours priced at $120.
- New projects Quarry Shed (Leah, Local Dev Studio) and Bramble Loft (bob).
- Bob's rate rows: $150 (the hidden save) and then $170.
