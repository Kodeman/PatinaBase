# 03 — Fresh-context re-review of the fix pass

Verified, not trusted. Fresh context; renders re-run independently into
`/var/folders/.../T/rereview/` (Chromium via `tools/render.mjs`, sandbox
disabled per the tool's own README — `MachPortRendezvousServer: Permission
denied` inside the default Bash sandbox) — all three specimens' declared
states at 1440 and 390, plus `--dark` and `--reduced-motion` at 1440 (28
captures total: client-house ×8, designer-desk ×10, decision-moment ×10).
Every PNG opened and inspected. Additional live behaviour (hold timing, dock
scroll geometry, focus/status announcements) verified with small ad-hoc
Playwright scripts against the actual files, not against the fix logs' prose.

No severity filter applied.

---

## 1. Render gate

All 28 captures: `errors: []`, `warnings: []`, `horizontalOverflow: false`.
Confirmed by parsing every console.json (`client-house-console.json` /
`-default-console.json`, `designer-desk-console.json` /
`-default-/-dark-/-rm-console.json`, `decision-moment-console.json` /
`-default-console.json`, plus isolated re-runs of client-house's
quiet/accepted/dark/rm captures whose console.json had been overwritten by a
same-named later render — the underlying captures were still clean, this was
purely a filename collision in how I invoked the tool, not a specimen
defect). Zero page errors, zero warnings, zero overflow across every state,
both widths, dark, and reduced-motion, for all three files. This matches
every fix log's own claim.

---

## 2. Every "fixed" / "declined" claim, verified

Format: `ID | verdict | file | evidence`. Only claims I could independently
confirm or refute are listed; the exhaustive tables in the three fix logs are
otherwise accurate bookkeeping of what changed and I am not re-deriving all
~140 rows. Where a claim is wrong, it's called out explicitly.

### Technical review (01a)

| ID | Verdict | Evidence |
|---|---|---|
| T01 | **confirmed fixed** | `designer-desk.html` has zero `--tab-brief/discovery/direction` redefinitions inside either dark-mode block (`grep` inside the `prefers-color-scheme: dark` block returns nothing) — dark mode falls through to the light `:root` values. Rendered (`designer-desk-dark-1440-dark.png`): all seven stage plates read as clearly as the light render, no washed-out Brief/Discovery/Direction. |
| T02 | **n/a — overruled, correctly** | §B now reads "16 live = the 15 named above + Hollenbeck residence (Project ×4)" verbatim, *(amended §F-H)*. Not a builder decision to second-guess; the sheet itself changed. |
| T03 | **confirmed fixed** | Live-tested: `commitAccept()` in `decision-moment.html` now calls `say('Finished work accepted: $2,980.00 released to Marta Voss.')` and `commitNote()` calls `say('Selection noted: Natural oak, $2,280.00.')`. Verified via Playwright — `#status` textContent updates correctly on both a 1100 ms pointer-hold accept and a click-commit note. |
| T04 | **confirmed fixed** | `client-house.html`'s CSS now reads `[aria-disabled="true"]` throughout (line 217+), matching `decision-moment.html` and the sheet's literal §A5 text. Script only ever sets `'true'` or calls `removeAttribute`, one idiom. |
| T05 / K | **decline accepted** | Amendment K rules the data URI must stay for self-containment. File is 351 KB (fix log claims 351 KB — exact). No `room.jpg` exists alongside the specimens, confirming no relative-path alternative was silently added either. Reasonable — a "declined" ruling from the coordinator is not the builder's to override. |
| T06 | **confirmed fixed** | Story pole: only `Procurement` → `#road` and `Installation` → `#study` are `<a>` links now; Discovery/Design/Design refinement/Completion are unlinked `<span>`/text with a mark, per grep of the story-pole markup. No two differently-labelled links share a target any more. |
| T07 | **confirmed fixed** | Rendered: passed phases (Discovery, Design, Design refinement, Procurement) show a filled dot; Installation shows a solid caret + date; Completion shows an open ring. Distinguishable vocabulary, matching the roster's own marks. |
| T08 | **decline accepted** | `data-never-dim` is spec-mandated markup (§C row 2) with no behaviour to wire in this fixture (no state dims `What you owe`). Reasonable as declared intent. |
| T09 | **n/a, confirmed** | Capture-stitching ghost artifact from the old sticky dock; the rebuilt dock (ruling L) no longer produces it. Not present in any of my fresh renders either. |
| T11 | **superseded, confirmed** | The `.has-scrolled`-gated dock is gone; replaced by the JS-computed dock in both files. See §5 below for a **new** defect in this replacement (client-house only). |

### Design review (01b) — spot-checked at volume, full detail on high-value items

| ID | Verdict | Evidence |
|---|---|---|
| SF-01 / N | **confirmed fixed** | Rendered `client-house-quiet-1440.png`: doorstep reads "Nothing needs you today"; shelving row reads "Installed 3 September by Marta Voss" (no trailing "awaiting your acceptance"); "What changed" reads "Nothing changed since yesterday…"; wall gate and its landmark are omitted. `client-house-accepted-1440.png`: shelving row reads "Installed 3 September by Marta Voss · accepted 8 September" beside the ACCEPTED stamp (no contradiction); "What changed" reads "You accepted the north-wall shelving today...". The IX11 collision the finding named is gone in both directions. |
| SF-02 / SF-04 / OS-02 / G | **confirmed fixed, live-tested** | Playwright, both `client-house.html` and `decision-moment.html`: a bare click while armed → **no commit**; a 300 ms press-and-release → **no commit**, `is-holding` cleared; a ≥1100 ms hold (pointer) → **commits**, `role="status"` announces the correct sentence, focus lands on the record heading. Both files now share the 900 ms constant and the same event wiring shape (pointerdown/up/leave/cancel + keydown/keyup Enter/Space parity, bare click only ever focuses the field when unmet). This is the single most consequential fix in the pass and it holds in both files. |
| SF-03 / T06 | **confirmed fixed** | See T06 above. |
| SF-06 | **confirmed fixed** | `client-house-default-390.png`: no envelope drawing between the reconciling sentence and "Pay $4,060.00" — `.letterbox-fig { display:none }` below 960px confirmed in source. |
| SF-09 | **confirmed fixed** | `.has-scrolled` class removed from source; dock logic is now purely geometry-driven (see L). |
| SF-13 / O | **confirmed fixed** | `designer-desk.html`'s `.row-name` rest rule is now `--oak` (grep confirms, matches the base `.act--tertiary`-style rest treatment); rendered, every job name across 16-job, 43-job, needs-me and by-person states shows a visible oak underline at rest, raising to `--clay` on hover. Zero `border-bottom` using `--rail` remains in any of the three files (`grep -rn "border.*var(--rail)"` → no hits). |
| SF-14 / H | **confirmed, overruled correctly** | `By person` render shows exactly Leah Hartwell (5) · Anneke Sund (6) · Colin Brandt (5) = 16, no Marta Voss, no "unassigned" — matches the amended §B fixture, which is the newer authority over the design review's original ask. |
| SF-15 | **confirmed fixed** | `designer-desk-default-390.png`: margin note is two lines of 16px Inter (was four lines of 20px Playfair italic); only the em-dash lead is `.t-authorship`. |
| SF-18 | **confirmed fixed** | Rendered head sentences at 1440 across all four states state their own facet in words ("…SHOWING WHAT NEEDS YOU", "…BY PERSON") and the separate status line ("Showing what needs your hand · 7 of 16 jobs…", "Showing all 43 jobs…") no longer visibly duplicates the head at first paint. |
| SF-20 | **confirmed fixed** | Facet row position is visually stable between `default` (y≈296) and `needsme` (y≈341, but the head sentence wraps to two lines in *both* — the facets did not additionally shift when the sentence text got longer within its own wrapped state; verified via source: `.roster-head { flex-wrap: nowrap }` keeps the two facet buttons pinned right while the head sentence's own `flex:1 1 auto; min-width:0` absorbs the growth). |
| SF-24 / SF-25 / L (decision-moment) | **confirmed fixed, and confirmed *better* than claimed** | Playwright scroll sweep of `decision-moment.html` at 390×844 from scrollY 1000–1800 in 50–100px steps: the dock (`#acceptDock`/`#dockSlot`) engages only for scrollY≈1350–1370 (a ~20px window — even narrower than the fix log's own "~78px" note, but consistent with it), and at every sampled offset — docked or not — the fixed bar overlaps **neither** `#closeB .consequence` **nor** `#closeB .sign` (the signature field). This is because `updateDock()` explicitly requires `f.bottom < line` (the *signature field* must be fully clear) before docking, not just the consequence sentence. This is stricter than what L's own prose asks for, and it is why decision-moment shows no analogue of the defect described in §5 below. |
| SF-26 / SF-29 / CR-03 | **confirmed fixed** | Rendered `decision-moment-default-1440.png`: the ledger (`Piece`/`Delivery`/`Total`/allowance) is now constrained to roughly the document's own measure, not stretched to the page edge — `.ledger { max-width: 56ch }` in source. Signature input and record signature rule both 360px in source (`grep "max-width: 360px"` — 3 hits: `.sign__field`, the record rule, and `client-house.html`'s `.sig-row input`). Rendered, the date sits immediately right of the input on one baseline in both files. |
| SF-27 / P | **confirmed fixed** | Legend rail specimens are `<span class="act act--… act--specimen">` inside `aria-hidden="true"` wrappers — zero `<button>` in the legend. The terminal specimen's label reads "Accept the finished work" with **no** `$2,980.00` figure, so there is no second dollar figure sitting beside the real accepted record. Tab-stop count in the accepted state confirms no focusable duplicate. One residual, non-blocking observation: the legend's terminal specimen is still visually a filled-charcoal "button-shaped" object sitting ~1,300px above (and, in *Accepted*, structurally beside) the real record — this is the exact remedy 01b prescribed ("render as inert... drop the figure"), so it is working as specified, not a new defect, but it is worth knowing the visual echo of IX11 (a filled act near a taken record) is only removed at the *interaction* layer, not fully at the *first-glance* layer. |
| SF-28 | **confirmed fixed** | `grep "max-width: 600px" -A15 decision-moment.html` shows no `.t-d1`/`.t-d2` mobile overrides — the two extra type sizes are gone. Seven steps, confirmed by scanning all `font-size` declarations tied to `.t-*` classes. |
| SF-30 | **confirmed fixed** | `role="radiogroup"` → `role="group"` in source; `aria-pressed` toggle buttons retained (valid combination). |
| SF-31 | **not independently re-tested** (requires a multi-step interaction: select Smoked oak, then trigger Save failed via the switcher) — source inspection shows `setState('failed')` no longer force-resets `finish` to `'Natural oak'` before calling `reset()`; the logic reads correctly but I did not exercise the exact sequence live. Flagging as **plausible, unverified** rather than confirmed. |
| SF-32 | **confirmed improved, minor residual** | Rendered accepted-state notch (`decision-moment-accepted-1440.png`, cropped): the notch is now filled with the wall's hatch pattern rather than a blank hole — reads as materially closed. A thin rectangular edge is still visible where the clip boundary sits (this is the hatch clip-path's own edge, not a separate outline stroke drawn on top) — a very minor residual, not the "hole" defect SF-32 described. |
| SF-33 | **confirmed fixed** | `decision-moment-default-390.png`: order is …Terminal legend entry → "Prepared by Local Dev Studio · Sent through Patina" — colophon is last. |
| SF-35 | **decline noted, self-consistent** | `decision-moment.html` explicitly declines to change its `aria-disabled="false"` idiom (citing T04 as validating its own selector as the model); `client-house.html` was changed to match. Net effect: one file removes the attribute, the other sets it `"false"` — this is a real, acknowledged residual divergence (see §3). |
| CR-01 / OS-01 / D | **confirmed fixed, visually excellent** | Cropped `client-house-default-1440.png` at the doorstep: "**Finished work** waits for your acceptance." now renders as one continuous Playfair sentence at 26px, sentence case, with "Finished work" carrying only a 1px oak underline 3px below the baseline — no chip, no baseline shift, no case break. This is the single cleanest fix in the pass. |
| CR-09 | **confirmed fixed** | `client-house-default-390.png`: in the shelving row, `$2,980.00` renders directly under the name/state pair, above the caption — price is no longer last in the row. |
| CR-10 | **confirmed fixed** | `designer-desk-default-1440.png`: "Vandersteen" (the link) keeps ink/oak-rule link styling; only ", install, since 4 September" after it is `--terracotta-ink`. Source: `<a>Vandersteen</a><span class="overdue-clause">, install, since 4 September</span>`. |
| PR-09 / A | **confirmed fixed, both themes** | Zero `stroke="var(--rail)"` and zero `stroke: var(--rail)` in any of the three files (`grep` — clean). The only remaining `var(--rail)` usages are three `fill="var(--rail)"` (board scan-card grounds in `designer-desk.html`) paired with `stroke="var(--ink-faint)"` — fill-only, as the amendment permits. Rendered in both light and dark at 1440: the letterbox, Study section, chair/shelving silhouettes, wall elevations, road, round-table plate and board drawings are all legible against both `--paper`/`--paper-doc` grounds. |
| PR-12 / P | **confirmed fixed** | Board thumbnails in `designer-desk.html` are now composed drawings (an elevation figure, two pigment swatches, caption rules) rather than three empty rectangles — visible in both light and dark renders. |
| OS-06 / F | **confirmed fixed, dark-mode inversion resolved** | `designer-desk.html`'s bottom bar CSS is `--paper-doc` ground / `--hairline-strong` top rule / `--ink` text (no `--ink` ground anywhere on the bar). Rendered dark (`designer-desk-dark-1440-dark.png`): the bar stays a quiet dark band — the original bug (a bright cream band becoming the loudest object on the dark page) is gone. |

---

## 3. The sixteen amendments (A–P) — cross-specimen fidelity

**A (drawing ink).** Confirmed clean in all three: zero `stroke="var(--rail)"`,
zero `stroke: var(--rail)`, `--rail` used only as `fill`/ground. Applied
consistently.

**B (`.t-money` 15px, one `.t-d2` per money block).** Confirmed: `.t-money`
is DM Mono 15px/1.5 tabular `.02em` in both `client-house.html` and
`decision-moment.html` (byte-identical property list; `designer-desk.html`
correctly has no `.t-money` at all — no money block). Exactly one `.t-d2`
"announced" figure per money block in both files (`$4,060.00` in
client-house; `Total $2,280.00` and `$2,980.00` in decision-moment's two
papers); every other figure in each block is `.t-money`, including the
allowance sentence's spans. Confirmed by full grep of every `t-money`/`t-d2`
usage in both files, not sampling.

**C (terminal label Inter 500 16px sentence case).** Confirmed identical
core properties (`font-family: var(--font-body); font-size: 16px;
font-weight: 500; letter-spacing: 0; text-transform: none;
font-variant-numeric: tabular-nums`) in both `client-house.html` and
`decision-moment.html`. Line-height differs cosmetically (`20px` fixed vs.
`1.25`) — immaterial at 16px (≈20px either way) but not byte-identical.

**D (`.act--inline` exists in every file that uses it, same CSS).**
**Exists in all three — confirmed. NOT the same CSS.** Three different
mechanisms:

| | client-house | decision-moment | designer-desk |
|---|---|---|---|
| Underline mechanism | `.label::before` pseudo-element | `border-bottom` on the element itself | `.label::before` pseudo-element |
| `color` | `inherit` | **`var(--ink)`** | `inherit` |
| padding | `0` | `0 0 3px` | `0` |
| extra props | — | `line-height: inherit`; explicitly nulls `.label::before/::after` | `vertical-align: baseline` |

decision-moment's `color: var(--ink)` directly contradicts the amendment's
own text ("Inherits the surrounding sentence's family, size, case **and
colour**") — it does not inherit colour, it forces ink. This is currently
invisible in practice (every context `.act--inline` is used in already has
`--ink`-coloured surrounding text), but it is a real, literal amendment
violation and a real "same CSS" violation across all three files. See finding
**RR-02** below.

**E (pressed state, same CSS in each).** **Not quite.** The base
`.act[aria-pressed="true"]`/`.act--tertiary[aria-pressed="true"]` rule body
(`color: var(--ink)` + the two-score rule) is functionally identical in all
three, but the **selector scope differs**: `client-house.html` uses the
sheet's own literal unscoped selector, `.act[aria-pressed="true"]`;
`decision-moment.html` and `designer-desk.html` both scope it to
`.act--tertiary[aria-pressed="true"]`. Currently harmless (only tertiary acts
are ever pressed in any of the three fixtures), but it is a real "same CSS"
divergence and, for the two scoped files, a literal deviation from §A5/F-E's
printed selector. See **RR-03**.

Separately: amendment F-E explicitly names *"facets drawn as chips, the
16/43 switcher"* as things that should get the **chip** treatment (`--rail`
ground, 1px `--ink-faint` border, `--ink` text when pressed). In
`designer-desk.html`, the 16⇄43 switcher and both facets (`Only what needs
me`, `By person`) are plain `.act.act--tertiary` buttons — they get the
scored-act pressed look (ink text + underline), not the chip ground+border
look the amendment names for exactly these controls. The fix log's own
"OS-05 Fixed" entry describes applying the scored-act treatment to "both
facets and the 16/43 switcher," which is a different component than the one
amendment E specifies for them. See **RR-04**.

`.chip[aria-pressed]` (the finish-selection chip) only exists in
`decision-moment.html` (the only file with an actual finish selector) and
matches the sheet's chip spec exactly.

**F (Desk bar on paper).** Confirmed: `--paper-doc` ground, 1px
`--hairline-strong` top rule, `--ink` text; no charcoal anywhere in
`designer-desk.html`'s bar CSS. Confirmed non-inverting in dark mode by
render.

**G (hold: 900ms commit / 300ms cancel / bare click never commits).**
**Confirmed live, both files, exactly as specified.** See §2 above.

**H (fixture: 16 = 15 + Hollenbeck; people facet = Leah/Anneke/Colin).**
Confirmed in `SPEC.md` §B (already amended) and in both the 16-job and
by-person renders.

**I (measure: ledger 56ch, signature 360px).** Confirmed (see SF-26/29/CR-03
above). `client-house.html` has no ledger table (n/a, correctly noted).

**J (dark stage plates keep light values).** Confirmed: zero `--tab-*`
redefinitions inside either dark-mode block in `designer-desk.html`.
Rendered legible.

**L (390 dock never covers the consequence, never precedes its signature
field).** **Confirmed for `decision-moment.html`. Confirmed VIOLATED (in
spirit, for the signature field specifically) in `client-house.html`.** See
§5, finding **RR-01** — this is the most significant thing this re-review
found.

**M (commit writes to `role="status"`; focus to record heading).** Confirmed
live for both files (see §2 / SF-02 above). My first attempt at testing
decision-moment's accept path produced a false negative (button appeared to
never receive the hold) — root-caused to my own test script not scrolling
the target into view before computing its bounding box in a 900px-tall
viewport (the button sits ~650–1000px down the document); once corrected,
the record renders, `role="status"` announces "Finished work accepted:
$2,980.00 released to Marta Voss.", and focus lands on and stays on the
`h3.record__subject` (`tabindex="-1"`) heading. No stray click handler steals
focus back afterward — I checked this specifically because the file's global
`document.addEventListener('click', ...)` has an `!armed` fallback branch
that resets focus to the name field, and `commitAccept()` sets `armed =
false`; in practice the native `click` event that follows the pointerdown→
(900 ms)→commit→pointerup sequence hits the *already-replaced* record markup
(no `#acceptAct` in it), so the fallback branch's `.closest('#acceptAct')`
correctly finds nothing and does not fire. Confirmed clean.

