# Fragment index — The Document, Wayfinding Review (2026-08-25)

Ten self-contained screen fragments, one per lane × screen. Each file is a single
`<section class="mock-frame …" data-screen="Mn" data-width="…" data-lane="A|B">…</section>`
element — safe to inline directly into a deck without modification. None of them
carry a `<head>`; the deck assembler supplies `kit.css` plus the one direction
stylesheet each fragment needs.

| Fragment | data-screen | data-width | Lane | CSS required (in order) |
|---|---|---|---|---|
| `a-M1.html` | M1 | 1440 | A — Everything Prints | `kit.css`, `direction-a.css` |
| `a-M2.html` | M2 | 1440 | A — Everything Prints | `kit.css`, `direction-a.css` |
| `a-M3.html` | M3 | 1280 | A — Everything Prints | `kit.css`, `direction-a.css` |
| `a-M4.html` | M4 | 390 | A — Everything Prints | `kit.css`, `direction-a.css` |
| `a-M5.html` | M5 | 1440 | A — Everything Prints | `kit.css`, `direction-a.css` |
| `b-M1.html` | M1 | 1440 | B — The Shop Ticket | `kit.css`, `direction-b.css` |
| `b-M2.html` | M2 | 1440 | B — The Shop Ticket | `kit.css`, `direction-b.css` |
| `b-M3.html` | M3 | 1280 | B — The Shop Ticket | `kit.css`, `direction-b.css` |
| `b-M4.html` | M4 | 390 | B — The Shop Ticket | `kit.css`, `direction-b.css` |
| `b-M5.html` | M5 | 1440 | B — The Shop Ticket | `kit.css`, `direction-b.css` |

Each fragment's own `<figcaption>` (embedded inside it) is the caption text to
show under the frame — no separate captions file.

## Screen map

- **M1** — `/desk` at 1440.
- **M2** — `/doc` project (Vandersteen) at 1440, first ~1300px (the fold).
- **M3** — `/doc` project at 1280 (compact spine tier).
- **M4** — `/doc` project at 390 (mobile), with the `More` sheet open.
- **M5** — `/doc` at 1440, a second document state: A5 shows the Okonkwo kitchen
  install document (Tuesday 3:40pm, the carrier window); B5 shows the same
  install document mounted the same way as M2.

## Dark-mode note

`a/M2-dark.png` and `b/M2-dark.png` exist as rendered screenshots but there is
**no separate `M2-dark.html` fragment** for either lane — the dark shot was
produced by rendering the same `M2.html` fragment with `data-theme="dark"` set
on an ancestor (kit.css's light/dark guard reads that attribute, see KIT.md).
If the deck wants a dark-mode row, reuse `a-M2.html` / `b-M2.html` and set
`data-theme="dark"` on the wrapping element rather than adding a new fragment.

## CSS collision check (direction-a.css vs direction-b.css)

Ran `grep -oE '\.[a-zA-Z][a-zA-Z0-9_-]*'` over both stylesheets and diffed the
unique class-selector tokens. Four tokens appear in both files:

- `.is-past`, `.is-current`, `.stamp` — kit.css primitives (`.stamp` is defined
  in kit.css §12; `.is-current`/`.is-past` are the running-index/spine state
  modifiers). Both direction stylesheets only ever write them as **compound**
  selectors scoped under a lane-prefixed ancestor or class — e.g.
  `.a-marks i.is-past`, `.a-srow.is-current`, `.stamp.a-stamp-decision` in
  direction-a.css vs. `.b-mark.is-past i`, `.b-ri-row.is-current`,
  `.b-page .stamp` in direction-b.css. Because every rule requires an `.a-*`
  or `.b-*` ancestor/class in the chain, there is no cross-lane bleed and
  **no rename was needed**.
- `.css` — a grep false positive (matched inside a literal string, e.g. a
  `url("…kit.css")` reference), not a real class selector.

No genuine collisions found; direction-a.css and direction-b.css can be
loaded on the same page (as mockups.html does) without either lane's rules
overriding the other's.
