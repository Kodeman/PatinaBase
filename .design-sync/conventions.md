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

---

### Composing "The Desk / The Document" — Patina's editorial workspace methodology

Patina's designer workspace is not a dashboard — it is an editorial **document** the designer picks up. Apply this house style, layered over the vocabulary above, when building any designer- or client-facing project surface.

**The five laws**
1. **Document, not dashboard.** No zones, tabs, sidebars, badges-as-nav, or metric tiles. A surface is paper with a letterhead, a body, and a margin; hierarchy comes from type, not chrome.
2. **Zero shadows.** Never `shadow-*`, `drop-shadow`, or CSS box-shadow on a Desk surface. Convey depth with **flat stacked edges + value contrast + a tab**: render 1–2 offset sheets behind a paper face using `border-border` + a darker `bg-*` tint (`bg-muted`, `bg-secondary`), translated a few px down/right. (The kit's `Dialog`/`Popover` ship shadows for generic use — don't use them here.)
3. **Typography-first.** Titles in `font-heading` (Playfair serif); prose/labels via the `type-*` classes; uppercase `font-mono` (DM Mono) micro-labels for tabs/stamps. Never nested cards or tab bars for hierarchy.
4. **Truthful need-lines.** Every folder/section states the one true thing that needs the person now, in plain prose from real data ("Sarah approved the sofa — 3 items ready to order"), not a bare count or status word.
5. **One progress language: Strata Mark.** `<StrataMark />` (the three-line cascade) is the only section/progress device. No decorative progress bars, no step dots. It inherits `currentColor`, so tint via `className="text-primary"`.

**The paper folder — the signature object.** A pickup-able job document: a status-colored **tab** over a white **paper face**, with tinted sheets stacked behind for depth-without-shadow.
```jsx
const { StrataMark, Badge } = window.PatinaDesignSystem;

export function DeskFolder() {
  return (
    <div className="relative mt-6 w-full max-w-md">
      {/* depth = stacked sheets, NOT shadow */}
      <div aria-hidden className="absolute inset-0 translate-x-[10px] translate-y-[10px] rounded-[0_8px_8px_8px] border border-border bg-muted" />
      <div aria-hidden className="absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-[0_8px_8px_8px] border border-border bg-secondary" />
      <div className="relative">
        <div className="absolute -top-[26px] left-0 flex h-[26px] items-center rounded-t-[7px] bg-primary px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-foreground">
          Proposal · Sent
        </div>
        <div className="rounded-[0_8px_8px_8px] border border-border bg-card p-7">
          <h3 className="font-heading text-[1.6rem] font-medium leading-tight text-foreground">Living Room Refresh</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">Proposal · Design Refinement</p>
          <div className="mt-4 flex items-start justify-between gap-3 border-t border-border pt-3.5">
            <p className="type-body flex-1 text-foreground">Sarah opened the proposal twice — a nudge is due.</p>
            <Badge color="warning" variant="subtle">Awaiting</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Vocabulary of the document**
- **Letterhead** — the head of an open document: title in `font-heading`, live vitals as `font-mono` micro-labels.
- **Margin** — decisions/needs sit in a right-margin rail as bordered rows (hairline `border-border`), never a modal.
- **Ledgers** — Orders, Hours, Accounts, Library, People render as quiet ruled tables (`Table`/`List` + `Stat`), each with front-matter.
- **Client-facing moments** — for the client's copy use the kit's narrative components: `ApprovalTheater` (proposal sign-off), `MilestoneCard`/`ImmersiveTimeline` (progress), `CostVisualizer` (budget), `BoardStatic` (mood board).

**Calm.** Motion only under `@media (prefers-reduced-motion: no-preference)`; quiet by default (`bg-card`/`bg-background`, `border-border` hairlines, generous whitespace). Reserve saturated color for status stamps and Strata Mark.

**App-token bridge (for engineers shipping to the live app).** `apps/designer-portal/src/app/globals.css` defines Desk tokens that map onto the kit's semantic tokens: `--doc-paper`/`--bg-surface` → `bg-card`/`bg-background`; `--color-clay` → `primary`; `--text-primary` (charcoal) → `foreground`; `--text-body` (mocha) → `foreground/80`; `--text-muted` → `muted-foreground`; `--border-default` → `border`; stacked sheets `--doc-sheet-front/back` → `bg-secondary`/`bg-muted`. Build with the semantic classes above; they translate 1:1.
