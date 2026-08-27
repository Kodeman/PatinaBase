# DECK.md — how to author a part of *The Daily Return*

The deck is assembled from seventeen files in this directory. You own one of them. `00-head.html`
(all CSS, the sticky index, the opening `<div class="dk-page"><main>`) and `99-script.html` (the
closing tags and the inline script) are **not yours** — do not edit them, and do not add a `<style>`
or `<script>` block of your own. If you need a class that does not exist, say so in your report-back
rather than inventing one inline.

**Build:**

```bash
cd /Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26
node mock/deck-parts/build.mjs        # writes ../presentation.html
node mock/deck-parts/qa-run.cjs       # optional: six widths x three themes -> qa-light.png / qa-dark.png
```

Both need the **command sandbox off** — `sips` writes a scratch file into the system temp dir, and
headless Chromium cannot claim its mach port inside the sandbox. `build.mjs` exits non-zero on a
missing include, unbalanced `<section>`/`<figure>`, an unresolved marker, a stray `<html>`/`<body>`
tag, unbalanced CSS braces, or a page over 15.5 MB. Run it before you hand your part back.

---

## 1. The spine: a day, not a chapter number

Time of day *is* the thesis of this review, so the deck's structure is one day and the eyebrow is a
timestamp. There are no numbered section markers anywhere — a reader who sees `01 ·` in your part
will read it as a list of chapters, which is exactly the wrong shape.

Four day-parts, and the three hours are the panel's own (instruments §2): Walt opens at **07:40**,
Ruth at **12:30**, Maya at **21:10**, and everyone comes back **two weeks later**.

| Part file | `id` | Index title | `data-day` | `.hour` reads | Register |
|---|---|---|---|---|---|
| `01-cover.html` | `cover` | Cover | *(none)* | *(no `.hour` — the cover carries the day bar)* | `reg-paper` |
| `02-ask.html` | `ask` | The ask | `morning` | `07:40 · Morning` | `reg-paper` |
| `03-today.html` | `today` | The app today | `morning` | `07:40 · Morning` | **`reg-dark`** |
| `04-panel.html` | `panel` | The panel | `morning` | `07:40 · Morning` | `reg-paper` |
| `05-found.html` | `found` | What we found | `midday` | `12:30 · Midday` | **`reg-dark`** |
| `06-why-return.html` | `why-return` | Why they return | `midday` | `12:30 · Midday` | `reg-paper` |
| `07-why-buy.html` | `why-buy` | Why they buy | `midday` | `12:30 · Midday` | `reg-paper` |
| `08-planks.html` | `planks` | Shared planks | `midday` | `12:30 · Midday` | `reg-paper` |
| `09-direction-a.html` | `direction-a` | Direction A | `evening` | `21:10 · Evening` | `reg-paper` |
| `10-direction-b.html` | `direction-b` | Direction B | `evening` | `21:10 · Evening` | `reg-paper` |
| `11-purchase.html` | `purchase` | The purchase path | `evening` | `21:10 · Evening` | `reg-paper` |
| `12-compare.html` | `compare` | Compare + judges | `later` | `+14d · Two weeks later` | `reg-paper` |
| `13-recommendation.html` | `recommendation` | Recommendation | `later` | `+14d · Two weeks later` | `reg-paper` |
| `14-questions.html` | `questions` | Twelve questions | `later` | `+14d · Two weeks later` | `reg-paper` |
| `15-colophon.html` | `colophon` | Colophon | `later` | `+14d · Two weeks later` | `reg-paper` |

The index bar builds itself from `data-index-title` and groups by `data-day`. Keep the id and the
index title exactly as written above — anchors elsewhere in the deck point at them. Repeat the same
hour across every section of a day-part; that repetition is the spine doing its job, and inventing
`07:41` to vary it would be fake precision in a deck that bans exactly that.

---

## 2. The shape of a section

Every part is **one `<section>`**, opened and closed in your file, nothing outside it.

