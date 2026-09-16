# W1W2-portal — adversarial review, round 2

**clean = false** (0 blocker · 5 major · 18 minor · 10 note)

Reviewer: separate context from the implementer and from round 1.
Branch `hour-tracking/portal` @ `ff2065ed6` against `origin/hour-tracking/integration`
@ `a9841c8de`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.

Commits under review:

```
ff2065ed6 fix(time): the Hours sheet reads the document, not the holder's own week
2c83cb4d3 feat(time): W2 UI — four scopes in one sheet, and the studio's hours said plainly
29b72c644 feat(time): W1 portal — the studio rate card, and an hour that says what it is worth
```

Read in full: plan-v2 §0, §2 (W1 portal files), §3 (W2 portal files);
`W1W2-portal-impl.md`; `W1W2-portal-review-r1.md`; `W1W2-portal-fix-r1.md`;
the complete current text of all 23 touched files; and the shipped SQL the UI
leans on (`00598`, `00604`, `00606`, `00607`, `00615`) plus
`packages/supabase/src/hooks/use-studio-member-rates.ts` and
`use-time-tracking.ts` (lane A's, on the integration tip) and
`docs/design/house-sheet/SPEC.md` §A.

**Round-1 disposition, measured rather than taken on report.** All eight majors
(M1–M8) are genuinely addressed or explicitly descoped — I re-read each fix
against the current file rather than accepting `W1W2-portal-fix-r1.md`'s word.
Of round 1's twelve minors, **ten still stand unfixed** (n1, n2, n4, n5, n6, n8,
n9, n10, n11, n12 — each re-measured against the current file and re-listed below
marked `CARRIED`, so this report is self-contained); **n3 was fixed** by the M5
belt and returns in a new shape as R2-10; **n7 is re-graded a note** (t10) because
the plan does own those event names in later waves; **n12 was half-fixed** (the
non-empty case now errors). Eight new findings arise, two of them **introduced by
the round-1 fixes themselves** (R2-01, R2-06) and one by the M3/M5 belt (R2-08).

---

## 1 · Gates — run by this reviewer, verbatim

```
$ pnpm --dir .../agent-portal --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
EXIT=0                                                            PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
EXIT=0                                                            PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test -- \
    src/components/document/__tests__/hours-ledger-scope.test.tsx \
    src/lib/document/__tests__/authority-hours.test.ts \
    src/components/document/__tests__/desk-contents.test.tsx \
    src/components/document/account/__tests__/account-studio-page.test.tsx \
    src/components/document/account/__tests__/studio-rate-rows.test.tsx \
    src/components/document/people/__tests__/person-profile.test.tsx
Test Suites: 6 passed, 6 total
Tests:       60 passed, 60 total                                  PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test      (full sweep)
Test Suites: 1 failed, 574 passed, 575 total
Tests:       7269 passed, 7269 total
Snapshots:   1 passed, 1 total
EXIT=1
  ● FAIL src/components/document/commercial/trade/draw-schedule-editor.test.tsx
    "A jest worker process (pid=4285) was terminated by another process:
     signal=SIGSEGV" — Test suite failed to RUN (no assertion failed)
  → re-run alone: 12 passed, 12 total, EXIT=0.
  UNRELATED to this branch (the file is not in the diff); environment-level
  worker crash. Recorded as note t9, not scored against the wave.

$ pnpm --dir .../agent-portal --filter @patina/designer-portal lint
✖ 203 problems (0 errors, 203 warnings)
EXIT=0                                                            PASS (0 errors)
  — 2 of the 203 are NEW and in this diff: desk-contents.tsx:87 and :93
    "Unused eslint-disable directive (no problems were reported from
     '@typescript-eslint/no-explicit-any')"                       (finding n4, CARRIED)

$ pnpm --dir .../agent-portal --filter @patina/admin-portal build
✓ Compiled successfully in 18.7s
✓ Generating static pages using 13 workers (137/137)
EXIT=0                                                            PASS
```

The DB was **not** reset (this stage does not own it). No `supabase/tests/**`
were run. `pnpm --filter @patina/designer-portal test:e2e` was **not** run —
see R2-04.

### Commit hygiene — clean

