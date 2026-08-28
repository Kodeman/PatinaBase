# The Document — Mock Kit reference sheet

Companion to `kit.css`, `kit-demo.html`, and `assets/fonts/`. Built for two
mock builders drawing HTML/CSS screens that look like the real Patina
designer portal, and for a deck assembler reusing the same tokens. Every
value below was **read** from the shipped product (file:line citations
throughout) — nothing here was invented except where explicitly marked
"synthesized" or "derived."

Everything in this kit must survive inside a single published Artifact HTML
file under a strict CSP: external hosts blocked except
`https://fonts.googleapis.com`, `data:` URIs allowed, ≤16 MB total,
light/dark theme-aware via `prefers-color-scheme` + `[data-theme]`.

---

## 1. Token table

Values marked **(same)** in the Dark column don't change — either they're
already an rgba/opacity relationship that rides on a themed token, or a
constant with no light/dark meaning (spacing, motion timings). Dark values
for `--doc-*`, `--color-*`, `--bg-*`, `--border-*`, and the wash/stamp tokens
are **derived** for this kit — the shipped product has no dark theme for
these tokens today (see §5 "Dark theme provenance").

### Primary palette

| Token | Light | Dark | Used in product (file:line) |
|---|---|---|---|
| `--color-off-white` | `#FAF7F2` | `#EDE6D8` | `globals.css:10` — `--bg-primary` base |
| `--color-pearl` | `#E5E2DD` | `#4A453F` | `globals.css:11` — `--border-default`, spine/margin rails |
| `--color-clay` | `#C4A57B` | `#D9BA8E` | `globals.css:12` — `--accent-primary`, focus rings, DA primary score |
| `--color-aged-oak` | `#8B7355` | `#C4A57B` | `globals.css:13` — `--accent-hover`, mono labels (aged-oak) |
| `--color-mocha` | `#5C4A3C` | `#C9BCAE` | `globals.css:14` — `--text-body` |
| `--color-charcoal` | `#2C2926` | `#F4F0E8` | `globals.css:15` — `--text-primary`, region-head name, DA pool ink |
| `--color-quiet-ink` | `#65594E` | `#B9AC9B` | `globals.css:18` — `--text-muted`, metadata copy at 6.3:1+ |

### Extended palette

| Token | Light | Dark | Used in product (file:line) |
|---|---|---|---|
| `--color-sage` | `#A8B5A0` | `#B7C4AF` | `globals.css:22` — `phase-walkthrough`, `strata-mark.tsx:28` settled state |
| `--color-dusty-blue` | `#8B9CAD` | `#9DAEBE` | `globals.css:23` — `phase-consultation`, `strata-mark.tsx:34` line-3 Delivery hue |
| `--color-terracotta` | `#D4A090` | `#E0AC9C` | `globals.css:24` — `phase-installation`, `red-letter-zone.tsx:30` border-l, DA danger ink |
| `--color-golden-hour` | `#E8C547` | `#EDCE6B` | `globals.css:25` — `phase-procurement`, PO stamp `in_production`/`shipped` |

### The Document paper surfaces

| Token | Light | Dark | Used in product (file:line) |
|---|---|---|---|
| `--doc-paper` | `#FCFAF6` | `#211E1B` | `globals.css:28` — the sheet itself; `doc/[id]/page.tsx:1047` grid bg |
| `--doc-sheet-2` | `#EFE9DD` | `#2A2621` | `globals.css:29` — second-depth sheet tint |
| `--doc-sheet-3` | `#E2DACA` | `#332D26` | `globals.css:30` — third-depth sheet tint |
| `--doc-ink-border` | `rgba(44,41,38,.18)` | `rgba(237,230,216,.16)` | `globals.css:31` — hairline rule on paper |
| `--doc-desk-ink` | `rgba(250,247,242,.45)` | `rgba(33,30,27,.55)` | `globals.css:32` — desk-level wash |
| `--doc-sheet-front` | `#F7F2EB` | `#292521` | `globals.css:35` — folio front stacked sheet, `folder-card.tsx:245` |
| `--doc-sheet-back` | `#F1EBE2` | `#322C26` | `globals.css:36` — folio back stacked sheet, `folder-card.tsx:241` |

### Semantic assignments

