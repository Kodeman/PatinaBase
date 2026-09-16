# Current-state capture — the Agreement room (`/drafting/<proposalId>`)

P0 of the "Agreement Room, Reconsidered" design-review program
(`/Users/kody/.claude/plans/this-agreement-build-is-abstract-nebula.md`).
Local production build of the designer portal, driven by Playwright as
`designer@patina.dev`. All 18 shots (6 situations × 3 widths) captured.

- Repo HEAD at capture time: `b8dd4b7f7`
- Local stack: `http://127.0.0.1:54321` (already running — not reset;
  `designer@patina.dev` was present, so `pnpm supabase:reset` was **not**
  run)
- Build: `NEXT_PUBLIC_FLAG_OVERRIDES=procurement-workspace-pilot:true,the-document-pilot:true,agreement-parts:true,agreement-library:true,design-build:true NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon> SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local service role> pnpm exec next build --webpack`
  run from `apps/designer-portal`, then `pnpm exec next start -p 3000` with
  the same env. (`packages/supabase` needed no build — it's consumed as TS
  source; the other 12 workspace deps were built first with
  `pnpm turbo build --filter=@patina/designer-portal^...`.)
- Server: still running in the background at capture end, PID recorded
  below.

## Proposals used (throwaway, not deleted — safe to drop any time)

- `9375507e-8aff-4156-ab9d-fd0f1dea84ee` — "Okonkwo house — design services
  agreement", seeded via `tools/seed-draft.mjs` (mirrors
  `e2e/agreement/agreement-parts.agreement.pw.ts`'s `beforeAll`: draft
  `design_services` proposal for `designer@patina.dev` + a
  `proposal_service_terms` row: ceiling $24,000, retainer $5,000/at
  countersignature, monthly cadence, no rate-card rows — which is what
  produces the fee-floor blocker in situation 3). Used for situations 2–6 at
  all three widths, and for the first (contaminated, later replaced) resting
  shots.
- `65f1616d-4af0-44f9-947a-3977c9be082a` — same shape, second throwaway, used
  ONLY to recapture pristine `resting-1024`/`resting-390` (see note below).
- No client account was set on either proposal — the "Client account" block
  shows "Select or invite a client…" throughout, which is the intended
  fallback state per the brief.

## The eighteen files

| File | Situation | Width | Notes |
|---|---|---|---|
| `resting-1440.png` | 1. Resting — nine parts materialized, no part selected, "Saved" (not dirty) | 1440 | Pristine first open. |
| `resting-1024.png` | 1. Resting | 1024 | Pristine — see "resting contamination" below. |
| `resting-390.png` | 1. Resting | 390 | Pristine — see "resting contamination" below. |
| `clause-editing-1440.png` | 2. Services (clause) mid-edit — Body textarea filled with fixture prose | 1440 | |
| `clause-editing-1024.png` | 2. Same | 1024 | |
| `clause-editing-390.png` | 2. Same | 390 | |
| `money-part-fee-floor-1440.png` | 3. Retainer selected; readiness aside shows "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee." | 1440 | |
| `money-part-fee-floor-1024.png` | 3. Same | 1024 | |
| `money-part-fee-floor-390.png` | 3. Same | 390 | Only the "client's copy · live" preview panel is hidden below 1180px (`min-[1180px]:block` — `agreement-composer.tsx:960`). `ReadinessPanel` (`agreement-composer.tsx:904`, defined `:1032`) sits in the rail column, which stacks full-width below 1180px — so the fee-floor sentence stays visible at 390. |
| `preview-sheet-1440.png` | 4. "Preview client copy" `DocSheet` open | 1440 | |
| `preview-sheet-1024.png` | 4. Same | 1024 | |
| `preview-sheet-390.png` | 4. Same | 390 | |
| `review-and-send-sheet-1440.png` | 5. "Review & send" sheet open | 1440 | Opened natively — the RoomShell header action is visible at this width. |
| `review-and-send-sheet-1024.png` | 5. Same | 1024 | **Different mechanism** — see note below. |
| `review-and-send-sheet-390.png` | 5. Same | 390 | **Different mechanism** — see note below. |
| `seven-facets-after-return-1440.png` | 6. Seven-facet room after "Return to the seven facets" (LAST — discards parts) | 1440 | Header now reads "6 of 7 facets written". |
| `seven-facets-after-return-1024.png` | 6. Same | 1024 | |
| `seven-facets-after-return-390.png` | 6. Same | 390 | |

## Two things worth flagging to the panel

