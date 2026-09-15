# plan-v2 — the executable plan (hour tracking)

**Supersedes** `architecture.md`. It is `architecture.md` amended by every `program-charter.md` §2 item and every ruled row in `rulings.md`. Where the two disagree, **the ruling wins and the conflict is named inline.**

**Verification basis.** Every `path:line` below was read this session against **`origin/main` @ `2ff00bb2b`** (the integration target), not the local checkout. The local checkout is **stale by 11 migrations** (local head `00580_room_concept_render.sql`; origin head `00591_notification_log_delivery.sql`) and stale in at least one portal file (`command-bar.tsx` local 1175 lines / origin 1224 lines), so **architecture.md's `command-bar.tsx` line cites are wrong** and are re-cited here.

### Corrections to architecture.md's cited facts (verified this session)

| architecture.md says | Verified | Consequence |
|---|---|---|
| `command-bar.tsx:799-810` (Draw an invoice), `:824-836` (in-hand gates), 1175 lines | origin/main: `:811-822` and `:840-847`, **1224 lines** | W3 briefs must use origin numbers |
| `hours-ledger.tsx:275` (`addValid`), `:162` (view read) | `:273` and `:161` | — |
| `?? true` default at `use-time-tracking.ts:320, :467` | only `:320`; `:467` is `if (input.billable !== undefined) row.billable = …` (a conditional assign, not a default) | one deletion, not two |
| `authority-hours.ts:74-88` (silent null) | `:71` (fn), `:80` (`return null`) | — |
| iOS `CaptureKit/Companion/…`, `CaptureKit/Domain/…`, `CaptureKit/Session/…`, `CaptureKit/Persistence/…` | real paths are **`CaptureKit/CaptureKit/…`** (doubled segment) | lane C paths corrected in §7 |
| `SupabaseFieldWriteGateway.swift:65-70` | `insertTimeEntry` at `:69-71` | — |
| existing specs `mobile-timer-sheet.test.tsx`, `document-time-provider.test.tsx` | neither exists. Real: `components/document/__tests__/mobile-sheets.test.tsx`, `hooks/__tests__/use-time-tracking-authority.test.tsx`; **no** provider spec, **no** hours-ledger spec | W3 creates the provider spec rather than extending it |
| risk #6 "a stale `packages/supabase` dist ships a broken bundle — the `proposalTierVisibility` incident class" | `packages/supabase/package.json` `"main": "./src/index.ts"` → **source-resolved, edits are live, no dist hazard**. The incident class belongs to `@patina/utils` / `@patina/types` / `@patina/api-routes` (dist-resolved) | the type-integrity gate (designer/client builds set `ignoreBuildErrors`) is **`pnpm --filter @patina/supabase type-check` + `pnpm --filter @patina/admin-portal build`**, NOT `turbo build --filter=@patina/supabase` — measured in review round 2 (finding n2): `packages/supabase/package.json` has no `build` script, so turbo silently skips it and the "2 successful" it prints are `@patina/types` + `@patina/utils`. §0.24's own hazard, inside the plan's own gate list |
| head migration minted as "`origin/main` head + n", never a literal | charter §3 fixes head `00591` and reserves literal ranges | literals are used below, **provisional until merge** (§11) |

---

## §0 · Binding rules for every lane

> **Numbering amendment (2026-09-11 19:45 UTC).** A concurrent program (people-room CRM, branch `build/people-room-crm-2026-09-11`) holds `00592–00594` on its branch. Every hour-tracking number in this plan has been shifted **+3**: W0 `00595–00597` · W1 `00598–00603` · W2 `00604–00607` · W3 `00608–00609` · W4 `00610–00614` · W5 none (`00615` was reserved here and is now **SPENT BY W2** — see the HT-3-e(2) ruling; W5 mints nothing) · W6 `00616–00617` · W7 `00618–00620` (**`00620` is now SPENT BY W2** — HT-3-g(2)'s one-off legacy stamp, ruled by Kody 2026-09-12; HT-39 is unruled so W7's former use for it never existed). The peer program mints from `00621` upward. Ledger ids: hour tracking uses **R152** and **V11** (the peer holds R151 and V10). Local DB: hour tracking runs on its OWN port-isolated Supabase stack (see the lane briefs for ports); the shared stack on 54322 belongs to the peer — never reset it.