| Token | Light | Dark | Used in product (file:line) |
|---|---|---|---|
| `--bg-primary` | `var(--color-off-white)` | `#211E1B` | `globals.css:39` |
| `--bg-surface` | `#FFFFFF` | `#2A2621` | `globals.css:40` — cards, drawer, folio face |
| `--bg-hover` | `rgba(196,165,123,.06)` | `rgba(217,186,142,.10)` | `globals.css:41` |
| `--text-primary` | `var(--color-charcoal)` | `var(--color-charcoal)` (dark alias) | `globals.css:43` |
| `--text-body` | `var(--color-mocha)` | `var(--color-mocha)` (dark alias) | `globals.css:44` |
| `--text-muted` | `var(--color-quiet-ink)` | `var(--color-quiet-ink)` (dark alias) | `globals.css:45-46` |
| `--accent-primary` | `var(--color-clay)` | `var(--color-clay)` (dark alias) | `globals.css:56` |
| `--accent-hover` | `var(--color-aged-oak)` | `var(--color-aged-oak)` (dark alias) | `globals.css:57` |
| `--accent-active` | `var(--color-charcoal)` | `var(--color-off-white)` | `globals.css:58` |
| `--border-default` | `var(--color-pearl)` | `var(--color-pearl)` (dark alias) | `globals.css:60` |
| `--border-subtle` | `rgba(229,226,221,.6)` | `rgba(74,69,63,.6)` | `globals.css:61` |
| `--border-warm` | `#DDD4C8` | `#4A4038` | `globals.css:73` |
| `--bg-warm` | `#EEE6DB` | `#33291F` | `globals.css:71` |
| `--bg-subtle` | `#F5F1ED` | `#29241F` | `globals.css:70` |
| `--spine-wash` *(kit-only)* | `rgba(229,226,221,.28)` | `rgba(74,69,63,.35)` | derived from `doc-spine.tsx:43` inline bg |
| `--margin-wash` *(kit-only)* | `rgba(250,247,242,.98)` | `rgba(42,38,33,.98)` | derived from `margin-rail.tsx:258` inline bg |

### Functional & phase colors

| Token | Light | Dark | Used in product (file:line) |
|---|---|---|---|
| `--color-success` | `#7A9B76` | (same) | `globals.css:76` |
| `--color-warning` | `#D4A574` | (same) | `globals.css:77` |
| `--color-error` | `#C77B6E` | (same) | `globals.css:78` |
| `--color-info` | `#8B9CAD` | (same) | `globals.css:79` |
| `--phase-consultation` | `#8B9CAD` | (same) | `globals.css:82` |
| `--phase-concept` | `#C4A57B` | (same) | `globals.css:83` |
| `--phase-refinement` | `#8B7355` | (same) | `globals.css:84` |
| `--phase-procurement` | `#E8C547` | (same) | `globals.css:85` |
| `--phase-installation` | `#D4A090` | (same) | `globals.css:86` |
| `--phase-walkthrough` | `#A8B5A0` | (same) | `globals.css:87` |

### PO / order-stamp colors

| Token | Light | Dark | Used in product (file:line) |
|---|---|---|---|
| `--stamp-draft` | `var(--color-aged-oak)` | (dark alias) | `orders-ledger.tsx:108` `PO_STAMP.draft` |
| `--stamp-confirmed` | `var(--color-dusty-blue)` | (dark alias) | `orders-ledger.tsx:109` `PO_STAMP.confirmed` |
| `--stamp-in-production` | `var(--color-golden-hour)` | (dark alias) | `orders-ledger.tsx:110` |
| `--stamp-in-production-ink` | `#D8BE56` | `#EDCE6B` | `orders-ledger.tsx:110` ink override for readability |
| `--stamp-shipped` | `var(--color-golden-hour)` | (dark alias) | `orders-ledger.tsx:111` |
| `--stamp-delivered` | `var(--color-sage)` | (dark alias) | `orders-ledger.tsx:112` |
| `--stamp-cancelled` | `var(--color-terracotta)` | (dark alias) | `orders-ledger.tsx:113` |
| `--stamp-damaged` *(kit-only)* | `var(--color-error)` | (dark alias) | synthesized — no `damaged` PO status in `PO_STAMP`; mapped to `--color-error` for the ask's DAMAGED chip |

### Type floors, spacing, motion, layout constants

