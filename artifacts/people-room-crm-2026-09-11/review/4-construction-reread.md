# Construction re-read, round 4

CS1 (GC/PM) and CS4 (electrical sub owner), plus Leah's six tasks under the amended §6 acceptance,
re-walking `specimens/people-room-1440.html` and `specimens/people-room-390.html` after
`review/fix-log-r3.md` and orchestrator rulings R-A..R-E. Every claim below is grep- or
read-verified against the two current HTML files or the fourteen PNGs in `shots/`; a small
Python extraction of the embedded `FIXTURE` object was used only to re-derive the vitals tally
(no build, no pnpm, no server). Line numbers cite `people-room-1440.html` unless marked 390.

Gate facts, re-verified independently:

```
wc -c                                                          → 96079 (1440), 97195 (390)
tail -1 (both files)                                           → <!-- specimen-complete -->
grep -c 'box-shadow\|text-overflow\| disabled'                 → 0, 0 (both)
grep -c 'placeholder='                                         → 0, 0 (both)
grep -c 'licen[sc]e' (British spelling, "licence")              → 6 (1440), 4 (390); 0 "license" either file
grep -c 'Remove'                                                → 0, 0 (both)
grep -c '<input\|<textarea\|contenteditable' → all inside studio-only regions, both files
shots/*-console.json                                            → 14 captures total, 0 errors, 0 warnings,
                                                                   horizontalOverflow:false on all 14
FIXTURE re-derived (python json.loads, both files)              → identical vitals arithmetic: 12/5/4/2
```

---

## 1. Prior findings (fix-log-r3.md / round 3): fixed, ruled out, or still open

