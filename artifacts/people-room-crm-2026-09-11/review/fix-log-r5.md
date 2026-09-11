# Fix log, round 5 — both specimens, one owner

Scope: `specimens/people-room-1440.html` **and** `specimens/people-room-390.html`, under orchestrator
rulings R-A..R-L (standing) plus R-M..R-U (this round). 1440 is canonical for every fact, wording,
helper and ordering; where a ruling names the other direction, the ruling wins. No git, no prod, no
pnpm. Nothing written outside `artifacts/people-room-crm-2026-09-11/`.

Gate, after the last edit:

```
wc -c            people-room-1440.html = 97564      people-room-390.html = 103070
tail -1          <!-- specimen-complete -->         <!-- specimen-complete -->
grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled'   0            0
grep -c opacity / eval( / Remove / StatusDot                   0/0/0/0      0/0/0/0
<h1> count                                                     1            1
role="status" count                                            1            1
<style> / <script> blocks                                      1 / 1        1 / 1
hex literals after line 90                                     0            0
external hosts            fonts.googleapis.com + fonts.gstatic.com, both files
token block vs _tokens-reference.css      diff = "80d79 < }"  (the one instructed brace), both files
class fragment vs _people-style-fragment.html lines 9-56       IDENTICAL, both files
render (7 hashes each, sandbox disabled)  14 plates, errors 0, warnings 0, horizontalOverflow false
pick probe (both widths)  4 of 5 / "Add four" -> 5 of 5 / "Add five" -> Put back -> 0 of 5 /
                          "Add to the roster", aria-disabled="true"
tel: targets, visible links, all 7 states, both widths   0 under 44x44
orphan aria-controls / <a> inside <button> / [disabled]  0 / 0 / 0, both widths, all 7 states
```

---

## 1. Round-5 findings, disposition