`git diff --name-only origin/hour-tracking/integration..hour-tracking/portal`
→ **23 paths**, all of them plan-named: 19 under `apps/designer-portal`
(including `e2e/document/hours.spec.ts`), 2 under `packages/supabase/src/hooks`,
2 docs (`portal-vs-desk-feature-gap-matrix-v2.md`,
`founding-onboarding/copy-deck.md`). `git diff --name-only … -- supabase/` is
**empty**. `git ls-files -v | grep '^S'` → `S supabase/config.toml` (still
skip-worktree'd, never staged). No `.env.local`, no `artifacts/`, no stray
paths. Commit subjects: `feat(time):` ×2, `fix(time):` ×1 — Conventional
Commits, hook-safe.

### Mock-fallback check — cannot mask

`grep withMockData|mock-data` over the whole diff: **zero hits**. Every new read
is a bare `useQuery` / `@patina/supabase` hook that rethrows. So
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE` cannot substitute mock numbers for a
denied query here. **But the sheet's own zero-rendering defeats half of what
that check buys** — see R2-02: a denied rollup renders `0 min` as a total.

### Ruling spot-checks that PASSED (each verified, not assumed)

- **No flag (P-5).** `grep useFeatureFlag|ComingSoon|isFeatureEnabled` over the
  diff → zero hits.
- **R69 / no per-second motion.** `grep setInterval|requestAnimationFrame|animate-|transition-all`
  over added lines → zero hits.
- **No shadow, no hex literal.** `grep shadow` → zero; `grep -E '#[0-9a-fA-F]{3,6}'`
  over added `apps/designer-portal/src` lines → zero.
- **No dashboard / tab bar.** The lens is `scope-lens.tsx`'s two-word Scored-Ink
  idiom generalised to four (`role="group" aria-label="Hours scope"`,
  `aria-current`, `da-score-on`/`da-score-hover`, `min-h-11` at
  `hours-ledger.tsx:577`). No route, no page, no `/hours`, no tabs.
- **HT-40.** The billing-state chip is a 1px-bordered text pill, no fill; the new
  `ScopeEntryRow` copy replicates the existing pearl/sage pair exactly, which is
  what plan §3 asks for ("the chip stays as built").
- **HT-36, at the type level.** `studio_hours_rollup`'s RETURNS TABLE
  (`00607:59-69`) carries no `notes`; `TimeEntryLedgerRow`
  (`use-time-tracking.ts:711-741`) carries none. `ScopeEntryNote`
  (`hours-ledger.tsx:1292-1312`) is the only reader of `notes`, it reads the **table**,
  one entry at a time, behind an explicit act.
- **HT-10-a.** `00606` really does narrow `Team can view their project time
  entries` to `(user_id = auth.uid()) AND is_project_team_member(project_id)`
  (`00606:264-268`) — so the narrowing is real, and `MemberProjectTotal`
  (`useProjectHoursTotal` → the DEFINER `project_hours_total`) is what gives a
  plain member her document total back. Pinned by the spec's HT-10-a case.
- **HT-9.** The project scope's fact-view read passes `userId: null`
  (`hours-ledger.tsx:711-712` → `use-time-tracking.ts:1169-1172`) — the `.eq('user_id', …)` AND is gone from it. Pinned.
- **HT-8 — the lens is unreachable for a plain member.** `viewerIsOwnerOrAdmin &&`
  gates the lens (`:560`); `ScopeRollup` needs `viewerIsOwnerOrAdmin && viewerStudio`
  (`:660`); the person-profile door now carries the same gate
  (`person-profile.tsx:836-842`); and a non-admin is forced back to `'mine'` by the
  `:460-466` effect. Pinned by three spec cases (member → no lens; member → own
  rows + edit + delete; owner → both scoped words).
- **HT-3 — the rate card writes `created_by` = the caller and refuses non-admins.**
  `useSetStudioMemberRate` stamps `created_by: userId` from `auth.getUser()`
  (`use-studio-member-rates.ts:108-109`), which is what
  `studio_member_rates_admin_insert`'s `WITH CHECK (… AND created_by = auth.uid())`
  requires; the section is gated on the page's own
  `canManage = myRole === 'owner' || myRole === 'admin'`
  (`account-studio-page.tsx:299`, used at `:1597`).
- **HT-3-e(2).** `selfAuthoredInert={m.user_id === user?.id && myRole !== 'owner'}`
  (`account-studio-page.tsx:1637-1639`) — the owner keeps her own field (her
  self-authored row does price), an admin's own field is replaced by the sentence
  that says why. The copy branches on the row's actual `created_by`, and treats
  `created_by IS NULL` as a deleted author (which 00615 still prices) rather than
  as self-authorship. Correct against `00615`.
- **HT-26 — never a blank where a rate is pending.** `timeRateProvenance` is
  total: four arms, each carrying a `label`, `null` unreachable
  (`authority-hours.ts:128-151`). Both row renderers print `provenance.label`
  unconditionally (`:1245-1249`, `:1403-1407`). Pinned by four cases in
  `authority-hours.test.ts`.
- **The "rate pending" doorway is admin-only.** `ratePending && viewerIsOwnerOrAdmin`
  (`hours-ledger.tsx:1514`); `PendingTimeAuthorizationBand`'s new
  `Studio rates →` door is gated on `showStudioRateDoor={viewerIsOwnerOrAdmin}`
  (`:618`); `PricingStudioLine`'s stamp is
  `!pricingStudioId && viewerIsOwnerOrAdmin && viewerStudioId` (`:925`).
- **Emitter names match the plan exactly.** `document-events.ts` defines
  `time_entry_logged`, `time_timer_started`, `time_timer_stopped`,
  `time_entry_adjusted`, `time_entry_deleted`, `time_scope_viewed`,
  `time_rate_unresolved`, `time_export_taken` — each spelled as plan-v2 spells it
  (§2:267-268 · §3:417 · §4:550 · §6:725), with `time_entry_logged`'s eight props
  identical to §2's list. `time_autostart_disclosed` / `_opted_out` are recorded
  in the doc comment as owed and deliberately not defined (see R2-03).
- **Data access.** `grep -E '^\+.*\bfetch\('` over the diff → zero. No ad-hoc
  `fetch` to orders/media/projects anywhere; no new `@patina/api-routes` need.
- **Keyboard / focus.** Every new act is a real `<button>` or `<a>`; no
  `div onClick` in the diff. `DocumentAction`'s base class carries
  `min-h-[44px] min-w-[44px]`, so "The entries", "Note", the stamp door and the
  delete confirm all meet the target. (Two exceptions: n10, n11.)
- **HT-41.** The role segment is absent from both row renderers, and pinned
  absent by a spec case. Plan §4 (W3) owns the multi-role chip; plan §2's W1
  portal row does not ask for it. Correct scoping — `timeRateRoleLabel` survives
  for W3 (note t6).
- **`desk-doorway.tsx`'s alias works end to end.** `'sheet'` is in `DOORWAY_KEYS`
  (`:88`) **and** read at `:136-137` (`params.get('book') ?? params.get('sheet')`),
  and the strip-down loop keeps only `KEPT_KEYS`, so `/desk?sheet=hours` opens
  Hours and the address returns to `/desk`. I grepped for any other consumer of a
  `sheet` URL param in `apps/designer-portal/src` — there is none, so the alias
  collides with nothing.

---

## 2 · Findings

### MAJOR

**R2-01 — a successful pricing-studio stamp does not refresh the fact the
round-1 fix introduced, so the line keeps saying "no studio yet" and its door
keeps offering an act the server now refuses. NEW — introduced by the M1/M4 fix.**
*Severity: major. Confidence: high (key sets read directly).*
`apps/designer-portal/src/components/document/hours-ledger.tsx:423-442` (the new
`['document-hours-project-studio', lensProjectId]` query) against
`packages/supabase/src/hooks/use-time-tracking.ts:903-911`
(`useStampProjectPricingStudio`'s `onSuccess`).

The stamp invalidates `invalidateProjectTime(queryClient, projectId)` —
i.e. `['projects', id, …]` and `timeKeys.all = ['time']` — plus `['projects']`
and `['document-hours-week']`. It does **not** invalidate
`['document-hours-project-studio', projectId]`, which is the *only* reader of
`projects.studio_id` that the project scope now trusts. Consequence, in the
project scope, after the owner takes the repair and the server accepts it:

- `PricingStudioLine` still prints *"no studio yet — hours here read 'rate
  pending'"* and still renders **Name your studio**; clicking it again is
  refused by `00606` with *"this project already names a studio"*.
- `ScopeRollup` stays suppressed behind
  *"No studio prices this document yet, so its hours do not add up to a studio's
  week"* — so the act that was supposed to give the document a studio total
  visibly fails to.

This is a regression of the round-1 fix: before it, the same fact came off
`entries`, which `['document-hours-week']` does invalidate. (`EntryRow`'s own
stamp door is unaffected — it reads `e.project?.studio_id` off the week read.)
*Exact fix:* add
`queryClient.invalidateQueries({ queryKey: ['document-hours-project-studio', projectId] })`
(and, for the band, `['document-hours-pending-authorization']`) to
`useStampProjectPricingStudio`'s `onSuccess` in
`packages/supabase/src/hooks/use-time-tracking.ts:903-911`; pin it with a case in
`hours-ledger-scope.test.tsx` that resolves the stamp and asserts the
`priced by` line flips.

**R2-02 — the three money readouts print a confident zero, and a confident
"nothing logged", while the read is still in flight; the rollup prints a zero
total after the read FAILS. NEW.**
*Severity: major. Confidence: high (no loading branch exists — measured).*
`hours-ledger.tsx:995` + `:1009-1013` + `:1047-1060` (`ScopeRollup`), `:1191-1196`
(`ScopeEntries`), `:1112-1144` (`MemberProjectTotal`).
`grep isLoading|isFetching` over `hours-ledger.tsx` returns hits only inside
`ScopeEntryNote`. None of the three aggregate components has a pending branch,
and none of the three hooks supplies `placeholderData`:

- `ScopeRollup`: `rows = rollup.data ?? []` → `totalMinutes = 0` →
  `fmtMinutes(0)` = **"0 min"** rendered unconditionally in the grand-total `<p>`,
  *and then* either `"Nothing logged in this window."` (loading) or the terracotta
  `role="alert"` (error). So a denied / failed / still-loading studio rollup reads
  **"the studio · this week — 0 min"**, which is a false fact about money above an
  error line. §0.24's whole point is that a silently-denied lens must not render
  plausible numbers; the mock fallback is correctly absent (§1), and then the
  component re-creates the hazard by hand.
- `ScopeEntries`: `rows.length === 0` → `"No entries in this window."` on first
  paint, before any request resolves.
- `MemberProjectTotal`: `fmtMinutes(data?.minutes ?? 0)` → **"0 min"** under
  *"this document · all time"* while loading. `useProjectHoursTotal`'s own doc
  comment (`use-time-tracking.ts:842-849`) says *"the project lens must surface
  that rather than rendering a zero"* — the error arm does; the loading arm does
  not.

*Exact fix:* in each of the three, branch on the query's pending state before the
figure — render an em-dash or a "reading…" line in place of the total and
suppress the zero sentence (`if (rollup.isPending) return <…reading…/>`), and in
`ScopeRollup` move the grand total inside the non-error branch so a failed read
shows no total at all.

**R2-03 — HT-35 is absent in both halves, and the two emitters it owes are
undefined. CARRIED from M8(a)/(b); explicitly descoped with a ruling request.**
*Severity: major (a ruled input of W2 with its own Done-when). Confidence: high
(absence measured against `git diff --name-only`).*
Not in the diff: `apps/designer-portal/src/hooks/document-time-provider.tsx`
(the one-time auto-start disclosure band, R83 inline band) and
`apps/designer-portal/src/components/document/account/account-profile-page.tsx`
(the per-member opt-out, default on, falling back to one-tap manual start).
`document-events.ts:177-179` records `time_autostart_disclosed` /
`time_autostart_opted_out` as owed and defines neither.
Plan §3's Done-when *"the disclosure band appears once for a fresh member and
never again; the opt-out leaves a one-tap manual start"* is therefore
unverifiable. `W1W2-portal-fix-r1.md` descopes it on two measured grounds that
this reviewer confirms: there is **no column** for a per-member cross-device
timer preference (`user_settings` has none; `profiles` has none; the only
no-migration candidate is `profiles.help_state`, which is the help-system's
cache), and plan §3 reserves **no migration number** for HT-35 while this
program's range is spent. **Owed: a ruling on where the opt-out lives, plus one
migration number.** Until then this is openly descoped, not done.

**R2-04 — plan §3's e2e spec exists and has never been executed; the plan names
it as a gate. CARRIED from M8(e), now written but unrun.**
*Severity: major. Confidence: high.*
`apps/designer-portal/e2e/document/hours.spec.ts` (106 lines, chromium-only,
serial, seeds nothing, starts/closes no timer — correct against the
`00177:37-41` per-user running-timer index). Plan §3's gate block names
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live pnpm … test:e2e -- e2e/document/hours.spec.ts`.
It was not run by the implementer (port 3000 held by the peer people-room
program's dev server; the shared Postgres was being replayed mid-session) and not
by this reviewer (same port, and `playwright.config.ts` hardcodes
`baseURL: http://localhost:3000` with `reuseExistingServer: !CI`, so a run now
would sign in to the peer program's portal against the peer program's database).
**No 1440 / 1024 / 390 evidence for the lens exists from anyone** — the
implementer's own report says the Chrome extension was not connected either. The
spec's assertions are plausible against the code I read (the lens carries
`min-h-11`; the doorway strips its query) but that is reading, not running.
*Exact fix:* run it once on a free port against this program's isolated stack
(`baseURL` override or a `PORT`-parameterised `webServer`), and treat its first
execution as a gate of this wave, not of the next.

**R2-05 — the onboarding article and its Sanity push are absent; the Done-when
that rests on them cannot be met from this branch. CARRIED from M8(d), blocked.**
*Severity: major (a plan §3 item missing). Confidence: high.*
`artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15`
(the two studio-scope sentences the sheet now makes true) plus the Sanity push.
`git ls-files --error-unmatch` on that path fails — the file is **untracked**,
present only in the main checkout's working tree, so it does not exist in this
worktree and cannot land as a commit on this branch. Copying it in would import
another program's untracked artifact tree (the exact landmine the git-hygiene
rule names). The Sanity push is an external mutation with no session
authorization. Plan §3's Done-when *"the Sanity help article matches what the
sheet does"* is consequently unverified.
*Exact fix (orchestrator):* track that file (or name its real home), then the two
sentences plus the push are a five-minute stage; authorize the Sanity write
separately.

