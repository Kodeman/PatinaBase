# Proposal X — The spine is the lens

*The Document · The Smart Lens · v2, 2026-08-29. Revised in a fresh seat against `critique-design.md`, `critique-feasibility.md`, `critique-practitioner.md` and `critique-access.md`. v1 stays on disk at `source/proposal-x-v1.md`, unedited. Every plank in `source/shared-planks.md` is adopted in the words it gives; where v1 drifted from a plank, v2 brings it back and the appendix says where. Every number is checked against `research/12-layout-measurements.json`, quoted from `research/31-verified-findings.md`, or arithmetic shown on this page.*

---

## 1 · Thesis

The paper's header is only true at the top of the paper. The rail is true across the whole document at once, and it costs the work no vertical pixels, because it is a column beside a column. So the header goes back to being the top of a piece of paper — name, arc, what needs her — and then it leaves. The rail is the instrument: a drawn map of this paper's depth, at both desktop widths, in words. And the paper never moves under her, because the lens only ever opens what is still ahead of her.

> **The falsifiable sentence.** At 1440, on the measured Chen spread, the first region head lands at **378px** at rest; the rail measures **82.0%** ink on a project spread and **82.0%** on a pre-work spread; and no region's height changes at any scroll offset while any part of that region, or any pixel above it, is inside the frame.

---

## 2 · What stays identical

The R126 register is the floor. Named, so a judge can check.

**Type.** 40px Playfair letterhead title (`doc-letterhead.tsx:58-60`), 24px Playfair region heads (`region/region-head.tsx:127-133`), the five-step scale 40/24/18/15/14, the 11px mono floor. X introduces **no new size**. The rail's registers stay what `spine-running-index.tsx:97-114` already uses — a 13px label and an 11px mono value; the quiet head's status line stays `region-head.tsx:135`'s 12.5px.

**Stock and ink.** Paper `#FCFAF6`, rail stock `#E8E3DB`, desk `#FAF7F2`, charcoal `#2C2926`, the muted ramp `#4E4339`/`#5A4E43`/`#65594E`, the `-ink` companions (clay `#7C5E30`, terracotta `#9C5340`, golden-hour `#79651E`, sage `#5F6B57`). No new pigment, no new tint family.

**One named fragility, on the record (Dc-16).** `--text-muted #65594E` measures **5.317:1** on rail stock against a 4.5:1 floor (F74) — roughly one small step of headroom — and X's ladder is the heaviest single consumer of it in the system, on every non-current segment at every offset. X does not spend the step, and adds a standing rule: **no weight, size or opacity change to a rail label ships without re-running `src/lib/document/__tests__/contrast.test.ts`.** Wave 0 makes that gate a glob so it cannot silently stop scanning. The app-wide aged-oak backlog (`11-canon-digest.md:135`, 3.51:1 at ~40 sites) is inherited, not touched: R126 already moved the rail's own instances off it.

**Rules.** The three weights, unchanged: `--rule-hair` 1px at 10%, `--rule-mid` 1.5px `#2C2926`, `--rule-strong` 2px plus the hairline double (`region/region-rule.tsx:17-36`, recipe pinned by `region/__tests__/region-rule.test.tsx:59-74`). The ladder is drawn in these three and nothing else.

**Stamps and plates.** Filled stamps at ~1.18:1 tint, 1.5px pigment border, charcoal word, −1.5°. The six saturated stage tab plates. The 48px product crops. Untouched.

**The wash.** The ink-pool hover wash exactly as R126 shipped it (`app/globals.css:322-349`) — `.has-wash { position: relative; isolation: isolate }` at `:322-325`, `.row-wash` with `z-index: -1` and the `clip-path` circle at `:327-336`, 260ms in / 200ms out, `--ease-editorial`, the flat `-still` tint under reduce. X adds no consumer beyond the shipped two (`desk-roster.tsx`, `ffe-section.tsx`); F149's rule that the ticket, spine and region heads carry no wash stays a rule.

**The seven-mark arc stays in the rail.** v1 moved it to the letterhead. v2 does not move it at all — see §4, and Dd-20, DC-15, Dp-07 in the appendix. Its seven `min-h-11` jump controls (`doc-spine.tsx:100`, `:111`) keep their 44px targets exactly as shipped, and `doc-spine.test.tsx:14-19` and `responsive-document-shell.test.tsx:202-211` stay green rather than being rewritten.

**Organs X does not touch.** THE STUDIO desk block. The Record's contents (`previous-work.tsx`). The colophon's contents (`doc-colophon.tsx`). The FF&E line's own composition. The approvals record list. The money region's six-rung ladder read. The `DocSheet` overlay grammar. The ⌘K palette. The Esc chain, which the probe confirms works (`probe/03-interactive-probe.md` §4). The Studio Drawer's contents — v1 rewired `breadcrumbFor()`; v2 does not (DC-05).

**What was tempting and was left alone.** The needs-attention block's terracotta rule. F127 records it as "nearly the only colour-coded signal on the first screen and a junior's eye correctly snaps to it". X quiets everything around it and leaves the block itself at its shipped weight — the opposite of dissolving it into a sentence.

---

## 3 · Lens mechanics table

Nine mechanics. `from→to` carries real values; `what never moves` is the layout promise the row makes.

| # | Trigger | What changes | from→to | Duration & easing | Reduced-motion equivalent | What never moves | F-ids |
|---|---|---|---|---|---|---|---|
| **X-1 The window travels** | scroll, rAF-throttled, written as `data-lens-window` outside React | the reading window — a `--rule-mid` bracket in the ladder's gutter marking the frame's share of the paper's **data-derived** extent | top `202px → 512px`, height `74px → 158px` | position-linked, 1:1 with scroll; no duration, no easing | the rAF handler reads `matchMedia('(prefers-reduced-motion: reduce)')` and **steps**: a static bracket around the segment holding the frame's midpoint, redrawn on settle only | the segment stack, every label, every value, the paper | F84, F111, F116, F22 |
| **X-2 The segment inks** | the window's midpoint entering a segment | that segment's label weight and its value's ink | weight `400 → 600`; value `--text-muted #65594E → --text-primary #2C2926` | `--duration-fast` 150ms, `--ease-editorial` | instant swap between the same two weights and the same two inks, at settle | the segment's y-position and its drawn height | F84, F102, F108 |
| **X-4 A region ahead opens** | its reserved box's top comes within **one frame height** of the frame's bottom edge, after the X-10 settle | the body mounts at ratified weight; the reserve is replaced by the real height | FF&E on the specimen `112px → 1,840px`; Money `112px → 430px`; a stop with no standing exception `68px → its own height` | **0ms — one commit, entirely below the frame's bottom edge** | identical; there is no transit to remove because there was never one on screen | every pixel at or above the frame's bottom edge, at any offset — the growth is always below the last line she can see | F01, F11, F53, F47, F73 |
| **X-5 A region behind is never taken back** | its box's bottom passing above the frame's top | nothing in layout. The root takes `data-passed`, which switches on `content-visibility: auto` with `contain-intrinsic-size: auto` — render skipped, **height preserved to the pixel** | painted height `1,840px → 1,840px`; `content-visibility: visible → auto` | 0ms | identical — there is no visual change of any kind to reduce | **everything.** This is the row that makes SP-03 true by construction rather than by correction | F04, F113, F53, F87 |
| **X-6 The segment's name yields** | the region's own `[data-region-head]` entering the frame | the rail segment's **name** stops printing. Its **value** never yields, at any offset | name `"Pieces" → ""` | 150ms crossfade, `--ease-editorial` | the name is simply absent at settle — nothing fades | the segment's drawn height, its value line, its extent, so the ladder never reflows | F29, F102, F108, F10 |
| **X-9 The edited line takes weight** | `focusin` on an editable control inside a region body | that line's left rule and its own wash | rule `--rule-hair 1px @10% → 2px --color-clay-ink #7C5E30`; the row's shipped wash holds open | 150ms `--ease-editorial` | the clay-ink rule prints instantly; the wash is the flat `-still` tint R126 already ships (`globals.css:439-458`) | **the siblings** — no neighbouring row changes ink, tint, weight or position | F117, F164, F23 |
| **X-10 The lens settles** | scroll velocity below 40px per frame for 120ms | `data-lens-settled` on the shell root, and one `aria-live="polite"` announcement on `[data-lens-window]`, at most once per distinct region | `false → true`; announcement `"" → "Pieces · 36 lines · 1 damaged"` | none — an arithmetic gate, not a move | identical; the gate is arithmetic and the announcement is text | everything — this row gates X-1, X-2, X-4 and X-11 and moves nothing itself | F105, F42, F118, F112, F51 |
| **X-11 The rail head yields at s0** | the letterhead's own box intersecting the frame | the rail head's name line and stage phrase stop printing; the seven-mark arc and the `--rule-mid` stay | `"Vandersteen" / "PROCUREMENT & ORDERS · 4 OF 6" → ""` ; the head's box stays 100px | 150ms crossfade, `--ease-editorial` | the two lines are absent at settle, present at settle after the letterhead leaves | the head's reserved 100px, the arc's seven 44px targets, the ladder below it | F13, F10, F56, SP-08 |
| **X-12 The press lands** | a press on a segment, a sub-rung or a door | every region between the current offset and the target — all of them below the frame — is forced to full in **one commit before the scroll begins**; then `scrollToRegion` runs; focus lands on the region's `<h2>` | target y computed once, after the commit; the 700ms jump lock holds the window at the target | `scroll-behavior: smooth` 700ms, or an instant jump under reduce — the branch already shipped at `use-document-running-index.ts:206-214` | the target's own top, from the moment the offset is computed to the moment the scroll ends; no region above the frame is touched | F34, F45, F38, F120 |

**Retired from v1, and why, so a judge can see the deletions.** **X-3, the passed mark** — a third position signal for a fact the window and the inked segment already carry, drawn in `--color-clay` at 1.82:1 on rail stock, which `contrast.test.ts:319-325` asserts is *below* AA and which `:334-338` would not catch because it only greps for `text-[var(--color-clay)]`; and it had no stated reverse (Dd-15, DC-11, Dp-13). **X-7, the rail's act cell** — 28px permanently reserved plus two crossfades to print one act during a narrow band of scroll; the act stays in the region's own quiet head instead, which is where C7 puts it (Dd-14, Dp-12). **X-8, the head-line swap** — one unlabelled slot carrying three subjects at three offsets, which took the install date off screen at s1, s2 and s3 (Dp-02, Dp-03, Dc-03). Ten mechanics became nine, and one of the nine (X-5) is a mechanic whose entire content is *nothing changes*.

**The one ambient move is still `doc-breath`** (`app/globals.css:271-283`), on the active StrataMark, in the rail, where it already is. Its site does not move. X names no second ambient move; X-1's window is position-linked, not time-linked, and therefore not ambient.

**Zero hover-only affordances.** Every state above is a printed mark or a focus state. At 1180–1439 every label prints as text — v2 does not hide any label behind a press (§4). F128 records the shipped tree has none; X adds none.

---

## 4 · Organ by organ

### The spine — `components/document/doc-spine.tsx`

**Before.** 200px at ≥1440, 56px at 1180–1439. Put down · a horizontal row of seven StrataMarks · the active label pair · `spine-running-index.tsx`'s four-row list · `spine-timer.tsx` · a presence line. Measured (`rich.1440.s0.spine`): **inkPx 494.25 / 900 = 54.9%**, longest empty run **270px** (y 630→900), 8 interactive children; pre-work **13.9%** with a **657px** run. F96 names the diagnosis: the top ~145px mixes four tenses.

**After — S1 answered tenant by tenant, with the 08-14 test.**

| Tenant | True across the whole document at once? | True outside it? | Verdict |
|---|---|---|---|
| Put down | — | yes | **stays**, at the edge (F126: the one control that costs the same at every state) |
| The seven-mark arc | yes — the job's arc, at every offset | yes — its six siblings are other spreads | **stays**, and stops being a tenant: it becomes part of the head |
| The active label pair | yes | no | **absorbed** into the head's stage phrase |
| The running index | yes | no | **becomes the ladder** |
| The timer | no — this minute | no | **evicted** to the drawer, which already prints it |
| The presence line | no — other people, this session | no | **evicted** to the drawer's account line |

Four tenants, one tense above the rule and one below it.

1. **Put down** — 44px, unchanged (`doc-spine.tsx:47-55`).
2. **The rail head** — a reserved **100px** block, the same 100px at every scroll offset:
   ```
   Vandersteen
   ◆ ◆ ◆ ◆ ◇ ◇ ◇          ← the seven marks, unmoved, min-h-11 each
   PROCUREMENT & ORDERS
   4 OF 6
   ```
   **The measure, since v1 asserted a height it could not hold (Dd-04).** `doc-spine.tsx:44` sets `min-[1440px]:px-4` on a 200px column and the file's own comment at `:57-63` reads *"The fixed 200px spine column leaves ~168px inside its own px-4"*. `Vandersteen` at 13px ≈ 78px, one line, 18px tall. The arc is the shipped `<ul>` at `:64` with `-mx-2`, which the same comment says fits seven `xs` marks "with room to spare"; its rows are 44px. `PROCUREMENT & ORDERS` is the longest of the six stage names — 20 characters of 11px mono at `tracking-[0.05em]`, ≈ 7.15px per character ≈ 143px, inside 168px, one line. `4 OF 6` is a second 16px line. 18 + 44 + 16 + 16 = 94, plus 6px of internal lead = **100px reserved, not measured**. The truncation rule, stated: **truncate the subject, never the number** — a stage name longer than 20 characters loses its tail to an ellipsis; `4 OF 6` never truncates.

   The head **yields both text lines while the letterhead is in frame** (X-11). At s0 the letterhead prints the household at 40px Playfair and the stage plate; the rail prints the arc and nothing else. This is the rule X applied to segments in v1 and failed to apply to itself — Dd-06, DC-12, Dc-01, Dp-07.

   `--rule-mid` closes the head at y 192. **That rule is the axis boundary**: above it, the job and where it stands; below it, this paper and how deep she is in it. That is X's answer to S2, and it is the opposite of v1's — a horizontal row does not teach the wrong axis when it sits *above* the line where the vertical axis starts.
3. **The ladder** — a **399px** track at 1440 (299px at 800), one segment per stop the paper actually prints, separated by `--rule-hair`, with the reading window bracketing the frame's own share.

   **Six stops on a project spread, not four (Dd-03, F116).** v1 indexed the four keys in `document-index.ts:17` and left the 1,508px below `money-head` — 38.6% of the rich spread's 3,905px `scrollHeight` — with no segment at all, then defended the hole as an NG3 virtue. v2 indexes what the paper mounts, verified in the tree:

   | # | Stop | Root today | Wave |
   |---|---|---|---|
   | 1 | `Client approvals` | `approvals/project-approval-document.tsx:565`, `:586` | shipped |
   | 2 | `Schedule` | `schedule/schedule-spine.tsx:1057` | shipped |
   | 3 | `Pieces` | `ffe-section.tsx:1209` | shipped |
   | 4 | `Money` | `commercial/money-region.tsx:229`, `:250` | shipped |
   | 5 | `Closing the book` | `care-band.tsx` — mounts on the project spread at `page.tsx:2134`; needs a root | 2 |
   | 6 | `The record` | `previous-work.tsx:37` (`<section aria-label="The record">`); needs a root | 2 |

   Two stops the critics put on Y's ladder are **not** stops here, and the tree says why. `The accounts` does not mount on a project spread — `page.tsx:2202` gates `<AccountBand>` on `spreadSection !== 'project'`, and the comment at `:2197-2201` says a band gated on the live row "would print the accounts twice (or nowhere)". `Authorizations` is a **sub-rung of Money**, not a peer: `AuthorizationsLedger` renders inside `ProjectCommerceSection` inside `MoneyRegion` at `page.tsx:2122`. That nesting is F116's own evidence, and it is why a sub-rung and not a rung.

   **Extents come from data, never from the DOM (DC-02).** v1 read extents from region roots through a `ResizeObserver`, and X-4 had just made every unopened root its 112px reserve — the instrument measuring the thing the instrument erased. v2 derives each segment's extent from the counts the derivation already produces (`lib/document/ticket-derivation.ts:780-793`): FF&E from line count × row height + room count × head height, Money from its rung count, approvals from its record count. The ladder never measures a rendered body, so it does not move when crops resolve (v1's R2), does not flatten when a region is quiet, and does not walk when the document grows.

   **The floor, and what it costs (Dp-11).** Each segment takes a **24px floor** first — the 2.5.8 AA target minimum, on a 168px-wide row — and the remainder is distributed by extent. Six stops: `6 × 24 = 144` floor, `399 − 144 = 255` distributed. On the specimen FF&E is ~62% of the paper's data extent → `24 + 158 = 182px`; Money ~6% → `24 + 15 = 39px`. That is 4.7:1 drawn for a true 10:1, and **v2 withdraws v1's phrase "true proportional extent"**: the ladder draws *order and reach above a floor*, and the true scale is the number in the segment's own value line (`36 LINES · 4 ROOMS`). A drawing that lies about scale is worse than a drawing that says it is approximate and prints the count.

   **Room sub-rungs, and the room take (DC-08).** Under `Pieces`, each room prints an indented 24px sub-rung, **at every offset**, not only while Pieces is under the window. Six rooms print; a seventh and beyond collapse into `+3 MORE`, which opens the sheet. Each sub-rung carries `data-room-chip={room.id}` and `aria-pressed`, and calls `toggleRoom()` from `useRoomLens()` — the same contract `job-ticket.tsx:423-431` carries today. This matters because `responsive-document-shell.test.tsx:697-698` shows the ticket's `Rooms` row and its chips are the **only** way to take a room in hand; dissolving the ticket without rehoming that control loses an act. The **release** gets a second home in `FILED WITH THIS JOB` (below), so it is reachable at every offset — better than today, where it exists only in the letterhead at s0.

   **Values never yield.** X-6 silences a segment's *name* while its own head is in frame, because the paper is saying it at 24px Playfair. The **value** stays, at every offset, on every segment — which is where the install date lives (`INSTALL SEP 15 · 3 WEEKS`, on `Schedule`), where the deposit lives (`$17,500 OUT · $12,300 NOT DRAWN`, on `Money`), and where the damage lives (`36 LINES · 1 DAMAGED · CARRIER SEP 26`, on `Pieces`). v1 sent the install date to a slot X-8 swapped away and compressed the money row to one number; both are Dp-02 and Dp-05, and both are fixed by the rule that a value never yields.
