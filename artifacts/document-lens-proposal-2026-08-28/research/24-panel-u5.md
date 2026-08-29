# 24 — Panel U5 · Reach (keyboard, SR, reduced motion, 390)

Seat: U5. Surface: `/doc/[id]`. Method: cognitive walkthrough over the evidence pack (code
anatomy, layout measurements, interactive probe, shot ledger) plus direct source reads of
`job-ticket.tsx`, `margin-rail.tsx`, `doc-spine.tsx`, `mobile/mobile-bar.tsx`,
`mobile/mobile-sheets.tsx`, `mobile/mobile-margin-chips.tsx`, `margin-item.tsx`, and
`app/globals.css`'s `:focus-visible` rule, run live against the repo (read-only). No click-testing
was possible; every claim that would need one says so and is marked accordingly.

---

## (1) One line

The document already has the exact hazard a scroll-driven lens must not repeat: the job ticket's
pin/collapse is a **scroll-triggered, un-announced state change** — `aria-expanded` flips on a
button nobody pressed, focus is silently redirected to that button if the reader happened to be
inside the ticket (`job-ticket.tsx:235-244`), and a paper-wide 283px layout jump (measured,
`probe/03-interactive-probe.md §1`) happens with no live-region announcement anywhere in the fold
machinery (`grep aria-live` on `job-ticket.tsx`/`fold-seam.tsx`/`use-region-fold.ts`: zero hits). A
"smart lens" that adds more scroll-triggered condensation without first giving this one a contract
— announced, focus-preserving, instant-not-tweened — multiplies a defect that already ships today.

## (2) Answers, in brief-order

### Q1 — Landmark map; reaching the margin without traversing the whole paper; 1180–1439 reading order

**Landmarks, by width** (source: `doc-spine.tsx:39`, `margin-rail.tsx:249-262`):

| Width | Spine | Margin |
|---|---|---|
| <1180 | absent (`hidden`) — the document index exists only as the mobile spine sheet, `role="dialog" aria-modal="true"`, but see the aria-label gap below | absent (`hidden`) — mobile margin chips are plain inline `<button>`s, no landmark |
| 1180–1439 | `<aside aria-label="Document spine">` — always named | `<aside>`, `role={openAsSheet ? 'dialog' : undefined}`, `aria-label={isFullRail ? 'Margin' : undefined}` → **at rest (closed), `isFullRail` is false and `openAsSheet` is false, so the aside has no role override and no accessible name at all** (`margin-rail.tsx:249-252`). Only once opened does it become a named dialog (`aria-labelledby={titleId}`). |
| ≥1440 | `<aside aria-label="Document spine">`, `col-start-3` sticky column | `<aside aria-label="Margin">` — named at all times |

**Can a screen-reader user reach the margin without traversing the whole paper?** Yes, via landmark
navigation (NVDA/JAWS "next region", VoiceOver rotor → Landmarks) at every width ≥1180 — the
`<aside>` is a real complementary/dialog landmark and a landmark jump does not require linear
traversal. But at 1180–1439, **before the reader opens it**, the jump lands on an unlabeled
complementary region — the landmarks list reads "complementary" with no name, indistinguishable
from any other unlabeled complementary region on the page if one existed. Below 1180 there is no
margin landmark at all; the only path is the mobile bar → sections sheet → margin summary, or the
anchored chips inline in the reading order.

**DOM reading order at 1180–1439:** the margin `<aside>` mounts at `page.tsx:2316-2334`, after
`<main>` closes at `page.tsx:2305`. So for a **linear** reader (Tab order, or a screen reader
reading straight through rather than landmark-jumping), the margin is genuinely last — every
interactive element in the letterhead, ticket, guide, approvals, schedule, FF&E and money regions
must be tabbed past first. Landmark-jump is the only shortcut, and it delivers an unnamed region
until opened.

### Q2 — 2.4.11 Focus Not Obscured; `--doc-seam-height` consumers

**The seam is `sticky top-0 z-[4]`** (`job-ticket.tsx:362`), 64.06px tall once pinned-and-collapsed
(measured, `probe/03-interactive-probe.md §1`; also `research/12-layout-measurements.md`). Two
existing CSS mitigations already exist and were confirmed reading the source:

- `[data-document-shell] section[aria-label='Schedule rule'] { top: var(--doc-seam-height, 0px) }`
  (`globals.css:1026`) — the schedule glance's own sticky top is pushed down by the seam height, so
  it never paints under the pinned ticket.
- `[data-document-shell] [data-index-region] { scroll-margin-top: var(--doc-seam-height, 0px) }`
  (`globals.css:1034`) plus the FF&E floor `max(..., 4rem)` (`:1037`) and Money's inline
  `SEAM_CLEARANCE` (`commercial/money-region.tsx:48`) — these protect **programmatic
  scroll-into-view landings** (a click on a ticket row, a running-index jump) from landing a region
  root under the seam. Modern Chromium/Firefox also honor `scroll-margin-top` for the browser's own
  "scroll focused element into view" behavior, so a region **root** reached by any means should
  clear the seam.

