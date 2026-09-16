# W1W2-portal — adversarial review, round 4

**clean = false** (0 blocker · 2 major · 11 minor · 16 note)

Reviewer: separate context from the implementer and from rounds 1–3.
Branch `hour-tracking/portal` @ `0b7a43c62` against `origin/hour-tracking/integration`
@ `04b579bbd`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.

Commits under review:

```
0b7a43c62 fix(time): the rows under a total are the rows that made it, and the studio says its name
4ed047205 fix(time): a figure waits for its answer, and the repair refreshes what it repaired
ff2065ed6 fix(time): the Hours sheet reads the document, not the holder's own week
2c83cb4d3 feat(time): W2 UI — four scopes in one sheet, and the studio's hours said plainly
29b72c644 feat(time): W1 portal — the studio rate card, and an hour that says what it is worth
```

Read in full: plan-v2 §0, §2 (W1 portal files + Done-when), §3 (W2 portal files + Done-when);
`W1W2-portal-impl.md`; `W1W2-portal-review-r3.md`; `W1W2-portal-fix-r3.md`; the complete current
text of `hours-ledger.tsx` (1734 lines), `use-viewer-studio.ts`, `open-hours-scope.ts`,
`authority-hours.ts`, `studio-rate-rows.tsx`, `hours-ledger-scope.test.tsx`, `hours.spec.ts`,
`playwright.hours.config.ts`; the full diff of every other touched file; `use-studio-member-rates.ts`,
`use-time-tracking.ts`'s new hook, `use-organizations.ts`; `docs/design/house-sheet/SPEC.md` §A3–A5;
`rulings.md` HT-11/26/29/30/36/40/41; and `00606`/`00613`'s own text where the UI leans on it.

> **Diff note.** `git diff origin/hour-tracking/integration..hour-tracking/portal` (two dots) shows
> `00610`–`00613`, `internal_time_test.sql`, `00-legacy-grants.sql` and `database.types.ts` as
> DELETIONS. They are not. Integration moved four commits ahead (W4 lane-A DB) after this branch's
> merge base `a9841c8de`; the three-dot diff — the branch's own work — is **28 files, +3285/−58**,
> and touches **no** path under `supabase/`. Every claim below is measured on the three-dot diff.

---

## 1 · Gates — run by this reviewer, verbatim

```
$ pnpm --dir .../agent-portal --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
(no output)                                                    EXIT=0   PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
(no output)                                                    EXIT=0   PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test -- \
    src/lib/document/__tests__/authority-hours.test.ts \
    src/components/document/__tests__/hours-ledger-scope.test.tsx \
    src/components/document/__tests__/desk-contents.test.tsx \
    src/components/document/account/__tests__/studio-rate-rows.test.tsx \
    src/components/document/account/__tests__/account-studio-page.test.tsx \
    src/components/document/people/__tests__/person-profile.test.tsx
Test Suites: 6 passed, 6 total
Tests:       76 passed, 76 total                               EXIT=0   PASS
  — the plan's named W1 spec (authority-hours) and W2 spec (hours-ledger-scope)
    are both in this set. 24 cases in hours-ledger-scope, 11 in authority-hours.

$ pnpm --dir .../agent-portal --filter @patina/supabase test -- \
    src/hooks/__tests__/use-time-tracking.test.ts \
    src/hooks/__tests__/use-studio-member-rates.test.ts
 ✓ src/hooks/__tests__/use-time-tracking.test.ts       (3 tests)
 ✓ src/hooks/__tests__/use-studio-member-rates.test.ts (8 tests)
 Test Files 2 passed (2)   Tests 11 passed (11)                EXIT=0   PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test    (FULL sweep)
Test Suites: 1 failed, 574 passed, 575 total
Tests:       7294 passed, 7294 total
Snapshots:   1 passed, 1 total                                 EXIT=1   RED — see n11
  FAIL src/components/document/desk-claims.test.tsx
    ● Test suite failed to run
      A jest worker process (pid=26774) was terminated by another process:
      signal=SIGSEGV, exitCode=null.

$ pnpm --dir .../agent-portal --filter @patina/designer-portal lint
✖ 201 problems (0 errors, 201 warnings)                        EXIT=0   PASS (0 errors)
  — the diff contributes ZERO warnings. The only warnings on any touched file are
    pre-existing lines outside the diff (account-studio-page.tsx:776,
    person-profile.tsx:243/244). n4's two directives are gone; 203 → 201 confirmed.

$ pnpm --dir .../agent-portal --filter @patina/admin-portal build   (strictest gate)
✓ Compiled successfully in 18.7s
✓ Generating static pages (137/137)                            EXIT=0   PASS
```

The DB was **not** reset (this stage does not own it); no `supabase/tests/**` were run; the e2e
suite was **not** re-run (§4).

### Commit hygiene — clean

