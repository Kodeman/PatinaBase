# 03 — Interactive probe (PR1)

Program: The Smart Lens proposal (`document-lens-proposal-2026-08-28`). Behavioural evidence
for the rich project document (Chen Residence, `de922823-d1b9-491a-8ad5-99e8e4f013c5`, from
`research/state-ladder.json`'s `rungs.rich`) — measured, not just screenshotted. Harness:
`probe/interactive-probe.mjs`; raw numbers: `probe/results.json`. Driven by Playwright/Chromium
against the already-running local dev server; no app code touched, no git.

Sign-in: designer@patina.dev, ported from `e2e/fixtures/auth.ts`. `@playwright/test` resolved by
symlinking `apps/designer-portal/node_modules` into `probe/` (same convention the
document-life-directions program used) since the script lives under `artifacts/`, not under
`apps/designer-portal`, and Node's ESM resolver walks up from the importing file's own path, not
the process cwd.

---

## 1. Ticket fold/pin

**Numbers.** Unfolded (8-row) height at scrollY=0: **347.25px**. Pin and fold both flip at
**scrollY=280px** — in the *same* render (source-confirmed: `unfolded = fold ?? (!pinned &&
!seamAtRest)`, so `pinned` and `unfolded` cannot disagree for one animation frame). At that single
40px scroll step, the first region head's document-space Y jumped by **‑283.19px** — almost
exactly the ticket's own height loss (347.25 − 64.06 ≈ 283.19px). Height-sampled every ~17ms for
400ms starting the instant `pinned` flipped true: **23 samples, every one reads exactly
64.0625px** — no interpolation at any point. Clicking **Unfold** while pinned: `--doc-seam-height`
goes from `64px` to `""` (cleared) and the first region head's Y jumps from 442.125 → 725.3125
(**+283.19px**, the same magnitude in reverse) — again a single-frame jump, not a tween.

**Narration.** The ticket's fold is a hard React-state swap between the 8-row and 2-line forms,
with **no animation whatsoever** — no CSS transition on height, no interpolated frames in either
direction. Because the ticket is `position: sticky` and still reserves its own box in normal flow,
collapsing it removes ~283px of vertical space from the document in one commit, and everything
below (the letterhead's tail, the first region head) leaps up by that exact amount within the same
40px scroll step that crossed the pin threshold. Scrolling further, past that one step, is
perfectly smooth; the discontinuity is confined to the single step where the IntersectionObserver
fires. Unfolding while pinned reverses the same jump by the same magnitude, again instantly. A
reader scrolling steadily at this exact point will see the paper "flinch" upward by roughly
280px with no easing to soften it — a real, measurable layout jump, not a rendering artifact of
the probe's 40px sampling grid (the jump is *larger* than one scroll step).

**Evidence:** `01-ticket-at-pin.png` (scrollY=280, the pin threshold), `02-ticket-pinned-folded.png`
(collapsed 2-line seam, sticky), `03-ticket-pinned-unfolded.png` (pinned but manually re-expanded
via the Unfold control).

---

## 2. Scroll-spy

**Numbers.** Four running-index entries (Client approvals → Schedule → Pieces → Money), 77 steps
of 40px each end to end. Three `aria-current` transitions recorded: approvals→schedule at
scrollY=**400**, schedule→pieces at scrollY=**1200**, pieces→money at scrollY=**1960**. Clicking
each of the 4 running-index entries in turn: **zero flicker** — the immediate read (50ms after
click) already shows exactly one `aria-current="true"` at the clicked entry and it is unchanged
750ms later (past the documented 700ms jump lock); no intermediate entry is ever seen `true`.

**Narration.** The reading band (source: `useDocumentRunningIndex`, `rootMargin: '-20% 0px -62%
0px'`) makes the line commit to a new region well before that region's own head reaches the
viewport top — the approvals→schedule flip at scrollY=400 happens while the *first unfolded*
region head on the page still sits partway down the viewport, not at y=0, i.e. the line leads the
reader's eye rather than trailing it. (Caveat: the per-step `firstRegionHeadY` this harness logged
is the topmost `[data-region-head]` anywhere in the DOM at that instant, not necessarily the head
of the region that just became current — several regions on this document start folded by default,
see §3, so this number is a rough position signal, not a per-transition head measurement; the
scrollY and label-change columns are exact.) The click path is unambiguous and matches the source
exactly: `jump()` sets `lockRef` before the smooth scroll starts, so the line snaps straight to the
target and holds through the full 700ms lock with no walk-through of the regions the scroll
animation passes over.

**Evidence:** `05-scroll-spy-mid.png` (captured at the first transition, scrollY=400).

---

## 3. Region fold (Money region)

**Numbers.** Money region (`[data-region-head="money-head"]`, body `#money-region-body`, FoldSeam
`[data-fold-seam="money-region-heading"]`): focus started on a real control inside the body
("Sync from the schedule"). After **Fold**: `#money-region-body` confirmed `null` (unmounted);
`document.activeElement` is **`<body>`** — focus was **not** preserved or redirected anywhere.
Seam height **49.5px**, seam text **"Money · no budget yet · $0 authorized · unfold ↓"** (the
region's own one-line status, reused verbatim as the fold summary). After clicking the seam to
unfold: focus lands exactly on **`<h2 id="money-region-heading">`** ("Money") — the documented
`focusRegionHeading` contract, confirmed working.

**Narration.** Region fold is asymmetric on focus. *Unfolding* is disciplined: the seam unmounts
and the caller explicitly parks focus on the region's own heading, so a keyboard/screen-reader user
who just opened the region lands exactly where they'd expect. *Folding* has no equivalent — when
the body a control lived in unmounts, focus falls through to `<body>` with no redirect (RegionHead's
`onFold` prop is a bare state setter; nothing calls `.focus()` on the newly-rendered Fold button or
the seam). That's a real gap: a keyboard user who folds a region loses their place on the page
entirely and has to re-locate it via Tab from the top of `<body>`. Distinguishing the folded seam
from an "empty region" state by computed style could not be confirmed: no italic empty-state `<p>`
was present inside any `[data-index-region]` root at the point of the check on this document (an
italic name span *is* present per source — `FoldSeam`'s `name` gets `.italic`; the style probe read
computed style off the outer `[data-fold-seam]` button element, which does not itself carry
`font-style: italic` — the italic lives on the inner `name` span — so this comparison did not land
a real answer and is left open). One incidental, useful finding from the pre-fold state: on this
document, **Client approvals, the nested "Schedule dates" rule sub-widget, and Care band all start
folded by default**, while FF&E and Money start unfolded — relevant context for anyone reasoning
about §1/§2's "first region head" measurements.

**Evidence:** `06-region-folded.png`.

---

## 4. Esc chain and ⌘K

**Numbers.** Escape at rest (nothing else focused, no dialog open): navigated `doc/<id>` →
`/desk` — confirmed "put down." ⌘K dialog opens (`role="dialog"[aria-label="Command bar"]`); its
results list's computed `max-height` is **468px** — exactly Tailwind's `max-h-[52vh]` at a 900px
viewport (52% × 900 = 468), which is the *plain results* mode's cap, not the 60vh "asking" mode's.
Typing "money" surfaced an **Accounts** ledger result and a **"Ask about 'money'"** row under an
"ASK & PLACE" group. Escape closes the dialog (confirmed gone) and focus returned to what it was
before (`<body>` → `<body>`).

**Narration.** The put-down Escape and the ⌘K Escape are two independent handlers that don't
collide: at rest Escape puts the whole document down; with the palette open, Escape closes only
the palette (the page's own listener explicitly skips when `[role="dialog"]` exists). Typing
"money" resolves to both a direct room/ledger hit (Accounts) and a natural-language "ask" fallback
in the same result set, so the query is treated as both a keyword and a question in parallel.
**Caveat:** the "focus returned to prior" check is weak evidence here — nothing had DOM focus
before ⌘K was opened in this run (the harness had just re-derived the page after the Escape-at-rest
navigation), so `<body>` → `<body>` doesn't demonstrate a real focus-trap return; a stronger check
would open ⌘K from a specific focused control and verify it by name. The bounding rect captured for
the dialog is the full-viewport `role="dialog"` wrapper (`fixed inset-0`), not the visible palette
card — the actual visible panel is `w-[min(560px,92vw)]` positioned `pt-[12vh]` from the top, per
source; not re-measured directly.

**Evidence:** `07-cmdk-open.png`.

---

## 5. Hover wash

**Numbers (normal motion).** Sampled `.has-wash .row-wash` (an FF&E line) every ~17ms for 400ms
from `pointermove`. `clip-path` circle radius: 0% at t=0 → 56% at t=34ms → 87% at t=50ms → 122% at
t=84ms → **plateaus at 150% by t≈271–288ms** and holds flat through t=409ms. Background stayed
constant throughout: `rgba(196, 165, 123, 0.16)` (the clay wash). **Reduced motion:** a single
post-hover sample read `clip-path: circle(0px at 450px 38.75px)`, `background:
rgba(196, 165, 123, 0.12)` (the documented three-quarter-alpha "-still" tint), `transition: none`.

**Narration.** The sweep is a clip-path circle growing from the pointer's entry point, easing to
its 150%-radius (fully-covering) end state in roughly 200–290ms — consistent with the CSS's
declared `transition: clip-path 200ms var(--ease-editorial)` (the visible completion runs a touch
past the nominal 200ms because the easing curve approaches its asymptote gradually rather than
stopping sharply). The background colour itself never animates — only the reveal shape does, per
source. The reduced-motion background value (`rgba(...,0.12)`) is exactly the documented
three-quarter-alpha still tint, confirming that half of the contract. The clip-path reading
(`circle(0px ...)`, not the expected `none`) is a discrepancy against source
(`.has-wash:hover .row-wash { clip-path: none; }` under `prefers-reduced-motion: reduce`) that this
probe cannot resolve with confidence: a single sample was taken 50ms after a synthetic
`page.mouse.move`, and it is not certain that Chromium's `:hover` pseudo-class was actually engaged
by that synthetic move (CDP-driven hover doesn't always register the way a real OS pointer does).
Flagging as **unresolved** rather than asserting a bug — a repeat with a real pointer or a longer
settle window would be needed to confirm.

---

## 6. Margin at 1280

**Numbers.** `[data-margin-trigger]` visible at 1280×900 (the 1180–1439 compact tier). Clicking it
opens a sheet at `{x:920, y:0, width:360, height:900}` — full height, right-flush, `width:360px`,
which is exactly `min(360px, calc(100vw − 56px))` = `min(360, 1224)` = 360 at this width.
`data-margin-mode="sheet"` (not "rail", correctly — full-rail mode requires ≥1440). First region
head's Y: **1005.3125 before and after** opening the sheet — **no reflow**. Escape closes the panel
and returns focus to the trigger button (confirmed both).

**Narration.** At 1280px the margin behaves exactly as documented: an overlay sheet, not a layout
column — opening and closing it does not reflow the document canvas underneath (the region-head
Y is bit-for-bit identical), and Escape/focus-return both work as specified in `margin-rail.tsx`'s
`returnFocusTarget?.focus()` contract.

**Evidence:** `08-margin-sheet-1280.png`.

---

## 7. Mobile 390

**Numbers.** Mobile bar (`[data-testid="mobile-bar"]`) rect: `{x:0, y:767.1, width:390,
height:76.9}` — unchanged before and after the sheet opens and closes. Sections sheet
(`[data-mobile-sheet-kind="spine"]`) opens full-viewport (`{0,0,390,844}`) with **12 `<li>`
rows**. `document.body`'s computed `overflow`: `"hidden auto"` before/after, **`"hidden"`** (both
axes) while the sheet is open — confirmed scroll lock. `--doc-shell-bottom-inset` (read off
`.document-route-shell`, not `:root` — the variable is scoped there, not globally): `max(64px,
calc(52px + env(safe-area-inset-bottom)))`, which resolves to **64px** with no safe-area inset in
this emulated device.

**Narration.** The Sections sheet does lock body scroll while open (confirmed via computed
`overflow`, not just presence of a scrim) and releases it cleanly on close, with the mobile bar's
own geometry completely undisturbed by the sheet's open/close cycle (identical rect before and
after). The 12-row count spans the document's top-level sections plus a "Rooms" jump-row group
(per `mobile-sheets.tsx` source, the spine sheet renders `sections` then a `Rooms` heading and each
room as its own row) — not broken down further here.

**Evidence:** `09-mobile-sections-sheet.png`.

---

## 8. CLS

**Both totals, normal and reduced motion:**

- **Normal motion CLS total: 0.1286** (20 layout-shift entries observed across the scripted 0→foot
  scroll at 1440×900).
- **Reduced motion CLS total: 0.1318** (8 entries).

Both totals land in the Core Web Vitals "needs improvement" band (0.1–0.25) and are within ~2.5%
of each other. In both passes, one single shift accounts for essentially the whole score:
**value 0.1189**, attributed to three co-shifting sources — a `"Workflow stage / Band / Schedule…"`
div, a terracotta "Needs attention · in one place… Invoice…" section, and the "Schedule dates…
unfold ↓… No active phase ha[s started]" section. This shift fires late (startTime ≈3.3–3.6s into
the session) — well after first paint — consistent with an async data fetch resolving and
re-rendering the Schedule area's "needs attention" banner and its no-active-phase copy once the
scroll has reached it. The next two shifts in each pass are an order of magnitude smaller
(0.001–0.008) and touch the same Schedule-area neighbourhood (or, in reduced motion, the
approvals/margin content once).

**Narration.** `prefers-reduced-motion: reduce` does **not** meaningfully change this document's
CLS profile — the dominant shift is a **data-arrival** reflow (a query resolving into the Schedule
region's attention banner), not an animation or transition, so disabling motion doesn't suppress
it. The ticket fold/unfold jump measured in §1 (~283px, well over a full row height) does **not**
show up as a counted layout-shift entry here — worth flagging as a gap in coverage: `position:
sticky` height changes that occur above the fold can, depending on browser heuristics, be excluded
from `layout-shift` scoring (e.g. if the element or its container is treated as "expected" via
recent-input heuristics, or the shifted region falls outside what the API attributes), so §1's jump
is a real, separately-observed defect that this CLS number does not capture or credit.

---

## 9. Timer / presence

**Numbers.** t=0: presence **"Just you · visible to the studio"**, timer **"under a min"**.
t=65s (real wall-clock wait): presence **unchanged**, timer **"1 min"**.

**Narration.** The spine timer is a live clock, not a static readout — it advanced from "under a
min" to "1 min" over the 65-second real-time wait with no page interaction, confirming
`elapsedSeconds` ticks forward continuously while the document is open. The presence line did not
change (expected — no second studio member joined during the probe). This document's fixture data
already had a project "in hand" (`heldProjectId` truthy) at the start of the run, so `[data-full-
spine-timer]` was present without any manual "start timer" step on this harness's part.

---

## Caveats — what could not be exercised, and why

- **§3 empty-state comparison** — no italic empty-state `<p>` was present inside any
  `[data-index-region]` root at the time of the check on this document/scroll position, so the
  fold seam could not be directly style-diffed against a genuine empty-region state. Separately,
  the seam's computed style was read off the outer `[data-fold-seam]` button (not italic by
  source), not the inner `name` span (which *is* `.italic` per `fold-seam.tsx`) — so this
  sub-check did not land a conclusive answer either way and should be re-run against the specific
  child span if this matters to the review.
- **§4 focus-return strength** — the "focus returned to prior" assertion for ⌘K is true but weak:
  nothing had real DOM focus immediately before ⌘K was opened in this run's sequencing (it followed
  the Esc-at-rest test, which had just navigated away and back). A stronger check (open ⌘K from a
  named, focused control) was not run here.
