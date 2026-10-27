# Observable acceptance catalog

These are production acceptance requirements. They are not claims that the current app or mockup already passes. Link each implementation task and its evidence to the applicable IDs.

## Journeys

| ID | Scenario and observable result | Primary WP |
|---|---|---|
| A01 | Open from studio next act, search, correspondence or order. Land at the exact job subject; close/Back returns to the right originating view, filter, scroll anchor and focus. Reload does not replay a mutation | 01/02 |
| A02 | Pick up a job, open a ledger and a line instrument, then put them down. The job and pending editing context remain mounted. One timer and one instance of each global instrument exist | 01 |
| A03 | An inquiry becomes a proposal/agreed commission/project without losing source notes or breaking old document links. A direct project also opens with truthful absent-history states | 03 |
| A04 | Apply each service arrangement, including repeated application. Phases do not duplicate. Proposed services/roles do not rewrite signed editions, appoint people, alter access or fabricate verification | 03 |
| A05 | Place one configured library item into a named room. Retry/reload cannot duplicate placement. It remains a candidate until actual decisions; library usage and room/board readings agree | 02/04 |
| A06 | Operate a 36-line living room / 80-line mixed job using all specialized FF&E views. Edit, search, filter, group, move rooms, select in bulk and return by stable ID. Preserve COM, labor, alternate, allowance, finish and protected-issued-value behavior | 04 |
| A07 | Review a 500-line job and stress a 2,000-line job across rooms. No lost selection or edit through the chosen scale strategy/filter/sort; useful progress and errors; measured performance meets the agreed profile | 04/11 |
| A08 | Open survey, concept, plan and rendering with provenance, dates, uncertainty and visibility. Large assets load on demand; failure/retry/cancel does not lose the place. Private room/Field assets do not become public product imagery | 05 |
| A09 | Issue an exact print set, then advance current drawings. Issued identity/hash/content and recipient holdings remain unchanged. Current, client-shared, issued, received and superseded are distinguishable | 05 |
| A10 | Client approves some selections and returns others. Each decision applies only to its exact edition. Materially changed content requires a new effective decision; earlier evidence remains readable | 06 |
| A11 | An approved item lacking authority, terms or funding cannot be released. A review comment does not authorize purchase. A differing maker acknowledgement cannot be shown as a confirmed matching ETA | 06 |
| A12 | Draft grouped maker orders, handle duplicate attempts, partial receipt, damage/claim and replacement. Studio books open exact POs and reconcile with the job. Externally bought work does not enter studio payables | 06 |
| A13 | Open a person from directory, account or job. Saved contact, trade account, appointment, permitted work copy, consent and authority have separate meaning and enforced access | 02/07 |
| A14 | Private note, client draft, maker question, GC return and supplier reply appear on the right subject across job and inbox. Recipient labels match actual audience. Saving does not send; failed/unknown send outcome preserves draft/evidence without blind duplicate send | 07 |
| A15 | Field observation links room, source print/issue, scope and author. Review/response assigns next owner but does not silently change drawing, accept work or complete the task. Client sharing is an explicit permitted act | 05/07 |
| A16 | Full-service cabinet package has designer intent, maker development, sample, hardware/appliance interfaces, site verification, commercial scope and exact contents. Alternate designer-detail route preserves maker verification responsibilities | 08 |
| A17 | GC contracts and buys cabinets with no studio PO. The package can progress through its agreed external-fulfillment path with evidence, while furnishing estimate, invoice/payable totals, procurement readiness/release and installed/paid closeout readings remain correct | 08 |
| A18 | A proposed hardware substitution after issue identifies affected units/approvals/price/time/drilling and recipients. Affected work is held; separately authorized unaffected work may continue. Readiness never equals instruction; receipt never equals acceptance | 08 |
| A19 | Record billable/nonbillable time with actual dated rate provenance, including unresolved rate. Draft invoice claims correct entries; concurrent claim is rejected; void releases eligible entries. Drafts do not change issued/received/due balances | 09 |
| A20 | Client final service acceptance uses the agreed scope edition and required signer policy. One required signer accepted/another pending remains incomplete; rejection, signer replacement or superseded scope requires the correct new evidence. Designer request follows V22; authenticated client-portal/iOS response and permitted paper intake produce the same scoped truth | 10A/10B/10C |
| A21 | Full service, design-only and client-buy completion evaluate included studio obligations correctly. Studio service acceptance, GC trade acceptance, financial closeout and project closure remain distinct. Existing close_project/freeze semantics are preserved or deliberately migrated | 10B |
| A22 | Silence, an opened request, delivery or walkthrough cannot record acceptance. Conditional acceptance with an unresolved included obligation stays visibly held under the agreed policy; an informational external punch item is not automatically a studio blocker | 10B |
| A23 | Care/specification/warranty records retain purchased/issued editions and responsible party. Deep reference returns to closeout. A later care question does not automatically reopen or bill the service; controlled post-close edition behavior remains valid | 10B |
| A24 | Existing capabilities absent from the simplified specimen remain discoverable and operable according to the WP-00 preservation inventory, with a role-appropriate home | 02/11 |