### MINOR

**n1 — `MemberProjectTotal` reports any read failure as "you are not on it".
CARRIED, unfixed.**
*Confidence: high.* `hours-ledger.tsx:1112-1122`. `total.isError` is treated as
the single cause, so a network failure, a 500, a missing RPC or a schema-cache
miss all print *"This document's total is for its team — you are not on it."* and
tell a rostered member something false about her standing.
*Fix:* branch on the error — the DEFINER function raises `insufficient_privilege`
(`42501`); anything else prints a neutral "this document's total could not be
read".

**n2 — the `— internal —` group re-prints buckets the main list already shows.
CARRIED, unfixed.**
*Confidence: high (00607's own comment is the evidence).*
`hours-ledger.tsx:1081-1102` renders a second list from
`rows.filter(r => r.internal_minutes > 0)`. `00607:151-155` states outright:
*"billable_minutes/billable_cents and internal_minutes can count the SAME row …
A bucket may therefore read total 60 / billable 60 / internal 60."* A member with
internal work appears in both lists with overlapping minutes, and a reader
summing them double-counts. (The lane correctly did not derive the group by
subtraction — the SQL warns against it — but also did not make the presentation
non-overlapping.)
*Fix:* render the internal group only for buckets that are **entirely** internal
(`total_minutes === internal_minutes`) and drop those from the main list; or print
the internal figure as a parenthetical on the bucket's own row.

**n4 — two new unused `eslint-disable` directives. CARRIED, unfixed (measured in
this reviewer's lint run).**
*Confidence: high.* `apps/designer-portal/src/components/document/desk-contents.tsx:87`
and `:93`. Lint is 201 → 203 warnings and these are exactly the two new ones.
*Fix:* delete both comment lines (the casts they guard no longer trip the rule).

**n5 — `time_rate_unresolved` always sends `project_kind: null`. CARRIED, unfixed.**
*Confidence: high.* `hours-ledger.tsx:1349-1358` (`project_kind: null` at `:1356`). Plan §2:268 names the alarm's
props as `project_kind`, `rate_source='none'`, `project_id`; `project_kind` is the
one segmentation asked for and it is hard-coded `null` at the only call site, so
every event is indistinguishable.
*Fix:* add `kind` to the week read's embed
(`project:projects(name, studio_id, kind)`) and pass it, or drop the prop and
record why in the doc comment.

**n6 — the rate alarm never fires from the scoped rows, i.e. exactly where an
admin would notice unpriced hours. CARRIED, unfixed.**
*Confidence: high (`grep documentEvents.time.` → 5 call sites, all in the `mine`
path).* `rateUnresolved` is emitted only from `EntryRow`
(`hours-ledger.tsx:1349-1358`), which renders under `scope === 'mine'` only.
`ScopeEntryRow` computes `provenance.kind === 'pending'` and prints
"rate pending" without emitting. Plan §2: *"fired wherever a row renders or
returns with `rate_source='none'`"*.
*Fix:* emit from `ScopeEntryRow` too — the emitter already dedups per entry per
session, so the count cannot inflate.

**n8 — `hoursMemberScopePending` can go stale and silently mis-scope a later
open. CARRIED, unfixed.**
*Confidence: medium.* `apps/designer-portal/src/lib/document/open-hours-scope.ts:18-29`
sets a module value; only `HoursLedger`'s mount effect clears it
(`hours-ledger.tsx:146-150`). `studio-drawer.tsx:225-235` keys the sheet on
`setOpenLedger(key)`, so dispatching `document:open-ledger` for a sheet that is
**already** mounted does not remount `HoursLedger` (and `initialContext` is only
a `useState` initialiser) — the click does nothing visible *and* the value
survives, so the next mount silently opens on that stale person. Same outcome if
the event is dispatched on a surface where `StudioDrawer` is not listening.
*Fix:* clear `hoursMemberScopePending` inside `openHoursForMember` on a
microtask, or carry the person in the event's `detail.context` and let the drawer
pass it through `sheetContext` the way every other pre-addressed sheet does.

**n9 — house-sheet §A drift in new markup. CARRIED, unfixed (re-measured: 5 new
`truncate`, 33 new inline type sizes).**
*Confidence: high.* `docs/design/house-sheet/SPEC.md` §A4 — *"Truncation: none.
`text-overflow: ellipsis` must not appear. Wrap."* — against new `truncate` at
`hours-ledger.tsx:1067`, `:1092`, `:1237`, `:1240` and
`account-studio-page.tsx:1620`. §A3 — seven named steps, *"No inline
`font-size`"*, and `.t-money` (DM Mono 15px, tabular-nums) for *"every ledger
figure"* — against new `text-[11px]` ×21, `text-[12px]` ×5, `text-[12.5px]` ×3,
`text-[13px]` ×2, `text-[15px]` ×2, with the two grand totals
(`ScopeRollup:1010`, `MemberProjectTotal:1129`) rendered as money in the **body**
family at `text-[15px]` and the bucket money in `font-mono text-[11px]`. All of it
matches the file's pre-existing idiom, so this is conversion debt rather than a
new invention — but it is new markup on the surface this program is rewriting,
and the money steps are the ones §F-B amended the sheet for.
*Fix:* at minimum drop `truncate` for wrapping on the five new lines (the
two-line member/document block has room) and put the two grand totals on
`.t-money`.

**n10 — the group-by picker misses the 44px target the lens idiom carries.
CARRIED, unfixed.**
*Confidence: high.* `hours-ledger.tsx:1030-1044` — five 11px uppercase words with
no `min-h-11`, unlike the lens at `:577` and its model
`people/directory/scope-lens.tsx:51`; house sheet §A5's `.act` box is
`min-height: 44px`. On a sheet the plan explicitly wants walked at 390px. (Note
the e2e spec's 44px loop covers the **lens** buttons only, so even a green e2e
would not catch this.)
*Fix:* add `min-h-11` to the group-by buttons.

**n11 — the two disclosure acts announce no state. CARRIED, unfixed.**
*Confidence: high.* `grep aria-expanded hours-ledger.tsx` → **no hits**.
"The entries" (`:699-707`) and the per-row "Note" (`:1274-1282`) toggle content
with no `aria-expanded` / `aria-controls`; a screen-reader user hears the label
flip but is not told a region opened. `DocumentAction` forwards arbitrary
`ButtonHTMLAttributes`, so this is a one-word change each.
*Fix:* `aria-expanded={showEntries}` and `aria-expanded={showNote}` on the two
`DocumentAction`s.

**n12 — an emptied rate field is discarded in silence and left visibly empty.
CARRIED, unfixed.**
*Confidence: high.* `studio-rate-rows.tsx:76-83`: `rateInputToCents('')` returns
`null`, and `save` then returns with **no error and no write** — correct against
the 00598 CHECK and the absent DELETE policy (the old rate stands) — but the
uncontrolled `defaultValue` input is left blank while the rate is still in force,
until something remounts it. (Round 1's other half *was* fixed: a non-empty
unparseable or ≤ 0 value now errors.)
*Fix:* restore `open`'s value into the input on an empty blur, or say in the help
line that clearing a field leaves the last dated rate standing.

**R2-06 — a failed read of the document's pricing studio renders nothing and
says nothing. NEW (introduced by the M1 fix).**
*Confidence: high.* `hours-ledger.tsx:438-442`. `lensPricingStudioId` is
`undefined` unless `lensPricingStudio.isSuccess`, and `isError` has no arm. So if
the `projects.studio_id` read is denied or fails, the project scope renders **no**
`PricingStudioLine`, **no** `ScopeRollup` (the `lensPricingStudioId` truthiness
branch), and **no** "no studio prices this document" sentence — the owner sees
the entries act alone, with no indication anything failed. The tri-state is right;
the fourth state is unhandled.
*Fix:* add an error arm that prints a neutral "which studio prices this document
could not be read" in place of the line, and keep the rollup suppressed.

**R2-07 — the viewer's seat is guessed from the first `design_studio` org (else
`orgs[0]`), and the lens gate and two of the three rollup keys ride on that
guess. NEW.**
*Confidence: medium-high.* `hours-ledger.tsx:180-187` and, duplicated,
`person-profile.tsx:808-817`.
`viewerStudio = orgs?.find(o => o.type === 'design_studio') ?? orgs?.[0] ?? null`.
Two measurable consequences: (a) a member who is a plain `member` of the first
`design_studio` in the list but `owner`/`admin` of a second loses the lens
entirely and is forced to `'mine'`; (b) where she *is* admin of the first studio
but the work she is reading is priced by the second, the **member** and **studio**
scopes pass `viewerStudio.id` to `studio_hours_rollup`, which hard-filters
`ledger.studio_id = p_studio_id` (`00607:93`) and returns zero — the same class of
bug M4 fixed for the project scope only. The `orgs[0]` fallback is worse: a viewer
with no `design_studio` at all but ownership of some other org type is treated as
an Hours admin and keyed on a studio that prices nothing.
*Fix:* derive the seat from the studio being read where there is one (the
project's pricing studio; the member's studio), and where there is not, require a
`design_studio` membership explicitly
(`orgs?.find(o => o.type === 'design_studio' && (o.membership?.role === 'owner' || … 'admin'))`)
rather than falling through to `orgs[0]`. Extract it once — the duplicated copy in
`person-profile.tsx` will drift.

**R2-08 — the forced-scope belt leaks a spurious `time_scope_viewed{scope:'project'}`
for every plain member who arrives with a document in hand, and does nothing at
all if `useOrganizations` errors. NEW (introduced by the M3/M5 fix).**
*Confidence: high for the telemetry leg, medium for the error leg.*
`hours-ledger.tsx:459-466` (the belt) and `:467-474` (the emitter).
`scope` still initialises to `'project'` when `initialContext.projectId` is
present, and the belt is an effect that only fires once `orgs` resolves. So for a
plain member: first paint emits `time_scope_viewed {scope:'project', group_by:'member'}`,
the belt flips her to `'mine'`, and a second event fires. The HT-27 instrument
therefore records project-scope reads by members who never saw one. Worse, if
`useOrganizations` **errors**, `orgs` stays `undefined`, the belt never runs, and
she is left in `'project'` scope with no lens, no rollup, no front matter and no
rows — M3/M5's dead end, restored under a failed read. (A brief flash of the
"The entries" act, which is gated only on `scope !== 'mine'`, is the visible
symptom in the happy path.)
*Fix:* make the landing scope a function of the resolved role rather than a state
initialiser corrected later — hold `scope` as `null` until `orgs` settles and
derive the landing once (treating an errored `useOrganizations` as "no lens",
i.e. `'mine'`); and move the `scopeViewed` emit behind that settle so one open
emits one event.

