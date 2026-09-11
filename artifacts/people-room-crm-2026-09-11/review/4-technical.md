# Technical review, round 4

Scope: SPEC.md §1, §2, §4, §6, §7, §8, §10 (seven states now), against
`specimens/people-room-1440.html` and `specimens/people-room-390.html`.
`review/3-technical.md` and `review/fix-log-r3.md` read first; every round-3
finding re-checked against the current files below, then a fresh look,
including two headless click-throughs beyond the seven hashed states to
verify a suspicion the fixed files raised.

## Gate commands (both files)

```
$ tail -1 specimens/people-room-1440.html
<!-- specimen-complete -->
$ tail -1 specimens/people-room-390.html
<!-- specimen-complete -->

$ wc -c specimens/people-room-1440.html specimens/people-room-390.html
   96079 specimens/people-room-1440.html
   97195 specimens/people-room-390.html
  193274 total
```
(Matches fix-log-r3.md's own post-fix byte counts exactly — confirms this
round is reviewing the r3 output, unedited since.)

```
$ grep -c 'box-shadow' people-room-1440.html people-room-390.html
people-room-1440.html:0
people-room-390.html:0
$ grep -c 'text-overflow' people-room-1440.html people-room-390.html
people-room-1440.html:0
people-room-390.html:0
$ grep -c 'placeholder=' people-room-1440.html people-room-390.html
people-room-1440.html:0
people-room-390.html:0
$ grep -c ' disabled' people-room-1440.html people-room-390.html
people-room-1440.html:0
people-room-390.html:0
$ grep -c 'eval(' people-room-1440.html people-room-390.html
people-room-1440.html:0
people-room-390.html:0
$ grep -c 'opacity' people-room-1440.html people-room-390.html
people-room-1440.html:0
people-room-390.html:0
```

**External hosts** (`grep -noE 'https?://[^"'"'"' )]+'`, both files): only
`fonts.googleapis.com` (preconnect ×1, stylesheet ×1) and `fonts.gstatic.com`
(preconnect ×1). No other host in either file.

**Hex literals outside the token block** (`awk 'NR>90'` then
`grep -coE '#[0-9A-Fa-f]{3,8}\b'`): `0` in both files. The token block
(lines 12–90) is the only place a hex literal appears.

**Token block**, diffed against `_tokens-reference.css` (lines 11–90 of each
specimen):
```
$ diff 1440-tokens.css _tokens-reference.css
80d79
< }
$ diff 390-tokens.css _tokens-reference.css
80d79
< }
```
Both add exactly the one instructed closing brace, nothing else.

**Class fragment**, diffed against `_people-style-fragment.html`'s
`<style>` block (its lines 9–56, 48 lines) vs. specimen lines 92–139:
```
$ diff 1440-fragment.css ref-fragment.css   # exit 0
$ diff 390-fragment.css ref-fragment.css    # exit 0
```
Byte-identical in both files.

**Heading order**: one `<h1>` per file (line 341 in 1440, line 316 in 390).
Every `<h[1-6]` occurrence in both files is `h1`, `h2`, or `h3` only (no
h4–h6 anywhere), and every h3 run follows an h2 — legal `h1 → h2 → h3`
throughout, in the static markup and every template string. Passes §7 #11.

**`role="status"` count**: exactly `1` in each file. Passes §7 #3.

**`aria-expanded`/`aria-controls` pairing**: every `aria-controls` value
resolves to a real element `id` in the same file — `authority-band` and
`told-band` (static ids, both files), plus the dynamic `seats-<slug>` /
`unfold-<slug>` / `<panelId>` ids, each confirmed defined at its own
`id="..."` template site. No orphan. `grep -c aria-expanded` returns 7
(1440) and 8 (390); the raw counts include the four template occurrences
plus JS lines that get/set the attribute at runtime (390 also has one CSS
selector `.disc[aria-expanded="true"]`) — not four separate live triggers
per file, four each, matching.

**`<a>` inside `<button>`**: a full-file scan (every `<button` up to its
matching `</button>`, checked for a nested `<a`) found zero occurrences in
either file.

**`tel:` links for every printed phone**: `tel()`/`telHref()`/`telLink()`
helpers are used at every phone-printing site found by grepping every
`.phone` reference in both files — Directory rows, person-card channels,
roster rows and unfolds, site-access call-first and key-holder lines, the
company-card routing line. One narrow exception found this round — see
**TR4-2** below (the routed-contact fallback branch in 390's
`renderCompany` would print a bare, non-tel-linked phone if ever reached,
though the current fixture never reaches it).

