---
Status: Active
Owner: Kody
Last Updated: 2026-09-01
---

**Purpose.** Append-only log of every change to `VISION.md` and every open vision ruling. Never edit past entries; corrections get a new dated entry referencing the old one. Ruling ids are V-numbers; learnings from the market are L-numbers; re-cuts of the page are C-numbers. Same discipline as `docs/design/the-document/DECISIONS.md`.

---

# VISION-DECISIONS.md — the Patina vision log

## Settled — 2026-09-01 workshop (C1, VISION.md v0.1)

| ID | Decision | Source |
|----|----------|--------|
| C1 | VISION.md v0.1 cut from the five-question workshop. Supersedes `my-company.md` §"What we are" and §"Pricing", the Jan spine's "AI-powered / consumer-first / affiliate" framing, and the v4 one-pager's "designers never pay" line. | `workshops/2026-09-01-vision-workshop.md` |
| S1 | Three surfaces are ranked, not equal: The Document → iOS app (studio's front door) → marketplace (the till). The designer tool is the one surface kept if only one could be. | Kody, Q1 |
| S2 | The customer is a growing studio at the moment it adds its first hands while workload doubles. Leah's studio first. Homeowners are the studio's clients; makers are the studio's vendors. (Kody's phrase for the first homeowner cohort was "active Patina customers" — read as Middle West's current clients; confirm.) | Kody, Q2 |
| S3 | Two revenue streams: studio subscription (floor) + furniture margin (upside). First real dollar = margin on a furniture sale. Studios *do* pay for The Document. | Kody, Q3 |
| S4 | Service promise. Studio: "you won't notice Patina." Homeowner: "engaged daily, one agreed direction." Never optimize the studio surface for engagement. | Kody, Q4 |
| S5 | Differentiators ranked for 12 months: Document · Pledge · makers · capture · Engine. Customer-visible refusal: no lock-in, no hidden fees, no unclear pricing. | Kody, Q5 |
| S6 | Patina remains a venture of Middle West Studio for now (see V4). | Kody, Q1 |

---

## Open — needs a ruling

### V1 · Margin pocket — 2026-09-01

**Question:** Patina's furniture margin — carved from the maker's trade discount (v4: 18% blended, "carved not stacked") or a slice of the studio's own 25% procurement markup?
**Why it matters:** Different parties pay. v4's whole maker argument ("defensible because it's carved") depends on the first answer; `my-company.md`'s $10K procurement line assumes the second.
**Blocks:** Any maker pricing conversation; the recruiting sheet's money line; Design Chicago maker pack.

### V2 · Studio price — 2026-09-01

**Question:** Keep Designer Pro $49 / Studio $149 (my-company.md), or a single studio tier? Is a solo tier coherent with the "first hires" trigger?
**Why it matters:** Sets the floor stream and the number on the recruiting sheet.
**Blocks:** Recruiting sheet money line; pricing page.

### V3 · Consumer cohort — 2026-09-01

**Question:** Pause the consumer Founding Circle (0/200, ten weeks at zero) until at least one studio beyond Leah's is live on The Document?
**Why it matters:** The marketing engine's lead cohort is one the vision says isn't the customer. Its three re-queued recommendations are all consumer-facing.
**Blocks:** Next marketing-engine run's cohort targets.

### V4 · Entity — 2026-09-01

**Question:** Stay a venture of Middle West Studio, or form a separate LLC before Design Chicago?
**Why it matters:** Co-founder equity, IP chain-of-title, trademark filings (Patina, Aesthete Engine, Strata Mark), Pledge contract counterparty, separate Cloudflare account.
**Blocks:** Trademarks; Pledge counsel review; any public "co-founder" byline.

### V5 · Thesis line — 2026-09-01

**Question:** "Where Time Adds Value" — canon or retire?
**Why it matters:** Lives in memory and pitch decks, not in any repo file. If canon, it belongs in VISION.md §1 and the brand doc; if not, it should stop appearing.
**Blocks:** Nothing. Cosmetic until Design Chicago copy.

### V6 · Pledge × subscription — 2026-09-01

**Question:** Studios pay a subscription (S3) *and* receive Pledge royalties. Different streams on paper — does "you pay us and we pay you" survive Leah's ear and counsel's review?
**Why it matters:** Shapes how the Pledge is described to designers; the workshop flagged it and v0.1 nearly stated it as settled.
**Blocks:** Any designer-facing Pledge copy (already legal-gated).

---

## Drift owed (documents now contradicted by C1)

| Doc | Contradiction | Fix |
|-----|---------------|-----|
| `Strata/.../my-company.md` (2026-06-23) | Three equal surfaces; $49/$149 + 15% + 25% numbers | Rewrite §"What we are" to point at VISION.md; strike pricing pending V1/V2 |
| `Patina-docs/CLAUDE.md`, `02-product/master-prd.md`, `01-vision/brand.md` | "AI-powered", consumer-first personas, affiliate revenue | Mark Superseded in status header; link VISION.md |
| `docs/design/the-document/leah-session-05-one-pager.md` + `Strata/.../Pricing-Strategy.md` | "no platform fee for designers on their own client relationships" | Add superseded note referencing S3 |
| `Patina/aesthete-engine-product-brief.md` (2026-07-01) | Engine framed as #1 differentiator | Add "long-term thesis, not the 12-month wedge (S5)" to its status header |
| `Patina/marketing-engine/PATINA-MARKETING-ENGINE-PLAN.md` | Consumer 200 / Designer 50 / Maker 15 with consumer lead | Re-order cohorts studio-first once V3 rules |

---

## Ruled — 2026-09-02 (First Flight, the iOS TestFlight round)

### V7 · The iOS app may use a tab bar — 2026-09-02

**Question:** VISION §6 refuses tab / zone / dashboard UI. The iOS app's shipped root under ruling **D1**
is a four-tab bar (Today · Spaces · Pieces · Studio, with the Companion in the bar's trailing slot).
Does §6's refusal bind surface #2, or only surface #1?

**Decision:** **The iOS app — surface #2, "the studio's front door" — may use a tab bar. The Document —
surface #1 — still may not.** The refusal is about the *studio's working surface*: a designer's document
is one continuous thing and splitting it into tabs is what makes competitors' tools feel like software.
The homeowner app is a different instrument with a different job — four fixed places a client returns to
daily — and the flag that mounts that root (`house-first`) is on for every round-one tester, so the
four-tab root is what ships, not a variant. This is a **scoped exception**, not a softening of §6:
every other refusal in §6 (no zones or dashboards, no shadows, no red/green status, no badges as
decoration, no engagement optimisation, no "AI" label) applies to the iOS app unchanged, and nothing here
licenses a tab bar anywhere in The Document.

**Source:** Kody interview, 2026-09-02 —
`artifacts/ios-testflight-polish-2026-09-01/build/rulings-2026-09-02.md` (rulings **D1** and **V7**).
Consequences of the same ruling: `artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/retier-D1.md`
(twelve findings re-tiered against the shipped root) and `build/PROGRAM.md` §11.

*Entries add: C1 · S1–S6 · V1–V6 · V7 · last id = V7*