| ID | R3 status | R4 status | Evidence |
|---|---|---|---|
| CR3-1 / CR-6 (no bring-forward picker) | blocking, returned for a ruling | **Fixed, both widths**, per R-C | `#state-pick` present in both `STATES` arrays (`1440:1420`, `390` `STATES` list); `renderPick()`/`PICK_ROWS` render five mini rows, checkboxes are live (`pickUpdate()`/`pick-box` change handling recomputes count, terminal label and consequence sentence); plates `people-room-*-state-pick-*.png` show the full SPEC §5.7 face on both widths, 0 console errors, `horizontalOverflow:false` |
| CR3-2 / CR-13 (no invoice/CO screen for Task 2's acceptance) | blocking, returned for a ruling | **Disposed by R-B** (acceptance amended to move the invoice/CO clause to the money book) — no build, and none needed; Task 2 now verified Met (§3 below) | `grep -c invoice` → 0, 0 both files, expected per R-B |
| CR3-3 / CR2-11 (no paper word for lender/inspector firms) | major, returned for a ruling | **Fixed, both widths**, per R-A | `noPaperHeld()`/`holdsNoPaper()` derive the class from the fixture (every person at the firm sits in an `inspector` engagement); four print sites suppress the word in each file (Directory person-row suffix, Directory firm row, Call Sheet unfold, company card Paper region → "No paper is held for this firm."); confirmed on `people-room-1440-state-directory-1440.png` — Ray Thao's row now reads `ON PAPER` / `NOT ASKED` / `AWARDED` and a blank fourth column, never "Not on file" |
| CR3-4 / CR2-7 (British "licence" spelling) | minor, not actioned (SPEC fixture text) | **Still open, both widths, correctly not actioned by a builder** | `grep -o "licen[sc]e"` → 6 hits (1440), 4 hits (390), all "licence," 0 "license"; the strings live inside SPEC §3's verbatim fixture JSON, which §2/§3 require pasted unmodified — this is a SPEC/fixture-owner edit, not a specimen defect |
| CR3-5 / CR2-8 (dead "Compare & merge") | minor, returned (needs a both-widths instruction) | **Still open, both widths, unchanged since r3** | `people-room-1440.html:706-708` / `people-room-390.html:706-707`ish (band text unchanged): "These two cards share a phone. Compare them?" / `<button class="act act--secondary">Compare &amp; merge</button>` — no card names, no `data-*` target, no handler in either file's delegation block |
| CR3-6 / CR2-9 (no schedule-authority example) | minor, not actioned (needs a fixture fact) | **Still open, both widths** | Full dump of every `"authority": "..."` string in both files still has no mention of schedule/slip/date |
| CR3-7 / CR2-10 (homeowner "Holds a key" ambiguous vs. the site access card's key holder) | minor, not actioned (needs a fixture cue) | **Still open, both widths** | F-04/F-05/F-06 all resolve to "Holds a key." on the person card with no cross-reference to the site access card's single designated key holder (Ngozi Eze) |
| CR3-8 (390: Add sheet asserted a false "the agreement set this" provenance for Joe Wozniak, who has no agreement) | blocking, names 390 only | **Fixed** | `people-room-390.html:1148-1151`'s `addSheetFor()` now returns `authority: ''` for the base/default branch; `renderAdd()` prints the empty branch ("Nothing defaulted from the agreement." / "Record the authority") exactly like 1440. Confirmed on `people-room-390-state-add-390.png`: empty AUTHORITY field, correct copy — matches `people-room-1440-state-add-1440.png` byte-for-byte on this branch |
| CR3-9 (390: Stonehaven Tile Gallery unreachable from the Directory) | blocking, names 390 only | **Fixed** | `people-room-390.html:660` `DIR_FIRMS` is now `['marrow', 'northgate', 'tcdrywall', 'stonehaven']`, identical to 1440's `:654`; confirmed on `people-room-390-state-directory-390.png` — Stonehaven now lists as a fourth Firms row, openable |
| CR3-10 / DR-3 (kind-picker example person diverges by width) | minor, needed a ruling (R-E) | **Fixed, both widths, per R-E** | 1440's `KIND_SOURCE` and 390's `ADD_EXAMPLE` are now byte-equivalent: `'a maker': 'F-20'`, `'someone else': 'F-27'`, `'an installer'` unmapped in both (falls to the blank "Nothing is added..." sheet in both) |
| CR3-11 (Add sheet region order diverges: Authority position) | minor, no ruling named an order | **Fixed — 390 now matches 1440's order** (Contact rule → Authority → Consent), confirmed on both plates | `people-room-1440.html:1178-1191`; `people-room-390.html` renderAdd region order now identical |
| CR3-12 (Person card act order diverges: "Edit the authority" position) | minor, no ruling named an order | **Fixed — 390 now matches 1440's order** (window → authority → Escorted on site → Contracted through → Hidden from the client → act) | confirmed on `people-room-*-state-person-*.png`, both widths now read identically |
| R-D disposition (Dana Kowalski's seat window) | fixture correction ordered | **Applied, both widths, byte-identical** | `grep -c 2027-03-13` → 0 both; `grep -c seatTo` → 0 (1440); `"to": "2027-08-13"` at engagement, field-link `ends`, and `substantialCompletion` all agree in both files; Directory, person card and roster all print "12 Oct 2026 to 13 Aug 2027" |

No prior finding is misreported as fixed in fix-log-r3 that a re-check contradicts. Four of the twelve round-3 items remain open by design (CR3-4 through CR3-7 all require a SPEC-owner or fixture-owner move, not a specimen edit, and both fix logs say so explicitly).

---

## 2. CS1 and CS4's top-5 asks — tracked where, re-verified this round

| # | Ask (CS1 / CS4 wording) | Tracked on the face? | State (hash) | Change since round 3 |
|---|---|---|---|---|
| 1 | Compliance document with expiry on the firm: COI, W-9, license, per-draw waiver (CS1-1, CS4-1) | **Yes**, document-row level (Company card "Paper" table: Type/Number/Issuer/Expires/State/Held by/Blocks). **Firm-level rollup word now also correct** for firms with no paper to hold — R-A closed CR3-3/CR2-11, the one remaining gap in this ask. Per-draw waiver stays a link-out ("Draw 1 waiver ledger, in the money book"), consistent with P2 phasing | `#state-company`, `#state-directory`, `#state-roster` | CR2-11/CR3-3 closed this round |
| 2 | Authority set: money limit, CO, schedule, site access, key (CS1-2, CS4-3) | Partially. Person card "Edit the authority" band and Add-sheet "Authority" region are both real acts on both widths, with correct provenance ("Nothing defaulted" vs "the agreement set this," now non-fabricated on 390 too — CR3-8 closed). **Schedule remains absent from the authority vocabulary entirely** — untested on any face | `#state-person`, `#state-add`, `#state-roster` | CR3-8's correctness defect closed; CR3-6's fixture gap (schedule) still open |
| 3 | Contact rule: primary, never, route-through (CS1-3, CS4-2/5) | **Yes**, unchanged and re-confirmed this round. Frank Bauer / Rosa Delgado wired across Directory person row, Directory firm row, roster row, company card's "Crew & designations" line (`designations.paperworkContact/signer/siteContact`, `tcdrywall:392`); Ray Thao's never-text rule on person row and roster | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` | No change |
| 4 | Phone-scoped consent shown truthfully, carried forward (CS1-4, CS4-6) | **Yes**, unchanged. Pete Rusk reads `OPTED OUT` with "Opted out by text, 3 December 2025, on the Lindqvist kitchen." everywhere he appears, including the new `#state-pick` row (`row.note`/`c.note` on both files) | `#state-directory`, `#state-person`, `#state-roster`, `#state-pick` (new this round) | Now also demonstrated at the moment of picking, per Task 5 |
| 5 | Relationship stage + `warranty_until` + link lifetime tied to the job (CS1-5/8/23, CS4-15/17) | **Yes**, and now internally consistent. Company card: "warranty through 21 Nov 2026." Person card access grant: "Ends with the job, 13 August 2027. Renews when they use it." Seat window on the same card now also reads "12 Oct 2026 to 13 Aug 2027" — **the R-D fix removes what would otherwise have been a within-card inconsistency** (grant end date vs. seat end date, previously 2027-08-13 vs. 2027-03-13) | `#state-company`, `#state-person`, `#state-roster` | R-D closed a latent internal-consistency gap on this ask |

Both seats' top-5 lists are now tracked on the face with only two open gaps left in the whole set: schedule-authority (needs a fixture fact) and per-draw waiver detail (deliberately deferred to P2/the money book, not a gap in this round's scope).

---

## 3. Leah's six tasks — amended acceptance, state, act count (re-walked on the current files)

| Task | Amended acceptance | Met? | State(s) | Acts |
|---|---|---|---|---|
| 1. Add Dana text-only | A rule every add/send/edit honors, ≤2 clicks (unchanged by R-A..R-E) | **Met** | `#state-add` (mechanic demonstrated on Joe Wozniak, SPEC's own default subject) → persists on Dana's own `#state-directory`/`#state-person`/`#state-roster` rows with no re-entry | 1 field filled once in the Add sheet; reads on 3+ downstream faces automatically |
| 2. Give Adaeze the app; note Chidi signs $2,500 | **Amended (R-B):** "A login and an authority grant recorded as two separate facts, the grant visible on the person card and on the Call Sheet's client side. The invoice and change-order surfaces read it later, in the money book." | **Met** under the amended text | `#state-roster` (Client side band: Adaeze "Selections." / `Account`; Chidi "Signs money to $2,500." / `On paper`) + `#state-add` (kind "a household member" resolves to F-05/Chidi, `sheet.authority`/`a.authority` = "Signs money to $2,500.", pre-filled, act "Confirm from the agreement") | 0 clicks — both facts already stand on the roster's Client side band as shipped; 1 click on the Add sheet's kind picker to see the authority default in the add-flow. No invoice/CO screen exists, and R-B rules none is required — the acceptance clause is explicitly satisfied by deferring that reading surface to the money book |
| 3. Site access, one screen | Unchanged: key holder, gate control, hours, who-was-told, from one screen | **Met** | `#state-access` | 1 click from the nav bar; identical strings on both widths (`4412 Fremont Ave S...` through "LOG WHO WAS TOLD") |
| 4. Do-not-contact Frank; route to Rosa | Unchanged: every attempted contact + future pick shows "write Rosa instead" | **Met** | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` | 0 additional clicks once any of the four surfaces is open, both widths |
| 5. Bring 3 Lindqvist subs + Stonehaven's rep onto Okonkwo | Unchanged: each arrives with consent, doc status, one history line; never old pricing | **Met, now buildable** — closed by R-C's `#state-pick` | `#state-pick` | As shipped (a "mid-flow" specimen state per SPEC §4, matching the Add sheet's own "mid-flow" convention): 2 acts — click "Bring forward" from the nav, then "Add four to the roster" — because the search ("Lindqvist") and the correct 4-of-5 selection (Dana, Pete, Ingrid, Claire; Ben Ostrom correctly left unchecked) are the state's own starting point, per SPEC §4's description of the hash. The search field itself has no live-filter handler in either file (decorative, consistent with the rest of the specimen's static fields) — a real build would add typing before this point, which is out of scope for a specimen |
| 6. Everyone by role, this week | Unchanged: narrows to on-site-this-week, excludes unopened/closed windows | **Met** | `#state-roster` | 1 click to open (already banded this-week/later/bidding/done) + 1 click on a role pill (11 chips including "Inspectors," both widths) |

All six tasks are now Met under the current rulings. Tasks 2 and 5 — the two carried blocking items from round 3 — are both closed: Task 2 by R-B's textual amendment (verified against the actual roster and add-sheet output, not just asserted), Task 5 by R-C's new state (verified against both plates and the live checkbox/consequence-sentence wiring).

---

## 4. Facts on a face a GC or sub would read as wrong, naive, or unusable

| Finding | Severity | Confidence | Evidence |
|---|---|---|---|
| **CR4-1** (= CR3-4 = CR2-7, carried). "MN BC contractor licence," "MN electrical contractor licence," "holds the trade licence" — British spelling a Minneapolis GC or electrician reads as a typo (MN DLI issues "licenses") | Minor | High | `grep -o "licen[sc]e"`: 6/4 hits, all "licence," 0 "license," both files. Lives in SPEC §3's verbatim fixture; a fixture-owner edit, not a build fix |
| **CR4-2** (= CR3-5 = CR2-8, carried). "These two cards share a phone. Compare them?" names no cards; "Compare & merge" has no click target or handler in either file | Minor | Medium | `people-room-1440.html:706-708`; equivalent band in `people-room-390.html` — unchanged since r2 |
| **CR4-3** (= CR3-6 = CR2-9, carried). The authority vocabulary CS1-2/CS4-3 claims includes "schedule" (who may propose/accept a slip) alongside money, CO, site, key — no engagement in the fixture demonstrates it, so it is untested on any face | Minor | Medium | All 14 distinct `"authority": "..."` strings across both files dumped; none mention schedule/slip/date |
| **CR4-4** (= CR3-7 = CR2-10, carried). Three homeowners/receivers ("Holds a key.") read identically to the site access card's one designated key holder (Ngozi Eze); no cue distinguishes "holds a key to their own house" from "is the studio's site contact for keys" | Minor | Low | `ACCESS_WORDS`/engagement rows for F-04, F-05, F-06 vs. the site access card naming only Ngozi Eze |
| **CR4-5 — new.** SPEC §5.4 #3's literal vitals string, "14 on the job this week · 9 reachable by text · 5 with accounts · 6 on paper," has never been on either face since round 1; both files instead print a live-recomputed "12 · 5 · 4 · 2," which is what the fixture's own studio/client/week bands actually sum to. Both widths agree with each other (re-derived independently: 12 people in those three bands, 5 `consent:"Texting"`, 4 `reach:"Account"`, 2 `reach:"On paper"` in both embedded FIXTURE objects) but neither agrees with SPEC's own acceptance text, and — unlike Dana's window (R-D) — this SPEC/fixture conflict has never been given an explicit ruling correcting the SPEC literal, only a round-1 engineering decision to recompute rather than hardcode a false number. A GC skimming the Call Sheet reads real, internally-consistent numbers; the risk is purely that SPEC §5.4 #3 still names four digits nothing on either face will ever show | Blocking (missing acceptance string, mechanically) | High | `grep -n 'on the job this week'` both files (live `onNow`/`tally()` computation, identical logic); Python re-derivation of both embedded FIXTURE objects independently: `12 5 4 2` both files; SPEC.md:529-548 §5.4 #3 still reads the literal "14 · 9 · 5 · 6." Recommend the same disposition pattern as R-D: a ruling amending SPEC §5.4 #3's literal to "12 · 5 · 4 · 2" to match the fixture, closing the gap the way R-D closed Dana's window — carried unaddressed since fix-log-r1 (`fix-log-r1.md:86`), never previously raised at this severity |
| **CR4-6 — new.** The two widths' brand-new `#state-pick` search field carries a different label for the identical fact (the value "Lindqvist" in a search box): 1440 labels it "SEARCH THE ROLODEX" (`:1199`), 390 labels it "WHO ARE YOU LOOKING FOR" (`:1248`). SPEC §5.7 #3 requires only that the field hold the value "Lindqvist," not a specific label, so this is not a SPEC violation, but the two builders independently built this state without a shared source for a screen a reviewer will compare side by side — the same root cause as round 3's CR3-10/11/12 | Minor | High | `people-room-1440.html:1199` vs. `people-room-390.html:1248` |
| **CR4-7 — new.** The Add sheet's non-empty-authority note text differs by width for the identical fact (an authority string defaulted from the agreement): 1440 prints "Defaulted from the agreement." (`:1334`); 390 prints "The agreement set this. Confirm it, or write a different one." (`:1187`) — the orchestrator's ruling wording, per fix-log-r3's own flagged deviation ("Flagged so the pair can be settled in one direction," `fix-log-r3.md:100`). Still unsettled this round; neither file was told to change | Minor | High | `people-room-1440.html:1334`; `people-room-390.html:1187`; `fix-log-r3.md:100` (self-reported, unresolved) |
| **CR4-8 — new.** `people-room-1440.html`'s `@media (forced-colors: active)` block includes `.check-line input, .pick-check input { appearance: auto; -webkit-appearance: auto; }` (`:314`), restoring the native checkbox (and its tick glyph) under Windows High Contrast Mode so the custom ink-fill checkbox stays visible/legible there; `people-room-390.html`'s equivalent `forced-colors` block (`:290-294`) has no such rule for `.pick-box`/`.check` inputs, so its custom-styled checkboxes (including the new `#state-pick` picker) may render without a visible checked state under forced-colors on that width only. Not exercised by any of the 14 plates (the render tool does not simulate `forced-colors`), so this is a code-level cross-width gap rather than an observed visual defect | Minor | Medium | `people-room-1440.html:314` vs. `people-room-390.html:290-294` |

No wrong facts were found on either face this round — every date, name, phone, firm affiliation and status word checked (Dana's window, the vitals arithmetic, the 29/22 header count, the paper-word rollup for lender/inspector firms, the Frank/Rosa/Northgate/TC-Drywall affiliations) is internally consistent and consistent across both widths. The eight items above are all either long-carried, SPEC/fixture-owner items already declined by two prior rounds (CR4-1 through CR4-4), a fresh SPEC-arithmetic gap surfaced at its correct mechanical severity for the first time this round (CR4-5), or small new cross-width copy/code divergences from this round's two independently-built `#state-pick`/Authority-copy additions (CR4-6 through CR4-8).

---

## 5. Trade- or homeowner-facing writing surfaces

**None found, on either width — re-confirmed against the current files, including `#state-pick`.**

```
grep -n "<input\|<textarea\|contenteditable" people-room-1440.html
  → f-authority-edit (person card, studio-only inline band)
  → f-* Add-sheet fields incl. f-authority (studio-only)
  → f-consent checkboxes ×2 branches (studio-only Add sheet)
  → f-told (Site access "Log who was told," studio-only)
  → f-rolodex (Bring-forward search field, studio-only DocSheet region)
  → pick-* checkboxes (Bring-forward selection, studio-only)
grep -n "<input\|<textarea\|contenteditable" people-room-390.html
  → same shape, plus f-pick-search and .pick-box (studio-only)
```

Every writing surface, old and new, sits inside a studio-only screen: the Add sheet, the person card's authority-edit band, the site access card's notice log, and the new Bring-forward picker. The site access card still states this explicitly on both widths: "Studio only. This card never reaches a client page." No upload door, no field-link write act (`grep -n upload` → 0 hits both files), and no rolodex-side trade input exist anywhere. The Bring-forward picker's own checkboxes and search field are likewise reachable only from the state bar / Call Sheet, never from any client- or trade-facing surface — confirmed by grepping both files for any `data-` hook that would expose `state-pick` outside the internal nav (none exists).

---

## Summary

Round 3's four blocking findings are now all disposed of: CR3-1/CR-6 and CR3-2/CR-13 by orchestrator rulings (R-C's new `#state-pick`, R-B's amended Task 2 acceptance), CR3-8 and CR3-9 by direct fixes on `people-room-390.html`. Round 3's one major finding (CR3-3/CR2-11) is fixed on both widths by R-A. All six of Leah's tasks are now Met under the current, amended acceptance, each traced to a specific state and an exact click count — including Task 5, unbuildable in round 3, now closed at 2 acts via `#state-pick`. No wrong fact was found on any face, and the two widths agree on every business fact checked this round (dates, counts, affiliations, consent, paper state). No trade or homeowner writing surface exists on either width, including the two new writing surfaces this round (the Bring-forward picker and its search field).

The four long-carried minor findings (licence spelling, dead Compare & merge, missing schedule-authority example, ambiguous homeowner key cue) remain open by design — each needs a SPEC- or fixture-owner move, not a build fix, and two rounds of fix-logs already say so. Three small new cross-width divergences surfaced from this round's two independently-built additions (the Bring-forward search-field label, the Add sheet's non-empty-authority note text, and a forced-colors accessibility fallback gap) — all minor, all copy- or code-level rather than fact-level. One finding is raised at Blocking severity for the first time this round on strictly mechanical grounds: SPEC §5.4 #3's literal vitals string has never appeared on either face since round 1, and while both widths have agreed with each other on the recomputed figures for three straight rounds, that SPEC/fixture conflict has never received the kind of explicit correcting ruling R-D gave to Dana's window — it is flagged here so the same disposition can be applied, not because the room shows a wrong or inconsistent number.

Findings this round: 8 total — 1 blocking (CR4-5, a stale SPEC literal, both widths internally consistent with each other), 0 major, 7 minor (CR4-1 through CR4-4 carried, CR4-6 through CR4-8 new).

**Not clean** — one blocking item (CR4-5) prevents a clean verdict, though it is a SPEC-text/fixture-arithmetic conflict rather than a defect visible as a wrong or disagreeing fact on either face; a ruling analogous to R-D would close it outright.