**State-switcher mechanics** (§4), both files, full read:
- `readHash`/`parseHash` split on `[&,]`, take the first `state-*` token,
  reject anything not in the seven-item `STATES` array (both files' arrays
  are `['state-directory','state-person','state-company','state-roster',
  'state-pick','state-add','state-access']`), default to `state-directory`.
  `nobar` honoured in both.
- Both wire `DOMContentLoaded` and an immediate call when
  `document.readyState !== 'loading'` (1440: both unconditionally, safe
  since `DOMContentLoaded` cannot re-fire; 390: an if/else on
  `readyState === 'loading'`, equivalently safe). Both also listen for
  `hashchange`.
- `postMessage` handlers in both: reject non-object `data`, reject
  non-string `state`, prefix `state-` when absent, reject anything not in
  the seven-item `STATES` array, route through `goto()`/`location.hash`,
  never `eval`, never trust another field. Identical contract.
- Switching uses the `hidden` **property** exclusively in both
  (`document.getElementById(...).hidden = (s !== state)` / `s !== h.state`);
  `style.display` never appears in this role.
- `prefers-reduced-motion` (1), `data-theme` (2), `prefers-color-scheme:
  dark` (1), `forced-colors` (1) — present once each in both files.

## Round-3 findings, re-checked

| ID | Round-3 status | Round-4 finding |
|---|---|---|
| TR3-1 (Stonehaven unreachable at 390) | major, open | **Fixed.** `DIR_FIRMS` in `people-room-390.html:678` is now `['marrow','northgate','tcdrywall','stonehaven']`, matching 1440. Confirmed on the rendered Directory-390 plate: Firms section lists all four, and `[data-open-company="stonehaven"]` opens her firm's card (re-verified this round with a live click-through). |
| TR3-2 (Add-sheet Authority note asserts a defaulted fact that doesn't exist, 390) | blocking, open | **Fixed for the default (tested) state.** `addSheetFor()` now returns `''` for an empty source authority instead of the literal `'No authority on this job.'`, and `renderAdd()` branches the note correctly: empty → "Nothing defaulted from the agreement." / "Record the authority"; non-empty → a note and act. Confirmed on `state-add-390` plate: empty field, correct note, correct act label. **But see TR4-1**: the *non-empty* branch's note text now disagrees with 1440's, a new form of the same underlying "is this note copy true and consistent" problem. |
| TR3-3 (two dead authority acts, 390) | major, open | **Fixed.** `js-authority` (Add sheet) and `js-save-authority` + `authority-band` disclosure (Person card) are both wired in `people-room-390.html`'s click delegate (lines 1424–1442), with matching `aria-expanded`/`aria-controls`/ids. Confirmed by reading the delegate and the template sites; both acts now behave like 1440's. |
| TR3-4 (kind-picker examples diverge) | minor/informational, returned for ruling | **Resolved by R-E.** `people-room-390.html`'s `ADD_EXAMPLE` (1116–1119) is now identical to 1440's `KIND_SOURCE` (1255–1257): a maker → F-20, someone else → F-27, an installer unmapped in both (confirmed: `grep -n "'an installer'"` shows neither file's source map includes it, so both fall to the blank-sheet copy). No longer a divergence. |
| CR3-1/CR-6/CR2-2 (no bring-forward/rolodex picker) | blocking, returned for ruling | **Built, per R-C.** `#state-pick` exists in both files: seventh state-bar button "Bring forward" between "Project roster" and "Add sheet", `STATES`/name maps/`paint()`/section list all carry seven entries, both hash and `postMessage` reach it. All of §5.7's acceptance strings confirmed present on both rendered plates (search value "Lindqvist", "4 of 5 from the Lindqvist kitchen selected", the five rows in spec order with the spec'd words and history lines, "What travels"/"What stays behind" panes, the exact consequence sentence, "Add four to the roster" / "Put back"). See **TR4-3** for a label-wording nit within this otherwise-solid build. |
| CR2-11/CR3-3 (paper word for lender/inspector firms) / R-A | major, returned for ruling | **Implemented for two of R-A's three named sites, on both widths.** The Directory person-row suffix and the company-card Paper region both correctly print nothing for a lender/inspector-only firm (confirmed: Ray Thao's Directory row shows exactly `ON PAPER / NOT ASKED / AWARDED`, no fourth word, on both 1440 and 390 plates — the "Not on file" word for CPED is gone). See **TR4-4** for the third named site. |
| CR-13/CR2-4 (no invoice/change-order face) | blocking, returned for ruling | **Resolved by R-B** — acceptance text amended; no build required. Confirmed no invoice/CO screen was added (`grep -c invoice` → 0/0), consistent with the ruling. |
| R-D (Dana Kowalski's seat window) | ruling issued | **Confirmed landed in both.** The embedded `FIXTURE.engagements` row for F-11/northgate reads `"to": "2027-08-13"` in both files (byte-identical fixture blocks, see below), and both the person-card and roster/pick plates print "12 Oct 2026 to 13 Aug 2027." `grep -c seatTo` / `grep -c 2027-03-13` → 0/0 in both. |

## Fresh findings, round 4

### TR4-1 — Add-sheet Authority note text disagrees between widths for every kind except the default (blocking, high confidence)

For the default "a sub" (Joe Wozniak, no authority) both files agree:
"Nothing defaulted from the agreement." / "Record the authority." But for
any kind whose source engagement carries a real authority string (e.g. "a
GC" → Tom Marrow, "Signs sub payments. Prices change orders."; "someone
else" → Ray Thao, "Passes or fails an inspection."), the note text itself
disagrees:

- `people-room-1440.html:1333`: `(a.authority ? 'Defaulted from the
  agreement.' : ...)`
- `people-room-390.html:1186-1187`: `(sheet.authority ? 'The agreement set
  this. Confirm it, or write a different one.' : ...)`

Both branches are reachable by clicking any non-default, authority-bearing
kind button on `#state-add` in either file — an ordinary interaction, not
an edge case. This is the same fact (what does the note say once a real
authority value is present) rendered two different ways depending on
width, squarely the "two widths disagree on a fact" category. It is not
new: 390's own fix-log-r3.md already flagged it under "The non-empty
Authority note" in its Deviations table, asking for a one-direction
ruling — that ruling was never applied to either file.

**Fix**: pick one wording (the orchestrator ruling already settles the
*empty*-branch text; the *non-empty*-branch text still needs a ruling) and
apply it to both files.

### TR4-2 — Company-card "Paper" region presence, and the routed-contact line's content, disagree between widths for every company besides Northgate Electric and Marrow & Sons (blocking, high confidence, visually confirmed by click-through)

`#state-company`'s default target (Northgate Electric) has a full
`documents` array in the fixture, so both widths' default `state-company`
plate agree and this passed round 3 and this round's direct checks. But
every other company in §3's fixture — Twin Cities Drywall & Plaster, Rusk
Mechanical, Halvorsen Cabinet Works, Stonehaven Tile Gallery, and twelve
more — carries only the scalar `"paper": "Current"` field, no `documents`
array. Reached via Directory → any of these firms' company card (an
ordinary click, confirmed live this round with `render.mjs --click`):

- `people-room-1440.html:965,969`: `if (noPaperHeld(co)) {...} else if
  (co.documents && co.documents.length) {...}` — **no `else`**. A company
  with neither condition true (i.e. almost every company) gets **no Paper
  region at all.**
- `people-room-390.html:953,957-960`: `if (holdsNoPaper(cid)) {...} else {
  if (docs.length) {...} else { out += '<p class="words">' +
  word(c.paper) + '</p>'; } ... }` — **always** renders a "Paper"
  region, falling back to the bare word plus a "Record a document" act
  when there is no `documents` array.

Live-rendered proof (headless click on `[data-company="tcdrywall"]` /
`[data-open-company="tcdrywall"]`, both starting from `#state-directory`):
- **1440**, Twin Cities Drywall & Plaster: regions are Crew & designations
  → Jobs. No "Paper" heading anywhere on the card.
- **390**, same firm: regions are Crew & designations → **Paper** (word
  `CURRENT` + a "Record a document" act) → Jobs.

Reproduced a second time on Stonehaven Tile Gallery (1440: Crew &
designations only, card ends there; 390: adds a "Paper" region reading
`CURRENT` + "Record a document"), confirming this is systemic, not a
one-firm fluke — it affects every company card in the fixture except
Marrow & Sons and Northgate Electric.

A narrower, related divergence in the same click-through: the "Write
Rosa Delgado" routed-contact line (Frank Bauer's blocked rule routes to
Rosa Delgado, F-14, the only `routeTo` case in the fixture) reads
differently:
- 1440 (`:951-957`) maps over **every** channel FIXTURE has for F-14 and
  `tel()`-links any phone-shaped value → rendered: "Write Rosa Delgado ·
  rosa@twincitiesdrywall.com · **(612) 555-0114**" (her Office phone is
  shown and is a live tel: link).
