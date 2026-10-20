# Client portal: the homeowner's first visit

Open `index.html` in a browser. It is a self-contained 13-slide presentation with embedded fonts and screenshots. No server, dependencies, or sign-in is required. Source citations require internet access.

Use Previous/Next, arrow keys, or the slide menu. View all presents a scrolling document. Print/PDF invokes the browser's print dialog. Slide 4 has task tabs and a phone-layout toggle; slide 8 has an approval preview. All demo actions stay within the presentation.

The review prioritizes unpaid invoice discovery, plain approval language, understandable confirmation, invitation recovery, progress summaries, and readable financial instructions. Includes proposed screens, delivery sequence, discussion prompts, acceptance checks, and a suggested homeowner study.

## Evidence and boundaries

- Read-only live review of `https://client.patina.cloud/` on October 20, 2026, using an existing signed-in session. The observed account landed in the studio-only view.
- Desktop observation at 1440 × 1000 and mobile observation at 390 × 844. Raw JPEG captures are under `assets/`.
- Two specialist agent reviews covered homeowner journeys and UI/accessibility/content. An independent factual review of the completed presentation corrected evidence wording and anchors.
- Source baseline: `de198e8b3`. Full project navigation, invitations, and approvals were reviewed in source; these flows were not exercised end to end in production.
- No payments, approvals, messages, or production changes were submitted. This is a heuristic review, not research with homeowners or a WCAG conformance audit.
- Screenshots contain studio invoice information; intended for internal Patina discussion. Proposed projects, dates, items, and amounts are explicitly illustrative.

## Artifact checks

- Static checks: 13 slide sections, unique IDs, embedded images with alt text, internal anchors, and `node --check` on the embedded JavaScript passed.
- Chrome: slide selection, task tabs, arrow-key tab navigation, phone layout, approval modal and preview completion, and View all / Present slides checked.
- Every slide checked for horizontal overflow at 390 × 844; none found. Desktop layout inspected at 1440 × 1000 and 1440 × 900.
- No portal application files were changed, so portal build/test gates were not applicable. Print styling is provided; no exported PDF was validated. No full assistive-technology audit performed.

`assets/presentation-preview.jpg` and `assets/presentation-mobile.jpg` show the presentation itself; other images document the current portal.
