# P04–P07 proposals and Kody rulings K3–K5

Status: proposed (WP-00.5b, SQ-1813). Contracts: `C2-scope-editions.md`, `C4-evidence-acceptance.md`, `C5-external-fulfilment.md`, `C6-service-completion.md`. Source inspected at `0fabcadf2`; the contracts carry the file:line evidence.

**Which items need Kody:**
- **K3:** completion (P06).
- **K4:** signers (P07).
- **K5:** consent and paper.

P04 and P05 are engineering and product decisions that the contracts settle with the existing authorization. They are listed for ratification, not as blocking rulings. Only the WP-10A activation grant waits on K3–K5. Schema, read RPCs and the C2/C5 work proceed.

## P04 — Scope editions and service arrangements (no Kody ruling needed)

**Recommended:**
- **Packages as agreement parts.** A service arrangement preset is one named composition of a phase template and standard parts. Packages are `scope_package` agreement parts with a stable `packageKey`, explicit inclusion and party-kind responsibilities.
- **Edition minting.** Executing an agreement mints an immutable `project_scope_editions` row inside the existing countersign transaction.
- **Amendment.** An amendment is the existing `service_addendum`. Executing it mints a successor edition and supersedes the predecessor, and it never rewrites the predecessor.
- **Arrangement idempotency.** Applying the same arrangement twice replays its first effect. Applying a different arrangement to the same draft is refused.

**Rejected:**
1. **A new `scope_editions` draft table beside agreement parts.** It would duplicate the composer and the signed-fingerprint path. Parts are already hashed in full (`00575:48-49`).
2. **Using `proposal_agreement_parts.id` or `part_key` as package identity.** They rekey on every save (`00618:781`).
3. **Editing the agreed edition in place for a change order.** That breaks A04 and A20's "exact edition" evidence.
4. **Letting `apply_phase_template` dedupe across different slugs.** That would change existing tested behaviour (`proposal_phase_authority_atomicity_test.sql:1036-1038`). The guard belongs at the arrangement level instead.
5. **Treating `project_billing_authorities` as the edition.** It holds money only, with no scope or packages.

## P05 — External fulfilment (no Kody ruling needed; commerce consulted)

**Recommended:**
- **External record.** One build-owned external fulfilment record per package or item group, joined to `(scope_edition_id, package_key)`, with an append-only event ledger. Each event is either reported or verified.
- **GC cabinetry.** GC cabinetry has no priced FF&E row by default. When it has room presence, it is an *unpriced* external presence line that can never go on a PO and never through a studio purchase.
- **Client-bought furnishings.** These keep their selection line but are converted to external and unpriced. Their reference price lives on the fulfilment record.
- **Fabrication instruction.** This requires C3's new fabrication authority scope, and it is refused until that scope exists.

**Rejected:**
1. **Reusing `studio_purchases`.** It is studio-paid or member-reimbursed commerce, billable to the client by default (`00703:56-97`).
2. **A placeholder PO to satisfy `record_custom_commission_milestone`'s PO prerequisite** (`00403:3316-3325`). That fabricates a studio order.
3. **Keeping priced lines with a "client buys" label or a hidden subtotal.** `close_project` would still demand studio invoicing and collection (`00399:7484-7518`).
4. **Reusing `trade_scope_document_id`.** That column means an executed, studio-sold trade scope billed by draws (`00423:28-32`). The new column copies its pattern, not its meaning.

## P06 / K3 — What studio service completion means (Kody ruling needed)

**Recommended ruling:**
1. **Included obligations block.** These are:
   - included studio obligations from the agreed edition: its phases, and studio-purchased lines in included packages, which must be installed;
   - unresolved studio decisions and scope changes;
   - mandatory client acceptance.
2. **Excluded and external work does not block.** Excluded packages, external fulfilment, GC trade progress and open install punch items stay visible as *informational*.
3. **Conditional acceptance is an explicit state.** It is `completed_with_conditions`, with each condition tracked until resolved. It is never silently "complete".
4. **Balances are a separate financial hold.** Outstanding balances do not block service completion. They still block `close_project`, which is unchanged.
5. **Open included defects block** only when the designer has recorded them as an acceptance condition, or when they fall in an included studio package. Trade punch items are informational.

**Rejected:**
- Completion = `close_project`. It cannot represent design-only or client-buy work, or GC work that continues.
- Balances as blockers. That conflates collections with service delivery.
- Treating every punch item as a blocker. That contradicts the existing C-34 reading (`closure-derivation.ts:120`).
- Automatic completion from walkthrough, delivery or silence (A22).

## P07 / K4 — Signers (Kody ruling needed)

**Recommended ruling:**
1. **Required and optional signers** are named in the agreed scope edition's signer policy (C2 §2.6). Every **required** signer must respond. Optional signers are recorded but never change the outcome.
2. **Every required signer must be able to authenticate**, or the studio must use the K5 paper path for that signer.
   - Today only `projects.client_id` answers approvals (`00569:552-563`).
   - Household members are contact cards (`00632:99`).
   - So a second signer needs an invited client account that C3 grants on this job.
3. **Replacement or delegation** is an audited policy change, backed by C3 delegation or revocation evidence. Responses already given by the replaced person stay as history but no longer count.
   - Recommended: replacing a *required* signer named in an agreed edition needs a service addendum, which means a new edition. This applies only when it changes who is bound.
   - Substituting an equivalent representative under an existing C3 delegation does not need an addendum.
4. **A material scope change supersedes every pending request.** The superseding change is an executed amendment edition, and every pending request then needs fresh responses.
5. **Legacy projects without an edition** may use a `designer_declared` signer list. It is visibly labelled "not from the agreed scope" in the UI and data, and it is limited to signers who are already authorized clients of the job. *(Kody: allow or forbid.)*

