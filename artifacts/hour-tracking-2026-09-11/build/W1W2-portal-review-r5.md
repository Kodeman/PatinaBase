# W1W2-portal — adversarial review, round 5

**clean = false** (0 blocker · 2 major · 10 minor · 14 note)

Reviewer: separate context from the implementer and from rounds 1–4.
Branch `hour-tracking/portal` @ `3e87ff57f` against `origin/hour-tracking/integration`
@ `04b579bbd` (re-fetched this round; integration has not moved since r4), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.

Commits under review (six):

```
3e87ff57f fix(time): three reads the sheet owned inline become three hooks
0b7a43c62 fix(time): the rows under a total are the rows that made it, and the studio says its name
4ed047205 fix(time): a figure waits for its answer, and the repair refreshes what it repaired
ff2065ed6 fix(time): the Hours sheet reads the document, not the holder's own week
2c83cb4d3 feat(time): W2 UI — four scopes in one sheet, and the studio's hours said plainly
29b72c644 feat(time): W1 portal — the studio rate card, and an hour that says what it is worth
```

Read in full this round: plan-v2 §0 (all 25 rules), §2 (W1 portal table, PostHog table, gates,
Done-when), §3 (W2 portal table, RLS, gates, Done-when); `W1W2-portal-impl.md`;
`W1W2-portal-review-r4.md`; `W1W2-portal-fix-r4.md`; the complete current text of
`hours-ledger.tsx` (1713 lines), `use-viewer-studio.ts`, `open-hours-scope.ts`,
`authority-hours.ts`, `studio-rate-rows.tsx`, `desk-contents.tsx`,
`use-studio-member-rates.ts`, `document-events.ts`'s `time` namespace,
`use-time-tracking.ts`'s key factory + the six W1/W2 hooks, `playwright.hours.config.ts`;
the full three-dot diff of all 28 files; `docs/design/house-sheet/SPEC.md` §A2–A4 and the
live `.t-head`/`.t-meta`/`.t-money` rules in `globals.css:2015-2018`.

> **Diff note, re-confirmed.** Two-dot `git diff integration..portal` shows `00610`–`00613`,
> `internal_time_test.sql`, the grants seed and `database.types.ts` as deletions. They are not:
> integration moved four commits ahead of the merge base `a9841c8de`. Every claim below is
> measured on the **three-dot** diff — **28 files, +3350/−58**, touching no path under `supabase/`.

---

## 1 · Gates — run by this reviewer, verbatim

```
$ pnpm --dir .../agent-portal --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
(no output)                                                     EXIT=0   PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
(no output)                                                     EXIT=0   PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test -- \
    src/lib/document/__tests__/authority-hours.test.ts \
    src/components/document/__tests__/hours-ledger-scope.test.tsx \
    src/components/document/__tests__/desk-contents.test.tsx \
    src/components/document/account/__tests__/studio-rate-rows.test.tsx \
    src/components/document/account/__tests__/account-studio-page.test.tsx \
    src/components/document/people/__tests__/person-profile.test.tsx
Test Suites: 6 passed, 6 total
Tests:       76 passed, 76 total                                EXIT=0   PASS
  — the plan's named W1 spec (authority-hours, 11 cases) and W2 spec
    (hours-ledger-scope, 24 cases) are both in this set.

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test     (FULL sweep)
Test Suites: 575 passed, 575 total
Tests:       7297 passed, 7297 total
Snapshots:   1 passed, 1 total                                  EXIT=0   PASS
  — r4's n11 (a jest-worker SIGSEGV on the untouched desk-claims.test.tsx) did NOT
    reproduce. The sweep is green end to end. n11 is closed as worktree flake.

$ pnpm --dir .../agent-portal --filter @patina/designer-portal lint
✖ 201 problems (0 errors, 201 warnings)                         EXIT=0   PASS (0 errors)
  — unchanged from r4; the diff contributes zero warnings.

$ pnpm --dir .../agent-portal --filter @patina/admin-portal build    (strictest gate)
✓ Compiled successfully in 17.9s
✓ Generating static pages using 13 workers (137/137) in 401ms   EXIT=0   PASS
```

**Post-merge gate — run this round, closing r4's t3.** The branch is still four commits behind
integration and has never been type-checked against W4's regenerated `database.types.ts`
(which turns `project_time_entries.project_id` into `string | null` and adds `studio_id`).
I measured it directly rather than leaving it owed: swapped integration's
`packages/supabase/src/database.types.ts` into the worktree, ran the three type gates, then
restored the file (`git checkout --`; `git status` verified clean afterwards — only the
pre-existing dirty `apps/designer-portal/next-env.d.ts` remains).

```
(integration's database.types.ts in place)
@patina/supabase type-check        EXIT=0  PASS
@patina/designer-portal type-check EXIT=0  PASS
@patina/admin-portal build         EXIT=0  PASS — ✓ Compiled successfully in 21.6s
```

`git merge-tree $(merge-base) portal integration` → **0 conflict markers**. The merge is clean
and the merged tree type-checks. **t3 is closed.**

The DB was **not** reset (this stage does not own it); no `supabase/tests/**` ran; no `psql`
probe; the e2e suite was not re-run (§4).

