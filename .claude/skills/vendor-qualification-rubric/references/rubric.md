# Vendor Qualification Rubric — 500-Point Scale

Source of truth for weights/bands: `packages/types/src/vendor-pipeline.ts` —
regenerate this table if that file changes.

Cross-checked against `apps/admin-portal/src/services/__tests__/vendor-pipeline.test.ts`
(triage boundary tests) and `docs/prds/cowork-vendor-pipeline-instructions.md`
(operational-dimension research protocol, worked scoring examples, hard-veto
rules). Dimension 6 was renamed "Category Value" → "Category Coverage" at
some point after the archived PRD (`docs/_archive/prds/vendor-pipeline-prd.md`)
was written; this file uses the current canonical name.

## Dimensions

| # | Dimension | Owner | Weight | Max points (weight × 5) |
|---|---|---|---|---|
| 1 | Drop-Ship Readiness | Kody (operational) | 15 | 75 |
| 2 | Data Quality | Kody (operational) | 15 | 75 |
| 3 | Margin Viability | Kody (operational) | 15 | 75 |
| 4 | Channel Conflict | Kody (operational) | 10 | 50 |
| 5 | Brand Alignment | Leah (brand) | 12 | 60 |
| 6 | Category Coverage | Leah (brand) | 10 | 50 |
| 7 | Sustainability & Craft | Leah (brand) | 8 | 40 |
| 8 | Relationship Warmth | Leah (brand) | 15 | 75 |
| | **Total** | | **100** | **500** |

## Scoring formula

Each dimension is scored `1`–`5` (raw score) by a human or Cowork research
pass, then multiplied by its fixed weight to produce a weighted score:

```
weighted_score = raw_score × weight
total_score    = SUM(weighted_score across all scored dimensions)
```

`total_score` maxes out at 500 (all 8 dimensions scored 5). A vendor scored
only on the operational half (dimensions 1–4) maxes out at 275 — see
"Partial scoring" below.

