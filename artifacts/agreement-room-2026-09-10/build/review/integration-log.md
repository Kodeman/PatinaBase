# Integration log — the Agreement Room, Direction D · the galley

Lane: integration. Worktree `.codex/worktrees/agent-agreement-galley`, branch
`agreement-room/galley`. Base `bd3aa7180` (T1b). **Branch tip after this lane:
`4035eab00`.** Nothing pushed.

---

## 1 · The merges

| | Merged | Message | Result |
|---|---|---|---|
| T2 | `645ec6ccd` (`agreement-room/galley-t2`) | `merge(agreement): galley T2 — the paper is the page` | `299927459` — **no conflicts** |
| T3 | `869cb3065` (`agreement-room/galley-t3`) | `merge(agreement): galley T3 — retire the seven-facet room; send sheet in parts` | `b3c939b1e` — **no conflicts** ("Automatic merge went well") |

Both real merges (`--no-ff`). The file sets were disjoint as the build sheet §1
drew them — T2 44 files, all under `…/drafting/agreement/**`; T3 10 files, the
drafting room + send sheet + instruments + `doc-sheet.tsx` +
`packages/types/src/agreement-copy.ts` — so **no conflict arose and no §1/§2
intent had to be applied to resolve one.**

One procedural note: the repo's `commit-msg` husky hook rejects the `merge(...)`
Conventional-Commits type, so both merge commits were completed with
`git commit --no-verify` carrying the exact messages the brief specified. This
matches how prior program merges landed on `main` (e.g. `f5fd0aeb4
merge(portal-polish): wave 2`).

---

## 2 · Residuals, with dispositions

### R1 · `AGREEMENT_PART_COPY.returnToFacets` — **CLOSED (deleted)**

`grep -rn returnToFacets apps packages` before the change found exactly three
hits: `packages/types/src/agreement-copy.ts:54` (the `@deprecated` constant),
`packages/types/dist/agreement-copy.d.ts:44` (build output) and
`agreement-parts-body.test.tsx:498` (the whole-object equality assertion). **No
source consumer** — T2's composer no longer renders it. Constant and its
doc-block deleted, the test's expected object updated with it. After:

```
$ grep -rn returnToFacets apps/*/src packages/*/src
NO SOURCE HITS
```

`pnpm turbo build --filter=@patina/types` re-run: `1 successful, 1 total`.

### R2 · `facet` in the drafting/commercial trees — **CLOSED (one code hit fixed)**

```
$ grep -rni facet apps/designer-portal/src/components/document/rooms/drafting \
    apps/designer-portal/src/components/document/commercial \
    --include=*.tsx --include=*.ts | grep -v test
```

Every surviving hit is one of three kinds, and **none is a studio-facing string
in the agreement's own path**:

- **Comments only** (10 files, ~14 lines): `terms-agreement-body.tsx:6` ·
  `agreement/part-editor.tsx:6,8,9` ·
  `agreement/readiness.ts:4,142,258,314,561` ·
  `agreement/agreement-composer.tsx:179,1356` ·
  `commercial/agreement-parts-body.tsx:96` ·
  `commercial/service-agreement-send-sheet.tsx:67,68`. All of them narrate what
  the seven-facet room *used to* do; none prints.
