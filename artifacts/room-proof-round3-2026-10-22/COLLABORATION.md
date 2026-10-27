# Claude Code collaboration — round three

22 October 2026. Claude Code CLI participated directly. Codex inspected the live designer portal read-only, built the continuous job prototype, integrated the presentation, and ran browser checks.

## Contributions

- **Claude Code / Opus:** bounded read-only review of the current FF&E source, including rough, specification, pricing, purchasing authorization and room finishes. [Source review](review/CLAUDE-SOURCE-REVIEW.md).
- **Claude Code / Sonnet:** authored the presentation HTML, CSS and JavaScript in a separate worktree. Codex reviewed and revised the wording, source mapping, scene descriptions, data consistency and fold behavior. Two sessions hit context limits; the completed files were inspected and integrated, and a small final session finished the script.
- **Claude Code / Opus, separate context:** reviewed the Codex-built prototype code and screenshots. [First review](review/CLAUDE-FINAL-REVIEW.md), [correction review](review/CLAUDE-CORRECTIONS-REVIEW.md). These are static reviews, not runtime tests. The correction review found no blocking errors in its bounded scope.

## Agreed changes integrated

1. Keep the existing six-chapter job flow and unfold the FF&E sheet inside Pieces. The right margin recedes during detailed work.
2. Use 80 sample lines, including 36 in one room, stable IDs, bulk operations and inline specification fields.
3. Review the whole job for purchasing authorization. Keep Selected / Candidate / Alternate, readiness and exclusion reasons distinct from design approval.
4. Treat the painter’s finish schedule as separate room surface records, not furniture finish columns.
5. Present both numerical outcomes when a trade cost changes. Protect released client values and ordered trade costs.
6. Save a fixed client-safe local draft; retain it when working values change. Require an explicit local void step before replacement, with distinct edition numbers.
7. Keep room order fixed. Return, Escape and browser Back restore room context rather than reorder the job.
8. Scope Undo to the records affected by the action. Preserve later edits, saved editions, change drafts and the activity record. Restore deleted surfaces at their earlier position.
9. Preserve the originating room for clipboard paste and slash-library entry, including from All rooms. Create new lines from blank values.
10. Correct the sofa’s sample specification, label missing product images clearly, compact phone controls, and give sideways view tabs a cue. Phone pricing uses labeled cards.
11. When an existing line receives a different library reference, clear old dimensions/color and show a reminder to verify retained pricing. Studio notes remain attached to the line.

## Judgments and limits

Some first-review screenshot findings referred to older QA captures and are superseded by the final images. In particular, phone pricing is a card layout; other dense tables still scroll sideways. The skip link was visible because the tester focused it, not because it was permanently overlaid. Final captures avoid that state and transient reset messages.

Per-field undo history, shared placements, restricted-money seats, full trade-scope authoring, live uploads, signing and backend enforcement remain outside this prototype. The capability map states those limits. This is a founder review artifact, not a production parity or usability-study claim.
