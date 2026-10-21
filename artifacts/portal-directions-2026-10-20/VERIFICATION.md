# Verification — October 20, 2026

Scope: the standalone HTML presentation and three local prototypes only. No application workspace, service, database, account, or deployment changed.

## Evidence

- Inline JavaScript compilation with Node `vm.Script`: all four HTML files parse.
- `node /tmp/patina-design-qa/flows.cjs`: PASS. Presentation slide navigation; review-note restoration and text-file download; credits Escape close; Folio choice/brief/draft; Workroom choice and editable draft persistence; Common Ground private/shared visibility, history and maker hold. `page/network errors: []`.
- Responsive browser checks: no body horizontal overflow at 320, 375, 390, 768, and 1440 CSS pixels across the three roles in each prototype. Presentation checked at 390, 768, and 1440; its comparison table intentionally scrolls horizontally on small screens.
- `node /tmp/patina-design-qa/regressions.cjs`: PASS. Skip link retains current slide; comparison-table arrows retain the comparison slide; Folio recommendation and keyboard focus; explicit client choices; role-separated Workroom preferences and draft flags; unreleased finish stays out of maker briefs; correct return-to-concept links. Print styling exposes all six slides.
- `node /tmp/patina-design-qa/axe.cjs`: zero WCAG 2 A/AA and 2.1 AA violations reported on Opening and all nine prototype role views. Supplemental run: zero reported violations on the other five slides and five decision/specification dialogs, for 20 checked surfaces total. An initial Common Ground secondary-text contrast failure was fixed before the passing run.
- Rendered desktop and phone screenshots inspected. Local preview JPEGs regenerated from the final prototypes. The workroom collage at 320px was also captured for review.
- Browser used for automated checks: installed Chromium 1208. The presentation was also opened in the user's Chrome browser.

These are targeted prototype checks, not a claim of complete accessibility conformance. No Safari, Firefox, assistive-technology session, production behavior, backend permission enforcement, or actual studio usability study was verified. No repository build/type-check was needed because these files have no application or package dependencies.

## Independent review

A separate Claude/Opus context read the four HTML files without editing. Its code review identified unreleased maker visibility, shared preference state, draft flags, keyboard handling, recommendation consistency, contrast, and mobile-control issues.

Implemented corrections:

- Maker views retain the studio-released brief; a client's unreviewed choice does not appear there.
- Workroom stores studio/client preferences separately and scopes drafts to their author.
- Folio distinguishes the working studio preference from the shared client recommendation; draft wording follows the working preference until edited. Draft retention is accurately described as the open page.
- Client choices require a deliberate selection before recording.
- Client confirmation copy addresses the client directly.
- Skip links, comparison-table keyboard behavior, dialog focus return, and role-group semantics corrected.
- Prototype Back links return to their own concept slide.
- Common Ground secondary text darkened, chair reference shown uncropped, and mobile next-decision order improved. Mobile role controls enlarged.

Review risks scoped to handoff: role previews are not real authorization; production must enforce visibility server-side. Reference retailer imagery is for this private review and requires replacement/approval before public marketing. Neither is represented as production-ready functionality.

## Delivery and repository handling

The presentation is delivered as an offline folder and ZIP. The committed copy is on `design/portal-directions-2026-10-20`. A convenience copy is placed in the shared checkout's `artifacts/` directory for opening. Main advanced in another session during this work, so this task does not merge or modify that session's branch. All temporary design worktrees are retired after delivery; the review branch remains available.
