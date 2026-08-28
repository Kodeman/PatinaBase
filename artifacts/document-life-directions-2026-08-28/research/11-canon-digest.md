# 11 — Canon rules binding a UI-only visual refresh of the Designer Portal

## Design session decisions (D-series)

### D1 — Strict one document at a time
**docs/design/the-document/DECISIONS.md:12** — "| D1 | Strict one document at a time. No split view, no peek/hold. Esc or "Put down" is the only exit; switching costs one trip through the Desk or a ⌘K jump. |"

### D4 — No shadows, anywhere, no exceptions
**docs/design/the-document/DECISIONS.md:15** — "| D4 | No shadows. Anywhere. No exceptions. Value contrast + flat stacked edges + folder tab; mechanically enforced via lint, CI-blocking. |"

## Operational and ruling decisions (O, R series)

### O4 — D4 scope vs D7 (shadow ban scope & lint defense)
**docs/design/the-document/DECISIONS.md:46-129** — "**Conflict:** D4 demands a CI-blocking shadow ban "in this app" from PR 1... **Proposed resolution:** PR 1 adds the CI-blocking lint scoped to Document surfaces (`/desk`, `/doc`, document/drawer/ledger components) + `shadow-none` overrides wherever design-system primitives are reused inside those surfaces; widen the ban app-wide at the dissolve step."

### R3 — Shadow ban scope & defense (CI-blocking lint)
**docs/design/the-document/DECISIONS.md:118-129** — "CI-blocking lint scoped to Document directories (/desk, /doc, document/drawer/ledger component dirs) from the Slice 1 PR; widened app-wide at the dissolve step. Defense is two ESLint rules (flat config): (1) `no-restricted-syntax` catching `shadow-*` class strings and `box-shadow`/`drop-shadow` CSS within Document dirs; (2) `no-restricted-imports` banning direct design-system overlay primitives (Dialog/Popover/Command/Sheet/Tooltip) in Document dirs — overlays enter only through Document-local `Doc*` wrappers that bake in `shadow-none` plus the paper treatment."

### R72 — The Desk goes to light paper (charcoal → off-white, typography hierarchy, D4 exceptions)
**docs/design/the-document/DECISIONS.md:2589** — "### R72 · The Desk goes to light paper — off-white surface, the lift-on-pickup folio, the white dock"

**docs/design/the-document/DECISIONS.md:2591-2596** — "The Desk (home) moves off the dark charcoal surface onto **light Patina paper** — keeping the "job document you can pick up" metaphor (the **Folio**) but trading flat stacked-paper-on-charcoal for off-white paper, hairline borders, and typographic hierarchy... **2 — D4 (zero shadows) relaxed for exactly two surfaces.** The folio's pickup affordance — `translateY(-10px)` + a drop-shadow growing `0 2px 4px /0.06` → `0 22px 34px /0.18` on hover, `translateY(-4px)` on press, `grab`/`grabbing` cursors — and the dock's hairline surface."

**docs/design/the-document/DECISIONS.md:2607** — "**4 — Stamp → dot+mono StatusChip on the folio.** The rotated ink `Stamp` (−1.5°, bordered) is replaced on the folio face by a quiet **6px status-dot + DM Mono label** (`StatusChip`) — no pills, no rotation."

### I151 — Wave B3 — the contrast pass and -ink tokens
**docs/design/the-document/DECISIONS.md:9941-9950** — "F56 lands at Kody's repo-wide scope: `--color-clay` and `--color-terracotta` stay material pigments for fills, borders, rules, pools and stamp outlines, and two new text-grade companions — `--color-clay-ink` (`#7C5E30`, 5.75:1 paper · 5.61:1 off-white · 6.00:1 white) and `--color-terracotta-ink` (`#9C5340`, 5.41:1 paper · 5.28:1 off-white · 5.64:1 white) — carry the same hue wherever the pigment is read as text... A new `lib/document/__tests__/contrast.test.ts` parses `globals.css` and computes the WCAG ratio of every `-ink` token against both paper backgrounds, failing under 4.5:1 — a guard against regression."

## Hard constraints from apps/designer-portal/CLAUDE.md

**apps/designer-portal/CLAUDE.md:19-26** — 
- "**D4 — zero shadows.** No `box-shadow`, no `drop-shadow`, no Tailwind `shadow-*` in this app. Add the stylelint/lint rule in your first PR and make it CI-blocking. Object depth = value contrast + flat stacked edges + tab (recipes in spec §10)."
- "**D1 — strict focus.** No split views, no document tabs, no persistent global nav inside a document. The drawer strip (D8) and its overlay sheets are the only chrome that coexists with an open document, and sheets must never unmount or reset the document beneath them."
- "**Typography-first.** Hierarchy via Playfair/Inter/DM Mono weight, size, and color — not cards-within-cards, not tab bars. Strata Mark rules as section devices. Use the repo's existing brand token source; do not redefine tokens locally."

## ESLint enforcement (five selectors & rules)

**apps/designer-portal/eslint.config.mjs:67-100** —

1. **Shadow-* class strings (Document surfaces only)**
   - Selector: `Literal[value=/(^|[\s'":])(drop-)?shadow-(?!none)/]`
   - Message: "D4/R3: no shadow-* utilities on Document surfaces. Depth = value contrast + flat stacked edges (spec v1.1 §10). shadow-none is allowed to neutralize primitives."