```html
<section id="why-return" class="dk-sec reg-paper" data-index-title="Why they return" data-day="midday">
  <div class="dk-wrap">
    <p class="hour"><b>12:30</b> &middot; Midday</p>

    <div class="dk-grid">
      <div class="dk-prose">
        <h2 class="dk-h2">Why anyone would open this tomorrow</h2>
        <p class="dk-lede">One sentence that earns the section.</p>
        <p class="dk-p">Body copy. Keep it inside <code>.dk-p</code> so it holds its measure.</p>
      </div>

      <div class="dk-stage">
        <!-- frames, evidence, tables, cards -->
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
  prose. `.dk-full` is a child that spans all twelve — use it for a wide table or a three-frame row.
- `.dk-prose--static` cancels the sticky prose for a section whose left column is long.
- A section can hold several `.dk-grid`s stacked, and can drop the grid entirely for a full-measure
  block (the compare table, the question cards).

Type: `.dk-h2` (section), `.dk-h3` (a turn inside it), `.dk-h4` (a mono label above a block),
`.dk-lede`, `.dk-p`, `.dk-note` (small, quiet — provenance, caveats), `.dk-ul` (hairline-dashed
list), `.dk-rule`. **Never set a `font-size`, a colour, or a margin inline.** One exception: a
`style="width:…"` on a `.dk-table` column is fine.

---

## 3. The two registers

Two visual worlds, and the difference is load-bearing: **a proposal is on paper, evidence is in a
darkroom.** A shot is a photograph of a lit screen and never sits on paper.

- **`.reg-paper`** — analysis and proposal. Warm linen ground, Playfair headlines, clay-oak accent.
- **`.reg-dark`** — evidence. A cool dark ground in *both* themes; in dark mode the warm paper and
  the cool darkroom stay distinguishable by hue.

Two sections are wholly evidence (`03-today`, `05-found`). Anywhere else, drop a band inside your
paper section:

```html
<div class="dk-band reg-dark">
  <p class="dk-h4">What the walk showed</p>
  <div class="ev-grid"> … evidence figures … </div>
</div>
```

A `.dk-band` that is a **direct child of `.dk-wrap`** bleeds out to the wrap edge and no further, so
it reads as a full band across the section. A band inside `.dk-stage` or `.dk-full` stays inside its
column instead — which is what you want when the band sits beside prose. Either way it cannot scroll
the page sideways. Both registers repoint the same `--sf-*` surface tokens, so every component below
works in either without you changing a class.

**Rule:** a phone mock is a proposal and belongs on paper. A simulator shot is evidence and belongs
in the dark. If you need them next to each other — a "today vs proposed" pair — put the mock on
paper and the shot in a `.dk-band.reg-dark` directly under it, not side by side pretending to be the
same kind of object.

---

## 4. Phone frames

The frame is drawn by `kit.css` at its native 402 × 874 (428 × 900 outer) and is **only ever
scaled** — never redrawn at another size. Read `mock/KIT.md` before you draw anything; it is the
authority on every class inside the frame, and its §5 "Do not" list applies to your part.

Screen markup goes in `mock/fragments/NAME.html` and is pulled in with a marker:

```html
<!-- include:fragments/a-m1-today-activeproject.html -->
```

Name fragments `<direction>-<mock-id>-<slug>.html` (`a-m1-today-activeproject.html`,
`b-m5c-order-placed.html`, `sp-widget-lockscreen.html`). Keep the frame markup in the fragment and
the deck chrome in your part; a fragment holds one `.frame` (or one `.frame-wrap`) and nothing else.

### One frame with its screen sheet

```html
<div class="dk-screen">
  <div class="dk-screen__stage">
    <div class="dk-frames frames-1">
      <div class="dk-frame-slot">
        <div class="dk-frame-fit"><!-- include:fragments/a-m1-today-activeproject.html --></div>
        <p class="dk-frame-cap"><b>M1</b> &middot; Today, activeProject &middot; 12:30pm</p>
      </div>
    </div>
  </div>
  <div class="dk-screen__sheet">
    <div class="dk-sheet">
      <table class="sheet-table">
        <caption>M1 &middot; screen sheet</caption>
        <tr><th>Purpose</th><td>One screen that says what moved and what is owed, in that order.</td></tr>
        <tr><th>Entry</th><td>App root; Companion &ldquo;Home&rdquo;.</td></tr>
        <tr><th>Components</th><td><code>DailyGreetingHeader</code> (existing) &middot; <code>TodayNextMoveCard</code> (existing, new branches)</td></tr>
        <tr><th>Copy</th><td>&ldquo;Leah is waiting on two things&rdquo;</td></tr>
        <tr><th>Data</th><td><code>BadgeCountService</code> &middot; <code>current_phase</code></td></tr>
        <tr><th>States</th><td>Loading, nothing-moved, empty queue, error.</td></tr>
        <tr><th>Interactions</th><td><code>today_next_move_tapped</code></td></tr>
        <tr><th>Tier</th><td>activeProject.</td></tr>
        <tr class="is-new"><th>New vs today</th><td>The moved block, the queue and phase branches, the card weights.</td></tr>
      </table>
    </div>
  </div>
