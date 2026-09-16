# Portal Polish — program report

**Three waves, fourteen build lanes plus two amendment lanes, 2026-09-08. Everything is in
production.** `main` = `99906f992`.

| Wave | What | Deployed | Version | Rollback |
|---|---|---|---|---|
| **W1** | Governance amendments + concept-render backend | Strata (migration `00580`) — no portal | — | correct forward with `00581`; the columns are nullable |
| **W2** | The house page (client portal) | `patina-client-portal` | `99bc3971-d33d-47da-ac72-97112d71b1c9` | `f46e2e19-a806-45d1-853e-28a007533724` |
| **W3** | The Desk (designer portal) | `patina-designer-portal` | `bf6a3679-40b5-4c24-8db2-7cc2348f145a` | `6987d9ff-9154-453f-ae89-c7ab4c714d48` |

Ship reports: `ship/w1-ship.md` · `ship/w2-ship.md` · `ship/w3-ship.md`.
Plan: `docs/superpowers/plans/2026-09-08-portal-polish-build.md`. Rulings:
`artifacts/portal-polish-review-2026-09-08/rulings.md`.

---

## 1 · Every ruling, and where it landed

### PP-1 — the studio is the author; Patina is the press *(client pages only)*
**W2 · Lane H1** — letterhead and colophon law on the homeowner surfaces; the shared `<Colophon>`
behind `Prepared by {studio} · Sent through Patina`; `Leave the house` → **`Sign out`** on the mat
(one occurrence, pinned by e2e). No Patina wordmark above the colophon on a client page.
The designer portal's wordmark and footer were not touched — see PP-9.

### PP-2 — money, dates and names carry the largest true type
**W1 · A1** wrote the rule (**R140**, amending R126). **W2 · H2** shipped the seven type steps plus
`.t-money` as the client portal's type contract; **W2 · H6** shipped the money block (one announced
figure, the owed figure outranking the agreed figure) and routed every date through one helper in
**en-GB**, updating the ten en-US and eleven en-GB assertions the plan's copy table named.
**W3 · D1** renders the day's line at the body step with the money/date grammar intact.
**Not fully delivered:** the designer portal still prints short dates (`Sep 11`) — no D lane was given
a designer-side date sweep. Owed.

### PP-3 — every act shows its weight and its consequence
**W1 · A1** wrote the rule (**R139**, amending I107: the tertiary rest rule is unconditional at ≥3:1
in `--color-aged-oak`, and a fourth `terminal` tier exists).
**W2 · H4** shipped the three tiers on the client page and the gates — the consequence sentence above
every terminal act in every state, `aria-disabled` with a named reason instead of `disabled`
(the e2e assertion was migrated in the same wave), the visible hold, the filled terminal act carrying
its amount.
**W3 · D4** shipped the same grammar on the Desk: `DocumentActionVariant` gains `'terminal'` (and
A1's `test.todo` row is folded back into the live `it.each` table — **the wave's suite now reports
zero todos**), `scaleX(0)` removed from the tertiary rest rule and from `.row-wash-score::after`,
`.da-secondary`'s rest score moved to `--color-aged-oak`, `disabled:opacity-50` dropped from
`BASE_CLASS`, a `:focus-visible` outline added beside the surviving caret, and the ⌘K palette given
`aria-modal` / `role="listbox"` / `role="option"` / `aria-selected` / `aria-activedescendant` /
`role="status"`. A new CSS contract test (`action-rest-rules.test.ts`) pins that no `.da-*` rest rule
uses `scaleX(0)`.

### PP-4 — honest imagery at real scale
**W1 · A1** wrote the rule (**R142** — the source hierarchy, and a labeled concept render may lead a
room). **W2 · H5** shipped the room bands: piece plates, captions, empty rooms as a floor line and one
sentence, and the concept-render slot on the client's page.

### PP-5 — one scale, one rhythm; absence is silence
**W1 · A1** gave the house sheet a home outside `artifacts/` — `docs/design/house-sheet/SPEC.md`,
byte-identical including §F (**I153**). **W2 · H2/H3** applied it to the client portal.
**W3** applied it to the Desk, and honoured *absence is silence* twice over: **D1**'s day's line
renders **nothing at all** when nothing needs her (no "Nothing needs you" banner), and **D3**'s boards
rail renders nothing when the studio has no boards — both observed live against the seed.

### PP-6 — amend the rulings before any build
**W1 · A1**, and nothing else started until it merged. Landed on `main` as
`docs/design/the-document/DECISIONS.md` **R139** (`:10759`), **R140** (`:10777`), **R141** (`:10791`),
**R142** (`:10817`), **I153** (`:10831`); `docs/vision/VISION-DECISIONS.md` **V9** (`:144`, sentinel
updated to `last id = V9`); and the amended success criterion in `apps/designer-portal/CLAUDE.md`
("…never a shadow, a zone, a badge, or a dashboard; **the only filled control she ever sees is a
terminal act where money moves or a paper is signed**"). The eslint shadow gate stayed — no depth was
adopted, and `shadow-gate.test.ts` is byte-unchanged and green in every wave.

### PP-7 — concept renders, provenance and rank
Three waves end to end. **W1 · A2**: migration **00580** on Strata —
`project_rooms.concept_render_url/_caption/_uploaded_at/_uploaded_by`, the private `room-renders`
bucket (8 MB; jpeg/png/webp), the four keys added to `get_client_project_threshold`'s `selections`
payload (verified: four added, none removed), and the `useRoomConceptRender` hook exported from
`@patina/supabase`. **W2 · H5**: the client page displays it, labeled. **W3 · D6**: the studio uploads
it — a tertiary "Add a concept render" at the per-room heading in `ffe-section.tsx` (one import, one
mount, **no new route**), an 8 MB / MIME gate matching the bucket's so the client is never told by the
server what the page could have told them, the consent line "Labeled 'Concept · not installed' on the
client's page" shown **before** upload, Replace/Remove on an existing render, and errors quiet and in
place — no toast, no red banner, and a failed upload leaves the standing render alone.

### PP-8 — the first build slice is the whole house page as one program
**W2**, six lanes (H1–H6) plus integration, merged as one wave and deployed once.

### PP-9 — the Desk keeps its wordmark
**W3 — by not doing anything.** No lane touched the Desk's wordmark or footer identity; the 1440
render shows `PATINA` still in the bottom bar. The Desk's other adopted changes (the day's line,
the facets, the resting rules, no dwell timer) all shipped.

