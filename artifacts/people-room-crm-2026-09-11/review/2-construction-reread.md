# Construction re-read, round 2

Two seats — CS1 (GC/PM) and CS4 (electrical sub owner) — re-walking `specimens/people-room-1440.html` and `specimens/people-room-390.html` after `review/fix-log-r1.md`, plus Leah's six tasks (`panel/ux/ux-5-leah-walk.md`) and `synthesis/direction.md` §6/§9. Every claim below is grep- or read-verified against the two HTML files or the twelve PNGs in `shots/`; line numbers cite `people-room-1440.html` unless marked 390.

Gate facts, re-verified independently of the fix log's own claims:

```
grep -c $'’' people-room-1440.html people-room-390.html   → 0, 0
grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled'   → 0, 0 (both files)
grep -n 'Remove'                                               → no hits, either file
tail -1 (both files)                                           → <!-- specimen-complete -->
shots/people-room-console.json                                 → 12 captures, 0 errors, 0 warnings, horizontalOverflow:false on all 12
```

---

## 1. Prior findings (fix-log-r1.md): fixed or still open

| ID | Round‑1 verdict | Round‑2 status | Evidence |
|---|---|---|---|
| DR-1 | fixed | **confirmed fixed** | `grep -c $'’'` = 0 on both files |
| CR-1 | fixed (1440), fixed (390) | **fixed but now itself broken cross‑width — see CR2-1** | vitals figures diverge between the two widths (below) |
| CR-2 | fixed | **confirmed fixed** | `renderCompany(cid)` genericized; Twin Cities Drywall & Plaster and Marrow & Sons open with real content in both files |
| CR-3 | fixed | **confirmed fixed** | `renderPerson(pid)` genericized; Chidi, Frank, Rosa, Ray Thao, Carol Nystrom, Pete Rusk all open real cards (`data-open-person` on every row, both files) |
| CR-4 (390 only) | fixed | **confirmed fixed** | `deskFigure()` wraps every `e.authority`/`r.text` render site in `people-room-390.html` (9/9 call sites checked, line 616-992); no `$` literal reaches the 390 DOM. 1440 correctly leaves the figure showing (PR-t: "the figure only on the desk") |
| CR-5 | fixed | **confirmed fixed** | Role narrow row present both widths, `ROLE_WORDS` map, `aria-pressed` per pill |
| CR-14 | fixed (doc-row terracotta) | **fixed for the flagged case; the file's own noted dormant case still stands** | Northgate's "COI, workers compensation · NOT ON FILE" renders `.word--blocked` (screenshot, company-1440.png); the firm-level "Not on file" word on Great Northern Bank / CPED Inspections stays plain, exactly as the fix log flagged and left "worth a ruling" — unresolved, not re-litigated here |
| DR-2 | fixed | **confirmed fixed** | `people-room-console.json` holds all 12 captures from one merged run |
| TR-2 (390) | fixed | **confirmed fixed** | `told-band` initializes `hidden`, `aria-expanded="false"` |
| **CR-6** | **not fixed, returned to Kody** | **confirmed still open** | Zero occurrences of the string `rolodex` in either specimen file. No seventh state, no picker, no travel-list pane exists anywhere. See CR2-2. |
| **CR-13** | **not fixed, returned to Kody** | **confirmed still open** | Zero occurrences of `invoice` or a change-order screen in either file. See CR2-4. |
| DR-3 (brace count) | flagged, not assigned | **still open, informational** | Not re-litigated; a design/technical ruling item, not a fresh face defect |

---

## 2. CS1 and CS4's top 5 asks — tracked where, stated how

Both seats' top-5 lists overlap heavily (compliance docs, authority, contact rule/role-at-firm, reach/consent, stage+paper). Evidence below covers both seats' phrasing.

