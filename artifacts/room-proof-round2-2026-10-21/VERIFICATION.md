# Verification — Room Proof, round two

21 October 2026. Static HTML/JavaScript mockup only. No production portal code, backend, data or deployment changed.

## Independent review

Claude Code independently reviewed the Codex-built mockup against its agreed design brief and rendered desktop/mobile images. It found no blocker or misstatement of approval, authority, money or release. Its medium and lower findings were addressed as recorded in COLLABORATION.md. Codex independently reviewed and exercised the Claude-built presentation.

## Gates run

- `node --check` on every JavaScript file in this artifact; all passed. `serve.py` parsed with Python's AST parser.
- Chromium browser rendering and axe WCAG 2 A/AA and WCAG 2.1 AA checks: all 15 default mockup views at 1440px returned zero automated findings and no page overflow or script errors.
- All 15 views fit at 390px and 320px without horizontal page overflow.
- At 390 × 844, the mobile room's primary design-review action, time-entry save and receiving receipt action were visible above the fixed dock. These three task states returned zero axe findings.
- The presentation returned zero axe findings at 1440px, 390px and 320px, with the cross-frame `frame-tested` rule disabled because mockup views were scanned separately. No page errors, missing local responses or horizontal overflow occurred in the final presentation run.
- Previous/proposed comparisons were observed at equal 1440px internal widths in side-by-side desktop mode. Scene navigation, compact/full wording controls, note save and Markdown download worked. Saving founder notes preserved prototype state.

## Behavior exercised

Six original core scenarios passed: named decision lead and both reviewer confirmations; approval without purchasing authority; specification changes invalidating current approval while preserving historical evidence; issued/superseding revisions; date conflict preview and safe change; installation checks and agreement fee-ceiling/issued-copy behavior.

Nine original transaction scenarios passed: library-to-total updates; shared spec book with private prices omitted; held PO drafting; separate Oak Street receiving exception and claim draft; priced time to invoice draft; issue and partial/final receipts; shared contact/inbox drafts; inquiry recording; shared-sample reset.

New-round checks passed:

- Six-project selector navigates distinct overview studies and returns to the interactive Mendota room; Agreement and Time receive appropriate navigation state.
- Eight desk actions across six projects sort by due date. Illustrative actions open overview studies.
- Compact/full wording preserves the same standing facts. Four gallery specimens distinguish reachable workflow conditions from future-state studies.
- The time shortcut opens and focuses its entry form. Mobile Menu reaches the library.
- Open selected pins remain unfilled; a reference-only piece is explicitly labelled in the desktop margin.
- Changing a saved order specification surfaces the stale-draft warning and responsible person at the top of the order.
- Receiving requires an explicit outcome. Recording Oak Street receipt does not grant Mendota purchase authority.
- Receiving identifies Oak Street, and its mobile Project link returns to Oak Street's overview.

Evidence scripts and JSON reports were run from `/tmp/patina-design-qa` and `/tmp/patina-round2`; browser screenshots were visually inspected. The delivered preview.jpg is a compressed cover capture. The static server uses an expanded connection queue because an ordinary small-backlog local server dropped requests during concurrent multi-iframe QA; final runs used the included server pattern.

## Limits

Chromium was exercised. Native Safari/iOS, Firefox, live production, actual permissions, real payments, external sends and backend integrations were not tested. Automated accessibility checks do not replace a human assistive-technology review. No designer usability study has been conducted. All business actions above are local sample behavior, not evidence that a production database or service was changed.

This artifact uses no application workspace packages, so pnpm build/type-check and backend test suites were not applicable gates. The existing 25-group source map remains the previous round's source-presence audit, not a refreshed production rollout claim.
