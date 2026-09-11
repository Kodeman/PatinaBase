# The People Room — technical review

Scope: `specimens/people-room-1440.html` (1440) and `specimens/people-room-390.html` (390) against SPEC.md §1, §2, §4, §6, §7, §8, §10.

All commands below were actually run in this session; output is pasted verbatim, not paraphrased.

---

## 1. Forbidden-string / structural grep counts (SPEC §1, §8, §10)

```
$ wc -c people-room-1440.html people-room-390.html
   78438 people-room-1440.html
   80263 people-room-390.html
  158701 total

$ grep -c 'box-shadow' people-room-1440.html people-room-390.html
0
0
$ grep -c 'text-overflow' people-room-1440.html people-room-390.html
0
0
$ grep -c 'placeholder=' people-room-1440.html people-room-390.html
0
0
$ grep -c ' disabled' people-room-1440.html people-room-390.html
0
0
$ grep -c 'eval(' people-room-1440.html people-room-390.html
0
0
$ grep -n 'http' *.html | grep -v 'fonts.googleapis.com\|fonts.gstatic.com'
(no output — no external resources beyond the two allowed font hosts)
```

`box-shadow`, `text-overflow`, `placeholder=`, ` disabled`, `eval(` all return 0 in both files. No external host other than `fonts.googleapis.com`/`fonts.gstatic.com`. **Clean.**

Structure (§1):

```
style blocks: 1 / 1   script blocks: 1 / 1
<html lang="en"> in both
h1 count: 1 / 1
```

Last line, both files, verified byte-exact with `xxd`:

```
6c3e 0a3c 212d 2d20 7370 6563 696d 656e  l>.<!-- specimen
2d63 6f6d 706c 6574 6520 2d2d 3e0a       -complete -->.
```

`tail -1` on both files prints exactly `<!-- specimen-complete -->`. **Clean.**