| # | Ask (CS1 / CS4 wording) | Tracked on the face? | State (hash) | Stated the way a builder/sub would say it? |
|---|---|---|---|---|
| 1 | Compliance document with expiry on the firm: COI, W-9, license, per-draw waiver (CS1‑1, CS4‑1) | **Yes, mostly.** Company card "Paper" table: Type/Number/Issuer/Expires/State/Held by/Blocks, e.g. "COI, general liability · GL-9021-18 · Lakes Casualty · 31 Mar 2026 · LAPSED · The studio · Site access, payment, draw." Held clause: "Site access, payment and the draw are held until a current certificate is on file." | `#state-company` (Northgate Electric, Twin Cities Drywall & Plaster, Marrow & Sons — `renderCompany()` line 564) | Mostly yes — but see CR2-7: "licence" (British spelling) on a Minneapolis firm's license row reads wrong to a US GC. Per-draw waiver is **not** a ledger on the face, only a link‑out button "Draw 1 waiver ledger, in the money book" (line 639) — a pointer, not the fact itself; consistent with direction.md's P2 phasing, not a defect |
| 2 | Authority set: money limit, CO, schedule, site access, key (CS1‑2, CS4‑3) | **Partially.** Person card "Seats on projects": authority sentence ("Signs money to $2,500.", "Prices change orders.", "Controls the gate.") plus `ACCESS_WORDS` site fact ("Escorted on site" / "Holds a key" / "Controls the gate") | `#state-person` (line 500-503), `#state-roster` rows | Yes in the money/CO/site/key vocabulary used. **Schedule is absent everywhere** — no seat in either fixture carries a schedule-authority sentence (grep of all 23 `"authority":` strings, none mention schedule/slip/date). See CR2-9 |
| 3 | Contact rule: primary, never, route-through (CS1‑3, CS4‑2/5) | **Yes.** Frank Bauer: "Do not contact directly. Write Rosa Delgado instead." on person card, Directory row, Roster row, and Twin Cities company card's crew section (with the routed channel: "Write Rosa Delgado · rosa@twincitiesdrywall.com"). Ray Thao: "Never text. Office phone or the 311 portal only." | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` | Yes — exact builder/sub phrasing ("Text only. Phone calls.", "Never text. Email and phone only.") |
| 4 | Phone-scoped consent shown truthfully, carried forward (CS1‑4, CS4‑6) | **Yes.** Directory: Pete Rusk shows a red "OPTED OUT" pill plus "Opted out by text, 3 December 2025, on the Lindqvist kitchen." (not "Not asked"). Dana Kowalski's card: "Written consent, 2 May 2025, on the Lindqvist kitchen. Carried forward to the Okonkwo residence, 12 October 2026." | `#state-directory`, `#state-person`, `#state-roster` | Yes, plain language, names the originating job |
| 5 | Relationship stage + `warranty_until` + link lifetime tied to the job (CS1‑5/8/23, CS4‑15/17) | **Yes.** Company card header: "warranty through 21 Nov 2026." Person card "Access grants": "Ends with the job, 13 August 2027. Renews when they use it." Roster stage pills: Awarded / On the job / Bidding / Off the job | `#state-company`, `#state-person`, `#state-roster` | Yes, matches PR-d's ruled language exactly |

Role-at-firm / paperwork contact (CS4-2/8): also confirmed — Northgate's crew line reads "Dana Kowalski · owner-operator · paperwork contact · signer · site contact · holds the trade licence" (`#state-company`). `contracted_through` (CS4-24): confirmed — Dana Kowalski's own seat reads "Contracted through Marrow & Sons" (`#state-person`, line 502). Typed phone (CS4-7): confirmed — "Mobile · (612) 555-0111 · preferred · verified 12 Oct 2026" (`#state-person`).

---

## 3. Leah's six tasks — acceptance criterion, state, act count

