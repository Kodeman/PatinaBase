## Building with Patina (@patina/design-system)

Patina is a warm, editorial design system for a custom-furnishing platform: a clay/mocha/charcoal palette on an off-white ground, serif display type over a clean sans body. Build on-brand by composing the real components below and styling layout with the Tailwind utility vocabulary the system already ships — don't invent new colors, fonts, or class names.

### Setup — no provider needed
Components are plain React and render correctly as soon as `styles.css` is bound (it is). There is **no ThemeProvider/context to wrap** — just render `<Card>`, `<Badge>`, etc. `styles.css` `@import`s the brand fonts (Playfair Display, Inter, DM Mono) from Google Fonts and pulls in `_ds_bundle.css`, which defines every design token in `:root` and every utility class. The system is **light-mode only** (a `.dark` token set exists but is not the shipped default). Every component is a real export on `window.PatinaDesignSystem.<Name>` (75 total).

### Styling idiom — Tailwind v3 utilities over oklch semantic tokens
Style with semantic utility classes, never raw hex. Each color family works as `bg-*`, `text-*`, and `border-*`, pairs with an on-color `*-foreground`, and accepts opacity modifiers (`bg-primary/10`, `text-foreground/50`):

| Family | Use | On-color text |
|---|---|---|
| `background` / `foreground` | page surface + default text | — |
| `card` / `popover` | raised surfaces | `text-card-foreground`, `text-popover-foreground` |
| `primary` | brand clay — primary actions | `text-primary-foreground` |
| `secondary` / `muted` / `accent` | supporting fills, subtle text | `text-secondary-foreground`, `text-muted-foreground`, `text-accent-foreground` |
| `destructive` | errors / danger | `text-destructive-foreground` |
| `border` / `input` / `ring` | hairlines, field borders, focus ring | — |

Other idiomatic bits: radii `rounded-lg | rounded-md | rounded-sm` (driven by `--radius: 0.75rem`); focus `ring-2 ring-ring ring-offset-2 ring-offset-background`; fonts `font-heading` (Playfair Display serif) and `font-mono` (DM Mono), with Inter as the body default.

**Editorial typography classes** bake in font + size + weight + color — prefer them for prose/labels over ad-hoc `text-*`: `type-page-title`, `type-section-head`, `type-item-name`, `type-data-large`, `type-data-unit`, `type-body`, `type-body-small`, `type-label`, `type-label-secondary`, `type-meta`, `type-meta-small`, `type-btn-text`.

### Where the truth lives
Read the bound `styles.css` (and its `_ds_bundle.css` closure) for the full token + utility set before styling. Per component, read its `<Name>.prompt.md` (variants + usage) and `<Name>.d.ts` (props) — e.g. `Badge` takes `variant` (`solid|subtle|outline|dot`) plus `color` (`primary|success|warning|error|info|neutral`); `Heading` takes `as` (`h1`–`h6`), `size` (`xs`–`9xl`), and `weight`; `Card` takes `variant`/`interactive`.

### Idiomatic snippet
```jsx
const { Card, Heading, Text, Badge } = window.PatinaDesignSystem;

export function ProjectSummary() {
  return (
    <Card className="p-6 bg-card border border-border rounded-lg">
      <div className="flex items-center justify-between gap-4 mb-3">
        <Heading as="h3" size="xl" className="font-heading text-foreground">Living Room Refresh</Heading>
        <Badge color="success">On Track</Badge>
      </div>
      <p className="type-body text-muted-foreground">
        Updated furniture layout with a warmer palette and improved natural light.
      </p>
    </Card>
  );
}
```
