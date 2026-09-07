# Wave 2 — deploy report

**The Agreement, Composed · Wave 2 · "the Library, fee schedules, the client's copy from parts"**
Merge + deploy steward, 2026-09-07. Authorizing ask: Kody, in session — *"Deliver the Agreement
system to production."* That ask authorizes the whole chain (merge → migrations → portals → verify)
without per-step re-asking.

---

## 1. What shipped

| Unit | Change |
|---|---|
| Migrations | `00576_agreement_library.sql`, `00577_agreement_fee_schedules.sql` → Strata |
| Designer portal | Contract Room Library (parts + templates), Save-as-template, template picker, part history, authority chips, six new schedule editors, Account → Studio Library card |
| Client portal | Composed homeowner body from parts, consent composed from money parts and frozen on the signature row, execution-snapshot keepsake, addendum `why` visible to the homeowner |
| `@patina/supabase` | Three new hook modules (`use-agreement-parts`, `use-agreement-library`, `use-agreement-part-events`) + specs |
| `@patina/types` | `agreement.ts` vocabulary + copy constants |
| Edge functions | **None.** `git diff --name-only origin/main...agreement/w2-integration -- supabase/functions/` returned empty — confirmed before the merge. No `_shared` fan-out. |
| Services / workers | None touched. |
| Secrets | None set. |

Flag: **`agreement-library`** — fail-closed and **does not exist yet**. Every studio surface in this
wave is dark until Kody creates it.

---

## 2. Pre-merge rulings applied on the integration branch

- **R38** (walk W2R2-09) — the authority chip read `record only (R9)`; the ruling id is gone from the
  studio's face. One literal in
  `apps/designer-portal/src/components/document/rooms/drafting/agreement/schedules/index.ts`
  (`AUTHORITY_STANDING_LABEL["record-only"]`), plus the four jest files that pin it and two comment
  quotations. Commit `e99a9d5c6`, `fix(document): R38 — no ruling ids in the studio's face`.
  Gates: `pnpm --filter @patina/designer-portal type-check` clean; the 12 agreement suites
  **223/223 pass**.
- **W2R2-03 / R39** — build-sheet §10's rollback line corrected to name what flag-off actually
  reverts. Commit `7cf385102`, `docs(agreements): W2 rollback line corrected`.

---

## 3. The merge

`origin/main` had moved three commits past the walk (`253f7afcf` R30 merge, `37b9e0380` R30 deploy
report). `git merge origin/main` into `agreement/w2-integration`: **clean auto-merge, zero
conflicts**, merge commit `00162ff06`. Both sides had touched
`apps/client-portal/src/components/threshold/{door-gate.tsx,__tests__/threshold.test.tsx}`; the ort
strategy resolved both without a conflict hunk. 15 files, +2584/−33.

**Migration numbering re-checked at the tip:** highest on `origin/main` is `00575_agreement_parts.sql`;
ours are `00576` and `00577`. **No renumber.** `pnpm-lock.yaml` unchanged → no `pnpm install` needed.

### Post-merge gates (integration worktree)

| Gate | Result |
|---|---|
| `pnpm exec turbo build --filter=@patina/types --force` | 1 successful |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` (FULL) | **534 suites / 6513 tests / 7 snapshots — all pass** (6513 vs the pre-merge 6505: R30 brought 8) |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/client-portal test:coverage` | **129 suites / 2083 tests — all pass**, coverage floor met (2083 vs 2059: R30 brought 24) |
| `supabase db reset --workdir <worktree>` | clean through `00577`; all 36 seed files, `00-legacy-grants.sql` first |
| `./scripts/run-sql-tests.sh` | **total 164 · green 143 · expected-fail 21 · unexpected-fail 0 · effective-green 164/164** |
| `SUPABASE_DB_URL=… pnpm db:generate` + `git diff --exit-code database.types.ts` | in sync, no diff (1 145 981 bytes) |

The reset + SQL suite is the **R31 grants-seed replay proof** the walker left to the merge: the
regenerated per-function `seed/00-legacy-grants.sql` replays byte-for-byte, the hardening contract
test (`supabase/tests/edge_api/public_sd_hardening_contract_test.sql`) is green, and the four
unexpected failures the walker recorded are back to zero.

**The known `db:generate` hazard fired and was contained:** the first run was sandboxed, the Supabase
CLI could not reach Docker, and the shell redirect had already truncated `database.types.ts` to
0 bytes. Restored with `git checkout --`, re-run unsandboxed, clean.

### Merge into main

