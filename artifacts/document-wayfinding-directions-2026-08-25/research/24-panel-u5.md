# U5 — Reach: keyboard, mobile, accessibility

Lens U5. Walked all sixteen tasks against flag-off (w1440/w1280/m390) and the Worktable
(wt-, flag on), all three width tiers, against WCAG 2.2 AA (2.4.1, 2.4.3, 2.4.7, 1.4.3,
2.5.8), landmarks, keyboard-trap freedom, Fitts on the drawer, and touch targets. Verified
against `main@695addb5f`. Every claim below is either (a) a direct code read with file:line,
(b) a live-probe result from `probe/01-interactive-probe.md`, or (c) a screenshot observation
— marked accordingly, with confidence lowered where only static reading was possible.

## Overall (≤120 words)

The scored-ink design system is *more* accessible than it looks: every act, spine mark, fold
seam, and row-overflow glyph is a hard-coded `min-h-11 min-w-11` (44×44) target with a visible
focus ring — a discipline that held everywhere I checked. The real gaps are elsewhere: the
`(document)` layout has no skip link, so a keyboard user tabs through the full spine before
reaching the paper on every load; the seven `g`-chords work but are announced nowhere on
screen; ⌘K never restores focus on close; and — the single highest-impact finding — the
terracotta/clay ink used for ~400 status, error, and label strings computes to roughly 2.2:1
against the paper background, well under AA's 4.5:1, everywhere it appears.

## Task table

Scored primarily against today's paper (flag off); the Worktable column notes where flag-on changes the reach answer. 1 = could not find/reach, 5 = obvious without thinking.

