# 21 — Panel U2: Disclosure & scent

Seat: U2 (UX/UI team) · Program: The Smart Lens (`document-lens-proposal-2026-08-28`)
Heuristics: information foraging and scent (Pirolli & Card) · progressive disclosure ·
Norman signifiers · recognition over recall · change blindness · the closed-door problem.

---

## 1. One line

The document already knows how to fold a region honestly (a name, a true one-line
summary, an "unfold ↓") — but three different mechanisms produce a visually identical
collapsed strip (scroll-driven pin, chosen fold, and a derived default that can flip
shut with no act from the reader at all), and nothing on screen tells you which one you
are looking at, so "why is this closed" becomes a question the document cannot answer
about itself.

---

## 2. Q1 — Disclosure inventory

| # | Mechanism | Trigger | Persistence | Unmounts / stays mounted | Closed form still says |
|---|---|---|---|---|---|
| 1 | Letterhead Phases fold | `Phases ▾/▸` button, `letterhead-vitals.tsx:445-452` | none (`useState`, `:377`) — resets on unmount | Unmounts the `PhasesFold` table; trigger itself returns `null` at 0 phases (`:283`) | Nothing — the door is hidden, not closed, when there is nothing behind it |
| 2 | Job ticket fold/pin | `Fold ↑/Unfold ↓` button; pin from `IntersectionObserver` on the sentinel (`job-ticket.tsx:218-228`) | none — `fold` resets to `null` on every pin change (`:235-244`) | Unmounts the 8 rows (`:401`), replaced by a 2-line seam (`:381-386`) | Identity line (`The job · <Section> · <Phase>`) + worst two exceptions, or `Nothing overdue` |
| 3 | Region fold (7 keys: approvals/schedule/schedule-rule/ffe/money/money-table/boards/care) | Region head's `Fold ↑`, or the seam itself for unfold | `localStorage`, `patina:doc-fold:<docId>:<region>` — outlives the session and the document | Unmounts the body; head+body replaced by `FoldSeam`, min-h 44px | Region name (italic) + a derived one-line summary, truncated |
| 4 | Schedule frame (`schedule-rule` key) | Same `FoldSeam`/`RegionHead` pair | Same `localStorage` mechanism; **defaults folded** on this seed | Body unmounts, **but** the glance strip and phase-advance control still render alongside the folded seam (`schedule-rule-region.tsx:181-192`) | `Schedule dates` + summary; **plus** the visual glance strip, which is not gated by fold state at all |
| 5 | Ticket room chips | Rooms row's `expand` door | none (`roomsOpen` state, `job-ticket.tsx:205`) | Chip group | `No rooms yet` |
| 6 | Margin Drafts fold | toggle, `aria-expanded={draftsOpen}` | none (component state) | The drafts list | Nothing measured live on this seed (0 drafts) |
| 7 | Margin, 1180–1439 tier | `[data-margin-trigger]` fixed tab | `open` state, force-closed/opened by width | The entire rail off-canvas (`translate-x-full`) | **`MARGIN ←`** — no count, no scent at all (§Q3) |
| 8 | Margin, 390 tier | Mobile bar → Sections sheet, or an anchored chip | none | The sheet | Individual anchored chips carry their own line; the Sections sheet's `In the margin · N` is reachable only after opening it |
| 9 | 390 Sections sheet | Mobile bar handle | none | The sheet | Section rows (`Brief`/`Discovery`/…) + `NOT RECORDED` etc. — **no per-region scent at all** (§Q3) |
| 10 | Guide ⟷ Red-letter substitution | Data condition (`page.tsx:1839-1843`), not a reader gesture | none — recomputed every render | The one not chosen never mounts | Whichever renders prints its own content; the other leaves **zero trace** that a substitution happened |

Not itemized above but load-bearing to the picture: **The Record** and **Settled bar**
both distinguish empty from folded (`previous-work.tsx` returns `null` at 0; both use
`hidden` + a `null` render together) — these two already do exactly what a lens design
should generalize.

---

## 3. Q2 — Closed vs. empty, on sight, no hover

