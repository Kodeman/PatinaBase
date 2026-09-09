# Lane D1 review — the day's line (PP-2 / IA top-5 #1)

**Reviewer context:** separate from the implementer. Reviewed `origin/portal-polish/d1`
(head `3c6754d78`, cut from `origin/main` `1059f5275`, which already carries A1's amended
rulings — R139–R142/I153/V9 — even though the shared checkout's own `origin/main` ref is
behind that point at review time) against
`docs/superpowers/plans/2026-09-08-portal-polish-build.md` (Lane D1 section, Wave 3 shared-file
table, Review protocol), `docs/design/house-sheet/SPEC.md` (read from the lane branch, §A + §F),
`apps/designer-portal/CLAUDE.md`, and
`artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html` item 5 ("the day's
line"). Inspected the worktree at `.codex/worktrees/agent-pp-d1` (read-only) and ran the gate
myself from there.

## Verdict

**needs-fix** — one P2 content-fidelity gap (the lead line drops the client's name) and one P2
pathspec/scope item worth a conscious sign-off before merge; everything else is clean or minor.

---

## Gate — run myself, from the worktree

```
$ pnpm --dir .codex/worktrees/agent-pp-d1 --filter @patina/designer-portal type-check
> tsc --noEmit
(no output, exit 0)

$ pnpm --dir .codex/worktrees/agent-pp-d1 --filter @patina/designer-portal test -- --ci \
    src/components/document/desk-roster.test.tsx \
    src/lib/document/__tests__/desk-roster-derivation.test.ts src/hooks \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts
Test Suites: 32 passed, 32 total
Tests:       368 passed, 368 total

$ pnpm --dir .codex/worktrees/agent-pp-d1 --filter @patina/designer-portal test -- --ci
Test Suites: 545 passed, 545 total
Tests:       1 todo, 6709 passed, 6710 total
Snapshots:   12 passed, 12 total
```
Matches the impl report's claimed numbers exactly (+1 suite / +18 tests over the Wave-1
baseline of 544/6691+1 todo; the `terminal` `test.todo` is still present, untouched, for D4).

```
$ npx eslint src/components/document src/lib/document src/hooks   (from apps/designer-portal)
✖ 83 problems (2 errors, 81 warnings)
  src/components/document/rooms/piece/piece-room-save-gate.test.tsx:159  import/first
  src/hooks/__tests__/use-commercial-documents.test.ts:930               react-hooks/rules-of-hooks
```
The two known pre-existing errors, unchanged — count not grown.

```
$ npx eslint <every file D1 touched, individually, listed below>
(no output, exit 0 on all nine)
```
Files: `desk-roster.tsx`, `desk-roster.test.tsx`, `desk-roster-derivation.ts`,
`desk-roster-derivation.test.ts`, `use-answered-notes.ts`, `use-answered-notes.test.tsx`,
`app/(document)/desk/page.test.tsx`, `app/(document)/desk/desk-hire-handoff.test.tsx`,
`desk-roster-settle.test.tsx`. Zero lint findings on the lane's own diff.

```
$ git diff origin/main...origin/portal-polish/d1 -- apps/designer-portal/src/lib/document/__tests__/shadow-gate.test.ts \
    .../contrast.test.ts .../rail-stock.test.ts | wc -l
0
```
Confirmed unedited.

`git diff --stat` (against `origin/main`, matches the impl report's own `HEAD~1` stat plus the
report file itself):
```
 .../app/(document)/desk/desk-hire-handoff.test.tsx |   6 +
 .../src/app/(document)/desk/page.test.tsx          |   6 +
 .../document/desk-roster-settle.test.tsx           |   6 +
 .../src/components/document/desk-roster.test.tsx   | 149 ++++++++++++++-
 .../src/components/document/desk-roster.tsx        | 101 ++++++++++-
 .../hooks/__tests__/use-answered-notes.test.tsx    | 129 +++++++++++++
 .../src/hooks/use-answered-notes.ts                |  62 +++++++
 .../__tests__/desk-roster-derivation.test.ts       | 201 ++++++++++++++++++++
 .../src/lib/document/desk-roster-derivation.ts     | 202 +++++++++++++++++++++
 .../waves/w3/d1-impl.md                            | 200 ++++++++++++++++++++
 10 files changed, 1055 insertions(+), 7 deletions(-)
```
No new hex literal anywhere in the diff (`grep -oE '#[0-9A-Fa-f]{3,8}'` on added lines: empty).
No `box-shadow`/`shadow-`/`badge`/`pill`/`✓`/`spinner`/`opacity-50`/`truncate`/`line-clamp` in
the diff (grepped). Every pre-existing test assertion in `desk-roster.test.tsx` and
`desk-roster-derivation.test.ts` is untouched — `git diff | grep '^-'` shows only import-line
removals in the former and zero deletions in the latter; the diffs are pure appends.

The report's numbers are real, reproduced independently, and match. I do **not** take the
report's narrative claims at face value beyond that — see findings below, several of which the
report does not raise itself.

---

## Findings

Severity scale: P1 blocking, P2 should fix before merge, P3 minor/informational. Confidence is
my own calibration, not the lane's.

### P2 — the lead-deadline line never names the client (confidence: high)

The specimen's line 2 (`designer-desk.html:776`) is:
```html
<a class="act act--inline" href="#job-marcus-wright"><span class="label">Marcus Wright</span></a> · new lead — respond by 10 September
```
i.e. the inline act's own text is the **client's name** — the person the designer needs to
reply to.

The shipped derivation (`desk-roster-derivation.ts:459-472`) instead composes:
```
{ kind: 'job', text: lead.line.name, ... }   // "Wright apartment"
{ kind: 'text', text: ` · ${lead.line.needText}` }  // " · New lead — respond by Aug 27"
```
rendering **"Wright apartment · New lead — respond by Aug 27"** — the client's name
("Marcus Wright") does not appear anywhere in this line at all, even though `RosterLine.client`
is populated and correctly used one line down for the *answered* line
(`"${match.line.client} replied last night — …"`, which does match the specimen exactly).

The overdue line's departure from the specimen (job-name link instead of a bare first name, no
calendar date) is explained in the impl report's "Decisions a reviewer should check" §1–2. This
one is not — nothing in the report addresses why the lead line names the job rather than the
person. Functionally the line still "links to a row already on the page" (satisfies the
no-second-queue behavioural test), but the whole point of naming a person in this slot — per the
ruling's own worked example — is that "who do I need to call back" is exactly what a deadline
line should answer at a glance, and it is currently unanswerable from the line itself. The row
underneath does carry the client name in its own state sentence, but the day's line is supposed
to save her the click.

