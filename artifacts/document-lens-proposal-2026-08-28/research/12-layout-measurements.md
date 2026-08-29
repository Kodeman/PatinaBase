# 12 — Layout measurements (M1)

Program: The Smart Lens proposal (`artifacts/document-lens-proposal-2026-08-28/`).
Produced by `research/measure-layout.mjs`, run from `apps/designer-portal` against the
already-running dev server at `http://localhost:3000`. Docs: **rich** = Chen Residence
project spread (`de922823-d1b9-491a-8ad5-99e8e4f013c5`), **prework** = the Aspen Loft
Living Room Refresh proposal (`b0000000-0000-0000-0000-000000000002`). Full numeric data:
`research/12-layout-measurements.json`.

## Headline numbers

- **Rich, 1440px, s0 (page load, no scroll): the header stack is 111.7% of one viewport
  tall.** The first `[data-region-head]` (`schedule`, deep inside the active section) sits
  at y=1005px against a 900px-tall viewport — the reader cannot see any working region
  without scrolling past a full screen of letterhead, ticket, needs-attention, instruments,
  approvals, and the schedule rule.
- **Spine ink utilisation at s0**: rich/1440 = **54.9%** of the 900px rail is "ink" (text,
  background, or border); rich/1280 = **24.0%**; prework/1440 = **13.9%**; prework/1280 =
  **20.7%**. The rich spine's single longest empty run at 1440 is 270px (y 630→900); at
  1280 it's 296px. The prework spine's longest empty run is far larger — 657px at 1440,
  340px at 1280 — because the marker row is the only ink on it (an empty margin, an empty
  ticket, no schedule/approvals regions to shelve).
- **Distinct inter-region gap values (rich doc, every width/state): {6, 29, 56} px.** Three
  different button-to-button spacings for what reads as one visually uniform list of
  region seams (header-stack-end→`schedule` = 56px, `schedule`→`ffe` = 29px [rounds from
  28.5], `ffe`→`money-head` = 6px). These are scroll-invariant (gaps don't change as the
  page scrolls, as expected) and width-invariant (1440 and 1280 give the same three
  values). The prework doc has **no** `[data-region-head]` elements at all — see Caveats.
- **Rich, 1440px, s1 (letterhead just scrolled off) frame budget**: rail 13.9% of viewport
  width · chrome (studio drawer bar) 6.7% of viewport height · header/summary content
  (unfolded ticket + needs-attention + instruments, now mid-viewport) 60.7% · active
  region 10.4% · unclaimed "other" 22.2%. Even one entire letterhead-scroll after landing,
  the majority of the screen (60.7%) is still non-working chrome/summary, not the active
  region.

## Method notes

- Scroll states: **s0** = top of page. **s1** = `scrollTo(0, rect(#document-project-status).bottom + scrollY + 1)`
  — the letterhead just fully scrolled past (asserted `bottom < 0` after the scroll; see
  Caveats for the one width where the assertion print was skipped safely). **s2** =
  `[data-region-head="ffe"]` scrolled to the viewport top, then `scrollBy(0, -seam)` where
  `seam` is the live `--doc-seam-height` custom property (read on `[data-document-shell]`,
  which inherits it from `:root` — `job-ticket.tsx` is what publishes it while the ticket
  is pinned-and-collapsed). **s3** = foot (`scrollTo(0, document.documentElement.scrollHeight)`).