### The two rulings that were carve-outs, not features
* **No feature flag anywhere** — everyone got all three waves at once, as ruled. Confirmed: no
  `useFeatureFlag` call was added by any lane.
* **No dwell timer** — **W3 · D5** removed the "Today / In hand + elapsed" centre readout from the
  mobile bar; with no primary action the centre slot now shows nothing. The **"Time in hand … review
  or adjust" row in More stays** (a timer she opens is a tool), `useDocumentTime` is still used by it,
  and the bar's colour and identity block are byte-unchanged per Kody's ruling.

### The one consequence the rulings flagged for confirmation
`rulings.md:21` — "whether the standalone invoice's Playfair total changes under PP-2 — it does; note
it as a consequence to confirm during the build." **Not resolved by any wave.** The plan's *Not in
this plan* section scoped the standalone invoice out beyond the Pay act joining the terminal tier.
Still open.

---

## 2 · Every gate's final numbers

### Wave 1 (`ship/w1-ship.md` §"Wave gates — real numbers")
| Gate | Result |
|---|---|
| `supabase db push` → Strata | `00580_room_concept_render.sql` applied; head re-checked at merge time, no parallel program had minted 00580 |
| `pnpm --filter @patina/supabase test` | **94 files / 1152 passed, 12 skipped (1164)** |
| `pnpm --filter @patina/designer-portal test -- --ci` | **544 suites / 6691 passed + 1 todo (6692)** ← the baseline every later wave is measured against |
| `pnpm --filter @patina/admin-portal build` | green, full route table |
| `pnpm lint` | not in the W1 gate list; not run |

### Wave 2 (`ship/w2-ship.md` §3)
| Gate | Result |
|---|---|
| `pnpm supabase:reset` | clean |
| `pnpm --filter @patina/client-portal type-check` | exit 0 |
| `pnpm --filter @patina/client-portal test -- --coverage` | **142 suites / 2417 passed**; coverage **75.66 / 71.57 / 75.77 / 77.97** against the 70/60/70/70 floor |
| `pnpm --filter @patina/client-portal lint` | **63 problems (11 errors, 52 warnings)** — baseline reproduced independently in `agent-pp-h2`; not grown |
| `npx playwright test tests/threshold.spec.ts` | **22 passed** (serial; the composed-agreement test consumes its fixture and needs a reset) |
| Renders | 1440 and 390 both `scrollWidth == clientWidth` **after** one real blocker was fixed (the ≤600px story-pole bar overflowed 457/390; `flex-wrap` in `story-pole.tsx`) |

### Wave 3 (`ship/w3-ship.md` §3)
| Gate | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | exit 0 |
| `pnpm --filter @patina/designer-portal test -- --ci` | **548 suites / 6786 passed / 0 todo** — +4 suites, +95 tests on the W1 baseline, **no suite lost, the `terminal` todo gone** |
| `pnpm --filter @patina/designer-portal lint` | **205 problems (2 errors, 203 warnings)** — the same two known errors at the same lines (`piece-room-save-gate.test.tsx:159`, `use-commercial-documents.test.ts:930`); **not grown** |
| `shadow-gate.test.ts` | green, and byte-unchanged from `origin/main`, as is `eslint.config.mjs` |
| `pnpm --filter @patina/admin-portal build` | green (needed `pnpm --filter @patina/api-client build` first in a fresh worktree — no dist, and not in admin's turbo dependency build set) |
| Renders | 1440, 1440+both facets, 1280 all `scrollWidth == clientWidth`, **zero console errors on the signed-in Desk**. 390 is **437 / 390** — pre-existing, measured identically on an `origin/main` build |

**Across the program: no suite was lost, no lint count grew, no `box-shadow` was added, and
`--elevation-sheet` / `desk-settle` were never touched.**

---

## 3 · Deploy ids

| Worker | Shipped version | Previous (rollback) | Rollback command |
|---|---|---|---|
| `patina-client-portal` | `99bc3971-d33d-47da-ac72-97112d71b1c9` (2026-09-08T23:06:54Z) | `f46e2e19-a806-45d1-853e-28a007533724` | `npx wrangler rollback f46e2e19-a806-45d1-853e-28a007533724 --name patina-client-portal` |
| `patina-designer-portal` | `bf6a3679-40b5-4c24-8db2-7cc2348f145a` (2026-09-08T23:56:34Z) | `6987d9ff-9154-453f-ae89-c7ab4c714d48` | `npx wrangler rollback 6987d9ff-9154-453f-ae89-c7ab4c714d48 --name patina-designer-portal` |
| Strata | migration `00580_room_concept_render.sql` | — | correct forward with `00581`; the columns are nullable and were unread until W2 |

Both portals smoked clean: served-chunk greps for the wave's own strings, and `wrangler tail` for
~60s each with **zero exceptions and zero error logs** (client: 13 events; designer: 10 events,
all `outcome: ok`).

Commits on `main`: `3fa422e82` (W1) · `f5fd0aeb4` (W2) · `99906f992` (W3), plus each wave's ship-report
commit.

---

## 4 · Everything owed to Kody

**Blocking nothing, but nobody else can close these.**

### Walks (no prod credential exists in the repo)
1. **Signed-in prod walk of the house page** (W2).
2. **Signed-in prod walk of the Desk** (W3).
   Both were searched for honestly: the only accounts in the e2e helpers are the local seeds
   (`client-solo@patina.dev`, `client@patina.dev`, `designer@patina.dev` / `password123`), and both
   `playwright.config.ts` files pin `localhost`. Nothing in the repo can sign into production.

### Rulings the build could not make
3. **Cents in the money block** — the specimen sets `$4,060.00`; the page prints `$4,060` because nine
   suites pin whole dollars (W2 divergence 1).
4. **The year in the due line** — specimen "due 11 September 2026"; the page prints "due 15 September"
   (W2 divergence 2).
5. **The Desk's overdue-line wording** — the specimen's `One thing is overdue — Vandersteen, install,
   since 4 September` versus the two pinned assertions D1 had to keep green (W3 divergence 3).
6. **Designer-side dates** — PP-2's one date style reached the client portal only (W3 divergence 4).
7. **`reconnect_due` in the day's line's lead slot** — a client due for a reconnect: does it belong?
   Deliberately excluded and now tested as such.
8. **The standalone invoice's Playfair total under PP-2** — flagged in `rulings.md:21` as a consequence
   to confirm; no wave touched it.

### Tokens and contracts the sheet and the portals disagree on
9. **`--hairline`** (client portal) — H5 wanted the sheet's `#E8E3DB` for plate borders; §A10 forbids
   borrowing `--rail`. Plates use `--border-default` (`#E5E2DD`). Add the alias or bless the fallback.
10. **`--hairline-strong`** (designer portal) — not defined at all; D1's day's-line rule uses
    `--doc-ink-border`. Same decision, other portal.
11. **The `.t-*` type steps exist in neither portal as classes.** Both waves matched the sheet's values
    through local utilities (`doc-type-body`, `font-mono text-[11px]`, …). A real adoption is a
    program-level decision, not a lane's.
12. **`.act--inline` / `InlineAct`** — H3 and D1 each wrote one, in different portals, because the
    plan's shared-file table names neither. Name it before a third lane writes a third.

### Real defects, pre-existing, nobody's lane
13. **The Desk at 390.** It scrolls sideways (`437 / 390`) — measured identically on an `origin/main`
    build, so Wave 3 neither caused nor widened it. The offender is a pre-existing roster row: a long
    unbreakable job name beside the state sentence in a `flex-wrap` `<li>`. Separately, **none of the
    specimen's 390 reflow is implemented** (§D: the day's line first under the greeting, sticky stage
    plates, the action column under the state sentence). Together these want their own lane.