**R2-09 — a failed rate save leaves the typed, unsaved number standing in the
field beside its error. NEW.**
*Confidence: high.* `studio-rate-rows.tsx:126-143`. The input is uncontrolled
(`defaultValue`), so after `setRate.mutate`'s `onError` fires the field still
shows what the owner typed while the dated history beneath it shows the rate
actually in force. The two disagree with no explanation of which one is real.
*Fix:* on error, reset the input's value to `open ? dollars(open.hourly_rate_cents) : ''`
(a ref, or make the field controlled).

**R2-10 — "this document · all time" stands above "mine · this week", so the
total never has the rows that produced it beneath it. NEW (shape of n3 after the
M5 fix).**
*Confidence: medium.* `hours-ledger.tsx:649-651` renders `MemberProjectTotal` for
any viewer with `lensProjectId` and no lens; her rows below are the week's own
`EntryRow` list, scoped to her (`:165`, `.eq('user_id', me)`). The figure is the
document's all-time team total; the rows are her own seven days. §0.23 / HT-30
(*"a total with no rows beneath it is a dashboard and is refused"*) is satisfied
in letter — there are rows — and not in substance: those rows cannot add up to
that total, and where she logged nothing this week the total stands above
"Nothing logged this week."
*Fix:* caption the figure with what it is and what the rows are
(e.g. *"this document · all time, for its whole team — below, your own week"*),
or put the figure immediately above her own rows with a one-line bridge. A copy
change, not structure — but it needs to be deliberate.

