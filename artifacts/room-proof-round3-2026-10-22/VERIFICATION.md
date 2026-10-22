# Verification — Room Proof / The whole job

Checked 22 October 2026. Static mockup only; no production code, business records, API, database or deployment was changed.

## Source and review

- Read the live job and all five FF&E working views without editing the live portal.
- Traced the working views to repository source at baseline `ad9c064057a4460a17b15dcfaf0be81fb25e0f0a`; see SOURCE-MAP.md.
- Actual Claude Code source/design review and separate-context review of the Codex prototype. See COLLABORATION.md and the raw reports in review/.

## Browser checks

Chrome through the computer-use browser tools; fictional local sample at `127.0.0.1:4178`.

- Starting sample: 80 lines, 36 living-room lines. Five working views and all seven presentation scene buttons resolve to the same job document.
- Desktop 1440 × 1000: pricing columns fit the sheet width; 36 living-room pricing rows render.
- Phone 390 × 844: verified in the presentation’s actual 390px iframe, plus earlier standalone responsive checks. Pricing uses labeled grid rows, collapsed totals, and has no page-level horizontal overflow. Other dense tables intentionally scroll horizontally. This was not a physical-device test.
- New line with Enter; library reference search/selection; sofa COM fields; search/filter; protected and editable multi-select; move with retained IDs; remove/undo.
- Reviewed three-row sample paste and actual two-row clipboard paste from the bedroom entry row in All rooms. The latter changed bedroom 28→30 while living stayed 36; Undo restored the 80-line job.
- Pricing: trade 1480→1700 offered keep client 1998 / 17.5% markup or keep 35% / client 2295. Both choices were exercised. Client 2295 persisted after reload. Markup 50% produced client 2220 with trade 1480 unchanged.
- Released client/quantity controls and ordered trade cost controls are protected. A proposed released-rug change left the original quantity unchanged and created a local record.
- Whole-job authorization: 67 eligible, 5 excluded, 8 previously released. Local draft contains client prices and omits trade cost, markup, margin and studio notes. Existing draft prevents a second preparation. After working client price changed 1998→2100, the saved copy stayed 1998 and showed a stale warning.
- Voiding requires its explicit local confirmation. Re-preparation produced PA—03 after PA—02 and retained the prior snapshot. The unlinked-client fixture explains why preparation is unavailable.
- Finish surface entry increased the living-room schedule from three to four surfaces without changing FF&E count. A typed wall product change and the new fireplace surface appeared in the painter preview. System print output was not sent or visually audited.
- Returning from the bedroom, Escape and browser Back retain the bedroom context. Final room order stays Living / Bedroom / Entry / Throughout / Unassigned.
- Presentation frame size and scene controls; diagram fold/unfold; local note save/restore; two-step clear; Markdown download. The downloaded file contained the test verdict and note. Test notes were cleared through the UI.
- Sample reset restores only fictional prototype data. Final sample was reset to 80 lines. No user notes were discarded.

## Static checks

- `node --check` for all five JavaScript files.
- Focused Node checks of scoped Undo: preserve unrelated later edits, saved client edition, change drafts and audit history; skip a subsequently edited affected record; reverse an added line and removed surface.
- Local HTML/CSS resource and link targets checked; previous rounds are included in the review bundle.
- Final screenshots captured after the relevant UI was visible. No runtime console errors observed during the inspected workflows.

## Limits

Not a production build, automated accessibility audit, exhaustive regression suite, cross-browser test or usability study. No browser-storage failure injection, concurrent-tab merge testing, large-job performance benchmark, real printer check, permission enforcement, financial certification or live integration validation. Use one editing tab at a time. Non-FF&E chapters are layout studies; the earlier round preserves fuller commercial workflow demonstrations. Known deferred functionality is listed in the presentation and SOURCE-MAP.md.
