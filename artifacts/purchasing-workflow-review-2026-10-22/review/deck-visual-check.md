# Deck visual check (Sonnet) — SQ-1753 candidate 7853b27a5

**Verdict:** The deck has no layout breakage. At both viewports and in both schemes there is no horizontal scroll, no failed images and no console errors. Keyboard navigation works. The main weakness is that the evidence screenshots are unreadable at 390, and some are barely readable at 1440. I viewed 390 renders for sheets 1, 3–7, 9, 11, 13, 15 and 17, and 1440 renders for sheets 2, 3, 10 and 18. I did not view sheets 8, 12, 14 and 16 in any render. I did not examine the other 1440 and dark renders, so findings about them rest on the shared CSS.

Renders are in `/private/tmp/claude-501/-Users-kody-Code-patina-merged/a9d6d2d8-91d1-4fbe-836d-9aebe777da59/scratchpad/us50-renders/`. They are named `sNN-{1440|390}-{light|dark}.png`, each a full-sheet element screenshot of one sheet. `vp-390-top.png` and `vp-390-s3.png` are real viewport shots. The scripts are `run2.js` and `nav2.js`.

I hid the sticky topbar in the full-sheet shots, because it otherwise overlaps the content in the stitched captures. The real-viewport shot of sheet 3 at 390 shows no overlap.

## Automated checks
- **Horizontal scroll at 390:** `scrollWidth` is 390 in light and dark, so there is none. At 1440 it is 1440. No element extends past the viewport.
- **Images:** none with `naturalWidth` 0 in any of the four viewport and scheme runs.
- **Console and page errors:** none in any run.
- **Keyboard (1440):** ArrowRight moves from sheet 1 to 2, and ArrowLeft and PageUp move back correctly. PageDown moved from sheet 2 to sheet 3.

## Findings

1. **Sheets 1–7, 9–11, 13, 15 and 17, at 390, both schemes (HIGH): evidence screenshots are illegible.**
   - The "Today · local walk" thumbnails are 1440-wide shots squeezed into about 358px by 280px. UI text comes out at roughly 2–3px.
   - Examples are `02v-pieces-overview-viewport-1440.png` (sheet 1), `42-pieces-overview-status-words-1440.png` and `56-phone-pieces-status-390.png` (sheet 4), `05-order-paper-sofa-1440.png` (sheet 6), and the sheet 9 acknowledgement-check shots.
   - The key detail (status words, ack check, forms) cannot be read until the user taps "Expand / restore evidence".
   - The sheet 7 shot `55b-po-preview-send-obscured` shows a large near-black block, which is the point of the evidence but reads as a broken render.
   - CSS fix: at `max-width:640px`, set `.image-toggle img{height:auto;min-height:0;max-height:none;object-fit:contain}`. Alternatively give the thumbnail a `min-width` inside an `overflow-x:auto` wrapper so it scrolls and stays zoomable. Also make the "Expand / restore" label look like a button, for example with a "Tap to enlarge" prefix.

2. **Sheets 1, 3 and 5, at 1440 (MEDIUM): portrait phone and document shots are too small to read.**
   - `01-document-1440.png`, `23-phone-contents-menu-390.png` and the 390px phone shots sit as narrow strips (about 125–130px wide) inside 280px-tall frames with wide empty margins.
   - The key detail (the phone contents menu, the document long-page) is unreadable.
   - CSS fix: raise the frame height for portrait images to about 480px (`.walk-photo.phone-shot .image-toggle img{height:480px}`). Or auto-expand portrait images. The "crop" variant is fine.

3. **Sheets 3 and 7–17, at 390 and 1440, both schemes (LOW): the CSS crops hide the context the captions rely on.**
   - Several 1440 screenshots are cropped to the top 25% with `object-position:50% 25%` (the `.crop` variant). In others (sheets 3, 7 and 9) the modal's surrounding page is a dimmed grey that dominates the frame.
   - CSS fix: `object-fit:contain` with a taller frame, or a per-image `object-position` targeted at the modal.

4. **Sheet head, all sheets, 1440, both schemes (LOW): the head rule is short.**
   - The top rule and the "US-50 · BUYING FOR A JOB ... NN / 18" meta row span only about 462px, while the rest of the sheet is about 1280px wide.
   - It is full width at 390. It reads as an unintended narrow rule above the h2.
   - Fix: `.sheet-head{width:100%}`, or `.sheet-head>.meta{width:100%}`. The grid is probably sizing to its content, so check `justify-items`.

5. **Sheet 3 and the other paired-specimen sheets, at 390 (LOW): the 390 specimen duplicates the 1440 one.**
   - On sheets 3, 4, 6, 7, 10 and 11 the "390 drawing" stacks directly below the near-identical "1440 drawing". At 390 the page shows the same content twice, because the desktop drawing also collapses to a single column.
   - The 390 drawing does not collapse or break. Its buttons wrap correctly and keep a 44px height.
   - Fix: for `max-width:640px`, hide `.drawings .desktop`, or collapse the pair into a tab or toggle.

6. **Sheet 18, at 390 and 1440, dark (LOW, informational): the ruling and register disclosures are fine.**
   - They show a bare triangle ▶, a muted "Open for discussion" label and a clear label contrast. I did not see a defect here.
   - "Open for discussion" is small, about 12px. If the contrast check fails, raise it to `var(--ink)`.

7. **Keyboard, 1440 (LOW): the counter does not update after PageDown.**
   - After PageDown the viewport was at sheet 3 but the nav counter still read "02 / 18". It corrected on the next ArrowRight.
   - The counter is probably updated only by the `go()` handler. PageDown looks like a native scroll that does not drive the counter.
   - Fix: update the counter from an `IntersectionObserver` or a scroll listener, so any scroll method updates it.

8. **All sheets, dark (LOW): the evidence screenshots are light-mode captures.**
   - They show as bright rectangles on the dark paper, within a darker `--rail` frame. They are legible as evidence, and there is no contrast problem in the live text.
   - The body text, meta lines, borders and buttons in dark (`#F2EDE6` on `#2A2622`, `--muted #C7BEB3`) all read cleanly.
   - Optionally add `filter:brightness(.92)` to `.image-toggle img` in dark. This is cosmetic.

9. **Typography (consistent, nothing to fix):**
   - The Playfair display h2 and Inter body are the same on every sheet.
   - The mono meta and caption text at 10–11px is very small, especially the footnote and source lines. Sheet 17's "[H] walk/walk.md..." footnote wraps awkwardly.
   - Consider raising `.footnote` and `.walk-photo small` to 12px.

I did not find any text-over-image problems, proposal specimens that collapse at 390, or clipped text.