4. **`FILED WITH THIS JOB`** — six 32px doors below a `--rule-hair`: `Plan room` · `Spec book` · `Mood boards` · `Call sheet` · `The record` · `Put down the room` (the last printing only while a room is held). F09 (high) says `BOARDS`, `DRAWINGS`, `SPEC` and `PEOPLE` vanish below the top; here they never vanish, at any offset, at either desktop width, **in words**. The heading is `FILED WITH THIS JOB` and not v1's `Kept with the job` because orders and receiving are studio ledgers, not this job's leaves; they stay one press away in the drawer's `Ledgers ↑`, at every offset, and SP-08 forbids a second door for them (Dp-19).
5. Nothing else. The timer and the presence line are evicted.

**Rail ink, computed at 1440 (900px rail, `pt-6` 24 / `pb-24` 96, both at `doc-spine.tsx:44`).**

| y | element | h |
|---|---|---|
| 24 | Put down | 44 |
| 80 | rail head (name · arc · stage) | 100 |
| 192 | `--rule-mid` | 2 |
| 202 | the ladder track | 399 |
| 601 | `--rule-hair` | 1 |
| 612 | `FILED WITH THIS JOB`, 6 × 32 | 192 |
| 804 | *(the `pb-24` edge)* | — |

Ink = 44 + 100 + 2 + 399 + 1 + 192 = **738 / 900 = 82.0%** (today 54.9%). Empty runs: 24 · 12 · 12 · 8 · 11 · **96**. **Longest empty run = 96px, and it is the `pb-24` padding.** v1 claimed 96px while its own table ended at y 719, leaving 181px — `measure-layout.mjs:284-289` runs the empty-run cursor to `spineRect.bottom`, so the claim was 85px wrong (Dd-08, DC-10). v2's doors end at the padding edge, so the claim is now true of the instrument that will measure it.

**At the 1180–1439 tier the rail is 800px tall in the brief's cell** (the measurement run used 1280×900 — `12-layout-measurements.json` `meta.viewports` — so both are stated). At 800: doors 512→704, rule at 501, track 202→501 = 299. Ink = 44 + 100 + 2 + 299 + 1 + 192 = **638 / 800 = 79.8%**, longest run 96px. At 900 the track is 399 and the figure is 82.0%. Either reading clears SC4; v1's single figure divided one stack by the wrong rail (Dd-07).

**Pre-work.** The track's height is fixed and the segments divide it, so a thinner spread gets **bigger segments, not a shorter rail** (SP-05). Four stops and four doors: floor `4 × 24 = 96`, distributed 303; doors 4 × 32 = 128 at y 676→804, rule at 665, track 202→665 = 463. Ink = 44 + 100 + 2 + 463 + 1 + 128 = **738 / 900 = 82.0%** (today 13.9%), longest run 96px (today 657px). That single mechanism is the whole answer to F12.

**What the metric is, honestly (Dd-44, DC-24).** `measure-layout.mjs:245-253` counts an element as ink over its whole rect if it has own text, a background **or a border**. The ladder's segments are `--rule-hair`-bordered, so the track reads as continuous ink whatever it paints. X therefore states SC4 twice: **82.0% by the instrument**, and — counting only painted marks (glyphs, rules, ticks) — roughly **44%** of the rail carries a mark. The claim X makes is the first one, and the word for it is *structured, not empty*: the 657px pre-work run and the 270px foot run are gone whichever way you count.

**S5 — the width, answered (DC-09, Dp-14).** `200 + 1040 + 232 = 1472 > 1440`, so at exactly 1440 the paper column is 1008px and `max-w-[1040px]` (`page.tsx:1791`) is never reached; with `px-12` that is 912px of measure. **At ≥1440 the rail stays 200px.** Narrowing it to 160 recovers 32px of measure at exactly 1440 and nothing at all at 1472 and above — three characters on a 15px line — and costs the rail 40px of its own 168px inner measure, which is the whole of the ≤40-character value line, the ladder's entire payload. Refused with the number, in §11.

**At 1180–1439 the rail widens from 56px to 136px, and prints words** (SP-11 branch a). E1 §4 priced widening at `weeks` because it moves the paper's x-origin. The arithmetic says it does not, at this tier: `page.tsx:1764` gives `min-[1180px]:grid-cols-[56px_minmax(0,1fr)]` and `<main>` is `max-w-[1040px] justify-self-center` (`:1791`). At the tier's floor, 1180 − 136 = **1044 ≥ 1040**, so the paper is at its cap and the measure is unchanged at every width from 1180 to 1439. 140px is the exact break-even; 136 leaves 4px of slack. Inside `px-3` the measure is 112px:

- `Put down` prints its word (13px, ≈ 62px) — one mid-word break gone (F07).
- The head prints `Vandersteen` (78px), the arc, and `PROCUREMENT` / `& ORDERS` / `4 OF 6` — wrapped at spaces, never mid-word. F07's `Project` / `ACTIV` / `E` is gone with the caption it lived in.
- Every segment prints its **name** (`Client approvals` wraps to `Client` / `approvals`, at a space) and, where it carries a number or an exception, a **≤15-character** compact value: `1 OVERDUE · 6D` (14), `$17,500 OWED` (12), `1 DAMAGED` (9), `INSTALL SEP 15` (14). 15 × 7.15px = 107px inside 112px. The full ≤40-character value returns in the sheet on press — as an addition, not a substitution.
- Every door prints its word: `Plan room`, `Spec book`, `Mood boards`, `Call sheet`, `The record`. No glyph is invented; C20 is untouched. v1 printed "no words at all" here and budgeted 160px for five unnamed marks (Dd-09, Dd-10, DC-18, Dp-04, Dp-06, Dp-10).
- **Identity stays on the paper's own furniture**, not in app chrome. v1 put the household in `studio-drawer.tsx:120-130`'s `breadcrumbFor()`, which is `function breadcrumbFor(pathname: string | null): string | null` — a pure pathname→string map with `if (pathname.startsWith('/doc')) return 'Document'` at `:128`, inside a component mounted outside the document tree. That was never "one function" (DC-05), and it put the job's name in the strip F03 measures printing `Find anything` over `IN HAND TODAY`. **v2 deletes that change entirely.**

**Mount-order consequence.** `doc-spine.tsx` keeps its position at `page.tsx:1777` and its `<aside>` root. Inside it: child 2, the arc `<ul>` at `:64`, **stays**; child 3, the active caption at `:122-136`, is absorbed into the head; child 4's `shelved` slot at `:141` becomes the ladder and stops being gated at `min-[1440px]`; children 5 and 6 (`CompactSpineTimerDoorway` at `:143`, the `SpineTimer` + presence wrapper at `:145-155`) no longer mount.

**Tab order, stated (Dc-24).** `DocSpine` is a sibling `<aside>` mounted **before** `<main>` (`page.tsx:1777` against `:1789`), so every rail control is a detour before the paper's first act. Counting the rail's new contents naively gives 21 stops. X therefore wraps the ladder, its sub-rungs and the doors in one `<nav aria-label="This paper">` with a **roving tabstop** — arrow keys move within, Tab leaves — so the count from page load to the paper's first act is: `Put down` → the arc (roving, 1) → the ladder (roving, 1) → the doors (roving, 1) → `<main>`. Four. No new iconography, no `tabindex` above 0.

### The header — the stack above the first region head

**Before, measured at 1440/s0** (`rich.1440.s0.headerStack`): letterhead 36→225.31 (**189.31px**) · ticket 243.31→590.56 (**347.25px**) · needs-attention 590.56→743.31 (**152.75px**) · instruments 747.81→791.81 (**44px**) · a folded approvals seam 791.81→847.31 (**55.5px**) · schedule frame 847.31→949.81 · first `[data-region-head]` (`schedule`) at **1005.31**, in a 900px frame — **111.7%**. One full letterhead-scroll later it is still 60.7% (F11).

**After.** Three blocks, none of them sticky.

| Band | X | px |
|---|---|---|
| `<main>` `pt-8` (`page.tsx:1791`) | unchanged | 32 |
| Letterhead `pt-3.5` (`doc-letterhead.tsx:51`) | unchanged | 14 |
| `lg` StrataMark row (`:52-54`, `mb-2.5` + 34) | **unchanged — the arrival mark stays** | 44 |
| `<h1>` 40px / 1.08 (`:58-60`) | unchanged | 43 |
| HouseholdChip `mt-1.5` + 23 | unchanged | 29 |
| Vitals row (`letterhead-vitals.tsx`) | **empty fields suppressed; `PHASES ▸` deleted** — 0px on the Chen seed, 21px on the specimen | 0 / 21 |
| In-hand room row (`doc-letterhead.tsx:67-77`, `mt-2.5` + `min-h-11`) | **moves to the rail's doors** | −54 → 0 |
| Letterhead `pb-5` → `pb-4` + `doc-rule-mid` | −4 | 18 |
| **letterhead subtotal** | | **148** (today 189.31) |
| `--doc-region-gap` | new token | 24 |
| **The needs band** — `RedLetterZone` XOR `DocumentGuide` in one wrapper at a **reserved** height | **136px**, both branches, from first paint | 136 |
| `--doc-region-gap` | | 24 |
| Approvals `RegionRule` 6 → head padding 8 | | 14 |
| **first `[data-region-head]`** | | **378** |

**SC1 = 378px** at 1440 at rest on the measured Chen spread — 42.0% of the frame, against 1005.31px and 111.7%. Recovery **627.31px**. On the Vandersteen specimen the vitals row carries real values and prints its 21px, so **SC1 = 399px**, still inside the ≤405 threshold. Both numbers are stated because the specimen is the world the design must survive and the seed is the world the JSON measured.

Five moves get it there.