| Token | Value | Used in product (file:line) |
|---|---|---|
| `--type-metadata-min` | `12px` | `globals.css:52` |
| `--type-body-min` | `14px` | `globals.css:53` |
| `--type-control-min` | `16px` | `globals.css:54` |
| `--space-1`…`--space-24` | `0.25rem`…`6rem` | `globals.css:103-113` |
| `--ease-editorial` | `cubic-bezier(0.22,1,0.36,1)` | `globals.css:92` |
| `--duration-fast` / `--duration-normal` | `150ms` / `300ms` | `globals.css:93-94` |
| `--doc-spine-w` | `200px` | `doc/[id]/page.tsx:1047` grid-cols `min-[1440px]` |
| `--doc-spine-compact-w` | `56px` | same grid, `min-[1180px]` tier |
| `--doc-margin-w` | `232px` | same grid, third column |
| `--doc-drawer-h` | `60px` | `studio-drawer.tsx:277` `h-[60px]` |
| `--doc-mobile-bar-h` | `64px` | `mobile-bar.tsx:156` `min-h-[64px]` |

**Row count: 78 custom properties defined in `kit.css`'s light `:root` block** (matches `--doc-shell-*` scoping tokens excluded, which are route-shell-specific and not part of the drawable grammar).

---

## 2. Type roles

From `packages/patina-design-system/src/styles/typography.css` (imported by every portal) plus the Document's own `doc-type-*` roles in `globals.css:759-783`.

| Class | Family | Weight | Size | Notes |
|---|---|---|---|---|
| `.type-page-title` | display | 400 | `clamp(2rem,5vw,3.5rem)` | `typography.css:19` |
| `.type-section-head` | display | 400 | `clamp(1.5rem,3vw,2rem)` | `typography.css:27` |
| `.type-item-name` | display | 500 | `1.3rem` | `typography.css:35` |
| `.type-data-large` | display | 700 | `2.4rem` | `typography.css:43` |
| `.type-data-unit` | body | 400 | `0.85rem` | `typography.css:52` |
| `.type-body` | body | 400 | `1rem` | `typography.css:65` |
| `.type-body-small` | body | 400 | `0.875rem` | `typography.css:73` |
| `.type-label` | body | 500 | `0.95rem` | `typography.css:87` |
| `.type-label-secondary` | body | 400 | `0.82rem` | `typography.css:95` |
| `.type-meta` | mono | 400 | `0.75rem`, uppercase, `0.05em` | `typography.css:105` |
| `.type-meta-small` | mono | 400 | `0.63rem`, uppercase, `0.07em` | `typography.css:114` |
| `.type-btn-text` | body | 500 | `0.85rem` | `typography.css:124` |
| `.doc-type-meta` | mono | 400 | `max(12px,0.667rem)` | `globals.css:764` — quiet metadata floor |
| `.doc-type-body` | body | 400 | `max(14px,0.875rem)` | `globals.css:772` |
| `.doc-type-control` | body | 400 | `max(16px,0.889rem)` | `globals.css:779` |

**The rule, everywhere in the actual components:** serif (Playfair) names things — region names, folio titles, FF&E item names (in italic), letterhead. Sans (Inter) carries the conversation — status prose, red-letter text. Mono (DM Mono) is reserved for state, time, and provenance — eyebrows, vendor lines, stamps, timestamps, breadcrumbs — almost always uppercase with letter-spacing 0.05–0.14em, sized 8–12px.

---

## 3. Primitives (`kit.css`)

Every class below lives in `kit.css`; wrap the page (or a screen frame) in `.patina-mock` to activate the base font stack and box-sizing reset.

