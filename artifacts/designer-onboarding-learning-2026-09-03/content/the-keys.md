# The keys — shortcut reference

<!--
Source of truth for L5's `keys-reference.ts` (`buildKeysReference()`), and the
copy behind Help Center article `designer-portal/document/guide/the-keys`
(content/wave-1/20-the-keys.md). Generated from
`briefing/04-shortcuts-inventory.md` (verified against source 2026-09-03) and
`apps/designer-portal/src/lib/document/registry.tsx`'s `shortcut` fields — the
"Rooms and books" table below is never hand-typed twice; L5 must print it from
the registry at render time, not copy these rows into a literal.

This file is not itself loaded by the Sanity loader — L5's page renders
`buildKeysReference()` from code, not CMS content (proposal §7, decision 8:
"one source, two doorways" — the source is the registry + this inventory, the
two doorways are the sheet and the article page). It exists so the exact
wording is agreed here once, in Kody's approval batch, rather than drifting
between the ⌘K chip, the sheet, and the article.

Tester Notes' ⌘⇧F is deliberately excluded — internal, flag-gated, not
customer-facing while that remains true (briefing 04).
-->

## Anywhere

| Keys | What it does |
|---|---|
| `⌘` `K` (`Ctrl` `K`) | Find anything |
| `Esc` | Closes whatever's open — the palette, a sheet, the Engine's answer (press twice while asking the Engine: once closes the answer, again closes the palette) |
| `?` | Opens this page, as a sheet — anywhere you're not typing, and nothing else is already open |

## Rooms and books

Printed from `ALL_STUDIO_SURFACES[].shortcut` in `registry.tsx` at render — a re-chord in the registry updates this table with no separate edit. Current seven, confirmed against source:

| Keys | Where |
|---|---|
| `G` `L` | Library |
| `G` `P` | People |
| `G` `R` | The Scans |
| `G` `O` | Orders |
| `G` `A` | Accounts |
| `G` `H` | Hours |
| `G` `T` | The Post |

Press `G`, then the second key within about a second (`CHORD_WINDOW_MS = 1200` in `registry-shortcuts.tsx`). Ignored while typing in a field, or while any sheet or dialog is open. The Drafting Room and the Call Sheet carry no chord — both are scoped to a single document, not the whole studio.

## While writing

Six sites, none of them showing a hint on screen before now:

| Keys | Where |
|---|---|
| `⌘` `Enter` (`Ctrl` `Enter`) | Saves the note you're writing — the margin note composer (desktop and mobile), a thread note, a note on a board item, a board's own canvas note, a board's direction panel |

## The Board Room

The mood-board canvas's own set — thirteen-plus bindings, the largest undocumented surface in the portal until this page. Source: `board-room-controller.tsx`'s `handleKeyDown` (~lines 1471–1566) and `board-room-shell.tsx`'s view controller (~lines 220–240). Active only in edit mode, and skipped while a drag, resize, or rotate is in progress.

| Keys | What it does |
|---|---|
| `Esc` | Closes a menu, then exits Present, then clears a selection — press once more to leave the Board Room (a confirm window guards the exit) |
| `P` | Toggle Present mode |
| `⌘` `Z` (`Ctrl` `Z`) | Undo |
| `⌘` `Shift` `Z` (`Ctrl` `Y`) | Redo |
| `⌘` `D` (`Ctrl` `D`) | Duplicate the selection |
| `⌘` `C` / `⌘` `X` / `⌘` `V` | Copy / cut / paste |
| `⌘` `L` (`Ctrl` `L`) | Lock the selection |
| `⌘` `]` (`+Shift` for front) | Bring forward / bring to front |
| `⌘` `[` (`+Shift` for back) | Send backward / send to back |
| `Delete` / `Backspace` | Delete the selection |
| `Shift` `T` | Tidy — auto-layout |
| `1` | Fit to view |
| `⌘` `0` (`Ctrl` `0`) | Reset zoom |
| `⌘` `+` / `⌘` `−` | Zoom in / out |

## The walkthrough

| Keys | What it does |
|---|---|
| `Enter` | Advances to the next stop — finishes the tour on the last one |
| `Esc` | Skips the tour |

Bound at the document level, so it works no matter what has focus, but disabled while ⌘K is open so Enter and Escape don't leak through and advance or dismiss the tour by accident.
