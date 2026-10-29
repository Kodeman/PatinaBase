> Full RC-6 R3b report (Codex Astra), verbatim. It was reviewed at `1faae43c0`; paths are repo-relative. Dispositions are in `../rc6-release-review.md`; RC-7 closes the coverage gaps.


## Lens 6 — NOT-READY

Reviewed checkout `1faae43c0`, whose application-code tip is `7d5d872f3`. No tests, mutations or database access performed.

Ratings apply to **the entire acceptance criterion**, not individual passing assertions. “Weak” means partial evidence, not necessarily a product defect. RC-3c, the current gate repairs and RC-5 are **pending**, not missing.

### Evidence-path keys

| Key | Absolute path and relevant section |
|---|---|
| **SQL** | `docs/design/designer-portal-round8/evidence/rc/rc1-sql-gate.md` — populated rehearsal; full SQL/concurrency table |
| **Browser** | `docs/design/designer-portal-round8/evidence/rc/rc3b-final-tip-matrix.md` — G4, G5, accessibility |
| **Raw** | `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2355/g4-round8-owned-stack.log` — named browser results |
| **Consumer** | `docs/design/designer-portal-round8/evidence/rc/rc2-consumer-walk.md` — RC-2c assertions and narrowed claims; final-tip rerun recorded in **Browser**, lines 83–95 |
| **Visual** | `docs/design/designer-portal-round8/evidence/rc/rc4b-visual-reeval.md` — surface evaluations |
| **Preservation** | `docs/design/designer-portal-round8/evidence/preservation-inventory.md` — source inventory, explicitly not runtime proof |
| **Handoff** | `docs/design/designer-portal-round8/HANDOFF.md` — pending rehearsals and acknowledged limitations |

I confirmed cited Round-8 specs and SQL suites exist. **Raw** confirms the named passing cases in both Chromium and WebKit-iPhone unless noted below. These are two browser engines, **not** the legacy and Round-8 application renderers.

## A/X coverage table