| Class | Usage | Snippet |
|---|---|---|
| `.paper` | Full-bleed document sheet — the base surface every screen sits on. | `<div class="paper">…</div>` |
| `.spine` | 200px left rail, full tier. | `<aside class="spine">…</aside>` |
| `.spine-compact` | 56px glyph-only rail, 1180–1439px tier. | `<aside class="spine-compact">…</aside>` |
| `.strata-mark` | Three descending bars — brand device / fill progress. Add `.state-active\|settled\|future` or `.fill` + size class `.size-xs\|sm\|md\|lg`. | `<span class="strata-mark state-active size-sm"><i class="strata-line"></i><i class="strata-line"></i><i class="strata-line"></i></span>` |
| `.running-index` | "In this document" block in the spine; `.ri-row.is-current` for the active entry. | `<div class="running-index"><p class="ri-label">In this document</p><div class="ri-row is-current"><span class="ri-name">Kitchen</span><span class="ri-value">4 pieces</span></div></div>` |
| `.shelf-row` | One row of "The shelves" spine block; `.is-open` for the expanded leaf trigger. | `<button class="shelf-row"><span><span class="shelf-title">Call sheet</span><span class="shelf-status">3 confirmed</span></span><span class="shelf-arrow">→</span></button>` |
| `.letterhead` / `.vitals` | Document top block: title + the metadata line (phase, dates, budget band, contract total). | `<header class="letterhead"><h1 class="lh-title">The Hendricks Residence</h1><p class="vitals"><span class="vital">Start</span><span class="vital-value">Mar 4</span></p></header>` |
| `.guide` | The "next up" band directly under the letterhead. | `<p class="guide">Next: confirm the sofa PO</p>` |
| `.red-letter` | Needs-attention zone — terracotta rule, no badge. | `<section class="red-letter"><p class="rl-label">Needs attention · in one place</p><div class="rl-row"><p class="rl-text is-urgent">2 items awaiting your signature</p><span class="rl-action">Review</span></div></section>` |
| `.region-head` | Region title (Playfair, left) + action ledger (DM Mono words, right); index-0 act gets `.is-inked`. | `<div class="region-head"><div><p class="rh-eyebrow">FF&E</p><h2 class="rh-name">Living Room</h2><p class="rh-status">4 of 6 priced</p></div><div class="rh-ledger"><span class="rh-act is-inked">Bill client</span><span class="rh-act">Add item</span></div></div>` |
| `.region-rule` | The double rule (2px charcoal + 1px hairline) that opens a region. | `<div class="region-rule"></div>` |
| `.seam` | Folded one-line region: name · status · UNFOLD ↓. | `<button class="seam"><span class="seam-name">Procurement</span><span class="seam-summary">6 of 9 ordered</span><span class="seam-unfold">unfold ↓</span></button>` |
| `.ffe-row` | FF&E line: name/vendor left, stamp + price right. | `<div class="ffe-row"><div><span class="ffe-name">Camden Sofa</span><span class="ffe-vendor">Studio McGee Home</span></div><div class="ffe-right"><span class="stamp stamp-in-production">in production</span><span class="ffe-price">$4,200</span></div></div>` |
| `.stamp` | Outlined mono chip, −1.5° rotation, transparent fill. Modifiers: `.stamp-draft\|confirmed\|in-production\|shipped\|delivered\|received\|cancelled\|damaged`, size `.size-sm`. | `<span class="stamp stamp-received">received</span>` |
| `.money-ladder` | Four rungs (subtotal → tax → shipping → total); last rung is the emphasized total. *(Synthesized — no single source component; grammar matches `.vitals`/contract-total mono treatment.)* | `<div class="money-ladder"><div class="ml-rung"><span class="ml-label">Subtotal</span><span class="ml-value">$12,400</span></div>…<div class="ml-rung"><span class="ml-label">Total</span><span class="ml-value">$14,180</span></div></div>` |
| `.margin` / `.margin-item` | 232px right rail; each item is an eyebrow + one line. | `<aside class="margin"><div class="margin-item"><p class="mi-eyebrow">Decision needed</p><p class="mi-line">Fabric swatch approval</p></div></aside>` |
| `.drawer` | 60px fixed bottom strip: wordmark · breadcrumb · nav · time · account. No badges/counts. | `<nav class="drawer"><div><span class="drawer-word">Patina</span><span class="drawer-crumb">Hendricks</span></div><div class="drawer-center"><span class="drawer-nav-item is-active">Library</span><span class="drawer-nav-item">People</span><span class="drawer-nav-item">The Rooms</span></div><div class="drawer-right"><span class="drawer-time">2h 14m</span></div></nav>` |
| `.folio` | Desk card: two offset tinted sheets behind a face, a colored phase tab on top. Set `background-color` on `.folio-tab` inline to a `--phase-*` token. | `<div class="folio"><div class="folio-sheet-back"></div><div class="folio-sheet-front"></div><div class="folio-tab" style="background:var(--phase-procurement)">Procurement</div><div class="folio-face"><h3 class="folio-face-title">Hendricks Residence</h3></div></div>` |
| `.cmdk` | ⌘K command bar dialog; wrap with `.cmdk-overlay` as a sibling. | `<div class="cmdk-overlay"></div><div class="cmdk"><input class="cmdk-input" placeholder="Jump to…"/><p class="cmdk-group-label">Rooms</p><div class="cmdk-row"><span class="cmdk-row-title">Kitchen</span></div></div>` |
| `.mobile-bar` / `.sheet` | 390px bottom bar (charcoal, fixed) and a bottom sheet panel. | `<nav class="mobile-bar"><div class="mb-item"><span class="mb-eyebrow">Room</span><span class="mb-value">Kitchen</span></div></nav>` |
| `.mock-frame` | Renders a screen at an exact CSS width with a caption, scaled via `transform: scale()` to fit a deck column. | `<div class="mock-frame"><div class="mock-frame-inner" style="width:1440px;transform:scale(0.4)">…</div></div><p class="mock-frame-caption">Desk — 1440px</p>` |
| `.eyebrow` / `.serif-h` / `.mono` / `.scored` | Print helpers — DM Mono 11px uppercase label; Playfair heading; mono utility; a static single/double underline (`.scored-double` adds the second clay rule). | `<p class="eyebrow">Studio</p>` |

