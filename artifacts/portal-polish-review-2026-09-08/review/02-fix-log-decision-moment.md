# 02 — Fix log: `decision-moment.html`

Fix pass against `01a-specimens-technical.md`, `01b-specimens-design.md` and the
coordinator's sheet amendments A–P. Every "must not be changed" item is intact:
the A9 record-block order, the stamp, the consequence sentence in every state,
the `aria-disabled` mechanics (value selector, focusable, visible reason,
`role="status"` on unmet activation), and the 900 ms press-and-hold.

File: `specimens/decision-moment.html` — 39 KB, 996 lines.

---

## Amendments applied

| Letter | What it changed here |
|---|---|
| **A** | Every drawn stroke is now `--ink-faint` at 1px with `vector-effect: non-scaling-stroke` (so the wall renders a true 1px line at 390 as well as 1440); the wall hatch is the subordinate line at `stroke-opacity: .5`. `--rail` is no longer used as a stroke anywhere. |
| **B** | `.t-money` is DM Mono 15px/1.5, tabular, .02em. One announced figure per money block: the ledger **Total $2,280.00** and the authorization's **$2,980.00** at `.t-d2`. The allowance sentence is `.t-body` with `$2,600.00` / `$320.00` in `.t-money` spans. |
| **C** | `.act--terminal .label` is Inter 500, 16px, sentence case, tracking 0, tabular — "Accept the finished work · $2,980.00". Tertiary and secondary keep DM Mono 13px caps. |
| **D** | `.act--inline` added and used for "Filed under Previously", "Recorded in Previously" and "Back to the house". |
| **E** | Chips: pressed = `--rail` ground + 1px `--ink-faint` border + `--ink` text; unpressed = `--paper` + `--hairline-strong`. Scored acts with `aria-pressed="true"` (the meta-strip switcher) take `--ink` text + the secondary two-score rule. |
| **G** | Hold kept verbatim: 900 ms, pointer + Enter/Space parity, bare click never commits, reduced motion keeps the wait and stills the fill. Visible `.t-meta` caption directly under the act. |
| **I** | `.ledger { max-width: 56ch }`, `.sign__field { max-width: 360px }`, record signature rule `max-width: 360px`. Figures right-align to the table's own rule. |
| **L** | Dock rebuilt (see SF-24/SF-25). |
| **M** | Both commits write to `role="status"` and move focus to the record heading. |
| **N** | State-scoped sentence: the wall's `aria-label` no longer says the notch is "open where your acceptance is owed" once accepted. |
| **P** | Legend specimens are inert `<span>`s inside `aria-hidden="true"` wrappers. |

---

## Findings

