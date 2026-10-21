# Verification record

21 October 2026. Scope: this static presentation and prototype only. No production portal build, integration service, live data, feature flags or access control was exercised.

## Source and implementation checks

- All 25 capability groups in `mapping.js` point to existing files at the audited source baseline `98c6baa69`.
- JavaScript syntax checked with `node --check` for the shared app, three view modules, presentation, mapping and boot scripts.
- All 13 registered views rendered in Chromium. The three module authors also ran bounded syntax/render checks before integration.
- Assets and fonts are bundled. The prototype has no application API calls, external font dependency, mail sends, payment calls or order release actions.

## Browser checks

Playwright with Chromium 145, desktop viewport 1440 × 1100, and narrow layouts at 390px and 320px.

- All 13 default views passed automated axe WCAG 2 A/AA and WCAG 2.1 AA checks. The presentation also passed at desktop and narrow widths. Automated checks do not establish complete accessibility conformance.
- No document-level horizontal overflow at the tested widths. Wide ledgers and navigation strips scroll within their own regions on narrow screens.
- Visual inspection covered all 13 desktop views, the presentation cover and embedded preview, and representative mobile views.
- Navigation, shared state, browser reset, keyboard focus after filtering, source-map filtering, review-note persistence and note download were exercised.

## Connected workflows exercised

1. Add the lamp from Library: selected furnishings rise from $11,500 to $12,240; the illustrative full estimate becomes $13,513.20. The piece also appears in the shared spec book.
2. Prepare a Northline PO draft: it retains design, purchase-authorization and deposit-allocation distinctions. Changing the table specification leaves the saved PO basis intact and displays a refresh warning.
3. Record a damaged Oak Street receipt and prepare a local claim draft. This separate example does not change Mendota’s design or financial authority.
4. Draft $525 from 3.5 priced hours; exclude the unpriced half-hour. Drafting reserves time without marking it invoiced. Sample issue marks its source entries invoiced; partial and final receipts preserve the $6,000 furnishings deposit.
5. Save a contact reply and read the same draft in Inbox. Record an inquiry without requiring an email.
6. Require a designated lead and both reviewer confirmations before issuing approval. Nora’s response records the approved finish without granting purchase authority.
7. Change a non-chair specification after approval: current approval clears, the prior decision remains, and a new issued drawing revision is required for a superseding request. Both confirmations reset.
8. Preserve the original natural-oak Rev B even when the first core view is opened after a specification change. Historical artifacts do not inherit later choices.
9. Block a date change that crosses the held installation target. Commit a safe date with its reason. A date edited after preview requires a new preview. Installation checks persist in their phase.
10. Block agreement issue when the fee ceiling is missing. Save, review and issue a frozen sample copy without collecting a retainer. Unsaved working edits disable the issue action until reviewed again.

## Print and privacy

The shared spec book was printed through Chromium to Letter PDF and inspected through text extraction. It includes the selected pieces and excludes seeded private specification/COM notes and trade-price values. Application navigation is hidden in print. The document itself retains an explicit fictional-prototype / not-issued marker and an illustrative-imagery note.

The shared brief and approval snapshots exclude private studio notes. The interface is an owner-preview specimen, not a permissions test or security implementation.

## Independent review

Two read-only reviews in separate Claude Opus contexts examined the Codex-built artifact: one for the shared shell/sourcing/studio/presentation and one for core approval/agreement/schedule logic. Review feedback led to corrections for fixed initial evidence, held dates, stale PO and claim snapshots, finish/material consistency, keyboard focus, contact context, invoice quantity formatting, print labels, embedded navigation and saved-state synchronization. Earlier approval records can be expanded to inspect their frozen evidence.

The corresponding browser regression checks were run after integration. Broader production checks were deliberately outside this artifact’s scope.