**Fix:** lead a `client` part before or in place of the job name — e.g.
`{ kind: 'text', text: lead.line.client ?? lead.line.name }` guarding the same absent-name case
the overdue/answered lines already guard, wired through a test asserting the client's name
appears in the rendered line.

### P2 — three test files outside D1's declared file list were edited (confidence: high, but disclosed)

The shared-file table gives D1 `desk-roster.tsx` (the block between head and first plate),
`desk-roster.test.tsx`, `desk-roster-derivation.ts` (+ test), and a sibling hook (+ test). The
diff also touches:
- `apps/designer-portal/src/app/(document)/desk/page.test.tsx`
- `apps/designer-portal/src/app/(document)/desk/desk-hire-handoff.test.tsx`
- `apps/designer-portal/src/components/document/desk-roster-settle.test.tsx`

each with one added `jest.mock('@/hooks/use-answered-notes', () => ({ useAnsweredNotes: () =>
({ data: [] }) }))`. This is transparently reported ("Out-of-list edits (reported, not
concealed)") and well-motivated — `DeskRoster` now calls a React Query hook, so any suite that
mounts it without a `QueryClientProvider` throws `No QueryClient set` regardless of `enabled`;
these three suites do exactly that. No assertion in any of the three files changed, and none of
the three is in D2's or D3's file list either (D2 owns `page.tsx`'s *component* wiring at `:90`,
not its test file). I have low confidence this causes any real integration conflict, but it is a
literal violation of "Touch ONLY the files your lane lists" and the plan's own instruction that
"a build lane that wants a rule changed reports it, it does not write it" extends naturally to
scope: the honest move here would have been to flag this in the report *as a question* before
landing it, not land it and report it after the fact. Given the constraint (D1 cannot touch
`page.tsx`, so the hook must live inside `DeskRoster` itself, so any pre-existing mount-without-
provider test breaks), I don't see a materially better fix available to the lane alone — flagging
for the integration lane's awareness rather than as something to unwind.

