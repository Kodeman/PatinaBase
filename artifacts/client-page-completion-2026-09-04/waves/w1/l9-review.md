# L9 — Adversarial review

Branch `client-page-2/l9` @ `69767259edb9dfe16a791537cc1893c5a947c7d0`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l9`. Reviewed against the plan's L9 section,
spec §3, `docs/design/the-client-page/path-b-the-threshold.html`, inventory §8, and the shipped
`components/threshold` + `components/making` precedents. Read-only: no edits, no git writes.

---

## Gate output (re-run by the reviewer, verbatim)

`pnpm --dir <worktree>/apps/client-portal type-check`:

```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l9/apps/client-portal
> tsc --noEmit
```

Clean — no diagnostics.

`pnpm --dir <worktree>/apps/client-portal test -- threshold making`:

```
Test Suites: 33 passed, 33 total
Tests:       602 passed, 602 total
Snapshots:   0 total
Time:        5.228 s
Ran all test suites matching /threshold|making/i.
```

All three new suites present and passing: `src/lib/threshold/__tests__/canonical-phases.test.ts`,
`src/lib/threshold/__tests__/dateline.test.ts`,
`src/components/threshold/__tests__/threshold-robustness.test.tsx`.

`npx eslint src/components/threshold src/lib/threshold` (from `apps/client-portal`): no output —
0 errors, 0 warnings. Neither command needed the sandbox disabled.

The lane's reported gate output reproduces exactly.

---

## 1 — Does the lane deliver its whole list?

L9 absorbs no old route (inventory §8's fourteen gaps are L1–L8's). Its list is the plan's (a)–(f):

| Item | Delivered | Where | Works in place? |
|---|---|---|---|
| (a) Canonical six phases when `project_phases` is empty, current inferred from `currentPhase`/status, no date ranges | **Partly** | `lib/threshold/canonical-phases.ts`, wired at `threshold.tsx:414-417` | Yes for the `currentPhase` path — verified `openChapterOf` resolves identically through both routes, and `GroundFloor`'s Ahead (`ground-floor.tsx:59-62`) needs `targetDate`, which a canonical graduation never has, so no invented Ahead. **The status half ships no visible behaviour — finding 1.** |
| (b) "of $X planned" from plan total else Σ `budget_cents` | **Already shipped, correctly claimed not rebuilt** | `derive.ts` `plannedCents`, `threshold.tsx` `roomTargetCents()` | Yes — verified in `derive.test.ts` / `threshold.test.tsx`. |
| (b) Owed row carries "· due <day month>" | **Yes** | `derive.ts:486`, `house-ledger.tsx:66-71,104`, `standing.ts:244-247` | Yes — but no year, and untested at the derive layer (findings 2, 3). |
| (b) "Held" from wall bundles / "Awaiting your name" from open doors | **Already shipped, correctly claimed** | `derive.ts` `heldCents` / `awaitingCents` | Yes. |
| (c) Reading-mark dateline beside the since control | **Yes** | `standing.ts:232-235`, `doorstep.tsx:64,105,119-126`, `threshold.tsx:637` | Yes — copy byte-matches the mock (`path-b-the-threshold.html:381`), order inside the row matches (`button` then `.dateline`), absent on a first visit, absent from the quiet doorstep. Wiring untested (finding 4). |
| (d) Note pinned to the first door as a short quote + "Read the note" → `#note` | **Yes** | `door-gate.tsx:379-414`, `standing.ts:255-261`, `threshold.tsx:486` | Yes — one leaf only, body still set once. `#note` always exists when the pin does (`the-note.tsx:77,84` returns null iff the note is null). Focus and ground-floor ordering issues: findings 7, 8. |
| (e) Room drawing door opening on the plan-key side | **Yes, but invented geometry** | `room-band.tsx:62-65,171-196` | Renders; left side is the plan-key side (`plan-key.ts` strikes marks at `rect.x`) — correct reasoning. Geometry diverges from the mock and was never rendered: finding 5. |
| (f) Tester-notes widget padding / anchor move | **Not delivered — justified** | — | Re-verified independently: `grep -rniI tester apps/client-portal/src` returns nothing, and no `TesterWidget` under `packages/`. The widget is designer-portal-only, so the plan item's premise is false and no number was invented. Finding 12. |