</div>
```

- **The `is-new` row is mandatory** on every screen sheet and must be the last row. It is tinted and
  weighted so a reader can find what is being proposed without reading the whole table. A mock with
  nothing new says so in that row.
- `.dk-screen` is two columns at ≥1100 px (frame ~63 %, sheet ~37 %) and stacks below.
  `.dk-screen--under` forces the sheet under the frame — use it for two- and three-frame groups.
- `.sheet-table` is the kit's own table restyled in deck ink inside `.dk-sheet`; `.dk-sheet` scrolls
  it horizontally if a value is wide.

### Two or three frames

```html
<div class="dk-screen dk-screen--under">
  <div class="dk-screen__stage">
    <div class="dk-frames frames-3">
      <div class="dk-frame-slot">
        <div class="dk-frame-fit"><!-- include:fragments/a-m5a-order-sheet.html --></div>
        <p class="dk-frame-cap"><b>5a</b> &middot; Order sheet</p>
      </div>
      <div class="dk-frame-slot">
        <div class="dk-frame-fit"><!-- include:fragments/a-m5b-payment-handoff.html --></div>
        <p class="dk-frame-cap"><b>5b</b> &middot; Payment hand-off &middot; Safari, not Patina</p>
      </div>
      <div class="dk-frame-slot">
        <div class="dk-frame-fit"><!-- include:fragments/a-m5c-order-placed.html --></div>
        <p class="dk-frame-cap"><b>5c</b> &middot; Order placed</p>
      </div>
    </div>
  </div>
  <div class="dk-screen__sheet"> … one sheet covering all three … </div>
</div>
```

Set `frames-1` / `frames-2` / `frames-3` to match the number of `.dk-frame-slot`s. The CSS carries a
conservative scale per breakpoint and the script measures the column and refines it; either way the
group cannot overflow. **Three frames want `.dk-full` or `.dk-screen--under`** — do not put three in
a 7-column stage.

Light and dark phones side by side: put `data-scheme="light"` on one `.frame` and
`data-scheme="dark"` on the other (KIT.md §2). Do not use the deck's theme toggle to show a dark
screen — a reader in light mode must be able to see both.

---

## 5. Evidence: a shot, its caption, its level

```html
<figure class="ev-fig">
  <div class="ev-fig__shot">
    <img data-shot="c-03-home-top-activeproject.png" alt="Today at activeProject, four items waiting">
  </div>
  <figcaption class="ev-fig__cap">
    <b>c-03 &middot; Today, activeProject</b>
    Four items are waiting; the screen names one, and not the money.
    <span class="ev-fig__meta">
      <span class="lvl lvl--sim">sim-verified</span>
      <a class="f-chip f-chip--s0" href="#found">F30</a>
    </span>
  </figcaption>