| ID | Verdict | Note |
|---|---|---|
| **T01** | n-a | Dark stage-plate tokens exist in this file but are never rendered as plates. |
| **T03** | fixed | `commitNote()` → "Selection noted: `<finish>`, $2,280.00."; `commitAccept()` → "Finished work accepted: $2,980.00 released to Marta Voss." (amendment M). |
| **T04** | n-a | This file already carries the spec's `[aria-disabled="true"]` value selector; unchanged. |
| **T11** | acknowledged | See SF-24 note on the dock's trigger window. |
| **SF-24** | fixed | The dock is no longer `position: sticky`. A scroll-driven controller docks the act (`position: fixed`) only while paper (B) is on screen **and** the in-flow act is below the dock line **and** the consequence and the signature field are both entirely above it. Measured: while docked the bar overlaps neither the consequence nor the field. |
| **SF-25** | fixed | In-flow order is fixed at consequence → name field → reason → act → hold caption, at both widths; the dock lifts the act only, never reorders it. |
| **SF-26** | fixed | `.ledger { max-width: 56ch }`. |
| **SF-27** | fixed | The three legend specimens are `<span class="act …">` inside `aria-hidden="true"` wrappers; zero focusable controls remain in the rail (tab stops 13 → 10). The money figure is dropped from the terminal specimen's label ("Accept the finished work"), so no second `$2,980.00` sits beside the accepted record. This overrides §E's legend table wording. |
| **SF-28** | fixed | The `≤600px` `.t-d1`/`.t-d2` overrides are deleted; seven steps, no more. |
| **SF-29** | fixed | Input and record rule are both 360px. |
| **SF-30** | fixed | `role="radiogroup"` → `role="group"`, keeping the `aria-pressed` toggle buttons (valid ARIA, and it preserves amendment E's `[aria-pressed="true"]` styling hook). |
| **SF-31** | fixed | `setState('failed')` now restores the finish that was selected before the reset. Verified: Smoked oak → Save failed keeps Smoked oak pressed. |
| **SF-32** | fixed | `.wall.is-closed .notch-outline { display: none }` — the outline rect is removed when the notch fills. |
| **SF-33** | fixed | The colophon is a third grid child (`grid-column: 1`), so the legend precedes it at every width; the colophon is the last block at 390. |
| **SF-34** | fixed | The four record acts are `<a class="act act--inline" href="#">`. The legend's three are now inert spans (P). `href="#"` matches the out-of-scope "doorway" idiom 01a explicitly accepted for designer-desk. |
| **SF-35** | **declined** | 01a T04 ratifies this file's value selector as the model the other specimen should adopt; `aria-disabled="false"` is the coherent half of that pair (a removed attribute would make the selector meaningless). Changing it here would move the deviation rather than remove it. The one idiom should be settled on this file's side. |
| **SF-36** | fixed | `.status { min-height: 28px }` and the live region moved below paper (A)'s letterhead. |
| **SF-37** | fixed | The rail edge is now a full-height 1px rule drawn on `.frame::after` (≥1201px); `.legend` no longer carries the stub `border-left`. |
| **OS-01** | fixed | `.act--inline` adopted (amendment D). |
| **OS-02 / OS-03 / OS-04** | n-a | This file is the reference implementation; unchanged. |
| **OS-05** | fixed | `aria-pressed` now has a visible state on the meta-strip switcher. |
| **OS-07** | n-a | `.plate` here is the image plate, the usage the review calls correct; the rename is a cross-file sheet change. |
| **OS-08** | **declined** | The rail-inclusive 1392px frame is the only way to seat a 200px rail beside a ~1096px document column; the review itself files this as a sheet change, and no amendment ruled on it. |
| **OS-09** | fixed | `-webkit-font-smoothing: antialiased` removed. |
| **OS-10** | see SF-35 | |
| **OS-11** | n-a | Names specimens 1 and 2. |
| **PR-03 / PR-04 / PR-05 / PR-06** | fixed | Amendments B and C. |
| **PR-08** | fixed | Only the terminal act docks; paper (A)'s secondary and tertiary acts stay in flow at 390, so the tier difference survives the phone. |
| **PR-09** | fixed | Amendment A. Verified in both themes — the plate and the wall are legible in `-1440.png` and `-1440-dark.png`. |
| **CR-03** | fixed | 360px input with the date immediately right of it. |
| **CR-05** | fixed | Amendment E's stronger chip border. |
| **CR-07 / CR-08 / CR-11** | n-a / keep | Praise or fixes directed at the other specimens. |
| **CR-06** | **declined** | "One hairline mechanism (`<hr>`) across the three files" is a cross-file harmonization with no amendment behind it; both mechanisms use the sheet's own tokens and the map here is already structure = `--hairline`, money/record = `--hairline-strong`. |

### Two notes for the coordinator

1. **Amendment L vs amendment G / OS-04.** L's parenthetical lists the in-flow
   order as "consequence → name → hold caption → act"; G, OS-04 and §E B6 all
   put the caption *directly under* the act. I followed G/OS-04/§E: consequence
   → name → reason → act → caption.
2. **The dock's trigger window is ~78px of scroll** at 390 (measured), because
   the act sits directly below the field it depends on and L forbids docking
   before that field has cleared. This is the same structural point 01a raised
   as T11. Behaviour is correct; it is simply rarely visible. It also means the
   dock never appears in a full-page capture, which is why the SF-24 slicing
   artifact is gone from every PNG.

---

## Gate

`tools/render.mjs`, sandbox disabled (Chromium `MachPortRendezvousServer`).
Four runs: the three switcher states at 1440 + 390, the default at 1440 + 390,
`--dark` at 1440, `--reduced-motion` at 1440. **10 captures, every one
`errors: []`, `warnings: []`, `horizontalOverflow: false`; all 10 opened and
visually checked.**

```
decision-moment-1440.png            decision-moment-390.png
decision-moment-noted-1440.png      decision-moment-noted-390.png
decision-moment-accepted-1440.png   decision-moment-accepted-390.png
decision-moment-failed-1440.png     decision-moment-failed-390.png
decision-moment-1440-dark.png       decision-moment-1440-rm.png
decision-moment-console.json
```

One regression was caught and fixed mid-pass: amendment C's 16px sentence-case
terminal label overflowed the 200px legend rail (`scrollWidth` 1453 at 1440);
the legend specimens now wrap.

Static: `box-shadow`, `text-overflow`, `PATINA`, `✓`, `@keyframes` all 0; bare
`disabled=` 0 (`grep -cE '(^|[^-])disabled='`); the only hex literal outside the
three token blocks is the sheet's own `#1F1D1A`.

Re-verified by script: 300 ms release cancels silently (pointer and keyboard),
900 ms commits (pointer and keyboard); reduced motion keeps the 900 ms wait with
the fill suppressed; the unmet gate still focuses the field and announces its
reason; the failure panel is `role="alert"` with focus on Try again; one `h1`,
headings in order, zero console errors.

---

# Pass 2 — shared-CSS alignment (after `03-rereview-specimens.md`)

The re-review marks this file ready and raises two cross-file notes against it,
plus one minor residual. All three are now closed. Nothing else changed: the
hold, the dock controller and its field-clearance condition, the record block,
the legend and the `aria-disabled` idiom are untouched.

| Note | Verdict | What changed |
|---|---|---|
| **RR-02** — `.act--inline` not the same CSS in the three files; this file's version hard-codes `color: var(--ink)` instead of inheriting, contradicting amendment D's own text | fixed | My `.act--inline` block is replaced by the coordinator's shared text verbatim. It now inherits `color`, `font`, `letter-spacing` and `text-transform`, keeps the `border-bottom` rule, nulls `.label::before/::after` and the caret, and adds `box-decoration-break: clone` so a wrapped inline act keeps one continuous rule. |
| **RR-03** — pressed-state selector scoped to `.act--tertiary[aria-pressed="true"]` rather than the sheet's unscoped `.act[aria-pressed="true"]` | fixed | Replaced by the shared text verbatim, including the `[aria-pressed="false"]` half (ink-subtle + the single oak rule), which this file did not previously carry. Only the meta-strip switcher is ever pressed here, so the rendered result is unchanged — the divergence is what is gone. |
| **`.chip`** — shared chip text | fixed | Replaced verbatim: `padding: 10px 14px`, `border-radius: var(--radius-box)` (was `10px 16px` / `--radius-hair`), `--rail` ground + `--ink-faint` border when pressed. |
| **§3/C** — terminal label `line-height: 1.25` vs the sister file's `20px`; "immaterial but not byte-identical" | fixed | `line-height: 20px`, matching `client-house.html`. |
| **SF-32 residual** — "a thin rectangular edge is still visible where the clip boundary sits" once the notch is closed | fixed | The wall elevation now carries its outline on its own `<rect class="dw">`, and `.wall.is-closed .hatched { stroke: none }` drops the even-odd path's stroke on accept. In `decision-moment-accepted-1440.png` the notch is gone entirely — one continuous hatched elevation, no residual edge. |
| **RR-01 / RR-04 / RR-05** | n-a | These name `client-house.html` and `designer-desk.html`. RR-05 explicitly cites this file's record block as the correct implementation; unchanged. |

## Gate (pass 2)

Same four runs: three switcher states at 1440 + 390, default at 1440 + 390,
`--dark` at 1440, `--reduced-motion` at 1440. **10 captures, every one
`errors: []`, `warnings: []`, `horizontalOverflow: false`; all 10 opened and
visually checked.** Filenames unchanged from pass 1.

Re-verified by script after the swap:

- pointer 300 ms release → no commit; pointer 900 ms hold → commits, status
  reads "Finished work accepted: $2,980.00 released to Marta Voss.", focus lands
  on the record heading, the signature renders the typed name.
- Enter 300 ms → no commit; Enter 900 ms → commits. Bare click never commits.
- Reduced motion keeps the 900 ms wait with the fill suppressed.
- The unmet gate still focuses the field and announces its reason; the failure
  panel is `role="alert"` with focus on Try again and the finish preserved.
- 390 dock: engages only inside its window, and while docked overlaps neither
  the consequence sentence nor the signature field (`coversConsequence: false`,
  `coversField: false`).
- Legend: zero focusable controls, all three specimens `aria-hidden`; 10 tab
  stops.

Static, unchanged: `box-shadow` / `text-overflow` / `PATINA` / `✓` /
`@keyframes` all 0; bare `disabled=` 0; the only hex literal outside the three
token blocks is `#1F1D1A`.

File: 39 KB, 974 lines.

- **8 September 2026 (pass 3, deck fix pass).** `<title>` changed from `Cedar Lane Study` to `Two Acts, Two Weights` — the gallery name for this specimen; the page `h1` still reads "Cedar Lane Study", which is the document the specimen depicts. No other byte of the file was touched.
