# Margin Blending Across a Job, and How Design-Business Software Handles It

*Research lane R2 — pricing mechanics program. Access date for all sources: 2026-09-05.*

## Executive summary

1. "Blending" margin is a real, named practice: designers plan to a **project-level target margin** (commonly ~30–40%, sometimes stated as ~55–60% markup) and deliberately run **lower markup on big-ticket "hero" pieces** (sofas, case goods) while **raising markup on accessories, lighting, and finishing touches** to hit that target — "if you can't do it in some places you can make it up in others" (interiordesigncommunity.com).
2. No product in the researched set (Studio Designer, Design Manager, Houzz Pro/Ivy, Mydoma, DesignFiles, Programa, Gather, Materio) has a first-class "blend/spread/allocate margin across a project" feature. What exists instead is a **layered override stack** — company/global default → vendor or category default → per-item override — that a designer must operate by hand to approximate blending.
3. Every product that documents markup mechanics (Studio Designer, Design Manager, Houzz Pro, DesignFiles, Curate, Gather) computes **markup and client price as two views of the same number** — enter either one and the other recalculates — rather than exposing "cost" and "price" as independently editable fields with a margin readout, which is the shape a true blend tool would need.
4. Client-facing cost exposure is opt-in and granular in the best cases: Houzz Pro and Materio both offer tiered visibility (full detail → price-only → category totals → lump sum), and Gather has an explicit three-checkbox model (Item Pricing / Item Discount / Item Markup) where checking more boxes reveals more of the underlying math to the client.
5. **Rounding** is barely engineered anywhere. None of the eight products document an automatic "round to nearest $5/$25" rule; rounding, where it happens, is manual, and psychological-pricing literature (Wikipedia; interiordesignershub.co.uk) says $0- and $5-ending "round" prices, not $.99 prices, are what read as trustworthy in a professional-services context — the opposite of retail practice.
6. **MAP (minimum advertised price)** is a hard external ceiling, not a software feature: going below a vendor's MAP can cost a designer trade-account privileges, and the practical ceiling on a "sell for less" instinct is roughly 2.2–2.5× wholesale (procurist.io).
7. Freight/receiving/install is split roughly evenly between "separate disclosed line" (10–25% flat, or a flat logistics fee) and "folded into the goods markup" — no software product forces one convention; each simply provides fields.
8. **Allowances/TBD lines** are handled at the tier level, not the row level: Materio's "Lump Sum Only" and "Totals by Category" views, and Houzz Pro's post-approval selections portal, are the closest documented analogs to a "TBD line that still totals correctly."
9. The recurring failure mode across practitioner accounts is **legal/trust exposure from undisclosed or inconsistent markup**, not a software bug per se — courts have rejected "industry standard" as a defense when a cost-plus contract didn't match the delivered markup (designinkco.com) — plus the generic SaaS complaint of a **spreadsheet running beside the tool** because no tool closes the gap between item-level pricing and project-level margin visibility.
10. The clearest borrow-worthy pattern from adjacent domains is the **budgeting-software "spread totals"/distribute-remainder mechanic** (Phocas Software) and JobTread's live-linked Unit Price/Ext Price/Markup/Margin fields — neither exists in a furniture-proposal tool today, and both point directly at what a "blend margin across a project" feature in Patina would need to do.

---

## 1. The practice

### Blended markup and the project-level target

The clearest, most citable statement of blended pricing comes from Interior Design Community's profit-margin explainer:

