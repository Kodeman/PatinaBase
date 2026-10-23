# P04–P07 proposals and Kody rulings K3–K5

Status: proposed (WP-00.5b, SQ-1813). Contracts: `C2-scope-editions.md`, `C4-evidence-acceptance.md`, `C5-external-fulfilment.md`, `C6-service-completion.md`. Source inspected at `0fabcadf2`; the contracts carry the file:line evidence.

**Revision 2026-10-23 (SQ-1850).** Brought in line with the contract corrections for the SQ-1817 frontier review at `4952624a16d1`: F3 (P06, Example 2), F8 (P04), F9 and F10 (P04, P07), F11 (K5, Example 2), F12 (P07), F13 (P04, Example 1), F16, F17 and F20 (P05, the example package tables). K3, K4 and K5 remain **OPEN**; nothing here rules them.

**Revision 2026-10-23 (SQ-1856).** Brought in line with the contract corrections for the SQ-1851 re-review at `6ac0c5acc`: R1/R16/R10/R6/R7 (P04), R3/R4/R5/R9 (P05), R8/R20 (P06, both examples), R11/R12/R15/R19 (P07, Example 1). K3, K4 and K5 remain **OPEN**.

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
- **Arrangement idempotency.** Applying the same arrangement twice replays its first effect. Applying a different arrangement to the same draft is refused, even after discarding its parts, because the receipts survive (`00575:3367`, `00474:151-169`). A different arrangement needs a fresh draft proposal (F13).
- **Template idempotency (adjudicated, SQ-1817).** A same-request replay and a same-slug alias are idempotent. Different slugs deliberately append. Plan correction #4 is settled on those terms.
- **Signed signer policy and bindings (F10).** The signer policy is an `acceptance_signer_policy` agreement part, so the client signs it with the rest. The edition freezes it and binds proposal phases to project phases and packages to `(project_id, package_key)` (C2 §2.4a, §2.6).
- **One package key (SQ-1851 R1, R16).** A package key has one form, `pkg.<slug>`, defined once in C2 §2.2a. The server allocates it from the package title when the composer gives none, and C1 copies the same string onto the project package. The C1 code-derived key is withdrawn, so the signed key always reaches fabrication.
- **Keys are never dropped (SQ-1851 R10).** An amendment keeps every package key of the edition it amends. Taking a package out of scope sets it to `excluded`, which is itself the kept record.
- **Assigning lines to packages (SQ-1851 R7).** A line's package is set through one C2 RPC under the plan-composition capability, checked against the active edition. An external line's package is its fulfilment's.
- **Rollback (F8).** Turning editions off suspends C4, C5 and C6 mutations, and the C3 direct fabrication route, in the same step (SQ-1851 R4). An addendum executed while off makes the active edition `stale`. Turning editions back on requires an explicit reconciliation per project, which replays **every** executed amendment in order, one edition per document (SQ-1851 R6).

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
- **Client-bought furnishings.** These keep their selection line but are converted to external and unpriced. Their reference price lives on the fulfilment record. Conversion is refused while any studio commitment holds the line, including a draft or sent authorization (F16).
- **Who owes, not who buys (F17).** The external rail accepts a package only when the studio is neither buyer, payer nor fabrication contracting party. Anything the studio pays for or contracts goes through existing commerce: a PO, a studio purchase or a trade scope. One internal helper holds this rule for C5 and the C3 gate (SQ-1851 R4).
- **No stranded fulfilment (SQ-1851 R9).** Once a fulfilment has a contract, an amendment that would make the studio its buyer, payer or contracting party is held: it cannot be sent or countersigned (C2 §2.5a). Before a contract, the studio first reverses the conversion and cancels the fulfilment. An audited transfer from the external rail into studio commerce is not designed and stays OPEN.
- **Fabrication instruction.** Every writer, including C5's generic event route, first calls the one shared C3 gate `public.assert_fabrication_instruction_authority` (C3 §3.2) (F20). It is refused until that gate exists. The gate is keyed by the fulfilment, locks that fulfilment's amount and holds before it reads them, and names the exact units it instructs, which a partial hold can withhold (SQ-1851 R3, R5).