**The ticket** passes this test cleanly: every one of its 8 rows prints a real, if
empty, sentence even when the whole document is thin (`w1440-ticket-unfolded.png`: "No
rooms yet", "Nothing filed", "No boards yet · start one", "Nobody on it yet" — verbatim,
next to two rows that do carry numbers, "3 unspecified" and "$6,200 owed you, 15 days ·
$16,330 deposit not drawn"). A returning designer can tell "nothing here" from "there is
a number here" without expanding anything, because the label vocabulary is deliberately
asymmetric (a count/currency string vs. a fixed "nothing" phrase).

**`use-region-fold`'s `FoldSeam` does not pass the same test as cleanly.** The 44px band
(`fold-seam.tsx:59`, `min-h-11`) is *identical in shape* whether the region holds 16
lines or 0 — the seam is one row, always, and the only thing that changes is the words
in its middle column. For a region whose empty-state summary and populated-state summary
happen to use similar vocabulary (see Q1 row 1's Money contradiction, and §Q8's Approvals
example), a returning designer has to actually *read* the summary carefully rather than
recognize a shape — this is where **recognition over recall breaks down**: the seam
gives her one flat visual affordance to scan for "is this worth opening," and the entire
signal rides on parsing a truncated mono string rather than a form she can pattern-match.

---

## 4. Q3 — What scent survives condensation

| Region | Surviving string (spine, `w1440-spine-full.png`) | Carrier |
|---|---|---|
| Client approvals | `0 IN THE LOG` | count |
| Schedule | `NOT SCHEDULED` | word |
| Pieces (FF&E) | `3 PIECES · 0 ROOMS` | count |
| Money | `$6,200 OWED` | number/currency |

Every region gets exactly one surviving string in the spine's running index, and three of
four carry a number; Schedule alone carries a bare word (`NOT SCHEDULED`) with no count —
acceptable here only because "0 phases" and "not scheduled" read the same to a designer,
but it means Schedule's spine scent cannot distinguish "not scheduled yet" from "scheduled
but nothing due soon," where the ticket's own Dates row (`No install date yet`) and the
region's own fold summary might disagree once real data exists. **This running-index
scent is 1440-only** (§Q6/finding U2-03) — at 1280 none of these four strings exist
anywhere on screen without opening the margin/spine sheet equivalents, and the sheet
equivalents (Q1 rows 7-9) don't carry them either.

---

## 5. Q4 — The yield rule

The rule the code follows today, stated once rather than as a list:

> **A region may yield its body only if every fact a designer would need to act on it
> right now already survives somewhere else she does not have to expand — the ticket
> row, the spine's running index, or its own fold-seam summary — and yielding it does
> not remove the *only* surviving pointer to a red-letter (time-boxed or money-owed)
> condition.**

This is why the Red-letter Zone / Needs Attention block (`red-letter-zone.tsx`) has **no
fold mechanism at all** — it is structurally exempt, not merely un-folded by convention —
and why Money is *allowed* to fold even though it is money: its scent survives in two
other places (the ticket's Money row, the spine's `$6,200 OWED`) before the fold ever
happens. The rule is nowhere written down or tested (`shadow-gate.test.ts` enforces the
elevation budget the same way; nothing enforces this). A future region that duplicates
its scent nowhere else and is given a fold would violate the rule silently, with no test
catching it — see finding U2-13.

---

## 6. Q5 — Surprised by disappearance

| Offset | What vanishes | Her act |
|---|---|---|
| scrollY ≈ 280→320px (1440/1280) | The ticket's 8 rows → 2-line seam, ~283px in one uneased frame (probe §1: 23 samples, every one at exactly 64.0625px, no interpolation) | Scrolling — a normal, continuous act, but the *jump itself* has no easing to read as caused by her scroll rather than a glitch |
| Any time a region's `defaultFolded` resolves late while `explicit === null` | The region's body, if the newly-settled default is `true` (folded) — `use-region-fold.ts:110-116` only guards the *reverse* direction (a default arriving after an explicit choice); nothing guards a default arriving while the reader is already looking at the body the initial `null → false` state rendered open | None — a query resolving, mid-read |
| Crossing 1280→1440 (or the reverse) | The entire running-index block, the full `SpineTimer`, and the presence line (`Just you · visible to the studio`) — present at 1440, absent at 1280 (`research/12-layout-measurements.md`: "text labels present at 1440 but absent at 1280") | A window resize/maximize, not a scroll — but no interaction with the document itself |
| Any `document:unfold-region` dispatch while a region is not yet attached | The running index's active-key lock silently no-ops for up to ~2s (`ATTACH_RETRY_MS=250 × ATTACH_RETRIES=8`) if the target hasn't mounted — a jump that appears to do nothing | A click on a spine/ticket link that has not yet "caught" |

---

## 7. Q6 — Inheriting an invisible state

A returning designer inherits an invisible state at exactly the point `use-region-fold`
resolves `folded = forceOpen ? false : (explicit ?? latchedDefault ?? false)`
(`use-region-fold.ts:121`). **`explicit`** is a boolean she set — possibly months ago, on
a document that has since changed shape entirely — and there is **no visual marker
anywhere in `FoldSeam` or `RegionHead` that distinguishes "you chose this" from "this
defaulted this way."** Both render as the identical name/summary/unfold-arrow row. She
cannot tell, by looking, whether a folded Money region is folded because she closed it
once when it had nothing in it, or because the region's current default (which she has
never overridden) happens to compute folded today.