---

## 2 — Byte-fidelity, hooks and payloads

No hook was added, no `@patina/supabase` change, no payload altered. `deriveThreshold` gains one derived
field read from invoices already in the model. There is no old route file for L9 to diff against;
the fidelity target is the mock, and the two new mock-sourced strings match it exactly:
`Read here on the fourth of August.` (mock:381) and `$9,125 · due 15 August` (mock:387). Confirmation
copy and legal lines are untouched — `consent-copy.ts`, the countersign line and the signing ceremony in
`door-gate.tsx` are not in the diff.

Two strings are new and not in the mock, both flagged by the lane: `first due <day month>` (finding 9)
and `Read the note` (plan-sanctioned by item (d)).

## 3 — Hooks discipline, settle gate, silence rule

Clean. `useMemo` for `phases` sits at `threshold.tsx:414`, above every early return (the branches are in
the JSX tail). No new hook, no conditional hook, no `window`/`document` touched at render — `StoryPole`'s
IntersectionObserver is pre-existing and inside `useEffect`. Every new helper is pure and calls neither
`new Date()` nor `Date.now()`, so the dateline and the due line are hydration-stable; `parseSourceDate`
reads a `YYYY-MM-DD` column as local midnight, so the date-only path cannot slide a day west of
Greenwich (pinned by a test). The settle gate is respected: `readingMark` is passed only to the live
doorstep, never to `quietDoorstep` (`threshold.tsx:657-665`). Nothing printed reverses — a canonical
graduation carries no date, and an unrecognised phase holds nothing rather than guessing.

## 4 — VISION §6

No shadow, no red/green, no badge, no tab, no header, no "AI". Money stays in cents. Voice is third
person; the only first person is inside the pin's quote marks, which the lane preserved. The one
grammar deviation is the pin's bare underlined anchor (finding 11).

## 5 — Overlay/sheet accessibility

The lane adds no overlay, sheet or dialog, so `role="dialog"` / focus trap / Esc do not apply. The one
new interactive element is the `#note` anchor; its focus behaviour is finding 7. The new SVG strokes
carry `data-testid` only and sit inside a drawing that already declares `role="img"` with an
`aria-label` that names footprints, not walls, so the label needs no change.

## 6 — Security

Nothing found. No new query, no new route, no new hook, no `service_role` reach, no id threaded from
user input. `owedDueDate` is read from `openInvoices`, which is already `visibleInvoices(input.invoices)`
under the same `useProjectInvoices(projectId)` the ledger's other figures come from — no path to another
project's or another client's rows, and no authorization the old surface enforced is skipped (L9 removes
no route and no gate).

## 7 — Shared-file discipline

Good, and merge-ready. `derive.ts` +3 lines (one interface field, one doc line, one literal entry).
`standing.ts` is append-only — four helpers after `keySentence`, no existing export touched.
`threshold.tsx` is three hunks plus imports. `mat.tsx` and `making/*` untouched, as claimed. The only
merge friction is the import placement (finding 18).

## 8 — Tests

Behaviour-shaped, not implementation-shaped: the suites assert rendered text and rendered geometry, and
`threshold-robustness.test.tsx` mocks the same module boundary `door-gate.test.tsx` already mocks
(`@/hooks/use-commercial-client`, `@/lib/analytics/events`), consistent with the `making/__tests__`
house style. `house-ledger.test.tsx` gains only `owedDueDate: null` so every existing assertion stands
unchanged — correct. Gaps: findings 3, 4, and a smaller one — `room-band.test.tsx` asserts the head and
the dashed threshold exist but never asserts the wall now STOPS at `FLOOR_Y - OPENING_H`, so restoring
the full-height wall would only trip the line count.

