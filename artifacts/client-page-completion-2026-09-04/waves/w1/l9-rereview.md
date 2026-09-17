# L9 — Verification re-review (fix round)

Branch `client-page-2/l9` @ `373d4a8349d46ea4c3a30624d5659d15269754e0`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l9`. Fresh context, read-only: no edits, no
git writes. Fix round reviewed as the diff `69767259e..373d4a834`, against
`artifacts/client-page-completion-2026-09-04/waves/w1/l9-review.md` (19 findings: 0 blocker, 4 major,
7 minor, 8 nit) and the fix-round section appended to `l9-impl.md`.

Fix-round diff surface (code only): `story-pole.tsx`, `the-note.tsx`, `door-gate.tsx`, `doorstep.tsx`,
`house-ledger.tsx`, `room-band.tsx`, `threshold.tsx`, `lib/threshold/{canonical-phases,derive,standing}.ts`
and six test files. `making/*` still untouched; `mat.tsx` still untouched; no migration, no hook, no
`@patina/supabase` change.

---

## Gate output (re-run by the reviewer, verbatim)

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l9/apps/client-portal type-check`:

```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l9/apps/client-portal
> tsc --noEmit
```

Clean — no diagnostics.

`pnpm --dir <worktree>/apps/client-portal test -- threshold making`:

```
Test Suites: 33 passed, 33 total
Tests:       618 passed, 618 total
Snapshots:   0 total
Time:        5.168 s
Ran all test suites matching /threshold|making/i.
```

`npx eslint src/components/threshold src/lib/threshold` (from `apps/client-portal`): no output, exit 0.

Neither command needed the sandbox disabled. The lane's reported gate output (602 → 618 tests)
reproduces exactly.

---

## Prior blockers — none were raised

The prior review found 0 blockers. Nothing to confirm.

## Prior majors — all four confirmed fixed

### Major 1 — a finished house drew six ungraduated chapters · **FIXED**

`story-pole.tsx:110-111` adds

```ts
const walkedAt = (index: number): boolean =>
  heldAt >= 0 ? index < heldAt : graduations[index]?.phase.status === 'completed';
```

and it is consumed on both renderings: the phone dots at `story-pole.tsx:158` (which already had a
`walked` idiom) and the desktop rail at `story-pole.tsx:185` (`data-walked`) and `:198-200` (the tick
struck in `var(--text-primary)` rather than `--border-default`). The two renderings now agree, which
they did not before.

Verified the fix reaches the case the finding named end to end: `canonicalPhases`'s `finished` branch
returns six graduations with `status: 'completed'` and `current: null`, so `heldAt` is `-1` and all six
read walked. Pinned at the component by two new cases in `threshold-robustness.test.tsx:78-92` — six
`[data-walked]` and zero `[data-held]` for `'completed'`, zero of both for `'archived'`.

Side effect checked, and it is a correct one: the fallback also applies on the *register* path when a
studio's milestones settle every phase and leave no current — those chapters now read walked instead of
ungraduated. No path exists where `heldAt >= 0` and the fallback fires, so no held-project behaviour
changed.

### Major 2 — the owed row's due date carried no year · **FIXED**

`standing.ts:250-261`: `owedDueLine(due, datedCount, today?)` appends `due.getFullYear()` the moment it
differs from `today`'s — byte-identical in rule to `letterbox.tsx:48-52` and
`making/spine-toll.tsx:55-61`. Threaded through `house-ledger.tsx:25-30` (prop doc), `:68` (signature),
`:76` (call), and fed from `threshold.tsx:621` with the same `today` the letterbox already gets.

Hydration checked independently: `today` is `useMemo(() => (hydrated ? new Date() : undefined), [hydrated])`
(`threshold.tsx:269-274`), and `HouseLedger` only ever renders inside the `hydrated && !loading && !pending`
branches (`threshold.tsx:706-763`), so there is no SSR/first-paint text that the year can change out from
under. Tests: `dateline.test.ts:49-60` (both counts, plus the same-year case) and
`threshold-robustness.test.tsx:127-133` at the component.

### Major 3 — `owedDueDate` had no test at the derive layer · **FIXED**

`derive.test.ts:1000-1018` adds the exact case the finding asked for: three open invoices supplied out of
due order with one carrying a null `due_date`, asserting `owedDueDate` is `'2026-08-15'` (so the
`byDueDate` sort's null-sorts-back behaviour is now pinned), plus an all-undated set asserting
`owedDueDate` is null. `owedDatedCount` is asserted in both.

### Major 4 — neither (a) nor (c) was tested at the call site · **FIXED**

`threshold.test.tsx:304` widens `renderThreshold(milestones = MILESTONES)` — every existing call site is
unchanged. Four new cases run against the real page, not hand-built props:

- `:580-591` `renderThreshold([])` rules six rail `li`s and names Discovery…Completion — this fails if
  `thresholdPhases(...)` is reverted to `splitSpinePhases(milestones)`.
- `:593-601` holds `procurement` with no span.
- `:553-568` a previous reading mark renders `doorstep-reading-mark` with the dateline text — this fails
  if `readingMark={…}` is dropped from the live doorstep (`threshold.tsx:637`).
- `:570-575` a first visit renders none.

The impl note's incidental observation is correct and I re-derived it: `previousReadAt` is a timestamptz
read as the local calendar day, so the fixture must be noon UTC. The implementation was already right;
only the fixture and its comment changed.

## Prior minors — all seven confirmed fixed

| # | Verdict | Evidence |
|---|---|---|
| 5 — invented opening geometry, floating tick | **Fixed (option 1 of the two the finding offered)** | `room-band.tsx:63` `WALL_L_OUTER = 30`; `:188-193` the outer face; `:195-202` the head now closes `30 → 42`. The head returns into a face that exists. `room-band.test.tsx:158-168` asserts both faces stop at `y=52` and the head's endpoints, so restoring a full-height wall now fails an assertion rather than a line count — the §8 gap the prior review named is closed. See new finding N2 for what the comment still overclaims. |
| 6 — file-head comment named two lines | **Fixed** | `room-band.tsx:47-54` names four strokes plus the dashed threshold and says why the dashed one is not a piece. |
| 7 — `#note` could not take focus | **Fixed** | `the-note.tsx:88` `tabIndex={-1}`, with the reason in a comment above it. Confirmed `<section id="note">` exists exactly when the pin does (`the-note.tsx:77` returns null iff `note` is null; the pin is gated on the same `model.note`). |
| 8 — the pin pointed backwards on the ground floor | **Fixed** | `threshold.tsx:492` `note={!model.groundFloor && mark.id === firstDoorId ? model.note : null}`. Verified both orders independently: `GroundFloor` receives `note` above `enclosures` (`threshold.tsx:706-717`), while the main path sets `{note}` *after* the bands (`threshold.tsx:760`), so the pin still points forward there. Pinned by `threshold.test.tsx:505-512`. |
| 9 — "first due" counted every open invoice | **Fixed as specified** | `derive.ts:171` + `:493` `owedDatedCount`; `house-ledger.tsx:76` reads it. `derive.test.ts:1007-1008`, `threshold-robustness.test.tsx:122-126`. See new finding N1 — the substitution creates a second, opposite copy ambiguity. |
| 10 — `archived` settled all six chapters | **Fixed** | `canonical-phases.ts:42` `const FINISHED_STATUS: Database['public']['Enums']['project_status'] = 'completed'`, consumed at `:78`. The free-text `complete`/`closed` values the enum cannot produce are gone, and a column rename now reaches this file at compile time. `canonical-phases.test.ts:82-87` pins that `archived` settles nothing. |
| 11 — a third link idiom | **Fixed** | `door-gate.tsx:409-422` is now a `ScoredAction` (`tertiary`, `href="#note"`), so the 44px control box and `makingEvents` telemetry come with it. I read `scored-action.tsx` to confirm the mechanics the fix depends on: `...rest` is spread onto `Link`, so `data-testid="door-note-read"` survives; `handleClick` awaits the caller's `onClick` after firing `actionSelected`, so `document.getElementById('note')?.focus()` (`door-gate.tsx:419`) actually runs and finding 7's `tabIndex` is reached. Both pre-existing assertions (`door-note-read`, `href="#note"`) still stand and pass. |

## Prior nits

Fixed: **13** (`doorstep.tsx:39-45` — kept and documented as defensive, which is the second option the
finding offered), **14** (`standing.ts:278` — `.!?` added to the strip class; the raw-cut fallback now
fires only on `lastSpace <= 0`; `dateline.test.ts:91-101`), **16** (`threshold.tsx:467-471` — `firstDoorId`
is the first door mark whose proposal is in `paperById`, matching the test `papers` already uses at
`:605`), **18** (`threshold.tsx:34` — the import is above `derive` and the block reads alphabetically).

Not fixed, with reasons I accept: **12** (record only — I re-ran `grep -rniI tester apps/client-portal/src`:
still nothing), **15** and **19** (both explicitly "not L9's file" / "none in L9" in the finding text
itself; correctly handed to integration and the mock-fidelity backlog), **17** (the finding said no change
required).

## Rulings and discipline, re-checked on the fix round

No new hook and no conditional hook: `walkedAt` is a plain function, `today` was already memoised, and
`document` is touched only inside an event handler (`door-gate.tsx:419`), never at render. The settle gate
still holds — `quietDoorstep` receives no `readingMark` and no ledger. Legal and confirmation copy is
still absent from the diff (`consent-copy.ts`, the countersign line, the signing ceremony). No new query,
no id from user input, no `service_role` reach: `owedDatedCount` is a filter over the same `openInvoices`
the ledger already read. Shared-file discipline holds, with one note for integration: the fix round widens
L9's merge surface by two files it did not touch before — `story-pole.tsx` and `the-note.tsx`.

---

## New defects introduced by the fix round

**N1 · minor · high · `apps/client-portal/src/components/threshold/house-ledger.tsx:74-76` (with `standing.ts:260`)**
— finding 9's fix trades one inaccuracy for its opposite. With three open invoices of which one carries a
day, the row now reads `Owed across 3 open invoices` / `$9,125 · due 15 August` — and a bare "due" against
a sum of three is exactly the reading the lane's own rationale called false ("a bare 'due 15 August'
against a sum of three would tell the client the whole balance falls due that day", `l9-impl.md` §(b)).
The new test at `threshold-robustness.test.tsx:122-126` pins that reading as intended, so it is a decision,
not an accident — but the decision contradicts the lane's stated principle. Neither "due" nor "first due"
is true of a partly-dated set; the honest line names what the day belongs to.
*Fix:* when `owedDatedCount < owedInvoiceCount`, print `soonest due 15 August` (or `one due 15 August`);
keep `due` only when every open invoice is dated and there is one of them.

**N2 · nit · high · `apps/client-portal/src/components/threshold/room-band.tsx:62-63`** — the new constant's
comment reads "Its thickness is the section's own, as the mock rules it", and neither half holds. The mock
rules its faces at x=28 and x=42 — 14 units, not 12 (`path-b-the-threshold.html:644-645`) — and rules them
full height, 16→206, with no opening anywhere in the section. The geometry is still invented (which the
prior review's option 1 sanctioned); the comment now claims mock authority it does not have, which is the
kind of line a later lane copies rather than checks.
*Fix:* set `WALL_L_OUTER = 28` to match the mock's thickness, and reword the comment to say the opening is
this surface's own departure from the section.

**N3 · nit · medium · `apps/client-portal/src/components/threshold/door-gate.tsx:412`** — the new act passes
`surfaceKey="the_threshold"` while the two ScoredActions already in this file
(`door_notice_replay` at `:321`, `gate_sign` at `:491`) pass none and therefore default to
`'the_making'` (`scored-action.tsx:117`). Three acts on the same door now report under two surface keys,
which splits the dimension for anyone reading `makingEvents` by surface. The new value is the more truthful
one; the inconsistency is the problem.
*Fix:* integration sets `surfaceKey="the_threshold"` on all three acts in `door-gate.tsx`, or drops it from
the new one until the whole surface is retagged.

**N4 · nit · low · `apps/client-portal/src/lib/threshold/standing.ts:277`** — relaxing the word-boundary
guard from `lastSpace > budget / 2` to `lastSpace > 0` (finding 14's second half) means a note whose first
word is followed by a long unbroken run now quotes that first word alone. The lane's own new test asserts
it: `noteInBrief('a bbbbbbbbbbbbbbbbbbbb', 12)` → `'a…'`. At the real budget of 140 this needs a ~130-character
unbroken token, so it is theoretical — recorded because the test enshrines a degenerate output rather than
guarding against it.
*Fix:* keep the word-boundary cut but fall back to the raw cut when the kept text would be shorter than,
say, a quarter of the budget.

**N5 · nit · low · `apps/client-portal/src/components/threshold/threshold.tsx:472` vs `:467-471`** — finding
16's fix guarded the door side only. `firstWallId` is still `wallMarks[0]?.id`, while `renderWall`
(`:499-501`) returns null for a mark whose selection is missing on exactly the same shape as `renderDoor`,
so a `#wall` anchor can still be minted on a gate that never renders — and `gateAnchor` feeds it to the
note's enclosure links at `:567`. Pre-existing rather than introduced, but the two sides now disagree.
*Fix:* `const firstWallId = wallMarks.find((mark) => selectionById.has(mark.id.replace(/^wall:/, '')))?.id ?? null;`

---

**Verdict: MERGEABLE** — all 4 prior majors confirmed fixed with call-site tests, all 7 minors fixed, 4 of
8 nits fixed and the other 4 correctly recorded or deferred with the prior review's own reasoning. Gates
reproduce exactly (type-check clean, 33 suites / 618 tests, eslint 0/0). Five new findings, none above
minor: N1 is the only one worth settling before the lane's copy is read by a client, and it is one string
in `owedDueLine`; N2–N5 can ride to integration.