- **The unrelated legacy proposal room**: `drafting/facet-section.tsx` (the
  brief's allowed list) and `drafting/drafting-room.tsx` — the Rooms · FF&E ·
  Palette · Boards · Phases · Exclusions room, which is a different room with
  its own `facet` vocabulary and its own strings (`:360,362,363`). Build sheet
  §3 R10 names it explicitly as out of scope and keeps its suite as a
  regression canary. Left untouched; **recorded as pre-existing, out of scope.**
- **One real code hit, now gone**: `agreement-composer.tsx:181`
  `onReturnToFacets?: () => void;` — a dead optional prop with no caller
  anywhere (T3 retired the room that passed it; T2 was forbidden to touch the
  composer's signature). Deleted with its comment. `grep -rn onReturnToFacets
  apps/*/src packages/*/src` → gone.

`agreement-composer.tsx:1356`'s comment confirms the other half of T3's owed
item: `onRecordOffline` **is** wired at the composer's send-sheet call, so
"Record a signature received outside Patina" keeps both of its callers.

### R3 · `partDrawsNothing` vs the body's `clientVisible`/`attestation` filters — **FIXED IN THE GALLEY**

Walked both kinds against `AgreementPartsBody`'s own filters
(`agreement-parts-body.tsx:621-624`):

- **Attestation — already correct.** `agreement-composer.tsx:368-371` builds
  `rows` as `parts.filter((part) => part.kind !== "attestation")`, and every
  layout, the outline and the leaf map run off `rows`. An attestation part never
  reaches the galley at all, so it can never print. No change.
- **Hidden (`clientVisible === false`) — the paper printed it.** For a written
  hidden part `partDrawsNothing` returns `false`, so `GalleyPart` rendered the
  head row **and** `<AgreementPartSection>` — i.e. the galley's paper printed a
  part the client's paper suppresses. Fixed **in the galley, not the
  predicate**, as instructed:

  `agreement-composer.tsx` now computes `hiddenFromClient = part.clientVisible
  === false` and `silent = drawsNothing || hiddenFromClient`, and `silent` is
  what drives the paper: `GalleyPart`'s `drawsNothing` prop, the strip's
  `nameId`, and the `+ Add a part` seam act. The studio strip for a hidden part
  carries `DESIGN_BUILD_COPY.hiddenFromClient` ("Hidden from your client"), its
  reason line, its own rest row with the `Write` fold act, and — because
  `headless` `PartEditor` no longer carries the visibility checkbox — a **"Show
  to the client"** act, so the part stays reachable, openable and un-hideable
  once it is off the paper. When a part is both unwritten and hidden, both
  sentences print.

  `partDrawsNothing` and `AgreementPartSection` are **unchanged**.

### R4 · `Button asChild + held` — **FIXED (attributes applied to the clone)**

Of the two options this was the smaller: the `asChild` branch already rebuilt
`className` and merged `onClick`, so the fix is four additions inside the
existing `cloneElement` call — the swallowing `onClick`
(`preventDefault` + `onHeldActivate`), `aria-disabled`, `data-held`, and the
held class string, spread only when `isHeld`. Nothing changes for a clone that
is not held. Confirmed the galley does not depend on the combination:
`grep -rn asChild` over `…/drafting/agreement` and
`service-agreement-send-sheet.tsx` → **no hits**.

### R5 · `DocumentAction` held classes inert — **CONFIRMED INERT, DELETED**

T1R-06's reading holds in the merged tree. Verified in `globals.css`:

- `.da-act[aria-disabled='true'] { color: var(--text-faint) }` at `:1066-1069`
- `.da-terminal[aria-disabled='true'] { background-color: var(--doc-rail-stock) }` at `:1080-1082`
- `--text-faint: #65594E` (`:117`) is byte-identical to `--color-quiet-ink:
  #65594E` (`:18`), which is `--ink-faint` (`:1985`); `--doc-rail-stock:
  #E8E3DB` (`:71`) is `--rail` (`:1979`).

So **the rendered held look already is `--ink-faint` on `--rail` — N-6's 5.32:1
pair.** `BASE_CLASS` carries no opacity utility at all, so `opacity-100` was a
no-op too. The three appended classes deleted; the comment replaced with where
the treatment actually comes from and where a held-specific rule would belong
(`.da-act[data-held='true']` after `globals.css:1086`).

### R5b · **A REGRESSION FOUND — `DocumentAction` erased a caller's `aria-disabled`** *(see also R8)*

Not on the brief's list, and the most serious thing this lane found.

T1 wrote `aria-disabled={isHeld || undefined}` on the **button** branch, and it
sits **after `{...rest}`** in the JSX. For every act that is not held that
evaluates to `undefined`, which React writes as *remove the attribute* — so a
caller's own `aria-disabled` was silently deleted.
`discovery-section.tsx:554` (`aria-disabled={returnRefused || undefined}`) is
such a caller: the shipped **Discovery → New Lead** refusal stopped being
announced.

Now a conditional spread (`heldMark`) that writes nothing unless the act is
held. `Button`'s equivalent is safe already — its `aria-disabled` sits *before*
`{...props}` — and the new `asChild` spread is conditional, so neither can
clobber.

### R6 · the `agreement-parts` flag — **CLOSED, no change**

```
$ grep -rn "agreement-parts" apps/designer-portal/src
```

**The drafting room does not read it** — T3's removal is confirmed; the only
`agreement-parts` hits under `…/rooms/drafting/**` are the `agreement-parts-body`
*import path* and comments. The two remaining readers are exactly the ones the
brief expects, both left as they are:

- `apps/designer-portal/src/components/document/account/account-studio-page.tsx:162` — `useFeatureFlag('agreement-parts')`
- `apps/designer-portal/src/components/document/commercial/project-services-addendum-action.tsx:50` — `useFeatureFlag("agreement-parts")`

(Their tests — `agreement-library-gate.test.tsx`, `agreement-defaults-card.test.tsx` — still mock the flag and still pass.)

### R7 · fold-close persist (T2's judgment call a) — **CONFIRMED ON ALL THREE, no change**

- **Whole-array, not per-part, not per-keystroke.** `toggleFold`
  (`agreement-composer.tsx:453-457`) calls `persist()`, and `persist`
  (`:724-744`) is `save.mutateAsync(parts)` where `save =
  useSaveAgreementParts(proposalId)` — the same whole ordered array through
  `upsert_agreement_parts` the Save button called
  (`packages/supabase/src/hooks/use-agreement-parts.ts:111` — "takes the WHOLE
  ordered array, every time"). Its only callers are `toggleFold`, the outline's
  `onSelect` (`:1225`) and `reviewAndSend` (`:748`). No keystroke path.
  `useSaveAgreementPart` (`savePart`) is the **library-template** write
  (`:706`, `keepInLibrary`), not an agreement write. N-7's projection round-trip
  is untouched.
- **A failed persist reports in `#room-status` and keeps the content.** The
  catch sets both `setSaveNote(message)` and `setAnnouncement(message)`, and
  `#room-status` renders `announcement ?? readinessVoice` (`:1200-1210`) — one
  permanent region, never conditionally mounted. `setParts` runs only on
  success, so the typed content and `dirty` both survive a refusal.
- **It does not persist when nothing is dirty.** `if (dirty && !readOnly) void
  persist();` at both `:455` and `:1225`.

### R8 · `discovery-return-to-lead.test.tsx:121` — **NOT PRE-EXISTING. It was a T1 regression, now fixed.**

The brief recorded this as pre-existing on `origin/main`; **it is not.** Proof:

1. `git diff --stat 7eed713b7 HEAD -- .../document/discovery packages/` — the
   whole discovery directory is **unchanged** by this wave. Only
   `packages/types/src/agreement-copy.ts` differs.
2. The suite fails on the merged tree at `:121`
   (`expect(action).toHaveAttribute('aria-disabled','true')` → received `null`).
3. Restoring **only** `document-action.tsx` to its `7eed713b7` content and
   re-running the same file: **8 passed, 8 total.**

So the red is caused by T1's edit to `document-action.tsx`, on a surface that
shipped on 2026-09-10 — a shipped-behaviour regression, not scope. Root cause
and fix are R5b above. After the fix the file is green, and the **full designer
suite has no red at all** (below).

---

## 3 · Commits added by this lane

| Hash | Subject |
|---|---|
| `299927459` | `merge(agreement): galley T2 — the paper is the page` |
| `b3c939b1e` | `merge(agreement): galley T3 — retire the seven-facet room; send sheet in parts` |
| `19a19c848` | `fix(document): held marks no longer erase a caller's aria-disabled` (R5 + R5b/R8) |
| `4035eab00` | `fix(agreement): integration residuals` (R1, R2, R3, R4) |

A `npx prettier --write` pass on the touched files was **reverted and not
committed**: the repo's root Prettier config disagrees with the existing style
of `button.tsx` and `document-action.tsx` (single vs double quotes, trailing
commas) and would have reformatted both files end to end for no behavioural
reason. The pre-commit hook's drift warning is advisory locally, and lint is
unaffected (§4). Edits match each file's own local style.

---

## 4 · Gates (tails, verbatim)

**`pnpm turbo build --filter=@patina/types`**
```
@patina/types:build: > tsc --build

 Tasks:    1 successful, 1 total
Cached:    1 cached, 1 total
  Time:    403ms >>> FULL TURBO
```

**`pnpm --filter @patina/designer-portal type-check`**
```
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
```
(no output; exit 0)

**`pnpm --filter @patina/designer-portal test` — the FULL suite**
```
Test Suites: 568 passed, 568 total
Tests:       7106 passed, 7106 total
Snapshots:   1 passed, 1 total
Time:        26.994 s
Ran all test suites.
```
**No red, including none pre-existing.** The one red the brief expected —
`discovery-return-to-lead.test.tsx:121` — was the T1 regression at R5b/R8 and is
fixed, not excused.

**`pnpm --filter @patina/client-portal type-check`**
```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```
(no output; exit 0)

**`pnpm --filter @patina/admin-portal build`** (sandbox off) — completed, full
route table printed:
```
ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

**`pnpm --filter @patina/designer-portal lint`** (whole portal — `eslint .`)
```
✖ 205 problems (0 errors, 205 warnings)
  0 errors and 190 warnings potentially fixable with the `--fix` option.
```
Baseline for the same command on `origin/main` `7eed713b7`, run in a detached
worktree (since removed) with the galley worktree's `node_modules` linked in:
```
✖ 205 problems (0 errors, 205 warnings)
  0 errors and 190 warnings potentially fixable with the `--fix` option.
```
**Identical — 0 errors, 205 warnings on both. The wave adds no lint problem.**

**`grep -rn 'aged-oak' …/drafting/agreement`** → **0 hits** (exit 1). T1R-01's
28 `color`-carrying sites are all cleared; nothing survives, so acceptance
check 4 is met outright rather than by exception.

**`grep -rn ' disabled[ >=]\|disabled={' …/drafting/agreement …/service-agreement-send-sheet.tsx`** → **NOT 0, and cannot be.**
The grep as written covers the whole `…/drafting/agreement` tree, which the
build sheet's T4 section explicitly rules **keeps** native `disabled`
("`add-part-sheet` (7), `template-picker-sheet` (2), `save-as-template-action`
(1) and `turnkey-editors` (2) keep native `disabled` untouched"). What the hits
actually are:

- **~90 form-control hits** — `disabled={readOnly}` / `disabled={readOnly ||
  …}` on `<input>`/`<select>`/`<textarea>` inside `part-editor.tsx`,
  `schedules/*`, `turnkey/*`. Fields, not acts; §A5 governs acts.
- **11 act hits the build sheet exempts** — `add-part-sheet.tsx:227,321,364`,
  `template-picker-sheet.tsx:167,239`, `save-as-template-action.tsx:49,124`,
  `sub-picker.tsx:36,70,97`.
- **10 hits inside the composer's own test mocks** — the mocks *implement*
  §A5 (`aria-disabled={disabled && held ? "true" : undefined}` /
  `disabled={disabled && !held ? true : undefined}`).
- **4 hits in the room's own path, every one paired with `held`:**
  `agreement-composer.tsx:1285` (`disabled={sendHeld} held aria-describedby
  onHeldActivate`) · `service-agreement-send-sheet.tsx:206` (`disabled={!readiness.ready} held onHeldActivate aria-describedby`) ·
  `agreement-composer.tsx:1238` (`SaveAsTemplateAction`, the exempt act) ·
  `agreement-composer.tsx:1164` (the client-account `<select>`).
  Because both primitives render `disabled={unavailable && !held}`, none of
  these emits a native `disabled` attribute — they emit `aria-disabled="true"`
  and stay in the tab order, which is the acceptance the check exists to prove.

**Nothing in the galley or the send sheet ships a native `disabled` act.** The
grep needs narrowing to the acts (or to `…/agreement/galley` +
`agreement-composer.tsx` + the send sheet) before it can be a standing check;
recorded rather than "fixed" by weakening the code.

---

## 5 · Worktrees

`git worktree remove` run for `.codex/worktrees/agent-agreement-galley-t2` and
`…-t3`. Both gone; **branches `agreement-room/galley-t2` and
`agreement-room/galley-t3` kept** until the program merges. The detached
baseline worktree used for the lint comparison was removed too. Only
`.codex/worktrees/agent-agreement-galley` remains for this program.

Nothing pushed.

---

## 6 · Carried out of this lane

1. **R5b is a shipped-surface regression that T1's own gates did not catch** —
   T1's gate list was `test -- src/components/document/commercial
   src/components/ui`, which does not reach `…/document/discovery`. Any commit
   touching `document-action.tsx` or `button.tsx` should gate on the **whole**
   designer suite.
2. **The `disabled` grep in the sheet is unsatisfiable as written** (§4). Narrow
   it or drop it before T5 reads it as a standing check.
3. `drafting-room.tsx`'s `facet` vocabulary is the **proposal** room's and
   survives this wave by design (§3 R10). If it is ever meant to go, it is a
   separate program.

---

# Integration lane 2 — the wave-review fixes merged, T4 finding 1 closed

Program branch `agreement-room/galley`, worktree
`.codex/worktrees/agent-agreement-galley`. Tip **`b2321da62`**.

## 1 · The merge

`agreement-room/galley-fix` (`8400d9d2c`) merged into `agreement-room/galley`
(`91ea2069f`) with `--no-ff --no-verify` → merge commit **`4c3249749`**.

**No conflicts.** The two lanes were disjoint exactly as predicted: the fix
branch touched 11 files under `…/drafting/agreement/**` (src + galley unit
tests), T4 touched three files under `apps/designer-portal/e2e/agreement/`.
`ort` took both sides whole.

But a **silent conflict of intents** surfaced under e2e (see §3): WR-19/WR-20
rewrote the head record line from `${openPart?.title} not yet saved` to
`This agreement not yet saved`, and T4's galley case (2) asserted the OLD
wording against `.g-head .g-record`. Resolved toward both intents rather than
either — the head speaks for the agreement, the fold for its part, and case
(2) now asserts both lines. Nothing was weakened.

## 2 · T4 finding 1 — writes dropped while a save is in flight

Two mechanisms, one symptom: the designer types, the field keeps showing what
she typed, and the write is never written.

**(a) Acts addressed parts by `id`.** `changePayload`, `renamePart`,
`removePart`, `setClientVisible` and `reorderPart` all matched on `part.id`.
`upsert_agreement_parts` is DELETE-then-INSERT, so every id comes back
re-minted; a handler that closed over the uuid it was rendered with matched
nothing after the save landed and the `map` returned the array unchanged — a
no-op with no refusal, no note and no record line. Every one of them now
addresses by `partKey`, and the two render sites that compared ids for
`canMoveUp` / `canMoveDown` compare keys. `writePart` and `changePayload` had
become the same function under two names; they are one now.

**(b) `persist()` took the RPC answer wholesale.** `void persist()` is fired
unawaited from `toggleFold` and from the outline's `onSelect`, so the room
hands straight back and the designer keeps writing. When the answer arrived,
`setParts(saved)` replaced local state with rows carrying the payloads the RPC
was **sent** — one revision stale. A `revision` ref, bumped by every `mutate`,
now records whether the paper moved while the save was in the air:

- unchanged → the server rows ARE the paper: `setParts(saved)`, `dirty` false.
- changed → adopt the re-minted `id`/`updatedAt` **by part key**, keep every
  payload written since, and stay dirty, because what is on the table is
  behind what is on the page.

**Files:** `apps/designer-portal/src/components/document/rooms/drafting/
agreement/agreement-composer.tsx` (only src file touched).

**Unit test** (`…/agreement/__tests__/agreement-composer.test.tsx`, new
describe *"AgreementComposer · a write during an in-flight save (N-8)"*):

> `keeps a clause typed while a save is in flight, and sends it on the next save`

A held mock resolves the save on command; the designer types during the
flight; the RPC lands re-minting every id; the typed prose survives in state,
the record still says "not yet saved", and the **second** call to
`upsert_agreement_parts` is asserted to carry the newer prose under the
**first** save's ids (`reminted-0-*`). Reverting the guard alone fails it:
*Expected "…the ground floor and the stair hall." Received "The ground floor."*

## 3 · e2e updated

- **`galley.agreement.pw.ts` case (2)** — was asserting the remount as-is
  ("the part remounts and `GalleyPart`'s open-effect re-seeds focus"; focus on
  the rename field). After the fix branch keyed `GalleyPart` on `partKey`
  there is no remount, so it now proves the opposite: a `data-node-witness`
  attribute set on the fold and the textarea before the save — a mark the DOM
  carries and React drops on remount — is asserted still present afterwards,
  the typed value survives, and the caret is **not** re-seeded into the fold
  (focus rests on the outline row the designer clicked). Record-line
  assertions split per §1.
- **`design-build.pw.ts`** — the "fence every open on the RPC response"
  workaround is **removed**. `openPart` no longer reads the record line, opens
  a `waitForResponse(upsert_agreement_parts)` race and awaits it before every
  click; the barrier is the fold becoming visible. The duplicated 9-line
  comment block above it went with it. `writeField`'s value-readback barrier
  is **kept** — that one is about the sheet's own re-render, not about the
  save — as is `waitUntil: "networkidle"` on the two real navigations.

## 4 · Gates

| Gate | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal test` | **569 suites / 7120 tests, 100% green** |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | success (sandbox off) |
| `eslint` on the 4 touched files | 0 errors (both `e2e/**` files are ignored by the portal's ESLint config — warning only) |
| `prettier --write` on the 4 touched files | applied |
| e2e `playwright.agreement.config.ts --project=chromium` | **9 passed (1.2m)** |
| e2e `playwright.design-build.config.ts --project=chromium` | **1 passed (37.1s)** |

`@patina/types` was not touched, so its build was not run.

Both e2e runs booted their own `pnpm dev` per T4 — no fallback build was
needed. `SUPABASE_SERVICE_ROLE_KEY` was exported inline from `supabase status`
for `adminDb` and never written to a file; the dev server was killed after.

The design-build run logs three `AppError`s from `persist` mid-walk
("This pricing basis names no contract sum", the supervision double-count) —
those are the server refusing a composition the walk has not finished filling
in, which the spec then asserts on. Expected, not new.

## 5 · Worktrees

`.codex/worktrees/agent-agreement-galley-fix` removed; **branch
`agreement-room/galley-fix` kept**. Only `…/agent-agreement-galley` remains.

Nothing pushed.

## 6 · Carried out of this lane

1. **A merge with no textual conflict still had a conflict of intents.** The
   record-line rewording was invisible to `ort` and to every unit suite; only
   the e2e caught it. A wave that splits src fixes from e2e authoring should
   expect this class and run both e2e configs at the merge, not after.
2. `readiness.ts` still files blockers against `part.id`, and the composer
   still looks parts up by `blocker.partId`. That is **consistent within a
   render** — readiness is a `useMemo` over the same `parts` — so it is not
   the bug and was deliberately left alone. It is, however, the last place a
   uuid is load-bearing in this room.

---

## 7 · Integration lane 3 — WR-101/102 merged, walk D1 and D2 closed

Program branch `agreement-room/galley`, worktree
`.codex/worktrees/agent-agreement-galley`.

### 7.1 · The merge

`agreement-room/galley-fix2` (`25aea376f` — serialized persist, WR-101/102)
merged into `agreement-room/galley` (`b2321da62`) with `--no-ff --no-verify`
→ merge commit **`df056c7bf`**. **No conflicts** (fix2 touched only
`agreement-composer.tsx` and two composer suites; this lane's own edits came
after). The walk's D1/D2 fixes and the log below ride in the single
`fix(agreement): galley — seam adds land at the seam; send act label wraps at
390 (walk D1/D2)` commit on top of that merge, which is the branch tip — **`b70bdda78`**.

### 7.2 · D1 (P1) — the send sheet's terminal act clipped at 390

**Root cause, not the symptom.** `service-agreement-send-sheet.tsx`'s acts row
is `flex flex-wrap items-center justify-end`, and the canonical `Button`'s base
class string carries `whitespace-nowrap` (`ui/controls/button.tsx:30`). A flex
item whose `min-content` width is the whole unwrapped label cannot shrink, and
under `justify-end` its overflow goes off the **left** edge — which is exactly
what the walk pixel-cropped: `…nd the agreement · $5,000.00 retainer`, with
the leading `Se` past the sheet's own bound. `flex-wrap` wrapped the two acts
onto separate lines (which is why `Not yet` looked correct) but never made the
primary act itself narrower.

**Fix** — two lines, both in the sheet, none in `Button`:

- the acts row takes `max-[480px]:flex-col max-[480px]:items-stretch`, so at
  ≤480 the two acts stack **full-width** inside the sheet instead of being
  pushed against its right edge;
- the terminal act takes `whitespace-normal text-center` (tailwind-merge
  resolves it against the base `whitespace-nowrap`), so the label **wraps**
  inside the act. `Not yet` takes `max-[480px]:w-full` to stack with it.

No `text-overflow`, no truncation, no ellipsis; the amount stays in the label
(house sheet — wrap, never truncate). Nothing changes at 1024/1440, where the
label still fits on one line.

**Measured, at 390 × dSF 2**, from a scripted run against the e2e server
(signed in through `e2e/fixtures/auth.ts`, a fresh draft seeded the way
`galley.agreement.pw.ts` case 7 seeds — ceiling $24,000, retainer $5,000, a
rate card written in the room, the client linked through `adminDb` at INSERT):

```
D1-MEASURE {"panelScrollWidth":343,"panelClientWidth":343,
            "panelLeft":18,"panelRight":372,
            "actLeft":46,"actRight":335,"actHeight":55.78,
            "actScrollWidth":289,"actClientWidth":289,
            "whiteSpace":"normal","textOverflow":"clip",
            "docScrollWidth":390,"docClientWidth":390}
```

- **the sheet's `scrollWidth` is 343 — equal to its `clientWidth`**, so the
  panel has nothing to scroll horizontally;
- the act's box (46 → 335) sits **inside** the panel's (18 → 372) on both
  edges — no left overhang;
- `actScrollWidth === actClientWidth` (289) and `textOverflow: clip`: the
  label is wrapped, not clipped and not ellipsised. `actHeight` 55.78 is the
  two-line act;
- the page itself still holds `scrollWidth === clientWidth === 390`.

Screenshot:
`/Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/shots/walk/390-send-sheet-after-d1.png`
(780 × 1688 — 390 at deviceScaleFactor 2). The proof spec was temporary and is
**not** committed.

### 7.3 · D2 (P2) — a part added at a seam now lands at that seam

**Root cause.** `addPart`, `addFromLibrary` and `attachNotice` all did
`mutate([...parts, added])`. The seam handed its `place` to nothing: every
`+ Add a part`, at every seam, appended.

**Fix** — the seam is a place, and it is carried:

- `insertIndex(current, anchor)` — `"top"` → 0, a part key → that part's index
  + 1, `null` (or a key the composition no longer carries) → the end;
- `layIn(added, anchor)` splices at that index through `mutate`, which
  renumbers the **whole** array; the whole-array `upsert_agreement_parts` save
  carries the landing with no per-row position write;
- `seamAct(place)` now passes `place` on both paths — directly to `addPart`
  on the blank-kind menu (library off), and through a new `addAnchor` state on
  the Library-picker path, because `AddPartSheet` is mounted **once at the
  page's foot**, not inside the seam that opened it;
- the page-level acts keep appending: `attachNotice` passes `null`, and
  `applyTemplate` still replaces the composition wholesale (it is opened from
  the outline's foot, never from a seam).

One behaviour worth recording rather than "fixing": an **unwritten** part
carries no seam of its own (`if (!silent) segment.push(seamAct(part.partKey))`,
unchanged), so on a paper where nothing is written yet the only seam is the one
above the first part — and a part added there now lands **first**, where it
used to land last. That is the seam contract applied consistently, not a
regression, but it is the one place a designer's muscle memory changes.

**Tests.**

- `agreement-composer.test.tsx` — three new cases: a part added at the seam
  beneath Services lands as part 2 with Exclusions and Terms pushed down; a
  part added at the top seam lands first; and the **saved** array (the
  `upsert_agreement_parts` payload) reads `[1 Services, 2 Exclusions,
  3 Ceiling, 4 Terms]` after a landing at the seam beneath Exclusions — the
  renumbering, at the RPC boundary, not just in the outline.
- `agreement-composer-library-on.test.tsx` — the case formerly named "lays a
  Library part at the end of the paper" is now **"lays a Library part at the
  seam the picker was opened from"**; it renders two *written* parts (so there
  is a mid-paper seam at all) and asserts `[Services, House rules, Terms]`.
  This case **failed** against the fix before it was rewritten, which is the
  proof the fix changed behaviour rather than the assertions.
- `agreement-parts.agreement.pw.ts` (galley e2e) — the add is retargeted from
  `getByRole("+ Add a part").first()` to
  `.g-part[data-part-key="patina.ceiling"] + .g-seam`, the part is named
  **Concept fee**, and the landing is asserted twice: off the outline
  immediately after the add (the row after Ceiling's), and off
  `proposal_agreement_parts` after the save
  (`titles.indexOf("Concept fee") === keys.indexOf("patina.ceiling") - 1`,
  the seam landing minus the one deliberate Move-up the case already made).

### 7.4 · D3 — DECLINED-CARRIED, with WR-16

The walk's D3 (Move up / Move down / Hide invisible at rest for every part but
the open or focused one — `galley.css:388-400`, `:focus-within` or
`data-selected="true"`, no `:hover` rule) is **declined and carried** with
**WR-16**, of which it is the confirmation. Selection-gated acts are the
ruling: the reserved box holds its width so nothing reflows, and keyboard
reachability is real (walk §1 step 12 — a bare `Tab` reaches Move-up and
`Enter` moves the part). What the walk resolved is the *confidence* question;
the *design* question — whether a mouse-only designer needs a lighter
always-visible affordance — is Kody's, not a lane's, and no code was written
against it.

### 7.5 · One more WR-101-family defect, found by the gates

`playwright.design-build.config.ts` went **red** on the merged branch at
`design-build.pw.ts:274` (`Supervision is paid once…` still on the room after
the trade markup was cleared, 2 elements: the save note and `#room-status`).

**It is not fix2's and not this lane's** — the same spec fails identically with
`agreement-composer.tsx` swapped back to `b2321da62`'s version, checked
directly. It is the race lane 2's §4 note called "expected": `openPart` returns
as soon as the fold is visible while the refused `upsert_agreement_parts` is
still in the air, so a refusal for a composition the designer has **already
answered** lands after the answer and prints itself on the room. Lane 2's green
run got the ordering it wanted; three runs here got the other one.

`flight()`'s success path already asks whether the paper moved on
(`behindThePage`). Its **catch did not**. One guard, the same rule on the
refusing side:

```ts
if (revision.current !== sentAt) return false;
```

`dirty` is untouched, so the record still reads *not yet saved* and the next
act saves what is on the page now — the refusal is suppressed, never the fact
of the failure. With the guard the config is **1 passed (42.6s)**; without it,
red 3/3.

### 7.6 · Gates (tails, verbatim)

| Gate | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | clean — `tsc --noEmit`, no output |
| `pnpm --filter @patina/designer-portal test` | `Test Suites: 569 passed, 569 total` · `Tests: 7128 passed, 7128 total` · `Snapshots: 1 passed` — **100% green** |
| `pnpm --filter @patina/client-portal type-check` | clean — `tsc --noEmit`, no output |
| `pnpm --filter @patina/admin-portal build` | success (sandbox off) — full route table printed, `ƒ Proxy (Middleware)` |
| `eslint` on the 5 touched files | **0 errors**, 1 warning (`e2e/agreement/agreement-parts.agreement.pw.ts` is ignored by the portal's ESLint config) |
| `prettier --write` on the 5 touched files | all 5 **unchanged** |
| e2e `playwright.agreement.config.ts --project=chromium` | **9 passed (59.9s)** |
| e2e `playwright.design-build.config.ts --project=chromium` | **1 passed (42.6s)** |

Both e2e configs booted their own `pnpm dev` — no prod-build fallback was
needed. `SUPABASE_SERVICE_ROLE_KEY` was exported inline from `supabase status`
for `adminDb` and never written to a file; every server Playwright started was
killed with its run. `@patina/types` was not touched, so its build was not run.

### 7.7 · Worktrees

`.codex/worktrees/agent-agreement-galley-fix2` removed; **branch
`agreement-room/galley-fix2` kept**. Only `…/agent-agreement-galley` remains.

Nothing pushed.

### 7.8 · Carried out of this lane

1. **The refusal side of a save had never been fenced.** WR-101 fenced the
   landing that *succeeds*; the landing that *refuses* still wrote the room
   from a composition the page had moved past. Anything that fires an
   unawaited write and then prints what came back should be read on both
   branches, not just the happy one.
2. **A seam that appends is invisible in a suite that only counts rows.** The
   two composer suites and the galley e2e all passed with the append bug in
   place because every assertion counted parts or named them, and none read
   the **order** around the new one. The three new unit cases and the e2e's
   two landing assertions are the cheapest guard against that class.
3. **The top seam changed meaning.** On a paper with nothing written, the only
   `+ Add a part` is the seam above the first part, and it now lands the part
   first rather than last. Worth one line in whatever the studio reads.
