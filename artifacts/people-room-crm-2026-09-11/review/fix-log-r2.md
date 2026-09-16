# Fix log, review round 2

## specimens/people-room-1440.html (Builder A, the 1200 band at 1440)

Ten findings assigned. Four fixed in the file, six returned as deviations (five need Kody's
ruling, one belongs to the other width's file).

| ID | Severity | What changed | Where |
|---|---|---|---|
| TR-3 | major | Deleted the second closing brace after `--sage-ink: #AFC0A6;`. The pasted §2.1 token block now closes with exactly one appended `}` on its own line, matching SPEC §2's "append one closing brace, nothing else changes" and matching `people-room-390.html` byte for byte. Verified: `diff <(sed -n '11,90p' people-room-1440.html) _tokens-reference.css` → the single line `80d79 < }` (the one instructed brace) and nothing else; the §2.2 class fragment at lines 92–139 is still byte-identical to `_people-style-fragment.html:9-56`. | line 91, the `<style>` block |
| CR2-3 | blocking | Claire Bissett (F-20) and her firm are now reachable from the face. `DIR_PEOPLE` gained `'F-20'` (appended after `'F-27'`, so SPEC §5.1 #5's ten named rows keep their order) and `DIR_FIRMS` gained `'stonehaven'`. Two paths now reach her card: the Directory person row "Claire Bissett · Stonehaven Tile Gallery · showroom rep · (612) 555-0120 · ON PAPER · CURRENT · 0 seats" opens her person card directly, and the Directory firm row "Stonehaven Tile Gallery · Showroom · 1 on the crew · 2 open jobs · CURRENT" opens the company card, whose Crew & designations line "Claire Bissett · showroom rep" links through to the same card. Walked headlessly: `button[data-person="F-20"]` → card name "Claire Bissett", meta "Stonehaven Tile Gallery · showroom rep"; `button[data-company="stonehaven"]` → "Stonehaven Tile Gallery · Showroom · 1 person · 2 projects" → crew link → "Claire Bissett". Her card degrades honestly on the fixture: no engagement, so "No open seat on this project."; no typed-channel record, so her phone and email print from the person row; no rule, grant or documents, so those regions read "No contact rule on file." / "No grant on file." and Paper/History are absent. No new person, firm or phone: F-20, `stonehaven` and `(612) 555-0120` are all §3 fixture rows. | `DIR_PEOPLE`, `DIR_FIRMS` |
| CR2-6 | blocking | The Add sheet's kind picker performs. Each of the eight words now carries `data-kind` and a `js-kind` class; clicking one sets `addKind` and re-renders `#face-add` through a new `sheetFor(kind)`, which builds the sheet out of the fixture person that kind names (`KIND_SOURCE`: a client → F-04 Adaeze Okonkwo, a household member → F-05 Chidi Okonkwo, a maker → F-20 Claire Bissett, a GC → F-07 Tom Marrow, a receiver → F-06 Ngozi Eze, someone else → F-27 Ray Thao). `a sub` returns `FIXTURE.addSheet` itself, unchanged, so the default face and every SPEC §5.5 string on it are untouched. COMPANY and TRADE now render only for the kinds that carry a firm (`KIND_FIRM`: maker, GC, sub, installer, someone else) — picking "a household member" drops them, which is the nonsense the finding named. Name, firm, trade, mobile, email, contact rule, authority and consent each come from `P`/`C`/`ENG`/`RULE`/`CONSENT`, never invented: "a household member" shows Chidi Okonkwo, no company, rule "Email first. Call for anything over $2,500."; "someone else" shows Ray Thao, City of Minneapolis, CPED Inspections, rule "Never text. Office phone or the 311 portal only."; "a receiver" shows Ngozi Eze with her real written consent, method `written`, evidence "Site kickoff form, 10 October 2026."; "an installer" (no fixture person) opens a blank sheet reading "Nothing is added to the Okonkwo residence Call Sheet until you name someone." Kinds with no consent row show the checkbox unchecked and the line "No consent recorded yet." instead of asserting a method. SPEC §5.5 #15's "He is invited, not consenting, until he replies YES." prints only on the sub sheet it describes. | `KIND_SOURCE`, `KIND_FIRM`, `addKind`, `sheetFor()`, `renderAdd()`, the `js-kind` click branch |
| CR2-5 | blocking | Two acts now set the authority, so direction.md §6's "1 to confirm the authority defaulted from the agreement" is walkable. (1) **Add sheet** — a new "Authority" region between the contact rule and the consent block: field `AUTHORITY ON THIS JOB` holding the kind's defaulted sentence, a note reading "Defaulted from the agreement." (or "Nothing defaulted from the agreement." when the fixture carries none), and a `js-authority` act labelled "Confirm from the agreement" (or "Record the authority"). Clicking it rewrites the note to "Authority recorded for this seat." and announces "Authority recorded." into the page's single `role="status"`. Picking "a household member" therefore shows "Signs money to $2,500." defaulted and confirms it in one click — Leah's Task 2, end to end. (2) **Person card, Seats on projects** — a tertiary act "Edit the authority" with `aria-expanded="false"` and `aria-controls="authority-band"` opening an inline band (never a modal) holding `AUTHORITY ON THIS JOB` and a "Save the authority" act; saving writes the value onto `#seat-authority`, collapses the band, resets `aria-expanded`, and announces "Authority saved." Walked headlessly on Dana Kowalski: "No authority on this job" → open → type → save → "Prices change orders.", band hidden, `aria-expanded="false"`, live region "Authority saved." | `renderPerson()` Seats region, `renderAdd()` Authority region, the `js-authority` and `js-save-authority` click branches |

### Not fixed

| ID | Severity | Why |
|---|---|---|
| CR-13 / CR2-4 | blocking | Unchanged from round 1: the fix needs Kody's ruling on whether an invoice or change-order face is in the People Room's scope. SPEC §4 fixes the state list at six, §4's switching rule keeps exactly one of those six in flow, and §9's render command names six hashes — a seventh face cannot be added inside this contract. The alternative, softening direction.md §6's Task 2 acceptance wording ("visible on the invoice or CO that needs it"), is the ruling itself. Returned. **Note**: CR2-5 has now closed the half of Task 2 that was buildable here — the authority grant is set and confirmed by a real act on this face. What remains open is only the surface it must then appear on. |
| CR-6 / CR2-2 | blocking | Unchanged from round 1: a rolodex picker with a travel-list pane is a seventh state, foreclosed by SPEC §4 for the same reason as CR-13. Scoping Leah's Task 5 out of direction.md §6 is a panel-document ruling shared with the 390 fixer, not a unilateral build change. Returned. **Note**: CR2-3 has closed the concrete dead end the reviewer named — Claire Bissett and Stonehaven Tile Gallery are now reachable in two clicks from the Directory, so the vendor rep has a card; what is still missing is the multi-select bring-forward pane itself. |
| CR2-1 | blocking | The finding's own fix is "recompute `vitalsRest` **in the 390 file**". `people-room-1440.html` is the file the reviewers verified as correct: it computes all four numbers live off the three printed bands and renders "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper", which is what §3's fixture supports (12-person `studio`+`client`+`week` cohort; 5 × `consent: "Texting"` = F-04, F-06, F-08, F-09, F-11; 4 × `reach: "Account"` = F-01, F-02, F-03, F-04; 2 × `reach: "On paper"` = F-05, F-10). Re-verified on the plate after this round's render. No edit made — the brief forbids touching the other width's file. |
| CR2-11 | major | This one asks for a ruling, and the ruling could go either way on the fixture as written. The firm-level word is the firm's `paper` summary; Great Northern Bank and CPED Inspections both read `Not on file` while blocking nothing on this job (neither carries a `documents` array, and no engagement of theirs is held), so painting them terracotta would assert a consequence the fixture does not carry — the opposite error to the one CR-14 fixed on the document rows, where a real `blocks` array exists. SPEC names no token for `Not on file` at the firm level either (§5.1 #10 requires only the word on Ray Thao's row). Left dormant and returned for Kody's ruling, as the round-1 log flagged. |

### Deviation carried forward, not re-opened

- **SPEC §5.4 #3's vitals literal.** SPEC spells "14 on the job this week · 9 reachable by text · 5 with accounts · 6 on paper". Round 1's CR-1 replaced the literal with a live tally off the printed bands, which reads "12 · 5 · 4 · 2". Both round-2 reviewers confirmed the computed figures are the fixture-supported ones and asked 390 to match 1440, so the deviation stands as recorded.

### Gate

```
$ tail -1 specimens/people-room-1440.html
<!-- specimen-complete -->

$ grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled' specimens/people-room-1440.html
0
box-shadow 0 · text-overflow 0 · placeholder= 0 · ' disabled' 0 · eval( 0 · opacity 0 · U+2019 0

$ grep -n '#[0-9A-Fa-f]\{6\}' specimens/people-room-1440.html   # outside lines 11-90
(none)

$ wc -c specimens/people-room-1440.html
   88150

$ node tools/render.mjs specimens/people-room-1440.html --out shots --name people-room \
    --widths 1440 --hashes state-directory,state-person,state-company,state-roster,state-add,state-access --console
✓ people-room-state-directory-1440.png
✓ people-room-state-person-1440.png
✓ people-room-state-company-1440.png
✓ people-room-state-roster-1440.png
✓ people-room-state-add-1440.png
✓ people-room-state-access-1440.png
Console log: people-room-console.json (12 captures)
```

- `shots/people-room-console.json`: 12 captures, **0 errors, 0 warnings, `horizontalOverflow: false` on every one** (six at 1440 from this run, six at 390 merged from the other builder's).
- §10 #3 re-verified programmatically: every SPEC §5 acceptance string for all six states is on the face (53 directory · 33 person · 30 company · 49 roster · 32 add · 21 access = 218 strings, 0 missing), checked against `textContent` plus every `input`/`textarea`/`select` value so `text-transform: uppercase` and field values are both covered.
- One `<h1>`, one `role="status"`, 0 duplicate `id`s across the whole document, 0 `aria-controls` without a resolving `id`, 0 `<a>` inside a `<button>` — re-checked after the new fields and bands were added.
- No forbidden vocabulary on any face, including all eight Add-sheet kinds: scanned for Lorem/example/sample/TBD/placeholder/AI/CRM/dashboard/wizard/badge/pill/chip/modal/toast/spinner/specimen/prototype/fictional, the schema words of §8 #3, and "Remove" → 0 hits.
- Every name, firm and phone added this round is a §3 fixture row (F-20 Claire Bissett, `stonehaven`, `(612) 555-0120`; F-04, F-05, F-06, F-07, F-27 and their firms on the Add sheet's other kinds).

### Tool note

`tools/render.mjs`'s `playwrightModulePath` already held the absolute path from round 1; no edit was needed. The first render attempt failed inside the sandbox with the predicted Chromium bootstrap error (`FATAL:base/apple/mach_port_rendezvous_mac.cc:155 ... bootstrap_check_in ...: Permission denied (1100)`); that one command was re-run with the sandbox disabled and completed clean.
