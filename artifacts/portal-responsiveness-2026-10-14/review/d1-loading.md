# D1 Loading language (US-33, seat 5, SQ-956)

Role: UI/UX designer. The design canon is waived for this story. Every departure from it is named as a candidate ruling in §8. Not waived: the studio promise, 44 px targets, `aria-busy`, reduced motion, contrast, and honesty (loading must never look empty).

Sketches: `review/d1-sketches/`. Open `index.html` first. The sketches are static HTML and CSS built on the real tokens in `apps/designer-portal/src/app/globals.css`. Every skeleton in them is plain markup with no JavaScript, which is the same constraint a route-level `loading.tsx` has.

- `q-quiet-paper.html`: direction Q. Six rooms at 1440 and 390; a live Desk→Document demo with Normal, Fast, Slow and Fail scenarios and a 0.25× speed; the loading, empty, error and slow states; a reduced-motion toggle.
- `x-expressive.html`: direction X, laid out the same way.
- `arrival-options.html`: the four arrival options, frame by frame, drawn in either register.
- `timeline.html`: the threshold ladder from the click out to 30 s, laid against the baseline.

## 0. The short version

The studio waits in three different silences:
- **Dead air after a click.** For 215–251 ms locally and 248–608 ms in prod, nothing on the page changes (BASELINE.md, plan-hypotheses table; `screens/P4-200ms.jpg` still shows the Document after "Studio contacts" was pressed).
- **Blank paper.** On a hard load, first paint arrives at about 0.7 s but the content becomes usable only at about 7 s (P1hard 6,974 ms, P2hard 6,773 ms). Most of the gap is the arrival hold, empty paper, or "Picking up…" (`screens/P2-1000ms.jpg`).
- **Rooms that draw nothing.** `/pieces` shows no placeholder at any point (P3hard). `/room/[id]` returns `null`.

Both directions make the same structural change: one register, painted by a `loading.tsx` before hydration and built from the room's real frame, with an indicator at 100 ms and placeholders at 150 ms. They differ in material and voice. **Q** uses pearl bars and a 1 px ink rule, and a slow load gets one italic line. **X** uses shimmer, a clay bar and toasts. I recommend **Q with arrival option C**, where the skeleton becomes the arrival. It removes the 6–7 s hold without adding motion the paper does not already have. X is drawn to the same depth.

## 1. Today's five treatments

