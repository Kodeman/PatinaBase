# Technical review, round 2

Files reviewed:
- `specimens/people-room-1440.html`
- `specimens/people-room-390.html`

Against SPEC.md §1, §2, §4, §6, §7, §8, §10, cross-checked against `review/fix-log-r1.md`.

---

## 1. Automated checks (as run, verbatim)

### Byte sizes

```
$ wc -c people-room-1440.html people-room-390.html _tokens-reference.css _people-style-fragment.html
   84036 people-room-1440.html
   87150 people-room-390.html
    2378 _tokens-reference.css
    9492 _people-style-fragment.html
```

### Last line

```
$ tail -1 people-room-1440.html
<!-- specimen-complete -->
$ tail -1 people-room-390.html
<!-- specimen-complete -->
```
Both exact. §1 and §10 #1 pass.

### Forbidden-string grep counts

```
grep -c 'box-shadow'    → 1440: 0   390: 0
grep -c 'text-overflow' → 1440: 0   390: 0
grep -c 'placeholder='  → 1440: 0   390: 0
grep -c ' disabled'     → 1440: 0   390: 0
grep -c 'eval('         → 1440: 0   390: 0
grep -c 'opacity'       → 1440: 0   390: 0
```
`grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled'` → **0** on both files. §10 #2 passes on both.

### External hosts other than fonts.googleapis.com / fonts.gstatic.com

```
$ grep -n 'http' people-room-1440.html
7:<link rel="preconnect" href="https://fonts.googleapis.com">
8:<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
9:<link href="https://fonts.googleapis.com/css2?family=...&display=swap" rel="stylesheet">
```
Identical three lines in `people-room-390.html`. No other `http` string in either file. §1 and §8 #6 pass on both.

### Hex literals outside the token block

```
grep -n '#[0-9A-Fa-f]\{6\}' people-room-1440.html → lines 16-89 only (40 matches)
grep -n '#[0-9A-Fa-f]\{6\}' people-room-390.html  → lines 16-89 only (40 matches)
```
Both files' only hex literals fall inside the pasted `:root` / dark-media / `[data-theme="dark"]` token block (lines 12-91). §8 #7 passes on both.

### Token block + class fragment diff against the reference files

```
$ diff <(sed -n '11,90p' people-room-1440.html) _tokens-reference.css
80d79
< }
$ diff <(sed -n '11,90p' people-room-390.html) _tokens-reference.css
80d79
< }
```
Both add exactly one line vs. the (deliberately unbalanced) reference — the one instructed appended `}`. **But see TR-3**: 1440 has a *second* stray `}` immediately after this one that 390 does not have (not caught by this line-range diff because it falls one line later — see TR-3 for the full brace trace).

```
$ diff <(sed -n '93,140p' people-room-1440.html) <(sed -n '9,56p' _people-style-fragment.html)
IDENTICAL
$ diff <(sed -n '92,139p' people-room-390.html) <(sed -n '9,56p' _people-style-fragment.html)
IDENTICAL
```
The §2.2 class fragment is byte-for-byte identical to `_people-style-fragment.html` in **both** files. §2 and §10 #6 (fragment half) pass on both.

### Heading order

```
grep -n '<h[1-6]' people-room-1440.html → h1 (1×) then h2/h3 only, no skips, no second h1
grep -n '<h[1-6]' people-room-390.html  → h1 (1×) then h2/h3 only, no skips, no second h1
```
`<h1>` count = 1 on both. §1, §7 #11 pass on both.

### `role="status"` count

```
grep -c 'role="status"' people-room-1440.html → 1
grep -c 'role="status"' people-room-390.html  → 1
```
Exactly one live region per file. §7 #3 passes on both.

### aria-expanded / aria-controls pairing

Python scan of every `aria-controls="X"` against every `id="X"` in the file:
- 1440: 3 real `aria-expanded` elements (seats disclosure, person "More", "Log who was told"), 3 `aria-controls`, 0 missing ids.
- 390: 3 real `aria-expanded` elements (seats disclosure `.disc`, roster unfold `.disc`, "Log who was told"), 3 `aria-controls`, 0 missing ids. (A 4th regex hit in 390 was the CSS selector `.disc[aria-expanded="true"] .disc-chev`, not a DOM attribute — not a real disclosure.)

