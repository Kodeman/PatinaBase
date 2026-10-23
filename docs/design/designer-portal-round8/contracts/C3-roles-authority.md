# C3 — Responsibility, authority and access

**Status:** proposed contract. Cross-provider review pending (`review-audit-frontier`).
**Ticket:** SQ-1812 (WP-00.5a). **Source inspected at:** `0fabcadf2`. Application and database source there is identical to `ee9c450a5` (main).
**Serves:** A13, A15, A16, A17, A18, X02, X03, X09. Inputs to C4 (signers), C5 (external fulfilment) and P08.

**Citations.**
- `NNNNN:L` means `supabase/migrations/NNNNN_*.sql`, line L.
- `SB` means `packages/supabase/src`; `DP` means `apps/designer-portal/src`.
- Before writing a migration, find every head body this file names with `grep -ln … | sort | tail -1`, then copy it verbatim and graft onto it.

## 0. Three different facts, never merged

| Fact | What it answers | Where it lives today |
|---|---|---|
| **Responsibility** | Who is expected to do X under the agreed scope | Not stored generically. C2 scope editions own it; C3 only consumes it |
| **Authority** | Who may approve or instruct X, up to what figure, from when to when | `project_party_authority` (00624:824-856) for party seats. `project_decision_authorities` (00463:86-102) for artifact approvals |
| **Access** | Which rows a person can read or write | RLS, grants and token links |

**Rule C3-R1.** Appearing on the roster, in a supplier directory entry, in a dropdown choice or in a proposed role creates none of the three. Every gate for a consequential act checks authority on the server and fails closed.

## 1. Role inventory: current representation and gaps

| Role | Current representation (cite) | Gap and contract |
|---|---|---|
| Designer (lead / support) | `projects.designer_id` and `lead_designer_id`. `project_team_members.role` is one of `lead_designer`, `support_designer`, `vendor`, `client`, `bookkeeper`, `previous_lead` (00093:37-44). `document_open` resolves the single lead (00792:86-97) | None. Keep as is |
| Studio principal | `organization_members.role IN ('owner','admin')` through `is_org_admin_or_owner` (head 00484:604). PR-n reserves `money` and `draw_certify` grants to principals (00624:1003-1016) | Reused for fabrication grants (§2) |
| Buyer (who places the order) | A studio buyer is anyone passing `can_buy_for_project` (head 00813:157-182). POs are gated by `can_send_purchase_order` (00813:190) | Client or GC buying has no representation. **C5 owns it** (P05). C3 adds nothing |
| Payer (who owes the money) | Implicit: the invoice recipient through `designer_clients`. The `money` scope grants spend *approval* up to `threshold_cents` (00624:830-832). That is not liability to pay | Liability belongs to the C2 scope edition (responsibility). Approval stays the `money` grant. They are never inferred from each other |
| Maker / contracting party | `project_parties.party_kind` is one of `gc`, `vendor`, `sub`, `installer`, `receiver`, `architect`, `client_rep`, `client`, … (00419:44-49). Commercial trade scopes live in `use-commercial-documents.ts` | Contracting is a C5 contract record. A seat's kind is a label, not a contract |
| Field verifier | `room_file_measurements.verified_by` / `verified_at`, with `tolerance_class='verified'` only when anchor-grounded (00341:190-215). `project_ffe_specs.source_verifications` / `field_provenance` jsonb (00380:55-59) | **Authorship is immutable.** Assigning another verifier is a *responsibility* change. It never rewrites `verified_by` (A15, the "Sam's verification" rule). No migration is needed in C3 |
| Fabrication authorizer | **None.** The scope CHECK has no `fabrication` (00624:861-864). The submittal resolver approves without any party-authority check (00808:2108-2128) | New scope `fabrication` (§2) |
| Receiver | `party_kind='receiver'` (00419:48). Receipt inspection records `inspected_by = auth.uid()` (00861:293, 495) | Reuse. Receiving never implies acceptance (A18) |
| Installer | `party_kind='installer'` (00419:48) | Reuse. Install evidence belongs to C5 |
| Signer | Proposal signing `signed_by_name` (00063:46). Design-services signature runs behind the `app.commercial_signature_capability` GUC wrapper (00462:1560-1580). Artifact approval is single-lead: `project_decision_authorities` has PK `project_id`, a `decision_lead_id`, and a nullable `required_coapprover_id` (00463:86-102). The web hook pins `requiredCoapproverId: null` (`SB/hooks/use-project-approvals.ts:120-127`) | Joint service signers are **C4 / WP-10A**: a separate record, gated on K4. C3 does not widen `project_decision_authorities` |

