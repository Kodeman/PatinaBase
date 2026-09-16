# W5 fix round 1 — report

Branch `hour-tracking/w5-export`, worktree `.codex/worktrees/agent-portal` (lane B). Commit `05fab927a` (amended once locally for a prettier pass before push, per patina-parallel-work — never amended after push), pushed to `origin/hour-tracking/portal` (`4478b769b..05fab927a`). DB untouched (no `supabase db reset`, no migration — W5 mints nothing per plan-v2 §6).

## Findings applied

**B1/B2 (blocker/high, combined)** — `apps/designer-portal/src/lib/time-billing.ts`, `apps/designer-portal/src/lib/document/invoice-composer.ts`:
- `buildTimeLineDraft`'s `description` is now **always** the generic "Design services — Xh Ym (N entries)" phrasing — the `personName`/`label` branch that printed a member's name into the persisted `invoice_line_items.description` is deleted outright. That field is what `resolve_invoice_link` (00588) returns verbatim and what both the client pay-link sheet (`invoice-sheet.tsx`) and the printed/PDF copy (`InvoicePaper`) render verbatim, so a name written there reached the homeowner regardless of the separate `attribution` sanitiser — confirmed by reading all four hops (`time-billing.ts:97-117` → `invoice-composer.ts:198-219` → `00588:227` → `invoice-sheet.tsx:871`) before touching anything.
- `buildComposerLines` no longer calls `groupEntriesByPerson` to emit one `kind='time'` line per author. It now calls `buildTimeLineDraft(selection.timeEntries)` once, merging every selected entry — regardless of author — into exactly **one** time line, with the dated sub-table (`metadata.attribution`) merged and date-ordered across every person. Per-person naming stays exactly where it already worked and was never broken: the composer's own entry picker (`invoice-composer.tsx:641-647` — now the `member_name` rows in the checkbox list), which reads each raw entry's `member_name` directly, before entries are ever merged into a line.
- `groupEntriesByPerson` itself is untouched and still exported/tested (`time-billing.test.ts`) — it's a pure utility no longer called from the composer, kept for any future designer-side, non-invoice grouping.
- **Bonus correctness fix found while implementing B2, not asked for but load-bearing**: `invoice-composer.tsx`'s `draft()` does `const timeLine = lines.find((l) => l.kind === "time")` — singular — and only claims (`claimTime.mutateAsync`) that one line's `time_entry_ids`. Under the old N-lines-per-person shape, every person after the first would be billed (their amount rolled into `invoice.total_cents` via the other time lines) but their `project_time_entries.invoice_id` would never be set — unclaimed, unlocked hours sitting on an already-issued invoice. Merging to one line removes this hazard as a side effect; I did not touch `draft()` itself since the fix is structural (there is now only ever 0 or 1 time line to find).
- Tests: rewrote the two tests that asserted the old (wrong) contract — `time-billing.test.ts`'s "names the row when every entry agrees on one member_name" now asserts the description stays generic; `invoice-composer.test.ts`'s "HT-21 — one composer row per person" now asserts exactly one merged line with a two-author dated sub-table and asserts the description/attribution together never match `/Leah|Brooks|Maria|Alvarez/`. The pre-existing "time entries roll into ONE line" test (which was already correct and had been sitting alongside the contradictory one) needed no change.

**M1 (major/high)** — `apps/designer-portal/src/components/document/hours-ledger.tsx:279-306`:
- The CSV's `Client` column map was built `(designerClients ?? []).map((c) => [c.id, ...])` then looked up with `projects.client_id`. `c.id` is the `designer_clients` row's own id; `projects.client_id` FKs `profiles.id` (`projects_client_id_fkey`, confirmed in `database.types.ts`), which is `designer_clients.client_id`, not `designer_clients.id`. Rekeyed the map on `c.client_id` (filtering out clients with no linked profile first, since `client_id` can be null for direct-contact-only clients). Did not add a unit test — no test file covers this memo today and none is named by the finding; noted below under "not verified."

**M2 (major/high)** — `packages/patina-design-system/src/components/InvoicePaper/InvoicePaper.tsx` (new `InvoicePaper.test.tsx`):
- Chose "extend InvoicePaper" (the finding's first option) over recording a deferral, since the plan re-scope was explicitly left to the orchestrator and the fix was contained to one shared component both portals' print routes already consume identically.
- Added `kind?: string` and `metadata?: Record<string, unknown> | null` to `InvoicePaperLine`, and a `parseTimeSubtable` helper mirroring the client pay-link sheet's own parser (`apps/client-portal/.../invoice-sheet.tsx`), reading `metadata.attribution` (the raw DB row shape `useInvoice`'s `select('*')` returns) rather than a flattened top-level `attribution` (the RPC-shaped field `resolve_invoice_link` returns for the token-gated pay page). The line-row `<td>` now renders the same date · hours · rate sub-table beneath a `kind='time'` line's description, in both the designer's own print route and the client-portal's print route (both import the same `InvoicePaper`).
- `@patina/design-system`'s `package.json` `main`/`exports` point at `./dist` — **this is dist-resolved**, contradicting the patina-portal-features skill's stated "source-resolved" list for this package (verified directly via `grep '"main"'` + reading the `exports` block, per the skill's own "verify before editing" instruction — flagging the drift rather than trusting the doc). Rebuilt via `pnpm --dir <wt> exec turbo build --filter=@patina/design-system` (`dangerouslyDisableSandbox` — needed because the git-hash step in turbo's cache key touches `.env.local`, which the sandbox denies reading). `dist/` is gitignored, so nothing from the rebuild is committed; the rebuild was only to make the local render-check and gate runs see the new code.
- New `InvoicePaper.test.tsx` (3 cases, vitest): sub-table renders for `kind='time'` with a valid payload and asserts no member name anywhere in the DOM; a non-time line with a plain vendor-name `attribution` string renders no sub-table; a time line with missing or malformed `attribution` renders no sub-table (silent fallback, not a crash).

