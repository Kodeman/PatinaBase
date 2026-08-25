# Deck revision log 2 — D5 pass on the three self-rule violations

Three violations of the deck's own rules were found in the finished deck by the
orchestrator's read:

1. **Money ladder** — the two lanes drew shared planks SP-03 and SP-04 differently, and
   Direction A printed an invented `Moved` figure (`$62,700`) derived by subtracting the
   client's payments to the studio from the amount ordered to makers. §8 of
   `source/instruments.md` carries no vendor-payout figure, so `Moved` cannot be re-derived.
2. **Roster** — A printed `5 on the roster` / `CALL SHEET · 5` where §8 gives no roster
   figure and B (correctly, per the 08b rule) printed the honest empty.
3. **Boards** — A printed `3 boards` where §8 gives no board count and B printed
   `No boards yet · start one`.

All three are fixed. Nothing else in the deck was touched.

---

## Edits — file: old → new

### 1. Money ladder

Both lanes now print the same four shared rungs, in the same order and wording; each lane
keeps its own extra rungs, glosses and column style.

| File | Old | New |
|---|---|---|
| `mock/a/M2.html` + `mock/fragments/a-M2.html` (ladder) | `Moved` / `$62,700 in motion` / gloss `ordered $141,600 less $78,900 paid out` | `Moved` / `$141,600 in motion` / gloss `ordered through installed (committed, not yet paid out)` |
| `mock/a/M2.html` + `mock/fragments/a-M2.html` (figcaption) | `…the ladder prints all six figures with <i>Moved</i> re-derived to $62,700.` | `…the ladder prints all six figures.` |
| `mock/b/M2.html`, `mock/b/M3.html` (+ fragments) | `<span class="ml-label">Authorized</span><span class="ml-value">$184,500 approved</span>` | `<span class="ml-label">Budget</span><span class="ml-value">$184,500 approved</span>` |
| `mock/b/M2.html`, `mock/b/M3.html` (+ fragments) — **SP-03** | `<span class="ml-label">Committed</span><span class="ml-value">$141,600 ordered</span>` | `<span class="ml-label">Authorized</span><span class="ml-value">$141,600 ordered</span>` |
| `mock/b/M2.html`, `mock/b/M3.html` (+ fragments) — **SP-04** | `Moved <em>in motion — ordered through installed (committed, not yet paid out)</em>` / value `$141,600` | `Moved <em>ordered through installed (committed, not yet paid out)</em>` / value `$141,600 in motion` |

The four shared rungs, identical in both lanes:

```
Budget      $184,500 approved
Plan        $171,240 specified
Authorized  $141,600 ordered                                                  (SP-03)
Moved       $141,600 in motion - ordered through installed
                                 (committed, not yet paid out)                (SP-04)
```

Lane-own rungs, unchanged: A adds `Owed · $17,500 out · Invoice 2026-114, 22 days` and
`Not drawn · $12,300 deposit · PO-2026-0418, 50% at release`; B adds
`Owed you · $17,500 · Invoice 2026-114 · 22 days`.

A's M5 ladder is the fold-truncated three-rung view (`Budget`, `Plan`, `Authorized`) —
those three already matched and were left alone. B's M5 is a different job (install phase,
`No balance due`) and has no ladder.

### 2. Deck text that depended on the old arithmetic