| ID | Severity | File(s) changed | What was done |
|---|---|---|---|
| **DR5-1 / CR5-2 / TR5-1 / TR5-2** (blocking) — R-L's routed line missing on 390's Directory and Call Sheet rows | blocking | 390 | `routedLine()` deleted. 390 now carries the 1440 helper set (`clausesFor`/`clauseHtml`/`routeWrite`/`routeChannels`); `dirPersonRow()` and `rosterPersonRow()` both call `clauseHtml(clausesFor(p))`, and `renderCompany()`'s crew line calls `routeWrite(r.routeTo)`. All three faces now print `Write Rosa Delgado · rosa@twincitiesdrywall.com · (612) 555-0114`, phone `tel:`-linked, at both widths. Verified by innerText diff: `state-directory` and `state-roster` now **MATCH, 0 differences**. |
| **DR5-2** (blocking) — Call Sheet unfold consent sentence worded differently by width | blocking | both | R-Q applied. `consentSentence()` is now one helper in both files: `"<Source> consent, <d Mon yyyy>, on the <project>."`, with the opted-out lead `"Opted out by text"`. 1440's version moved from `fmtLong` to `fmtShort` so verbal reads "Verbal consent, 13 Oct 2026, on the Okonkwo residence." 390's roster-unfold template (`cons.state + ' · ' + cons.source + ' · recorded …'`) is gone; both unfolds read **"Written consent, 2 May 2025, on the Lindqvist kitchen."** 390's person-card consent line calls the same helper. |
| **CR5-1** (blocking) — 7 of 12 Directory rows showed no consent/paper word at 390 | blocking | 390 | R-M applied. `dirPersonRow()` now prints `reach · consent · paper` as plain inline words, joined by a middle dot, on line 2 of **every** row, folded or not. The seat panel keeps only the seat line and its stage word; the bordered `.word` block and the consent note were removed from it. Adaeze Okonkwo's row now reads `Account · Texting`; Frank Bauer's `On paper · Not asked · Current`; Ray Thao's `On paper · Not asked` (no paper word, R-A/R-N). |
| **CR5-3** (blocking, SPEC text) — §5.1 #11 demanded a paper word for Ray Thao | blocking | none | Closed by R-N; `SPEC.md:489` already reads "and no paper word (lender and inspector people print no paper word, R-A)". No build change. Both faces print no paper word for Ray Thao. |
| **TR5-3 / CR5-4** — Bring forward dropped the Call Sheet's site-access line at 390 | blocking | 390 | R-U applied. `siteHeadLine()` extracted and called from both `renderRoster()` and `renderPick()`. Both widths' `#state-pick` now open "Call sheet · Okonkwo residence" / "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." |
| **TR5-4** — 1440's roster dropped Amara Osei's bid history | blocking | 1440 | R-R applied. `rosterPersonRow()` gained `if (e.bid) lines.push(...)`. Both widths print "Quoted 2 October 2026. Selected 9 October 2026." |
| **TR5-5** — company card hid a blocked-but-unrouted rule at 1440 | major | 1440 | R-S applied. The crew-line check dropped from `r.block && r.routeTo && P[r.routeTo]` to `r.block`, with the routed line appended only when a route exists. Great Northern Bank's card now prints "Never text. Email and phone only." under Carol Nystrom at **both** widths (click-through verified). |
| **TR5-6** — Pete Rusk's opt-out note visible at 1440, hidden behind the unfold at 390 | major | 390 | R-T applied through `clausesFor()`: an "Opted out" consent folds into the always-visible clause list. Pete Rusk's collapsed roster row and his Directory row both print "Opted out by text, 3 December 2025, on the Lindqvist kitchen." at both widths. |
| **DR5-3** — Claire Bissett's row rendered a blank gap where a consent word belongs | major | both + SPEC | R-O: her fixture consent is `"Not asked"` in both files (SPEC §3 already carried it). Every one of the twelve `DIR_PEOPLE` rows now has a non-null consent, so 1440 prints three bordered words on her row and 390 prints `On paper · Not asked · Current`. |
| **DR5-4** — company Paper region: consequence before acts at 1440, after them at 390 | major | 390 | R-P applied. 390's `renderCompany()` Paper region now runs **stack → leading-rule clause → consequence sentence → act row**, matching 1440. Confirmed in the ordered text dump at both widths. |
| **DR5-5** — Ingrid Halvorsen's rule and history line in opposite order | minor | 390 | `pickRow()` reordered to rule-then-history, matching 1440. Both now read "Email only. No cell for work." then "Worked 1 prior project, Lindqvist kitchen, closed 2025". |
| **DR5-6 / CR5-5a** — seats disclosure read "1 SEAT"/"0 SEATS" at 1440, bare "SEATS" at 390 | minor | 390 | 390 adopts the count-aware label (and drops the aria-label that no longer contained the visible text), matching 1440 exactly. |
| **DR5-7 / CR5-5b** — 390's Directory seat panel printed the consent note, 1440's never did | minor | 390 | Removed from 390's seat panel (1440 canonical; the note stays on the person card and in the roster unfold, where 1440 shows it). |
| **TR5-7** — roster disclosure trigger "More" vs "Unfold" | minor | 390 | 390 now reads "More", `aria-label="More about <name>"`, matching 1440. |
| **TR5-8** — "Lens" label printed only at 1440 | minor | 390 | `<span class="t-head">Lens</span>` added ahead of MINE/STUDIO. |
| **TR5-9** — company Jobs region printed the stage twice at 390 | minor | 390 | New `wordInline()` + `.word--inline`; the job line is now one sentence ending in the inline word, as at 1440. The ledger act's gate also moved from `c.payee` to 1440's "a lapsed document blocks the draw" test. |
| **TR5-10** — no `.act--inline` at 390 | minor | 390 | `.act--inline` added and used for "Open the site access card" and "Draw 1 waiver ledger, in the money book", the two acts SPEC calls inline. |
| **TR5-11** — "Chase the renewal" wired to its reason only at 390 | minor | 1440 | 1440's consequence paragraph gained `id="chase-why"` and the button `aria-describedby="chase-why"`. Both files now match. |
| CR2-7/CR3-4/CR4-1 "licence" spelling | minor, carried | none | Lives inside the verbatim §3 fixture JSON. Fixture-owner change; correctly untouched. |
| CR2-8/CR3-5/CR4-2 "Compare & merge" names no cards | major, carried | none | Awaits a panel ruling on which two cards and what the act opens. Untouched, identical at both widths. |
| CR3-6/CR2-9/CR4-3 no schedule-authority sentence | minor, carried | none | Needs a fixture fact. Untouched. |
| CR3-7/CR2-10/CR4-4 homeowner "Holds a key." | minor, carried | none | Needs a fixture cue. Untouched. |

