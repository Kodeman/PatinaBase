# Review 01 — technical + design, round 1 (adversarial)

**Target:** `artifacts/hour-tracking-2026-09-11/deck/src/index.html` (1,497 lines, 126 KB)
**Date:** 11 September 2026 · **Stance:** adversarial, no severity filter
**Verdict:** `clean = false` — 0 blockers, 6 majors, 12 minors, 5 notes.

Nothing in this deck breaks a hard Artifact rule. What it breaks is its own
argument: at every laptop width below ~1180px the evidence columns are clipped
off the right edge of the page with no keyboard path to them, and the one
navigation readout it ships tells the reader the wrong sheet number.

---

## §0 · Method

- Static read of all 1,497 lines; CSS token audit; WCAG 2.1 contrast computed
  from the token hex values (sRGB relative luminance, `(L1+.05)/(L2+.05)`).
- **Render check ran.** Playwright resolved from
  `apps/designer-portal` (`@playwright/test@1.58.2`). Chromium refused to
  launch inside the command sandbox (`mach_port_rendezvous … Permission
  denied (1100)`); re-run with the sandbox disabled for that command only.
  Scripts: `review/shots/render-check.cjs`, `probe2.cjs`, `probe3.cjs`
  (`.cjs` because the repo root `package.json` sets `"type": "module"`).
  Page content wrapped in the Artifact publish shell
  (`<!doctype><html><head><meta charset><meta viewport><reset></head><body style="margin:0">`)
  at `review/shots/_wrapped.html`. 26 screenshots in `review/shots/`.
- Widths measured: 390, 768, 860, 861, 900, 1024, 1180, 1280, 1440, 1512, 1600
  — light and dark, `prefers-color-scheme` emulated.
- Four deck citations spot-checked against the repo; all four resolve exactly
  (see TD-20).

### The brief's 390 assertion is untrustworthy on this page — read this first

`document.documentElement.scrollWidth <= window.innerWidth` **PASSES** at 390 in
both palettes. It passes *by construction*: `body { overflow-x: hidden }`
(`index.html:99`) clips horizontal overflow instead of reporting it, so the
assertion cannot fail on this page whatever the content does. I replaced it
with a per-element painted-box probe (`getBoundingClientRect().right > innerWidth`).
Result: **no real content overflow at 390** — the only boxes crossing the edge
are the `clip-path`-hidden `<thead>` cells (`index.html:212`) and the
`left:-9999px` skip link, neither of which induces scroll. The 390 layout is
genuinely sound. Use the element-box probe in any future gate, not `scrollWidth`.

---

## §1 · Artifact-rule conformance — the blocker checklist

| Rule | Result | Evidence |
|---|---|---|
| No `<!doctype>` / `<html>` / `<head>` / `<body>` tags | **PASS** | grep: 0 hits |
| `<title>` first, `<style>` at top | **PASS** | `:1`, `:5-284` |
| Light tokens on bare `:root` | **PASS** | `:14-52` — every token that dark redefines is defined here first |
| Dark under `@media (prefers-color-scheme: dark)` guarded `:root:not([data-theme="light"])` | **PASS** | `:55-73` |
| Dark also under `:root[data-theme="dark"]` | **PASS** | `:75-91`, after the media block, so the toggle wins both ways |
| No colour defined only inside a media block | **PASS** | all 15 dark tokens have a bare-`:root` definition |
| `body` explicit background + side padding | **PASS** | `:96-98` — `padding-inline: clamp(16px,4vw,64px)`, `background: var(--paper)`; measured 16px @390, 57.6px @1440 |
| Every table inside `overflow-x:auto` | **PASS** | 15 tables, 15 `.scroller` wrappers, 1:1 by position |
| Nothing wider than the 390 viewport | **PASS** | element-box probe, both palettes |
| External assets only `fonts.googleapis.com` (+ its `fonts.gstatic.com` files) | **PASS** | `:2-4` only; no other absolute URL in the file |
| No `<a download>` | **PASS** | grep: 0 |
| No per-second motion | **PASS** | 0 `@keyframes`, 0 `animation`, 0 `transition`, 0 `transform` in author CSS |
| `prefers-reduced-motion` honoured | **PASS** | `:271-277` CSS + the JS checks `matchMedia` before smooth-scrolling (`:1470`) |
| Keyboard navigation works | **PARTIAL** | paging works; see **TD-2**, **TD-3**, **TD-4** |
| House-sheet §A families with fallbacks | **PASS** | `:49-51` byte-identical to `SPEC.md` §A2; the `<link>` at `:4` is §A2 verbatim |
| Body-text contrast ≥ 4.5:1 both palettes | **PASS** | **13.53:1** light (`#2C2926` on `#FAF7F2`), **12.89:1** dark (`#F2EDE6` on `#2A2622`) |

