# C3 — Responsibility, authority and access

**Status:** proposed contract, revised 2026-10-23 after the SQ-1817 frontier review (CHANGES REQUIRED). Re-review pending (`review-audit-frontier`).
**Ticket:** SQ-1812 (WP-00.5a); revision SQ-1849. **Source inspected at:** `0fabcadf2`. Application and database source there is identical to `ee9c450a5` (main). Revision anchors re-checked at `4952624a16d1`.

**Revision 2026-10-23 (SQ-1817).** This file answers findings F4, F5, F6 and F20. Each change is marked inline with its finding id:
- **F4** (§2.2 step 6, §3.2, §7 Q3): the amount is server-derived and nonnegative. An unknown amount always fails closed. There is no caller-supplied amount.
- **F5** (§2.2 steps 2, 2a, 4, 5 and 6, §2.3, §2.5): revocation is a timestamp, separate from the validity end, and takes effect immediately. Finite grants may not overlap, can be revoked early, and end at seat close.
- **F6** (§3.2): every instruction binds the package, manifest, seat, grant, actor, job and recorded studio together.
- **F20** (§2.4, §3.2): revokes are complete for all three roles, with effective-privilege tests. The one shared gate is **`public.assert_fabrication_instruction_authority`** (§3.2). C5's `fabrication_instruction` route calls it, and the C2/C4/C5/C6 revision cites that name.

