# 60 — Deck fact-check (W5 · The Smart Lens)

Fresh-context adversarial fact-check of `presentation.html` (built from `mock/deck-parts/*.html`),
against every source named in the brief: `research/`, `source/`, `probe/`, `mock/final/`, and the
repo itself for every printed `file:line`. Method: read every part file in full; for every number,
F-id, quote, `file:line` and behavioural claim, traced to a file on disk; ran `ls`/`wc -l` on every
repo path printed; diffed the ask against `source/plan.md`; grepped for brand language.

## 1 · Counts

- Claims checked: **~230** (all 15 body sections read in full; every distinct F-id occurrence
  cross-checked against `research/31-verified-findings.json`; every repo `file:line` existence- and
  bounds-checked; every measurement traced to `research/12-layout-measurements.md`/`.json` or
  `probe/03-interactive-probe.md`; every proposal-mechanics/table row diffed against
  `source/proposal.md`; every quoted "voice" diffed against its named panel/critique/judge file).
- **UNSOURCED: 2** (both in the colophon's build-size table — §3 below).
- **Internally inconsistent (sourced, but the deck contradicts itself or a source it cites): 2**
  (the margin's "~270px vs ~160px" recovery figure; the mockup-Artifact-link status) — §3.
- **Drifted (F-id resolves correctly, but the printed chip text is a paraphrase/abbreviation of
  the finding's actual title, not the title verbatim): ~35 occurrences**, concentrated in
  `12-build.html`'s ticket-board chips — full list at the end of §2.
- **Brand-language grep: 0 real hits.** Every "elevated" match is the CSS class `.doc-elevated`
  (an app class name tied to NG2's shadow token), not marketing copy. The 18 `!` matches are all
  `!important` (CSS) or `!isRowHead` (JS negation) — zero exclamation-mark punctuation in prose.
  Zero hits for curated/luxury/bespoke/seamless/effortless/delight*/magical/unlock, zero emoji,
  zero "users said"/"designers told us"/"research shows", zero bare counts of people.
- **Repo `file:line` paths that do not exist: 0.** Every path resolves under
  `apps/designer-portal/` (or `artifacts/document-lens-proposal-2026-08-28/` for research-script
  paths), and every cited line number sits inside that file's actual line count. Six paths do
  **not** currently exist (`lens-band.tsx`, `hooks/use-lens-density.ts`, `spine/lens-ladder.tsx`,
  `e2e/document/lens-band-height.spec.ts`, `e2e/document/lens-density.spec.ts`, and the ambiguous
  second mention of `job-ticket.tsx` as "new" in `12-build.html`'s Wave 3 file list) — all six are
  explicitly labelled `<strong>new</strong>` in the Build section as files the proposal's
  engineering plan would create; the colophon's own closing note ("those marked **new** are the
  five files this path creates") is itself consistent with the five genuinely-new files (see §3
  for the one label ambiguity worth a look).
- **Ask diff: zero bytes of difference.** See §4.

## 2 · The claim table (representative — full detail in §3/§4/§5/§6)

Given the volume (~230 claims across 15 sections), this section groups by check type rather than
printing every row; every claim not called out below as UNSOURCED or DRIFTED verified as
**sourced** (the cited file says exactly what the deck prints, modulo straight-vs-curly-quote
rendering, which I did not count as a wording change).

| Category | Sourced | Drifted | Unsourced |
|---|---|---|---|
| The ask (§ask, byte-diffed) | 1 | 0 | 0 |
| Layout measurements (03-today, 06-spine, 07-header — §12-layout-measurements.md/.json) | ~35 | 0 | 0 |
| Probe facts (03-today, 05-thesis — probe/03-interactive-probe.md) | ~10 | 0 | 0 |
| F-id chip → finding resolution (all 15 sections, 135 chip occurrences, ~90 distinct ids) | 100 | 35 | 0 |
| Repo `file:line` citations (existence + in-bounds line numbers, all sections) | ~60 | 0 | 0 |
| `source/proposal.md` mechanics table, count-line table, margin ledger (05-thesis, 06-spine, 08-body, 09-motion) | ~35 | 1* | 0 |
| Voice quotes (04-found, 13-roads) — 9 quotes against 5 named panel/critique/judge files | 9 | 0 | 0 |
| Mockup measurements (`mock/final/REVIEW-2.md`) — CLS, SC4 ink %, band offsets | 6 | 0 | 0 |
| Agent census / wave table (15-colophon vs `source/plan.md`) | 11 | 0 | 0 |
| Build byte-sizes (15-colophon) | 0 | 0 | **2** |
| Brand/tone grep | 1 clean | — | — |

*The margin-recovery figure is "drifted" in an unusual way: the deck's own two mentions of it
(05-thesis's "roughly 160px" and 08-body's "about 270px... [then a table summing to] 160") each
match *something* `source/proposal.md` says — but `proposal.md` says both 270px (§4, prose) and
~160px (§4's own ledger table, and again verbatim in §11.5) for the *same* recovery. See §3.

**F-id chips carrying a paraphrased/abbreviated title (not the finding's verbatim title), all
confirmed to resolve to the correct finding and not misrepresent it in substance:**

`12-build.html` (ticket-board chip labels — 24 of the 35): F53, F22, F36, F70, F38, F35, F07, F15,
F82, F12, F01, F04, F09, F44, F120, F39, F16, F75, F55, F116, F64 (×2 across sections), F63, F53
(again).

Elsewhere: F108 (×2, curly vs straight apostrophe only — cosmetic), F21/F56/F60/F74/F107/F06/F126
(curly-quote rendering of the finding's own straight quotes — cosmetic, not a wording change),
F127 (see §3 — the *canonical* title is itself truncated mid-word by an upstream 80-char cap;
the deck's version is a coherent hand-repair of that truncation, not a match to it), F62 ("doc" for
"document").

None of the paraphrases changes what the finding says materially, with one exception flagged
below: **F63**.

- **F63, in `05-thesis.html`:** chip reads `"PO" is never printed anywhere on the document`.
  Canonical title (`research/31-verified-findings.json`, id F63): `"PO" / "purchase order" is
  never printed anywhere on the document`. The deck's version silently drops the `"purchase
  order"` half of the claim, narrowing what the finding actually asserts. Not fatal — the
  underlying claim text elsewhere in the same finding still supports the narrower reading — but
  it is the one paraphrase in the set that changes the claim's scope rather than just its length.

## 3 · UNSOURCED / inconsistent — full detail

### (a) UNSOURCED — deck size, `15-colophon.html`

> **The Smart Lens deck** — 440716 bytes

No file on disk (this program's `research/`, `source/`, `probe/`, or `mock/`) contains the string
`440716`. The build script that would produce this number, `mock/deck-parts/build.mjs`, computes
byte size at build time and prints it to the console (`console.log("SIZE " + mb(bytes) ...)`) —
it does not write the figure to any file, so a past console line is not recoverable from disk. The
note under the table ("Deck size as of the previous build") concedes it is stale, but stale-and-
unverifiable is still unsourced: nothing on disk says 440716. For context, not as a substitute
source: `wc -c presentation.html` on the file this fact-check read returns **3,385,297 bytes** —
7.7× the printed figure, consistent with the deck having grown substantially since whatever build
that console line came from.

**What would source it:** re-run `node mock/deck-parts/build.mjs` and capture its `SIZE` line to
a file the deck can cite, or drop the row and say "not measured this build."

### (b) UNSOURCED — mockup size, `15-colophon.html`

> **The Smart Lens mockup** — 602794 bytes

No file on disk contains `602794`. The nearest sourced figure is **602135** bytes, stated twice in
`mock/final/REVIEW-2.md` (line 26: "File size **`602135` bytes**"; line 60, item 5: "File size
`602135` bytes — under the 2 MB target") and once in `mock/final/FINAL.md` (line 454: "602135
index.html"). 602794 − 602135 = 659 bytes unaccounted for; possibly a later untracked edit to the
mockup, but there is no file recording that edit's resulting size.

**What would source it:** cite 602135 (what `REVIEW-2.md`/`FINAL.md` actually say), or re-measure
the current mockup file and cite that fresh number.

### (c) Internally inconsistent — the margin's vertical recovery, `08-body.html` and `05-thesis.html`

`08-body.html` states, in prose: *"So the answer is about **270px** of vertical returned and 0px
of width"* — then immediately prints its own ledger table, whose rows (First-touch note capped
+160, duplicate heading deleted +40, two counted group headings added −40) sum to **Net = 160**,
not 270. `05-thesis.html` separately states *"roughly **160px** of vertical returned"* for the
same recovery.

This is not the deck inventing a number: **both 270 and 160 are printed by `source/proposal.md`
itself**, for the identical claim — §4 (line ~335) says *"the answer is **~270px** of vertical
returned and 0px of width"* immediately above a ledger table whose own printed `Net` row reads
`+~160px, and 0px of width`; §11.5 separately says *"the ~160px of vertical the two deletions
return."* `proposal.md`'s own arithmetic (160 + 40 − 40 = 160) does not support its own "~270px"
sentence. The deck faithfully reproduces the source's self-contradiction rather than introducing a
new one, but a reader following either deck section to its cited ledger will find the ledger
disagrees with the prose sentence sitting next to it.

**What would source it:** proposal.md's own ledger needs reconciling — either the "~270px" prose
sentences (both places it appears) should read "~160px," or the ledger is missing a row worth
~110px.

### (d) Internally inconsistent — mockup Artifact link status

`02-ask.html`: *"The mockup's Artifact link is not yet published as this deck was authored; it is
recorded in `RESUME.md` once Fable publishes it."*

`15-colophon.html`: *"The mockup's Artifact URL is not yet recorded in RESUME.md; it will be
published at the end of phase W4b."*

Both claims are now false against the file they name: `RESUME.md` line 3 reads **"Mockup
Artifact: https://claude.ai/code/artifact/65b060ad-0c98-4163-afb5-37d4f7c2b2af (favicon 🔭, label
v2-fixed-1280)"** — already recorded. And `11-walkthrough.html` independently prints that exact
URL four times as a live "Open the clickable mockup" / "Click Rest in the dev bar" link. The URL
itself is sourced (it is not invented — it's the literal string in `RESUME.md`), but sections 02
and 15 are stale: they describe a pre-publication state the program has since moved past, while
section 11 already reflects the post-publication state. `RESUME.md`'s own wave-status table (lines
27–32) is separately stale in the same direction (still shows W4a/W4b/W5a/W5b as "pending"), which
is presumably the source of the confusion, but that doesn't make sections 02/15's specific
"not yet" claims accurate as printed.

**What would source it:** update 02-ask.html and 15-colophon.html to say the link is live (as
11-walkthrough.html already does), or re-verify against a fresher RESUME.md if this was read
before the publish landed.

## 4 · The ask — byte diff

Extracted `Ask (verbatim in every brief): ... as the designer moves.` from the Context paragraph
of `source/plan.md` and from the blockquote in `mock/deck-parts/02-ask.html` (HTML-entity-decoded,
`&mdash;` → `—`). `diff` on the two extracted files: **empty — zero bytes of difference.** Every
comma, dash, capital, space, and the em dash are identical.

```
PLAN:  Ask (verbatim in every brief): a team of UI/UX designers with Patina engineering and
       interior-design teams designs the Document so it holds the needed information and
       actions while feeling uncluttered and peaceful — animation, content that appears when
       needed and yields space when not in frame; the document as a **smart lens always
       adjusting focus** as the designer moves.
DECK:  <identical, byte for byte>
```

## 5 · Brand-language grep

`grep -oiE 'elevated|curated|luxury|bespoke|seamless|effortless|delight[a-z]*|magical|unlock'` over
`presentation.html`: **62 hits, all "elevated," all `.doc-elevated`** — the CSS class name for the
one shipped shadow token (NG2), e.g. `.doc-elevated { box-shadow: var(--elevation-sheet); }` and
`class="margin-chip doc-elevated"`. None is marketing copy. No hits at all for curated / luxury /
bespoke / seamless / effortless / delight* / magical / unlock.

Exclamation marks: 18, all `!important` (CSS, in the reduced-motion reset block) or `!isRowHead`
(JS boolean negation in the table-render script) — zero actual exclamation-point punctuation.

No emoji found. No "users said," "designers told us," or "research shows." No bare counts of
people (the deck is explicit throughout that every "seat" is simulated, not a person — e.g.
"Every seat named on this page ... is a simulated seat," repeated in 02-ask.html and 04-found.html
and 12-build.html's closing note).

## 6 · Repo paths — existence and line-bounds check

Extracted every `<code>path.ext[:line[-line]]</code>` matching a source-file pattern across all 17
deck parts (99 distinct strings), resolved each to a file under `apps/designer-portal/src`,
`apps/designer-portal/e2e`, or the artifact's own `research/`/`probe/` trees, and ran `wc -l` on
every resolved file to confirm every cited line number sits inside the file.

**Result: every citation resolves to a real file, and every cited line number is within that
file's actual length.** Examples spot-checked against fresh `wc -l`, not proposal.md's own
numbers: `job-ticket.tsx` (463 lines; cites up to :519 belong to the sibling test file, 541
lines), `app/globals.css` (1548 lines; furthest cite :1519-1523), `page.tsx` (2383 lines; furthest
cite :2006), `page.test.tsx` (1897 lines; furthest cite :1361-1382), `ffe-section.tsx` (exactly
**1,549 lines** — matching 12-build.html's own printed "1,549 lines, unvirtualized" verbatim),
`quiet-release-contracts.spec.ts` (463 lines; cited range :169-299 in bounds),
`quiet-responsive-shell.spec.ts` (261 lines).

**Six paths do not exist today**, and all six are the deck's own explicitly-labelled `new` files
in the Build section (12-build.html), describing what the proposal's engineering waves would
create — not claims that they exist now: `lens-band.tsx`, `hooks/use-lens-density.ts`,
`spine/lens-ladder.tsx`, `e2e/document/lens-band-height.spec.ts`,
`e2e/document/lens-density.spec.ts`. (The colophon's closing sentence "those marked **new** are the
five files this path creates" checks out against exactly these five.) One label is worth a second
look: Wave 3's file list reads `<strong>new</strong> lens-band.tsx · job-ticket.tsx, deleted ·
[edited files]` — the sentence structure makes it slightly ambiguous whether `job-ticket.tsx` is
meant to parse as "new" or as "deleted" (it should be the latter, per `proposal.md` — the
component is deleted, not created — and the rest of that section's prose is unambiguous that
`job-ticket.tsx` is deleted). Not a wrong claim, just a run-on list construction a reader could
misparse on a fast read.

## 7 · Notable — well-sourced highlights worth naming

Not defects, but worth recording since the volume of exact, byte-identical transcription here is
unusually high for a deck this size: the entire 11-row lens mechanics table (09-motion.html) is a
byte-for-byte transcription of `source/proposal.md` §3, including every `file:line`, every
duration, and every F-id list per row; the 10-row count-line table (08-body.html) matches
`proposal.md` §4's table exactly; all 9 CSS reduced-motion block line numbers
(`globals.css:283/439/496/833/955/1013/1188/1468/1519` + no-preference gate `:429`) were
independently re-derived with `grep -n "prefers-reduced-motion" globals.css` and match the deck's
list exactly; the wave/seat census in the colophon (2/6/11/6/7/5/5/4/11/5/1, summing to 63) matches
`source/plan.md`'s phase-map table's `Calls` column row for row; all 9 quoted "voice" attributions
(04-found.html's P1/P3/E1 quotes, 13-roads.html's 7 judge/critique quotes) were traced to their
named panel/critique/judge files and match character-for-character, including retained ellipses.

Correction (close): 02-ask now quotes Kody's message verbatim (as written); the plan.md paraphrase check is superseded.