2. **Shadow-* in template literals**
   - Selector: `TemplateElement[value.raw=/(^|[\s'":])(drop-)?shadow-(?!none)/]`
   - Message: "D4/R3: no shadow-* utilities on Document surfaces (template literal). Depth = value contrast + flat stacked edges (spec v1.1 §10)."

3. **box-shadow / drop-shadow CSS**
   - Selector: `Literal[value=/box-shadow|drop-shadow\(/]`
   - Message: "D4/R3: no box-shadow/drop-shadow CSS on Document surfaces (spec v1.1 §10)."

4. **box-shadow in template CSS**
   - Selector: `TemplateElement[value.raw=/box-shadow|drop-shadow\(/]`
   - Message: "D4/R3: no box-shadow/drop-shadow CSS on Document surfaces (spec v1.1 §10)."

5. **boxShadow in inline styles**
   - Selector: `Property[key.name='boxShadow'], Property[key.name='WebkitBoxShadow']`
   - Message: "D4/R3: no boxShadow in inline styles on Document surfaces (spec v1.1 §10)."

## Token source & contrast requirements

**apps/designer-portal/src/app/globals.css:8-45** —

Primary palette tokens (lines 8-16):
- `--color-off-white: #FAF7F2`
- `--color-clay: #C4A57B` (material pigment only)
- `--color-terracotta: #D4A090` (material pigment only)
- `--color-aged-oak: #8B7355` (material pigment)
- `--color-quiet-ink: #65594E` (small explanatory copy 6.3:1+)

F56 text-grade ink companions (lines 20-30):
- `--color-clay-ink: #7C5E30; /* 5.75:1 paper · 5.61:1 off-white · 6.00:1 white */`
- `--color-terracotta-ink: #9C5340; /* 5.41:1 paper · 5.28:1 off-white · 5.64:1 white */`
- `--color-golden-hour-ink: #79651E; /* 5.45:1 paper · 5.32:1 off-white · 5.69:1 white */`
- `--color-sage-ink: #5F6B57; /* 5.40:1 paper · 5.27:1 off-white · 5.63:1 white */`

Darkening inversion rule (implied by comment, lines 25-30): "On the charcoal grounds — the mobile bar and its More popover, a dark Sheet, the log strip below 1180, the two client-preview banners — the darkening inverts: clay-ink falls to 2.41:1 there while base clay already reads at 6.21:1. Those sites keep the base pigment, and contrast.test.ts holds both halves of that rule."

## Contrast test enforcement

**apps/designer-portal/src/lib/document/__tests__/contrast.test.ts** —

Test suite titles (lines 115-204):
- "F56 · text-grade ink tokens clear WCAG AA" (describe block)
- "finds every ink token in globals.css, and every one of them as a hex" (it block)
- "leaves the base pigments legible on charcoal, where the inks are not" (it block)
- "keeps clay-ink and terracotta-ink telling two stamp kinds apart" (it block)
- "F56 · the base pigments are not spent as text" (describe block)
- "finds no base pigment spent as text anywhere under src/" (it block)
- "every clay/terracotta Stamp descriptor carries an explicit ink" (it block)

Luminance math (lines 85-102): WCAG 2.2 relative luminance formula with sRGB channel linearization (`channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)`) and weighted sum (0.2126 * r + 0.7152 * g + 0.0722 * b), followed by contrast ratio calculation: `(lighter + 0.05) / (darker + 0.05)` with AA floor 4.5:1 for normal text.

## Component docstrings (never a card; labels only)

**apps/designer-portal/src/components/document/desk-roster.tsx** —
"The density rule is the whole design: one line per job, wrapping to two or three; never a card; headings never fold; nothing folded on first paint."

**apps/designer-portal/src/components/document/desk-contents.tsx** —
"Book-style front matter, not a dashboard: three columns of labels and doorways, and nothing else. No counts, no tiles, no cards, no metrics — R95 is strict about this, and so is the registry it reads (which forbids consumers deriving any of those from its data). Every entry is a single line: a name, a doorway affordance, and the one act it opens... Every use fires wayfinding.contentsActed — the index stays labels + doorways; the metric lives in telemetry, never on the page. Zero shadows (D4)."

---

## What a direction may and may not do (derived from canon above)

1. **May use**: typography weight, size, colour — Playfair/Inter/DM Mono, not card nesting; value contrast + flat stacked edges as the sole depth mechanism; hairline rules; tab affordances; marked fills on status surfaces
2. **May NOT use**: shadows (box-shadow, drop-shadow, shadow-* utilities); design-system overlay primitives without Doc* wrappers; split views; persistent tabs inside documents; cardification; metric tiles or counts on the reading surface
3. **Must enforce**: WCAG AA 4.5:1 contrast for all -ink text tokens on every light ground (paper, off-white, white, tinted bands); shadow ban via CI-blocking ESLint lint in /desk, /doc, document/* component dirs
4. **Must preserve**: one document at a time; folio as a "pickup" metaphor; drawer as the only persistent chrome; stamp vocabulary (SPECIFIED/QUOTED/APPROVED/ORDERED/PRODUCTION/SHIPPED/DELIVERED/INSTALLED/RECEIVED/DAMAGED/DECISION DUE)
5. **May break**: existing D7 (dissolve-step) old-zone rules, but only after D7 phase gate; shadows on folio pickup and dock hairline under reduced-motion: no-preference (and nowhere else)