| # | Rule | Evidence / source |
|---|---|---|
| **0.1** | **Additive to `project_time_entries` only** (R4). No new hours table, no second hours surface, no `/hours` route, no admin-portal route, no tab bar, no approval state machine. | R4; HT-8/HT-32; `architecture.md` §12 |
| **0.2** | **Migrations are hand-numbered `NNNNN_slug.sql` from the charter's reserved ranges.** **NEVER `supabase migration new`** (it emits timestamp names). Head is `00591`; first new number is `00595` — the program's whole range was shifted +3 **once**, at mint time, because the peer program holds `00592–00594` (see 0.2a; the line-25 amendment carries the final ranges and every § heading below matches it). Numbers are **provisional until merge** — re-check immediately before every merge and bump the **undeployed** side (filename + internal banner). Note: `origin/main` already carries one imported timestamp-named file (`supabase/migrations/20260910152111_create_contact_messages.sql`) which sorts **after** every `NNNNN_` file — do not "fix" it, and do not copy the pattern. | `patina-db-migrations` steps 1, 8; charter §3 |
| **0.2a** | **Re-check sibling BRANCHES, not only the integration tip.** `git log --all --oneline -- supabase/migrations/` and `git log --all --name-only --oneline -- 'supabase/migrations/005*'` before every merge — an unmerged branch holds numbers the tip cannot show. That is why this program's whole range was shifted **+3 once, at mint time**: the peer people-room CRM program (`build/people-room-crm-2026-09-11`), cut from the same head `00591` the same day, holds `00592–00594`. **Corrected in review round 1 (finding m2):** an earlier revision of this rule claimed the peer had *also* committed `00595_people_cards_affiliations_rules.sql`, `00596_studio_contact_channels.sql` and `00597_studio_channel_consent.sql`, and on that premise demanded a **second** +3 shift. The premise was false. Enumerated across **every** ref (`git fetch --all --prune` then `git ls-tree` per branch): `origin/build/people-room-crm-2026-09-11` (tip `c4ca5b9f1`) holds `00592`, `00593`, `00594` and nothing else; `00595–00597` exist on `hour-tracking/server` alone; `00598–00600` exist on no ref. W0's minted numbers are correct as committed and nothing collides; **W1 mints from `00598`**, and every § heading below matches the line-25 amendment. The lesson stands even though the fact did not: when a renumber IS needed it is **program-wide**, never three files — the filenames, the internal banner numbers, the cross-references in other migrations' comments, the test-file header comments, this plan, and `W0-impl.md`. Re-run the all-branch number check immediately before every merge regardless. A `db reset` from another program's worktree can also leave ITS numbers in the ledger while YOUR objects are absent — so every number claim is bracketed by an **object** probe, never the ledger (§0.3's sibling rule, and §11). | `patina-db-migrations` step 8; observed + corrected 2026-09-11 |
| **0.2b** | **Decision-ledger numbers collide exactly like migration numbers, and an append-only ledger cannot be repaired after the fact.** Before merging any wave that appends to `docs/design/the-document/DECISIONS.md` or `docs/vision/VISION-DECISIONS.md`, re-read the **highest id on every sibling branch**, not only the integration tip, and renumber the **later-shipping** side — entry heading, every in-file cross-reference, the `*Entries add: … last id = …*` footer, and any quoted text that cites the number. Observed 2026-09-11: this program's `R151` and `V10` both collided with people-room's `R151` and `V10` at the identical line numbers. Hour-tracking moved to **`R152`** and **`V11`**; `V11`'s owed `VISION.md` §6 bullet cites `(V11, 2026-09-11)`. Say which side moved, and why, in the merge commit. | observed 2026-09-11 |
| **0.3** | **Every migration carries a banner header** (`-- NNNNN — Title`, lineage for any redefined function, hazard reconciled), is **idempotent** (`CREATE OR REPLACE`, `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), and puts **RLS + policies in the same file as a new table**. | `patina-db-migrations` Quality bar |
| **0.4** | **Redefine from the grep-winner body, verbatim, delta grafted.** Verified heads this session: `classify_project_time_entry_authority` → **`00578:2599-2820`** (lineage `00412 → 00575 → 00578`); `guard_commercial_time_entry_derived_fields` → **`00412:2344-2384`**; `project_unbilled_time` → **`00412:2671-2688`**; `_is_design_services_project` → **`00578:2584`**; `is_studio_comember` → **`00556:51-76`**. Re-run `grep -rln "CREATE OR REPLACE \(VIEW\|FUNCTION\)[^(]*<name>" supabase/migrations/*.sql \| sort \| tail -1` before writing. | `patina-db-migrations` step 2 |
| **0.5** | **No flags anywhere** (P-5). No `useFeatureFlag`, no PostHog gate, no `ComingSoon` fallback for anything in this program. Every "Flag: unconditional" line in architecture.md §1–§8 is deleted, not implemented. **HT-34's "behind a flag that ships off" is satisfied by the dark form defined in §5 (W4), not by a flag** — P-5 wins. | P-5; charter §2 |
| **0.6** | **No backfill of history** (P-4). `architecture.md` §2 `head+8` (the one-off re-rating UPDATE and its pre-flight count) is **deleted**. Invoiced and unbilled history keep their amounts. New entries only. Its reserved number stays unused. | P-4; charter §2 |
| **0.7** | **No client-supplied rate, on any project kind** (HT-1). `hourly_rate_cents`, `rated_amount_cents`, `billing_state`, `rate_source` are server-derived on every branch. This requires **three** edits, not one: (a) the classifier calls the resolver on every branch; (b) `guard_commercial_time_entry_derived_fields`'s non-services early exit at **`00412:2366`** (`IF NOT public._is_design_services_project(OLD.project_id) THEN RETURN NEW`) is removed so the derived-field freeze applies to every project kind; (c) the guard's INSERT branch at **`00412:2358-2364`** stops returning `NEW` unconditionally and rejects a caller-supplied rate/amount/billing_state/rate_source. **This goes beyond architecture.md's "extend the guarded column list" — HT-1 forces it.** **0.7(c) AMENDED, W1 review round 1 (finding W1-R1-12), and the deviation is RATIFIED here rather than inferred from a migration banner: the four names ship as 2 refusals + 2 discards.** `rate_source` and `rated_amount_cents` **raise** on INSERT (both nullable with no default, so a supplied value is detectable). `hourly_rate_cents` is **discarded, not refused** — this wave's own Done-when requires `INSERT … (hourly_rate_cents) VALUES (99999)` to SUCCEED with the resolver's value stored, and a raise would also break any legacy writer still sending one. `billing_state` is **discarded, not refused** — it is `NOT NULL DEFAULT 'authorized'` (`00412:283`), so a caller-supplied `'authorized'` is indistinguishable from the default. "Server-derived" is satisfied either way: the stored value is always the server's. | HT-1; `00412:2358-2366`, `:283`; `00578:2648-2654`; W1-R1-12 |
| **0.8** | **`guard_commercial_time_entry_derived_fields`'s column list is extended, never bypassed — in BOTH places.** The guard is a `BEFORE UPDATE OF` trigger: the watched-column list lives at **`00412:2395-2396`** and the `IS DISTINCT FROM` chain at **`00412:2373-2377`**. A new derived column added to only one of the two is silently unguarded. Same for the classifier trigger's own list at **`00412:2623-2624`** (`BEFORE INSERT OR UPDATE OF project_id, user_id, started_at, duration_minutes, billable, billing_authority_id, authority_rate_id, hourly_rate_cents`) — 00578 redefined the **function** but not the **trigger**, so that list is still 00412's. | verified `00412:2373-2398`, `:2622-2626` |
| **0.9** | **The rollup RPC is SECURITY INVOKER** (HT-38). No DEFINER rollup is written in this program. | HT-38 |
| **0.10** | **`notes` never appears in the rollup's return shape** (HT-36), asserted per role in SQL. Aggregate is the default; free-text notes only behind an explicit detail act that reads the table, not the rollup. | HT-36 |
| **0.11** | **One running-timer slot, and it stays with the desk** (HT-7). The unique index is **per user, globally**: `uniq_project_time_entries_running_timer ON project_time_entries(user_id) WHERE duration_minutes IS NULL` — verified at **`00177:37-41`**. No Field, widget or intent surface may write a `duration_minutes IS NULL` row. Field's Swift type already forbids it (`FieldVisitCloseRecord.swift:121` — "`durationMinutes` is NOT Optional, and that is the whole point"; `:33` defaults to 1). | HT-7; `00177:37-41`; `FieldVisitCloseRecord.swift:33,121` |
| **0.12** | **The invoiced-entry lock is untouched.** `guard_invoiced_time_entry` (**`00177:51-84`**) forbids DELETE of an invoiced row and freezes `project_id, phase_key, task_id, user_id, started_at, duration_minutes, billable, hourly_rate_cents` once `invoice_id` is set. No wave weakens it, re-creates it, or routes around it. It is also what makes HT-13's "any date, **until the entry is invoiced**" already true — no DB work for that half of the ruling. | HT-13; `00177:51-84` |
| **0.13** | **Never key an RLS policy on `projects.studio_id`** — `00317:15-18` refuses it by design (legacy rows leave it NULL). Studio scope goes through `is_studio_comember(projects.designer_id)` (`00556:51-76`) or `is_active_studio_member(<org>)` (`00417:40-55`). The new `project_time_entries.studio_id` (W4) is a **trigger-validated own column**, not `projects.studio_id`, and may be a policy key only because W4's `00611` guard replicates `00317:31-47`'s anti-aiming assert. | `00317:15-18,31-47` |
| **0.14** | **`is_org_admin_or_owner(_organization_id, _user_id DEFAULT auth.uid())` is the only owner/admin helper this program calls** — `00484:604-623`, SECURITY DEFINER, `SET search_path = pg_catalog, pg_temp`, caller assert `_user_id IS NOT DISTINCT FROM auth.uid()`. **`user_is_org_member` (`00021:484-487`) gets no new call sites.** | FS-19; `00484:604-623` |
| **0.15** | **The column is `organization_members.role` of type `member_role`** (`00021:136`, type `00021:22-24` = `owner/admin/member/guest`). Not `member_role` as a column name. A policy written otherwise will not compile. | `00021:22-24,136` |
| **0.16** | **Every new SECURITY DEFINER function follows the 00484 contract**: `SET search_path`, a caller assert where it takes a user-supplied scope, `REVOKE EXECUTE … FROM PUBLIC, anon` **and** an explicit `GRANT EXECUTE … TO authenticated`. Schema-qualify extension functions (`extensions.<fn>`) — prod `db push` search_path lacks `extensions` (42883, the 00282 incident). | `00484`; `patina-db-migrations` Quality bar |
| **0.17** | **The 00177/00484 "Team can …" policy quartet is immutable.** `00484:1712-1760` registers the four policies — `Team can delete their own time entries` (`d`), `Team can log their own time entries` (`a`), `Team can update their own time entries` (`w`), `Team can view their project time entries` (`r`) — and **raises `'00484 protected RLS policy …'` if any is missing or reshaped.** **CORRECTION (measured against a clean reset, `pg_policies`, 2026-09-11):** only the delete/update/insert three carry `((user_id = auth.uid()) AND is_project_team_member(project_id))`. The **SELECT** policy's live qual is **`is_project_team_member(project_id)` alone — no `user_id` leg.** Two consequences the W2 brief must state outright: (a) **HT-10-a is a real narrowing, not a tidy** — a rostered member today reads *every* row of a project they are rostered to, notes included, so scoping the per-row read to OWN rows changes behaviour and the `project_hours_total(p_project_id)` DEFINER function is what gives them their project total back; (b) `claim_time_entries` inherits `Team can update their own time entries`' `user_id = auth.uid()` leg, so **an owner composing an invoice still cannot claim a teammate's hours** — pre-existing, and closed by HT-22's W2 write widening (`time_entries_owner_admin_update`), which must therefore land before the composer is trusted with a mixed-author claim. Every policy this program adds is a **new name**; none of the four is dropped, renamed or re-qualified. (Mechanically a later migration *could* drop one without tripping 00484, because 00484's assert runs at its own replay point — but doing so silently voids a signed authorization contract. Don't.) | verified `00484:1712-1760` |
| **0.18** | **`audit_logs` has RLS enabled with no INSERT policy** — `00021:261` enables RLS; the only policies are two SELECTs (`00021:423`, `:426`). The one existing writer is inside a SECURITY DEFINER RPC (`00399:468-476`). **Therefore W2's audit trigger must be SECURITY DEFINER**, or the admin's adjust fails on the audit insert and rolls back the whole UPDATE. architecture.md §3 does not say this. | `00021:261,423,426`; `00399:468-476` |
| **0.19** | **Generated types are regenerated after every migration wave.** `pnpm db:generate` → `packages/supabase/src/database.types.ts`; proof is `git diff --exit-code packages/supabase/src/database.types.ts` (clean = in sync). Never hand-edit. | `patina-db-migrations` step 5 |
| **0.20** | **Any migration containing a top-level `GRANT` or `REVOKE` must regenerate the ACL seed**: `python3 scripts/generate-legacy-grants.py` → `supabase/seed/00-legacy-grants.sql`, committed with the migration. Never hand-edit it. **The rule is the grep, not a list** — `grep -lE '^\s*(GRANT|REVOKE)' supabase/migrations/006*.sql` before every wave's commit. On this program's current numbering that is `00595, 00597, 00598, 00599, 00607, 00608, 00614, 00618` — **`00597` was missing from the earlier fixed list** (it carries `REVOKE ALL ON FUNCTION public.time_entry_auto_roster() FROM PUBLIC, anon, authenticated, service_role`; W0 regenerated anyway, so the branch is correct, and the seed does carry that statement under an `00597` comment). Corrected in review round 2 (finding m4): a later wave that trusts a fixed list will skip a regeneration it owes. **ALWAYS INVOKE THE WORKTREE'S OWN COPY** — `python3 ./scripts/generate-legacy-grants.py` from the lane's `--workdir`, never the absolute main-checkout path. The script resolves the repo root from its own location, so the main checkout's copy rewrites the MAIN checkout's seed and reports that checkout's statement count; the hazard is silent in the dangerous direction, because the agent then sees a CLEAN `git diff` there and concludes the worktree's seed is regenerated when it is not (W2 review round 10, finding W2-R10-06 — measured: 2572 statements from the main copy against 2630 from the worktree's). | `patina-db-migrations` step 4 |
| **0.21** | **Hooks that move to `packages/supabase` keep their names.** `useCreateTimeEntry`, `useUpdateTimeEntry`, `useDeleteTimeEntry`, `useRunningTimer`, `useStartTimer`, `useStopTimer`, `useDiscardTimer`, `useClaimTimeEntries`, `useUnbilledTime`, `filterProjectUnbilledEntries`, `fetchTimeSummary` keep their exported identifiers and are re-exported from `packages/supabase/src/hooks/index.ts` and the package index. No rename, no default export, no barrel-only alias. | `architecture.md` §1; verified export list at `use-time-tracking.ts:86,118,150,271,300,351,372,405,447,509,557,595,634,689,791` |
| **0.22** | **The zero-tap in-document path is not regressed by any wave.** The entry is written before the strip appears and persists if ignored (`log-strip.tsx:11-12`); the stop payload at `document-time-provider.tsx:283-290` carries no required field. No wave adds a required field to it. | R20; FS-27/CR-28 |
| **0.23** | **Totals sit above the rows that produced them** (HT-30). A total with no rows beneath it is a dashboard and is refused. | HT-30 |
| **0.24** | **Gate discipline.** The real gate per target is the `patina-verification` matrix, not a script name — `turbo` silently skips workspaces with no such script, and designer/client `next.config` set `typescript.ignoreBuildErrors: true` (so their build does **not** type-check; `pnpm --filter <app> type-check` is the gate). `admin-portal` has no `typescript` block → its **build enforces types** and is the mandatory gate after any `packages/*` edit. Every designer-portal render check runs `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` — the mock fallback serves mock data on **any** thrown error, including an RLS denial, so a silently-denied scope lens renders plausible numbers. | `patina-verification`; `patina-portal-features` |
| **0.25** | **Worktrees, one per lane**, named `.codex/worktrees/agent-<id>` (the `agent-` prefix is what `.gitignore` covers). `Secrets.swift` does not follow `git worktree add` — lane C copies it from `Secrets.example.swift` before its first build. Never `git add -A`; stage explicit pathspecs. Worktrees retired at task end. | `patina-parallel-work`; `patina-ios-verification` step 4 |

---

> **HT-10-a (ruled 2026-09-11, after this plan was written).** The rostered per-row read policy (00484-registered) is narrowed to OWN rows; rostered members get project totals from ONE small SECURITY DEFINER function `project_hours_total(p_project_id uuid) → (minutes, billable_minutes, amount_cents)` that asserts `is_project_team_member(p_project_id)` first, is REVOKEd from PUBLIC and GRANTed to authenticated, and is tested per role (owner · rostered member · non-member). The studio rollup stays SECURITY INVOKER. Lane A, W2. Lane B's project lens for a plain member reads this function, not the ledger view.

## §1 · W0 — The live money bugs, the source vocabulary, the roster seat, one hook module

| | |
|---|---|
| **Lane** | **A (Opus)** — worktree `.codex/worktrees/agent-server`, branch `hour-tracking/w0-money-bugs` |
| **Depends on** | nothing. Runs **alone**; nothing forks until it merges (it moves the hook module every later wave edits) |
| **Ruled inputs** | HT-5, HT-6 (unopposed), **HT-25** (auto-roster — placed here, see below), HT-30 / HT-32 / HT-33 (governance entries, §9) |

**Goal.** Stop the two silent money defects, buy the `source` vocabulary once, seat the un-rostered logger, and land the one canonical hook module — before anything is built on top.

### Migrations (00595–00597)

| # | Slug | What it does |
|---|---|---|
| **00595** | `time_entry_claim_and_source.sql` | `public.claim_time_entries(p_invoice_id uuid, p_entry_ids uuid[])` (atomic claim, replaces the client-side claim + its invoice-wide detach at `use-time-tracking.ts:617-619`); widens `project_time_entries_source_ck` **by name** (`00545:147-149`, already named — no archaeology) from `('timer_auto','timer_manual','manual_entry','field_visit')` to add `'command_bar'`, `'field_manual'`, `'internal'` and the reserved `'widget'`, `'intent'` |
| **00596** | `project_unbilled_time_repair.sql` | Redefines `public.project_unbilled_time` **keeping the name** (grafted from `00412:2671-2688`): the `public.profiles` join at `00412:2685` is **dropped outright** — it selects no column and can filter nothing, so an outer join would leave a row-dropping shape for a later hand to re-tighten; the postcondition asserts the viewdef contains **no** `JOIN profiles` at all and **keeps** the `projects` join, which is the `project_id IS NULL` filter W4 depends on (the `00555:3024-3026` row-dropping hazard under `security_invoker = true`, `00412:2672`); **one rate source** — `resolved_rate_cents` stops reading the `change_order_terms → profiles.default_hourly_rate_cents → 0` chain (`00412:2675-2678`) and reports the same basis `amount_cents` uses (`00412:2679-2681`), so the rate printed is the rate that priced the line |
| **00597** | `time_entry_auto_roster.sql` | **HT-25.** `BEFORE INSERT ON project_time_entries` trigger, **SECURITY DEFINER** (`SET search_path = public, pg_temp`, `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` per the `00412:2385-2386` precedent): when `NEW.project_id IS NOT NULL` and no live `project_team_members` row exists for `(NEW.project_id, NEW.user_id)` with `removed_at IS NULL`, insert one with `role = 'support_designer'`, `assigned_by = NEW.user_id`. **The project's OWN designer is excluded by an early exit** — `is_studio_comember`'s first branch is `p_owner = auth.uid()` (`00556:59`), so a solo designer logging on her own project would otherwise be seated as a *support designer* on her own house and listed that way on `v_project_roster` (`00419`) and the Call Sheet; the seat buys nothing, since the classifier already hard-codes `lead_designer` for the project designer (`00578:2708-2710`) and her RLS comes from `Designers manage their project time entries` (`00177:136-137`), not from `is_project_team_member`. Seating her at all is a ruling, not a code choice, and would have to be `lead_designer`. Fires **before** `aac_classify_project_time_entry_authority_trg` — trigger name `aaa0_time_entry_auto_roster_trg` so alphabetical BEFORE-trigger order puts it ahead of 00412's `aaa_`/`aab_`/`aac_` family. Removable by the owner through the existing roster UI (`project_team_members.removed_at`) |

> **`00596` is NOT a pure repair, and must not be pushed to Strata ahead of W1's resolver** (review round 2, finding B1; owed ruling **HT-6-a**). It is a repair for authority-rated rows and a **write-down** for legacy rate-less ones: an un-invoiced, authorized, billable entry with no `hourly_rate_cents` on a project carrying `change_order_terms.hourly_rate_cents` went from `resolved_rate=17500 amount=35000` to `0 / 0`, and the invoice composer will then bill and invoice-lock it at $0. P-3 (one ship at the end, after W7) already forbids shipping it early — this note is so nobody reasons past P-3 on the premise that W0 is "just the bug fixes". Strata exposure measured read-only 2026-09-11: **1 row, $175.00, on a test project** (details in `rulings.md` → HT-6-a). Rule HT-6-a before the deploy.

**Why HT-25 is W0, not W3** (charter §2 left the wave to the architect):

- The roster role is a **rate-resolution input**, not only an RLS gate: the classifier reads `project_team_members.role` at **`00578:2709-2717`** (`count(DISTINCT member.role) = 1`), and an un-rostered member yields `v_team_role = NULL` → `v_normalized_role = ''` → the role branch at `00578:2724` is skipped entirely. W1's resolver tests cannot assert the new-hire case without the seat existing.
- It writes to **`project_team_members`**, a 00484-protected relation whose only registered policy is a SELECT (`00484:780-781`) — there is no INSERT policy letting a member seat themselves, so it **must** be a server-side DEFINER trigger. That is lane A work; putting it in lane B (portal, W3) would split ownership of roster writes across lanes.
- Stage 1 is the only stage where a new BEFORE trigger on `project_time_entries` lands without contending with W1's/W4's concurrent classifier and guard edits.
- The RLS gap HT-25 was written against is **narrower than FS-17 stated**: `time_entries_studio_insert_own` (`00316:242-246`) already admits any active non-guest studio co-member inserting on a project whose `designer_id` is a studio co-member. The un-rostered block bites only non-co-member roster vendors/bookkeepers. The trigger is therefore justified by the rate path, and W3's ⌘K project list is **not** restricted to rostered projects.

**RLS changes:** none. No new policy, no policy dropped. (`time_entries_studio_read` at `00316:237-240` already grants every active non-guest studio co-member SELECT on every studio entry — the briefing's "No studio-admin policy" and OPS-5 are refuted; HT-10's narrowing is W2's 00606.)

### RPC / function signatures

```sql
CREATE OR REPLACE FUNCTION public.claim_time_entries(
  p_invoice_id uuid,
  p_entry_ids  uuid[]
) RETURNS SETOF uuid
LANGUAGE sql
SECURITY INVOKER            -- RLS is the authorization spine; no DEFINER, no assert needed
SET search_path = public, pg_temp
AS $$
  UPDATE public.project_time_entries
     SET invoice_id = p_invoice_id
   WHERE id = ANY(p_entry_ids)
     AND invoice_id IS NULL
     AND billable
     AND duration_minutes IS NOT NULL   -- never claim a RUNNING timer
     AND (billing_state = 'authorized' OR billing_state IS NULL)
  RETURNING id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) TO authenticated;
```

- One statement. Partial match is detected **by the caller counting returned ids** and rolling the transaction back — never by a compensating UPDATE. `00412:2653-2657`'s `aad_guard_time_entry_invoice_authority_trg` still fires per row — it, not this RPC, is what validates `p_invoice_id` (draft, same project), so the unvalidated-looking argument is not a hole.
- **`duration_minutes IS NOT NULL` is load-bearing.** A running timer on a non-services project is `billable` with `billing_state = 'authorized'` (`00578:2648-2650`), so without that leg the RPC can invoice a RUNNING row; the invoiced lock (`00177:51-84`) then freezes `duration_minutes` — the timer can neither be stopped nor discarded — while `uniq_project_time_entries_running_timer` (`00177:37-41`) ignores `invoice_id`, so the member can never start another timer (§0.11). No shipped caller reaches it today (the composer's ids come from `project_unbilled_time`, which filters completed rows), so this closes a hole on a newly-exposed authenticated surface.

```sql
CREATE OR REPLACE FUNCTION public.time_entry_auto_roster()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ … $$;
REVOKE ALL ON FUNCTION public.time_entry_auto_roster()
  FROM PUBLIC, anon, authenticated, service_role;
```

### Portal files

| File | Change |
|---|---|
| `apps/designer-portal/src/hooks/use-time-tracking.ts` → **`packages/supabase/src/hooks/use-time-tracking.ts`** | Move whole module; re-export from `packages/supabase/src/hooks/index.ts` and the package index. Names unchanged (§0.21). `@patina/supabase` is **source-resolved** (`"main": "./src/index.ts"`) — no dist rebuild needed for the portal to see it |
| **Keep app-local** (CR-28) | `apps/designer-portal/src/hooks/document-time-provider.tsx`, `src/lib/document/time-derivation.ts`, `src/lib/document/authority-hours.ts` — document-coupled |
| `packages/supabase/src/hooks/use-time-tracking.ts` — `useClaimTimeEntries` (`:595-631`) | `rpc('claim_time_entries', { p_invoice_id, p_entry_ids })`; compare returned length to `entryIds.length`; **delete the compensating detach at `:617-619`** |
| same file | **Delete** `useTimeEntries` (`:118`); **delete the `useTimeSummary` hook wrapper only** (`:271`) — `fetchTimeSummary` stays (live caller `apps/designer-portal/src/hooks/use-projects.ts:481`); **delete** `useReleaseTimeEntries` (`:634-651`); **delete** the stale section comment at `:653` ("the Hours book — `/desk?book=hours`") |
| Callers to repoint | `apps/designer-portal/src/components/document/hours-ledger.tsx:161-171` (the `project_unbilled_time` read — name unchanged, so this is an import repoint only); `apps/designer-portal/src/components/document/accounts/invoice-composer.tsx` (claim call site — `claimTime.mutateAsync` at `:393`, the compensating `deleteDraft` at `:400`). **Path corrected in review round 1 (finding N4): there is no `invoice-composer.tsx` under `overlays/`.** |

**iOS:** none. **Edge/cron:** none. **PostHog:** none (the set starts in W1 — lane D, §2).

### Tests to write

| Path | Assertions |
|---|---|
| `supabase/tests/billing/time_claim_atomicity_test.sql` (new) | A partial-claim conflict leaves every pre-existing `invoice_id` intact (the pre-`00595` detach bug: nothing is detached); `claim_time_entries` is idempotent on an already-claimed id (returns nothing, stamps nothing); an invoiced row cannot be re-claimed to a second invoice; **(d)** a RUNNING timer is never claimed, with the billable + `billing_state` precondition asserted first so the exclusion is provably the duration leg |
| `supabase/tests/billing/time_unbilled_view_repair_test.sql` (new) | A roster `vendor` who is **not** an organization member appears in `project_unbilled_time` (the dropped-profiles-join payoff); `resolved_rate_cents × duration` reconciles with `amount_cents` on the same row for every fixture (one rate source). Plus, from review round 2: **(c5)** the reconciliation sweep run a second time as the *services* studio's designer — `security_invoker` narrows case (b1)'s sweep to one studio, so it was never the "every row" guard its message claimed (finding m3) — with a companion assert that it saw ≥ 1 row; **(d)** the LEGACY RATE-LESS arm, pinning the `0 / 0` write-down and naming the pre-`00596` figures in its assert messages (finding B1, owed ruling **HT-6-a**) |
| `supabase/tests/rls/time_entry_auto_roster_test.sql` (new) | Per role: an active non-guest studio co-member logging on an un-rostered project gets exactly **one** `project_team_members` row with `role='support_designer'`; a second entry adds none; a member already rostered as `lead_designer` is **not** re-seated or downgraded; a row whose `removed_at` was set by the owner is re-seated on the next log (stated behaviour, asserted so it is a decision and not a surprise — and recorded as owed ruling **HT-25-a**, not left inside a test comment); **(i)** added in review round 2 (finding m2) — when the removed seat was **not** `support_designer`, the re-seat cannot reuse it (`ON CONFLICT` keys on the role triple), so a live `support_designer` row is added **beside** the tombstone and becomes the classifier's rate role: asserted as two rows, the tombstone intact, the live role `support_designer`, and exactly one live role; a cross-studio non-member is still refused by the INSERT policies and seats nobody; **(f)** the project's own designer logging on her own project seats **nobody** and returns **no `team` row** from `v_project_roster`; **(g)** a **structural** assert — `pg_proc.prosrc LIKE '%is_studio_comember%'` and `'%designer_id%'` for `time_entry_auto_roster` — because case (e) passes with or without the co-membership gate (a failed INSERT rolls the seat back either way), so without (g) a future edit deleting the gate goes green |
| existing, must stay green **unchanged** | `supabase/tests/commercial/design_services_authority_test.sql:221,349,362` (three `project_unbilled_time` asserts); `supabase/tests/rls/project_roster_test.sql`; `supabase/tests/field/time_entry_field_visit_source_test.sql` |

### Gate commands (verbatim)

```
pnpm supabase:reset
python3 scripts/generate-legacy-grants.py
scripts/run-sql-tests.sh -d supabase/tests/billing
scripts/run-sql-tests.sh -d supabase/tests/commercial
scripts/run-sql-tests.sh -d supabase/tests/rls
scripts/run-sql-tests.sh -d supabase/tests/field
pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts
# `pnpm turbo build --filter=@patina/supabase` REMOVED — measured no-op (finding n2):
# packages/supabase has no build script, so turbo skips it. The real gate is the next line.
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test
pnpm --filter @patina/admin-portal build
```

### Done-when (observable)

- `SELECT` after a deliberately conflicting two-tab claim: the invoice's pre-existing entries still carry their `invoice_id`.
- A `SELECT` of `project_unbilled_time` as the owner includes an entry authored by a roster vendor who is not an org member.
- On any one row of `project_unbilled_time`: `round(duration_minutes/60.0 * resolved_rate_cents) = amount_cents`.
- `SELECT source FROM information_schema` / `pg_constraint`: `project_time_entries_source_ck` admits all nine values.
- A logged entry on an un-rostered project leaves exactly one `support_designer` row in `project_team_members` — **and the project's own designer's entry leaves none** (`SELECT` on `project_team_members` and on `v_project_roster`).
- `grep -rn "useTimeEntries\|useReleaseTimeEntries" apps packages` returns nothing.
- The three governance entries (§9) are committed with dates.

---

## §2 · W1 — Rate truth: the server owns the rate, the rate lives on the studio settings page

| | |
|---|---|
| **Lane** | **A (Opus)** for DB; **B (Sonnet)** for the settings page + row rendering. Worktrees `agent-server` / `agent-portal`, branch `hour-tracking/w1-rate-truth` |
| **Depends on** | W0 (the view repair — the rate the resolver produces must be the rate the view prints; and the roster seat the classifier reads) |
| **Ruled inputs** | **HT-1**, HT-2 *(unruled — see below)*, **HT-3**, **HT-41**, HT-12, HT-26, **P-4** |

**Goal.** One server-owned answer for what an hour is worth on every project kind, the role the member picked recorded on the row, and a place to set a studio rate.

### Amendments the rulings force

| Ruling | architecture.md said | plan-v2 does | Conflict named |
|---|---|---|---|
| **HT-3** | the rate card lives in the People Room — `people/views/person-profile.tsx` + new `people/profile/studio-rate-card.tsx` | **NOT the People Room.** A studio settings page | **the ruling wins.** Those two files are not touched for the rate |
| **HT-3** (parenthetical "extend `/preferences` or a sibling page") | — | **the sibling page: `components/document/account/account-studio-page.tsx`** (`/desk?account=studio`, 1640 lines), which already carries the member roster with owner/admin-gated role changes and a `rateCard` shape at `:83`. **Not `/preferences`** — `apps/designer-portal/src/app/preferences/page.tsx:10-20` documents itself as the deliberately shell-less page that must render for **signed-out** recipients arriving from an email footer with `?token=`; a studio rate table has no business there | an **architect choice** against the ruling's parenthetical, on the ruling's own "studio settings page, owner/admin only" requirement. Flagged in the report |
| **HT-41** | — | the member **picks** the roster role per entry when they hold more than one; the row records it | new column `rate_role` — see below |
| **P-4** | `head+8` one-off backfill + pre-flight count | **deleted.** `00602` left unused | charter §2 |
| **HT-1** | extend the guarded column list | **also** remove the guard's non-services early exit and harden its INSERT branch (§0.7) | the ruling wins |
| **HT-2** | cut both legacy legs | **HT-2 is UNRULED** (`rulings.md` row 8 has an empty Ruling cell). HT-1's ruled text — *"Non-services projects lose the legacy change-order leg"* — settles `change_order_terms` only. So: **`change_order_terms->>'hourly_rate_cents'` is cut** (ruled, via HT-1); **`profiles.default_hourly_rate_cents` is removed as a resolver leg but the column is not dropped** and `rate_source` reserves the value `'profile_default'` in its CHECK so LEAH-23's tier 3 can be restored by one resolver branch with no migration. Stated, not assumed | **architect choice forced by an unruled row.** Flagged in the report |

### Migrations (00598–00603)

| # | Slug | What it does |
|---|---|---|
| **00598** | `studio_member_rates.sql` | `public.studio_member_rates(id uuid pk, studio_id uuid → organizations, user_id uuid → profiles, hourly_rate_cents integer not null check (> 0), effective_from date not null, effective_to date, created_by uuid → profiles, created_at timestamptz)`. Append-only; `BEFORE INSERT` trigger closes the prior open row (`effective_to := NEW.effective_from - 1`). `UNIQUE (studio_id, user_id, effective_from)`. **RLS enabled in this file** + **three** policies (below: SELECT, INSERT, UPDATE — there is deliberately NO DELETE policy, and the shipped migration asserts `count(*) = 3`) + explicit grants |
| **00599** | `resolve_time_rate_cents.sql` | `public.resolve_time_rate_cents(...)` — the single rate resolver (signature below) |
| **00600** | `time_entry_rate_provenance.sql` | `ADD COLUMN IF NOT EXISTS rate_source text CHECK (rate_source IS NULL OR rate_source IN ('authority','studio_member','profile_default','none'))`; `ADD COLUMN IF NOT EXISTS rate_role text CHECK (rate_role IS NULL OR rate_role IN ('lead_designer','support_designer','bookkeeper','vendor'))` (HT-41; the roster value set is a **TEXT CHECK**, not a Postgres enum — `00084:164-165`, whose set also includes `'client'`, deliberately excluded). Redefines `guard_commercial_time_entry_derived_fields` grafted from `00412:2344-2384`: adds `rate_source` and `rate_role` to the `IS DISTINCT FROM` chain (`00412:2373-2377`), **removes the non-services early exit** (`00412:2366`), **hardens the INSERT branch** (`00412:2358-2364`) to reject caller-supplied `hourly_rate_cents` / `rated_amount_cents` / `billing_state` / `rate_source` while still admitting `rate_role` as the member's role pick. Re-creates `aab_guard_commercial_time_entry_derived_fields_trg` with `rate_source, rate_role` added to the `BEFORE UPDATE OF` list (`00412:2395-2396`), and `aac_classify_project_time_entry_authority_trg` with `rate_role` added to its list (`00412:2623-2624`) |
| **00601** | `classifier_rate_resolver.sql` | Redefines `classify_project_time_entry_authority` **grafted verbatim from `00578:2599-2820`**, lineage `00412 → 00575 → 00578 → 00601`. All three immutability raises kept **verbatim**: `00578:2620-2627`, `:2679-2682`, `:2765-2771`'s sibling. Calls the resolver and owns `hourly_rate_cents`, `rated_amount_cents`, `rate_source` on **every** branch — including the three 00578 leaves unowned: the non-services early branch `00578:2648-2654`; the no-authority-covering-`started_at` branch `00578:2694-2700` (which today leaves the caller's `hourly_rate_cents` untouched); the no-rate branch `00578:2765-2772` (which today nulls rate + amount and leaves the row reading NULL for ever). **CORRECTED, review round 1 (W1-R1-04): the repaired row is NOT promotable.** Every promotion loop in the lineage (`00412:1138 → 00414:913 → 00475:892 → 00511:4596 → 00566:843 → 00575:1845 → 00578:6584-6602`) JOINs `project_billing_authorities ON prior_authority.id = entry.billing_authority_id` and requires `entry.authority_rate_id IS NOT NULL`; this branch sets both to NULL, so the real promotion predicate selects 0 rows. What the repair delivers is the **money printing honestly** on the ledger, in the studio balance and in the composer — not promotability. Making such a row promotable is a new arm inside the signed countersign ceremony: **owed ruling HT-6-b**, pinned as a deliberate assert in `time_rate_resolution_test.sql` case (c4). Validates `NEW.rate_role` against the member's live `project_team_members` roles and feeds it to the role branch at `00578:2712-2733` in place of the `count(DISTINCT role)=1` collapse (HT-41); a `rate_role` the member does not hold raises. `billable` stays client-set; the classifier may only **downgrade** it to false when no authority covers the work, never upgrade it, recording the reason through `billing_state` + `rate_source` (HT-12 + HT-11 reconciled) |
| **00602** | — | **UNUSED.** This was architecture.md's `head+8` backfill; **P-4 removes it.** Left unused deliberately |
| **00603** | — | **UNUSED.** architecture.md's `head+9` renumber headroom. Left unused |

### RPC / function signatures

```sql
CREATE OR REPLACE FUNCTION public.resolve_time_rate_cents(
  p_project_id uuid,
  p_user_id    uuid,
  p_at         timestamptz,
  p_rate_role  text DEFAULT NULL        -- HT-41: the member's role pick, pre-validated
) RETURNS TABLE (cents integer, source text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER                        -- 00484 contract
SET search_path = public, pg_temp
AS $$ … $$;
REVOKE EXECUTE ON FUNCTION public.resolve_time_rate_cents(uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_time_rate_cents(uuid, uuid, timestamptz, text)
  TO authenticated;
```

- **Caller assert** (0484 contract): `IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_org_admin_or_owner(<studio of p_project_id's designer>) THEN RAISE insufficient_privilege`. A NULL `auth.uid()` (migration / trigger context under `postgres`) bypasses, matching `00317:38-39`'s precedent.
- **Order, HT-1 + HT-2-as-settled:** signed `project_billing_authority_rates` row covering `p_at` (→ `'authority'`) → `studio_member_rates` row covering `p_at` (→ `'studio_member'`) → `('none')`. **`change_order_terms->>'hourly_rate_cents'` is cut** (HT-1's ruled sentence). `profiles.default_hourly_rate_cents` is **not** a leg; `'profile_default'` is reserved in the CHECK only.

### RLS changes

| Action | Policy |
|---|---|
| CREATE (on `studio_member_rates`) | `studio_member_rates_read_self_or_admin` — `FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_org_admin_or_owner(studio_id))` |
| CREATE | `studio_member_rates_admin_insert` — `FOR INSERT TO authenticated WITH CHECK (public.is_org_admin_or_owner(studio_id) AND created_by = auth.uid())` |
| CREATE | `studio_member_rates_admin_update` — `FOR UPDATE TO authenticated USING (public.is_org_admin_or_owner(studio_id)) WITH CHECK (public.is_org_admin_or_owner(studio_id))` |
| **no DELETE policy** | history is a fact |
| dropped | none |

### Portal files

> **W1 LANE B IS NOT DONE (review round 1, finding W1-R1-14).** At the lane-A fix commit, every row in this table below the first two is absent from the diff: the `account-studio-page.tsx` "Studio rates" section, `studio-rate-rows.tsx`, the `hours-ledger.tsx` rate / rate-source column and its "rate pending", `authority-hours.ts`'s `timeRateProvenance`, the `pending-time-authorization-band.tsx` doorway, and the `authority-hours.test.ts` extension. **Done-when #3 and #5 are therefore unverifiable at that commit** and W1 is not passable as a wave until lane B lands and both are re-run with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` (§0.24). Lane A's brief covered the DB and the hooks only; this is a dispatch item, not a defect in lane A's work.

| File | Create/modify | What changes |
|---|---|---|
| `packages/supabase/src/hooks/use-time-tracking.ts` | modify | `rate_source` + `rate_role` on the entry type; **`CreateTimeEntryInput` (`:286-298`) gains `rateRole?`, and the insert row builder (`:311-324`) stops sending any rate** (it already sends none — assert it in a test so a future edit cannot reintroduce one) |
| `packages/supabase/src/hooks/use-studio-member-rates.ts` | **create** | `useStudioMemberRates(studioId)`, `useSetStudioMemberRate()`. Query keys: list `['studio-member-rates', studioId]`, entity `['studio-member-rate', userId]`. The mutation invalidates both plus `['document-hours-week']` and `['document-hours-unbilled']` |
| `packages/supabase/src/hooks/index.ts` + package index | modify | export the new module |
| `apps/designer-portal/src/components/document/account/account-studio-page.tsx` | modify | **HT-3.** A "Studio rates" section beside the existing member roster: per-member `hourly_rate_cents` field, **blur-save** (no Save button — the page's existing write-through idiom), **owner/admin only** (reuse the page's existing owner/admin gate, `is_org_admin_or_owner` via `useOrganizationMembers`), dated history rows beneath each field, read from `useStudioMemberRates` |
| `apps/designer-portal/src/components/document/account/studio-rate-rows.tsx` | **create** | the rate field + its dated history rows, extracted so the 1640-line page grows by a mount, not by 200 lines |
| `apps/designer-portal/src/components/document/hours-ledger.tsx` | modify | rate + rate-source column on the entry rows; **"rate pending"** where `rate_source = 'none'`, never a blank (HT-26). **W2 owns this file** — W1's column lands as a follow-commit on the integration branch after W2's lens (see §11) |
| `apps/designer-portal/src/lib/document/authority-hours.ts` | modify | `timeRateProvenance` (`:71-82`) stops returning `null` at `:80`; returns a discriminated result carrying `rate_source` and `rate_role` so "legitimately non-billable" and "this hire has no rate" stop looking identical (HT-26) |
| `apps/designer-portal/src/components/document/pending-time-authorization-band.tsx` and the `hours-ledger.tsx` `pending_authorization` read at `:184` | modify | the badge becomes a **doorway** to the authority band / the member's studio rate, instead of a dead static badge (HT-26) |
| deletions | — | the `profiles.default_hourly_rate_cents` **fallback** (resolver leg). The **column** is not dropped (FS-22 + HT-2 unruled); `database.types.ts` references regenerate |

### Edge/cron: none. iOS: none.

### PostHog events — **lane D owns the emitter module**, lane B calls it

| Event | Props | Emitted from |
|---|---|---|
| `time_entry_logged` | `surface`, `source`, `activity`, `billable`, `rate_source`, `rate_role`, `duration_minutes`, `latency_ms` | every capture path |
| `time_rate_unresolved` | `project_kind`, `rate_source='none'`, `project_id` | the alarm, fired wherever a row renders or returns with `rate_source='none'` |

- Both ship **here**, in the wave that fixes what they measure, so data accumulates before any capability decision rests on it (HT-27).
- Added to `apps/designer-portal/src/lib/analytics/document-events.ts` (existing emitters end at `:244`; the single time emitter today is `logStripActed` → `document_log_strip_acted` at `:234-238`). **Lane D is the sole writer of this file** for the whole program — it is otherwise a four-lane conflict surface.

### Tests to write

| Path | Assertions |
|---|---|
| `supabase/tests/billing/time_rate_resolution_test.sql` (new) | a browser-supplied `hourly_rate_cents` on a **non-services** project is discarded and replaced (HT-1, the `00578:2648-2654` branch); a services entry with **no** role match gets the studio rate and stays `pending_authorization` (no longer NULL-stranded, `00578:2765-2772`); the **no-authority-covering-`started_at`** branch is server-owned (`00578:2694-2700`); a member holding **two** roster roles with `rate_role` supplied resolves to that role's card, and with `rate_role` omitted resolves to the studio rate rather than NULL (HT-41 + CR-21); a `rate_role` the member does not hold **raises**; a caller-supplied `rate_source` on INSERT **raises** (§0.7c); `rate_source`/`rate_role` on an already-classified row are immutable (§0.8) |
| `supabase/tests/rls/studio_member_rates_test.sql` (new) | asserted **per role** — `owner` may insert/update/select; `admin` may; plain `member` may select only their own row; `guest` may nothing; a cross-studio `owner` may nothing; **no one may DELETE**; the close-prior-row trigger leaves exactly one open row per `(studio_id, user_id)` |
| `packages/supabase/src/hooks/__tests__/use-studio-member-rates.test.ts` (new) | query keys; the mutation's invalidation set |
| `apps/designer-portal/src/lib/document/__tests__/authority-hours.test.ts` (extend) | `timeRateProvenance` never returns `null`; `rate_source='none'` renders "rate pending" |
| existing, must stay green **unchanged** | `scripts/run-sql-tests.sh -d supabase/tests/commercial` — run it worktree-relative with `-k supabase/tests/KNOWN_FAILURES.md`; it exercises **10 of 16 files** and the six red ones abort *before* their authority asserts. **CORRECTED, review round 1 (W1-R1-15): commercial green is NOT the real gate for the classifier rewrite and must never be read as authority-path coverage in any later wave.** All six failures are pre-existing and every one of them aborts inside `_countersign_design_services_agreement_impl` before any authority-rate assert runs — which is precisely why W1-R1-02 (a bound hour silently re-priced) and W1-R1-04 (a non-promotable row claimed promotable) both passed the gate. **The sole gate for the classifier is `supabase/tests/billing/time_rate_resolution_test.sql`**, now 14 cases (a)–(m); grow it, not the commercial suite, when the classifier changes |

**Two things the W1 lane must not assume (review round 2):**

- **m1 — the "new hire" test must log as the member herself.** `00597`'s seat is gated on `NEW.user_id = auth.uid()`, but `Designers manage their project time entries` is an `ALL` policy whose qual is the project's `designer_id = auth.uid()` with **no `user_id` leg** (measured in `pg_policies`), so the project designer *can* insert a row for another user. Such a row seats nobody → `classify_project_time_entry_authority`'s role read (`00578:2713-2718`) yields `v_team_role = NULL` → `v_normalized_role = ''` → the role branch at `00578:2724` is skipped → **no authority rate at all.** No shipped UI does this (`useCreateTimeEntry` always writes `user_id = auth.uid()`), so it is not a live bug — but a resolver test written as a designer-on-behalf insert asserts the wrong thing. Log as the member.
- **n9 — `guard_commercial_time_entry_derived_fields` DOES already have a BEFORE INSERT trigger**, under a misleading name: `aaa_guard_time_entry_invoice_insert_trg` (`00412:2387-2391`, confirmed in `pg_trigger` → `proname = guard_commercial_time_entry_derived_fields`). §0.7(c) is therefore a **body** edit to that function's INSERT branch, not a new trigger. Do **not** add a second BEFORE INSERT trigger on the same function. (`aab_…_derived_fields_trg` is `BEFORE UPDATE OF …` only, and `aad_…_invoice_authority_trg` is `BEFORE UPDATE OF invoice_id` only — the full BEFORE-INSERT set is `aaa0_time_entry_auto_roster_trg`, `aaa_guard_time_entry_invoice_insert_trg`, `aac_classify_project_time_entry_authority_trg`.)

### Gate commands (verbatim)

```
pnpm supabase:reset
python3 scripts/generate-legacy-grants.py
scripts/run-sql-tests.sh -d supabase/tests/commercial
scripts/run-sql-tests.sh -d supabase/tests/billing
scripts/run-sql-tests.sh -d supabase/tests/rls
pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test
pnpm --filter @patina/designer-portal lint
pnpm --filter @patina/admin-portal build
```

### Done-when (observable)

- `supabase/tests/commercial` green **unchanged**; `supabase/tests/billing` and `supabase/tests/rls` green.
- `INSERT … (hourly_rate_cents) VALUES (99999)` as `authenticated` on a non-services project → the stored row's `hourly_rate_cents` is the resolver's value, not 99999 (a `SELECT`, not a screenshot).
- A rate typed on `/desk?account=studio` appears on the next entry's row with `rate_source='studio_member'` (live-mode render **and** a `SELECT`).
- A new hire's services entry carries a non-NULL `hourly_rate_cents` + `rated_amount_cents` and `billing_state='pending_authorization'`, so the row prints real money instead of NULL. **AMENDED, review round 1 (W1-R1-04): it is NOT promotable by a later signed addendum** — the promotion loop (head `00578:6584-6602`) joins on `entry.billing_authority_id` and requires `entry.authority_rate_id IS NOT NULL`, both of which this branch sets to NULL. The earlier text ("a later signed addendum promotes it") was measured false: the real predicate selects 0 rows. Promotability is **owed ruling HT-6-b**; the shipped non-promotability is asserted in `time_rate_resolution_test.sql` case (c4).
- A two-role member's ledger row prints the role they picked.

---

## §3 · W2 — The four views: one sheet, one admin-gated scope lens

| | |
|---|---|
| **Lane** | **A (Opus)** for DB (`00604–00607`); **B (Opus for the scope lens, per charter §3)** for UI. Branch `hour-tracking/w2-four-views` |
| **Depends on** | W0 (view repair + hook module). **Not W1** — the lens renders without `rate_source`, which arrives as a column once W1 lands. W2 **DB lands before W2 UI** (charter §4 step 4) |
| **Ruled inputs** | **HT-10**, **HT-37**, **HT-38**, HT-8, HT-9, HT-22, HT-23, HT-29, **HT-35**, **HT-36**, HT-30, HT-40 |

**Goal.** Four scopes — mine · a member · this project · the studio — from one sheet, and the published promise about them made true.

### Amendments the rulings force

| Ruling | architecture.md said | plan-v2 does |
|---|---|---|
| **HT-37 / HT-38** | `useStudioTimeReport` is **wired, not deleted**; no rollup RPC; `head+13` not written | **`useStudioTimeReport` (`use-time-tracking.ts:689-781`) is DELETED** and an **INVOKER rollup RPC** is built in `00607`. **The ruling wins against architecture.md's default.** FS-5's objection is recorded and overruled; the per-member group-by is implemented server-side instead |
| **HT-10** | `head+12` reserved, written only if Kody rules narrow | **RULED narrow.** `00606` is written |
| **HT-36** | aggregate by default | the rollup's return shape **excludes `notes`**, asserted per role in SQL |
| **HT-35** | disclosure band + per-member opt-out, on "their own profile" | the opt-out lands on **`components/document/account/account-profile-page.tsx`** (`/desk?account=profile`, 217 lines) — the member's own profile page. Falls back to **one-tap manual start** |

### Migrations (00604–00607)

| # | Slug | What it does |
|---|---|---|
| **00604** | `time_entry_ledger_view.sql` | `public.time_entry_ledger` fact view, `WITH (security_invoker = true)`: entry columns + `studio_id` (resolved from `projects.designer_id`'s primary studio — **never used as a policy key**, §0.13) + `resolved_rate_cents` + `amount_cents` (prefers `rated_amount_cents`) + `rate_source` + `rate_role` + `is_running` (`duration_minutes IS NULL`) + `day` / `iso_week` / `month` buckets + the author's display name. **LEFT JOIN `public.profiles`**, same reason as 00596. Explicit `GRANT SELECT … TO authenticated` |
| **00605** | `time_entry_admin_write_and_trace.sql` | **HT-22 + HT-23.** Two new policies (below) + `ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id)` + an `AFTER UPDATE OR DELETE` trigger writing **one** `public.audit_logs` row (`action`, `resource_type='project_time_entries'`, `resource_id`, `old_values`, `new_values`, `organization_id`, `user_id` — columns verified `00021:226-244`). **The trigger function is SECURITY DEFINER** — `audit_logs` has RLS enabled (`00021:261`) with only two SELECT policies (`00021:423,426`) and **no INSERT policy**, so an INVOKER trigger would fail the insert and roll back the admin's adjust (§0.18). No new audit table, no approval column, no state machine |
| **00606** | `time_entries_studio_read_narrow.sql` | **HT-10.** `DROP POLICY "time_entries_studio_read" ON public.project_time_entries` (`00316:237-240`); `CREATE POLICY "time_entries_owner_admin_read"` via `is_org_admin_or_owner`. **The 00484-registered `Team can view their project time entries` (`00484:811-814`) is untouched** (§0.17). **This is the only change in this migration**, so it can be reverted without touching the lens (risk 8) |
| **00607** | `studio_hours_rollup.sql` | **HT-37 + HT-38.** `public.studio_hours_rollup(...)`, **SECURITY INVOKER**, return shape frozen at buckets + minutes + money + the member's name — **never `notes`** (HT-36) |

### RPC / function signatures

```sql
CREATE OR REPLACE FUNCTION public.studio_hours_rollup(
  p_studio_id  uuid,
  p_from       date,
  p_to         date,
  p_group_by   text DEFAULT 'member',   -- 'member' | 'project' | 'day' | 'iso_week' | 'activity'
  p_user_id    uuid DEFAULT NULL,       -- the member scope
  p_project_id uuid DEFAULT NULL        -- the project scope
) RETURNS TABLE (
  bucket_key       text,
  bucket_label     text,
  member_id        uuid,
  member_name      text,
  entry_count      integer,
  total_minutes    integer,
  billable_minutes integer,
  billable_cents   bigint,
  internal_minutes integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER                        -- HT-38. Rows are already co-member/owner-readable
SET search_path = public, pg_temp
AS $$ SELECT … FROM public.time_entry_ledger … $$;
REVOKE EXECUTE ON FUNCTION public.studio_hours_rollup(uuid, date, date, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.studio_hours_rollup(uuid, date, date, text, uuid, uuid)
  TO authenticated;
```

- **No `notes` column exists in the signature.** That is the HT-36 guarantee, and it is a type-level guarantee, not a filter.
- INVOKER means RLS does the scoping: after `00606`, a plain `member` calling it with another member's `p_user_id` gets their own rostered-project rows only; an owner/admin gets the studio.
- `p_group_by` is validated against the five literals and raises otherwise (no dynamic SQL).

```sql
CREATE OR REPLACE FUNCTION public.audit_time_entry_change()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$ … $$;
REVOKE ALL ON FUNCTION public.audit_time_entry_change()
  FROM PUBLIC, anon, authenticated, service_role;
```

### RLS changes

| Action | Policy |
|---|---|
| CREATE | `time_entries_owner_admin_update` — `FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_members om ON om.user_id = p.designer_id AND om.status='active' WHERE p.id = project_time_entries.project_id AND public.is_org_admin_or_owner(om.organization_id))) WITH CHECK (same)` |
| CREATE | `time_entries_owner_admin_delete` — same predicate, `FOR DELETE` |
| CREATE | `time_entries_owner_admin_read` — same predicate, `FOR SELECT` (HT-10's replacement read) |
| **DROP** | `time_entries_studio_read` (`00316:237-240`) |
| untouched | all four `Team can …` policies (`00484:784-814`); `time_entries_studio_insert_own` / `_update_own` / `_delete_own` (`00316:242-261`); `Designers manage their project time entries` (`00177:136-137`) |

**Residual conflict in HT-10, stated.** The ruling reads *"Members read own rows plus **aggregates** on rostered projects."* `Team can view their project time entries` (`00177:140-141`, re-created `00484:811-814`) grants a rostered member **SELECT on every row of that project, notes included** — more than aggregates. Dropping it would breach the 00484 authorization contract (§0.17). **plan-v2 narrows only the studio-wide policy (`00316:237`); the project-team row read stays, and the aggregate-only promise is kept by the UI + the rollup's return shape.** This is a ruling Kody still owes — logged as **HT-10-a** in §12. `guard_invoiced_time_entry` (`00177:51-84`) remains the lock; no second lock is built (HT-22 context).

### Portal files

| File | Create/modify | What changes |
|---|---|---|
| `apps/designer-portal/src/components/document/hours-ledger.tsx` (751 lines) | modify | **The scope lens** — `mine · a member · this project · the studio`, modelled on `components/document/people/directory/scope-lens.tsx` (two DM-mono Scored-Ink words, `da-score-on` / `da-score-hover`; generalized to four). **Absent for non-admins.** **Remove the `.eq('user_id', …)` AND from the project path** (`:113` unconditional, `:118` the lens AND) — HT-9. Totals render **above** the rows that produced them (HT-30, §0.23). Member name is the leftmost fact in member/project/studio scopes. Studio scope shows hours · billable minutes · **billable amount in dollars**, grouped by member (switchable to project / day / iso_week / activity), internal rows in an explicit `— internal —` group. Reads `studio_hours_rollup` for aggregates and `time_entry_ledger` for rows. The billing-state chip stays as built — a 1px-bordered text pill, no fill, no colour coding (HT-40) |
| `packages/supabase/src/hooks/use-time-tracking.ts` | modify | **DELETE `useStudioTimeReport` (`:689-781`)** and its types; **delete the stale section comment `:653`** (already W0). Add `useStudioHoursRollup(params)` → `rpc('studio_hours_rollup', …)`, and `useTimeEntryLedger(params)` → the `00604` view |
| `apps/designer-portal/src/components/document/people/views/person-profile.tsx` | modify | an "Hours" act opens the ledger at that member's scope. **The only door to the member scope** — no staff picker inside a money ledger |
| `apps/designer-portal/src/components/document/desk-contents.tsx` | modify | the `hours: 'time in hand'` card (`:65`) stays **act-bearing or absent** (HT-29): unbilled hours with "Bill it", or a timer still running from yesterday. Never a bare total |
| `apps/designer-portal/src/hooks/document-time-provider.tsx` | modify | **HT-35.** The one-time auto-start disclosure band (R83 inline-band pattern, `DECISIONS.md:2672`) on a member's first document open, dismissible, once and never again; reads the per-member opt-out |
| `apps/designer-portal/src/components/document/account/account-profile-page.tsx` | modify | **HT-35.** The per-member auto-start opt-out, **default on**, on their own profile. Off ⇒ the spine falls back to **one-tap manual start**, never "no timer" |
| `apps/designer-portal/src/components/document/desk-doorway.tsx` | modify | accept `sheet` as an alias of `book` at `:84` (the doorway param list) and `:132` (`params.get('book')`) — today unknown values are ignored in silence (`:41-42`), so the live founding-cohort CTA lands on a bare Desk. **Fix the copy deck either way** at `docs/marketing/founding-onboarding/copy-deck.md:357,379,627` (`?sheet=hours` → `?book=hours`) |
| `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15` | modify | the two studio-scope sentences become **true**, not deleted; push the article to Sanity |
| `docs/design/the-document/portal-vs-desk-feature-gap-matrix-v2.md:189,193` | modify | BIL-04 closed (R75 shipped it, `hours-ledger.tsx:380-400`); BIL-08 reopened as the **rate-display drift**, not as absence |

### iOS: none. Edge/cron: none.

### PostHog events (lane D emits, lane B calls)

`time_scope_viewed` (`scope`, `group_by`) · `time_entry_adjusted` (`by_admin` boolean) · `time_entry_deleted` · `time_autostart_disclosed` · `time_autostart_opted_out`.

### Tests to write

| Path | Assertions |
|---|---|
| `apps/designer-portal/src/components/document/__tests__/hours-ledger-scope.test.tsx` (new — **no hours-ledger spec exists today**) | the lens is **absent** for a plain `member`, present for `owner`/`admin`; the project scope does **not** filter by `user_id`; totals precede rows; the studio scope renders an `— internal —` group; the member scope renders **aggregates** with notes behind an explicit detail act |
| `supabase/tests/rls/time_entry_admin_write_test.sql` (new) | asserted **per role** — an `admin` may adjust and delete another member's **unbilled** entry; a plain `member` may not; **neither** may touch an invoiced one (`00177:51-84` still raises); the `audit_logs` row exists with **both** `old_values` and `new_values` and the correct `organization_id`; `updated_by` is stamped |
| `supabase/tests/rls/studio_hours_rollup_test.sql` (new) | asserted **per role** — the return shape has **no `notes` column** (`information_schema` assert, not a row assert); an `owner` gets every member's bucket; a plain `member` passing another member's `p_user_id` gets nothing of theirs; a cross-studio caller gets nothing; each of the five `p_group_by` literals returns, a sixth **raises**; after `00606` a plain `member` no longer reads a studio-mate's row on a project they are **not** rostered to |
| `apps/designer-portal/e2e/document/hours.spec.ts` (new — **the first hours e2e spec; `e2e/document/` has 10+ specs, none for hours**) | the lens at 1440 / 1024 / 390; the disclosure band appears once and never again. **Must close, never delete, running timers** (the `00177:37-41` one-running-timer index is per user globally and e2e actors collide) |
| existing | `supabase/tests/commercial` stays green unchanged (worktree-relative, `-k supabase/tests/KNOWN_FAILURES.md`; 10 of 16 files actually execute — round-2 n10) |

**One thing the W2 lane must not assume (review round 2, finding m1).** HT-22's owner/admin write widening is an UPDATE+DELETE widening only. If the adjust path ever grows an INSERT — an admin entering an hour *on behalf of* a member — `00597`'s seat will **not** fire for it (the trigger gates on `NEW.user_id = auth.uid()`), and the row will therefore resolve **no role rate** at all. Such a path must seat the member deliberately, in the same statement, and say so; do not lean on the auto-roster trigger.

### Gate commands (verbatim)

```
pnpm supabase:reset
python3 scripts/generate-legacy-grants.py
scripts/run-sql-tests.sh -d supabase/tests/rls
scripts/run-sql-tests.sh -d supabase/tests/commercial
scripts/run-sql-tests.sh -d supabase/tests/billing
pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live pnpm --filter @patina/designer-portal test:e2e -- e2e/document/hours.spec.ts
pnpm --filter @patina/designer-portal lint
pnpm --filter @patina/admin-portal build
```

### Done-when (observable)

- Opening a project's lens as the owner shows **that house's** hours with every member named, not her own (a `SELECT` confirms the row set, then a live-mode render).
- A plain `member` sees **no lens** and, after `00606`, no studio-mate's row on a non-rostered project (asserted in SQL, per role).
- An admin adjust writes one `audit_logs` row carrying `old_values` **and** `new_values`; the row's `updated_by` is the admin.
- `\d+ studio_hours_rollup` shows no `notes` in the return type.
- `/desk?sheet=hours` opens the Hours book; the copy deck no longer disagrees with the code.
- The Sanity help article matches what the sheet does.
- The disclosure band appears once for a fresh member and never again; the opt-out leaves a one-tap manual start.

---

## §4 · W3 — Capture with nothing in hand, and yesterday's hour

| | |
|---|---|
| **Lane** | **B** — Sonnet, **Opus for the ⌘K verb** (charter §3). Branch `hour-tracking/w3-capture` |
| **Depends on** | W1 (the billable pill is seeded from the resolved answer; the rate readout needs `rate_source`) and W0 (the `source` values `command_bar` / `internal`; the roster seat) |
| **Ruled inputs** | HT-11, **HT-13**, HT-14, HT-24, **HT-25** (consumed, not implemented here), **HT-41**, HT-17 (instrumentation only) |

**Goal.** Every hour a studio member works has a compliant home, including the ones not spent on an open document and the ones remembered a day late.

### Amendments the rulings force

| Ruling | plan-v2 does |
|---|---|
| **HT-13** | a **date field** on the ledger add row and the ⌘K form, defaulting to the paged week; **any date** is accepted; an entry whose `created_at - started_at > 30 days` carries a **quiet "backdated" mark** — a derived, unstyled DM-mono word on the row, no badge, no colour (HT-40, §6). **No column and no migration**: the 30-day test is derived from the two existing timestamps, and "until the entry is invoiced" is already enforced by `guard_invoiced_time_entry` freezing `started_at` (`00177:51-84`, §0.12) |
| **HT-41** | a **role chip** on the log strip, the ledger entry rows and the ⌘K verb, **shown only when the member holds more than one live roster role on that project**; it writes `rate_role` |
| **HT-25** | consumed: the ⌘K project list is **not** restricted to rostered projects (00597 seats the member on first log) |

### Migrations (00608–00609)

| # | Slug | What it does |
|---|---|---|
| **00608** | `log_time_and_start_timer.sql` | `public.log_time(...)` — replay-safe insert for a client-minted id (what W6 needs); `public.start_timer(...)` — atomically stops the incumbent running row and **returns both rows** so the caller can still raise the chain-out strip. Both SECURITY INVOKER; RLS stays the authorization spine |
| **00609** | — | **UNUSED.** HT-13 needs no DDL (above). Left unused deliberately |

**No `stop_timer`, `discard_timer`, `adjust_time_entry` or `delete_time_entry` RPC** — those are PostgREST writes under RLS, and W2's `00605` already widened the one policy that needed widening (FS-40).

### RPC / function signatures

```sql
CREATE OR REPLACE FUNCTION public.log_time(
  p_entry_id         uuid,
  p_project_id       uuid,
  p_started_at       timestamptz,
  p_duration_minutes integer,
  p_activity         text    DEFAULT NULL,
  p_billable         boolean DEFAULT NULL,   -- NULL raises; no `?? true` anywhere
  p_notes            text    DEFAULT NULL,
  p_phase_key        text    DEFAULT NULL,
  p_task_id          uuid    DEFAULT NULL,
  p_source           text    DEFAULT 'manual_entry',
  p_rate_role        text    DEFAULT NULL,   -- HT-41
  p_studio_id        uuid    DEFAULT NULL    -- reserved for W4's internal time
) RETURNS public.project_time_entries
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$ … INSERT … ON CONFLICT (id) DO NOTHING RETURNING * … $$;
REVOKE EXECUTE ON FUNCTION public.log_time(uuid,uuid,timestamptz,integer,text,boolean,text,text,uuid,text,text,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_time(uuid,uuid,timestamptz,integer,text,boolean,text,text,uuid,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_timer(
  p_project_id uuid,
  p_source     text DEFAULT 'timer_auto',
  p_billable   boolean DEFAULT NULL,
  p_phase_key  text DEFAULT NULL,
  p_task_id    uuid DEFAULT NULL
) RETURNS TABLE (started public.project_time_entries, stopped public.project_time_entries)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$ … $$;
REVOKE EXECUTE ON FUNCTION public.start_timer(uuid,text,boolean,text,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.start_timer(uuid,text,boolean,text,uuid) TO authenticated;
```

- `log_time` on an `ON CONFLICT DO NOTHING` miss returns the **existing** row (a second `SELECT` inside the function), never NULL — otherwise a replayed Field drain reads as a failure.
- `start_timer` **stops** the incumbent and returns it. architecture.md's draft alternative ("return the existing running row instead of raising") would breach R20 and attribute new work to the old project (FS-38) — rejected.
- `p_billable = NULL` raises (`HT-11`: once every surface carries the control, a missing value is a caught bug).

**RLS changes:** none.

### Portal files

| File | Create/modify | What changes |
|---|---|---|
| `apps/designer-portal/src/components/document/command-bar.tsx` (**1224 lines on origin/main**) | modify | the **"Log time"** verb in the **`eyebrow: 'Begin'` section at `:860`** (`STUDIO_VERBS.map(surfaceRow)`) — the one non-in-hand group. It **cannot** reuse the "Draw an invoice" pattern at **`:811-822`**, which is gated on `inHandRow?.project_id`, i.e. appears only when a document is open, which is exactly when the auto-timer is already running. Same gate at `:840-847`. Form fields: project (all studio projects, not only rostered — HT-25), duration, **date**, activity, **billable pill**, **role chip when multi-role**, Enter. **No inline NL parser in this wave** (§6) |
| `packages/supabase/src/hooks/use-time-tracking.ts` — `CreateTimeEntryInput.source` | modify | **W0-9.** Widen the union with `'command_bar'` — it is still `'timer_auto' \| 'timer_manual' \| 'manual_entry'` at `:328`, so the ⌘K verb cannot send its own `source` until this moves. `00595` bought the DB value and the column COMMENT calls it live. (W4 adds `'internal'`, W6 adds `'field_manual'`.) |
| `apps/designer-portal/src/components/document/hours-ledger.tsx:271-296, 543-591` | modify | **date field** on the add row (today `batchAdd` at `:275-284` sends no `started_at`, so paging back a week silently mis-dates into today); `addValid` at `:273` unchanged in this wave (W4 relaxes the project requirement); **billable pill** + rate readout on the add row and the entry rows; the **"backdated" mark**; the **role chip** when multi-role |
| `apps/designer-portal/src/components/document/log-strip.tsx` (178 lines) | modify | billable pill, static rate/amount readout, role chip when multi-role; **the `'design'` activity default at `:30` and `:36` removed** → "activity not set" (HT-24, never required). Interaction count stays 4 for the adjust path; the zero-tap path **stays zero** (§0.22) |
| `apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:1130-1147, 1219-1231` | modify | **HT-14.** `MobileTimerSheet` (`:1130`) gets a project picker when `heldProjectId` is null (today `:1146` closes the form and `:1226-1227` clears the field as though it saved). Never a silent success |
| `apps/designer-portal/src/hooks/document-time-provider.tsx` | modify | `:410-424` — `manualLog` stops early-returning on `!doc` (`:413`) and takes an explicit project; `:283-290` — the stop payload carries `activity` and `billable`; `:319-347` — repoint to `start_timer` / `log_time`; the chain-out at `:328` **still raises the log-offer strip** |
| `apps/designer-portal/src/lib/document/registry.tsx` | modify | the **`t`** binding opens the log form (not "focus the strip" — the strip exists only after a timer stops). **Note:** every registry shortcut today is a `g`-chord (`:88,102,117,176,200,214,228`); Hours is `g h` at `:214` and `g t` is **The Post** at `:228`. A bare `t` is therefore a **new idiom** and must be registered in the document key handler, not in the registry's chord table; the only other bare-ish `t` in the app is `shift+t` in `components/portal/scope-builder/board-room-controller.tsx:1563` (a different surface, no collision) |
| `packages/supabase/src/hooks/use-time-tracking.ts` | modify | **delete the `23505` toast branch** (`:480-484`) — `start_timer` now returns both rows; **delete the implicit `billable: input.billable ?? true` default** (`:320`; note `:467` is a conditional assign, not a second default) |

### iOS: none. Edge/cron: none.

### PostHog events (lane D emits, lane B calls)

`time_timer_started` · `time_timer_stopped` (`adjusted`, `idle_minutes`, **and the cumulative-idle-to-raw-elapsed ratio**). **Instrument only; do not touch the 30-minute number** (HT-17). The hole is real and verified: `longestIdleGapSeconds` (`lib/document/time-derivation.ts:123-132`) feeds the R64 bound (`RUNAWAY_IDLE_SECONDS = 30*60` at `:120`) while `idleSecondsFromPings` (`:100-109`) computes the cumulative sum and it is used only for the annotation string.

### Tests to write

| Path | Assertions |
|---|---|
| `apps/designer-portal/src/components/document/__tests__/command-bar-log-time.test.tsx` (new) | the verb is present with **nothing in hand**; writes `source='command_bar'`; lists a non-rostered project; the role chip appears only for a multi-role member |
| `apps/designer-portal/src/components/document/__tests__/hours-ledger-add-row.test.tsx` (new) | the date field defaults to the **paged week**, not today; an entry 31 days old renders the "backdated" mark and a 29-day one does not |
| `apps/designer-portal/src/components/document/__tests__/mobile-sheets.test.tsx` (**extend — this is the real filename; `mobile-timer-sheet.test.tsx` does not exist**) | with `heldProjectId` null the sheet either logs through the picker or says why; it never clears as though it saved |
| `apps/designer-portal/src/hooks/__tests__/document-time-provider.test.tsx` (**create — no provider spec exists**) | chain-out still raises the strip; the stop payload carries `activity` and `billable`; `manualLog` works with no document held |
| `apps/designer-portal/src/components/document/__tests__/log-strip.test.tsx` (new) | no `'design'` default; "activity not set" renders; the zero-tap path requires no field |
| `supabase/tests/billing/time_log_rpc_test.sql` (new) | a replayed `log_time` inserts **once** and returns the existing row; two concurrent `start_timer` calls leave **exactly one** running row and the loser gets the stopped row back; `p_billable = NULL` raises; a backdated `log_time` on an **invoiced** entry raises (`00177:51-84`) |

**One thing the W3 lane must not assume (review round 2, finding n1).** W0's N5 fix gave `useStartTimer`'s duplicate-timer handler (SQLSTATE 23505) a `console.warn` fallback, and **it protects none of W3's new doors.** Two reasons, both measured: (a) the shipped call site passes `quiet: true`, and the `if (!input.quiet)` gate means `notify()` is never reached at all; (b) the `(document)` route group deliberately mounts **no `ToastProvider`** (R83, documented at `apps/designer-portal/src/app/(document)/layout.tsx:40-45`), so `useToast()` returns the context default `{ toast: () => {} }` — a *truthy* no-op — and `notify()` calls that rather than falling back to the console. Behaviour is unchanged from before W0 and is the intended R83 posture. So if the ⌘K verb or the mobile capture sheet is to surface a 23505 at all, W3 must pass a **real reporter** or drop `quiet` — inheriting the fallback buys nothing.

### Gate commands (verbatim)

```
pnpm supabase:reset
python3 scripts/generate-legacy-grants.py
scripts/run-sql-tests.sh -d supabase/tests/billing
pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live pnpm --filter @patina/designer-portal test:e2e -- e2e/document/hours.spec.ts
pnpm --filter @patina/designer-portal lint
pnpm --filter @patina/admin-portal build
```

### Done-when (observable)

- A 45-minute client call is logged in **5 interactions** from ⌘K with **no document open**, and a `SELECT` shows `source='command_bar'`.
- The same entry dated yesterday lands on **yesterday** (`started_at`, not `created_at`).
- An entry dated 31 days back renders the quiet "backdated" mark.
- The mobile sheet with nothing held either logs or says why — never both-neither.
- A log-strip entry carries an **explicit** `billable` and the row prints its reason ("non-billable · no agreement").
- Two browser tabs starting timers leave **one** running row and **one** offer strip (`SELECT count(*) … WHERE duration_minutes IS NULL AND user_id = …` = 1).

---

## §5 · W4 — Internal and admin time (+ lane D's time-nudges)

| | |
|---|---|
| **Lane** | **A (Opus)** for `00610–00613`; **D (Sonnet)** for `00614` + the edge function + the PostHog event set. Branch `hour-tracking/w4-internal-time` |
| **Depends on** | W1 (the classifier short-circuit lands in the rewritten body, grafted from `00601`) and W3 (the doors that accept a project-less entry) |
| **Ruled inputs** | HT-15 *(unruled — shape settled, reprice owed)*, **HT-34**, **P-5** |

**Goal.** The owner's own hours get an honest home without a sentinel project; and the one reminder that is act-bearing rather than engagement.

### Migrations (00610–00614)

| # | Slug | What it does | Owner |
|---|---|---|---|
| **00610** | `time_entry_nullable_project.sql` | `ALTER COLUMN project_id DROP NOT NULL` (today `00177:15`); `ADD COLUMN IF NOT EXISTS studio_id uuid REFERENCES public.organizations(id)`; backfill `studio_id` from the project's studio for existing rows; `CHECK (project_id IS NOT NULL OR (studio_id IS NOT NULL AND billable = false))` | A |
| **00611** | `time_entry_studio_id_guard.sql` | `BEFORE INSERT OR UPDATE OF studio_id` trigger replicating **`00317:31-47`**'s anti-aiming guard verbatim in shape: a member may not aim `studio_id` at an organization they are not an **active** member of; `auth.uid() IS NULL` and `service_role` bypass (`00317:38-39`). **SECURITY DEFINER**, `SET search_path`, `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`. Without it, nullable `project_id` is a cross-studio write hole | A |
| **00612** | `internal_time_policies.sql` | **Four new own-row policies** plus the owner/admin pair for the `project_id IS NULL` case. **All nine existing policies resolve through `project_id`** — five through `projects p WHERE p.id = project_time_entries.project_id` (`00177:136-137`; `00316:237,242,248,257`) and four through `is_project_team_member(project_id)` (`00177:140,144,148,152`, re-created `00484:786,795,804,813`) — so with a NULL `project_id` **every one is false**, and internal time would be written and then invisible. The ninth (`00177:136`'s `FOR ALL` for the project's own `designer_id`) has **no NULL-case counterpart** — an internal row has no project designer — and owner/admin reach is carried by the `is_org_admin_or_owner` pair. **Four own-row policies + two owner/admin stands.** Policy names below | A |
| **00613** | `classifier_internal_short_circuit.sql` | Redefines `classify_project_time_entry_authority` grafted from **`00601`** (lineage `00412 → 00575 → 00578 → 00601 → 00613`): `project_id IS NULL → billing_state='nonbillable'`, `rated_amount_cents = 0`, `rate_source='none'`, no rate, `rate_role = NULL`, placed **before** the `project_commercial_documents` lookup at `00578:2637-2641` (which would otherwise read a NULL `project_id`). Re-creates `aac_classify_project_time_entry_authority_trg` with **`studio_id` added** to the `BEFORE INSERT OR UPDATE OF` list (`00412:2623-2624`). Also: `margin_items`' time sub-select gains `WHERE project_id IS NOT NULL` for hygiene — the sub-select is at **`00543:289-296`** (`from project_time_entries pte`, `:293`); the portal already key-filters (`use-margin-items.ts`), so this is not a sweep | A |
| **00614** | `time_nudges_cron.sql` | **HT-34 rule (a) + the dark rule (b).** `cron.schedule('time-nudges-hourly', '0 * * * *', $$SELECT public.invoke_edge_function('time-nudges', '{"rule":"running_timer"}'::jsonb);$$)` on the **`00572:1221-1225`** pattern, preceded by the guarded unschedule block (`00572:1216-1219`). `ADD COLUMN IF NOT EXISTS weekly_hours_reminder_opt_in boolean NOT NULL DEFAULT false` on `public.profiles`. The weekly job is present **as a commented SQL block only**. Charter §3 gives lane D "edge/cron entries only; no new migration" within W4's range — a cron schedule needs a file, so **00614 is the one migration lane D writes**, and it carries no schema change beyond the dark opt-in column | **D** |

**Rejected alternative, recorded:** a per-studio sentinel "Internal" project. It would pollute every project list, roster, board and invoice path. Nullable `project_id` is additive per O3/R4.

**NULL stance, stated once:** internal time is non-billable and out of every project-scoped read. `project_unbilled_time` already filters `billing_state = 'authorized'` (`00412:2687-2688`), which a nonbillable row never reaches. Every other live consumer filters `project_id = <id>` (NULL-safe) or is key-filtered client-side (`00412:2671`, `00422:2431-2438`, `00577:2477-2498`, `00291:402-436`).

### RLS changes

| Action | Policy |
|---|---|
| CREATE | `internal_time_own_read` — `FOR SELECT TO authenticated USING (project_id IS NULL AND user_id = auth.uid() AND public.is_active_studio_member(studio_id))` |
| CREATE | `internal_time_own_insert` — `FOR INSERT TO authenticated WITH CHECK (project_id IS NULL AND user_id = auth.uid() AND billable = false AND public.is_active_studio_member(studio_id))` |
| CREATE | `internal_time_own_update` — `FOR UPDATE`, same predicate on both `USING` and `WITH CHECK` |
| CREATE | `internal_time_own_delete` — `FOR DELETE`, same `USING` |
| CREATE | `internal_time_owner_admin_read` — `FOR SELECT TO authenticated USING (project_id IS NULL AND public.is_org_admin_or_owner(studio_id))` |
| CREATE | `internal_time_owner_admin_write` — `FOR UPDATE` + a sibling `FOR DELETE`, `USING/WITH CHECK (project_id IS NULL AND public.is_org_admin_or_owner(studio_id))` |
| dropped | none |

### Edge / cron (lane D) — what "dark" means, precisely

`supabase/functions/time-nudges/index.ts` (new), `Deno.serve`, `verify_jwt = true` in `supabase/config.toml` `[functions.time-nudges]` (the caller is `public.invoke_edge_function`, which POSTs `apikey` + `Authorization: Bearer <service-role>` from Vault, migration 00258 — so no opt-out and no in-code signature check). No CORS (never browser-called). Service-role client created only after the platform JWT check.

| Rule | Built? | Reachable? |
|---|---|---|
| **(a) running timer > 8 h** | yes | **yes.** Body `{"rule":"running_timer"}` (and `{}`). Writes **one quiet Record row** per running timer per sweep — idempotent on `(user_id, entry_id)` via the existing `notification_log` claim idiom, so a nine-hour timer produces exactly **one** row across nine hourly sweeps. The Record is the Post's Record page (R82, `DECISIONS.md:2668`). **No push, no email, no badge, no `sendCompliantEmail` call** |
| **(b) opt-in weekly unlogged-day reminder** | yes — **built dark** | **no** |

**"Dark" in code means exactly these five things and nothing else:**

1. Rule (b) is fully implemented in `index.ts`, reachable **only** when the POST body is `{"rule":"weekly_unlogged"}`; the default body and `{"rule":"running_timer"}` never enter it.
2. Rule (b) filters on `profiles.weekly_hours_reminder_opt_in = true`, a column that exists (00614) and **defaults to false**.
3. `00614` contains the weekly `cron.schedule(...)` call **commented out**, with a one-line note naming HT-34 and P-5. No `cron.job` row is ever created, so the rule can never fire in prod.
4. **No portal surface reads or writes `weekly_hours_reminder_opt_in`** — no settings row on `account-profile-page.tsx`, no hook in `packages/supabase`, no `@patina/types` export. Its only appearance outside the migration is in the regenerated `database.types.ts`.
5. Rule (b) **is covered by Deno tests**, so it is built rather than stubbed — the test invokes the handler with the weekly body directly.

**This is how HT-34's "behind a flag that ships off" is satisfied under P-5 (§0.5): the cron entry is the off switch, not a flag.** No PostHog flag, no `useFeatureFlag`, anywhere.

### Portal files

| File | Change |
|---|---|
| `apps/designer-portal/src/components/document/hours-ledger.tsx` | the add row's `addValid` (`:273`) stops requiring a project; internal rows render in their own `— internal —` group with no project column and no rate |
| `apps/designer-portal/src/components/document/command-bar.tsx` | the "Log time" verb accepts no project |
| `packages/supabase/src/hooks/use-time-tracking.ts` | `projectId` becomes optional on `CreateTimeEntryInput` (`:286-298`); `studioId` added; `billable` forced false when `projectId` is absent |
| `packages/supabase/src/hooks/use-time-tracking.ts` — `CreateTimeEntryInput.source` | **W0-9.** Widen the union with `'internal'` (still `'timer_auto' \| 'timer_manual' \| 'manual_entry'` at `:328`). `00595` bought the DB vocabulary and the column COMMENT calls it live, but no TS caller can send it until the union moves. **W3 adds `'command_bar'`, W4 adds `'internal'`, W6 adds `'field_manual'`** — a TS error here is a missing widening, not a server problem |

**iOS:** none (Field's internal time arrives with W6's sheet).

### PostHog events

None new. `time_entry_logged` carries `source='internal'`. Lane D also lands the canonical event-name list as a doc comment in `document-events.ts` for lane C's `posthog-ios` call sites.

### Tests to write

| Path | Assertions |
|---|---|
| `supabase/tests/rls/internal_time_test.sql` (new) | asserted **per role** — an internal row is visible to its author; **invisible** to a member of another studio; visible to its own studio's `owner` and `admin`; `studio_id` **cannot** be aimed at another organization (00611); a **billable** internal row is refused by the `00610` CHECK; an internal row is **absent** from every project-scoped read and from `project_unbilled_time`; an internal row **cannot be invoiced** |
| `supabase/tests/commercial` (existing, unchanged) | the ceiling sums and `issue_invoice` paths are unaffected by the nullable `project_id` |
| `supabase/functions/time-nudges/index.test.ts` (new) | rule (a): a 9-hour running timer produces **exactly one** Record row across repeated sweeps, and **zero** email/SMS calls; rule (b) with the weekly body: only opted-in members are selected, and an opted-out member yields nothing; the default body never enters rule (b) |

### Gate commands (verbatim)

```
pnpm supabase:reset
python3 scripts/generate-legacy-grants.py
scripts/run-sql-tests.sh -d supabase/tests/rls
scripts/run-sql-tests.sh -d supabase/tests/commercial
scripts/run-sql-tests.sh -d supabase/tests/billing
pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts
deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test
pnpm --filter @patina/admin-portal build
```

> After any bare `deno` run, check for and delete an untracked `./deno.lock` at the repo root — `lock:false` only applies when `supabase/functions/deno.json` is loaded.

### Done-when (observable)

- An internal entry logged by the owner appears in her own scope and in the studio scope's `— internal —` group, is **absent** from every project scope, **cannot** be invoiced, and **cannot** be written against another studio's id — each asserted by the RLS suite, **not** by a UI render.
- `SELECT count(*) FROM cron.job WHERE jobname LIKE 'time-nudges%'` returns **1**.
- A nine-hour running timer produces exactly one Record row and no notification of any kind.
- `grep -rn "weekly_hours_reminder_opt_in" apps packages` returns nothing outside `database.types.ts`.

---

## §6 · W5 — The bookkeeper's Friday

| | |
|---|---|
| **Lane** | **B** — Sonnet. Branch `hour-tracking/w5-export` |
| **Depends on** | W2 (`time_entry_ledger` — REP-9: the CSV must not ship on the drifted view, which is why the repair is W0 and the view is W2) and W1 (`rate_source` is a column in the file) |
| **Ruled inputs** | HT-20, **HT-21** |

**Goal.** A file on Friday, and an invoice that names who did the work.

### Migrations

**None.** `00615` was reserved by charter §3 for this wave and is now **SPENT BY W2** — HT-3-e(2) / HT-3-f(2) landed in `00615_self_authored_rate_requires_ownership.sql` because W2's own band `00604–00607` was fully used (ruled 2026-09-12; corrected here after W2 review round 8, finding W2-R8-04, measured the two documents prescribing a collision). W5 mints **nothing**; `00616–00617` stay W6's. **`00620` is ALSO W2's** — `00620_legacy_project_studio_stamp.sql`, HT-3-g(2)'s one-off stamp of the legacy `projects.studio_id` population, ruled by Kody 2026-09-12 in the W2 round-11 fix pass; it was W7's unused reserve. The only unspent number in the program's range is now `00617`. The ship note must say `00615` AND `00620` are W2's, not that either is unused.

### Portal files

| File | Create/modify | What changes |
|---|---|---|
| `apps/designer-portal/src/lib/document/time-export.ts` | **create** | In-browser CSV generation from `time_entry_ledger`. Columns: `Member, Date, Project, Client, Activity, Billable, Duration (min), Rate, Rate Source, Rate Role, Amount, Billing State, Invoiced, Invoice #`. Delivery copies the proven blob pattern and header shape of `supabase/functions/qbo-export/index.ts:131-132` (the AP-side precedent; there is no AR/labour twin). Same direction as `lib/document/rooms/library/import-parse.ts` |
| `apps/designer-portal/src/components/document/hours-ledger.tsx` | modify | the **Export** act beside the studio scope; **rename** the existing `Export week → Accounts` act at **`:399`** so "Export" means a file (the R75 note at `:20` documents that it opens the composer) |
| `apps/designer-portal/src/lib/time-billing.ts:42-54` (`buildTimeLineDraft`) | modify | **HT-21.** The composer **names the person on every row**, instead of collapsing the week into one string (`:49` — `Design services — 4h 30m (3 entries)`, `qty=1`, naming no person and no day) |
| `apps/designer-portal/src/lib/document/invoice-composer.ts:150-165` | modify | one composer row per person; the client's folio keeps **one** `kind='time'` line |
| `apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx:829-842` | modify | render the **dated sub-table** (date · hours · rate) beneath the time line's description. The renderer already has a per-line `attribution` sub-slot at `:837-841` — extend that shape rather than adding a second one. **No staffing detail reaches the homeowner** (LEAH-15, REP-15) |
| per-client **statement** | modify | reuses R75's composer selection UI; no new route |

**iOS:** none. **Edge/cron:** none. **No QuickBooks integration** (§8 side journey, C23).

### PostHog events (lane D emits, lane B calls)

`time_export_taken` (`scope`, `row_count`, `period`).

### Tests to write

| Path | Assertions |
|---|---|
| `apps/designer-portal/src/lib/document/__tests__/time-export.test.ts` (new) | column order; RFC-4180 escaping (a note containing a comma, a quote, a newline); an **internal** row's empty project cell; an entry by a **non-org-member roster vendor** present (the W0 LEFT JOIN's payoff); the amount column sums to the ledger total |
| `apps/designer-portal/src/lib/__tests__/time-billing.test.ts` (**extend — exists**) | the named-person composer row; one `kind='time'` folio line retained |
| `apps/client-portal/src/app/pay/[token]/__tests__/invoice-sheet-time-subtable.test.tsx` (new) | the dated sub-table renders date · hours · rate and **no member name** |

### Gate commands (verbatim)

```
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test
pnpm --filter @patina/designer-portal lint
```

> `client-portal` enforces a coverage floor (lines 70 / branches 60 / functions 70 / statements 70) — a new untested branch in `invoice-sheet.tsx` fails the gate, not just the assertion.

### Done-when (observable)

- A studio-scope CSV opens in a spreadsheet with **one row per entry**, every row naming a person and a day; the amounts sum to the ledger's total.
- A composer row names the person.
- The client's folio shows **one** priced line with a dated sub-table and **no** staffing detail.
- The ledger's "Export" act produces a file; the composer hand-off act has a different name.

---

## §7 · W6 — Patina Field: an hour that is not a visit

| | |
|---|---|
| **Lane** | **C (Opus)** — worktree `.codex/worktrees/agent-ios`. Branch `hour-tracking/w6-field-hours` |
| **Depends on** | W3 (`log_time`, and the billable semantics the sheet's toggle seeds from), W1 (the server resolves Field rows' rates), and W0's **HT-33** governance entry — without it a literal §8 test parks this wave as a side journey |
| **Ruled inputs** | **HT-7**, HT-16, HT-17, HT-18, HT-19, **HT-41**, **P-6** |

**Goal.** The field worker logs a drive, a call, a sourcing run or admin time from a phone with one bar, and corrects a visit's duration before it becomes money.

### Migrations (00616–00617)

| # | Slug | What it does |
|---|---|---|
| **00616** | `time_entry_activity_travel.sql` | **HT-19.** Widens the `activity` CHECK (`00198:27-29`, today `design/sourcing/client/site_visit/admin`) with `'travel'`. **The `activity` CHECK is INLINE and UNNAMED** — unlike `source`, whose name `project_time_entries_source_ck` was bought by `00545:147-149`. So this migration uses **`00545:33-43`'s resolve-by-content `DO` block** against `pg_constraint` to find and drop the 00198-era constraint by what it **says** rather than what it is **called**, then adds a deliberately **NAMED** `project_time_entries_activity_ck` so the next widening is cheap. This is a CHECK, not a Postgres enum, so the widening and any use of the value may share a migration |
| **00617** | — | **UNUSED.** architecture.md's `head+23` reserve. Left unused |

**RLS changes:** none. Field writes own rows on projects its user is rostered to, which `00177:144-146` and `00316:242-246` already permit, and W0's `00597` seats an un-rostered logger.

**TS vocabulary (W0-9).** `CreateTimeEntryInput.source` in `packages/supabase/src/hooks/use-time-tracking.ts:328` is still `'timer_auto' | 'timer_manual' | 'manual_entry'`. This wave widens it with **`'field_manual'`** (W3 adds `'command_bar'`, W4 adds `'internal'`); `00595` bought the DB value already, so a TS error there is a missing widening, not a server problem.

### iOS files (`apps/mobile/Capture`, targets `Capture` + `CaptureKit`)

> **Path correction:** CaptureKit sources live under **`CaptureKit/CaptureKit/…`** (doubled segment), not `CaptureKit/…` as architecture.md writes.

| File | Create/modify | What changes |
|---|---|---|
| `Capture/Features/Time/LogTimeSheet.swift` | **create** | project (pre-filled from `CaptureKit/CaptureKit/Session/CaptureSessionContext.swift`), duration stepper, activity, billable toggle, date, **role chip when the member holds more than one roster role** (HT-41). 3 fields + 3 taps |
| `CaptureKit/CaptureKit/Companion/FieldCompanionPresentation.swift:51-54` | modify | a third `FieldCompanionActionID` case `logTime = "time.log"` (today exactly two: `openVisit`, `endVisit`). **Exposed only in the expanded state** — MOB-11 is binding: the collapsed strip carries exactly one action and that slot is "End visit" (`FieldCompanionCollapsedPresentation` at `:56-64` holds a single optional `action`) |
| `Capture/Features/Work/WorkDashboardScreen.swift:333-394` | modify | the **7th** Browse tile. Six `browseTile(` calls today at `:349,356,363,370,377,384`; the 7th goes at `:391` inside the same `LazyVGrid` (`:343`). Also hosts the read-only **"My hours this week"** list: day · project · minutes · activity · billing state, plain text, **own scope only** — never a member, project or studio scope on a camera-first one-handed screen handed to trades (MOB-8) |
| `Capture/Features/Session/V4VisitReviewScreen.swift:303-330, :367` | modify | **HT-16.** A **stepper** on the visit-close offer plus a billable toggle, defaulted to the **active** duration rather than wall clock. Today `:367` passes `durationMinutes: summary.elapsedMinutes` with no editor |
| `CaptureKit/CaptureKit/Session/VisitReview.swift:52-83` | modify | `VisitReviewComposer.summarize` gains an **active** duration alongside `elapsedMinutes`: visit start → the **last Specimen** timestamp, from the already-sorted `ordered` array at `:58`. Today `:75` is pure wall clock (`now.timeIntervalSince(startedAt)`, floored to 1 min per the `00177:20` CHECK). `elapsedMinutes` is **kept** (19 existing `VisitReviewTests` assert it) and the new field is additive |
| `CaptureKit/CaptureKit/Domain/TimeEntryOutboxRecord.swift` | **create** | A **sibling** of `FieldVisitCloseRecord`, copying its `@Attribute(.unique)` client-minted id (`FieldVisitCloseRecord.swift:17`) and `retryDelay(attempt:)` (`:55-58`). **`FieldVisitCloseRecord` is load-bearing and covered by ~30 tests — leave it alone** |
| `Capture/Features/Session/TimeEntryOutboxDrainer.swift` | **create** | A sibling of `VisitCloseOutboxDrainer` (visit-specific, covered by ~49 tests across two suites). **Do not generalize the tested class into a two-queue drainer** — that is the larger change, not the smaller (FS-44) |
| `Capture/Services/Sync/SupabaseFieldWriteGateway.swift:69-71` | modify | `client.rpc("log_time", …)` in place of the raw `client.from("project_time_entries").insert(request)`. `TimeEntryWriteRequest` (`FieldVisitCloseRecord.swift:121-176`) gains `billable` and a settable `activity` (today hardcoded `"site_visit"` at `:137,149`) and a `rateRole`; **`hourly_rate_cents` is omitted** — the server owns it after W1 |
| `CaptureKit/CaptureKit/Persistence/CaptureStore.swift:80-85` | modify | register `TimeEntryOutboxRecord.self` in `schema` (today 7 models) |
| `apps/mobile/Capture/CaptureWidgets/`, `apps/mobile/Capture/CaptureShareExtension/` | **delete** | Verified **empty** directories, and `grep CaptureWidgets\|CaptureShareExtension Capture.xcodeproj/project.pbxproj` returns **nothing** — they are not targets. The widget is not in v1. **No third state: either they are targets or they are gone** |

**Edge/cron:** none.

### PostHog events (lane C call sites, names from lane D's canonical list)

`time_entry_logged` with `surface='field_sheet'` / `'field_visit'` and `source='field_manual'` / `'field_visit'`, via `posthog-ios`. This is the data HT-27 requires before any widget or intent decision is taken.

### Tests to write

| Path | Assertions |
|---|---|
| `CaptureTests/TimeEntryOutboxRecordTests.swift` (new) | the unique client-minted id; `retryDelay(attempt:)` parity with `FieldVisitCloseRecord`; a replayed drain inserts once |
| `CaptureTests/LogTimeSheetTests.swift` (new) | 3 taps to a logged drive; `activity='travel'`; an explicit `billable`; the role chip appears only for a multi-role member; **the sheet can never express a nil duration** (HT-7 / `00177:37-41`) |
| `CaptureTests/VisitReviewTests.swift` (**extend — 19 tests exist**) | the active-duration default (visit start → last Specimen); the stepper's bound; `elapsedMinutes` unchanged for every existing assertion |
| `CaptureTests/CaptureStoreMigrationTests.swift` (new) | **The SwiftData migration assertion (FS-45), not optional.** Open a store written by the **previous** schema with the **new** schema and assert `didResetIncompatibleStore == false` (`CaptureStore.swift:54`). The open ladder logs "Set aside incompatible store at …; retrying" at `CaptureStore.swift:294` — i.e. the failure mode here is **destroying queued, unsynced billable hours.** A green `capture-gate.sh` does not cover this |
| `supabase/tests/field/time_entry_field_visit_source_test.sql` (existing) | must still pass with the widened `activity` CHECK and the named constraint |

### Gate commands (verbatim)

```
cp apps/mobile/Capture/Capture/App/Configuration/Secrets.example.swift \
   apps/mobile/Capture/Capture/App/Configuration/Secrets.swift
ruby apps/mobile/Capture/scripts/generate_project.rb
apps/mobile/Capture/scripts/capture-gate.sh all
pnpm supabase:reset
scripts/run-sql-tests.sh -d supabase/tests/field
scripts/run-sql-tests.sh -d supabase/tests/billing
pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts
```

> `capture-gate.sh` regenerates the project itself, so the explicit `generate_project.rb` line is belt-and-braces for a fresh worktree; the `Secrets.swift` copy is **required** — it does not follow `git worktree add`.
>
> **P-6 governs the claim level.** The Simulator gate is **sufficient to ship**; Kody walks the device afterwards. Every W6 claim is therefore reported as **sim-verified**, never device-verified. The airplane-mode drain walk (log → kill app → reconnect → `SELECT` the row server-side) is **Kody's post-ship step**, and until he runs it the drain is **unverified** — say so in the ship note rather than implying otherwise. Any device-automation call made during development passes an **explicit UDID**, never the default `"booted"` (a connected iPhone beside a booted Simulator returns an empty UI tree).

### Done-when (observable)

- `capture-gate.sh all` green; `generate_project.rb` ran (files were added).
- `CaptureStoreMigrationTests` asserts `didResetIncompatibleStore == false` against a previous-schema store.
- A visit left open for three hours offers the **active** duration, not three hours, and the stepper moves it (sim-verified).
- A drive logged from the Browse tile lands with `source='field_manual'`, `activity='travel'` and an explicit `billable` — confirmed by a **`SELECT`**, not a UI "synced" state (sim pass against a local stack; prod device pass is Kody's).
- `grep -rn "CaptureWidgets\|CaptureShareExtension" apps/mobile/Capture` returns nothing.

---

## §8 · W7 — Rate cards bind to the roster role enum

| | |
|---|---|
| **Lane** | **B** — Sonnet (charter §3: "W7 picker"). Branch `hour-tracking/w7-rate-binding` |
| **Depends on** | W1 (the resolver this binding feeds) |
| **Ruled inputs** | **HT-4**, **HT-41**, HT-34 *(rule (a) — implemented in W4, §5)*, HT-39 *(unruled)* |

**Goal.** Remove the string match at the root of the stranded-hours defect.

### Amendments the rulings force

| Ruling | architecture.md said | plan-v2 does |
|---|---|---|
| **HT-4** | bind to a **person or** a roster role; resolver prefers `user_id` → `roster_role` → legacy label | **enum binding, not person binding.** `roster_role` only. **No `user_id` column.** Charter §2: *"Enum binding, not person binding (W7 becomes a picker on the enum + a normalisation migration, smaller)."* **The ruling wins** — architecture.md's `head+24` `ADD COLUMN user_id` is dropped |
| **HT-34 (a)** | the `time-nudges` edge function + cron live in W7 | **moved to W4** (lane D, `00614`) per charter §3 and the brief. W7 carries no edge function |
| **HT-39** | `head+26` is either a writer for `project_phases.estimated_hours` or a drop of the column and its read | **HT-39 is UNRULED** (`rulings.md` row 45, empty Ruling cell). So **no migration is written**, and **`useUpdatePhaseEstimates` (`use-time-tracking.ts:791`) is NOT deleted**. `project_phases.estimated_hours` (`00177:88`) stays a budget you can read and never set, and no migration is minted for it. **Recorded as an owed ruling in §12, not resolved in code.** (`00620` — named here as HT-39's slot — is spent by W2 for HT-3-g(2)'s one-off legacy stamp) |

### Migrations (00618–00620)

| # | Slug | What it does |
|---|---|---|
| **00618** | `authority_rate_role_binding.sql` | `project_billing_authority_rates ADD COLUMN IF NOT EXISTS roster_role text CHECK (roster_role IS NULL OR roster_role IN ('lead_designer','support_designer','bookkeeper','vendor'))` — the `project_team_members.role` value set at **`00084:164-165`**, which is a **TEXT CHECK, not a Postgres enum**, and whose full set also includes `'client'`, deliberately excluded (HT-4 names four). A **normalisation** step populates `roster_role` for existing rows whose `role_name` does normalize-match the enum (and leaves the rest NULL — not a backfill of money, so P-4 is not engaged: no `project_time_entries` row is re-priced). Redefines `resolve_time_rate_cents` grafted from **`00599`**: prefers `roster_role` → then the legacy `regexp_replace(replace(lower(btrim(role_name)),'_',' '),'\s+',' ','g')` match (`00578:2731-2733`) for already-materialized rows. Immutability and versioning (`source_rate_id` + `version`) unchanged |
| **00619** | `countersign_rate_binding_carry.sql` | The countersign materialization path that creates `project_billing_authority_rates` from `proposal_service_rates` (`00575:1798-1799`, `00577:2470-2471`) carries `roster_role` through |
| **00620** | `legacy_project_studio_stamp.sql` | **SPENT BY W2, not W7** (HT-3-g(2), ruled by Kody 2026-09-12). HT-3-g(1) deletes every read-time derivation of the pricing studio, so a legacy `studio_id IS NULL` project prices `'none'` for everyone; this migration applies HT-3-b's tier rule ONCE, at ship, through the shared `designer_tier_pricing_studio` body — unambiguous rows get their studio, ambiguous rows stay NULL, idempotent, counts in a NOTICE, no time entry touched (P-4). HT-39's former claim on this slot never materialised (HT-39 is unruled, so no migration was written for it) |

**RLS changes:** none.

### Portal files

| File | Change |
|---|---|
| `apps/designer-portal/src/components/document/rooms/drafting/agreement/part-editor.tsx:418-427` | the rate-card part **picks a roster role from the four-value enum** instead of typing a label. Today `:420` is a free-text `placeholder="Principal designer"` and `:423` the rate input |
| `apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx:234-241` | the shipped default `roleName: "Principal designer"` at **`:238`** goes — it can never normalize-match `lead_designer`, which is the root of defect #2. The default seed becomes `roster_role: 'lead_designer'` |
| `packages/supabase/src/hooks/use-time-tracking.ts:791` | **`useUpdatePhaseEstimates` is NOT deleted** — HT-39 unruled (above) |

**iOS:** none. **Edge/cron:** none (moved to W4).

### PostHog events

None new.

### Tests to write

| Path | Assertions |
|---|---|
| `supabase/tests/commercial/design_services_authority_test.sql` (**extend**) | a rate card bound to `roster_role='lead_designer'` resolves for that member **regardless of label**; a legacy label-only card still resolves **as before**; a card whose `role_name` is `"Principal designer"` and whose `roster_role` is `'lead_designer'` prices a new hire's entry with `rate_source='authority'`; a **two-role** default card with both `roster_role`s set resolves via the member's `rate_role` pick (HT-41) rather than stranding |
| `supabase/tests/commercial/agreement_fee_schedules_test.sql` (**extend — exists**) | the countersign path carries `roster_role` onto the materialized rows |
| `apps/designer-portal/src/components/document/rooms/drafting/agreement/__tests__/part-editor-role-picker.test.tsx` (new) | the picker offers exactly four values; `'client'` is absent; free text is not accepted |

### Gate commands (verbatim)

```
pnpm supabase:reset
python3 scripts/generate-legacy-grants.py
scripts/run-sql-tests.sh -d supabase/tests/commercial
scripts/run-sql-tests.sh -d supabase/tests/billing
pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test
pnpm --filter @patina/designer-portal lint
pnpm --filter @patina/admin-portal build
```

### Done-when (observable)

- A default two-role rate card created by the drafting room prices a new hire's entry with `rate_source='authority'` (a `SELECT`, per role).
- A pre-existing label-only card still prices as before — `supabase/tests/commercial` green.
- `grep -rn "Principal designer" apps/designer-portal/src` returns nothing in the drafting room's default seed.

---

## §9 · The docs task (HT-30) — lane A, W0, zero code

Three dated governance entries, committed in W0 with dates, before any `§8`-test argument can park W6.

### 9.1 · `docs/vision/VISION.md` §6 — the exact sentence to add

Insert as a new bullet immediately after the existing bullet at **`VISION.md:73`** (`**Tab / zone / dashboard UI, shadows, red/green status, badges.** One living Document, typography-first.`), at the same indent:

> - **The one exception, and its test.** A ledger is not a dashboard: a total is permitted as the **front matter of the rows that produced it**, and a total with no rows beneath it is a dashboard. The Hours sheet is a permitted reporting surface on exactly that condition. Nothing here licenses a utilisation score, leaderboard, ranking, streak, target, burn-down, progress bar, sparkline or red/green state — those stay refused (V11, 2026-09-11).

- Nothing else in §6 changes. The bullets at `:70-72` and `:74-76` are untouched.

### 9.2 · `docs/vision/VISION-DECISIONS.md` — the V-entry

**Number correction:** the task brief asks for a **V7** entry. **V7 is taken** (`VISION-DECISIONS.md:81` — *"V7 · The iOS app may use a tab bar — 2026-09-02"*), as are V8 (`:108`) and V9 (`:144`); the file's own footer reads `last id = V9`. **The entry is therefore V11.** Flagged in the report.

Append a new section after the `## Ruled — 2026-09-08 (portal polish)` block, matching the existing heading shape:

> ## Ruled — 2026-09-11 (hour tracking)
>
> ### V11 · A ledger is not a dashboard — §6 strengthened, not weakened — 2026-09-11
>
> **Ruled.** VISION §6's refusal of dashboards gains one explicit exception, written as a test rather than as a carve-out: **a total is permitted as the front matter of the rows that produced it; a total with no rows beneath it is a dashboard.** The Hours sheet is a permitted reporting surface on exactly that condition — its scope lens (mine · a member · this project · the studio) shows day-grouped rows in every scope, and every total it prints sits above the rows it came from.
>
> **This strengthens §6; it does not relax it.** The refusal now has a falsifiable test, so the next proposal for a tile, a card, or a "studio week at a glance" number is refused by rule rather than by taste. Specifically still refused, and named so they cannot be re-argued as polish: a per-member utilisation score, a leaderboard, a ranking, a streak, a target, a burn-down, a progress bar, a sparkline, a red/green state, a bare studio total on the Desk `hours` card (HT-29 — the card is act-bearing or absent), a `/hours` page, an admin-portal hours route, a tab bar, and a staff dropdown ranked by hours (HT-8, HT-32). The billing-state chip stays as built — a 1px-bordered text pill with no fill, which is a table's state column and not a status badge (HT-40).
>
> **Two companion entries ruled the same day, recorded here because both are VISION-level and neither costs a line of code:**
>
> - **Patina Field is The Document off-desk, not a fourth surface** (HT-33). §5's ranking is unchanged: The Document → the iOS app → the marketplace. Field's capture surfaces are doors into The Document's own Hours ledger, so a literal §8 test does not park them as a side journey.
> - **D9 is amended** (HT-32) to read: *capture belongs wherever the work happened; review belongs only in the drawer ledger, never a page.* The old wording was at once too narrow to authorise ⌘K / Field capture and too weak to forbid the `/hours` page someone will propose.
>
> **Source:** Kody, 2026-09-11 — `artifacts/hour-tracking-2026-09-11/rulings.md` (**HT-30**, **HT-32**, **HT-33**), the panel synthesis `artifacts/hour-tracking-2026-09-11/synthesis.md`, and the build plan `artifacts/hour-tracking-2026-09-11/build/plan-v2.md`.

Update the footer line to:

> *Entries add: C1 · S1–S6 · V1–V7 · V8 · V9 · V11 · last id = V11 (V10 is the people-room program's; reconcile order at merge)*

### 9.3 · `docs/design/the-document/DECISIONS.md` — append-only

Append (never rewrite) the new R-numbers for this program after the current tail, carrying: the scope lens (amending **R77**, `:2648`), the billable control at every capture surface and the activity honesty rule (amending **D10**, and **R20**'s write-first close-out at `:679`), the backdated mark, the auto-start disclosure band + per-member opt-out (amending **R19**), the role chip, and the quiet Record row for a running timer over 8 h (under **R82**, `:2668`). **R64** (`:2359`) keeps its 30-minute number; only its **scope** wording extends to any clock-derived duration, Field included (HT-17).

---

## §10 · Deletions, with paths

| # | Thing | path:line (verified, origin/main) | Wave | Gate before deleting |
|---|---|---|---|---|
| 1 | The compensating detach in `useClaimTimeEntries` — a **live money bug**: `.update({invoice_id:null}).eq('invoice_id', invoiceId)` detaches every entry on the invoice | `packages/supabase/src/hooks/use-time-tracking.ts:617-619` (post-move) | W0 | `claim_time_entries` (00595) lands first |
| 2 | `project_unbilled_time`'s INNER `JOIN public.profiles` | `00412:2685` (hazard `00555:3024-3026`) | W0 | **keep the view name** — readers at `hours-ledger.tsx:161`, `use-time-tracking.ts:159,706`, `design_services_authority_test.sql:221,349,362` |
| 3 | `project_unbilled_time`'s `change_order_terms → profiles.default_hourly_rate_cents → 0` rate chain | `00412:2675-2678` | W0 | with #2, one redefinition (00596) |
| 4 | `useTimeEntries` | `use-time-tracking.ts:118-148` | W0 | 0 callers |
| 5 | `useTimeSummary` — **the hook wrapper only** | `use-time-tracking.ts:271-298` | W0 | **keep `fetchTimeSummary`** — live caller `apps/designer-portal/src/hooks/use-projects.ts:481` |
| 6 | `useReleaseTimeEntries` | `use-time-tracking.ts:634-651` | W0 | 0 callers; nothing ever releases an entry. Note its body holds a **second** invoice-wide detach at `:642-643` — it goes with the hook |
| 7 | The stale section comment `// ── Studio time report (the Hours book — /desk?book=hours) ──` | `use-time-tracking.ts:653` | W0 | documents a book that never shipped |
| 8 | `projects.change_order_terms->>'hourly_rate_cents'` as a rate leg | `00412:2677,2680`; legacy writer `apps/designer-portal/src/hooks/use-scope-builder.ts:945-950` | W1 | the resolver (00599) lands first. **Ruled by HT-1** |
| 9 | The `profiles.default_hourly_rate_cents` **resolver leg** | `00412:2678,2681`; column `00177:89` | W1 | **the column is NOT dropped** — HT-2 is unruled; `rate_source` reserves `'profile_default'` so one resolver branch restores it |
| 10 | The `pending_authorization` dead-end badge and the silently-null provenance label | `hours-ledger.tsx:184` (the query) + its badge render; `lib/document/authority-hours.ts:80` (`return null`) | W1 | replaced by a doorway and "rate pending" (HT-26) |
| 11 | The drip link `?sheet=hours` | `docs/marketing/founding-onboarding/copy-deck.md:357,379,627` vs `desk-doorway.tsx:84,132` (unknown values ignored silently, `:41-42`) | W2 | one alias; a live founding-cohort CTA lands on a bare Desk today |
| 12 | The help article's two studio-scope sentences | `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15` | W2 | **made true, not deleted** (the panel's preference); pushed to Sanity |
| 13 | Gap-matrix rows BIL-04 and BIL-08 | `docs/design/the-document/portal-vs-desk-feature-gap-matrix-v2.md:189,193` | W2 | BIL-04 closed by R75 (`hours-ledger.tsx:380-400`); BIL-08 reopened as the rate-display drift, not as absence |
| 14 | **`useStudioTimeReport`** | `use-time-tracking.ts:689-781` | **W2** | **DELETED — HT-37 ruled.** architecture.md §13 row 22 says "NOT deleted" and wires it; **the ruling wins.** The INVOKER rollup RPC (00607) lands first. FS-5's objection ("the single biggest avoidable cost in the program") is recorded and overruled |
| 15 | The `23505` toast branch in `useStartTimer` | `use-time-tracking.ts:480-484` | W3 | `start_timer` (00608) lands first, returning **both** rows |
| 16 | The implicit `billable: input.billable ?? true` default | `use-time-tracking.ts:320` — **one site, not two**; `:467` is a conditional assign | W3 | every surface carries the control first; then a missing value is a caught bug |
| 17 | The log strip's `'design'` activity default | `apps/designer-portal/src/components/document/log-strip.tsx:30` (initial state) and `:36` (reset) | W3 | replaced by "activity not set", never by a required tap (HT-24) |
| 18 | `apps/mobile/Capture/CaptureWidgets/`, `apps/mobile/Capture/CaptureShareExtension/` | verified **empty**; `grep` of `Capture.xcodeproj/project.pbxproj` returns **nothing** for either name — not referenced, not targets | W6 | the widget is not in v1, so these go. **No third state** |
| 19 | The shipped default rate-card label `"Principal designer"` | `service-agreement-drafting-room.tsx:238` (seed) and `part-editor.tsx:420` (placeholder); enum `00084:164-165` | W7 | the `roster_role` binding (00618) lands first |
| 20 | The draft's DEFINER rollup, its `studio_id`-keyed RLS policy, and every new call site on `user_is_org_member` | `architecture-draft.md:44,50`; `00021:484-487` | — | dropped from the plan outright, not built then removed |
| 21 | Stale line citations in `architecture.md` | the table at the head of this file | W0 | `architecture.md` is an input, not a record; this file supersedes it |
| **NOT deleted** | `useUpdatePhaseEstimates` | `use-time-tracking.ts:791` | — | **HT-39 is unruled.** Neither re-homed nor dropped. Logged as owed in §12 — *not* both-and-neither by accident, but by an explicit deferral |
| **NOT deleted** | `profiles.default_hourly_rate_cents` (the column) | `00177:89` | — | HT-2 unruled; the column drop waits a cycle after the view rewrite is live (FS-22) |
| **verify first** | The stale spec pointer in `docs/design/the-document/CLAUDE.md` | per briefing §2 — **not re-verified by any seat** (FS-146, VET-26) | W0 | **verify the pointer exists before fixing it.** If it does not, record that and move on |

---

## §11 · Merge order, integration branch, shared-state ownership

### Integration branch

```
git fetch origin
git worktree add .codex/worktrees/agent-integration -b hour-tracking/integration 2ff00bb2b
```

- `hour-tracking/integration` is cut from **`origin/main` @ `2ff00bb2b`** (charter §3). Every lane branches from it, never from the stale local `main` (local head `00580`, 11 migrations behind).
- Merges are **real merges, not squashes**, lowercase `merge(hours): …`.
- Numbers are **provisional**: before each merge, re-check `git ls-tree --name-only hour-tracking/integration supabase/migrations/ | sort | tail` and bump the **undeployed** side — filename **and** internal banner — if anything collided.
- **P-3: one ship at the end**, after W7 passes its gate and the final review is clean. There are **no per-wave ship gates** — every "Ship gate" line in architecture.md §1–§8 becomes a **Done-when** above.

### Merge order (charter §4)

| Step | Action |
|---|---|
| 1 | Lane A's **W0** (`00595–00597`) merges first. Nothing forks before it lands — it moves the hook module every later wave edits. |
| 2 | Lane A's **W1** (`00598–00603`) merges second. |
| 3 | Lanes **B** and **C** branch from `hour-tracking/integration` **only after W1 lands**. |
| 4 | Lane **D** branches and merges any time — **except** `00614`, which must merge **after** lane A's `00610–00613`. |
| 5 | **W2 DB** (lane A, `00604–00607`) lands **before** W2 UI (lane B). |
| 6 | W3 (B) and W5 (B) merge in that order; W4 (A) and W6 (C) and W7 (B) merge last, in any order. |
| 7 | **Final integration review: two adversarial lenses, Opus, separate context, neither the implementer.** Reviewer briefs report **every** finding with confidence + severity — never "only high-severity" (severity filters depress recall). Must return **clean** before the single ship. |
| 8 | Ship chain (`patina-deploy`): `supabase db push` → `supabase functions deploy time-nudges` (lane D's only function; no `_shared/*` was edited, so no fan-out redeploy is owed — **re-verify with `grep -rl "_shared/" supabase/functions/time-nudges/index.ts` before claiming that**) → `./infra/deploy-portal.sh designer-portal` → `./infra/deploy-portal.sh client-portal` (W5 touches it) → verify with `wrangler deployments list` (oldest-first, read the **bottom** row) **plus behaviour probes** — `/version` returns static defaults on the live path, so version strings prove nothing. |
| 9 | iOS ships via TestFlight after `capture-gate.sh`. |

### `supabase db reset` ownership — one owner per MACHINE, not per program

> **Amended 2026-09-11 (W0-13).** The table below is necessary and **not sufficient**: it only
> serialises resets *inside this program*. The local Supabase stack is **one machine-wide resource**,
> and another program reset it three times during W0's review round (`pg_postmaster_start_time()`
> moved at 19:10:23, 19:14:50 and 19:20:05 UTC, from `.codex/worktrees/agent-people-build`, three
> concurrent reset processes at one point). The damage it did was not a failed gate but a **lying**
> one: a billing run failed *spuriously* on `project_time_entries_source_ck` because a foreign reset
> had replaced this program's objects while leaving its own `00595–00597` in the ledger, and a later
> probe found `claim_time_entries` simply gone. So:
>
> - **The reset owner is per-machine.** Serialise `supabase db reset` across ALL concurrent programs —
>   a lock file, or one program at a time — or give each program a **port-isolated stack**. Until that
>   exists, announce resets where every concurrent program can see it.
> - **Every DB gate claim must be bracketed by an object probe** — `pg_proc` / `pg_constraint` /
>   `pg_policies` / the viewdef, before and after the run. A green suite on a contended stack proves
>   only that the stack held still for that moment; the migrations ledger proves nothing at all
>   (`patina-db-migrations` step 7).
> - **A spurious failure is not a finding.** Re-probe the objects before believing one, and say in the
>   report which probe bracketed which run.


| Phase | Concurrent | `supabase db reset` owner | Everyone else |
|---|---|---|---|
| **1** | W0 alone (A) | **A** | — |
| **2** | W1 (A) ∥ W2 UI (B) | **A** | B runs against A's reset output **or** a port-isolated stack; B never resets |
| **3** | W3 (B) ∥ W5 (B) | **B** | W5 needs no DB; B owns port 3000 and the stack |
| **4** | W4 (A) ∥ W6 (C) ∥ W7 (B) ∥ lane D | **A** (its RLS suite needs a clean replay) | C owns the Simulator + `capture-gate.sh`; D owns `supabase functions serve`; B runs against A's output. A announces each reset before running it |

**Shared-file ownership inside phases** (the only real conflict surfaces):

| File | Owner | Rule |
|---|---|---|
| `apps/designer-portal/src/components/document/hours-ledger.tsx` | **W2 (lane B)** | W1's rate column and W3's add-row date/pill land as **follow-commits on the integration branch after W2's lens**, never as parallel edits |
| `apps/designer-portal/src/lib/analytics/document-events.ts` | **lane D** | sole writer for the whole program; B and C call the emitters it lands |
| `packages/supabase/src/hooks/use-time-tracking.ts` | **lane A in W0**, then whichever wave owns the change, one at a time | W0 lands the move + deletions before anything forks |
| `apps/designer-portal/src/components/document/command-bar.tsx` | **W3 (B)**, then W4 (A) as a follow-commit | |
| `supabase/migrations/` | per the reserved ranges | re-checked at every merge |

### Type regeneration ownership

- **The lane that writes a migration runs `pnpm db:generate` and commits `packages/supabase/src/database.types.ts` with it.** Lane A for `00595–00607` and `00610–00613`; lane B for `00608` and `00618–00619`; lane C for `00616`; lane D for `00614`.
- **The integration owner re-runs `pnpm db:generate` once on `hour-tracking/integration` after every merge** and commits the single canonical file. `database.types.ts` is **generated** — resolve its merge conflicts by **regenerating**, never by hand-merging. Proof after each merge: `git diff --exit-code packages/supabase/src/database.types.ts` is clean.
- **Same discipline for the second generated file every lane will touch:** any migration containing a top-level GRANT or REVOKE (on this numbering: `00595, 00597, 00598, 00599, 00607, 00608, 00614, 00618` — decide by `grep -lE '^\s*(GRANT|REVOKE)'`, never by the list; see §0.20, finding m4) requires `python3 scripts/generate-legacy-grants.py`, which rewrites `supabase/seed/00-legacy-grants.sql`. Regenerate on the integration branch after every merge; never hand-merge it; never hand-edit it. **architecture.md does not mention this file and it will conflict in every lane.**

---

## §12 · Risks that survived the rulings, each with the test that catches it

| # | Risk | Severity | The test that catches it |
|---|---|---|---|
| 1 | **The classifier rewrite silently re-rates history.** 222 lines (`00578:2599-2820`), redefined twice already, holding ceiling accrual, retainer gating, a project-level `FOR UPDATE` (`00578:2675,2692`) and three immutability raises. W4's `00613` redefines it a **fourth** time. | highest | `scripts/run-sql-tests.sh -d supabase/tests/commercial` green **unchanged** after `00601` and again after `00613` — **not** a type-check. The resolver is a **separate** function; the classifier delta is one call plus three branch fixes with the immutability raises copied verbatim. P-4 removed the backfill, so no historical row is touched at all |
| 2 | **Nullable `project_id` writes internal time and then hides it.** All nine policies resolve through `project_id`; a NULL makes every one false. | high | `supabase/tests/rls/internal_time_test.sql` asserts the **positive** case (author sees it), the **negative** case (cross-studio cannot), and the **invisibility** case (it is absent from every project-scoped read and from `project_unbilled_time`) — all before the portal is touched. `00612` lands in the **same migration set** as `00610`'s `DROP NOT NULL` |
| 3 | **`studio_id` becomes a cross-studio write hole.** | high | `internal_time_test.sql`'s anti-aiming assert, per role: a member cannot point `studio_id` at an organization they are not an active member of. `00611` **replicates `00317:31-47`** rather than trusting the `00610` CHECK |
| 4 | **The audit trigger silently rolls back every admin adjust.** `audit_logs` has RLS with no INSERT policy (`00021:261,423,426`). An INVOKER trigger fails the insert and the UPDATE with it. | high | `supabase/tests/rls/time_entry_admin_write_test.sql` asserts the `audit_logs` row **exists** after an admin adjust, with both value sets — i.e. the adjust and the trace are asserted together, so a DEFINER regression fails the suite rather than the user |
| 5 | **`00606` (HT-10) is a widening-in-reverse.** Narrowing `time_entries_studio_read` is a cross-cutting RLS change landing mid-program. | medium | It is the **only** change in `00606`, so it reverts without touching the lens. `studio_hours_rollup_test.sql` asserts per role what a plain `member` can and cannot read after the narrowing. `supabase/tests/rls/people_directory_scope_test.sql` and `project_roster_test.sql` must stay green |
| 5b | **HT-25's "removable by the owner" does not stick.** `00597`'s `ON CONFLICT … DO UPDATE SET removed_at = NULL` re-seats a member the owner removed, on the member's next log, with no audit row and no notice. | medium (trust, not code) | **Logged as owed ruling HT-25-a** in `rulings.md` — stated, asserted (case (d)), and not buried in a test comment. If removal must stick, the fix is to delete the `ON CONFLICT` re-seat arm and let the insert fail `Team can log their own time entries`, with a W3 affordance. The project's own designer is a separate case and is already closed — `00597` never seats her (case (f)) |
| 5c | **The `VISION.md` §6 bullet V11 owes is undeliverable from a lane.** `docs/vision/VISION.md` is **untracked** (`git ls-files docs/vision/` returns only `VISION-DECISIONS.md`), so the bullet V11 records verbatim cannot be committed by any wave. | low (governance) | **Orchestrator decision, not a lane's:** either Kody pastes the bullet into his working copy after `VISION.md:73`, or someone deliberately tracks `docs/vision/VISION.md` as its own governance act. The bullet's text cites **`(V11, 2026-09-11)`** — renumbered with the entry (§0.2b); paste the renumbered text, not the pre-merge draft |
| 6 | **HT-10's literal text is not fully implementable.** The ruling says members read *own rows plus aggregates*; `Team can view their project time entries` (`00484:811-814`) grants a rostered member every row of that project, notes included, and 00484 registers it as a protected contract (§0.17). | medium (trust, not code) | Stated, not silently resolved: `studio_hours_rollup_test.sql` asserts exactly what the narrowed model does grant, per role, so the gap is documented in an assertion rather than in prose. **Logged as HT-10-a — a ruling Kody still owes** |
| 7 | **The `activity` CHECK name appears in no migration** (unlike `source`, named by `00545:147-149`). | low | `00616` uses `00545:33-43`'s resolve-by-content `DO` block and raises if it cannot find the 00198-era constraint (`00545:140-144`'s `RAISE EXCEPTION` precedent); `supabase/tests/field/time_entry_field_visit_source_test.sql` must stay green after the widening |
| 8 | **The SwiftData schema change destroys queued, unsynced billable hours.** The open ladder "sets aside an incompatible store and retries" (`CaptureStore.swift:294`). | medium | `CaptureTests/CaptureStoreMigrationTests.swift`: open a previous-schema store with the new schema, assert `didResetIncompatibleStore == false` (`CaptureStore.swift:54`). **A green `capture-gate.sh` does not cover this** |
| 9 | **A green gate that proves nothing.** `turbo` silently skips workspaces with no such script; designer/client builds set `ignoreBuildErrors`; the designer portal's mock fallback serves mock data on **any** thrown error, including an RLS denial — so a silently-denied scope lens renders plausible numbers. | medium | Every render check runs `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`. Every data claim is a `SELECT`, never a screenshot. `pnpm --filter @patina/admin-portal build` is the mandatory gate after any `packages/*` edit (it is the only portal whose build enforces types). Per-wave gate commands are named verbatim above rather than left to `pnpm test` |
| 10 | **Migration-number collision across four lanes.** Six-plus renumber incidents in this repo's history. | medium | Reserved ranges (§1–§8), **provisional until merge**, re-checked against the integration tip immediately before each merge; the undeployed side bumps (filename + banner). `pnpm supabase:reset` on the integration branch after every merge is the detector |
| 11 | **Two generated files conflict in every lane** — `database.types.ts` and `supabase/seed/00-legacy-grants.sql`. A hand-merged ACL seed silently drops a grant and a fresh local stack 42501s on long-existing objects. | medium | `git diff --exit-code packages/supabase/src/database.types.ts` after every regen; a clean `pnpm supabase:reset` on the integration branch after every merge is what catches a botched ACL seed (the seed is the **first** file `db reset` loads) |
| 12 | **The published promise outruns the build again.** A live drip email and a shipped help article already describe a studio-wide ledger that does not exist. | low | W2 **Done-when** items, not follow-ups: the Sanity article matches the sheet, and `?sheet=hours` opens the Hours book. `e2e/document/hours.spec.ts` covers the doorway |
| 13 | **R19's consent evidence is one person, who is also the owner** — and the ruling is about to govern an employee's documents. | low (trust, not code) | `hours-ledger-scope.test.tsx` asserts aggregate-by-default with notes behind an explicit detail act; `studio_hours_rollup_test.sql` asserts `notes` is **absent from the return type** (an `information_schema` assert, not a row assert); `e2e/document/hours.spec.ts` asserts the disclosure band appears once and never again |
| 14 | **HT-7 is one unique index away from being breached.** `uniq_project_time_entries_running_timer` is on `(user_id)` globally (`00177:37-41`); a Field tap that wrote a NULL duration would either raise an unreadable `23505` or steal the desk timer's slot. | medium | `CaptureTests/LogTimeSheetTests.swift` asserts the sheet **cannot express** a nil duration; `TimeEntryWriteRequest`'s `durationMinutes` stays non-Optional (`FieldVisitCloseRecord.swift:121`); `time_log_rpc_test.sql` asserts two concurrent `start_timer` calls leave exactly one running row |
| 15 | **Three rulings this plan needs are still blank** — **HT-2** (cut `profiles.default_hourly_rate_cents`, or keep as tier 3), **HT-15** (the reprice; the shape is settled), **HT-39** (`project_phases.estimated_hours` — re-home or drop). | medium (schedule, not correctness) | Each is handled without guessing: HT-2 → the leg is removed, the **column stays**, `'profile_default'` is reserved in the `rate_source` CHECK, so restoring tier 3 is one resolver branch and **no migration**. HT-15 → the shape is built as ruled; if it must be an **M**, the droppable piece is `internal_time_owner_admin_read`, and the consequence is that the studio scope **under-reports** — named here so the trade is visible rather than discovered. HT-39 → **no migration, no deletion**; `useUpdatePhaseEstimates` left in place, with the deferral recorded (and `00620`, formerly named here as HT-39's unused slot, is now **spent by W2** for HT-3-g(2)'s one-off legacy stamp). **Hours-vs-estimate reporting stays out of v1** either way: two estimate columns with different definitions exist (`project_phases.estimated_hours` `00177:88`, `project_tasks.estimate_minutes`) and one has no writer |
| 16 | **HT-41's "records the role in `rate_source`" cannot be implemented as written** — `rate_source` is CHECK-constrained to provenance values and cannot simultaneously carry a roster role. | low | Implemented as the provenance **pair** `(rate_source, rate_role)`, with `rate_role` CHECK-constrained to the four roster values and **server-validated against the member's live roster rows** (a client cannot claim a role it does not hold). `time_rate_resolution_test.sql` asserts the raise on an unheld role. **An architect choice — flagged in the report** |
| 17 | **`00597`'s auto-roster trigger changes roster semantics for every surface, not just Hours.** A seat appears on the Call Sheet, the roster, and every `is_project_team_member` check the moment anyone logs an hour. **The sharpest case is the one the class description hides: the project's OWN designer.** `is_studio_comember`'s first branch is `p_owner = auth.uid()` (`00556:59`), so a solo designer passes the co-membership gate, holds no seat, and would be seated as *support designer* on her own house on the first hour she logs — unflagged (P-5), on every project. `00597` therefore carries an explicit own-designer early exit, and case (f) asserts it. | medium | `supabase/tests/rls/time_entry_auto_roster_test.sql` asserts idempotence, non-downgrade of an existing `lead_designer`, and the re-seat-after-removal behaviour **as a stated decision**; `supabase/tests/rls/project_roster_test.sql` and `supabase/tests/rls/people_directory_scope_test.sql` must stay green unchanged |
| 18 | **Lane B writes RPCs (`00608`) while lane A owns the DB.** Two lanes minting migrations in the same phase. | low | Phase 3's `supabase db reset` owner is **B**, and `00608–00609` is B's reserved range; lane A does not mint in phase 3. The detector is a clean `pnpm supabase:reset` on `hour-tracking/integration` after each merge |
| 19 | **P-6 means the Field drain is unverified at ship.** The Simulator gate cannot prove an airplane-mode drain; the server-side arrival check is Kody's post-ship walk. | medium | Reported at its real level — **sim-verified, not device-verified** — in the ship note, with the `SELECT` Kody should run named. `CaptureStoreMigrationTests` covers the one failure mode that would destroy data before he gets there |

---

*Verified against `origin/main` @ `2ff00bb2b`, 2026-09-11. Migration head `00591`. Every `path:line` above was read this session; where `architecture.md` cited a stale number, the corrected number is used and the drift is tabled at the head of this file.*