- Frame budget is a 1-pixel-row partition of the viewport's vertical extent (0..viewportHeight),
  each row assigned to the first bucket that claims it in priority order: **chrome**
  (`[aria-label="Studio drawer"]` at ≥1180px / `[aria-label="Document bar"]` at 390px, plus
  the job ticket's own rect while `data-pinned="true"` **and** `data-unfolded` is absent —
  i.e. only while it is the collapsed sticky seam) → **header/summary** (letterhead,
  needs-attention/guide, letterhead instruments, and the ticket whenever it is *not* the
  collapsed seam) → **active region** (`[data-active-section]`'s on-screen portion) →
  **other** (everything left over — margin rail content, uncovered whitespace, region
  heads/bodies not yet "active"). Rail width is reported separately as a horizontal-band
  percentage of viewport *width*, not folded into the vertical row accounting.
- `--doc-seam-height` is 0px whenever the ticket is unfolded (s0/s1 at 1440/1280, and s0/s1
  at 390 too, oddly — see the ticket-height caveat below) and 64px whenever it is pinned
  and collapsed (s2/s3, and s0/s1 *are* already collapsed at 390 pre-scroll — the value
  reads 0px there because collapse happens at rest below 1180px, not via the pin, and the
  pin-driven `--doc-seam-height` write only fires once the sentinel leaves the viewport).

## Width 1440

| Doc | State | firstRegionHeadY | headerStackPct | ticket height | seam height | rail inkPct | longest empty run | distinct gaps | chip density | frame a/b/c (chrome/header/active) |
|---|---|---|---|---|---|---|---|---|---|---|
| rich | s0 | 1005px | 111.7% | 347px (unfolded) | 0px | 54.9% | 270px | {6,29,56} | 7 chips, 64.1% of rail | 6.7% / 81.8% / 0.0% |
| rich | s1 | 779px | 86.6% | 347px | 0px | 54.9% | 270px | {6,29,56} | 7 chips, 64.1% | 6.7% / 60.7% / 10.4% |
| rich | s2 | −880px | −97.8% | 64px (seam) | 64px | 54.9% | 270px | {6,29,56} | 7 chips, 64.1% | 13.9% / 0.0% / 86.1% |
| rich | s3 | −2000px | −222.2% | 64px | 64px | 54.9% | 270px | {6,29,56} | 7 chips, 64.1% | 13.9% / 0.0% / 50.9% |
| prework | s0 | — (no region heads) | — | 347px | 0px | 13.9% | 657px | {} | 0 chips, 0% | 6.7% / 79.9% / 2.8% |
| prework | s1 | — | — | 347px | 0px | 13.9% | 657px | {} | 0 chips, 0% | 6.7% / 59.0% / 27.7% |
| prework | s2 | SKIPPED — no `[data-region-head="ffe"]` on this doc | | | | | | | | |
| prework | s3 | — | — | 64px | 64px | 13.9% | 657px | {} | 0 chips, 0% | 13.9% / 0.0% / 66.8% |

## Width 1280

| Doc | State | firstRegionHeadY | headerStackPct | ticket height | seam height | rail inkPct | longest empty run | distinct gaps | chip density | frame a/b/c (chrome/header/active) |
|---|---|---|---|---|---|---|---|---|---|---|
| rich | s0 | 1005px | 111.7% | 347px | 0px | 24.0% | 296px | {6,29,56} | 7 chips, 56.7% of rail (off-canvas sheet) | 6.7% / 81.8% / 0.0% |
| rich | s1 | 779px | 86.6% | 347px | 0px | 24.0% | 296px | {6,29,56} | 7 chips, 56.7% | 6.7% / 60.7% / 10.4% |
| rich | s2 | −880px | −97.8% | 64px | 64px | 24.0% | 296px | {6,29,56} | 7 chips, 56.7% | 13.9% / 0.0% / 86.1% |
| rich | s3 | −1981px | −220.1% | 64px | 64px | 24.0% | 296px | {6,29,56} | 7 chips, 56.7% | 13.9% / 0.0% / 50.9% |
| prework | s0 | — | — | 347px | 0px | 20.7% | 340px | {} | 0 chips, 0% (off-canvas sheet) | 6.7% / 79.9% / 2.8% |
| prework | s1 | — | — | 347px | 0px | 20.7% | 340px | {} | 0 chips, 0% | 6.7% / 59.0% / 27.7% |
| prework | s2 | SKIPPED — no `[data-region-head="ffe"]` on this doc | | | | | | | | |
| prework | s3 | — | — | 64px | 64px | 20.7% | 340px | {} | 0 chips, 0% | 13.9% / 0.0% / 66.8% |

Note: at 1280 the margin rail is in `data-margin-mode="sheet"` and is closed
(`translate-x-full`, off-canvas) by default — the script did not click the "Margin"
trigger, so the chip counts/heights above are read from the DOM in its resting (unopened)
state, not what a reader sees without an extra tap. See Caveats.

## Width 390 (isMobile)

Spine and margin-rail measurements are N/A below 1180px (the spine is `hidden` until
`min-[1180px]:block`; the margin `<aside>` is `hidden` until the same breakpoint) — both
report `—` below. Frame-budget chrome bucket uses `[aria-label="Document bar"]` (the fixed
mobile bar) instead of the studio drawer.

| Doc | State | firstRegionHeadY | headerStackPct | ticket height | seam height | rail inkPct | longest empty run | distinct gaps | chip density | frame a/b/c (chrome/header/active) |
|---|---|---|---|---|---|---|---|---|---|---|
| rich | s0 | 1054px | 124.9% | 64px (seam-at-rest below 1180px) | 0px | N/A | N/A | {6,29,56} | N/A | 9.1% / 71.0% / 0.0% |
| rich | s1 | 828px | 98.1% | 64px | 0px | N/A | N/A | {6,29,56} | N/A | 9.1% / 48.5% / 0.0% |
| rich | s2 | −916px | −108.5% | 64px | 64px | N/A | N/A | {6,29,56} | N/A | 16.8% / 0.0% / 83.2% |
| rich | s3 | −3235px | −383.3% | 64px | 64px | N/A | N/A | {6,29,56} | N/A | 16.8% / 0.0% / 26.2% |
| prework | s0 | — | — | 64px | 0px | N/A | N/A | {} | N/A | 9.1% / 66.1% / 13.4% |
| prework | s1 | — | — | 64px | 0px | N/A | N/A | {} | N/A | 9.1% / 33.6% / 50.2% |
| prework | s2 | SKIPPED — no `[data-region-head="ffe"]` on this doc | | | | | | | | |
| prework | s3 | — | — | 64px | 64px | N/A | N/A | {} | N/A | 16.8% / 0.0% / 64.7% |

## Other measurements taken (see JSON for full detail)

- **Job ticket rows**: `[data-job-ticket] [data-ticket-row]` counts **8** rows on both
  docs, at every width and state (the row count doesn't change with fold state — only the
  rows' visibility/mount does; `data-unfolded` gates whether the row wrapper div is in the
  DOM at all, and it always reads 8 whenever unfolded).
- **`s0` document `scrollHeight`**: rich = 3905px (1440/1280, same DOM at those widths) /
  ~4370px-class at 390 (taller due to stacked mobile layout — see JSON `s0Extra`);
  prework = 2179px at 1440/1280.
- **`s0` region → y map** (rich, 1440): `{schedule: 1005px, ffe: 1666px, money-head: 2397px}`.
  Prework: `{}` (empty — see Caveats).
- **Spine text labels present at 1440 but absent at 1280** (rich doc): `Just you ·
  visible to the studio`, `On this paper`, `Schedule`, `Money`, `Pieces`, `Client
  approvals`, `Not scheduled`, `$6,200 owed`, `3 pieces · 0 rooms`, `1h 49m`, `0 in the
  log`, `+ Log`, `Pause`, `In hand` — i.e. the entire running-index block, the presence
  line, and the full spine timer collapse to icon-only/absent between 1280 and 1440
  (`min-[1440px]:block` gates on `DocSpineShelvedBlocks`/`SpineTimer`). Interactive-child
  count in the rail drops from 8 (1440) to 3 (1280) for the same reason.
- **Spine marker row** (`[data-document-spine] > ul`, the 7 StrataMark `<li>`s): 181×49.5px
  laid out horizontally at 1440 (y=94.5–144); 41.5×373.5px laid out **vertically** at 1280
  (y=81–454.5) — confirms the documented `min-[1440px]:flex-row` breakpoint.
- **Margin note composer**: `textarea[aria-label="Note body"]` was never present in any
  measured state (it only mounts after clicking "+ Note", which the script never does) —
  `noteComposerPresent: false` everywhere. This is expected, not a finding.

## Caveats / what could not be measured

1. **The rich seed (Chen Residence) has only 3 FF&E lines and 0 rooms.** The ticket's
   "Pieces" row prints `3 pieces · 0 rooms`, and the margin/spine measurements above (ink
   density, chip counts) reflect that thin content, not a typical in-flight project. Treat
   the rail ink-utilisation numbers as a floor, not a ceiling — a project with real room
   and FF&E volume would very plausibly measure *higher* spine/margin ink density than
   what's reported here.
2. **The prework (proposal) doc has zero `[data-region-head]` elements anywhere on the
   page.** `ScheduleRuleRegion` and `ProjectApprovalDocumentMount` both return `null` for
   any `engagementKind !== 'project'` (confirmed in source), and its active section render
   path apparently doesn't route through `RegionHead` at all for a proposal-stage document
   at this seed's `active_section`. Consequently: `firstRegionHeadY`,
   `headerStackPctOfViewport`, `distinctGaps` (empty set), the `s0` region→y map (empty
   object), and inter-region-gap analysis are all **not applicable** for prework — not a
   script failure, a real structural absence, worth flagging to the program as its own
   finding (a proposal document may have no scannable "region" affordance at all).
3. **`s2` (the FF&E-seam scroll state) is skipped entirely for the prework doc** at all
   three widths, for the same reason as #2 — there is no `[data-region-head="ffe"]` to
   scroll to. Per the brief's own instruction ("skip s2 with a note if the selector is
   absent on that doc"), this is a deliberate skip, not a missing measurement.
4. **Margin-rail measurements at 1280px reflect the closed/off-canvas "sheet" state.**
   Between 1180–1439px the margin `<aside>` renders with `data-margin-mode="sheet"` and
   sits `translate-x-full` (off-canvas, `pointer-events-none`) until a reader taps the
   fixed "Margin" trigger button. The script measured the DOM as-loaded rather than
   clicking that trigger, so the 1280 "rail inkPct"/chip numbers describe content that
   exists in the DOM but is not currently visible to a reader at that width. The 1440
   numbers are the true at-rest, always-visible rail.
5. **`s1`'s `bottom < 0` assertion.** The script computes the s1 scroll target from the
   letterhead's own rect (`bottom + scrollY + 1`) and then re-checks `bottom < 0` after
   scrolling; this held at every doc/width combination measured (no note was logged), so
   no skip occurred here — noted only because the brief asked for the assertion to be
   explicit. See `research/00-env-and-ids.md` for the literal commands run.
6. **`--doc-seam-height` at 390px reads `0px` even at `s0`/`s1`,** despite the ticket
   already being in its 64px collapsed ("seam-at-rest") form below 1180px. This is correct
   per source: the CSS variable is written by a `useLayoutEffect` gated on `pinned &&
   !unfolded`, and `pinned` is driven by the ticket's own `IntersectionObserver` sentinel
   — which has not fired yet at `scrollY = 0`. The ticket is visually 64px tall at rest,
   but the seam variable (used for other elements' `scroll-margin-top`) only activates once
   the reader has actually scrolled past the sentinel. Both facts (64px ticket height, 0px
   seam variable) are reported as measured — this is not a measurement bug.
7. **Interactive-child count and text-label diffing** for the spine were only computed at
   1440/1280 (390 has no spine to measure — `spine: null`/`present: false` in the JSON,
   shown as N/A in the 390 table), per the brief's own scope ("1440 and 1280 only").
8. **Frame-budget buckets are a 1-pixel vertical partition, not a full 2-D pixel grid.**
   The brief's own instructions describe assigning "each viewport row" to a bucket, which
   is what was implemented; this slightly overstates a bucket's real footprint whenever an
   element only occupies part of the horizontal width in a row another bucket also
   occupies at a different x — in practice this only affects the fixed-width rail/margin
   columns running alongside `<main>`, which is why rail width is reported as its own
   separate horizontal-band metric rather than folded into the row accounting.

## Commands run unsandboxed (M1)

See the "Commands run unsandboxed (M1)" heading appended to `research/00-env-and-ids.md`
for the verbatim command and why it needed the sandbox off.
