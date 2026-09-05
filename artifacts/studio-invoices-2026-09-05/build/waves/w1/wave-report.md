# W1 — integration report (studio invoices)

Steward: W1 integration, attempt 2 (attempt 1 returned blocked under a plan-mode
reminder that no longer applies; nothing it did was lost — its two merge commits
are ancestors of this branch and were superseded by the merges below).

```
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration rev-parse --show-toplevel
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration
git -C ... branch --show-current
  studio-invoices/integration
```

**Integration tip: `73cd9561ae30b65fe6c32cfa409a3462b919ece4`**
(base `36b4b539e`; nothing pushed, nothing on Strata.)

**Stack: none touched.** A peer session holds the shared local stack. This step
ran **zero** supabase commands — no reset, no `run-sql-tests.sh`, no
`db:generate`, no `functions serve`. See *Deferred to W2 integration* below.

---

## 1 · Merges

The lane tips had moved past the shas quoted in the brief (the close-fix rounds
landed after it was written), so the **branch tips** were merged, per the rule:

```
git -C /Users/kody/Code/patina-merged rev-parse studio-invoices/w1-db studio-invoices/w1-edge
  389778d7cd7cfab9642bb7cd12adbcde8a552ec6      (brief quoted 5d01bb592 — 1 commit behind)
  58741f4a19e06556f5b12c15e3c547cdd57ca74f      (brief quoted 142ecbb05 — 1 commit behind)
```

| merge | commit | result |
|---|---|---|
| `studio-invoices/w1-db` @ `389778d7c` | `b1cfc8e3b` | **clean**, ort strategy, 10 files / +1481 −516 |
| `studio-invoices/w1-edge` @ `58741f4a1` | `73cd9561a` | **clean**, ort strategy, 10 files / +1174 −12 |

**Conflicts: zero.** The two lanes share no paths, as the pre-merge
`git merge-tree` preview predicted.

## 2 · origin/main — no movement, no renumber

```
git -C /Users/kody/Code/patina-merged fetch origin main
  * branch  main -> FETCH_HEAD
git log --oneline -1 origin/main
  36b4b539e docs(studio-invoices): proposal deck, discovery reports, review — for rulings
```

`origin/main` is **still at `36b4b539e`** — the base this program branched from.
No merge of main was needed.

```
ls .../supabase/migrations | tail -6
  00565_the_client_page.sql
  00566_commercial_signature_studio_resolution.sql
  00567_scope_vocabulary_full_house_custom.sql
  00568_decision_first_notice_dispatch.sql
  00571_studio_invoices.sql
  _pending
```

`origin/main` carries nothing above `00568`; the peers' `00569`
(`approvals/w2-backend`) and `00570` (`approvals/w2-web`) are still only on their
own branches. **`00571_studio_invoices.sql` stands unchallenged — no renumber.**

## 3 · Legacy grants — regenerated, no drift

```
python3 scripts/generate-legacy-grants.py
  wrote .../supabase/seed/00-legacy-grants.sql — baseline + 2158 replayed statements
git status --porcelain   →  (empty)
```

The db lane's committed copy already matched byte-for-byte. Nothing to commit.
This matters: without it `create_draft_studio_invoice` would be anon-executable
on a fresh reset (db-notes:77-80).

## 3b · Contract reconciliation — db ↔ edge agree exactly

The edge lane built against `resolve_studio_identity(p_project_id, p_designer_id,
p_studio_id DEFAULT NULL)` and `invoices.title`. The merged migration provides
precisely that:

```
00571_studio_invoices.sql:1316-1323
  DROP FUNCTION IF EXISTS public.resolve_studio_identity(uuid, uuid);
  CREATE OR REPLACE FUNCTION public.resolve_studio_identity(
    p_project_id uuid DEFAULT NULL,
    p_designer_id uuid DEFAULT NULL,
    p_studio_id uuid DEFAULT NULL
  )
  RETURNS TABLE(studio_id uuid, name text, logo_url text, website text, source text)

00571:51   ALTER TABLE ... ADD COLUMN IF NOT EXISTS title text;

_shared/studio-identity.ts:53-55
  p_project_id: projectId, p_designer_id: designerId, p_studio_id: studioId
```

Return shape unchanged (5 columns, same names/order); all three params named on
the call, so exactly one signature binds. The edge module's `PGRST202` fallback
(`:64-69`, drops `p_studio_id` and retries) fires only when the RPC is absent and
no studioId was asked for — i.e. pre-migration tolerance. Harmless given the
ship order puts the migration strictly first. **No mismatch; nothing to fix.**

## 4 · Gates — every non-stack gate green

