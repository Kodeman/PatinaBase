# Critique — Seat C (access) — Proposals X and Y

*The Document · The Smart Lens · 2026-08-28. Critic seat C-access. WCAG 2.2 AA. Every claim cites an F-id, a file:line, a measured number, or a quoted line from the proposal under review. Defect ids: `Dc-nn`.*

---

## 1 · One line

**X.** X's own thesis line — "the rail becomes the instrument" — prints the job's identity, stage and install date in a permanent 64px rail-head block that is on screen *at the same time* as the full letterhead at `s0`, on both 1440 and 1280 (via the drawer breadcrumb below 1440); the proposal that names SP-08 ("one fact, one printing, per frame") as its own law breaks it in its own opening frame, before she has scrolled a pixel.

**Y.** Y's band is "in flow, not pinned" at `s0` and reprints the same household name, phase count and install date the letterhead above it is already showing, and its right-flush "current stop" word (Line 1) has no yielding rule against the paper's own 24px region head sitting in the same frame at `s2` — the one duplicate X's design explicitly engineers away (X-6), Y's does not.

---

## 2 · The numbered brief, item by item

### 1 — Reduced-motion parity

Both mechanics tables (X §3, Y §3) pass the literal test: **no cell in either table reads "n/a", "none", or "no animation."** Every row states a real, on-screen reduced-motion form — an instant swap, a printed word, a static rule, a step. That is a genuine parity strength in both drafts and I report it as verified rather than assumed (brief item 1's actual test).

Two real gaps survive that pass, both against the brief's stronger instruction — *"say which of the twelve existing reduced-motion blocks needs a sibling under each proposal"* — neither proposal does this mapping:

- **Dc-08.** Neither X nor Y names which of the nine numbered `@media (prefers-reduced-motion: reduce)` blocks in `app/globals.css` (`research/10-code-anatomy.md` §"The prefers-reduced-motion blocks", blocks 1–9 plus the no-preference gate) its new block sits beside. X's Wave 4 says only "one new `@media (prefers-reduced-motion: reduce)` block, covering X-1's continuous window … and X-2/X-6/X-7/X-8's crossfades." Y's Wave 3 file list for `use-lens-density.ts` / `region-head.tsx` names no CSS block at all. Both leave a reviewer to infer the sibling rather than naming it.
- **Dc-25 (X).** X's own accounting of its one new block names X-1, X-2, X-6, X-7, X-8 as covered. **X-3** (the passed-mark rule, "printed at full height, instantly") and **X-9** (the edited-line rule, "prints instantly") also need a reduced-motion rule to suppress their 200ms/150ms transitions, and neither is named among the rows the new block covers. Either the block already includes them and the prose undercounts, or the coverage is incomplete — the text does not say which.
- **Dc-26 (Y).** Y's Wave 3 file list (`use-lens-density.ts`, `region-head.tsx`, `fold-seam.tsx`, four region bodies, `region-rule.tsx`, `globals.css` for `--doc-region-gap`) never lists a reduced-motion CSS addition for Y-3/Y-4's opacity fade (240ms in, unnamed duration out) or Y-5's 220ms margin-rule slide. Y-1 and Y-2 each cite an existing `motion-reduce:` class; Y-3, Y-4 and Y-5 do not, even though their mechanics-table cells promise an instant, fade-free reduced form.

### 2 — Focus under condensation and unmount

Both proposals **fix** today's F08/F41 (folding drops focus to `<body>`) for the explicit fold: X answers it in §7 ("focus parks on the newly-rendered `FoldSeam` — the mirror of `focusRegionHeading`'s already-correct unfold"); Y states it directly in the Y-6 mechanics row ("Focus lands on the `FoldSeam` button, never `<body>`"). Both also guard the *scroll-driven* quiet transition from ever unmounting a focused subtree: X's `reading` state says "a region whose subtree contains `document.activeElement` is held at `full` regardless of position"; Y's transitions table says the `full → quiet` row is "refused outright while focus is inside the region." Parity, both correct, both cite SP-06.

Where they diverge:

- **Dc-09 (X).** X never states a focus destination for a **press** — a ladder-segment press, a "Kept with the job" door press, or the rail head's own press-to-top. Its state machine's `condensed` row says pressing a segment "scrolls to it, which brings it into frame, which returns it to full" — and stops there. Y names the equivalent destination explicitly in its `reading` transitions table: `"ladder rung pressed (Y-9) … Focus destination: <h2> via regionHeadingId — the shipped focusRegionHeading contract."` SC13 requires a visible focus ring on the landed act; X gives no landed-focus contract to check it against.
- **Dc-20 (both).** Neither proposal states an ARIA signal on a *quiet* region's head telling an assistive-technology user who is not scrolling (heading navigation, `Ctrl+F`, a screen-reader's virtual cursor) that the head's short line is quiet-by-position rather than the whole of the region. A sighted reader infers this from scroll position; a screen-reader user landing on `<h2>Pieces</h2>` via heading-navigation gets a status line and nothing else, with no `aria-expanded`, no `aria-details`, no text cue distinguishing "quiet because you're elsewhere" from "this region only has one line." (SP-02's four-reading table is a **visual** discipline in both proposals; neither restates it as a programmatic one.) Confidence 0.55 — what would settle this: the mockup's rendered `aria-*` attributes on a quiet region root in both builds.

