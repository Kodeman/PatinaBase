# W1W2-portal — fix log, round 3

Branch `hour-tracking/portal`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.
One commit: **`0b7a43c62` · `fix(time): the rows under a total are the rows that made it, and the studio says its name`** (16 files, +816/−132).
Against `origin/hour-tracking/integration`. No migration, so no grants seed and no
`database.types.ts` regeneration is owed. The DB was **not** reset (this stage does not own it).

`clean` target: every blocker/major in `W1W2-portal-review-r3.md` **except M-01**, which the
orchestrator scoped to stage 4; plus the carried minors the brief named; plus five more the
brief did not name, closed in the same pass because they were cheap and the wave wants to go
clean. Nothing is skipped without a reason stated below.

---

## 1 · Gates — run after the fixes, verbatim

```
$ pnpm --dir <wt> --filter @patina/supabase type-check
> tsc --noEmit                                                       (no output)   PASS

$ pnpm --dir <wt> --filter @patina/designer-portal type-check
> tsc --noEmit                                                       (no output)   PASS

$ pnpm --dir <wt> --filter @patina/designer-portal test -- \
    src/components/document/__tests__/hours-ledger-scope.test.tsx
Tests: 24 passed, 24 total                                                         PASS
  — 17 before this round, 24 after: five new cases (R2-08 ×3, n6, n8) and two
    rewritten (n2's disjoint lists, R2-10's caption).

$ pnpm --dir <wt> --filter @patina/designer-portal test -- \
    src/components/document/__tests__/desk-contents.test.tsx \
    src/components/document/account/__tests__/studio-rate-rows.test.tsx \
    src/components/document/account/__tests__/account-studio-page.test.tsx \
    src/components/document/people/__tests__/person-profile.test.tsx \
    src/lib/document/__tests__/authority-hours.test.ts
Test Suites: 5 passed, 5 total   Tests: 52 passed, 52 total                        PASS

$ pnpm --dir <wt> --filter @patina/supabase test -- \
    src/hooks/__tests__/use-time-tracking.test.ts \
    src/hooks/__tests__/use-studio-member-rates.test.ts
 ✓ use-time-tracking.test.ts       (3 tests)
 ✓ use-studio-member-rates.test.ts (8 tests)      Tests 11 passed (11)             PASS
  — 7 → 8: R2-11's local-date stamp is now pinned under fake timers.

$ pnpm --dir <wt> --filter @patina/designer-portal test            (full sweep)
Test Suites: 575 passed, 575 total
Tests:       7297 passed, 7297 total   Snapshots: 1 passed                         PASS
  — 7286 → 7297 (+11 new cases). No SIGSEGV; the sweep is green end to end.

$ pnpm --dir <wt> --filter @patina/designer-portal lint
✖ 201 problems (0 errors, 201 warnings)    EXIT=0                                  PASS
  — 203 → 201: n4's two "Unused eslint-disable directive" warnings on
    desk-contents.tsx are gone, and the diff now contributes ZERO warnings.

$ pnpm --dir <wt> --filter @patina/admin-portal build              (strictest gate)
✓ Compiled successfully in 17.8s                                                   PASS
```

**Push**: `4ed047205..0b7a43c62  hour-tracking/portal -> hour-tracking/portal`, exit 0. The
pre-push hook printed *"Affected verification has advisory failures."* — that is the
**standing, pre-existing `@patina/client-portal type-check`** failure this worktree carries
(`Cannot find module '@patina/aesthete-quiz'` ×4 plus its knock-on `any`/`unknown` errors,
an unbuilt workspace dist), already recorded by round 1 and `W1W2-portal-fix-r2.md` as
outside this branch. No client-portal path is in the diff.

Commit hygiene: 16 explicit pathspecs. `next-env.d.ts` is dirty in the worktree (a Next
route-types path) and was deliberately **left unstaged**; `git ls-files -v | grep '^S'` is
still `S supabase/config.toml`, never staged. No `.env.local`, no `artifacts/`, no
`supabase/**`. Subject is `fix(time):`.

---

## 2 · Majors

### M-03 — the member scope listed rows its total did not count · FIXED

`hours-ledger.tsx` — `ScopeEntries` now takes the same studio the rollup is keyed on:

```tsx
studioId={scope === 'studio' || scope === 'member' ? (viewerStudio?.id ?? null) : null}
```