| gate | result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/supabase test` | **84 files passed, 994 passed / 12 skipped (1006)** |
| `pnpm --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/client-portal type-check` | **clean** (`tsc --noEmit`, no output) — see note |
| `pnpm --filter @patina/designer-portal test -- accounts desk` | **24 suites passed, 314 tests passed** |
| `pnpm --filter @patina/client-portal test -- threshold` | **48 suites passed, 936 tests passed** |
| `deno test _shared/` | **ok · 248 passed · 0 failed** |
| `deno test create-checkout-session/` | **ok · 17 passed · 0 failed** |
| `deno test stripe-webhook/` | **ok · 18 passed · 0 failed** |
| `deno check` × 5 changed `index.ts` | **all `Check` clean** |
| stray `deno.lock` | **none** at repo root or worktree root |
| `git status --porcelain` | **empty** (only the sandbox EPERM lines on `.env*`) |

**client-portal type-check note (environment, not code).** The first run came
back with 17 errors, every one `TS2307: Cannot find module '@patina/design-system'`
/ `'@patina/aesthete-quiz'` — unbuilt workspace dists in a fresh worktree, not a
defect in this change. After
`pnpm turbo build --filter=@patina/design-system --filter=@patina/aesthete-quiz --filter=@patina/help-system --filter=@patina/utils --filter=@patina/types`
the re-run is clean with no output. Recorded here so a later steward does not
read the first output as a regression: **a fresh worktree must have the package
dists built before the client-portal type-check means anything.**

Function dirs changed vs `36b4b539e` that have tests: `create-checkout-session`,
`stripe-webhook` (both above). `invoice-check-intent`, `invoice-reminders` and
`invoice-send` carry no `*.test.ts` of their own — their behavior is pinned in
`_shared/invoice-subject.test.ts` (the W5-1 five-sender assertion) and covered by
`deno check`.

### Deferred to the W2 integration steward (stack required)

The peer session owns the local stack for ~3 hours, so these four are **not run
here** and must be run by W2 integration after its stack handshake:

1. `supabase --workdir <wt> db reset`
2. `bash <wt>/scripts/run-sql-tests.sh`
3. types-regen check (`pnpm --filter @patina/supabase db:generate`, then confirm
   `database.types.ts` has no drift)
4. the `_tests/stripe-rail.test.ts` **null-project case** — it needs the edge
   functions runtime plus `STRIPE_WEBHOOK_SECRET`; drive it per
   `scripts/dev/sign-stripe-event.mjs` and the test file's own header.

Standing evidence until then — the db lane's own post-close-fix run on
`studio-invoices/w1-db`, quoted from `w1/db-notes.md` and re-run independently by
the close reviewer (`w1-close/db-review-r2.md`):

```
bash scripts/run-sql-tests.sh
  total:             157
  green:             136
  expected-fail:      21   (documented in supabase/tests/KNOWN_FAILURES.md)
  unexpected-fail:     0
  effective-green:   157 / 157
  PASS  supabase/tests/billing/studio_invoice_test.sql
  PASS  supabase/tests/edge_api/public_sd_hardening_contract_test.sql
```

That run was against the db lane tip alone. Because the edge lane touches no SQL
and the merge was conflict-free, the merged tree's SQL is byte-identical to the
tree that produced those numbers — but it has not been *replayed*, and W2 owes
the replay.

## 5 · W1 deploy set over `36b4b539e...73cd9561a`

**Migrations (1)**

- `supabase/migrations/00571_studio_invoices.sql`

**Edge functions (20).** Three `_shared` modules changed —
`invoice-emails.ts`, `invoice-subject.ts` (new), `studio-identity.ts` — and a
`_shared` edit means every importer redeploys. Closure computed here
independently (import-graph walk over relative specifiers, fixpoint); it matches
the edge lane's own count of 20.

Transitive `_shared` closure: `invoice-emails.ts`, `invoice-subject.ts`,
`studio-identity.ts`, `decision-notify.ts`, `project-approval-notification.ts`.

```
client-invite                 invoice-reminders
commercial-document-notify    invoice-send
create-checkout-session       notification-digest
decision-first-notice         notification-dispatch
decision-reminders            po-send
decision-resolved-notify      proposal-nudge
expire-decisions              proposal-sign-confirmation
invoice-check-intent          quote-request-send
                              review-requests
                              spec-pdf
                              stripe-webhook
                              trade-rfq-send
