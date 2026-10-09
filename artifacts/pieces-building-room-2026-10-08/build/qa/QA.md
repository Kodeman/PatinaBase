# US-21 T-60 · Integrated QA of the Build room (first pass)

- **Tip walked:** `pieces/build-room` at 832701514. Local DB at 00762, seeded only with `e2e/document/pieces-fixture.sql`. There was no reset.
- **Walker:** the T-60 executor (Opus). It did not build the job.
- **Server:** designer portal `next dev --webpack -p 3410`, with the env from `playwright.pieces.config.ts`. Flags on: `ask-the-paper`, `one-voice`. For the flags-off row the same port was restarted with both flags removed.
- **Date:** 2026-10-09.
- **Raw evidence:** board-owned, under `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-666/`. Each scenario's focus trail and live-region text is in `kb-chromium-1440.jsonl`, `kb-chromium-390.jsonl`, `touch-webkit-390.jsonl`, `touch-chromium-390.jsonl` and `checks.jsonl`. The jpgs in this folder are the chosen screenshots, cut to 1400px.

## How each channel was driven

| Channel | How | Honest limit |
|---|---|---|
| Mouse, 1440 and 390 | T-59's `pieces-build-room.spec.ts` (Playwright clicks), run as the pinned verifier. | Scripted, not a person. |
| Keyboard only, 1440 and 390 | `keyboard.mjs`: after sign-in, every act is a key press (Tab, Enter, arrows, Esc, typing). History back uses `page.goBack()` because headless Chromium does not honour ⌥←. | Scripted. Times are machine times. |
| Touch, 390 | `touch.mjs`: WebKit with Playwright's `iPhone 13` profile (`hasTouch`, `isMobile`). Every act is a `tap()`. S3, S5 and S6 were repeated in Chromium with the same profile. | Emulation. **No real iPhone or simulator was used.** |
| VoiceOver | **NOT RUN.** It would mean turning VoiceOver on, with speech and keyboard capture, on Kody's machine during an unattended run. | In its place, the ARIA tree and every live-region string were recorded, below. These do not stand in for a screen-reader pass. |
| S1 by hand | **NOT RUN.** No human walker. | Only machine times are recorded. |

## S1–S8 · pass and fail per channel

Step counts count every key press, typed field or tap. The column headings are: **KB** = keyboard, **T-WK** = touch in WebKit, **T-CR** = touch in Chromium.

| Scenario | KB 1440 | KB 390 | T-WK 390 | T-CR 390 | Named refusal met | Return to overview |
|---|---|---|---|---|---|---|
| **S1** four lines | **FAIL** (F1, F2). 84 steps, 75 of them Tabs to reach Living's entry. The four Enters themselves pass: the caret stays and each line is announced. 14.4 s. | **FAIL** (F2). 42 steps (33 Tabs). 14.1 s. | PASS. 11 taps. 12.4 s. | — | None on this path. | Esc → `#pieces-room-<living>`, with `data-returned=true`. Focus lands on body (F6). |
| **S2** oak floor, four rooms | PASS. 23 steps. The chips read `Hall · 120 sq ft`, `Living Room · 320 sq ft` and so on. | PASS. 13 steps. Focus moves to the pane's h2. | PASS. 2 taps. | — | None. | Esc, returned. Focus on body. |
| **S3** fill, shower | Fill PASSES: Enter takes the first result, and the need survives. Tab-indent was **NOT CONFIRMED** by keyboard (F11). 198 steps. | Fill PASSES. 30 steps. Grouping is not on the phone, by design. | **FAIL** (F3). The tap on the `Fill with a product` menu item does nothing. | PASS. 5 taps. | None. | Returned. |
| **S4** allowance, labor | PASS. 31 steps. `Up to $4,500` shows. Focus is lost after submit (F6). | PASS. 21 steps. | **FAIL** (F3). | not run | `every PO line must be an active selected line…`, the maker-PO refusal of labor (spec). | Returned. |
| **S5** remove, undo | PASS with F5. 275 steps: 184 Tabs to the row (F1) and 34 Tabs to UNDO. | PASS with F5. 123 steps (16 Tabs to UNDO). | **FAIL** (F3). | PASS. 4 taps. | 409 `A product on a line can't be deleted. Merge it into the one you keep.` (spec). | Esc is held by a filled input, as the contract says, so the back link was used. Returned. |
| **S6** move | Move PASSES. The refusal shows, but with F4. 147 steps. | Same as 1440. 70 steps. | **FAIL** (F3). | PASS. 7 taps. The refusal alert shows. | `This line sits in 4 rooms. Change its rooms instead.` | Returned. |
| **S7** where am I | **FAIL** (F2). After landing, the lens is 191 Tabs away. Lens change and back pass. | **FAIL** (F2). 86 Tabs. | PASS. 4 taps plus back ×2. | — | `Link a client to this job before releasing.` (spec). | Back ×2 and Esc both land at the room. No discard button. |
| **S8** finishes, print | PASS with F6. Focus drops to body after the Product, Sheen and Swatch Enters. 38 steps. Print is 4 Tabs away. | PASS with F6. 28 steps. | PASS. 7 taps. `scrollWidth` is 390. | — | None. | Print → `← BACK TO FINISHES` → ← job. Returned. |