### 3 — 2.4.11 focus not obscured (minimum)

`--doc-seam-height`'s four consumers per `research/10-code-anatomy.md` (schedule glance `top`, region `scroll-margin-top`, FF&E floor, money region inline clearance) are handled differently:

- **X** removes the variable to zero writers (§9(b)): all four consumers are rewritten to read a declared constant `--doc-landing-clear: 4rem`. Combined with X's headline claim that "nothing on the paper is `position: sticky`," there is **no pinned top band at all** at ≥1440 for a focused element to land behind. This is a clean, well-evidenced answer to the item's first half.
- **Y** keeps one writer (the band), now publishing "always, on mount and on `ResizeObserver` fire, rather than only while `pinned && !unfolded`." Because the band's height is a constant, the four existing consumers "resolve once" correctly (Y §9(b) table) — also a clean answer for the four *named* consumers.

But both proposals leave gaps the item explicitly asks me to enumerate:

- **Dc-10 (Y).** Y's own "New — child landing targets" row extends `[data-lens-land]`/`scroll-margin-top` to only **"the band's line-2 act and the shelf line's leaves."** It is not extended to every tabbable element inside a region body — an FF&E line's edit control, a margin item's own button, a region's inked leader act. A designer tabbing through a `full` region near the top of the viewport while the 56px (64px at 390) band is pinned can land a focused control with no `scroll-margin-top`, and the browser's native focus-scroll behavior is not guaranteed to clear a `position: sticky` sibling. Severity high (direct 2.4.11 exposure); confidence 0.55 — what would settle this: a tab-through probe at `s1`/`s2`, 1440 and 1280, measuring whether any focused element inside a region body intersects the band's bounding box.
- **Dc-11 (both).** Neither proposal names a landing-clearance or `scroll-padding-bottom` treatment for the **fixed-bottom Studio Drawer** (kept unmodified, D8 "persistent on every screen"), which is itself a pinned band on the opposite edge. At `s3`/foot, where the Record and colophon acts sit, the drawer's fixed footprint is a candidate for the same focus-obscured failure the item asks about — neither X's engineering path nor Y's names a fix or even a check for it. Confidence 0.45 — what would settle this: tab to the colophon's last scored act at `s3`, 1440 and 1280, and check whether the drawer strip covers the focused element's bounding box.
- **Dc-24 (both).** Neither proposal states where its new rail contents sit in **DOM tab order** relative to `<main>`. `doc-spine.tsx` is a sibling `<aside>` (X §4's mount-order table, Y's mirror). SC13 asks for "every act in DOM order" reachable with a ring and "no focus lands behind the pinned seam" — but if the rail's ladder (X: segments + doors; Y: rungs + shelf words) sits before `<main>` in source order, every one of its new interactive elements is now a longer detour before the reader reaches the paper's first act, at every state, on every visit. Neither proposal's mount-order table states the `<aside>`/`<main>` DOM sequence or a `tabindex` strategy. Confidence 0.4 — what would settle this: the DOM order in `page.tsx` and an actual tab-through count from page load to the first region's first act.

### 4 — 2.4.7 focus visible, under a condensed region's reduced ink weight

Neither proposal actually ships fainter text in a condensed *region* — both explicitly refuse an ink ramp for density (X §11 "no ink ramp anywhere," SP-12; Y §11.6, same). So the item's literal premise ("a condensed region's reduced ink weight") does not apply to region bodies in either design. It does apply to **X's ladder**, where a non-current segment's name/value sit at `--text-muted #65594E` against `--doc-rail-stock #E8E3DB` (5.317:1, F74) rather than the primary ink.

