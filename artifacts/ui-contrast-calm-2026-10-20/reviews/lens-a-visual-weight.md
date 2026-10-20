# Lens A — Visual weight & figure-ground (Opus, read-only; ratios computed; static analysis only)

**Headline.** Sign-in tells the eye where to go with one large dark field beside the paper and one filled act. The signed-in Document has neither. Its only strong value split (13.87:1) is spent on 1.5–2px full-width charcoal rules; name, status and every action share one mid-tone 12px mono-caps register.

## Findings (confidence · severity)
1. Sign-in signal, ranked: (a) value split at area scale — `#1A1816` pane vs `#FCFAF6` form 16.98:1, ~half the card dark (dark = identity, light = work); (b) one filled act — full-width 48px charcoal button, sentence-case Inter 14 semibold, the only filled shape on the light side; (c) one 384px column, one task; (d) type-scale contrast — 30px Playfair over 11px labels (~2.7×); (e) enclosure — oak 1px input boxes (4.30). Uppercase mono is used only twice and never on the act; the pane carries no controls — the act is a dark shape on light paper. — High · High
2. The darkest ink is spent on rules: full-width charcoal rules are **24.4% of all ink mass** in Leah's screenshot (pixel rows 124–126, 175–178, 815–817). Two sit ~25 CSS px apart with nothing between (Work close + FF&E double rule). One 1100×1.5px rule ≈ 8× the charcoal of the band's Next-act score. — High · High
3. Section name and its buttons share one register: `.eb` DM Mono 12 caps 500 ink (13.87) vs acts DM Mono 12 caps 400 mocha (8.06), tracked .1em. Name vs acts differ by weight and a 1.72× luminance step; secondary (8.06) vs tertiary (6.51) by 1.24×. Action ledgers hold 31% of non-rule ink. — High · High
4. Hierarchy inverted: largest text is a status line ("$6,612 priced · nothing released" ~20px), then "Signed outside Patina" (~18px), then "Bed" Playfair; the containing section is 12px mono. — High · Med
5. Stocks can't separate zones: paper|paper-doc 1.03, white|paper-doc 1.04, `--sheet-head`|paper-doc 1.09. Only rail (1.23) and `--card-edge` (3.21) read. 390 mobile bar on paper-doc 1.03. — High · Med
6. No dark area left signed-in: R126 kept the 390 mobile bar as the one charcoal surface; US-28 walk-fix `707e22a07` (SQ-856) made it paper. — High · Med
7. V18 Q8 ruled "the NEXT act is the only filled control" (10 Oct) but it was never painted filled: `lens-band.tsx` uses `variant="primary"` (scored word) because "a filled act owes a consequence sentence the 56px band has no room for" — reasoning predating the ruling (`3e24d2e7f`, 7 Oct). With BandLeadsContext demoting leaders, a Document at rest has zero filled or inked shapes. — Med-high · High
8. Sheet vs code tier names disagree: sheet §A5 secondary = ink + ink score + clay score; portal `.da-secondary` = mocha + one oak score (≈ sheet tertiary). Portal `.da-inked` is a charcoal pool at rest — effectively a fill. — High · Med
9. Status lines 12.5px mocha (not on §A3); room counts caps-tracked (§A3 says `.t-meta` sentence case). — High · Low
10. Desk repeats the pattern: every roster row ends in the same caps scored act ("OPEN THE SCHEDULE"); "STUDIO RESOURCES" printed twice. Header has no filled act. — Med (veiled capture) · Med
11. The Next band isn't in Leah's screenshot — cropped, or not registering as an anchor while scrolling. — Low · Med

## Measured ratios
| Pair | Ratio |
|---|---|
| Sign-in pane #1A1816 \| form #FCFAF6 | **16.98** |
| Sign-in button label #FAF7F2 \| #1A1816 | 16.57 |
| Sign-in oak border \| #FCFAF6 / white input | 4.30 / 4.49 |
| paper \| paper-doc | **1.03** |
| paper-doc \| rail / paper \| rail | 1.23 / 1.20 |
| hairline #E8E3DB \| paper-doc | 1.23 |
| `--rule-hair` \| paper-doc | 1.21 |
| `--doc-ink-border` \| paper-doc | 1.42 |
| `--hairline-strong` #D8CCB8 \| paper-doc | 1.52 |
| `--card-edge` \| paper-doc / rail | 3.21 / 2.62 |
| `--oak` \| paper-doc / rail | 4.30 / 3.51 |
| `--clay` score \| paper-doc | 2.23 |
| `--rule-mid` charcoal \| paper-doc | **13.87** |
| ink / text-muted / mocha / text-subtle / quiet-ink \| paper-doc | 13.87 / 9.22 / 8.06 / 7.73 / 6.51 |
| ink vs mocha (heading vs act) | **1.72** |
| quiet-ink vs mocha | 1.24 |
| On charcoal #2C2926: ink-paper / pearl / clay / oak | 13.53 / 11.19 / 6.21 / 3.22 (non-text) |
| On charcoal: clay-ink / terracotta-ink / ink-faint | **2.41 / 2.56 / 2.13 fail** |
| Dark-set terracotta-ink #E2A895 / clay-ink #D8B98A on charcoal | 7.07 / 7.73 |

