# Review (a) — specimens, technical

Reviewer: adversarial reviewer (a), fresh context. Scope: `direction-1.html` (D ·
the galley), `direction-2.html` (A · the paper is the page), `direction-3.html`
(B · builder as overlay), all in
`/Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/specimens/`,
against `SPEC.md` §0, §1, §3, §7, §8, §9.

Chromium requires the sandbox disabled on this Mac (`Operation not permitted`
on first launch attempt); every render/Playwright call below ran with
`dangerouslyDisableSandbox: true`. The zsh shell used for the Bash tool does
not word-split unquoted variable expansions — `--state a=b --state c=d` passed
via a `$VAR` collapsed into one bad argument until rewritten as `${=VAR}`; the
initial renders that looked like plain 3-plate runs (no per-state filenames)
were a symptom of this and were discarded and rerun correctly. Also: the
sandboxed `$TMPDIR` and the non-sandboxed (`dangerouslyDisableSandbox`)
`$TMPDIR` are two different directories on this box — renders live under
`/var/folders/.../T/rev`, diffs/greps under the sandboxed `$TMPDIR/diff`.

---

## 1 · Render

All three files rendered clean: **81/81 captures succeeded, exit 0 on every
invocation, 0 console errors and 0 console warnings in every `console.json`,
`horizontalOverflow: false` at every width/state/theme combination** (1440,
1024, 390 × resting/clause/money × light/dark/reduced-motion = 9×3×3 = 81 = 27
plates/file).

```
=== direction-1 light ===
direction-1-resting-1440.png: errors=0 warnings=0 overflow=false
direction-1-clause-1440.png: errors=0 warnings=0 overflow=false
direction-1-money-1440.png: errors=0 warnings=0 overflow=false
direction-1-resting-1024.png: errors=0 warnings=0 overflow=false
direction-1-clause-1024.png: errors=0 warnings=0 overflow=false
direction-1-money-1024.png: errors=0 warnings=0 overflow=false
direction-1-resting-390.png: errors=0 warnings=0 overflow=false
direction-1-clause-390.png: errors=0 warnings=0 overflow=false
direction-1-money-390.png: errors=0 warnings=0 overflow=false
=== direction-1 dark ===        (same 9, all errors=0 warnings=0 overflow=false)
=== direction-1 rm ===          (same 9, all errors=0 warnings=0 overflow=false)
=== direction-2 light / dark / rm ===   (27/27, all errors=0 warnings=0 overflow=false)
=== direction-3 light / dark / rm ===   (27/27, all errors=0 warnings=0 overflow=false)
```

(Full 81-row dump omitted for length — identical pattern on every row: `errors=0
warnings=0 overflow=false`.)

**Done-criterion "render exit 0, 27 plates per file, console.json empty of
errors and warnings, no horizontal overflow at 390 in any state": PASS for all
three files.**

---

## 2 · Greps — SPEC §8, plus the extra greps requested

Run against each file individually; output shown per file, empty block = no
match (pass).

### `direction-1.html`
```
box-shadow|drop-shadow|--elevation-sheet   → 50:  --elevation-sheet: 0 1px 2px rgba(44, 41, 38, .08);   [token decl only — allowed]
disabled attr on button/input/a/select/textarea → (none)
contenteditable|text-overflow|line-clamp   → (none)
font-size sub-11px                         → (none)
opacity state                              → (none)
position sticky/fixed, zoom block          → (none)
aged-oak / #8B7355                         → 33:  --oak: #8B7355;   [token decl only — allowed]
https:// not fonts.g                       → (none)
<h1 count                                  → 1
<html lang="en">                           → present (line 2)
autofocus                                  → 805:  ...value="85.0" autofocus>   ⚠ SEE ST-001
' disabled[ >=]'                           → (none)
contenteditable (broad)                    → (none)
text-overflow|line-clamp (broad)           → (none)
font-size 0-10px (broad, 1?[0-9]|10)       → (none below 11)
img|script src|link                        → only the 3 permitted fonts.googleapis/gstatic <link> tags
```