| # | Treatment | Where (file:line) | What it says to a studio member |
|---|---|---|---|
| 1 | **Prose line**, mostly italic Playfair: "Picking up…", "Reading the roster…", "Opening the book…" and about 20 others | `app/(document)/doc/[id]/page.tsx:3013-3021` (pre-hydration and resolution guard), `:3345-3351` (the held paper's zero-height line); `people/views/directory-view.tsx:571-574`; `roster/project-team-roster.tsx:113`; `orders-ledger.tsx:431`, `orders-book-week.tsx:266`, `hours-ledger.tsx:1899`, `phase-advance-control.tsx:395`, `plans/light-table-card.tsx:169`, `studio-pulse.tsx:125` | "Something is happening, somewhere." On the Document it sits top-left on an otherwise empty sheet for seconds. It says nothing about what is coming or how big it is. Each room uses different words. |
| 2 | **StrataSweep**, the three-line brand loader | `components/ui/strata-sweep.tsx:24-69`, keyframes `globals.css:522-557`; 16 non-test call sites, e.g. `library/library-shelf.tsx:131-134`, `library/field-search.tsx:76-78`, `library-card.tsx:270,372`, `piece/piece-room.tsx`, `ui/controls/button.tsx` | "The system is working." It is honest about indeterminate work and on brand. It is the size of a word, though, so as a region loader it leaves the region's real size unknown and the content shifts when it lands. |
| 3 | **SectionLoadingLine**, one pearl pulse bar per section | `components/document/section-loading-line.tsx:27-72`; 13 files and 15 sites (`work-block.tsx`, `ffe-section.tsx`, `brief-section.tsx`, `schedule/schedule-spine.tsx` …) | "This section's body is on its way." It is the closest thing to a register today. It carries the `aria-busy` contract that the lens resolution gate reads (D-B46, `:35-46`). It is 96 px wide whatever the body will be. |
| 4 | **Real skeletons**: the Desk's three Today frames and the board room | `app/(document)/desk/page.tsx:581-606` with `.desk-loading-frame` (`globals.css:3014`, 120 px hollow outline); `board/[boardId]/page.tsx:76-77`; also `recent-boards-strip.tsx:48,102`, `project-mood-boards.tsx:263` | "Cards will stand here." The shape is honest. But the Desk frames are empty outlines, and the recent-boards tiles are **white `bg-surface` cards with a border** (`recent-boards-strip.tsx:102`). At 1 s on the Desk they look like three empty boards (`screens/P1-1000ms.jpg`). That is loading that looks empty. |
| 5 | **Nothing** | `doc/[id]/pieces/page.tsx:51` (`<Suspense fallback={null}>`) and `:116` (`<main aria-busy>`, empty); `rooms/room-view/room-view.tsx:279` (`if (isLoading) return null`); the arrival veil `lib/arrival/arrival.css:8,15,23` (content laid out but at opacity 0 for up to 1.5 s on the Desk and 8.5 s on a held Document) | "Did my click work?" P3hard: no placeholder at any time, usable at 6,154 ms. P4: no change at 200 ms. |

Two findings fall outside the five:
- **People has a line that nobody can detect.** "Reading the roster…" (`directory-view.tsx:571`) has no `role="status"` and no `aria-busy`. The lab therefore recorded "none" for P4, a screen reader never hears it, and it appears only after the 251 ms of dead air (`screens/P4-1000ms.jpg`).
- **The arrival veil is a sixth, hidden treatment.** On a hard load the paper is fully laid out, and is then hidden on purpose. Document no-busy arrives at 9,372 ms and LCP at 10,728 ms (P2hard).

## 2. One register, in four layers

Both directions share this spine. Only the material differs.

1. **Frame, which is real and instant.** It contains the paper ground, the rail stock, the rules, the room's fixed title ("Studio contacts", "Pieces", "Resource library", "Hello."), the fixed eyebrows ("Today", "Filed with this job", "In the margin"), and links whose `href` the server already knows, such as the Document's "Filed with this job" links, built from `params.id`. It is served from `loading.tsx` and paints when the route commits. It is never a placeholder, so it never fades.
2. **Placeholders, which are shaped and delayed.** A bar stands for each data-dependent line. Its height is about 0.6 of the type it stands for, and it sits inside that line's real line box, so the swap from bar to text does not shift anything. You can see this in the sketches: `.loaded` swaps each bar for its own text in the same box. Rows are drawn to the fold only. A bar never prints a number. A count is drawn as a bar ("· ▭ pieces") and never as "0".
3. **Indicator, which travels.** It appears 100 ms after the click and completes when the paper is no longer busy (see §3).
4. **Words, only when the wait is long.** No words appear while things are normal. Words appear when the load is slow, when it stalls, or when it fails.

**Honesty rules (not waived):**
- **H1.** An empty state needs a successful read. It renders only when the query has answered (`status === 'success'`) with zero rows. A pending or disabled query, or a feed that has not answered yet, is loading. The Desk already does this for Mine (`desk/page.tsx:342-350`, SQ-751 F5). The rule makes it universal.
- **H2.** Placeholders are filled bars shaped like text. They are never hollow frames and never white cards, because hollow frames read as empty cards (treatment 4).
- **H3.** Nothing in a skeleton invites a press unless it works without JavaScript. A plain link with an `href` is fine. An input, tab or button is drawn as a placeholder until hydration. Typing into a server-rendered field before hydration would be lost.
- **H4.** Every loading region carries `aria-busy="true"` and an `sr-only` sentence naming what is loading. Errors use `role="alert"`, and slow lines use `role="status"`.

**Thresholds** (both directions, measured from the click; drawn in `timeline.html`):

| Time | What appears | Why |
|---|---|---|
| 0 ms | Press state on the thing clicked (D2's grammar) | B1 |
| 0–100 ms | Nothing new | A cached page lands with no flash |
| 100 ms | Indicator starts (Q rule / X bar) | Covers the measured 215–608 ms of dead air; Next's own `useLinkStatus` example uses a 100 ms delay (r-patterns §2) |
| Route commit | Frame paints (prefetched `loading.tsx`, so usually at once) | |
| commit + 150 ms | Placeholders fade in over 50 ms, fully in by 200 ms | No flash under 150 ms; meets B2 (≤200 ms) |
| Data | Content fades in over 120 ms (`LANDING_FADE_MS`, `lib/arrival/types.ts:59`) in the same boxes | A quick swap reads as a settle, not a blink. Pure CSS, so no minimum-display timer |
| 3 s (X) / 4 s (Q) | Slow voice | Nah (2004): tolerable waiting is about 2 s, and feedback extends it (r-patterns §2) |
| 10 s | Stall words + Reload | NN/G: a long wait needs more than an indicator |

The delays are CSS, not JavaScript timers, because nothing runs before hydration, and on a prod hard load that lasts 1.4–5 s.

## 3. Direction Q: Quiet paper

**Material.** Bars are set in `--color-pearl` (#E5E2DD), the same material SectionLoadingLine already uses. On the rail stock pearl disappears (#E8E3DB under #E5E2DD), so rail bars are charcoal at 11%. After their fade-in, the bars **breathe** on the existing R15 breath: `doc-breath`, 3 s, opacity 1 → 0.62 (`globals.css:304-319`). Nothing shimmers, nothing has a gradient, and nothing has a shadow. The Desk's hollow frames and the white board tiles are replaced by filled bars (H2).

**Navigation rule.** It is 1 px of ink at 40%: `color-mix(in srgb, var(--text-primary) 40%, transparent)`. That is literally the arrival's own "ink at 40%: one slow crawl" line (`arrival.css:64`). It sits on the top edge of the paper (the `<main>` column) and not on the browser chrome.
- **Appears** at 100 ms.
- **Route stroke** runs to 60% on the editorial ease (`--ease-editorial`) while the route is fetched.
- **Data stroke** runs to 90% while any `[aria-busy="true"]` remains in the paper. This is the same selector the lens already waits on (D-B46).
- **Completes** when the paper has had no busy region for one frame: it draws to 100% in 120 ms, then fades over 200 ms.
- **Fails**: the rule stops where it is and turns `--color-terracotta-ink` (#9C5340, 5.41:1 on paper, `globals.css:35`) at 1.5 px. The paper's error line takes the column. The placeholders stop breathing and drop to 45% opacity, because nothing is still working.
- **Abandoned** (another click): the newest navigation wins and the rule restarts. It never jumps backwards.
- **Never fakes completion.** A rule that is still at 90% after 10 s stays at 90%.

**Slow and stall voice.** At 4 s, one italic Playfair line centres under the rule: "Still reading. The connection is slow." (`role="status"`). At 10 s it becomes "Still reading. The connection is slow. Reload the page", where "Reload the page" is a 44 px link. There is no toast.

**Reduced motion.**
- Placeholders appear after the same 150 ms delay with no fade, and they do not breathe.
- The rule loses its transition. It steps between 60%, 90% and done, and a step is a state change, not motion.
- Content appears without the 120 ms fade.
- The sketch's toggle mirrors `@media (prefers-reduced-motion: reduce)` exactly.

## 4. Direction X: Expressive

**Material.** Blocks are set in `--bg-warm` (#EEE6DB) with 4 px radii. A white highlight at 75% sweeps across them every 1.4 s (`shimmer`). In the build all blocks share one sweep (`background-attachment: fixed`) so the page shimmers as one surface rather than as forty separate ones. Avatars are drawn as circles, thumbnails as tiles, and chips as soft pills with no outline.

**Progress bar.** It is 2 px and full bleed at the top of the viewport. It uses a clay → clay-ink gradient (#C4A57B → #7C5E30) with an 8 px glow at its head.
- It appears at 100 ms and trickles asymptotically to 90% over about 2.4 s.
- It completes on the same "paper not busy" signal, with a 150 ms fill and a 250 ms fade.
- On failure it turns terracotta-ink and loses its glow.
- It lives in the persistent `(document)` layout, so it runs during a cold Worker's TTFB on SPA navigation.

**Toasts.** They sit bottom-left above the drawer at 1440, and full width above the mobile bar at 390.
- At **3 s**: a charcoal toast with an xs StrataSweep, "Still loading Cedar Lane Study…" (`role="status"`).
- At **10 s**: "This is taking longer than it should." with a 44 px **Reload**.
- On **failure**: a terracotta toast, "Cedar Lane Study could not be loaded." with **Try again**, **plus** the inline error line. The toast alone would vanish, and the paper must still say what happened.
- There is never a success toast, never a "Loaded!", and never a toast that links anywhere except Reload or Try again. That is the studio-promise line: toasts report trouble and never pull attention.

**Reduced motion.**
- The shimmer is off; the blocks are a still warm tint.
- The bar loses its trickle and steps instead.
- Toasts appear in place with no slide, and the StrataSweep inside them stills to its static partial (`globals.css:550-557`).

X is livelier and familiar from consumer apps. Whether shimmer feels faster is contested (r-patterns §2: Mejtoft 2018 vs Viget 2017).

## 5. Skeleton anatomy per room

The anatomy is shared, and Q and X differ only in material. "Real" means frame text or a link from §2 layer 1. Row counts are drawn to the fold: 900 px tall at 1440 and 844 px at 390, minus the drawer or mobile bar.

| Room | Real at first paint | Placeholders at 1440 | At 390 |
|---|---|---|---|
| **Desk roster** `/desk` | "Hello.", "+ Record an inquiry", "+ Create a project file" (links), "Today" eyebrow, the rules | Date bar after "Today"; **3 Today cards**, each with a slug bar, a job-act bar (display height), two body bars and a holder bar; a ledger eyebrow bar; **5 ledger rows** (name, phase, status). Recent boards: pearl tiles with a caption bar, not white cards | 2 cards stacked; 3 rows with phase under the name; action links fold into the mobile bar |
| **Document paper and spine** `/doc/[id]` | Rail stock; "← Back to studio overview"; the Strata mark (static); "Filed with this job" and its 4 links; "In the margin"; the rules | **Spine**: 6 section entries, each a title bar and a status bar, with the active marker. **Paper**: client line, title bar (or the real title, see §6 option C), two rows of action bars, next band (slug + "Next —" bar), **3 regions** each with ornament, head bar, count bar and its reserve (`--doc-quiet-reserve-min` 68 px, `-exc` 112 px; `globals.css:234-235`). **Margin**: 2 card outlines with bars | No rail. The next band is first, then title, regions, and the real dark mobile bar |
| **People index** `/people` | "Studio contacts", "Search the directory", the rule | Field outline holding a bar (H3); filter tabs as bars; **6 rows** of 40 px avatar circle, name bar, role bar, and 2 chip outlines | 4 rows, chips dropped (they wrap under the name once loaded) |
| **Library shelf** `/library` | "Resource library", the helper sentence (static copy) | Count bar (never "0 pieces"); field outline holding a bar; shelf eyebrow bar; **5 rows** of 54 px thumb tile, name bar and maker bar; shelf tabs as bars | 4 rows, 44 px thumbs |
| **Build room** `/doc/[id]/pieces` | Rail as on the Document, with "Pieces" active; "Pieces" title; "Filed with this job"; the rules | Next band; two summary bars ("by room · ▭ groups · ▭ lines"); action bars; **2 room groups** (ornament, italic room-name bar, "▭ underway" bar), each with 2–3 line rows of 54 px thumb, name bar, status chip and price bar | No rail; 1–2 rows per group; status bar under the name |
| **Room view** `/room/[id]` | "← The desk", "A room" eyebrow, the head rule | A drawing board in the plan's proportion (880×500, or square at 390) marked only by four registration corners; caption bars for room name and dimensions | Square board, full width |

The Room view needs three distinct states. **Loading** shows the corners and caption bars with no words. **Processing** shows the existing "The room plan is not available yet." (`room-view.tsx:281-289`), a fact about the scan. **Error** shows the error line. Today the not-ready branch also catches `doc == null`, so a failed read prints the processing sentence. That is a small honesty bug for E2-D7. (The 10-09 walk shot `room-fold-1440.jpg` shows older copy, "This room is still being drawn.")

## 6. Loading, empty, error, slow

Drawn for People at both widths (`#frame-states` in both sketches), because People is the room where loading reads as empty today.

| State | Q | X |
|---|---|---|
| Loading | Row-shaped bars, `aria-busy`, no counts, rule running | Shimmer rows, bar running |
| Empty (H1) | Field and tabs now real; ornament + "Directory" eyebrow + one italic sentence ("Nobody under this narrowing yet.", `people-derivation.ts:1408`); no bars | Same, with no toast |
| Error | Frame kept; the region becomes one terracotta-ink Playfair line, "The directory could not be read.", with a 44 px **Try again** and "Back to the desk"; the rule stops in terracotta | The same inline line **plus** an error toast with Try again |
| Slow | The italic line under the rule at 4 s | The toast with StrataSweep at 3 s |

A region-level error keeps the rest of the page. Only a route-level failure (Document resolution, `doc/[id]/page.tsx:3022-3042`) takes the whole paper column, and even then the rail and drawer stay.

## 7. Loading meets arrival (US-14)

What the arrival does today:
- It lifts the place, the job and the first act into a card, once per 30-minute visit (`VISIT_MS`, `types.ts:58`), with a 44 px Skip (`arrival.css:69`).
- Until the route is ready, `html.arr-pre` holds `[data-arrival]` at opacity 0, with a CSS failsafe at 1.5 s on the Desk (`arrival.css:15`) and 8.5 s on a held Document (`:23`).
- The JavaScript budgets are `HARD_ENTRY_READY_MS` 8,000 and `SOFT_ENTRY_READY_MS` 4,000 (`types.ts:57`).

Drawn frame by frame in `arrival-options.html`:

| Option | What happens on P2 | Cost |
|---|---|---|
| **A · Keep it** | Desk unchanged to about 250 ms, then "Picking up…" on blank paper, then a card at about 7 s, then content | Hard loads stay at a 6.8–7 s usable time. The loading register can never show on an arriving route. |
| **B · Shorten the hold** | The skeleton shows from about 200 ms. The card plays only if the paper is ready inside `HIDDEN_CAP_MS` (1,200 ms, `types.ts:57`); otherwise it declines as `late` and the content fades in | On today's 25-deep waterfall the card would almost never play. That makes B, in practice, D plus extra code. |
| **C · The skeleton becomes the arrival** | Nothing is hidden. The arrival token (`KEYS.ARRIVE`, `types.ts:62`) also carries the job name, which is set in the title slot at first paint. The ink crawl line **is** the Q rule. The spine and next band fill first, then the regions, with the existing `desk-settle` 60 ms stagger (`globals.css:447-450`) | The card's moment of ceremony becomes the load itself, and the wait added is zero. A hard load with no token (a bookmark) shows a title bar until the engagement answers. |
| **D · Retire it** | Plain skeleton → content | Loses US-14 entirely: the card, the Skip, and the motion work. |

**Recommendations:**
- **For Q: C.** The arrival's materials (40% ink crawl, title, stagger) are already Q's materials, so the arrival becomes how the paper is set.
- **For X: D.** A shimmer, a bar and a card would be three performances in one second, so retire it. If Kody wants a flourish in X, keep only the `desk-settle` stagger.
- A is not recommended in either direction. The baseline puts the hold behind 6–7 s of usable time.

## 8. When StrataSweep may still be used

The sweep is for **indeterminate work whose shape is unknown**. It is never used where a layout is known.

- **Allowed:**
  - a search or ask in flight, where the result's size is unknown (`field-search.tsx:78` stays);
  - the inline pending glyph inside a pressed button (xs, `button.tsx`; D2 governs it);
  - scan, upload or parse progress;
  - an Engine or Library answer being composed;
  - in X, inside the slow toast.
- **Not allowed:**
  - a page or region loader (the Library shelf `library-shelf.tsx:133` becomes rows);
  - centred on blank paper;
  - more than one on screen;
  - shown before 150 ms.
- In Q the sweep and the rule never run together on the paper. If the route is loading, the rule speaks. The sweep is for work inside a page that is already settled.

## 9. What D1 needs from E2 (for seat 9 to pair)

1. **E2-D1 · `loading.tsx` per segment:** `(document)/desk`, `doc/[id]`, `doc/[id]/pieces`, `people`, `library`, `room/[id]`, plus `rooms` and `boards`. Each is a **server component of static markup and CSS**, with no hooks, no data and no client JS, because it paints before hydration. The 150 ms delay and the breath are CSS `animation-delay`.
2. **E2-D2 · One skeleton component per room, shared by `loading.tsx` and the client page's pending branch.** After hydration the `'use client'` page replaces the fallback. If its own pending branch renders `null`, "Picking up…" or a different shape, the studio sees skeleton → blank → content. The specific cases are:
   - `doc/[id]/page.tsx:3013` (the `!hydrated` guard) and `:3345` (the held line) must render `<DocumentSkeleton/>`;
   - `pieces/page.tsx:51,116` and `room-view.tsx:279` must render their skeletons;
   - `directory-view.tsx:571` must render rows.
3. **E2-D3 · No dynamic read above a boundary.** Next shows no `loading.js` fallback when a layout above it reads `cookies()`, `headers()` or uncached data (r-patterns §3). `app/layout.tsx` and `(document)/layout.tsx` read neither today, and they must stay that way. `doc/[id]/layout.tsx` is `'use client'` and calls `useDocumentEngagement`. That is fine as long as it renders children without waiting.
4. **E2-D4 · Prefetch.** The fallback is prefetched only in production, and only through `<Link>` (r-patterns §3). Desk rows, rail entries and drawer items must be `<Link>`. Code that navigates with `router.push`, such as `pieces/page.tsx` (`navigate`, `buildRoomReturnHref`), needs `router.prefetch` on intent.
5. **E2-D5 · A navigation-start and navigation-end signal for the indicator.** The App Router has no router events, and `useLinkStatus` skips prefetched links. I need:
   - a client component in `(document)/layout.tsx` (persistent, so it is alive during a cold TTFB);
   - a start signal from a capture-phase listener on same-origin anchor clicks plus a wrapped `router.push`;
   - an end signal of pathname/search change **and** no `[aria-busy="true"]` in `<main>`, reusing D-B46's `LOADING_SELECTOR`;
   - a fail signal of a segment `error.tsx` mounting.
6. **E2-D6 · `error.tsx` per segment, plus a root `not-found`.** Only `board/[boardId]/error.tsx` exists. Each renders §6's in-frame error line.
7. **E2-D7 · An empty-requires-read helper (H1).** A small predicate over a query's `status`. In v5 a disabled query reports `pending` forever, so a disabled query must not render an empty state. Apply it first to People, recent boards and the Desk.
8. **E2-D8 · Shift-free swap.** Skeleton line boxes must equal the rendered ones at 390 and 1440. That needs the region reserve tokens and a CLS mark in the baseline harness (`harness/lab.mjs`), so B2 and B3 are measured without layout shift.
9. **E2-D9 · Arrival changes.**
   - Option C: remove the `arr-pre` veil and the held-paper path (`arrival.css:8-24`, `doc/[id]/page.tsx:2956-2958,3345-3351`) and add the job title to the arrival token.
   - Option B: lower the budgets in `types.ts:56-60`.
   - Option D: delete `lib/arrival`.
10. **E2-D10 · Desk scroll restore survives the skeleton.** P10's place-keeping (`desk/page.tsx:514-530`, `holdDeskPlace`) must restore after the content swap, not against the skeleton's height.
11. **E2-D11 · Streaming flush.** Keep each fallback above the roughly 1 KB that some browsers buffer (r-patterns §3), so the frame actually paints early.
12. **E3 dependency, not E2: before any HTML.** A cold Worker holds the first byte 1.6–3.7 s on 4 of 16 prod hard loads, and every hashed chunk revalidates (`max-age=0`). No loading treatment can paint before the first byte. On SPA navigation the layout-resident indicator covers the gap. On a hard load only the browser's tab indicator speaks, plus the press state held on the page being left (the sign-in submit stays "Signing in…" until unload). Closing the gap needs E3: placement or warmth, and immutable static caching.

## 10. Candidate PQ rulings

These are numbered locally. Synthesis renumbers them as PQ1…

| # | Ruling | Canon departed from | Recommendation |
|---|---|---|---|
| D1-a | **Direction**: Q, X, or a hybrid (Q material with X's slow toast) | — | Q |
| D1-b | **Arrival**: A keep / B shorten / C becomes / D retire | US-14 hold and card (`arrival.css`, `types.ts`) | C with Q; D with X |
| D1-c | **A navigation indicator exists** at all, and where it sits (top of the paper in Q, top of the viewport in X) | None exists in the canon; "nothing on the Desk ever moves" (`globals.css:305-306`) | Yes; Q's rule |
| D1-d | **The breath beyond the spine**: placeholders breathe on R15, including on the Desk | R15: the breath is the only ambient motion, on the active spine marker; the Desk never moves (`globals.css:304-306`) | Yes: loading is literally alive |
| D1-e | **Shimmer** (X only) | R15 and R35: the sweep is "the only sanctioned loading motion besides the breath" (`globals.css:516-521`) | Only if X |
| D1-f | **Shadow and glow** on the X bar and toasts | D4, no shadows (`globals.css:52-55`) | Only if X |
| D1-g | **Toasts** for slow loads and failures (X only) | Ink-word state; the paper speaks in place | Only if X; never a success toast |
| D1-h | **StrataSweep demoted** to unknown-shape work only | R35: "replaces spinners portal-wide" as the system loader (`strata-sweep.tsx:2`) | Yes |
| D1-i | **Prose loading lines retired** ("Picking up…" and about 20 others); words only for slow, stall and error | The house voice in loading copy | Yes |
| D1-j | **Thresholds**: 100 ms indicator, 150 ms placeholders, 4 s (Q) or 3 s (X) slow, 10 s stall | — (ratify with budgets B1 and B2) | As drawn |
| D1-k | **Real frame before hydration**: titles and plain links are real; inputs, tabs and buttons are placeholders until hydrated (H3) | — | Yes |

H1–H4 are not rulings. They follow from the honesty and accessibility constraints that are not waived.

## 11. Evidence and limits

- **Baseline numbers** all come from `baseline/BASELINE.md` and its `screens/`. Code references are against main `0c474d53b`. Platform facts (Next 16.2.10 `loading.js` and prefetch behaviour, `useLinkStatus`, thresholds research) come from `review/r-patterns.md` §2–3.
- **Rendering:** headless Chromium at 1440 and 390. All five files load with no console errors and no horizontal page scroll at 390, and every control outside the drawn frames is at least 44×44. Mid-scenario demo captures (Q slow at 4.5 s, X fail at 2.2 s) and the generator script are in the board's SQ-956 verification folder, not the repo.
- **Not done:**
  - The sketches are not tested with a screen reader.
  - The sketches' contrast is not checked by tool. Bars are decorative (`aria-hidden`). The words use existing tokens with recorded ratios (`globals.css:34-41`).
  - The shared-sweep `background-attachment: fixed` is described, not drawn: each sketch bar shimmers on its own.
  - I did not design P6–P9 click feedback. That is D2's seat.
