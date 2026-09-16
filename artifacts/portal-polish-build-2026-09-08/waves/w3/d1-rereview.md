# Lane D1 re-review — the day's line (PP-2 / IA top-5 #1)

**Re-reviewer context:** separate from both the implementer and the first reviewer; did not
implement or review D1 before this pass, and treated the prior `d1-impl.md`/`d1-review.md`/
`d1-fix.md` reports as claims to verify, not facts. Read `docs/superpowers/plans/2026-09-08-portal-polish-build.md`
(Global constraints, Shared-state ownership, Copy strings, Wave 3 header + shared-file table,
Lane D1 section, Review protocol), `docs/superpowers/specs/2026-09-08-portal-polish-build-design.md`
(§ "The day's line"), `docs/design/house-sheet/SPEC.md` §A + §F (read from the D1 worktree, since
it is absent from the shared checkout's own `main` at review time — expected, per the shared-file
table A1 owns that file and it lands on `main` only at merge), `apps/designer-portal/CLAUDE.md`
(D1/D4, the amended shadow criterion), and item 5 of
`artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html`. Inspected
`origin/portal-polish/d1` (head `90af8c924`, cut from `origin/main` `1059f5275`) both as a diff
against `origin/main` and as files in `.codex/worktrees/agent-pp-d1` (read-only), and ran the
gate myself from that worktree.

## Verdict

**needs-fix** — not because the code is wrong, but because one P2 finding from the first review
(out-of-list file edits) was consciously *kept*, not resolved, and is still an open pathspec
violation at the time of this re-review. My own analysis below concludes the lane made the
correct engineering call and I can find no materially better fix available to D1 alone — this is
a **sign-off item for the integration lane**, not a code defect, and should not trigger a second
`-fix.md` round from D1. Everything else — including the P2 that *was* fixed — is clean.

---

## Gate — run myself, from the worktree, on the fix commit (`90af8c924`)

```
$ git -C /Users/kody/Code/patina-merged fetch origin   (required dangerouslyDisableSandbox: true —
    the plain sandboxed fetch failed with a proxy/SSH error, per the plan's own sandbox note)
$ git -C /Users/kody/Code/patina-merged log --oneline -3 origin/portal-polish/d1
90af8c924 docs(portal-polish): D1 fix report — W3 review applied
991932b60 fix(designer): address W3 review — d1
3c6754d78 docs(portal-polish): D1 implementation report

$ cd .codex/worktrees/agent-pp-d1 && git rev-parse --show-toplevel && git log --oneline -3
/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d1
90af8c924 …   (confirms the worktree is on the fix commit, not the pre-fix one)
```

```
$ pnpm --dir .../agent-pp-d1 --filter @patina/designer-portal type-check
> tsc --noEmit
(no output, exit 0)
```

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/components/document/desk-roster.test.tsx \
    src/lib/document/__tests__/desk-roster-derivation.test.ts src/hooks \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts
Test Suites: 32 passed, 32 total
Tests:       372 passed, 372 total
Time:        4.468 s
```
Matches the fix report's claimed 372 (368 pre-fix + 4 new tests) exactly.

```
$ pnpm --filter @patina/designer-portal test -- --ci
Test Suites: 545 passed, 545 total
Tests:       1 todo, 6713 passed, 6714 total
Snapshots:   12 passed, 12 total
```
Matches the fix report exactly. Wave-1 baseline was 544/6691+1 todo — net +1 suite, +22 tests,
zero lost, the A1 `terminal` `test.todo` still present and untouched for D4. Neither count has
shrunk; the suite count has not fallen below baseline at any point in this lane's history.

```
$ npx eslint src/components/document src/lib/document src/hooks   (from apps/designer-portal)
✖ 83 problems (2 errors, 81 warnings)
  piece-room-save-gate.test.tsx:159   import/first
  use-commercial-documents.test.ts:930  react-hooks/rules-of-hooks