**What is NOT covered:** none of the individual focusable controls *inside* an already-visible
region (a ticket row link, a region head's Fold button, an FF&E line's stamp/expand control, a
margin item's toggle) carry their own `scroll-margin-top`. Only the four *region-root* selectors
above do. A keyboard user Tab-walking (not click-jumping) through a region whose first focusable
child sits at the very top of the current scroll position — which is exactly where a control ends
up once the seam has just pinned — has no guarantee the browser's auto-scroll-into-view accounts
for the 64px the seam physically occupies, because scroll-margin-top is declared on the region
container, not on that child control. **This could not be click/Tab-tested (no browser control in
this session)** — flagged as a plausible, source-grounded risk rather than a confirmed failure.

**Full `--doc-seam-height` consumer list** (all four, confirmed via `grep -rn` in the anatomy pack,
§8):
1. Producer: `job-ticket.tsx:60,248-259` (`useLayoutEffect`, writes to `document.documentElement`).
2. `globals.css:1026` — Schedule glance `top` offset.
3. `globals.css:1034` — every `[data-index-region]` root's `scroll-margin-top`.
4. `globals.css:1037` — FF&E's `max(seam, 4rem)` floor.
5. `commercial/money-region.tsx:48` — inline `SEAM_CLEARANCE`, redundant with #3 but locally
   declared.

**If the seam's height became dynamic** (which a lens's per-state condensation would make it, since
today it is a fixed 64.06px two-line form): all five sites above would need to re-derive from the
live custom property rather than assume 64px — they already read the CSS variable rather than a
hardcoded number, so the *mechanism* survives a height change; what would NOT automatically survive
is the FF&E floor's `4rem` constant (`globals.css:1037`), which assumes the seam is small enough
that 4rem (64px) is the effective floor most of the time — a taller dynamic seam state would need
that floor re-checked, and the money-region inline duplicate (`money-region.tsx:48`) would need to
be kept in lockstep with any change to the CSS rule rather than drift.

### Q3 — Focus when a region unmounts under the caret

**Today, on a click-driven fold** (confirmed directly, `probe/03-interactive-probe.md §3`, Money
region): focus was standing on a real control inside the body ("Sync from the schedule"); after
**Fold**, the body unmounts and `document.activeElement` becomes **`<body>`** — no redirect at all.
Unfolding is the disciplined half: the seam unmounts and `focusRegionHeading` lands focus exactly
on `<h2 id="money-region-heading">` (confirmed). Source location for the missing half:
`region/region-head.tsx:177-187` (the `Fold ↑` action is a bare `tertiary` action calling a state
setter — `onFold` — with nothing that calls `.focus()` afterward), consistent with
`use-region-fold.ts:97-142`'s toggle contract carrying no focus obligation at all.

**Under a lens that condenses on scroll rather than a click a designer never took, this same gap
already exists as a live precedent** in the ticket, not hypothetically: `job-ticket.tsx:235-244`
resets `fold` to `null` on every pin change and **does** redirect focus to the fold button, but only
`when the reader was standing inside the ticket` (`focusWithin` ref, `:213`, refocus `:241`) — i.e.
today's one scroll-driven condensation already moves focus involuntarily, on a scroll the reader
did not request as a focus action, whenever focus happened to be inside the collapsing region. That
is a real, shipped instance of exactly the failure mode the brief asks a future lens to avoid: a
context change (focus moving) triggered by scroll input, not by an explicit user request on the
focused control (bears on 2.2.2/3.2.5 in spirit, though neither SC strictly forbids it since the
change is scroll-input-driven rather than a timeout). **A lens that condenses more surfaces on
scroll must give every condensing region the ticket's *redirect* behavior at minimum (never the
Money region's silent drop to `<body>`), and should reconsider redirecting focus at all when the
trigger was ambient scroll rather than a keypress/click on that exact control** — the safer contract
is: if focus is inside a region that scroll-condenses, park it on the resulting seam/summary control
(matching Money's fold-to-`<body>` bug fixed to land on the seam, not the ticket's move-to-a-
different-button).

### Q4 — 2.3.3 / 2.2.2, the reduced-motion contract

