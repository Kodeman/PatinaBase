# Audience portals — Direction C Wave 0

Inventory for the client, admin, and manufacturer portals. This is a proposed copy ledger, not an application change. `rows-portals.json` records source paths, audience, meaning, replacement, disposition, and a verification prompt. `ownership-portals.json` is an exact-path allowlist for P1 and P2, including affected tests; it claims no shared package. `planned` means a proposed change, `unchanged` means the existing wording or protected consequence should stay, and `exception` requires the decision below before implementation. Dynamic project names, user-authored notes, invoice numbers, and historical signed records are not replacement copy. Route wrappers without displayed text are represented by their rendered child sources rather than invented labels.

Exact rows name wording changes or protected meanings (consent, payment, access, roles, financial/fulfillment states, manufacturer availability, Threshold metaphors). An `-F` file-level row owns the remaining already-correct display copy in a source without prescribing a replacement. Its count is a machine-assisted static candidate count screened for that file, **not** a total of runtime strings or a claim of exhaustive string-by-string review: the lexical scan may also include source fragments. Eight dynamic-value-only files have no inline JSX-text candidates and are labeled as such. Component props and upstream data can provide displayed labels at runtime; verify the named workflow before implementation. The ownership allowlist covers every copy-bearing TSX source found in the three portal source trees by the bounded static sweep, plus explicit TS/config owners and matched tests. It is not a runtime crawl or a claim about unrendered/dead branches.

| Owner | Audience/workflow | Planned | Unchanged | Exception | Total rows (exact / file-level) | Owned paths |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| P1 | Homeowner Threshold, client authentication, guest Field/trade/quotation/paperwork/evidence, invoice payment | 22 | 81 | 10 | 113 (77 / 36) | 120 |
| P2 | Admin operations and manufacturer placeholder | 14 | 278 | 4 | 296 (85 / 211) | 287 |
| **Total** | | **36** | **359** | **14** | **409 (162 / 247)** | **407** |

## Audience extensions and decisions

- **P1 Threshold:** the doorstep is project status; the letterbox is invoices and payments; the road is furnishing orders in progress; the mat is project details and documents. The rail, printed headings, room-map links, and accessible labels must agree while retaining their existing anchors. This does not introduce designer navigation or relabel the homeowner page “Studio overview.” The progress path does not mean a project schedule or verified measurement.
- **P1 public tokens:** `/field`, `/field/spec-book`, `/trade`, `/rfq`, `/paperwork`, and `/evidence` are assigned **trade** by task, not by the hosting portal. The invoice-payment sheet is provisionally homeowner-facing because the resolved invoice carries a client display name; CL-070 remains an exception until issuance/payee scope is confirmed. Guest errors, expiry, retries, local capture and server delivery remain separate. The `/share` board is a homeowner/guest viewing route, but its board title is author-supplied and not copy to rename.
- **P2 People:** recommend **Users and studios**, not **Studio contacts**; the zone covers users, studios, roles, applications, verification, and waitlist. Keep sub-destinations and URLs stable. The badge producer `hooks/use-admin-nav-counts.ts` keys counts by labels, and `components/portal/sub-nav.tsx` looks up `counts[item.label]`; P2 owns both with `config/navigation.ts`. Check the Verification, Applications, and Waitlist badges after any nav change.
- **P2 fulfillment:** `NEXT_PUBLIC_ENABLE_FULFILLMENT=true` adds Fulfillment/Queue/Shipments/Exceptions/Vendors/Config to navigation; false removes the entry, but direct routes remain available. Test both branches rather than treating hidden navigation as removed functionality.
- **P2 manufacturer:** the two pages are a welcome and a not-yet-available onboarding placeholder. Remove the home page’s implied available flow and “Start onboarding” promise, retain the explicit no-action-needed follow-up and the nomination reference. No new form or enrollment claim.
- **Shared authentication:** app wrappers may say “projects” or “Patina Operations”; the design-system defaults stay audience-neutral. No `packages/**` edit is assigned here. Any newly required package label becomes an L-owned row with a portal dependency, not a P1/P2 path.

### Exceptions requiring product/semantic review

