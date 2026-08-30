# W4 design review — density, in one direction · DESIGN LEAD · 2026-08-30

Reviewed `document-lens/integration` @ `eee60fcb0` (= `document-lens/w4` @ `5beeb0568`), code in `.codex/worktrees/agent-lens-w4-int`, the production standalone build on :3000 (pid 80025). Used the walker's `w4-walk.md` + `w4-walk/` (25 shots, `w4-measurements.json`) and one probe of my own (`scratchpad/w4-dl-probe.mjs`, fresh context, `localStorage` cleared, `…d5` at 1440×900 and 390×844: `data-density` per root sampled at 0/150/400/1000/2500/5000 ms after navigation, `data-lens-state`, the six heads, the foot, `window.find`, the 390 bar). Reviews only; no code, no git.

## Verdict — **ship-after-fixes**

Fix list (W6 integration lane unless stated):
1. **DEFECT · high · first-paint promotion from a skeleton-short paper (L-4 defeated for four of six stops on every cold load).** See §1. Acceptance on a fresh load of `…d5`: at 1440/s0 `data-density="full"` on `approvals` (top 326) and `schedule` (top 964 ≤ 1140) **only**; `ffe` (1910), `money` (7715), `care` (8817), `record` (9033) `quiet`; at 390/s0 `approvals` (546) only, `schedule` (1392 > 1084) quiet. Mechanism is the ARCHITECT's (D-B15's layout-effect pass and every `discover()` promotion must measure against a paper whose bodies have resolved — defer the initial commit until the region's loading register is gone / the paper's height is settled, or discover only roots whose own body has data). `lens-density.spec.ts` gains the cold-load case (fresh context, no storage, sampled at settle) so the walker's "default full per business logic" reading cannot recur — there is no business-logic default; `use-region-fold.ts:178-184` is `positionDensity ?? 'quiet'`.
2. **DEFECT · low · 390 mobile bar is 93px tall against a 72px paper inset.** See §7. The bar's box measured 93px (three-line left zone + acts); `scroll-padding-bottom` / the shell's bottom inset is `max(72px, 60px + safe-area)` → 72 on a phone with no inset, so the last ~21px of the paper (and a landed head's focus target at the foot) can sit under the bar. Fix: the inset reads the bar's own height (`--doc-mobile-bar-height` set from the bar, min 72), or the bar's three lines fit 72 (overline 11px + household 14px + `AT <STOP>` 11px ≈ 52 + padding). Print is unchanged either way.
3. **NOTE · W5-R3's inline loading pulse is not on this build** (`SectionLoadingLine` block form still under FF&E's head, `Checking readiness`) — expected; it lands with W5-L2. Not a W4 finding.

Signed here (deviations countersigned, no fix): D-B33, D-B34 (with D-B37/D-B38 closing the chrome causes), D-B36 + the rail composer (§5), the 0.05px line-2 difference (§8), the `MutationObserver` on `document.body` (walker's #2 — a mechanism, the ARCHITECT's; what prints is unaffected).

## §1 — The six stops at s0 (W4-R1, D-B15, D-B16) — **differs · defect**

Fresh-context timeline on `…d5` at 1440×900 (`data-density` / `top` / `height` per root):

| t after nav | approvals | schedule | ffe | money | care | record |
|---|---|---|---|---|---|---|
| 0 / 150 / 400 ms | no roots mounted yet | | | | | |
| 1000 ms | full · 326 · 340 | full · 850 · **89** | full · 963 · **282** | full · 1269 · 1059 | **quiet** · 2352 · 102 | full · 2568 · 68 |
| 2500 ms (settled) | full · 326 · 347 | full · 964 · 923 | full · 1910 · 5780 | full · **7715** · 1079 | quiet · 8817 · 102 | full · **9033** · 68 |

The cause is legible in the numbers: the five roots that arrive in the first commit mount into a paper whose bodies are still loading (schedule 89px, FF&E 282px), so at that instant `money` sits ~1269px from the top and `record` ~2568 — and at the moment of mount, before even those skeletons grew, inside the 900 + 240 lookahead. D-B15's layout-effect pass promotes them; one direction means they never return. `care`'s root mounts later (its query resolves after the others) into a paper already 8,800px tall, so it alone is quiet — which is why the walker saw "only care". `record` is full at 9,033px below the frame on every cold load, which is the exact case L-4 exists for. Same shape at 390 (`money` full at 9226, `record` at 11055). This is a **defect**, not seed coverage: W4-R1's five other quiet forms are unexercised because the observer promotes them before the paper has a height. D-B16's invariant holds at settle only because promotion never reverses — the walker's "0 violations at s0/s2/s3/foot" measures the settled state, not the load.