```
The two known pre-existing errors, byte-identical rule/line to the Wave-1 baseline. Not grown.

```
$ npx eslint <all nine files D1's diff touches, listed individually>
(no output, exit 0 on all nine)
```
Files: `desk-roster.tsx`, `desk-roster.test.tsx`, `desk-roster-derivation.ts`,
`desk-roster-derivation.test.ts`, `use-answered-notes.ts`, `use-answered-notes.test.tsx`,
`app/(document)/desk/page.test.tsx`, `app/(document)/desk/desk-hire-handoff.test.tsx`,
`desk-roster-settle.test.tsx`. Zero lint findings on the lane's entire diff.

```
$ git diff origin/main...origin/portal-polish/d1 -- \
    apps/designer-portal/src/lib/document/__tests__/shadow-gate.test.ts \
    .../contrast.test.ts .../rail-stock.test.ts | wc -l
0
```

```
$ git diff origin/main...origin/portal-polish/d1 --name-only
apps/designer-portal/src/app/(document)/desk/desk-hire-handoff.test.tsx
apps/designer-portal/src/app/(document)/desk/page.test.tsx
apps/designer-portal/src/components/document/desk-roster-settle.test.tsx
apps/designer-portal/src/components/document/desk-roster.test.tsx
apps/designer-portal/src/components/document/desk-roster.tsx
apps/designer-portal/src/hooks/__tests__/use-answered-notes.test.tsx
apps/designer-portal/src/hooks/use-answered-notes.ts
apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts
apps/designer-portal/src/lib/document/desk-roster-derivation.ts
artifacts/portal-polish-build-2026-09-08/waves/w3/d1-fix.md
artifacts/portal-polish-build-2026-09-08/waves/w3/d1-impl.md
```
None of the Wave-3 shared-file-table rows (`packages/supabase/src/hooks/index.ts`,
`packages/supabase/src/database.types.ts`, `docs/design/house-sheet/SPEC.md`, the governance
logs, `supabase/migrations/00580_*`) appear. No collision with a sibling lane's file list checked
directly: D2 and D3 both touch `apps/designer-portal/src/app/(document)/desk/page.tsx` (the
*component*), never `page.test.tsx` (D1's file) — so the three out-of-list edits below carry no
git-merge-conflict risk against D2/D3 as currently diffed, only a policy risk.

```
$ git diff origin/main...origin/portal-polish/d1 -- apps/designer-portal | grep '^+' | \
    grep -oE '#[0-9A-Fa-f]{3,8}' | sort -u
(empty — no new hex literal)
$ git diff origin/main...origin/portal-polish/d1 -- apps/designer-portal | grep '^+' | \
    grep -iE 'shadow|badge|pill|spinner|✓|line-clamp|truncate|opacity-5|opacity: ?\.5'
