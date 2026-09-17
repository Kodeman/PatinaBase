# Keyboard shortcuts inventory — designer portal, verified 2026-09-03

Every row below was confirmed by reading the source file directly (not inferred from comments). `grep -rn "metaKey\|ctrlKey"` across `apps/designer-portal/src` (excluding tests) was the seed list; each hit was opened and read.

---

## ⌘K / Ctrl+K — the command bar

**File:** `apps/designer-portal/src/components/document/command-bar.tsx` (1145 lines).

**Open:** `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'` — toggles open/closed, bound at `window`, capture phase. Also opens via the `document:open-command-bar` custom event (the Desk header's "Find anything" affordance) and via the `document:open-ledger`-adjacent doorway system.

**Close:** `Escape` while open — but yields to a deeper state first: if the Engine "ask" sub-view is active, Escape closes that (`setAsking(null)`) rather than the whole palette; only a second Escape (or one when not asking) closes the bar. Also closes via the backdrop click.

**Focus restore (F21):** the element focused when ⌘K opened is captured and restored on close, unless it was `document.body` (nothing meaningfully focused).

### Group headings (in open-with-empty-query order) — corrected against source, more than the raw inventory's "6 groups" claim

The raw inventory said: "In hand / Recent / This surface / Begin / Rooms & ledgers / Studio." The actual `sections.push(...)` sequence in `command-bar.tsx` (lines ~747–818) is:

1. **"Where the work stands"** — `stageRows`, built from `STAGE_ORDER` — every live document grouped by pipeline stage. (Missing from the raw inventory.)
2. **"In hand"** — the one document currently in hand (if any), rendered via `documentRow(inHandRow, 'resume')`.
3. **"Recent boards"** — up to 4 of `recentBoards` (mood boards), shown only if any exist. (Missing from the raw inventory.)
4. **"Recent"** — up to 3 recently-visited documents (excludes the in-hand one), from the `readRecentDocumentsInHand()` localStorage MRU.
5. **"This surface"** — context-sensitive rows only when a project document is in hand: "Add to project," "Add a change," a pre-addressed "Draw an invoice · {project}" row, "Open the Drafting Room" (if a proposal is drafting), a pre-addressed "Start a board" row, and the four `DOCUMENT_SCOPED_SURFACES` (Plan room, Spec book, Boards, Call sheet — the last flag-gated on `call-sheet`).
6. **"Rooms & ledgers"** — every `STUDIO_ROOMS` + `STUDIO_LEDGERS` entry with `scope === 'global'` (i.e. Library, People, The Scans, Orders, Accounts, Hours, The Post — NOT the Drafting Room or Call Sheet, both `scope: 'document'`).
7. **"Begin"** — all of `STUDIO_VERBS` (Capture a lead, Open a project, Draft a design agreement, Draw an invoice, Add a maker).
8. **"Studio"** — `utilityRows`, the studio's own controls (see table below).

### Row kinds

The `PaletteRow` union type has 5 kinds, each with its own glyph:
- `'document'` — carries a `FillState` and renders the **Strata Mark** (the fill-state progress device, R15/R35) as its glyph.
- `'room' | 'ledger' | 'verb'` — carries a `LucideIcon` from the registry, plus an optional `shortcut: string[]` shown as a trailing chip (e.g. `G L`).
- `'action'` — studio-control rows (Settings, Sign out, etc.); optional icon.
- `'help'` — the "Browse the Help Center" row, carries `LifeBuoy` icon.

### The "Studio" group — full row list (`allUtilityRows`, exact labels/subs/match-terms)

| key | label | sub | destination |
|---|---|---|---|
| `help-center` | "Browse the Help Center" | "guides · every surface" | `router.push('/help')` |
| `help-panel` | "Help…" | "about this surface" | `openHelp()` — contextual panel |
| `take-walkthrough` | "Take the walkthrough" | "the Desk, in a minute" | `router.push('/desk?tour=desk-walkthrough')` |
| `leave-note` | "Leave a note" | "feedback on this screen" | `openFeedbackSheet()` — **filtered out unless the `tester-notes` flag is on** |
| `desk` | "The Desk" | "go home" | `router.push('/desk')` |
| `interruptions` | "Interruptions" | "break-through settings" | dispatches `document:open-interruptions` |
| `settings` | "Settings" | "profile · notifications · security" | `openAccount()` |
| `signout` | "Sign out" | user's email, or "end this session" | `signOut()` |

### Typed-query behavior

- Query filters across: recent boards, live documents (all stages), the "This surface" context rows, and `matchSurfaces(query)` over the full registry (rooms + ledgers + verbs + the 3 document-scoped surfaces), which matches on label **and aliases** (generous — e.g. "invoicing" resolves "Draw an invoice," "moodboards" resolves "Boards," "po" resolves "Orders").
- A dry query (no matches) falls back to offering "Ask the Engine" — the R38 no-mode design: same box, same input, the last row for any typed query is an Engine ask that answers inline in paper result-lines.
- When asking the Engine, results render as `EngineResults` with a *"Results · "{query}""* header and a **"← results"** button back to the filtered list.

### Arrow / Enter / Escape inside the input (lines ~1067–1083)

```
if (asking) {
  if (e.key === 'Enter') { e.preventDefault(); setAsking(query.trim() || null); }
  return;
}
if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flatRows.length - 1)); }
else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
else if (e.key === 'Enter' && flatRows[active]) { e.preventDefault(); choose(flatRows[active], active); }
```
So: ArrowDown/ArrowUp move the active row (clamped, no wraparound), Enter chooses the active row (or, while in "ask" mode, re-submits the ask query). Mouse hover also sets `active` (`onMouseEnter`).

**Placeholder text:** *"Find a document or a ledger…"* (`aria-label="Find anything"`).

**No UI copy anywhere tells the user ArrowUp/ArrowDown/Enter work** — these are the standard combobox convention, undocumented in-app.

---

## `g`-chords — the registry shortcuts

**File:** `apps/designer-portal/src/components/document/registry-shortcuts.tsx` (113 lines). Headless — "Renders nothing — no new UI" (module doc).

**Mechanism:** press `g`, then within `CHORD_WINDOW_MS = 1200`ms press one of the chorded keys. The chord table is built directly off the registry's own `shortcut` field:
```ts
const CHORDED = Map(ALL_STUDIO_SURFACES.filter(s => s.shortcut?.length === 2 && s.shortcut[0] === 'g')
  .map(s => [s.shortcut[1], s]))
```

**The 6 live chords** (from `registry.tsx`'s `shortcut` fields — grepped and confirmed):

| Chord | Surface | Weight | Action |
|---|---|---|---|
| `g` `l` | Library | room | `router.push('/library')` |
| `g` `p` | People | room | `router.push('/people')` |
| `g` `r` | The Scans | room | `router.push('/rooms')` |
| `g` `o` | Orders | sheet | dispatches `document:open-ledger` with detail `'orders'` |
| `g` `a` | Accounts | sheet | dispatches `document:open-ledger` with detail `'accounts'` |
| `g` `h` | Hours | sheet | dispatches `document:open-ledger` with detail `'hours'` |
| `g` `t` | The Post | sheet | `openPost()` |

(7 chords total — the raw inventory's "l/p/o/a/h/t/r today" list matches exactly; **no `g`-chord exists for the Drafting Room or Call Sheet** — both are `scope: 'document'` and carry no `shortcut` field.)

**Suppression:** ignored if any modifier key is held (`metaKey || ctrlKey || altKey`), if the event target is an editable element (`input`/`textarea`/`select`/`contenteditable`), or if `anOverlayIsOpen()` — which checks `document.activeElement !== document.body` OR any `[role="dialog"]` is mounted. The file doc notes there is no dedicated "command bar is open" flag, so this dual check is a deliberate fallback that "covers all of them" (every dialog in the app moves focus into itself and renders `role="dialog"`).

**Analytics:** `documentEvents.wayfinding.doorOpened({ key, weight, source: 'shortcut' })`.

**No visible feedback that a `g` is "armed"** — pressing `g` alone gives no on-screen indication; if the second key doesn't match within 1.2s (or matches nothing), the chord is silently dropped.

---

## Escape / Enter / Arrow behavior inside the Desk Walkthrough tour

**File:** `packages/help-system/src/proactive/TourController/TourController.tsx`, lines ~493–515. Bound at `document` level (not the popover), so it works regardless of what has focus:

```ts
if (e.key === 'Escape') { e.preventDefault(); skip(); }
else if (e.key === 'Enter') {
  // Enter on the last step completes; otherwise advances.
  e.preventDefault();
  if (safeIndex === steps.length - 1) complete(); else next();
}
```

While `paused` (the desk-walkthrough component sets this when ⌘K is open) these handlers are disabled entirely — "so Enter/Escape don't leak through to advance or dismiss it" (comment). No ArrowLeft/ArrowRight step navigation exists in the tour — only Escape (skip) and Enter (advance/complete). Nothing in the coachmark UI copy states "press Enter to continue" or "press Esc to skip" — UNVERIFIED whether the coachmark's own visible Next/Skip buttons carry that hint textually (not opened this session — the popover markup itself was not read).

---

## Every ⌘/Ctrl+Enter save — full grep-confirmed list

`grep -rn "metaKey\|ctrlKey" apps/designer-portal/src --include="*.tsx" --include="*.ts"` (excluding tests) returned these sites; each opened and confirmed:

| File | Behavior |
|---|---|
| `components/document/margin-rail.tsx:706` | `if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote();` — margin note composer (desktop) |
| `components/document/mobile/mobile-sheets.tsx:1054` | same pattern — margin note composer (mobile sheet) |
| `components/document/coordination/open-item-sheet.tsx:490` | `if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void handleSend(); }` — thread-note composer ("Add a note to the thread…") |
| `components/mood-board/board-room-inspector.tsx:106` | `if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { commit(); blur(); }` — board item note field |
| `components/mood-board/board-room-shell.tsx:228` | same pattern — board note textarea (canvas-embedded) |
| `components/mood-board/board-item-direction-panel.tsx:180` | `if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { preventDefault(); void submit(); }` — "Add direction" field |

**None of these six sites shows a visible hint** (no placeholder text, no trailing chip) that ⌘/Ctrl+Enter submits — confirmed by reading each surrounding block; all rely on convention alone.

---

## Board Room canvas — the richest undiscovered shortcut set

**File:** `components/portal/scope-builder/board-room-controller.tsx` (mood-board / board-room editing surface). Not mentioned at all in the raw inventory. Full keydown handler (~lines 1471–1566), gated to `mode === 'edit'` for the edit-only shortcuts and skipped entirely while a pointer gesture is in flight (drag/resize/rotate) to avoid collisions:

| Key | Action |
|---|---|
| `Escape` | context menu close → present-mode exit → clear selection → (armed) confirm-exit the whole board room (two-press pattern with a `BOARD_ROOM_EXIT_CONFIRM_MS` window and a live-region announcement) |
| `p` (no modifier) | toggle Present mode |
| `⌘/Ctrl+Z` | undo |
| `⌘/Ctrl+Shift+Z` | redo |
| `Ctrl+Y` | redo (Windows convention, separate from the Ctrl+Shift+Z path) |
| `⌘/Ctrl+D` | duplicate selected items |
| `⌘/Ctrl+C` | copy items |
| `⌘/Ctrl+X` | cut items |
| `⌘/Ctrl+V` | paste at last pointer position (or canvas center) |
| `⌘/Ctrl+L` | toggle lock |
| `⌘/Ctrl+]` | bring forward (`+Shift` → bring to front) |
| `⌘/Ctrl+[` | send backward (`+Shift` → send to back) |
| `Delete` / `Backspace` | delete selected items |
| `Shift+T` | tidy (auto-layout) |

**Separately, the board-room-shell.tsx view controller** (~lines 220–240) adds, scoped to the canvas root element only:

| Key | Action |
|---|---|
| `1` (no modifier) | fit to view |
| `⌘/Ctrl+0` | reset zoom |
| `⌘/Ctrl+` `+`/`=`/`-` | zoom in / out |

This is a full design-tool-grade shortcut set (undo/redo, clipboard, z-order, zoom, tidy) with **zero in-app documentation** — no tooltip, no menu showing the bindings, no help-panel entry found for Board Room shortcuts specifically.

---

## Tester Notes widget — ⌘⇧F

**File:** `components/tester/tester-widget.tsx`, line 93:
```ts
if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
  e.preventDefault(); openFeedbackSheet();
}
```
Comment: *"⌘⇧F — the keyboard doorway the old feedback button owned."* Only active while `live` (the `tester-notes` PostHog flag). Same `openFeedbackSheet()` destination as ⌘K's "Leave a note" row. Not documented anywhere in visible UI — UNVERIFIED whether the Tester Notes widget itself surfaces the shortcut in its own panel copy (widget body not read this session).

---

## What does NOT exist

- **No shortcuts modal, no cheat sheet, no `?`-opens-help-overlay convention.** Grepped explicitly: no `KeyboardShortcuts`, `ShortcutsHelp`, "cheat sheet" hits anywhere in `apps/designer-portal/src` or `packages/help-system/src`.
- **No central hotkey registration hook.** Every shortcut above is its own `window.addEventListener('keydown', ...)` or `document.addEventListener('keydown', ...)` effect, independently guarding against editable targets and open overlays. The `g`-chord file, the command bar, and the board-room controller each reimplement their own "is an overlay open" / "is this an editable target" check.
- **No visible chip/badge in the UI for ⌘/Ctrl+Enter anywhere** (margin notes, item threads, board notes) — confirmed by reading all 6 call sites; none renders a trailing "⌘⏎" hint the way ⌘K's registry rows do (`g l`, `g p`, etc. render as trailing chips in the palette itself, per `command-bar.tsx`'s `renderTrailing`).
- **No board-room shortcut legend** anywhere findable in this pass.

---

## Discoverability verdict

**Surfaced somewhere in UI copy (partial or full):**
- ⌘K itself — the Desk header's "Find anything" button + `⌘K` chip; the walkthrough's Step 5 ("Find anything") teaches it explicitly; the `desk-first-touch` margin note teaches it explicitly ("⌘K finds anything by name — try 'invoice'").
- The `g`-chords for rooms/ledgers — surfaced ONLY as a trailing chip (`G L`, `G P`, etc.) inside the ⌘K palette's own rows, which means a designer has to already be inside the mechanism the chord is an alternative to, in order to learn the chord exists. No standalone teaching of `g`-chords was found anywhere (not in the walkthrough's 6 steps, not in any margin note, not in the Help Center topic descriptions).
- ⌘⇧F (Tester Notes) — named in code comments only; UNVERIFIED whether the widget's own UI states it.

**Never surfaced anywhere in UI copy — pure convention/hidden:**
- Every ⌘/Ctrl+Enter save (margin notes, thread notes, board notes, direction panel) — zero in-app hint at any of the 6 sites.
- ArrowUp/ArrowDown/Enter navigation inside the ⌘K palette itself — standard combobox behavior, never stated.
- Escape/Enter inside the Desk Walkthrough tour — never stated in the coachmark copy quoted in file 03 (none of the 6 step bodies or the modal body mentions keyboard navigation of the tour itself; UNVERIFIED whether the coachmark chrome shows explicit "Next"/"Skip" *buttons* that make the keys redundant rather than hidden — the popover markup itself wasn't read).
- The entire Board Room shortcut set (undo/redo/clipboard/z-order/zoom/tidy/present) — this is the single largest undocumented surface found in this audit: 13+ distinct bindings with no legend, no tooltip, no onboarding touch anywhere.

**Net read for a persona team:** the portal's *one* mechanism for teaching a shortcut is embedding it as a trailing chip inside the destination it's a shortcut *for* (⌘K rows showing `g l`), or a one-time tour step / margin note that mentions ⌘K by name exactly once. There is no general-purpose "here are the keys" surface — a returning designer who skipped the walkthrough, dismissed the margin note, and never happens to type into ⌘K long enough to notice the `g l` chip has no path to discovering any shortcut in the product, including the Board Room's substantial editing-shortcut set.