**Revision 2026-10-23 (SQ-1856, answering the SQ-1851 re-review at `6ac0c5acc47c`).** Marked inline with `SQ-1851 R#`:
- **R2 / F5** (§2.2 step 4, §2.3 revoke): revoking a pending grant clamps `effective_to` so the 00624 window CHECK always holds; `revoked_at` alone denies.
- **R3 / F4** (§3.2 lock order): the gate locks the C5 fulfilment, the source of the amount and the holds, before it derives anything, under one order that every C5 writer also takes.
- **R4 / F8 / F17** (§3.2): the gate itself checks the `scope_editions` capability, the active edition and the package's current responsibilities. Both instruction routes are suspended by C2 deactivation.
- **R5** (§3.2, §3.3): the instructed unit set is passed, validated against the fulfilment's declared units, checked against open holds and frozen on the instruction, in both routes.
- **R17** (§2.3): required parameters precede DEFAULT parameters.
- **R18** (§2.2 step 2): actor retention is compatible with the FK action and with immutability.

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
  ADD COLUMN IF NOT EXISTS revoked_at      timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by        uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,  -- SQ-1851 R18
  ADD COLUMN IF NOT EXISTS end_reason      text CHECK (end_reason IS NULL OR end_reason IN
                                             ('revoked', 'seat_closed', 'superseded')),
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_party_authority_idempotency
  ON public.project_party_authority (engagement_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- SQ-1817 F5: on a fabrication row, revocation and its reason travel together.
ALTER TABLE public.project_party_authority ADD CONSTRAINT project_party_authority_fabrication_end_check
  CHECK (scope <> 'fabrication'
         OR ((revoked_at IS NULL) = (end_reason IS NULL) AND (revoked_at IS NULL) = (ended_by IS NULL)))
  NOT VALID;
ALTER TABLE public.project_party_authority VALIDATE CONSTRAINT project_party_authority_fabrication_end_check;
```

**Actor retention (SQ-1851 R18).** The first revision declared `ended_by … ON DELETE SET NULL`. That action can never run: on a revoked fabrication row the end check above requires `ended_by` to be non-NULL, and the immutability trigger (step 4) refuses the cascaded UPDATE. Deleting the revoker's profile would fail on an error the schema had promised would not occur. The rule is now explicit:
- `ended_by` is `ON DELETE RESTRICT`, the pattern of 00835's `attested_by` (00835:12) and 00412's `signer_user_id` (00412:102). A profile that ended a grant cannot be hard-deleted.
- `granted_by` is the existing column, `ON DELETE SET NULL` (00624:845), and it is shared with every other scope, so this contract does not change its FK. On a `scope='fabrication'` row the immutability trigger refuses the cascaded UPDATE (`fabrication_authority_immutable`), so the profile deletion fails. That is the intended retention for fabrication rows, with the same effect as RESTRICT. Rows of other scopes keep today's SET NULL behaviour.
- So a fabrication grant's actors are never erased. An account that leaves is deactivated, not deleted. The suite asserts both refusals and that rows of other scopes still null out.

**Revision 2026-10-23 (SQ-1817 F5).** The original design ended a grant by setting `effective_to = today` and tested `effective_to >= p_on`. That left a revoked grant usable for the rest of the day. It also gave `effective_to` two meanings, the grant's planned last day and its revocation. The old check `effective_to IS NULL OR end_reason IS NOT NULL` even refused a finite grant at creation. The old `expired_by_grant` reason is dropped, because a planned last day is not an act. Fabrication rows now keep two facts apart:
- **Validity window.** `effective_from` to `effective_to`, inclusive. `effective_to` is the last valid day, as `party_holds_field_authority` reads it (00641:254-255). It is set at grant and is never raised or cleared.
- **Revocation.** `revoked_at`, `ended_by` and `end_reason` together. A non-NULL `revoked_at` makes the row unusable **from that instant**, whatever `effective_to` says.

A fabrication row is **live** on date `d` when `revoked_at IS NULL AND effective_from <= d AND (effective_to IS NULL OR effective_to >= d)`. It is **pending** when it is unrevoked and starts after `d`.

**2a. No overlapping fabrication grants (SQ-1817 F5).**
- The open-grant index (00624:901-903) covers only `effective_to IS NULL`. On its own it lets a finite grant overlap a live open grant or another finite grant.
- No `btree_gist` extension is installed in the repository's migrations. So a `BEFORE INSERT` trigger, `guard_fabrication_grant_overlap()`, enforces the rule for `scope='fabrication'`:
  1. Lock the seat row `project_parties` `FOR UPDATE`.
  2. Refuse with `fabrication_authority_overlap` when any unrevoked fabrication row on the same `engagement_id` has a window that intersects `[NEW.effective_from, COALESCE(NEW.effective_to, 'infinity')]`.
- The trigger also runs for service-role fixtures, so no path can create two live or pending grants on one seat.

**3. Rewrite the policies.** These are direct-table writes, and the rule is deny by default for `fabrication`.
- Copy the INSERT, UPDATE and DELETE policies (00624:1003-1058) verbatim.
- Graft `AND scope <> 'fabrication'` onto INSERT `WITH CHECK`, UPDATE `USING` and `WITH CHECK`, and DELETE `USING`.
- Leave SELECT (00624:989-997) unchanged. The studio reads fabrication grants exactly as it reads the others, and the client, Field and token readers gain nothing.
- Result: **no** `authenticated` role, owner included, can write a fabrication row through PostgREST. Fabrication rows are written only by the RPCs below.
- Table grants stay as they are (00624:1059-1062), so the other scopes keep working unchanged.

**4. Add an immutability trigger for fabrication rows.** A `BEFORE UPDATE OR DELETE` trigger refuses any change to a `scope='fabrication'` row unless both of these hold:
- the GUC `app.fabrication_authority_write` equals `OLD.id::text`, which only the RPCs set (the `app.plan_room_sheet_maintenance` pattern, 00429:441); and
- the change is a revocation (Revision 2026-10-23, SQ-1817 F5). It sets `revoked_at` from NULL to `now()`, sets `ended_by` and `end_reason`, sets `effective_to` to exactly `LEAST(COALESCE(OLD.effective_to, 'infinity'::date), GREATEST(OLD.effective_from, <end date>))` (SQ-1851 R2, below), and touches nothing else except `updated_at`. The end date is `current_date` for `revoke_fabrication_authority` and `NEW.off_job_at` for a seat close. `effective_to` is never raised, never cleared and never set on an unrevoked row. A row can be revoked once. A finite grant can therefore be revoked before its planned last day, which the original "sets only `effective_to` … once" rule did not allow.

So amending a fabrication grant means revoking it and inserting a new row. History is never edited.

**Revision 2026-10-23 (SQ-1851 R2): the window CHECK on a pending revocation.** The existing constraint `project_party_authority_effective_check` requires `effective_to IS NULL OR effective_to >= effective_from` (00624:852-853). The first revision set `effective_to = LEAST(…, current_date)` on revocation. For a pending grant starting tomorrow that is today, below `effective_from`, so the CHECK failed, the revocation rolled back, and the grant still went live tomorrow. The clamp is now `GREATEST(effective_from, end date)`:
- a live grant revoked today ends today, as before;
- a pending grant (starts tomorrow) revoked today gets `effective_to = effective_from`. The window is one day that never opens, because `revoked_at` is set and the holder predicate checks `revoked_at IS NULL` first;
- an open grant gets `effective_to = GREATEST(effective_from, end date)`.
`effective_to` is display only on a revoked row. Denial comes from `revoked_at`, never from the window, so the clamp can never extend authority. The seat-close UPDATE (step 5) already uses this form.

**5. Rewrite the seat-close trigger.** Copy the head `end_party_authority_at_seat_close()` (00634:159-245) verbatim. Then graft:
- `'fabrication'` into the principal count at 00634:171, so closing a seat that holds fabrication authority needs an owner or admin;
- `ended_by = auth.uid(), end_reason = 'seat_closed'` into the UPDATE at 00634:200-204;
- the same `end_reason` into the backfill-style UPDATE at 00634:268;
- `set_config('app.fabrication_authority_write', …)` around the UPDATE, so the immutability trigger admits the closure.

**Revision 2026-10-23 (SQ-1817 F5): finite grants at seat close.**
- The head counts and ends only rows with `effective_to IS NULL` (00634:171-175, 200-205). A fabrication grant with a future `effective_to`, or one that starts in the future, would be skipped by both: it would not trigger the owner/admin gate and would survive the closed seat.
- For `scope='fabrication'`, the graft uses "unrevoked and not yet past its last day", not "open". That is `revoked_at IS NULL AND (effective_to IS NULL OR effective_to >= NEW.off_job_at)`, and it applies in three places:
  - the `v_open` / `v_principal` counts;
  - the owner/admin gate;
  - the UPDATE, which sets `revoked_at = now()`, `ended_by = auth.uid()`, `end_reason = 'seat_closed'` and `effective_to = LEAST(COALESCE(effective_to, 'infinity'), GREATEST(effective_from, NEW.off_job_at))`.
- Rows of other scopes keep the head's exact predicate and UPDATE. This contract does not change their semantics (§7 Q6).
- Independently, the instruction gate (§3.2) re-checks on every call that the seat is open, so a seat-close race can never leave a usable grant.

**6. Add the holder predicate.** Graft from `party_holds_field_authority` (00641:235-256):
```sql
CREATE FUNCTION public.party_holds_fabrication_authority(p_party_id uuid, p_amount_cents bigint, p_on date DEFAULT CURRENT_DATE)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_amount_cents IS NOT NULL AND p_amount_cents >= 0          -- SQ-1817 F4: unknown or negative fails closed
     AND EXISTS (SELECT 1 FROM public.project_party_authority a
                  WHERE a.engagement_id = p_party_id AND a.scope = 'fabrication'
                    AND NOT a.prepares_only
                    AND a.revoked_at IS NULL                          -- SQ-1817 F5: revocation is immediate
                    AND a.effective_from <= p_on AND (a.effective_to IS NULL OR a.effective_to >= p_on)
                    AND (a.threshold_cents IS NULL OR p_amount_cents <= a.threshold_cents));
$$;
REVOKE ALL ON FUNCTION public.party_holds_fabrication_authority(uuid, bigint, date) FROM PUBLIC, anon, authenticated;
```
- It is internal only and is called inside SECURITY DEFINER bodies. No role is granted EXECUTE.
- `prepares_only` grants never instruct (CS3-4, 00624:833-836).
- **Revision 2026-10-23 (SQ-1817 F4).** The original predicate let `p_amount_cents IS NULL` satisfy every finite threshold, and its caller took the amount from the instruction's caller. Now:
  - an unknown (NULL) or negative amount is `false` for **every** grant, including a grant with no threshold;
  - the amount is never a caller argument. Only the shared gate (§3.2) passes it, after deriving it on the server;
  - `bigint` prevents an integer overflow from wrapping a large contract under a cap.
- **Revision 2026-10-23 (SQ-1817 F5).** `revoked_at IS NULL` is part of the predicate. A grant revoked at 10:00 is refused at 10:01 on the same date.
- `party_holds_field_authority` must never be passed `'fabrication'`. Fabrication authority is read only through this predicate, which is the only one that sees `revoked_at`. The suite asserts this with a grep of the migration bodies and of `SB`.

### 2.3 RPCs: request, response and rules

All of these are `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp` and require `auth.uid() IS NOT NULL`.

**`grant_fabrication_authority(p_engagement_id uuid, p_effective_from date, p_idempotency_key text, p_effective_to date DEFAULT NULL, p_threshold_cents integer DEFAULT NULL, p_copy_to uuid[] DEFAULT '{}', p_source_clause text DEFAULT NULL) RETURNS public.project_party_authority`**

- **Parameter order (SQ-1851 R17).** The required `p_idempotency_key` comes before every DEFAULT parameter. PostgreSQL refuses a function whose input parameter follows a defaulted one without its own default, so the first revision's signature could not be created.

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
  - **Revision 2026-10-23 (SQ-1817 F5).** That index covers only `effective_to IS NULL`. Any unrevoked fabrication row whose window intersects the new one raises `fabrication_authority_overlap`, whether it is open, finite or pending (step 2a). The RPC checks this after taking the seat lock, and the trigger checks it again.
  - `p_effective_to`, when given, must be `>= p_effective_from`. Otherwise raise `fabrication_authority_window_invalid`.
  - To change a grant, revoke it and grant again.
- **Records:** `granted_by = auth.uid()`, `copy_to` (validated by the existing trigger, 00624:917-965), and `source_clause`.

**`revoke_fabrication_authority(p_authority_id uuid, p_reason text) RETURNS public.project_party_authority`** (Revision 2026-10-23, SQ-1817 F5; replaces `end_fabrication_authority(p_authority_id, p_effective_to, p_reason)`)

- **Lock order:** the seat row FOR UPDATE, then the authority row FOR UPDATE. This is the same order as the grant and the instruction gate.
- **Authorization:** the same tenant-first principal check as the grant.
- **Rules:**
  - `p_reason` must be `revoked` or `superseded`.
  - The RPC takes no date. Revocation is always "now". It sets `revoked_at = now()`, `ended_by = auth.uid()`, `end_reason = p_reason` and `effective_to = LEAST(COALESCE(effective_to, 'infinity'::date), GREATEST(effective_from, current_date))` (SQ-1851 R2). Authority is refused from the commit onward, not from tomorrow, and the 00624:852-853 CHECK holds for every grant state.
  - It works on open, finite and pending grants. A pending grant, revoked before it starts, never becomes live: its window clamps to `[effective_from, effective_from]` and `revoked_at` denies it.
  - Calling it on a row already revoked with the same reason returns that row, so it is idempotent. A different reason raises `fabrication_authority_already_ended`.
  - A row on a seat in another studio's book raises `fabrication_authority_forbidden`, the same as for the grant.
- A seat close revokes through the trigger (step 5), not through this RPC.

**Expiry.**
- A grant created with a future `effective_to` simply lapses after that day. No job writes it, and it is not a revocation (`end_reason` stays NULL).
- Only `party_holds_fabrication_authority` evaluates fabrication authority. It checks `revoked_at` first and then the inclusive window.

### 2.4 Deny-by-default activation

- Both RPCs (`grant_fabrication_authority`, `revoke_fabrication_authority`) ship with these grants:
  ```sql
  REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION … TO service_role;
  ```
  `service_role` is there only for fixtures and SQL tests.
- **Activation** is a separate reviewed migration whose only content is `GRANT EXECUTE … TO authenticated`, reviewed under `review-audit-frontier`. There is no runtime flag or settings table: **the grant is the switch.** Rollback is the matching REVOKE.
- While inactive, the policy rewrite already prevents every direct write. So no fabrication row can exist outside service-role fixtures, and every consumer reads "No grant on file."

**Revision 2026-10-23 (SQ-1817 F20): the complete revoke set.**
- **Why every function states all three roles.** The stack's default privileges give `anon` and `authenticated` EXECUTE on every function created in `public` (00654:209-214). 00483:258-262 removes only PUBLIC's default. Leaving out a GRANT does not make a function inactive, and an `auth.uid()` guard that denies business effects is not the promised non-callable boundary.

| Function | Ships with | Activation migration grants |
|---|---|---|
| `grant_fabrication_authority` | `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role` | `authenticated` |
| `revoke_fabrication_authority` | the same | `authenticated` |
| `record_fabrication_instruction` (§3.2) | the same | `authenticated`, in its own later migration with C1's `create_evidence_manifest` |
| `assert_fabrication_instruction_authority` (§3.2, the shared gate) | `REVOKE ALL … FROM PUBLIC, anon, authenticated`, with no grant | never. Only SECURITY DEFINER bodies call it |
| `party_holds_fabrication_authority` | the same | never |
| `_fabrication_instructed_amount_cents(p_fulfilment_id uuid)` (§3.2, C5-owned body; SQ-1851 R3 keys it by fulfilment) | the same | never |
| `_external_rail_refusal(p_edition_id uuid, p_package_key text)` (§3.2, C5-owned body; SQ-1851 R4) | the same | never |
| `guard_fabrication_grant_overlap`, the fabrication immutability trigger function | the same | never |
| `end_party_authority_at_seat_close` (rewritten) | the head's own `REVOKE ALL … FROM PUBLIC, anon, authenticated` (00634:209-210), kept | never |

- An activation migration never grants to `anon` or PUBLIC.
- Rollback revokes from `authenticated` only and leaves the ship-time revokes in place.
- **Effective-privilege tests.** These are in the suite, not inferred from the absence of a GRANT line.
  - `has_function_privilege('anon', '<signature>', 'EXECUTE')` is false for every row of the table above, before and after activation.
  - The same check for `authenticated` is false for every row before its activation, and false for the internal rows always.
  - A PUBLIC-only role created in the test transaction also gets false.

### 2.5 Actor matrix (SQL suite `supabase/tests/fabrication_authority_test.sql`, owned by WP-08)

| Actor | `grant_` / `revoke_` RPC (active) | Direct INSERT / UPDATE / DELETE of a fabrication row | Other scopes (regression) |
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
- **Revocation and finite grants (SQ-1817 F5).**
  - **Same-day revoke.** A grant is live at 09:00. It is revoked at 10:00 the same date, and the predicate is false at 10:00:01 with `p_on = current_date`.
  - A finite grant (`effective_to` = today + 30) is revoked early, and the predicate is false immediately.
  - A pending grant (`effective_from` = tomorrow) is revoked. It never becomes live.
  - A second revoke with the same reason returns the row. A different reason raises `fabrication_authority_already_ended`.
  - A direct UPDATE that raises `effective_to`, clears it, or clears `revoked_at` is refused, even under the GUC.
  - A finite grant on days 1–30 plus a new grant on days 20–40, or an open grant, raises `fabrication_authority_overlap`. Days 31–60 is accepted.
  - **Closing a seat that holds a future-expiring grant.** The seat holds `effective_to` = today + 30, and a plain member closes it. That raises `seat_close_money_authority_forbidden`, because the finite grant counts. When an owner closes it, the row gets `revoked_at`, `end_reason='seat_closed'`, and the predicate is false.
  - Closing a seat that holds only a pending grant also revokes that grant.
  - Closing a seat whose fabrication grant already lapsed before `off_job_at` leaves that row untouched.
- **Privileges (SQ-1817 F20).** The `has_function_privilege` matrix of §2.4.

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

2. **Approval is evidence, not instruction.** On the new cabinet path (C5, WP-08), approving a shop-drawing submittal revision **never** instructs fabrication. The instruction is its own server act. The record is owned by C5; the gate is defined here.

   **Revision 2026-10-23 (SQ-1817 F4, F6, F20).** The original `record_fabrication_instruction(…, p_amount_cents integer, …)` is withdrawn, for three reasons:
   - it took the amount from the caller (F4);
   - it never required the seat's job to be the package's job, and its studio branch had no recorded-studio test (F6);
   - C5's generic `fabrication_instruction` event route had no named shared gate to call (F20).

   The gate is now one function that every instruction path calls.

### 3.2 The shared fabrication gate (SQ-1817 F20)

```text
public.assert_fabrication_instruction_authority(
  p_fulfilment_id        uuid,   -- C5 project_external_fulfilments.id (SQ-1851 R3: the source of amount and holds)
  p_manifest_id          uuid,   -- C1 evidence_manifests.id
  p_authorizing_party_id uuid,   -- project_parties.id of the seat that gave the instruction
  p_units                text[]  -- SQ-1851 R5: the units this instruction covers
) RETURNS jsonb
-- {projectId, studioId, scopeEditionId, fulfilmentId, packageKey, packageId, manifestId, manifestHash,
--  partyId, authorityId, amountCents, units, actorId, evidenceStatus: 'reported' | 'verified'}
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
-- REVOKE ALL FROM PUBLIC, anon, authenticated; no grant (§2.4).
```

**Revision 2026-10-23 (SQ-1851 R3, R4, R5).** The `6ac0c5acc` gate took a C1 package id and nothing else. Three things followed:
- **R3.** It read the C5 contract amount and holds without locking them, and C5's ordinary event writers never took the package lock. A verified contract increase or a new hold could commit between the gate's read and the instruction insert.
- **R4.** It checked neither the `scope_editions` capability, nor the active edition, nor the package's current responsibilities. The C3 direct route therefore escaped both the C2 rollback suspension and C5's external-only rule.
- **R5.** It took no unit set, so it could not tell held units from unaffected ones, and C5's route dropped the units it was given.
The gate is now keyed by the C5 fulfilment. That row is the source of the amount and the holds, and it is the row both routes write the instruction against. The gate resolves the C1 package from it through the canonical key (C2 §2.2a).

- **Name and use.** This is the ONE fabrication gate.
  - `record_fabrication_instruction` (C3) calls it.
  - C5's `record_external_fulfilment_event` calls it for `event_kind='fabrication_instruction'`. No other code path may write a fabrication instruction.
  - It raises on any failure and never returns a partial answer.
  - It writes nothing. Its caller writes the record in the same transaction, stamped with the returned `authorityId`, `manifestHash`, `amountCents`, `units`, `actorId` and `evidenceStatus` (§4).
- **Package resolution (C2 §2.2a, §2.4a).** The gate reads the fulfilment's `(project_id, package_key)` and resolves it to the one C1 `project_packages` row with that key. No row, or a C1 row with a NULL key, raises `fabrication_instruction_binding`. Until WP-05 lands C1, every call refuses here.
- **Lock order (SQ-1851 R3).** The gate takes these locks itself, in this order, **before it reads any amount, hold, edition package or grant**. A caller must not lock any of these rows first in a different order.
  1. `_ffe_lock_job_labels(J)` (00808:85-100): `projects` FOR KEY SHARE, then the job label advisory lock. It conflicts with the `projects` FOR UPDATE that the C2 amendment and C5 create/convert paths take first, so an amendment or stale transition serialises with the gate.
  2. The project's `active` `project_scope_editions` row FOR SHARE (none → refuse, below).
  3. **The fulfilment row `p_fulfilment_id` FOR UPDATE.** This is the C5 source-state lock: every C5 mutation that can change the amount or a hold on this fulfilment (`record_external_fulfilment_event` for every kind, `verify_external_fulfilment_event`, `set_ffe_item_external_fulfilment`) takes the same row FOR UPDATE, after the same steps 1–2 (C5 §3.5). A contract increase, a verification or a new hold therefore commits entirely before the gate reads, or waits until the instruction commits.
  4. The C1 package row FOR UPDATE.
  5. The authorizing seat (`project_parties`) row FOR SHARE. This conflicts with the seat-close UPDATE, so a concurrent close serialises.
  6. That seat's live fabrication grant FOR SHARE. This conflicts with `revoke_fabrication_authority`'s FOR UPDATE, so a concurrent revoke serialises.
  7. The manifest row FOR SHARE.
  - **Why this order cannot deadlock.** Every C5 writer takes steps 1, 2 and 3 in that order and never locks a package, seat, grant or manifest. `revoke_fabrication_authority` and seat close take only seat then grant, matching steps 5–6. C1 manifest creation takes `projects` FOR KEY SHARE, the package and members, and never a fulfilment. The instruction insert that follows is a C6 contributing write, so it takes the shared service-obligation lock after all of these row locks (C6 §2.5).
- **Capability and edition (SQ-1851 R4).** After the locks, in this order:
  - `scope_editions` must be enabled (`object_not_in_prerequisite_state`, `scope_editions_inactive`), so C2 deactivation stops both instruction routes even if a grant is restored (C2 §2.8);
  - J must have an `active` edition; a `stale` edition counts as none (`scope_edition_not_active`);
  - the fulfilment's `package_key` must be a package of that active edition (`fabrication_package_not_in_edition`);
  - `public._external_rail_refusal(active_edition_id, package_key)` must return NULL. That helper is C5's external-only rule (C5 §3.4), the one body both C5's mutations and this gate call. It returns the refusal code (`external_rail_studio_buyer`, `external_rail_studio_liability`, `external_rail_payer_unknown`) when the active edition's responsibilities make the studio buyer, payer or contracting party, and the gate raises that code. So an amendment that makes the studio liable stops instruction by either route.
  - the fulfilment's status must not be `cancelled` (`fabrication_fulfilment_cancelled`).
- **Binding: one job, one tenant (SQ-1817 F6).** All of these must hold, or it raises `fabrication_instruction_binding` (42501):
  - `fulfilment.project_id = package.project_id = manifest.project_id = seat.project_id = J`.
  - `manifest.package_id` = the resolved package id, and `manifest.purpose = 'fabrication_instruction'` (C1 §4, now unique per package, SQ-1817 F14).
  - The grant row's `engagement_id = p_authorizing_party_id`.
  - `package.archived_at IS NULL`.
  - `project_recorded_studio(J)` is not NULL. A studio-less job cannot instruct fabrication until its studio is recorded (00624:349-365).
- **Units (SQ-1851 R5).** `p_units` must be non-empty, without duplicates, and a subset of the fulfilment's declared `units` (C5 §3.1). Otherwise raise `fabrication_units_invalid`. The returned `units` is `p_units` sorted, and the caller stores exactly that set on the instruction event, where it is immutable.
- **Seat open on every call (SQ-1817 F5, F6).** The seat must have `stage='active' AND off_job_at IS NULL`. Otherwise raise `fabrication_authority_seat_closed`. Reading the seat row under the lock means a closed seat fails even if its grant row were somehow unrevoked.
- **Server-derived amount (SQ-1817 F4).**
  - `amountCents := public._fabrication_instructed_amount_cents(p_fulfilment_id)`, read after the step-3 fulfilment lock (SQ-1851 R3). This is an internal function whose body C5 owns: the committed contract amount of that fulfilment, in integer cents, read from C5's own record.
  - Its contract: it is SECURITY DEFINER, revoked from every role, takes no caller input except the fulfilment id, and returns NULL when no committed amount is recorded.
  - It never reads `p_evidence`, the URL or any client-supplied figure.
  - Until C5 defines the body, it returns NULL.
  - A NULL amount raises `fabrication_amount_unknown`, and a negative amount raises `fabrication_amount_invalid`. Both fail before the grant is consulted, and both apply to every grant, including one with no threshold.
  - Neither `record_fabrication_instruction` nor C5's event RPC has an amount parameter. An `amountCents` key inside `p_evidence` is stored as reported evidence only, never compared with a threshold.
- **Authority.** `party_holds_fabrication_authority(p_authorizing_party_id, amountCents, current_date)` must be true. The live grant row it relied on is the returned `authorityId`. Otherwise raise `fabrication_authority_insufficient`.
- **Evidence.** Every `coordination_item_revision` member of the manifest is `approved`. Otherwise raise `fabrication_evidence_not_approved`.
- **Actor (SQ-1817 F6).** `actorId := auth.uid()`, which must not be NULL. Then exactly one branch applies:
  - **`reported`.** The actor is an active non-guest member of the recorded studio: `is_active_studio_member(project_recorded_studio(J))`, with `is_studio_comember(projects.designer_id)` as the 00624 narrowing. The caller never supplies the studio, and it is never derived from the caller.
  - **`verified`.** The actor is the authorizing seat's own user (`project_parties.profile_id = auth.uid()`). This branch stays refused (`fabrication_instruction_verified_inactive`) until the C4/K5 consumer work activates it by its own reviewed migration.
  - Anyone else gets `fabrication_authority_forbidden`.
- **Holds (SQ-1851 R5).** Read after the step-3 lock. A unit `u` is held when some `hold` event on the fulfilment lists `u` in its `affected_units` and no `release_hold` event names that hold (C5 §3.5). If any unit in `p_units` is held, raise `fabrication_hold_open`. Units outside every open hold proceed, which is the A18 partial-hold promise.

**`record_fabrication_instruction(p_fulfilment_id uuid, p_manifest_id uuid, p_authorizing_party_id uuid, p_units text[], p_evidence jsonb, p_client_request_id uuid) RETURNS jsonb`** (SQ-1851 R3/R5: keyed by fulfilment, with units)
- Calls the gate first and then inserts the C5 `fabrication_instruction` event on `p_fulfilment_id` from its result, through the same insert C5's route uses, with `affected_units` = the gate's `units`.
- Idempotency is the C5 event key `(fulfilment_id, client_request_id)` (C5 §3.1), with a request hash over `{fulfilmentId, manifestId, authorizingPartyId, units (sorted), evidence}`. The receipt is checked first, before the gate: a replay returns the original event with `replayed: true`, and a changed request raises `idempotency_key_reused`. Both routes share this key, so the same act through the other route replays rather than duplicating.
- It ships inactive, with the same REVOKE/GRANT pattern as §2.4. C2 deactivation revokes it with the C5 mutations, and the gate's capability check refuses it regardless of grants (C2 §2.8, SQ-1851 R4).

**Tests (SQ-1817 F4, F6, F20), all in `fabrication_authority_test.sql`:**
- **Amount.**
  - A NULL derived amount with a 250000-cent grant is refused (`fabrication_amount_unknown`), and the same holds with a no-threshold grant.
  - A negative derived amount raises `fabrication_amount_invalid`.
  - **Understated.** The derived amount is 300000 and `p_evidence.amountCents` is 100000. The gate uses 300000 and refuses under a 250000 grant.
  - Exactly at the threshold is allowed. The threshold plus 1 is refused.
- **Binding.**
  - A grant on a seat of job A, used with a package and manifest of job B, raises `fabrication_instruction_binding`.
  - A manifest bound to another package of the same job raises the same.
  - A `package_issue` manifest raises the same.
  - A studio-less job is refused.
  - A B-only co-member of the designer on job J (studio A) is refused on the `reported` branch.
  - A closed seat is refused even with an unrevoked grant row planted by a service-role fixture.
- **Shared gate.** C5's `record_external_fulfilment_event(…, 'fabrication_instruction', …)` produces the same refusal codes as `record_fabrication_instruction` for each case above. A grep proves no other function writes a fabrication instruction.
- **Concurrency.** A revoke or a seat close committed while an instruction waits on the seat lock causes the instruction to fail.
- **Locked source state (SQ-1851 R3).** Two sessions, both orders:
  - session 1 verifies a `contract_reported` increase from 200000 to 300000 cents on the fulfilment; session 2 instructs under a 250000 grant. Either the verification commits first and the instruction is refused (`fabrication_authority_insufficient`), or the instruction commits first at 200000 and the verification follows. Never an instruction at 200000 after the 300000 verification committed;
  - the same with a `hold` on the instructed unit: the instruction either sees the hold and is refused, or commits before it;
  - no pair raises `40P01`.
- **Capability and responsibilities (SQ-1851 R4).** With `scope_editions` off, or the edition `stale`, both routes refuse, including with `record_fabrication_instruction` re-granted alone. After an amendment makes the package's payer `studio` (only reachable through a reconciliation fixture, C2 §2.5a), both routes refuse `external_rail_studio_liability`. A fulfilment whose key is not in the active edition is refused.
- **Units (SQ-1851 R5).** A hold on unit `k-2`: instructing `{k-1}` succeeds and stores `{k-1}`; `{k-1, k-2}` and `{k-2}` raise `fabrication_hold_open`; after `release_hold`, `{k-2}` succeeds. An empty set, a duplicate, or a unit not declared on the fulfilment raises `fabrication_units_invalid`. The two routes give the same answers.
- **Revocation window (SQ-1851 R2).** Revoking a grant whose `effective_from` is tomorrow succeeds, leaves `effective_to = effective_from`, and the predicate is false on that day. Revoking an open grant and a finite grant also satisfy the 00624 CHECK.
- **Actor retention (SQ-1851 R18).** Deleting the profile in `ended_by` fails on the FK. Deleting the profile in `granted_by` of a fabrication row fails with `fabrication_authority_immutable`. Deleting the granter of a `money` row still nulls `granted_by`.
- **Signature (SQ-1851 R17).** The migration creates `grant_fabrication_authority` and C1's `create_project_package` as written, and the suite calls each with named and with positional required arguments.

### 3.3 Holds (contract items 3 and 4, unchanged)

3. **Holds must not ride the resolver's hold column.** The resolver clears every `blocked_by_decision_id` hold for every kind (00808:2284-2291), so the new path must **not** express a fabrication hold through `project_ffe_items.blocked_by_decision_id`. The fabrication hold lives on the C5 package or instruction record, and only `record_fabrication_instruction`, or an explicit release, moves it. Test: resolving the package's shop-drawing submittal leaves the package un-instructed and its hold in place.

4. **Partial holds (A18).** The hold is per unit. A unit is a key the fulfilment declares in its `units` (C5 §3.1). Every instruction names its unit set, the gate validates it and refuses any held unit, and the set is frozen on the instruction (§3.2, SQ-1851 R5). Unaffected units with their own approved evidence and their own instruction proceed. Readiness never equals instruction, and receipt never equals acceptance.

## 4. Audit

There is no separate audit table. The `agent_task_audit` table is reserved for the Agent OS queue.

- A grant row is its own record: `granted_by`, `created_at`, `effective_from`, `source_clause`.
- A revoked fabrication row adds `revoked_at`, `ended_by` and `end_reason` (SQ-1817 F5). Rows of other scopes keep the head's `effective_to` ending.
- Fabrication rows are append-only (§2.2 step 4).
- An instruction stores the actor, the authority row id it relied on, the manifest id and hash, the server-derived amount the gate compared (SQ-1817 F4), the instructed unit set (SQ-1851 R5), the fulfilment it was written against, and the evidence status.

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
   - **Revision 2026-10-23 (SQ-1817 F4).** Whatever the ruling on a NULL threshold, the *amount* side is settled. It is server-derived, it is nonnegative, and an unknown amount refuses every grant. Only the meaning of a NULL threshold with a known amount remains OPEN. Until a ruling, a NULL-threshold grant admits a known nonnegative amount, as the grant row states.
4. **May the studio record an instruction the party gave off-Patina?** Recommend **yes**, as `reported`, with attached evidence and the party's in-force grant. It becomes `verified` only when the party acts authenticated. This mirrors the K5 recommendation for paper consent.
5. **Does reassigning a verifier need authority?** Recommend no. It is a responsibility change recorded with its actor. Verification authorship (`verified_by`) is immutable.
6. **Should the 00624 table writer stop updating grants in place for other scopes too?** Recommend a follow-up ticket: end and re-grant for `money` and `draw_certify` as well. It is out of this contract's scope and is listed so the history gap is not forgotten.