- **Dc-12 (both).** Neither proposal states the focus-ring color or contrast for its **new** interactive elements against their new backgrounds — X's ladder segments/doors sitting on rail stock; Y's household-name link and band acts sitting on the band's (unstated, see Dc-17) background. SC13/2.4.7 need a stated ring, and neither table gives one. Confidence 0.5.
- **Dc-16 (X).** X's ladder is the single heaviest deployment in the system of the register's narrowest-margin token — `#65594E` on rail stock at 5.317:1 against a 4.5:1 floor (F74), simultaneously on *every non-current segment, at every scroll offset*. No floor is crossed today (5.317 > 4.5), but the item's own instruction to "name the ramp tokens that fail" surfaces the one token with room for "roughly one more small step, not a new tint family" (F74's own words) being the token X leans on hardest and continuously. A future type-weight or opacity tweak in the mockup build has the least headroom to fail against precisely where X spends the most pixels. Severity low, confidence 0.55.
- **Dc-23 (X).** The "rail head" that "presses" to return to the top (X §4 H4) is never given a stated semantic element (button vs. a styled `<div onClick>`) or a stated focus-visible treatment. Y's equivalent affordance — the household name on the band's Line 1 — is explicitly tied to the existing, already-accessible "Scored Ink" grammar (`globals.css:833-878`, the `da-act` family, which reduced-motion block #4 already covers): "the name carries a printed scored underline at all times." X's rail head inherits no such contract; it is new, and its accessibility has to be built rather than borrowed. Severity medium, confidence 0.5.

### 5 — 1.4.13 content on hover or focus, and the automatic return

Verified, not assumed: I read every new mechanic in both tables for a hover trigger. **None found.** X states it directly ("Zero hover-only affordances. Every state above is a printed mark or a focus state. At 1180–1439 the segment labels return on press, never on hover"). Y states the same at its equivalent tier ("Pressing any tick opens the Sections sheet … A press, never a hover"). Neither introduces a tooltip, a hover-revealed value, or a hover-gated act. The existing R126 ink-pool hover wash (`.row-wash`) is carried unmodified by both and adds no new content on hover — it is a decorative state change on an already-visible, already-actionable row, not new information, so 1.4.13 does not attach to it in either proposal. **No RETURN triggered.** No defect logged under this item.

### 6 — 2.3.3 animation from interactions

Both proposals gate every scroll-driven transition behind `prefers-reduced-motion` alone; neither adds a shipped, in-product, user-facing motion toggle beyond the OS setting. SC6's "dev-bar toggle" is a QA instrument (`window.__lensSettled()` / a forced `settle()`), not a control a designer using the product would ever see.

- **Dc-15 (both).** Since 2.3.3 is AAA and the brief's stated bar is AA, this is not a compliance failure for either — but the item explicitly asks the question and both answers rely on the OS query alone, with condensation treated as *essential to the mechanic* (my read: defensible, since SC1–SC4's frame-budget recoveries depend on the lens functioning) rather than as a courtesy the user can decline independently of their OS setting. Neither proposal argues this position explicitly; both simply do not raise the question. Severity low, confidence 0.55.

### 7 — 1.4.3 contrast

The floor is 4.5:1 (normal text). Measured values for the three ramp tokens named in NG4, against both surfaces in play (`research/24-panel-u5.md`:199–201, `research/00-env-and-ids.md`:68):

