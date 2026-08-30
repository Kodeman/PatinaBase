# The Smart Lens → production (build program) — RESUME

**STATE: PR #40 IS OPEN. The program's build work is DONE. Nothing is deployed.**

| | |
|---|---|
| Branch | `document-lens/integration`, tip **`9897c9c61`**, pushed |
| PR | **https://github.com/Kodeman/PatinaBase/pull/40** → `main`, `--no-ff`. **Do not merge on an agent's say-so; it is Kody's.** |
| `main` | still `dab057537` — untouched for the whole program |
| Ledger | **R127** and **I152** are in `docs/design/the-document/DECISIONS.md` (lines 10110–10468). `I152-deploy` stays a DRAFT at `build/ledger/I152-deploy-draft.md` until Kody deploys. |
| Gates at the tip | type-check **0** · lint **exactly the 2 known pre-existing errors** · jest **476 suites / 5678 tests, 0 failing** · seed **19/19** · dry-run phases 1–2 **DRY RUN OK** |
| e2e | chromium ×2 on the production standalone (**149/3** then, after `supabase db reset` + reseed, **153 passed · 5 skipped · 0 failed**) · webkit **73 passed · 3 skipped · 0 failed** across four ≤2-file shards on `next dev` |
| Design lead | final walk **SHIP** (`build/w6-walk.md`, walked at `975fdf6b7`) |
| Architect | audit closed, 60 rows, drift list empty; ledger 52 rows D-B1…D-B50 |
| Rollback, pinned | `npx wrangler rollback 9c0c2cdd-2041-4848-a193-93d9e8fb0b71 --name patina-designer-portal --yes` |

## ⚠ OWED — Kody's, in order, with the exact commands

### 1. The TLS WebKit ship-bar run (D-B41) — the one gate never run against the shipping build

WebKit has only ever been exercised against `next dev`. The production standalone sends CSP
`upgrade-insecure-requests` and a `Secure` session cookie, and WebKit applies both to `localhost`,
so it cannot sign in over plain HTTP at all. Measured 2026-08-30: `mkcert -CAROOT` names
`~/Library/Application Support/mkcert`, **which does not exist**, and `~/.patina/tls/` does not
exist either. One-time, and it writes the login keychain, so it cannot be an agent's:

```bash
mkcert -install
mkdir -p ~/.patina/tls
mkcert -cert-file ~/.patina/tls/localhost.pem -key-file ~/.patina/tls/localhost-key.pem \
  localhost 127.0.0.1 ::1
```

Then, from `.codex/worktrees/agent-lens-integration/apps/designer-portal` (the standalone must be
built and running on :3000 — see `build/30-deploy-runbook.md` "Rehearsal: the ship-bar server"):

```bash
caddy run --config artifacts/document-lens-build-2026-08-29/build/tls/Caddyfile --adapter caddyfile &
curl -skI https://localhost:3443/auth/signin | grep -i content-security-policy   # upgrade-insecure-requests
PLAYWRIGHT_BASE_URL=https://localhost:3443 npx playwright test e2e/document \
  --config playwright.ship-bar.config.ts --project=chromium --project=webkit
```

⚠ The ship-bar config drops the base config's `webServer`, and with it the env that feeds the TEST
process. Export the five local Supabase demo values inline on that command. **Never write
`.env.local`.**

### 2. Merge PR #40, then rehearse the deploy from a clean `main`

```bash
git checkout main && git pull
LENS_DRY_RUN=1 bash artifacts/document-lens-build-2026-08-29/build/deploy-lens.sh
```

Phase 0 requires a clean `main` checkout, which is why no agent has run it. Expect the before-version
bottom row to read `9c0c2cdd-2041-4848-a193-93d9e8fb0b71`.

### 3. The real deploy

```bash
bash artifacts/document-lens-build-2026-08-29/build/deploy-lens.sh
```

Six phases: preflight → resolve `NEXT_PUBLIC_*` from `wrangler.jsonc` → gates → before-version →
`./infra/deploy-portal.sh designer` → after-version → nine probes. Any FAIL prints the rollback
command and the parent SHA.

### 4. Write `I152-deploy`

Fill `build/ledger/I152-deploy-draft.md` from the script's own output — `deploy-lens-after.txt`
plus every probe line **verbatim, not paraphrased** — then append it to `DECISIONS.md` in house
form. Record Kody's prod walk as **OWED** in it until it happens.

### 5. Kody's first look on prod, in the design lead's own order (`build/w6-walk.md`)

