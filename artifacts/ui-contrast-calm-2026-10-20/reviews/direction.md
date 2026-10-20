# US-42 direction v2 — "Where the eye goes" (orchestrator synthesis after Astra review)

Inputs: lens-a-visual-weight.md · lens-b-space-rhythm-calm.md · lens-c-low-vision-a11y.md · astra-adversarial.md (all 15 findings accepted) · the 19 Oct action-clarity proposal · Leah's screenshot · evidence capture SQ-1496.

## 1. The reframe
Leah: "I need the contrast that I see on the sign-in page. It helps my eyes know where to go."
- **Text contrast is generally strong already.** Body ink is 13.5:1 and most action text is 6.3–8:1. The known failures are local defects, not the system (§7). Darkening grey text adds ratio, not salience.
- **What sign-in does** (`PortalAuth.tsx:229–576`), measured:
  - a large dark pane against the form paper at area scale (16.98:1);
  - one filled act (label on button 16.57:1), in sentence-case Inter 14 semibold;
  - one 384px column;
  - a 30px Playfair heading over 11–14px text (≈2–2.7×);
  - boxed inputs with visible oak edges (4.3–4.5:1);
  - very few choices.
  
  The lenses disagree on which of these matters most. Lens A ranks the pane first, Lens B the size ratio, Lens C the one filled act. **We don't know which one Leah's eye uses, so the deck tests it rather than assumes it.**
- **What today's Document does.**
  - Its strongest value contrast is spent on full-width charcoal rules. In her screenshot, the Work region's `--rule-mid` close sits ≈25 CSS px above the FF&E `strong` double rule, which opens a movement. This is approximate: geometry is inferred from a 144-dpi capture, and the ink share is an image statistic, not attention.
  - The region name and every action share one 12px DM Mono caps register (ink vs mocha ≈1.7×). Status is a separate 12.5px Inter paragraph.
  - The largest text is a status line, not the section.
  - Paper stocks are 1.03–1.23 apart, below what reads at a glance.
  - At rest, no action has a filled or inked shape.

