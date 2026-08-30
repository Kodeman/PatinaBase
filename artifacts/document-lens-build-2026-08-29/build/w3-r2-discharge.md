# R2 — the band's line 2, discharged on seeded data (W3 integration, 2026-08-29)

**R2 (program-plan §Risks):** *band line-2 loss → R2 falsified in W3-L1 on
seeded data at 334px; R3 carried into I152 with its compensation (the sheet
lists every exception with its act).*

Measured on the merged wave (`document-lens/w3`, dev server from
`.codex/worktrees/agent-lens-w3-int` on :3000), signed in, at rest (scrollY 0),
on the long paper `/doc/b0000000-0000-0000-0000-0000000000d5`. Shots:
`w3-walk/r2-390.png`, `w3-walk/r2-1440.png` (band), plus
`w3-walk/r2-390-sheet.png`, `w3-walk/r2-1440-sheet.png` (the standing sheet).

## The measure — 327px, not 334px

| | 390 | 1440 |
|---|---|---|
| `[data-document-paper]` clientWidth | 390 | 1008 |
| its padding (computed) | 31.5px + 31.5px | 54px + 54px |
| **text run** | **327px** | **900px** |
| `[data-lens-line="2"]` clientWidth | 327 | 900 |
| `+7 MORE` door width + its `gap-2` | 52.38 + 9 = **61.38px** | same |
| **left for sentence + act** | **265.62px** | **838.62px** |
| `[data-lens-band]` height | **56px** | **56px** |

The brief's 334px is the proposal's figure; this build's paper prints a
**327px** run at 390. The 7px is the paper's own `px-[1.75rem]` at an 18px
root (31.5px a side), not a lens choice.

## What actually prints — R2 does not fire on this seed

Line 2 at rest on `…d5`, at BOTH widths, is identical:

```
$17,500 owed you                                    +7 MORE
```

| | value |
|---|---|
| `data-lens-line2-kind` | `standing` |
| sentence | `$17,500 owed you` |
| sentence characters | **16** |
| sentence width, band type (Inter 15px) | **127.38px** |
| act printed | **none** — the ranked-worst item carries no act |
| `+N MORE` | `+7 MORE` (8 standing items) |
| line `scrollWidth` vs `clientWidth` | 327 vs 327 at 390; 900 vs 900 at 1440 |
| **CSS ellipsis engaged?** | **no** (`scrollWidth === clientWidth`) |
| **`truncateLine` engaged?** | **no** — composed length 16 ≤ `LENS_LINE2_MAX_CHARS − doorChars` = 110 − 8 = 102 |

At 390 the printed line uses 127.38 of its 265.62px allowance: **138px of
slack**. R2 is discharged for the line the document actually prints.

## Where R2 still lives — the falsification is narrow, not general

The discharge holds because the item that RANKS worst on this seed is the
money exception, which is short and carries no act. The other seven standing
items were pulled out of the sheet and measured in the band's own type. Each
sentence alone, against the 265.62px the 390 line has after the door:

| rank | tier | sentence | chars | px | act | fits 390? |
|---|---|---|---|---|---|---|
| 1 | overdue | `$17,500 owed you` | 16 | **127.38** | — | ✅ yes, 138px spare |
| 2 | overdue | `Invoice INV-2026-114 · $17,500 overdue — oldest due Aug 22 — send a reminder` | 76 | **572.52** | `Send reminder` | ❌ over by 307px |
| 3 | overdue | `2 decisions overdue — oldest due Aug 23` | 39 | **295.94** | `Chase the approval` | ❌ over by 30px before the act |
| 4 | decision-due | `1 piece delivered — awaiting inspection` | 39 | **279.14** | `Inspect the delivery` | ❌ over by 14px before the act |
| 5 | damage | `FDL-0912 has an open damage claim` | 33 | **261.69** | `File the claim` | ❌ fits alone (4px spare), not with its act |
| 6 | po-silence | `PO-2026-0418 drafted — not yet sent` | 35 | **267.72** | `Send the purchase order` | ❌ over by 2px before the act |
| 7–8 | po-silence | `1 damaged`, `2 unspecified` | 9 / 12 | — | — | ✅ |

**Five of the eight seeded exceptions cannot print their sentence whole at 390
if they rank worst.** So R2 is real on this data; it simply is not exercised by
the current ranking. Recorded as a finding rather than as a pass.

**`truncateLine` would not save them either.** Its cap is `LENS_LINE2_MAX_CHARS
= 110` characters (minus the door), a figure calibrated for the 900px measure:
at 15px Inter, 900px holds roughly 120 characters but 265.62px holds roughly
**35**. Every row above is inside the 102-character budget, so the character
truncation ladder (`shortenAct` → drop the trailing qualifier) never fires, and
the only thing standing between a 76-character sentence and a 327px line is
`LINE_CLIP` (`overflow-hidden text-ellipsis whitespace-nowrap`,
`lens-band.tsx:37`). **The cap is width-blind.**

## What the design gets right, and what is owed

- **The act never truncates.** The act is `shrink-0` and the sentence is
  `min-w-0` + `LINE_CLIP`, so under pressure the SENTENCE ellipsizes and the
  act's words survive whole. That is the correct priority and it holds by
  construction, not by luck.
- **R3's compensation is live.** `+7 MORE` opens the standing sheet
  (`data-doc-sheet-kind="standing"`), which lists all **8** exceptions with
  their tier chips and their acts — including the five whose sentence could not
  print in the band. Verified at both widths (`r2-{390,1440}-sheet.png`).
- **Owed (ARCHITECT / DESIGN LEAD):** the character cap does not express the
  390 measure. Either give `LENS_LINE2_MAX_CHARS` a per-tier value (~35 at
  390 / ~120 at 1440, so the truncation ladder actually runs before CSS does),
  or rule that CSS ellipsis is the intended 390 behaviour and that the sheet is
  the whole answer there. Recorded here, not decided in this lane.