**Today's contract, confirmed:** 9 `@media (prefers-reduced-motion: reduce)` blocks in
`globals.css` plus Tailwind's `motion-safe:`/`motion-reduce:` variants cover every keyframe in the
reading shell (`research/10-code-anatomy.md §7`). `hooks/useReducedMotion.ts` exists but **has zero
consumers under `components/document/`** — the Document's entire motion policy is CSS-media-query
only, with **no in-app visible motion toggle anywhere** (confirmed: no motion setting in
`interruption-settings.tsx`, no `find . -iname "*interruption*"` hit for a motion surface, no other
settings surface found). The one existing scroll-driven state change (the ticket's pin/fold) is not
animated at all today — the probe measured **zero interpolated frames in either direction**
(`probe/03-interactive-probe.md §1`: 23 samples at 17ms intervals, every one reads exactly 64.0625px
— a hard React-state swap, not a tween) — so there is nothing for `prefers-reduced-motion` to even
disable there; the jump itself is a layout discontinuity, not an animation.

**Is `prefers-reduced-motion` alone sufficient, or is a visible control required?** For a **discrete
threshold-triggered state swap** (mirroring what the ticket already does: unfolded ↔ two-line seam,
no tween) — the OS-level media query is consistent with the house's own precedent and does not need
a visible control, provided any *new* transition the lens adds is wrapped in the same 9-block
pattern already established. For anything closer to a **continuous scroll-linked animation**
(opacity/scale/position scrubbed to scroll offset, i.e. parallax-style condensation rather than a
snap) — `prefers-reduced-motion` alone is not a safe sole gate: a meaningful fraction of users who
experience scroll-linked motion discomfort have never set the OS preference (it is not
discoverable, and Kody's own reduced-motion backlog note — "39 app-wide offenders, unchanged across
two walks" — is evidence this app already carries motion debt nobody surfaced a toggle for). Given
R15's own doctrine ("nothing on the Desk ever moves" beyond the one sanctioned breath, ambient
motion "declined") and R124/R125's "no feature flags anywhere" stance, the safer design is: **keep
lens condensation a discrete, instant (or very-short, non-scrubbed) state change gated by the
existing `prefers-reduced-motion` CSS pattern, and do not introduce a scroll-scrubbed animation at
all** — that sidesteps the visible-control question entirely rather than answering it with a new
settings surface this program has no mandate to build.

### Q5 — 4.1.2 / 4.1.3, announcing a density change; no toast layer

**Confirmed via source, zero matches:** `grep -n "aria-live" job-ticket.tsx region/fold-seam.tsx
region/use-region-fold.ts region/region-head.tsx` returns nothing. None of the four disclosure
mechanisms that already change a region's density (ticket fold/pin, region fold, ticket room-chip
expand, Phases fold) announce anything via a live region today. The trigger controls do carry
correct static ARIA (`aria-expanded={unfolded}` on the ticket's Fold button, `job-ticket.tsx:392`;
`aria-controls={bodyId}` on `RegionHead`'s Fold action, `region-head.tsx:177-187`) — which **is**
announced correctly when the reader is the one who pressed the button (a focused control's own
`aria-expanded` flip is read by every major screen reader). **The gap is exactly the scroll-driven
case:** when the ticket's `aria-expanded` value flips because the sentinel crossed the viewport, not
because the button was pressed, nothing announces it unless the reader happens to Tab back to that
specific button and re-hear its state. A screen-reader user scrolling steadily past the sentinel
gets **silence** at the exact moment ~283px of the document just vanished above them.

**What must be announced, on what element, how often:** a lens introducing more scroll-driven
condensation needs one small `aria-live="polite"` region (there is no toast layer per R83, so this
must be a persistent, visually-minimal inline element — not a transient toast) that fires only on
the **discrete threshold crossing** (pin flips true/false, a region's fold state flips), never on
continuous scroll position — e.g. "Job ticket collapsed to summary" / "Money region folded". Rate:
once per crossing, debounced against rapid up/down scroll oscillation right at the threshold (the
ticket's own `IntersectionObserver` at `threshold: 0`, `job-ticket.tsx:218-228`, can already
theoretically flip twice in one frame near the boundary — an announcement wired to it needs a
short hysteresis or it becomes exactly the noise the brief warns about).

### Q6 — 2.5.8 Target Size (Minimum), by site

Read against actual class strings, not assumed:

| Site | Measured / computed | Verdict |
|---|---|---|
| Studio drawer strip, 60px bar (`studio-drawer.tsx:289`) | "Patina" link, ledger buttons, "Find anything" button: all `min-h-11` (44px) | **Compliant** — every interactive control inside the 60px bar is engineered to the 44px floor, not the bar's own height |
| Mobile bar's three zones (`mobile/mobile-bar.tsx:216-296`) | "Open sections" `min-h-11`; primary `DocumentAction` `min-h-11 w-full`; "More" `min-h-11 min-w-11` | **Compliant** at 44px on all three zones |
| 56px compact spine rail, 1280 (`doc-spine.tsx:44`) | "Put down" `min-h-11 w-full min-w-11` (`:49`); each jump `<li>` button `min-h-11 w-full min-w-11` (`:111`); `CompactSpineTimerDoorway` `min-h-11 w-full min-w-11` (`spine-timer.tsx:61`) | **Compliant** at 44px — every *interactive* element in the compact rail hits the floor even though the column is only 56px wide |
| Margin chips, mobile (`mobile/mobile-margin-chips.tsx:98,114`) | `py-[0.32rem]` (≈5.12px top+bottom) + `text-[11px]` line ≈ 21–26px total height depending on the browser's default line-height for an unset `leading-*` on an 11px arbitrary size | **Likely fails the 24×24px floor** — no explicit line-height class is set, so the true rendered height cannot be pinned exactly from source alone; confidence accordingly reduced. **What would settle this:** read the computed `getBoundingClientRect().height` of one `mobile-margin-chips.tsx` chip button in a live browser. |
| Ticket seam's `Fold ↑`/`Unfold ↓` control (`job-ticket.tsx:389-398`) | Inline text link inside the two-line seam, no explicit min-height class found on this control specifically | Below 24px by the numbers (the whole seam is 64px for *two lines of text*, so one control's line is well under 24px tall) — **but SC 2.5.8 carries an inline/"in a sentence or block of text" exception that plausibly applies** since this is a text-styled inline control at the end of a text line, not a standalone icon button. Flagged, not asserted as a failure. |
| Margin item card, desktop (`margin-item.tsx:52`) | `px-3 py-2.5` (20px) + two-to-three lines of 11–14px content | **Compliant**, comfortably over 44px given the multi-line content |

### Q7 — 1.4.3 contrast per lens state; the muted-ramp floor

Computed (WCAG relative-luminance formula, not eyeballed) against both backgrounds:

| Token | vs paper `#FCFAF6` | vs rail `#E8E3DB` |
|---|---|---|
| `#4E4339` | 9.22:1 | 7.52:1 |
| `#5A4E43` | 7.73:1 | 6.31:1 |
| `#65594E` | 6.51:1 | **5.32:1** (the ramp's worst case today) |

**None of the three named ramp tokens fails 4.5:1 against either background today** — the brief's
framing anticipates a failure that the current ramp does not actually contain; worth stating plainly
so the ramp is not "fixed" against a defect that does not exist. The real number that matters for a
*future* lens step (a fourth, lighter "receding" tint for condensed/de-emphasized text) is the
**floor itself**: solving for the maximum text luminance that still clears 4.5:1 against the harder
of the two backgrounds (rail, `#E8E3DB`, relative luminance 0.772) gives **L ≤ 0.1327** (against
paper, `#FCFAF6`, L=0.957, the floor is more permissive at L ≤ 0.1738). `#65594E`'s own luminance is
0.1046 — meaning the ramp already sits close to that floor (5.32:1 vs. the 4.5:1 minimum, roughly
18% of headroom left on the rail case) and has room for at most one more small step lighter before
crossing, not a whole new tint family. Any lens-introduced "condensed region, quieter ink" state
should not go lighter than roughly `#65594E`'s own luminance on rail stock for body text; a genuinely
lighter recede state is only safe at large-text/UI-component thresholds (3:1, which the same rail
math allows up to L ≤ 0.224 — noticeably more headroom, e.g. usable for a de-emphasized label at
≥18px or bold ≥14px, not for a paragraph of prose).

### Q8 — Hover-only affordances; T1–T16 reachable at 390

**Hover-only check, verified by direct grep of `hover:` across `job-ticket.tsx`, `doc-spine.tsx`,
`margin-rail.tsx`, `region/region-head.tsx`, `region/fold-seam.tsx`:** every `hover:` class found is
paired with a matching `focus-visible:` or `group-focus-visible:` variant on the same scored-ink
underline (`da-score-hover ... group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100`,
e.g. `doc-spine.tsx:52`, `margin-rail.tsx:230,279,529,551,647`). `row-wash.tsx`'s ink-pool wash is
gated `.has-wash:hover, .has-wash:focus-within` (`globals.css:339-342`) — also paired. **No
hover-only affordance was found in the spine, margin, or ticket surfaces.** `margin-item.tsx:46`'s
`hover:border-[#CFC8BB]` border-color tweak has no explicit focus pairing on that exact class, but
the app's global `*:focus-visible { outline: 2px solid var(--color-quiet-ink); outline-offset: 3px;
}` (`globals.css:1171-1173`) already gives every focusable control, including this card's toggle
button, a visible focus indicator independent of that hover rule — so the practical affordance is
not hover-only even though the specific border tint is. **Verdict: doctrine holds; the automatic
return in the rubric should read "none found" for this seat's checked surfaces.**

**T1–T16 reachable at 390, from the task table's own per-task 390/scroll notes plus source:**

| Reachable as-is at 390 | Not reachable, or reachable only with an extra step the desktop doesn't pay |
|---|---|
| T1 (off-paper, `/desk`) | **T6** — Drawings/Spec ticket leaves are dead below 1440 (`job-ticket.tsx:267,283`, "a dead leaf... prints no → and does not press") — genuinely impossible at 390, not merely harder |
| T3, T4, T7, T8, T9, T10, T14 (in-document, reachable via scroll) | **T5, T9 (Boards/Money doors), T15 (People/call-sheet door)** — all three are ticket rows; below 1180 the ticket rests permanently as the two-line seam (`seamAtRest`, `job-ticket.tsx:202,244`), so these doors require one extra "Unfold ↓" tap the ≥1180 reader never needs when the ticket is still unpinned |
| T16 (margin, via anchored chips/mobile sheet) | **T11** ("Put down") — confirmed structurally: at ≥1180 it is permanently visible at the top of the spine (`doc-spine.tsx:46-55`); at 390 it is one level deeper, inside the mobile bar's "More" menu (`mobile-bar.tsx:285-296` opens the menu; the brief's own T11 note independently states "at 390 it is behind the mobile bar's More") |
| — | **T12** (⌘K) and **T13**'s `g o` chord — both are keyboard-chord-only affordances with no visible on-screen equivalent evident in the mobile bar/sheet source read; a touch-only 390 user has no keyboard to press ⌘K or a bare-letter chord with in the first place, so these need a verified touch equivalent (the mobile bar's "Find anything ⌘K" menu row, `mobile-bar.tsx:355-368`, **is** a touch-reachable equivalent for T12 — confirmed, so T12 is fine; T13's `g o` chord has no equivalent found in the mobile-bar source excerpt read, so it is left as **not reachable except via the ticket's Money row**, itself behind the seam-unfold tap) |

**A lens must not be allowed to make worse:** T11 and T15/T5/T9's "extra tap" cost, because a
condensing lens's entire premise is *more* content resting collapsed by default — if the lens
extends the ticket's `seamAtRest` logic (or something like it) upward into 1180–1439 or keeps 390's
"always collapsed" behavior but adds yet another fold layer on top of the ticket seam, these tasks
go from "one extra tap" to "two," which is the kind of drift the brief's automatic-return clause is
watching for.

---

## (3) Findings

```json
{ "id": "U5-01", "lens": "U5", "persona": null, "task_ids": ["T3","T9"],
  "key": "doc|all|top|letterhead-header-no-banner-landmark",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "top", "flag": "off",
  "title": "Letterhead <header> nested in <main> exposes no landmark",
  "observation": "DocLetterhead root is <header id=\"document-project-status\"> inside <main data-document-paper>; a <header> nested under sectioning content is not the 'banner' landmark.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"shots": ["w1440-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/doc-letterhead.tsx:52"]},
  "severity": "low", "confidence": 0.7,
  "already_ruled": null,
  "suggested_fix": "Give the letterhead a distinct landmark role/label so SR users can jump straight to it.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U5-02", "lens": "U5", "persona": null, "task_ids": ["T16"],
  "key": "doc|1280|all|margin-aside-unlabeled-at-rest",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "off",
  "title": "Closed margin sheet is a nameless landmark at 1280",
  "observation": "margin-rail.tsx:251 sets aria-label only when isFullRail; at 1180-1439, before the reader taps 'MARGIN ←', the <aside> has no role override and no aria-label.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"shots": ["w1280-margin-tab-closed.png"], "refs": ["apps/designer-portal/src/components/document/margin-rail.tsx:249-252"]},
  "severity": "medium", "confidence": 0.85,
  "already_ruled": null,
  "suggested_fix": "Give the closed 1180-1439 <aside> a static aria-label='Margin' regardless of open state.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U5-03", "lens": "U5", "persona": null, "task_ids": ["T16"],
  "key": "doc|all|all|margin-only-reachable-by-landmark-jump",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "off",
  "title": "Margin is last in linear Tab order at every width",
  "observation": "MarginRail mounts at page.tsx:2316-2334, after <main> closes at page.tsx:2305; a sequential Tab user must pass every ticket row, region, and action before reaching it.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"refs": ["apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:2305", "apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:2316-2334"]},
  "severity": "low", "confidence": 0.75,
  "already_ruled": null,
  "suggested_fix": "Landmark-jump already covers this at >=1180; document it as the sanctioned path rather than leaving Tab as the only discoverable one.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U5-04", "lens": "U5", "persona": null, "task_ids": ["T4","T9","T10"],
  "key": "doc|all|mid|region-child-controls-lack-scroll-margin",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "off",
  "title": "Only region roots clear the pinned seam, not their child controls",
  "observation": "globals.css:1034/1037 and money-region.tsx:48 set scroll-margin-top on [data-index-region] roots only; individual ticket-row links, Fold buttons and FF&E line controls carry no scroll-margin-top of their own.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 64,
  "evidence": {"refs": ["apps/designer-portal/src/app/globals.css:1026-1037", "apps/designer-portal/src/components/document/commercial/money-region.tsx:48"]},
  "severity": "medium", "confidence": 0.5,
  "already_ruled": null,
  "suggested_fix": "A live keyboard Tab-walk past the pin threshold would settle whether a mid-region control ever lands under the seam.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U5-05", "lens": "U5", "persona": null, "task_ids": ["T9"],
  "key": "doc|all|seam|region-fold-drops-focus-to-body",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "off",
  "title": "Folding a region drops keyboard focus to <body>",
  "observation": "Probe: folding the Money region with focus on 'Sync from the schedule' unmounts the body and leaves document.activeElement as <body> — no redirect at all.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"shots": ["w1440-fold-seam-folded.png"], "refs": ["apps/designer-portal/src/components/document/region/region-head.tsx:177-187", "artifacts/document-lens-proposal-2026-08-28/probe/03-interactive-probe.md"]},
  "severity": "high", "confidence": 0.9,
  "already_ruled": null,
  "suggested_fix": "Park focus on the resulting FoldSeam button (mirror the unfold path's focusRegionHeading contract).",
  "hesitation_seconds_estimate": 30 }
```

```json
{ "id": "U5-06", "lens": "U5", "persona": null, "task_ids": ["T3","T9"],
  "key": "doc|1440|seam|ticket-pin-redirects-focus-on-scroll",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "off",
  "title": "Ticket pin, triggered only by scroll, silently relocates focus",
  "observation": "job-ticket.tsx:235-244 resets fold to null and refocuses the Fold button on every pin change when focus was inside the ticket; the pin itself is driven by an IntersectionObserver on scroll, not a keypress.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:213,235-244"], "shots": ["w1440-ticket-seam.png"]},
  "severity": "high", "confidence": 0.85,
  "already_ruled": null,
  "suggested_fix": "Don't move focus on a scroll-driven pin change unless the control that had focus is about to be unmounted.",
  "hesitation_seconds_estimate": 25 }
