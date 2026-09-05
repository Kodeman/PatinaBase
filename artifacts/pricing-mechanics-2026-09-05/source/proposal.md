# The Number That Holds — pricing mechanics for the studio

Program: pricing-mechanics-2026-09-05 · Prepared for Kody (build, infrastructure, operations) and Leah's studio (design and practice) · Synthesis by the orchestrator from research lanes R1–R5 (see `../research/`). Nothing here is built. The document exists to earn Leah's team's reactions and a set of rulings.

## 0. Title, thesis, masthead

- **Eyebrow:** Pricing mechanics · Middle West Studio · 5 September 2026
- **Title (Playfair, two lines):** The Number / That Holds
- **Standing thesis (one sentence):** The client's total holds while the studio shapes each line, and every cost says when it was last true.
- **Prepared for:** Kody · build, infrastructure, operations — Leah's studio · design and practice
- **Lanes:** Practice (R1) · Blending & software (R2) · Price validity (R3) · Code (R4) · Panel, simulated (R5)

## 1. The short version (section 01)

Leah's team asked for two things: to adjust the client price piece by piece — taking the edge off a hero piece and spreading that margin across the room — and to see a verified-pricing date beside every cost. Today Patina can do neither. A designer types one "Unit Price" that lands in the *trade* column; the client price exists only after a bulk "Apply markup %" over selected lines; new lines start at 0% margin; the only margin table is owner-only and titled "studio only"; and no price anywhere carries a date, a source, or an expiry.

The trade confirms both asks are ordinary practice (R1, R2): studios plan to a project-level blended margin and run lower markup on big pieces and higher on accessories; vendor quotes are good for about 30 days and 2025–26 tariff volatility made an undated price a liability (R3). No design-business tool we checked offers a first-class blend or a "priced on" stamp (R2 table, R3 table). This is Patina's to do first.

