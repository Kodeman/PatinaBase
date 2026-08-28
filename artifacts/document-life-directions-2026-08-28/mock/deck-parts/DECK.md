# DECK.md — how to author a part of *The Life Review*

The deck is assembled from sixteen files in this directory. You own one of them. `00-head.html`
(all CSS, the sticky index, the opening `<div class="dk-page"><main>`) and `99-script.html` (the
closing tags and the inline script) are **not yours** — do not edit them, and do not add a `<style>`
or `<script>` block of your own. If you need a class that does not exist, say so in your report-back
rather than inventing one inline.

**Build:**

```bash
cd /Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28
node mock/deck-parts/build.mjs        # writes ../presentation.html
node mock/deck-parts/qa-run.cjs       # renders every section at 1440/390 x light/dark -> mock/deck-qa/
```

Both need the **command sandbox off** — `sips` writes a scratch file into the system temp dir, and
headless Chromium cannot claim its mach port inside the sandbox. `build.mjs` exits non-zero on a
missing part/fragment, unbalanced `<section>`/`<figure>`, an unresolved marker, a stray
`<html>`/`<body>` tag, an `<img src="img/...">` (crops are backgrounds only), a `box-shadow` or
`drop-shadow(` anywhere in the output (D4), a disallowed `https://` host, unbalanced CSS braces, or
a page over 15.5 MB. Run it before you hand your part back.

---

## 1. The spine: fourteen sections, one UI-only ask

This deck argues a **UI-only** case: three token-level directions that bring life to a portal
designers call "too flat," with every route, component, interaction, label and IA held **identical**
across today and all three directions. The spine is not a day or a chapter number — the eyebrow on
every section names **what kind of section it is**, not a time.

| Part file | `id` | Index title | Eyebrow reads | Register |
|---|---|---|---|---|
| `00-head.html` | *(chrome)* | *(not a section)* | — | — |
| `01-cover.html` | `cover` | Cover | *(no eyebrow — the cover carries the ask line)* | `reg-paper` |
| `02-ask.html` | `ask` | The ask | `THE ASK` | `reg-paper` |
| `03-today.html` | `today` | The portal today | `TODAY` | **`reg-dark`** |
| `04-found.html` | `found` | What we found | `FINDINGS` | **`reg-dark`** |
| `05-planks.html` | `planks` | Shared planks | `PLANKS` | `reg-paper` |
| `06-direction-a.html` | `direction-a` | Direction A | `DIRECTION A` | `reg-paper` |
| `07-direction-b.html` | `direction-b` | Direction B | `DIRECTION B` | `reg-paper` |
| `08-direction-c.html` | `direction-c` | Direction C | `DIRECTION C` | `reg-paper` |
| `09-strip.html` | `strip` | One column, four ways | `STRIP` | `reg-paper` |
| `10-mobile.html` | `mobile` | Three desks at 390 | `MOBILE` | `reg-paper` |
| `11-compare.html` | `compare` | Compare + scorecard | `COMPARE` | `reg-paper` |
| `12-recommendation.html` | `recommendation` | Recommendation | `RECOMMENDATION` | `reg-paper` |
| `13-questions.html` | `questions` | Questions for the team | `QUESTIONS` | `reg-paper` |
| `14-colophon.html` | `colophon` | Colophon | `COLOPHON` | `reg-paper` |
| `99-script.html` | *(chrome)* | *(not a section)* | — | — |

The index bar builds itself from `data-index-title` on `#dk-main > section`. Keep the `id` and the
index title exactly as written above — anchors elsewhere in the deck point at them. The eyebrow is
the section's own `.hour` markup, reused for its mono-label shape, not its clock meaning:

```html
<p class="hour"><b>THE ASK</b></p>
```

or, where a short qualifier helps: `<p class="hour"><b>DIRECTION A</b> &middot; Ink on Paper</p>`.

---

## 2. The shape of a section

Every part is **one `<section>`**, opened and closed in your file, nothing outside it.

```html
<section id="direction-a" class="dk-sec reg-paper" data-index-title="Direction A">
  <div class="dk-wrap">
    <p class="hour"><b>DIRECTION A</b> &middot; Ink on Paper</p>

    <div class="dk-grid">
      <div class="dk-prose">
        <h2 class="dk-h2">A real type scale, a three-weight rule system</h2>
        <p class="dk-lede">One sentence that earns the section.</p>
        <p class="dk-p">Body copy. Keep it inside <code>.dk-p</code> so it holds its measure.</p>
      </div>

      <div class="dk-stage">
        <!-- mocks, tables, ledgers -->
      </div>
    </div>
  </div>
</section>
```