### P3 — the day's line's inline acts carry a focus ring but not the sheet's caret (confidence: medium)

House sheet "Focus — one rule for every tier" (SPEC.md, unconditional on `.act`, inherited by
`.act--inline` since that modifier's own block does not redefine `::after`/`:focus-visible`):
every tier gets `outline: 2px solid var(--clay-ink)` **and** a `::after` "proofreader's caret"
(`content: '\2038' / ''`) that fades in on focus. The review checklist explicitly names "focus
ring + caret" as a check item.

D1's `INLINE_ACT` constant (`desk-roster.tsx`) supplies the ring
(`focus-visible:outline focus-visible:outline-2 …`) but no caret — it is a hand-rolled Tailwind
class string, not the `.act`/`.act--inline` CSS class the sheet defines, so it does not inherit
the caret mechanically and none was added by hand. The designer portal's own pre-existing caret
(`globals.css:836-858`) is scoped to `.da-act` (the `DocumentAction` component's own markup) and
is D4's territory this wave, not something `DeskRoster`'s plain `<a>` tags pick up. The outline
ring alone still satisfies WCAG 2.4.7 focus-visibility; the caret is the house sheet's own
decorative-but-specified affordance, so I'd call this a real but minor divergence rather than an
accessibility blocker. Whether it's D1's job or a follow-up for whichever lane eventually gives
the Desk a real `.act`/`.act--inline` implementation is a judgment call I'd leave to the
integration lane.

### P3 — divergences from the specimen's exact wording, documented and defensible (confidence: high that they exist; low that they're wrong)

- Specimen line 1: `"One thing is overdue — Vandersteen, install, since 4 September"`. Shipped:
  `"Vandersteen residence — project, overdue 6 days"` (no "One thing is overdue —" lead-in;
  `overdueElapsedPhrase` instead of a calendar date). The impl report's decision #1 and #2 explain
  both choices (avoiding an ambiguous duplicate-text RTL query against the sentence already
  printed above the band; reusing the one overdue idiom the row itself already prints rather than
  minting a fourth date format). I find the reasoning sound — flagging only because the review
  brief asks for every specimen divergence to be named.
- Specimen line 2 uses the client's given name alone ("Marcus Wright"); shipped renders the job's
  full title ("Wright apartment") — see the P2 above, same divergence, worse because the person's
  name is dropped entirely rather than just restyled.
- Line 3 ("{client} replied last night — {job}") matches the specimen exactly, including the
  fixed phrase "replied last night" regardless of how many hours old the reply actually is within
  the 24h window — that phrasing is the plan's own literal copy (Lane D1 step 1(c)), not a lane
  choice, so not a finding against the implementation.

### P3 — the "hairline-strong" rule uses a portal token with a different alpha (confidence: low)

The band's top rule is `border-t border-[color:var(--doc-ink-border)]`
(`rgba(44,41,38,.18)`). The house sheet's `--hairline-strong` is `rgba(44,41,38,.14)` — same hue,
different alpha. The impl report calls `--doc-ink-border` "the local name for the sheet's
--hairline-strong" and rules out the portal's `--rule-hair` (`.10` alpha, a `border-bottom`
shorthand) as too faint. No new hex was introduced (both are pre-existing tokens), and I have no
strong view that .18 vs .14 is visibly wrong here — noting it because "tokens only, no new value"
is a checklist item and this is an existing-token substitution rather than an exact match.

### P3 — `reconnect_due` is excluded from the "lead deadline" line (confidence: low-medium, untested either way)

`deriveDeskDayLine`'s lead filter is `needKind === 'new_lead'` only. Elsewhere in this codebase
(`desk-derivation.ts:1253`, `needSortKey`) `new_lead` and `reconnect_due` are treated as the same
"lead response deadline" family (`row.lead_response_deadline`). Whether "the earliest lead
deadline line" is meant to include a `reconnect_due` client (an existing client whose reconnect
window is closing) is genuinely ambiguous from the plan text and untested in either direction —
flagging as a product question, not a confirmed bug.