Five commits, subjects `feat(time):` ×2 and `fix(time):` ×3 — Conventional Commits, no `merge(…)`,
hook-safe. `git show --stat` on each: 12 / 6 / 11 / 7 / 16 files, all under `apps/designer-portal`,
`packages/supabase/src/hooks`, or the two doc files the plan names. `git diff --name-only … | grep
-E '^supabase/|\.env|artifacts/'` → **empty**, so no migration, no `generate-legacy-grants.py` and
no `database.types.ts` regeneration is owed. `git ls-files -v | grep '^S'` → `S supabase/config.toml`,
still skip-worktree'd and never staged. `next-env.d.ts` is dirty in the worktree and correctly left
unstaged. No `.env.local`, no `artifacts/` tree, no stray path.

### Merge readiness

`git merge-tree $(merge-base) portal integration` → **0 conflict markers**. The branch is four
commits behind integration (W4 lane-A DB); `database.types.ts` changed on integration only.

### Mock fallback cannot mask a broken query

`grep -E '^\+.*(withMockData|mock-data)'` over the diff → **zero**. `grep -rl withMockData
packages/supabase/src` → **none**. `apps/designer-portal/src/hooks/use-commercial-documents.ts`
(the one app-local hook the sheet consumes) carries none. Every read on this surface rethrows, so
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE` cannot substitute plausible numbers for a denial anywhere
on the sheet — and after round 2's fix every money read now renders `Reading…` or the refusal
rather than a zero. Re-measured this round: the only read still failing silently is
`HoursInHandAct` (n9).

### Ruling spot-checks that PASSED — each measured against the file, not assumed

- **P-5, no flag.** `grep -E '^\+.*(useFeatureFlag|ComingSoon|isFeatureEnabled)'` → **0**.
- **R69, no per-second motion.** `grep -E '^\+.*(setInterval|requestAnimationFrame|animate-|transition-all|animation:)'` → **0**. `Reading…` is a static word.
- **D4 / house sheet §A4.** `grep -cE '^\+.*shadow'` → **0**; `grep -cE '^\+.*truncate'` → **0** (M-04 genuinely closed); `grep -E '^\+.*#[0-9a-fA-F]{3,6}\b'` → **0** new hex.
- **No inline `font-size` (§A3).** `grep -cE '^\+.*text-\[[0-9.]+px\]'` over the whole diff → **0**. n9's mechanical half is closed. (Its semantic half is now n2 below.)
- **No dashboard, tab bar, badge, red/green pair.** The lens is `scope-lens.tsx`'s Scored-Ink idiom generalised to four words — `role="group" aria-label="Hours scope"`, `aria-current`, `da-score-on`/`da-score-hover`, `min-h-11` (`hours-ledger.tsx:612-640`). No route, no page, no `/hours`, no tabs. Error text is `--color-terracotta-ink`, a single state pigment.
- **HT-26 — never a blank where a rate is pending.** `timeRateProvenance` is total: four arms, each with a non-empty `label`, `null` unreachable (`authority-hours.ts:118-152`). Both row renderers print `provenance.label` unconditionally (`:1416`/`:1421`, `:1587-1589`). Pinned by four unit cases.
- **The repair doorway is admin-only.** `ratePending && viewerIsOwnerOrAdmin` (`:1698`); `PricingStudioLine`'s stamp `!pricingStudioId && viewerIsOwnerOrAdmin && viewerStudioId` (`:1017`); `PendingTimeAuthorizationBand`'s door `showStudioRateDoor={viewerIsOwnerOrAdmin}` (`:679`).
- **HT-8 — the lens is unreachable for a plain member; admins get aggregates.** `viewerIsOwnerOrAdmin &&` gates the lens (`:612`) and `ScopeRollup` (`:735`); the landing belt (`:505-516`) forces a non-admin to `'mine'` the moment standing is known, and holds `scope === null` (rendering `Reading…`) until it is, so no gated word is ever painted mid-load. The person-profile door carries the same gate (`person-profile.tsx:813`, `:833`). **The `admin` arm is now pinned** — round 3's t5 gap closed (`hours-ledger-scope.test.tsx:308-313`, `account-studio-page.test.tsx:584-607`).
- **HT-9.** The project scope's fact-view read passes `userId: null` (`:802`); pinned by `expect(projectRead).toMatchObject({ projectId: 'project-1', userId: null })`.
- **HT-10-a.** `MemberProjectTotal` → `useProjectHoursTotal` → the DEFINER `project_hours_total`, rendered for `lensProjectId && standingKnown && !viewerIsOwnerOrAdmin` (`:724`), and it distinguishes `42501` from any other error (`:1237-1245`, round 3's n1 — genuinely fixed, `role="alert"` on both arms).
- **HT-30.** In every scope the grand total precedes its buckets and the buckets precede the entries (`ScopeRollup` `:735-773` above the entries block `:775-810`). `MemberProjectTotal` now captions what the figure is and what the rows are (*"this document · all time, for its whole team"* / *"Below, your own week."*) — R2-10 closed in substance.
- **HT-36, at the type level.** `studio_hours_rollup`'s `RETURNS TABLE` carries no `notes`; `TimeEntryLedgerRow` carries none. `ScopeEntryNote` (`:1466-1492`) is the only reader of `notes`, reads **the table**, one entry at a time, behind an explicit act, with `aria-expanded`/`aria-controls`. Pinned: no free text on the sheet before the act.
- **HT-41 — no role chip on single-role rows.** The role segment is absent from both row renderers and pinned absent in both (`hours-ledger-scope.test.tsx:522-542`). Correct against plan §4, which assigns the multi-role chip to W3 — but see t4 for W1's own Done-when.
- **HT-40 — the chip stays as built.** Both chips are 1px-bordered text pills, no fill (`:1431-1443`, `:1637-1649`). See t9 for the residual reading of HT-40's second clause.
- **HT-3 — the rate card writes `created_by` = the caller and refuses non-admins.** `useSetStudioMemberRate` stamps `created_by: userId` from `auth.getUser()` (`use-studio-member-rates.ts:110-118`), exactly what `studio_member_rates_admin_insert`'s `WITH CHECK (… AND created_by = auth.uid())` requires. The section is gated `canManage && user?.id` (`account-studio-page.tsx:1601`) — the `user?.id` half closes round 3's R2-13 flash — with RLS as the real gate, and both arms are now page-level pinned.
- **HT-3-e(2).** `selfAuthoredInert={m.user_id === user?.id && myRole !== 'owner'}`; the copy branches on the row's actual `created_by` and treats `created_by IS NULL` as a deleted author (which `00615` still prices).
- **M-05 genuinely fixed.** `use-viewer-studio.ts` filters to `design_studio` **and** an `owner`/`admin` membership, sorts by name then id, has **no `orgs[0]` fallback**, and the studio scope's caption prints the name (`:762`, `:1114`). `useOrganizations` already `.eq('status','active')`, so no status leg is owed. The derivation is now single-sourced — `person-profile.tsx` imports the same hook. Pinned end to end (`hours-ledger-scope.test.tsx:564-586`).
- **M-03 genuinely fixed.** `ScopeEntries` takes the same studio the rollup is keyed on for the member scope (`:796-800`), and `useTimeEntryLedger` gained `enabled: Boolean(studioId || userId || projectId)` (R3-01). I checked the project scope for the same class and it is **sound**: `time_entry_ledger.studio_id` is a function of the project alone (`00613:533-535` — `CASE WHEN te.project_id IS NULL THEN te.studio_id ELSE project_pricing_studio_id(te.project_id) END`), so every row of one project shares one studio and the rollup's studio filter is redundant there, not divergent.
- **Emitter names match the plan exactly.** `time_entry_logged` (eight props, identical to §2:267), `time_timer_started`, `time_timer_stopped`, `time_entry_adjusted`, `time_entry_deleted`, `time_scope_viewed`, `time_rate_unresolved`, `time_export_taken` — each spelled as plan-v2 spells it (§2:267-268 · §3:417 · §4:550 · §6:725). `time_autostart_disclosed`/`_opted_out` are recorded in the doc comment as owed and deliberately undefined. No inline `posthog.capture` in the diff. `time_rate_unresolved` now carries a real `project_kind` from the viewer's own week (the origin commercial document's kind, `_is_design_services_project`'s own test) and fires from the scoped rows too (n5/n6 closed).
- **In-app doors are `<Link>`s.** `grep -E '^\+.*<a href'` over the diff → **0**. Both `/desk?account=studio` doors are `next/link` (`hours-ledger.tsx:1714`, `pending-time-authorization-band.tsx:66-72`). R3-03 closed.
- **`desk-doorway.tsx`'s alias works end to end.** `'sheet'` is in `DOORWAY_KEYS` **and** read (`params.get('book') ?? params.get('sheet')`), and the strip-down loop returns the address to `/desk`.
- **No ad-hoc `fetch` to a NestJS service.** `grep -E '^\+.*[^a-zA-Z]fetch\('` → **0**.
- **R2-08/R2-06/R2-11/R2-12/n2/n8/n10/n11/n12/R2-09/t13 all re-measured and genuinely closed** — each against the current file, not the fix log.

---

## 2 · Findings

### MAJOR

**M4-01 — the onboarding article edit and its Sanity push are absent; plan §3's Done-when
resting on them cannot be met from this branch. CARRIED ×3 (R2-05 → M-02); genuinely blocked,
orchestrator-owed.**
*Severity: major (a named plan §3 portal-table row missing, with its own Done-when).
Confidence: high — re-measured in both checkouts this round.*

Plan §3 asks for `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15`
(the two studio-scope sentences the sheet now makes true) plus "push the article to Sanity". Measured:

```
$ ls .../agent-portal/artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/
  No such file or directory
