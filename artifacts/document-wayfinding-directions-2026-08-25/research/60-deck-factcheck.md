# Deck fact-check — The Wayfinding Review

Scope: every factual claim in `presentation.html` (checked via the unrendered
`mock/deck-parts/*.html` fragments — `qa-shell.html` excluded as a non-deck render
harness). Cross-referenced against `research/31-verified-findings.json`,
`research/30-collated-findings.md`/`.json`, `source/judge-feasibility.md`,
`source/judge-practitioner-workflow.md`, `source/direction-b.md` §7,
`source/shared-planks.md`, `research/10-code-anatomy.md`, `research/11-canon-digest.md`,
`source/plan.md`, `source/instruments.md` §8, and `shots/`.

Method: automated + manual. Wrote small Python scripts to diff every `dk-find` card
(severity, seat count, canon tag, observation) against the JSON record for all 25
full-card findings; enumerated the 67-finding theme table and confirmed set equality
against "surviving findings minus full-card findings" (92 = 101 − 9 killed); diffed all
56 judge score cells (7 axes × 2 judges × 2 directions) against both judge files
including footer sums; diffed all 16 task rows (3 columns each) against the task-score
table; diffed all 20 shared-plank → finding-id mappings; grepped every specimen dollar
figure, the PO number, vendor name, and install date across both directions' mocks;
grepped for all nine killed finding IDs across the whole deck; resolved all 20 embedded
screenshot markers against `shots/`; spot-checked ruling IDs (C8/C9/C11-C15/C19,
I136-I141) and all `file.tsx:NNN` citations against the anatomy doc; verified all six
practitioner-voice quotes verbatim against the panel transcripts; checked the B1/B2
amendment ledger verbatim against `direction-b.md` §7; checked the Thumb Index handling
and the "claims not measurements" framing on T2.

## Claim → source → verdict