```

```json
{ "id": "U5-07", "lens": "U5", "persona": null, "task_ids": ["T3","T9","T4"],
  "key": "doc|1440|seam|ticket-jump-no-live-region",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "off",
  "title": "Ticket collapse is a silent 283px jump for SR users",
  "observation": "grep for aria-live across job-ticket.tsx, fold-seam.tsx, use-region-fold.ts returns zero hits; the ticket's aria-expanded flips with no reader interaction and nothing announces the change.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 283,
  "evidence": {"refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:392"], "shots": ["w1440-rich-s1.png","w1440-rich-s2.png"]},
  "severity": "high", "confidence": 0.9,
  "already_ruled": null,
  "suggested_fix": "Add one polite live region announcing pin-state crossings only, debounced against the threshold-0 observer.",
  "hesitation_seconds_estimate": 30 }
```

```json
{ "id": "U5-08", "lens": "U5", "persona": null, "task_ids": ["T9"],
  "key": "doc|all|seam|ticket-jump-not-scored-as-cls",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "off",
  "title": "The ticket's 283px jump doesn't register as a Layout Shift",
  "observation": "Probe §8 CLS pass found the ticket fold's ~283px jump absent from PerformanceObserver layout-shift entries in either motion setting, despite being independently confirmed via before/after DOM measurement in §1.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 283,
  "evidence": {"refs": ["artifacts/document-lens-proposal-2026-08-28/probe/03-interactive-probe.md"]},
  "severity": "medium", "confidence": 0.6,
  "already_ruled": null,
  "suggested_fix": "Don't rely on CLS tooling alone to catch a lens's own sticky-height jumps; measure directly as this probe did.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U5-09", "lens": "U5", "persona": null, "task_ids": ["T3"],
  "key": "doc|all|all|no-in-app-motion-control",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "off",
  "title": "Reduced motion has zero in-app toggle; OS setting only",
  "observation": "hooks/useReducedMotion.ts has no consumers under components/document/; no motion setting exists in interruption-settings.tsx or any other found settings surface.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 0,
  "evidence": {"refs": ["apps/designer-portal/src/hooks/useReducedMotion.ts", "apps/designer-portal/src/components/document/interruption-settings.tsx"]},
  "severity": "medium", "confidence": 0.85,
  "already_ruled": null,
  "suggested_fix": "Keep any new lens condensation a discrete, instant, prefers-reduced-motion-gated swap rather than a continuous scroll-scrub, sidestepping the need for a new toggle.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U5-10", "lens": "U5", "persona": null, "task_ids": ["T6"],
  "key": "doc|390|top|drawings-spec-doors-dead-below-1440",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "top", "flag": "off",
  "title": "Drawings and Spec ticket rows are unreachable below 1440",
  "observation": "\"DRAWINGS · Nothing filed\" and \"SPEC · 0 of 3 specified · by room\" print with a -> arrow at 1440 but job-ticket.tsx:267,283 makes a dead leaf (no route, not wide) print no arrow and not press.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 60,
  "evidence": {"shots": ["w1440-rich-s0.png","m390-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:267,283"]},
  "severity": "high", "confidence": 0.75,
  "already_ruled": null,
  "suggested_fix": "Give Drawings/Spec a real 390 route (a sheet, not a redirect-to-desktop) before a lens spends more real estate on the same dead rows.",
  "hesitation_seconds_estimate": 40 }
