# Re-review (a) — specimens, technical

Reviewer: adversarial reviewer (a), technical gate only. Re-ran the full §8
gate on the CURRENT files (post `02-fix-log-direction-{1,2,3}.md`) — render in
all three modes, every grep, the shared-block diff, the 20 a11y checks,
contrast, size, last line — and cross-checked every ST- finding from
`01a-specimens-technical.md` against the fix logs' own claims. Chromium ran
with `dangerouslyDisableSandbox: true` throughout (required on this box).

Current sizes: direction-1.html 64,349 B · direction-2.html 55,685 B ·
direction-3.html 53,536 B — all ≤120 KB, last line `<!-- specimen-complete
-->` on all three.

---

## 1 · Render, greps, shared-block diff (re-run, current files)

**Render** — 81/81 captures, exit 0 on every run (light / `--dark` /
`--reduced-motion` × 3 files), `console.json`: **0 errors, 0 warnings** on
every plate, **`horizontalOverflow: false` on every plate** at 1440/1024/390.

**§8 greps** — all empty except the two documented token-declaration
allowances (`--elevation-sheet`, `#8B7355`) in all three files: no native
`disabled`, no `contenteditable`/`text-overflow`/`line-clamp`, no sub-11px
`font-size`, no state-carrying `opacity`, no `position: sticky|fixed`, no
non-fonts external URL, no `autofocus` as a real attribute (direction-2's one
hit is inside a code comment), `<h1>`=1 and `<html lang="en">` on all three.
§7 banned-word greps: empty on all three, `Return to the seven facets` = 1 on
each. *Caveat:* the exact §7 script (`grep -v 'Return to the seven facets'`)
produces one line of output on direction-2 only — line 897, the pinned
consequence sentence (SPEC §5 string #36), which contains "facets"/"facet"
three times **by SPEC's own required copy**. On direction-1/direction-3 the
same sentence sits on the same physical line as the `Return to the seven
facets` button, so the exclusion filter happens to swallow it there; on
direction-2 the button is on its own line, so it survives the filter. This is
a pre-existing self-contradiction in SPEC §5/§7 (string #36 requires "facet"
3×, §7's grep assumes it appears once), not a per-file defect — identical
required text is present, byte-identical, in all three files. Not scored as a
new finding.

**Shared-block diff** — `diff` of the extracted block: direction-1 vs
direction-2 → no output; direction-1 vs direction-3 → no output; direction-2
vs direction-3 → no output. **`SHARED BLOCK IDENTICAL` now prints.** Also
re-diffed each file's 278-line body against SPEC §1's own fenced block: clean
on all three.

---

## 2 · Round-1 (`01a`) findings — disposition

| ID | Original claim | Fix log says | Re-verified | Status |
|---|---|---|---|---|
| ST-001 | `autofocus` on `#rate-assistant` (direction-1) | Attribute deleted; caret placed only by `CARET` map's `focus()`+`setSelectionRange()` | `grep -n autofocus` → 0 real-attribute hits in any of the three files (direction-2's one hit is a code comment) | **CLOSED** |
| ST-002 | Shared-block wrapper text differed (direction-1 vs 2/3) | direction-1's opener changed to `/* SHARED BLOCK — BEGIN … */` | `diff` of all three pairs → no output; `SHARED BLOCK IDENTICAL` | **CLOSED** |
| ST-003 | direction-2 used straight quotes/literal ellipsis where 1/3 used entities | No change needed in d1/d3 (already correct); d2's rest row, Terms clause and "Save as template…" now use `&rsquo;`/`&hellip;` | Grepped all four locations (rest row, Terms `days'`/`studio's`, "Save as template") in all three files — all now `&rsquo;`/`&hellip;`, byte-identical wording across files | **CLOSED** |
| ST-004 | Reproducible ghost/bleed-through, direction-1, dark, resting, 1440 | "Not reproduced… closed as the render-tool artifact the reviewer suspected" | Re-rendered direction-1 dark/resting/1440 independently — clean, no ghosting at the top of the page | **CLOSED** |
| ST-005 | direction-3's Role-rates drawer editor sat 5 rows from its own outline row with no repeated heading | Each authored editor (`#fold-services`, `#fold-role-rates`) now carries a `.t-head.editor__name` line ("Services" / "Role rates") above its fields | `grep -n editor__name` → the label exists above both editors; contrast `--ink-subtle` on `--rail` = 6.31:1 light / 6.61:1 dark, PASS | **CLOSED** |
| ST-006 | `.field`/`.chip` box borders (`--hairline-strong`) < 3:1, all three, informational | **Declined** by both direction-1 and direction-2 logs: not one of SPEC's 15 required pairs; the 1px `--ink-faint` baseline rule is the edge §2 designates as legible | Token values unchanged (shared block byte-identical); recomputed — still 1.29–1.94:1, still not a required pair | **DECLINED-ACCEPTED** — same reasoning I gave originally; nothing to add |

All six of my round-1 findings are closed or an accepted decline. (`ST-003`
was scoped only to direction-2; direction-1/direction-3 never carried it.)

---

## 3 · New findings from this re-run (ST-1xx)

The restructuring was large (segmented sheets/margin strips in direction-1,
`sheet-seg`/studio-strip relocation in direction-2, drawer/status relocation
in direction-3) and re-running the full 20-check suite surfaced two real,
independently-measured regressions that the fix logs themselves partly
acknowledge but understate or accept as a cost:

| ID | Severity | Confidence | File | State/width | Claim | Evidence | Fix-log cross-reference |
|---|---|---|---|---|---|---|---|
| ST-101 | P1 | high | direction-3 | clause & money, 390 | §8 check 13 fails: the `/review\|send/i` act (`Send the agreement · $5,000.00 retainer`) is not rendered at 390 in clause/money — its ancestor `.paper-col` computes `display: none` while the drawer covers the sheet, so `#send-act`'s own box is 0×0 and it drops out of the accessible/visible act set | Playwright probe correcting for ancestor visibility (`offsetParent`/rect size, not just the element's own `display`): `reviewOrSendPresent=false` at 390/clause and 390/money (true everywhere else, true for direction-1 and direction-2 in all 9 state×width combinations); direct DOM walk shows `#send-act`'s parent chain: `.paper-col { display: none }` at this state/width | Self-disclosed and **declined** as **SD-20** ("B's honest 390 cost… §8 check 13's send-act condition does not hold for this direction"), attributed to "ruling 2." I confirm the measurement is accurate — this is a real, literal failure of a named 20-point check, not a false alarm. Whether the trade-off is acceptable is an orchestration-level call I wasn't party to; flagging as **STILL OPEN against the letter of the gate** rather than silently accepting it, since it changes direction-3's 20/20 status |
| ST-102 | P1 | high | direction-3 | resting→money (all widths) and resting→clause (390) | §8 check 18 fails by a wide margin: the part above the target shifts by **-220.8px (1440), -115.2px (1024), -947px (390)** (heading "Exclusions", directly above Role rates, resting→money), and the page's own `h1` shifts **+452.5px** at 390 on resting→clause. All measured in document-absolute coordinates (`rect.top + scrollY`), i.e. genuine layout reflow, not scroll | Playwright probe, 3 widths, both transitions, document-absolute top before/after each state click; reproduced twice | Self-disclosed and **declined** as **SD-28** ("the paper's parts shift 34–54px when the drawer opens… §8 check 18 still passes as SPEC scopes it"). **I do not accept the "still passes" conclusion**: my measured shift is 2–20× larger than the fix log's own figure and directly contradicts a Δ=0px requirement at every width tested (only 1440/clause and 1024/clause read Δ=0). This is reported as a new, independently-confirmed finding rather than a re-litigation of SD-28, since it's a direct technical-gate result |
| ST-103 | P3 | medium | direction-2 | resting→money, 390 only | §8 check 18 shows a small, previously-unflagged shift: "Exclusions" moves **+42.8px** (document-absolute) at 390 when entering money state; Δ=0 at 1440 and 1024, and Δ=0 for resting→clause at all three widths | Same probe methodology as ST-102, direction-2 | Not mentioned in `02-fix-log-direction-2.md`. Not visible as a defect in the rendered `direction-2-money-390.png` (no clipping/overlap) — purely a measured layout delta, below any threshold a reader would notice |