| # | What-to-do | How-to-get-there | Note |
|---|---|---|---|
| T1 | 4 | 4 | Desk header acts, folios, ⌘K all keyboard-reachable and 44px; the walkthrough re-triggers on a client nav in a way the auth fixture can't suppress (probe §2 aside) — a real user won't hit that, only test infra. |
| T2 | 2 | 1 | No phase-wide surface exists at any width; `g`-chords route to rooms/ledgers, none to a phase filter. Worktable: unchanged — tables are per-document, not cross-project. |
| T3 | 4 | 4 | One guide sentence, one act, spine-anchored; skip-link absence (U5-01) taxes every arrival by one extra Tab lap, not blocking. Worktable: table headline is louder but same reach path. |
| T4 | 3 | 3 | Room lens lift is keyboard-triggerable from the Rooms block row (44px target); once held, no visible release control if the block scrolls off (U5-11) — recoverable only by scrolling back or Esc/put-down. |
| T5 | 2 | 1 | ≥1440 only via the Mood boards shelf; <1440 only ⌘K-by-name or Desk's Recent boards strip (last-viewed only, not a directory) — no chord, no visible doorway (U5-10). Worktable speccing stage prints an in-paper strip (C9) which restores reach at every width *for that one stage only*. |
| T6 | 2 | 1 | Plan room / Spec book: ≥1440 shelf only; below that, ⌘K free-text recall is the *only* path — no chord, no menu row, no on-screen affordance (U5-09). This is the worst reach failure in the set: a whole item class drops to pure recall below 1440. Worktable: unchanged, same shelf gating. |
| T7 | 4 | 4 | Send-wall state line is one scored line at the top of the spread, keyboard-focusable, screen-reader-legible text (not color-only). |
| T8 | 4 | 4 | "Add a room" is an in-flow text link at the foot of the FF&E list, 44px target, no hover-gating (probe #1 confirms nothing on this page is hover-only). |
| T9 | 3 | 3 | Three doors to money (region act, ⌘K, drawer Accounts sheet) — all individually reachable and keyboard-operable; the *choice* is the friction (U2 territory), not the reach. |
| T10 | 3 | 3 | `Adjust dates` is a 44px act; the ripple result renders as text, not an icon-only diagram, so it is screen-reader legible — but I could not click through to confirm the ripple view itself is announced (static only). |
| T11 | 4 | 5 | Esc chain is keyboard-perfect: LIFO dialog→shelf→put-down, confirmed live (probe #2), no strand. `← Put down` / arrow-glyph-only at compact tier is still a 44px target (`doc-spine.tsx:48`). |
| T12 | 3 | 2 | The "Open the Drafting Room" branch is ⌘K-only from the Desk (no Desk doorway) — a keyboard user who doesn't know ⌘K exists has no route in at all. |
| T13 | 3 | 3 | Orders sheet reachable via `g o` chord and drawer disclosure; the chord works (probe #3) but is undiscoverable (U5-02), and the disclosure's own focus-restore silently fails on close (U5-04). |
| T14 | 3 | 3 | Same door as T13 (Receiving inside Orders); same chord-discoverability and focus-restore caveats apply. |
| T15 | 3 | 3 | Call sheet has three doors (letterhead instrument, shelf row, ⌘K) but zero Desk doors and no chord of its own — fine once inside a document, invisible from the Desk. |
| T16 | 4 | 4 | `g t` chord + drawer bell both work; bell is a 44px target with `aria-label="The Post, {n} unread"` — count is announced even though never shown as a visible badge (D8 honored non-visually too). |

## Findings

```
U5-01
lens: U5 | persona: null | task_ids: [T1,T3,T9,T11,T12,T13]
key: doc|all|both|no-skip-link
surface: /desk, /doc/[id] | width: all | flag: both
title: No bypass-blocks control anywhere in the layout
observation: The `(document)` route layout mounts DocumentRouteBoundary, DocumentTimeProvider,
  MobileShellProvider, HelpStateProvider, DeskWalkthroughProvider, then the route, then
  LogStrip, StudioDrawer, RegistryShortcuts, CommandBar, InterruptionSettings, AccountSheet,
  InvoiceOverlays, DraftProposalOverlay, MobileActionDock, MobileBar, MobileSheets,
  FeedbackLayer, DeskWalkthrough (`layout.tsx:49-103`). No "Skip to main content" or
  equivalent link exists anywhere in the tree — grep for "skip to"/"Skip to"/"SkipLink"
  across src/app/(document)/ and src/components/document/ returns zero hits.
why_it_blocks: obvious-how-to-get-there
evidence: { shots: [], refs: ["apps/designer-portal/src/app/(document)/layout.tsx:49-103"] }
severity: high | confidence: 0.6 (static-only; would settle with a live Tab trace from a
  fresh page load confirming the first focus stop on /doc/[id])
already_ruled: null
suggested_fix: One visually-hidden, focus-visible "Skip to the paper" link as the first
  focusable element in layout.tsx, targeting `[data-document-paper]`.
hesitation_seconds_estimate: 5 (per arrival, compounding across a keyboard-only day)

U5-02
lens: U5 | persona: null | task_ids: [T2,T6,T9,T12,T13,T15,T16]
key: doc|all|both|chords-never-shown
surface: /desk, /doc/[id] | width: all | flag: both
title: All 7 g-chords work but are announced nowhere on screen
observation: `g l/p/r/o/a/h/t` all correctly route or open sheets (probe #3, live-verified
  after correcting the probe's own focus-steal false negative). No chord hint text (`g l`,
  `g·l`, etc.) renders anywhere on `/desk` or `/doc/[id]` — a full-text regex sweep of both
  pages found none; the only place the seven chords are written down at all is the
  registry source (`10-code-anatomy.md §3.4`), not the UI. ⌘K's own badge is the sole
  visible keyboard hint in the product.
why_it_blocks: obvious-how-to-get-there
evidence: { shots: ["w1440-cmdk-open.png"], refs: ["apps/designer-portal/src/components/document/registry-shortcuts.tsx:85-221", "probe/01-interactive-probe.md#3"] }
severity: high | confidence: 0.9
already_ruled: null
suggested_fix: Surface the 7 chords as the `sub` text on their ⌘K rows (already have a
  `sub` slot per §6.6) and/or a one-time "keyboard shortcuts" ⌘K entry.
hesitation_seconds_estimate: 30

U5-03
lens: U5 | persona: null | task_ids: [T1,T5,T6,T9,T12]
key: doc|all|both|cmdk-no-focus-restore
surface: /desk, /doc/[id] | width: all | flag: both
title: Command Bar never restores focus after Escape
observation: `command-bar.tsx` has exactly one focus line — focusing the input on open — and
  no capture of `document.activeElement` pre-open, no restore on close. Live-verified: focus
  the "Plan room" shelf button, press Meta+K, press Escape — `document.activeElement` lands
  on `<body>`, not the button. Every other overlay in the reachability inventory (shelf leaf,
  margin panel sheet-mode, ledger sheets) implements this correctly; Command Bar is the one
  exception.
why_it_blocks: obvious-how-to-get-there
evidence: { shots: [], refs: ["apps/designer-portal/src/components/document/command-bar.tsx", "probe/01-interactive-probe.md#6"] }
severity: medium | confidence: 0.95
already_ruled: null
suggested_fix: Capture `document.activeElement` on open, restore via `requestAnimationFrame`
  on close — same pattern already used in `margin-rail.tsx:140,197` and `overlays/doc-sheet.tsx:228-262`.
hesitation_seconds_estimate: 8

U5-04
lens: U5 | persona: null | task_ids: [T9,T13,T14]
key: doc|all|both|ledger-sheet-focus-restore-noop
surface: /doc/[id] | width: all | flag: both
title: Ledger sheet focus-restore silently no-ops from the Studio books menu
observation: Opening Orders (or Accounts/Hours) from inside the "Studio books" disclosure
  both opens the `DocSheet` and unmounts the disclosure the trigger button lived in.
  `DocSheet`'s restore code has a guard, `if (!focusTarget?.isConnected) return;`
  (`overlays/doc-sheet.tsx:259`) — once the Orders button detaches, restore does nothing
  rather than falling back to the still-mounted "Studio books" toggle. Live-verified:
  Escape after opening this way leaves focus on `<body>`.
why_it_blocks: obvious-how-to-get-there
evidence: { shots: [], refs: ["apps/designer-portal/src/components/document/overlays/doc-sheet.tsx:259", "apps/designer-portal/src/components/document/studio-drawer.tsx:343-372", "probe/01-interactive-probe.md#6"] }
severity: medium | confidence: 0.95
already_ruled: null
suggested_fix: Fall back to the "Studio books" toggle (or the drawer nav landmark) when the
  original trigger is no longer connected, instead of a silent no-op.
hesitation_seconds_estimate: 8

U5-05
lens: U5 | persona: null | task_ids: [T3,T4,T7,T9,T10,T13,T14,T15]
key: doc|all|both|terracotta-clay-contrast
surface: /desk, /doc/[id] | width: all | flag: both
title: Terracotta and clay ink fail 1.4.3 contrast everywhere they appear
observation: `--color-terracotta: #D4A090` and `--color-clay: #C4A57B` are used as
  `text-[var(--color-terracotta)]` / `text-[var(--color-clay)]` in 394 places across
  `components/document/*` (grep count), against `--doc-paper: #FCFAF6` or
  `--bg-surface: #FFFFFF`. Computed contrast: terracotta-on-paper ≈ 2.18:1,
  terracotta-on-white ≈ 2.27:1, clay-on-paper ≈ 2.24:1 — all well under AA's 4.5:1 (and
  under 3:1 even as large/UI text). This is the ink used for: "NEEDS ATTENTION · IN ONE
  PLACE" (`red-letter-zone.tsx:29,33`), every `role="alert"` inline failure band ("Could not
  save just now." `letterhead-vitals.tsx:79,354`; FF&E release errors `ffe-section.tsx:1138,
  1207`; schedule/margin/PO errors), the "OVERDUE" urgency register, and pervasive DM-Mono
  eyebrow labels ("NEEDS YOUR HAND", section names, stage words) throughout the spine and
  paper.
why_it_blocks: obvious-what-to-do
evidence: { shots: ["w1440-red-letter-zone.png", "w1440-desk.png"], refs: ["apps/designer-portal/src/app/globals.css:12,23,28,40", "apps/designer-portal/src/components/document/red-letter-zone.tsx:29,33", "apps/designer-portal/src/components/document/letterhead-vitals.tsx:79,354"] }
severity: high | confidence: 0.9 (contrast computed directly from the shipped hex values, not estimated)
already_ruled: null
suggested_fix: Darken both tokens for text use (a separate `--color-terracotta-ink` /
  `--color-clay-ink` pass ~4.5:1 against paper/white) while keeping the lighter values for
  fills/borders where contrast rules don't apply.
hesitation_seconds_estimate: 15

U5-06
lens: U5 | persona: null | task_ids: [T6]
key: doc|1280,390|off|plan-room-recall-only-below-1440
surface: /doc/[id] | width: 1280,390 | flag: off
title: Plan room and Spec book have zero on-screen doorway below 1440
observation: The Plan room and Spec book shelf rows exist only inside `DocSpineShelvesBlock`,
  mounted `≥1440` (C8; `doc-spine.tsx:135`). Below that, per the anatomy's own reachability
  inventory, the *only* path to either is typing into ⌘K ("The plan room" is explicitly
  flagged **⌘K-only** even from an open document, `command-bar.tsx:562-572`) — no `g`-chord,
  no letterhead instrument, no drawer row names either surface. A keyboard user who does not
  already know these names exist has no way to discover them below 1440 except stumbling on
  ⌘K's unfiltered "Rooms & ledgers" group.
why_it_blocks: obvious-how-to-get-there
evidence: { shots: ["w1280-spine-detail.png", "m390-doc-project-rich.png"], refs: ["apps/designer-portal/src/components/document/doc-spine.tsx:135", "10-code-anatomy.md §7 (\"Surfaces reachable only from an open document\")"] }
severity: blocker | confidence: 0.9
already_ruled: C8 (I136 — shelved spine ≥1440 only)
suggested_fix: A compact-tier equivalent doorway (even a single "Shelves" row in the icon
  rail or the letterhead instrument row) — Lane A composition-only, no width-regime amendment
  needed if it reuses the existing shelf-open mechanism.
hesitation_seconds_estimate: 60

U5-07
lens: U5 | persona: null | task_ids: [T5]
key: doc|1280,390|off|mood-boards-recall-only-below-1440
surface: /doc/[id] | width: 1280,390 | flag: off
title: Mood boards has no doorway below 1440 outside the speccing strip
observation: Same mechanism as U5-06 — the Mood boards shelf row is inside the ≥1440-only
  shelved block. Below 1440 the only paths are the Desk's "Recent boards" strip (limited to
  recently-viewed boards, not a directory of all of them, and only present on `/desk`, not
  inside the document itself) or ⌘K by name.
why_it_blocks: obvious-how-to-get-there
evidence: { shots: ["w1280-spine-detail.png"], refs: ["apps/designer-portal/src/components/document/spine-shelves-block.tsx", "recent-boards-strip.tsx"] }
severity: high | confidence: 0.85
already_ruled: C8, C9 (I136 shelved boards + I139/Q1 speccing-stage-only reversal)
suggested_fix: Same as U5-06 — the speccing-stage strip (C9) already proves boards can live
  in the paper below 1440 for one stage; consider whether the same in-paper pattern should
  extend as a doorway (not full content) at other stages.
hesitation_seconds_estimate: 45

U5-08
lens: U5 | persona: null | task_ids: [T4]
key: doc|1440|both|room-lens-no-release-control
surface: /doc/[id] | width: 1440 | flag: both
title: A held room has no visible release control once scrolled away
observation: The only way to release a held room while staying ≥1440px is clicking the same
  Rooms-block row again (`toggleRoom` back to the same id → null). The letterhead's
  "In hand · {Room}" line (`doc-letterhead.tsx:63-68`) is plain text, no close/× control.
  If a designer scrolls the spine's Rooms block out of view (it is a normal-scrolling block
  inside the spine, not sticky-pinned separately from the rest), there is no other affordance
  anywhere on the page to release the hold — confirmed by static source read; the probe could
  not dynamically verify this because the local seed has no project with both rooms *and*
  `active_section === 'project'` simultaneously (probe #7).
why_it_blocks: obvious-how-to-get-there
evidence: { shots: ["07-room-lens-no-rooms.png"], refs: ["apps/designer-portal/src/components/document/room-lens-context.tsx", "apps/designer-portal/src/components/document/doc-letterhead.tsx:63-68", "probe/01-interactive-probe.md#7"] }
severity: medium | confidence: 0.5 (static source only — what would settle this: seed a
  `project_rooms` row on an `active_section='project'` document and dynamically test
  hold→scroll→attempt-release)
already_ruled: null
suggested_fix: Add a small × / "put down {room}" affordance to the letterhead's "In hand"
  line itself, so release doesn't require finding the Rooms block again.
hesitation_seconds_estimate: 20

U5-09
lens: U5 | persona: null | task_ids: [T12]
key: desk|all|off|drafting-room-cmdk-only
surface: /desk | width: all | flag: off
title: The Drafting Room's only Desk doorway is ⌘K
observation: "the Drafting Room" branch of T12 has **no Desk doorway at all** — it is
  explicitly excluded from Desk Contents' Begin list (`desk-contents.tsx:137-139` per the
  anatomy) and reachable only via ⌘K → "Open the Drafting Room". A keyboard user unaware of
  ⌘K has zero path in from the Desk.
why_it_blocks: obvious-how-to-get-there
evidence: { shots: ["w1440-desk.png", "w1440-cmdk-open.png"], refs: ["apps/designer-portal/src/components/document/desk-contents.tsx:137-139", "10-code-anatomy.md §7"] }
severity: high | confidence: 0.85
already_ruled: null
suggested_fix: Either add the row to Desk Contents' Begin list, or make the distinction
  between "Capture a lead" and the Drafting Room's entry point explicit in the header acts.
hesitation_seconds_estimate: 30

U5-10
lens: U5 | persona: null | task_ids: [T3,T11]
key: doc|1280|off|unlabeled-icon-rail
surface: /doc/[id] | width: 1280 | flag: off
title: Compact-tier spine marks carry no visible text, only color/position
observation: At 1180-1439, the spine's 7 phase marks render as thin horizontal bars with no
  visible label text — `w1280-spine-detail.png` shows seven stacked colored lines with zero
  printed phase names; only the *currently active* phase's name+sub prints once, below the
  rail (`doc-spine.tsx:122-130`). Each mark does carry an accessible name for assistive tech
  (`Inert-mark aria "{Label}: {sub}"`, `doc-spine.tsx:98`) and a full 44×44 target
  (`doc-spine.tsx:99`), so this is a *sighted, non-screen-reader* recognition gap, not a
  target-size or AT gap — a low-vision or cognitively-loaded designer using a mouse/keyboard
  at 1280 cannot tell what any inactive mark means without hovering or clicking it.
why_it_blocks: obvious-how-to-get-there
evidence: { shots: ["w1280-spine-detail.png"], refs: ["apps/designer-portal/src/components/document/doc-spine.tsx:98-99,122-130"] }
severity: low | confidence: 0.75
already_ruled: C8 (compact tier is an icon rail by width-regime design)
suggested_fix: A `title` tooltip or press-and-hold label reveal, or accept as the declared
  cost of the compact tier per C8 and only fix the ≥1440 case.
hesitation_seconds_estimate: 5

U5-11
lens: U5 | persona: null | task_ids: [T9]
key: doc|1440|both|money-doors-not-unified
surface: /doc/[id] | width: 1440 | flag: both
title: Three money doors are each individually reachable but never cross-referenced
observation: `Draw an invoice` (money region), `⌘K → Draw an invoice for {Project}`, and the
  Accounts ledger sheet (`g a` / drawer) are three separate, all keyboard-operable doors to
  the same act. Each is reachable in 1-2 acts on its own, so no single door fails a WCAG
  criterion — but nothing on screen tells a keyboard user which of the three is "the" door,
  so orientation cost is paid on every visit (ties to U2's finding on the same collision;
  recorded here because it is a *reach*, not a *hierarchy*, symptom — three fully-functional
  doors, zero signposting between them).
why_it_blocks: obvious-what-to-do
evidence: { shots: ["w1440-money-region.png", "w1440-cmdk-typed.png"], refs: ["apps/designer-portal/src/components/document/commercial/money-region.tsx:249-253", "apps/designer-portal/src/components/document/command-bar.tsx:526-527"] }
severity: low | confidence: 0.6
already_ruled: null
suggested_fix: none from U5 alone — cross-reference with U2's money-doors finding before
  proposing a fix; a reach-only fix (e.g. consistent chord) risks masking the real hierarchy
  question.
hesitation_seconds_estimate: 10

U5-12
lens: U5 | persona: null | task_ids: [T15]
key: doc|1440|on|call-sheet-flag-absence-indistinguishable
surface: /doc/[id] | width: 1440 | flag: both
title: Flag-off Call sheet absence reads identically to "no one is on this job"
observation: When `call-sheet` is off, the shelf row, the letterhead `Call sheet · n`
  instrument, the Kickoff band, and the ⌘K "Open the call sheet" row all simply don't render
  (`8. Flags` table). Nothing distinguishes "the feature is off" from "this project has no
  crew" — both present as a blank space where a roster doorway would be. A keyboard/AT user
  gets no signal at all (no aria-disabled row, no hidden-but-announced state) that a roster
  surface exists elsewhere in the product.
why_it_blocks: obvious-what-to-do
evidence: { shots: [], refs: ["apps/designer-portal/src/lib/document/registry.tsx:236", "10-code-anatomy.md §8 (call-sheet flag)"] }
severity: medium | confidence: 0.7
already_ruled: null
suggested_fix: Out of scope for a reach fix alone — this is the flag itself needing a
  decision (ship it, or don't render partial doorways) rather than an accessibility patch.
hesitation_seconds_estimate: 15
```

## Answers to the U5 brief questions

1. **Landmark map — can a screen-reader user reach the margin without traversing the paper?**
   Yes, via landmark navigation: `<aside aria-label="Document spine">` (`doc-spine.tsx:37`),
   `<main data-document-paper>` (unlabeled but the sole `<main>`), and `<aside>` for the
   margin rail at ≥1440 (`margin-rail.tsx:246`, aria-label "Margin",
   `margin-rail.tsx:252`) are all distinct landmarks a screen reader can jump between
   directly (NVDA/JAWS/VoiceOver "next landmark"). A **sequential Tab-only** user cannot
   skip ahead the same way — no skip link exists (U5-01), so reaching the margin by Tab
   alone means tabbing through the entire spine and paper first, every single load.

2. **Are `g` chords announced anywhere visible?** No. All seven work (probe #3, live-verified)
   but none is printed on `/desk` or `/doc/[id]` — the only keyboard hint shown anywhere is
   ⌘K's own badge (U5-02).

3. **Esc stack — announced, predictable?** Predictable: yes, confirmed live as strict LIFO
   (dialog → shelf → put-down, probe #2), matching the code's stated contract exactly, no
   strand. Announced: not directly — no `aria-live` fires on an Esc transition itself, but
   each surface it closes is a real dialog/region whose disappearance a screen reader
   perceives via normal DOM-removal semantics (no explicit courtesy announcement, but no
   silent trap either).

4. **Drawer strip target sizes, focus order, contrast at flat edges.** Every drawer link is
   `min-h-11` (44px) with a visible `focus-visible:outline` ring
   (`studio-drawer.tsx:283,320,350,407,431,454,489`) — this holds even for the compact-tier
   glyph-only rows. Focus order in the strip follows visual left→right
   (`Patina` → room doors → `Studio books` → `In hand`/`Hands free` → `The Post` → nameplate,
   `studio-drawer.tsx:271-511`), matching the DOM. Contrast at "flat edges" (C2 — no shadows,
   value-contrast-only depth): the strip's own border-top plus `--bg-surface` fill reads
   cleanly in the 1440 screenshot; I could not verify the border token's contrast ratio
   directly (low priority — it's a structural divider, not text).

5. **No toast layer (R83) — are inline bands announced?** Yes, broadly: `role="alert"` /
   `role="status"` with `aria-live="polite"` appears consistently across the failure-band
   components I checked (`letterhead-vitals.tsx:90-91,354`; `ffe-section.tsx:1138,1207`;
   `document-guide.tsx:123` sr-only `aria-live="polite"` "Next up: …"; `studio-pulse.tsx:114-115`;
   `care-band.tsx:324,452`; `red-letter-zone.tsx` explicitly avoids `role="alert"` mid-sentence
   per its own comment at `:9` while still rendering as a labeled region). This is a genuine
   strength — see "What stays true."

6. **At 390, which of T1-T16 are reachable; which controls <44×44?** Reachable at 390:
   T1, T3 (guide + red-letter render on the paper, which is always mounted), T7, T8, T9
   (via the mobile-dock primary action or "More" menu), T11, T13/T14 (via mobile-bar "More" →
   Studio books, same chord-discoverability gap as desktop), T16. **Not reachable at 390**:
   T2 (no phase-wide view at any width), T5 (no board doorway below 1440 outside the desk
   strip — U5-07), T6 (no plan/spec-book doorway below 1440 — U5-06, the worst offender),
   T12 (Drafting Room is ⌘K-only at every width — U5-09), T15 (no call-sheet doorway from
   the Desk at any width, though reachable once inside a document). No control I measured by
   source (`min-h-11 min-w-11` pattern) came in under 44×44 — the mobile bar's own buttons
   are `min-h-11` (`mobile-bar.tsx:161`) and `min-h-[64px]` for the whole strip
   (`mobile-bar.tsx:156`).

7. **Room lens lift — perceivable non-visually and at 4.5:1?** Non-visually: the "In hand"
   state is a text prefix in the row label (`spine-rooms-block.tsx:69-72`, "In hand · " —
   confirmed as real text, not an icon or color swatch alone), so it reads correctly to a
   screen reader. At 4.5:1: the lift itself uses the same body/charcoal ink for the room name
   (fine contrast); the "In hand" prefix specifically was not isolated for a token check, but
   if it shares the clay/terracotta family (common pattern in this codebase per U5-05) it
   likely also fails — flagged as a probable but unverified extension of U5-05.

8. **Any hover-only affordance anywhere?** No — doctrine holds. Live-probed across region-fold
   buttons, colophon actions, spine marks, and row-overflow glyphs: every one had identical
   `opacity`/visibility before and after `page.hover()` (probe #1). The one apparent
   "0 found" case (row-overflow `···` on Chen Residence) was traced to the doc's schedule
   phases legitimately having no `headingActions` to render, not a hidden trigger.

## What stays true (must not be broken)

- **44×44 minimum targets are a hard-coded system default**, not a per-component
  afterthought: `document-action.tsx:53` (`min-h-[44px] min-w-[44px]`), and the same
  `min-h-11`/`min-w-11` pattern recurs verbatim in `doc-spine.tsx`, `region/fold-seam.tsx`,
  `region/row-overflow.tsx`, `shelves/shelf-panel.tsx`, `margin-rail.tsx`, and
  `studio-drawer.tsx`. Any redesign that swaps this token or ad-hoc-sizes a new act risks
  losing a discipline that is currently applied with no visible exceptions.
- **`focus-visible:outline` rings are present on every interactive element checked** — the
  same components above all carry `focus-visible:outline-2 outline-offset-2` in the studio's
  clay color. Keyboard focus is never invisible anywhere in this review.
- **The Esc stack is a correct, live-verified LIFO with no strand** (probe #2) — dialog closes
  before shelf, shelf before put-down, exactly matching the documented contract.
- **Nothing in the reviewed surface is hover-gated** (probe #1, live-verified) — every
  affordance present is visible and operable without a pointer.
- **Inline failure/status text is broadly wired to `role="alert"`/`role="status"` +
  `aria-live`** — a real accessibility investment already in place; only the *color* of that
  text (U5-05), not its announcement, is the defect.
- **Fold state persists correctly per-document, per-region via localStorage**
  (`patina:doc-fold:<docId>:<region>`, probe #5) and the running-index row for a *folded*
  region both scrolls to and unfolds it in one click (probe #5b) — a keyboard/AT user who
  folds a region doesn't lose it on reload, and doesn't need a second click to get back in.
