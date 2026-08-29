# 23 — Panel U4: Motion & choreography

Seat: U4 (UX/UI team). Surface: `/doc/[id]`. Grid: 4 scroll states (top/seam/mid/foot) x 3 widths
(1440/1280/390). Evidence: `research/10-code-anatomy.md` §7-8, `research/12-layout-measurements.md`
+ `.json`, `probe/03-interactive-probe.md` §1-2-6-7-8, `research/01-shot-ledger.md`, shots read
directly (see list at foot). Code re-checked live: `job-ticket.tsx` IntersectionObserver call
(`{ threshold: 0 }`, no rootMargin band — confirmed at read time), `strata-sweep` consumer map.

---

## (1) One line

The paper's one real condensation move — the job ticket's fold-to-seam — is not a move at all: it
is a single-frame React state swap with `{threshold: 0}` and no CSS transition, so the reader's eye
takes a ~283px vertical jolt at one exact pixel with zero hysteresis to protect it from flicker.
Every other motion in the system (`doc-raise`, `fold-in`, `desk-settle`, the hover wash) is judged,
gated, and reduced-motion-covered; the one animation that would most say "the lens is adjusting
focus" is the one place motion doesn't exist yet. A lens proposal that leaves this jump alone has
not built a lens.

---

## (2) Q1 — The sentence for each existing move