| Task | Acceptance (UX-5 / direction.md §6) | Met on the mockup? | State | Acts counted from the face |
|---|---|---|---|---|
| 1. Add Dana text-only | A rule every add/send/edit honors, ≤2 clicks | **Met** (as a face, not as enforced logic) | `#state-add` (Contact rule textarea, prefilled "Text only. No working email.") + `#state-person`/`#state-directory`/`#state-roster` (rule renders with `setBy`/`setAt` provenance) | 1 field (Contact rule) filled during the single Add flow; rule then appears on 4 downstream faces with no re-entry |
| 2. Give Adaeze the app; note Chidi signs $2,500 | Login + authority as two facts, **visible on the invoice/CO screen** | **Not met — blocking.** No invoice/CO screen exists in either file (0 hits for "invoice"). No act anywhere sets/confirms an authority figure — it is read-only fixture text. The Add sheet's kind picker (`a household member`) is inert (see CR2-6) | `#state-add` (decorative only), `#state-person`, `#state-roster` (read-only) | **0** acts available to set the authority grant; **0** invoice/CO faces to show it on |
| 3. Site access, one screen | Key holder, gate control, hours, who-was-told, from one screen | **Met** | `#state-access` | 1 click from the top nav bar (`Site access`) |
| 4. Do-not-contact Frank; route to Rosa | Every attempted contact + future pick shows "write Rosa instead" | **Met** | `#state-person`, `#state-directory`, `#state-roster`, `#state-company` (all four render the clause identically) | Clause visible with 0 additional clicks once the row is open; consistent across 4 surfaces |
| 5. Bring 3 Lindqvist subs + Stonehaven's rep onto Okonkwo | Each arrives with consent, doc status, one history line; never old pricing | **Not met — blocking.** No rolodex-picker/travel-list state exists (CR-6, still open). Claire Bissett (F-20, the fixture's own example for "the vendor rep") has **no** path to her card at all: not in `DIR_PEOPLE` (11 hardcoded ids), not in `DIR_FIRMS` (3 hardcoded ids: `marrow`, `northgate`, `tcdrywall` — Stonehaven excluded), and carries zero engagement rows | none available | **0** clicks reach a "bring forward" act or Claire Bissett's card, on either width |
| 6. Everyone by role, this week | Narrows to on-site-this-week, excludes unopened/closed windows | **Met** | `#state-roster` | 1 click to open (already banded studio/client/week vs. later/bidding/done) + 1 click on a role pill = 2, matching direction.md's claim |

---

## 4. Facts on a face a GC or sub would read as wrong, naive, or unusable