**R2-11 — the studio member rate is dated in UTC, so an evening save in a US
timezone is stamped tomorrow. NEW (lane A's file, this lane's surface).**
*Confidence: high (code-read).*
`packages/supabase/src/hooks/use-studio-member-rates.ts:52`
(`todayISODate = () => new Date().toISOString().slice(0,10)`), consumed by the
rate card this lane ships. After ~17:00 PT the stamp is tomorrow's date, so
`00598`'s BEFORE INSERT trigger closes the prior row at `NEW.effective_from - 1`
= today, and tonight's hours resolve against the **old** rate (or `'none'` where
there was no prior row) while the card's history prints a row dated tomorrow.
`StudioRateRows`'s own `fmtDate` parses at local midnight, so the two disagree.
Not in this diff — stated because it is this lane's visible surface and nobody
else is reading that file now.
*Fix:* build the date from local parts (the ledger already has `isoDate()` in
`hours-ledger.tsx:90-94`) or let the server default it.

**R2-12 — "a timer is still running from yesterday" says yesterday for any
earlier day. NEW.**
*Confidence: high.* `desk-contents.tsx:104-123`: the branch is
`timer && !startedToday`, so a timer opened three days ago reads "from
yesterday". On the Desk's one act-bearing line, that is a small lie about the
studio's own clock.
*Fix:* render the day (`fmtDay(timer.started_at)`) or say "from an earlier day".