$ ls -l /Users/kody/Code/patina-merged/artifacts/.../wave-1/15-hours.md
  1.4k  3 Sep 13:04                       # the MAIN checkout only
$ git -C <wt> ls-files -- '…/15-hours.md' | wc -l
  0                                       # untracked, on every ref
```

So the lane's three reasons hold exactly: the file does not exist in this worktree, the only way to
make it exist is to copy an untracked tree from the main checkout (the git-hygiene landmine), and the
Sanity write is an external mutation with no session authorization. Plan §3's Done-when *"the Sanity
help article matches what the sheet does"* is **unverified**.

The sharpening from round 3 is also correct and still owed: `:15` (*"a designer **or the studio's
first hire** can see … where the week actually went"*) is now **false** — HT-8 gives a plain member
no lens and `00606` gives her her own rows only. That sentence wants rewriting, not confirming.

*Exact fix (orchestrator, not this lane):* either track that file (or name its real home) so a lane
can edit it, or scope the article + Sanity push out of W2 the way HT-35 was scoped out; then
authorize the Sanity write separately.

**M4-02 — three new reads are raw PostgREST inside components, against this phase's stated hard
rule that new reads become hooks. CARRIED ×3 as note t3; graded major here because the round-4
brief names it a hard rule and an explicit review question.**
*Severity: major (a hard-rule contradiction). Confidence: high — three call sites read directly.*

The brief's hard rules include *"data access through `@patina/supabase` hooks (new reads become
hooks, not raw PostgREST in components)"*, and its refute list asks whether *"every new read is a
hook"*. Three new reads are not:

| Site | Read |
|---|---|
| `hours-ledger.tsx:467-479` (`lensPricingStudio`) | `from('projects').select('studio_id')` — a `useQuery` + `createBrowserClient()` in the component |
| `hours-ledger.tsx:1466-1478` (`ScopeEntryNote`) | `from('project_time_entries').select('notes')` |
| `desk-contents.tsx:81-98` (`HoursInHandAct`) | `from('project_unbilled_time').select(…)` |

`hours-ledger.tsx` already carried five such reads, so two of the three match the file's idiom —
but `desk-contents.tsx` had **zero** before this commit and now owns one plus the
`QueryClientProvider` its suite had to grow for it. Production is fine (the Desk sits under the
`(document)` group, which provides the client); the rule is about where the query lives.

*Exact fix:* three hooks in `packages/supabase/src/hooks/use-time-tracking.ts`, exported from
`hooks/index.ts` — `useProjectPricingStudio(projectId)` on key `['document-hours-project-studio',
projectId]` (the key `useStampProjectPricingStudio` already invalidates, so nothing else moves),
`useTimeEntryNote(entryId)` on `['document-hours-entry-note', entryId]`, and
`useStudioUnbilledTime()` on `['desk-contents-unbilled-time']` — then replace the three inline
`useQuery` blocks with the hook calls. Keys unchanged, so no test rewrite beyond the module mocks.

*Prior grading, stated so the orchestrator can rule:* rounds 2 and 3 both graded this a note on
the "file's pre-existing idiom" argument. If the orchestrator intends the idiom to stand for this
surface, this drops to a note — but it should be said, not inherited.

### MINOR

**n1 — `ScopeEntryNote` reports any read failure as a permission refusal, and it is the one
error arm on the sheet that cannot actually be one. NEW.**
*Confidence: high — `maybeSingle()`'s behaviour under RLS read directly.*
`hours-ledger.tsx:1485-1489` prints *"That note is not yours to read."* on `note.isError`. But an
RLS denial on `project_time_entries` returns **no row and no error** — `maybeSingle()` yields
`{ data: null }`, which renders *"No note on this entry."* So the only failures `isError` can see
are network/500/schema-cache, and every one of them is reported as a standing problem. This is
exactly the class round 3's n1 fixed for `MemberProjectTotal`, missed one component over.
*Fix:* `note.isError` → *"That note could not be read."*; keep the `data ?? 'No note on this entry.'`
arm as the (correct) refusal-and-absence case.

**n2 — the `.t-head` step is applied to values, captions, state sentences and link labels; 23 new
uses, and `.t-meta` — the step §A3 assigns to exactly those things — is used zero times. The
residual half of round 3's n9, now measurable.**
*Confidence: high — `SPEC.md:137-140` and the 23 sites read directly.*
`SPEC.md:140` — `.t-head` | meta | 11px | 500 | .08em | **UPPER** | *"running heads only"*. `:139` —
`.t-meta` | 12px | 400 | .08em | **sentence** | *"values: dates, counts, captions, sub-labels"*.
Round 3's n9 fix converted 36 inline `text-[11px]` utilities to `t-head`, which removed the inline
size (correctly, and that half is closed) but landed the wrong semantic step wherever the old size
was carrying a value or a sentence. Measured: `grep -cE '^\+.*t-head'` → **23**;
`grep -cE '^\+.*t-meta'` → **0**. The user-visible consequences:

- `ScopeRollup`'s error (`:1163-1171`) and `ScopeEntries`' error (`:1321-1331`) render a full
  sentence in 11px UPPERCASE — *"THESE HOURS COULD NOT BE READ — PERMISSION DENIED"*. §A3 puts
  state sentences on `.t-body`/`.t-body-sm` (which is what `StudioRateRows`' own error already uses).
- `ScopeEntryRow`'s meta line (`:1410`) — document · day · activity · rate · money · pricing studio —
  is pure values, so `.t-meta`.
- `MemberProjectTotal`'s caption (`:1257`) and `ScopeRollup`'s (`:1110`) are captions, so `.t-meta`.
- `PricingStudioLine`'s whole paragraph (`:1010`) is a sentence with a studio name in it.

*Fix:* `.t-body-sm` on the three error paragraphs and on `PricingStudioLine`; `.t-meta` on the two
scope captions and on `ScopeEntryRow`'s meta line. Leave `.t-head` on the lens words, the group-by
words and the running heads, where it belongs.

**n3 — the "Billed" chip's text is `--color-sage` on paper, ≈2.1:1, and the new `ScopeEntryRow`
replicates it into the multiplied studio rows. NEW.**
*Confidence: high on the arithmetic; the token is `#A8B5A0` (`globals.css:44`).*
`hours-ledger.tsx:1431-1443` (new) and `:1637-1649` (pre-existing) set both border and text to
`var(--color-sage)` on `--doc-paper`. `#A8B5A0` against the paper ground gives roughly **2.1:1** —
below WCAG AA's 4.5:1 for 11px text, and below even the 3:1 large-text floor. It is the inherited
treatment, which is why it is minor rather than a new defect of judgment; but the studio scope is
where these chips multiply.
*Fix:* keep the sage **border** as the state mark and put the label on `--color-charcoal` (or
`--color-mocha`), so the pill still reads as a state column without the text carrying the pigment.