| ID | Criterion, short | Evidence path / named test | Rating | Gap |
|---|---|---|---|---|
| A01 | Exact subject and originating context | **Browser/Raw**: `studio-journeys`, `resource-returns`, `library-return`, `buying-paper`, `ffe-unfold` | **weak** | Strong live navigation evidence, but not the complete entry-source × filter/scroll/focus/reload matrix. One WebKit failed-save/return case explicitly skipped. |
| A02 | Mounted editing context; singleton instruments | **Browser/Raw**: `ffe-unfold`, `responsive`, `hours-paper` | **weak** | Mounted-paper preservation passes; no recorded complete nested-ledger/line-edit journey with a live singleton timer/global-instrument census. |
| A03 | Inquiry → agreed project; preserved lineage | **Browser/Raw**: `identity-lineage`; **SQL**: document-open aliases, scope execution | **weak** | Browser lineage cases use imported accepted snapshots. They do not demonstrate the complete inquiry conversion preserving notes through the actual transition. |
| A04 | Every arrangement; repeat safely | **Browser/Raw**: `arrangements`; **SQL**: scope composition/execution | **weak** | Browser proves inactive choices/read-only responsibilities. SQL proves synthetic arrangement idempotency; no recorded application of every actual arrangement end-to-end. |
| A05 | Configured placement; retry/reload; candidate/usage | **Browser/Raw**: `configured-placement`, named-room case; **SQL**: placement retry | **covered** | Both engines pass real commit-with-lost-response retry, single-row reload, candidate state, exact line return, Library usage and no invented board pin. Separate sourcing-handoff failure remains pending triage. |
| A06 | Complete 36/80-line specialized FF&amp;E work | **Browser/Raw**: `ffe-lenses`, `ffe-operations`, `phone-line-editor`, `configured-placement` | **weak** | Strong partial live coverage; complete COM/labor/alternate/finish/protected-issued-value workflow not established. Dedicated legacy Pieces evidence is pending G3. |
| A07 | 500/2,000-line stable work and agreed performance | **Browser**, G4; scale artifacts | **weak** | Scale rerun pending. Existing measurements use unthrottled development-server localhost; agreed representative performance pass not established. |
| A08 | Survey/concept/plan/render provenance and private assets | **Browser/Raw**: `first-slice`, `evidence-folio` | **weak** | Real private PDF lazy-load/retry/return covered. Not all four asset types, uncertainty, cancellation and private-to-public imagery boundaries demonstrated. |
| A09 | Frozen issues and distinguishable holdings | **Browser/Raw**: `evidence-folio`; **SQL**: evidence manifests | **weak** | Frozen bytes/hash/identity, advancing current revision and unchanged holdings pass. Full client-shared/received/superseded state matrix is not demonstrated. |
| A10 | Mixed selection decisions bound to exact editions | **SQL**: evidence manifests and legacy authority/lifecycle contracts | **weak** | Related backend assertions exist; no recorded complete client selection approve/return → material change → renewed decision journey. Service acceptance is not a substitute. |
| A11 | Authority/terms/funding release holds; truthful ETA | **SQL**: readiness batch, fabrication authority; **Browser/Raw**: buying | **weak** | No complete recorded approved-item refusal matrix or differing-maker-acknowledgement/ETA journey. |
| A12 | Grouped orders, duplicate attempts, receiving, claims | **Browser/Raw**: `buying-paper`, `receiving-paper`; **SQL**: external-presence/parity | **weak** | Partial/damaged receipt and claim/replacement identities pass. Grouped PO creation/retry and complete job/books reconciliation are not demonstrated together. |
| A13 | Contact/account/appointment/access/consent distinctions | **Browser/Raw**: `people-resources`; **SQL**: authority suites | **weak** | Six meanings and directory navigation pass; labels do not prove all account/job entrances and permitted-copy/access boundaries. |
| A14 | Correct subject/audience; safe uncertain sends | **Browser/Raw**: `audience-work`, `resource-returns`; **SQL**: typed subjects | **weak** | Private note/shared draft separation covered. Maker/GC/supplier paths and failed/unknown send recovery without duplication remain unproven. |
| A15 | Field provenance; review without implicit completion | **Browser/Raw**: `field-subject-return`; **SQL**: typed subjects | **weak** | Field payload and metadata are mocked. No real observation → review/owner assignment → explicit sharing journey proving unchanged drawing/task/acceptance state. |
| A16 | Complete cabinet package; alternate detail route | **Browser/Raw**: `cabinetry-cp01`; **SQL**: external package/fabrication suites | **weak** | CP-01 proves a recorded package reading. Full sample/appliance/site-verification workflow and alternate designer-detail route not demonstrated. |
| A17 | GC-bought cabinetry without studio commerce | **SQL**: external fulfilment/presence/parity; **Browser/Raw**: `cabinetry-cp01` | **weak** | Strong backend exclusion evidence; browser fixture imports recorded events and keeps acts disabled. No complete mounted progression with all money/readiness/closeout readings. |
| A18 | Hardware substitution impacts and partial holds | **Browser/Raw**: `cabinetry-cp01`; **SQL**: fabrication instruction | **weak** | Unit holds, separately instructed units and receipt≠acceptance covered. Price/time/drilling/approval/recipient impact workflow not demonstrated. |
| A19 | Time-rate provenance, concurrent claim, void release | **Browser/Raw**: `hours-paper`, `accounts-paper`; **SQL**: billing lock-order | **weak** | One billable studio-rate capture/claim/void passes. Unresolved/nonbillable/dated-rate variants and actual concurrent time-entry claim lack a mapped passing run. |
| A20 | Scoped acceptance across required signers/channels | **Consumer**; **Browser**, consumer rerun; **SQL**: service acceptance | **weak** | Web journey passes twice. Paper upload/hash/review, signer replacement, scope supersession and iOS explicitly unexercised; SQL predates final identity changes. |
| A21 | Service shapes; separate service/trade/finance/closure | **Consumer**; **SQL**: service completion/close-project | **weak** | One service shape and unchanged project/checklist proven. Other service shapes and full GC/financial distinctness explicitly unexercised. |
| A22 | No acceptance by silence; conditional/external obligations | **Consumer**; **SQL**: service completion | **weak** | Send/open produce no response; condition resolution covered. Walkthrough and informational external punch explicitly unexercised. |
| A23 | Edition-bound care; post-close behavior | **Consumer**, completion/care leg | **weak** | Scoped care reference and return focus pass. Later care question, purchased/warranty/responsible-party records and controlled post-close edits not demonstrated. |
| A24 | All preserved capabilities, role-appropriate homes | **Preservation**; **Browser/Raw**: resource/navigation cases; **Handoff** | **weak — pending** | RC-5 must supply the complete both-renderer present/moved/missing inventory. Existing inventory is source-only. |
| X01 | Distinct failure states; no false success | **Browser/Raw**: `states`, read-failure, phone-editor and return tests | **weak** | Good live reads plus fault injection; complete offline/timeout/partial-read/authority matrix not mapped. Missing/forbidden deliberately share nondisclosing recovery, requiring explicit criterion disposition. |
| X02 | Actor matrix across data, RPCs, bytes and exports | **SQL**; **Consumer**, authenticated PDF download; **Browser**, unrelated designer | **weak** | Broad partial backend tests; no complete actor × rendered/RPC/attachment/export matrix. Current household identity changes postdate SQL gate. |
| X03 | Real concurrent edits/decisions/issues/orders/claims | **SQL**, concurrency table; **Browser**, editor recovery | **weak** | Real database races cover a subset. Complete required race set, recoverable client work and latest relink/respond race not established. |
| X04 | All named surfaces compared desktop/phone | **Visual**; earlier RC-4; presentation repair evidence | **weak** | Studio/paper/accounts comparisons exist. Cabinetry and activated acceptance/care comparison gaps remain; photographic cover unverified; comprehensive visual capture predates final tip. |
| X05 | WCAG 2.2 AA complete processes and screen reader | **Browser**, accessibility; responsive/keyboard specs | **weak** | No screen-reader pass. Selected keyboard paths and reduced motion pass, not complete-process accessibility/contrast/semantics coverage. |
| X06 | Six widths, zoom, real content bounds | **Browser/Raw**: `responsive`; accessibility probes | **weak** | All six widths plus boundaries exercised in both engines. Zoom probes record clipped controls; full table/viewer/content and actual browser-zoom coverage incomplete. |
| X07 | Scroll CLS, bundles, representative performance | **Browser**, G5; scale JSON artifacts | **weak** | Bundle passes. Representative profile, settled-scroll zero-shift and target percentiles not established; request capture broken in recorded scale run. |
| X08 | Current/older web, iOS and Field consumers | **Consumer**; **SQL**: service-acceptance X08 | **weak** | Web consumer runs pass. SQL proves legacy projection exclusion, not execution of actual older parsers. iOS/Field omitted. |
| X09 | Authority/hash/idempotency/audit/invalidation | **SQL**; **Browser/Raw**, placement/hours; **Consumer** | **weak** | Strong partial integrity evidence. Final authority/schema changes lack an equivalent current SQL/race gate; complete mutation-family invalidation/audit matrix not mapped. |
| X10 | Both renderers; replay/backfill; rollback | **SQL**, earlier populated rehearsal; **Handoff**, RC-5 | **weak — pending** | RC-5 pending. Recorded populated rehearsal ends at 00889; final candidate ends at 00895. G4 excludes renderer-off tests. |