**R2-13 — the Studio rates section's own gate is unpinned, and an unresolved
`useAuth()` briefly offers the acting admin the inert field. NEW.**
*Confidence: medium.* `account-studio-page.tsx:1597` (`canManage &&`) and
`:1636-1639` (`m.user_id === user?.id && myRole !== 'owner'`).
`account-studio-page.test.tsx`'s diff is three stub lines only — nothing asserts
the section is absent for a plain `member` or present for `owner`/`admin`, and
`studio-rate-rows.test.tsx` tests the component in isolation with
`selfAuthoredInert` passed by hand. Separately, while `useAuth()`'s `user` is
undefined, `m.user_id === undefined` is false for every row, so the acting
admin's own row shows the field until it resolves.
*Fix:* add two page-level cases (member → no "Studio rates" heading; admin →
heading present and her own row shows the sentence, not the field), and gate the
section's render on `user` being resolved.

### NOTE

**t1 — ruling owed: HT-29's "act-bearing or absent" shipped as "the row always,
the act sometimes". CARRIED.** `desk-contents.tsx:351` hangs `HoursInHandAct`
beneath an Hours doorway row that still renders unconditionally. Plan §3 reads
*"the `hours: 'time in hand'` card stays **act-bearing or absent**"*. Removing
the row would make the Hours sheet unreachable from the Contents index, so the
gap is Kody's question, not a code choice. The impl report's judgment call #1
covers the *figure* half correctly (R95 forbids a count there) and not the
*absent* half.