**N (no state-contradicting sentence).** Confirmed for client-house's
quiet/accepted states (SF-01, above) and for decision-moment's wall
`aria-label` (no longer claims the notch is "open" once accepted — verified
in source, `WALL_CLOSED` string vs. the open-state `aria-label`).

**O (Desk row names: resting oak, hover clay).** Confirmed (SF-13, above).

**P (installed photo at band width; richer board drawings; legend rail
inert).** Confirmed (PR-10-equivalent band-width plate visible in
`client-house-default-1440.png`; PR-12/board drawings confirmed; legend
inertness confirmed under SF-27).

---

## 4. One system — divergences found across the shared sheet blocks

Beyond the amendment-by-amendment notes above:

- **`.act`, `.act--tertiary`, `.act--secondary` base rule bodies**: confirmed
  byte-identical across all three files (verified by extracting the exact
  selector-scoped rule bodies, not a greedy multi-rule diff).
- **`.act:focus-visible` / the proofreader's caret (`\2038`)**: byte-identical
  in all three.
- **`.stamp` / `.stamp::before`**: byte-identical between `client-house.html`
  and `decision-moment.html` (the only two files that use stamps;
  `designer-desk.html` correctly has none).
- **`.act--inline`**: NOT identical — see §3/D above (**RR-02**).
- **Pressed-state selector scope**: NOT identical — see §3/E above
  (**RR-03**).
