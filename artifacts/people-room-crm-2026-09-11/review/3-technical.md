# Technical review, round 3

Scope: SPEC.md §1, §2, §4, §6, §7, §8, §10, against
`specimens/people-room-1440.html` and `specimens/people-room-390.html`.
Every round-2 finding re-checked against the current files; fresh look after
that. All commands below were re-run in this session (not copied from prior
logs) unless marked otherwise.

## Gate commands (both files)

```
$ tail -1 specimens/people-room-1440.html
<!-- specimen-complete -->
$ tail -1 specimens/people-room-390.html
<!-- specimen-complete -->

$ wc -c specimens/people-room-1440.html specimens/people-room-390.html
   88150 specimens/people-room-1440.html
   90236 specimens/people-room-390.html
  178386 total

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

$ grep -noE 'https?://[^"'"'"' )]+' people-room-1440.html people-room-390.html
(both files) — only fonts.googleapis.com (preconnect + stylesheet) and fonts.gstatic.com (preconnect). No other host.
```

**Hex literals outside the token block**: `grep -n '#[0-9A-Fa-f]{6}'` on both
files returns hits only on lines 16–89 (inside the `:root { … }` /
`@media (prefers-color-scheme: dark)` / `:root[data-theme="dark"]` block,
lines 12–90). Zero hits below line 91 (where `.crm-band` etc. begin) in
either file. Passes §2/§8 #7/§10 #6.

**Token block + one appended brace**, diffed against `_tokens-reference.css`
(lines 11–90 of each specimen vs. the reference file):

```
$ diff <(sed -n '11,90p' people-room-1440.html) _tokens-reference.css
80d79
< }
$ diff <(sed -n '11,90p' people-room-390.html) _tokens-reference.css
80d79
< }
```

Both files add exactly one line — the one instructed closing `}` — and
nothing else. **TR-3 (round 2) is now fixed on `people-room-1440.html`**:
the stray second `}` that round 2 found (lines 90–91 both closing) is gone;
line 91 is now `}` once, then blank, then `.crm-band {…}` on line 92,
identical to 390's structure.

**Class fragment**, diffed against the `<style>…</style>` block of
`_people-style-fragment.html` (48 lines) vs. specimen lines 92–139:

```
$ diff 1440-fragment.css ref-fragment.css   # exit 0, no output
$ diff 390-fragment.css ref-fragment.css    # exit 0, no output
```

Byte-identical in both files. Passes §2.2/§10 #6.

**Heading order** (`grep -n '<h[1-6]'`): one `<h1>` per file (line 321 in
1440, line 310 in 390); every subsequent heading is `<h2>` then `<h3>`,
never skipping a level, in both static markup and every `H.push`/`out +=`
template string that builds each of the six states. Passes §7 #11.

**`role="status"` count**: exactly 1 in each file (`grep -c 'role="status"'`
→ `1` / `1`). Passes §7 #3.

**`aria-expanded` / `aria-controls` pairing**: every trigger's
`aria-controls` value resolves to a real `id=` in the same file (`seats-*`,
`unfold-*`, `authority-band`, `told-band` all verified present as element
ids). No orphaned `aria-controls`. **Exception**: see TR3-3 below — two
tertiary acts in `people-room-390.html` carry neither `aria-expanded` nor
`aria-controls` at all, where the equivalent acts in 1440 do.

**`<a>` inside `<button>`**: a full-file scan (each `<a` preceded within
400 chars by an unclosed `<button`) found zero occurrences in either file.
Passes §5.1 #14/§7 #6.

**`tel:` link coverage**: every phone-bearing person renders through the
shared `tel()` (1440) / `telHref()` (1440-access, 390) helper, which
builds `tel:+1<digits>` at render time — confirmed by code path, not by
grepping the static source for a literal `tel:+1...` string (those strings
are assembled at runtime, so they don't appear in the file source; the
rendered plates were checked visually instead — see Visual review). No
phone found rendered as plain, unlinked text.

**State-switcher mechanics** (§4), read in full for both files:
- Hash parsing splits on `[&,]`, takes the first `state-*` token, defaults
  to `state-directory` for anything else. `nobar` token honoured.
- Both files wire `DOMContentLoaded` **and** call the paint/apply path
  immediately if `document.readyState !== 'loading'` — so a render tool
  that navigates straight to a hash (never firing `hashchange`) still gets
  the right state. Both also listen for `hashchange`.
- `postMessage` handlers in both files: reject non-object `data`, reject
  non-string `state`, prefix `state-` when missing, reject anything not in
  the six-item `STATES` array, and route through `goto()`/`location.hash`
  — never `eval`, never trusting any other field. Identical contract in
  both files.