| # | Claim (location) | Source | Verdict |
|---|---|---|---|
| 1 | Cover: "Nine seats walked one week... 203 raw findings... merged to 101... 92 survived; 9 were killed" (02-ask) | `30-collated-findings.md:3` (203→101), `31-verified-findings.json` (92 survive, 9 killed) | ok |
| 2 | "Eight were killed by the code... One more was killed by re-driving the browser" (02-ask) | JSON: 8 findings have `code_truth:"misread"` (F06,F19,F20,F27,F31,F68,F69,F89); 1 has `repro:"not-reproduced"` (F22) | ok |
| 3 | The three plan-time rulings — Doctrine/Evidence/Baseline (01-cover) | `plan.md:11` | ok, accurate paraphrase |
| 4 | "Verified against main@695addb5f" (01-cover) | Task brief states repo verified against `main@695addb5f` | ok |
| 5 | All 25 full finding cards (id, title, severity, seat count, seat list, confidence, canon tag, observation text, evidence_refs) — 03b/03c | `31-verified-findings.json` | ok — scripted diff found zero real mismatches (only cosmetic backtick-vs-`<code>` false positives, plus F15/F16 which correctly substitute the JSON's `code_note` field for `observation`, itself accurate) |
| 6 | Theme table of the other 67 findings, by id, in 03c | JSON `survives:true` set | ok — the 25 cards + 67 table ids = exactly the 92 surviving findings, no duplicates, no omissions, no killed ids present |
| 7 | No killed finding (F06,F19,F20,F22,F27,F31,F68,F69,F89) appears as a live citation anywhere in the deck | grepped whole deck | ok — F06 appears once (07b, 10-recommendation), explicitly named as "a finding the code refuter killed" that A's own copy should cut; F27/F22 appear once (08b), explicitly named as "killed" citations B leans on that should be cut. Both are correctly flagged as *errors in the source directions*, not asserted as fact. F19/F20/F31/F68/F69/F89 do not appear anywhere in the deck. |
| 8 | Thumb Index handling (07b, 11-questions) — not re-proposed, asks only for a ledger entry recording its removal | `plan.md:99,218`, `instruments.md:97` (C19) | ok — deck explicitly states "Neither direction re-proposes it" and asks for one ledger entry, matching Kody's "do not re-propose" instruction |
| 9 | Specimen figures — $184,500 / $171,240 / $141,600 / $17,500 (Invoice 2026-114, 22 days) / $12,300 (deposit) — printed identically in A's money ladder (07a) and cited identically in B's mocks (08b) | `instruments.md` §8 | ok — all five figures match verbatim across both directions and the source; $96,400/$78,900/$14,880 are not independently re-quoted but the derived `$62,700 Moved` figure in A (141,600 − 78,900) is correct arithmetic and is explicitly labelled "ordered less paid out," not presented as raw specimen data |
| 10 | PO-2026-0418 / Sturdy Oak Woodworks / 14 days unacknowledged (08a, 03a) | `instruments.md` §8 | ok |
| 11 | Console damage claim, carrier window closes "tomorrow" (08a, 08b) / install "Tuesday, September 15" (07a, 08a) | `instruments.md` §8 (today 2026-08-25, install 2026-09-15, window closes 2026-08-26) | ok |
| 12 | Byrne proposal "Sent Aug 19 · not opened yet" (07a stage table) | `instruments.md` §8 ("sent 2026-08-19, 6 days, never opened") | ok — deck omits the "6 days" figure at that spot but does not misstate it elsewhere |
| 13 | 20 embedded screenshot markers (`<!-- IMG name -->`) | `shots/*.png` | ok — all 20 resolve to existing files (m390-doc-project-rich, m390-mobile-bar, m390-mobile-spine-sheet, w1280-doc-project-rich, w1280-spine-detail, w1440-cmdk-typed, w1440-desk, w1440-doc-care, w1440-doc-install, w1440-doc-project-rich, w1440-drawer-books, w1440-money-region, w1440-red-letter-zone, w1440-room-rooms, w1440-shelf-knowledge, w1440-shelves-block, w1440-spine-detail, wt-delivery-project-1440, wt-finalize-head, wt-speccing-1440) |
| 14 | All 20 shared-plank → finding mappings (06-planks: SP-01→F03 ... SP-20→F41) | `shared-planks.md` "Closes: **Fxx**" lines | ok — all 20 match exactly |
| 15 | Judge score table, all 56 cells, 09-compare | `judge-practitioner-workflow.md` §1 (J1), `judge-feasibility.md` §1 (J2) | ok — every cell for both directions, both judges, all 7 axes matches exactly |
| 16 | Weighted-axis footer sums — A: 30(J1)/33(J2); B: 28(J1)/15(J2) | Computed from the same 56 cells | ok — arithmetic verified correct |
| 17 | 16-row task-score table (T1–T16, 3 columns each), 03a-reading | `30-collated-findings.md:127-142` | ok — all 48 numbers match exactly |
| 18 | "Five worst tasks" flagged as T2/T5/T6/T13/T14 (03a, 07a, 08b) | Computed from the combined-score column | ok — these are exactly the five lowest combined scores (1.50/2.50/2.58/2.78/2.78 vs. next-lowest T4 at 2.89) |
| 19 | T2 = 1.50, "the worst task in the review" (multiple locations) | `30-collated-findings.md:128,148` | ok |
| 20 | A's T2/T5/T6/T13/T14 movement claims (07a) framed as "the direction's own claims, not measured outcomes" | Explicit disclaimer text present in the same paragraph | ok |
| 21 | B's "T2 is answered at zero acts, by a heading rather than a filter" (08a) | Direction B's thesis paragraph (same section, ~14 lines earlier) states "These are the direction's own claims" | ok, but the disclaimer sits at the top of the section rather than beside this specific line — see Issues |
| 22 | B1 amendment (mount gate) — quote, gains, gives-up, rollback (08b) | `direction-b.md` §7 "B1 — the mount gate" | ok — verbatim match on the DECISIONS.md quote, the closed-findings list (F01,F14,F48,F72, half of F82), the moved-tasks list (T6,T13,T14), and the rollback claim |
| 23 | B2 amendment (lens width release) — quote, gains, gives-up, rollback (08b) | `direction-b.md` §7 "B2 — the lens's width release" | ok — verbatim match, including "I136's never-filters clause is untouched" |
| 24 | "Two things B leans on that the refuters killed" — F27, F22 (08b) | `judge-practitioner-workflow.md` §2 ("B leans on two killed rows") | ok — same two findings, same framing (killed, not needed, F14 alone carries the case) |
| 25 | "A builds a move on a killed row" (F06) — Orders acknowledgement chip (07b, 10-recommendation) | `judge-practitioner-workflow.md` §2 | ok — same critique, same recommended fix ("cut the move, keep the re-pointing") |
| 26 | file:line citations (doc-spine.tsx, strata-mark.tsx, money-region.tsx, ffe-section.tsx, document-guide.ts, document-index.ts, registry.tsx, shelves.ts, etc.) | `research/10-code-anatomy.md` and `31-verified-findings.json` `evidence_refs` | ok — spot-checked against both; all line ranges present in one or the other source. `overlays/doc-sheet.tsx:228-262` and `strata-mark.tsx:81-82` don't appear as headers in `10-code-anatomy.md` but are the verbatim `evidence_refs` for F21 and F02 respectively in the verified-findings JSON |
| 27 | Ruling/decision ids C8, C9, C11–C15, C19, I136–I141 (throughout) | `research/11-canon-digest.md`, `plan.md` §canon table | ok on all spot-checked instances |
| 28 | Six practitioner-voice verbatim quotes (04-voices: P1 "browser tab → old portal", P1 "Unsorted is not a room...", P2 "There is no surface...", P2 "exact thing my tolerance forbids", P3 "I'd ask my manager...", P3 "ask the Engine sounds like...") | `25-panel-p1.md:19,108-113`, `26-panel-p2.md:50-52`, `27-panel-p3.md:48,50` | ok — all verbatim |
| 29 | F56 "clay/terracotta fail contrast... roughly 374 places... ≈2.2:1" (03c, 07b, 08b, 10-recommendation, 11-questions) | JSON's raw `observation` says 394 places; but JSON's `code_note`/`claim` (the code-refuter-verified figure) says "~374 places," per `33-verify-code-truth.md:218,222` ("374 `text-[...]` sites," recounted) | ok — deck consistently uses the *verified* recount (374), not the seat's unverified initial estimate (394); this is the more accurate number, correctly chosen |
| 30 | F56 red-letter eyebrow contrast "2.95:1" (03c) | `33-verify-code-truth.md:218` "#C4836F, ≈2.95:1" | ok |
| 31 | SP-04 gloss described as "A six-word gloss added inline" (06-planks) | `shared-planks.md:49` calls it a "four-word inline gloss"; the actual added text `(committed, not yet paid out)` is five words | wrong: minor — neither the deck's "six-word" nor the source's own "four-word" matches the five-word gloss text; deck inherited/compounded a small miscount already present in the source. Low stakes (doesn't change scope, doctrine, or the SP→finding mapping) but should read "five-word." |
| 32 | $5,700 FF&E line example + "Google Sheet" quote, attributed to the solo principal (03c, F13's card) | `25-panel-p1.md:772-774`, `28-panel-p4.md:270`, `20-panel-u1.md:428-429` | ok — verbatim, and correctly not presented as Vandersteen-specific (it's the FF&E-line-grammar example, drawn from the Chen Residence screenshot fixture used across several panels) |
| 33 | "62,700 Moved" money-ladder figure (07a) | Derived: $141,600 ordered − $78,900 paid = $62,700, explicitly glossed "(ordered less paid out, so it is finally a different number from Authorized)" | ok — correct arithmetic, clearly labelled as derived rather than a raw specimen figure |
| 34 | 10-recommendation "5–7 days by A's estimate and 7–9 with tests" / B's "twelve days" / feasibility "sixteen to twenty" | Matches J1 axis 6 ("5–7 days... 8"), J2 axis 6 ("5-7 days is credible; 7-9 with worktable.test.tsx"), B's own §8 (12 itemized days), J2 B axis 6 ("Realistically 16-20 days") | ok |
| 35 | "Both judges favour Direction A" (10-recommendation) | `judge-practitioner-workflow.md` §3 "Which do I favour... Direction A"; `judge-feasibility.md` (A scores higher on J2's weighted axes, 33 vs 15) and its own text favoring A's first-slice feasibility | ok |

## Blockers

None. No factual claim traced above resolves to a materially wrong or unsourced
statement that would mislead Kody about scope, findings, scores, or doctrine. Every
number checked in the specimen, every judge score, every task score, every plank
mapping, every screenshot marker, and the entire finding-accounting (92 = 25 cards + 67
table rows, zero killed findings present) verified exactly against source.

## Issues

1. **SP-04 word count is off by one, in both the deck and its source.** `06-planks.html`
   calls the added clause "A six-word gloss"; `shared-planks.md` itself calls it a
   "four-word inline gloss"; the actual text `(committed, not yet paid out)` is five
   words. Neither number is right. Low severity — cosmetic, doesn't affect scope or the
   SP→finding mapping — but worth a one-word fix (six → five) since the deck is the
   version Kody will actually read; flagging the source's own miscount is optional.

2. **Direction B's specific T2 claim ("T2 is answered at zero acts, by a heading rather
   than a filter," 08a) sits ~14 lines below the section's "these are the direction's own
   claims" disclaimer, rather than carrying its own local caveat the way Direction A's
   equivalent T2/T5/T6/T13/T14 paragraph does** ("Stated ordinally, because no re-walk
   has been run... These are the direction's own claims, not measured outcomes," 07a).
   Both sections do disclaim claim-not-measurement status, so this is not a
   misrepresentation, but the asymmetry means a skimming reader is more likely to read
   B's T2 line as a settled fact than A's parallel claims. Cosmetic; consider repeating
   B's disclaimer adjacent to the T2 sentence for symmetry with A's treatment.

No other issues found.