### Commit hygiene — clean

Six commits, `feat(time):` ×2 and `fix(time):` ×4 — Conventional Commits, no `merge(…)`.
`git show --stat` on each: 12 / 6 / 11 / 7 / 16 / 6 files, all under `apps/designer-portal`,
`packages/supabase/src/hooks`, or the two doc files the plan names.
`git diff --name-only … | grep -E '^supabase/|\.env|artifacts/'` → **empty**, so no migration,
no `generate-legacy-grants.py`, no `db:generate` is owed. `git ls-files -v | grep '^S'` →
`S supabase/config.toml`, still skip-worktree'd and never staged. No `.env.local`, no
`artifacts/` tree, no stray path.

### Ruling spot-checks that PASSED — each measured against the current file, not inherited

- **P-5, no flag.** `grep -cE '^\+.*(useFeatureFlag|ComingSoon|isFeatureEnabled)'` over the
  three-dot diff → **0**.
- **R69, no per-second motion.** `grep -cE '^\+.*(setInterval|requestAnimationFrame|animate-|transition-all|animation:)'` → **0**.
- **D4 / house sheet §A4.** `grep -cE '^\+.*shadow'` → **0**. New hex literals → **0**.
- **No inline `font-size` (§A3).** `grep -cE '^\+.*text-\[[0-9.]+px\]'` over the whole diff → **0**.
  (The semantic half is n2.)
- **Acts ≥ 44px (§A5).** The lens words and the group-by words carry `min-h-11`
  (`hours-ledger.tsx:619`, `:1140`); every `DocumentAction` is `min-h-[44px] min-w-[44px]`
  (`document-action.tsx:54`); `ContentsRow`'s doorway is `min-h-11`.
- **No dashboard, tab bar, badge, red/green pair.** The lens is `scope-lens.tsx`'s Scored-Ink
  idiom generalised to four words — `role="group" aria-label="Hours scope"`, `aria-current`,
  `da-score-on`/`da-score-hover`. No route, no page, no `/hours`, no tabs. The one state
  pigment is `--color-terracotta-ink`; the billed chip is sage-on-pearl, not red/green (t8).
- **HT-26 — never a blank where a rate is pending.** `timeRateProvenance` is total: four arms,
  each with a non-empty `label`, `null` unreachable (`authority-hours.ts:118-152`). Both row
  renderers print `provenance.label` unconditionally (`:1405`/`:1554`).