00607:93 hard-filters the rollup on `ledger.studio_id`; the entries passed `null` in the
member scope, so `useTimeEntryLedger` applied no studio predicate and listed every row RLS
let the caller read for that person — including the legacy "rate pending" hours the total
above excludes (00607:143-148: `time_entry_ledger.studio_id` is NULL where a project names
no pricing studio) and a second studio's rows.

Pinned: *"lists the member scope's rows from the studio that produced its total"* asserts
`ledgerCalls.at(-1)` carries `{ studioId: 'studio-1', userId: 'maria', projectId: null }`.
It fails on the old code (`studioId: null`).

### M-04 — five `truncate` classes against house sheet §A4 · FIXED

Deleted from `hours-ledger.tsx` (the rollup bucket label, the internal bucket label,
`row.member_name`, the document·day·rate·money meta line, and `EntryRow`'s own two) and from
`account-studio-page.tsx:1620`. `min-w-0` is kept at every site, which is what lets a flex
child wrap instead of overflowing.

Measured: `git diff origin/hour-tracking/integration | grep -c '^+.*truncate'` → **0**.

### M-05 — the studio was guessed from an unordered read and never named · FIXED

New `apps/designer-portal/src/hooks/use-viewer-studio.ts`, the single answer for both
`hours-ledger.tsx` and `person-profile.tsx` (the duplicate derivation is gone):

- candidates = `design_studio` orgs where the viewer's membership role is `owner` or `admin`
  — so the reviewer's leg 1 (plain member of the first studio, owner of the second, lens
  lost) is closed;
- sorted by name then id, so the answer is stable across loads where PostgREST's order is
  not;
- **no `orgs[0]` fallback** — owning a manufacturer org is not standing over a studio's
  hours, and the old fallback made such a viewer an Hours admin keyed on a studio that
  prices nothing (leg 3);
- the scope caption prints the name: `the studio · Adeyemi & Co · this week` (leg 2).

Pinned: *"answers for the studio it names, not the first membership row"* — a viewer who is
`member` of studio A and `owner` of studio B gets the lens, the caption carries B's name,
and `rollupCalls.at(-1)` is keyed on B.

Extended past the review's fix list, because R2-08 needed it: the hook also returns
`isSettled` (`data !== undefined || isError`), since `data` alone never arrives on a failed
read and a caller that waits on it waits forever.

---

## 3 · Carried minors the brief named — all applied