---

## Findings

1. **major · high · `apps/client-portal/src/lib/threshold/canonical-phases.ts:70-84`** — the `finished`
   branch (all six graduations `status: 'completed'`, `current: null`) is visually identical to the
   "nothing recognised" branch (all six `'upcoming'`). `story-pole.tsx` reads `phase.status` nowhere
   outside `graduationSpan`; walked-ness is `heldAt >= 0 && index < heldAt` (`story-pole.tsx:101,155`),
   and with `current: null` `heldAt` is `-1`, so a completed project draws six ungraduated chapters and
   six "ahead" dots. Plan item (a)'s "current inferred from … status" therefore ships no visible
   behaviour, and a client whose house is finished sees a pole that says nothing has begun.
   *Fix:* in `story-pole.tsx`, fall back when nothing is held — `const walked = heldAt >= 0 ? index < heldAt : graduation.phase.status === 'completed'` — and style the rail entry to match.

2. **major · high · `apps/client-portal/src/lib/threshold/standing.ts:244-247`** — `owedDueLine` formats
   through `dayAndMonth`, which never prints a year, so an invoice due 15 August 2025 (or 2027) reads
   "$9,125 · due 15 August" beside a live balance with nothing to say which year. The house already owns
   this rule: `spine-toll.tsx:55-61` and `letterbox.tsx:48-52` spell the year the moment the due date is
   not this year — and the ledger is the row an overdue balance is most likely to sit in.
   *Fix:* thread `today` into `owedDueLine` and append `due.getFullYear()` when it differs, exactly as `formatDue` does.