- **"rate pending" repair doorway is admin-only.** `ratePending && viewerIsOwnerOrAdmin`
  (`:1687`); `PricingStudioLine`'s stamp `!pricingStudioId && viewerIsOwnerOrAdmin &&
  viewerStudioId` (`:1007`); the band's door `showStudioRateDoor={viewerIsOwnerOrAdmin}` (`:669`).
- **HT-8 — the lens is unreachable for a plain member; admins get aggregates.**
  `viewerIsOwnerOrAdmin &&` gates the lens (`:602`) and `ScopeRollup` (`:725`); the landing belt
  (`:495-506`) forces a non-admin to `'mine'` the moment standing is known and holds
  `scope === null` (rendering `Reading…`) until it is, so no gated word is painted mid-load. The
  person-profile door carries the same gate (`person-profile.tsx:812`, `:833`). Pinned both ways.
- **HT-9.** The project scope's fact-view read passes `userId: null` (`:792`), pinned by
  `expect(projectRead).toMatchObject({ projectId: 'project-1', userId: null })`.
- **HT-10-a.** `MemberProjectTotal` → `useProjectHoursTotal` → the DEFINER `project_hours_total`,
  rendered for `lensProjectId && standingKnown && !viewerIsOwnerOrAdmin` (`:714`), distinguishing
  `42501` from any other error, `role="alert"` on both arms, `Reading…` before any figure.
- **HT-30, in order.** In every scope the grand total precedes its buckets and the buckets precede
  the entries (`ScopeRollup:725-763` above the entries block `:765-800`). `MemberProjectTotal`
  captions which figure is which. (The counter-example is M5-02.)
- **HT-36, at the type level.** `StudioHoursRollupRow` carries no `notes`; `TimeEntryLedgerRow`
  carries none. `useTimeEntryNote` is the only reader of `notes`, reads **the table**, one entry
  at a time, behind an explicit act, with `aria-expanded`/`aria-controls`.
- **HT-41 — no role chip on single-role rows.** Absent from both row renderers and pinned absent
  in both (`hours-ledger-scope.test.tsx:544-563`). Correct against plan §4, which assigns the
  multi-role chip to W3 — see t3 for W1's own Done-when.
- **HT-3 — the rate card writes `created_by` = the caller and refuses non-admins.**
  `useSetStudioMemberRate` stamps `created_by: userId` from `auth.getUser()`
  (`use-studio-member-rates.ts:110-118`), exactly what `studio_member_rates_admin_insert`'s
  `WITH CHECK (… AND created_by = auth.uid())` requires. The section is gated
  `canManage && user?.id` (`account-studio-page.tsx:1601`), with RLS the real gate; both arms
  page-level pinned.
- **HT-3-e(2).** `selfAuthoredInert={m.user_id === user?.id && myRole !== 'owner'}`; the copy
  branches on the row's actual `created_by` and treats `created_by IS NULL` as a deleted author.
- **Emitter names match the plan exactly.** `time_entry_logged` (eight props identical to
  §2:267), `time_timer_started`, `time_timer_stopped`, `time_entry_adjusted`,
  `time_entry_deleted`, `time_scope_viewed`, `time_rate_unresolved` (`project_kind`,
  `project_id`, `rate_source`), `time_export_taken` — each spelled as plan-v2 spells it
  (§2:267-268 · §3:417 · §4:550 · §6:725). `time_autostart_disclosed`/`_opted_out` are recorded
  in the module doc comment as owed and deliberately undefined. No inline `posthog.capture`.
- **Every new read is a hook — M4-02 genuinely closed.**
  `git diff … -- apps/ | grep -E "^\+.*\.from\('"` → **0 new raw PostgREST reads in any app
  file**, and every new `useQuery(` in the diff is inside `packages/supabase/src/hooks/` or a
  test stub. `desk-contents.tsx` imports hooks only again (its `QueryClientProvider`,
  `createBrowserClient` and `useQuery` are gone); `hours-ledger.tsx`'s `getSupabase()` count is
  **5**, down from 8, and all five are pre-existing reads the finding explicitly excluded.
  `useProjectPricingStudio` / `useTimeEntryNote` / `useStudioUnbilledTime` keep their keys
  verbatim, so `useStampProjectPricingStudio`'s by-name invalidation still lands.
- **The mock fallback cannot mask a broken query.** `grep -cE '^\+.*(withMockData|mock-data)'`
  over the diff → **0**; `grep -rl withMockData packages/supabase/src` → none. Every money read
  on this surface rethrows and renders `Reading…` or the refusal rather than a zero. The one
  read still failing in silence is `HoursInHandAct` (n7).
- **In-app doors are `<Link>`s.** `grep -cE '^\+.*<a href'` → **0**. Both `/desk?account=studio`
  doors are `next/link` (`hours-ledger.tsx:1703`, `pending-time-authorization-band.tsx:66-72`).
- **No ad-hoc `fetch` to a NestJS service.** `grep -cE '^\+.*[^a-zA-Z]fetch\('` → **0**.
- **`desk-doorway.tsx`'s alias works end to end.** `'sheet'` is in `DOORWAY_KEYS` **and** read
  (`params.get('book') ?? params.get('sheet')`).
- **`playwright.hours.config.ts` carries no literal key** — the stack's keys arrive through
  `PLAYWRIGHT_SUPABASE_*` env vars or the config throws; `loopbackOnly()` refuses any non-
  loopback URL, so the suite cannot be pointed at Strata.

---

## 2 · Findings

### BLOCKER

None. Every gate in the brief's list passes, and no ruling contradiction survived measurement.

### MAJOR

**M5-01 — the onboarding article edit and its Sanity push are absent; plan §3's Done-when
resting on them cannot be met from this branch. CARRIED ×4 (R2-05 → M-02 → M4-01); genuinely
blocked, orchestrator-owed.**
*Severity: major (a named plan §3 portal-table row missing, with its own Done-when).
Confidence: high — re-measured in both checkouts this round.*

Plan §3's portal table asks for
`artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15` (the two
studio-scope sentences the sheet now makes true) plus "push the article to Sanity". Measured
this round:

```
$ ls .../agent-portal/artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/
  No such file or directory (os error 2)
$ git -C <wt> ls-files -- '*15-hours.md*'          →  (empty)
$ git -C <wt> log --all --oneline -- '…/15-hours.md' →  (empty)   # untracked on EVERY ref
$ ls -l /Users/kody/Code/patina-merged/artifacts/…/wave-1/15-hours.md
  1.4k  3 Sep 13:04                                  # the MAIN checkout only
```

The lane's three reasons hold exactly: the file does not exist in this worktree, the only way to
make it exist is to copy an untracked tree out of the main checkout (the git-hygiene landmine
§0.25 bans), and the Sanity write is an external mutation with no session authorization. Plan
§3's Done-when *"the Sanity help article matches what the sheet does"* is **unverified**.

The sharpening from rounds 3–4 is also still owed and still correct: `:15` (*"a designer **or the
studio's first hire** can see … where the week actually went"*) is now **false** — HT-8 gives a
plain member no lens and `00606` gives her her own rows only. That sentence wants **rewriting,
not confirming**.

*Exact fix (orchestrator, not this lane):* either track that file (or name its real home) so a
lane can edit it, or scope the article + Sanity push out of W2 the way HT-35 was scoped out;
then authorize the Sanity write separately. This is the only reason the wave is not clean on
plan-item completeness, and it is not a defect of the implementation.

**M5-02 — the all-time unbilled balance, the pending-authority band, the "Export week →
Accounts" act and the batch-add row all render un-scoped inside every scope, so a studio-wide
money figure and a primary billing act stand under a caption naming one person, and the add row
writes the hour to the viewer. ESCALATED from r4's n4 (minor) on new evidence; the orchestrator
may hold the earlier grading.**
*Severity: major (user-visible money misattribution on a money surface, plus a write that lands
on the wrong person). Confidence: high on the mechanism (code read line by line); medium on the
severity call, which is a reading.*

Four elements sit outside every `scope === …` guard in `hours-ledger.tsx`:

| Element | Line | Keyed on | What it is in a non-`mine` scope |
|---|---|---|---|
| `PendingTimeAuthorizationBand` | `:665-670` | `lensProjectId` only | the **studio's** pending-authority hours (owner reads studio-wide after `00605`/`00606`), listing other documents |
| all-time unbilled balance + **Bill it** | `:803-846` | `['document-hours-unbilled', lensProjectId]`, `lensProjectId` `null` here | a **studio-wide, all-time** money total with a primary billing act |
| **Export week → Accounts** | `:575-597` | the viewer's own week read (`.eq('user_id', me)`) | pre-ticks the **viewer's** week into the composer |
| batch-add row + **Add** | `:916-965` | nothing | `useCreateTimeEntry` writes `user_id = auth.uid()` — **the viewer**, not the person named above |

Concretely: an owner opens Hours from Maria Obi's profile. The sheet reads, top to bottom —
*"Nh pending billing authority"* over documents that are not Maria's; *"Maria Obi · Leah Hartwell
Studio · this week · 6h"*; the entries act; then *"unbilled · all time $4,320 · 28h · 6 documents
[Choose a document…] **Bill it**"*; then a Document/Minutes/Activity row with **Add**. Nothing on
the page says the balance is the studio's-not-Maria's, nor that the add row logs against the
viewer.

Two things make this more than a caption quibble, and are why I moved it off r4's grading:

1. **The write.** The add row is a capture surface with no owner label, directly beneath a
   caption naming someone else. Plan §3's own closing warning (*"One thing the W2 lane must not
   assume"*) is precisely that an admin entering an hour on behalf of a member is a deliberate
   act, not an accident of a shared form — and `00597`'s seat would not fire for it.
2. **HT-30 / §0.23.** *"A total with no rows beneath it is a dashboard and is refused."* In the
   member, project and studio scopes the unbilled balance is now exactly that: a money total
   whose rows are absent, or are a different set entirely. The wave created that situation by
   placing new scopes above pre-existing unscoped content; the balance itself is R77's and
   predates the wave.

*Exact fix (smallest honest one, all in `hours-ledger.tsx`):*
- wrap the batch-add block (`:916-965`) and the "Export week → Accounts" button (`:575-597`) in
  `scope === 'mine' &&` — the only scope whose write and whose week they belong to;
- caption the balance with whose it is (`unbilled · all time · the studio`) or pass the scope's
  own key into `['document-hours-unbilled', …]` (`userId` in the member scope);
- either scope the band the same way or caption it `the studio`.

*Prior grading, stated so the orchestrator can rule:* r4 graded this minor (n4, "medium-high"
confidence, "how a reader reads it is the judgment"). If the orchestrator holds that reading,
this drops to a minor and the wave is clean but for M5-01 — it should be said, not inherited.

### MINOR

**n1 — `ScopeEntryNote` reports any read failure as a permission refusal, and it is the one
error arm on the sheet that cannot actually be one. CARRIED ×2 (r4 n1), unfixed.**
*Confidence: high — `maybeSingle()`'s behaviour under RLS read directly in
`use-time-tracking.ts:947-960`.*
`hours-ledger.tsx:1468-1470` prints *"That note is not yours to read."* on `note.isError`. An RLS
denial on `project_time_entries` returns **no row and no error** — `maybeSingle()` yields
`{ data: null }`, which renders *"No note on this entry."* So the only failures `isError` can see
are network/500/schema-cache, and every one of them is reported to the viewer as a standing
problem. Exactly the class r3's n1 fixed for `MemberProjectTotal`, one component over.
*Fix:* `note.isError` → *"That note could not be read."*; keep `data ?? 'No note on this entry.'`
as the (correct) refusal-and-absence arm.

**n2 — `.t-head` is applied to values, captions, state sentences and link labels; 23 new uses,
and `.t-meta` — the step §A3 assigns to exactly those things — is used zero times. CARRIED ×2
(r4 n2), unfixed.**
*Confidence: high — `SPEC.md:137-140` and `globals.css:2015-2016` read directly, plus the 23 sites.*
`globals.css:2016` — `.t-head` is 11px/500/.08em **with `text-transform: uppercase`**, and
`SPEC.md:140` scopes it to *"running heads only"*. `.t-meta` (`:2015`, 12px/400, sentence case) is
the step for *"values: dates, counts, captions, sub-labels"*. Measured on the three-dot diff:
`t-head` → **23**, `t-meta` → **0**. User-visible consequences:

- `ScopeRollup`'s caption (`:1100`) renders a **person's and a studio's proper name in full
  caps** — *"MARIA OBI · LEAH HARTWELL STUDIO · THIS WEEK"*. Same for `PricingStudioLine`'s
  studio name (`:1000-1006`).
- `ScopeRollup`'s error (`:1152-1160`), `ScopeEntries`' error (`:1310-1320`) and the
  pricing-studio error (`:683-691`) render whole sentences in 11px UPPERCASE. §A3 puts state
  sentences on `.t-body`/`.t-body-sm`, which is what `StudioRateRows`' own error already uses.
- `MemberProjectTotal`'s caption (`:1246`) and `ScopeEntryRow`'s meta line (`:1400`) are captions
  and values respectively.

Graded minor rather than major because the file's **pre-existing** idiom was already
`font-mono text-[11px] uppercase` at the corresponding places (integration
`hours-ledger.tsx:342,354,440,486,518,640,743`), so the conversion preserved the look while
landing the wrong semantic step — it is drift inside the scale, not an escape from it. The
proper-name-in-caps instances are the ones genuinely new.
*Fix:* `.t-body-sm` on the three error paragraphs and on `PricingStudioLine`; `.t-meta` on the
two scope captions and `ScopeEntryRow`'s meta line. Leave `.t-head` on the lens words, the
group-by words and the running heads, where §A3 puts it.

**n3 — the "Billed" chip's text is `--color-sage` on paper, ≈2.1:1, and `ScopeEntryRow`
replicates it into the multiplied studio rows. CARRIED ×2 (r4 n3), unfixed.**
*Confidence: high on the arithmetic (`#A8B5A0` on the paper token, computed not sampled);
the treatment is inherited.*
`hours-ledger.tsx:1420-1432` (new) and `:1592-1604` (pre-existing) set both border and text to
`var(--color-sage)`. Below WCAG AA's 4.5:1 for 11px text, and below even the 3:1 large-text floor.
The studio scope is where these chips multiply.
*Fix:* keep the sage **border** as the state mark and put the label on `--color-charcoal`.

**n4 — a viewer who owns or administers two design studios can only ever read the alphabetically
first one, with no door to the second. CARRIED ×2 (r4 n5), unfixed.**
*Confidence: high — `use-viewer-studio.ts:48-60` returns `candidates[0]` and nothing switches it.*
The r3 fix correctly made the answer deterministic and named; it also made the second studio
unreachable. Everything keyed on it follows: the studio scope's rollup, the member scope's rollup
and entries, and the studio the stamp door offers to name (so on a document whose designer the
*other* studio employs, the door is offered and the server then refuses `42501`). The
implementer's own e2e actor is exactly this viewer.
*Fix:* when `candidates.length > 1`, make the studio name in the caption a Scored-Ink word that
cycles the candidates; or rule that one studio per viewer is the world and have `useViewerStudio`
return the count so the sheet can say *"(1 of 2 studios)"* rather than silently picking.

**n5 — the same-day upsert rewrites `created_by` on a row another admin authored, and overwrites
that day's rate in place, in a table the module documents as append-only. CARRIED ×2 (r4 n6),
unfixed.**
*Confidence: high on the mechanism; low on money impact, which r4 could not construct and neither
could I.*
`use-studio-member-rates.ts:108-121` upserts `onConflict: 'studio_id,user_id,effective_from'` with
`created_by: userId`. A second save the same day takes the UPDATE path, whose policy
(`studio_member_rates_admin_update`) checks only `is_org_admin_or_owner(studio_id)` and does not
re-assert `created_by = auth.uid()` — so the row's recorded author silently becomes whoever
corrected it, and the earlier figure for that day is gone from the history.
*Fix:* either state the same-day-correction behaviour in the card's help line ("a second figure
today replaces today's row"), or drop `created_by` from the upsert payload so a correction leaves
the original author standing.

**n6 — `HoursInHandAct` offers "hours to bill →" into the invoice composer to a viewer who may
not be able to invoice. CARRIED ×2 (r4 n7), unfixed.**
*Confidence: medium.* `desk-contents.tsx:113-137` renders the act whenever
`useStudioUnbilledTime()` returns any row. After `00606` a plain member reads her own unbilled
rows, so she is offered the composer on the Desk's one act-bearing line. (The sheet's "Bill it"
has the same shape, so this is propagation, not invention.)
*Fix:* gate the act on `useViewerStudio().isOwnerOrAdmin`, falling back to `openLedger('hours')`.

