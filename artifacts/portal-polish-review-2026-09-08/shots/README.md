# Shots index — portal-polish-review-2026-09-08

Compressed 8 September 2026: scaled to fit within 1200px using sips -Z 1200; full-page captures taller than 3000px converted to JPEG q80. slide-02…15-390 and reading-mode regenerated 8 September 2026 after an accidental deletion; same source, same tool.

Rendered with headless Chromium (Playwright, `playwright-core@1.58.2`) against
`file:///private/tmp/patina-design-proposal-2026-09-07-kul503/index.html`.
Each capture used a fresh browser context/page so the deck's inline init
script (which reads `location.hash` once, on page load) re-runs correctly —
navigating within one page via hash-only changes does not re-trigger it.

## proposal/ (36 files, ~15 MB after compression)

Full-page screenshots, `document.fonts.ready` + image-load awaited before
each shot. 1440-wide shots were passed through `sips -Z 1800` per spec
(no-op for all of them — none exceed 1800px in either dimension). The
`reading-mode-1440.jpg` full-page capture (1440×13803 originally) is the
exception: at that height, `sips -Z` would scale by the long (height) edge
and crush the width, so it was instead resampled by width only
(`sips --resampleWidth 1200`) before JPEG conversion; see note below.
`pngquant` is not installed on this machine, so no additional lossy
compression was applied.

| File | Width | Description |
|---|---|---|
| `slide-01-1440.png` / `slide-01-390.jpg` | 1440 / 390 | Cover — "A home taking shape," proposed living-room hero image, swatch dots, "Explore the client mockup" / "Read the rule audit" buttons. |
| `slide-02-1440.png` / `slide-02-390.jpg` | 1440 / 390 | "The design recedes. The administration remains." — side-by-side before-frames of the recorded Designer Desk and the "Cedar Lane Study" client Threshold page, with findings captions. |
| `slide-03-1440.png` / `slide-03-390.jpg` | 1440 / 390 | "Rules that constrain expression" — documentation-audit table (surfaces & status, depth, imagery & color, primary actions) with VISION.md/CLAUDE.md/DECISIONS.md source citations. |
| `slide-04-1440.png` / `slide-04-390.jpg` | 1440 / 390 | "Rules for flow and feedback" — second audit table (strict focus, motion & success, client wayfinding, error visibility, success criteria). |
| `slide-05-1440.png` / `slide-05-390.jpg` | 1440 / 390 | "Proposed visual language" — three principle tiles (material presence, clear next move, progress with meaning), color token swatches, proposed type scale. |
| `slide-06-1440.png` / `slide-06-390.jpg` | 1440 / 390 | "Client portal mockup" — proposed Threshold house-page opening: room photo, designer note, decision card ($2,400 table), landmark links. |
| `slide-07-1440.png` / `slide-07-390.jpg` | 1440 / 390 | "Client decision interaction" — default state: Concept lens, Natural oak selected, table spec + line items, "Continue to approval" button. |
| `slide-07-1440-state-smoked.png` | 1440 | Slide 7 after clicking the "Smoked oak" material button — finish name and price panel update to Smoked oak. |
| `slide-07-1440-state-confirm.png` | 1440 | Slide 7 after clicking "Continue to approval" — inline `#approvalConfirm` panel opens ("Approve Smoked oak?", consent checkbox, disabled "Approve selection" button). |
| `slide-07-1440-state-receipt.png` | 1440 | Slide 7 after checking consent and clicking "Approve selection" — `#approvalReceipt` shown ("Your selection is recorded," Smoked oak, $2,400, "Reset this demo"). |
| `slide-07-1440-state-plan.png` | 1440 | Slide 7 (fresh load) after clicking the "Plan" lens button — swaps the concept photo for the illustrative SVG floor plan; caption changes to "Illustrative plan · not to scale." |
| `slide-08-1440.png` / `slide-08-390.jpg` | 1440 / 390 | "Designer Desk mockup" — proposed Desk: "Good morning, Leah," continuing-direction board, "Ready for your hand" task list, 3-row job roster, studio footer links. |
| `slide-08-1440-state-compact.png` | 1440 | Slide 8 after clicking "Compact rows" — roster switches to the `.compact` density (thumbnails hidden, tighter row padding), button label flips to "Comfortable rows." |
| `slide-09-1440.png` / `slide-09-390.jpg` | 1440 / 390 | "Designer document & materials" — document spine (Brief/Direction/Selections/Procurement/Installation), solid-oak-table product row, finish comparison expanded by default. |
| `slide-10-1440.png` / `slide-10-390.jpg` | 1440 / 390 | "Core component system" — button specimens (default/hover/focus/disabled/loading), three elevation "levels" (Record/Object/Sheet), room/money/update card rules. |
| `slide-11-1440.png` / `slide-11-390.jpg` | 1440 / 390 | "Progress & less ideal states" — milestone panel with check-round + quote, "nothing needs you today" panel, a `.warning` retry panel, and an empty-state panel. |
| `slide-12-1440.png` / `slide-12-390.jpg` | 1440 / 390 | "Mobile & accessible forms" — two phone frames (client Threshold, designer Desk) side by side, plus a textarea specimen and an `aria-invalid` date-field error specimen. |
| `slide-13-1440.png` / `slide-13-390.jpg` | 1440 / 390 | "What changes, what stays" — Keep / Amend / Reconcile panel triad, ownership note, "prioritize the emotional sequence" / "protect designer efficiency" call-outs. |
| `slide-14-1440.png` / `slide-14-390.jpg` | 1440 / 390 | "Validation & rollout proposal" — three-step process (test the concepts / prototype one full journey / release only if it helps), studio vs. client success-metric columns. |
| `slide-15-1440.png` / `slide-15-390.jpg` | 1440 / 390 | "Evidence & review scope" (`#sources`) — columned source list citing VISION.md, CLAUDE.md, DECISIONS.md, design-system README, current baseline files, plus the closing scope/verification captions. |
| `reading-mode-1440.jpg` | 1440 (11,502 px tall after scaling to 1200 wide) | All 15 slides stacked after clicking `#readingToggle` from slide 1 ("Read all sections" → "Presentation mode"). Converted to JPEG q80 due to full-page height exceeding 3000px; originally 1440×13803, resampled to 1200 wide (width-only, aspect preserved) and saved as JPEG. |