**Mouse, 1440 and 390:** see the pinned verifier result in the SQ-666 thread.

**Announcements heard in the live regions:**
- `Added <line> to Living Room.` after each S1 Enter.
- `1 Library result for "Emtek".`
- `Removed Rattan lounge chair ×2 from Sunroom.` with an Undo countdown.
- `Put back Rattan lounge chair ×2 in Sunroom.`
- `Moved Counter stools to Kitchen.`
- The refused move announces `Moved White oak floor… to Kitchen.` and then `This line sits in 4 rooms…` (F4).
- The fill, the allowance and ADD LABOR announce nothing.

**Screenshots:**
- Keyboard: `kb-1440-*.jpg` and `kb-390-*.jpg`.
- Touch: `touch-webkit-390-*.jpg`. The `*-error.jpg` files show the state after the failed tap.

## With `one-voice` and `ask-the-paper` on

| Check | Result | Evidence |
|---|---|---|
| US-19 paper | PASS. The eyebrow reads `PROJECT · WHOLE HOME RENOVATION`, Next reads `NEXT ─ 21 placeholders.`, the act is `FILL THE 21 PLACEHOLDERS`, and the count is `Standing · 4`. | `paper-band-1440.jpg` |
| `Record a change` at the Pieces head, no duplicate | PASS. There is one in `Pieces actions`, and it opens the sheet. Money's own `Record a change` is a separate region. | `record-a-change-flags-on-1440.jpg` |
| Band count = overview placeholders | PASS. Band 21, head 21, and the room rows sum to 21 (2+5+2+2+7+1+2). The Standing sheet lists `NEXT 21 placeholders`. | `standing-sheet-1440.jpg` |

## The orchestrator's 12 items (comment c_mv0dbw0n_f47767)

| # | Item | Result |
|---|---|---|
| 1 | Q7: the inline search never prices in Spec | PASS. The results print no `$`. `q7-spec-search-1440.jpg` |
| 2 | Plurals | **FAIL** (F8). Spec and Price print `9 roll`. `1 roll` is correct. |
| 3 | Chips carry units; focus after ADD LABOR | Chips PASS. Labor focus **FAILS** (F6): the line is made, but focus goes to body. `add-labor-1440.jpg` |
| 4 | Dark mode, 1440 and 390 | PASS. With `prefers-color-scheme: dark`, the portal paints its light stock, as CONTRACT §3.5 says. The lowest text contrast measured in any lens is 5.06:1. `dark-*.jpg` |
| 5 | Real VoiceOver pass in Chrome | **NOT RUN** (see channels). The ARIA names were checked: the lens group has `aria-pressed`, the row acts are `Acts for <line>` menus, `Move to room` is a menu, the refusal is `role=alert`, the merge confirm is the group `Confirm the merge`, and the Finishes table inputs are named `Product for Walls` and so on. |
| 6 | Catalog delete refusals | Admin half **BLOCKED** (F10): the local admin API answers 401 to a signed-in admin or superadmin. Designer half: a catalog product page shows no merge and no delete. The studio panel needs the media duplicate check, which is not running locally. T-59's spec covers it with a mocked route. |
| 7 | T-58b phone strip | PASS. The five lens buttons fit: Finishes' right edge is at 386. `scrollWidth` is 390 on all five lenses and the overview. |
| 8 | Record a change, flags off | PASS. The band is absent, one `Record a change` is at the Pieces head, and it opens the `RECORD A CHANGE` sheet. `record-a-change-flags-off-1440.jpg` |
| 9 | Placeholder counts, with no-vendor labor and a superseded line | The three UI counts agree (21, 21, 21): PASS. SQL disagrees, though (F9). |
| 10 | spec-pdf via `functions serve` | **NOT RUN** (time budget). Left for the continuation. |
| 11 | Two palettes in one room | SQL `pieces_w7_review_fixes_test.sql` case `f8_activation: ok`, run inside BEGIN/ROLLBACK. The browser half (Finishes shows the merged swatches after an activation) is **NOT RUN**. |
| 12 | Client-linked walk: release → PO → receipt → invoice | **NOT RUN** (time budget). Left for the continuation. |