Also clean: no `box-shadow`, no `text-overflow: ellipsis`, no inline `style=`,
no hex literal outside the token block, no console or page errors in any of
the four render cases.

### Full contrast table (computed from the token values)

| Ink | on `--paper` light | on `--paper` dark |
|---|---|---|
| `--ink` (body) | 13.53:1 ✓ | 12.89:1 ✓ |
| `--ink-muted` | 8.99:1 ✓ | 9.64:1 ✓ |
| `--ink-subtle` | 7.54:1 ✓ | 8.18:1 ✓ |
| `--ink-faint` (11–12px meta) | 6.35:1 ✓ | 6.87:1 ✓ |
| **`--oak` (used as 11–12px text)** | **4.20:1 ✗** | 5.33:1 ✓ |
| `--clay-ink` (focus ring) | 5.61:1 ✓ | 8.03:1 ✓ |
| `--terracotta-ink` (`.defect`) | 5.28:1 ✓ | 7.34:1 ✓ |
| `--sage-ink` (`.holds`) | 5.27:1 ✓ | 7.80:1 ✓ |

---

## §2 · Findings

| ID | Severity | Confidence | Location | Finding | Fix |
|---|---|---|---|---|---|
| **TD-1** | **major** | high | `index.html:198,205-206,211` | Below ~1180px **every** table clips its right-hand columns inside `.scroller`, and at 1440 the three `.widest` tables still clip 48px. Measured main-column width: 1092@1440 · 938@1180 · 794@1024 against table `min-width` 1020 (`.wide`) / 1140 (`.widest`). The block-card fallback only engages at `max-width: 860px`, so the whole 861–1180px band — 13" laptop, half-screen, projector — renders a deck that *looks* complete while the rightmost column is off-page. Screenshots: `v2-1024-light-sheet-14.png` (the `For / against` vote column is entirely absent and `Panel recommendation` is cut mid-word — "clients stop sending an…"); `deck-1440-light-sheet3.png` (the `Footnote` evidence column cut mid-citation — "studio-drawer.tsx:470-", "mis-dates into t…"). macOS overlay scrollbars mean there is no at-rest affordance that more exists. | Raise the collapse breakpoint from 860px to ~1200px — the block-card layout is already complete, correct and legible (`v2-390-light-sheet-3.png`) — or drop `min-width` on `.wide`/`.widest` and let the columns wrap. |
| **TD-2** | **major** | high | `index.html:1479-1492` vs `:181` | The clipped columns are **unreachable by keyboard**. The global `keydown` handler `preventDefault()`s ArrowLeft/Right for every target that is not an input, so the horizontal scroller cannot be scrolled even when focused. Measured: the `.scroller` in sheet 3 *is* focusable in Chromium (`document.activeElement === scroller`, no `tabindex`), `scrollWidth - clientWidth = 48`, and after `ArrowRight` `scrollLeft` is still **0**. In Safari/Firefox the container is not focusable at all. WCAG 2.1.1. | Exempt a focused scrollable container from the handler (`if (t.closest('.scroller')) return;`), and give `.scroller` `tabindex="0"` + an accessible name so it is reachable in every engine. Fixing TD-1 removes the need. |
| **TD-3** | **major** | high | `index.html:1483-1492` | The handler also swallows ArrowUp/ArrowDown/PageUp/PageDown, so a keyboard user cannot scroll *within* a sheet. Sheets are taller than the viewport at every width: 1612px and 3290px at 1440 (sheets 12 and 14), 6011px and 11143px at 390. Pressing ArrowDown at the top of sheet 14 jumps to sheet 15, skipping rulings HT-8…HT-40. The only surviving escape is Space / Shift+Space, which the on-screen hint (`:1429`, "← → · j k") never mentions. | `preventDefault` only when the current slide fits the viewport; otherwise let the browser scroll. Or bind paging to `j`/`k` and `←`/`→` only and leave ↑↓/PageUp/PageDown alone. |
| **TD-4** | **major** | high | `index.html:1440-1444, 1447-1458, 1468-1477` | **The sheet counter displays the wrong sheet.** Measured at 1440, nine keypresses: shown/actual = 01/2, 03/3, 03/4, 04/5, 05/6, 06/7, 06/6, 06/5, 05/4 — wrong in 7 of 9. Cause: `mark(i)` fires before the smooth scroll lands, then the IntersectionObserver callback re-marks the *outgoing* slide because it picks the best entry within that callback batch only (`:1449-1455`) rather than the best of all sixteen; `mark`'s `if (i === current) return` guard (`:1441`) then locks the stale label in. Visible in `deck-1440-light-top.png` — the pill reads **02** on sheet 01. | Compute position from one source: on each IO callback (or a rAF-throttled scroll listener) pick the slide whose top is nearest the viewport top across *all* slides, and drop the keyboard `mark()` calls entirely. |
| **TD-5** | **major** | high | `index.html:121,173,199,242` · `docs/design/house-sheet/SPEC.md:50` | `--oak` is used as **small-text ink** at **4.20:1** on light paper — below AA 4.5:1 for text under 18.66px. It colours `.verdicts .k` (the cover's TODAY / THE SHAPE / THE ASK keys, 11px), `.ann .k` (11px), and `table.sheet td.id` (12px) — which is the `HT-1 … HT-40` ID column on the ruling sheet, the wave IDs on sheet 10, the hole numbers on sheet 5 and the `№` column on sheets 12–13. The house sheet itself labels the token *"the rest rule pigment (4.20:1 on paper)"* — a pigment for 1px rules, not an ink. Dark mode is fine (5.33:1). | Move those four rules to `--ink-faint` (6.35:1) or `--clay-ink` (5.61:1); keep `--oak` for `.gutter .rule` (`:148`) and the link underline (`:265`), which are non-text and only need 3:1. |
| **TD-6** | **major** | med | `index.html:328` vs `:341,353` | Sheet 02's heading — the first claim after the cover — contradicts its own table: **"Six cells. One passes outright."** while two rows carry the full mark: `Who` (`:341`) and `Project` (`:353`), both `aria-label="present"`. Either the heading undercounts or `Project` should be a half mark (its own cell text argues the latter: "NOT NULL — and that is also why admin and studio time has no legal home"). | Decide: "Two pass outright" in the heading, or demote `Project` to `m-half` with the qualifier. A deck arguing from evidence cannot miscount its own marks. |
| **TD-7** | minor | high | `index.html:670`, sheet 05 `<tfoot>` | Heading says "**Two** rate holes" over a table numbered 1–4; holes 3 and 4 are additional data rows parked in `<tfoot>`, which is for summary/footer content, not further records. Screen readers announce them as the table footer. | Retitle ("Four money holes; two are rate holes") and move rows 3–4 into `<tbody>`. |
| **TD-8** | minor | high | `index.html:1246` + sheet 12 rows 20, 22 | Heading says "**Twenty-three removals**" but the table has 23 *rows*, of which row 22 (`useStudioTimeReport`) is explicitly **"not deleted"** and row 20 is "Dropped from the plan outright, **not built then removed**". At most 21 are removals. | "Twenty-three lines on the deletion sheet — 21 removals, one contested, one never built." |
| **TD-9** | minor | high | `index.html:1387` vs `:1095` and `architecture.md:875` | The decision slide asks for "Green-light W0 — **Three days**"; sheet 10 and the architecture both band W0 at **M · 3–5 days**. The one number Kody is asked to approve today is the optimistic end of its own band. | "Three to five days." |
| **TD-10** | minor | high | `index.html:186-197,1429` | The fixed `#idx` pill overlays page content at every width (measured right edge 376@390, 1426@1440) and `pointer-events: none` means it cannot be moved or dismissed. In `v2-390-light-sheet-3.png` it sits on top of a footnote citation; at 1440 it covers the last visible table row. | Hide it below 700px, or reserve space for it (`.slide { padding-bottom: calc(104px + 44px) }` is not enough on short sheets), or paint it in `--paper` with a hairline and keep it clear of the text column. |
| **TD-11** | minor | med | `index.html:312` | `.t-head` applies `text-transform: uppercase` to a case-sensitive SQL identifier: the cover's count label renders **`PROJECT_TIME_ENTRIES`** for `public.project_time_entries`. The deck's own thesis is "one table" — printing its name in the wrong case on the cover is a small credibility leak. | Use `.t-meta` (sentence case, 12px, same family) for that one label, or set `text-transform: none` on a `<code>` inside `.t-head`. |
| **TD-12** | minor | med | `index.html:15` | `color-scheme: light dark` is declared unconditionally. A viewer whose OS is dark but who has explicitly chosen light (`data-theme="light"`) gets dark UA chrome — scrollbars, form controls, the canvas behind the page — on a light page, and vice-versa. The page itself is safe because `body` paints an explicit background. | Add `:root[data-theme="light"]{color-scheme:light}` and `:root[data-theme="dark"]{color-scheme:dark}` beside the existing theme blocks. |
| **TD-13** | minor | med | 15 `<table>` elements, 0 `<caption>` | No table has a caption or `aria-labelledby`, so a screen reader's table list reads fifteen unnamed tables. The preceding `h2`/`h3` carries the meaning but is not programmatically associated. | `<caption class="skip">` per table (reuse the existing off-screen class), or `aria-labelledby="h3"` on each table. |
| **TD-14** | minor | med | `index.html:1429` | `#idx` is `aria-hidden="true"` and carries the **only** statement that `←`/`→`/`j`/`k` page the deck. AT users are never told the shortcuts exist — and after TD-3 those shortcuts are the only way to move. | Keep the counter hidden; expose the key legend once in a visually-hidden paragraph near the skip link. |
| **TD-15** | minor | high | `index.html:135,146,163-166,183,192` vs `SPEC.md` §A4 | House-sheet rhythm deviations: page measure `max-width: 1240px` where §A4 sets **1100px** centred at ≥1200px; block gaps of 2/4/6/10/20px against §A4's "24 / 48 / 72 / 12 (half). **Nothing else**"; the dial is 11px at `border-radius: 50%` where §A4 permits 50% for "the 7px mark dot only"; `padding-block: 56px 104px` is off-module. None harms legibility, and narrowing to 1100px would make TD-1 *worse*, so this is a record, not a demand. | Record the deviation, or normalise the gaps to 12/24 and fix TD-1 by narrowing the tables rather than widening the page. |
| **TD-16** | minor | high | `index.html:114` + ~60 uses | `.t-head` is specified "**running heads only**" (`SPEC.md` §A3) but is used for verdict keys, count labels, annotation keys, in-cell wave labels and the register's `<dt>`. Applied consistently, and `.t-meta` (sentence case) would not carry the label role — but it is a deviation from the sheet the colophon claims conformance to. | Either amend the house sheet's §A3 wording to admit a label role, or move the non-running-head uses to `.t-meta` with `text-transform: uppercase` declared locally. |
| **TD-17** | note | high | `index.html:4` vs 0 hits for `font-weight: 600` | The font request includes `Inter:wght@…600`; no rule in the deck uses weight 600, so a face is fetched and never drawn. The `<link>` is the §A2 block verbatim, so changing it deviates from the house sheet. | Leave it. Recorded so a later reviewer does not re-find it. |
| **TD-18** | note | med | `index.html:286` + `:262-263` | The skip link targets `#sheet-2`, a `<section>` with no `tabindex="-1"`, so activating it scrolls the page but leaves focus at the document start — the next Tab returns to the skip link. `left: -9999px` is also a legacy off-screen technique (contained here only because `body` has `overflow-x: hidden`). | Add `tabindex="-1"` to `#sheet-2`; switch `.skip` to `clip-path: inset(50%)` positioning, matching the `thead` treatment already in the file. |
| **TD-19** | note | high | `index.html:33-47` | Eleven declared tokens have zero `var()` references: `--clay`, `--golden`, `--terracotta`, `--sage`, `--rail`, `--ink-paper`, `--radius-hair`, `--press-in`, `--press-out`, `--ease`, `--module`; `--golden-ink` is defined in both palettes and never used. They are the verbatim §A1 block, whose instruction is "paste this block verbatim". | No action. Recorded. |
| **TD-20** | note | high | throughout | Citations are bare filenames (`use-time-tracking.ts:689`, `hours-ledger.tsx:104-123`). The repo carries 10+ worktree copies of `use-time-tracking.ts` under `.codex/worktrees/`. I spot-checked four: `margin-groups.ts:11-13` (title quote ✓), `use-time-tracking.ts:689` (`useStudioTimeReport` ✓), `:616-619` (the compensating `.update({invoice_id:null}).eq('invoice_id', invoiceId)` detach ✓), `hours-ledger.tsx:111` (`.eq('user_id', userData.user.id)` ✓). All exact. | Add one colophon line: paths are relative to `apps/designer-portal/src/` and `supabase/migrations/` on `origin/main`. |
| **TD-21** | note | med | measured | At 390 the block-card fallback is correct but expensive: sheet 03 becomes a 6,213px column (17 capabilities × 6 stacked surface lines) and sheet 14 an 11,143px column. The across-surface comparison the matrix exists to enable cannot be made on a phone — it becomes 17 separate six-item lists. | Accept (laptop-first business deck), or on phones render sheet 03 as one column of "present on: …" sentences instead of five per-surface lines. |
| **TD-22** | note | med | `index.html:1381` vs `synthesis.md:301-304` | The cover and the decision sheet call HT-30 (the strengthened no-dashboard test) one of "three consent rulings". HT-30 is a vision-governance ruling, not a consent one; HT-10 or HT-12 is the better third. The deck is **faithful to the synthesis**, which makes the same grouping. | Orchestrator's call, not the deck's — fix in the synthesis or accept. |
| **TD-23** | note | high | `index.html:99` | `body { overflow-x: hidden }` makes the brief's `scrollWidth <= innerWidth` assertion unfalsifiable on this page (see §0). The page is genuinely clean at 390 by the stronger element-box probe — but the assertion proved nothing on its own. | Use the element-box probe in `review/shots/render-check.cjs` as the standing 390 gate for house decks. |

---

## §3 · What is genuinely good (so round 2 does not break it)

1. **The token block is the house sheet, byte for byte** (`:14-52` vs `SPEC.md` §A1), correctly extended with the Artifact theme guards the spec does not carry. No hex literal escaped it.
2. **Every `<td>` in all 854 cells carries `data-label`** — the 860px block-card fallback is complete, with no unlabelled cell anywhere. That is why 390 reads well.
3. **No motion at all.** Not "reduced motion handled" — none authored, plus a correct reduced-motion block and a `matchMedia` check before the one smooth scroll.
4. **Counts check out**: 17 capability rows under "Seventeen capabilities", 11 risk rows under "Eleven risks", 40 HT rows under "Forty questions", 16 sheets numbered 01/16…16/16. TD-6 and TD-8 are the only two arithmetic failures.
5. **Citations are real.** Four spot-checks, four exact hits, including a line-range quote.

---

## §4 · Fix order

1. **TD-1** — the collapse breakpoint. One CSS number; it also dissolves TD-2 and shrinks TD-21.
2. **TD-3 / TD-2** — stop swallowing ↑↓/PageUp/PageDown and let a focused scroller scroll.
3. **TD-4** — one position source for the counter.
4. **TD-5** — four colour rules off `--oak`.
5. **TD-6, TD-8, TD-9** — three headings that disagree with their own tables.
6. Everything else is a minor or a record.

## §5 · Artefacts

- `review/shots/render-check.cjs` · `probe2.cjs` · `probe3.cjs` — re-runnable with
  `cd apps/designer-portal && node <script>` (Chromium needs the sandbox off).
- `review/shots/render-report.json` — metrics for all four 1440/390 × light/dark cases.
- `review/shots/_wrapped.html` — the deck inside the Artifact publish shell.
- 26 screenshots, `deck-*` (first pass, smooth-scroll artefacts on the 390 deep
  links) and `v2-*` (instant-scroll, authoritative).