- `.dk-wrap` caps the measure at 1560 px and owns the page gutter. Every child of your section goes
  inside it.
- `.dk-grid` is 12 columns: `.dk-prose` takes 1–5 and sticks to the top of the viewport while the
  stage scrolls; `.dk-stage` takes 6–12. Below 1100 px they stack and the stickiness turns off.
- `.dk-grid--flip` puts the prose on the right (8–12), `.dk-grid--even` splits 6/6 and un-sticks the
  prose. `.dk-full` is a child that spans all twelve — use it for a wide table or the strip grid.
- `.dk-two` is a plain two-column compare (not sticky) — use it for "today vs. proposed" prose.
- A section can hold several `.dk-grid`s stacked, and can drop the grid entirely for a full-measure
  block (the compare table, the question cards, the strip).

Type: `.dk-h2` (section), `.dk-h3` (a turn inside it), `.dk-h4` (a mono label above a block),
`.dk-lede`, `.dk-p`, `.dk-note` (small, quiet — provenance, caveats), `.dk-ul` (hairline-dashed
list), `.dk-rule`. **Never set a `font-size`, a colour, or a margin inline.** One exception: a
`style="width:…"` on a `.dk-table` column, or the `style="width:Wpx;height:Hpx"` a mock fragment's
own inner `<div>` carries (§4) — both are structural, not decorative.

---

## 3. The two registers

Two visual worlds, and the difference is load-bearing: **a proposal is on paper, evidence is in a
darkroom.** A shot of the live app is a photograph and never sits on paper.

- **`.reg-paper`** — analysis and proposal, including every direction mock. Warm linen ground,
  Playfair headlines, clay-oak accent.
- **`.reg-dark`** — evidence. `03-today` and `04-found` are wholly evidence; elsewhere, drop a band:

```html
<div class="dk-band reg-dark">
  <p class="dk-h4">What the measurer found</p>
  <div class="ev-grid"> … evidence figures … </div>
</div>
```

A `.dk-band` that is a **direct child of `.dk-wrap`** bleeds out to the wrap edge and no further, so
it reads as a full band across the section. A band inside `.dk-stage` or `.dk-full` stays inside its
column instead. Either way it cannot scroll the page sideways. Both registers repoint the same
`--sf-*` surface tokens, so every component below works in either without you changing a class.

**Rule:** a direction mock is a proposal and belongs on paper. A screenshot of today's app is
evidence and belongs in the dark. Never put a mock and a shot side by side pretending to be the same
kind of object — put the shot in a `.dk-band.reg-dark` under the prose that names what it shows.

---

## 4. Mocks — the CSS-built directions

Every mock is drawn in `mock/fragments/NAME.html` at its native CSS width using **kit.css classes
only** (no ad-hoc styling) and pulled into a part with a marker:

```html
<!-- FRAGMENT a-m1-desk-1440 -->
<!-- FRAGMENT sp-m4-strip-360 | col=360 -->
```

`build.mjs` resolves `mock/fragments/<name>.html`, lifts the fragment's own `<figcaption>` out so it
renders at native size below the scaled mock, and wraps the rest in a `<figure class="dk-mock">`
whose viewport is scaled to fit a 1080 px deck column (or the `col=N` override — use it for a
390 px-native mobile-desk mock or a 360 px strip cell so it is not blown up past its real size).
**Never rescale a mock by hand** — no `transform` or `zoom` in a fragment; the scaler owns that.

A fragment's own top-level shape:

```html
<section class="mock-frame patina-mock" data-screen="M1-desk-1440" data-width="1440" data-lane="a">
  <div style="width:1440px;height:1300px">
    <!-- the actual mock markup, kit.css classes only -->
  </div>
  <figcaption><b>M1</b> &middot; Desk &middot; Direction A &mdash; Ink on Paper</figcaption>
</section>
```

`data-screen` names the mock id (`M1-desk-1440`, `M4-strip-360`, `today-M4-strip-360`), `data-width`
is the CSS pixel width the inner `<div>` declares, `data-lane` is `today` / `a` / `b` / `c`.
`build.mjs` reads the inner `<div>`'s `width:…px;height:…px` to compute the scale — get that pair
right or the build fails with "no width/height found."