## Findings (each one a fix ticket; none filtered)

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| F1 | High | **The Build room ignores `?room=` on landing at 1440, and in Chromium at 390.** The rail marks the room, but the sheet opens at Hall. Sunroom's section top sits at 2336px at 1440 and at 2963px at 390. The phone in WebKit did land at Dining. Likely cause: `rough-in-lens.tsx:481-484` scrolls in an effect keyed only on `[room]`, which runs before the sections render. Cost: 75 Tabs to Living's entry and 184 to Sunroom's rows. | `room-landing-sunroom-1440.jpg`, `room-landing-sunroom-390.jpg`, kb S1 and S5 |
| F2 | High | **No focus on landing.** Focus is on body after both a direct load and `Work this room`. From there, the lens buttons are 191 Tabs (1440) or 86 Tabs (390) away, and Living's entry is 75 or 33. | kb S1 and S7 |
| F3 | High (unconfirmed on device) | **Row-menu items do not respond to a tap in WebKit's iPhone profile.** `Fill with a product`, `Make it an allowance`, `Remove` and `Move to room…` all do nothing; the menu closes and the act never runs. The same taps work in Chromium's iPhone profile. Confirm on a simulator or iPhone before fixing. | `touch-webkit-390-S3-error.jpg` … `S6-error.jpg` |
| F4 | High (screen reader) | **A refused move announces success first.** The status says `Moved White oak floor, satin Bona finish to Kitchen.`, and only then does the alert give the refusal. | kb S6 trail; `kb-1440-S6-refusal.jpg` |
| F5 | Medium | **UNDO is hard to reach in time.** It is 34 Tabs (1440) or 16 Tabs (390) from where focus lands after Remove, with a 10 s countdown and no keyboard shortcut (WCAG 2.2.1). | kb S5; `kb-1440-S5-toast.jpg` |
| F6 | Medium | **Focus is lost to body in five places:** after `Make it an allowance`; after the Finishes Product, Sheen and Swatch Enters; after ADD LABOR; and after every return to the overview, where the returned room row is not focused. | kb S4, S8, every `after Esc`; checks `add-labor-focus` |
| F7 | Low | **Focus after a fill or a move lands in a wrong or unrelated entry row.** After a move it lands on the source room's `New line in Dining`. After a refused move it lands on `New line in Hall`, although the line is in Living. After a fill it lands on the room entry, not the filled row. | kb S3 and S6 |
| F8 | Medium | **Plural.** `9 roll` appears in the Spec and Price lenses (Bedroom wallpaper and its hanger); it should read `9 rolls`. | `checks.jsonl` → plurals |
| F9 | Medium (needs a ruling) | **The UI and SQL count placeholders differently.** With the hanger's vendor cleared, SQL `ffe_line_stage` stamps it `placeholder`. The overview, band and rows don't count it: they read 21, where SQL reads 22 non-superseded placeholders. Either the TS mirror and SQL disagree on a labor line without a maker, or the rule is intended. | `checks.jsonl` → counts-labor-superseded; `counts-labor-superseded-1440.jpg` |
| F10 | Unknown | **The admin catalog API answers 401 locally.** `DELETE /api/catalog/products/<id>` and `POST …/bulk` return 401 for a session that landed on `/dashboard`. So the 409 merge sentence was not seen in admin. The cause may be local env. | `checks.jsonl` → admin-delete-referenced |
| F11 | — (not confirmed) | **Tab-indent was not proven by keyboard.** Tabbing into a filled name selects all of it, so the next Tab moves on. Home does not move the caret on macOS. ⌘← was not tried. | kb S3 (1440) |