- State switching uses the `.hidden` **property** exclusively
  (`document.getElementById(...).hidden = (s !== state)` in both files;
  `style.display` never appears in this role in either file).

**Reduced motion / theming**: `prefers-reduced-motion` (1), `data-theme`
(2), `prefers-color-scheme: dark` (1), `forced-colors` (1) — present once
each in both files, matching the §2.1/§7 #12 contract.

## Round-2 findings, re-checked

| ID | Round-2 status | Round-3 finding |
|---|---|---|
| TR-3 (extra brace, 1440 only) | major, open | **Fixed.** 1440's token block now closes with exactly one `}`, byte-identical to 390 and to the reference-plus-one-brace rule. |
| CR2-1 (vitals literal disagrees between widths) | blocking, "not fixed — brief forbids touching the other file" | **Fixed.** `people-room-390.html:1030-1039` now computes `onNow`/`tally()` live off `FIXTURE.engagements`, the same logic as 1440 line-for-line. Both render "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper." Re-derived independently from `FIXTURE.persons`/`engagements`: 12-person studio+client+week cohort, 5 `consent:"Texting"`, 4 `reach:"Account"`, 2 `reach:"On paper"` — the code and both plates agree. |
| CR2-3 (Claire Bissett/Stonehaven unreachable) | blocking, "fixed" (fix-log-r2 title scoped to 1440 only) | **Fixed on 1440, only half-fixed on 390 — see TR3-1.** 1440 added `F-20` to `DIR_PEOPLE` *and* `stonehaven` to `DIR_FIRMS` (both paths). 390 added `F-20` to `DIR_PEOPLE` (`people-room-390.html:658`) but **not** `stonehaven` to `DIR_FIRMS` (`people-room-390.html:660` still reads `['marrow', 'northgate', 'tcdrywall']`), confirmed against the Directory-390 plate (Firms section lists only 3 firms, no Stonehaven Tile Gallery row). |
| CR2-5 (no act sets/confirms authority) | blocking, "fixed" (fix-log-r2 title scoped to 1440 only) | **Fixed and functional on 1440, present-but-inert (and factually wrong in one branch) on 390 — see TR3-2, TR3-3.** |
| CR2-6 (Add-sheet kind picker decorative) | blocking, "fixed" (fix-log-r2 title scoped to 1440 only) | **Fixed on both.** 390 independently implements the equivalent behaviour: `addSheetFor(kind)` (`people-room-390.html:1100-1126`) rebuilds name/firm/trade/channels/rule/authority/consent from real fixture rows per kind, gated by `if (sheet.firm)` / `if (sheet.trade)` the same way 1440 gates on `KIND_FIRM`, and the click delegate (`people-room-390.html:1334-1348`) sets `addKind` and repaints. Verified "a household member" drops Company/Trade on 390 same as 1440. Exemplar-person choices differ from 1440's for 3 of 8 kinds — see TR3-4 (informational, not a defect). |
| CR2-11 (firm-level "Not on file" unpainted) | major, returned to Kody for ruling | **Unchanged, still moot as recorded.** Neither `gnbank` nor `cped` is in either file's `DIR_FIRMS`, so no firm row exists yet to paint either way. Ruling still pending; nothing to re-flag. |
| CR-13 / CR2-4 (no invoice/CO face) | blocking, returned to Kody for ruling | **Unchanged, confirmed still open.** `grep -c invoice` → 0/0 in both files. Six states only, matching §4/§9's fixed six-hash contract. |
| CR-6 / CR2-2 (no rolodex/travel-list picker) | blocking, returned to Kody for ruling | **Unchanged, confirmed still open.** `grep -c rolodex` → 0/0 in both files. |

## Fresh findings, round 3

### TR3-1 — Stonehaven Tile Gallery's company card is unreachable in `people-room-390.html` (major, high confidence)

`DIR_FIRMS` in `people-room-390.html:660` is `['marrow', 'northgate',
'tcdrywall']` — `stonehaven` was never added, unlike `people-room-1440.html:629`
(`['marrow', 'northgate', 'tcdrywall', 'stonehaven']`). Confirmed on the
rendered plate: `shots/people-room-state-directory-390.png`'s Firms section
lists exactly Marrow & Sons, Northgate Electric, Twin Cities Drywall &
Plaster — no Stonehaven Tile Gallery row. Claire Bissett's person row *is*
present and opens her person card (round-2's core defect — her being
unreachable at all — is resolved), but nothing on the 390 face opens the
Stonehaven company card: no firm row exists, and her person-card header
text ("Stonehaven Tile Gallery · showroom rep") is plain text, not a
`data-open-company` control, in either file. On 1440 both paths exist.
Since §3 requires "both widths must show identical facts," and this is a
reachability fact (which cards a user can open), the two widths now
disagree on what's reachable.