Forbidden vocabulary (§8 #3, #4, #1): `\bCRM\b`, `\bAI\b`, `chip`, `badge`, `pill`, `modal`, `toast`, `spinner`, `wizard`, `dashboard`, `client_rep`, `party_kind`, `sms_consent_status`, `studio_contact_id`, `project_parties`, `Lorem`, `example`, `sample`, `TBD` — **zero hits** in either file. Rendered `F-nn` ids (`>F-11<` etc.) — zero; ids only ever appear inside JS string literals (`'F-11'`), never emitted to the DOM as visible text (confirmed: `grep -o "'F-[0-9][0-9]'" | wc -l` → 24 hits, all inside quotes; `grep -o '>F-[0-9][0-9]<'` → 0 hits both files).

Caveat words (§8 #8): `specimen`/`invented` appear only in (a) a CSS source-comment (`/* ══ what this specimen adds on top ═══ */`, never rendered), (b) the state bar's `aria-label="Specimen states"` and its `.bar-line`/`.sb-line` text "People room specimen · Okonkwo residence · 20 October 2026 · invented data" (the bar is explicitly "above the page, outside it" per §4), and (c) the final HTML comment. **None inside the mocked page body.** Clean.

---

## 2. Hex literals outside the token block (§2, §8 #7)

```
$ grep -n ':root {' people-room-1440.html   → line 12
$ grep -n '^}' people-room-1440.html        → 53, 73, 90, 91
$ grep -n '#[0-9A-Fa-f]\{6\}' people-room-1440.html
```
All 34 hex-literal hits in 1440 land on lines 16–89 — inside the pasted token block (comment starts line 11, block runs to line 90/91). Identical result for 390 (hex hits on lines 16–89, block ends line 90). **No hex literal outside the token block in either file.**

---

## 3. Token block / class fragment byte-diff against the reference files (§2)

The reference `_tokens-reference.css` (79 lines) is the token block **before** the one-brace correction (4 `{` vs 3 `}`, confirmed with `grep -o '{'/'}' | wc -l`). I built `ref + one appended '}'` and diffed against each specimen's lines 11–90 (the pasted block plus the one correction):

```
$ diff (ref+brace) (1440 lines 11-90)   → IDENTICAL
$ diff (ref+brace) (390  lines 11-90)   → IDENTICAL
```

**390 is exactly byte-for-byte + one brace, nothing else.**

**1440 has one extra stray `}` immediately after the correct one** (file lines 90 and 91 both read `}`, then a blank line, then `.crm-band { ... }`). 390 at the equivalent spot has only one `}` before `.crm-band`. This is a real, confirmed deviation from §2's instruction ("append one closing brace… Nothing else changes") — see **TR-1**.

Class fragment (§2.2) diffed against `_people-style-fragment.html` lines 9–56 (48 lines):
```
$ diff frag_ref.txt 1440[93:140]  → IDENTICAL
$ diff frag_ref.txt 390[92:139]   → IDENTICAL
```
**Both class fragments are byte-for-byte identical to the reference.**

FIXTURE JSON: extracted the `const FIXTURE = {...}` block from both files (205 lines each after normalizing the `const FIXTURE = ` / `  const FIXTURE = ` prefix) and diffed — **identical** between 1440 and 390, and diffed against SPEC.md's fenced JSON block — **identical** (only difference is the trailing `;` from JS statement syntax). Both builders pasted the fixture verbatim and it agrees between widths.

---

## 4. Headings, live region, disclosure wiring (§7)

```
$ grep -n '<h[1-6]' — both files run h1 → h2 → h3 in order, one h1 each, no h4-h6, no skipped level.
```

```
$ grep -c 'role="status"' people-room-1440.html people-room-390.html
1
1
```
Exactly one live region per file (1440: `<p role="status" aria-live="polite" class="sr-only" id="say">`; 390: `<p class="announce" id="announce" role="status" aria-live="polite">`). **Clean.**

`aria-expanded` / `aria-controls` pairing — every trigger's `aria-controls` value is verified to match a real `id` in the same file:
- 1440: `seatsId='seats-'+slug(name)` → `<ul id="seats-...">`; `panelId='unfold-'+slug(name)` → `<div id="unfold-...">`; `told-band` button → `<div id="told-band">`. All three match.
- 390: same pattern (`panelId` reused for both `seats-` and `unfold-` ids depending on context) plus `told-band`. All match.

No `<a>` nested inside a `<button>` — verified two ways: (a) regex scan of every `<button…>…</button>` span in both files for a nested `<a`, zero hits; (b) a live Playwright DOM query (`button.querySelector('a')`) on the rendered `#state-directory` page for both widths, **0 buttons contain an `<a>` in either file**.

`tel:` links — every phone on the fixture is passed through a single helper (`tel()` in 1440, `telHref()` in 390) that builds `href="tel:+1..."`; confirmed 7 call sites in 1440, 4 in 390 covering every context (directory row, channel table, unfold, roster, site-access "who to call first"). Target-size check via Playwright `getBoundingClientRect()` on Dana Kowalski's directory row:

```
1440: tel link  w=116.5 h=44  at x=90,y=1305
      "1 seat" (seats-disclosure) button w=51 h=44 at x=222 → gap = 222-(90+116)=16px ≥ 8px
390:  tel link  w=117 h=44 at x=154.8,y=1387
      "Seats" disclosure button w=66 h=44 at x=284 → gap = 284-(154.8+117)=12px ≥ 8px
```
Both controls ≥44×44 and ≥8px apart, and are two separate sibling elements (never nested). **Clean** — matches §7 #6.

Decorative SVG chevrons carry `aria-hidden="true"` in both files (confirmed by source). No `<img>` tags in either file; 1 `<svg>` def in 1440, 2 in 390, all inline.

Focus rings: every `:focus-visible` rule in both files uses `outline: 2px solid var(--clay-ink); outline-offset: 2px` — never `border`. `forced-colors: active` block correctly repoints `outline-color` to `Highlight` and gives `.act--terminal`/`.word` a `ButtonText` border in both files.

Chip rows: `role="group"` count 7 (1440) / 6 (390) — every chip/lens/kind-switch row wrapped, each with a distinct, correct `aria-label` (`"Narrow the book"`, `"Narrow the crew by trade"`, `"Whose book you are reading"`, `"What kind of person you are adding/bringing in"`, plus the state bar's own `"Specimen states"`).

---

## 5. State switcher mechanics (§4)

Read both `<script>` blocks in full. Both implement the same contract:

- **Hash parsing**: splits on `/[&,]/`, takes the first `state-*` token, falls back to `state-directory` if absent/unknown (1440's `readHash()`; 390's `parseHash()`), and recognizes bare `nobar`.
- **On load**: both wire `DOMContentLoaded` *and* an immediate `if (document.readyState !== 'loading')` fallback, so a tool that navigates straight to a hash (no synthetic `hashchange`) still renders correctly — required by §4 and confirmed empirically by the render run below (all 6 states painted correctly from direct hash navigation, no clicks).
- **On change**: both register `window.addEventListener('hashchange', ...)`.
- **postMessage**: both register `window.addEventListener('message', ...)`, guard on `typeof data === 'object'` and `typeof s === 'string'`, prefix `state-` when the value doesn't already start with it, and check membership in a 6-item `STATES` array before acting — unknown/malformed messages are silently ignored. **No `eval` anywhere** (confirmed 0 hits above).
- **Switching**: both toggle the `hidden` **property** (`document.getElementById(s).hidden = ...`), never `style.display`. The five inactive `<section class="state" id="state-*" hidden>` blocks are literally absent from the accessibility/tab order while hidden.
- **Announce**: both call a `say()`/`announce()` helper on every state change, writing into the single `role="status"` region.

**Both files correctly implement all required switcher mechanics.**

---

## 6. Width-rule spot checks (§6)

```
1440 .crm-band override: padding: 48px 24px;   (max-width:1200px retained from §2.2)
390  .crm-band override: width:100%; max-width:none; padding:24px 16px;
```
Matches §6.1/§6.2 exactly. `.crm-table` in 390 renders as label-over-value stacks (confirmed visually — see plates section). Prose caps: `p { max-width: 65ch }` / `.consequence { max-width: 56ch }` present in 1440 (§6.1 rule); 390 also carries `.prose{max-width:65ch}` / `.consequence{max-width:56ch}` (harmless — no visible effect at 390's column width, not required, not forbidden).

Overflow: `document.documentElement.scrollWidth` vs `clientWidth` — see render console JSON below, `horizontalOverflow: false` on all 12 captures.

---

## 7. `.act` / gated-act / chip / held / field CSS vs. §2.3

Diffed the relevant declarations against the §2.3 table line by line:

- `.act` — 44×44 min, DM Mono 13px w500 caps, `.06em` tracking, no border/background, oak rule under label — **matches** in both files, byte-equivalent rules.
- `.act--secondary` — adds a second `--clay` rule via `::before` — **matches**.
- `.act--terminal` — ink ground, ink-paper text, `--radius-box`, Inter 500 16px sentence case — **matches**.
- `.act:focus-visible` — `outline: 2px solid var(--clay-ink); outline-offset: 2px` — **matches**.
- `[aria-disabled="true"] { cursor: not-allowed; color: var(--ink-faint); }` (never `opacity`) — the rule is pasted correctly in both files, **but the attribute is never actually applied to any element in either specimen** — see **TR-5**.
- Chips (`.pick` in 1440 / `.narrow` in 390) — pressed = `--rail` ground + `--ink-faint` border + `--ink` text; unpressed = `--paper` ground + `--hairline-strong` border; `--radius-box` (3px), never fully rounded — **matches** in both, same values.
- Held (`.held` in 1440, `.held`/`.row-rule--blocked` reuse in 390) — `--rail` ground, `border-left: 2px solid var(--terracotta-ink)`, `padding-left: 11px`, reason in `.t-body-sm` at full `--ink` — **matches** exactly (`padding: 12px 12px 12px 11px` in both).
- Fields (`.control`) — `--paper-doc` ground, 1px `--hairline-strong` box, 1px `--ink-faint` bottom rule, `--radius-hair` (2px), 12px padding, Inter 16/1.55 — **matches** byte-for-byte in both files.
- Reduced motion / forced colors media queries present in both (`prefers-reduced-motion: reduce` at 1440:289 / 390:280; `forced-colors: active` at 1440:294 / 390:285). Both themes defined: `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]` present in both (already verified byte-identical to the token reference above).

---

## 8. Render (SPEC §9)

**Render trap note, as instructed**: `tools/render.mjs` already had `playwrightModulePath` hard-set to `/Users/kody/Code/patina-merged/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs` (the exact fix path given in the task) — no edit was needed; the file resolved and loaded correctly at that path.

First invocation hit the documented sandbox Mach-port trap:
```
[pid=...][err] ...FATAL:base/apple/mach_port_rendezvous_mac.cc:155] Check failed: kr == KERN_SUCCESS.
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer...: Permission denied (1100)
Fatal error: browserType.launch: Target page, context or browser has been closed
```
Re-ran the same command with the sandbox disabled for that one call, per the tool notes. Both widths then rendered clean:

```
$ node tools/render.mjs specimens/people-room-1440.html --out shots --name people-room --widths 1440 --hashes state-directory,state-person,state-company,state-roster,state-add,state-access --console
✓ people-room-state-directory-1440.png
✓ people-room-state-person-1440.png
✓ people-room-state-company-1440.png
✓ people-room-state-roster-1440.png
✓ people-room-state-add-1440.png
✓ people-room-state-access-1440.png
Console log: people-room-console.json

$ node tools/render.mjs specimens/people-room-390.html --out shots --name people-room --widths 390 --hashes state-directory,state-person,state-company,state-roster,state-add,state-access --console
✓ people-room-state-directory-390.png
✓ people-room-state-person-390.png
✓ people-room-state-company-390.png
✓ people-room-state-roster-390.png
✓ people-room-state-add-390.png
✓ people-room-state-access-390.png
Console log: people-room-console.json
```

Twelve PNGs present in `shots/`, all 12 expected filenames matched exactly.

**Note on the tool itself**: `render.mjs` writes `people-room-console.json` under a name that does not vary by width, so running the 390 command after the 1440 command overwrote the 1440 console log. I re-ran 1440 a second time and saved its console output separately (`shots/people-room-console-1440.json`) before re-running 390 to restore the canonical `people-room-console.json` (390's log, matching what SPEC's exact two-command sequence would leave behind). This is a property of the shared render tool, not of either specimen file, so I am not scoring it as a specimen finding — flagging it here for visibility only.

Console JSON, 1440 (`shots/people-room-console-1440.json`):
```json
{ "captures": [
  {"file":"people-room-state-directory-1440.png","width":1440,"hash":"state-directory","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-person-1440.png","width":1440,"hash":"state-person","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-company-1440.png","width":1440,"hash":"state-company","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-roster-1440.png","width":1440,"hash":"state-roster","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-add-1440.png","width":1440,"hash":"state-add","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-access-1440.png","width":1440,"hash":"state-access","errors":[],"warnings":[],"horizontalOverflow":false}
]}
```

Console JSON, 390 (`shots/people-room-console.json`, final state on disk):
```json
{ "captures": [
  {"file":"people-room-state-directory-390.png","width":390,"hash":"state-directory","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-person-390.png","width":390,"hash":"state-person","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-company-390.png","width":390,"hash":"state-company","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-roster-390.png","width":390,"hash":"state-roster","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-add-390.png","width":390,"hash":"state-add","errors":[],"warnings":[],"horizontalOverflow":false},
  {"file":"people-room-state-access-390.png","width":390,"hash":"state-access","errors":[],"warnings":[],"horizontalOverflow":false}
]}
```

**Zero errors, zero warnings, `horizontalOverflow: false` on all twelve captures, in both runs.** Matches §9 and §10 #5.

---

## 9. Plate-by-plate visual read

Viewed all twelve PNGs in `shots/`. Content is faithful to the fixture and to §5's acceptance strings on both widths (spot-checked: head count, chip row + trade sub-chips, lens, all 11 directory rows in the specified order, Dana Kowalski's full row (rule clause, `tel:` link, 4 words, seat line), Pete Rusk/Frank Bauer/Ray Thao/Joe Wozniak special-case rows, firm rows, person card's 5 regions, company card's paper table + 4 rows + blocking sentence, roster's 6 bands in order with the correct people in each, add sheet's full field set + consequence sentence + terminal act, site access's 6 regions in the required order). No clipped text, no overlapping elements, no empty-looking region, Playfair/Inter/DM Mono all rendering (not falling back to a generic serif/sans) in every plate at both widths.

Two real defects surfaced by comparing the plates against each other and against source, detailed below (**TR-2**, **TR-3**).

---

## Findings

| # | Severity | Confidence | File | State | Claim | Fix |
|---|---|---|---|---|---|---|
| TR-1 | minor | high | `people-room-1440.html` | (static, applies to every state) | §2 says: paste the token block verbatim, then append **one** closing brace, "nothing else changes." 1440 has **two** `}` after the `--sage-ink` line (file lines 90 and 91) where 390 and the reference (+1 brace) have exactly one. Confirmed by diff: `diff (ref+one-brace) (1440 lines 11-90)` is identical, but line 91 (`}`) is extra and not present in 390's equivalent spot. Harmless in practice (Chromium/CSS silently ignores an unmatched top-level `}` — render ran with 0 errors/warnings), but it is a literal, confirmed violation of "byte for byte… nothing else changes." | Delete the stray `}` on line 91 of `people-room-1440.html` so the token block closes with exactly one appended brace, matching 390. |
| TR-2 | major | high | `people-room-390.html` | `#state-access` | The "Log who was told" inline confirm band renders **already open** on load: the button is hard-coded `aria-expanded="true"` (line 1033) and its panel `<div id="told-band" class="stack">` (line 1034) carries **no `hidden` attribute**, so the "WHO YOU TOLD, AND WHAT" field and "FILE IT" button are visible without any interaction. Confirmed both in source and in the rendered plate `shots/people-room-state-access-390.png`. 1440's equivalent (`people-room-1440.html` lines 1078–1079) is correctly collapsed: `aria-expanded="false"` and the panel carries `hidden`. SPEC §5.6 #8 calls this act "opening an inline band," implying a closed→open disclosure, and §4 requires disclosures to use the `hidden` property consistently; the two widths currently disagree on this control's initial state. | In `people-room-390.html`, initialize the "Log who was told" button to `aria-expanded="false"` and add `hidden` to `<div id="told-band">`, matching 1440's pattern (toggle logic itself is already correct and needs no change). |
| TR-3 | minor | high | `people-room-390.html` | all states except `#state-directory` | The `<h1>The People Room</h1>` and the `29 people · 22 firms` head-count (`<p id="head-count">`) sit in a persistent `<header class="room-head">` **outside** the six `<section class="state">` blocks (lines 308–316), so both remain visible on every state, not just the directory. 1440 explicitly hides the count element on non-directory states (`document.getElementById('room-count').hidden = (state !== 'state-directory')`). Confirmed in the rendered `people-room-state-person-390.png` plate, which shows "29 people · 22 firms" directly under the h1 while viewing Dana Kowalski's person card — 1440's equivalent plate does not show the count. Not explicitly forbidden by any single acceptance line, but it is a confirmed behavioral divergence between the two files that are supposed to "show identical facts," and it doesn't match 1440's own evident design intent for this element. | Give 390's `#head-count` the same per-state `hidden` toggle 1440 uses, or move the count into `#state-directory`'s own render output so it only appears there. |
| TR-4 | minor | medium | `people-room-1440.html` | `#state-company` | The "Chase the renewal" tertiary act in 390 is wired with `aria-describedby="chase-why"` pointing at the consequence sentence (`<p id="chase-why">`), giving assistive tech an explicit description. 1440's equivalent act (line 858) has no `aria-describedby` and no id on its consequence paragraph. Not required by any acceptance line (the consequence sentence is still visibly present and adjacent in the DOM in 1440), but it's an accessibility-polish inconsistency between the two files for the same act. | Optionally add `id="chase-why"` to 1440's consequence `<p>` and `aria-describedby="chase-why"` to its "Chase the renewal" button, matching 390. |
| TR-5 | minor | low | `people-room-1440.html`, `people-room-390.html` | (static — no state exercises this) | §2.3's "Gated act" rule (`[aria-disabled="true"] { cursor: not-allowed; color: var(--ink-faint); }`, never `opacity`) is pasted correctly in both files, but `aria-disabled="true"` is never actually applied to any element in either specimen (confirmed: `grep -n aria-disabled` finds only the two CSS-selector definitions, zero attribute usages). None of the six required states happens to need a blocked act, so this may be intentional, but it means the "Gated act" pattern from §2.3/§7 #4 is unexercised in both deliverables. | If a genuinely blocked act exists in the underlying design (e.g., an act gated by missing consent or an expired document), render at least one instance with `aria-disabled="true"` + `aria-describedby` so the pattern is demonstrated; otherwise no action needed. |

**Also flagged for visibility, not scored as a specimen defect**: `tools/render.mjs` names its console-log output `people-room-console.json` regardless of width, so running the SPEC's two sequential render commands (1440 then 390) causes the second run to silently overwrite the first run's console log. Both runs individually reported zero errors/warnings/overflow (see §8 above, where I preserved both), but a reviewer following SPEC §9's commands verbatim, in order, would be left with only the 390 console JSON on disk.

## Summary

`clean = false` — one **major** finding (TR-2, a real cross-width state-initialization bug) and four **minor** findings. Zero blocking findings: no wrong fact, no forbidden string, no missing acceptance string, no unreachable act, and no horizontal overflow were found in either file. Structure (§1), the pasted CSS contract (§2, with the one TR-1 exception), the state-switcher mechanics (§4), the width rules (§6), the keyboard/assistive contract (§7), the forbidden list (§8), and the render/done checklist (§10) are otherwise fully satisfied by both files.