**n7 — `HoursInHandAct` is the one money read on this program's surfaces that still fails in
silence. CARRIED ×2 (r4 n8), unfixed, and now one layer further from view.**
*Confidence: high.* `desk-contents.tsx:79` destructures `{ data: unbilled }` from
`useStudioUnbilledTime()` and never reads `isError`: a denied or failed `project_unbilled_time`
read leaves `unbilled` undefined, `(unbilled?.length ?? 0) === 0`, and the act simply does not
render — indistinguishable from "nothing to bill". Round 2's R2-02 made every other unanswered
money read on the Hours sheet say so. The r4 fix moved the read into a hook, which is correct, but
the hook's `isError` is now discarded at the call site rather than absent from it.
*Fix:* it is a Desk index line, so a terracotta sentence is wrong there — render nothing on
`isPending` and the neutral `openLedger('hours')` door (*"hours →"*) on `isError`, so a failed
read still leaves the sheet reachable.

**n8 — three coverage gaps the plan's own assertions name. CARRIED ×2 (r4 n9 / r3 t5), unfixed.**
*Confidence: high — `grep` over all three spec files this round.*
(a) **"rate pending" is never asserted to RENDER in the sheet** — `grep -rn "rate pending"` over
`apps/designer-portal/src` finds it only in `authority-hours.test.ts:166,175` (a unit test of a
pure function) and in two comments. HT-26's user-visible half rests on nothing.
(b) the `EntryRow` rate-pending repair block's `viewerIsOwnerOrAdmin` gate (`:1687`) — nothing
asserts a plain member is **not** offered it.
(c) `PricingStudioLine`'s stamp-door absence for a non-admin — the spec only asserts absence when
a studio *is* named.
*Fix:* three cases in `hours-ledger-scope.test.tsx` — a `rate_source: 'none'` week entry renders
the words "rate pending" and, with `viewerRole = 'member'`, renders neither repair act.

