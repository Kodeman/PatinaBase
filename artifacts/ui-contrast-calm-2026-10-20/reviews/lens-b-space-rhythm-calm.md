# Lens B — Space, rhythm & calm (Opus, read-only, code + Leah's screenshot; not rendered)

**Headline.** No middle tier of hierarchy. Project title 34px Playfair; every region below is named in 12px mono caps, the same size as its status and its buttons. Leah's "contrast" is a size ratio plus one dark object; the Document head's size ratio is ~1:1. Spacing alone won't fix it.

**Correction to the brief.** Leah's screenshot is a 2× retina capture (12px caps ≈ 17 image px). The "1800px row" is ~910 CSS px; the paper is already capped (`doc/[id]/page.tsx:3493`, `max-w-[1040px]` + 48px padding ≈ 944px content at 1440). Narrowing won't help — moving actions next to their subject will.

## Findings (confidence · severity)
- F1 No level between title and metadata. Region name `.eb` 12 caps (`region-head.tsx:251`), status 12.5, buttons 13 caps. House sheet §A3 says section heads use `.t-d2` 26px; code prints eyebrows (US-28). — High · Critical
- F2 Four charcoal rules in ~670px: Work closes on 1.5px (`globals.css:2908`), 24px later the FF&E double rule (2px + 3px gap + 1px), FF&E closes 1.5px, money adds hairlines. The 24px between Leah's stacked rules belongs to nobody. — High · High
- F3 Actions far from their subject: at ≥1180px head is two columns; "Edit FF&E schedule" ~550px from "FF&E selections"; "Edit room selections" ~700px from "Bed · $6,612", no leader. — High · High
- F4 FF&E head: 2 labels, 2 status lines, 5 actions (up to 7), plus a 16px totals line ≈ 10–12 items before the first room. Totals (16px) outrank the region name (12px) — inverted. — High · High
- F5 Repetition: "nothing released" twice (`ffe-section.tsx:2190`, `pieces-overview.tsx:110`); "Record a change" in FF&E and financials; "PROJECT FINANCIAL SUMMARY" over "PROJECT FINANCIALS". — High · Medium
- F6 Collapse sits among work actions; in financials it wraps to its own far-right line. — High · Medium
- F7 Room rows: toolbar always visible, but the room name (the real disclosure) shows an underline only on hover; no chevron. — High · Medium
- F8 Agreement evidence ~400px below "Prepare purchasing authorization", which depends on it. — High · Medium
- F9 Metadata in 11px mono caps ("2 LINES · 0 PLACEHOLDERS", six money meanings). `.t-meta` is sentence case; V18 Q9 keeps caps for metadata only. — High · Low–Med
- F10 Off-grid: gaps 6/8/16/56; type 12.5, 11.5, 11, 16-italic room names (sheet: 20), 27.2 Desk greeting. — High · Medium
- F11 Money note 11px across 672px ≈ 120 characters/line (sheet caps prose at 65ch). — Med-High · Low
- F12 Desk: each Today line has 1 main + up to 3 quiet actions; at the five-line cap up to ~20 actions across three ~315px columns. — Medium (not rendered) · High
- F13 Desk: lines ranked by consequence (V18 Q3) but three side-by-side cards don't read in rank order. — Medium · Medium
- F14 Desk duplicates: "Record an inquiry" / "Create a project file" in both greeting row and Studio index Begin column; they're the first actions the eye meets. — High · Low–Med
- F15 390px: head stacks below 1180px → name, two status lines, 4–5 full-width actions (~180px of targets) before any room; band Next removed from dock (`mobile-bar.tsx:117`) leaves the dock centre empty. — Medium (code only) · High
- F16 Sign-in: one 384px column, 30px heading over 14px text (~2:1), one 48px filled act, alternatives below a single rule or behind "+". — High · diagnostic

## Reading order
- Project header — today: title → band Next (filled) → flat run of caps. Proposed: title → band Next → region names 26px → state sentence → local step.
- FF&E + financials — today: 16px totals (biggest) → far-right actions → caps. Proposed: name → state sentence → one scored step → rooms.
- Desk — today: greeting → 3 create actions → date eyebrow → three cards, no order. Proposed: greeting → top line (wide) → lines 2–5 → roster.
- 390 — today: band → name → stack of actions → rooms. Proposed: band → name+state → one step → rooms; tools under More.