## 2. Fabrication authority

### 2.1 Why widening the CHECK alone is unsafe

- `scope` is free text constrained by `project_party_authority_scope_check` (00624:829, 861-864).
- The INSERT, UPDATE and DELETE policies (00624:1003, 1019, 1045) admit any caller who meets both of these:
  - is an active member of the recorded studio; and
  - is a co-member of the designer (`is_studio_comember`),
  - for **every scope except** `money` and `draw_certify`.
- The table grants SELECT, INSERT, UPDATE and DELETE to `authenticated` (00624:1061).
- So adding `'fabrication'` to the CHECK would let any plain studio member grant, edit or delete fabrication authority through PostgREST.

Three more facts compound this:
- The web writer `useSetPartyAuthority` uses check-then-write and **updates an open grant in place** (`SB/hooks/use-coordination.ts:2096-2140`). A changed figure therefore overwrites its own history, contradicting 00624's "a delegation … is a row, not an edit" (00624:899).
- Its picker iterates `ALL_AUTHORITY_SCOPES` (`DP/components/document/people/directory/add-person-sheet.tsx:2111`).
- Seat close ends every open grant, but its owner/admin gate counts only `money` and `draw_certify` (00634:159-205, specifically :171).

### 2.2 Additive migration (WP-08 lane, wave 3)

**1. Widen the CHECK.** Recreate `project_party_authority_scope_check` with the existing seven values plus `'fabrication'`. All existing rows still pass.

**2. Add columns.** All are nullable, which is legacy-safe:
```sql
ALTER TABLE public.project_party_authority
  ADD COLUMN IF NOT EXISTS ended_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS end_reason      text CHECK (end_reason IS NULL OR end_reason IN
                                             ('revoked', 'expired_by_grant', 'seat_closed', 'superseded')),
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_party_authority_idempotency
  ON public.project_party_authority (engagement_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.project_party_authority ADD CONSTRAINT project_party_authority_fabrication_end_check
  CHECK (scope <> 'fabrication' OR effective_to IS NULL OR end_reason IS NOT NULL) NOT VALID;
ALTER TABLE public.project_party_authority VALIDATE CONSTRAINT project_party_authority_fabrication_end_check;
```

**3. Rewrite the policies.** These are direct-table writes, and the rule is deny by default for `fabrication`.
- Copy the INSERT, UPDATE and DELETE policies (00624:1003-1058) verbatim.
- Graft `AND scope <> 'fabrication'` onto INSERT `WITH CHECK`, UPDATE `USING` and `WITH CHECK`, and DELETE `USING`.
- Leave SELECT (00624:989-997) unchanged. The studio reads fabrication grants exactly as it reads the others, and the client, Field and token readers gain nothing.
- Result: **no** `authenticated` role, owner included, can write a fabrication row through PostgREST. Fabrication rows are written only by the RPCs below.
- Table grants stay as they are (00624:1059-1062), so the other scopes keep working unchanged.

**4. Add an immutability trigger for fabrication rows.** A `BEFORE UPDATE OR DELETE` trigger refuses any change to a `scope='fabrication'` row unless both of these hold:
- the GUC `app.fabrication_authority_write` equals `OLD.id::text`, which only the RPCs set (the `app.plan_room_sheet_maintenance` pattern, 00429:441); and
- the change sets only `effective_to`, `ended_by`, `end_reason` and `updated_at`, once.

So amending a fabrication grant means ending it and inserting a new row. History is never edited.

**5. Rewrite the seat-close trigger.** Copy the head `end_party_authority_at_seat_close()` (00634:159-245) verbatim. Then graft:
- `'fabrication'` into the principal count at 00634:171, so closing a seat that holds fabrication authority needs an owner or admin;
- `ended_by = auth.uid(), end_reason = 'seat_closed'` into the UPDATE at 00634:200-204;
- the same `end_reason` into the backfill-style UPDATE at 00634:268;
- `set_config('app.fabrication_authority_write', …)` around the UPDATE, so the immutability trigger admits the closure.