- **No `<img>` inside a fragment, ever.** The five product crops in `mock/img/` are inlined once as
  CSS custom properties (`--crop-heirloom-thumb`, `--crop-pendant-lamp`, …) and referenced as a
  background: `background-image:var(--crop-heirloom-thumb);background-size:cover;`. Writing
  `url(img/pendant-lamp.jpg)` is auto-rewritten to `var(--crop-pendant-lamp)` at build time; writing
  `<img src="img/pendant-lamp.jpg">` is a **fatal** build error.
- Name fragments `<lane>-<mock-id>-<slug>.html` (`a-m1-desk-1440.html`, `b-m2-doc-rich-1440.html`,
  `sp-m4-strip-360.html`), matching the twelve fragments the direction author owes per lane
  (M1 desk 1440, M2 doc-rich 1440, M4 strip 360, M5 desk 390) plus the shared `today-M4-strip-360`.
- Read `mock/KIT.md` before drawing anything — it is the authority on every primitive class, and its
  §7 "Do-not list" (no shadows, no filled buttons but the one inked leader, no badges on the drawer,
  Playfair for headings, DM Mono for labels) applies to every fragment in this deck.

---

## 5. Evidence: a shot, its caption

```html
<figure class="ev-fig">
  <div class="ev-fig__shot">
    <img data-shot="w1440-desk.png" alt="The desk at 1440, roster rows not folio cards">
  </div>
  <figcaption class="ev-fig__cap">
    <b>w1440-desk &middot; Desk, 1440px</b>
    Six live projects, every row the same tint and the same hairline rule.
    <span class="ev-fig__meta">
      <span class="lvl lvl--sim">sim-verified</span>
      <a class="f-chip f-chip--s0" href="#found">F04</a>
    </span>
  </figcaption>
</figure>
```

`<img data-shot="FILE.png">` is resolved at build time: the PNG in `shots/` is downscaled to 804 px
wide, re-encoded as JPEG q78 into `mock/deck-assets/`, and inlined as a base64 data URI. Your own
`alt` and `class` are kept. A bare `<!-- shot:FILE.png -->` works too and produces just the `<img>`.
**Never write a data URI or an `src` by hand, and never reference `shots/` with a relative path** —
it will not resolve in a published artifact.

**Every claim carries its level:**

| Chip | When |
|---|---|
| `<span class="lvl lvl--sim">sim-verified</span>` | a shot in `shots/` shows it |
| `<span class="lvl lvl--code">code-read</span>` | a `file:line` in the repo says it — put the path in the caption |
| `<span class="lvl lvl--inf">inferred</span>` | reasoned from the two above; say from what |

There is no usage data behind this deck. If a number would help and the seed/measurer does not have
it, write "no usage data was available to this review" instead of estimating.

---

## 6. Findings, planks and the seat's voice

**Finding chip** — a capsule, tinted by severity, from `research/31-findings.json`. Every `F##` you
print must resolve there.

```html
<p class="f-chips">
  <a class="f-chip f-chip--s0" href="#found">F04 <span>Desk ground and card sit within 1.07:1</span></a>
  <span class="f-chip f-chip--s1">F11</span>
</p>
```

**Plank** — a list, not cards:

```html
<ul class="plank-list">
  <li class="plank">
    <span class="plank__id">SP-01</span>
    <div>
      <p class="plank__title">14px body / 11px mono floors</p>
      <p class="plank__why">~1,100 of ~1,700 sized elements on Document surfaces are 8-12px.</p>
      <p class="f-chips plank__meta"><span class="f-chip f-chip--s1">F09</span></p>
    </div>
  </li>
</ul>
```

**Seat quote** — the audit is one simulated seat (a senior interior designer who uses the portal
daily), and the deck says so wherever the seat speaks:

```html
<blockquote class="voice">
  <p class="voice__q">Every row on the desk asks for the same amount of attention, so I stop giving any of them full attention.</p>
  <p class="voice__who">
    <span class="voice__seat">Audit seat</span>
    <span class="voice__role">senior interior designer, daily portal user &middot; simulated seat</span>
  </p>
</blockquote>
```

Never write "users said", "designers told us", "research shows" or any number of people. `02-ask.html`
and `14-colophon.html` each carry the standing disclosure that this is one simulated seat plus
measured numbers, not customer research, and that the desk capture used local seed data.

---

## 7. Tables

