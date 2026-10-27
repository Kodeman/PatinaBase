# Round six — evidence and proposal map

22 October 2026. Source baseline: `713c257f8` in `patina-merged`. This is bounded repository inspection, not a live production audit. Round five was inspected as an artifact; it has not been modified.

## Evidence classes

1. **Founder feedback:** accepted paper/document direction, left-weighted visuals, right-margin flow, 36-line room density, contextual return. Prior requests brought notes, communications, item approval, purchasing, drawings, scans and Field into the study.
2. **Simulated panel:** three separate agent contexts, each using a different residential practice lens. These critiques are hypotheses, not human testimony, task observations or prevalence data.
3. **Published primary sources:** firms describing their own services and professional organizations describing process. These demonstrate variation, not representative market research. No named firm participated in this review.
4. **Current repository source:** capabilities observed below. An omission from round five does not establish a gap in the product.
5. **Round-six proposals:** engagement slip, scoped visibility, room/package states, mixed ownership, delivery editions and role-specific completion. The exact arrangement and interactions are design proposals.

## Current source inspected

All paths below begin `apps/designer-portal/src/components/document/`.

| File and relevant lines | Observed evidence | Round-six implication |
|---|---|---|
| `overlays/capture-lead-sheet.tsx:4–29` | Lightweight name/contact/project/source capture; leads can open into a Brief; the Desk can retain its position. | Start the review at an inquiry. Do not suggest this needs a separate new CRM. |
| `brief-section.tsx:34–258` | Lead facts, reply draft, scan strip and accept/nurture/pass triage. | Keep referral/defer/decline paths in the lifecycle; acceptance into discovery is not a paid commission. |
| `discovery/discovery-section.tsx:4–15,57–115,140–565` | Structured scope, budget, timeline, style/lifestyle, retained pieces, decision makers and site/scan. Blocks can fill in different orders. | The brief can grow in place; an unverified measure remains explicit. |
| `rooms/drafting/agreement/readiness.ts:83–107` | Fee basis differs from retainer, billing cadence and ceiling. Rate-card, flat and per-phase fee variants are recognized. | Do not give every service a universal retainer/deposit gate. |
| `rooms/drafting/agreement/turnkey/supervision-clause.tsx:35–112` | Separate supervision fee/body and double-count protection. | Commercial and site responsibilities already have meaningful distinctions. |
| `plans/plan-issue-ceremony.tsx:1–24,48,158–210` | Exact issue construction, selected sheets, named recipients, purposes and retained holdings. | Reuse the edition principle; cross-room package organization and contextual placement are proposed. |
| `commercial/trade/trade-scope-detail.tsx:4–17,365–449` | Authorization versus engagement; substantial completion versus client acceptance; schedule implications and draws. | Roster presence, design approval and trade commitment must remain distinct. |
| `care-band.tsx:130–146,175–241,326–356` | Operational/financial assessment and owner closeout act. Open punch explicitly informs but does not gate closeout. | Show residual obligations without inventing a zero-punch rule. |
| `spec-books/spec-book-workspace.tsx:85–118` | Client, vendor, installer, internal and care editions; care edition focuses on care/warranty information. | A care packet is not a wholly absent capability. Round six proposes a service-specific handoff reading. |
| `quiet-sections.tsx:80–139` | Settled reading and post-close review request. | Aftercare can live in the continuing record. |

The construction-lens agent inspected eight of these files, including exact line references; the root inspected capture, discovery, agreement readiness, care and edition definitions. The agent checked the files it read against the isolated worktree. None were edited.

## Published practice evidence

Accessed 22 October 2026. Short observations only; the proposed Patina journeys are our synthesis, not copies of these firms’ processes.

- [Justine Sterling Design, process](https://www.justinesterling.com/dicovering-home-process): distinct engagement, design/documentation, purchasing, installation, deficiencies and account reconciliation moments.
- [Studio Ness, process](https://www.studionessnyc.com/process): discovery through installation, followed by walkthrough, care guidance and optional continuing support.
- [Caroline Myers, services](https://www.caroline-myers.com/services): ongoing design-only and a bounded virtual package coexist with full service and focused advice. This demonstrates why fee basis and service scope should be independent.
- [Amy Elizabeth Interiors, design services](https://www.amyelizabethinteriors.co.uk/services/interior-design): design-only clients manage ordering and trades and implement a supplied design pack themselves.
- [Haven Interiors, focused design session](https://haveninteriors.be/services/design-consultation/): a session and follow-up notes can stand alone or precede a broader commission.
- [BIID, The Brief](https://biid.org.uk/resources/professional-practice-series-brief): evolving brief, parties’ responsibilities, communication and distinct design/build programmes.
- [RIBA Plan of Work](https://www.riba.org/work/insights-and-resources/riba-plan-of-work/): a building-project framework encompassing handover and use. Used for comparison, not imposed as an interior-design or jurisdictional standard.

## Scope and artwork

- Interactive buttons select fictional presentation states. They do not reconfigure a real project, change agreements, create permissions, send messages or execute transactions.
- The living-room concept, illustrative survey/elevation and local fonts are retained from round five. The concept is not an installed photo; SVGs are not measured surveys or construction documents.
- The study and kitchen examples reuse illustrative artwork to show structure, not to claim those rooms have been designed. New people, dates, responsibilities and commercial terms are fictional examples.
- Residential consultation, design-only, furnishings/full service and renovation coordination are in scope. Commercial/hospitality and regulated specialist workflows have not been assessed.
- Full human usability, screen-reader, Safari, backend and permission testing are not claimed. See VERIFICATION.md for checks actually completed.