### Divergences found by the parity pass itself, not by any reviewer, and closed

| Where | 1440 | 390 before | Now |
|---|---|---|---|
| Person card, contact rule | plain paragraph | plain paragraph | both carry the blocked leading rule + routed line when `r.block` (R-S names the person card) |
| Person card, seats | "Contracted through …" for a sub; "Hidden from the client" for a sub **or** a maker | both gated on `sub` | 390 adopts 1440's two conditions |
| Roster unfold, phone line | "Mobile" + `tel:` link, else "No phone on file" | "Mobile · (612) 555-0111 · preferred" | 390 adopts 1440's wording |
| Roster unfold, words | consent word + paper word | absent | 390 prints both (§6.1's "consent and paper move into the unfold") |
| Roster unfold, acts | Text only with a phone and Texting consent; Copy field link only for a Field link | all four always | 390 adopts 1440's conditions |
| Site access, "Log who was told" band | label "WHAT CHANGED AND WHO YOU TOLD", act "Save this note", textarea | "WHO YOU TOLD, AND WHAT" / "File it" / input | 390 adopts 1440's wording and control |
| Company card, crew line | "holds the trade licence" when the firm is a sole proprietor holding a licence | when the person is the signer and a licence exists | 390 adopts 1440's condition (Marrow & Sons no longer claims it) |
| Person card, sub-heads | `.t-head`, meta caps | body 14/600 sentence case | 390's `.sub-head` restyled to the meta caps of 1440, so CHANNELS / CONTACT RULE / ACCESS GRANTS read alike |
| Routed line, 390 | one line | innerText broke before the `tel:` chip, stranding the separator | the routed phone uses `.tel--route` (inline-flex, rule on the anchor, no inner flex item) — 44×45 target, one unbroken line |
| `.tel--inline` targets at 390 | n/a | 113×39 | padding 11px → 14px, now 113×45; every visible `tel:` link at both widths clears 44×44 |

---

## 2. Shared logic, one source

`people-room-390.html` now carries, verbatim in behaviour and wording, the four helpers named in the
brief, previously only in `people-room-1440.html`:

```
SOURCE_WORDS / consentSentence(id)      R-Q's one sentence, both files, every call site
routeChannels(id) / routeWrite(id)      email first, then the office phone as a tel: link
clausesFor(p) / clauseHtml(list)        contact rule (blocked or not) + an opted-out consent note,
                                        with the routed line appended only when a route exists
```

390 gained the three lookup maps (`P`, `RULE`, `CONSENT`) and the three primitives the helpers call
(`fmtShort` → `dshort`, `isPhone`, `tel` → a `.tel--route` anchor) so the helper bodies read the same
in both files. Callers in 390: `dirPersonRow()`, `rosterPersonRow()`, `renderCompany()` (crew line),
`renderPerson()` (channels consent line **and** contact rule). `renderPick()` shares `siteHeadLine()`
with `renderRoster()`. §6.2's layout rules are untouched: the two-line row, the plain line-2 words, the
label-over-value stacks, the stacked bands, the in-flow terminal act.

---

## 3. Parity pass, all seven states

Method: Playwright (`playwright@1.58.2`, the engine `tools/render.mjs` uses), one page per width at its
own viewport (1440×900, 390×900), navigated straight to each state hash, `document.body.innerText`
captured, then normalised — split on newlines **and** tabs (1440's tables emit tab-separated cells),
split again on the middle-dot separator, trimmed, lowercased (the two files reach the same words
through different `text-transform` rules) — and compared as multisets, so a difference is a fact or a
word present at one width and not the other, never a re-ordering that §6.2 licenses.

| State | Result |
|---|---|
| `state-directory` | **216 strings compared, 0 intentional layout differences** |
| `state-person` | **71 strings compared, 1 intentional layout difference** |
| `state-company` | **98 strings compared, 21 intentional layout differences** |
| `state-roster` | **291 strings compared, 0 intentional layout differences** |
| `state-pick` | **70 strings compared, 0 intentional layout differences** |
| `state-add` | **48 strings compared, 0 intentional layout differences** |
| `state-access` | **35 strings compared, 0 intentional layout differences** |

### The remaining intentional differences, and the §6.2 line that licenses each

Both are the same thing: a column header that a table prints **once** and a label-over-value stack
must print **on every row**. No fact and no wording differs; only the repeat count of a column label.

1. `state-person`, 390 prints the word "Channel" twice where 1440's two-column channels table prints
   its `<th>` once (the second copy labels the held email row). 1440 keeps the matching "Consent"
   header count.
   **SPEC §6.2, Cards:** *"One column, full width. Tables become label-over-value stacks; a table never
   scrolls sideways."*

2. `state-company`, 390 prints TYPE / NUMBER / ISSUER / EXPIRES / STATE / HELD BY / BLOCKS four times —
   once per document — where 1440's Paper table prints each `<th>` once above four rows. 21 extra
   strings = 7 labels × 3 extra documents.
   **SPEC §6.2, Cards:** *"One column, full width. Tables become label-over-value stacks; a table never
   scrolls sideways."* (§5.3 #3 names the same seven header cells, which both widths print.)

Everything else is byte-equal after case folding, including the thirteen row-level orderings §6.2
allows to stack differently (the Directory row's line 2, the roster row's words-before-tel, the pick
row's stacked pane). Spot-read of the ordered dumps confirms Dana Kowalski's Directory row, Frank
Bauer's routed line, Amara Osei's bid note, the company Paper region's four-part order, the Bring
forward opening and its act-row-then-consequence footer all read in the same sequence at both widths.

Click-through cards outside the seven graded hashes were diffed too: Great Northern Bank (28 strings,
0 differences), Twin Cities Drywall & Plaster (40, 0), Marrow & Sons (86, 0 beyond the 14 stack-label
repeats).

### Acceptance strings, spot-verified verbatim at both widths

25 named §5 literals plus 22 act labels were asserted present in the rendered text of both files —
among them §5.1 #9's "Opted out by text, 3 December 2025, on the Lindqvist kitchen.", §5.1 #10/§5.4 #12's
routed line, §5.2 #4's carried-forward consent line, §5.3 #4/#5's held clause and consequence,
§5.4 #2's site-access line and #3's vitals, §5.7 #7's consequence sentence, §5.6 #7's change log.
All 47 present at both widths. A forbidden-vocabulary sweep of the rendered faces (AI, CRM, dashboard,
wizard, badge, pill, chip, modal, toast, spinner, Remove, Lorem, placeholder, example, sample, TBD,
`F-nn`) returned nothing at either width.

---

## 4. One SPEC reconciliation worth naming

R-Q gives the consent **sentence** an opted-out form of "Opted out by text, 3 Dec 2025, on the
Lindqvist kitchen." SPEC §5.1 #9 requires the opted-out **clause** on Pete Rusk's Directory row to read
"Opted out by text, 3 December 2025, on the Lindqvist kitchen.", and §5.7 #4b requires the pick row's
own note to read "Opted out by text 3 Dec 2025, on the Lindqvist kitchen." — three named strings for
three call sites, one of them R-Q's.

Resolution: `consentSentence()` implements R-Q exactly, and it is the single source at the two places
a consent's source and date are reported (the person card's channel line and the Call Sheet unfold).
The row-level clause keeps the fixture's own `note`, which is §5.1 #9's named literal, and the pick
row keeps §5.7 #4b's. All three are identical at both widths, so no width disagrees with the other on
any wording; the distinction is between call sites, exactly as SPEC itself draws it.
