# Lane D8 — Desk residuals

**Branch** `portal-polish/d8` · cut from `origin/main` **`9b66cb83f`** · head **`9fe8d4d5e`**
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d8`
**Three commits, as instructed.** 41 files, all under `apps/designer-portal`. Nothing outside it,
nothing in `packages/`, nothing in `supabase/`.

```
9fe8d4d5e fix(designer): a selected scored control outranks hover
8f80366f9 fix(designer): one date style on roster rows and the document (PP-2)
5ec680cf1 fix(designer): concept render upload uses the record/remove hooks — no orphaned objects
9b66cb83f docs(portal-polish): W3b ship report, program report, lane reviews, and the Desk renders  ← origin/main
```

**One thing to read before the rest.** Item 2's grep check — *zero `en-US` left in
`src/lib/document`, `desk-roster.tsx` and `app/(document)`* — **is not met, and I did not try to
force it.** 22 of the 31 hits were dates and are gone; **14 lines survive** and every one is either
a currency formatter (where `en-GB` prints `US$17,500`), a 12-hour clock (where `en-GB` prints
`2:00 pm`), or a fixed-character-count lens register that `cap()` would truncate — truncation being
the thing the house sheet forbids. §2.4 lists all fourteen with a verdict each. The stated goal —
one date idiom on the roster row and on the document page — **is** met.

---

## 1 · Item 1 — the concept-render upload on the A3 hooks

`apps/designer-portal/src/components/document/rooms/concept-render-upload.tsx`
`apps/designer-portal/src/components/document/__tests__/concept-render-upload.test.tsx`

**The bug that is fixed.** The local `clearConceptRender` nulled the four columns and left the
object sitting in the private `room-renders` bucket forever. `useRemoveRoomConceptRender`
(A3, `packages/supabase/src/hooks/use-room-concept-render.ts:206-247`) deletes the object FIRST and
only nulls the row once the delete lands. The component now calls that hook and hands it the stored
`path`. `clearConceptRender` and the local signer are deleted.

**The structural constraint, and what I did about it — this is the design decision to review.**

D6's finding is real and I re-measured it. Fifteen suites mount `FFESection`, which mounts
`ConceptRenderUpload` under *every* room heading, and they mount it with **no
`QueryClientProvider`** *and* a `jest.mock('@patina/supabase', …)` factory that defines only the
hooks the section itself uses (e.g. `components/document/__tests__/ffe-section-life.test.tsx:44-51`,
and the comment those suites carry at `:144` — *"This suite mounts the region with no
QueryClientProvider … so these three have to be mocked too or the root throws 'No QueryClient
set'"*). Any React Query hook called from the always-mounted body would be `undefined` there and
throw during render — in fifteen suites, not one.

So the component is now **three components, and the always-mounted one calls no hook at all**:

| component | mounts | what it may call |
|---|---|---|
| `ConceptRenderUpload` | always, under every room heading | nothing. One hook-free probe: `select('concept_render_url')`, no signing. It answers only *does this room have a render?* |
| `StandingConceptRender` | only once the probe says yes | `useRoomConceptRenderRecord` (the plate, caption, day) + `useRemoveRoomConceptRender` (Remove) |
| `ConceptRenderForm` | only after the studio opens the act | `useRoomConceptRender` (upload), as before |

**Why the probe is a probe and not the whole read** (the brief's "or gate it the way D6 did"):
the closed state has to show an existing render, and a hook cannot be called conditionally, so
*something* hook-free has to answer the existence question. Making that something as small as
possible — one column, no `createSignedUrl` — means the shared hook still owns the read that
matters. That also buys a real thing the old one-shot `useEffect` could not: a signed URL against a
private bucket expires in an hour, and React Query re-signs on its own schedule where an effect that
ran once at mount keeps handing out a stale link. In the fifteen provider-less suites
`createBrowserClient` is `undefined`, the probe throws, the catch swallows it, `standing` stays
`null`, and no child ever mounts — no hook, no provider needed. Verified: those suites are green,
unedited.

**One deliberate behaviour change.** `standing` is `boolean | null` and the act row renders only
once the probe has answered. Before, "Add a concept render" rendered immediately and flipped to
"Replace" a tick later on a room that had one — copy that reverses itself, which *Absence is
silence* forbids. Now the heading is silent for that tick instead.

**Tests.** `concept-render-upload.test.tsx` rewritten around the hooks: 12 tests (was 11). The row
update is no longer asserted here — the object-before-row ordering is proved in the package's own
suite (`packages/supabase/src/hooks/__tests__/use-room-concept-render.test.ts:397`,
`invocationCallOrder`) — so this suite asserts the component's half instead: the stored `path`
reaches the remove hook. Two new contract tests guard the structural constraint by name:

* *"asks the room one hook-free question and calls no React Query hook while nothing stands"* —
  asserts `selected === ['concept_render_url']` and that neither hook was called.
* *"reads a standing render through the record hook, room by room"* — asserts the record hook gets
  `{ projectId, roomId }`.

The five FFESection suites named in the brief, plus the other ten that mount it, are green and
byte-unchanged:

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/components/document/schedule/__tests__/ffe src/components/document/__tests__/ffe-section \
    src/components/document/shelves/__tests__/spec-book-leaf.test.tsx
Test Suites: 8 passed, 8 total · Tests: 113 passed
```

