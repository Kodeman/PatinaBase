# Technical review, round 5

Scope: SPEC.md §1, §2, §4, §6, §7, §8, §10, plus every ruling R-A..R-L and
every round-4 finding (TR4-1..TR4-4), against `specimens/people-room-1440.html`
and `specimens/people-room-390.html` as they now stand. `review/4-technical.md`
and `review/fix-log-r4.md` read first; every round-4 finding re-checked
against the current files, then a fresh full-file, both-widths, all-seven-state
sweep (code read plus live headless render/click-through) to catch anything
the graded seven hashes alone would miss.

**Process note, upfront**: `review/fix-log-r4.md` contains exactly one
heading, `specimens/people-room-1440.html` — it documents no changes to
`people-room-390.html`. But `people-room-390.html`'s mtime (09:57) and byte
count (96,079 → 99,788, +3,709 bytes) both moved this round. I could not find
a round-4 fix log for 390, so every ruling below was independently verified
against 390 by direct code reading and live rendering rather than by trusting
a fix-log claim — this is how TR5-1/2 below were caught: 1440's own fix log
already flagged the gap ("390's Frank Bauer Directory and roster rows do not
yet carry the routed line R-L requires; that is the 390 builder's item") but
no evidence exists that anyone closed it, and the live files confirm it
wasn't closed.

## Gate commands (both files)

```
$ tail -1 specimens/people-room-1440.html
<!-- specimen-complete -->
$ tail -1 specimens/people-room-390.html
<!-- specimen-complete -->

$ wc -c specimens/people-room-1440.html specimens/people-room-390.html
   97259 people-room-1440.html
   99788 people-room-390.html
  197047 total
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
`fonts.googleapis.com` (preconnect ×1, stylesheet ×1) and `fonts.gstatic.com`
(preconnect ×1). No other host in either file.

**Hex literals outside the token block** (`awk 'NR>90'` then
`grep -coE '#[0-9A-Fa-f]{3,8}\b'`): `0` in both files.

**Token block** (lines 11–90), diffed against `_tokens-reference.css`:
```
$ diff 1440-tokens.css _tokens-reference.css
80d79
< }
$ diff 390-tokens.css _tokens-reference.css
80d79
< }
```
Both add exactly the one instructed closing brace, nothing else — byte-identical otherwise, confirmed on both files this round.

**Class fragment** (specimen lines 92–139, vs. `_people-style-fragment.html`
lines 9–56, 48 lines): `diff` exit 0 both ways, in both files. Byte-identical.

**Heading order**: `grep -oE '<h[1-6][ >]'` on both files returns only
`<h1`, `<h2`, `<h3` — one `<h1>` per file (1440 line 342, 390 line 317), never
h4–h6. Passes §7 #11.

**`role="status"` count**: exactly `1` in each file (`grep -c 'role="status"'`
→ 1/1). Passes §7 #3.

**`aria-expanded`/`aria-controls` pairing**: every static and template
`aria-controls` value (`authority-band`, `told-band`, the dynamic
`panelId`/`seatsId`) resolves to a real `id="..."` defined at the same
template site, in both files — confirmed by tracing every `panelId =` /
`seatsId =` assignment to its matching `id="' + panelId + '"` (or `seatsId`)
sink. `grep -c aria-expanded` → 7 (1440), 8 (390) — matches round 4's counts,
no new orphan.

**`<a>` inside `<button>`**: a Python regex scan of every `<button…>…</button>`
span in both files found zero nested `<a`.

**`tel:` links for every printed phone**: every `.phone`-printing site in
both files routes through `tel()`/`telLink()`/`telHref()` — confirmed by
tracing every `.phone` reference. One exception, unchanged from round 4 and
now generalised: see **TR5-1/TR5-2** below — 390's Directory and roster rows
never reach the routed-contact `tel:` link for Frank Bauer's case at all,
because the line that would carry it is never printed.

**State-switcher mechanics** (§4), full read, both files:
- `readHash`/`parseHash`: split on `[&,]`, take the first `state-*` token,
  reject anything outside the seven-item `STATES` array (identical arrays,
  both files), default to `state-directory`. `nobar` detection is independent
  of the state-token loop in both, so it is honoured regardless of token
  order.
- `DOMContentLoaded` + immediate-call-if-not-loading, both files; both also
  listen for `hashchange`.
- `postMessage` handlers, both files: reject non-object `data`, reject
  non-string `state`, prefix `state-` when absent, reject anything outside
  `STATES`, route through `goto()`/`location.hash`, never `eval`.
- Switching uses the `hidden` **property** exclusively in both; `style.display`
  never appears in this role.
- `prefers-reduced-motion` (×1), `data-theme` (×2), `prefers-color-scheme:
  dark` (×1), `forced-colors` (×1) — present once each, both files, byte-
  identical content (all inside the shared token/fragment blocks or verified
  equal by direct read).
- Live-clicked in both files: ticking a `#state-pick` checkbox updates
  `#pick-count` and the terminal act's label; clicking "Put back" zeroes all
  five checkboxes, resets the count line, and sets `aria-disabled="true"` on
  the terminal act. Identical behaviour, both files (see interaction probe
  below).