## Findings

### 1. Final authority changes are newer than the comprehensive SQL evidence
**Severity: high · Confidence: high**

`docs/design/designer-portal-round8/evidence/rc/rc1-sql-gate.md:3`

RC-1 ran at `f5f8b5d3c519`, through 00889. Six subsequent migrations change signer notices, storage policy and household signer/completion identity. The final browser journey does not replace their negative actor/race tests.

**Risk:** a linked/relinked household account could be admitted incorrectly while the release cites an older green authority gate.  
**Fix:** attach final-tip SQL/actor/concurrency results, including household identity and malformed-storage-folder suites. Let pending RC-5 establish final populated replay.

### 2. Consumer acceptance and closeout coverage explicitly omits required branches
**Severity: high · Confidence: high**

`docs/design/designer-portal-round8/evidence/rc/rc2-consumer-walk.md:245`

Paper intake, signer replacement, scope supersession, additional service shapes, walkthrough, external punch and later care remain unexercised.

**Risk:** the happy web journey passes while replacement evidence, conditional completion or post-close work behaves incorrectly.  
**Fix:** extend the existing consumer runner with those branches and recorded database assertions; retain separate activation gates for anything deliberately deferred.

### 3. Native and older-consumer compatibility is not demonstrated
**Severity: high · Confidence: high**