1. **The ticket dissolves** (M-7). −347.25px, the largest single recovery on the page. `lib/document/ticket-derivation.ts:780-793` keeps producing the same eight rows and `lib/document/__tests__/ticket-derivation.test.ts` stays green; nothing renders them as a table. Every row's destination is in Appendix B, and every destination exists at every scroll state.
2. **The instruments move into the letterhead's ledger column — at ≥1180 only** (−44px). They ride the title line's right column in the two-track grid `region/region-head.tsx:118-121` already uses. That grid is `grid-cols-1` below 1180 and two-track only from 1180, pinned by `region/__tests__/region-head.test.tsx:110-121`, so at 390 the ledger would stack and the cost would not be zero (DC-14). **At 390 the instruments stay exactly where they mount today**, and the 390 budget below carries them. The move also fixes F100 and F136: two of the four acts address a client the letterhead says is not linked, and the ledger's election drops an act with no subject.
3. **The needs band reserves 136px, both branches, sized on the specimen.** F79 measured a **0.1189** layout shift firing 3.3–3.6s in when the schedule banner arrives from a query — 92% of the page's CLS, present in both motion registers (F24). F154 says the guide and the red letter have different heights, so which one renders moves everything below it. v1 reserved 152px — the red-letter branch's measured height — which meant every guide document held 16–72px of permanent white and read as a block that failed to load (Dd-11, Dp-17). v2 reserves **136px**, which is the red-letter branch minus the 16px of outer padding `--doc-region-gap` now owns, and which the guide branch fills with its sentence *and* the document's one next act. Inside that height the band prints **two** exceptions with their acts — what the shipped block prints today — plus `+2 MORE · LEDGERS ↑`, which names a real destination: the drawer's ledgers row (`studio-drawer.tsx:115`'s `STUDIO_BOOKS`), not v1's unnamed "the ledger" (F50, Dd-24). **The truncation rule**: an exception line longer than its two rendered lines truncates its *subject*, never its number or its day count; a third and later exception is counted, never dropped. This is sized on the specimen's longest live `deriveTicketSeam` exception, not on the seed's 152.75px (DC-19).
4. **The letterhead's vitals stop printing dashes.** F129 measures `START — TARGET — SET A BUDGET BAND PHASES ▸` and F134 records that `PHASES ▸` "opens and reveals nothing" while "nowhere does the frame print my phase as `4 of 6`". Empty fields are suppressed and `PHASES ▸` is deleted, because the phase count now prints on the rail head at every offset (Dp-47).
5. **The in-hand room row leaves the letterhead for the rail.** `doc-letterhead.tsx:67-77` is a conditional 54px row (`mt-2.5` + `min-h-11`) that v1's 128px letterhead had no slot for, and that would have pushed SC1 to 422 (DC-27). In the rail's doors it is reachable at every offset instead of only at s0.

**H3 — what is at scroll 0.** The lens opens **open**. Arrival is worth something and the letterhead is the moment of it: the mark, the name, the household, the acts. It costs 148px, it happens once, and it leaves. F56 records that a returning reader is dropped at `[data-active-section]` and can land with the household already scrolled off; under X that landing is safe, because the rail head prints the household at the offset she lands on — and every standing exception is on the ladder's value lines in that same frame (Dp-44).

**H4 — the one reversing act.** There is no lens line to reverse, because there is no lens line on the paper. The letterhead comes back the way a letterhead comes back: she scrolls up, presses `Home`, or presses the rail head. **The rail head is a `<button>`** carrying the shipped scored-ink grammar — the `da-score-hover` class and the `focus-visible:outline-2 outline-offset-2 outline-[var(--color-clay)]` ring `doc-spine.tsx:49-52` already uses on `Put down` (Dc-23, Dc-12). Its state is readable without hover at every offset: the head is printed.

**H5 — zero layout shift, by mechanism.** (a) Nothing on the paper is sticky, so no element's height can change while it is fixed over the reading line. (b) **A region's height changes only while the entire region, and every pixel above it, is below the frame's bottom edge** (X-4). (c) A region she has already passed never changes height again, this session (X-5). (d) The needs band's height is reserved before its query resolves. (e) The `--doc-seam-height` writer is retired, so the value four consumers read cannot change mid-scroll.

v1's version of (b) was *"a region never changes height while any part of it is visible"* — sound for a region below the frame and false for one above it. Collapsing FF&E from 1,840px to 112px at 120px above the frame top pulls 1,728px of document up under her, and v1 named no correction anywhere. Three critics found it independently and it is the program's sharpest finding (Dd-01, DC-01, Dp-01). **v2 does not correct it; it forbids it.** Y answers the same defect with a same-frame `scrollBy(−Δ)` and calls it its own Rank-1 risk; X removes the case in which a correction would be needed. The cost — a region she has passed keeps its full height and its full DOM — is paid by X-5's `content-visibility: auto` with `contain-intrinsic-size: auto`, which skips its rendering without changing a pixel of its box, and which F61's killer clears: `.has-wash` already declares `isolation: isolate` (`globals.css:322-325`), so every washed row is its own stacking context today and containment changes nothing about the R126 wash. v1 refused that mechanism on E1-08's grounds and paid a week and a whole risk register entry to a finding the refutation wave had already killed (Dp-18, Dp-42).

**Mount-order consequence in `page.tsx`.** `JobTicket` no longer mounts — `:1829` and the `JobTicketMount`/`ProjectlessTicketMount` composition at `:1714-1748` are deleted, and with them the sentinel `#doc-ticket-sentinel` (`job-ticket.tsx:347`) and the `ticket={jobTicket}` handoff to `worktable/table-frame.tsx:61`. `RedLetterZone`/`DocumentGuide` (`:1838-1847`) mount inside one `<div data-needs-band>` wrapper. `LetterheadInstruments` moves inside `doc-letterhead.tsx` at ≥1180 — **and `<FolioLetterhead projectId={row.project_id} />` at `page.tsx:1871`, which shares the same `row.engagement_kind === 'project'` fragment at `:1863-1874`, stays exactly where it is** (DC-16). Everything from `MobileMarginChips` (`:1884`) down is unmoved, so the `data-active-section` → `<SectionStageLineMount` window at `:1942`–`:1964` is untouched by the header work.

### Region heads and spacing

**Before.** F73, measured button-to-button at every width and every scroll state: header-stack-end → `Schedule` **56px**, `Schedule` → `Pieces` **29px**, `Pieces` → `money-head` **6px**. The call-site table in `research/10-code-anatomy.md` §6 has the sharpest case: approvals open is `mt-6 … py-6` (`approvals/project-approval-document.tsx:586`) and approvals folded is a bare `<div data-index-region="approvals">` with no wrapper at all (`:565`) — folding a region silently changes the gap around it.

**After (SP-01).** One token, `--doc-region-gap: 24px`, owned by the region wrapper rather than the call site, identical whether the region is full, quiet or folded.

*Adopters:* the needs band · approvals (`project-approval-document.tsx:565`, `:586`) · the schedule frame (`schedule/schedule-rule-region.tsx:181`, `:199`) · the schedule ledger (`schedule/schedule-spine.tsx:1055-1060`) · FF&E (`ffe-section.tsx:1204-1210`, `:1290`) · money (`commercial/money-region.tsx:227-230`, `:248-251`) · the care band (`care-band.tsx:215`, `:235`, `:249`, `:303`) · the direction/proposal head (`page.tsx:2006`) · The Record (`previous-work.tsx:37`).

*Exceptions, two, both structural.* **The colophon** keeps `mt-14` (`doc-colophon.tsx:102`) because it ends the paper rather than seaming two regions. **The FF&E room heads** take half the token, **12px**. v1 cited `ffe-section.tsx:1213` and Y cited `:1302`; both are wrong — `:1213` is the install-branch `<h2>` wrapper and `:1302` is the `RegionHead` wrapper. The room head is `RoomHeading`, whose own wrapper is at **`ffe-section.tsx:618-620`** and carries `mt-4` (16px) today. v2 sets that site to 12px, so a room reads as inside Pieces rather than beside it, and the plank's ruler-on-the-PNG test has one number and one line to check (Dd-21, Dp-43).

**R2 — reading-line density, precisely.** Two densities, not three. `full` is the ratified R126 weight with nothing withheld. `quiet` is **the head, one ≤40-character status line, and the region's one inked leader act**, all at full ratified ink, with the space to the reserved height left as bare paper (SP-12). Three printed things, not v1's two: the leader stays, because C7 says one inked leader per region with overflow always visible, and v1's answer — a rail act cell that printed only for the region whose head had just left the frame — left every other quiet region with no act at all (Dp-12).

- Do **acts** print at reduced density? The one inked leader does. The overflow group does not; it returns when the region opens.
- Do **exceptions** ever go quiet? Never. The ≤40-char line prints the exception first, and the segment's value carries it on the rail regardless.
- Does a **number** ever soften? No. F74 leaves room for one small step and X does not spend it. Quieter means **fewer words**, never fainter ones.

**The ≤40-character line, per region (Dd-12).** On the Vandersteen specimen:

| Stop | Quiet line | chars | Leader act |
|---|---|---|---|
| `Client approvals` | `2 AWAITING · 1 OVERDUE 6D` | 25 | `SEND A REMINDER` |
| `Schedule` | `INSTALL SEP 15 · 3 WEEKS` | 24 | `MOVE THE DATE` |
| `Pieces` | `36 LINES · 4 ROOMS · 1 DAMAGED` | 30 | `SPEC THE 3 UNSPECIFIED` |
| `Money` | `$17,500 OUT · $12,300 NOT DRAWN` | 31 | `DRAW AN INVOICE` |
| `Closing the book` | `0 OF 6 CLOSED OUT` | 17 | `START THE CLOSE` |
| `The record` | `12 COMPLETE` | 11 | `OPEN THE RECORD` |

On a pre-work spread (the Byrne proposal, after Wave 5):

| Stop | Quiet line | chars | Leader act |
|---|---|---|---|
| `Design vision` | `3 BLOCKS` | 8 | `EDIT THE VISION` |
| `The pieces proposed` | `18 LINES · $84,200` | 18 | `OPEN THE SCHEDULE` |
| `Terms & signature` | `SENT AUG 19 · UNOPENED 6D` | 25 | `NUDGE THE BYRNES` |
| `The record` | `NOTHING YET` | 11 | — |

The install and care spreads take the project spread's subset, per `document-index.ts:70-76`'s `WORK_SPREAD_REGIONS`.

**R3 — folded-by-choice versus quiet-by-position, in a still (SP-02).** Four readings, four marks:

| Reading | Rule above | Head | Line | Verb | Cause, printed |
|---|---|---|---|---|---|
| **full** | `--rule-strong` double | 24px Playfair | status + up to two exceptions | `FOLD ↑` in the ledger | — |
| **quiet (by position)** | `--rule-strong` double | 24px Playfair, unchanged | the ≤40-char line + the leader, full ink | none | — |
| **folded (by her)** | `--rule-mid` single | italic name, mono summary | the fold summary | `UNFOLD ↓` | **`CLOSED BY YOU`** |
| **empty** | `--rule-strong` double | 24px Playfair | `NOTHING YET` | none | — |

v1 carried the cause on a 2px `--color-clay` gutter tick — a colour a designer has to learn, drawn in an ink `contrast.test.ts:319-325` asserts is below AA on rail stock. **v2 prints the words.** Law 4 asks for a state readable by someone who did not perform the transition, and a sentence settles that where a tick does not (Dd-13, Dp-20).

The `--rule-mid` step on a folded region happens at three call sites, named because v1's mount-order note claimed every change was inside a region's own wrapper: `commercial/money-region.tsx:233`, `schedule/schedule-rule-region.tsx:182`, and `approvals/project-approval-document.tsx`'s rule. `region/region-rule.tsx` already takes `weight="mid"` (`:17-22`) and is not edited (DC-21).

**The mark that ends F54, F89 and F93.** X retires the latched derived default as a *fold* — it becomes the region's initial *density* instead. After that change **a `FoldSeam` can only ever mean "you folded this"**, and `CLOSED BY YOU` says so. That change has a visible consequence on the first screen of every project document, which v1 did not name: `Client approvals` and `Schedule dates` are both folded by a derived default today (F89, visible in `w1440-rich-s0.png` as `Client approvals  NO DECISION LEAD · NO APPROVALS AUTHORED  UNFOLD ↓`), and they will **open on arrival** (DC-29). That is the intended change — a folded approvals seam prints no `[data-region-head]`, which is why the first head measured today is `schedule` at 1005.31 and not `approvals` at 791.81 — and it is why SC1 is credited to the wave that makes it (§9, Wave 3).

*The collision.* A region both folded by her and out of frame prints the fold seam, unchanged. Her fold outranks position (SP-07); the segment keeps printing its name and value because the paper is not showing them.

*The returning designer.* She folded Money three weeks ago; `patina:doc-fold:{docId}:money` outlived the session. She returns, the seam is there, `CLOSED BY YOU` is beside it, and the money segment prints `$17,500 OUT · $12,300 NOT DRAWN` at its extent. The fact is on screen; only the body is closed, and it is closed because she closed it.

**Two printed forms for zero (SP-02, F156, Dd-22).** **`NOTHING YET`** — the region exists and is empty. **`NOT KNOWN YET`** — the value is not knowable on this spread. Two sentences, everywhere, replacing today's `no budget yet` / `NO DECISION LEAD · NO APPROVALS AUTHORED` / `No rooms yet` / `Nothing filed` / `Nobody on it yet`. v1's second form was `—`, and F108 already records a fallback string printing identically to a live value; a dash is the same mistake in one character.

**Mount-order consequence.** None in `page.tsx`'s child order. Every change is inside a region's own wrapper, in `region/region-head.tsx`, or at the three rule call sites named above. `region/__tests__/region-head.test.tsx:110-121` stays green: X does not collapse the head's two-track grid.

### The margin — `components/document/margin-rail.tsx`

**Before.** 232px sticky column at ≥1440. F17: at top, seam, mid and foot it prints the same seven chips in the same order. F28: nine wrapped lines of first-touch prose, ~230px, above `IN THE MARGIN` and the first chip. F19: at 1280 the only affordance is a tab reading `MARGIN ←` with no count.

**After.** The margin gets its room **vertically**, which is where it was cramped.

1. **The first-touch note recedes for good.** −230px at every state after the first. It is already once-per-person (`margin-note.tsx:9-11`); X stops giving it 230px of permanent column while it waits to be seen. Chips start at y≈120 instead of y≈350.
2. **The margin lifts, it does not filter** (M-4 adapted). Two printed groups: **`BESIDE PIECES · 3`** — items anchored to the region currently at full — then **`THE WHOLE JOB · 4`**. Nothing leaves; items rise and fall between two named groups. That is the room lens's own ruling applied to the margin, and it answers F17 without pinning anything to the paper.
3. **Empty is printed, not blank.** `NOTHING BESIDE PIECES YET` under the first heading (F19, one level in).
4. **The 1180–1439 tab prints its count and its worst kind**: `MARGIN · 7 · 1 OVERDUE`. A printed count in a label, not a badge on the drawer.
5. **Chips stop printing the same string twice** (F133) and stop printing seed copy (F160): `margin-item.tsx` suppresses a title identical to its own derived kind line.
6. **The one fact the margin must not repeat.** When the needs band or a ladder segment is naming a fact, an item anchored to that same fact prints its kind and its subject, never the figure — the band and the segment own money at s0/s1, the segment alone owns it below (Dc-06, Dc-07's mirror, DC-13).

**R4 — what the 232px holds versus the paper's gutter.** *About a line in this document* → a chip in the `BESIDE` group, anchored by the existing line-highlight wire (`margin-item.tsx:36-42`). *About the whole document* → `THE WHOLE JOB`. *Drafts, handoffs* → below both, unchanged, folded. *Presence* → leaves the margin for the drawer. X does **not** move chips onto the paper: a decision about the whole document has no line to point at, and `margin-item.tsx:46` carries one of the three legal `--elevation-sheet` sites, so a pin in the gutter would put a shadow on the paper.

**R5 — which tenses survive at rest.** At s0 the `BESIDE` group is empty and says so in one line; `THE WHOLE JOB` carries everything. At s2, editing an FF&E line, `BESIDE PIECES` carries the damage note and the PO chip. The margin is the one organ that *gains* as the lens focuses, and what it gives back is order, not content.

**What the margin gave up to take nothing, and what the rail gave up to take the doors (Dp-46).** Said plainly, because the ask names both organs. The rail sheds the timer (~210px, F26) and the presence line (~40px) and takes on 192px of doors — a net gain of ~58px of rail stock and a swap of two tenses for one. The margin sheds 230px of first-touch prose and takes on nothing; its two group headings cost ~40px. Neither organ receives the other's furniture: the doors come from the ticket, which is deleted, and the margin's recovery is a deletion. That is the accounting v1 owed and did not print.

**Mount-order consequence.** `MarginRail` stays where it mounts (`page.tsx:2316-2334`), still last in linear tab order (F132 — refused, §7). Inside `margin-rail.tsx`, item 1 (the first-touch note, `:462-468`) becomes conditional-once; items 9 and 10 (`{raised.map(renderItem)}` at `:634`, the settled fold at `:640`) are partitioned into two printed groups. **`classifyMarginItems` and `MarginDecisionClassificationNotice` stay imported and referenced**, and so does `legacyCoordinationDrafts(coordItems ?? [])` — `lib/document/__tests__/stage2-approval-cutover-contract.test.ts:50-58` and `:60-63` are source-literal contracts over this file, `mobile/mobile-margin-chips.tsx` and `mobile/mobile-sheets.tsx`, and a rewrite that drops an import turns them red silently (DC-30).

### Motion grammar

The whole grammar is §3's table. Four rules govern it.

**M2 — what may animate on a condense.** Ink, weight, and a reserved height. Never a layout property while the element is visible. X goes further: a region's height changes only while it and everything above it are below the frame's bottom edge, so the question of an acceptable visible layout shift never arises.

**M3 — the threshold, and why there is only one.** v1 ran a 120px/40px hysteresis band in both directions and DC-... and Dd-02 both found the same hole: the band was measured against a box whose position the density decision itself moves, and the velocity gate is inert at rest, so a region could collapse, let the region below rise into frame, become `full`, push itself back out and quiet again — an oscillator at zero scroll velocity. **v2 has one threshold and no return threshold**, because there is no return: a region opens when its top comes within **one frame height** of the frame's bottom edge, and it never quiets again. There is no closing edge for an oscillation to sit on. One frame height and not a magic number, because it is the distance she can cover in one page-down, and because it makes the rule statable in one sentence: *the lens is always one screen ahead of her.*

**M4 — the ambient budget stays one.** `doc-breath` on the active StrataMark, 3s, `app/globals.css:271-283`, in the rail, at its shipped site. X names no second ambient move.

**M5 — reduced motion is a form, and here is which block it sits beside (Dc-08, Dc-25).** `app/globals.css` carries nine `@media (prefers-reduced-motion: reduce)` blocks — at `:283` (breath), `:439` (the wash), `:496` (the strata sweep), `:833` (scored ink), `:955`, `:1013`, `:1188`, `:1468`, `:1519` — plus the no-preference gate at `:429`. X adds **one** new block, and it sits immediately after `:283`, the breath's, because that is where the document's own motion is declared. It covers, by name: **X-2**'s 150ms ink swap, **X-6**'s 150ms name crossfade, **X-9**'s 150ms rule swap, and **X-11**'s 150ms head crossfade. **X-1** is the one row a CSS block cannot cover, and v1 asserted a CSS-only policy while specifying a JS behaviour change (DC-06): its rAF handler reads `matchMedia('(prefers-reduced-motion: reduce)')` and steps the bracket instead of tracking it. X states that plainly — the Document's motion policy is CSS-media-query-only **except for this one handler**, which is an amendment, not a claim of compliance. **X-4, X-5, X-10 and X-12** need no block: X-4 and X-5 have no transit, X-10 is arithmetic, and X-12's smooth-scroll branch already reads the query at `use-document-running-index.ts:206-214`. F104's note stands: none of the twelve existing blocks covers the ticket's pin/fold, because X deletes the element rather than giving it an animation to reduce.

**No in-product motion toggle (Dc-15).** 2.3.3 is AAA and the stated bar is AA; the OS query is the control. X names the position rather than leaving it unstated: the opening of a region ahead is essential to the mechanic, not a courtesy, because SC1's recovery and the render-cost control both depend on it. A dev-bar toggle exists for the mockup's probe (`window.__lensSettled()`, `settle()`) and is a QA instrument, not a product control.

### 390

**Before.** F40: the first region head lands at y 1054 in an 844 frame — 124.9%. F14 (blocker): the spine sheet lists only the seven stages, so `Client approvals`, `Schedule`, `Pieces` and `Money` appear nowhere and reaching Pieces means scrolling ~1,050px. F97: the eight ticket rows exist only after a tap on `UNFOLD ↓`. F48: five money chips take 29.6% of the frame. F121: chips at ~21–26px against 2.5.8's 24px floor.

**After.** The same lens, one column — and X says which strings are the same and which are a subset, rather than asserting parity it does not deliver (Dd-19).

- **The lens line is the mobile bar's left zone, and it carries one string.** `mobile/mobile-bar.tsx:212-232` is a 64px `fixed inset-x-0 bottom-0` bar whose left zone is `flex-[1_1_0]` (`:224`) around a `truncate`d 14px heading (`:230`). v1 put `Vandersteen · Pieces` there and claimed "same words at 390 as at 1440"; the zone shares 390px with the centre act and `MORE`, and the string will not print (DC-17, Dp-15). **v2 prints the household alone** — `Vandersteen`, ~11 characters at 14px ≈ 85px — in the slot that prints `Project` today, under the shipped `In this document` overline. The current region's name is the sheet's job, one tap away. **Stated subset:** at 390 the identity prints at every offset; the stage phrase and the current region print on the sheet. Axis 7's anchor asks for the same string at every width, and X does not meet it here; it meets SP-09, which is the plank.
- **F02 is answered by its killer, not by a fix.** The black circle overprinting `IN THIS DOCUMENT` in `m390-rich-s1.png` is the Next.js dev-tools indicator, not a product puck: `research/31-verified-findings.md:179` records "No product code draws a circular puck in the mobile bar". Nothing to move.
- **The spine sheet becomes the ladder.** The same six stops, the same names, the same ≤40-character values, drawn full-width. That is F14 answered and F94 with it. **Every sheet row is `min-h-11`** — 44px, well over 2.5.8's 24px floor, which v1 left as an open number (Dc-18).
- **The ticket is gone**, so F97's extra tap is gone. The header at 390: `pt-8` 32 + letterhead 191 (the 40px title wraps to two lines at 390; the instruments stay here, budgeted) + gap 24 + needs band **192** reserved (the measured `guideOrAttn` height at `rich.390.s0`, so a two-line exception cannot clip) + gap 24 + rule and padding 14 = **477px of 844 (56.5%)**, against today's 1054 (124.9%).
- **Margin chips sort the same way the margin does.** Line-anchored chips stay beside their line; whole-job chips move into the sheet under `THE WHOLE JOB · 4`. F48's 250px of unanchored money chips becomes one anchored chip and a counted heading. Chip padding goes from `py-[0.32rem]` to `py-1.5` (`mobile/mobile-margin-chips.tsx:98`, `:114`), clearing 24px (F121).
- **`Put down` gets its own row** at the top of the sheet rather than living behind More (F106).
- **Every sheet gets a name.** `mobile/mobile-sheets.tsx:260` sets `aria-label` only for `kind === 'timer'`; the `drawer`, `spine` and `margin-item` kinds get theirs (F43).

**Mount-order consequence.** None at the page level; `MobileBar` and `MobileSheets` keep their positions in `app/(document)/layout.tsx:92-93`.

---

## 5 · The lens state machine

Five states. Every transition carries its reverse, its focus destination and whether it announces.

### at rest
- **Lens line:** the rail head, 100px — the arc alone; the name and stage phrase are **yielded** while the letterhead is in frame (X-11).
- **Rail:** full ladder; the window brackets the top of the track.
- **Regions:** every region intersecting the frame is `full`; every region whose top is within one frame height below the bottom edge is `full`; everything further down is `quiet` at its data-derived reserve.
- **Margin:** `IN THE MARGIN` head, `NOTHING BESIDE — YET`, `THE WHOLE JOB · 4`.
- **Entry:** arrival at scrollY 0; `Home`; pressing the rail head.
- **Exit:** any scroll past 1px.
- **Reverse:** scrolling back to 0 restores it exactly. Nothing about this state is persisted.
- **Focus:** unchanged by the transition. **Announces:** no.

### reading
- **Lens line:** the rail head prints all three registers the moment the letterhead's box leaves the frame (X-11's reverse).
- **Rail:** the window tracks the frame; the current segment's **name** has yielded (X-6); every segment's **value** prints.
- **Regions:** every region intersecting the frame is `full` — at 1440 that is one or two, never more, never zero. Every region she has passed stays `full` and takes `data-passed`. Every region more than one frame below is `quiet`.
- **Margin:** `BESIDE {region}` carries the items anchored to the region under the window.
- **Entry:** the region's top coming within one frame height of the frame's bottom edge, after the X-10 settle.
- **Exit:** there is none. A region that has opened does not close. This is the state machine's one asymmetry and it is deliberate: the reverse of *opening ahead of her* is *nothing*, which is the only reverse that cannot move the paper under her.
- **Focus:** never moved by a scroll-driven transition. No transition in X unmounts an element focus is in, because no transition in X unmounts anything she has reached (SP-06).
- **Announces:** once, on settle, in one `aria-live="polite"` region on the visible `[data-lens-window]` element: `Pieces · 36 lines · 1 damaged`. **At most one announcement per distinct region** — scrolling back and forth across one boundary announces once, not once per settle (Dc-21, Dc-22).

### editing
- **Lens line:** unchanged. **Rail:** unchanged.
- **Regions:** the edited region is `full` by definition and cannot quiet at any offset. Its siblings are unchanged — X has one dimming system and it is none: the edited line gets **more** ink, its siblings get none taken away (M-6 as ink weight only).
- **Margin:** the `BESIDE` group holds; chips do not reorder while a control has focus.
- **Entry:** `focusin` on an editable control inside a region body.
- **Exit:** `focusout` with no editable control taking focus, or commit.
- **Reverse:** the clay-ink rule returns to `--rule-hair` over 150ms; the wash closes over 200ms, exactly as it does today.
- **Focus:** by definition, held. **Announces:** no — an edit is her act and needs no narration.

### condensed
This is the state of a region **she has not yet reached** — the only condensed state X has.
- **Lens line:** unchanged. **Rail:** the segment draws at its data-derived extent and prints its name and value, because the paper is not showing them.
- **Region:** head at 24px Playfair, one ≤40-char line at full ink, the region's one inked leader, bare paper to the reserve (68px, or 112px with a standing exception). No verb, no seam, no italic.
- **ARIA (Dc-20):** the root carries `data-density="quiet"` and `aria-describedby` pointing at a visually-hidden `Opens as you reach it.` A screen-reader user arriving by heading navigation is told the state a sighted reader reads from position — which SP-02's visual discipline does not otherwise give her.
- **Margin:** its anchored chips sit in `THE WHOLE JOB`; the counts on both headings change.
- **Entry:** first paint, for every region more than one frame below the fold.
- **Exit:** its top coming within one frame height of the bottom edge.
- **Reverse:** none, by design (see `reading`). Also reachable in one act from the rail — pressing the segment forces every region between here and there to `full` in one commit, then scrolls (X-12).
- **Focus:** cannot be inside it — she has not reached it, and nothing focusable is unmounted after she has. **Announces:** no.

### mobile
- **Lens line:** the mobile bar's left zone, the household alone, inside `min-h-[64px]` (`mobile/mobile-bar.tsx:216`).
- **Rail:** the spine sheet, on demand, drawing the same ladder full-width at `min-h-11` per row.
- **Regions:** identical rules, with the threshold measured against the 844px frame.
- **Margin:** anchored chips beside their lines; whole-job items in the sheet under a counted heading.
- **Entry:** viewport below 1180 (`doc-spine.tsx:44`, `margin-rail.tsx:258`).
- **Exit:** viewport at or above 1180.
- **Reverse:** the sheet closes and the rail draws the same ladder at the same position — the position is derived from data and scroll, never stored, so there is nothing to hand across the breakpoint and nothing to lose.
- **Focus:** the sheet takes and returns focus through the existing managed-modal path. **Announces:** the same single live region.

**Focus destination on a press (Dc-09).** Every press on a segment, a sub-rung or a door lands focus on the target region's `<h2>` through `regionHeadingId` (`lib/document/document-index.ts:93-102`) and the shipped `focusRegionHeading` contract (`region/fold-seam.tsx:41-44`). For the explicit `FOLD ↑`, focus parks on the newly-rendered `FoldSeam` — the mirror of the already-correct unfold. No transition in X leaves focus on `<body>` (SP-06, F08, F41).

---

## 6 · Frame budget

Against `research/12-layout-measurements.json`. Buckets are the file's own 1-pixel-row partition: **chrome** (studio drawer / mobile bar, plus the pinned seam while it is the collapsed sticky band) → **header/summary** → **active region** → **other**. All targets are on the measured Chen spread, so they are comparable with the "today" column.

### 1440 × 900, rich project spread

| State | Today chrome / header / work / other | X target chrome / header / work / other | What moved |
|---|---|---|---|
| s0 | 6.7 / **81.8** / 0.0 / 11.6 | 6.7 / **37.8** / **52.9** / 2.6 | ticket −347.25px; instruments −44px; letterhead −41.31px; band 152.75 → 136 |
| s1 | 6.7 / **60.7** / 10.4 / 22.2 | 6.7 / **15.1** / **75.5** / 2.7 | the 136px needs band is the only header left |
| s2 | **13.9** / 0.0 / 86.1 / 0.0 | **6.7** / 0.0 / **93.3** / 0.0 | the 64px seam is gone from chrome; the frame is the work |
| s3 | **13.9** / 0.0 / 50.9 / 35.2 | **6.7** / 0.0 / **58.1** / 35.2 | the seam's 65px only — §11.6 says why nothing else at the foot moves |

### 1280 and 390

| Cell | Today | X target |
|---|---|---|
| 1280 × 900 s0 | 6.7 / 81.8 / 0.0 / 11.6 | 6.7 / 37.8 / 52.9 / 2.6 (the paper is identical at both desktop widths) |
| 1280 × 900 s1 | 6.7 / 60.7 / 10.4 / 22.2 | 6.7 / 15.1 / 75.5 / 2.7 |
| 1280 × 900 s2 | 13.9 / 0.0 / 86.1 / 0.0 | 6.7 / 0.0 / 93.3 / 0.0 |
| 1280 × 900 s3 | 13.9 / 0.0 / 50.9 / 35.2 | 6.7 / 0.0 / 58.1 / 35.2 |
| 1280 × 800 s0 (the brief's cell) | — not measured | 7.5 / 42.5 / 47.0 / 3.0 |
| 390 s0 | 9.1 / 71.0 / 0.0 / 19.9 | 9.1 / 52.0 / 36.0 / 2.9 |
| 390 s1 | 9.1 / 48.5 / 0.0 / 42.4 | 9.1 / 22.7 / 65.3 / 2.9 |
| 390 s2 | 16.8 / 0.0 / 83.2 / 0.0 | 9.1 / 0.0 / 90.9 / 0.0 |
| 390 s3 | 16.8 / 0.0 / 26.2 / 57.0 | 9.1 / 0.0 / 33.9 / 57.0 |
| prework 1440 s0 | 6.7 / 79.9 / 2.8 / 10.7 | 6.7 / 37.8 / 52.9 / 2.6 |
| prework 1440 s1 | 6.7 / 59.0 / 27.7 / 6.7 | 6.7 / 15.1 / 75.5 / 2.7 |
| prework 1440 s3 | 13.9 / 0.0 / 66.8 / 19.3 | 6.7 / 0.0 / 74.0 / 19.3 |

### What the quiet regions cost the frame, counted (Dd-23)

A critic asked, correctly, where the budget counts the stubs. Here:

| Cell | Region heads in frame below the first head | Stub height each |
|---|---|---|
| 1440 s0 | approvals at `full`, then **at most 3** quiet heads in the remaining 462px | 68px, or 112px with a standing exception |
| 1440 s1 | approvals and schedule at `full`, then **at most 2** | same |
| 1440 s2 | **0** — she is inside Pieces, and everything above her is at full height | — |
| 1440 s3 | **0** — every region above her opened as she passed it | — |

That table is the whole of X's answer to *a screen of nothing but region heads*, and it holds because the lens only ever opens forward. Stubs exist only below the reading line, only before she has reached them, and only at the top of the document. At s0 that is not clutter; it is the paper's own table of contents, on the paper, at rest — three region names with their counts, which today is a screen of ticket rows printing absence (F27: five of eight rows print only absence, 180px of a 900px frame).

### The four criteria

| # | Criterion | Threshold | X target | Basis |
|---|---|---|---|---|
| **SC1** | first `[data-region-head]` y at 1440, at rest, scroll 0 | ≤ **405px** (today 1005.31) | **378px** on the measured Chen spread (42.0%); **399px** on the Vandersteen specimen, where the vitals row has values to print | the band table in §4: 32 + 148 + 24 + 136 + 24 + 14 = 378; + 21 vitals = 399 |
| **SC2** | condensed header band height at 1440 | ≤ **108px** | **0px**, at every scroll offset — **and X says plainly this is satisfied by deletion, not by design** | nothing on the paper is `position: sticky`; `job-ticket.tsx` is deleted and its `sticky top-0 z-[4]` (`:362`) with it |
| **SC3** | lens-line height at scroll 0 / 400 / 1200 | ≤ **64px**, same at 400 and 1200 | **not applicable to a header band — the organ is deleted.** The probe measures the rail head instead: **100 / 100 / 100** | the rail head is a reserved block, not a measured one; the arithmetic is in §4 against `doc-spine.tsx:57-63`'s own 168px measure |
| **SC4** | rail utilisation `inkPx / railHeightPx` at 1440 | ≥ **70%** project (today 54.9%), ≥ **55%** pre-work (today 13.9%) | **82.0%** project, **82.0%** pre-work; **79.8%** at 1280 × 800 | the rail budget table in §4; the mechanism is the fixed-height track the segments divide. See §4 for what the instrument counts |

SC3 is over the brief's 64px and X says so rather than reporting a number against an organ it deleted (Dp-22). The 100px is not a band over the paper; it is 100px of a column that costs the work zero vertical pixels, and it holds the seven stage doors at their shipped 44px targets.

**Where a claim moves on the specimen.** The seed carries 3 FF&E lines and 0 rooms (F05). On the Vandersteen's 36 lines across 4 rooms the paper is roughly 2.4× taller, and X's numbers move in one direction: **the recovery gets larger**. SC1 moves +21px, for the vitals, and is stated above. SC4 moves up, because the Pieces segment carries four room sub-rungs. The one number that moves against X is s2's `activeRegion` share, which F91 already flags as over-counted today (433 of 775px at rich/1440/s2 is empty-state prose) — on the specimen that 433px is real work.

**A target this brief names that X argues is wrong.** SC11 asks for *exactly one* region at `full` at any offset. X refuses that number: a design where a region's height never changes while any part of it, or any pixel above it, is in frame must hold every region touching the frame at `full`, and at 1440 that is one or two. The replacement: **every region intersecting the frame is `full`; every region she has passed stays `full`; never zero.** SC12 follows: the rail's `data-reading-index` names the region under the window's midpoint, and with six stops covering the whole paper it is never null while the paper is in view — which v1, with four segments and 1,508px unindexed, could not promise (Dd-03).

**And what the density system does not buy (Dd-48, DC-... conceded).** Not one cell above attributes a percentage point to a region being quiet, and none could: a region entirely out of frame occupies zero of the frame at 1,840px and at 112px. The recovery is the ticket, the instruments and the letterhead — three deletions. X therefore narrows the claim it makes for density to two things it can show: **render cost** on the unvirtualized 1,549-line `ffe-section.tsx` (F53), which the shipped fold already provides and which X preserves rather than replaces; and the arrival table of contents counted above. Everything else the mechanism used to cost — a hysteresis pair, a velocity gate in the layout path, a focus guard against unmounting, a scroll correction — is gone with the one-directional rule.

---

## 7 · Findings addressed

Every verified **blocker** and **high** in `research/31-verified-findings.md` — 7 blockers and 45 highs. Answered, or refused with a reason.

### Blockers

| id | Answer |
|---|---|
| F01 | Answered. First head 1005.31 → **378px** (399 on the specimen); the 347.25px ticket dissolves, the 44px instruments row moves into the letterhead's ledger at ≥1180, the letterhead sheds 41.31px, the band sheds 16.75px. |
| F04 | Answered by deletion. There is no pin and no seam, so there is no 283.19px single-frame jump. The `--doc-seam-height` writer is retired (§9). |
| F06 | **Refused.** "Everything in install" is a question about the studio's six live jobs, not about this paper. NG1 forbids a cross-document surface over an open document. It belongs on the desk. |
| F13 | Answered. The rail head prints the household at every offset at **both desktop tiers** — 200px at ≥1440 and 136px at 1180–1439 — and the mobile bar's left zone prints it at 390 (SP-09). No part of the answer lives in app chrome. |
| F14 | Answered. The 390 spine sheet becomes the same six-stop ladder, with the same names and values, at `min-h-11` per row. |
| F15 | Answered. At 1180–1439 the rail is 136px and prints every label as a word: `Put down`, the household, the stage, six segment names with ≤15-character values, six door names. |
| F34 | Answered by removal, and by X-12. No seam exists to change height during a smooth scroll; and a press forces every region between here and the target to `full` **before** the offset is computed, so the target's top cannot move mid-flight. Every `[data-index-region]` lands against a constant `--doc-landing-clear: 4rem`. |

### Highs

| id | Answer |
|---|---|
| F07 | Answered — `PUT`/`DOWN` and `Project`/`ACTIV`/`E` both stop printing broken at 1280; the rail is 136px and the words fit, measured. |
| F08, F41 | Answered. A scroll-driven change never moves focus, and no transition unmounts a region she has reached. For the explicit `Fold ↑`, focus parks on the newly-rendered `FoldSeam`. |
| F09 | Answered. `Drawings`, `Spec`, `Boards` and `People` become permanent doors in `FILED WITH THIS JOB`, present at s0, s1, s2 and s3, in words at both desktop tiers. |
| F10 | Answered by SP-08, applied to X itself: the rail head yields to the letterhead at s0 (X-11); a segment's name yields to its own head (X-6); the money segment's value yields to the needs band while the band is in frame; the margin prints a kind and a subject, never a second figure. |
| F11 | Answered. At s1 the header/summary share falls from 60.7% to 15.1%. |
| F12 | Answered. Pre-work rail ink 13.9% → 82.0%; longest empty run 657px → 96px. The track's height is fixed and the segments divide it (SP-05). |
| F16 | Answered in Wave 5: the four pre-work spreads get real region wrappers and real heads, so the ladder has something to index. Priced as `weeks` (§9). |
| F17 | Answered. The margin lifts: a `BESIDE {region}` group whose membership changes as she descends, above a `THE WHOLE JOB` group. |
| F18 | Answered. The 1280 sheet's body no longer reprints `IN THE MARGIN` 200px below the sheet header that already says it. |
| F19 | Answered. The tab prints `MARGIN · 7 · 1 OVERDUE`. |
| F20 | Answered. The eight rows of absence go with the ticket; the pre-work ladder prints four named segments with real values (§4's table). |
| F21 | Answered. The ladder, the window, the values and the doors all print at 1280; interactive children rise from 3 to the arc plus six segments plus sub-rungs plus six doors, reached through one roving tabstop each. |
| F22 | Answered — the ladder's job. Position is the window; extent is the drawn segment above a 24px floor **plus the count in its value line**, which is the honest carrier of scale; trouble is the exception in the value line, in words, at both tiers. |
| F23, F62, F63, F65 | **Refused as composition.** PO acknowledgement and damage-claim filing are Orders-and-Receiving acts; X adds no capability (brief A.0). What X changes: the `Pieces` segment's value line reads `36 LINES · 4 ROOMS · 1 DAMAGED` and, when a claim has a deadline, `1 DAMAGED · CARRIER SEP 26` — because a carrier window is a **date**, and dates are exactly what this design carries (Dd-51, Dp-45). |
| F24, F79 | Answered. The needs band reserves 136px from first paint, so the 0.1189 shift at 3.3–3.6s — 92% of the page's CLS in both registers — has nowhere to land. |
| F35 | Answered by not depending on it. X uses no `animation-timeline`, no `@property`, no scroll-driven CSS. It uses `content-visibility: auto` on **passed** regions only, as a pure render hint that changes no measured height and degrades to normal rendering where unsupported; no visual state depends on it. `IntersectionObserver` and `ResizeObserver` are already in this tree. A real `browserslist` key is added in Wave 0 — `apps/designer-portal/package.json` has none today, confirmed by grep. |
| F36 | Answered. Wave 0 deletes the regex at `lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19` and puts the assertion it means in `page.test.tsx`, where the render harness already exists. |
| F38 | Answered. Wave 0 adds the Playwright assertion E1-05 asks for: after a rail-segment press, the landed head's top sits within 4px of `--doc-landing-clear`. |
| F39, F64 | Answered: `forceOpen` stays supreme; `explicit` stays a hard fold and outranks position; `latchedDefault` becomes the region's initial **density**; position becomes a fourth, lowest, non-persisting voice that may only move `quiet → full`, never the other way, and may never write `patina:doc-fold:{docId}:{region}` (SP-07). |
| F40 | Answered. 390's first head 1054px → 477px of 844. |
| F42, F118, F105 | Answered. One `aria-live="polite"` region on the visible `[data-lens-window]` node, announcing at settle, at most once per distinct region. The 283px silent collapse is deleted with the ticket. |
| F43 | Answered. `drawer`, `spine` and `margin-item` sheet kinds get `aria-label`s. |
| F44 | Answered by removal. The seam's content-dependent measured height no longer exists; the rail head's 100px is reserved and its truncation rule is stated. |
| F45 | Answered, and narrowed from v1. The 700ms jump lock is kept and forces **only the regions between the current offset and the target** to `full`, all of them below the frame, in one commit before the scroll starts. v1 forced *every* region to full mid-flight, which expanded the document above the target while a smooth scroll was already travelling to an offset computed against the shorter document — F34 reintroduced by its own mitigation (Dp-09). |
| F46 | Answered. One schedule door — the rail's schedule segment — and one schedule head on the paper. The `Schedule dates UNFOLD ↓` sub-seam 200px above the head becomes the region's quiet form under the one head. |
| F47 | Answered. The top band at s0 asks her to hold: the mark, the job's name, the household, and the two things that need her. Four, against the twenty F47 counted. |
| F48 | Answered. Anchored chips stay beside their line; the rest move into the sheet under a counted heading. |
| F49 | Partly answered. The header above the FF&E body at 390 drops by ~577px. The empty-state prose between the head and the first folio is untouched — F91 measures it at ~433 of 775px and X does not compose it away. |
| F50 | Answered. The needs band prints two exceptions with their acts and a third as `+2 MORE · LEDGERS ↑` inside its reserved height, and each remaining exception is printed in words on its own segment's value line. Nothing is dropped, and nothing is behind a count alone. |
| F51, F112 | Answered. The sentinel observer is deleted with the ticket. The density observer runs one threshold in one direction with the X-10 velocity gate; `resolve()`'s pick rule is stated in §9. |
| F52 | Answered by deletion — there is no pin, so no scroll gesture relocates focus. |
| F53 | Answered without replacing the fold. A `quiet` region's body has not yet mounted; a `passed` region's body stays mounted and takes `content-visibility: auto`, which skips its render without changing its box. The fold's render-cost role is preserved *and* extended, and F61's killer (`.has-wash { isolation: isolate }`, `globals.css:322-325`) removes E1-08 from the register. |
| F54, F59, F89, F93 | Answered. The latched derived default stops producing folds, so a `FoldSeam` can only mean "you folded this"; `CLOSED BY YOU` prints the cause in words; the quiet form has no verb and no italic. The visible first-screen consequence — approvals and schedule open on arrival — is named in §4 and scheduled in Wave 3. |
| F55 | Answered, differently from v1. The seven marks stay in the rail, **above** the `--rule-mid` that opens the ladder. Above that rule the rail is about the job; below it, the vertical axis means exactly one thing: depth in this paper. |
| F56 | Answered. A returning reader dropped at `[data-active-section]` lands with the rail head printing the household, the ladder showing where she was dropped, and every standing exception printed on its own segment's value line — four of four on the specimen, where v1 gave her one (Dp-44). |
| F58 | Answered. The 1180–1439 tier gains the ladder in words (rail ink 24.0% → 79.8% at 800) and loses no anchored chips: the paper's measure is unchanged, by the 1044 ≥ 1040 arithmetic in §4. |
| F60 | Answered by removal. R99's zero-shift mechanism is no longer needed at the header, because nothing at the header pins. |
| F66 | **Refused as composition.** The margin's card kinds are a data question — the derivation produces Money and Time rows and no others. X sorts and counts what exists; it does not invent a PO card. |
| F67 | **Refused as out of evidence.** No probe or shot exercises the Orders ledger sheet's round trip, so X has nothing to design against. Named for the record; Wave 0's Playwright pass is where it would be settled. |

**Five findings a critic asked about that are not in this list, and why.** F02, F25, F37, F57 and F61 are **killed findings** — `research/31-verified-findings.md:179-183`, in the "Killed findings" table, not among the 152 survivors. F02's killer: the black circle in the 390 shot is the Next.js dev-tools indicator. F25 and F57's killer: `planroom` and `specbook` declare `routeSegments` and the page passes `shelfRouteFor` for both, so below 1440 they render as `<a href='/doc/{id}/plans'>` and `/spec-book` — which is exactly why `shelves/shelf-panel.tsx:136` returns null there, and is not a defect to fix. F37's killer: no `@property` declaration and no `animation-timeline` exists anywhere in `src/`. F61's killer is quoted in §4. §7 answers the evidence of record (Dd-05).

---

## 8 · Canon note

Named, for the record. Not priced (instruments §5).

| id | Quote (≤25 words) | What it becomes |
|---|---|---|
| **I149** | "new `job-ticket.tsx` (eight rows: Rooms · Pieces · Drawings · Spec · Boards · Money · Dates · People), sticky two-line seam on scroll" | The eight rows keep their derivation (`ticket-derivation.ts:780-793`) and lose their table. The sticky seam is retired; every row has a home at every scroll state (Appendix B). |
| **I136** | "running index (≥1440px only, four Project regions indexed, IntersectionObserver reading line)" | The running index becomes the ladder: six stops on a project spread, data-derived extents, a window rather than a line, on all seven spreads and at **both** desktop tiers. The `≥1440px only` clause is what changes. |
| **I137/C11** | "The running index is derived from the paper order, not declared beside it… `PROJECT_PAPER_ORDER`… approvals → schedule → ffe → money" | The law survives; the array grows by two (`careband`, `record`) and becomes a per-section order table so the four pre-work spreads have one too. The Record stays at the foot. |
| **R99** | "pins beneath the project title on scroll at reduced height (labels fold into the line; diamonds and the today rule remain)" | Nothing on the paper pins. The schedule's glance stops offsetting itself by `--doc-seam-height` because there is no seam to stand under; `schedule-rule.tsx:548`'s Tailwind `top-0` keeps it sticking. |
| **R15** | "one slow ~3s opacity swell on the *active* spine marker only" | **Unchanged, and its site does not move** — v1 moved the marker into the letterhead and v2 does not. The one ambient move stays in the rail, visible at every offset. |
| **R27** | "'View as the clients', 'Send a note', 'The scan' as one quiet DM-mono row under the letterhead subtitle" | The row becomes the letterhead's ledger column at ≥1180, in the two-track grid a region head already uses. Below 1180 it stays exactly where it is. |
| **D8** | "Studio Drawer persistent on every screen; ledger sheets open as collapsed-by-default overlays, no badges/pulsing counts" | **Unchanged.** v1 rewired `breadcrumbFor()`; v2 does not touch the drawer at all. The margin **tab** gains a printed count — a word in a label, not a badge. |
| **I148** | six-rung money ladder "Budget · Plan · Authorized · Moved · Owed · Not drawn" shelved on the spine | The rail prints two rungs — owed and not-drawn — as the money segment's ≤40-char value. The six-rung read lives in the money region's own head, where the acts are. |
| **D3/I21** | "Mobile: margin items collapse to anchored chips, spine becomes a bottom sheet" | Both stand. The bar's left zone additionally carries the household; the sheet's body becomes the ladder at `min-h-11` per row. |
| **The 1180–1439 shell regime** | `page.tsx:1763`'s `data-shell-regime="single-below-1180-compact-to-1439-full-from-1440"` | The literal becomes `single-below-1180-narrow-to-1439-full-from-1440`, and `page.tsx:1764`'s `min-[1180px]:grid-cols-[56px_…]` becomes `[136px_…]`. Named because two Playwright specs and one unit test assert the 56px (§9). |
| **SP-04** | "exactly one element measures and publishes its height (`--doc-seam-height` keeps its name and its single writer)" | **An amendment, not compliance** (DC-20). X drops to **zero** writers and repoints the four consumers at a declared constant. The plank's intent — one number, never changing under her — is met more strongly than the plank's letter asks; the letter is amended and said so. |

### The four no-gos, and the mechanism that leaves each untouched

**NG1 — one document at a time.** The ladder is built from `[data-index-region]` roots found inside this page's own `<main>` by a `MutationObserver` scoped to `mainRef` (`page.tsx:1789`). It has no query for another engagement, no route that opens a second paper beside this one, no peek state. Its doors either scroll within this paper or navigate away through the existing shelf routes. `Esc` / Put down remains the only exit, and X leaves both handlers exactly as the probe measured them working (`probe/03-interactive-probe.md` §4).

**NG2 — the shadow budget.** X declares no `box-shadow`, no `filter: drop-shadow`, and adds no `.doc-elevated` consumer; the three sites stay `studio-drawer.tsx:289`, `margin-item.tsx:46`, `overlays/doc-sheet.tsx:371`. The mechanism that makes this safe rather than intended: the rail's separation from the paper is the `border-r border-[var(--color-pearl)]` it already carries (`doc-spine.tsx:44`) plus the `--doc-rail-stock #E8E3DB` / `--doc-paper #FCFAF6` value step, and the ladder is drawn in `--rule-hair` and `--rule-mid` only. And X **removes** the one surface that would have wanted depth — a floating seam over the paper — rather than negotiating for it. **The proof NG2 asks for is a computed-style sweep, and the sweep is the mockup's** (SC8): `lib/document/__tests__/shadow-gate.test.ts` is `readFileSync` plus regex by construction (`:85-95`, `:97-105`, `:107-122`, `:124-127`, `:129-136`), so it is the tripwire on every wave, not the proof (DC-26).

**NG3 — no Thumb Index.** The ladder is one continuous track whose segments are drawn at unequal, data-derived heights, carrying names and values in words, no letters, no alphabet, no per-page jump stops. A thumb index is a strip of equal, labelled tabs indexing positions in a book; this is a scaled elevation of one document's own regions, with exactly as many marks as the paper has stops.

**NG4 — the R126 register is the floor.** Every mark X draws is a token already declared in `app/globals.css`: `--rule-hair`, `--rule-mid`, `--rule-strong`, `--text-muted #65594E`, `--text-primary #2C2926`, `--color-clay-ink #7C5E30`, `--color-terracotta-ink #9C5340`. No size enters the 40/24/18/15/14 scale; the mono floor stays 11px; the stamps, tab plates, crops and the hover wash are untouched; the `lg` StrataMark and the seven-mark arc stay exactly where R126 shipped them. The only colour X adds anywhere is the terracotta of an exception's own value line — small, state-carrying, exactly where Kody's taste puts it — and v1's 1px `--color-clay` gutter rule at 1.82:1 is deleted rather than defended. `lib/document/__tests__/contrast.test.ts` gates the rail's inks and stays green; Wave 0 turns its hard-coded five-filename `RAIL_FILES` list (`:326-332`) into a glob **before** any spine file is renamed. THE STUDIO desk block appears in no file in §9.

---

## 9 · Engineering path

Six waves. Each is valuable alone; the two dependencies are declared. Every path below was `ls`'d in `apps/designer-portal/`.

### Wave 0 — Two tripwires and a probe (days)

Before anything else, because both fail silently.

- **The regex.** `src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19` — delete `/data-active-section[\s\S]{0,1500}?<SectionStageLineMount/`. Measured over the real file: the attribute at `page.tsx:1942` is **1,109** characters from `<SectionStageLineMount` at `:1964` (391 of headroom), and the test currently passes on a **comment** at `:1961`, **143** characters away. v1 quoted 1128 and 162 (DC-22). The replacement — render the page and assert `SectionStageLineMount` follows `[data-active-section]` in DOM order — goes in **`src/app/(document)/doc/[id]/page.test.tsx`**, which already carries the render harness; the source file is a `fs.readFileSync` contract with no React imports and keeps its four other `it` blocks, including `:50-58` and `:60-63` (DC-30).
- **The gate that stops testing.** `src/lib/document/__tests__/contrast.test.ts:326-332` hard-codes five filenames. Turn `RAIL_FILES` into a glob over `components/document/spine*.tsx`, `components/document/spine/**/*.tsx` and `components/document/margin-rail.tsx`, so Wave 2's new file is scanned the day it lands.
- **The landing assertion nobody has.** Add one Playwright case in `e2e/document/quiet-responsive-shell.spec.ts`: after pressing a rail segment, the landed head's `top` is within 4px of the landing clearance. F38 records that every seam assertion is jsdom and jsdom has no layout.
- Add a `browserslist` key to `apps/designer-portal/package.json` (F35 — today the only declared matrix is `playwright.config.ts:65-68`, which enables WebKit).

**Rollback:** revert two test files, one added spec case, one package.json key. No product code.
**Dependency:** none. **Wave 2 depends on this one** (the glob before the rename), and **Wave 5 depends on it** (the regex before `page.tsx` surgery).

### Wave 1 — The rail earns its column (week)

- `src/components/document/doc-spine.tsx` — remove children 5 and 6 (`CompactSpineTimerDoorway` at `:143`, the `SpineTimer` + presence wrapper at `:145-155`). Absorb the active caption (`:122-136`) into the new head. Keep the arc `<ul>` at `:64` exactly as it is. Width classes: `min-[1180px]:px-1.5` → `min-[1180px]:px-3`.
- `src/app/(document)/doc/[id]/page.tsx:1763-1764` — the `data-shell-regime` literal and `min-[1180px]:grid-cols-[56px_minmax(0,1fr)]` → `[136px_minmax(0,1fr)]`. **This is the file the narrowing lives in; `doc-spine.tsx` carries `min-[1440px]:w-auto` and cannot set the tier's width by itself.**
- `src/components/document/spine-timer.tsx` — the in-hand clock leaves the document rail. F82's two disagreeing clocks become one, and the compact doorway's job passes to the drawer's own timer, which already prints `IN HAND TODAY`.
- `src/components/document/doc-letterhead.tsx:67-77` — the in-hand room row moves to the rail's doors; `onReleaseRoom` is passed to `DocSpine` instead.
- `src/components/document/letterhead-vitals.tsx` — suppress empty fields; delete `PHASES ▸` (F129, F134).
- `src/components/document/margin-rail.tsx:227-228` — the tab prints its count and worst kind; `margin-note.tsx` first-touch stops holding 230px of permanent column.
- `src/components/document/mobile/mobile-bar.tsx:230` — the context word becomes the household.

**Tests rewritten, by path.**
- `src/components/document/doc-spine.test.tsx:23-29` — `:25` (`Put down` `min-[1180px]:inline`) survives; `:26-28` (`screen.getByText('Project').closest('p')`) does not, because the caption is absorbed. `:14-19` (`Jump to Project`, `Brief: Not recorded`) **survives untouched**, because the arc does not move (DC-23). `:31-47` — the shelved wrapper stops being `hidden min-[1440px]:block`.
- `src/components/document/__tests__/responsive-document-shell.test.tsx:186-196` — the regime string and classes. `:198-201` — `Put down` targets. `:202-211` — the arc's jump buttons, **survives**. `:213-221` — the two timer surfaces' visibility classes, rewritten.
- `e2e/document/quiet-responsive-shell.spec.ts:218-235` — the 55–57px spine width at 1280 becomes 135–137.
- `e2e/document/quiet-release-contracts.spec.ts:105-118` — `expectHorizontalBounds(spine, 0, 56)` and `paper, 56, width` become 136. **`:169-299` — one test, "keeps one focused timer doorway at 1280px", dies whole**: it runs on `[data-compact-spine-timer-doorway]` (`:185`), its `data-spine-timer-regime` (`:187-190`), and four viewport-handoff steps including `:212-237`'s 1439→1440 handoff onto `[data-full-spine-timer] [data-action-key="open-manual-time-entry"]` (`:223-228`). v1 named three lines of it (DC-25). The replacement asserts the drawer's timer is the one doorway at every width; the compact doorway is deleted.
- `src/components/document/mobile/mobile-timer-sheet.test.tsx:250-257` — rewritten for the same reason.
- `e2e/document/quiet-release-contracts.spec.ts:150-158` and `e2e/document/quiet-responsive-shell.spec.ts:251-253` (spine width ≥199 at 1440) **stay green** — X keeps 200px at ≥1440.

**Gates green:** `shadow-gate.test.ts`, `contrast.test.ts`, `region-rule.test.tsx:59-74`, `margin-handoffs.spec.ts:67-70`/`:102-105`, `workflow-stage-responsive.spec.ts:30-32`/`:47`.
**Rollback:** revert six components, one `page.tsx` line pair, and their tests.
**Value alone:** F07, F13 (at both desktop tiers), F15, F19, F26, F31, F82, F129, F134, F137.

### Wave 2 — The ladder (week)

- **New:** `src/components/document/spine/lens-ladder.tsx` — the track, the segments, the sub-rungs, the window, the doors. It reads extents from **data** (counts, not rects) and writes `data-lens-window` imperatively in the rAF handler.
- `src/components/document/spine-running-index.tsx` — **deleted**; its reading-line mechanic (`:76-82`) becomes the window, and its 13px/11px registers move to the ladder unchanged so `contrast.test.ts`'s glob keeps its subject.
- `src/components/document/spine-shelved-blocks.tsx` — keeps its job of feeding values, loses its list rendering.
- `src/hooks/use-document-running-index.ts` — the query-with-retry attach (`:120-133`, 8 × 250ms) is replaced by a `MutationObserver` on `<main>`, so a region mounting later is still observed (E1-09, F75). **The `-20% 0px -62% 0px` band (`:34`) is retired**: the window is the frame, so `rootMargin` becomes `0px`. **`resolve()` is rewritten, not reconfigured** (DC-28): with a zero root margin several roots intersect at once, and the pick rule is *the root containing the frame's vertical midpoint; if none contains it, the last root whose top is above it*. That rule is what makes SC12's "never null while the paper is in view" true, and it is a change to the function, which v1 did not say. **The 700ms jump lock (`:35`, `:166-180`) is kept and narrowed** — it forces only the regions between the current offset and the target to `full`, in one commit before the scroll starts (X-12). `scrollToRegion` (`:202-222`) stays exactly one copy, reduced-motion branch at `:206-214` included.
- `src/lib/document/document-index.ts` — `DocumentIndexKey` (`:17`) gains `'careband' | 'record'`; `PROJECT_PAPER_ORDER` (`:36-57`) gains two entries; `paperRegionsForSection` (`:76-82`) becomes a per-section order table; `regionHeadingId` (`:93-102`) keeps throwing on an undeclared key, which is the guard that makes the two new keys safe.
- `src/components/document/care-band.tsx` and `src/components/document/previous-work.tsx:37` — each gains a `data-index-region` root and a stable heading id, so the two new rungs index something that mounts. Verified: `CareBand` mounts on the project spread at `page.tsx:2134`; `AccountBand` does **not** (`:2202` gates it on `spreadSection !== 'project'`) and is therefore not a rung.
- `src/components/document/ffe-section.tsx:1427-1480` — the room sub-rungs take `data-room-chip` and `toggleRoom()` from `useRoomLens()`, the same contract `job-ticket.tsx:423-431` carries; the ladder renders them.

**Tests:** rewrite `src/components/document/__tests__/shelved-spine.test.tsx:82-98` (one `aria-current`), `:217-236` (`On this paper` and nothing else), `:238-262` (four rows on project, two on install/care → six and four). Rewrite `src/components/document/doc-spine.test.tsx:31-47`.
**Gates green:** `shadow-gate.test.ts` (the ladder is rules), `contrast.test.ts` (now globbing, per Wave 0).
**Rollback:** the ladder mounts in the `shelved` slot; reverting restores `spine-running-index.tsx` from git and the slot renders the old list. The two new index keys are additive and `paperRegionsForSection` can return the old four.
**Depends on:** Wave 0's glob. **Value alone:** F12, F21, F22, F55, F58, F84, F102, F111, F116, F130.

### Wave 3 — The ticket dissolves, the header yields, the fold becomes a density (week)

- `src/components/document/job-ticket.tsx` — **deleted**, with the sentinel (`:347`), the `IntersectionObserver` (`:218-228`), the `setFold(null)` pin effect (`:235-242`) and the `--doc-seam-height` publication (`:248-259`). `useRoomLens`'s `toggleRoom` consumers move to the ladder (Wave 2).
- `src/lib/document/ticket-derivation.ts` — **unchanged**. It keeps deriving the eight rows; the ladder and the letterhead consume them.
- `src/app/(document)/doc/[id]/page.tsx` — the ticket mount (`:1829`) and its composition (`:1714-1748`) go; the needs-band wrapper appears around `:1838-1847`; `LetterheadInstruments` moves into the letterhead **and `<FolioLetterhead projectId={row.project_id} />` at `:1871` stays** (DC-16); add `scroll-padding-bottom: 60px` to the shell so a focused act at the foot clears the fixed drawer (Dc-11).
- `src/components/document/doc-letterhead.tsx` — takes the instruments ledger at ≥1180; `pb-5` → `pb-4`; **keeps the `lg` StrataMark at `:52-54`**.
- `src/components/document/red-letter-zone.tsx` and `document-guide.tsx` — both render into one reserved-height wrapper; the red letter's "no outer margin" (`:85-88`) and the guide's `my-5 … py-4` (`:75`) both become `--doc-region-gap`.
- **`src/components/document/region/use-region-fold.ts` — `latchedDefault` (`:104-119`) becomes the region's initial density, in this wave, not a later one.** SC1 = 378px requires it: measured at `rich.1440.s0`, `approvals` is a **55.5px** block at y 791.8 and the first `[data-region-head]` is `schedule` at **1005.31**, because approvals is folded on arrival and a `FoldSeam` prints no head. Wave 3 without this change lands the first head near 434px, over the ≤405 threshold (DC-04). The widening runs across all seven fold keys (`use-region-fold.ts:25-40`).
- `src/app/globals.css` — declare `--doc-region-gap: 24px` and `--doc-landing-clear: 4rem`; `:1026` (the schedule glance's `top`) is deleted — safe, because `schedule/schedule-rule.tsx:548` carries Tailwind `top-0`; `:1034` and `:1037` read `--doc-landing-clear`; add `scroll-margin-top` to the child landing targets F120 names.
- `src/components/document/commercial/money-region.tsx:48` — `SEAM_CLEARANCE` reads `--doc-landing-clear`.
- Region wrappers take the token: `approvals/project-approval-document.tsx:565`, `:586` · `schedule/schedule-rule-region.tsx:181`, `:199` · `schedule/schedule-spine.tsx:1055-1060` · `ffe-section.tsx:1204-1210`, `:1290` · `commercial/money-region.tsx:227-230`, `:248-251` · `care-band.tsx:215`, `:235`, `:249`, `:303` · `previous-work.tsx:37`.
- The room head's exception: `ffe-section.tsx:618-620`, `mt-4` → 12px.
- The folded rule step, at its three call sites: `commercial/money-region.tsx:233`, `schedule/schedule-rule-region.tsx:182`, `approvals/project-approval-document.tsx`'s rule (DC-21). `region/region-rule.tsx` is untouched.

**What becomes of the seam variable, precisely.** `--doc-seam-height` keeps its name and drops to **zero writers**. Its four consumers — `globals.css:1026` (deleted), `:1034`, `:1037`, `commercial/money-region.tsx:48` — are rewritten to read `--doc-landing-clear: 4rem`, a declared constant no script can change. **`4rem` is not arbitrary**: it is the floor already in the tree at `globals.css:1037`'s `max(var(--doc-seam-height, 0px), 4rem)`, kept so a landing keeps exactly the air it has today, and it is now the only value rather than one arm of a max (Dd-17). This is a refusal, not a mitigation: E1 says "a continuous seam is not a header change, it is a navigation change", and X removes the seam rather than making it continuous or discrete. **It is also an amendment to SP-04, and §8 names it as one** (DC-20).

**Tests.**
- **Delete** `src/components/document/__tests__/job-ticket.test.tsx` (541 lines; the component is gone, and `:519`/`:524`/`:529`'s seam-var lifecycle has no subject).
- **Delete the whole `describe('the job ticket mount (B1)')` block at `src/app/(document)/doc/[id]/page.test.tsx:1243-1411`**, which is `TICKET = '[data-job-ticket]'` at `:1244` and every test under it: `:1252-1269`, `:1271-1293`, `:1309-1313`, `:1315-1341`, `:1343-1349`, `:1351-1358`, `:1361-1382` (the sentinel contract), `:1384-1410`. v1 named two ranges inside it (DC-07). **Repoint** the money-row assertions at `:1583-1587` and `:1602-1604` at `deriveTicket` rather than at the DOM. **Keep** `:1230-1234`'s mounted-region order.
- **Rewrite** `src/components/document/__tests__/responsive-document-shell.test.tsx:655-689` (eight ticket rows at 1440) and **`:692-750`, the room-in-hand flow** — two tests whose take is `fireEvent.click(ticketRow('rooms')!.querySelector('button')!)` then `fireEvent.click(roomChip('living')!)` at `:697-698`. That is the only path in the tree to taking a room in hand, and it becomes a press on the ladder's room sub-rung, which carries the same `data-room-chip` and `aria-pressed` (DC-08). The release assertions survive.
- **Rewrite** `e2e/document/quiet-responsive-shell.spec.ts:165` (`spine.getByText(/On this paper/i)`), `:173-176` and `:183-196` (`toHaveCount(8)` at three widths — the rows exist as data, not as DOM).
- **Rewrite** `src/components/document/region/__tests__/use-region-fold.test.tsx:38-41` — **as a rewrite, not an addition.** It reads `render(<Probe docId="doc-1" region="schedule" defaultFolded={true} />); expect(state()).toBe('folded')`, and making `latchedDefault` an initial density makes that `'open'`. v1 called the whole `:38-60` range "additive — every existing assertion stays true"; the first assertion in it is the one the change falsifies (DC-03). `:43-55` and `:57-60` survive and are joined by new cases: *scroll never writes storage*, *a passed region never re-quiets*.
- **Keep** `src/lib/document/__tests__/ticket-derivation.test.ts` entirely. **Keep** `src/components/document/doc-letterhead.test.tsx:69-83` and `:85-97`. **Keep** `src/components/document/region/__tests__/region-head.test.tsx:110-121` and `:128-157`, `region/__tests__/fold-seam.test.tsx:36-45`, `region/__tests__/row-overflow.test.tsx:31-45`.

**Gates green:** `shadow-gate.test.ts` (a shadow is removed from the page's needs, none added), `contrast.test.ts`.
**Rollback:** this is the one wave that cannot be reverted by a flag — deleting a component is not flaggable. It reverts by `git revert` of one commit touching eighteen files; the rail from Waves 1–2 keeps working without it, because the ladder never depended on the ticket.
**Value alone:** F01, F04, F11, F24, F34, F44, F47, F50, F51, F52, F54, F59, F60, F71, F73, F79, F89, F93, F97, F112, F120, F154, F156.

### Wave 4 — Density, in one direction (week)

- `src/components/document/region/use-region-fold.ts` — **position** joins as a fourth, lowest, **non-persisting** voice that may move a region only `quiet → full`, never the reverse, never to `folded`, and may never write `patina:doc-fold:{docId}:{region}` (SP-07). `forceOpen` (`:121`) stays supreme; `explicit` (`:42-46`, `:129-135`) stays a hard fold. The return widens to add `density`.
- **New:** `src/hooks/use-lens-density.ts` — one `IntersectionObserver` per region root with a single threshold in one direction (top within one frame height of the bottom edge), the X-10 velocity gate, a deterministic `settle()` and a `window.__lensSettled()` promise. It writes `data-density` on the region root **imperatively in the rAF handler**; React re-renders nothing, per E1-17. It also writes `data-passed` when a root's bottom clears the frame's top, and never removes it.
- `src/app/globals.css` — the `[data-density='quiet']` rules; `[data-passed] { content-visibility: auto; contain-intrinsic-size: auto; }`; and the one new `@media (prefers-reduced-motion: reduce)` block, sited immediately after `:283`, covering X-2, X-6, X-9 and X-11 by name.
- Region components render their quiet form: head, one ≤40-char line, the one inked leader, reserved height.

**The find-in-page gate.** `content-visibility: auto` subtrees are searchable by find-in-page, which `display: none` and an unmounted body are not — so a passed region is *more* reachable under X than under today's fold. I cannot exercise a running app from this seat, so Wave 4 ships behind one assertion in `e2e/document/quiet-responsive-shell.spec.ts`: at s3, `page.getByText(<a vendor name on a line 2,000px above>)` resolves. If it fails, `[data-passed]` loses the attribute and the cost is render time, not correctness — nothing visual depends on it (F35).

**Tests:** the additive cases named in Wave 3's `use-region-fold.test.tsx` rewrite, plus one new spec asserting that a region's `getBoundingClientRect().top` is unchanged across a scroll-up past three opened regions. `fold-seam.test.tsx:36-45` stays green: X's density is a CSS attribute swap, not a hydration-flag-gated animation.
**Rollback:** the density observer mounts behind a fail-closed flag; off, every region renders `full` and the page is Wave 3's page.
**Value alone:** F39, F53, F64, and the ask's own sentence about content that lends to space when it is not needed in frame.

### Wave 5 — The pre-work spreads (weeks)

`src/app/(document)/doc/[id]/page.tsx` — wrap brief, discovery, direction and proposal bodies in real regions with real `RegionHead`s. Today the proposal's content is inline with a plain head at `:2006` and the spread renders **zero** `[data-region-head]` and zero `[data-index-region]` elements (F16, confirmed twice by direct DOM query). `src/lib/document/document-index.ts` — `paperRegionsForSection` stops returning `[]` for those four.

**The fork E1 §4 names, answered:** an index row **may** print with no value — it prints `NOT KNOWN YET`, which is a sentence, not a dash. A row is a name and a position; a missing row is a hole.
**Tests:** rewrite `src/components/document/__tests__/shelved-spine.test.tsx:155-197`, which asserts precisely the `[]` this wave changes. `stage2-approval-cutover-contract.test.ts`'s regex is already gone (Wave 0), which is what makes `page.tsx` surgery safe here.
**Depends on:** Wave 0. **Rollback:** the per-section order table returns `[]` for the four spreads; the ladder falls back to the head and the doors, which is Wave 2's pre-work behaviour.

### Where X disagrees with E1

One place, and v2 reverses v1's answer. E1 §3 recommends `content-visibility: auto` with `contain-intrinsic-size` as the render-cost control, and E1-08 flags that the implied `contain: layout paint` creates a stacking context that may kill the R126 `z-index:-1` hover wash on FF&E lines. **v1 declined it on that ground and spent a week and a risk-register entry avoiding it.** F61 — that exact finding — was **killed by code_truth** (`research/31-verified-findings.md:183`): "`.has-wash` already declares `isolation: isolate`, so every washed row is its own stacking context today… An added content-visibility container does not change that." Verified live at `globals.css:322-325`. **X takes E1's mechanism** — for passed regions only, where it changes no height and therefore cannot move the paper — and keeps the unmount for regions she has not reached, which is the fold's shipped behaviour. That is E1's control, at half its blast radius, with the objection retired by the evidence of record.

---

## 10 · Risks

Six, each with the observation that proves it real.

**R1 — The rail becomes the cluttered thing.** X moves eight ticket rows' worth of destination into a 200px column and asks that column to also be a map. The ask's first complaint was that the rail is cluttered.
*Falsifying observation, first week of use:* a practitioner walk at 1440/s0 names more than one **tense** in the rail above the `--rule-mid` — the head is meant to hold exactly one, *this job and where it stands*. If she reads the arc as one thing and the stage phrase as another, the head has not merged them and the eviction did not go far enough. (v1's test asked for "exactly two things" and its own critic counted six; the countable unit is the tense, not the element.)

**R2 — One frame of lookahead is the wrong distance on a fling.** A trackpad fling can cover three frame heights in 200ms, and a region whose body has not mounted has nothing to paint.
*Falsifying observation, first week of building:* seed a 60-line, 4-room schedule, fling s0→s3 at 1440, and record blank paper where a region should be for more than one frame. The mitigation designed in is that a fling suppresses the settle and the opens fire together at the landing; if the landing still shows an unmounted body, the lookahead has to grow, and a larger lookahead means the lens is doing less.

**R3 — Nothing quiets on a short paper.** X only quiets a region more than one frame below the fold. The Byrne proposal's whole document is 2,179px at 1440.
*Falsifying observation, first week of use:* open a proposal-stage document, scroll it end to end, and no region ever changes density. The lens does nothing on four of the seven spreads, and the ask's "content that lends to space" is unanswered exactly where F20 says the absence is worst.

**R4 — The document grows under her scrollbar.** Every region that opens adds its height, so the scroll extent grows monotonically as she descends and the thumb shrinks continuously. It is the only instrument that told her how far into a 36-line schedule she was, and no critic's fix restores it (Dp-41).
*Falsifying observation, first week of use:* a designer at 1440 says she has stopped using the scrollbar to judge position. X's answer is that the ladder's window is the measure and it is derived from **data**, not from `scrollHeight`, so it does not move when the document grows — but if she reports she now has *no* measure, the ladder's window is not reading as one, and the ladder needs a printed position (`3 OF 6`) beside it.

**R5 — 136px is still not enough words.** The 1180–1439 rail prints names and ≤15-character values inside a 112px measure, and the arithmetic (15 × 7.15px = 107px) has 5px of slack.
*Falsifying observation, first week of building:* render `1 OVERDUE · 6D` and `$17,500 OWED` at 11px DM Mono with `tracking-[0.05em]` at 1180 and measure. If either exceeds 112px the compact value cap has to drop to 13 characters, which costs the day count; if it exceeds at 14 characters the tier goes back to names only, and Dp-04 returns.

**R6 — Two new index keys break a throw that exists to protect the index.** `document-index.ts:100` throws on a key not in `PROJECT_PAPER_ORDER`, and Wave 2 adds `careband` and `record` to both the union and the array. `care-band.tsx` and `previous-work.tsx` mount conditionally — `previous-work.tsx:34` returns null when `count === 0`.
*Falsifying observation, first week of building:* load a project document with zero completed work and watch the ladder print a `The record` segment whose press target does not exist. The mitigation is that a stop with no mounted root prints its name and `NOTHING YET` and is not a press target — which is exactly the pre-work rule (SP-05) applied at the foot. If the throw fires instead, the order table is being read before the DOM settles and the `MutationObserver` attach is in the wrong place.

---

## 11 · Refuses

**1 — No lens line on the paper.** M-1 is the largest single recovery available and X refuses it. Not because it would not work: because a sticky band spends the one axis the work needs. The header stack is 111.7% of a 900px frame and the first head lands at 1005.31px because the top of this page competes with the page for vertical pixels. A band of 48–64px is a permanent 5–7% tax on every frame at every offset, forever, to carry facts a column carries for free. Refused, not deferred: if the rail is the instrument, a second instrument on the other axis is redundancy, and SP-08 says redundancy is the thing to remove.

**2 — No standing rule.** M-8 pins the current region's head beneath the band. Two stacked sticky bands are a header again, and it duplicates the rail's window outright. Refused, not deferred: X has no band for it to stand under.

**3 — No continuous seam, and no discrete one.** E1 §2 offers three costed branches for making the seam's height a function of scroll — days, week, weeks. X takes none. E1's own sentence is the reason: "a continuous seam is not a header change, it is a navigation change." Every branch pays somewhere in `scrollToRegion`'s once-resolved `scroll-margin-top`, and every one is invisible to the suite because every seam assertion is jsdom. Refused permanently: the variable drops to zero writers and a declared constant.

**4 — No gutter pins.** M-4's pins beside the lines they are about. A decision about the whole document has no line to point at, so the mechanic needs an orphan home or it silently loses items. And `margin-item.tsx:46` carries one of the three legal `--elevation-sheet` sites, so a pin on the paper is a shadow on the paper. X takes M-4's diagnosis (F17) and answers it by sorting the column.

**5 — No 160px rail at ≥1440.** The arithmetic is in §4: narrowing recovers 32px of measure at exactly 1440 and nothing at 1472 and above — three characters on a 15px line — and costs the rail 40px of its 168px inner measure, which is the whole ≤40-character value line. Refused with the number, because S5 asked for the number.

**6 — No re-quieting.** A region she has read stays full for the session. It is the deletion that removes the program's sharpest defect, and it is refused rather than deferred because every alternative — a same-frame `scrollBy(−Δ)`, `overflow-anchor`, a scroll-position correction — is a mechanism that has to be right every frame, on every fling, in a browser matrix that has no declared `browserslist`, to avoid moving a paragraph she is reading. Y writes that correction and names it as its own Rank-1 risk. X does not need it.

**7 — No redesign of the foot.** F83 (310px teaching a concept with no content), F92 (70.3% of the foot frame carrying nothing), F98 (`Closing the book` as unexplained idiom) and F80 (the roster question 2,000px from its door) are all real and X leaves them. The ask points at the top of the paper and X spends its budget there; the s3 frame budget moves by exactly the 65px the seam was taking. What X does add at the foot is a segment and a door for it, so F116's "the rail says Money while the frame shows authorizations" stops being true. Refused for this proposal, not for the product.

**8 — No cross-document surface.** F06 asks for a door that answers "everything in install". It is a blocker, it is a real gap, and it is a desk question. NG1 is not negotiable and X will not answer it with a rail that reaches outside this paper.

---

## Appendix A — the ten candidate mechanics, dispositioned

| id | Disposition | One sentence |
|---|---|---|
| **M-1 · The Lens Line** | **Refused** | A sticky band spends the vertical axis the work needs to carry facts a column carries for free; §11.1. |
| **M-2 · The Map Rail** | **Adopted, adapted** | Adopted whole, with four changes from v1: a fixed-height track the segments divide; a 24px floor (2.5.8 AA) instead of 44px, with the count line carrying true scale; extents derived from **data**, never from a rendered box; and words at both desktop tiers. |
| **M-3 · Reading-line Density** | **Adapted, and halved** | Its vocabulary and its observer are adopted; its three levels become two; and it runs in **one direction only** — the lens opens what is ahead and never takes back what is behind. |
| **M-4 · The Gutter Margin** | **Adapted** | Its diagnosis is adopted and its mechanism refused: the margin lifts region-anchored items into a named group rather than pinning them to the paper; §11.4. |
| **M-5 · Section Zoom** | **Adapted** | Its discreteness is adopted as the shape of the change — one attribute on the region root, no interpolation — and its click trigger is refused; position decides. |
| **M-6 · Focus Follows the Pen** | **Adopted, as ink weight only** | The edited line's rule turns clay-ink and its own wash holds; no sibling loses a step of ink, so there is no second dimming system. |
| **M-7 · The Ticket Dissolved** | **Adopted** | The eight rows keep their derivation and lose their table; each has a named home at every scroll state, and the `Rooms` row keeps its *act*, not just its name (Appendix B). |
| **M-8 · The Standing Rule** | **Refused** | A second sticky band under the first is a header again; §11.2. |
| **M-9 · The Quiet Foot** | **Adopted, and narrowed** | The foot gets a real segment and a real door on the ladder, so the rail stops going blind below `money-head`. v1's swap of the rail head's third line to `THE RECORD` is **deleted** with X-8 — it printed the current region's name twice in one frame (Dc-03). |
| **M-10 · Tempo Damping** | **Adopted** | A 120ms velocity settle gates every density change and every announcement, and it exposes `settle()` plus `window.__lensSettled()` so the mockup's probe and the eventual e2e can force the settled state synchronously. |

**M-3 ⟷ M-5, the precedence rule.** Position decides a region's density, through M-3's observer. M-5 decides only how the decision is *applied*: discretely, one attribute swap on the region root, no intermediate level. There is no gradient for the two systems to fight over.

**M-2 ⟷ M-4, the division of labour.** The rail owns the index — position, order, reach, count, exception. The margin owns the items — decisions, messages, money, notes. Neither prints the other's fact: the rail never prints a margin item's content, and the margin never prints a region's extent or position, only the region's *name* as its group heading, and never a figure a rail segment is currently printing.

---

## Appendix B — the eight ticket rows, sorted once (SP-10)

| Row | Bucket | Where it lives at s0 | Where it lives at s2 |
|---|---|---|---|
| `Rooms` | orientation + **act** | the Pieces segment's room sub-rungs, each carrying `data-room-chip` and `aria-pressed` — the take, not just the name | the same sub-rungs, printed at every offset, not only while Pieces is under the window |
| `Pieces` | orientation | the Pieces segment's value, `36 LINES · 4 ROOMS · 1 DAMAGED` | value printed, name yielded (X-6) |
| `Drawings` | door | `FILED WITH THIS JOB → Plan room`, in words at both tiers | unchanged — the rail does not scroll |
| `Spec` | door | `FILED WITH THIS JOB → Spec book` | unchanged |
| `Boards` | door | `FILED WITH THIS JOB → Mood boards` | unchanged |
| `Money` | fact + door | the Money segment's value, `$17,500 OUT · $12,300 NOT DRAWN` — **both numbers, 31 characters** | unchanged; the value yields to the needs band only while the band is in frame |
| `Dates` | fact | the Schedule segment's value, `INSTALL SEP 15 · 3 WEEKS` | unchanged — a segment's value never yields, so the install date is on screen at every offset |
| `People` | door | `FILED WITH THIS JOB → Call sheet` | unchanged |

Plus one row the ticket carried that was not one of the eight: the room **release**, which lives in the letterhead today and only at s0. It joins the doors as `Put down the room`, printed only while a room is held.

No row's home is "the top of the document". That is the sentence the whole proposal is for.

---

## Appendix C — Critique responses

Every numbered defect addressed to X or to "both", from all four critiques, in id order, grouped by critic. **fix** — the proposal changed; where it now lives is named. **accept-and-narrow** — the defect is real and the mechanic survives smaller; what got narrower and what it no longer claims. **drop-with-reason** — the defect does not hold, with the evidence.

### C-design (Dd) — 27 defects: 22 fix · 4 accept-and-narrow · 1 drop

| id | Verdict | Response |
|---|---|---|
| Dd-01 | **fix** | The blocker is removed by deletion, not by correction. X-5: a region she has passed never changes height again; X-4: a region opens only while it and everything above it are below the frame's bottom edge. §4 "H5", §3 X-4/X-5, §5 `reading` (the state with no exit), §11.6. |
| Dd-02 | **fix** | The oscillator needed a closing edge and there is none: density moves one way only, so the "collapse → the one below rises → it becomes full → it pushes itself out" loop has no return transition to complete. §4 "Motion grammar" M3, which now states one threshold and says why there is no second. |
| Dd-03 | **fix** | Six stops, not four: `Client approvals` · `Schedule` · `Pieces` · `Money` · `Closing the book` · `The record`, with `Authorizations` a sub-rung of Money because `page.tsx:2122` nests it inside `MoneyRegion`. §4 spine (the stop table), §9 Wave 2 (the two new roots and index keys), §6 SC12. |
| Dd-04 | **fix** | The head is two facts and an arc at **100px reserved**, with the arithmetic done against `doc-spine.tsx:57-63`'s own ~168px measure: 78px for `Vandersteen`, 143px for the longest stage name at 11px mono, and a stated truncation rule (subject, never number). §4 spine, tenant 2; §6 SC3. |
| Dd-05 | **drop-with-reason** | F02, F25, F37, F57 and F61 are not unanswered verified highs — they are **killed findings**, `research/31-verified-findings.md:179-183`, in the "Killed findings" table below the 152 survivors. The critique's load-bearing case fails on its own evidence: `shelves/shelf-panel.tsx:136`'s `if (!fullTier && routes) return null` is not a bug, it is the consequence of F25/F57's killer — "planroom and specbook both declare routeSegments… Below 1440 they render as `<a href='/doc/{id}/plans'>`". §7's closing paragraph states all five and their killers. |
| Dd-06 | **fix** | X-11: the rail head yields its name line and stage phrase while the letterhead's box is in frame — the rule v1 applied to segments and not to itself. §3 X-11, §5 `at rest`. |
| Dd-07 | **fix** | The premise is off (`12-layout-measurements.json` `meta.viewports` runs 1280 at **900**, not 800), but the complaint is right that one figure cannot serve two rails. §4 now states the 1180–1439 budget at both heights: **82.0%** at 900 and **79.8%** at 800, with the stack ending at the `pb-24` edge in both. |
| Dd-08 | **fix** | The doors now end at y 804, the `pb-24` edge, so the longest empty run is 96px and it *is* the padding. `measure-layout.mjs:284-289` runs the cursor to `spineRect.bottom`, which is why v1's 96px claim was 85px wrong. §4 "Rail ink, computed". |
| Dd-09 | **fix** | The 1180–1439 rail is 136px and prints words. The active caption is absorbed into the head rather than deleted, so the region's name and the stage both print at that tier without a press. §4 "the 1180–1439 tier". |
| Dd-10 | **fix** | The five doors print their names — `Plan room`, `Spec book`, `Mood boards`, `Call sheet`, `The record` — measured to fit the 112px inner measure at 13px. No glyph is invented; C20 untouched. §4 "the 1180–1439 tier". |
| Dd-11 | **fix** | The band reserves **136px**, not the red-letter branch's measured 152.75px, and the guide branch fills it with its sentence *and* the document's one next act. No document holds 16–72px of white waiting for a branch. §4 header, move 3. |
| Dd-12 | **fix** | Every quiet line is written, with character counts, for all six project stops and all four pre-work stops, each with its inked leader. §4 "R2". |
| Dd-13 | **fix** | The 2px clay tick is deleted; the folded seam prints **`CLOSED BY YOU`**. §4 "R3" table, column *Cause, printed*. |
| Dd-14 | **fix** | X-7, the act cell, is deleted. The one inked leader stays in the region's own quiet head, which is where C7 puts it and which also answers Dp-12. §3 retirements, §4 "R2". |
| Dd-15 | **fix** | X-3, the passed mark, is deleted. Three position signals became two, and the ink it was drawn in (`--color-clay`, 1.82:1 on rail stock) leaves the rail entirely. §3 retirements. |
| Dd-16 | **fix** | X-8 is deleted and X-6 is narrowed: a segment yields its **name**, never its **value**. The install date is the Schedule segment's value at every offset, including while she is standing in the schedule region. §3 X-6, Appendix B row `Dates`. |
| Dd-17 | **accept-and-narrow** | `--doc-landing-clear: 4rem` is no longer an unargued inheritance: it is the floor already in the tree at `globals.css:1037`'s `max(var(--doc-seam-height, 0px), 4rem)`, kept so a landing has exactly the air it has today, and now the only value rather than one arm of a max. It no longer claims to clear anything — nothing pins. §9 Wave 3. |
| Dd-18 | **fix** | The drawer breadcrumb change is deleted from the proposal. Identity below 1440 prints on the rail, in words, at 136px. §4 "the 1180–1439 tier"; §8's D8 row now reads *unchanged*. |
| Dd-19 | **accept-and-narrow** | v2 withdraws the "same words at 390 as at 1440" claim. The 390 bar carries the household alone at every offset; the stage phrase and the region name are the sheet's, one tap away. X states it as a subset and says axis 7's anchor is unmet at that width. §4 "390". |
| Dd-20 | **fix** | The `lg` StrataMark stays at `doc-letterhead.tsx:52-54`, and the seven-mark arc never leaves the rail. The arrival screen keeps its brand mark and the letterhead loses nothing it had. §2, §4 header band table, §8's R15 row. |
| Dd-21 | **fix** | Both critiques cited the wrong site: `ffe-section.tsx:1213` is the install-branch `<h2>` wrapper and `:1302` is the `RegionHead` wrapper. The room head is `RoomHeading`, wrapper at **`:618-620`**, `mt-4` today. v2 sets that one site to 12px. §4 "Region heads and spacing", exceptions. |
| Dd-22 | **fix** | The two printed forms are **`NOTHING YET`** and **`NOT KNOWN YET`** — two sentences. The dash is gone, because F108 already records a fallback string printing identically to a live value. §4 "Two printed forms for zero". |
| Dd-23 | **fix** | §6 carries a stub table: the region heads in frame below the first head, per cell, with the height each. Stubs exist only below the reading line and only before she has reached them — 0 at s2, 0 at s3, at most 3 at s0 — which the one-directional rule guarantees rather than hopes. |
| Dd-24 | **fix** | The line reads `+2 MORE · LEDGERS ↑` and names a surface that exists: the drawer's ledgers row, `studio-drawer.tsx:115`'s `STUDIO_BOOKS`. And every counted exception is *also* printed in words on its own segment's value line, so the count is never the whole answer. §4 header, move 3. |
| Dd-44 | **accept-and-narrow** | Conceded and stated in the proposal: `measure-layout.mjs:245-253` counts a bordered element as ink over its whole rect, so the track reads continuous whatever it paints. §4 now prints both readings — **82.0% by the instrument, ~44% painted** — and narrows the claim to *structured, not empty*. |
| Dd-48 | **accept-and-narrow** | Conceded in §6 in its own paragraph: no cell attributes a point to density, and none could. The claim narrows to two showable things — render cost on the 1,549-line unvirtualized `ffe-section.tsx` (F53), and the arrival table of contents counted in §6's stub table. The mechanism shrinks with the claim: one direction, one threshold, no hysteresis pair, no focus guard, no scroll correction. |
| Dd-51 | **fix** | A carrier window is a **date**, and dates are what this design carries. The `Pieces` segment's value reads `1 DAMAGED · CARRIER SEP 26` when a claim has a deadline; the act stays off-paper. §7's F23/F62/F63/F65 row. |

### C-feasibility (DC) — 31 defects: 29 fix · 2 accept-and-narrow · 0 drop

| id | Verdict | Response |
|---|---|---|
| DC-01 | **fix** | Same as Dd-01: forbidden, not corrected. §3 X-4/X-5, §4 "H5", §11.6. The words `scrollBy`, "correction" and "compensation" still do not appear in this proposal, and now that is the design rather than the hole. |
| DC-02 | **fix** | Extents are derived from data — line counts, room counts, rung counts, from `ticket-derivation.ts:780-793` — never from a rendered box. The ladder never measures a region root, so nothing it draws depends on what the density mechanic did to that root. §4 spine, "Extents come from data". |
| DC-03 | **fix** | `use-region-fold.test.tsx:38-41` is named as a **rewrite**, quoted in §9 Wave 3, with the assertion that changes (`'folded'` → `'open'`) and the two ranges that survive. |
| DC-04 | **fix** | The `latchedDefault` → density change moves **into Wave 3**, with the measured reason quoted: approvals is a 55.5px `FoldSeam` at y 791.8 and a `FoldSeam` prints no head, so without it Wave 3 lands the first head near 434px. §9 Wave 3. |
| DC-05 | **fix** | The `breadcrumbFor()` change is deleted. `studio-drawer.tsx:120-130` is a pure pathname map inside a component mounted outside the document tree, and identity now lives on the rail at both desktop tiers. §4 "the 1180–1439 tier", §8's D8 row. |
| DC-06 | **fix** | Stated plainly: X-1's rAF handler reads `matchMedia('(prefers-reduced-motion: reduce)')` and steps the bracket. §4 "M5" now says the CSS-only policy holds *except for this one handler*, and calls that an amendment rather than compliance. |
| DC-07 | **fix** | §9 Wave 3 deletes `page.test.tsx:1243-1411` — the whole `describe('the job ticket mount (B1)')`, verified at `:1243` with `const TICKET` at `:1244` — and repoints `:1583-1587` and `:1602-1604` at `deriveTicket`. |
| DC-08 | **fix** | The room sub-rungs carry `data-room-chip` and `aria-pressed` and call `toggleRoom()` from `useRoomLens()`, the same contract `job-ticket.tsx:423-431` carries, and they print at **every** offset. `responsive-document-shell.test.tsx:692-750` is named in Wave 3 with the two clicks at `:697-698` that become one. §4 spine, "Room sub-rungs, and the room take". |
| DC-09 | **fix** | S5 answered with the number: 200px at ≥1440, refused narrowing with the 32px-recovered-against-40px-lost arithmetic; 136px at 1180–1439, with `1180 − 136 = 1044 ≥ 1040` showing the paper's measure is unchanged. §4 spine ("S5 — the width, answered"), §11.5. |
| DC-10 | **fix** | Recomputed against `spineRect.bottom`: the doors end at the `pb-24` edge, so the run is 96px. §4 "Rail ink, computed". |
| DC-11 | **fix** | The passed mark is deleted, so no `--color-clay` mark is drawn on rail stock at all. The one clay in the proposal is `--color-clay-ink #7C5E30` on the edited line's rule — on **paper**, and gated at 4.5:1 by `contrast.test.ts:304-311`. §3 X-9, §3 retirements. |
| DC-12 | **fix** | X-11 gives the rail head the yielding rule. At s0 the frame prints identity once (the `<h1>`), stage once (the `lg` mark and the arc, which are one row), and the install date once (the vitals). §3 X-11, §5 `at rest`. |
| DC-13 | **fix** | Named: the needs band owns money while the band is in frame; the Money segment's value yields to it and only to it; below the band the segment owns money alone; the margin prints a kind and a subject, never a second figure. §4 margin item 6, §7's F10 row. |
| DC-14 | **fix** | The instruments move into the letterhead's ledger **at ≥1180 only** — `region-head.tsx:120` is `grid-cols-1` below that, pinned by `region-head.test.tsx:110-121`. At 390 they stay where they mount, and the 390 letterhead is budgeted at 191px with them in it. §4 header, move 2, and §4 "390". |
| DC-15 | **fix** | The arc never moves, so its seven `min-h-11` targets (`doc-spine.tsx:100`, `:111`) are untouched at 44px. v1's 24px row does not exist in v2. §2, §4 spine tenant 2. |
| DC-16 | **fix** | `<FolioLetterhead projectId={row.project_id} />` at `page.tsx:1871` is named and stays; only `LetterheadInstruments` moves out of the `row.engagement_kind === 'project'` fragment at `:1863-1874`. §4 header mount-order, §9 Wave 3. |
| DC-17 | **fix** | The 390 bar prints the household alone — one word in the slot that prints `Project` today. `Vandersteen · Pieces` is withdrawn. §4 "390". |
| DC-18 | **fix** | At 1180–1439 the rail prints the household, the stage phrase with its `4 OF 6`, every segment name, a ≤15-character value on any segment with a number or an exception, and every door name. §4 "the 1180–1439 tier". |
| DC-19 | **fix** | The reserve is sized on the specimen, not the seed: 136px at 1440 (two exceptions with acts plus the `+2 MORE` line), 192px at 390 (the measured `rich.390.s0` `guideOrAttn` height, so a wrapped exception cannot clip), with the truncation rule stated — subject, never number. §4 header move 3, §4 "390". |
| DC-20 | **accept-and-narrow** | Correct, and now stated as an amendment rather than as compliance. §8's SP-04 row: X drops to **zero** writers, meets the plank's intent (one number, never changing under her) more strongly than its letter, and says so. The mechanic is unchanged; the claim of plank-compliance is withdrawn. |
| DC-21 | **fix** | The three call sites are named: `commercial/money-region.tsx:233`, `schedule/schedule-rule-region.tsx:182`, `approvals/project-approval-document.tsx`'s rule. `region/region-rule.tsx` stays untouched and `region-rule.test.tsx:59-74` stays green. §4 "R3", §9 Wave 3. |
| DC-22 | **fix** | The measured numbers are used — **1,109** characters from `page.tsx:1942` to `:1964`, and **143** from the comment at `:1961` — and the render assertion moves to `page.test.tsx`, where the harness exists. The source file keeps its four other `it` blocks. §9 Wave 0. |
| DC-23 | **fix** | Both go the other way: because the arc stays in the rail, `doc-spine.test.tsx:14-19` and `responsive-document-shell.test.tsx:202-211` **stay green** and are named as survivors rather than as rewrites. §9 Wave 1's test list. |
| DC-24 | **accept-and-narrow** | Same concession as Dd-44: SC4 is stated twice, 82.0% by the instrument and ~44% painted, and the claim narrows to *structured, not empty*. §4 "What the metric is, honestly". |
| DC-25 | **fix** | `quiet-release-contracts.spec.ts:169-299` is named as one test that dies whole, with its four handoff steps and the two selectors that carry it, and §9 Wave 1 says where the compact timer doorway goes — to the drawer, which already prints `IN HAND TODAY`. |
| DC-26 | **fix** | §8's NG2 now says the mockup's computed-style sweep (SC8) is the proof and `shadow-gate.test.ts` is the tripwire, quoting its four `readFileSync` assertion sites. |
| DC-27 | **fix** | The in-hand row (`doc-letterhead.tsx:67-77`, `mt-2.5` + `min-h-11` = 54px) leaves the letterhead for the rail's doors, so SC1 is 378/399 with or without a room in hand. §4 header band table, move 5. |
| DC-28 | **fix** | `resolve()` is named as a **rewrite**, with the pick rule stated: the root containing the frame's vertical midpoint, else the last root whose top is above it. §9 Wave 2. |
| DC-29 | **fix** | Named in §4 ("The mark that ends F54, F89 and F93") and scheduled in §9 Wave 3: `Client approvals` and `Schedule dates` open on arrival, it is a visible first-screen change, and it is the change SC1's 378px depends on. |
| DC-30 | **fix** | `stage2-approval-cutover-contract.test.ts:50-58` and `:60-63` are named in §4's margin mount-order note and in Wave 0: `classifyMarginItems`, `MarginDecisionClassificationNotice` and `legacyCoordinationDrafts(coordItems ?? [])` stay imported and referenced through every rewrite. |
| DC-31 | **fix** | Repointed: `mobile/mobile-bar.tsx:216` carries `min-h-[64px]`; `:224` carries `flex-[1_1_0]`; `:230` carries the `truncate`d heading. §4 "390", §5 `mobile`. |

### C-practitioner (Dp) — 30 defects: 27 fix · 3 accept-and-narrow · 0 drop

| id | Verdict | Response |
|---|---|---|
| Dp-01 | **fix** | The paper cannot leap under her, because nothing above her ever changes height. §3 X-5, §4 "H5", §5 `reading` (no exit), §11.6. |
| Dp-02 | **fix** | `INSTALL SEP 15 · 3 WEEKS` is the Schedule segment's **value**, and a value never yields — so the install date is on screen at s0, s1, s2 and s3, including while she is standing in the schedule region moving it. §3 X-6, Appendix B row `Dates`. |
| Dp-03 | **fix** | The slot with three subjects is deleted with X-8. The rail head holds two facts that never change subject: the household, and the stage with its count. §3 retirements, §4 spine tenant 2. |
| Dp-04 | **fix** | Every segment prints its exception in **words** at both desktop tiers — `1 OVERDUE · 6D`, `1 DAMAGED · CARRIER SEP 26`, `$17,500 OUT · $12,300 NOT DRAWN` — capped at 15 characters at 1180–1439 and 40 at 1440. A tick is no longer the whole signal anywhere. §4 "the 1180–1439 tier", §4 "R2". |
| Dp-05 | **fix** | `$17,500 OUT · $12,300 NOT DRAWN` — 31 characters, both numbers, on the Money segment at every offset. The deposit stops being a thing she has to remember is somewhere below. §4 "R2" table, Appendix B row `Money`. |
| Dp-06 | **fix** | Identity at 1280 is on the paper's own rail in words, not in the drawer strip F03 measures overprinting. The phase prints there too, as `4 OF 6`. §4 "the 1180–1439 tier". |
| Dp-07 | **fix** | Two moves: X-11 yields the head's text at s0, and the arc never enters the letterhead, so stage is one row in one organ. §3 X-11, §2. |
| Dp-08 | **accept-and-narrow** | The count in R1's own test was the wrong unit and v2 says so. The rail above the `--rule-mid` is `Put down` plus one head holding name, arc and stage — three elements, **one tense**: *this job, where it stands*. The falsifying observation narrows from "exactly two things" to "more than one tense", which is what F96's diagnosis (four tenses in 145px) actually measured. §10 R1. |
| Dp-09 | **fix** | X-12 forces only the regions **between the current offset and the target** to full, all of them below the frame, in one commit **before** the offset is computed. Nothing above her expands mid-flight. §3 X-12, §7's F45 row, §9 Wave 2. |
| Dp-10 | **fix** | The doors print their words at 136px, measured. No glyph language is invented. §4 "the 1180–1439 tier". |
| Dp-11 | **fix** | The phrase "true proportional extent" is **withdrawn**. The floor drops from 44px to 24px (2.5.8 AA on a 168px-wide row), which takes the drawn ratio from 3.2:1 to 4.7:1 against a true 10:1, and the proposal states outright that the drawing carries order and reach while the **count in the value line carries scale**. §4 spine, "The floor, and what it costs". |
| Dp-12 | **fix** | The quiet head keeps the region's one inked leader. `quiet` is three printed things — head, ≤40-char line, leader — and C7 holds at both densities. §4 "R2". |
| Dp-13 | **fix** | The passed mark is deleted, so there is nothing left to state a reverse for. §3 retirements. |
| Dp-14 | **fix** | S5 answered in one section with the number and the arithmetic at both tiers. §4 "S5 — the width, answered", §11.5. |
| Dp-15 | **fix** | The 390 bar carries one word. The three-line claim is withdrawn and the subset is stated. §4 "390". |
| Dp-16 | **fix** | Sub-rungs take the same 24px floor as segments, six print, and a seventh collapses into `+3 MORE` which opens the sheet — so a nine-room job does not push a rung under the floor. §4 spine, "Room sub-rungs". |
| Dp-17 | **fix** | The reserve drops to 136px and both branches fill it — the guide branch with its sentence and the document's one next act — so nothing reads as a block that failed to load. §4 header, move 3. |
| Dp-18 | **fix** | Correct, and load-bearing. F61 is killed (`31-verified-findings.md:183`; `.has-wash { isolation: isolate }` at `globals.css:322-325`), so X adopts `content-visibility: auto` on **passed** regions, where it changes no height, and `⌘F` reaches them. §3 X-5, §9 "Where X disagrees with E1", §9 Wave 4's find-in-page gate. |
| Dp-19 | **accept-and-narrow** | The group is renamed **`FILED WITH THIS JOB`** and the proposal says why the ledger is not in it: orders and receiving are studio ledgers, one press away in the drawer at every offset, and SP-08 forbids a second door for them. The group no longer promises more than it holds; it does not gain the door. §4 spine, tenant 4. |
| Dp-20 | **fix** | `CLOSED BY YOU`, printed. §4 "R3" table. |
| Dp-21 | **fix** | The door prints `Call sheet` with **no count**. `source/specimen.md` names a roster but no call-sheet number, and SP-02's discipline forbids inventing one; a door that is a name is a door. Appendix B row `People`. |
| Dp-22 | **fix** | §6 marks SC2 as satisfied **by deletion** and SC3 as **not applicable to a deleted organ**, and hands the probe the rail head as its own named measurement (100/100/100), exactly as X already did for SC11. |
| Dp-40 | **fix** | Named and answered rather than refused: passed regions keep their DOM and take `content-visibility: auto`, which find-in-page reaches. Wave 4 gates on one Playwright assertion that it does, and drops the attribute if it does not. §9 Wave 4. |
| Dp-41 | **fix** | Said plainly in §10 R4: the scroll extent grows monotonically as she descends, always forward, never backward, and the scrollbar stops being the measure. The measure moves to the ladder's window — which is derived from **data**, not from `scrollHeight`, so it does not move when the document grows. The falsifying observation is a designer reporting she now has no measure at all. |
| Dp-42 | **fix** | Same as Dp-18: the refuted premise is dropped and the mechanism it was blocking is adopted at half its blast radius. §9 "Where X disagrees with E1". |
| Dp-43 | **fix** | One site, one value: `ffe-section.tsx:618-620`, `mt-4` → 12px. Both critiques cited wrappers that are not the room head. §4 "Region heads and spacing", exceptions. |
| Dp-44 | **fix** | At the resume landing every standing exception is in frame, on the rail, in words — one per segment value line: `1 OVERDUE · 6D`, `1 DAMAGED · CARRIER SEP 26`, `$17,500 OUT · $12,300 NOT DRAWN`, `INSTALL SEP 15 · 3 WEEKS`. Four of four on the specimen. No new machinery; it falls out of "a value never yields". §7's F56 row. |
| Dp-45 | **fix** | The carrier window is a date and it prints: `1 DAMAGED · CARRIER SEP 26` on the Pieces segment, and the deadline ranks the exception into the needs band. The act stays off-paper. §7's F23/F62/F63/F65 row. |
| Dp-46 | **accept-and-narrow** | Said out loud and counted, which is what the defect asked for. §4 margin, "What the margin gave up…": the rail sheds ~250px of timer and presence and takes 192px of doors; the margin sheds 230px of prose and takes nothing but two headings. The doors come from the deleted ticket, not from the margin. The claim narrows from "X answers the margin complaint" to "X answers the margin complaint by deletion and answers the rail complaint by eviction, and the doors are the ticket's". |
| Dp-47 | **fix** | Empty vitals fields are suppressed and `PHASES ▸` is deleted (F129, F134) — and the phase count it never printed now prints on the rail head as `4 OF 6`. §4 header band table, §9 Wave 1. |

### C-access (Dc) — 16 defects: 15 fix · 1 accept-and-narrow · 0 drop

| id | Verdict | Response |
|---|---|---|
| Dc-01 | **fix** | X-11 yields the head's two text lines while the letterhead is in frame; the drawer-breadcrumb variant is gone because that change is deleted. §3 X-11, §4 "the 1180–1439 tier". |
| Dc-03 | **fix** | The rail head's third line is deleted with X-8, and M-9's `THE RECORD` swap with it. The Record is a ladder segment, and its **name** yields when its own head is in frame (X-6). §3 retirements, Appendix A M-9. |
| Dc-06 | **fix** | The owner is named per state: the needs band owns money while it is in frame; below it the Money segment owns it alone; the margin never prints a figure a segment is printing. §4 margin item 6, §7's F10 row. |
| Dc-08 | **fix** | §4 "M5" lists all nine existing blocks by line — `globals.css:283`, `:439`, `:496`, `:833`, `:955`, `:1013`, `:1188`, `:1468`, `:1519`, plus the no-preference gate at `:429` — and says the new block sits immediately after `:283`, the breath's. |
| Dc-09 | **fix** | §5 closes with a focus contract for every press: the target region's `<h2>` through `regionHeadingId` (`document-index.ts:93-102`) and the shipped `focusRegionHeading` (`region/fold-seam.tsx:41-44`). It is also X-12's own `what changes` cell. |
| Dc-11 | **fix** | `scroll-padding-bottom: 60px` on the shell, so a focused act at the foot clears the fixed drawer. §9 Wave 3, `page.tsx`. |
| Dc-12 | **fix** | The ring is the one the rail already uses: `focus-visible:outline-2 outline-offset-2 outline-[var(--color-clay)]` (`doc-spine.tsx:49-52`). No new ring token, no new background — the ladder sits on the same rail stock `Put down` already sits on. §4 "H4", §4 spine tenant 2. |
| Dc-15 | **accept-and-narrow** | The position is now stated rather than unstated: no in-product toggle, because 2.3.3 is AAA against an AA bar and the opening of a region ahead is essential to the mechanic (SC1's recovery and the render control both depend on it). The dev-bar toggle is named as a QA instrument. X does not claim 2.3.3; it declines it with the reason. §4 "M5", closing paragraph. |
| Dc-16 | **fix** | §2 names the fragility explicitly — `#65594E` at 5.317:1 on rail stock (F74), X's heaviest single consumer — and adds a standing rule: no weight, size or opacity change to a rail label ships without re-running `contrast.test.ts`, whose `RAIL_FILES` Wave 0 converts to a glob so it cannot stop scanning. |
| Dc-18 | **fix** | Every row of the 390 spine sheet is `min-h-11` (44px), against 2.5.8's 24px floor. §4 "390". |
| Dc-20 | **fix** | A quiet region's root carries `data-density="quiet"` and `aria-describedby` pointing at a visually-hidden `Opens as you reach it.` — so a screen-reader user arriving by heading navigation is told the state a sighted reader reads from position. §5 `condensed`, ARIA row. |
| Dc-21 | **fix** | The announcement is capped at **one per distinct region**, not one per settle, so scrolling back and forth across one boundary announces once. §5 `reading`, Announces row; §3 X-10. |
| Dc-22 | **fix** | The host is named: the visible `[data-lens-window]` element in the ladder carries `aria-live="polite"`. One node, visible, no hidden duplicate. §3 X-10, §5 `reading`. |
| Dc-23 | **fix** | The rail head is a `<button>` carrying the shipped scored-ink grammar (`da-score-hover`) and the shipped ring at `doc-spine.tsx:49-52` — borrowed, not built. §4 "H4". |
| Dc-24 | **fix** | §4 states the DOM order (`DocSpine` at `page.tsx:1777`, before `<main>` at `:1789`), states the naive count (21), and gives the mechanism that reduces it to four: one `<nav aria-label="This paper">` with a roving tabstop over the arc, the ladder and the doors. No `tabindex` above 0, no new iconography. |
| Dc-25 | **fix** | The block's coverage is listed row by row — X-2, X-6, X-9, X-11 — and every uncovered row is named with the reason: X-3 is deleted, X-4/X-5 have no transit, X-10 is arithmetic, X-12 uses the shipped branch at `use-document-running-index.ts:206-214`, X-1 is the one JS exception and is declared as one. §4 "M5". |

---

*Ends. 104 defects answered: 93 fixed, 10 accepted and narrowed, 1 dropped. The three changes a judge should weigh first: the lens now opens forward and never takes back, which removes the program's only blocker-severity defect by deletion rather than by a same-frame correction; the ladder indexes the whole paper in words at both desktop widths, which is the thesis finally paying for its own column; and the rail head yields to the letterhead, which is X applying its own law to itself.*