**6. Add the holder predicate.** Graft from `party_holds_field_authority` (00641:235-256):
```sql
CREATE FUNCTION public.party_holds_fabrication_authority(p_party_id uuid, p_amount_cents integer, p_on date DEFAULT CURRENT_DATE)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_party_authority a
                  WHERE a.engagement_id = p_party_id AND a.scope = 'fabrication'
                    AND NOT a.prepares_only
                    AND a.effective_from <= p_on AND (a.effective_to IS NULL OR a.effective_to >= p_on)
                    AND (a.threshold_cents IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= a.threshold_cents));
$$;
REVOKE ALL ON FUNCTION public.party_holds_fabrication_authority(uuid, integer, date) FROM PUBLIC, anon, authenticated;
```
- It is internal only and is called inside SECURITY DEFINER bodies.
- `prepares_only` grants never instruct (CS3-4, 00624:833-836).

### 2.3 RPCs: request, response and rules

All of these are `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp` and require `auth.uid() IS NOT NULL`.

**`grant_fabrication_authority(p_engagement_id uuid, p_effective_from date, p_effective_to date DEFAULT NULL, p_threshold_cents integer DEFAULT NULL, p_copy_to uuid[] DEFAULT '{}', p_source_clause text DEFAULT NULL, p_idempotency_key text) RETURNS public.project_party_authority`**

- **Lock order:**
  1. Lock `project_parties` row `p_engagement_id` FOR UPDATE. This is the row the 00634 trigger fires from, so a concurrent seat close serialises against the grant.
  2. Read open fabrication rows for the seat FOR UPDATE.
- **Authorization.** The tenant check comes first, exactly as in the 00624 policies:
  - `is_active_studio_member(project_party_recorded_studio(seat))`;
  - `is_studio_comember(project_party_designer(seat))`;
  - `is_org_admin_or_owner(project_party_recorded_studio(seat))`.
  - Otherwise raise `fabrication_authority_forbidden` (42501).
- **Seat must be open:** `stage='active'` and `off_job_at IS NULL`. Otherwise raise `fabrication_authority_seat_closed`.
- **Seat kind:** it must be in the allowed holder set (Q2). Otherwise raise `fabrication_authority_holder_kind`.
- **Idempotency:**
  - Same `(engagement_id, idempotency_key)` with the same arguments returns the original row.
  - Different arguments raise `idempotency_key_reused`.
  - An open fabrication grant already on the seat raises `fabrication_authority_already_open`. The partial unique index enforces this at 00624:901-903.
  - To change a grant, end it and grant again.
- **Records:** `granted_by = auth.uid()`, `copy_to` (validated by the existing trigger, 00624:917-965), and `source_clause`.

**`end_fabrication_authority(p_authority_id uuid, p_effective_to date, p_reason text) RETURNS public.project_party_authority`**

- **Lock order:** the seat row FOR UPDATE, then the authority row FOR UPDATE.
- **Authorization:** the same principal check as the grant.
- **Rules:**
  - `p_reason` must be `revoked` or `superseded`.
  - Sets `effective_to = GREATEST(effective_from, p_effective_to)`, `ended_by`, `end_reason`.
  - Calling it on a row already ended with identical values returns that row, so it is idempotent. Different values raise `fabrication_authority_already_ended`.

**Expiry.**
- A grant created with a future `effective_to` simply lapses. No job writes it.
- Readers evaluate `effective_to` against the date, as `party_holds_field_authority` already does.

### 2.4 Deny-by-default activation

- Both RPCs ship with these grants:
  ```sql
  REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION … TO service_role;
  ```
  `service_role` is there only for fixtures and SQL tests.
- **Activation** is a separate reviewed migration whose only content is `GRANT EXECUTE … TO authenticated`, reviewed under `review-audit-frontier`. There is no runtime flag or settings table: **the grant is the switch.** Rollback is the matching REVOKE.
- While inactive, the policy rewrite already prevents every direct write. So no fabrication row can exist outside service-role fixtures, and every consumer reads "No grant on file."

