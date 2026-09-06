# Research lane 02 — Design-build / turnkey contract class

Seed: `00-raw/c-industry-brief.md` §2 (design-build/turnkey studio contracting) and `00-raw/00-brief.md` (turnkey is a full contract class with its own rulings). This lane expands the class definition with sourced detail. Every claim below carries its source URL; unsourced items are marked "not confirmed."

## 1. Contract structures for a studio holding subs

A studio holding trades under its own umbrella can organize the client relationship five ways. AIA's design-build family (A141 owner/design-builder, A142 design-builder/contractor, B143 design-builder/architect) is built for the single-prime case, while A101/A102/A104 and B101 serve the split and owner-held-GC cases ([AIA A-series overview](https://learn.aiacontracts.com/contract-doc-pages/71126-a-series-ownercontractor-agreements/); [AIA design-build family](https://learn.aiacontracts.com/design-build-family/); [full AIA document list](https://learn.aiacontracts.com/articles/list-of-all-current-aia-contract-documents/)). DBIA and ConsensusDocs publish parallel design-build forms ([DBIA 525 lump sum](https://store.dbia.org/wp-content/uploads/2024/03/525-Agreement-between-Owner-and-Design-Builder-Lump-Sum-Sample.pdf); [ConsensusDocs 400-series comparison](https://www.consensusdocs.org/wp-content/uploads/2020/05/Design-Build-Standard-Contract-Comparison-Chart-May-21-2017-1.pdf)). CM-at-risk and CM-agency sit at the two ends of a separate spectrum — at-risk holds trade contracts and guarantees cost/schedule like a GC; agency never holds trade contracts and leaves all cost/schedule risk with the owner ([Bricker & Eckler](https://www.bricker.com/insights/publications/A-comparison-of-general-contracting-construction-manager-at-risk-and-construction-manager-as-agent); [DesignTek Consulting](https://www.designtekconsulting.com/post/construction-management-understanding-agency-vs-at-risk)).