## Principles
1. One clear size step per level: title 34 → region 26 → room 20 → body 16 → meta 12; each jump ≥1.25×, region name vs its meta ≥2× (the sign-in ratio).
2. Space groups; a rule only opens a movement: 12 inside a group, 24 between groups, 48 between regions; never two charcoal rules within 48px.
3. Actions sit beside their subject: head actions under the state sentence, left-aligned to the 65ch column; only ledger figures sit right (dotted leader).
4. State once, in a sentence: one `.t-body` sentence per region; counts as sentence-case `.t-meta`.
5. Next step shown, tools quiet, specialist doors in More; rooms show actions only when opened.
6. Same measure everywhere: paper 1040; head text ≤65ch (~560px).

## Deltas (today → proposed, house-sheet step)
| Element | Today | Proposed |
|---|---|---|
| Region name | `.eb` 12 caps | `.t-d2` 26 Playfair, sentence case (ornament kept) |
| Status lines | 12.5 ×2 | one `.t-body` 16 sentence |
| Totals line | 16 standalone | merged into the sentence |
| Head action labels | 13 caps .06em | leader 15, tools 14, sentence case, same scores |
| Head → body | 6 | 24 |
| Name/state/step/tools gaps | 0/0/8 | 12/12/12 |
| Between regions | 24 + 1.5 close + double rule | 48 + hairline; double rule only for movements |
| Room name | 16 italic | `.t-d3` 20 |
| Room counts | 11 caps | `.t-meta` 12 sentence |
| Money rows | 12.5 + 11-caps meaning, 8 gap | `.t-body-sm` name, `.t-money` 15 on dotted leader, 12 gap; meanings → Details |
| Money note | 11 at 672px | `.t-meta` ≤65ch inside Details |
| Desk greeting | 27.2 | `.t-d2` 26 |
| Desk top pad / width | 56 / 1120 | 48 / 1100 |

## ASCII
FF&E + financials, after:
```
≡ FF&E selections  ⌃                       ← 26 Playfair; quiet collapse
1 room · 2 selections · $6,612 priced       ← 12 meta
The selections are priced. Nothing is released.
Agreement signed outside Patina — view.     ← 16 body, ≤65ch
Review purchasing readiness →               ← one scored step, 15
Edit selections   Add items   More ▾        ← 14 tools
⌄ Bed                    2 selections  ····· $6,612
+ Add a room
──────────── hairline ────────────  (48)
≡ Project financials  ⌄                     ← starts as a summary
No client budget recorded. $0 authorized.
Draft an invoice    Details ▾
```
Desk, after:
```
Good evening, Leah                                   Find anything ⌘K
Tuesday 20 October · Mine ▾
┃Vandersteen · Install                        ← card 1 full width
┃One thing is overdue — install since 4 Sep.
┃Confirm the install date →     Later ▾
┃Hartwell · Project        ┃Ellison · Proposal   ← lines 2–5, two columns
Every job (roster)   …   Begin: Record an inquiry · Create a project file
```
Actions per line 4 → 2; Desk max ~20 → 10.

## Rulings (recommendation)
1. Region names as 26px Playfair headings (reverses US-28 "never a display heading"; matches §A3) — yes; biggest single lever.
2. Sentence-case action labels (amends §A5 uppercase; follows V18 Q9) — yes; keep scores, 44px, focus caret.
3. Rule budget: charcoal rule only opens a movement; regions close with 48px + hairline (amends US-28 S7) — yes.
4. Head actions under the state sentence, retire the ≥1180 two-column head — yes.
5. Room actions only inside an opened room + visible ⌄/⌃; single-room job opens by default — yes.
6. Desk: card 1 full width, rest two columns; Not today/Until…/Record payment fold into "Later" (touches R143/V19) — yes, keep V18 five-line/no-count guards.
7. Remove Desk header create actions (Find + Begin column remain) — yes, low priority; pilot (may slow capture at 390).
8. Financials starts as a summary with Details — yes (matches 19 Oct pilot).

## Risks
- Not rendered; Desk/390 findings code-only; "Later" costs a tap on the most-used Desk acts.
- Bigger headings lengthen the page (~100px+ over seven regions); check at 43 jobs / 7 rooms.
- Tools behind More may make editing feel hidden — test "Add to Bed" without hunting.
- Q8 one-filled-act could quietly break if a 15px scored local step + larger heading reads as a second leader. Keep it unfilled.
- Removing region-close rules may hurt folded-region outlines and forced-colors (`globals.css:819`); check §A11.
- If Leah means colour value (the dark pane) rather than scale, these changes under-deliver — show her a 26px-name prototype side by side.