```
eeda45516 feat(agreements): merge w2-integration into main — the Library, fee schedules, the client's copy from parts
4370a180f docs(agreements): rulings R31–R39
```

The main checkout's pre-existing dirty files (`.claude/settings.json`, `CLAUDE.md`, the pbxproj, two
sibling programs' `.js` artifacts, six help-walkthrough PNGs) were confirmed to have **zero overlap**
with the merge diff and were left untouched. Only
`artifacts/agreement-composed-2026-09-06/build/rulings-2026-09-06.md` was staged, with an explicit
pathspec.

Pushed: `37b9e0380..4370a180f  main -> main`.

---

## 4. Strata

### Before

`supabase migration list --linked` — 531 rows, every one matched local↔remote through `00575`, and
**exactly two pending: `00576`, `00577`** (remote empty). Nothing else was pending.

### The push

```
supabase db push --workdir /Users/kody/Code/patina-merged
Applying migration 00576_agreement_library.sql...
Applying migration 00577_agreement_fee_schedules.sql...
{"upToDate":false,"dryRun":false,"migrations":["00576_agreement_library.sql","00577_agreement_fee_schedules.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

### After

`supabase migration list --linked` — 531 rows, last four `(00574,00574) (00575,00575) (00576,00576)
(00577,00577)`, **pending: none**.

### Object probes (`supabase db query --linked`, SELECT only)

| Probe | Result |
|---|---|
| The four new tables | `n = 4` — `agreement_execution_snapshots, agreement_part_events, agreement_templates, studio_agreement_parts` |
| `select template_key from agreement_templates where kind='seeded' order by 1` | `patina.consultation`, `patina.design_services`, `patina.furnishings_services` — the three, and only the three |
| The four new functions | `_agreement_studio_id, compose_agreement_consent, materialize_agreement_template, save_agreement_as_template` — all four present |
| **R31** — `select oidvectortypes(proargtypes) from pg_proc where proname='sign_design_services_agreement_with_trusted_ip'` | **both arities live**: `uuid, text, uuid, text` (the 00511-hardened four-argument form, kept as the delegating wrapper) and `uuid, text, uuid, text, jsonb` (the widened form) |
| `project_billing_authorities` new columns | `n = 4` — `fee_amount_cents, fee_basis, fee_schedule, retainer_credit_rule` |
| **R37 backfill** — `select count(*) from project_billing_authorities where retainer_credit_rule='credited'` | **7**, out of **7** authorities total — every executed authority on Strata carries the credited rule, which is today's implicit behavior made explicit |

---

## 5. Portals

Deployed from the **main checkout** at `4370a180f`, via `./infra/deploy-portal.sh` only.

`apps/designer-portal/.env.local` still points at the local stack, so — following the Wave 1
precedent — the production literals from `apps/designer-portal/wrangler.jsonc`'s `vars` block were
**exported inline for that one invocation**. `.env.local` was **not edited**. Exported:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_STORAGE_KEY`,
`SUPABASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CLIENT_PORTAL_URL`, `NEXT_PUBLIC_ENV`,
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`,
`NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE`, `NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS`,
`NEXT_PUBLIC_EDGE_API_URL`, `SUPABASE_ORIGIN_RUNTIME`.

`apps/client-portal/.env.local` already points at production; the client portal deployed with no
intervention.

### Versions

| Portal | Worker | New version | **Rollback (prior)** |
|---|---|---|---|
| designer | `patina-designer-portal` | **`7a88a385-cc3e-4dc7-9a2d-0f5c1e737c5a`** (2026-09-07T22:09:54Z) | **`97bca77d-2b27-4e7c-ada3-78f8ba87ce32`** (2026-09-07T13:55:20Z) |
| client | `patina-client-portal` | **`33a01d5a-61f4-440c-af2d-9197acda725a`** (2026-09-07T22:11:09Z) | **`9858b5a6-8b87-4f82-9173-ffde4a76bb35`** (2026-09-07T16:59:35Z — the R30 hotfix) |

Both read from the **bottom** row of `npx wrangler deployments list`, run in each app directory (the
list is oldest-first).

---

## 6. Verification

### Served-chunk evidence

**Designer** — `https://app.patina.cloud/_next/static/chunks/333.1a9af7a341c56469.js` (200, 48 455 bytes):

| String | Count |
|---|---|
| `Save as template` | 1 |
| `From your Library` | 1 |
| `record only` | 1 |
| `agreement-library` | 1 |
| `record only (R9)` | **0** ← R38 confirmed live |