3. **major · medium · `apps/client-portal/src/lib/threshold/derive.ts:486`** — `owedDueDate` has no test
   anywhere in the tree (grep confirms: the only test references are to the model field, never to
   `deriveThreshold`'s output). The whole "soonest due" guarantee rests on the `byDueDate` sort at
   `derive.ts:456-458`, and the subtle part — that a null `due_date` sorts to the BACK, so `[0].due_date`
   is null only when every open invoice lacks one — is unpinned. A reordering of that sort, or a change
   to `visibleInvoices`, silently puts the wrong day beside the balance.
   *Fix:* add a `derive.test.ts` case with three open invoices supplied out of due order, one carrying a null `due_date`, asserting `ledger.owedDueDate` is the soonest.

4. **major · medium · `apps/client-portal/src/components/threshold/threshold.tsx:414-417,637`** — neither
   (a) nor (c) is tested at the call site. `threshold-robustness.test.tsx` renders `StoryPole` and
   `Doorstep` directly with hand-built props, so a regression that dropped `project.status` from
   `thresholdPhases(...)` or removed `readingMark={…}` from the live doorstep leaves all 602 tests green.
   These are the two lines the lane actually changed on the page.
   *Fix:* two cases on the existing `renderThreshold()` harness in `threshold.test.tsx` — `milestones: []` yields six rail entries; a project with a previous reading mark renders `doorstep-reading-mark`.

5. **minor · high · `apps/client-portal/src/components/threshold/room-band.tsx:171-196`** — the opening's
   geometry is invented, not taken from the mock, and was never rendered. The mock's section
   (`path-b-the-threshold.html:643-649`) rules a FULL-height left wall (x=42, y 16→206), a second wall
   face at x=28 with a `buildup` hatch between them, a ceiling line and a right-hand wall, and no opening
   at all — the dashed 0→42 floor line IS the mock's threshold. This lane instead cuts the wall at
   `FLOOR_Y - OPENING_H` and returns a 12-unit head to `x = WALL_L - JAMB_W = 30`, where no wall face is
   drawn, so the head is a floating tick and a 38-unit wall stub stands over a 52-unit gap. The lane's own
   "Not verified" section concedes no browser pass.
   *Fix:* either draw the second wall face at x=30 so the head returns into something, or drop the wall cut and keep the mock's full-height wall plus the dashed threshold.

6. **minor · high · `apps/client-portal/src/components/threshold/room-band.tsx:47-51`** — the file-head
   comment still reads "Two lines carry the room — the floor everything stands on and the wall it stands
   against — and every other stroke on the sheet is a piece the client actually owns." The drawing now
   rules four lines and two of them are not pieces.
   *Fix:* reword the comment to name the four strokes.

7. **minor · medium · `apps/client-portal/src/components/threshold/door-gate.tsx:406-413` (with `the-note.tsx:83-88`)**
   — `href="#note"` targets a `<section id="note">` carrying no `tabIndex`, so activating "Read the note"
   scrolls the viewport but moves neither keyboard focus nor the screen reader's cursor: a keyboard user
   is left standing on the door leaf. This is the standard skip-link failure.
   *Fix:* add `tabIndex={-1}` to the `#note` section in `the-note.tsx`.

8. **minor · medium · `apps/client-portal/src/components/threshold/ground-floor.tsx:66-70`** — the ground
   floor's order is Doorstep → **Note** → Enclosures, so on that path the full letter is set ABOVE the
   doors and the pin's "Read the note" points backwards at a paragraph the client read one section ago.
   The pin's own contract comment (`door-gate.tsx:84-92`) argues against exactly this reading-twice.
   *Fix:* pass `note={null}` to the doors on the ground-floor path, or move `{note}` below `{enclosures}` there.

9. **minor · medium · `apps/client-portal/src/components/threshold/house-ledger.tsx:70` + `standing.ts:244-247`**
   — "first due" is chosen from `owedInvoiceCount` (every open invoice), not from how many actually carry
   a due date. Three open invoices of which only one is dated reads "$X · first due 15 August", promising
   further days that do not exist. Note also that the row's own label already says "Owed across 3 open
   invoices", so the plurality is stated twice.
   *Fix:* pass the count of open invoices carrying a `due_date` (add it beside `owedDueDate` in `derive.ts`) rather than `owedInvoiceCount`.

10. **minor · medium · `apps/client-portal/src/lib/threshold/canonical-phases.ts:36`** — `archived` settles
    all six chapters as done. The generated enum (`packages/supabase/src/database.types.ts:34945`) is
    `active | completed | archived | on_hold | draft`: archived means withdrawn from view, not finished,
    and a project archived mid-Procurement would be told its Installation and Completion are behind it.
    (`complete` and `closed` in the Set are values the enum cannot produce.) The lane listed this as
    "inferred"; the enum settles it.
    *Fix:* settle on `completed` only, and type the check against the generated `project_status` union rather than a free-text `Set<string>`.

11. **minor · medium · `apps/client-portal/src/components/threshold/door-gate.tsx:406-413`** — the "Read the
    note" anchor is a bare, always-underlined mono-uppercase `<a>`: a third link idiom on a surface that
    has two. Every other in-page anchor is `no-underline hover:underline` (`the-note.tsx:123-126`,
    `mat.tsx:49-53`) and every ACT is a `ScoredAction`, which accepts `href` (`scored-action.tsx:82-90`)
    and brings the 44px control box and `makingEvents` telemetry with it. The mock's own act inside the
    pin is a scored-ink button (`path-b-the-threshold.html:606`, class `si ter`). Global constraint:
    "scored-ink acts (`ScoredAction`)".
    *Fix:* `<ScoredAction actionKey="door_read_note" regionKey="gate" variant="tertiary" href="#note">Read the note</ScoredAction>`.

12. **minor · low · plan item (f), not in the diff** — (f) is not delivered. I re-ran the lane's evidence
    independently: `grep -rniI tester apps/client-portal/src` returns nothing and no `TesterWidget` exists
    under `packages/`, so the widget is designer-portal-only and the plan item's premise is false. The
    lane was right not to pad to a footprint that does not exist on this surface; recording it so the
    integration lane closes (f) deliberately rather than by omission.
    *Fix:* integration marks (f) void, and re-opens it with a measured footprint if the widget is ever mounted in the client portal.

13. **nit · high · `apps/client-portal/src/components/threshold/doorstep.tsx:105`** — `|| readingMark` in
    the row guard is dead. `readingMark` is non-null only when `previousReadAt` is a string, which is the
    same condition that makes `showSince` true (`threshold.tsx:290-291`), so `showSince || moved` already
    covers every case. Harmless, but it asserts a state that cannot occur.
    *Fix:* drop `|| readingMark`, or keep it and say in the prop doc that it is defensive.

14. **nit · medium · `apps/client-portal/src/lib/threshold/standing.ts:255-261`** — `noteInBrief`'s
    trailing-punctuation strip is `/[\s,;:—-]+$/`, which excludes `.`, `!` and `?`, so a cut landing just
    past a sentence end prints `…Friday.…`. Separately, when the first 140 characters contain no space
    past the halfway mark the cut lands mid-word (the `budget = 12` test exercises the good path, not this
    one).
    *Fix:* add `.!?` to the strip class, and only fall back to the raw `cut` when the text genuinely has no space.

15. **nit · medium · `apps/client-portal/src/components/threshold/house-ledger.tsx:104` vs `making/spine-toll.tsx:55-61`**
    — the same invoice's due date now appears twice on one page in two idioms: the ledger's "due 15
    August" and the letterbox's "due August 15". The mock uses day-first in both places
    (`path-b-the-threshold.html:387,404,409`), so the ledger is the faithful one and the letterbox is out
    of step. Not L9's file to change (`making/*` is reuse-only), but the disagreement lands with this lane.
    *Fix:* integration brings `spine-toll.tsx`'s `formatDue` onto the mock's day-first idiom.

16. **nit · low · `apps/client-portal/src/components/threshold/threshold.tsx:479-491`** — `renderDoor`
    returns `null` when `paperById` has no paper for the mark, so if the FIRST door mark is the one
    missing its paper the pin appears on no door at all — every later door was handed `note={null}`.
    Unlikely (door marks are minted from `signatureGates`), but it is a silent loss in a lane about
    robustness.
    *Fix:* compute `firstDoorId` over door marks whose `proposalId` is present in `paperById`.

17. **nit · low · `apps/client-portal/src/lib/threshold/canonical-phases.ts:23-30`** — a `lib/` module now
    imports `splitSpinePhases` and `recognisePhaseSlug` from `@/components/making/making-spine`, deepening
    the lib→components inversion. `standing.ts:11` already does this, so it is the house pattern rather
    than a new sin, but it is one more edge the retirement plan has to carry when `making/` is split.
    *Fix:* none required; note it in the retirement inventory.

18. **nit · medium · `apps/client-portal/src/components/threshold/threshold.tsx:43`** — the
    `canonical-phases` import sits AFTER the `@/lib/threshold/derive` block, so the `@/lib/threshold/*`
    imports are no longer alphabetical. ESLint does not enforce it here (0 errors confirmed), but L9
    merges FIRST and every later lane touching this import block inherits the noise.
    *Fix:* move it above the `derive` import.

19. **nit · low · `apps/client-portal/src/components/threshold/door-gate.tsx:397-406`** — mock fidelity of
    the pin's caption, which this lane's brief owns even though it did not change the line: the mock signs
    `— N. · Nora Quist · 4 August, yesterday` (`path-b-the-threshold.html:605`) — a monogram, the person
    who wrote it, and a relative day — and keeps "Earlier letters" inside the pin. The implementation signs
    `— Quist Interiors · 4 August`, attributing a first-person letter to a company.
    *Fix:* none in L9; record for the mock-fidelity backlog alongside the "Owed on invoice No. 4" label.

---

**Verdict: MERGEABLE_WITH_FIXES** — 19 findings (0 blocker, 4 major, 7 minor, 8 nit). The lane is honest,
narrowly scoped, gate-green and merge-clean; no security issue and no shared-file overreach. Fix 1, 2, 3
and 4 before the L9-first merge; 5–11 are cheap and better done here than at integration; the rest can
ride.