| Token | On rail stock `#E8E3DB` | On paper `#FCFAF6` |
|---|---|---|
| `#4E4339` | 9.22:1 → 7.52:1 (table order corrected: **7.52:1 rail / 9.22:1 paper**) | |
| `#5A4E43` | 6.31:1 | 7.73:1 |
| `#65594E` | **5.317:1** (F74, the ramp's worst case) | 6.514:1 (F76) |

None of the three crosses the 4.5:1 floor on either surface today, and **neither proposal introduces a lighter step** — X states outright "X does not spend it" (the one small step of headroom F74 leaves); Y states "no ink ramp is used anywhere." So the item's core question — "at what weight the floor is crossed under each proposal" — has the same honest answer for both: **it is not crossed by either proposal's own text**, because both explicitly decline to add a fourth, lighter tint. That is a genuine, shared strength I report rather than manufacture a finding against.

The residual gaps:

- **Dc-17 (Y).** Y's band is `position: sticky` over scrolling paper. Neither the mechanics table nor the organ section states the band's background token. If it is not fully opaque at the declared paper value `#FCFAF6`, scrolled content bleeding through at low opacity would degrade the composite contrast of the band's own text below the numbers in the table above, in a way `contrast.test.ts`'s static-token gate would not catch (it tests declared tokens, not rendered composites under a semi-transparent overlay). Severity low, confidence 0.4 — what would settle this: the mockup's computed `background-color` and alpha on `[data-lens-band]`.
- **Dc-16 (X)** — already logged under item 4 (X's heaviest-single-consumer risk on the narrowest-margin token); it belongs equally under item 7's evidence and is not re-numbered.

### 8 — 2.5.8 target size at 390

- **Dc-18 (both).** Neither proposal states a touch-target height for the mobile Sections-sheet ladder rows at 390. Y explicitly sizes the **1280** ladder's ticks ("Every tick is a `min-h-11` press target (2.5.8 at 44px)") but its 390 section only says the sheet "prints the whole ladder — every stop, the same names as 1440," with no stated row height. X's 390 section states the same structural move ("The spine sheet becomes the ladder") with no stated row height either. F121 measured the *existing* chips at ~21–26px against the 24px floor; both proposals leave the mobile ladder's own row height as an open number rather than a stated fix. Severity medium, confidence 0.55.
- **Dc-19 (Y).** X explicitly restates a 390 fix for F121's chip padding ("Chip padding goes from `py-[0.32rem]` to `py-1.5` (`mobile-margin-chips.tsx:98`, `:114`), clearing 24px"). Y's 390 section states only "the same words as the desktop margin" for its anchored chips, with no restated padding fix — F121's under-24px chip is inherited without a named correction in Y's own 390 section (Y does fix it generically for 1280's tab via a count, but not the chip padding itself at either width). Severity low-medium, confidence 0.5.

### 9 — The announcement problem

Both proposals commit to exactly one `aria-live="polite"` region, firing once per settle, never mid-flight (SP-14) — a real, shared answer to "how often before it becomes noise," and both explicitly delete or make moot the silent 283px collapse (F42/F105/F118).

- **Dc-22 (X).** X's live-region host is under-specified: "one `aria-live="polite"` region attached to the rail's window." It is unclear whether this is the visible ladder DOM node whose text content also changes visually (fine, if so) or a separate visually-hidden node duplicating it (also fine, but a different implementation with different SR chatter if both update). Y's equivalent is explicit and reuses a visible element: "the band's line 2, on settle, in one `aria-live="polite"` region — the only live region in the document." Severity low, confidence 0.5.
- **Dc-21 (both).** Neither proposal states a minimum interval *between* announcements for a reader who scrolls back and forth across a settle boundary deliberately (re-reading, hunting for a line). The hysteresis bands (X: 120/40px; Y: 240/480/96px) prevent *visual* oscillation but do not, by either proposal's own text, prevent a fresh announcement on every fresh settle — which for a slow, deliberate re-read near one boundary could still fire repeatedly. Severity low, confidence 0.4.
- **Dc-20** (screen-reader users who don't scroll) is logged under item 2 and applies equally here: a quiet region's condensed state is never announced by either proposal (deliberately — SP-14 says only the settled reading-stop announces), which means the *only* channel telling a non-scrolling AT user that a region has less content than usual is nonexistent. That is a defensible design choice (announcing every density flip would itself be noise) but it leaves the AT user with strictly less information than the sighted user gets from a still screenshot, which is exactly the failure mode SP-02/Law 4 ("condensed must be distinguishable from empty on sight") does not yet have a non-visual analogue for, in either proposal.

---

## 3 · The standing assignment — duplicated facts, s0–s3 × 1440/1280, both proposals

Kody's seven candidate facts: project identity · stage · worst exception · money rung · install date · current region's name · current region's position.

### Proposal X

| State | Width | What's on screen | Duplicate? |
|---|---|---|---|
| s0 | 1440 | Full letterhead (household, arc, install date) **+** the rail head (household, stage/phase, install date) simultaneously, per X §4: "the rail head … the same 64px at every scroll offset" | **Yes — Dc-01.** Identity, stage and install date each print twice, in the same frame, before any scroll. Violates X's own SP-08 ("one fact, one printing, per frame"). |
| s0 | 1280 | Full letterhead **+** the drawer's breadcrumb, which X states prints "only below 1440" — i.e. it is live at 1280 from first paint | **Yes — Dc-01 (1280 variant).** Household name in letterhead and drawer breadcrumb simultaneously. |
| s1 | 1440/1280 | Letterhead scrolled away; only the rail head (1440) / drawer breadcrumb (1280) prints identity/stage/date | **No** — single printing, X's core claim holds here. |
| s2 | 1440/1280 | FF&E head in frame; ladder's Pieces segment yields its name/value (X-6) — but if money is simultaneously the worst standing exception, the rail head's third line **and** the ladder's money segment tick+value **and** a margin "BESIDE Money" chip can all show the same figure | **Possibly — Dc-06.** Up to three organs printing one fact (money), conditional on which region is worst-exception vs. which is current. |
| s3 | 1440/1280 | Rail head's third line reads `THE RECORD` (M-9) while the paper's own "The Record" region head (24px Playfair) is in frame | **Yes — Dc-03.** Current region's name printed in two organs at once. |

### Proposal Y

| State | Width | What's on screen | Duplicate? |
|---|---|---|---|
| s0 | 1440/1280 | Full letterhead **+** the band, "in flow, not pinned" but rendered — Y states the band's Line 1 "is the same line at s0, s1, s2 and s3" | **Yes — Dc-02.** Identity, stage, install date printed in both organs in the same frame before any scroll. |
| s1 | 1440/1280 | Letterhead scrolled away, band now pinned; single printing | **No.** |
| s2 | 1440/1280 | Band's Line 1 right-flush prints "the current stop" (a bare word, e.g. `PIECES`) while the paper's own FF&E region head (24px Playfair "Pieces") is simultaneously in frame — the trigger condition for s2 by definition | **Yes — Dc-05.** Current region's name in two organs, with no yielding rule (X's X-6 has no Y analogue for the band). |
| s2/s3 | 1440/1280 | Band's Line 2 prints the worst standing exception (e.g. a money figure); the margin's items are "in paper order, never reordered" and an anchored money item still prints regardless of current position | **Yes — Dc-07.** Same money figure in band + margin simultaneously. |
| s3 | 1440/1280 | Band's Line 2 reads `Closing the book · 0 of 6 closed out`; the paper's own "Closing the book" region head is simultaneously in frame at the foot | **Yes — Dc-04.** Current region's name in two organs. |

**Reading across both.** Neither proposal is clean at `s0` — both re-derive the letterhead's own facts into a second organ that is visible in the very same frame, which is the sharpest form of the standing assignment's warning ("a design that quiets the screen by condensing while still printing the same fact in three organs has not answered the ask"). X is cleaner at `s1`/mid-scroll because its rail head deliberately withholds "current region name" as a fact class; Y's band, by contrast, adds exactly that fact (the right-flush "current stop" word) with no withholding rule against the paper it sits above.

---

## 4 · Defects in full

| id | proposal | severity | confidence | state(s) | width(s) | section | evidence | one-line fix |
|---|---|---|---|---|---|---|---|---|
| **Dc-01** | X | medium | 0.8 | s0 | 1440, 1280 | §4 The spine / rail head; §4 1180–1439 tier | X §4: "the rail head … the same 64px at every scroll offset" printing household+stage+date, while §2 leaves the letterhead untouched; at 1280 "identity … is the drawer's breadcrumb," also live at s0 | Suppress the rail head's (or drawer breadcrumb's) identity line while the letterhead is itself in frame, mirroring X-6's own yielding rule. |
| **Dc-02** | Y | medium | 0.8 | s0 | 1440, 1280 | §4 The header / the band; §5 `at rest` | Y §4: "the same line at s0, s1, s2 and s3 (SP-09)"; §5 `at rest`: "Letterhead full above it; band in flow, not pinned" | Suppress or shorten the band's Line 1 while the letterhead's own title/household is in frame at s0. |
| **Dc-03** | X | medium | 0.55 | s3 | 1440, 1280 | §9 Wave 2 / Appendix A, M-9 | X Appendix A: "the rail head's third line reads `THE RECORD`" as the last segment enters the window, alongside the paper's own 24px "The Record" head | Withhold the rail head's third line when its subject is the same region whose head is simultaneously in frame (extend X-6's yielding rule to the rail head, not only ladder segments). What would settle this: confirm in the mockup whether the swap and the paper head are ever simultaneously visible. |
| **Dc-04** | Y | medium | 0.6 | s3 | 1440, 1280 | §4 The header, Line 2 table | Y's Line-2 table: "At the foot … `Closing the book · 0 of 6 closed out`" while the paper's own "Closing the book" region head is in frame at the foot by definition of s3 | Suppress the band's foot-state sentence when the paper's own foot-region head is in frame, or make it name something the head does not (e.g. only the count, never the region's own name). |
| **Dc-05** | Y | medium-high | 0.65 | s2 | 1440, 1280 | §4 The header, H2's five things | Y §4: "In its place, right-flush, goes **the current stop**" — no yielding rule stated against the paper's own in-frame region head | Give the band's right-flush stop word the same yielding rule X gives its ladder segments (X-6): withhold it while that region's own head is in frame. |
| **Dc-06** | X | medium | 0.5 | s2, s3 | 1440 | §4 The spine, ladder; §4 the margin | Rail head's swapped third line (X-8), the ladder's act cell/tick (X-7), and a margin `BESIDE {region}` chip can all name the same worst-exception fact when it is money | Name in the proposal which one organ owns "worst exception" when it is money, and have the other two withhold it. What would settle this: whether the margin's `BESIDE` group is defined to exclude a fact the rail head is currently showing. |
| **Dc-07** | Y | medium | 0.5 | s2, s3 | 1440 | §4 The header, Line 2; §4 The margin | Band's Line 2 (worst standing exception) and an anchored margin item both print the same fact; margin items are explicitly "never reordered" and do not filter by current relevance | State a withholding rule: an item anchored to the exact fact the band is currently naming does not also print in the margin. |
| **Dc-08** | both | low | 0.7 | all | 1440, 1280, 390 | §3 mechanics tables; §9 Motion grammar | Brief item 1 asks each proposal to name which of the twelve existing reduced-motion blocks needs a sibling; neither does | Add one line per new animated row naming the existing block (by number, `research/10-code-anatomy.md`) it sits beside. |
| **Dc-09** | X | medium | 0.6 | s1, s2, s3 | 1440, 1280 | §5 `condensed` state; cf. Y §5 `reading` transitions | X: pressing a segment "scrolls to it … returns it to full" with no stated focus destination; Y: "Focus destination: `<h2>` via `regionHeadingId` — the shipped `focusRegionHeading` contract" | State the same focus contract for a rail/ladder press that Y states. |
| **Dc-10** | Y | high | 0.55 | s1, s2, s3 | 1440, 1280, 390 | §4 The header, "New — child landing targets" row | `[data-lens-land]` is applied "to the band's line-2 act and the shelf line's leaves" only — not to region-body controls | Extend `scroll-margin-top: var(--doc-seam-height, 0px)` to every focusable element inside a region body, not only the two named classes. What would settle this: a tab-through probe measuring focused-element/band intersection at s1/s2. |
| **Dc-11** | both | low-medium | 0.45 | s3 | 1440, 1280 | §4 organs untouched (both keep the Studio Drawer) | Neither proposal states a landing clearance against the fixed-bottom Studio Drawer (D8, unmodified) | Add a `scroll-padding-bottom` / clearance rule for the last acts (Record, colophon) against the drawer's fixed height. What would settle this: tab to the colophon's last act at s3 and check obscuring. |
| **Dc-12** | both | low | 0.5 | all | 1440, 1280, 390 | §3, §4 (new interactive elements throughout) | No stated focus-ring color/contrast for new elements (X: ladder/doors on rail stock; Y: band acts) | State the focus-ring token and confirm ≥3:1 against each new background in the mockup. |
| **Dc-13** | — | — | — | — | — | — | *(merged into Dc-16 to avoid double-counting the same evidence)* | — |
| **Dc-15** | both | low | 0.55 | all | 1440, 1280, 390 | §9 Motion grammar / SC6 | Neither proposal ships an in-product motion toggle beyond the OS `prefers-reduced-motion` query; SC6's dev-bar toggle is QA-only | Name whether an in-product toggle is out of scope (defensible under NG-latitude) or add one; currently unstated either way. |
| **Dc-16** | X | low | 0.55 | all | 1440, 1280 | §4 The spine, ladder ink states | X-2: muted `#65594E` (5.317:1 on rail stock, F74's narrowest-headroom token) deployed on every non-current segment, at every scroll offset | Note the token's headroom explicitly in the proposal and forbid any future weight/opacity change to it without a re-run of `contrast.test.ts`. |
| **Dc-17** | Y | low | 0.4 | s1, s2, s3 | 1440, 1280, 390 | §4 The header, the band | Band's background token is never stated; it is `position: sticky` over scrolling content | State the band's background as the declared, fully opaque paper token. What would settle this: computed `background-color`/alpha on `[data-lens-band]` in the mockup. |
| **Dc-18** | both | medium | 0.55 | (sheet opened at any state) | 390 | X §4 "390"; Y §4 "390" | Neither states a row height for the mobile Sections-sheet ladder; F121 measured existing chips at 21–26px against the 24px floor | State a `min-h-11` (or at minimum `min-h-6`, 24px) row height for every ladder/stop row in the mobile sheet. |
| **Dc-19** | Y | low-medium | 0.5 | (wherever chips render) | 390 | Y §4 "390" | X restates a chip-padding fix at 390 (F121); Y's 390 section states only "same words as the desktop margin," no padding fix | Restate the 24px chip-padding fix at 390 explicitly, as X does. |
| **Dc-20** | both | high | 0.55 | s1, s2 (any state where a region is quiet while AT focus is elsewhere) | 1440, 1280, 390 | §5 state machines, `quiet`/`condensed` rows | Neither states an `aria-*` signal on a quiet region's head distinguishing it, programmatically, from a genuinely short/empty region | Add `aria-details` or a visually-hidden text cue on a quiet region root naming that it is condensed by position. What would settle this: the mockup's rendered ARIA attributes on a quiet region. |
| **Dc-21** | both | low | 0.4 | s1, s2 | 1440, 1280, 390 | §9/§4 motion & announcement rules | No stated minimum interval between repeated announcements for a reader oscillating near a settle boundary | State a debounce (e.g. one announcement per N seconds, or per distinct region, not per settle event). |
| **Dc-22** | X | low | 0.5 | s1, s2, s3 | 1440, 1280 | §5 `reading` state, "Announces" row | "one `aria-live="polite"` region attached to the rail's window" — host element unspecified vs. Y's explicit binding to the band's own visible Line 2 | Name the exact DOM node carrying `aria-live`, as Y does. |
| **Dc-23** | X | medium | 0.5 | s0–s3 | 1440, 1280 | §4 H4, "the one reversing act" | X's rail-head press-to-top has no stated semantic element or focus treatment; Y's equivalent inherits the existing accessible Scored-Ink (`da-act`) grammar | Tie the rail head's press affordance to the existing Scored-Ink pattern, or state a new, equivalent accessible contract for it. |
| **Dc-24** | both | medium | 0.4 | all | 1440, 1280 | §4 mount-order tables | Neither states the `<aside>`/`<main>` DOM tab-order sequence for the new rail contents | State the DOM position of the rail relative to `<main>` and the resulting tab-through count to the first paper act. What would settle this: reading `page.tsx`'s actual child order and counting Tab presses in the mockup. |
| **Dc-25** | X | medium | 0.5 | all | 1440, 1280 | §9 Wave 4 | New reduced-motion block named as covering X-1/X-2/X-6/X-7/X-8; X-3 and X-9 also promise instant reduced forms but are not named among the covered rows | List every mechanic row the new block covers, including X-3 and X-9, or state that they are covered by an existing block and name which one. |
| **Dc-26** | Y | medium | 0.5 | all | 1440, 1280 | §9 Wave 3 | Y-3/Y-4's opacity-fade reduced forms and Y-5's rule-slide reduced form are promised in §3 but no CSS/`motion-reduce` addition for them appears in the Wave 3 file list | Add the `motion-reduce:` class or CSS block for Y-3/Y-4/Y-5 to the Wave 3 file list explicitly. |

**Total: 24 distinct defects** (Dc-01 through Dc-12, Dc-15 through Dc-26; Dc-13/Dc-14 merged or resolved to "none found" as noted above and not double-counted).

---

## 5 · Seven-axis scorecard

Never averaged. Anchors per `source/rubric.md`.

### X — "the spine is the lens"

| Axis | Score | One sentence |
|---|---|---|
| a1 uncluttered and peaceful | 7 | The rail's 71.4%/60.8% ink and the 0px condensed header are real recoveries, but Dc-01's s0 duplicate and Dc-06's up-to-three-organ money repeat mean the design has not yet stopped saying the same thing twice everywhere it claims to. |
| a2 lens honesty | 7 | Law 2's "keeps its place, never disappears" is delivered mechanically (fixed-height track, segments divide it); the rail head's own permanent presence at every offset is itself an un-yielded instrument that Law 1's "full" region sits beside forever, which is a smaller honesty gap than Y's but a real one. |
| a3 orientation at depth | 8 | The ladder answers the 08-14 test cleanly and gives every pre-work spread a rail for the first time (F12 60.8%); the strongest single organ-level win in either proposal. |
| a4 engineering credibility | 8 | Six named waves, real file:line, explicit disagreement with E1 argued and priced, the `--doc-seam-height` retirement is the cleanest of the two answers to that variable's four consumers. |
| a5 motion discipline | 7 | Table passes the literal reduced-motion test; Dc-08/Dc-25 are real but minor accounting gaps, not missing forms. |
| a6 still Patina | 8 | No new pigment, no new size, the muted ramp untouched in value — but Dc-16's heaviest-single-consumer risk on the narrowest-margin token is a fragility this proposal introduces without naming it. |
| a7 the 390 form | 6 | The lens line moves into the mobile bar cleanly, but Dc-18's unstated mobile row height and the general thinness of the 390 accessibility argument (Dc-12, Dc-20 apply here too) leave the form under-specified relative to desktop. |

### Y — "the paper is the lens"

| Axis | Score | One sentence |
|---|---|---|
| a1 uncluttered and peaceful | 6 | The one-height band is a real and disciplined recovery (SC1 329px, SC2 56px), but Dc-02's s0 duplicate and Dc-05's un-yielded current-stop word mean the band itself becomes a second copy of the paper it sits above, at exactly the moments it should be quietest. |
| a2 lens honesty | 6 | Y-3/Y-4's "arrives full, releases off frame" mechanism is honest about density, but the band's persistent right-flush stop word is a standing instrument on the paper's own axis that Law 3 ("the spine is the map, not a second copy of the paper") would ask hard questions of if it sat on the rail instead of the header. |
| a3 orientation at depth | 7 | The ladder-as-map plus the band's worst-exception sentence together orient well at depth; Dc-04/Dc-07's foot- and money-state duplicates cost this axis relative to X's cleaner mid-scroll state. |
| a4 engineering credibility | 8 | Four waves, a named single point of disagreement with E1, and the most explicit `--doc-seam-height` consumer table of the two — but Dc-10's incomplete `[data-lens-land]` coverage is a real, specific gap in an otherwise careful engineering path. |
| a5 motion discipline | 7 | Two-number hysteresis argued with a concrete specimen calculation (240px vs. a 65px FF&E line); Dc-08/Dc-26 are the same class of accounting gap as X's. |
| a6 still Patina | 8 | Explicitly refuses to restyle the region rule "the moment the rule weight starts carrying state the register has three rule weights doing four jobs" — a genuinely careful refusal; contrast numbers all clear the floor with room to spare. |
| a7 the 390 form | 6 | The band's two-line, measured-not-hard-coded height at 390 is a careful answer to F44; Dc-18/Dc-19 (unstated mobile row height, no restated chip-padding fix) leave the same class of gap X has, slightly worse because X names the chip fix and Y does not. |

---

## Files read

- `source/brief.md`, `source/mechanics.md`, `source/rubric.md`, `source/instruments.md` §§1,5,6, `source/specimen.md`, `source/shared-planks.md`
- `source/proposal-x-v1.md` (full), `source/proposal-y-v1.md` (full)
- `research/10-code-anatomy.md` (motion inventory, reduced-motion blocks, `--doc-seam-height` consumers, mount order)
- `research/12-layout-measurements.md`, `research/31-verified-findings.md` (F08, F41, F53, F74, F76, F108, F121, F128, F154, F156 and others cited inline)
- `research/24-panel-u5.md`, `research/29-panel-e1.md`, `research/00-env-and-ids.md` (contrast figures)
- `research/01-shot-ledger.md` (consulted for capture caveats; no image files opened this pass — findings in this critique are sourced entirely from the proposals' own text and the measured research corpus, not from visual inspection. Confidence scores below 0.6 reflect this where the claim is otherwise unverifiable from text alone.)