`docs/design/designer-portal-round8/evidence/rc/rc2-consumer-walk.md:162`

The SQL X08 test verifies projection contents; it does not run actual old parsers. iOS and Field consumer runs are absent from the recorded walk.

**Risk:** mixed records can decode correctly in SQL/web yet break an existing native inbox or deep link.  
**Fix:** record current/older parser fixtures and iOS/Field consumer checks against mixed records.

### 4. Client evidence delivery is proven through an API bypass, not the acceptance page
**Severity: high · Confidence: high**

`docs/design/designer-portal-round8/evidence/rc/rc2-consumer-walk.md:243`

The report explicitly says the page displays references, not evidence contents; downloaded PDF bytes are verified through the signer API.

**Risk:** a client can reach acceptance without being able to inspect the evidence through that user journey.  
**Fix:** demonstrate an accessible client-facing evidence-reading path before acceptance and include it in the recorded walk.

### 5. Several journey tests prove readings, not the required transitions
**Severity: med · Confidence: high**

- `apps/designer-portal/e2e/round8/identity-lineage.spec.ts:55`
- `apps/designer-portal/e2e/round8/arrangements.spec.ts:38`
- `apps/designer-portal/e2e/round8/cabinetry-cp01.spec.ts:7`

Imported accepted lineage, inactive arrangements and replica-seeded cabinetry cannot establish their complete lifecycle journeys.

**Risk:** displays remain correct while inquiry conversion, arrangement application or cabinet progression fails.  
**Fix:** add recorded native transition journeys for A03/A04/A16–A18, including alternative routes and impact/readback assertions.

### 6. Commerce evidence does not cover the complete money-critical scenarios
**Severity: high · Confidence: med**

`docs/design/designer-portal-round8/evidence/rc/rc1-sql-gate.md:142`

The mapped evidence does not establish the complete A10–A12/A19 scenarios: mixed selection decisions after material changes, all release prerequisites, differing acknowledgements, duplicate grouped PO attempts, unresolved rates and concurrent time claims.

**Risk:** a green reading/receipt test masks an invalid release, stale approval or double claim.  
**Fix:** run the corresponding existing procurement/billing suites and missing client workflows; map each result to the exact acceptance clause.

### 7. Navigation, dense work and failure-state evidence remains narrower than the full processes
**Severity: med · Confidence: med**

`docs/design/designer-portal-round8/evidence/rc/rc3b-final-tip-matrix.md:46`

Passing cases do not establish every originating context, singleton instrument, preserved specialized FF&amp;E operation or failure mode. One relevant WebKit return case is skipped.

**Risk:** a less-used entry or nested instrument loses context/draft state despite the primary route passing.  
**Fix:** close the table’s A01/A02/A06/X01 clauses with named process-level assertions; consume pending G3 results rather than treating them as missing.

### 8. Field and audience proofs do not establish real coordination behavior
**Severity: med · Confidence: high**

- `apps/designer-portal/e2e/round8/field-subject-return.spec.ts:33`
- `apps/designer-portal/e2e/round8/audience-work.spec.ts:32`

