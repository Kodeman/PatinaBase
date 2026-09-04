# Fix log — `proposal.html`

**Target:** `/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/proposal.html`
**Against:** `review/01-adversarial-review.md` (34 findings) plus the synthesis lead's rulings
**Date:** 2026-09-03

**Counts: 34 applied, 0 skipped outright.** Two findings (F-13, F-22) are applied in the modified form the rulings specify rather than as the reviewer wrote them; both are noted below.

Line numbers are **post-edit** unless marked "was".

---

## Findings

| id | verdict | what changed |
|---|---|---|
| **F-01** | applied (per ruling) | Mock eyebrow at **963** now reads `Your name is needed before the line continues` (was `A gate · the line stops until you sign`). New defect-ledger row **D21** at **690** citing `spine-gate.tsx:36-37` and `disc 02 §7`, severity Medium. Retirement folded into **proposal 4, "Quiet overdue"** — What-changes cell **1309** now names the eyebrow retirement and points at D21; its dependency line **1315** adds `spine-gate.tsx:36-37`. The vocabulary table's Gate row **774** cross-references the live violation. No new proposal number was created, so the master list stays at thirty (see F-21). |
| **F-02** | applied | `.line-mid` is no longer styled only under `.spine.closed`. CSS **457-462**: base rule paints the line at `height:0` with `transition:height 620ms ease-out`; `.spine.closed .line-mid{height:calc(100% - 150px)}` draws it. Inline `display:none` removed from the span at **958**. JS **2019 / 2026** add and remove the `closed` class on hold completion and on replay. Height is animated rather than `transform` so the draw is main-thread and provable; the page's existing reduced-motion block (`*{transition:none!important}`, **542**) makes it instant. Verified in a scripted run: `closed=true`, `line-mid height=130px`. |
| **F-03** | applied | `data-word` is now read. New ids `sealStamp` / `sealWord` / `sealSaid` / `sealAfter` at **893-897**; JS **1911-1934** defines the outcome table (stamp class, said-line, afterglow sentence for Approved / Returned / Held) and `chosenWord()` reads `data-word`, and **1986-1998** swaps all four on completion. Verified: choosing "Hold it for a conversation" stamps `s-held` / `Held · 3 September 2026`; choosing "Send it back for changes" stamps `s-returned single` / `Returned for changes`. Afterglow sentences are honest per outcome (nothing is ordered / nothing moves). |
| **F-04** | applied (per ruling) | New paragraph at **930** states plainly that the ceremony lane defined **ten** states (`ux 02 §5`), that this page adds an eleventh, `Reviewed`, from `ux 02 R-C9` and proposal 10, and that **RETURNED and HELD are renames**, with the contract names in parentheses (`changes_requested`, `needs_discussion`) and the database names unchanged. Stamp-cell notes at **934** and **935** carry the outcome name; the `Reviewed` cell **938** names it as the eleventh. Every "eleven" in the page (602, 929, 1463, 1646) now refers to the page's own count, which the new paragraph derives; no ten/eleven contradiction remains. |
| **F-05** | applied | **758** `Proposals 4 and 16` → `Proposals 4 and 17`. **759** `Proposal 23` → `Proposal 24`. |
| **F-06** | applied | **584** "two of the three answers leave no mark" → "one of the three answers leaves no mark", agreeing with D8 (**677**) and the moment-6 row (**658**): Approved and Held stamp today, changes requested leaves nothing. |
| **F-07** | applied | Proposal 5 dependency line **1327**: `NotificationsAPIClient.swift:65` and `:105` (the two `channel=in.(in_app,push)` sites), seam at `00534:93-103`, with the migration's own `:64-65` noted. Appendix **1826** corrected to `00534:93-103`. |
| **F-08** | applied | Proposal 20 dependency line **1507**: FF&E unblock corrected to `00464:745-753`. |
| **F-09** | applied | Proposal 3 dependency line **1303**: artifact citation block corrected to `:296-310`. |
| **F-10** | applied | Proposal 6 dependency line **1339**: `notify_client_attention` corrected to `00534:110-217`. |
| **F-11** | applied | **1351** `PushTokenService.swift:103-109` and `:112-115`. **1363** `DeepLinkHandler.swift:64-71`; `AppCoordinator.swift` `derivePhase` at `:259-271` and the drain at `:243-246`. **1591** `use-project-approvals.ts:13-26` recharacterised as "the `disposition` states typed in", not a derivation. **1627** the unsupported second range on `DecisionDetailView.swift` is kept as prose with "(line range unverified)". |
| **F-12** | applied | Three places reworded off "speaks it in prose": **656** and **862** now read "already joins the same three into one line and states the zero in words"; proposal 15's dependency line **1447** reads "already joins the three into one line at `project-approval-model.ts:87-115`". The argument survives; the overstatement does not. |
| **F-13** | applied in the modified form the ruling specifies | The page title, §4's name and the keepsake are **deliberately unchanged**. Instead the ruling itself is amended: intro **767** now says the *ask* has one name; the Decision row **773** allows the word in exactly two places — an option choice between named alternatives, and the record as a whole — and quotes the vision's own "the decision record is the relationship"; the Approval row **772** is restated as "the name of the ask, always"; the Gate row **774** points at the live violation. A closing note at **779** states that the title, §4 and proposal 26 use the second sense, and that no homeowner is ever asked to make "a decision" on an approval. Ruling, table and restatements now agree. |
| **F-14** | applied | **752** "Four refusals" → "Five refusals" (the table has five rows). |
| **F-15** | applied | Root cause was wider than the deck. `.deck li` uses `minmax(0,1fr)` and `.deck li > span{min-width:0;overflow-wrap:anywhere}` (**506-510**); separately `.cols`, `.panelrow`, `.ba` and `.spinewrap` were single implicit `auto` tracks whose min-content pushed their panels 34px past a 390 viewport, so all four now declare `minmax(0,1fr)` tracks (**219-220, 284-285, 496-497, 448-449**). Measured after: `documentElement.scrollWidth = 390`, `body.scrollWidth = 390`, zero elements right of the viewport. (Before: 404.) |
| **F-16** | applied | See **Contrast** below. `--faint` and `--muted` raised in all three token blocks (**20-21, 44-45, 65-66**). |
| **F-17** | applied | Dependencies moved out of the 9-column row and onto a per-proposal second line, which is the option the ruling permits; no column dropped. Header **1265** now carries eight columns with `w-eff` / `w-wave` / `w-lanes`; the table is `class="tight master"`; each proposal is a `<tr class="head">` followed by `<tr class="deps">` whose single cell spans the remaining seven columns under a mono `DEPENDENCIES` label. CSS **251-266** sets master-only min-widths and the borderless head / bordered deps pairing. Measured at 1440: table width **1038px**, wrapper width **1038px**, `overflowsWrap = false` — Effort, Wave and Lanes are fully on screen and nothing is cut. |
| **F-18** | applied | `.ref` keeps `white-space:nowrap` in prose but wraps inside tables: `td .ref,th .ref{white-space:normal;overflow-wrap:anywhere}` at **204**. The offending ref at **626** also shortened to `client_decisions · project_artifact_v1`. |
| **F-19** | applied | New `@media (max-width:600px)` block at **527-533**: `.w-name` drops to 9rem and `.w-what/.w-why/.w-dep` to 0. The master table is unaffected (its `.master .w-*` rules are more specific and it is meant to scroll). Verified at 390: the blacklist now sets 3-6 words a line instead of 2-3 over ten-plus lines. |
| **F-20** | applied | Letterhead at **793** is `Middle West Studio`, matching the masthead, the signatures and the household table. |
| **F-21** | applied | Called thirty throughout. **1259** "Thirty proposals"; the reconciliation note **1632** now reads "Thirty rows, thirty proposals. Number 9 began as the verified-fact item the journey lane could not resolve and is carried here as a proposal because it is real work." §9's ranges (1 through 12 / 13 through 23 / 24 through 30) were already correct and are unchanged. README left alone per the ruling. |
| **F-22** | applied, partially, by design | §2's table is cut to its "Today" column and retitled **"The seven moments, today"** (**647**), with one line saying what each becomes is §4 and is not restated. §5's `/decisions` row is deleted (it was proposal 24 reworded) and replaced by a one-line pointer at **1112**; the heading **1111** now names the two routes the table actually covers. **The `/decisions/[id]` row was kept** against the reviewer's suggestion: its "What stays" cell is the only place carrying the six-part anatomy, the verbatim immutability sentence, the optimistic-concurrency copy and the 44-pixel target, none of which appear in #24 or the §4 steps. The weighing / overdue / drawn-signature triplications were left in place as deliberate layering, which the reviewer allowed. |
| **F-23** | applied | Proposal 1's dependency line **1279** ends "**Lands with #3**, which resolves `portalBase()` per recipient audience against the same env"; proposal 3's **1303** ends "**Lands with #1**, which introduces the client URL env this row resolves against". |
| **F-24** | applied | `#choices` carries `role="radiogroup" aria-label="Your answer"` (**874**). JS **1879-1909** rewritten: roving tabindex (selected row is the only tab stop) and ArrowUp/Down/Left/Right cycling with focus moved to the newly checked row. Verified: `role=radiogroup` present after script run. |
| **F-25** | applied | The contents nav's heading is now `<p class="idxhead">Contents</p>` (**550**), so the document outline opens at the masthead `<h1>`. CSS selector renamed `.index h2` → `.index .idxhead` (**103**); rendering is unchanged. |
| **F-26** | applied | `--sage` and `--sage-ink` deleted from all three token blocks. Token sets are now 18 each and the two dark blocks remain identical. |
| **F-27** | applied | **981** "Reopen the gate" → "Replay the gate demo". |
| **F-28** | applied | **1019** heading is "Today, verbatim template · example values". The other two "Today, verbatim" panels quote real strings and are unchanged. |
| **F-29** | applied | D12's evidence cell **681** now cites both: `HouseRecord.state(for:now:)` returns the `.overdue` case; `HouseRecordCard.swift:410` paints it `PatinaColors.error`. |
| **F-30** | applied | The aging paragraph **945** places the eleventh state: "Terminal states age, `Reviewed` among them; Awaiting you, Returned and Held stay at full ink…" |
| **F-31** | applied | Effort is single letters throughout. #18 `M web, L iOS` → `L`, with "Effort splits M on web, L on iOS" moved into its dependency line (**1483**); #19 `M to L` → `L`, with "Effort is M if the seal is ported from #17, L if it is drawn twice" in its dependency line (**1495**). |
| **F-32** | applied | **1431** `ux 01 M3` → `ux 01 Moment 3`. |
| **F-33** | applied | `.spinewrap` gains `align-items:start` (**448**), so the spine panel no longer stretches to the height of the taller sibling — the ~700px of empty paper under it is gone. The residual whitespace *beside* the shorter panel in `.panelrow-2` is inherent to a two-column grid of unequal content and is left as is; `.panelrow` already had `align-items:start`. |
| **F-34** | applied | **1815** "Every line of client-facing copy quoted here was written by the copy lane against those two." |