```

```json
{ "id": "U5-11", "lens": "U5", "persona": null, "task_ids": ["T5","T9","T15"],
  "key": "doc|390|top|ticket-rest-seam-hides-ticket-doors",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "top", "flag": "off",
  "title": "Boards/Money/People ticket doors need one extra tap at 390",
  "observation": "\"THE JOB · PROJECT / $6,200 owed you · 3 unspecified / UNFOLD ↓\" is the ticket's resting state at 390 (seamAtRest, job-ticket.tsx:202,244) — the 8 rows exist only after that tap.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 60,
  "evidence": {"shots": ["m390-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:202,244"]},
  "severity": "medium", "confidence": 0.75,
  "already_ruled": null,
  "suggested_fix": "A lens should not add a second fold layer on top of the ticket's default-collapsed 390 state.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U5-12", "lens": "U5", "persona": null, "task_ids": ["T11"],
  "key": "doc|390|all|put-down-behind-more-menu",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "off",
  "title": "Put down (Esc) needs the More menu open first at 390",
  "observation": "At >=1180 'PUT DOWN' sits permanently at the top of the spine (doc-spine.tsx:46-55); at 390 the same act is one level deeper, inside the mobile bar's More menu (mobile-bar.tsx:285-296).",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"shots": ["w1440-spine-full.png","m390-mobile-bar.png"], "refs": ["apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:285-296"]},
  "severity": "medium", "confidence": 0.7,
  "already_ruled": null,
  "suggested_fix": "A lens must not push Put down a further level deeper on mobile; if anything, surface it, since D1's exit is the one act NG1 requires to always be one trip.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U5-13", "lens": "U5", "persona": null, "task_ids": ["T13"],
  "key": "doc|390|all|go-chord-no-touch-equivalent-found",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "off",
  "title": "PO-acknowledgement chord (g o) has no confirmed touch path",
  "observation": "instruments.md's T13 script relies on a bare-letter 'g o' chord; no equivalent touch affordance for it was found in the read mobile-bar/mobile-sheets source, leaving the ticket's Money row (itself behind the seam-unfold tap) as the only route.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": {"refs": ["artifacts/document-lens-proposal-2026-08-28/source/instruments.md"]},
  "severity": "low", "confidence": 0.4,
  "already_ruled": null,
  "suggested_fix": "Confirm whether a touch equivalent exists elsewhere (the Orders sheet's own entry point) before assuming this is a real gap; what would settle this: a full read of the command-palette/chord registry.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U5-14", "lens": "U5", "persona": null, "task_ids": ["T16"],
  "key": "doc|390|all|avatar-overlaps-mobile-bar-and-sheet",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "off",
  "title": "A floating avatar/launcher visually covers the mobile bar and sheet content",
  "observation": "In m390-mobile-bar.png the 'N' avatar circle overlaps 'IN THIS DOCUMENT' and clips 'Project'; in m390-mobile-spine-sheet.png the same circle sits over the third margin chip's leading text.",
  "why_it_blocks": "crowding",
  "frame_cost_estimate": 50,
  "evidence": {"shots": ["m390-mobile-bar.png","m390-mobile-spine-sheet.png"]},
  "severity": "medium", "confidence": 0.55,
  "already_ruled": null,
  "suggested_fix": "Check z-index/positioning of the fixed avatar launcher against the mobile bar and any open sheet; a modal sheet should sit above it.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U5-15", "lens": "U5", "persona": null, "task_ids": ["T16"],
  "key": "doc|390|all|margin-chip-target-under-24px",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "off",
  "title": "Mobile margin chips likely sit under the 24px target floor",
  "observation": "mobile-margin-chips.tsx:98,114 chips use py-[0.32rem] (~5.12px) padding around an unstyled text-[11px] line, with no explicit leading class; estimated total height ~21-26px against SC 2.5.8's 24x24 minimum.",
  "why_it_blocks": "crowding",
  "frame_cost_estimate": 0,
  "evidence": {"shots": ["m390-mobile-margin-chips.png"], "refs": ["apps/designer-portal/src/components/document/mobile/mobile-margin-chips.tsx:98,114"]},
  "severity": "medium", "confidence": 0.5,
  "already_ruled": null,
  "suggested_fix": "Measure a live chip's getBoundingClientRect().height; add explicit leading or min-height if under 24px.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U5-16", "lens": "U5", "persona": null, "task_ids": ["T3"],
  "key": "doc|1280|all|glyph-rail-word-wrap-breaks-mid-word",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "off",
  "title": "56px compact spine wraps ACTIVE to \"ACTIV/E\" mid-word",
  "observation": "w1280-spine-glyph-rail.png shows \"PUT / DOWN\" and \"Project / ACTIV / E\" broken across lines inside the 56px column at 1280.",
  "why_it_blocks": "crowding",
  "frame_cost_estimate": 40,
  "evidence": {"shots": ["w1280-spine-glyph-rail.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:44"]},
  "severity": "low", "confidence": 0.85,
  "already_ruled": null,
  "suggested_fix": "Add a non-breaking rule or abbreviate the status word so the 56px column never splits a word mid-letter.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U5-17", "lens": "U5", "persona": null, "task_ids": ["T9","T13"],
  "key": "doc|1280|all|studio-bar-text-overlap",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "off",
  "title": "Studio drawer bar text overlaps its own timer readout at 1280",
  "observation": "w1280-rich-s0.png/w1280-rich-s1.png show \"IN HAND TODAY\" and \"1h 12m\" rendering visually overlapped/garbled near the search control at the bottom of the frame.",
  "why_it_blocks": "crowding",
  "frame_cost_estimate": 30,
  "evidence": {"shots": ["w1280-rich-s0.png","w1280-rich-s1.png"]},
  "severity": "low", "confidence": 0.4,
  "already_ruled": null,
  "suggested_fix": "Confirm live (may be a capture/compression artifact); if real, widen or truncate the timer readout at 1280.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U5-18", "lens": "U5", "persona": null, "task_ids": ["T3","T4","T9"],
  "key": "doc|all|all|no-hover-only-affordance-found",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "off",
  "title": "No hover-only affordance found in spine, margin, or ticket",
  "observation": "Every hover: class in job-ticket.tsx, doc-spine.tsx, margin-rail.tsx, region-head.tsx, fold-seam.tsx pairs with a focus-visible or group-focus-visible variant; row-wash gates on :hover, :focus-within together.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"refs": ["apps/designer-portal/src/app/globals.css:339-342", "apps/designer-portal/src/components/document/doc-spine.tsx:52"]},
  "severity": "low", "confidence": 0.85,
  "already_ruled": null,
  "suggested_fix": "No fix needed — record as a constraint a lens must keep true, not a defect.",
  "hesitation_seconds_estimate": 0 }