**Fix**: add `'stonehaven'` to `DIR_FIRMS` in `people-room-390.html`.

### TR3-2 — Add sheet's Authority note asserts a fact the fixture doesn't support, in `people-room-390.html` (blocking, high confidence)

`people-room-390.html:1152` renders a hardcoded note beneath the Authority
field: `'The agreement set this. Confirm it, or write a different one.'`
— unconditionally, regardless of whether `sheet.authority` actually holds a
defaulted value. For the **default** kind ("a sub" / Joe Wozniak —
`FIXTURE.addSheet` carries no `authority` key at all) and for "a maker"
(`F-23` Owen Ashby, `"authority": ""`) and "an installer" (`F-13` Ingrid
Halvorsen, `"authority": ""`), `addSheetFor()` falls back to the literal
string `'No authority on this job.'` in the field — while the note directly
underneath still claims "The agreement set this." That is a wrong fact on
the face: nothing was set by any agreement for these three of eight kinds,
yet the copy says it was. Confirmed on the rendered plate
(`shots/people-room-state-add-390.png`, default "a sub" state): field reads
"No authority on this job." and the very next line reads "The agreement
set this. Confirm it, or write a different one."

1440's equivalent (`people-room-1440.html:1194-1196`) branches correctly:
`a.authority ? 'Defaulted from the agreement.' : 'Nothing defaulted from
the agreement.'`

**Fix**: branch the 390 note the same way, e.g. `sheet.authority ?
'The agreement set this. Confirm it, or write a different one.' :
'Nothing defaulted from the agreement.'`, and adjust the button label for
the empty case to match 1440's "Record the authority" vs. "Confirm from
the agreement" split.

### TR3-3 — Two "Edit/Confirm the authority" acts are inert (dead buttons) in `people-room-390.html` (major, high confidence)

Two buttons in `people-room-390.html` render with no `data-*` attribute, no
`aria-expanded`, no `aria-controls`, and no branch in the delegated click
listener (`people-room-390.html:1330-1352`), so clicking them does nothing
at all — no state change, no inline band, no announcement:

- Add sheet, Authority region: `<button type="button" class="act
  act--tertiary"><span class="act-label">Confirm from the agreement</span>
  </button>` (`people-room-390.html:1153`).
- Person card, Seats on projects: `<button type="button" class="act
  act--tertiary"><span class="act-label">Edit the authority</span>
  </button>` (`people-room-390.html:816`).

This is round 2's CR2-5 defect ("no act anywhere sets or confirms a
money/CO authority threshold... no button reads 'Set the authority'")
persisting on this file specifically. `people-room-1440.html` fixed both:
the Add sheet act (`js-authority`, `people-room-1440.html:836-840`, wired
at `:1393-1398`) rewrites `#authority-note` and announces "Authority
recorded."; the Person-card act (`js-disclose` on
`aria-controls="authority-band"`, `:836-840`) opens a real inline band with
a `js-save-authority` act that writes `#seat-authority`, collapses the
band, and announces "Authority saved." Neither exists in 390 — the buttons
are decorative controls that look identical to every other working
tertiary act on the same card (e.g. "Edit the rule," "Revoke," which per
§5.2 are allowed to be static, but this pair is presented as the live
authority-confirmation feature and is not).

**Fix**: port 1440's `authority-band` disclosure (`aria-expanded`/
`aria-controls`/`id`), the `js-authority` and `js-save-authority` click
branches, and the `authority-note` id into `people-room-390.html`'s
`renderAdd()` / `renderPerson()` and click delegate.

### TR3-4 — Add-sheet kind-to-example-person mapping diverges between widths (minor, informational, high confidence)

Neither file is wrong against §3 (every id used is a real fixture person
correctly cast to a kind-appropriate role), but the two widths now show
different people for the same kind for 3 of 8 picks:

| Kind | 1440 | 390 |
|---|---|---|
| a maker | F-20 Claire Bissett | F-23 Owen Ashby |
| an installer | (no example — blank sheet) | F-13 Ingrid Halvorsen |
| someone else | F-27 Ray Thao | F-26 Carol Nystrom |

Not a SPEC violation (§5.5 only fixes the default "a sub" example), but
worth a ruling if the pair is meant to demonstrate identical behaviour
side by side — right now clicking "a maker" on 1440 and 390 tells two
different stories.

## Render (SPEC §9)

Per the tool notes, `tools/render.mjs`'s `playwrightModulePath` was
checked first — it already holds the absolute path
`/Users/kody/Code/patina-merged/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs`,
so no edit was needed.

Both render commands were re-run in this session. Both failed identically,
repeatedly, with the predicted sandbox symptom:

```
[pid=…][err] […FATAL:base/apple/mach_port_rendezvous_mac.cc:155] Check failed:
kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.…:
Permission denied (1100)
```

