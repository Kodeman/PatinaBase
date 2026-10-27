# Studio workflows — source map and sample boundary

Read-only audit of current checkout, 21 October 2026. Paths below are beneath `apps/designer-portal/src/`. Production flags, deployed behavior and real data were not verified. The July portal-features skill's zone-route map is stale: the `(portal)/portal` tree is absent from this checkout.

## Working views

| View | Current source | Demonstrated in the sample |
| --- | --- | --- |
| Studio overview | `lib/document/registry.tsx:269` (Record an inquiry, create project, agreement, invoice, time); `components/document/people/people-room.tsx:809` (leads on Desk) | Open the existing project; Mine/Studio reading; hold a maker follow-up for tomorrow; record a fictional inquiry. The inquiry remains a brief, without silently becoming the existing sample project. |
| Studio contacts | `app/(document)/people/page.tsx:17`; `components/document/people/people-room.tsx:73`; `people/views/person-profile.tsx:571`, `:631`, `:670`, `:740` | Search, directory kind filters, household/workshop/crew/team records, project roles, reach instructions and a per-contact saved reply draft. |
| Correspondence | `components/document/people/ops/thread-conversation.tsx:53`, `:206`; `people/people-room.tsx:619` | Inbox and contact record refer to the same local reply draft. No Send action or external communication. |
| Project financials | `components/document/commercial/money-region.tsx:405–437`, `:451–499` | All six readings remain separate. Selected-piece estimate comes from shared scope; design approval, purchase authority and received deposit are separate facts. No released vendor obligation is invented. |
| Invoices | `components/document/accounts/accounts-book.tsx:52`, `:67–93`, `:148`; `accounts/invoice-folio.tsx:178–186`, `:784`, `:855` | Paid retainer folio, time-generated draft, local issue, partial/full received-payment recording. No email, Stripe checkout, payment-link creation or actual money movement. |
| Purchases/expenses | `components/document/purchases/purchase-record.ts:14`; `purchase-record-form.tsx:58`, `:131`, `:253`, `:270`, `:313–325` | Record store buy/find/antique/expense/sample fee; studio vs personal payment; at-cost billing intent. Receipt upload, linking an FF&E line and billing these buys are not simulated. |
| Timesheets | `components/document/hours-ledger.tsx:198`, `:511–525`, `:803–830`, `:1204–1237`, `:1372`; `app/(document)/layout.tsx:99`, `:135` | Manual entry; personal/project view; billable/nonbillable and awaiting-rate states; assign rate; draft eligible time; reserve draft entries; mark invoiced only on local issue. |
| Studio inbox | `components/document/overlays/post-sheet.tsx:60`, `:80–90`, `:220` | Correspondence and Activity log, read/unread toggles, return to the source view, shared draft visibility. |

All figures, people, firms, messages and project information are fictional. `example.test` addresses cannot be used for real mail. The chosen scene remains Lake Mendota House; Nora Ellis is the decision lead, Evan Ellis the reviewer, Leah Hartwell the lead at Middle West Studio.

## Permission and accounting boundaries

- The prototype identifies an **owner preview**, not a simulated security system. Current Accounts scopes figures per studio and project; non-owner/admin seats do not receive studio totals or Earnings (`accounts-book.tsx:67–93`, `:148`). Current Hours exposes broader lenses only to authorized seats (`hours-ledger.tsx:803–830`).
- Project budget excludes design services. Freight and tax are explicitly estimates. The $6,000 received deposit is not a client purchase authorization. A design decision is not an authorization to release a purchase order.
- Drafting time does not mark it invoiced. Draft time is reserved to avoid duplicate drafting. Issuing in the sample marks those entries invoiced; recording an invoice receipt does not alter the furnishings deposit.
- The walkthrough follows one service invoice through draft, issue and payment. Additional recorded time stays visible for a later billing cycle; creating a second service invoice is not simulated, so the first record is never overwritten.
- New buys are separate from the furnishing estimate and are not automatically converted into a client receivable. No automatic sends occur.

## Explicit coverage without full mockup

- Studio contacts current implementation also includes company affiliations, contact merge/archive, compliance documents, access grants, field SMS, maker marketplace, client review requests, portfolio, outreach campaigns/templates/audiences and nurture. Sources: `people/views/person-profile.tsx`, `people/people-room.tsx`, `people/outreach/campaigns-tab.tsx:67`; registry rooms at `lib/document/registry.tsx:390`.
- Current invoicing also supports void, payment links, delivery failure recovery, printable invoices, Earnings and receivables aging. These are source-mapped, not implemented by this specimen.
- Current Hours also supports timers, editing/deleting entries, member/studio rollups and exports. This specimen has manual recording and project billing flow only.
- Studio settings include identity/logo/address, membership and roles, locations, member rates, payment methods, margin visibility, release holds, agreement defaults/library and correspondence policy. Source: `components/document/account/account-studio-page.tsx:393`, `:890`, `:1098`, `:1213–1260`, `:1633`.
- **Gated settings**: `studio-workspaces` owns the Studio settings page (`account-sheet.tsx:101`, `:135–170`); `agreement-parts`, `agreement-library`, `design-build`, `outbound-review` gate their respective sections (`account-studio-page.tsx:217–227`). These are not presented as universally available production features.
- Personal profile, notifications, TOTP security, mobile sign-in and browser extension remain account concerns (`account-sheet.tsx:73`; `account-security-page.tsx:28`, `:128`; `account-notifications-page.tsx:71`). Contextual help, command bar, shortcuts and walkthrough live in `app/(document)/layout.tsx:105–163`.

## Local gate

`node --check studio-views.js` is the module syntax gate. Parent integration owns browser layout, cross-view flows and accessibility validation.