Cowork scores dimensions 1–4 only. Dimensions 5–8 are Leah's alone; Cowork
must never write a numeric score to them (`vendor-qualification-rubric/SKILL.md`
"Never" section; `cowork-vendor-pipeline-instructions.md` scoring rule #3).

## Triage bands

| Band | Threshold | Meaning |
|---|---|---|
| green | `total_score >= 400` | Strong candidate |
| yellow | `total_score >= 300` | Worth pursuing, gaps to close |
| orange | `total_score >= 200` | Marginal, likely hold |
| red | `total_score < 200` | Decline unless something changes |

`computeTriageLevel()` in `packages/types/src/vendor-pipeline.ts` implements
these bands as `>=` checks in descending order (green, then yellow, then
orange, else red) — the boundary values themselves (400/300/200) resolve to
the *higher* band.

### Partial scoring

A vendor scored only on dimensions 1–4 (operational, Cowork's `auto_score`
pass) tops out at 275 points — it will always read `orange` or `red` on the
triage scale even if the operational half is excellent. Partial state is
signaled by `awaiting_leah_review = true`, not by the triage color — don't
read a partial vendor's orange/red as a real "decline" signal.

## Hard vetoes (override scoring)

Checked before scoring; if any applies, set `has_hard_veto = true` +
`veto_reason` and skip scoring entirely rather than let a high total mask it
(source: `cowork-vendor-pipeline-instructions.md` scoring rule #4, and the
"Hard Veto Check" block in `vendor-qualification-rubric/SKILL.md`'s output
contract):

- Exclusive platform agreement (vendor is locked into one marketplace/retailer)
- No DTC shipping capability
- Margin below 30% (MSRP-to-wholesale spread)
- Brand risk (reputational, legal, or quality red flags)

<!-- DRAFT — Kody to confirm anchors -->
## Scoring anchors (1–5)

Drafted from the worked examples and dimension descriptions in
`docs/prds/cowork-vendor-pipeline-instructions.md` (operational half) and the
slider endpoint labels in `docs/_archive/prds/vendor-pipeline-prd.md`
(brand half, dimensions 5–8 only — Leah has never scored against these
specific mid-scale wordings before, only the 1/5 endpoints). Treat every
anchor below as a starting point, not settled doctrine, until confirmed.

### 1 — Drop-Ship Readiness (Kody)
1. No visible trade/wholesale program; no clear fulfillment or shipping capability found.
2. Trade program mentioned but undocumented (no application, no published terms); shipping method unclear.
3. Trade program exists with basic published terms; ships via standard freight/parcel, no named carrier partnership found.
4. Active, documented trade program; ships via a named carrier/3PL with published lead times. (Worked example: raw 4, "Active trade program, ships via Ryder Last Mile.")
5. Mature drop-ship infrastructure: documented program, named carrier partnerships, published lead times, evidence of existing wholesale/dealer relationships.

### 2 — Data Quality (Kody)
1. No product catalog or line sheet found; data would need to be built from scratch.
2. Catalog exists only as unstructured PDF/images; no consistent fields (dimensions, materials, SKU) across products.
3. PDF or web catalog with partially consistent per-product fields; no structured feed. (Worked example: raw 3, "PDF catalog only, no structured feed.")
4. Structured catalog (spreadsheet/CSV export or API) covering most required fields, with minor gaps.
5. Clean structured feed (CSV/API/EDI) with consistent SKU, dimensions, materials, and pricing fields ready for near-direct import.

### 3 — Margin Viability (Kody)
1. No visible pricing, or evidence suggests MSRP-to-wholesale spread well below the 30% hard-veto floor.
2. Some pricing visible; estimated spread near the 30% floor — verify against the hard veto before scoring this low.
3. Estimated MSRP-to-wholesale spread roughly 30–45%.
4. Estimated spread roughly 45–55%; healthy but not exceptional.
5. Estimated spread ~55%+. (Worked example: raw 5, "~60% MSRP-to-wholesale spread based on visible pricing.")

### 4 — Channel Conflict (Kody)
1. Exclusive or near-exclusive marketplace agreement found — verify against the hard veto.
2. Heavy marketplace presence (Wayfair/Perigold/1stDibs/Amazon) with little independent or DTC distribution.
3. Mixed presence: marketplace listings alongside independent retailers, no exclusivity found but marketplace-dominant.
4. Primarily DTC plus independent retailer network; limited or no marketplace presence.
5. Own DTC site plus independent/trade retailers only, no marketplace exclusivity or dependency. (Worked example: raw 5, "Own DTC site + independent retailers, no marketplace exclusivity.")

### 5 — Brand Alignment (Leah)
1. "Not Our World" — aesthetic, materials, or positioning conflict with Patina's Midwest craft/provenance identity.
2. Adjacent but off — some overlap (e.g. quality materials) but tone or market positioning reads wrong (mass-market, ultra-luxury, or trend-driven).
3. Compatible — aesthetically neutral fit, no strong signal either way.
4. Strong fit — clear craft/provenance story, materials and construction claims align with Patina's voice.
5. "This Is Patina" — exemplary alignment; could headline a Patina collection as-is.

### 6 — Category Coverage (Leah)
(Archived PRD calls this "Category Value" with the same endpoint labels; current canonical name is "Category Coverage.")
1. "Redundant" — category is already well-covered by existing live partners; adds no assortment value.
2. Marginal — mostly overlaps existing partners with minor differentiation.
3. Useful — fills a moderate gap or adds meaningful price-point/style variety within a covered category.
4. Valuable — fills a category with thin current coverage.
5. "Critical Gap" — fills a category Patina currently has no live partner for.

### 7 — Sustainability & Craft (Leah)
1. "No Story" — no sustainability or craft narrative found; mass-produced signals.
2. Thin — generic "quality materials" claims without specifics or provenance.
3. Credible — some verifiable craft/sustainability claims (domestic manufacturing, named materials) but not a headline story.
4. Strong — clear, verifiable craft or sustainability credentials (certifications, heritage techniques, domestic sourcing) worth featuring.
5. "Founding Partner Material" — exceptional, well-documented craft/sustainability story that could anchor Patina marketing.

### 8 — Relationship Warmth (Leah)
1. "Cold Outreach" — no existing connection; first contact would be a cold email.
2. Weak lead — indirect connection (mutual contact, industry-event overlap) but no direct relationship.
3. Warm intro available — a trusted contact can make an introduction.
4. Known to Leah — some prior direct interaction (met at a show, brief correspondence) but no ongoing relationship.
5. "Existing Relationship" — Leah has a direct, ongoing relationship with the brand or a principal there.
<!-- END DRAFT -->