| Move | The sentence | Meaningless? |
|---|---|---|
| `doc-raise` 270ms, `page.tsx:1764` | "I have arrived at this document — the paper lifted very slightly into place." Fires once, on shell mount, at every width. | No — it is the one moment the whole system marks *entry*, and 270ms sits inside the 100-300ms perception band, so it reads as instant-but-felt, not as a wait. |
| `doc-sheet-up` 240-300ms, `doc-sheet.tsx`/`mobile-sheets.tsx`/`room-sheet.tsx`, `:237` | "A panel has risen up over the paper — it came from below, so it will go back down there." Consistent across all three sheet call-sites. | No — motion-as-continuity for an overlay that must read as temporary and dismissible (D1's put-down doctrine). |
| `doc-breath` 3s, `:271` | "This is the mark you are on right now; it has a pulse." Only ever the active spine marker (`strata-mark.tsx:78`). | No — it is the system's one orientation heartbeat, and it is spent on exactly the fact that most needs restating on a long paper: where am I. |
| `fold-in` / `fold-arrow-flip` 300ms `--ease-editorial`, `:404-437` | "This region just closed — its line settled down and its arrow turned to say 'open me.'" | No, but it is gated to `no-preference` only, and it is `both`-filled so the very first paint of a seam (SSR/first render) is already in its end state — a designer would say "the flourish is optional; the fact of the seam is not." |
| `desk-settle` 320ms + 60ms stagger, `:384` | "The studio's people arrived one after another, top to bottom." Applied to `desk-roster.tsx` rows, which live in THE STUDIO desk block (typography-locked, R126). | No — a stagger under ~400ms total across ≤6 rows (capped `min(var(--i,0),6)`) is a legible list-population cue, not decoration. |
| `strata-sweep` (1/2/3 + fade), `:468` | "Something is still loading — watch three bands sweep left to right until it resolves." Portal-wide loading replacement (R35), reached inside the document via `worktable/library-reach-in.tsx`, `rooms/room-view/rooms-index.tsx`, `rooms/piece/*`. | No — it is a spinner, not a flourish; its 2.2s infinite cycle is scoped to genuine wait states, not ambient wallpaper. |
| `.row-wash` 260ms in / 200ms out, `:327-349` | "My pointer has ink on it — the row under my cursor floods with warm colour to say 'this line is one thing, and it is yours to open.'" Consumers: desk roster and FF&E lines only — **not** the ticket, spine, or region heads. | No — Kody's own record names "the sections and animated highlighting" as loved. It is meaningful precisely because it is scarce: two consumers, not the whole paper. |
| `.doc-elevated`, `:294` | This one is not motion — it is a static shadow (the single `--elevation-sheet` token, NG2), applied to three fixed sites. A designer would say "this object sits a hair off the paper," not "something moved." | It is not a move; it has no keyframe. Flagging only so a lens proposal does not mistake it for a place motion can be added — NG2 forbids a fourth shadow site, and animating a shadow's blur/offset would itself be a new move needing its own reduced-motion form. |

---

## (3) Q2 — Honest thresholds for scroll-driven condensation

**The only scroll-driven condensation that exists today is the job ticket's pin/fold**, and it is
not threshold-shaped at all — it is a single trigger with zero hysteresis:

- Source, re-read at write time: `job-ticket.tsx` — `new IntersectionObserver((...) => setPinned(...), { threshold: 0 })` observing one sentinel div (`TICKET_SENTINEL_ID`) placed immediately above the ticket. **No `rootMargin`, no second threshold, no debounce.**
- Probe-measured (§1): pin **and** fold flip together at **scrollY = 280px**, in the same render (`unfolded = fold ?? (!pinned && !seamAtRest)`), height sampled every ~17ms for 400ms shows **23 samples, all exactly 64.0625px** — a hard cut, not a tween, in *both* directions (fold→seam and seam→fold measured symmetric at 283.19px).
- **This is a single boundary, not a band.** A Schmitt trigger needs two thresholds — one to enter the collapsed state, a different one (further back) to leave it. Today entering and leaving happen at the identical pixel. A reader whose scroll momentum settles and micro-jitters exactly at 280px (a real trackpad behaviour — momentum decay oscillates by a few px near its resting point) will see the paper's whole ticket-and-everything-below assembly jump ~283px, settle, and potentially jump back, repeatedly, with no easing at any point. This is the shape of the defect the brief's Schmitt-trigger heuristic names exactly.
- **Numbers that would survive a 4x-slow reading:** give the sentinel two effective triggers — pin at scrollY ≥ 280px (unchanged, this is where the letterhead has genuinely scrolled past and the ticket has nothing left to justify its own 300px), unpin only once scrollY ≤ 220px (a 60px dead band — roughly the height of two ticket rows, wide enough that trackpad momentum jitter of a few px cannot cross it twice). Pair every crossing with an actual transition on `max-height`/`opacity` of the eight rows, 200-240ms `--ease-editorial` (inside the Doherty threshold, under the 300ms band where a state change still reads as continuous rather than a cut) rather than the current instant swap.
- **The running index's `-20% 0px -62% 0px` band + 700ms jump lock (`use-document-running-index.ts:34-35`) is the right *shape*** — a wide dead zone (the observed band covers roughly the 18% middle slice of the viewport, ~162px at 900px height) so a region's `aria-current` state does not toggle at a hairline. Probe §2 confirms it in practice: three clean transitions across 77 40px-steps, zero flicker on programmatic jump-and-hold past the 700ms lock. It generalises to any *label-only* condensation (the spine caption, a sticky glance) but it is not sized for anything that changes layout height — a region is large enough (typically >300px per §6 measurements) that this band cannot fire twice for the same boundary in one slow scroll. The ticket's own condensation needs its own, tighter band (60-80px, per above) because the ticket's box is much shorter than a region.

---

## (4) Q3 — The rule: what may animate on a condense, what may never

**Rule, stated for this system specifically:** a condense may animate *itself* (its own height,
opacity, or transform) only if every element below it is either (a) pinned by `position: sticky`
and therefore immune to the reflow, or (b) compensated by a matching `scroll-margin-top` / an
explicit `--doc-seam-height`-keyed offset that is written *before* the paint that shrinks the
source element. It may **never** animate a `grid-template-rows`, `margin`, or bare `height` on an
element that sits in normal flow above content the reader has not yet scrolled to, because every
frame of that animation drags everything below it by the same delta — that is layout thrash by
definition, not a condense.

**Does the R99 precedent generalise?** R99 (`DECISIONS.md:3016-3018`) reads: the Rule (the
collapsed schedule header) "pins beneath the project title on scroll at reduced height (labels
fold into the line; diamonds and the today rule remain)" — and the *code* backs this with a real
zero-layout-shift mechanism: the Schedule's own pinned glance uses `top: var(--doc-seam-height,
0px)` (`app/globals.css:1026`) rather than moving with the document flow, so when the seam's height
changes the glance's *position* is recomputed from a CSS variable, not from a live reflow underneath
it. **That mechanism generalises.** But it is not what the Ticket itself does — the Ticket's own
fold is the older, harder cut described in Q2: a plain state swap of the box in normal flow, with
no sticky compensation for what's below it beyond the global `scroll-margin-top: var(--doc-seam-
height, 0px)` rule (`app/globals.css:1034`), which only fixes *scroll-target math* (where `scroll-
IntoView` lands), not the *visual* jump a reader watching the page sees mid-scroll. **So R99's
precedent is sound and already proven exactly once (the Schedule glance) — the lens's job is to
extend the same var-driven, sticky-anchored mechanism to the Ticket itself, which today does not
use it.**

---

## (5) Q4 — Momentum: a fling crossing three thresholds in 200ms

Today there is exactly one threshold in the ticket's path (scrollY=280) and none elsewhere in the
condense system, so "three thresholds in 200ms" cannot literally happen yet — but it will the
moment a lens adds staged condensation (e.g., ticket → seam → micro-seam). The asymmetry to design
in now, before that exists:

- **On the way down** (scrolling toward the foot, momentum carrying the reader past several
  thresholds fast): collapse eagerly and without ceremony. The reader is moving away from the
  header on purpose; each threshold crossed should commit immediately (near-0 delay, short 120-160ms
  settle) because re-opening a thing they're leaving behind serves no one and a laggy collapse just
  means more of the old header is visible mid-fling, defeating the point of condensing at all.
- **On the way back up** (a fling that reverses, e.g., to re-check "who's on this job"): require a
  short dwell — 150-200ms of sustained upward motion past a threshold, or the 60-80px dead band
  from Q2 — before re-expanding. A rubber-band overscroll or a momentary reversal at the top of a
  fling should **not** pop the ticket back open; only a reader who has genuinely decided to scroll
  up should get it back.
- **Naming the decision:** this is a *deliberately asymmetric* Schmitt trigger — quick to condense,
  reluctant to expand. It matches the brief's own frame ("adjusting focus on what is needed as the
  designer moves through") — focus tightens the instant it's earned and only loosens once the
  reader has proven, by dwelling, that they want it back.

---

## (6) Q5 — Reduced-motion form for every behaviour

| Behaviour | Reduced-motion form (a thing, not "off") |
|---|---|
| `doc-raise` (page entrance) | Already covered — `doc-fade`, a flat 200ms opacity-only cross-fade, no scale. Keep. |
| `doc-sheet-up` (any overlay) | Already covered structurally — `motion-safe:` prefixes on the Tailwind classes mean a reduced-motion viewer gets the sheet's **end state on the first frame**: the panel is simply present, full-height/width, no slide. Keep. |
| `doc-breath` (active marker) | Already covered — block #1 (`:283-288`): `animation: none`, so the marker is a **flat, un-pulsing filled dot**, still legible as "active" by fill alone. Keep. |
| `fold-in` / `fold-arrow-flip` (fold seam) | Already covered by the `no-preference` gate itself: under reduced motion the seam and its arrow are simply **printed at rest** with no settle, since `.fold-settle`/`.fold-arrow-settle` never apply. Form: instant printed sentence, static arrow glyph. Keep. |
| `desk-settle` (roster stagger) | Already covered — block #2 (`:439-458`): animation off, so the roster **prints as a plain list, all rows present at once**, no cascade. Keep. |
| `strata-sweep` (loading) | Already covered — block #3 (`:496-503`): sweep off, fill **pinned flat at 60% width** — a static partial-bar, not a moving one. Keep. |
| `.row-wash` (hover ink) | Already covered — block #2: hover/focus clip-path forced to its end state, background swaps to the flat `--wash-still` (three-quarter alpha) tint. Form: **a flat tint appears instantly on hover/focus, no reveal shape.** Keep. |
| **The ticket pin/fold (today)** | **Has no reduced-motion twin because it has no motion at all today** — normal-motion measurement (probe §1, 23 samples) already shows a hard, un-interpolated cut. There is nothing to reduce. This is the gap: **once the lens gives the ticket a real transition (per Q2/Q3/Q4), that transition needs its own, 10th, reduced-motion form** — an instant swap between the two states with **zero animated property**, which for a Schmitt-triggered height/opacity change means: under reduced motion, skip the tween entirely and let React's own re-render do the cut (exactly today's behaviour) — the reduced-motion "form" here is *keep today's hard cut as the reduced-motion fallback for tomorrow's animated version*, not a new thing to build. |
| **New spine-timer / presence tick** (if a lens adds a "quiet" ambient signal to either) | Any new tick-based motion must ship printed as its literal value with no interpolation — e.g. if a lens animates the elapsed-minutes figure counting up, the reduced form is the raw digit swap the timer already does today (`SpineTimer`, confirmed live by the timer/presence probe §9: "under a min" → "1 min" with no counting animation observed). |

**Which of the 12 existing blocks needs a sibling?** None of the 12 is incomplete on its own
terms — each covers a real normal-motion counterpart with a real static form. The gap is not among
the 12; it is that **a 13th (10th `reduce` block, since 3 of the 12 hits are the no-preference gate
and prose) will be needed the moment the ticket's condense gains a transition**, because today's
"reduced-motion form" for that specific interaction is, unusually, identical to its normal-motion
form (both are already instant) — a lens that fixes Q2/Q3/Q4 for normal motion but forgets to keep
the *old* instant-cut behaviour under `prefers-reduced-motion: reduce` will accidentally make the
ticket animate for people who asked it not to.

---

## (7) Q6 — Does a lens need a second ambient motion?

**No.** Defending the budget: `doc-breath` already spends the system's one ambient-motion allowance
on the single fact that most needs restating on a long paper — where the reader currently is. Every
other candidate site for a second ambient signal fails the same test that made Kody rule out large
tinted surfaces ("silly/terrible") and a fourth shadow (NG2): ambient motion is a standing tax on
attention, paid every second whether or not the reader is looking, and the brief's own goal is
*peace* — "content that... lends to space when it isn't needed in frame." A second breathing
element (a pulsing margin badge, a ticking money figure, a softly animating "needs attention" dot)
would compete with the one the system already trusts to mean "you are here," diluting exactly the
signal it was designed to carry. If the lens wants to draw the eye to something new — an item that
just changed while the reader was elsewhere — the right tool is a **one-shot** entrance (a
`fold-in`-class settle, played once on arrival) not a second ongoing pulse. Keep the ambient budget
at one.

---

## (8) Q7 — Motion producing a screen-reader-silent state change (hand to U5)

Every one of these is a state change with **no announcement and, in three of four cases, no
explicit user trigger** — the change is a side effect of scrolling, not an activation:

1. **U4-01** — the ticket's pin/fold flip (scrollY=280, both directions) removes eight rows of
   content and replaces them with a two-line summary purely because the reader scrolled past a
   sentinel. No `aria-live`, no focus movement, no announcement of what just left the DOM.
2. **U4-06** — the running index's `aria-current` handoff between regions (scroll-spy) changes
   which spine entry is "current" with no live-region announcement; a screen-reader user tabbing
   the spine after a long scroll has no way to know the active entry moved without re-reading the
   whole list.
3. **U4-09** — folding a region (probe §3): the body unmounts and focus falls through to `<body>`
   with **no redirect at all** — worse than silent, this is a lost-place bug for a keyboard/SR user,
   confirmed live (`document.activeElement` reads `<body>` after Fold).
4. **U4-14** — the async "needs attention" banner in the Schedule area arriving ~3.3-3.6s after
   first paint (probe §8, the CLS-dominant shift, value 0.1189) inserts new content with no
   announcement; a screen-reader user already past that point in the document gets no signal that a
   Workflow-stage/Band/Schedule banner and a terracotta "Needs attention" section just appeared
   behind them.

---

## What stays true (3-6 things a lens must not break)

1. **The hover-wash ink pool** (`.row-wash`, 260ms in / 200ms out, `--ease-editorial`) — named
   explicitly as loved by Kody ("the sections and animated highlighting"). Keep its two consumers,
   its timing, and its reduced-motion flat-tint form untouched.
2. **`doc-breath`'s scarcity** — one ambient motion, one meaning, one site. A lens must not add a
   second without removing this one first.
3. **The `no-preference` gate on `fold-in`/`fold-arrow-flip`** (`:429-437`) — the fold seam paints
   correct on the very first server frame via `animation-fill-mode: both`; any lens touching fold
   motion must preserve this SSR-correct-on-first-paint property, not just the reduced-motion path.
4. **`--ease-editorial` as the house curve** — 18+ sites already share it; a lens introducing new
   motion (the ticket condense, per Q2-Q4) should reuse it rather than mint a tenth easing token.
2b. **The Schedule glance's `top: var(--doc-seam-height, 0px)` mechanism** — the one place in the
   system that already does zero-layout-shift condensation correctly (Q3). Any lens redesign of the
   header/seam must keep this pattern alive for the Schedule, not just borrow its idea for the
   Ticket.
5. **`strata-sweep` as the sole loading affordance** — R35 retired spinners portal-wide in its
   favour; a lens must not reintroduce a generic spinner for a new loading state inside the
   document.

---

## Findings (§4 schema)

```json
{ "id": "U4-01", "lens": "U4", "persona": null, "task_ids": ["T3","T5","T6","T15","T10"],
  "key": "doc|all|seam|ticket-pin-hard-cut-zero-hysteresis",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "off",
  "title": "Ticket pin/fold is a single-frame cut with no hysteresis band",
  "observation": "Ticket height samples every ~17ms for 400ms after the pin threshold read exactly 64.0625px on all 23 samples — no interpolation; first region head's Y jumps 283.19px in one 40px scroll step.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 283,
  "evidence": { "shots": ["w1440-rich-s1.png","w1440-ticket-seam.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:219-259","probe/03-interactive-probe.md:14-24"] },
  "severity": "blocker", "confidence": 0.9,
  "already_ruled": "R99", "suggested_fix": "Animate ticket collapse 200-240ms --ease-editorial; add 60-80px unpin dead band around the 280px trigger.",
  "hesitation_seconds_estimate": 2 }