**n9 — the Desk's unbilled key is invalidated by nothing, so the one act-bearing line on the
index goes stale for five minutes after every hour logged, deleted or billed. NEW.**
*Confidence: high — key factory and every `invalidateQueries` call site read directly.*
`use-time-tracking.ts:58` defines `studioUnbilled: () => ['desk-contents-unbilled-time']`. It is
referenced in exactly two places in the whole repo — its own definition and its own
`useQuery` (`:265`). `timeKeys.all` is `['time']` (`:40`), so neither
`invalidateProjectTime()` (`:199-203`) nor any mutation in the module reaches it, and the app's
client sets `staleTime: 5 minutes` with `refetchOnWindowFocus: false`
(`apps/designer-portal/src/lib/react-query.ts:177,194`). Consequences: after a studio bills its
last unbilled hour the Desk keeps offering *"hours to bill →"* for up to five minutes, and the
click hands `openInvoiceComposer` a stale `initialTimeEntryIds` list of already-invoiced ids —
`claim_time_entries` then returns fewer ids than asked and the composer's partial-claim detection
rolls the whole draft back. This is the wave's own work (`HoursInHandAct` is new in `2c83cb4d3`)
and it breaches `patina-portal-features`' stated quality bar (*"Every mutation invalidates its
list key plus each cross-domain key it changes"*).
*Fix:* add `queryClient.invalidateQueries({ queryKey: timeKeys.studioUnbilled() })` to
`invalidateProjectTime()` in `use-time-tracking.ts:199-203` — one line, and it covers create,
update, delete and claim.