The one quiet head (`care`) prints W4-R1 verbatim: `Closing the book` · `0 of 6 closed out` · sr-only `0 of 6 closed out · not yet on the paper · press Closing the book on the index to open` · one leader `Close the book` · rule `--rule-strong` (walker §2; my probe shows one visible act in that head, five in `Pieces`'s full head) — **seen**.

## §2 — The quiet form's print vs the mockup's condensed head — **seen, one ruled delta**

Head 24px Playfair, the status line in the head's own register (the walker's §2 strings), one leader, the rest hidden; the reserve (`min-block-size: var(--doc-quiet-reserve, 68px)`) measured 102px on `care` at 1440 (head + status + leader; inside the 68/112 OD-12 band). Rule weight strong at both densities (walker §10 shows the folded step to mid only under an explicit fold). **Ruled delta, already on record:** the mockup's condensed head prints its `.rh-quiet` line visibly (`NOT YET ON THE PAPER · PRESS … ON THE INDEX TO OPEN`, muted mono); the reconciliation's print contract (§"Quiet regions") and W4-R1 make it **sr-only** — an instruction, not a fact (SP-12) — and that ruling stands. Spacing: the quiet head sits at the region-gap token like a full head (24px, walker §11 / W3 fix B7) — seen.

## §3 — L-4 / L-5 and D-B33 (`content-visibility: auto` deleted) — **seen, signed**

At the foot of `…d5` every root carries `data-passed` and prints `full` with its real height (approvals 347, schedule 923, FF&E 5780, money 1079, care 846); `window.find('Client approvals')` returns true. With `content-visibility` gone, a passed region is an ordinary painted subtree — what the reader sees at the foot is exactly what she saw passing it, find-in-page reaches all of it, and nothing above her moves (the CLS the property caused is the reason it went). **D-B33 countersigned.** The proposal's render-cost claim for passed regions (§9 Wave 4 "value alone") is not delivered by this build and I152 must say so; the reader-facing promise (L-5: "everything she has passed is reachable") is kept. `data-passed` keeps being written — fine, it costs nothing and W6 may find a consumer.

## §4 — D-B34 chrome CLS, D-B37 / D-B38 — **seen, signed**

Walker §11: 0 unexplained ladder-segment resizes across the 30-step scroll (yielded value lines go invisible in place — D-B37); §12: band line 2 at one offset at rest and pinned at 1280 and 390, 0.05px apart at 1440 (D-B38). Paper CLS 0.000986 with all eight remaining entries in the rail/band chrome, now closed by D-B37/38. **D-B34 countersigned**: "CLS 0" is the paper's gate; the chrome's is measured and printed beside it.

## §5 — `data-lens-state` and the editing freeze — **seen, ruled**

`rest` at s0 · `reading` after a scroll · `editing` with a paper field focused · `mobile` at 390 (walker §7; my probe: `rest`/`true` at 1440, `mobile` at 390, `data-lens-settled="true"`). "open" is not a state; it is the band's `data-lens-open`, inverted in name — the walker's #6, no change. **Ruling on the rail's note composer (walker #4) and D-B36's sheet fields:** the freeze follows the hand **on the paper** and that is the right boundary. A promotion only ever mounts a body below the frame's bottom + 240px, so nothing in frame moves while she types — in the rail beside the paper or in a sheet over it; `editing` exists to stop a promotion *behind* a field that is itself on the paper from changing what surrounds her caret. The rail composer and `DocSheet` fields are **intended not to enter `editing`**; D-B36 is countersigned as a recorded boundary, not a nit to fix.

## §6 — Reduced motion — **seen**

