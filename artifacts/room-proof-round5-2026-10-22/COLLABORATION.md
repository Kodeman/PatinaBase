# Claude Code collaboration — round five

Actual Claude Code CLI sessions were used, not simulated reviewers or attributed Codex prose. All Claude sessions were read-only with only the Read tool enabled. Codex implemented the mockup and performed browser verification.

## Source and design mapping

Claude Sonnet reviewed the named portal roster, studio access, trade work-order/scope and Field Desk files, plus Capture’s roster rules, room merging and capture payload, and the portal payload reader. [Full source report](review/CLAUDE-FIELD-SOURCE-REVIEW.md).

Agreed design decisions:

- Make one room’s evidence and site work readable on the same job paper.
- Keep scan identity and captured facts distinct from inferred or proposed changes.
- Keep client design decisions, purchasing authority, trade engagement and work completion distinct.
- Give contractors a practical scope copy without client selling prices, markup or studio-only access notes.
- Keep the exact drawings a person holds separate from the current studio work.

Codex separately inspected the current Plan Room, sheet revisions, issue ceremony, concept-render upload, scan strip, scan overlay and Room View plan. These sources corrected the initial Field-only review’s limits: the production portal already has a substantial drawing workflow.

## Independent adversarial review

Claude Opus reviewed the implementation in a fresh read-only context. [Initial report](review/CLAUDE-INDEPENDENT-REVIEW.md). A second fresh Opus review inspected the fixes: [follow-up report](review/CLAUDE-FOLLOWUP-REVIEW.md).

Applied findings:

- Scoped the FF&E scroll target to the sheet and changed design-link attributes to avoid selector collisions. Confirmed the actual LR-36 editor becomes visible.
- Passed the clicked element explicitly to origin tracking, including notes and purchasing calls, avoiding reliance on mouse focus behavior.
- Corrected an additional browser-found anchor-navigation issue: index jumps no longer reopen the last working scene.
- Cleared obsolete return history on browser navigation and direct design/site transitions.
- Fixed the client-visibility button’s per-sheet label; preserved open disclosures and focus through bench rerenders.
- Added explicit return controls between Design and Site, suppressed when already in the destination area.
- Recorded actions in the job record and made observation → follow-up → drawing → set lineage visible. Multiple observations can be retained as sources for the sample D revision.
- Clarified TS-04’s coordination authority, LR-36’s unresolved purchasing, and the continuing fabrication hold.
- Corrected minor print, accessible-name, drawing-region, comparison and state-guard issues.
- Fixed the inherited client-reply bug found in follow-up: capture the reply before clearing its input. Verified the real text in the rendered client conversation.

One finding was not adopted: the initial reviewer suggested that client sharing must freeze a revision. The inspected production source explicitly says shared client folios follow the current print as the sheet revises (`plan-sheet-detail.tsx:10–12`). Frozen issue/draft sets have different semantics. The follow-up reviewer accepted the evidence. The interface and source map now explain that difference.

The shared elevation SVG intentionally omits revision-specific depth; the exact depth is retained in the drawing record and frozen-copy caption. The follow-up reviewer checked that boundary against the SVG and source map. This remains an illustrative drawing study, not a CAD difference viewer.

The reports preserve the findings as originally returned, including issues subsequently fixed. The final browser checks and remaining limitations are in [VERIFICATION.md](VERIFICATION.md). Claude did not perform visual browser testing, production inspection, or implementation changes in this round.