**Rejected:**
- Using `required_coapprover_id` and the artifact rail. Its maximum is two, the create path refuses it, and adding a kind breaks old inboxes.
- Treating the decision lead as the household's only signer.
- Hardcoding the mock household.

## K5 — Consent and paper evidence (Kody ruling needed)

**Recommended ruling:**
1. **Authenticated click-through.** Web or iOS acceptance of an exact scope edition hash and evidence manifest hash. The UI calls it "acceptance", never "e-signature". `electronic_signature` is not used unless Kody approves a real signature mechanism.
2. **Paper intake is allowed:**
   - A studio member uploads the signed document, together with the signer's name and date.
   - A different studio owner or admin reviews it.
   - Only a confirmed intake counts. It is stored as `paper_intake`, with the recorder and the reviewer named.
   - It is never stored as the client's own response. This is unlike `record_paper_trade_acceptance`, which stamps `accepted_by` with the client (`00475:1889`, `:1893`).
3. **Not acceptance:**
   - email replies;
   - texts;
   - verbal or phone consent;
   - a designer's status click.

   A designer may note any of these as context, but they never count.

**Rejected:**
- Self-review of paper intake.
- Impersonated client responses.
- Calling click-through a signature.
- Counting delivery or an opened link.

## Worked examples

### Example 1 — Full service with building team (two signatories)

**Agreement.**
- A fixture studio presents arrangement `full_service_build_team` v1.
- **Packages:**

  | Package | Inclusion | Purchasing | Fabrication contract |
  |---|---|---|---|
  | `pkg.living-ffe` | included | studio | n/a |
  | `pkg.kitchen-cabinetry` | included for design | gc | gc |
  | `pkg.lighting` | excluded | n/a | n/a |

- Signer policy: Nora (required) and Eli (required), with Eli on an invited client account.
- The edition is minted as E1 on countersign.

**Application.** Applying the arrangement twice (a double-click and a retry) returns the same phase ids. Choosing `design_only` afterwards is refused until the draft is discarded.

**Build.**
- Cabinetry gets a C5 fulfilment (`gc_cabinetry`) and an unpriced presence line in the kitchen.
- The GC's contract and receipt are *reported*. The install is *verified* by the studio owner.
- The studio budget, payables and invoices never include the cabinets.
- `close_project` waits for the verified install, but service completion does not.

**Acceptance.**
- Designer drafts the request R1. It sits in `awaiting_review`, the designer presses Send, and delivery is recorded.
- Nora accepts in the portal. Outcome: `pending`, because Eli is still pending.
- **Replacement.** Eli moves abroad, and the household delegates Eli's authority to Nora's sister Ada through C3 delegation evidence.
  - Under the recommended K4 rule, Ada is an equivalent representative under a recorded delegation, so no addendum is needed.
  - Eli's slot is marked `replaced` and Ada is added as a required signer.
  - Ada accepts on iOS. Outcome: `accepted`.
- **Supersession (alternative path).** Before Ada responds, the clients add a lighting package by service addendum, which executes as E2.
  - R1 becomes `superseded`, and Nora's acceptance remains readable history.
  - The designer drafts R2 against E2. Nora and Ada must both respond again.
- **Completion.**
  - Blockers: E1/E2 phases completed, `pkg.living-ffe` lines installed, acceptance `accepted`.
  - Informational: the GC cabinet install pending and two trade punch items.
  - Financial hold: one invoice balance.
  - `complete_studio_service` succeeds. `projects.status` remains `active`, and `close_project` still refuses on the balance.

### Example 2 — Design-only / client-buy (two signatories, one on paper)

**Agreement.**
- Arrangement `design_only_client_buy`.
- **Packages:**

  | Package | Inclusion | Purchasing |
  |---|---|---|
  | `pkg.design-documents` | included | n/a |
  | `pkg.furnishings` | included for specification | client |

- Signer policy: Sam (required, portal account) and Pat (required, no account).

**Selections.** Twelve FF&E selections are converted to `client_furnishing` external lines. They are unpriced, with retail reference prices on the fulfilment record.
- The working budget shows a "bought by client (not billed by studio)" group.
- No PO or studio purchase is possible.
- The client page shows the reference prices because `price_visibility = client_visible`.

**Acceptance.**
- R1 is drafted and sent. Sam accepts **with a condition**: "touch-up drawing for the den bookcase".
- Pat signs a printed copy. A studio member records the intake, and the owner reviews and confirms it.
- **Conditional and paper outcome.** Outcome: `accepted_with_conditions`. Pat's response shows "Paper — recorded by Jo, reviewed by Ren", and Pat is not shown as the responder.
- Completion: `completed_with_conditions`. When the den drawing is issued, the condition is resolved and the completion becomes `completed`.
- Client furniture still arriving is informational only.
- `close_project` becomes possible once the converted lines are verified installed (they are unpriced, so the paid gate ignores them) and its other gates pass.
- **Return (alternative path).** Pat's paper copy is marked "returned: bookcase finish wrong". After the intake is confirmed, the outcome is `returned`. R1 is terminal, and the designer drafts R2 after the fix.

## Ratification checklist for Kody

| Item | Ruling | Status |
|---|---|---|
| K3 | P06 points 1–5 | **needs ruling** |
| K4 | P07 points 1–5 (the legacy `designer_declared` list in point 5) | **needs ruling** |
| K5 | Consent and paper points 1–3 | **needs ruling** |
| P04 | Arrangement and edition model | ratify (non-blocking) |
| P05 | External fulfilment model; GC cabinetry unpriced by default | ratify (non-blocking) |
