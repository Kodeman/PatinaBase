# Schedule Spine — Slice 01 screenshot drop (first review milestone)

This drop is the Slice 01 Read of the Schedule Spine (`<ScheduleSpine/>`), the
replacement for the Designer Portal's `CoordinationBand` on the project
document page. It ships behind the PostHog flag `schedule-spine` —
**fail-closed / OFF in production** — so nothing here is live for real
designers yet. It's the acceptance walk + evidence for the first design
review gate: does the dissolve get blessed for pilots?

**Fix round (this drop):** three visual defects found in the first pass were
fixed and all five screenshots retaken — (1) mobile overflow clipped the
blocking item's ball-chip/due-date and the milestone stamp off the right edge
of a 390px viewport; (2) the meta line read "1 ITEMS" instead of "1 ITEM";
(3) the legacy `PhaseTimeline` ribbon rendered raw seed enum values
("SCHEMATIC_DESIGN") instead of human labels for phases whose `phase_key`
didn't match a canonical `PhaseSlug`. Details below.

## How to drive it locally

1. Local stack up (`pnpm supabase:start`, then `pnpm supabase:reset` for a
   fresh Aspen Loft specimen).
2. `apps/designer-portal/.env.local` (gitignored, not in this drop):
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `npx supabase status`>
   NEXT_PUBLIC_FLAG_OVERRIDES=schedule-spine:true,the-document-pilot:true
   ```
   (`the-document-pilot` also needs the override locally — PostHog flags
   fail closed with no key configured, and the whole `(document)` route
   group gates on it, independent of `schedule-spine`.)
3. `pnpm --filter @patina/designer-portal dev`, then sign in at
   `http://localhost:3000` as `designer@patina.dev` / `password123`.
4. Open `http://localhost:3000/doc/b0000000-0000-0000-0000-0000000000d1`
   (project **Aspen Loft Refresh**).

## What each screenshot shows

- **`spine-desktop.png`** — 1440×900, full document page: the Spine replacing
  Coordination — Schematic Design closed, Design Development active with the
  overdue blocking sign-off first (⊘, terracotta ball-in-court chip),
  Procurement & Orders as the running thread-stitch (not a phase row),
  Installation & Styling future/anchored, Completion future/muted, the
  today-rule crossing between Design Development and Installation.
- **`spine-mobile.png`** — 390×844 viewport (not full-page), same page
  scrolled to the Spine — the blocking sign-off row now wraps its ball-in-court
  chip, due date, and chevron onto a second line under the title instead of
  being clipped off-screen; `document.scrollWidth` measures exactly 390px
  (zero horizontal overflow). See "Fixed this round" below.
- **`spine-closed-unfolded.png`** — desktop, after clicking Schematic Design's
  heading: `aria-expanded` flips and the mono mark reads "Fold".
- **`spine-item-sheet.png`** — desktop, the blocking sign-off's
  `OpenItemSheet` open as a dimmed overlay over the still-visible document
  (Esc closes the sheet only, confirmed in the walk).
- **`gate-off.png`** — desktop, `schedule-spine:false` — the old
  `CoordinationBand` (ball-in-court bar, Client User court group, + New Open
  Item) renders exactly as before; the `PhaseTimeline` ribbon ("THE
  SCHEDULE") is present in both states, untouched (Slice 02 territory).

## Escalations for the ruling

(1) unfold/fold is a persistent quiet mono mark, not the prototype's
hover-reveal (hover banned in a read slice; touch has no hover); (2) thread
stitch omits the FF&E "N of M lines ordered" meta; (3) O9 — where do The
Work's task rows live in the spine grammar (currently mounted verbatim
beneath the phase list); (4) items assigned to thread-lane phases render no
main-phase row (the thread is the stitch — their room is the Loom); confirm
this reading.

Ruling requested: does the dissolve get blessed (flip gate on for pilots),
and the four calls above.

## Fixed this round

- **Mobile horizontal overflow (RESOLVED)**: `PhaseSection` and `TodayRule`'s
  entry grid was `grid-cols-[30px_1fr]` — a bare `1fr` track has an implicit
  min-content floor, so a long unbreakable row pushed the whole page wider
  than the viewport instead of shrinking. Changed both to
  `grid-cols-[30px_minmax(0,1fr)]`. That alone left the open-item row's title
  squeezed to near-zero width (content technically on-screen but unreadable)
  to make room for the ball-in-court chip + due date, so `OpenItemRow`
  (`coordination/open-item-row.tsx`) was restructured into two flex groups
  (type-chip+title vs. ball-chip+due+chevron) with `flex-wrap` on the row —
  the trailing meta now wraps to a second line under the title at narrow
  widths instead of either clipping or disappearing. `document.scrollWidth`
  now measures exactly 390px at the 390px viewport. This also touches
  `CoordinationBand`'s item rows (shared component) — verified no visible
  change at desktop widths (`gate-off.png`), since wrapping only engages when
  content doesn't fit on one line.
- **"1 ITEMS" → "1 ITEM" (RESOLVED)**: `phaseMeta` in
  `schedule-spine-derivation.ts` now singularizes the item- and
  milestone-count nouns (`${n} item${n === 1 ? '' : 's'}`, same for
  milestones); "N open" / "N blocking" were left untouched (no noun to
  singularize).
- **Legacy bar raw enum labels (RESOLVED)**: the old `PhaseTimeline`'s
  `getPhaseLabel(phase_key, 'designer')` does a direct dictionary lookup
  against `PHASE_DISPLAY_CONFIG` (no alias normalization), so seed
  `phase_key` values like `'schematic_design'` / `'design_development'` /
  `'completion'` fell through to the raw slug, which the ribbon's
  `uppercase` styling then rendered as "SCHEMATIC_DESIGN". Set those three
  phases' `phase_key` to `NULL` in `supabase/seed/schedule.sql` so
  `phaseLabel()` falls back to `phase.name` (already human: "Schematic
  Design", "Design Development", "Completion"). `procurement` and
  `installation` were already canonical `PhaseSlug` values and needed no
  change. Out of scope: `getPhaseLabel` itself not alias-normalizing is a
  latent gap that would bite any other non-canonical `phase_key` in
  production — flagged here for whoever owns `@patina/types/phase-config.ts`,
  not fixed (this round only touched the seed, per scope).

## Also flagged during the walk (not design-ruling items, implementation concerns)

- **Local-only data landmine, not a spine regression**: `designer_clients`
  for this seeded client (`a0000000-…-005`) currently carries rows for 4
  different designers, so `useDesignerClientForClientUser`'s `.maybeSingle()`
  throws ("JSON object requested, multiple (or no) rows returned"), which
  silently hides `+ New open item` and raises a global red error toast on
  page load. Confirmed this is **not** a Slice 01 regression — `CoordinationBand`
  calls the exact same hook the exact same way and would hit it identically.
  Worked around locally (reversible — a `pnpm supabase:reset` undoes it) to
  get clean screenshots and to exercise the composer's create flow; full
  details and the SQL are in the task report.