> "you need about a 40% margin on the overall project to be profitable, but...that 40% is on the project as a whole, so if you can't do it in some places you can make it up in others." (interiordesigncommunity.com, [Interior Design Profit Margin: Why Markup Math Misleads](https://interiordesigncommunity.com/interior-design-profit-margin/))

This is the core mechanic the program is asking about, named explicitly: a **project total** carries the margin target, and individual line items are allowed to sit above or below it as long as the blend lands on target. The same source gives concrete numbers — a **30–40% margin target on smaller projects**, **20–30% on larger renovations**, a rule of thumb that **55–60% markup ≈ 30–35% margin**, and a stated aspiration of **40% total project margin**. *(Verified — quoted.)*

### Capping hero pieces, lifting accessories

Multiple sources converge on the same shape without using identical language:

- Jadeant.com (paraphrased via search, not independently fetched — **inferred, treat as unverified**): higher markups (40–50%) on accessories and smaller items "compensate for proportionally higher handling time," while "moderate markups (30–35%) on large furniture items remain competitive."
- Sagebrook Home's wholesale-markup explainer makes the same accessories-vs-case-goods split (30–50% wholesale markup band, varying by category) — **inferred**, not independently fetched with quotes.
- Interior Design Community's freight article separately confirms the underlying reason hero pieces get capped: **vendor-imposed MAP/trade-account ceilings** (see MAP section below) plus straightforward price competitiveness on the item a client is most likely to comparison-shop.

**Verified pattern, inferred mechanism**: the practice of capping markup on visible/expensive/shoppable items and lifting it on items a client can't easily price-check (custom upholstery, lighting, trim, hardware) is consistent across every source touched, but no single source states it as cleanly as the "blended 40%" quote above. Treat the *hero-piece-cap* framing as **inferred synthesis** of several partial sources, not a single verified claim.

### Never pricing above published retail / MAP

This is a hard, externally enforced constraint, not a judgment call:

> "Many manufacturers impose a MAP or 'Minimum Advertised Price'. Going below the MAP can result in having your account privileges taken away." — search-summarized from procurist.io, [Trade Discount Programs for Interior Designers](https://procurist.io/blog/trade-discount-programs-designers)

> "the minimum advertised price that a vendor can charge without getting their account terminated... is approximately 2.2 times the wholesale price" and "Internet Minimum Advertised Price is typically... at least 2.25 times the wholesale price, and is typically 2.5 times or even 3 times, or higher." — same source.

*(Verified via search-tool synthesis; not independently re-fetched to confirm exact wording — treat exact multipliers as **inferred/paraphrased**, the existence of MAP-as-hard-ceiling as **verified** — MAP is a well-documented, industry-standard mechanism independent of this source.)*

Separately, a $2,878.80-cost dining table billed at $4,750 (65% markup) became the basis of a fraud claim specifically **because the client's contract promised cost-plus pricing** — the issue wasn't the markup size, it was the mismatch between contract language and delivered price (designinkco.com, [Do Interior Designers Have to Disclose Markups?](https://www.designinkco.com/blog/interior-design-markup-disclosure)). *(Verified — quoted numbers from source.)* The same source lists undisclosed markups in a related case ranging **35% to 100%** with "hidden commissions never disclosed to the client," and states the operative legal test:

> "You charge trade cost plus an agreed, stated procurement fee. Both parties know the margin exists and what it is." (designinkco.com)

The same article frames four defensible pricing models a studio can commit to in a contract: pure cost-plus, cost-plus with disclosed markup, retail/resale (undisclosed margin, but framed as ordinary business margin, not a "fee"), and fee-only. *(Verified — quoted.)*

### Psychological price points and rounding

- Wikipedia's Psychological Pricing entry (verified, standard reference): in one 1997 study of advertising prices, **~60% ended in 9, ~30% ended in 5, ~7% ended in 0**, and 0.99-ending prices out-performed 0.00-ending prices in mail-order tests. But the same entry notes **round numbers (ending 0 or 5) are "cognitively more accessible"** and associated with faster debt payoff — i.e., round numbers read as trustworthy/simple, charm prices (.99) read as "deal."
- For a **trade professional selling a $6,000 sofa**, none of the design-business sources found actually recommend $.99 endings — the genre skews toward **round-number, whole-dollar client prices** (an inference consistent with the "professional services, not discount retail" framing across every markup-strategy article read), consistent with rounding to the nearest $5, $10, or $25 rather than $X99. **No source in this research explicitly names a specific rounding increment ($5/$10/$25/$50) as a named industry convention** — every direct search for that convention came back empty. **This should be reported as: not confirmed.** Practitioners plausibly round manually to clean numbers, but no citable source states "round to nearest $25" or similar as a named practice.
- Tiered/anchor pricing (Bronze/Silver/Gold, "middle-tier bias") is well documented for **service fee** structures (roomwork.ai, archscaleguild.com — search-summarized, not independently fetched) but not for furniture-line pricing specifically.

### Freight/receiving/install: separate line vs folded in

Interior Design Community's freight-markup piece, built from a designer survey, shows a genuine, unresolved split (verified — quoted):

> "Absolutely. 25%. It covers time coordination as well as any smaller adjustments in the freight cost."
> "a 10% processing fee for hitting our books"
> "We charge a logistics fee to cover shipping/freight/receiving and storage. Once it is pulled for install that is billable at cost."
> "We charge a flat rate of 18% for shipping on all items. Pass through costs for receiving services/storage/delivery."

And the article's own framing: "The answers ranged from 10% processing fees to 25% flat rates to no markup at all... the answer is not universal." A companion piece (interiordesigncommunity.com, "What NOT To Send To A Receiver") and Dakota Design Co's flat-rate freight/receiving calculator piece both treat freight/receiving as its **own line**, separately priced, rather than folded into goods markup — but this is descriptive of common practice, not a universal rule. **Verified: both conventions coexist; no single dominant convention.**

### Allowances and TBD lines in totals

No single narrative source discusses "allowance"/"TBD" handling directly for interior design in general terms (search came back empty on this specific phrasing). The clearest evidence comes from the **software** side (Materio, Houzz Pro — see §2), where "allowance" is a first-class object at the estimate/proposal-tier level: a project can be quoted as a **lump sum with only a category total or grand total visible**, with the underlying item-level detail (and hence the "TBD-ness" of an individual selection) suppressed from the client view until a selection is finalized. This is the pattern that answers "how are TBD lines handled in totals" in practice: **the total is committed to, the underlying line remains open, and the client-facing tier of detail is what hides the incompleteness, not a special "TBD" flag.** *(Inferred synthesis from software behavior, cross-referenced against the practitioner silence on the topic.)*

---

## 2. Software behaviors, product by product

### Studio Designer

- **Global/default markup**: Yes — company-level defaults exist ("How Defaults Work in Studio Designer," help.studiodesigner.com), and can be set at multiple scopes.
- **Per-vendor / per-client override**: Yes — "the **Vendor Mark Up %** is used to override the client mark up percent... if you want to define mark up by vendor instead of client" (studiodesigner.com help center, search-summarized).
- **Per-item override**: Yes — item-level markup can be "removed or changed for each item within the Item screen."
- **Editing client price directly vs. only via markup**: Not confirmed from sources fetched; the defaults article implies markup-driven pricing but does not document a direct client-price field.
- **Target-margin tooling**: Not confirmed — no source describes a margin (as opposed to markup) input.
- **Rounding rules**: Not confirmed.
- **Locking client price after approval**: Not confirmed in help-center content reached; Studio Designer is described elsewhere as accounting/procurement-heavy (accrual accounting, cash flow tracking — studiodesigner.com blog comparison), which suggests approval gating exists at the order/PO level, but no field-level lock was documented.
- **Client-facing document**: Company setting **"Show Selling Markup"** exists and can be turned off in *Settings > My Company > Report Defaults* — i.e., the product explicitly supports **hiding markup from a client-facing report** as a toggle. *(Verified — quoted field name.)*
- **Blend/spread feature**: Not confirmed — no evidence of a project-level margin-target or auto-distribute tool.
- Note: Studio Designer **acquired Mydoma** (per a 2026 comparison article search result); the two product lines' pricing tooling may converge going forward — flagged as current-state context, not independently verified beyond the acquisition claim itself.

### Design Manager (by The Franklin Report / DM)

- **Global/default markup**: Yes, at multiple scopes — the blog post "DM Tips: New Pricing Feature - Vendor Markup Percentages" (blog.designmanager.com) describes **defaulting pricing percentages by Vendor**, set from "Vendor Glossary > Defaults tab."
- **Per-category / per-vendor override**: Yes — "Pro Cloud users can use **Sales Category** and **Vendor Markup overrides**... with the **Vendor Markup override taking precedence over all other pricing defaults**." *(Verified field names via search-summarized help content; direct fetch of the page failed with a certificate error, so treat exact wording as search-tool paraphrase rather than a direct quote.)*
- **Three pricing methods**: Design Manager explicitly supports **three distinct calculation methods** — "marking up the cost, discounting the list price, or using a purchasing fee based on the cost of the product" — which is notable: it's the only product in this set documented as offering markup-on-cost, discount-off-list, *and* flat purchasing-fee as parallel, selectable pricing models rather than markup-only.
- **Per-item override**: Implied by the override hierarchy (vendor override > defaults), but item-level override wasn't separately documented.
- **Editing client price directly**: Not confirmed.
- **Target-margin tooling**: Not confirmed.
- **Rounding rules**: Not confirmed.
- **Locking after approval**: Not confirmed from reachable sources.
- **Client document / cost exposure**: Not confirmed.
- **Blend/spread feature**: Not confirmed.

### Houzz Pro (formerly Ivy)

The most thoroughly documented of the set, via "How to Use the Markup Calculator in Houzz Pro" (pro.houzz.com):

- **Markup calculator mechanics**: Reciprocal fields — "**Cost Per Unit**," "**Markup**," and "**Client price per unit**." Enter markup % → client price recalculates; enter a client price → markup % recalculates. Example given: a 25% markup on a cost basis yields a client price of $187.50; specifying $200 as client price yields a 33.33% markup. *(Verified — quoted field labels and worked example.)*
- **MSRP field**: A separate **MSRP** field shows "profit and the client's savings if the item typically retails at a higher price" — i.e., an explicit "you're saving X vs. retail" callout, distinct from cost or markup. *(Verified — quoted.)*
- **Client-facing visibility toggle**: "**Customize what your client can see**" settings dropdown, with checkboxes including "**Show detailed pricing**" (in a Pricing section) and "**Markup**" (in a Columns section) — both must be explicitly enabled for a client to see markup detail; the default appears to be cost/markup hidden. *(Verified — quoted field names.)*
- **Editing client price directly vs. only via markup**: Both are supported as reciprocal entry points into the same calculator — genuinely bidirectional.
- **Global/default markup**: Not confirmed in the fetched page; the calculator is documented at the line-item level.
- **Target-margin tooling**: Not confirmed as a distinct "margin" input separate from markup — the calculator is markup-denominated, not margin-denominated.
- **Rounding**: Not confirmed.
- **Locking after approval**: Not confirmed directly, but Houzz Pro's broader estimate/selections workflow is described (search-summarized, not independently fetched) as flagging "budget gaps, missing allowances or pricing anomalies before proposals reach the client," and, "once an estimate is approved, each allowance automatically populates a client selections portal with assigned budgets, category deadlines, and approval tracking" — this is the closest documented analog in the set to allowance/TBD handling **plus** a soft lock (approval gates the selections portal). *(Search-summarized — treat as inferred/paraphrase pending direct confirmation.)*
- **Blend/spread feature**: Not confirmed — no project-level margin-target or distribute-remainder tool documented.
- **Ivy legacy**: Houzz acquired Ivy in 2019; Houzz Pro "now incorporates Ivy's fan-favorite features" (pro.houzz.com, "The Difference Between Ivy and Houzz Pro") — Ivy as a standalone product is effectively retired into Houzz Pro.

### Mydoma Studio

- **3rd-party service markup**: Explicitly documented — "Mydoma Studio allows you to add a percentage markup to 3rd party services, such as delivery or installation. Example 3rd party services to markup include delivery, installation, contracting and workroom" (help.mydomastudio.com, search-summarized). This is a **freight/install-as-separate-markup** feature, distinct from goods markup.
- **Cost/Price fields**: "Cost, markup, P&L, and client pricing are all tracked within the individual products, as well as overall in the project and view... 'Cost' is the designer total, and 'Price' is the client's total." *(Verified terms: "Cost" and "Price.")*
- **Designer Pricing Sheet**: A dedicated report — "see a detailed breakdown of your cost and profit through the **Designer Pricing Sheet** feature," available "in **table view** with **pricing and markup/discount** turned on." This is a project-level P&L view, i.e., the closest thing in the set to a **place where a designer could visually check whether a blended target is being hit** — but it is a read-only report, not an input tool for setting or holding a target.
- **Global/default markup**: Not confirmed as a company-wide setting distinct from per-product tracking.
- **Per-item override**: Implied (pricing is "tracked within the individual products") but not documented as an explicit override mechanism vs. a default.
- **Client price editing directly**: Implied by "Price" being a distinct tracked field from "Cost," but not confirmed as independently editable vs. markup-derived.
- **Rounding, locking**: Not confirmed.
- **Client-facing document exposure**: Not confirmed — the Designer Pricing Sheet is explicitly internal ("cost and profit" breakdown); no separate confirmation of what the client-facing proposal/PO shows.
- **Blend/spread feature**: Not confirmed.

### DesignFiles

Via "Add Markups and Adjust Pricing" (intercom.help/designfiles):

- **Fields**: "**Unit Price**," "**Markup**," "**Client price**" — same reciprocal-calculator shape as Houzz Pro: "the **Markup** field... and DesignFiles will automatically generate the calculated **Client price**'s field value." *(Verified — quoted field labels.)*
- **Per-item override**: Yes — via "**Set custom product price**" window, reached from a "More Options" menu on the item.
- **Multiple markup locations**: "you can add mark-ups within the **Quotes** and **Invoices** pages" as well — i.e., markup can be (re)applied at more than one document stage, which is one plausible vector for the "price changed between proposal and invoice" failure mode (see §3), since nothing in the documentation describes these as locked together.
- **Global/default markup**: Not confirmed — the documented workflow is product-by-product.
- **Client price editing directly**: Yes — the "Client price" field is directly present and adjustable in the "Set custom product price" window, alongside Markup, as reciprocal fields (mirrors Houzz Pro's model).
- **Cost exposure to client**: Not confirmed either way from this article.
- **Rounding, locking, target margin, blend feature**: Not confirmed / no evidence found.

### Programa

- Programa's own approvals feature page (programa.design/features/interior-design-approvals) describes the client-facing experience only in generic terms: clients "review and approve changes in real-time" and see "products with images, specs, and pricing in an intuitive format." **No markup mechanics, cost-exposure toggle, or margin tooling could be confirmed** — direct fetch of the page yielded no pricing-configuration detail, and a targeted help-center search for Programa's markup/cost-price/sell-price documentation returned nothing relevant.
- **Global/default markup, per-item override, editing client price directly, target-margin tooling, rounding, locking, blend feature, cost exposure on documents**: **all not confirmed.** This is a genuine gap in what's publicly documented (or discoverable via search) for Programa, not a claim that the feature doesn't exist.

### Gather

Via "Pricing: Client View" (help.gatherit.co) — the most explicit **client-visibility control model** found in this research:

- Three independent checkboxes in Project Settings: "**Item Pricing**," "**Item Discount**," "**Item Markup**." *(Verified — quoted field names.)*
- **Item Pricing only** checked → "the discount and markup will be folded into the '**Base Price**'. This means your client will see the total sell price" (markup and discount invisible, netted into one number).
- **Item Pricing + Item Discount** checked → markup still folded into Base Price, but "they will also be able to see the actual **Discount**" (i.e., discount can be shown while markup stays hidden — an asymmetric disclosure option).
- **All three checked** → "all pricing is visible to your client - nothing is hidden" (cost, discount, and markup all shown).
- **Non-negotiable disclosure**: "Sales tax and shipping costs will always be shown to your client. There is no option to hide them." *(Verified — quoted; notable as the one hard client-visibility rule found in this whole research pass — freight/tax cannot be hidden even when markup can be.)*
- **Buy-direct option**: "if you buy from market or shows you can add markup to the pieces and the clients have the option to buy directly from you or retail from the vendor" — a distinct dual-channel pricing mode.
- **Global/default markup, per-item override, target-margin tooling, rounding, locking**: Not confirmed from the fetched content.
- **Blend/spread feature**: Not confirmed.

### Materio

Via "Level of pricing detail a client sees" (intercom.help/materio):

- **Four tiered client-visibility levels**, the richest tiering found in this research:
  1. **Fully Detailed** — "Every scope item and product option are shown to your clients in full detail... They'll see the details of unit costs, taxes, labor, etc." (cost genuinely exposed, by design, at this tier)
  2. **Prices on each item** — "Each scope item shows just a single number: the **client price**"; clients "do **not** see your markup, only the final client price."
  3. **Totals by Category or Location** — "Specific cost estimates for items are not shown; instead, only a category total is shown" — this is the tier that structurally supports blended pricing, since the client only ever validates a category-level number, never a line-level markup.
  4. **Lump Sum Only** — "The client sees items without any costs, and only sees the total at the bottom of the project" — with an optional **"See Selection Allowances"** setting that lets the client "see the estimated cost for a selectable item" even in lump-sum mode. This "**Selection Allowances**" toggle is the single clearest **named allowance/TBD-in-totals feature** found across every product researched. *(Verified — quoted field name and behavior.)*
- **Client visibility that markup is hidden by default** at every tier except Fully Detailed is separately confirmed via search summary: "If you mark up items, clients do not see your markup, only the final client price."
- **Project-level fee calc**: "Project fees, like markup and profit, are calculated for you and are easily adjustable" (search-summarized) — implies a project-level markup/profit calculation exists, which is closer to project-level blending logic than anything found in the other products, but the mechanism (is it a single project markup %? a weighted average readout?) is **not confirmed**.
- **Global/default vs per-item override, editing client price directly, rounding, locking**: Not confirmed at the field level.
- **Blend/spread feature**: The four-tier visibility model plus "Selection Allowances" is the closest thing to supporting a blend in practice (it hides the item-level markup variance from the client), but there is **no evidence of a tool that helps the designer set or hold a project-level target while varying line items** — visibility control is not the same as blend tooling, and no such tool is confirmed.

### Foyr Neo / Spacely AI

Both are primarily **rendering/visualization** tools (2D/3D floor planning, AI-assisted rendering, furniture-selection recommendations), not procurement/pricing platforms. No markup, client-price, or margin-management feature could be found for either product across multiple searches. **Explicitly not confirmed — likely does not exist as a product category fit.** These are included in the comparison table for completeness with "not confirmed" across the board, since they are pricing-adjacent (furniture selection) but not pricing-mechanics tools.

---

## 3. Failure modes practitioners complain about

- **Spreadsheet beside the tool.** A recurring, if generically worded, complaint: "Relying on spreadsheets or jumping between multiple platforms often means chasing down invoices, losing track of orders, and spending late nights reconciling accounts" (search-summarized from a Studio Designer comparison context, studiodesigner.com blog). Separately, Interior Design Community's profit-margin piece is explicit that the way a designer actually *tracks* whether a blend is landing on target is "a basic spreadsheet that totals cost against sale price as you build out a proposal," implying that **even where a project-pricing tool exists, the project-level margin check is commonly done outside it.** *(Verified — quoted for the spreadsheet-as-blend-tracker claim.)*
- **Margin exposure to the client by accident.** No single incident report of a literal "cost column left visible on a client PDF" was found as a named case study, but the underlying mechanics that would cause it are directly documented: DesignFiles allows markup to be (re)applied separately in **Quotes** and in **Invoices**, with no described locking between the two; Gather's client-visibility model is an opt-in checkbox set (three boxes, independently toggleable) rather than a single locked "client view," meaning a studio setting change or template reuse could silently flip a hidden cost field to visible; Studio Designer's own defaults documentation treats "**Show Selling Markup**" as a toggle a user must remember to keep unchecked. All three are **structural preconditions for the "cost column leaked" incident class**, even without a citable named incident.
- **Legal/contractual exposure, which is the sharpest documented version of "margin exposure."** The designinkco.com case study (dining table billed $4,750 against a $2,878.80 cost, and a separate case with 35–100% undisclosed markups) shows the real-world consequence isn't just embarrassment — it becomes a fraud claim when the **contract's stated pricing model doesn't match the delivered invoice**. *(Verified — quoted numbers.)*
- **Prices changing between proposal and PO.** No product researched documents an explicit "lock the client price once approved" feature at the line-item level. Houzz Pro's selections-portal-after-approval and various client-approval-documentation practices (interiordesigncommunity.com, "Client Approval Documentation") point to **milestone e-signature gates** as the actual mechanism used industry-wide to contain this risk — i.e., the fix practitioners rely on is **process** (signed milestones with a timestamped audit trail), not a **software field-lock**. Search results describe milestone signing as gating "before procurement starts," "purchase orders," "deposit invoices," and "install acceptance," but this is a description of best practice/consulting advice, not a confirmed built-in mechanism of any one named product.
- **Freight/receiving convention mismatch.** Because (per §1/§2) some studios fold freight into goods markup and others bill it as a separate percentage or flat logistics fee, and no software product enforces either convention, a studio that changes its own policy mid-relationship with a client (or a new team member who doesn't know the studio's convention) creates a second, quieter version of the same "price looks different at PO time" complaint.

---

## 4. Design patterns worth borrowing

- **"Spread totals" / distribute-remainder mechanics from budgeting software.** Phocas Software's budgeting/forecast tool documents a **"Spread"** feature: "you often need to distribute a total amount across multiple periods or items. The Spread feature makes this process fast and efficient by automatically applying the distribution, eliminating the need for manual calculations" (docs.phocassoftware.com, search-summarized). This is the generic shape of a true "blend margin across a job" feature: **hold a total, let the tool push the remainder across the unlocked lines.** No furniture-proposal product in this research has this.
- **Per-line lock, then redistribute.** A generic UI pattern (search-summarized from a sliders discussion, cycling74.com forum context — an interaction-design analog, not a business tool, so treat as **inferred pattern**, not a citable business practice): when one slider/line is manually pinned, the remaining unlocked lines absorb the adjustment proportionally, and clipping (a line hitting zero) reallocates further. This maps directly onto "cap the sofa's markup, let the rug/lighting/hardware lines absorb the difference to hit target margin," which is exactly the blend the practitioners describe doing by hand in a spreadsheet.
- **Live-linked markup/margin fields, contractor-side.** JobTread's budgeting feature is described (search-summarized, jobtread.com) as letting "**Unit Price, Ext Price, Markup and Margin** update on the fly as you edit line items" — i.e., **margin**, not just markup, is a first-class, editable, recalculating field alongside price. None of the eight furniture-industry products researched document a margin (as opposed to markup) input field at all; every one found uses markup-percentage-in / client-price-out as its primitive. A margin-denominated field (target margin in, price out) is a more natural fit for a "hold 40% blended" workflow than markup-denominated fields are, since margin composes additively across a project total in a way markup percentages don't.
- **Multi-method pricing selection (Design Manager).** The three parallel pricing methods documented for Design Manager — markup-on-cost, discount-off-list, and flat purchasing fee — is a pattern worth borrowing on its own: a studio might want a hero sofa priced by "discount off MSRP" (respecting MAP automatically, since MSRP-minus-a-discount can't exceed MSRP) while accessories are priced by markup-on-cost. No other product documents supporting more than one pricing *method* per catalog.
- **Tiered client-visibility as blend cover (Materio, Gather).** Materio's four-tier visibility ladder and Gather's three-checkbox model are, in effect, the only "blend-enabling" features found — not because they compute a blend, but because a **category-total or lump-sum-only client view structurally prevents the client from noticing that individual lines carry different margins.** A genuine blend tool in Patina could combine this (client sees the honest room/category total) with the Phocas-style spread mechanic (the designer sets the room's target and the tool proposes a per-line split respecting caps like "sofa markup ≤ 35%").
- **Curate's category-level markup rules** (help.curate.co, a furniture-ordering/AP platform not in the required list but directly on-topic): "**Advanced Category Rules**" let a user "add a specific markup amount for any category available in your account," on top of a project-level "**Markup profile**" dropdown and a further per-item override inside the item panel — a clean three-tier (catalog default → category rule → item override) hierarchy, the most explicit **category-based** override structure found in this research, and a plausible middle layer between "one global markup" and "manually blending line by line."

---

## Comparison table — products × capabilities

| Capability | Studio Designer | Design Manager | Houzz Pro (Ivy) | Mydoma | DesignFiles | Programa | Gather | Materio | Foyr/Spacely |
|---|---|---|---|---|---|---|---|---|---|
| Global/studio-level default markup | yes | yes | not confirmed | not confirmed | not confirmed | not confirmed | not confirmed | not confirmed | not confirmed |
| Per-vendor / per-category markup override | yes | yes | not confirmed | partial (3rd-party service markup only) | not confirmed | not confirmed | not confirmed | not confirmed | not confirmed |
| Per-item markup override | yes | partial (implied by override hierarchy) | yes (line-item calculator) | partial (tracked per product) | yes | not confirmed | not confirmed | not confirmed | not confirmed |
| Client price editable directly (not just via markup %) | not confirmed | not confirmed | yes | partial ("Price" field distinct from "Cost") | yes | not confirmed | not confirmed | not confirmed | not confirmed |
| Target-margin (not just markup) input | not confirmed | not confirmed | not confirmed | partial (P&L report, read-only) | not confirmed | not confirmed | not confirmed | partial ("profit... calculated for you") | not confirmed |
| Automatic rounding rule | not confirmed | not confirmed | not confirmed | not confirmed | not confirmed | not confirmed | not confirmed | not confirmed | not confirmed |
| Lock client price after approval | not confirmed | not confirmed | partial (approval gates selections portal) | not confirmed | no (markup re-appliable at Quote and Invoice stages) | not confirmed | not confirmed | not confirmed | not confirmed |
| Tiered / toggleable client cost visibility | partial ("Show Selling Markup" on/off) | not confirmed | yes ("Show detailed pricing", "Markup" columns) | not confirmed | not confirmed | not confirmed | yes (3-checkbox model) | yes (4-tier ladder) | not confirmed |
| Named allowance/TBD-in-totals feature | not confirmed | not confirmed | partial (post-approval "allowance"/selections portal) | not confirmed | not confirmed | not confirmed | not confirmed | yes ("Selection Allowances") | not confirmed |
| Blend/spread/allocate margin across project (explicit feature) | no | no | no | no | no | no | no | no | no |

*"partial" = documented behavior that approximates but does not fully satisfy the capability; "not confirmed" = no evidence found in reachable sources, not a claim the feature is absent.*

---

## Sources

- [Interior Design Profit Margin: Why Markup Math Misleads — Interior Design Community](https://interiordesigncommunity.com/interior-design-profit-margin/)
- [Why Interior Designers Lose Money on Furniture Procurement — Coco to the Trade](https://cocotothetrade.com/why-interior-designers-lose-money-on-furniture-orders/)
- [Do Interior Designers Have to Disclose Markups? — Design Ink Co](https://www.designinkco.com/blog/interior-design-markup-disclosure)
- [Freight Markup For Interior Designers: Are You Leaving Money On The Table? — Interior Design Community](https://interiordesigncommunity.com/freight-markup-interior-designers/)
- [Design Fee Plus Markup: Why Charging Both Is Standard Practice — Interior Design Community](https://interiordesigncommunity.com/markup-design-fee/)
- [What NOT To Send To A Receiver — Interior Design Community](https://interiordesigncommunity.com/what-not-send-receiver/)
- [Client Approval Documentation: Protecting Your Design Firm From Disputes — Interior Design Community](https://interiordesigncommunity.com/client-approval-documentation/)
- [Trade Discount Programs for Interior Designers (2026 Guide) — Procurist](https://procurist.io/blog/trade-discount-programs-designers)
- [How (and Why) to Markup Products as an Interior Designer — DesignFiles Blog](https://blog.designfiles.co/how-should-i-markup-products/)
- [The Interior Design Approval Process, Start to Finish — DesignFiles Blog](https://blog.designfiles.co/interior-design-approvals/)
- [Add Markups and Adjust Pricing — DesignFiles Help Center](https://intercom.help/designfiles/en/articles/3604424-add-markups-and-adjust-pricing)
- [How Defaults Work in Studio Designer — Studio Designer Help Center](https://help.studiodesigner.com/s/article/How-Defaults-Work-in-Studio-Designer)
- [Choosing the Best Interior Design Software (Studio Designer vs Mydoma, Design Manager, Programa, DesignFiles, Houzz Pro) — Studio Designer Blog](https://www.studiodesigner.com/blog/the-best-interior-design-software/)
- [DM Tips: New Pricing Feature - Vendor Markup Percentages — Design Manager Blog](https://blog.designmanager.com/vendor-markups)
- [Did You Know: Design Manager Gives You Fee Structure Freedom — Design Manager Blog](https://www.designmanager.com/blog/did-you-know-design-manager-gives-you-fee-structure-freedom)
- [How to Use the Markup Calculator in Houzz Pro](https://pro.houzz.com/for-pros/how-to-use-the-markup-calculator-for-proposals-estimates)
- [How to Move Processing Fees to Your Markup — Houzz Pro](https://pro.houzz.com/pro-help/r/how-to-move-processing-fees-to-your-markup)
- [Ivy Interior Design Software: Now a Part of Houzz Pro](https://pro.houzz.com/for-pros/ivy)
- [The Difference Between Ivy and Houzz Pro](https://pro.houzz.com/for-pros/difference-between-ivy-and-houzz-pro)
- [Designer Pricing Sheet — Mydoma Help Center](https://help.mydomastudio.com/en/articles/3940389-designer-pricing-sheet)
- [From Product Clipper to Proposal, RFQ, Invoice, and PO — Mydoma Help Center](https://help.mydomastudio.com/en/articles/4968115-from-product-clipper-to-proposal-rfq-invoice-and-po)
- [Design Approval Software for Interior Designers — Programa](https://programa.design/features/interior-design-approvals)
- [Pricing: Client View — Gather Help Center](http://help.gatherit.co/en/articles/961389-pricing-client-view)
- [Level of pricing detail a client sees — Materio Help Center](https://intercom.help/materio/en/articles/8261262-level-of-pricing-detail-a-client-sees)
- [How Materio Works — Materio](https://www.materio.co/how-it-works)
- [Applying Markups: Unlock Your Profit Potential — Curate Help Center](https://help.curate.co/en/articles/6830545-applying-markups-unlock-your-profit-potential)
- [Spread totals — Phocas Software User Documentation](https://docs.phocassoftware.com/budgets-and-forecasts/contributor/edit-values-in-a-worksheet/spread-totals)
- [Pricing a Job: Markup vs. Margin — JobTread Webinar](https://www.jobtread.com/webinars/pricing-a-job-markup-vs-margin)
- [Markup Versus Profit Margin: What Contractors Need to Know — JobTread Blog](https://www.jobtread.com/blog/markup-versus-profit-margin)
- [Psychological pricing — Wikipedia](https://en.wikipedia.org/wiki/Psychological_pricing)
- [The Psychology of Pricing Your Interior Design Services — Interior Designers Hub](https://www.interiordesignershub.co.uk/blog/the-psychology-of-pricing-your-interior-design-services/)
- [Interior Design Markup Strategies: Maximize Furniture Profits — Jadeant](https://jadeant.com/interior-design-furniture-markup-strategies/) *(search-summarized only, not independently fetched — treat quoted figures as inferred)*
- [Average Wholesale Markup for Interior Designer: What You Need to Know — Sagebrook Home](https://sagebrookhome.com/blogs/average-wholesale-markup-for-interior-designer-what-you-need-to-know/) *(search-summarized only)*
- Note: Foyr Neo and Spacely AI product/pricing pages (capterra.com, saasworthy.com listings) were reviewed via search only; no markup/margin feature documentation was found for either, and this is reported as "not confirmed," not "confirmed absent."
- Note: A direct WebFetch of `blog.designmanager.com/vendor-markups` and `help.studiodesigner.com/s/article/How-Defaults-Work-in-Studio-Designer` returned TLS/certificate errors on retry; the content above for those two pages is drawn from the WebSearch tool's summarized excerpts of the same URLs, not a raw page fetch — flagged per source above.