### `direction-2.html`
```
box-shadow|drop-shadow|--elevation-sheet   → 50:  --elevation-sheet: ...   [token decl only]
disabled attr                              → (none)
contenteditable|text-overflow|line-clamp   → (none)
font-size sub-11px                         → (none)
opacity state                              → (none)
position sticky/fixed, zoom block          → (none)
aged-oak / #8B7355                         → 33:  --oak: #8B7355;   [token decl only]
https:// not fonts.g                       → (none)
<h1 count                                  → 1
<html lang="en">                           → present
autofocus                                  → (none)
' disabled[ >=]'                           → (none)
contenteditable (broad)                    → (none)
text-overflow|line-clamp (broad)           → (none)
font-size 0-10px (broad)                   → (none below 11)
img|script src|link                        → only the 3 permitted <link> tags
```

### `direction-3.html`
```
box-shadow|drop-shadow|--elevation-sheet   → 50:  --elevation-sheet: ...   [token decl only]
disabled attr                              → (none)
contenteditable|text-overflow|line-clamp   → (none)
font-size sub-11px                         → (none)
opacity state                              → (none)
position sticky/fixed, zoom block          → (none)
aged-oak / #8B7355                         → 33:  --oak: #8B7355;   [token decl only]
https:// not fonts.g                       → (none)
<h1 count                                  → 1
<html lang="en">                           → present
autofocus                                  → (none)
' disabled[ >=]'                           → (none)
contenteditable (broad)                    → (none)
text-overflow|line-clamp (broad)           → (none)
font-size 0-10px (broad)                   → (none below 11)
img|script src|link                        → only the 3 permitted <link> tags
```

Confirmed: `--elevation-sheet` and `#8B7355` hit **only** their `:root` token
declarations in all three files — the documented allowance, nothing more.

### §7 banned-word greps — all three files, all empty except the one allowed hit
```
grep -niE 'clause library|contract builder|wizard|dashboard|\bAI\b|badge|pill|toast|spinner|preview panel|R[0-9]+|W[0-9]R[0-9]'  → (none, all 3 files)
grep -niE '>[^<]*\b(chip|modal|builder|composer)\b'   → (none, all 3 files — "chip" only ever a class name)
grep -c 'Return to the seven facets'   → 1, 1, 1
grep -niE 'facet' | grep -v 'Return to the seven facets'   → (empty, all 3 files)
```
Also checked (not in the automated grep but named in §7 prose): `Patina`
inside the paper — 0 hits in all three (no colophon uses it either); `live` as
a standalone visible word — 0 hits (`aria-live` attribute only, plus one CSS
comment in direction-3 "the parts live in a drawer" — a comment, not rendered
text, not in scope of the ban).

**All greps: PASS except ST-001 (autofocus in direction-1).**

---

## 3 · Shared-block diff

Ran the exact script from SPEC §1 (paths adapted to the sandboxed `$TMPDIR`):

```
$ diff direction-1.shared.css direction-2.shared.css
1c1
< /* SHARED BLOCK — BEGIN */
---
> /* SHARED BLOCK — BEGIN … */

$ diff direction-1.shared.css direction-3.shared.css
1c1
< /* SHARED BLOCK — BEGIN */
---
> /* SHARED BLOCK — BEGIN … */

$ diff direction-2.shared.css direction-3.shared.css
(no output — identical)
```

**"Any output at all is a failure" — this run produces output. FAIL for
direction-1 vs. {direction-2, direction-3}.** See ST-002.

The failure is confined to the wrapper comment's own text (direction-1 opens
`/* SHARED BLOCK — BEGIN */`, direction-2/direction-3 open `/* SHARED BLOCK —
BEGIN … */`). To isolate substance from wrapper, I also diffed the 278 lines of
actual CSS (stripping both BEGIN/END lines) against each other and against
SPEC §1's own fenced block (lines 56–333 of `SPEC.md`):

```
direction-1 CSS body vs SPEC §1  → exit 0, no output (byte-identical)
direction-2 CSS body vs SPEC §1  → exit 0, no output (byte-identical)
direction-3 CSS body vs SPEC §1  → exit 0, no output (byte-identical)
```

So the actual tokens/rules are byte-for-byte identical across all three files
and match SPEC §1 exactly — the only divergence is the one-line wrapper
comment text on direction-1.

---

## 4 · The 20 a11y acceptance checks

Run via a Playwright harness loaded from the repo's own pnpm store
(`node_modules/.pnpm/playwright@1.58.2`), one context per file/state, plus the
existing greps above for the grep-only checks.