---

## 2 · Item 2 — one date style (PP-2)

### 2.1 What the divergence actually was

`w3b-ship.md` §4 divergence 1 named two lines that contradict each other on one screen: the day's
line saying `respond by 11 September` above a roster row saying `New lead — respond by Sep 11`.
Only one function in the app produces that second string — `desk-derivation.ts:796` — and the
document page's copy of it comes from the same place (`grep -rn "New lead"` finds no other
producer). So the roster row and the document page's copy are one fix, and it is the fix the brief
named.

### 2.2 Bodies changed (11 files, all in `src/lib/document`)

| file | was | is |
|---|---|---|
| `desk-derivation.ts` | private `fmtDay` → `Sep 11` | `dayMonth(iso) ?? ''` — an unreadable date is now silence, not `Invalid Date` |
| `format.ts` | `fmtDay` `Sep 11`, `fmtMonth` `Sep`, `fmtMonthYear`, `formatCalendarDate` `Jan 15, 2026` | `DAY_MONTH_FORMAT` / `MONTH_NAME_FORMAT` / `legalDate`. **This is the shared file w3b named** (folio cards, the margin, the guide) — 71 files consume `fmtDay` |
| `document-guide.ts` | `Tuesday, September 15` · `Sep 11` | `Tuesday, 15 September` · `11 September`, composed from `WEEKDAY_FORMAT` + `DAY_MONTH_FORMAT` |
| `proposal-watch-derivation.ts` | send wall `Sent Aug 9` | `Sent 9 August` |
| `desk-conflicts.ts` | Desk collision `Jul 13` | `13 July` |
| `ticket-derivation.ts` | `Install Tuesday, September 15` | `Install Tuesday, 15 September` |
| `lens-quiet-status.ts` | `Install Sep 19` | `Install 19 September` |
| `project-commerce.ts` | `when` → `Jan 15, 2026` | `legalDate` → `15 January 2026` |
| `people-derivation.ts` | journey stamp `Apr 2026` | `April 2026` |
| `studio-setup.ts` | `Set up · September 2026` | same string, one locale (en-US and en-GB agree on `month:'long', year:'numeric'`) |
| `field-sms.ts` | `Tue, Jul 14` | `Tue 14 July` |

`dates.ts` gains exactly one export — `WEEKDAY_SHORT_FORMAT` (en-GB `weekday: 'short'`) — so
`field-sms.ts` composes its weekday from the same file as everything else rather than building a
third formatter. Nothing else in `dates.ts` moved.

**`formatCalendarDate` keeps its timezone discipline.** It exists to stop a day written on a paper
sliding back one in a negative-offset zone, so it does *not* just call `legalDate` on the raw value:
a bare date is still rebuilt at local noon, and a timestamp still has its **UTC** Y/M/D read off it
first and then printed through `legalDate`. Its own suite runs in `America/Chicago` on purpose and
still passes.

### 2.3 Tests: 26 files, 68 pinned strings

