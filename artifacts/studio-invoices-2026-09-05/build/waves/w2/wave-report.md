# W2 — integration report (studio invoices)

Steward: W2 integration, **stack owner**.

```
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration rev-parse --show-toplevel
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration
git -C ... branch --show-current
  studio-invoices/integration
```

**Integration code tip: `caf841b3763579d6e52199f545028d61ba2321f3`** (the branch tip
before this report's docs commit). Base of the wave `3a54d8743`; program base
`36b4b539e`. Nothing pushed, nothing on Strata.

```
git diff --shortstat 3a54d874..HEAD
  50 files changed, 4007 insertions(+), 262 deletions(-)
```

---

## 1 · Merges — three, all clean, zero conflicts

The three lane tips had each moved **one docs-only commit** past the shas the brief
quoted (each lane's round-3 review report landed after the brief was written). The
**branch tips** were merged; the code is identical either way:

```
git diff --stat 85734a8eb..849c340bf  →  designer-review-r3.md  | 194 +++   (docs only)
git diff --stat 110da7a02..61a950706  →  client-review-r3.md    | 148 +++   (docs only)
git diff --stat 4ea024a69..98a0c2452  →  ios-review-r3.md       |  48 +++   (docs only)
```

| merge | lane tip | commit | result |
|---|---|---|---|
| `studio-invoices/w2-designer` | `849c340bf` | `6cb57f78b` | **clean** — 16 files, +1713 −215 |
| `studio-invoices/w2-client` | `61a950706` | `c1d14a5b6` | **clean** — 25 files, +1845 −44 |
| `studio-invoices/w2-ios` | `98a0c2452` | `caf841b37` | **clean** — 9 files, +449 −3 |

**Conflicts: zero**, as predicted by the pre-merge path intersection:

```
D∩C: (empty)   D∩I: (empty)   C∩I: (empty)
```

The three lanes share no file. The only cross-lane touch is `packages/supabase`
(client lane widened `use-studio-identity.ts`), which no other lane edits.

## 2 · origin/main — no movement, no renumber

```
git fetch origin main
  * branch  main -> FETCH_HEAD
git rev-parse origin/main
  36b4b539e1f2cb732fb722d84edfe758d6b4008a
git log --oneline HEAD..origin/main
  (empty)
```

`origin/main` is still at the program's base `36b4b539e`. No merge of main was
needed, and no migration collision appeared.

```
ls supabase/migrations | tail -3
  00567_scope_vocabulary_full_house_custom.sql
  00568_decision_first_notice_dispatch.sql
  00571_studio_invoices.sql
```

Peer `00569` (`approvals/w2-backend`) and `00570` (`approvals/w2-web`) remain
branch-local. **`00571_studio_invoices.sql` stands unchallenged — no renumber.**
Mint the next migration from **`00572`**.

## 3 · Gates

### Stack gates (the four W1 deferred to this step)

Stack handshake honoured: `stack-request` written, `stack-go` received
(`2026-09-05T23:02:52Z`, "peer patina-merged-5d sent stack free; stack yours
through the walk"), then reset. `stack-reset-notice.md` appended.

| gate | result |
|---|---|
| `supabase --workdir <wt> db reset` | **PASS** — `STATUS=0`; ledger replayed `… 00567, 00568, 00571`; all 29 seeds applied; `{"target":"local","version":"","message":"Reset local database."}`. `schema_migrations` tail = `00571, 00568, 00567, 00566, 00565`. |
| `bash <wt>/scripts/run-sql-tests.sh` | **PASS** — `STATUS=0`; **total 157 · green 136 · expected-fail 21 · unexpected-fail 0 · effective-green 157/157**. Named suites: `PASS supabase/tests/billing/studio_invoice_test.sql`, `PASS supabase/tests/edge_api/public_sd_hardening_contract_test.sql` (the re-hashed contract test), `PASS supabase/tests/billing/invoice_checkout_integrity_test.sql`, `PASS supabase/tests/commercial/multi_studio_signature_test.sql`, `PASS supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql`. |
| types regen diff | **CLEAN** — `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter @patina/supabase generate` → `GEN_STATUS=0`; `git diff --exit-code packages/supabase/src/database.types.ts` → **exit 0, zero lines**. The committed types already match the reset DB; **no regen commit needed**. |
| `stripe-rail.test.ts` null-project case | **BLOCKED by a pre-existing red — see §3c.** |

### 3b · Non-stack gates

| gate | result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/supabase test` | **PASS** — `Test Files 85 passed (85) · Tests 998 passed \| 12 skipped (1010)` |
| `pnpm --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --filter @patina/designer-portal test` (FULL) | **1 failed, 512 passed / 513 suites; 1 failed, 6136 passed / 6137 tests.** The one red is **pre-existing and untouched** — see §3d. |
| `pnpm --filter @patina/client-portal type-check` | **clean** |
| `pnpm --filter @patina/client-portal test` (FULL) | **PASS** — `Test Suites: 116 passed, 116 total · Tests: 1578 passed, 1578 total`. The brief's "known pre-existing failures" did not appear; the suite is fully green. |
| `pnpm --filter @patina/admin-portal build` | **PASS** — full route table emitted, `BUILD_ID vj6njenWtU3_Qs-jDJ-d4`. Two environment notes: the worktree first failed `Module not found: Can't resolve '@patina/api-client'` until `pnpm turbo build --filter=@patina/admin-portal^...` restored the workspace dists (7/7 tasks, FULL TURBO); and under the Bash sandbox the compile worker died silently at `buildStage: "compile"` with exit 0 and no `BUILD_ID` — the build only completes **unsandboxed**. Neither is a code defect. |
| `deno test --allow-all _shared/` | **PASS** — `ok \| 248 passed \| 0 failed` |
| `deno test create-checkout-session/` | **PASS** — `ok \| 17 passed \| 0 failed` |
| `deno test stripe-webhook/` | **PASS** — `ok \| 18 passed \| 0 failed` |
| `deno check` × 5 changed function `index.ts` | **all clean** (`Check create-checkout-session/index.ts`, `invoice-check-intent`, `invoice-reminders`, `invoice-send`, `stripe-webhook`) |
| stray `deno.lock` | one appeared at the worktree root from the harness run (`run.sh` invokes deno from the repo root without `--config`); **removed**. Main checkout clean. |
| iOS `ios-gate.sh all` (sim `si-integ`, `28AD9D5E-…`, iOS 26.5 / iPhone 16) | **PASS** — `** BUILD SUCCEEDED **`; `Test run with 2472 tests in 271 suites passed after 15.361 seconds with 2 known issues`; `** TEST SUCCEEDED **`; `✓ lint-delta: no new warnings in touched files`. The r3 reviewer's `CompanionCoachingModelTests` load flake did **not** reproduce. Simulator deleted after. |
| `git status --porcelain` | **empty** (only the sandbox `Operation not permitted` lines on `.env*`) |

**iOS environment note (worth carrying).** The first `ios-gate.sh` run failed with
`** BUILD FAILED **`, `cannot find 'Secrets' in scope` at `PostHogService.swift:274`
and `APIConfiguration.swift:137`.
`apps/mobile/Patina/Patina/App/Configuration/Secrets.swift` is **gitignored**
(`.gitignore:53`; `Secrets.example.swift` is the committed template), so a fresh
worktree has no copy and the Patina target cannot compile. Copied from the main
checkout (still gitignored, never staged) and the gate ran green. **Any worktree
that must build the iOS app needs this file copied in as part of its bootstrap** —
same class of trap as the unbuilt workspace dists.

### 3c · The stripe-rail null-project case — did not execute (pre-existing red, not ours)

```
supabase --workdir <wt> functions serve --env-file supabase/functions/_tests/test.env --no-verify-jwt   (started, then stopped)
bash supabase/functions/_tests/run.sh
  payable_type dispatch — invoice back-compat + po_payment ... FAILED (215ms)
  invoice surcharge rail — claim, supersede, gross settle, check intent ... FAILED (297ms)
  error: Error: insert projects failed: studio_id_not_designer_studio
      at insert (…/stripe-rail.test.ts:156:20)
      at async seed (…/stripe-rail.test.ts:165:17)
  FAILED | 0 passed | 2 failed (518ms)
```

Both suites die in `seed()` at the **`projects`** insert (`:165`), long before the
studio-invoice step at `:498` (`project-less studio invoice settles and earns`).
So the named gate **did not run**. Three independent proofs it is not this
program's doing:

1. **00571 never touches the projects path.** It defines exactly four functions —
   `apply_invoice_payment_effects`, `create_draft_studio_invoice`,
   `resolve_studio_identity`, `set_invoice_studio_id` — and no trigger on
   `public.projects`. The raiser is `set_project_studio_id()`, whose true head is
   `00563_proposal_signing_multi_studio.sql` (anchored grep over
   `CREATE OR REPLACE FUNCTION[^(]*set_project_studio_id` → `00317`, `00511`,
   `00563`; last wins). `00563` is on `origin/main` and predates this program.
   The only function `set_project_studio_id`'s body calls is
   `public.has_designer_domain_role(…)`, which 00571 does not redefine.
2. **Reproduced independently, outside the harness**, against the freshly reset
   stack:
   ```
   SET LOCAL ROLE service_role;
   INSERT INTO public.projects (name, client_id, designer_id, created_by)
   VALUES ('SEED_SHAPE_PROBE', <designer with no membership> …);
   ERROR:  studio_id_not_designer_studio
   CONTEXT:  PL/pgSQL function set_project_studio_id() line 252 at RAISE
   ```
3. **Root cause named.** At that RAISE the guard is
   `IF NOT v_lead_has_designer_role OR NEW.designer_id IS NULL OR NEW.studio_id IS NULL OR …`.
   The harness's `designerA` is a bare `auth.users` row created by
   `admin.auth.admin.createUser` with **no designer-domain `user_roles` grant** and
   no studio, so `has_designer_domain_role(designerA)` is false. A probe copy of
   the test (in scratch, repo untouched, since deleted) that hoisted the studio +
   `organization_members` seed **above** the projects insert failed identically —
   confirming the blocker is the missing designer-domain role, not studio ordering.

**The behavior the blocked step would have asserted is proven elsewhere and green.**
`supabase/tests/billing/studio_invoice_test.sql` (986 lines, **PASS** in the suite
above) drives the houseless rail end to end — draft → issue (studio-keyed number) →
**Stripe Checkout claim → finalize → settle** → `designer_earnings` row with a NULL
project (`:229`) → refund contra (`:250-255`) → void — explicitly "because the
Checkout rail on an invoice with no project is the one leg no other suite covers"
(`:181-183`). The webhook's own unit suite is green (18/18), as is
`create-checkout-session` (17/17).

**Remedy for whoever owns it (out of this steward's scope):** give the harness's
`designerA` a designer-domain role in `seed()` before the `projects` insert. That is
a change to a pre-existing test fixture, unrelated to studio invoices, and belongs to
a reviewed lane — not to an unreviewed edit at the last gate before the walk.
Carried as **W2-A1**.

### 3d · The one designer-portal red — pre-existing, proven untouched

```
FAIL src/components/document/__tests__/client-note-composer.test.tsx
  ● ClientNoteComposer — standing note › retire calls the retire mutation …
  Unable to find an element with the text: Taken down Sep 4. It moves to Previously.
  (rendered: "Taken down Sep 5. It moves to Previously.")

git diff --stat 36b4b539e...HEAD -- \
  apps/designer-portal/src/components/document/__tests__/client-note-composer.test.tsx \
  apps/designer-portal/src/components/document/client-note-composer.tsx
  (empty)
```

A hard-coded date in the assertion versus a live `new Date()`; today is Sep 5. Both
the test and its component are byte-identical to the program base. Same red the
designer lane's r3 reviewer recorded as advisory A1.

## 4 · The full deploy set over `36b4b539e...HEAD`

**Migrations (1)** — `supabase/migrations/00571_studio_invoices.sql`. Final number
**00571**, unchanged.

**Edge functions (20).** Three `_shared` modules changed —
`invoice-emails.ts`, `invoice-subject.ts` (new), `studio-identity.ts` — and the
transitive `_shared` closure adds `decision-notify.ts` and
`project-approval-notification.ts`. Recomputed here from scratch (fixpoint import-graph
walk over relative specifiers, run against the merged tree); the count matches W1's
independent walk exactly.

```
client-invite                 invoice-reminders
commercial-document-notify    invoice-send
create-checkout-session       notification-digest
decision-first-notice         notification-dispatch
decision-reminders            po-send
decision-resolved-notify      proposal-nudge
expire-decisions              proposal-sign-confirmation
invoice-check-intent          quote-request-send
stripe-webhook                review-requests
                              spec-pdf
                              trade-rfq-send
```

Five were edited directly (`create-checkout-session`, `invoice-check-intent`,
`invoice-reminders`, `invoice-send`, `stripe-webhook`); the other fifteen ride the
shared-module rule.

**Ship order is a hard gate (W5-2): the migration goes strictly before the 20
functions.** The functions select `studio_id, title`; `title` does not exist until
00571 lands.

**Portals (2) — designer + client.** `git diff --name-only 36b4b539e...HEAD -- apps`
returns only `client-portal`, `designer-portal` and `mobile`. **`apps/admin-portal`
is untouched, so admin does not deploy** (its build is a gate here only because a
shared-package change can break it — it did not).

**iOS:** `apps/mobile/Patina` changed (3 sources, 2 test files). No `Capture` touch.
No submission in this program's scope.

**Also to ship / carry:** `@patina/supabase` is source-resolved by the portals, so no
dist publish — but `deploy-portal.sh` rebuilds the workspace dists, which is exactly
what makes the designer/client deploys pick it up. PostHog flag **`studio-invoice`**
(designer side only, S10) stays **OWED** — verify it against `/flags` with a
real-browser UA before enabling; fail-closed lever is
`NEXT_PUBLIC_FLAG_OVERRIDES=studio-invoice:false`.

## 5 · Findings carried into the walk / ship, by id

Nothing blocking. All three lane reviewers returned **ship** or **fix (one major, no
blocker)**.

### Client lane — the one open major

| id | sev | state at this tip |
|---|---|---|
| **R3-1** | **major (client)** | **OPEN.** In the **adopted house**, the check panel names the *house's* studio as payee for a letter drawn by *another* studio. Verified still open in the merged tree: `apps/client-portal/src/components/threshold/threshold.tsx:278` is `useStudioIdentity({ projectId })` — house-keyed — while the houseless door (`letterbox-door.tsx:95`) resolves identity from the *letter's* `studio_id`/`designer_id`. The two paths disagree. Remittance is correct (`check_remit_to` comes from `get_invoice_payment_options`); only the displayed name is wrong. **Kody is a two-studio designer, so this is live for the first customer.** |

### Client lane — minors and nits (all open)

`R3-2` void-only / query-error households never mount the door, so a `?checkout=`
return is unread · `R3-3` the door renders folded (an "Open the letterbox" act M5(b)
does not draw) · `R3-4` the door says "From the studio · not for a house" where there
is no house to contrast with · `R3-5` `useClientInvoices()` runs and is discarded on
every non-adopted house · `R3-6` the houseless front door lost its server render ·
`R3-11` the doorstep's standing sentence sums the studio letter into the house's open
balance with no clause · `R3-12` `EarlierInvoices` on the door takes the slot letter's
studio as payee for every folded letter (same class as the fixed R2-1, one level
down) · `R3-7` two fallback names on one door · `R3-8` the zero stated twice ·
`R3-9` the door's plate is not M5(b)'s letterhead · `R3-10` nothing asserts the
chooser or the Settle act on the door · `R3-13` the door's two filters disagree about
`void` (pre-existing on the housed path too) · `R3-14` `owedStudioCount` / the
house-ledger owed-row copy is homeowner-visible design that appears in neither the
plan nor M5.

### Designer lane — minors and nits (all open; reviewer verdict **ship**)

`F-R2-2` the ledger's fourth column collapses on a studio row (status stamp lands 56px
right, row 8px taller; M2 draws a column-aligned ledger) · `F-N1` the `ClientPicker`
trigger is foreign material on the paper sheet (white, 43px, 15.3px type between two
transparent 33px 11.5px fields) · `F-N2` the default billing studio is order-dependent
(`useOrganizations()` issues no `.order()`) · `F-F8` a **guest** membership is offered
as a billing studio, and 00571 then raises `insufficient_privilege` verbatim into the
R83 band · `F-F5` the `choose-studio-invoice` analytics pair has no test · `F-F2` the
sheet's lede ("Everything billable pulls through below") is false in studio mode ·
`F-F3` the empty option still says "Pick a document…" · `F-F4` `useOrganizations()` is
fetched on every composer open · `F-R2-3` no `maxLength` on *regarding* (00571 bounds
it at 200) · `F-F7` `context.mode` is honoured before the flag resolves (latent) ·
`F-F9` "18d overdue" on the receivables page (pre-existing; M4 says "18 days past") ·
`F-F10` raw pg message in the R83 band (house path identical) · `F-R2-4`
`aria-label="For"` ambiguity for a future e2e.

### iOS lane — nits (reviewer verdict **ship**)

`ios-r3-10` brief item 3 ("From the studio" Budget section) was **reverted** under
ruling **S11** (null-safety only) and wants an orchestrator sign-off line ·
`ios-r3-3` the Budget empty state states a falsehood to a studio-invoice-only
homeowner — a consequence of S11 as adopted, wants a ruling not a lane fix ·
`ios-r3-4` `YourDesignerSeat.urgentProjectId` returns nil for a studio invoice, so
the home seat can name the wrong designer (pre-existing shape, widened here) ·
`ios-r3-1/2/5/6` carried from r2 · `ios-r3-8` the title test is a `SourcePin` string
match, not a behavior assertion · `ios-r3-9` `ios-notes.md` still leads with the
reverted section as delivered.

### Carried from W1 (unchanged by this wave)

db: `F2` `designer_clients.status` unfiltered in both trigger arms and the RPC ·
`F3` S12 is only the composer's law; service_role may insert `title NULL` · `F4`
UPDATE-arm roster gate strands acts once the household leaves every roster · `F9`
`internal_notes` reaches the household (exact parity with 00178) · `F5–F8`, `N1–N4`
nits. `R3-13` (co-member-not-on-roster stamping) and `R3-12` (archived roster rows)
remain **W4**.
edge: `E5-1` two clause implementations disagree on a blank name · `E5-3` the W5-1
assertion is coupled to column order · `E5-4` `"Studio invoice"` reaches the homeowner
on Stripe's Checkout page when no title exists.

### New this step

| id | sev | note |
|---|---|---|
| **W2-A1** | minor | `supabase/functions/_tests/stripe-rail.test.ts` cannot seed against a post-`00563` database: `designerA` holds no designer-domain role, so `set_project_studio_id` rejects the `projects` insert and **both** suites die before any assertion. Pre-existing, unrelated to studio invoices, and it blocks the harness for every future program. Remedy in §3c. |
| **W2-A2** | nit | A worktree cannot build the iOS app until the gitignored `Secrets.swift` is copied in; add it to the worktree bootstrap alongside the workspace dists. |
| **W2-A3** | nit | The admin-portal `next build` silently dies at `buildStage: "compile"` (exit 0, no `BUILD_ID`) under the Bash sandbox. Read `BUILD_ID`, never the exit code, when judging that gate. |

## 6 · Stack

Reset ran once, from this worktree, after `stack-go`. `stack-reset-notice.md`
appended. The stack now carries the **W2 integration tree** (all migrations through
`00571`, all 29 seeds) — which is exactly what the walk needs, so `stack-released`
records that this steward is finished with it **without** implying it may be
re-reset. Peer `00569`/`00570` are not on this stack.

## 7 · Carry

The four findings the release judge would have blocked on, closed in this worktree
(`studio-invoices/integration`) on top of `e0daf3863`. Nothing else was touched.

| id | sev | what was wrong | what it is now |
|---|---|---|---|
| **R3-1** | major (client) | `threshold.tsx:278` resolved the letterbox payee from `useStudioIdentity({ projectId })` — the ADOPTED HOUSE's studio — so a studio letter drawn by studio B, standing in a house belonging to studio A, put A's name on the check panel. | The payee is resolved from the LETTER, never from the house around it. New `apps/client-portal/src/components/threshold/letter-payee.ts` (`useLetterPayee`) calls the resolver with the row's own `studio_id` / `project_id` / `designer_id` — the same 00571 precedence `letterbox-door.tsx:95` already used — and `letterbox.tsx` takes its `studio` from it. `threshold.tsx` is unchanged: the doorplate, the note and the mat still name the HOUSE's studio, which is right. |
| **R3-12** | minor (client) | `EarlierInvoices` handed every folded letter one `designerName` — the slot letter's studio. | Each folded letter's settle panel is its own component (`FoldedSettlement`) that resolves its own payee through `useLetterPayee`. Only one folded letter is ever unfolded at a time, so this is a mounted component's hook, never a hook in a loop. The caller's name survives only as the last-resort fallback. |
| **F-F8** | minor (designer) | `activeDesignStudios` filtered the ORGANIZATION only, so a **guest** membership was offered as a billing studio — and 00571 (`membership.status = 'active' AND membership.role <> 'guest'`) then raised `insufficient_privilege` verbatim into the R83 band. | The membership is filtered too: `role !== 'guest'` and a status that is active. The W-1 name sort the walk-fix added is untouched and still covered. |
| **F-R2-3** | minor (designer) | The *regarding* input had no bound; 00571 refuses a title over 200 characters. | `maxLength={200}` on the field. |
| **W-5 / W2-4** | nit (walk, copy) | After voiding a STUDIO invoice the folio note said `invoice voided · linked milestones and time released`, contradicting the confirm copy two seconds earlier. | The note is keyed on `documentProjectId`, exactly as the confirm copy already was: a studio void now reads `invoice voided · the number retired, the letter withdrawn`. The house void keeps its old sentence. |

**Tests** (all new, in the suites that already cover the neighbouring code):
`letterbox.test.tsx` +2 (the slot letter's own studio on the check panel; a folded
letter's payee resolved from that letter) · `earlier-invoices.test.tsx` +1 ·
`threshold.test.tsx` +1 (the house-level R3-1 scenario end to end: plate keeps
`Quist Interiors`, the check names `The Ash Studio`) · `invoice-composer.test.ts` +3
(guest dropped, non-active membership dropped, active non-guest kept) ·
`invoice-composer-studio.test.tsx` +3 (guest studio never offered, the name sort
survives the drop, `maxLength` 200) · `invoice-folio.test.tsx` +2 (both void notes).

**Gates**

```
pnpm --filter @patina/client-portal type-check    → clean (tsc --noEmit, no output)
pnpm --filter @patina/client-portal test          → 116 suites / 1582 tests passed
pnpm --filter @patina/designer-portal type-check  → clean (tsc --noEmit, no output)
pnpm --filter @patina/designer-portal test -- accounts composer
                                                  → 7 of 8 suites passed (see below)
pnpm --filter @patina/designer-portal test        → 512 of 513 suites,
                                                    6147 of 6148 tests passed
```

**W2-A4 (advisory, NOT this lane's)** — `client-note-composer.test.tsx:479` asserts
the literal `"Taken down Sep 4. It moves to Previously."` while
`client-note-composer.tsx:326` renders `fmtDay(new Date())`. The literal was
committed on 2026-09-04 (`ffb9cff6f`), so the suite passes only on the day it was
written; it fails today in every timezone (`TZ=Etc/GMT+12 date` is still Sep 5). It
is the single red suite in the full designer run, it shares no file with this
program, and it will fail every day until the date is stubbed.