0 running animations after 1s at s0/s2 under `reduce`; visible-word sets identical (531/531 at s0, 535/535 at s2) once the walker re-margined its read (walker §9, #9). The one ambient move (`doc-breath`) resolves to 0 duration under reduce.

## §7 — 390 — **seen, one defect**

The bar prints its three lines in the left zone (`IN THIS DOCUMENT` · `Client User` · `AT CLIENT APPROVALS`), the primary act (`MESSAGE CLIENT USER`) and `MORE` (my probe); the sections door is in `MORE`'s group with its `Open sections, at <stop>` name (walker §13). Density map at 390 mirrors §1's defect (`schedule` full at 1392 > 1084). **Bar height 93px vs the 72px inset** — fix list item 2.

## §8 — D-B38's 0.05px at 1440 — **accepted**

26.14 vs 26.19px is sub-pixel rasterisation (the band is `flex-col justify-center` in a 56px box with a 15.4px min-height line 1); the reader cannot see 0.05px and no text moves. The spec asserts `|Δ| ≤ 0.5px` (`toBeCloseTo`), not `toBe`.

## Acceptance bullets — proposal §9 Wave 4

| # | Bullet | 1440 | 1280 | 390 | verdict |
|---|---|---|---|---|---|
| 1 | position voice: 4th, lowest, `quiet→full` only, never folded, never storage | seen (walker §1/§4; `use-region-fold.ts:178-184`) | seen | seen | seen |
| 2 | `use-lens-density.ts`: one IO per root, one threshold 240 below, L-9 settle, `__lensSettled()` | seen — first flip 237px into the lookahead; settle resolves | seen | seen | seen; observer on `document.body` = ARCHITECT's mechanism (W4-C6), signed |
| 3 | `globals.css`: quiet rules · `[data-passed]{content-visibility:auto}` · reduce block after :283 | quiet reserve seen; **content-visibility deleted (D-B33, signed)**; reduce block seen | — | — | ruled |
| 4 | six bodies render quiet: head, count line, leader, reserve | **differs — only `care` ever renders quiet on a cold load (§1)** | same | same | **defect #1** |
| 5 | find-in-page gate | seen at foot (no hidden subtree exists to fail it) | — | — | seen; premise retired with D-B33 |
| 6 | `lens-density.spec.ts` region-top invariant, `scrollHeight` grows below only | seen at settle | — | seen | seen; add the cold-load case (#1) |
| 7 | rollback line ("`doc-lens` off") | void — no flag (R127 ruling 3) | | | ruled at W0 |
| 8 | value: F39, F53, F64, render cost | F39/F64 seen; **render-cost half not delivered** (D-B33) — I152 states it | | | ruled |

## Mechanics L-3 · L-4 · L-5 · L-9 · L-10

| L | 1440 s0/s2/s3 | 1280 | 390 | verdict |
|---|---|---|---|---|
| L-3 segment yields to its own head in frame | seen; box kept (D-B37) | seen | n/a (no rail) | seen |
| L-4 regions open 240px ahead, one direction | first flip at 237px, never reverses (walker §3/§4) — **but four stops are open before she arrives (§1)** | same | same | **defect #1** |
| L-5 passed regions stay reachable | seen (§3) | seen | seen | seen |
| L-9 settle gate | seen (`data-lens-settled`, 120ms after the last movement; walker #7 explains the 571ms wall clock) | seen | seen | seen |
| L-10 ladder press lands the head at 72 | 71.55px in both motion registers (walker §5, #8 methodology) | seen | n/a | seen |

## Carried into W5/W6 acceptance
- §1's acceptance line (the six densities at s0 on a cold load, both widths) in `lens-density.spec.ts`.
- 390 bar height ≤ the paper's bottom inset, or the inset reads the bar.
- W5-R3's inline pulse present under FF&E's head on the W5 build; `CLOSED BY YOU` still printed (walker §10); 14 labels (walker §11).

## fix-3 countersign · `document-lens/w4-fix3` @ `a364817e3` · DESIGN LEAD · 2026-08-30 — **SIGNED**

Own server `next dev --webpack -p 3023` from `.codex/worktrees/agent-lens-w4-fix3` (inline local env; killed after); one authenticated warm pass of `…d5`; then FRESH contexts (storage cleared, no scroll), sampled at `data-lens-resolved="true"` ∧ `data-lens-settled="true"` ∧ network idle (`scratchpad/w4-fix3-probe.mjs`, `-probe2.mjs`).

| item | 1440×900 | 390×844 | verdict |
|---|---|---|---|
| density map at s0 (D-B46) | `approvals` full (top 326) · `schedule` full (964) · **`ffe` quiet (1910) · `money` quiet (2046) · `care` quiet (2140) · `record` quiet (2356)** | `approvals` full (389) · **`schedule` quiet (1234) · `ffe` quiet (1365) · `money` quiet (1514) · `care` quiet (1661) · `record` quiet (2081)** | **seen — the acceptance exactly** |
| first quiet root vs the lookahead line | `ffe` top 1910 > 900 + 240 = 1140 | `schedule` top 1234 > 844 + 240 = 1084 | seen |
| what the first screen prints before resolution | at ~2.5 s the six heads stand quiet with their loading registers (`role=status` ×3, `aria-busy` ×4, the inline pulse) — not blank; resolution at ~3.1 s, then the cascade | same at ~2.6 s; resolution at ~2.8 s | seen · one low note: at 1440 the `record` root printed `full` for ~500 ms before resolution, then `quiet` (out of frame, 2,300 px down) — D-B46 should hold every `data-density` write until resolve so the attribute never moves twice; ARCHITECT's, not gating |
| the bar (D-B47) | — | bar **93.39 px**; `--doc-mobile-bar-height` = `93px`; `html` computed `scroll-padding-bottom` = **`93px`** (= max(72, bar)) | seen |
| last root clears the bar at max scroll | — | after three settled flings all six full; `record`'s bottom at −81 vs bar top 751 — the paper's own foot padding is what sits under the bar; the last root clears it | seen (my first read scrolled before the promoted paper grew — probe artefact, corrected) |
| Margin sheet `BESIDE PIECES` row press | — | `→ Margin · 7` → `The margin` / `2 OVERDUE` / `THE WHOLE JOB · 4` / `BESIDE PIECES · 3`; pressing `Living room — fabric for the reading chair` promotes FF&E (all six full after) and lands `Reading Chair — COM Fabric Pending` at **top 119 px** (in frame, under the band), then the `Margin item` sheet opens (W5-C2's act-vs-body point stays with the W5 fix lane) | seen |
| reduce | 0 running animations | 0 running; the pulse's `animation-name: none` | seen |

Note for W6 (not a fix-3 item): six `[data-index-region]` elements stand **outside** the paper — the ladder's own rows — so any probe or spec reading `document.querySelector('[data-index-region="…"]')` hits the rail first (W3 correctness C-24); scope every read to `[data-document-paper]`.

Both W4 defects are closed: the first-paint promotion (D-B46) and the bar inset (D-B47). **SIGNED.**