```

```json
{ "id": "U5-19", "lens": "U5", "persona": null, "task_ids": ["T4","T9"],
  "key": "doc|all|all|muted-ramp-floor-headroom-narrow",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "off",
  "title": "Muted ramp's lightest step has narrow headroom before 4.5:1 fails",
  "observation": "#65594E measures 5.32:1 on rail stock #E8E3DB (floor is 4.5:1) — computed relative luminance 0.1046 against a floor of 0.1327; room for roughly one more small step, not a new tint family.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": {"refs": ["apps/designer-portal/src/app/globals.css"]},
  "severity": "medium", "confidence": 0.9,
  "already_ruled": null,
  "suggested_fix": "Any new 'condensed, quieter ink' text state must not go lighter than ~#65594E's luminance on rail stock unless restricted to large/bold text (3:1 floor, L<=0.224).",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U5-20", "lens": "U5", "persona": null, "task_ids": ["T16"],
  "key": "doc|390|all|mobile-sheet-dialog-no-accessible-name",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "off",
  "title": "Sections/margin/drawer mobile sheets have role=dialog but no name",
  "observation": "mobile-sheets.tsx:260 sets aria-label only when kind==='timer' (compactTimer); the 'drawer', 'spine' and 'margin-item' sheet kinds render role=\"dialog\" aria-modal=\"true\" with aria-label={undefined}.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"shots": ["m390-mobile-spine-sheet.png"], "refs": ["apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:182,259-261"]},
  "severity": "high", "confidence": 0.9,
  "already_ruled": null,
  "suggested_fix": "Give every Sheet kind a real aria-label (e.g. 'Sections', 'Margin item', 'Studio actions'), not only the timer.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U5-21", "lens": "U5", "persona": null, "task_ids": ["T16"],
  "key": "doc|390|all|mobile-sheet-no-visible-close-control",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "off",
  "title": "Mobile sheets have no visible, Tab-reachable close button",
  "observation": "The Dismiss button (mobile-sheets.tsx:263-269) is the full-screen backdrop with tabIndex={-1} — not in the Tab order; the only Tab-reachable close path is the Escape key, with no on-screen close icon inside the panel itself.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"shots": ["m390-mobile-spine-sheet.png"], "refs": ["apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:263-269"]},
  "severity": "low", "confidence": 0.7,
  "already_ruled": null,
  "suggested_fix": "Not a WCAG failure (Escape works), but a visible close affordance would help a keyboard-attached mobile user who doesn't know the Escape convention applies here.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U5-22", "lens": "U5", "persona": null, "task_ids": ["T3","T9"],
  "key": "doc|1440|top|header-stack-810px-before-first-region",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "off",
  "title": "First region head sits ~810px down — a full screen of Tab stops first",
  "observation": "First-region-head y at 1440 measures 1005px (rich, s0) per research/12-layout-measurements.md; a keyboard user Tab-walking must traverse the entire letterhead+ticket+guide+instruments stack before reaching Approvals.",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 900,
  "evidence": {"shots": ["w1440-rich-s0.png"], "refs": ["artifacts/document-lens-proposal-2026-08-28/research/12-layout-measurements.md"]},
  "severity": "medium", "confidence": 0.75,
  "already_ruled": null,
  "suggested_fix": "A skip-to-region landmark shortcut (beyond the existing SkipToPaper) would let keyboard users bypass the header stack the way a mouse-scroll already can.",
  "hesitation_seconds_estimate": 45 }