- 390 (`:944-947`) picks only the single **preferred** channel and, in a
  fallback with no preferred channel, would print `to.email || to.phone`
  as raw `esc()`-escaped text with **no** tel: wrapper → rendered: "Write
  Rosa Delgado · Email · rosa@twincitiesdrywall.com" (no phone at all).

Both are the same underlying fact (what does the studio see when it looks
up who to write for a blocked contact) rendered differently depending on
width.

**Fix**: give 1440 the same unconditional-fallback Paper region 390 has
(or vice versa — a ruling either way, but the two must agree), and make
the routed-contact line use the same channel-selection rule in both
files.

### TR4-3 — Two label-text divergences between widths, `#state-pick` and `#state-add` (minor, high confidence)

- The rolodex-picker's search-field visible label reads "SEARCH THE
  ROLODEX" on 1440 (`people-room-1440.html:1199`) but "WHO ARE YOU LOOKING
  FOR" on 390 (`people-room-390.html:1248`). SPEC §5.7 #3 only pins the
  field's *value* ("Lindqvist"), not a label string, so this isn't a
  missing acceptance string — but it is a visible-face wording
  disagreement between the two builds for the same control, confirmed on
  both rendered `state-pick` plates.
- A lower-visibility sibling: the Add-sheet kind-switch `role="group"`
  `aria-label` reads "What kind of person you are adding" on 1440
  (`:1310`) vs. "What kind of person you are bringing in" on 390
  (`:1165`) — screen-reader-only text, same category of divergence.