**The three-voice override, concretely:**
- `forceOpen` (voice 1) wins outright — `folded` is forced `false`. But `setFolded`
  under `forceOpen` still lets a *fold* gesture (`value=true`) through the guard check
  (`if (forceOpen && value) return;` — this only blocks *folding*, not the underlying
  render), and the render still shows `folded=false` regardless, so **a press on `Fold
  ↑` while `forceOpen` is true visibly does nothing at all** — no toast (none exists in
  this route tree, `layout.tsx:38-42`), no disabled state, no explanation. The designer
  who presses it has no way to know her press was even received.
- The stored choice (voice 2), once it exists, is final — a late-arriving default
  (voice 3) can never re-open or re-close a region she has touched. This is
  *deliberately* asymmetric and well-reasoned for the "don't yank it shut under her
  hand" case, but it also means a stale `explicit: '1'` (folded) from a thin, empty
  Money region a year ago will keep a now-urgent Money region folded forever, with the
  spine's `$6,200 OWED` as her only clue that something changed underneath the fold she
  set once.

---

## 8. Q7 — Scroll condensation vs. chosen folding, coexisting

**They must be visually distinguishable and today are not.** The ticket's scroll-driven
seam and a region's chosen `FoldSeam` share the identical typographic grammar: an
italic/serif name, a mono truncated summary, and an `unfold ↓` (ticket: `UNFOLD ↓`,
same word, same case convention). Nothing — not weight, not color, not an icon — marks
one as "this happened because you scrolled, scroll up and it comes back" and the other
as "this happened because you (or your last visit) chose it, and it stays folded no
matter where you scroll."

**They already coexist on one region today.** `ScheduleRuleRegion` (`schedule-rule` fold
key) can be simultaneously: (a) scroll-condensed — its own glance strip sits
`sticky top: var(--doc-seam-height, 0px)` directly under the pinned ticket
(`globals.css:1026-1028`) — and (b) chosen-folded via `use-region-fold`. When both are
true at once, the folded branch (`schedule-rule-region.tsx:178-192`) still renders the
glance strip and the phase-advance control *alongside* the folded seam — so "folded"
does not mean "collapsed to one line" for this region the way it does for every other
region on the page; it means "one line, plus a visual timeline, plus a live control."
A designer who has learned "the seam means one line" from Money or Approvals gets a
different, richer collapsed shape here with no signal explaining why.

---

## 9. Q8 — The forty-character sentence, per region

| Region | ≤40-char sentence | Chars | Fits? |
|---|---|---|---|
| Rooms | `No rooms yet` | 12 | Yes |
| Pieces | `3 unspecified` | 14 | Yes |
| Drawings | `Nothing filed` | 13 | Yes |
| Spec | `0 of 3 specified · by room` | 27 | Yes |
| Boards | `No boards yet · start one` | 25 | Yes |
| Money (ticket row, condensed to seam identity) | `$6,200 owed you · 3 unspecified` | 32 | Yes |
| Money (region fold summary, live probe) | `Money · no budget yet · $0 authorized` | 38 | Yes, barely |
| Dates | `No install date yet` | 20 | Yes |
| People | `Nobody on it yet` | 17 | Yes |
| **Client approvals (fold summary)** | **`NO DECISION LEAD · NO APPROVALS AUTHORED`** | **41** | **No** |

