# Lens C — Low-vision, perception & accessibility (Opus, read-only; 70+ pairs computed, scripts in `scripts/cr.py`, `scripts/cr2.py`; not rendered)

**Bottom line.** Text contrast is already high. The sign-in effect is salience: a large dark field against light, one filled button, boxed inputs with visible borders, larger sentence-case labels, very few choices. In Leah's screen, headings and every action share one small, light type style, so nothing stands out.

## Findings (confidence · severity)
- F1 All text tokens clear 4.5:1 on every paper stock; weakest action text quiet-ink on paper 6.35:1. Darkening alone won't answer Leah. — High · info
- F2 Sign-in: dark pane vs card 16.98:1 over a large area; one filled `#1A1816` button; inputs boxed with oak 4.49:1; Inter 14 semibold sentence-case controls under a 30px Playfair heading. — High · high relevance
- F3 Region `<h2>` is `.eb` (12px DM Mono caps 500, .08em); actions are 12px DM Mono caps .10–.12em (`document-action.tsx:73–85`). No size step between "where am I" and "what do I do". — High · high
- F4 Tertiary actions use weight 300 at 12px (`layout.tsx:26` loads 300). APCA (non-normative) treats thin small strokes as much lower effective contrast; Collapse / Add room selection / Project time ledger visibly fade. — High (code) · medium
- F5 Uppercase + wide tracking at 11–12px slows reading (Tinker; Rudnicky & Kolers — non-normative); worst for tired/presbyopic eyes. — Med-high · medium
- F6 Secondary and tertiary draw the same 1px oak rule; differ only by text colour (mocha 7.86 vs quiet-ink 6.35) and weight. SPEC secondary is a two-score word — code and SPEC diverge. — High · med-high
- F7 Forced colours: no rule covers `.da-*`; pseudo-element underlines likely repaint to Canvas → actions lose their only cue; terminal fill loses its box (no border). SPEC §A11 fix not implemented. — Code high / runtime med-high · high · RUNTIME CHECK
- F8 No `prefers-contrast` handling anywhere in the designer portal. Cheapest opt-in path for Leah (macOS Increase contrast → `prefers-contrast: more`). — High · medium
- F9 `ffe-section.tsx:637` clay-ink at `opacity-70` = 3.07:1 for 11px text — fails 1.4.3. — High · medium · RUNTIME CHECK
- F10 Region heading focus outline uses `--color-clay` 2.18:1 (`region-head.tsx:254`) — fails 1.4.11; the only landing cue after a rail jump. — High · medium
- F11 Held mobile menu row `opacity-60` (`mobile-bar.tsx:487`) 3.94:1; breaks SPEC B07 "never opacity". — High · low-med
- F12 Disabled acts' underline drops to pearl 1.21:1 — word loses its action shape (WCAG-exempt). — High · low
- F13 Light structural rules 1.20–1.52:1; stocks 1.03–1.20 apart → invisible to low vision. Only the charcoal 1.5/2px rules register, and four stack at the top without marking action groups. — Medium · medium
- F14 Portal token names ≠ SPEC: portal `--ink-muted` = mocha `#5C4A3C`, `--ink-subtle` = `#4E4339` (darker than muted); SPEC muted `#4E4339`, subtle `#5A4E43`; `--hairline-strong` `#D8CCB8` vs SPEC `rgba(44,41,38,.14)`; no `--hairline`. — High · medium (process)
- F15 No dark mode shipped (consistent, safe). `.da-*` hard-code light colours → a dark set would leave the inked pool 1.04:1, focus ring 2.50:1; SPEC has no dark mocha. — Medium · low now / high if dark ships
- F16 On a charcoal band: mocha 1.72, quiet-ink 2.13, clay-ink focus ring 2.41 (2.95 on `#1A1816`), oak rule 3.22. Only off-white, pearl and clay work. — High · high if proposed
- F17 `inked` leader already has sign-in salience (charcoal pool, 13.53:1) but `BandLeadsContext` suppresses it under one-voice; it is effectively a filled control → conflicts with "terminal is the only filled control". — Med-high · design ruling
- F18 DocumentAction 44×44 (meets 2.5.5 AAA). Ad-hoc "Spec book →" (`ffe-section.tsx:2323`) 11px, no min height, no underline. — Medium · low-med · RUNTIME CHECK
- F19 Labels `whitespace-nowrap`; "PREPARE PURCHASING AUTHORIZATION" ≈270px + padding — tight at 320 CSS px (1.4.10), worse under 1.4.12. Wrap variant exists. — Medium · low-med · RUNTIME CHECK
- F20 Keep: reduced motion (`globals.css:1231`), action focus ring clay-ink 5.61:1, inked/terminal caret inversion. — High