Not blocking (no acceptance string is missing and no fact is wrong), but
worth a ruling for consistency, in the same vein as round 3's TR3-4.

### TR4-4 — R-A's "Directory firm row" print site is unexercised on both widths (major, medium confidence)

R-A names three places a lender/inspector-only firm's "no paper" fact
should show: "the Directory firm row, the company suffix, and their
company card's Paper region." Two of three are confirmed correct and
visible on both widths (the Directory person-row's company suffix — Ray
Thao's and Carol Nystrom's rows print no fourth word — and the company
card's one-line Paper region, confirmed by code). The first is not: both
files' `DIR_FIRMS` array is unchanged from round 3 —
`['marrow','northgate','tcdrywall','stonehaven']` in both
(`people-room-1440.html:654`, `people-room-390.html:678`) — so neither
Great Northern Bank nor City of Minneapolis, CPED Inspections ever gets a
row in the Directory's Firms list on either file. Confirmed on both
rendered Directory plates: exactly four firm rows, on both widths, in the
same order, neither lender nor inspector firm present.

This is not a *cross-width* disagreement (both files agree with each
other), so it doesn't meet the letter of "the two widths disagree on a
fact" — flagged instead because a third of an explicit, already-issued
ruling is not actually demonstrable on the face of either specimen. If
R-A intended these two firms to appear as Directory Firms-list rows
(bare, wordless), that's still unbuilt on both files; if R-A only meant
"the suppression logic must be correct wherever such a row exists," this
is not a defect and the ruling is satisfied by the other two sites alone
— a scope question, not a technical bug, hence medium confidence rather
than high.

## Render (SPEC §9)

Round 3 reported the sandbox-disable retry did not take effect in that
session. In this session it did: the identical Mach-port bootstrap error
reproduced on a first attempt with the sandbox active, and disappeared on
retry with the sandbox explicitly disabled for the render command. Both
builders' commands were run fresh this round (not reused from `shots/`):

```
$ node tools/render.mjs specimens/people-room-1440.html --out shots \
    --name people-room-1440 --widths 1440 \
    --hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access --console
✓ people-room-1440-state-directory-1440.png
✓ people-room-1440-state-person-1440.png
✓ people-room-1440-state-company-1440.png
✓ people-room-1440-state-roster-1440.png
✓ people-room-1440-state-pick-1440.png
✓ people-room-1440-state-add-1440.png
✓ people-room-1440-state-access-1440.png
Console log: people-room-1440-console.json (7 captures)

$ node tools/render.mjs specimens/people-room-390.html --out shots \
    --name people-room-390 --widths 390 \
    --hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access --console
✓ people-room-390-state-directory-390.png
✓ people-room-390-state-person-390.png
✓ people-room-390-state-company-390.png
✓ people-room-390-state-roster-390.png
✓ people-room-390-state-pick-390.png
✓ people-room-390-state-add-390.png
✓ people-room-390-state-access-390.png
Console log: people-room-390-console.json (7 captures)
```

**Both console JSONs, all 14 captures**: `"errors": []`, `"warnings": []`,
`"horizontalOverflow": false`, on every single one — the fourteen expected
filenames from §9's table, exactly.

Two additional, unrequested renders were made this round purely to verify
a code-reading suspicion (not part of the required fourteen): a
`--click '[data-company="tcdrywall"]'` / `[data-open-company="tcdrywall"]`
pair and a `stonehaven` pair, both starting from `#state-directory`. These
confirmed TR4-2 visually (screenshots described above) and are not part of
the graded render set.

## Visual review (plates in `shots/`)

Viewed all fourteen PNGs full-page, both widths, all seven states.

- **Directory** (both widths): matches §5.1 in full. Ray Thao's row shows
  exactly three words (`ON PAPER`, `NOT ASKED`, `AWARDED`) — the R-A fix
  holds on both widths. Firms list is four rows on both (Marrow & Sons,
  Northgate Electric, Twin Cities Drywall & Plaster, Stonehaven Tile
  Gallery) — see TR4-4. At 390, the disclosure-default rows (`DIR_OPEN` =
  F-11, F-18, F-12, F-15, F-27) are pre-expanded, which is not a bug: it's
  how 390 surfaces the bordered word-columns and seat lines that §5.1
  requires on the *unclicked* face for exactly those five rows, given
  §6.2 moves word columns into the unfold by default. No clipping,
  overlap, or truncation on either width.
- **Person card** (Dana Kowalski, both widths): all regions in order,
  content identical between widths, "Edit the authority" present and (per
  code, confirmed working) functional on both. No break.
- **Company card** (Northgate Electric, both widths, the tested default):
  full paper table, both acts, blocking sentence — matches on both. (Its
  systemic divergence for *other* firms is TR4-2, not visible on this
  specific default plate since Northgate has a full `documents` array.)
- **Project roster** (both widths): all bands present and correctly
  peopled, Dana's row unfolded with the held clause and all four acts,
  "Close this seat" never "Remove," Bidding/Done visually separated. No
  break.
- **Bring forward** (both widths): search value "Lindqvist," count line,
  five rows in spec order with spec'd words/history lines, ink-square
  checkboxes with no tick glyph, "What travels"/"What stays behind"
  panes, exact consequence sentence, "Add four to the roster"/"Put back."
  Label-wording nit only — TR4-3. No break.
- **Add sheet** (both widths): full field set, empty Authority field +
  "Nothing defaulted from the agreement." + "Record the authority" for
  the tested default state (TR3-2's fix holds on both plates for this
  state) — see TR4-1 for the non-default-kind divergence, not visible on
  this specific plate. No break.
- **Site access** (both widths): region order matches §6.2 exactly. No
  code digit visible anywhere. No break.

No missing-font fallback observed on any plate.

## Summary

Not clean. Two blocking findings survive this round — TR4-1 (a
previously-flagged-but-unresolved note-copy divergence) and TR4-2 (a
newly-surfaced, systemic company-card structural divergence affecting
every firm but the two the seven-state render happens to test) — plus one
major (TR4-4, a ruling only two-thirds realized) and one minor (TR4-3,
label wording). All four round-3 blocking/major findings named in this
round's re-check table (TR3-1, TR3-2, TR3-3, CR3-1/CR-6/CR2-2) are
confirmed fixed for what they specifically named; TR4-1 and TR4-2 are
not new instances of round-3's bugs but adjacent facts the round-3 fixes
didn't reach, surfaced by pushing past the seven graded hashes into the
ordinary click-throughs those states lead to.