14. **No dotted leader, no fixed 96px action column** on a Desk roster row (§D item 8).
15. **The desk walkthrough dialog `aria-hidden`s the entire Desk while open** — pre-existing chrome,
    but it is the first thing a new designer's screen reader meets, and it hides the margin note the
    specimen shows.
16. **No index on `project_notes.answered_at`** — D1's new 60s poll filters on it; `00565` indexes
    `(project_id, sent_at DESC)` only. Inert at studio scale.
17. **`<TheNote studioName>`** — H1's three-part signature only reaches production once
    `threshold.tsx:1085` passes the studio name; no lane owned that call site.
18. **Seed a `gatesOnAcceptance` draw** on the trade scope so the wall act can carry its amount; today
    a real client sees the fallback sentence.

### Environment / tooling
19. **`next dev` cannot serve the designer portal on this machine** — ~26
    `Watchpack EMFILE: too many open files` and a 404 for every route; `ulimit -n` is already
    1048576, so this is the macOS kqueue watcher ceiling. Every render pass needs `next build` +
    `next start` until it is raised.
20. **`apps/designer-portal/.env.local` in the main checkout points at `127.0.0.1`.** The deploy
    script's preflight correctly refuses it, so a designer deploy must export the prod
    `NEXT_PUBLIC_*` set from `wrangler.jsonc`. Either document that, or add a
    `.env.production.local`. (The inverse of the standing warning in memory — worth updating that note.)
21. **`packages/api-client` has no dist in a fresh worktree** and is not built by
    `pnpm turbo build --filter=@patina/admin-portal^...`, so the admin build gate fails first-run with
    `Module not found: '@patina/api-client'`.
22. **The `commit-msg` hook rejects `merge(...)`** (`scripts/hooks/patina-hooks.mjs:155-158`). Both
    W1 and W3 had to substitute `chore(...)`. Either add `merge` to the allowed types or stop naming
    `merge(...)` subjects in plans.

---

## 5 · Worktrees still on disk — for the orchestrator's sweep

`scripts/repo-gc.sh` (dry-run first). Every branch below is pushed to origin; W1/W2/W3 are all
ancestors of `main`, so nothing here holds unmerged work.

| Worktree | Branch | Note |
|---|---|---|
| `.codex/worktrees/agent-pp-a1` | `portal-polish/a1` | W1 lane |
| `.codex/worktrees/agent-pp-a2` | `portal-polish/a2` | W1 lane |
| `.codex/worktrees/agent-pp-h1` … `agent-pp-h6` | `portal-polish/h1` … `h6` | W2 lanes |
| `.codex/worktrees/agent-pp-h7` | `portal-polish/h7` | **not in the plan's lane list** — present on disk; check before removing |
| `.codex/worktrees/agent-pp-d1` … `agent-pp-d6` | `portal-polish/d1` … `d6` | W3 lanes |
| `.codex/worktrees/agent-pp-int` | `portal-polish/integration` | W2 integration; kept by W2 |
| `.codex/worktrees/agent-pp-int3` | `portal-polish/integration-w3` | W3 integration; kept, holds the prod `.next` build |

Already removed: `agent-pp-main` (W2) and `agent-pp-main3` (W3), the two merge-to-main worktrees.

---

## 6 · Wave 2b — house-page follow-ups (added 2026-09-09)

A fourth wave, one lane (**H7**), run after W3 released the local database. It exists to close the
divergences Wave 2's own ship report listed rather than leave them for a ruling nobody would make.
Full detail: **`ship/w2b-ship.md`**.