**t2 — HT-11 is unsatisfied in two files this lane edited; plan §4 assigns it to
W3. CARRIED.** The ledger's batch-add row (`hours-ledger.tsx:833-882`) is a
capture surface with no `billable` control, and `useCreateTimeEntry` still writes
`billable: input.billable ?? true`
(`packages/supabase/src/hooks/use-time-tracking.ts:376`). HT-11 ruled "yes to
both" on the explicit control and the deletion of the default; plan-v2:467 lists
HT-11 among **W3's** ruled inputs and :529 makes `p_billable = NULL` raise once
every surface carries the control. An ownership note, not a defect of this lane.

**t3 — new raw-PostgREST reads inside components. CARRIED.** `ScopeEntryNote`
(`hours-ledger.tsx:1292-1312`) and `HoursInHandAct`
(`desk-contents.tsx:80-100`) each build a browser client and query a table
directly rather than through a `@patina/supabase` hook. `hours-ledger.tsx`
already carried five such reads, so it is the file's idiom — but
`desk-contents.tsx` had **none** before this commit and now owns one plus a
`QueryClientProvider` requirement its suite had to grow. (The Desk page sits
under the `(document)` group, which provides the client, so production is fine.)
*Optional fix:* `useTimeEntryNote(entryId)` and `useStudioUnbilledTime()` in
`packages/supabase`.