</figure>
```

`<img data-shot="FILE.png">` is resolved at build time: the PNG in `shots/` is downscaled to 804 px
wide, re-encoded as JPEG q78 into `mock/deck-assets/`, and inlined as a base64 data URI. Your own
`alt` and `class` are kept. A bare `<!-- shot:FILE.png -->` works too and produces just the `<img>`.
**Never write a data URI or an `src` by hand, and never reference `shots/` with a relative path** —
it will not resolve in a published artifact.

Lay several out with `.ev-grid` (auto-fill, min 212 px) or `.ev-grid--wide` (min 300 px), or scroll
them in a strip with `.dk-shotstrip`.

**Every claim carries its level** (instruments §11). The chips are squared hairline boxes,
deliberately a different shape from the capsule finding chip:

| Chip | When |
|---|---|
| `<span class="lvl lvl--sim">sim-verified</span>` | a shot in `shots/` shows it |
| `<span class="lvl lvl--code">code-read</span>` | a `file:line` in the repo says it — put the path in the caption |
| `<span class="lvl lvl--inf">inferred</span>` | reasoned from the two above; say from what |

Camera, LiDAR and AR claims are **code-read only** in this program. There is no usage data: if a
number would help, write "no usage data was available to this review" instead of estimating.

---

## 6. Findings and seat quotes

**Finding chip** — a capsule, tinted by severity, `S0` … `S3` from
`research/31-verified-findings.json`. Every `F##` you print must resolve there.

```html
<p class="f-chips">
  <a class="f-chip f-chip--s0" href="#found">F30 <span>Today shows 1 of 4 pending items</span></a>
  <span class="f-chip f-chip--s1">F17</span>
  <span class="f-chip f-chip--s2">F51</span>
</p>
```

The inner `<span>` is optional and holds the finding's own title, verbatim. Severity classes are
`--s0` (brick) … `--s3` (quiet grey) and are semantic colour, separate from the deck's clay-oak
accent — do not use them for emphasis.

**Seat quote** — the panel is simulated, and the deck says so wherever a seat speaks.

```html
<blockquote class="voice">
  <p class="voice__q">Two weeks away looks exactly like two minutes away.</p>
  <p class="voice__who">
    <span class="voice__seat">H2</span>
    <span class="voice__role">Ruth, 47, Des Moines &middot; engaged a designer three months ago &middot; simulated seat</span>
  </p>
</blockquote>
```

The roster, with the role line to use:

| Seat | Role line |
|---|---|
| H1 | Maya &amp; Devon, 32/34, Grand Rapids &middot; first house, a 1950s ranch |
| H2 | Ruth, 47, Des Moines &middot; engaged a designer three months ago |
| H3 | Walt, 63, Madison &middot; downsizing to a two-bedroom condo |
| D1 | Leah, 38, Columbus &middot; solo residential designer |
| D2 | Priya, 44, Minneapolis &middot; principal of a three-person studio |
| D3 | Tom, 51, Milwaukee &middot; kitchen, bath and furnishings |
| U1 | Retention and habit design |
| U2 | Interaction, navigation and visual |
| U3 | Commerce UX |

Always append `&middot; simulated seat` to a homeowner or designer role line. Never write
"users said", "customers told us", "research shows" or any number of people. `02-ask.html` and
`15-colophon.html` each carry the standing disclosure:

```html
<div class="dk-disclosure">
  <b>What this panel is</b>
  Nine simulated seats, written by language models against a fixed task script. Quotes are
  synthesized reviews, not customer research. No usage data was available to this review.
</div>
```

---

## 7. Tables, planks, questions

**Scoreboard / compare** — always inside `.dk-tablewrap` so a wide table scrolls in its own box:

```html
<div class="dk-tablewrap">
  <table class="dk-table dk-table--score">
    <caption>Judges score separately; scores are never averaged</caption>
    <thead><tr><th>Judge</th><th>A</th><th>B</th><th>Winner</th><th>The one sentence</th></tr></thead>
    <tbody>
      <tr>
        <th class="dk-row-h">J1 &middot; Homeowner return</th>
        <td class="dk-num">30</td><td class="dk-num">32</td>
        <td class="dk-win">B</td>
        <td>A is better at not lying; B is better at not hiding.</td>
      </tr>
    </tbody>
  </table>
</div>
```

`.dk-table--compare` for the A/B compare (first column 26 %). `.dk-num` is tabular mono; `.dk-win`
marks the winner in oak. Digits line up because the tables are `tabular-nums` — keep them numbers,
not "30/40".

**Planks** — a list, not cards:

```html
<ul class="plank-list">
  <li class="plank">
    <span class="plank__id">SP-01</span>
    <div>
      <p class="plank__title">Every piece detail loads, and the error has a door</p>
      <p class="plank__why">The detail screen can dead-end with no back chevron.</p>
      <p class="f-chips plank__meta"><span class="f-chip f-chip--s0">F12</span></p>
    </div>
  </li>
</ul>
```

**Questions** — `.q-grid` of `.q-card`, each with `.q-card__n` (a mono label, e.g. `Question three`
or the ruling it belongs to), `.q-card__q` (the question in Playfair), `.q-card__why`, and an
optional `.f-chips q-card__meta`. Cards are a flat fill, a hairline and a 4 px radius: **no accent
rail, no coloured left edge** — that is not in the app and not in this deck.

**Colophon** — `.dk-kv` definition rows (`<dt>` mono label, `<dd>` value).

---

## 8. Voice

Follow `.claude/skills/patina-brand-voice/SKILL.md`. In this deck that means:

- Understatement. No exclamation marks. No "delightful", "seamless", "magical", "unlock", "elevate".
- The technology stays silent in prose. Table names, RPCs and `file:line` belong in a screen sheet,
  a `<code>` span or a `.dk-note` — not in a lede.
- The designer is the intelligence layer. When a screen does something clever, the sentence credits
  the designer, not the system.
- Say what happens: "Payment opens in Safari", not "a seamless checkout experience".
- Copy quoted from a screen is **verbatim**, in quotation marks, including its punctuation.
- Anything drawn that the app does not do today is labelled — in the `is-new` row, and in prose if
  it would otherwise read as a report.
- No emoji, anywhere, ever — not as a marker, a glyph or a bullet.

---

## 9. Budget and hygiene

- **≤ 30 000 characters of HTML per part.** Fragments are counted against the part that includes
  them. If you are over, you are writing prose that belongs in a screen sheet.
- Shots are expensive: one 804 px JPEG runs 60–140 KB, roughly 90–190 KB once base64'd. **Budget
  eight shots per part**; the whole deck warns at 12 MB and fails at 15.5 MB. Prefer one shot that
  proves the point to three that circle it.
- Reuse a shot freely — `build.mjs` encodes each PNG once and inlines the same data URI everywhere.
- Non-ASCII is fine in your markup; the build converts it to numeric character references (the
  artifact skeleton owns `<head>`, so the page cannot declare a charset). Use `&middot;`, `&mdash;`,
  `&ldquo;`/`&rdquo;` and `&#8217;` if you prefer them explicit.
- No external URLs of any kind. The CSP blocks every host except Google Fonts, which `00-head.html`
  already loads.
- `mock/fragments/_demo-frame.html` is the build's own smoke test, wired into the placeholder
  `03-today.html`. Whoever authors `03-today.html` deletes both.

---

## 10. Checklist before you hand a part back

- [ ] One `<section>`, opened and closed, with the exact `id`, `data-index-title` and `data-day` from §1.
- [ ] The `.hour` eyebrow reads the day-part's own hour; no numbered section marker anywhere.
- [ ] Register is right: proposals on paper, shots in `.reg-dark`.
- [ ] No `<style>`, no `<script>`, no inline `font-size`/`color`/`margin`.
- [ ] Every phone screen is a fragment under `mock/fragments/`, drawn to KIT.md, never rescaled by hand.
- [ ] Every mock has a screen sheet, and its last row is `class="is-new"`.
- [ ] Every shot is `data-shot="…"` or `<!-- shot:… -->`; no relative `src`, no hand-written data URI.
- [ ] Every claim carries a `.lvl` chip; camera/LiDAR/AR claims are `code-read` only.
- [ ] Every `F##` resolves in `research/31-verified-findings.json`, with the right severity class.
- [ ] Every seat quote names the seat, the role line, and `simulated seat`.
- [ ] No invented usage numbers; no figure the seed does not contain unless marked *[example]*.
- [ ] No emoji, no accent rail on a rounded card, nothing centred that the app leading-aligns.
- [ ] Under 30 000 characters; eight shots or fewer.
- [ ] `node mock/deck-parts/build.mjs` exits 0 (sandbox off), and the size line has not jumped.
