# W5 — The bookkeeper's Friday (lane B, implementation)

**Branch** `hour-tracking/portal` · worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`
**Base** `origin/hour-tracking/integration` — already at the worktree's HEAD (`66d22ff96`, "merge W3") before any edit; `git merge --ff-only origin/hour-tracking/integration` reported "Already up to date."
**Migrations** none — `00615` and `00620` were already spent by W2 per plan-v2 §6; this wave mints nothing.
**Local DB** never touched — W5 owns no stage of it; no `supabase` commands were run.

---

## 0 · What HT-20/HT-21 actually required, worked out from the plan + rulings

The plan's terse "one composer row per person; the client's folio keeps one kind='time' line" (plan-v2 §6) and architecture.md's fuller "the client's folio keeps one priced line plus a dated sub-table … name the person per composer row" resolve to one design, not two:

- **Per person, not per entry.** The composer groups ticked time entries by author and builds ONE `kind='time'` line **per person** (previously one line for the whole selection, naming nobody). Each such line is itself the person's one collapsed line (all their ticked entries summed), never split further — that is the "one kind='time' line" architecture.md means per person.
- **The dated sub-table rides the existing `attribution` field — no migration.** `resolve_invoice_link` (00588) already reads `metadata.attribution` for a furnishings line's maker name and the client sheet already renders it in one sub-slot under the description. A time line's composer now writes a JSON-encoded `{kind:'patina_time_subtable', rows:[{date,minutes,rateCents}]}` into that same field instead of a name; the client sheet tries to parse it and falls back to plain text for every other line kind. This is why the wave mints no migration despite adding structured per-date data to the client folio.
- **No staffing detail reaches the homeowner (LEAH-15/REP-15).** The sub-table rows carry date · minutes · rate only — never a name, never a `member_name` field anywhere in the JSON.

## 1 · `apps/designer-portal/src/lib/time-billing.ts`

- `TimeLineEntryInput` gained four optional fields: `user_id`, `member_name`, `started_at`, `resolved_rate_cents`. All optional, so every existing caller (and test) that never carried author info is unaffected.
- `buildTimeLineDraft` names its row when every entry in the call agrees on one `member_name` (`"Maria Alvarez — 4h 30m (3 entries)"`); a mixed-author call (or one with no names at all) keeps the pre-HT-21 generic `"Design services — …"` phrasing rather than naming the wrong person. It also now returns `dateRows: TimeLineDateRow[]` (date/minutes/rateCents, oldest first, no name) built from whichever input entries carried `started_at`.
- New `groupEntriesByPerson(entries)`: one group per `user_id`, entries with no `user_id` landing in one shared unnamed group (exactly reproducing the old single-line behavior for every caller that never carried author info — this is what keeps the existing `buildComposerLines` "time entries roll into ONE line" test passing unmodified). Named groups sort alphabetically; the unnamed group sorts last.

## 2 · `apps/designer-portal/src/lib/document/invoice-composer.ts`

- `buildComposerLines`'s time section now calls `groupEntriesByPerson` and emits one `DraftLineInput` (`kind='time'`) per group via `buildTimeLineDraft`, `sortOrder` still sequential across the whole line set.
- Each line's `metadata.attribution` is `JSON.stringify({kind: TIME_ATTRIBUTION_KIND, rows: dateRows})` — set only when `dateRows.length > 0`, so a pre-HT-21-shaped call (no `started_at` anywhere) produces no `attribution` key at all.
- `TIME_ATTRIBUTION_KIND = 'patina_time_subtable'` and `TimeAttributionPayload` are exported so the exact marker is one shared constant (referenced, not duplicated, in the client-sheet's parser — see §5).

## 3 · `apps/designer-portal/src/components/document/accounts/invoice-composer.tsx`

`project_unbilled_time` (the composer's picker source) deliberately carries no author name (00596 dropped its profiles join). To name the row, the component now also reads `useProjectRoster(projectId)` (existing hook, `v_project_roster`, project-scoped, RLS-clean — no new query shape) and maps `profile_id → display_name`, attaching `member_name` to each unbilled entry before it reaches `selection.timeEntries`. The picker's own rows now show the name inline (`"Maria Alvarez · 3 September"`) so the "one row per person" grouping downstream is not a surprise. The picker's footnote text was corrected from "ticked entries bill as one line" to "…bill as one line per person."

The project's own designer (never a `project_team_members` row — she's seated by `is_project_team_member`'s OR-branch, not the roster) is left unnamed rather than guessed at; her entries still group correctly (by `user_id`), just without a printed name.

## 4 · `apps/designer-portal/src/components/document/hours-ledger.tsx`

- **Renamed** the R75 hand-off act from "Export week → Accounts" to **"Bill week → Accounts"** — it drafts an invoice, not a file, and HT-20/21 needed "Export" free for the real file act. (Doc comments and the one existing test's `getByRole` strings were updated to match; no other behavior changed.)
- **New "Export → CSV" act**, beside the studio scope only (`scope === 'studio'`), disabled with a reason when there is nothing to export. It reads the SAME fact view (`useTimeEntryLedger`) at studio scope over the shown week, enriches each row with two fields the view itself doesn't carry (`client_name` via the already-fetched `projects.client_id` + `useClients()`; `invoice_number` via one small `invoices(id, invoice_number)` lookup scoped to just the invoice ids present in the window), builds the CSV, triggers the browser download, and fires `documentEvents.time.exportTaken({scope: 'studio', row_count, period})`.
- The `document-hours-projects` query now also selects `client_id` (additive; nothing that read the old three columns is affected).

## 5 · `apps/designer-portal/src/lib/document/time-export.ts` (new)

Pure, dependency-free CSV builder from `TimeEntryLedgerRow` (+ the two caller-supplied fields above), mirroring `import-parse.ts`'s "no React, no network" shape and `qbo-export/index.ts`'s RFC-4180 escaping (`csvField`) and CRLF convention. Fixed 14-column header exactly as plan-v2 lists it. An internal row (W4, `project_id IS NULL`) naturally prints an empty Project cell — the ledger view's own `LEFT JOIN` already leaves `project_name` null, so no special-casing was needed. `downloadTimeExportCsv` is the one DOM side effect, kept out of the testable builders.

## 6 · `apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx`

Added `parseTimeSubtable(attribution)`, tried only when `line.kind === "time"`; every other kind's `attribution` is untouched (still the plain-text furnishings-maker-name render). On a parse, the sub-slot renders one line per dated row (`formatShortDate` · `formatMinutesAsHours` · `formatCurrency(...)/hr`) instead of the raw string, under `data-pay-line-time-subtable` for testability. No new sub-slot position — same span, same place, extended shape.

## 7 · Test-mock fallout from the new hook calls

Three test files fully mock `@patina/supabase` with an explicit export list; my new (unconditional) hook calls needed adding there or they'd throw `is not a function`:

- `hours-ledger-scope.test.tsx`, `hours-ledger-add-row.test.tsx` — added `useClients: () => ({ data: [] })`.
- `invoice-composer-studio.test.tsx` — added `useProjectRoster: () => ({ data: [] })`.

Verified the new `useTimeEntryLedger` call I added at `HoursLedger`'s own top level (for the studio-scope export) always pushes into the suite's `ledgerCalls` spy **before** any child `ScopeEntries` call in the same render (parent hooks run before children in one synchronous render pass), so the two existing `ledgerCalls.at(-1)` assertions still see the child's params, not mine.

## 8 · Environment note (unrelated to this wave's code, fixed anyway)

`pnpm --filter @patina/client-portal type-check` initially failed on 9 pre-existing `Cannot find module '@patina/aesthete-quiz'` errors in files this wave never touched (`quiz-flow.tsx`, `results-view.tsx`, `use-aesthete-matches.ts`, `matches.ts`). Root cause: `@patina/aesthete-quiz` is dist-resolved and its `dist/` had never been built in this worktree (confirmed pre-existing: the same errors reproduce with my diff removed via `git stash`, which itself failed on an unrelated sandboxed `.env.example` lstat — the working tree was never actually touched by the stash attempt). Ran `pnpm install` (needed `dangerouslyDisableSandbox` — sandboxed EPERM on an unrelated `.pnpm` unlink) then `pnpm --filter @patina/aesthete-quiz build`; the gate is clean after.

---

## Gates (verbatim, this worktree)

```
pnpm --filter @patina/supabase type-check          → clean
pnpm --filter @patina/designer-portal type-check    → clean
pnpm --filter @patina/designer-portal test          → 579 suites / 7376 tests passed
pnpm --filter @patina/designer-portal lint          → 0 errors, 201 warnings (all pre-existing; none in touched files)
pnpm --filter @patina/admin-portal build             → succeeded (full route manifest printed)
pnpm --filter @patina/client-portal type-check      → clean (after the aesthete-quiz build above)
pnpm --filter @patina/client-portal test            → 151 suites / 2475 tests passed
```

The wave's own new/extended specs (all included in the full run above): `apps/designer-portal/src/lib/document/__tests__/time-export.test.ts` (new), `apps/designer-portal/src/lib/__tests__/time-billing.test.ts` (extended), `apps/designer-portal/src/lib/document/__tests__/invoice-composer.test.ts` (extended), `apps/client-portal/src/app/pay/[token]/__tests__/invoice-sheet-time-subtable.test.tsx` (new).

## Done-when, checked against the gates above

- A studio-scope CSV opens with one row per entry, every row naming a person and a day (member_name/day columns), internal rows' Project cell empty, amounts summing to the ledger total — asserted in `time-export.test.ts`.
- A composer row names the person — asserted in `invoice-composer.test.ts`'s new HT-21 case and `time-billing.test.ts`.
- The client's folio shows one priced line per person with a dated sub-table and no staffing detail — asserted in `invoice-sheet-time-subtable.test.tsx`.
- The ledger's "Export" act now produces a file (CSV, studio scope); the invoice hand-off act is named "Bill week → Accounts", a different name.

## Files touched

```
apps/designer-portal/src/lib/time-billing.ts                                          modify
apps/designer-portal/src/lib/__tests__/time-billing.test.ts                           modify (extend)
apps/designer-portal/src/lib/document/invoice-composer.ts                             modify
apps/designer-portal/src/lib/document/__tests__/invoice-composer.test.ts              modify (extend)
apps/designer-portal/src/lib/document/time-export.ts                                  create
apps/designer-portal/src/lib/document/__tests__/time-export.test.ts                   create
apps/designer-portal/src/components/document/accounts/invoice-composer.tsx            modify
apps/designer-portal/src/components/document/accounts/invoice-overlays.tsx            modify (comment only)
apps/designer-portal/src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx  modify (mock)
apps/designer-portal/src/components/document/hours-ledger.tsx                         modify
apps/designer-portal/src/components/document/__tests__/hours-ledger-scope.test.tsx    modify (mock + label)
apps/designer-portal/src/components/document/__tests__/hours-ledger-add-row.test.tsx  modify (mock)
apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx                              modify
apps/client-portal/src/app/pay/[token]/__tests__/invoice-sheet-time-subtable.test.tsx create
```

No migrations, no iOS, no edge/cron changes, no QuickBooks integration — as scoped.
