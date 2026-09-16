# Fix log — Direction III · B · builder as overlay (`specimens/direction-3.html`)

Fixer: fresh context, did not build the file. Sources: `specimens/SPEC.md` §1 §2 §3
§4 (III) §5 §8, `synthesis.md` §3 B / §5, `review/01a-specimens-technical.md`,
`review/01b-specimens-design.md`, plus the orchestrator's five rulings.

File before: 51,132 B · after: **53,536 B** (cap 120 KB). Last line
`<!-- specimen-complete -->` intact. Shared block untouched — still byte-identical
to `direction-2.html`.

---

## 1 · Findings addressed

| Finding | What changed | Where | Verified how |
|---|---|---|---|
| **SD-19** (P1) — the readiness region disappears at 390 with the drawer open | The page's one `role="status"` band is now **moved, not duplicated**: `#room-status-wrap` is authored in a new `#page-status-slot` above the paper and relocated by the state script into a new `#drawer-status-slot` at the drawer's head whenever `(max-width: 767px)` matches **and** the state is not `resting`; it returns to the page slot on close, on `Esc`, and on a width change (`matchMedia` `change` listener). Ruling 2. | new `#page-status-slot` / `#drawer-status-slot`; script `placeStudio()` + `put()`, called from `apply()` and from the media-query listener | Playwright probe: `[role=status],[aria-live]` count **= 1** in every state/width; `390/clause` and `390/money` → `statusParent: drawer-status-slot, statusVisible: true`; `1440/clause|money` → `statusParent: page-status-slot, statusVisible: true` (ruling 2's "remains on the paper beside the open drawer"); after `Esc` → back to `page-status-slot`. Read `direction-3-clause-390.png`, `-money-390.png`: `THE STUDIO` band at the drawer's head. |
| **SD-03** (P2) / **NO-4** — the Role-rates rest row sat inside `article.paper` | `#rates-rest` is out of the paper entirely. It is authored in a new `#band-rest-slot` in the studio band above the paper (resting) and relocated by the script into a new `#drawer-rest-slot` under its own Role rates outline row (clause, money); hidden in `money`, where the part is written. The paper's `<section data-part-key="patina.role_rates">` now prints **nothing** until written — the whole section is toggled, so no head, no sentence, no seam draws for an unwritten part. Ruling 1. | `#band-rest-slot`, `#drawer-rest-slot`, `#part-role-rates`; `show(id('part-role-rates'), s === 'money')` replaces `show(id('rates-printed'), …)` | Probe: `restParent` = `band-rest-slot` (resting), `drawer-rest-slot` (clause/money); `article.paper` no longer contains it at any width; `paperRatesVisible` false in resting/clause, true in money. Read `direction-3-resting-1440.png` (two studio bands above the paper, paper silent at Role rates), `-clause-1024-dark.png` (rest row under its drawer row). |
| **SD-24** (P2) — the `$` orphaned from its figure inside the drawer | Removed the `max-width: none; width: 100%` override. The drawer's money field keeps §A14's **13ch** measure and the *field* — not the value — is set to the drawer's own rule: `.drawer .field-money { display: block; width: max-content; margin-left: auto; }`. Ruling 3. | direction CSS, `.drawer .field-money` | Probe: field width **117px = 13ch** at both widths; field right edge **= `.money-rows` rule right edge** (374 = 374 at 390; 455 = 455 at 1440). Read `direction-3-money-390.png`, `-money-1440.png`: `$ 185.00` sets as one figure. |
| **ST-005** (P3) — the drawer's editor is five rows from the part it edits, with no visible tie-back | Each authored editor now names its part in a `.t-head` line above its fields (`Services`, `Role rates`), alongside the existing `aria-labelledby`. | `#fold-services`, `#fold-role-rates`; new `.editor__name` rule | Read `direction-3-clause-390.png` (`SERVICES` above the prose field), `-money-390.png` (`ROLE RATES` above `CREATES AUTHORITY`). |
| **Ruling 5** — shared-block wrapper `ST-002` | No change needed: the file already opens `/* SHARED BLOCK — BEGIN … */` and closes `/* SHARED BLOCK — END */`. | line 11 / line 290 | `head -1` / `tail -1` of the extracted block; `diff direction-2.shared.css direction-3.shared.css` → no output. |
| **Ruling 5** — typographic entities `ST-003` / `SD-17` | No change needed: every *rendered* string already uses `&rsquo;` / `&hellip;` (`client&rsquo;s`, `days&rsquo;`, `studio&rsquo;s`, `Save as template&hellip;`). The straight apostrophes the counts caught are all inside CSS/JS comments and JS string literals, which render nothing. | — | `grep -nE ">[^<]*(['\"]|…)[^<]*<"` → empty. |
| **Ruling 5** — no `autofocus` | No change needed: zero occurrences; the caret is placed by the state script's `placeCaret()` → `focus()` + `setSelectionRange()`. | — | `grep -c autofocus` → 0; probe `focus: f-services` (clause) / `rate-assistant` (money). |
| **Ruling 5** — Save record once, under the prepared-for line | No change needed: one `.record` node, in the page head under the prepared-for line; no per-fold copy. | `#record` | `grep -c 'class="t-meta record"'` → 1. |
| **Ruling 5** — no local `font-family` / `font-size` | No change needed: every `font-*` declaration after the shared block sits inside the verbatim §A14 paste. The two lines added this pass (`.editor__name`, `.drawer__return`) declare none. | — | `awk 'NR>290' \| grep -E 'font-family\|font-size'` → only §A14 lines (11px label, 16px control, 15px money, 14px reason). |
| **Ruling 5** — gaps on the module | Off-module block rhythm brought to §A4's 12 / 24 / 48 / 72: `.paper-col` padding `32px 0 64px` → `var(--module) 0 72px`; `.paper` padding `32px` → `var(--module)`; `.paper` at 390 `20px` → inherits `var(--module)` (the 390 rule is gone); `.drawer` padding-bottom `64px` → `72px` in both bands. The 16px phone gutter is kept — SPEC §4's own band number. | direction CSS | Re-render at 1440/1024/390: no overflow, no crowding; read the plates. |
| **Ruling 2** — the drawer's return act | `← Back to the paper` moved out of `.drawer__head` to the drawer's **foot** (new `.drawer__return`, shown only ≤767). `.drawer__head` (with `Close`) is hidden at ≤767 so no empty box is left behind. | `.drawer__return`, `#drawer-back` | Probe `backVisible: true` at 390 clause/money, `false` at 1440; read `direction-3-clause-390.png` (last act on the sheet). |
| **Ruling 4** — the return act at the page foot | No change needed: the `.consequence` (#36), the `.act--tertiary` (#37) and the `Press and hold to return` caption (#38) already sit at the page foot, below the paper, inside `.paper-col`'s 720px measure, at 1440 / 1024 / 390 — the quietest tier, never in the outline. | page foot | Read all three widths; `.consequence` sets at the paper's measure (4 lines at 1440), not in a column. |

## 2 · Findings declined, with reason

| Finding | Disposition |
|---|---|
| **SD-20** (P1) — no `/review\|send/i` act at 390 with the drawer open | **Declined by ruling 2.** The send act stays on the paper and does not enter the drawer; at 390 the drawer is the whole sheet, so the send act goes with the paper. Recorded here as **B's honest 390 cost**: at 390 in `clause` and `money`, §8 check 13's send-act condition does not hold for this direction, and the deck says so. The readiness sentence (SD-19) and the way back *are* carried, so the designer is never at 390 without the sentence that says what is outstanding. |
| **SD-25** (P3) — one `+ Add a part`, not one per seam | Declined. Nine seam acts inside the drawer's outline is a rewrite of B's placement model (add-then-reorder), not a fix; the reviewer's own alternative is an amendment to §5 #32. Left for the panel. |
| **SD-27** (P3) — `Edit the parts` stays rendered while the drawer is open | Declined. It is the documented focus-restore target: `Esc`/`Close` returns focus to the act that opened the drawer, and hiding that act mid-session drops focus to `<body>` (the keyboard model in §4 B). It also holds the paper's reading position, which is the point SD-28 measures. Cosmetic double-door loses to the keyboard contract. |
| **SD-28** (P3) — the paper's parts shift 34–54px when the drawer opens | Declined. The shift is the studio band's own height changing (the fee-floor note leaves, the rest row leaves, the consequence swaps six→seven parts) — reserving it means printing an empty studio band on the page, which §A10 and NO-4 both argue against. §8 check 18 still passes as SPEC scopes it. |
| **SD-29** (P3) — switching state scrolls the document | Declined. The mechanism the finding names (`autofocus`) does not exist in this file; the scroll is the SPEC-required `focus()` that places the caret (§3, `clause`/`money`). Suppressing it with `preventScroll` would put the caret off-screen, which is worse than the scroll. |
| **SD-15** (P3) — the money plate cannot show transition string #15 | Declined — out of the specimen's hands. `render.mjs` opens a fresh context per state, so a plate can only ever carry #14. The file **does** fire #15 on a live `clause → money` walk (probe: `Role rates name the fee. One thing left: name a ceiling.`). A deck caption or a fourth captured state is the fix. |
| **SD-32** (P3, all three) — page `<h1>` and paper headline both `.t-d2` | Declined for this file alone. Stepping only Direction III's headline breaks the "one room" the three specimens are diffed for; it needs a ruling applied to all three. |
| **SD-18** (P3) — meta strip reads `The drawer as an overlay` | No change. The reviewer rules the file right and the SPEC wrong (§7 bans `builder` on a specimen face). SPEC not touched, per brief. |
| **SD-01** / **ST-002**, **ST-003**, **SD-11**, **ST-006** | Nothing owed by this file — see the table above (wrapper and entities already correct; SD-11 and ST-006 are informational). |

## 3 · Amendments to record

1. **SPEC §5 #31** — `← Back to the paper` is pinned as "the drawer's first act at 390". It is now the drawer's **last** act: ruling 2 gives the drawer's head to the readiness region. Tab order inside the drawer at 390 is therefore outline rows → editor fields → `+ Add a part` → `Save as template…` → `← Back to the paper`; nothing traps.
2. **SPEC §4 B / §8 check 13** — at 390 with the drawer open, Direction III carries the readiness region and the way back but **not** the send act (ruling 2). Logged as B's cost, not as a defect to be fixed in the file.
3. **SPEC §3 / §4 B** — the readiness region has two homes and one instance; it is relocated in the DOM, never duplicated (ruling 2). The rest row for an unwritten part likewise (ruling 1): band above the paper at rest, inside the drawer under its own row while the drawer is open, and never inside `article.paper`.
4. **SPEC §3 pinned string** — the meta strip keeps `Direction III · The drawer as an overlay` (SD-18); `builder` stays off the specimen's face.

## 4 · Gate

```
render.mjs direction-3.html --widths 1440,1024,390
          --state resting=#state-resting --state clause=#state-clause --state money=#state-money --console
          (plain · --dark · --reduced-motion)          → exit 0, exit 0, exit 0
```

* **27/27 plates**, `console.json`: **0 errors, 0 warnings, `horizontalOverflow: false`** on every
  width × state × mode. (One run aborted first with a transient
  `net::ERR_TIMED_OUT` on the Google Fonts stylesheet — network, not page; the
  rerun is clean.) Chromium needs `dangerouslyDisableSandbox: true` on this box
  (`bootstrap_check_in … Permission denied`).
* **Greps** — `box-shadow|drop-shadow|--elevation-sheet` → the `:root` token
  declaration only (allowance); `#8B7355` → the `--oak` declaration only
  (allowance); `facet` → the single return-act line (allowance);
  `grep -c 'Return to the seven facets'` = 1. Empty: native `disabled`,
  `contenteditable|text-overflow|line-clamp`, sub-11px `font-size`, `opacity`
  state, `position: sticky|fixed`, `maximum-scale|user-scalable`, non-fonts
  `https://`, `autofocus`, §7's banned words (incl. `R\d+`), visible
  `chip|modal|builder|composer`.
* `<h1>` count 1 · `<html lang="en" data-state="resting">` · headings read
  `H1 H2 H3×n` with no skip in all three states · shared-block diff against
  `direction-2.html` prints nothing · **53,536 B** ≤ 120 KB · last line
  `<!-- specimen-complete -->`.
* Behaviour probe (Playwright, 1440 and 390): one live region throughout;
  status and rest row in their ruled homes per state and width; `Esc` restores
  state, both homes and focus; reorder still announces
  `Billing cadence is now part 7 of 9.`; transition string #15 fires on
  `clause → money`.
* Every plate at every width and state was read in light, and the dark and
  reduced-motion sets spot-read at 1024/390; each fix confirmed visually.