**Client approvals is the finding.** Its fold-seam summary is one character over the
40-char budget as printed verbatim on screen (`w1440-fold-seam-folded.png`), and the
middle column it lives in carries Tailwind's `truncate` class (`fold-seam.tsx:73`) — at
1440 the column is wide enough to show it whole, but the same string in the 390 ticket
band or the 1280 margin sheet's narrower context would be the first candidate to clip,
and it would clip its own second half (`APPROVALS AUTHORED`) — the exact clause that
answers "how many," leaving `NO DECISION LEAD · NO APPROVALS AUTH…`.

---

## Findings

```json
{ "id": "U2-01", "lens": "U2", "persona": null, "task_ids": ["T7","T9"],
  "key": "doc|all|foot|money-scent-disagrees-with-ticket",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "foot", "flag": "off",
  "title": "Two different \"Money\" numbers narrate the same document",
  "observation": "Ticket Money row: \"$6,200 owed you, 15 days · $16,330 deposit not drawn\". Money region fold summary (live probe): \"Money · no budget yet · $0 authorized\".",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-ticket-unfolded.png"], "refs": ["apps/designer-portal/src/components/document/commercial/money-region.tsx:227-251","apps/designer-portal/src/lib/document/ticket-derivation.ts:653-657"] },
  "severity": "medium", "confidence": 0.55,
  "already_ruled": null,
  "suggested_fix": "One Money vocabulary: rename the region's authorized-budget concern so it never reuses the word \"Money\" the ticket already owns.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U2-02", "lens": "U2", "persona": null, "task_ids": ["T3","T7"],
  "key": "doc|1280|all|margin-tab-carries-no-count",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "off",
  "title": "Closed margin tab at 1280 shows no count, no scent at all",
  "observation": "The fixed edge tab prints only \"MARGIN ←\" — no number, no word about what's inside, at every scroll state.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1280-margin-tab-closed.png"], "refs": ["apps/designer-portal/src/components/document/margin-rail.tsx:227-228"] },
  "severity": "high", "confidence": 0.9,
  "already_ruled": null,
  "suggested_fix": "Print the live margin count on the tab itself, e.g. \"MARGIN · 7 ←\".",
  "hesitation_seconds_estimate": 25 }
```

```json
{ "id": "U2-03", "lens": "U2", "persona": null, "task_ids": ["T3","T7","T9"],
  "key": "doc|1280|all|running-index-vanishes-below-1440",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "off",
  "title": "Every region's spine scent disappears between 1280 and 1440",
  "observation": "At 1280 the spine shows only Put down, seven marks, Project/ACTIVE and the compact timer — no \"On this paper\" list, no region labels, no values (measured: 8 interactive children at 1440 drop to 3 at 1280).",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 550,
  "evidence": { "shots": ["w1280-spine-glyph-rail.png","w1440-spine-full.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:141"] },
  "severity": "high", "confidence": 0.9,
  "already_ruled": "R126 (I136 gate, ≥1440px-only mount)",
  "suggested_fix": "Give 1180–1439 a condensed running-index form instead of none — even 4 one-word labels beat zero.",
  "hesitation_seconds_estimate": 30 }
```