**n4 — the all-time unbilled balance, the pending-authority band and the batch-add row all render
inside every scope, un-scoped by the lens. NEW — the M-03 class, one layer out.**
*Confidence: medium-high (the code is certain; how a reader reads it is the judgment).*
`hours-ledger.tsx:675-680` (the band), `:813-856` (the balance) and `:926-975` (batch add) sit
outside every `scope === …` guard. Their reads are keyed on `lensProjectId` only
(`['document-hours-unbilled', lensProjectId]`, `['document-hours-pending-authorization',
lensProjectId]`), which is `null` in the member and studio scopes. So under the caption *"Maria Obi
· Leah Mbeki Studio · this week"* the sheet prints **"unbilled · all time $X · Yh"** with a "Bill
it" act — a money figure that is not Maria's and not that week's — and offers an add row that
writes an hour to the *viewer*.
*Fix:* pass the scope's own key into the two reads (`userId` in the member scope), or caption the
balance with whose it is (*"unbilled · all time · yours"*) and hide the batch-add row outside
`scope === 'mine'`, which is the only scope its write belongs to.

**n5 — a viewer who owns or administers two design studios can now only ever read the
alphabetically first one, with no door to the second. NEW (a consequence of the M-05 fix).**
*Confidence: high — `use-viewer-studio.ts:48-60` returns `candidates[0]` and nothing switches it.*
The fix correctly made the answer deterministic and named; it also made the second studio
unreachable. Everything keyed on it follows: the studio scope's rollup, the member scope's rollup
and its entries, and the studio the stamp door offers to name (so on a document whose designer the
*other* studio employs, the door is offered and the server refuses `42501`). The implementer's own
e2e actor is exactly this viewer (owner of *Leah Hartwell* and *Local Dev Studio*).
*Fix (smallest honest one):* when `candidates.length > 1`, make the studio name in the scope caption
a Scored-Ink word that cycles the candidates, and lift the choice to state in the sheet; or, if one
studio per viewer is the intended world, say so in a ruling and have `useViewerStudio` return the
count so the sheet can say *"(1 of 2 studios)"* rather than silently picking.