1. Open the long paper at 1440 — the letterhead, then **one 56px band**, first head at ~360px.
   Scroll once and watch line 2 name the worst standing thing **with its act** and `+N MORE`.
2. Press **Money** on the ladder — the head lands under the band. Press **Fold ↑**, reload —
   **`CLOSED BY YOU`**.
3. On the phone — the name wraps to two lines, line 2 prints the short form
   (`OVERDUE 7D · INV-2026-114 SEND`); **More → Margin · 7 → CAPTURE A NOTE**.
4. Turn on Reduce Motion — nothing moves, the same words print.
5. Open a proposal — `CLIENT USER · PROPOSAL` on line 1, `Scope & engagement · Core · stage 03`,
   nothing between the band and the first head.

### 6. Standing debts, none gating (full list in I152)

- **D-B5** — `project_phases.estimated_hours` has had no editor since W1 deleted the letterhead's
  PHASES fold; owed a re-home in the schedule region.
- **D-B28** — the readiness RPC fan-out (one `get_project_ffe_readiness` per FF&E line at
  concurrency 8 on paper open). Pre-existing, unrelated to any lens file; logged, not owned.
- **The `/desk` first-signin-tour overlay** — a real `aria-hidden` overlay that eats pointer events.
- **One 403 on `…d5`** at ≥1180 — most likely a seeded product image host
  (`fixtures.invalid`, or hotlinked Unsplash); **the capture that would prove it is still owed** —
  the reading in `build/e2e-baseline.md` is an inference from the census's own request list, and
  says so.
- Carried nits with owners: N2-01…N2-06, W4-N-01…13, P2-02 / P2-05 / P2-08, W5F2-02.

---

_Everything below is the program's own record, kept for a cold read._

## Rulings taken in the interview (Kody, 2026-08-29) — unchanged, restated for a cold session

1. **R127 = the proposal as written.** Deviate only where real data contradicts the mockup; log every one in `build/design/deviations.md`; carry into I152.
2. **All six waves, one production deploy at the end.** Rollback = `wrangler rollback 9c0c2cdd-2041-4848-a193-93d9e8fb0b71` or a revert of the single merge.
3. **No feature flag — GA.** Shippable-at-every-merge is the replacement law.
4. **Two Fable seats** (`subagent_type: fork`): ARCHITECT, DESIGN LEAD. Both review, neither implements.
5. **Precedence:** proposal governs MECHANICS; mockup governs WHAT PRINTS.
6. **Seed:** `scripts/the-document-lens-seed.sql`, hand-run, idempotent; long paper is the new fixed project `…d5`.
7. **Acceptance:** agents walk every wave; Kody walks **prod after deploy**. No Kody session before ship.
8. **Debts:** W0 fixed the e2e baseline to 0 failures; aged-oak/reduced-motion fixed only on rewritten files; F24/I114 out.
9. **Freeze:** `components/document/**`, `app/(document)/doc/[id]/**`, `lib/document/**`, `hooks/use-document-running-index.ts`, `globals.css` frozen on `main`; exceptions only at wave boundaries.

## ⚠ Seat ids are NOT durable

Task/agent ids from earlier waves (the ARCHITECT and DESIGN LEAD fork sessions) do not survive a cold
resume — do not try to `SendMessage` a remembered id. **Re-seat both as fresh `subagent_type: fork`
agents**, briefed from the written record alone: `build/design/technical-design.md` + its "Reviewed by
DESIGN LEAD" section (ARCHITECT's prior output) and `build/design/reconciliation.md` in full (DESIGN
LEAD's). Every ruling either seat needs going forward is already on disk under a `## W<N>-R<n>` or
`D-B<n>` heading — brief the new fork with "read these files, then continue as that seat" rather than
re-deriving anything.

## W6 phase A — LANDED (2026-08-30)

`document-lens/integration` is at **`8f2d243dd`**, pushed. Three commits over `99cc6d135`:

1. `d2110d1bd` — `--no-ff` merge of `document-lens/w4-fix3@a364817e3` (no conflicts).
2. `07132237f` — `--no-ff` merge of `document-lens/w6-prep@28d0cc828`; git auto-merged
   `e2e/helpers/lens.ts` and kept both sides (fix-3's `data-lens-resolved` wait inside `settle()`,
   prep's `railCensus` rewrite onto `[data-rail-label]`/`[data-rail-value]`).
3. `8f2d243dd` — the wiring commit carrying the owed minors: P2-01, D-B46's React half
   (`useLensResolved`), W4F3-05/P2-06, W4F3-08, P2-03, P2-04, P2-07. P2-02/P2-05/P2-08 are
   recorded in `build/test-impact.md` "Carried nits … W4 fix-3 review pass 2".

Gates on the tip: type-check **0** · lint **exactly the 2 known errors**
(`piece-room-save-gate.test.tsx:159`, `use-commercial-documents.test.ts:930`) · shadow-gate +
contrast + lens-css-scope **64 passed** · full jest **475 suites / 5643 tests, 0 failed**,
reconciled 5613 + 21 (w4-fix3) + 1 (w6-prep) + 8 (wiring) — the per-suite table is in
`build/test-impact.md` "W6 integration, phase A".

**Phase B is next and waits on the W5 fix lane** (`document-lens/w5-fix`, in flight). A temporary
detached worktree `.codex/worktrees/agent-lens-w6-base` @ `99cc6d135` (with `node_modules`
installed) exists purely to measure jest baselines — it is the right tool for the audit's per-wave
re-derivation in phase B, and must be retired before `repo-gc.sh` runs at the close.

## W6 phase B — in flight (2026-08-30)

`document-lens/integration` tip after phase A (`8f2d243dd`), in order:

| sha | what |
|---|---|
| `f933ba207` | `--no-ff` merge of `document-lens/w5-fix@8073bf464`. THREE conflicts, all one question — who owns the landing when a Margin row names an FF&E line. W5-C14 ran the order inside the sheet; **D-B46, ruled after it, moves it to the page** (`landOnFfeAnchor`). Resolved to D-B46 in `mobile-sheets.tsx` + its suite; `mobile-margin-sheet.spec.ts` took BOTH signed assertions (the line is mounted ∧ the paper moved). |
| `975fdf6b7` | the three W5 carries: **W5F-03 residual** (`stageStripInScope` off `spreadSection`, not `row.active_section`), **W5F2-01** (`projectId={null}` on the hosted strip), **W5F2-03** (`margin-groups.ts` docstring; the `w5-fix-log.md` `476/5639` vs `475/5625` gap written out; `…d4`→`…d7`). |
| `71414219e` | **D-B49** — a region's data hooks live at its ROOT. |

**Freeze check: `main` is STILL `dab057537`** — zero commits since program start, on the five frozen
paths or anywhere else. `merge-base --is-ancestor main integration` is true, so no `main` merge was
needed and no §9 anchor re-verification was owed.

**Jest Σ re-derived (audit drift 2, CLOSED):** measured with `npx jest src --ci --json` on **every
merged sha of integration's own first-parent history**, in a detached worktree bootstrapped per sha.
The `main` baseline reproduces **458 / 5170** exactly; **Σ = +499 tests, +18 suites**, closing on
**476 / 5669** at `975fdf6b7` (then 5671 after D-B49, 5678 after F1). Table in `build/test-impact.md`.

**Seed:** re-run after `pnpm supabase:reset` → **19/19 PASS** (`…d5`, `…d6`, `…d7`).

**Production standalone:** `rm -rf .next && npx next build --webpack` → ✓ 36.7s, 66 static pages,
0 errors. Served per `output: 'standalone'` (copy `.next/static` + `public` into
`.next/standalone/apps/designer-portal/`, then `node …/server.js`). **UP on :3000 for the final
walk.** The W4 walk's pid 80025 was killed.

⚠ **The ship-bar config drops `webServer`, and with it the env that feeds the TEST process.** Every
spec importing `e2e/helpers/supabase-admin.ts` dies at import with "SUPABASE_SERVICE_ROLE_KEY
missing". **Never write `.env.local`** — export the five local demo values inline on the playwright
command. This will bite the next person identically.

**Chromium ship-bar round 1 (before D-B49/F1): 149 passed · 3 failed · 1 did not run.** All three
triaged in `build/e2e-baseline.md`: `lens-contrast:183` was REAL (→ D-B49);
`mobile-margin-sheet:140` was my merge slip (`scrollYBefore`, fixed); `quiet-release-contracts:172`
is a basket-order artefact (passes in isolation; the spec's own header names the shared-timer cause).

## Program state per wave

| Wave | State |
|---|---|
| W0 — design docs, tripwires, seed, e2e baseline | **merged** into integration (`690337f1a`) |
| W1 — the rail earns its column | **merged** (`7c8b33e39`) |
| W2 — the ladder | **merged** (`e6da8bd76`) |
| W3 — the lens line | **merged** (`4915583c2`), **fix lane merged** — integration HEAD **`0a03b4af9`** ("merge wave 3 fix — signed C/FID/N/B") |
| W4 — density, one direction | **built + reviewed + fixed + signed**; correctness SIGNED (no gating ids, over the fix lane `f76ba828a`), fidelity SIGNED (2 non-gating findings, NF4-01/02); **NOT YET merged into integration** — `document-lens/w4-fix@f76ba828a` is the tip to merge |
| W5 — the pre-work spreads | **three lanes pushed, unmerged, unreviewed**: `w5-l1@78eb0ab54` (regions), `w5-l2@be6b66030` (block re-parenting, W5-R2), `w5-l3@a6af4b698` (the 390 Margin sheet, W5-R1/D-B30) |
| W6 — integration + rehearsal | **not started** on code; the deploy script and all three ledger drafts are written (see below) |

`git merge-base --is-ancestor` is the authority, re-verified this pass: W0–W3(+fix) are ancestors of
`document-lens/integration`; **W4/W4-fix and all three W5 lanes are NOT** ancestors of integration, and
none of the above is an ancestor of `main` (`main` is still at `dab057537`).

## Exact next steps, in order

1. **Merge `document-lens/w4-fix@f76ba828a` into `document-lens/integration`** (`--no-ff`), off the current integration tip `0a03b4af9`. Re-run the full gate list; reconcile jest arithmetic against `test-impact.md`'s running count.
2. **W4 walk** (Sonnet, unsandboxed) — none exists yet (`build/w4-walk.md` and `build/w4-walk/*.png` are absent). Walk 1440/1280/390 × s0/s2/s3/foot × project/pre-work, plus the six quiet-region strings against `reconciliation.md`'s W4-R1 table.
3. **Design-lead W4 review** — does not exist yet (only correctness + fidelity reviews are on disk for W4). New DESIGN LEAD fork reads `w4-review-{correctness,fidelity}.md`, `w4-fix-log.md`, D-B33–D-B36, and rules the two items left open for the seat: **D-B34's CLS-chrome scope** (allowlist `[data-document-spine]`/`[data-lens-band]`/`nav[aria-label="Document bar"]`, per correctness' own recommendation) and **W4-R1's approvals sr-only cell** (NF4-01: the leader printed at quiet is one of three admin acts, never `Send a reminder`, contradicting the ratified column 3).
4. **W5 integration** — merge `w5-l1` → `w5-l2` → `w5-l3` onto integration in that order (l2 re-parents blocks l1 introduces; l3 is independent but touches the same mobile files l1/l2 leave alone). **Delete the `// D-B30: net of MobileMarginChips until W5-L3 lands` allowance line** in `lens-band-height.spec.ts` now that l3 ships the Margin sheet and retires the chips block at 390. Re-point the 390 first-head gate to **≤435px gross** (W3-R7's engine-allowance number, no longer net-of-chips).
5. **W5 reviews + walk** — correctness + fidelity (adversarial, separate from the l1/l2/l3 implementers), then the walk, against W5-R1 (Margin sheet) and W5-R2 (pre-work regions, the `scope`/`vision`/`investment` re-parenting, the dropped inline `<h2>`s).
6. **Wave 6**:
   - Rebase `document-lens/integration` on `main` (freeze check: if anything landed on a frozen path at a boundary, re-verify every proposal §9 anchor and record drift).
   - Full gate basket **twice** — once as usual, once more after `supabase db reset` + a fresh seed apply (no spec may depend on run order or leftover state).
   - Design-lead final walk, L-1…L-11 vs the mockup, all three widths, each "differs" ruled.
   - Architect's 16-decision audit (OD-1…OD-16) + close `build/design/deviations.md` (D-B1…D-B36, all ruled or explicitly left open with an owner).
   - `LENS_DRY_RUN=1 bash build/deploy-lens.sh` — **Kody runs this**, agents are hook-blocked from it and from anything naming `deploy-lens.sh` or invoking `wrangler`.
   - Fill `build/ledger/R127-draft.md` / `I152-draft.md` / `I152-deploy-draft.md`'s `<!-- W6 -->`/`<!-- fill -->` markers against the real W4–W6 merges, then promote them into `docs/design/the-document/DECISIONS.md` as `R127`/`I152`.
   - `scripts/repo-gc.sh` (dry-run, then `--apply`) to retire finished worktrees.
   - PR `document-lens/integration` → `main`, `--no-ff`.
7. **Kody runs `bash build/deploy-lens.sh`** for real, from a clean `main`, after the PR merges.
8. **Write `I152-deploy`** in `DECISIONS.md` from the script's own output (before/after version ids, every probe line verbatim, rollback command verbatim) — the drafted form is already at `build/ledger/I152-deploy-draft.md`, every value a `<!-- fill -->` comment except the known `9c0c2cdd-…` literal and the rollback command.
9. **Kody's signed-in prod walk — OWED**, recorded as owed at `I152-deploy` until it happens (checklist: `build/30-deploy-runbook.md` "Kody's signed-in walk").

## Worktrees (current, `git worktree list`; branch → tip)

| Worktree | Branch | Tip |
|---|---|---|
| `agent-lens-integration` | `document-lens/integration` | `0a03b4af9` |
| `agent-lens-w4-fix` | `document-lens/w4-fix` | `f76ba828a` |
| `agent-lens-w4-int` | `document-lens/w4` | `f76ba828a` (the fix lane's tip — `w4-int`'s own branch pointer trails at `a13acb16c`, see below) |
| `agent-lens-w4-l1`/`l2`/`l3`/`l4` | `document-lens/w4-l{1,2,3,4}` | lane heads, all ancestors of `document-lens/w4` — retire once W4 merges to integration and `merge-base --is-ancestor` confirms it |
| `agent-lens-w5-l1` | `document-lens/w5-l1` | `78eb0ab54` |
| `agent-lens-w5-l2` | `document-lens/w5-l2` | `be6b66030` |
| `agent-lens-w5-l3` | `document-lens/w5-l3` | `a6af4b698` |

**Merged (ancestor of `document-lens/integration`, confirmed this pass):** `w0`, `w1`, `w2`, `w3`, `w3-fix`.
**Not merged into integration:** `w4`, `w4-fix`, `w5-l1`, `w5-l2`, `w5-l3`. **Not merged into `main`:**
everything — `main` is still `dab057537`; no PR is open yet. Don't trust a branch name alone — always
re-run `git -C /Users/kody/Code/patina-merged merge-base --is-ancestor <branch> <target>` before treating
anything as landed; `document-lens/w4`'s own branch ref can trail its worktree's checked-out commit
(seen this pass: the worktree is at `f76ba828a`, the local `w4` branch ref may still read `a13acb16c`
until the fix lane's merge is pushed back onto it).

## Seed — command + verify

```
docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/the-document-lens-seed.sql
docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 < artifacts/document-lens-build-2026-08-29/build/seed/seed-verify.sql
```

Steady-state result: **17/17 PASS** (rooms 5, lines 62/58-with-product, damaged 1, blocked 2, unspecified
2, overdue approvals 2, POs 4/1-unacknowledged-14d, margin_items 7 = 3 beside-Pieces + 4 whole-job,
pre-work `…d6` exists, install milestone = `CURRENT_DATE + 21`). Two known drift risks, not defects:

- **`margin_items` view drift** — W3's walk (pre-fix-lane) read **15/17**, with `margin_items total`
  and `whole job` off by one (8/5 instead of 7/4). Logged at W2 as pre-existing seed-state drift, not a
  Wave-3 defect — the view (`00194`/`00282`) is state-derived (decision/approval status ages), not a
  static count, so a re-seed or a stale local DB can read a transient extra row. **Always re-run
  `seed-verify.sql` after any `supabase db reset` or seed re-apply and expect 17/17 before trusting a
  walk's margin numbers**; if it reads 15 or 16, re-apply the seed script fresh rather than debugging
  the app.
- **Install-milestone rollover** — the seed originally computed "next Tuesday on/after `CURRENT_DATE +
  21`," which drifted 21–27 days depending on the day the seed was run (fidelity L2-7, +24d observed on
  2026-08-29) and could round to "4 WEEKS" instead of the required "3 WEEKS." Fixed to a flat
  `CURRENT_DATE + 21` (no weekday search) — but `CURRENT_DATE` still evaluates in the Postgres session's
  own date, which is not guaranteed to agree with the walker's or Kody's local wall-clock day right at a
  UTC midnight boundary. If a walk run straddles that boundary, the milestone date and the "3 WEEKS"
  string can read one day off from what the seed script's own comment expects — re-run `seed-verify.sql`
  and trust its printed `actual` column over any hand computation.

## Dev-server boot (steward)

```
NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_URL=… \
  SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_JWT_SECRET=… \
  NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live \
  NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true,the-document-pilot:true,design-request-pool:true,procurement-workspace-pilot:true' \
  nohup npx turbo run dev --env-mode=loose --filter=@patina/designer-portal \
    --filter=@patina/orders --filter=@patina/media --filter=@patina/projects \
    > build/dev-boot-w<N>.log 2>&1 &
```

Values are the local Supabase CLI's own demo keys (`npx supabase status`), passed inline — **never**
written to `.env.local` (none exists in a fresh worktree; the middleware 500s with "Your project's URL
and Key are required" until the five vars are inline). **`--env-mode=loose` is required**: `turbo run
dev`'s strict mode only passes through `NEXT_PUBLIC_FLAG_OVERRIDES` via framework inference, silently
stripping `SUPABASE_SERVICE_ROLE_KEY` and 500ing every server-rendered route that uses the service
client, while the browser looks fine — this cost `dissolve-redirects.spec.ts:420` a full triage cycle
once already. Warm `/doc/…d4`, `…d5`, `…d6` with `curl` before running e2e against a cold server.

**Webkit fresh-boot trap (found in the W4-fix lane, cost real time twice):** a dev server that has
absorbed many hot-recompiles gives **reproducible-looking webkit failures that are not defects** —
stale `offsetTop` reads, a just-added `data-*` attribute reported missing, `page.goto` interrupted by
another navigation. The tell is that the same case passes clean on a freshly booted server. **Restart
the dev server before trusting any webkit failure in this program**, and re-warm the three doc routes
first.

## Open / owed

- **Kody's signed-in prod walk** — owed after the real deploy (ruling 7); no session before ship.
- **D-B5 — `estimated_hours` editor unreachable** after the `PHASES` fold's W1 deletion; still open, owed a re-home in the schedule region.
- **The `/desk` `welcome-modal-overlay` defect** — a real, reproducible pointer-event-eating `aria-hidden="true"` overlay on the direct `/desk → click` path (help-system's first-signin tour); pre-existing, unrelated to any lens file, still unfixed.
- **N2-01…N2-06** (W3-fix pass-2, all minor/nit, none gating) — the damage-window carrier date still can't rank (no source column; N2-01); a client-side nav mislabels every 390 telemetry impression as `tier:'full'` (N2-02, worth taking into the next lane); `sense`/`tier` can disagree on a due-today deadline (N2-03); the short form's `ND` grammar doesn't distinguish past/ahead (N2-04); two stale code comments (N2-05); a rare announcement pre-empt window (N2-06).
- **W4-N nits** (correctness sign-off, `w4-fix-log.md` "Left for a ruling" + the sign-off's "New findings" table) — W4-N-01 (two dead symbols), **W4-N-02** (D-B34's CLS-chrome predicate is a denylist, not the allowlist the ruling now specifies — rides the design-lead ruling due next), W4-N-03 (`data-passed` has no reader since D-B33's `content-visibility` deletion), W4-N-04 (a stale comment block), **W4-N-05** (one remaining `boundingBox()` site D-B35's `layoutHeight()` fix missed, in `quiet-responsive-shell.spec.ts:235`), W4-N-06 (a real disclosure-state bug in `previous-work.tsx`, narrow reachability), W4-N-07…13 (nits). None gate W4; several are one-line fixes worth folding into the W5 or W6 integration pass rather than deferring further.
- **The readiness RPC fan-out** (D-B28) — one `get_project_ffe_readiness` round-trip per FF&E line at concurrency 8 (42–90+ requests per paper open); confirmed pre-existing, unrelated to any lens file, logged not owned. A batched RPC would remove it but is out of scope under the debts rule.
- **Long-paper cost census, owed at W6** (D-B33's ARCHITECT verdict) — on `…d5` at 1440, record the DOM node count, the 30-step settled-scroll's main-thread time + p95 frame duration (`PerformanceObserver` long-animation-frame/longtask, chromium) and `performance.memory.usedJSHeapSize` where available, printed ungated in I152. If p95 exceeds 16.7ms, the OD-4 `content-visibility` candidate (deleted in W4-fix, D-B33) reopens.
- **D-B36** — a `DocSheet` field never enters `editing`/freezes the lens; ratified as correct behavior (the paper isn't under the hand that's on a sheet), two assertions added; no code change, just recorded so it isn't rediscovered as a bug.
