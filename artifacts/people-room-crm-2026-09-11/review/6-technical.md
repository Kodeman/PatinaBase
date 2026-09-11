# Technical review, round 6

Scope: SPEC.md §1, §2, §4, §5.8, §6, §7, §8, §10 against `specimens/people-room-1440.html`
and `specimens/people-room-390.html` as they now stand, after `review/5-technical.md` and
`review/fix-log-r5.md`. Every round-5 finding (TR5-1..TR5-11) re-checked against the current
files by code trace, live headless render, and interaction probe; then a fresh cross-width
`innerText` diff (Playwright) across all seven graded states plus spot click-throughs to
faces the seven hashes don't reach by default (other companies, other persons); then all
fourteen light plates and three extra dark-theme plates viewed for visual breaks.

Ruled and settled — not re-litigated: every item in `rulings.md` §3 (R-A..R-U).

## Gate commands (both files)

```
$ tail -1 specimens/people-room-1440.html
<!-- specimen-complete -->
$ tail -1 specimens/people-room-390.html
<!-- specimen-complete -->

$ wc -c specimens/people-room-1440.html specimens/people-room-390.html
   97564 people-room-1440.html
  103070 people-room-390.html
  200634 total
```

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
`https://fonts.googleapis.com` (preconnect ×1, stylesheet URL ×1) and
`https://fonts.gstatic.com` (preconnect ×1). No other host in either file.

**Hex literals outside the token block** (`awk 'NR>90'` then
`grep -coE '#[0-9A-Fa-f]{3,8}\b'`): `0` in both files.

**Token block**, extracted at lines 11–90 of each file, diffed against
`_tokens-reference.css`:
```
$ diff 1440-tokens.css _tokens-reference.css
80d79
< }
$ diff 390-tokens.css _tokens-reference.css
80d79
< }
```
Both add exactly the one instructed closing brace, nothing else — byte-identical
otherwise, both files.

**Class fragment** (specimen lines 92–139 in both files, vs. `_people-style-fragment.html`
lines 9–56, 48 lines): `diff` exit 0 in all three pairings (1440 vs. reference, 390 vs.
reference, 1440 vs. 390). Byte-identical.

**Heading order**: `grep -oE '<h[1-6][ >]'` on both files returns only `<h1`, `<h2`, `<h3`
— one `<h1>` per file, never h4–h6. Passes §7 #11.

**`role="status"` count**: exactly `1` in each file. Passes §7 #3.

**`<style>`/`<script>` block count**: exactly one of each in both files (structure rule
in §1).

**`aria-expanded`/`aria-controls` pairing**: every `aria-controls` value — static
(`authority-band`, `told-band`) and template-built (`seatsId`, `panelId`) — traced to a
real `id="..."` defined at the same call site, in both files. `grep -c aria-expanded` → 7
(1440), 8 (390), matching round 5's counts; no orphan found.

**`<a>` inside `<button>`**: a regex scan of every `<button…>…</button>` span in both
files found zero nested `<a`.

**`tel:` links for every printed phone**: every `.phone`-printing call site in both files
routes through `tel()` (1440) or `telLink()`/`telHref()` (390) — traced every `.phone`
reference; none prints a bare phone string. Live-measured every truly-visible `tel:`
anchor (filtered to elements actually laid out, excluding phones sitting inside a
collapsed, not-yet-unfolded row) at both widths: 12 on `#state-directory`, 25 on
`#state-roster`, 4 on `#state-access`, all ≥44×44 in both files, 0 under. Gap from the
row's own open-control to its `tel:` link measured on the Directory's first row:
8px (1440), 12px (390) — both clear the required 8px.

**State-switcher mechanics** (§4), full read plus live probe, both files:
- `STATES` array: identical 7-item list, both files.
- Hash parsing splits on `[&,]`, takes the first `state-*` token, defaults to
  `state-directory` for anything else; `nobar` handled independently of the state token.
