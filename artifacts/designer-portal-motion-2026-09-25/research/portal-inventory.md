# Designer-portal surface, type, and motion inventory

Recon for the motion-concepts memo. Every claim carries a `path:line`
anchor into `apps/designer-portal/src/...` unless noted otherwise.

## §1 The surfaces

**The Desk** (`app/(document)/desk/page.tsx`) is the unconditional landing
surface — D1's "one document at a time." At rest: a Playfair greeting
with the first name in italic Aged Oak (`:246-260`), one uppercase date
line (`.doc-type-meta`, `:261-263`), and a header row — "Capture a lead"
(primary), "Open a project" (secondary), "Find anything" with a visible
`⌘K` chip (tertiary, `:265-316`). Below: at most one `MarginNote` at a
time — first-touch, walkthrough offer, hire hand-off, or setup whisper,
each shown once (`:363-428`; `margin-note.tsx:155-227`). The one
population is the roster (`desk-roster.tsx:202-408`): an "every job" head
with two facet toggles ("Only what needs me," "By person," `:264-289`),
an overdue sentence, an optional "day's line" (`:290-325`), then either
**Claim cards** — boxed, reserved for a job with a claim on the studio's
hand (`desk-claim-card.tsx:90-208`) — or a flat **ledger** of
one-line-per-job rows with no box (`desk-ledger-row.tsx`, grouped
`desk-roster.tsx:152-200`). Nothing folds on first paint. Below: a boards
recents strip (`:443`), a reaction roll-up (`:444`), and Desk Contents
front matter — Rooms / Ledgers / Begin, doorways only, no counts or tiles
(`desk-contents.tsx:4-28`), rising to full prominence when the roster is
empty (`:448` vs `:454`). "In-motion" jobs print as quiet one-line links
with a Golden-Hour dot, never a card (`in-motion-chip.tsx:23-66`). **Large
at rest:** the greeting, a claim card's job name (20px Playfair,
`desk-claim-card.tsx:145-153`), the need sentence (`:170-181`). **Small at
rest:** date, stage/custody plates, person lines. **Hidden until an act:**
margin notes recede permanently on first use.