§7 #5 passes on both.

### `<a>` nested inside `<button>`

Stack-based scan of every `<button>`/`<a>` open/close pair in each file: **0 occurrences** in either file. §7 #6 passes on both.

### `tel:` links

Both files build every phone link through a shared helper (`tel()` in 1440, `telLink()`/`linkPhones()` in 390) that emits `href="tel:+1<digits>"`, matching SPEC's `tel:+16125550111` example exactly. Coverage confirmed by call-site count: 1440 has 9 call sites (directory row, channels table, person-card mobile line, seat/unfold rows, roster row, roster unfold, site-access call-first list), 390 has the equivalent 4 helper functions/call sites covering the same faces (directory/roster row, prose auto-link for rule/consequence text, person-card mobile line, key-holder line, call-first list). No literal, hardcoded `tel:` string was found in either file — every one is template-built, so exact digits could not be grepped directly, but the digit source is always `p.phone` / `ch.value` / fixture phone fields, i.e. §3 data. §5.1 #14, §5.6 #2, §6.2 rules pass on both by code inspection.

### State switcher (hash load / hashchange / postMessage / normalize / hidden)

Both files:
- Parse `location.hash` on `DOMContentLoaded` **and** call the paint/apply function immediately if `document.readyState !== 'loading'` at script-eval time (covers the render tool's direct-navigation case named in SPEC §4 and §9).
- Also listen for `hashchange`.
- Split hash tokens on `/[&,]/`, take the first `state-*` token, fall back to `state-directory` for anything unrecognized (including `null`/no token). Both accept the `nobar` token independently of position.
- `message` handlers: both reject non-object `ev.data`, reject non-string `state`, prefix `state-` when absent, and reject (return, no `eval`, no other field trusted) if the normalized value isn't one of the six `STATES`.
- Both use `.hidden = ...` (the DOM property) to swap the six state regions, never `style.display`.

§4 mechanics table and §7 #1 pass on both, code-verified line by line (see report body below for line citations).

### `prefers-reduced-motion` / both themes

```
grep -c 'prefers-reduced-motion' → 1440: 1   390: 1
grep -c 'data-theme'             → 1440: 2   390: 2
grep -c 'prefers-color-scheme'   → 1440: 1   390: 1
```
Both files carry the `@media (prefers-reduced-motion: reduce)` block (zeroing animation/transition durations) and both theme paths (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` plus `:root[data-theme="dark"] {…}`) verbatim from §2.1. §2, §7 #12 pass on both.

---

## 2. Render (SPEC §9)

`tools/render.mjs`'s `playwrightModulePath` already pointed at the absolute path fixed in round 1 (`/Users/kody/Code/patina-merged/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs`) — no edit was needed this round.

First attempt (sandboxed) failed exactly as the tool notes predict:
```
FATAL:base/apple/mach_port_rendezvous_mac.cc:155] Check failed: kr == KERN_SUCCESS.
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer...: Permission denied (1100)
```
Re-ran both render commands with the sandbox disabled for that one call only. Both completed clean:

```
Builder A (1440):
✓ people-room-state-directory-1440.png
✓ people-room-state-person-1440.png
✓ people-room-state-company-1440.png
✓ people-room-state-roster-1440.png
✓ people-room-state-add-1440.png
✓ people-room-state-access-1440.png
Console log: people-room-console.json (12 captures)

Builder B (390):
✓ people-room-state-directory-390.png
✓ people-room-state-person-390.png
✓ people-room-state-company-390.png
✓ people-room-state-roster-390.png
✓ people-room-state-add-390.png
✓ people-room-state-access-390.png
Console log: people-room-console.json (12 captures)
```

Console JSON summary (`shots/people-room-console.json`, all 12 captures):

| file | errors | warnings | horizontalOverflow |
|---|---|---|---|
| all 6 × 1440 | 0 | 0 | false |
| all 6 × 390 | 0 | 0 | false |

Zero errors, zero warnings, no horizontal overflow on any of the twelve captures. §9 and §10 #5 pass on both.

---

## 3. Plate-by-plate visual read

All twelve PNGs in `shots/` were viewed. No clipping, no overlap, no empty state region, no missing-font fallback box on any plate. Directory, person, company, add-sheet and site-access faces read as intended and match their §5 acceptance lists at both widths. Two real content divergences were found between the two widths on the **roster** face — see TR-1 and TR-2 below, both confirmed directly in the rendered plates (`people-room-state-roster-1440.png` vs `people-room-state-roster-390.png`), not just in source.

---

## 4. Re-check of every round-1 finding

| ID | R1 severity | Fixed in 1440? | Fixed in 390? | Notes |
|---|---|---|---|---|
| DR-1 (curly apostrophes) | blocking | **Fixed** — `grep -c $'’'` = 0 | **Fixed** — same | Confirmed clean both files |
| CR-1 (vitals recomputed from bands) | blocking | **Fixed** — `onNow` genuinely derived from the 3 bands, all 4 numbers computed (12·5·4·2) | **Partially fixed** — only the first number (`onJob`) is recomputed; the other three (`vitalsRest`) are still the pre-fix SPEC literal `9 · 5 · 6`, which the fixture does not support once the first number is corrected | **Still open** — see TR-1. 390's fix log claims this was deliberate ("not flagged"), but it produces a fact mismatch against 1440 for the identical cohort |
| CR-2 (company card per-firm) | blocking | **Fixed** — `renderCompany(cid)` / `data-company` click routing confirmed in code and on the Twin Cities Drywall & Plaster / Marrow & Sons company-card content | **Fixed** — equivalent `coFocus` pattern confirmed | |
| CR-3 (person card per-fixture) | major | **Fixed** — `renderPerson()`/`openPerson()` confirmed | **Fixed** — `pFocus` pattern confirmed | |
| CR-5 (role narrow on Call Sheet) | major | **Fixed** — `role="group"` narrow row present, 10 `ROLE_WORDS`-mapped chips | **Fixed, but inconsistent with 1440** — 14 chips built from the 13 raw `engagements[].kind` strings verbatim | Functionally present on both; see TR-4 for the divergence |
| CR-14 (blocked "Not on file" doc word) | major | **Fixed** — `docCells()`/`wordEl(..., 'blocked')` confirmed; COI workers-comp row renders terracotta | **Fixed** — `docWord()` equivalent confirmed | Visually confirmed on both company-card plates |
| DR-2 (console.json merge) | major | **Fixed** — this round's fresh two-command run produced one 12-capture file, order-independent | **Fixed** — same file | |
| TR-2 (390 "Log who was told" initial `aria-expanded`) | major | N/A (1440 was already correct) | **Fixed** — `aria-expanded="false"` static, panel has `hidden` at markup time | Both files now correct |
| CR-6 (rolodex/travel-list state) | major | **Still not fixed** — correctly returned; SPEC §4 fixes six states | **Still not fixed** — same | Left for Kody per both fix-log entries; SPEC's own six-state ceiling forecloses a code fix |
| CR-13 (invoice/CO visibility) | blocking | **Still not fixed** — correctly returned; requires a scope ruling | **Still not fixed** — same | Left for Kody |
| DR-3 (extra brace after token block, noted but not assigned in R1) | — | **Still present** | **Correct (no extra brace)** | Never assigned an owner in R1; still an open discrepancy — see TR-3 |

---

## 5. Findings, round 2

| ID | Severity | Confidence | File | State | Claim | Fix |
|---|---|---|---|---|---|---|
| TR-1 | **blocking** | high | `people-room-390.html` | `#state-roster` | The Call Sheet vitals line disagrees between the two widths for the identical fixture cohort. 1440 renders (dynamically computed) `12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper`. 390 renders `12 on the job this week · 9 reachable by text · 5 with accounts · 6 on paper` — confirmed both in source (`vitalsRest: '9 reachable by text · 5 with accounts · 6 on paper'` at line 540, concatenated with a freshly computed `onJob` at line 1033-1034) and visually in `shots/people-room-state-roster-390.png` vs `shots/people-room-state-roster-1440.png`. The 12-person cohort (`studio`+`client`+`week` bands: F-01,F-02,F-03,F-04,F-05,F-06,F-07,F-08,F-09,F-10,F-11,F-18) has exactly 5 people with `consent === 'Texting'` (F-04, F-06, F-08, F-09, F-11), 4 with `reach === 'Account'` (F-01, F-02, F-03, F-04) and 2 with `reach === 'On paper'` (F-05, F-10) — i.e. 1440's numbers are the ones actually supported by §3's fixture; 390's `9 · 5 · 6` are stale pre-fix literals that no longer square with the corrected first number. SPEC §3 requires "Both widths must show identical facts." | Recompute `vitalsRest` in `people-room-390.html` the same way 1440 does (tally `consent==='Texting'`, `reach==='Account'`, `reach==='On paper'` over the same `onJob` cohort), so both faces read `12 · 5 · 4 · 2`. |
| TR-2 | **blocking** | high | `people-room-390.html` | `#state-roster` | SPEC §5.4 #5 requires the literal string `Signs money to $2,500.` to appear on the Call Sheet (Chidi Okonkwo's authority line, client-side band). 1440 renders it literally (confirmed in `people-room-state-roster-1440.png` and in source, `e.authority` printed with no transform). 390 runs every authority/rule string through `deskFigure()`, which regex-replaces any `$`-figure with the string `the limit`; Chidi Okonkwo's row on 390 instead reads `Signs money to the limit.` plus an added line `The figure is on the desk.` (confirmed in `people-room-state-roster-390.png` and in source, `deskFigure`/`deskNote` at lines 616-617, 989-992). The required literal is therefore **absent from the 390 face** — a missing acceptance string under this task's blocking definition — and the two widths again disagree on a fact (§3). The 390 fix-log frames this as a deliberate ruled divergence from an unnamed "PR-t", but no ruling document exists in this directory and SPEC.md (the actual build contract both builders were told is the only file they may read) was not amended. | Either revert the `deskFigure` substitution on 390 so `Signs money to $2,500.` renders literally (matching 1440 and SPEC §5.4 #5 as written), or — if the money-redaction rule is real and ruled — apply the identical substitution to `people-room-1440.html` and get SPEC.md itself amended so the two builders' contracts agree; as it stands the two specimens contradict each other on a same-project fact. |
| TR-3 | major | high | `people-room-1440.html` | n/a (static markup, all states) | SPEC §2 instructs pasting §2.1 verbatim (which ends unclosed, 3 closing braces for 4 opens) then appending **exactly one** closing `}` on its own line, "nothing else changes." `people-room-1440.html` has **two** closing braces after `--sage-ink: #AFC0A6;` (lines 90-91: `}\n}`), while `people-room-390.html` has exactly one (line 90 only) — confirmed by brace-balance trace of the whole `<style>` block (1440 ends the block at net balance ‑1; 390 ends at net balance 0). This is functionally harmless (a stray top-level `}` is a no-op per CSS error recovery, and every subsequent selector in 1440 still opens/closes its own braces correctly — confirmed no visual break on any 1440 plate), but it is a literal violation of §2's "nothing else changes" and fails §10 check #6 ("byte for byte as pasted in §2, plus the one appended `}`") on the 1440 file specifically. This was already surfaced as "DR-3" in `review/fix-log-r1.md` and explicitly left unassigned/unresolved ("one of them should be corrected once someone rules which reading wins") — it is **still open**. | Delete the extra `}` at line 91 of `people-room-1440.html` so its token block matches 390's (and the literal §2 instruction) exactly. |
| TR-4 | major | medium | `people-room-390.html` (vs. 1440) | `#state-roster` | The Call Sheet's "Narrow the call sheet by role" `role="group"` (a CR-5 round-1 addition, not itself in SPEC §5) is implemented with materially different content on the two widths. 1440: 10 chips derived through a `ROLE_WORDS` map that groups engagement kinds into Title Case, plural, human words — `Studio, Client, GC, Subs, Receiver, Architect, Inspectors, Makers, Stager, Photographer` (line 987-991). 390: 14 chips built directly from the 13 distinct raw `engagements[].kind` strings, unmodified — `lead designer, bookkeeper, principal, client, household member, gc, sub, receiver, architect, inspector, maker, stager, photographer` (lines 1035-1041), all lowercase, several singular/ungrouped. This is the same feature reading as two different products depending on width: different chip count (11 incl. Everyone vs. 14), different casing convention (Title Case vs. all-lowercase, inconsistent with every other chip row in the room — Directory's "Everyone / Clients / Crew / Makers / Studio / Firms" is capitalized on both widths), and arguably some 390 labels ("gc", "sub") read as internal/abbreviated tokens rather than "plain, present-tense, sentence-case English, the studio's words" (§8 #3's voice rule, even though "gc"/"sub" aren't on the literal forbidden-token list). | Port 1440's `ROLE_WORDS` grouping (or an equivalent) into 390 so both widths narrow the Call Sheet by the same set of human-readable, consistently-cased role words. |
| TR-5 | minor | medium | `people-room-390.html` (vs. 1440) | `#state-person` | The "Reach & access" region's three sub-heads (`Channels`, `Contact rule`, `Access grants`, required in this order by SPEC §5.2 #2) carry different typography between widths for identical content. 1440 marks them up as `<p class="t-head sub-head">Channels</p>` (line 784 etc.) — DM Mono, uppercase, `.08em` tracking, per §2.3's `.t-head` type-scale spec — and the plates show them as `CHANNELS`, `CONTACT RULE`, `ACCESS GRANTS`. 390 marks the same labels as `<p class="sub-head">Channels</p>` only (line 773 etc.), and `.sub-head` in 390's own CSS (line 247) is a completely separate rule (Inter body font, 14px, sentence case, no `text-transform`) — the plates show them as `Channels`, `Contact rule`, `Access grants`, sentence case. Same order, same words, visibly different type treatment depending on width. Not a SPEC letter violation (SPEC doesn't mandate `.t-head` specifically for these labels) but a design-consistency gap between the two "same product, two widths" specimens. | Add the `t-head` class to 390's three sub-head `<p>` tags (or drop it from 1440's) so both widths render the region sub-heads with one consistent treatment. |

