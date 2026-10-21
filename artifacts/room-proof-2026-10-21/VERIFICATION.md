# Focused verification — The Room Proof

Verified October 21, 2026. This is a static HTML concept; no portal application or production service was changed.

## Checks completed

- `node --check prototype.js` and `node --check presentation.js` pass.
- Chromium layout checks at 320, 390, 768, and 1440 px across the presentation and all three prototype views: 16 combinations, no horizontal page overflow or missing images.
- Axe checks against WCAG A/AA tags through 2.2 at 390 and 1440 px across those four views: eight states, zero automated violations. This is targeted automated coverage, not an accessibility certification.
- Room pins and the equivalent text index select the same object. Keyboard activation works; native radio arrow-key selection works.
- Direct view/object/role links, native Back/Forward, heading focus, same-view navigation, and reduced-motion record navigation were exercised.
- Studio preference remains separate from the client's choice. Client preview hides the private note, preference, and review checklist; Back/Forward preserves the current preview role.
- Client choice persists locally, appears in the draft maker folio, and invalidates a previously checked finish-review item when changed. Unsaved checklist edits survive in-page view and role changes. Reset clears sample decisions and review checks.
- The target object remains inside its detail crop at 390, 1000, and 1440 px for the table, sofa, and lamp: nine combinations. Lamp crops were also visually inspected.
- Presentation preview controls lead to the intended chair demonstration. Founder notes save, restore, and download as text. Storage-blocked interaction remains usable, with the review-download fallback explained.
- Both HTML entry points load through `file://` with local images and fonts and no external network requests. External reference sites are ordinary outbound links.
- No page JavaScript errors in the automated flow.

## Print

The maker folio was printed through Chromium and checked with `pdfinfo` / `pdftotext`: one US Letter page, the client's Light oak choice present, and private studio preference/note absent. Its draft status remains visible. The presentation's printed output includes the source and image-credit text; the credits disclosure opens for print and returns to its prior state afterward.

## Independent review

A separate design research agent reviewed the composition against the outside references and the original portal capture. Its recommendations were applied: a shorter room heading, directly selectable finish specimens, and a concrete interaction sequence in the presentation.

A separate Claude Opus context reviewed the artifact code. Addressed findings included preview-role history, contradictory preference copy, responsive object crops, stale review feedback, discarded in-page checkbox drafts, chair-specific presentation links, printed credits, semantic group labels, label/name consistency, fixed-dock focus clearance, reduced motion, consistent dates, Letter printing, and unnecessary history entries. Unused reference assets were removed and claims about the room reference and stored view were tightened.

The named external studios supplied inspiration through their published work; they did not participate in the review. This proposal has not been tested with real studio users. Production access rules, dense multi-room work, real specifications, procurement, and maker handoffs remain outside this concept's scope.