- Both wire `document.addEventListener('DOMContentLoaded', …)` **and** an immediate
  `if (document.readyState !== 'loading') { … }` call, so a hash present at navigation
  time (the render tool's method) is honoured even if the script parses after
  `DOMContentLoaded` has already fired. Both also listen for `hashchange`.
- `postMessage`: both reject non-object `data`, reject non-string `state`, prefix
  `state-` when absent, reject anything outside the 7-item `STATES` array, and route
  through `goto()`/`location.hash` — never `eval`.
- Switching uses the `hidden` **property** exclusively in both; `style.display` never
  appears in this role. All seven state sections are pre-rendered into the DOM at boot
  in both files (confirmed: `a[href^="tel:"]` count is constant at 64 regardless of
  which hash is active) with only the active one out of `hidden` — consistent with
  "exactly one state region is in the DOM **flow**" (§4).
- Live-clicked `#state-pick` in both files: before "4 of 5 … selected" /
  "Add four to the roster" → click the last unchecked box → "5 of 5 selected." /
  "Add five to the roster" → click "Put back" → "0 of 5 … selected" /
  "Add to the roster", `aria-disabled="true"`, `disabled` attribute absent. Identical
  sequence, identical strings, both files. Every checkbox and both acts have a live
  handler in both files (`change` listener on the checkbox inputs, a `.js-putback`
  click handler) — confirmed by code read and by the passing interaction probe above.

**`prefers-reduced-motion`**: present once each, byte-identical block (zeroes
`animation-duration`, `animation-delay`, `transition-duration`, `transition-delay` on
`*, *::before, *::after`).

**Both themes**: `data-theme` (×2) and `prefers-color-scheme: dark` (×1) present in
both files inside the pasted token block (byte-identical, confirmed by the token-block
diff above). Rendered `#state-directory` and `#state-company` at 1440 and
`#state-directory` and `#state-roster` at 390 with `--dark` — all four dark captures
clean (0 errors/warnings, no overflow) and visually correct: paper/ink/state-word
colours swap, no unstyled element, no leftover light-mode hex.

## Round-5 findings, re-checked

| ID | Round-5 finding | Round-6 status |
|---|---|---|
| TR5-1 | 390's Directory row for Frank Bauer never printed the routed-contact line | **Fixed.** `dirPersonRow()` in `people-room-390.html` now calls `clauseHtml(clausesFor(p))`, the same helper as 1440. Live dump of 390's `#state-directory`, Frank Bauer: "Do not contact directly. Write Rosa Delgado instead." then "Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114". Cross-width diff of `state-directory`: **0 differences** (216/216 tokens). |
| TR5-2 | 390's Call Sheet row for Frank Bauer never printed the routed line | **Fixed.** `rosterPersonRow()` in 390 calls the same `clauseHtml(clausesFor(p))`. Cross-width diff of `state-roster`: **0 differences** (291/291 tokens). |
| TR5-3 | 390's Bring-forward screen dropped the Call Sheet's site-access line | **Fixed.** `siteHeadLine()` shared between `renderRoster()` and `renderPick()` in 390; both widths' `#state-pick` now open "Call sheet · Okonkwo residence" then "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." — confirmed on the rendered plates and the `state-pick` diff (0 of 70). |
| TR5-4 | 1440's roster never printed Amara Osei's bid-history note | **Fixed.** `rosterPersonRow()` in 1440 now has `if (e.bid) { … }`. Amara Osei's row on `#state-roster` at 1440 reads "Quoted 2 October 2026. Selected 9 October 2026." — confirmed on the rendered plate. |
| TR5-5 | Company card: 1440 suppressed a blocked-but-unrouted contact rule (Great Northern Bank / Carol Nystrom) that 390 showed | **Fixed.** 1440's crew-line check (`people-room-1440.html:971`) is now `if (r && r.block)` with the routed line appended only `if (r.routeTo && P[r.routeTo])`, matching 390. Live click-through to Great Northern Bank's company card at 1440: "Never text. Email and phone only." now prints under Carol Nystrom. Confirmed against 390 by click-through diff (`gnbank`, 28/28 tokens, 0 differences). |
| TR5-6 | Pete Rusk's opt-out note visible unconditionally at 1440, gated behind the unfold at 390 | **Fixed via ruling R-T.** `clausesFor()` now folds an "Opted out" consent state into the always-visible clause list in both files. Pete Rusk's collapsed roster row at both widths prints "Opted out by text, 3 December 2025, on the Lindqvist kitchen." — visible on both roster plates without unfolding. |
| TR5-7 | Roster disclosure-trigger wording disagreed ("More" vs. "Unfold") | **Fixed.** 390's trigger now reads "More", `aria-label="More about <name>"` (`people-room-390.html:1097`), matching 1440. |
| TR5-8 | "Lens" label printed only at 1440 | **Fixed.** 390 now has `<span class="t-head">Lens</span>` ahead of the MINE/STUDIO toggle (`people-room-390.html:813`). |
| TR5-9 | Company-card "Jobs" region printed the stage word twice at 390 | **Fixed.** 390 gained `wordInline()`; the job line is now one sentence ending in the inline stage word, matching 1440 — confirmed on the rendered Northgate Electric company-card plate at 390 ("Okonkwo residence · Dana Kowalski · ON THE JOB", once). |
| TR5-10 | 390 had no `.act--inline` treatment for the two SPEC-named inline acts | **Fixed.** `.act--inline` added to 390's stylesheet and used for "Open the site access card" and "Draw 1 waiver ledger, in the money book" (`people-room-390.html:1055,1136`) — confirmed visually distinct (plain body-weight, sentence case) from the bordered tertiary acts on the same plate. |
| TR5-11 | 1440's "Chase the renewal" act had no `aria-describedby`, unlike 390's | **Fixed.** 1440's consequence paragraph now carries `id="chase-why"` and the button `aria-describedby="chase-why"` (`people-room-1440.html:998,1003`), matching 390. |

All eleven round-5 findings are closed. No regression found in any of the eleven areas
during this round's independent re-verification.

## Fresh finding, round 6

### TR6-1 — 390's person card silently drops the "Contact rule," "Access grants," and "Seats on projects" regions (header and all) for any person who lacks that fact; 1440 always renders the region with an explicit fallback sentence (blocking, high confidence)

1440's `renderPerson()` always pushes the sub-head, whatever the data:

```
people-room-1440.html:852   H.push('<p class="t-head sub-head">Contact rule</p>');
                             if (r) { … } else {
people-room-1440.html:859     H.push('<p class="t-body-sm">No contact rule on file.</p>');
                             }
people-room-1440.html:862   H.push('<p class="t-head sub-head">Access grants</p>');
                             if (g) { … } else {
people-room-1440.html:868     H.push('<p class="t-body-sm">No grant on file.</p>');
                             }
people-room-1440.html:873   H.push('<div class="card-region"><h3>Seats on projects</h3>');
                             if (e) { … } else {
people-room-1440.html:889     H.push('<p class="fact">No open seat on this project.</p>');
                             }
```

390's `renderPerson()` wraps the entire region — sub-head included — in the same `if`,
with no `else`:

```
people-room-390.html:880   if (r) {
people-room-390.html:882     out += '<p class="sub-head">Contact rule</p>'; …
                            }
people-room-390.html:891   if (g) {
people-room-390.html:892     out += '<p class="sub-head">Access grants</p>'; …
                            }
people-room-390.html:898   /* Seats */
people-room-390.html:899   if (e) {
people-room-390.html:900     out += '<div class="card-region"><h3>Seats on projects</h3>'; …
                            }
```

Live headless dump of `#state-directory` → click through to each person, both files,
confirms the divergence is real and repeats across the fixture, not a one-off:

- **F-20, Claire Bissett** (no rule, no grant, no engagement — she has no `ENG` entry):
  1440's card reads in full — Channels, then "CONTACT RULE / No contact rule on file.",
  then "ACCESS GRANTS / No grant on file.", then "SEATS ON PROJECTS / No open seat on
  this project." 390's card **ends at Channels** — nothing prints after
  "Email · claire@stonehaventile.com". Three whole regions, headers included, are
  simply absent from the page.
- **F-12, Pete Rusk** (no rule, no grant): 1440 prints "Contact rule / No contact rule
  on file." and "Access grants / No grant on file."; 390 prints neither region at all.
- **F-15, Frank Bauer** (has a rule, no grant): both files agree on the Contact rule
  region (he does have one); 1440 additionally prints "Access grants / No grant on
  file.", 390 omits the region entirely.
- **F-27, Ray Thao** (has no grant): 1440 prints "Access grants / No grant on file.";
  390 omits it.

This is not the licensed table-vs-stack header-repeat difference (that class of
difference, already accounted for on `#state-person`/`#state-company`, only repeats a
label per row — it never deletes one). Here, a reader who opens the same person's card
at 1440 learns three facts — no contact rule on file, no access grant, no open seat —
that the identical click at 390 never states at all. That is squarely "the two widths
disagree on a fact" under this round's own blocking definition, and it recurs for every
fixture person who lacks one of the three underlying facts (at minimum F-12, F-15, F-20,
F-27 confirmed directly; the same `if`-with-no-`else` shape means it will reproduce for
F-21 Marcus Hale, F-22 Sofia Ferraro and L-01 Karin Lindqvist too, none of whom carry an
engagement in `FIXTURE.engagements`). `fix-log-r5.md` §2 states 390 "gained the three
lookup maps … so the helper bodies read the same in both files," which is true of the
**wording when the region renders** — it does not cover the case where the region must
render with a fallback and 390 skips it instead.

## Cross-width `innerText` diff, all seven graded states (Playwright)

Method: one Playwright page per width at its native viewport, navigated straight to each
state hash (no clicks), `document.body.innerText` captured, split on newline/tab/middle-dot,
trimmed, lowercased, compared as multisets so a same-string reordering never counts as a
difference.

| State | 1440 tokens | 390 tokens | Differences |
|---|---|---|---|
| `state-directory` | 216 | 216 | **0** |
| `state-person` | 70 | 71 | 1 — 390 prints "Channel" one extra time (the held-email row's own repeated column label; licensed by §6.2, "Tables become label-over-value stacks") |
| `state-company` | 77 | 98 | 21 — 390 repeats the seven Paper-table headers once per document (4 documents vs. 1440's single `<thead>`); licensed by the same §6.2 clause |
| `state-roster` | 291 | 291 | **0** |
| `state-pick` | 70 | 70 | **0** |
| `state-add` | 48 | 48 | **0** |
| `state-access` | 35 | 35 | **0** |

Spot click-throughs to faces outside the seven default hashes, same method:

| Face | 1440 tokens | 390 tokens | Differences |
|---|---|---|---|
| Company: Great Northern Bank (`gnbank`) | 28 | 28 | 0 |
| Company: Twin Cities Drywall & Plaster (`tcdrywall`) | 40 | 40 | 0 |
| Company: City of Minneapolis, CPED Inspections (`cped`) | 28 | 28 | 0 |
| Company: Marrow & Sons (`marrow`) | 72 | 86 | 14 — same licensed table-header-repeat class (7 headers × 2 extra documents) |
| Person: F-15 Frank Bauer | 39 | 37 | 2 — **TR6-1** ("Access grants" / "No grant on file.") |
| Person: F-12 Pete Rusk | 42 | 38 | 4 — **TR6-1** ("Contact rule" / "No contact rule on file." / "Access grants" / "No grant on file.") |
| Person: F-27 Ray Thao | 43 | 42 | 3 only-1440 ("Consent", "Access grants", "No grant on file." — the bare "Consent" difference is the same table-header-on-empty-data artifact as `state-person`'s licensed diff, not a fact difference) + 2 only-390 ("channel" ×2, same licensed artifact) — the "Access grants"/"No grant on file." pair is **TR6-1** |
| Person: F-20 Claire Bissett | full card | Channels only | **TR6-1**, total: Contact rule, Access grants and Seats on projects all absent |

No other content difference was found at any state or face checked, graded or
click-through.

## Forbidden vocabulary and schema-word sweep

`grep -inE` for `AI` (word-boundary), `dashboard`, `wizard`, `badge`, `pill`, `chip`,
`modal`, `toast`, `spinner`, `Remove`, `StatusDot` against both raw files: **zero
matches for every term, in both files** (not even as CSS class-name artifacts — no
class is named `.chip` or similar).

`Lorem`, `sample`, `TBD`, `placeholder`: zero matches, both files. `example`: zero
matches in `people-room-1440.html`; `people-room-390.html` contains the **JS
identifier** `ADD_EXAMPLE` (a lookup table name, `people-room-390.html:1194,1211`) —
never rendered as page text, confirmed by the full innerText dumps above containing no
occurrence of the word "example" anywhere on any face. Flagged for completeness (minor,
low confidence) since §8 #1's ban is written without an explicit "on a face" scope the
way #3/#4 have, but this is a source-code identifier with no reader-visible effect, and
the rendered-face sweep is clean.

Internal ids (`F-nn`, company ids) checked for leaking into rendered text via
`grep -noE '>[^<]*F-[0-9]{2}[^<]*<'` on both files: no matches — every `F-nn` in the
file lives inside a quoted attribute or the `FIXTURE`/`P`/`RULE` JS data, never as
visible text.

No live gate/lockbox/alarm code digit found anywhere (`grep -n Lockbox`): both files
read "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa." — no digit
follows "version" other than the version number itself, which is not the code.

## Visual review

All fourteen required plates (`shots/people-room-1440-state-*-1440.png`,
`shots/people-room-390-state-*-390.png`) viewed full-page, plus three additional
dark-theme captures (`people-room-1440-state-{directory,company}-1440-dark.png`,
`people-room-390-state-{directory,roster}-390-dark.png`).

- **Directory** (both widths, light and dark): matches §5.1. Twelve person rows, six
  firm rows ending in Great Northern Bank and City of Minneapolis, CPED Inspections,
  both wordless. No clipping, overlap, or truncation.
- **Person card** (Dana Kowalski, the graded default): full parity, both widths — the
  TR6-1 gap does not show on this specific plate because F-11 carries a rule, a grant,
  and an open seat.
- **Company card** (Northgate Electric, light and dark; Great Northern Bank click-through):
  full paper table/stack, both acts, blocking sentence — matches at both widths and
  both themes.
- **Project roster**: bands present and correctly peopled at both widths; Dana's row
  unfolded with the held clause and all four acts; "Close this seat" never "Remove";
  Bidding/Done visually separated; Pete Rusk's and Frank Bauer's rows show their
  clauses unconditionally, matching. Dark-theme roster plate (390) equally clean.
- **Bring forward**: search value "Lindqvist," count line, five rows in spec order,
  checkboxes with no tick glyph, "What travels"/"What stays behind" panes, exact
  consequence sentence, "Add four to the roster"/"Put back" both live, key-held line
  present under the Call Sheet head at both widths.
- **Add sheet**: full field set at both widths, no visible break.
- **Site access**: region order matches §6.2 exactly at both widths, no code digit
  visible.

No horizontal overflow, no missing-font fallback, no visual break found on any plate,
light or dark, at either width.

## Render (SPEC §9)

Sandbox-disabled retries were required — Chromium hits a Mach-port bootstrap error
under the default sandbox; `dangerouslyDisableSandbox: true` resolved it both times.

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

**Both console JSONs, all 14 required captures**: `"errors": []`, `"warnings": []`,
`"horizontalOverflow": false`, every single one. (Two additional dark-mode captures per
file were appended afterward for the theme check above; the console.json merge logic
keeps distinct filenames, so the 14 required captures are untouched and still read
clean — confirmed by re-reading the JSON after the dark run.)

## Summary

**Not clean.** One fresh blocking finding this round: **TR6-1**, a structural content
gap on 390's person card (the "Contact rule," "Access grants," and "Seats on projects"
regions — headers included — silently vanish instead of printing 1440's explicit
fallback sentence, for any fixture person lacking that fact; demonstrated on F-12,
F-15, F-20, and F-27, and expected to reproduce on F-21, F-22, and L-01 by the same
code shape).

All eleven round-5 findings (TR5-1 through TR5-11) are confirmed fixed, independently
re-verified by code trace, live render, and interaction probe rather than by trusting
the fix log's claims — no regression found in any of them. The forbidden-vocabulary
sweep, the mechanical gates (byte markers, grep counts, token/fragment identity, hex
literals, external hosts), the switcher mechanics, both themes, and six of the seven
graded states' cross-width parity are all clean. TR6-1 surfaced the same way TR4-2 and
TR5-1/2 did in prior rounds: by clicking through to faces the seven graded hashes never
visit by default and diffing the two widths' rendered text directly, rather than relying
on the acceptance list's single named example (Dana Kowalski) to stand for every person.

<!-- review-complete -->