| Finding | Severity | Confidence | Evidence |
|---|---|---|---|
| **CR2-1.** The Call Sheet vitals line disagrees between the two widths for the identical fixture/day. 1440 computes it live off the printed bands (`tally()` over the 12-person "studio+client+week" cohort → verified by hand: 5 Texting, 4 Account, 2 On paper) and renders **"12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper."** 390 hardcodes a stale literal — `vitalsRest: '9 reachable by text · 5 with accounts · 6 on paper'` (390:540) — carried over from the pre-fix SPEC text and never recomputed. The fix-log's own deviation note claims "the two widths stay identical on them," which is false as shipped. | **Blocking** | High | `people-room-1440.html:1066-1068` (live tally) vs `people-room-390.html:540` (hardcoded); manually recomputed the correct figure from `FIXTURE.persons` consent/reach fields for all 12 in-cohort ids |
| **CR2-6.** The Add sheet's kind picker ("a client," "a household member," "a sub," etc.) is decorative only. `.js-pick` click handler (1440:986-993) only flips `aria-pressed`; it never touches `FIXTURE.addSheet`, which is one static object (`kind: "a sub"`, name "Joe Wozniak," line 190-205). Selecting "a household member" still shows Company/Trade fields (nonsensical for a homeowner's spouse) and still names Joe Wozniak. Task 2 cannot be walked through this screen at all — the screen cannot become "Chidi Okonkwo, household member." | **Blocking** (broken interactive state) | High | `people-room-1440.html:986-993`, `:190-205`; identical in 390 (`:656` DIR arrays, `:1112` KINDS unchanged behavior) |
| **CR2-3.** Claire Bissett (F-20, Stonehaven Tile Gallery), the fixture's own stand-in for "the vendor rep Leah needs to reach," is unreachable from any of the 6 states: absent from `DIR_PEOPLE` (11 ids, `:296`), her firm `stonehaven` absent from `DIR_FIRMS` (3 ids, `:297`), and she carries zero `"person": "F-20"` engagement rows. The data model now supports a rep-as-person (LH-14/CS1-6's proposed fix), but nothing on the rendered face proves it. | **Blocking** | High | grep for `"F-20"` and `stonehaven` across both files; `DIR_PEOPLE`/`DIR_FIRMS` arrays |
| **CR2-5.** No act anywhere sets or confirms a money/CO authority threshold. The authority sentences are inert fixture strings; the Add sheet has no authority field; no button reads "Set the authority" or "Confirm from the agreement." `direction.md` §6 claims Task 2 costs "1 to confirm the authority defaulted from the agreement (4 when composed by hand)" — no such click path exists on either face. | **Blocking** (missing acceptance act) | High | Full-file grep for `authority`/`threshold` outside the `"authority":` fixture keys — zero acts found, both files |
| **CR2-4.** Task 2's own acceptance clause — "visible on the invoice or CO that needs it" — cannot be satisfied: zero occurrences of `invoice` or a change-order face in either specimen. Confirms CR-13 is still open exactly as the fix log left it. | **Blocking** | High | `grep -c invoice people-room-1440.html people-room-390.html` → 0, 0 |
| **CR2-7.** "MN BC contractor **licence**," "MN electrical contractor **licence**," "holds the trade **licence**" — British spelling, 6 occurrences at 1440 (`:353,362,746,747,919` and the crew line) and 4 at 390 — on a Minneapolis, MN document. A Minnesota electrical contractor's license (issued by MN DLI) is spelled "license" in every real-world instance a GC or sub would recognize; this reads as a typo to the exact audience the panel is modeling. | Minor | High | `grep -o "licen[sc]e"` both files: 6/4 hits, all "licence," 0 "license" |
| **CR2-8.** Directory's duplicate-identity nudge — "These two cards share a phone. Compare them?" (`:375`) — names no cards and its "Compare & merge" button has no target. A studio member reading it must independently redo the phone-collision detection the banner claims to have already done. Present, unresolved, at both widths. | Minor | Medium | `people-room-1440.html:374-377`; identical string in 390 |
| **CR2-9.** CS1-2/CS4-3's authority axis explicitly includes "schedule" (who may propose/accept a schedule slip) alongside money, CO, site, and key. None of the 23 engagement rows in the fixture carries a schedule-authority sentence — money, CO, and site/key each have at least one worked example; schedule has none, so the ask is untested on the face. | Minor | Medium | Full dump of all `"authority":` values (1440:141-169); none mention schedule/date/slip |
| **CR2-10.** Three different person cards independently render "Holds a key" (Adaeze F-04, Chidi F-05, Ngozi F-06, via the shared `ACCESS_WORDS['key']` mapping, `:396-398`), while the dedicated Site Access card — Task 3's single-screen answer — names only Ngozi Eze as key holder. A GC skimming person cards has no cue that homeowners' "holds a key" (their own house) and Ngozi's "holds a key" (the studio's designated site contact) are different facts. | Minor | Low | `ACCESS_WORDS` map + engagement rows for F-04/F-05/F-06 (all `"access": "key"`) vs `#state-access`'s single-named key holder |

---

## 5. Trade- or homeowner-facing writing surfaces

**None found, on either width.** Every `<textarea>`/`<input>`/`contenteditable` in both files sits inside a studio-only screen (the Add sheet's contact-rule/consent fields, the site access card's "Log who was told" note, the consent checkbox) — none of it is reachable from a trade or client surface; the People Room itself is a designer-portal-internal instrument. The site access card states this explicitly on both widths: "Studio only. This card never reaches a client page." No upload door, no field-link write act, and no rolodex-side trade input exist anywhere (`grep -n "upload"` → 0 hits both files), consistent with PR-a's ruling to park the trade-side compliance-upload door.

```
grep -n "<textarea\|<input\|contenteditable" people-room-1440.html
  → f-rule (Add sheet, studio), f-consent (Add sheet, studio), f-told (Site access, studio)
grep -n "<textarea\|<input\|contenteditable" people-room-390.html
  → same three, studio-only
```

---

## Summary

Round 1's fixes hold up on re-check except that CR-1's own recomputation introduced a new cross-width contradiction (CR2-1). CR-6 and CR-13 remain exactly as returned — both are load-bearing for Leah's Tasks 2 and 5, which is why those two tasks fail their acceptance criteria outright on this face, not just partially. Two new interaction-level defects (CR2-6 inert kind picker, CR2-3 unreachable vendor-rep example) make the failure concrete rather than hypothetical: a person walking Task 2 or Task 5 today hits a dead end, not just a missing nicety.