| | |
|---|---|
| Deployed | `patina-client-portal` |
| Version | **`a787400e-e4e7-4d72-a0ca-4d6a188336b3`** (2026-09-09T00:52:05Z) |
| Rollback | **`99bc3971-d33d-47da-ac72-97112d71b1c9`** (W2's deployment) |
| `main` | **`cdb81ebf3`** — `merge(portal-polish): wave 2b — house page follow-ups` |
| Branches | `portal-polish/h7` · `portal-polish/integration-w2b` · `portal-polish/to-main-w2b`, all pushed, all ancestors of `main` |
| Gates | type-check exit 0 · jest **143 suites / 2427 tests**, coverage **75.78 / 71.56 / 75.90 / 78.09** (floor 70/60/70/70) · lint **63 problems (11 errors)**, byte-identical to the W2 baseline · e2e **22/22** |
| Renders | `waves/w2b/renders/` at 1440 and 390 — **no horizontal overflow at either width**, no app-origin console error |
| Strata | untouched; no migration, no edge function, no other Worker |

### What it closed

Six of the nine divergences `w2-ship.md` §4 listed against `specimens/client-house.html`: **cents
on every figure in the money block and on the piece plates**; the **due date's year**; the wall
gate's **"Accept the finished work · $2,980.00"** (from a seeded `gates_on_acceptance` draw, pinned
in e2e); the story pole's **held tick clearing its label**; the ≤600px bar reading **"You are in:
the doorstep"** instead of the doubled sentence; and **"Leave the house"** gone from the portal
entirely (`Sign out` ×4 in the served chunk, `Leave the house` ×0). It also settled `--hairline` as
the sheet's own `#E8E3DB` literal and wired `<TheNote>`'s author name.

### Corrections to this report

* **The header above is one wave stale.** It reads "Three waves" and `main` = `99906f992`; with 2b
  it is four waves and `main` = `cdb81ebf3`. Left in place rather than rewritten, so the record of
  what each wave reported at the time stays readable.
* **§4 item 18 is closed** — the `gatesOnAcceptance` draw is seeded and the wall act carries its
  amount.
* **§4 item 17 is closed in code** — `threshold.tsx` passes the author and studio names; it is now
  blocked only by a fixture with an empty `project_team_members`, so the three-part signature
  renders as two parts locally.
* **§4 item 22 overstates the hook.** `merge(...)` is refused on a *normal* commit
  (`scripts/hooks/patina-hooks.mjs:155-158`) but accepted on a git merge commit — which is why every
  merge onto `main` in this program could keep its `merge(portal-polish): …` subject while the lane
  merges could not.
* **§4 item 20's inverse applies to the client portal too.** W2 shuffled `.env` files to get a prod
  build out of a worktree. W2b did not: exporting the twenty-one committed literals from
  `apps/client-portal/wrangler.jsonc` `vars` satisfies the preflight (an exported `process.env`
  value wins, `infra/deploy-portal.sh:68-90`) and inlines exactly the values the Worker serves.
  **That is the recipe to document for both portals.**

### Still owed after 2b

* **One ruling: does a figure inside a sentence carry cents?** Six call sites still use
  `moneyInWords` — `plan-key.tsx:106`, `road-orders.tsx:126,164`, `scope-change-ask.tsx:109,139,425`,
  `review-ask.tsx:514`. The plan key is the visible one: it prints `$11,000` a screen below
  `$11,000.00`. This is the re-review's open **P2**, deliberately not written by the integration
  lane, and one ruling closes all six.
* **Seed a `lead_designer`** on Cedar Lane Study so the note's three-part signature can be seen.
* **Export `SUPABASE_SERVICE_ROLE_KEY` before `threshold.spec.ts`** — without it the signing test
  fails with a 500 (`server.ts:57`) that reads like a regression and is not one. Belongs in the
  plan's e2e step.
* **The plan key's SVG callout truncates** ("Built-in shelving, no…") against §A's no-truncation rule.
* **The signed-in prod walk** — still owed, still for the same reason: no prod credential exists in
  the repo.

### Worktrees added by this wave

| Worktree | Branch | Note |
|---|---|---|
| `.codex/worktrees/agent-pp-h7` | `portal-polish/h7` | already listed in §5; it is Wave 2b's lane |
| `.codex/worktrees/agent-pp-int2b` | `portal-polish/integration-w2b` | W2b integration; kept |

`agent-pp-main2b` (the merge-to-main worktree) was removed, as `agent-pp-main` and `agent-pp-main3`
were before it.

---

## 7 · Wave 3b — Desk follow-ups (added 2026-09-09)

A fifth wave, two lanes (**A3** `@patina/supabase` concept-render record/remove hooks, **D7** the
Desk follow-ups Wave 3 left owed), run after Wave 2b released the local database and port 3000.
Full detail: **`ship/w3b-ship.md`**.