---

## Contrast (F-16), computed

WCAG 2.x relative luminance, contrast against each of the three ground tokens. The binding case is the *darkest* light ground (`--paper-inset`) and the *lightest* dark ground (`--paper`).

**Light theme**

| token | value | vs `--ground` | vs `--paper` | vs `--paper-inset` |
|---|---|---|---|---|
| `--faint` was | `#9A938A` | 2.84 | 2.91 | **2.70** |
| `--faint` now | `#726A5F` | 4.98 | 5.11 | **4.73** |
| `--muted` was | `#7A736B` | 4.37 | 4.48 | **4.15** |
| `--muted` now | `#635C53` | 6.17 | 6.32 | **5.85** |
| `--body` (unchanged) | `#4A453F` | 8.88 | 9.10 | 8.42 |

**Dark theme** (both dark blocks, identical)

| token | value | vs `--ground` | vs `--paper` | vs `--paper-inset` |
|---|---|---|---|---|
| `--faint` was | `#7C7469` | 3.68 | **3.26** | 3.55 |
| `--faint` now | `#998F80` | 5.33 | **4.71** | 5.14 |
| `--muted` was | `#9A9186` | 5.47 | **4.84** | 5.27 |
| `--muted` now | `#ABA294` | 6.72 | **5.95** | 6.48 |
| `--body` (unchanged) | `#C9C1B6` | 9.52 | 8.43 | 9.18 |