| Row | Recommendation and protected meaning |
| --- | --- |
| CL-002, CL-004 | Replace the signature-door metaphor only with a confirmed phrase. The standing sentence is parsed into links by `SENTENCE_OBJECTS`; change the generator, parser, and tests together, preserving the door/acceptance/invoice targets. |
| CL-007, CL-076 | Confirm where “Settle this invoice” and “Settle the balance” land before choosing “Pay”; selecting a payment method does not itself charge. Preserve total, paid and balance figures. |
| CL-010 | Resolve whether “Owed” includes studio invoices before “Unpaid invoices”; retain amount and scope. |
| CL-018 | Confirm the zero/one/many drawing marks comprise signatures and acceptance before using “open requests”; an empty drawing is not project completion. |
| CL-025 | Resolve the landmark “What you owe” against ledger and letterbox targets before narrowing it to invoices. |
| CL-070 | Confirm who can receive the tokenized payment link, including studio invoices. Do not infer homeowner from the host or change charging disclosures. |
| CL-083 | Confirm the finished-work heading and acceptance instrument appear together before removing the painted-wall metaphor. A photograph alone is not verified completion. |
| CL-085 | Confirm an updated request is actually queued before promising it is on its way; expired requests must remain visibly stale. |
| AD-026 | The payouts page explicitly describes **designer** earnings. Confirm recipients and stages before “Designer payouts”; never substitute vendor payouts. |
| AD-072 | Confirm whether “Settle this PO” opens a preview or commits settlement before relabeling the financial act; retain permission and consequence. |
| MF-004 | Replace the home-page future-flow promise with an honest not-yet-available statement; confirm the nomination/outreach email’s follow-up expectation. |
| MF-005 | Replace “Start onboarding” with “View onboarding status” only if the destination genuinely communicates status; otherwise “About onboarding.” The link cannot enroll a maker. |

## Pinned related tests for implementation owners

Use `pnpm --filter @patina/<portal>-portal test --runInBand --runTestsByPath <paths>` for existing Jest paths; run focused paths while editing, then the plan §6 portal type/lint/build gates after integration. The client `type-check` is the type gate; admin build also enforces types. Manufacturer has no unit-test script, so check both pages in a browser plus type-check/build after implementation. This inventory's own gate is `node docs/design/designer-portal-labeling/manifest/validate.mjs portals`.

**P1:**

- `apps/client-portal/src/components/threshold/__tests__/{threshold,threshold-robustness,doorstep,story-pole,landmark-ledger,letterbox,the-road,mat,plan-key-render,house-ledger,door-acts,approval-ask,details-sheet,payment-method-chooser}.test.tsx`
- `apps/client-portal/src/lib/threshold/__tests__/{standing,derive,road-orders,invoice-rollup}.test.ts`
- `apps/client-portal/src/app/auth/{reset-password,forgot-password,callback}/__tests__/page.test.tsx`

**P2:**

- `apps/admin-portal/src/lib/__tests__/auth-navigation.test.ts`, `apps/admin-portal/src/__tests__/accessibility.test.tsx`
- `apps/admin-portal/src/components/fulfillment/queue/__tests__/queue-row.test.tsx`, `apps/admin-portal/src/components/fulfillment/composer/__tests__/po-paper.test.tsx`, `apps/admin-portal/src/components/fulfillment/shipments/__tests__/shipment-row.test.tsx`
- `apps/admin-portal/src/components/studios/__tests__/create-studio-dialog.test.tsx`
- `apps/admin-portal/src/app/auth/signin/signin.test.tsx`, `apps/admin-portal/src/app/auth/password-recovery.test.tsx`, `apps/admin-portal/src/app/auth/mfa-enroll/page.test.tsx`

The admin Jest baseline has **21 pre-existing failing suites (SQ-712)**. P2 verification runs related tests only; do not misreport a broad baseline failure as a label regression or claim a broad pass.

## Browser journeys from plan §6

1. Find the next project action: designer Studio overview → project/action, then homeowner Threshold; no-alert wording must not imply completion.
2. Source and specify a product: Resource library → Design boards → furnishing selections → Specification book; check client shared/spec-book labels do not convert a view-only document into an approval.
3. Review a measured room: Field photo/notes and scan → portal room and client room drawing; unverified dimensions are not confirmed data.
4. Request purchasing authorization: designer prepares and issues; homeowner reviews the actual request. Reading a document is not signing or issuing it.
5. Review money and purchase orders: client invoices/payment link, vendor commitments/payments and receiving remain separate; payment method selection does not charge.
6. Find a conversation: designer Studio inbox, Field Messages, and admin communication threads each name the content they actually hold.
7. Record time or an inquiry: desktop and Field creation/saved confirmations agree; neither is a client payment or an admin waitlist action.
8. Administer users or review maker onboarding: users/studios/roles/applications/verification/waitlist and their badges; manufacturer home and onboarding page both truthfully say enrollment is unavailable. Check admin fulfillment nav flag on and off.

Use local/staging test accounts; do not send external messages, issue orders, charge payments, or mutate production just to check wording.
