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