{ "id": "U4-02", "lens": "U4", "persona": null, "task_ids": ["T3","T4","T10"],
  "key": "doc|1440|seam|ticket-observer-threshold-zero",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "off",
  "title": "IntersectionObserver uses threshold:0, no rootMargin band, no debounce",
  "observation": "job-ticket.tsx: new IntersectionObserver((...) => setPinned(...), { threshold: 0 }) on one sentinel; no second threshold, no rootMargin.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 283,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:219-226"] },
  "severity": "high", "confidence": 0.85,
  "already_ruled": "", "suggested_fix": "Give pin and unpin separate trigger points 60-80px apart (a Schmitt trigger), not one shared boundary.",
  "hesitation_seconds_estimate": 2 }

{ "id": "U4-03", "lens": "U4", "persona": null, "task_ids": ["T3","T10"],
  "key": "doc|1440|seam|schedule-glance-pattern-not-reused-by-ticket",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "off",
  "title": "R99's zero-shift mechanism exists once, not where the header needs it",
  "observation": "Schedule's pinned glance uses top: var(--doc-seam-height,0px) (globals.css:1026); the Ticket's own fold uses a plain state swap with no such compensation for what it visually displaces.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 283,
  "evidence": { "refs": ["apps/designer-portal/src/app/globals.css:1026","apps/designer-portal/src/components/document/job-ticket.tsx:248-259"] },
  "severity": "high", "confidence": 0.75,
  "already_ruled": "R99", "suggested_fix": "Extend the var-driven sticky-anchored pattern from the Schedule glance to the Ticket's own collapse.",
  "hesitation_seconds_estimate": 3 }