- **`aria-disabled` idiom**: `client-house.html` removes the attribute when
  met; `decision-moment.html` sets it to `"false"` when met. Both use the
  `[aria-disabled="true"]` selector now (T04 fixed this half), but the two
  scripted idioms remain genuinely different, and `decision-moment.html`'s
  fix log explicitly declines to change it (SF-35), leaving the divergence
  standing on both ends by design, not oversight.
- **Letterhead / record-block naming convention**: `client-house.html` uses
  single-hyphen BEM-ish classes (`letterhead-heads`, `record-subject`,
  `record-parties`) and an `<hr class="letterhead-rule">`;
  `decision-moment.html` uses double-underscore BEM (`letterhead__heads`,
  `record__subject`, `record__party`) and a `<div class="letterhead__rule">`.
  This was flagged as CR-06 in 01b and explicitly declined for harmonization
  in `decision-moment.html`'s fix log ("both mechanisms use the sheet's own
  tokens"). Confirmed still present; a cosmetic/maintainability divergence,
  not a rendering defect.
- **Record-block type ranks — a real, unflagged divergence (RR-05).** A9
  specifies the record's parties line and timestamp line as `.t-meta` (12px
  DM Mono). `decision-moment.html`'s record (`record__party`, `record__when`)
  is `.t-meta`, matching the sheet exactly. `client-house.html`'s record
  (`record-parties`, `record-time`) is **`.t-body-sm`** (14px Inter) — a
  byproduct of CR-02's "declutter the mono layer" pass, which moved "the
  record parties/timestamp" to `.t-body-sm` without cross-checking A9's
  literal spec or `decision-moment.html`'s (correct, unmoved) implementation.
  The result, visually confirmed by comparing
  `client-house-accepted-1440.png` and `decision-moment-accepted-1440.png`:
  the identical two lines of the identical Authorization No. 8 acceptance
  record — "Nora Ellison · Local Dev Studio" / "Accepted 8 September 2026,
  2:14 pm" — render at two different type sizes and two different families
  depending which specimen you're looking at. This is exactly the kind of
  "one system at 20 feet, three authors at two feet" defect 01b's §B section
  exists to catch, and it was introduced *by* a CR-02 fix, not caught by
  either file's own gate.