## Cross-cutting gates

| ID | Required evidence |
|---|---|
| X01 — truth and failure | Loading, empty, missing/redirected identity, forbidden, expired session, stale version, offline/timeout, partial read failure and retry are distinct. Failed queries cannot masquerade as an empty studio or fallback fixture. Save/read/authority failure never reports success |
| X02 — privacy and tenancy | Positive and negative tests for studio A/B, owner/member/guest, household signer, GC/maker/supplier and revoked access. Verify rendered data, RPC/RLS result, attachment bytes and exports—not only hidden controls |
| X03 — concurrency | Two actors/tabs race a content edit, decision, issue, PO draft and invoice claim. One authoritative outcome, no duplicate send/order, no silent overwrite; conflict resolution preserves recoverable work |
| X04 — visual coherence | Side-by-side review of studio, paper, dense sheet, cabinet package, books and care at desktop and phone against frozen round eight. Type, imagery, rules, left weight and working density remain coherent |
| X05 — accessibility | Keyboard-only completion, meaningful labels/headings/table semantics, focus restored and unobscured, screen-reader review, contrast, reduced motion and non-drag alternatives. Use the DESIGN-CONTRACT target for complete processes |
| X06 — responsive | 320/390/768/1024/1440/1920 widths and zoom. No clipped essential content; table/viewer scrolling is bounded and reachable. Test the actual content, not only body scrollWidth hidden by CSS |
| X07 — performance | Preserve settled-paper zero scroll-layout-shift contract; do not exceed checked-in route bundle budgets. Proposed initial-load targets: CLS ≤0.1, LCP ≤2.5s and interaction response ≤200ms on a representative profile agreed in WP-00. Capture fixture sizes, device/network, percentiles, query count and payloads; adjust only with recorded evidence/decision |
| X08 — consumer compatibility | Existing client-page/iOS/Field consumers and deep links continue to work. New client/service evidence needs coordinated consumer tests; test current and older parser/consumer fixtures against mixed old/new records. An unsupported service kind must never reach the older approval list; one new record cannot break that inbox |
| X09 — mutation integrity | Server authority, content hashes, idempotency, audit provenance and canonical invalidation survive new UI composition. UI state/local storage cannot become approval, billing, role or order truth |
| X10 — rollout | Pilot/legacy renderer share data contracts; flag-off does not lose new records. Additive migrations replay and backfill safely. No deployment is reported complete from static version strings alone |

## Fixture catalog

Use deterministic **local-only** fixtures through existing test harnesses; do not seed production to demonstrate the design. Reuse existing actor/auth setup and extend it rather than adding a parallel fixture identity system. Lake Mendota, Nora/Eli and other specimen identities are fictional local fixture names only; never production profile/default values.

| Fixture | Required contents |
|---|---|
| F01 — Lake Mendota equivalent | Three furnishing rooms; 36 living-room and 80 job lines; alternates, COM/labor, allowance and external custom reference; two existing POs; private/client/maker/GC/supplier threads |
| F02 — mixed service | Four service arrangements; agreed baseline plus unsigned amendment; room/package overrides; external buyer; absent or conflicting delegation |
| F03 — cabinet package | GC contract/no studio PO, six units, K-201 current versus held revision, maker shop drawing and designer-detail variants, physical sample, appliance clearance, verified and disputed measure, post-issue hardware change |
| F04 — evidence/authority | Content change after approval, expired/revoked authority, receipt without acceptance, required signer replacement, one of two clients pending, returned/superseded acceptance |
| F05 — money and fulfillment | Partial funding, differing acknowledgement, partial/damaged receipt, claim/replacement, billable/nonbillable/rate-pending hours, concurrent invoice claim and void |
| F06 — scale | 500 and 2,000 selections, multiple rooms, many prints/attachments and long correspondence; record viewport rendering, queries and asset demand |
| F07 — isolation/recovery | Two studios sharing a lead, unrelated client, revoked trade, expired session, failed RPC, unknown outbound outcome and competing edits |
| F08 — closeout | Full service and design-only/client-buy; included versus external obligation; open informational punch; accepted service while external work continues; frozen closed client edition with permitted closing draft |

## Evidence and done

Every slice supplies: commit SHA and base, affected acceptance IDs, fixture and actor IDs, exact commands/results (including skips), real-data observations, desktop/phone screenshots and a short click-through, independent review findings/disposition, remaining limitations and rollout implications. Use synthetic data in shareable evidence. A test named for a journey is insufficient if its assertions cover only opening a picker.
