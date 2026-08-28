# Amendment question — one tokenized ambient elevation

**This is a question for the team, not a direction.** No direction depends on it. No mockup in
this deck illustrates it. If the answer is no, nothing in A, B or C changes.

## What is asked

Admit exactly one shadow token to the Document surfaces:

```css
--elevation-sheet: 0 1px 2px rgba(44, 41, 38, .08);
```

spent in exactly three places — a sheet that is lifted off the page (the folio at rest, the
open shelf leaf), a margin chip, and the Studio Drawer's top edge — and nowhere else. Not a
hover state, not a growing shadow, not a second token, not a scale.

## What canon says now

**D4** (`docs/design/the-document/DECISIONS.md:15`): "No shadows. Anywhere. No exceptions.
Value contrast + flat stacked edges + folder tab; mechanically enforced via lint, CI-blocking."

**O4 / R3** (`DECISIONS.md:46-129`) scoped the ban to Document directories from the first PR and
widened it app-wide at the dissolve step, defended by two ESLint rules: `no-restricted-syntax`
catching `shadow-*` class strings and `box-shadow`/`drop-shadow` CSS in Document dirs, and
`no-restricted-imports` banning the design-system overlay primitives.

**R72** (`DECISIONS.md:2589-2596`) already made one exception, and it is a real one: the folio's
pickup affordance carries `filter: drop-shadow(0 2px 4px rgba(44,41,38,.06))` at rest, growing
to `0 22px 34px /0.18` on hover, gated to `prefers-reduced-motion: no-preference`
(`globals.css:216-229`, the shadow itself at `:217`, `:223` and `:227`). So the rule as written is "no shadows, no exceptions", and the rule as
shipped is "no shadows except the one the Desk needed". The amendment would make that honest,
or the team can close it the other way.

One fact the ruling should have: **`.folio-face` is currently dead CSS.** `grep -rl "folio-face"
apps/designer-portal/src --include="*.tsx"` returns zero files — the folio grid was replaced by
the roster's lines ("never a card"). The exception exists in the stylesheet and on no screen.

## What it would cost — corrected

**The v1 draft of this page said the cost was a lint change. That was wrong, and it was the
page's only stated cost.** The five D4 selectors are ESLint rules in a config block whose `files`
are `src/app/(document)/**/*.{ts,tsx}`, `src/components/document/**/*.{ts,tsx}`,
`src/lib/document/**/*.{ts,tsx}` and five hooks (`eslint.config.mjs:72-80`), inside a flat config
whose only language block is `files: ['**/*.{ts,tsx}']` (:30). The five selectors sit at
`eslint.config.mjs:86, :91, :96, :100, :104`.

**ESLint never reads `globals.css`.** There is no stylelint in this app, this workspace or the
repo root (`grep -rl stylelint --include=package.json` returns nothing). The codebase says so
itself, in the comment above the surviving exception (`globals.css:210-215`): *"Defined here in
CSS — never as a TSX shadow literal — so the D4 shadow-ban lint stays enforced everywhere else."*
R72's `filter: drop-shadow(...)` at `globals.css:217/223/227` ships today and trips no rule.

So the amendment as written — one token in `globals.css`, spent from CSS — costs **zero** lint
change. It costs a lint change only if the elevation is spent from a `.tsx`: a
`shadow-[var(--elevation-sheet)]` class (selector 1) or a `style={{ boxShadow }}` (selector 5).
The real cost is three other things:

1. **A CSS-level gate that does not exist yet.** If D4 is to mean in enforcement what it says in
   text, the ban has to reach CSS — stylelint on `src/app/*.css`, or a grep gate in CI. That is
   the work the amendment actually buys, and it is worth doing whichever way the ruling goes,
   because today the ban is weaker than D4's text claims. **Half a day**, plus the CI wiring.
2. **A contrast-test extension.** `contrast.test.ts` measures ink against ground; a shadow is
   neither, so an ambient elevation is invisible to the one automated check the Document surfaces
   have. If elevation is admitted, the guard for "did the sheet separate?" has to be a ground
   ratio anyway — which is what all three directions already use.
3. **The ruling itself, and its precedent.** D4's value is that it has no edge cases. An
   amendment gives it one, and every future PR gets an argument about whether its case is the
   fourth site. That is the cost the team is actually being asked to price.

**Verify in one command:** `pnpm --filter designer-portal lint` with `box-shadow:
var(--elevation-sheet)` added to `globals.css` — it passes.

## What it would buy

- A lifted sheet could read as lifted without spending a value step. Today the only way to say
  "this is on top" is to change the ground, which costs one of the few tonal steps the palette
  has — the constraint that makes Direction A's arithmetic tight (three stocks 1.15:1 apart do
  not fit above the `-ink` floor without darkening the inks).
- The margin chip could stop being a bordered box (F21) and become a sheet, which is what it is.
- The drawer could separate from the page without taking a ground of its own — though SP-07
  gives it a ground anyway, and Direction C separates it by 16:1 without either.

**The honest counter-argument, from this deck's own evidence:** all three directions close F06,
F07 and F08 — the three "this does not read as a surface" findings — with grounds alone, and
none of them asked for a shadow while doing it. The strongest case for the amendment is the
margin chip; the strongest case against is that the product has shipped a dead exception for a
year and nobody has missed it.

## We ask

**We ask: do we close R72's exception — delete the dead `.folio-face` rule, put a CSS-level gate
behind D4 so its enforcement matches its text — or do we amend D4 to admit one tokenized ambient
elevation for lifted sheets, margin chips and the drawer?**

The order of those two halves is deliberate. All three directions close F06, F07 and F08 — every
"this does not read as a surface" finding — with grounds alone, and all three end their Refuses
with "does not ask for the elevation amendment." Direction C argues against it explicitly:
twelve stops of value lift a sheet without one. The question has no advocate in this deck, so it
is posed in the order the evidence supports.

---

## Critique dispositions (v2)

| D | Disposition | One line |
|---|---|---|
| D36 | **fix** | The cost paragraph is rewritten: ESLint's D4 block is scoped to `**/*.{ts,tsx}` and never reads `globals.css`; there is no stylelint anywhere in the repo; R72's shadow ships untripped. The real cost is a CSS-level gate that does not exist, a contrast-test that cannot see a shadow, and the precedent. |
| D37 | **fix** | The selectors are cited at `eslint.config.mjs:86, :91, :96, :100, :104` (the block's `files` at :72-80), and the `.folio-face` rule at `globals.css:217/223/227` inside the `:216-229` media block. |
| D38 | **fix** | The "We ask" sentence now puts closing R72's dead exception first and admitting a token second, with the reason: no lane asks for it and C argues against it. |
