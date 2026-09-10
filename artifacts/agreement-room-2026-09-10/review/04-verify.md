# 04 · Verify — final gate re-run (P8)

Fresh context, current files on disk, 2026-09-10. Chromium runs required
`dangerouslyDisableSandbox: true` on "mach_port_rendezvous... Permission
denied" — noted once here, not repeated per gate.

## 1 · Specimens

| gate | result | evidence |
|---|---|---|
| size ≤120 KB | **PASS** | `direction-1.html` 70,102 B · `direction-2.html` 55,685 B · `direction-3.html` 53,536 B — all ≤ 122,880 B |
| last line `<!-- specimen-complete -->` | **PASS** | `tail -n1` on all three returns exactly that string |
| one `<h1>` | **PASS** | `grep -c '<h1'` = 1 on all three |
| `lang` present | **PASS** | all three: `<html lang="en" data-state="resting">` (extra `data-state` attr is fine — `lang` is present) |
| §8 grep: `box-shadow\|drop-shadow\|--elevation-sheet` | **PASS (allowance)** | only hit on all three is the `--elevation-sheet:` custom-property declaration itself (line 50) — the documented allowance; no real `box-shadow`/`drop-shadow` |
| §8 grep: native `disabled` attr | **PASS** | 0 hits, all three |
| §8 grep: `contenteditable\|text-overflow\|line-clamp` | **PASS** | 0 hits, all three |
| §8 grep: sub-11px `font-size` | **PASS** | 0 hits, all three |
| §8 grep: state-carrying `opacity` | **PASS** | 0 hits, all three |
| §8 grep: `position: sticky\|fixed`, zoom-block meta | **PASS** | 0 hits, all three |
| §8 grep: `aged-oak\|#8B7355` | **PASS (allowance)** | only hit on all three is `--oak: #8B7355;` (line 33), the documented shared-block allowance; not used as `color` |
| §8 grep: non-fonts `https?://` | **PASS** | 0 hits, all three |
| `grep -c autofocus` = 0 | **PASS (functional), literal count differs on d2** | direction-1/3 = 0; **direction-2 = 1**, but the sole hit is inside a CSS comment (`/* ... no field carries \`autofocus\` ... */`), not an HTML attribute. Zero real `autofocus` attributes anywhere. |
| `grep -c ' disabled[ >=]'` = 0 | **PASS** | 0 hits, all three |
| §7 banned-word greps | **PASS** | 0 hits on all three |
| `Return to the seven facets` count = 1 | **PASS** | 1 on all three |
| `facet` elsewhere = empty | **PASS on d1/d3, literal FAIL on d2 — pre-existing, already adjudicated, not a defect** | d1/d3: empty (return-act button sits on the *same source line* as the consequence `<p>`, so `grep -v 'Return to the seven facets'` drops that whole line, masking the paragraph's own "facets"/"facet" words). d2: 1 hit — line 897, the pinned consequence sentence (SPEC §5 string #36), which contains "facets"/"facet" **three times by SPEC's own required copy**, byte-identical across all three files. This is `review/03-rereview-specimens-technical.md`'s documented finding — "a pre-existing self-contradiction in SPEC §5/§7 ... not a per-file defect... Not scored as a new finding" — reproduced independently here, same conclusion. |
| shared block byte-identical | **PASS** | extracted `/* SHARED BLOCK — BEGIN */`…`/* SHARED BLOCK — END */` from all three (280 lines each incl. sentinels); pairwise `diff` empty for all 3 pairs |
| render matrix (normal/dark/reduced-motion × 1440/1024/390 × resting/clause/money) | **PASS** | `render.mjs`, all 27 plates × 3 files = 81 plates, **exit 0 on every run**; per-file `console.json`: **0 errors, 0 warnings, `horizontalOverflow: false`** on every one of the 9 captures per run, all 9 runs (normal/dark/rm × 3 files) |
| visual check, 1440 + 390 light PNGs | **PASS** | reviewed all nine 1440-light plates (resting/clause/money × three specimens) plus spot 390 plates (money for d1, clause for d3): no clipped text, no overlapping elements, no empty ruled boxes, no stray notes rendered inside the paper. Reflow at 390 keeps sidebar/rail content in a full-width stack correctly; d3's drawer opens full-screen at 390 as designed. |

## 2 · Deck

| gate | result | evidence |
|---|---|---|
| `build.mjs` rebuild | **PASS** | reran; logged "complete" for D/A/B, wrote `deck/index.html`, **929,601 bytes** — identical to the pre-existing file's `wc -c` (929,601) and identical MD5 (`ffc4e9400b988675ff831d68c20f2c5f`) — build was already current |
| 3 srcdoc payloads = current specimens | **PASS** | extracted all 9 `srcdoc="..."` attribute values (3 slots × 3 sheets each for D/A/B), HTML-unescaped, compared by string equality against `specimens/direction-{1,2,3}.html` — **exact match**, all 9 |
| `<title>` in first 8 KB | **PASS** | `<title>The Paper, Under the Pencil</title>` |
| no `<!DOCTYPE`/`<html`/`<head`/`<body` | **PASS** | 0 hits |
| one `<style>` | **PASS** | exactly one, lines 5–310 |
| `body` background set | **PASS** | `body { margin:0; background: var(--paper); color: var(--ink); ... }` inside the deck's own `<style>` |
| dark tokens guarded both ways | **PASS** | within the deck's own `<style>` (5–310): `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }` **and** `:root[data-theme="dark"] {...}` both present |
| `box-shadow` count 0 | **PASS** | 0 hits whole-file (deck CSS + all embedded specimen payload text) |
| every `http` URL is a Google Fonts host | **PASS** | only `fonts.googleapis.com` and `fonts.gstatic.com` |
| 18 `section.slide`, ids `sheet-1`…`sheet-18` | **PASS** | `grep -c 'class="slide'` = 18; ids sheet-1..sheet-18 all present, in order |
| 3 `{{ARTIFACT_*}}` in sheet 18, no leftover `{{SPECIMEN_*}}` | **PASS** | `{{ARTIFACT_D}}`, `{{ARTIFACT_A}}`, `{{ARTIFACT_B}}` each appear once, inside `id="sheet-18"`; `{{SPECIMEN_*}}` = 0 hits |
| size ≤16 MB | **PASS** | 929,601 B ≪ 16,777,216 B |
| size minus payloads ≤600 KB | **PASS** | build log: 296.6 KB deck-without-payloads; independent recompute: ~300.6 KB (307,800 B). Either figure ≤ 600 KB |
| Playwright render, minimal shell, 1440/390 × light/dark | **PASS** | wrapped `deck/index.html` in the specified minimal shell, loaded via Playwright (resolved from repo-root `node_modules/.pnpm/playwright@1.58.2`, same install `portal-polish-review-2026-09-08/tools/render.mjs` uses — the designer-portal path named in the brief has no bare `playwright` package, only `@playwright/test`) |
| — console errors, deck-side vs frame-side | **PASS** | all 4 configs (1440-light, 1440-dark, 390-light, 390-dark): **deck-side 0 errors / 0 warnings; frame-side (9 iframes) 0 errors / 0 warnings** |
| — `scrollWidth <= clientWidth` on document | **PASS** | 1440: 1440/1440 · 390: 390/390, both themes |
| — 9/9 specimen frames loaded, `data-state` = sheet preset | **PASS** | all 4 configs: 9/9 frames loaded (read via Playwright's frame API against the sandboxed `srcdoc` iframes — direct `contentDocument` access from page-context JS is blocked by the opaque origin from `sandbox="allow-scripts"`, which is expected/correct isolation, not a bug); 9/9 `data-state` matched each figure's authored `data-s` preset, in all 4 configs (36/36) |
| — one width toggle + one state toggle exercised | **PASS** | on the first frame (1440-light pass): clicked the `1024` chip → iframe `style.width` became `"1024px"`; clicked the `Editing the money` chip → frame's own `document.documentElement.dataset.state` became `"money"` |
| — smallest font in a frame / in wireframe SVGs at 390, ≥11px | **PASS** | frame: **11px** (meets the floor exactly); wireframe SVG text/tspan at 390: **24px** |
| screenshot every sheet at 1440 light, review | **PASS** | captured all 18; reviewed all 18. No visible breakage. Sheets 4/9/14/16 use horizontal `.scroller` strips by design (cut columns are the intentional "Scrolls sideways →" affordance, not clipping). Long `<p class="t-meta">` captions on several sheets (5/6/7/12) run close to the slide's bottom edge in the screenshot; independently confirmed on three of them that the captured PNG height equals the live DOM element's `getBoundingClientRect().height`/`scrollHeight` to within 1–2px (e.g. sheet-16: rect height 2316.4 vs image height 2317, table row count 6/6 present) — i.e. the full element was captured and no text is actually truncated, it's just tightly set. |

## 3 · Prose budget

Independent script (JSDOM, `deck/src/index.html`): counted every `<p>`/`<figcaption>` inside `.main` per `section.slide`, excluding table cells, `blockquote`, `dl`, the sheet-18 `ul.entries` carried-items list, and text carried in descendants classed `.t-head`/`.k`/`.src`/`.grouplabel` (matching the file's own stated rule), tokenizing on whitespace and counting any token with a word character or `$`.

**Result: sheet-by-sheet and total (1,598) match the deck's own foot comment exactly, all 18 values identical, no sheet over 120.**

| gate | result |
|---|---|
| every sheet ≤120 words | **PASS** — max is sheet-13 at 119 |
| total ≤1,600 words | **PASS** — 1,598, matches the file's own claim |

## 4 · Cross-file consistency

| item | result | evidence |
|---|---|---|
| sheet 14 crux table (7 rows, D/A/B columns) | **PASS** | verbatim match to `synthesis.md` §6 prose and to `review/03-rereview-specimens-design.md` §4/§6/Round-3 crux data underlying it |
| Leah's re-walk numbers (5 rows: Today/A/B/C/D) | **PASS** | deck sheet 14 table (Today 54/18/15/17m10s/17, A 33/5/8/11m52s/3, B 41/11/13/14m17s/5, C 53/16/14/15m55s/5, D 39/6/9/12m29s/2) matches `synthesis.md` §6 table exactly, cell for cell |
| arc scores "A 7 · D 6+1 · B 4+3" | **PASS** | deck sheet 4 quotes `"A 7 PROVEN · D 6 PROVEN + 1 PARTLY · B 4 PROVEN + 3 PARTLY."` — verbatim from `review/03-rereview-specimens-design.md:156`; D's Round-3 section confirms "**6 PROVEN · 1 PARTLY**" for D specifically |
| check 13 "D 9/9 · A 9/9 · B 7/9" | **PASS** | deck sheet 14 crux row v; matches `review/03-rereview-specimens-technical.md` ST-101 ("true everywhere else, true for direction-1 and direction-2 in all 9 state×width combinations" [9/9 D, 9/9 A]; B fails at 2/9 → 7/9) |
| check 18 "947px" | **PASS** | deck sheet 12 caption and sheet 14 crux row iii both cite 947px for direction-3's drawer-open reflow at 390; matches `review/03-rereview-specimens-technical.md` ST-102's measured **-947px (390)** shift, direction-3, resting→money |
| README.md verdict lines | **PASS** | "four of seven seats rank it first... surer (2 moments of doubt) over A's faster run (3)" matches `synthesis.md` §6; Leah's-walk mini-table (Clicks/doubt row) matches the same source; the post-fix "A > D > B" / "A now proves all seven cruxes" line matches `review/03-rereview-specimens-design.md` §4–§6 (A: 7 PROVEN, all cruxes; D: 6+1; B: 4+3) |
| rulings.md AR-a…AR-h vs deck sheet 17 | **PASS (near-verbatim)** | same 8 questions, same panel leans, essentially word-for-word. One minor wording compression: AR-g on deck sheet 17 reads "of the two the synthesis offers — show a total, or say plainly none exists yet" (states both options); `rulings.md` condenses to "Of the two options the synthesis offers, say plainly none exists yet" (states only the panel's actual lean). Not a contradiction — same recommendation, tighter phrasing. |

## 5 · Program folder

`find artifacts/agreement-room-2026-09-10 -type f | sort` — 58 files. All present and accounted for:

- `shots/current/*.png` — **18 files present**, `git status --porcelain` shows the directory as untracked (`??`) — confirmed uncommitted, matching README/deck's "eighteen local renders, uncommitted."
- `shots/README.md` — present.
- Every path named in deck sheet 18's register (briefing/*, panel/*, synthesis.md + specimens/SPEC.md, specimens/direction-{1,2,3}.html, deck/src/index.html + build.mjs + index.html, all 12 review/0{1,2,3}-*.md files, shots/README.md + capture-log.json + tools/*.mjs, the 18-plate glob) — **all exist**, except `review/04-verify.md`, which the register itself lists under "REVIEW (EXPECTED)" — this file.

## Failing items

None block publish. Two items are worth carrying forward, both already identified and adjudicated in prior review passes (independently reproduced here with the same conclusion):

1. **direction-2.html's literal `grep -c autofocus` = 1**, not 0 — the sole hit is inside a CSS comment, not a real attribute. No functional issue.
2. **direction-2.html's literal §7 "facet elsewhere" grep is non-empty** (1 hit) while direction-1/direction-3 read empty for the same underlying content — an artifact of `grep -v 'Return to the seven facets'` being line-based: on d1/d3 the consequence paragraph and the return-act button happen to sit on one source line together (so the whole line, paragraph included, gets filtered out), while on d2 they're on separate lines. All three files carry byte-identical required copy (SPEC §5 string #36) that uses "facet"/"facets" three times, which is itself in tension with §7's "facet may appear exactly once" rule. `review/03-rereview-specimens-technical.md` already flags this as "a pre-existing self-contradiction in SPEC §5/§7 ... not a per-file defect ... Not scored as a new finding" — confirmed independently here.

## Verdict

**READY**