**t4 — `useTimeEntryLedger` has no `enabled` guard. CARRIED.**
`use-time-tracking.ts:759-782` (lane A's, pre-existing on the integration tip):
mounted with every filter null it selects the whole fact view. In this sheet it
is only mounted behind an act and, after the M2 fix, always with at least one
filter — latent, not live. Worth
`enabled: Boolean(studioId || userId || projectId)` before another caller finds
it. The studio scope's `studioId={scope === 'studio' ? (viewerStudio?.id ?? null) : null}` (`:711`) is the one path that
could pass all-null today (a viewer with no org).

**t5 — the new spec still leaves three of the wave's claims unpinned. CARRIED,
partly narrowed.** `hours-ledger-scope.test.tsx` now runs 12 cases and covers
`owner` and `member`; **`admin` is still untested**, though plan §3's assertion is
*"absent for a plain `member`, present for `owner`/`admin`"*. Nothing pins (a)
"rate pending" actually rendering **in the sheet** rather than only in
`timeRateProvenance`'s unit spec, (b) the rate-pending doorway's owner/admin gate,
or (c) the stamp door's absence for a non-admin. The HT-30 case still leans on
`text.indexOf('3h 00m')` matching the grand total first, and the bucket row
carries the same string — it passes on ordering as much as on structure.

**t6 — `timeRateRoleLabel` is now a dead export in production code.**
`grep timeRateRoleLabel apps/designer-portal/src` → the definition
(`authority-hours.ts:101`) and the test, nothing else. Deliberate (W3 needs it,
per the M7 fix), and harmless — recorded so nobody "cleans it up" before W3
lands.

**t7 — deviation, ratification owed: the copy deck documents the alias instead of
being rewritten.** Plan §3 says rewrite `?sheet=hours` → `?book=hours` at
`docs/marketing/founding-onboarding/copy-deck.md:357,379,627`. The lane instead
added a Conventions bullet naming both spellings, on the measured grounds that
`?sheet=` is baked into the shipped email template
(`packages/email/src/templates/onboarding-hours.tsx:37` — I confirmed this line),
three seeded template migrations, the drip config and an SQL fixture, and that
mail already sent carries `?sheet=`. The Done-when ("the copy deck no longer
disagrees with the code") is satisfied by the code now accepting both. This
reviewer finds the reasoning sound and the evidence real; it is still a deviation
from a plan line and wants the orchestrator's word.

**t8 — architect choice already flagged by the plan, re-confirmed: the rate card
lives on `account-studio-page.tsx` (`/desk?account=studio`), not `/preferences`
and not the People Room.** Plan §2 makes this choice explicitly against HT-3's
parenthetical and asks that it be flagged in the report. It is implemented as
planned; noting it so the ruling's author sees it land where it landed.

**t9 — the full jest sweep is not reproducibly green in this worktree for an
unrelated reason.** `src/components/document/commercial/trade/draw-schedule-editor.test.tsx`
failed to **run** with `SIGSEGV` on a worker (pid 4285) in this reviewer's full
sweep, and passes 12/12 when run alone. It is not in the diff. Treated as
environment noise; the wave's own six suites are 60/60 green.

**t10 — `timerStarted` / `timerStopped` / `exportTaken` are defined with no call
site. CARRIED from n7, re-graded.** `grep documentEvents.time.` → five call
sites (`hours-ledger.tsx:352`, `:381`, `:468`, `:1353`, `:1381`), none of them
these three. Round 1 graded this minor; it is a note, because plan-v2 **does**
own all three names in later waves of this same program — `time_timer_started` /
`time_timer_stopped` at §4:550 (W3) and `time_export_taken` at §6:725 (W5) — and
this lane is the file's sole writer for the phase, so landing the vocabulary
early is the cheaper ordering. Worth saying plainly: the `Export week → Accounts`
button in this very file is **not** that event's call site — it opens the
composer, it does not hand hours out as a file — so W5 must add its own.

---

## 3 · What this review did NOT verify

- **No `supabase db reset`, no SQL test run.** This stage does not own the DB.
  Lane A's coverage of `00598`–`00607` / `00615` / `00620` is taken as given; the
  SQL (`00606`'s three policies, `00607`'s body and grants, `00615`'s HT-3-e(2)
  clause) was **read** to ground the UI claims, not executed. No `psql` probe was
  made, so no row-level claim in this report rests on a SELECT.
- **No e2e, no browser walk, no live-mode render.** Port 3000 is held by the peer
  people-room program (the implementer measured it twice), `playwright.config.ts`
  hardcodes that port, and the Chrome extension was not connected. The lens has
  **not** been seen at 1440 / 1024 / 390 by anyone (R2-04). The only runtime
  evidence for this wave remains the implementer's own SELECT walk in
  `W1W2-portal-impl.md` §3, which this reviewer did not re-run.
- **`packages/supabase` lint and vitest not run** (not in this lane's gate list;
  and per `patina-verification` no resolvable ESLint flat config exists outside
  designer-portal, so its lint result would mean nothing).
- **client-portal / manufacturer-portal type gates not run.** Nothing in the diff
  touches them; `@patina/supabase` type-check and the admin build (the repo's
  strictest gate) both pass. Round 1's note stands that `client-portal`'s
  type-check is red in this worktree for an unrelated dist-resolution reason
  (`@patina/aesthete-quiz` has no `dist/`).
- **The 201 pre-existing lint warnings were not audited** — only the two-warning
  delta was attributed (n4).
- **Prod untouched.** No `db push`, no deploy, no Strata read, no Sanity write.
- **PostHog not consulted** — event *names* were checked against plan-v2 text and
  the module source; no dashboard or ingest was verified.