## current/ (13 files, ~1.9 MB after compression)

Copied verbatim from existing repo artifacts (filenames prefixed by surface
for clarity; no re-encoding).

| File | Source | Description |
|---|---|---|
| `desk-final-desk-1440.png` | `artifacts/document-life-directions-2026-08-28/mock/final/shots/final-desk-1440.png` | Current designer Desk at 1440: "Good morning, Leah," stage-grouped text roster (Brief·5, Discovery·1, Direction·3…), "EVERY JOB · 16 LIVE · 1 OVERDUE" banner, no imagery. |
| `desk-final-desk-390.png` | same folder, `final-desk-390.png` | Same current Desk layout at 390px mobile width — identical content, single column, bottom tab bar (The Desk / 0:47 / More). |
| `document-final-document-ffe-1440.png` | same folder, `final-document-ffe-1440.png` | Current Document FF&E schedule view: room-grouped line items (Dining room, Living room, Primary bedroom, Mudroom), small square thumbnails, status pills (Ordered/Damaged/Decision due), right-hand margin notes (Time, Money outstanding). |
| `client-local-dev-desktop.jpg` | `artifacts/client-page-completion-2026-09-04/waves/w3/local-dev-desktop.png` | Current Threshold house page, desktop — "Cedar Lane Study," a line-drawing floor plan ("One mark stands open on this drawing"), a signature/acceptance card, letterbox invoice summary, "Previously" activity log. Converted to JPEG q80 (original 1440×4392 > 3000px height). |
| `client-local-dev-phone.jpg` | same folder, `local-dev-phone.png` | Same Cedar Lane Study house page at 390px mobile width, single column, same diagram-led layout. Converted to JPEG q80 (original 390×5029 > 3000px height). |
| `client-local-dev-multi.png` | same folder, `local-dev-multi.png` | A second, near-empty Threshold house ("Birch Hollow," Discovery stage) — "Nothing waits for your name," empty letterbox, links to other houses (Marrow & Vale Residence, Aspen Loft Refresh). |
| `client-path-b-desktop.png` | `docs/design/the-client-page/shots/path-b-desktop.png` | "The Vale Residence" — Path B variant of the house page, desktop: "One door in this house is closed until you sign it," line-drawing room plans, a furnishings-authorization signature card with itemized pieces and a consent checkbox. |
| `client-path-b-phone.jpg` | same folder, `path-b-phone.png` | Same Vale Residence Path B page at 390px mobile width. Converted to JPEG q80 (original 390×5733 > 3000px height). |
| `invoice-open-desktop.png` | `artifacts/invoice-standalone-2026-09-06/mockup/shots/open-desktop.png` | Standalone invoice mockup — "Invoice No. 4" for The Vale residence: text line items (no images), balance due $9,125, three payment-method radio rows (bank transfer/card/mail check), "Pay $9,130.00" button. |
| `desk-onboarding-02-desk.png` | `artifacts/designer-onboarding-learning-2026-09-03/briefing/screens/02-desk.png` | Current live-style Desk screenshot used in onboarding materials — same stage-grouped text roster pattern (Brief·5 rows: Marcus Wright, Lily Tanaka, Sarah Chen, David Nielsen, Elena Ruiz), "EVERY JOB · 16 LIVE · 1 OVERDUE." |
| `document-onboarding-09-document.png` | same folder, `09-document.png` | Current Document detail view for a new inquiry ("Full Room," Marcus Wright) — brief fields (Match/Budget/Timeline), quoted brief text, tag pills, an empty "No preview" room-scan placeholder. |
| `document-onboarding-10-library.png` | same folder, `10-library.png` | Current Library search screen — "Find a piece—or ask about one," search bar, Mine/Studio/Patina counts, order-type filter pills, empty "My Library" raw-capture section. |
| `document-schedule-boards-1-client-verdicts-desktop.png` | `docs/design/the-document/screenshots/schedule-boards-wave2/1-client-verdicts-desktop.png` | Current "Product Selections" client-verdict list — text-only rows (Walnut sectional sofa, Hand-knotted wool rug, Walnut coffee table, Reading lounge chair, Floor lamp) each with Approve/Flag/Note actions and a status tag; no product imagery. |

No requested current-state file was missing — all 13 copied successfully.