| File | Old | New |
|---|---|---|
| `mock/deck-parts/07a-direction-a.html` | `<strong>The money ladder prints its own arithmetic</strong>, all six figures on screen — … <code>Moved $62,700 in motion</code> (ordered less paid out, so it is finally a different number from Authorized), …` | `<strong>The money ladder prints all six figures</strong> on screen — … <code>Moved $141,600 in motion — ordered through installed (committed, not yet paid out)</code>, … The specimen carries no vendor-payout figure, so <code>Moved</code> prints the ordered figure under SP-04's gloss until the accounts surface a payout number — a data question, listed in §11.` |
| `mock/deck-parts/10-recommendation.html` | `<strong>A's money ladder arithmetic</strong> — all six figures printed, with <code>Moved</code> re-derived so it is finally a different number from <code>Authorized</code>. Better than B's fifth rung alone.` | `<strong>A's ladder prints six rungs where B prints five</strong> — <code>Owed</code> and <code>Not drawn</code> both on screen. <code>Moved</code> cannot be re-derived from the specimen; see the data question in §11.` |
| `mock/deck-parts/09-compare.html` | — | **no change needed.** Grepped every cell for `$62,700` and for `re-derived`: zero hits. The section's only money sentence is `…the four money doors survive as four…`, which is a door count, not an arithmetic claim. Judges' scores untouched. |
| `mock/deck-parts/11-questions.html` | `<h2 id="q-h">Nine things we need answered before anyone builds</h2>` | `<h2 id="q-h">Ten things we need answered before anyone builds</h2>` |
| `mock/deck-parts/11-questions.html` (lede) | `…Three are defects the evidence surfaced that belong to no direction and currently have no owner.` | `…Three are defects the evidence surfaced that belong to no direction and currently have no owner, and one is a data question the specimen itself raises.` |
| `mock/deck-parts/11-questions.html` | — | **added** question `10 · A data question · no owner` — *"`Moved` — which number is it?"*: the rung equals `Authorized` on this specimen; an *in motion* figure needs vendor payouts, which the accounts band holds and the Money region never reads; the specimen's only payment figures (`Invoiced to date $96,400`, `Paid to date $78,900`) are money coming in, not paid out, so subtracting would invent arithmetic; both directions now print the ordered figure under SP-04's gloss. **We ask:** expose vendor payouts to the Money region so `Moved` carries its own number, or retire the rung. |

### 3. Roster — A now prints the honest empty

| File | Old | New |
|---|---|---|
| `mock/a/M2.html` (shelf sub-line) | `Call sheet` / `5 on the roster` | `Call sheet` / `nobody on it yet` |
| `mock/a/M2.html` (instruments) | `Call sheet · 5` | `Call sheet · 0` |
| `mock/a/M3.html` (instruments) | `Call sheet · 5` | `Call sheet · 0` |
| `mock/a/M3.html` (⌘K row) | `Call sheet` / `this project · 5 on the roster` | `Call sheet` / `this project · nobody on it yet` |
| `mock/a/M3.html` (figcaption) | `<i>Call sheet · 5</i> on the instruments row` | `<i>Call sheet · 0</i> on the instruments row` |
| `mock/a/M4.html` (instruments) | `Call sheet · 5` | `Call sheet · 0` |
| `mock/a/M4.html` (More sheet) | `Call sheet` / `5 on the roster` | `Call sheet` / `nobody on it yet` |
| `mock/a/M5.html` (shelf sub-line) | `Call sheet` / `5 on the roster` | `Call sheet` / `nobody on it yet` |

### 4. Boards — A now prints the honest empty

| File | Old | New |
|---|---|---|
| `mock/a/M2.html` (shelf sub-line) | `Mood boards` / `3 boards` | `Mood boards` / `no boards yet` |
| `mock/a/M3.html` (⌘K row) | `Mood boards` / `this project · 3 boards` | `Mood boards` / `this project · no boards yet` |
| `mock/a/M4.html` (More sheet) | `Boards` / `3 boards` | `Boards` / `no boards yet` |
| `mock/a/M5.html` (shelf sub-line) | `Mood boards` / `3 boards` | `Mood boards` / `no boards yet` |

A grep across `mock/a`, `mock/b` and `mock/fragments` for `on the roster`,
`Call sheet · 5` and `3 boards` returns zero hits.

### 5. New tool

`mock/check-specimen.mjs` — reads the ten fragments, strips markup (block tags become row
boundaries, inline tags become cell boundaries), and pulls the value that follows each
tracked label. Prints lane × screen × label × value plus a per-label verdict. Run:
`node mock/check-specimen.mjs`.

---

## Specimen consistency table