**n10 — the sheet prints one figure and the invoice bills another on a legacy row. CARRIED ×4
(t14 → n10); documented in the matrix, not fixed.**
*Confidence: high.* `hours-ledger.tsx:1501` — `amountCents = e.rated_amount_cents ??
unbilled?.amount_cents ?? 0` — while the composer reads `project_unbilled_time.amount_cents`.
Plan §3 asks BIL-08 be reopened *"as the rate-display drift, not as absence"*, and the matrix
entry now says exactly that, so **the plan item is satisfied**; the underlying two-answer defect
closes at W0's `00596` ("one rate source") and its owed ruling **HT-6-a**. Recorded so it is not
lost in a doc cell. (Related, pre-existing and outside this diff: the unbilled read at `:270-274`
never selects `rated_amount_cents`, so the `row.rated_amount_cents ??` preference at `:306`/`:317`
is inert — it is integration's code, not this branch's, and is noted only so a later hand knows.)

### NOTE

**t1 — HT-35's disclosure band, per-member opt-out and two emitters are absent.**
Orchestrator-scoped (2026-09-13) to **stage 4, lane B, with W7** — a note by this round's brief,
never a major. `document-events.ts:177-190` records the scoping in place alongside the three
non-existent candidate columns (`user_settings`, `profiles`, `profiles.help_state`). Plan §3's
Done-when *"the disclosure band appears once for a fresh member and never again"* stays
unverifiable until that stage.

**t2 — W4's portal follow-commits are stage 4, and one of them is visible.** `00613`'s ledger
view admits project-less internal rows, and `ScopeEntryRow:1402` renders
`row.project_name ?? 'Project'` — so an internal hour with no project prints the literal word
**"Project"** as its document. One string, owed to the stage that lands the W4 portal work.

