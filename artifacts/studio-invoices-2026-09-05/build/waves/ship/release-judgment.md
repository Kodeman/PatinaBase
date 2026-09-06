# Studio invoices — release judgment

**Judge:** release judge (read-only; separate context) · **Date:** 2026-09-05
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration`
(`git rev-parse --show-toplevel` → that path) · **Branch:** `studio-invoices/integration`
**Judged:** `bcc4fdecd` (the brief's sha) — HEAD at judging time was `ab6f3dc7d`, one
docs-only commit past it (`carry-review-r1.md`); the code tree is identical.

## Verdict — **fix** (one blocker; no code defect of blocker or major weight)

The program's code is sound on every axis the brief asked me to judge — the migration bodies
are true-head rebases, the money paths write nothing outside the rail, RLS is additive, the
flag is fail-closed, the deploy set is complete. **But the branch cannot be shipped from where
it stands:** `origin/main` moved 141 commits past the program base while the waves ran, and
production already carries what those commits shipped. Deploying this tree would regress prod.
The fix is a merge + re-gate, not a rewrite.

---

## B1 · blocker (1.0) — the integration branch is behind a production that has moved

Every wave report recorded `origin/main` at the program base `36b4b539e`. It is now:

```
git log --oneline -1 origin/main
  7d7a8ef2b docs(approvals): W2 production deploy report        (2026-09-05 18:22 -0500)
git log --oneline 36b4b539e..origin/main | wc -l
  141
git log --oneline HEAD..origin/main | head -3
  7d7a8ef2b docs(approvals): W2 production deploy report
  d355b2c45 docs(approvals): W3 steward — three worktrees, bootstraps, and the stack-reset notice
  42d9057e4 feat(approvals): merge w2-integration — the ceremony …