## 1b. What the capture measured (evidence/README.md, SQ-1496; local seed "Aspen Loft Refresh", one-voice flag off locally)
- **How wide a lightness range each screen uses** (p5–p95 of luma): sign-in **91 points**, Desk **3.0**, Document **11–17**. Share of dark pixels: sign-in **38.9%**, Desk **0.57%**, Document **1.0–1.3%**.
- **The Desk has zero filled or inked controls.** Every action is a 12px mono caps label: secondary 400 at ~8:1, tertiary 300 at ~6.5:1. Record payment, Not today and Until… sit at nearly the same rank.
- **The Document has two failure modes, depending on the `one-voice` flag. Neither gives one dark shape.**
  - **Flag on** (prod, Leah's screenshot): BandLeadsContext demotes every region leader to text, so there are **zero** dark shapes.
  - **Flag off** (local capture): **every region head prints its own inked pill.** Assign project client, + New open item, Edit FF&E schedule and Draft an invoice each sit at 13.5:1, about 190×28px. Several equal dark pills compete. The band's Next act ("Chase the approval") is plain text with no fill, so the hierarchy is inverted.
- **The FF&E head changes shape under the reader**: 3 actions at load, 5 when scrolled to. Financials goes from 2 to 4.
- **At 390, at a 400px scroll,** the sticky top band and the bottom bar overlap content: "Client User" collides with "SECTION: CLIENT APPROVALS". This is a defect candidate and was not investigated.
- Sign-in, measured: the pane is 16.98:1 against the card. The enabled button label is 16.57:1, 384×48, weight 600. At rest the button is disabled (opacity .55, 2.25:1) until an email is typed. Its headings are 30px and 47.5px Playfair.

## 2. The history the founders need (corrected)
- **V18 Q8 (10 Oct):** "One filled act per view; on the Document the Next act is the only filled control."
- **V20 (12 Oct) built US-27/28,** whose plan read "filled act" as the R139 terminal only:
  - "None on the paper: the Next act stays a scored secondary in the band (R141) and fills in its sheet";
  - "No filled act on the Desk";
  - regions close on `--rule-mid`;
  - both creates stay in the Desk header (U-Q3);
  - NEXT wraps at 390 (U-Q19).
- **d4b1720cf (BandLeadsContext)** demotes section leaders when one-voice is on *and* a Next exists. **f0e55a02b** fixed the FF&E menu with "Edit FF&E schedule" first.
- **R126 (28 Aug):** Kody rejected "the document with the dark header and yellow body". That ruled out one composition, not every localized dark surface.

So, most proposals below **revise V20**. They do not merely finish V18. Each is listed as a ruling.

## 3. One variable to test first — the dark anchor
These are matched specimens with the same layout, type and space. Only the anchor changes.
- **A · Dark band.** The Next band (one line plus its act) on charcoal stock: ink-paper text, a clay score, and an off-white focus ring. The rest of the paper is unchanged. This is closest to the sign-in pane.
- **B · Filled plate.** The band stays paper. Its Next act is a filled charcoal plate, closest to the sign-in button.
- **C · No fill.** The V20 status quo for the act: a scored word. It gets the size and space changes only.

**Provisional recommendation: B.** The dark area stays button-scale. Underline actions keep working on paper, and focus sits on paper because of the 2px offset. It also avoids the "dark header" register Kody rejected. **But Leah decides this from a side-by-side.** The test asks two things: (1) "Where would you click first?" (5 seconds), and (2) "What happens when you press it?" That second question is the consequence test, and it separates *review* from *commit*.

## 4. Principles
1. **At most one dark shape per view, and only for an eligible next step.** Closed, held, waiting and open-sheet states show no fill. Never manufacture work to fill the slot.
2. **Size before ink.** There should be a real heading level between the page title and the metadata. Region name vs its metadata ≥2×, the sign-in ratio. Size is chosen by specimen (R2).
3. **Space groups; a rule only opens a movement.**
   - Spacing: 12 within a group, 24 between groups, 48 between regions.
   - A region closes with space plus a hairline. The `strong` double rule opens a movement, at most once per view under the band.
   - No separate charcoal boundary may sit within 48px of the double rule.
4. **One lead per section, chosen by the work's state, with quiet tools.**
   - Order: a state sentence, then one scored lead (house-sheet secondary: ink plus clay scores, unfilled), then Edit / Add / More.
   - The lead is elected from conditions: release, claim, unanswered order, missing price, waiting on the client, billing. This restores `electFfeLeader`'s intent, not its old order.
   - The page band names the same step when it points into that section.
5. **Actions read as words.**
   - Actions are sentence-case Inter 14–15, weight ≥400, with an unconditional resting underline. Long labels wrap.
   - Mono caps are permitted for metadata only (V18 Q9). Counts use `.t-meta`, which is sentence case.
6. **Edges where an object needs one.**
   - A boundary that identifies an object must be ≥3:1 (card-edge 3.21 on Desk cards).
   - Hairlines are decoration only.
   - An opt-in `prefers-contrast: more` tier is offered for Leah's Mac.

## 5. Treatment deltas (existing tokens; nothing new unless ruled)
| Element | Today | Proposed |
|---|---|---|
| Next act (option B) | `primary` scored word (R141) | Filled charcoal plate: `--ink` ground, `--ink-paper` text, Inter 15 semibold, sentence case, 44px, 2px radius. Forced colors give a `ButtonText` border. Focus is the clay-ink ring at a 2px offset on paper. Held and loading states keep their focus path. |
| Commit acts (money / sign) | terminal, filled | Unchanged and only inside their sheet: Inter 16, 48px, 3px radius, amount or party in the label. **Fill on the paper means "your next step"; fill in a sheet with an amount means "this commits."** |
| Region name | `.eb` 12 mono caps | Chosen by specimen from `.t-d3` 20 Playfair, `.t-d2` 26 Playfair, or the eyebrow plus a strong `.t-d3` state sentence (Lens A) |
| Status | 12.5 Inter ×2, plus a separate 16–20 totals line | One `.t-body` 16 ink sentence. Say each fact once. |
| Section lead | demoted to mocha secondary | One state-elected scored lead, unfilled |
| Other actions | mocha / quiet-ink 12 caps, weight 300–400 | Tools in sentence case, ≥400, oak rest rule. More holds an inventory (below). |
| Region close | `--rule-mid` 1.5px charcoal (V20) | 48px plus `--hairline-strong` |
| Room rows | toolbar always visible; disclosure only on hover | Name in `.t-d3` 20 with a visible ⌄; actions inside the open room. A single-room job opens by default, respecting any saved preference. |
| Narrow widths | dock exists below 1180; band phone layout below 600; Next filtered out of the dock | **Below 600:** the dock is the single owner of the Next act (B plate) and the band prints its sentence only. **600–1179:** the band owns it and the dock leaves it out. Specimens at 320, 390 and 768, plus 200% zoom. |
| Desk | ~4 actions per line; three columns; creates first | Card-level layout: the card holding the top line spans full width and the rest sit in two columns. Grouping, settled-in-place, Undo and non-refilling slots are kept (V20 U-Q2). Not today / Until… fold into "Later". **Record payment stays visible.** Creates move only if R7 rules. |

**More inventory (FF&E):**
- **Stays visible:** Edit selections, Add items.
- **In More:** Record a selection change, Open specification book.
- **Financials details:** time ledger, financial change.

## 6. Rulings for the founders
- **R1 · The dark anchor and the meaning of fill.** Choose A, B or C (§3). If A or B, fill on the paper means "your next step, which never commits", and commit fills live only in sheets with the amount in the label. This revises V20 and US-27 Area 2 ("None on the paper") and narrows R139/R141 and the CLAUDE.md "only terminal fills". *Provisional: B, after Leah's side-by-side.*
- **R2 · The heading level.** Choose 20 or 26 Playfair, or the eyebrow plus a strong sentence, judged on a long, folded, seven-room Document. This reverses the US-28 "never a display heading" decision. *Recommend: pick by specimen. The lenses split 2:1 for a Playfair name.*
- **R3 · The rule budget.** A region closes with space plus a hairline, and the double rule is used only for movements. This revises V20/US-27 "each region closes on `--rule-mid`" and R126's placement. *Recommend yes.*
- **R4 · One state-elected local lead per section, unfilled.** This revises d4b1720cf and f0e55a02b, and carries the 19 Oct state/action matrix and its read-only readiness destination. *Recommend yes.*
- **R5 · Sentence-case actions; mono caps only for metadata.** This amends house sheet §A5 and applies V18 Q9. *Recommend yes.*
- **R6 · Narrow-width ownership of the Next act** (below 600, the dock). This revises V20 U-Q19 and the a28655a4f filter. *Recommend yes, with the breakpoint table above.*
- **R7 · The Desk.** Card-level layout and a "Later" fold for Not today / Until… only. Optionally move the creates out of the header, which revises V20 U-Q3. *Recommend pilot; keep the creates in the header until tested.*
- **R8 · A `prefers-contrast: more` tier,** with card-edge allowed on rows inside it. *Recommend yes.*

## 7. Defects to fix regardless (no ruling needed; not built in this story)
- `ffe-section.tsx:637`: clay-ink at `opacity-70` gives 3.07:1, which fails 1.4.3.
- `region-head.tsx:254`: the heading focus outline in clay is 2.18:1, which fails 1.4.11. Change it to clay-ink.
- `mobile-bar.tsx:487`: the held row uses `opacity-60`. Change it to text-faint.
- The SPEC §A11 forced-colors rules for `.da-*` are not implemented, so underlines are likely to vanish. This needs a runtime check.
- Tokens: portal muted `#5C4A3C` and subtle `#4E4339` against canonical `#4E4339` and `#5A4E43`, and `--hairline-strong`. These need an explicit role mapping, not a swap.
- State inks on rail are ~4.3–4.45:1 (golden-ink 4.452). Keep them off rail.

## 8. Before anyone builds — evidence the founders get / still owe
- **In the deck:** matched A/B/C anchor specimens, a heading-size specimen on a long Document, the FF&E + financials before/after, the Desk, narrow-width specimens, and the measured contrast tables.
- **Still owed:**
  - Leah's side-by-side (5-second click plus the consequence question).
  - A first-time designer finding "Add to Bed" without hunting, plus repeated editing across several rooms with focus returning.
  - Runtime checks: forced colors, 320 reflow, 200% zoom.
  - The FF&E + header pilot behind a flag for Middle West Studio.
- Dark mode stays deferred (V20 U-Q9).