## Round-4 findings, re-checked

| ID | Round-4 status | Round-5 finding |
|---|---|---|
| TR4-1 (Add-sheet Authority note text disagreed by width for non-empty authority) | blocking, open | **Fixed.** Both files now print, for any authority-bearing kind (e.g. "a GC" → Tom Marrow): `Defaulted from the agreement. Confirm it, or write a different one.` / act `Confirm from the agreement`. Verified live by clicking "a GC" in both files — text byte-identical. The empty-branch text (`Nothing defaulted from the agreement.` / `Record the authority`) is also identical, verified live on both default loads. |
| TR4-2 (Company-card Paper region missing an `else`; routed-contact line inconsistent) | blocking, open | **Fixed for the company card specifically.** Live click-through to Twin Cities Drywall & Plaster's company card on both widths: both now print `PAPER / NOT ON FILE / RECORD A DOCUMENT`. Great Northern Bank's company card: both print `PAPER / No paper is held for this firm.`, no act. The routed-contact line on *this one face* (the company card) is now identical in both: `Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114`, phone tel-linked. **But the fix did not travel to the other two faces R-L names** — see **TR5-1** and **TR5-2**, which are new instances of the same underlying gap, not yet closed. |
| TR4-3 (label wording nits: rolodex search label, kind-switch aria-label) | minor, returned for ruling | **Fixed — the orchestrator's implicit ruling (make 1440 the reference) was applied to 390 too.** Both files now read `SEARCH THE ROLODEX` (`people-room-1440.html:1220`, `people-room-390.html:1261`) and both carry `aria-label="What kind of person you are adding"` (`people-room-1440.html:1331`, `people-room-390.html:1177`). No remaining occurrence of "WHO ARE YOU LOOKING FOR" or "…bringing in" in either file. |
| TR4-4 (R-A's Directory firm row unexercised — GNB/CPED never appeared as Directory rows) | major, returned for ruling | **Fixed.** `DIR_FIRMS` is now `['marrow', 'northgate', 'tcdrywall', 'stonehaven', 'gnbank', 'cped']`, byte-identical in both files (`people-room-1440.html:672`, `people-room-390.html:687`). Both rendered Directory plates show six firm rows ending in Great Northern Bank and City of Minneapolis, CPED Inspections, both wordless (no paper word, no payee marker), confirmed live on both widths. |

## Fresh findings, round 5

### TR5-1 — 390's Directory row for Frank Bauer never prints the routed-contact line R-L and SPEC §5.1 #10 require (blocking, high confidence)

SPEC §5.1 #10 (unchanged by any ruling): Frank Bauer's row must print "no
phone printed, clause 'Do not contact directly. Write Rosa Delgado instead.'
printing Rosa Delgado's email … and her office phone as a `tel:` link."

1440's Directory row for Frank Bauer prints both the clause and the routed
line, confirmed via headless text dump of `#state-directory`:
```
Frank Bauer
Twin Cities Drywall & Plaster · drywall / plaster
Do not contact directly. Write Rosa Delgado instead.
Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114
1 SEAT
```
390's Directory row for the same person, same state, prints only the clause:
```
Frank Bauer
Twin Cities Drywall & Plaster · drywall / plaster
Do not contact directly. Write Rosa Delgado instead.
```
Code cause: `dirPersonRow()` in `people-room-390.html:708` prints only
`r.text` — `if (r) { out += '<p class="row-rule' + (r.block ? ' row-rule--blocked' : '') + '">' + esc(r.text) + '</p>'; }`
— with no companion call to `routedLine()`. 1440's equivalent
(`people-room-1440.html:695`, `clauseHtml(clausesFor(p))`, whose
`clausesFor()` at `people-room-1440.html:656-663` attaches the routed line
whenever `r.block && r.routeTo && P[r.routeTo]`) does the extra work; 390's
`dirPersonRow` has no matching path at all. A required acceptance string is
absent from one face; the two widths disagree on a fact (whether the reader
learns how to reach Rosa Delgado from Frank Bauer's Directory row).

### TR5-2 — 390's Call Sheet row for Frank Bauer never prints the same routed-contact line SPEC §5.4 #12 requires (blocking, high confidence)

Identical defect, second required site. SPEC §5.4 #12: "Frank Bauer's row
shows no phone and carries the clause … printing Rosa Delgado's email and
her office phone as a `tel:` link — the same routed-contact rule as §5.1
#10." 1440's roster row (`rosterPersonRow`, via the same `clauseHtml
(clausesFor(p))` call at `people-room-1440.html:1059`) prints the line; live
dump confirms `Write Rosa Delgado · rosa@twincitiesdrywall.com · (612)
555-0114` on `#state-roster`. 390's `rosterPersonRow`
(`people-room-390.html:1030`) again only prints `r.text` and never calls
`routedLine()`. Live dump of 390's `#state-roster` for Frank Bauer:
```
Frank Bauer
Twin Cities Drywall & Plaster · drywall / plaster
Starts 11 Jan 2027
Signs the subcontract, sub side.
Do not contact directly. Write Rosa Delgado instead.
```
— stops there; no email, no phone, no `tel:` link. This is the exact gap
1440's own `fix-log-r4.md` flagged as "390's Frank Bauer Directory and
roster rows do not yet carry the routed line R-L requires; that is the 390
builder's item" — confirmed still open on both named faces.

R-L only names the routing wiring itself ("same channel-selection rule in
both files"); it does not separately re-state that the line must appear on
all three faces named by §5.1 #10 and §5.4 #12 — but those two SPEC items
were never amended or waived, so the requirement stands independent of R-L.

### TR5-3 — 390's Bring-forward screen drops the Call Sheet's site-access line that 1440 keeps (blocking, high confidence)

SPEC §5.7 #2: "The Okonkwo Call Sheet head remains visible behind/above" the
picker. §5.4 #2 establishes what that head contains: the title plus "Key
held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026."

1440's `renderPick()` (`people-room-1440.html:1212-1214`) prints both the
`<h2>` and that sentence. 390's `renderPick()`
(`people-room-390.html:1257-1259`) prints only the `<h2>`, then jumps
straight to the "OKONKWO RESIDENCE" eyebrow — confirmed on both the live
text dump and the rendered `state-pick` plate (`shots/people-room-390-state-pick-390.png`):
nothing between "Call sheet · Okonkwo residence" and "OKONKWO RESIDENCE."
A whole-face diff of `#state-pick` at both widths found exactly one
difference, this line, present only in 1440. The two widths disagree on
whether the Bring-forward screen still tells you who holds the key.

### TR5-4 — 1440's roster never prints Amara Osei's bid-history note that 390 shows (blocking, high confidence)

Both fixtures carry the same engagement field for F-16 (Amara Osei, Lakeshore
Painting Co.): `"bid": "Quoted 2 October 2026. Selected 9 October 2026."`
(`people-room-1440.html:517`, `people-room-390.html:494`).

390's `rosterPersonRow` prints it unconditionally when present:
`if (e.bid) { out += '<p class="t-body-sm note">' + esc(e.bid) + '</p>'; }`
(`people-room-390.html:1029`). 1440's `rosterPersonRow`
(`people-room-1440.html:1049-1063`) has no `e.bid` handling at all — 1440
only reads `e.bid` inside `rosterFirmRow` (for the Bidding/Done firm rows),
never inside the person-row renderer. Live dump of 1440's `#state-roster`
for Amara Osei has no bid-history line; 390's does. A whole-face diff of
`#state-roster` confirms this is the only content difference of its kind for
this row. Not a SPEC-numbered acceptance string, but a fact present in one
fixture-consuming face and silently dropped in the other for the identical
underlying data.

### TR5-5 — Company card: 1440 suppresses a blocked-but-unrouted contact rule that 390 shows (major, high confidence)

Carol Nystrom (F-26, Great Northern Bank) has a *blocked* rule with no
`routeTo`: `{ "person": "F-26", "text": "Never text. Email and phone only.",
"block": true, "setBy": "Dale Whitcomb", "setAt": "2026-10-06" }`
(identical in both fixtures). Both files' Directory and roster rows print
this clause correctly (confirmed live, both widths). But on the **company
card**:

- 1440's crew-line rule check (`people-room-1440.html:970-974`) requires
  `r.block && r.routeTo && P[r.routeTo]` before printing anything — since
  Carol Nystrom's rule has no `routeTo`, nothing prints. Live dump of
  1440's Great Northern Bank company card jumps straight from "Carol
  Nystrom · draw inspector" to the "PAPER" region.
- 390's equivalent (`people-room-390.html:951-958`) only requires `r.block`
  — it prints `Never text. Email and phone only.` as a blocked clause
  regardless of `routeTo`. Live dump confirms this line appears between the
  crew line and "PAPER."

Same underlying fact (does Great Northern Bank's company card disclose that
its one contact must never be texted), two different answers depending on
which file you open. Neither §5.3 nor any ruling names this specific case,
so it is not a missing *named* acceptance string — but it is a clean
instance of "the two widths disagree on a fact," which this round's own
blocking definition covers.

### TR5-6 — 1440 shows a non-default person's opt-out note on the unclicked roster face; 390 gates the same note behind "Unfold" (major, medium confidence)

Pete Rusk's roster row: 1440 prints "Opted out by text, 3 December 2025, on
the Lindqvist kitchen." directly on the row, unconditionally — traced to
`clausesFor()` (`people-room-1440.html:661-662`), which folds any "Opted
out" consent note into the always-visible clause list alongside contact
rules. 390's `rosterPersonRow` never merges consent state into the always-
visible clause; it only shows a (differently-worded) consent line inside
the row's own `unfold`, and only Dana Kowalski's row (`F-11`) is unfolded by
default in both files. Live dump confirms Pete Rusk's 390 row, collapsed,
shows nothing about his opt-out; 1440's shows it unconditionally.

§5.4 #13 describes the collapsed/unfolded scheme as "One row is unfolded
(Dana Kowalski), showing phone, consent…" — read one way, that implies every
other row's consent detail is *meant* to live behind its own unfold, which
would make 390 the SPEC-literal build and 1440 the outlier for pulling
opt-out notes onto the always-visible face. Flagged as a fact-visibility
disagreement rather than a clear-cut violation either way — needs a ruling,
not a unilateral fix.

### TR5-7 — Roster disclosure-trigger wording still disagrees between widths (minor, high confidence)

1440's roster-row disclosure button reads "More" (`aria-label="More about
NAME"`, `people-room-1440.html:1089`). 390's reads "Unfold" (`aria-label=
"Unfold NAME"`, `people-room-390.html:1036`). No acceptance string is at
stake (SPEC never names the trigger word), but it is a visible-face wording
divergence for the same control, in the same vein as round 3's TR3-4 and
round 4's TR4-3 (both since ruled/fixed) — this one was never raised before
and is still open.

### TR5-8 — "Lens" label printed only at 1440 (minor, high confidence)

1440 prints a `<span class="pick-note">Lens</span>` immediately before the
MINE/STUDIO toggle (`people-room-1440.html:734`). 390 has no equivalent
span anywhere — the toggle appears with no label at all. SPEC §5.1 #4 uses
"Lens" only as the *name of the concept* in its own prose ("Lens: two
scored words MINE and STUDIO…"), not as a required face string, so this
isn't a missing acceptance string — but it is a real, visible content
difference between the two builds for the same control.

### TR5-9 — Company-card "Jobs" region prints the stage word twice at 390, once at 1440 (minor, high confidence)

390's Jobs region (`people-room-390.html:994-996`) emits two separate
elements per job: a prose line with the stage spelled out in the sentence
("Okonkwo residence · Dana Kowalski · On the job") *and* a following
`<p class="words">` badge repeating the same stage as a bordered word
("AWARDED"/"ON THE JOB"). 1440's equivalent
(`people-room-1440.html:1020-1023`) embeds the word once, inline, inside the
single sentence (`wordEl(x.stage, 'word--inline')`). Confirmed on the
rendered Northgate Electric and Great Northern Bank company-card plates at
390: the stage reads once in prose, then again as a pill immediately below
it. Same fact, presented twice on one face; not a wrong fact, just a
duplicated one — cosmetic, not blocking.

### TR5-10 — 390 has no `.act--inline` treatment; both SPEC-named "inline act[s]" render as bordered/uppercase tertiary acts instead (minor, medium confidence)

SPEC calls two specific acts "an inline act": "Open the site access card"
(§5.4 #2) and "Draw 1 waiver ledger, in the money book" (§5.3 #7). 1440
defines a distinct `.act--inline` class (`people-room-1440.html:174-175`:
body font, sentence case, `--ink` colour, no letter-spacing) and uses it for
both (`people-room-1440.html:1026`, `:1115`). 390's stylesheet has no
`.act--inline` rule anywhere (`grep -c act--inline` → 0), and both acts
render as `.act.act--tertiary` (`people-room-390.html:977`
[site-access-card act uses `act--tertiary`], `:999` [ledger act]) — uppercase,
letterspaced, matching the visual language of every other tertiary act on
the page rather than reading as a plain inline aside. Confirmed visually on
the rendered company-card plate at 390 (`shots/people-room-390-state-company-390.png`):
"DRAW 1 WAIVER LEDGER, IN THE MONEY BOOK" reads identically to "RECORD A
DOCUMENT"/"CHASE THE RENEWAL" above it, with no visual distinction. The
required word-for-word text is present at both widths (not a missing
acceptance string), so this is a styling/consistency nit, not blocking.

### TR5-11 — 1440's "Chase the renewal" act carries no `aria-describedby`, unlike 390's (minor, medium confidence)

390 wires `aria-describedby="chase-why"` on its "Chase the renewal" button
and gives the consequence paragraph `id="chase-why"`
(`people-room-390.html:977,980`). 1440's "Chase the renewal" button
(`people-room-1440.html:1001`) has no `aria-describedby`, and its
consequence paragraph (`:995-996`) has no `id` — the sentence is simply
adjacent in the DOM, with no programmatic association. §7 #4 only mandates
`aria-describedby` for acts that are `aria-disabled` (this one isn't), so
this isn't a spec violation — but it's an accessibility-wiring
inconsistency between the two files for the same act, worth a ruling for
consistency's sake.

## Interaction probe (`#state-pick`, both files)

```
1440: before "4 of 5 … selected" / "Add four to the roster"
      → click last unchecked box → "5 of 5 … selected" / "Add five to the roster"
      → click "Put back" → "0 of 5 … selected" / "Add to the roster", aria-disabled=true
390:  identical sequence, identical strings, identical aria-disabled=true
```
Every checkbox and both acts (`Add N to the roster`, `Put back`) have a live
handler in both files — `document.addEventListener('change', …)` on
`.pick-check input`/`.pick-box` plus a `.js-putback` click handler, confirmed
by code read and by the live click-through above producing matching state
transitions in both files.

## Render (SPEC §9)

Sandbox-disabled retries were required — Chromium hits a Mach-port
bootstrap error under the default sandbox; passing
`dangerouslyDisableSandbox: true` on the render command resolved it both
times, matching the task's stated workaround.

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
`"horizontalOverflow": false`, every single one. Cross-checked independently
with a `document.documentElement.scrollWidth`/`clientWidth` DOM probe on
`#state-directory` at each width: 1440×1440 (no overflow), 390×390 (no
overflow).

## Visual review (all fourteen plates in `shots/`)

Viewed all fourteen PNGs full-page, both widths, all seven states, plus the
two states most implicated in this round's findings re-rendered and
re-viewed after the interaction probe.

- **Directory**: matches §5.1 apart from TR5-1 (routed line absent at 390).
  Firms list is six rows on both widths, ending in Great Northern Bank and
  City of Minneapolis, CPED Inspections, both wordless — TR4-4's fix holds.
  Person rows carry three word columns at 1440 (DOM-probed: every
  `.row-words` has exactly 2 or 3 children, never more or less). No
  clipping, overlap, or truncation at either width.
- **Person card** (Dana Kowalski): byte-for-byte identical facts both
  widths (table-vs-stack layout only). No break.
- **Company card** (Northgate Electric, the tested default): full paper
  table/stack, both acts, blocking sentence — matches on both. Its
  systemic divergence for *other* firms (Great Northern Bank's crew-line
  rule, TR5-5) and its Jobs-region duplicate stage word (TR5-9) are not
  visible on this specific default plate, confirmed instead via
  click-throughs to `gnbank` and re-inspection of the Jobs region.
- **Project roster**: bands present and correctly peopled at both widths;
  Dana's row unfolded with the held clause and all four acts;
  "Close this seat" never "Remove"; Bidding/Done visually separated. TR5-2,
  TR5-4 and TR5-6 are visible here (missing routed line, missing bid note,
  and Pete Rusk's opt-out note respectively) but do not visually break
  anything — the face renders cleanly, it is simply missing/extra content.
- **Bring forward**: search value "Lindqvist," count line, five rows in
  spec order with spec'd words/history lines, checkboxes with no tick
  glyph, "What travels"/"What stays behind" panes, exact consequence
  sentence, "Add four to the roster"/"Put back" both live. TR5-3 (missing
  key-held line at 390) confirmed on the plate — no visual break, the head
  is simply shorter at 390.
- **Add sheet**: full field set at both widths; TR4-1's fix holds for both
  the default and non-default (kind="a GC") authority text, confirmed live
  by clicking through kinds on both files. No break.
- **Site access**: region order matches §6.2 exactly at both widths, text
  byte-identical (0/0 diff), no code digit visible anywhere. No break.

No missing-font fallback observed on any plate. No horizontal overflow on
any plate at either width.

## Summary

**Not clean.** Five blocking findings (TR5-1, TR5-2, TR5-3, TR5-4, and by
this round's own "two widths disagree on a fact" rule, TR5-5) plus one major
returned for ruling (TR5-6) and five minor findings (TR5-7, TR5-8, TR5-9,
TR5-10, TR5-11).

All four round-4 findings are resolved for what they specifically named:
TR4-1 (Authority note wording) and TR4-3 (label wording) are fully fixed and
now identical between files; TR4-2's Paper-region gap and TR4-4's Directory-
firm-row gap are both fixed. But TR4-2's companion claim — that R-L's
routed-contact fix "now appears on the Directory row … and the Call Sheet
row … as well as the company card" — was true only of `people-room-1440.html`;
`people-room-390.html` only received the company-card half of that fix, a
gap 1440's own fix log flagged but which this review round found still
unresolved and undocumented (TR5-1, TR5-2). The remaining fresh findings
(TR5-3 through TR5-11) surfaced from pushing a full whole-face text diff
across all seven states at both widths, beyond what the graded hashes alone
would show — the same technique that caught TR4-2 last round.
