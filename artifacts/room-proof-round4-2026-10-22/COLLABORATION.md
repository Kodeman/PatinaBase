# Round-four collaboration

22 October 2026. Real Claude Code CLI sessions were used, not a simulated Claude persona.

## Roles

- **Codex:** current-source mapping, overall paper design, client review and purchasing interactions, HTML presentation, integration and browser checks.
- **Claude Code / Sonnet:** built `notes.js` and `notes.css` in a separate worktree from a bounded brief: job/room/line notes, explicit audiences, unsent drafts, contextual links and browser-local persistence. Original report: `review/CLAUDE-NOTES-CONTRIBUTION.md`.
- **Claude Code / Opus:** independent read-only review of the integrated scripts and HTML. Original report: `review/CLAUDE-INDEPENDENT-REVIEW.md`. The reviewer did not run the browser and explicitly identified its scope limits.

Codex reviewed the Claude module, corrected activity-log save order, added order subjects and links, and integrated form/open-state retention with sheet rendering. All changes are confined to the fictional review artifact.

## Review decisions and resolutions

| Finding | Resolution |
| --- | --- |
| M1: replaced reviews could still accept new answers | Older per-item editions are read-only once a newer review contains that item. Earlier decisions remain visible. Browser checked. |
| M2: authorization draft ignored item decisions | For this proposal, the authorization draft includes only individually approved, selected, priced scope. Reasons remain visible for other lines. This is an explicit round-four design choice, not a claim of exact production-policy parity. Browser checked with two eligible and 70 excluded sample lines. |
| M3: new routes were not handled by Back | Added explicit review/client/notes/order restoration and history entries for contextual item opens. Browser Back restored the review route. |
| M4: contextual item opens returned only to the room | Return context now retains the originating review row, note subject or purchasing view. Labels describe that return; ordinary room entry still returns to the room. Browser checked review-row focus and correspondence entry. |
| M5: typed client text could disappear | Per-edition draft answers, reasons, replies and open conversation folds survive re-renders and view switches. Saving a reply clears only that reply. Browser checked. |
| M6: order notes lost text/open state | Notes capture/restore hooks now cover order subjects and preserve open folds. Browser checked through maker-copy changes. |
| L1, L7, L8: changed approval/count/history issues | Header counts current covered approvals; stale and replaced items retain earlier decision receipts. Room, placement, units and COM fields join the snapshot fingerprint. UI decisions derive from snapshots consistently. Reverting to the exact approved specification intentionally restores coverage. |
| L2: misleading void state | Voided order drafts now say retained / never dispatched. |
| L4: fractional receiving drift | Receiving arithmetic is rounded to the UI's hundredth-unit precision before remaining/limit checks. |
| L5: unpriced/alternate/allowance review choices | These are visible but disabled in the new-review picker until specified, priced and selected. Labor may be reviewed when it is concrete priced scope. |
| L6: duplicate maker drafts and copied internal notes | One discrepancy reply draft is reopened for editing; its template does not copy internal discrepancy wording. The draft opens visibly with feedback. |
| L9: dispatch gates | The local dispatch action now rechecks selection, review, authority, funding, terms and price, in addition to snapshot freshness. |
| L10: hidden selected lines | Purchasing selection clears when scope, filter or search changes; a changed selected line stops preparation rather than being silently omitted. |
| L11: margin attribution | Console request is attributed to Nora, the client. |
| L12: impossible review task | Founder question now asks about an earlier authorized line. New authority/funding remain explicit fixtures rather than invented signing/payment flows. |

L3 (replacement receipts after damage) remains outside this round: damaged units count as physically received, the exception stays open, and no replacement/claim-resolution workflow is advertised. The capability map and source map state this limit. Actual money, role thresholds, real messages and multi-user synchronization remain integration work.

The final browser checks and scope are recorded in `VERIFICATION.md`. Claude's original report is retained as received; this table records the integrated decisions rather than rewriting the review to imply it had no findings.