```
LANE  SCREEN  LABEL       VALUE
----  ------  ----------  --------------------------------------------------------
A     M2      Budget      $184,500 approved what the client has agreed to fund
A     M5      Budget      $184,500 approved what the client has agreed to fund
B     M2      Budget      $184,500 approved
B     M3      Budget      $184,500 approved

A     M2      Plan        $171,240 specified what the plan intends to spend
A     M5      Plan        $171,240 specified what the plan intends to spend
B     M2      Plan        $171,240 specified
B     M3      Plan        $171,240 specified

A     M2      Authorized  $141,600 ordered what is contractually owed to makers
A     M5      Authorized  $141,600 ordered what is contractually owed to makers
B     M2      Authorized  $141,600 ordered
B     M3      Authorized  $141,600 ordered

A     M2      Moved       $141,600 in motion ordered through installed (committed, not yet paid out)
B     M2      Moved       ordered through installed (committed, not yet paid out) $141,600 in motion
B     M3      Moved       ordered through installed (committed, not yet paid out) $141,600 in motion

A     M2      Owed        $17,500 out Invoice 2026-114, 22 days · $96,400 billed to date
B     M2      Owed        Invoice 2026-114 · 22 days $17,500 Send a reminder
B     M3      Owed        Invoice 2026-114 · 22 days $17,500 Send a reminder

A     M1      Call sheet  makers, trades, clients
A     M1      Call sheet  The Scans Ledgers ↑ Find anything ⌘K
A     M2      Call sheet  nobody on it yet
A     M2      Call sheet  0
A     M2      Call sheet  The Scans Ledgers ↑ Find anything ⌘K
A     M3      Call sheet  0
A     M3      Call sheet  this project · nobody on it yet
A     M3      Call sheet  The Scans Ledgers ↑ Find anything ⌘K
A     M4      Call sheet  0
A     M4      Call sheet  nobody on it yet
A     M5      Call sheet  nobody on it yet
A     M5      Call sheet  The Scans Ledgers ↑ Find anything ⌘K
B     M1      Call sheet  Scans The ledgers ↑
B     M2      Call sheet  Nobody on it yet
B     M2      Call sheet  0
B     M3      Call sheet  Nobody on it yet
B     M3      Call sheet  0
B     M4      Call sheet  0
B     M5      Call sheet  Nobody on it yet

A     M2      Boards      no boards yet
A     M3      Boards      this project · no boards yet
A     M4      Boards      no boards yet
A     M5      Boards      no boards yet
B     M2      Boards      No boards yet · start one
B     M3      Boards      No boards yet · start one
B     M5      Boards      No boards yet · start one

A     M2      Spec book   34 specified · by room
A     M3      Spec book   this project · 34 specified
A     M4      Spec book   34 specified · by room
A     M5      Spec book   34 specified · by room
B     M2      Spec book   34 of 36 specified · by room
B     M3      Spec book   34 of 36 specified · by room
B     M5      Spec book   Nothing specified yet

A     M2      Plan room   the drawing set · nothing filed
A     M3      Plan room   this project · the drawing set
A     M4      Plan room   the drawing set · nothing filed
A     M5      Plan room   the drawing set · nothing filed
B     M2      Plan room   Nothing filed
B     M3      Plan room   Nothing filed
B     M5      Plan room   Nothing filed

BY LABEL — do the lanes agree on the figure?
LABEL       VERDICT   KEYS
Budget      MATCH     A: $184,500    B: $184,500
Plan        MATCH     A: $171,240    B: $171,240
Authorized  MATCH     A: $141,600    B: $141,600
Moved       MATCH     A: $141,600    B: $141,600
Owed        MATCH     A: $17,500    B: $17,500
Call sheet  MATCH     A: makers trades clients | the scans ledgers find anything k | nobody on it yet | 0 | this project nobody on it yet    B: scans the ledgers | nobody on it yet | 0
Boards      PARTIAL   A: no boards yet | this project no boards yet    B: no boards yet start one
Spec book   DIVERGE   A: 34 specified by room | this project 34 specified    B: 34 of 36 specified by room | nothing specified yet
Plan room   PARTIAL   A: the drawing set nothing filed | this project the drawing set    B: nothing filed
```

### Reading the table

- **The five money rungs now MATCH on the figure in both lanes.** `Moved` was the fix: A
  read `$62,700`, B read `$141,600`; both now read `$141,600` under the same SP-04 gloss.
  The remaining word-order difference on `Moved` is the lanes' column style — A puts the
  figure before the gloss, B after — not a data divergence.
- **Call sheet and Boards MATCH/PARTIAL on the empty phrase.** A's remaining `Call sheet`
  rows on M1/M2/M3/M5 that read `The Scans Ledgers ⌘K` are the register's nav list bleeding
  into the extractor's block window; they are not roster values.