**n6 — the same-day upsert rewrites `created_by` on a row another admin authored, and overwrites
that day's rate in place, in a table the code calls append-only. NEW.**
*Confidence: high on the mechanism; low on the money impact, which I could not construct.*
`use-studio-member-rates.ts:110-121` upserts `onConflict: 'studio_id,user_id,effective_from'` with
`created_by: userId`. A second save on the same day therefore takes the UPDATE path, whose policy
(`studio_member_rates_admin_update`) checks only `is_org_admin_or_owner(studio_id)` — it does not
re-assert `created_by = auth.uid()` — so the row's recorded author silently becomes whoever
corrected it, and the earlier figure for that day is gone from a history the module documents as
*"a rate a studio billed an hour against is a fact"*. I traced HT-3-e(2) for a money consequence and
found none: a flip to self-authorship needs the actor to be the row's subject, and the UI hides that
field for a non-owner admin while an owner's self-authored row prices anyway.
*Fix:* either state the same-day-correction behaviour in the card's help line (one sentence: "a
second figure today replaces today's row"), or drop `created_by` from the upsert payload so a
correction leaves the original author standing.

**n7 — `HoursInHandAct` offers "hours to bill →" into the invoice composer to a viewer who may not
be able to invoice. NEW.**
*Confidence: medium.* `desk-contents.tsx:155-176` renders the act whenever the viewer's
`project_unbilled_time` read returns any row. After `00606` a plain member reads her own unbilled
rows, so she is offered the composer on the Desk's one act-bearing line. (The Hours sheet's "Bill
it" has the same shape, so this is a propagation rather than an invention.)
*Fix:* gate the act on `useViewerStudio().isOwnerOrAdmin`, falling back to `openLedger('hours')`
for everyone else.

**n8 — `HoursInHandAct` is the one money read on this program's surfaces that still fails in
silence. NEW.**
*Confidence: high.* `desk-contents.tsx:82-98` has no `isError` arm: a denied or failed
`project_unbilled_time` read leaves `unbilled` undefined, `(unbilled?.length ?? 0) === 0`, and the
act simply does not render. Round 2's R2-02 fix made every other unanswered money read on the Hours
sheet say so, which makes this the odd one out — and on the Desk the absence of an act is
indistinguishable from "nothing to bill".
*Fix:* it is a Desk index line, so a terracotta sentence is wrong there; render nothing on
`isPending` and the neutral `openLedger('hours')` door (*"hours →"*) on `isError`, so a failed read
still leaves the sheet reachable.