### Not re-raised (checked, no longer applicable or genuinely resolved)

- CR-6 and CR-13 remain correctly un-fixed on both files, per both fix-log entries' own reasoning (SPEC's six-state ceiling forecloses a code fix; both need a scope ruling from Kody, not a build change). Not re-raised as new findings — they were already flagged and explicitly returned in round 1.

---

## 6. Gate summary

| Check | 1440 | 390 |
|---|---|---|
| Last line exact | ✅ | ✅ |
| `box-shadow\|text-overflow\|placeholder=\| disabled` grep | 0 | 0 |
| `eval(` | 0 | 0 |
| External hosts beyond fonts.googleapis.com/fonts.gstatic.com | none | none |
| Hex literals outside token block | 0 | 0 |
| Class fragment byte-identical to `_people-style-fragment.html` | ✅ | ✅ |
| Token block byte-identical to `_tokens-reference.css` + exactly one appended `}` | ❌ (TR-3: two appended braces) | ✅ |
| Heading order / one `<h1>` | ✅ | ✅ |
| Exactly one `role="status"` | ✅ | ✅ |
| Every `aria-expanded` has a resolving `aria-controls` | ✅ | ✅ |
| No `<a>` inside `<button>` | ✅ | ✅ |
| `tel:` links for phones, `tel:+1<digits>` format | ✅ | ✅ |
| State switcher: load hash + hashchange + postMessage, normalized, unknown ignored | ✅ | ✅ |
| `hidden` property used for state switching | ✅ | ✅ |
| `prefers-reduced-motion` block present | ✅ | ✅ |
| Both theme paths (`prefers-color-scheme` + `[data-theme]`) present | ✅ | ✅ |
| Render: 12 captures, 0 errors, 0 warnings, no overflow | ✅ | ✅ |
| Both widths show identical facts (§3) | ❌ TR-1, TR-2 | ❌ TR-1, TR-2 |

**Not clean**: two blocking findings (TR-1, TR-2), both on `people-room-390.html`, both being disagreements between the two supposedly-identical specimens on Call Sheet facts. `people-room-1440.html` alone has zero blocking findings but one open major (TR-3, carried over from round 1's unassigned DR-3) plus two cross-file majors/minors (TR-4, TR-5) that implicate 390's implementation, not 1440's.
