# US-37 walk B (SQ-1110): PARTIAL, continuation checkpoint

This walk is not finished. The table records only what has been observed so far.

- Release: `release/us37-b` @ `b2f004fd7`, run from `.claude/worktrees/us37-release-b`.
- Local Supabase only. The JWT `iss` was `http://127.0.0.1:54321/auth/v1`.
- Both portals started with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, exported from `supabase status -o env`. No `.env.local` was used.
- Migrations: 00800, 00806, 00807, 00808, 00812, with no 00809. The orchestrator rebuilt the stack at about 07:30Z after a storage 42P10 environment fault.
- Screenshots are in `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1110/`, resized with `sips -Z 1600`.
- Driver: `steps.cjs`, `lib.cjs` and `seed-*.sql` in this folder.

## Results so far

| # | Acceptance | Result | Evidence |
|---|---|---|---|
| 2a | Upload 2 pictures to a no-library item, keyboard only | PASS | DR-01 "Walk B plaster wall niche" (Aspen Loft, placeholder). Space on Upload pictures worked. `i2-a-uploaded-1400.png` |
| 2b | Make the 2nd picture primary, keyboard | PASS | `i2-b-second-primary-1400.png`. DB: position 1 `is_primary=t` |
| 2c | Reorder, keyboard (Later on picture 1) | PASS | `i2-c-reordered-1400.png`. DB: position 0 = B (primary) |
| 2d | The primary shows in the item list and the piece plate | PASS | `i2-list-row-{1400,390}.png`, `i2-plate-{1400,390}.png` |
| 2e | The primary shows in the client presentation | NOT YET | The placeholder is a candidate, so the client threshold does not show it (`i2-client-probe-1400.png`). It needs presenting or releasing first. Local client CSP `img-src https:` also blocks http local-storage images (see ENV-2). |
| 2f | Unlink one picture; the file stays in storage | PASS | Keyboard at 390 (`i2-d-unlinked-390.png`). The link row was removed, the `storage.objects` row remains, and a public GET returns 200 |
| 2g | Library-sourced item: "From the library item" lists the remaining pictures | NOT YET | |
| 1 | A library item with 3 images shows all 3 in the project item view and the client presentation, plus the backfill | NOT YET | `seed-backfill.sql` is ready. The pre-wipe compose run proved the 3-URL folio save works (`i5-compose-after-save-1400.png`) |
| 5 | Library item saved without a lead time | PARTIAL | Before the wipe, the personal draft saved with `lead_time_weeks` NULL. Its detail shows "LEAD TIME Confirm with maker", with no null or 0 weeks (`i5-detail-1400.png`). The card, the studio-layer save (00806 path) and the 390 views are not yet walked. |
| 6a | Filled: firm, logo, lead name, email, phone, website | PARTIAL | The text renders "Local Dev Studio · Leah Hartwell · studio@… · (612) 555-0144 · localdevstudio.example": lead phone first, firm public email before login email (R178). The logo did not load locally because CSP blocks http://127.0.0.1 (ENV-2). Screenshots `i6-filled-{1400,390}*.png` |
| 6b | Emptied logo, phone and website render cleanly | NOT YET | |
| D4 | No shadows; wrap, never truncate | PARTIAL | Pictures panel and PresentedBy: 0 box-shadows, 0 ellipsis. F1 below |

## Findings so far

- **F1 (low, high confidence).** At 390, "UNLINK — THE FILE STAYS" overflows the Pictures section. The button's right edge is 384px against a section right edge of 341px, so the label runs past the bordered list and the section frame instead of wrapping (`i2-pictures-390.png`). Repro: 390×844, unfold a line with 2 pictures, then read the button and `[data-testid=line-pictures]` rects.
- **F2 (low, medium confidence).** After a keyboard upload, focus drops to `<body>`, so a keyboard user loses their place. After make-primary, reorder and unlink, the `role=status` line was empty when read about 5s later, so those moves may not be announced. Repro: Space on Upload pictures, then read `document.activeElement`.
- **ENV-1 (resolved by the orchestrator).** After the first reset, storage uploads returned 42P10 because the storage schema was ahead of storage-api v1.72.1/v1.73.1. The stack was rebuilt.
- **ENV-2 (local only).** The client-portal CSP `img-src 'self' data: https: blob:` blocks the http local-storage URLs, so the logo and item pictures cannot render visually in the local client. Prod storage is https.
- Item 3 note: auto label "DR-01" was assigned to the new Dining Room line. The designer list row does not show doc_code.
- Harness note: Enter on "Upload pictures" clicked the button and the hidden input, but headless Chromium raised no file chooser. Space did.

## Continuation: next steps

See the ticket comment headed "Continuation checkpoint".