| Structure | Client pays | Who holds sub contracts | Construction risk | Licensing exposure | Typical fee expression | Reference form |
|---|---|---|---|---|---|---|
| Single prime (design+build, one firm) | The studio, one contract | The studio | Studio carries full cost/schedule risk | Studio must hold the contractor license itself | Lump sum, cost-plus, or cost-plus-GMP | AIA A141 (owner/design-builder) + A142 (design-builder/contractor) ([AIA design-build family](https://learn.aiacontracts.com/design-build-family/)); DBIA 525 lump sum ([DBIA store](https://store.dbia.org/wp-content/uploads/2024/03/525-Agreement-between-Owner-and-Design-Builder-Lump-Sum-Sample.pdf)); ConsensusDocs 400 series ([comparison chart](https://www.consensusdocs.org/wp-content/uploads/2020/05/Design-Build-Standard-Contract-Comparison-Chart-May-21-2017-1.pdf)) |
| Split — design agreement + construction agreement, same firm | The studio, usually two line items or two documents | The studio's construction side | Studio carries construction risk under the construction agreement only; design liability is separately capped under the design agreement | Studio's construction entity must hold the contractor license | Design: hourly/fixed/% of cost. Construction: cost-plus-GMP or stipulated sum | AIA B101 (owner/architect) paired with A102 (cost-plus-GMP) or A101 (stipulated sum) ([B101/A-series list](https://learn.aiacontracts.com/articles/list-of-all-current-aia-contract-documents/)) |
| Design agreement + owner-held GC (studio coordinates only) | Client pays the GC directly; pays the studio a separate design/coordination fee | The GC | GC carries all construction risk; studio carries none | Studio needs no contractor license — it never contracts with or directs subs as a principal | Design/coordination: hourly or fixed fee | AIA B101 (architect) as a wholly separate agreement from the owner's A101/A102 with the GC ([AIA B-series](https://learn.aiacontracts.com/articles/list-of-all-current-aia-contract-documents/)) |
| CM at-risk | The studio (acting as CM) | The studio, once GMP is set | Studio guarantees cost and schedule like a GC | Studio needs a contractor license | Cost-plus-GMP is the norm | AIA A102 pattern adapted to a CM role ([Bricker & Eckler](https://www.bricker.com/insights/publications/A-comparison-of-general-contracting-construction-manager-at-risk-and-construction-manager-as-agent)) |
| CM agency | Owner pays each trade contract directly; pays the studio a CM fee | The owner | Owner carries all cost/schedule risk; studio carries none | Studio does not need a contractor license in this role | Fixed or hourly CM fee | No AIA analog in the design-build family; owner holds A101/A102 with each trade directly ([DesignTek Consulting](https://www.designtekconsulting.com/post/construction-management-understanding-agency-vs-at-risk)) |

## 2. Pricing basis

| Basis | Inputs required | How client price is derived | Typical range |
|---|---|---|---|
| Fixed / lump sum | Complete scope, drawings, specs priced to a single number | Contractor bids the whole scope; client pays that number regardless of actual cost | N/A — margin is built into the number, not disclosed ([Procore](https://www.procore.com/library/cost-plus-contracts)) |
| Cost-plus, % fee | Actual verified cost of labor, materials, subs, general conditions | Client pays actual cost plus an agreed percentage | Fee commonly 5–25%, ~20% common ([projul.com](https://projul.com/blog/construction-cost-plus-vs-fixed-price-contracts-guide/); [Procore](https://www.procore.com/library/cost-plus-contracts)) |
| Cost-plus, fixed fee | Same as above, but fee is a flat dollar amount set at signing | Client pays actual cost plus the flat fee regardless of final cost total | Not confirmed — no standard range found; fixed-fee removes the contractor's incentive to inflate cost, per general cost-plus discussion ([getbuilt.com](https://getbuilt.com/blog/understanding-the-4-common-construction-contracts/)) |
| Cost-plus with GMP | Same as cost-plus plus a cap the contractor guarantees not to exceed | Client pays actual cost + fee up to the GMP; contractor absorbs overruns beyond it; savings below GMP typically split, commonly 50/50 | GMP contracts typically carry a contingency line and open-book accounting ([DocumentCrunch](https://www.documentcrunch.com/blog/gmp-construction-contract); [Rabbet](https://rabbet.com/blog/cost-plus-vs-gmp-construction-contracts); 50/50 split norm per [United Rentals](https://www.unitedrentals.com/project-uptime/expertise/how-shared-savings-clause-can-help-cut-costs)) |
| Time-and-materials with NTE | Hourly labor rates, material markup rate, a not-to-exceed ceiling | Client pays actual hours × rate + marked-up materials, capped at the NTE | Same fee logic as cost-plus; NTE functions like a soft GMP ([getbuilt.com](https://getbuilt.com/blog/understanding-the-4-common-construction-contracts/)) |
| Unit price | Priced per unit of measure (per linear foot, per fixture, per sq ft) | Client pays quantity actually installed × unit price | Not confirmed — no residential-remodel-specific range found; standard on infrastructure/civil work |

## 3. Money mechanics

| Mechanic | Definition | Typical value | Source |
|---|---|---|---|
| Allowance | A placeholder dollar figure for a scope item not yet selected at signing (e.g. tile, fixtures) | Set per item; trued up against actual cost | [AIA allowance basics](https://learn.aiacontracts.com/articles/construction-allowance-contracting-basics/) |
| Allowance overage/underage | Overage = actual cost exceeds allowance; underage = actual cost is less | Overage runs through the same change-order approval as any other cost increase; underage is credited back | [Markup and Profit](https://www.markupandprofit.com/articles/allowances-in-your-pricing/); [BuildingAdvisor](https://buildingadvisor.com/project-management/contracts/red-flag-clauses/allowances-in-construction-contracts/) |
| Schedule of values (SOV) | The contract price broken into priced line items, used as the basis for progress billing | One line per major cost item/allowance | [getbuilt.com](https://getbuilt.com/blog/schedule-of-values-in-construction/) |
| Progress billing / draws | Payment tied to the SOV, billed either by percent-complete per line item or by fixed milestones | Milestone billing is common in turnkey/custom-build deals | [getbuilt.com](https://getbuilt.com/blog/progress-billing-in-construction/); [boomandbucket.com](https://www.boomandbucket.com/blog/turnkey-contracts) |
| Retainage | Percentage withheld from each progress payment until substantial completion | 5–10%, with a recent trend toward 5% for private work; released 30–60 days after substantial completion | [constructioncoverage.com 2026 survey](https://constructioncoverage.com/glossary/retainage) |
| Deposit on custom goods | Up-front payment to a maker/millworker to begin production | 50% is the most common structure for custom millwork/furniture; sometimes 50/40/10 across production/finish/delivery | [Lukes Furniture Company](https://www.lukesfurniturecompany.com/articles/blog/what-deposit-should-i-expect-to-pay-for-custom-furniture-and-is-that-normal); [Woodweb](https://woodweb.com/knowledge_base/Deposits_and_Payment.html) |
| Change order | A written scope/cost/schedule delta approved before the work proceeds | Should follow a defined form: description, price impact, schedule impact, signature | [Hollington Law Firm](https://hollingtonlawfirm.com/articles/how-to-draft-effective-change-orders-in-construction-contracts) |
| Contingency | A budget reserve for unknowns, separate from allowances | 5–7% for simple, well-scoped remodels; 10–15%+ for older homes or incomplete drawings | [Buildertrend](https://buildertrend.com/blog/construction-contingency/); [Projul](https://projul.com/blog/construction-contingency-budget-guide/) |
| Supervision/PM fee vs. markup on subs | Two different mechanisms for compensating the studio's oversight of trades | Supervisory labor should be billed as direct labor, folded into overhead, or covered by the sub markup — never more than one at once (the no-double-count rule); sub markup itself runs ~15–20%, sometimes to 25% | [buildingadvisor.com](https://buildingadvisor.com/cost-plus-how-much-markup/); [Angi](https://www.angi.com/articles/general-contractor-markup.htm) |
| Reimbursables | Pass-through costs (travel, printing, shipping) billed at cost | Not confirmed — no standard markup percentage found in this research pass | — |
| Permit fees | Municipal fee to pull a permit | Paid at cost; whoever pulls the permit (ideally the licensed party doing the work, not the homeowner) carries the code-compliance liability that comes with it | [Angi](https://www.angi.com/articles/who-pays-building-permits.htm); [Waldron Designs](https://waldrondesigns.com/conversation/permitting-who-is-responsible) |
| Sales tax on labor vs. materials | Varies by state | Wisconsin: neither labor nor materials is taxed to the customer on a real-property improvement; the contractor instead pays sales/use tax on materials at purchase ([Wegner CPAs](https://www.wegnercpas.com/sales-and-use-tax-basics-for-construction-contractors-in-wi/)). California: labor is never taxable; whether materials are taxed to the client depends on contract type — lump-sum and plain time-and-materials contracts treat the contractor as the consumer (tax paid at purchase, not charged to client), while a "time-and-materials-plus-tax" contract that itemizes marked-up material billing makes the contractor a retailer who must charge tax on that marked-up amount ([LegalClarity](https://legalclarity.org/do-contractors-charge-sales-tax-on-labor-in-california/)) | — |

## 4. Sub pass-through to the client

| Mechanism | Open-book | Closed-book / lump-sum | Source |
|---|---|---|---|
| How sub cost appears | Client sees actual sub invoices/timesheets; transparency norms flow the same obligation down to subs, who share their own supplier invoices | Subs' cost is bundled into a single trade-scope lump sum; client never sees the underlying invoice | [Zigaflow](https://www.zigaflow.com/resources/glossary/open-book-costing); [EB3 Construction](https://blog.eb3construction.com/construction/project-management/open-book-construction-management/) |
| Markup disclosure | Markup percentage stated in the contract and applied visibly on top of verified cost | Markup is embedded, undisclosed, inside the single price | [buildingadvisor.com](https://buildingadvisor.com/cost-plus-how-much-markup/) |
| Lien-waiver exchange per draw | Conditional waiver signed before the draw clears, unconditional waiver signed only after payment clears; progress waivers cover one billing period, final waivers extinguish all remaining lien rights | Same mechanics apply regardless of open/closed book — lien waivers track payment, not pricing method | [AIA Contract Documents](https://learn.aiacontracts.com/articles/types-of-lien-waivers/); [TrueBeam](https://www.trybeam.com/resources/conditional-vs-unconditional-lien-waivers) |
| Insurance certificates from subs | Sub furnishes a COI plus an additional-insured endorsement naming the studio, before mobilizing, in both models | Same in both models | [Docutrax](https://www.docutrax.com/resources/guides/subcontractor-insurance-requirements); sample exhibit language ([Proctor Construction](https://www.proctorcc.com/wp-content/uploads/2023/07/proctor-construction-llc-subcontract-exhibit-d-insurance-requirements.pdf)) |
| Warranty of sub work | Sub warranties its own work to the studio; the studio (as single point of contract) warranties the whole job to the homeowner | Same structure in both models | [Veritas Claims](https://www.veritasclaims.com/blog/contractor-sub-contractor-and-additional-insured-certificates) — general indemnification/warranty pattern; whether Patina studios currently document this pass-through is not confirmed |

## 5. Licensing gate

Most states treat a party who hires and directs trades and holds the client contract as a de facto general contractor, triggering contractor-license rules regardless of the party's design credentials ([North Star Law](https://northstarlaw.com/interior-designers-need-to-be-licensed-contractors/); [Waldron Designs](https://waldrondesigns.com/conversation/interior-designer-does-not-equal-general-contractor)).

| State | Rule | Threshold / exception | Source |
|---|---|---|---|
| Wisconsin | No single "GC" license; a party contracting to build/remodel a one- or two-family dwelling must hold Dwelling Contractor (DC) credential and have a Dwelling Contractor Qualifier (DCQ) associated with the entity | DCQ requires a 12-hour DSPS-approved course (no exam); every DC entity must have at least one DCQ; no de-minimis dollar exemption confirmed in this pass | [DSPS DCQ](https://dsps.wi.gov/Pages/Professions/DwellingContractorQualifier/Default.aspx); [Adapt Digital Solutions](https://adaptdigitalsolutions.com/articles/wisconsin-contractor-license-requirements/); [The Contractor Matrix](https://www.thecontractormatrix.com/contractor-license-requirements/wisconsin) |
| Illinois | No statewide contractor license; the Home Repair and Remodeling Act mandates a written contract (not a license) once a job exceeds $1,000; municipalities (e.g. Chicago) layer their own licensing | $1,000 triggers the written-contract mandate, not a licensing requirement | [Illinois AG consumer pamphlet](https://illinoisattorneygeneral.gov/Page-Attachments/Home%20Repair_KnowYourRights.pdf); [Contractor Requirements](https://contractorrequirements.com/remodeler/illinois/) |
| Minnesota | Residential Building Contractor/Remodeler license required once contracting directly with a homeowner and offering more than one special skill | Exempt if gross annual receipts from residential contracting are under $15,000 and the contractor holds a Certificate of Exemption | [MN DLI](https://www.dli.mn.gov/node/3716); [SimplyWise](https://www.simplywise.com/blog/minnesota-contractor-license/); [Minn. Stat. 326B.805](https://www.revisor.mn.gov/statutes/2024/2024-11-01%2019:09:58+00:00/cite/326B.805/pdf) |
| California | Contractor's license required once a single project (labor + materials) exceeds $1,000 | Raised from $500 to $1,000 effective Jan 1 2025 (AB 2622); exemption only holds if no workers are hired and no permit is needed | [Contractors License Guru](https://www.contractorslicenseguru.com/cslb-license-threshold-change/); [FOX40](https://fox40.com/news/california-connection/california-unlicensed-contractors-new-dollar-limit/) |
| New York | No statewide home-improvement-contractor license; licensing is local — NYC, Nassau, Suffolk, Westchester, Putnam, Rockland, and Buffalo all require registration/licensing for anyone contracting directly with a homeowner | Threshold and rules vary by jurisdiction; a party without the local license may be unable to enforce the contract or collect payment | [Law Offices of John Caravella](https://www.liconstructionlaw.com/construction/licensing-requirements-for-home-improvement-contractors-subcontractors-in-new-york-state/); [Adapt Digital Solutions](https://adaptdigitalsolutions.com/articles/new-york-contractor-license-requirements/) |

Handyman/threshold exemptions cluster around a small-job dollar cap (CA $1,000) or a gross-receipts floor (MN $15,000/yr); Illinois's $1,000 figure gates a contract-form mandate, not a license. No Wisconsin de-minimis exemption was found in this pass — treat as "not confirmed" rather than "none exists."

## 6. Consumer-protection attachments

| State | Cancellation trigger | Timing | Separate page? | Mandated contract contents | Source |
|---|---|---|---|---|---|
| Wisconsin (ATCP 110) | Contract signed away from the seller's regular place of business | 3 business days; clock doesn't start until proper notice is given; refund within 10 days | A distinct completed "Notice of Cancellation" form is required; whether it must be a physically separate page is not confirmed | Written contract required whenever any payment is due before completion; must state any warranty/guarantee and any insurance terms; seller must give buyer a signed copy before starting work or taking payment | [DATCP consumer tips](https://datcp.wi.gov/Documents/HI-ConsumerTips136.pdf); [ATCP 110.05](https://regulations.justia.com/states/wisconsin/atcp/atcp-90-139/chapter-atcp-110/section-atcp-110-05) |
| Illinois | Home-repair contract signed off-premises, or an insurance-claim-linked repair | 3-day cooling-off | Not confirmed | Home Repair and Remodeling Act requires a written contract over $1,000 and delivery of the "Know Your Consumer Rights" pamphlet | [Illinois AG](https://illinoisattorneygeneral.gov/Page-Attachments/Home%20Repair_KnowYourRights.pdf) |
| Minnesota | Contract is a "home solicitation sale" (generally, signed away from the seller's regular place of business) | Until midnight of the 3rd business day after the sale; the right extends indefinitely if the seller never gives proper notice | Two copies of a completed "Notice of Cancellation" form required, plus an oral explanation and a receipt | Receipt/contract must show transaction date, seller name/address, and the cancellation statement | [MN AG cooling-off guide](https://www.ag.state.mn.us/consumer/publications/CoolingOffPeriod.asp); [Minn. Stat. 325G.07](https://www.revisor.mn.gov/statutes/cite/325g.07) |
| California | Contract signed away from the contractor's place of business | 3 days (5 for seniors); refund within 10 days | Not confirmed from this pass | BPC §7159: contractor name/address/license number; "Home Improvement" heading in ≥10pt bold; a ≥12pt bold notice that the buyer is entitled to a fully filled-in signed copy before work starts; start/completion dates; scope; materials; payment schedule; total price | [CSLB](https://www.cslb.ca.gov/Consumers/Hire_A_Contractor/Home_Improvement_Contracts/Warnings_And_Exceptions.aspx); [BPC §7159](https://law.justia.com/codes/california/code-bpc/division-3/chapter-9/article-10/section-7159/) |
| New York (incl. NYC) | Home-improvement contract | 3 business days; refund within 10 business days | Uses a dedicated Notice of Cancellation form | Standard HIC contract-content rules per local code | [NYC DCA form](https://www.nyc.gov/assets/dca/downloads/pdf/businesses/Home-Improvement-Contract-and-Notice-of-Cancellation.pdf) |
| Massachusetts (142A) | Contract signed off-premises | 3 days | Yes — a separate-page cancellation notice is required alongside a mandated contract-terms checklist | Mandated checklist of required contract terms | [Mass.gov](https://www.mass.gov/info-details/required-contract-terms-in-a-home-improvement-contract) (per seed brief §5; page returned 403 on direct re-fetch this pass, so treat the content summary as carried over from the seed, not independently re-verified) |

## 7. How the trades see it — subcontract essentials

| Element | What it covers | Source |
|---|---|---|
| Flow-down | Subcontractor is bound by the same prime-contract terms the studio holds toward the client, to the extent applicable to the sub's scope | [AIA subcontractor contracts guide](https://learn.aiacontracts.com/guides/subcontractor-contracts-guide/) |
| Scope | Incorporates the drawings/specs for the sub's trade only | [AIA A401](https://designbuildlaw.com/aia-contracts/a401-2017/) |
| Price | Lump sum or unit price, mapped to a line (or lines) on the schedule of values | [getbuilt.com SOV](https://getbuilt.com/blog/schedule-of-values-in-construction/) |
| Schedule | Start date, duration, sequencing dependencies | [AIA A401](https://aiacontracts.com/documents/a401-contractor-subcontractor-agreement) |
| Retainage | Percentage withheld from the sub's progress payments, ideally reduced as rapidly as the work justifies | [Levelset — A401 progress payments](https://www.levelset.com/blog/deep-dive-aia-a401-progress-payment-clauses/) |
| Payment-when-paid | Under AIA A401, the studio must pay the sub within 7 days of receiving payment from the client | [ConstructionCostAccounting.com](https://www.constructioncostaccounting.com/post/managing-subcontractor-payment-obligations-under-aia-contracts) |
| Insurance | Sub furnishes a COI with an additional-insured endorsement naming the studio before starting work; must notify the studio of any lapse, which can trigger a work stoppage until coverage is replaced | [AIA — improving the sub payment process](https://learn.aiacontracts.com/articles/improving-the-subcontractor-payment-process/) |
| Lien waivers | Sub signs a conditional waiver before each draw clears and an unconditional waiver after | [AIA lien waiver types](https://learn.aiacontracts.com/articles/types-of-lien-waivers/) |

This table is the checklist against which Patina's existing trade-scope instrument should be diffed: any of these eight elements missing from the current lump-sum/draw-schedule/studio-only bid ledger is a gap to close before it can stand in as a real subcontract, not just an internal bid record.

## 8. Worked example — kitchen + mudroom remodel

**Assumptions** (stated, not sourced — this is arithmetic on the numbers given): cost-plus-with-GMP at an 18% fee on the Cost of the Work; 5% retainage applied to the three work-in-place draws (rough-in, cabinets set, substantial completion) but not to the signing deposit, which funds custom-millwork material procurement rather than installed labor; the $11,000 design fee is billed under the separate design-services agreement and is outside the GMP and outside retainage.

**Schedule of values (Cost of the Work)**

| Line | Amount |
|---|---|
| Cabinetry/millwork (sub) | $38,000.00 |
| Electrical (sub) | $9,500.00 |
| Plumbing (sub) | $7,200.00 |
| General conditions / site | $6,300.00 |
| Allowance — tile | $4,000.00 |
| Allowance — plumbing fixtures | $3,500.00 |
| Allowance — lighting | $2,800.00 |
| **Cost of the Work** | **$71,300.00** |
| Contractor fee (18% of Cost of the Work) | $12,834.00 |
| **GMP (construction contract sum)** | **$84,134.00** |
| Design fee (separate agreement, outside GMP) | $11,000.00 |
| **Total project cost to client** | **$95,134.00** |

**Draw schedule** (percentages of the $84,134.00 GMP; design fee billed separately on its own schedule)

| Draw | % of GMP | Gross amount | Retainage held (5%) | Net paid |
|---|---|---|---|---|
| 1 — Deposit at signing | 10% | $8,413.40 | $0.00 (deposit, not subject to retainage) | $8,413.40 |
| 2 — Rough-in | 30% | $25,240.20 | $1,262.01 | $23,978.19 |
| 3 — Cabinets set | 40% | $33,653.60 | $1,682.68 | $31,970.92 |
| 4 — Substantial completion | 20% | $16,826.80 | $841.34 | $15,985.46 |
| 5 — Final (retainage release) | — | — | — | $3,786.03 |
| **Total** | **100%** | **$84,134.00** | **$3,786.03** | **$84,134.00** |

Retainage held = 5% × (30% + 40% + 20%) × $84,134.00 = 5% × $75,720.60 = $3,786.03, released whole at final. The four net progress payments plus the final retainage release sum exactly to the $84,134.00 GMP; the $11,000 design fee is additive on top for a total client outlay of $95,134.00.

## 9. Design implications for a composable turnkey contract class

1. Turnkey is a fifth contract class alongside the existing design-services agreement and trade-scope instrument — not a variant of either.
2. Mandatory for any turnkey contract: a pricing-basis selection (fixed/cost-plus/cost-plus-GMP/T&M-NTE/unit), a schedule of values, a draw schedule, and a retainage term.
3. Mandatory: a licensing attestation gate before the studio can present itself as the single prime, CM-at-risk, or the split-firm construction entity — the studio must affirm it holds (or its construction entity holds) the applicable state/local contractor credential.
4. Optional, toggle-on: allowances, contingency line, GMP cap with savings split, deposits on custom goods.
5. Optional, structure-dependent: sub markup disclosure (open-book) vs. bundled lump sum (closed-book) — pick one per contract, not per line item.
6. The supervision-fee-vs-sub-markup no-double-count rule must be enforced at the template level, not left to drafting discretion.
7. Consumer-protection cancellation notices must be standalone attachments, generated per project jurisdiction, never buried inside contract body text.
8. Mandated-contents checklists (CA BPC §7159, MA 142A, WI ATCP 110) should be jurisdiction-triggered template requirements, not manual checklists a designer must remember.
9. Change orders and allowance overages/underages must be first-class linked documents that flow into the schedule of values, not free-text amendments.
10. Lien-waiver exchange (conditional/unconditional × progress/final) should be a tracked artifact per draw, tied to the sub pass-through table in §4.
11. The trade-scope instrument's subcontract essentials (§7) should be checked, item by item, against whatever the studio actually issues to a sub — gaps become required additions, not optional ones.
12. Every turnkey template must carry a persistent "not legal advice, consult counsel and confirm local licensing before first use" disclaimer — this is an industry-wide norm, not a Patina-specific caution.