| # | What changed |
|---|---|
| **n1** | `MemberProjectTotal` branches on the error code: only `42501` (the DEFINER's own assert) prints *"this document's total is for its team — you are not on it"*; anything else prints *"could not be read"*. `role="alert"` on both. |
| **n4** | Both unused `eslint-disable` directives deleted from `desk-contents.tsx`. Lint 203 → 201 warnings. |
| **n5** | `time_rate_unresolved` carries a real `project_kind`. There is **no `projects.kind` column** (verified against the local stack); what the classifier calls a design-services project is the ORIGIN commercial document's kind (`_is_design_services_project`, read from `pg_proc` — `document.is_origin AND document.document_kind IN ('design_services','design_build')`). The week read embeds `origin_documents:project_commercial_documents(document_kind, is_origin)` and the alarm reports it, or `'non_services'` where no origin document exists. The FK and the nested embed were probed live (`GET /rest/v1/project_time_entries?select=…` → **HTTP 200**), so the embed resolves rather than 400-ing the sheet's primary read. |
| **n9** | 36 inline font-size utilities → the §A3 type scale (`t-head` / `t-body-sm` / `t-money`), across `hours-ledger.tsx`, `studio-rate-rows.tsx`, `pending-time-authorization-band.tsx`, `account-studio-page.tsx`. Both grand totals (`ScopeRollup`, `MemberProjectTotal`) are on `.t-money` per SPEC.md:149-153. Measured: `grep -c '^+.*text-\[[0-9.]*px\]'` over the whole diff → **0**. |
| **n10** | `min-h-11` on the five group-by acts. |
| **n11** | `aria-expanded` + `aria-controls` on both disclosure acts, with real `id`s on the regions they open (`hours-scope-entries`, `hours-entry-note-<id>`). |
| **n12 / R2-09** | The rate field is **controlled**. An emptied blur writes nothing (00598's CHECK refuses ≤ 0 and there is no DELETE policy) and restores the rate in force; a refused save restores it beside the refusal. A saved rate arrives as a new dated row and the field follows the fact. Two new `studio-rate-rows.test.tsx` cases pin both arms. |
| **R2-06** | `lensPricingStudio.isError` gets its own arm — *"Which studio prices this document could not be read."* — so the fourth state is no longer silence. |
| **R2-11** | `todayISODate()` builds the date from local parts. An evening save in a US timezone was stamped tomorrow, 00598's trigger closed the rate in force at today, and that night's hours priced at the old rate under a card printing a row dated tomorrow. Pinned under `vi.setSystemTime(2026-09-11 21:30 local)` → `effective_from === '2026-09-11'`. |
| **R2-12** | The Desk line names the day (`fmtDay`) for anything older than yesterday. |
| **R2-13** | The rate section is gated on `canManage && user?.id`, so the acting admin is never briefly offered the inert field on her own row. Two page-level cases in `account-studio-page.test.tsx`: absent for a plain `member`, present for `admin`, and the admin's own row carries the sentence while a teammate's carries the field. |
| **R3-01** | `enabled: Boolean(studioId || userId || projectId)` on `useTimeEntryLedger`. |
| **R3-02** | `role="alert"` on `PricingStudioLine`'s note, `EntryRow`'s `rowNote` and the sheet's own top-level `note`. |
| **R3-03** | Both `/desk?account=studio` doors are `next/link`. |

---

## 4 · Applied beyond the brief's list

The brief listed the cheap minors explicitly but told me to skip nothing without a stated
reason. These five were cheap enough to close now rather than carry to a round 4:

- **n2 — the page double-counted.** 00607:151-155 says `billable_minutes`/`billable_cents`
  and `internal_minutes` can count the same row, and the main list rendered **all** buckets
  while `— internal —` re-rendered every bucket with any internal minutes. The two lists are
  now disjoint: a bucket that is **entirely** internal stands under the rule and nowhere
  else; a mixed bucket keeps its internal share as a clause on its own row
  (`· 1h 00m internal`). The `— internal —` group the plan asks for survives. Pinned:
  *"stands internal time in its own group, and counts no bucket twice"* — each label appears
  exactly once.
- **n6 — the alarm was blind where it mattered.** `ScopeEntryRow` emits
  `time_rate_unresolved` too, which is where an admin actually sees other people's unpriced
  hours. The emitter dedups per entry, so an hour seen in both the viewer's own week and a
  scoped list is one event. `project_kind` is `null` from the scoped rows **and only from
  those** — `time_entry_ledger` (00604) carries no kind and a per-row query to invent one
  would cost more than the segment is worth; the emitter's doc comment now says so and says
  to read a null as "not said", never as "not services".
- **n8 — a stale module value could mis-scope a later open.** `openHoursForMember` now also
  dispatches `document:hours-member-scope`, which a **mounted** `HoursLedger` hears: it takes
  the person (the Studio Drawer remounts nothing when the sheet is already open, so the click
  used to do nothing visible) and clears the module value. An unmounted sheet still reads the
  value at mount and clears it there. Pinned: *"takes a person handed to a sheet that is
  already open, and forgets her after"*.
- **R2-08 — the sheet landed before it knew whose hours it was about.** `scope` is `null`
  until the membership read **answers**, then lands once: `landingScope` for a viewer with
  the lens, `'mine'` for one without, and a **failed** read counts as no lens rather than
  leaving her stranded in the project scope with nothing but "The entries" on screen. The
  `time_scope_viewed` emit sits behind the settle, so one open emits one event. While it
  waits the sheet says `Reading…` rather than painting a scope it may take back.
  `MemberProjectTotal`'s gate moved from `orgs &&` to `standingKnown &&` for the same reason.
  Three new cases: one open → one event; an errored read lands on her own week with no
  entries act; a pending read emits nothing and says it is reading.
- **R2-10 — a total the rows below cannot make.** The caption is now *"this document · all
  time, for its whole team"* with *"Below, your own week."* beneath the figure, so HT-30 is
  satisfied in substance and not only in order.
- **t13** (a note, not a finding) — `playwright.hours.config.ts` finds the chromium project
  by **name**, not by position.

---

## 5 · Not applied, with reasons

### M-01 — HT-35 disclosure band + per-member opt-out · **DEFERRED, not skipped**

Scoped by the orchestrator (2026-09-13) to **stage 4 of this program, lane B, with W7**. It
does not count against this wave's clean. `document-events.ts`'s doc comment records the
scoping in place, alongside the existing note that the three candidate columns
(`user_settings`, `profiles`, `profiles.help_state`) do not exist, that plan §3 reserves
HT-35 no migration number and that this program's range is spent. The emitter module stays
its home; `time_autostart_disclosed` / `_opted_out` remain deliberately undefined so the
stage that lands the band lands its vocabulary with it.

### M-02 — the onboarding article edit + the Sanity push · **BLOCKED, evidence below**

Re-measured this round, and the reviewer's claim holds exactly:

```
$ ls .../agent-portal/artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/
  No such file or directory                       # absent from this worktree

$ ls /Users/kody/Code/patina-merged/artifacts/.../wave-1/15-hours.md
  -rw-r--r--  1.4k  3 Sep 13:04                    # present in the MAIN checkout only

$ git ls-files  .../15-hours.md   → (empty)        # untracked
$ git check-ignore -v .../15-hours.md → (no match) # and not gitignored either
```

So the file is an untracked artifact of another program, living in the main checkout. Three
reasons it cannot land here, any one of them sufficient:

1. It does not exist in this worktree, and the only way to make it exist is to copy an
   untracked tree across from the main checkout — the exact landmine the git-hygiene rule
   names, and it would create a second, diverging copy of a file another program still holds
   in its own working tree.
2. Running git in the main checkout is forbidden by this phase's hard rules.
3. The Sanity push is an external mutation with no authorization in this session, and Agent
   OS forbids automated external sends.

Owed to the orchestrator, unchanged from round 2: **track that file or name its real home**,
then the two sentences are a five-minute stage; authorize the Sanity write separately. Note
the reviewer's sharpening, which I confirmed by reading the sheet's own gates: `:15`'s
*"a designer **or the studio's first hire** can see … where the week actually went"* is now
**false** — HT-8 gives a plain member no lens and 00606 gives her her own rows only. That
sentence wants rewriting, not confirming.

### Notes left as notes

**t1** (HT-29 "act-bearing or absent" shipped as "the row always, the act sometimes"),
**t2** (HT-11 is plan §4/W3's), **t3** (raw PostgREST reads in two components — the file's
pre-existing idiom; hoisting them into `@patina/supabase` hooks is a refactor this round did
not ask for), **t6/t10/t15** (deliberate forward-declarations for W3/W5/W6), **t7** (the copy
deck deviation — the orchestrator's ruling is owed), **t8** (the architect choice the plan
already flagged), **t11** (`lensWords.length > 1` is dead but harmless, and removing it would
hard-code a floor the lens may not always have), **t12** (`rateUnresolvedSeen` growth is one
short string per unpriced entry — negligible, and it is what the doc comment promises),
**t14** (BIL-08's rate-display drift closes at W0's `00596`; HT-6-a is the owed ruling).

---

## 6 · What this round did NOT verify

- **No e2e run.** Not in this round's gate list; port 3000 is contended with the peer
  people-room program and this stage was not named its owner. I read `hours.spec.ts` against
  the changes instead: every assertion is Playwright-auto-waited and the lens is only
  asserted *after* `toBeVisible`, which cannot resolve before the membership read settles —
  so the new `Reading…` beat is invisible to it. The seeded actor owns two design studios
  (Leah Hartwell, Local Dev Studio); under `useViewerStudio`'s ordering the run is now
  deterministic on *Leah Hartwell*, where before it read whichever row came back first.
- **No live-mode browser walk and no screenshots**, for the same port reason.
- **No `supabase db reset`, no SQL tests.** This stage does not own the DB. The three SQL
  facts this round leans on were read or probed, not executed as tests: `00607:93`'s studio
  filter and `:151-155`'s double-count warning (read), `projects.kind`'s absence and
  `_is_design_services_project`'s body (`psql` against 127.0.0.1:54422), and the
  `project_commercial_documents` FK + the nested embed (`curl` against
  http://127.0.0.1:54421 → HTTP 200).
- **`packages/supabase` lint not run** — no resolvable flat config outside designer-portal,
  so a result would mean nothing (patina-verification).
- **client-portal / manufacturer-portal type gates not run** — nothing in the diff touches
  them, and both `@patina/supabase type-check` and the admin build are green.
- **Prod untouched.** No `db push`, no deploy, no Strata read, no Sanity write.
- **PostHog not consulted** — event names were checked against plan-v2's text and the module
  source only.
