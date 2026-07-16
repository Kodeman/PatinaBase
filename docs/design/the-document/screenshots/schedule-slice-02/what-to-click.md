# Schedule Rule — Slice 02 screenshot drop (second review milestone)

This drop is the Slice 02 Glance: `<ScheduleRule/>` — the Spine folded into a
horizontal instrument — replacing the old `PhaseTimeline` ribbon at the top of
the project document, behind the PostHog flag `schedule-spine` —
**fail-closed / OFF in production** — nothing here is live for real designers
yet. It is the acceptance walk + evidence for the second design review gate.
The Rule is read-only (time-surface drag is Slice 04); every label and
milestone diamond is a minimap control that reveals its phase in the Spine.

**Fix round (this drop):** the first live walk found four defects, fixed in
`9a7670c4` and re-walked before these captures — (1) the pin fold never
engaged on a cold page load (the sentinel observer attached in a mount-time
effect that ran during the loading `return null` render; it now attaches via
a state-held callback ref); (2) phase labels were unclickable by mouse (the
track overlay swallowed every click; all decorative layers are now
`pointer-events-none` with the buttons above them); (3) the today date-label
overprinted a row-2 phase label (it now rides below the line at the canvas's
one deterministically clear band); (4) two thread hairline labels overprinted
each other (each thread now gets its own lane, +20px per lane, and the canvas
grows by the same pitch).

## How to drive it locally

1. Local stack up (`pnpm supabase:start`, then `pnpm supabase:reset` for
   fresh specimens).
2. `apps/designer-portal/.env.local` (gitignored, not in this drop):
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `npx supabase status`>
   NEXT_PUBLIC_FLAG_OVERRIDES=schedule-spine:true,the-document-pilot:true
   ```
   (`the-document-pilot` also needs the override locally — PostHog flags fail
   closed with no key configured, and the whole `(document)` route group
   gates on it, independent of `schedule-spine`.)
3. `pnpm --filter @patina/designer-portal dev`, then sign in at
   `http://localhost:3000` as `designer@patina.dev` / `password123`.
4. The three specimens:
   - `http://localhost:3000/doc/b0000000-0000-0000-0000-0000000000d1`
     (**Aspen Loft Refresh** — 5 phases, procurement thread, anchored
     install, 3 milestones)
   - `…/doc/b0000000-0000-0000-0000-0000000000d3` (**Birch Hollow** — 3
     long-named phases, 1 thread)
   - `…/doc/b0000000-0000-0000-0000-0000000000d4` (**Marrow & Vale
     Residence** — 7 long-named phases, 2 threads, anchored install,
     milestones in all four statuses)

## What each screenshot shows

- **`rule-aspen-desktop.png`** — 1440×900, the Rule at rest above the top of
  the Spine: staggered natural-width labels (light closed / bold active /
  muted ahead), the procurement thread hairline spanning its true dates
  beneath the line, the charcoal today rule with its DM-Mono date below the
  line, milestone diamonds in stamp colors (golden due with terracotta ring,
  hollow upcoming), and the anchor treatment on Installation & Styling
  ("Anchored · Aug 24").
- **`rule-3phase-desktop.png`** — Birch Hollow: all three long names fully
  visible with zero truncation — two main-lane labels (one staggered to row
  2) plus the thread's own hairline label; `document.scrollWidth` = 1440 at
  a 1440 viewport, no ellipsis anywhere.
- **`rule-7phase-desktop.png`** — Marrow & Vale, the torture render: five
  main-lane labels staggered across two rows + two separated thread lanes
  (y112/y132; the canvas grows 132→152px), diamonds in all four statuses
  including slipped terracotta — zero truncation.
- **`rule-pinned-mid.png` / `rule-pinned-bottom.png`** — the ~22px fold
  pinned at viewport top at two scroll depths (mid-document and the very
  bottom): project title inline, line + small diamonds + today cut only, no
  labels/thread/date; the spine's document offset measured identical before
  vs after the pin threshold (zero downstream layout shift — the sticky
  wrapper keeps its full resting height). Same verified on the 7-phase page's
  taller canvas.
- **`rule-minimap-jump.png`** — after mouse-clicking the folded Schematic
  Design label on the rule (page scrolls to the spine, phase unfolds) and
  then the Design Development sign-off diamond on the pinned strip: the
  milestone's row carries the ~1.6s transient highlight (tinted band +
  underlined title). `rule_minimap_jump` fires beside each reveal (not
  observable in this walk — no local PostHog key, `track()` no-ops by
  design; the handler path is code-verified).
- **`rule-mobile.png`** — 390×844: the rule folds to line + diamonds + today
  (no labels, no thread hairlines); nothing clipped, `scrollWidth` exactly
  390.
- **`gate-off.png`** — `schedule-spine:false`: the old `PhaseTimeline`
  ribbon ("THE SCHEDULE") renders at the top exactly as before, and the
  spine section shows the old `CoordinationBand` (ball-in-court bar, court
  group, + New Open Item). Byte-for-byte the pre-Rule document.

## Escalations for the ruling

Escalations for the Slice 02 review (designer-visible): pin-strip height
and the inline project title; the stagger's N-row growth when two rows
can't fit (design says two; we never truncate); the `Unplaced · N`
treatment for undated phases and the render-nothing empty state; the
full mobile rule treatment (this slice ships the minimal fold); minimap
clicks when the spine section isn't mounted (silent no-op today —
should it switch sections?); the active phase's segment ink (per-phase
status weight per R99's words vs the prototype's past/future ink split
— both readings are defensible, the authority should pick); and
`delayed` phases reading as `ahead` weight on the rule.

One addition from the fix round: thread lanes now stack — each extra thread
adds a 20px lane and the rule canvas grows by the same pitch (Marrow & Vale's
two threads read at 152px instead of 132px). The designer should confirm the
lane pitch and the canvas growth read as intended.

Ruling requested: Slice 02 accepted? The calls above. Slice 03 (Compose)
gates on this.

## Also flagged during the walk (implementation notes, not ruling items)

- The today vertical hairline can still cross a label's mono subline text
  when today's x falls inside a row-2 label's span (line-through-text, both
  legible — the text-on-text overprint is what the fix round removed).
- The pinned strip measures ~36px total (the 22px rule band + the inline
  title's line-height + padding) — folded into the existing "pin-strip
  height and the inline project title" escalation above.
- Local-only data landmine, unchanged from the Slice 01 walk: the seeded
  client carries `designer_clients` rows for 4 designers, which breaks
  `useDesignerClientForClientUser`'s `.maybeSingle()` and raises a red error
  toast on load. Worked around locally (reversible; `pnpm supabase:reset`
  undoes it) for clean captures — not a Rule regression, details in the task
  report.