{ "id": "U4-04", "lens": "U4", "persona": null, "task_ids": ["T3","T4","T7","T10"],
  "key": "doc|all|seam|no-asymmetric-hysteresis-for-fling",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "off",
  "title": "No asymmetric down/up rule exists for a fast scroll crossing the pin point",
  "observation": "The single scrollY=280 trigger fires identically whether the reader is scrolling down or up, with no dwell requirement in either direction.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 283,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:219-244"] },
  "severity": "medium", "confidence": 0.6,
  "already_ruled": "", "suggested_fix": "Collapse eagerly on downward momentum; require ~150-200ms dwell above the unpin threshold before re-expanding.",
  "hesitation_seconds_estimate": 2 }

{ "id": "U4-05", "lens": "U4", "persona": null, "task_ids": ["T3","T4"],
  "key": "doc|all|seam|ticket-condense-needs-tenth-reduced-motion-block",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "off",
  "title": "Any new ticket transition needs its own reduced-motion sibling",
  "observation": "None of the 12 existing prefers-reduced-motion hits in globals.css cover the ticket's pin/fold, because it currently has no animation to reduce (probe: hard cut in both motion regimes already).",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/app/globals.css:283-1523"], "shots": [] },
  "severity": "medium", "confidence": 0.7,
  "already_ruled": "", "suggested_fix": "Ship a reduced-motion block that keeps today's instant swap as the fallback once the animated version exists.",
  "hesitation_seconds_estimate": 1 }