### 2.5 Actor matrix (SQL suite `supabase/tests/fabrication_authority_test.sql`, owned by WP-08)

| Actor | `grant_` / `end_` RPC (active) | Direct INSERT / UPDATE / DELETE of a fabrication row | Other scopes (regression) |
|---|---|---|---|
| Owner or admin of the recorded studio | allowed | **denied** (RLS) | unchanged (`money` allowed) |
| Plain member of the recorded studio | `fabrication_authority_forbidden` | denied | `selections` still allowed (00624:1003-1016) |
| Guest member | forbidden | denied | denied as today |
| Member of a second studio that shares the designer | forbidden (tenant check first) | denied | denied as today |
| Job client / client_rep | forbidden | denied | denied |
| GC, vendor or installer user | forbidden | denied | denied |
| `anon` | no EXECUTE | no grant | no grant |
| Any `authenticated` caller **while inactive** | `42501 permission denied for function` | denied | unchanged |

Additional cases:
- An expired grant makes `party_holds_fabrication_authority` false.
- A `prepares_only` grant is false.
- An amount over the threshold is false.
- A plain member closing a seat that holds fabrication authority gets `seat_close_money_authority_forbidden`. The error name is kept for compatibility, and the HINT gains the word "fabrication".
- When an owner closes the seat, the row ends with `end_reason='seat_closed'`.
- An UPDATE that bypasses the trigger is refused.
- Two concurrent grants on one seat produce exactly one row.

## 3. The submittal resolver and a fabrication instruction

**What the resolver does today.**
- Head: `_resolve_coordination_item_authorized` (00808:2059; base 00399:4537), which is `SECURITY DEFINER SET search_path = public, pg_temp`.
- Callers: only `resolve_coordination_item` (00399:4799-4855). The core is revoked from every role (00399:4796-4798).
- Lock order: the job label lock `_ffe_lock_job_labels(project)` (00808:85-100), then `client_decisions` FOR UPDATE (00808:2084-2091), then the revision FOR UPDATE (00808:2245-2249).
- Who may resolve:
  - the owner;
  - any active non-guest co-member of an active design studio;
  - the client, but only for `selection` and `signoff` while the item sits in the client court (00808:2108-2128, 2203-2212).
  - It makes **no party-authority check**.
- Submittals: the resolver marks the revision `approved` (00808:2240-2268). Then, **for every kind**, it clears `project_ffe_items.blocked*` where `blocked_by_decision_id = item` (00808:2284-2291) and moves blocked tasks to `todo` (00808:2293-2304).

**Contract.**

1. **Legacy subjects are unchanged.** This contract does not edit `_resolve_coordination_item_authorized`. Every existing submittal, RFI, selection and signoff keeps its current approve → clear holds → unblock behaviour. Regression: the existing coordination suites stay green with no edits.

2. **Approval is evidence, not instruction.** On the new cabinet path (C5, WP-08), approving a shop-drawing submittal revision **never** instructs fabrication. The instruction is its own server act. The record is owned by C5; the gate is defined here:
   ```text
   record_fabrication_instruction(p_package_id uuid, p_manifest_id uuid, p_authorizing_party_id uuid,
                                  p_amount_cents integer, p_evidence jsonb, p_idempotency_key text) RETURNS jsonb
   ```
   It must enforce, in this lock order:
   1. `_ffe_lock_job_labels(project)`.
   2. The package row FOR UPDATE.
   3. The authorizing seat row FOR SHARE.
   4. That seat's open fabrication grant FOR SHARE.
   5. The manifest row FOR SHARE.

   It must also enforce these conditions:
   - **(a)** The manifest (C1 §4) has `purpose='fabrication_instruction'` and belongs to the package.
   - **(b)** Every `coordination_item_revision` member of the manifest is `approved`.
   - **(c)** `party_holds_fabrication_authority(p_authorizing_party_id, p_amount_cents, current_date)`.
   - **(d)** The caller is either:
     - an active studio member recording the instruction, stored as `evidence_status='reported'`; or
     - the authorizing party's own authenticated user, stored as `evidence_status='verified'`. This route stays inactive until the C4/K5 consumer work.
   - **(e)** Idempotency is on `(package_id, idempotency_key)`.

   It ships inactive, with the same REVOKE/GRANT pattern as §2.4.