## Principles
1. One dark mass per view, and it's the act (the sign-in button, not the pane).
2. Rules recede; space separates. Regions close on `--hairline-strong` + 48/72px; one charcoal double rule per view, under letterhead + band.
3. Each section has one inked lead: name → state sentence (`.t-d3`/`.t-body`, ink) → one scored act in sheet-secondary (ink + clay scores); tools tertiary.
4. Metadata steps down: `.t-meta` sentence case `--ink-faint`.
5. Edges, not stocks, mark objects (`--card-edge` on Desk only) + space.
6. Caps only for running heads; work acts sentence case.

## Deltas
| Element | Today | Proposed | Existing token |
|---|---|---|---|
| Region close | `--rule-mid` 1.5px (13.87) | 1px `--hairline-strong` + 48px | `--hairline-strong`, module |
| Movement open | double rule under every region head | one per view, under the band | `--rule-strong` + `--doc-ink-border` |
| Next act | `primary` scored word | `inked` (charcoal pool, clay score 6.21) or filled plate (Ruling 1) | `.da-inked` |
| Region leader | demoted to mocha secondary | sheet-secondary, one per section | `--ink`, `--clay` |
| Other ledger acts | mocha secondary 12 caps | tertiary `--ink-faint` + oak rest rule; extras under More | `--ink-faint`, `--oak` |
| Section name | `.eb` 12 caps ink | unchanged | `.t-head` |
| State sentence | 12.5 mocha + separate 20px "priced" line | one `.t-d3`/`.t-body` ink sentence under the name | `.t-d3`/`.t-body` |
| Counts | mono caps tracked | `.t-meta` sentence case ink-faint | `.t-meta` |
| 390 dock | paper-doc (1.03) | charcoal carrying the Next act | charcoal, ink-paper, clay |
| Exception words on dark | terracotta-ink 2.56 | dark-set #E2A895 (7.07) | sheet §A1 dark block |

## Before → after
- Desk: first Today line's act becomes the view's single inked act; card edges stay 3.21; section closes hairline + 72px; roster acts tertiary sentence case; duplicate "Studio resources" eyebrow removed.
- Project header + Next band: band keeps paper and its one charcoal rule (now the only one in view); sentence `.t-body` ink; act becomes the inked plate — the sign-in button, transposed.
- FF&E + financials: hairline, 48px, eyebrow, one `.t-d3` sentence ("$6,612 priced across 1 room · nothing released"), one ink-scored lead, quiet "Edit selections · Add items · More"; Collapse beside the name; financials opens with space, no rule.
- 390: dock back to charcoal holding the Next act (ink-paper + clay score); band shrinks to its sentence.

## Rulings (recommendation)
1. The dark anchor: (A) full-width charcoal Next band; (B) paper band whose Next act is inked/filled; (C) rail band. **Recommend B** — the mechanism that says "go here" on sign-in is one dark shape on light; Kody reversed A once (R126: "the document with the dark header… looks terrible"); C gives only 1.23:1 and breaks rail confinement.
2. Reconcile V18 Q8 ("Next is the only filled control") with R139 ("fill = money moves or paper signed"): Next uses existing `inked` (mono, 2px radius, inset pool); terminal stays Inter 16, 3px radius, 48px, amount in label. Record `inked` legal for exactly one act per view.
3. Amend R126 "1.5px charcoal ends a section" → hairline + space; charcoal double rule only where a movement opens. Yes.
4. Return the 390 dock to charcoal carrying Next (reverses `707e22a07` + `a28655a4f` filter); band prints no act at that width. Yes.
5. Bring dark-set terracotta-ink / clay-ink into globals.css for use on charcoal (in the sheet already), gated by `contrast.test.ts`. Yes.
6. Align portal "secondary" with sheet §A5 (or rename tiers). Align.
7. Sentence case for work acts. Yes.

## Risks
- Leah may mean the pane, not the button — test a 5-second squint on A vs B mockups.
- "Inked" next to "terminal" may blur the meaning of fill — if testers can't tell review from pay, fall back to an ink-scored act.
- A dark band or dock can make the studio surface loud — keep the dark area button-scale.
- Removing charcoal rules may cost wayfinding on long Documents — verify 48/72 gaps at 390.
- Approximate: screenshot DPR unknown; ink-mass by luminance-deficit summing; Desk evidence was veiled.

Key refs: `PortalAuth.tsx:240,562`; `globals.css:143-145,837-1040,2907-2911`; `region-head.tsx:166,244-275`; `lens-band.tsx:345,482-488`; `mobile-bar.tsx:117,353`; `docs/design/the-document/DECISIONS.md:9987,10767`; `docs/vision/VISION-DECISIONS.md:532`.