Every failure after the body change was a pinned date literal; none was a logic failure. All 68 were
updated in place (`Sep 11` → `11 September`, `Jan 15, 2026` → `15 January 2026`, `Sep 2026` →
`September 2026`, `Tue, Jul 14` → `Tue 14 July`, and the regex forms of each). Two test files were
themselves composing `new Intl.DateTimeFormat('en-US', …)` to build their expected value —
`desk-derivation.test.ts:412` now imports `dayMonth` from `../dates`, and `format.test.ts:54` (which
deliberately demonstrates the timezone-aware read that loses a day) now demonstrates it in the
house's own idiom.

### 2.4 The 14 `en-US` lines still standing, and why each one is

```
$ grep -rn "en-US" src/lib/document src/components/document/desk-roster.tsx "src/app/(document)"
```
`desk-roster.tsx` and `app/(document)` are **clean — zero.** All fourteen are in `src/lib/document`:

**Money — 7 lines. `en-GB` with `currency: 'USD'` prints `US$17,500`, not `$17,500`.** PP-2/R140
rule date idioms; currency is not one, and `dates.ts` offers no money helper, so routing them
through it is not available. Left, with the reason written into `format.ts:70-71`:
`people-derivation.ts:511` · `desk-derivation.ts:490` · `project-commerce.ts:460` · `format.ts:73`
(+ its comment, `:70`) · `amendment-derivation.ts:71` · `discovery-seed.ts:56` ·
`__tests__/lens-quiet-status.test.ts:18`.

**A 12-hour clock, timezone-scoped — 2 lines. `desk-derivation.ts:513,517` (`fmtDayTime`,
"Discovery · Thu 2:00 PM").** Neither half is a date idiom: the weekday is `short` (identical in
en-GB — `Thu`) and the other half is a clock, which en-GB prints as `2:00 pm`. It also formats per
ceremony timezone, so it cannot use `dates.ts`'s cached module-level formatters at all. **Owed as a
ruling:** is `2:00 pm` wanted, or does the house keep `2:00 PM`? One line changes it either way.

**A combined date + clock, timezone-scoped — 1 line. `ceremony-schedule.ts:86` (`fmtCeremonySlot`,
"Tue Sep 15 · 2:00 PM").** One `formatToParts` call carries both halves; splitting it to move only
the date half would undo the reason the function was written that way (its comment at `:81-82`: the
house " · " divider must not depend on a locale's punctuation). Same ruling as above.

**The lens ladder's fixed-width registers — 3 lines. `lens-ladder-derivation.ts:163` (`railDate`,
`SEP 15`), `:173` (`plainDate`), `:183` (`countDate`, `Tue Sep 15`).** These are the doc spine's
narrow rail, and **every value they feed is hard-truncated** — `cap(value, LENS_VALUE_MAX_CHARS)` /
`cap(words, LENS_COUNT_MAX_CHARS)` (= 40), at `lens-ladder-derivation.ts:261,265,288,320,324,369-371`
and eight more sites. `SEP 15` → `15 SEPTEMBER` doubles the register's width inside a hard character
cap, so the change would push real lines into truncation — the one thing the house sheet flatly
forbids ("No truncation — wrap"). **I will not make that change blind, and this lane cannot render
to measure it**: Wave 2c owns the local DB, and the plan gives port 3000 to the Wave 3 integration
lane. **Owed:** a render at 1440 and 390 with the longer register, or a ruling that the rail keeps
its short form. This is the only residual I would call a genuine unfinished piece of PP-2.

**Outside the grep paths** (found, listed, not touched, per the brief):
`src/lib/procurement/*`, `src/components/mood-board/*`, `src/app/(portal-legacy)` and the
admin/client portals were not searched — only the three named paths were. Within the designer
portal, `grep -rn "en-US" src | grep -v "src/lib/document"` returns hits in
`src/lib/procurement/delivery-conflicts.ts`, `src/components/mood-board/`, `src/lib/scope/` and
several component files; none is on the Desk roster row or the document page's own derivations, and
none was changed.

---

## 3 · Item 3 — selected beats hovered

`apps/designer-portal/src/app/globals.css` · `apps/designer-portal/src/lib/document/__tests__/action-rest-rules.test.ts`

`.da-score-on::after` is `(0,1,1)`; `.da-score-hover:hover::after` is `(0,2,1)`. The selected tab
therefore went **clay while the pointer sat on it** — w3b observed it live on the Orders ledger's
`LEDGER` tab. Naming both classes raises the held rule to the hover rule's weight (and, declared
after it, wins at equal weight) and beats the hovered/focused pair outright:

```css
.da-score-hover.da-score-on::after,
.da-score-hover.da-score-on:hover::after,
.da-score-hover.da-score-on:focus-visible::after {
  background-color: var(--color-charcoal);
}
```

`:focus-visible` is included because it is the *same rule* the brief said to outrank —
`.da-score-hover:hover::after, .da-score-hover:focus-visible::after` is one selector list, and
leaving the keyboard half clay would have swapped one inconsistency for another. Focus is still
announced: ad-hoc scored controls carry the standard 2px clay `focus-visible` outline. A specificity
bump only — same token, **no new hex, no shadow**, `.da-score-on::after`'s own body untouched.

The contract assertion in `action-rest-rules.test.ts` checks the rule exists, carries
`--color-charcoal`, carries no `box-shadow`, **and is declared after the clay hover rule** (source
index comparison). Proved to be a real gate, not a tautology — with the CSS rule deleted the suite
fails, and only that test:

```
✕ keeps a selected score charcoal under the pointer — selected beats hovered
Tests: 1 failed, 11 passed, 12 total
```

---

## 4 · Gates (real output, at head `9fe8d4d5e`)

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit                                        (exit 0, no output)

$ pnpm --filter @patina/supabase type-check
> tsc --noEmit                                        (exit 0, no output)

$ pnpm --filter @patina/designer-portal test -- --ci
Test Suites: 549 passed, 549 total
Tests:       6810 passed, 6810 total
Snapshots:   12 passed, 12 total
Time:        23.45 s

$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
  piece-room-save-gate.test.tsx:159    import/first
  use-commercial-documents.test.ts:930 react-hooks/rules-of-hooks
```

**Baseline was 549 / 6807 and `205 problems (2 errors, 203 warnings)`.** Now **549 / 6810** — no
suite gained, no suite lost, **+3 tests** (2 new contract tests on the concept render, 1 on the
score rule). Lint is **identical to the baseline**, count included: the two known errors, same
files, same lines, same rules. (An intermediate run showed 206; that was one unused
`eslint-disable` I had added in the new probe — removed, and the commit rebuilt so the branch never
carries it.)

**Shadow gate green and unedited:**

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/lib/document/__tests__/shadow-gate.test.ts src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts \
    src/lib/document/__tests__/action-rest-rules.test.ts
Test Suites: 4 passed, 4 total · Tests: 75 passed

$ git diff origin/main --stat -- .../shadow-gate.test.ts .../contrast.test.ts \
    .../rail-stock.test.ts apps/designer-portal/eslint.config.mjs
(empty — all four byte-unchanged)
```

**No dev server started, no `supabase db reset`, no `db:generate`, no port bound.** Wave 2c keeps
the local DB and :3002; this lane ran jest, type-check and lint only, as instructed.

**Push:**
```
$ git ls-remote origin portal-polish/d8
19d86767df0ceb83c54f15be102898755eaa6ee4  refs/heads/portal-polish/d8   (this report's own commit)
```
Code head is **`9fe8d4d5e`**; `19d86767d` adds only this file.

---

## 5 · Owed forward

1. **The lens ladder's three date registers** (§2.4) — needs a render or a ruling before the register
   grows inside `cap(…, 40)`. The only real remainder of PP-2 in `lib/document`.
2. **`2:00 PM` vs `2:00 pm`** — `desk-derivation.fmtDayTime` and `ceremony-schedule.fmtCeremonySlot`.
   A one-line change each once ruled.
3. **`field-sms.fmtFieldDate` now reads `Tue 14 July`** and that string leaves the building — it goes
   into an SMS to a US trade. Changed because it is inside the grep path and the same string renders
   in the portal's own composer preview, but flagging it: if outbound SMS should keep a US idiom,
   that is one line and one test.
4. **Money stays `en-US` in seven places** (§2.4). If the house wants that stated as a rule rather
   than a comment in `format.ts`, it belongs in `DECISIONS.md`, which no build lane may write.
5. The renders w3b listed as still owed (the 390 reflow, the boards rail's live content) are
   untouched here — no lane was given them.