- **`data-act="legend"` / `href="#"` idiom**: consistent — both client-house's
  Previously/house links and decision-moment's legend/record links use inert
  or self-referential idioms per file, each internally consistent and each
  separately declared (SF-19, SF-34).

---

## 5. New defects introduced by the fixes (regressions) — the reason for this re-review

### RR-01 (P2, High confidence) — `client-house.html`'s 390 dock visually covers its own signature field for ~60% of its docking window

**Claim.** Ruling L requires the docked act to "never render before its own
signature field." `client-house.html`'s fix log reports this as fixed and
verified ("`coversConsequence:false` at every offset"), and it is true that
the dock never overlaps the *consequence* sentence. But the dock's JS
(`placeDock()`, `client-house.html`) only checks that `.gate-consequence` has
cleared the dock line — it never checks the position of `.sig-row` (the
typed-name input + date). `decision-moment.html`'s equivalent function,
`updateDock()`, explicitly requires `f.bottom < line` where `f` is
`closeB.querySelector('.sign')` — the signature field itself — before it
will dock. `client-house.html`'s implementation is missing this check.

**Evidence.** Playwright scroll sweep of `client-house.html` at 390×844,
scrollY 1900→3700 in fine steps:

- Dock engages at scrollY≈2460 and stays engaged through scrollY≈2630 (a
  ~170px window — consistent with the fix log's own description of "docks
  in exactly one window").
- Across scrollY 2460–2570 (roughly the first 65% of that window), the fixed
  dock bar (`#gate-dock`, `top:771 bottom:844` in viewport coordinates)
  **overlaps** `.sig-row`'s bounding rect. Only from scrollY≈2580 onward
  does the sig-row clear the dock and the overlap end.
- Screenshots at scrollY 2480/2500/2600 (`ch-dock2-scroll2500.png`,
  `ch-sig2-scroll2480.png`, `ch-dock-scroll2600.png` in the render output)
  show the visible symptom directly: scrolling to this position shows the
  label "TYPE YOUR FULL NAME" immediately followed by the docked "Accept the
  finished work · $2,980.00" bar — the actual `<input>` and the "8 September
  2026" date are drawn *underneath* the fixed bar (`z-index: 3`) and are not
  visible on screen at all until the user scrolls further.
- The parallel case in `decision-moment.html` was swept the same way
  (scrollY 1000–1800): docked only for scrollY≈1350–1370 (~20px), and at
  every sampled offset — docked or not — there is zero overlap with either
  the consequence or the signature field (`.sign`). Confirmed by direct
  comparison of the two files' dock-trigger functions: `updateDock()` in
  `decision-moment.html` has a field-clearance check that `placeDock()` in
  `client-house.html` does not.

This is not the letter of the amendment's named prohibition ("never covers
the consequence sentence") — it's the *field*, not the sentence — but it is
squarely the *spirit* of "never renders before its own signature field," and
it is a real, demonstrable, on-screen regression that would confuse a
homeowner scrolling this exact page on a phone: her own typed name and the
date disappear behind the button asking her to accept, for well over half
the scroll range where that button is docked. Because the fix log's own
verification only checked consequence-coverage, this slipped through
unnoticed on both sides.

**Fix.** Port `decision-moment.html`'s field-clearance check into
`client-house.html`'s `placeDock()`: require `.sig-row` (or the whole `.sig`
block) to have cleared the dock line, the same way `.gate-consequence` is
already checked.

