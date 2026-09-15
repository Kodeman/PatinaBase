# W3 — Capture with nothing in hand, and yesterday's hour (lane B, implementation)

**Branch** `hour-tracking/portal` · worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`
**Base** `origin/hour-tracking/integration` @ `e4d57b344` (fast-forwarded before any edit)
**Head** `959ead009` · pushed to `origin/hour-tracking/portal`
**Local DB** the port-isolated stack `patina-hours` — API `http://127.0.0.1:54421`, Postgres `127.0.0.1:54422`. The shared 54321/54322 stack was never touched.

---

## 0 · The merge, and the one thing it needed

`git merge --ff-only origin/hour-tracking/integration` refused at first: the worktree's `supabase/config.toml` is skip-worktree'd with the isolated ports, and the integration tip changed that file (+22 lines — lane D's `[functions.time-nudges]` block). Handled without staging it:

1. `git update-index --no-skip-worktree supabase/config.toml`
2. `git checkout -- supabase/config.toml`
3. fast-forward merge (clean, 12 files)
4. re-applied the seven port edits + `project_id = "patina-hours"`
5. `git update-index --skip-worktree supabase/config.toml`

`git log --name-only` over all five of my commits confirms **`supabase/config.toml` was never staged**.

---

## 1 · Migration `00608_log_time_and_start_timer.sql`

Two functions, both `SECURITY INVOKER` with `SET search_path = public, pg_temp`. RLS stays the authorization spine on both; neither reads nor writes a row the caller's own policies would refuse.

### `public.log_time(...) RETURNS public.project_time_entries`

Signature exactly as plan-v2 §4 specifies (twelve params, `p_studio_id` last).

- **Client-minted id + `ON CONFLICT (id) DO NOTHING`**, and on a conflict a second `SELECT` returns the **existing** row — never `NULL`. A replayed Field drain (W6) must not write a second hour and must not read its own replay as a failure. If the id is taken by a row the caller's RLS cannot read, it raises `insufficient_privilege` rather than returning nothing, because "nothing" would read as a silent success.
- **HT-11** — `p_billable IS NULL` **raises**. There is no default anywhere in the chain now.
- **§0.11** — a `NULL` or non-positive `p_duration_minutes` raises. `log_time` may never open the desk's one running slot.
- **HT-13** — `p_started_at` is any timestamp, unbounded. No DDL: the "until invoiced" half is already `guard_invoiced_time_entry` (`00177:51-84`, §0.12), and the "backdated" mark is derived from `created_at - started_at`. **`00609` stays unused**, deliberately.
- **W4** — `p_project_id` may be `NULL`; `project_time_entries_internal_scope_ck` (00610) already states the studio-and-non-billable rule, so this function does not restate it.

### `public.start_timer(...) RETURNS TABLE (started project_time_entries, stopped project_time_entries)`

- Stops the incumbent and opens the new slot **in one transaction**, returning both rows — so the caller can still raise the log-offer strip for the hour it chained out (R20, §0.22).
- `p_billable IS NULL` raises (the plan's third bullet is not scoped to `log_time`; it reads on both).
- `p_project_id IS NULL` raises — internal time is typed, never clocked, and the CHECK that makes it non-billable cannot price an open-ended row.
- **The running-slot rule.** A bounded two-attempt loop: stop whatever this user has open, take the slot; if a *second session* opened one in the gap between the `UPDATE` and the `INSERT`, the partial unique index (`00177:37-41`) trips `unique_violation`, the loop closes that one too and retries once. A third collision is a real fight over one person's clock and is raised. The **first** row closed is the one returned as `stopped` — that is the hour the caller was working on.
- The server-side stop computes duration and `raw_seconds` from wall clock. It does **not** replace the client's D10/R64 close-out: the provider still runs `closeOut()` first (idle annotation, the abandonment bound, the sub-60s `timer_auto` discard), so `start_timer`'s own stop only ever fires for a row this session never watched.

Grants: `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` on both, with a postcondition block that probes `prosecdef`, the `ON CONFLICT` text, the two billable raises, and both roles' `has_function_privilege`.

**Grants seed** regenerated with the **worktree's own** `python3 ./scripts/generate-legacy-grants.py` (§0.20 — 2643 statements). The diff is exactly the four statements 00608 adds, nothing else.

**Numbering re-checked across every remote ref** (§0.2a) immediately before the push: `00608` exists on `hour-tracking/portal` alone; `00609` exists on no ref; the peer people-room program is at `00621–00627`. No collision.

---

## 2 · The data layer (`packages/supabase/src/hooks/use-time-tracking.ts`)

Every hook keeps its exported identifier (§0.21).

| Change | Ruling |
|---|---|
| `useCreateTimeEntry` writes through `log_time` under an id it mints (`crypto.randomUUID()` with a deterministic fallback) | 00608 |
| `CreateTimeEntryInput.billable` is now **required**; `billable: input.billable ?? true` is **deleted** | HT-11 |
| `source` union widens with `'command_bar'` (new `TimeEntrySource` type) | W0-9 |
| `useStartTimer` calls `start_timer`, returns `{ started, stopped }` (`StartTimerResult`) | 00608 |
| The `23505` branch, the `quiet` flag, `TimeToast` and the injected toast are **deleted** | plan §4 |
| `ProjectTimeEntry` gains `activity` and `source` (real columns the surfaces read back) | — |
| New `useTimeCaptureProjects()` — every project the caller can read, sharing the Hours sheet's own `['document-hours-projects']` key | HT-25 |
| New `useMyRateRoles(projectId)` — the viewer's live seats, filtered to the four a rate card can price; the project's own designer is fixed at `lead_designer` | HT-41 |

**On deleting `quiet`/`TimeToast`.** The plan's round-2 note (finding n1) said the inherited 23505 fallback protects none of W3's doors, and it is right: the shipped call site passed `quiet: true`, and the `(document)` group mounts no `ToastProvider` by R83 so `useToast()` returned a *truthy* no-op. Since `start_timer` no longer 23505s on the normal path, the whole apparatus is removed rather than re-plumbed. A real failure surfaces through the mutation's own error, inline at the act site.

**`database.types.ts`** regenerated against the isolated stack; the diff is exactly the two new functions.

---

## 3 · The doors

### The ⌘K verb — `log-time-sheet.tsx` (new) + a registry entry

`STUDIO_VERBS` gains `log-time`, so the row is printed by the **existing** `STUDIO_VERBS.map(surfaceRow)` in the `eyebrow: 'Begin'` section — the one non-in-hand group. `runForSurface` dispatches `openLogTime()`; `LogTimeOverlay` is mounted in `(document)/layout.tsx` beside the other always-listening overlays.

Aliases deliberately **exclude** bare `time` / `hours`: those belong to the Hours ledger, the review surface. What a designer types to *capture* is a verb.

The form: document · minutes · **date** · activity · Enter.
- **HT-25** — the document list is every project she can read, rostered or not, and the form **says before she logs** that she will be seated as a support designer (`useMyRateRoles` returning `[]`). 00597 writes that seat and the owner can remove it; that is not a surprise to spring afterwards.
- **HT-13** — the date is hers with no bound; past 30 days the form prints `backdated` as a plain DM-mono word in the row's own ink (HT-40 — no badge, no colour).
- **HT-24** — the activity starts `activity not set` and is never required.
- **HT-11/HT-12** — the billable pill, seeded from the resolved answer, with the reason beside it.
- **HT-41** — the role picker only for a member holding more than one live seat.
- **No inline NL parser this wave** (plan §4/§6).

### The bare `t` — `log-time-shortcut.tsx` (new)

Second bare single-key global after `?`; reuses `isEditableTarget` / `anOverlayIsOpen` from `registry-shortcuts`. One guard is its own: **`g` `t` is The Post's chord** and both handlers sit on `window`. `registry-shortcuts` now exports `chordIsArmed()` (its armed flag moved from a component ref to module scope for this), and the `t` handler yields on `chordIsArmed() || e.defaultPrevented` — belt and braces, because the consuming handler clears the armed flag before later listeners run, and on an event dispatched *at* `window` listener order is registration order, not phase. Printed in "The keys".

### Shared capture controls — `time-capture.tsx` (new)

`useBillableIntent` · `BillablePill` · `RateRoleChip` (a picker, for an INSERT) · `RateRoleMark` (read-only, for a surface where the hour is already written) · `RateReadout` · `isBackdatedEntry` · `isoDateValue` / `startedAtFromDateValue` / `BACKDATE_MARK_DAYS`.

`billableIntentSentence()` in `authority-hours.ts` is HT-12's other half: `non-billable · no agreement` / `· retainer unpaid` / `· agreement not active` / `billable · agreement active`.

**One correction to the plan's shape, forced by 00600.** `rate_role` is caller-suppliable on INSERT and **immutable afterwards** — `aab_guard_commercial_time_entry_derived_fields_trg` raises for every non-postgres caller on any `rate_role` edit. So the "role chip" is a **picker only where the row is being created** (the ⌘K form, the ledger add row, the phone) and a **read-only mark** on the log strip and on existing entry rows. A picker there would have offered an edit the server refuses.

### The three surfaces that already existed

**Ledger add row** (`hours-ledger.tsx`) — a date field that follows the **paged week** (`weekOffset === 0 ? today : weekStart`), the billable pill seeded per document, the role chip, the `backdated` word, and `startedAt` on the write. `addValid` unchanged this wave (W4 relaxes the project requirement). Entry rows carry the pill (committing `billable` through the existing `commit`), the read-only role mark and the derived `backdated` word; the scoped rows carry the word too — the fact view already returns both timestamps, so it cost one array element and no second read.

**Log strip** (`log-strip.tsx`) — the `'design'` activity default at `:30`/`:36` is gone; the select opens on `activity not set`. The pill is seeded from `offer.billable` (the answer the **server** stored, carried on the offer), the rate readout prints the provenance or `rate pending`, and the role mark appears only for a multi-role member. **The zero-tap path stays zero** — `Log` with nothing touched still writes, now with an explicit `billable`.

**The phone** (`mobile-sheets.tsx`, `MobileTimerSheet`) — HT-14. With nothing held the sheet now shows `Nothing in hand`, an honest sentence in place of a 00:00 clock, and a **document picker**; the Add act is disabled until one is chosen; and the form clears **only after the server says the hour landed** — a refusal renders inline and leaves the typed minutes in place. The old `useEffect` that closed the form whenever nothing was held is deleted (it was part of the bug).

**The provider** (`document-time-provider.tsx`) —
- `hold`/`resume` go through `start_timer`. A row *another tab* opened that the RPC had to stop is turned into an offer by the new `offerFromServerStop`, so it still gets its strip.
- The stop payload now states `activity: null` (HT-24 — "not set" said out loud) and `billable: timer.billable`. **It is not re-resolved at stop**: a fail-closed authority read hiccuping at that instant would silently un-bill an hour that started billable. Neither is a required field (§0.22).
- The offer carries the stored rate facts (`billable`, `hourlyRateCents`, `rateSource`, `rateRole`, `ratedAmountCents`) so the strip prints the server's answers, not the browser's.
- `manualLog` takes `ManualLogInput { projectId, minutes, activity, billable, startedAt?, phaseKey?, rateRole? }`, no longer early-returns on `!doc`, and **returns the written row** so callers report what the server stored. It throws rather than returning silently when no project is named.
- `logOffer(minutes, activity, billable)`.

### PostHog (HT-17, HT-27)

Three emitters that had no call site now have one:
- `time_timer_started` — the provider, after `start_timer` succeeds (`hold` and `resume`).
- `time_timer_stopped` — the provider's `closeOut`, carrying `adjusted`, `idle_minutes` and **`idle_ratio` = cumulative idle ÷ raw elapsed**. That is exactly the hole R64 has (the bound fires on the *longest single* gap). **The 30-minute number is untouched** — instrument only, per HT-17.
- `time_entry_logged` — now also from the ⌘K form (`surface: 'command_bar'`) and the phone (`surface: 'mobile_timer_sheet'`), always read off the row the server wrote, beside the ledger's existing call.

`time_export_taken` is still uncalled; it is W5's.

---

## 4 · Tests

| Path | New/extended | Count |
|---|---|---|
| `supabase/tests/billing/time_log_rpc_test.sql` | **new** | 5 cases: replay inserts once and returns the stored row · two starts leave one running row and the loser gets the stopped row back · `p_billable` NULL raises on **both** doors · HT-13 (a 400-day backdate is accepted; re-dating an **invoiced** hour raises) · `log_time` never opens a running slot |
| `src/components/document/__tests__/command-bar-log-time.test.tsx` | **new** | 7 |
| `src/components/document/__tests__/hours-ledger-add-row.test.tsx` | **new** | 6 |
| `src/components/document/log-time-shortcut.test.tsx` | **new** | 5 (incl. the `g t` collision) |
| `src/components/document/log-strip.test.tsx` | extended | 11 (7 new) |
| `src/components/document/__tests__/mobile-sheets.test.tsx` | extended | +4 (HT-14) |
| `src/hooks/document-time-provider.test.tsx` | extended | +6 (W3 block) |
| `src/hooks/__tests__/use-time-tracking-authority.test.tsx` | rewritten for the RPC shape | 5 |
| `e2e/document/hours.spec.ts` | extended | +2 browser cases |

**Two corrections to the plan's test table, both factual:**

- The plan says `apps/designer-portal/src/hooks/__tests__/document-time-provider.test.tsx` — *"create — no provider spec exists"*. **One does exist**, at the sibling path `src/hooks/document-time-provider.test.tsx` (the A3 queue-hardening + D-B54 thumb-edge suites). Creating a second file at the `__tests__` path would have split the provider's falsifiers across two mock worlds, so the existing spec was **extended** instead — the same correction the plan itself makes for `mobile-sheets.test.tsx`.
- The plan's log-strip row says `__tests__/log-strip.test.tsx` (new). The real file is `src/components/document/log-strip.test.tsx`, and there is also a real `mobile/mobile-timer-sheet.test.tsx` (the plan's `mobile-timer-sheet.test.tsx does not exist` note is about the `__tests__/` directory only). Both were extended in place.

---

## 5 · Gates, run verbatim

```
$ supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal
… Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}          ← CLEAN
```

```
$ scripts/run-sql-tests.sh -d <wt>/supabase/tests/billing -H 127.0.0.1 -p 54422
total: 9 · green: 9 · unexpected-fail: 0 · effective-green: 9/9
(time_log_rpc_test.sql PASS)
```

```
$ scripts/run-sql-tests.sh -d <wt>/supabase/tests/rls -H 127.0.0.1 -p 54422
total: 31 · green: 29 · expected-fail: 0 · unexpected-fail: 2
unexpected failures:
  - supabase/tests/rls/design_requests_test.sql   (FAIL 3b: expected no_scans, got <none>)
  - supabase/tests/rls/studio_titles_test.sql     (FAIL f: demoting the sole active owner
                                                   should raise last_owner_protected)
```

**Both are pre-existing and unrelated to W3, and neither is in `KNOWN_FAILURES.md`.** Evidence: neither file mentions `project_time_entries`, `log_time` or `start_timer` (grep count 0 in both); both were last touched by `ad74e34c8` / `ed980a595`, long before this program; W3's entire DB delta is two new functions plus four GRANT/REVOKE statements, and the regenerated seed diff is exactly those four. They are reported here separately rather than silently absorbed — **someone should decide whether they belong in `KNOWN_FAILURES.md` or want fixing**; they are not this wave's to fix.

```
$ pnpm --filter @patina/supabase type-check        → clean
$ pnpm --filter @patina/designer-portal type-check → clean
$ pnpm --filter @patina/designer-portal test
  Test Suites: 578 passed, 578 total
  Tests:       7347 passed, 7347 total          (base: 575 / 7310)
$ pnpm --filter @patina/designer-portal lint
  ✖ 202 problems (0 errors, 202 warnings)       ← all pre-existing; no touched file
                                                  contributes a warning
$ pnpm --filter @patina/admin-portal build       → green (the strictest gate,
                                                  mandatory after a packages/* edit)
$ pnpm --filter @patina/supabase test             → 102 files / 1255 passed, 12 skipped
$ pnpm db:generate && git diff packages/supabase/src/database.types.ts
  → 62 added lines, exactly log_time + start_timer; committed, so the tree is in sync
```

**Playwright, against the isolated stack:**

```
$ NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live pnpm --filter @patina/designer-portal \
    test:e2e -- e2e/document/hours.spec.ts --project=chromium --reporter=line
  14 skipped
  7 passed (1.7m)
```

**How the isolation was achieved, because the config fights it.** `playwright.config.ts`'s `webServer.env` **hard-codes** `NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321'` — the *peer program's* stack — and that block beats `.env.local` and the ambient environment. It only applies to a server **Playwright starts**, though. So the dev server was started by hand from the worktree (`pnpm dev`, which is `next dev --webpack -p 3000`; `--webpack` is required on Next 16.2) with the worktree's `.env.local` pointing at `:54421` and `NEXT_PUBLIC_FLAG_OVERRIDES` exported, and `reuseExistingServer` adopted it. That is patina-testing's Trap 3 run in reverse. The dev server was killed afterwards and port 3000 is free.

The two new browser cases deliberately **do not submit** an hour: the file's no-seed/no-write posture holds, and the write path is pinned by jest and by the SQL suite.

---

## 6 · Deliberate scope lines

- **`00609` is not written.** HT-13 needs no DDL; the plan reserves the number unused and it stays unused.
- **The ledger add row's `activity` default stays `'design'`.** The plan's HT-24 row names `log-strip.tsx:30` and `:36` specifically, and that is where the default was removed. The add row's select has always had no empty option; changing it is a one-line follow-up if the panel wants the surfaces symmetrical, and it is *named here* rather than done silently.
- **No flags** (P-5), no backfill (P-4), the invoiced lock untouched (§0.12), `notes` in no rollup (§0.10), no new dashboard/tab/badge/red-green/per-second motion.
- **W4's portal follow-commits and HT-35's disclosure band are not here** — stage-4 work, per the orchestrator's scope rulings.
- `apps/designer-portal/next-env.d.ts` carries an unstaged one-line change (`./.next/types/…` → `./.next/dev/types/…`) written by the dev server. It was **already modified before this stage started** and is a generated file; it is not in any of my commits.
- `apps/designer-portal/.env.local` (gitignored) already existed from the W1/W2 portal-fix stage pointing at `:54421`; it was reused, not rewritten, and is not committed.
- **Prettier drift is advisory.** The pre-commit hook warns on every touched file (the repo has no root `.prettierrc`, so root Prettier defaults disagree with the house style already in these files). No file was reformatted, so the diffs stay readable.

---

## 7 · Commits (five, on `hour-tracking/portal`)

```
8c63ff3d4  feat(time): log_time and start_timer, the two capture doors (00608)
d7d0ce16f  feat(time): the data layer sends billable, mints the id, and drops the toast
014d81ad4  feat(time): the hour with nothing in hand — a ⌘K verb, a form, a bare t
0dd74dde8  feat(time): billable, a date, and a phone that never saves nothing
959ead009  test(time): the ⌘K verb and the bare t, in a browser
```

Pushed: `4bfb70cb6..959ead009  hour-tracking/portal -> hour-tracking/portal`.

---

## 8 · Done-when, checked

| Plan §4 done-when | Status |
|---|---|
| A 45-minute call logged in 5 interactions from ⌘K with no document open; `SELECT` shows `source='command_bar'` | ⌘K → document · minutes · date · activity · Enter. The `source='command_bar'` write is asserted at the RPC-argument boundary (`command-bar-log-time.test.tsx`) and the value's admissibility in the DB is asserted by `time_log_rpc_test.sql` case (a), which stores and reads back `command_bar`. **Not** driven end-to-end in a browser: the e2e cases stop short of submitting, so the file keeps its no-write posture. |
| The same entry dated yesterday lands on **yesterday** (`started_at`) | ✅ `time_log_rpc_test.sql` case (d) (400 days back lands on the day named); `hours-ledger-add-row.test.tsx`; `command-bar-log-time.test.tsx` |
| An entry dated 31 days back renders the quiet "backdated" mark | ✅ `hours-ledger-add-row.test.tsx` (31 yes / 29 no, on the add row **and** on a written row) |
| The mobile sheet with nothing held either logs or says why — never both-neither | ✅ `__tests__/mobile-sheets.test.tsx`, four cases incl. the refusal |
| A log-strip entry carries an explicit `billable` and prints its reason | ✅ `log-strip.test.tsx` (the pill is seeded from the stored row; `rate pending` and a priced rate both render). The *reason sentence* (`non-billable · no agreement`) renders on the two surfaces that resolve it live — the ⌘K form and the add row; the strip prints the stored rate instead, because by then the server has already priced the hour. |
| Two browser tabs starting timers leave **one** running row and **one** offer strip | ✅ at the server (`time_log_rpc_test.sql` case (b) — one running row, the stopped row returned) and at the provider (`document-time-provider.test.tsx` — a row another tab opened becomes exactly one offer). Not driven with two real browser tabs. |
