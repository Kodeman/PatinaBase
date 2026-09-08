# 02 — Fix log: `designer-desk.html` (Specimen 2, The Desk at real load)

Fix pass against `01a-specimens-technical.md` and `01b-specimens-design.md`,
plus the coordinator's sheet amendments A–P. Every "must not be changed" item
(the scored-ink tier CSS, the unconditional rest rule, the stage plates, the
dotted leader, the 96px action column, the overdue trio) is intact.

File: `specimens/designer-desk.html` — **41,086 bytes** (was 38,572).

---

## Findings naming this file

| ID | Sev | Status | What was done / why not |
|---|---|---|---|
| **T01** | P2 | **Fixed** | Amendment J. The seven `--tab-*` overrides are removed from both dark blocks, so the plates keep their light values (`--tab-brief` computes to `#497093` under `prefers-color-scheme: dark` and under `[data-theme="dark"]` — verified live). White labels return to the documented 5.22–8.20:1. |
| **T02** | P2 | **n-a — overruled** | Amendment H makes the 15-named + *Hollenbeck residence* (Project ×4) roster canonical for the 16-job state. Left as built. |
| **T10** | P3 | **n-a — superseded** | T10 verified the bottom bar's `--clay` focus ring as a correct adaptation to a charcoal ground. Amendment F removes the charcoal ground, so the ring returns to the standard `--clay-ink` (now on `--paper-doc`, 5.7:1). |
| **SF-13** | P1 | **Fixed** | Amendment O. `.row-name` rests on `1px var(--oak)` (4.20:1) and raises to `--clay` on hover/focus. The same change applied to `.idx .idx-label` in the studio index and to the bottom-bar links, so no line in the file is drawn in `--rail` (amendment A). |
| **SF-14** | P2 | **Declined — overruled** | Amendment H makes *Leah Hartwell · Anneke Sund · Colin Brandt* canonical. Left as built. |
| **SF-15** | P2 | **Fixed** | The note is now `.t-body` with only the em-dash lead in `.t-authorship` (CR-16), and its second sentence (`.note-tail`) is dropped below 700px — a complete shorter sentence, not a truncation. At 390 the block falls from four 20px Playfair lines to two 16px Inter lines (~90px reclaimed above the day's line). |
| **SF-16** | P2 | **Fixed** | `.studio-index` moved inside `.desk-grid` at `grid-column: 1; grid-row: 2`, so the roster and the index share one 744px measure at ≥1200px. |
| **SF-17** | P2 | **Fixed** | The urgent mark is `--terracotta-ink` (a paper ink) against the quiet `--clay`; the two dots are now plainly different weights. |
| **SF-18** | P3 | **Fixed** | The `role="status"` line is clipped out of sight until the rendered state signature actually changes, then it appears. At rest it no longer restates the roster head; in every state capture it is visible and agrees with the head. |
| **SF-19** | P3 | **Named, not changed** | The finding's own fix is "fine for a specimen; name it". Row names and day's-line links resolve to the row's own `id` — a self-referential anchor standing in for a job route that does not exist in a standalone file. |
| **SF-20** | P3 | **Fixed** | `.roster-head` is `flex-wrap: nowrap` at ≥1000px with the head text allowed to wrap internally (`flex: 1 1 auto; min-width: 0`), so the facets hold their position when the head grows in the needs-me state. |
| **SF-21** | P3 | **Declined (accepted as untested)** | The finding offers "accept it as untested" as an alternative. Adding a fifth switcher state would declare a state §D does not, and A12 ties the switcher to declared states. The `Nothing needs your hand today.` branch remains in the renderer. |
| **SF-22** | P3 | **Fixed, differently** | Reducing `.act`'s own padding would edit the tier CSS that the review's "must not be changed" §1 protects. Row padding went 10px → 12px instead (a half-module), which opens the gap between adjacent 44px *Open* targets from ~2px to ~6px without touching `.act`. |
| **SF-23** | P3 | **Declined** | §D quotes `TUESDAY · 8 SEPTEMBER` verbatim and the finding's own fix says "leave, or align". It is a greeting, not a money or record date; every dated *fact* on the page (10/11/12/19 September, 4 September) is already in one style. |
| **CR-10** | P2 | **Fixed** | The overdue day's line is now `One thing is overdue — <a>Vandersteen</a><span class="overdue-clause">, install, since 4 September</span>` — the job name keeps link pigment and its oak rule; only the words after it take `--terracotta-ink`. |
| **CR-11** | P3 | **Kept** | Leader, plates and 96px column untouched; re-verified at 43 jobs, both widths. |
| **CR-12** | P3 | **Fixed** | The doorway glyph is redrawn as an arch-topped opening with a threshold line and a handle; it no longer reads as a bookmark. |
| **CR-13** | P3 | **Declined** | Letting the roster reclaim the gutter below the boards would change the row measure partway down the list, moving the 96px action column and the leader terminus mid-roster — the one thing §7 of "must not be changed" protects. SF-16 (P2) resolves the same complaint's real defect (two measures) by pulling the index into the roster's column; the empty gutter is deliberate silence. |
| **CR-16** | P3 | **Fixed** | See SF-15 — the note is body prose with a Playfair italic em-dash lead. |
| **OS-01** | P1 | **Fixed** | Amendment D. `.act--inline` is now a named tier variant in the sheet block (inherits family/size/case/colour, no box, 1px `--oak` rule 3px below the baseline, `--ink-faint` 1.5px on hover, shared focus ring). The three day's-line links and "and N more below" use it. |
| **OS-05** | P2 | **Fixed** | Amendment E. `[aria-pressed="true"]` on a scored act = `--ink` text plus the secondary two-score rule (ink `::before` at 1.5px, clay `::after`); unpressed keeps the tertiary look. Applied to both facets and the 16/43 switcher. The `⌘K` chip takes the unpressed-chip treatment (paper ground, 1px `--hairline-strong`). |
| **OS-06** | P2 | **Fixed** | Amendment F. The bottom bar is `--paper-doc` with a 1px `--hairline-strong` top rule and `--ink` text; links carry the oak rest rule. No charcoal chrome remains, and the bar no longer inverts to a bright band in dark mode. |
| **OS-07** | P2 | **Fixed** | The stage plate is renamed `.stage-plate` / `.stage-plate--*` / `.stage-plate--person`; `.plate` is left free for the image plate the other two specimens use. |
| **OS-08** | P2 | **n-a** | This file already uses the sheet's 1100px measure. |
| **OS-11** | P3 | **Fixed** | Running heads are one ink: the date, `APPEARS ONCE · RECEDES ON USE`, `BOARDS`, `THE STUDIO INDEX`, `ROOMS/LEDGERS/BEGIN` and `LOCAL DEV STUDIO` are all `--ink-muted`; only the marked roster head stays `--ink`. |
| **PR-09** | P1 | **Fixed** | Amendment A. Every meaning-carrying stroke in the three board drawings is `var(--ink-faint)` at 1px, with subordinate lines at `stroke-opacity: .5`. `--rail` survives only as a fill (the scan card's ground). Zero `stroke="var(--rail)"` and zero `border: … var(--rail)` remain in the file. |
| **PR-12** | P2 | **Fixed** | Amendment P. Each 92px board is now a drawn elevation plate (floor line + an elevation figure), a scan/plan card with three note rules, two pigment swatches and a caption rule — not three empty rectangles. Each keeps `role="img"` and a rewritten `aria-label`. |
| **PR-15** | P2 | **Fixed** | Duplicate of SF-16. |
| **PR-03 / PR-04 / PR-05 / PR-06** | P1/P2 | **n-a** | Amendments B and C. The Desk carries no money block, no `.t-money` and no terminal act. |
| **IX03 / IX04** (panel, §E) | — | **Fixed** | Resolved by SF-13; the roster row now rests on the same 4.20:1 oak rule as every other act on the page. |

## Amendments applied

**A** (drawing ink) · **D** (`.act--inline`) · **E** (pressed states + chips) ·
**F** (paper bottom bar) · **H** (fixture now canonical) · **J** (dark plates keep
light values) · **L** (`scroll-padding-top: 60px`, measured equal to the sticky
`.stage-head`'s 60px — verified no plate/row overlap after a fragment jump at
390 and 1440) · **M** (status line kept) · **N** (the head sentence now states
*both* facets in words — `EVERY JOB · 16 LIVE · 1 OVERDUE · SHOWING WHAT NEEDS
YOU · BY PERSON` — and the status line, "and N more below" and the day's line
agree in all four states) · **O** (oak rest rule on job names) · **P** (richer
boards).

**n-a:** B, C, G, I, K (no money block, no terminal act, no hold, no ledger
table, no embedded image in this specimen).

## Gate

`tools/render.mjs`, sandbox disabled (`MachPortRendezvousServer: Permission
denied` inside the Bash sandbox, per `tools/README.md`).

Renders in `shots/specimens/`:

- `designer-desk-default-1440.png` · `-43jobs-1440` · `-needsme-1440` · `-byperson-1440`
- `designer-desk-default-390.png` · `-43jobs-390` · `-needsme-390` · `-byperson-390`
- `designer-desk-1440-dark.png` · `designer-desk-1440-rm.png`
- `designer-desk-console.json` (8 state captures) · `designer-desk-dark-console.json` · `designer-desk-rm-console.json`

All 10 captures: `errors: []`, `warnings: []`, `horizontalOverflow: false`;
render exit code 0. All 10 PNGs opened and inspected — no clipped text, no
overlap, real Playfair/Inter/DM Mono faces. First stage plate at **y = 551** at
1440 in the 16-job default (was 580). One `h1`; headings in order. Static: zero
`box-shadow`, `text-overflow`, bare `disabled=`, `opacity: .5`, `@keyframes`,
`PATINA`, `0:47`. Zero hex literals outside the `:root` token blocks (this file
has no terminal act, so it does not use the sheet's `#1F1D1A` hover).

---

## Pass 2 — shared-CSS alignment (from `03-rereview-specimens.md`)

The re-review marks this file **ready to publish** with two non-blocking notes,
RR-03 and RR-04. Both are now closed.

| ID | Status | What was done |
|---|---|---|
| **RR-02** | **n-a → aligned** | Raised against `decision-moment.html`, but the shared block resolves the cross-file divergence here too: `.act--inline` now underlines with `border-bottom` on the element (not `.label::before`), inherits colour, and takes `padding: 0 0 3px`. The coordinator's block is pasted **verbatim**, so all three specimens are byte-identical on this rule. |
| **RR-03** | **Fixed** | The pressed state is now the sheet's unscoped `.act[aria-pressed="true"]` / `[aria-pressed="false"]` selector pair, replacing the pass-1 `.act--tertiary[aria-pressed="true"]` scoping. |
| **RR-04** | **Fixed, per the ruling** | The meta-strip 16⇄43 switcher is now `.chip` with `aria-pressed` (specimen chrome). The roster-head facets stay scored `.act.act--tertiary` with `aria-pressed`, per the coordinator's ruling that they are acts in a document head, not chips. |

**Shared block.** `.act--inline`, `.act[aria-pressed]` and `.chip` are the
coordinator's text verbatim, in one commented run. Two knock-on edits were
needed and are noted here:

- `.specimen-meta .act { min-height: 32px; … }` was deleted — the strip no
  longer contains an `.act`. The strip grows from ~40px to ~62px to hold the
  44px chips; the first stage plate still lands at **y = 563** at 1440 in the
  16-job default.
- The `⌘K` key cap was `class="chip"`. It is a key legend, not a pressed
  control, so it was renamed `kbd.keycap` and keeps its own 11px treatment;
  `.chip` is now used only by the switcher.

## Pass 2 gate

Full gate re-run: 4 states × 2 widths, plus `--dark` and `--reduced-motion` at
1440 — 10 captures, `errors: []`, `warnings: []`, `horizontalOverflow: false`
throughout, exit 0. All 10 PNGs opened and inspected: chips read correctly
pressed (`--rail` ground, `--ink-faint` border) and unpressed (`--paper`,
`--hairline-strong`) in light and dark; facets keep the two-score pressed rule;
the day's-line inline acts keep their oak rule and the terracotta clause after
the job name. One `h1`, no overflow, zero `box-shadow` / `text-overflow` /
bare `disabled=` / `opacity: .5` / `0:47`, zero hex outside the `:root` blocks.

File: **41,509 bytes**.
