# US-37 walk B (SQ-1110): library images, item image manager, optional lead time, presentation branding

Verdict: **PASS on every acceptance item, with 3 low findings (F1–F3).** None blocks release B.

## Setup

- Release: `release/us37-b` @ `b2f004fd7`, run from `.claude/worktrees/us37-release-b`.
- Local Supabase only. Migrations 008xx after each reset: `00800, 00806, 00807, 00808, 00812` (no 00809–00811).
- User JWT `iss` = `http://127.0.0.1:54321/auth/v1` (checked after each login). Both portals ran with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` exported from `supabase status -o env`. No `.env.local` was used.
- The orchestrator's SQ-1107 verify reset the shared DB from main at ~08:34Z. Observations from 08:34Z until the re-reset (~08:40Z) were discarded. The DB was re-reset from the release-B worktree, re-seeded, and the client checks were redone. Designer acts from 08:18–08:33Z on the release-B schema stand. Item 2e's upload/primary/reorder was redone by keyboard after the re-reset.
- Seeds (local only, in this folder): `seed-storage.sh` (pictures in `product-images/walk-b`, logo in `studio-logos/walk-b`), `seed-backfill.sql` (Cedar Lane brass light), `seed-backfill-aspen.sql` (Aspen walnut table, client-visible), `seed-identity.sql` (state A), `seed-identity-empty.sql` (state B).
- Harness: Playwright (`steps.cjs`, `lib.cjs`). The client CSP allows `https:` images only, so locally hosted `http://127.0.0.1:54321` pictures fall back to the line drawing (ENV-2). The client shots therefore use `BYPASS_CSP=1`, a Playwright context option that is local-only. Prod storage is https. Without it, the DOM still carries the right URLs.
- Screenshots: `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1110/`, all resized with `sips -Z 1600`.

## Results