1. **"Review & send" has no trigger below 1180px.**
   `room-shell.tsx:155` renders the header's action slot as
   `<div className="hidden min-[1180px]:block">{action}</div>` — the
   Contract Room's only "Review & send" control lives in that slot (the
   composer's own body only offers "Preview client copy" and "Return to the
   seven facets" — see `agreement-composer.tsx:743-761`). There is **no
   on-page way to open the send sheet starting from 1024px or 390px** in
   the shipped product. `review-and-send-sheet-1024.png` and
   `review-and-send-sheet-390.png` were produced by
   `tools/capture-send-sheet-resize.mjs`: open the sheet at 1440 (where the
   trigger exists), then `page.setViewportSize()` down to 1024 and 390 and
   screenshot the same open sheet, capturing how the sheet itself reflows —
   not how a user would reach it at that width, because they currently
   cannot. This is itself a finding for the "where do the acts live" crux.

2. **Resting-state contamination, and how it was fixed.** The first pass of
   `tools/capture.mjs` runs all six situations per width in one page
   session, cycling through 1440 → 1024 → 390 on the SAME proposal. Situation
   5 (Review & send) calls `reviewAndSend()`, which persists the composition
   if dirty (`agreement-composer.tsx:652-656`) — and situation 2 already made
   it dirty by editing the Services body. That save runs
   `upsert_agreement_parts`, which calls `_project_agreement_terms`
   (`supabase/migrations/00575_agreement_parts.sql:2249`), and the clause
   keyed `patina.services` IS the projection's `scope` column
   (`:2934-2939`: `'scope', COALESCE((SELECT ap.payload->>'body' … WHERE
   ap.part_key = 'patina.services' AND ap.kind = 'clause'), '')`) — so the
   NEXT width's fresh page load re-materializes Services pre-filled from that
   updated `scope`, not the original seed text. `resting-1024.png` and
   `resting-390.png` came out already showing the edited Services body, not a
   pristine first-open. Fixed by
   seeding a second throwaway proposal
   (`65f1616d-4af0-44f9-947a-3977c9be082a`) and recapturing ONLY those two
   files with `tools/capture-resting-only.mjs`, which never edits or saves
   anything. `resting-1440.png` was unaffected (it's the first screenshot
   taken in its session, before any edit).

## What failed along the way (all recovered)

- First full `capture.mjs` run: the sheet-close step used
  `page.getByRole('button', { name: /put back|close/i })`, which
  substring-matches BOTH the real close control (aria-label "Put back ·
  Esc") and the full-screen backdrop (aria-label "Close sheet backdrop");
  `.first()` picked the backdrop, whose click point sits behind the visible
  dialog panel, so every close attempt hit a 30s "subtree intercepts pointer
  events" timeout and cascaded into failing the send-sheet and return steps
  downstream. Fixed by closing sheets with `Escape`
  (`doc-sheet.tsx:299-306` listens for it whenever the sheet is the top
  modal) instead of a role/name click.
- Rail-row selection risked ambiguity: each row renders three buttons whose
  accessible names all substring-match the part title ("Reorder Services",
  the row-select button, "Part options for Services"), and the reorder
  handle sits first in DOM order. Fixed by selecting the un-labelled button
  specifically (`button:not([aria-label])`) within the `<li>` filtered by
  title text.
- `adminDb.auth.admin.listUsers()` 500s against this local stack (seed rows
  have NULL `confirmation_token`, which GoTrue's Go scanner can't read) —
  same trap `e2e/helpers/supabase-admin.ts` documents. `seed-draft.mjs`
  reads `auth.users` directly via `psql` instead.
- Node ESM resolution walks up from the importing file's own path; since
  `shots/tools/*.mjs` lives under `artifacts/` (no `node_modules`
  ancestor), plain `import` of `playwright` / `@supabase/supabase-js`
  failed with `ERR_MODULE_NOT_FOUND`. Fixed with
  `createRequire(import.meta.url).resolve(pkg, { paths: [...] })` pointed at
  the app's / pnpm store's `node_modules`.
- `kill <pid>` on the pre-existing `:3000` dev server failed once inside the
  default Bash sandbox ("operation not permitted"); succeeded with
  `dangerouslyDisableSandbox: true`. Same for `supabase status` (reads
  `supabase/.env.local`, which is sandbox-denied) and the portal
  build/start (writes `.next`, reads `.env.local`).
- `next start` printed `⚠ "next start" does not work with "output:
  standalone" configuration. Use "node .next/standalone/server.js"
  instead.` — cosmetic here: `curl /auth/signin` returned 200 immediately
  and the whole capture run completed against it, so the warning did not
  block this capture. Flagging in case a later lane hits it for real.

## Server left running

`next start -p 3000` is still running at the end of this capture — PID
`82958` (`lsof -ti :3000` at handoff; `curl http://localhost:3000/auth/signin`
returned 200). Left up in case a later lane in this program wants to reuse
it; kill with `lsof -ti :3000 | xargs kill` when done. Local Supabase stack
was already running before this task and was left running.

## Not done / out of scope for P0

- No prod screenshots — Kody supplied one separately per the plan.
- Shots are intentionally uncommitted (`shots/` stays local; the program's
  `docs(design):` commit at the end covers `briefing/`, `panel/`,
  `synthesis.md`, `specimens/`, `deck/`, `review/`, `rulings.md` only).