- **Two divergences remain that are outside this pass's scope, and are recorded, not fixed:**
  - `Spec book` — A prints `34 specified`, B prints `34 of 36 specified`. Same source
    number; B carries the denominator, A does not. Neither invents a figure.
  - `Boards` / `Plan room` PARTIAL — B appends its own call to action (`· start one`) and A
    appends its own descriptor (`the drawing set`). Lane style, same data.
  - `B M5` values (`Nothing specified yet`, `No balance due`) belong to a *different job*
    (install phase, kitchen only), not the Vandersteen specimen, so they are not comparable
    with A's M5.

---

## Build output

```
fonts        : 12 @font-face in kit.css → 0 kept (relative-url faces stripped)
fragments    : 10 inlined
screenshots  : 20 embedded (1.53 MB raw)
sections     : 25 open / 25 close
figures      : 35 open / 35 close
leftovers    : 0
doc/html tags: none
box-shadow   : 0
non-ascii    : 0 bytes left (2 style/script blocks folded)
size         : 2727016 bytes (2.60 MB)  OK ≤16MB
wrote        : …/document-wayfinding-directions-2026-08-25/presentation.html
```

`mock/fragments/{a,b}-M{1..5}.html` were re-synced from `mock/{a,b}/M*.html` after the
edits; `diff` reports all ten pairs identical. `mock/direction-a.html` and
`mock/direction-b.html` were reassembled from the parts (`bash mock/{a,b}/build.sh`).

## Screen re-render

`mock/a/shoot.mjs` and `mock/b/shoot.mjs` re-run from `apps/designer-portal` (Chromium
needs the sandbox off — the mach-port rendezvous is blocked otherwise). All ten screens
plus the two dark variants rewritten. B's own probes: no horizontal overflow on any
screen (`hoverflow []` on M1–M5), `SHADOWS []`.

Read back at 2× from the rendered pages:

- **A-M2 ladder** — `BUDGET $184,500 approved` / `PLAN $171,240 specified` /
  `AUTHORIZED $141,600 ordered` / `MOVED $141,600 in motion — ordered through installed
  (committed, not yet paid out)` / `OWED $17,500 out` / `NOT DRAWN $12,300 deposit`.
- **B-M2 and B-M3 ladders** — `BUDGET $184,500 approved` / `PLAN $171,240 specified` /
  `AUTHORIZED $141,600 ordered` / `MOVED  ordered through installed (committed, not yet
  paid out)  $141,600 in motion` / `OWED YOU  Invoice 2026-114 · 22 days  $17,500`.
  The four shared rungs read identically to A's.
- **A-M2 / A-M5 shelves** — `Mood boards / NO BOARDS YET`, `Call sheet / NOBODY ON IT YET`.
- **A-M2 / A-M3 instruments** — `CALL SHEET · 0`.
- **A-M3 ⌘K** — `Mood boards / THIS PROJECT · NO BOARDS YET`,
  `Call sheet / THIS PROJECT · NOBODY ON IT YET`.
- **A-M4 More sheet** — `Boards / NO BOARDS YET`, `Call sheet / NOBODY ON IT YET`.
- **B-M2 ticket** (for comparison) — `BOARDS No boards yet · start one`,
  `PEOPLE Nobody on it yet`.
- **A-M5 ladder** is the fold-truncated three-rung view; its three rungs match B's.

## Horizontal-scroll re-check (method of `61-deck-visualqa.md`)

`mock/deck-parts/qa-shell.html` regenerated from the rebuilt `presentation.html` (the
deliverable's fragment inside a minimal `<!doctype html>` wrapper), then
`document.documentElement.scrollWidth === window.innerWidth` measured in Chromium at both
viewports and both themes:

```
desktop 1440x900 light : scrollWidth 1440 / innerWidth 1440 -> PASS
desktop 1440x900 dark  : scrollWidth 1440 / innerWidth 1440 -> PASS
mobile   390x844 light : scrollWidth  390 / innerWidth  390 -> PASS
mobile   390x844 dark  : scrollWidth  390 / innerWidth  390 -> PASS
```

All four pass. VisualQA blocker B1 (405px against a 390px viewport, from
`.dk-refs span{white-space:nowrap}`) stays closed — the `@media` override that D4 added at
`00-head.html:313` is still in place and none of this pass's edits touched `.dk-refs`.