```json
{ "id": "U2-04", "lens": "U2", "persona": null, "task_ids": ["T3","T9"],
  "key": "doc|390|all|mobile-sections-sheet-no-region-scent",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "off",
  "title": "Mobile Sections sheet lists stages, not regions — no region scent",
  "observation": "The sheet's 12 rows are workflow sections (\"Brief · NOT RECORDED\", \"Project · ACTIVE\", …) plus a Rooms group; none of the four project regions' scent strings (\"$6,200 OWED\", \"NOT SCHEDULED\") appear.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 400,
  "evidence": { "shots": ["m390-mobile-spine-sheet.png"], "refs": ["apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:441-529"] },
  "severity": "medium", "confidence": 0.85,
  "already_ruled": null,
  "suggested_fix": "Add the four region scent strings under the active section row in the same sheet.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U2-05", "lens": "U2", "persona": null, "task_ids": ["T7","T9"],
  "key": "doc|all|mid|late-default-can-fold-shut-under-reader",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "off",
  "title": "A late-arriving fold default can close a region she is reading",
  "observation": "use-region-fold.ts:110-116 only refuses to override an EXPLICIT choice; with explicit===null a defaultFolded that resolves true after first paint (rendered open) flips folded=true with no gesture from her.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 300,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/region/use-region-fold.ts:110-121"] },
  "severity": "high", "confidence": 0.6,
  "already_ruled": null,
  "suggested_fix": "Latch the FIRST resolved default before first paint (skeleton state), never flip an already-rendered-open body shut. What would settle this: throttle the region's data query and watch a fresh (no stored choice) region for a post-paint fold.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U2-06", "lens": "U2", "persona": null, "task_ids": ["T7"],
  "key": "doc|all|all|forceopen-swallows-fold-silently",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "off",
  "title": "Pressing Fold under forceOpen visibly does nothing",
  "observation": "setFolded's guard \"if (forceOpen && value) return;\" swallows the fold; the route carries no ToastProvider (layout.tsx:38-42) so there is no message telling her why the press had no effect.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/region/use-region-fold.ts:125-133","apps/designer-portal/src/app/(document)/layout.tsx:38-42"] },
  "severity": "medium", "confidence": 0.75,
  "already_ruled": null,
  "suggested_fix": "Disable (not hide) the Fold control while forceOpen is true, with a tooltip naming why.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U2-07", "lens": "U2", "persona": null, "task_ids": ["T3","T9"],
  "key": "doc|1440|seam|ticket-collapse-is-a-283px-uneased-jump",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "off",
  "title": "Ticket fold is a hard 283px jump with zero easing",
  "observation": "Height-sampled every ~17ms through the pin transition: 23 samples, every one exactly 64.0625px — no interpolated frame at any point; the first region head's Y jumps -283.19px in that single 40px scroll step.",
  "why_it_blocks": "motion",
  "frame_cost_estimate": 283,
  "evidence": { "refs": ["artifacts/document-lens-proposal-2026-08-28/probe/03-interactive-probe.md:242-269","apps/designer-portal/src/components/document/job-ticket.tsx:235-259"] },
  "severity": "high", "confidence": 0.95,
  "already_ruled": null,
  "suggested_fix": "Animate the row-container height over ~180ms on the pin transition (respecting reduced-motion) instead of a hard swap.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U2-08", "lens": "U2", "persona": null, "task_ids": ["T7","T9"],
  "key": "doc|all|mid|no-marker-for-chosen-vs-default-fold",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "off",
  "title": "A folded region never shows whether she or the system closed it",
  "observation": "FoldSeam renders identically (italic name, mono summary, \"unfold ↓\") whether folded state came from her own localStorage choice or a live-derived default (use-region-fold.ts:121).",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/region/use-region-fold.ts:104-121","apps/designer-portal/src/components/document/region/fold-seam.tsx:59-82"] },
  "severity": "high", "confidence": 0.8,
  "already_ruled": null,
  "suggested_fix": "A small dot or word in the seam distinguishing \"closed by you\" from \"closed by default.\"",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U2-09", "lens": "U2", "persona": null, "task_ids": ["T7"],
  "key": "doc|390|mid|approvals-fold-summary-over-40-chars",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "mid", "flag": "off",
  "title": "Approvals fold summary is 41 characters, over budget and truncatable",
  "observation": "\"NO DECISION LEAD · NO APPROVALS AUTHORED\" (41 chars, verbatim) sits in a `truncate` column (fold-seam.tsx:73); at 1440 it fits, at 390/1280 the column narrows.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 44,
  "evidence": { "shots": ["w1440-fold-seam-folded.png"], "refs": ["apps/designer-portal/src/components/document/region/fold-seam.tsx:59-82"] },
  "severity": "low", "confidence": 0.6,
  "already_ruled": null,
  "suggested_fix": "Shorten to \"No decisions · no approvals\" or drop the redundant \"NO\" prefix pair.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U2-10", "lens": "U2", "persona": null, "task_ids": ["T7","T9"],
  "key": "doc|1440|mid|scroll-vs-chosen-fold-same-grammar",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "mid", "flag": "off",
  "title": "Scroll-pinned seam and a chosen fold look and read identically",
  "observation": "Ticket seam: \"THE JOB · PROJECT / $6,200 owed you · 3 unspecified … UNFOLD ↓\". Region fold seam: italic name + mono summary + \"unfold ↓\" — same three-part grammar, same case.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1440-ticket-seam.png","w1440-fold-seam-folded.png"] },
  "severity": "high", "confidence": 0.75,
  "already_ruled": null,
  "suggested_fix": "Give scroll-condensed strips a distinct visual cue (e.g. a subtle pin glyph) that a chosen fold never wears.",
  "hesitation_seconds_estimate": 15 }
```