---

## 4. Font mapping

Recovered from the designer portal's **real Next.js build cache** —
`apps/designer-portal/.next/static/css/7f8a72e9189e8b62.css` — which contains
the `next/font/google`-generated `@font-face` rules for `Inter`,
`Playfair Display`, and `DM Mono` (`layout.tsx:6-26`). All three are
**variable fonts** (confirmed via `fontTools`: each file has an `fvar` table
with a `wght` axis), so a single latin-subset file per family/style renders
every weight the portal declares — Next's build emits multiple `@font-face`
blocks (one per requested static weight) that all point at the *same*
variable file, and the browser resolves the correct instance per declared
`font-weight`. This kit replicates that exactly rather than duplicating
bytes.

| Kit file (`assets/fonts/`) | Family | Style | Weight range served | Source hash (`.next` filename) | SHA-256 |
|---|---|---|---|---|---|
| `playfair-variable.woff2` | Playfair Display | normal | 400–900 | `eaead17c7dbfcd5d-s.p.woff2` | `5d91eb5d522a03081946c44c8ca17c902230dfed5f0f9b5014262135d47b15b2` |
| `playfair-italic-variable.woff2` | Playfair Display | italic | 400–900 | `78d0dd042ac6d54d-s.p.woff2` | `c68530044e7c4ce6cd3c1c239d0a93be71af53821574714f83e1380d8b393d14` |
| `inter-variable.woff2` | Inter | normal | 100–900 | `e4af272ccee01ff0-s.p.woff2` | `c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4` |
| `dmmono-300.woff2` | DM Mono | normal | 300 | `d7df244fe7b07b95-s.p.woff2` | `3062236ef9fbd488feca3aee905e9b1846f2f2f89e55d5eae650fa0fd79eeae9` |
| `dmmono-400.woff2` | DM Mono | normal | 400 | `0e96d314a90a6138-s.p.woff2` | `fd7521f3531a5ccfc655b25c4f22e9871df3ec141ad79bb27fde20d0df347b6d` |
| `dmmono-500.woff2` | DM Mono | normal | 500 | `b7ea2ab4a8ad1f81-s.p.woff2` | `0e263db52797086e763679c54f84ded8cc1249879bc27dca2bd5dd446f6d9f36` |