Eleven proposals in three waves. **Wave one fixes the floor** — five defects that make every margin figure wrong today. **Wave two prices with intent** — the Blend, the Priced-on stamp, the honest release sheet. **Wave three keeps it honest** — price history, post-sale edits, library intake. Eleven rulings, each naming who rules. Nothing in this document resolves vision ruling V1 (Patina's own margin pocket); everything here is the studio's own money.

## 2. What Leah's team asked for (section 02)

Quote the feedback as received (gist, not verbatim): "When we build a job, a proposal, or a purchase approval, we like to adjust the client cost per piece — taking the edge off more expensive pieces sometimes and spreading some of that margin across items. We'd also like to see verified pricing dates next to our cost."

Read it as three needs: **control** (shape the client price per line), **a held total** (the room's number does not move when a line does), **trust in the cost** (when was this true, says who, until when). Note what is *not* asked: nothing about the client seeing margin; nothing about Patina's take.

## 3. What exists today (section 03) — code-cited from research/04

Describe, then list the floor defects. Each F# carries file:line from `research/04-codebase-today.md` (the author must pull citations from there, not invent them).

- The single-price entry: one "Unit Price" field → `proposal_items.unit_price` (trade). Client price = same number until a bulk markup runs.
- The bulk markup bar: select lines → "Markup %" → Apply; skips allowance/TBD.
- The Financial lens: owner-only, "Financial lens · studio only", trade · markup · client · line margin, room subtotals, hint `trade × (1 + markup) = client`, type at 0.55–0.58rem, below both the 12px metadata token floor and the 11px stamp convention.
- The mirror law: client sees `unit_sell_price`/`line_total_cents` at `full`, nothing at `milestone`/`curated`; trade, markup, margin never projected. Stays.
- Post-sale: `project_ffe_items` client/trade/markup(advisory); pricing edits RPC-only; hook throws; authorization freezes client price; "Prices lock when you release."
- Price freshness: nothing. `valid_until` is document expiry, not price age. Partial precedents: `photo_verified_at`, `price_cents_at_save`, custom-commission quote `validUntil`, spec-book `FieldProvenance` (`source · verified <date>`).
- Studio settings: card fee and remit-to only. `user_settings.default_markup` (default 30) read by nothing.

**Five floor defects (F1–F5):**
- F1 Retail masquerades as trade — library picks land `price_retail` in the trade column although the trade price is on the pick and read zero times; a fifth site is in SQL (`consume_capture`, 00142) so a TypeScript-only fix misses it; every picked line reads 0% margin; any markup compounds on retail.
- F2 The designer's own totals sum trade — row cost and "Est. total" use `unit_price`; `proposals.total_amount` sums client. They disagree the moment markup ≠ 0.
- F3 A trade edit overwrites the client price — `useUpdateProposalItem` sets `unit_sell_price = unit_price` whenever trade changes.
- F4 Every insert path ships at 0% — add, pick, capture-consume, send-to-schedule from a pin.
- F5 Activation clamps — NULL or negative pre-sale markup becomes 0 post-sale, and an unknown trade cost becomes $0 — “unknown cost” is silently recorded as 100% margin. Also: the authorization locks freeze only the client's numbers; `trade_price_cents`/`markup_percent` stay editable after signature (the authorization's own snapshot does freeze trade).

Also: four unshared margin computations (lens cents, account-page %, project-financials per-category, portal use-projects with a removed-line filter) that disagree on client value, status filter, unit, and removed lines — one definition is owed. And: the bulk markup bar sits outside the owner gate while the lens sits inside it — setting is ungated, reading is not.

## 4. What the trade does (section 04) — from R1, R2, R3

Keep to one screen each. Cite the research file + external URL for every number.

- **Models.** Hybrids dominate: a design fee (flat/hourly) + cost-plus on furnishings, or retail-minus. Markup on cost vs margin on price is routinely conflated (35% markup ≈ 26% margin). Category ranges cited by practitioners: general FF&E ~30–40% markup; custom upholstery higher; case goods 40–60%. No survey breaks down model share; say so.
- **Disclosure.** ASID Code of Ethics: fully disclose all compensation. "Industry-standard markup" boilerplate has failed in court. Safer pattern names the procurement fee %. Implication for Patina: the *client* documents already never show trade; the *studio* must be able to state its own practice precisely — the tool should make the studio's number legible to the studio, never leak it to the client.
- **Blending.** Named practice: plan to a project-level target (commonly 30–40% margin), run lower on hero pieces, higher on accessories. No tool has a blend; all use a default → category/vendor → per-item override stack operated by hand. Every tool treats markup and client price as two views of one number (enter either). Rounding is manual everywhere; professional-services pricing favours $0/$5 endings, not $.99. MAP is a hard ceiling from the vendor; ~2.2–2.5× wholesale is the practical top. Freight: split between a disclosed line and folded-in.
- **Price validity.** 30 days is the modal quote window; "subject to change without notice" is boilerplate; tariff surcharges 3.5–9% layered mid-cycle in 2025–26; designers now disclose tariff exposure up front. No design tool documents a "priced on / expires" field. Adjacent precedents: Aisle Planner's Expiration Date with a client-facing expired message; ERP effective-date pricing; "as of"/"updated" microcopy in fintech; DesignFiles' vendor-response log. A trustworthy stamp = date · who · source · validity · what changed.
- **Competitor matrix.** Reproduce the R2 table condensed (products × 5 capabilities) and the single line: *blend/spread across a project — no, in all eight.*

## 5. Principles (section 05)

1. **The client price is the number; markup is a note about it.** (00185 already says so post-sale. Make pre-sale agree.)
2. **The total holds.** A move on one line is paid for by the others, visibly, in the same act.
3. **Say the date or say nothing.** A price without a verified date shows *unverified*; never imply freshness (the C5 convention from `photo_verified_at`).
4. **Trade never travels.** Every client surface keeps its columns; nothing here widens the client's view of money.
5. **Quiet when fresh.** Aging is a change of ink, not a banner (R5 need 10). No red; terracotta is the strongest word.
6. **Every move leaves a trace.** A blend, a verify, a price change — each is a line in the record, in plain words (R5 needs 4, 8).
7. **The studio decides who sees margin.** Not the tool's default (F150; queued ruling).
8. **Nothing here is Patina's money.** Rail A only; V1 stays open.

## 6. The fixture — the Lindqvist residence, Minnetonka · Living room

All mockups use these numbers. Arithmetic is exact; the author reproduces it, never invents. Rounding rule in the studio settings: **to the nearest $5**; margin floor **25%**; default markup **35%**; category defaults: upholstery 35, case goods 40, lighting 45, rugs 35, accessories 50 (the fixture applies the flat 35 first so the Blend's effect is legible; category defaults appear only in the settings mockup).

| Code | Line | Maker (fictional, Midwest) | Qty | Trade each | Trade line |
|---|---|---|---|---|---|
| SO-01 | Sofa, 96", bench seat, Maharam wool | Halvorsen Upholstery, Duluth | 1 | $6,400 | $6,400 |
| CH-01 | Lounge chair, pair | Halvorsen Upholstery, Duluth | 2 | $1,850 | $3,700 |
| CT-01 | Coffee table, black walnut | Red Wing Joinery | 1 | $2,200 | $2,200 |
| LT-01 | Floor lamp, blackened steel | Iron & Ash, Milwaukee | 1 | $640 | $640 |
| RG-01 | Rug 9×12, hand-loomed wool | Prairie Loom, Lawrence | 1 | $2,900 | $2,900 |
| ST-01 | Side table, pair, ash | Red Wing Joinery | 2 | $520 | $1,040 |
| | **Trade total** | | | | **$16,880** |

**Uniform 35% (after P3 default, rounded to $5):** SO-01 $8,640 · CH-01 $2,500 each → $5,000 · CT-01 $2,970 · LT-01 $865 · RG-01 $3,915 · ST-01 $700 each → $1,400. **Client total $22,790 · margin $5,910 · blended 35.0%.**

**The Blend (P2):** Leah takes the sofa to **$7,900** (markup 23.4%) — "the edge off." Difference **$740** spreads across the unlocked lines in proportion to trade; RG-01 is **locked** at $3,915 (published retail — never above retail). Unlocked trade = $7,580. Result, rounded to $5 with the remainder landing on the lamp so the total reconciles: CH-01 $2,680 each → $5,360 (44.9%) · CT-01 $3,185 (44.8%) · LT-01 $930 (45.3%) · ST-01 $750 each → $1,500 (44.2%). **Client total $22,790 — unchanged. Blended 35.0%. Margin $5,910.** Deltas shown per line: SO-01 −$740 · CH-01 +$360 · CT-01 +$215 · LT-01 +$65 · ST-01 +$100 · RG-01 locked. (Check: −740 + 360 + 215 + 65 + 100 = 0.) Floor check: no line below 25%; lowest is SO-01 at 23.4% markup = 18.99% margin on price → **the sofa trips the 25% floor warning** (margin on price = 1,500/7,900 = 19.0%). Show the warning as quiet terracotta ink on the sofa row: "below the studio floor · 19% margin". This is deliberate: the floor is advisory, Leah proceeds.

Note for the author: markup % and margin % are both shown in the lens footer with the words "on cost" / "on price" so the two frames are never confused (R1 finding 3).

**Priced-on states (P4), today = 5 Sep 2026; fresh ≤ 60 days, aging 61–90, stale > 90 or past validity:**
- SO-01 — `verified Aug 12 · quote #4471 · good through Oct 11` — fresh (24 d)
- CH-01 — `verified Jul 1 · price list 2026-B` — aging (66 d)
- CT-01 — `verified May 20 · phone · Red Wing` — stale (108 d)
- LT-01 — `unverified · catalog price` — unverified
- RG-01 — `verified Aug 28 · website` — fresh (8 d)
- ST-01 — `verified Sep 2 · phone · Red Wing` — fresh (3 d)
Preflight strip before send: "1 line priced more than 90 days ago · 1 unverified · Verify" (CT-01, LT-01).

**Price history (P5):** CT-01 re-verified on Sep 4: trade $2,200 → **$2,310** (+5%, Red Wing 2026 list). Line unfold reads: `was $2,200 on May 20 · now $2,310 · verified Sep 4 · price list 2026-C`. Client price unchanged at $3,185 → markup falls to 37.9%; lens shows the squeeze. (Show only in the P5 mockup; other mockups keep $2,200.)

**Authorization (P6):** Leah releases SO-01, CH-01, CT-01, RG-01 for approval: client subtotal $8,640? — no: use the blended prices — $7,900 + $5,360 + $3,185 + $3,915 = **$20,360**; deposit at 50% = $10,180; balance on delivery $10,180. Designer side shows margin on these four lines: trade $15,200 → margin $5,160 (25.3% on price) and price-age glyphs; "priced as of Sep 5, 2026". Client's sheet: Item · Room · Signed qty · Client price, total $20,360, deposit $10,180 — four columns and no fifth, plus one line: "Prices good through Oct 5, 2026" (P10, from `valid_until` 30 days).

## 7. The proposals (section 06/07) — each with its mockup brief

For each: what changes · why it matters to the studio · what the client sees (unchanged unless stated) · what it costs (S/M/L) · dependencies (from the feasibility memo) · the mockup.

**P0 · Fix the floor** (S, no migration). F1–F3 plus one definition of margin. No mockup; a before/after of the "Est. total" line is enough: *today* `6 items · Est. total: $16,880` (trade) vs *proposed* `6 items · $22,790 to the client · $16,880 trade · 35% blended` (owner-visible portion gated per P8 ruling).

**P1 · The client price is a first-class field** (S, none). Mockup M2: the FF&E facet row, edit state: `Trade $6,400 · Markup 35% · Client $8,640`; type `7,900` in Client → Markup reads `23.4%` and line margin `$1,500`; type `40` in Markup → Client reads `$8,960`. Allowance/TBD rows show `—` in Markup/Client with the existing "Allowance $2,000–$4,000" sub-line. Decide: a client price below trade shows markup as `−` with the value (ruling R5).

**P2 · The Blend** (M; draft only; optional atomic RPC). Mockup M3 — a sheet titled *Blend · Living room*: header band `Trade $16,880 · Client $22,790 · 35.0% blended · Margin $5,910`; a mode switch `Hold the total | Hold the blend %` (ruling R3); rows with a lock glyph, Trade, Client (editable), Markup, Δ; SO-01 edited to $7,900 → the other unlocked rows show `+$360 +$215 +$65 +$100`, RG-01 shows a lock and `retail ceiling`; footer `Total holds at $22,790 · 4 lines moved · rounded to $5`; the sofa row carries the quiet floor warning. Below the sheet, the trace line as it will appear in the record: `Blend · Living room · Sep 5 · Leah · SO-01 −$740 spread over CH-01 CT-01 LT-01 ST-01 · total unchanged`. State note: on a sent proposal the sheet's only act is *Revise* (a new draft edition).

**P3 · Studio pricing defaults** (S–M; migration `studio_pricing_settings`). Mockup M6: Account › Studio › **Pricing** block below Billing: `Default markup 35% on cost` · `By category: Upholstery 35 · Case goods 40 · Lighting 45 · Rugs 35 · Accessories 50` · `Round client prices to $5` · `Margin floor 25% on price — warn, never block` · `Who sees margin: Owners | Everyone in the studio` (this last control depends on ruling R1). Copy: "Applied when a line is added. Change a line any time."

**P4 · Priced on** (M; migration). Mockup M4: the six fixture rows with the mono meta line under Trade in the four states; ink: fresh = `--text-faint`, aging = golden-hour-ink, stale = terracotta-ink, unverified = faint with the word. The **Verify** act: a small popover — `Source: vendor quote | price list | website | phone | catalog` · `Reference (quote #, list rev, who you spoke to)` · `Good through (optional)` · `Trade each` (pre-filled, editable) · `Verify`. Mockup M5: the pre-send preflight strip, in the send sheet's gate grammar: `1 line priced more than 90 days ago · 1 unverified · Verify · Send anyway`. Client sees nothing new.

**P5 · Price history** (S–M; migration). Mockup M9: the line unfold for CT-01 with `was $2,200 on May 20 · now $2,310 · verified Sep 4 · price list 2026-C` and the lens row showing markup 44.8% → 37.9%. Words, not colour, carry the change.

**P6 · Purchase approval, priced honestly** (M; small migration). Mockup M7, two panels side by side: *the studio's side* — Review & release with a fifth, owner-gated column group `Trade · Margin` and the price-age glyph per line, figure band `authorization $20,360 · deposit $10,180 at 50% · balance $10,180 · margin $5,160 · 25.3% on price · priced as of Sep 5`; stale line CT-01 carries `re-verify?` in the same quiet ink; *the client's document* — Item · Room · Signed qty · Client price, total, deposit, and `Prices good through Oct 5, 2026`. Caption: "Four columns and no fifth — on the client's copy."

**P7 · Post-sale money edits** (M; migration RPC; ruling-gated). No mockup; a short state table: `unpriced/placed → editable · on a sent authorization → locked ("void the authorization to edit") · signed → change order · configured → revise the configuration`.

**P8 · The lens, for the whole studio** (S, none). Mockup M8: the lens with a room row `Living room · trade $16,880 · client $22,790 · margin $5,910 · 35.0% on cost · 25.9% on price`; header renamed per ruling — offer two words: `Your book` or `Studio view` — never "studio only" / "eyes only"; type at 11px.

**P9 · Library intake** (S + M; with P4). No mockup beyond a two-row CSV header example: `Name, Maker, Category, Trade, Retail, Priced on, Source`.

**P10 · Good through** (S, none). Shown inside M7's client panel and as a one-line addition to the proposal Investment block.

## 8. The proposal list (section 08) — master table

Columns: # · Name · Surface · What changes · Why the studio cares · Effort · Wave · Depends on. Dependency row per proposal names exact files/migrations from the feasibility memo (research/00-raw/d-feasibility-memo.md and research/04). Waves: **Wave one · Fix the floor** = P0 P1 P3 P8 · **Wave two · Price with intent** = P2 P4 P6 P10 · **Wave three · Keep it honest** = P5 P7 P9.

## 9. Three waves (section 09)

Wave one ships without a migration except P3's table; it can be walked by Leah inside two weeks of a go. Wave two carries the two migrations that thread columns through the copy paths (P4) and the release sheet change (P6) — the walk before flag-enable rule (DECISIONS:2996) applies. Wave three is ruling-gated (P7) and library-side.

## 10. Open rulings (section 10) — R1…R11, house grammar: title · the question · the tension · Recommendation · who rules

- **R1 · who sees margin** — owners only (today) or everyone in the studio? Tension: F150; the first hire builds the schedule blind. *Recommendation:* a studio setting, default **everyone in the studio**, owners can restrict. Leah rules practice; Kody rules the default.
- **R2 · the entry frame** — markup on cost, discount off retail, or both? Tension: R1 finding 3 (frames conflated). *Recommendation:* the field is **client price**; markup on cost is shown beside it; margin on price appears in totals with the words "on price". No discount-off-retail entry in v1. Kody rules.
- **R3 · what the Blend holds** — the client total or the blended %? *Recommendation:* **the total**, with the % as the readout; "hold the %" is a second mode only if the team asks. Leah rules.
- **R4 · rounding** — none, $1, $5, $10, $25? *Recommendation:* studio setting, default **$5**, applied to client unit prices only; remainder lands on the smallest unlocked line. Leah rules.
- **R5 · a client price below trade** — store NULL, negative markup, or refuse? *Recommendation:* allow it, show the negative, warn at the floor; activation stops clamping (fix in F5). Kody rules.
- **R6 · price-age thresholds** — 60/90 default? Per studio? *Recommendation:* studio setting, defaults **60 aging / 90 stale**, validity date always wins. Leah rules.
- **R7 · the client and dates** — does the client see "priced as of" or only "good through"? *Recommendation:* **good through only**, on proposal and authorization; never a per-line date. Leah rules, counsel on the wording.
- **R8 · post-sale edits** — the boundary. *Recommendation:* editable until a line sits on a sent authorization; then void-to-edit; signed = change order. Kody rules (absorbs the queued ruling).
- **R9 · the floor** — warn or block? *Recommendation:* **warn, never block**; the studio prices, the tool remarks. Leah rules.
- **R10 · "Prices lock when you release"** — keep the copy? *Recommendation:* keep; add "priced as of" beside it. Kody rules.
- **R11 · what stays out** — V1 (Patina's margin pocket), design fee as % of spend, Pledge copy. *Recommendation:* named, parked; V1 to VISION-DECISIONS as V9 candidate only when maker conversations begin. Kody rules.

## 11. Questions for Leah's team (section 11)

Use the panel's twelve (research/05) trimmed to ten, each answerable in one sentence, grouped: how you price today (3) · the Blend (3) · the date (2) · who sees what (2). Add the feedback path: comments on the Artifact, or a 30-minute walk.

## 12. Appendix (section 12)

- Verified in code (with file:line) vs from the trade (with URL) vs **simulated** (the panel — never evidence).
- Vision refusals honored: no "AI"; no engagement metrics on the studio surface; no Pledge copy; no client-visible margin; no hidden fees introduced.
- Explicitly not measured: time-in-lens, opens, clicks.
- Sources list (from research/01–03).
