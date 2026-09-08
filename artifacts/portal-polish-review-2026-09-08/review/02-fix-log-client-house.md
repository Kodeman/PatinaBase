# 02 — Fix log: `specimens/client-house.html`

Fix pass against `01a-specimens-technical.md` and `01b-specimens-design.md`,
plus the coordinator's sheet amendments A–P. Every "must not be changed" item
in 01b was left intact: the tier CSS block is unedited (label typography is
added as a following override, per PR-04's own instruction), the resting rule
stays unconditional, `aria-disabled` + visible reason + `aria-describedby` +
focus-moves-and-announces is intact, the empty-room pattern is untouched, the
record block keeps A9's fixed order (and now gains the typed signature), the
stamp is unchanged, and the letterhead/colophon pair still carries "Prepared
for Nora Ellison" with no wordmark.

## Sheet amendments applied

| Letter | Applied as |
|---|---|
| **A** | Every meaning-carrying stroke is `var(--ink-faint)` at 1px (`.dw-stroke`, `.dw-piece`, `.dw-faint`, `.dw-dash`); new `.dw-hatch` at `stroke-opacity:.5` for the wall hatching and the secondary marks. `--rail` no longer strokes anything; it survives only as a ground. |
| **B** | `.t-money` → DM Mono 15px/1.5, tabular, `.02em`. One announced figure at `.t-d2` (the owed `$4,060.00`); every other figure — piece prices, trade scope, the reconciling sentence's three figures — is `.t-money`. |
| **C** | `.act--terminal .label` → Inter 500, 16px, sentence case, tracking 0, tabular. Tertiary/secondary keep DM Mono 13px caps. |
| **D** | New `.act--inline`. Used for the doorstep's "Finished work", "Recorded in Previously", "Back to the house", the mat's papers link, and the two linked story-pole phases. |
| **E** | `[aria-pressed="true"]` on a scored act → `--ink` text + the secondary two-score rule. The meta-strip switcher now shows its state. |
| **G** | One hold: 900ms, ink fill left→right (`.act--terminal .fill`), Enter/Space parity, `pointerup`/`pointerleave`/`pointercancel` cancel silently, reduced motion hides the fill and keeps the wait, and a bare click **never** commits. |
| **I** | Signature input capped at `max-width: 360px`; the date sits immediately right of it on the same baseline. (No ledger table on this page.) |
| **J** | Dark `--tab-*` reverted to the light plate values in both dark blocks. |
| **K** | The photograph stays a `data:` URI — T05 declined (see below). |
| **L** | The 390 dock is JS-governed: it engages only while `#wall` is on screen **and** the in-flow act is below the viewport **and** the consequence sentence is clear of the dock. It carries the act only, sets `scroll-padding-bottom` to the dock height, and never reorders the flow. Measured across seven scroll offsets at 390×844: docks in exactly one window, `coversConsequence:false` at every offset, `scrollPaddingBottom: 73px` while docked. |
| **M** | Commit writes "Finished work accepted: $2,980.00 released to Marta Voss." to `role="status"` and moves focus to the record heading (`#wall-record-head`, `tabindex="-1"`). Verified live. |
| **N** | Band note, the shelving row's state sentence, "What changed since yesterday" and the stamp are all state-scoped and now agree in all three states. |
| **P** | The one photograph moved out of the 96px thumbnail to a band-width 3:2 plate with its caption below; the shelving row's plate is now a drawn elevation. |
| F, H, O | Desk-only — not applicable to this file. |

## Findings

| ID | Status | Note |
|---|---|---|
| **T04** | Fixed | `[aria-disabled="true"]` value selector, matching the sheet and `decision-moment.html`. (This reintroduces the substring `disabled=` into the file; a bare `disabled` attribute still appears **zero** times — all 7 hits are `aria-disabled=`.) |
| **T05** | **Declined** | Ruling K: the photograph must stay a data URI for self-containment. File is 351 KB. |
| **T06** | Fixed | See SF-03. |
| **T07** | Fixed | Passed phases take a filled `--ink-faint` disc, the held phase a solid `--ink` caret, the upcoming phase an open ring — the roster's own mark vocabulary. |
| **T08** | **Declined** | `data-never-dim` is markup SPEC §C row 2 mandates by name. No state in this specimen dims a landmark, so there is nothing to wire; removing it would put the file out of spec. Left as declared intent. |
| **T09** | n/a | Capture artifact. The rewritten dock removes the sticky element that produced it; no ghost in any of the eight new captures. |
| **T11** | Fixed | Superseded by ruling L. |
| **SF-01** | Fixed | Ruling N. Quiet day now reads "one piece on its way" / "Installed 3 September by Marta Voss" / "Nothing changed since yesterday…"; After acceptance reads "accepted 8 September" beside the ACCEPTED stamp and "You accepted the north-wall shelving today." |
| **SF-02** | Fixed | Ruling G. A bare click while armed does nothing; only a completed 900ms hold commits. Verified: 300ms release → no record; 1100ms Enter hold → record. |
| **SF-03** | Fixed | Only the two phases with a band are links (Procurement → `#road`, Installation → `#study`). The other four render as marked, unlinked phases — no two links now resolve to one anchor. |
| **SF-04** | Fixed | 900ms. |
| **SF-05** | Fixed | The three `STATES` strings are now studio language ("The north-wall shelving is finished and waits for your acceptance." etc.); no prototype caveat inside the mocked page. |
| **SF-06** | Fixed | `.letterbox-fig { display: none }` below 960px. |
| **SF-07** | Fixed | Captions kept in the text column (the 96px measure still forbids otherwise), now `.t-body-sm` in `--ink-faint` on their own grid row below the name/state pair, so the reading order is name → state → source. |
| **SF-08** | Fixed | "North wall · drawing by Local Dev Studio · 3 September 2026". |
| **SF-09** | Fixed | `.has-scrolled` deleted; replaced by ruling L's governed dock. |
| **SF-10** | Fixed | See T04. Script sets `aria-disabled="true"` when unmet and removes it when met — one idiom, matching the value selector. |
| **SF-11** | Fixed | On match, `#gate-reason` is emptied and `aria-describedby` removed; the permanent hold caption under the act carries the remaining instruction. |
| **SF-12** | n/a | Non-blocking, as filed. `#wall`'s `h3` follows the Study `h2` in document order; heading sequence still has no skips. |
| **OS-01** | Fixed | Ruling D. |
| **OS-02** | Fixed | Ruling G — Specimen 3's implementation. |
| **OS-03** | Fixed | `.act--terminal .fill` added, with the reduced-motion guard. |
| **OS-04** | Fixed | Caption moved **below** the act, per OS-04 and ruling G. **Noted disagreement with ruling L**, whose parenthetical lists the in-flow order as "consequence → name → hold caption → act". G and OS-04 are the more specific instructions and agree with each other, so the shipped order is consequence → name → reason → act → hold caption. |
| **OS-05** | Fixed | Ruling E. |
| **OS-07** | n/a | This file's `.plate` is the image plate — the component that keeps the name. Rename lands in `designer-desk.html`. |
| **OS-08** | n/a | Already the 1100px frame. |
| **OS-10** | Fixed | One selector, one script idiom. |
| **OS-11** | Fixed | All running heads (`h2.t-head`, mat `dt`, the signature label, the record reference) set to `--ink-muted`. |
| **PR-01** | Fixed | Letterhead follows the invoice: `Local Dev Studio` at `.t-d3` Playfair over `Des Moines, Iowa · prepared by Leah Hartwell` at `.t-meta`; `PREPARED FOR NORA ELLISON` stays `.t-head` right. |
| **PR-02** | Fixed | The mat's papers column is now a count and a link: "Four papers, three signed — all of them in Previously". |
| **PR-03** | Fixed | Ruling B. |
| **PR-04** | Fixed | Ruling C. |
| **PR-06** | Fixed | The reconciling sentence's figures are `.t-money`; at 15px inside 16px Inter the size break is gone. |
| **PR-07** | Kept | Untouched, as instructed. |
| **PR-09** | Fixed | Ruling A. Confirmed legible in both themes (`client-house-1440-dark.png`). |
| **PR-10** | Fixed | Ruling P. |
| **PR-11** | Fixed | The standing footprint gains two shelf lines and book hatching; the dashed footprint gains a chair-leg detail. With ruling A's ink both read as drawings. |
| **PR-13** | Fixed | The road now carries what the sentence does not: the workshop at Cedar Falls at the origin, the arrival tick, and the house — with end-anchored labels. |
| **PR-14** | Fixed | Letterbox capped at 200px and hidden below 960px; the ~55px of dead space under the reconciling sentence is gone. |
| **PR-16** | Fixed | Held phase at `.t-body-sm` in `--ink` with a solid caret and its date; passed/upcoming marks distinguish position. |
| **PR-17** | **Declined** | Explicitly "not a defect — decide deliberately". Retiring or restoring the whole-house key is a sheet decision, not a builder fix; §C rows 7–9 specify per-room bands and this pass did not have authority to add a block. Flagged upstream. |
| **CR-01** | Fixed | Ruling D — the doorstep is now one Playfair sentence with "Finished work" scored in oak at the sentence's own size and case. |
| **CR-02** | Partially fixed | Moved to `.t-body-sm`: both plate captions, the wall-elevation caption, the two drawing-label pairs, the band note, the gate reason, the studio note's date line, the record parties/timestamp, and the Previously state words (now sentence case). `.t-meta` deliberately retained where §C, PR-01 or ruling G names it: the letterhead locality and sub-line, the hold caption, the pole date, the letterbox gloss. `.t-money` keeps the Previously dates and the prices per §C row 12 and ruling B. The 11–12px mono layer is now running heads plus four lines, not ~35. |
| **CR-03** | Fixed | 360px input, date immediately right on the same baseline. |
| **CR-04** | Fixed | Reason at `.t-body-sm` in `--ink`, hold caption at `.t-meta` in `--ink-subtle` below the act, date beside the field. Three ranks, three ranks of type. |
| **CR-06** | Fixed | Every rule is an `<hr>`; structure = `--hairline`, record/signature = `--hairline-strong` (`.rule-strong`). |
| **CR-07** | Fixed | The record block gains the typed name at `.t-d3` above a 320px `--hairline-strong` rule. |
| **CR-09** | Fixed | At ≤600px the piece row is `plate/body → side → caption`, so the price is above the caption. |
| **CR-14** | n/a | Noted, accepted as filed. |
| **CR-15** | Fixed | `align-items: baseline` on `.mat-grid`. |

Findings addressed to `designer-desk.html` or `decision-moment.html` only
(T01, T02, T03, T10, SF-13…SF-37, OS-06, PR-05, PR-08, PR-12, PR-15, CR-05,
CR-08, CR-10…CR-13, CR-16) are out of this file's scope.

## Gate

`node tools/render.mjs specimens/client-house.html --out shots/specimens --name client-house --state "quiet=#state-quiet" --state "accepted=#state-accepted" --console`, plus `--dark` and `--reduced-motion` at 1440, plus a default-state pass at both widths.

Renders in `shots/specimens/`:

- `client-house-default-1440.png`, `client-house-default-390.png`
- `client-house-quiet-1440.png`, `client-house-quiet-390.png`
- `client-house-accepted-1440.png`, `client-house-accepted-390.png`
- `client-house-1440-dark.png`
- `client-house-1440-rm.png`
- `client-house-console.json`, `client-house-default-console.json`

All eight captures: `errors: []`, `warnings: []`, `horizontalOverflow: false`.
Every PNG opened and inspected — no clipped text, no overlapping elements, all
three faces loaded, the photograph intact in both themes.

Live probes (Playwright, 0 console issues): unmet click → focus to the input +
reason in `role="status"`, no commit; armed bare click → no commit; 300ms hold
→ cancels silently; 1100ms Enter hold → record rendered, status announced,
focus on the record heading; dock behaviour as tabulated under ruling L.

Static: `box-shadow` 0 · `text-overflow` 0 · `PATINA` 0 · bare `disabled`
attribute 0 (7 hits, all `aria-disabled=`) · `opacity: .5` on a state 0 (the
only `opacity` values are the caret's 0/1, the stamp's sheet-specified `.42`,
and ruling A's `stroke-opacity: .5`) · one hex literal outside the `:root`
blocks, `#1F1D1A`.

**File**: `specimens/client-house.html` — 351 KB.

---

# Pass 2 — against `03-rereview-specimens.md`

| ID | Status | Note |
|---|---|---|
| **RR-01** | Fixed | `placeDock()` now ports `decision-moment.html`'s field-clearance check: it computes `line = vh - dockHeight` and requires **both** `.gate-consequence` and `.sig-row` to sit fully above that line before docking. Re-swept at 390×844, scrollY 1900→3700 in 20px steps: the dock engages only across scrollY≈2580–2620 and there are **0** offsets where the bar overlaps either the signature row or the consequence sentence (previously 2460–2570 overlapped `.sig-row`). Viewport-only captures at the first, middle and last docked offsets confirm the input rule and "8 September 2026" are visible above the bar throughout. |
| **RR-02** | Fixed | `.act--inline` replaced with the shared block verbatim — `border-bottom` mechanism, `font: inherit`, `color: inherit`, `box-decoration-break: clone`, pseudo-rules and caret killed. Rendered check: the doorstep's "Finished work" still carries one continuous oak rule under both words inside the 26px Playfair sentence. |
| **RR-03** | Fixed | Pressed rules replaced with the shared block's `.act[aria-pressed="true"]` / `.act[aria-pressed="false"]` pair, byte-identical across the three files. The meta-strip switcher now shows pressed (ink + two-score) and unpressed (subtle + oak) explicitly. |
| **RR-04** | n/a | Desk-only. The `.chip` rules from the shared block are present verbatim for cross-file identity; this page has no chip. |
| **RR-05** | Fixed | `.record-parties` and `.record-time` → `.t-meta`. The record now reads: `.t-d3` heading · `.t-head` reference · `.t-meta` parties · `.t-meta` timestamp · `.t-d3` signature over a 320px `--hairline-strong` rule · `.t-body` sentence — the same ranks `decision-moment.html` renders for the identical Authorization No. 8 record. |

**A note on the reference line.** The instruction listed "parties/timestamp/reference" as `.t-meta`, but qualified it as "matching decision-moment's record exactly". `decision-moment.html` sets `record__ref` to `.t-head`, and A9 specifies `.t-head` for that line. I followed the stated goal (byte-match the sister file and the sheet) and left the reference at `.t-head`; only parties and timestamp moved. Flagging in case the literal enumeration was intended instead — it is a one-class change either way.

Two residual cross-file divergences noted in §3 of the re-review are left standing because the other file explicitly declined to converge: the `aria-disabled` idiom (this file removes the attribute when met, `decision-moment.html` sets `"false"` — both use the same `[aria-disabled="true"]` selector) and the class-naming convention (single-hyphen here, double-underscore BEM there). Neither is a rendering defect.

## Pass 2 gate

Same command set. Eight captures — `client-house-{default,quiet,accepted}-{1440,390}.png`, `client-house-1440-dark.png`, `client-house-1440-rm.png` — all `errors: []`, `warnings: []`, `horizontalOverflow: false`. Every PNG opened and inspected. Live probe re-run: 0 console issues; bare click no commit; 300ms cancels; 1100ms Enter-hold commits, announces "Finished work accepted: $2,980.00 released to Marta Voss." and focuses `#wall-record-head`.

**File**: `specimens/client-house.html` — 351 KB.