**Rejected:**
1. **Reusing `studio_purchases`.** It is studio-paid or member-reimbursed commerce, billable to the client by default (`00703:56-97`).
2. **A placeholder PO to satisfy `record_custom_commission_milestone`'s PO prerequisite** (`00403:3316-3325`). That fabricates a studio order.
3. **Keeping priced lines with a "client buys" label or a hidden subtotal.** `close_project` would still demand studio invoicing and collection (`00399:7484-7518`).
4. **Reusing `trade_scope_document_id`.** That column means an executed, studio-sold trade scope billed by draws (`00423:28-32`). The new column copies its pattern, not its meaning.

## P06 / K3 — What studio service completion means (Kody ruling needed — OPEN)

**Recommended ruling** (not yet ruled):
1. **Included obligations block.** These are:
   - included studio obligations from the agreed edition: its phases, and studio-purchased lines in included packages, which must be installed;
   - studio **services** on included packages, whoever buys the goods: in a package the studio installs, every line and fulfilment must be verified installed; a package the studio designs is discharged by the agreed phases (SQ-1851 R8, C6 §2.3);
   - any line or fulfilment whose package key is missing from the agreed edition (fails closed, SQ-1851 R10);
   - unresolved studio decisions and scope changes;
   - mandatory client acceptance.
2. **Excluded and external work does not block.** Excluded packages, external purchase and contract progress, GC trade progress and open install punch items stay visible as *informational*. The one exception is point 1: a studio installation on client-bought goods is a studio service and blocks (SQ-1851 R8).
3. **Conditional acceptance is an explicit state: option A.** Completion may proceed with conditions open as `completed_with_conditions`, with each condition tracked until resolved. It is never silently "complete". The earlier wording also counted open conditions as blockers, which made this state unreachable (SQ-1817 F3). The two coherent options are:
   - **Option A (recommended):** open conditions do not block. Completion records them, and resolving the last one moves the completion to `completed`.
   - **Option B (safe default; the schema ships this way until K3 is ruled):** open conditions block. They are resolved first, and completion is only ever `completed`.
   Both use one resolution record keyed by the acceptance request and condition (C6 §2.4). K3 also decides whether a resolution needs the client's confirmation; as specified, it is a studio-recorded fact with evidence.
4. **Balances are a separate financial hold.** Outstanding balances do not block service completion. They still block `close_project`, which is unchanged. The hold shown on a completion is read at that moment and is not part of what completion locks or compares (SQ-1851 R20).
5. **Open included defects block** only when the designer has recorded them as an acceptance condition, or when they fall in an included studio package. Trade punch items are informational.

**Rejected:**
- Completion = `close_project`. It cannot represent design-only or client-buy work, or GC work that continues.
- Balances as blockers. That conflates collections with service delivery.
- Treating every punch item as a blocker. That contradicts the existing C-34 reading (`closure-derivation.ts:120`).
- Automatic completion from walkthrough, delivery or silence (A22).

## P07 / K4 — Signers (Kody ruling needed — OPEN)

**Recommended ruling** (not yet ruled):
1. **Required and optional signers** are named in the agreed scope edition's signer policy (C2 §2.6). The client signs that policy as an agreement part (F10). Every **required** signer must respond. Optional signers are recorded but never change the outcome. Whatever K4 rules, a request is never created with a missing, empty, optional-only, duplicated or unbound required set, and zero required signers never reads as accepted (F9, C4 §2.2).
2. **Every required signer must be able to authenticate**, or the studio must use the K5 paper path for that signer.
   - Today only `projects.client_id` answers approvals (`00569:552-563`).
   - Household members are contact cards (`00632:99`).
   - So a second signer needs an invited client account that C3 grants on this job.