## Computed contrast (light stocks: paper #FAF7F2, doc #FCFAF6, rail #E8E3DB; Lc = APCA, non-normative)
| Pair | Ratio | Req. | Result |
|---|---|---|---|
| ink on paper / doc / rail | 13.53 / 13.87 / 11.32 | 4.5 | Pass |
| mocha on paper / rail | 7.86 / 6.58 | 4.5 | Pass |
| quiet-ink (tertiary) on paper / rail | 6.35 / 5.32 | 4.5 | Pass |
| clay-ink on paper / rail | 5.61 / 4.70 | 4.5 | Pass |
| state -ink tokens on rail | 4.31–4.45 | 4.5 | Fail (code keeps them off rail) |
| clay-ink @ .70 opacity on doc (F9) | 3.07 | 4.5 | **Fail** |
| off-white on charcoal | 13.53 | 4.5 | Pass |
| oak underline on paper / doc / rail | 4.20 / 4.30 / 3.51 | 3.0 | Pass |
| clay h2 focus outline (F10) | 2.18 | 3.0 | **Fail** |
| clay-ink ring on charcoal | 2.41 | 3.0 | **Fail** |
| rail-as-hairline / hairline-strong / rule-hair | 1.20 / 1.48 / 1.21 | 3.0 if identifying | Fail |
| card-edge on paper / doc / rail | 3.13 / 3.21 / 2.62 | 3.0 | Pass / Pass / Fail |
| doc vs paper / rail vs paper | 1.03 / 1.20 | — | — |
| Sign-in oak input border on white | 4.49 | 3.0 | Pass |
| Sign-in `#1A1816` button/pane vs surface | 16.98 | 3.0 | Pass |
| On charcoal band: mocha / quiet-ink / oak / clay | 1.72 / 2.13 / 3.22 / 6.21 | 4.5 / 3.0 | Fail / Fail / Pass / Pass |

## Requirements any proposal must meet
- Text ≥4.5:1 on its actual ground (bands, pools, -ink on rail); no opacity on text.
- Every action keeps a non-colour resting affordance ≥3:1; never colour alone.
- Focus visible and ≥3:1 on every ground incl. dark bands and the inked pool; aim 2.4.13 (2px perimeter); not obscured by mobile bar/sticky band (2.4.11).
- Keep 44px targets; ad-hoc links reach 24px or spacing exception.
- 200% zoom, 320px reflow without clipped nowrap labels; survives 1.4.12.
- Forced colours: underlines, terminal box, focus survive (SPEC §A11).
- Reduced motion preserved. Held actions `aria-disabled` + visible reason; disclosures `aria-expanded`; pressed `aria-pressed`.
- State readable with colour removed. D4 no shadows.

## Recommendations
1. Separate heading / action / metadata styles: region heads `.t-d2` 26 or `.t-d3` 20 Playfair; actions sentence-case Inter 14–16 (as terminal already is); `.t-meta` mono for values only. Ruling (revises §A5 "DM Mono 13px caps") — recommend yes.
2. One leader per region (ink text + 1.5px charcoal score + clay score, `.da-primary`), everything else quiet; merge the visually identical secondary/tertiary; ban weight 300 for actions.
3. Space for grouping (12 within / 48 between); Collapse to the heading line.
4. Fix now (low risk): `ffe-section.tsx:637` drop opacity-70; `region-head.tsx:254` clay → clay-ink; `mobile-bar.tsx:487` opacity-60 → text-faint; implement SPEC §A11 for `.da-*`.
5. Add `@media (prefers-contrast: more)` tier (no new tokens): action/meta text → ink; oak scores → ink 1.5px; 300 → 400; opacity → 1; separators → card-edge (3.13). Ruling: allow card-edge on ledger rows inside this tier only — recommend yes.
6. Prefer value step over a dark band. If founders still want a band: off-white/pearl text, clay scores, off-white focus ring (13.53) via a new `--focus-on-dark` token (ruling) — recommend against the band in the working document.
7. Align token names (F14) before any proposal lands.

## Risks
Mistaking ratio for salience; dark band breaks underline/focus/mocha; promoting `inked` dilutes the terminal tier; future dark mode would erase the inked pool; sentence-case Inter actions could read as prose links (keep resting underline); bigger labels + nowrap overflow at 390; forced-colour fixes must not set `forced-color-adjust:none` on text; an opt-in tier doesn't fix Leah's default view.
Pending runtime checks: F7, F9, F18, F19.