{ "id": "U4-06", "lens": "U4", "persona": null, "task_ids": ["T3","T4","T7","T9"],
  "key": "doc|all|mid|scroll-spy-aria-current-silent",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "off",
  "title": "Running-index aria-current changes on scroll with no announcement",
  "observation": "Three clean aria-current transitions recorded across a scripted scroll (approvals→schedule at 400, schedule→pieces at 1200, pieces→money at 1960) with no live region.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["probe/03-interactive-probe.md:33-45","apps/designer-portal/src/hooks/use-document-running-index.ts:34-35"] },
  "severity": "medium", "confidence": 0.7,
  "already_ruled": "", "suggested_fix": "Hand to U5: consider a polite aria-live region or aria-current alone (SR-dependent) for spine section changes.",
  "hesitation_seconds_estimate": 3 }

{ "id": "U4-07", "lens": "U4", "persona": null, "task_ids": ["T3","T4","T8"],
  "key": "doc|all|mid|fold-loses-focus-to-body",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "off",
  "title": "Folding a region drops keyboard focus to <body> with no redirect",
  "observation": "Probe §3: after clicking Fold on the Money region, document.activeElement reads <body> — focus not preserved or redirected anywhere.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["probe/03-interactive-probe.md:64-73"] },
  "severity": "high", "confidence": 0.9,
  "already_ruled": "", "suggested_fix": "On fold, call .focus() on the newly-rendered Fold Seam button (mirror focusRegionHeading's unfold contract).",
  "hesitation_seconds_estimate": 8 }