```

Only 5 of the 20 were edited directly (`create-checkout-session`,
`invoice-check-intent`, `invoice-reminders`, `invoice-send`, `stripe-webhook`);
the other 15 ride the shared-module rule.

**Ship order is a hard gate (W5-2):** the migration goes **strictly before** the
20 functions. The functions select `studio_id, title`; `title` does not exist
until 00571 lands.

Portals are W2's business; nothing portal-side ships from W1.

## 6 · W2 worktrees created

All three cut from the integration tip `73cd9561a`, `pnpm install` + bootstrap
build (`@patina/utils`, `@patina/types`, `@patina/api-routes`, `@patina/shared`)
run in each:

| worktree | branch |
|---|---|
| `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-designer` | `studio-invoices/w2-designer` |
| `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-client` | `studio-invoices/w2-client` |
| `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-ios` | `studio-invoices/w2-ios` |

*Incident, corrected:* the first `worktree add` loop used `set -- $pair`, which
zsh does **not** word-split, so one worktree was created at the path
`agent-si-designer studio-invoices/w2-designer` on a branch named after the sha.
Removed (`worktree remove --force`, `branch -D`, `rm -rf`, `worktree prune`) and
redone with explicit arguments. `git worktree list` now shows exactly the six
expected `agent-si-*` entries and no stray branch.

## 7 · Open findings carried into W2

Nothing blocking. Both close-round reviewers returned **SHIP**.

### From the db lane (`w1-close/db-review-r2.md`) — F1 fixed and re-proven

| id | sev | carried note |
|---|---|---|
| F2 | minor 0.9 | `designer_clients.status` unfiltered in both trigger arms and in the RPC; a `status='lead'` roster row lets service_role insert for that household. **W4**, with R3-12/R3-13. |
| F3 | minor 0.85 | S12 (title required) is only the *composer's* law; service_role may insert `title NULL`. Ledger, folio head, subject and Stripe product name all read that column. |
| F4 | minor 0.8 | UPDATE-arm roster gate strands authenticated acts once the household leaves every roster (advisory A-1 in db-notes). |
| F9 | minor 0.9 | `internal_notes` reaches the household through the whole-row `invoices_household_select` policy. **Exact parity** with 00178's project-keyed client policy — program-wide decision, not this lane. |
| F6 | nit 0.9 (downgraded) | 22003 overflow bounds are exact parity with `create_draft_invoice` (00511). Pre-existing. |
| F5, F7, F8, F10 | nits | comment accuracy; a 144-char line in a 78-col banner (00571:1311); the deactivated-studio leg of C-1 is code-read only. |
| N1 | nit 0.95 | banner at 00571:29 says "199 inserted lines"; the F1 move made it **210**. Stale provenance count. |
| N2 | nit 0.6 | db-notes documents the `client_id … ON DELETE SET NULL` vs `chk_invoices_anchor` latency but not `invoices_studio_id_fkey`, which is *also* SET NULL. Same latency, one-line note fix. |
| N3 | nit 0.5 | `create_draft_studio_invoice` SD posture is pinned only by 00571's own `DO $studio_draft_roster$` block, not by `public_sd_hardening_contract_test.sql` (still asserts 17 rows). Coverage shape, not a gap. |
| N4 | nit 0.5 | service_role may INSERT a studio invoice already `paid`; clean-draft predicate is `current_user='authenticated'` only. Exact parity with the project path. |

### From the edge lane (`w1-close/edge-review-r5.md`) — all five ruled items delivered

| id | sev | carried note |
|---|---|---|
| E5-1 | minor 0.95 | two clause implementations disagree on a blank name (`invoice-subject.ts` `invoiceForClause` vs `invoice-emails.ts` `forClause`). Both satisfy W5-6 today; the divergence is the risk. |
| **E5-2** | minor 0.99 | **FIXED HERE.** `edge-notes.md` named a non-existent `00570_studio_invoices.sql` in the ship-order list a ship steward reads. `:22, :159, :233, :250, :367` → `00571`. The four lines at `:913-915, :1185-1188` are the review record of the error and are left as history. |
| E5-3 | nit 0.9 | the W5-1 assertion is coupled to column *order*; a harmless reorder would redden it. Two independent `\bstudio_id\b` / `\btitle\b` asserts would carry the same mutation sensitivity. |
| E5-4 | nit 0.85 | `"Studio invoice"` reaches the homeowner on Stripe's Checkout page (`create-checkout-session:272-275`) when no title exists. Title is required through the composer, so last-resort only. |
| E5-5 | nit 1.0 | review-filename collision; resolved by the lane. |
| E5-6 | minor 1.0 | **closed by this merge.** The main checkout's `w1-close/` mirror was missing `edge-review-r3/r4`; the integration branch now carries r1–r5 and both db close rounds. Read the reviews from a worktree on `studio-invoices/integration`, not from the main checkout's working tree. |

### Fable's W1 rulings — all landed

R3-1, R3-2, R3-3/R3-7 (db) and W5-1, W5-2, W5-6, W5-7 (edge) were each fixed in
the close round and independently re-pinned by a reviewer mutation. R3-13
(co-member-not-on-roster stamping) and R3-12 (archived roster rows) remain noted
for **W4**.

## 8 · Advisories (never block)

- The peer session's `00569`/`00570` are unmerged branch-local files. If either
  lands on `origin/main` before this program merges, `00571` still does not
  collide — but a third peer minting from `00568` would. **Mint W2+ migrations
  from `00572`.**
- `_shared/invoice-subject.ts` is new and now sits in the closure of five extra
  notification functions that have nothing to do with invoices (they import
  `invoice-emails.ts` for the shell). They redeploy for correctness of the
  bundle, not because their behavior changed.
- A fresh worktree's client-portal type-check is red until the workspace dists
  are built (`@patina/design-system`, `@patina/aesthete-quiz`,
  `@patina/help-system`). The three W2 worktrees got the standard bootstrap
  (`@patina/utils`, `@patina/types`, `@patina/api-routes`, `@patina/shared`)
  only, so the **client and designer W2 lanes must build the UI package dists
  before reading a type-check result.** Same class of trap as the stale-dist
  deploy footgun in CLAUDE.md.