### RR-02 (P3, High confidence) — `.act--inline` is not the same CSS across the three files

See §3/D above. Three different underline mechanisms (pseudo-element vs.
`border-bottom`) and `decision-moment.html`'s version hard-codes `color:
var(--ink)` instead of inheriting colour, contradicting the amendment's own
text. Currently invisible in the rendered pages (every usage context happens
to already be ink-coloured), but it fails the explicit instruction to check
"same CSS in each," and it's a live landmine: if `.act--inline` is ever used
inside a differently-coloured sentence (e.g., a `--terracotta-ink` clause,
which the Desk's day's-line already demonstrates exists as a pattern), the
three files would render it three different ways.

### RR-03 (P3, High confidence) — pressed-state selector scope diverges

`client-house.html` uses the sheet's literal `.act[aria-pressed="true"]`;
`designer-desk.html` and `decision-moment.html` both use
`.act--tertiary[aria-pressed="true"]`. See §3/E. Currently harmless (no
secondary or terminal act is ever pressed in any fixture) but a real,
unflagged cross-file inconsistency and, for two of three files, a deviation
from the sheet's own printed selector.

### RR-04 (P3, High confidence) — designer-desk's facets/switcher get the wrong pressed treatment per the sheet's own naming

Amendment F-E explicitly lists "facets drawn as chips, the 16/43 switcher"
as chip-styled controls (rail ground + ink-faint border). `designer-desk.html`
implements them as plain scored `.act--tertiary` buttons instead (ink text +
underline on press). The fix log's "OS-05 Fixed" entry describes exactly
this scored-act treatment as the fix, without noting it's a different
component than the one the amendment names. Visually defensible (a chip
treatment on a text-only meta-strip facet might look heavier than intended)
but it is a literal spec deviation, not merely a builder judgment call
flagged as such.

### RR-05 (P2, High confidence) — client-house's record block uses the wrong type rank for two of A9's five lines

See §4 above. `client-house.html`'s `record-parties`/`record-time` render at
`.t-body-sm` (14px Inter) where A9 specifies, and `decision-moment.html`
correctly implements, `.t-meta` (12px DM Mono). Visually confirmed: the same
two lines of the same Authorization No. 8 record render at two different
sizes/families depending which of the two files you view. Introduced by
CR-02's mono-decluttering pass in `client-house.html`, without a
cross-reference to A9 or to the sister file.

---

## 6. The "must not be changed" list — survival check

1. **Tier CSS byte-identical** — confirmed for `.act`, `.act--tertiary`,
   `.act--secondary` (exact rule bodies); `.act--terminal`'s base block
   (padding/min-height/background/etc., excluding the permitted label
   override) also matches across the two files that have it. ✅ with the
   caveats above for `.act--inline` and the pressed selector, which are
   *additions*, not the protected base tiers.
2. **Unconditional resting rule** — confirmed: no `scaleX(0)`, no
   `@media (hover:none)` gating found in any file; oak rules render visibly
   at rest in every relevant screenshot (doorstep, day's line, roster row
   names, Previously/record links). ✅
3. **`aria-disabled` + visible reason + `aria-describedby` +
   focus-moves-and-announces** — confirmed live in both client-house.html
   and decision-moment.html. ✅
4. **Empty-room pattern** — confirmed intact in `client-house-default-1440.png`
   (Hall/Stair: name, floor line, one sentence, no rectangle). ✅
5. **Record block, A9 order, incl. Specimen 3's typed name + 320/360px rule**
   — confirmed present and in order in both accepted-state renders, though
   see RR-05 for a type-rank divergence within that otherwise-intact order. ✅ (with RR-05 noted)
6. **The stamp** — confirmed byte-identical CSS, correct pigments per state
   (sage/accepted, clay/noted) in both files. ✅
7. **Stage plates, dotted leader, 96px action column at 43 jobs** — confirmed
   in `designer-desk-43jobs-1440.png`: all 43 rows hold alignment, no
   misalignment in the leader or the OPEN column. ✅
8. **Letterhead/colophon pair, "Prepared for Nora Ellison," no wordmark** —
   confirmed present on every client-facing page/paper; zero `PATINA`
   (caps) anywhere. ✅
9. **Legend rail as a teaching object, only its live button fixed** —
   confirmed: still three tier/specimen/rule rows, now with inert specimens.
   ✅
10. **Consequence sentence at 15px above every terminal act in every state**
    — confirmed present in client-house's default state and decision-moment's
    default/failed states (the only states with a visible terminal act in
    flow); correctly absent+replaced by the record's own prose once an act is
    taken, per A9. ✅

---

## 7. New defects at 390 / dark / other checks named in the brief

- **Layout at 390 after the money-size increase (15px `.t-money`)**: no
  overflow in any 390 capture (`horizontalOverflow:false` across the board);
  visually the larger money figures still fit their rules/columns in both
  `client-house-default-390.png` and `decision-moment-default-390.png`. No
  regression found here.
- **Legend rail after the 16px terminal label**: the fix log for
  decision-moment already caught and fixed a real regression here
  ("`scrollWidth` 1453 at 1440" before the legend specimens were made to
  wrap) — confirmed fixed in the current render, the terminal specimen
  wraps cleanly to two lines inside the 200px rail with no overflow.
- **The Desk after the paper bottom bar in dark mode**: confirmed fixed, see
  OS-06 above — no longer inverts to a bright band.
- **The doorstep h2 with `.act--inline`**: confirmed clean, see CR-01 above
  — no baseline shift, no box, one continuous Playfair sentence.

No other new defects found beyond RR-01 through RR-05.

---

## Verdicts

**`client-house.html` — needs one more pass.**
Blocking: **RR-01** (390 dock covers the signature field for well over half
its docking window — a real, user-visible regression on the one flow this
whole program exists to protect) and **RR-05** (record block renders two of
its five lines at the wrong type rank, visibly inconsistent with
decision-moment's identical content). Everything else checked — the hold
mechanics, state-scoped sentences, drawing ink, money typography, the
doorstep `.act--inline`, the story pole, the aria-disabled mechanics — is
confirmed correct and is genuinely excellent work. These two are narrow,
well-specified fixes, not a re-architecture.

**`designer-desk.html` — ready to publish**, with two low-severity,
non-blocking notes for the next sheet revision rather than this file: RR-03
(pressed selector scope) and RR-04 (facets/switcher use the scored-act look
where the sheet's own amendment names the chip look for them). Neither is
visible as a defect in any rendered state; both are literal-spec/consistency
notes. Everything gated (T01, SF-13, OS-06, PR-09, PR-12, the 43-job proof,
the dark-mode plates and bottom bar) is confirmed correct.

**`decision-moment.html` — ready to publish**, with one low-severity,
non-blocking note (RR-02: `.act--inline`'s mechanism and `color: var(--ink)`
diverge from the other two files and from the amendment's own text, though
currently invisible in every context it's actually used). This file is the
canonical hold/dock/aria-disabled implementation the other two are supposed
to match, and on the one place I could directly compare its dock logic
against client-house's (field-clearance), it is the one that got it right.

---

## Files

- Specimens reviewed: `/Users/kody/Code/patina-merged/artifacts/portal-polish-review-2026-09-08/specimens/client-house.html`, `/Users/kody/Code/patina-merged/artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html`, `/Users/kody/Code/patina-merged/artifacts/portal-polish-review-2026-09-08/specimens/decision-moment.html`
- This report: `/Users/kody/Code/patina-merged/artifacts/portal-polish-review-2026-09-08/review/03-rereview-specimens.md`