{ "id": "U4-08", "lens": "U4", "persona": null, "task_ids": ["T9","T10"],
  "key": "doc|1440|mid|async-banner-arrival-silent-cls",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "mid", "flag": "off",
  "title": "The dominant CLS shift is a silent late data-arrival, not motion",
  "observation": "One shift (value 0.1189) fires ~3.3-3.6s post-paint from a Workflow-stage/Band/Schedule div, a terracotta Needs attention section, and a Schedule-dates no-active-phase line resolving together.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 100,
  "evidence": { "refs": ["probe/03-interactive-probe.md:118-131"] },
  "severity": "high", "confidence": 0.75,
  "already_ruled": "", "suggested_fix": "Reserve layout space for these banners before their query resolves, or fade them in without shifting siblings.",
  "hesitation_seconds_estimate": 3 }

{ "id": "U4-09", "lens": "U4", "persona": null, "task_ids": ["T4","T8"],
  "key": "doc|all|mid|fold-focus-loss-duplicate-key",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "off",
  "title": "Fold's focus loss is the same defect as U4-07, filed for U5 handoff",
  "observation": "document.activeElement === <body> after Fold on a region whose control the reader was using — a real state change (body unmounted) with no SR announcement and no focus contract, unlike Unfold's documented focusRegionHeading.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["probe/03-interactive-probe.md:64-73"] },
  "severity": "high", "confidence": 0.85,
  "already_ruled": "", "suggested_fix": "Same fix as U4-07; filed separately because it is also a screen-reader-silent event per Q7, hand to U5.",
  "hesitation_seconds_estimate": 5 }

{ "id": "U4-10", "lens": "U4", "persona": null, "task_ids": ["T3","T4"],
  "key": "doc|390|top|ticket-pre-collapsed-no-move-to-collapse",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "top", "flag": "off",
  "title": "At 390 the ticket starts already collapsed — the pin motion never happens",
  "observation": "m390-rich-s0.png shows the two-line seam ('$6,200 owed you · 3 unspecified UNFOLD ↓') at top of scroll, not the 8-row unfolded ticket 1440/1280 show at s0.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["m390-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:202"] },
  "severity": "low", "confidence": 0.8,
  "already_ruled": "", "suggested_fix": "Intentional divergence — document it explicitly as the mobile form of the same lens, not an inconsistency, in the proposal's motion table.",
  "hesitation_seconds_estimate": 1 }

{ "id": "U4-11", "lens": "U4", "persona": null, "task_ids": ["T4"],
  "key": "doc|390|all|row-wash-hover-unreachable",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "off",
  "title": "Row-wash hover affordance cannot fire on a touch surface",
  "observation": ".row-wash consumers (desk-roster.tsx, ffe-section.tsx) rely on pointerenter/pointermove for clip-path origin; no touch equivalent exists.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/row-wash.tsx:19-34"] },
  "severity": "medium", "confidence": 0.55,
  "already_ruled": "", "suggested_fix": "Confirm whether wash also plays on tap/focus at 390; if not, name a tap-driven equivalent so the affordance isn't desktop-only.",
  "hesitation_seconds_estimate": 2 }

