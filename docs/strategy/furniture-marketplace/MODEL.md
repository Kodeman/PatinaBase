# Financial model: maker utility and Patina operating scenarios

Research version 2, October 13, 2026. All Patina numeric inputs are **planning assumptions to test**, not observed performance, industry averages or approved pricing. USD unless explicitly stated. The authoritative scenario implementation is `model.cjs`; the deck embeds exactly that implementation. Independent research reports contain alternative illustrations and are not the adopted projection.

Reproduce:

```sh
node docs/strategy/furniture-marketplace/export-model.cjs
python3 docs/strategy/furniture-marketplace/build-deck.py
```

The first command exports `assumptions.json`, `projection-results.json`, and `projections.csv`. The second embeds sources, styling, fonts, and the model in `index.html`. No package installation is required. Changing model assumptions requires running both commands; slide narratives also need review when values change.

## Assumption ledger

Every value below appears in `assumptions.json`. No primary source establishes Patina conversion, activation, churn, quote savings or willingness to pay.

| ID | Definition | Downside / base / upside | Rationale and evidence needed |
|---|---|---|---|
| A01 | Monthly unique suitable maker contacts, Y1/Y2/Y3 | 30/45/60; 60/100/160; 100/180/300 | Sales capacity scenarios. Build a named deduplicated list. Base requires 3,840 unique businesses over three years; this is not a measured reachable market. Upside requires 6,960 and wider distribution. |
| A02 | Qualified → pilot → offer accepted → successfully activated | 20%/30%/35%/80%; 25%/40%/50%/90%; 30%/50%/60%/95% | Distinct stages. Paid billing begins on successful activation after two months, not verbal acceptance. Measure every refusal and failed pilot. |
| A03 | Monthly paying maker churn | 3%; 1.5%; 0.8% | Compound cohort retention, not a subtraction from annual end balance. Base annual retention is 83.4%. Obtain 90/180-day behavior before extrapolation. |
| A04 | Core subscription / setup | $299/month / $995, all scenarios | Written price experiment, not a validated offer. Shopify prices establish the low-cost substitute; they do not establish Patina willingness. Test $149 versus $299; do not assume conversion unchanged when repricing. |
| A05 | Patina onboarding / monthly maker service | 14/3h; 8/1.5h; 5/0.75h | Time logs must include mapping, rules, training and maintenance. Post-sale onboarding is separate from guided pilot labor. |
| A06 | Loaded delivery labor / hosting / billing allowance | $45/h / $12 per maker/month / 3% recognized revenue | $45 is a planning value. BLS May 2025 nontechnical wholesale/manufacturing sales median is $72,080/year; dividing by assumed 2,080 hours and applying assumed 30% burden gives approximately $45. This broad occupation is not quote-admin wage evidence. Three-percent platform billing is a cost allowance, not a universal Stripe tariff. Buyer merchandise processing is maker-paid and excluded from Patina revenue. |
| A07 | Maker contact cost / guided pilot hours | $35/4h; $28/3h; $22/2h | Contact cost includes account research, outreach and qualification labor. Pilot labor covers trial operation including failures. Do not allocate the same work again to fixed salaries or setup. |
| A08 | New active designer accounts/month, Y1/Y2/Y3; monthly churn | 4/6/8 and 5%; 8/14/22 and 3%; 15/30/50 and 2% | Additions begin month 3. These are activated project-producing accounts, not leads or registrations. No existing Patina audience is presumed. |
| A09 | Designer sourcing projects/month × category fit × project-to-order conversion × pieces | .30×.35×.35×1; .40×.50×.50×1.1; .55×.60×.60×1.2 | Demand opportunities have unique project IDs. Multiple quotes for one purchase are not multiple orders. Verify order completion separately. |
| A10 | Accepted-order capacity/maker/month; completion; fee eligibility | .3/.75/.60; .4/.85/.75; .6/.92/.90 | Portfolio matching cap, not production capacity promise. Fulfillment lag is 2 months. Fee eligibility is attribution, not proven causal incrementality. Validate available capacity, selection fit, cancellation and customer ownership. |
| A11 | Net merchandise / effective platform share | $4,000/order / 8% eligible value | AOV is a hypothesis, not an industry average or a retail-product-to-trade-price conversion. Merchandise excludes freight, tax and canceled/refunded value. V14 margin is carved from trade discount; the model share must be agreed within or replace the governing commercial economics, never silently stack. |
| A12 | Order service / reserve; designer costs; fixed core; initial build | 1h per accepted order + .5% fulfilled GMV; $100/new designer + .25h/month; fixed budgets below; $60,000 initial build | Failed orders retain accepted-order coordination cost. Reserve is a planning allowance. Fixed costs exclude separately modeled delivery and selling labor. Flexible delivery capacity is assumed available. The initial build is conditional on staged gates, not an unconditional spending recommendation. |
| A13 | Seller-value case | 30 quotes/month; 30 minutes saved; $45/h; 50% realized expense reduction; .18 fee-eligible orders × 60% causal incrementality; 30% incremental contribution; 1.5h upkeep; $995 setup + 8 maker hours spread over 12 months | Each input needs records. Marketplace expectation roughly reconciles to base month-36 eligible fulfilled orders/maker × a separate assumed 60% causal incrementality. The incremental margin is not taken from reported gross margins. Freed owner time is capacity; cash realization requires reduced paid cost. |