**n9 — three coverage gaps the plan's own assertions name. CARRIED ×3 (t5), two of four closed.**
*Confidence: high — `grep` over all three spec files.*
Closed this round: the `admin` lens arm, and the member scope's `ledgerCalls` shape. Still unpinned:
(a) **"rate pending" rendering in the sheet** — `grep 'rate pending'` finds it only in
`authority-hours.test.ts:175`, never in a `hours-ledger-scope.test.tsx` render, so HT-26's
user-visible half rests on a unit test of a pure function; (b) the `EntryRow` rate-pending repair
block's `viewerIsOwnerOrAdmin` gate (`:1698`) — nothing asserts a plain member is not offered it;
(c) `PricingStudioLine`'s stamp-door absence for a non-admin — `:372` only asserts absence when a
studio *is* named.
*Fix:* three cases in `hours-ledger-scope.test.tsx` — a `rate_source: 'none'` week entry renders the
words "rate pending" and, for `viewerRole = 'member'`, renders neither repair act.

**n10 — the sheet prints one figure and the invoice bills another on a legacy row. CARRIED ×3
(t14); documented in the matrix, not fixed.**
*Confidence: high.* `hours-ledger.tsx:1522` — `amountCents = e.rated_amount_cents ??
unbilled?.amount_cents ?? 0` — while the invoice composer reads `project_unbilled_time.amount_cents`.
Plan §3 asks BIL-08 be reopened *"as the rate-display drift, not as absence"*, and the matrix entry
now says exactly that, so **the plan item is satisfied**; the underlying two-answer defect closes at
W0's `00596` ("one rate source") and its owed ruling **HT-6-a**. Recorded so it is not lost in a doc cell.

**n11 — the full designer-portal jest sweep exits 1 on a jest-worker SIGSEGV. NEW; measured as
environment noise, not a defect of this branch.**
*Confidence: high.* `src/components/document/desk-claims.test.tsx` — *"A jest worker process
(pid=26774) was terminated by another process: signal=SIGSEGV"* — a worker crash, not a test
failure (7294/7294 tests passed). Three pieces of evidence that it is not this work: the file is
**not in the diff** (`git diff --name-only … | grep -c desk-claims` → 0); it **passes in isolation**
(`3 passed`, exit 0, re-run by me); and round 2 saw the identical crash on a *different* untouched
file (`draw-schedule-editor.test.tsx`), which round 3 could not reproduce. It is a recurring flake
of this worktree. Recorded rather than waved through because the brief's gate list does include the
sweep's command shape and it returns non-zero.
*Fix:* none owed to this lane; re-run the sweep (or `--runInBand`) before the merge and record the
result, so the wave does not merge on a red exit code nobody explains.

### NOTE

**t1 — HT-35's disclosure band, per-member opt-out and two emitters are absent.** Orchestrator-scoped
(2026-09-13) to **stage 4, lane B, with W7** — a note by this round's brief, not a major.
`document-events.ts:177-186` records the scoping in place alongside the three non-existent candidate
columns (`user_settings`, `profiles`, `profiles.help_state`). Plan §3's Done-when *"the disclosure
band appears once for a fresh member and never again"* stays unverifiable until that stage.

**t2 — W4's portal follow-commits are stage 4, and one of them is now visible.** After the merge,
`00613`'s ledger view admits project-less internal rows (`studio_id` from the row's own column), and
`ScopeEntryRow:1412` renders `row.project_name ?? 'Project'` — so an internal hour with no project
will print the literal word **"Project"** as its document. One string, owed to the stage that lands
the W4 portal work.

**t3 — the branch is four commits behind integration.** `merge-base a9841c8de`; integration is at
`04b579bbd` (W4 lane-A DB, `00610`–`00613` + `internal_time_test.sql` + the grants seed +
`database.types.ts`). `git merge-tree` reports **0 conflicts** and no path overlaps, so the merge is
clean — but the branch has never been type-checked against W4's regenerated `database.types.ts`.
Re-run `@patina/supabase type-check` + `@patina/admin-portal build` after the merge, not before.