3. **Replacement or delegation** is an audited policy change, backed by C3 delegation or revocation evidence. Responses already given by the replaced person stay as history but no longer count.
   - Recommended: replacing a *required* signer named in an agreed edition needs a service addendum, which means a new edition. This applies only when it changes who is bound.
   - Substituting an equivalent representative under an existing C3 delegation does not need an addendum.
   - Under every K4 answer, replacement acts only on an open (`draft` or `sent`) request. A returned or accepted request is closed, and a replacement cannot reopen it; the remedy is a successor request (F12, C4 §2.2a).
   - Under every K4 answer, a replacement must leave a valid signer set: one slot per person, every signer bound to the household, every required signer reachable (SQ-1851 R11). It raises the request's policy revision by one, and a response must present the revision it was shown, so a page loaded before the replacement is refused (SQ-1851 R12). Responses already given by signers who were not replaced keep counting.
   - A signer who retries an answer that closed the request gets that answer back; the retry never reopens or re-closes it (SQ-1851 R15).
   - A request names the exact evidence manifest the household reviews (SQ-1851 R19).
4. **A material scope change supersedes every pending request.** The superseding change is an executed amendment edition, and every pending request then needs fresh responses.
5. **Legacy projects without an edition** may use a `designer_declared` signer list. It is visibly labelled "not from the agreed scope" in the UI and data, and it is limited to signers who are already authorized clients of the job. *(Kody: allow or forbid.)*

**Rejected:**
- Using `required_coapprover_id` and the artifact rail. Its maximum is two, the create path refuses it, and adding a kind breaks old inboxes.
- Treating the decision lead as the household's only signer.
- Hardcoding the mock household.

## K5 — Consent and paper evidence (Kody ruling needed — OPEN)

**Recommended ruling** (not yet ruled; until then the paper RPCs stay revoked):
1. **Authenticated click-through.** Web or iOS acceptance of an exact scope edition hash and evidence manifest hash. The UI calls it "acceptance", never "e-signature". `electronic_signature` is not used unless Kody approves a real signature mechanism.
2. **Paper intake is allowed:**
   - A studio member uploads the signed document, together with the signer's name and date.
   - The recorder also transcribes what the paper says (accept, accept with conditions, or return; any conditions or return reason) and the request number and hashes printed on it. The server hashes the stored file. A mismatched hash is refused (F11, C4 §2.1).
   - A different studio owner or admin reviews it. Review confirms or rejects the transcription against the stored file. It is not the client's choice, and the reviewer cannot change the disposition.
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

  | Package | Inclusion | Purchasing | Payer | Fabrication contract | Installation |
  |---|---|---|---|---|---|
  | `pkg.living-ffe` | included | studio | studio | none | studio |
  | `pkg.kitchen-cabinetry` | included for design | gc | client | gc | gc |
  | `pkg.lighting` | excluded | none | none | none | none |

- Signer policy (an `acceptance_signer_policy` part the clients sign): Nora (required) and Eli (required), with Eli on an invited client account.
- The edition is minted as E1 on countersign. Its phases are bound to the project phases the same transaction created.

**Application.** Applying the arrangement twice (a double-click and a retry) returns the same phase ids. Choosing `design_only` afterwards on the same draft is refused, even after discarding its parts. The studio starts a fresh draft proposal for `design_only` (F13).

**Build.**
- Cabinetry gets a C5 fulfilment (`gc_cabinetry`) and an unpriced presence line in the kitchen. The external-only rule passes: the GC buys and contracts, and the client pays. Had the package said payer = studio, C5 would refuse it and send it to a PO or trade scope (F17).
- The GC's fabrication instruction is recorded only after `public.assert_fabrication_instruction_authority` passes (F20).
- The GC's contract and receipt are *reported*. The install is *verified* by the studio owner.
- The studio budget, payables and invoices never include the cabinets.
- `close_project` waits for the verified install, but service completion does not.

**Acceptance.**
- Designer drafts the request R1. It sits in `awaiting_review`, the designer presses Send, and delivery is recorded.
- Nora accepts in the portal. Outcome: `pending`, because Eli is still pending.
- **Replacement.** Eli moves abroad, and the household delegates Eli's authority to Nora's sister Ada through C3 delegation evidence.
  - Under the recommended K4 rule, Ada is an equivalent representative under a recorded delegation, so no addendum is needed.
  - R1 is still open (`sent`, outcome `pending`), so replacement is allowed (F12). Eli's slot is marked `replaced` and Ada is added as a required signer.
  - The replacement passes the signer-set checks (Ada holds no other slot, belongs to the household and has an account) and raises R1's policy revision from 1 to 2. Nora's earlier acceptance still counts (SQ-1851 R11, R12).
  - Ada accepts on iOS, presenting revision 2. Outcome: `accepted`.