| # | Check | direction-1 | direction-2 | direction-3 |
|---|---|---|---|---|
| 1 | No native `disabled` | PASS (0 matches) | PASS (0) | PASS (0) |
| 2 | No `opacity:.5` state | PASS (grep §8, 0 matches all 3) | PASS | PASS |
| 3 | No shadow/truncation/spinner | PASS (0 matches all 3; `--elevation-sheet` unused) | PASS | PASS |
| 4 | One `h1`, headings in order | PASS — 1×H1, H2s/H3s in order, all 3 switcher states | PASS | PASS |
| 5 | Permanent status region at load | PASS — `#room-status[role=status][aria-live=polite]` present at load with full sentence, not conditionally rendered | PASS | PASS |
| 6 | Readiness speaks on state change | PASS — resting "…name a fee." → money "…name a ceiling." within ~1 frame (measured at 200ms poll) | PASS | PASS |
| 7 | `aria-disabled` acts focusable + described | PASS — both `#client/owner-act` and `#send-act` have `tabIndex=0` and `aria-describedby` resolving to non-empty visible text | PASS | PASS |
| 8 | Activating a held act doesn't fail silently | PASS — Enter on `#send-act` updates `#room-status` to the reason text AND moves focus into the unmet control (`#toggle-role-rates` in d1/d2, directly into `#rate-principal` in d3) | PASS | PASS |
| 9 | Held terminal contrast ≥4.5:1 | PASS — `--ink-faint` (rgb 101,89,78) on `--rail` (rgb 232,227,219) = **5.32:1** measured via computed style, all 3 (shared token, identical) | PASS | PASS |
| 10 | `--oak` never on `color` | PASS — both hits (`:root` decl) style nothing but the token itself; every consuming rule uses `border-color`/`background` | PASS | PASS |
| 11 | Every text/ground pair ≥ AA | PASS — see §5 contrast table below; all 15 SPEC-named pairs clear their threshold in both themes | PASS | PASS |
| 12 | No pinch-zoom block | PASS (grep, 0 matches all 3) | PASS | PASS |
| 13 | Reflow at 390 keeps every act | PASS — 390 act-name set is a superset-or-equal of 1440's (identical counts: 49/49, 38/38, 44/44); `.act--terminal` "Send the agreement · $5,000.00 retainer" (matches `/send/i`) present at both widths in all 3; no `scrollWidth` overflow at 390 in any state (§1 render pass) | PASS | PASS |
| 14 | Keyboard reorder works and speaks | PASS — pressed Move-up on "Billing cadence" twice via focus+Enter (re-locating the live button each time): part moved 8→7→6, `document.activeElement` stayed inside the Billing-cadence part/row after each move, `#room-status` announced "Billing cadence is now part 7 of 9." then "...part 6 of 9." | PASS | PASS |
| 15 | Reorder needs no pointer/drag | PASS — identical to #14 with `document.body.style.pointerEvents='none'` | PASS | PASS |
| 16 | No `contenteditable` | PASS (grep, 0 matches all 3; all edited fields are `<input>`/`<textarea>` with a `<label for>`) | PASS | PASS |
| 17 | No hover-only act | PASS (vacuously) — 0 `:hover` rules found touching `opacity`/`visibility`/`display` in any of the three stylesheets, so there is nothing that needs a `:focus-within` twin | PASS | PASS |
| 18 | Unfolding doesn't shift reading position | PASS — top of first `[id^="part-"]` element measured before/after resting→clause: Δ=0px in all 3 (49 the drawer in direction-3 is an overlay and doesn't reflow the printed page at all) | PASS | PASS |
| 19 | Focus never obscured | PASS by construction — 0 `position: sticky`/`fixed` anywhere in any file (confirmed by §2 grep), so nothing can intersect a focused element's rect at 390 or 1440 | PASS | PASS |
| 20 | Reduced motion + forced colors | (a) `prefers-reduced-motion` block present verbatim (shared block, confirmed identical in all 3) — PASS. (b) `forced-colors` block present (shared block; direction-3 also carries one file-specific extra block for its drawer, additive not conflicting) — PASS. (c) Rendered with `forcedColors:'active'`, switched to "clause" (part-services selected): the selected element renders `border-left: 2px solid rgb(0,0,0)` (CanvasText) — identifiable by a rule, not hue — PASS | PASS | PASS |