| | |
|---|---|
| Deployed | `patina-designer-portal` |
| Version | **`cf67abe9-65e1-4818-b7d1-8eaa9943d93d`** (2026-09-09T01:44:22Z) |
| Rollback | **`bf6a3679-40b5-4c24-8db2-7cc2348f145a`** (W3's deployment) |
| `main` | **`3ca24f6b2`** — `merge(portal-polish): wave 3b — Desk follow-ups` |
| Branches | `portal-polish/a3` · `portal-polish/d7` · `portal-polish/integration-w3b` · `portal-polish/to-main-w3b`, all pushed, all ancestors of `main` |
| Gates | designer type-check exit 0 · designer jest **549 suites / 6807 tests** (W3 baseline 548/6786 — **+1 suite, +21 tests, none lost**) · lint **205 problems / 2 errors**, byte-identical to the W3 baseline · shadow gate + `action-rest-rules` 4 suites / 74 tests, `shadow-gate.test.ts` byte-unchanged · `@patina/supabase` type-check 0 and **94 files / 1163 tests** · admin build exit 0 · client type-check exit 0 |
| Renders | `waves/w3b/renders/` — `/desk`, a project document, and the Orders ledger at 1440 (all 1440/1440) and `/desk` at 390×844@2× (**390 / 390 — the overflow is closed**); **zero console and zero page errors** on all three signed-in surfaces; exactly one `box-shadow` on the page, `--elevation-sheet` |
| Strata | untouched; no migration, no edge function, no other Worker |
| Merges | both lanes merged **without a single conflict** |

### What it closed

**PP-2 on the day's line and the greeting** — `Marcus Wright · new lead — respond by 11 September`
above `TUESDAY · 8 SEPTEMBER`, the client name leading and one en-GB date idiom, closing §4's
divergences 3 and 4 for those two surfaces. **PP-3/R139's last unfinished rest rule** —
`.da-score-hover::after` drops `scaleX(0)` and rests at 1px aged oak across ~31 consumers; measured
live on the Orders ledger (20 on one sheet: `THE WEEK` rests `rgb(139,115,85)`, raises to
`rgb(196,165,123)` clay) and the document page (`PUT DOWN`, same). **B03** — the ⌘K input is a real
combobox (`combobox` / `aria-expanded` / `aria-autocomplete` in the served chunk), closing the gap
D4 named and reverted. **The 390 horizontal overflow** — 437/390 for two waves, now **390/390**.
And **A3** added `useRoomConceptRenderRecord` / `useRemoveRoomConceptRender` with delete-before-null
ordering, the cure for D6's orphaned-storage-object finding.

### Corrections to this report

* **The header is now two waves stale.** It reads "Three waves" and `main` = `99906f992`; with 2b and
  3b it is five waves and `main` = `3ca24f6b2`. Left in place, as W2b left it, so each wave's own
  record stays readable.
* **§4 item 21 has a second instance.** `packages/aesthete-quiz` also has no dist in a fresh worktree
  and is not built by `@patina/designer-portal^...`, so `pnpm --filter @patina/client-portal
  type-check` fails first-run with `Cannot find module '@patina/aesthete-quiz'` plus six downstream
  errors. The fresh-worktree preamble is now **two** builds: `@patina/api-client` and
  `@patina/aesthete-quiz`.
* **§4 item 22 stands as W2b corrected it**, confirmed again here: `merge(...)` was refused on the
  lane merges and accepted on the wave merge onto `main`, which kept its
  `merge(portal-polish): wave 3b — …` subject.
* **§4 item 20's recipe is now proven on the designer portal.** Exporting the sixteen committed
  literals from `apps/designer-portal/wrangler.jsonc` `vars` for the one deploy invocation satisfies
  the preflight and inlines exactly the values the Worker serves — verified by downloading all 36
  served chunks before and after and finding identical counts for all seven env strings. No `.env`
  shuffling, from a worktree with no `.env.local` at all.

### The finding this wave paid for

D7's brief was the 390 overflow and it targeted the roster **job name** (`min-w-0` +
`[overflow-wrap:anywhere]`), following Wave 3's own DOM surgery. On the first integration render the
number had not moved: still **437/390**. Bisecting the DOM found the real constraint one element to
the right — the state sentence `<p class="doc-type-body min-w-0 flex-1">`, which yields its width to
the name, is squeezed to 10px, and then overflows with its own 84px min-content. Stripping D7's two
utilities back to their pre-D7 shape on the same build gave **437 either way**: on this seed the
name fix is **inert** (the longest name has spaces and already wrapped). Giving the sentence the same
`[overflow-wrap:anywhere]` gave **390/390**. Shipped as `0b0d49778` with its own test. The lesson for
the next lane: a `min-w-0 flex-1` sibling is as much a source of min-content overflow as the child it
is yielding to, and a CSS fix aimed by reasoning needs a rendered measurement before it is believed.

### Still owed after 3b

* **Finish PP-2 on the Desk.** `desk-derivation.ts`'s module-private `fmtDay` still prints `Sep 11`
  on every roster row and on the document page, one line under the day's line's `11 September`.
  Two date idioms remain on one screen. A shared file no lane owned; wants a real lane.
* **Wire A3's hooks into `concept-render-upload.tsx`.** A3 has **zero consumers** — D6's component
  still uses its own local helpers, so the orphaned storage object on Remove is **still live in
  production**. The cure is written and unconnected.
* **A ruling on `.da-score-on` vs `:hover`** — the hover compound outranks the selected rule, so a
  selected control reads hovered rather than selected-and-hovered. Seen live on the ledger's
  `LEDGER` tab.