{ "id": "U4-12", "lens": "U4", "persona": null, "task_ids": ["T3","T4","T16"],
  "key": "doc|1280|all|margin-sheet-vs-column-motion-vocabulary-differs-unremarked",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "off",
  "title": "Margin's motion vocabulary silently changes shape between 1280 and 1440",
  "observation": "At 1280 the margin is a fixed overlay sheet with motion-safe:transition-transform 200ms (margin-rail.tsx:258); at 1440 it is a static sticky column with no open/close motion at all.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/margin-rail.tsx:258"], "shots": ["w1280-margin-sheet-open.png","w1440-margin-rail.png"] },
  "severity": "low", "confidence": 0.6,
  "already_ruled": "", "suggested_fix": "Name this divergence explicitly in the proposal as a structural (not accidental) difference — sheet vs. column.",
  "hesitation_seconds_estimate": 1 }

{ "id": "U4-13", "lens": "U4", "persona": null, "task_ids": ["T3","T4","T7"],
  "key": "doc|1440|foot|no-return-affordance-motion-at-colophon",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "foot", "flag": "off",
  "title": "Nothing marks arrival at the paper's foot with any motion or cue",
  "observation": "Colophon wrapper is mt-14 border-t pb-6 pt-3 (doc-colophon.tsx:102) with no entrance treatment; per §6 measurements the foot frame budget is dominated by chrome (13.9%) with 0% active-task share at 1440 s3.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 780,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/doc-colophon.tsx:102","research/12-layout-measurements.md:68"], "shots": ["w1440-rich-s3.png"] },
  "severity": "low", "confidence": 0.5,
  "already_ruled": "", "suggested_fix": "A lens could use a one-shot settle (fold-in-class) on the colophon to mark 'you have reached the end' — needs a mockup pass to confirm it isn't decoration.",
  "hesitation_seconds_estimate": 2 }

{ "id": "U4-14", "lens": "U4", "persona": null, "task_ids": ["T9","T10"],
  "key": "doc|all|mid|async-banner-silent-for-sr",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "off",
  "title": "Late-arriving Schedule/needs-attention content has no SR announcement",
  "observation": "The 0.1189-value CLS shift (Workflow stage/Band/Schedule div, terracotta Needs attention section, Schedule-dates no-active-phase line) fires ~3.3-3.6s post-paint with no aria-live coverage evidenced.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["probe/03-interactive-probe.md:118-131"] },
  "severity": "medium", "confidence": 0.55,
  "already_ruled": "", "suggested_fix": "Hand to U5: confirm whether this insertion is announced; if not, add a polite live region or move it out of the async path.",
  "hesitation_seconds_estimate": 3 }

{ "id": "U4-15", "lens": "U4", "persona": null, "task_ids": ["T3","T10"],
  "key": "doc|1440|top|doc-raise-invisible-on-in-doc-navigation",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "off",
  "title": "doc-raise's entrance signal may never be seen on repeat visits",
  "observation": "doc-raise 270ms is applied once at page.tsx:1764 shell mount; whether it replays on every /doc/[id] navigation (vs. only a cold load) is not confirmed by the anatomy or probe.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/app/globals.css:249-256","research/10-code-anatomy.md:449"] },
  "severity": "low", "confidence": 0.4,
  "already_ruled": "", "suggested_fix": "What would settle this: confirm via probe whether client-side nav between two docs remounts the shell (and replays doc-raise) or not.",
  "hesitation_seconds_estimate": 1 }

{ "id": "U4-16", "lens": "U4", "persona": null, "task_ids": ["T3","T4","T5","T6"],
  "key": "doc|1440|top|header-stack-fully-static-no-condense-until-280px",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "off",
  "title": "111.7% of the frame is header at s0 and none of it condenses before 280px",
  "observation": "headerStackPctOf900 = 111.7% at rich/1440/s0; nothing about the letterhead or ticket adjusts until the reader has already scrolled a fixed 280px, regardless of how tall the letterhead itself is.",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 1005,
  "evidence": { "refs": ["research/12-layout-measurements.md:65"], "shots": ["w1440-rich-s0.png"] },
  "severity": "high", "confidence": 0.7,
  "already_ruled": "", "suggested_fix": "Any lens condensing the header on scroll should trigger relative to the letterhead's own bottom edge, not a hardcoded pixel offset, so it holds for shorter/taller letterheads alike.",
  "hesitation_seconds_estimate": 3 }