Fixed core monthly budgets by year: downside/base $20k/$25k/$35k; upside $25k/$35k/$50k. They represent incremental product, engineering, core leadership and shared overhead. Separately modeled contractor delivery, account research/outreach and pilot work are excluded from that budget. Existing company costs or revenues are not included. At 110 productive hours per delivery-role month, the model implies approximately 3.9 delivery equivalents in base month 36 and 9.2 upside; flexibility and cost need validation.

## Monthly cohort mechanics

1. Contact qualifying accounts. Expected guided pilots are `contacts × qualification × pilot rate`.
2. Offer acceptances are `pilots × paid rate`. After a two-month lag, a fraction successfully activates. Only activations bill subscription/setup.
3. Retain the preceding maker balance with monthly churn, then add activations. Each activation is billed a full month; this is a simplifying convention.
4. Separately retain/add active designer accounts, beginning month 3. Designer acquisition and ongoing service are separately costed.
5. Expected accepted demand is `active designers × sourcing-project frequency × category fit × project conversion × pieces`.
6. Cap accepted orders by `active makers × seller order capacity`. Matching begins month 7.
7. Keep accepted orders in a two-month fulfillment queue; completed orders are queued acceptances × completion rate. Account churn does not erase an already accepted pending order. Cancellation/noncompletion is modeled through the completion factor.
8. Fulfilled merchandise is completed orders × AOV. Eligible merchandise is fulfilled value × attribution eligibility. Fee revenue is eligible value × effective share.
9. Software and setup collect in their recognized month; fee invoices collect one month after fulfillment. The model assumes full collection on that schedule. Any paid-pilot advance credited to setup is conservatively not collected before activation in this projection.
10. Deduct variable maker service/tools, successful onboarding, designer service, accepted-order coordination, reserve and three-percent billing allowance. Acquisition includes all contacted accounts and guided pilots. Fixed costs pay monthly. Initial build pays at month zero.

Expected counts are fractional; actual cohorts are integer and noisier. No expansion, price increases, seasonality or cohort-specific maturation in project use is presumed.

## Cash versus revenue

The projection does not book GMV as Patina revenue and does not hold buyer deposits. Maker-held merchandise payments fund production under the proposed software-first operating role. Collections consist of subscription, setup and platform fee invoices only.

`operating result = recognized revenue − variable delivery costs − maker acquisition − designer acquisition − fixed core costs`

`cash movement = operating result − recognized transaction fees + collected transaction fees`

`cumulative cash[t] = −initial build + cumulative monthly cash movement`

Peak deficit is the most negative cumulative balance. It is a **conditional planning cash schedule**, not an audited cash forecast: all invoices collect, costs pay in their month, and tax, capex, bad debt, financing, inventory, deposit liabilities and management contingency are excluded. The billing-cost allowance is conservatively paid in the recognition month. Fees still due and orders still in queues at month 36 are not accelerated into the horizon.

Sustained monthly break-even is the first month from which every remaining modeled month has nonnegative operating result. Cumulative cash recovery is the first month cumulative cash including build and collection lag becomes nonnegative. Neither is inferred from ending MRR.

## Seller-value formula

`capacity value = monthly quote count × minutes removed / 60 × labor value`

`realized expense removal = capacity value × documented cost-realization share`

`net order value = eligible fulfilled orders × merchandise value × (causal incrementality × incremental contribution margin − effective fee)`

`first-year monthly burden = subscription + (setup fee + maker setup hours × labor value) / 12 + upkeep hours × labor value`

`customer value surplus = realized expense removal + net order value − first-year monthly burden`

Default outputs, before rounding: $675 capacity value; $337.50 realized expense removal; $72 net order value; $479.4167 monthly burden; **−$69.9167 monthly surplus**. Cost realization at zero makes labor-only cash break-even impossible. If causal incrementality × contribution margin is ≤ fee, additional eligible orders do not add positive contribution. Fees are paid on all attributed eligible orders, including orders that would have happened anyway; contribution accrues only to causally incremental orders. The tool reports that condition explicitly.

Maker internal labor and upkeep are economic costs; therefore the surplus is not an audited seller cash statement. If the same freed labor enables extra production, do not monetize it again as cash savings. Production contribution must already deduct incremental production and fulfillment costs. Displaced existing work must be deducted from incremental orders. No speculative avoided-error benefit is included.

## Interpretation

The base projection does not reach operating break-even within 36 months and needs about $732k of peak modeled deficit if spending continues. It is a decision case, not a forecast to sell. The upside requires faster conversion, lower churn, cheaper delivery and more designer use simultaneously; it reaches sustained monthly operating break-even in month 16 and cumulative cash recovery in month 28. The downside mechanically continues fixed spending despite bad gates, illustrating the value of an early stop.

A $25k pilot cap precedes the projection's conditional $60k initial build. Rejecting a weak customer segment or narrowing the offer is a valid outcome. No primary source or analyst calculation replaces a paid pilot, actual time logs, seller order contribution, and renewal at the disclosed price.