---

## What's clean

- **Absence is silence**, verified in code and by test: zero lines → `deriveDeskDayLine` returns
  `null` → no wrapper renders at all (`desk-roster-derivation.ts:518`,
  `desk-roster.test.tsx` "renders nothing at all when nothing needs her").
- **Never more than three lines**, and the cap is enforced by `.slice(0, MAX_DAY_LINES)`, tested
  at 12 extra rows (`derivation test`: "never grows past three lines, and counts the rest below").
- **No second queue**: every line is derived from `flatten(roster)` (the same model the stage
  groups render from) and every `job` part's `engagementId` is asserted to resolve to a
  `data-roster-line` already on the page, both in the derivation test ("says three things, and
  each one is a view of a row on the page") and the component test ("carries every line into a
  row that is already on the page").
- **The overdue trio is intact** — the head count (`roster.heading`), the sentence
  (`roster.overdueLine`, pinned string unchanged, tests untouched and still green), and the row's
  own red-letter mark are all still rendered independently of the new day's-line band; the
  component test explicitly re-asserts `'One thing is overdue — Vandersteen.'` still renders
  alongside the band.
- **"and N more below"** counts `marked − spoken` (not a fixed `needing − 3`) and links to the
  first stage plate's `id`; tested at both the 1-more and 12-more cases, and the anchor target
  (`#roster-stage-<key>`) is asserted to actually exist as an `id` on the stage `<h3>`.
- **Two links, two names**: because the row's own link and the day's line's link can both carry a
  job's name on one page, the day's-line link's accessible name is disambiguated
  (`aria-label="{job} — the row below"`), and a test locks this in
  (`getByRole('link', { name: 'Vandersteen residence — the row below' })`).
- **The new read is minimal and correctly scoped**: `use-answered-notes.ts` is a plain
  `project_notes` select under existing RLS (`project_notes_studio_select`), no RPC, no new
  table, `gte` on a nullable column doubles as the "was it answered" filter, capped at 50 rows,
  and the hook's own tests cover the query shape, the half-row (`project_id: null`) exclusion,
  the error path (no data on failure, not a silently-empty array), and the `enabled: false`
  short-circuit.
- **No new hex, no shadow, no badge/pill/✓/spinner/truncation**, `--elevation-sheet` and
  `desk-settle` untouched, `shadow-gate.test.ts` / `contrast.test.ts` / `rail-stock.test.ts`
  unedited and green — all confirmed above, not just asserted by the report.
- Type-check clean, full designer-portal suite green at 545/545 with the exact expected +1
  suite / +18 test delta over the Wave-1 baseline, lint at the same 2 known errors with the
  lane's own new/touched files individually lint-clean.

## Report file status

`artifacts/portal-polish-build-2026-09-08/waves/w3/d1-impl.md` exists and is committed on the
lane branch (`origin/portal-polish/d1`, commit `3c6754d78`) but has not yet been merged into
`main`'s copy of the artifacts tree — it is not visible from a plain checkout of the shared
`origin/main` ref. Not a defect in the lane's work; noted so the durable-path expectation is
understood as "on the branch," not yet "on main," until Wave 3 integration lands it.