No other regressions found: checks 1, 4–12, 14–17, 19, 20 all re-verified
clean on the current files (keyboard reorder still moves the part twice with
focus retained and the room-status announcing each move, once the new
selection-gated `.part__acts` visibility in direction-2 is accounted for in
the test itself; held acts still focusable/described/speak on Enter; forced-
colors still marks the selected part with a 2px rule; no hover-only acts; no
`position: sticky/fixed` anywhere so check 19 holds by construction). All 15
required contrast pairs remain PASS in light and dark (token values are
byte-identical to round 1, confirmed via the shared-block diff).

---

## 4 · Verdict per file

- **direction-1.html — PASS.** All six ST- findings closed, no new findings.
  Render, greps, shared-block diff, size, last line, and all 20 a11y checks
  (including 13, 14/15, 18) clean at every width/state/theme tested.
- **direction-2.html — FIX (minor).** ST-003/ST-001/ST-002 closed, ST-006
  accepted-decline. **New: ST-103 (P3)** — a 42.8px, single-width/state,
  visually-imperceptible check-18 delta. No P1/P2 open. Everything else in
  the gate passes cleanly.
- **direction-3.html — FIX.** ST-005 closed, ST-001/002/003 never applied
  here, ST-006 accepted-decline. **New: ST-101 (P1) and ST-102 (P1)** — a real
  check-13 failure at 390/clause/money (send act unrendered behind the
  drawer) and a real, multi-width check-18 failure (up to -947px) that
  substantially exceeds the fix log's own declined-finding estimate. Both are
  self-disclosed, ruled-on trade-offs at the design level, not hidden bugs —
  but neither clears the literal 20/20 bar the gate requires.