**M3 (major/high)** — render-checked live, not deferred:
- The plan.md's earlier walk attempt's "never hydrates" conclusion was a misdiagnosis, not a real bug: `apps/designer-portal/src/components/document/help/desk-walkthrough.tsx`'s WelcomeModal (server-backed via `help-system`'s `WelcomeModal.tsx`, `data-testid="welcome-modal-overlay"`) opens on first sign-in and its Radix overlay (`fixed inset-0 z-50`) intercepts every click on the page beneath it — the e2e fixture's old `localStorage` suppression key (`help-system.welcome-shown.first-project-walkthrough`) no longer works because that state moved server-side (`help-state-provider.tsx`'s comment: "a local 'welcome-shown' marker wouldn't travel"). The `[data-studio-books-doorway]`/⌘K click-based openers the earlier walker tried were being silently swallowed by that overlay; the `Object.keys(el).filter(k=>k.startsWith('__react'))` check on the doorway element was also not a real hydration test (a hidden/inert element behind an overlay still hydrates).
- Verified with a throwaway Playwright script (`@playwright/test`'s `chromium`, not the e2e suite — deleted after use, never committed) against the running dev server (`pnpm dev`, port 3000, `.env.local` already correctly pointed at the isolated stack `127.0.0.1:54421` / `DATA_MODE=live` from an earlier session): signed in as `designer@patina.dev` / `password123`, dismissed the Welcome modal with Escape, dispatched `document:open-ledger` with `detail: 'hours'` (the real event contract, confirmed by reading `studio-drawer.tsx` and `open-hours-scope.ts`), clicked the `the studio` scope word (exact accessible name, disambiguated from the drawer's "Find anything (⌘K), from the studio drawer" button which also matches a loose `/the studio/i` regex), and asserted the Export act.
- **1440**: Export → CSV renders beside the studio scope, above the totals (HT-30), not disabled (there is unbilled studio history even though "this week" shows 0 min) — screenshot confirms placement and text.
- **390**: same act renders full-width-safe at `x:46, width:121.75` (right edge 167.75, well inside 390), height 44px (meets the tap-target rule) — screenshot confirms no overflow or clipping.
- Both screenshots and the throwaway scripts were saved under the session scratchpad and are not part of this commit.

## Gates run (verbatim, per patina-verification)

```
pnpm --filter @patina/designer-portal type-check      → clean
pnpm --filter @patina/designer-portal test             → 579 suites / 7376 tests passed
pnpm --filter @patina/designer-portal lint              → 0 errors, 201 pre-existing warnings (none in touched files)
pnpm --filter @patina/client-portal type-check         → clean
pnpm --filter @patina/client-portal test                → 151 suites / 2475 tests passed (includes the
                                                            already-existing invoice-sheet-time-subtable.test.tsx)
pnpm --filter @patina/design-system type-check          → clean
pnpm --filter @patina/design-system test -- src/components/InvoicePaper/InvoicePaper.test.tsx → 3/3 passed
pnpm --filter @patina/admin-portal build                 → clean (strictest gate; admin-portal imports
                                                            @patina/design-system elsewhere, not InvoicePaper
                                                            itself — run anyway per the shared-package minimum bar)
```

`pnpm turbo build --filter=@patina/design-system` (dist rebuild) — succeeded, `dist/` gitignored so untracked.

## Not verified / explicitly deferred

- M1's fix has no dedicated unit test — no existing test file covers `clientNameByProjectId`, and the finding didn't name one to add. The two existing hours-ledger tests that touch the CSV export (`hours-ledger-add-row.test.tsx`, `hours-ledger-scope.test.tsx`) both mock `useClients: () => ({ data: [] })`, so neither exercises the join either before or after the fix. I did not add a new test file for this — flagging it rather than silently calling it covered.
- M3's live render check used a throwaway script, not a new Playwright e2e spec — the finding asked to "route a walk to a lane with a working dev server," not to author a permanent spec, so none was added.
- Did not re-run `pnpm --filter @patina/designer-portal test:e2e` (playwright) — out of scope for these findings and would need the flag/env wiring patina-testing documents for e2e specifically; the manual Playwright walk above is a substitute for the one blocked act, not a replacement for the e2e suite.
- Did not touch `apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx` — B1/B2's fix made the leak impossible upstream (the description itself is now always generic), so no client-portal render-path change was needed there; its own `invoice-sheet-time-subtable.test.tsx` still passes unchanged.
- Push triggered CI's full 21-check plan (local push budget of 12 exceeded) — I did not wait on or fetch that CI run; the gates above are the ones I ran and read directly.

## Files changed

- `apps/designer-portal/src/lib/time-billing.ts`
- `apps/designer-portal/src/lib/document/invoice-composer.ts`
- `apps/designer-portal/src/lib/__tests__/time-billing.test.ts`
- `apps/designer-portal/src/lib/document/__tests__/invoice-composer.test.ts`
- `apps/designer-portal/src/components/document/hours-ledger.tsx`
- `packages/patina-design-system/src/components/InvoicePaper/InvoicePaper.tsx`
- `packages/patina-design-system/src/components/InvoicePaper/InvoicePaper.test.tsx` (new)