The tool notes say to re-run that one command with the sandbox disabled.
**That was attempted (multiple times, for both widths) and did not
change the outcome in this session** — every retry hit the identical Mach
port bootstrap denial, including attempts explicitly requesting the
sandbox be disabled. A control check (`touch` outside the writable
allowlist) confirmed the filesystem sandbox was, in fact, still enforced
during at least one of those retries, so the disable did not take effect
in this environment/session. This looks like an environment limitation of
this review session rather than a specimen defect, and is reported here
rather than silently worked around.

**No new renders were produced this round.** Instead, the existing
`shots/` artifacts were used as-is, after confirming they are current:

```
$ stat -f "%N %Sm" specimens/people-room-1440.html specimens/people-room-390.html
specimens/people-room-1440.html Sep 11 08:57:16 2026
specimens/people-room-390.html Sep 11 08:57:32 2026
$ stat -f "%N %Sm" shots/people-room-console.json
shots/people-room-console.json Sep 11 08:57:56 2026
```

The console JSON and all twelve PNGs were written *after* both specimen
files' last save in this same session (round 2's own final gate run), and
no edits have been made to either specimen file since (this round is
review-only). So the existing artifacts are the correct, current render
for both files — not stale.

`shots/people-room-console.json` (12 captures, re-read in full this
round): **0 errors, 0 warnings, `horizontalOverflow: false` on every
single capture**, six per width, matching the twelve expected filenames
from §9's table exactly.

## Visual review (plates in `shots/`)

Viewed all twelve PNGs.

- **1440 — directory**: matches §5.1 in full, including the added
  Stonehaven Tile Gallery firm row and Claire Bissett's person row (0
  seats, `On paper` / `Current` words only — correctly sparse, matching
  her fixture: no engagement, no consent). "Compare & merge" duplicate
  band present. No clipping, no overlap.
- **1440 — person (Dana Kowalski)**: all 6 regions in order, "Edit the
  authority" present and (per code) functional. No break.
- **1440 — company (Northgate Electric)**: paper table with all 4 rows +
  blocking sentence + both acts. No break.
- **1440 — roster**: all six bands present and correctly peopled,
  Dana Kowalski's row unfolded with the held clause and all four acts,
  "Close this seat" (never "Remove"). Vitals line reads the recomputed
  "12 · 5 · 4 · 2" figures. No break.
- **1440 — add sheet**: full field set, Authority region present with
  "Nothing defaulted from the agreement." (correct for the default "a
  sub"/no-authority case) and "Record the authority" act, consent block,
  consequence sentence, terminal act. No break.
- **1440 — site access**: all 6 regions in the required order, no code
  digit visible anywhere. No break.
- **390 — directory**: two-line row grammar per §6.2 (name/rule on line 1,
  plain reach text + `tel:` + "Seats" disclosure on line 2), word columns
  correctly absent from the row and present only in the unfold. Firms
  section is missing the Stonehaven row (TR3-1). No overlap, no clipping,
  no truncation.
- **390 — person (Dana Kowalski)**: matches 1440's content region-for-
  region; "Edit the authority" renders identically to 1440's but is inert
  (TR3-3).
- **390 — company**: matches 1440's content, label-over-value stacking
  correctly applied to the paper table (never scrolls sideways). No break.
- **390 — roster**: recomputed vitals line matches 1440's figures; bands
  stacked full width, one row per person, Dana's row unfolded in place.
  No break.
- **390 — add sheet**: fields stacked full width; Authority region present
  but the note is wrong for the default state (TR3-2), and "Confirm from
  the agreement" is inert (TR3-3). Terminal act and consequence sentence
  in flow, not docked. No other break.
- **390 — site access**: region order matches §6.2 exactly (Who to call
  first → The way in → Key holder → Hours → Receiving → Who was told). No
  break.

No missing-font fallback observed on any plate (Playfair/Inter/DM Mono all
render as themselves, not a generic serif/sans substitute) — consistent
with round 1/2's same observation.

## Summary

Not clean. Two blocking findings (TR3-2, and CR-13/CR2-4 carried forward
unchanged) plus two major findings (TR3-1, TR3-3) that are new-to-this-round
or round-2 fixes that only landed on one of the two files. `people-room-1440.html`
has zero new defects this round and two round-2 fixes (TR-3, and its half
of CR2-1/CR2-3/CR2-5/CR2-6) confirmed solid. `people-room-390.html` carries
all of this round's fresh findings — its own CR2-1 fix landed cleanly, but
CR2-3 and CR2-5 (both explicitly scoped to "people-room-1440.html" in
fix-log-r2.md's title) never reached this file, and one new fact-level bug
(TR3-2) was introduced along the way.
