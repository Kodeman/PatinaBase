# W1W2-portal — adversarial review, round 6

**clean = false** (0 blocker · 1 major · 8 minor · 17 note)

Reviewer: separate context from the implementer and from rounds 1–5.
Branch `hour-tracking/portal` @ `c68c16d8e` against `origin/hour-tracking/integration`
@ `04b579bbd`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.

Commits under review (seven):

```
c68c16d8e fix(time): the scopes keep only what is theirs — a guard, a chip, a door and an invalidation
3e87ff57f fix(time): three reads the sheet owned inline become three hooks
0b7a43c62 fix(time): the rows under a total are the rows that made it, and the studio says its name
4ed047205 fix(time): a figure waits for its answer, and the repair refreshes what it repaired
ff2065ed6 fix(time): the Hours sheet reads the document, not the holder's own week
2c83cb4d3 feat(time): W2 UI — four scopes in one sheet, and the studio's hours said plainly
29b72c644 feat(time): W1 portal — the studio rate card, and an hour that says what it is worth
```

Read in full this round: plan-v2 §0 (all 25 rules + the HT-10-a amendment), §2 (W1 portal table,
RPC signature, RLS, PostHog table, tests, gates, Done-when), §3 (W2 portal table, RLS, tests,
gates, Done-when); `W1W2-portal-impl.md`; `W1W2-portal-review-r5.md`; `W1W2-portal-fix-r5.md`;
the complete current text of `hours-ledger.tsx` (1761 lines), `desk-contents.tsx`,
`use-viewer-studio.ts`, `open-hours-scope.ts`, `authority-hours.ts`, `studio-rate-rows.tsx`,
`use-studio-member-rates.ts`, `document-events.ts`'s `time` namespace and its canonical-name
comment, `use-time-tracking.ts`'s key factory + the six new hooks, `playwright.hours.config.ts`
and `playwright.config.ts`'s `webServer`, `e2e/document/hours.spec.ts`,
`hours-ledger-scope.test.tsx` (945 lines, 31 cases); the full three-dot diff of all 28 files;
`docs/design/house-sheet/SPEC.md` §A3/§A5 against the live `.t-*` rules in `globals.css:2014-2017`.

> **Diff note.** Two-dot `git diff integration..portal` shows `00610`–`00613`,
> `internal_time_test.sql`, the grants seed and `database.types.ts` as deletions. They are not:
> integration is four commits ahead of the merge base. Every claim below is measured on the
> **three-dot** diff — **28 files, +3670/−66**, touching no path under `supabase/`.
> `git merge-tree` on the merge base → **0 conflict markers**.

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
    src/components/document/__tests__/hours-ledger-scope.test.tsx \
    src/components/document/__tests__/desk-contents.test.tsx \
    src/lib/document/__tests__/authority-hours.test.ts \
    src/components/document/account/__tests__/studio-rate-rows.test.tsx \
    src/components/document/account/__tests__/account-studio-page.test.tsx \
    src/components/document/people/__tests__/person-profile.test.tsx
PASS src/components/document/account/__tests__/studio-rate-rows.test.tsx
PASS src/lib/document/__tests__/authority-hours.test.ts
PASS src/components/document/people/__tests__/person-profile.test.tsx
PASS src/components/document/account/__tests__/account-studio-page.test.tsx
PASS src/components/document/__tests__/hours-ledger-scope.test.tsx
PASS src/components/document/__tests__/desk-contents.test.tsx
Test Suites: 6 passed, 6 total
Tests:       85 passed, 85 total                                EXIT=0   PASS
  — the plan's named W1 spec (authority-hours.test.ts) and W2 spec
    (hours-ledger-scope.test.tsx, 31 cases) are both in this set. 76 → 85 since r5.

$ pnpm --dir .../agent-portal --filter @patina/designer-portal lint
✖ 201 problems (0 errors, 201 warnings)                         EXIT=0   PASS (0 errors)
  — unchanged from r5; the diff contributes zero warnings.