Field reads are mocked; audience coverage concentrates on private notes/shared drafts. Asset variants, actual Field review, all recipient classes and uncertain-send recovery are not demonstrated.

**Risk:** a real observation loses provenance or a retry sends twice/to the wrong audience.  
**Fix:** record actual Field and audience journeys with unchanged drawing/task/acceptance assertions and controlled failed/unknown send outcomes.

### 9. Privacy and concurrency matrices are incomplete
**Severity: high · Confidence: high for acknowledged races; med for broader coverage**

`docs/design/designer-portal-round8/HANDOFF.md:87`

The relink/respond race and multi-card collision are explicitly unverified. The supplied evidence also lacks a complete actor matrix across rendered records, RPCs, attachment bytes and exports, and the full X03 race set.

**Risk:** revocation or concurrent identity changes behave differently across readers/writers; an export bypasses otherwise-correct UI restrictions.  
**Fix:** complete the matrix using existing suites, including both race orders and recoverable loser state.

### 10. Visual review does not cover every required surface/state
**Severity: med · Confidence: high**

`docs/design/designer-portal-round8/evidence/rc/rc4-visual.md:54`

Cabinetry, activated acceptance/completion and image-led content were not fully evaluated. Later re-evaluation focuses on desk/job/accounts and predates the final candidate.

**Risk:** the release passes structural tests while an important package or closeout surface remains visually incoherent.  
**Fix:** complete final-tip desktop/phone comparisons for all X04 surfaces using representative populated fixtures.

### 11. Complete-process accessibility evidence is absent
**Severity: high · Confidence: high**

`docs/design/designer-portal-round8/evidence/rc/rc3b-final-tip-matrix.md:101`

No screen-reader pass is recorded. Selected keyboard probes and test counts do not satisfy the explicit complete-process WCAG target.

**Risk:** a screen-reader user cannot finish an approval, edit or recovery flow even though controls render.  
**Fix:** record manual screen-reader and keyboard-only completion of representative full processes, with contrast, semantics and announced errors.

### 12. Zoom evidence contains failures rather than a clean responsive pass
**Severity: med · Confidence: high**

`docs/design/designer-portal-round8/evidence/rc/rc3b-final-tip-matrix.md:99`

At 200% CSS zoom, the probes found clipped skip links on both surfaces and a clipped account/settings control on job paper. No-overflow measurements therefore do not establish X06.

**Risk:** magnification hides essential navigation despite a green page-width check.  
**Fix:** reproduce under actual browser zoom/reflow, resolve clipping and verify essential content bounds—not only document width.

### 13. Performance evidence is diagnostic, not an agreed acceptance pass
**Severity: med · Confidence: high**

`/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2355/g4-round8/chromium-2000.json:5`

The profile is unthrottled localhost on an M4 Pro development server. Its recorded network array is empty. It reports approximately 18.5s LCP, 0.326 cold CLS and 791ms selection p95; these are **not production measurements**, but cannot establish the proposed targets either.

**Risk:** repairing the port-bound request counter yields a green functional test without demonstrating acceptable large-job performance.  
**Fix:** finish the pending scale rerun, agree the representative profile, and record repeatable target/percentile and settled-scroll measurements.

### 14. Verification documentation names a stale bundle budget
**Severity: low · Confidence: high**

`docs/design/designer-portal-round8/VERIFICATION.md:58`

It names `/doc/[id]` budget **1,687,684**, while the checked-in configuration and RC-3b use **1,690,757**. The measured candidate passes either value.

**Risk:** later reviewers assess against inconsistent release thresholds.  
**Fix:** reconcile the document with the authoritative configuration and its recorded budget decision.

## Verdict

**NOT-READY — fix-then-ship.** There is substantial genuine live-data evidence, including both browser engines and a repeatable web consumer journey, but several whole acceptance criteria remain only partially proven. RC-3c and RC-5 are pending obligations, not missing evidence or established product failures; their completion alone will not close the explicit consumer, accessibility and performance gaps. **The most important finding is that the comprehensive SQL authority evidence predates the final household-signer identity changes.**