Each source file was the entry in the CSS whose `unicode-range` was
`u+00??,u+0131,u+0152-0153,…` — the Basic-Latin/Latin-1 block (`.p.woff2`
suffix = Next's "preload" latin subset), i.e. exactly the "LATIN" subset the
task asked for. Non-latin ranges (cyrillic, greek, vietnamese, latin-ext)
were left behind. Total recovered payload: **~148 KB raw** (6 files, 8.6 KB–48 KB
each), **~204 KB** as base64 in `assets/fonts/fonts-data-uri.css`.

Weights actually used by the Document components read for this kit: Playfair
400 (body italic names), 500 (headings, folio titles), 600 (none observed
directly but kept since the ask requested it and the file already covers
400–900 for free); Inter 400/500/600 (body, labels, `type-label` 500);
DM Mono 400/500 (eyebrows/mono default, `.type-btn-text`-adjacent bold mono).
DM Mono 300 was in the build but no Document component read for this kit
used it — included anyway since it cost nothing extra (same-size file
already in `.next`).

Three ways to load them, in `kit.css` in this priority order:
1. **Relative `@font-face` `url()`** (default, active) — points at `./assets/fonts/*.woff2`.
2. **Inline base64** — commented block in `kit.css` §1; paste from `assets/fonts/fonts-data-uri.css`, trim to only the weights you use.
3. **Google Fonts `<link>`** (third fallback, requires `https://fonts.googleapis.com`, the one external host the CSP allows) — commented reference in `kit.css` §1.

---

## 5. Dark theme provenance

The shipped designer portal has **no dark theme for the Document's paper
tokens** — `globals.css` defines only a `.dark` class block (lines 803-824)
for an unrelated shadcn-style OKLCH token set (`--background`, `--card`,
etc.) that nothing in the Document route tree consumes; `grep` for
`prefers-color-scheme` / `data-theme` in `globals.css` turns up nothing tied
to `--doc-*` or `--color-*`. So every dark value in the token table above is
**derived for this kit**, not lifted from the product:

- Paper deepens from `#FCFAF6` to a warm charcoal `#211E1B` (not pure black — keeps the "paper" identity).
- Ink flips: charcoal (ink) → off-white `#F4F0E8`; off-white (paper-adjacent) → a warm light `#EDE6D8`.
- Clay/terracotta/golden-hour lighten one step (`#C4A57B→#D9BA8E`, `#D4A090→#E0AC9C`, `#E8C547→#EDCE6B`) so accents keep their warmth without glowing on a dark ground.
- Quiet-ink → `#B9AC9B`; checked against `--doc-paper` dark (`#211E1B`) using the WCAG relative-luminance formula: contrast ratio ≈ **7.45:1** (AA/AAA pass, ≥4.5:1 required). Body ink `--color-mocha` dark (`#C9BCAE`) on `--doc-paper` dark ≈ **8.91:1**. Primary ink `--color-charcoal` dark (`#F4F0E8`) on `--doc-paper` dark ≈ **14.59:1**. Accent checks: clay dark (`#D9BA8E`) ≈ **8.98:1**, terracotta dark (`#E0AC9C`) ≈ **8.33:1** — both comfortably above the 4.5:1 floor too.

---

## 6. CSP / size rules

- **Fonts**: relative `woff2` files (primary) work under any CSP that allows same-origin/`data:` fetches from the artifact's own asset store; base64 (`data:` URI) works under the strictest CSP with zero extra font requests; Google Fonts `<link>` is the only path that needs an *external* host, and only `https://fonts.googleapis.com`/`https://fonts.gstatic.com` are permitted — no other font CDN will load.
- **No other external hosts** — no CDN scripts, remote images, or `fetch`/XHR targets. Everything in this kit is self-contained CSS + the six local woff2 files.
- **Size**: `kit.css` ≈ 27 KB. `assets/fonts/*.woff2` ≈ 148 KB total. `assets/fonts/fonts-data-uri.css` ≈ 204 KB (only needed if you switch to the inline-base64 alternative — don't ship both the relative files *and* the inline block in the same page). All comfortably inside the 16 MB artifact ceiling even with `kit-demo.html` and its two screenshots alongside.
- **Theme-awareness**: `kit.css` follows the three-state contract — bare `:root` carries the full light palette, `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])` carries the dark overrides, and `:root[data-theme="dark"]` repeats them so an explicit toggle wins in both directions. `body`/`.paper`/`.drawer`/`.mobile-bar` all paint an explicit background — nothing relies on a transparent body inheriting the host page's theme.

---

## 7. Do-not list

- **No `box-shadow`, `filter: drop-shadow`, or any shadow primitive, anywhere** (doctrine D4). Depth is value contrast (`--doc-sheet-2`/`-3`, folio's two offset sheets) plus a 1px rule (`--doc-ink-border`, `--border-default`) — never a shadow. `kit.css` contains zero shadow declarations by construction (verified: `grep -i "box-shadow\|drop-shadow"` returns only this sentence in comments).
- **No filled/boxed buttons** except the one inked leader (`.rh-act.is-inked` / DA "inked" variant) — every other action is a bare word with a scored underline (`.scored`, `.rh-act`), never a bordered or filled plate. This is the Scored Ink grammar (`globals.css:268-700`, `.da-act`/`.da-label`/`.da-pool`).
- **No badges or counts on the drawer.** The Studio Drawer (`studio-drawer.tsx`) carries no shouty notification badges or pulsing dots — presence is quiet (a breadcrumb, an in-hand time readout, at most a small unlabeled dot per `letterhead-vitals.tsx:92`-style state markers, never a numeric badge).
- **Labels are DM Mono, uppercase, letter-spaced** (0.05–0.14em depending on size) — eyebrows, vendor lines, stamps, statuses, timestamps. Never sentence-case sans for a label role.
- **Headings are Playfair** (display serif) — region names, folio titles, item names (often italic for FF&E line names, per `ffe-section.tsx:614`). Never sans for a heading role.
- **No second color for urgency** inside an already-terracotta-ruled zone (the red-letter zone carries urgency by *weight* alone — `font-medium` vs `font-normal` — not a second hue; `red-letter-zone.tsx:56-61`).
- **No ambient motion** beyond the one sanctioned "breath" (a slow opacity swell on the active spine marker) — mocks are static images, so this doesn't apply directly, but don't invent spinners, pulses, or shimmer; the product's only loading device is the Strata sweep (three bars filling in sequence), never a spinner.
- **Stamps are always outlined, never filled** — transparent background, 1.5px border in the state color, 3px radius, −1.5° rotation, DM Mono 600 uppercase (`stamp.tsx`). A filled/solid stamp is not this system.

---

## 8. Files in this kit

- `kit.css` — the stylesheet (fonts, tokens, primitives).
- `KIT.md` — this document.
- `kit-demo.html` — exercises every primitive once, light + dark.
- `kit-demo-light.png` / `kit-demo-dark.png` — Playwright screenshots of the demo, for visual verification.
- `assets/fonts/*.woff2` — the six recovered latin-subset variable-font files.
- `assets/fonts/fonts-data-uri.css` — base64 versions of the same six files, for the inline-CSS fallback.

---

## Deltas for this program

This copy (`artifacts/document-life-directions-2026-08-28/mock/kit.css`) is not a byte-identical copy
of the wayfinding program's kit — Phase 0 ported it here with three changes:

1. **Removed** the two "Alternative A/B" font-loading comment blocks (paste-in instructions for the
   inline-base64 and Google-Fonts fallbacks, one of which carries a literal `<head>` sample) and the
   six relative-`url()` `@font-face` blocks that pointed at `./assets/fonts/*.woff2`. `build.mjs`
   injects the base64 `fonts-data-uri.css` at a `/* @@FONTS@@ */` marker in `00-head.html` instead —
   this kit no longer ships its own font-loading mechanism, only the token/primitive CSS after it.
2. **Added** the four I151 (2026-08-26) `-ink` tokens to the light `:root` block, with the exact
   values and citations from `apps/designer-portal/src/app/globals.css:34-41`:

   | Token | Light value | Contrast (globals.css comment) |
   |---|---|---|
   | `--color-clay-ink` | `#7C5E30` | 5.75:1 paper · 5.61:1 off-white · 6.00:1 white |
   | `--color-terracotta-ink` | `#9C5340` | 5.41:1 paper · 5.28:1 off-white · 5.64:1 white |
   | `--color-golden-hour-ink` | `#79651E` | 5.45:1 paper · 5.32:1 off-white · 5.69:1 white |
   | `--color-sage-ink` | `#5F6B57` | 5.40:1 paper · 5.27:1 off-white · 5.63:1 white |

   `research/contrast-check.mjs mock/kit.css` reproduces these exact ratios against `--doc-paper`
   (verified 2026-08-28: 5.75 / 5.41 / 5.45 / 5.40 respectively).
3. **Added** the same four tokens to *both* dark blocks (`@media (prefers-color-scheme: dark){
   :root:not([data-theme="light"]){...}}` and `:root[data-theme="dark"]{...}`) — but aliased to the
   already-redefined dark **base pigment**, not given their own darkened value:

   ```css
   --color-clay-ink: var(--color-clay);
   --color-terracotta-ink: var(--color-terracotta);
   --color-golden-hour-ink: var(--color-golden-hour);
   --color-sage-ink: var(--color-sage);
   ```

   This is the inversion rule documented at `globals.css:28-33`: on a dark ground the darkened -ink
   value falls out of contrast (e.g. clay-ink to 2.41:1 there) while the base pigment already clears
   6.21:1+, so the dark theme keeps the base pigment for these roles instead of a separately-darkened
   ink. `contrast.test.ts` holds both halves of this rule in the real app; this kit now mirrors it.

No other content changed. `kit.css` still contains zero `box-shadow`/`drop-shadow` declarations
(verified: `grep -cE "box-shadow\s*:|drop-shadow\(" mock/kit.css` → `0`).