$ pnpm --dir .../agent-portal --filter @patina/admin-portal build     (the repo's strictest gate)
✓ Compiled successfully in 22.6s
  Finished TypeScript in 18.0s
✓ Generating static pages using 13 workers (137/137) in 677ms   EXIT=0   PASS
```

The DB was **not** reset and no `supabase/tests/**` ran (this stage does not own the DB), per the
brief.

### Commit hygiene — clean

Seven commits: `feat(time):` ×2, `fix(time):` ×5 — Conventional Commits, no `merge(…)`.
`git show --stat` per commit: 12 / 6 / 11 / 7 / 16 / 6 / 5 files, all under
`apps/designer-portal`, `packages/supabase/src/hooks`, or the two doc files plan §3 names.
`git diff --name-only … | grep -E '^supabase/|\.env|^artifacts/'` → **empty**, so no migration,
no `generate-legacy-grants.py`, no `db:generate` is owed. `git ls-files -v | grep '^S'` →
`S supabase/config.toml`, still skip-worktree'd and never staged. Working tree carries only the
pre-existing dirty `apps/designer-portal/next-env.d.ts`.

### M5-02 — discharged, and pinned

The brief's check, measured line by line in `hours-ledger.tsx` and confirmed by the spec:

| Element | Guard now | Line |
|---|---|---|
| `Export week → Accounts` | `scope === 'mine' &&` | `:576` |
| `PendingTimeAuthorizationBand` | `scope === 'mine' &&` | `:672` |
| all-time unbilled balance + **Bill it** | `scope === 'mine' && unbilledMinutes > 0 &&` | `:820` |
| batch-add row + **Add** | `scope === 'mine' &&` | `:937` |

Also newly `scope === 'mine'`-gated and correct: `LedgerFrontMatter` (`:647`), the zero-entries
teaching state (`:876`), `days.map` (`:903`).

In the **project** scope the only figure that renders is `ScopeRollup`'s grand total, and its own
buckets are listed directly beneath it (`ScopeRollup:1130-1230`), with the fact-view entries one
act below that — a total above its own rows, HT-30 satisfied. The all-time balance is hidden there
deliberately, with the reasoning in a code comment at `:811-819`; the reading in fix-r5 §1.2 is
sound and I could not refute it.

Pinned in `hours-ledger-scope.test.tsx:818-908`: three cases — all four absent in the member scope
and all four back on `mine`; no balance in the project scope; a plain member keeps all four.

### Ruling spot-checks that PASSED — each re-measured against the current tree

- **P-5, no flag.** `grep -cE '^\+.*(useFeatureFlag|ComingSoon|isFeatureEnabled)'` over the
  three-dot diff → **0**.
- **R69, no per-second motion.** `grep -cE '^\+.*(setInterval|requestAnimationFrame|animate-|transition-all|animation:)'` → **0**.
- **House sheet §A4 / D4.** `grep -cE '^\+.*(shadow|#[0-9a-f]{6})'` → **0**.
- **No inline font-size utilities (§A3).** `grep -cE '^\+.*text-\[[0-9.]+(px|rem)\]'` over the
  whole diff → **0**. Every inline size still in the file is pre-existing
  (confirmed against `git show integration:…`). The *semantic* half is n2 below.
- **Acts ≥ 44px (§A5).** Lens words and group-by words carry `min-h-11` (`:626`, `:1157`); every
  `DocumentAction` is `min-h-[44px] min-w-[44px]`; `ContentsRow`'s doorway is `min-h-11`. The
  rate field is a form control, not an act, and matches the page's own `FIELD` idiom
  (`account-studio-page.tsx:143`) — no §A5 claim on it.
- **No dashboard, tab, badge, red/green.** No route, no page, no `/hours`, no tab bar. The lens is
  `scope-lens.tsx`'s Scored-Ink idiom generalised to four words. The one state pigment is
  `--color-terracotta-ink`; the billed chip is now charcoal-on-paper with a sage border (n3 fixed).
- **HT-26 — never a blank where a rate is pending.** `timeRateProvenance` is total: four arms, each
  with a non-empty label, `null` unreachable (`authority-hours.ts:114-153`). Both row renderers
  print `provenance.label` unconditionally (`:1430`, `:1603`).
- **The "rate pending" repair doorway is admin-only.** `ratePending && viewerIsOwnerOrAdmin`
  (`:1711`); `PricingStudioLine`'s stamp `!pricingStudioId && viewerIsOwnerOrAdmin && viewerStudioId`
  (`:1032`); the band's door `showStudioRateDoor={viewerIsOwnerOrAdmin}` (`:676`).
- **HT-8 — the lens is unreachable for a plain member; admins get aggregates.**
  `viewerIsOwnerOrAdmin &&` gates the lens (`:602`) and `ScopeRollup` (`:730`); the landing belt
  (`:495-506`) forces a non-admin to `'mine'` once standing is known and holds `scope === null`
  (rendering `Reading…`) until it is, so no gated word is painted mid-load. The person-profile door
  carries the same gate (`person-profile.tsx:808`, `:833`). Pinned both ways.
- **HT-9.** The project scope's fact-view read passes `memberId: null` / `userId: null` (`:797`),
  pinned by `expect(projectRead).toMatchObject({ projectId: 'project-1', userId: null })`.
- **HT-10-a.** `MemberProjectTotal` → `useProjectHoursTotal` → the DEFINER `project_hours_total`,
  rendered for `lensProjectId && standingKnown && !viewerIsOwnerOrAdmin` (`:722`), distinguishing
  `42501` from any other error, `role="alert"` on both arms, `Reading…` before any figure.
- **HT-36, at the type level.** `StudioHoursRollupRow` and `TimeEntryLedgerRow` carry no `notes`.
  `useTimeEntryNote` is the only reader of `notes`, reads **the table**, one entry at a time, behind
  an explicit act, with `aria-expanded`/`aria-controls`.
- **HT-41 — no role chip on single-role rows.** Absent from both row renderers and pinned absent.
- **HT-3 — the rate card writes `created_by` = the caller and refuses non-admins.**
  `useSetStudioMemberRate` stamps `created_by: userId` from `auth.getUser()`
  (`use-studio-member-rates.ts:112-119`), exactly what `studio_member_rates_admin_insert`'s
  `WITH CHECK (… AND created_by = auth.uid())` requires. The section is gated `canManage && user?.id`
  (`account-studio-page.tsx:1601`), with RLS the real gate; both arms page-level pinned.
- **HT-3-e(2).** `selfAuthoredInert={m.user_id === user?.id && myRole !== 'owner'}`; the copy
  branches on the row's actual `created_by` and treats `created_by IS NULL` as a deleted author.
- **Emitter names match the plan exactly.** `grep 'track("time_'` →
  `time_entry_logged`, `time_timer_started`, `time_timer_stopped`, `time_entry_adjusted`,
  `time_entry_deleted`, `time_scope_viewed`, `time_rate_unresolved`, `time_export_taken` — each
  spelled as plan-v2 spells it (§2:267-268 · §3:417 · §4:550 · §6:725).
  `time_autostart_disclosed`/`_opted_out` are recorded in the module doc comment as owed and
  deliberately undefined. No inline `posthog.capture` anywhere in the diff.
- **Every new read is a hook.** `git diff … -- apps/ | grep -cE "^\+.*\.from\('"` → **0**; every new
  `useQuery(` in the diff is inside `packages/supabase/src/hooks/` or a test stub.
- **The mock fallback cannot mask a broken query.** `grep -cE '^\+.*withMockData'` over the diff →
  **0**; `grep -rl withMockData packages/supabase/src` → none, so none of the six new hooks can
  fall back. Every money read on this surface rethrows and renders `Reading…` or a refusal rather
  than a zero. (The remaining DATA_MODE hazard is at the e2e-config level — n6-01.)
- **In-app doors are `<Link>`s.** `grep -cE '^\+.*<a href'` → **0**. Both `/desk?account=studio`
  doors are `next/link` (`hours-ledger.tsx:1728`, `pending-time-authorization-band.tsx:66-72`).
- **No ad-hoc `fetch` to a NestJS service.** `grep -cE '^\+.*[^a-zA-Z]fetch\('` → **0**.
- **n9's invalidation is real.** `invalidateProjectTime` now reaches `timeKeys.studioUnbilled()`
  (`use-time-tracking.ts:204-209`), covering create / update / delete / claim in one line.
- **`playwright.hours.config.ts` carries no literal key** — the stack's keys arrive through
  `PLAYWRIGHT_SUPABASE_*` or the config throws; `loopbackOnly()` refuses any non-loopback URL.

---

## 2 · Findings

### BLOCKER

None. Every gate in the brief's list passes, and no ruling contradiction survived measurement.

### MAJOR

**M6-01 — the sheet's header prints the VIEWER's own "Today ·" / "Week ·" minutes in every scope,
so in the member, project and studio scopes a week total that is nobody-says-whose stands two lines
above a caption and a total naming someone else. NEW — the fifth element of M5-02, missed by the
r5 fix's four.**
*Severity: major (a user-visible money/time misattribution on a money surface, introduced by this
wave's scopes). Confidence: **high** on the mechanism — rendered and logged, below; **medium** on
the severity call, which is the same reading M5-02 rested on and which the orchestrator may
likewise hold at minor.*

`hours-ledger.tsx:544-570` — the `<h2>Hours · {weekLabel}</h2>` and the `<p>` beneath it carrying
`Today · {fmtMinutes(todayMin)} · Week · {fmtMinutes(weekMin)}` plus the ‹ earlier / later ›
paging sit **outside every `scope ===` guard**. `todayMin` (`:352`) and `weekMin` (`:355`) are both
reduced from `entries`, which is the week read at `:193` — `.eq('user_id', userData.user.id)`, the
**viewer's** rows, further narrowed by `lensProjectId` when one is in hand. The r5 fix wrapped the
export button in the same flex row (`:576`) and left the figures beside it unwrapped.

Measured, not inferred. A throwaway spec built on the wave's own harness
(`hours-ledger-scope.test.tsx`'s stubs), run and then deleted (`git status` clean afterwards):

```
HEADER:   Hours · this week || Today · 0 min  ·  Week · 0 min‹ earlier
          || ROLLUP: Maria Obi · Leah Mbeki Studio · this week
                     3h 00m · $300 billable 2 entries …
HEADER-P: Hours · this week· one document all documents ×
          || Today · 0 min  ·  Week · 0 min‹ earlier
```

So in the member scope the sheet reads, top to bottom: *"Hours · this week / Today · 0 min ·
**Week · 0 min**"*, then *"Maria Obi · Leah Mbeki Studio · this week / **3h 00m** · $300 billable"*.
Two "this week" figures, ~40px apart, for two different people, and only the lower one is
captioned. With a real viewer's own hours in the week the upper figure is non-zero and reads as
Maria's larger total with 3h a subset of it.

The project scope is the sharper case, and it is HT-9's own: an owner opens a house she has logged
nothing on. The header is project-filtered *and* user-filtered, so it prints **"Week · 0 min"**
under the document's name, directly above `ScopeRollup`'s *"this document · this week · 12h 30m"*.
Two answers to one question on one screen, the top one wrong.

This is exactly the class the orchestrator graded major in M5-02 — *"the wave created that situation
by placing new scopes above pre-existing unscoped content"*. Both figures are pre-existing
(`integration:hours-ledger.tsx:356,358`); the scopes above them are not.

*Exact fix (smallest honest one, `hours-ledger.tsx:551-557`):* keep the paging (it governs the
window in every scope) and gate only the two figures —

```tsx
{scope === 'mine' && (
  <>
    {weekOffset === 0 && (<>Today · {fmtMinutes(todayMin)} &nbsp;·&nbsp; </>)}
    Week · {fmtMinutes(weekMin)}
  </>
)}
```

— or, if the figures are wanted everywhere, caption them as the viewer's
(`yours · this week · {fmtMinutes(weekMin)}`). Pin it with one case in the M5-02 describe block:
open on the member scope, assert `Week · 0 min` is absent (or reads "yours"), click `mine`,
assert it returns.

### MINOR

**n6-01 — `playwright.hours.config.ts` documents `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` but
does not set it, so the one gate that could catch a silently-denied scope lens can run in `auto`
and render mock numbers. NEW.**
*Confidence: high — both configs' `webServer.env` blocks read directly.*
The config's doc comment (`:30`) tells the operator to export it on the command line; neither
`playwright.hours.config.ts`'s `webServer.env` (`:96`, `{...baseWebServer?.env, ...stackOverride}`)
nor `playwright.config.ts`'s (`:103-123`) contains the key. §0.24 is explicit that the mock fallback
serves mock data on **any** thrown error including an RLS denial — which is precisely the failure a
scope-lens e2e exists to catch. A future run that forgets the export is green and means nothing.
*Fix:* add `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE: 'live'` to `playwright.hours.config.ts`'s
`webServer.env` object, so the gate cannot be run wrong.

**n6-02 — in the `mine` scope the all-time unbilled balance and its **Bill it** act are, for an
owner or admin, the **studio's** money under the lens word "mine". NEW (the un-addressed half of
M5-02's own reading).**
*Confidence: high on the mechanism; the grading is a reading.*
`hours-ledger.tsx:820-870` is now `scope === 'mine' &&`-gated, but the read behind it
(`['document-hours-unbilled', lensProjectId]`, `:263-277`) carries **no user filter** — after
`00605`/`00606` an owner reads every unbilled row RLS lets her see. The file's own doc comment says
so (`:11-13` — *"the **studio's** unclaimed hours as money"*). Billing a teammate's hours is
intended (§0.17, HT-22), so the act is right; the **word above it** is not. fix-r5 §1.2 rejected the
flat caption `· the studio` because it would be wrong for a plain member — correct, and the
conditional form it did not consider is the fix.
*Fix:* caption on standing — `unbilled · all time{viewerIsOwnerOrAdmin ? ' · the studio' : ''}` —
one expression at `:825`, pinned with the existing owner/member harness.

**n6-03 — the studio scope keeps a document's name in the header and that document's authority band
above a studio-wide total. NEW.**
*Confidence: high — reachable by clicking `the studio` with a document in hand.*
`lensName` (`:528`) and `ProjectAuthorityBandForProject` (`:687-689`) are keyed on `lensProjectId`
alone, and `lensProjectId` survives a switch to the studio scope (only the `all documents ×` handler
and the member-scope event clear it). So an owner who opened Hours from a document and then clicked
`the studio` reads *"Hours · this week · Cedar Lane Study"* plus that document's authority readout
over a rollup called with `projectId={null}` — the whole studio. Graded minor rather than major
because `ScopeRollup`'s own caption says *"the studio · {studioName} · this week"*, so the total is
labelled even though the header is not.
*Fix:* either clear `lensProjectId` when the scope moves to `studio` (as the member-scope event
already does), or gate `ProjectAuthorityBandForProject` and the `lensName` chip on
`scope === 'mine' || scope === 'project'`.

**n2 — `.t-head` is applied to values, captions, state sentences and link labels; 23 new uses, and
`.t-meta` — the step §A3 assigns to exactly those things — is used zero times. CARRIED ×3
(r4 n2 → r5 n2), unfixed.**
*Confidence: high — re-measured this round: `t-head` **23**, `t-meta` **0**, `t-body-sm` 17 on the
three-dot diff; `SPEC.md:137-140` and `globals.css:2015-2016` read directly.*
`.t-head` is 11px/500/.08em **with `text-transform: uppercase`** and §A3 scopes it to *"running
heads only"*; `.t-meta` (12px/400, sentence case) is the step for *"values: dates, counts, captions,
sub-labels"*. User-visible consequences, unchanged since r5:
- `ScopeRollup`'s caption (`:1125`) renders **a person's and a studio's proper name in full caps** —
  *"MARIA OBI · LEAH MBEKI STUDIO · THIS WEEK"* (the DOM text is sentence case; the CSS uppercases
  it). Same for `PricingStudioLine`'s studio name (`:1026-1032`).
- `ScopeRollup`'s error (`:1177-1185`), `ScopeEntries`' error (`:1335-1345`) and the pricing-studio
  error (`:691-699`) render whole sentences in 11px UPPERCASE; §A3 puts state sentences on
  `.t-body`/`.t-body-sm`, which `StudioRateRows`' own error already uses.
- `MemberProjectTotal`'s caption (`:1271`) and `ScopeEntryRow`'s meta line (`:1425`).
Still minor rather than major because the file's pre-existing idiom at those places was already
`font-mono text-[11px] uppercase`, so the conversion preserved the look while landing the wrong
semantic step. The proper-name-in-caps instances are the genuinely new ones.
*Fix:* `.t-body-sm` on the three error paragraphs and on `PricingStudioLine`; `.t-meta` on the two
scope captions and on `ScopeEntryRow`'s meta line. Leave `.t-head` on the lens words, the group-by
words and the running heads.

**n4 — a viewer who owns or administers two design studios can only ever read the alphabetically
first one, with no door to the second. CARRIED ×3 (r4 n5 → r5 n4), unfixed.**
*Confidence: high — `use-viewer-studio.ts:48-60` returns `candidates[0]` and nothing switches it.*
The r3 fix correctly made the answer deterministic and named; it also made the second studio
unreachable. Everything keyed on it follows: the studio scope's rollup, the member scope's rollup
and entries, and the studio the stamp door offers to name — so on a document whose designer the
*other* studio employs, the door is offered and the server then refuses `42501`.
*Fix:* when `candidates.length > 1`, make the studio name in the caption a Scored-Ink word that
cycles the candidates; or rule one studio per viewer and have `useViewerStudio` return the count so
the sheet can say *"(1 of 2 studios)"* rather than silently picking.

**n5 — the same-day upsert rewrites `created_by` on a row another admin authored, and overwrites
that day's rate in place, in a table the module documents as append-only. CARRIED ×3 (r4 n6 →
r5 n5), unfixed.**
*Confidence: high on the mechanism; low on money impact, which r4, r5 and I all failed to construct.*
`use-studio-member-rates.ts:110-124` upserts `onConflict: 'studio_id,user_id,effective_from'` with
`created_by: userId`. A second save the same day takes the UPDATE path, whose policy
(`studio_member_rates_admin_update`) checks only `is_org_admin_or_owner(studio_id)` and does **not**
re-assert `created_by = auth.uid()` — so the row's recorded author silently becomes whoever
corrected it, and the earlier figure for that day is gone from the history. Note this interacts with
HT-3-e(2): a correction by the member herself would flip a studio-authored (and therefore pricing)
row into a self-authored (and therefore inert) one.
*Fix:* drop `created_by` from the upsert payload so a correction leaves the original author standing
(the INSERT path still needs it — split the two), or state the same-day-correction behaviour in the
card's help line.

**n6 — three coverage gaps the plan's own assertions name. CARRIED ×3 (r3 t5 → r4 n9 → r5 n8),
unfixed.**
*Confidence: high — `grep` over all three spec files this round.*
(a) **"rate pending" is never asserted to RENDER in the sheet.** `grep -rn "rate pending"
apps/designer-portal/src` finds it in `authority-hours.ts` (the label), `authority-hours.test.ts:166`
(a unit test of the pure function), `studio-rate-rows.tsx:124` and four comments — never in
`hours-ledger-scope.test.tsx`. HT-26's user-visible half rests on nothing.
(b) the `EntryRow` rate-pending repair block's `viewerIsOwnerOrAdmin` gate (`:1711`) — nothing
asserts a plain member is **not** offered it.
(c) `PricingStudioLine`'s stamp-door absence for a non-admin — the spec asserts absence only when a
studio *is* named (`:405`).
*Fix:* three cases in `hours-ledger-scope.test.tsx` — a `rate_source: 'none'` week entry renders the
words "rate pending"; with `viewerRole = 'member'` neither repair act renders; with
`projectStudioId = null` and `viewerRole = 'member'` the stamp door is absent.

**n7 — the sheet prints one figure and the invoice bills another on a legacy row. CARRIED ×5
(t14 → n10); documented in the matrix, not fixed.**
*Confidence: high.* `hours-ledger.tsx:1604` — `amountCents = e.rated_amount_cents ??
unbilled?.amount_cents ?? 0` — while the composer reads `project_unbilled_time.amount_cents`.
Plan §3 asks BIL-08 be reopened *"as the rate-display drift, not as absence"* and the matrix entry
now says exactly that, so **the plan item is satisfied**; the underlying two-answer defect closes at
W0's `00596` and its owed ruling **HT-6-a**. Related and pre-existing: the unbilled read at
`:263-277` never selects `rated_amount_cents`, so the `row.rated_amount_cents ??` preference at
`:302`/`:313` is inert — integration's code, not this branch's.

**n8 — `ScopeEntries` renders `Reading…` forever if it is ever mounted with all three scope keys
null, because `useTimeEntryLedger`'s new `enabled` guard leaves the query pending rather than
answering. NEW, unreachable today.**
*Confidence: high on the mechanism; **low** that any path reaches it.*
`use-time-tracking.ts:815` — `enabled: Boolean(studioId || userId || projectId)` — and a disabled
TanStack v5 query reports `isPending: true` for ever, which `ScopeEntries:1345-1351` prints as
*"Reading…"*. I traced every path into the entries block (`:775-800`): `scope !== 'mine'` implies
`viewerIsOwnerOrAdmin`, which implies `viewerStudio !== null`, so `studio`/`member` always have a
studio key and `project` always has `lensProjectId` (the lens word only exists with one, and
dropping the document moves the scope to `mine`). So it cannot happen today — but it is a
silent-forever arm one prop change away.
*Fix:* in `ScopeEntries`, treat "no key" as its own arm — `if (!studioId && !memberId && !projectId)
return null;` before the `isPending` check.

### NOTE

**Deferred by the orchestrator (each listed once, counting against nothing):**

- **t1 — HT-35** (the auto-start disclosure band in `document-time-provider.tsx`, the per-member
  opt-out in `account-profile-page.tsx`, and the `time_autostart_disclosed` / `_opted_out` emitters):
  **deferred to stage 4, lane B, with W7.** `document-events.ts:177-190` records the scoping in
  place, alongside the three non-existent candidate columns (`user_settings`, `profiles`,
  `profiles.help_state`). Plan §3's Done-when *"the disclosure band appears once for a fresh member
  and never again"* stays unverifiable until that stage.
- **t2 — W4's portal follow-commits: deferred to stage 4.** One is visible: `00613`'s ledger view
  admits project-less internal rows, and `ScopeEntryRow:1433` renders `row.project_name ?? 'Project'`,
  so an internal hour with no project will print the literal word **"Project"** as its document.
  One string, owed to that stage.
- **t3 — M5-01 (`…/wave-1/15-hours.md:9,15` + the Sanity push): deferred, owed to Kody after the
  ship.** Re-measured: the file is untracked on every ref and exists only in the main checkout, so no
  lane can edit it without the git-hygiene landmine §0.25 bans. The sharpening still stands and is
  still owed — `:15` (*"a designer **or the studio's first hire** can see … where the week actually
  went"*) is now **false**, since HT-8 gives a plain member no lens and `00606` gives her her own
  rows only. That sentence wants rewriting, not confirming. Plan §3's Done-when *"the Sanity help
  article matches what the sheet does"* is unverified.
- **t4 — the roster-role chip: deferred to W3.** W1's Done-when #5 (*"a two-role member's ledger row
  prints the role they picked"*) is not met at this wave; plan §4 explicitly assigns the multi-role
  chip to W3, and HT-41's "only when more than one" needs the live roster-role count W3 fetches.
  The implementation follows §4. The two plan sections disagree — **ruling owed** on which carries it.
- **t5 — the batch-add `billable` control: deferred to W3.** The ledger's add row
  (`hours-ledger.tsx:937-990`) carries no `billable` control and `useCreateTimeEntry` still writes
  `billable: input.billable ?? true`. HT-11 ruled "yes to both"; plan-v2:467 lists HT-11 among W3's
  ruled inputs.

**Rulings owed:**

- **t6 — HT-29 shipped as "the row always, the act sometimes". CARRIED ×5.** `desk-contents.tsx`
  hangs `HoursInHandAct` beneath an Hours doorway row that still renders unconditionally; plan §3
  reads *"act-bearing or absent"*. Removing the row would make the Hours sheet unreachable from the
  Contents index — and the r5 fix's n6 (owner/admin-only unbilled act) now depends on exactly that
  row for the plain member, so the two are coupled. Kody's question.
- **t7 — HT-40's second clause, and the chip's ink changed on a pre-existing element. CARRIED ×3,
  SHARPENED.** HT-40 reads *"Keep it as built … **Do not add colour-coding when the studio scope
  multiplies rows**."* r5's n3 fix moved the billed chip's **label** from `--color-sage` to
  `--color-charcoal` in **both** `ScopeEntryRow:1451` (new) **and** `EntryRow:1660` (pre-existing) —
  a WCAG-correct change (sage on paper ≈2.1:1, under the 3:1 large-text floor) that is nonetheless a
  change to the thing HT-40 said keep. The sage/pearl **border** pair still colour-codes billed
  against unbilled, and `ScopeEntryRow` carries that pair into the multiplied studio rows. Whether
  "keep it as built" or "do not colour-code when multiplied" wins, and whether the contrast repair
  is sanctioned, is Kody's.
- **t8 — ratification owed: the copy deck documents the alias instead of being rewritten. CARRIED ×5.**
  Plan §3 says rewrite `?sheet=hours` → `?book=hours` at `copy-deck.md:357,379,627`; the lane added a
  Conventions bullet naming both spellings and pointing at the seeded templates
  (`packages/email/src/templates/onboarding-hours.tsx`, migrations `00293`/`00310`/`00404`) that carry
  the live string. `desk-doorway.tsx` accepts both end to end (`DOORWAY_KEYS` **and**
  `params.get('book') ?? params.get('sheet')`), so the Done-when is satisfied. Sound reasoning, real
  evidence, still a deviation from a plan line.
- **t9 — architect choice, re-confirmed: the rate card lives on `account-studio-page.tsx`
  (`/desk?account=studio`), not `/preferences` and not the People Room. CARRIED ×5.** Plan §2 makes
  this choice explicitly against HT-3's parenthetical and asks it be flagged. Implemented as planned.

**Observations, no action implied:**

- **t10 — `timeRateRoleLabel` is a dead export in production code. CARRIED ×5.**
  `authority-hours.ts:99-103` and its test, nothing else. Deliberate (W3 needs it); recorded so
  nobody "cleans it up" first.
- **t11 — `timerStarted` / `timerStopped` / `exportTaken` are defined with no call site. CARRIED ×5.**
  Plan-v2 owns all three names in later waves (§4:550, §6:725) and this lane is the file's sole
  writer for the phase, so landing the vocabulary early is the cheaper ordering. Worth repeating: the
  `Export week → Accounts` button is **not** `time_export_taken`'s call site — it opens the composer,
  it does not hand hours out as a file — so W5 must add its own.
- **t12 — `lensWords.length > 1` is a dead guard. CARRIED ×4.** `hours-ledger.tsx:602`. `lensWords`
  always contains `'mine'` and `'studio'`, so the test is always true and the lens's visibility rests
  on `viewerIsOwnerOrAdmin` alone.
- **t13 — `rateUnresolvedSeen` never clears. CARRIED ×4.** `document-events.ts:39` — a module-level
  `Set<string>` keyed on `entry_id` with no eviction, so the dedup is per module lifetime. That is
  what the doc comment promises; the growth is one short string per unpriced entry seen.
- **t14 — the `['studio-member-rate', userId]` entity key has no reader. CARRIED ×4.**
  `use-studio-member-rates.ts:50` defines it and `:122` invalidates it; nothing queries it. Plan
  §2:252 specifies both keys, so this is the plan's shape faithfully implemented.
- **t15 — the sheet is 1761 lines, from 751.** `hours-ledger.tsx` carries the ledger, the lens, four
  scopes, six sub-components and five pre-existing raw reads in one module. Nothing is wrong with it;
  it is the next file someone will be afraid to touch, and W3 has a follow-commit landing in it (§11).
  Worth a deliberate split (`hours-scope/` — `scope-rollup.tsx`, `scope-entries.tsx`,
  `pricing-studio-line.tsx`) before W3 rather than after.
- **t16 — `time_entry_adjusted` hardcodes `by_admin: false`.** Correct today: `EntryRow` is the only
  caller and is now `scope === 'mine'`-gated, so every adjust is the viewer's own row. It stops being
  correct the moment HT-22's admin-adjust surface lands (no portal item for one is assigned to this
  lane). Recorded so that lane does not inherit a lie.
- **t17 — the lens is a `role="group"` of buttons with `aria-current`, not a radiogroup.** Matches
  `scope-lens.tsx`'s existing idiom in the People Room, has a group label (`aria-label="Hours scope"`),
  and each word meets 44px. Accessible; noted only because a four-state single-choice control is the
  textbook radiogroup and a screen-reader user gets "button" ×4 rather than "4 of 4 selected".

---

## 3 · Plan-item ledger (W1 + W2 portal tables)

| Plan item | Status |
|---|---|
| §2 · `use-time-tracking.ts` — `rate_source`/`rate_role` on the type, `rateRole?` on `CreateTimeEntryInput`, no rate sent + asserted | **present** (lane A) |
| §2 · `use-studio-member-rates.ts` create, keys + invalidation set | **present**, keys exactly as specified; n5 open |
| §2 · `hooks/index.ts` + package index export | **present** |
| §2 · `account-studio-page.tsx` — "Studio rates" section, blur-save, owner/admin only, dated history | **present**; gate pinned both ways |
| §2 · `studio-rate-rows.tsx` create | **present**; controlled field, both restore arms pinned |
| §2 · `hours-ledger.tsx` — rate + rate-source column, "rate pending", never blank | **present**; n6(a) unpinned in the sheet |
| §2 · `authority-hours.ts` — `timeRateProvenance` never `null`, discriminated, carries source + role | **present**, 4 unit cases |
| §2 · `pending-time-authorization-band.tsx` + the `pending_authorization` read become doorways | **present** |
| §2 · PostHog `time_entry_logged` / `time_rate_unresolved` | **present**, real props, both call sites |
| §2 · Done-when "a two-role member's row prints the role they picked" | **not met at this wave** — deferred to W3 (t4) |
| §3 · `hours-ledger.tsx` — four-scope lens, absent for non-admins, no `user_id` AND on the project path, totals above rows, studio money, `— internal —` group, chip unchanged | **present**; M6-01, n6-02, n6-03, n2, t7 open |
| §3 · `use-time-tracking.ts` — `useStudioTimeReport` deleted, `useStudioHoursRollup` + `useTimeEntryLedger` added | **present** (lane A); `enabled` guard added (n8) |
| §3 · `person-profile.tsx` — an "Hours" act, the only door to the member scope | **present**, gated, pinned both ways |
| §3 · `desk-contents.tsx` — the Hours line act-bearing or absent | **present**; t6 (ruling) open |
| §3 · `document-time-provider.tsx` — HT-35 disclosure band | **deferred — stage 4** (t1) |
| §3 · `account-profile-page.tsx` — HT-35 opt-out | **deferred — stage 4** (t1) |
| §3 · `desk-doorway.tsx` — `sheet` as an alias of `book` | **present**, end to end |
| §3 · `copy-deck.md:357,379,627` | **deviation** — documented, not rewritten (t8) |
| §3 · `15-hours.md:9,15` + the Sanity push | **deferred — orchestrator-scoped out** (t3) |
| §3 · `portal-vs-desk-feature-gap-matrix-v2.md:189,193` — BIL-04 closed, BIL-08 reopened as drift | **present** (n7) |
| §3 · `hours-ledger-scope.test.tsx` (new) | **present**, 31 cases; n6 gaps |
| §3 · `e2e/document/hours.spec.ts` (new) | **present**, 128 lines + a derived, key-free config; not re-run here (§4); n6-01 |
| §3 · `studio_hours_rollup` return shape has no `notes` | **present** at the type level; the SQL `\d+` assert is lane A's |

---

## 4 · What this review did NOT verify

- **No `supabase db reset`, no SQL test run, no `psql` probe.** Per the brief. Lane A's coverage of
  `00598`–`00607` / `00615` / `00620` is taken as given; `00604`'s ledger view, `00606`'s
  `stamp_project_pricing_studio` and `00607`'s rollup were **read** to ground the UI claims, not
  executed. No row-level claim here rests on a SELECT.
- **The e2e suite was not run.** Not in this round's gate list; port 3000 is contended with the peer
  people-room program and this stage was not named its owner. I read `hours.spec.ts` and
  `playwright.hours.config.ts` and judge them sound apart from n6-01. The implementer's earlier
  *5 passed, chromium, :3100 against 127.0.0.1:54421* is accepted on their evidence; its two caveats
  stand (chromium only; the 44px loop covers the **lens** buttons only).
- **No browser walk, no screenshots, no live-mode render by this reviewer.** The only runtime
  evidence for this wave remains the implementer's SELECT walk (`W1W2-portal-impl.md` §3) and that
  e2e run. In particular the person-profile → Hours door's runtime path (`openHoursForMember`
  dispatching `document:open-ledger` and `StudioDrawer` hearing it over the People Room) is proved
  only at the module-contract level by jest — owed to the prod/local walk.
- **M6-01's evidence is a jsdom render**, using the wave's own stubs, not a browser. The mechanism
  (both figures reduced from a `.eq('user_id', …)` read, rendered outside every scope guard) is
  read directly from the source and is not in doubt; the visual adjacency at 1440/1024/390 is not.
- **`packages/supabase`'s vitest suite was not re-run** (not in this round's gate list; r5 measured
  1255 passed / 12 skipped) and **`packages/supabase` lint was not run** — per `patina-verification`
  no resolvable ESLint flat config exists outside designer-portal, so its result would mean nothing.
- **client-portal / manufacturer-portal type gates not run.** Nothing in the diff touches them;
  `@patina/supabase type-check` and the admin build (the repo's strictest gate) both pass.
- **The post-merge type gate was not re-run this round.** r5 measured it by swapping integration's
  `database.types.ts` in and restoring it (3 gates green); integration has not moved since
  (`04b579bbd`), and `git merge-tree` on the merge base still reports **0 conflict markers** with no
  path overlaps. The merge itself was not performed.
- **The 201 pre-existing lint warnings were not audited** — only the delta was attributed (zero).
- **Prod untouched.** No `db push`, no deploy, no Strata read, no Sanity write.
- **PostHog not consulted** — event names and prop shapes were checked against plan-v2's text and the
  module source; no ingest, dashboard or property schema was verified.
- **`00620`'s legacy studio stamp was not exercised.** Its refusal path is what the UI prints; its
  happy path is unobserved by this reviewer.
- **The contrast figures in t7 are inherited arithmetic, not a measured render.**