**t3 — ruling owed: which wave carries W1's Done-when #5.** Plan §2's Done-when reads *"A
two-role member's ledger row prints the role they picked."* No role prints, and the spec pins its
absence. Plan §4 (W3) explicitly owns *"a **role chip** on the log strip, **the ledger entry
rows** and the ⌘K verb, shown only when the member holds more than one live roster role"* — so
the two plan sections disagree. The implementation follows §4 (and HT-41's "only when more than
one", which needs the live roster-role count W3 fetches), which I judge the right reading; it
should be said out loud rather than left as a Done-when nobody can tick.

**t4 — HT-11 is unsatisfied in two files this lane edited; plan §4 assigns it to W3. CARRIED ×4.**
The ledger's batch-add row (`hours-ledger.tsx:916-965`) is a capture surface with no `billable`
control, and `useCreateTimeEntry` still writes `billable: input.billable ?? true`. HT-11 ruled
"yes to both"; plan-v2:467 lists HT-11 among **W3's** ruled inputs and :497 makes `p_billable =
NULL` raise once every surface carries the control. Ownership note, not a defect of this lane.

**t5 — ruling owed: HT-29 shipped as "the row always, the act sometimes". CARRIED ×4.**
`desk-contents.tsx:330-341` hangs `HoursInHandAct` beneath an Hours doorway row that still renders
unconditionally; plan §3 reads *"act-bearing or absent"*. Removing the row would make the Hours
sheet unreachable from the Contents index, so the gap is Kody's question. The impl report's
judgment call #1 covers the *figure* half correctly (R95 forbids a count there) and not the
*absent* half.

**t6 — ratification owed: the copy deck documents the alias instead of being rewritten. CARRIED ×4.**
Plan §3 says rewrite `?sheet=hours` → `?book=hours` at `copy-deck.md:357,379,627`; the lane added
a Conventions bullet naming both spellings and pointing at the seeded templates
(`packages/email/src/templates/onboarding-hours.tsx`, migrations `00293`/`00310`/`00404`) that
carry the live string. The Done-when (*"the copy deck no longer disagrees with the code"*) is
satisfied by the doorway accepting both, verified end to end. Sound reasoning, real evidence,
still a deviation from a plan line.

**t7 — architect choice, re-confirmed: the rate card lives on `account-studio-page.tsx`
(`/desk?account=studio`), not `/preferences` and not the People Room. CARRIED ×4.** Plan §2
makes this choice explicitly against HT-3's parenthetical and asks it be flagged. Implemented as
planned.

**t8 — ruling owed: HT-40's second clause against the chip in the multiplied rows. CARRIED ×2.**
HT-40 reads *"Keep it as built … **Do not add colour-coding when the studio scope multiplies
rows**."* The chip as built colour-codes billed (`--color-sage`) against unbilled
(`--color-pearl`), and `ScopeEntryRow` carries that pair into the studio scope — i.e. the
treatment was kept and the scope multiplied. Whether "keep it as built" or "do not colour-code
when multiplied" wins is Kody's. (n3 is the separate contrast fact, which holds either way.)

**t9 — `timeRateRoleLabel` is a dead export in production code. CARRIED ×4.**
`authority-hours.ts:99-103` and its test, nothing else. Deliberate (W3 needs it); recorded so
nobody "cleans it up" first.

**t10 — `timerStarted` / `timerStopped` / `exportTaken` are defined with no call site. CARRIED ×4.**
Plan-v2 owns all three names in later waves (§4:550, §6:725) and this lane is the file's sole
writer for the phase, so landing the vocabulary early is the cheaper ordering. Worth repeating:
the `Export week → Accounts` button in this very file is **not** `time_export_taken`'s call site
— it opens the composer, it does not hand hours out as a file — so W5 must add its own.

**t11 — `lensWords.length > 1` is a dead guard. CARRIED ×3.** `hours-ledger.tsx:602`. `lensWords`
always contains `'mine'` and `'studio'`, so the test is always true and the lens's visibility
rests on `viewerIsOwnerOrAdmin` alone.

**t12 — `rateUnresolvedSeen` never clears. CARRIED ×3.** `document-events.ts:39` — a module-level
`Set<string>` keyed on `entry_id` with no eviction, so the dedup is per module lifetime. That is
what the doc comment promises; the growth is one short string per unpriced entry seen.

**t13 — the `['studio-member-rate', userId]` entity key has no reader. CARRIED ×3.**
`use-studio-member-rates.ts:49` defines it and `:120` invalidates it; nothing queries it. Plan
§2:252 specifies both keys, so this is the plan's shape faithfully implemented; noted so a later
hand knows the entity read was never built.

**t14 — the sheet is 1713 lines, from 751.** `hours-ledger.tsx` carries the ledger, the lens,
four scopes, six sub-components and five pre-existing raw reads in one module. Nothing is wrong
with it; it is the next file someone will be afraid to touch, and W3 has a follow-commit landing
in it (§11). Worth a deliberate split (`hours-scope/` — `scope-rollup.tsx`, `scope-entries.tsx`,
`pricing-studio-line.tsx`) before W3 rather than after.

---

## 3 · Plan-item ledger (W1 + W2 portal tables)

| Plan item | Status |
|---|---|
| §2 · `use-time-tracking.ts` — `rate_source`/`rate_role` on the type, `rateRole?` on `CreateTimeEntryInput`, no rate sent + asserted | **present** (lane A) |
| §2 · `use-studio-member-rates.ts` create, keys + invalidation set | **present**, keys exactly as specified; n5 open |
| §2 · `hooks/index.ts` + package index export | **present** (extended again by the r4 fix) |
| §2 · `account-studio-page.tsx` — "Studio rates" section, blur-save, owner/admin only, dated history | **present**; gate pinned both ways |
| §2 · `studio-rate-rows.tsx` create | **present**; controlled field, both restore arms pinned |
| §2 · `hours-ledger.tsx` — rate + rate-source column, "rate pending", never blank | **present**; n8(a) unpinned in the sheet |
| §2 · `authority-hours.ts` — `timeRateProvenance` never `null`, discriminated, carries source + role | **present**, 4 unit cases |
| §2 · `pending-time-authorization-band.tsx` + the `pending_authorization` read become a doorway | **present** |
| §2 · PostHog `time_entry_logged` / `time_rate_unresolved` | **present**, real props, both call sites (own week + scoped rows) |
| §2 · Done-when "a two-role member's row prints the role they picked" | **not met at this wave** — plan §4 assigns the chip to W3 (t3) |
| §3 · `hours-ledger.tsx` — four-scope lens, absent for non-admins, no `user_id` AND on the project path, totals above rows, studio money, `— internal —` group, chip unchanged | **present**; M5-02, n2, t8 open |
| §3 · `use-time-tracking.ts` — `useStudioTimeReport` deleted, `useStudioHoursRollup` + `useTimeEntryLedger` added | **present** (lane A); `enabled` guard added |
| §3 · `person-profile.tsx` — an "Hours" act, the only door to the member scope | **present**, gated, pinned both ways; t15 below |
| §3 · `desk-contents.tsx` — the Hours line act-bearing or absent | **present**; t5 (ruling), n6, n7, n9 open |
| §3 · `document-time-provider.tsx` — HT-35 disclosure band | **ABSENT** — stage 4 (t1) |
| §3 · `account-profile-page.tsx` — HT-35 opt-out | **ABSENT** — stage 4 (t1) |
| §3 · `desk-doorway.tsx` — `sheet` as an alias of `book` | **present**, end to end |
| §3 · `copy-deck.md:357,379,627` | **deviation** — documented, not rewritten (t6) |
| §3 · `15-hours.md:9,15` + the Sanity push | **ABSENT / BLOCKED** (M5-01) |
| §3 · `portal-vs-desk-feature-gap-matrix-v2.md:189,193` — BIL-04 closed, BIL-08 reopened as drift | **present** (n10) |
| §3 · `hours-ledger-scope.test.tsx` (new) | **present**, 24 cases; n8 gaps |
| §3 · `e2e/document/hours.spec.ts` (new) | **present**, 128 lines + a derived, key-free config; not re-run here (§4) |
| §3 · `studio_hours_rollup` return shape has no `notes` | **present** at the type level (`StudioHoursRollupRow`); the SQL `\d+` assert is lane A's |

---

## 4 · What this review did NOT verify

- **No `supabase db reset`, no SQL test run, no `psql` probe.** This stage does not own the DB.
  Lane A's coverage of `00598`–`00607` / `00615` / `00620` is taken as given; `00604`'s ledger
  view, `00606`'s `stamp_project_pricing_studio` and `00607`'s rollup were **read** to ground the
  UI claims, not executed. No row-level claim here rests on a SELECT.
- **The e2e suite was not re-run.** Not in this round's gate list; port 3000 is contended with the
  peer people-room program and this stage was not named its owner. I read `hours.spec.ts` and
  `playwright.hours.config.ts` and judge them sound (loopback-only guard, keys-required-with-URL
  guard, chromium found by name, no literal key). `W1W2-portal-fix-r2.md`'s *5 passed, chromium,
  :3100 against 127.0.0.1:54421* is accepted on the implementer's evidence. Two caveats of that
  green stand: chromium only, and the 44px loop covers the **lens** buttons only.
- **No browser walk, no screenshots, no live-mode render by this reviewer.** The only runtime
  evidence for this wave remains the implementer's SELECT walk (`W1W2-portal-impl.md` §3) and that
  e2e run; neither was re-executed here. In particular the person-profile → Hours door's runtime
  path (`openHoursForMember` dispatching `document:open-ledger` and `StudioDrawer` hearing it over
  the People Room) is proved only at the module-contract level by jest — owed to the prod/local walk.
- **`packages/supabase` lint not run** — per `patina-verification` no resolvable ESLint flat config
  exists outside designer-portal, so its result would mean nothing. `packages/supabase`'s vitest
  suite was not re-run this round (r4 measured 1255 passed / 12 skipped).
- **client-portal / manufacturer-portal type gates not run.** Nothing in the diff touches them;
  `@patina/supabase type-check` and the admin build (the repo's strictest gate) both pass, twice —
  once on the branch tree and once against integration's `database.types.ts`.
- **The 201 pre-existing lint warnings were not audited** — only the delta was attributed (zero).
- **Prod untouched.** No `db push`, no deploy, no Strata read, no Sanity write.
- **PostHog not consulted** — event *names* and prop shapes were checked against plan-v2's text and
  the module source; no ingest, dashboard or property schema was verified.
- **`00620`'s legacy studio stamp was not exercised.** Its failure path is what the UI prints
  (n1/PricingStudioLine's inline note concern how); its happy path is unobserved by this reviewer.
- **The contrast figure in n3 is arithmetic, not a measured render.**
- **The post-merge measurement was a file swap, not an actual merge.** I replaced
  `packages/supabase/src/database.types.ts` with integration's copy, ran the three gates, and
  restored it; `git merge-tree` separately reports 0 conflicts and no path overlaps. That is
  strong evidence the merge is safe, but the merge itself was not performed.