(empty)
$ git diff origin/main...origin/portal-polish/d1 -- apps/designer-portal | grep -E 'elevation-sheet|desk-settle'
(empty — neither token/class appears in the diff at all, confirming both untouched)
```

I reproduced every number in both `d1-impl.md` and `d1-fix.md` independently and they check out
exactly. Findings below go beyond what either report already disclosed, or push back on a
disposition I don't fully agree with.

---

## Findings

Severity scale: P1 blocking, P2 should fix or get explicit sign-off before merge, P3 minor or
informational. Confidence is my own calibration.

### P2 — three test files outside D1's file list, kept unresolved (confidence: high on the fact, medium on whether it should block)

Confirmed still present in the fix commit, unchanged from the first review's finding:
`app/(document)/desk/page.test.tsx`, `app/(document)/desk/desk-hire-handoff.test.tsx`,
`components/document/desk-roster-settle.test.tsx`, each carrying one added
`jest.mock('@/hooks/use-answered-notes', () => ({ useAnsweredNotes: () => ({ data: [] }) }))`,
with a one-line comment explaining why. I inspected each diff directly (reproduced above) — no
assertion in any of the three changed, and the mock's shape matches how these same files already
stub every other Desk feed (`use-auth`, `use-hydrated`, `use-feature-flag`, etc.), so it is not a
novel pattern being introduced, just one more instance of an existing one.

The plan's Global constraints say, without qualification: "Touch ONLY the files your lane lists
(the shared-file table names which region of a shared file is yours)." D1's list is
`desk-roster.tsx`, its test, `desk-roster-derivation.ts` (+ test), and a sibling hook (+ test).
These three files are not on it, and D1 did not ask a human before landing the edit — it landed
first (`ac6fadb18`), then disclosed. The first review rated this P2 and the fix round's
disposition was "kept, flagged for integration sign-off" — i.e., consciously not fixed.

I re-derived whether a better fix exists and agree with the lane and the first reviewer that it
does not, for a specific reason neither report states explicitly: `useQueryClient()` (which
`useQuery` calls internally) throws `No QueryClient set` synchronously on render whenever no
`QueryClientProvider` is in the tree, **regardless of the hook's `enabled` option** — there is no
way to make `DeskRoster` call a React Query hook unconditionally without either (a) wrapping every
call site in a provider (which means editing `desk/page.tsx`, D2's/D3's file this wave, forbidden
to D1), or (b) abandoning React Query for this read in favor of a bespoke `useEffect` fetch (which
would violate the project's own data-access convention — "`@patina/supabase` hooks for Supabase
data" — for no gain). Given that constraint, updating the three suites that mount `DeskRoster`
without a provider is the only in-lane-scope move that keeps the suite green without weakening a
test or reverting a legitimate behavior change.

**What I am flagging, precisely:** not that the change is wrong, but that it was never actually
resolved — it was reported as needing "the integration lane's conscious sign-off" and no such
sign-off is recorded anywhere I can find (no note in `d1-rereview.md`'s predecessor, no entry in
`DECISIONS.md`, no comment thread). A hard-line, repeatedly-stated rule ("Touch ONLY…") was
knowingly broken and the only remedy proposed is "someone else agrees to it later" — which as far
as this re-review can tell has not yet happened. I recommend the sign-off be recorded explicitly
at Wave 3 integration (a one-line acknowledgment in the integration report is enough) rather than
asking D1 to attempt a fourth round with no better option on the table; sending this back to D1
again would very likely reproduce the identical diff with the identical justification.

### What's clean (re-verified independently, not just re-quoted from the reports)

- **D1-1 (P2, client name dropped from the lead line) is genuinely fixed.** Read the derivation
  code directly: the `lead` branch's first `DayLinePart` is now
  `{ kind: 'job', text: lead.line.client ?? lead.line.name, engagementId: … }`
  (`desk-roster-derivation.ts`), rendering `Marcus Wright · New lead — respond by Aug 27` —
  matching the specimen's own shape (`designer-desk.html:776`) exactly. The fallback to the job
  name only fires when `clientOf` has refused a placeholder (verified against a dedicated test,
  *"falls back to the job when the lead row carries no named client"*, which constructs a row with
  `client_name: ''` and asserts the job name surfaces instead). The accessible name follows suit
  (`aria-label="Marcus Wright — the row below"`), and a component test
  (*"names the person she is keeping waiting on the lead line"*) asserts both the rendered text and
  the link target. I do not consider this finding open any longer.
- **D1-3 (P3, caret) is genuinely fixed and reasonably substituted.** `INLINE_ACT` now carries a
  `before:content-['‸']` pseudo-element paired with the pre-existing focus ring, gated on
  `focus-visible`. The house sheet's own `.act::after` mechanism can't be reproduced verbatim here
  (no `.act`/`.act--inline` class exists in this portal outside the sheet document itself, and
  minting one means editing `globals.css`, D4's file) — the lane's local Tailwind reproduction is
  a faithful reading of the same visual intent (a proofreader's caret that fades in on focus), and
  the position choice (outside the word rather than at a fixed `left: 1px`, which is calibrated for
  a padded control box the inline tier does not have) is sound given `.act--inline`'s own `padding:
  0`. The `aria-label` on every inline act is the correct mitigation for Tailwind's
  `content-[…]` utility lacking the sheet's `content: '…' / ''` alt-text form — it keeps the glyph
  out of the accessible name regardless of how a given screen reader treats pseudo-element content.
  I verified this is applied to **every** inline act in the band (the overdue link, the lead link,
  the answered link, and the "and N more below" link) via the component test that iterates
  `container.querySelectorAll('[data-desk-day-line] a')` and asserts the caret classes plus a
  truthy `aria-label` on each.
- **D1-7 (P3, `reconnect_due` exclusion) is now a stated, tested decision rather than an untested
  accident** — confirmed a dedicated test exists (*"leaves a reconnect touchpoint to the roster
  row — the lead slot is new leads only"*) that would fail the moment the filter widens, and the
  reasoning is now a code comment. I agree this is a genuine open product question (does a
  `reconnect_due` client belong in this slot?), not a bug, and it is correctly still owed to
  Kody/integration rather than resolved by the lane.
- **The disposition of D1-4, D1-5, D1-6 (declined, out of scope) all hold up under my own check**:
  no `.t-*` type-step class exists anywhere in the designer portal (confirmed by grep — the portal
  uses `doc-type-body`, not the house sheet's own class names, a program-level gap that predates
  this lane and is not D1's to close); `--hairline-strong` is not defined in
  `apps/designer-portal/src/app/globals.css` at all (confirmed by grep — only `--doc-ink-border`
  and `--rule-hair` exist as candidates, and `--doc-ink-border` at .18 alpha is the better-matched
  of the two for a rule that has to visually separate the band from the head above it); restoring
  the specimen's exact overdue-line wording would genuinely create an RTL query ambiguity against
  the pre-existing, untouchable `desk-roster.test.tsx:16`/`desk-roster-derivation.test.ts:158`
  assertions the plan itself says must stay green.
- **Absence is silence, re-confirmed**: zero day-lines → `deriveDeskDayLine` returns `null` → no
  wrapper, no rule, no "nothing needs you" banner renders at all — read directly in the derivation
  code and the component, and covered by the *"renders nothing at all when nothing needs her"*
  test in both files.
- **Never more than three lines, no second queue**: `MAX_DAY_LINES = 3` caps `lines.slice(0, 3)`;
  every `job` part's `engagementId` is asserted (in both the derivation test and the component
  test) to resolve to a row `data-roster-line`/`id` that is already on the page; "and N more below"
  counts `marked.length − spoken`, not a fixed arithmetic, and its `href` is asserted to point at an
  `id` that actually exists on the corresponding stage `<h3>`.
- **The overdue trio (head count → sentence → row mark) is intact** — the pre-existing
  `roster.heading` and `roster.overdueLine` (`'One thing is overdue — Vandersteen.'`) are rendered
  completely unchanged above the band, still pinned by the same untouched assertions, and a new
  test in the day's-line describe block explicitly re-asserts the sentence renders alongside the
  new band rather than being replaced by it.
- **The new read is minimal, correctly scoped, and matches the schema on disk.** I cross-checked
  `use-answered-notes.ts`'s query (`select('project_id, answered_at').gte('answered_at', since)`)
  against `supabase/migrations/00565_the_client_page.sql:228-274`: both columns exist as declared,
  `project_notes_studio_select` genuinely scopes the table to
  `app_private.is_project_studio_member(project_id)`, and the `gte` filter on a nullable column
  correctly doubles as the "has this been answered" filter (a `NULL` never satisfies `gte`). No
  RPC, no new table, no migration — matching the plan's own instruction. One P3 worth naming below.
- **No new hex, no shadow, no badge/pill/✓/spinner/truncation, no `opacity:.5` on a state.**
  Independently grepped the entire diff, not just the lane's own claim — confirmed above. `--elevation-sheet`
  and `desk-settle` do not appear anywhere in the diff (i.e., untouched, not merely unedited-in-a-way-
  that-still-shows-in-the-diff). `shadow-gate.test.ts`, `contrast.test.ts`, `rail-stock.test.ts` are
  byte-identical to `origin/main` and all green.
- **D1/D4 of `apps/designer-portal/CLAUDE.md` hold**: no split view, no document tabs, no
  persistent global nav is introduced (the band is inline content inside the existing roster
  section, not a new chrome layer); no new shadow site, no new depth token — the amended criterion
  ("the portal-polish program … adopts no depth at all") is satisfied.
- **Type-check clean, full suite green with the exact expected delta, lint at the same two known
  pre-existing errors** — all independently reproduced above, not merely re-quoted.

### P3 — some new component-test assertions pin Tailwind class strings rather than behavior (confidence: medium)

`desk-roster.test.tsx`'s *"writes the sheet's inline act, not a control box"* and *"gives every
inline act the sheet's focus pair"* tests assert `link.className.toContain('border-[color:var(--color-aged-oak)]')`,
`.toContain("before:content-['‸']")`, `.toContain('focus-visible:before:opacity-100')`, and
`.not.toMatch(/min-h-|rounded-|bg-\[/)`. These are markup/CSS-class assertions rather than
observable behavior — the review checklist for every lane in this program specifically calls out
"test coverage of the behaviour, not the markup." I weigh this as low-severity: jsdom cannot
render `::before` content or compute focus-visible pseudo-state, so a class-string assertion is
close to the only mechanical way to lock a Tailwind-authored pseudo-element in place without a
visual-regression tool, and the fix report's separate Tailwind-compile step (quoted in `d1-fix.md`)
is the more meaningful proof that the utility actually generates the intended CSS. Not asking for
a fix; naming it because the checklist asks for it to be named.

### P3 — no index backs the new `answered_at` filter (confidence: low, informational)

`use-answered-notes.ts` filters `project_notes` on `gte('answered_at', since)` on a 60s poll, but
the only index on the table is `(project_id, sent_at DESC)` and a partial index on `state =
'standing'` (`00565_the_client_page.sql:250-257`) — nothing on `answered_at`. At current studio
scale this is very unlikely to matter (the query also caps at 50 rows), and D1 has no migration
access this wave regardless (Strata pushes are Wave 1's alone per the shared-state table), so
there is nothing for the lane to do about it. Naming it only so it is on record if `project_notes`
ever grows large enough for this poll to show up in a slow-query log.

### P3 — `d1-impl.md` is genuinely absent from a plain checkout of `origin/main`'s artifacts tree (confidence: high, not a defect)

Re-confirmed the first review's own note: the report exists and is committed on
`origin/portal-polish/d1` (I read it directly via `git show origin/portal-polish/d1:artifacts/…/d1-impl.md`
— it is real, complete, and matches the content this re-review cites), but the shared checkout's
own `main` does not carry it yet, since Wave 3 has not merged. Not a lane defect — noted only so
whoever assembles the wave's report set knows to pull it from the branch, not from `main`, until
integration lands.

---

## Comparison to the specimen (`designer-desk.html`, item 5)

| Aspect | Specimen | Shipped | Verdict |
|---|---|---|---|
| Line 1 (overdue) | `"One thing is overdue — Vandersteen, install, since 4 September"` | `"Vandersteen residence — project, overdue 6 days"` | Diverges in wording (no lead-in, elapsed phrase not a date); reasoned and defensible — see D1-4's disposition above. Not a P1/P2. |
| Line 2 (lead) | `"Marcus Wright · new lead — respond by 10 September"` | `"Marcus Wright · New lead — respond by Aug 27"` | **Now matches in shape** (client name leads) after the fix; residual case/date-format differences are pre-existing portal conventions (sentence case on `needText`, no en-GB date sweep this wave — that is H6's, client portal only), not new divergences D1 introduced. |
| Line 3 (answered) | `"Nora Ellison replied last night — Cedar Lane Study"` | Identical | Exact match. |
| "and N more below" | Present, links to first plate | Present, links to first plate's `id` | Match. |
| Absence behavior | (not shown in specimen; implied by ruling text) | Confirmed: renders nothing | Match. |

---

## What I did not do

- Did not run a dev server, `supabase db reset`, or any render/e2e pass at 1280/1440/390 — those
  are the Wave 3 integration lane's, per the shared-state table, and the fix report already names
  them as owed there (a seeded `answered` note render, and a keyboard pass on the caret).
- Did not attempt to resolve the out-of-list-files P2 myself, and did not ask D1 to attempt a
  fourth round — I don't believe a better in-lane fix exists, and said so above; this belongs to
  the integration lane as an explicit accept/revert decision, not another code round.
- Did not re-litigate the P3 items D1 declined (D1-4/5/6) beyond confirming their stated
  rationale is factually accurate (grepped for the tokens/classes each cites).