- **§5 reduced-motion clip-path** — the single reduced-motion hover sample read
  `clip-path: circle(0px ...)` rather than the source's documented `none`; this may be a real
  finding or may be an artifact of synthetic (CDP) pointer hover not fully engaging `:hover` in
  headless Chromium. Not resolved with confidence; flagged rather than asserted either way.
- **§8 CLS vs. §1's ticket jump** — the ~283px ticket-fold jump measured directly in §1 is not
  reflected as a counted `layout-shift` entry in the PerformanceObserver totals for either motion
  pass. This is noted as a coverage gap in the CLS metric itself, not evidence that the jump didn't
  happen (§1's own before/after DOM measurements independently confirm it did).
- **§2 `firstRegionHeadY` precision** — per-transition head-Y values logged during the scroll pass
  track the *topmost unfolded* `[data-region-head]` anywhere on the page at that instant, not
  necessarily the head of the region that just became `aria-current`. Several regions on this
  document start folded by default (see §3), so this column is directional context, not a precise
  per-region measurement; scrollY and the entry-label transition itself are exact.
- All nine numbered items were otherwise fully exercised end-to-end with no environment failures;
  the dev server, Supabase local stack, and the three retained services were already running and
  were not booted, restarted, or killed by this probe.

## Commands run unsandboxed (PR1)

Logged verbatim in `research/00-env-and-ids.md` under "Commands run unsandboxed (PR1)":
`cd apps/designer-portal && node ../../artifacts/document-lens-proposal-2026-08-28/probe/interactive-probe.mjs`
(and its `a3`/`c`-scoped re-runs used while fixing the Money-region seam-selector bug in §3 and the
`--doc-shell-bottom-inset` scope bug in §7).