Always inside `.dk-tablewrap` so a wide table scrolls in its own box. A 3-column A/B/C compare uses
`dk-table--compare3` (first column 22%, vs. `dk-table--compare`'s 26% for a 2-column A/B):

```html
<div class="dk-tablewrap">
  <table class="dk-table dk-table--compare3">
    <caption>Never averaged — two lenses, six axes</caption>
    <thead><tr><th>Axis</th><th>A &middot; Ink on Paper</th><th>B &middot; Honest Materials</th><th>C &middot; The Dark Desk</th></tr></thead>
    <tbody>
      <tr>
        <th class="dk-row-h">Contrast &amp; separation</th>
        <td class="dk-num">7</td><td class="dk-num">8</td><td class="dk-num">9</td>
      </tr>
    </tbody>
  </table>
</div>
```

`.dk-num` is tabular mono. Digits line up because the tables are `tabular-nums` — keep them numbers,
not "7/10".

**"One column, four ways"** (`09-strip.html`) lays today/A/B/C M4-strip-360 mocks side by side in
`.dk-strip-grid` (4 columns, 2 below 1100 px, 1 below 640 px) — a `.dk-full` child, not a `.dk-grid`.

---

## 8. Voice

Follow `.claude/skills/patina-brand-voice/SKILL.md`. In this deck that means, in addition to §6's
disclosure rule:

- Understatement. No exclamation marks.
- **Avoid, everywhere in this deck**: elevated, curated, luxury, bespoke, seamless, delightful — and
  their close cousins (magical, unlock, effortless). If a direction genuinely does one of these
  things, say what it does instead ("a real type scale", "three paper stocks 1.15:1 apart"), never
  the adjective.
- Every token value quoted in a direction section must match the value in `source/direction-x.md`
  (or `source/shared-planks.md`) verbatim — no rounding, no "about."
- **No invented precision.** If `source/specimen.md` marks a figure "(added for this program)", the
  deck must carry the same caveat wherever it repeats that figure; never present it as measured.
- The designer is the intelligence layer. When a mock reads more calmly, the sentence credits the
  token change, not a vague "improved experience."
- No emoji, anywhere, ever — not as a marker, a glyph or a bullet.

---

## 9. Budget and hygiene

- **≤ 30 000 characters of HTML per part.** Fragments are counted against the part that includes
  them.
- **≤ 5 fragments per part, ≤ 8 shots per part.** Reuse a shot or a fragment freely — `build.mjs`
  encodes each once and inlines the same data URI/markup everywhere it is referenced.
- Non-ASCII is fine in your markup; the build converts it to numeric character references (the
  artifact skeleton owns `<head>`, so the page cannot declare a charset). Use `&middot;`, `&mdash;`,
  `&ldquo;`/`&rdquo;` and `&#8217;` if you prefer them explicit.
- No external URLs of any kind beyond the one Google Fonts `<link>` `00-head.html` already loads.
- `mock/fragments/_smoke.html` is the build's own smoke test (Phase 0). It is not wired into any
  real part — do not reference it from your section.

---

## 10. Checklist before you hand a part back

- [ ] One `<section>`, opened and closed, with the exact `id` and `data-index-title` from §1.
- [ ] The eyebrow reads the section's own kind (`THE ASK`, `DIRECTION A`, …), never a clock time or a
      numbered marker.
- [ ] Register is right: mocks on paper, screenshots of the live app in `.reg-dark`.
- [ ] No `<style>`, no `<script>`, no inline `font-size`/`color`/`margin`.
- [ ] **0 `box-shadow`, 0 `drop-shadow(`** anywhere in your part or its fragments (D4).
- [ ] Every mock is a fragment under `mock/fragments/`, drawn to KIT.md, never rescaled by hand, no
      `<img>` inside it — crops are `background-image:var(--crop-*)`.
- [ ] Every shot is `data-shot="…"` or `<!-- shot:… -->`; no relative `src`, no hand-written data URI.
- [ ] Every claim about the live app carries a `.lvl` chip.
- [ ] Every `F##` resolves in `research/31-findings.json`, with the right severity class.
- [ ] Every token value you quote matches `source/direction-x.md` or `source/shared-planks.md`
      verbatim; every figure from `source/specimen.md` marked "(added for this program)" carries
      that caveat here too.
- [ ] No brand-voice words to avoid (§8); no invented precision.
- [ ] Under 30 000 characters; five fragments and eight shots or fewer.
- [ ] `node mock/deck-parts/build.mjs` exits 0 (sandbox off), and the size line has not jumped.