3. **Holds must not ride the resolver's hold column.** The resolver clears every `blocked_by_decision_id` hold for every kind (00808:2284-2291), so the new path must **not** express a fabrication hold through `project_ffe_items.blocked_by_decision_id`. The fabrication hold lives on the C5 package or instruction record, and only `record_fabrication_instruction`, or an explicit release, moves it. Test: resolving the package's shop-drawing submittal leaves the package un-instructed and its hold in place.

4. **Partial holds (A18).** The hold is per package member (unit). Unaffected units with their own approved evidence and their own instruction proceed. Readiness never equals instruction, and receipt never equals acceptance.

## 4. Audit

There is no separate audit table. The `agent_task_audit` table is reserved for the Agent OS queue.

- A grant row is its own record: `granted_by`, `created_at`, `effective_from`, `source_clause`.
- An ended row adds `ended_by` and `end_reason`.
- Fabrication rows are append-only (§2.2 step 4).
- An instruction stores the actor, the authority row id it relied on, the manifest id and hash, and the evidence status.

## 5. Backfill: unknown stays unknown

- No grant is inferred. A `selections`, `money` or `change_order` grant does **not** imply `fabrication`.
- No historic submittal approval becomes a fabrication instruction.
- Legacy rows keep `ended_by` and `end_reason` NULL, which means "not recorded", never "not ended". Their `effective_to` remains the truth.

## 6. Consumer compatibility

| Consumer | Change |
|---|---|
| Designer web | Add `'fabrication'` to `AuthorityScope` (`SB/hooks/use-coordination.ts:1971-1978`), with label "Instructs fabrication" (`:2002-2010`). Add it to `ADMIN_ONLY_AUTHORITY_SCOPES` (`:1991-1994`). Add a new `RPC_ONLY_AUTHORITY_SCOPES = ['fabrication']`, and exclude it from the picker at `add-person-sheet.tsx:2111`, so `useSetPartyAuthority` never attempts a write that will be denied. `person-profile.tsx:181` already falls back to the raw scope for unknown values |
| Older web build during rollout | Its picker never lists `fabrication`, and the read label falls back to "fabrication". No break |
| Field (Capture) | Selects `id, engagement_id, scope, prepares_only` and never `threshold_cents` (PR-t, `apps/mobile/Capture/Capture/Features/People/SupabasePeopleRoomService.swift:234-240`). An unknown scope prints "fabrication." (`apps/mobile/Capture/CaptureKit/CaptureKit/Work/FieldRosterRules.swift:285-296`). Add `case "fabrication": return "May instruct fabrication."`. Older builds degrade to the default line |
| Client portal / iOS Patina | Neither reads `project_party_authority` (a repository grep finds no match under `apps/client-portal/src` or `apps/mobile/Patina`). No change |

## 7. Open product questions (each with a recommendation)

1. **Who may grant fabrication authority?** Recommend **owner or admin of the recorded studio only**, which is PR-n parity with `money`. Fabrication commits irreversible spend.
2. **Which seats may hold it?**
   - Recommend `client`, `client_rep`, `gc` and `architect`.
   - **Not** `vendor`, `sub`, `installer` or `receiver`: a maker cannot authorize its own fabrication.
   - Studio staff are not seats. A studio principal instructing on its own studio-paid PO stays on the existing PO/milestone rail (00403, `record_custom_commission_milestone`), which this contract does not touch.
3. **What does `threshold_cents` mean for fabrication?** Recommend a cap on the instructed contract amount. NULL means no figure is recorded, and it never means unlimited spend on studio money, because studio-paid spend stays under `money`.
4. **May the studio record an instruction the party gave off-Patina?** Recommend **yes**, as `reported`, with attached evidence and the party's in-force grant. It becomes `verified` only when the party acts authenticated. This mirrors the K5 recommendation for paper consent.
5. **Does reassigning a verifier need authority?** Recommend no. It is a responsibility change recorded with its actor. Verification authorship (`verified_by`) is immutable.
6. **Should the 00624 table writer stop updating grants in place for other scopes too?** Recommend a follow-up ticket: end and re-grant for `money` and `draw_certify` as well. It is out of this contract's scope and is listed so the history gap is not forgotten.
