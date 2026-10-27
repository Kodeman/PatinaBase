# Production design contract

The round-eight artifact is the approved composition and interaction reference. This document translates it into production requirements; numerical improvements below are delivery targets, not claims that the mockup already meets them.

## Composition and material

| Role | Approved reference | Production translation |
|---|---|---|
| Ground and ink | Paper `#f7f5ef`, ink `#302e2a` | Map semantic document/studio tokens in the existing theme; no component-local palette forks |
| Working accents | Forest `#4c624f`, survey blue `#58717b`, tracing stock `#e8ede6` | Meaningful, text-safe role pairs on tested stocks; status is also stated in words |
| Narrative type | Playfair, large room/commission headings | Keep editorial hierarchy, proportion and line breaking |
| Operational type | Inter, clear compact tables | Proposed floor: 14px primary row text, 12px secondary metadata; tabular numerals for amounts; mono only where existing identifiers need it |
| Studio spread | Approximately 1.7fr visual / 1fr next acts, 40px gap, max width 1540px | Preserve left weight at desktop; next acts are useful editorial lists, not a KPI dashboard |
| Job paper | Main document + approximately 212px contents margin / 60px gap | One persistent document scroll; index names actual mounted chapters and exact next acts |
| Dense work | 36 living-room / 80 job lines in reference | Start from existing 40px drafting rows and 48px headings; preserve keyboard work and provide fitted touch editors |
| Depth | Stock, rules, inserts, imagery and purposeful unfolded instruments | Resolve the production token/action exceptions in DECISIONS.md. Do not import every mockup shadow or disable current gates |

Production `html` currently uses an 18px root while several shared comments assume 16px. Review **computed CSS pixels** at all target widths; direct px→rem substitution will distort density. Existing `globals.css`, Tailwind and design-system palettes partially overlap. New production values enter through an explicit house-sheet SPEC amendment and semantic token mapping, not component-local hex literals. R203 already permits the single charcoal Next plate; it does not authorize arbitrary filled navigation/save controls. Dark mode remains deferred under the current Document policy unless separately changed. Foundation owns one mapping and limits its initial scope to designer/document surfaces; client/admin/manufacturer themes cannot change as a side effect.

## Surface rules

- Studio: active jobs and incoming work, an image-led commission, useful next acts, compact registers. Preserve Measured rooms, existing relationship work, command search and quiet utilities beyond the five specimen labels.
- Open job: no permanent global navigation hierarchy or document tabs. A return to the originating studio/resource is available. The right index scrolls through the paper; it does not replace the paper with route pages.
- Deep work: dense sheets may expand within or over the relevant section. Use existing DocSheet and BuildRoom components. Existing deep URLs remain valid, even when the default entry is inline.
- Room design: scan provenance, uncertain measurements, current concepts, drawings and issued history are visually distinct. Image captions state concept versus installed condition.
- Primary action: make the next meaningful act easy to find without turning every panel into a card or every action into a filled button. Terminal commercial/signature actions retain explicit consequence language.
- Content: useful labels first. Do not expose migration IDs, prototype scene selectors, queue details or API jargon in the designer's workflow. Review instruments stay in test/demo surfaces.

## Return and editing contract

Capture document identity, chapter, room, line/package, lens, filters, selection, scroll anchor and initiating control. A close/cancel/save that leaves the instrument restores the correct context and keyboard focus. If the originating record was removed or becomes unauthorized, fall back to its containing room/chapter with an explanation. Browser Back/Forward and reload must resolve stable URLs without replaying mutations.

No whole-document remount on a sheet, ledger, line or room operation. Pending saves, errors and conflicts are visible. Loss of session/permission does not silently discard a draft, claim a save or expose prior-studio data. Reuse existing buffered autosave barriers; distinguish navigation state from domain data.

## Responsive and accessible work

Review 320, 390, 768, 1024, 1440 and 1920 CSS-pixel widths plus 200% and reflow zoom. The existing MobileShellProvider enters compact layout below 1180px, so 1024px is a compact-layout test, not a desktop-rail assumption; additionally test 1179/1180/1181px. P01/P03 must reconcile any intentional breakpoint change with provider and overlay behavior. Imagery stacks before next acts. Contents remains reachable without a permanent narrow-screen rail. Dense tables and viewers may scroll inside labelled regions; essential content cannot be hidden by the page's `overflow-x: hidden`.

Use [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) as the accessibility delivery target. Test text contrast, control boundaries, reflow, keyboard operation, visible/unobscured focus, target sizing, non-drag alternatives and announced status/errors. Typical text requires 4.5:1 contrast; large text and essential control boundaries use 3:1. This is a target for the complete processes, not an automated-audit-only claim. Include manual screen-reader review.

Use real heading/region/table semantics. Inputs have programmatic names; inline errors identify the field and remedy. Color alone never conveys approval, hold or recipient. Dialog stacking keeps only the top instrument interactive. Avoid ambient entrance animations; unfolding follows a user act and has an immediate reduced-motion equivalent. Reserve geometry for fonts, images and thumbnails.

## Reference discipline

Keep the approved HTML/CSS/JS unchanged. Implement React components and existing data contracts, not a literal markup/local-storage port. Screenshots prove composition; behavioral evidence proves that it still works. Any intended departure names the reference, reason, affected users and acceptance test. A large feature cannot redefine the paper system privately on its branch.