**20/20 on all three files.**

---

## 5 · Contrast pairs (SPEC §8's 15-pair list)

All token values are shared-block-identical across the three files, so one
table serves all three. WCAG 2.2, sRGB, computed from the shared `:root`
hex/rgba values (spot-checked against live computed styles for pairs 9 and 10
via Playwright — matched to 2dp).

| # | Pair | Light | Dark | Threshold | Verdict |
|---|---|---|---|---|---|
| 1 | prose `--ink-muted` on `--paper-doc` | 9.22:1 | 10.14:1 | 4.5:1 text | PASS |
| 2 | heading `--ink` on `--paper-doc` | 13.87:1 | 13.56:1 | 4.5:1 text | PASS |
| 3 | `.t-money` `--ink` on `--paper-doc` | 13.87:1 | 13.56:1 | 4.5:1 text | PASS |
| 4a | `.t-head` `--ink-subtle` on `--paper` | 7.54:1 | 8.18:1 | 4.5:1 text | PASS |
| 4b | `.t-head` `--ink-subtle` on `--rail` | 6.31:1 | 6.61:1 | 4.5:1 text | PASS |
| 5 | `.studio-note` body `--ink` on `--rail` | 11.32:1 | 10.41:1 | 4.5:1 text | PASS |
| 6 | leading rule `--clay-ink` on `--rail` | 4.70:1 | 6.48:1 | 3:1 non-text | PASS |
| 7 | `.act--tertiary` label `--ink-subtle` on `--paper` | 7.54:1 | 8.18:1 | 4.5:1 text | PASS |
| 8 | rest rule `--oak` on `--paper` | 4.20:1 | 5.33:1 | 3:1 non-text | PASS |
| 9 | `.act--terminal` label `--ink-paper` on `--ink` | 13.53:1 | 12.89:1 | 4.5:1 text | PASS |
| 10 | `.act--terminal[aria-disabled]` `--ink-faint` on `--rail` | 5.32:1 | 5.55:1 | 4.5:1 text | PASS |
| 11a | focus ring `--clay-ink` on `--paper` | 5.61:1 | 8.03:1 | 3:1 non-text | PASS |
| 11b | focus ring `--clay-ink` on `--paper-doc` | 5.75:1 | 8.44:1 | 3:1 non-text | PASS |
| 11c | focus ring `--clay-ink` on `--rail` | 4.70:1 | 6.48:1 | 3:1 non-text | PASS |
| 12a | field value `--ink-muted` on `--paper-doc` | 9.22:1 | 10.14:1 | 4.5:1 text | PASS |
| 12b | baseline rule `--ink-faint` on `--paper-doc` | 6.51:1 | 7.23:1 | 3:1 non-text | PASS |
| 13a | (III only) drawer edge `--ink-faint` on `--paper` | 6.35:1 | 6.87:1 | 3:1 non-text | PASS |
| 13b | (III only) drawer edge `--ink-faint` on `--rail` | 5.32:1 | 5.55:1 | 3:1 non-text | PASS |
| 14 | outline "needs attention" on its own ground | see per-direction below | | 4.5:1 text | PASS (all 3) |
| 15 | `.consequence` `--ink` on `--paper` | 13.53:1 | 12.89:1 | 4.5:1 text | PASS |

Pair 14 detail — each direction implements "needs attention" with a
**different token**, all of which clear 4.5:1 on their ground (`--paper`,
unstyled `.outline`/`.attn`/`.attention`/`.orow__flag` background):
- direction-1: `.attn { color: var(--ink-subtle) }` → 7.54:1 light / 8.18:1 dark
- direction-2: `.outline .attention { color: var(--terracotta-ink) }` → 5.28:1 light / 7.34:1 dark
- direction-3: `.orow__flag { color: var(--ink-subtle) }` → 7.54:1 light / 8.18:1 dark

**All 15 required pairs PASS in both themes for all three files.**