* **The specimen's 390 reflow** — the overflow half of W3's "The 390 Desk" is closed; the reflow half
  (day's line first, sticky plates, action column under the sentence) is not.
* **A3's whole-file Prettier reformat** flipped `use-room-concept-render.ts` to double quotes against
  119 of 133 single-quoted neighbours, and `index.ts` carries two unrelated reformat hunks. An
  argument for a root Prettier config; there is none outside `services/media` and `services/projects`.
* **A3's read hook queries `project_rooms` directly**, not through `get_client_project_threshold` —
  fine for a designer consumer, possibly empty for a client one. Check before wiring.
* **The signed-in prod walk** — still owed, still for the same reason: no prod credential in the repo.

### Worktrees added by this wave

| Worktree | Branch | Note |
|---|---|---|
| `.codex/worktrees/agent-pp-a3` | `portal-polish/a3` | W3b lane |
| `.codex/worktrees/agent-pp-d7` | `portal-polish/d7` | W3b lane |
| `.codex/worktrees/agent-pp-int3b` | `portal-polish/integration-w3b` | W3b integration; **kept**, holds the prod `.next` build |

`agent-pp-main3b` (the merge-to-main worktree) was removed, as every `agent-pp-main*` before it.

---

## 8 · Program complete — both portals are closed

**Read this first.** The program is **finished**. Wave 2c closed the client portal; **Wave 3c**
(added 2026-09-09, below) closed the Desk. Seven waves — W1 · W2 · W3 · W2b · W3b · W2c · W3c — no
lane is outstanding, no branch is unmerged, and both portals are deployed from `main` at
**`66a54ba00`**. Everything remaining is in *Everything still owed to Kody*, and every item there is
either a walk only Kody can do, a ruling only Kody can make, or a lane nobody was ever given.

### Wave 2c at a glance

| | |
|---|---|
| Deployed | `patina-client-portal` |
| Version | **`6f8adbb5-c024-4f25-bebd-070ee18924e1`** (2026-09-09T03:04:49Z) |
| Rollback | **`a787400e-e4e7-4d72-a0ca-4d6a188336b3`** (W2b's deployment) |
| `main` | **`f7865c728`** — `merge(portal-polish): wave 2c — cents residuals` |
| Branches | `portal-polish/h8` · `portal-polish/integration-w2c` · `portal-polish/to-main-w2c`, all pushed, all ancestors of `main` |
| Lane | **H8** — the six `moneyInWords` call sites Wave 2b named, moved to `formatCurrency` |
| What it closed | **The plan key prints `$11,000.00`**, not `$11,000`. Every money token on the rendered house page carries cents, at 1440 and at 390. Wave 2b divergence 1 — the most visible fault left on the page — is gone, and with it the "does a figure in a sentence carry cents?" question at those six sites. |
| What it did not | `approval-ask.tsx`'s `approvalWeighing` still prints whole dollars; it was outside the lane's brief and outside W2b's divergent list. Last money-in-prose surface on the Threshold. |

Full detail: **`ship/w2c-ship.md`**.

### Wave 3c at a glance

| | |
|---|---|
| Deployed | `patina-designer-portal` |
| Version | **`cfa89e71-3d30-4723-9b08-6a7c99c9c21c`** (2026-09-09T03:34:01Z) |
| Rollback | **`cf67abe9-65e1-4818-b7d1-8eaa9943d93d`** (W3b's deployment) |
| `main` | **`66a54ba00`** — `merge(portal-polish): wave 3c — Desk residuals` |
| Branches | `portal-polish/d8` · `portal-polish/integration-w3c` · `portal-polish/to-main-w3c`, all pushed, all ancestors of `main` |
| Lane | **D8** — the three items Wave 3b listed as owed, in one lane |
| What it closed | **PP-2 on the Desk**: the roster row and the document page print `11 September`, and a text-node sweep of `/desk`, the document page and the Orders ledger returns **zero** short-month literals. **`.da-score-on` vs `:hover`**: a selected control measures charcoal `rgb(44,41,38)` *while hovered*, and the 17 unselected controls beside it still raise to clay. **A3's hooks wired into `concept-render-upload.tsx`** — and, for the first time in the program, **a real storage round-trip**: an object uploaded into the private `room-renders` bucket through the signed-in UI and removed again, with postgres read before, during and after. Remove deletes the object *and* nulls the four columns. **The orphaned storage object is gone.** |
| What it did not | The standing plate was never seen painting against an `https:` origin — CSP blocks local-http images under a production build (`next.config.js:95-97`), proved by a `BYPASS_CSP` control. Prod is matched by the `https:` token, but that is argued, not observed. `Replace` is still unit-test-only. |

Full detail: **`ship/w3c-ship.md`**.

### Every deployment, per portal, in order

**`patina-client-portal`**

| Wave | Version | Deployed | Rolls back to |
|---|---|---|---|
| W2 | `99bc3971-d33d-47da-ac72-97112d71b1c9` | 2026-09-08T23:06:54Z | `f46e2e19-a806-45d1-853e-28a007533724` (pre-program) |
| W2b | `a787400e-e4e7-4d72-a0ca-4d6a188336b3` | 2026-09-09T00:52:05Z | `99bc3971-…` |
| **W2c** | **`6f8adbb5-c024-4f25-bebd-070ee18924e1`** | **2026-09-09T03:04:49Z** | **`a787400e-…`** ← **live** |

`npx wrangler rollback a787400e-e4e7-4d72-a0ca-4d6a188336b3 --name patina-client-portal`

**`patina-designer-portal`**

| Wave | Version | Deployed | Rolls back to |
|---|---|---|---|
| W3 | `bf6a3679-40b5-4c24-8db2-7cc2348f145a` | 2026-09-08T23:56:34Z | `6987d9ff-9154-453f-ae89-c7ab4c714d48` (pre-program) |
| W3b | `cf67abe9-65e1-4818-b7d1-8eaa9943d93d` | 2026-09-09T01:44:22Z | `bf6a3679-…` |
| **W3c** | **`cfa89e71-3d30-4723-9b08-6a7c99c9c21c`** | **2026-09-09T03:34:01Z** | **`cf67abe9-…`** ← **live** |

`npx wrangler rollback cf67abe9-65e1-4818-b7d1-8eaa9943d93d --name patina-designer-portal`

**Strata** — one migration in the whole program: **`00580_room_concept_render.sql`** (W1 · Lane A2).
Four nullable columns on `project_rooms`, the private `room-renders` bucket, four keys added to
`get_client_project_threshold`'s `selections` payload, and the `useRoomConceptRender` hook. No wave
since has pushed a migration or an edge function; W2/W2b/W2c/W3/W3b deployed portals only. There is
nothing to roll back — correct forward with `00581`; the columns are nullable.

### Final gate numbers, per portal

**Client portal** (W2c, and identical to W2b — the lane edited assertions in place)

| Gate | Result |
|---|---|
| `type-check` | exit 0 |
| `test -- --coverage` | **143 suites / 2427 tests**; coverage **75.78 / 71.56 / 75.90 / 78.09** against the 70/60/70/70 floor |
| `lint` | **63 problems (11 errors, 52 warnings)** — byte-identical to the W2 baseline; none in a touched file |
| `threshold.spec.ts` | **22 / 22** |
| Renders | 1440 → **1440/1440**, 390 → **390/390**; zero app-origin console errors |

**Designer portal** (W3c — final)

| Gate | Result |
|---|---|
| `type-check` | exit 0 |
| `test -- --ci` | **549 suites / 6810 tests / 0 todo** (W3b was 549 / 6807; W1 baseline 548 / 6786) |
| `lint` | **205 problems (2 errors, 203 warnings)** — the two known pre-existing errors, count unchanged across all four designer waves |
| `shadow-gate.test.ts` · `contrast.test.ts` · `rail-stock.test.ts` · `eslint.config.mjs` | green and **byte-unchanged** from `origin/main` |
| `@patina/supabase` | type-check exit 0 · **94 files / 1163 tests** |
| `admin-portal build` · `client-portal type-check` | exit 0 · exit 0 |
| Renders | `/desk`, document page and orders-ledger all **1440/1440**; **390 → 390/390**; zero console errors post-session; one shadow, `--elevation-sheet` |
| Storage | **first real round-trip** — object written to and deleted from `room-renders` through the signed-in UI, four columns set then nulled, bucket empty afterwards |

**Across the program: no suite was lost, no lint count grew, no `box-shadow` was added, and
`--elevation-sheet` / `desk-settle` were never touched.**

### Everything still owed to Kody

The lists in §4, §6 and §7 stand; this is the consolidated one, deduplicated, as of Wave 2c.

**Nobody but Kody can close these**

1. **Signed-in prod walk of the house page** (`client.patina.cloud`).
2. **Signed-in prod walk of the Desk** (`app.patina.cloud`). Both were searched for honestly across
   five waves: the only accounts in the repo are the local seeds, and both `playwright.config.ts`
   files pin `localhost`. Nothing in the repo can sign into production.

**Work that wants a lane**

3. **`approval-ask.tsx`'s `approvalWeighing`** — the last whole-dollar money-in-prose surface on the
   Threshold. Mechanical now that the other six are ruled in practice.
4. ~~**Wave 3c / lane D8 is unmerged**~~ — **CLOSED by W3c.** Merged, deployed
   (`cfa89e71-…`), and both halves observed live: zero short-month literals on the Desk, the
   document page or the Orders ledger, and a selected control measured charcoal under the pointer.
5. ~~**Wire A3's hooks into `concept-render-upload.tsx`**~~ — **CLOSED by W3c**, and the orphan is
   proved dead rather than argued: an object was uploaded into `room-renders` through the signed-in
   UI and removed, with the bucket read before, during and after. Remove deletes the object *and*
   nulls the four columns. See `w3c-ship.md` §5.
6. **The specimen's 390 reflow on the Desk** — day's line first under the greeting, sticky stage
   plates, action column under the state sentence. The overflow half is closed (W3b); the reflow
   half was never given to a lane.
7. **Seed a `lead_designer`** on Cedar Lane Study, so the note's three-part signature can be seen
   and pinned. The code is right; the fixture is short.
8. **No dotted leader, no fixed 96px action column** on a Desk roster row (§D item 8).
9. **The desk walkthrough dialog `aria-hidden`s the entire Desk while open** — pre-existing chrome,
   and the first thing a new designer's screen reader meets.
10. **No index on `project_notes.answered_at`** — D1's 60s poll filters on it. Inert at studio scale.

**Rulings the build could not make**

11. ~~**A ruling on `.da-score-on` vs `:hover`**~~ — **CLOSED by W3c.** D8's one-line specificity
    bump (`.da-score-hover.da-score-on::after`, `:hover`, `:focus-visible`, all charcoal) shipped;
    the `LEDGER` tab now measures `rgb(44,41,38)` while hovered, and the 17 unselected controls
    beside it still raise to clay. Same token, no new hex, no shadow.
12. **The Desk's overdue-line wording** — the specimen's `One thing is overdue — Vandersteen,
    install, since 4 September` versus the two pinned assertions D1 had to keep green.
13. **`reconnect_due` in the day's line's lead slot** — a client due for a reconnect: does it
    belong? Deliberately excluded and now tested as such.
14. **The standalone invoice's Playfair total under PP-2** — flagged in `rulings.md:21` as a
    consequence to confirm during the build. **No wave touched it.**

**Tokens and contracts the sheet and the portals disagree on**

15. **`--hairline`** (client portal) — settled in practice as the sheet's own `#E8E3DB` literal at
    `globals.css:87`; plates still use `--border-default` (`#E5E2DD`). Add the alias or bless the
    fallback.
16. **`--hairline-strong`** (designer portal) — not defined at all; D1's rule uses
    `--doc-ink-border`. Same decision, other portal.
17. **The `.t-*` type steps exist in neither portal as classes.** Both waves matched the sheet's
    values through local utilities. A real adoption is a program-level decision.
18. **`.act--inline` / `InlineAct`** — H3 and D1 each wrote one, in different portals. Name it
    before a third lane writes a third.

**New from Wave 3c**

27. **The local-render CSP trap.** `next.config.js:95-97` allows `http://127.0.0.1:*` in `img-src`
    only when `NODE_ENV=development`, but every render pass on this machine must use `next build` +
    `next start` (item 19), which is production. So a private-bucket signed URL served from local
    Supabase **will not paint** — `naturalWidth 0`, `requestfailed :: csp` — while `fetch()` on the
    same URL returns 200. Proved with a `BYPASS_CSP` control: the plate paints at 240×160 with CSP
    lifted and nothing else changed. Prod is matched by the `https:` token in both branches.
    Either add the local origins to the non-dev branch or document it; the next person to render a
    concept render will otherwise report a broken plate that is not broken.
28. **`Replace` on a concept render is unproven end to end.** The hook upserts at the same path, so
    a replace should not orphan; only Add and Remove were round-tripped. The harness exists
    (`waves/w3c/renders/roundtrip.sh`).
29. **D8's two PP-2 residuals want rulings, not code.** The lens ladder's fixed-width registers
    (`SEP 15` inside `cap(…, 40)` — `15 SEPTEMBER` risks the truncation the sheet forbids, so it
    needs a render or a ruling), and `2:00 PM` vs `2:00 pm`
    (`desk-derivation.fmtDayTime`, `ceremony-schedule.fmtCeremonySlot`).
30. **`field-sms.fmtFieldDate` now reads `Tue 14 July`, and that string leaves the building** in an
    SMS to a US trade. If outbound SMS should keep a US idiom, one line and one test.
31. **Money stays `en-US` in seven places** by design — en-GB with `currency: 'USD'` prints
    `US$17,500`. If the house wants that as a rule rather than a comment in `format.ts:70-71`, it
    belongs in `DECISIONS.md`, which no build lane may write.

**Environment and tooling, for whoever runs the next program on this machine**

19. **`next dev` cannot reliably serve *either* portal here.** W3 hit it on the designer portal;
    W2c hit it on the client portal — 28 `Watchpack EMFILE` errors and a **404 for every route**,
    with `ulimit -n` already 1048576. It is the system-wide kqueue pool, and it fails when other
    agent programs are running (W2c measured **93 node processes**, including two other portals
    building and testing). **`next start` is not the workaround** while `output: 'standalone'` is
    set — Next says so and the suite goes red; use `node .next/standalone/server.js`.
20. **Both portals' `.env.local` in the main checkout point at `127.0.0.1`**, so a prod deploy must
    export the `NEXT_PUBLIC_*` set from `wrangler.jsonc` `vars`. W2b and W2c did exactly that from a
    worktree with no `.env` at all, and the preflight resolves an exported value first by design
    (`infra/deploy-portal.sh:68-90`). **That is the recipe; document it and stop shuffling files.**
21. **`packages/api-client` and `packages/aesthete-quiz` have no dist in a fresh worktree** and are
    not built by the portal turbo filters. Two packages, not one. (`@patina/shared` and
    `@patina/supabase` need no dist — they resolve through `"main": "./src/index.ts"`.)
22. **The `commit-msg` hook rejects `merge(...)` on a normal commit only**
    (`scripts/hooks/patina-hooks.mjs:155-158`); a git merge commit never reaches it. Confirmed five
    times. Either add `merge` to the allowed types or stop naming `merge(...)` lane-merge subjects
    in plans.
23. **Export `SUPABASE_SERVICE_ROLE_KEY` before `threshold.spec.ts`** — without it the signing test
    fails with a 500 (`server.ts:57`) that reads like a regression and is not one.
24. **`pnpm --filter … test:e2e -- <args>`** interposes a literal `--` that Playwright reads as a
    positional argument, so `-g` is silently ignored and the whole file runs. Use `npx playwright
    test` from the app directory for filtered runs.
25. **When one wave waits on another, poll `git ls-remote origin main` for the merge subject**, not
    a ship-report path. Reports are written inside throwaway merge-to-main worktrees and reach
    `origin/main` before — or instead of — the shared checkout.
26. **A parallel Prettier drift exists across the client Threshold files and A3's
    `use-room-concept-render.ts`.** All pre-existing, all advisory. There is no root Prettier config
    outside `services/media` and `services/projects`; that is the actual fix.

### Worktrees to sweep

`scripts/repo-gc.sh` (dry-run first). Every branch below **except `portal-polish/d8`** is pushed to
origin and an ancestor of `main`, so nothing here holds unmerged work.

| Worktree | Branch | Note |
|---|---|---|
| `.codex/worktrees/agent-pp-a1` · `agent-pp-a2` | `portal-polish/a1` · `a2` | W1 lanes |
| `.codex/worktrees/agent-pp-h1` … `agent-pp-h6` | `portal-polish/h1` … `h6` | W2 lanes |
| `.codex/worktrees/agent-pp-int` | `portal-polish/integration` | W2 integration |
| `.codex/worktrees/agent-pp-h7` | `portal-polish/h7` | W2b lane |
| `.codex/worktrees/agent-pp-int2b` | `portal-polish/integration-w2b` | W2b integration |
| `.codex/worktrees/agent-pp-h8` | `portal-polish/h8` | W2c lane |
| `.codex/worktrees/agent-pp-int2c` | `portal-polish/integration-w2c` | W2c integration; holds the prod `.open-next` build |
| `.codex/worktrees/agent-pp-d1` … `agent-pp-d6` | `portal-polish/d1` … `d6` | W3 lanes |
| `.codex/worktrees/agent-pp-int3` | `portal-polish/integration-w3` | W3 integration; holds the prod `.next` build |
| `.codex/worktrees/agent-pp-a3` · `agent-pp-d7` | `portal-polish/a3` · `d7` | W3b lanes |
| `.codex/worktrees/agent-pp-int3b` | `portal-polish/integration-w3b` | W3b integration; holds the prod `.next` build |
| `.codex/worktrees/agent-pp-d8` | `portal-polish/d8` | W3c lane — **now merged and safe to sweep** (W2c's DO-NOT-SWEEP note is retired) |
| `.codex/worktrees/agent-pp-int3c` | `portal-polish/integration-w3c` | W3c integration; holds the prod `.open-next` build |

**All 25 `agent-pp-*` worktrees on disk, for the sweep** (`scripts/repo-gc.sh`, dry-run first):
`agent-pp-a1` `a2` `a3` · `agent-pp-h1` `h2` `h3` `h4` `h5` `h6` `h7` `h8` ·
`agent-pp-d1` `d2` `d3` `d4` `d5` `d6` `d7` `d8` ·
`agent-pp-int` `int2b` `int2c` `int3` `int3b` `int3c`.
**Every one of their branches is pushed and an ancestor of `main` — nothing on disk holds unmerged
work.** `int2c`, `int3` and `int3c` hold prod builds; sweep them last if a rollback rebuild is
wanted.

Already removed, each after its push: `agent-pp-main` (W2) · `agent-pp-main2b` (W2b) ·
`agent-pp-main2c` (W2c) · `agent-pp-main3` (W3) · `agent-pp-main3b` (W3b) · `agent-pp-main3c` (W3c).

### The header of this report is five waves stale

§1–§5 were written when the program was three waves and `main` was `99906f992`. It is now **seven
shipped waves** — W1 · W2 · W3 · W2b · W3b · W2c · W3c — and `main` is **`66a54ba00`**. The original
text is left in place rather than rewritten, so the record of what each wave reported at the time
stays readable; §6, §7 and this section carry the corrections.

### Where the program ended

Both portals are live from `main` at `66a54ba00`: `patina-client-portal`
`6f8adbb5-c024-4f25-bebd-070ee18924e1` and `patina-designer-portal`
`cfa89e71-3d30-4723-9b08-6a7c99c9c21c`. One migration, `00580`, pushed in W1 and never revised.
No suite was lost across seven waves, no lint count grew, no `box-shadow` was added, and the shadow
gate is byte-identical to where it started. The last wave's contribution to that record is the one
kind of evidence the other six could not produce: a real object, written into a real bucket through
a real session, and taken back out.