```

The approvals W2 deploy report on `origin/main`
(`artifacts/client-approval-experience-2026-09-03/build/waves/w2/deploy-report.md`) records,
from main at `42d9057e4`: **`00569_approval_why_viewer_role_and_receipt` pushed to Strata**
(ledger tail `00569, 00568, 00567`), **six edge functions redeployed** (`apns-send`,
`decision-first-notice`, `decision-reminders`, `decision-resolved-notify`, `expire-decisions`,
`notification-digest`), **client worker `c64e78bc-32e0-4896-86d9-d781a96f6b37`** (23:16Z) and
**designer worker `c0937064-91c1-45b5-9187-48dd976e09c7`** (23:20Z). Our W2 integration
report's fetch (23:02Z) predates all of it.

What shipping this tree as-is would do:

1. **`supabase db push` from this worktree would refuse or mis-apply.** The local ledger has
   no `00569`; the remote has it. The CLI reports a remote version missing locally.
2. **Five of our twenty functions would revert to pre-approvals code.** `decision-first-notice`,
   `decision-reminders`, `decision-resolved-notify`, `expire-decisions`, `notification-digest`
   are in our transitive `_shared` deploy set; `origin/main` changed their bundled
   `_shared/decision-notify.ts` and `_shared/project-approval-notification.ts` (plus the four
   `decision-*`/`expire-decisions` `index.ts`). Our tree carries the old copies.
3. **Both portal workers would lose the approvals ceremony.** `origin/main` changed **29**
   non-test portal/package source files since the base (`threshold.tsx`, `door-acts.tsx`,
   `door-gate.tsx`, `approval-ask.tsx`, `scored-action.tsx`, `signature-line.tsx`,
   `use-project-approvals.ts`, the designer `approvals/*`, `desk-derivation.ts`, …). None are
   in our tree.

**Merge preview** (`git merge-tree --write-tree origin/main HEAD`, objects only):

```
CONFLICT (content): apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx
CONFLICT (content): supabase/seed/00-legacy-grants.sql
Auto-merged: threshold.tsx · BudgetViewModel.swift · BudgetAggregationTests.swift ·
             database.types.ts · hooks/index.ts
```

Both conflicts are mechanical: the test file is one import line each side
(`HOLD_MS` from `../instruments/scored-action` vs `LetterboxDoor` from `../letterbox-door` —
keep both); the seed is the generated 00569 block vs the generated 00571 block — **regenerate
it** with `python3 scripts/generate-legacy-grants.py`, never hand-merge. The five auto-merges
are the real risk: `threshold.tsx` merges our studio-letter list with the approvals door
changes, and `BudgetViewModel.swift` merges our `projectScopedRollup` with the approvals hub
counts.

**Required before any ship step:**
- `git merge origin/main` into `studio-invoices/integration`; resolve the two conflicts as
  above; regenerate the seed; **stack owner** resets the shared stack from this worktree
  (`supabase --workdir <wt> db reset`, after the stack handshake) so the ledger replays
  `00569` then `00571`; regenerate `database.types.ts` and commit any diff.
- Re-run the full gate set on the merged tree: `scripts/run-sql-tests.sh` (the re-pinned
  contract test must still pass beside 00569's `notify_client_attention` replacement),
  `deno test` on `_shared/`, `create-checkout-session/`, `stripe-webhook/` + `deno check` ×5,
  `@patina/supabase` type-check + test, designer and client `type-check` + **full** jest
  (main's `2d436f359` freezes the `client-note-composer` clock, so the one pre-existing red
  should disappear), `ios-gate.sh all`.
- A short re-walk of the two auto-merged surfaces: the client threshold with a studio letter
  standing beside an approvals door (adopted house), and iOS Budget with a studio invoice
  in the list. Then re-judge.

Migration numbering is **not** part of the problem: the approvals W3 worktrees hold `00572`
and `00573`, so `00571` stands uncontested and needs no renumber.

---

## (a) Every plan item — delivered or deferred with a reason

| area | item | state | evidence |
|---|---|---|---|
| DB 1 | `project_id` DROP NOT NULL, `title`, `chk_invoices_anchor` (studio required) | delivered | `00571:47-58` |
| DB 3 | `set_invoice_studio_id()` studio branch, both arms, project path byte-identical | delivered | body diff vs 00511: **0 removed / 210 added** (§b) |
| DB 4 | `create_draft_studio_invoice` SD, pinned search_path, `TO authenticated`, adhoc-only, roster-resolved designer, SD roster block | delivered | `00571:772-1073` |
| DB 5 | `issue_invoice_for_actor` untouched | delivered | not in the migration's four functions |
| DB 6 | `apply_invoice_payment_effects` LEFT JOIN + `COALESCE(pr.name, i.title, 'Studio invoice')` | delivered | body diff vs 00277: exactly those two hunks |
| DB 7 | three household SELECT policies, additive | delivered | `00571:1268-1300`; 00178's stay |
| DB 8 | `resolve_studio_identity` gains `p_studio_id`, active-design-studio gated | delivered | body diff vs 00320: additive step 0 + `v_studio_id IS NULL AND` guard |
| DB 9 | `client_id ON DELETE SET NULL` vs CHECK documented | delivered | db-notes (N2 also names `studio_id` FK) |
| DB 10 | `studio_invoice_test.sql` draft→issue→Checkout claim/finalize/settle→earnings→refund contra→void; contract re-hash; `stripe-rail.test.ts` null case | delivered / **partly unproven** | 986-line suite PASS in the 157/157 run; hash re-pinned and independently recomputed (§b); the Deno null-project case is written but the harness dies at seed (pre-existing, W2-A1) |
| Edge | 5 functions null-safe, `title` selected, identity by `studio_id`, return URL via `clientProjectLink`, `_shared/invoice-subject.ts` seam | delivered | diffs read; 20-function closure reproduced by my own import-graph walk |
| Hooks | `Invoice.project_id: string \| null`, `title`, `useCreateDraftStudioInvoice`, `useClientInvoices`, `useStudioIdentity({studioId})` | delivered | `use-invoices.ts`, `use-studio-identity.ts` diffs |
| Designer | composer "for" section + "the studio · no house" first, `ClientPicker`, regarding (required, `maxLength=200`), studio line only when >1 active non-guest studio, name-sorted default, `choose-studio-invoice` analytics, R83 band; overlays null-guard; ledger/receivables `studio` stamp and no doorway; folio head + studio void copy; desk skip on null | delivered | walk r1/r2; carry review; `desk-receivables.ts:69` |
| Client | `useClientInvoices` merged into the adopted house (`adopted-house.ts`, one rule for server + browser), `resolveHouseForInstrument` studio branch, `LetterboxDoor` houseless front door that consumes `?checkout=`, print page "Regarding", payee from the letter (R3-1) | delivered | walk r2 steps 4/6/9; carry review |
| iOS | `title` in `listSelect`, detail fallback, Budget null-safety (`projectScopedRollup`) | delivered as S11 | "From the studio" Budget section deliberately reverted under S11 (ios-r3-10) |
| S9 | Desk need line for overdue studio invoices | **deferred — W4 by ruling** | Desk renders no phantom folder, no error (walk 11a) |
| — | `designer_clients.status` / archived roster rows / co-member-not-on-roster stamping (F2, R3-12, R3-13) | **deferred — W4** | carried in both wave reports |

## (b) Function bodies rebased on their true heads — verified by me

Anchored grep, last file wins (excluding 00571 itself):

```
set_invoice_studio_id        → 00318, 00511, [00571]   true head = 00511
apply_invoice_payment_effects → 00178, 00277, [00571]  true head = 00277
resolve_studio_identity      → 00320, [00571]          true head = 00320
create_draft_studio_invoice  → new in 00571
```

Body-to-body diffs (extracted CREATE…$$; blocks):

```
set_invoice_studio_id  00511→00571 : 0 lines removed, 210 lines added   (project path byte-identical)
apply_…_effects        00277→00571 : 68c68,69  '— ' || COALESCE(pr.name, i.title, 'Studio invoice')
                                     77c77     JOIN → LEFT JOIN projects
resolve_studio_identity 00320→00571: +p_studio_id DEFAULT NULL; +step 0 (active design_studio only);
                                     step 1 guarded by `v_studio_id IS NULL AND`; nothing removed
```

Contract-test pin recomputed from the file (sha256 of the `$$…$$` body, the same bytes
`prosrc` holds):

```
00571 body  3a556842c060e47d90ce8b3b04a0b6f3e726a390f2a2446b0dee599862390a4c   = pinned
00511 body  3ce8183f5490b21a6a087a6a21e8e36c2c1b4c51d1577da614799a473f99099b   = old pin (method proven)
```

`DROP FUNCTION resolve_studio_identity(uuid, uuid)`: six plpgsql callers pass two positional
args (00330/00331/00334/00388/00412/00423); plpgsql bodies carry no `pg_depend`, the new
signature defaults the third, and the local reset + 157/157 suite is the proof the DDL
sequence and those callers survive. Swift passes `p_project_id`/`p_designer_id` only —
resolves against the defaulted third.

## (c) Money writes, RLS, grants

- **No ungated status write.** `stripe-webhook` diff touches only the `loadInvoiceJoined`
  select (+ error logging), email params and desk-line text; every settle still goes through
  `settle_invoice_checkout_payment` / `finalize_invoice_checkout_attempt` (service_role) and
  the 00178/00277 trigger owns the rollup. `create_draft_studio_invoice` inserts `status='draft'`
  only, integer cents (`round(quantity * unit_amount_cents)::integer`), same bounds as
  `create_draft_invoice`. Walk r2 step 5: rollup written by the trigger, exactly one
  `invoice_payments` row, `designer_earnings` row with `project_id NULL`.
- **Trigger UPDATE arm:** the studio branch keeps 00511's identity-immutability check first,
  then the machine early return, then live authority, then the same clean-draft predicate the
  project path applies (including `updated_at IS NOT DISTINCT FROM OLD.updated_at`, which the
  project path also has at 00511 body line 317). Every Checkout-rail RPC is called by the
  `admin` (service_role) client in both `create-checkout-session` and `stripe-webhook`, so a
  homeowner never reaches the UPDATE arm as an authenticated actor.
- **RLS additive:** `invoices_household_select` (`client_id = auth.uid() AND status <> 'draft'`)
  + two `EXISTS` child policies, all `TO authenticated`; 00178's project-keyed policies are
  untouched. Walk r2 RLS probe: each household sees only its own rows, stranger sees `[]`.
- **Grants sane:** `create_draft_studio_invoice` REVOKE from PUBLIC/anon/authenticated/
  service_role/dashboard_user then GRANT `authenticated`, asserted by the `DO $studio_draft_roster$`
  block; `apply_invoice_payment_effects` re-states 00178/00277's exact `service_role`-only
  grant; `resolve_studio_identity(uuid,uuid,uuid)` re-states 00320's anon/authenticated/
  service_role grant (brand-only, gated on active design studio). The legacy-grants seed
  regenerated to match (will need regenerating again after the merge — B1).

## (d) The flag

Designer side: exactly one gate, `useFeatureFlag('studio-invoice')` (`invoice-composer.tsx:114`),
whose hook defaults `{ value: false, isLoading: true }` and honours
`NEXT_PUBLIC_FLAG_OVERRIDES`. Walk r2 flag-off: 50 samples at 100 ms after the sheet opens,
**zero** frames with the option; ledger still renders existing studio rows with the flag off
(S10). Client portal: **zero** `useFeatureFlag` call sites outside the hook file — flagless per
R135; harmless until rows exist.

## (e) Deploy set and order

Computed independently (fixpoint walk over relative imports from the three changed `_shared`
modules): **20 functions**, identical to W1's and W2's lists. Five edited directly
(`create-checkout-session`, `invoice-check-intent`, `invoice-reminders`, `invoice-send`,
`stripe-webhook`); fifteen ride the `_shared` rule. `config.toml` unchanged: `stripe-webhook`
stays `verify_jwt = false`, the rest default/true.

Order (hard): **migration → 20 functions → designer portal → client portal → flag.** The
functions select `studio_id, title`, which do not exist until 00571 lands. The client portal's
`/` for a houseless client currently shows `ProjectsEmptyState`; that is fine until the flag
is on, because no studio invoice can exist before it. Pre-flight `supabase migration list
--linked` must show `00569` applied and **exactly** `00571` pending.

## (f) Rollback

- **Workers:** the live versions to roll back to are the approvals W2 deploys —
  client `c64e78bc-32e0-4896-86d9-d781a96f6b37`, designer `c0937064-91c1-45b5-9187-48dd976e09c7`
  (steward re-confirms with `wrangler deployments list` bottom row before deploying).
- **Functions:** capture `supabase functions list --project-ref bkvcixdmuyejfzcijpdg` before
  deploying (the before-versions); rollback = redeploy the 20 from an `origin/main` checkout.
- **Migration:** `title` column, nullable `project_id`, `chk_invoices_anchor`,
  `idx_invoices_client`, the three policies are additive and droppable. The trigger body and
  definition are restorable from `00511:2616` + `00511:3076` (drop `title` from `UPDATE OF`,
  re-pin the contract hash to `3ce8183f…`); `apply_invoice_payment_effects` from `00277:128`;
  `resolve_studio_identity` = DROP the 3-arg and recreate from `00320:27` (only the five
  invoice functions would then lose letterhead, and only on studio rows). **Not reversible
  once a `project_id IS NULL` row exists:** re-adding `NOT NULL` fails — those rows must be
  voided first, or `project_id` stays nullable.
- **Instant lever:** `NEXT_PUBLIC_FLAG_OVERRIDES=studio-invoice:false` in the designer
  `wrangler.jsonc` vars (redeploy), or disable the PostHog flag.

## (g) Owed to Kody

1. Create PostHog flag **`studio-invoice`**, targeted to Middle West / the kochaver domains;
   verify against `/flags` with a real-browser UA **before** enabling (the `threshold` flag
   matched everyone on 2026-09-04).
2. Prod walk as a two-studio designer: draw from each studio, issue, confirm the letterhead
   and number series, record a payment, check Earnings.
3. **Live Stripe was never exercised** — no Checkout leg, no webhook settle, no ACH, no
   surcharge on a studio invoice (local key is a placeholder). A real test-mode card + ACH on
   a prod studio invoice, then the `designer_earnings` row.
4. Ruling on ios-r3-3: the Budget empty state tells a studio-invoice-only homeowner "Nothing
   billed yet" (a consequence of S11).
5. Tell the approvals peer that `00571` is on main once merged, so their `00572/00573` push
   follows a `git merge main`.
6. `stripe-rail.test.ts` harness (W2-A1): `designerA` needs a designer-domain role in `seed()`
   — a pre-existing red that now blocks every future money-rail Deno gate.

## Findings (every one, severity + confidence)

| id | sev | conf | finding |
|---|---|---|---|
| B1 | blocker | 1.0 | Branch behind a moved `origin/main`/prod; see above. |
| F1 | minor | 0.95 | `create-checkout-session/index.ts:302-310` comment still says "Do not SEND a studio invoice until W3 lands…" — W3 was folded into the W2 client lane and is delivered. A future reader could refuse a send on a stale instruction. |
| F2 | minor | 0.9 | W2-2/W-3: a studio draft voided before issue is API-readable by the household (`status <> 'draft'`). Exact parity with 00178's project policy; never rendered. |
| F3 | minor | 0.9 | W1-F2: `designer_clients.status` unfiltered in the trigger's roster EXISTS and the RPC — a `lead` roster row admits the household. W4 with R3-12/R3-13. |
| F4 | minor | 0.85 | W1-F3: S12 (title required) is only the composer's law; service_role may insert `title NULL`. Every reader falls back ("Studio invoice" / dropped clause), so nothing breaks. |
| F5 | minor | 0.85 | Carry C2: the studio void result note says "the number retired" while the confirm copy and deck M7 say "keeps the number". Designer-facing. |
| F6 | minor | 0.8 | W1-F9: `internal_notes` reaches the household through the whole-row household policy — parity with 00178's project policy; program-wide, not this lane's. |
| F7 | minor | 1.0 | The Deno null-project webhook case (`stripe-rail.test.ts:498`) never executed — harness dies at seed on a pre-existing `set_project_studio_id` rejection (W2-A1). The houseless settle is proven only by the SQL suite; the live rail is owed (g-3). |
| F8 | nit | 0.85 | Houseless door reads "From the studio · not for a house" (walk r2 04b) where deck M5(b) draws "From the studio" alone — there is no house to contrast with (client R3-4). |
| F9 | nit | 1.0 | Receivables meta says "9d overdue" (designer-facing; shared pre-existing renderer; program vocabulary is "past due"). Never shown to a homeowner. |
| F10 | nit | 0.85 | Carry C5: `useLetterPayee` issues a second `resolve_studio_identity` per house view under a key that can never hit Threshold's. |
| F11 | nit | 0.8 | `CREATE INDEX idx_invoices_client` runs non-CONCURRENTLY inside the migration transaction — a brief lock on a small `invoices` table; acceptable, note only. |
| F12 | nit | 0.85 | E5-4: "Studio invoice" reaches the homeowner on Stripe's Checkout line only when `title` is NULL (composer forbids that). |
| F13 | nit | 0.7 | ios-r3-4: `YourDesignerSeat.urgentProjectId` is nil for a studio invoice; with two designers the home seat may name the wrong one (pre-existing shape, widened). |

## Walk verdicts read

r1 `fix` (W-1 major → fixed `7f8586ce5`, re-proved in r2 five cold opens) · r2 `ship`
(2 minor, 4 nit open) · carry review `ship` (C1–C7 minor/nit, none money or RLS).