Informational (not on SPEC's required list, computed as a spot-check): the
`.field`/`.chip` box border (`--hairline-strong`) falls under 3:1 as a
*non-text* boundary — 1.29–1.94:1 across light/dark on `--paper`/`--paper-doc`/
`--rail`. This is not one of the 15 named pairs and SPEC's own §2 field spec
names the 1px `--ink-faint` baseline rule (which does clear 3:1, see pair 12b)
as "the one edge a reader can actually see," so I read this as intentionally
decorative rather than a required boundary. Flagged as ST-006 for visibility,
not as a gate failure.

---

## 6 · Size / structural checklist

| File | Size | ≤120KB | `<h1>`=1 | `lang="en"` | `message` listener | 3 switcher ids | last line |
|---|---|---|---|---|---|---|---|
| direction-1.html | 58,398 B | PASS | PASS | PASS | PASS (1) | PASS | `<!-- specimen-complete -->` |
| direction-2.html | 47,774 B | PASS | PASS | PASS | PASS (1) | PASS | `<!-- specimen-complete -->` |
| direction-3.html | 51,132 B | PASS | PASS | PASS | PASS (1) | PASS | `<!-- specimen-complete -->` |

---

## 7 · Visual review (PNGs)

Sampled 1440/390 across resting/clause/money in light for all three files,
plus one dark 1440 per file, plus a reproducibility re-render of the one
anomaly found. No clipped text, no overlapping elements, no empty regions, no
unlabeled controls, and no sub-11px type observed in any reviewed plate. Two
things worth flagging:

- **direction-1, dark, 1440, resting**: a faint, reproducible ghost of later
  page text (the `.consequence` paragraph "…and his signature preserves
  consent…") bleeds through near the top of the page, just under the
  meta-strip bar. Reproduced on two independent `render.mjs` invocations at
  the identical location/content. A DOM probe (every element whose
  `getBoundingClientRect().top` falls within -5..70px) found nothing at that
  position with `position:absolute/fixed`, a transform, negative margin, or
  reduced opacity that could paint it — the meta strip and its two children
  are the only things genuinely there. This looks like a Chromium
  full-page-screenshot stitching artifact rather than a DOM/CSS bug, but I
  could not fully rule out a page-code cause in the time available. See
  ST-004.
- **direction-3, money, 390** (and 1440): the Role-rates money editor sits at
  the very bottom of the drawer's editor block, five outline rows below its
  own "Role rates" row, with only "CREATES AUTHORITY" (no repeated "Role
  rates" heading) directly above the Principal/Designer/Assistant fields. A
  source comment confirms this is a deliberate specimen-scope shortcut (only
  two of nine rows got a real inline editor authored). See ST-005.

---

## 8 · Findings

| ID | Severity | Confidence | File | State/width | Claim | Evidence | Proposed fix |
|---|---|---|---|---|---|---|---|
| ST-001 | P1 | high | direction-1 | money, all widths | A literal `autofocus` attribute sits on `#rate-assistant`, which the program's own instructions call out as blocked inside the deck's `sandbox="allow-scripts"` iframe — caret placement must come from the state script's `el.focus()` alone | `direction-1.html:805` — `<input class="field-control" id="rate-assistant" ... value="85.0" autofocus></span>`; the file's own script (lines 1030-1061) already implements a correct `CARET` map that calls `f.focus()` + `setSelectionRange` on state change, making the attribute both redundant and non-compliant | Delete the `autofocus` attribute at line 805; the existing script-driven focus/caret mechanism already covers the money-state requirement without it |
| ST-002 | P1 | high | direction-1 | n/a (shared block) | The mandated shared-block diff is not clean: direction-1's opening wrapper reads `/* SHARED BLOCK — BEGIN */`, direction-2 and direction-3 read `/* SHARED BLOCK — BEGIN … */` — the SPEC-literal diff script prints a difference, which the gate defines as a failure ("Any output at all is a failure") | `diff direction-1.shared.css direction-2.shared.css` → `1c1 < /* SHARED BLOCK — BEGIN */ --- > /* SHARED BLOCK — BEGIN … */`; identical result vs direction-3; direction-2 vs direction-3 diff is clean; all 278 lines of actual CSS below the wrapper are byte-identical across all three and match SPEC §1 exactly | Change direction-1's opening comment to `/* SHARED BLOCK — BEGIN … */` to match the other two (or normalize all three to whichever the panel intends) so the diff — and the "SHARED BLOCK IDENTICAL" echo — actually passes |
| ST-003 | P2 | high | direction-2 | resting/clause (Terms part, Role-rates rest row) | direction-2's visible copy uses plain/straight apostrophes and a literal `…` where direction-1 and direction-3 use typographic `&rsquo;`/`&hellip;` entities for the identical strings — a "must look like one room" cross-specimen consistency break; note SPEC.md's own §5 copy table happens to use a straight apostrophe, so it's ambiguous which pair is "wrong," but the three specimens disagree with each other | `Not written yet. Your client's copy...` (d2:682, straight `'`) vs `...client&rsquo;s copy...` (d1:779, d3:837); Terms clause `fourteen days' notice...studio's work` (d2:769) vs `fourteen days&rsquo; notice...studio&rsquo;s work` (d1:955, d3:891); `Save as template…` literal ellipsis (d2:804) vs `Save as template&hellip;` (d1:668, d3:757) | Pick one typographic convention (curly quotes/entity ellipsis fit the Playfair Display "paper" aesthetic best) and apply it identically in all three files for every instance of string #23 and the Terms clause (§6.2 part 9) and "Save as template…" |
| ST-004 | P3 | low | direction-1 | resting, dark, 1440 | Reproducible ghost/bleed-through of later-page text near the top of the page in dark mode only; no DOM/CSS source element found at that position in two probes | Screenshots at `$TMPDIR/rev/direction-1-dark/direction-1-resting-1440-dark.png` and the independent re-render at `$TMPDIR/rev/recheck/direction-1-resting-1440-dark.png` (both show the artifact at the same spot/content); `getBoundingClientRect()` DOM sweep of the top 70px found only the meta-strip and its two direct children | Re-verify with a non-full-page or non-headless-shell capture to rule in/out a render-tool artifact before treating as a page bug; if it survives that, dig into font-loading/paint timing around the meta strip |
| ST-005 | P3 | medium | direction-3 | money, all widths (most visible at 390) | The Role-rates money editor is positioned after all nine outline rows in the drawer, separated from its own "Role rates" row by five other rows, with no repeated visible heading — tie-back is `aria-labelledby` only | `direction-3.html:723-747` (`.drawer__editor` block after `</ul>` at line 719); code comment at 721-722 confirms this is a specimen-scope shortcut ("Two editors are authored... in the product each opens its own part's editor"); screenshot `direction-3-money-390.png` shows "CREATES AUTHORITY" with no adjacent "Role rates" text | Acceptable as a documented specimen limitation; flag to the panel since the shipped per-row-accordion behavior won't have this gap — no change required to pass the gate |
| ST-006 | P3 | low | all three | n/a | `.field`/`.chip` box borders (`--hairline-strong`) fall under 3:1 non-text contrast on `--paper`/`--paper-doc`/`--rail` in both themes; not one of SPEC's 15 required pairs | Computed: light 1.29–1.30:1, dark 1.88–1.94:1 on the three grounds | No action required against the stated gate — informational only, since the 1px `--ink-faint` baseline rule (pair 12b, PASS) is the edge §2 explicitly designates as legible |

---

## 9 · Verdict

- **direction-1.html — FIX.** P1s: ST-001 (autofocus), ST-002 (shared-block
  diff not clean). Failed gate lines: the §8 "Greps — every one returns
  nothing" line (extra `autofocus` grep, per program instructions) and the §8
  "shared-block diff prints `SHARED BLOCK IDENTICAL`" Done-criterion. All other
  gate lines pass (render, 20/20 a11y, contrast, size, §7 words).
- **direction-2.html — FIX.** No P1s attach to this file directly (ST-002 is a
  direction-1 defect; ST-003 is scoped to direction-2 but at P2, not gating).
  Formally, though, the shared-block Done-criterion ("SHARED BLOCK IDENTICAL")
  is a three-way requirement and currently fails because of direction-1 — once
  ST-002 is fixed this file needs no further change to pass. P2: ST-003
  (straight-quote/ellipsis inconsistency vs. the other two).
  All other gate lines pass.
- **direction-3.html — FIX (same reason as direction-2).** No P1s of its own.
  Same shared-block dependency on ST-002 being fixed elsewhere. P3s only
  (ST-005 drawer-editor distance, informational ST-006). All other gate lines
  pass — render, 20/20 a11y, contrast, size, §7 words, greps (including its
  own extra `forced-colors` block, confirmed additive/legitimate).

**P1 count: 2** (ST-001, ST-002 — both on direction-1). **P2 count: 1**
(ST-003, direction-2). **P3 count: 3** (ST-004, ST-005, ST-006).