- **Supersession (alternative path).** Before Ada responds, the clients add a lighting package by service addendum, which executes as E2.
  - R1 becomes `superseded`, and Nora's acceptance remains readable history.
  - The designer drafts R2 against E2. Nora and Ada must both respond again.
- **Completion.**
  - Blockers: E1/E2 agreed phases completed (and bound to project phases), `pkg.living-ffe` lines assigned to the package and installed, acceptance `accepted`.
  - The completion holds the service-obligation lock, so a sofa placed into `pkg.living-ffe` at the same moment either lands first and blocks it, or lands after it (F7).
  - Informational: the GC cabinet install pending (the GC installs, so it is not a studio service) and two trade punch items.
  - Financial hold: one invoice balance.
  - `complete_studio_service` succeeds. `projects.status` remains `active`, and `close_project` still refuses on the balance.

### Example 2 — Design-only / client-buy (two signatories, one on paper)

**Agreement.**
- Arrangement `design_only_client_buy`.
- **Packages:**

  | Package | Inclusion | Purchasing | Payer | Fabrication contract | Installation |
  |---|---|---|---|---|---|
  | `pkg.design-documents` | included | none | none | none | none |
  | `pkg.furnishings` | included for specification | client | client | none | client |

- Signer policy: Sam (required, portal account) and Pat (required, no account).

**Selections.** Twelve FF&E selections are converted to `client_furnishing` external lines. They are unpriced, with retail reference prices on the fulfilment record. A thirteenth line sitting on a draft furnishings authorization is refused until that draft is voided (F16).
- The working budget shows a "bought by client (not billed by studio)" group.
- No PO or studio purchase is possible.
- The client page shows the reference prices because `price_visibility = client_visible`.

**Acceptance.**
- Pat has no account, so this example assumes K5 permits paper intake. Without that ruling, R1 could not be created for Pat (`signer_policy_unreachable`).
- R1 is drafted and sent. Sam accepts **with a condition**: "touch-up drawing for the den bookcase".
- Pat signs a printed copy marked "accept", with R1's number and hashes printed on it. Jo records the intake, transcribing the disposition and the printed hashes; the server hashes the scan. Ren, the owner, reviews it against the scan and confirms it (F11).
- **Conditional and paper outcome.** Outcome: `accepted_with_conditions`, and R1 closes. Pat's response shows "Paper — recorded by Jo, reviewed by Ren", and Pat is not shown as the responder.
- **Completion depends on K3 (OPEN, F3):**
  - Option A (recommended): completion succeeds as `completed_with_conditions`. When the den drawing is issued and the condition is resolved, it becomes `completed`.
  - Option B (safe default): completion is refused while the condition is open. The designer issues the den drawing, records the resolution against R1, and then completes as `completed`.
- Client furniture still arriving is informational only, because the client installs it. Had `pkg.furnishings` said installation = studio, each of the twelve lines would block completion until its install was verified, even though the client bought it (SQ-1851 R8).
- `close_project` becomes possible once the converted lines are verified installed (they are unpriced, so the paid gate ignores them) and its other gates pass.
- **Return (alternative path).** Pat's paper copy says "returned: bookcase finish wrong". Jo records the intake with disposition `return` and that reason, and Ren confirms the transcription. The outcome is `returned`, and R1 closes. Replacing Pat on R1 is now refused (F12), so the designer drafts R2 after the fix.

## Ratification checklist for Kody

| Item | Ruling | Status |
|---|---|---|
| K3 | P06 points 1–5, including option A vs option B for conditions (point 3) | **OPEN — needs ruling** |
| K4 | P07 points 1–5 (the legacy `designer_declared` list in point 5) | **OPEN — needs ruling** |
| K5 | Consent and paper points 1–3 | **OPEN — needs ruling** |
| P04 | Arrangement and edition model, including the F8/F10/F13 corrections | ratify (non-blocking) |
| P05 | External fulfilment model; GC cabinetry unpriced by default; F16/F17/F20 corrections | ratify (non-blocking) |