| # | Acceptance | Result | Evidence |
|---|---|---|---|
| 1a | Library item with 3 images, added to a project: all 3 in the project item view | PASS | Composed "Walk B Three Picture Chair" with 3 folio URLs (`i1-compose-*-1400`). Then "Add to a project" by keyboard (Tab ×17, Enter, Tab to the project, Enter), to Cedar Lane and to Aspen Loft (`i1-add-dialog-1400`). The DB holds 3 `library` rows per item, with position 0 primary. The unfolded line shows 3 loaded pictures, lib-1 primary (`i1-new-pictures-{1400,390}`, `i1-list-{1400,390}`, `i1-aspen-list-{1400,390}`). Cedar is in install mode, so its panel is read-only by design. |
| 1b | All 3 in the client presentation | PASS | Aspen walnut table (client-visible line, client@patina.dev). The row shows primary lib-1. "open its record" shows a gallery `Pictures of Walnut dining table, 96"` with 3 imgs, alt "picture n of 3", all loaded (`i1-client-walnut-{1400,390}`). A freshly added candidate line is not on the client threshold until it is authorized (existing behavior), so the client half was walked on an authorized line. |
| 1c | Backfill: an item that existed before the migration shows its library images | PASS | `seed-backfill.sql` / `-aspen.sql` deleted the item's picture rows, gave its piece 3 images, and ran `_backfill_ffe_item_library_images()`, which returned 3. Designer: Cedar brass light, 3 pictures (`i1-backfill-pictures-{1400,390}`). Client: walnut table above. |
| 2a | No-library item: upload 2, keyboard | PASS | DR-01 earlier (checkpoint), then again on Aspen "Paintwork and plaster" (no product): Tab to Upload pictures, Enter, chooser, 2 files, 2 `upload` rows. |
| 2b | Make the second primary, keyboard | PASS | Shift+Tab to Make primary, Enter. DB: position 1 `is_primary=t`. |
| 2c | Reorder, keyboard | PASS | Shift+Tab to Earlier, Enter. DB: position 0 = upload B (primary) (`i2e-designer-pictures-1400`). |
| 2d | Primary in the item list and the piece plate | PASS | `i2-list-row-{1400,390}`, `i2-plate-{1400,390}` (checkpoint), `i2e-list-row-1400` (row img = upload B). |
| 2e | Primary in the client presentation | PASS | The Aspen client row for Paintwork and plaster shows "UPLOAD B" (`i2e-client-rows-{1400,390}`); its DOM src is the primary's storage URL. |
| 2f | Unlink one; the file stays in storage | PASS | Checkpoint: link row removed, `storage.objects` row kept, public GET 200 (`i2-d-unlinked-390`). |
| 2g | Library-sourced item: "From the library item" lists the remaining images | PASS | Aspen chair (3 library pictures): Unlink on picture 3 by keyboard (Shift+Tab ×2 from From the library item, Enter). Focus moved to the neighbour's Make primary; DB keeps lib-1 and lib-2. Then From the library item, Enter: it offers exactly lib-3 ("Add library picture 1") (`i2g-before-1400`, `i2g-library-open-{1400,390}`). |
| 5a | Save a library item with no lead time | PASS | Composed "Walk B No Lead Stool" with no lead time: `lead_time_weeks` NULL. Promoted to the studio library (the 00806 path) with "LEAD TIME (WEEKS, OPTIONAL)" blank, by keyboard Enter on Promote to Studio: `layer=studio`, `lead_time_weeks` NULL, dialog closed, no error (`i5-promote-filled-1400`, `i5-promote-after-1400`). |
| 5b | Card and detail show no "null", "0 weeks" or empty label | PASS | Card: "Walk B No Lead Stool · Walk B Joinery · NEEDS TEACHING · ONE SPECIFICATION · $1,800", with no lead label (`i5-card-{1400,390}`). Detail: "LEAD TIME / Confirm with maker" (`i5-detail-lead-{1400,390}`, `i5-detail-{1400,390}`). A body scan for null/undefined/0 weeks/NaN found only "proveNANce". |
| 6a | Firm logo + name, lead name, email, phone (falling back to the firm's), website, quiet footer | PASS | Cedar Lane, client-solo: logo (loaded, 600px natural, max-height 32px), "Local Dev Studio", "Leah Hartwell · studio@localdevstudio.example · (612) 555-0144 · localdevstudio.example", then "Prepared by Local Dev Studio · Sent through Patina". Typographic footer, no banner (`i6a-filled-footer-{1400,390}`). The lead phone wins over the firm phone, and the firm public email over the login email (R178). |
| 6b | Logo, phone and website emptied: clean, no broken image, no empty separators | PASS | `seed-identity-empty.sql`: "Local Dev Studio / Leah Hartwell · studio@localdevstudio.example". No logo element, 1 separator, 0 broken images on the page (`i6b-empty-footer-{1400,390}`). |
| D4 | Zero shadows on new surfaces; text wraps, never truncates | PASS with F1 | Audit (computed box-shadow, drop-shadow, ellipsis, line-clamp, clipped overflow): line-pictures panel, client room-band record and gallery, presented-by footer, library card: 0 shadows, 0 truncation, no horizontal page scroll at either size. But F1: a picture button label overruns its frame at 390. |

## Findings

- **F1 (low, high confidence). The picture act label overruns the Pictures section at 390.** "UNLINK — THE FILE STAYS" ends at x=384 against the section's right edge at 341, so it runs past the bordered list and the section frame instead of wrapping. Seen on DR-01 (checkpoint) and again on the Aspen chair (`i2g-library-open-390`). At 1400 the first tile's label also crosses its cell divider by a few px (`i2g-library-open-1400`). Repro: 390×844, Aspen Loft, Not in a room yet, unfold a line with 2+ pictures, compare each button's rect.right with `[data-testid=line-pictures]` rect.right.
- **F2 (low, medium confidence). Picture acts are not announced, and focus drops after an upload.** After an upload, focus fell to `<body>` (checkpoint). After make-primary, reorder and unlink, the panel's `role=status` was empty when read about 5s later. Focus handling after unlink and reorder is good: it lands on the neighbour's act or stays on Earlier. Repro: keyboard Enter on Make primary or Unlink, then read `[data-testid=line-pictures] [role=status]`.
- **F3 (low, medium confidence). Repeated picture acts share one accessible name.** Each tile's buttons are just "Make primary", "Earlier", "Later", "Unlink — the file stays", with no aria-label naming the picture (e.g. "picture 2 of 3"). A screen-reader user tabbing through 3 tiles hears three identical "Unlink" buttons. Repro: `[...document.querySelectorAll('[data-testid=line-pictures] button')].map(b=>b.getAttribute('aria-label'))` gives all null.

## Observations (not acceptance items, pre-existing surfaces)

- ENV-2: the client CSP `img-src https:` hides local http storage images, and the row falls back to the line drawing. Local only.
- Item 3: auto labels assigned on add: chair "003" (Cedar, no room) and "001" (Aspen); DR-01 earlier. The designer list row does not show doc_code.
- Client "Previously" rows truncate long titles with "…" (e.g. "Authorization No…"). The client plan diagram's room labels overlap ("Living RoomOrders in progress"). Both are pre-existing surfaces outside US-37.
- Harness: a headless file chooser opened with Enter on Upload pictures this run, and with Space in the checkpoint run.