```json
{ "id": "U2-11", "lens": "U2", "persona": null, "task_ids": ["T7"],
  "key": "doc|all|mid|fold-drops-keyboard-focus-to-body",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "off",
  "title": "Folding a region drops keyboard focus to <body>",
  "observation": "Probe: after Fold on the Money region, document.activeElement is <body> — focus was not preserved or redirected; Unfold correctly parks focus on the region's own h2.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["artifacts/document-lens-proposal-2026-08-28/probe/03-interactive-probe.md:298-324"] },
  "severity": "high", "confidence": 0.9,
  "already_ruled": null,
  "suggested_fix": "On Fold, move focus to the newly-rendered FoldSeam button, mirroring focusRegionHeading's unfold contract.",
  "hesitation_seconds_estimate": 20 }
```

```json
{ "id": "U2-12", "lens": "U2", "persona": null, "task_ids": ["T7"],
  "key": "doc|all|top|phases-fold-resets-on-remount",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "top", "flag": "off",
  "title": "Phases fold forgets an explicit open on every remount",
  "observation": "phasesOpen is a plain useState with no persistence (letterhead-vitals.tsx:377) — a ⌘K jump away and back re-closes it with no signal that it will.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/letterhead-vitals.tsx:377,445-454"] },
  "severity": "low", "confidence": 0.55,
  "already_ruled": null,
  "suggested_fix": "Fold Phases into the same use-region-fold persistence contract other regions use, or explicitly accept it as ephemeral and say so.",
  "hesitation_seconds_estimate": 5 }
```

```json
{ "id": "U2-13", "lens": "U2", "persona": null, "task_ids": ["T7","T9"],
  "key": "doc|all|top|no-rule-anywhere-gating-future-folds",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "top", "flag": "off",
  "title": "The \"never-yield\" rule for red-letter/money is nowhere codified",
  "observation": "Red-letter Zone has no fold mechanism at all; nothing in code or tests states this is deliberate policy rather than an oversight (contrast with shadow-gate.test.ts, which does enforce the elevation budget mechanically).",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/red-letter-zone.tsx:82-99"] },
  "severity": "medium", "confidence": 0.6,
  "already_ruled": null,
  "suggested_fix": "A one-line comment or lint rule stating the yield rule from §Q4, so a future region inherits the constraint on purpose.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U2-14", "lens": "U2", "persona": null, "task_ids": ["T3","T7"],
  "key": "doc|1280|all|margin-interaction-model-flips-at-1440",
  "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "off",
  "title": "Margin swaps from an overlay sheet to a sticky column at 1440",
  "observation": "1180–1439: fixed tab \"MARGIN ←\" opens a focus-trapped, Esc-dismissed 360px sheet with a scrim. ≥1440: the same content is a permanent sticky 232px column, always open, no scrim.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["w1280-margin-tab-closed.png","w1440-margin-rail.png"], "refs": ["apps/designer-portal/src/components/document/margin-rail.tsx:258-262"] },
  "severity": "medium", "confidence": 0.7,
  "already_ruled": "D3/I21 (mobile milestone), context not constraint",
  "suggested_fix": "No fix required if intentional — but the transition itself should carry a beat (a one-time notice) the first time a designer crosses it.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U2-15", "lens": "U2", "persona": null, "task_ids": ["T9"],
  "key": "doc|all|top|guide-red-letter-substitution-invisible",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "top", "flag": "off",
  "title": "Guide/Red-letter substitution leaves no trace of which she got",
  "observation": "page.tsx:1838-1847's ternary swaps DocumentGuide for RedLetterZone based on four hidden conditions (engagement_kind, enrichedOperationalNeeds, redLetterRows.length, deskGuidanceFailed) with no visible marker that a fallback occurred.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 60,
  "evidence": { "shots": ["w1440-guide-or-red-letter.png"], "refs": ["apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1838-1847"] },
  "severity": "medium", "confidence": 0.5,
  "already_ruled": null,
  "suggested_fix": "What would settle this: force deskGuidanceFailed=true in dev and confirm no distinguishing marker appears in either branch's markup.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U2-16", "lens": "U2", "persona": null, "task_ids": ["T7","T9"],
  "key": "doc|1440|seam|schedule-rule-fold-means-something-different",
  "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "off",
  "title": "\"Folded\" means one thing for Money, another for Schedule",
  "observation": "schedule-rule-region.tsx:181-192: the folded branch still renders the glance strip and phase-advance control beside the seam — every other region's fold hides everything but the one-line seam.",
  "why_it_blocks": "orientation",
  "frame_cost_estimate": 40,
  "evidence": { "refs": ["apps/designer-portal/src/components/document/schedule/schedule-rule-region.tsx:178-211"] },
  "severity": "medium", "confidence": 0.65,
  "already_ruled": null,
  "suggested_fix": "Name this region's collapsed state something other than \"fold\" (e.g. \"glance\") so the vocabulary doesn't overpromise uniformity.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U2-17", "lens": "U2", "persona": null, "task_ids": ["T3"],
  "key": "doc|390|all|mobile-margin-count-only-in-sheet",
  "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "off",
  "title": "Margin count at 390 exists only inside the Sections sheet",
  "observation": "\"In the margin · 7\" prints only inside the Sections sheet (m390-mobile-spine-sheet.png); at rest, only line-anchored chips show (one chip visible on m390-rich-s0), with no persistent count badge anywhere in the mobile bar.",
  "why_it_blocks": "information-loss",
  "frame_cost_estimate": 0,
  "evidence": { "shots": ["m390-mobile-spine-sheet.png","m390-mobile-margin-chips.png"], "refs": ["apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:539-560"] },
  "severity": "medium", "confidence": 0.7,
  "already_ruled": null,
  "suggested_fix": "Put a small margin count on the mobile bar itself, not only inside a sheet she has to open first.",
  "hesitation_seconds_estimate": 10 }
```

