# Visual check: US-54 deck (Playwright, 1440x900 and 390x844)

Renders are in /private/tmp/claude-501/-Users-kody-Code-patina-merged/a9d6d2d8-91d1-4fbe-836d-9aebe777da59/scratchpad/us54-renders (sheet-NN-{1440,390}[-dark].png, vp-NN-{1440,390}.png for true viewport, walk-{W}-fNN.png, act-{W}-*.png). Light and dark were both captured (dark: sheets 1, 5, 8, 12, 15).
Note: element screenshots (sheet-*, walk-*) show the sticky top bar and the off-screen "Skip to the deck" link painted over content. This is a capture artifact. The vp-* viewport renders (using the deck's own arrow navigation) show no overlap; html has scroll-padding-top:72px.

## Passed
- Horizontal scroll at 390: none. documentElement scrollWidth equals clientWidth (390) on every sheet and every walk frame. No element crosses the viewport edge.
- Broken images: 0 on all 20 sheets. No console errors.
- Mockup walk, both widths: all 14 frames reached by clicking the on-screen act. Frame 2 (short amount, Use $23,123.19, Record), frame 4/5/9 gating (radio / Freight / option), the in-frame acts on frames 8, 10, 11, 12, 13 and 14, Back, Next frame, Start again and the act jump buttons all behave. Frame 2 short entry stays put with the hint, as designed.
- Reflow at 390: frames 1, 8, 12, 13 reflow via the container query (surface 336px, no overflow). The 1440/390 toggle works at 1440 (frames 1, 8, 12, 13 shown narrow).
- Shadows/gradients/filters: none found in CSS or inline styles.
- "AI" wording: none. Street address or zip in deck text: none (the only 5-digit matches are migration numbers 00703/00704/00809).
- Dark mode: deck chrome follows the scheme, text is readable. The mockup stays light by design.

## Findings
| # | Sheet / frame | Width | Severity | Confidence | Finding | Render |
|---|---|---|---|---|---|---|
| 1 | Sheet 10 (Fees that come later), image 05-order-paper-sofa-1440.jpg | 1440, 390 | high | high | Evidence screenshot shows street addresses and zips in legible text ("Dock Ln, Madison, WI 53716", "... St, Madison, WI 53703", "Hartwell Rd, Madison, WI 53711") plus "HARTWELL RESIDENCE". They are seeded test data, but this contradicts the deck rule and the walk footer ("The client's name and address never appear"). Needs a redaction or a recrop. | sheet-10-1440.png, m/crop05.png |
| 2 | Sheet 17 (Places land on the job), images 32, 33, 34 | 1440, 390 | high | high | The same three seeded addresses and zips appear in all three ship-to screenshots (sheet caption says "Seeded test addresses" for 32). | sheet-17-1440.png, m/crop3234.png |
| 3 | Sheets 3, 6, 11, 12, 15, 16, 18 (evidence images 07, 12, 26-29, 37b, 38, 39, 44, 47, 48, 49) | 1440, 390 | med | med | Seeded "HARTWELL RESIDENCE" job label and other seeded-job names are visible, and the Next.js dev badge (round "N") sits bottom-left of nearly every evidence screenshot. The badge is a dev-tool artifact, not product UI. Addresses in the rest were not confirmed because of tiny text, so a manual pass is advised. | sheet-03-1440.png, sheet-16-1440.png |
| 4 | Sheet 5, frame 1 | 390 | low | high | At a 390 viewport the 1440/390 width toggle still shows "1440" pressed, although the surface is forced to 334px and has already reflowed. The toggle is meaningless at that size. | walk-390-f01.png |
| 5 | Sheet 5, all frames | 390 | low | high | The walk toolbar stacks five acts and the stepper (about 390px tall) before any frame content, so on a phone the frame starts well below the first screen. | walk-390-f01.png, vp-05-390.png |
| 6 | Evidence figures, all sheets | 390 | low | high | The 1440-wide screenshots scale to about 330px, so their text cannot be read. The expand control exists (image-toggle) but was not exercised. | sheet-03-390.png |
| 7 | Sheets 1, 3-18, dark mode | 1440 | low | med | Bright light-theme evidence screenshots and the light mockup sit on a dark page. Intentional per README; noted only for contrast of surround. | sheet-05-1440-dark.png |
| 8 | Sheet 9 (client's price) mock, Sheet 14 | 1440 | low | low | Walk frame 9 shows the "Why, in a few words" field as grey placeholder-style text "sale ended at checkout" before any option is chosen. It reads as filled when it is only a hint. | walk-1440-f09.png |

Counts: high 2, med 1, low 5. No overflow, clipping, overlap, contrast, broken-image or non-advancing-act defects.