Every use of `--faint` now clears AA 4.5:1 on every ground it is drawn on, in both themes. `--muted` was raised alongside it — the reviewer flagged it as borderline at 4.15-4.48, and leaving it would have inverted the hierarchy the moment `--faint` passed. The three-step ladder is preserved and still visibly separated: body ≈ 8.4-9.5, muted ≈ 5.9-6.7, faint ≈ 4.7-5.3.

---

## Re-run checks

| check | result |
|---|---|
| Tag balance (html.parser, void-aware) | **PASS** — 0 errors, 0 left open |
| Every `var(--x)` defined on bare `:root` | **PASS** — 0 undefined, 0 defined-and-unused |
| Both dark blocks redefine the identical token set | **PASS** — 18 tokens each, sets equal |
| No colour defined only inside a dark/media block | **PASS** |
| No `<!DOCTYPE>` / `<html>` / `<head>` / `<body>` | **PASS** |
| Every table inside `overflow-x:auto` | **PASS** — 15 tables, 15 `.tablewrap` |
| `box-shadow` | **PASS** — 0 |
| Horizontal overflow at 390 | **PASS** — `scrollWidth = 390`, 0 offending elements (was 393/404) |
| Horizontal overflow at 1440 | **PASS** — `scrollWidth = 1440`; master table 1038px inside a 1038px wrapper |

## Screenshots

Re-rendered once with the reviewer's harness (their skeleton wrapper, the 390px-iframe trick, `Google Chrome --headless=new`), in
`/private/tmp/claude-501/-Users-kody-Code-patina-merged/672b3ca2-639d-4e31-bac2-40d1fa81b2b0/scratchpad/review/`:

- `fixed-1440-light.png` (1440×4000)
- `fixed-1440-dark.png` (1440×4000)
- `fixed-390-light.png` (390×2600)
- `fixed-ceremony.png` (1440×2180 — stamp gallery, aging note, and the spine demo)

Harness note beyond the reviewer's two: composited `transform` transitions do not advance under `--virtual-time-budget`, which is why the spine draw is animated on `height` instead — it is provable in the harness and behaves identically in a real browser.

## Final size

**165,447 bytes** (was 155,200).