**t4 — ruling owed: which wave carries W1's Done-when #5.** Plan §2's Done-when reads *"A two-role
member's ledger row prints the role they picked."* No role prints, and the spec pins its absence.
Plan §4 (W3) explicitly owns *"a **role chip** on the log strip, **the ledger entry rows** and the
⌘K verb, shown only when the member holds more than one live roster role"* — so the two plan
sections disagree about which wave owes it. The implementation follows §4 (and HT-41's "only when
more than one", which needs the live roster-role count W3 fetches), which I judge the right reading;
it should be said out loud rather than left as a Done-when nobody can tick.

**t5 — HT-11 is unsatisfied in two files this lane edited; plan §4 assigns it to W3. CARRIED ×3
(t2).** The ledger's batch-add row (`hours-ledger.tsx:926-975`) is a capture surface with no
`billable` control, and `useCreateTimeEntry` still writes `billable: input.billable ?? true`. HT-11
ruled "yes to both"; plan-v2:467 lists HT-11 among **W3's** ruled inputs and :497 makes
`p_billable = NULL` raise once every surface carries the control. Ownership note, not a defect of
this lane.

**t6 — ruling owed: HT-29 shipped as "the row always, the act sometimes". CARRIED ×3 (t1).**
`desk-contents.tsx:360` hangs `HoursInHandAct` beneath an Hours doorway row that still renders
unconditionally; plan §3 reads *"act-bearing or absent"*. Removing the row would make the Hours sheet
unreachable from the Contents index, so the gap is Kody's question. The impl report's judgment call
#1 covers the *figure* half correctly (R95 forbids a count there) and not the *absent* half.

**t7 — ratification owed: the copy deck documents the alias instead of being rewritten. CARRIED ×3
(t7).** Plan §3 says rewrite `?sheet=hours` → `?book=hours` at `copy-deck.md:357,379,627`; the lane
added a Conventions bullet naming both spellings and pointing at the seeded templates
(`packages/email/src/templates/onboarding-hours.tsx`, migrations `00293`/`00310`/`00404`) that carry
the live string. The Done-when (*"the copy deck no longer disagrees with the code"*) is satisfied by
the doorway accepting both, and the doorway alias is verified end to end. Sound reasoning, real
evidence, still a deviation from a plan line.

**t8 — architect choice, re-confirmed: the rate card lives on `account-studio-page.tsx`
(`/desk?account=studio`), not `/preferences` and not the People Room. CARRIED ×3 (t8).** Plan §2
makes this choice explicitly against HT-3's parenthetical and asks it be flagged. Implemented as planned.

**t9 — ruling owed: HT-40's second clause against the chip in the multiplied rows.** HT-40 reads
*"Keep it as built … **Do not add colour-coding when the studio scope multiplies rows**."* The chip
as built colour-codes billed (`--color-sage`) against unbilled (`--color-pearl`), and
`ScopeEntryRow` carries that pair into the studio scope — i.e. the treatment was kept and the scope
multiplied. Whether "keep it as built" or "do not colour-code when multiplied" wins is Kody's, not
the lane's. (See n3 for the separate contrast fact, which holds either way.)

**t10 — `timeRateRoleLabel` is a dead export in production code. CARRIED ×3 (t6).**
`authority-hours.ts:101-105` and its test, nothing else. Deliberate (W3 needs it); recorded so
nobody "cleans it up" first.

**t11 — `timerStarted` / `timerStopped` / `exportTaken` are defined with no call site. CARRIED ×3
(t10).** Plan-v2 owns all three names in later waves (§4:550, §6:725) and this lane is the file's
sole writer for the phase, so landing the vocabulary early is the cheaper ordering. Worth repeating:
the `Export week → Accounts` button in this very file is **not** `time_export_taken`'s call site —
it opens the composer, it does not hand hours out as a file — so W5 must add its own.

**t12 — `lensWords.length > 1` is a dead guard. CARRIED ×2 (t11).** `hours-ledger.tsx:612`.
`lensWords` always contains `'mine'` and `'studio'`, so the test is always true and the lens's
visibility rests on `viewerIsOwnerOrAdmin` alone.

**t13 — `rateUnresolvedSeen` never clears. CARRIED ×2 (t12).** `document-events.ts:39` — a
module-level `Set<string>` keyed on `entry_id` with no eviction, so the dedup is per module lifetime.
That is what the doc comment promises; the growth is one short string per unpriced entry seen.

**t14 — the `['studio-member-rate', userId]` entity key has no reader. CARRIED ×2 (t15).**
`use-studio-member-rates.ts:49` defines it and `:120` invalidates it; nothing queries it. Plan
§2:252 specifies both keys, so this is the plan's shape faithfully implemented; noted so a later
hand knows the entity read was never built.

**t15 — the sheet is now 1734 lines, from 751.** `hours-ledger.tsx` carries the ledger, the lens,
four scopes, five sub-components and three inline reads in one module. Nothing is wrong with it; it
is the next file someone will be afraid to touch, and W3 has a follow-commit landing in it (§11).
Worth a deliberate split (`hours-scope/` — `scope-rollup.tsx`, `scope-entries.tsx`,
`pricing-studio-line.tsx`) before W3 rather than after.

**t16 — the person-profile → Hours door's runtime path is unobserved.** `openHoursForMember`
dispatches `document:open-ledger` from inside the People Room and relies on `StudioDrawer` hearing
it there. The jest spec proves the module contract and the already-open case; nothing in this
round proves the drawer opens the sheet over the People Room in a browser. Owed to the prod/local
walk, not to a gate.

---

## 3 · Plan-item ledger (W1 + W2 portal tables)

| Plan item | Status |
|---|---|
| §2 · `use-time-tracking.ts` — `rate_source`/`rate_role` on the type, `rateRole?` on `CreateTimeEntryInput`, no rate sent + asserted | **present** (lane A) |
| §2 · `use-studio-member-rates.ts` create, keys + invalidation set | **present** (lane A), keys exactly as specified; n6 open |
| §2 · `hooks/index.ts` + package index export | **present** |
| §2 · `account-studio-page.tsx` — "Studio rates" section, blur-save, owner/admin only, dated history | **present**; gate now pinned both ways |
| §2 · `studio-rate-rows.tsx` create | **present**; controlled field, both restore arms pinned |
| §2 · `hours-ledger.tsx` — rate + rate-source column, "rate pending", never blank | **present**; n9(a) unpinned in the sheet |
| §2 · `authority-hours.ts` — `timeRateProvenance` never `null`, discriminated, carries source + role | **present**, 4 unit cases |
| §2 · `pending-time-authorization-band.tsx` + the `pending_authorization` read become a doorway | **present** |
| §2 · PostHog `time_entry_logged` / `time_rate_unresolved` | **present**, both with real props and both call sites |
| §2 · Done-when "a two-role member's row prints the role they picked" | **not met at this wave** — plan §4 assigns the chip to W3 (t4) |
| §3 · `hours-ledger.tsx` — four-scope lens, absent for non-admins, no `user_id` AND on the project path, totals above rows, studio money, `— internal —` group, chip unchanged | **present**; n2, n4, t9 open |
| §3 · `use-time-tracking.ts` — `useStudioTimeReport` deleted, `useStudioHoursRollup` + `useTimeEntryLedger` added | **present** (lane A); `enabled` guard added |
| §3 · `person-profile.tsx` — an "Hours" act, the only door to the member scope | **present**, gated, pinned both ways; t16 |
| §3 · `desk-contents.tsx` — the Hours line act-bearing or absent | **present**; t6 (ruling), n7, n8 open |
| §3 · `document-time-provider.tsx` — HT-35 disclosure band | **ABSENT** — stage 4 (t1) |
| §3 · `account-profile-page.tsx` — HT-35 opt-out | **ABSENT** — stage 4 (t1) |
| §3 · `desk-doorway.tsx` — `sheet` as an alias of `book` | **present**, end to end |
| §3 · `copy-deck.md:357,379,627` | **deviation** — documented, not rewritten (t7) |
| §3 · `15-hours.md:9,15` + the Sanity push | **ABSENT / BLOCKED** (M4-01) |
| §3 · `portal-vs-desk-feature-gap-matrix-v2.md:189,193` — BIL-04 closed, BIL-08 reopened as drift | **present** (n10) |
| §3 · `hours-ledger-scope.test.tsx` (new) | **present**, 24 cases; n9 gaps |
| §3 · `e2e/document/hours.spec.ts` (new) | **present**, 128 lines + a derived config; not re-run here (§4) |

---

## 4 · What this review did NOT verify

- **No `supabase db reset`, no SQL test run, no `psql` probe.** This stage does not own the DB. Lane
  A's coverage of `00598`–`00607` / `00615` / `00620` is taken as given; `00606`'s
  `stamp_project_pricing_studio` definition and `00613`'s ledger-view `studio_id` expression were
  **read** to ground the UI claims (and to clear the project scope of the M-03 class), not executed.
  No row-level claim here rests on a SELECT.
- **The e2e suite was not re-run.** Not in this round's gate list; port 3000 is contended with the
  peer people-room program and this stage was not named its owner. I read `hours.spec.ts` and
  `playwright.hours.config.ts` and judge them sound — loopback-only guard, keys-required-with-URL
  guard, chromium found by name, no literal key. `W1W2-portal-fix-r2.md`'s *5 passed, chromium,
  :3100 against 127.0.0.1:54421* is accepted on the implementer's evidence. Two caveats of that
  green stand: chromium only, and the 44px loop covers the **lens** buttons only.
- **No browser walk, no screenshots, no live-mode render by this reviewer.** The only runtime
  evidence for this wave remains the implementer's SELECT walk (`W1W2-portal-impl.md` §3) and that
  e2e run; neither was re-executed here. t16 in particular is unobserved.
- **The post-merge state was not gated.** `merge-tree` says the merge is clean, but neither
  type-check nor the admin build has run against W4's regenerated `database.types.ts` (t3).
- **`packages/supabase` lint not run** — per `patina-verification` no resolvable ESLint flat config
  exists outside designer-portal, so its result would mean nothing.
- **client-portal / manufacturer-portal type gates not run.** Nothing in the diff touches them;
  `@patina/supabase type-check` and the admin build (the repo's strictest gate) both pass.
  `client-portal`'s standing red in this worktree (`Cannot find module '@patina/aesthete-quiz'`,
  an unbuilt dist) is outside this branch, recorded by rounds 1–3.
- **The 201 pre-existing lint warnings were not audited** — only the delta was attributed (zero).
- **Prod untouched.** No `db push`, no deploy, no Strata read, no Sanity write.
- **PostHog not consulted** — event *names* were checked against plan-v2's text and the module
  source; no ingest, dashboard or property schema was verified.
- **`00620`'s legacy studio stamp was not exercised.** Its failure path is what the UI prints and
  n1/R3-02 concern how; its happy path is unobserved by this reviewer.
- **The contrast figure in n3 is arithmetic, not a measured render** — `#A8B5A0` on the paper token,
  computed, not sampled from a browser.