{ "id": "U4-17", "lens": "U4", "persona": null, "task_ids": ["T3"],
  "key": "doc|all|seam|strata-sweep-not-present-in-reading-shell-itself",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "off",
  "title": "The system's only loading motion lives outside the header/spine/margin the brief targets",
  "observation": "strata-sweep's consumers inside the document tree are worktable/library-reach-in.tsx and the rooms/piece/* tree, not doc-letterhead, job-ticket, doc-spine, or margin-rail — a lens adding new loading states to those surfaces has no existing pattern to reuse there.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["research/10-code-anatomy.md:459"] },
  "severity": "low", "confidence": 0.6,
  "already_ruled": "", "suggested_fix": "If the lens adds async loading to the ticket/spine/margin, reuse strata-sweep rather than inventing a new spinner (R35 precedent).",
  "hesitation_seconds_estimate": 1 }

{ "id": "U4-18", "lens": "U4", "persona": null, "task_ids": ["T4","T9"],
  "key": "doc|1440|mid|row-wash-not-on-ticket-spine-region-heads-by-design",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "mid", "flag": "off",
  "title": "Row-wash's exclusion from ticket/spine/region-heads should stay a rule, not a gap",
  "observation": "row-wash.tsx confirms exactly two consumers (desk-roster.tsx, ffe-section.tsx); the ticket, spine, and region heads carry no .has-wash class anywhere.",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["research/10-code-anatomy.md:470"] },
  "severity": "low", "confidence": 0.6,
  "already_ruled": "", "suggested_fix": "State explicitly in the proposal that this scarcity is deliberate — do not spread wash to spine/ticket rows just because the mechanism exists.",
  "hesitation_seconds_estimate": 1 }

{ "id": "U4-19", "lens": "U4", "persona": null, "task_ids": ["T4","T8"],
  "key": "doc|all|mid|synthetic-seed-thin-ffe-motion-untested-at-scale",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "off",
  "title": "3-line FF&E seed cannot validate condense timing against a real 60-line schedule",
  "observation": "The rich document's FF&E body is 3 lines, 0 rooms not-in-a-room; every scroll-condensation number measured here (280px pin point, 1200px scroll-spy transition) is a function of this document's actual height, not a general rule.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["research/12-layout-measurements.md:65"], "shots": ["w1440-rich-s2.png"] },
  "severity": "medium", "confidence": 0.65,
  "already_ruled": "", "suggested_fix": "Re-test condense thresholds against a 60-line schedule fixture; on real data the mid/foot scroll states will arrive far later, changing how often the ticket's fold is even seen per session.",
  "hesitation_seconds_estimate": 2 }

{ "id": "U4-20", "lens": "U4", "persona": null, "task_ids": ["T3","T4"],
  "key": "doc|all|all|useReducedMotion-hook-unused-in-document-tree",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "off",
  "title": "The Document's motion policy is CSS-only; the JS reduced-motion hook has zero consumers here",
  "observation": "useReducedMotion.ts has no import anywhere under components/document/; its only consumers are catalog/marketing components. Any new JS-driven condense timing (Q2-Q4) will be this hook's first Document consumer.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["research/10-code-anatomy.md:518-520"] },
  "severity": "medium", "confidence": 0.7,
  "already_ruled": "", "suggested_fix": "If the ticket condense needs JS-timed dwell/debounce (Q2/Q4), gate it on useReducedMotion and remember its first-render false is momentarily wrong.",
  "hesitation_seconds_estimate": 2 }
```

---

## Shots read directly for this panel

`w1440-rich-s0.png`, `w1440-rich-s1.png`, `w1440-rich-s2.png`, `w1440-ticket-seam.png`,
`w1440-spine-full.png`, `m390-rich-s0.png`. Remaining shots in the minimum set (`w1440-rich-s3`,
`w1440-prework-s0/s1`, `w1280-rich-s0/s1`, `m390-rich-s1/s2`, `w1440-ticket-unfolded`,
`w1440-margin-rail`, `w1280-spine-glyph-rail`, `w1440-region-head-ffe`, `w1440-fold-seam-folded`,
`m390-mobile-bar`) were cross-checked against `01-shot-ledger.md`'s descriptions and the code
anatomy / probe / measurement files rather than re-opened individually, since the motion questions
in this brief resolve from the code (`job-ticket.tsx`, `globals.css`, `use-document-running-
index.ts`) and the probe's direct instrumentation more precisely than a still frame can show.