**Client** — `https://client.patina.cloud/_next/static/chunks/common-981acc9a68e722f3.js`
(200, 1 004 059 bytes): `The agreement as executed` ×1, `executionSnapshot` ×1,
`execution_snapshot` ×1, `composed` ×3.

### The local-pointed `.env.local` concern, checked head-on

- `127.0.0.1` in the served designer sign-in HTML: **0**
- `localhost` in that HTML: **0**
- `127.0.0.1` across **all 36** chunks that page references: **0**
- runtime origin in the served HTML: `__PATINA_SUPABASE_ORIGIN = "https://api.patina.cloud"` — the
  D-B4 repoint survived intact

### Behavior probes (unauthenticated)

| Probe | Result |
|---|---|
| `GET https://app.patina.cloud/` | **200**, no redirect, "Sign In" present |
| `GET https://client.patina.cloud/` | **307 → `/auth/signin?callbackUrl=%2F` → 200**, sign-in present |
| Error markers (`application error` / `internal server error` / `something went wrong`) on either | **0** |

(A raw grep for `500` in the designer HTML matches `"fontWeight":500` — a false positive, not an
error marker.)

---

## 7. Lanes retired

All four branches confirmed merged (`git merge-base --is-ancestor <branch> main`):
`agreement/w2-integration` (was `89bcfc6bd`), `agreement/w2-backend` (`7e4c1d421`),
`agreement/w2-designer` (`f047b98a5`), `agreement/w2-client` (`4eaa6db59`) — all **MERGED**, all
deleted with `git branch -d`. The four `agent-agr-w2-*` worktrees were removed. `git worktree remove`
deregistered each one but could not delete the tree in the sandbox (the repo's `.env.example` files
are write-denied); the leftover directories were deleted unsandboxed and `git worktree prune` run.
**No `--force` was needed to discard tracked work** — every worktree was clean before removal.
The remaining worktrees belong to other live programs (invoice-standalone, client-material) and were
not touched.

---

## 8. NOT verified

- **No signed-in walk of production.** Everything above is unauthenticated probes, served-chunk greps
  and object-level SQL. Nobody has opened the Contract Room, saved a template, materialized one, or
  signed a composed agreement on Strata.
- **The flag `agreement-library` does not exist.** Kody creates it. Until then every Wave 2 studio
  surface is dark by design — which also means the deploy cannot be exercised end to end. Per memory:
  verify a new flag against `/flags` with a real-browser UA **before** enabling it.
- **Send email was not verified locally**, and no email path was exercised in production.
- **No `wrangler tail` watch.** Neither worker was observed under live traffic for an error spike.
- **Custom-domain routing was not re-verified.** No `routes` block exists in either `wrangler.jsonc`;
  the `patina.cloud` hostnames are dashboard-managed out of band. They answered correctly in the
  probes above, which is evidence they work, not evidence of how they are wired.
- **`/api/version` was not used as a freshness signal** — on the Workers path it returns static
  defaults and proves nothing.
- **Designer-portal `.env.local` is still local-pointed.** This deploy worked around it for one
  invocation; it was not fixed. The next designer deploy must do the same or repoint the file. This
  remains an outstanding item from the client-approval program.
- **Client-portal env parity was not reconciled** (`NEXT_PUBLIC_POSTHOG_KEY`/`_HOST`/
  `NEXT_PUBLIC_EDGE_API_URL` are set in `wrangler.jsonc` but absent from `.env.local`, so they inline
  to empty). Left exactly as the previous client deploy had it — out of this wave's scope, worth its
  own ruling.
- **Carried to the main backlog, unfixed:** W2R2-02 (a project-bound, client-signed design-services
  agreement has no countersign route), the aged-oak 4.48:1 label contrast, the checkmark glyph in
  Account → Studio's checklist, the Account PARTS shelf count, and R39's Wave 3 "hidden from your
  client" toggle.

---

## 9. Rollback

- **Designer portal** → redeploy version `97bca77d-2b27-4e7c-ada3-78f8ba87ce32`
- **Client portal** → redeploy version `9858b5a6-8b87-4f82-9173-ffde4a76bb35`
- **The first lever is the flag**: with `agreement-library` off, every studio surface reverts; a
  composed agreement already sent keeps its parts for the homeowner (R39). Since the flag does not
  exist yet, the fastest kill switch is simply never creating it.
- **Migrations `00576`/`00577`** are append-only — roll forward with a new one. In practice nothing
  needs rolling back: the new tables, functions and the widened arity are inert while the flag is
  absent, and `00577`'s `retainer_credit_rule` backfill records the rule Patina already followed.