```

```json
{ "id": "U5-23", "lens": "U5", "persona": null, "task_ids": ["T3","T9"],
  "key": "doc|390|top|proposal-doc-has-no-region-landmarks",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "top", "flag": "off",
  "title": "A proposal-stage document exposes zero region landmarks at all",
  "observation": "The prework (proposal) document renders zero [data-region-head]/[data-index-region] elements anywhere (confirmed via DOM query, research/12); \"On this paper\" running index is entirely absent on the spine for this doc type.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": {"shots": ["w1440-prework-s0.png"], "refs": ["artifacts/document-lens-proposal-2026-08-28/research/12-layout-measurements.md"]},
  "severity": "medium", "confidence": 0.8,
  "already_ruled": null,
  "suggested_fix": "A lens's navigator needs its own honest empty/degraded state for pre-project documents, not silence.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U5-24", "lens": "U5", "persona": null, "task_ids": ["T4","T9"],
  "key": "doc|all|all|rich-seed-thin-understates-spine-density",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "off",
  "title": "Thin seed (3 FF&E lines, 0 rooms) understates real crowding/reach cost",
  "observation": "The rich rung carries 3 FF&E lines and 0 rooms; a 60-line real schedule would multiply the number of focusable rows, room groups, and margin items a keyboard/SR user must traverse well beyond what these measurements show.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": {"refs": ["artifacts/document-lens-proposal-2026-08-28/research/12-layout-measurements.md"]},
  "severity": "medium", "confidence": 0.85,
  "already_ruled": null,
  "suggested_fix": "Any Tab-order/landmark-jump cost measured here should be treated as a floor; re-test reach cost against a realistic 40-60 line project before shipping a lens.",
  "hesitation_seconds_estimate": 20 }