**The held document** (`app/(document)/doc/[id]/page.tsx`) is full-bleed
paper — "the paper IS the screen" (`:4-10`) — with a sticky **spine**
(`DocSpine`, `:2757-2787`: section jumps, a Strata Mark per section, the
active marker's breath), a sticky **margin** rail on wide viewports, and a
scrolling **main** between them (`:2793-2798`). The **standing head** is
`DocLetterhead` — title, a prominent clickable household/subject line
("not a tiny line," R68.2, `:2799-2802`), vitals, a fill-state mark, and
stage-consistent instruments (send-a-note, view-as, `:2803-2856`).
Sections derive from project stage (`deriveSections`, `:64-67`), each
independently foldable (`components/document/region/fold-seam.tsx`). Esc
is the put-down, sheet priority first (`:9`); the shell mounts with a
raise-to-fill motion (§3). **Large at rest:** the title, the household
line. **Small at rest:** vitals, stage words, spine labels. **Hidden until
an act:** a folded section's body; log-time/margin sheets.

**Rooms** under `(document)/`: `library/[id]` (the Piece,
`library/[id]/page.tsx:6-11`), `people` (People Room, `:3-6`), `room/[id]`
(Room View, a measured-space viewer), `compose` (composing a catalog
piece), `ceremony/[leadId]` (Match Ceremony, flag-gated),
`drafting/[proposalId]` (Drafting Room, proposal authoring), and
`board/[boardId]`/`boards` (mood boards). All but mood-boards share
`RoomShell`
(`components/document/rooms/room-shell.tsx:34-205`): a thin sticky head
(leave-word · Strata Mark + title · one action slot, `:135-183`) over
full-bleed grained paper (`:31-32,126-132`). Entering unmounts `/doc/[id]`
(puts the held document down); leaving returns to a stashed origin
(`lib/document/room-origin.ts`, read at `:73-79,94-98`). **Large at rest:**
the Room's own content. **Small at rest:** the head. **Hidden until an
act:** nothing in the head; the "putting down" veil appears only on leave
(`:194-201`).

**Sheets** (`DocSheet`, `components/document/overlays/doc-sheet.tsx`) are
overlay-not-route: a warm veil plus a centered laid-paper panel that never
unmounts the surface beneath (`:4-11`). Opens as a sheet: every ledger
(Orders/Accounts/Hours/The Post, via `openLedger`), the
capture-lead/open-project front doors (`desk/page.tsx:460-469`), Keys,
Account, Invoice, and Interruption-settings overlays
(`app/(document)/layout.tsx:100-121`). An optional standard head (icon +
DM-mono title + page + "put back · esc") renders when the caller supplies
an `icon` (`doc-sheet.tsx:131-205`). **Large at rest:** nothing. **Hidden
until an act:** the sheet does not exist until opened.

**⌘K** (`components/document/command-bar.tsx`) opens on the ⌘K/Ctrl-K
chord (`:299-317`) or "Find anything" (`desk/page.tsx:307`): a fixed
dialog, backdrop, one combobox input (`:1097-1156`). With no query it
lists grouped rows (recents/rooms/ledgers/verbs), each printing a label, a
mono sub-label, a glyph, and a shortcut mark, all at once (`:1181-1224`).
**Hidden until an act:** the bar — `if (!open) return null` (`:1095`); no
partially-open state.

```
DESK — ASCII sketch (desk/page.tsx)
┌──────────────────────────────────────────────┐
│ Good morning, Leah.        [+Capture a lead]  │
│ TUESDAY · SEP 23            Begin a brief     │
│                             [+Open a project] │
│                             Find anything ⌘K   │
├──────────────────────────────────────────────┤
│ – This is your Desk. Folders that need you    │
│   gather here…                       ⌘K  ×    │
├──────────────────────────────────────────────┤
│ EVERY JOB · N          Only what needs me  By person
│ [overdue sentence] · [day's line links]
│ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ │ PROPOSAL │ │ PROJECT  │ │ INSTALL  │  ← claim cards (boxed, need-tier)
│ │ Ainsworth│ │ Delgado  │ │ Reyes    │
│ │ need line│ │ need line│ │ need line│
│ │ [Act]    │ │ [Act]    │ │ [Act]    │
│ └──────────┘ └──────────┘ └──────────┘
│ ────────────── AT REST ─────────────────────  ← flat ledger rows
│ Brief · 2   Discovery · 1   …
├──────────────────────────────────────────────┤
│ ROOMS         LEDGERS          BEGIN          │
│ Library ↗     Orders  [SHEET]  – Capture a lead
│ People ↗      Accounts[SHEET]  – Open a project
└──────────────────────────────────────────────┘

HELD DOCUMENT, FIRST SCREEN — ASCII sketch (doc/[id]/page.tsx)
┌──┬─────────────────────────────────────┬────┐
│▓▓│ THE AINSWORTH RESIDENCE              │mgn │  ← spine (sticky)
│▓▓│ Ainsworth household · view/change     │itm │  ← margin rail (≥1440px)
│░░│ [vitals row]   [fill mark]           │    │
│░░│ Send a note · View as        instrmt │    │
│░░│──────────────────────────────────────│    │
│░░│ § BRIEF                     (folded)  │    │
│▓▓│ § DISCOVERY                           │    │
│░░│   [section body, scrollable]          │    │
└──┴─────────────────────────────────────┴────┘
  spine marks = Strata Mark per section (▓ settled/active, ░ future)
```

## §2 Type and tokens

Two type systems coexist. The **house-sheet** contract (newer, applied
surface-by-surface — `apps/designer-portal/CLAUDE.md:23`) is a fixed
7-step scale plus one money step, verbatim at `app/globals.css:2039-2047`:

| Class | Face var | Size | Line-height | Weight | Letter-spacing |
|---|---|---|---|---|---|
| `.t-d1` | `--font-display` | 34px | 1.15 | 500 | 0 |
| `.t-d2` | `--font-display` | 26px | 1.20 | 500 | 0 |
| `.t-d3` | `--font-display` | 20px | 1.30 | 500 | 0 |
| `.t-body` | `--font-body` | 16px | 1.55 | 400 | — |
| `.t-body-sm` | `--font-body` | 14px | 1.50 | 400 | — |
| `.t-meta` | `--font-meta` | 12px | 1.50 | 400 | .08em |
| `.t-head` | `--font-meta` | 11px | 1.50 | 500 | .08em, upper |
| `.t-money` | `--font-meta` | 15px | 1.50 | 400 | .02em, tabular |
| `.t-authorship` | `--font-display` | 20px | 1.30 | 400 italic | — |

Older, still-live **fluid** classes coexist on most Desk surfaces
(`globals.css:1452-1472`): `.doc-type-meta` (`--font-meta`,
`max(var(--type-metadata-min), .667rem)`, 1.5 lh, .06em), `.doc-type-body`
(`--font-body`, `max(var(--type-body-min), .875rem)`, 1.65),
`.doc-type-control` (`--font-body`, `max(var(--type-control-min),
.889rem)`, 1.4). A mock of the Desk header/roster should use `.doc-type-*`
(e.g. `desk/page.tsx:261,338,371`); a newly-touched house-sheet surface
should use `.t-*`.

**Faces.** `app/layout.tsx:3,9-27` loads `Playfair Display` → `--font-
heading`, `Inter` → `--font-inter`, `DM Mono` → `--font-mono`;
`globals.css:1560-1562` maps these into `--font-display`, `--font-body`,
`--font-meta`. **Confirmed: Playfair Display, not Fraunces.** Meta face is
DM Mono — every uppercase label, date, stage plate, money figure.

**Colour tokens** (`globals.css:12-201`; canonical sheet
`docs/design/house-sheet/SPEC.md:32-87`): `--color-clay:#C4A57B`,
`--color-aged-oak:#8B7355`, `--color-charcoal:#2C2926`,
`--color-clay-ink:#7C5E30`, `--doc-paper:#FCFAF6` (a document laid on the
ground), `--doc-ink-border:rgba(44,41,38,.18)`, `--bg-primary:
var(--color-off-white)` (Desk ground), `--text-primary:var(--color-
charcoal)`, `--text-muted:#4E4339`, `--text-faint:#65594E`, rules
`--rule-hair:1px solid rgba(44,41,38,.10)`, `--rule-strong:2px solid
#2C2926`, and the one depth token `--elevation-sheet:0 1px 2px
rgba(44,41,38,.08)` (`:201`, D4's one exception). The house sheet's three
paper stocks: `--paper:#FAF7F2` (ground/desk), `--paper-doc:#FCFAF6` (a
laid document, same value as `--doc-paper`), `--rail:#E8E3DB`
(rail/deeper sheet) — plus four state pigments as material/ink pairs
(clay/golden/terracotta/sage) and seven stage-plate colours
(`SPEC.md:36-72`).

**Rhythm/radii:** one 24px module — "every block-level gap is 24/48/72/12
(half). Nothing else." (`SPEC.md:79,164`). `--radius-hair:2px`,
`--radius-box:3px` (`SPEC.md:80-81`) — matches live corners (e.g.
`desk-claim-card.tsx:594`).

## §3 Motion today

**framer-motion is a declared dependency
(`apps/designer-portal/package.json:64`,
`packages/patina-design-system/package.json:123`) with zero call sites
inside the Document surface.** All 8 importing files
(`components/catalog/back-to-top.tsx`, `empty-state.tsx`,
`floating-action-button.tsx`, `product-card-animated.tsx`,
`product-comparison.tsx`, `quick-view-modal.tsx`, plus two under
`components/portal/procurement/`) sit in the old catalog/procurement
zones. Every Document-surface animation is plain CSS — `@keyframes` and
Tailwind arbitrary `animate-[...]`/`transition-*` utilities.

Durations/easings/anchors are in the table below; nuances the table can't
carry: **the breath (R15)** is the *only* ambient motion in the system,
scoped to the spine's active Strata Mark alone via a `breathing` prop
(`doc-spine.tsx:201-204`) — nothing on the Desk moves on its own. **The
document's own mount** is named "pick-up" in the code and its comment
(`globals.css:287`), not "put-down" — see report-back. **DocSheet**'s
settle-up keyframe is reused at three durations by sibling sheet
primitives (`doc-sheet.tsx:386` 240ms, `mobile-sheets.tsx:329` 250ms,
`room-sheet.tsx:106` 300ms) — no single canonical "a sheet opens" number.
**⌘K and MarginNote have no animation at all**, in either motion
preference — `CommandBar` is `if (!open) return null`
(`command-bar.tsx:1095`) and `MarginNote`'s visibility is a plain boolean
toggle (`margin-note.tsx:167-227`). **A folded region's expand**
(`fold-seam.tsx:71,89`) is scoped *only* inside `@media
(prefers-reduced-motion:no-preference)` (`globals.css:492-500`) — reduced
motion gets no fallback at all, unlike every other animated surface here.
**The row/action hover wash** sweeps from the pointer's contact point on
hover, but focus-within gets the identical fill with **no** sweep
(`globals.css:409-414`) — "a keyboard has no point of contact." Reduced-
motion coverage is wider than this ticket's anchors suggest: 55 files use
`motion-reduce:`, 21 use `motion-safe:`, 15 reference the literal
`prefers-reduced-motion` query directly (vs. the 26-file estimate given).

| Surface | Trigger | What moves | Duration | Easing | Reduced-motion | Anchor |
|---|---|---|---|---|---|---|
| Held doc | mount `/doc/[id]` | opacity+scale(.986→1) | 270ms | ease-out | crossfade 200ms | `doc/[id]/page.tsx:2745` |
| Room | enter | opacity+scale | 300ms | var(--ease-editorial) | crossfade 200ms | `room-shell.tsx:126` |
| Room | leave (Esc/back) | veil fade, then nav | 380ms hold+200ms fade | var(--ease-editorial) | navigate now, no veil | `room-shell.tsx:90-111,190-201` |
| Sheet | open ledger/overlay | translateY(14px)+opacity | 240-300ms | var(--ease-editorial) | `animation:none` | `doc-sheet.tsx:386` |
| ⌘K | ⌘K / Find anything | none | 0ms | — | — | `command-bar.tsx:1095` |
| Margin note | eligibility | none | 0ms | — | — | `margin-note.tsx:167` |
| Desk roster | first paint | cards translateY(14px)→0, staggered | 320ms+60ms/card (cap 7) | var(--ease-editorial) | `animation:none` | `globals.css:441-460` |
| Fold seam | expand | fade+drop, arrow flip | 300ms | var(--ease-editorial) | none at all | `fold-seam.tsx:71,89` |
| Spine marker | ambient | opacity 1↔0.62 loop | 3s infinite | ease-in-out | `animation:none` | `globals.css:307-326` |
| Strata fill | stage change | scaleX per line | 600ms | ease-in-out | `transition:none` | `strata-mark.tsx:116` |
| Strata sweep | indeterminate load | 3 bars scaleX, fade, restart | 2.2s cycle | cubic-bezier(.4,0,.2,1) | static .6 fill | `globals.css:525-567` |
| Wash (hover) | pointer hover | clip-path circle | 200-260ms | var(--ease-editorial) | flat tint, instant | `row-wash.tsx`; `globals.css:392-407` |
| Wash (focus) | keyboard focus | full fill, no sweep | 0ms | — | (already instant) | `globals.css:409-414` |
| Scored Ink | hover/press | underline+ink transforms | 150-260ms | linear/var(--ease-editorial) | `motion-reduce:transition-none` | `globals.css:753-838` |

## §4 The acts

- **Hover** — animated: clip-path wash sweeps from contact point
  (`row-wash.tsx:20-33`).
- **Focus** — partial: wash fills instantly, no sweep (`globals.css:
  409-414`); focus ring is instant.
- **Scroll** — instant: an `IntersectionObserver` tracks reading position
  with no visual motion (`hooks/use-document-running-index.ts:1-20`); a
  jump relies on native smooth scroll.
- **Hold/put-down** — animated both ends: pick-up raises the document in
  (270ms); leaving a Room animates a veil + 380ms delay
  (`room-shell.tsx:90-111`); leaving the open document is a route change
  with no exit animation of its own.
- **⌘K** — instant open/close (`command-bar.tsx:1095`).
- **Arrival (first Desk load)** — partial: claim cards settle staggered;
  ledger, margin notes, Desk Contents all appear unanimated in the same
  paint.
- **Opening a folder** (a Rooms/Ledgers doorway) — animated only via its
  destination (Room raise or Sheet settle); the click itself has none.
- **Opening a sheet** — animated: doc-sheet-up, 240-300ms.
- **Entering a Room** — animated: doc-raise, 300ms.
- **Expanding a section** — animated only under
  `prefers-reduced-motion:no-preference`; reduced motion is an instant
  hard-swap with no transition at all.
- **Keyboard nav** (⌘K arrows) — instant: the active-row highlight
  carries no transition class (`command-bar.tsx:1203-1205`).

## §5 Constraints from `apps/designer-portal/CLAUDE.md`

The file states D4 and D1 in full and the rest by reference to
`docs/design/the-document/DECISIONS.md`'s D-table — seeded, per the file's
own text, from a `the-document-spec.md` that no longer exists anywhere in
the repo; the table at `DECISIONS.md:12-21` is the only surviving verbatim
source:

- **D1** — one document at a time. No split view, no peek/hold. Esc/"Put
  down" is the only exit.
- **D2** — interruptions designer-driven, never system-dictated. Ships
  all-off.
- **D3** — mobile: margin items → anchored chips; spine → bottom sheet.
  Gated by a mobile milestone.
- **D4** — no shadows, anywhere, no exceptions. Depth = value contrast +
  flat stacked edges + tab; lint-enforced, CI-blocking.
- **D5** — the Weekly Pulse lives in the margin (kind `pulse`, anchored to
  Project). Friday unsent Pulses rise on the Desk.
- **D6** — documents visible to all studio members, no exclusive holds.
  Presence line in the spine; per-member "needs *your* hand."
- **D7** — ship alongside, phase in. Zones dissolve only after validation
  + mobile pattern.
- **D8** — Studio Drawer persistent everywhere; ledgers open as overlay
  sheets; collapsed by default, no badges, no pulsing counts.
- **D9** — time: capture in the document (spine timer), review in the
  drawer (Hours ledger).
- **D10** — suggestive, adjustable capture. Designer adjusts up/down,
  nothing auto-trims; <60s discards silently; idle only annotates.
- **D11** — timer auto-starts on pick up — provisional; falls back to
  one-tap start if surveilling. (Ratified, DECISIONS.md R19.)

**Other rules touching motion/shadows/layering/badges** (`CLAUDE.md`): D4's
amendment (R126) relaxes the shadow ban to one token (`--elevation-sheet`)
at exactly three sites — margin chips, the open ledger sheet, the studio
drawer; portal-polish (R139-R142) "adopts no depth at all: no new site,
no new token" (`:21`). D1: "sheets must never unmount or reset the
document beneath them" (`:22`). Typography-first: hierarchy via
Playfair/Inter/DM Mono weight, size, colour — never cards-within-cards or
tab bars; no new hex literal outside the house-sheet SPEC (`:23`). "What
success looks like": "At no point does she see a shadow, a zone, a badge,
or a dashboard; the only filled control she ever sees is a terminal act
where money moves or a paper is signed." (`:48`).

## §6 What would break

1. **A list that must be scannable at rest.** The claim card's need
   sentence and the "day's line" exist so a job's need reads without any
   act — R143's premise (`desk-claim-card.tsx:168-181`; `desk-roster.tsx:
   294-325`). Hiding it behind a reveal would erase the surface's whole
   point.
2. **⌘K's results list.** Every row prints label *and* mono sub-label at
   once so a keyboard-only searcher can disambiguate two similar documents
   without a hover state to reveal anything (`command-bar.tsx:1208-1214`).
3. **A Room's head action.** `RoomShell`'s one action slot renders
   unconditionally in the head row (`room-shell.tsx:180-182`) — the
   Room's one functional control, not a flourish that can wait for a
   gesture.
4. **The held document's standing head.** `DocLetterhead`'s vitals and
   household line are deliberately "a prominent clickable line," not
   decorative type (`doc/[id]/page.tsx:2799-2802`) — data the designer
   edits from, not text that precedes the "real" content.
5. **A form.** `CaptureLeadSheet`'s field labels (Name, Email, Phone, "The
   project," "Where from") must stand at rest for the field to be usable
   at all (`overlays/capture-lead-sheet.tsx:161,182,197,209,232`); hiding
   a label until focus/hover breaks glance-back checking and the
   visible-label expectation both screen readers and sighted users rely
   on.