```json
{ "id": "U2-18", "lens": "U2", "persona": null, "task_ids": ["T7"],
  "key": "doc|all|top|seven-fold-keys-no-shared-empty-vocabulary",
  "surface": "/doc/[id]", "width": "all", "scroll_state": "top", "flag": "off",
  "title": "Each of the 7 fold regions invents its own empty vocabulary",
  "observation": "Money: \"no budget yet\". Approvals: \"NO DECISION LEAD · NO APPROVALS AUTHORED\". Ticket rows: \"No rooms yet\" / \"Nothing filed\" / \"Nobody on it yet\" — three different negation patterns for the same underlying concept (zero).",
  "why_it_blocks": "clutter",
  "frame_cost_estimate": 0,
  "evidence": { "refs": ["apps/designer-portal/src/lib/document/ticket-derivation.ts:440-741"] },
  "severity": "low", "confidence": 0.5,
  "already_ruled": null,
  "suggested_fix": "A shared \"nothing yet\" phrase template across ticket rows, fold summaries, and spine entries.",
  "hesitation_seconds_estimate": 5 }
```

---

## What stays true

- **The ticket's 8-row honesty.** Every row prints a real sentence even at zero —
  `No rooms yet`, `Nothing filed`, `Nobody on it yet` — never a blank cell. Any lens
  redesign should keep this discipline; it is the one place scent survives condensation
  cleanly today.
- **Unfold's focus contract.** `focusRegionHeading` lands a keyboard user exactly on the
  region's own `<h2>` after unfolding — disciplined, source-verified, and worth
  preserving even as fold's own focus handling (U2-11) gets fixed to match it.
- **R8's "don't teach the document to lie."** Inert affordances (an unfold hint with
  nothing behind it) are suppressed rather than shown dead — the Phases trigger hiding
  entirely at 0 phases is the working instance of this discipline; a lens redesign
  should extend it, not relax it.
- **The latch's core idea.** Not reading a derived default live once an explicit choice
  exists is the right call — it stops a data refresh from silently reversing a designer's
  own decision. Only the pre-choice window (U2-05) needs tightening, not the whole
  mechanism.
- **The spine's per-region scent strings at 1440** (`0 IN THE LOG`, `NOT SCHEDULED`,
  `3 PIECES · 0 ROOMS`, `$6,200 OWED`) are exactly the kind of terse, numeric,
  glanceable sentence a smart lens should generalize to every width, not lose at 1280
  and 390.