```

---

## (4) What stays true

1. **No hover-only affordance exists today in the spine, margin, or ticket** — every scored-ink
   underline and the ink-pool wash pair `hover:` with `focus-visible:`/`focus-within:`. A lens must
   preserve this pairing on every new interactive surface it adds.
2. **Touch target sizing is disciplined on the desktop-adjacent chrome** — the studio drawer, the
   mobile bar's three zones, and the 56px compact spine rail's *interactive* controls are all
   engineered to `min-h-11`/`min-w-11` (44px), even where the visual column is far narrower. Do not
   let a condensing lens shrink these below that floor to buy back px.
3. **The unfold path's focus contract is correct and should be the template, not the fold path's**
   — `focusRegionHeading` lands focus exactly on the region's own `<h2>` when a reader opens it. A
   lens's own condense/expand cycle should copy this, not the fold path's silent drop to `<body>`.
4. **The muted-ramp tokens (`#4E4339`/`#5A4E43`/`#65594E`) all clear 4.5:1 against both paper and
   rail today** with real, if narrowing, headroom — this is not a contrast defect to fix, it is a
   budget to respect when adding a new de-emphasized tint.
5. **The seam-consumer mechanism already reads a live CSS custom property, not a hardcoded number**
   — a lens making the seam's height dynamic extends a pattern that already exists in four call
   sites rather than inventing one.
6. **`--elevation-sheet` stays at exactly its three sites (D4/R126)** — nothing in this seat's
   findings asks for new depth cues on the spine, margin, or ticket; keep it that way.
