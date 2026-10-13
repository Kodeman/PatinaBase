# US-28 S5 — RLS frontier review (SQ-832)

The reviewer was GPT-6 Astra, working read-only. The review was pinned to 638bfe880 and filed as board comment c_mv5su0w8_2db96d.

**Verdict.** Hold production activation until the rollout fix and a ruling on disclosure.

## Findings

| # | Severity / confidence | Finding |
|---|---|---|
| F1 | High / high | **Activating the migration first corrupts own-state on the old client.** 00766 widens table SELECT, but the deployed `useNeedStates` keys rows by `need_key` with no `user_id`. A teammate's row can therefore hide or settle the viewer's line on the Desk (`day-sheet.ts:133-149`) and on Document `handoffReadFor` (`doc/[id]/page.tsx:1042-1045`). Shipping the migration before the portal leaves an incompatible window, and tabs that were already open stay incompatible after the portal ships. |
| F2 | Medium / high | **Access is whole-row, not "facts only".** Any studio member can read a teammate's free-text `waiting_on` and `set_aside_reason`, the deferral dates, and rows that were never acted on. A client-side column filter does not secure this. The policy followed uplift.md:206 literally, so this is a tension in the spec, not a builder error. |
| F3 | Medium / high | **No revocation-negative tests.** The suspension case uses a studio that holds only Leah's own row. There are no cases for a deleted membership, an inactive organisation, or suspension hiding an *existing* teammate row. |

**Checks that found nothing wrong.** Cross-org isolation, the active-seat/active-org helper (00556), the absence of any new write path, idempotency, and dependency order.

The reviewer could not verify the actual pending set on Strata. Ship must inspect it before `db push --include-all`.

## Orchestrator ruling (2026-10-12)

U-Q4 was ruled as "facts only". The projection below honours that ruling literally and closes F1 and F2 together, so it needs no question to Kody.

- **00766 is rewritten.** It has never been applied on Strata. The rewrite does three things:
  - It drops the `studio_need_states_select_studio` table policy, so the table returns to own-row only and the old bundle stays correct through any rollout order.
  - It adds `public.studio_need_state_facts()`, a SECURITY DEFINER, STABLE function with `search_path` pinned. It returns only teammates' **acted** rows (`acted_at IS NOT NULL`, `user_id <> auth.uid()`) in studios where the caller holds an active seat (`is_active_org_member`), with the columns `user_id, organization_id, project_id, need_key, acted_at` and nothing else.
  - EXECUTE is granted to authenticated only.
- **F3:** the SQL tests add revocation negatives against an existing teammate row, covering suspension, membership deletion and an inactive organisation. Own-row retention is asserted separately.
- **S3 hook split (SQ-828):** own rows come from the table with an explicit `.eq('user_id', me)`. Teammates' facts come from the RPC. Both consumers, the Desk and the Document hand-off, read own state only.
- A second frontier pass on the rewrite runs before the integration gate.

## Implementation (SQ-839)

- **Migration.** `supabase/migrations/00766_studio_need_states_select_studio.sql` keeps its name and number. It drops the table policy, adds `public.studio_need_state_facts()` and restores 00765's table comment. EXECUTE is revoked from PUBLIC and anon and granted to authenticated. The file is idempotent: applied twice on local, the second run only skips the policy that is already gone.
- **Tests.**
  - `supabase/tests/need_states/00766_studio_need_states_select_studio_test.sql` asserts the catalog shape: one own-row policy, the five-column result, definer and STABLE, the pinned search_path, and the grants. It covers:
    - the teammate's facts, exactly five keys;
    - no own rows;
    - no unacted rows;
    - free text and dates rejected as columns (42703);
    - the table read of a teammate's rows is 0;
    - cross-studio, guest, never-member and anon;
    - the F3 revocation negatives: suspended seat, deleted membership, inactive organisation, each with a control after rollback;
    - own-row retention through the table;
    - direct writes denied.
  - The 00765 test's own-only assertion is restored to its pre-SQ-818 text.
- **Types.** The function is in `packages/supabase/src/database.types.ts`, which is where the generated types actually live; the ticket named `packages/supabase/src/types/database.ts`. The entry is the package-local CLI 2.77.0 output for this function only. The generator types a RETURNS TABLE column as non-null, so `project_id` reads `string`, but it is NULL for an engagement row with no project. Consumers (SQ-828) must treat it as nullable.
- **For the second pass.** The projection checks the caller's seat and the row's studio, not the row owner's seat. A former teammate's acted facts stay visible to the studio. The ruling does not ask for that check, and none was added.

## Re-review (SQ-840, GPT-6 Astra, pinned 2f6b2f2eb)

**Verdict.** No unresolved defects. SQ-832's F1–F3 are closed:
- The table is own-row only, so the deployed hook and any already-open bundles are safe in any rollout order.
- The RPC returns five columns and acted rows only.
- The revocation negatives are real.

**One low-severity finding.** service_role keeps EXECUTE on the function. The orchestrator accepted this as intended: that role is trusted, already holds ALL on the table, and runs server-side only.

**Carried forward:**
- SQ-828 must treat `project_id` as nullable.
- The ship owner must inspect the actual pending set on Strata before `db push --include-all`.
